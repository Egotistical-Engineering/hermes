import { IS_TAURI } from './platform';

const SETTINGS_KEY = 'hermes-settings';
const SETTINGS_STORE_FILE = 'hermes-settings.json';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

let tauriStorePromise = null;

async function getTauriStore() {
  if (!IS_TAURI) return null;
  if (!tauriStorePromise) {
    tauriStorePromise = import('@tauri-apps/plugin-store')
      .then(({ Store }) => Store.load(SETTINGS_STORE_FILE))
      .catch(() => null);
  }
  return tauriStorePromise;
}

function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { model: DEFAULT_MODEL };
  }

  return {
    anthropicApiKey: typeof raw.anthropicApiKey === 'string' ? raw.anthropicApiKey : '',
    openaiApiKey: typeof raw.openaiApiKey === 'string' ? raw.openaiApiKey : '',
    model: typeof raw.model === 'string' ? raw.model : DEFAULT_MODEL,
  };
}

function loadLegacyLocalSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return normalizeSettings(parsed);
  } catch {
    return { model: DEFAULT_MODEL };
  }
}

export async function loadSettings() {
  if (!IS_TAURI) return loadLegacyLocalSettings();

  const store = await getTauriStore();
  if (!store) return loadLegacyLocalSettings();

  const [anthropicApiKey, openaiApiKey, model] = await Promise.all([
    store.get('anthropicApiKey'),
    store.get('openaiApiKey'),
    store.get('model'),
  ]);

  const settings = normalizeSettings({ anthropicApiKey, openaiApiKey, model });

  const legacy = loadLegacyLocalSettings();
  const hasLegacyKeys = !!legacy.anthropicApiKey || !!legacy.openaiApiKey;
  const missingStoredKeys = !settings.anthropicApiKey && !settings.openaiApiKey;

  if (hasLegacyKeys && missingStoredKeys) {
    await saveSettings(legacy);
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch {
      // localStorage unavailable
    }
    return legacy;
  }

  return settings;
}

export async function saveSettings(next) {
  const settings = normalizeSettings(next);

  if (!IS_TAURI) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // localStorage unavailable
    }
    return;
  }

  const store = await getTauriStore();
  if (!store) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // localStorage unavailable
    }
    return;
  }

  await Promise.all([
    store.set('anthropicApiKey', settings.anthropicApiKey || ''),
    store.set('openaiApiKey', settings.openaiApiKey || ''),
    store.set('model', settings.model || DEFAULT_MODEL),
  ]);
  await store.save();
}
