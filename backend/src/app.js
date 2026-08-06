const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const env = require('./config/env');
const logger = require('./config/logger');

const authRoutes = require('./routes/auth.routes');
const paymentRoutes = require('./routes/payment.routes');
const webhookRoutes = require('./routes/webhook.routes');
const deviceRoutes = require('./routes/device.routes');
const serverRoutes = require('./routes/server.routes');
const adminRoutes = require('./routes/admin.routes');

const { apiLimiter } = require('./middleware/rateLimit.middleware');
const { sendError } = require('./utils/ApiError');

function createApp() {
  const app = express();

  // Behind a reverse proxy (Cloudflare, nginx), req.ip is the proxy unless we
  // declare trust. Rate limiters key on req.ip — without this, one user can
  // exhaust the shared proxy IP budget and rate-limit everyone.
  app.set('trust proxy', env.TRUST_PROXY);

  // ── Security headers ─────────────────────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ── Body parsing (webhooks register raw body BEFORE express.json()) ───────
  app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // ── Logging ──────────────────────────────────────────────────────────────
  app.use(
    morgan('dev', {
      stream: { write: (msg) => logger.http(msg.trim()) },
      skip: () => env.NODE_ENV === 'test',
    })
  );

  // ── Rate limiting (global) ────────────────────────────────────────────────
  app.use('/api', apiLimiter);

  // ── Health ───────────────────────────────────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);

  // Webhook first — must match before authenticated routes (raw body already parsed)
  app.use('/api/payment/webhook', webhookRoutes);
  app.use('/api/payment', paymentRoutes);
  app.use('/api/devices', deviceRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api/admin', adminRoutes);

  // ── 404 ──────────────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ── Error handler ────────────────────────────────────────────────────────
  app.use((err, req, res, next) => {
    logger.error(err.message, { stack: err.stack, path: req.path });
    sendError(res, err);
  });

  return app;
}

module.exports = createApp;