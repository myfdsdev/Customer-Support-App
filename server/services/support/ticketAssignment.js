'use strict';

const { ProductAgent, User, Ticket } = require('../../models');
const { AGENT_ROLES, GLOBAL_ROLES, TICKET_OPEN_STATUSES } = require('../../utils/constants');

/**
 * Who should own a new ticket.
 *
 * A ticket that lands in the queue unowned is a ticket nobody is accountable
 * for, so a customer-raised ticket is given a name at creation time rather than
 * waiting for an agent to claim it. The admin surface can still reassign it.
 *
 * The rule, in order:
 *   1. Agents explicitly mapped to the product (ProductAgent) — they know it.
 *   2. Failing that, the global roles, who work every product by definition.
 *   3. Among the pool, whoever currently carries the fewest open tickets, so
 *      one person is not buried while another idles. Leads break ties, then
 *      name, so the choice is stable and not dependent on document order.
 *
 * Returns the chosen user's `_id`, or null when there is nobody to assign to —
 * an unassigned ticket is still created and still visible in the admin queue.
 */
async function pickAgentForProduct(productId) {
  let pool = [];

  if (productId) {
    const mappings = await ProductAgent.find({ productId })
      .populate('agentId', 'name role status')
      .lean();

    pool = mappings
      .filter((m) => m.agentId && m.agentId.status === 'active' && AGENT_ROLES.includes(m.agentId.role))
      .map((m) => ({ _id: m.agentId._id, name: m.agentId.name || '', isLead: Boolean(m.isLead) }));
  }

  if (!pool.length) {
    const globals = await User.find({ role: { $in: GLOBAL_ROLES }, status: 'active' })
      .select('name')
      .lean();
    pool = globals.map((u) => ({ _id: u._id, name: u.name || '', isLead: false }));
  }

  if (!pool.length) return null;
  if (pool.length === 1) return pool[0]._id;

  // Current load, counted once for the whole pool rather than per candidate.
  const ids = pool.map((a) => a._id);
  const rows = await Ticket.aggregate([
    { $match: { assignedAgent: { $in: ids }, status: { $in: TICKET_OPEN_STATUSES } } },
    { $group: { _id: '$assignedAgent', count: { $sum: 1 } } },
  ]);
  const load = new Map(rows.map((r) => [String(r._id), r.count]));

  pool.sort((a, b) => {
    const byLoad = (load.get(String(a._id)) || 0) - (load.get(String(b._id)) || 0);
    if (byLoad !== 0) return byLoad;
    if (a.isLead !== b.isLead) return a.isLead ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return pool[0]._id;
}

module.exports = { pickAgentForProduct };
