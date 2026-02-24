import {
  getSupabase,
  toWritingProject,
  type WritingProjectRow,
  type AssistantMessage,
} from '@hermes/api';
import { db } from './db';
import * as store from './offlineStore';
import { isOnline } from './connectivity';
import type { LocalProject } from './types';

/** Timestamp of last successful pull, stored in localStorage */
const LAST_SYNC_KEY = 'hermes-last-sync';

function getLastSyncTimestamp(): string {
  return localStorage.getItem(LAST_SYNC_KEY) || '1970-01-01T00:00:00.000Z';
}

function setLastSyncTimestamp(ts: string): void {
  localStorage.setItem(LAST_SYNC_KEY, ts);
}

/**
 * Push all dirty/new local records to Supabase.
 * Returns count of successfully pushed records.
 */
export async function pushPending(): Promise<number> {
  if (!isOnline()) return 0;

  const supabase = getSupabase();
  let pushed = 0;

  // Push dirty/new projects
  const dirtyProjects = await store.getDirtyProjects();
  for (const project of dirtyProjects) {
    try {
      if (project._syncStatus === 'new') {
        // Insert new project
        const { data, error } = await supabase
          .from('projects')
          .insert({
            id: project.id,
            user_id: project.userId,
            title: project.title,
            subtitle: project.subtitle,
            status: project.status,
            content: project.content,
            pages: project.pages,
            highlights: project.highlights,
          })
          .select('updated_at')
          .single();

        if (error) throw error;
        await store.markSynced(project.id, data.updated_at);
        pushed++;
      } else {
        // Update existing project
        const { data, error } = await supabase
          .from('projects')
          .update({
            title: project.title,
            subtitle: project.subtitle,
            status: project.status,
            content: project.content,
            pages: project.pages,
            highlights: project.highlights,
          })
          .eq('id', project.id)
          .select('updated_at')
          .single();

        if (error) throw error;
        await store.markSynced(project.id, data.updated_at);
        pushed++;
      }
    } catch {
      // Skip this project, try again next cycle
    }
  }

  // Push dirty conversations
  const dirtyConversations = await store.getDirtyConversations();
  for (const conv of dirtyConversations) {
    try {
      const { error } = await supabase
        .from('assistant_conversations')
        .upsert(
          {
            project_id: conv.projectId,
            messages: conv.messages,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'project_id' },
        );

      if (error) throw error;

      await db.conversations.update(conv.projectId, {
        _syncStatus: 'synced',
        _serverUpdatedAt: new Date().toISOString(),
      });
      pushed++;
    } catch {
      // Skip, try next cycle
    }
  }

  return pushed;
}

/**
 * Pull remote changes since last sync.
 * Uses last-write-wins for conflict resolution.
 */
export async function pullRemote(userId: string): Promise<number> {
  if (!isOnline()) return 0;

  const supabase = getSupabase();
  const lastSync = getLastSyncTimestamp();
  let pulled = 0;

  // Fetch projects updated since last sync
  const { data: remoteProjects, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .gt('updated_at', lastSync)
    .order('updated_at', { ascending: true });

  if (error) throw error;

  for (const row of remoteProjects || []) {
    const project = toWritingProject(row as WritingProjectRow);
    await store.upsertFromRemote(project);
    pulled++;
  }

  // Fetch conversations updated since last sync
  const { data: remoteConvs, error: convError } = await supabase
    .from('assistant_conversations')
    .select('project_id, messages, updated_at')
    .gt('updated_at', lastSync);

  if (!convError && remoteConvs) {
    for (const row of remoteConvs) {
      const existing = await db.conversations.get(row.project_id);

      if (!existing || existing._syncStatus === 'synced') {
        // No local changes — accept remote
        await db.conversations.put({
          projectId: row.project_id,
          messages: row.messages as AssistantMessage[],
          _syncStatus: 'synced',
          _localUpdatedAt: row.updated_at,
          _serverUpdatedAt: row.updated_at,
        });
        pulled++;
      } else if (row.updated_at > existing._localUpdatedAt) {
        // Remote is newer — overwrite
        await db.conversations.put({
          projectId: row.project_id,
          messages: row.messages as AssistantMessage[],
          _syncStatus: 'synced',
          _localUpdatedAt: row.updated_at,
          _serverUpdatedAt: row.updated_at,
        });
        pulled++;
      }
      // else: local is newer, keep local
    }
  }

  // Check for deletions: projects that exist locally but not remotely
  const { data: allRemoteIds } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId);

  if (allRemoteIds) {
    const remoteIdSet = new Set(allRemoteIds.map((r) => r.id));
    const localProjects = await store.getProjects(userId);

    for (const local of localProjects) {
      // Only delete synced projects that no longer exist remotely
      if (local._syncStatus === 'synced' && !remoteIdSet.has(local.id)) {
        await db.projects.delete(local.id);
        await db.conversations.delete(local.id);
      }
    }
  }

  // Update sync timestamp
  setLastSyncTimestamp(new Date().toISOString());

  return pulled;
}

/**
 * Full sync: push local changes, then pull remote updates.
 */
export async function fullSync(userId: string): Promise<{ pushed: number; pulled: number }> {
  const pushed = await pushPending();
  const pulled = await pullRemote(userId);
  return { pushed, pulled };
}
