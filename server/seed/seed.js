'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const { connectDB, disconnectDB } = require('../config/db');
const {
  User,
  Product,
  ProductAgent,
  KnowledgeItem,
  KnowledgeChunk,
  TrainingVideo,
  Announcement,
  Recommendation,
} = require('../models');
const rag = require('../services/rag');
const gemini = require('../services/gemini');
const { ROLES } = require('../utils/constants');
const seedData = require('./data');

/**
 * Idempotent seed. Re-running updates existing records rather than duplicating,
 * so it is safe to run after adding new content to data.js.
 *
 * `--fresh` wipes seeded collections first (never touches customers or
 * conversations, so you can reseed content without losing test chats).
 */

const FRESH = process.argv.includes('--fresh');

async function upsertUsers() {
  const specs = [
    {
      name: 'Super Admin',
      email: env.seed.adminEmail,
      password: env.seed.adminPassword,
      role: ROLES.SUPER_ADMIN,
      title: 'Platform owner',
    },
    {
      name: 'Priya Support Manager',
      email: 'manager@support.local',
      password: 'Manager@12345',
      role: ROLES.SUPPORT_MANAGER,
      title: 'Support manager',
    },
    {
      name: 'Alex Agent',
      email: 'agent@support.local',
      password: 'Agent@12345',
      role: ROLES.SUPPORT_AGENT,
      title: 'Support agent',
    },
    {
      name: 'Mia Marketing',
      email: 'marketing@support.local',
      password: 'Marketing@12345',
      role: ROLES.MARKETING_MANAGER,
      title: 'Marketing manager',
    },
  ];

  const users = [];
  for (const spec of specs) {
    // eslint-disable-next-line no-await-in-loop
    let user = await User.findOne({ email: spec.email });
    if (!user) {
      // eslint-disable-next-line no-await-in-loop
      user = await User.create(spec);
      logger.info(`  created user ${spec.email} (password: ${spec.password})`);
    } else {
      logger.info(`  user ${spec.email} already exists — left unchanged`);
    }
    users.push(user);
  }
  return users;
}

async function upsertProducts() {
  const products = {};
  for (const spec of seedData.products) {
    // eslint-disable-next-line no-await-in-loop
    const product = await Product.findOneAndUpdate(
      { slug: spec.slug },
      { $set: spec },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    products[spec.slug] = product;
    logger.info(`  product ${product.name} -> /support/${product.slug}`);
  }
  return products;
}

async function upsertKnowledge(products) {
  let count = 0;
  for (const [slug, items] of Object.entries(seedData.knowledge)) {
    const product = products[slug];
    if (!product) continue;

    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      const doc = await KnowledgeItem.findOneAndUpdate(
        { productId: product._id, title: item.title },
        {
          $set: {
            ...item,
            productId: product._id,
            active: true,
            status: 'published',
            sourceType: 'manual',
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      // eslint-disable-next-line no-await-in-loop
      await rag.indexKnowledgeItem(doc);
      count += 1;
    }
  }
  return count;
}

async function upsertVideos(products) {
  let count = 0;
  for (const [slug, items] of Object.entries(seedData.videos)) {
    const product = products[slug];
    if (!product) continue;

    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      const doc = await TrainingVideo.findOneAndUpdate(
        { productId: product._id, title: item.title },
        { $set: { ...item, productId: product._id, active: true } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      // eslint-disable-next-line no-await-in-loop
      await rag.indexTrainingVideo(doc);
      count += 1;
    }
  }
  return count;
}

async function upsertAnnouncements(products) {
  let count = 0;
  for (const a of seedData.announcements) {
    const product = products[a.slug];
    if (!product) continue;
    // eslint-disable-next-line no-await-in-loop
    await Announcement.findOneAndUpdate(
      { productId: product._id, title: a.title },
      {
        $set: {
          productId: product._id,
          type: a.type,
          title: a.title,
          content: a.content,
          priority: a.priority,
          active: true,
          startAt: new Date(),
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  return count;
}

async function upsertRecommendations(products) {
  let count = 0;
  for (const r of seedData.recommendations) {
    const promoted = products[r.promotedSlug];
    if (!promoted) continue;
    const sources = (r.sourceSlugs || []).map((s) => products[s]?._id).filter(Boolean);

    // eslint-disable-next-line no-await-in-loop
    await Recommendation.findOneAndUpdate(
      { name: r.name },
      {
        $set: {
          name: r.name,
          promotedProductId: promoted._id,
          sourceProducts: sources,
          title: r.title,
          description: r.description,
          ctaText: r.ctaText,
          ctaUrl: `/support/${promoted.slug}`,
          placement: r.placement,
          triggerKeywords: r.triggerKeywords || [],
          active: true,
          startAt: new Date(),
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  return count;
}

async function assignAgents(users, products) {
  const agent = users.find((u) => u.role === ROLES.SUPPORT_AGENT);
  if (!agent) return;
  // Assign the demo agent to every product so the inbox is immediately usable.
  for (const product of Object.values(products)) {
    // eslint-disable-next-line no-await-in-loop
    await ProductAgent.findOneAndUpdate(
      { productId: product._id, agentId: agent._id },
      { $set: { productId: product._id, agentId: agent._id } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
}

async function run({ keepConnection = false, quiet = false } = {}) {
  await connectDB();
  if (!quiet) logger.info(`Seeding ${env.mongoUri}`);
  logger.info(gemini.isEnabled() ? 'Gemini key detected — embeddings will be generated.' : 'No Gemini key — seeding with keyword retrieval only.');

  if (FRESH) {
    logger.warn('--fresh: clearing products, knowledge, videos, announcements and recommendations');
    await Promise.all([
      Product.deleteMany({}),
      KnowledgeItem.deleteMany({}),
      KnowledgeChunk.deleteMany({}),
      TrainingVideo.deleteMany({}),
      Announcement.deleteMany({}),
      Recommendation.deleteMany({}),
      ProductAgent.deleteMany({}),
    ]);
  }

  logger.info('Users:');
  const users = await upsertUsers();

  logger.info('Products:');
  const products = await upsertProducts();

  await assignAgents(users, products);

  const knowledgeCount = await upsertKnowledge(products);
  const videoCount = await upsertVideos(products);
  const announcementCount = await upsertAnnouncements(products);
  const recommendationCount = await upsertRecommendations(products);
  const chunkCount = await KnowledgeChunk.countDocuments();

  logger.info('---');
  logger.info(`Knowledge items: ${knowledgeCount} (${chunkCount} retrievable chunks)`);
  logger.info(`Training videos: ${videoCount}`);
  logger.info(`Announcements:   ${announcementCount}`);
  logger.info(`Recommendations: ${recommendationCount}`);
  logger.info('---');
  logger.info('Sign in at /admin/login');
  logger.info(`  Super admin      ${env.seed.adminEmail} / ${env.seed.adminPassword}`);
  logger.info('  Support manager  manager@support.local / Manager@12345');
  logger.info('  Support agent    agent@support.local / Agent@12345');
  logger.info('  Marketing        marketing@support.local / Marketing@12345');
  logger.info('Customer support pages:');
  Object.values(products).forEach((p) => logger.info(`  /support/${p.slug}`));

  if (!keepConnection) await disconnectDB();
  return { users, products };
}

// Only self-execute when invoked directly (`npm run seed`); the in-memory dev
// runner imports `run` and keeps the connection open.
if (require.main === module) {
  run().catch(async (err) => {
    logger.error('Seed failed:', err);
    await disconnectDB();
    process.exit(1);
  });
}

module.exports = { run };
