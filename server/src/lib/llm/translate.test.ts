import { describe, it, expect } from 'vitest';
import { translateTools } from './openai.js';
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
