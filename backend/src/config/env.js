const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  FRONTEND_URL: z.string().url(),

  // Set to 'false' on every worker except ONE — crons must never run on
  // multiple replicas (duplicate expiry emails, doubled bandwidth deltas,
  // doubled SSH load). Leader election is manual via this flag.
  CRON_ENABLED: z.preprocess(
    (v) => v === true || v === 'true',
    z.boolean().default(true)
  ),

  // Number of reverse-proxy hops to trust for req.ip (Cloudflare: 1).
  // Rate limiting keys on req.ip — leaving this 0 behind a proxy means
  // every user shares the proxy's IP and one user can rate-limit everyone.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  MONGO_URI: z.string().startsWith('mongodb'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('30d'),

  // JWT-01: ES256 (ECDSA P-256) key pairs, base64-encoded DER (SPKI public,
  // PKCS8 private). When the private key for a type is set, tokens are signed
  // with ES256 and verified against the matching public key instead of the
  // shared HMAC secret above — clients can't forge tokens without the private
  // key, and a compromised signer doesn't leak a secret usable elsewhere.
  // Generate with scripts/generate-jwt-keys.js. Both or neither per type:
  // keep the HMAC secrets during migration, then remove them after rotating.
  JWT_ACCESS_PUBLIC_KEY: z.string().base64().optional(),
  JWT_ACCESS_PRIVATE_KEY: z.string().base64().optional(),
  JWT_REFRESH_PUBLIC_KEY: z.string().base64().optional(),
  JWT_REFRESH_PRIVATE_KEY: z.string().base64().optional(),

  WG_ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/),

  // Rotation support: set the OLD key here BEFORE rotating WG_ENCRYPTION_KEY
  // so stored device keys stay decryptable. Remove once no device was
  // provisioned under the old key.
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

  // Non-root SSH user on VPN nodes (created by scripts/provision-node.sh).
  // Privileged node commands (wg, wg-quick, tc, xray api) run via the sudoers
  // whitelist — the app never logs in as root.
  NODE_SSH_USER: z.string().min(1).optional(),

  // When true, bandwidth quota enforcement revokes devices over their
  // plan quota. Basic = 500 GB/month; pro/team unlimited.
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
  // (lazy-loaded only when SENTRY_DSN is set AND @sentry/node is installed —
  // it is an optional dependency, not a package.json requirement).
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
  // gRPC API endpoint on each VPN node (the xray api CLI reads its --server from
  // this). SNI destination used for the Reality handshake and the VLESS URI.
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