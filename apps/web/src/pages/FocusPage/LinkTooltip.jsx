import styles from './LinkTooltip.module.css';

export default function LinkTooltip({ tooltip, isMac }) {
  if (!tooltip) return null;

  const { mode, rect, href } = tooltip;

  // Position above the link, centered horizontally
  const style = {
    top: rect.top - 8,
    left: rect.left + rect.width / 2,
  };

  if (mode === 'hover') {
    const shortcut = isMac ? '\u2318+click to open' : 'Ctrl+click to open';
    return (
      <div className={`${styles.tooltip} ${styles.hoverTooltip}`} style={style}>
        {shortcut}
      </div>
    );
  }

  if (mode === 'editing') {
    return (
      <div className={`${styles.tooltip} ${styles.editingTooltip}`} style={style}>
        <a
          className={styles.openBtn}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onMouseDown={(e) => e.preventDefault()}
        >
          Open &#8599;
        </a>
      </div>
    );
  }

  return null;
}
