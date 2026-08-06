const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middleware/auth.middleware');
const serverController = require('../controllers/server.controller');

router.use(authMiddleware);

router.get('/', serverController.listServers);
router.get('/:name/health', serverController.serverHealth);

module.exports = router;