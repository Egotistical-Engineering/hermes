import { Router, Request, Response } from 'express';
import { z } from 'zod/v4';
import { query } from '../lib/db.js';
import { requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import logger from '../lib/logger.js';

const router = Router();

const PROJECT_COLUMNS = `id, user_id, title, subtitle, status, content, pages, highlights,
  published, short_id, slug, author_name, published_tabs, published_pages, published_at,
  created_at, updated_at`;

const StatusSchema = z.enum(['interview', 'draft', 'rewriting', 'feedback', 'complete']);
const PagesSchema = z.record(z.string(), z.string());

const CreateSchema = z.object({
  title: z.string().min(1).max(300),
  subtitle: z.string().max(500).optional(),
  status: StatusSchema.optional(),
  pages: PagesSchema.optional(),
});

const UpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  subtitle: z.string().max(500).optional(),
  status: StatusSchema.optional(),
  content: z.string().optional(),
  pages: PagesSchema.optional(),
  highlights: z.array(z.looseObject({})).optional(),
  author_name: z.string().max(200).optional(),
  published_tabs: z.array(z.string()).optional(),
  slug: z.string().max(120).optional(),
});

const PublishSchema = z.object({
  authorName: z.string().max(200).default(''),
  publishedTabs: z.array(z.string()).max(10),
});

const ConversationSchema = z.object({
  messages: z.array(z.looseObject({ role: z.enum(['user', 'assistant']), content: z.string() })).max(200),
});

function generateShortId(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < 7; i++) id += chars[Math.floor(Math.random() * 36)];
  return id;
}

function generateSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'untitled';
}

// --- Public read endpoint (no auth) — must be registered before requireAuth ---

