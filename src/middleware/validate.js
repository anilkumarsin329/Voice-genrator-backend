const ApiError = require('../utils/ApiError');

/** validate(schema, 'body' | 'query' | 'params') — replaces the source with the parsed (coerced, defaulted) value. */
module.exports = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(new ApiError(400, details[0] ? `${details[0].field ? details[0].field + ': ' : ''}${details[0].message}` : 'Invalid request', 'VALIDATION_ERROR', details));
  }
  // Express 5 makes req.query a getter; define an own property instead of assigning.
  Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true, enumerable: true });
  next();
};
