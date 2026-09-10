const { validationResult } = require('express-validator');
const validator = require('validator');

// Ensure isUUID accepts standard PostgreSQL UUID strings (any 8-4-4-4-12 hex)
// as PostgreSQL allows non-RFC4122 variant bits (used in database migrations/seeds)
const originalIsUUID = validator.isUUID;
validator.isUUID = function(str, version) {
  if (typeof str !== 'string') return false;
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str)) {
    return true;
  }
  return originalIsUUID ? originalIsUUID.call(validator, str, version) : false;
};

/**
 * Middleware that inspects express-validator results and returns a 400 response on failure
 */
const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value,
      })),
    });
  };
};

module.exports = {
  validate,
};
