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

  WG_ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/),

  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  SSH_PRIVATE_KEY_PATH: z.string().min(1),

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

  NODE_MUMBAI_IP: z.string().optional(),
  NODE_MUMBAI_WG_PUBLIC_KEY: z.string().optional(),
  NODE_MUMBAI_REALITY_PUBLIC_KEY: z.string().optional(),
  NODE_MUMBAI_REALITY_SHORT_ID: z.string().optional(),

  NODE_FRANKFURT_IP: z.string().optional(),
  NODE_FRANKFURT_WG_PUBLIC_KEY: z.string().optional(),
  NODE_FRANKFURT_REALITY_PUBLIC_KEY: z.string().optional(),
  NODE_FRANKFURT_REALITY_SHORT_ID: z.string().optional(),
});

let env;

try {
  env = envSchema.parse(process.env);
} catch (err) {
  console.error('Invalid environment variables:');
  console.error(err.errors);
  process.exit(1);
}

module.exports = env;