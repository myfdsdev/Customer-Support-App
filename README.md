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

## Deploying

Two layouts work. The difference is only whether the browser talks to one host
or two.

### One service (API serves the built frontend)

`npm run build` then `npm start`. Express serves `client/dist` and mounts the
API under `/api` on the same origin. Leave `VITE_API_URL` empty.

### Two services (static frontend + separate API)

Set **one** variable on the frontend build and one on the API:

| Service | Variable | Value |
|---|---|---|
| Frontend (static) | `VITE_API_URL` | `https://your-api.onrender.com` |
| API (web service) | `CLIENT_URL` | `https://your-frontend.onrender.com` |

`VITE_API_URL` may be given with or without the trailing `/api` — both resolve
to the same place. The websocket origin is derived from it, so `VITE_SOCKET_URL`
only matters if Socket.io lives on a third host.

`CLIENT_URL` accepts a comma-separated list, and it drives both CORS and the
Socket.io origin check. If it does not include your frontend origin, requests
are rejected before they reach a route.

> **Vite inlines `VITE_*` at build time.** Changing them requires a rebuild and
> redeploy — restarting the service will not pick them up.

### Troubleshooting a deployment

**Which frontend build is live?** Open the browser console. Every build logs
one line on startup:

```
[support] API base: https://your-api.onrender.com/api
```

If that line is missing, the browser is running a bundle from before this was
added — the deploy did not rebuild the frontend.

**`Route not found: POST /auth/login`** — the frontend is calling the API
without the `/api` prefix. The server now redirects these (308) so the app keeps
working, and logs a warning once. It is a safety net, not a fix: rebuild the
frontend to remove the extra round trip. Note the redirect rescues REST only —
if the frontend and API are on **different** hosts, a stale bundle still opens
its websocket against the wrong origin, so realtime needs the rebuild.

**Blank page, assets returning 500** — the server's CORS check was rejecting its
own origin. Vite emits `<script crossorigin>`, so the browser sends an `Origin`
header even same-origin. Same-origin is now always allowed; if you see this on
an older build, add the site's own origin to `CLIENT_URL`.

**Images or API calls blocked by Content-Security-Policy** — product logos and
video thumbnails come from arbitrary admin-entered URLs, so production CSP
allows `img-src https:` and `connect-src https: wss:`. `upgrade-insecure-requests`
is deliberately disabled; it breaks any host that is not already HTTPS.

Also remember to put a database name on the Atlas URI
(`...mongodb.net/support_platform`), or everything is written to a database
called `test`.

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

## Support modes: AI and human

The route decides who the customer is talking to, and the server resolves a
different conversation per mode:

| Route | Mode | Resolves to |
|---|---|---|
| `/support/:slug/chat` | `ai` | the open AI conversation, or a new one |
| `/support/:slug/live-support` | `human` | the open human conversation, else the AI one (which the handoff then carries over) |

