import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import styles from './AuthConfirmPage.module.css';

export default function AuthConfirmPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('Verifying your link...');
  const [error, setError] = useState('');
  const [nextUrl, setNextUrl] = useState('');

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      const type = params.get('type');
      const next = params.get('next') || '';
      setNextUrl(next);

      if (!tokenHash || !type) {
        if (!mounted) return;
        setError('Invalid confirmation link.');
        setStatus('Unable to verify link.');
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (verifyError) {
        if (!mounted) return;
        setError(verifyError.message || 'Verification failed.');
        setStatus('Unable to verify link.');
        return;
      }

      if (!mounted) return;

      setStatus('Verified. Redirecting...');

      if (type === 'recovery') {
        navigate('/reset-password', { replace: true });
        return;
      }

      if (next && next.startsWith('hermes://')) {
        window.location.assign(next);
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 1200);
        return;
      }

      navigate('/login', { replace: true });
    };

    run().catch((err) => {
      if (!mounted) return;
      setError(err?.message || 'Verification failed.');
      setStatus('Unable to verify link.');
    });

    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <h1 className={styles.title}>Hermes Auth</h1>
        <p className={styles.status}>{status}</p>
        {error ? <p className={styles.error}>{error}</p> : null}

        {nextUrl && nextUrl.startsWith('hermes://') ? (
          <button
            className={styles.button}
            onClick={() => window.location.assign(nextUrl)}
            type="button"
          >
            Open in App
          </button>
        ) : null}
      </div>
    </main>
  );
}
