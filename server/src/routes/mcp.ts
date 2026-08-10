import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../lib/db.js';
import { requireAuth } from '../middleware/auth.js';
import { mcpManager } from '../lib/mcp.js';
import { validateMcpServerConfig, validateMcpServerUpdate, validateMcpServerDns } from '../lib/mcpValidation.js';
import logger from '../lib/logger.js';

import type { UserMcpServerConfig } from '../lib/mcp.js';

const router = Router();

const MAX_SERVERS_PER_USER = 10;

async function hasMcpAccess(_userId: string): Promise<boolean> {
  // MCP configuration is available to all authenticated users (open-source, no paid tiers)
  return true;
}

// All routes require auth
router.use(requireAuth);

// Beta gate middleware
async function requireMcpAccess(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  if (!(await hasMcpAccess(userId))) {
    res.status(403).json({ error: 'MCP server configuration requires authentication' });
    return;
  }
  next();
}

router.use(requireMcpAccess);

// GET /servers — list user's MCP servers
router.get('/servers', async (req: Request, res: Response) => {
  const userId = req.user!.id;

  let data: Record<string, unknown>[];
  try {
    const result = await query(
      'select id, name, url, headers, enabled, created_at, updated_at from user_mcp_servers where user_id = $1 order by created_at asc',
      [userId],
    );
    data = result.rows;
  } catch (err: any) {
    logger.error({ error: err?.message, userId }, 'Failed to list MCP servers');
    res.status(500).json({ error: 'Failed to list servers' });
    return;
  }

  // Mask header values in response
  const masked = (data || []).map((s: Record<string, unknown>) => ({
    ...s,
    headers: s.headers && typeof s.headers === 'object'
      ? Object.fromEntries(
          Object.keys(s.headers as Record<string, string>).map((k) => [k, '••••••']),
        )
      : {},
  }));
  res.json({ servers: masked });
});

// POST /servers — add a new MCP server
router.post('/servers', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { name, url, headers } = req.body;

  // Validate input
  const errors = validateMcpServerConfig({ name, url, headers });
  if (errors.length > 0) {
    res.status(400).json({ error: 'Validation failed', details: errors });
    return;
  }

  // Async DNS resolution check (SSRF protection)
  if (typeof url === 'string') {
    const dnsErrors = await validateMcpServerDns(url);
    if (dnsErrors.length > 0) {
      res.status(400).json({ error: 'Validation failed', details: dnsErrors });
      return;
    }
  }

  try {
    const { rows: countRows } = await query(
      'select count(*)::int as n from user_mcp_servers where user_id = $1', [userId],
    );
    if ((countRows[0]?.n ?? 0) >= MAX_SERVERS_PER_USER) {
      res.status(400).json({ error: `Maximum of ${MAX_SERVERS_PER_USER} servers allowed` });
      return;
    }
    const { rows } = await query(
      `insert into user_mcp_servers (user_id, name, url, headers)
       values ($1, $2, $3, $4)
       returning id, name, url, headers, enabled, created_at, updated_at`,
      [userId, name, url, JSON.stringify(headers || {})],
    );
    await mcpManager.invalidateUserPool(userId);
    res.status(201).json({ server: rows[0] });
  } catch (err: any) {
    if (err?.code === '23505') {
      res.status(409).json({ error: `A server named "${name}" already exists` });
      return;
    }
    logger.error({ error: err?.message, userId }, 'Failed to create MCP server');
    res.status(500).json({ error: 'Failed to create server' });
  }
});

// PATCH /servers/:id — update a server
router.patch('/servers/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const serverId = req.params.id;

  const errors = validateMcpServerUpdate(req.body);
  if (errors.length > 0) {
    res.status(400).json({ error: 'Validation failed', details: errors });
    return;
  }

  // Build update object from allowed fields
  const update: Record<string, unknown> = {};
  if (req.body.name !== undefined) update.name = req.body.name;
  if (req.body.url !== undefined) update.url = req.body.url;
  if (req.body.headers !== undefined) update.headers = req.body.headers;
  if (req.body.enabled !== undefined) update.enabled = req.body.enabled;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(update)) {
    values.push(key === 'headers' ? JSON.stringify(value) : value);
    sets.push(`${key} = $${values.length}`);
  }
  values.push(serverId, userId);
  try {
    const { rows } = await query(
      `update user_mcp_servers set ${sets.join(', ')}, updated_at = now()
       where id = $${values.length - 1} and user_id = $${values.length}
       returning id, name, url, headers, enabled, created_at, updated_at`,
      values,
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }
    await mcpManager.invalidateUserPool(userId);
    res.json({ server: rows[0] });
  } catch (err: any) {
    if (err?.code === '23505') {
      res.status(409).json({ error: `A server with that name already exists` });
      return;
    }
    logger.error({ error: err?.message, userId, serverId }, 'Failed to update MCP server');
    res.status(500).json({ error: 'Failed to update server' });
  }
});

// DELETE /servers/:id — remove a server
router.delete('/servers/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const serverId = req.params.id;

  try {
    await query('delete from user_mcp_servers where id = $1 and user_id = $2', [serverId, userId]);
  } catch (err: any) {
    logger.error({ error: err?.message, userId, serverId }, 'Failed to delete MCP server');
    res.status(500).json({ error: 'Failed to delete server' });
    return;
  }

  await mcpManager.invalidateUserPool(userId);
  res.json({ success: true });
});

// POST /servers/:id/test — test connection to a server
router.post('/servers/:id/test', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const serverId = req.params.id;

  const { rows: serverRows } = await query(
    'select id, name, url, headers, enabled from user_mcp_servers where id = $1 and user_id = $2',
    [serverId, userId],
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  const server = serverRows[0] as { id: string; name: string; url: string; headers: unknown; enabled: boolean } | undefined;

  if (!server) {
    res.status(404).json({ error: 'Server not found' });
    return;
  }

  const config: UserMcpServerConfig = {
    id: server.id,
    name: server.name,
    url: server.url,
    headers: (server.headers as Record<string, string>) || {},
    enabled: server.enabled,
  };

  const result = await mcpManager.testUserServer(config);
  res.json(result);
});

export default router;
