import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { checkMessageLimit } from '../middleware/usageGate.js';
import logger from '../lib/logger.js';
import { mcpManager } from '../lib/mcp.js';
import { isAdminUser } from '../lib/config.js';
import type { UserMcpServerConfig } from '../lib/mcp.js';

const router = Router();

const anthro = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

type SourceData = {
  url: string;
  title: string;
};

type AssistantMessage = {
  role: 'user' | 'assistant';
  content: string;
  highlights?: HighlightData[];
  sources?: SourceData[];
  timestamp: string;
};

type HighlightData = {
  id: string;
  type: 'question' | 'suggestion' | 'edit' | 'voice' | 'weakness' | 'evidence' | 'wordiness' | 'factcheck';
  matchText: string;
  comment: string;
  suggestedEdit?: string;
};

const ChatSchema = z.object({
  projectId: z.string().uuid(),
  message: z.string().trim().min(1).max(6000),
  pages: z.record(z.string(), z.string()).default({}),
  activeTab: z.string().default('coral'),
});

const HIGHLIGHT_TOOL: Anthropic.Messages.Tool = {
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

const CITE_SOURCE_TOOL: Anthropic.Messages.Tool = {
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

const SYSTEM_PROMPT_BASE = `You are Hermes, a thoughtful writing assistant. You're the kind of reader every writer wishes they had — someone who pays close attention, asks the questions that unlock better thinking, and isn't afraid to point out where the writing falls short. You respond with both chat messages and inline highlights on their text.

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
- "voice" (purple): A passage that sounds different from the writer's established voice — only use this when prior writing samples are available for comparison
- "weakness" (red): The weakest argument or thinnest section — where a skeptical reader would push back
- "evidence" (teal): Where specific examples, data, or anecdotes would strengthen the point
- "wordiness" (orange): A passage that could say the same thing in fewer words — always provide suggestedEdit with a tightened version
- "factcheck" (pink): A claim that may need a citation, seems overstated, or could be factually wrong

Highlight rules:
- matchText MUST be an exact verbatim substring from the document
- If the document is empty or very short, respond with chat only — no highlights
- For "edit" and "wordiness" types, always provide suggestedEdit
- For "voice" type, only use when prior writing samples are available in the context

Be direct, intellectually rigorous, but warm. You're a thinking partner, not an editor.`;

const SYSTEM_PROMPT_TOOLS = `
External tools:
- You have access to Are.na, a research and reference platform. Use it when the writer asks for references, examples, inspiration, or research — or when finding real-world examples would strengthen their argument.
- Don't search unprompted. Only use external tools when the writer's request or the conversation naturally calls for it.
- When you use a search tool, briefly mention what you found and how it's relevant. Don't dump raw results.
- After referencing a source, call the cite_source tool with the URL and a short title.`;

/**
 * Strips markdown syntax so the AI sees plain text matching what
 * the frontend's getDocFlatText() produces. This ensures matchText
 * values from highlights are findable via indexOf on flat text.
 */
function stripMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // [text](url) → text
    .replace(/\*\*([^*]+)\*\*/g, '$1')           // **bold** → bold
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')  // *italic* → italic (not **)
    .replace(/~~([^~]+)~~/g, '$1')               // ~~strike~~ → strike
    .replace(/`([^`]+)`/g, '$1')                  // `code` → code
    .replace(/^#{1,6}\s+/gm, '')                  // # heading → heading
    .replace(/^>\s+/gm, '')                       // > blockquote → blockquote
    .replace(/^[-*+]\s+/gm, '')                   // - list → list
    .replace(/^\d+\.\s+/gm, '')                   // 1. list → list
    .replace(/^---+$/gm, '')                       // --- → (removed)
    .replace(/&nbsp;/g, '')                        // &nbsp; → (removed)
    .replace(/\n{3,}/g, '\n\n');                   // collapse excess newlines
}

function getMaxTokens(pages: Record<string, string>): number {
  const allContent = Object.values(pages).join(' ');
  const wordCount = allContent.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 3000) return 3072;
  return 2048;
}

async function loadPriorEssayRewrites(priorEssayProjectIds: string[] = []): Promise<string[]> {
  if (!priorEssayProjectIds.length) return [];

  const { data, error } = await supabase
    .from('drafts')
    .select('project_id, rewrite, skeleton, version')
    .in('project_id', priorEssayProjectIds)
    .order('version', { ascending: false });

  if (error || !data) return [];

  const latestByProject = new Map<string, string>();
  for (const row of data) {
    if (!latestByProject.has(row.project_id)) {
      latestByProject.set(row.project_id, row.rewrite || row.skeleton || '');
    }
  }

  return Array.from(latestByProject.values()).filter(Boolean);
}

async function getOwnedProject(projectId: string, userId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id, status')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

router.post('/chat', requireAuth, checkMessageLimit, async (req: Request, res: Response) => {
  const parsed = ChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request',
      ...(process.env.NODE_ENV !== 'production' && { details: parsed.error.issues }),
    });
    return;
  }

  const { projectId, message, activeTab } = parsed.data;
  const pages = parsed.data.pages as Record<string, string>;
  const userId = req.user!.id;

  const project = await getOwnedProject(projectId, userId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Load conversation history, brain dumps, and prior essays in parallel
  const [{ data: convo }, { data: brainDump }] = await Promise.all([
    supabase
      .from('assistant_conversations')
      .select('messages')
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('brain_dumps')
      .select('prior_essays')
      .eq('project_id', projectId)
      .single(),
  ]);

  const existingMessages: AssistantMessage[] = ((convo?.messages as AssistantMessage[]) || []).slice(-30);
  const priorEssays = await loadPriorEssayRewrites((brainDump?.prior_essays || []) as string[]);

  // Determine MCP access
  const isPro = req.usageInfo?.plan === 'pro';
  const isAdmin = isAdminUser(userId);
  const hasMcpAccess = isPro || isAdmin;

  const tools: Anthropic.Messages.Tool[] = [HIGHLIGHT_TOOL, CITE_SOURCE_TOOL];
  if (hasMcpAccess) {
    tools.push(...mcpManager.getTools());
    // Load user's configured MCP servers
    const { data: userServers } = await supabase
      .from('user_mcp_servers')
      .select('id, name, url, headers, enabled')
      .eq('user_id', userId)
      .eq('enabled', true);
    if (userServers?.length) {
      const configs: UserMcpServerConfig[] = userServers.map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        headers: (s.headers as Record<string, string>) || {},
        enabled: s.enabled,
      }));
      const userTools = await mcpManager.getUserTools(userId, configs);
      tools.push(...userTools);
    }
  }

  // Build system context
  let systemContent = hasMcpAccess
    ? SYSTEM_PROMPT_BASE + '\n' + SYSTEM_PROMPT_TOOLS
    : SYSTEM_PROMPT_BASE;

  // Build document context from pages (active tab first, then non-empty others)
  const tabNames: Record<string, string> = {
    coral: 'Coral', amber: 'Amber', sage: 'Sage', sky: 'Sky', lavender: 'Lavender',
  };
  // Strip markdown so the AI sees plain text matching the frontend's flat text.
  // This ensures highlight matchText values are findable via indexOf on flat text.
  const activeContent = stripMarkdown((pages[activeTab] || '').trim());
  if (activeContent) {
    systemContent += `\n\n---\n\n## Current Document (${tabNames[activeTab] || activeTab})\n\n${activeContent}`;
  }
  for (const [key, content] of Object.entries(pages)) {
    if (key === activeTab || !content.trim()) continue;
    systemContent += `\n\n## ${tabNames[key] || key} Tab\n\n${stripMarkdown(content)}`;
  }
  if (priorEssays.length) {
    systemContent += '\n\n## Prior Writing Samples\n';
    priorEssays.forEach((essay, index) => {
      systemContent += `\n### Sample ${index + 1}\n${essay}\n`;
    });
  }

  // Build messages for Anthropic
  const userMessage: AssistantMessage = {
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  };

  const allMessages = [...existingMessages, userMessage];

  // Save user message immediately
  await supabase
    .from('assistant_conversations')
    .upsert(
      {
        project_id: projectId,
        messages: allMessages,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' },
    );

  // Track client disconnect for SSE cleanup
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });

  function safeSseWrite(data: string): boolean {
    if (clientDisconnected) return false;
    try {
      res.write(data);
      return true;
    } catch {
      clientDisconnected = true;
      return false;
    }
  }

  // Set up SSE response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const anthropicMessages = allMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    let fullTextResponse = '';
    const highlights: HighlightData[] = [];
    const sources: SourceData[] = [];
    let highlightCounter = 0;

    // Tool-use loop
    const MAX_TOOL_ROUNDS = 10;
    let messages: Anthropic.Messages.MessageParam[] = anthropicMessages;
    let continueLoop = true;
    let toolRound = 0;

    // Anthropic API timeout: 120s per round
    const ANTHROPIC_TIMEOUT_MS = 120_000;

    while (continueLoop && !clientDisconnected) {
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), ANTHROPIC_TIMEOUT_MS);

      let response;
      try {
        response = await anthro.messages.create({
          model: MODEL,
          max_tokens: getMaxTokens(pages),
          temperature: 0.7,
          system: systemContent,
          tools,
          messages,
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
        if (clientDisconnected) break;

        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'text') {
            // Starting a text block
          } else if (event.content_block.type === 'tool_use') {
            currentToolName = event.content_block.name;
            currentToolId = event.content_block.id;
            currentToolInput = '';
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            fullTextResponse += event.delta.text;
            safeSseWrite(`event: text\ndata: ${JSON.stringify({ chunk: event.delta.text })}\n\n`);
          } else if (event.delta.type === 'input_json_delta') {
            currentToolInput += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolName && currentToolInput) {
            // Handle highlight tool — extract data and emit SSE event
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
                highlights.push(highlight);
                safeSseWrite(`event: highlight\ndata: ${JSON.stringify(highlight)}\n\n`);
              } catch {
                logger.warn({ projectId }, 'Failed to parse highlight tool input');
              }
            } else if (currentToolName === 'cite_source') {
              try {
                const input = JSON.parse(currentToolInput);
                const source: SourceData = { url: input.url, title: input.title };
                sources.push(source);
                safeSseWrite(`event: source\ndata: ${JSON.stringify(source)}\n\n`);
              } catch {
                logger.warn({ projectId }, 'Failed to parse cite_source tool input');
              }
            } else if (mcpManager.isMcpToolForUser(currentToolName, userId)) {
              // Notify frontend that an MCP tool is being invoked
              const server = mcpManager.serverName(currentToolName);
              safeSseWrite(`event: tool_status\ndata: ${JSON.stringify({ tool: currentToolName, server, status: 'running' })}\n\n`);
            }

            // Always push tool_use block for the result loop
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

      if (clientDisconnected) break;

      if (stopReason === 'tool_use') {
        toolRound++;
        if (toolRound >= MAX_TOOL_ROUNDS) {
          logger.warn({ projectId, toolRound }, 'Max tool rounds reached — stopping loop');
          continueLoop = false;
          break;
        }

        // Build tool results — run MCP calls in parallel
        const toolBlocks = contentBlocks.filter(
          (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
        );

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = await Promise.all(
          toolBlocks.map(async (block) => {
            if (block.name === 'add_highlight') {
              return {
                type: 'tool_result' as const,
                tool_use_id: block.id,
                content: 'Highlight added successfully.',
              };
            }

            if (block.name === 'cite_source') {
              const input = block.input as { url?: string; title?: string };
              return {
                type: 'tool_result' as const,
                tool_use_id: block.id,
                content: `Source cited: ${input.title || input.url}`,
              };
            }

            // MCP tool (system or user)
            const result = await mcpManager.callToolForUser(
              block.name,
              block.input as Record<string, unknown>,
              userId,
            );
            const server = mcpManager.serverName(block.name);
            const status = result.isError ? 'error' : 'done';
            safeSseWrite(`event: tool_status\ndata: ${JSON.stringify({ tool: block.name, server, status })}\n\n`);
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: result.content,
              is_error: result.isError,
            };
          }),
        );

        messages = [
          ...messages,
          { role: 'assistant', content: contentBlocks },
          { role: 'user', content: toolResults },
        ];
      } else {
        continueLoop = false;
      }
    }

    // Always save conversation and highlights, even if client disconnected
    const assistantMessage: AssistantMessage = {
      role: 'assistant',
      content: fullTextResponse,
      highlights: highlights.length > 0 ? highlights : undefined,
      sources: sources.length > 0 ? sources : undefined,
      timestamp: new Date().toISOString(),
    };

    await supabase
      .from('assistant_conversations')
      .upsert(
        {
          project_id: projectId,
          messages: [...allMessages, assistantMessage],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' },
      );

    // Atomically append highlights to project (capped at 200)
    if (highlights.length > 0) {
      await supabase.rpc('append_highlights', {
        p_project_id: projectId,
        p_user_id: userId,
        p_new_highlights: highlights,
      });
    }

    // Record successful message usage
    await supabase.from('message_usage').insert({ user_id: userId, project_id: projectId });

    // Send done + close only if client is still connected
    if (!clientDisconnected) {
      safeSseWrite(`event: done\ndata: ${JSON.stringify({ messageId: crypto.randomUUID() })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    // AbortError from timeout or client disconnect — handle gracefully
    if (error?.name === 'AbortError') {
      logger.info({ projectId }, 'Assistant stream aborted (timeout or client disconnect)');
    } else {
      logger.error({ error: error?.message, projectId }, 'Assistant chat stream failed');
    }
    if (!clientDisconnected) {
      safeSseWrite(`event: error\ndata: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
      res.end();
    }
  }
});

export default router;
