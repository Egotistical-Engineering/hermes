import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import logger from './logger.js';

// ── Config types ────────────────────────────────────────────────

type HttpServerConfig = {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  disabled?: boolean;
};

type StdioServerConfig = {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
};

type ServerConfig = HttpServerConfig | StdioServerConfig;

type McpConfig = {
  mcpServers: Record<string, ServerConfig>;
};

export type UserMcpServerConfig = {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
};

// ── Internals ───────────────────────────────────────────────────

type ConnectedServer = {
  name: string;
  client: Client;
  transport: StreamableHTTPClientTransport | StdioClientTransport;
  tools: Anthropic.Messages.Tool[];
  /** Original (un-namespaced) tool names for this server. */
  originalNames: Map<string, string>;
};

type UserPoolEntry = {
  servers: ConnectedServer[];
  tools: Anthropic.Messages.Tool[];
  toolToServer: Map<string, ConnectedServer>;
  lastUsed: number;
};

const TOOL_PREFIX = 'mcp';
const USER_POOL_MAX = 200;
const USER_POOL_TTL_MS = 10 * 60 * 1000; // 10 minutes
const EVICTION_INTERVAL_MS = 60 * 1000; // check every minute

function namespacedName(server: string, tool: string): string {
  return `${TOOL_PREFIX}__${server}__${tool}`;
}

/**
 * Replace `${VAR}` tokens with values from process.env.
 * Unresolved vars are replaced with an empty string.
 */
function interpolateEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? '');
}

function interpolateRecord(obj: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = interpolateEnv(v);
  }
  return result;
}

// ── McpManager ──────────────────────────────────────────────────

class McpManager {
  private servers: ConnectedServer[] = [];
  private allTools: Anthropic.Messages.Tool[] = [];
  private toolToServer = new Map<string, ConnectedServer>();

  // Per-user connection pool
  private userPools = new Map<string, UserPoolEntry>();
  private evictionTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Read mcp.json (if present), connect to all configured servers,
   * and discover their tools. Failures on individual servers are
   * logged but do not prevent startup.
   */
  async initialize(): Promise<void> {
    const configPath = resolve(process.cwd(), 'mcp.json');
    let raw: string;
    try {
      raw = await readFile(configPath, 'utf-8');
    } catch {
      // No config file — nothing to do.
      this.startEvictionLoop();
      return;
    }

    let config: McpConfig;
    try {
      config = JSON.parse(raw) as McpConfig;
    } catch (err) {
      logger.warn({ err }, 'Failed to parse mcp.json — skipping MCP initialization');
      this.startEvictionLoop();
      return;
    }

    const entries = Object.entries(config.mcpServers || {});
    if (entries.length === 0) {
      this.startEvictionLoop();
      return;
    }

    const results = await Promise.allSettled(
      entries.map(([name, cfg]) => this.connectServer(name, cfg)),
    );

    for (const r of results) {
      if (r.status === 'rejected') {
        // Already logged inside connectServer — nothing extra needed.
      }
    }

    // Build the combined tool list.
    for (const srv of this.servers) {
      this.allTools.push(...srv.tools);
      for (const tool of srv.tools) {
        this.toolToServer.set(tool.name, srv);
      }
    }

    logger.info(
      { servers: this.servers.map((s) => s.name), toolCount: this.allTools.length },
      'MCP initialization complete',
    );

    this.startEvictionLoop();
  }

  /** All system MCP tools formatted for the Anthropic API. */
  getTools(): Anthropic.Messages.Tool[] {
    return this.allTools;
  }

  /** Returns true if `name` is a system MCP-namespaced tool. */
  isMcpTool(name: string): boolean {
    return this.toolToServer.has(name);
  }

  /** Returns true if `name` is a system or user MCP tool. */
  isMcpToolForUser(name: string, userId: string): boolean {
    if (this.toolToServer.has(name)) return true;
    const pool = this.userPools.get(userId);
    return pool ? pool.toolToServer.has(name) : false;
  }

  /** Parse the server name from a namespaced tool name (e.g. mcp__arena__search → arena). */
  serverName(toolName: string): string {
    const parts = toolName.split('__');
    return parts.length >= 3 ? parts[1] : 'unknown';
  }

  /**
   * Call an MCP tool by its namespaced name.
   * Returns the text content and whether the server reported an error.
   */
  async callTool(
    namespacedToolName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: string; isError: boolean }> {
    const srv = this.toolToServer.get(namespacedToolName);
    if (!srv) {
      return { content: `Unknown MCP tool: ${namespacedToolName}`, isError: true };
    }
    return this.executeToolCall(srv, namespacedToolName, args);
  }

