import { getPlatform } from './config';

export interface UsageInfo {
  plan: 'free' | 'pro';
  used: number;
  limit: number;
  remaining: number;
  resetInfo: string;
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  hasMcpAccess: boolean;
  isTrial: boolean;
  trialExpiresAt: string | null;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchCurrentUsage(accessToken: string): Promise<UsageInfo> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/usage/current`, {
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error('Failed to fetch usage');
  }

  return res.json();
}

export function getProUpgradeUrl(userId: string): string {
  const link = (typeof window !== 'undefined' && (window as any).__VITE_STRIPE_PRO_LINK)
    || (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_STRIPE_PRO_LINK)
    || '';
  if (!link) return '';
  return `${link}?client_reference_id=${userId}`;
}

export async function createPortalSession(accessToken: string): Promise<{ url: string }> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/stripe/portal`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error('Failed to create portal session');
  }

  return res.json();
}