router.get('/read/:shortId', async (req: Request, res: Response) => {
  const shortId = String(req.params.shortId || '').slice(0, 12);
  try {
    const { rows } = await query(
      `select title, subtitle, author_name, published_pages, published_tabs, published_at, short_id, slug
       from projects where short_id = $1 and published = true`,
      [shortId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(rows[0]);
  } catch (err: any) {
    logger.error({ error: err?.message }, 'Public read failed');
    res.status(500).json({ error: 'Failed to load essay' });
  }
});

// --- Authenticated project CRUD ---

router.use(requireAuth);

router.get('/projects', async (req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `select ${PROJECT_COLUMNS} from projects where user_id = $1 order by updated_at desc`,
      [req.user!.id],
    );
    res.json(rows);
  } catch (err: any) {
    logger.error({ error: err?.message }, 'List projects failed');
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

router.post('/projects', async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid project payload' });
    return;
  }
  const { title, subtitle, status, pages } = parsed.data;
  try {
    const { rows } = await query(
      `insert into projects (user_id, title, subtitle, status, pages)
       values ($1, $2, $3, $4, $5) returning ${PROJECT_COLUMNS}`,
      [req.user!.id, title, subtitle ?? '', status ?? 'interview', JSON.stringify(pages ?? {})],
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    logger.error({ error: err?.message }, 'Create project failed');
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `select ${PROJECT_COLUMNS} from projects where id = $1 and user_id = $2`,
      [req.params.id, req.user!.id],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(rows[0]);
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

router.patch('/projects/:id', async (req: Request, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid update payload' });
    return;
  }
  const updates = parsed.data;
  const jsonFields = new Set(['pages', 'highlights', 'published_tabs']);
  const keys = Object.keys(updates) as (keyof typeof updates)[];
  if (keys.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  keys.forEach((key) => {
    values.push(jsonFields.has(key) ? JSON.stringify(updates[key]) : updates[key]);
    sets.push(`${key} = $${values.length}`);
  });
  values.push(req.params.id, req.user!.id);
  try {
    const { rows } = await query(
      `update projects set ${sets.join(', ')}, updated_at = now()
       where id = $${values.length - 1} and user_id = $${values.length}
       returning ${PROJECT_COLUMNS}`,
      values,
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(rows[0]);
  } catch (err: any) {
    logger.error({ error: err?.message }, 'Update project failed');
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    await query('delete from projects where id = $1 and user_id = $2', [req.params.id, req.user!.id]);
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ error: err?.message }, 'Delete project failed');
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// --- Publishing ---

router.post('/projects/:id/publish', async (req: Request, res: Response) => {
  const parsed = PublishSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid publish payload' });
    return;
  }
  const { authorName, publishedTabs } = parsed.data;
  try {
    const { rows: existing } = await query(
      'select title, short_id, pages from projects where id = $1 and user_id = $2',
      [req.params.id, req.user!.id],
    );
    if (!existing[0]) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const shortId = existing[0].short_id || generateShortId();
    const slug = generateSlug(existing[0].title || 'untitled');
    const currentPages = (existing[0].pages as Record<string, string>) || {};
    const publishedPages: Record<string, string> = {};
    for (const tab of publishedTabs) {
      if (currentPages[tab]) publishedPages[tab] = currentPages[tab];
    }
    const { rows } = await query(
      `update projects set published = true, short_id = $3, slug = $4, author_name = $5,
        published_tabs = $6, published_pages = $7, published_at = now(), updated_at = now()
       where id = $1 and user_id = $2 returning ${PROJECT_COLUMNS}`,
      [req.params.id, req.user!.id, shortId, slug, authorName,
        JSON.stringify(publishedTabs), JSON.stringify(publishedPages)],
    );
    res.json(rows[0]);
  } catch (err: any) {
    logger.error({ error: err?.message }, 'Publish failed');
    res.status(500).json({ error: 'Failed to publish' });
  }
});

router.post('/projects/:id/unpublish', async (req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `update projects set published = false, updated_at = now()
       where id = $1 and user_id = $2 returning ${PROJECT_COLUMNS}`,
      [req.params.id, req.user!.id],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(rows[0]);
  } catch (err: any) {
    logger.error({ error: err?.message }, 'Unpublish failed');
    res.status(500).json({ error: 'Failed to unpublish' });
  }
});

// --- Account ---

const PasswordSchema = z.object({ newPassword: z.string().min(8).max(200) });

router.post('/account/password', async (req: Request, res: Response) => {
  const parsed = PasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  try {
    const hash = await bcrypt.hash(parsed.data.newPassword, 10);
    const { rowCount } = await query(
      `update "account" set "password" = $2, "updatedAt" = now()
       where "userId" = $1 and "providerId" = 'credential'`,
      [req.user!.id, hash],
    );
    if (rowCount === 0) {
      await query(
        `insert into "account" ("id", "accountId", "providerId", "userId", "password")
         values (gen_random_uuid()::text, $1, 'credential', $1, $2)`,
        [req.user!.id, hash],
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ error: err?.message }, 'Set password failed');
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// --- Assistant conversation ---

router.get('/projects/:id/conversation', async (req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `select ac.messages from assistant_conversations ac
       join projects p on p.id = ac.project_id
       where ac.project_id = $1 and p.user_id = $2`,
      [req.params.id, req.user!.id],
    );
    res.json({ messages: rows[0]?.messages ?? [] });
  } catch {
    res.json({ messages: [] });
  }
});

router.put('/projects/:id/conversation', async (req: Request, res: Response) => {
  const parsed = ConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid conversation payload' });
    return;
  }
  try {
    const { rows: owned } = await query(
      'select id from projects where id = $1 and user_id = $2',
      [req.params.id, req.user!.id],
    );
    if (!owned[0]) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await query(
      `insert into assistant_conversations (project_id, messages, updated_at)
       values ($1, $2, now())
       on conflict (project_id) do update set messages = excluded.messages, updated_at = now()`,
      [req.params.id, JSON.stringify(parsed.data.messages)],
    );
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ error: err?.message }, 'Save conversation failed');
    res.status(500).json({ error: 'Failed to save conversation' });
  }
});

export default router;
