type ConnectivityListener = (online: boolean) => void;

let online = navigator.onLine;
const listeners = new Set<ConnectivityListener>();
let probeInterval: ReturnType<typeof setInterval> | null = null;

/** Supabase REST URL to probe (set during init) */
let probeUrl: string | null = null;

/** Current connectivity status */
export function isOnline(): boolean {
  return online;
}

/** Register a callback for connectivity changes */
export function onConnectivityChange(callback: ConnectivityListener): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function setOnline(value: boolean): void {
  if (value === online) return;
  online = value;
  for (const listener of listeners) {
    try {
      listener(value);
    } catch {
      // Listener errors shouldn't break connectivity
    }
  }
}

async function probe(): Promise<void> {
  if (!probeUrl) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(probeUrl, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    setOnline(res.ok);
  } catch {
    setOnline(false);
  }
}

/**
 * Initialize connectivity detection.
 * @param supabaseUrl - The Supabase project URL for active probing in Tauri
 * @param useTauriProbe - Whether to use active probing (for Tauri where webview events can be unreliable)
 */
export function initConnectivity(supabaseUrl?: string, useTauriProbe = false): () => void {
  const handleOnline = () => setOnline(true);
  const handleOffline = () => setOnline(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Active probe for Tauri (webview online event can be unreliable)
  if (useTauriProbe && supabaseUrl) {
    probeUrl = `${supabaseUrl}/rest/v1/`;
    probe(); // Initial check
    probeInterval = setInterval(probe, 15_000);
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    if (probeInterval) {
      clearInterval(probeInterval);
      probeInterval = null;
    }
    listeners.clear();
  };
}
