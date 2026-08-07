const mongoose = require('mongoose');

// ADMIN-02: immutable trail of every admin lifecycle action (who did what to
// which target, when, from where). Writes are fire-and-forget; reads are
// admin-only (GET /api/admin/audit-logs).
const AuditLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // e.g. 'user.update', 'user.ban', 'device.expire', 'device.extend'
  action: {
    type: String,
    required: true,
  },
  targetType: {
    type: String,
    enum: ['user', 'device', 'invoice'],
    required: true,
  },
  targetId: String,
  details: {
    type: Object,
    default: {},
  },
  ip: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ adminId: 1, createdAt: -1 });
// 90-day retention enforced by MongoDB's TTL sweeper.
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
