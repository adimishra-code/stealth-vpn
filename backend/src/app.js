const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const { doubleCsrf } = require('csrf-csrf');
const env = require('./config/env');
const logger = require('./config/logger');

const authRoutes = require('./routes/auth.routes');
const paymentRoutes = require('./routes/payment.routes');
const webhookRoutes = require('./routes/webhook.routes');
const deviceRoutes = require('./routes/device.routes');
const serverRoutes = require('./routes/server.routes');
const bandwidthRoutes = require('./routes/bandwidth.routes');
const adminRoutes = require('./routes/admin.routes');

const { apiLimiter, clientErrorLimiter } = require('./middleware/rateLimit.middleware');
const { ApiError, sendError } = require('./utils/ApiError');
const { alertError } = require('./services/alert.service');

// CSRF-02: double-submit cookie — the server signs the token into an httpOnly
// cookie, the frontend mirrors it in x-csrf-token, so cross-site requests can
// fire the cookie but never know the header value. Webhooks are exempt:
// Razorpay/Stripe call /api/payment/webhook directly.
const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  // No server-side sessions: a constant session identifier is correct here.
  getSessionIdentifier: () => 'stateless',
  cookieName: 'sv_csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

function createApp() {
  const app = express();

  // Behind a reverse proxy, req.ip is the proxy unless trust is declared —
  // rate limiters key on req.ip, so one user could exhaust the shared budget.
  app.set('trust proxy', env.TRUST_PROXY);

  // ── Security headers ─────────────────────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
    })
  );

  // ── Body parsing (webhooks register raw body BEFORE express.json()) ───────
  app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // ── NoSQL injection guard ────────────────────────────────────────────────────
  // Strips $ and . operators from body/query/params. The webhook's raw body
  // is a Buffer, which this middleware leaves untouched.
  app.use(mongoSanitize());

  // ── Logging ──────────────────────────────────────────────────────────────
  app.use(
    morgan('dev', {
      stream: { write: (msg) => logger.http(msg.trim()) },
      skip: () => env.NODE_ENV === 'test',
    })
  );

  // ── Rate limiting (global) ────────────────────────────────────────────────
  app.use('/api', apiLimiter);

  // ── CSRF protection (after cookieParser; before routes) ──────────────────
  // Every non-GET request needs x-csrf-token, except the payment webhook
  // (Razorpay/Stripe servers can't obtain a token) and /api/client-errors
  // (no state change; clientErrorLimiter bounds forged spam). Skipped in the
  // jest suite, which is covered by tests/csrf.test.js using a
  // production-mode app.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/payment/webhook')) return next();
    if (req.path === '/api/client-errors') return next();
    if (process.env.NODE_ENV === 'test') return next();
    return doubleCsrfProtection(req, res, next);
  });

  // Token minting: sets the signed httpOnly cookie and returns the token for
  // the SPA to mirror as x-csrf-token. GET is CSRF-exempt.
  app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: generateCsrfToken(req, res) });
  });

  // ── Client-side error telemetry ──────────────────────────────────────────
  // Unauthenticated (a crashed app may not hold a token); bounded by
  // clientErrorLimiter. Only message/stack/url are stored — no tokens or bodies.
  app.post('/api/client-errors', clientErrorLimiter, (req, res) => {
    const { message = 'Unknown client error', stack = '', url = '' } = req.body || {};
    const safe = {
      message: String(message).slice(0, 500),
      stack: String(stack).slice(0, 4000),
      url: String(url).slice(0, 500),
    };
    logger.error('Client-side error reported', { ...safe, userAgent: req.get('user-agent') || '' });
    // Same signature → same cooldown bucket; alerts stay deduped per error.
    alertError({
      source: 'client',
      title: `Client error: ${safe.message}`,
      message: safe.message,
      details: { stack: safe.stack, url: safe.url },
    });
    res.json({ ok: true });
  });

  // ── Health ───────────────────────────────────────────────────────────────
  // Reports actual MongoDB connectivity (mongoose.readyState: 1 = connected)
  // so an upstream load balancer / uptime monitor can distinguish a hung
  // process from a dead DB. Returns 503 when the DB is unreachable — the API
  // can serve cached health but cannot answer data requests without Mongo.
  app.get('/health', (req, res) => {
    const dbReady = mongoose.connection.readyState === 1;
    const status = dbReady ? 'ok' : 'degraded';
    res.status(dbReady ? 200 : 503).json({
      status,
      db: dbReady ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);

  // Webhook first — must match before authenticated routes (raw body already parsed)
  app.use('/api/payment/webhook', webhookRoutes);
  app.use('/api/payment', paymentRoutes);
  app.use('/api/devices', deviceRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api/bandwidth', bandwidthRoutes);
  app.use('/api/admin', adminRoutes);

  // ── 404 ──────────────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ── Error handler ────────────────────────────────────────────────────────
  app.use((err, req, res, _next) => {
    logger.error(err.message, { stack: err.stack, path: req.path });

    // Only 5xx reaches alerting — 4xx is expected noise, and CSRF rejections
    // are attackers or stale cookies. Throttled per error signature.
    const isServerError =
      (!(err instanceof ApiError) && err.name !== 'ForbiddenError') ||
      err.statusCode >= 500;
    if (isServerError) {
      alertError({
        source: 'http',
        title: `HTTP error on ${req.method} ${req.path}`,
        message: err.message,
        details: { stack: err.stack, method: req.method, path: req.path },
        err,
      });
    }

    sendError(res, err);
  });

  return app;
}

module.exports = createApp;