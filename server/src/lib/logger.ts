import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.body.apiKey',
    'req.body.anthropicApiKey',
    'req.body.openaiApiKey',
    'req.body.email',
    'req.body.password',
    'token',
    'email',
    'password',
  ],
});

export default logger;
