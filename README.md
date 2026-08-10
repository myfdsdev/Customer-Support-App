# Multi-Product AI Customer Support Platform

One centralised support system for every SaaS product you ship. Each product gets its own support URL, its own knowledge base and its own AI assistant — while your team works out of a single shared inbox.

```
/support/videoclawbot      →  VideoClawBot knowledge only
/support/clipsfield-ai     →  ClipsField AI knowledge only
/support/aio-generation    →  AIO Generation knowledge only
/support/thumb-generator   →  Thumb Generator knowledge only
```

The product is identified from the URL. The customer never picks one.

**Stack:** MongoDB · Express · React (Vite) · Node.js · Socket.io · Google Gemini

---

## Quick start

### 1. Install

```bash
npm run install:all
```

### 2. Configure the server

Edit `server/.env` (already created from `.env.example`):

```
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/support_platform
JWT_SECRET=<a long random string>
GEMINI_API_KEY=<your key from https://aistudio.google.com/apikey>
```

`GEMINI_API_KEY` is optional — see [Running without Gemini](#running-without-gemini).

### 3. Seed

```bash
npm run seed
```

Creates four demo products with knowledge, training videos and announcements, plus these accounts:

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@support.local` | `Admin@12345` |
| Support Manager | `manager@support.local` | `Manager@12345` |
| Support Agent | `agent@support.local` | `Agent@12345` |
| Marketing Manager | `marketing@support.local` | `Marketing@12345` |

**Change these before deploying anywhere.**

### 4. Run

```bash
npm run dev
```

- Admin console → http://localhost:5173/admin
- Customer support → http://localhost:5173/support/videoclawbot

### No MongoDB installed?

```bash
npm run dev:memory --prefix server
```

Boots an in-process MongoDB, seeds it, and starts the API. Everything is discarded on exit — for trying the platform, not for real data.

---

## Running without Gemini

The platform is designed to degrade rather than break. With no `GEMINI_API_KEY`:

| Capability | With Gemini | Without |
|---|---|---|
| Retrieval | Semantic (embeddings) + keyword | Keyword only |
| Answers | Generated, grounded in retrieved knowledge | Extracted verbatim from the best-matching article |
| Intent detection | Model + rule floor | Rules only |
| Handoff summaries | Written by Gemini | Built from the transcript |
| Suggested agent replies | Available | Unavailable (clearly reported in the UI) |
| Refusing to invent | **Enforced either way** | **Enforced either way** |

Add the key later and run `npm run reindex --prefix server` to backfill embeddings. No content changes needed.

---

## The grounding rules

These are enforced server-side, not by prompt wording alone.

1. **Retrieval is the only source.** Empty retrieval → the model is never called; the customer gets the fixed fallback and an escalation button.
2. **The model's own sources are verified.** Any knowledge id it claims to have used is matched back against what was actually retrieved. If none survive, the answer is treated as ungrounded.
3. **Transactional questions never reach the model without verified data.** Payment, refund, subscription, credits and account-status questions require a `verified` `CustomerProduct` record. Without one, the question routes straight to the Billing Team.
4. **Videos cannot be invented.** Only a video id from the candidate list built for that product can be attached.
5. **Knowledge cannot cross products.** `productId` is a required argument on every retrieval function and a hard filter inside the `$vectorSearch` stage itself — not a post-filter.

The fixed refusal:

> I don't have enough verified information to answer this accurately. I can connect you with our support team.

---

## Retrieval architecture

```
customer question
   ↓  embed (Gemini)                     ← skipped when no API key
   ↓  Atlas $vectorSearch                ← filter: productId + active
   ↓  fallback: in-process cosine        ← exact, product-scoped
   ↓  fallback: Mongo $text / keyword    ← always available
   ↓  relative + absolute score cutoff   ← drops coincidental matches
   ↓  top-K chunks (never the whole KB)
   ↓  Gemini, grounded
```

`KnowledgeItem` holds the article; `KnowledgeChunk` holds retrievable passages. They are separate collections because Atlas `$vectorSearch` requires the vector at a document root path — you cannot index an embedding nested inside an array of sub-documents.

### Enabling Atlas Vector Search

1. In Atlas, create a Search index named `knowledge_vector_index` on the `knowledgechunks` collection:

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "productId" },
    { "type": "filter", "path": "active" }
  ]
}
```

2. Set `ATLAS_VECTOR_SEARCH=true` in `server/.env`.
3. `npm run reindex --prefix server`

If the index is missing the server logs a warning once and uses exact in-process similarity instead. Retrieval keeps working.

---

## Project layout

```
server/
  config/         env + database connection
  models/         17 Mongoose models
  middleware/     auth, roles, validation, rate limits, uploads
  controllers/    request handling only — no AI calls
  routes/         REST surface
  services/
    gemini/       client, prompts, answer, intent, summarize, suggest, embeddings
    rag/          chunker, vectorStore, retriever, indexer
    training/     video matching
    support/      AI turn orchestration, conversations, presence, verified data
    marketing/    recommendation gating
    socket/       emitter used by both REST and sockets
  sockets/        handshake auth + realtime handlers
  seed/           demo content

client/src/
  components/     ui primitives, support widgets, admin panels
  context/        Auth, Support (session/presence/chat), Toast
  layouts/        SupportLayout, AdminLayout
  pages/          customer/*, admin/*
  services/       axios instances + endpoint map
  socket/         socket.io clients
```

---

## Routes

**Customer (public)**

| Route | Purpose |
|---|---|
| `/support/:slug` | Support home: actions, popular help, training, announcements |
| `/support/:slug/chat` | AI assistant |
| `/support/:slug/live-support` | Same thread, escalated to a human on arrival |
| `/support/:slug/training` | Product training videos |
| `/support/:slug/help` · `/help/:articleId` | Help centre |

**Admin**

`/admin/dashboard` · `/admin/inbox/:conversationId?` · `/admin/customers/:customerId?` · `/admin/products/:productId?` · `/admin/knowledge` · `/admin/training` · `/admin/tickets/:ticketId?` · `/admin/marketing` · `/admin/announcements` · `/admin/team` · `/admin/analytics` · `/admin/settings`

---

## Roles

| Role | Access |
|---|---|
| Super Admin | Everything |
| Support Manager | Dashboard, inbox, tickets, customers, products, knowledge, training, announcements, team, analytics |
| Support Agent | Inbox, tickets, customers, knowledge, training |
| Marketing Manager | Recommendations, announcements, analytics |

Agents assigned to specific products (via **Product → Assigned agents**) only see those products' conversations. An agent with no assignments sees everything, so a fresh install is usable immediately.

---

## Realtime

Two token audiences, both verified in the Socket.io handshake. **Every id used for authorization is read from the verified token or re-read from the database — never from a client payload.**

| Room | Members |
|---|---|
| `product:{id}` | Visitors on that product + watching agents |
| `conversation:{id}` | The parties in one chat |
| `agent:{id}` | Direct notifications |
| `agents:all` | Shared inbox feed |
| `session:{id}` | One browser tab |

Events: `customer:online/offline`, `agent:online/offline`, `conversation:join/leave`, `message:send/new`, `typing:start/stop`, `message:read`, `conversation:assigned/resolved/handoff`, `presence:update`.

### Message delivery

Live chat is socket-first. REST is the fallback, not the primary path.

```
click Send
  → optimistic bubble renders immediately (no network yet)
  → socket message:send { conversationId, content, clientMessageId }
  → server saves, acknowledges with the stored document
  → optimistic bubble is replaced in place
  → server broadcasts message:new to the conversation room
  → the other side appends it to local state
```

**Nothing refetches the conversation or the inbox after a message.** Incoming
messages are appended to local state; the inbox row is repainted in place from
the `conversation:activity` payload (preview, timestamp, unread, ordering).

Full list/count refreshes are reserved for changes that can move a conversation
between filters: created, assigned, resolved, reopened, status changed, and one
resync per reconnect.

**Idempotency.** Every outgoing message carries a `clientMessageId`. It is a
unique partial index on `(conversationId, clientMessageId)`, so a socket retry,
a reconnect replay, a double-click, or a REST fallback after a half-delivered
socket send all collapse onto one document — the server returns the stored
message instead of creating a second one. The client dedupes on the same key,
so the optimistic copy, the acknowledgement and the broadcast render as one
bubble.

**Delivery states.** `Sending` → `Sent` → `Read`, or `Failed` with a Retry that
re-sends under the original id.

**AI chat** uses the same path. The acknowledgement fires as soon as the
customer's own message is durable, so their bubble confirms in milliseconds
while Gemini keeps generating; the answer arrives afterwards via `ai:thinking`
→ `message:new` → `ai:done`.

Measured on a local stack: **10–16 ms** from click to on-screen, and **zero**
API requests on the receiving client while messages arrive.

### Presence

A 25-second heartbeat updates `lastSeenAt`. Presence is **derived from recency**, not from socket state, because sockets die without disconnecting: fresh → `● Online`, >1 min → `◐ Away`, >5 min → `○ Offline`. A backgrounded tab keeps beating but reports `away`. A sweeper closes sessions that go quiet. Presence is informational and intentionally approximate.

---

## Security

- JWT auth with separate staff and customer-session audiences
- bcrypt password hashing (cost 12)
- Role middleware + per-product access checks on every scoped route
- Rate limiting: global, auth (brute force), AI, uploads, heartbeats
- `express-validator` + Mongo operator stripping on all input
- Helmet, configured CORS, `nosniff` on uploads, random on-disk filenames, MIME allow-list
- Uniform "Invalid email or password" so account existence cannot be probed
- Secrets live only in `server/.env` and are never sent to the browser

---

## Marketing suppression

Recommendations are blocked server-side during refunds, payment failures, subscription problems, account lockouts, serious bugs, complaints, any conversation where the customer reads as frustrated or angry, and any turn the AI could not answer. This is in `services/marketing`, not the UI, so it cannot be bypassed by a front-end change.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + client together |
| `npm run seed` | Seed demo content (idempotent) |
| `npm run seed:fresh --prefix server` | Wipe seeded content and reseed |
| `npm run reindex --prefix server` | Rebuild chunks + embeddings |
| `npm run dev:memory --prefix server` | Run against a throwaway in-memory MongoDB |
| `npm run build` | Production client build |
| `npm start` | Production server (serves the built client) |

---

## Build status

**Phase 1 is complete and verified end to end.** Phase 2 items also shipped: tickets, CRM, assignment, transfer, tags, internal notes, AI summaries, suggested replies, announcements, analytics. Phase 3 shipped in part: recommendations with contextual triggers and suppression, impression/click tracking.

Not built: payment-provider integrations (the `verifiedData` service is the seam for these), audiences/campaign segmentation, support automation rules.
