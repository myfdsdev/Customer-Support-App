'use strict';

/* eslint-disable no-console */
/**
 * JVZoo central-IPN integration test, against a throwaway in-memory MongoDB.
 *
 *   npm run verify:jvzoo
 *
 * Covers the 15 cases in the integration spec, plus the verification-blocked
 * posture. Uses a MOCKED, spec-shaped JVZoo payload — this proves the internal
 * mapping/entitlement logic, NOT live JVZoo connectivity (that requires a real
 * test IPN and JVZOO_VERIFICATION_CONFIRMED=true).
 */
const assert = require('assert');
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'verify_jvzoo_secret_key_0123456789_abcdefgh';
process.env.JVZOO_IPN_SECRET = 'JVZOO_TEST_SECRET';
process.env.JVZOO_WEBHOOK_ENABLED = 'true';
process.env.JVZOO_VERIFICATION_CONFIRMED = 'true'; // switch verification ON for these assertions

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}\n      ${err.stack || err.message}`);
  }
}

function httpReq(server, { method = 'GET', path, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const h = { ...headers };
    if (payload && typeof body !== 'string') h['Content-Type'] = 'application/json';
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);
    const { port } = server.address();
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: h }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* webhook returns "1" */ }
        resolve({ status: res.statusCode, json, text: data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: 'verify_jvzoo' } });
  process.env.MONGODB_URI = mongod.getUri();

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  const models = require('../models');
  await Promise.all(Object.values(models).map((m) => (m.init ? m.init() : null)));

  const { Customer, Product, CustomerProduct, PaymentEvent, User } = models;
  const jvzoo = require('../services/integrations/jvzooService');
  const entitlements = require('../services/integrations/entitlementService');
  const { PURCHASE_STATUS } = require('../utils/constants');

  const app = require('../app');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  // Signed, urlencoded IPN body (spec-shaped mock payload).
  const signedForm = (fields) => {
    const [sig] = jvzoo._computeSignatures(fields, process.env.JVZOO_IPN_SECRET);
    const body = { ...fields, cverify: sig };
    return Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  };
  const postIpn = (fields, { sign = true } = {}) =>
    httpReq(server, {
      method: 'POST',
      path: '/api/integrations/jvzoo/ipn',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: sign ? signedForm(fields) : Object.entries(fields).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'),
    });

  // --- Fixtures: one product with an FE + an OTO mapping --------------------
  const appProduct = await Product.create({
    name: 'AppFieldsAI', slug: 'appfieldsai',
    jvzooMappings: [
      { externalProductId: 'FE-100', offerType: 'fe', accessPlan: 'starter', active: true },
      { externalProductId: 'OTO-101', offerType: 'oto', accessPlan: 'pro', active: true },
    ],
  });
  const secondProduct = await Product.create({
    name: 'ClipForge', slug: 'clipforge',
    jvzooMappings: [{ externalProductId: 'FE-200', offerType: 'fe', accessPlan: 'basic', active: true }],
  });

  console.log('\nPurchase integration');

  await test('1. verified purchase creates Customer + active CustomerProduct', async () => {
    const r = await postIpn({ ctransaction: 'SALE', ctransreceipt: 'TX-1', cproditem: 'FE-100', ccustemail: 'alice@example.com', ccustname: 'Alice', ctransamount: '19', ccurrency: 'USD' });
    assert.strictEqual(r.text.trim(), '1', 'acknowledged with "1"');
    const cust = await Customer.findOne({ email: 'alice@example.com' });
    assert(cust, 'customer created');
    const ent = await CustomerProduct.findOne({ customerId: cust._id, productId: appProduct._id });
    assert(ent && ent.isActive() && ent.verifiedSource === 'jvzoo_ipn', 'active verified entitlement');
    assert.strictEqual(ent.plan, 'starter', 'FE access plan applied');
  });

  await test('2. existing customer email is reused (no new customer)', async () => {
    const before = await Customer.countDocuments({ email: 'alice@example.com' });
    await postIpn({ ctransaction: 'SALE', ctransreceipt: 'TX-1b', cproditem: 'FE-200', ccustemail: 'alice@example.com', ccustname: 'Alice', ctransamount: '9', ccurrency: 'USD' });
    const after = await Customer.countDocuments({ email: 'alice@example.com' });
    assert.strictEqual(before, after, 'same customer reused');
  });

  await test('3. email casing does not duplicate the customer', async () => {
    await postIpn({ ctransaction: 'SALE', ctransreceipt: 'TX-1c', cproditem: 'FE-200', ccustemail: 'ALICE@Example.COM', ccustname: 'Alice', ctransamount: '9', ccurrency: 'USD' });
    assert.strictEqual(await Customer.countDocuments({ email: 'alice@example.com' }), 1, 'still one');
  });

  await test('4. duplicate purchase notification is idempotent', async () => {
    const cust = await Customer.findOne({ email: 'alice@example.com' });
    const before = await CustomerProduct.countDocuments({ customerId: cust._id });
    await postIpn({ ctransaction: 'SALE', ctransreceipt: 'TX-1', cproditem: 'FE-100', ccustemail: 'alice@example.com', ccustname: 'Alice', ctransamount: '19', ccurrency: 'USD' });
    const after = await CustomerProduct.countDocuments({ customerId: cust._id });
    assert.strictEqual(before, after, 'no new entitlement from a replay');
    assert.strictEqual(await PaymentEvent.countDocuments({ transactionId: 'TX-1', eventType: 'sale' }), 1, 'one event row');
  });

  await test('5. unknown product id → pending mapping, no access', async () => {
    await postIpn({ ctransaction: 'SALE', ctransreceipt: 'TX-9', cproditem: 'UNMAPPED-999', ccustemail: 'ghost@example.com', ccustname: 'Ghost', ctransamount: '19', ccurrency: 'USD' });
    const evt = await PaymentEvent.findOne({ transactionId: 'TX-9' });
    assert.strictEqual(evt.processingStatus, 'pending_mapping');
    const cust = await Customer.findOne({ email: 'ghost@example.com' });
    assert(!cust || (await CustomerProduct.countDocuments({ customerId: cust._id })) === 0, 'no access granted');
  });

  await test('6. invalid signature grants nothing', async () => {
    await postIpn({ ctransaction: 'SALE', ctransreceipt: 'TX-BAD', cproditem: 'FE-100', ccustemail: 'mallory@example.com', ctransamount: '19', cverify: 'BADSIG00' }, { sign: false });
    const evt = await PaymentEvent.findOne({ transactionId: 'TX-BAD' });
    assert(evt && evt.verificationStatus === 'failed' && !evt.processed, 'stored, unverified, unprocessed');
    assert(!(await Customer.findOne({ email: 'mallory@example.com' })), 'no customer from a forged event');
  });

  await test('7. missing required data grants nothing', async () => {
    // No email → cannot resolve a customer even though mapping exists.
    await postIpn({ ctransaction: 'SALE', ctransreceipt: 'TX-NOEMAIL', cproditem: 'FE-100', ctransamount: '19' });
    const evt = await PaymentEvent.findOne({ transactionId: 'TX-NOEMAIL' });
    assert(evt && ['ignored', 'failed'].includes(evt.processingStatus), 'not granted');
  });

  await test('8. refund revokes only the correct entitlement', async () => {
    // Alice owns AppFieldsAI (TX-1) and ClipForge (TX-1b). Refund TX-1 only.
    await postIpn({ ctransaction: 'REFUND', ctransreceipt: 'TX-1', cproditem: 'FE-100', ccustemail: 'alice@example.com', ctransamount: '19' });
    const cust = await Customer.findOne({ email: 'alice@example.com' });
    const app1 = await CustomerProduct.findOne({ customerId: cust._id, productId: appProduct._id });
    const clip = await CustomerProduct.findOne({ customerId: cust._id, productId: secondProduct._id });
    assert.strictEqual(app1.purchaseStatus, PURCHASE_STATUS.REFUNDED, 'AppFieldsAI refunded');
    assert(!app1.isActive() && app1.verified === true, 'revoked but history kept');
    assert(clip.isActive(), 'ClipForge access untouched');
  });

  await test('9. chargeback revokes the correct entitlement', async () => {
    await postIpn({ ctransaction: 'SALE', ctransreceipt: 'TX-CB', cproditem: 'FE-200', ccustemail: 'bob@example.com', ccustname: 'Bob', ctransamount: '9' });
    await postIpn({ ctransaction: 'CGBK', ctransreceipt: 'TX-CB', cproditem: 'FE-200', ccustemail: 'bob@example.com', ctransamount: '9' });
    const cust = await Customer.findOne({ email: 'bob@example.com' });
    const ent = await CustomerProduct.findOne({ customerId: cust._id, productId: secondProduct._id });
    assert.strictEqual(ent.purchaseStatus, PURCHASE_STATUS.CHARGEBACK);
    assert(!ent.isActive());
  });

  await test('10. one customer can own multiple products', async () => {
    // Carol buys both FE-100 (AppFieldsAI) and FE-200 (ClipForge).
    await postIpn({ ctransaction: 'SALE', ctransreceipt: 'TX-C1', cproditem: 'FE-100', ccustemail: 'carol@example.com', ccustname: 'Carol', ctransamount: '19' });
    await postIpn({ ctransaction: 'SALE', ctransreceipt: 'TX-C2', cproditem: 'FE-200', ccustemail: 'carol@example.com', ccustname: 'Carol', ctransamount: '9' });
    const cust = await Customer.findOne({ email: 'carol@example.com' });
    const active = await CustomerProduct.countDocuments({ customerId: cust._id, verified: true, purchaseStatus: 'active' });
    assert.strictEqual(active, 2, 'owns two active products');
  });

  await test('11. one internal product accepts multiple JVZoo ids', async () => {
    // FE-100 and OTO-101 both map to AppFieldsAI.
    await postIpn({ ctransaction: 'SALE', ctransreceipt: 'TX-D1', cproditem: 'FE-100', ccustemail: 'dave@example.com', ccustname: 'Dave', ctransamount: '19' });
    await postIpn({ ctransaction: 'UPSELL', ctransreceipt: 'TX-D2', cupsellreceipt: 'TX-D1', cproditem: 'OTO-101', ccustemail: 'dave@example.com', ctransamount: '47' });
    const cust = await Customer.findOne({ email: 'dave@example.com' });
    const rows = await CustomerProduct.find({ customerId: cust._id, productId: appProduct._id });
    assert.strictEqual(rows.length, 1, 'collapses onto one entitlement row');
  });

  await test('12. OTO mapping applies its own access plan (not the FE plan)', async () => {
    const cust = await Customer.findOne({ email: 'dave@example.com' });
    const ent = await CustomerProduct.findOne({ customerId: cust._id, productId: appProduct._id });
    assert.strictEqual(ent.plan, 'pro', 'OTO upgraded the plan to pro');
    assert.strictEqual(ent.offerType, 'oto');
  });

  console.log('\nAdmin & security');

  // Seed staff users for permission checks.
  const superAdmin = await User.create({ name: 'Root', email: 'root@x.com', password: 'Password123', role: 'super_admin' });
  const agent = await User.create({ name: 'Aggie', email: 'agent@x.com', password: 'Password123', role: 'support_agent' });
  const tokens = require('../utils/tokens');
  const adminAuth = { Authorization: `Bearer ${tokens.signStaffToken(superAdmin)}` };
  const agentAuth = { Authorization: `Bearer ${tokens.signStaffToken(agent)}` };

  await test('13. admin can reprocess a verified pending event after mapping', async () => {
    // Map UNMAPPED-999 → ClipForge via the admin assign endpoint, then it processes.
    const evt = await PaymentEvent.findOne({ transactionId: 'TX-9' });
    const r = await httpReq(server, {
      method: 'POST', path: `/api/integrations/jvzoo/events/${evt._id}/assign-mapping`,
      headers: adminAuth, body: { productId: String(secondProduct._id), offerType: 'addon', accessPlan: 'addon' },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.data.outcome, 'granted');
    const cust = await Customer.findOne({ email: 'ghost@example.com' });
    const ent = await CustomerProduct.findOne({ customerId: cust._id, productId: secondProduct._id });
    assert(ent && ent.isActive(), 'access granted after mapping');
  });

  await test('14. support agent cannot access integration settings', async () => {
    const events = await httpReq(server, { path: '/api/integrations/jvzoo/events', headers: agentAuth });
    const status = await httpReq(server, { path: '/api/integrations/status', headers: agentAuth });
    assert.strictEqual(events.status, 403, 'events 403 for agent');
    assert.strictEqual(status.status, 403, 'status 403 for agent');
    const adminOk = await httpReq(server, { path: '/api/integrations/jvzoo/events', headers: adminAuth });
    assert.strictEqual(adminOk.status, 200, 'super admin allowed');
  });

  await test('15. admin event list masks the customer email', async () => {
    const r = await httpReq(server, { path: '/api/integrations/jvzoo/events', headers: adminAuth });
    const withEmail = r.json.data.events.find((e) => e.customerEmailMasked && e.customerEmailMasked.includes('@'));
    assert(withEmail, 'has a masked email row');
    assert(withEmail.customerEmailMasked.includes('***'), 'email is masked');
    assert(!JSON.stringify(r.json).includes('alice@example.com'), 'no full email leaks in the list');
  });

  console.log('\nVerification posture');

  await test('BONUS: with verification unconfirmed, nothing is granted', async () => {
    // Re-require the verifier under a flipped flag to prove the production gate.
    process.env.JVZOO_VERIFICATION_CONFIRMED = 'false';
    delete require.cache[require.resolve('../config/env')];
    delete require.cache[require.resolve('../services/integrations/jvzooVerifier')];
    const freshVerifier = require('../services/integrations/jvzooVerifier');
    const res = freshVerifier.verify({ ctransaction: 'SALE', cverify: 'whatever' });
    assert.strictEqual(res.status, 'blocked');
    assert.strictEqual(res.ok, false);
    process.env.JVZOO_VERIFICATION_CONFIRMED = 'true'; // restore for cleanliness
  });

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
