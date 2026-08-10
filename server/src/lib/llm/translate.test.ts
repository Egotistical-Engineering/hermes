import { describe, it, expect } from 'vitest';
import { aliasToolName, translateTools } from './openai.js';
import type { LlmTool } from './types.js';

describe('translateTools (anthropic → openai tool schema)', () => {
  it('translates name/description/input_schema to function format', () => {
    const tools: LlmTool[] = [
      {
        name: 'add_highlight',
        description: 'Highlight a passage.',
        input_schema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['question', 'edit'] },
            matchText: { type: 'string' },
            comment: { type: 'string' },
            suggestedEdit: { type: 'string' },
          },
          required: ['type', 'matchText', 'comment'],
        },
      },
    ];

    const result = translateTools(tools);

    expect(result).toEqual([
      {
        type: 'function',
        function: {
          name: 'add_highlight',
          description: 'Highlight a passage.',
          parameters: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['question', 'edit'] },
              matchText: { type: 'string' },
              comment: { type: 'string' },
              suggestedEdit: { type: 'string' },
            },
            required: ['type', 'matchText', 'comment'],
          },
        },
      },
    ]);
  });

  it('preserves namespaced MCP tool names and passes schemas through untouched', () => {
    const schema = {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query'],
      additionalProperties: false,
    };
    const [tool] = translateTools([
      { name: 'mcp__arena__search_arena', description: 'Search Are.na', input_schema: schema },
    ]);

    expect(tool.type).toBe('function');
    expect(tool.function.name).toBe('mcp__arena__search_arena');
    // OpenAI requires ^[a-zA-Z0-9_-]{1,64}$ for function names
    expect(tool.function.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(tool.function.parameters).toEqual(schema);
  });

  it('defaults a missing description to an empty string', () => {
    const [tool] = translateTools([{ name: 'no_desc', input_schema: { type: 'object' } }]);
    expect(tool.function.description).toBe('');
    expect(tool.function.parameters).toEqual({ type: 'object' });
  });

  it('translates a list preserving order', () => {
    const result = translateTools([
      { name: 'a', description: '1', input_schema: { type: 'object' } },
      { name: 'b', description: '2', input_schema: { type: 'object' } },
    ]);
    expect(result.map((t) => t.function.name)).toEqual(['a', 'b']);
  });
});

describe('aliasToolName (OpenAI 64-char function-name limit)', () => {
  const OPENAI_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

  it('leaves short valid names untouched', () => {
    expect(aliasToolName('add_highlight')).toBe('add_highlight');
    expect(aliasToolName('mcp__arena__search_arena')).toBe('mcp__arena__search_arena');
    // Exactly 64 chars is still valid — no alias
    const exactly64 = 'a'.repeat(64);
    expect(aliasToolName(exactly64)).toBe(exactly64);
  });

  it('aliases names over 64 chars to a valid, deterministic 64-char name', () => {
    const longName = `mcp__my-very-long-server-name-from-a-user__${'do_the_thing_'.repeat(4)}`;
    expect(longName.length).toBeGreaterThan(64);

    const alias = aliasToolName(longName);
    expect(alias).toMatch(OPENAI_NAME_RE);
    expect(alias.length).toBe(64); // 56-char prefix + '_' + 7-char hash
    expect(alias.startsWith(longName.slice(0, 56))).toBe(true);
    // Deterministic: same input, same alias
    expect(aliasToolName(longName)).toBe(alias);
  });

  it('aliases names with invalid characters', () => {
    const alias = aliasToolName('mcp__server__tool.with.dots');
    expect(alias).toMatch(OPENAI_NAME_RE);
    expect(alias.startsWith('mcp__server__tool_with_dots_')).toBe(true);
  });

  it('produces distinct aliases for two long names sharing a 56-char prefix', () => {
    const sharedPrefix = `mcp__shared-server-name__${'x'.repeat(40)}`;
    expect(sharedPrefix.length).toBeGreaterThanOrEqual(56);
    const a = aliasToolName(`${sharedPrefix}_tool_alpha`);
    const b = aliasToolName(`${sharedPrefix}_tool_beta`);
    expect(a).not.toBe(b);
    expect(a.slice(0, 56)).toBe(b.slice(0, 56)); // prefixes collide, hashes disambiguate
  });

  it('translateTools emits the alias for overlong names', () => {
    const longName = `mcp__user-server__${'tool_segment_'.repeat(5)}end`;
    expect(longName.length).toBeGreaterThan(64);
    const [tool] = translateTools([{ name: longName, input_schema: { type: 'object' } }]);
    expect(tool.function.name).toBe(aliasToolName(longName));
    expect(tool.function.name).toMatch(OPENAI_NAME_RE);
  });
});
