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
its invariants; the ingest model (polling as the source of truth, live lanes as
cursor kicks); how a wake is authorized and charged; how the outbox makes
double-sending structurally impossible; the client registrations; the agent CLI
surface; the test gates; the phase plan.

**Deferred, with the seam left open:** plugin-contributed adapters, adapters
running on a paired device, rich HTML mail rendering, attachment auto-fetch,
Lark's event-subscription lane. Each has a named landing place (§14, §15).

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
| Conversation store (index, per-conversation logs, cursors, retention) | **SHARED** (fs+path only) | `src/channel-store.js` | `test-channel-store` (fast) |
| OAuth loopback consent flow | **SHARED** | `src/oauth-loopback.js` | `test-oauth-loopback` (fast) |
| Adapter interface + registry | **ORCH** | `src/channels/index.js` | `test-channel-adapter-contract` (fast, fake adapter) |
| Lark / Gmail / Agents adapters | **ORCH** | `src/channels/lark.js`, `gmail.js`, `agents.js` | contract suite + `test-channels-lark-shape` (fast, recorded fixtures) |
| Ingest engine (poll scheduler, backoff, per-tick budget, failure surfacing) | **ORCH** | `src/server/channels-engine.js` (`create(deps)` factory) | `test-channels-engine` (heavy) |
| Routes + broadcasts | **ORCH** | `src/routes/channels.js` | the route battery in `test-restore-smoke`, `test-channels-e2e` |
| Wiring stanza | **ORCH** | `src/server/channels-wiring.js`, one call from `server.js` | `test-architecture` size ratchet (server.js ≤ 2100 lines) |
| Panel, window, filter editor, approval cards | **CLIENT** | `src/lib/channels-panel.js`, `src/lib/channel-window.js`, `src/lib/channel-filter-editor.js` | `test-channels-e2e` (heavy, headless chrome) |
| Agent CLI | tracked static | `data/bin/vibespace-channels` + `docs/agent/channels-manual.md` | `test-channels-agent-cli` (fast) |

Two placements are load-bearing enough to state as rules:

- **An adapter never touches the store, the ACL, the policy or the spend
  guard.** It returns typed records and takes a send request. Everything it can
  do is in the interface in §4, and a capability it does not declare is a
  capability the product will not offer for it. This is the same discipline as
  `src/backend-caps.js`: *gate on the capability row, never on the adapter id* —
  with a grep census asserting no call site branches on a name.
- **The engine is ORCH and lives in exactly one `create(deps)` factory** under
  `src/server/`, like every subsystem since the 2.325 拆分. `server.js` gains a
  wiring stanza and nothing else.

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
   egress census**: `test-channels-egress` asserts that every outbound request
   constructed under `src/channels/` targets a host pattern declared in that
   adapter's record, and that no other file in the tree constructs one. A third
   vendor host cannot arrive without a decision. Same mechanic, different vendor
   set.
2. **Every wake is money.** A filter that matches 63 messages/day is 63 billed
   turns/day. The only thing that may open an unattended turn is
   `deliverToConversation`, and it already sits behind
   `src/spend-authorizer.js`. Channels adds one declared `SPEND_REASON` and
   passes it; it does **not** add a second budget, a second ledger, or a second
   identity derivation (§7.4). Its own per-assignment limits are **pacing**; the
   authorizer is the **money bound** — the distinction the seven-producer audit
   exists to preserve.
3. **Never block the event loop.** Adapters use `fetch()` with timeouts. There
   is **no shelling out per message**: at the 1.5 GB RSS these servers run at,
   `child_process.spawn()` costs ~72 ms of event loop per call (measured
   2026-09-10, the fork-tax incident). A poll loop that shelled out once per chat
   per tick would block the loop for seconds per minute. In-process HTTP is not
   an optimization here, it is the requirement.
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

---

## 4. The adapter interface

An adapter is built by a factory taking `(record, deps)`. It is **stateless with
respect to policy** and owns exactly three things: vendor authentication, vendor
pagination, and vendor message shape.

