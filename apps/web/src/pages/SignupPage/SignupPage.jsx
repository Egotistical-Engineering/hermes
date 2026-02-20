import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { validateInviteCode, signupWithInvite, consumeInviteCode } from '@hermes/api';
import useAuth from '../../hooks/useAuth';
import styles from './SignupPage.module.css';

export default function SignupPage() {
  const { session, signInWithGoogle } = useAuth();
  const [step, setStep] = useState('invite'); // 'invite' | 'signup' | 'done'
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      await validateInviteCode(inviteCode);
      setStep('signup');
    } catch (err) {
      setError(err.message || 'Invalid or expired invite code');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      await signupWithInvite(email, password, inviteCode);
      posthog.capture('signup_completed', { method: 'email' });
      setStep('done');
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const result = await consumeInviteCode(inviteCode);
      posthog.capture('signup_completed', { method: 'google' });
      if (result.trialDays > 0) {
        sessionStorage.setItem('pendingTrialDays', String(result.trialDays));
      }
      signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Invalid or expired invite code');
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Account created</h1>
          <p className={styles.confirmText}>
            Your account has been created. You can now sign in.
          </p>
          <Link to="/login" className={styles.backLink}>Go to login</Link>
        </div>
      </main>
    );
  }

  if (step === 'invite') {
    return (
      <main className={styles.page}>
        <form className={styles.card} onSubmit={handleInviteSubmit}>
          <h1 className={styles.title}>Sign up</h1>
          <p className={styles.confirmText}>
            Hermes is in early beta. Enter your invite code to create an account.
          </p>
          {error && <p className={styles.error}>{error}</p>}
          <label className={styles.label}>
            Invite code
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className={styles.input}
              required
              autoFocus
              autoComplete="off"
            />
          </label>
          <button type="submit" className={styles.primaryBtn} disabled={loading}>
            {loading ? 'Checking...' : 'Continue'}
          </button>
          <p className={styles.switchText}>
            Already have an account? <Link to="/login" className={styles.switchLink}>Log in</Link>
          </p>
        </form>
      </main>
    );
  }

  // step === 'signup'
  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleSignup}>
        <h1 className={styles.title}>Create your account</h1>
        {error && <p className={styles.error}>{error}</p>}
        <label className={styles.label}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
            required
            autoFocus
          />
        </label>
        <label className={styles.label}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={styles.input}
            minLength={6}
            required
          />
        </label>
        <button type="submit" className={styles.primaryBtn} disabled={loading}>
          {loading ? 'Creating account...' : 'Sign up'}
        </button>
        <div className={styles.divider}>or</div>
        <button type="button" className={styles.googleBtn} onClick={handleGoogleSignup} disabled={loading}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
        <p className={styles.switchText}>
          Already have an account? <Link to="/login" className={styles.switchLink}>Log in</Link>
        </p>
      </form>
    </main>
  );
}
