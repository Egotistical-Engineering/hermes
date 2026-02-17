import { getPlatform } from './config';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

export async function validateInviteCode(inviteCode: string): Promise<{ valid: boolean }> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/auth/validate-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Invalid invite code');
  }

  return res.json();
}

export async function signupWithInvite(
  email: string,
  password: string,
  inviteCode: string,
): Promise<{ success: boolean }> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, inviteCode }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to create account');
  }

  return res.json();
}

export async function consumeInviteCode(inviteCode: string): Promise<{ success: boolean }> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/auth/use-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Invalid invite code');
  }

  return res.json();
}
