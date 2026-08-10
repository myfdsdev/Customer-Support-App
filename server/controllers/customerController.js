'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const {
  Customer,
  CustomerProduct,
  CustomerNote,
  CustomerSession,
  Conversation,
  Ticket,
  Product,
} = require('../models');
const presence = require('../services/support/presenceService');
const emitter = require('../services/socket/emitter');

/** GET /api/customers */
const listCustomers = asyncHandler(async (req, res) => {
  const { search, status, tag, productId, presence: presenceFilter, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (tag) filter.tags = tag;
  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
    ];
  }
  if (presenceFilter) filter.presenceStatus = presenceFilter;

  if (productId) {
    const links = await CustomerProduct.find({ productId }).select('customerId').lean();
    const convos = await Conversation.find({ productId }).select('customerId').lean();
    const ids = [...new Set([...links, ...convos].map((l) => String(l.customerId)))];
    filter._id = { $in: ids };
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [customers, total] = await Promise.all([
    Customer.find(filter).sort({ lastSeenAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Customer.countDocuments(filter),
  ]);

  const online = await presence.listOnline({ limit: 500 });
  const live = new Map(online.map((s) => [String(s.customerId?._id || s.customerId), s.presenceStatus]));

  res.json({
    success: true,
    data: customers.map((c) => ({ ...c, presenceStatus: live.get(String(c._id)) || 'offline' })),
    meta: { total, page: Number(page), limit: Number(limit) },
  });
});

/** GET /api/customers/:id — the full CRM profile. */
const getCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id).lean();
  if (!customer) throw ApiError.notFound('Customer not found');

  const [conversations, tickets, products, notes, sessions, livePresence] = await Promise.all([
    Conversation.find({ customerId: customer._id })
      .populate('productId', 'name slug logo')
      .populate('assignedAgentId', 'name avatar')
      .select('status priority channel detectedIntent lastMessagePreview lastMessageAt createdAt resolvedAt aiResolved')
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean(),
    Ticket.find({ customerId: customer._id })
      .populate('productId', 'name slug')
      .select('ticketNumber title status priority category createdAt resolvedAt')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    CustomerProduct.find({ customerId: customer._id }).populate('productId', 'name slug logo').lean(),
    CustomerNote.find({ customerId: customer._id }).sort({ pinned: -1, createdAt: -1 }).limit(50).lean(),
    CustomerSession.find({ customerId: customer._id })
      .populate('productId', 'name slug')
      .sort({ lastSeenAt: -1 })
      .limit(10)
      .lean(),
    presence.getCustomerPresence(customer._id),
  ]);

  const issueCategories = [...new Set(conversations.map((c) => c.detectedIntent).filter(Boolean))];

  res.json({
    success: true,
    data: {
      customer: { ...customer, presenceStatus: livePresence.presenceStatus },
      presence: livePresence,
      conversations,
      tickets,
      products,
      notes,
      sessions,
      issueCategories,
      stats: {
        conversations: conversations.length,
        tickets: tickets.length,
        aiResolved: conversations.filter((c) => c.aiResolved).length,
        lastContactAt: customer.lastContactAt,
      },
    },
  });
});

/** PATCH /api/customers/:id */
const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw ApiError.notFound('Customer not found');

  const { name, email, phone, status, tags, country, timezone } = req.body;
  if (name !== undefined) customer.name = name;
  if (phone !== undefined) customer.phone = phone;
  if (status !== undefined) customer.status = status;
  if (country !== undefined) customer.country = country;
  if (timezone !== undefined) customer.timezone = timezone;
  if (Array.isArray(tags)) customer.tags = tags.map(String).slice(0, 30);

  if (email !== undefined && email !== customer.email) {
    const taken = await Customer.findOne({ email: String(email).toLowerCase(), _id: { $ne: customer._id } });
    if (taken) throw ApiError.conflict('Another customer already uses that email');
    customer.email = email ? String(email).toLowerCase() : null;
  }

  await customer.save();
  emitter.toAgents('customer:updated', { customerId: String(customer._id) });
  res.json({ success: true, data: customer });
});

/** POST /api/customers/:id/notes */
const addNote = asyncHandler(async (req, res) => {
  const { note, pinned } = req.body;
  if (!note || !String(note).trim()) throw ApiError.badRequest('Note cannot be empty');

  const customer = await Customer.findById(req.params.id);
  if (!customer) throw ApiError.notFound('Customer not found');

  const created = await CustomerNote.create({
    customerId: customer._id,
    agentId: req.user._id,
    agentName: req.user.name,
    note: String(note).trim(),
    pinned: Boolean(pinned),
  });

  res.status(201).json({ success: true, data: created });
});

/** DELETE /api/customers/:id/notes/:noteId */
const deleteNote = asyncHandler(async (req, res) => {
  const note = await CustomerNote.findOneAndDelete({ _id: req.params.noteId, customerId: req.params.id });
  if (!note) throw ApiError.notFound('Note not found');
  res.json({ success: true, message: 'Note deleted' });
});

/**
 * PUT /api/customers/:id/products/:productId
 * Records verified purchase data. `verified` gates whether the AI may ever
 * quote these values back to the customer.
 */
const upsertCustomerProduct = asyncHandler(async (req, res) => {
  const { id, productId } = req.params;
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');

  const { plan, orderId, purchaseDate, subscriptionStatus, credits, verified } = req.body;

  const link = await CustomerProduct.findOneAndUpdate(
    { customerId: id, productId },
    {
      $set: {
        ...(plan !== undefined ? { plan } : {}),
        ...(orderId !== undefined ? { orderId } : {}),
        ...(purchaseDate !== undefined ? { purchaseDate } : {}),
        ...(subscriptionStatus !== undefined ? { subscriptionStatus } : {}),
        ...(credits !== undefined ? { credits: Number(credits) } : {}),
        verified: verified !== undefined ? Boolean(verified) : true,
        verifiedSource: 'manual',
        lastVerifiedAt: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).populate('productId', 'name slug logo');

  res.json({ success: true, data: link });
});

/** DELETE /api/customers/:id/products/:productId */
const removeCustomerProduct = asyncHandler(async (req, res) => {
  await CustomerProduct.deleteOne({ customerId: req.params.id, productId: req.params.productId });
  res.json({ success: true, message: 'Product link removed' });
});

/** GET /api/customers/online — live visitors for the dashboard. */
const listOnlineCustomers = asyncHandler(async (req, res) => {
  const sessions = await presence.listOnline({ productId: req.query.productId || null, limit: 200 });
  res.json({ success: true, data: sessions });
});

module.exports = {
  listCustomers,
  getCustomer,
  updateCustomer,
  addNote,
  deleteNote,
  upsertCustomerProduct,
  removeCustomerProduct,
  listOnlineCustomers,
};
