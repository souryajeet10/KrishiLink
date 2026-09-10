/**
 * Centralized error handler and 404 middleware
 */

const notFoundHandler = (req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      message: `API Route not found: ${req.method} ${req.originalUrl}`,
    });
  }
  next();
};

const errorHandler = (err, req, res, next) => {
  console.error('⚠️ [Error Handler Caught]:', err);

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // PostgreSQL specific error code handling
  if (err.code === '23505') {
    // Unique violation
    statusCode = 409;
    message = `Duplicate resource error: ${err.detail || 'A record with these details already exists.'}`;
  } else if (err.code === '23503') {
    // Foreign key violation
    statusCode = 400;
    message = `Foreign key reference error: ${err.detail || 'Referenced related record does not exist.'}`;
  } else if (err.code === '22P02') {
    // Invalid text representation (e.g. invalid UUID)
    statusCode = 400;
    message = 'Invalid input format (e.g. invalid UUID or integer representation).';
  } else if (err.code === '23502') {
    // Not null violation
    statusCode = 400;
    message = `Missing required field: ${err.column}`;
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      dbCode: err.code,
      detail: err.detail,
    }),
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
