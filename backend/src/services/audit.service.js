const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

// Fire-and-forget: an audit write must never fail or slow down the admin
// action it records. Failures are logged so gaps become visible in ops.
function audit({ adminId, action, targetType, targetId, details = {}, ip }) {
  AuditLog.create({ adminId, action, targetType, targetId, details, ip }).catch((err) => {
    logger.error('Audit log write failed', { action, error: err.message });
  });
}

module.exports = { audit };
