import { createContext, useState, useEffect } from 'react';
import posthog from 'posthog-js';
import { activateTrial } from '@hermes/api';
import { supabase, initOfflineAdapter } from '../lib/supabase';
import { IS_TAURI } from '../lib/platform';

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
      if (session?.user) {
        posthog.identify(session.user.id, {
          email: session.user.email,
          auth_provider: session.user.app_metadata?.provider || 'email',
        });
        // Initialize offline adapter for Tauri
        initOfflineAdapter(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        posthog.identify(session.user.id, {
          email: session.user.email,
          auth_provider: session.user.app_metadata?.provider || 'email',
        });
        // Initialize offline adapter for Tauri on auth change
        initOfflineAdapter(session.user.id);
      } else {
        posthog.reset();
      }
    });

    // Listen for deep link OAuth callback in Tauri
    if (IS_TAURI) {
      import('@tauri-apps/plugin-deep-link').then(({ onOpenUrl }) => {
        onOpenUrl((urls) => {
          for (const url of urls) {
            if (url.startsWith('hermes://auth/callback')) {
              const hashParams = new URL(url.replace('hermes://', 'https://placeholder/')).hash;
              if (hashParams) {
                // Extract tokens from the deep link and set session
                const params = new URLSearchParams(hashParams.replace('#', ''));
                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');
                if (accessToken && refreshToken) {
                  supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
                }
              }
            }
          }
        });
      }).catch(() => {
        // Deep link plugin not available
      });
    }

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

  const signInWithGoogle = async () => {
    if (IS_TAURI) {
      // In Tauri, open OAuth in system browser and handle callback via deep link
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: true,
          redirectTo: 'hermes://auth/callback',
        },
      });
      if (error) throw error;
      if (data?.url) {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(data.url);
      }
      return { data, error };
    }
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    });
  };

  const signOut = () => supabase.auth.signOut();

  const updatePassword = (newPassword) =>
    supabase.auth.updateUser({ password: newPassword }).then(({ error }) => { if (error) throw error; });

  return (
    <AuthContext.Provider value={{ session, loading, authError, clearAuthError: () => setAuthError(null), signIn, signInWithGoogle, signOut, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
