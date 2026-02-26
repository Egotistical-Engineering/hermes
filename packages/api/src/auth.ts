import { getPlatform } from './config';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

export async function signup(
  email: string,
  password: string,
): Promise<{ success: boolean }> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to create account');
  }

  return res.json();
}
