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
> **r4 (2026-09-10, the adversarial review of r3 — all five findings correct, §18.1):**
> one fact stored in three places with no function able to read all of them, so r3's
> push auto-demotion could not structurally win ⇒ `laneState` becomes the one lane
> resolver and `caps.pushExclusivity` is deleted (§4, §6.4); `push.missRate` gains a
> counting window and the demotion gains a retraction, without which it is a one-way
> ratchet (§6.4); decision 19 deleted the only `scanSource` cell that had an ingest
> contract, so `scanSource:'ui'` now has its own (§12.5); and `convCaps` gains a TTL
> and three refresh triggers, one of them **at approval time** (§4, §9.2).
>
> **r5 (2026-09-10, an owner correction — it changes a conclusion, not a detail):**
> WhatsApp Desktop leaves at least part of its local database **unencrypted**, at
> least on macOS — the owner has seen an implementation reading it directly. r4's
> sentence "decision 19 excludes `'store'` for **both** platforms" is therefore true
> of WeChat (key in process memory) and **false of WhatsApp on macOS** (nothing is
> encrypted), and fence 13 could not tell them apart because it only ever stated what
> it refuses. So: fence 13 gains a **stated boundary** and an explicit permission
> (§3.13), `scanSource` stops being a scalar and becomes the per-platform
> `caps.scanSources` + the one resolver `scanState()` (§4, §12.5), macOS gets a real
> `scanSource:'store'` lane through a `channels-scan-store` agentd op with `hostId` a
> parameter (§12.5, §6.3), decision 19 becomes (b)+(d), and P6 splits into two legs
> with different gates (§19, §20, §18.2). Linux stays web-in-profile UI scan only,
> Windows stays `'ui'` (its store *is* encrypted), and **WeChat does not change by one
> word**.
>
> **r7 (2026-09-11, one owner directive — it adds a whole layer rather than fixing a
> slip):** "对于指纹浏览器和 communication panel 这种可能需要配置自己的 key 的情况, 要考虑
> 怎么提供配置界面, 让我们集群里的用户可以自行配置(当然 lark 这种集群里能提供默认 oauth
> client 的就提供默认)". So this revision adds **§14, integration credentials and the
> configuration UI** — one PURE registry table (`src/integration-registry.js`), one store
> (`src/server/integration-store.js`), four routes and an `'integrations'` window, with the
> precedence **the user's own > the cluster default > none**, and every consumer asking
> `resolveIntegration` rather than reading `process.env` itself (§14.6's standing census).
> It is a **shared layer**: the same names serve `docs/design-agent-browser-v2.md`'s
> `cloak` / `cloud:<name>` backends. Knock-on changes: §13 states token storage once and
> points at §14 (§14.11 fence 8 fixes the boundary between the two layers), the
> `src/secret-box.js` extraction **moves from P1 to a P0 prerequisite** and along the way
> stops inheriting the bare catch at `src/mounts.js:360-367` that **mints a new key over
> the old one** (§14.7), §12.1 gains the full cluster-redirect argument (§14.9: one app
> serving N instances is **structurally not a problem**; the real boundary is the
> **tenant**), §12.2 states precisely who re-consents when a scope is added and turns
> decision 5 into "add another preset key", the phases and rounds are re-derived (§19), and
> decisions 21–25 plus unverified items 24–29 are new.
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
landing place (§15, §16).

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
| Capability decisions (both axes, per-conversation resolution, identity warning, **lane resolution `laneState`**, **scan-source resolution `scanState`**) | **PURE** | `src/channel-caps.js` | `test-channel-caps` (fast) |
| The integration-credential table (rows, fields, cluster env names, the declared Test, consumers) | **PURE** | `src/integration-registry.js` | `test-integration-registry` (fast) |
| Conversation store *primitives* (durable load/append/tail/trim/flush; the **engine** owns the live index, §5.1) | **SHARED** (fs+path only) | `src/channel-store.js` | `test-channel-store` (fast) |
| OAuth loopback consent flow (**dual-mode**, §12.4) | **SHARED** | `src/oauth-loopback.js` | `test-oauth-loopback` (fast) |
| Encryption-at-rest primitive (one primitive, N key files; §14.7) | **SHARED** (fs+crypto only) | `src/secret-box.js` | `test-secret-box` (fast, parity with mounts) |
| Adapter interface + registry | **ORCH** | `src/channels/index.js` | `test-channel-adapter-contract` (fast, fake adapter) |
| Lark / Gmail / Agents adapters | **ORCH** | `src/channels/lark.js`, `gmail.js`, `agents.js` | contract suite + `test-channels-lark-shape` (fast, recorded fixtures) |
| Ingest engine (poll scheduler, backoff, per-tick budget, failure surfacing) | **ORCH** | `src/server/channels-engine.js` (`create(deps)` factory) | `test-channels-engine` (heavy) |
| Push lanes (one per vendor; liveness, ack, exclusivity measurement) | **ORCH** | `src/channels/live/<kind>.js` | `test-channels-push` (heavy) |
| Local-client store scan (platform facts, TCC grant, **read-only open** + a snapshot taken from that connection, cursor over rowid; the SQLite reader is a **bounded `sqlite3(1)` child** — never a native binding, which the daemon's single `--external` refuses; §12.5) | **SHARED** (bundled by the daemon) + one device op | `src/channels-store-scan.js` + the `channels-scan-store` handler in `src/agentd/agentd.js` | `test-channels-store-scan` (heavy, real daemon) |
| Integration-credential resolve / mask / broadcast + its routes (§14.3, §14.4) | **ORCH** | `src/server/integration-store.js` + `src/routes/integrations.js` | `test-integration-registry` (fast) plus its grep census |
| Routes + broadcasts | **ORCH** | `src/routes/channels.js` | the route battery in `test-restore-smoke`, `test-channels-e2e` |
| Wiring stanza | **ORCH** | `src/server/channels-wiring.js`, one call from `server.js` | `test-architecture` size ratchet (server.js ≤ 2100 lines — **at its ceiling today**, §2.1) |
| Panel, window, filter editor, approval cards | **CLIENT** | `src/lib/channels-panel.js`, `src/lib/channel-window.js`, `src/lib/channel-filter-editor.js` | `test-channels-e2e` (heavy, headless chrome) |
| The Integrations window (cards, source chip, Replace, Test, deep links; §14.5) | **CLIENT** | `src/lib/integrations-panel.js` | `test-channels-e2e` (heavy, including the 375×667 leg) |
| Agent CLI | tracked static | `data/bin/vibespace-channels` + `docs/agent/channels-manual.md` | `test-channels-agent-cli` (fast) |

Six placements are load-bearing enough to state as rules:

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
- **"Which lane is in use" has exactly one place that answers it** (r4, §4). The claim
  (`push.claimedExclusive` on the adapter record), the measurement (`push.state` /
  `push.missRate`) and the observation (the per-conversation `lane`) are three different
  facts and each stays where it is; but **only `laneState()` folds them into an answer**,
  with the precedence **demotion > liveness > claim**. The panel's chip, fence 12's
  coalescing window and the scheduler's cadence all ask it, and none of them reads
  `caps.receive`.
- **Capability has two axes, and it is not one global boolean** (r3/Q3, §4).
  What an adapter *could ever* do (`caps` — static, declared) and what it can do
  *on this conversation right now* (`convCaps(convId)` — resolved, three-valued)
  are different facts: the authorizing user is in the group but the bot is not; a
  read-only shared mailbox; a group that removed you. Each makes an adapter
  declaring `sendAs:['user']` unable to send **here**. The rule is: **a control
  exists only when both agree**, and `unknown` renders as not-offered-with-a-reason,
  never as allowed.
- **One integration key has exactly one resolver, and a consumer never reads `process.env`**
  (§14.6). `resolveIntegration(id)` is the single place that answers, with the precedence **the
  user's own > the cluster default > none**; a cluster default is resolved **by KEY and never
  copied into the stored record**, so one env rotation in the cluster rotates every consumer on
  every instance — the same rule, word for word, as `src/mounts.js:2187-2188`. Backed by a
  standing grep census: `VIBESPACE_INTEGRATION*` outside the store = red.

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
  entries (i18n-check runs in the build);
- a new integration is **one row** in `src/integration-registry.js`, plus the files its
  `consumers` names **actually** calling `resolveIntegration('<id>')` — both halves checked
  by `test-integration-registry` (§14.2);
- any new `VIBESPACE_*` env name needs **exactly one** parser, and the integration ones may
  only grow inside `src/server/integration-store.js` (§14.6);
- **that size ratchet is at its ceiling today, so P0's wiring stanza turns
  `npm run build` red even at one line (r6).** Measured:
  `scripts/test-architecture.mjs:187-188` asserts
  `read('server.js').split('\n').length <= 2100`, and at this design's base commit
  that value is **exactly 2100** (`wc -l` reports 2099 — the off-by-one is the
  trailing newline, and the suite uses the 2100 form) ⇒ headroom is **ZERO**, not
  one line. And this build is not optional: `npm run ci` (the mandatory pre-push
  gate) builds, and `scripts/update.sh:104` — the in-app "Update VibeSpace…" —
  builds ⇒ P0's **first** commit would block both the release gate and every
  instance's self-update. Two ways out, pick one and do it **in the same commit**:
  ① raise the budget **deliberately**, which the suite's own comment at lines
  183-185 sanctions ("If a legitimate wiring stanza pushes past the budget, raise it
  deliberately in the same commit that explains why"), or ② extract an existing
  stanza into `src/server/` first. **Measure before writing the stanza**, do not
  assume headroom — the comparable stanzas today are 1 line (`sysinfo-wiring`), 9
  lines (`incident-wiring`) and 14 lines (`mounts-plugins-wiring`), and channels also
  needs its router mounted. Priced as what it is: ~0.5 rounds, counted in P0.

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
    `laneState(…).carryContent` is true and `notify: 'wake'`, the engine applies a
    coalescing window (default 60 s) **before** the wake decision, so one burst is
    still one wake. Forget this and the act of "turning on real-time push"
    multiplies a conversation's bill by thirty. The gate is deliberately **not**
    `caps.receive === 'push'` (r4): in kick mode the records arrive by poll, and one
    poll pass has already coalesced them — opening the window there buys 60 s of
    latency for nothing.
13. **Never read another process's memory, never reconstruct a key the vendor
    withheld, and never ship an adapter whose transport is prohibited by the
    platform's terms without one named acknowledgement.** (r3/Q3(b); r5 adds the
    second clause and the boundary.) This is load-bearing for the local-client
    class, and it **has to be able to say YES to something** or it is not a fence,
    it is a ban. It refuses three things:
    (a) **Another process's memory.** WeChat's desktop store is SQLCipher/WCDB-
    encrypted and the key exists only in the **running client's process memory** —
    which is where every public tool extracts it from. Reading another process's
    memory is not the same act as reading a file, and this product does not do it.
    (b) **Reconstructing a key the vendor deliberately withheld.** WhatsApp Desktop
    on Windows encrypts its SQLite stores: the UWP line uses the SQLite Encryption
    Extension (SEE) with a dbKey derived from a machine-unique identifier the
    application does **not** expose, and the published technique is to reproduce
    that identifier without calling the API; the WebView2 line protects its keys
    with DPAPI-NG. Recomputing a key that was intentionally withheld and extracting
    it from memory are **two techniques for the same act**, so they fall under one
    refusal.
    (c) **A transport prohibited by the platform's terms**, absent one named
    acknowledgement. The WhatsApp protocol libraries (whatsmeow / Baileys) are
    reverse-engineered **unofficial clients**, unofficial clients are explicitly
    prohibited by WhatsApp's terms, and bans have landed on low-volume, reply-only,
    otherwise legitimate use. Such adapters carry a `tosRisk` capability and are not
    offered by default (decision 19).
    **And it does not refuse this: a file the client itself left unencrypted on
    disk.** WhatsApp on macOS leaves its entire chat history in an unencrypted
    SQLite store (§12.5), and reading it is an ordinary, read-only file read:
    nobody's secret is defeated, because **there is no secret**. The gate is still
    the operating system's own permission system (macOS TCC / Full Disk Access), and
    a refusal there must reach the user as a **named** refusal. The test is one
    question: **whose secret are we defeating?** When the answer is "nobody" it is a
    file read; when the answer is "the client's" — whether that key lives in memory
    or behind an API that hides it — it is what this fence refuses.

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
                                      // exclusivity is NOT here: it is a per-DEPLOYMENT
                                      // configuration fact, so it lives on the adapter RECORD
                                      // (push.claimedExclusive) and only laneState() resolves it
    pushAckBudgetMs: 3000,            // vendor's own deadline; we ack after DURABILITY (fence 11)
    pollInterval:   { hot: 30, cold: 300, floor: 10 },   // seconds; `floor` is the VENDOR's
    scanSources:    null,             // { darwin|win32|linux : 'store'|'ui' }  — only when
                                      // receive === 'scan'. A per-PLATFORM UPPER BOUND, because
                                      // one client is a readable store on one OS and a scraped
                                      // screen on another; only scanState() resolves it (r5)
    scanLatency:    null,             // { store: 15, ui: 300 }  seconds, per SOURCE — an order
                                      // of magnitude apart. This is the DECLARED cadence and it
                                      // is also the CEILING the fs.watch kick is debounced to,
                                      // never a label (r6, §6.4); the row draws the OBSERVED age
    history:        'page',           // 'page'|'since'|'none' — the scalar, for push/poll
    historyBySource: null,            // { store:'since', ui:'page' } — ONLY when receive==='scan'.
                                      // r6: `history` is a per-SOURCE fact for exactly the reason
                                      // `scanSources` is one — ONE adapter reads a store on one OS
                                      // and scrapes a screen on another, and a DOM scrape cannot
                                      // honour since-anchor semantics while declaring 'page' would
                                      // delete the real anchor that is WHY 'store' is preferred.
                                      // Only scanState() resolves it, and it returns the answer
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

  // axis 1 resolved for ONE conversation — three-valued, cached in the index with its age.
  // The cache has a TTL (6 h) and three refresh triggers; past the TTL it resolves to
  // read:'unknown' / sendAs:[] / why:'stale'  —  see below, this is NOT a cache-forever
  async convCaps(convId)
        -> { read:'yes'|'no'|'unknown',
             sendAs: [...],                       // SUBSET of caps.sendAs that holds HERE
             why: 'not-a-member'|'bot-not-in-chat'|'read-only-mailbox'|'left-group'|'stale'|null,
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

  // present ONLY when caps.receive === 'scan' — facts about THIS machine, so it is answered
  // by the agentd op, hostId a PARAMETER and the local box is device #0 (§12.5).
  // `at` is stamped HERE and READ by scanState() against a 6 h TTL (r6): these are stored
  // derived facts from a round trip, so they take §5 invariant 7's TTL treatment rather than
  // an exemption — a frozen answer keeps drawing "15 s" over a lane that fails every pass
  async scanHost(hostId)
        -> { platform:'darwin'|'win32'|'linux', clientInstalled, storePath,
             grant:'granted'|'needed'|'denied'|'unpromptable', why, at }
}
```

`src/channel-caps.js` (PURE) is the **one** place that answers "does this control
exist at all":

```js
laneState(caps, adapterRecord, convEntry, now)          // r4 — added for the reason below
      -> { via:         'push'|'poll'|'scan',   // the lane actually carrying this conversation NOW
           carryContent: boolean,               // may push carry CONTENT, or only KICK a cursor
           live:         boolean,               // positive evidence only: a socket AND a beat inside the window
           pollCadence:  'fast'|'reconcile',
           why:          'exclusive'|'kick-shared'|'kick-unknown'|'demoted'|'push-dead'|'poll'|'scan' }
offers(caps, convCaps, what)   // what ∈ 'send-as-user'|'send-as-bot'|'fetch-attachment'|…
      -> { offered: boolean, why: string|null }      // 'unknown' ⇒ offered:false + the reason
identityWarning(caps)          -> { level:'none'|'warn', text }        // §9.5
scanState(caps, adapterRecord, hostFacts, now)          // r5 — the same shape as laneState
      -> { via:          'scan',              // r6: the DISCRIMINATOR. laneState answers `via`,
                                              //     so the union below is explicit rather than
                                              //     sniffed off which keys happen to be present
           source:       'store'|'ui'|null,   // the source actually carrying this conversation NOW
           history:      'since'|'page'|null, // r6: caps.historyBySource[source], RESOLVED
           carryContent: false,               // r6: a scan pass is a BATCH, like a poll pass (§6.4)
           why, latencySeconds, storePath, grant, hostFactsAgeSeconds }
      // `now` is load-bearing (r6): past HOST_FACTS_TTL (6 h) since hostFacts.at, this answers
      // source:null / why:'host-facts-stale' — see §5 invariant 7
freshnessClaim(caps, laneOrScan, convEntry, now)        // r6: widened, see the rule below
      -> { kind:'live'|'within'|'scanned', seconds, text }
      // laneOrScan = laneState()'s or scanState()'s answer, discriminated on `via`
```

`laneState` is **added by r4**, and what it fixes is structural: "which lane is
actually in use, is it live, and may it carry content" — one fact — used to live in
three places: `caps.pushExclusivity` (static, declared per adapter **kind**),
`push {claimedExclusive, state, demotedAt}` on the adapter record, and
`lane {via, lastPushAt}` in the per-conversation index. §6.4 said only that the first
two "together decide it" and never which wins; worse, this section calls
`src/channel-caps.js` the **one** place that answers, and not one of the three
functions it exported took the adapter record — so none of them could **read**
`push.state` / `push.claimedExclusive` / `push.demotedAt` at all. Three
consequences, each of them a failure shape this document itself names:

1. **§6.4's auto-demotion cannot structurally win.** The demotion writes `demotedAt` /
   `demotedWhy` onto the **record**, while the content-vs-kick decision is attributed to
   `caps.pushExclusivity` — so a demoted lane keeps carrying content while the adapter
   row says it has been demoted.
2. **The freshness chip lies about `live`.** It is drawn off `caps.receive === 'push'`,
   a static declaration — which is exactly the `opencode-events` round-4 lesson §6.4
   itself cites: a lane that lies about being `active` is worse than no lane, because it
   turns the fallback off.
3. **Fence 12's coalescing window runs in kick mode too.** It is gated on
   `caps.receive === 'push'` as well, and in kick mode the records arrive by poll, which
   already coalesces — 60 s of latency bought for nothing.

So `caps.pushExclusivity` is **deleted**: exclusivity is a **per-deployment**
configuration fact (§6.4 says so itself), and `caps` is by definition the static
per-**kind** declaration (§2), which is not where a deployment fact belongs.
`caps.pushTransport` stays — that one genuinely is static. What replaces it is **one
resolver, one answer**, with the precedence fixed and written down:

> **Demotion > liveness > claim.** Demoted ⇒ `carryContent:false` (only the party that
> made the claim can retract the demotion, §6.4); not demoted but the lane is not `live`
> ⇒ `carryContent:false` and `pollCadence:'fast'`; only past both does
> `push.claimedExclusive` get a say. **`unknown` is always `carryContent:false`** — r2's
> behaviour is still the default.

"A fact only one producer may state" is a written law in CLAUDE.md (*两个函数回答同一个
问题就说明其中一个是错的*), and its form here is: the three storage sites may all stay
(a claim, a measurement and an observation are different facts), but **there may be only
one place that folds them into an answer.**

**`scanState` (r5) is the same law applied to the other lane.** A scan source is
also three facts — the static per-platform declaration `caps.scanSources`, the
observation of what is on that machine, and the user's own choice in the connect
wizard — and §12.5 shows what happens when they are folded ad hoc: r4 concluded
that a whole cell was excluded because one word ("the store is unreadable") stood
for two different situations. So it gets its own resolver, its own written
precedence, and the same rule that no consumer reads the raw declaration.

Four consumers read the same record, each for its own face — and **every
lane-shaped decision goes through `laneState` (or `scanState` on a scan lane),
none of them reads `caps.receive` or `caps.scanSources`**:

- **The panel** draws every row's freshness chip from
  `freshnessClaim(caps, laneState(…), convEntry, now)` — or from `scanState(…)` on a
  scan lane (the union is discriminated on `via`, §4),
  which is where that chip's seconds-vs-minutes number comes from (a **live,
  content-carrying** push =
  "live", poll = "≤ 30 s", scan = "last scanned <t> ago" — **a scan source's
  latency is shown on the conversation**, because it is the one number a user
  needs before handing that lane a job). A demoted or non-`live` push lane draws
  the lane it is **actually** on, never the one it declared. It also uses
  `offers()` to decide whether the send affordance exists on the composer and the
  approval card at all, and `identityWarning` for the warning on the card (§9.5).
- **The ingest engine** (§6.2's scheduler) takes this tick's poll cadence from
  `laneState(…).pollCadence` and decides from `laneState(…).carryContent` whether a
  push event goes normalize → append or merely kicks the cursor — which is also
  fence 12's coalescing gate (§6.1, §6.4).
- **The filter / assignment engine** uses `offers()` to make `authority:'send'`
  **unselectable** (an assignment that can never send is a lie, §7.3), and
  `freshnessClaim` to state honestly on the AssignFilter panel roughly how long
  until this agent gets woken.
- **The spend authorizer** reads none of it — and that is the point. The receive
  mode does **not** change the money decision: same filter, same reason, same
  per-credential-slot ceiling. It changes only arrival time, and fence 12's
  coalescing window absorbs that. The suite turns this sentence into an assertion
  that can go red (§17's `test-channels-lane-parity`).

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
  never be sent asks a user to approve something that is then guaranteed to fail;
- **`convCaps` is a cache with a TTL, not a stored fact** (r4). The TTL defaults to
  **6 hours** and there are exactly three refresh triggers: ① when the user marks a
  conversation tracked; ② on the first panel render past the TTL; and ③
  **unconditionally at approval time, immediately before the send** — the one moment
  where being wrong costs a real message. An entry past the TTL resolves to
  `read:'unknown'` / `sendAs: []` / `why:'stale'`, which `offers()`'s existing rule
  (`unknown` ⇒ not offered, with the reason) already renders, so the degrade needs no
  new vocabulary. **The reason is §5 invariant 7**: a derived value never becomes a
  stored fact, and `convCaps` differs from `unread` / `hits7d` in that it is the result
  of a vendor round trip and is **not locally re-derivable** — so what it owes is not
  "always recomputable" but a TTL plus an honest degrade. Without this, a week-old
  cached `sendAs:['user']` for a group the user has since left (`why:'left-group'` is
  already in the enum, so this state is anticipated) still draws the composer
  affordance and still lets the assignment be created, producing **exactly** the
  proposal the previous rule forbids;
- **an adapter with `receive: 'scan'` may not declare `history: 'none'`** (r4, §12.5).
  §5 invariant 4 requires a *complete pass* before the anchor advances and
  `complete:false` to mean "do not advance", and an adapter with no paging call can
  report neither; and by this section's first rule an undeclared capability **throws**,
  so §6.3's "stop at the stored anchor" cannot happen on it. A synthetic adapter
  declaring `receive:'scan'` + `history:'none'` must fail the contract suite.
- **`scanState()`'s answer is never wider than the cell `caps.scanSources`
  declares** (r5, §12.5). Same direction and same reason as `convCaps ⊆ caps`: the
  static declaration is an **upper bound**, and resolving "what exists on this
  machine" may only **narrow** (a platform declaring `'store'` may answer `'ui'` or
  `null`; a platform declaring `'ui'` may **never** answer `'store'`) — otherwise
  "we have never verified that this platform's store is readable" could be routed
  around by one optimistic runtime probe. Both halves owe a leg: a synthetic
  adapter answering `'store'` on `linux` must go red, and so must a resolver that
  still answers `'ui'` on `darwin` **with the grant already held** — a resolver that
  always narrows to nothing is the same defect as a `convCaps` that always answers
  `unknown`.
- **A refused read on a `scan` lane resolves to `source:null` with a reason, never
  to `'ui'`** (r5). An automatic degrade would move the latency number on the
  conversation row from seconds to minutes without saying so, and that number is the
  whole honesty contract of this class (§12.5); falling back to `'ui'` may only be a
  choice the user made in the connect wizard (`why:'user-chose-ui'`).
- **On `receive:'scan'`, every value in `historyBySource` must be non-`'none'`, and
  the table's keys must cover every source named in `scanSources`** (r6). The rule
  above it (no `history:'none'` on a scan lane) was written against a per-**kind**
  scalar, and r5 had just finished proving that in this class **one adapter runs both
  cells**: the same WhatsApp module reads a store on macOS and scrapes a screen on
  Linux. So no value of that scalar is right — declaring `'since'` asks a Linux
  deployment to honour since-anchor semantics with a DOM scrape, and declaring
  `'page'` deletes the "real anchor ⇒ `history:'since'`" that decision 19 and §5
  invariant 2 give as **the** reason `'store'` is preferred at all. `history`
  therefore becomes a per-source upper-bound table on a scan adapter, resolved by
  `scanState()` alongside `source`. Its negative control sits beside the one above: a
  scan adapter whose `historyBySource` omits a source its `scanSources` declares must
  go red.
- **`scan.hostFacts` is the second named exception, and it pays the same price**
  (r6, §5 invariant 7). Platform, client presence, store path and read grant are the
  result of a (possibly cross-machine) `channels-scan-store` round trip and are not
  locally re-derivable — which is precisely the property that earned `convCaps` its
  named exception. So what it gets is again not an exemption but **a 6 h TTL**, three
  named refresh triggers (① when the user picks a source in the connect wizard, ② on
  the first panel render past the TTL, ③ unconditionally before a scan pass that would
  advance the anchor — the store analogue of "re-resolve at approval time"), and a
  past-the-TTL degrade to `source:null` / `why:'host-facts-stale'`, rendered by the
  same not-offered-with-a-reason path as everything else. **`grant` is never trusted
  across a pass**: a macOS TCC grant is revocable in System Settings at any moment and
  decision 19(d) records the prompt itself as per-process-instance and temporary, so a
  stored `granted` is a claim that expires **by construction** — the op's own `EPERM`
  is the authority, and a `granted` that comes back `EPERM` re-files as `tcc-denied`
  and clears the stored grant. `grantAskedAt` has its own reader: the "do not
  re-prompt on this machine more than once per N" rule — a field with no reader is, in
  this repo, "the fix was never wired".
- **`freshnessClaim` can reach both of the numbers it states** (r6). It returns
  `seconds` and has to say "last scanned <t> ago" — an **age** — yet its signature
  carried no clock and no `caps` (and the poll case's "≤ 30 s" lives in
  `caps.pollInterval.hot`, with the hot/cold fact that selects between 30 and 300 not
  passed either). Every sibling resolver in this repo takes `now` (`laneState`,
  `scanState`, and the convention everywhere else: `quota-model`'s `nowSec`,
  `decideLagShadow`'s `now`); this one has no reason to be the exception. And since r5
  its first argument is a union of two **disjoint** shapes (`laneState()`'s answer
  carries `via`, `scanState()`'s carried only `source`), leaving the callee to
  discriminate on which keys happen to be present — so `scanState()` now answers
  `via:'scan'` too and the discriminator is explicit. The signature becomes
  `freshnessClaim(caps, laneOrScan, convEntry, now)`.

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
                                scan {hostId, chosenSource, grantAskedAt,
                                      hostFacts {platform, clientInstalled, storePath,
                                                 grant, at}}
                                                                          // §12.5: the CHOICE and
                                                                          // the OBSERVATION; only
                                                                          // scanState() folds them.
                                                                          // r6: the OBSERVATION half
                                                                          // is a stored derived fact,
                                                                          // so invariant 7 gives it a
                                                                          // 6 h TTL, three refresh
                                                                          // triggers and a named
                                                                          // degrade. `grant` moved
                                                                          // INSIDE hostFacts: it
                                                                          // expires with them and is
                                                                          // never trusted across a
                                                                          // pass (the op's own EPERM
                                                                          // is the authority).
                                                                          // `grantAskedAt` is read by
                                                                          // the don't-re-prompt rule
  index.json                    atomic JSON, ONE in-process owner (§5.1). Per conversation:
                                id, adapterId, vendorId, title, kind (dm|group|thread),
                                participants summary, lastAt, unread, tracked, anchor,
                                assignment, filterId, policy, pendingTodoId, reachEntries[],
                                stats {hits7d, msgs7d},
                                convCaps {read, sendAs[], why, at}        // §4: cached WITH its age,
                                                                         //     TTL 6 h, then 'stale'
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
   history replay also produces) must be a no-op, never a duplicate. **`vendorId`
   is required**, and an adapter that scrapes a screen from a client exposing no
   stable message id must **declare a synthetic key** and mark the synthesis
   (§12.5's `'ui'` cell) — this invariant needs a key, not a vendor-supplied one;
   but a key that does **not** say it is synthetic turns every re-scan into a batch
   of duplicates. **Reading a client's own store instead gives a real one** (r5):
   §12.5's `'store'` cell takes the client's own message id and leaves
   `raw.synthetic` false, which is the reason that cell is preferred where it
   exists — the collapse of a re-read becomes a platform guarantee rather than a
   bet of ours.
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
   sentence is here. **`convCaps` is the one named exception, and it pays for it**
   (r4): it is the result of a vendor round trip and is not locally re-derivable, so
   what it gets is not an exemption but **a TTL (6 h), three refresh triggers, and a
   past-the-TTL degrade to `unknown`** (§4). That is what finally gives the stored
   `at` a reader — before r4 it had none, and in this repo a field with no reader is
   "the fix was never wired". **`scan.hostFacts` is the second exception, and r6 added
   it only after reproducing the same defect inside it**: r5 wrote
   `{platform, clientInstalled, storePath, grant, grantAskedAt, at}` with three fields
   that had no reader, no TTL, no refresh trigger and no staleness degrade — r4's own
   sentence, one section away. It owes the price `convCaps` pays, word for word (a 6 h
   TTL, three named triggers, a past-the-TTL degrade to `source:null` /
   `why:'host-facts-stale'`; §4), and the harm runs the other way and costs more: a
   stale `convCaps` **over-offers** one control, while stale `hostFacts` keep
   `scanState()` answering `source:'store'` and `latencySeconds:15` after the client is
   uninstalled, after a client update moves the store (item 19(e) concedes the schema
   moves with versions), or after a Sonoma→Sequoia upgrade that this section itself
   says **extends** TCC to `~/Library/Group Containers/` — i.e. exactly the "quietly
   swapping a 15-second lane for a 5-minute one" that §12.5 forbids, except that here
   there is no 5-minute lane either and every pass is failing.

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
                        └─► COALESCE (60 s window when carryContent — fence 12; only a PUSH
                        │            lane can answer true: a poll pass and a scan pass are
                        │            already batches, so they need no window — r6)
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
  (5 min) — but both numbers pass through **`laneState(…).pollCadence`** first (§4):
  `'reconcile'` drops the whole adapter to the 15-minute reconciliation cadence,
  `'fast'` is the two numbers above. The scheduler **never reads** the claim,
  `push.state` or `caps.receive` itself (r4);
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
guarantees — and "which cadence is it right now" is answered in one place by
`laneState`, so a demoted or dead push lane hands the fast cadence back
**immediately** without anything else re-deciding it.

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
on some machine and whatever it writes down or draws (§12.5). Which source it
takes is **not a static per-kind fact** — it is an answer `scanState()` resolves
against that machine:

- **`'store'` — read the local store that client wrote.** Exactly one cell holds
  today: **WhatsApp on macOS**, which leaves its whole history in an
  **unencrypted** Core Data SQLite store. The cursor is the pair
  `(rowid, timestamp)`, the anchor is the client's **own** message id (hence
  `history: 'since'`, and §5 invariant 2 gets a real key), a pass is complete when
  it reaches the maximum rowid recorded at its start, and the `fs.watch` on the file
  is a **cursor kick** (debounced to `caps.scanLatency.store`, §6.4), never a
  per-write scan. **Never write**: open the live store with `SQLITE_OPEN_READONLY`
  (which reads WAL content and mutates nothing) and take the scratch snapshot with
  `VACUUM INTO` / the backup API **from that read-only connection** — what silently
  omits the most recent messages is reading the **`.db` file alone** (it does not
  contain the WAL), not opening read-only (r6, measured in §12.5). When macOS TCC
  refuses the read this lane fails under the name `tcc-denied` — **never as a
  successful scan that read zero messages**.
- **`'ui'` — read what that client rendered** (driven by an agent-browser profile,
  see `docs/design-agent-browser-v2.md`). This is the only source for **Windows,
  Linux and all of WeChat** (the first two encrypt their store or have no official
  client at all; WeChat's key lives in process memory — fence 13). It is equally a
  periodic scan with a cursor, but that cursor is a **declared** synthetic key and
  "a complete pass" is scroll-bounded, both spelled out line by line in §12.5.

The two routes are an order of magnitude apart in latency (seconds vs minutes), and
**both numbers are the number drawn on the conversation row**, because it is the
one thing a user must know before handing that lane a job — which is also why a
refused store read does **not** silently degrade to a UI scan. **Sending does not
follow the source** (r6): reading a store is read-only evidence, not a send lane, so
on a machine that resolves to `'store'` with no send lane wired, `convCaps.sendAs` is
`[]` with `why:'no-send-lane-on-this-host'` — which §4's existing rule renders as
not-offered-with-a-reason and which stops any proposal being created. The send act
belongs to `'ui'` alone: an agent-browser typing into that logged-in official
client's own composer; the protocol-library route carries fence 13's terms risk and
is not offered by default.
**The store lives on a machine, so the code that reads it runs on that machine**: a
`channels-scan-store` agentd op, `hostId` a parameter, the local box device #0. The
interface for this class exists from P0 (`scan` / `scanSources` / `historyBySource` /
`scanLatency` /
`scanState` / `convCaps` / `tosRisk` are all slots kept for it); the WhatsApp and
WeChat adapters themselves are P6 behind decision 19.

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

**The claim has exactly one home — `push.claimedExclusive` on the adapter record**
(`'exclusive'` / `'shared'` / `'unknown'`), because it is a **per-deployment** fact;
and **the resolution has exactly one place** — §4's
`laneState(caps, adapterRecord, convEntry, now)`, with the precedence **demotion >
liveness > claim**. Before r4 it also lived in `caps.pushExclusivity`, which is why
the auto-demotion below could not structurally win — see §4.

- **`exclusive`** — the user declared in the connect wizard that this app's push
  lane belongs to this instance. Push **carries content** (`carryContent:true`): the
  event's message goes normalize → append → ack → coalesce → filter. Polling drops to
  the 15-minute **reconciliation cadence** (`pollCadence:'reconcile'`) — no longer the
  latency mechanism, still the completeness one.
- **`shared` / `unknown`** — push is **only a cursor kick** (`carryContent:false`),
  i.e. r2's rule kept verbatim (wake the backoff *sleep*, not merely abort a fetch —
  the `opencode-events` lesson, where a lane that only aborted the fetch took 25 s to
  go live). Polling stays at the fast cadence. The default is `unknown`, so
  **asserting nothing gives you r2's behaviour**.
- **demoted, or not `live`** — whatever the claim says, `carryContent:false` and
  `pollCadence:'fast'`. That is the whole of the precedence: a claim the product has
  itself withdrawn may no longer decide which lane a single byte takes.
- **`via:'scan'` — `carryContent:false`, always** (r6). The precedence above
  enumerates push states and nothing else, while the gate at the funnel reads **the
  resolved lane** and `laneState()` can answer `via:'scan'` — so the scan lane sat in
  a cell nobody had filled in. The answer itself is not in doubt: **a scan pass is a
  BATCH**, word for word like a poll pass, so it neither needs the window nor buys any
  latency from it (fence 12's own sentence: opening it in kick mode "buys 60 s of
  latency for nothing"). The cost of leaving it unwritten is not theoretical: §12.5
  introduces `'store'` together with an **event-driven** trigger (an `fs.watch` on the
  store file), and WhatsApp's `ChatStorage.sqlite` is written on every incoming
  message — so in a busy group the watch fires roughly per message ⇒ one scan pass per
  message ⇒ one filter hit per message ⇒ under `notify:'wake'` the gate reads a
  `carryContent` that is undefined (falsy) ⇒ no coalescing ⇒ **one wake per message**.
  That is fence 12's own "30 messages become 30 deliveries", arriving through the lane
  r5 had just added, on the one gate that did not cover it.
- **That `fs.watch` is a CURSOR KICK, never a per-write scan** (r6). It wakes the
  scan *sleep* (the same wording as the `shared` push kick, the same
  `opencode-events` lesson) and is **debounced to at most one pass per
  `caps.scanLatency[source]`** — which is what makes that number a real ceiling
  rather than a label, so the seconds drawn on the conversation row and the rate at
  which the store is actually read are the same fact. It runs inside the daemon, so it
  also owes the `opencode-events` round-4 inotify-lifetime rule: one attach point, a
  stop that is terminal, and never a watch attached to a lane nobody holds. Honest
  bound: §7.4's 30 s per-conversation ladder floor and the spend authorizer cap the
  **absolute** spend, so this is not unbounded money — but the wakes and the charges
  differ per lane, which is what makes §6.1's headline ("the same records, the same
  wake count, and the same charges") and §17's parity row literally unsatisfiable.

**An assertion must be falsifiable or it is a prayer.** The platform never tells
us how many other clients are connected, so exclusivity is **asserted, never
inferred** — but it is **measurable**: the engine records
`firstSeenByPoll / firstSeenTotal` per adapter, the fraction of records seen
first by the reconciliation poll rather than by push (`push.missRate`; the
counters live per conversation on the index's `lane` and are aggregated per adapter
into that one ratio). On a genuinely exclusive lane that number stays at 0.
Crossing a threshold (default 2 %, with at least 20 samples) **auto-demotes the
lane to kick mode**, records `demotedAt` / `demotedWhy`, and says so on the adapter
row: *"push is not exclusive here — fell back to cursor kicks, polling returned to
the fast cadence"*. That path is this feature's instance of the rule that **a claim
must be retractable by whoever made it** (the login-expiry lesson): the product
states something, then measures it, then withdraws it itself.

That measurement owes two sentences, and without either of them it is a **one-way
ratchet** (r4):

1. **Count only while the lane is actually carrying content, and only over a rolling
   window** — the last N records or the last 24 h, whichever is larger. The reason is
   arithmetic: in kick mode push **carries no records at all**, so every record is
   first-seen-by-poll and the ratio tends to 1.0 by construction — a lifetime
   cumulative ratio would pin a demoted lane above the threshold **forever**. Ticks
   where `laneState(…).carryContent` is false therefore contribute **no samples**, so
   the metric cannot poison itself.
2. **A demotion is retractable by whoever made the claim.** This is the auto-resume
   `edgeHeld` lesson in this feature's shape (*HELD, never SPENT … burning the wall
   would turn one transient disagreement into a permanent refusal*). The retraction is
   a **human** act: re-asserting exclusivity in the connect wizard resets the counters
   and retries the lane once, and the adapter row shows `demotedWhy` beside a
   "re-assert to retry" affordance. **The counters are never the trigger** — a demoted
   lane must not climb back on its own even when the fixture stops withholding, because
   the evidence that would let it recover (push seeing a record first) is exactly what
   it cannot produce in kick mode.

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

**Approving re-resolves `convCaps`, immediately before the send, unconditionally**
(r4 — §4's third refresh trigger). A proposal can sit in `awaiting-approval` for up
to 24 h (its own TTL), and in that time the conversation may perfectly well have
removed the user, turned the mailbox read-only, or been dissolved — `why:'left-group'`
is already in the enum. When the re-resolution answers "cannot send", the approval
**does not send**: it stops with the typed `send-not-available` plus the reason
`convCaps` itself gives, the proposal lands in `failed`, and the receipt carries that
reason verbatim back to the agent. This is the one moment where being wrong costs a
real message, so it is the one refresh that may not be skipped.

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
  ⇒ `unknown`, until a real send in P4 settles it (§21).
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
- **The connect wizard asks the Integrations card first (§14.5):** "Connect Lark" on the
  adapter panel opens the Integrations window focused on that row
  (`app.openIntegration('lark')`) **before** anything else when `resolveIntegration('lark')`
  answers `none`, rather than sending the user into an OAuth flow that will fail on the consent
  page — §12.1 already names that failure mode (a missing scope / published version / redirect
  URL fails the *consent page*, not the API call), and it is the **default** shape on an instance
  where the user has never configured app credentials. When it answers `cluster` the button
  carries **"provided by the cluster"** and one click connects; when it answers `user` it says
  nothing extra. This is not a UI preference: the connect button is the only thing on this chain
  a user ever clicks, and **no credential** and **credential refused** are different facts —
  folding them into one sentence is another round of "the error text is not a diagnosis".
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
  only) — not vendor-confirmed, but a precondition for P1, so it is listed in §21.
- **Authorization prerequisites.** The console needs all three of: the redirect
  URL registered, the scopes granted, and a **published version**. A missing one
  fails the *consent page* rather than the API call — a confusing failure mode
  worth spelling out in the connect wizard's error text.
- **Redirect URI.** Lark's console requires the redirect URL to be *registered*,
  so the loopback port is necessarily **fixed** — unlike Google, which accepts
  any loopback port and lets `src/gmail-sync.js` bind an ephemeral one. A fixed
  port is a machine-global name; §12.4 says what the flow does about that.
  Registering a dedicated URL (decision 4) resolves VibeSpace-vs-ops-tooling and
  **nothing else**. **Two additions (r7):** ① the official documentation states that the
  redirect URL list **supports several entries**, so decision 4's "register ours *beside*
  theirs rather than displacing it" is no longer an assumption — §21 item 11 drops from
  "unverified assumption" to "documented, but never exercised on this app's console"; ② one
  cluster registration serving **N instances** needs nothing new, because the redirect_uri
  contains no instance address at all (it is loopback = the user's browser's machine), and what
  **actually** bounds a cluster default is the **tenant**, not the URL — the full argument and
  the vendor fact table are in §14.9, with decisions 21 and 22 as its two owner gates.

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
  tokens after **7 days** (public docs: a consent screen in Testing with user type
  External does exactly this), which is the pain the existing Gmail mounts already
  live with. **Stating the "adding a scope" mechanics precisely (r7):** adding a scope to a
  client does **not** by itself invalidate grants already issued — an existing refresh token
  keeps working for the scopes it was granted. Two other things happen instead: ① any flow that
  **now requests** the wider scope shows that user a consent screen again (incremental
  authorization), and ② the client's **verification status** becomes one decision governing two
  features, so the unverified/testing 7-day refresh token is inherited by the read-only mounts
  too. Decision 5 therefore gains a concrete answer: **have the cluster add another preset key**
  to `VIBESPACE_GDRIVE_CLIENTS` (say `channels`) rather than widening the existing one — that
  list already means "which clients this instance offers", one more key needs no second parser
  and touches no existing mount. Which is why the `gmail` row **delegates** to
  `MountManager.drivePresets()`, §14.2.
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

| `scanSource` | Reads | Anchor | Latency | Sends |
|---|---|---|---|---|
| `'store'` | The local store the client wrote, incrementally with a cursor over rowid/timestamp; the `fs.watch` on the file is a **cursor kick**, debounced to `caps.scanLatency.store` (§6.4), never a per-write scan | The client's **own** message id (the store already has that column) ⇒ `historyBySource.store = 'since'` | Seconds | **No send lane of its own** (r6): a store is read-only evidence. Sending comes from `'ui'` only; where that lane is not wired, `convCaps.sendAs: []` + `why:'no-send-lane-on-this-host'` — the protocol libraries are refused by fence 13 |
| `'ui'` | What the client **rendered**, driven by an agent-browser profile (`docs/design-agent-browser-v2.md`: profile = user-data-dir + provider + fingerprint seed + proxy, plus a live view VibeSpace owns) | Usually no stable id ⇒ a **declared** synthetic key ⇒ `historyBySource.ui = 'page'`, **never `'none'`** | Minutes | agent-browser typing into the client's own composer |

**r5 (the owner's correction): `'store'` is not a hypothetical cell — on macOS it
is real.** r4 wrote that "decision 19 excludes `'store'` for **both** platforms",
and that sentence is true of WeChat and **false of WhatsApp**. It reads as one
sentence only because it packs two different things into one word: WeChat's store
is **encrypted** with the key in **process memory**, while WhatsApp on macOS does
**not encrypt it at all**. Fence 13 refuses the former; the latter is an ordinary,
user-authorized, read-only file read. The distinction is not wording — it decides
whether this whole class is "we can only look at a screen" or "on the machine
running the official client there is a seconds-latency lane with a real anchor".

#### The platform matrix (the class's actual shape)

| Platform | Official client | Local store | Our source |
|---|---|---|---|
| **macOS** | WhatsApp for Mac — the **Catalyst** build (Mac App Store); the old Electron build was announced deprecated in 2024 | `~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite` (sibling variants `.private` and `group.net.whatsapp.family`) — a Core Data store, **unencrypted**, plain `sqlite3` reads `ZWAMESSAGE` / `ZWAMEDIAITEM` | **`'store'`** (past the TCC gate below) |
| **Windows** | WhatsApp Desktop (both the UWP and the newer WebView2 architectures) | `%LOCALAPPDATA%\Packages\5319275A.WhatsAppDesktop_cv1g1gvanyjgm\LocalState` — SQLite, **encrypted**: UWP uses the SQLite Encryption Extension (SEE) with a dbKey derived from a machine-unique identifier the app does not expose; the WebView2 line protects its keys with DPAPI-NG | `'ui'` — reconstructing a key the vendor withheld is the same act as reading process memory (fence 13) |
| **Linux** | **No official desktop client at all**; the only official route is WhatsApp Web | Does not exist | `'ui'` (web-in-profile) |
| **any** | WeChat desktop | SQLCipher / WCDB **encrypted**, key only in the **running client's process memory** | `'ui'` (fence 13, unchanged) |

#### So `scanSource` is not a static per-kind fact

One WhatsApp adapter reads a store on macOS and scrapes a screen on Linux. `caps`
is by definition the static per-**kind** declaration (§2), and "what exists on this
machine" is a per-**deployment** fact — which is **word for word** why r4 deleted
`caps.pushExclusivity`, so it gets the same treatment. The scalar
`caps.scanSource` is **deleted**, replaced by

- `caps.scanSources` — a per-platform table (`{ darwin:'store', win32:'ui',
  linux:'ui' }`), a static **upper bound**, in the same direction as
  `convCaps ⊆ caps`: resolution may only narrow, never widen;
- `caps.scanLatency` — a number **per source** (`{ store: 15, ui: 300 }` seconds),
  because the two routes are an order of magnitude apart; it is both the
  **declared** cadence and the **ceiling** the `fs.watch` kick is debounced to
  (§6.4), while the number drawn on the conversation row is the **measured** age
  (property 1 below);
- `caps.historyBySource` — **the second field with the same reason** (r6):
  `{ store:'since', ui:'page' }`. `history` was a per-**kind** scalar, and the
  paragraph above has just finished arguing that in this class **one adapter runs
  both cells** — so no value of that scalar is right: `'since'` asks the Linux cell
  to honour since-anchor semantics with a DOM scrape, and `'page'` deletes the "real
  anchor ⇒ `history:'since'`" that decision 19 and §5 invariant 2 give as **the**
  reason `'store'` is preferred at all. Same upper-bound table, same resolver, and
  §4's contract rule covers both halves ("no value may be `'none'`" and "the keys
  must cover every source `scanSources` names");
- the **one** resolver in `src/channel-caps.js`,
  `scanState(caps, adapterRecord, hostFacts, now)`, folding platform, client
  presence, read grant and the **age** of those machine facts into one answer — the
  same shape and the same law as `laneState` (*there may be only one place that
  folds them into an answer*), and, like it, answering `via`.

```js
scanState(caps, adapterRecord, hostFacts, now)
      -> { via:     'scan',                  // r6: the discriminator, so freshnessClaim's union
                                             //     with laneState()'s answer is explicit
           source:  'store'|'ui'|null,       // the source actually carrying this conversation NOW
           history: 'since'|'page'|null,     // r6: caps.historyBySource[source], RESOLVED
           carryContent: false,              // r6: a scan pass is a BATCH (§6.4) — always
           why:     'store'|'no-store-on-platform'|'store-encrypted'
                    |'client-not-installed'|'tcc-denied'|'user-chose-ui'
                    |'host-facts-stale'|'no-source',
           latencySeconds,                   // caps.scanLatency[source] — the DECLARED cadence,
                                             // and the fs.watch debounce ceiling (§6.4)
           storePath,                        // only when source==='store'; never logged
           grant:   'granted'|'needed'|'denied'|'unpromptable'|null,
           hostFactsAgeSeconds }             // r6: now - hostFacts.at; the panel says it out loud
```

The precedence is written down the same way: **facts fresh > platform declaration >
client presence > read grant > `'ui'`** (r6 puts the freshness rung first: every
rung below it reads `hostFacts`, so a stale record makes all four of them answer
about a machine as it was, not as it is). And it carries one **deliberate** exception,
without which this resolver becomes the thing it exists to prevent:

> **A refused read does not silently degrade to `'ui'`.** `tcc-denied` is a
> **named** answer (`source: null`) that the connect wizard renders with the grant
> steps; falling back to `'ui'` is a **choice the user makes** in that wizard
> (`user-chose-ui`), not a degrade the product performs on their behalf. The reason
> is property 1 below: the latency number on the conversation row is the **whole**
> honesty contract of this class, and quietly swapping a 15-second lane for a
> 5-minute one is precisely how that number becomes a lie. The mirror of the same
> rule holds too: a client that is not installed answers `null` with a reason
> (`client-not-installed`), never an empty scan — an empty result is byte-identical
> to "we were not looking", which is fence 8's shape.

#### The risk statement, per platform

- **WhatsApp.** On **macOS** the official Catalyst client leaves its entire chat
  history in an **unencrypted** Core Data SQLite store, so `scanSource: 'store'` is
  an ordinary read-only file read: a real anchor, seconds of latency, no
  agent-browser and no second login — and where it exists it is **preferred over**
  `'ui'`. On **Windows** and **Linux** that route does not exist (the store is
  encrypted there; there is no official client at all here), leaving the official
  Web client inside an agent-browser profile, i.e. `scanSource: 'ui'`. **Sending is
  stated per source, because it is not one act (r6 correction)**: r5's sentence
  "sending is the same act on both routes — typing into that logged-in official
  client's own composer" is true of `'ui'` (an agent-browser typing into a web page)
  and **undefined** on macOS, where the official client is a **native Catalyst app**
  that no browser profile can reach. So: `'ui'` = an agent-browser typing into that
  Web client's composer, identity really is the user (`identityMarking: 'none'`);
  macOS `'store'` has **no send lane of its own** (a store is read-only evidence)
  and exactly two candidates, and **this design does not pick for the owner** (§21,
  decision 19): (a) the same Web client in a profile — which is a **SECOND
  linked-device credential**, two logins for one conversation, and must be modelled
  as its own row beside `auth.state()`/`scanState().grant` — or (b) native macOS UI
  automation (Accessibility / CGEvent), a mechanism this document had never named
  and which needs **its own** TCC grant. Until one of them is wired, this class is
  **read-only** on macOS, and structurally so: `convCaps.sendAs` resolves to `[]`
  with `why:'no-send-lane-on-this-host'`, which §4's existing rule renders as
  not-offered-with-a-reason and which stops any proposal being created. The other
  route is a protocol library (whatsmeow / Baileys): reverse-engineered
  **unofficial clients**, and
  unofficial clients are explicitly prohibited by WhatsApp's terms; public
  reporting has bans landing on low-volume, reply-only, otherwise legitimate use,
  and the compliant alternative is the official Business Cloud API through a
  certified provider (bot identity, hence `identityMarking: 'marked'`). ⇒ the
  protocol-library route is `tosRisk: 'prohibited'`, not offered by default
  (fence 13, decision 19).
- **WeChat — not one word changes.** The desktop store is SQLCipher/WCDB-encrypted
  and the key exists only in the **running client's process memory** — which is
  where every public tool extracts it from. **Reading another process's memory is
  not something this product does** (fence 13), so WeChat's `'store'` route **does
  not exist** and `'ui'` is all that remains on every platform. WhatsApp gaining a
  route on macOS gives WeChat **nothing**: what separates them is not the platform,
  it is **whether that store is encrypted**.

#### The `'store'` cell's own ingest contract (r5)

- **The anchor is real.** The message table carries both a rowid and the client's
  own message id, so `ChannelRecord.vendorId` gets a **real** vendor id and
  `raw.synthetic` stays false — §5 invariant 2 needs no synthetic key here. *That*
  is the real reason `'store'` is preferred where it exists: not that it is faster,
  but that **its key is not one we invented**, so a re-scan collapsing to one record
  is a platform guarantee rather than a bet of ours. The cursor is the pair
  `(rowid, timestamp)`: rowid is monotonic, the timestamp realigns after the store
  is replaced.
- **What "a complete pass" means.** A pass records the maximum rowid at its start
  and reads to it ⇒ `complete: true` and the anchor advances; any failure part-way
  (store swapped, read refused, process exit) ⇒ `complete: false`, the anchor does
  **not** move, and the next pass re-reads. Same rule as §5 invariant 4, different
  evidence.
- **Never write — and before r6 the mechanism this bullet PREFERRED was the one
  that breaks it.** r5 wrote "prefer the backup API or `VACUUM INTO`, because
  'open the live store read-only' is not sufficient on a WAL database", and both
  halves are wrong in a way that made them prop each other up: what **silently
  omits** the most recent messages is reading the **`.db` file alone** (it does not
  contain the WAL), while opening it **read-only** reads WAL content — and
  meanwhile the preferred mechanism's source connection can only be the **default**
  (read-write) open, which is the one open that mutates the store. The rule becomes:
  **open the live store with `SQLITE_OPEN_READONLY` (`file:…?mode=ro`), then run
  `VACUUM INTO` / the backup API FROM that read-only connection into a scratch
  snapshot, and read the snapshot.** Measured on a throwaway fixture (node v24.12.0
  `node:sqlite`; a producer SIGKILLed leaving an un-checkpointed WAL — `db` 8192 B
  sha `b383fc2c3cf06e24`, `-wal` 4152 B, `-shm` 32768 B; every arm starts from a
  byte-identical copy):

  | arm | rows read | `db` | `-wal` | `-shm` |
  |---|---|---|---|---|
  | default open, **we are the only connection** | `OLD1,OLD2,`**`NEWEST`** | **rewritten** `ee24f1b1…` | **DELETED** | **DELETED** |
  | default open, a client connection held open | same three | identical | identical | identical |
  | `readOnly:true`, only connection | `OLD1,OLD2,`**`NEWEST`** | identical | identical | rewritten |
  | `readOnly:true`, client connection held open | same three | identical | identical | identical |
  | `readOnly:true`, `-shm` unwritable | `OLD1,OLD2,`**`NEWEST`** | identical | identical | identical |
  | `VACUUM INTO` from the read-only connection | snapshot has all three | identical | identical | rewritten |
  | `backup()` from the read-only connection (async) | snapshot has all three | identical | identical | rewritten |
  | reading the **`.db` file alone** | `OLD1,OLD2` — **NEWEST missing** | identical | identical | identical |

  The first row is SQLite's documented **last-connection checkpoint-and-delete**,
  and "our process is the last connection" is the NORMAL case for a scheduled
  background scan (the owner quit the client / rebooted / is away) — it is also
  exactly the shape of §17's synthetic fixture. `-shm` is the WAL index, carries no
  message content, and a read-only open leaves it **untouched** when it cannot be
  written — so the assertable form of "never write" is **`db` and `-wal`
  byte-identical**, never the triple (see §17). Never checkpoint, never delete the
  WAL, never take the **default** (read-write) open — this lane's only observable
  effect on that client must be one brief shared lock. Copying the `db` / `-wal` /
  `-shm` triple **stays as the fallback** for when `-shm` cannot be attached, with
  its cost stated: it is a **torn-read** hazard (the client may checkpoint mid-copy)
  that the read-only open avoids.
- **Which SQLite reader — a decision that belongs here (r6).** This lane runs
  inside the **daemon**, and the daemon ships as a single-file esbuild bundle with
  exactly ONE `--external`, `node-pty` (package.json `build:agentd`); the installer
  calls that bundle "zero-dep", sets `NODE_MIN=18`, and installs node-pty
  separately as explicitly best-effort and non-fatal. Every candidate therefore
  collides with a constraint this repo has already written down, so the choice is
  made here rather than left to the implementer: ① **recommended: a bounded child,
  `sqlite3(1)`, one spawn per pass** — fence 3's sanctioned shape ("once per pass,
  not per item"), macOS ships `/usr/bin/sqlite3`, and `VACUUM INTO` works from the
  CLI; ② `node:sqlite` behind a **runtime capability probe** and with a **stated
  `NODE_MIN` bump**: it does not exist on Node 18/20 (added in 22.5.0), still emits
  `ExperimentalWarning` on Node 24 (measured), and its **row-reading API is
  synchronous** (`DatabaseSync`/`StatementSync` — its `backup()` *is* async, so the
  hazard is the row scan, not the snapshot copy), while CLAUDE.md says this daemon
  "carries live session pipes — revisit only with daemon-side worker isolation",
  which is fence 3's own law; ③ **a native binding (`better-sqlite3`) is refused**,
  with the bundle as the reason: it needs a second `--external` plus a per-platform
  prebuilt shipped to that Mac — the node-pty story, which is degradable for
  terminals and **is the feature** here. When no rung is available, the
  `channels-scan-store` op answers with a **named** refusal `no-sqlite-reader` —
  never zero messages (fence 8's shape). `test-architecture`'s SHARED rule cannot
  see any of this (node builtins are allowed); only the daemon bundle would, at
  build time.
- **TCC is a named gate.** macOS Sonoma 14 introduced protection for app data
  containers under `~/Library/Application Support/`, and Sequoia 15 **extends** it
  to `~/Library/Group Containers/`; a process that is neither signed with that
  client's Team ID nor deployed through the Mac App Store either receives a
  (per-process-instance, temporary) consent prompt or is denied outright. So this
  lane's failure shape is an `EPERM`, and it must reach the user under the name
  `tcc-denied` with the grant steps in the connect wizard (§13) — **never as a
  successful scan that read zero messages**.

**Which machine it runs on: an agentd op, with `hostId` as a parameter.** The store
lives on whichever machine runs the client, so the code that reads it has to run on
that machine — which is exactly the CS separation law's shape, and **the local box
is device #0** (`hosts.device(falsy)`), so there is no "one for local, one for
remote" here: one `channels-scan-store` op (daemon-side handler + a capability in
the hello-ack + the three-touch rule), one implementation, and `hostId` moving from
v1's `local` to a paired Mac is a parameter change. This also gives §15's "adapters
on a paired device" row its **first real consumer** rather than a reservation —
because this class *is* that shape: the official client runs on the owner's Mac and
VibeSpace runs elsewhere.

#### The `'ui'` cell's own ingest contract (r4, kept)

`'ui'` is no longer "this class as shipped" (WhatsApp on macOS takes `'store'`), but
it is still the only source for **Windows, Linux and all of WeChat**, so not one of
these three lines is dropped — and the cursor in §6.3's "both are periodic scans
with a cursor" is, in this cell, this:

- **The anchor.** Prefer the client's own message id; when the client exposes no
  stable id, the adapter must **declare** a synthetic key
  `(convId, renderedAt, sha256(author|text))` written to `ChannelRecord.vendorId` with
  `raw.synthetic: true` — so §5 invariant 2 still has a key, and the fact that we
  made it up is **visible** (it is what decides whether a re-scraped screen collapses
  to one record). Its cost is stated: two byte-identical messages from the same author
  inside one render tick collapse into one, which is better than minting duplicates on
  every scroll — and both directions are pinned by the parity leg below.
- **What "a complete pass" means** for a scroll-bounded read: scrolled back to the
  stored anchor ⇒ `complete: true`; hit the scroll limit first (the client will not
  give any more) ⇒ `complete: false`, i.e. **the anchor does not move** and the next
  pass re-reads. Same rule as §5 invariant 4, different evidence.
- **`history: 'none'` is forbidden on `receive: 'scan'`** (§4's contract rules). §5
  invariant 4 wants a complete pass and a `complete:false`, and an adapter with no
  paging call can report neither; §4 makes an undeclared capability **throw**, so
  §6.3's "stop at the stored anchor" cannot happen on it. **This holds for both
  cells**: `'store'` satisfies it with `'since'`, `'ui'` with `'page'`, and `'none'`
  has no legitimate spelling on this lane.

**Three properties the class shares**, all of which fall straight into machinery
that already exists:

1. **There are TWO numbers on the conversation row, and the row must say which one
   it is showing (r6 correction).** r5 wrote "latency comes from `scanState`, not
   from a static declaration", and that is **not true as written**:
   `scanState().latencySeconds` is defined two lines above it as "from
   `caps.scanLatency[source]`" — a static per-kind table, merely INDEXED by the
   resolution. Both numbers are real and both are owed: the **declared cadence** is
   `caps.scanLatency[source]` (indexed by `scanState`'s resolution; it is also the
   `fs.watch` debounce ceiling, §6.4), the **observed age** is
   `convEntry.lane.lastScanAt` against `now`. The row draws the latter, and
   `freshnessClaim(caps, scanState(…), convEntry, now)` answers "last scanned <t>
   ago" for `scan` — which it can only compute because it is **handed that clock**
   (§4's contract rule). The AssignFilter panel says it before the user hands that
   lane a job. A lane that scans every five minutes is honest for on-call triage and
   dishonest for live customer chat — the product's job is to make that difference
   visible **before** the assignment, not after. This is also exactly why a refused
   read does not auto-degrade: the same adapter draws two different numbers on two
   machines, and both of them have to be true.
2. **The credential is not a token, it is a logged-in client — and on `'store'` it
   is two facts.** `auth.state()` answers "is the client in that profile still
   logged in", and `needs-reauth` means "open the live view and scan the code
   again", not an OAuth round trip. The `'store'` route adds an **orthogonal**
   second fact on top: whether we are authorized to read that file
   (`scanState().grant`). The two are stored and rendered separately: the client can
   be logged out while the store is still readable (readable, but no longer
   updating), and the grant can be revoked while the client is still logged in (it
   is updating, but we cannot see it) — folding those into one boolean makes one of
   them wear the other's wording. **And both facts EXPIRE, while the grant is never
   trusted across a pass (r6)**: `hostFacts` carries a 6 h TTL and three named
   refresh triggers (§4 / §5 invariant 7), and a stored `grant:'granted'` is a claim
   that expires **by construction** — a macOS TCC grant is revocable in System
   Settings at any moment and decision 19(d) records the prompt itself as
   per-process-instance and temporary ⇒ the op's own `EPERM` is the authority, and a
   `granted` that comes back `EPERM` re-files as `tcc-denied` and clears the stored
   grant.
3. **It is the first real use case for adapters on a paired device** (§15): the
   adapter has to run on whichever machine the client runs on. The interface
   already takes a machine handle, so that is wiring rather than a rewrite — and
   the `'store'` route turns that row from "will be useful one day" into a
   **precondition** of P6: a `channels-scan-store` op on a paired Mac is the best
   lane this class has.

**Scheduling and gating:** the interface carries every slot this class needs from
P0 (`scan` / `scanSources` / `historyBySource` / `scanLatency` / `scanState` /
`convCaps` / `tosRisk`),
and the fake adapter really runs a scan mode **with both sources**, so the lane is
inside `test-channels-lane-parity`'s coverage from day one. The WhatsApp and WeChat
adapters themselves are **P6**: the `'ui'` half is gated on decision 19 and on the
agent-browser system landing, while the macOS `'store'` half is gated on decision 19
**alone** — it needs no agent-browser, which makes it the one leg of this class that
could land on its own today, **and which is exactly why it is READ-ONLY (r6)**: that
leg's deliverables contain no send path, so it must **say so** — `convCaps.sendAs`
resolves to `[]` with `why:'no-send-lane-on-this-host'`, rendered by §4's existing
not-offered-with-a-reason rule.

---

## 13. Secrets, expiry, failure

- **How tokens are stored, encrypted and redacted is stated once, in §14.** Channels' own
  tokens live under `data/channels/`, encrypted with §14.7's `src/secret-box.js` (its own key
  file `data/.channels-key`, 0600), redacted through the same `publicView()` shape, never
  logged, never in argv. Because §14 exists, that extraction has **moved from P1 to a P0
  prerequisite** (§19), so r2's "if the extraction slips, the twin is NAMED" becomes a stronger
  constraint this round: it may not slip.
- **This layer and §14's layer are two different things, and must stay that way.** §14 stores
  the app / client credentials and API keys **an admin could hand you** (cluster defaults,
  resolved by KEY, rotatable by the cluster); this stores the tokens **you authorized yourself**
  (one user, one consent, one expiring refresh token). Their lifetimes, rotation and export
  rules all differ — folding them into one store is precisely the twin this design keeps
  refusing (§14.11, fence 8).
- **Auth state is three-valued and honest:** `connected` / `needs-reauth` (with
  the expiry instant and a countdown) / `unknown` when the token record cannot be
  read. Never optimistic. The Adapters row renders exactly this.
- **The local-client class has two orthogonal credential facts, and each renders
  on its own** (r5, §12.5). `auth.state()` answers "is that official client still
  logged in"; `scanState().grant` answers "does the operating system let us read
  what it wrote". **`tcc-denied` is a named refusal, not an empty scan**: the
  connect wizard renders it as a row with steps ("grant this daemon Full Disk
  Access, then retry" on macOS), the adapter row turns amber, and this class's scan
  does **not** quietly fall back to a UI scan at that moment — falling back is a
  button the user presses in that wizard. The reason is fence 8's: a successful
  scan that read zero messages and a refused read are byte-identical downstream,
  and one of them is a lie.
- **Failure reaches the user.** N consecutive failed passes (default 3) turns the
  row amber and files one "For you" item naming the adapter and the vendor's own
  error text; recovery **retracts** it. A `rate-limited` backoff shows as a
  countdown, not an error.

---

## 14. Integration credentials and the configuration UI

> **Owner directive (2026-09-11, verbatim):** "对于指纹浏览器和 communication panel 这种可能需要
> 配置自己的 key 的情况, 要考虑怎么提供配置界面, 让我们集群里的用户可以自行配置(当然 lark 这种
> 集群里能提供默认 oauth client 的就提供默认)" — *for things like the fingerprint browser and the
> communication panel, which may need the user's own key, work out how to offer a configuration UI
> so users in our cluster can configure it themselves (and where the cluster can supply a default
> OAuth client, as with Lark, supply one).*
>
> This section is a **shared layer**, not an appendix to this design: the same names serve
> `docs/design-agent-browser-v2.md`'s `cloak` / `cloud:<name>` backends (that design still lives on
> another branch — §21 item 20). **Both documents use the same names, and the names are defined
> here.**

VibeSpace runs in **two shapes**, and the whole reason this section exists is that those two shapes
answer differently about the same key: a **pod per user** in the cluster (the helm chart injects that
instance's own public address as `VIBESPACE_PUBLIC_URL` —
`deploy/helm/vibespace-user/templates/main.yaml:172-176`), and single-user self-hosted installs. Some
integrations need a key **each user pays for** (CloakBrowser seats, cloud browser providers); some can
be served by one OAuth app the cluster **registers once** (Lark); and one family **already has** a
cluster-preset mechanism (Google Drive / Gmail).

Today those three are each their own thing. Adding one more integration means inventing one more env
parser, one more encryption helper, one more UI. This section folds them into **one PURE table, one
store, one window**, and pins the precedence to a single sentence: **the user's own > the cluster
default > none**.

### 14.1 The three precedents already in this tree, and the one place to avoid

This layer invents no mechanism. It folds three things already running in production into one, and
each row names what it copies:

| Precedent | Where it lives | The rule this layer copies |
|---|---|---|
| Drive / Gmail **cluster presets** | `src/mounts.js:2189-2206` `drivePresets()`: env `VIBESPACE_GDRIVE_CLIENTS` = JSON `[{key,label,clientId,clientSecret}]`, the legacy pair `VIBESPACE_GDRIVE_CLIENT_ID`/`_SECRET` = key `'default'`; `_driveClient()` `:2211-2216` resolves **custom client on the record > the chosen preset > the single or `'default'` preset > the tool's built-in**; the UI at `src/lib/sidebar-mounts.js:1747-1751` offers the preset dropdown and `Custom (own client id/secret)`, with the `type:'password'` custom-secret field at `:1771` | **A record stores only the preset KEY** ⇒ rotating the env rotates every consumer (`:2187-2188` says exactly that in a comment), plus the shape of that precedence ladder |
| frp's **cluster default + user override** | `src/plugins.js:569-580` `_frpCfg()`: the user's value in `data/plugins.json` wins over the cluster env, and `fromEnv` hands the UI "this came from the cluster" as a **fact**; `:694` exposes `hasToken`, never the token; `:584-588` makes the plugin **default-enabled** when the cluster injected the env; `:679-682` names **which field is missing** | User override > cluster default; `fromEnv` is a fact the UI must render; **only ever report `hasToken`**; and "name the gap" — those three comment lines record incident 2.227.10, where a user had filled in address and port, left the token empty, and the UI only said "relay not configured": an unactionable dead end |
| Encryption at rest | `src/mounts.js:369-381` `_enc`/`_dec` (aes-256-gcm, `iv.tag.data` base64 triple), key file `data/.mounts-key` (`:47`, 0600) | The same primitive, but **extracted to `src/secret-box.js`** (§14.7) — and deliberately **not** inheriting the bare catch in `_key()` `:360-367` |

There are exactly two places not to put this, and both are the convenient-looking ones:

| Not here | Why |
|---|---|
| **Settings** | **No secret goes in settings, not one.** Settings ride the SyncStore: every value is broadcast to every connected client; and `/api/config/export`'s `take('settings', readSettings)` (`src/routes/persistence.js:697`) writes the whole settings object into the export file **in plaintext** — it is not in the `sensitive` half (`:679-686`), which is the only half that requires a passphrase. Putting a key in settings does both "broadcast to every open tab" and "plaintext into a backup file", and neither of them says so |
| **A plugin card** | frp's relay token **stays** in its plugin card (§14.6 records it as a **named** twin). It is configuration for a plugin **process lifecycle**, consumed by the keeper, not by a feature that asks `resolveIntegration()`. Moving it means moving all of it (the card, the `fromEnv` default-enabled rule, the keeper's read), which is a change nobody asked for |

### 14.2 `src/integration-registry.js` — the PURE table

**PURE, imports nothing.** One integration = one row:

```js
{
  id: 'lark',
  label: 'Lark / 飞书',
  fields: [
    { key:'appId',     label:'App ID',     secret:false, required:true,
      placeholder:'cli_…', help:'Developer console → credentials', validate:(v)=>… },
    { key:'appSecret', label:'App Secret', secret:true,  required:true,
      help:'Same page; it is only ever written, never read back' },
  ],
  clusterEnv: { json:'VIBESPACE_INTEGRATIONS', prefix:'VIBESPACE_INTEGRATION_LARK_' },
  test: { kind:'credential-exchange',
          describe:'Exchange this app id / secret pair for a token. Reads no conversation, sends no message.' },
  consumers: ['src/channels/lark.js', 'src/channels/live/lark.js'],
  docs: 'https://open.feishu.cn/…',
}
```

The rules, each with an assertion that goes red:

- `validate` is a pure function returning `{ok:true}` or `{ok:false, why}` — a **named** complaint,
  never a silent reject, and it never rewrites the value (the one permitted rewrite is trimming outer
  whitespace, which happens in the store and is written on the field's help, §14.3).
- `clusterEnv` is a **union**: `{json, prefix}` (this layer parses it) **or** `{via:'drive-presets'}`
  (this layer asks the **existing** reader). **An env name may have exactly one parser**, enforced by
  the census — which is why the `gmail` row **delegates** to `MountManager.drivePresets()` rather than
  copying it.
- `test.kind` is a **closed set**, and it decides the button's own wording, because "the error text is
  not a diagnosis" holds in reverse too — a button that claims to have tested a connection it never
  made is lying:

  | `test.kind` | What it actually does | What the button says |
  |---|---|---|
  | `credential-exchange` | One **bounded** vendor round trip exchanging this pair for a token; reads nothing, writes nothing | Test connection |
  | `shape-only` | **Zero network**: checks field shapes and builds the consent URL | Check format (no network) |
  | `reachability` | Probes only whether the vendor host answers; carries no credential | Test reachability |

- `consumers` must be **live**: the census requires each name to be a file that exists **and** to
  actually call `resolveIntegration('<id>')`. A row with no live consumer is a card that does nothing,
  which is the same law as `SPEND_REASONS` and as `contributes.channelAdapters` (§15).
- **This layer adds no settings.** Its bounds (the Test timeout, one in flight per id) are constants in
  this module ⇒ the `SETTINGS_CATEGORIES` §44 census has nothing to do with this layer, which is the
  point: there should be no broadcast knob sitting next to a secret.

This design's own three rows (the browser's two row ids live in its own document):

| id | Fields | Cluster default | What a Test click does | Consumers | When the row lands |
|---|---|---|---|---|---|
| `lark` | `appId` (not secret) · `appSecret` (secret) | **Expected** — the cluster registers a Lark app and injects it. But it only holds **inside one tenant**, and that is not a disclaimer, it is a hard constraint (§14.9) | `credential-exchange`: exchange one `tenant_access_token` (the self-built-app endpoint, which needs only app id + secret). Lists no conversation, sends no message | `src/channels/lark.js`, `src/channels/live/lark.js` | P1 |
| `gmail` | `clientPreset` (not secret, options from the delegate) · `clientId` / `clientSecret` (secret, only under "use my own") | `{via:'drive-presets'}` — **reuses** `VIBESPACE_GDRIVE_CLIENTS`, adds no second parser | `shape-only`, and **it says so**: a Google OAuth client id/secret pair exchanges for nothing on its own (there is no client-credentials path for it), so all that is possible here is a shape check plus building the consent URL — the real verdict is that OAuth round trip | `src/channels/gmail.js` | P1 |
| `whatsapp-business` | `phoneNumberId` (not secret) · `accessToken` (secret) | **None, and there should be none**: this is a per-number billed commercial API credential, so a cluster-injected one means the cluster pays everyone's bill | `credential-exchange` (read the number's metadata once) | — none today | **Not in v1.** §14.2's census requires `consumers` to be live, and today this route is only the *name* of the compliant alternative in §15; the row **lands in the same commit as its adapter**. It is written here to fix the fields and the "no cluster default" answer in advance, not to put an empty card on screen |

### 14.3 `src/server/integration-store.js` — resolve, mask, broadcast

On disk (through `writeJsonAtomic`, like every `data/*.json`):

```json
{ "version": 1,
  "integrations": {
    "lark": { "source": "user",
              "values": { "appId": "cli_…", "appSecret": "<secret-box blob>" },
              "updatedAt": 1789…, "testedAt": 1789…, "lastOk": true, "lastError": null } } }
```

- `resolveIntegration(id)` → `{source:'user'|'cluster'|'none', values, label, fromEnv, testedAt,
  lastOk, lastError, missing:[]}`. Three invariants:
  - under `source:'cluster'` the `values` are resolved from the env **at read time** and are **never**
    copied into `data/integrations.json`. This is the mirror of mounts' "a record stores only the KEY"
    (`src/mounts.js:2187-2188`): the cluster rotates the env once and every consumer on every instance
    rotates with it. Copying the values down means leaving a revoked credential on N instances.
  - the cluster default **disappearing** (an admin removed the env) while a user sits on `'cluster'`
    ⇒ answer `source:'none'` and **name** the missing cluster default; never hand out a broken adapter
    in silence.
  - a required field missing ⇒ `missing:['appSecret']`, per the incident named in the comment at
    `src/plugins.js:679-682`: **say which field**, never make the user guess.
- `publicView(id)`: every `secret:true` field becomes `'••••'`, and carries the last 4 characters
  **only** when the value is ≥ 12 characters long (for a short secret, the last 4 are most of it).
  Non-secret fields pass through. **This masked view is what the broadcast carries**, and it is all a
  `GET` can ever obtain.
- `setIntegration(id, patch)`: **omitting a secret field leaves it unchanged; `''` clears it.** That
  distinction is not style, it is the rule this codebase has already been bitten by — on an
  always-emitted field `null` is a statement and only `undefined` is absence (2.369.62's `effortNext`)
  — so it is an invariant with a negative control. The one permitted rewrite is **trimming outer
  whitespace**: a pasted secret often carries a trailing newline, and "it failed because of a
  character you cannot see" is precisely what this UI exists to prevent; the rewrite is written on the
  field's help, because a rewrite nobody states is indistinguishable from a bug.
- `useClusterDefault(id)`: drop the user override (and its ciphertext) and go back to `'cluster'`.
  **With no cluster default present it is a named refusal**, not a silent no-op.
- `test(id)`: run that row's **declared** test and record `{testedAt, ok, error}`. Three constraints:
  1. **the store constructs no vendor request itself.** It calls the runner the consumer registered at
     wiring time (`registerIntegrationTest(id, fn)`), and that consumer **already** declared its host
     in the §3.1 egress whitelist ⇒ `test-channels-egress` needs no new line, and this layer never
     becomes a second file holding N vendor hosts.
  2. one in flight per id, bounded timeout, **human-clicked only** (§14.11).
  3. a row declaring `test` with no registered runner = a dead control ⇒ the census goes red.
- Every write broadcasts `integrations-updated` carrying the `publicView` — a server cache a client
  also caches must **notify** at its entry point (the 2.309.0 law), and the only thing that broadcast
  can carry is the masked view.
- **A `testedAt` does not stay green forever.** The card shows the verdict **and its age**; a verdict
  never outlives the reading it describes (the same shape as the quota-model r3 law).

### 14.4 Routes

- `GET /api/integrations` — per row `{id, label, fields (declarations only, no values), source,
  fromEnv, set:{<field>:bool}, masked, missing, testedAt, lastOk, lastError, consumers, docs}`.
- `PUT /api/integrations/:id` — `setIntegration` (omitted = unchanged, `''` = cleared).
- `POST /api/integrations/:id/test` — the human-clicked one, bounded.
- `DELETE /api/integrations/:id` — back to the cluster default; back to `none` when there is none.
- All behind the existing cookie auth; and **no route ever reads a secret field back in plaintext** —
  not `GET`, not "let me peek". The UI offers **Replace, never Reveal**: a secret that can be read back
  is a secret one XSS or one shoulder-surfed window can read back.

### 14.5 The UI: ⚙ → Integrations (集成与密钥)

- **Window type `'integrations'`, `singleton: true`**, registered with
  `registerWindowType({type:'integrations', label, icon, action:'openIntegrations',
  replay:(app,spec,{syncId})=>app.openIntegration(spec.focus,{syncId})})` — byte-for-byte the shape of
  `src/lib/jobs-panel.js:387-394`, so layout restore, cross-client sync, desktops, tab groups and the
  taskbar are free and `replayOpenSpec` cannot silently drop it. The openSpec is
  `{openIntegrations, focus:'<id>'}`; **a `focus` naming an id that no longer exists opens the window,
  highlights nothing, and does not throw** — a removed row must not fail a layout restore.
- **One ⚙ menu row**, next to `Plugins…` (the `1_admin` group at `src/lib/gear-menu.js:77`), through
  `registerMenuItem` rather than a new chrome primitive.
- **Cards** rendered in the `plugin-card` language of `src/lib/plugins-ui.js:41-70`, one per row:
  - a **source chip**: `Cluster default` / `Your own` / `Not configured` (it reads `source` and
    `fromEnv`);
  - a pair of radios: **"Use the cluster default"** vs **"Use my own key"** — with no cluster default
    the first is disabled *and says why*;
  - the declared fields. A secret field shows `••••1234` plus a **Replace** button (which is what
    reveals an empty `type:'password'` input); non-secret fields are editable in place;
  - a **Test** button whose label comes from `test.kind` (§14.2), beside **the last verdict, its age,
    and the vendor's own error text** (through `escHtml`);
  - one **"Where is this used"** line generated from `consumers` — before deciding to replace a key, a
    user is entitled to know what it will move.
- **Every consumer deep-links to its own card**: `app.openIntegration(id)`. This design's connect
  wizard (§10.1) opens it **first** when the row is unconfigured; the browser backend switcher opens it
  when the user picks `cloak` / `cloud:*` with no key.
- **≤768px renders the same cards, single column** — the same path as the Plugins surface, not a second
  renderer.
- **Name the collision**: `SETTINGS_CATEGORIES` **already has** an `Integration` category
  (`src/lib/settings-schema.js:941`) holding the `agents.*` "what the agent can see" switches
  (`:334-362`) — a different question from this window. So the window's Chinese name is **集成与密钥**
  (integrations *and keys*), and that settings category **does not change by one word**.

### 14.6 Precedence, and the standing grep census

- Precedence: **the user's own > the cluster default > none.** A value the user set explicitly is
  **not** overridden by a cluster default injected later — the same rule as `_frpEffectiveEnabled`
  (`src/plugins.js:584-588`): an explicit value wins, only `undefined` follows the env.
- **A consumer never reads `process.env` itself.** It asks `resolveIntegration(id)`. Standing sweep:
  `process.env.VIBESPACE_INTEGRATION` (including `VIBESPACE_INTEGRATIONS`) appearing anywhere outside
  `src/server/integration-store.js` = red.
- There is exactly one named exception: `drivePresets()` at `src/mounts.js:2189` reads
  `VIBESPACE_GDRIVE_CLIENTS` — it predates this layer and has its own consumers, and the `gmail` row
  **delegates** to it (`{via:'drive-presets'}`) rather than copying it. The census therefore also
  asserts **one parser per env name**: two rows declaring the same env name, or a name declared by
  both a row and a delegate, go red.
- **The named twin**: the frp plugin's relay configuration (§14.1). Until it moves,
  `kb-file-structure.md` carries a line saying "two places do this one thing, and here is why they are
  not merged today" — an unnamed twin is how this codebase gets bitten.

### 14.7 `src/secret-box.js` moves from P1 to P0, and the defect it must **not** inherit

This layer stores ciphertext from its first commit, so §14's existence promotes the `src/secret-box.js`
extraction from P1 to **a P0 prerequisite** (§19 re-prices the rounds).

- **One primitive, N key files.** `secretBox(keyFile)` is a factory: mounts keeps its own
  `data/.mounts-key` (`src/mounts.js:47`), this layer uses `data/.integrations-key`, and the channels
  tokens use `data/.channels-key` (§13). The reason is blunt: moving a key file is an **irreversible
  data-loss path** bought for one fewer file, and when a key is rotated or damaged the blast radius
  should stop at one store.
- **The ciphertext format does not change by one byte** (`iv.tag.data` base64 triple, aes-256-gcm),
  enforced by a parity test: encrypt with a **patched copy** of the pre-extraction `_enc`, decrypt with
  `secret-box`, then the other way round. That is this repo's negative-control idiom.
- **The defect it must not inherit (read out of the code, not assumed).** `_key()` at
  `src/mounts.js:360-367`:

  ```js
  _key() {
    try { return Buffer.from(fs.readFileSync(this._keyFile, 'utf-8').trim(), 'hex'); }
    catch {
      const k = crypto.randomBytes(32);
      fs.writeFileSync(this._keyFile, k.toString('hex'), { mode: 0o600 });
      return k;
    }
  }
  ```

  That catch is correct only for **ENOENT**. For any other read failure (EACCES, EMFILE, EIO, a
  truncated or emptied file) it **mints a new key and overwrites the old one** — after which every
  stored ciphertext is unreadable forever, and **it says nothing at all**. It is masked today only
  because the file is 0600, owned by the server process, and read rarely; fd exhaustion, a read-only
  mount, or one half-finished write all reach it. So `secret-box`: **creates only on `ENOENT`**, and on
  any other errno **throws typed** (the caller renders "the key could not be read", not "never
  configured" — those two sentences mean opposite things to a user); **writes through tmp+rename** (the
  *reason* behind the atomic-write law weighs more on this file than on any `.json` — it is the least
  recoverable file under `data/`); and **never overwrites an existing key file**. mounts migrates behind
  the parity test, so the fix reaches it too — which is the other half of why extracting is worth doing.

### 14.8 The cluster admin's side: helm values → Secret → env

`deploy/helm/vibespace-user/values.yaml` gains a block (beside the existing `gdrive:` at `:158-163`):

```yaml
# Cluster-provided integration credentials (src/integration-registry.js rows).
# Each entry is ONE row id; `values` keys are that row's declared field keys.
# A user's own key always wins — the UI shows which one is in use.
integrations: []
#  - id: lark
#    label: "Lark (cluster app)"
#    values:
#      appId: "cli_xxxxxxxx"
#      appSecret: "xxxxxxxx"
```

In the Secret of `templates/main.yaml` (beside `gdriveClients` at `:32-33`):

```yaml
  {{- if .Values.integrations }}
  integrations: {{ .Values.integrations | toJson | quote }}
  {{- end }}
```

and in the container env (beside `VIBESPACE_GDRIVE_CLIENTS` at `:159-164`):

```yaml
            {{- if .Values.integrations }}
            # Cluster-provided integration credentials: JSON
            # [{id,label,values:{…}},…] read by src/server/integration-store.js.
            # A user's own key in data/integrations.json always wins.
            - name: VIBESPACE_INTEGRATIONS
              valueFrom: { secretKeyRef: { name: {{ $name }}, key: integrations } }
            {{- end }}
```

Four rules ship into `deploy/README.md` next to that YAML:

- **Never `value:`, always `secretKeyRef`** — which is what this chart already does (`gdriveClients`
  `main.yaml:163-164`, the cephfs secret `:152-153`). A `value:` prints the key into
  `kubectl get deploy -o yaml`.
- **The per-field form** `VIBESPACE_INTEGRATION_<ID>_<FIELD>` (id and field upper-cased, `-` → `_`) is
  for self-hosted installs and docker-compose, which should not need JSON quoting hell. When both forms
  are present **the JSON one wins**, and a line at boot says which one took effect.
- **A parse failure never throws**: the same line as `src/mounts.js:2200` —
  `console.error('[integrations] VIBESPACE_INTEGRATIONS unparseable:', e.message)` and then behave as
  if there were no cluster default. A mistyped values block must not stop the pod from starting.
- **Which rows are suitable as cluster defaults belongs in the README**: register-once-serve-everyone
  credentials (a Lark app, a Google OAuth client) are; **per-seat keys are not** — a cluster-injected
  one means the cluster pays everyone's bill, and the provider's concurrency seats make users trip over
  each other (CloakBrowser's tiers are sold by concurrent sessions).

### 14.9 One OAuth client, N instances, N public URLs

The cluster injects each instance's own public address (`main.yaml:172-176`), so "how does one
registered OAuth app serve N different public URLs" is a real question. **But VibeSpace's OAuth flow has
never put the instance's address in the `redirect_uri`**: it uses loopback
(`src/gmail-sync.js:78` `srv.listen(0, '127.0.0.1')`, `:82`/`:99`
`redirect_uri: http://127.0.0.1:${st.port}`), and loopback means **the machine the user's browser is on**,
not the instance. That changes the shape of the problem entirely:

**(a) The existing loopback + paste-back.** The cluster registers **one** redirect URL, **independent of
the number of instances** — because that URL contains no instance address at all. In a cluster
deployment the user's browser is not on the same machine as the instance, so the redirect to 127.0.0.1
**fails** in the user's browser and the code is in the address bar — exactly the shape written down in
the comment at `src/mounts.js:2175-2182`, and the product **already has** that surface (paste-back). The
cost is one extra paste per connect.

**(b) A cluster auth relay.** `https://auth.<cluster>/cb` registered once, carrying the target instance
in a **signed state**, forwarding to that instance's public URL. Better UX (zero pastes); the cost is a
new piece of infrastructure, a signing key, every instance trusting that relay's signature, and — this
is the heavy one — **a component that can see authorization codes**. It must forward and never persist,
and a compromise of it is a whole-cluster problem rather than one user's.

**Recommendation: (a) for v1, (b) as a later phase, gated by decision 21.** Not because it is easier:
(a) is the path **already running in production** (the Gmail mounts), while (b) introduces a component
that **holds authorization codes**, which is a change that needs its own threat model.

What each vendor allows (public documentation, retrieved 2026-09-11):

| Vendor | Must the callback URL be registered | Port | URLs per app | Consequence for a cluster default |
|---|---|---|---|---|
| Google (Gmail / Drive) | Yes, and matched **byte-for-byte** (scheme / host / port / path / trailing slash), **no wildcards** | Loopback is the exception: RFC 8252 §7.3 requires the authorization server to "**MUST allow any port to be specified at the time of the request** for loopback IP redirect URIs" — which is exactly how this tree uses it (`src/gmail-sync.js:78` binds `listen(0)`, a fresh port each time) | Several exact URIs | (a) works and is **already in production**; (b) works too (register the relay's one URI) |
| Lark / Feishu | Yes — the redirect-URL list under 安全设置 in the developer console; per the official docs **only URLs in that list pass the open platform's security check** | **The port is part of the URL** ⇒ loopback must be **fixed**, which is why §12.4 exists | **Multiple are supported** (official docs: "重定向 URL 支持配置多个") | (a) works; (b) works. **The real limit is not the URL, it is the tenant — see below** |
| CloakBrowser / cloud browser providers | **Not applicable**: an API key / license key, no redirect at all | — | — | The cluster *can* inject one, but that means the cluster **buys everyone's seat** (§14.8, last rule) |

**A Lark cluster default has a boundary harder than the redirect URI, and it decides the shape of
decision 22.** The long connection is **enterprise-self-built-apps only** (§12.1, official docs), and a
**self-built app can only be used inside its own tenant** (official developer guide: self-built =
internal to one enterprise, as opposed to App Store apps, which are distributable across tenants). So:

- one cluster-registered Lark **self-built** app serves only users **in its own tenant**. Users in
  another tenant **must** bring their own app — which is why the `lark` row **still allows a user
  override even when a cluster default exists**, and that is a structural reason rather than a
  courtesy.
- serving several tenants from one app means building an **App Store (ISV) app**, which **forfeits the
  long connection lane decision 3 is built on** and swaps the token model from `tenant_access_token` to
  `app_access_token` + `tenant_key`. In other words: **"a cross-tenant cluster default" and "real-time
  push" are mutually exclusive today.**
- whether this instance's users share one Lark tenant is an ops fact, not recorded in this public repo
  — and this layer's design **does not need** that answer to be yes.

### 14.10 Export, import, and what this layer's encryption actually buys

- Integration keys join the `sensitive` half of `/api/config/export-info`
  (`src/routes/persistence.js:679-686`, beside `mounts` / `accounts`) and the passphrase-encrypted block
  of `/api/config/export` (`:712-741`, the same shape as `getMounts?.()?.exportBundle?.()` `:729-732`).
- **Only `source:'user'` rows are exported.** A cluster default is not ours and it rotates: baking it
  into a backup file scatters an expiring cluster credential somewhere we can no longer reach.
- Imported onto an instance that has **no** such cluster preset, a `source:'cluster'` row resolves to
  `none` **and says what is missing** — never silently falling back to the exporter's values (which
  would let a user believe they are on the cluster's app while actually carrying somebody else's
  credential).
- **Say plainly what this layer's encryption buys.** `data/integrations.json` and
  `data/.integrations-key` sit side by side under one uid — the encryption defends against **a file
  that was carried off** (a backup, a snapshot, a mis-mounted volume). It does not defend against code
  running as the same user on this machine, and **an agent session runs as exactly that user, with file
  tools in hand**. mounts has this property today; we are not introducing it. A real boundary is either
  an OS keychain or a second uid, and neither is in v1 — so this sentence lives here rather than letting
  the word "encrypted" imply a guarantee it cannot buy.

### 14.11 This layer's hard fences

1. **A key never rides argv** (spawn hygiene). One structural guarantee comes free: `agentEnv()`
   (`src/ws-handler.js:112-121`) drops every `VIBESPACE_*` not in `AGENT_ENV_KEEP` (`:101-105`), so
   `VIBESPACE_INTEGRATIONS` and `VIBESPACE_INTEGRATION_*` reach no agent child **by construction**.
2. **A Test is human-clicked only.** §ban-safety is about polling Anthropic on a timer with a
   subscription token; one human-clicked round trip to Lark / CloakBrowser is not under that ban, but
   **a timer is**. Sweep: `integrations.test(` appearing in any scheduler, timer or ingest loop = red.
   The precedent for this discipline is `src/local-oracles.js` — human-triggered, declared, measured.
3. **The store constructs no vendor request** (§14.3), so the §3.1 egress whitelist gains **no line at
   all** for this layer.
4. The vendor's error text renders through `escHtml` and never reaches `innerHTML` (the same rule as
   §10.3).
5. **The broadcast carries the masked view** — and *that one* (`publicView`), not a hand-written field
   list; hand-written field lists are exactly the shape this codebase keeps dropping fields through.
6. **Failure reaches the user**: a failed Test = a line on the card plus the vendor's own words; a
   failed `PUT` = a toast. Telemetry having it is not reporting it.
7. **`hostId` is a parameter.** What this layer resolves belongs to the **instance**; an adapter that
   one day runs on a paired device (§15) is handed the resolved values by the **engine** as a parameter
   — never stored a second time on the device, never through argv.
8. **This layer stores what an admin could hand you** (app / client credentials, API keys), **not what
   you authorized** (OAuth refresh tokens). The user's Lark token still lives in the channels token
   store (§13). Folding both into one store is exactly the twin this design keeps refusing — their
   lifetimes, rotation and export rules are all different.

---

## 15. What is deliberately not in v1, and where it lands

| Deferred | Why | Landing place |
|---|---|---|
| Plugin-contributed adapters | The manifest has no adapter contribution point; the sandbox would need net+fs grants; and the receive path must run beside the store and the spend guard. Third-party adapters are the right *eventual* home | `contributes.channelAdapters`, over the same `src/channels` interface, so the registry never forks. **The key is not reserved today**: `RESERVED_CONTRIBUTIONS` in `src/plugin-manifest.js` is `['keybindings','panels','viewers','commands','menus','statusChips','backends']`, and only keys *in that list* produce the "reserved for a later phase — ignored" warning — anything else is silently discarded when `m.contributes` is rebuilt to a fixed shape, so a plugin author following this row would get **no signal at all**. **P0 adds the one word**, plus the expected-set update in `scripts/test-plugin-loader.mjs`. A declared-but-inert slot is the same failure this document argues against for `SPEND_REASONS`; the difference is that here the slot costs one array entry and buys an honest warning |
| Adapters on a paired device | Credentials and the store live here | The interface already takes a machine handle; v1 passes `local`. `hostId` is a parameter, never a branch. **r5: this row now has its first real consumer** — WhatsApp's macOS store lives on the owner's Mac while VibeSpace runs elsewhere, so the `channels-scan-store` op is written against `hostId` from day one (the local box is device #0) and P6's leg is a parameter change |
| ~~Live event lanes~~ **promoted to P1** (r3/Q3(a)) | No longer deferred: the owner asked for real-time push and §6.4 re-argues it from the evidence. The one gate left is enabling event subscription in the Lark console | `src/channels/live/<kind>.js`; content or cursor kick decided by `laneState()` (§4) |
| Local-client adapters (WhatsApp / WeChat) | The interface models them from P0 (`scan` / `scanSources` / `historyBySource` / `scanLatency` / `scanState` / `tosRisk` / `convCaps`), but the adapters need a logged-in official client, and the `'ui'` half also needs an agent-browser profile and one named decision about terms risk | **P6**, §12.5. The `'ui'` half is gated on decision 19 **and** the agent-browser system; the macOS `'store'` half is gated on decision 19 **alone** — it needs no agent-browser |
| WhatsApp sending via a protocol library | Unofficial clients are prohibited by the platform's terms, and bans land on ordinary use (fence 13) | Forever behind `tosRisk: 'prohibited'`; the compliant route is the official Business Cloud API (bot identity) |
| HTML mail rendering | XSS surface; plain text is honest and sufficient for triage | The published-pages sandboxed-iframe pattern |
| Attachment auto-fetch | Bandwidth, storage, and a second authorized request per item | `caps.attachments: 'fetch'` + an explicit user/agent action with size caps |
| Read receipts / typing / reactions | Not in the interaction design | `caps` rows already reserved |

---

## 16. Debt this creates, and how it is gated

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

## 17. Test gates

Every phase ships its gate in the same commit. Suite names, tiers, and the
**negative control** that proves each gate can fail:

| Suite | Tier | What it pins | Negative control |
|---|---|---|---|
| `test-channel-filter` | fast | matcher truth table per rule kind; `any`/`every`; the estimator's window and its `sampled`/`truncated` honesty; the `why` strings | a rule matching everything must report `totalPerDay === matchedPerDay`; a corpus shorter than the window must set `truncated` |
| `test-channel-acl` | fast | default-hidden; MAX over grants; widening-only; request → exactly one grant; uniform not-found; every grant carries an `origin` | a group grant must not be narrowed by an individual entry; approving a request must leave the group default byte-identical; **a user grant plus an assignment grant on the same (principal, scope), assignment removed ⇒ the user grant is byte-identical** |
| `test-channel-outbox` | fast | the state machine (every transition and every forbidden one); guardrails stack and can only tighten; fail-closed on unknown policy; `unknown` never auto-retries | a patched copy with the guardrail check removed must go red; a direct-send policy with a link must still review |
| `test-channel-record` | fast | normalization incl. mention-placeholder resolution; the injection-marker strip | a body containing our own frame markers must come out inert |
| `test-channel-store` | fast | atomic index; append-only logs; dedup on replayed pages; cursor advances only on a complete pass; retention floor ≥ 7 days; **two concurrent passes through `index.update()` both land** (§5.1) | a pass reporting `complete:false` must leave the cursor unchanged; a patched copy doing read-modify-write around `writeJsonAtomic` must **lose** one pass's anchor advance |
| `test-channel-adapter-contract` | fast | the fake adapter drives every declared capability; an undeclared one throws; typed errors; **the grep census that no call site branches on `kind`**; **a `receive:'scan'` adapter may not declare `history:'none'`** (r4, §12.5); **a `scan` adapter must declare `scanSources` and a per-source `scanLatency`** (r5); **r6: on `receive:'scan'` the per-source `historyBySource` replaces the scalar — every value non-`'none'`, and its keys must COVER every source `scanSources` names** | a synthetic adapter branching on its own kind in a call site must fail the census; a synthetic adapter declaring `receive:'scan'` + `history:'none'` must go red; a synthetic adapter declaring `receive:'scan'` with no `scanSources` must go red; **a scan adapter whose `historyBySource` omits a source its `scanSources` declares must go red** (r6's mirror control), and **one whose `historyBySource.ui === 'none'` must go red too** |
| `test-channel-caps` | fast | both axes of the record; `convCaps` three-valued; **a control exists only when `caps` AND `convCaps` agree**, and `unknown` always renders as not-offered-with-a-reason; `convCaps.sendAs` ⊆ `caps.sendAs`; `freshnessClaim`'s wording per lane; `identityWarning` speaks for `unknown` exactly as for `marked`. **Two r4 groups**: `laneState`'s precedence — a record with `claimedExclusive:true` **and** `demotedAt` set must answer `carryContent:false`, a lane silent past the heartbeat window must **never** answer `live:true`, and `unknown` is always `carryContent:false`; and `convCaps`'s TTL — an entry past the TTL must render `unknown`. **One r5 group**: `scanState`'s precedence (platform declaration > client presence > read grant > `'ui'`), its answer ⊆ `caps.scanSources[platform]`, and `tcc-denied` resolving to `source:null` and **not** to `'ui'`. **One r6 group**: `scanState` resolves `history` from `historyBySource[source]` and always answers `via:'scan'` + `carryContent:false`; `hostFacts` past the 6 h TTL resolves to `source:null` / `why:'host-facts-stale'`; and `freshnessClaim(caps, laneOrScan, convEntry, now)` computes its `seconds` from the clock it is handed | a synthetic adapter declaring `sendAs:['user']` that still offers the control on a conversation whose `convCaps.sendAs === []` must go red; an adapter returning a `convCaps` wider than `caps` must go red; `identityMarking:'unknown'` with no warning must go red; **a pre-fix copy reading `caps.pushExclusivity` must answer `carryContent:true` on the demoted fixture**; **a fresh `convCaps` must still offer the control** (the TTL's positive control — a rule that always answers `unknown` is equally a defect); **a resolver answering `'store'` on a machine whose `scanSources.linux === 'ui'` must go red**, and so must **a resolver that still answers `'ui'` on a `darwin` machine with the client present and the grant held** (`scanState`'s positive control — a resolver that always narrows to nothing is the same defect as a rule that always answers `unknown`); **r6: the SAME `convEntry` at two different `now` values must produce two different `seconds`** (a `freshnessClaim` that ignores its clock cannot be answering "how long ago"), and **a fresh `hostFacts` must still answer `'store'`** — the TTL's positive control, the same shape as `convCaps`'s |
| `test-channels-lane-parity` | fast | **one day of traffic driven through push / poll / scan ⇒ the same records, the same wake count, the same charges** (fence 12); the same message arriving once by push and once by poll collapses to one (dedup on the message id); event replays dedup on `event_id`; **r4's scan arm: the same screen scraped twice must be a no-op** (the synthetic anchor, §12.5), and hitting the scroll limit first ⇒ `complete:false` ⇒ the anchor does not move; **r5's store arm: the same store scanned twice must be a no-op** (the client's own message id, `raw.synthetic:false`), a pass interrupted half-way ⇒ `complete:false` ⇒ the anchor does not move, and **one day of traffic driven through `'store'` and through `'ui'` must produce the same `ChannelRecord`s** (parity between the two sources, because decision 19 has one adapter taking different sources on different machines). **r6's burst leg**: N messages delivered through an **`fs.watch`-driven store scan** must produce the SAME wake count and the SAME charges as the same burst through poll — the scan lane is a batch (`carryContent:false`, §6.4) and the watch is a debounced cursor kick, never a pass per write | a push-lane copy that **bypasses the coalescing window** must wake more on the same burst; **an UNDEBOUNCED copy of the store lane's watch must wake more on the same burst** (r6's control — this is fence 12's "30 messages become 30 deliveries" arriving through the lane r5 added); a copy that acks **before** durability must lose records at the injected crash point; **a copy that drops the synthetic key must turn every record into a duplicate on the second scan** |
| `test-channels-identity` | fast | no sender honesty line by default; `identityMarking` drives the approval-card warning and the receipt fields; the audit line carries `draftedBy`/`approvedBy`/`sentAs`/`identityMarking` and **never leaves the instance**; on a `sendAs: []` conversation `reply` returns `send-not-available` and **creates no proposal**; **r4: a proposal approved against a `convCaps` that went stale must re-resolve before the send and refuse with `send-not-available`** | a copy with the honesty line defaulted ON must go red (r2's decision 17 is this leg's negative control); a `marked` channel whose approval card carries no warning must go red; a proposal created on a `sendAs: []` conversation must go red; **a copy that does not re-resolve at approval time must actually send the message** |
| `test-channels-egress` | fast | every constructed outbound request comes either from the adapter declaring its host or from an allowlisted `(file, host)` pair **with a reason** — seeded with `src/gmail-sync.js` and `src/mounts.js` (§3.1) | a scratch file with an undeclared host must go red; a **dead allowlist entry** (file moved or renamed) must go red too |
| `test-oauth-loopback` | fast | both modes (§12.4): ephemeral bind for Gmail, fixed bind for Lark; `state` rejection on the request handler **and** on paste-back; the port released on completion/cancel/timeout | a **pre-bound** fixed port must produce the named refusal and the paste-back fallback, never an opaque `EADDRINUSE`; a callback with a wrong `state` must be rejected in both modes |
| `test-integration-registry` | fast | each row's `fields` / `test` / `consumers`; `publicView` never emits plaintext and the last 4 appear only when the value is ≥ 12 chars; **omitting a secret field = unchanged, `''` = cleared**; precedence user > cluster > none; a vanished cluster default ⇒ `none` **with a named reason**; a missing required field ⇒ `missing` naming it. **The grep census (which prints the set it walked)**: `process.env.VIBESPACE_INTEGRATION*` only inside the store; **one parser per env name** (two rows sharing a name, or a row and a delegate sharing one, both go red); every `consumers` name is a file that exists **and** actually calls `resolveIntegration`; every row declaring `test` has a registered runner; **no scheduler / timer / ingest loop calls `test(`** | a row whose `consumers` names a file that exists but **never calls** `resolveIntegration` must go red (mere existence is the shape this census most easily decays into); a copy treating `''` as "unchanged" must go red; a copy that **copies** the cluster default into `data/integrations.json` must go red on the env-rotation leg (it keeps serving the old value); a synthetic producer calling `test(` from a timer must go red; a copy masking **outside** `publicView` must go red on the broadcast leg |
| `test-secret-box` | fast | **parity** with mounts (encrypt with a patched copy of the pre-extraction `_enc` ⇒ `secret-box` decrypts it, and the other way round, with the `iv.tag.data` triple byte-identical); **creates a key only on `ENOENT`**, throws **typed** on any other errno; writes through tmp+rename; **never overwrites an existing key file** | a copy carrying the bare catch of `src/mounts.js:360-367` must, on one injected `EACCES`, mint a new key and so turn the "old ciphertext still decrypts" assertion red — that defect itself, kept as a standing negative control |
| `test-channels-lark-shape` | fast | recorded-fixture normalization: `next_page_token` paging *to the anchor*, `@_user_N` placeholder resolution against the record's own `mentions`, typed errors | a fixture whose anchor lies on the **second** page must be paged into, not stopped at page one |
| `test-plugin-loader` (existing) | fast | `channelAdapters` in `RESERVED_CONTRIBUTIONS` ⇒ the "reserved for a later phase — ignored" warning actually fires (§15) | its expected-set assertion goes red if the word is added without updating the suite — which is the point |
| `test-channels-agent-cli` | fast | CLI verbs against a stub server; `reply` proposes and never sends; invisible = uniform error | a stub returning a conversation the ACL hid must still produce the uniform error |
| `test-spend-paths` (existing) | fast | its per-site census must see the new producer, wired, with the declared reason | already carries its own controls |
| `test-channels-engine` | heavy | real worktree server + fake adapter: burst-day paging, backoff, single-flight, failure surfacing **and retraction**, digest batching, wake authorization and hold release | a pre-fix copy using a fixed-window fetch must lose messages on the burst-day fixture |
| `test-channels-push` | heavy | real worktree server + a **fake push server**: ack after durability (inject a crash between ack and processing — the record must still be there); heartbeat silence ⇒ `state` leaves `live` **and** the poll cadence returns to fast immediately; `stop()` terminal for an arm in flight; a lane claiming `exclusive` while the fixture withholds some events ⇒ `missRate` crosses the threshold ⇒ **auto-demotion to kick with its reason stated**. **Three r4 legs**: after the demotion the lane **actually changes what it carries** (the next event only kicks the cursor and the record arrives by reconciliation poll — asserting that `missRate` crossed is not enough); in kick mode `missRate` **gains no samples at all** (otherwise it is a one-way ratchet); and a demoted lane **never re-promotes itself** even when the fixture stops withholding, while re-asserting exclusivity in the connect wizard clears the counters and re-enters content mode | a lane that **lies about being `active`** (pre-fix copy) must turn the poll fallback off and lose messages; a copy that never demotes must lose messages forever on the withholding fixture; **a pre-fix copy reading the content/kick decision off `caps` must keep carrying content after the demotion**; **a copy counting `missRate` over the adapter's lifetime must still sit above the threshold after a re-assert** |
| `test-channels-store-scan` | heavy | real daemon (`test-sysinfo-op` is the template) + a **synthetic** WhatsApp-shaped sqlite: a rowid cursor reads to the end exactly once; **the most recent messages are still read** when the store carries an un-checkpointed WAL; a pass interrupted half-way leaves the anchor unmoved; **after the scan the source `db` and `-wal` are byte-identical with unchanged mtimes** (r6 — deliberately NOT the triple: a read-only open rewrites `-shm`, the content-free WAL index, and leaves even that untouched when it is unwritable, so asserting the triple would go red on the correct mechanism); a refused read ⇒ a named `tcc-denied` rather than zero records; **`no-sqlite-reader` is a named refusal when no reader rung is available** (r6); the capability gate — an older daemon that does not advertise this op is **never asked** (an unknown op hangs). **The fixture must include the arm where OUR connection is the ONLY one** (r6 — the normal shape for a scheduled scan) | a copy that reads **the `.db` file alone** must miss the most recent messages; **a copy taking the DEFAULT (read-write) open must fail the byte-identical assertion on the only-connection arm** (r6 — the failing shape is the DEFAULT, not the opt-in `mode=rw` r5 named, and it fails ONLY on that arm: with a client connection held open it passes, which is why the fixture needs both); a copy that reports `EPERM` as "zero messages" must fail the named-refusal leg; **a copy answering zero records when no SQLite reader exists must fail the `no-sqlite-reader` leg** |
| `test-channels-e2e` | heavy | headless chrome: rail badge, panel chips, conversation window, inline approval card → send → receipt, filter editor live estimate. **Plus the Integrations leg (§14.5)**: the cards render once under each of the three sources (`Not configured` / `Cluster default` / `Your own`); a secret field shows only `••••1234` with **no path that reads it back** (a `GET` after Replace still returns the masked view); the Test button's label follows `test.kind`; a failed Test paints the vendor's own text on the card through `escHtml`; and **the same cards render single-column at 375×667 with every control reachable** | the estimate must change when a rule is added, and a review-required channel must not offer "may send"; **a copy returning plaintext from `GET` must go red**; **a copy labelling a `shape-only` row "Test connection" must go red** (that button never went near the network); **any control landing outside the viewport at 375×667 must go red** — this leg names the `showDropdown` class of incident: unzoomed `offsetWidth` and a zoomed rect are not the same thing |

Fixture hygiene applies from the first commit, because these are live incidents:
no fixed `/tmp` path and no fixed port (use `scripts/scratch.mjs`); any suite
that spawns a server **names its HOME**; every child process is killed on exit
*and* on timeout (the runner's SIGKILL reparents survivors to systemd and they
hold inotify instances machine-wide); a suite that must touch a real home is a
declared, paid-for exception. **No suite makes a vendor call** — adapters are
exercised against recorded fixtures and the fake adapter.

---

## 18. Critique log — the r2 adversarial review

Eight findings were raised against the first draft. Each was checked against the
tree at `7f13e7c7` before anything was changed. Seven were correct and are fixed
above; one was half-correct and the half that was wrong is recorded here rather
than acted on, because a design that quietly accepts a wrong correction is as
unreliable as one that ignores a right one.

| # | Finding | Verdict | What changed |
|---|---|---|---|
| 1 | Two adapter poll loops read-modify-write one `index.json`; overlapping passes clobber each other's cursor advances and unread counts | **Confirmed.** §6.2 mandates a loop per adapter with single-flight declared only *per* adapter, while §5 put every mutable per-conversation fact in one whole-file atomic JSON written "at pass end". `writeJsonAtomic` is atomic at the fs layer; the read-modify-write around it is not. A clobbered *anchor* advance skips messages | New **§5.1** names one in-memory owner in `src/server/channels-engine.js` with a serialized `index.update(fn)` and a coalesced flush (the `JobManager` / `SessionStatusManager` shape); §5 invariants 3–4 rewritten; §6.2 says single-flight-per-adapter is not mutual exclusion; §2 gains a third load-bearing rule; `test-channel-store` gains a two-concurrent-passes leg with a read-modify-write negative control. Sharding was considered and rejected in §5.1 — the rotation counter is keyed by *group*, which spans adapters |
| 2 | `test-channels-egress` as specified is red on its first commit: `src/gmail-sync.js` and `src/mounts.js` already construct requests to those hosts | **Confirmed.** `src/gmail-sync.js` builds `oauth2.googleapis.com/token`, the `gmail.readonly` scope URL and `gmail.googleapis.com/gmail/v1/users/me`; `src/mounts.js` holds `GRAPH_BASE`. A mandatory gate that fails on a legitimate pre-existing surface gets relaxed by whoever hits it first | §3.1 restates the census as an allowlist keyed by `(file, host pattern)` **with a reason**, seeded with those two files, plus the dead-entry check `test-vendor-whitelist`'s `ALLOW` already uses; §17's row updated with both controls |
| 3 | Lark's fixed loopback port is a machine-global name; decision 4 only diagnoses the *registration* collision, not two instances on one box | **Confirmed.** Gmail's flow binds `listen(0, '127.0.0.1')`; Lark's must be registered, hence fixed. The loser gets an opaque `EADDRINUSE` *after* the consent page, and the port holder receives the other instance's code | New **§12.4**: the module is explicitly dual-mode; the fixed port is bound only for a flow; `EADDRINUSE` becomes a named refusal falling through to paste-back (which needs no port); the `state` CSRF check is carried over verbatim from **both** places `gmail-sync` performs it and pinned. §12.1 and decision 4 corrected; `test-oauth-loopback` gains a pre-bound-port leg and a wrong-`state` leg, and now has a row in §17 |
| 4 | The assignment-derived grant collides with a user-made grant on the same `(principal, scope)`; un-assigning silently revokes the user's grant — narrowing, inside a widening-only model | **Confirmed.** The §8 grant shape is keyed by `(principal, scope)` and §7.3 said "the grant is removed with the assignment" | Grants gain `origin: 'user'\|'assignment'\|'request'`; `effective()` still MAXes so the accessor is unchanged; un-assigning deletes only the `origin:'assignment'` row. §7.3 and §8 rewritten; `test-channel-acl` gains the mirror control (user grant byte-identical after the assignment is removed) |
| 5 | "One pointer item per pending proposal" is not expressible in `UserTodoManager` | **Confirmed, and the direction was wrong too.** `add()` has a closed parameter set; it dedups on `(sessionKey, text)` across all statuses (re-filing a resolved item reopens the same id); it throws past `MAX_OPEN_PER_SESSION = 20`. And retraction needs *proposal → item*, which nothing persisted | §9.2 rewritten to **one pointer per conversation** with count-free `text` (so dedup-by-text is the wanted idempotence), the count in `detail` (which `add()` updates in place), the returned id persisted as `pendingTodoId` on the **conversation**, retraction only for ids this producer wrote, and a stated degrade when the cap throws. The per-proposal alternative and its cost are recorded in decision 7 |
| 6 | `contributes.channelAdapters` is claimed to be "a reserved contribution key today" and is not — and an unknown key is dropped with no warning | **Confirmed.** `RESERVED_CONTRIBUTIONS` is `['keybindings','panels','viewers','commands','menus','statusChips','backends']`; only keys in that list warn, and `m.contributes` is rebuilt to a fixed shape so anything else vanishes silently | §15's row corrected and P0 now adds the word plus the expected-set update in `scripts/test-plugin-loader.mjs`; §17 carries the row |
| 7 | Fence 3 cites an incident and a measurement that do not exist in this tree, and states the inverse of the repo's actual law | **Half confirmed.** The *law* criticism is right and is fixed: CLAUDE.md's rule is "no **sync** fs/exec; child processes/workers with timeouts only", so bounded async children are sanctioned (ssh-per-op, the `ps`/`lsof` rungs, discovery sweeps) — the draft implied the opposite. The *invented incident* claim is *wrong*: `inc-mtunmv3d-pmd6` (2026-09-10) is real, with 1.8 / 18.8 / **72.5 ms** per spawn measured at 45 MB / 543 MB / 1.5 GB parent RSS. It is absent from the tree because instance-local evidence is required to stay out of this public repo — grepping the public tree is the right check and yields the right *observation*, but "not in the tree" and "invented" are different claims, and this repo's own conventions (CLAUDE.md cites `inc-…` ids with no in-tree evidence file throughout) make the first one expected | §3.3 rewritten to state the written law first, then the fork-tax refinement as a *measured constraint on top of it*, with the incident id, the method, the RSS dependency, and an explicit note that the evidence file is instance-local. §21 gains item 12 saying the constants are not portable |
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

### 18.1 The adversarial review of r3 (r4)

Five findings were raised against the r3 revision. Each was checked against the tree
at `a41bf513` first; **all five were correct** and all five are fixed above — none had
to be recorded as a wrong correction.

| # | Finding | Verdict | What changed |
|---|---|---|---|
| 1 | "Which lane is in use, is it live, may it carry content" lives in `caps.pushExclusivity`, the adapter record's `push {…}` and the per-conversation `lane {…}` with no stated precedence and **no accessor able to read the adapter record** — so r3's auto-demotion cannot structurally win | **Confirmed, and it is three consequences rather than one.** §4 calls `src/channel-caps.js` the **one** place that answers, yet none of its three exports takes the adapter record; §6.4 says only that the first two "together decide it" ⇒ (a) a demoted lane keeps carrying content, (b) the freshness chip draws "live" off a static declaration (exactly the `opencode-events` round-4 lesson it cites), (c) fence 12's coalescing window runs in kick mode too, buying 60 s of latency for nothing | `caps.pushExclusivity` **deleted** (exclusivity is a per-deployment configuration fact and does not belong in a static per-kind declaration; `pushTransport` stays, it genuinely is static); `src/channel-caps.js` gains the **one** resolver `laneState(caps, adapterRecord, convEntry, now)` with the precedence **demotion > liveness > claim** and `unknown ⇒ carryContent:false`; all four consumers (the chip, fence 12's gate, §6.4's cadence, §6.2's scheduler) re-pointed at it and §2 gains a fifth placement rule; `test-channel-caps` and `test-channels-push` each gain legs, the latter asserting that **the demotion actually changes what the lane carries** (r3 only asserted that `missRate` crossed) |
| 2 | Decision 19 removes the only `scanSource` cell with an ingest contract (`'store'`) and the contract never moves into the survivor: `'ui'` has no anchor, no dedup key and no "complete pass", and §12.5 explicitly permits it to declare `history:'none'` | **Confirmed.** §4's contract makes an undeclared capability **throw**, §5 invariant 4 wants a complete pass and a `complete:false`, and invariant 2 requires `vendorId` — which a DOM scrape is not guaranteed to expose; §17's parity row pinned only push/poll dedup, never a re-scraped screen | §12.5 gains `'ui'`'s three contract lines: the synthetic anchor key `(convId, renderedAt, sha256(author\|text))` in `vendorId` with `raw.synthetic:true`, the scroll-bounded complete pass (reached the anchor ⇒ `complete:true`; hit the scroll limit ⇒ `complete:false`, anchor does not move), and the **ban** on `history:'none'` for `receive:'scan'` (enforced by the contract suite); the table cell's `history` narrows to `'page'`; §5 invariant 2 and §6.3 each gain a pointer; `test-channels-lane-parity` gains a scan arm and a drop-the-synthetic-key negative control |
| 3 | `push.missRate` is a lifetime ratio with no counting window and the demotion has no exit ⇒ a one-way ratchet: in kick mode push carries no records at all, the ratio tends to 1.0 by construction, and a demoted lane can **never** come back under the threshold | **Confirmed**, and it is exactly the shape the auto-resume `edgeHeld` lesson exists to prevent (*burning the wall would turn one transient disagreement into a permanent refusal*) | §6.4 gains two sentences: count only while `carryContent` is true and only over a rolling window (last N records or 24 h, whichever is larger); the demotion is retracted by **whoever made the claim** (re-assert in the connect wizard ⇒ counters reset, one retry), and **the counters are never the trigger**; decision 18 and §21 item 17 follow; `test-channels-push` gains two legs |
| 4 | `convCaps` is a stored derived fact carrying an `at` **no rule reads** (no TTL, no refresh trigger, no staleness degrade), contradicting §5 invariant 7 twelve lines below it; a week-old optimistic answer draws a send control and creates the proposal §4 promises never to create | **Confirmed.** `why`'s enum already contains `'left-group'`, so the state is anticipated; and a field with no reader is, in this repo, "the fix was never wired" | §4 and §5 give `convCaps` a **TTL (6 h)** and three refresh triggers (on track, on the first panel render past the TTL, and **unconditionally at approval time immediately before the send**), degrading to `read:'unknown'`/`sendAs:[]`/`why:'stale'` — rendered by `offers()`'s existing rule, so no new vocabulary; §9.2 spells out the approval-time re-resolution and its refusal path; invariant 7 names it as the exception that pays for itself; `test-channel-caps` gains a TTL leg with a positive control and `test-channels-identity` a "stale at approval must refuse" leg |
| 5 | The zh doc's §21 sources block is missing the blank line before it, so CommonMark lazy continuation folds it into numbered item 19 | **Confirmed** (`cat -A`; en:1806-1808 has the blank line) | One blank line inserted. The same pass re-checked the rest of the pair and everything else held: heading counts, table-row counts, byte-identical code blocks, and identical P0–P4 / P0–P2 round-and-day arithmetic |

Four of the five (1–4) share a shape worth writing down beside r2's: **one fact stored
in three places, with no function allowed to read all of them.** `laneState`'s three
former homes, `convCaps`'s reader-less `at`, the ingest contract left inside a deleted
cell, and a ratio that only ever moves one way — each is a missing layer between the
*claim* and the *answer*. r2's lesson was *a guarantee stated at the wrong layer*; r4's
is its twin: **an answer spread across several storage sites is not an answer** — there
may be several sites (a claim, a measurement and an observation really are different
facts), but there may be exactly **one place that folds them, and it must be able to
read all of them.**

### 18.2 The owner's correction (r5) — one sentence that merged two platforms

r4 wrote that "decision 19 excludes `'store'` for **both** platforms" and rewrote all
of §12.5 around the surviving `'ui'` cell. **The owner pointed out that this is
wrong**: they have seen an implementation reading WhatsApp's macOS store directly,
and that store is not encrypted at all. Checked against public material the
correction holds, and it belongs beside r2's and r4's lessons because its shape is a
third one:

| # | Finding | Verdict | What changed |
|---|---|---|---|
| 1 | "Read the local store" was excluded wholesale, yet **none** of the reasons for excluding it (key in process memory / protocol libraries violating the terms) applies to WhatsApp on macOS — that official Catalyst client leaves its whole chat history in an unencrypted Core Data SQLite store | **Confirmed.** The sentence packed two different things into one word: WeChat's store is **encrypted** (key in memory ⇒ fence 13), WhatsApp's on macOS is **not** (⇒ an ordinary, authorized, read-only file read). Fence 13's wording made the two read as one act, because it only ever said what it refuses and never once said what it **permits** | Fence 13 rewritten as three refusals (process memory / reconstructing a key the vendor withheld / a prohibited transport) plus an explicit **permission**, with the test stated as one question — "**whose secret are we defeating?**"; §12.5 takes `'store'` back and gives it its own ingest contract (a real anchor, the complete pass, never write, TCC as a named gate); decision 19 goes from (b) to (b)+(d); P6 splits into two legs with different gates |
| 2 | Found along the way: `caps.scanSource` is a scalar, yet one adapter reads a store on macOS and scrapes a screen on Linux | **Confirmed, and it is the same defect as r4's finding 1.** A per-**deployment** fact living inside a static per-**kind** declaration — word for word why r4 deleted `caps.pushExclusivity` | The scalar is deleted in favour of the per-platform upper-bound table `caps.scanSources` + the per-source `caps.scanLatency` + the **one** resolver `scanState()` with a fixed precedence, carrying one deliberate exception: **a refused read resolves to `null` with a reason, never silently to `'ui'`** |

This shape differs from both r2's and r4's, so it is its own lesson: **a fence that
only states what it refuses will, next time, be read as refusing everything that
looks like it.** Every word of fence 13 was true, and it still carried a legitimate
route away with it — because the reader (including the person who wrote it) had no
test that could say "this one is allowed". So it now carries its own test, and it
**can say YES to something**: a fence that cannot say YES is not a fence, it is a
ban — and a ban needs no argument, which is why nobody ever re-examines one.

---

### 18.3 The adversarial review of r5 (r6) — what a round of fixes brought in

r5 took the `'store'` cell back, and **five of this round's eight findings live on
that addition**: one states its mechanism backwards, one leaves r5's own just-named
defect in the adjacent field, one gives the new record three fields with no reader,
one puts the new lane behind the single gate that does not cover it, and one gives
it a send route it never had. **A round of fixes is new code, and it owes the same
scrutiny as the code it repaired.**

| # | Finding | Verdict | What changed |
|---|---|---|---|
| 1 | The mechanism the `'store'` cell **prefers** (the backup API / `VACUUM INTO`) is the one mechanism that breaks its own "never write", and its reason for rejecting the safe one is **inverted**: "opening the live store read-only is not sufficient, this is a WAL database" conflates a read-only **open** (which reads the WAL) with reading the **`.db` file** (which does not) | **Confirmed, measured on a throwaway fixture** (node v24.12.0 `node:sqlite`, a SIGKILLed producer leaving an un-checkpointed WAL): the DEFAULT open — the only mode a backup/`VACUUM INTO` source connection can use — read `NEWEST` correctly and then, on `close()`, rewrote `db` and **DELETED** both `-wal` and `-shm` (SQLite's documented last-connection checkpoint-and-delete); `readOnly:true` also read `NEWEST` (so r5's stated reason is false) and left `db`/`-wal` byte-identical; only reading the **`.db` file alone** missed `NEWEST`. "We are the last connection" is the NORMAL case for a scheduled scan | §12.5's mechanism is **inverted**: open with `SQLITE_OPEN_READONLY`, run `VACUUM INTO`/backup **from that read-only connection**; the rejected-alternative sentence now says "reading the **`.db` file alone** omits the WAL"; the triple copy is demoted to a **fallback** with its torn-read hazard stated; §6.3's twin follows; §17's assertion narrows from the triple to **`db` and `-wal`** (a read-only open rewrites `-shm`), its negative control moves from `mode=rw` to the **DEFAULT** open, and the fixture gains an only-connection arm |
| 2 | `caps.history` is still a per-KIND scalar while §12.5's own new table assigns ONE adapter two different values by resolved source (`'store'`⇒`'since'`, `'ui'`⇒`'page'`) — word for word what r5 said about the adjacent field | **Confirmed.** One `kind:'whatsapp'` adapter declares a single `history` while `scanSources` means the same module runs both cells: `'since'` asks a Linux deployment to honour since-anchor semantics with a DOM scrape, `'page'` deletes the "real anchor ⇒ `'since'`" that is the reason `'store'` is preferred; and §17's two-source parity leg, driven by **one** fake adapter, is unimplementable as r5 wrote it | `caps.historyBySource` replaces the scalar on `receive:'scan'` (the scalar stays for `push`/`poll`), `scanState()` resolves `history` alongside `source`, §4's contract rule covers both the non-`'none'` values and the key coverage, §17 gains the mirror control |
| 3 | The design names server.js's size ratchet as the gate for its own wiring stanza without checking how much budget is left | **Confirmed, measured**: at the base commit `read('server.js').split('\n').length` is **exactly 2100** ⇒ zero headroom, so P0's first commit turns `npm run build` red — the mandatory pre-push gate AND the in-app self-update | §2.1 and P0's exit criteria each gain a line: **measure first**, then either raise the budget deliberately in the same commit (which the suite's own comment sanctions) or extract an existing stanza first; priced at ~0.5 rounds |
| 4 | r5's new `scan` record reproduces r4's own finding 4 verbatim: `hostFacts.at` / `grant` / `grantAskedAt` are stored derived facts with no reader, no TTL, no refresh trigger and no staleness degrade — while §5 invariant 7 names exactly **one** exception | **Confirmed.** `grantAskedAt` appears exactly once in the whole English doc (in the schema block), and nothing states what `now` is for in `scanState(…, now)` while every sibling resolver's `now` has a stated use; these facts are the result of a possibly-cross-machine round trip and are not locally re-derivable — the property that earned `convCaps` its exception. The harm runs the more expensive way: with `hostFacts` stale, `scanState` keeps answering `'store'` and 15 s after the client is uninstalled, after an update moves the store, or after a Sonoma→Sequoia upgrade extends TCC to Group Containers | `scan.hostFacts` gains a 6 h TTL, three named refresh triggers and a `source:null`/`why:'host-facts-stale'` degrade; `grant` moves INSIDE `hostFacts` and is **never trusted across a pass** (the op's own `EPERM` is the authority; a `granted` that comes back `EPERM` re-files as `tcc-denied` and clears the stored grant); `grantAskedAt` gets its reader (the don't-re-prompt rule); §5 invariant 7 takes a second named exception; §17 gains the TTL leg and its positive control |
| 5 | `carryContent` is defined only for push, yet the coalescing gate sits on the single funnel all three lanes converge into and `laneState()` can answer `via:'scan'`; meanwhile `'store'` is introduced WITH an event-driven trigger (an `fs.watch` on the store file) that has no debounce and no stated relation to `caps.scanLatency` | **Confirmed.** WhatsApp's `ChatStorage.sqlite` is written on every incoming message ⇒ in a busy group the watch fires roughly per message ⇒ one pass per message ⇒ one filter hit per message ⇒ the gate reads a `carryContent` that is undefined (falsy) ⇒ one wake per message, i.e. fence 12's own "30 messages become 30 deliveries". **Honest bound**: §7.4's 30 s floor and the spend authorizer cap the absolute spend, so this is not unbounded money — but the wakes and charges differ per lane, which makes §6.1's headline and §17's parity row unsatisfiable as written | §6.4's precedence states `via:'scan'` ⇒ `carryContent:false` explicitly (a scan pass is a batch, like a poll pass); the `fs.watch` is defined as a **cursor kick**, debounced to `caps.scanLatency[source]` (which makes that number a real ceiling), and owes the `opencode-events` round-4 inotify-lifetime rule; §6.1's diagram and §17's parity row follow, the latter with a burst leg and an undebounced negative control |
| 6 | The `'store'` lane needs a SQLite reader inside the daemon and the design names no mechanism — while every candidate collides with a constraint this repo has written down, so P6a's 4–5 rounds does not price it | **Confirmed.** The daemon is a single-file esbuild bundle with exactly one `--external` (`node-pty`), the installer calls it "zero-dep" with `NODE_MIN=18`: `node:sqlite` does not exist on 18/20, still emits ExperimentalWarning on 24 (measured), and its **row-reading API is synchronous** (its `backup()` is async, so the hazard is the row scan) while CLAUDE.md says this daemon carries live session pipes; a native binding needs a second `--external` plus per-platform prebuilts; `sqlite3(1)` as a bounded child is fence 3's sanctioned shape | §2 and §12.5 name the mechanism with its constraint: **the bounded child is recommended**, `node:sqlite` sits behind a runtime probe and a stated `NODE_MIN` bump, the native binding is **explicitly refused** with the bundle reason; `no-sqlite-reader` joins the op's failure vocabulary; §21 gains "which reader exists on a paired Mac's daemon is unmeasured"; P6a is re-priced |
| 7 | Sending has no named mechanism on the one platform that gets `'store'`. "The same act on both routes" is true for `'ui'` (a browser types into a web page) and undefined on macOS, a native Catalyst app; and P6a's deliverables contain no send path while claiming it "needs no agent-browser" | **Confirmed.** The sentence appears three times (§6.3, §12.5, decision 19) and both docs mirror it; the `'store'` row's Sends cell says "falls to `'ui'`" whose send mechanism is an agent-browser — so P6a as scoped is read-only and never says so | The sentence is split per source in all three places; **P6a is stated READ-ONLY and made structural** (`convCaps.sendAs` resolves to `[]` with `why:'no-send-lane-on-this-host'`, rendered by §4's existing rule, which stops any proposal); macOS's two candidates (a SECOND linked-device credential / native UI automation with its own TCC grant) go to §21 as the **open** question; the `'store'` row's Sends cell is rewritten |
| 8 | `freshnessClaim(lane, convEntry)` cannot compute either number it states: it returns `seconds` (an **age**) with no clock, and no `caps` (the poll case's "≤ 30 s" lives in `caps.pollInterval.hot`); and r5 widened its first parameter into a union of two **disjoint** shapes with no discriminator | **Confirmed.** Every sibling resolver takes `now` (`laneState`, `scanState`, and this repo's `quota-model` / `decideLagShadow`); `laneState()`'s answer carries `via`, `scanState()`'s carried only `source`, leaving the callee to sniff which keys are present. **Separately**: §12.5 property 1's "latency comes from `scanState`, not a static declaration" is false as written — `latencySeconds` is defined two lines above it as `caps.scanLatency[source]` | The signature becomes `freshnessClaim(caps, laneOrScan, convEntry, now)`; `scanState()` gains `via:'scan'` so the union is explicit; property 1 is restated as **two numbers** (the declared cadence = the static table indexed by the resolution; the observed age = `lastScanAt` against `now`) with the row obliged to say which it shows; §17 gains "the same `convEntry` at two `now` values must give two `seconds`" |

This round's own lesson is a piece of method: **every new field a fix introduces
must be re-read against the rule that fix has just written down.** In the same
section r5 correctly argued that a per-deployment fact cannot live in a per-kind
declaration (finding 2 left the adjacent field doing exactly that), correctly cited
r4's "a field with no reader is the fix was never wired" (finding 4 gave the new
record three of them), and correctly described `'store'` as the better lane
(findings 5 and 7 never asked which gate it lands behind or whether it can send). A
round of fixes is not exempt because it is a fix.

---

## 19. Phases, rounds, calendar

One **round** ≈ 1 h implementer + ~20 min adversarial verify (measured
2026-09-10 across 32 workflows / 130 agents). Calendar at **2 rounds/day**.
Ranges are honest: the low end assumes one-round convergence, the high end
assumes the module needs the extra rounds that the measured distribution says
about a third of them do.

### P0 — store, index owner, adapter interface, fake adapter, panel skeleton, **the integration layer** — **16.5–18.5 rounds (8.25–9.25 days)**

`src/channel-store.js` (durable primitives), `src/channel-record.js`,
**`src/channel-caps.js` (both axes, `convCaps` and its TTL, `freshnessClaim`,
`identityWarning`, the **one** lane resolver `laneState` and the **one** scan-source
resolver `scanState`)**, `src/channels/index.js` + the fake adapter (**which really
runs all three receive modes, and both sources in scan mode**), a `src/server/channels-engine.js` skeleton
(scheduler, single flight, broadcast) carrying **the serialized index owner of
§5.1 from the first commit**, `src/routes/channels.js`, the six rail
registrations (§10.1), the panel list (**with freshness chips**) and an empty
conversation window. Also the one-word `channelAdapters` entry in
`RESERVED_CONTRIBUTIONS` with its suite update (§15). Gates:
`test-channel-store` (including the two-concurrent-passes leg and its
read-modify-write negative control), `test-channel-adapter-contract`,
`test-channel-caps`, `test-channel-record`, `test-plugin-loader`.
**Exit:** the fake adapter's conversations appear in the panel, open in a window,
survive a restart, sync across two clients, two simultaneous passes both advance
their cursors, and **a read-only conversation draws no send control at all**.
(r3: +2 rounds — the two-axis capability record, `convCaps`, and the fake
adapter's scan / push modes. r4: +1 round — `laneState` and its precedence,
`convCaps`'s TTL, and the synthetic anchor key in the fake adapter's scan mode.
r5: +1 round — the per-platform `scanSources`, the `scanState` resolver and its
precedence, and a `'store'` source on the fake adapter, so "one day of traffic
through either source produces the same records" has a leg from day one. **r6: +0.5
rounds** — `historyBySource` plus `scanState`'s new `via`/`history`/`hostFacts` TTL,
and the wiring stanza's **size ratchet**: that budget is at its ceiling today
(measured 2100/2100), so P0's **exit criteria** gain one line — **measure
`server.js` first**, then either raise the budget deliberately in the same commit
with the reason, or extract an existing stanza into `src/server/` first; either way
`npm run build` must be green on that commit, because it is both the release gate
and a step of the in-app self-update (§2.1).) **r7: +5.5 rounds — the whole of §14's layer lands in P0**, because it is a
prerequisite for this design's own first adapter (without it, Lark's app id/secret can only go in
settings, and §14.1 says why that is not allowed): `src/secret-box.js` **moved up from P1** (+1,
including the mounts parity and the ENOENT-only catch, §14.7), `src/integration-registry.js` +
`src/server/integration-store.js` + `src/routes/integrations.js` (+1.5), the Integrations window with
its cards, Replace, deep links and ≤768px single column (+1.5), `test-integration-registry` and its
standing grep census (+1), and the helm `integrations:` block + `deploy/README.md` (+0.5). **Two more
exit criteria**: the fake adapter gets a registry row of its own, so all three sources ("the user's
own > the cluster default > none") are exercised in P0; and **injecting a cluster default and then
withdrawing it** must turn that row into `none` with a stated reason, never quietly keep serving the
old value.

### P1 — Lark read + Gmail read + **the push lanes** — **14–16 rounds (7–8 days)**

`src/oauth-loopback.js` **dual-mode** (§12.4: ephemeral + fixed, port held only
for the flow, named `EADDRINUSE` refusal, paste-back fallback, both `state`
checks carried over verbatim), `src/channels/lark.js`, `src/channels/gmail.js`,
the adapter panel (connect / re-auth countdown / tracked pickers / inclusion
query), failure surfacing + retraction, and
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
and demotion, plus Gmail's Pub/Sub pull. r4: +1 round — `missRate`'s rolling window
and its count-only-while-carrying rule, the "re-assert to retry" affordance on the
adapter row, and `test-channels-push`'s "the demotion changes what the lane carries"
leg.) **r7: net ±0** — the `src/secret-box.js` extraction **moves out** to
P0 (−1), and what moves in is this layer's two consumer legs (+1): the Lark and Gmail adapters take
their credentials from `resolveIntegration()` rather than each reading the env, their own
`registerIntegrationTest` runners, and the connect wizard's three copy paths for `none` / `cluster` /
`user` (§10.1, §14.5). **One more exit criterion**: an instance with only a cluster default, where the
user typed nothing, must connect end to end.

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

### P3 — outbox, approval, receipts — **10–13 rounds (5–6.5 days)**

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
fields, the audit fields. r4: +1 round — the unconditional `convCaps` re-resolution at
approval time and its refusal path.)

### P4 — real external send — **7–9 rounds (3.5–4.5 days) + owner-blocked time**

Lark send (identity per decision 2, `uuid` idempotency), Gmail send (two-phase
draft, threading headers), `reconcile()` for unknown outcomes, guardrails end to
end, and the sender honesty line as an **off-by-default** switch (§9.5).
**This phase opens with the identity proof**: one real send settles Lark's
`identityMarking` from `unknown` into `none` or `marked` (§21 item 3), because
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

### P6 — local-client adapters (WhatsApp / WeChat) — **14–20 rounds (7–10 days), not scheduled, two legs gated separately**

§12.5. After r5 this phase **splits into two independent legs whose gates differ**
— which is precisely what recovering `'store'` buys: the class is no longer blocked
as a whole on the agent-browser system.

**P6a — the macOS `'store'` leg (4–5 rounds), gated on decision 19 alone.** The
`channels-scan-store` agentd op (daemon handler + a capability in the hello-ack +
the three-touch rule), the SHARED `src/channels-store-scan.js` (platform facts, a
**read-only open plus a scratch snapshot taken from that read-only connection**
(§12.5, r6 — not the default open), the `(rowid, timestamp)` cursor, mapping
`ZWAMESSAGE` / `ZWAMEDIAITEM` into `ChannelRecord`s and resolving contacts and media
references), `scanState()` and the TCC grant row in the connect wizard, plus
`test-channels-store-scan`. **It needs no agent-browser**, which makes it the one
leg of this class that could land on its own today; and because it carries a real
anchor it is also the one leg that does not owe the synthetic key's cost. **It is
also READ-ONLY (r6)**: this leg contains no send path, so it must say so
structurally — `convCaps.sendAs` resolves to `[]` with
`why:'no-send-lane-on-this-host'`; sending on macOS is an **open** question in §21
and is out of this leg's scope. **r6 re-price: 5–7 rounds** (was 4–5), the addition
being choosing and wiring the SQLite reader (a bounded `sqlite3(1)` child / a
probed `node:sqlite` with a `NODE_MIN` bump; the native binding is refused) plus the
`no-sqlite-reader` named refusal — §12.5 makes the decision, but it still has to be
implemented against the real daemon bundle and measured.

**P6b — the `'ui'` leg (9–13 rounds), doubly gated.** The agent-browser profile,
login liveness, cursored UI scanning, sending through the client's own composer,
plus the WhatsApp and WeChat adapters and their `tosRisk` acknowledgement dialog.
**Gated on two things**: decision 19 (whether the owner accepts the terms risk) and
`docs/design-agent-browser-v2.md`'s profile system landing.

The interface side is in place from P0, so no line of either leg touches the store,
the filter, the spend path or the outbox. (r4: +1 round — actually implementing
§12.5's three `'ui'` ingest-contract lines: the synthetic anchor key, the
scroll-bounded complete pass, and deciding on two real clients whether they expose a
stable message id at all. **r5: +4 rounds** — all of P6a, one of which is spent
**measuring** what this design took from public material: the store path and its
current schema on a real Mac, whether TCC prompts or denies outright, and how that
unencrypted store behaves while the owner's own client is updating it. **r5's
line said "+4 rounds" while P6a was stated as 4–5 and P6 itself moved 9–13 → 13–18,
i.e. +4–5; r6 fixes that arithmetic slip and re-prices P6a at 5–7 ⇒ P6 = 14–20.**)

**Totals:** P0–P4 = **56.5–67.5 rounds ≈ 28.25–33.75 working days** at 2 rounds/day, plus
owner-blocked time for the two scope round trips. (The r2 review added 2–3 rounds;
**r3 added 10**: the two-axis capability record +2 in P0, the push lanes +4 in P1,
coalescing and lane parity +2 in P2, the identity surface +1 in P3, the identity
proof +1 in P4; **r4 added 3**: `laneState` and the `convCaps` TTL +1 in P0,
`missRate`'s window and the demotion's retraction +1 in P1, the approval-time
re-resolution +1 in P3; **r5 added 1**: `scanState` and the per-platform
`scanSources` +1 in P0; **r6 added 0.5**: `historyBySource` / the `hostFacts` TTL and
the already-full size ratchet +0.5 in P0 — r4's, r5's and r6's further +1, +4–5 and
+1–2 in P6 stay outside this total, because P6 is unscheduled anyway; **r7 added 5.5**: the whole
integration layer +5.5 in P0, with P1 net ±0 (the secret-box extraction −1 moved to P0, two consumer
legs +1).) P0–P2 alone — read-only channels with assignment, filtering
and **real-time push**, plus **a UI where a user can configure their own key**, and no outbound path
at all — is **39.5–45.5 rounds ≈ 19.75–22.75 days**, and it is still a coherent shipping point: the panel is useful,
messages arrive live, no external message can leave the building, and the money is
already bounded.

---

## 20. Decisions for the owner

Each carries a recommendation. None is reversible for free later, which is why
they are here rather than in the code.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | **Adapters in-tree or plugins?** | in-tree modules / plugin packages | **In-tree for v1.** The OAuth flows, the secret store and the spend guard are all in-tree; an IPC boundary per message buys nothing at this scale. Keep the interface identical so third-party adapters become plugins in P5 without forking the registry |
| 2 | **Lark send identity** (updated by r3/Q4) | as the **user** (needs `im:message` + **`im:message.send_as_user`** — a dot, not a colon — a version publish and re-consent) / as a **bot** (needs the bot added to every chat) / both | **As the user, and the scope round trip stays in P4.** It is what the other side expects in an existing human group and it needs no change to anybody else's chats. Bot identity only as a fallback where user-send is refused — and bot sending is `identityMarking:'marked'`, so that fallback **must speak on the approval card**. **The new half:** whether user-identity send actually changes the `sender_type` the recipient sees is undocumented and contradicted by a community report, so until one real send in P4 proves it, this adapter declares `identityMarking:'unknown'` and is treated as `marked` (§9.5, §21 item 3). **Until the scope lands the UI says** "sending needs two more permissions on the Lark app, a version publish and one re-consent" rather than showing a greyed control |
| 3 | **Lark receive lane** (rewritten by r3/Q3(a)) | poll-only / poll + WebSocket **kick** / WebSocket **carrying content** + poll for reconciliation / webhook | **Push is first-class and ships in P1; content vs kick is decided in one place by `laneState()` (the claim lives on the adapter record's `push.claimedExclusive`); never the webhook.** The long connection needs no public URL, is self-built-apps only, allows 50 connections per app, wants a 3 s ack, and is **at-least-once with 4 retries** — so "push is unreliable" is not a reason. The real constraint is **cluster mode**: with several clients on one app credential each event reaches exactly one at random. That is a **configuration** condition, not a law of nature ⇒ carry content when exclusive (polling drops to a 15-minute reconciliation), kick only when shared or unknown (r2's behaviour, and the default). A public inbound endpoint buys nothing over the long connection |
| 4 | **Lark redirect URI** | reuse the ops tooling's registered loopback port / register a dedicated one for VibeSpace | **Register a dedicated one — and treat the port as machine-global regardless.** Registration resolves VibeSpace-vs-ops-tooling; it does **not** resolve two VibeSpace instances on one box (a production service beside a checkout), where the loser gets an opaque `EADDRINUSE` after the user is already at the consent page and the port holder receives its code. §12.4 binds only for the flow, refuses by name, and falls to paste-back. If the console accepts several redirect URLs per app, register ours *alongside* rather than displacing theirs (unverified — §21) |
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
| 18 | **Who decides a push lane is exclusive?** (new, r3/Q3(a)) | (a) the operator **asserts**, the product **measures** and **auto-demotes** on disagreement / (b) cursor kicks forever (r2) / (c) trust the assertion, never measure | **(a).** The platform never says how many other clients are connected, so exclusivity can only be asserted — but it is **measurable**: `push.missRate`, the fraction of records seen first by the reconciliation poll rather than by push, stays at 0 on a genuinely exclusive lane. Crossing the threshold (default 2 %, ≥ 20 samples) demotes to kick mode and states the reason on the adapter row. (c) is a prayer; (b) turns off the real-time push the owner asked for. The default is `unknown` ⇒ **asserting nothing gives you (b)**. **r4 adds two sentences, and without either the demotion is a one-way ratchet**: the ratio is counted **only while the lane is carrying content, and only over a rolling window** (last N records or last 24 h, whichever is larger) — otherwise every record in kick mode is first-seen-by-poll, the ratio tends to 1.0 by construction, and a demoted lane never comes back; and a demotion is **retracted by whoever made the claim** (re-assert exclusivity in the connect wizard ⇒ counters reset, one retry), never by the counters themselves |
| 19 | **How far do local-client adapters (WhatsApp / WeChat) go?** (new, r3/Q3(b); **corrected by the owner in r5**) | (a) not at all / (b) **UI only**: the official client inside an agent-browser profile, scan what it renders, send through its own composer / (c) also protocol libraries (whatsmeow / Baileys) and reading the local store / (d) **(b) plus reading the store on platforms where the client leaves it unencrypted** | **(b) + (d), still explicitly excluding (c).** r3 excluded "read the local store" wholesale by bundling it with the protocol libraries, and **the owner pointed out that this is wrong**: it holds for WeChat (the store is SQLCipher/WCDB-encrypted with the key only in the **running client's process memory**, and this product does not read another process's memory — fence 13) and it does **not** hold for **WhatsApp on macOS** — that official Catalyst client leaves its whole chat history in an **unencrypted** Core Data SQLite store (`~/Library/Group Containers/…/ChatStorage.sqlite`), and reading it is an ordinary, user-authorized, read-only file read: **no secret is defeated, because there is no secret**. So **`'store'` is allowed, and preferred over `'ui'`, on the platforms that have it** — not because it is faster (though it is by an order of magnitude) but because **its anchor is not one we invented**, so §5 invariant 2 gets a real vendor id and the whole cost of `'ui'`'s synthetic key disappears. Three boundaries are fixed: ① **only unencrypted counts** — WhatsApp's Windows stores are encrypted (UWP via SEE with a dbKey derived from a machine identifier the app does not expose; the WebView2 line via DPAPI-NG), and recomputing a key the vendor deliberately withheld is the same act as extracting it from memory, which fence 13 (b) refuses ⇒ Windows takes `'ui'`; ② **Linux has no official desktop client at all** ⇒ web-in-profile `'ui'` only; ③ **WeChat does not change by one word** ⇒ `'ui'` on every platform. The store route is **read-only** (a **read-only open** plus a snapshot taken from that connection — r6 corrects r5's backup-API-first wording, which named the one mode that mutates; never write, never checkpoint), runs as a `channels-scan-store` agentd op (`hostId` a parameter, the local box device #0), and macOS TCC is a **named** gate: a refusal reaches the user as `tcc-denied` with grant steps in the connect wizard and **never** silently degrades to `'ui'` (that would turn the latency number on the conversation row into a lie). **Sending is stated PER SOURCE (r6 correction), because it is not one act**: `'ui'` = an agent-browser typing into that logged-in official client's own composer, so identity really is the user (`identityMarking:'none'`); macOS `'store'` has **no send lane of its own** — the official client there is a native Catalyst app no browser profile reaches — so P6a is **READ-ONLY** and says so structurally (`convCaps.sendAs: []` with `why:'no-send-lane-on-this-host'`, which §4's rule renders as not-offered-with-a-reason and which creates no proposal). **A fourth thing is therefore open and belongs to you**: whether macOS sending is (i) the same Web client in an agent-browser profile — plainly a **SECOND linked-device credential**, two logins for one conversation, modelled as its own row beside `auth.state()`/`scanState().grant` — or (ii) native macOS UI automation (Accessibility / CGEvent) with **its own** TCC grant, or (iii) neither, leaving the class read-only where `'store'` wins. **Recommendation: (iii) for P6a**, and decide (i) vs (ii) only if the owner asks for outbound on macOS — the read half is the value, and a second credential quietly contradicts "it really is the user". Also (r6): the store route's read is a **read-only SQLite open** with a snapshot taken from that connection (never the default read-write open, which checkpoints and deletes the WAL on close), and the daemon-side SQLite reader is named in §12.5 rather than left to the implementer. The interface models the class from P0; P6 therefore **splits into two legs**, the macOS `'store'` leg gated on this decision **alone** (it needs no agent-browser) and the `'ui'` leg still doubly gated |
| 20 | **Should Gmail push be on by default?** (new, r3/Q3(c)) | on by default / **available, off by default** / not at all | **Available, off by default.** Pub/Sub's pull subscription means it needs no public inbound endpoint either, and each instance can hold its own subscription, so exclusivity is easier to achieve than on Lark's long connection. But it costs a GCP topic, an IAM grant and a **daily renewal job** (the watch expires silently after 7 days and stops without a sound if one is missed), and what it buys is trading a poll that costs one request per tick when nothing changed for second-level latency. At mail's cadence that is a switch a user should turn on for their own situation, not a default |
| 21 | **How OAuth callbacks work in the cluster (r7, §14.9)** | (a) the existing **loopback + paste-back** (the cluster registers one URL, independent of the number of instances; one extra paste per connect) / (b) a **cluster auth relay** `https://auth.<cluster>/cb` (signed state forwarded to the instance's public URL; zero pastes) | **(a) for v1, (b) as a later phase.** Not because it is easier: (a) is the path running in production today (the Gmail mounts), and the redirect_uri contains no instance address at all ⇒ "N instances with N public URLs" is **structurally not a problem**; (b) adds a component that **can see authorization codes**, which must forward and never persist, and whose compromise is a whole-cluster problem — a change that needs its own threat model and its own operational commitment, worth scheduling on its own rather than riding along. Choosing (b) also decides: who operates it, how its signing key rotates, and how an instance verifies that signature |
| 22 | **Once the cluster supplies a default credential, is the user CONNECTED or merely PRE-FILLED? (r7)** | Automatically **connected** / **pre-filled**, still one Connect click | **It depends on the kind of row, and that is the decision**: **an OAuth row (lark / gmail) structurally cannot be auto-connected** — what the cluster supplies is an **app credential**, while connecting also needs **this user's own authorization** (one browser round trip), so it can only be "pre-filled + one click", with the UI saying **"provided by the cluster"**; a **key-only row** (CloakBrowser / cloud browsers) genuinely can work the moment it is injected, and there is a precedent for exactly that: the frp plugin is **default-enabled** when the cluster injects its env (`src/plugins.js:584-588`). **Recommendation**: OAuth rows pre-filled; key-only rows follow frp's rule and are available by default — but **only when that key is not billed per seat** (§14.8, last rule). One cluster-funded seat shared by N users is an operational decision, not a default |
| 23 | **May a user's own key be exported under a passphrase? (r7, §14.10)** | Yes (join the `sensitive` half) / never exported | **Yes, but only `source:'user'` rows.** They are the same class of thing as `mounts` / `accounts` (already in that half), and a user migrating instances expects their own key to travel. **A cluster default is never exported**: it is not ours, it rotates, and imported onto an instance with no such preset it must resolve to `none` **naming what is missing** rather than silently falling back to the exporter's values |
| 24 | **One `secret-box` key or one per store? (r7, §14.7)** | One shared `data/.secret-box-key` / one per store | **One per store**, with mounts' `data/.mounts-key` untouched byte for byte. Moving a key file is an **irreversible data-loss path** bought for one fewer file, and when a key is rotated or damaged the blast radius should stop at one store. The only upside of sharing (one fewer file in a backup) is bought instead by §14.10's export block |
| 25 | **May a registry row ship before its consumer exists? (r7, `whatsapp-business` in §14.2)** | Yes (place the card now) / no (same commit as its adapter) | **No.** A row with no live consumer is a card that does nothing, while the key a user types into it is stored, encrypted, exported and listed under "where is this used" — and used by nothing. This is the same law as `SPEND_REASONS` and `contributes.channelAdapters`, enforced by `test-integration-registry`'s `consumers` census. The fields and the "no cluster default" answer are still fixed **now** (the table in §14.2), which costs nothing |

---

## 21. What I could not verify

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
    the engine ever moves to a worker or to a paired device (§15), the door
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
17. **Neither `push.missRate`'s threshold nor its window is calibrated.** 2 % over
    ≥ 20 samples is a starting point derived from "it should sit at 0 on a genuinely
    exclusive lane", not a measured number; and r4's rolling window ("last N records
    or last 24 h, whichever is larger") is likewise a shape rather than a measured N —
    too narrow and one quiet night demotes a healthy lane, too wide and a real
    misconfiguration drags on for days. The first week should watch both numbers, and
    the demotion must be **visible** (adapter row, a log line, and the "re-assert to
    retry" affordance) so the calibration comes from data rather than from this
    paragraph. **What is no longer unknown**: whether the demotion is a one-way
    ratchet does not depend on the calibration — §6.4's two rules (count only while
    carrying content; retracted by the claimant) answer that structurally, and
    `test-channels-push` has a negative control for each.
18. **The WhatsApp and WeChat local-client shapes have never been run in this
    tree.** §12.5 is an adapter **class** written from public material: the
    feasibility of UI scanning, how far history scrolls, how login liveness is
    judged, and how stable a real client is inside an agent-browser profile are all
    unmeasured. That is also why it is P6 rather than P5 — it owes a round of
    investigation, not a round of implementation. **r4 narrows the unknown**:
    `'ui'`'s ingest contract is now written down (the synthetic anchor key, the
    scroll-bounded complete pass, the ban on `history:'none'` for `receive:'scan'`),
    so what is left unknown there is no longer "does this class satisfy the store's
    invariants" but **whether these two specific clients expose a stable message
    id**.
19. **r5's `'store'` route: what was checked and what was not.** The owner's
    reported fact — that WhatsApp Desktop on macOS leaves its store unencrypted and
    plain sqlite reads it — **agrees with public material**, and this design splits
    it as follows. **Checked**: ① the path and file name agree across several
    independent public sources
    (`~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite`,
    with sibling variants `.private` and `group.net.whatsapp.family`), messages in
    `ZWAMESSAGE` / `ZWAMEDIAITEM`, and it being a **Core Data** store identifies the
    **Catalyst** build (i.e. the Mac App Store one; the old Electron build kept
    IndexedDB under `~/Library/Application Support/WhatsApp`, an entirely different
    shape, and was announced deprecated in 2024); ② "unencrypted, plain sqlite reads
    it" has multiple independent sources, the most recent being public research
    published 2026-05 describing the on-disk chat databases on iOS and macOS as
    plaintext; ③ the live store carries a WAL, so reading the main file alone omits
    messages and one must copy `db`/`-wal`/`-shm` or use the backup API — from a
    public implementation that reads it directly. **r6 measured a third option that
    source does not name**, and it is the one this design now takes: a read-only
    SQLite *open* reads WAL content and mutates nothing, while the backup API's own
    source connection is the mode that checkpoints and deletes the WAL on close
    (§12.5's table). What that public implementation got right is the half r5
    mis-stated: it is the **file**, not the open, that omits messages; ④ **Windows is encrypted** (UWP via
    SEE with a dbKey derived from a machine identifier, the WebView2 line via
    DPAPI-NG), described by a peer-reviewed paper and a forensics write-up
    respectively; ⑤ **Linux has no official desktop client**. **Not checked**: (a)
    **not one version number** — none of this has been run on a real Mac against a
    specific WhatsApp build, which is exactly what P6a's first round is for; (b) the
    sources do not fully agree on the **file name** — the 2026-05 research names
    `Axolotl.sqlite` (protocol session state) while the tools that read it directly
    name `ChatStorage.sqlite` (the Core Data message store); both files exist in the
    same container, but I have not verified that both hold as described on one
    machine; (c) there is a **public dispute about that claim's reach** — a WhatsApp
    watch site countered that the OS sandbox already prevents cross-app reads; that
    rebuttal is aimed at "other Meta apps could read it" and does not contradict "a
    user-authorized local process with Full Disk Access can", but it is a public
    dispute and belongs here; (d) **TCC's exact behaviour is unmeasured** — Apple's
    own note says Sonoma 14 protects containers under
    `~/Library/Application Support/` and Sequoia 15 extends that to
    `~/Library/Group Containers/`, and that a process not meeting the conditions "may
    receive a prompt", but it does **not** state whether Full Disk Access suffices or
    whether that per-process-instance temporary prompt is the only route; this
    decides the wording of the grant row in the connect wizard, so P6a must open by
    measuring it; (e) the store's **schema stability** — `ZWAMESSAGE`'s columns move
    with client versions and this class has no vendor contract to lean on, so the
    adapter must treat an unreadable shape as a typed failure rather than as zero
    messages.
20. **The cross-reference to `docs/design-agent-browser-v2.md` does not resolve
    today.** §12.5 and decision 19's `'ui'` half depend on that design's profile
    system (user-data-dir + provider + fingerprint seed + proxy + live view), and at
    the time of this revision it lives on a separate branch and is not merged into
    this tree. Both references should be re-checked once it is — in particular
    whether "one long-lived logged-in official client per profile" is something its
    own model allows. **The macOS `'store'` half does not depend on it**, which is
    exactly why P6 is split into two legs.
21. **Which SQLite reader is available on a paired Mac's daemon is unmeasured
    (r6).** §12.5 names the rungs and their constraints — a bounded `sqlite3(1)`
    child (recommended; macOS is documented to ship `/usr/bin/sqlite3`, and this
    Linux dev box does **not** have it, which is itself the argument for a runtime
    probe), `node:sqlite` behind a probe with a stated `NODE_MIN` bump, and a native
    binding explicitly refused — but nothing has been run on a real paired Mac's
    installed daemon: not which node version it runs, not whether `sqlite3(1)` is on
    its PATH, and not the wall time of a `VACUUM INTO` over a multi-hundred-MB store.
    What **was** measured is the mechanism itself, on this box: the arms in §12.5's
    table (node v24.12.0 `node:sqlite`, an un-checkpointed WAL fixture) — including
    that the query API is synchronous while `backup()` is async, which is what
    decides where fence 3's event-loop rule bites.
22. **How macOS sends, if it ever does (r6).** P6a is read-only, and decision 19's
    fourth question — a second linked-device credential in an agent-browser profile
    vs native UI automation with its own Accessibility TCC grant vs neither — has no
    measurement behind either candidate: not whether a second linked device is
    acceptable to the owner, not whether WhatsApp's own limits allow it beside the
    Mac client, and not whether the Catalyst app's composer is reachable through the
    Accessibility API at all. Until one is chosen and measured, `convCaps.sendAs` is
    `[]` on that host with a named reason, which is the honest state rather than a
    silent gap.
23. **The `fs.watch` fanout on a real busy store is unmeasured (r6).** §6.4 bounds
    it structurally (a debounced cursor kick at `caps.scanLatency[source]`), and the
    premise that `ChatStorage.sqlite` is written per incoming message is taken from
    public material about the store's shape, not from watching a real one. The
    debounce makes the wake rate independent of that number, which is exactly why it
    is a ceiling rather than a hope — but the actual fanout, and the inotify cost of
    watching that container from the daemon, should be taken in P6a.
24. **Lark's console redirect-matching rule has not been read off this app's console
    (r7).** The official documentation says the redirect URL must be **in the list**
    and that the list **supports several entries**, and §14.9 plus decision 21 rest on
    those two sentences; but whether matching is byte-exact or prefix-tolerant, and
    whether an `http://127.0.0.1:<fixed port>` loopback URL is accepted at all, were
    never actually read. The ops notes say the flow worked, so the latter is probably
    yes — but that is an inference, not a reading. P1's first task (the same trip as
    §21 item 15's long-connection confirmation) should settle both.
25. **Who a cluster-registered Lark app can actually serve is untested (r7).** The
    official developer guide defines a self-built app as internal to one enterprise,
    from which §14.9 concludes that cross-tenant users must bring their own app — and
    **whether this instance's users share one tenant** is an ops fact, not recorded in
    this public repo and not checked by anyone. The corollary — that an App Store (ISV)
    app forfeits the long connection decision 3 rests on — is likewise derived from two
    documents and never tried against a real ISV app.
26. **Whether adding a `channels` preset key to `VIBESPACE_GDRIVE_CLIENTS` is
    operationally acceptable has not been asked (r7).** §12.2's correction turns
    decision 5 into "add another key rather than widen the existing one", which depends
    on two things: the cluster being fine with one more key (not asked), and Google's
    incremental-authorization behaviour matching the docs (an existing refresh token
    keeps working for the scopes it was granted) — the latter untried on this client,
    while **the existing preset's verification status** remains the unknown in item 5.
27. **The `src/secret-box.js` extraction has never been run against a real mounts store
    (r7).** §14.7's parity test is designed, not executed: "the ciphertext format does
    not change by one byte" comes from reading `src/mounts.js:369-381`, not from
    decrypting this instance's own `data/.mounts-key` and its records. P0's first task
    should be that round trip on a **copy**, because the failure mode is "every stored
    token is unreadable".
28. **The rotation granularity of putting every cluster credential in **one** JSON
    secret has not been checked with ops (r7).** `VIBESPACE_INTEGRATIONS` is one Secret
    key, so replacing the `lark` row rewrites the whole key — exactly the shape of the
    existing `gdriveClients` (`main.yaml:163-164`), so at worst it is not new debt; but
    what "rotate one row" costs in the cluster's secret tooling is unmeasured, and that
    is part of why the per-field env form (`VIBESPACE_INTEGRATION_<ID>_<FIELD>`) exists.
29. **The Integrations cards' cost at 375×667 is unmeasured (r7).** §17's e2e leg
    requires every control to be reachable, but how many cards fit on one screen and how
    far a Replace expansion scrolls were never measured — and the `showDropdown` class of
    incident (unzoomed `offsetWidth` vs a zoomed rect) comes from exactly this size, so
    that leg must really run in P0 rather than waiting until three rows exist.

**Sources for the vendor facts introduced in r3, r5, r6 and r7** (public documentation,
fetched 2026-09-10 for r3/r5/r6 and 2026-09-11 for r7; nothing here was exercised
against a real tenant or a real client — see items 2, 3, 15–19 and 24–26 above; the r6
SQLite behaviour below is the one thing that **was** measured locally, and §12.5 carries
the numbers, while r7's loopback-port fact additionally has **in-tree** evidence at
`src/gmail-sync.js:78`):

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
  (community report, not vendor-confirmed — §21 item 15):
  <https://github.com/openclaw/openclaw/issues/51663>
- **(r5)** WhatsApp's on-disk chat databases on macOS / iOS are plaintext (public
  research reported 2026-05; the dispute about its reach is in the same article —
  §21 item 19(c)):
  <https://cybersecuritynews.com/whatsapp-chat-stored-unencrypted-macos-and-ios/>
- **(r5)** A public implementation that reads that store directly — names
  `~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite`
  and its two sibling variants, opens read-only, and documents that a live store's
  WAL means copying `-wal`/`-shm` alongside it:
  <https://github.com/mmahmad/whatsapp-cli-macos>
- **(r5)** WhatsApp for Mac is the Catalyst build; the Electron one was announced
  deprecated in 2024:
  <https://9to5mac.com/2024/09/04/whatsapp-discontinue-electron-app-macos/>
- **(r5)** WhatsApp Desktop on Windows is encrypted — the UWP line uses the SQLite
  Encryption Extension (SEE) with a dbKey derived from a machine-unique identifier
  the application does not expose:
  <https://www.sciencedirect.com/science/article/abs/pii/S2666281724001884>
- **(r5)** macOS container protection — Sonoma 14 protects app data containers under
  `~/Library/Application Support/` and Sequoia 15 extends it to
  `~/Library/Group Containers/`, where a process not meeting the conditions gets a
  per-process-instance temporary consent prompt or is denied (§21 item 19(d): whether
  Full Disk Access suffices is not stated):
  <https://developer.apple.com/forums/thread/756701>
- **(r5)** There is no official WhatsApp desktop client for Linux; the only official
  route is WhatsApp Web:
  <https://wiki.archlinux.org/title/WhatsApp>
- **(r6)** SQLite's WAL documentation — the WAL file holds committed content that is
  not yet in the main database, and **the last connection to close a database
  checkpoints it and deletes the WAL**, which is why the default (read-write) open is
  the one that mutates the store while a read-only open does not (measured here;
  §12.5's table):
  <https://sqlite.org/wal.html>
- **(r7)** RFC 8252 §7.3 — for loopback IP redirect URIs the authorization server
  "**MUST allow any port to be specified at the time of the request**" (the basis for
  §14.9's Google row; the in-tree evidence is `listen(0, '127.0.0.1')` at
  `src/gmail-sync.js:78`):
  <https://datatracker.ietf.org/doc/html/rfc8252>
- **(r7)** Google's redirect URI must **match a registered one exactly** (scheme, host,
  port, path, trailing slash), with no wildcards:
  <https://developers.google.com/identity/protocols/oauth2/web-server>
- **(r7)** A Google OAuth client whose consent screen is in **Testing** with user type
  External issues refresh tokens that expire in **7 days** (the source for §12.2's
  pre-existing claim):
  <https://developers.google.com/identity/protocols/oauth2>
- **(r7)** Lark / Feishu redirect URLs must be configured under 安全设置 in the developer
  console, **only URLs in that list pass the open platform's security check**, and the
  list **supports several entries** (§14.9 and §21 item 11):
  <https://open.feishu.cn/document/common-capabilities/sso/api/obtain-oauth-code>
- **(r7)** A Lark / Feishu **self-built app** is for use inside one enterprise, as
  opposed to App Store apps which are distributable across tenants (the basis for
  §14.9's "a cluster default serves only its own tenant"):
  <https://open.feishu.cn/document/develop-process/self-built-application-development-process>
