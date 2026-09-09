'use strict';

/* eslint-disable no-console */
/**
 * HTTP smoke test for the customer-facing ticket surface. Boots the REAL app
 * against in-memory Mongo and drives /api/portal/tickets over the network,
 * asserting the data shape, the auth boundary and cross-customer isolation.
 *
 *   node scripts/_smokePortalTickets.js
 */
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'smoke_tickets_secret_key_0123456789_abcd';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}`); }
}

function request(server, { method = 'GET', path, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const h = { ...headers };
    if (payload) {
      h['Content-Type'] = 'application/json';
      h['Content-Length'] = Buffer.byteLength(payload);
    }
    const { port } = server.address();
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: h }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* non-JSON */ }
        resolve({ status: res.statusCode, json, text: data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: 'smoke_tickets' } });
  process.env.MONGODB_URI = mongod.getUri();

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  const models = require('../models');
  await Promise.all(Object.values(models).map((m) => (m.init ? m.init() : null)));

  const app = require('../app');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  const tokens = require('../utils/tokens');
  const { Product, Customer, CustomerProduct, ProductAgent, Ticket, User, Notification } = models;

  const product = await Product.create({ name: 'SmokeApp', slug: 'smokeapp', active: true });

  // Two customers, so isolation can actually be tested.
  const mine = await Customer.create({ email: 'mine@example.com', name: 'Mine', status: 'active' });
  await mine.setPassword('Password123');
  await mine.save();

  const other = await Customer.create({ email: 'other@example.com', name: 'Other', status: 'active' });

  const myTicket = await Ticket.create({
    customerId: mine._id,
    productId: product._id,
    title: 'Video export fails',
    description: 'Export button does nothing.',
    category: 'Bug',
    priority: 'high',
    status: 'in_progress',
    notes: [{ agentName: 'Agent A', note: 'INTERNAL: customer is on the old build' }],
  });

  const otherTicket = await Ticket.create({
    customerId: other._id,
    productId: product._id,
    title: 'Someone else problem',
    status: 'open',
  });

  const login = await request(server, {
    method: 'POST',
    path: '/api/portal/auth/login',
    body: { email: 'mine@example.com', password: 'Password123' },
  });
  const authH = { Authorization: `Bearer ${login.json?.data?.token}` };
  check('portal login succeeds', login.status === 200 && Boolean(login.json?.data?.token));

  console.log('\nList');
  const noAuth = await request(server, { path: '/api/portal/tickets' });
  check('tickets without auth is 401', noAuth.status === 401);

  const list = await request(server, { path: '/api/portal/tickets', headers: authH });
  check('list returns 200', list.status === 200);
  check('list contains only my ticket', list.json?.data?.length === 1);
  check('list row carries status', list.json?.data?.[0]?.status === 'in_progress');
  check('list row carries ticket number', /^TKT-\d{5}$/.test(list.json?.data?.[0]?.ticketNumber || ''));
  check('list row carries product name', list.json?.data?.[0]?.product?.name === 'SmokeApp');

  console.log('\nDetail');
  const detail = await request(server, { path: `/api/portal/tickets/${myTicket._id}`, headers: authH });
  check('own ticket returns 200', detail.status === 200);
  check('detail exposes the description', detail.json?.data?.description === 'Export button does nothing.');
  check('detail has no internal notes field', detail.json?.data?.notes === undefined);
  check('internal note text never appears in the body', !detail.text.includes('INTERNAL'));

  console.log('\nIsolation');
  const foreign = await request(server, { path: `/api/portal/tickets/${otherTicket._id}`, headers: authH });
  check("another customer's ticket is 404", foreign.status === 404);

  const garbage = await request(server, { path: '/api/portal/tickets/not-an-object-id', headers: authH });
  check('malformed id is 404, not 500', garbage.status === 404);

  console.log('\nResolution notifies the customer');
  const staff = await User.create({
    name: 'Agent A', email: 'agent@example.com', password: 'Password123', role: 'super_admin',
  });
  const staffH = { Authorization: `Bearer ${tokens.signStaffToken(staff)}` };

  const patched = await request(server, {
    method: 'PATCH',
    path: `/api/tickets/${myTicket._id}`,
    headers: staffH,
    body: { status: 'resolved', resolution: 'Shipped a fix in build 42.' },
  });
  check('agent can resolve the ticket', patched.status === 200 && patched.json?.data?.status === 'resolved');

  const note = await Notification.findOne({ customerId: mine._id, type: 'ticket_update' }).lean();
  check('a ticket_update notification was created', Boolean(note));
  check('notification links to the portal ticket', note?.link === `/portal/tickets/${myTicket._id}`);
  check('notification says it is resolved', note?.title === 'Your issue has been resolved');

  const after = await request(server, { path: `/api/portal/tickets/${myTicket._id}`, headers: authH });
  check('detail now shows resolved', after.json?.data?.status === 'resolved');
  check('detail shows the resolution text', after.json?.data?.resolution === 'Shipped a fix in build 42.');
  check('detail carries resolvedAt', Boolean(after.json?.data?.resolvedAt));

  // A non-status edit must stay silent.
  const before = await Notification.countDocuments({ customerId: mine._id });
  await request(server, {
    method: 'PATCH', path: `/api/tickets/${myTicket._id}`, headers: staffH, body: { priority: 'low' },
  });
  const nowCount = await Notification.countDocuments({ customerId: mine._id });
  check('a priority-only edit creates no notification', nowCount === before);

  console.log('\nCustomer raises a ticket');
  // The guard needs a real entitlement before the customer may file anything.
  await CustomerProduct.create({
    customerId: mine._id, productId: product._id, verified: true, purchaseStatus: 'active',
  });

  // Two agents own this product: A is already buried, B is free. B should win.
  const agentA = await User.create({ name: 'Agent Busy', email: 'busy@example.com', password: 'Password123', role: 'support_agent' });
  const agentB = await User.create({ name: 'Agent Free', email: 'free@example.com', password: 'Password123', role: 'support_agent' });
  await ProductAgent.create({ productId: product._id, agentId: agentA._id });
  await ProductAgent.create({ productId: product._id, agentId: agentB._id });
  await Ticket.create({ customerId: other._id, productId: product._id, title: 'load 1', status: 'open', assignedAgent: agentA._id });
  await Ticket.create({ customerId: other._id, productId: product._id, title: 'load 2', status: 'open', assignedAgent: agentA._id });

  const created = await request(server, {
    method: 'POST',
    path: '/api/portal/products/smokeapp/tickets',
    headers: authH,
    body: {
      title: 'Cannot log in',
      description: 'The reset email never arrives.',
      category: 'Account',
      priority: 'urgent', // must be ignored
    },
  });
  check('customer can open a ticket', created.status === 201);
  check('new ticket starts open', created.json?.data?.status === 'open');
  check('chosen category is kept', created.json?.data?.category === 'Account');
  check('priority from the body is ignored', created.json?.data?.priority === 'normal');
  check('auto-assigned to the least loaded agent', created.json?.data?.agent?.name === 'Agent Free');

  const stored = await Ticket.findById(created.json?.data?._id).lean();
  check('assignment is persisted', String(stored?.assignedAgent) === String(agentB._id));
  check('the raising customer owns it', String(stored?.customerId) === String(mine._id));

  const listAfter = await request(server, { path: '/api/portal/tickets', headers: authH });
  check('the new ticket appears in their list', listAfter.json?.data?.length === 2);

  console.log('\nCreation guards');
  await Product.create({ name: 'Locked', slug: 'locked', active: true });
  const unowned = await request(server, {
    method: 'POST', path: '/api/portal/products/locked/tickets', headers: authH, body: { title: 'nope' },
  });
  check('cannot file against an unowned product', unowned.status === 403);

  const ghost = await request(server, {
    method: 'POST', path: '/api/portal/products/ghost/tickets', headers: authH, body: { title: 'nope' },
  });
  check('unknown product is 404', ghost.status === 404);

  const noTitle = await request(server, {
    method: 'POST', path: '/api/portal/products/smokeapp/tickets', headers: authH, body: { description: 'no title' },
  });
  check('missing title is 400', noTitle.status === 400);

  const anon = await request(server, {
    method: 'POST', path: '/api/portal/products/smokeapp/tickets', body: { title: 'nope' },
  });
  check('creating without auth is 401', anon.status === 401);

  console.log(`\n${passed} passed, ${failed} failed`);

  server.close();
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
