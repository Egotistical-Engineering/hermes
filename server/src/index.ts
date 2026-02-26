import './env.js';
import crypto from 'node:crypto';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import assistantRouter from './routes/assistant.js';
import logger from './lib/logger.js';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.2,
});

const app = express();
app.set('trust proxy', 1);
const port = parseInt(process.env.PORT || '3003', 10);
const host = process.env.HOST || '127.0.0.1';

// CORS — must be before helmet so preflight OPTIONS requests work
app.use((req, _res, next) => {
  if (req.method === 'OPTIONS') {
    logger.info({
      origin: req.headers.origin,
      referer: req.headers.referer,
      host: req.headers.host,
      path: req.originalUrl,
    }, 'CORS preflight');
  }
  next();
});

const allowedOrigins = new Set([
  process.env.FRONTEND_URL || 'http://localhost:5176',
  'tauri://localhost',
  'https://tauri.localhost',
]);

function isAllowedOrigin(origin?: string) {
  if (!origin) return true; // allow non-browser or same-origin requests
  if (allowedOrigins.has(origin)) return true;
  if (origin.startsWith('tauri://')) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
}));

// Security headers
app.use(helmet());

// Request ID
app.use((req, res, next) => {
  const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('x-request-id', id);
  next();
});

app.use(express.json({ limit: '1mb' }));

// Health check
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

// Assistant rate limit: 20 req / min per IP
const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/assistant', assistantLimiter, assistantRouter);

// Sentry error handler
Sentry.setupExpressErrorHandler(app);

const server = app.listen(port, host, () => {
  logger.info({ port, host }, 'Server started');
});

// Graceful shutdown
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Shutdown signal received — draining connections');

  const forceTimer = setTimeout(() => {
    logger.warn('Forcing shutdown after 30s timeout');
    process.exit(1);
  }, 30_000);
  forceTimer.unref();

  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