  /**
   * Call an MCP tool, checking both system and user pools.
   */
  async callToolForUser(
    namespacedToolName: string,
    args: Record<string, unknown>,
    userId: string,
  ): Promise<{ content: string; isError: boolean }> {
    // Check system tools first
    const systemSrv = this.toolToServer.get(namespacedToolName);
    if (systemSrv) {
      return this.executeToolCall(systemSrv, namespacedToolName, args);
    }

    // Check user pool
    const pool = this.userPools.get(userId);
    if (pool) {
      pool.lastUsed = Date.now();
      const userSrv = pool.toolToServer.get(namespacedToolName);
      if (userSrv) {
        return this.executeToolCall(userSrv, namespacedToolName, args);
      }
    }

    return { content: `Unknown MCP tool: ${namespacedToolName}`, isError: true };
  }

  /**
   * Get tools for a user's configured MCP servers.
   * Returns cached pool or connects to servers. Failures are logged + skipped.
   */
  async getUserTools(
    userId: string,
    configs: UserMcpServerConfig[],
  ): Promise<Anthropic.Messages.Tool[]> {
    const existing = this.userPools.get(userId);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.tools;
    }

    // Evict LRU entries if at capacity
    if (this.userPools.size >= USER_POOL_MAX) {
      this.evictLRU();
    }

    const enabledConfigs = configs.filter((c) => c.enabled);
    if (enabledConfigs.length === 0) return [];

    const servers: ConnectedServer[] = [];
    const results = await Promise.allSettled(
      enabledConfigs.map((cfg) => this.connectUserServer(cfg)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        servers.push(r.value);
      }
    }

    const tools: Anthropic.Messages.Tool[] = [];
    const toolToServer = new Map<string, ConnectedServer>();
    for (const srv of servers) {
      tools.push(...srv.tools);
      for (const tool of srv.tools) {
        toolToServer.set(tool.name, srv);
      }
    }

    this.userPools.set(userId, {
      servers,
      tools,
      toolToServer,
      lastUsed: Date.now(),
    });

    if (tools.length > 0) {
      logger.info(
        { userId, serverCount: servers.length, toolCount: tools.length },
        'User MCP pool initialized',
      );
    }

