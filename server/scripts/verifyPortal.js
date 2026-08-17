'use strict';

/* eslint-disable no-console */
/**
 * End-to-end verification of the membership-portal + JVZoo entitlement work,
 * against a throwaway in-memory MongoDB. Nothing here touches a real database.
 *
 *   npm run verify:portal
 *
 * Covers: purchase → entitlement, idempotency, unmapped-pending, refund/
 * chargeback revocation, reprocess-after-mapping, email-casing dedupe,
 * customer auth (register/claim/login/reset/token-audience isolation), and
 * product-access gating.
 */

const assert = require('assert');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'verify_portal_secret_key_0123456789_long_enough';
process.env.JVZOO_IPN_SECRET = 'VERIFY_SECRET';
process.env.JVZOO_WEBHOOK_ENABLED = 'true';

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}

async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: 'verify_portal' } });
  process.env.MONGODB_URI = mongod.getUri();

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);

  const models = require('../models');
  const {
    Customer,
    Product,
    CustomerProduct,
    PaymentEvent,
  } = models;

  // Indexes back the idempotency and uniqueness guarantees under test, so they
  // must be fully built before the first write — autoIndex builds them
  // asynchronously otherwise and the first duplicate would slip through.
  await Promise.all(Object.values(models).map((m) => (m.init ? m.init() : null)));
  const jvzoo = require('../services/integrations/jvzooService');
  const entitlements = require('../services/integrations/entitlementService');
  const tokens = require('../utils/tokens');
  const { verifyToken, AUD_CUSTOMER, AUD_STAFF } = tokens;
  const { PURCHASE_STATUS } = require('../utils/constants');

  // Signed IPN body helper.
  const signedBody = (fields) => {
    const [sigA] = jvzoo._computeSignatures(fields, process.env.JVZOO_IPN_SECRET);
    return { ...fields, cverify: sigA };
  };
  const ingest = async (body) => {
    const verification = jvzoo.verify(body);
    const normalized = jvzoo.normalize(body);
    return entitlements.ingestEvent({
      normalized,
      verification,
      redactedPayload: jvzoo.redactPayload(body),
      requestMeta: { ipHash: 'x', userAgent: 'test' },
    });
  };

  // --- Fixtures -------------------------------------------------------------
  const product = await Product.create({ name: 'VideoClawBot', slug: 'videoclawbot', jvzooProductIds: ['1001'] });
  const bundleProduct = await Product.create({ name: 'ThumbForge', slug: 'thumbforge', jvzooProductIds: ['2001'] });

  console.log('\nPurchase integration');

  await test('valid purchase creates an active verified entitlement', async () => {
    await ingest(signedBody({
      ctransaction: 'SALE', ctransreceipt: 'T-100', cproditem: '1001',
      ccustemail: 'buyer@example.com', ccustname: 'Buyer One', ctransamount: '27', ccurrency: 'USD',
    }));
    const cust = await Customer.findOne({ email: 'buyer@example.com' });
    assert(cust, 'customer created');
    const ent = await CustomerProduct.findOne({ customerId: cust._id, productId: product._id });
    assert(ent && ent.verified && ent.purchaseStatus === PURCHASE_STATUS.ACTIVE, 'active verified entitlement');
    assert.strictEqual(ent.verifiedSource, 'jvzoo_ipn');
  });

  await test('duplicate event does not create a second entitlement', async () => {
    const before = await CustomerProduct.countDocuments({ productId: product._id });
    const r = await ingest(signedBody({
      ctransaction: 'SALE', ctransreceipt: 'T-100', cproditem: '1001',
      ccustemail: 'buyer@example.com', ccustname: 'Buyer One', ctransamount: '27', ccurrency: 'USD',
    }));
    assert(r.duplicate === true, 'flagged duplicate');
    const after = await CustomerProduct.countDocuments({ productId: product._id });
    assert.strictEqual(before, after, 'no new entitlement row');
  });

  await test('different email casing does NOT create a duplicate customer', async () => {
    await ingest(signedBody({
      ctransaction: 'UPSELL', ctransreceipt: 'T-101', cupsellreceipt: 'T-100', cproditem: '1001',
      ccustemail: 'BUYER@Example.COM', ccustname: 'Buyer One', ctransamount: '17', ccurrency: 'USD',
    }));
    const count = await Customer.countDocuments({ email: 'buyer@example.com' });
    assert.strictEqual(count, 1, 'still one customer');
  });

  await test('unknown product id is stored as pending mapping, grants nothing', async () => {
    const r = await ingest(signedBody({
      ctransaction: 'SALE', ctransreceipt: 'T-200', cproditem: '9999',
      ccustemail: 'nomap@example.com', ccustname: 'No Map', ctransamount: '27', ccurrency: 'USD',
    }));
    assert.strictEqual(r.result.outcome, 'pending_mapping');
    const cust = await Customer.findOne({ email: 'nomap@example.com' });
    assert(!cust || (await CustomerProduct.countDocuments({ customerId: cust._id })) === 0, 'no entitlement granted');
    const evt = await PaymentEvent.findOne({ transactionId: 'T-200' });
    assert(evt.pendingMapping === true && evt.processed === false, 'event marked pending');
  });

  await test('mapping the product then reprocessing grants access', async () => {
    product.jvzooProductIds.push('9999');
    await product.save();
    const evt = await PaymentEvent.findOne({ transactionId: 'T-200' });
    const result = await entitlements.processPaymentEvent(evt);
    assert.strictEqual(result.outcome, 'granted');
    const cust = await Customer.findOne({ email: 'nomap@example.com' });
    const ent = await CustomerProduct.findOne({ customerId: cust._id, productId: product._id });
    assert(ent && ent.isActive(), 'entitlement now active');
  });

  await test('refund revokes access but preserves the row + verified history', async () => {
    await ingest(signedBody({
      ctransaction: 'REFUND', ctransreceipt: 'T-100', cproditem: '1001',
      ccustemail: 'buyer@example.com', ccustname: 'Buyer One', ctransamount: '27', ccurrency: 'USD',
    }));
    const cust = await Customer.findOne({ email: 'buyer@example.com' });
    const ent = await CustomerProduct.findOne({ customerId: cust._id, productId: product._id });
    assert(ent, 'row still exists');
    assert.strictEqual(ent.purchaseStatus, PURCHASE_STATUS.REFUNDED);
    assert.strictEqual(ent.verified, true, 'purchase history preserved');
    assert(!ent.isActive(), 'no longer grants access');
  });

  await test('chargeback revokes access', async () => {
    await ingest(signedBody({
      ctransaction: 'SALE', ctransreceipt: 'T-300', cproditem: '2001',
      ccustemail: 'cbcust@example.com', ccustname: 'CB Cust', ctransamount: '47', ccurrency: 'USD',
    }));
    await ingest(signedBody({
      ctransaction: 'CGBK', ctransreceipt: 'T-300', cproditem: '2001',
      ccustemail: 'cbcust@example.com', ccustname: 'CB Cust', ctransamount: '47', ccurrency: 'USD',
    }));
    const cust = await Customer.findOne({ email: 'cbcust@example.com' });
    const ent = await CustomerProduct.findOne({ customerId: cust._id, productId: bundleProduct._id });
    assert.strictEqual(ent.purchaseStatus, PURCHASE_STATUS.CHARGEBACK);
    assert(!ent.isActive());
  });

  await test('forged signature is stored for audit but grants nothing', async () => {
    const r = await ingest({
      ctransaction: 'SALE', ctransreceipt: 'T-400', cproditem: '1001',
      ccustemail: 'forged@example.com', ctransamount: '27', cverify: 'DEADBEEF',
    });
    assert(!r.result, 'not processed');
    const evt = await PaymentEvent.findOne({ transactionId: 'T-400' });
    assert(evt && evt.processed === false, 'stored, unprocessed');
    const cust = await Customer.findOne({ email: 'forged@example.com' });
    assert(!cust, 'no customer created from a forged event');
  });

  console.log('\nCustomer authentication');

  await test('registering on an imported-purchase email claims the existing record', async () => {
    // buyer@example.com already exists from the purchase above, with no password.
    const before = await Customer.findOne({ email: 'buyer@example.com' });
    assert(!before.hasPortalAccount, 'starts without a portal account');
    before.name = before.name || 'Buyer One';
    await before.setPassword('Sup3rSecret!');
    await before.save();
    const after = await Customer.findById(before._id);
    assert(after.hasPortalAccount, 'now has portal account');
    const count = await Customer.countDocuments({ email: 'buyer@example.com' });
    assert.strictEqual(count, 1, 'no duplicate customer created');
  });

  await test('correct password verifies, wrong password fails', async () => {
    const cust = await Customer.findOne({ email: 'buyer@example.com' }).select('+passwordHash');
    assert(await cust.verifyPassword('Sup3rSecret!'), 'correct password');
    assert(!(await cust.verifyPassword('wrong')), 'wrong password rejected');
  });

  await test('password reset bumps sessionVersion, invalidating old tokens', async () => {
    const cust = await Customer.findOne({ email: 'buyer@example.com' }).select('+passwordHash');
    const oldToken = tokens.signCustomerToken(cust);
    const oldSv = cust.sessionVersion;
    await cust.setPassword('An0therSecret!');
    await cust.save();
    const decodedOld = verifyToken(oldToken);
    assert.strictEqual(decodedOld.sv, oldSv, 'old token carries old version');
    assert.notStrictEqual(cust.sessionVersion, oldSv, 'version bumped');
  });

  await test('a customer token has audience "customer", never "staff"', async () => {
    const cust = await Customer.findOne({ email: 'buyer@example.com' });
    const decoded = verifyToken(tokens.signCustomerToken(cust));
    assert.strictEqual(decoded.aud, AUD_CUSTOMER);
    assert.notStrictEqual(decoded.aud, AUD_STAFF);
  });

  await test('a launch token is scoped to one product and short-lived', async () => {
    const cust = await Customer.findOne({ email: 'buyer@example.com' });
    const decoded = verifyToken(tokens.signLaunchToken({ customerId: cust._id, productId: product._id, email: cust.email }));
    assert.strictEqual(decoded.aud, 'launch');
    assert.strictEqual(decoded.productId, String(product._id));
    assert(decoded.exp - decoded.iat <= 3600, 'expires within an hour');
  });

  console.log('\nProduct access');

  await test('active entitlement reports access; refunded does not', async () => {
    const cust = await Customer.findOne({ email: 'buyer@example.com' });
    const refunded = await CustomerProduct.findOne({ customerId: cust._id, productId: product._id });
    // T-100 was refunded above; but the T-200 reprocess granted the same
    // customerId? No — nomap@ is a different customer. buyer@ product entitlement
    // was refunded, so it must be inactive.
    assert(!refunded.isActive(), 'refunded entitlement is inactive');

    const nomap = await Customer.findOne({ email: 'nomap@example.com' });
    const active = await CustomerProduct.findOne({ customerId: nomap._id, productId: product._id });
    assert(active.isActive(), 'granted entitlement is active');
  });

  await mongoose.disconnect();
  await mongod.stop();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
