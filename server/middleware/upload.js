'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const UPLOAD_DIR = env.uploads.dir;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['application/pdf', '.pdf'],
  ['text/plain', '.txt'],
  ['application/zip', '.zip'],
  ['application/json', '.json'],
  ['text/csv', '.csv'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Never reuse the client-supplied name on disk: it is attacker-controlled.
    const ext = ALLOWED.get(file.mimetype) || path.extname(file.originalname).toLowerCase().slice(0, 8);
    cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED.has(file.mimetype)) {
    return cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
  }
  return cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.uploads.maxMb * 1024 * 1024, files: 1 },
});

module.exports = { upload, UPLOAD_DIR, ALLOWED };
