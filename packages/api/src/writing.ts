import { getSupabase } from './supabase';
import { getPlatform } from './config';
import { ESSAY_TITLE, ESSAY_MARKDOWN, ESSAY_OUTLINE } from './essay-seed';

export type WritingStatus =
  | 'interview'
  | 'draft'
  | 'rewriting'
  | 'feedback'
  | 'complete';

export interface WritingProjectRow {
  id: string;
  user_id: string;
  title: string;
  status: WritingStatus;
  content: string;
  highlights: Highlight[];
  created_at: string;
  updated_at: string;
}

export interface WritingProject {
  id: string;
  userId: string;
  title: string;
  status: WritingStatus;
  content: string;
  highlights: Highlight[];
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  highlights?: Highlight[];
  timestamp: string;
}

export interface Highlight {
  id: string;
  type: 'question' | 'suggestion' | 'edit' | 'voice' | 'weakness' | 'evidence' | 'wordiness' | 'factcheck';
  matchText: string;
  comment: string;
  suggestedEdit?: string;
  dismissed?: boolean;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function authHeaders(accessToken?: string): HeadersInit {
  if (!accessToken) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export function toWritingProject(row: WritingProjectRow): WritingProject {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    status: row.status,
    content: row.content || '',
    highlights: (row.highlights as Highlight[]) || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchWritingProjects(): Promise<WritingProject[]> {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => toWritingProject(row as WritingProjectRow));
}

export async function fetchWritingProject(projectId: string): Promise<WritingProject | null> {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single<WritingProjectRow>();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null;
    throw error;
  }

  return toWritingProject(data);
}

export async function createWritingProject(title: string, userId: string): Promise<WritingProject> {
  const { data, error } = await getSupabase()
    .from('projects')
    .insert({
      title,
      user_id: userId,
      status: 'interview',
    })
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  return toWritingProject(data);
}

export async function updateWritingProject(
  projectId: string,
  updates: Partial<{ title: string; status: WritingStatus }>,
): Promise<WritingProject> {
  const { data, error } = await getSupabase()
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  return toWritingProject(data);
}

export async function deleteWritingProject(projectId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) throw error;
}

export async function seedEssayProject(userId: string): Promise<WritingProject> {
  const sb = getSupabase();

  const { data: project, error: projErr } = await sb
    .from('projects')
    .insert({ title: ESSAY_TITLE, user_id: userId, status: 'complete', content: ESSAY_MARKDOWN })
    .select('*')
    .single<WritingProjectRow>();

  if (projErr) throw projErr;

  const { error: intErr } = await sb
    .from('interviews')
    .insert({ project_id: project.id, messages: [], outline: ESSAY_OUTLINE });

  if (intErr) throw intErr;

  const { error: draftErr } = await sb
    .from('drafts')
    .insert({ project_id: project.id, rewrite: ESSAY_MARKDOWN, version: 1 });

  if (draftErr) throw draftErr;

  return toWritingProject(project);
}

// --- Assistant API ---

export async function saveProjectContent(projectId: string, content: string): Promise<void> {
  const { error } = await getSupabase()
    .from('projects')
    .update({ content })
    .eq('id', projectId);

  if (error) throw error;
}

export async function saveProjectHighlights(projectId: string, highlights: Highlight[]): Promise<void> {
  const { error } = await getSupabase()
    .from('projects')
    .update({ highlights: JSON.parse(JSON.stringify(highlights)) })
    .eq('id', projectId);

  if (error) throw error;
}

export async function fetchAssistantConversation(projectId: string): Promise<AssistantMessage[]> {
  const { data, error } = await getSupabase()
    .from('assistant_conversations')
    .select('messages')
    .eq('project_id', projectId)
    .single<{ messages: AssistantMessage[] }>();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return [];
    throw error;
  }

  return data.messages || [];
}

export async function saveAssistantConversation(projectId: string, messages: AssistantMessage[]): Promise<void> {
  const { error } = await getSupabase()
    .from('assistant_conversations')
    .upsert(
      {
        project_id: projectId,
        messages: JSON.parse(JSON.stringify(messages)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' },
    );

  if (error) throw error;
}

export async function startAssistantStream(
  projectId: string,
  message: string,
  editorContent: string,
  accessToken: string,
): Promise<Response> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ projectId, message, editorContent }),
  });

  if (!res.ok) {
    throw new Error('Failed to stream assistant response');
  }

  return res;
}
