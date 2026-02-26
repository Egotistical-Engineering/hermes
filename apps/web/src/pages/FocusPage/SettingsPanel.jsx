import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './SettingsPanel.module.css';
import { loadSettings, saveSettings } from '../../lib/settingsStorage';
import { IS_TAURI } from '../../lib/platform';

export default function SettingsPanel({ isOpen, onClose }) {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [devtoolsMessage, setDevtoolsMessage] = useState('');
  const panelRef = useRef(null);

  // Load keys when panel opens
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    (async () => {
      const settings = await loadSettings();
      if (cancelled) return;
      setAnthropicKey(settings.anthropicApiKey || '');
      setOpenaiKey(settings.openaiApiKey || '');
      setSaved(false);
      setSaving(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const settings = await loadSettings();
    settings.anthropicApiKey = anthropicKey;
    settings.openaiApiKey = openaiKey;
    await saveSettings(settings);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [anthropicKey, openaiKey]);

  const handleToggleDevtools = useCallback(async () => {
    if (!IS_TAURI) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('toggle_devtools');
      setDevtoolsMessage('');
    } catch {
      setDevtoolsMessage('DevTools unavailable in this build. Start with `npm run native:dev:debugtools`.');
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} ref={panelRef}>
        <div className={styles.header}>
          <span className={styles.title}>API Keys</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <label className={styles.label}>
            Anthropic
            <input
              className={styles.input}
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          <label className={styles.label}>
            OpenAI
            <input
              className={styles.input}
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-..."
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          <span className={styles.hint}>Keys are stored locally on your device and sent with each request.</span>

          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saved ? 'Saved' : 'Save'}
          </button>

          {IS_TAURI && (
            <>
              <button className={styles.debugBtn} onClick={handleToggleDevtools} type="button">
                Toggle DevTools (Debug)
              </button>
              {devtoolsMessage && (
                <span className={styles.debugHint}>{devtoolsMessage}</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
