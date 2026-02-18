import { getPlatform } from './config';

export interface McpServer {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
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

export async function fetchMcpServers(accessToken: string): Promise<McpServer[]> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/mcp/servers`, {
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error('Failed to fetch MCP servers');
  }

  const data = await res.json();
  return data.servers;
}

export async function createMcpServer(
  accessToken: string,
  server: { name: string; url: string; headers?: Record<string, string> },
): Promise<McpServer> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/mcp/servers`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(server),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create server');
  }

  const data = await res.json();
  return data.server;
}

export async function updateMcpServer(
  accessToken: string,
  serverId: string,
  update: { name?: string; url?: string; headers?: Record<string, string>; enabled?: boolean },
): Promise<McpServer> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/mcp/servers/${serverId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(update),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update server');
  }

  const data = await res.json();
  return data.server;
}

export async function deleteMcpServer(
  accessToken: string,
  serverId: string,
): Promise<void> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/mcp/servers/${serverId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error('Failed to delete server');
  }
}

export async function testMcpServer(
  accessToken: string,
  serverId: string,
): Promise<{ tools: string[] } | { error: string }> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/mcp/servers/${serverId}/test`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to test server');
  }

  return res.json();
}
