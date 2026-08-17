const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  FRONTEND_URL: z.string().url(),

  // Single cron worker: crons must never run on multiple replicas (duplicate
  // emails, doubled bandwidth deltas). Leader election is manual via this flag.
  CRON_ENABLED: z.preprocess(
    (v) => v === true || v === 'true',
    z.boolean().default(true)
  ),

  // Reverse-proxy hops to trust for req.ip (Cloudflare: 1). Rate limiting
  // keys on req.ip — 0 behind a proxy lets one user rate-limit everyone.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // Optional Redis URL for distributed locking and rate limiter store.
  // When absent, falls back to in-memory mutex and MemoryStore.
  REDIS_URL: z.string().url().optional(),

  // CSRF-02: server-side secret for the double-submit token (doubleCsrf
  // signs the token cookie). Rotate like any secret; no login needed.
  CSRF_SECRET: z.string().min(32),

  MONGO_URI: z.string().startsWith('mongodb'),

  // DB-02: TLS to MongoDB. MONGO_CA_FILE pins the server's CA instead of
  // trusting the system store. Without TLS, keys travel in clear text.
  MONGO_TLS: z.preprocess((v) => v === true || v === 'true', z.boolean().default(false)),
  MONGO_CA_FILE: z.string().min(1).optional(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('30d'),

  // JWT-01: ES256 (ECDSA P-256) key pairs, base64 DER (SPKI public, PKCS8
  // private). When set, tokens are signed with ES256 and verified against the
  // public key — clients can't forge tokens without the private key. Generate
  // with scripts/generate-jwt-keys.js; keep the HMAC secrets during migration.
  JWT_ACCESS_PUBLIC_KEY: z.string().base64().optional(),
  JWT_ACCESS_PRIVATE_KEY: z.string().base64().optional(),
  JWT_REFRESH_PUBLIC_KEY: z.string().base64().optional(),
  JWT_REFRESH_PRIVATE_KEY: z.string().base64().optional(),

  WG_ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/),

  // Rotation support: set the OLD key here BEFORE rotating WG_ENCRYPTION_KEY
  // so stored device keys stay decryptable; remove it once none remain.
  WG_ENCRYPTION_KEY_PREVIOUS: z
    .string()
    .length(64)
    .regex(/^[0-9a-fA-F]+$/)
    .optional(),

  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  SSH_PRIVATE_KEY_PATH: z.string().min(1),

  // Non-root SSH user on VPN nodes (scripts/provision-node.sh). Privileged
  // commands run via the sudoers whitelist — the app never logs in as root.
  NODE_SSH_USER: z.string().min(1).optional(),

  // When true, quota enforcement revokes devices over their plan quota.
  QUOTA_ENFORCE: z.preprocess(
    (v) => v === true || v === 'true' || v === undefined,
    z.boolean().default(true)
  ),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  EMAIL_FROM: z.string().email(),

  // ── Alerting ──────────────────────────────────────────────────────────────
  // 5xx errors, cron failures and node-down events alert via email (if set),
  // a generic webhook (Slack/Discord/Telegram-style JSON POST), and/or Sentry
  // (lazy-loaded only when SENTRY_DSN is set — an optional dependency).
  ALERT_EMAIL_TO: z.string().email().optional(),
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  ALERT_COOLDOWN_MINUTES: z.coerce.number().int().positive().default(5),
  SENTRY_DSN: z.string().url().optional(),

  NODE_MUMBAI_IP: z.string().optional(),
  NODE_MUMBAI_WG_PUBLIC_KEY: z.string().optional(),
  NODE_MUMBAI_REALITY_PUBLIC_KEY: z.string().optional(),
  NODE_MUMBAI_REALITY_SHORT_ID: z.string().optional(),

  NODE_FRANKFURT_IP: z.string().optional(),
  NODE_FRANKFURT_WG_PUBLIC_KEY: z.string().optional(),
  NODE_FRANKFURT_REALITY_PUBLIC_KEY: z.string().optional(),
  NODE_FRANKFURT_REALITY_SHORT_ID: z.string().optional(),

  // ── Xray / stealth mode ────────────────────────────────────────────────────────
  // gRPC API endpoint on each node; SNI destination for the Reality handshake.
  XRAY_API_URL: z.string().url().default('http://127.0.0.1:10085'),
  XRAY_SNI_DEST: z.string().min(1).default('microsoft.com'),
});

let env;

try {
  env = envSchema.parse(process.env);
} catch (err) {
  console.error('Invalid environment variables:');
  console.error(err.errors);
  // Failing fast on a broken .env beats running with empty secrets in prod.
  // eslint-disable-next-line no-process-exit -- configuration is fatal by design
  process.exit(1);
}

module.exports = env;