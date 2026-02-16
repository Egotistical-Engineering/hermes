import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import useAuth from '../../hooks/useAuth';
import styles from './ResetPasswordPage.module.css';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    const { error: err } = await supabase.auth.updateUser({ password });

    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }

    await signOut();
    toast.success('Password updated');
    navigate('/login', { replace: true });
  };

  return (
    <main className={styles.main}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Set new password</h1>
        {error && <p className={styles.error}>{error}</p>}
        <label className={styles.label}>
          New password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={styles.input}
            minLength={6}
            required
            autoFocus
          />
        </label>
        <label className={styles.label}>
          Confirm password
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className={styles.input}
            minLength={6}
            required
          />
        </label>
        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? 'Updating...' : 'Update password'}
        </button>
      </form>
    </main>
  );
}
