# Design: the Communication panel — architecture for Channels v2

> **Status:** architecture proposal, no code. The INTERACTION design is already
> decided (the 2026-08-21 five-artboard record + its interactive canvas) and
> this document does not revisit it. What is decided here is *where every piece
> of it lives*, *which existing module it extends rather than forks*, *what it
> is allowed to spend*, and *what proves it works*.
>
> **Owner brief:** "正式实现 communication panel, 初期先接入 lark 和 gmail, 复用
> 之前的 oauth client; 先根据我们之前讨论得到的那个 design 结果做架构设计, 给我
> 完整 review 之后再做."
>
> **r3 (2026-09-10, two owner instructions — both change direction rather than fix a
> slip):**
> **(Q3)** adapters differ on **two axes** and the interface must **model** them rather
> than paper over them — read-only vs send (per conversation, per identity), and
> synchronous vs asynchronous receive (push / poll / scan). Lark can push, so **push is a
> first-class receive mode** with its own liveness and fallback; r2's "poll-only v1, WS as
> a cursor kick" is re-argued against the owner's explicit wish for real-time push, keeping
> what is true and changing what was merely conservative (§6.4).
> **(Q4)** the sending default is **as the user, with no "drafted by \<agent\>" tag**, on
> every channel that allows it. r2's decision 17 ("sender honesty line default ON for
> external") is **REVERSED by the owner**; what replaces it is a **warning at the moment of
> authorization**, driven by the `identityMarking` capability (§9.5).
>
> Read first: the interaction record (five artboards — Main / Adapters /
> AssignFilter / AgentReach / Outbox), CLAUDE.md's three-tier routing table,
> `docs/design-three-tier.md`, `docs/design-background-work.md` §7 (permissions
> & secrets) and §12 (owner auto-notify), `docs/design-account-hardening.md`
> §4.4c (the spend authorizer).

---

## 0. One paragraph

Channels v2 adds **external conversations** (Lark, Gmail, later anything) to a
product that already knows how to deliver a message into an agent conversation,
already has a per-credential money ceiling on every turn nobody typed, and
already has a reachability ACL with a widening-only override. The architecture
is therefore mostly *composition*: a new **conversation store** and a thin
**adapter interface** on the ingest side, a **PURE filter / policy / ACL core**
in the middle, and the **existing delivery ladder + spend authorizer** on the
outgoing-to-agent side. The genuinely new machinery is small and named: the
store, the adapters, the filter estimator, the outbox state machine, and the
panel. Everything else is a call into something that already exists — and every
place where it would have been easier to fork one of those things is called out
below with the incident that says not to.

---

## 1. What is fixed, what this document decides

**Fixed by the interaction record — not reopened here:**

| # | Decided | Consequence for the architecture |
|---|---|---|
| ① | Adapters do **send / receive / list conversations** and nothing else. Visibility, assign, filter and approval policy are modelled **in VibeSpace, per conversation** | The adapter interface is deliberately tiny; policy state never lives in an adapter, so swapping a platform never re-configures a rule |
| ① | Internal agent messaging is a **built-in, non-removable adapter**, the same shape as the external ones | Channels v1 (`msg-acl` + `conversation-deliver`) is not replaced; it becomes one adapter's implementation |
| ① | Connection state is three-valued: Connected / needs re-authorization (with a countdown) / Built-in | The store keeps an honest auth state per adapter, `unknown` included |
| ② | Rail entry with an unread badge; panel grouped by adapter; **assign / filter / review shown as chips on the row**, not hidden in a detail page; a conversation opens as a **window** with a context bar | One new rail item, one new window type, one new panel renderer. No new chrome primitives |
| ③ | Assign target = one conversation or a whole group; recipient = one agent or an agent group (rotating). Mode = all new messages / rule filter. **The rule editor shows a live hit-count estimate** ("~4/day match vs 63/day total"). Notify mode (wake vs digest) and reply authority (draft-only vs may send) are separate, and authority is capped by channel policy | The estimator is a first-class PURE function over stored history, not a UI nicety — every wake is a billed turn |
| ④ | Agent reach is **default-invisible**, three-state visible / requestable / hidden, per agent or agent group, with a request→approval that **widens exactly one entry**. Invisible = does not exist (cannot be listed, searched, or addressed by id) | A second ACL vocabulary beside `msg-acl`'s, sharing its ordering and its widening-only law |
| ⑤ | Agents only **propose**. Policy per channel (external default review, internal default direct). Guardrails stack on top: everything outbound is audited, links/attachments force review, off-hours forces review. Approval cards carry **why**, are editable in place, appear **inline in the timeline** as well as in a central outbox, and produce a **structured receipt** `sent \| rejected \| edited` back to the agent | An outbox store with an explicit state machine, a PURE policy decision, and a receipt lane that must not itself become a billing hazard |

**Decided by this document:** module placement and tier; the store format and
its invariants; **the two axes of the capability record** (read-only vs send;
push / poll / scan) and how it resolves per conversation (§4); the ingest model
(**push is a first-class receive mode and polling is the completeness
mechanism** — §6.4); how a wake is authorized and charged, and **how a push
burst is coalesced before the wake decision**; **sending identity** and where
"who the recipient will see" gets said (§9.5); how the outbox makes
double-sending structurally impossible; the client registrations; the agent CLI
surface; the test gates; the phase plan.

**Deferred, with the seam left open:** plugin-contributed adapters, adapters
running on a paired device, rich HTML mail rendering, attachment auto-fetch,
**local-client adapters (WhatsApp / WeChat) — modelled in the interface from P0,
but the adapters themselves are P6 behind an owner decision**. Each has a named
landing place (§14, §15).

---

## 2. Where every piece goes (the routing-table entry)

CLAUDE.md's routing table is the law for "where does a new change go". This
feature spans four rows, so the mapping is spelled out once:

| Piece | Tier | File | Gated by |
|---|---|---|---|
| Rule matching + hit estimator | **PURE** | `src/channel-filter.js` | `test-channel-filter` (fast) |
| Reach ACL (three-state, requests) | **PURE** | `src/channel-acl.js` (imports `src/msg-acl.js` — PURE may import PURE) | `test-channel-acl` (fast) |
| Outbound policy + guardrails + outbox state machine | **PURE** | `src/channel-policy.js` | `test-channel-outbox` (fast) |
| Normalized message record + its renderers' data | **PURE** | `src/channel-record.js` | `test-channel-record` (fast) |
| Capability decisions (both axes, per-conversation resolution, identity warning) | **PURE** | `src/channel-caps.js` | `test-channel-caps` (fast) |
| Conversation store *primitives* (durable load/append/tail/trim/flush; the **engine** owns the live index, §5.1) | **SHARED** (fs+path only) | `src/channel-store.js` | `test-channel-store` (fast) |
| OAuth loopback consent flow (**dual-mode**, §12.4) | **SHARED** | `src/oauth-loopback.js` | `test-oauth-loopback` (fast) |
| Adapter interface + registry | **ORCH** | `src/channels/index.js` | `test-channel-adapter-contract` (fast, fake adapter) |
| Lark / Gmail / Agents adapters | **ORCH** | `src/channels/lark.js`, `gmail.js`, `agents.js` | contract suite + `test-channels-lark-shape` (fast, recorded fixtures) |
| Ingest engine (poll scheduler, backoff, per-tick budget, failure surfacing) | **ORCH** | `src/server/channels-engine.js` (`create(deps)` factory) | `test-channels-engine` (heavy) |
| Push lanes (one per vendor; liveness, ack, exclusivity measurement) | **ORCH** | `src/channels/live/<kind>.js` | `test-channels-push` (heavy) |
| Routes + broadcasts | **ORCH** | `src/routes/channels.js` | the route battery in `test-restore-smoke`, `test-channels-e2e` |
| Wiring stanza | **ORCH** | `src/server/channels-wiring.js`, one call from `server.js` | `test-architecture` size ratchet (server.js ≤ 2100 lines) |
| Panel, window, filter editor, approval cards | **CLIENT** | `src/lib/channels-panel.js`, `src/lib/channel-window.js`, `src/lib/channel-filter-editor.js` | `test-channels-e2e` (heavy, headless chrome) |
| Agent CLI | tracked static | `data/bin/vibespace-channels` + `docs/agent/channels-manual.md` | `test-channels-agent-cli` (fast) |

Four placements are load-bearing enough to state as rules:

- **An adapter never touches the store, the ACL, the policy or the spend
  guard.** It returns typed records and takes a send request. Everything it can
  do is in the interface in §4, and a capability it does not declare is a
  capability the product will not offer for it. This is the same discipline as
  `src/backend-caps.js`: *gate on the capability row, never on the adapter id* —
  with a grep census asserting no call site branches on a name.
- **The engine is ORCH and lives in exactly one `create(deps)` factory** under
  `src/server/`, like every subsystem since the 2.325 拆分. `server.js` gains a
  wiring stanza and nothing else.
- **The engine is also the single owner of the live index** (§5.1). The store
  module offers durable primitives and deliberately offers nobody a
  "write the whole index" call, because two adapter poll loops overlap by design
  and a read-modify-write around an atomic write is not atomic.
- **Capability has two axes, and it is not one global boolean** (r3/Q3, §4).
  What an adapter *could ever* do (`caps` — static, declared) and what it can do
  *on this conversation right now* (`convCaps(convId)` — resolved, three-valued)
  are different facts: the authorizing user is in the group but the bot is not; a
  read-only shared mailbox; a group that removed you. Each makes an adapter
  declaring `sendAs:['user']` unable to send **here**. The rule is: **a control
  exists only when both agree**, and `unknown` renders as not-offered-with-a-reason,
  never as allowed.

### 2.1 Mechanical registration checklist (each omission costs a round)

Every one of these is enforced by a suite that goes red, so they are cheaper to
do up front than to discover:

- a new top-level `src/*.js` PURE or SHARED module must be added to the
  corresponding tier set in `scripts/test-architecture.mjs` (path-based defaults
  only cover `src/lib/`, `src/routes/`, `src/server/`);
- every new `scripts/test-*.mjs` needs a row in `scripts/ci.mjs` with a tier —
  the census that asserts this runs inside `npm run build`;
- a new settings category needs its entry in `SETTINGS_CATEGORIES` (§10.1);
- a new window kind is a `registerWindowType` call in its owning module —
  `scripts/test-window-types.mjs` pins the exact set;
- any new live-session `_field` is a row in `src/session-schema.js` **first**;
- a new agent CLI goes into `HostManager.AGENT_TOOLS` and `AGENT_DOC_TOPICS`
  with its manual under `docs/agent/`;
- new user-visible chrome strings go through `t()` with zh + ja dictionary
  entries (i18n-check runs in the build).

---

## 3. Hard fences (each one is somebody's incident)

These are not style preferences. Each is a law this repository already enforces,
and each has an obvious way this feature would break it.

1. **§ban-safety is untouched.** Nothing here calls Anthropic.
   `scripts/test-vendor-whitelist.mjs` is Anthropic-scoped, so Lark and Gmail
   HTTP does not trip it — which is exactly why this feature ships **its own
   egress census**, `test-channels-egress`. It is written in that suite's own
   shape — an allowlist with reasons — and *not* as an absolute prohibition:

   > Every outbound request constructed anywhere in the tree targets either a
   > host pattern **declared by the adapter that constructs it** (files under
   > `src/channels/`), or an entry in a `(file, host pattern)` **allowlist with
   > a stated reason**. A dead allowlist entry fails the suite too.

   The absolute form — "and no other file in the tree constructs one" — would be
   **red on its first commit**. `src/gmail-sync.js` already builds
   `oauth2.googleapis.com/token`, the `gmail.readonly` scope URL and
   `gmail.googleapis.com/gmail/v1/users/me`, which is exactly what
   `src/channels/gmail.js` will declare, and `src/mounts.js` holds the Microsoft
   Graph bases for OneDrive. A mandatory gate that fails on a legitimate
   pre-existing surface is a gate the first person to hit it relaxes — and a
   relaxed gate protects nothing. The allowlist is therefore **seeded at birth**
   with those two files and their reasons, exactly as `ALLOW` in
   `test-vendor-whitelist` is seeded with `src/usage-routes.js` and
   `src/server/cli-env.js`, including that suite's dead-entry check ("still
   holds its allowlisted call — moved/renamed ⇒ update the allowlist"). What the
   census still catches is the thing it exists for: a third vendor host arriving
   without a decision.
2. **Every wake is money.** A filter that matches 63 messages/day is 63 billed
   turns/day. The only thing that may open an unattended turn is
   `deliverToConversation`, and it already sits behind
   `src/spend-authorizer.js`. Channels adds one declared `SPEND_REASON` and
   passes it; it does **not** add a second budget, a second ledger, or a second
   identity derivation (§7.4). Its own per-assignment limits are **pacing**; the
   authorizer is the **money bound** — the distinction the seven-producer audit
   exists to preserve.
3. **Never block the event loop — and know what "async" costs.** The written
   law is the one in CLAUDE.md: *no sync fs/exec on a hot path; child processes
   or workers only, with timeouts*. Bounded **async** children are sanctioned
   here and used everywhere — ssh-per-op in `RemoteFs`, the `ps`/`lsof` rungs in
   `src/cli-identity.js`, the discovery sweeps. What this feature may not do is
   spawn one **per item on a polled path**, because `child_process.spawn()`
   blocks the calling thread for `fork()`'s page-table copy in proportion to the
   **parent's RSS**: measured with a small harness that spawns a trivial child at
   controlled parent RSS, 1.8 ms/spawn at 45 MB, 18.8 ms at 543 MB and
   **72.5 ms at 1.5 GB** (incident `inc-mtunmv3d-pmd6`, 2026-09-10; the evidence
   file is instance-local and deliberately not in this public repo). These
   servers sit at 1.5–2 GB, so even an "async" `execFile` costs the loop
   ~70–130 ms and a `Promise.all` over N of them is N forks in one tick. A poll
   loop that shelled out once per chat per tick would therefore stall the loop
   for seconds per minute. Adapters use in-process `fetch()` with timeouts; that
   is not an optimization here, it is the requirement.
4. **Secrets ride env/files, never argv; never logged; encrypted at rest.**
   Adapter tokens live in `data/channels/adapters.json` encrypted under an
   instance-local key, and every route that returns an adapter record goes
   through one `publicView()` — the shape `src/server/opencode-access.js` uses to
   keep a serve URL and its auth out of a browser.
5. **External bodies are hostile input.** A Lark message body and a Gmail HTML
   part are peer-controlled and they sync to every client. v1 renders **plain
   text only** (§10.3): no `innerHTML` of a vendor body on any path — including
   the agent-facing injection, which must not be able to carry a
   `<system-reminder>`-shaped string into a prompt (§7.5).
6. **Atomic persistence + flush on exit.** The index and the outbox go through
   `writeJsonAtomic`; message logs are append-only NDJSON; every store flushes
   on SIGINT/SIGTERM. A bare `writeFileSync` on a hot path is the silent data
   loss this product exists to survive.
