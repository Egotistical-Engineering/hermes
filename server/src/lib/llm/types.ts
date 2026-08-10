/**
 * Provider-agnostic LLM abstraction for the assistant route.
 *
 * Captures exactly what routes/assistant.ts needs from a model:
 *  - streamed text deltas
 *  - completed tool calls (name + parsed JSON input)
 *  - a multi-round tool loop (stream → execute tools → feed results → stream again)
 *  - token usage per round
 *
 * Implementations: anthropic.ts (Messages API) and openai.ts (Chat Completions).
 */

/** Tool definition in Anthropic shape — the shape the rest of the server
 *  (mcp.ts, assistant.ts) already uses. Providers translate as needed. */
export type LlmTool = {
  name: string;
  description?: string;
  input_schema: { type: 'object'; [key: string]: unknown };
};

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type LlmToolCall = {
  /** Provider-assigned id, echoed back in the matching tool result. */
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type LlmStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; call: LlmToolCall };

export type LlmUsage = { inputTokens: number; outputTokens: number };

export type LlmRoundResult = {
  /** 'tool_use' → the model wants tool results and another round; 'end' → done. */
  stopReason: 'tool_use' | 'end';
  usage: LlmUsage | null;
};

export type LlmToolResult = {
  toolCallId: string;
  content: string;
  isError: boolean;
};

export type LlmConversationOptions = {
  system: string;
  messages: ChatTurn[];
  tools: LlmTool[];
  maxTokens: number;
  temperature: number;
};

export interface LlmConversation {
  /**
   * Stream one model round. Yields text deltas and completed tool calls;
   * returns the round's stop reason + usage. Abort via `signal` (per-round
   * timeout lives in the caller).
   */
  streamRound(signal: AbortSignal): AsyncGenerator<LlmStreamEvent, LlmRoundResult>;

  /**
   * Append tool results for the tool calls yielded by the previous round.
   * Must be called (with one result per tool call) before the next
   * streamRound() when the previous round stopped with 'tool_use'.
   */
  addToolResults(results: LlmToolResult[]): void;
}

export interface LlmProvider {
  readonly name: 'anthropic' | 'openai';
  createConversation(opts: LlmConversationOptions): LlmConversation;
}
