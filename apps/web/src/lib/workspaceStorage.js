import { IS_TAURI } from './platform';

const TAB_KEYS = ['coral', 'amber', 'sage', 'sky', 'lavender'];

export function normalizePages(rawPages) {
  const pages = Object.fromEntries(TAB_KEYS.map((key) => [key, '']));
  if (!rawPages || typeof rawPages !== 'object' || Array.isArray(rawPages)) {
    return pages;
  }

  for (const key of TAB_KEYS) {
    const value = rawPages[key];
    pages[key] = typeof value === 'string' ? value : '';
  }

  return pages;
}

export async function listWorkspaceProjects(workspacePath) {
  if (!IS_TAURI || !workspacePath) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('list_workspace_projects', { workspacePath });
}

export async function getDefaultWorkspace() {
  if (!IS_TAURI) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('get_default_workspace');
}

export async function pickWorkspaceFolder() {
  if (!IS_TAURI) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('pick_workspace_folder');
}

export async function loadWorkspacePages(workspacePath) {
  if (!IS_TAURI || !workspacePath) return normalizePages(null);
  const { invoke } = await import('@tauri-apps/api/core');
  const rawPages = await invoke('load_workspace_pages', { workspacePath });
  return normalizePages(rawPages);
}

export async function saveWorkspacePages(workspacePath, pages) {
  if (!IS_TAURI || !workspacePath) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('save_workspace_pages', {
    workspacePath,
    pages: normalizePages(pages),
  });
}

export async function loadWorkspaceChat(workspacePath) {
  if (!IS_TAURI || !workspacePath) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  const raw = await invoke('load_workspace_chat', { workspacePath });
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveWorkspaceChat(workspacePath, messages) {
  if (!IS_TAURI || !workspacePath) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('save_workspace_chat', {
    workspacePath,
    chatJson: JSON.stringify(messages),
  });
}
