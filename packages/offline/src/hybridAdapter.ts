import type { DataSourceAdapter } from '@hermes/api';
import type { WritingProject, WritingStatus, AssistantMessage, Highlight } from '@hermes/api';
import * as store from './offlineStore';
import { isOnline } from './connectivity';
import { enqueue } from './syncQueue';
import { pushPending } from './syncEngine';

/**
 * Creates a hybrid DataSourceAdapter that:
 * - Reads from Dexie first (instant), backfills from Supabase if empty
 * - Writes to Dexie always (fast), pushes to Supabase when online
 * - Enqueues for sync when offline
 */
export function createHybridAdapter(userId: string): DataSourceAdapter {
  // Debounced push timer
  let pushTimer: ReturnType<typeof setTimeout> | null = null;

  function schedulePush(): void {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      if (isOnline()) {
        pushPending().catch(() => {});
      }
    }, 2000);
  }

  return {
    async fetchProjects(): Promise<WritingProject[]> {
      const local = await store.getProjects(userId);
      if (local.length > 0) return local;

      // Dexie empty — this is first run. Pull will populate on sync.
      return [];
    },

    async fetchProject(projectId: string): Promise<WritingProject | null> {
      return store.getProject(projectId);
    },

    async createProject(title: string, _userId: string): Promise<WritingProject> {
      const project = await store.createProject(title, userId);
      await enqueue('projects', project.id, 'upsert');
      schedulePush();
      return project;
    },

    async updateProject(
      projectId: string,
      updates: Partial<{ title: string; subtitle: string; status: WritingStatus }>,
    ): Promise<WritingProject> {
      const project = await store.updateProject(projectId, updates);
      await enqueue('projects', projectId, 'upsert');
      schedulePush();
      return project;
    },

    async deleteProject(projectId: string): Promise<void> {
      await store.deleteProject(projectId);
      await enqueue('projects', projectId, 'delete');
      schedulePush();
    },

    async savePages(projectId: string, pages: Record<string, string>): Promise<void> {
      await store.savePages(projectId, pages);
      await enqueue('projects', projectId, 'upsert');
      schedulePush();
    },

    async saveContent(projectId: string, content: string): Promise<void> {
      await store.saveContent(projectId, content);
      await enqueue('projects', projectId, 'upsert');
      schedulePush();
    },

    async saveHighlights(projectId: string, highlights: Highlight[]): Promise<void> {
      await store.saveHighlights(projectId, highlights);
      await enqueue('projects', projectId, 'upsert');
      schedulePush();
    },

    async fetchConversation(projectId: string): Promise<AssistantMessage[]> {
      return store.getConversation(projectId);
    },

    async saveConversation(projectId: string, messages: AssistantMessage[]): Promise<void> {
      await store.saveConversation(projectId, messages);
      await enqueue('conversations', projectId, 'upsert');
      schedulePush();
    },
  };
}
