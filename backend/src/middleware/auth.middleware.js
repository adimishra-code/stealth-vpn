const { verifyAccessToken } = require('../utils/jwt');
const { ApiError } = require('../utils/ApiError');
const User = require('../models/User');

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ApiError(401, 'Authentication required');
    }
    const token = header.split(' ')[1];
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.sub).select('-passwordHash -refreshTokens -activeSessions -totpSecretEnc');
    if (!user) throw new ApiError(401, 'User not found');
    if (!user.isActive) throw new ApiError(403, 'Account suspended');
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return next(new ApiError(401, 'Invalid or expired token'));
    }
    if (err.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Token expired'));
    }
    next(err);
  }
}

module.exports = { authMiddleware };