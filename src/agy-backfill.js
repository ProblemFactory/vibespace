'use strict';
// A SUBAGENT THAT ALREADY RAN (lane agy-subagent-cards, its addendum 2026-10-22 — the owner asked when the trace showed
// it): a sub that ran under a wrapper OLDER than the cards left only its invoke_subagent row in the journal — no
// `subagent` record, no `sub` steps — and a conversation's running wrapper stays that old code until the conversation
// restarts (dtach survives the update's server restart). MEASURED on the fixture: re-attach / the restored history drew
// a plain row, no card, no sub-<id> timeline. The hub now draws them from the account's store anyway: the SAME card and
// sub steps the wrapper's tail journals (agy-store snapshotOf, read through the ONE gate agy-store-fs), placed
//   · on the history it rebuilds (AgySessionMessages — the first attach after a restart, the update's own included):
//     the card right after its row, the sub's steps as its virtual session's buffer (sub-<id>);
//   · at each turn end of a conversation an OLD wrapper still serves (the descriptor's store.afterTurn → acp-events):
//     a row ≥ 60 s old with no card (a new wrapper's look ends by then — never two writers of one card).
// Never written to the wrapper's journal (the wrapper owns it): kept on the session (`_agyCards`); a finished sub is
// never read again, a working one at most every 5 s; a sub this store does not know stays a row (no error).
// OFF THE HUB'S LOOP (B-299b A1, lane bl-loop-a — single holds of 8 to 11 s: every gated read + the step parse ran on the main
// thread, at every attach and turn end, for up to 64 spawns): the store is read by the hub's «agy-cards» worker
// (src/agy-cards.js through src/agy-cards-worker.js) — ONE worker, one call at a time; a call waits for its turn in main on
// its own clock (CARDS_QUEUE_MS) and runs on another (CARDS_RUN_MS), so a queue after a restart kills nothing. The cards read
// are kept per account and row (the row's key names its conversation) for EVERY reader of that conversation — a live session,
// View History's reader, the history page's — and asked CARD_CHUNK rows a call, so each answer lands when it is read; a row
// being read is joined, never asked twice. The warm (the descriptor's store.warmTranscript, awaited before a rebuild and before
// a history read) asks for every unlinked spawn — the kept transcript's and the ring's — and waits at most CARDS_WAIT_MS: the
// history (withCards) draws the KEPT cards, and a card that lands later is routed to the live conversation (acp-events' late
// road) when it does. The turn end (afterTurn) routes its records when the worker answers. A spawn the store answered «not
// found» for is asked again when the parent's subagents listing moved (each file's name, mtime and size), when the kept
// transcript learned the row's sub id, or after NOT_FOUND_MS (a sub's own messages are in no listing); a read that FAILED is
// never kept as «not found», and an empty answer never drops a card already read.
// node builtins + the PURE agy-store + the SHARED gate and ACP reader (a descriptor reads it — never ORCH).
const fs = require('fs');
const os = require('os');
const path = require('path');
const AS = require('./agy-store');
const { storeReader, snapshotsOf } = require('./agy-store-fs');
const { AcpSessionMessages, parseAcpBufferRecords } = require('./acp-message-manager');
let _pool = null; // the hub's «agy-cards» worker: ONE, serial (a lane's two clocks); no worker ⇒ no read at all — never the loop's
const CARDS_RUN_MS = 60000;    // a call's RUN, counted from its send — past it the worker is wedged (it respawns; the call is asked again later)
const CARDS_QUEUE_MS = 600000; // a call's WAIT for its turn, in main: after a restart every open conversation asks at once
const cardsPool = () => {
  if (_pool) return _pool;
  // a bundle that ships no such worker (the device agent's: §107 keeps it out) reads its OWN store in place, on its own loop, as
  // the release read it there — never the hub's (the hub's checkout always has the script)
  if (!fs.existsSync(path.join(__dirname, 'agy-cards-worker.js'))) return (_pool = { inPlace: true, call: async (op, x) => snapshotsOf(x) });
  const { SafeFs } = require('./hub-pool').hubPool(path.join(__dirname, 'agy-cards-worker.js'));   // r2660 (B): never in the device bundle
  return (_pool = new SafeFs({ workerPath: path.join(__dirname, 'agy-cards-worker.js'), name: 'agy-cards', poolSize: 1,
    serial: { busy: { message: 'the subagent cards are still being read', code: 'agy_cards_busy' } } }));   // B-3b03: no pool runs an op inline — its belt is gone
};
const CARD_CHUNK = 8;          // rows a call: each answer lands when it is read (a long queue's partial progress is kept)
const CARDS_WAIT_MS = 10000;   // a LIVE conversation's warm waits this long for its cards (the release held the WHOLE hub 8 to 11 s there); the rest land late
const CARDS_VIEW_WAIT_MS = 60000; // a reader with no live road (View History, the history page) waits this long — its one draw is all it gets
const CARDS_RETRY_MS = 30000;  // a live conversation whose call failed is asked ONCE more this much later (an idle one has no turn end)
const NOT_FOUND_MS = 60000;    // a «not found» stands at most this long, whatever its signal says
const CARD_CACHE_MAX = 256;    // rows kept for every reader (a live session also holds its own: the bound drops only what none reads)

