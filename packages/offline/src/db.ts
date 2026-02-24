import Dexie, { type EntityTable } from 'dexie';
import type { LocalProject, LocalConversation, SyncQueueEntry } from './types';

export class HermesDB extends Dexie {
  projects!: EntityTable<LocalProject, 'id'>;
  conversations!: EntityTable<LocalConversation, 'projectId'>;
  syncQueue!: EntityTable<SyncQueueEntry, 'id'>;

  constructor() {
    super('hermes-offline');

    this.version(1).stores({
      projects: 'id, userId, _syncStatus',
      conversations: 'projectId, _syncStatus',
      syncQueue: '++id, [table+recordId]',
    });
  }
}

export const db = new HermesDB();
