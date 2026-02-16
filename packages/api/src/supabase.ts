import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type CreateClientOptions = Parameters<typeof createClient>[2];
export type SupportedStorage = NonNullable<NonNullable<CreateClientOptions>['auth']>['storage'];

interface PlatformConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  authStorage: SupportedStorage;
  detectSessionInUrl: boolean;
}

let client: SupabaseClient | null = null;

export function initSupabase(config: PlatformConfig): SupabaseClient {
  if (client) {
    throw new Error('Supabase already initialized. Call initSupabase() only once.');
  }

  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: config.authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: config.detectSessionInUrl,
    },
  });

  return client;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error('Supabase not initialized. Call initSupabase() first.');
  }
  return client;
}

export function _resetSupabase(): void {
  client = null;
}
