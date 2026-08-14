const express = require('express');
const router = express.Router();

const { validate, validateQuery } = require('../middleware/validate.middleware');
const { authMiddleware } = require('../middleware/auth.middleware');
const { adminMiddleware } = require('../middleware/admin.middleware');
const { adminLimiter } = require('../middleware/rateLimit.middleware');
const {
  adminUpdateUserSchema,
  adminBanUserSchema,
  adminExtendDeviceSchema,
  adminListUsersSchema,
  adminListDevicesSchema,
  listAuditLogsQuerySchema,
} = require('../middleware/schemas');
const adminController = require('../controllers/admin.controller');

router.use(authMiddleware, adminMiddleware, adminLimiter);

// POST (not GET): search terms and filters live in the body so identifiers
// never appear in access logs (PRIV-07/08).
router.post('/users', validate(adminListUsersSchema), adminController.listUsers);
router.patch('/users/:id', validate(adminUpdateUserSchema), adminController.updateUser);
router.post('/users/:id/ban', validate(adminBanUserSchema), adminController.banUser);
router.get('/revenue', adminController.getRevenue);
router.get('/bandwidth', adminController.getBandwidthStats);
router.get('/alerts', adminController.getAlerts);
router.get('/pool-status', adminController.getPoolStatus);
router.get('/audit-logs', validateQuery(listAuditLogsQuerySchema), adminController.listAuditLogs);
router.post('/devices', validate(adminListDevicesSchema), adminController.listDevices);

router.post('/devices/:id/expire', adminController.expireDevice);
router.post('/devices/:id/revoke', adminController.revokeDevice);
router.post('/devices/:id/extend', validate(adminExtendDeviceSchema), adminController.extendDevice);
router.post('/devices/:id/reset-bandwidth', adminController.resetBandwidth);

module.exports = router;