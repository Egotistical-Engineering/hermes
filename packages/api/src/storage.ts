export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createWebSessionStorageAdapter(): StorageAdapter {
  return {
    getItem: async (key: string) => sessionStorage.getItem(key),
    setItem: async (key: string, value: string) => {
      sessionStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
      sessionStorage.removeItem(key);
    },
  };
}
