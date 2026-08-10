'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

/** Top-level API segments, used to spot a request that lost its /api prefix. */
const API_SEGMENTS = [
  'auth', 'support', 'products', 'knowledge', 'training', 'conversations',
  'customers', 'tickets', 'announcements', 'recommendations', 'dashboard', 'analytics', 'health',
];

function notFound(req, _res, next) {
  const path = req.path || req.originalUrl || '';
  const firstSegment = path.split('?')[0].split('/').filter(Boolean)[0];

  // A frontend built with VITE_API_URL pointing at the bare service origin
  // sends /auth/login instead of /api/auth/login. Say so explicitly rather
  // than leaving a generic 404 to be reverse-engineered from the console.
  if (API_SEGMENTS.includes(firstSegment)) {
    return next(
      ApiError.notFound(
        `Route not found: ${req.method} ${req.originalUrl}. The API is mounted under /api — did you mean ${req.method} /api${path}? ` +
          'If this came from the web app, set VITE_API_URL to the API origin and rebuild the frontend.'
      )
    );
  }

  return next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let error = err;

  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    error = new ApiError(400, 'Validation failed', details);
  } else if (err.name === 'CastError') {
    error = new ApiError(400, `Invalid ${err.path}: ${err.value}`);
  } else if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = new ApiError(409, `A record with that ${field} already exists`);
  } else if (err.name === 'MulterError') {
    error = new ApiError(400, err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message);
  } else if (!(err instanceof ApiError)) {
    error = new ApiError(err.statusCode || 500, err.message || 'Something went wrong');
  }

  if (error.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} ->`, err.stack || err.message);
  } else {
    logger.debug(`${req.method} ${req.originalUrl} -> ${error.statusCode} ${error.message}`);
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.statusCode >= 500 && env.isProd ? 'Something went wrong' : error.message,
    ...(error.details ? { details: error.details } : {}),
    ...(env.isProd ? {} : { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
