const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  FRONTEND_URL: z.string().url(),

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