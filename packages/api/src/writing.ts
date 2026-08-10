import { getPlatform } from './config';
import { getDataSource } from './dataSource';
import { apiFetch, apiFetchOrNull, getAccessToken } from './http';
import { ESSAY_TITLE, ESSAY_SUBTITLE, ESSAY_PAGES } from './essay-seed';
import { WELCOME_TITLE, WELCOME_PAGES } from './welcome-seed';

// --- In-memory cache ---

const CACHE_TTL = 30_000; // 30 seconds
const MAX_CACHE_ENTRIES = 50;
const DUPLICATE_CLEANUP_WINDOW_MS = 15 * 60 * 1000;
const STARTER_TITLE = 'My First Project';
const DUPLICATE_CLEANUP_TITLES = new Set([WELCOME_TITLE, ESSAY_TITLE, STARTER_TITLE]);

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

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`).join(',')}}`;
}

function projectContentFingerprint(project: WritingProject): string {
  return [
    project.title,
    project.subtitle || '',
    project.status,
    project.content || '',
    stableSerialize(project.pages || {}),
  ].join('|');
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
  subtitle: string;
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
  subtitle: string;
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
  subtitle: string;
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
    subtitle: row.subtitle ?? '',
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
  const ds = getDataSource();
  if (ds) return ds.fetchProjects();

  if (projectListCache && Date.now() - projectListCache.timestamp <= CACHE_TTL) {
    return projectListCache.data;
  }

  const rows = await apiFetch<WritingProjectRow[]>('/api/projects');
  const projects = (rows || []).map(toWritingProject);
  projectListCache = { data: projects, timestamp: Date.now() };
  return projects;
}

export async function fetchWritingProject(projectId: string): Promise<WritingProject | null> {
  const ds = getDataSource();
  if (ds) return ds.fetchProject(projectId);

  const cached = getCached(projectCache, projectId);
  if (cached !== undefined) return cached;

  const row = await apiFetchOrNull<WritingProjectRow>(`/api/projects/${encodeURIComponent(projectId)}`);
  const project = row ? toWritingProject(row) : null;
  setCache(projectCache, projectId, project);
  return project;
}

export async function createWritingProject(
  title: string,
  userId: string,
  options?: { subtitle?: string; pages?: Record<string, string> },
): Promise<WritingProject> {
  const ds = getDataSource();
  if (ds) return ds.createProject(title, userId);

  const row = await apiFetch<WritingProjectRow>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      title,
      ...(options?.subtitle && { subtitle: options.subtitle }),
      ...(options?.pages && { pages: options.pages }),
    }),
  });
  projectListCache = null;
  return toWritingProject(row);
}

export async function updateWritingProject(
  projectId: string,
  updates: Partial<{ title: string; subtitle: string; status: WritingStatus }>,
): Promise<WritingProject> {
  const ds = getDataSource();
  if (ds) return ds.updateProject(projectId, updates);

  const row = await apiFetch<WritingProjectRow>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  invalidateProject(projectId);
  return toWritingProject(row);
}

export async function deleteWritingProject(projectId: string): Promise<void> {
  const ds = getDataSource();
  if (ds) return ds.deleteProject(projectId);

  await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
  invalidateProject(projectId);
  invalidateConversation(projectId);
}

export async function cleanupDefaultProjectDuplicates(): Promise<number> {
  const projects = await fetchWritingProjects();
  const bySignature = new Map<string, WritingProject[]>();

  for (const project of projects) {
    if (!DUPLICATE_CLEANUP_TITLES.has(project.title)) continue;
    const signature = `${project.title}::${projectContentFingerprint(project)}`;
    const group = bySignature.get(signature);
    if (group) group.push(project);
    else bySignature.set(signature, [project]);
  }

  const idsToDelete: string[] = [];

  for (const group of bySignature.values()) {
    if (group.length < 2) continue;
    if (group.some((p) => p.published || p.shortId || p.slug)) continue;

    const createdTimes = group.map((p) => Date.parse(p.createdAt));
    if (createdTimes.some((t) => Number.isNaN(t))) continue;

    const oldest = Math.min(...createdTimes);
    const newest = Math.max(...createdTimes);
    if (newest - oldest > DUPLICATE_CLEANUP_WINDOW_MS) continue;

    const [keep, ...dupes] = [...group].sort((a, b) => {
      const byUpdatedAt = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      if (byUpdatedAt !== 0) return byUpdatedAt;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });

    if (!keep) continue;
    idsToDelete.push(...dupes.map((p) => p.id));
  }

  for (const id of idsToDelete) {
    await deleteWritingProject(id);
  }

  return idsToDelete.length;
}

