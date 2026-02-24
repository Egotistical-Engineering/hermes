/**
 * Tauri secure storage adapter for Supabase auth.
 * Uses @tauri-apps/plugin-store which encrypts data using the OS keychain.
 * Implements the SupportedStorage interface from @hermes/api.
 */
import { Store } from '@tauri-apps/plugin-store';

const store = new Store('hermes-auth.json');

export const tauriAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = await store.get<string>(key);
    return value ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await store.set(key, value);
    await store.save();
  },
  async removeItem(key: string): Promise<void> {
    await store.delete(key);
    await store.save();
  },
};
