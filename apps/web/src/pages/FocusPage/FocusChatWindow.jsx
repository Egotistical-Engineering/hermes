import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import SourcesPill from './SourcesPill';
import styles from './FocusChatWindow.module.css';
import { loadSettings, saveSettings } from '../../lib/settingsStorage';

const MarkdownText = lazy(() => import('../../components/MarkdownText/MarkdownText'));

const CHAT_STORAGE_KEY = 'hermes-chat-messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

const MODELS = [
  { provider: 'anthropic', value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { provider: 'anthropic', value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { provider: 'anthropic', value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { provider: 'openai', value: 'gpt-4o', label: 'GPT-4o' },
  { provider: 'openai', value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
];

const PROVIDERS = ['anthropic', 'openai'];

function getProviderForModel(modelValue) {
  const entry = MODELS.find((m) => m.value === modelValue);
  return entry?.provider || 'anthropic';
}

function normalizeModel(modelValue) {
  if (MODELS.some((m) => m.value === modelValue)) return modelValue;
  return DEFAULT_MODEL;
}

function getApiKeyForProvider(settings, provider) {
  if (provider === 'openai') return settings.openaiApiKey || '';
  return settings.anthropicApiKey || '';
}

/**
 * Reads a structured SSE stream (event: text | highlight | done | error).
 */
async function readAssistantStream(response, { onText, onHighlight, onSource, onToolStatus, onDone, onError }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'text';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (currentEvent === 'text') {
            onText?.(parsed.chunk);
          } else if (currentEvent === 'highlight') {
            onHighlight?.(parsed);
          } else if (currentEvent === 'source') {
            onSource?.(parsed);
          } else if (currentEvent === 'tool_status') {
            onToolStatus?.(parsed);
          } else if (currentEvent === 'done') {
            onDone?.(parsed);
          } else if (currentEvent === 'error') {
            onError?.(parsed);
          }
        } catch {
          // Non-JSON data line, skip
        }
      }
    }
  }
}

