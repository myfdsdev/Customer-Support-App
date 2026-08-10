'use strict';

const { TrainingVideo, AnalyticsEvent } = require('../../models');
const embeddings = require('../gemini/embeddings');
const { tokenize, keywordScore, normalize, cosineSimilarity } = require('../../utils/text');

/**
 * Picks training videos that genuinely match a question, for one product only.
 *
 * A weak match is worse than no match — recommending an unrelated tutorial
 * makes support look careless — so candidates below MIN_SCORE are dropped.
 */

const MIN_SCORE = 0.42;

function lexicalScore(video, question) {
  const tokens = tokenize(question);
  const q = normalize(question);
  if (!tokens.length) return 0;

  // A near-verbatim question variation is the strongest possible signal.
  for (const variation of video.questionVariations || []) {
    const v = normalize(variation);
    if (!v) continue;
    if (q === v) return 1;
    if (q.includes(v) || v.includes(q)) return 0.92;
  }

  const feature = normalize(video.feature || '');
  const featureHit = feature && q.includes(feature) ? 0.3 : 0;

  const titleScore = keywordScore(tokens, video.title, video.keywords || []);
  const bodyScore = keywordScore(tokens, `${video.description || ''} ${(video.keywords || []).join(' ')}`, video.keywords || []);
  const variationScore = Math.max(
    0,
    ...(video.questionVariations || []).map((v) => keywordScore(tokens, v, video.keywords || []))
  );

  return Math.min(1, titleScore * 0.45 + variationScore * 0.35 + bodyScore * 0.2 + featureHit);
}

/**
 * @param {object} args
 * @param {string} args.productId REQUIRED
 * @param {string} args.question
 * @param {number} [args.limit]
 */
async function findRelevantVideos({ productId, question, limit = 3 }) {
  if (!productId) throw new Error('findRelevantVideos requires a productId');

  const videos = await TrainingVideo.find({ productId, active: true })
    .select('title description feature category keywords questionVariations videoUrl thumbnailUrl duration embedding sortOrder')
    .lean();

  if (!videos.length) return [];

  let queryVec = [];
  if (embeddings.isEnabled() && videos.some((v) => (v.embedding || []).length)) {
    queryVec = await embeddings.embedQuery(question);
  }

  return videos
    .map((v) => {
      const lex = lexicalScore(v, question);
      const sem = queryVec.length && (v.embedding || []).length ? cosineSimilarity(queryVec, v.embedding) : 0;
      // Lexical wins ties: exact customer phrasings beat fuzzy semantic drift.
      const score = Math.max(lex, sem * 0.9, lex * 0.6 + sem * 0.5);
      const { embedding, ...rest } = v;
      return { ...rest, score };
    })
    .filter((v) => v.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Curated list for the product Training page (no question involved). */
async function listVideos({ productId, category, search, limit = 100 }) {
  const filter = { productId, active: true };
  if (category) filter.category = category;

  const videos = await TrainingVideo.find(filter)
    .select('title description feature category keywords videoUrl thumbnailUrl duration sortOrder')
    .sort({ sortOrder: 1, createdAt: 1 })
    .limit(limit)
    .lean();

  if (!search) return videos;

  const tokens = tokenize(search);
  return videos
    .map((v) => ({ ...v, _score: keywordScore(tokens, `${v.title} ${v.description} ${v.feature}`, v.keywords || []) }))
    .filter((v) => v._score > 0.1)
    .sort((a, b) => b._score - a._score);
}

async function trackRecommendation({ videoId, productId, conversationId, customerId }) {
  await TrainingVideo.updateOne({ _id: videoId }, { $inc: { recommendedCount: 1 } }).catch(() => null);
  AnalyticsEvent.track({
    type: AnalyticsEvent.EVENTS.VIDEO_RECOMMENDED,
    productId,
    conversationId,
    customerId,
    refId: videoId,
  });
}

async function trackClick({ videoId, productId, customerId }) {
  const video = await TrainingVideo.findOneAndUpdate(
    { _id: videoId, productId },
    { $inc: { clickCount: 1 } },
    { new: true }
  );
  if (!video) return null;
  AnalyticsEvent.track({
    type: AnalyticsEvent.EVENTS.VIDEO_CLICKED,
    productId,
    customerId,
    refId: videoId,
    label: video.title,
  });
  return video;
}

module.exports = { findRelevantVideos, listVideos, trackRecommendation, trackClick, MIN_SCORE };