const REREAD_MS = 5000;        // a working sub's store, at most this often
const HISTORY_MAX_BYTES = 16 * 1024 * 1024; // the transcript read budget per conversation (lane agy-harness-fixes)
const HISTORY_CACHE_MAX = 8;   // conversations whose read transcript is kept (codex-thread-read's cache pattern)
const PARSE_SLICE_MS = 8;      // the transcript's lines are parsed in slices this long — the loop runs between them
const LIVE_AFTER_MS = 60000;   // a live row's grace: the new wrapper's own look (AGY_WEBUI_SUB_LOOK_MS) ends first
const MAX_SPAWNS = 64;         // per session (acp-subagents MAX_SUBS)

/** The store's HOME for a session: its named Google account's root (<data>/agy-subs/<id>) or this machine's login;
 *  null = none here (another machine's conversation, an account whose root is gone — never another login's store). */
function homeOf(session, { dataDir = null, stat = true } = {}) { // stat false (B-299b A1: the worker's road): the root is not asked on the main thread — a gone root reads nothing there
  if (!session || (session.host && session.host !== 'local')) return null;
  const id = session._accountId;
  if (id == null || id === '') return os.homedir();
  if (typeof id !== 'string' || !/^agy-[0-9a-f]{6,32}$/.test(id)) return null;
  const dir = path.join(dataDir || path.join(__dirname, '..', 'data'), 'agy-subs', id);
  if (!stat) return dir;
  try { return fs.statSync(dir).isDirectory() ? dir : null; } catch { return null; }
}

// THE KEPT CARDS (B-299b A1 r2): `${account}\0${toolCallId}` → {toolCallId, subId, card, subs, final, readAt, neg} — one per row
// for every reader of the conversation; a live session holds its own references too (session._agyCards). What a session was
// SHOWN — the card's form, the sub steps fed — is its own (session._agySeen: toolCallId → {sig, fed}).
const cardCache = new Map(), cardsInflight = new Map();
const cardKey = (session, id) => `${accountOf(session) || ''}\0${id}`;
const memoOf = (session) => session._agyCards || (session._agyCards = new Map());
const seenOf = (session) => session._agySeen || (session._agySeen = new Map());
const sigOf = (e) => `${JSON.stringify({ ...e.card, elapsedMs: null, endedAt: null })}|${e.subs.length}`;
function putShared(k, e) { cardCache.delete(k); cardCache.set(k, e); while (cardCache.size > CARD_CACHE_MAX) cardCache.delete(cardCache.keys().next().value); }
function putCard(session, id, e) { memoOf(session).set(id, e); putShared(cardKey(session, id), e); }
function cardOf(session, id) {
  if (!homeOf(session, { stat: false })) return null;   // r5 (its gate): another machine's conversation — never a card this machine's store read (the cache is keyed by account + row)
  const k = cardKey(session, id), own = session._agyCards && session._agyCards.get(id);
  let e = cardCache.get(k);
  if (!e && own) { e = own; putShared(k, e); }
  if (e && own !== e) memoOf(session).set(id, e);
  return e || null;
}
/** The KEPT cards of `spawns` (agy-store unlinkedSpawns) — [{toolCallId, subId, card, subs, final}] for the rows whose sub was
 *  found, read by an earlier refreshAsync for ANY reader of the conversation. SYNC, NO READ (B-299b A1). */