7. **Cache invalidation must NOTIFY.** The ingest pipeline has ONE entry point
   and it broadcasts the recomputed result once per pass, never per message
   (§10.4).
8. **No silent failures.** A poll that fails N times in a row reaches the user:
   the adapter row turns amber AND a "For you" item is filed — and **retracted**
   by the same producer when the adapter recovers, because an item already filed
   is an assertion whose author must withdraw it (the login-expiry lesson).
9. **A fixed window is not a cursor.** The ops notes record a real ops group
   producing 300+ messages in one day, and a fixed-size fetch window silently
   dropped messages on exactly that day. Ingest pages until it reaches the stored
   anchor, and the anchor advances **only after a complete pass** (the
   Gmail-sync law: one dead id must not freeze the cursor, and a partial pass
   must not advance it).
10. **Not visible = does not exist.** No existence oracle: an agent asking about
    a conversation it cannot see gets the same answer as for one that does not
    exist. `vibespace-msg`'s uniform-error rule, applied to channels.
11. **An ack is a commitment, so ack after durability — never after processing.**
    (r3/Q3) Lark's event delivery requires the subscriber to answer HTTP 200 within
    **3 seconds**, and it is **at-least-once**: a missed deadline is retried at
    15 s / 5 min / 1 h / 6 h, **at most 4 times**, and duplicates can arrive even
    after a success. Our side of the chain (store append → filter → spend
    authorize → deliver) can easily exceed 3 s. So the push lane's order is fixed:
    the record lands in the durable append-only log (§5 invariant 4's order,
    unchanged), **then** we ack, **then** the filter and the wake run
    asynchronously. Acking *before* durability quietly downgrades the vendor's
    at-least-once into our own at-most-once — an invisible lost message.
    Duplicates are absorbed by §5 invariant 2 keyed on the **message id**, so "the
    same message once by push and once by poll" collapses to one; event-level
    replays dedup on the event's own `event_id`.
12. **Every receive mode takes the identical wake path; arrival time is the only
    difference.** (r3/Q3) A pushed message and a polled message hit the same
    filter, ask the same spend authorizer, and are bounded by the same
    per-assignment pacing cap. But one thing must be put back explicitly:
    **coalescing was an accidental property of polling** — one pass handed the
    filter a minute's worth of messages at once, so they were naturally one wake.
    Push removes that accident, and 30 messages become 30 deliveries. So when
    `receive === 'push'` and `notify: 'wake'`, the engine applies a coalescing
    window (default 60 s) **before** the wake decision, so one burst is still one
    wake. Forget this and the act of "turning on real-time push" multiplies a
    conversation's bill by thirty.
13. **Never read another process's memory, and never ship an adapter whose
    transport is prohibited by the platform's terms without one named
    acknowledgement.** (r3/Q3(b)) This is load-bearing for the local-client class:
    WeChat's desktop store is SQLCipher/WCDB-encrypted and the key exists only in
    the **running client's process memory** — which is where every public tool
    extracts it from. Reading another process's memory is not the same act as
    reading a file, and this product does not do it. On the WhatsApp side, the
    protocol libraries (whatsmeow / Baileys) are reverse-engineered **unofficial
    clients**, unofficial clients are explicitly prohibited by WhatsApp's terms,
    and bans have landed on low-volume, reply-only, otherwise legitimate use. Such
    adapters therefore carry a `tosRisk` capability, are not offered by default,
    and need an acknowledgement that names the risk (decision 19).

---

## 4. The adapter interface

An adapter is built by a factory taking `(record, deps)`. It is **stateless with
respect to policy** and owns exactly three things: vendor authentication, vendor
pagination, and vendor message shape.

**It differs from other adapters on two axes, and those axes are modelled rather
than papered over** (r3/Q3): **read-only vs send** (per conversation, and per
identity — as the user or as a bot), and **synchronous vs asynchronous receive**
(push / poll / scan). Both live in `caps`, and the first also has a
per-conversation resolver `convCaps`, because "this adapter can send" and "this
adapter can send into **this** conversation" are different claims.

```js
// src/channels/<kind>.js  →  module.exports = { kind, caps, create }
{
  kind: 'lark',                       // registry key; never branched on downstream

  caps: {
    // ——— axis 1: HOW MESSAGES ARRIVE ———————————————————————————————
    receive:        'push',           // 'push' | 'poll' | 'scan'  — the BEST lane it has
    pushTransport:  'ws-long-conn',   // 'ws-long-conn' | 'pubsub-pull' | 'webhook' | null
    pushExclusivity:'unknown',        // 'exclusive' | 'shared' | 'unknown'  (§6.4 — decides
                                      //  whether push may carry CONTENT or only KICK a cursor)
    pushAckBudgetMs: 3000,            // vendor's own deadline; we ack after DURABILITY (fence 11)
    pollInterval:   { hot: 30, cold: 300, floor: 10 },   // seconds; `floor` is the VENDOR's
    scanSource:     null,             // 'store' | 'ui' | null  — only when receive === 'scan'
    scanLatency:    null,             // seconds, typical; SHOWN on the conversation row
    history:        'page',           // 'page' | 'since' | 'none'
    listConversations: true,

    // ——— axis 2: WHAT MAY BE SENT, AND AS WHOM ——————————————————————
    sendAs:         [],               // subset of ['user','bot'];  []  =  READ-ONLY adapter
    identityMarking:'unknown',        // 'none' | 'marked' | 'unknown'  — what the RECIPIENT sees
    identityMarkingWhere: null,       // 'recipient-ui' | 'raw-headers' | null
    identityMarkingText: null,        // ONE sentence, shown VERBATIM in the approval card (§9.5)
    tosRisk:        'none',           // 'none' | 'stated' | 'prohibited'  (fence 13)
    idempotency:    'key',            // 'key' | 'two-phase' | 'none'   (§9.4)
    threading:      'reply-to',       // 'reply-to' | 'thread-id' | 'none'
    editSent:       false,
    readReceipts:   false,
    attachments:    'metadata',       // 'metadata' | 'fetch' | 'none'
  },

  async auth.state()   -> { state:'connected'|'needs-reauth'|'unknown', expiresAt, scopes, why }
  async auth.begin()   -> { consentUrl, flowId }             // via src/oauth-loopback.js
  async auth.finish(flowId, code) -> { ok, record }

  async listConversations({ cursor, limit })
        -> { conversations: [ChannelConversation], cursor, complete }

  // axis 1 resolved for ONE conversation — three-valued, cached in the index with its age
  async convCaps(convId)
        -> { read:'yes'|'no'|'unknown',
             sendAs: [...],                       // SUBSET of caps.sendAs that holds HERE
             why: 'not-a-member'|'bot-not-in-chat'|'read-only-mailbox'|'left-group'|null,
             at }

  async history(convId, { anchor, limit })
        -> { records: [ChannelRecord], anchor, reachedAnchor, complete }

  async send(convId, { text, replyTo, idemKey, as })         // `as` ∈ convCaps.sendAs
        -> { ok, vendorMessageId, at, sentAs } | { ok:false, code, retryable, detail }

  async reconcile(convId, { idemKey, sentAt })               // §9.4, unknown outcomes only
        -> { landed:true, vendorMessageId } | { landed:false } | { unknown:true }

  async fetchAttachment(convId, recordId, attId, { maxBytes })   // caps.attachments==='fetch'
        -> { path, bytes, mime } | { ok:false, code }

  // present ONLY when caps.receive === 'push' — src/channels/live/<kind>.js (§6.4)
  live.start({ onEvent, onState })  ->  { stop() }
}
```

`src/channel-caps.js` (PURE) is the **one** place that answers "does this control
exist at all":

```js
offers(caps, convCaps, what)   // what ∈ 'send-as-user'|'send-as-bot'|'fetch-attachment'|…
      -> { offered: boolean, why: string|null }      // 'unknown' ⇒ offered:false + the reason
identityWarning(caps)          -> { level:'none'|'warn', text }        // §9.5
freshnessClaim(caps, convState)-> { kind:'live'|'within'|'scanned', seconds, text }
```

Three consumers read the same record, each for its own face:

- **The panel** draws every row's freshness chip from `freshnessClaim` (push =
  "live", poll = "≤ 30 s", scan = "last scanned <t> ago" — **a scan source's
  latency is shown on the conversation**, because it is the one number a user
  needs before handing that lane a job), uses `offers()` to decide whether the
  send affordance exists on the composer and the approval card at all, and uses
  `identityWarning` for the warning on the card (§9.5).
- **The filter / assignment engine** uses `offers()` to make `authority:'send'`
  **unselectable** (an assignment that can never send is a lie, §7.3), and
  `freshnessClaim` to state honestly on the AssignFilter panel roughly how long
  until this agent gets woken.
