import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAssistantConversation, startAssistantStream } from '@hermes/api';
import MarkdownText from '../../components/MarkdownText/MarkdownText';
import styles from './FocusChatWindow.module.css';

/**
 * Reads a structured SSE stream (event: text | highlight | done | error).
 */
async function readAssistantStream(response, { onText, onHighlight, onDone, onError }) {
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

export default function FocusChatWindow({ projectId, pages, activeTab, onHighlights, session }) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load conversation history on mount / project change
  useEffect(() => {
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

    // Start streaming placeholder for assistant
    const assistantMsg = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await startAssistantStream(projectId, text, pages || {}, activeTab || 'coral', accessToken);

      const collectedHighlights = [];

      await readAssistantStream(response, {
        onText(chunk) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + chunk };
            }
            return updated;
          });
        },
        onHighlight(highlight) {
          collectedHighlights.push(highlight);
        },
        onDone() {
          if (collectedHighlights.length > 0) {
            onHighlights?.(collectedHighlights);
          }
        },
        onError() {
          // Error handled by stream ending
        },
      });
    } catch {
      // Remove the empty assistant message on error
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last.role === 'assistant' && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, session, projectId, pages, activeTab, onHighlights]);

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
              <Link to="/signup" className={styles.loginLink}>Sign up</Link> to chat with Hermes
            </p>
          </div>
        ) : !loaded ? (
          <div className={styles.loadingText}>Loading...</div>
        ) : messages.length === 0 ? (
          <div className={styles.emptyState}>
            Ask me anything about your writing.
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={msg.role === 'user' ? styles.msgUser : styles.msgAssistant}
            >
              <div className={styles.msgText}>
                {msg.role === 'assistant' ? <MarkdownText value={msg.content} /> : msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {isLoggedIn && (
        <div className={styles.inputArea}>
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
