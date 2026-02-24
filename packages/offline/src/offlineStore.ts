import type { WritingProject, WritingStatus, AssistantMessage, Highlight } from '@hermes/api';
import { db } from './db';
import type { LocalProject, LocalConversation } from './types';

const EMPTY_PAGES: Record<string, string> = { coral: '', mint: '', navy: '', gold: '', lavender: '' };

function now(): string {
  return new Date().toISOString();
}

/** Get all projects for a user, ordered by most recently updated */
export async function getProjects(userId: string): Promise<LocalProject[]> {
  return db.projects
    .where('userId')
    .equals(userId)
    .reverse()
    .sortBy('_localUpdatedAt');
}

/** Get a single project by ID */
export async function getProject(projectId: string): Promise<LocalProject | null> {
  return (await db.projects.get(projectId)) ?? null;
}

/** Create a new project locally */
export async function createProject(title: string, userId: string): Promise<LocalProject> {
  const id = crypto.randomUUID();
  const timestamp = now();
  const project: LocalProject = {
    id,
    userId,
    title,
    subtitle: '',
    status: 'interview' as WritingStatus,
    content: '',
    pages: { ...EMPTY_PAGES },
    highlights: [],
    published: false,
    shortId: null,
    slug: null,
    authorName: '',
    publishedTabs: [],
    publishedPages: {},
    publishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    _syncStatus: 'new',
    _localUpdatedAt: timestamp,
    _serverUpdatedAt: null,
  };
  await db.projects.put(project);
  return project;
}

/** Update project metadata (title, subtitle, status) */
export async function updateProject(
  projectId: string,
  updates: Partial<{ title: string; subtitle: string; status: WritingStatus }>,
): Promise<LocalProject> {
  const existing = await db.projects.get(projectId);
  if (!existing) throw new Error('Project not found');

  const timestamp = now();
  const updated: LocalProject = {
    ...existing,
    ...updates,
    updatedAt: timestamp,
    _syncStatus: existing._syncStatus === 'new' ? 'new' : 'dirty',
    _localUpdatedAt: timestamp,
  };
  await db.projects.put(updated);
  return updated;
}

/** Delete a project locally */
export async function deleteProject(projectId: string): Promise<void> {
  await db.projects.delete(projectId);
  await db.conversations.delete(projectId);
}

/** Save pages content */
export async function savePages(projectId: string, pages: Record<string, string>): Promise<void> {
  const existing = await db.projects.get(projectId);
  if (!existing) return;

  const timestamp = now();
  await db.projects.update(projectId, {
    pages,
    updatedAt: timestamp,
    _syncStatus: existing._syncStatus === 'new' ? 'new' : 'dirty',
    _localUpdatedAt: timestamp,
  });
}

/** Save legacy single content field */
export async function saveContent(projectId: string, content: string): Promise<void> {
  const existing = await db.projects.get(projectId);
  if (!existing) return;

  const timestamp = now();
  await db.projects.update(projectId, {
    content,
    updatedAt: timestamp,
    _syncStatus: existing._syncStatus === 'new' ? 'new' : 'dirty',
    _localUpdatedAt: timestamp,
  });
}

/** Save highlights */
export async function saveHighlights(projectId: string, highlights: Highlight[]): Promise<void> {
  const existing = await db.projects.get(projectId);
  if (!existing) return;

  const timestamp = now();
  await db.projects.update(projectId, {
    highlights,
    updatedAt: timestamp,
    _syncStatus: existing._syncStatus === 'new' ? 'new' : 'dirty',
    _localUpdatedAt: timestamp,
  });
}

/** Get conversation messages for a project */
export async function getConversation(projectId: string): Promise<AssistantMessage[]> {
  const conv = await db.conversations.get(projectId);
  return conv?.messages ?? [];
}

/** Save conversation messages */
export async function saveConversation(projectId: string, messages: AssistantMessage[]): Promise<void> {
  const timestamp = now();
  const existing = await db.conversations.get(projectId);

  const conv: LocalConversation = {
    projectId,
    messages,
    _syncStatus: existing?._syncStatus === 'synced' ? 'dirty' : (existing?._syncStatus ?? 'dirty'),
    _localUpdatedAt: timestamp,
    _serverUpdatedAt: existing?._serverUpdatedAt ?? null,
  };
  await db.conversations.put(conv);
}

/** Upsert a project from remote data (used during sync pull) */
export async function upsertFromRemote(project: WritingProject): Promise<void> {
  const existing = await db.projects.get(project.id);

  if (!existing) {
    // New from server — insert as synced
    const local: LocalProject = {
      ...project,
      _syncStatus: 'synced',
      _localUpdatedAt: project.updatedAt,
      _serverUpdatedAt: project.updatedAt,
    };
    await db.projects.put(local);
    return;
  }

  if (existing._syncStatus === 'synced') {
    // Local is clean — overwrite with server data
    const local: LocalProject = {
      ...project,
      _syncStatus: 'synced',
      _localUpdatedAt: project.updatedAt,
      _serverUpdatedAt: project.updatedAt,
    };
    await db.projects.put(local);
    return;
  }

  // Local is dirty — compare timestamps, most recent wins
  if (project.updatedAt > existing._localUpdatedAt) {
    const local: LocalProject = {
      ...project,
      _syncStatus: 'synced',
      _localUpdatedAt: project.updatedAt,
      _serverUpdatedAt: project.updatedAt,
    };
    await db.projects.put(local);
  }
  // else: local is newer, keep local dirty version
}

/** Mark a project as synced after successful push */
export async function markSynced(projectId: string, serverUpdatedAt: string): Promise<void> {
  await db.projects.update(projectId, {
    _syncStatus: 'synced',
    _serverUpdatedAt: serverUpdatedAt,
  });
}

/** Get all dirty/new projects needing sync */
export async function getDirtyProjects(): Promise<LocalProject[]> {
  return db.projects
    .where('_syncStatus')
    .anyOf('dirty', 'new')
    .toArray();
}

/** Get all dirty conversations needing sync */
export async function getDirtyConversations(): Promise<LocalConversation[]> {
  return db.conversations
    .where('_syncStatus')
    .equals('dirty')
    .toArray();
}
