'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { signStaffToken } = require('../utils/tokens');
const { User, ProductAgent } = require('../models');
const { ROLES, ROLE_LIST } = require('../utils/constants');
const presence = require('../services/support/presenceService');

/**
 * POST /api/auth/bootstrap
 * Creates the very first super admin. Refuses once any user exists, so this
 * cannot be used to mint accounts on a live install.
 */
const bootstrap = asyncHandler(async (req, res) => {
  const count = await User.countDocuments();
  if (count > 0) throw ApiError.forbidden('Setup has already been completed');

  const { name, email, password } = req.body;
  const user = await User.create({ name, email, password, role: ROLES.SUPER_ADMIN, status: 'active' });

  res.status(201).json({
    success: true,
    data: { token: signStaffToken(user), user: user.toSafeJSON() },
  });
});

/** GET /api/auth/setup-state — lets the login screen offer first-run setup. */
const setupState = asyncHandler(async (_req, res) => {
  const count = await User.countDocuments();
  res.json({ success: true, data: { needsSetup: count === 0 } });
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
  // Same message either way: do not leak which emails exist.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (user.status !== 'active') throw ApiError.forbidden('Your account is not active');

  user.lastLoginAt = new Date();
  user.isOnline = true;
  user.lastSeenAt = new Date();
  await user.save();

  res.json({ success: true, data: { token: signStaffToken(user), user: user.toSafeJSON() } });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  const products = await ProductAgent.find({ agentId: req.user._id })
    .populate('productId', 'name slug logo brandColor')
    .lean();

  res.json({
    success: true,
    data: {
      user: req.user.toSafeJSON(),
      products: products.map((p) => p.productId).filter(Boolean),
    },
  });
});

/** POST /api/auth/logout */
const logout = asyncHandler(async (req, res) => {
  await presence.setAgentPresence(req.user._id, false);
  res.json({ success: true, message: 'Logged out' });
});

/** PATCH /api/auth/profile */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, avatar, title } = req.body;
  if (name !== undefined) req.user.name = name;
  if (avatar !== undefined) req.user.avatar = avatar;
  if (title !== undefined) req.user.title = title;
  await req.user.save();
  res.json({ success: true, data: req.user.toSafeJSON() });
});

/** PATCH /api/auth/password */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) throw ApiError.badRequest('Current password is incorrect');
  user.password = newPassword;
  await user.save();
  res.json({ success: true, message: 'Password updated' });
});

// --- Team management (super admin / support manager) ------------------------

/** GET /api/auth/users */
const listUsers = asyncHandler(async (req, res) => {
  const { role, status, search } = req.query;
  const filter = {};
  if (role && ROLE_LIST.includes(role)) filter.role = role;
  if (status) filter.status = status;
  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];

  const users = await User.find(filter).sort({ createdAt: -1 }).lean();
  const links = await ProductAgent.find({ agentId: { $in: users.map((u) => u._id) } })
    .populate('productId', 'name slug')
    .lean();

  const byAgent = links.reduce((acc, l) => {
    const key = String(l.agentId);
    (acc[key] = acc[key] || []).push(l.productId);
    return acc;
  }, {});

  res.json({
    success: true,
    data: users.map((u) => {
      const { password, ...rest } = u;
      return { ...rest, products: byAgent[String(u._id)] || [] };
    }),
  });
});

/** POST /api/auth/users */
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, title, productIds = [] } = req.body;

  // Only a super admin may mint another super admin.
  if (role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can create another super admin');
  }

  const user = await User.create({ name, email, password, role, title });

  if (Array.isArray(productIds) && productIds.length) {
    await ProductAgent.insertMany(
      productIds.map((productId) => ({ productId, agentId: user._id })),
      { ordered: false }
    ).catch(() => null);
  }

  res.status(201).json({ success: true, data: user.toSafeJSON() });
});

/** PATCH /api/auth/users/:id */
const updateUser = asyncHandler(async (req, res) => {
  const { name, role, status, title, password, productIds } = req.body;
  const user = await User.findById(req.params.id).select('+password');
  if (!user) throw ApiError.notFound('User not found');

  if (role && role !== user.role && req.user.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can change roles');
  }
  if (String(user._id) === String(req.user._id) && status && status !== 'active') {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  if (name !== undefined) user.name = name;
  if (title !== undefined) user.title = title;
  if (role !== undefined) user.role = role;
  if (status !== undefined) user.status = status;
  if (password) user.password = password;
  await user.save();

  if (Array.isArray(productIds)) {
    await ProductAgent.deleteMany({ agentId: user._id });
    if (productIds.length) {
      await ProductAgent.insertMany(
        productIds.map((productId) => ({ productId, agentId: user._id })),
        { ordered: false }
      ).catch(() => null);
    }
  }

  res.json({ success: true, data: user.toSafeJSON() });
});

/** DELETE /api/auth/users/:id */
const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw ApiError.badRequest('You cannot delete your own account');
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  await ProductAgent.deleteMany({ agentId: user._id });
  res.json({ success: true, message: 'User removed' });
});

/** GET /api/auth/agents — for assignment dropdowns. */
const listAgents = asyncHandler(async (_req, res) => {
  const agents = await User.find({
    role: { $in: [ROLES.SUPER_ADMIN, ROLES.SUPPORT_MANAGER, ROLES.SUPPORT_AGENT] },
    status: 'active',
  })
    .select('name email role avatar isOnline lastSeenAt')
    .sort({ name: 1 })
    .lean();
  res.json({ success: true, data: agents });
});

module.exports = {
  bootstrap,
  setupState,
  login,
  me,
  logout,
  updateProfile,
  changePassword,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  listAgents,
};