function ModelSelector({ selectedModel, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const currentModel = MODELS.find((m) => m.value === selectedModel) || MODELS[0];

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.modelSelector} ref={ref}>
      <button
        className={styles.modelBtn}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {currentModel.label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2.5 4L5 6.5L7.5 4" />
        </svg>
      </button>
      {open && (
        <div className={styles.modelDropdown}>
          {PROVIDERS.map((provider) => (
            <div key={provider}>
              <div className={styles.modelGroupLabel}>
                {provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}
              </div>
              {MODELS.filter((m) => m.provider === provider).map((m) => (
                <button
                  key={m.value}
                  className={`${styles.modelOption} ${m.value === selectedModel ? styles.modelOptionSelected : ''}`}
                  onClick={() => {
                    onSelect(m.value);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span>{m.label}</span>
                  {m.value === selectedModel && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6L5 8.5L9.5 3.5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FocusChatWindow({ getPages, activeTab, onHighlights }) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState(null);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const settings = await loadSettings();
      const nextModel = normalizeModel(settings.model);
      if (!cancelled) {
        setSelectedModel(nextModel);
      }
      if (settings.model !== nextModel) {
        settings.model = nextModel;
        await saveSettings(settings);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist model selection
  const handleModelSelect = useCallback((modelValue) => {
    setSelectedModel(modelValue);
    void (async () => {
      const settings = await loadSettings();
      settings.model = modelValue;
      await saveSettings(settings);
    })();
  }, []);

  // Load conversation from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  // Save conversation to localStorage when messages change
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // localStorage full
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const settings = await loadSettings();
    const model = normalizeModel(selectedModel);
    const provider = getProviderForModel(model);
    const apiKey = getApiKeyForProvider(settings, provider);

    if (!apiKey) {
      const providerName = provider === 'anthropic' ? 'Anthropic' : 'OpenAI';
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text, timestamp: new Date().toISOString() },
        { role: 'assistant', content: `Please add your ${providerName} API key in Settings (gear icon) before sending messages.`, timestamp: new Date().toISOString() },
      ]);
      setInput('');
      return;
    }

    setInput('');
    setStreaming(true);

    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    const assistantMsg = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Build conversation history for the backend (last 30 messages)
      const allMsgs = [...messages, userMsg];
      const conversationHistory = allMsgs.slice(-30).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('http://127.0.0.1:3003/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          pages: getPages() || {},
          activeTab: activeTab || 'coral',
          provider,
          model,
          apiKey,
          conversationHistory,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = new Error('Failed to stream assistant response');
        err.status = response.status;
        try {
          const body = await response.json();
          err.serverMessage = body.error || body.message;
        } catch { /* */ }
        throw err;
      }

      const collectedHighlights = [];
      const collectedSources = [];
      let textBuffer = '';
      let rafId = null;

      function flushTextBuffer() {
        if (!textBuffer) return;
        const flushed = textBuffer;
        textBuffer = '';
        setMessages((prev) => {
          const updated = prev.slice(0, -1);
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            updated.push({ ...last, content: last.content + flushed });
          } else {
            updated.push(last);
          }
          return updated;
        });
      }

      await readAssistantStream(response, {
        onText(chunk) {
          textBuffer += chunk;
          if (rafId === null) {
            rafId = requestAnimationFrame(() => {
              rafId = null;
              flushTextBuffer();
            });
          }
        },
        onHighlight(highlight) {
          collectedHighlights.push(highlight);
        },
        onSource(source) {
          collectedSources.push(source);
        },
        onToolStatus(status) {
          if (status.status === 'running') {
            setToolStatus(status);
          } else {
            setToolStatus(null);
          }
        },
        onDone() {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = null;
          flushTextBuffer();
          if (collectedHighlights.length > 0) {
            onHighlights?.(collectedHighlights);
          }
          if (collectedSources.length > 0) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, sources: collectedSources };
              }
              return updated;
            });
          }
          setToolStatus(null);
        },
        onError() {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = null;
          setToolStatus(null);
        },
      });
    } catch (err) {
      if (err?.name === 'AbortError') return;

      const errorMsg = err?.serverMessage || 'Something went wrong. Check your API key and try again.';
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === 'assistant' && !last.content) {
          updated[updated.length - 1] = { ...last, content: errorMsg };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
      setToolStatus(null);
    }
  }, [input, streaming, messages, getPages, activeTab, onHighlights, selectedModel]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const focusInput = useCallback((prefill) => {
    setExpanded(true);
    if (prefill) setInput(prefill);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__hermesChatFocus = focusInput;
    }
    return () => { window.__hermesChatFocus = undefined; };
  }, [focusInput]);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch { /* */ }
  }, []);

  const wingIcon = (size) => (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 17L9 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 4C7.5 4 4 3.5 2 1C3.5 4 4.5 7 5 9C6 7 7.5 5.5 9 4Z" fill="currentColor"/>
      <path d="M9 4C10.5 4 14 3.5 16 1C14.5 4 13.5 7 13 9C12 7 10.5 5.5 9 4Z" fill="currentColor"/>
    </svg>
  );

  if (!expanded) {
    return (
      <button
        className={styles.fab}
        onClick={() => setExpanded(true)}
        aria-label="Open assistant"
      >
        {wingIcon(20)}
      </button>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {wingIcon(16)}
          <span className={styles.headerLabel}>Hermes</span>
        </div>
        <div className={styles.headerRight}>
          {messages.length > 0 && (
            <button
              className={styles.clearBtn}
              onClick={handleClearChat}
              title="Clear chat"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 4h12M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6.5 7v5M9.5 7v5M3.5 4l.5 9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l.5-9" />
              </svg>
            </button>
          )}
          <button
            className={styles.minimizeBtn}
            onClick={() => setExpanded(false)}
            aria-label="Minimize assistant"
          >
            —
          </button>
        </div>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            Ask me anything about your writing.
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i}>
              <div className={msg.role === 'user' ? styles.msgUser : styles.msgAssistant}>
                <div className={styles.msgText}>
                  {msg.role === 'assistant' ? (
                    <Suspense fallback={<span>{msg.content}</span>}>
                      <MarkdownText value={msg.content} />
                    </Suspense>
                  ) : msg.content}
                </div>
              </div>
              {msg.role === 'assistant' && msg.sources?.length > 0 && (
                <SourcesPill sources={msg.sources} />
              )}
            </div>
          ))
        )}
        {toolStatus && (
          <div className={styles.toolStatusIndicator}>
            Searching {toolStatus.server === 'arena' ? 'Are.na' : toolStatus.server}...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputRow}>
          <ModelSelector selectedModel={selectedModel} onSelect={handleModelSelect} />
          <input
            ref={inputRef}
            className={styles.inputField}
            type="text"
            placeholder={streaming ? 'Hermes is thinking...' : 'Type a message...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
          />
        </div>
      </div>
    </div>
  );
}
