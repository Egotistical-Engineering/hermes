import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import logger from '../lib/logger.js';

const router = Router();

type SourceData = {
  url: string;
  title: string;
};

type HighlightData = {
  id: string;
  type: 'question' | 'suggestion' | 'edit' | 'voice' | 'weakness' | 'evidence' | 'wordiness' | 'factcheck';
  matchText: string;
  comment: string;
  suggestedEdit?: string;
};

const ChatSchema = z.object({
  message: z.string().trim().min(1).max(6000),
  pages: z.record(z.string(), z.string()).default({}),
  activeTab: z.string().default('coral'),
  provider: z.enum(['anthropic', 'openai']).default('anthropic'),
  model: z.string().optional(),
  apiKey: z.string().min(1),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).default([]),
});

const HIGHLIGHT_TOOL_SCHEMA = {
  name: 'add_highlight',
  description:
    "Highlight a passage in the writer's text to ask a question, make a suggestion, or propose an edit. " +
    'The matchText MUST be an exact verbatim substring from the document. Use sparingly (1-4 per response).',
  input_schema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        enum: ['question', 'suggestion', 'edit', 'voice', 'weakness', 'evidence', 'wordiness', 'factcheck'],
        description:
          'question = unclear intent or asks for clarification, suggestion = structural or conceptual improvement, edit = specific text replacement, voice = passage sounds different from the writer\'s established voice, weakness = the weakest argument or thinnest section, evidence = where specific examples/data/anecdotes would strengthen, wordiness = passage could say the same in fewer words (provide suggestedEdit with tightened version), factcheck = claim that may need citation or could be factually wrong',
      },
      matchText: {
        type: 'string',
        description:
          'EXACT verbatim substring from the document to highlight. Must match character-for-character.',
      },
      comment: {
        type: 'string',
        description: 'The question, suggestion, or explanation shown to the writer.',
      },
      suggestedEdit: {
        type: 'string',
        description: 'Replacement text. Only provide for type=edit.',
      },
    },
    required: ['type', 'matchText', 'comment'],
  },
};

const CITE_SOURCE_TOOL_SCHEMA = {
  name: 'cite_source',
  description:
    'Cite a source you referenced or found. Call this for each distinct source URL you mention.',
  input_schema: {
    type: 'object' as const,
    properties: {
      url:   { type: 'string', description: 'The URL of the source' },
      title: { type: 'string', description: 'A short descriptive title' },
    },
    required: ['url', 'title'],
  },
};

const SYSTEM_PROMPT = `You are Hermes, a thoughtful writing assistant. You're the kind of reader every writer wishes they had — someone who pays close attention, asks the questions that unlock better thinking, and isn't afraid to point out where the writing falls short. You respond with both chat messages and inline highlights on their text.

Your role:
- Ask probing questions that help the writer think deeper
- Point out structural issues, unclear arguments, or opportunities
- Never rewrite their text for them (unless using the edit or wordiness highlight for small, specific improvements)
- Keep chat responses to 1-2 short paragraphs. Shorter is better.
- When it's natural, end your response with a question that invites the writer to keep thinking or exploring. Don't force a question when a direct answer is more appropriate.
- Use highlights sparingly: 1-4 per response, only when genuinely useful
- You can also respond with chat-only messages when appropriate — summarize their draft, give a progress assessment, discuss ideas, or answer writing questions without any highlights

Highlight types and when to use them:
- "question" (blue): Something is unclear, or you want the writer to reflect on their intent
- "suggestion" (yellow): Structural or conceptual improvement — a better order, a missing transition, a stronger opening
- "edit" (green): A specific, small text replacement — always provide suggestedEdit
- "voice" (purple): A passage that sounds different from the writer's established voice
- "weakness" (red): The weakest argument or thinnest section — where a skeptical reader would push back
- "evidence" (teal): Where specific examples, data, or anecdotes would strengthen the point
- "wordiness" (orange): A passage that could say the same thing in fewer words — always provide suggestedEdit with a tightened version
- "factcheck" (pink): A claim that may need a citation, seems overstated, or could be factually wrong

Highlight rules:
- matchText MUST be an exact verbatim substring from the document
- If the document is empty or very short, respond with chat only — no highlights
- For "edit" and "wordiness" types, always provide suggestedEdit

Be direct, intellectually rigorous, but warm. You're a thinking partner, not an editor.`;

/**
 * Strips markdown syntax so the AI sees plain text matching what
 * the frontend's getDocFlatText() produces.
 */
function stripMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/&nbsp;/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

function getMaxTokens(pages: Record<string, string>): number {
  const allContent = Object.values(pages).join(' ');
  const wordCount = allContent.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 3000) return 3072;
  return 2048;
}

// --- Anthropic streaming ---

