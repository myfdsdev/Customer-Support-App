'use strict';

/* eslint-disable no-console */
/**
 * End-to-end check of the JVZoo path: a signed IPN must grant portal access
 * AND be relayed to the vendor app, while a forged one must do neither.
 *
 * Boots the REAL app against in-memory Mongo and stands up a throwaway HTTP
 * server to stand in for the downstream, so the relay is observed rather than
 * assumed.
 *
 *   node scripts/smokeJvzooRelay.js
 */
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}`); }
}

function post(server, path, formBody) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request(
      {
        host: '127.0.0.1', port, method: 'POST', path,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formBody),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, text: data }));
      }
    );
    req.on('error', reject);
    req.write(formBody);
    req.end();
  });
}

const encode = (fields) =>
  Object.entries(fields).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

/** Waits for the fire-and-forget relay to land, without a blind sleep. */
async function waitForRelay(received, count, ms = 4000) {
  const started = Date.now();
  while (received.length < count && Date.now() - started < ms) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return received.length >= count;
}

async function main() {
  // The downstream must exist BEFORE config/env is loaded: the forward URL is
  // read once at module load, so its port has to be known by then.
  const received = [];
  const downstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push(Object.fromEntries(new URLSearchParams(body)));
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
  });
  await new Promise((r) => downstream.listen(0, '127.0.0.1', r));

  const SECRET = 'SMOKE_RELAY_SECRET';
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'smoke_jvzoo_relay_secret_0123456789_abc';
  process.env.JVZOO_IPN_SECRET = SECRET;
  process.env.JVZOO_WEBHOOK_ENABLED = 'true';
  process.env.JVZOO_VERIFICATION_CONFIRMED = 'true';
  process.env.JVZOO_FORWARD_URL = `http://127.0.0.1:${downstream.address().port}/ipn`;

  const mongod = await MongoMemoryServer.create({ instance: { dbName: 'smoke_jvzoo_relay' } });
  process.env.MONGODB_URI = mongod.getUri();

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  const models = require('../models');
  await Promise.all(Object.values(models).map((m) => (m.init ? m.init() : null)));

  const app = require('../app');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  const verifier = require('../services/integrations/jvzooVerifier');
  const { Product, Customer, CustomerProduct, PaymentEvent } = models;

  await Product.create({
    name: 'SmokeApp',
    slug: 'smokeapp',
    active: true,
    accessMode: 'external_url',
    launchUrl: 'https://app.example.com',
    jvzooMappings: [{ externalProductId: '450873', offerType: 'fe', accessPlan: 'Commercial', active: true }],
  });

  const signed = (fields) => {
    const [sig] = verifier._computeSignatures(fields, SECRET);
    return encode({ ...fields, cverify: sig });
  };

  const sale = {
    ctransaction: 'SALE',
    ctransreceipt: 'RELAY-1',
    cproditem: '450873',
    ccustemail: 'buyer@example.com',
    ccustname: 'Buyer One',
    ctransamount: '37.00',
    ccurrency: 'USD',
  };

  console.log('\nA signed sale');
  const ok = await post(server, '/api/integrations/jvzoo/ipn', signed(sale));
  check('IPN acknowledged with "1"', ok.status === 200 && ok.text.trim() === '1');

  const event = await PaymentEvent.findOne({ transactionId: 'RELAY-1' }).lean();
  check('event stored as verified', event?.verificationStatus === 'verified');

  const customer = await Customer.findOne({ email: 'buyer@example.com' }).lean();
  check('customer created in the CRM', Boolean(customer));

  const entitlement = customer
    ? await CustomerProduct.findOne({ customerId: customer._id }).lean()
    : null;
  check('entitlement granted', entitlement?.verified === true && entitlement?.purchaseStatus === 'active');
  check('access plan recorded', entitlement?.plan === 'Commercial');
  check('provider recorded as jvzoo', entitlement?.provider === 'jvzoo');

  console.log('\nRelayed to the vendor app');
  check('downstream received it', await waitForRelay(received, 1));
  const relayed = received[0] || {};
  check('receipt survived the relay', relayed.ctransreceipt === 'RELAY-1');
  check('product id survived the relay', relayed.cproditem === '450873');
  check('email survived the relay', relayed.ccustemail === 'buyer@example.com');
  check('signature survived the relay', typeof relayed.cverify === 'string' && relayed.cverify.length === 8);

  console.log('\nA forged sale');
  const forged = encode({ ...sale, ctransreceipt: 'RELAY-FORGED', cverify: 'DEADBEEF' });
  const bad = await post(server, '/api/integrations/jvzoo/ipn', forged);
  check('forgery is still acknowledged (JVZoo must not retry)', bad.status === 200 && bad.text.trim() === '1');

  const forgedEvent = await PaymentEvent.findOne({ transactionId: 'RELAY-FORGED' }).lean();
  check('forgery stored for audit', Boolean(forgedEvent));
  check('forgery marked failed', forgedEvent?.verificationStatus === 'failed');
  check('forgery granted nothing', (await CustomerProduct.countDocuments()) === 1);

  // Give the (skipped) relay the same grace the real one got.
  await new Promise((r) => setTimeout(r, 800));
  check('forgery was NOT relayed downstream', received.length === 1);

  console.log(`\n${passed} passed, ${failed} failed`);
  server.close();
  downstream.close();
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
