'use strict';

/* eslint-disable no-console */
/**
 * Round-trip check for the product-page editor: what an admin saves must be
 * exactly what a customer's product page renders. Boots the REAL app against
 * in-memory Mongo and drives both surfaces over HTTP.
 *
 *   node scripts/_smokeProductPage.js
 */
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'smoke_product_page_secret_0123456789_abcd';

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
    if (payload) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(payload); }
    const { port } = server.address();
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: h }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: 'smoke_product_page' } });
  process.env.MONGODB_URI = mongod.getUri();

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  const models = require('../models');
  await Promise.all(Object.values(models).map((m) => (m.init ? m.init() : null)));

  const app = require('../app');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  const tokens = require('../utils/tokens');
  const { Product, Customer, CustomerProduct, TrainingVideo, User } = models;

  const product = await Product.create({ name: 'SmokeApp', slug: 'smokeapp', active: true });
  await TrainingVideo.create({
    productId: product._id, title: 'Intro tour', videoUrl: 'https://www.youtube.com/watch?v=AZZFH6IV00g', active: true,
  });

  const customer = await Customer.create({ email: 'owner@example.com', name: 'Owner', status: 'active' });
  await customer.setPassword('Password123');
  await customer.save();
  await CustomerProduct.create({
    customerId: customer._id, productId: product._id, verified: true, purchaseStatus: 'active',
  });

  const admin = await User.create({
    name: 'Admin', email: 'admin@example.com', password: 'Password123', role: 'super_admin',
  });
  const adminH = { Authorization: `Bearer ${tokens.signStaffToken(admin)}` };

  const login = await request(server, {
    method: 'POST', path: '/api/portal/auth/login', body: { email: 'owner@example.com', password: 'Password123' },
  });
  const custH = { Authorization: `Bearer ${login.json?.data?.token}` };

  console.log('\nAdmin saves the page');
  const save = await request(server, {
    method: 'PATCH',
    path: `/api/products/${product._id}`,
    headers: adminH,
    body: {
      category: 'AI Film Making',
      platform: 'Web App',
      portalPage: {
        heroTitle: 'Smoke Studio',
        heroSubtitle: 'One line about it',
        overviewContent: 'The overview text.',
        featureItems: [
          { title: 'Feature One', description: 'Does the first thing.' },
          { title: 'Feature Two', description: 'Does the second thing.' },
        ],
        faqItems: [{ question: 'Is it good?', answer: 'Yes.' }],
        resourceLinks: [{ label: 'Docs', url: 'https://example.com/docs', kind: 'doc', description: 'Read up' }],
        // Deliberately hides getting_started and reorders videos above overview.
        sectionOrder: ['hero', 'tutorials', 'overview', 'features', 'faq', 'support', 'resources', 'related'],
        visibleSections: ['hero', 'tutorials', 'overview', 'features', 'faq', 'support', 'resources', 'related'],
        showTutorials: true,
        pageStatus: 'published',
      },
    },
  });
  check('admin save returns 200', save.status === 200);

  console.log('\nCustomer page reflects it');
  const page = await request(server, { path: '/api/portal/products/smokeapp', headers: custH });
  const p = page.json?.data?.product;
  const pg = p?.page;
  check('page returns 200', page.status === 200);
  check('hero title saved', pg?.heroTitle === 'Smoke Studio');
  check('category reaches the page', p?.category === 'AI Film Making');
  check('platform reaches the page', p?.platform === 'Web App');
  check('status is derived from active', p?.status === 'Operational');
  check('2 feature items round-trip', pg?.featureItems?.length === 2);
  check('feature text survives sanitising', pg?.featureItems?.[0]?.title === 'Feature One');
  check('faq round-trips', pg?.faqItems?.[0]?.question === 'Is it good?');
  check('resource link round-trips', pg?.resourceLinks?.[0]?.url === 'https://example.com/docs');
  check('training video is delivered', page.json?.data?.tutorials?.length === 1);

  console.log('\nSection choices are honoured');
  const sections = p?.sections || [];
  check('hidden section is gone', !sections.includes('getting_started'));
  check('custom order is kept', sections.indexOf('tutorials') < sections.indexOf('overview'));

  console.log('\nA later save does not wipe the lists');
  const second = await request(server, {
    method: 'PATCH', path: `/api/products/${product._id}`, headers: adminH,
    body: { portalPage: { heroTitle: 'Renamed' } },
  });
  const after = await request(server, { path: '/api/portal/products/smokeapp', headers: custH });
  check('second save returns 200', second.status === 200);
  check('hero title changed', after.json?.data?.product?.page?.heroTitle === 'Renamed');
  check('features survived a partial save', after.json?.data?.product?.page?.featureItems?.length === 2);

  console.log('\nDraft is hidden from non-owners');
  await request(server, {
    method: 'PATCH', path: `/api/products/${product._id}`, headers: adminH,
    body: { portalPage: { pageStatus: 'draft' } },
  });
  const asOwner = await request(server, { path: '/api/portal/products/smokeapp', headers: custH });
  check('an owner can still preview a draft', asOwner.status === 200);

  console.log(`\n${passed} passed, ${failed} failed`);
  server.close();
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
