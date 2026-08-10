import { initPlatform, createWebSessionStorageAdapter, setDataSourceAdapter } from '@hermes/api';
import { IS_TAURI } from './platform';

const INIT_FLAG = '__hermes_api_initialized__';

export function initWebApi() {
  if (globalThis[INIT_FLAG]) return;

  initPlatform({
    serverBaseUrl: import.meta.env.VITE_CHAT_API_URL || 'http://localhost:3003',
    storage: createWebSessionStorageAdapter(),
  });

  globalThis[INIT_FLAG] = true;
}

/**
 * Initialize the offline adapter for Tauri.
 * Called after user is authenticated (needs userId).
 * NOTE: the offline package still syncs against Supabase and needs its own
 * migration pass — until then, native builds run online-only.
 */
// @hermes/offline still syncs against Supabase, which no longer exists.
// Native runs online-only (same fetch paths as web) until the offline
// package is ported to sync against the REST API — flip this when it is.
const OFFLINE_SYNC_ENABLED = false;

export async function initOfflineAdapter(userId) {
  if (!IS_TAURI || !OFFLINE_SYNC_ENABLED) return;
  try {
    const { createHybridAdapter, initConnectivity, fullSync } = await import('@hermes/offline');
    initConnectivity(import.meta.env.VITE_CHAT_API_URL, true);
    const adapter = createHybridAdapter(userId);
    setDataSourceAdapter(adapter);
    fullSync(userId).catch(() => {});
  } catch {
    // @hermes/offline not available — continue without offline support
  }
}

initWebApi();
