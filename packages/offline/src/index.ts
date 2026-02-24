export { db } from './db';
export type { LocalProject, LocalConversation, SyncQueueEntry, SyncStatus } from './types';

export {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  savePages,
  saveContent,
  saveHighlights,
  getConversation,
  saveConversation,
  upsertFromRemote,
  markSynced,
  getDirtyProjects,
  getDirtyConversations,
} from './offlineStore';

export {
  isOnline,
  onConnectivityChange,
  initConnectivity,
} from './connectivity';

export { useConnectivity } from './hooks';

export {
  enqueue,
  processQueue,
} from './syncQueue';

export {
  pushPending,
  pullRemote,
  fullSync,
} from './syncEngine';

export { createHybridAdapter } from './hybridAdapter';
