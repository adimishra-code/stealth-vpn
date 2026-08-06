const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

// Mount: app.use('/api/payment/webhook', webhookRoutes)
// Raw body is parsed in app.js BEFORE express.json() — DO NOT add json middleware here.
router.post('/', paymentController.webhook);

module.exports = router;