- **The spend authorizer** reads none of it — and that is the point. The receive
  mode does **not** change the money decision: same filter, same reason, same
  per-credential-slot ceiling. It changes only arrival time, and fence 12's
  coalescing window absorbs that. The suite turns this sentence into an assertion
  that can go red (§16's `test-channels-lane-parity`).

Rules the contract suite enforces (`test-channel-adapter-contract`, driven over
a **fake adapter** plus every registered real one in shape-only mode):

- a declared capability has an implementation, and an undeclared one **throws**
  rather than half-working;
- `history()` never returns records the caller did not ask for, reports
  `reachedAnchor` honestly, and never advances anything itself — the store owns
  cursors;
- every failure is a **typed** `{ code, retryable }` from a closed set
  (`auth-expired`, `rate-limited`, `not-found`, `forbidden`, `transport`,
  `vendor-error`, `too-large`). A bare `throw` out of an adapter is a suite
  failure, because "degrade gracefully" catches are how this repo has repeatedly
  hidden its own bugs;
- **no call site outside `src/channels/` may branch on `kind`** — a grep-derived
  census, the same shape as the `backend-caps` one;
- **`convCaps()` is never wider than `caps`**: the `sendAs` it returns must be a
  subset of `caps.sendAs`, pinned by a synthetic adapter that deliberately
  oversteps. The direction is load-bearing — the static declaration is an upper
  bound and the per-conversation resolution may only narrow — so "we have never
  verified that this platform can send" can never be routed around by one
  conversation's optimistic answer;
- **on an adapter with `sendAs: []`, `send()` and `reply` are not "failures", they
  do not exist**: they return a typed `send-not-available` plus the reason `caps`
  itself gives, and the outbox **creates no proposal at all**. A proposal that can
  never be sent asks a user to approve something that is then guaranteed to fail.

`ChannelRecord` (PURE, `src/channel-record.js`) is the one normalized shape:

```
{ id, convId, adapterId, vendorId, at,
  author:      { id, name, isSelf, isBot },
  text,                        // ALWAYS plain text — the only thing rendered in v1
  mentions:    [{ id, name }], // resolved names, never raw @_user_N placeholders
  attachments: [{ id, name, bytes, mime }],
  replyTo, threadKey,
  raw:         { …bounded, adapter-specific, never rendered } }
```

One normalization detail is mandatory rather than nice: Lark message payloads
carry `@_user_N` placeholders that are **per-message ordinals, not identities** —
resolving them against the message's own `mentions` array is the adapter's job,
and getting it wrong once already caused a message to be attributed to the wrong
person in the ops tooling. The record suite pins it.

---

## 5. The conversation store

`data/channels/` — one directory, four kinds of file:

```
data/channels/
  adapters.json                 atomic JSON. id, kind, label, enabled, inclusion scope,
                                auth {tokenEnc, expiresAt, scopes}, lastPass {at, ok, code},
                                consecutiveFailures,
                                push {enabled, claimedExclusive, state, lastEventAt,
                                      missRate, demotedAt, demotedWhy}    // §6.4
  index.json                    atomic JSON, ONE in-process owner (§5.1). Per conversation:
                                id, adapterId, vendorId, title, kind (dm|group|thread),
                                participants summary, lastAt, unread, tracked, anchor,
                                assignment, filterId, policy, pendingTodoId, reachEntries[],
                                stats {hits7d, msgs7d},
                                convCaps {read, sendAs[], why, at}        // §4, cached WITH its age
                                lane    {via:'push'|'poll'|'scan', lastPushAt, lastPollAt,
                                         lastScanAt, firstSeenByPoll, firstSeenTotal}  // §6.4
  msgs/<adapterId>/<convId>.ndjson   APPEND-ONLY message log, one ChannelRecord per line
  outbox.json                   atomic JSON. Proposals + their state machine (§9)
  audit.ndjson                  APPEND-ONLY. Every outbound attempt and every ACL change
  files/<adapterId>/<convId>/   downloaded attachments (explicit action only)
  .channels-key                 0600 instance-local key for token encryption
```

Invariants, each with its reason:

1. **Append is O(1).** A message log is NDJSON because rewriting a JSON array
   per arriving message turns a busy group into an I/O problem. The index — small
   and read by every render — stays atomic JSON.
2. **Dedup by `(adapterId, convId, vendorId)`,** held as a bounded in-memory set
   per open conversation and rebuilt from the log tail on demand. A replayed page
   (which Lark's anchor semantics guarantee at the boundary, and which a Gmail
   history replay also produces) must be a no-op, never a duplicate.
3. **One writer, one order.** Every mutable per-conversation fact — `unread`,
   `lastAt`, `anchor`, `assignment`, `stats`, `pendingTodoId`, the agent-group
   rotation counter — lives in one index, and **two adapter passes overlap by
   design** (§6.2 runs one loop *per adapter*, single-flight *per adapter*).
   `writeJsonAtomic` is atomic at the filesystem layer only; the
   read-modify-write **around** it is not, so two passes that each read a
   snapshot and later write it back lose whichever advance landed first. That is
   the round-4 `codex-zst` delta defect verbatim — *先读后写且尺寸取自读之前 = 等
   第二个调用者来的丢失更新* — and it is worse here, because a clobbered **anchor**
   advance makes the next pass *skip* messages rather than re-read them, and a
   clobbered unread count is a silent wrong number on the badge. §5.1 names the
   owner that makes the shape unavailable.
4. **The cursor advances only after a complete pass,** inside the *same*
   serialized update as the batch it describes — a crash mid-pass re-reads, it
   never skips. `complete: false` from an adapter means "do not advance". The
   order inside that update is fixed: records land in the (durable, append-only,
   per-conversation) log **first**, the anchor moves in the index **second**, the
   coalesced index flush happens **after** — so a crash anywhere leaves at worst
   a re-read, which invariant 2's dedup absorbs.
5. **Retention is per conversation and bounded twice**: last N records or M days,
   whichever is smaller, with a **floor of 7 days** because the estimator is
   defined over the last 7 days. Trimming streams to a temp file and renames —
   never in place.
6. **`tracked` is opt-in.** An adapter can *see* far more than the panel should
   list: one authorized Lark user is routinely a member of dozens of chats
   (measured on a real account: about fifty), and a mailbox is unbounded. Nothing is ingested until the user marks a
   conversation tracked (or it matches an inclusion query, for Gmail). This is a
   privacy decision, a cost decision, and the thing that keeps the panel a panel
   instead of a mail client.
7. **A derived value never becomes a stored fact.** `unread`, `hits7d` and
   `msgs7d` are recomputed from the log and the read marker; they are cached in
   the index for render speed and are always re-derivable. The quota-model
   incidents (a stored `state` outliving the reading it described) are why this
   sentence is here.

### 5.1 Who owns the index

`src/server/channels-engine.js` holds the **authoritative index in memory** and
is its only writer. `src/channel-store.js` (SHARED) provides durable primitives
— load, append to a conversation log, read a tail, trim, flush the index
atomically — and deliberately exposes **no** "write the whole index" call to
anybody else.

```js
// the ONE mutation door; nothing else may write index state
await index.update((ix) => { /* mutate live memory */ });   // serialized, never concurrent
```

- `update(fn)` mutates live memory, is **serialized** (a promise chain with one
  call in flight, so an overlapping Lark pass and Gmail pass *queue* instead of
  racing), and marks the index dirty.
- The flush is **coalesced**, never per mutation: dirty flag + short debounce +
  periodic sweep + flush on SIGINT/SIGTERM. This is the shape `JobManager`
  already uses for `data/jobs.json` (in-memory `Map` is authoritative, mutations
  call `_save()`, a 2 s interval flushes when dirty, `shutdown()` flushes) and
  `SessionStatusManager` uses for its store (memory and broadcast immediate,
  disk debounced 500 ms and content-compared).
- **A snapshot read is not a lock.** Reading the index to compute something and
  writing the result back *outside* `update()` is precisely the defect this
  subsection exists to prevent. Nothing needs to: the ACL, the filter and the
  policy are PURE and take their inputs as arguments, so a pass computes with
  values it was handed and applies the result inside one `update()`.
- **Sharding is not a substitute.** `index/<adapterId>.json` would serialize the
  common case, but the agent-group rotation counter is keyed by **group** and a
  group spans adapters, and `unreadTotal` (the rail badge) is cross-adapter — so
  the serialized door is required anyway. One door is simpler than a door plus
  two exceptions, and this repo's history says the exceptions are what rot.
- Message logs are per `(adapterId, convId)` and append-only, so they never
  contend and stay outside the serialized path. That is the whole reason the
  hot path (arriving messages) does not pay for the door.

`test-channel-store` drives **two concurrent passes** over one index and asserts
that both cursors advanced and no unread count was lost; the negative control is
a patched copy doing read-modify-write around `writeJsonAtomic`, which must lose
one of them.

---

## 6. The receive pipeline

### 6.1 Shape

```
      ┌─ push  : live.start() ──► onEvent ──┐          ← latency lane   (§6.4)
LANE ─┼─ poll  : adapter.history() ─────────┼─► normalize (PURE) ─► store.append (dedup, atomic)
      └─ scan  : local-client store/UI ─────┘                            │   … then ack (fence 11)
                                                                         │
                        ├─► broadcast 'channels-updated'  (once per pass / per coalesced burst)
                        │
                        └─► COALESCE (60 s window when the lane is push — fence 12)
                              └─► for each ASSIGNED conversation:
                                    channelFilter.matchRecord(filter, record)
                                      └─ hit ─► assignment.route (agent | rotating group)
                                                 └─► wake decision (§7)
                                                      ├─ wake   ─► spend authorize
                                                      │             └─► deliverToConversation(kind:'notification')
                                                      └─ digest ─► stash; one delivery per window
```

**Three lanes converge into one funnel, and nothing after the funnel knows which
lane a message came from.** That is not a nice sentence, it is what
`test-channels-lane-parity` asserts: one day of traffic driven through push, poll
and scan must yield **the same records, the same wake count, and the same
charges**.

Everything after `store.append` is PURE except the two ORCH calls at the end.
That is deliberate: the money-relevant decision chain is unit-testable without a
server.

### 6.2 The scheduler

One loop per adapter, never a loop per conversation. Each tick:

- spends a **request budget** (default 20/min/adapter, a setting) on: every *hot*
  conversation (assigned, or open in a client window right now) at the fast
  cadence (30 s), then *tracked-but-cold* ones round-robin at the slow cadence
  (5 min);
- jitters, and backs off exponentially per adapter on `rate-limited` /
  `transport`, resetting on a clean pass;
- **stops entirely** on `auth-expired` and surfaces it — a loop that keeps
  hammering an expired credential is how an integration gets throttled at the
  vendor;
- never overlaps **itself** (single-flight per adapter) and never holds the loop:
  fs writes are async, every request has a timeout. Single-flight per adapter is
  *not* mutual exclusion between adapters — passes are concurrent by design — so
  every index mutation goes through the one serialized door in §5.1, and a pass
  never carries a stale snapshot across an `await`.

The cost is arithmetic this design owes the reader: fifty tracked Lark chats,
none hot, 5-minute cadence ⇒ ~10 requests/min. One hot assigned chat ⇒ +2/min. A
Gmail account is **one** `history.list` request per tick when nothing has
changed. That number matters because **polling does not disappear when push is
turned on**: it drops to a much slower **reconciliation cadence** (default
15 min, a setting) and changes job from *latency* to *completeness*. §6.4 says
why that is not conservatism but a consequence of what the push lane itself
guarantees.

### 6.3 Per-adapter ingest

**Lark (user token).** `im/v1/chats` for discovery (paginated), then
`im/v1/messages?container_id=<chat>` per tracked chat, newest-first, paging with
**`next_page_token`** — the field is *not* called `page_token`, and reading only
the first page is a documented way to lose messages silently. Stop at the stored
anchor; on a burst day that means several pages, which is the entire point.
Known vendor limits carried over from the ops notes, all of which the adapter
tolerates rather than assumes away: bulk DM enumeration is unreliable (DMs are
added by search or by the user picking them); `im search` treats multi-word
queries as phrases; its time-window parameters do not filter reliably; images are
a second authorized fetch against a per-message resource endpoint, so v1 records
them as attachment metadata only.

**Gmail (user token).** `history.list?startHistoryId=…&historyTypes=messageAdded`
per tick — one cheap request when nothing has changed — reusing the existing
`GmailSync` recovery semantics in spirit: a 404 on an expired `historyId` means
reseed; a 404 on an individual message means skip that id rather than freeze the
pass (a real "增量卡住3小时" incident); the cursor advances only after the pass
completes. Threads, not messages, are conversations: `threadId` is the `convId`,
the inclusion scope is a Gmail query (default `label:INBOX`), and nothing outside
it becomes a conversation.

**Agents (built-in).** Conversations are agent sessions; reach is `msg-acl`;
"send" is `deliverToConversation`. Its message log holds **only what channels
itself routed** — it is a directory and a send lane, explicitly **not** a mirror
of any transcript. Two renderers over one conversation is how this codebase gets
twins.

**Local clients (WhatsApp / WeChat, `receive: 'scan'`).** A third ingest class,
and what separates it from the first two is not cadence but **where the evidence
comes from**: there is no vendor API we may call, only an official client running
on some machine and whatever it writes down or draws (§12.5). `scanSource:
'store'` means "read the local store that client wrote"; `scanSource: 'ui'` means
"read what that client rendered", driven by an agent-browser profile (see
`docs/design-agent-browser-v2.md`). Both are **periodic scans with a cursor**,
both may add an optional change notification (an fs.watch on the store file; a
DOM mutation for the UI), and for both the latency is **the number drawn on the
conversation row**, because it is the one thing a user must know before handing
that lane a job. Sending is either through the client's own UI (agent-browser
typing) or through the protocol — and the latter carries fence 13's terms risk.
The interface for this class exists from P0 (`scan` / `scanSource` / `convCaps` /
`tosRisk` are all slots kept for it); the WhatsApp and WeChat adapters themselves
are P6 behind decision 19.

### 6.4 Receive lanes: push, poll, scan — and which of them may carry content

r2 wrote an absolute rule here — *"a live lane may only invalidate a cursor, it
may never carry content"* — and put both Lark lanes in P5. The owner asked
explicitly for **real-time push**, so this section re-argues it from the
evidence: the rule's **reason** stays, its **scope** changes.

**The rule's original reasons, checked one by one (all confirmed against the
official documentation):**

| Fact | Status | What it actually constrains |
|---|---|---|
| The long connection **needs no public URL** | confirmed | Its entire advantage over the webhook, and why it fits "never expose an inbound endpoint" |
| The long connection is **enterprise-self-built-apps only** | confirmed | A precondition, not a risk |
| **At most 50 connections per app** | confirmed | One per instance; a fleet is nowhere near it |
| Push is **cluster mode, not broadcast**: with several clients on one app, each event goes to **exactly one of them at random** | confirmed | **This, and only this, was the rule's real reason** — and it only holds when **several instances share one app credential** |
| The subscriber must answer HTTP 200 within **3 seconds** | confirmed | Decides where the ack goes (fence 11); does not decide whether content may ride the lane |
| Delivery is **at-least-once**: a missed deadline is retried at 15 s / 5 min / 1 h / 6 h, at most **4 times**, and duplicates arrive even after success | confirmed | **Refutes "push is unreliable, so it can only kick"** — the vendor retries, and §5 invariant 2 absorbs the duplicates |

So the rule is replaced by a narrower and more honest one:

> **A push lane may carry content if and only if this credential's push lane is
> exclusive to this instance.**
> Exclusivity is a **configuration fact**: **asserted** by the operator,
> **measured** by the product, and **demoted by the product itself** when the
> measurement disagrees with the assertion.

`caps.pushExclusivity`, together with `push.claimedExclusive` on the adapter
record, decides it:

- **`exclusive`** — the user declared in the connect wizard that this app's push
  lane belongs to this instance. Push **carries content**: the event's message
  goes normalize → append → ack → coalesce → filter. Polling drops to the 15-minute
  **reconciliation cadence** — no longer the latency mechanism, still the
  completeness one.
- **`shared` / `unknown`** — push is **only a cursor kick**, i.e. r2's rule kept
  verbatim (wake the backoff *sleep*, not merely abort a fetch — the
  `opencode-events` lesson, where a lane that only aborted the fetch took 25 s to
  go live). Polling stays at the fast cadence. The default is `unknown`, so
  **asserting nothing gives you r2's behaviour**.

**An assertion must be falsifiable or it is a prayer.** The platform never tells
us how many other clients are connected, so exclusivity is **asserted, never
inferred** — but it is **measurable**: the engine records
`firstSeenByPoll / firstSeenTotal` per adapter, the fraction of records seen
first by the reconciliation poll rather than by push (`push.missRate`). On a
genuinely exclusive lane that number stays at 0. Crossing a threshold (default
2 %, with at least 20 samples) **auto-demotes the lane to kick mode**, records
`demotedAt` / `demotedWhy`, and says so on the adapter row: *"push is not
exclusive here — fell back to cursor kicks, polling returned to the fast
cadence"*. That path is this feature's instance of the rule that **a claim must
be retractable by whoever made it** (the login-expiry lesson): the product states
something, then measures it, then withdraws it itself.

**Liveness is positive evidence only** (the `opencode-events` round-4 lesson — a
lane that lies about being `active` is worse than no lane, because it turns the
fallback **off**): `push.state === 'live'` requires a connected socket **and**
something received inside the heartbeat window; silence past that window is death
⇒ the poll cadence returns to fast immediately while the lane reconnects.
`stop()` is terminal for an arm already **in flight** (the round-6 lesson), and
the lane is **single-use**.

**Ack after durability, never after processing** (fence 11). This is a direct
consequence of the 3 s budget rather than a style preference: our chain (append →
filter → spend authorize → deliver) can exceed 3 s, and acking *before*
durability quietly downgrades the vendor's at-least-once into our own
at-most-once.

**The HTTP webhook stays "never".** It needs a public URL, a verification token
and an encrypt key; VibeSpace has `instance-url`/frp and could expose one, but
exposing an inbound endpoint to gain nothing the long connection does not already
give is a bad trade.

**Gmail's push has a different — and better — shape:** `users.watch` + Cloud
Pub/Sub. Its pain is operational rather than semantic: a topic, an IAM grant, and
a watch that **expires silently after 7 days** and stops without a sound if one
renewal is missed (hence a daily renewal job). But **a Pub/Sub subscription can
be pulled**, so it too needs no public inbound endpoint; and each instance can
hold **its own subscription**, so Gmail's exclusivity is a fact that can be
**configured** rather than a random race — the substantive difference from Lark's
cluster mode. The default stays polling (one request per tick when nothing
changed), with push as an **optional upgrade whose cost is stated** (decision 20).

**Scheduling:** the Lark long connection's transport, liveness and exclusivity
measurement land in **P1** (receiving belongs with receiving); the push-burst
coalescing window and the "same number of wakes on every lane" leg land in **P2**
(they need the wake path). Gmail's Pub/Sub pull lands in P1 behind a switch that
is off by default.

---

## 7. Assignment, filtering, and the cost of waking somebody

### 7.1 The filter (PURE)

```js
// src/channel-filter.js
matchRecord(filter, record, ctx) -> { hit: boolean, why: string[] }
estimate(filter, records, { days = 7, now }) -> {
  matched, total, matchedPerDay, totalPerDay, windowDays, sampled, truncated
}
```

Rule kinds are a closed set, extended by adding a row plus a suite case:
`mention`, `keyword`, `sender-in-group`, `from-address`, `subject`,
`has-attachment`, `not-contains`, `time-window`; `match: 'any' | 'every'`.

Two properties the suite pins:

- **`why` is contract, not prose.** The wake delivered to the agent says which
  rule fired, and the panel shows the same string. A wake whose reason cannot be
  named is a wake nobody can tune — the same law as the approval card's "why" and
  as auto-resume's named refusals.
- **`estimate` is honest about its window.** It reports `sampled` / `truncated`
  when it did not read everything, and the UI prints the caveat. An estimate that
  silently reads 200 of 2,000 records is worse than no estimate, because the user
  is being asked to authorize a *rate of spending* on the strength of it.

### 7.2 The estimate must be measurable afterwards

The estimate is a **prediction**, and the store already holds what it takes to
check it. `index.stats.hits7d` records what the filter *actually* matched over
the last 7 days, and the AssignFilter panel shows both: *"estimated ~4/day when
you set this up; actually 6/day since."* A product that asks the user to reason
about a rate owes them the measurement — and it is nearly free, because the
counter increments on the path that already ran the matcher.

### 7.3 Assignment

```
assignment = { principal: { kind:'agent'|'group', id },
               mode: 'all'|'filtered', filterId,
               notify: 'wake'|'digest', digestMinutes,
               authority: 'draft'|'send',
               createdAt, createdBy: 'user' }
```

