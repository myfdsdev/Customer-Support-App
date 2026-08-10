'use strict';

const client = require('./client');
const { SUGGEST_SYSTEM } = require('./prompts');
const { toPlain, truncate } = require('../../utils/text');

/**
 * Drafts a reply for a human agent. Never sent automatically — the controller
 * returns it and the agent chooses Send / Edit / Regenerate / Ignore.
 */
async function suggestReply({ product, messages = [], knowledge = [], verifiedData = {}, agentName = '' }) {
  if (!client.isEnabled()) {
    return {
      available: false,
      reply: '',
      sources: [],
      confidence: 0,
      reason: 'AI suggestions require a GEMINI_API_KEY on the server.',
    };
  }

  const transcript = messages
    .filter((m) => !m.isInternal)
    .slice(-16)
    .map((m) => `${m.senderType.toUpperCase()}: ${toPlain(m.content)}`)
    .join('\n');

  const knowledgeBlock = knowledge.length
    ? knowledge.map((k) => `id: ${k.id}\ntitle: ${k.title}\ncontent: ${truncate(k.content, 1200)}`).join('\n---\n')
    : '(no knowledge matched — ask a clarifying question instead of guessing)';

  const raw = await client.generate({
    systemInstruction: SUGGEST_SYSTEM,
    prompt: `PRODUCT: ${product.name}
AGENT: ${agentName || 'Support agent'}

CONVERSATION:
${transcript}

KNOWLEDGE:
${knowledgeBlock}

VERIFIED ACCOUNT DATA:
${Object.keys(verifiedData || {}).length ? JSON.stringify(verifiedData, null, 2) : '(none)'}

Draft the agent's next reply as JSON.`,
    json: true,
    temperature: 0.4,
    maxOutputTokens: 500,
  });

  const parsed = client.parseJson(raw);
  if (!parsed || !parsed.reply) {
    return { available: false, reply: '', sources: [], confidence: 0, reason: 'Could not generate a suggestion.' };
  }

  const byId = new Map(knowledge.map((k) => [k.id, k]));
  const sources = (parsed.usedSourceIds || [])
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((k) => ({ knowledgeId: k.id, title: k.title, category: k.category }));

  return {
    available: true,
    reply: String(parsed.reply).trim(),
    sources,
    confidence: Number.isFinite(parsed.confidence) ? parsed.confidence : 0.5,
    model: client.model(),
  };
}

module.exports = { suggestReply };