```js
// src/channels/<kind>.js  →  module.exports = { kind, caps, create }
{
  kind: 'lark',                       // registry key; never branched on downstream

  caps: {                             // DECLARED capabilities — the ONE gate
    listConversations: true,          // can enumerate what the credential can see
    history: 'page',                  // 'page' | 'since' | 'none'
    receive: 'poll',                  // 'poll' | 'push'  (push = a cursor KICK only, §6.4)
    sendAs: ['user'],                 // subset of ['user','bot'] it can actually do
    threading: 'reply-to',            // 'reply-to' | 'thread-id' | 'none'
    attachments: 'metadata',          // 'metadata' | 'fetch' | 'none'
    readReceipts: false,
    editSent: false,
    idempotency: 'key',               // 'key' | 'two-phase' | 'none'   (§9.4)
  },

  async auth.state()   -> { state:'connected'|'needs-reauth'|'unknown', expiresAt, scopes, why }
  async auth.begin()   -> { consentUrl, flowId }             // via src/oauth-loopback.js
  async auth.finish(flowId, code) -> { ok, record }

  async listConversations({ cursor, limit })
        -> { conversations: [ChannelConversation], cursor, complete }

  async history(convId, { anchor, limit })
        -> { records: [ChannelRecord], anchor, reachedAnchor, complete }

  async send(convId, { text, replyTo, idemKey })
        -> { ok, vendorMessageId, at } | { ok:false, code, retryable, detail }

  async reconcile(convId, { idemKey, sentAt })               // §9.4, unknown outcomes only
        -> { landed:true, vendorMessageId } | { landed:false } | { unknown:true }

  async fetchAttachment(convId, recordId, attId, { maxBytes })   // caps.attachments==='fetch'
        -> { path, bytes, mime } | { ok:false, code }
}
```

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
  census, the same shape as the `backend-caps` one.

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
                                consecutiveFailures
  index.json                    atomic JSON. Per conversation: id, adapterId, vendorId, title,
                                kind (dm|group|thread), participants summary, lastAt, unread,
                                tracked, anchor, assignment, filterId, policy, reachEntries[],
                                stats {hits7d, msgs7d}
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
3. **The cursor advances only after a complete pass,** and it is written at pass
   end — a crash mid-pass re-reads, it never skips. `complete: false` from an
   adapter means "do not advance".
4. **Retention is per conversation and bounded twice**: last N records or M days,
   whichever is smaller, with a **floor of 7 days** because the estimator is
   defined over the last 7 days. Trimming streams to a temp file and renames —
   never in place.
5. **`tracked` is opt-in.** An adapter can *see* far more than the panel should
   list: one authorized Lark user is routinely a member of dozens of chats
   (measured on a real account: about fifty), and a mailbox is unbounded. Nothing is ingested until the user marks a
   conversation tracked (or it matches an inclusion query, for Gmail). This is a
   privacy decision, a cost decision, and the thing that keeps the panel a panel
   instead of a mail client.
6. **A derived value never becomes a stored fact.** `unread`, `hits7d` and
   `msgs7d` are recomputed from the log and the read marker; they are cached in
   the index for render speed and are always re-derivable. The quota-model
   incidents (a stored `state` outliving the reading it described) are why this
   sentence is here.

---

## 6. The receive pipeline

### 6.1 Shape

```
adapter.history() ──► normalize (PURE) ──► store.append (dedup, atomic)
                                             │
                                             ├─► broadcast 'channels-updated'  (once per pass)
                                             │
                                             └─► for each ASSIGNED conversation:
                                                   channelFilter.matchRecord(filter, record)
                                                     └─ hit ─► assignment.route (agent | rotating group)
                                                                └─► wake decision (§7)
                                                                     ├─ wake   ─► spend authorize
                                                                     │             └─► deliverToConversation(source:'lark', kind:'notification')
                                                                     └─ digest ─► stash; one delivery per window
```

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
- never overlaps itself (single-flight per adapter) and never holds the loop: fs
  writes are async, every request has a timeout.

The cost is arithmetic this design owes the reader: fifty tracked Lark chats,
none hot, 5-minute cadence ⇒ ~10 requests/min. One hot assigned chat ⇒ +2/min. A
Gmail account is **one** `history.list` request per tick when nothing has
changed. That is why polling is the v1 answer (§6.4) rather than a public
webhook.

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

### 6.4 Live lanes: a kick, never a delivery

