const express = require('express');
const router = express.Router();

const { validate } = require('../middleware/validate.middleware');
const { authMiddleware } = require('../middleware/auth.middleware');
const { adminMiddleware } = require('../middleware/admin.middleware');
const { adminLimiter } = require('../middleware/rateLimit.middleware');
const { adminUpdateUserSchema } = require('../middleware/schemas');
const adminController = require('../controllers/admin.controller');

router.use(authMiddleware, adminMiddleware, adminLimiter);

router.get('/users', adminController.listUsers);
router.patch('/users/:id', validate(adminUpdateUserSchema), adminController.updateUser);
router.get('/revenue', adminController.getRevenue);
router.get('/bandwidth', adminController.getBandwidthStats);
router.get('/alerts', adminController.getAlerts);

module.exports = router;