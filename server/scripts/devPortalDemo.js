'use strict';

/* eslint-disable no-console, global-require */
/**
 * Dev-only: boots the full app against an in-memory MongoDB, runs the normal
 * seed, then adds a demo PORTAL customer with verified purchases, portal
 * announcements and recommendations — so the customer dashboard can be viewed
 * end to end without a real database or JVZoo.
 *
 *   node scripts/devPortalDemo.js
 *
 * Login:  demo@portal.local  /  Password123
 * Everything is discarded when the process exits.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');

async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: 'support_platform' } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.ATLAS_VECTOR_SEARCH = 'false';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'dev_portal_demo_secret_key_0123456789';

  const logger = require('../utils/logger');
  logger.warn('IN-MEMORY MongoDB — demo data only, discarded on exit.');

  const { run: seed } = require('../seed/seed');
  await seed({ keepConnection: true, quiet: true });

  const { Customer, Product, CustomerProduct, Announcement, Recommendation } = require('../models');

  // Give the products the portal fields the dashboard renders.
  const products = await Product.find({ active: true }).sort({ createdAt: 1 });
  const [p1, p2, p3] = products;
  await Product.updateOne({ _id: p1._id }, {
    $set: {
      launchUrl: 'https://example.com/app', accessMode: 'external_url',
      tagline: 'Your workspace is ready', dashboardVisibility: 'owners', featured: true, sortOrder: 1,
      'portalPage.heroTitle': p1.name, 'portalPage.heroSubtitle': 'Everything you need to create faster.',
      'portalPage.overviewContent': 'Welcome to your product. This page is fully admin-managed.',
    },
  });
  if (p2) await Product.updateOne({ _id: p2._id }, { $set: { launchUrl: 'https://example.com/app2', sortOrder: 2 } });
  if (p3) await Product.updateOne({ _id: p3._id }, { $set: { launchUrl: 'https://example.com/app3', sortOrder: 3 } });

  // Demo portal customer with a password + verified purchases.
  const email = 'demo@portal.local';
  let customer = await Customer.findOne({ email }).select('+passwordHash');
  if (!customer) customer = new Customer({ email, name: 'John Doe', status: 'active' });
  await customer.setPassword('Password123');
  customer.emailVerified = true;
  customer.lastOpenedProductId = p1._id;
  customer.lastOpenedProductAt = new Date();
  await customer.save();

  for (const p of [p1, p2, p3].filter(Boolean)) {
    await CustomerProduct.findOneAndUpdate(
      { customerId: customer._id, productId: p._id },
      {
        $set: {
          provider: 'jvzoo', verified: true, verifiedSource: 'jvzoo_ipn',
          purchaseStatus: 'active', subscriptionStatus: 'active',
          transactionId: `DEMO-${p.slug}`, accessGrantedAt: new Date(), lastVerifiedAt: new Date(),
        },
        $setOnInsert: { purchaseDate: new Date() },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  // What's New (portal announcements).
  await Announcement.deleteMany({ title: /^\[demo\]/ });
  await Announcement.create([
    { title: '[demo] New Update for Design App', content: 'Faster performance, improved tools, and a smoother experience.', type: 'Product Update', showInPortal: true, active: true, productId: p2?._id || null },
    { title: '[demo] Cloud Projects Are Here', content: 'Save, access, and share your projects from anywhere.', type: 'New Feature', showInPortal: true, active: true },
  ]);

  // Recommended for you (portal placement).
  await Recommendation.deleteMany({ name: /^\[demo\]/ });
  await Recommendation.create([
    { name: '[demo] Premium Add-On', promotedProductId: p3?._id || p1._id, title: 'Premium Add-On Pack', description: 'Unlock more tools and advanced features.', badge: 'Add-on', ctaText: 'View Offer', placement: 'customer_dashboard_recommended', excludeExistingOwners: false, active: true },
    { name: '[demo] Priority Support', promotedProductId: p1._id, title: 'Priority Support', description: 'Get faster responses and expert help.', badge: 'Upgrade', ctaText: 'View Offer', placement: 'customer_dashboard_recommended', excludeExistingOwners: false, active: true },
  ]);

  require('../server');
  logger.info('———————————————————————————————————————————');
  logger.info('  PORTAL DEMO ready. Login at /login');
  logger.info('  Email:    demo@portal.local');
  logger.info('  Password: Password123');
  logger.info('———————————————————————————————————————————');

  const stop = async () => { await mongod.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('[portal-demo] failed:', err);
  process.exit(1);
});
