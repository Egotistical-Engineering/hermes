import { getPlatform } from './config';

/**
 * Shared HTTP transport for the Hermes API server.
 *
 * Auth model: Better Auth session token sent as `Authorization: Bearer` (via
 * the registered token provider), with `credentials: 'include'` as well so
 * same-site cookie sessions (e.g. right after an OAuth redirect) also work.
 */

let tokenProvider: (() => string | null) | null = null;

export function setAccessTokenProvider(fn: () => string | null): void {
  tokenProvider = fn;
}

export function getAccessToken(): string | null {
  return tokenProvider ? tokenProvider() : null;
}

function baseUrl(): string {
  return getPlatform().serverBaseUrl.replace(/\/$/, '');
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 404) {
    throw new ApiError('Not found', 404, null);
  }
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    const message = (body as { error?: string } | null)?.error || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Like apiFetch but returns null on 404 instead of throwing. */
export async function apiFetchOrNull<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  try {
    return await apiFetch<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
