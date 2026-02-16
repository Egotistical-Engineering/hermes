import type { StorageAdapter } from './storage';

interface PlatformSettings {
  serverBaseUrl: string;
  storage: StorageAdapter;
}

let settings: PlatformSettings | null = null;

export function initPlatform(config: PlatformSettings): void {
  settings = config;
}

export function getPlatform(): PlatformSettings {
  if (!settings) {
    throw new Error('Platform not configured. Call initPlatform() first.');
  }
  return settings;
}
