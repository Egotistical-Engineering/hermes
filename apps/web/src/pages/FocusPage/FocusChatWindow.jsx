import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import posthog from 'posthog-js';
import { fetchAssistantConversation, startAssistantStream } from '@hermes/api';
import useUsage from '../../hooks/useUsage';
import SourcesPill from './SourcesPill';
import styles from './FocusChatWindow.module.css';

const MarkdownText = lazy(() => import('../../components/MarkdownText/MarkdownText'));

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

export default function FocusChatWindow({ projectId, getPages, activeTab, onHighlights, session }) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const { usage, refresh: refreshUsage } = useUsage(session);

  // Load conversation history on mount / project change
  useEffect(() => {
    // Abort any in-flight stream from the previous project
    abortRef.current?.abort();
    abortRef.current = null;

    if (!session || !projectId) {
      setMessages([]);
      setLoaded(true);
      return;
    }

    let cancelled = false;
    setLoaded(false);

    fetchAssistantConversation(projectId)
      .then((msgs) => {
        if (cancelled) return;
        setMessages(msgs);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([]);
          setLoaded(true);
        }
      });

    return () => { cancelled = true; };
  }, [projectId, session]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !session || !projectId) return;

    const accessToken = session.access_token;
    setInput('');
    setStreaming(true);

    // Optimistic user message
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    posthog.capture('chat_message_sent', {
      message_length: text.length,
      conversation_length: messages.length,
    });

    // Start streaming placeholder for assistant
    const assistantMsg = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await startAssistantStream(projectId, text, getPages() || {}, activeTab || 'coral', accessToken, controller.signal);

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
          // Attach sources to the assistant message
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
          refreshUsage(true);
        },
        onError() {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = null;
          setToolStatus(null);
        },
      });
    } catch (err) {
      // Ignore abort errors (user navigated away or sent another message)
      if (err?.name === 'AbortError') return;

      if (err?.status === 429) {
        // Rate limited — show inline upgrade message
        const limitMsg = err.plan === 'pro'
          ? `You've reached your monthly limit of ${err.limit} messages. Your limit resets soon — thank you for supporting Hermes.`
          : err.isTrial
            ? `You've used all ${err.limit} trial messages for this month.\n\nBecome a Patron ($15/mo) to get 300 messages per month. [Learn more](/upgrade)`
            : `You've reached your daily limit of ${err.limit} messages.\n\nBecome a Patron ($15/mo) to get 300 messages per month and support Hermes development. [Learn more](/upgrade)`;

        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = {
              ...last,
              content: limitMsg,
            };
          }
          return updated;
        });
        refreshUsage(true);
      } else {
        // Remove the empty assistant message on error
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant' && !last.content) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    } finally {
      setStreaming(false);
      setToolStatus(null);
    }
  }, [input, streaming, session, projectId, getPages, activeTab, onHighlights, refreshUsage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Focus the chat input and optionally pre-fill with context (for "Reply" from highlight popover)
  const focusInput = useCallback((prefill) => {
    setExpanded(true);
    if (prefill) setInput(prefill);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Expose focusInput via a ref-like pattern
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__hermesChatFocus = focusInput;
    }
    return () => { window.__hermesChatFocus = undefined; };
  }, [focusInput]);

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

  const isLoggedIn = !!session;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {wingIcon(16)}
          <span className={styles.headerLabel}>Hermes</span>
        </div>
        <button
          className={styles.minimizeBtn}
          onClick={() => setExpanded(false)}
          aria-label="Minimize assistant"
        >
          —
        </button>
      </div>

      <div className={styles.messages}>
        {!isLoggedIn ? (
          <div className={styles.loginPrompt}>
            <p className={styles.loginText}>
              <Link to="/signup" className={styles.loginLink}>Sign up</Link> to chat with Hermes.
            </p>
          </div>
        ) : !loaded ? (
          <div className={styles.loadingSkeleton}>
            <div className={styles.skeletonLine} style={{ width: '70%' }} />
            <div className={styles.skeletonLine} style={{ width: '50%' }} />
          </div>
        ) : messages.length === 0 ? (
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

      {isLoggedIn && (
        <div className={styles.inputArea}>
          {usage && (
            <div className={styles.usageCounter}>
              {usage.remaining} messages remaining
            </div>
          )}
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
      )}
    </div>
  );
}