- `authority: 'send'` is **capped by two separate things**: (a) **channel
  policy** — when the channel requires review the option is not selectable, and
  the stored value is clamped at read time too (a stored value the current policy
  forbids must not silently become a permission if the policy is later relaxed);
  and (b) **capability** (r3/Q3) — when `offers(caps, convCaps, 'send-*')` is
  false the option **is not drawn at all**, with the reason `caps` itself gives
  beside it. Setting `authority:'send'` on a read-only conversation promises the
  user something that does not exist on that platform. The order of the two caps
  does not matter, because both only narrow.
- Assigning to a **group** rotates round-robin over that group's live sessions,
  with the rotation state in the index. A rotation that finds no live session
  falls back to stash-for-next-turn — never to "wake them all".
- **Assignment implies reach — as a grant that says who wrote it.** Assigning
  conversation C to agent A writes an explicit ACL grant `visible` for (A, C)
  rather than creating an implicit special case, so "not visible = does not
  exist" stays literally true and the AgentReach panel shows exactly what is in
  effect. That grant carries `origin: 'assignment'`, and **un-assigning removes
  only the `origin:'assignment'` row.** Grants are keyed by (principal, scope),
  so without `origin` a user who had independently granted A `visible` on C in
  the AgentReach panel would have that grant silently revoked by an unrelated
  action — a **narrowing** operation smuggled into a model whose stated law
  (§8) is widening-only.

### 7.4 The wake, and who pays for it

A matched message that wakes an agent is a turn nobody typed. It therefore takes
the existing path and adds nothing beside it:

- one new declared reason in `src/spend-authorizer.js` —
  `'channel-message': { turn: true, what: 'a message from a connected channel' }`
  — added **in the same commit as the producer**, because that set is closed and
  a declared-but-unused reason is a slot the next producer slides into without
  anyone deciding anything;
- the producer asks the guard the pool engine constructs (never an injected
  dependency that can be handed a null — the r2 lesson, where a gate depending on
  a dep nobody passed was dead code in production while a harness that did pass
  it kept the suite green), takes the verdict's **own** identity, passes *that*
  identity to the charge (charge what you authorized), and releases the hold at
  one `finally`;
- a refusal **loses nothing**: the message is already in the store, and the
  ladder's stash carries the words into the agent's next turn. That is why this
  gate is safe to fail closed;
- three layers, three jobs, stated so nobody later collapses them: the
  per-assignment daily wake cap is **pacing**; the ladder's 30 s per-conversation
  floor is **flood control**; the authorizer is the **money bound**. Only the last
  is per credential slot, and only the last survives a restart.

Digest mode is the same ladder used differently: matched records are stashed and
one batched delivery per window is authorized — reusing the existing
`renderMsgStash` / `renderNotifStash` block, so a 30-message hour becomes one
turn instead of thirty.

