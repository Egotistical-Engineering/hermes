import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import posthog from 'posthog-js';
import { createPortalSession } from '@hermes/api';
import useAuth from '../../hooks/useAuth';
import useUsage from '../../hooks/useUsage';
import McpSettingsView from './McpSettingsView';
import styles from './UserMenu.module.css';

export default function UserMenu({ onDropdownOpen, onDropdownClose }) {
  const { session, signOut, updatePassword } = useAuth();
  const { usage } = useUsage(session);
  const wrapperRef = useRef(null);
  const passwordInputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState('menu'); // 'menu' | 'password' | 'billing' | 'mcp'
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
        if (view === 'password' || view === 'billing' || view === 'mcp') {
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
                  {usage?.plan === 'pro' ? 'Patron' : usage?.isTrial ? 'Trial' : 'Free trial'} plan
                  {usage?.isTrial && usage?.trialExpiresAt && (
                    <span className={styles.billingCancelNote}>
                      {' '}({Math.max(0, Math.ceil((new Date(usage.trialExpiresAt) - Date.now()) / (1000 * 60 * 60 * 24)))} days remaining)
                    </span>
                  )}
                  {usage?.plan !== 'pro' && !usage?.isTrial && usage?.freeExpiresAt && !usage?.freeExpired && (
                    <span className={styles.billingCancelNote}>
                      {' '}({Math.max(0, Math.ceil((new Date(usage.freeExpiresAt) - Date.now()) / (1000 * 60 * 60 * 24)))} days remaining)
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
                      After your trial ends, you'll need to become a Patron to continue.
                    </div>
                    <Link
                      className={styles.billingActionBtn}
                      to="/upgrade"
                      onClick={() => { posthog.capture('upgrade_clicked', { source: 'billing_menu' }); closeDropdown(); }}
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
                      onClick={() => { posthog.capture('upgrade_clicked', { source: 'billing_menu' }); closeDropdown(); }}
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
          ) : (
            <div className={styles.menuItems}>
              <Link className={styles.menuItem} to="/login" onClick={closeDropdown}>
                Sign In
              </Link>
              <Link className={styles.menuItem} to="/signup" onClick={closeDropdown}>
                Sign Up
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
