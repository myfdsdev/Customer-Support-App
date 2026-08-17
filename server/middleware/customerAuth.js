'use strict';

const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, AUD_CUSTOMER } = require('../utils/tokens');
const { Customer, CustomerProduct, Product } = require('../models');
const { PURCHASE_STATUS, DASHBOARD_VISIBILITY } = require('../utils/constants');

/**
 * Membership-portal authentication.
 *
 * Kept in its own file, with its own token audience and its own cookie, so
 * that nothing here can be mistaken for `middleware/auth.js`. A staff token
 * cannot satisfy `authenticateCustomer` (wrong audience), and a customer token
 * cannot satisfy `authenticateUser` (also wrong audience) — the two are not
 * interchangeable even though both are signed with JWT_SECRET.
 */

/**
 * Cookie first, Authorization header second.
 *
 * The cookie is the preferred transport (HTTP-only, so script on the page
 * cannot read it). The header exists because a split deployment — SPA on one
 * origin, API on another — runs into browsers that block third-party cookies
 * outright, and a portal that cannot log in at all is worse than a bearer
 * token held in sessionStorage.
 */
function extractCustomerToken(req) {
  if (req.cookies && req.cookies[env.portal.cookieName]) return req.cookies[env.portal.cookieName];
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

const cookieOptions = () => ({
  httpOnly: true,
  // Cross-site cookies are only accepted alongside Secure, which needs HTTPS.
  sameSite: env.portal.crossSiteCookies ? 'none' : 'lax',
  secure: env.portal.crossSiteCookies || env.isProd,
  path: '/',
});

function setCustomerCookie(res, token, maxAgeMs) {
  res.cookie(env.portal.cookieName, token, { ...cookieOptions(), maxAge: maxAgeMs });
}

function clearCustomerCookie(res) {
  res.clearCookie(env.portal.cookieName, cookieOptions());
}

/**
 * Requires a valid portal session. Loads the live Customer so a blocked or
 * deleted account, or one whose password changed, fails immediately rather
 * than at token expiry.
 */
const authenticateCustomer = asyncHandler(async (req, _res, next) => {
  const token = extractCustomerToken(req);
  if (!token) throw ApiError.unauthorized('Please sign in to continue');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === 'TokenExpiredError' ? 'Your session expired, please sign in again' : 'Invalid session'
    );
  }

  // The audience check is the boundary between the two auth systems.
  if (payload.aud !== AUD_CUSTOMER) throw ApiError.unauthorized('Invalid token audience');

  const customer = await Customer.findById(payload.sub);
  if (!customer || !customer.hasPortalAccount) throw ApiError.unauthorized('Account no longer exists');
  if (customer.status === 'blocked') throw ApiError.forbidden('This account has been suspended');

  // A password change bumps sessionVersion, which retires every token minted
  // before it — including any an attacker may already be holding.
  if ((payload.sv || 0) !== (customer.sessionVersion || 0)) {
    throw ApiError.unauthorized('Your session is no longer valid, please sign in again');
  }

  req.customer = customer;
  req.customerId = customer._id;
  next();
});

/**
 * Optional variant for endpoints that behave differently when signed in but
 * must not 401 a logged-out visitor. Never throws on a bad token.
 */
const attachCustomerIfPresent = asyncHandler(async (req, _res, next) => {
  try {
    const token = extractCustomerToken(req);
    if (!token) return next();
    const payload = verifyToken(token);
    if (payload.aud !== AUD_CUSTOMER) return next();
    const customer = await Customer.findById(payload.sub);
    if (customer && customer.hasPortalAccount && (payload.sv || 0) === (customer.sessionVersion || 0)) {
      req.customer = customer;
      req.customerId = customer._id;
    }
  } catch {
    /* an unreadable optional token is simply "logged out" */
  }
  return next();
});

/**
 * Resolves the product named in the URL (`:productSlug` or `:productId`) and
 * confirms the signed-in customer holds an ACTIVE, VERIFIED entitlement to it.
 *
 * This is the server-side gate the whole portal depends on. Nothing about
 * ownership is ever taken from the request body — the entitlement is re-read
 * from CustomerProduct on every single call.
 *
 * On failure it distinguishes the cases the UI needs to tell apart:
 *   404  no such product
 *   403  revoked  — you owned this and no longer do
 *   403  locked   — you have never owned this
 * A product whose dashboardVisibility is `everyone` is allowed through in
 * "discovery" mode: the customer sees the marketing sections but `req.entitlement`
 * is null, so `Open App` and owner-only sections stay closed.
 */
const requireCustomerProductAccess = ({ allowDiscovery = false } = {}) =>
  asyncHandler(async (req, _res, next) => {
    if (!req.customer) throw ApiError.unauthorized();

    const { productSlug, productId } = req.params;
    const query = productSlug
      ? { slug: String(productSlug).toLowerCase() }
      : { _id: productId };

    const product = await Product.findOne(query);
    if (!product) throw ApiError.notFound('Product not found');

    const entitlement = await CustomerProduct.findOne({
      customerId: req.customer._id,
      productId: product._id,
    });

    const hasAccess = Boolean(entitlement && entitlement.verified && entitlement.purchaseStatus === PURCHASE_STATUS.ACTIVE);

    if (hasAccess) {
      req.product = product;
      req.entitlement = entitlement;
      req.accessMode = 'owner';
      return next();
    }

    // An inactive product is invisible to non-owners, whatever its visibility.
    const discoverable =
      allowDiscovery && product.active && product.dashboardVisibility === DASHBOARD_VISIBILITY.EVERYONE;

    if (discoverable) {
      req.product = product;
      req.entitlement = null;
      req.accessMode = 'discovery';
      return next();
    }

    if (entitlement) {
      throw new ApiError(403, 'Your access to this product is no longer active', {
        reason: 'revoked',
        purchaseStatus: entitlement.purchaseStatus,
      });
    }
    throw new ApiError(403, 'You do not have access to this product', { reason: 'not_owned' });
  });

module.exports = {
  authenticateCustomer,
  attachCustomerIfPresent,
  requireCustomerProductAccess,
  extractCustomerToken,
  setCustomerCookie,
  clearCustomerCookie,
};
