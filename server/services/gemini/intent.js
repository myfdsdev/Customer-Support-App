'use strict';

const client = require('./client');
const { INTENT_SYSTEM } = require('./prompts');
const { INTENTS, INTENT_LIST, PRIORITY, PRIORITY_LIST } = require('../../utils/constants');
const { normalize } = require('../../utils/text');

/**
 * Deterministic classifier used when Gemini is unavailable, and as a safety
 * net over the model output (an LLM must not be able to downgrade a refund
 * request into a generic question).
 */
const RULES = [
  { intent: INTENTS.HUMAN_REQUEST, priority: PRIORITY.HIGH, patterns: ['talk to support', 'talk to a human', 'speak to someone', 'real person', 'human agent', 'live agent', 'customer service rep', 'contact support', 'talk to agent'] },
  { intent: INTENTS.REFUND, priority: PRIORITY.HIGH, patterns: ['refund', 'money back', 'chargeback', 'reimburse'] },
  { intent: INTENTS.PAYMENT_ISSUE, priority: PRIORITY.HIGH, patterns: ['payment failed', 'charged twice', 'double charge', 'duplicate charge', 'paid but', 'payment not', 'card declined', 'transaction failed', 'not upgraded', 'didnt receive credits', 'credits not received'] },
  { intent: INTENTS.SUBSCRIPTION, priority: PRIORITY.HIGH, patterns: ['cancel subscription', 'subscription', 'renew', 'downgrade plan', 'upgrade plan', 'billing cycle'] },
  { intent: INTENTS.CREDITS, priority: PRIORITY.NORMAL, patterns: ['credit balance', 'credits left', 'out of credits', 'how many credits', 'credits'] },
  { intent: INTENTS.LOGIN_ISSUE, priority: PRIORITY.HIGH, patterns: ['cant login', 'cannot login', 'cant log in', 'locked out', 'forgot password', 'reset password', 'two factor', '2fa', 'otp not'] },
  { intent: INTENTS.BILLING, priority: PRIORITY.NORMAL, patterns: ['invoice', 'receipt', 'billing', 'vat', 'tax'] },
  { intent: INTENTS.PRICING, priority: PRIORITY.NORMAL, patterns: ['how much does', 'price', 'pricing', 'cost of', 'plans cost'] },
  { intent: INTENTS.API_HELP, priority: PRIORITY.NORMAL, patterns: ['api key', 'api', 'endpoint', 'webhook', 'rest'] },
  { intent: INTENTS.BUG_REPORT, priority: PRIORITY.HIGH, patterns: ['bug', 'broken', 'crash', 'error 500', 'not working', 'stuck at', 'freezes', 'fails every time', 'wont load', 'doesnt load'] },
  { intent: INTENTS.TROUBLESHOOTING, priority: PRIORITY.NORMAL, patterns: ['not loading', 'slow', 'issue with', 'problem with', 'trouble', 'fix', 'failing', 'stuck'] },
  { intent: INTENTS.TRAINING_REQUEST, priority: PRIORITY.LOW, patterns: ['tutorial', 'training', 'video', 'walkthrough', 'show me how', 'demo'] },
  { intent: INTENTS.ACCOUNT, priority: PRIORITY.NORMAL, patterns: ['delete my account', 'change email', 'account settings', 'my account'] },
  { intent: INTENTS.HOW_TO, priority: PRIORITY.NORMAL, patterns: ['how do i', 'how to', 'how can i', 'where do i', 'steps to', 'guide'] },
  { intent: INTENTS.FEATURE_HELP, priority: PRIORITY.NORMAL, patterns: ['can i', 'does it support', 'is it possible', 'feature', 'what is'] },
  { intent: INTENTS.GREETING, priority: PRIORITY.LOW, patterns: ['hello', 'hi there', 'hey', 'good morning', 'good evening'] },
];

