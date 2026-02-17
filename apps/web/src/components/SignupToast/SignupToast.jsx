import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './SignupToast.module.css';

const DISMISSED_KEY = 'hermes-signup-toast-dismissed';

export default function SignupToast({ wordCount, isLoggedIn }) {
  const [visible, setVisible] = useState(false);
  const initialWordCount = useRef(null);

  useEffect(() => {
    if (isLoggedIn) return;

    // Capture the first non-zero word count as baseline (content loaded)
    if (initialWordCount.current === null && wordCount > 0) {
      initialWordCount.current = wordCount;
      return;
    }

    // User has typed new words beyond the initial content
    if (initialWordCount.current !== null && wordCount > initialWordCount.current) {
      try {
        if (localStorage.getItem(DISMISSED_KEY)) return;
      } catch {
        // localStorage unavailable
      }
      setVisible(true);
    }
  }, [wordCount, isLoggedIn]);

  if (!visible) return null;

  function handleDismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // localStorage unavailable
    }
  }

  return (
    <div className={styles.toast}>
      <p className={styles.message}>
        <Link to="/signup" className={styles.link}>Sign up</Link> to save
      </p>
      <button className={styles.dismiss} onClick={handleDismiss} aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="3" y1="3" x2="11" y2="11" />
          <line x1="11" y1="3" x2="3" y2="11" />
        </svg>
      </button>
    </div>
  );
}
