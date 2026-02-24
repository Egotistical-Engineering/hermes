export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createWebSessionStorageAdapter(): StorageAdapter {
  // In-app browsers (Twitter, Instagram, etc.) can block sessionStorage.
  // Fall back to an in-memory Map so the app still renders.
  let store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  try {
    const key = '__hermes_storage_test__';
    sessionStorage.setItem(key, '1');
    sessionStorage.removeItem(key);
    store = sessionStorage;
  } catch {
    const mem = new Map<string, string>();
    store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => { mem.delete(k); },
    };
  }

  return {
    getItem: async (key: string) => store.getItem(key),
    setItem: async (key: string, value: string) => { store.setItem(key, value); },
    removeItem: async (key: string) => { store.removeItem(key); },
  };
}
