import { createHash } from 'node:crypto';
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

/** OpenAI validates every tools[].function.name against this pattern and
 *  rejects the ENTIRE request when one name violates it. Namespaced MCP names
 *  (`mcp__<server>__<tool>`) can exceed 64 chars. */
const OPENAI_TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const ALIAS_PREFIX_LEN = 56;

/**
 * Deterministic OpenAI-safe alias for a tool name. Valid names pass through
 * untouched; overlong or invalid-charactered names become
 * `<sanitized 56-char prefix>_<7-char sha256 of the full name>` (≤ 64 chars),
 * so two distinct long names stay distinct even when they share a prefix.
 */
export function aliasToolName(name: string): string {
  if (OPENAI_TOOL_NAME_RE.test(name)) return name;
  const hash = createHash('sha256').update(name).digest('hex').slice(0, 7);
  const prefix = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, ALIAS_PREFIX_LEN);
  return `${prefix}_${hash}`;
}

/**
 * Translate Anthropic-shaped tools ({name, description, input_schema})
 * to OpenAI function tools ({type:'function', function:{name, description, parameters}}).
 * Names that violate OpenAI's function-name constraints are emitted as
 * deterministic aliases (see aliasToolName); the conversation maps aliases
 * back to real names before yielding tool calls.
 */
export function translateTools(tools: LlmTool[]): OpenAI.Chat.Completions.ChatCompletionFunctionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: aliasToolName(t.name),
      description: t.description ?? '',
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

type PendingToolCall = { id: string; name: string; argsJson: string };

/** The call with the real (un-aliased) tool name, plus the wire name the
 *  model actually emitted — the wire name must be replayed in the assistant
 *  message so OpenAI's name validation keeps passing. */
type CompletedToolCall = { call: LlmToolCall; wireName: string };

function finalizeToolCall(pending: PendingToolCall, aliasToReal: Map<string, string>): CompletedToolCall {
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(pending.argsJson || '{}');
  } catch {
    // Parent behavior: a malformed completed tool call aborts the stream
    // (route emits `event: error`, skips persistence) rather than executing
    // the tool with empty args.
    throw new Error('Malformed tool arguments from model');
  }
  return {
    call: { id: pending.id, name: aliasToReal.get(pending.name) ?? pending.name, input },
    wireName: pending.name,
  };
}

/** Error shaped like the standard AbortError so routes/assistant.ts treats a
 *  timed-out round exactly like the Anthropic path: `event: error`, nothing
 *  persisted — never a silent `done` with truncated text. */
function abortError(): Error {
  const err = new Error('LLM round aborted');
  err.name = 'AbortError';
  return err;
}

class OpenAIConversation implements LlmConversation {
  private messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  private tools: OpenAI.Chat.Completions.ChatCompletionFunctionTool[];
  private pendingAssistantMessage: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam | null = null;
  /** alias (wire name sent to OpenAI) → real tool name. Only names that
   *  needed aliasing appear here. */
  private aliasToReal = new Map<string, string>();

  constructor(private opts: LlmConversationOptions) {
    this.messages = [
      { role: 'system', content: opts.system },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    this.tools = translateTools(opts.tools);
    for (const t of opts.tools) {
      const alias = aliasToolName(t.name);
      if (alias !== t.name) this.aliasToReal.set(alias, t.name);
    }
  }

  async *streamRound(signal: AbortSignal): AsyncGenerator<LlmStreamEvent, LlmRoundResult> {
    const model = getModel();
    const reasoning = isReasoningModel(model);

    let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    try {
      stream = await getClient().chat.completions.create(
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
    } catch (err) {
      // Normalize the SDK's APIUserAbortError (name !== 'AbortError') so the
      // route's abort handling runs identically to the Anthropic path.
      if (signal.aborted) throw abortError();
      throw err;
    }

    let fullText = '';
    // Tool calls stream as fragments keyed by index; a call is complete when
    // the next index starts or the stream ends.
    const pendingByIndex = new Map<number, PendingToolCall>();
    const completedCalls: CompletedToolCall[] = [];
    let maxSeenIndex = -1;
    let finishReason: string | null = null;
    let usage: LlmUsage | null = null;

    try {
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
                  const completed = finalizeToolCall(p, this.aliasToReal);
                  completedCalls.push(completed);
                  pendingByIndex.delete(i);
                  yield { type: 'tool_call', call: completed.call };
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
    } catch (err) {
      if (signal.aborted) throw abortError();
      throw err;
    }

    // A fired round-timeout can end the SDK stream without an error — never
    // treat that truncated stream as a normal stop.
    if (signal.aborted) throw abortError();

    // Flush remaining tool calls in index order.
    for (const [, p] of Array.from(pendingByIndex.entries()).sort((a, b) => a[0] - b[0])) {
      const completed = finalizeToolCall(p, this.aliasToReal);
      completedCalls.push(completed);
      yield { type: 'tool_call', call: completed.call };
    }
    pendingByIndex.clear();

    if (finishReason === 'tool_calls' && completedCalls.length > 0) {
      this.pendingAssistantMessage = {
        role: 'assistant',
        ...(fullText ? { content: fullText } : {}),
        tool_calls: completedCalls.map(({ call, wireName }) => ({
          id: call.id,
          type: 'function' as const,
          function: { name: wireName, arguments: JSON.stringify(call.input) },
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
