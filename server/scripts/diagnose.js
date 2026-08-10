'use strict';
/*
 * Support AI diagnostic.
 *
 *   node diagnose.js [apiBaseUrl] [adminEmail] [adminPassword]
 *
 * Reports, per product: knowledge/chunk counts, whether the AI can answer a
 * sample question, and if not, exactly why.
 */

const BASE = (process.argv[2] || 'http://localhost:5000').replace(/\/+$/, '').replace(/\/api$/, '') + '/api';
const EMAIL = process.argv[3] || 'admin@support.local';
const PASSWORD = process.argv[4] || 'Admin@12345';

const say = (...a) => process.stdout.write(a.join(' ') + '\n');

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: null, text: text.slice(0, 200) };
  }
}

(async () => {
  say(`API: ${BASE}\n`);

  // ---- 1. Is Gemini configured on THIS server? --------------------------
  const health = await call('GET', '/health');
  if (!health.json?.success) {
    say(`FAIL  /health returned ${health.status}. ${health.text || ''}`);
    say('      The API base URL is probably wrong.');
    process.exit(1);
  }
  const ai = health.json.data.ai;
  say(`Gemini      : ${ai.enabled ? `enabled (${ai.model})` : 'DISABLED — GEMINI_API_KEY not set on this server'}`);
  say(`Retrieval   : ${health.json.data.retrieval.atlasUsable ? 'Atlas vector search' : 'in-process / keyword'}`);

  // ---- 2. Log in --------------------------------------------------------
  const login = await call('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  if (!login.json?.success) {
    say(`\nFAIL  login: ${login.json?.message || login.status}`);
    process.exit(1);
  }
  const token = login.json.data.token;

  // ---- 3. Knowledge per product ----------------------------------------
  const products = (await call('GET', '/products', { token })).json.data;
  say(`\nProducts    : ${products.length}`);
  if (!products.length) {
    say('\nNo products exist. Create one and add knowledge, or run: npm run seed --prefix server');
    process.exit(1);
  }

  const QUESTIONS = {
    videoclawbot: 'How do I create a custom agent?',
    default: 'How do I get started?',
  };

  let anyBroken = false;

  for (const p of products) {
    say(`\n──────── ${p.name}  (/support/${p.slug})`);
    say(`  knowledge items : ${p.counts.knowledge}`);
    say(`  training videos : ${p.counts.videos}`);

    if (p.counts.knowledge === 0) {
      anyBroken = true;
      say('  DIAGNOSIS       : NO KNOWLEDGE. Every question will be refused with');
      say('                    "I don\'t have enough verified information…" and a');
      say('                    Talk to Support button. This is the usual cause of');
      say('                    "the AI never answers".');
      continue;
    }

    // What does retrieval actually find?
    const q = QUESTIONS[p.slug] || QUESTIONS.default;
    const probe = await call('POST', '/knowledge/test-retrieval', { token, body: { productId: p._id, question: q } });
    const d = probe.json?.data;
    if (!d) {
      say(`  retrieval probe : failed (${probe.json?.message || probe.status})`);
      continue;
    }
    say(`  test question   : "${q}"`);
    say(`  chunks found    : ${d.chunks.length}  (strategy: ${d.strategy}${d.embedded ? ', semantic' : ', keyword'})`);
    if (d.chunks.length) {
      say(`  best match      : ${d.chunks[0].title}  score ${Number(d.chunks[0].score).toFixed(3)}`);
    } else {
      anyBroken = true;
      say('  DIAGNOSIS       : knowledge exists but nothing matched. Check the item is');
      say('                    active/published, and add keywords. Then run reindex.');
    }
  }

  // ---- 4. Live AI turn as a real customer -------------------------------
  const first = products[0];
  say(`\n──────── live AI turn on ${first.name}`);
  const sess = await call('POST', `/support/${first.slug}/session`, { body: {} });
  const st = sess.json?.data?.supportToken;
  if (!st) {
    say(`  FAIL session: ${sess.json?.message || sess.status}`);
    process.exit(1);
  }

  const q = QUESTIONS[first.slug] || QUESTIONS.default;
  const chat = await call('POST', `/support/${first.slug}/chat`, {
    token: st,
    body: { message: q, mode: 'ai' },
  });
  const c = chat.json?.data;
  if (!c) {
    say(`  FAIL chat: ${chat.json?.message || chat.status}`);
    process.exit(1);
  }

  say(`  mode            : ${c.mode}`);
  say(`  answered        : ${c.answered}`);
  say(`  channel         : ${c.channel}   ${c.channel === 'human' ? '<-- switched to a human!' : '(stayed with the AI)'}`);
  if (c.aiMessage) {
    say(`  model           : ${c.aiMessage.ai.model || '(none)'}`);
    say(`  refusal reason  : ${c.answered ? 'n/a' : c.aiMessage.ai.answered === false ? 'not grounded' : '?'}`);
    say(`  reply           : ${String(c.aiMessage.content).replace(/\s+/g, ' ').slice(0, 140)}`);
  }

  say('');
  if (c.mode === 'handoff') {
    say('RESULT: the message was treated as an explicit request for a human.');
    say('        Check the wording — phrases like "talk to support" trigger handoff by design.');
  } else if (!c.answered) {
    anyBroken = true;
    say('RESULT: the AI refused. It stayed in AI mode (correct) but had nothing to answer from.');
    say('        Fix the knowledge base for this product — see the per-product diagnosis above.');
  } else {
    say('RESULT: the AI answered normally. No handoff.');
  }

  process.exit(anyBroken ? 1 : 0);
})().catch((e) => {
  say('CRASHED: ' + (e.stack || e));
  process.exit(1);
});