function refresh(session, spawns) {
  if (!session || !Array.isArray(spawns) || !spawns.length) return [];
  const out = [];
  for (const sp of spawns.slice(-MAX_SPAWNS)) { const e = cardOf(session, sp.toolCallId); if (e && e.card) out.push(e); }
  return out;
}
/** One call of the worker for `chunk` (≤ CARD_CHUNK rows of one store): its answers kept. → false when the call failed. Never
 *  rejects. A FOUND snapshot whose reads failed somewhere (the gate's onError: a sub's steps or the parent's answer missing) never
 *  replaces a card already read, and alone it is kept NOT final — asked again (B-299b A1 r3). */
async function askCards(session, chunk, { home, now, log, pool }) {
  let got = [];
  try {
    got = await pool().call('agySnapshots', { home, now, asks: chunk.map((sp) => { const was = cardOf(session, sp.toolCallId); return { parentId: sp.parentId, toolCallId: sp.toolCallId, step: sp.step, subId: createdSub(sp.parentId, sp.step), notFoundOn: was && !was.card && was.neg && now - was.neg.at < NOT_FOUND_MS ? was.neg.sig : null }; }) }, { timeoutMs: CARDS_RUN_MS, waitMs: CARDS_QUEUE_MS });
  } catch (e) { try { (typeof log === 'function' ? log : console.warn)(`[agy] the subagent cards could not be read from the store: ${(e && e.message) || e}`); } catch { } return false; }
  const by = new Map((Array.isArray(got) ? got : []).map((g) => [g && g.toolCallId, g]));
  for (const sp of chunk) {
    const g = by.get(sp.toolCallId);
    if (!g) continue;
    const was = cardOf(session, sp.toolCallId), snap = g.snap;
    if (!snap) {
      if (was && was.card) { was.readAt = now; continue; } // an empty answer never drops a card already read (a read that failed once)
      const neg = g.skipped ? (was && was.neg) || null : (g.clean === true && typeof g.sig === 'string' ? { sig: g.sig, at: now } : null); // a FAILED read is never kept as «not found»
      putCard(session, sp.toolCallId, { toolCallId: sp.toolCallId, subId: null, card: null, subs: [], final: false, readAt: now, neg });
      continue;
    }
    if (g.clean === false && was && was.card) { was.readAt = now; continue; } // a read failed inside it: the card already read stands
    putCard(session, sp.toolCallId, { toolCallId: sp.toolCallId, subId: snap.subId, card: { type: 'acp', kind: 'subagent', ...snap.card, home, ts: sp.ts || null }, subs: snap.subs.map((x) => ({ type: 'acp', kind: 'sub', ...x, ts: sp.ts || null })), final: snap.final && g.clean !== false, readAt: now, neg: null });
  }
  return true;
}
/** The cards of `spawns` from the store, read by the «agy-cards» worker (B-299b A1), CARD_CHUNK rows a call — a row already
 *  being read (any reader's ask) is joined, never asked twice. A finished sub is never read again, a working one at most every
 *  REREAD_MS, a «not found» one as the header says. → a promise of the kept entries in `spawns`' order (never rejects). */