    return tools;
  }

  /** Disconnect and remove a user's pool (called after CRUD mutations). */
  async invalidateUserPool(userId: string): Promise<void> {
    const pool = this.userPools.get(userId);
    if (!pool) return;

    this.userPools.delete(userId);
    await Promise.allSettled(
      pool.servers.map(async (srv) => {
        try { await srv.client.close(); } catch { /* best-effort */ }
      }),
    );
    logger.info({ userId }, 'User MCP pool invalidated');
  }

  /**
   * Test a single user MCP server config. Returns tool list on success.
   * Disconnects immediately after — not cached.
   */
  async testUserServer(
    config: UserMcpServerConfig,
    timeoutMs = 5000,
  ): Promise<{ tools: string[] } | { error: string }> {
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: Object.keys(config.headers).length > 0
        ? { headers: config.headers }
        : undefined,
    });

    const client = new Client({ name: `hermes-test-${config.name}`, version: '1.0.0' });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out')), timeoutMs),
    );

    try {
      await Promise.race([client.connect(transport), timeout]);
      const result = await Promise.race([client.listTools(), timeout]);
      const toolNames = result.tools.map((t) => t.name);
      await client.close().catch(() => {});
      return { tools: toolNames };
    } catch (err) {
      await client.close().catch(() => {});
      return { error: (err as Error).message };
    }
  }

  /** Gracefully close all connections. */
  async shutdown(): Promise<void> {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }

    // Close system servers
    await Promise.allSettled(
      this.servers.map(async (srv) => {
        try { await srv.client.close(); } catch { /* best-effort */ }
      }),
    );
    this.servers = [];
    this.allTools = [];
    this.toolToServer.clear();

    // Close all user pools
    const pools = Array.from(this.userPools.values());
    this.userPools.clear();
    await Promise.allSettled(
      pools.flatMap((pool) =>
        pool.servers.map(async (srv) => {
          try { await srv.client.close(); } catch { /* best-effort */ }
        }),
      ),
    );
  }

  // ── Private ──────────────────────────────────────────────────

  private async executeToolCall(
    srv: ConnectedServer,
    namespacedToolName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: string; isError: boolean }> {
    const originalName = srv.originalNames.get(namespacedToolName);
    if (!originalName) {
      return { content: `Cannot resolve original name for: ${namespacedToolName}`, isError: true };
    }

    try {
      const result = await srv.client.callTool({ name: originalName, arguments: args });

      // Flatten content array into a single string.
      const text = (result.content as Array<{ type: string; text?: string }>)
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n');

      return { content: text || '(empty response)', isError: result.isError === true };
    } catch (err) {
      logger.error({ err, tool: namespacedToolName }, 'MCP callTool failed');
      return { content: `MCP tool error: ${(err as Error).message}`, isError: true };
    }
  }

  private async connectServer(name: string, cfg: ServerConfig): Promise<void> {
    if (cfg.disabled) {
      logger.info({ server: name }, 'MCP server disabled — skipping');
      return;
    }

    let transport: StreamableHTTPClientTransport | StdioClientTransport;

    if (cfg.type === 'http') {
      const headers = cfg.headers ? interpolateRecord(cfg.headers) : undefined;
      transport = new StreamableHTTPClientTransport(new URL(interpolateEnv(cfg.url)), {
        requestInit: headers ? { headers } : undefined,
      });
    } else if (cfg.type === 'stdio') {
      transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args,
        env: cfg.env ? { ...process.env, ...interpolateRecord(cfg.env) } as Record<string, string> : undefined,
      });
    } else {
      logger.warn({ server: name }, 'Unknown MCP transport type — skipping');
      return;
    }

    const client = new Client({ name: `hermes-${name}`, version: '1.0.0' });

    try {
      await client.connect(transport);
    } catch (err) {
      logger.warn({ err, server: name }, 'Failed to connect to MCP server');
      throw err;
    }

    // Discover tools.
    let tools: Anthropic.Messages.Tool[];
    const originalNames = new Map<string, string>();
    try {
      const result = await client.listTools();
      tools = result.tools.map((t) => {
        const nsName = namespacedName(name, t.name);
        originalNames.set(nsName, t.name);
        return {
          name: nsName,
          description: t.description ?? '',
          input_schema: t.inputSchema as Anthropic.Messages.Tool['input_schema'],
        };
      });
    } catch (err) {
      logger.warn({ err, server: name }, 'Failed to list tools from MCP server');
      await client.close().catch(() => {});
      throw err;
    }

    this.servers.push({ name, client, transport, tools, originalNames });
    logger.info({ server: name, tools: tools.map((t) => t.name) }, 'MCP server connected');
  }

  private async connectUserServer(cfg: UserMcpServerConfig): Promise<ConnectedServer | null> {
    const transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
      requestInit: Object.keys(cfg.headers).length > 0
        ? { headers: cfg.headers }
        : undefined,
    });

    const client = new Client({ name: `hermes-user-${cfg.name}`, version: '1.0.0' });

    try {
      await client.connect(transport);
    } catch (err) {
      logger.warn({ err, server: cfg.name }, 'Failed to connect to user MCP server');
      return null;
    }

    const originalNames = new Map<string, string>();
    try {
      const result = await client.listTools();
      const tools = result.tools.map((t) => {
        const nsName = namespacedName(cfg.name, t.name);
        originalNames.set(nsName, t.name);
        return {
          name: nsName,
          description: t.description ?? '',
          input_schema: t.inputSchema as Anthropic.Messages.Tool['input_schema'],
        };
      });
      return { name: cfg.name, client, transport, tools, originalNames };
    } catch (err) {
      logger.warn({ err, server: cfg.name }, 'Failed to list tools from user MCP server');
      await client.close().catch(() => {});
      return null;
    }
  }

  private startEvictionLoop(): void {
    this.evictionTimer = setInterval(() => {
      const now = Date.now();
      const toEvict: string[] = [];
      for (const [userId, pool] of this.userPools) {
        if (now - pool.lastUsed > USER_POOL_TTL_MS) {
          toEvict.push(userId);
        }
      }
      for (const userId of toEvict) {
        this.invalidateUserPool(userId).catch(() => {});
      }
    }, EVICTION_INTERVAL_MS);

    // Don't keep process alive just for eviction
    if (this.evictionTimer.unref) {
      this.evictionTimer.unref();
    }
  }

  private evictLRU(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [userId, pool] of this.userPools) {
      if (pool.lastUsed < oldestTime) {
        oldestTime = pool.lastUsed;
        oldest = userId;
      }
    }
    if (oldest) {
      this.invalidateUserPool(oldest).catch(() => {});
    }
  }
}

export const mcpManager = new McpManager();
