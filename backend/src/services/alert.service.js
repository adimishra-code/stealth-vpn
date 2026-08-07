/**
 * Alerting layer (Sentry-equivalent, self-hosted):
 *   - every event is logged locally via winston (baseline)
 *   - external dispatch: email (ALERT_EMAIL_TO), webhook (ALERT_WEBHOOK_URL,
 *     Slack/Discord-style JSON POST), Sentry (optional, lazy-loaded)
 *   - per-key cooldown (ALERT_COOLDOWN_MINUTES): the same error signature is
 *     delivered at most once per window, so a flapping failure produces one
 *     alert instead of an alert storm. State is in-memory — a restart resets
 *     the windows, which is fine (worst case: one duplicate alert).
 *
 * Alerting must NEVER throw into the caller — every channel failure is logged
 * and swallowed.
 */
const env = require('../config/env');
const logger = require('../config/logger');
const { transporter } = require('./email.service');

// ── Throttle ────────────────────────────────────────────────────────────────
// Pure-ish factory, exported for tests.
function createThrottle(cooldownMs) {
  const entries = new Map(); // key -> { nextAt, createdAt }

  function prune(now) {
    if (entries.size <= 500) return;
    const horizon = now - cooldownMs * 2;
    for (const [key, entry] of entries) {
      if (entry.createdAt < horizon) entries.delete(key);
    }
  }

  return {
    shouldSend(key, now = Date.now()) {
      prune(now);
      const entry = entries.get(key);
      if (entry && now < entry.nextAt) return false;
      entries.set(key, { nextAt: now + cooldownMs, createdAt: now });
      return true;
    },
    size() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
  };
}

const throttle = createThrottle(env.ALERT_COOLDOWN_MINUTES * 60 * 1000);

// ── Channels ────────────────────────────────────────────────────────────────

let sentry = null;
function getSentry() {
  if (sentry !== null || !env.SENTRY_DSN) return sentry;
  try {
    // Optional dependency: requires `npm i @sentry/node` and SENTRY_DSN.
    // If the package is missing, alerting degrades to email/webhook.
    const Sentry = require('@sentry/node');
    Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0 });
    sentry = Sentry;
    logger.info('Sentry enabled');
  } catch (err) {
    logger.warn('Sentry unavailable — install @sentry/node or unset SENTRY_DSN', {
      error: err.message,
    });
    sentry = null;
  }
  return sentry;
}

async function sendEmailAlert({ title, message, details }) {
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: env.ALERT_EMAIL_TO,
    subject: `[StealthVPN ${env.NODE_ENV}] ${title}`,
    html: `<div style="font-family: sans-serif;">
      <h2>${title}</h2>
      <pre style="background:#f1f5f9;padding:12px;border-radius:6px;white-space:pre-wrap;">${message}</pre>
      ${details ? `<pre style="background:#f1f5f9;padding:12px;border-radius:6px;white-space:pre-wrap;">${JSON.stringify(details, null, 2)}</pre>` : ''}
    </div>`,
  });
}

async function sendWebhookAlert({ title, message }) {
  const text = `[StealthVPN ${env.NODE_ENV}] ${title}\n${message}`;
  // Both keys: Discord renders "content", Slack renders "text"; each ignores
  // the other. Generic endpoints receive a structured payload.
  const payload = { content: text, text, title };
  const res = await fetch(env.ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`webhook responded ${res.status}`);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

function alertSignature(message, details) {
  const body = message + (details && details.stack ? `\n${details.stack}` : '');
  return body.slice(0, 200);
}

/**
 * Log locally and dispatch to every configured channel, throttled per
 * (source, signature) key. Never throws.
 */
async function alertError({ source, title, message, details, err }) {
  const signature = alertSignature(message, details);
  const key = `${source}:${signature}`;

  logger.error(`ALERT [${source}] ${title}`, { message, details });

  if (!throttle.shouldSend(key)) {
    logger.debug('Alert throttled', { key });
    return;
  }

  logger.info(`Dispatching alert [${source}] ${title}`);

  const jobs = [];
  if (env.ALERT_EMAIL_TO) {
    jobs.push(sendEmailAlert({ title, message, details }).catch((err) => {
      logger.error('Alert email failed', { error: err.message });
    }));
  }
  if (env.ALERT_WEBHOOK_URL) {
    jobs.push(sendWebhookAlert({ title, message }).catch((err) => {
      logger.error('Alert webhook failed', { error: err.message });
    }));
  }
  const sentry = getSentry();
  if (sentry) {
    jobs.push(
      Promise.resolve(sentry.captureException(err instanceof Error ? err : new Error(message))).catch((e) => {
        logger.error('Alert Sentry failed', { error: e.message });
      })
    );
  }

  await Promise.allSettled(jobs);
}

function alertCronFailure(cronName, err) {
  return alertError({
    source: `cron.${cronName}`,
    title: `Cron "${cronName}" failed`,
    message: err.message,
    details: { stack: err.stack },
  });
}

function registerProcessHandlers() {
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled rejection', { reason });
    alertError({
      source: 'process',
      title: 'Unhandled rejection',
      message: err.message,
      details: { stack: err.stack },
    }).catch(() => {});
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    alertError({
      source: 'process',
      title: 'Uncaught exception',
      message: err.message,
      details: { stack: err.stack },
      err,
    })
      .catch(() => {})
      // No point living after an uncaught exception; PM2 restarts the worker.
      // eslint-disable-next-line no-process-exit -- uncaughtException is fatal
      .finally(() => process.exit(1));
  });
}

module.exports = {
  createThrottle,
  alertError,
  alertCronFailure,
  registerProcessHandlers,
};