async function findProjectByTitle(title: string): Promise<WritingProject | null> {
  const projects = await fetchWritingProjects();
  const matches = projects
    .filter((p) => p.title === title)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return matches[0] ?? null;
}

export async function seedEssayProject(userId: string): Promise<WritingProject> {
  const existing = await findProjectByTitle(ESSAY_TITLE);
  if (existing) return existing;

  const project = await createWritingProject(ESSAY_TITLE, userId, {
    subtitle: ESSAY_SUBTITLE,
    pages: ESSAY_PAGES,
  });
  await updateWritingProject(project.id, { status: 'complete' });
  projectListCache = null;
  return project;
}

export async function seedWelcomeProject(
  userId: string,
  customPages?: Record<string, string>,
): Promise<WritingProject> {
  const existing = await findProjectByTitle(WELCOME_TITLE);
  if (existing) return existing;

  const project = await createWritingProject(WELCOME_TITLE, userId, {
    pages: customPages || WELCOME_PAGES,
  });
  await updateWritingProject(project.id, { status: 'complete' });
  projectListCache = null;
  return project;
}

// --- Editor persistence ---

export async function saveProjectPages(projectId: string, pages: Record<string, string>): Promise<void> {
  const ds = getDataSource();
  if (ds) return ds.savePages(projectId, pages);

  await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ pages }),
  });
  invalidateProject(projectId);
}

export async function saveProjectContent(projectId: string, content: string): Promise<void> {
  const ds = getDataSource();
  if (ds) return ds.saveContent(projectId, content);

  await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
  invalidateProject(projectId);
}

export async function saveProjectHighlights(projectId: string, highlights: Highlight[]): Promise<void> {
  const ds = getDataSource();
  if (ds) return ds.saveHighlights(projectId, highlights);

  await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ highlights }),
  });
  invalidateProject(projectId);
}

export async function fetchAssistantConversation(projectId: string): Promise<AssistantMessage[]> {
  const ds = getDataSource();
  if (ds) return ds.fetchConversation(projectId);

  const cached = getCached(conversationCache, projectId);
  if (cached !== undefined) return cached;

  const data = await apiFetchOrNull<{ messages: AssistantMessage[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/conversation`,
  );
  const messages = data?.messages || [];
  setCache(conversationCache, projectId, messages);
  return messages;
}

export async function saveAssistantConversation(projectId: string, messages: AssistantMessage[]): Promise<void> {
  const ds = getDataSource();
  if (ds) return ds.saveConversation(projectId, messages);

  await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/conversation`, {
    method: 'PUT',
    body: JSON.stringify({ messages }),
  });
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
    headers: authHeaders(accessToken || getAccessToken() || undefined),
    credentials: 'include',
    body: JSON.stringify({ projectId, message, pages, activeTab }),
    signal,
  });

  if (!res.ok) {
    const err: any = new Error('Failed to stream assistant response');
    err.status = res.status;
    try {
      const body = await res.json();
      err.code = body.code;
      err.serverMessage = body.message;
    } catch {
      // Response wasn't JSON
    }
    throw err;
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
  const row = await apiFetch<WritingProjectRow>(`/api/projects/${encodeURIComponent(projectId)}/publish`, {
    method: 'POST',
    body: JSON.stringify({ authorName, publishedTabs }),
  });
  invalidateProject(projectId);
  return toWritingProject(row);
}

export async function unpublishProject(projectId: string): Promise<WritingProject> {
  const row = await apiFetch<WritingProjectRow>(`/api/projects/${encodeURIComponent(projectId)}/unpublish`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  invalidateProject(projectId);
  return toWritingProject(row);
}

interface PublishedEssayRow {
  title: string;
  subtitle: string | null;
  author_name: string;
  published_pages: Record<string, string> | null;
  published_tabs: string[] | null;
  published_at: string;
  short_id: string;
  slug: string;
}

export async function fetchPublishedEssay(shortId: string): Promise<PublishedEssay | null> {
  const data = await apiFetchOrNull<PublishedEssayRow>(`/api/read/${encodeURIComponent(shortId)}`);
  if (!data) return null;

  // Read from the frozen snapshot (published_pages)
  const publishedTabSet = new Set(data.published_tabs || []);
  const filteredPages: Record<string, string> = {};
  for (const tab of publishedTabSet) {
    if (data.published_pages?.[tab]) {
      filteredPages[tab] = data.published_pages[tab];
    }
  }

  return {
    title: data.title,
    subtitle: data.subtitle ?? '',
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
  const row = await apiFetch<WritingProjectRow>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  invalidateProject(projectId);
  return toWritingProject(row);
}
