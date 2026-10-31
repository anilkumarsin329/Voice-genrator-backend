const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const Admin = require('../models/Admin');
const VoiceAdmin = require('../models/VoiceAdmin');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Pre-computed so unknown emails take the same time as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const publicUser = (u) => ({ id: String(u._id), email: u.email, role: u.role });

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  // Authenticates against the platform admins (read-only); this module issues its own session token.
  // Platform admins first, then admins created for this module.
  let source = 'platform';
  let user = await Admin.findOne({ email }).select('+password');
  if (!user) {
    user = await VoiceAdmin.findOne({ email }).select('+password');
    source = 'voicegen';
  }
  const ok = await bcrypt.compare(password, user?.password || DUMMY_HASH);
  if (!user || !ok) throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  if (!user.isActive || !user.loginApproved) throw new ApiError(403, 'This admin account is disabled or not approved for login', 'FORBIDDEN');
  if (!['admin', 'super_admin'].includes(user.role)) throw new ApiError(403, 'Admin access required', 'FORBIDDEN');

  const token = jwt.sign({ sub: String(user._id), role: user.role, src: source }, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
  });
  res.json({ success: true, token, user: publicUser(user) });
});

const me = (req, res) => res.json({ success: true, user: publicUser(req.user) });

module.exports = { login, me };
