import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { mcpManager } from '../lib/mcp.js';
import { validateMcpServerConfig, validateMcpServerUpdate, validateMcpServerDns } from '../lib/mcpValidation.js';
import logger from '../lib/logger.js';

import type { UserMcpServerConfig } from '../lib/mcp.js';

const router = Router();

const MAX_SERVERS_PER_USER = 10;

const ADMIN_USER_IDS = new Set(
  (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
);

async function hasMcpAccess(userId: string): Promise<boolean> {
  if (ADMIN_USER_IDS.has(userId)) return true;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('plan, subscription_status')
    .eq('id', userId)
    .single();

  if (!profile) return false;

  return profile.plan === 'pro' &&
    ['active', 'trialing', 'past_due'].includes(profile.subscription_status);
}

// All routes require auth
router.use(requireAuth);

// Beta gate middleware
async function requireMcpAccess(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  if (!(await hasMcpAccess(userId))) {
    res.status(403).json({ error: 'MCP server configuration requires a Pro subscription' });
    return;
  }
  next();
}

router.use(requireMcpAccess);

// GET /servers — list user's MCP servers
router.get('/servers', async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const { data, error } = await supabase
    .from('user_mcp_servers')
    .select('id, name, url, headers, enabled, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error({ error: error.message, userId }, 'Failed to list MCP servers');
    res.status(500).json({ error: 'Failed to list servers' });
    return;
  }

  res.json({ servers: data || [] });
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

  // Check server count limit
  const { count, error: countError } = await supabase
    .from('user_mcp_servers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) {
    logger.error({ error: countError.message, userId }, 'Failed to count MCP servers');
    res.status(500).json({ error: 'Failed to create server' });
    return;
  }

  if ((count ?? 0) >= MAX_SERVERS_PER_USER) {
    res.status(400).json({ error: `Maximum of ${MAX_SERVERS_PER_USER} servers allowed` });
    return;
  }

  const { data, error } = await supabase
    .from('user_mcp_servers')
    .insert({
      user_id: userId,
      name,
      url,
      headers: headers || {},
    })
    .select('id, name, url, headers, enabled, created_at, updated_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      res.status(409).json({ error: `A server named "${name}" already exists` });
      return;
    }
    logger.error({ error: error.message, userId }, 'Failed to create MCP server');
    res.status(500).json({ error: 'Failed to create server' });
    return;
  }

  await mcpManager.invalidateUserPool(userId);
  res.status(201).json({ server: data });
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

  const { data, error } = await supabase
    .from('user_mcp_servers')
    .update(update)
    .eq('id', serverId)
    .eq('user_id', userId)
    .select('id, name, url, headers, enabled, created_at, updated_at')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      res.status(404).json({ error: 'Server not found' });
      return;
    }
    if (error.code === '23505') {
      res.status(409).json({ error: `A server with that name already exists` });
      return;
    }
    logger.error({ error: error.message, userId, serverId }, 'Failed to update MCP server');
    res.status(500).json({ error: 'Failed to update server' });
    return;
  }

  await mcpManager.invalidateUserPool(userId);
  res.json({ server: data });
});

// DELETE /servers/:id — remove a server
router.delete('/servers/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const serverId = req.params.id;

  const { error } = await supabase
    .from('user_mcp_servers')
    .delete()
    .eq('id', serverId)
    .eq('user_id', userId);

  if (error) {
    logger.error({ error: error.message, userId, serverId }, 'Failed to delete MCP server');
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

  const { data: server, error } = await supabase
    .from('user_mcp_servers')
    .select('id, name, url, headers, enabled')
    .eq('id', serverId)
    .eq('user_id', userId)
    .single();

  if (error || !server) {
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
