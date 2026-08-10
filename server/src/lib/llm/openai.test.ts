import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createMock } };
  },
}));

import { openaiProvider, aliasToolName } from './openai.js';
import type { LlmConversationOptions, LlmRoundResult, LlmStreamEvent } from './types.js';

function baseOpts(overrides: Partial<LlmConversationOptions> = {}): LlmConversationOptions {
  return {
    system: 'You are a test assistant.',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
    maxTokens: 1024,
    temperature: 0.7,
    ...overrides,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function streamOf(chunks: any[]): AsyncIterable<any> {
  return (async function* () {
    for (const c of chunks) yield c;
  })();
}

function textChunk(content: string) {
  return { choices: [{ delta: { content }, finish_reason: null }] };
}

function toolChunk(index: number, id: string | null, name: string | null, args: string | null) {
  return {
    choices: [{
      delta: {
        tool_calls: [{
          index,
          ...(id ? { id } : {}),
          function: {
            ...(name ? { name } : {}),
            ...(args ? { arguments: args } : {}),
          },
        }],
      },
      finish_reason: null,
    }],
  };
}

function finishChunk(reason: string) {
  return { choices: [{ delta: {}, finish_reason: reason }] };
}

async function drain(gen: AsyncGenerator<LlmStreamEvent, LlmRoundResult>) {
  const events: LlmStreamEvent[] = [];
  for (;;) {
    const step = await gen.next();
    if (step.done) return { events, result: step.value };
    events.push(step.value);
  }
}

beforeEach(() => {
  createMock.mockReset();
});

describe('OpenAIConversation streamRound', () => {
  it('streams text and returns end for a well-formed round', async () => {
    createMock.mockResolvedValueOnce(streamOf([
      textChunk('Hello '),
      textChunk('world'),
      finishChunk('stop'),
      { choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } },
    ]));

    const convo = openaiProvider.createConversation(baseOpts());
    const { events, result } = await drain(convo.streamRound(new AbortController().signal));

    expect(events).toEqual([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'world' },
    ]);
    expect(result).toEqual({ stopReason: 'end', usage: { inputTokens: 12, outputTokens: 3 } });
  });

  it('throws on malformed tool-call JSON instead of substituting {}', async () => {
    createMock.mockResolvedValueOnce(streamOf([
      toolChunk(0, 'call_1', 'add_highlight', '{"type": "quest'),
      finishChunk('tool_calls'),
    ]));

    const convo = openaiProvider.createConversation(baseOpts());
    await expect(drain(convo.streamRound(new AbortController().signal)))
      .rejects.toThrow('Malformed tool arguments from model');
  });

  it('throws an AbortError when the signal fires and the stream ends silently', async () => {
    const controller = new AbortController();
    createMock.mockResolvedValueOnce((async function* () {
      yield textChunk('partial resp');
      controller.abort();
      // Stream ends without error — simulates the SDK swallowing the abort.
    })());

    const convo = openaiProvider.createConversation(baseOpts());
    await expect(drain(convo.streamRound(controller.signal)))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('normalizes SDK abort errors thrown mid-stream to AbortError', async () => {
    const controller = new AbortController();
    createMock.mockResolvedValueOnce((async function* () {
      yield textChunk('partial');
      controller.abort();
      throw Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' });
    })());

    const convo = openaiProvider.createConversation(baseOpts());
    await expect(drain(convo.streamRound(controller.signal)))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('normalizes an abort during request creation to AbortError', async () => {
    const controller = new AbortController();
    controller.abort();
    createMock.mockRejectedValueOnce(
      Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' }),
    );

    const convo = openaiProvider.createConversation(baseOpts());
    await expect(drain(convo.streamRound(controller.signal)))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('round-trips long tool names through the alias map', async () => {
    const longName = `mcp__a-user-mcp-server-with-a-long-name__${'search_documents_'.repeat(3)}v2`;
    expect(longName.length).toBeGreaterThan(64);
    const alias = aliasToolName(longName);

    createMock.mockResolvedValueOnce(streamOf([
      toolChunk(0, 'call_1', alias, '{"query": "hi"}'),
      finishChunk('tool_calls'),
    ]));

    const convo = openaiProvider.createConversation(baseOpts({
      tools: [
        { name: 'add_highlight', input_schema: { type: 'object' } },
        { name: longName, input_schema: { type: 'object' } },
      ],
    }));
    const { events, result } = await drain(convo.streamRound(new AbortController().signal));

    // The request carried only valid function names (aliases for long ones).
    const sentTools = createMock.mock.calls[0][0].tools;
    expect(sentTools.map((t: any) => t.function.name)).toEqual(['add_highlight', alias]);
    for (const t of sentTools) {
      expect(t.function.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }

    // The yielded tool call carries the REAL name so mcpManager resolves it.
    expect(events).toEqual([
      { type: 'tool_call', call: { id: 'call_1', name: longName, input: { query: 'hi' } } },
    ]);
    expect(result.stopReason).toBe('tool_use');

    // The assistant replay message must echo the alias (wire name), or
    // OpenAI's name validation would reject the follow-up request.
    convo.addToolResults([{ toolCallId: 'call_1', content: 'found 3 docs', isError: false }]);
    createMock.mockResolvedValueOnce(streamOf([textChunk('Done.'), finishChunk('stop')]));
    await drain(convo.streamRound(new AbortController().signal));

    const secondMessages = createMock.mock.calls[1][0].messages;
    const assistantMsg = secondMessages.find((m: any) => m.role === 'assistant' && m.tool_calls);
    expect(assistantMsg.tool_calls).toEqual([
      { id: 'call_1', type: 'function', function: { name: alias, arguments: '{"query":"hi"}' } },
    ]);
    const toolMsg = secondMessages.find((m: any) => m.role === 'tool');
    expect(toolMsg).toMatchObject({ tool_call_id: 'call_1', content: 'found 3 docs' });
  });

  it('leaves short tool names un-aliased end to end', async () => {
    createMock.mockResolvedValueOnce(streamOf([
      toolChunk(0, 'call_9', 'add_highlight', '{"type":"question","matchText":"x","comment":"y"}'),
      finishChunk('tool_calls'),
    ]));

    const convo = openaiProvider.createConversation(baseOpts({
      tools: [{ name: 'add_highlight', input_schema: { type: 'object' } }],
    }));
    const { events, result } = await drain(convo.streamRound(new AbortController().signal));

    expect(createMock.mock.calls[0][0].tools[0].function.name).toBe('add_highlight');
    expect(events).toEqual([
      {
        type: 'tool_call',
        call: { id: 'call_9', name: 'add_highlight', input: { type: 'question', matchText: 'x', comment: 'y' } },
      },
    ]);
    expect(result.stopReason).toBe('tool_use');
  });
});
