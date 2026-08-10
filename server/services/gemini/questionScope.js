'use strict';

const { normalize } = require('../../utils/text');

/**
 * Decides what a question is actually *asking for*, which is a different
 * question from what topic it is about.
 *
 * Intent alone cannot make this call. "How do credits work?" and "How many
 * credits do I have?" share the CREDITS intent, but the first is answerable
 * from the knowledge base and the second is a fact about one account that the
 * AI must never guess. Routing on intent blocks the first question for no
 * reason; routing on question shape does not.
 *
 * Three outcomes:
 *
 *   informational     — about the product in general. Answer from knowledge.
 *   account_value     — asks for a value or status of *this* account
 *                       (balance, payment status, subscription state).
 *                       Requires verified data; never inferred.
 *   account_incident  — reports something that went wrong on this account.
 *                       Answer with approved troubleshooting, state no account
 *                       facts, and offer a human.
 */

/** Asking for a specific value or state of the customer's own account. */
const ACCOUNT_VALUE = [
  // balances and quantities
  /\bhow (many|much)\b[^?]*\b(credit|token|generation|minute|seat|render)s?\b[^?]*\b(do i|i have|are (left|remaining)|left|remaining)\b/,
  /\b(credit|token|minute)s?\s+(left|remaining|balance)\b/,
  /\b(my|our)\s+(credit|token|balance)\b/,
  /\bbalance\b[^?]*\b(is|now|currently)\b/,
  // state of a payment / refund / subscription / plan / account
  /\b(did|has|have|was|were|is|are)\s+(my|our)\s+(payment|refund|charge|money|card|invoice|order|subscription|plan|account|upgrade|credits?)\b/,
  /\b(where'?s|where is)\s+(my|our)\s+(refund|payment|money|order|invoice)\b/,
  /\b(status|state)\s+of\s+(my|our)\b/,
  /\b(my|our)\s+(payment|refund|subscription|plan|account|order|invoice)\s+(status|state)\b/,
  /\bam i\s+(still\s+)?(subscribed|on|charged|billed|upgraded|active)\b/,
  /\bhave i been\s+(charged|billed|refunded|upgraded)\b/,
  /\bwhat (plan|tier|subscription)\s+am i\b/,
  /\bwhen (does|will)\s+(my|our)\s+(plan|subscription|trial|credits?)\b/,
];

/** Something already went wrong on this account and needs investigating. */
const ACCOUNT_INCIDENT = [
  /\bcharged\s+(twice|two times|double|again|twice)\b/,
  /\bdouble\s+(charge|charged|billed)\b/,
  /\bi\s+(was|got|have been)\s+charged\b/,
  /\b(paid|payment|purchased|bought|subscribed)\b[^?]*\b(but|however|and (still|yet))\b/,
  /\b(credit|token)s?\s+(were|was|got|have been)?\s*(deducted|taken|used|charged|lost|gone|disappeared)\b/,
  /\b(didn'?t|did not|never|haven'?t|have not|not)\s+(receive|get|got)\b[^?]*\b(credit|refund|upgrade|access|plan|invoice|receipt|email)/,
  /\bmoney\s+(was )?(taken|deducted|gone)\b/,
  /\brefund\b[^?]*\b(not|hasn'?t|haven'?t|still waiting|taking|delayed)\b/,
  /\b(account|plan)\s+(not|hasn'?t|wasn'?t)\s+(upgraded|activated|updated)\b/,
];

/**
 * Procedural or definitional. These stay informational even when they contain
 * "my" — "how can I upgrade my plan?" is a how-to, not an account lookup.
 */
const INFORMATIONAL = [
  /\bhow (do|does|can|would|should) (i|you|we|it|they)\b/,
  /\bhow to\b/,
  /\bwhat (is|are|does|do|happens|kind|type)\b/,
  /\bwhat'?s the\b/,
  /\bwhere (do|can|should) i\b/,
  /\bwhy (do|does|is|are)\b/,
  /\bcan i\b/,
  /\bis it possible\b/,
  /\bdo you (support|offer|have|accept)\b/,
  /\b(policy|policies|pricing|plans?|features?|documentation|tutorial|guide)\b/,
  /\bexplain\b/,
  /\bdifference between\b/,
];

/** A concrete money amount is a strong signal the question is about one order. */
const MONEY = /(\$|usd|eur|£|€)\s?\d|\d+\s?(usd|dollars|eur|euros)/;
/** Order / transaction / invoice references. */
const REFERENCE = /\b(order|transaction|invoice|receipt|payment)\s*(id|number|#|ref)\b|#\s?\d{4,}|\b[a-z]{2,4}-\d{4,}\b/;

const anyMatch = (patterns, text) => patterns.some((re) => re.test(text));

/**
 * @param {string} question
 * @returns {{scope: 'informational'|'account_value'|'account_incident', needsVerifiedData: boolean, reason: string}}
 */
function classifyQuestionScope(question = '') {
  const q = normalize(question);
  if (!q) return { scope: 'informational', needsVerifiedData: false, reason: 'empty' };

  // Incidents are checked first: "I paid but my credits are gone" is a report
  // to troubleshoot, not a balance lookup, even though it mentions credits.
  if (anyMatch(ACCOUNT_INCIDENT, q)) {
    return { scope: 'account_incident', needsVerifiedData: false, reason: 'incident_pattern' };
  }

  if (anyMatch(ACCOUNT_VALUE, q)) {
    return { scope: 'account_value', needsVerifiedData: true, reason: 'account_value_pattern' };
  }

  // A money amount or an order reference alongside billing language means the
  // customer is asking about one specific transaction of theirs.
  if ((MONEY.test(q) || REFERENCE.test(q)) && /\b(paid|payment|charge|charged|refund|bill|billed|subscription|order|invoice)\b/.test(q)) {
    return { scope: 'account_value', needsVerifiedData: true, reason: 'specific_transaction' };
  }

  if (anyMatch(INFORMATIONAL, q)) {
    return { scope: 'informational', needsVerifiedData: false, reason: 'informational_pattern' };
  }

  // Unmatched questions default to informational. The grounding rules already
  // stop the model inventing anything, so the safe default here is to let the
  // knowledge base try rather than to refuse a legitimate question.
  return { scope: 'informational', needsVerifiedData: false, reason: 'default' };
}

module.exports = { classifyQuestionScope, ACCOUNT_VALUE, ACCOUNT_INCIDENT, INFORMATIONAL };
