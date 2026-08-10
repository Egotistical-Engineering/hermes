import { createContext, useCallback, useEffect, useState } from 'react';
import posthog from 'posthog-js';
import {
  setAccessTokenProvider,
  getSession as fetchSession,
  signInWithEmail,
  getGoogleSignInUrl,
  signOutSession,
  setNewPassword,
} from '@hermes/api';
import { initOfflineAdapter } from '../lib/api';

export const AuthContext = createContext(null);

const TOKEN_KEY = 'hermes-session-token';

function readStoredToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (in-app browsers) — session lives for the page only
  }
}

let currentToken = readStoredToken();
setAccessTokenProvider(() => currentToken);

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const applySession = useCallback((next) => {
    currentToken = next?.access_token ?? null;
    storeToken(currentToken);
    setSession(next);
    if (next?.user) {
      posthog.identify(next.user.id, { email: next.user.email });
      initOfflineAdapter(next.user.id);
    } else {
      posthog.reset();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      // Try the stored bearer token first; fall back to the same-site session
      // cookie (present right after an OAuth redirect from the server).
      const stored = readStoredToken();
      let restored = null;
      if (stored) restored = await fetchSession(stored).catch(() => null);
      if (!restored) restored = await fetchSession(null).catch(() => null);
      if (cancelled) return;
      applySession(restored);
      setLoading(false);
    }

    restore();
    return () => { cancelled = true; };
  }, [applySession]);

  const signIn = useCallback(async (email, password) => {
    try {
      const next = await signInWithEmail(email, password);
      applySession(next);
      return { error: null };
    } catch (err) {
      return { error: err };
    }
  }, [applySession]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const url = await getGoogleSignInUrl(`${window.location.origin}/login`);
      window.location.assign(url);
      return { error: null };
    } catch (err) {
      setAuthError(err?.message || 'Google sign-in failed');
      return { error: err };
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutSession(currentToken).catch(() => {});
    applySession(null);
  }, [applySession]);

  const updatePassword = useCallback(async (newPassword) => {
    await setNewPassword(newPassword);
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, authError, clearAuthError: () => setAuthError(null), signIn, signInWithGoogle, signOut, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
