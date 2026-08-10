import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: createMock };
  },
}));

import { anthropicProvider } from './anthropic.js';
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
function streamOf(events: any[]): AsyncIterable<any> {
  return (async function* () {
    for (const e of events) yield e;
  })();
}

const messageStart = { type: 'message_start', message: { usage: { input_tokens: 10 } } };

function textDelta(text: string) {
  return { type: 'content_block_delta', delta: { type: 'text_delta', text } };
}

function toolUseEvents(id: string, name: string, argsJson: string) {
  return [
    { type: 'content_block_start', content_block: { type: 'tool_use', id, name } },
    { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: argsJson } },
    { type: 'content_block_stop' },
  ];
}

function messageDelta(stopReason: string, outputTokens = 5) {
  return { type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: outputTokens } };
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

describe('AnthropicConversation streamRound', () => {
  it('streams text and a completed tool call for a well-formed round', async () => {
    createMock.mockResolvedValueOnce(streamOf([
      messageStart,
      textDelta('Let me highlight that. '),
      ...toolUseEvents('toolu_1', 'add_highlight', '{"type":"question","matchText":"x","comment":"y"}'),
      messageDelta('tool_use'),
    ]));

    const convo = anthropicProvider.createConversation(baseOpts());
    const { events, result } = await drain(convo.streamRound(new AbortController().signal));

    expect(events).toEqual([
      { type: 'text', text: 'Let me highlight that. ' },
      {
        type: 'tool_call',
        call: { id: 'toolu_1', name: 'add_highlight', input: { type: 'question', matchText: 'x', comment: 'y' } },
      },
    ]);
    expect(result).toEqual({ stopReason: 'tool_use', usage: { inputTokens: 10, outputTokens: 5 } });
  });

  it('throws on malformed tool-call JSON instead of substituting {}', async () => {
    createMock.mockResolvedValueOnce(streamOf([
      messageStart,
      ...toolUseEvents('toolu_1', 'add_highlight', '{"type": "quest'),
      messageDelta('tool_use'),
    ]));

    const convo = anthropicProvider.createConversation(baseOpts());
    await expect(drain(convo.streamRound(new AbortController().signal)))
      .rejects.toThrow('Malformed tool arguments from model');
  });

  it('throws an AbortError when the signal fires and the stream ends silently', async () => {
    const controller = new AbortController();
    createMock.mockResolvedValueOnce((async function* () {
      yield messageStart;
      yield textDelta('partial resp');
      controller.abort();
      // Stream ends without error.
    })());

    const convo = anthropicProvider.createConversation(baseOpts());
    await expect(drain(convo.streamRound(controller.signal)))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('normalizes SDK abort errors thrown mid-stream to AbortError', async () => {
    const controller = new AbortController();
    createMock.mockResolvedValueOnce((async function* () {
      yield messageStart;
      yield textDelta('partial');
      controller.abort();
      throw Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' });
    })());

    const convo = anthropicProvider.createConversation(baseOpts());
    await expect(drain(convo.streamRound(controller.signal)))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});
