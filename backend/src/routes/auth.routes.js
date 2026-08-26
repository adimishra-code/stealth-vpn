const express = require('express');
const router = express.Router();

const { validate } = require('../middleware/validate.middleware');
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  authLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  refreshLimiter,
  resetPasswordLimiter,
} = require('../middleware/rateLimit.middleware');
const {
  registerSchema,
  loginSchema,
  totpSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../middleware/schemas');

const authController = require('../controllers/auth.controller');
const accountDeletionController = require('../controllers/accountDeletion.controller');

router.post('/register', registerLimiter, validate(registerSchema), authController.register);
router.post('/verify', validate(verifyEmailSchema), authController.verifyEmail);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', refreshLimiter, authController.refresh);
router.post('/logout', authController.logout);
router.delete('/sessions', authMiddleware, authController.logoutAll);
// ADMIN-01: TOTP enrollment (setup regenerates the secret; verify flips the
// flag on after a code round-trip; disable requires a valid code).
router.post('/totp/setup', authMiddleware, authController.totpSetup);
router.post('/totp/verify', authMiddleware, validate(totpSchema), authController.totpVerify);
router.post('/totp/disable', authMiddleware, validate(totpSchema), authController.totpDisable);
router.post('/forgot-password', forgotPasswordLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
// Resend verification — re-uses the register limiter (3/hr) to throttle abuse.
// Anti-enumeration handled in the controller (same generic response for
// "email not registered" and "email already verified").
router.post('/resend-verify', registerLimiter, validate(forgotPasswordSchema), authController.resendVerify);
router.post('/reset-password', resetPasswordLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.get('/me', authMiddleware, authController.me);
// Right to be forgotten: revokes everything now, hard-deletes after the
// grace period via the purge cron.
router.delete('/me', authMiddleware, accountDeletionController.requestAccountDeletion);

module.exports = router;