import {
  createWebSessionStorageAdapter,
  getSupabase,
  initPlatform,
  initSupabase,
} from '@hermes/api';

const INIT_FLAG = '__hermes_api_initialized__';

export function initWebApi() {
  if (globalThis[INIT_FLAG]) return;

  initSupabase({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    authStorage: localStorage,
    detectSessionInUrl: true,
  });

  initPlatform({
    serverBaseUrl: import.meta.env.VITE_CHAT_API_URL || 'http://localhost:3003',
    storage: createWebSessionStorageAdapter(),
  });

  globalThis[INIT_FLAG] = true;
}

initWebApi();

export const supabase = getSupabase();
