'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const bool = (v, fallback = false) => {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: num(process.env.PORT, 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/support_platform',

  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  supportTokenExpiresIn: process.env.SUPPORT_TOKEN_EXPIRES_IN || '12h',

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    embeddingDim: num(process.env.GEMINI_EMBEDDING_DIM, 768),
    get enabled() {
      return Boolean(process.env.GEMINI_API_KEY);
    },
  },

  rag: {
    atlasVectorSearch: bool(process.env.ATLAS_VECTOR_SEARCH, false),
    vectorIndexName: process.env.VECTOR_INDEX_NAME || 'knowledge_vector_index',
    topK: num(process.env.RAG_TOP_K, 6),
    minScore: num(process.env.RAG_MIN_SCORE, 0.55),
  },

  uploads: {
    maxMb: num(process.env.MAX_UPLOAD_MB, 10),
    dir: path.join(__dirname, '..', 'uploads'),
  },

  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@support.local',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
  },
};

// --- Fail fast on things that would silently break security -----------------
if (!env.jwtSecret || env.jwtSecret.length < 24) {
  if (env.isProd) {
    throw new Error('JWT_SECRET is missing or too short. Set a long random value in server/.env');
  }
  // Dev convenience only: never happens in production because of the throw above.
  env.jwtSecret = env.jwtSecret || 'insecure_dev_secret_do_not_use_in_production_0001';
  // eslint-disable-next-line no-console
  console.warn('[env] WARNING: weak JWT_SECRET in use (development only).');
}

module.exports = env;
