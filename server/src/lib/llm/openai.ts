import OpenAI from 'openai';
import type {
  LlmConversation,
  LlmConversationOptions,
  LlmProvider,
  LlmRoundResult,
  LlmStreamEvent,
  LlmTool,
  LlmToolCall,
  LlmToolResult,
  LlmUsage,
} from './types.js';

/**
 * OpenAI implementation using the Chat Completions API.
 *
 * Why Chat Completions (not the Responses API): the existing assistant loop is
 * a classic message-array tool loop — stream a round, collect tool calls,
 * append tool results, stream again. Chat Completions maps 1:1 onto that
 * structure (`messages` + `tools` + `finish_reason: 'tool_calls'` +
 * `role: 'tool'` results), so the multi-round state lives in a plain message
 * array exactly like the Anthropic implementation. The Responses API's
 * item-based conversation state would add a second bookkeeping model for no
 * gain here.
 */

const DEFAULT_MODEL = 'gpt-5-mini';

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

function getModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

/** Reasoning models reject `temperature` and want minimal reasoning effort
 *  for a low-latency chat assistant. */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/.test(model);
}

/**
 * Translate Anthropic-shaped tools ({name, description, input_schema})
 * to OpenAI function tools ({type:'function', function:{name, description, parameters}}).
 */
export function translateTools(tools: LlmTool[]): OpenAI.Chat.Completions.ChatCompletionFunctionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

type PendingToolCall = { id: string; name: string; argsJson: string };

function finalizeToolCall(pending: PendingToolCall): LlmToolCall {
  let input: Record<string, unknown> = {};
  try {
    input = JSON.parse(pending.argsJson || '{}');
  } catch {
    input = {};
  }
  return { id: pending.id, name: pending.name, input };
}

class OpenAIConversation implements LlmConversation {
  private messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  private tools: OpenAI.Chat.Completions.ChatCompletionFunctionTool[];
  private pendingAssistantMessage: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam | null = null;

  constructor(private opts: LlmConversationOptions) {
    this.messages = [
      { role: 'system', content: opts.system },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    this.tools = translateTools(opts.tools);
  }

  async *streamRound(signal: AbortSignal): AsyncGenerator<LlmStreamEvent, LlmRoundResult> {
    const model = getModel();
    const reasoning = isReasoningModel(model);

    const stream = await getClient().chat.completions.create(
      {
        model,
        messages: this.messages,
        ...(this.tools.length > 0 ? { tools: this.tools } : {}),
        max_completion_tokens: this.opts.maxTokens,
        // Reasoning models (gpt-5*, o*) only accept the default temperature,
        // and reasoning tokens count against max_completion_tokens — keep
        // effort minimal so the budget goes to visible output.
        ...(reasoning ? { reasoning_effort: 'minimal' as const } : { temperature: this.opts.temperature }),
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal },
    );

    let fullText = '';
    // Tool calls stream as fragments keyed by index; a call is complete when
    // the next index starts or the stream ends.
    const pendingByIndex = new Map<number, PendingToolCall>();
    const completedCalls: LlmToolCall[] = [];
    let maxSeenIndex = -1;
    let finishReason: string | null = null;
    let usage: LlmUsage | null = null;

    for await (const chunk of stream) {
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (delta?.content) {
        fullText += delta.content;
        yield { type: 'text', text: delta.content };
      }
      for (const tc of delta?.tool_calls ?? []) {
        const index = tc.index;
        let pending = pendingByIndex.get(index);
        if (!pending) {
          // New call starting — earlier indices are complete, yield them now
          // so tool events stream progressively in multi-tool rounds.
          if (index > maxSeenIndex) {
            for (const [i, p] of Array.from(pendingByIndex.entries()).sort((a, b) => a[0] - b[0])) {
              if (i < index) {
                const call = finalizeToolCall(p);
                completedCalls.push(call);
                pendingByIndex.delete(i);
                yield { type: 'tool_call', call };
              }
            }
            maxSeenIndex = index;
          }
          pending = { id: tc.id || `call_${index}`, name: '', argsJson: '' };
          pendingByIndex.set(index, pending);
        }
        if (tc.id) pending.id = tc.id;
        if (tc.function?.name) pending.name += tc.function.name;
        if (tc.function?.arguments) pending.argsJson += tc.function.arguments;
      }
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }

    // Flush remaining tool calls in index order.
    for (const [, p] of Array.from(pendingByIndex.entries()).sort((a, b) => a[0] - b[0])) {
      const call = finalizeToolCall(p);
      completedCalls.push(call);
      yield { type: 'tool_call', call };
    }
    pendingByIndex.clear();

    if (finishReason === 'tool_calls' && completedCalls.length > 0) {
      this.pendingAssistantMessage = {
        role: 'assistant',
        ...(fullText ? { content: fullText } : {}),
        tool_calls: completedCalls.map((c) => ({
          id: c.id,
          type: 'function' as const,
          function: { name: c.name, arguments: JSON.stringify(c.input) },
        })),
      };
      return { stopReason: 'tool_use', usage };
    }

    return { stopReason: 'end', usage };
  }

  addToolResults(results: LlmToolResult[]): void {
    if (this.pendingAssistantMessage) {
      this.messages.push(this.pendingAssistantMessage);
      this.pendingAssistantMessage = null;
    }
    for (const r of results) {
      this.messages.push({
        role: 'tool',
        tool_call_id: r.toolCallId,
        // Chat Completions has no is_error flag on tool results — surface
        // failures in the content so the model can react.
        content: r.isError ? `[tool error] ${r.content}` : r.content,
      });
    }
  }
}

export const openaiProvider: LlmProvider = {
  name: 'openai',
  createConversation(opts: LlmConversationOptions): LlmConversation {
    return new OpenAIConversation(opts);
  },
};
