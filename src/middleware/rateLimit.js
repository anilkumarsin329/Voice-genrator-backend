const rateLimit = require('express-rate-limit');

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, code: 'RATE_LIMITED', message },
  });

module.exports = {
  api: make(60 * 1000, 300, 'Too many requests. Please slow down.'),
  login: make(15 * 60 * 1000, 10, 'Too many login attempts. Try again in 15 minutes.'),
  // Generation spends paid ElevenLabs credits, so it is limited tighter than other routes.
  generate: make(60 * 1000, 20, 'Too many generation requests. Please wait a minute.'),
};
