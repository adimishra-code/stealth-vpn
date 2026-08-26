const { ApiError } = require('../utils/ApiError');

function adminMiddleware(req, res, next) {
  if (!req.user) {
    return next(new ApiError(401, 'Authentication required'));
  }
  if (req.user.role !== 'admin') {
    return next(new ApiError(403, 'Admin access required'));
  }
  // SEC-09: Two-factor authentication is mandatory for all admin roles
  if (!req.user.totpEnabled) {
    return next(new ApiError(403, 'Two-factor authentication is mandatory for administrator accounts'));
  }
  const amr = (req.authInfo && Array.isArray(req.authInfo.amr)) ? req.authInfo.amr : [];
  if (!amr.includes('mfa')) {
    return next(new ApiError(403, 'Multi-factor authentication required for administrative actions'));
  }
  next();
}

module.exports = { adminMiddleware };