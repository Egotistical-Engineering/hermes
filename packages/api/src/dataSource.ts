import type { WritingProject, WritingStatus, AssistantMessage, Highlight } from './writing';

/**
 * DataSourceAdapter — optional injection point for offline-first storage.
 * When set, writing.ts functions delegate to this adapter instead of Supabase.
 * When not set (default), existing Supabase behavior is unchanged.
 */
export interface DataSourceAdapter {
  fetchProjects(): Promise<WritingProject[]>;
  fetchProject(projectId: string): Promise<WritingProject | null>;
  createProject(title: string, userId: string): Promise<WritingProject>;
  updateProject(projectId: string, updates: Partial<{ title: string; subtitle: string; status: WritingStatus }>): Promise<WritingProject>;
  deleteProject(projectId: string): Promise<void>;
  savePages(projectId: string, pages: Record<string, string>): Promise<void>;
  saveContent(projectId: string, content: string): Promise<void>;
  saveHighlights(projectId: string, highlights: Highlight[]): Promise<void>;
  fetchConversation(projectId: string): Promise<AssistantMessage[]>;
  saveConversation(projectId: string, messages: AssistantMessage[]): Promise<void>;
}

let adapter: DataSourceAdapter | null = null;

export function setDataSourceAdapter(a: DataSourceAdapter): void {
  adapter = a;
}

export function getDataSource(): DataSourceAdapter | null {
  return adapter;
}
