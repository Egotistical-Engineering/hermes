import type { WritingProject, AssistantMessage } from '@hermes/api';

export type SyncStatus = 'synced' | 'dirty' | 'new';

export interface LocalProject extends WritingProject {
  _syncStatus: SyncStatus;
  _localUpdatedAt: string;
  _serverUpdatedAt: string | null;
}

export interface LocalConversation {
  projectId: string;
  messages: AssistantMessage[];
  _syncStatus: 'synced' | 'dirty';
  _localUpdatedAt: string;
  _serverUpdatedAt: string | null;
}

export interface SyncQueueEntry {
  id?: number;
  table: 'projects' | 'conversations';
  recordId: string;
  operation: 'upsert' | 'delete';
  createdAt: string;
  attempts: number;
}
