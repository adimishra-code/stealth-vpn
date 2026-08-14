const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Try again in 1 hour.' },
});

// Keyed per IP+email: neither IP hopping nor hammering one IP can exhaust
// the other's budget. The IP prefix is mandatory in express-rate-limit v7.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String((req.body && req.body.email) || '').toLowerCase()}`,
  message: { error: 'Too many reset requests. Try again in 1 hour.' },
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
  message: { error: 'Too many payment attempts. Try again later.' },
});

const paymentVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
  message: { error: 'Too many payment verifications. Try again later.' },
});

const deviceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
  message: { error: 'Too many device operations. Try again later.' },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests.' },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
});

// ErrorBoundary telemetry: generous but bounded so a misbehaving client
// cannot hammer the API or make its own telemetry spam 5xx alerting.
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many error reports.' },
});

module.exports = {
  authLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  paymentLimiter,
  paymentVerifyLimiter,
  deviceLimiter,
  adminLimiter,
  apiLimiter,
  clientErrorLimiter,
};