export { initSupabase, getSupabase, _resetSupabase, type SupportedStorage } from './supabase';
export { initPlatform, getPlatform } from './config';
export { createWebSessionStorageAdapter, type StorageAdapter } from './storage';

export {
  fetchWritingProjects,
  fetchWritingProject,
  createWritingProject,
  updateWritingProject,
  deleteWritingProject,
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

export { validateInviteCode, signupWithInvite, consumeInviteCode, activateTrial } from './auth';

export { fetchCurrentUsage, getProUpgradeUrl, createPortalSession } from './billing';
export type { UsageInfo } from './billing';

export { fetchMcpServers, createMcpServer, updateMcpServer, deleteMcpServer, testMcpServer } from './mcpServers';
export type { McpServer } from './mcpServers';

export { WELCOME_PAGES, WELCOME_HIGHLIGHTS } from './welcome-seed';

export type {
  WritingStatus,
  WritingProject,
  WritingProjectRow,
  AssistantMessage,
  Highlight,
  PublishedEssay,
} from './writing';
