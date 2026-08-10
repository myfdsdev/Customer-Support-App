'use strict';

const client = require('./client');
const { supportSystemInstruction, supportUserPrompt } = require('./prompts');
const { FALLBACK_ANSWER } = require('../../utils/constants');
const { truncate } = require('../../utils/text');
const { classifyQuestionScope } = require('./questionScope');

/**
 * Turns retrieved product knowledge into a grounded support answer.
 *
 * The refusal path is the important one: if retrieval came back empty, or the
 * model's own grounding check fails, or the question is transactional and we
 * have no verified data, we return the fixed fallback and escalate. The model
 * is never given the opportunity to fill the gap from memory.
 */

/**
 * Whether this specific question needs verified account data.
 *
 * Driven by the shape of the question, not by its topic. A CREDITS question
 * can be "how do credits work" (answerable from knowledge) or "how many
 * credits do I have" (only answerable from verified data) — gating on the
 * intent alone blocked both, which is what made general billing questions
 * unanswerable.
 */
function needsVerifiedData(intentOrScope, question) {
  // Preferred form: pass the question and let the scope classifier decide.
  if (typeof question === 'string') {
    return classifyQuestionScope(question).needsVerifiedData;
  }
  // Back-compat for callers that still pass a scope string.
  return intentOrScope === 'account_value';
}

function refusal({ reason, intent, answer = FALLBACK_ANSWER }) {
  return {
    answered: false,
    answer,
    steps: [],
    sources: [],
    videoId: null,
    // Offers the customer a human. It does NOT move the conversation to a
    // human — only an explicit request from the customer does that.
    escalate: true,
    confidence: 0,
    reason,
    intent,
    model: '',
  };
}

/** Refusal wording for a question only the support team can actually answer. */
const ACCOUNT_DATA_ANSWER =
  "I can't confirm account-specific details like this from here — that needs to be checked against your account by our support team. I can connect you with them, or help with anything else about the product.";

/**
 * Extractive fallback used when no Gemini key is configured.
 * It quotes retrieved knowledge verbatim rather than paraphrasing, so it can
 * never introduce a claim the knowledge base does not make.
 */
const LIST_LINE = /^(\d+[.)]|[-*•])\s+/;

function extractiveAnswer({ knowledge, videos, intent, scope }) {
  if (!knowledge.length) return refusal({ reason: 'no_knowledge', intent });

  // Retrieval returns chunks, and the steps a customer needs are often in a
  // different chunk than the introduction. Stitch every chunk of the
  // best-matching article back together in document order before extracting.
  const best = knowledge[0];
  const sameArticle = knowledge
    .filter((k) => k.id === best.id)
    .sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));

  const body = sameArticle
    // Each chunk is stored title-prefixed; strip it so it is not repeated.
    .map((k) => k.content.replace(new RegExp(`^${escapeRegExp(k.title)}\\s*\\n+`), '').trim())
    .join('\n\n');

  const lines = body.split('\n').map((l) => l.trim());

  const steps = lines
    .filter((l) => LIST_LINE.test(l))
    .map((l) => l.replace(LIST_LINE, ''))
    .slice(0, 15);

  // Lead with the paragraph before the procedure — that is the explanation.
  const firstListIndex = lines.findIndex((l) => LIST_LINE.test(l));
  const intro = (firstListIndex > 0 ? lines.slice(0, firstListIndex) : lines.filter((l) => !LIST_LINE.test(l)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    answered: true,
    answer: truncate(intro || body, 900),
    steps,
    sources: [best],
    videoId: videos[0]?._id ? String(videos[0]._id) : null,
    escalate: scope === 'account_incident',
    confidence: Math.min(0.7, best.score || 0.5),
    reason: 'extractive_no_llm',
    intent,
    scope,
    model: 'extractive',
  };
}

