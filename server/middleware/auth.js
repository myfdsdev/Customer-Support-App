'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, AUD_STAFF, AUD_SUPPORT } = require('../utils/tokens');
const { GLOBAL_ROLES, AGENT_ROLES, ROLES, roleHasCapability } = require('../utils/constants');
const { User, ProductAgent, Product, CustomerSession } = require('../models');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

/** Requires a valid staff JWT. Loads the live user so revoked/disabled accounts fail. */
const authenticateUser = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication token missing');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid token');
  }

  if (payload.aud !== AUD_STAFF) throw ApiError.unauthorized('Invalid token audience');

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.status !== 'active') throw ApiError.forbidden('Your account is not active');

  req.user = user;
  next();
});

/** Restricts a route to the listed roles. */
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden(`This action requires one of: ${roles.join(', ')}`));
  }
  return next();
};

const requireAdmin = requireRole(ROLES.SUPER_ADMIN);
const requireManager = requireRole(ROLES.SUPER_ADMIN, ROLES.SUPPORT_MANAGER);
const requireAgent = requireRole(...AGENT_ROLES);
const requireMarketing = requireRole(ROLES.SUPER_ADMIN, ROLES.MARKETING_MANAGER);

/**
 * Capability gate. Prefer this over enumerating roles for the new
 * integration/portal-content/product surfaces, so that adding a capability to
 * a role is a one-line change in constants rather than an edit across routes.
 */
const requireCapability = (capability) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roleHasCapability(req.user.role, capability)) {
    return next(ApiError.forbidden(`This action requires the "${capability}" capability`));
  }
  return next();
};

/**
 * Confirms the staff user may act on the product referenced by the request.
 * Super admins and support managers see everything; agents only see products
 * they are assigned to (ProductAgent). An agent with zero assignments is
 * treated as unrestricted so a fresh install is usable before assignments exist.
 */
const validateProductAccess = (source = 'params', key = 'productId') =>
  asyncHandler(async (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();

    const productId = (req[source] || {})[key] || req.body.productId || req.query.productId;
    if (!productId) return next();

    const product = await Product.findById(productId);
    if (!product) throw ApiError.notFound('Product not found');
    req.product = product;

    if (GLOBAL_ROLES.includes(req.user.role)) return next();

    const assignedCount = await ProductAgent.countDocuments({ agentId: req.user._id });
    if (assignedCount === 0) return next();

    const allowed = await ProductAgent.exists({ agentId: req.user._id, productId });
    if (!allowed) throw ApiError.forbidden('You are not assigned to this product');
    return next();
  });

/** Product ids the current staff user may access, or null for "all". */
async function accessibleProductIds(user) {
  if (GLOBAL_ROLES.includes(user.role)) return null;
  const links = await ProductAgent.find({ agentId: user._id }).select('productId').lean();
  if (!links.length) return null;
  return links.map((l) => l.productId);
}

/**
 * Requires a valid customer support token (issued by POST /support/:slug/session).
 * Everything the request is allowed to touch is derived from the token, never
 * from the request body.
 */
const authenticateSupportSession = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Support session token missing');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Support session expired' : 'Invalid support token');
  }
  if (payload.aud !== AUD_SUPPORT) throw ApiError.unauthorized('Invalid token audience');

  const session = await CustomerSession.findById(payload.sub);
  if (!session) throw ApiError.unauthorized('Support session not found');

  req.supportSession = session;
  req.supportProductId = session.productId;
  req.supportCustomerId = session.customerId;
  next();
});

/** Ensures the :productSlug in the URL matches the product baked into the token. */
const matchSessionProduct = asyncHandler(async (req, _res, next) => {
  const product = req.product || (await Product.findOne({ slug: String(req.params.productSlug || '').toLowerCase() }));
  if (!product) throw ApiError.notFound('Product not found');
  if (String(product._id) !== String(req.supportProductId)) {
    throw ApiError.forbidden('Support session does not belong to this product');
  }
  req.product = product;
  next();
});

module.exports = {
  authenticateUser,
  requireRole,
  requireAdmin,
  requireManager,
  requireAgent,
  requireMarketing,
  requireCapability,
  validateProductAccess,
  accessibleProductIds,
  authenticateSupportSession,
  matchSessionProduct,
  extractToken,
};
