const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const notFound = (req, res, next) => next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message;

  if (err.type === 'entity.parse.failed') { status = 400; code = 'BAD_JSON'; message = 'Malformed JSON body'; }
  else if (err.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body too large'; }
  else if (err.name === 'CastError') { status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid identifier'; }
  else if (err.name === 'ValidationError') { status = 400; code = 'VALIDATION_ERROR'; }
  else if (err.code === 11000) { status = 409; code = 'DUPLICATE'; message = 'Duplicate record'; }
  if (typeof status !== 'number' || status < 400 || status > 599) status = 500;

  if (status >= 500) {
    logger.error('request failed', { method: req.method, url: req.originalUrl, status, error: err.message, stack: err.stack });
    if (!(err instanceof ApiError)) message = 'Internal server error'; // never leak internals
  }
  res.status(status).json({ success: false, code, message, ...(err.details ? { details: err.details } : {}) });
};

module.exports = { notFound, errorHandler };
