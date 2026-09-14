'use strict';
/**
 * THE CHANNELS INGEST ENGINE — scheduler, single-flight, broadcast, and THE
 * SERIALIZED INDEX OWNER (docs/design-communication-panel.zh.md §5.1, §6.1,
 * §6.2). ORCH tier, one `create(deps)` factory, wired once from server.js.
 *
 * WHAT P0a IS: the skeleton with its load-bearing parts REAL from the first
 * commit — the per-adapter loop with its single flight, the pass that appends
 * to the durable log BEFORE it advances an anchor, the ONE broadcast per pass,
 * and the index owner that makes two overlapping passes queue instead of
 * clobber each other. Filtering, assignment, the wake decision and the outbox
 * are LATER PHASES and are deliberately absent rather than stubbed: a
 * declared-but-inert slot is the failure this design argues against.
 *
 * THE ENGINE IS THE INDEX'S ONLY WRITER (§5.1). `src/channel-store.js` gives
 * it persistent primitives and deliberately offers NOBODY a "write the whole
 * index back" call, because two adapter passes are overlapping BY DESIGN
 * (single-flight is PER ADAPTER, not a global mutex) and a read-modify-write
 * around one atomic write loses whichever landed first. A clobbered ANCHOR
 * makes the next pass SKIP messages.
 *
 * AND `adapters.json` IS THE SAME FILE-WITH-TWO-WRITERS PROBLEM (r2), which
 * this engine used to have in its textbook form: `adapterRecords()` re-parsed
 * the file on every call and `pass()` wrote its own private array back from
 * OUTSIDE any serialized door. Five failing passes of an auth-expired adapter
 * persisted `consecutiveFailures: 5` alone and `0` with a healthy neighbour
 * passing beside it — so the amber "{n} failed passes ({code})" row, the ONE
 * honesty signal that compensates for a static freshness chip, is exactly what
 * got clobbered. `store.adapters` is now the same single owner as the index:
 * `live()` hands back THE object and `update(fn)` is the only way bytes land.
 *
 * THE LANE IS ASKED, NEVER READ OFF `caps` (§4/r4). The tick's cadence is
 * `laneState(...).pollCadence` and the content/kick decision is
 * `laneState(...).carryContent`; on a scan adapter the source is
 * `scanState(...)`. No scheduler code reads `caps.receive` or
 * `caps.scanSources` — that is the whole reason those two resolvers exist.
 *
 * AND THE INGEST IS GATED ON THAT ANSWER (r3). The r2 engine asked
 * `scanState()` for the CHIP and then called `adapter.history()` regardless,
 * while `scan.hostFacts` had NO producer anywhere in the product (`scanHost`
 * had zero callers; the seed wrote `hostFacts: null` and nothing replaced it),
 * so the resolver could only ever answer `host-facts-stale` — and the fake
 * adapter re-derived its own source from `caps.scanSources[process.platform]`
 * two lines under a comment saying it never would. Measured on the shipped
 * seam: 11 records ingested, anchor advanced, unread badged, chip "not
 * scanning". Now `pass()` PRODUCES the facts (trigger ③ below), `ingest()`
 * refuses a scan lane the resolver gives no source, and the source the
 * resolver chose is HANDED to `history()` — the registry refuses a scan page
 * that carries none. The chip and the log agree in both directions.
 *
 * THE FAKE ADAPTER IS REGISTERED ALWAYS AND INSTANTIATED NEVER, unless
 * `VIBESPACE_CHANNELS_FAKE=1`. Registering it keeps the contract suite driving
 * real code; creating a record for it would put invented conversations in a
 * user's panel.
 */
const path = require('path');
const { createChannelStore } = require('../channel-store.js');
const { createChannelRegistry, ChannelError } = require('../channels/index.js');
const caps = require('../channel-caps.js');
const fake = require('../channels/fake.js');

