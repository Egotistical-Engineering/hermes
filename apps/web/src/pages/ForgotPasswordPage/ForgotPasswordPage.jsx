import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import styles from './ForgotPasswordPage.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    const { error: err } = await supabase.auth.resetPasswordForEmail(email);

    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <main className={styles.main}>
        <div className={styles.form}>
          <h1 className={styles.title}>Check your email</h1>
          <p className={styles.hint}>A password reset link was sent to <strong>{email}</strong>. Click it to set a new password.</p>
          <Link to="/login" className={styles.submit}>Back to login</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Reset password</h1>
        {error && <p className={styles.error}>{error}</p>}
        <label className={styles.label}>
          Email
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={styles.input}
            required
            autoFocus
          />
        </label>
        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
        <p className={styles.switchLink}>Remember your password? <Link to="/login">Log in</Link></p>
      </form>
    </main>
  );
}