Lark's platform offers two ways to receive events in real time, and this is the
one place where a single architectural rule prevents a whole class of bugs:

> **A live lane may only invalidate a cursor. It may never carry content.**

When an event arrives ("chat X has a new message"), the engine marks X hot and
kicks the poll — waking the backoff *sleep*, not merely aborting a fetch (the
`opencode-events` lesson, where a lane that only aborted the fetch took 25 s to
go live). Dedup, ordering, retention, normalization and the filter all stay on
one path, which makes the live lane **optional and removable**. That matters
because of two facts:

- the **WebSocket long-connection** mode needs no public URL, but is limited to
  enterprise self-built apps, requires each event to be processed within 3 s,
  caps an app at 50 connections, and pushes in **cluster mode** — if two
  VibeSpace instances run the same app, each event goes to exactly one of them at
  random. As a content lane that is a silent message-loss machine across a fleet;
  as a cursor kick it is harmless, because the other instance polls anyway.
- the **HTTP webhook** mode needs a public URL, a verification token and an
  encrypt key. VibeSpace has `instance-url`/frp and could expose one, but
  exposing an inbound endpoint to gain nothing the WS lane does not already give
  is a bad trade. **Recommendation: never the webhook.**

Both are P5. v1 polls, and the polling path stays the source of truth forever.

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

- `authority: 'send'` is **capped by channel policy**: when the channel requires
  review the option is not selectable, and the stored value is clamped at read
  time too — a stored value the current policy forbids must not silently become a
  permission if the policy is later relaxed.
- Assigning to a **group** rotates round-robin over that group's live sessions,
  with the rotation state in the index. A rotation that finds no live session
  falls back to stash-for-next-turn — never to "wake them all".
- **Assignment implies reach.** Assigning conversation C to agent A writes an
  explicit ACL grant `visible` for (A, C) rather than creating an implicit
  special case, so "not visible = does not exist" stays literally true and the
  AgentReach panel shows exactly what is in effect. The grant is removed with the
  assignment.

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
           level }
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
from one store, so they cannot disagree. Plus a **pointer item** in the existing
"For you" inbox so the taskbar badge fires: one item per pending proposal,
naming the target and the agent, **retracted by this producer** (the
`setStatus(id, 'done', 'system')` path) the moment the proposal leaves
`awaiting-approval` by any route. An item that outlives its subject is the
login-expiry incident, and it is why the pointer carries the proposal id.

The card carries **why** — the alert / conversation / task that caused it — as a
structured reference the panel can link, not a sentence the agent wrote. Editing
in place sets `edited: true` and stores both bodies; the receipt says so.

### 9.3 What the agent gets back

```
{ proposalId, status: 'sent'|'rejected'|'edited'|'expired'|'failed',
  convId, adapterId, vendorMessageId, at,
  edited: bool, editedBy: 'user', reason }        // rejection/failure reason, verbatim
```

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
precisely the state that must never be read as "not sent".

---

## 10. The panel

### 10.1 Registrations (no new chrome primitives)

- **Rail:** one new item `channels` — an entry in `RAIL_ICONS`, `RAIL_TITLES`,
  `PANEL_TABS` and the rail's item list in `src/lib/sidebar-rail.js`, plus
  `_railBadge('channels', unreadTotal)`, which already exists.
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

`GET /api/channels` returns the index digest (adapters + conversations + chips) —
never message bodies. `GET /api/channels/:id/messages?before=&limit=` returns a
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

- **Sending.** `im:message:send_as_user` is *not* in the granted set and has
  never been requested; bot-identity sending has never been exercised. Adding a
  scope is: enable it in the console → publish a version → re-run OAuth. On this
  app that round trip completed the same day with no approval wait, though
  whether that generalizes is unknown (the requesting account was the app's
  creator).
- **Events.** Event subscription has never been enabled on this app; neither the
  webhook nor the WebSocket long-connection lane has ever been run against it.
  That is why v1 polls (§6.4).
- **Authorization prerequisites.** The console needs all three of: the redirect
  URL registered, the scopes granted, and a **published version**. A missing one
  fails the *consent page* rather than the API call — a confusing failure mode
  worth spelling out in the connect wizard's error text.
