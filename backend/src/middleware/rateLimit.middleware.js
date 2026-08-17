const rateLimit = require('express-rate-limit');
const { redis } = require('../config/redis');

// Minimal express-rate-limit v7 Store backed by ioredis.
// Returns undefined (use MemoryStore default) when Redis is absent.
function makeRedisStore(prefix) {
  if (!redis) return undefined;

  return {
    async increment(key) {
      const redisKey = `rl:${prefix}:${key}`;
      const [count] = await redis
        .multi()
        .incr(redisKey)
        .expire(redisKey, Math.ceil(this.windowMs / 1000))
        .exec();
      return { totalHits: count[1], resetTime: new Date(Date.now() + this.windowMs) };
    },
    async decrement(key) {
      await redis.decr(`rl:${prefix}:${key}`);
    },
    async resetKey(key) {
      await redis.del(`rl:${prefix}:${key}`);
    },
    init({ windowMs }) {
      this.windowMs = windowMs;
    },
  };
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  store: makeRedisStore('auth'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  store: makeRedisStore('register'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Try again in 1 hour.' },
});

// Keyed per IP+email: neither IP hopping nor hammering one IP can exhaust
// the other's budget. The IP prefix is mandatory in express-rate-limit v7.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  store: makeRedisStore('forgotpw'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String((req.body && req.body.email) || '').toLowerCase()}`,
  message: { error: 'Too many reset requests. Try again in 1 hour.' },
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  store: makeRedisStore('payment'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
  message: { error: 'Too many payment attempts. Try again later.' },
});

const paymentVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  store: makeRedisStore('paymentverify'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
  message: { error: 'Too many payment verifications. Try again later.' },
});

const deviceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  store: makeRedisStore('device'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
  message: { error: 'Too many device operations. Try again later.' },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  store: makeRedisStore('admin'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests.' },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  store: makeRedisStore('api'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
});

// ErrorBoundary telemetry: generous but bounded so a misbehaving client
// cannot hammer the API or make its own telemetry spam 5xx alerting.
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  store: makeRedisStore('clienterr'),
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