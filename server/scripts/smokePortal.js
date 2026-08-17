'use strict';

/* eslint-disable no-console */
/**
 * HTTP smoke test: boots the REAL app against in-memory Mongo and drives the
 * portal + integration endpoints over the network, asserting status codes and
 * auth-boundary behaviour. Complements verifyPortal.js (which tests the
 * services directly).
 */
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'smoke_portal_secret_key_0123456789_abcdefgh';
process.env.JVZOO_IPN_SECRET = 'SMOKE_SECRET';
process.env.JVZOO_WEBHOOK_ENABLED = 'true';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}`); }
}

function request(server, { method = 'GET', path, body, headers = {}, cookie }) {
  return new Promise((resolve, reject) => {
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const isForm = typeof body === 'string';
    const h = { ...headers };
    if (payload && !isForm) h['Content-Type'] = 'application/json';
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);
    if (cookie) h.Cookie = cookie;
    const { port } = server.address();
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: h }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* non-JSON (webhook "1") */ }
        resolve({ status: res.statusCode, json, text: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: 'smoke_portal' } });
  process.env.MONGODB_URI = mongod.getUri();

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  const models = require('../models');
  await Promise.all(Object.values(models).map((m) => (m.init ? m.init() : null)));

  const app = require('../app');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  const jvzoo = require('../services/integrations/jvzooService');
  const signed = (fields) => {
    const [sig] = jvzoo._computeSignatures(fields, process.env.JVZOO_IPN_SECRET);
    const body = { ...fields, cverify: sig };
    return Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  };

  // Fixture product with a JVZoo mapping.
  await models.Product.create({ name: 'SmokeApp', slug: 'smokeapp', jvzooProductIds: ['5001'], launchUrl: 'https://app.example.com', accessMode: 'external_url' });

  console.log('\nWebhook');
  const ipn = await request(server, {
    method: 'POST',
    path: '/api/integrations/jvzoo/ipn',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: signed({ ctransaction: 'SALE', ctransreceipt: 'S-1', cproditem: '5001', ccustemail: 'smoke@example.com', ccustname: 'Smoke Buyer', ctransamount: '19', ccurrency: 'USD' }),
  });
  check('IPN returns 200 and "1"', ipn.status === 200 && ipn.text.trim() === '1');

  console.log('\nPortal auth');
  const reg = await request(server, { method: 'POST', path: '/api/portal/auth/register', body: { email: 'smoke@example.com', password: 'Password123', name: 'Smoke Buyer' } });
  check('register succeeds (claims purchase email)', reg.status === 201 && reg.json?.data?.token);
  const token = reg.json?.data?.token;
  const authH = { Authorization: `Bearer ${token}` };

  const me = await request(server, { path: '/api/portal/auth/me', headers: authH });
  check('me returns the customer with 1 product', me.status === 200 && me.json?.data?.productCount === 1);

  console.log('\nDashboard & products');
  const dash = await request(server, { path: '/api/portal/dashboard', headers: authH });
  check('dashboard lists the purchased product', dash.status === 200 && dash.json?.data?.purchasedProducts?.length === 1);

  const prod = await request(server, { path: '/api/portal/products/smokeapp', headers: authH });
  check('owned product page returns 200', prod.status === 200 && prod.json?.data?.access === 'owner');

  console.log('\nAccess control');
  const noAuth = await request(server, { path: '/api/portal/dashboard' });
  check('dashboard without auth is 401', noAuth.status === 401);

  const otherProduct = await request(server, { path: '/api/portal/products/does-not-exist', headers: authH });
  check('unknown product is 404', otherProduct.status === 404);

  // Product the customer does not own.
  await models.Product.create({ name: 'Locked', slug: 'locked', active: true });
  const locked = await request(server, { path: '/api/portal/products/locked', headers: authH });
  check('unowned product is 403', locked.status === 403);

  // Staff token must not authenticate a portal route.
  const tokens = require('../utils/tokens');
  const staffToken = tokens.signStaffToken({ _id: new mongoose.Types.ObjectId(), role: 'super_admin' });
  const staffOnPortal = await request(server, { path: '/api/portal/dashboard', headers: { Authorization: `Bearer ${staffToken}` } });
  check('staff token rejected on portal route (wrong audience)', staffOnPortal.status === 401);

  // Portal token must not authenticate an admin route.
  const portalOnAdmin = await request(server, { path: '/api/products', headers: authH });
  check('portal token rejected on admin route', portalOnAdmin.status === 401);

  console.log('\nLaunch');
  const launch = await request(server, { method: 'POST', path: `/api/portal/products/${dash.json.data.purchasedProducts[0]._id}/launch`, headers: authH });
  check('launch returns the configured URL', launch.status === 200 && launch.json?.data?.launchUrl === 'https://app.example.com');

  console.log('\nRefund revokes portal access');
  await request(server, {
    method: 'POST',
    path: '/api/integrations/jvzoo/ipn',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: signed({ ctransaction: 'RFND', ctransreceipt: 'S-1', cproditem: '5001', ccustemail: 'smoke@example.com', ctransamount: '19', ccurrency: 'USD' }),
  });
  // Note: 'RFND' isn't a mapped verb; use the documented 'REFUND'.
  await request(server, {
    method: 'POST',
    path: '/api/integrations/jvzoo/ipn',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: signed({ ctransaction: 'REFUND', ctransreceipt: 'S-1', cproditem: '5001', ccustemail: 'smoke@example.com', ctransamount: '19', ccurrency: 'USD' }),
  });
  const afterRefund = await request(server, { path: '/api/portal/products/smokeapp', headers: authH });
  check('refunded product now returns 403 (revoked)', afterRefund.status === 403);
  const dash2 = await request(server, { path: '/api/portal/dashboard', headers: authH });
  check('refunded product disappears from dashboard', dash2.json?.data?.purchasedProducts?.length === 0);

  server.close();
  await mongoose.disconnect();
  await mongod.stop();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
