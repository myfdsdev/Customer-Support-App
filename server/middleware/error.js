'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
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
