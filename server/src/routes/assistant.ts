import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();

const anthro = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-5-20250929';

type AssistantMessage = {
  role: 'user' | 'assistant';
  content: string;
  highlights?: HighlightData[];
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
  editorContent: z.string().max(100000).default(''),
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

function getMaxTokens(editorContent: string): number {
  const wordCount = editorContent.trim().split(/\s+/).filter(Boolean).length;
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

router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  const parsed = ChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }

  const { projectId, message, editorContent } = parsed.data;
  const userId = req.user!.id;

  const project = await getOwnedProject(projectId, userId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Load conversation history
  const { data: convo } = await supabase
    .from('assistant_conversations')
    .select('messages')
    .eq('project_id', projectId)
    .single();

  const existingMessages: AssistantMessage[] = ((convo?.messages as AssistantMessage[]) || []).slice(-30);

  // Load prior essays for style context
  const { data: brainDump } = await supabase
    .from('brain_dumps')
    .select('prior_essays')
    .eq('project_id', projectId)
    .single();

  const priorEssays = await loadPriorEssayRewrites((brainDump?.prior_essays || []) as string[]);

  // Build system context
  let systemContent = SYSTEM_PROMPT;
  if (editorContent.trim()) {
    systemContent += `\n\n---\n\n## Current Document\n\n${editorContent}`;
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
        messages: JSON.parse(JSON.stringify(allMessages)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' },
    );

  // Set up SSE response
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  try {
    const anthropicMessages = allMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    let fullTextResponse = '';
    const highlights: HighlightData[] = [];
    let highlightCounter = 0;

    // Tool-use loop
    let messages: Anthropic.Messages.MessageParam[] = anthropicMessages;
    let continueLoop = true;

    while (continueLoop) {
      const response = await anthro.messages.create({
        model: MODEL,
        max_tokens: getMaxTokens(editorContent),
        temperature: 0.7,
        system: systemContent,
        tools: [HIGHLIGHT_TOOL],
        messages,
        stream: true,
      });

      let currentToolName = '';
      let currentToolInput = '';
      let currentToolId = '';
      const contentBlocks: Anthropic.Messages.ContentBlock[] = [];
      let stopReason: string | null = null;

      for await (const event of response) {
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
            res.write(`event: text\ndata: ${JSON.stringify({ chunk: event.delta.text })}\n\n`);
          } else if (event.delta.type === 'input_json_delta') {
            currentToolInput += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolName === 'add_highlight' && currentToolInput) {
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
              res.write(`event: highlight\ndata: ${JSON.stringify(highlight)}\n\n`);
            } catch {
              logger.warn({ projectId }, 'Failed to parse highlight tool input');
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

      if (stopReason === 'tool_use') {
        // Build tool results and continue the loop
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = contentBlocks
          .filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use')
          .map((block) => ({
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: 'Highlight added successfully.',
          }));

        messages = [
          ...messages,
          { role: 'assistant', content: contentBlocks },
          { role: 'user', content: toolResults },
        ];
      } else {
        continueLoop = false;
      }
    }

    // Send done event
    res.write(`event: done\ndata: ${JSON.stringify({ messageId: crypto.randomUUID() })}\n\n`);

    // Save assistant message with highlights
    const assistantMessage: AssistantMessage = {
      role: 'assistant',
      content: fullTextResponse,
      highlights: highlights.length > 0 ? highlights : undefined,
      timestamp: new Date().toISOString(),
    };

    await supabase
      .from('assistant_conversations')
      .upsert(
        {
          project_id: projectId,
          messages: JSON.parse(JSON.stringify([...allMessages, assistantMessage])),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' },
      );

    // Also save highlights to project
    if (highlights.length > 0) {
      const { data: projectData } = await supabase
        .from('projects')
        .select('highlights')
        .eq('id', projectId)
        .single();

      const existingHighlights = (projectData?.highlights as HighlightData[]) || [];
      const merged = [...existingHighlights, ...highlights];

      await supabase
        .from('projects')
        .update({ highlights: JSON.parse(JSON.stringify(merged)) })
        .eq('id', projectId);
    }

    res.end();
  } catch (error: any) {
    logger.error({ error: error?.message, projectId }, 'Assistant chat stream failed');
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
    res.end();
  }
});

export default router;
