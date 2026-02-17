import { getSupabase } from './supabase';
import { getPlatform } from './config';
import { ESSAY_TITLE, ESSAY_MARKDOWN, ESSAY_OUTLINE } from './essay-seed';
import { WELCOME_TITLE, WELCOME_PAGES } from './welcome-seed';

// --- In-memory cache ---

const CACHE_TTL = 30_000; // 30 seconds
const MAX_CACHE_ENTRIES = 50;

type CacheEntry<T> = { data: T; timestamp: number };

const projectCache = new Map<string, CacheEntry<WritingProject | null>>();
const conversationCache = new Map<string, CacheEntry<AssistantMessage[]>>();
let projectListCache: CacheEntry<WritingProject[]> | null = null;

function getCached<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    map.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache<T>(map: Map<string, CacheEntry<T>>, key: string, data: T): void {
  if (map.size >= MAX_CACHE_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, { data, timestamp: Date.now() });
}

function invalidateProject(projectId: string): void {
  projectCache.delete(projectId);
  projectListCache = null;
}

function invalidateConversation(projectId: string): void {
  conversationCache.delete(projectId);
}

export type WritingStatus =
  | 'interview'
  | 'draft'
  | 'rewriting'
  | 'feedback'
  | 'complete';

export interface WritingProjectRow {
  id: string;
  user_id: string;
  title: string;
  status: WritingStatus;
  content: string;
  pages: Record<string, string>;
  highlights: Highlight[];
  published: boolean;
  short_id: string | null;
  slug: string | null;
  author_name: string;
  published_tabs: string[];
  published_pages: Record<string, string>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WritingProject {
  id: string;
  userId: string;
  title: string;
  status: WritingStatus;
  content: string;
  pages: Record<string, string>;
  highlights: Highlight[];
  published: boolean;
  shortId: string | null;
  slug: string | null;
  authorName: string;
  publishedTabs: string[];
  publishedPages: Record<string, string>;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishedEssay {
  title: string;
  authorName: string;
  pages: Record<string, string>;
  publishedTabs: string[];
  publishedAt: string;
  shortId: string;
  slug: string;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  highlights?: Highlight[];
  timestamp: string;
}

export interface Highlight {
  id: string;
  type: 'question' | 'suggestion' | 'edit' | 'voice' | 'weakness' | 'evidence' | 'wordiness' | 'factcheck';
  matchText: string;
  comment: string;
  suggestedEdit?: string;
  dismissed?: boolean;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function authHeaders(accessToken?: string): HeadersInit {
  if (!accessToken) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export function toWritingProject(row: WritingProjectRow): WritingProject {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    status: row.status,
    content: row.content || '',
    pages: (row.pages as Record<string, string>) || {},
    highlights: (row.highlights as Highlight[]) || [],
    published: row.published ?? false,
    shortId: row.short_id ?? null,
    slug: row.slug ?? null,
    authorName: row.author_name ?? '',
    publishedTabs: row.published_tabs ?? [],
    publishedPages: (row.published_pages as Record<string, string>) || {},
    publishedAt: row.published_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchWritingProjects(): Promise<WritingProject[]> {
  if (projectListCache && Date.now() - projectListCache.timestamp <= CACHE_TTL) {
    return projectListCache.data;
  }

  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  const projects = (data || []).map((row) => toWritingProject(row as WritingProjectRow));
  projectListCache = { data: projects, timestamp: Date.now() };
  return projects;
}

export async function fetchWritingProject(projectId: string): Promise<WritingProject | null> {
  const cached = getCached(projectCache, projectId);
  if (cached !== undefined) return cached;

  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single<WritingProjectRow>();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null;
    throw error;
  }

  const project = toWritingProject(data);
  setCache(projectCache, projectId, project);
  return project;
}

export async function createWritingProject(title: string, userId: string): Promise<WritingProject> {
  const { data, error } = await getSupabase()
    .from('projects')
    .insert({
      title,
      user_id: userId,
      status: 'interview',
    })
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  projectListCache = null;
  return toWritingProject(data);
}

export async function updateWritingProject(
  projectId: string,
  updates: Partial<{ title: string; status: WritingStatus }>,
): Promise<WritingProject> {
  const { data, error } = await getSupabase()
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  invalidateProject(projectId);
  return toWritingProject(data);
}

export async function deleteWritingProject(projectId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) throw error;
  invalidateProject(projectId);
  invalidateConversation(projectId);
}

export async function seedEssayProject(userId: string): Promise<WritingProject> {
  const sb = getSupabase();

  const { data: project, error: projErr } = await sb
    .from('projects')
    .insert({ title: ESSAY_TITLE, user_id: userId, status: 'complete', content: ESSAY_MARKDOWN })
    .select('*')
    .single<WritingProjectRow>();

  if (projErr) throw projErr;

  const { error: intErr } = await sb
    .from('interviews')
    .insert({ project_id: project.id, messages: [], outline: ESSAY_OUTLINE });

  if (intErr) throw intErr;

  const { error: draftErr } = await sb
    .from('drafts')
    .insert({ project_id: project.id, rewrite: ESSAY_MARKDOWN, version: 1 });

  if (draftErr) throw draftErr;

  projectListCache = null;
  return toWritingProject(project);
}

export async function seedWelcomeProject(
  userId: string,
  customPages?: Record<string, string>,
): Promise<WritingProject> {
  const { data, error } = await getSupabase()
    .from('projects')
    .insert({
      title: WELCOME_TITLE,
      user_id: userId,
      status: 'complete',
      pages: customPages || WELCOME_PAGES,
    })
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  projectListCache = null;
  return toWritingProject(data);
}

// --- Assistant API ---

export async function saveProjectPages(projectId: string, pages: Record<string, string>): Promise<void> {
  const { error } = await getSupabase()
    .from('projects')
    .update({ pages })
    .eq('id', projectId);

  if (error) throw error;
  invalidateProject(projectId);
}

export async function saveProjectContent(projectId: string, content: string): Promise<void> {
  const { error } = await getSupabase()
    .from('projects')
    .update({ content })
    .eq('id', projectId);

  if (error) throw error;
  invalidateProject(projectId);
}

export async function saveProjectHighlights(projectId: string, highlights: Highlight[]): Promise<void> {
  const { error } = await getSupabase()
    .from('projects')
    .update({ highlights })
    .eq('id', projectId);

  if (error) throw error;
  invalidateProject(projectId);
}

export async function fetchAssistantConversation(projectId: string): Promise<AssistantMessage[]> {
  const cached = getCached(conversationCache, projectId);
  if (cached !== undefined) return cached;

  const { data, error } = await getSupabase()
    .from('assistant_conversations')
    .select('messages')
    .eq('project_id', projectId)
    .single<{ messages: AssistantMessage[] }>();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return [];
    throw error;
  }

  const messages = data.messages || [];
  setCache(conversationCache, projectId, messages);
  return messages;
}

export async function saveAssistantConversation(projectId: string, messages: AssistantMessage[]): Promise<void> {
  const { error } = await getSupabase()
    .from('assistant_conversations')
    .upsert(
      {
        project_id: projectId,
        messages,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' },
    );

  if (error) throw error;
  invalidateConversation(projectId);
}

export async function startAssistantStream(
  projectId: string,
  message: string,
  pages: Record<string, string>,
  activeTab: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<Response> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ projectId, message, pages, activeTab }),
    signal,
  });

  if (!res.ok) {
    throw new Error('Failed to stream assistant response');
  }

  return res;
}

