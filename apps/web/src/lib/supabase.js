import {
  createWebSessionStorageAdapter,
  getSupabase,
  initPlatform,
  initSupabase,
  setDataSourceAdapter,
} from '@hermes/api';
import { IS_TAURI } from './platform';

const INIT_FLAG = '__hermes_api_initialized__';

export async function initWebApi() {
  if (globalThis[INIT_FLAG]) return;

  let authStorage = localStorage;
  let detectSessionInUrl = true;

  if (IS_TAURI) {
    const { tauriAuthStorage } = await import('./tauriAuthStorage');
    authStorage = tauriAuthStorage;
    detectSessionInUrl = false; // No URL-based auth in Tauri
  }

  initSupabase({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    authStorage,
    detectSessionInUrl,
  });

  initPlatform({
    serverBaseUrl: import.meta.env.VITE_CHAT_API_URL || 'http://localhost:3003',
    storage: createWebSessionStorageAdapter(),
  });

  globalThis[INIT_FLAG] = true;
}

/**
 * Initialize the offline adapter for Tauri.
 * Called after user is authenticated (needs userId).
 */
export async function initOfflineAdapter(userId) {
  if (!IS_TAURI) return;

  try {
    const { createHybridAdapter, initConnectivity, fullSync } = await import('@hermes/offline');

    // Set up connectivity detection with active probing
    initConnectivity(import.meta.env.VITE_SUPABASE_URL, true);

    // Set the data source adapter
    const adapter = createHybridAdapter(userId);
    setDataSourceAdapter(adapter);

    // Initial sync to populate Dexie from Supabase
    fullSync(userId).catch(() => {});
  } catch {
    // @hermes/offline not available — continue without offline support
  }
}

// Use top-level await to ensure init completes before getSupabase()
await initWebApi();

export const supabase = getSupabase();
