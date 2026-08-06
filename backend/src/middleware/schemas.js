const { z } = require('zod');

// ── Auth schemas ──────────────────────────────────────────────────────────────
const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
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

// ── Device schemas ────────────────────────────────────────────────────────────
const addDeviceSchema = z.object({
  deviceName: z.string().min(1).max(64),
  serverNode: z.enum(['mumbai', 'frankfurt']),
  mode: z.enum(['stealth', 'gaming']).default('stealth'),
});

const updateDeviceModeSchema = z.object({
  mode: z.enum(['stealth', 'gaming']),
});

// ── Payment schemas ───────────────────────────────────────────────────────────
const createOrderSchema = z.object({
  plan: z.enum(['basic', 'pro', 'team']),
  serverNode: z.enum(['mumbai', 'frankfurt']),
  deviceName: z.string().min(1).max(64),
  mode: z.enum(['stealth', 'gaming']).default('stealth'),
});

const verifyPaymentSchema = z.object({
  paymentId: z.string().min(1),
  orderId: z.string().min(1),
  signature: z.string().min(1),
  plan: z.enum(['basic', 'pro', 'team']),
  serverNode: z.enum(['mumbai', 'frankfurt']),
  deviceName: z.string().min(1).max(64),
  mode: z.enum(['stealth', 'gaming']).default('stealth'),
});

const stripeSessionSchema = z.object({
  plan: z.enum(['basic', 'pro', 'team']),
  serverNode: z.enum(['mumbai', 'frankfurt']),
  deviceName: z.string().min(1).max(64),
  mode: z.enum(['stealth', 'gaming']).default('stealth'),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const stripeConfirmSchema = z.object({
  session_id: z.string().min(1),
});

// ── Admin schemas ─────────────────────────────────────────────────────────────
const adminUpdateUserSchema = z.object({
  plan: z.enum(['free', 'basic', 'pro', 'team']).optional(),
  isActive: z.boolean().optional(),
  banReason: z.string().max(500).optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  addDeviceSchema,
  updateDeviceModeSchema,
  createOrderSchema,
  verifyPaymentSchema,
  stripeSessionSchema,
  stripeConfirmSchema,
  adminUpdateUserSchema,
};