import { createContext, useState, useEffect } from 'react';
import { activateTrial } from '@hermes/api';
import { supabase } from '../lib/supabase';

export const AuthContext = createContext(null);

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    // Check for OAuth error in URL hash (e.g. signup rejected)
    const hash = window.location.hash;
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.replace('#', ''));
      const desc = params.get('error_description');
      if (desc) {
        setAuthError(desc.includes('Signups not allowed')
          ? 'This site is invite-only. Contact the admin for access.'
          : desc);
        // Clean the hash so the error doesn't persist on refresh
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Activate pending trial after Google OAuth redirect
  useEffect(() => {
    if (!session?.access_token) return;
    const pending = sessionStorage.getItem('pendingTrialDays');
    if (!pending) return;
    sessionStorage.removeItem('pendingTrialDays');
    const days = parseInt(pending, 10);
    if (days > 0) {
      activateTrial(days, session.access_token).catch(() => {
        // Non-fatal — trial activation is best-effort
      });
    }
  }, [session?.access_token]);

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    });

  const signOut = () => supabase.auth.signOut();

  const updatePassword = (newPassword) =>
    supabase.auth.updateUser({ password: newPassword }).then(({ error }) => { if (error) throw error; });

  return (
    <AuthContext.Provider value={{ session, loading, authError, clearAuthError: () => setAuthError(null), signIn, signInWithGoogle, signOut, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
