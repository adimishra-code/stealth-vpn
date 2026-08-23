const express = require('express');
const router = express.Router();

const { validate } = require('../middleware/validate.middleware');
const { authMiddleware } = require('../middleware/auth.middleware');
const { deviceLimiter } = require('../middleware/rateLimit.middleware');
const { addDeviceSchema, updateDeviceModeSchema } = require('../middleware/schemas');
const deviceController = require('../controllers/device.controller');

router.use(authMiddleware);
router.use(deviceLimiter);

router.get('/', deviceController.listDevices);
router.post('/', validate(addDeviceSchema), deviceController.addDevice);
router.delete('/:id', deviceController.revokeDevice);
router.get('/:id/config', deviceController.downloadConfig);
router.post('/:id/config', deviceController.downloadConfig);
router.get('/:id/qr', deviceController.qrcode);
router.get('/:id/vless', deviceController.getVlessConfig);
router.patch('/:id/mode', validate(updateDeviceModeSchema), deviceController.toggleMode);
router.get('/:id/bandwidth', deviceController.getBandwidth);

module.exports = router;