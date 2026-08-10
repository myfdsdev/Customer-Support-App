'use strict';

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/** Turns express-validator results into a single 400 with field details. */
function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const details = result.array().map((e) => ({ field: e.path || e.param, message: e.msg }));
  return next(new ApiError(400, 'Validation failed', details));
}

// Built from a string literal so no raw control characters live in this file.
const CONTROL_CHARS = new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', 'g');

/**
 * Strips control characters from strings and removes Mongo operator keys
 * ($gt, $where, dotted paths) so user input can never reshape a query.
 */
function sanitizeInput(req, _res, next) {
  const clean = (val, depth = 0) => {
    if (depth > 8) return undefined;
    if (typeof val === 'string') return val.replace(CONTROL_CHARS, '');
    if (Array.isArray(val)) return val.map((v) => clean(v, depth + 1));
    if (val && typeof val === 'object' && val.constructor === Object) {
      for (const k of Object.keys(val)) {
        if (k.startsWith('$') || k.includes('.')) {
          delete val[k];
          continue;
        }
        val[k] = clean(val[k], depth + 1);
      }
      return val;
    }
    return val;
  };

  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  if (req.query && typeof req.query === 'object') {
    for (const k of Object.keys(req.query)) {
      if (k.startsWith('$') || k.includes('.')) delete req.query[k];
      else if (typeof req.query[k] === 'string') req.query[k] = req.query[k].replace(CONTROL_CHARS, '');
    }
  }
  next();
}

module.exports = { validate, sanitizeInput };
