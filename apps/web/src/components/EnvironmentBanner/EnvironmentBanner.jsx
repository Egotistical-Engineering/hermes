import { useState } from 'react';
import styles from './EnvironmentBanner.module.css';

const MODE = import.meta.env.MODE;

const CONFIG = {
  development: { label: 'Local Dev', className: styles.dev },
  staging: { label: 'Staging', className: styles.staging },
};

export default function EnvironmentBanner() {
  const [dismissed, setDismissed] = useState(false);

  const config = CONFIG[MODE];
  if (!config || dismissed) return null;

  return (
    <div className={`${styles.banner} ${config.className}`}>
      {config.label}
      <button className={styles.close} onClick={() => setDismissed(true)} aria-label="Dismiss banner">
        &times;
      </button>
    </div>
  );
}