- **Redirect URI.** The existing app registers one fixed loopback port; sharing
  it with the ops tooling invites a collision (decision 4).

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
- **Push is not needed.** `users.watch` + Pub/Sub means provisioning a topic, IAM
  grants and a renewal job — the watch expires in 7 days and stops silently if a
  renewal is missed. Polling `history.list` is one request per tick when nothing
  changed. v1 polls; Pub/Sub is not on the roadmap.

### 12.3 Agents (built-in)

A facade over Channels v1: conversations = agent sessions; reach = `msg-acl`
(**not** `channel-acl` — the internal question already has an answer, and a
second one would be the twin); send = `deliverToConversation`; policy default =
**direct**, per the interaction record. Non-removable in the adapter list, and
its "poll" is a no-op because its live messages already arrive through the
existing lanes.

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
| Plugin-contributed adapters | The manifest has no adapter contribution point; the sandbox would need net+fs grants; and the receive path must run beside the store and the spend guard. Third-party adapters are the right *eventual* home | `contributes.channelAdapters` (a reserved contribution key today) over the same `src/channels` interface, so the registry never forks |
| Adapters on a paired device | Credentials and the store live here | The interface already takes a machine handle; v1 passes `local`. `hostId` is a parameter, never a branch |
| Live event lanes | §6.4 — a cursor kick, gated on an owner decision to enable event subscription | `src/channels/live/<kind>.js`, kicking the engine |
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
| `test-channel-acl` | fast | default-hidden; MAX over grants; widening-only; request → exactly one grant; uniform not-found | a group grant must not be narrowed by an individual entry; approving a request must leave the group default byte-identical |
| `test-channel-outbox` | fast | the state machine (every transition and every forbidden one); guardrails stack and can only tighten; fail-closed on unknown policy; `unknown` never auto-retries | a patched copy with the guardrail check removed must go red; a direct-send policy with a link must still review |
| `test-channel-record` | fast | normalization incl. mention-placeholder resolution; the injection-marker strip | a body containing our own frame markers must come out inert |
| `test-channel-store` | fast | atomic index; append-only logs; dedup on replayed pages; cursor advances only on a complete pass; retention floor ≥ 7 days | a pass reporting `complete:false` must leave the cursor unchanged |
| `test-channel-adapter-contract` | fast | the fake adapter drives every declared capability; an undeclared one throws; typed errors; **the grep census that no call site branches on `kind`** | a synthetic adapter branching on its own kind in a call site must fail the census |
| `test-channels-egress` | fast | every outbound request under `src/channels/` targets a declared host pattern, and no other file constructs one | a scratch file with an undeclared host must go red |
| `test-channels-agent-cli` | fast | CLI verbs against a stub server; `reply` proposes and never sends; invisible = uniform error | a stub returning a conversation the ACL hid must still produce the uniform error |
| `test-spend-paths` (existing) | fast | its per-site census must see the new producer, wired, with the declared reason | already carries its own controls |
| `test-channels-engine` | heavy | real worktree server + fake adapter: burst-day paging, backoff, single-flight, failure surfacing **and retraction**, digest batching, wake authorization and hold release | a pre-fix copy using a fixed-window fetch must lose messages on the burst-day fixture |
| `test-channels-e2e` | heavy | headless chrome: rail badge, panel chips, conversation window, inline approval card → send → receipt, filter editor live estimate | the estimate must change when a rule is added, and a review-required channel must not offer "may send" |

Fixture hygiene applies from the first commit, because these are live incidents:
no fixed `/tmp` path and no fixed port (use `scripts/scratch.mjs`); any suite
that spawns a server **names its HOME**; every child process is killed on exit
*and* on timeout (the runner's SIGKILL reparents survivors to systemd and they
hold inotify instances machine-wide); a suite that must touch a real home is a
declared, paid-for exception. **No suite makes a vendor call** — adapters are
exercised against recorded fixtures and the fake adapter.

---

## 17. Phases, rounds, calendar

One **round** ≈ 1 h implementer + ~20 min adversarial verify (measured
2026-09-10 across 32 workflows / 130 agents). Calendar at **2 rounds/day**.
Ranges are honest: the low end assumes one-round convergence, the high end
assumes the module needs the extra rounds that the measured distribution says
about a third of them do.

### P0 — store, adapter interface, fake adapter, panel skeleton — **6–8 rounds (3–4 days)**

