import 'dotenv/config';
import crypto from 'node:crypto';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import assistantRouter from './routes/assistant.js';
import authRouter from './routes/auth.js';
import stripeRouter from './routes/stripe.js';
import usageRouter from './routes/usage.js';
import mcpRouter from './routes/mcp.js';
import logger from './lib/logger.js';
import { mcpManager } from './lib/mcp.js';
import { getUserFromBearerToken } from './middleware/auth.js';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.2,
});

// Startup checks for required env vars
const requiredEnv = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_JWT_SECRET', 'SUPABASE_ANON_KEY', 'FRONTEND_URL'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    logger.error({ key }, 'Missing required environment variable');
    process.exit(1);
  }
}

// Warn about optional but important env vars
for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
  if (!process.env[key]) {
    logger.warn({ key }, 'Optional environment variable not set — related functionality will be disabled');
  }
}

const app = express();
app.set('trust proxy', 1); // Railway runs behind a reverse proxy
const port = parseInt(process.env.PORT || '3003', 10);

// Security headers
app.use(helmet());

// Request ID: use incoming header or generate
app.use((req, res, next) => {
  const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('x-request-id', id);
  next();
});

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5176',
  credentials: true,
}));

// Stripe webhook needs raw body — mount before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '1mb' }));

// Health check — before rate limiter so monitoring doesn't count
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Global rate limit: 300 req / 15 min
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Assistant rate limit: keyed by user ID when available, falls back to IP
const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const user = getUserFromBearerToken(authHeader.slice(7));
      if (user) return `user:${user.id}`;
    }
    return req.ip || 'unknown';
  },
});

app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false }), authRouter);
app.use('/api/assistant', assistantLimiter, assistantRouter);
app.use('/api/stripe', stripeRouter);
app.use('/api/usage', rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false }), usageRouter);
app.use('/api/mcp', rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false }), mcpRouter);

// Sentry error handler (must be after all routes)
Sentry.setupExpressErrorHandler(app);

let server: ReturnType<typeof app.listen>;
let isShuttingDown = false;

async function start() {
  await mcpManager.initialize();
  server = app.listen(port, () => {
    logger.info({ port }, 'Server started');
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});

// Graceful shutdown: drain connections, then force-exit after 30s
async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Shutdown signal received — draining connections');

  // Force exit after 30 seconds
  const forceTimer = setTimeout(() => {
    logger.warn('Forcing shutdown after 30s timeout');
    process.exit(1);
  }, 30_000);
  forceTimer.unref();

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  await mcpManager.shutdown();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
