import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AuthConfirmPage.module.css';

/**
 * Legacy Supabase email-confirmation landing page. Accounts are auto-confirmed
 * now, so any old links just land back on the app.
 */
export default function AuthConfirmPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate('/', { replace: true }), 1500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <main className={styles.main}>
      <p className={styles.status}>This link is no longer needed — redirecting you to Hermes...</p>
    </main>
  );
}
