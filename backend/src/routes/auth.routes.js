const express = require('express');
const router = express.Router();

const { validate } = require('../middleware/validate.middleware');
const { authLimiter, registerLimiter } = require('../middleware/rateLimit.middleware');
const {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../middleware/schemas');

const authController = require('../controllers/auth.controller');

router.post('/register', registerLimiter, validate(registerSchema), authController.register);
router.post('/verify', validate(verifyEmailSchema), authController.verifyEmail);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

module.exports = router;