async function refreshAsync(session, spawns, { dataDir = null, now = Date.now(), log, pool = cardsPool, stats = null } = {}) {
  if (!session || !Array.isArray(spawns) || !spawns.length) return [];
  const memo = memoOf(session);
  if (dataDir && !memo.dataDir) memo.dataDir = dataDir;
  const list = spawns.slice(-MAX_SPAWNS), want = [], waits = [];
  for (const sp of list) {
    const k = cardKey(session, sp.toolCallId), was = cardOf(session, sp.toolCallId);
    if (cardsInflight.has(k)) waits.push(cardsInflight.get(k));
    else if (!(was && (was.final || now - was.readAt < REREAD_MS))) want.push(sp);
  }
  const home = want.length ? homeOf(session, { dataDir: dataDir || memo.dataDir, stat: false }) : null;
  if (home) for (let i = 0; i < want.length; i += CARD_CHUNK) {
    const chunk = want.slice(i, i + CARD_CHUNK), keys = chunk.map((sp) => cardKey(session, sp.toolCallId));
    const p = askCards(session, chunk, { home, now, log, pool }).then((ok) => { if (!ok && stats) stats.failed = (stats.failed || 0) + 1; return ok; });
    for (const k of keys) cardsInflight.set(k, p);
    const done = () => { for (const k of keys) if (cardsInflight.get(k) === p) cardsInflight.delete(k); };
    p.then(done, done);
    waits.push(p);
  }
  await Promise.all(waits);
  return refresh(session, list);
}
/** The records `session` was not shown yet for `spawns`' kept cards: a card whose form changed + the sub steps not yet fed. */
function lateOf(session, spawns) {
  const seen = seenOf(session), late = [];
  for (const e of refresh(session, spawns)) {
    const was = seen.get(e.toolCallId) || { sig: '', fed: 0 }, sig = sigOf(e);
    if (was.sig !== sig) late.push({ ...e.card });
    for (const r of e.subs.slice(was.fed || 0)) late.push(r);
    seen.set(e.toolCallId, { sig, fed: Math.max(was.fed || 0, e.subs.length) });
  }
  return late;
}
/** The conversation's invoke_subagent rows no card names — the kept transcript's (its steps scanned ONCE, then only the new
 *  ones: conversationRecords' own pairing of a call with its GENERIC step) and the ring's (only its lines that name one) —
 *  WITHOUT building the history's records (B-299b A1 r2: the rebuild builds them once, after). In step order. */
function spawnsOf(session) {
  const out = new Map(), carded = new Set(), buf = String(session.buffer || '');
  if (buf.includes('invoke_subagent')) {
    const recs = parseAcpBufferRecords(buf.split('\n').filter((l) => l.includes('invoke_subagent') || l.includes('"kind":"subagent"')).join('\n'));
    for (const r of recs) if (r && r.kind === 'subagent' && r.toolCallId) carded.add(String(r.toolCallId));
    for (const sp of AS.unlinkedSpawns(recs)) out.set(sp.toolCallId, sp);
  }
  const e = historyOf(session), conv = convIdOf(session);
  const kept = e && conv ? keptSpawns(e, conv) : [];
  if (kept.length) {
    // r5 (its gate): only the kept spawns the history DRAWS — below the splice's cut over the ring (agy-store spliceCut); a step at
    // or past it is the ring's, or drawn by nobody (the ring opens with the person's bubbles). The cut reads the ring's lines that
    // name this conversation or a person's bubble — the same records ringStart reads, in order (bounded by the ring)
    const ringLines = buf ? buf.split('\n').filter((l) => l.includes(conv) || l.includes('"kind":"user"')).join('\n') : '';
    const cut = AS.spliceCut(ringLines ? parseAcpBufferRecords(ringLines) : [], e.steps, conv);
    for (const sp of kept) if (sp.step < cut && !out.has(sp.toolCallId) && !carded.has(sp.toolCallId)) out.set(sp.toolCallId, sp);
  }
  return [...out.values()].sort((a, b) => a.step - b.step);
}
function keptSpawns(e, conv) {
  let s = e.spawnScan;
  if (!s || s.steps !== e.steps || s.conv !== conv || s.n > e.steps.length) s = e.spawnScan = { steps: e.steps, conv, n: 0, pending: [], list: [] };
  for (; s.n < e.steps.length; s.n++) {
    const st = e.steps[s.n];
    if (!st) continue;
    if (st.type === 'PLANNER_RESPONSE') { for (const c of st.toolCalls || []) s.pending.push(c); continue; }
    if (st.type !== 'GENERIC') continue;
    const c = s.pending.shift() || { name: st.verb || 'tool' };
    if (c.name === 'invoke_subagent') s.list.push({ toolCallId: `${conv}:${st.idx}`, parentId: conv, step: st.idx, ts: st.at ? new Date(st.at).toISOString() : null });
  }
  return s.list;
}
/** THE WARM (B-299b A1): the cards of every unlinked spawn of the conversation, read off the loop. A LIVE conversation (its late
 *  road: session._acpLate, set by acp-events) waits at most `liveWaitMs` (CARDS_WAIT_MS) — a card that lands later is routed
 *  there when it does, for a row ≥ LIVE_AFTER_MS old (the turn end's rule: never two writers of one card), and a call that
 *  failed is asked ONCE more CARDS_RETRY_MS later; a reader with no live road (View History, the history page) waits up to
 *  `viewWaitMs` (CARDS_VIEW_WAIT_MS — its one draw is all it gets; the wait holds no loop). A live conversation whose history is
 *  drawn already is the turn end's (afterTurn). `waitMs` overrides both. An ATTACH with no late road (the descriptor hands it the
 *  live bound for `viewWaitMs`) draws a card that lands later at its next rebuild (a resume, View History) — never in the open
 *  window. Never throws. */
