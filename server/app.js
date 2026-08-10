'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// Behind a proxy (Render/Heroku/nginx) req.ip must come from X-Forwarded-For
// for rate limiting to key on the real client.
app.set('trust proxy', 1);

app.use(
  helmet({
    // Uploaded images are rendered by the SPA on a different origin in dev.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: env.isProd ? undefined : false,
  })
);

const allowedOrigins = env.clientUrl.split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      // Same-origin/server-to-server requests have no Origin header.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

if (!env.isProd) app.use(morgan('dev'));

app.use(
  '/uploads',
  express.static(env.uploads.dir, {
    maxAge: '7d',
    setHeaders: (res) => {
      // Never let an uploaded file execute in the browser.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
    },
  })
);

app.use('/api', routes);

// Serve the built SPA in production so one process hosts both.
if (env.isProd) {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