/** §6.2's per-adapter request budget. A SETTING in the design; a named
 *  constant here because P0a ships no settings category and a setting with no
 *  rendered section is unreachable (test-architecture §44). It becomes
 *  `channels.requestBudget` with the first real adapter in P1. */
const REQUESTS_PER_MINUTE = 20;
/** Poll cadences (seconds) — the floor is the VENDOR's, so it comes from caps. */
const RECONCILE_SECONDS = 15 * 60;
/** Exponential backoff after a typed `rate-limited` / `transport` failure. */
const BACKOFF_MS = [0, 30e3, 2 * 60e3, 5 * 60e3, 15 * 60e3];
/** Consecutive failures before the adapter row goes amber and says so. */
const FAILURES_BEFORE_LOUD = 3;
/** Records per history page. */
const PAGE = 50;
/** Pages one pass may walk before it gives up and reports `complete:false` —
 *  fence 9 says keep paging to the anchor, and this bounds "keep". */
const MAX_PAGES = 20;

function create(deps = {}) {
  const {
    dataDir,
    broadcast = () => {},
    now = () => Date.now(),
    env = process.env,
    registry = createChannelRegistry(),
  } = deps;
  if (!dataDir) throw new Error('channels-engine: dataDir is required');

  const store = createChannelStore({ dir: path.join(dataDir, 'channels'), now });

  // Built-ins. The three fakes exercise BOTH axes; a real adapter registers
  // here the same way in P1 and nothing downstream learns its name.
  for (const mod of [fake.fakePoll, fake.fakePush, fake.fakeScan]) {
    if (!registry.has(mod.kind)) registry.register(mod);
  }

  const live = new Map();     // adapterId -> { adapter, record, passing, failures, nextAt, budget }
  let timer = null;
  let stopped = false;

  // ── adapter records: THE LIVE OBJECT, never a fresh parse (r2) ───────────
  // Every caller shares one object, so a mutation made by a failing pass is
  // still there when a healthy neighbour's pass writes. `adapterRecords()`
  // stays synchronous because it is on the render path (`digest()`); the WRITE
  // goes through the serialized door below.
  let seeded = false;
  function adapterRecords() {
    const a = store.adapters.live();
    if (!seeded && !a.adapters.length && env.VIBESPACE_CHANNELS_FAKE === '1') {
      // The NAMED dev/test seam. Records are written once so a restart shows
      // the same rows and `tracked` survives it.
      // Seeded from each adapter's own CAPABILITY ROW, never from its name —
      // the same discipline every other site here obeys, and the reason the
      // contract suite's grep census finds no branch on `kind` anywhere.
      a.adapters = fake.FAKE_KINDS.map((kind) => {
        const c = registry.capsOf(kind);
        return {
          id: kind, kind, label: kind, enabled: true,
          auth: { tokenEnc: null, expiresAt: null, scopes: [] },
          lastPass: null, consecutiveFailures: 0,
          push: { enabled: c.receive === 'push', claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null },
          scan: c.receive === 'scan' ? { hostId: null, chosenSource: null, grantAskedAt: null, hostFacts: null } : null,
        };
      });
      seeded = true;
      saveAdapters().catch((err) => console.warn('[channels] adapters write failed:', err && err.message));
    }
    return a;
  }

  /** THE ONE write of adapters.json. Serialized by the store; the records it
   *  writes are the LIVE ones every caller has been mutating. */
  function saveAdapters() { return store.adapters.update(() => {}); }

  function adapterFor(rec) {
    let e = live.get(rec.id);
    if (!e || e.kind !== rec.kind) {
      e = { kind: rec.kind, adapter: registry.create(rec.kind, rec, { now }), record: rec, passing: null, failures: 0, nextAt: 0, spent: 0, windowAt: now() };
      live.set(rec.id, e);
    } else { e.record = rec; e.adapter.record = rec; }
    return e;
  }

  /** A request budget the pass spends; `false` = spend nothing more this tick. */
  function spend(e, n = 1) {
    const t = now();
    if (t - e.windowAt >= 60e3) { e.windowAt = t; e.spent = 0; }
    if (e.spent + n > REQUESTS_PER_MINUTE) return false;
    e.spent += n;
    return true;
  }

  // ── the lane, asked never assumed ───────────────────────────────────────
  function laneFor(rec, entry) { return caps.laneState(registry.capsOf(rec.kind), rec, entry, now()); }
  function scanFor(rec) { return caps.scanState(registry.capsOf(rec.kind), rec, rec.scan && rec.scan.hostFacts, now()); }

  /** The resolved lane for a row: `laneState` answers for EVERY adapter and
   *  says `via:'scan'` on a scan one, at which point `scanState` — the ONE
   *  scan-source resolver — is the answer. NOTHING here reads `caps.receive`
   *  (r3: this function and the ingest's lane label both did, which is how a
   *  lane the resolver had declared unavailable was labelled and used). */
  function laneOrScan(rec, entry) {
    const l = laneFor(rec, entry);
    return l.via === 'scan' ? scanFor(rec) : l;
  }

  /** The empty `scan` half of an adapter row, for a record seeded before it
   *  existed. Never written for a non-scan adapter (the caller asked the
   *  resolver first). */
  const EMPTY_SCAN = () => ({ hostId: null, chosenSource: null, grantAskedAt: null, hostFacts: null });

  // ── ONE pass over ONE adapter, single-flight ────────────────────────────
  async function pass(adapterId, { force = false } = {}) {
    const recs = adapterRecords();
    const rec = recs.adapters.find((r) => r.id === adapterId);
    if (!rec || rec.enabled === false) return { ok: false, why: 'no-such-adapter' };
    const e = adapterFor(rec);
    if (e.passing) return e.passing;           // single flight, PER ADAPTER
    if (!force && now() < e.nextAt) return { ok: false, why: 'backoff' };
    e.passing = (async () => {
      const changed = [];
      try {
        if (!spend(e)) return { ok: false, why: 'budget' };
        const listed = await e.adapter.listConversations({ limit: 100 });
        // Discovery only ANNOUNCES conversations. Nothing is ingested until a
        // user marks one tracked (§5 invariant 6: `tracked` is opt-in — a
        // privacy decision, a cost decision, and what keeps this a panel
        // rather than a mail client).
        await store.index.update((ix) => {
          for (const c of listed.conversations) {
            const en = store.index.entry(rec.id, c.id);
            en.vendorId = c.vendorId; en.title = c.title; en.kind = c.kind;
            en.participants = c.participants;
            if (c.lastAt && (!en.lastAt || c.lastAt > en.lastAt)) en.lastAt = c.lastAt;
          }
        });

        // `scan.hostFacts` TRIGGER ③ (design §4 / §5 invariant 7, r6):
        // UNCONDITIONALLY before a scan pass that would advance the anchor —
        // the store analogue of "re-resolve at approval time". Of the three
        // named triggers this is the only one P0a has a producer for (① is
        // the connect wizard's, which is P1's; ② "the first panel render past
        // the TTL" is subsumed here, because a render has no side effects — the
        // r2 loop lesson — and every scan pass refreshes anyway). The facts
        // land on the LIVE row through the serialized door and the resolver
        // reads them back on the next line; a stale record is never read
        // around. It is asked of the RESOLVER, not of `caps.receive`.
        let mayIngest = true;
        if (laneOrScan(rec, {}).via === 'scan') {
          if (!spend(e)) mayIngest = false;            // a round trip is a request
          else {
            const hf = await e.adapter.scanHost((rec.scan && rec.scan.hostId) || null);
            await store.adapters.update(() => { if (!rec.scan) rec.scan = EMPTY_SCAN(); rec.scan.hostFacts = hf; });
          }
        }
        const snap = store.index.snapshot();
        const tracked = Object.values(snap.conversations).filter((x) => x.adapterId === rec.id && x.tracked);
        for (const t of tracked) {
          if (!mayIngest || !spend(e)) break;
          const got = await ingest(e, rec, t.id);
          if (got.appended || got.anchorMoved) changed.push(t.id);
        }
        e.failures = 0;
        e.nextAt = 0;
        await store.adapters.update(() => { rec.lastPass = { at: now(), ok: true, code: null }; rec.consecutiveFailures = 0; });
        notify(changed);
        return { ok: true, changed };
      } catch (err) {
        const code = err instanceof ChannelError ? err.code : 'vendor-error';
        e.failures++;
        e.nextAt = now() + BACKOFF_MS[Math.min(e.failures, BACKOFF_MS.length - 1)];
        await store.adapters.update(() => { rec.lastPass = { at: now(), ok: false, code }; rec.consecutiveFailures = e.failures; });
        // A failing loop MUST reach the user (fence 8). P0a says it here and
        // on the adapter row; the "For you" item and its RETRACTION arrive
        // with the first real adapter in P1, because the producer that files
        // an assertion must be the one that withdraws it.
        if (e.failures === FAILURES_BEFORE_LOUD) console.warn(`[channels] ${rec.id}: ${e.failures} consecutive failures (${code})`);
        notify([]);
        return { ok: false, why: code };
      } finally { e.passing = null; }
    })();
    return e.passing;
  }

  /**
   * Ingest ONE conversation. THE ORDER IS THE INVARIANT (design §5 invariant
   * 4): records land in the durable append-only log FIRST, the anchor moves in
   * the index SECOND, and the coalesced flush happens LAST — so a crash
   * anywhere costs at most a re-read, which the log's dedup absorbs. The
   * anchor moves ONLY on a pass the adapter called complete.
   */
  async function ingest(e, rec, convId) {
    const before = store.index.snapshot().conversations[`${rec.id}/${convId}`] || {};
    // THE LANE IS ASKED BEFORE A BYTE IS FETCHED (r3). A scan lane the
    // resolver gives no source for (facts stale, client absent, grant refused,
    // platform undeclared) ingests NOTHING and says why — `complete:false`
    // keeps the anchor where it is, exactly as an incomplete page does. This
    // is the same answer the chip draws, so the two cannot disagree.
    const lane = laneOrScan(rec, before);
    if (lane.via === 'scan' && !lane.source) return { appended: 0, duplicates: 0, anchorMoved: false, complete: false, why: lane.why };
    let anchor = before.anchor || null;
    let appended = 0, duplicates = 0, lastAt = before.lastAt || null, complete = true, pages = 0;

    for (;;) {
      const opts = { anchor, limit: PAGE };
      if (lane.via === 'scan') opts.source = lane.source;   // HANDED DOWN, never re-derived by the adapter
      const r = await e.adapter.history(convId, opts);
      // 1. the LOG first — durable before anything claims progress
      const w = store.appendRecords(rec.id, convId, r.records);
      appended += w.appended; duplicates += w.duplicates;
      if (w.lastAt && (!lastAt || w.lastAt > lastAt)) lastAt = w.lastAt;
      anchor = r.anchor || anchor;
      if (r.reachedAnchor && r.complete) break;
      if (++pages >= MAX_PAGES || !r.records.length) { complete = false; break; }
      if (!spend(e)) { complete = false; break; }
    }

    // 2. the index SECOND, inside ONE serialized update that describes this
    //    batch — and the cursor advances only when the pass was complete.
    let anchorMoved = false;
    await store.index.update((ix) => {
      const en = store.index.entry(rec.id, convId);
      if (complete && anchor && anchor !== en.anchor) { en.anchor = anchor; anchorMoved = true; }
      if (lastAt && (!en.lastAt || lastAt > en.lastAt)) en.lastAt = lastAt;
      // DERIVED, never a stored fact (§5 invariant 7): cached for render speed
      // and always re-derivable from the log and the read mark.
      en.unread = store.countSince(rec.id, convId, en.readAt || 0);
      // The label is the RESOLVED lane — the one that just carried this
      // batch — never `caps.receive` (r3).
      en.lane = { ...en.lane, via: lane.via };
      if (lane.via === 'poll') en.lane.lastPollAt = now();
      if (lane.via === 'scan') en.lane.lastScanAt = now();
      if (lane.via === 'push') en.lane.lastPushAt = now();
    });
    // 3. the flush is COALESCED by the store (dirty + debounce + interval +
    //    SIGINT/SIGTERM), never once per change.
    // RETENTION runs where the growth happens — right after a pass that
    // actually appended, on the ONE conversation that grew. A store whose
    // retention policy has no caller is a policy nobody enforces, and a
    // sweep over every conversation on a timer would read logs nothing
    // touched. The bounds and the 7-day floor are the store's.
    if (appended) { try { store.trim(rec.id, convId); } catch (err) { console.warn('[channels] trim failed:', err && err.message); } }
    return { appended, duplicates, anchorMoved, complete };
  }

  // ── the panel's digest + the ONE broadcast ───────────────────────────────
  /**
   * What `GET /api/channels` serves and what every `channels-updated` carries:
   * adapters, conversations, their RESOLVED convCaps and their freshness
   * claim. NEVER message bodies (§10.2).
   *
   * AND NEVER A HUMAN SENTENCE (r2). `freshnessClaim` / `identityWarning`
   * return STRUCTURE and the client composes the words, because this payload
   * is broadcast to every client at once while the language is per DEVICE —
   * so a sentence built here is English for everybody by construction.
   */
  function digest() {
    const t = now();
    const recs = adapterRecords();
    const snap = store.index.snapshot();
    const adapters = recs.adapters.map((rec) => {
      const c = registry.capsOf(rec.kind);
      const lane = laneOrScan(rec, {});
      return {
        id: rec.id, kind: rec.kind, label: rec.label, enabled: rec.enabled !== false,
        auth: caps.authState(rec, t),
        lastPass: rec.lastPass || null, consecutiveFailures: rec.consecutiveFailures || 0,
        lane: { via: lane.via, why: lane.why, live: !!lane.live, carryContent: !!lane.carryContent },
        sendAs: c.sendAs, receive: c.receive, identityMarking: c.identityMarking,
      };
    });
    const byId = new Map(recs.adapters.map((r) => [r.id, r]));
    const conversations = Object.values(snap.conversations).map((en) => {
      const rec = byId.get(en.adapterId);
      if (!rec) return null;
      const c = registry.capsOf(rec.kind);
      const lane = laneOrScan(rec, en);
      const cc = caps.convCapsState(en.convCaps, t);
      return {
        key: en.key, id: en.id, adapterId: en.adapterId, title: en.title, kind: en.kind,
        participants: en.participants, lastAt: en.lastAt, unread: en.unread || 0, tracked: !!en.tracked,
        convCaps: cc,
        offers: {
          read: caps.offers(c, en.convCaps, 'read', t),
          sendAsUser: caps.offers(c, en.convCaps, 'send-as-user', t),
          sendAsBot: caps.offers(c, en.convCaps, 'send-as-bot', t),
        },
        identityWarning: caps.identityWarning(c),
        // STRUCTURE — the client says the words. `enabled` and `en.tracked`
        // are the claim's inputs (r3): a row nothing will fetch says so.
        freshness: caps.freshnessClaim(c, lane, en, t, { enabled: rec.enabled !== false }),
        lane: { via: lane.via, why: lane.why, source: lane.source || null },
      };
    }).filter(Boolean);
    conversations.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    return { adapters, conversations, unreadTotal: conversations.reduce((n, c) => n + (c.tracked ? c.unread : 0), 0), at: t };
  }

  /** ONE broadcast per pass, carrying the recomputed RESULT — never one per
   *  message, and never a bare "something changed" (the cache-invalidation
   *  law: one dirty signal, one computation). */
  function notify(changedIds = []) {
    try { broadcast({ type: 'channels-updated', changed: changedIds, digest: digest() }); } catch (err) { console.warn('[channels] broadcast failed:', err && err.message); }
  }

  // ── mutations the routes reach for ──────────────────────────────────────
  /**
   * DOES THIS PAIR EXIST — asked BEFORE anything is mutated (r2).
   *
   * `store.index.entry()` creates on first touch, which is right for the
   * ingest pass and wrong for a route: `POST /track` and `POST /read` on any
   * id whatsoever used to mint a permanent, invisible row in `index.json` —
   * a file read on every render and deep-cloned by `digest()` on every
   * broadcast — while the track route's own `404 No such conversation` was
   * unreachable dead code, because `setTracked` always answered true.
   */
  function known(adapterId, convId) {
    if (!adapterRecords().adapters.some((r) => r.id === adapterId)) return false;
    return !!store.index.snapshot().conversations[`${adapterId}/${convId}`];
  }

  async function setTracked(adapterId, convId, tracked) {
    if (!known(adapterId, convId)) return false;
    let found = false;
    await store.index.update(() => {
      const en = store.index.entry(adapterId, convId, { create: false });
      if (!en) return;
      en.tracked = !!tracked;
      found = true;
    });
    if (!found) return false;
    if (tracked) {
      // Refresh THIS conversation's capabilities: marking it tracked is one of
      // `convCaps`'s three named refresh triggers (§4/r4).
      try { await refreshConvCaps(adapterId, convId); } catch (err) { console.warn('[channels] convCaps refresh failed:', err && err.message); }
    }
    // THE PERSISTED CHANGE BROADCASTS NOW, ON BOTH BRANCHES (r3). The
    // tracked=true path used to leave its only notification to the pass it
    // kicked — and a pass the request budget could not afford returned before
    // `notify()`, so the flag was on disk, the route had answered `{ok:true}`
    // and NO client learned, including the one that clicked (the panel
    // repaints only on the broadcast). Measured: 26 of 30 tracks silent under
    // the 20/min budget. A broadcast may not depend on whether a pass was
    // affordable; the pass adds its own when it ingests something.
    notify([convId]);
    if (tracked) pass(adapterId, { force: true }).catch(() => {});
    return found;
  }

  async function refreshConvCaps(adapterId, convId) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return null;
    const e = adapterFor(rec);
    const cc = await e.adapter.convCaps(convId);
    // `create:false`: a conversation the vendor no longer lists may have been
    // removed from the index between the ask and the answer, and a cache entry
    // is not a reason to resurrect the row it describes.
    await store.index.update(() => { const en = store.index.entry(adapterId, convId, { create: false }); if (en) en.convCaps = cc; });
    return cc;
  }

  /**
   * MARK READ. Two things here are load-bearing (r2), and together they are
   * what breaks a self-feeding loop between this engine and an open window:
   *
   * 1. THE DEFAULT INSTANT IS THE NEWEST RECORD'S, NOT `now()`. "Read" means
   *    "I have seen everything this conversation holds", and a vendor is free
   *    to stamp a record ahead of our clock (the fake adapter spreads a day
   *    over the whole current UTC day, so future-dated records are ALWAYS
   *    present; a real vendor's clock skew does the same thing). With `now()`
   *    those records stay unread for ever, so `unread` never reaches 0 and
   *    nothing that watches `unread` can ever settle. Taking the newest record
   *    is also strictly MORE honest than `now()` in the other direction: a
   *    record that arrives between the newest one and this instant stays
   *    unread instead of being silently marked read.
   *
   *    AND IT REALLY IS THE NEWEST RECORD'S (r3). The r2 spelling was
   *    `Math.max(now(), newest.at)` — right for the fake adapter, whose
   *    records are always future-dated, and `now()` for every adapter whose
   *    records are stamped in the PAST, i.e. every real one. There a message
   *    stamped before the mark but fetched after it (the routine shape: the
   *    poll interval is 30-300 s) was SILENTLY MARKED READ and never badged,
   *    and `changed` was true on every call, so rule 2 below was structurally
   *    inert. The suite could not tell the two rules apart because its fixture
   *    ASSERTED it was future-dated. With no record at all the mark is left
   *    where it was — there is nothing to have seen.
   *
   * 2. A NO-OP DOES NOT BROADCAST. Every broadcast recomputes the digest
   *    (which deep-clones the index), re-renders every panel and re-reads
   *    every open window's tail. Notifying when nothing moved turned one open
   *    window into ~500 requests a second, for ever, with the user touching
   *    nothing — and each cycle rewrote `readAt`, destroying the mark it was
   *    supposed to set. The cache-invalidation law is one DIRTY signal, one
   *    computation; an unchanged value is not a dirty signal.
   */
  async function markRead(adapterId, convId, at = null) {
    if (!known(adapterId, convId)) return false;
    let changed = false, found = false;
    await store.index.update(() => {
      const en = store.index.entry(adapterId, convId, { create: false });
      if (!en) return;
      found = true;
      const newest = store.readTail(adapterId, convId, { limit: 1 })[0];
      const stamp = Number.isFinite(at) ? at : (newest ? (Number(newest.at) || 0) : (en.readAt || 0));
      const unread = store.countSince(adapterId, convId, stamp);
      changed = en.readAt !== stamp || en.unread !== unread;
      en.readAt = stamp;
      en.unread = unread;
    });
    if (!found) return false;
    if (changed) notify([convId]);
    return true;
  }

  /** `beforeId` is the OTHER half of the page boundary — see the store's
   *  `(at, vendorId)` total order. Dropping it here would put the loss back. */
  function messages(adapterId, convId, { before = null, beforeId = null, limit = 50 } = {}) {
    return store.readTail(adapterId, convId, { before, beforeId, limit });
  }

  // ── the scheduler: ONE loop per adapter, never one per conversation ──────
  function tick() {
    if (stopped) return;
    for (const rec of adapterRecords().adapters) {
      if (rec.enabled === false) continue;
      const e = adapterFor(rec);
      if (e.passing || now() < e.nextAt) continue;
      const lane = laneOrScan(rec, {});
      const c = registry.capsOf(rec.kind);
      // The cadence comes from the RESOLVED lane, never from the declaration:
      // a demoted or dead push lane gets the fast cadence back immediately,
      // with nothing else in the tree deciding that a second time.
      const secs = lane.pollCadence === 'reconcile' ? RECONCILE_SECONDS : (c.pollInterval && c.pollInterval.cold) || 300;
      const due = (e.lastTickAt || 0) + secs * 1000;
      if (now() < due) continue;
      e.lastTickAt = now();
      pass(rec.id).catch((err) => console.warn('[channels] pass failed:', err && err.message));
    }
  }

  function start() {
    if (timer || stopped) return;
    timer = setInterval(tick, 5000);
    if (timer.unref) timer.unref();
  }
  function stop() {
    stopped = true;
    if (timer) { clearInterval(timer); timer = null; }
    for (const e of live.values()) { try { e.liveHandle && e.liveHandle.stop(); } catch {} }
    store.close();
  }

  return {
    store, registry, digest, notify, pass, setTracked, refreshConvCaps, markRead, messages,
    adapterRecords, laneOrScan, start, stop,
    REQUESTS_PER_MINUTE, RECONCILE_SECONDS, PAGE, MAX_PAGES,
  };
}

module.exports = { create, REQUESTS_PER_MINUTE, RECONCILE_SECONDS, BACKOFF_MS, PAGE, MAX_PAGES, FAILURES_BEFORE_LOUD };