async function warmCards(session, { waitMs = null, liveWaitMs = CARDS_WAIT_MS, viewWaitMs = CARDS_VIEW_WAIT_MS, retryMs = CARDS_RETRY_MS, ...opts } = {}) {
  try {
    if (!session || session._historyLoaded) return;
    const spawns = spawnsOf(session);
    if (!spawns.length) return;
    const live = () => (typeof session._acpLate === 'function' ? session._acpLate : null);
    const routeLate = () => {
      const route = live(), now = Date.now();
      if (!route) return;
      const recs = lateOf(session, spawns.filter((sp) => { const t = Date.parse(sp.ts || ''); return !Number.isFinite(t) || now - t >= LIVE_AFTER_MS; }));
      if (recs.length) route(recs);
    };
    const stats = { failed: 0 }, p = refreshAsync(session, spawns, { ...opts, stats });
    const bound = waitMs != null ? waitMs : live() ? liveWaitMs : viewWaitMs;
    let timer = null;
    const late = await Promise.race([p.then(() => false), new Promise((r) => { timer = setTimeout(() => r(true), bound); })]);
    clearTimeout(timer); // the bound is REF'D (an act awaits it): an unref'd timer as the only handle ends a process mid-await (exit 13)
    if (late) p.then(routeLate).catch(() => { });
    p.then(() => {
      if (!stats.failed || !live()) return;
      const t = setTimeout(() => { refreshAsync(session, spawns, opts).then(routeLate).catch(() => { }); }, retryMs);
      if (t.unref) t.unref();
    }).catch(() => { });
  } catch { }
}

/** The sub's steps as its virtual session's buffer (what acp-subagents feed / seed keep), unless a longer one is there. */
function seedSubs(session, e) {
  if (!e.subId || !e.subs.length) return;
  if (!session.subagentBuffers) session.subagentBuffers = new Map();
  const have = session.subagentBuffers.get(e.subId);
  if (!have || have.length < e.subs.length) session.subagentBuffers.set(e.subId, e.subs.map((r) => ({ ...r.rec, ts: r.ts || null })));
}

/** THE HISTORY: the journal's records with each card-less invoke_subagent row's KEPT card placed right after it. */
function withCards(session, records) {
  const spawns = AS.unlinkedSpawns(records);
  if (!spawns.length) return records;
  const got = new Map(refresh(session, spawns).map((e) => [e.toolCallId, e]));
  if (!got.size) return records;
  const out = [], seen = seenOf(session);
  for (const r of records) {
    out.push(r);
    const u = r && r.kind === 'update' && r.update;
    const e = u && u.sessionUpdate === 'tool_call' && got.get(u.toolCallId);
    if (e) {
      out.push({ ...e.card, ts: r.ts || e.card.ts }); seedSubs(session, e); got.delete(u.toolCallId);
      const was = seen.get(e.toolCallId); seen.set(e.toolCallId, { sig: sigOf(e), fed: Math.max((was && was.fed) || 0, e.subs.length) });
    }
  }
  return out;
}

/** THE TURN END of a conversation an old wrapper still serves: the records to route as if journaled — a card that
 *  changed + the sub's steps not yet fed (`sub` records). Only rows ≥ 60 s old with no card of their own. → a PROMISE
 *  (B-299b A1: the store is read by the worker; acp-events routes the records when it answers). */
