import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import assistantRouter from './routes/assistant.js';
import authRouter from './routes/auth.js';
import logger from './lib/logger.js';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.2,
});

// Startup checks for required env vars
const requiredEnv = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    logger.error({ key }, 'Missing required environment variable');
    process.exit(1);
  }
}

const app = express();
app.set('trust proxy', 1); // Railway runs behind a reverse proxy
const port = parseInt(process.env.PORT || '3003', 10);

// Security headers
app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5176',
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// Global rate limit: 300 req / 15 min
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false }), authRouter);
app.use('/api/assistant', rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }), assistantRouter);

// Sentry error handler (must be after all routes)
Sentry.setupExpressErrorHandler(app);

app.listen(port, () => {
  logger.info({ port }, 'Server started');
});

// Graceful shutdown
function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
