'use strict';

const client = require('./client');
const { SUMMARY_SYSTEM } = require('./prompts');
const { PRIORITY_LIST, TEAMS, INTENTS } = require('../../utils/constants');
const { truncate, toPlain } = require('../../utils/text');

/**
 * Builds the brief an agent reads before saying hello, so the customer never
 * has to repeat themselves.
 */

const TEAM_BY_INTENT = {
  [INTENTS.PAYMENT_ISSUE]: 'Billing Team',
  [INTENTS.REFUND]: 'Billing Team',
  [INTENTS.BILLING]: 'Billing Team',
  [INTENTS.SUBSCRIPTION]: 'Billing Team',
  [INTENTS.CREDITS]: 'Billing Team',
  [INTENTS.LOGIN_ISSUE]: 'Account Team',
  [INTENTS.ACCOUNT]: 'Account Team',
  [INTENTS.BUG_REPORT]: 'Engineering',
  [INTENTS.TROUBLESHOOTING]: 'Technical Support',
  [INTENTS.API_HELP]: 'Technical Support',
};

/** Transcript-only summary; used when Gemini is unavailable. */
function heuristicSummary({ messages, intent, customerName, productName }) {
  const customerMsgs = messages.filter((m) => m.senderType === 'customer');
  const aiMsgs = messages.filter((m) => m.senderType === 'ai');
  const issue = customerMsgs.length ? truncate(toPlain(customerMsgs[0].content), 180) : 'Not stated';

  const aiAttempted = aiMsgs
    .filter((m) => m.ai && m.ai.answered)
    .map((m) => truncate(toPlain(m.content), 90))
    .slice(0, 4);

  const unanswered = aiMsgs.filter((m) => m.ai && m.ai.answered === false).length;
  const answered = aiMsgs.filter((m) => m.ai && m.ai.answered === true).length;

  // The distinction matters to the agent picking this up: "the AI had nothing"
  // is a knowledge gap, "the AI answered but they still want a person" is not.
  const result = unanswered
    ? 'AI could not answer from verified knowledge'
    : answered
      ? 'AI answered, but the customer asked for a person'
      : 'Still unresolved';

  const summary = `${customerName || 'Customer'} on ${productName}: ${issue} ${
    unanswered
      ? `The assistant had no verified answer across ${customerMsgs.length} message(s).`
      : answered
        ? `The assistant provided an answer over ${customerMsgs.length} message(s), and the customer then asked for the team.`
        : `The customer sent ${customerMsgs.length} message(s) before asking for the team.`
  }`;

  return {
    issue,
    aiAttempted: aiAttempted.length ? aiAttempted : ['No successful AI answer was produced'],
    result,
    suggestedTeam: TEAM_BY_INTENT[intent] || 'General Support',
    priority: 'normal',
    customerSentiment: 'unknown',
    summary,
    source: 'heuristic',
  };
}

async function summarizeConversation({ messages = [], intent = '', customerName = '', productName = '' }) {
  const base = heuristicSummary({ messages, intent, customerName, productName });
  if (!client.isEnabled() || !messages.length) return base;

  const transcript = messages
    .filter((m) => !m.isInternal)
    .slice(-30)
    .map((m) => `${m.senderType.toUpperCase()}: ${toPlain(m.content)}`)
    .join('\n');

  const raw = await client.generate({
    systemInstruction: SUMMARY_SYSTEM,
    prompt: `PRODUCT: ${productName}\nCUSTOMER: ${customerName || 'Unknown'}\nDETECTED INTENT: ${intent || 'unknown'}\n\nTRANSCRIPT:\n${transcript}`,
    json: true,
    temperature: 0.1,
    maxOutputTokens: 600,
  });

  const parsed = client.parseJson(raw);
  if (!parsed) return base;

  return {
    issue: parsed.issue || base.issue,
    aiAttempted: Array.isArray(parsed.aiAttempted) && parsed.aiAttempted.length ? parsed.aiAttempted.map(String) : base.aiAttempted,
    result: parsed.result || base.result,
    suggestedTeam: TEAMS.includes(parsed.suggestedTeam) ? parsed.suggestedTeam : base.suggestedTeam,
    priority: PRIORITY_LIST.includes(parsed.priority) ? parsed.priority : base.priority,
    customerSentiment: parsed.customerSentiment || base.customerSentiment,
    summary: parsed.summary || base.summary,
    source: 'gemini',
  };
}

/** Renders the structured brief as the block shown in the agent's inbox. */
function formatHandoffBrief(summary, { customerName, productName }) {
  const lines = [
    `Customer: ${customerName || 'Anonymous visitor'}`,
    `Product: ${productName}`,
    `Issue: ${summary.issue}`,
    'AI attempted:',
    ...summary.aiAttempted.map((a) => `  • ${a}`),
    `Result: ${summary.result}`,
    `Suggested department: ${summary.suggestedTeam}`,
  ];
  return lines.join('\n');
}

module.exports = { summarizeConversation, formatHandoffBrief, heuristicSummary, TEAM_BY_INTENT };