async function afterTurn(session, { dataDir = null, now = Date.now(), log, pool } = {}) {
  const buf = String((session && session.buffer) || '');
  if (!buf.includes('invoke_subagent')) return [];
  const recs = parseAcpBufferRecords(buf.split('\n').filter((l) => l.includes('invoke_subagent') || l.includes('"kind":"subagent"')).join('\n'));
  const spawns = AS.unlinkedSpawns(recs).filter((sp) => { const t = Date.parse(sp.ts || ''); return !Number.isFinite(t) || now - t >= LIVE_AFTER_MS; });
  if (!spawns.length) return [];
  await refreshAsync(session, spawns, { dataDir, now, log, ...(pool ? { pool } : {}) });
  return lateOf(session, spawns);
}

// ── THE CONVERSATION'S OWN HISTORY (lane agy-harness-fixes, bug 1 — the owner: a long agy conversation said «没有更早的
// 消息» a few hundred messages back) ──
// The journal is an 800 KB ring, so the history the hub rebuilt began mid-conversation. agy's transcript.jsonl holds
// every step from 0: the WARM (the descriptor's store.warmTranscript, awaited before the attach's rebuild and the history
// page's read) reads it ONCE through the gate's ASYNC read, parses it in slices, and keeps the steps per conversation
// (bounded: HISTORY_MAX_BYTES read, HISTORY_CACHE_MAX conversations); a later warm reads only the lines agy appended
// since. The reader (AgySessionMessages, synchronous) never reads the disk for it — it splices the KEPT steps that come
// before the ring's first one (agy-store historySplice). Only agy has this store: the base ACP reader is unchanged.
const historyCache = new Map();    // conversation id → {home, account, next, size, steps, created, capped, ms, bytes, at}
const historyInflight = new Map();
const accountOf = (session) => (session && session._accountId) || null;
const convIdOf = (session) => { const id = session && (session.backendSessionId || session.claudeSessionId); return AS.isId(id) ? id : null; };
const yieldTurn = () => new Promise((r) => setImmediate(r));
// B-299b (the history warm, MEASURED: 30 conversations warmed at once — a restart — held the loop 608 ms, 10 held 181 ms): each warm
// yields after its PARSE_SLICE_MS slice, but N warms' yields land in the SAME loop turn, so their slices ran back to back. ONE warm
// reads and parses at a time across conversations: the longest hold is one slice (+ one chunk's split) again, whatever N.
// 主开发 r839: the store reader's read (agy-store-fs linesFrom — fs.promises realpath / open / read) has NO deadline of its own, so a warm
// whose read never returns would hold every later warm behind it: the queue's HEAD is bounded — the next warm starts when the head has
// not settled in WARM_HEAD_MS (said once a process); the late one still ends (or not) on its own.
let WARM_HEAD_MS = 10000, _warmLateSaid = false;
let _warmTail = Promise.resolve();
function oneWarm(fn) {
  let release = null;
  const released = new Promise((r) => { release = r; }), prev = _warmTail;
  _warmTail = released;
  return prev.then(() => {
    const timer = setTimeout(() => {
      if (!_warmLateSaid) { _warmLateSaid = true; console.warn(`[agy] a conversation's history warm has not settled in ${WARM_HEAD_MS / 1000} s (its store read is not answering) — the next warms go on without waiting for it (said once)`); }
      release();
    }, WARM_HEAD_MS);
    if (timer.unref) timer.unref();
    const p = Promise.resolve().then(fn);
    p.then(() => { clearTimeout(timer); release(); }, () => { clearTimeout(timer); release(); });
    return p;
  });
}
/** tests only: the queue head's bound */
function _setWarmHeadMsForTest(ms) { WARM_HEAD_MS = ms; _warmLateSaid = false; }
/** The sub a step of a conversation's kept transcript created («Created the following subagent: …»), or null. */
function createdSub(convId, step) { const e = historyCache.get(convId); return (e && e.created.get(Number(step))) || null; }
function pruneHistory() {
  if (historyCache.size <= HISTORY_CACHE_MAX) return;
  const aged = [...historyCache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [id] of aged.slice(0, historyCache.size - HISTORY_CACHE_MAX)) historyCache.delete(id);
}
/** THE WARM: `id` = the agy conversation, `session` = whose account root holds it (none ⇒ this machine's login).
 *  → true when its steps are kept (now or already). Never throws; a remote conversation / another machine ⇒ false. */