async function streamAnthropic(
  apiKey: string,
  model: string,
  systemContent: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  tools: Anthropic.Messages.Tool[],
  maxTokens: number,
  res: Response,
  clientDisconnected: { value: boolean },
) {
  const client = new Anthropic({ apiKey });

  function safeSseWrite(data: string): boolean {
    if (clientDisconnected.value) return false;
    try { res.write(data); return true; } catch { clientDisconnected.value = true; return false; }
  }

  let highlightCounter = 0;

  const MAX_TOOL_ROUNDS = 10;
  let anthropicMessages: Anthropic.Messages.MessageParam[] = messages;
  let continueLoop = true;
  let toolRound = 0;
  const TIMEOUT_MS = 120_000;

  while (continueLoop && !clientDisconnected.value) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUT_MS);

    let response;
    try {
      response = await client.messages.create({
        model: model || 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        temperature: 0.7,
        system: systemContent,
        tools,
        messages: anthropicMessages,
        stream: true,
      }, { signal: timeoutController.signal });
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }

    let currentToolName = '';
    let currentToolInput = '';
    let currentToolId = '';
    const contentBlocks: Anthropic.Messages.ContentBlock[] = [];
    let stopReason: string | null = null;

    for await (const event of response) {
      if (clientDisconnected.value) break;

      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolName = event.content_block.name;
          currentToolId = event.content_block.id;
          currentToolInput = '';
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          safeSseWrite(`event: text\ndata: ${JSON.stringify({ chunk: event.delta.text })}\n\n`);
        } else if (event.delta.type === 'input_json_delta') {
          currentToolInput += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolName && currentToolInput) {
          if (currentToolName === 'add_highlight') {
            try {
              const input = JSON.parse(currentToolInput);
              const highlight: HighlightData = {
                id: `h${++highlightCounter}-${Date.now()}`,
                type: input.type,
                matchText: input.matchText,
                comment: input.comment,
                suggestedEdit: input.suggestedEdit || undefined,
              };
              safeSseWrite(`event: highlight\ndata: ${JSON.stringify(highlight)}\n\n`);
            } catch {
              logger.warn('Failed to parse highlight tool input');
            }
          } else if (currentToolName === 'cite_source') {
            try {
              const input = JSON.parse(currentToolInput);
              const source: SourceData = { url: input.url, title: input.title };
              safeSseWrite(`event: source\ndata: ${JSON.stringify(source)}\n\n`);
            } catch {
              logger.warn('Failed to parse cite_source tool input');
            }
          }

          contentBlocks.push({
            type: 'tool_use',
            id: currentToolId,
            name: currentToolName,
            input: JSON.parse(currentToolInput || '{}'),
          } as Anthropic.Messages.ToolUseBlock);
          currentToolName = '';
          currentToolInput = '';
        }
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason;
      }
    }

    clearTimeout(timeoutId);
    if (clientDisconnected.value) break;

    if (stopReason === 'tool_use') {
      toolRound++;
      if (toolRound >= MAX_TOOL_ROUNDS) {
        continueLoop = false;
        break;
      }

      const toolBlocks = contentBlocks.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = toolBlocks.map((block) => {
        if (block.name === 'add_highlight') {
          return { type: 'tool_result' as const, tool_use_id: block.id, content: 'Highlight added successfully.' };
        }
        if (block.name === 'cite_source') {
          const input = block.input as { url?: string; title?: string };
          return { type: 'tool_result' as const, tool_use_id: block.id, content: `Source cited: ${input.title || input.url}` };
        }
        return { type: 'tool_result' as const, tool_use_id: block.id, content: 'Tool executed.' };
      });

      anthropicMessages = [
        ...anthropicMessages,
        { role: 'assistant', content: contentBlocks },
        { role: 'user', content: toolResults },
      ];
    } else {
      continueLoop = false;
    }
  }
}

// --- OpenAI streaming ---