const ANGRY = ['angry', 'furious', 'ridiculous', 'terrible', 'worst', 'scam', 'fraud', 'useless', 'unacceptable', 'lawyer', 'sue you'];
const FRUSTRATED = ['still not', 'again and again', 'third time', 'nobody replied', 'no response', 'waiting for days', 'frustrated', 'annoying'];

/**
 * Only full phrases count as "get me a person".
 *
 * A bare "agent" must never trigger this: in a product whose core feature is
 * called an Agent, "how do I create a custom agent?" is a how-to question, not
 * a request for staff. Same reasoning for "human" and "support".
 */
const HUMAN_PHRASES = [
  'talk to support', 'talk to a support', 'talk to the support', 'talk to your support',
  'talk to a human', 'talk to human', 'talk to someone', 'talk to a person', 'talk to an agent',
  'talk to agent', 'speak to someone', 'speak to a human', 'speak to an agent', 'speak to a person',
  'speak with someone', 'chat with a human', 'chat with an agent', 'chat with someone',
  'real person', 'real human', 'human agent', 'human support', 'live agent', 'live person',
  'customer service rep', 'support representative', 'contact support', 'contact a human',
  'connect me to support', 'connect me with support', 'connect me to an agent', 'get me a human',
  'i want a human', 'i need a human', 'is anyone there', 'can i speak to',
];

function wantsHuman(normalizedQuery, intent) {
  if (intent === INTENTS.HUMAN_REQUEST) return true;
  return HUMAN_PHRASES.some((p) => normalizedQuery.includes(p));
}

function ruleClassify(text) {
  const q = normalize(text);
  let intent = INTENTS.OTHER;
  let priority = PRIORITY.NORMAL;

  for (const rule of RULES) {
    if (rule.patterns.some((p) => q.includes(p))) {
      intent = rule.intent;
      priority = rule.priority;
      break;
    }
  }

  let sentiment = 'neutral';
  if (ANGRY.some((w) => q.includes(w))) {
    sentiment = 'angry';
    priority = PRIORITY.URGENT;
  } else if (FRUSTRATED.some((w) => q.includes(w))) {
    sentiment = 'frustrated';
    if (priority === PRIORITY.NORMAL || priority === PRIORITY.LOW) priority = PRIORITY.HIGH;
  }

  return { intent, priority, sentiment, wantsHuman: wantsHuman(q, intent), topic: '', source: 'rules' };
}

/** Rank used to make sure the model can only raise, never lower, priority. */
const RANK = { low: 0, normal: 1, high: 2, urgent: 3 };

async function classifyIntent(question, { history = [] } = {}) {
  const baseline = ruleClassify(question);
  if (!client.isEnabled()) return baseline;

  const context = history.slice(-4).map((m) => `${m.role}: ${m.content}`).join('\n');
  const raw = await client.generate({
    systemInstruction: INTENT_SYSTEM,
    prompt: `${context ? `Recent conversation:\n${context}\n\n` : ''}Message to classify:\n${question}`,
    json: true,
    temperature: 0,
    maxOutputTokens: 200,
  });

  const parsed = client.parseJson(raw);
  if (!parsed) return baseline;

  const intent = INTENT_LIST.includes(parsed.intent) ? parsed.intent : baseline.intent;
  const modelPriority = PRIORITY_LIST.includes(parsed.priority) ? parsed.priority : baseline.priority;

  return {
    intent,
    // Rules act as a floor: an LLM can escalate but never de-escalate.
    priority: RANK[modelPriority] >= RANK[baseline.priority] ? modelPriority : baseline.priority,
    sentiment: parsed.sentiment || baseline.sentiment,
    // The model may only add a handoff when it also classified the intent as
    // HUMAN_REQUEST — one loose boolean should not bypass the AI answer.
    wantsHuman: baseline.wantsHuman || (Boolean(parsed.wantsHuman) && intent === INTENTS.HUMAN_REQUEST),
    topic: parsed.topic || '',
    source: 'gemini',
  };
}

module.exports = { classifyIntent, ruleClassify };
