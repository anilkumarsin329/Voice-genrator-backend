const jwt = require('jsonwebtoken');
const config = require('../config');
const Admin = require('../models/Admin');
const VoiceAdmin = require('../models/VoiceAdmin');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/** Verifies the Bearer JWT and loads the admin from the platform `admins` collection (so deactivated admins lose access immediately). */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'Authentication required', 'UNAUTHENTICATED');

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
  } catch {
    throw new ApiError(401, 'Session expired or invalid. Please sign in again.', 'UNAUTHENTICATED');
  }
  const user = await (payload.src === 'voicegen' ? VoiceAdmin : Admin).findById(payload.sub);
  if (!user || !user.isActive || !user.loginApproved) throw new ApiError(401, 'Account not found or disabled', 'UNAUTHENTICATED');
  req.user = user;
  next();
});

const requireAdmin = (req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.user?.role)) return next(new ApiError(403, 'Admin access required', 'FORBIDDEN'));
  next();
};

module.exports = { authenticate, requireAdmin };