`src/channel-store.js`, `src/channel-record.js`, `src/channels/index.js` + the
fake adapter, a `src/server/channels-engine.js` skeleton (scheduler, single
flight, broadcast), `src/routes/channels.js`, the rail item, the panel list and
an empty conversation window. Gates: `test-channel-store`,
`test-channel-adapter-contract`, `test-channel-record`.
**Exit:** the fake adapter's conversations appear in the panel, open in a window,
survive a restart, and sync across two clients.

### P1 — Lark read + Gmail read — **8–10 rounds (4–5 days)**

`src/oauth-loopback.js`, `src/channels/lark.js`, `src/channels/gmail.js`, the
adapter panel (connect / re-auth countdown / tracked pickers / inclusion query),
failure surfacing + retraction, and the `src/secret-box.js` extraction. Gates:
`test-channels-lark-shape` (recorded fixtures), `test-channels-egress`,
`test-channels-engine` (burst-day paging).
**Exit:** real conversations from both platforms, tracked opt-in, correct on a
burst day, honest auth states, zero secrets in any response.
*Owner-blocked:* the Lark redirect-URI registration (decision 4).

### P2 — assign, filter, wake — **7–9 rounds (3.5–4.5 days)**

`src/channel-filter.js`, the assignment model, the estimate route, the filter
editor with live estimates plus the after-the-fact measurement, the wake path
with the new `SPEND_REASON`, digest batching, and the per-assignment pacing cap.
Gates: `test-channel-filter`, `test-spend-paths` (its census sees the producer),
`test-channels-engine` (wake, digest, hold release).
**Exit:** an assigned filtered conversation wakes an agent, the wake names its
reason, and the money is bounded and attributed to the right slot.

### P3 — outbox, approval, receipts — **8–10 rounds (4–5 days)**

`src/channel-policy.js`, the outbox store, inline approval cards + the Outbox
window, "For you" pointer items with retraction, receipts through `noWake`, the
audit log, `vibespace-channels` + its manual, and the AgentReach panel with
requests. Gates: `test-channel-outbox`, `test-channel-acl`,
`test-channels-agent-cli`, `test-channels-e2e`.
**Exit:** an agent proposes, the user approves / edits / rejects in either
surface, a receipt lands without waking anybody, and the audit log is complete.
Sending is exercised against the fake adapter and the built-in Agents adapter
only.

### P4 — real external send — **6–8 rounds (3–4 days) + owner-blocked time**

Lark send (identity per decision 2, `uuid` idempotency), Gmail send (two-phase
draft, threading headers), `reconcile()` for unknown outcomes, guardrails end to
end, and the "sent as" honesty line. Gates: the outbox suite extended with the
idempotency and reconcile matrices; `test-channels-e2e` end-to-end against the
fake adapter; plus one documented manual shot at a real scratch chat before the
switch is offered to anyone.
**Exit:** an approved proposal reaches the platform exactly once, or says
honestly that it does not know.

### P5 — optional follow-ons (not scheduled)

Live-lane cursor kicks (**2–3 rounds**), sandboxed HTML rendering (**2–3**),
attachment fetch (**2**), plugin-contributed adapters (**4–6**), adapters on a
paired device (**4–6**).

**Totals:** P0–P4 = **35–45 rounds ≈ 18–23 working days** at 2 rounds/day, plus
owner-blocked time for the two scope round trips. P0–P2 alone — read-only
channels with assignment and filtering and no outbound path at all — is **21–27
rounds ≈ 11–14 days**, and it is a coherent shipping point: the panel is useful,
no external message can leave the building, and the money is already bounded.

---

## 18. Decisions for the owner