function escapeRegExp(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {object} args
 * @param {object} args.product        full product doc (name, persona)
 * @param {string} args.question
 * @param {Array}  args.knowledge      output of rag.buildContext()
 * @param {Array}  args.videos         product-scoped candidate videos
 * @param {Array}  args.history        [{role, content}]
 * @param {object} args.verifiedData   only real backend data, never guesses
 * @param {string} args.intent
 */
async function generateSupportAnswer({
  product,
  question,
  knowledge = [],
  videos = [],
  history = [],
  verifiedData = {},
  intent = '',
}) {
  const started = Date.now();
  const hasVerified = Boolean(verifiedData && Object.keys(verifiedData).length);
  const { scope } = classifyQuestionScope(question);

  // 1. A question asking for a value or status of this customer's account,
  //    with nothing verified to read it from. This is the one case the model
  //    must not see — there is no honest answer it could produce.
  if (scope === 'account_value' && !hasVerified) {
    return {
      ...refusal({ reason: 'needs_verified_data', intent, answer: ACCOUNT_DATA_ANSWER }),
      scope,
      latencyMs: Date.now() - started,
    };
  }

  // 2. No retrieved knowledge means there is nothing to be grounded in.
  if (!knowledge.length) {
    return { ...refusal({ reason: 'no_knowledge', intent }), scope, latencyMs: Date.now() - started };
  }

  // 3. No model configured: answer extractively from the same knowledge.
  if (!client.isEnabled()) {
    return { ...extractiveAnswer({ knowledge, videos, intent, scope }), scope, latencyMs: Date.now() - started };
  }

  // An incident report ("I paid but my credits are gone") gets the approved
  // troubleshooting steps, under an explicit ban on asserting anything about
  // the account itself, plus an offer of a human.
  const restrictAccountClaims = scope === 'account_incident' && !hasVerified;

  const raw = await client.generate({
    systemInstruction: supportSystemInstruction(product, { restrictAccountClaims }),
    prompt: supportUserPrompt({
      product,
      question,
      knowledge,
      videos: videos.map((v) => ({
        id: String(v._id),
        title: v.title,
        feature: v.feature,
        description: truncate(v.description, 180),
      })),
      history,
      verifiedData,
      intent,
    }),
    json: true,
    temperature: 0.15,
    maxOutputTokens: 1200,
  });

  const parsed = client.parseJson(raw);

  // 4. Model unreachable or unparseable: degrade to extractive, never invent.
  if (!parsed) {
    return { ...extractiveAnswer({ knowledge, videos, intent, scope }), scope, latencyMs: Date.now() - started };
  }

  if (parsed.answered === false || !String(parsed.answer || '').trim()) {
    return { ...refusal({ reason: 'model_not_grounded', intent }), scope, latencyMs: Date.now() - started };
  }

  // 5. Map claimed sources back to real retrieved chunks. A source the model
  //    made up is dropped; if none survive, the answer was not grounded.
  const byId = new Map(knowledge.map((k) => [k.id, k]));
  const used = (parsed.usedSourceIds || []).map((id) => byId.get(String(id))).filter(Boolean);
  const sources = used.length ? used : knowledge.slice(0, 2);

  // 6. Only a video from this product's candidate list may be attached.
  const allowedVideoIds = new Set(videos.map((v) => String(v._id)));
  const videoId = parsed.videoId && allowedVideoIds.has(String(parsed.videoId)) ? String(parsed.videoId) : null;

  return {
    answered: true,
    answer: String(parsed.answer).trim(),
    steps: Array.isArray(parsed.steps) ? parsed.steps.map(String).filter(Boolean).slice(0, 15) : [],
    sources,
    videoId: videoId || (videos[0] ? String(videos[0]._id) : null),
    // An unresolved incident always offers a human, because the last step is
    // always "someone has to look at your account".
    escalate: Boolean(parsed.escalate) || restrictAccountClaims,
    confidence: Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(1, parsed.confidence)) : 0.6,
    reason: restrictAccountClaims ? 'grounded_incident' : 'grounded',
    intent,
    scope,
    model: client.model(),
    latencyMs: Date.now() - started,
  };
}

module.exports = { generateSupportAnswer, refusal, extractiveAnswer, needsVerifiedData };
