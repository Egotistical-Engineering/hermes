import { Link } from 'react-router-dom';
import posthog from 'posthog-js';
import { getProUpgradeUrl, createPortalSession } from '@hermes/api';
import useAuth from '../../hooks/useAuth';
import useUsage from '../../hooks/useUsage';
import styles from './UpgradePage.module.css';

export default function UpgradePage() {
  const { session } = useAuth();
  const { usage } = useUsage(session);

  const isPatron = usage?.plan === 'pro';

  const handleManageSubscription = async () => {
    if (!session?.access_token) return;
    try {
      const { url } = await createPortalSession(session.access_token);
      window.open(url, '_blank');
    } catch {
      // Silently fail
    }
  };

  if (isPatron) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>You're a Patron — thank you.</h1>
          <p className={styles.body}>
            Your support funds the contributors who build Hermes.
          </p>
          <button className={styles.primaryBtn} onClick={handleManageSubscription}>
            Manage subscription
          </button>
          <Link to="/" className={styles.backLink}>Back to writing</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Become a Patron</h1>
        <p className={styles.price}>$15/month</p>
        <p className={styles.body}>
          Hermes is open-source and built on the belief that tools should
          deepen your thinking, not replace it. Your support funds the
          contributors who make this possible.
        </p>
        <h2 className={styles.subtitle}>What you get</h2>
        <ul className={styles.features}>
          <li>300 messages per month (vs 10/day for 7 days)</li>
          <li>Early access to beta features (MCP, editor agents, and more)</li>
          <li>The satisfaction of funding independent, dignified technology</li>
        </ul>
        {getProUpgradeUrl(session?.user?.id || '') ? (
          <a
            className={styles.primaryBtn}
            href={getProUpgradeUrl(session?.user?.id || '')}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => posthog.capture('upgrade_clicked', { source: 'upgrade_page' })}
          >
            Become a Patron — $15/mo
          </a>
        ) : (
          <span className={styles.primaryBtnDisabled}>
            Become a Patron — $15/mo
          </span>
        )}
        <p className={styles.footnote}>
          Hermes is fully open-source. You can run it yourself if you prefer.
        </p>
      </div>
    </main>
  );
}