**Push removes a property that used to be free, so it has to be bought back
explicitly** (fence 12, r3/Q3). Polling coalesces by accident: one pass hands the
filter everything that arrived in a minute, so those messages were naturally one
wake. Push arrives one message at a time, and the same burst becomes 30
deliveries and 30 billed turns. So when a conversation's lane is push and
`notify: 'wake'`, the engine applies a coalescing window
(`channels.pushCoalesceSeconds`, default 60) **before** the wake decision: hits
inside the window accumulate into one wake, the injected block still lists them
individually (§7.5's budget is unchanged), and `why` says "N messages in this
minute". The three layers' jobs do not change by a word — coalescing is
**pacing**, not the money bound — but without it, "turn on real-time push", a
purely latency-shaped act, multiplies some conversations' bills by an order of
magnitude. That is why `test-channels-lane-parity` exists: **one day of traffic,
three lanes, the same wake count and the same charges**, with a push-lane copy
that bypasses the coalescing window as its negative control, which must wake
more.

### 7.5 What the agent actually receives

A rendered block, budgeted (the injection channel wraps at 10 KiB and this
product has already lost that fight once):

```
### Channel message — Lark · <conversation title>
from <author> at <time> · matched: mention @on-call, keyword "GPU"
<text, ≤400 chars per record, ≤6 records, "(N older elided)">
Reply with: vibespace-channels reply <convId> "…"   (this PROPOSES; the user approves)
```

The body is inserted as **text**, and the PURE renderer strips anything shaped
like our own injection markup (`<system-reminder>`, `<persisted-output>`, and
this block's own headings) from a vendor-supplied string before embedding it. An
external party can type those characters; they must not be able to forge a frame
in an agent's context. This is the prompt-injection twin of the XSS rule, and it
belongs in the PURE renderer where it can be unit-proved.

---

## 8. Visibility (AgentReach)

`src/channel-acl.js`, PURE, importing `src/msg-acl.js` for the ordering and the
widening law (the architecture suite permits PURE→PURE and forbids everything
else).

```
level  : 'hidden' < 'requestable' < 'visible'
grant  : { principal:{kind:'agent'|'group', id},
           scope:{kind:'conversation'|'adapter', id},
           level,
           origin: 'user'|'assignment'|'request',   // WHO wrote it (§7.3)
           at, by }
effective(principalCtx, scope, grants) -> { level, via:'group'|'agent'|'default', grantId }
```

- **Default is `hidden` for everything.** There is no "inherit from the
  platform" — the platform's own ACL says what the *user* may see, never what an
  *agent* may.
- A single agent **inherits its groups and may be widened individually**; the
  effective level is the MAX over applicable grants. Narrowing an individual
  below its group is deliberately impossible — the same rule as `msg-acl`'s
  override, for the same reason: a widening-only model can be reasoned about, a
  mixed one cannot.
- **`requestable`** is the middle state: `effective` returns it, the agent may
  file a request (`vibespace-channels request <convId> "why"`), the request lands
  as a "For you" item carrying the stated reason, and approval writes exactly
  **one** grant for (that principal, that scope) at `visible`. It never touches
  the group default — the artboard's behaviour, verbatim.
- **`hidden` is total.** Not listed, not searchable, not addressable by id; an id
  supplied out of band answers the same uniform error as a nonexistent one.
- **`origin` is the only reason machinery ever removes a grant.** `effective()`
  already MAXes over every applicable grant, so several grants on one
  (principal, scope) compose correctly and the accessor needs no change; what
  `origin` buys is that un-assigning deletes the assignment's own row and
  nothing else, that a request approval is distinguishable from a hand-made
  grant, and that the panel can say *why* a principal can see something.
- Every grant change appends to `audit.ndjson` with who / when / why.

---

## 9. The outbox: propose → policy → approve → send → receipt

### 9.1 States

```
draft ─(agent proposes)──────────────► proposed
proposed ─(policy: direct)──────────► sending ─► sent | failed | unknown
proposed ─(policy: review)──────────► awaiting-approval
awaiting-approval ─(approve, maybe edited)─► sending ─► sent | failed | unknown
awaiting-approval ─(reject)─────────► rejected
awaiting-approval ─(TTL, default 24 h)─► expired
unknown ─(reconcile)────────────────► sent | failed      // never auto-retried; §9.4
```

`src/channel-policy.js` (PURE) owns the transition table plus:

```js
decideOutbound({ channelPolicy, guards, proposal, now, tz })
  -> { mode: 'direct'|'review',
       reasons: ['channel-policy'|'links'|'attachments'|'off-hours'|'authority'] }
```

- Guardrails **stack on top of** channel policy and can only make it stricter:
  audit always on; links/attachments force review; off-hours forces review. A
  guardrail able to *relax* a policy would make the policy a suggestion.
- **Fail closed:** an unknown policy value or an unparseable guard config ⇒
  `review`. Off-hours needs a timezone; with none configured the guard is *off*
  rather than guessed — a wrong timezone silently reviewing everything (or
  silently nothing) is worse than an honest "not configured", which is a setting
  the panel shows.

### 9.2 The approval surfaces

The same record renders in **two places** — inline in the conversation window's
timeline (where the context is) and in the Outbox window (where the queue is) —
from one store, so they cannot disagree.

Plus a **pointer item** in the existing "For you" inbox, so the taskbar badge
fires. Its shape is dictated by what `UserTodoManager` *is*, not by what would
be convenient: `add(sessionKey, {text, detail, urgency, by, sessionName, jobId})`
is a **closed parameter set** with nowhere to carry a proposal id; it dedups on
`(sessionKey, text)` **across all statuses**, so re-filing a resolved item
reopens the *same* id (deliberate — it stops an add→resolve loop spamming
"new item" toasts); and it **throws** past `MAX_OPEN_PER_SESSION` (20). "One
item per pending proposal" is therefore not expressible: two proposals whose
pointer wording matches collapse into one item, approving either retracts the
badge for both, the second proposal has no pointer at all, and a burst throws.

So the pointer is **one item per conversation**:

- `text` is **count-free** — *"Proposals awaiting approval in ‹conversation›"* —
  which makes dedup-by-text exactly the idempotence wanted. The **count and the
  newest body live in `detail`**, which `add()` updates in place on a re-file;
- the id `add()` returns is stored on the **conversation** record
  (`pendingTodoId`), because retraction needs *conversation → item* and nothing
  else persists that link. This is the gap the login-expiry fix closed by
  persisting `items:[{id,text}]` on the producer's own ledger; re-deriving the
  item by matching text at retraction time would be a second copy of a string
  that must never drift;
- it is **retracted by this producer** (`setStatus(id, 'done', 'system')`) the
  moment the conversation's last proposal leaves `awaiting-approval` by any
  route, and only for ids this producer wrote. An item that outlives its subject
  is the login-expiry incident;
- `add()` throwing on the open cap is **caught, logged, and degraded** to the
  rail badge and the Outbox window, which are the surfaces of record. A pointer
  that could not be filed must not take the proposal down with it.

(The alternative — a `proposalId` field on the todo item, dedup keyed on it when
present, and `todoItemId` stored on the proposal — is a schema change to a store
several other producers share, and it buys per-proposal badges nobody asked for.
It is recorded in decision 7 in case the owner wants exactly that.)

The card carries **why** — the alert / conversation / task that caused it — as a
structured reference the panel can link, not a sentence the agent wrote. Editing
in place sets `edited: true` and stores both bodies; the receipt says so. The
card also carries an **identity row** ("will be sent as ‹user name›") and, when
`identityMarking` is not `none`, the warning — verbatim from
`caps.identityMarkingText` (§9.5).

### 9.3 What the agent gets back

```
{ proposalId, status: 'sent'|'rejected'|'edited'|'expired'|'failed',
  convId, adapterId, vendorMessageId, at,
  edited: bool, editedBy: 'user', reason,         // rejection/failure reason, verbatim
  sentAs: 'user'|'bot'|null,                      // §9.5 — the identity that actually sent it
  identityMarking: 'none'|'marked'|'unknown',     // what the RECIPIENT saw
  identityMarkingText: '<one sentence>'|null }    // verbatim; null when marking === 'none'
```

Those three new fields are half of r3/Q4: **the agent has to know who the other
side saw.** An agent drafting what it believes is "a message from this person",
where the recipient in fact sees an app name, must learn that from the structured
receipt it gets back — not from an audit log nobody reads. On a conversation with
`sendAs: []`, `reply` never creates a proposal at all and returns the typed
`send-not-available` instead (§4).

Delivered through the same ladder with one new option:

> **`deliverToConversation(cid, text, { noWake: true })`** — deliver only when it
> costs nothing, otherwise stash. Concretely: take the lane when
> `notificationDelivery(capsOf(backend)) === 'steer'` **and** a turn is running
> (the only lane that opens no turn); otherwise stash for the next turn.

This is a small, principled addition to the ladder rather than a caller-side
branch, because *transport selection lives inside the ladder* (the CS law) and
because the free-lane test is exactly the one the spend work already
established — a claude cli-inbox delivery mid-turn is **deferred, not free**, so
`noWake` on that lane stashes rather than delivering.

What `noWake` changes is the **fallback**, not the accounting: instead of
descending to a rung that would open a turn, it stashes. The authorization is
still taken with a hold, because "this frame joins the running turn" is a
*prediction* — the turn can end between the check and the wrapper's RPC — and the
existing withheld-charge machinery (`peer_message_result{mode}` →
`settleRpcDelivery`) is exactly what converts a wrong prediction into a real
charge. Reusing it is the difference between a free lane and an unbilled one.

Receipts default to `noWake: true`: an approval typically happens minutes or
hours later, and the agent's next turn is the natural place to learn about it
(decision 8).

### 9.4 Sending exactly once

Two mechanisms, chosen per adapter by `caps.idempotency`:

- **`key`** — Lark's send accepts a developer-generated `uuid` (≤ 50 chars) that
  deduplicates identical requests within one hour to at most one successful send.
  The proposal id is the key, so a retry inside that hour is safe by
  construction.
- **`two-phase`** — Gmail has no idempotency key on send, so the outbox creates a
  **draft** first (a durable handle) and then sends the draft. If the send's
  outcome is lost, `reconcile()` asks whether that draft still exists / whether
  the thread now contains our message.
- **`none`** — the proposal goes to `unknown` and stops. **An unknown-outcome
  send is never auto-retried.** The card says so and asks the user to look; the
  audit line records the attempt. Sending a duplicate into somebody else's ops
  group is a worse failure than asking.

Every send appends to `audit.ndjson` **before** the request goes out (attempt)
and again with the outcome — so a crash between the two leaves an attempt with no
outcome, which is precisely the state `reconcile()` exists to resolve, and
precisely the state that must never be read as "not sent". The audit line also
records `{draftedBy, approvedBy, sentAs, identityMarking}` (§9.5) — **that record
stays inside this instance** and never rides out with the message.

### 9.5 Who the message is sent as, and who that sentence is owed to

**Default: send as the user, with no tag at all.** (Owner ruling, r3/Q4 — this
**reverses** r2's decision 17, "append `drafted by <agent>`, default ON for
external channels".) On every channel that allows sending as the user, the
message goes out looking like the user's own, with nothing of ours in the body.
The sender honesty line survives, but demoted to a per-channel option that is
**off by default** (`channels.senderHonestyLine`).

The reason is **whom that sentence is owed to**. r2 read it as a disclosure owed
to the recipient, and so put the disclosure inside the message somebody else
reads — which both rewrites the user's own words and happens *after* the user has
already decided to send. The person who actually needs to know who the other side
will see is **the one pressing approve**, and **the agent that drafted it**. So:

> **Honesty is owed to the person taking the action, not imposed on the person
> receiving the message.**

The disclosure therefore moves out of the message into two places: **the moment
of authorization** (a line on the approval card / send affordance) and **the
receipt** (§9.3). It is driven by `caps.identityMarking` — a capability row, never
a per-vendor `if`:

| `identityMarking` | Meaning | On the approval card |
|---|---|---|
| `none` | The recipient sees this user; nothing attributable to an app in the UI or in the raw data | One calm line, "will be sent as ‹user name›" |
| `marked` | This channel **will** attribute the message to an app/bot — `identityMarkingWhere` says whether that is in the **recipient's UI** or only in the **raw headers** | A **warning** showing `identityMarkingText` verbatim, e.g. "this channel will show the message as sent by ‹app name›" |
| `unknown` | We have **not verified** how this channel attributes it | Treated exactly like `marked`, and says it is unverified — fail closed on honesty |

Four known shapes, each with its evidence (details and sources in §12.1 / §12.2):

- **Lark bot send** (`im:message:send_as_bot`, tenant token): the platform's own
  `sender.sender_type` is `app` and the message carries the app's name and avatar.
  ⇒ `marked` / `recipient-ui`.
- **Lark user-identity send** (`im:message` + `im:message.send_as_user`, user
  token): the official documentation does carry a permission "以用户身份发送消息"
  (send as the user), but it **does not state what `sender_type` the recipient
  sees**, and a community report claims it stays `app` even with a user token.
  ⇒ `unknown`, until a real send in P4 settles it (§20).
- **Gmail API send**: the recipient's mail UI shows the user — no app badge, no
  "via" — but a message sent through the API carries an extra `Received:` header
  naming `gmailapi.google.com`, which "show original" reveals. ⇒ `marked` /
  **`raw-headers`**, with the text saying exactly that: *"invisible in the
  recipient's mail UI; visible in the raw headers (a `Received:` line naming
  `gmailapi.google.com`)"*. This is the answer to the owner's "verify which are
  visible": **not indistinguishable — indistinguishable in the UI, distinguishable
  in the raw data**, and those are different facts to someone deciding whether to
  send.
- **WhatsApp via a protocol library**: it looks like the user (`none`), but it
  carries `tosRisk: 'prohibited'` (fence 13) — and **that** is what has to be said
  loudly on that lane. Identity honesty and terms risk are orthogonal axes; making
  one field carry both is the next incident.

**Lark's user-identity send still needs the P4 scope round trip** (decision 2
unchanged): both `im:message` (获取与发送单聊、群组消息) and
`im:message.send_as_user` (以用户身份发送消息) must be requested together — note
that the second one's separator is a **dot, not a colon**; the ops notes' spelling
`im:message:send_as_user` is wrong, and that error only shows up in the console as
"no such permission". **Until it lands**, the Lark adapter declares `sendAs: []`
and the UI says so instead of greying a control out: *"sending needs two more
permissions on the Lark app, a version publish and one re-consent — Connect ▸
Request send permission"*, with a link straight to §12.1's checklist. The agent
side gets the same fact as `send-not-available` with the same reason, so it never
drafts a proposal that can never be sent.

**The audit log still records the drafting agent** (`draftedBy`), alongside
`approvedBy` / `sentAs` / `identityMarking`. Dropping the default honesty line
does **not** drop attribution; it puts attribution back where it belongs — this
instance's own record, rather than somebody else's inbox.

---

## 10. The panel

### 10.1 Registrations (no new chrome primitives)

- **Rail:** one new item `channels` in `src/lib/sidebar-rail.js` — and the badge
  is **not** free, because nothing in that file picks up a new id automatically.
  **Six registrations**: an entry in `RAIL_ICONS`, one in `RAIL_TITLES`, the id
  in `PANEL_TABS`, the item in the rail's own item list, a
  `_railSetBadge('channels', unreadTotal)` branch inside `_railRefreshBadges()`
  (whose sources are a hardcoded ladder of fetches), and `'channels-updated'`
  added to the explicit message-type list in `_railWireBadges()`. The helper is
  `_railSetBadge(id, val)`; **there is no `_railBadge`**. Unlike ports / hosts /
  jobs, which re-fetch, this badge is computed from the broadcast digest the
  engine already sends, plus one probe at page load.
- **Window:** `registerWindowType({ type:'channel', icon, label,
  action:'openChannel', replay })` — layout restore, cross-client sync, desktops,
  tab groups and the taskbar then work for free, and `replayOpenSpec` cannot
  silently drop it (the registry has a loud default).
- **Outbox window:** `type:'channel-outbox'`, `singleton: true`.
- **Menus / commands:** contributions in `src/lib/contributions.js` — a
  `channel-row` menu (assign…, filter…, reach…, mark read, untrack) plus gear
  rows for "Connect an adapter…".
- **Settings:** a `Channels` category **added to `SETTINGS_CATEGORIES`** in the
  same commit as the first setting. That array *is* SettingsUI's render loop; ten
  settings once shipped unreachable because nobody added the row, and
  `test-architecture` §44 now fails the build for it.

### 10.2 Data flow to the client

`GET /api/channels` returns the index digest (adapters + conversations + chips +
each conversation's resolved `convCaps` and its freshness claim) — never message
bodies. `GET /api/channels/:id/messages?before=&limit=` returns a
page. `POST /api/channels/:id/estimate` runs the PURE estimator **server-side**
over stored history and returns counts (debounced from the filter editor; the
client never receives the corpus). Mutations: assign, filter, reach, track,
approve, reject, edit, request-approve.

### 10.3 Rendering hostile text

v1 renders **plain text** through the existing `escHtml` + linkify path — no
`innerHTML` of a vendor body anywhere, and no markdown parse of a stranger's
message (the sanitizer is good; the attack surface is the point). Gmail HTML
parts are converted to text for the timeline, with an "open original" affordance
pointing at the existing `.eml` viewer for a synced mailbox or at a vendor deep
link. Rich rendering is a P5 item, and its landing place is the **existing
sandboxed-iframe pattern** from published pages (a `raw` route under a sandbox
CSP with no `allow-same-origin`), not a DOMPurify pass into our own DOM.

### 10.4 Multi-client

One broadcast per ingest pass, not per message: `channels-updated` carrying the
changed conversation ids and their new digests (unread, lastAt, chips). Open
conversation windows refetch their tail on a matching id.
`channel-outbox-updated` for the proposal store. Every persistent mutation
broadcasts, and UI actions chained after a store write never wait for the echo —
the standing multi-client law.

---

## 11. The agent surface

**A new CLI, `vibespace-channels`** (static tracked, added to
`HostManager.AGENT_TOOLS`, manual at `docs/agent/channels-manual.md`, topic
registered in `AGENT_DOC_TOPICS` so `vibespace-docs channels` works).

```
vibespace-channels list                       # conversations visible to you (+ chips)
vibespace-channels read <conv> [--since|--limit]
vibespace-channels reply <conv> "text"        # PROPOSES; prints the policy verdict + proposal id
vibespace-channels status [<proposalId>]      # receipts / pending proposals
vibespace-channels request <conv> "why"       # only when the conversation is 'requestable'
```

Why not extend `vibespace-msg`: its `send` **delivers**, this `reply`
**proposes**. One verb name carrying two authorization semantics is exactly the
twin this codebase punishes; the two manuals cross-reference each other instead.
The manual must state, in the same tone as the msg manual, that (a) a reply is a
proposal and may be edited or rejected, (b) the receipt arrives on the agent's
next turn unless the user configured otherwise, and (c) an invisible conversation
is indistinguishable from a nonexistent one.

Routes are `vsst_`-scoped like the existing agent routes, and every route
resolves the calling session's principal before consulting `channel-acl` — an
agent can never widen its own reach.

---

## 12. Adapters in detail — what is proven and what is not

### 12.1 Lark

**Proven on the existing self-built app** (from the ops notes): user-token OAuth
with automatic refresh; reading everything the authorizing user can see (all DMs
plus every group they are in) with **no bot membership required**; chat listing,
per-chat history with `next_page_token` paging, and per-message resource fetch
for images; roughly fifteen granted scopes covering IM read, contacts, calendar
and docs.

**Not proven — each is a decision or a round of work:**

- **Sending — and the scope name is misspelled.** The official documentation says
  user-identity sending requires **both** `im:message` (获取与发送单聊、群组消息)
  and **`im:message.send_as_user`** (以用户身份发送消息) — the second one's
  separator is a **dot**, where the ops notes and r2 both wrote
  `im:message:send_as_user`. In the console that error shows up only as "no such
  permission", which is why it gets its own line. Neither is in the granted set
  and neither has ever been requested; bot-identity sending has never been
  exercised. Adding a scope is: enable it in the console → publish a version →
  re-run OAuth. On this app that round trip completed the same day with no
  approval wait, though whether that generalizes is unknown (the requesting
  account was the app's creator).
- **What the recipient sees is undocumented.** The send response carries
  `sender.sender_type`, whose values include `app` and `user`, but the
  documentation **does not say** which one appears when sending with a user token
  plus `im:message.send_as_user` — and a community report claims it stays `app`.
  So this adapter declares `identityMarking: 'unknown'`, the UI treats it as
  `marked` (§9.5), and P4's first task is turning it into `none` or `marked` with
  one real send.
- **Events.** Event subscription has never been enabled on this app; neither the
  webhook nor the WebSocket long-connection lane has ever been run against it.
  The documented boundaries are: the long connection **needs no public URL**,
  is **enterprise-self-built-apps only**, allows **at most 50 connections per
  app**, pushes in **cluster mode without broadcast** (with several clients, each
  event reaches exactly one at random), requires an HTTP 200 within **3 seconds**,
  and delivers **at-least-once** (retries at 15 s / 5 min / 1 h / 6 h, at most 4,
  duplicates possible even after success). §6.4 re-argues push as a first-class
  receive mode from exactly those facts. A separate community report claims **Lark
  International's console does not offer the long connection at all** (webhook
  only) — not vendor-confirmed, but a precondition for P1, so it is listed in §20.
- **Authorization prerequisites.** The console needs all three of: the redirect
  URL registered, the scopes granted, and a **published version**. A missing one
  fails the *consent page* rather than the API call — a confusing failure mode
  worth spelling out in the connect wizard's error text.
- **Redirect URI.** Lark's console requires the redirect URL to be *registered*,
  so the loopback port is necessarily **fixed** — unlike Google, which accepts
  any loopback port and lets `src/gmail-sync.js` bind an ephemeral one. A fixed
  port is a machine-global name; §12.4 says what the flow does about that.
  Registering a dedicated URL (decision 4) resolves VibeSpace-vs-ops-tooling and
  **nothing else**.

### 12.2 Gmail

**Proven in-tree:** read-only OAuth through our own loopback flow (consent URL,
hands-free completion for same-machine browsers, paste-back for remote ones),
preset clients resolved from the instance's configured OAuth client list,
incremental `history.list` with reseed-on-404 and per-message 404 tolerance, and
tokens encrypted at rest.

**New for channels:**

- **Threads as conversations** (`threadId`), with an inclusion query so a mailbox
  does not become forty thousand conversations.
- **Send** needs `gmail.send`; label manipulation would need `gmail.modify`. Both
  are sensitive scopes, and the refresh-token lifetime depends on the OAuth
  client's verification status — an unverified/testing client expires refresh
  tokens after **7 days**, which is the pain the existing Gmail mounts already
  live with. Adding `gmail.send` to a *shared preset* client re-consents
  everything that uses that preset (decision 5).
- **Threading on send:** `threadId` plus `In-Reply-To` / `References` taken from
  the record's `Message-ID`.
- **On send the recipient sees the user — but the raw headers do not.** A message
  sent through the Gmail API carries an extra `Received:` header naming
  `gmailapi.google.com`, which a message sent from the web client does not. The
  recipient's mail UI shows no difference at all (no badge, no "via"), but "show
  original" does. Hence `identityMarking: 'marked'` with
  `identityMarkingWhere: 'raw-headers'` (§9.5) — the answer to the owner's "verify
  which are visible": **indistinguishable in the UI, distinguishable in the raw
  data**. `X-Mailer` / `User-Agent` are optional headers neither path is required
  to add, so they are not the tell.
- **Push is an optional upgrade whose cost is stated, no longer "not on the
  roadmap"** (r3/Q3(c) changes r2's wording here). `users.watch` + Cloud Pub/Sub
  means a topic and an IAM grant, and the watch **expires silently after 7 days**
  and stops without a sound if one renewal is missed (hence a daily renewal job).
  But two things make it a better fit than Lark's long connection: a Pub/Sub
  subscription can be **pulled**, so it needs no public inbound endpoint either;
  and each instance can hold **its own subscription**, so "is this push lane mine
  alone" is here a fact that can be **configured** rather than a random race. The
  default stays polling (one request per tick when nothing changed), with push
  behind a switch that is off by default (decision 20).

### 12.3 Agents (built-in)

A facade over Channels v1: conversations = agent sessions; reach = `msg-acl`
(**not** `channel-acl` — the internal question already has an answer, and a
second one would be the twin); send = `deliverToConversation`; policy default =
**direct**, per the interaction record. Non-removable in the adapter list, and
its "poll" is a no-op because its live messages already arrive through the
existing lanes.

### 12.4 `src/oauth-loopback.js` is dual-mode, and the fixed mode is a machine-global name

The extracted module has **two** modes, because the two vendors are not the same
shape. §2 compresses this to one line; the line hides a decision:

| | loopback port | why |
|---|---|---|
| Gmail | **ephemeral** — `listen(0, '127.0.0.1')`, the port read back from `server.address()` | Google accepts any loopback port; this is exactly what `src/gmail-sync.js` does today |
| Lark | **fixed**, and registered in the app console | the platform only redirects to a URL registered ahead of time |

A fixed port is precisely the class of name `scripts/ci.mjs`'s
`machineGlobalFixtures` and the heavy tier's `/tmp` lock exist to police — this
machine runs a systemd production service beside many development checkouts.
Two instances running a Lark consent flow at once means the **loser** gets an
opaque `EADDRINUSE` from `listen()`, *after* the user has already been sent to a
consent page, and the port holder receives the other instance's authorization
code. Decision 4 does not fix this; registration is about a different collision.
So the module:

- binds the fixed port **only for the duration of one flow**, never holds it
  between flows, and releases it on completion, cancel and timeout alike;
- turns `EADDRINUSE` into a **named refusal** — *"another VibeSpace or tool is
  running a Lark consent flow on port N; finish or cancel it, or use
  paste-back"* — and falls straight through to the **paste-back path**, which
  needs no local port at all (the user pastes back the redirect URL their
  browser could not reach). Remote-browser users already take that path, so it
  is not a new surface, it is the existing one made reachable earlier;
- carries the `state` CSRF check over **verbatim** from *both* places
  `src/gmail-sync.js` performs it — the loopback request handler and
  `forwardCallback` — and the suite pins both. An extraction that dropped it
  would turn a fixed, publicly known loopback port into a code-injection target
  for any local process, and the ephemeral-port original is far more forgiving
  about exactly this, which is why the risk arrives *with* the extraction rather
  than being inherited by it.

`test-oauth-loopback` therefore has a leg that **pre-binds the port** and
asserts the named refusal plus the paste-back fallback, and a leg replaying a
callback with a wrong `state` against both modes.

### 12.5 Local-client adapters (WhatsApp / WeChat) — an adapter class, not two adapters

r3/Q3(b) asks for this class to be **modelled**. What separates it from Lark and
Gmail is not cadence but **where the evidence comes from**: there is no vendor API
we may call, only an official client running on some machine and whatever it
writes down or draws. Hence `receive: 'scan'`, plus a second question — scan
**what**:

| `scanSource` | Reads | Sends | Reality |
|---|---|---|---|
| `'store'` | The local store the client wrote, incrementally with a cursor, optionally with an fs.watch for change notification | Through a protocol library, or falls back to `'ui'` | Only holds where that store is **readable at all** |
| `'ui'` | What the client **rendered**, driven by an agent-browser profile (`docs/design-agent-browser-v2.md`: profile = user-data-dir + provider + fingerprint seed + proxy, plus a live view VibeSpace owns) | agent-browser typing into the client's own composer | Sees only what is on screen, so history is "as far as it will scroll" — `history: 'none'` or `'page'` |

The two concrete platforms land in **different** cells, and that difference is the
risk statement the owner asked for:

- **WhatsApp.** The official Web client inside an agent-browser profile is
  `scanSource: 'ui'`, and sending is typing into its own composer — identity-wise
  that is the user (`identityMarking: 'none'`), because the thing sending really
  is that logged-in client. The other route is a protocol library (whatsmeow /
  Baileys): reverse-engineered **unofficial clients**, and unofficial clients are
  explicitly prohibited by WhatsApp's terms; public reporting has bans landing on
  low-volume, reply-only, otherwise legitimate use, and the compliant alternative
  is the official Business Cloud API through a certified provider (bot identity,
  hence `identityMarking: 'marked'`). ⇒ the protocol-library route is
  `tosRisk: 'prohibited'`, not offered by default (fence 13, decision 19).
- **WeChat.** The desktop store is SQLCipher/WCDB-encrypted and the key exists
  only in the **running client's process memory** — which is where every public
  tool extracts it from. **Reading another process's memory is not something this
  product does** (fence 13), so WeChat's `scanSource: 'store'` route **does not
  exist**; only `'ui'` remains.

**Three properties the class shares**, all of which fall straight into machinery
that already exists:

1. **Latency is a number drawn on the conversation row.** `freshnessClaim`
   answers "last scanned <t> ago" for `scan`, and the AssignFilter panel says it
   before the user hands that lane a job. A lane that scans every five minutes is
   honest for on-call triage and dishonest for live customer chat — the product's
   job is to make that difference visible **before** the assignment, not after.
2. **The credential is not a token, it is a logged-in client.** So `auth.state()`
   answers "is the client in that profile still logged in", and `needs-reauth`
   means "open the live view and scan the code again", not an OAuth round trip.
3. **It is the first real use case for adapters on a paired device** (§14): the
   adapter has to run on whichever machine the client runs on. The interface
   already takes a machine handle, so that is wiring rather than a rewrite — but
   it is why P6 only makes sense once that work is real.

**Scheduling and gating:** the interface carries every slot this class needs from
P0 (`scan` / `scanSource` / `scanLatency` / `convCaps` / `tosRisk`), and the fake
adapter really runs a scan mode, so the lane is inside
`test-channels-lane-parity`'s coverage from day one. The WhatsApp and WeChat
adapters themselves are **P6**, gated on decision 19 and on the agent-browser
system landing.

---

## 13. Secrets, expiry, failure

- Tokens encrypted under `data/.channels-key` (0600), never logged, never in
  argv, redacted through one `publicView()`. The encryption primitive already
  exists once (in `MountManager`); this design proposes extracting it to
  `src/secret-box.js` (SHARED) in P1 so channels does not create a third copy,
  with mounts migrating opportunistically behind a parity test. **If the
  extraction slips, the twin is NAMED** in `kb-file-structure.md` and gets a
  standing-sweep entry — an unnamed twin is how this codebase gets bitten.
- **Auth state is three-valued and honest:** `connected` / `needs-reauth` (with
  the expiry instant and a countdown) / `unknown` when the token record cannot be
  read. Never optimistic. The Adapters row renders exactly this.
- **Failure reaches the user.** N consecutive failed passes (default 3) turns the
  row amber and files one "For you" item naming the adapter and the vendor's own
  error text; recovery **retracts** it. A `rate-limited` backoff shows as a
  countdown, not an error.

---

## 14. What is deliberately not in v1, and where it lands

| Deferred | Why | Landing place |
|---|---|---|
| Plugin-contributed adapters | The manifest has no adapter contribution point; the sandbox would need net+fs grants; and the receive path must run beside the store and the spend guard. Third-party adapters are the right *eventual* home | `contributes.channelAdapters`, over the same `src/channels` interface, so the registry never forks. **The key is not reserved today**: `RESERVED_CONTRIBUTIONS` in `src/plugin-manifest.js` is `['keybindings','panels','viewers','commands','menus','statusChips','backends']`, and only keys *in that list* produce the "reserved for a later phase — ignored" warning — anything else is silently discarded when `m.contributes` is rebuilt to a fixed shape, so a plugin author following this row would get **no signal at all**. **P0 adds the one word**, plus the expected-set update in `scripts/test-plugin-loader.mjs`. A declared-but-inert slot is the same failure this document argues against for `SPEND_REASONS`; the difference is that here the slot costs one array entry and buys an honest warning |
| Adapters on a paired device | Credentials and the store live here | The interface already takes a machine handle; v1 passes `local`. `hostId` is a parameter, never a branch |
| ~~Live event lanes~~ **promoted to P1** (r3/Q3(a)) | No longer deferred: the owner asked for real-time push and §6.4 re-argues it from the evidence. The one gate left is enabling event subscription in the Lark console | `src/channels/live/<kind>.js`; content or cursor kick decided by `pushExclusivity` |
| Local-client adapters (WhatsApp / WeChat) | The interface models them from P0 (`scan` / `scanSource` / `tosRisk` / `convCaps`), but the adapters need a logged-in official client, an agent-browser profile, and one named decision about terms risk | **P6**, §12.5; gated on decision 19 and the agent-browser system |
| WhatsApp sending via a protocol library | Unofficial clients are prohibited by the platform's terms, and bans land on ordinary use (fence 13) | Forever behind `tosRisk: 'prohibited'`; the compliant route is the official Business Cloud API (bot identity) |
| HTML mail rendering | XSS surface; plain text is honest and sufficient for triage | The published-pages sandboxed-iframe pattern |
| Attachment auto-fetch | Bandwidth, storage, and a second authorized request per item | `caps.attachments: 'fetch'` + an explicit user/agent action with size caps |
| Read receipts / typing / reactions | Not in the interaction design | `caps` rows already reserved |

---

## 15. Debt this creates, and how it is gated

- **A second OAuth loopback flow**, unless `src/oauth-loopback.js` actually
  absorbs the Gmail-mount one. If it does not, the twin is named in
  `kb-file-structure.md` with a standing-sweep entry.
- **A second encryption-at-rest helper**, unless `src/secret-box.js` lands. Same
  treatment.
- **A second reachability vocabulary** (`channel-acl` beside `msg-acl`) — this
  one is *intended* (two different questions), and the guard is that they share
  the ordering and the widening law by import, with a suite driving both over the
  same widening matrix.
- **A new store family** under `data/channels/`. Its retention, its archive path
  and its flush-on-exit are part of P0, not a follow-up: the atomic-write and
  archive-never-destroy laws apply from the first commit.
- **A new egress surface.** `test-channels-egress` exists precisely so the third
  vendor host cannot arrive without a decision.

---

## 16. Test gates

Every phase ships its gate in the same commit. Suite names, tiers, and the
**negative control** that proves each gate can fail:

| Suite | Tier | What it pins | Negative control |
|---|---|---|---|
| `test-channel-filter` | fast | matcher truth table per rule kind; `any`/`every`; the estimator's window and its `sampled`/`truncated` honesty; the `why` strings | a rule matching everything must report `totalPerDay === matchedPerDay`; a corpus shorter than the window must set `truncated` |
| `test-channel-acl` | fast | default-hidden; MAX over grants; widening-only; request → exactly one grant; uniform not-found; every grant carries an `origin` | a group grant must not be narrowed by an individual entry; approving a request must leave the group default byte-identical; **a user grant plus an assignment grant on the same (principal, scope), assignment removed ⇒ the user grant is byte-identical** |
| `test-channel-outbox` | fast | the state machine (every transition and every forbidden one); guardrails stack and can only tighten; fail-closed on unknown policy; `unknown` never auto-retries | a patched copy with the guardrail check removed must go red; a direct-send policy with a link must still review |
| `test-channel-record` | fast | normalization incl. mention-placeholder resolution; the injection-marker strip | a body containing our own frame markers must come out inert |
| `test-channel-store` | fast | atomic index; append-only logs; dedup on replayed pages; cursor advances only on a complete pass; retention floor ≥ 7 days; **two concurrent passes through `index.update()` both land** (§5.1) | a pass reporting `complete:false` must leave the cursor unchanged; a patched copy doing read-modify-write around `writeJsonAtomic` must **lose** one pass's anchor advance |
| `test-channel-adapter-contract` | fast | the fake adapter drives every declared capability; an undeclared one throws; typed errors; **the grep census that no call site branches on `kind`** | a synthetic adapter branching on its own kind in a call site must fail the census |
| `test-channel-caps` | fast | both axes of the record; `convCaps` three-valued; **a control exists only when `caps` AND `convCaps` agree**, and `unknown` always renders as not-offered-with-a-reason; `convCaps.sendAs` ⊆ `caps.sendAs`; `freshnessClaim`'s wording per lane; `identityWarning` speaks for `unknown` exactly as for `marked` | a synthetic adapter declaring `sendAs:['user']` that still offers the control on a conversation whose `convCaps.sendAs === []` must go red; an adapter returning a `convCaps` wider than `caps` must go red; `identityMarking:'unknown'` with no warning must go red |
| `test-channels-lane-parity` | fast | **one day of traffic driven through push / poll / scan ⇒ the same records, the same wake count, the same charges** (fence 12); the same message arriving once by push and once by poll collapses to one (dedup on the message id); event replays dedup on `event_id` | a push-lane copy that **bypasses the coalescing window** must wake more on the same burst; a copy that acks **before** durability must lose records at the injected crash point |
| `test-channels-identity` | fast | no sender honesty line by default; `identityMarking` drives the approval-card warning and the receipt fields; the audit line carries `draftedBy`/`approvedBy`/`sentAs`/`identityMarking` and **never leaves the instance**; on a `sendAs: []` conversation `reply` returns `send-not-available` and **creates no proposal** | a copy with the honesty line defaulted ON must go red (r2's decision 17 is this leg's negative control); a `marked` channel whose approval card carries no warning must go red; a proposal created on a `sendAs: []` conversation must go red |
| `test-channels-egress` | fast | every constructed outbound request comes either from the adapter declaring its host or from an allowlisted `(file, host)` pair **with a reason** — seeded with `src/gmail-sync.js` and `src/mounts.js` (§3.1) | a scratch file with an undeclared host must go red; a **dead allowlist entry** (file moved or renamed) must go red too |
| `test-oauth-loopback` | fast | both modes (§12.4): ephemeral bind for Gmail, fixed bind for Lark; `state` rejection on the request handler **and** on paste-back; the port released on completion/cancel/timeout | a **pre-bound** fixed port must produce the named refusal and the paste-back fallback, never an opaque `EADDRINUSE`; a callback with a wrong `state` must be rejected in both modes |
| `test-channels-lark-shape` | fast | recorded-fixture normalization: `next_page_token` paging *to the anchor*, `@_user_N` placeholder resolution against the record's own `mentions`, typed errors | a fixture whose anchor lies on the **second** page must be paged into, not stopped at page one |
| `test-plugin-loader` (existing) | fast | `channelAdapters` in `RESERVED_CONTRIBUTIONS` ⇒ the "reserved for a later phase — ignored" warning actually fires (§14) | its expected-set assertion goes red if the word is added without updating the suite — which is the point |
| `test-channels-agent-cli` | fast | CLI verbs against a stub server; `reply` proposes and never sends; invisible = uniform error | a stub returning a conversation the ACL hid must still produce the uniform error |
| `test-spend-paths` (existing) | fast | its per-site census must see the new producer, wired, with the declared reason | already carries its own controls |
| `test-channels-engine` | heavy | real worktree server + fake adapter: burst-day paging, backoff, single-flight, failure surfacing **and retraction**, digest batching, wake authorization and hold release | a pre-fix copy using a fixed-window fetch must lose messages on the burst-day fixture |
| `test-channels-push` | heavy | real worktree server + a **fake push server**: ack after durability (inject a crash between ack and processing — the record must still be there); heartbeat silence ⇒ `state` leaves `live` **and** the poll cadence returns to fast immediately; `stop()` terminal for an arm in flight; a lane claiming `exclusive` while the fixture withholds some events ⇒ `missRate` crosses the threshold ⇒ **auto-demotion to kick with its reason stated** | a lane that **lies about being `active`** (pre-fix copy) must turn the poll fallback off and lose messages; a copy that never demotes must lose messages forever on the withholding fixture |
| `test-channels-e2e` | heavy | headless chrome: rail badge, panel chips, conversation window, inline approval card → send → receipt, filter editor live estimate | the estimate must change when a rule is added, and a review-required channel must not offer "may send" |

Fixture hygiene applies from the first commit, because these are live incidents:
no fixed `/tmp` path and no fixed port (use `scripts/scratch.mjs`); any suite
that spawns a server **names its HOME**; every child process is killed on exit
*and* on timeout (the runner's SIGKILL reparents survivors to systemd and they
hold inotify instances machine-wide); a suite that must touch a real home is a
declared, paid-for exception. **No suite makes a vendor call** — adapters are
exercised against recorded fixtures and the fake adapter.

---

## 17. Critique log — the r2 adversarial review

Eight findings were raised against the first draft. Each was checked against the
tree at `7f13e7c7` before anything was changed. Seven were correct and are fixed
above; one was half-correct and the half that was wrong is recorded here rather
than acted on, because a design that quietly accepts a wrong correction is as
unreliable as one that ignores a right one.

| # | Finding | Verdict | What changed |
|---|---|---|---|
| 1 | Two adapter poll loops read-modify-write one `index.json`; overlapping passes clobber each other's cursor advances and unread counts | **Confirmed.** §6.2 mandates a loop per adapter with single-flight declared only *per* adapter, while §5 put every mutable per-conversation fact in one whole-file atomic JSON written "at pass end". `writeJsonAtomic` is atomic at the fs layer; the read-modify-write around it is not. A clobbered *anchor* advance skips messages | New **§5.1** names one in-memory owner in `src/server/channels-engine.js` with a serialized `index.update(fn)` and a coalesced flush (the `JobManager` / `SessionStatusManager` shape); §5 invariants 3–4 rewritten; §6.2 says single-flight-per-adapter is not mutual exclusion; §2 gains a third load-bearing rule; `test-channel-store` gains a two-concurrent-passes leg with a read-modify-write negative control. Sharding was considered and rejected in §5.1 — the rotation counter is keyed by *group*, which spans adapters |
| 2 | `test-channels-egress` as specified is red on its first commit: `src/gmail-sync.js` and `src/mounts.js` already construct requests to those hosts | **Confirmed.** `src/gmail-sync.js` builds `oauth2.googleapis.com/token`, the `gmail.readonly` scope URL and `gmail.googleapis.com/gmail/v1/users/me`; `src/mounts.js` holds `GRAPH_BASE`. A mandatory gate that fails on a legitimate pre-existing surface gets relaxed by whoever hits it first | §3.1 restates the census as an allowlist keyed by `(file, host pattern)` **with a reason**, seeded with those two files, plus the dead-entry check `test-vendor-whitelist`'s `ALLOW` already uses; §16's row updated with both controls |
| 3 | Lark's fixed loopback port is a machine-global name; decision 4 only diagnoses the *registration* collision, not two instances on one box | **Confirmed.** Gmail's flow binds `listen(0, '127.0.0.1')`; Lark's must be registered, hence fixed. The loser gets an opaque `EADDRINUSE` *after* the consent page, and the port holder receives the other instance's code | New **§12.4**: the module is explicitly dual-mode; the fixed port is bound only for a flow; `EADDRINUSE` becomes a named refusal falling through to paste-back (which needs no port); the `state` CSRF check is carried over verbatim from **both** places `gmail-sync` performs it and pinned. §12.1 and decision 4 corrected; `test-oauth-loopback` gains a pre-bound-port leg and a wrong-`state` leg, and now has a row in §16 |
| 4 | The assignment-derived grant collides with a user-made grant on the same `(principal, scope)`; un-assigning silently revokes the user's grant — narrowing, inside a widening-only model | **Confirmed.** The §8 grant shape is keyed by `(principal, scope)` and §7.3 said "the grant is removed with the assignment" | Grants gain `origin: 'user'\|'assignment'\|'request'`; `effective()` still MAXes so the accessor is unchanged; un-assigning deletes only the `origin:'assignment'` row. §7.3 and §8 rewritten; `test-channel-acl` gains the mirror control (user grant byte-identical after the assignment is removed) |
| 5 | "One pointer item per pending proposal" is not expressible in `UserTodoManager` | **Confirmed, and the direction was wrong too.** `add()` has a closed parameter set; it dedups on `(sessionKey, text)` across all statuses (re-filing a resolved item reopens the same id); it throws past `MAX_OPEN_PER_SESSION = 20`. And retraction needs *proposal → item*, which nothing persisted | §9.2 rewritten to **one pointer per conversation** with count-free `text` (so dedup-by-text is the wanted idempotence), the count in `detail` (which `add()` updates in place), the returned id persisted as `pendingTodoId` on the **conversation**, retraction only for ids this producer wrote, and a stated degrade when the cap throws. The per-proposal alternative and its cost are recorded in decision 7 |
| 6 | `contributes.channelAdapters` is claimed to be "a reserved contribution key today" and is not — and an unknown key is dropped with no warning | **Confirmed.** `RESERVED_CONTRIBUTIONS` is `['keybindings','panels','viewers','commands','menus','statusChips','backends']`; only keys in that list warn, and `m.contributes` is rebuilt to a fixed shape so anything else vanishes silently | §14's row corrected and P0 now adds the word plus the expected-set update in `scripts/test-plugin-loader.mjs`; §16 carries the row |
| 7 | Fence 3 cites an incident and a measurement that do not exist in this tree, and states the inverse of the repo's actual law | **Half confirmed.** The *law* criticism is right and is fixed: CLAUDE.md's rule is "no **sync** fs/exec; child processes/workers with timeouts only", so bounded async children are sanctioned (ssh-per-op, the `ps`/`lsof` rungs, discovery sweeps) — the draft implied the opposite. The *invented incident* claim is *wrong*: `inc-mtunmv3d-pmd6` (2026-09-10) is real, with 1.8 / 18.8 / **72.5 ms** per spawn measured at 45 MB / 543 MB / 1.5 GB parent RSS. It is absent from the tree because instance-local evidence is required to stay out of this public repo — grepping the public tree is the right check and yields the right *observation*, but "not in the tree" and "invented" are different claims, and this repo's own conventions (CLAUDE.md cites `inc-…` ids with no in-tree evidence file throughout) make the first one expected | §3.3 rewritten to state the written law first, then the fork-tax refinement as a *measured constraint on top of it*, with the incident id, the method, the RSS dependency, and an explicit note that the evidence file is instance-local. §20 gains item 12 saying the constants are not portable |
| 8 | `_railBadge('channels', unreadTotal)`, "which already exists", does not; the badge needs more wiring than listed | **Confirmed.** The helper is `_railSetBadge(id, val)`; badges are driven by a hardcoded ladder in `_railRefreshBadges()` and an explicit message-type list in `_railWireBadges()`, neither of which picks up a new id | §10.1 corrected: the right helper name and **six** registrations, with the note that this badge can ride the broadcast digest instead of adding a fetch to the ladder |

Two of the eight (1 and 3) were latent *money-and-correctness* defects rather
than documentation slips, and both share a shape worth naming: **a guarantee
stated at the wrong layer.** "Atomic write" is a filesystem property being asked
to stand in for mutual exclusion; "registered redirect URL" is a vendor property
being asked to stand in for a unique local name. In both cases the fix is to
name the thing that actually holds the guarantee — one owner, one flow-scoped
bind — rather than to strengthen the property that never could.

**r3 is not a review, it is a change of direction**, so it does not join the table
above. Each of the owner's two instructions overturned one of this document's own
conclusions, and the two share a shape worth writing down: **an absolute rule
written for safety, whose reason only holds under one configuration, is a default
being enforced as a law.** §6.4's "a live lane may never carry content" was really
about cluster mode, and cluster mode only bites when **several instances share one
app credential** — so the right artefact was never the prohibition, it was the
condition, plus a claim the product can measure and retract by itself. Decision
17's "append `drafted by <agent>` by default on external channels" put a
disclosure inside the message **somebody else** reads, when the person who needs
to know who the other side will see is **the one pressing approve** — so the right
artefact was never the appended text, it was a warning at the moment of
authorization. Neither change is "more conservative" or "more aggressive": both
are **saying the sentence to the party it is owed to**.

---

## 18. Phases, rounds, calendar

One **round** ≈ 1 h implementer + ~20 min adversarial verify (measured
2026-09-10 across 32 workflows / 130 agents). Calendar at **2 rounds/day**.
Ranges are honest: the low end assumes one-round convergence, the high end
assumes the module needs the extra rounds that the measured distribution says
about a third of them do.

### P0 — store, index owner, adapter interface, fake adapter, panel skeleton — **9–11 rounds (4.5–5.5 days)**

`src/channel-store.js` (durable primitives), `src/channel-record.js`,
**`src/channel-caps.js` (both axes, `convCaps`, `freshnessClaim`,
`identityWarning`)**, `src/channels/index.js` + the fake adapter (**which really
runs all three receive modes**), a `src/server/channels-engine.js` skeleton
(scheduler, single flight, broadcast) carrying **the serialized index owner of
§5.1 from the first commit**, `src/routes/channels.js`, the six rail
registrations (§10.1), the panel list (**with freshness chips**) and an empty
conversation window. Also the one-word `channelAdapters` entry in
`RESERVED_CONTRIBUTIONS` with its suite update (§14). Gates:
`test-channel-store` (including the two-concurrent-passes leg and its
read-modify-write negative control), `test-channel-adapter-contract`,
`test-channel-caps`, `test-channel-record`, `test-plugin-loader`.
**Exit:** the fake adapter's conversations appear in the panel, open in a window,
survive a restart, sync across two clients, two simultaneous passes both advance
their cursors, and **a read-only conversation draws no send control at all**.
(r3: +2 rounds — the two-axis capability record, `convCaps`, and the fake
adapter's scan / push modes.)

### P1 — Lark read + Gmail read + **the push lanes** — **13–15 rounds (6.5–7.5 days)**

`src/oauth-loopback.js` **dual-mode** (§12.4: ephemeral + fixed, port held only
for the flow, named `EADDRINUSE` refusal, paste-back fallback, both `state`
checks carried over verbatim), `src/channels/lark.js`, `src/channels/gmail.js`,
the adapter panel (connect / re-auth countdown / tracked pickers / inclusion
query), failure surfacing + retraction, the `src/secret-box.js` extraction, and
the egress allowlist **seeded** with the two pre-existing files (§3.1). **Plus
the push half (r3/Q3(a))**: `src/channels/live/lark.js` (the official SDK's long
connection, ack after durability, heartbeat liveness, `stop()` terminal for an arm
in flight), the exclusivity **claim + measurement + auto-demotion**
(`push.missRate`), the adapter row stating the lane's state and its demotion
reason, and `src/channels/live/gmail.js` (Pub/Sub pull subscription) behind a
switch that is off by default.
Gates: `test-oauth-loopback`, `test-channels-lark-shape` (recorded fixtures),
`test-channels-egress`, `test-channels-engine` (burst-day paging),
**`test-channels-push`**.
**Exit:** real conversations from both platforms, tracked opt-in, correct on a
burst day, honest auth states, zero secrets in any response, a second instance's
consent flow refused by name rather than by stack trace, **and a push lane that
claimed exclusivity without having it demotes itself and says why**.
*Owner-blocked:* the Lark redirect-URI registration (decision 4) and enabling
event subscription in the console (decision 3).
(r3: +4 rounds — push transport, liveness, ack semantics, exclusivity measurement
and demotion, plus Gmail's Pub/Sub pull.)

### P2 — assign, filter, wake — **9–11 rounds (4.5–5.5 days)**

`src/channel-filter.js`, the assignment model, the estimate route, the filter
editor with live estimates plus the after-the-fact measurement, the wake path
with the new `SPEND_REASON`, digest batching, and the per-assignment pacing cap.
**Plus the push half (r3/Q3)**: the `channels.pushCoalesceSeconds` window
(fence 12), the per-lane latency claim stated honestly on the AssignFilter panel,
and the capability cap on `authority:'send'` (§7.3).
Gates: `test-channel-filter`, `test-spend-paths` (its census sees the producer),
`test-channels-engine` (wake, digest, hold release),
**`test-channels-lane-parity`**.
**Exit:** an assigned filtered conversation wakes an agent, the wake names its
reason, the money is bounded and attributed to the right slot, **and one day of
traffic produces the same wakes and the same money on all three lanes**.
(r3: +2 rounds — the coalescing window, the lane-parity leg, the latency claim.)

### P3 — outbox, approval, receipts — **9–12 rounds (4.5–6 days)**

`src/channel-policy.js`, the outbox store, inline approval cards + the Outbox
window (**with the identity row and the `identityMarking` warning**, §9.5), the
per-conversation "For you" pointer with its persisted `pendingTodoId` and
retraction (§9.2), receipts through `noWake` (**carrying `sentAs` /
`identityMarking` / `identityMarkingText`**), the audit log (**with `draftedBy` /
`approvedBy` / `sentAs`, and it never leaves the instance**),
`vibespace-channels` + its manual (**`reply` returns `send-not-available` and
creates no proposal on a `sendAs: []` conversation**), and the AgentReach panel
with requests and grant `origin` (§8).
Gates: `test-channel-outbox`, `test-channel-acl` (including the
user-grant-survives-un-assignment control), `test-channels-agent-cli`,
**`test-channels-identity`**, `test-channels-e2e`.
**Exit:** an agent proposes, the user approves / edits / rejects in either
surface, a receipt lands without waking anybody and says who the other side saw,
and the audit log is complete. Sending is exercised against the fake adapter and
the built-in Agents adapter only. (r3: +1 round — the identity row, the receipt
fields, the audit fields.)

### P4 — real external send — **7–9 rounds (3.5–4.5 days) + owner-blocked time**

Lark send (identity per decision 2, `uuid` idempotency), Gmail send (two-phase
draft, threading headers), `reconcile()` for unknown outcomes, guardrails end to
end, and the sender honesty line as an **off-by-default** switch (§9.5).
**This phase opens with the identity proof**: one real send settles Lark's
`identityMarking` from `unknown` into `none` or `marked` (§20 item 3), because
until then the approval card is saying "unverified".
Gates: the outbox suite extended with the idempotency and reconcile matrices;
`test-channels-identity` extended with a real `sentAs` receipt;
`test-channels-e2e` end-to-end against the fake adapter; plus one documented
manual shot at a real scratch chat before the switch is offered to anyone.
**Exit:** an approved proposal reaches the platform exactly once, or says
honestly that it does not know; and what the approval card says about who the
other side will see is **measured**, not guessed. (r3: +1 round — the identity
proof leg and the switch.)

### P5 — optional follow-ons (not scheduled)

Sandboxed HTML rendering (**2–3 rounds**), attachment fetch (**2**),
plugin-contributed adapters (**4–6**), adapters on a paired device (**4–6**).
(r3: live lanes moved up into P1, so they are no longer here.)

### P6 — local-client adapters (WhatsApp / WeChat) — **8–12 rounds (4–6 days), not scheduled, doubly gated**

§12.5. The `scanSource: 'ui'` route (agent-browser profile, login liveness,
cursored UI scanning, sending through the client's own composer), plus the
WhatsApp and WeChat adapters and their `tosRisk` acknowledgement dialog. **Gated
on two things**: decision 19 (whether the owner accepts the terms risk and the
UI-only constraint) and `docs/design-agent-browser-v2.md`'s profile system
landing. The interface side is in place from P0, so no line of this phase touches
the store, the filter, the spend path or the outbox.

**Totals:** P0–P4 = **47–58 rounds ≈ 23.5–29 working days** at 2 rounds/day, plus
owner-blocked time for the two scope round trips. (The r2 review added 2–3 rounds;
**r3 added 10**: the two-axis capability record +2 in P0, the push lanes +4 in P1,
coalescing and lane parity +2 in P2, the identity surface +1 in P3, the identity
proof +1 in P4.) P0–P2 alone — read-only channels with assignment, filtering and
**real-time push**, and no outbound path at all — is **31–37 rounds ≈
15.5–18.5 days**, and it is still a coherent shipping point: the panel is useful,
messages arrive live, no external message can leave the building, and the money is
already bounded.

---

## 19. Decisions for the owner

Each carries a recommendation. None is reversible for free later, which is why
they are here rather than in the code.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | **Adapters in-tree or plugins?** | in-tree modules / plugin packages | **In-tree for v1.** The OAuth flows, the secret store and the spend guard are all in-tree; an IPC boundary per message buys nothing at this scale. Keep the interface identical so third-party adapters become plugins in P5 without forking the registry |
| 2 | **Lark send identity** (updated by r3/Q4) | as the **user** (needs `im:message` + **`im:message.send_as_user`** — a dot, not a colon — a version publish and re-consent) / as a **bot** (needs the bot added to every chat) / both | **As the user, and the scope round trip stays in P4.** It is what the other side expects in an existing human group and it needs no change to anybody else's chats. Bot identity only as a fallback where user-send is refused — and bot sending is `identityMarking:'marked'`, so that fallback **must speak on the approval card**. **The new half:** whether user-identity send actually changes the `sender_type` the recipient sees is undocumented and contradicted by a community report, so until one real send in P4 proves it, this adapter declares `identityMarking:'unknown'` and is treated as `marked` (§9.5, §20 item 3). **Until the scope lands the UI says** "sending needs two more permissions on the Lark app, a version publish and one re-consent" rather than showing a greyed control |
| 3 | **Lark receive lane** (rewritten by r3/Q3(a)) | poll-only / poll + WebSocket **kick** / WebSocket **carrying content** + poll for reconciliation / webhook | **Push is first-class and ships in P1; content vs kick is decided by `pushExclusivity`; never the webhook.** The long connection needs no public URL, is self-built-apps only, allows 50 connections per app, wants a 3 s ack, and is **at-least-once with 4 retries** — so "push is unreliable" is not a reason. The real constraint is **cluster mode**: with several clients on one app credential each event reaches exactly one at random. That is a **configuration** condition, not a law of nature ⇒ carry content when exclusive (polling drops to a 15-minute reconciliation), kick only when shared or unknown (r2's behaviour, and the default). A public inbound endpoint buys nothing over the long connection |
| 4 | **Lark redirect URI** | reuse the ops tooling's registered loopback port / register a dedicated one for VibeSpace | **Register a dedicated one — and treat the port as machine-global regardless.** Registration resolves VibeSpace-vs-ops-tooling; it does **not** resolve two VibeSpace instances on one box (a production service beside a checkout), where the loser gets an opaque `EADDRINUSE` after the user is already at the consent page and the port holder receives its code. §12.4 binds only for the flow, refuses by name, and falls to paste-back. If the console accepts several redirect URLs per app, register ours *alongside* rather than displacing theirs (unverified — §20) |
| 5 | **Gmail OAuth client** | add `gmail.send` to the existing shared preset / register a client dedicated to channels | **Dedicated client for channels.** Adding a sensitive scope to a shared preset re-consents everything using it, and the verification status (hence the 7-day refresh-token behaviour) becomes one decision for two features. Read-only P1 may start on the existing preset |
| 6 | **What is tracked by default** | nothing until the user picks / all groups the user is in | **Nothing.** It is the privacy answer, the polling-cost answer, and it keeps the panel from becoming a mail client. The discover list makes opting in one click |
| 7 | **Approval surface of record** | new outbox store + a pointer item in "For you" / "For you" items only | **New store + one pointer item per CONVERSATION** (§9.2). A proposal has structure (target, body, why, edit, receipts) the todo store cannot hold; and `UserTodoManager` has a closed parameter set, dedups on `(sessionKey, text)` across all statuses and caps at 20 open per session, so *per-proposal* pointers are not expressible without a schema change to a store several producers share. Per-proposal badges are available for the cost of that change (`proposalId` field + dedup keyed on it + `todoItemId` on the proposal) — say so if you want them |
| 8 | **Do receipts wake the agent?** | never (stash for next turn) / always / per assignment | **Never by default, opt-in per assignment.** An approval lands minutes to hours later; waking for a receipt is a billed turn per approval |
| 9 | **Default policies + guardrails** | confirm the interaction record's defaults | **Confirm as recorded:** external = review, internal = direct; audit ON, links/attachments force review ON, off-hours OFF until a timezone is configured (then the window is a setting) |
| 10 | **Spend ceiling shape** | share the existing per-identity caps / a separate channel budget | **Share.** One ceiling per credential slot is the whole point of the authorizer; add a per-assignment daily wake cap as *pacing* only |
| 11 | **Agent CLI** | new `vibespace-channels` / extend `vibespace-msg` | **New CLI.** `send` delivers, `reply` proposes — one verb with two authorization semantics is the twin this codebase punishes |
| 12 | **Message rendering** | plain text in v1 / sanitized HTML now | **Plain text.** It removes an XSS class entirely; rich rendering lands later in the sandboxed-iframe pattern |
| 13 | **Attachments** | metadata + explicit fetch / auto-download | **Metadata + explicit fetch**, with size caps |
| 14 | **Retention numbers** | pick them | **90 days or 5,000 records per conversation, whichever is smaller, floor 7 days**; the audit log archived (never deleted) on a dated roll |
| 15 | **Fleet scope** | local-only v1 / adapters on paired devices | **Local-only v1**, with `hostId` already a parameter so the later move is not a rewrite |
| 16 | **Does assignment imply visibility?** | yes, written as an explicit grant / no, the user must also grant reach | **Yes, as an explicit grant.** Two steps for one obviously-intended thing is how a permission model gets bypassed; writing it as a real grant keeps the reach panel truthful |
| 17 | **Sender honesty line — REVERSED by the owner (r3/Q4)** | always append "drafted by \<agent\>" / per-channel toggle **default ON** / per-channel toggle **default OFF** / never | ~~Per-channel toggle, default ON for external~~ ⇒ **default OFF, kept as a per-channel option.** The default is **send as the user with nothing added to the body**, on every channel that allows it. What replaces it is not silence: the `identityMarking` capability states who the other side will see at **the moment of authorization** (approval card / send affordance) and in **the receipt** (§9.5). The reason is that the sentence is owed to **the person pressing approve** and to the drafting agent, not to the recipient — and r2 put it inside the message the recipient reads, which both rewrites the user's own words and happens after the user has already decided. The audit log still records `draftedBy` |
| 18 | **Who decides a push lane is exclusive?** (new, r3/Q3(a)) | (a) the operator **asserts**, the product **measures** and **auto-demotes** on disagreement / (b) cursor kicks forever (r2) / (c) trust the assertion, never measure | **(a).** The platform never says how many other clients are connected, so exclusivity can only be asserted — but it is **measurable**: `push.missRate`, the fraction of records seen first by the reconciliation poll rather than by push, stays at 0 on a genuinely exclusive lane. Crossing the threshold (default 2 %, ≥ 20 samples) demotes to kick mode and states the reason on the adapter row. (c) is a prayer; (b) turns off the real-time push the owner asked for. The default is `unknown` ⇒ **asserting nothing gives you (b)** |
| 19 | **How far do local-client adapters (WhatsApp / WeChat) go?** (new, r3/Q3(b)) | (a) not at all / (b) **UI only**: the official client inside an agent-browser profile, scan what it renders, send through its own composer / (c) also protocol libraries (whatsmeow / Baileys) and reading the local store | **(b), explicitly excluding (c).** WeChat's local store key exists only in the **running client's process memory**, and reading another process's memory is not something this product does (fence 13); WhatsApp's protocol libraries are unofficial clients explicitly prohibited by the platform's terms, with bans landing on ordinary use. (b) rides the user's own already-logged-in official client, so identity is genuinely the user (`identityMarking:'none'`), and its cost is honest: it sees only what is on screen, latency is in minutes, and that number is **drawn on the conversation row**. The interface models the class from P0; the adapters are P6 |
| 20 | **Should Gmail push be on by default?** (new, r3/Q3(c)) | on by default / **available, off by default** / not at all | **Available, off by default.** Pub/Sub's pull subscription means it needs no public inbound endpoint either, and each instance can hold its own subscription, so exclusivity is easier to achieve than on Lark's long connection. But it costs a GCP topic, an IAM grant and a **daily renewal job** (the watch expires silently after 7 days and stops without a sound if one is missed), and what it buys is trading a poll that costs one request per tick when nothing changed for second-level latency. At mail's cadence that is a switch a user should turn on for their own situation, not a default |

---

## 20. What I could not verify

Stated plainly, because a design that hides its unknowns is a design that
discovers them in production:

1. **Lark send-as-user has never been exercised** on the existing app: neither
   scope (`im:message` + `im:message.send_as_user`) is granted, and whether
   granting them requires an approval wait is unknown (one prior scope change
   completed same-day, but the requesting account was the app's creator, so it may
   not generalize).
2. **Lark event subscription has never been enabled** on that app. Every
   constraint on the WS long connection (50 connections, cluster mode,
   self-built-apps only, the 3 s ack, at-least-once with 4 retries) is taken from
   the official documentation and listed in §6.4 — **but not one of them has been
   run against this tenant on this network.** P1's push half opens with that.
3. **The send endpoint accepts both token types, but "who the recipient sees" is
   undocumented.** The documentation explicitly says this endpoint accepts
   `tenant_access_token` or `user_access_token` and does carry a "send as the user"
   permission; it does **not** say whether `sender.sender_type` comes back (and
   renders) as `user` or `app` when the latter is used, and a community report
   claims it stays `app`. That uncertainty decides §9.5's `identityMarking` for
   Lark, which is why it is declared `unknown` and treated as `marked`, and why P4
   must begin by proving it.
4. **Gmail's handling of a self-issued `Message-ID`** on `messages.send` is
   undocumented in what I could reach, so the design deliberately does **not**
   rely on an `rfc822msgid:` lookup for reconciliation and uses the two-phase
   draft instead — whose own guarantee (that a sent draft is consumed) is likely
   but also unverified.
5. **The verification status of the existing preset OAuth client** — and hence
   whether refresh tokens live 7 days or indefinitely once `gmail.send` is added
   — I did not check; that is decision 5's real content.
6. **Vendor rate limits at the proposed cadence** for this tenant are not
   measured. The per-tick budget bounds our side, but the first real week should
   be watched.
7. **Bulk DM enumeration on Lark** is recorded as unreliable in the ops notes; I
   did not re-measure it, so the design routes around it (search plus explicit
   opt-in) rather than depending on it.
8. **Estimator accuracy against real traffic** is unmeasured — which is exactly
   why §7.2 makes the product measure it after the fact instead of trusting the
   prediction.
9. **Panel render cost** with a large history (thousands of records in one
   conversation) is unmeasured; the window paginates from the start for that
   reason, but the number should be taken in P0 rather than assumed.
10. **Whether "agent group rotation" maps exactly onto Task Groups** — the
    interaction record says "Ops 组 · 3 agent · 轮转", and Task Groups are the
    obvious carrier, but group membership is sessions-over-time, so the rotation
    semantics over a group whose members come and go need one round of thought in
    P2.
11. **Whether Lark's console accepts more than one registered redirect URL per
    app.** Decision 4 assumes it does, so VibeSpace's URL can sit *alongside* the
    ops tooling's rather than displacing it. If it does not, decision 4 becomes
    "a second app", which is a larger round trip.
12. **The fork-tax numbers are instance-local.** 1.8 / 18.8 / 72.5 ms at
    45 MB / 543 MB / 1.5 GB parent RSS were measured on the machines this runs
    on (`inc-mtunmv3d-pmd6`, 2026-09-10) with a harness that is not in this
    public repo. The *mechanism* — fork cost scaling with the parent's page
    tables — is general; the constants are not. Anyone reading §3.3 on different
    hardware should re-measure before quoting the number.
13. **`UserTodoManager`'s open cap is per session key** (20). One pointer per
    conversation makes exhaustion unlikely, but an agent holding proposals in
    more than twenty conversations at once is untested; §9.2 specifies the
    degrade (catch, log, rely on the rail badge) rather than assuming it cannot
    happen.
14. **That §5.1's serialized door is sufficient** is an argument, not a
    measurement: it holds because there is exactly one process and one owner. If
    the engine ever moves to a worker or to a paired device (§14), the door
    becomes a cross-process problem and the argument has to be re-made — which is
    why the invariant is written as "one owner", not "we use a mutex".
15. **Whether Lark International offers the long connection at all.** One
    community report says the International developer console does **not** expose
    it and only webhook mode is available — not vendor-confirmed and not
    reproduced here. It is a precondition for P1's push half: if true, §6.4 on an
    International tenant collapses to "poll, and never the webhook", and decision
    3's push half is unreachable there. **P1's first act should be confirming the
    option exists in the console.**
16. **Gmail's Pub/Sub pull subscription has not been exercised.** Decision 20
    rests on "a pull subscription means push needs no public inbound endpoint, and
    each instance can hold its own subscription" — Pub/Sub's documented shape, but
    none of it has been run against a real topic, including what the daily renewal
    job actually looks like when one renewal is missed.
17. **`push.missRate`'s threshold is uncalibrated.** 2 % over ≥ 20 samples is a
    starting point derived from "it should sit at 0 on a genuinely exclusive lane",
    not a measured number. The first week should watch it, and the demotion must be
    **visible** (adapter row plus a log line) so the calibration comes from data
    rather than from this paragraph.
18. **The WhatsApp and WeChat local-client shapes have not been touched at all.**
    §12.5 is an adapter **class** written from public material: the feasibility of
    UI scanning, how far history scrolls, how login liveness is judged, and how
    stable a real client is inside an agent-browser profile are all unmeasured.
    That is also why it is P6 rather than P5 — it owes a round of investigation,
    not a round of implementation.
19. **The cross-reference to `docs/design-agent-browser-v2.md` does not resolve
    today.** §12.5 and decision 19 depend on that design's profile system
    (user-data-dir + provider + fingerprint seed + proxy + live view), and at the
    time of this revision it lives on a separate branch and is not merged into this
    tree. Both references should be re-checked once it is — in particular whether
    "one long-lived logged-in official client per profile" is something its own
    model allows.

**Sources for the vendor facts introduced in r3** (public documentation, fetched
2026-09-10; nothing here was exercised against a real tenant — see items 2, 3,
15–18 above):

- Lark/Feishu long connection — 50 connections per app, cluster mode without
  broadcast, enterprise-self-built-apps only, no public URL:
  <https://open.larkoffice.com/document/server-side-sdk/python--sdk/handle-events>
- Lark/Feishu event delivery — 3 s HTTP 200 deadline, at-least-once, retries at
  15 s / 5 min / 1 h / 6 h up to 4 times, duplicates possible, dedup on
  `event_id`:
  <https://open.feishu.cn/document/server-docs/event-subscription-guide/overview>
- Lark/Feishu send message — accepts `tenant_access_token` or
  `user_access_token`; `sender.sender_type` ∈ {`app`, `user`}; user-identity
  sending needs `im:message` **and** `im:message.send_as_user`:
  <https://open.feishu.cn/document/server-docs/im-v1/message/create>
- Gmail push — `users.watch` + Cloud Pub/Sub, watch expires after 7 days and must
  be renewed:
  <https://developers.google.com/workspace/gmail/api/guides/push>
- Gmail API sends carry an extra `Received:` header naming `gmailapi.google.com`
  that web-client sends do not:
  <https://www.gmass.co/blog/gmail-vs-api-deliverability/>
- WhatsApp protocol libraries (whatsmeow / Baileys) are unofficial clients
  prohibited by the platform's terms, with bans reported on ordinary use:
  <https://github.com/tulir/whatsmeow/issues/810>
- WeChat desktop stores are SQLCipher/WCDB-encrypted with the key held in the
  running client's process memory — the class of tool fence 13 refuses to be:
  <https://github.com/BenDerPan/wechat-db-decrypt>
- Lark International's console reportedly does not expose the long connection
  (community report, not vendor-confirmed — §20 item 15):
  <https://github.com/openclaw/openclaw/issues/51663>
