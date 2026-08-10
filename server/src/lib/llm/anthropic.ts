import Anthropic from '@anthropic-ai/sdk';
import type {
  LlmConversation,
  LlmConversationOptions,
  LlmProvider,
  LlmRoundResult,
  LlmStreamEvent,
  LlmToolResult,
  LlmUsage,
} from './types.js';

const MODEL = 'claude-sonnet-4-6';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Anthropic Messages API implementation — a direct extraction of the
 * streaming tool loop that previously lived inline in routes/assistant.ts.
 */
class AnthropicConversation implements LlmConversation {
  private messages: Anthropic.Messages.MessageParam[];
  /** tool_use blocks from the last round, replayed as the assistant turn
   *  when tool results come back (matches the previous inline behavior:
   *  only tool_use blocks are echoed, not text). */
  private pendingToolBlocks: Anthropic.Messages.ToolUseBlock[] = [];

  constructor(private opts: LlmConversationOptions) {
    this.messages = opts.messages.map((m) => ({ role: m.role, content: m.content }));
  }

  async *streamRound(signal: AbortSignal): AsyncGenerator<LlmStreamEvent, LlmRoundResult> {
    const response = await getClient().messages.create(
      {
        model: MODEL,
        max_tokens: this.opts.maxTokens,
        temperature: this.opts.temperature,
        system: this.opts.system,
        tools: this.opts.tools as Anthropic.Messages.Tool[],
        messages: this.messages,
        stream: true,
      },
      { signal },
    );

    let currentToolName = '';
    let currentToolId = '';
    let currentToolInput = '';
    let inToolBlock = false;
    const toolBlocks: Anthropic.Messages.ToolUseBlock[] = [];
    let stopReason: string | null = null;
    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

    for await (const event of response) {
      if (event.type === 'message_start') {
        usage.inputTokens = event.message.usage?.input_tokens ?? 0;
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          inToolBlock = true;
          currentToolName = event.content_block.name;
          currentToolId = event.content_block.id;
          currentToolInput = '';
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          currentToolInput += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (inToolBlock && currentToolName) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(currentToolInput || '{}');
          } catch {
            input = {};
          }
          toolBlocks.push({
            type: 'tool_use',
            id: currentToolId,
            name: currentToolName,
            input,
          } as Anthropic.Messages.ToolUseBlock);
          yield { type: 'tool_call', call: { id: currentToolId, name: currentToolName, input } };
          inToolBlock = false;
          currentToolName = '';
          currentToolInput = '';
        }
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason;
        if (event.usage?.output_tokens != null) {
          usage.outputTokens = event.usage.output_tokens;
        }
      }
    }

    if (stopReason === 'tool_use') {
      this.pendingToolBlocks = toolBlocks;
      return { stopReason: 'tool_use', usage };
    }
    return { stopReason: 'end', usage };
  }

  addToolResults(results: LlmToolResult[]): void {
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = results.map((r) => ({
      type: 'tool_result',
      tool_use_id: r.toolCallId,
      content: r.content,
      ...(r.isError ? { is_error: true } : {}),
    }));
    this.messages = [
      ...this.messages,
      { role: 'assistant', content: this.pendingToolBlocks },
      { role: 'user', content: toolResults },
    ];
    this.pendingToolBlocks = [];
  }
}

export const anthropicProvider: LlmProvider = {
  name: 'anthropic',
  createConversation(opts: LlmConversationOptions): LlmConversation {
    return new AnthropicConversation(opts);
  },
};