Each carries a recommendation. None is reversible for free later, which is why
they are here rather than in the code.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | **Adapters in-tree or plugins?** | in-tree modules / plugin packages | **In-tree for v1.** The OAuth flows, the secret store and the spend guard are all in-tree; an IPC boundary per message buys nothing at this scale. Keep the interface identical so third-party adapters become plugins in P5 without forking the registry |
| 2 | **Lark send identity** | as the **user** (needs `im:message:send_as_user`, a version publish and re-consent) / as a **bot** (needs the bot added to every chat) / both | **As the user.** It is what the other side expects in an existing human group and it needs no change to anybody else's chats. Bot identity only as a fallback where user-send is refused. Costs one scope round trip in P4 |
| 3 | **Lark receive lane** | poll-only / poll + WebSocket kick / webhook | **Poll-only in v1; WebSocket kick in P5; never the webhook.** The WS lane needs no public URL, but its cluster-mode delivery makes it unsound as a *content* lane across a fleet — as a cursor kick it is safe. A public inbound endpoint buys nothing over it |
| 4 | **Lark redirect URI** | reuse the ops tooling's registered loopback port / register a dedicated one for VibeSpace | **Register a dedicated one.** Sharing the port means the two tools collide whenever both run a consent flow, and the console requires the URI to be registered anyway |
| 5 | **Gmail OAuth client** | add `gmail.send` to the existing shared preset / register a client dedicated to channels | **Dedicated client for channels.** Adding a sensitive scope to a shared preset re-consents everything using it, and the verification status (hence the 7-day refresh-token behaviour) becomes one decision for two features. Read-only P1 may start on the existing preset |
| 6 | **What is tracked by default** | nothing until the user picks / all groups the user is in | **Nothing.** It is the privacy answer, the polling-cost answer, and it keeps the panel from becoming a mail client. The discover list makes opting in one click |
| 7 | **Approval surface of record** | new outbox store + a pointer item in "For you" / "For you" items only | **New store + pointer.** A proposal has structure (target, body, why, edit, receipts) the todo store cannot hold, and the pointer keeps the existing badge honest — with retraction |
| 8 | **Do receipts wake the agent?** | never (stash for next turn) / always / per assignment | **Never by default, opt-in per assignment.** An approval lands minutes to hours later; waking for a receipt is a billed turn per approval |
| 9 | **Default policies + guardrails** | confirm the interaction record's defaults | **Confirm as recorded:** external = review, internal = direct; audit ON, links/attachments force review ON, off-hours OFF until a timezone is configured (then the window is a setting) |
| 10 | **Spend ceiling shape** | share the existing per-identity caps / a separate channel budget | **Share.** One ceiling per credential slot is the whole point of the authorizer; add a per-assignment daily wake cap as *pacing* only |
| 11 | **Agent CLI** | new `vibespace-channels` / extend `vibespace-msg` | **New CLI.** `send` delivers, `reply` proposes — one verb with two authorization semantics is the twin this codebase punishes |
| 12 | **Message rendering** | plain text in v1 / sanitized HTML now | **Plain text.** It removes an XSS class entirely; rich rendering lands later in the sandboxed-iframe pattern |
| 13 | **Attachments** | metadata + explicit fetch / auto-download | **Metadata + explicit fetch**, with size caps |
| 14 | **Retention numbers** | pick them | **90 days or 5,000 records per conversation, whichever is smaller, floor 7 days**; the audit log archived (never deleted) on a dated roll |
| 15 | **Fleet scope** | local-only v1 / adapters on paired devices | **Local-only v1**, with `hostId` already a parameter so the later move is not a rewrite |
| 16 | **Does assignment imply visibility?** | yes, written as an explicit grant / no, the user must also grant reach | **Yes, as an explicit grant.** Two steps for one obviously-intended thing is how a permission model gets bypassed; writing it as a real grant keeps the reach panel truthful |
| 17 | **Sender honesty line** | always append "drafted by \<agent\>" / per-channel toggle / never | **Per-channel toggle, default ON for external.** The audit log records the drafting agent either way |

---

## 19. What I could not verify

Stated plainly, because a design that hides its unknowns is a design that
discovers them in production:

1. **Lark send-as-user has never been exercised** on the existing app: the scope
   is not granted, and whether granting it requires an approval wait is unknown
   (one prior scope change completed same-day, but the requesting account was the
   app's creator, so it may not generalize).
2. **Lark event subscription has never been enabled** on that app. The WS
   long-connection lane's behaviour on this network — and its cluster-mode
   semantics across two VibeSpace instances sharing one app — are documented but
   unmeasured here.
3. **The send endpoint's documented auth is a tenant token.** Send-as-user via
   the user scope is described in the platform's own tooling references, but I
   have not seen it succeed against this app. P4 must begin by proving it.
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
