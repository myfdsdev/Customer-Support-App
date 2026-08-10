'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const logger = require('./utils/logger');
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
    /**
     * Helmet's default CSP is too tight for this app in two ways:
     *
     *   connect-src — defaults to 'self', which blocks every API call and the
     *     websocket when the frontend is deployed separately from the API.
     *   img-src     — defaults to 'self' data:, which blocks product logos and
     *     training-video thumbnails, both of which are admin-supplied URLs on
     *     arbitrary CDNs.
     */
    contentSecurityPolicy: env.isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"],
            formAction: ["'self'"],
            scriptSrc: ["'self'"],
            scriptSrcAttr: ["'none'"],
            // Google Fonts stylesheet + Tailwind's inline critical styles.
            styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
            fontSrc: ["'self'", 'https:', 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            mediaSrc: ["'self'", 'https:'],
            connectSrc: ["'self'", 'https:', 'wss:'],
            /**
             * Explicitly removed (Helmet merges with its defaults, so it has
             * to be nulled rather than omitted).
             *
             * It rewrites every http:// request to https://, which breaks any
             * deployment not terminating TLS itself — including plain-HTTP
             * hosts and local production smoke tests, where it turns requests
             * into ERR_SSL_PROTOCOL_ERROR. On an HTTPS host it buys nothing
             * here: the directives above already restrict img/media/connect to
             * 'self' and https:.
             */
            upgradeInsecureRequests: null,
          },
        }
      : false,
  })
);

const allowedOrigins = env.clientUrl.split(',').map((s) => s.trim()).filter(Boolean);
const rejectedOrigins = new Set();

/**
 * CORS.
 *
 * The same-origin allowance is not redundant. Vite emits its bundles as
 * `<script type="module" crossorigin>`, so the browser attaches an Origin
 * header and runs a CORS check even when the SPA is served by this very
 * server. Without this, a single-service deployment fails the check on its own
 * assets and renders a blank page.
 *
 * A disallowed origin is answered without CORS headers rather than by throwing:
 * throwing turned every blocked request into a 500, which is both the wrong
 * status and much harder to diagnose than a plain browser CORS message.
 */
app.use(
  cors((req, cb) => {
    const origin = req.headers.origin;

    // No Origin header: same-origin navigation or a server-to-server call.
    if (!origin) return cb(null, { origin: true, credentials: true });

    const selfOrigin = `${req.protocol}://${req.get('host')}`;
    if (origin === selfOrigin || allowedOrigins.includes(origin)) {
      return cb(null, { origin: true, credentials: true });
    }

    if (!rejectedOrigins.has(origin)) {
      rejectedOrigins.add(origin);
      logger.warn(
        `CORS: blocked origin ${origin}. Allowed: ${allowedOrigins.join(', ') || '(none)'} plus same-origin ${selfOrigin}. ` +
          'Add it to CLIENT_URL (comma-separated) if this is your frontend.'
      );
    }
    return cb(null, { origin: false, credentials: false });
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

/**
 * Compatibility shim for a frontend built without the /api prefix.
 *
 * A bundle built with VITE_API_URL pointing at the bare service origin calls
 * POST /auth/login instead of POST /api/auth/login. The real fix is to rebuild
 * the frontend, but a deployed SPA can be stale or cached for a long time, so
 * rather than leave the whole app unusable we forward the call.
 *
 * 308 preserves the method and the body, so a POST stays a POST.
 *
 * The Accept check is what makes this safe: `/support/:slug` is BOTH an SPA
 * route and an API route. A browser navigating there sends `Accept: text/html`
 * and must receive the SPA; an axios call sends `Accept: application/json` and
 * is the one we redirect. Without that guard this shim would break every
 * customer support page in single-service deployments.
 */
const API_PREFIX_SEGMENTS = new Set([
  'auth', 'support', 'products', 'knowledge', 'training', 'conversations',
  'customers', 'tickets', 'announcements', 'recommendations', 'dashboard', 'analytics', 'health',
]);
let warnedAboutPrefix = false;

app.use((req, res, next) => {
  const segment = req.path.split('/').filter(Boolean)[0];
  if (!API_PREFIX_SEGMENTS.has(segment)) return next();

  // Anything that wants a document is an SPA navigation, not an API call.
  if ((req.headers.accept || '').includes('text/html')) return next();

  if (!warnedAboutPrefix) {
    warnedAboutPrefix = true;
    logger.warn(
      `Received "${req.method} ${req.originalUrl}" without the /api prefix — redirecting. ` +
        'This means the deployed frontend was built with a VITE_API_URL that is missing /api. ' +
        'Rebuild the frontend to remove this extra round trip.'
    );
  }

  const target = `/api${req.originalUrl}`;
  return res.redirect(308, target);
});

// Serve the built SPA in production so one process hosts both.
if (env.isProd) {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
