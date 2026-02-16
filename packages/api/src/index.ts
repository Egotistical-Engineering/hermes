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
  saveProjectContent,
  saveProjectPages,
  saveProjectHighlights,
  fetchAssistantConversation,
  saveAssistantConversation,
  startAssistantStream,
} from './writing';

export type {
  WritingStatus,
  WritingProject,
  WritingProjectRow,
  AssistantMessage,
  Highlight,
} from './writing';
