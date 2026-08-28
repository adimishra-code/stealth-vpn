const { z } = require('zod');
const env = require('../config/env');

// STRIPE-01: success/cancel URLs are where Stripe redirects the browser — an
// open-ended URL would let an attacker redirect victims to a phishing
// lookalike. Pin them to the app's own origin.
const frontendOrigin = new URL(env.FRONTEND_URL).origin;
const appOriginUrl = () =>
  z
    .string()
    .url('Must be a valid URL')
    .refine((u) => new URL(u).origin === frontendOrigin, {
      message: `Redirect URL must be on ${frontendOrigin}`,
    });

// ── Auth schemas ──────────────────────────────────────────────────────────────
const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
  // ADMIN-01: 6-digit TOTP code, only required when the (admin) account has
  // 2FA enabled.
  totpCode: z.string().length(6, 'Two-factor code must be 6 digits').optional(),
});

// ADMIN-01: enrollment round-trip / disable require a valid 6-digit code.
const totpSchema = z.object({
  totpCode: z.string().length(6, 'Two-factor code must be 6 digits'),
});

const verifyEmailSchema = z.object({
  token: z.string().length(64, 'Invalid token'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email'),
});

const resetPasswordSchema = z.object({
  token: z.string().length(64, 'Invalid token'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const serverNodeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid server node format')
  .default('auto');

const deviceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-zA-Z0-9 _-]+$/,
    'Device name may only contain alphanumeric characters, spaces, underscores, and hyphens'
  );

// ── Device schemas ────────────────────────────────────────────────────────────
const addDeviceSchema = z.object({
  deviceName: deviceNameSchema,
  serverNode: serverNodeSchema,
  mode: z.enum(['stealth', 'gaming']).default('stealth'),
});

const updateDeviceModeSchema = z.object({
  mode: z.enum(['stealth', 'gaming']),
});

// ── Payment schemas ───────────────────────────────────────────────────────────
const createOrderSchema = z.object({
  plan: z.enum(['basic', 'pro', 'team']),
  serverNode: serverNodeSchema,
  deviceName: deviceNameSchema,
  mode: z.enum(['stealth', 'gaming']).default('stealth'),
});

const verifyPaymentSchema = z.object({
  paymentId: z.string().min(1),
  orderId: z.string().min(1),
  signature: z.string().min(1),
  plan: z.enum(['basic', 'pro', 'team']),
  serverNode: serverNodeSchema,
  deviceName: deviceNameSchema,
  mode: z.enum(['stealth', 'gaming']).default('stealth'),
});

const stripeSessionSchema = z.object({
  plan: z.enum(['basic', 'pro', 'team']),
  serverNode: serverNodeSchema,
  deviceName: deviceNameSchema,
  mode: z.enum(['stealth', 'gaming']).default('stealth'),
  successUrl: appOriginUrl(),
  cancelUrl: appOriginUrl(),
});

const stripeConfirmSchema = z.object({
  session_id: z.string().min(1),
});

const downgradePlanSchema = z.object({
  targetPlan: z.enum(['free', 'basic', 'pro']),
});

const cancelSubscriptionSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ── Admin schemas ─────────────────────────────────────────────────────────────
const adminUpdateUserSchema = z.object({
  plan: z.enum(['free', 'basic', 'pro', 'team']).optional(),
  isActive: z.boolean().optional(),
  banReason: z.string().max(500).optional(),
});

const adminBanUserSchema = z.object({
  banReason: z.string().max(500).default('Banned by admin'),
});

const adminExtendDeviceSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650),
});

// PRIV-07/08: admin list filters travel in the POST BODY, never the query
// string — search terms in ?search= would land in nginx/morgan logs.
const adminListUsersSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(200).optional(),
  plan: z.enum(['free', 'basic', 'pro', 'team']).optional(),
});

const adminListDevicesSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(200).optional(),
});

// API-01: audit-log listing is a GET, so page/limit travel in the query
// string. Coerce + clamp them exactly like the body filters — a limit of
// 1e9 must not turn into a full-table scan.
const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  totpSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  addDeviceSchema,
  updateDeviceModeSchema,
  createOrderSchema,
  verifyPaymentSchema,
  stripeSessionSchema,
  stripeConfirmSchema,
  downgradePlanSchema,
  cancelSubscriptionSchema,
  adminUpdateUserSchema,
  adminBanUserSchema,
  adminExtendDeviceSchema,
  adminListUsersSchema,
  adminListDevicesSchema,
  listAuditLogsQuerySchema,
};