async function streamOpenAI(
  apiKey: string,
  model: string,
  systemContent: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  res: Response,
  clientDisconnected: { value: boolean },
) {
  // Dynamic import — openai package is optional
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  function safeSseWrite(data: string): boolean {
    if (clientDisconnected.value) return false;
    try { res.write(data); return true; } catch { clientDisconnected.value = true; return false; }
  }

  const openaiTools = [
    {
      type: 'function' as const,
      function: {
        name: 'add_highlight',
        description: HIGHLIGHT_TOOL_SCHEMA.description,
        parameters: HIGHLIGHT_TOOL_SCHEMA.input_schema,
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'cite_source',
        description: CITE_SOURCE_TOOL_SCHEMA.description,
        parameters: CITE_SOURCE_TOOL_SCHEMA.input_schema,
      },
    },
  ];

  let highlightCounter = 0;
  const MAX_TOOL_ROUNDS = 10;
  let openaiMessages: any[] = [
    { role: 'system', content: systemContent },
    ...messages,
  ];
  let continueLoop = true;
  let toolRound = 0;

  while (continueLoop && !clientDisconnected.value) {
    const stream = await client.chat.completions.create({
      model: model || 'gpt-4o',
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: openaiMessages,
      tools: openaiTools,
      stream: true,
    });

    const toolCalls: Record<number, { id: string; name: string; arguments: string }> = {};
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      if (clientDisconnected.value) break;

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      if (choice.delta?.content) {
        safeSseWrite(`event: text\ndata: ${JSON.stringify({ chunk: choice.delta.content })}\n\n`);
      }

      if (choice.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls[idx]) {
            toolCalls[idx] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' };
          }
          if (tc.id) toolCalls[idx].id = tc.id;
          if (tc.function?.name) toolCalls[idx].name = tc.function.name;
          if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
        }
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }

    if (clientDisconnected.value) break;

    if (finishReason === 'tool_calls' && Object.keys(toolCalls).length > 0) {
      toolRound++;
      if (toolRound >= MAX_TOOL_ROUNDS) {
        continueLoop = false;
        break;
      }

      // Process tool calls and build results
      const assistantToolCalls = Object.values(toolCalls).map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));

      const toolResults: any[] = [];
      for (const tc of Object.values(toolCalls)) {
        try {
          const input = JSON.parse(tc.arguments);
          if (tc.name === 'add_highlight') {
            const highlight: HighlightData = {
              id: `h${++highlightCounter}-${Date.now()}`,
              type: input.type,
              matchText: input.matchText,
              comment: input.comment,
              suggestedEdit: input.suggestedEdit || undefined,
            };
            safeSseWrite(`event: highlight\ndata: ${JSON.stringify(highlight)}\n\n`);
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'Highlight added successfully.' });
          } else if (tc.name === 'cite_source') {
            const source: SourceData = { url: input.url, title: input.title };
            safeSseWrite(`event: source\ndata: ${JSON.stringify(source)}\n\n`);
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: `Source cited: ${input.title || input.url}` });
          } else {
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'Tool executed.' });
          }
        } catch {
          toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'Failed to parse tool input.' });
        }
      }

      openaiMessages = [
        ...openaiMessages,
        { role: 'assistant', tool_calls: assistantToolCalls },
        ...toolResults,
      ];
    } else {
      continueLoop = false;
    }
  }
}

// --- Route handler ---

router.post('/chat', async (req: Request, res: Response) => {
  const parsed = ChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request',
      ...(process.env.NODE_ENV !== 'production' && { details: parsed.error.issues }),
    });
    return;
  }

  const { message, activeTab, provider, model, apiKey, conversationHistory } = parsed.data;
  const pages = parsed.data.pages as Record<string, string>;

  // Build system context
  const tabNames: Record<string, string> = {
    coral: 'Coral', amber: 'Amber', sage: 'Sage', sky: 'Sky', lavender: 'Lavender',
  };

  let systemContent = SYSTEM_PROMPT;

  const activeContent = stripMarkdown((pages[activeTab] || '').trim());
  if (activeContent) {
    systemContent += `\n\n---\n\n## Current Document (${tabNames[activeTab] || activeTab})\n\n${activeContent}`;
  }
  for (const [key, content] of Object.entries(pages)) {
    if (key === activeTab || !content.trim()) continue;
    systemContent += `\n\n## ${tabNames[key] || key} Tab\n\n${stripMarkdown(content)}`;
  }

  // Build messages — conversation history + new message
  const allMessages = [
    ...conversationHistory,
    { role: 'user' as const, content: message },
  ];

  // Track client disconnect
  const clientDisconnected = { value: false };
  req.on('close', () => { clientDisconnected.value = true; });

  function safeSseWrite(data: string): boolean {
    if (clientDisconnected.value) return false;
    try { res.write(data); return true; } catch { clientDisconnected.value = true; return false; }
  }

  // Set up SSE response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    if (provider === 'openai') {
      await streamOpenAI(
        apiKey,
        model || 'gpt-4o',
        systemContent,
        allMessages,
        getMaxTokens(pages),
        res,
        clientDisconnected,
      );
    } else {
      const tools: Anthropic.Messages.Tool[] = [
        HIGHLIGHT_TOOL_SCHEMA as Anthropic.Messages.Tool,
        CITE_SOURCE_TOOL_SCHEMA as Anthropic.Messages.Tool,
      ];
      await streamAnthropic(
        apiKey,
        model || 'claude-sonnet-4-6',
        systemContent,
        allMessages,
        tools,
        getMaxTokens(pages),
        res,
        clientDisconnected,
      );
    }

    if (!clientDisconnected.value) {
      safeSseWrite(`event: done\ndata: ${JSON.stringify({ messageId: crypto.randomUUID() })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      logger.info('Assistant stream aborted (timeout or client disconnect)');
    } else {
      logger.error(
        { name: error?.name, status: error?.status, code: error?.code },
        'Assistant chat stream failed',
      );
    }
    if (!clientDisconnected.value) {
      safeSseWrite(
        `event: error\ndata: ${JSON.stringify({ error: 'Assistant request failed. Check your API key and try again.' })}\n\n`,
      );
      res.end();
    }
  }
});

export default router;