A past handoff never locks the customer out of the assistant. If they open
"Ask AI Assistant" while an agent is working their support chat, the AI answers
in a separate conversation and the agent's thread is left completely untouched —
the AI question does not appear in it. Each surface labels itself ("AI
Assistant" vs "Support team"), and whichever one you're on tells you if the
other has an open chat.

Escalating from the AI page moves the customer to `/live-support`, so the URL
always matches who is answering.

## When the AI hands off

Only three things move a conversation to a human:

1. The customer says so ("talk to a human", "connect me to an agent", "live support"…)
2. The customer clicks **Talk to Support**
3. An agent picks it up from the inbox

Low confidence, thin retrieval and refusals do **not**. When the AI cannot
answer it says so and shows a *Talk to Support* button — and the conversation
stays in AI mode until the customer chooses otherwise.

## Informational vs account-specific questions

Whether a question needs verified data is decided by the shape of the question,
not its topic — `services/gemini/questionScope.js`.

| Question | Scope | Behaviour |
|---|---|---|
| "How do credits work?" | informational | answered from knowledge |
| "What happens when my credits finish?" | informational | answered from knowledge |
| "What is the refund policy?" | informational | answered from knowledge |
| "How can I upgrade my plan?" | informational | answered from knowledge |
| "How many credits do I have?" | account_value | refuses, offers support |
| "Did my payment go through?" | account_value | refuses, offers support |
| "Is my subscription active?" | account_value | refuses, offers support |
| "My credits were deducted but I got no video" | account_incident | approved troubleshooting, no account claims, offers support |

`account_value` questions never reach the model without verified data. Incident
reports do reach it, under an explicit ban on asserting what happened on the
account.

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
| `npm run verify:portal --prefix server` | Entitlement + auth lifecycle tests (in-memory DB) |
| `npm run smoke:portal --prefix server` | HTTP smoke test of the portal + webhook (in-memory DB) |
| `npm run build` | Production client build |
| `npm start` | Production server (serves the built client) |

---

## Customer membership portal

The portal turns the platform into a members' area: a customer logs in, sees the
products their **verified** JVZoo purchases entitle them to, opens an internal
product page, launches the app, and gets support — all under a top-nav layout at
`/portal/*`. It is layered **on top of** the existing systems, not a rewrite:
the same `Conversation`/`Message` models, Socket.IO, Gemini + RAG, and Admin
Inbox power portal support unchanged.

### Auth model

Three token audiences, one secret, never interchangeable:

| Audience | Who | Transport | Middleware |
|---|---|---|---|
| `staff` | admins/agents (`User`) | `Authorization` header (localStorage) | `authenticateUser` |
| `support` | anonymous support-widget visitor | support token (sessionStorage) | `authenticateSupportSession` |
| `customer` | portal member (`Customer`) | HTTP-only cookie + bearer fallback | `authenticateCustomer` |

A staff token is rejected on a portal route and vice-versa (audience check).
Portal passwords are bcrypt-hashed on `Customer`; a password change bumps
`sessionVersion`, invalidating tokens already issued.

### Portal routes (client)

`/login` · `/register` · `/forgot-password` · `/reset-password/:token` ·
`/portal/dashboard` · `/portal/products` · `/portal/products/:slug` ·
`/portal/support` · `/portal/support/:slug/ai` · `/portal/support/:slug/team` ·
`/portal/conversations` · `/portal/profile`. Root `/` routes intelligently
(customer → portal, staff → admin, else → login).

### Portal API

`/api/portal/auth/{register,login,logout,me,forgot-password,reset-password}`,
`/api/portal/{dashboard,products,products/:slug,products/:id/launch,
support/products,support/:slug/start,conversations,notifications,profile}`.
Ownership is re-verified from `CustomerProduct` on **every** product-scoped call
(`requireCustomerProductAccess`) — URL tampering cannot open an unpurchased
product, and a refunded entitlement returns 403.

### JVZoo integration

- **Webhook**: `POST /api/integrations/jvzoo/ipn` (public, verified by the
  `cverify` signature — see `services/integrations/jvzooService.js`). Processing
  is idempotent (unique `PaymentEvent` index); refunds/chargebacks revoke access
  without deleting history; unmapped product ids are stored as *pending* for an
  admin to map and reprocess. Always acknowledges with `1`.
- **Product mapping**: map one or many JVZoo ids (FE/OTO/bundle) to an internal
  product under **Admin → Products → (product) → JVZoo mapping**
  (`manage_integrations` only). Duplicate ids across active products are rejected.
- **CSV import**: **Admin → JVZoo & Imports → CSV import** — pick a product,
  upload the export, map columns, preview, confirm. Upserts into the central
  `CustomerProduct` table (never a per-file collection).

**Verification note:** the `cverify` algorithm implemented is JVZoo's published
IPN scheme. Validate it against a real JVZoo test IPN before relying on it in
production; if your account documents a different current scheme, replace
`computeSignatures` in `jvzooService.js` — nothing downstream changes. With
`JVZOO_WEBHOOK_ENABLED=true` and no `JVZOO_IPN_SECRET`, events are stored for
audit and **rejected as unverified** (no access granted).

### Entitlement lifecycle

Verified sale/bill/upsell → active entitlement (`verified:true`,
`verifiedSource:'jvzoo_ipn'`). Refund/chargeback/cancel → `purchaseStatus`
flips, `accessRevokedAt` stamped, row **kept** for audit, product disappears
from the active dashboard. A customer registering on a purchase email **claims**
the existing record and its imported purchases — no duplicate customer is ever
created (emails normalised lowercase+trim).

### Admin permissions (capabilities)

Roles are unchanged; a capability layer (`utils/constants.js → ROLE_CAPABILITIES`)
gates the new surfaces. `manage_integrations` (super_admin only) → JVZoo settings,
mapping, CSV import, reprocess. `manage_portal_content` (super_admin,
support_manager, marketing_manager) → dashboard cards & portal announcements.
Support agents get neither.

### New environment variables

`CUSTOMER_TOKEN_EXPIRES_IN`, `CUSTOMER_COOKIE_NAME`, `CUSTOMER_COOKIE_CROSS_SITE`,
`CUSTOMER_RESET_TOKEN_MINUTES`, `LAUNCH_TOKEN_MINUTES`,
`CUSTOMER_REQUIRE_EMAIL_VERIFICATION`, `APP_BASE_URL`, `JVZOO_WEBHOOK_ENABLED`,
`JVZOO_IPN_SECRET`. See `server/.env.example`. Secrets stay server-side.

### Migration & rollback

All model changes are **additive** — new optional fields and new collections
(`PaymentEvent`, `Notification`, `AuditLog`); no existing field or index is
removed, and the `CustomerProduct` unique `(customerId, productId)` index is
preserved. New indexes build automatically on boot (`autoIndex`). Rollback:
deploy the previous build; the extra fields/collections are simply ignored (drop
them manually only if you want the space back).

---

## Build status

**Phase 1 is complete and verified end to end.** Phase 2 items also shipped: tickets, CRM, assignment, transfer, tags, internal notes, AI summaries, suggested replies, announcements, analytics. Phase 3 shipped in part: recommendations with contextual triggers and suppression, impression/click tracking.

**Membership portal shipped:** customer auth, JVZoo IPN + CSV import, entitlement
lifecycle, portal dashboard/product pages/support, admin CMS + portal-content +
integrations screens. Verified by `npm run verify:portal` (14 service tests) and
`npm run smoke:portal` (13 HTTP tests), plus a clean production build.

Known limitations / safe next steps: (1) JVZoo `cverify` should be confirmed
against a live test IPN before go-live; (2) no mail transport is wired up, so
password-reset and email-verification links are logged in development rather than
emailed — add a transport and flip `CUSTOMER_REQUIRE_EMAIL_VERIFICATION` on;
(3) app launch returns the configured URL (with an optional signed launch token)
— true destination-app SSO is the seam left for later.
