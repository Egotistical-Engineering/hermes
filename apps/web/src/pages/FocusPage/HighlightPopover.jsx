import { useEffect, useRef } from 'react';
import styles from './HighlightPopover.module.css';

const TYPE_LABELS = {
  question: 'Question',
  suggestion: 'Suggestion',
  edit: 'Edit',
  voice: 'Voice',
  weakness: 'Weakness',
  evidence: 'Evidence',
  wordiness: 'Wordiness',
  factcheck: 'Fact Check',
};

export default function HighlightPopover({
  highlight,
  rect,
  onDismiss,
  onAcceptEdit,
  onReply,
}) {
  const popoverRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onDismiss();
      }
    };
    // Delay to avoid immediate close from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onDismiss]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onDismiss]);

  if (!highlight || !rect) return null;

  // Position below the highlight, centered horizontally
  const top = rect.bottom + 8;
  const left = rect.left + rect.width / 2;

  return (
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{ top, left }}
    >
      <div className={`${styles.badge} ${styles[`badge_${highlight.type}`]}`}>
        {TYPE_LABELS[highlight.type]}
      </div>
      <div className={styles.comment}>{highlight.comment}</div>

      {(highlight.type === 'edit' || highlight.type === 'wordiness') && highlight.suggestedEdit && (
        <div className={styles.editPreview}>
          <div className={styles.editLabel}>Suggested replacement:</div>
          <div className={styles.editText}>{highlight.suggestedEdit}</div>
        </div>
      )}

      <div className={styles.actions}>
        {(highlight.type === 'edit' || highlight.type === 'wordiness') && highlight.suggestedEdit ? (
          <>
            <button
              className={styles.acceptBtn}
              onClick={() => onAcceptEdit(highlight)}
            >
              Accept
            </button>
            <button className={styles.dismissBtn} onClick={() => onDismiss(highlight.id)}>
              Dismiss
            </button>
          </>
        ) : (
          <>
            <button
              className={styles.replyBtn}
              onClick={() => onReply(highlight)}
            >
              Reply
            </button>
            <button className={styles.dismissBtn} onClick={() => onDismiss(highlight.id)}>
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}
