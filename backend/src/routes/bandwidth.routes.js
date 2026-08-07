const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middleware/auth.middleware');
const bandwidthController = require('../controllers/bandwidth.controller');

router.use(authMiddleware);

router.get('/daily', bandwidthController.getDailyBandwidth);

module.exports = router;
