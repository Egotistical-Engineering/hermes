import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPortalSession } from '@hermes/api';
import { supabase } from '../../lib/supabase';
import useAuth from '../../hooks/useAuth';
import useUsage from '../../hooks/useUsage';
import McpSettingsView from './McpSettingsView';
import styles from './UserMenu.module.css';

export default function UserMenu({ onDropdownOpen, onDropdownClose }) {
  const { session, signIn, signInWithGoogle, signOut, updatePassword } = useAuth();
  const { usage } = useUsage(session);
  const wrapperRef = useRef(null);
  const passwordInputRef = useRef(null);
  const loginEmailRef = useRef(null);
  const signupEmailRef = useRef(null);
  const forgotEmailRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState('menu'); // 'menu' | 'password' | 'billing' | 'mcp' | 'login' | 'signup' | 'signupDone' | 'forgotPassword' | 'forgotPasswordDone'
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isLoggedIn = !!session;
  const email = session?.user?.email;

  const openDropdown = useCallback(() => {
    setOpen(true);
    onDropdownOpen?.();
  }, [onDropdownOpen]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setView('menu');
    setNewPassword('');
    setConfirmPassword('');
    setLoginEmail('');
    setLoginPassword('');
    setSignupEmail('');
    setSignupPassword('');
    setForgotEmail('');
    setError('');
    setSuccess(false);
    onDropdownClose?.();
  }, [onDropdownClose]);

  const toggleDropdown = useCallback(() => {
    if (open) closeDropdown();
    else openDropdown();
  }, [open, openDropdown, closeDropdown]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, closeDropdown]);

  // Escape key: back out of sub-views first, then close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (view === 'password' || view === 'billing' || view === 'mcp' || view === 'login' || view === 'signup' || view === 'signupDone' || view === 'forgotPassword' || view === 'forgotPasswordDone') {
          setView('menu');
          setError('');
        } else {
          closeDropdown();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, view, closeDropdown]);

  // Auto-focus inputs when switching views
  useEffect(() => {
    if (view === 'password' && passwordInputRef.current) passwordInputRef.current.focus();
    if (view === 'login' && loginEmailRef.current) loginEmailRef.current.focus();
    if (view === 'signup' && signupEmailRef.current) signupEmailRef.current.focus();
    if (view === 'forgotPassword' && forgotEmailRef.current) forgotEmailRef.current.focus();
  }, [view]);

  // Auto-close on success
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(closeDropdown, 1500);
    return () => clearTimeout(timer);
  }, [success, closeDropdown]);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { error: err } = await signIn(loginEmail, loginPassword);
      if (err) {
        setError(err.message);
      } else {
        closeDropdown();
      }
    } catch (err) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.signUp({ email: signupEmail, password: signupPassword });
      if (err) {
        setError(err.message);
      } else {
        setView('signupDone');
      }
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail);
      if (err) {
        setError(err.message);
      } else {
        setView('forgotPasswordDone');
      }
    } catch (err) {
      setError(err.message || 'Failed to send reset link');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    closeDropdown();
    await signOut();
  };

  const handleManageSubscription = async () => {
    if (!session?.access_token) return;
    try {
      const { url } = await createPortalSession(session.access_token);
      window.open(url, '_blank');
    } catch {
      // Silently fail
    }
  };

  const initial = email ? email[0].toUpperCase() : null;

  const personIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <button
        className={styles.avatarBtn}
        onClick={toggleDropdown}
        title={email || 'Account'}
      >
        {isLoggedIn ? initial : personIcon}
      </button>

      {open && (
        <div className={styles.menu}>
          {isLoggedIn ? (
            view === 'password' ? (
              <form className={styles.passwordForm} onSubmit={handlePasswordSubmit}>
                <div className={styles.passwordTitle}>Change Password</div>
                <input
                  ref={passwordInputRef}
                  className={styles.passwordInput}
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <input
                  className={styles.passwordInput}
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {error && <div className={styles.passwordError}>{error}</div>}
                {success && <div className={styles.passwordSuccess}>Password updated</div>}
                <div className={styles.passwordActions}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => {
                      setView('menu');
                      setNewPassword('');
                      setConfirmPassword('');
                      setError('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.updateBtn}
                    disabled={submitting}
                  >
                    {submitting ? 'Updating...' : 'Update'}
                  </button>
                </div>
              </form>
            ) : view === 'mcp' ? (
              <McpSettingsView session={session} onBack={() => setView('menu')} />
            ) : view === 'billing' ? (
              <div className={styles.billingView}>
                <div className={styles.billingTitle}>Billing</div>
                <div className={styles.billingPlan}>
                  {usage?.plan === 'pro' ? 'Patron' : usage?.isTrial ? 'Trial' : 'Free'} plan
                  {usage?.isTrial && usage?.trialExpiresAt && (
                    <span className={styles.billingCancelNote}>
                      {' '}({Math.max(0, Math.ceil((new Date(usage.trialExpiresAt) - Date.now()) / (1000 * 60 * 60 * 24)))} days remaining)
                    </span>
                  )}
                  {usage?.cancelAtPeriodEnd && usage?.currentPeriodEnd && (
                    <span className={styles.billingCancelNote}>
                      {' '}(cancels {new Date(usage.currentPeriodEnd).toLocaleDateString()})
                    </span>
                  )}
                </div>
                {usage && (
                  <div className={styles.billingUsage}>
                    {usage.used} / {usage.limit} messages used
                  </div>
                )}
                {usage?.plan === 'pro' ? (
                  <>
                    <div className={styles.billingThankYou}>
                      Thank you for supporting Hermes. Your patronage funds the contributors who build this tool.
                    </div>
                    <button
                      className={styles.billingActionBtn}
                      onClick={handleManageSubscription}
                    >
                      Manage subscription
                    </button>
                  </>
                ) : usage?.isTrial ? (
                  <>
                    <div className={styles.billingThankYou}>
                      After your trial, you'll have 10 messages/day on the Free plan.
                    </div>
                    <Link
                      className={styles.billingActionBtn}
                      to="/upgrade"
                      onClick={closeDropdown}
                    >
                      Become a Patron — $15/mo
                    </Link>
                  </>
                ) : (
                  <>
                    <ul className={styles.billingFeatures}>
                      <li>300 messages/month</li>
                      <li>Early access to beta features</li>
                      <li>Support independent development</li>
                    </ul>
                    <Link
                      className={styles.billingActionBtn}
                      to="/upgrade"
                      onClick={closeDropdown}
                    >
                      Become a Patron — $15/mo
                    </Link>
                  </>
                )}
                <button
                  className={styles.billingBackBtn}
                  onClick={() => setView('menu')}
                >
                  Back
                </button>
              </div>
            ) : (
              <>
                <div className={styles.emailSection}>
                  <div className={styles.emailLabel}>Account</div>
                  <div className={styles.emailValue}>{email}</div>
                </div>
                <div className={styles.menuItems}>
                  <button
                    className={styles.menuItem}
                    onClick={() => setView('password')}
                  >
                    Change Password
                  </button>
                  <button
                    className={styles.menuItem}
                    onClick={() => setView('billing')}
                  >
                    Billing
                  </button>
                  {usage?.hasMcpAccess && (
                    <button
                      className={styles.menuItem}
                      onClick={() => setView('mcp')}
                    >
                      MCP Servers <span className={styles.betaBadge}>beta</span>
                    </button>
                  )}
                  <button
                    className={`${styles.menuItem} ${styles.menuItemDanger}`}
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </button>
                </div>
              </>
            )
          ) : view === 'login' ? (
            <form className={styles.loginForm} onSubmit={handleLoginSubmit}>
              <div className={styles.loginTitle}>Sign In</div>
              <input
                ref={loginEmailRef}
                className={styles.loginInput}
                type="email"
                placeholder="Email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
              <input
                className={styles.loginInput}
                type="password"
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
              <div className={styles.forgotLink}>
                <button type="button" className={styles.switchBtn} onClick={() => { setError(''); setView('forgotPassword'); }}>
                  Forgot password?
                </button>
              </div>
              {error && <div className={styles.loginError}>{error}</div>}
              <button
                type="submit"
                className={styles.loginSubmitBtn}
                disabled={submitting}
              >
                {submitting ? 'Signing in...' : 'Log in'}
              </button>
              <button
                type="button"
                className={styles.googleBtn}
                onClick={signInWithGoogle}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              <div className={styles.switchLink}>
                No account?{' '}
                <button type="button" className={styles.switchBtn} onClick={() => { setError(''); setView('signup'); }}>
                  Sign up
                </button>
              </div>
            </form>
          ) : view === 'signup' ? (
            <form className={styles.loginForm} onSubmit={handleSignupSubmit}>
              <div className={styles.loginTitle}>Sign Up</div>
              <input
                ref={signupEmailRef}
                className={styles.loginInput}
                type="email"
                placeholder="Email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                required
              />
              <input
                className={styles.loginInput}
                type="password"
                placeholder="Password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                minLength={6}
                required
              />
              {error && <div className={styles.loginError}>{error}</div>}
              <button
                type="submit"
                className={styles.loginSubmitBtn}
                disabled={submitting}
              >
                {submitting ? 'Creating account...' : 'Sign up'}
              </button>
              <button
                type="button"
                className={styles.googleBtn}
                onClick={signInWithGoogle}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              <div className={styles.switchLink}>
                Already have an account?{' '}
                <button type="button" className={styles.switchBtn} onClick={() => { setError(''); setView('login'); }}>
                  Log in
                </button>
              </div>
            </form>
          ) : view === 'signupDone' ? (
            <div className={styles.loginForm}>
              <div className={styles.loginTitle}>Check your email</div>
              <div className={styles.signupDoneText}>
                A confirmation link was sent to <strong>{signupEmail}</strong>. Click it to activate your account.
              </div>
              <button
                type="button"
                className={styles.loginSubmitBtn}
                onClick={() => { setError(''); setView('login'); }}
              >
                Go to login
              </button>
            </div>
          ) : view === 'forgotPassword' ? (
            <form className={styles.loginForm} onSubmit={handleForgotSubmit}>
              <div className={styles.loginTitle}>Reset password</div>
              <input
                ref={forgotEmailRef}
                className={styles.loginInput}
                type="email"
                placeholder="Email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
              {error && <div className={styles.loginError}>{error}</div>}
              <button
                type="submit"
                className={styles.loginSubmitBtn}
                disabled={submitting}
              >
                {submitting ? 'Sending...' : 'Send reset link'}
              </button>
              <div className={styles.switchLink}>
                Remember your password?{' '}
                <button type="button" className={styles.switchBtn} onClick={() => { setError(''); setView('login'); }}>
                  Log in
                </button>
              </div>
            </form>
          ) : view === 'forgotPasswordDone' ? (
            <div className={styles.loginForm}>
              <div className={styles.loginTitle}>Check your email</div>
              <div className={styles.signupDoneText}>
                A password reset link was sent to <strong>{forgotEmail}</strong>. Click it to set a new password.
              </div>
              <button
                type="button"
                className={styles.loginSubmitBtn}
                onClick={() => { setError(''); setView('login'); }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <div className={styles.menuItems}>
              <button
                className={styles.menuItem}
                onClick={() => { setError(''); setView('login'); }}
              >
                Sign In
              </button>
              <button
                className={styles.menuItem}
                onClick={() => { setError(''); setView('signup'); }}
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
