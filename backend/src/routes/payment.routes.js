const express = require('express');
const router = express.Router();

const { validate } = require('../middleware/validate.middleware');
const { authMiddleware } = require('../middleware/auth.middleware');
const { paymentVerifyLimiter, paymentLimiter } = require('../middleware/rateLimit.middleware');
const {
  createOrderSchema,
  verifyPaymentSchema,
  stripeSessionSchema,
  stripeConfirmSchema,
} = require('../middleware/schemas');
const paymentController = require('../controllers/payment.controller');

// All payment routes require auth (except webhook, mounted separately)
router.use(authMiddleware);

// Razorpay (India, primary)
router.post('/create-order', paymentLimiter, validate(createOrderSchema), paymentController.createOrder);
router.post('/verify', paymentVerifyLimiter, validate(verifyPaymentSchema), paymentController.verifyPayment);

// Stripe (international)
router.post('/stripe/session', paymentLimiter, validate(stripeSessionSchema), paymentController.stripeSession);
router.post('/stripe/confirm', validate(stripeConfirmSchema), paymentController.stripeConfirm);

// Invoices
router.get('/invoices', paymentController.listInvoices);

module.exports = router;