function warmHistory(id, { session = null, dataDir = null, remote = false, log, maxBytes = HISTORY_MAX_BYTES } = {}) {
  if (remote || !AS.isId(id) || (session && session.host && session.host !== 'local')) return Promise.resolve(false);
  if (historyInflight.has(id)) return historyInflight.get(id);
  const p = oneWarm(async () => {
    const t0 = Date.now();
    const home = homeOf(session || {}, { dataDir });
    if (!home) return false;
    const reader = storeReader(home, { log });
    const rel = AS.storePaths(id).transcript;
    const was = historyCache.get(id);
    let same = !!(was && was.home === home);
    if (same && was.capped) { was.at = Date.now(); return true; }
    let got = await reader.linesFrom(rel, same ? was.next : 0, maxBytes - (same ? was.next : 0));
    if (got && same && got.size < was.next) { same = false; got = await reader.linesFrom(rel, 0, maxBytes); } // rewritten: read again
    if (!got) { historyCache.delete(id); return false; }
    const steps = same ? was.steps : [], created = same ? was.created : new Map();
    let last = steps.length ? steps[steps.length - 1].idx : -1, mark = Date.now();
    for (let i = 0; i < got.lines.length; i++) {
      if ((i & 63) === 63 && Date.now() - mark > PARSE_SLICE_MS) { await yieldTurn(); mark = Date.now(); }
      const st = AS.transcriptStepOf(got.lines[i]);
      if (!st || st.idx <= last) continue;
      st.thinking = ''; // not journaled live — never drawn from here
      steps.push(st); last = st.idx;
      if (st.type === 'GENERIC') { const sub = AS.createdSubagentOf(st.content); if (sub) created.set(st.idx, sub); }
    }
    historyCache.set(id, { home, account: accountOf(session), next: got.next, size: got.size, steps, created, capped: got.capped, ms: Date.now() - t0, bytes: got.next, at: Date.now() });
    pruneHistory();
    if (got.capped && typeof log === 'function') log(`agy history ${id}: the transcript is over the ${maxBytes} B read budget — steps after ${last} are drawn from the journal only`);
    return true;
  }).catch(() => false).finally(() => historyInflight.delete(id));
  historyInflight.set(id, p);
  return p;
}
/** The kept steps of a conversation — {steps, ms, bytes, capped} or null (never warmed, another account's). */
function historyOf(session) {
  const id = convIdOf(session), e = id && historyCache.get(id);
  return e && e.account === accountOf(session) ? e : null;
}
/** THE HISTORY, WHOLE: the ring's records with the conversation's earlier steps (kept by the warm) before them. */
function withHistory(session, records) {
  const e = historyOf(session);
  if (!e) return records;
  e.at = Date.now();
  return AS.historySplice(records, e.steps, convIdOf(session)).records;
}

/** The antigravity conversation's reader (the descriptor's store.SessionMessages): the ACP journal reader whose records
 *  begin at the conversation's first step (the kept transcript before the ring — lane agy-harness-fixes) and carry the
 *  cards of subs that already ran. */
class AgySessionMessages extends AcpSessionMessages {
  _ensureParsed() {
    if (this._all) return;
    super._ensureParsed();
    try { this._all = withHistory(this._session, this._all); } catch { /* the ring alone */ }
    try { this._all = withCards(this._session, this._all); } catch { /* the plain journal */ }
  }
}

module.exports = { homeOf, refresh, refreshAsync, warmCards, withCards, afterTurn, spawnsOf, AgySessionMessages, REREAD_MS, LIVE_AFTER_MS, MAX_SPAWNS,
  CARD_CHUNK, CARDS_WAIT_MS, CARDS_VIEW_WAIT_MS, CARDS_RETRY_MS, NOT_FOUND_MS, CARDS_RUN_MS, CARDS_QUEUE_MS, CARD_CACHE_MAX,
  warmHistory, historyOf, withHistory, HISTORY_MAX_BYTES, HISTORY_CACHE_MAX, _setWarmHeadMsForTest, _historyCache: historyCache, _cardCache: cardCache, _cardsInflight: cardsInflight, _cardsPool: cardsPool };
