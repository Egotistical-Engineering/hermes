import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { signup } from '@hermes/api';
import useAuth from '../../hooks/useAuth';
import styles from './SignupPage.module.css';

export default function SignupPage() {
  const { session, signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const handleSignup = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      await signup(email, password);
      posthog.capture('signup_completed', { method: 'email' });

      // Auto-login: try signing in immediately
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setError('Account created but sign-in failed. Please go to login.');
      }
      // signIn succeeded → session updates via onAuthStateChange → Navigate guard redirects
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
      posthog.capture('signup_completed', { method: 'google' });
      signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Failed to sign up with Google');
      setLoading(false);
    }
  };

  const passwordChecks = {
    length: password.length >= 8,
    number: /\d/.test(password),
    symbol: /[^a-zA-Z0-9]/.test(password),
  };
  const passwordValid = passwordChecks.length && passwordChecks.number && passwordChecks.symbol;

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleSignup}>
        <h1 className={styles.title}>Sign up</h1>
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
            required
          />
        </label>
        {password && (
          <div className={styles.requirements}>
            <span className={passwordChecks.length ? styles.met : styles.unmet}>At least 8 characters</span>
            <span className={passwordChecks.number ? styles.met : styles.unmet}>Contains a number</span>
            <span className={passwordChecks.symbol ? styles.met : styles.unmet}>Contains a symbol</span>
          </div>
        )}
        <button type="submit" className={styles.primaryBtn} disabled={loading || !passwordValid}>
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
