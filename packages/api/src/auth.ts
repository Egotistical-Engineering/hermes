import { getPlatform } from './config';

/**
 * Thin client for Better Auth's HTTP endpoints (mounted at /api/auth on the
 * server). Hand-rolled so the web app needs no extra dependency and keeps
 * full control of token storage.
 */

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  image?: string | null;
}

export interface AuthSession {
  /** Better Auth session token — sent as a Bearer token on API calls. */
  access_token: string;
  user: AuthUser;
}

function baseUrl(): string {
  return getPlatform().serverBaseUrl.replace(/\/$/, '');
}

async function authRequest<T>(path: string, body?: unknown, token?: string | null): Promise<{ data: T | null; response: Response }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl()}/api/auth${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    credentials: 'include',
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  let data: T | null = null;
  try { data = await response.json(); } catch { /* empty body */ }
  return { data, response };
}

function sessionFromResponse(data: unknown, response: Response): AuthSession | null {
  const payload = data as { token?: string; user?: AuthUser; session?: { token?: string } } | null;
  // The bearer plugin exposes the session token via the `set-auth-token`
  // response header; sign-in JSON also carries `token`.
  const token = response.headers.get('set-auth-token') || payload?.token || payload?.session?.token;
  const user = payload?.user;
  if (!token || !user) return null;
  return { access_token: token, user };
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthSession> {
  const { data, response } = await authRequest('/sign-up/email', { email, password, name: '' });
  if (!response.ok) {
    const message = (data as { message?: string } | null)?.message || 'Failed to create account';
    throw new Error(message);
  }
  const session = sessionFromResponse(data, response);
  if (!session) throw new Error('Account created — sign in to continue');
  return session;
}

export async function signInWithEmail(email: string, password: string): Promise<AuthSession> {
  const { data, response } = await authRequest('/sign-in/email', { email, password });
  if (!response.ok) {
    const message = (data as { message?: string } | null)?.message || 'Invalid email or password';
    throw new Error(message);
  }
  const session = sessionFromResponse(data, response);
  if (!session) throw new Error('Sign-in failed');
  return session;
}

/** Returns the Google consent URL to redirect the browser to. */
export async function getGoogleSignInUrl(callbackURL: string): Promise<string> {
  const { data, response } = await authRequest<{ url?: string }>('/sign-in/social', {
    provider: 'google',
    callbackURL,
  });
  if (!response.ok || !data?.url) throw new Error('Failed to start Google sign-in');
  return data.url;
}

/**
 * Fetch the current session. Works with a stored bearer token, or (right
 * after an OAuth redirect) with the same-site session cookie — in which case
 * the returned token should be stored for subsequent bearer use.
 */
export async function getSession(token?: string | null): Promise<AuthSession | null> {
  const { data, response } = await authRequest<{ session?: { token?: string }; user?: AuthUser }>('/get-session', undefined, token);
  if (!response.ok || !data?.user) return null;
  const sessionToken = response.headers.get('set-auth-token') || data.session?.token || token;
  if (!sessionToken) return null;
  return { access_token: sessionToken, user: data.user };
}

export async function signOutSession(token: string | null): Promise<void> {
  await authRequest('/sign-out', {}, token);
}

export async function changePassword(token: string | null, currentPassword: string, newPassword: string): Promise<void> {
  const { data, response } = await authRequest('/change-password', { currentPassword, newPassword, revokeOtherSessions: true }, token);
  if (!response.ok) {
    const message = (data as { message?: string } | null)?.message || 'Failed to update password';
    throw new Error(message);
  }
}

export async function requestPasswordReset(email: string, redirectTo: string): Promise<void> {
  const { data, response } = await authRequest('/request-password-reset', { email, redirectTo });
  if (!response.ok) {
    const message = (data as { message?: string } | null)?.message || 'Failed to request password reset';
    throw new Error(message);
  }
}

export async function resetPassword(newPassword: string, resetToken: string): Promise<void> {
  const { data, response } = await authRequest('/reset-password', { newPassword, token: resetToken });
  if (!response.ok) {
    const message = (data as { message?: string } | null)?.message || 'Failed to reset password';
    throw new Error(message);
  }
}

/** Set a new password for the signed-in user (no current password required). */
export async function setNewPassword(newPassword: string): Promise<void> {
  const { apiFetch } = await import('./http');
  await apiFetch('/api/account/password', {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  });
}

/** Legacy signature kept for SignupPage: creates the account and returns success. */
export async function signup(email: string, password: string): Promise<{ success: boolean }> {
  await signUpWithEmail(email, password);
  return { success: true };
}
