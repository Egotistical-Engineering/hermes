export { initPlatform, getPlatform } from './config';
export { setDataSourceAdapter, getDataSource, type DataSourceAdapter } from './dataSource';
export { createWebSessionStorageAdapter, type StorageAdapter } from './storage';

export {
  fetchWritingProjects,
  fetchWritingProject,
  createWritingProject,
  updateWritingProject,
  deleteWritingProject,
  cleanupDefaultProjectDuplicates,
  seedEssayProject,
  seedWelcomeProject,
  saveProjectContent,
  saveProjectPages,
  saveProjectHighlights,
  fetchAssistantConversation,
  saveAssistantConversation,
  startAssistantStream,
  generateShortId,
  generateSlug,
  publishProject,
  unpublishProject,
  fetchPublishedEssay,
  updatePublishSettings,
} from './writing';

export {
  signup,
  signUpWithEmail,
  signInWithEmail,
  getGoogleSignInUrl,
  getSession,
  signOutSession,
  changePassword,
  setNewPassword,
  requestPasswordReset,
  resetPassword,
  type AuthSession,
  type AuthUser,
} from './auth';
export { setAccessTokenProvider, getAccessToken, apiFetch, ApiError } from './http';

export { fetchMcpServers, createMcpServer, updateMcpServer, deleteMcpServer, testMcpServer } from './mcpServers';
export type { McpServer } from './mcpServers';

export { WELCOME_PAGES, WELCOME_HIGHLIGHTS } from './welcome-seed';

export {
  toWritingProject,
} from './writing';

export type {
  WritingStatus,
  WritingProject,
  WritingProjectRow,
  AssistantMessage,
  Highlight,
  PublishedEssay,
} from './writing';