// --- Publishing ---

export function generateShortId(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  const values = crypto.getRandomValues(new Uint8Array(7));
  let id = '';
  for (let i = 0; i < 7; i++) {
    id += chars[values[i] % 36];
  }
  return id;
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'untitled';
}

export async function publishProject(
  projectId: string,
  authorName: string,
  publishedTabs: string[],
): Promise<WritingProject> {
  // Fetch current project to check if already published (reuse shortId)
  // and to snapshot current pages content
  const existing = await fetchWritingProject(projectId);
  const shortId = existing?.shortId || generateShortId();
  const slug = generateSlug(existing?.title || 'untitled');

  // Snapshot only the selected tabs' content into published_pages
  const currentPages = existing?.pages || {};
  const publishedPages: Record<string, string> = {};
  for (const tab of publishedTabs) {
    if (currentPages[tab]) {
      publishedPages[tab] = currentPages[tab];
    }
  }

  const { data, error } = await getSupabase()
    .from('projects')
    .update({
      published: true,
      short_id: shortId,
      slug,
      author_name: authorName,
      published_tabs: publishedTabs,
      published_pages: publishedPages,
      published_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  invalidateProject(projectId);
  return toWritingProject(data);
}

export async function unpublishProject(projectId: string): Promise<WritingProject> {
  const { data, error } = await getSupabase()
    .from('projects')
    .update({ published: false })
    .eq('id', projectId)
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  invalidateProject(projectId);
  return toWritingProject(data);
}

export async function fetchPublishedEssay(shortId: string): Promise<PublishedEssay | null> {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('title, author_name, published_pages, published_tabs, published_at, short_id, slug')
    .eq('short_id', shortId)
    .eq('published', true)
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null;
    throw error;
  }

  // Read from the frozen snapshot (published_pages)
  const publishedTabSet = new Set(data.published_tabs || []);
  const filteredPages: Record<string, string> = {};
  for (const tab of publishedTabSet) {
    if ((data.published_pages as Record<string, string>)?.[tab]) {
      filteredPages[tab] = (data.published_pages as Record<string, string>)[tab];
    }
  }

  return {
    title: data.title,
    authorName: data.author_name,
    pages: filteredPages,
    publishedTabs: data.published_tabs || [],
    publishedAt: data.published_at,
    shortId: data.short_id,
    slug: data.slug,
  };
}

export async function updatePublishSettings(
  projectId: string,
  updates: Partial<{ author_name: string; published_tabs: string[]; slug: string }>,
): Promise<WritingProject> {
  const { data, error } = await getSupabase()
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  invalidateProject(projectId);
  return toWritingProject(data);
}
