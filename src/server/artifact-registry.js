'use strict';
/**
 * THE DELIVERABLE REGISTRY (lane artifacts-model; the rows, reducer and view are src/artifacts.js — PURE). The rows of a
 * conversation live on the live session (`session._artifacts`, session-schema row) and persist in its session-meta
 * `artifacts` (debounced 1.5 s like `taskRecords`); a restart restores them (boot-restore) and every rebuild re-derives
 * them from the transcript and merges (normalizers.convertWithCards → `opts.artifacts`). ONE writer:
 *   · observe(session, record) — every harness's stdout consumer (claude: the parse AND the device feed's
 *     claudeSideEffects; codex-events; acp-events) hands each record here; the session's DESCRIPTOR reads it
 *     (`artifactsOf`, src/harnesses/artifacts-of.js — never an id branch here; a `null` hook never produces).
 *     A HELPER's writes (lane artifacts-handover): a record that ENDS a Task / workflow agent names its transcript
 *     (the descriptor's `helperTranscriptsOf`, src/harnesses/helper-transcripts.js); its write records go through the
 *     SAME `artifactsOf` and land as THIS conversation's rows with `via: {kind:'subagent', name}` — live here, and the
 *     rebuild's deriver asks the same door (normalizers' helper seam). A stream record stamped as a sidechain's is left
 *     to that door (one birth, at the Task's end, with its `via`).
 *   · handover({from, to, items, reach}) — `vibespace-msg send <agent> "…" --artifact <path>…`: the helper's OWN rows
 *     land as the receiver's rows with `via: {kind:'handover', from}`; a design re-registers under the receiver and
 *     opens its Design window; the helper's row keeps `handedTo`.
 *   · presentAsk(session, artifacts, {id, said}) — `vibespace-ask … --artifact <path|/p/id>…` (lane foryou-attachments): each
 *     attachment the ask carries is a `present` op (AF.askOp) on the asking conversation's rows — its Artifacts list shows
 *     what it asked the owner to look at; `judgeAsk` (the route's submit check) proved each one OPENS before anything is filed;
 *     a /p/ link in the ask's text or detail (`said`) is a `present` op too (lane artifacts-by-intent r4) — AF.askOps, the ONE
 *     reader of an ask (r6: the rebuild reads the For-you store's asks through it — `asksOf`; a token a cap cut is no link)
 *   · touch({sessionId, host, path, summary}) — the user's own save in an editor window linked to the chat
 *     (ws `artifact-touch`): the row gets `by: user, edits+1` and the conversation hears ONE next-turn note.
 * THE REGISTRIES (lane artifacts-registries) — the three stores' ONE notification points hand their records here; the
 * registry is a VIEW over them (each keeps its store and its own list — the Pages list, the Design window's Home):
 *   · notePage(page, extra)  — src/server/published-pages.js `onPublished` (server.js): a `page` row, unpublish = its state
 *   · noteDesign(design)     — src/server/design-engine.js `onDesign` (designs.json at registration / open / rename)
 *   · noteUploads({sessionId, host, files}) — POST /api/upload when the composer names its chat (src/routes/files.js)
 *   · noteService(job)       — src/jobs.js `_serviceDoor` (jobs-wiring `onService`): a job its conversation OWNS that
 *     listens on a port is a `service` row (lane artifacts-services) — DERIVED at every read (`servicesOf`), never stored
 *   · noteForwards(msg)      — the PortForwardManager's `port-forwards-updated` broadcast (server.js): a service row's
 *     LINK reads the port's forward record (published ⇒ its public URL, else this instance's /proxy/ — lane
 *     artifacts-services-url), so a publish / unpublish patches the live service cards in place
 *   · presented pages (lane pages-chip-groups) — a /p/<id> link in a TEXT record (the hook's `present` ops, live AND
 *     rebuild) is a `page` row with `presented: true`; `listFor` resolves it against the pages store at every read
 *     (AF.resolvePresented), a birth or a page's later publish / unpublish tells the conversation's clients
 *     (`artifacts-changed` → they re-read GET /api/artifacts — the one feed); so does ANY row's birth or move between
 *     bands (noteOp — lane artifacts-by-intent r5: an ask naming a pasted page or attaching a code file moves it)
 *   At every rebuild the pages + designs rows come back from THEIR stores (`storeRowsOf`, normalizers' store-rows seam);
 *   the uploads live in the persisted rows (the composer's attachment record IS this registry). r6: so do the ASKS — every
 *   ask this conversation filed that the For-you store keeps (`deps.asks` — r7: the ask route's own answer to «whose ask
 *   is this?», src/agent-routes/status.js asksOf), open or answered, folds the ops it folded live; a rebuild whose merge
 *   stamped a row `shown` the persisted rows lacked persists at once (normalizers' persist seam → persistSoon).
 * THE CONTRACT TOWARD doc-window (spelled in src/artifacts.js's header + kb-file-structure):
 *   ownerOf({host, path}) → {sessionId, row} | null     noteEdit({sessionId, conversationId?, host, path, summary}) → boolean
 */
const AF = require('../artifacts.js');
const { toAgentText: agentText } = require('../peer-text.js');
const DOC_EDIT_FROM = 'Doc edit'; // the stash's `doc-edit` source (lane doc-window): drained as "the user edited a document:" + the re-read hint

let deps = { activeSessions: () => new Map(), deliver: null, sessionMeta: null, pages: () => null, designs: () => null, jobs: () => null, ports: () => null, instanceUrl: null, toSession: null, hosts: () => null, asks: () => [], log: console };
/** server.js's ONE line: the live sessions, the delivery ladder (stashFor), the session-meta store and the two stores
 *  a rebuild reads its pages / designs rows from. */
function configure(d = {}) {
  deps = { ...deps, ...d };
  try { normalizers().setArtifactStoreSource(storeRowsOf); } catch (e) { deps.log.warn?.(`[artifacts] store-rows seam not set: ${e.message}`); }
  try { normalizers().setArtifactServiceSource(servicesOf); } catch (e) { deps.log.warn?.(`[artifacts] service-rows seam not set: ${e.message}`); }
  try { normalizers().setArtifactHelperSource(helperOps, helperPrefetch); } catch (e) { deps.log.warn?.(`[artifacts] helper seam not set: ${e.message}`); }
  try { normalizers().setArtifactPersistSink((s) => persistSoon(s, 0)); } catch (e) { deps.log.warn?.(`[artifacts] persist seam not set: ${e.message}`); }
  try { normalizers().setArtifactQuoteSource(askIdOf); } catch (e) { deps.log.warn?.(`[artifacts] quote seam not set: ${e.message}`); }
  return api;
}
const sessions = () => { try { const m = deps.activeSessions(); return m && typeof m.entries === 'function' ? m : new Map(); } catch { return new Map(); } };
const normalizers = () => require('../normalizers.js'); // lazy: the normalizers require the harness registry

/** The session's descriptor hook — null when its harness declares none (a plain shell) or is unknown. */
function hookOf(session) {
  try { const h = require('../harnesses').harnessOf((session && session.backend) || 'claude'); return h && typeof h.artifactsOf === 'function' ? h.artifactsOf : null; } catch { return null; }
}

function persistSoon(session, ms = 1500) {
  const store = deps.sessionMeta && deps.sessionMeta();
  if (!store || !session.sockName) return;
  clearTimeout(session._artifactsTimer);
  session._artifactsTimer = setTimeout(() => {
    try { store.writeSessionMeta(session.sockName, { ...(store.readSessionMeta(session.sockName) || {}), artifacts: session._artifacts || {} }); }
    catch (e) { deps.log.warn?.(`[artifacts] ${session.sockName}: rows not persisted: ${e.message}`); }
  }, ms);
  if (session._artifactsTimer && session._artifactsTimer.unref) session._artifactsTimer.unref();
}

/** Fold ONE op into the session's rows; a deliverable's card is fed (born or patched in place). */
function noteOp(session, op) {
  const before = session._artifacts || {};
  const r = AF.apply(before, { host: session.host || '', cwd: session.cwd || '', ...op, at: Number(op.at) || Date.now() });
  if (r.skipped || !r.row) return r;
  session._artifacts = r.rows;
  if (r.evicted.length) deps.log.log?.(`[artifacts] ${session.sockName || '?'}: ${r.evicted.length} row(s) evicted past ${AF.MAX_ROWS} (oldest code first): ${r.evicted.slice(0, 3).join(', ')}`);
  if (AF.cardWorthy(r.row)) {
    const block = AF.cardBlock(r.row);
    if (AF.autoOpenVerdict(r)) block.autoOpen = true; // the client opens it beside the chat (setting artifacts.autoOpenDocs) on the LIVE create only
    try { normalizers().feedArtifactCard(session, block); } catch (e) { deps.log.warn?.(`[artifacts] card not fed: ${e.message}`); }
  }
  persistSoon(session);
  if (r.born || AF.intentOf(before[r.row.key]) !== AF.intentOf(r.row)) tellChanged(session); // THE ONE RULE (lane artifacts-by-intent r5): a row born or moved between bands — a pasted page an ask names, a code file it attaches — tells every client; an op that moves nothing tells nothing
  if (r.row.presented) return r; // lane pages-chip-groups: a page shown here — no file to index
  require('./search-index.js').noteArtifact({ sessionId: session.sockName || null, host: r.row.host || session.host || '', path: r.row.path }); // lane global-search: every new / edited row's file is (re)indexed
  return r;
}

/** THE LIVE CONSUMER: one record of a session's stdout (any harness) → its rows. Never throws. */
function observe(session, record) {
  if (!session || !record) return 0;
  const of = hookOf(session);
  if (!of) return 0;
  if (record.parent_tool_use_id || record.isSidechain) return 0; // a helper's own record: the helper door folds it at the Task's end (with its `via`)
  let ops = [];
  try { ops = of(record) || []; } catch { return 0; }
  // the helper door: the descriptor's hook names what ENDS a helper (claude: a user record; antigravity: a finished `subagent` card);
  // B-299b: its transcript is read OFF the loop — its rows land when its pages have (helperSettled), the count below is the record's own
  if (!session._helperArtifacts) session._helperArtifacts = { runs: new Map(), seen: new Set(), chain: null };
  foldHelpers(session, record, session._helperArtifacts);
  return noteOps(session, ops);
}
/** The ops of one record (or of one helper) into the session's rows → how many moved a row. */
function noteOps(session, ops) {
  ops = AF.quotedOps(ops, askIdOf(session, session.sockName)); // r10: a tray answer's quote is the agent's only when it quotes this conversation's ask
  let n = 0;
  for (const o of ops) { try { if (!noteOp(session, { ...o, by: AF.opAuthor(o) }).skipped) n++; } catch (e) { deps.log.warn?.(`[artifacts] op skipped: ${e.message}`); } }
  return n;
}

// ── THE HELPER DOOR (lane artifacts-handover) ──
// A record that ENDS a helper brings the helper transcript's write records through the session's own `artifactsOf`, each tagged
// `via`. `state` = {runs: Map (workflow launches), seen: Set (op ids already folded — the parse + the device feed, or a background
// agent read at its launch and again at its end, fold an op once), chain (the live folds, one after another)}. A remote conversation
// (host ≠ '') reads nothing (its sidechains are on its machine; none is fetched).
// B-299b (MEASURED on the test machine: a workflow's end read its 10 agents' transcripts in ONE call, 304 ms of the main loop; 30 —
// 662 ms): NO helper transcript is read or parsed on the hub's main thread. The transcript pool's pager (src/adapters/codex.js
// readJsonlBoundedParsedPagedAsync, called as it stands) reads and parses it in the `history` worker and hands its records back in
// pages; here they become ops, and the ops rows, HELPER_TURN_MS of work a loop turn (the history conversion's own rule). `tailOnly: false` = the pager's head+tail road: a file ≤ 34 MB is
// read whole (today's 8 MB cap read a file under 8 MB whole too — the same records); a longer one gives its first 2 MB and its last
// 32 MB; and that road never prints the chat window's «tail-only display» line (only the tailOnly road says it). No pool, or a read
// that failed ⇒ NO main-thread read: that helper's rows are not derived, said once a process. A file's ops are kept by its size +
// mtime (HELPER_OPS_MAX ops in all, oldest dropped) — a rebuild, or a background agent's end after its launch, re-reads a file that
// changed only. The live door folds after the record's own ops; the rebuild reads every helper its records name BEFORE it derives
// (helperPrefetch — the normalizers' helper seam), so its fold reads none. 主开发 r604: the helper reads take the worker's 'helper'
// page-snapshot slot, ONE at a time across every conversation (a helper's page 0 never cuts a person's paged history read, nor
// another helper's); a late fold notes nothing for a conversation that no longer stands (its delayed save would bring back a meta
// file holding only the rows); the rebuild's prefetch waits HELPER_PREFETCH_MS at most — the history opens, what it left is said
// and read on (kept for the next open; the rows a conversation already kept stand meanwhile).
const HELPER_TURN_MS = 20, HELPER_NOTE_CHUNK = 16, HELPER_OPS_MAX = 50000;
let HELPER_PREFETCH_MS = 2000;
/** tests only: the rebuild prefetch's wait */
function _setHelperPrefetchMsForTest(ms) { HELPER_PREFETCH_MS = ms; }
const _helperOps = new Map(); // file → {size, mtimeMs, ops: [{o, cwd}]} (oldest first)
let _helperOpsN = 0;
const _helperStats = { read: 0, kept: 0, unread: 0, left: 0, said: false };
const helperReadStats = () => ({ read: _helperStats.read, kept: _helperStats.kept, unread: _helperStats.unread, left: _helperStats.left });
let _helperReadTail = Promise.resolve();
/** ONE helper read at a time, every conversation's (the worker keeps one 'helper' snapshot). */
const oneHelperRead = (fn) => { const p = _helperReadTail.then(fn, fn); _helperReadTail = p.catch(() => { }); return p; };
let _helperClock = () => Date.now();
/** tests only: the pacers' clock (a leg advances it by the work it plants — one op = the whole budget); null = the real clock */
function _setHelperClockForTest(fn) { _helperClock = typeof fn === 'function' ? fn : () => Date.now(); }
// B-360d (its read's MUST): a turn is ONE LOOP ITERATION, never just the current check phase — asked from a poll-phase callback (a
// worker's page, a stat's answer) a single setImmediate runs in that SAME iteration's check phase, no timer between: it hops twice
// B-360d: THE BUDGET IS SHARED — every pacer of this door counts from the first slice that began in this loop iteration, so folds
// resumed in one check phase (two conversations' helpers, a read beside another's rows, a rebuild's prefetch) never take a fresh
// HELPER_TURN_MS each. Its reset is queued in the iteration before — by the first hop or opening there — ahead of every hop's second
// half queued after it, so it normally runs first in each check phase; in the rare order where a hop's first half ran before a reset
// still pending, a slice may find the last iteration's budget and turn early: an iteration lost, never a hold (the round's words).
let _turnT0 = 0, _turnOpen = false, _resetQueued = false;
function queueReset() { if (_resetQueued) return; _resetQueued = true; setImmediate(() => { _resetQueued = false; _turnOpen = false; _fgOpen = false; }); }
const oneHop = () => new Promise((r) => setImmediate(r));
const loopTurn = () => new Promise((r) => setImmediate(() => { queueReset(); setImmediate(r); }));
function turnBegins() { if (_turnOpen) return; _turnOpen = true; _turnT0 = _helperClock(); queueReset(); }
// B-360d (主开发 r1339 — A PERSON'S ASK GOES BEFORE BACKGROUND FOLDS): a stretch a person waits on (the rebuild's prefetch WALK — a
// history open awaits it, outside the prefetch's 2 s bound) is FOREGROUND: the walks share FG_TURN_MS of EVERY iteration (ONE share,
// however many walks: its reset is the background's), never behind the background folds; while a walk is alive — or one ran in this
// iteration — the background folds share the rest of HELPER_TURN_MS, so an iteration's total stays one budget (its read's must: a share
// per walk gave three walks 30 ms beside the background's 10). SAID (r1384 (2) + (3)): in the rare order where a walk's last slice runs
// ahead of a reset still pending in that check phase, the reset clears the walk's mark and the background takes its whole budget on
// top in that ONE iteration (about 30 ms, under the law; the next iteration is one budget again); and of three or more background
// folds, two take the iterations in turn and a third waits at zero until one of them ends (a long pair delays a third
// conversation's Artifacts list by their length — the price of no forced unit)
const FG_TURN_MS = 10;
let _fgLive = 0, _fgT0 = 0, _fgOpen = false;
function fgBegins() { if (_fgOpen) return; _fgOpen = true; _fgT0 = _helperClock(); queueReset(); }
const bgBudget = () => (_fgLive > 0 || _fgOpen ? HELPER_TURN_MS - FG_TURN_MS : HELPER_TURN_MS);
/** A pacer. BACKGROUND (the live folds, the reads): `due()` once the background's share of this loop iteration's budget is spent (every
 *  background pacer's work counts, shared); `turn()` gives the loop an iteration and returns only into one whose share is not spent — a
 *  stretch resumed behind another's spend does no unit there and waits again (no forced unit: an iteration's total stays bounded). A
 *  slice cut short by ANOTHER stretch's spend (it ran under half the share itself) resumes one iteration sooner — a single hop, safe
 *  once it has resumed before (it runs from a check phase: the hop still crosses a timer phase) — so two folds take the iterations in
 *  turn. FOREGROUND ({foreground: true}, `end()` when done): the walks' ONE FG_TURN_MS share of each iteration — a walk alone takes it
 *  every iteration (a single hop once it runs from a check phase); of several, two take the iterations in turn as the background does
 *  and a third waits for a slot; a walk resumed behind another's spend waits again. (MEASURED: past the rows' 500 cap a helper's write costs ~1.1 ms to fold — a
 *  count-sliced 500 held the loop 0.7 s a turn.) */
function pacer({ foreground = false } = {}) {
  if (foreground) {
    _fgLive++;
    let mine = _helperClock(), resumed = false, ended = false;
    const fgDue = () => _helperClock() - _fgT0 >= FG_TURN_MS;
    return {
      due: fgDue,
      turn: async () => {
        for (;;) {
          const short = resumed && (_fgLive <= 1 || _helperClock() - mine < FG_TURN_MS / 2);
          if (short) { queueReset(); await oneHop(); } else await loopTurn();
          resumed = true; fgBegins(); mine = _helperClock();
          if (!fgDue()) return;   // another walk spent this iteration's share: wait again
        }
      },
      end: () => { if (!ended) { ended = true; _fgLive--; } },
    };
  }
  turnBegins();
  let mine = _helperClock(), resumed = false;
  const due = () => _helperClock() - _turnT0 >= bgBudget();
  return {
    due,
    turn: async () => {
      for (;;) {
        const short = resumed && _helperClock() - mine < bgBudget() / 2;
        if (short) { queueReset(); await oneHop(); } else await loopTurn();
        resumed = true; turnBegins(); mine = _helperClock();
        if (!due()) return;   // an iteration whose share another stretch already spent: no unit here — wait again
      }
    },
    end: () => { },   // r1384 (4): kept on purpose — a reader ends its pacer whichever kind it took (helperFileRead); a background one holds no share to give back
  };
}
function harnessHooks(session) {
  let h = null;
  try { h = require('../harnesses').harnessOf(session.backend || 'claude'); } catch { h = null; }
  return h && typeof h.artifactsOf === 'function' && typeof h.helperTranscriptsOf === 'function' ? h : null;
}
/** The helper transcripts a record ENDS → [{file, via}] (the descriptor's hook: what ends a helper, and where its transcript is). */
function helperFilesOf(session, record, state) {
  if (!session || !record || (session.host && session.host !== 'local')) return [];
  const h = harnessHooks(session);
  if (!h) return [];
  try { return h.helperTranscriptsOf(record, { sessionId: session.claudeSessionId || session.backendSessionId || null, cwd: session.cwd || '', runs: state.runs }) || []; } catch { return []; }
}
/** ONE helper transcript → its ops [{o, cwd}] (the hook's own ops of each record, untagged), read off the loop; null = not read.
 *  `fg` (r1384 (1)): {on} — while on, the read's slices take the person's FOREGROUND share (the rebuild's prefetch: a history open
 *  awaits it inside its bound); the prefetch turns it off when its bound is over (the rest is read in the background's share) */
async function helperFileOps(of, file, fg = null) {
  const keptOf = async () => {
    let st = null;
    try { st = await require('fs').promises.stat(file); } catch { return { st: null, ops: [] }; } // gone: nothing to fold (the release's reader read nothing either)
    const kept = _helperOps.get(file);
    if (kept && kept.size === st.size && kept.mtimeMs === st.mtimeMs) { _helperOps.delete(file); _helperOps.set(file, kept); _helperStats.kept++; return { st, ops: kept.ops }; }
    return { st, ops: null };
  };
  const first = await keptOf();
  if (first.ops) return first.ops;
  return oneHelperRead(async () => { const k = await keptOf(); return k.ops || helperFileRead(of, file, k.st, fg); }); // asked again in its turn: a read ahead of it may have kept it
}
async function helperFileRead(of, file, st, fg = null) {
  let why = null;
  const recs = await require('../adapters/codex.js').readJsonlBoundedParsedPagedAsync(file, { tailOnly: false, slot: 'helper', note: false, onFail: (w) => { why = w; } });   // row B-422c: its refusals carry no history weight (a page past its deadline on a big healthy file never marks the person's history «not loaded»)
  if (!recs) {
    _helperStats.unread++;
    if (!_helperStats.said) { _helperStats.said = true; deps.log.warn?.(`[artifacts] a helper's rows were not derived — its transcript was not read off the main loop (${why || 'no reason given'}); none is read on it (B-299b). Said once a process.`); }
    return null;
  }
  _helperStats.read++;
  // B-360d (MEASURED on the release, probe runs 70db1a0a8-20261121120046-box / 7f71e6078-…-box): the read's last page was received
  // in THIS iteration — the hook's slices start on the next one (a turn hops twice: see loopTurn), so no iteration holds a page's
  // receive AND a full slice (one dense 34 MB
  // helper held the loop 71 ms in one turn; a workflow of 10 × 8.5 MB 62 ms)
  const out = [], pace = pacer({ foreground: !!(fg && fg.on) });   // r1384 (1): a read a person's open awaits rides the person's share
  try {
    await pace.turn();
    for (let i = 0; i < recs.length; i++) {
      if (pace.due()) await pace.turn();
      const rec = recs[i];
      let ops = [];
      try { ops = of(rec) || []; } catch { ops = []; }
      for (const o of ops) out.push({ o, cwd: rec && rec.cwd });
    }
  } finally { pace.end(); }
  const old = _helperOps.get(file);
  if (old) { _helperOps.delete(file); _helperOpsN -= old.ops.length; }
  _helperOps.set(file, { size: st.size, mtimeMs: st.mtimeMs, ops: out }); _helperOpsN += out.length;
  for (const [k, v] of _helperOps) { if (_helperOpsN <= HELPER_OPS_MAX || k === file) break; _helperOps.delete(k); _helperOpsN -= v.ops.length; }
  return out;
}
/** One helper's ops as the PARENT's: `via`, each op once (`state.seen`), the reader's person tag dropped. */
function helperTagged(session, list, via, state, at = null) {
  const out = [];
  for (const { o, cwd } of list || []) {
    const id = o.id ? 'sub:' + o.id : null;
    if (id && state.seen) { if (state.seen.has(id)) continue; state.seen.add(id); }
    const { by: _who, ...op } = o; // a helper's transcript is an agent's: its Task prompt is the parent's words, never the person's (lane artifacts-by-intent r3)
    out.push({ ...op, id, via, cwd: cwd || session.cwd || '', ...(at ? { at } : {}) });
  }
  return out;
}
/** Does the conversation still stand here? A late fold notes nothing for one killed or removed meanwhile (主开发 r604: its delayed
 *  save would bring back a meta file holding only the rows). A registry with no session store, or a session with no socket name,
 *  saves nothing — it stands. */
function stands(session) {
  if (!deps.sessionMeta || !session || !session.sockName) return true;
  for (const s of sessions().values()) if (s === session) return true;
  return false;
}
/** THE LIVE DOOR: the helpers a record ends, read off the loop one after another; each one's rows land when its read has (stamped
 *  with the record's own instant), HELPER_NOTE_CHUNK ops at a time, a loop turn when HELPER_TURN_MS of work ran — while the
 *  conversation stands. */
function foldHelpers(session, record, state) {
  const files = helperFilesOf(session, record, state);
  if (!files.length) return;
  const h = harnessHooks(session), at = Date.now();
  state.chain = Promise.resolve(state.chain).then(async () => {
    for (const { file, via } of files) {
      if (!stands(session)) return;
      const list = await helperFileOps(h.artifactsOf, file);
      if (!list || !list.length) continue;
      // B-360d: the rows start on an iteration of their own (the hook's last slice may have run in this one — two fresh 20 ms budgets
      // back to back held one turn past 50 ms), and a helper's ops are tagged chunk by chunk inside the budget (its kept ops, up to
      // HELPER_OPS_MAX, were tagged in one unpaced stretch)
      const pace = pacer();
      await pace.turn();
      if (!stands(session)) return;
      for (let i = 0; i < list.length; i += HELPER_NOTE_CHUNK) {
        const ops = helperTagged(session, list.slice(i, i + HELPER_NOTE_CHUNK), via, state, at);
        for (const op of ops) {   // the budget is asked before EACH op (one past the rows' cap costs ~1.1 ms: a 16-op chunk overran it)
          if (pace.due()) { await pace.turn(); if (!stands(session)) return; }
          noteOps(session, [op]);
        }
      }
    }
  }).catch((e) => { deps.log.warn?.(`[artifacts] a helper's rows failed: ${e.message}`); });
}
/** → a promise that settles when every live helper fold of the session has (tests; a reader that must see them). */
const helperSettled = (session) => Promise.resolve(session && session._helperArtifacts && session._helperArtifacts.chain);
/** THE REBUILD'S READ (the normalizers' helper seam, before the derivation runs): every helper the records name, read off the loop —
 *  waited for HELPER_PREFETCH_MS at most (主开发 r604: the history opens then; the reads go on and are kept for the next open, `done`;
 *  what was left is said once a rebuild) → {files: WeakMap record → [{file, via}], ops: Map file → [{o, cwd}] | null (the reads done
 *  by then), left, done}. The walk asks the hook ONCE a record, as the fold
 *  would (its own `runs`), paced as the reads are; the fold takes the hook's answer from `files` (a claude end record's hook may list
 *  the projects folder — asked twice it would be twice). */
const NO_FILES = Object.freeze([]);
async function helperPrefetch(session, records) {
  const h = session && harnessHooks(session);
  if (!h || !Array.isArray(records) || (session.host && session.host !== 'local')) return null;
  const state = { runs: new Map() }, files = new WeakMap(), ops = new Map();
  // B-360d (主开发 r1339): a history open AWAITS this walk — a FOREGROUND stretch (its own FG_TURN_MS of every iteration, never the
  // crawler behind background folds); it starts on an iteration of its own and keeps no part of the shared budget (no timer entry needed)
  const pace = pacer({ foreground: true });
  try {
    await pace.turn();
    for (let i = 0; i < records.length; i++) {
      if (pace.due()) await pace.turn();
      const rec = records[i], named = helperFilesOf(session, rec, state);
      if (rec && typeof rec === 'object') files.set(rec, named.length ? named : NO_FILES);
      for (const { file } of named) if (!ops.has(file)) ops.set(file, null);
    }
  } finally { pace.end(); }
  const names = [...ops.keys()], got = new Map();
  if (!names.length) return { files, ops: got, left: 0, done: Promise.resolve() };
  // r1384 (1): the reads a history open awaits take the person's share too (never a crawl behind two live folds); once the open's
  // bound is over nobody waits on them: the rest is read in the background's share
  const fg = { on: true };
  const done = (async () => { for (const file of names) got.set(file, await helperFileOps(h.artifactsOf, file, fg)); })().catch(() => { });
  let timer = null;
  const late = await Promise.race([done.then(() => false), new Promise((r) => { timer = setTimeout(() => r(true), HELPER_PREFETCH_MS); })]);
  clearTimeout(timer); fg.on = false;
  const now = late ? new Map(got) : got, left = names.length - now.size;
  if (left) {
    _helperStats.left += left;
    deps.log.log?.(`[artifacts] ${session.claudeSessionId || session.backendSessionId || '?'}: the history opened before ${left} of ${names.length} helper transcripts were read (${HELPER_PREFETCH_MS} ms) — the rows the conversation kept stand; the next open folds them (they are read on)`);
  }
  return { files, ops: now, left, done };
}
/** THE REBUILD'S FOLD (sync): the ops a record that ENDS a helper brings — from `read` (helperPrefetch's), never from the disk. */
function helperOps(session, record, state = { runs: new Map(), seen: new Set() }, read = null) {
  const out = [], named = read && read.files && record && typeof record === 'object' && read.files.get(record);
  for (const { file, via } of named || helperFilesOf(session, record, state)) for (const o of helperTagged(session, read && read.ops && read.ops.get(file), via, state)) out.push(o);
  return out;
}

// ── THE HAND-OVER (lane artifacts-handover) — a helper CONVERSATION's own rows → its upstream conversation ──
/** `from` = {cid, name, session} (the helper's live session holds its rows); `to` = [cid]; `items` = paths / page links;
 *  `reach(cid)` → boolean = the message's reach (msg-acl, the groups engine) — REQUIRED, never assumed.
 *  Every refusal names the item: ≤ MAX_HANDOVER items; the item must be the helper's OWN row; the receiver must be
 *  reachable and live here, on the row's machine. A design re-registers under the receiver (the Design window's home
 *  lists it "via <helper>") and opens on the receiver's screen. No turn is started here (the message's notify decides). */
function handover({ from = {}, to = [], items = [], reach = null, at = Date.now() } = {}) {
  const list = (Array.isArray(items) ? items : []).map((x) => String(x || '').trim()).filter(Boolean);
  if (!list.length) return { ok: false, code: 'bad-request', error: 'name what to hand over: --artifact <path>' };
  if (list.length > AF.MAX_HANDOVER) return { ok: false, code: 'too-many', error: `${list.length} items — at most ${AF.MAX_HANDOVER} per hand-over` };
  if (typeof reach !== 'function') return { ok: false, code: 'no-reach', error: 'hand-over needs the message reach check' };
  const helper = from.session;
  if (!helper || !from.cid) return { ok: false, code: 'bad-member', error: 'the helper has no live session here' };
  const fromRef = { cid: String(from.cid), name: String(from.name || helper.name || '') };
  const handed = [], refused = [];
  const rows = [];
  for (const it of list) {
    const row = AF.rowFor(helper._artifacts || {}, it, helper.host || '');
    if (!row) { refused.push({ item: it, why: 'not-yours', error: `${it} is not an artifact of this conversation (only a file it wrote, a design it opened or a page it published can be handed over)` }); continue; }
    rows.push({ it, row });
  }
  const receivers = [];
  for (const cid of [...new Set((Array.isArray(to) ? to : [to]).map(String).filter(Boolean))]) {
    if (cid === fromRef.cid) continue;
    if (!reach(cid)) { refused.push({ to: cid, why: 'unreachable', error: `${cid} is not reachable from this conversation (the message rules: vibespace-msg list)` }); continue; }
    const live = [...sessions()].filter(([, s]) => s && conversationOf(s) === cid);
    if (!live.length) { refused.push({ to: cid, why: 'not-live', error: `${cid} has no live session on this server` }); continue; }
    receivers.push({ cid, live });
  }
  for (const { cid, live } of receivers) {
    for (const { it, row } of rows) {
      const [sid, s] = live[0];
      if ((row.host || '') !== (s.host && s.host !== 'local' ? s.host : '')) { refused.push({ item: it, to: cid, why: 'other-machine', error: `${it} is on ${row.host || 'this server'}; ${cid} runs on ${s.host || 'this server'}` }); continue; }
      if (row.kind === 'design') { const de0 = deps.designs && deps.designs(); const hw = de0 && typeof de0.heldWords === 'function' ? de0.heldWords() : null; if (hw) { refused.push({ item: it, to: cid, why: 'designs-unread', error: `${it}: ${hw}` }); continue; } }   // r3193: never marked handed over a refused register
      const op = AF.handoverOp(row, { from: fromRef, at });
      for (const [, rs] of live) noteOp(rs, op);
      if (row.kind === 'design') { // the Design window's registry: the receiver's now; its window opens for the user
        try {
          const de = deps.designs && deps.designs();
          const r = de && typeof de.register === 'function' ? de.register({ host: row.host || null, dir: row.path, sessionId: sid, conversationId: cid, via: fromRef }) : null;
          if (r && r.ok && typeof de.openOn === 'function') de.openOn(s, sid, r.design);
        } catch (e) { deps.log.warn?.(`[artifacts] design hand-over not registered: ${e.message}`); }
      }
      const marked = AF.markHanded(helper._artifacts || {}, row.key, { cid, name: s.name || '', at });
      if (marked) { helper._artifacts = marked; persistSoon(helper); try { normalizers().feedArtifactCard(helper, AF.cardBlock(marked[row.key])); } catch { } }
      handed.push({ item: it, to: cid, toName: s.name || '', kind: row.kind, path: row.path });
    }
  }
  return { ok: handed.length > 0, handed, refused, ...(handed.length ? {} : { code: 'nothing-handed', error: (refused[0] && refused[0].error) || 'nothing handed over' }) };
}

// ── WHAT AN ASK SHOWS (lane foryou-attachments, owner 2026-10-09 21:42Z, binding: "artifact attachment 必须要在 agent 提交的时候
// 检查 validity，确保用户收到的时候可以打开，不然就提醒 agent 重发") ──
const ASK_MANIFEST = 'design.json'; // src/design-model.js MANIFEST_FILE — a design folder is one that holds it
// row B-422c, second half (主开发 r3499 / r3507; lane mask-value-shape): a refusal BY THE READER (SafeFs's worker restarting after a
// deadline — no-worker / no-idle-worker —, or its own deadline) is no fact about the attachment: «not checked now — run vibespace-ask
// again», never «a folder without design.json» or «check the path». The agent's words: English, untranslated.
// line 834's round (主开发 r3771): SafeFs's one-try refusal (`path-trying`: the first press on that path has not answered) is the reader's too
const readerDown = (e) => !!e && (e.code === 'no-worker' || e.code === 'no-idle-worker' || e.code === 'path-trying' || e.noWorker === true || e.safeFsTimeout === true || e.code === 'timeout');
const NOT_CHECKED = (e) => (e && (e.safeFsTimeout === true || e.code === 'timeout' || e.code === 'path-trying') && e.noWorker !== true ? 'its storage did not answer in time' : 'its reader is restarting');
const errWhy = (e) => { const s = String((e && (e.code || '')) + ' ' + ((e && e.message) || '')); if (readerDown(e)) return 'try-again'; return /EACCES|EPERM|permission denied/i.test(s) ? 'unreadable' : /ENOENT|ENOTDIR|no such file|not found/i.test(s) ? 'missing' : 'unopenable'; };
/** THE SUBMIT JUDGE: every --artifact must OPEN for the owner — a file exists and is readable on the ASKING conversation's
 *  host (a remote host through RemoteFs `info`, never a local stat of a remote path; locally the SafeFs door: `stat`, then a
 *  one-byte `readChunk` = R_OK; a link whose target is gone fails the stat), a folder only as a design (its design.json
 *  readable), a /p/<id> registered on this server AND published. `items` = absolute paths / page links (the CLI made them
 *  absolute against its shell's cwd); `fsCall(op, payload)` = the SafeFs call; `remote` = the RemoteFs.
 *  → {artifacts: [{kind, host, path|page, name, url?}], bad: [{item, why, error}]} — ANY bad ⇒ the route files NOTHING. */
async function judgeAsk({ session = null, items = [], fsCall = null, remote = null } = {}) {
  const host = session && session.host && session.host !== 'local' ? String(session.host) : '';
  const cwd = (session && session.cwd) || '';
  const artifacts = [], bad = [];
  const where = host ? `on ${host}` : 'on this machine';
  const probe = async (p) => {
    if (host) {
      if (!remote || typeof remote.info !== 'function') throw Object.assign(new Error(`${host} cannot be reached for files`), { code: 'no-remote' });
      const i = await remote.info(host, p);
      return { dir: !!(i && i.isDirectory) };
    }
    const st = await fsCall('stat', { path: p });
    if (!st || !st.isDirectory) await fsCall('readChunk', { path: p, offset: 0, length: 1 }); // R_OK: an unreadable file throws EACCES here
    return { dir: !!(st && st.isDirectory) };
  };
  for (const raw of items) {
    const item = String(raw || '').trim();
    const pm = /^\/p\/([\w-]+)\/?$/.exec(item);
    if (pm) {
      const store = deps.pages && deps.pages();
      let hit = null;
      try { hit = store && typeof store.byId === 'function' ? store.byId(pm[1]) : null; } catch { hit = null; }
      if (hit && hit.held) { bad.push({ item, why: 'pages-unread', error: `${item}: ${hit.held}` }); continue; }   // r3005: the pages list is held — never «no such page»
      if (!hit) { bad.push({ item, why: 'no-page', error: `${item}: no such page on this server — publish the file first (vibespace-page publish <file>) and attach the /p/<id> it prints` }); continue; }
      if (!hit.page) { bad.push({ item, why: 'unpublished', error: `${item}: not published (it was taken down) — publish it again first (vibespace-page publish <file>)` }); continue; }
      artifacts.push({ kind: 'page', host: '', page: pm[1], name: String(hit.page.name || pm[1]).slice(0, 200), url: '/p/' + pm[1] });
      continue;
    }
    const p = AF.absPath(item, cwd).replace(/\/+$/, '') || item;
    if (!p.startsWith('/')) { bad.push({ item, why: 'not-absolute', error: `${item}: not a path this server can open — pass a path (absolute, or relative to your shell's cwd) or a /p/<id> page link` }); continue; }
    let r;
    try { r = await probe(p); } catch (e) {
      const why = errWhy(e);
      bad.push({ item, why, error: why === 'try-again' ? `${item}: not checked now (${NOT_CHECKED(e)}) — run vibespace-ask again in a moment`
        : why === 'missing' ? `${item}: no such file ${where} — check the path (absolute against your shell's cwd); a link whose target is gone counts as missing`
        : why === 'unreadable' ? `${item}: not readable ${where} (permission denied) — make it readable (chmod a+r) or attach a readable copy`
        : `${item}: cannot be opened ${where} (${String((e && e.message) || e).slice(0, 160)}) — check the path and run vibespace-ask again` });
      continue;
    }
    if (r.dir) {
      try { const m = await probe(p + '/' + ASK_MANIFEST); if (m.dir) throw Object.assign(new Error('a folder'), { code: 'ENOENT' }); }
      catch (e) {   // B-422c: the manifest's refusal is judged by its code — only a manifest truly missing is «a folder without design.json»
        const why = errWhy(e);
        bad.push(why === 'try-again' ? { item, why, error: `${item}: not checked now (${NOT_CHECKED(e)}) — run vibespace-ask again in a moment` }
          : why === 'unreadable' ? { item, why, error: `${item}: its ${ASK_MANIFEST} is not readable ${where} (permission denied) — make it readable, or attach a file in it` }
          : why === 'missing' ? { item, why: 'folder', error: `${item}: a folder without ${ASK_MANIFEST} — attach a file in it, or a design folder (vibespace-design new|open makes one)` }
          : { item, why, error: `${item}: its ${ASK_MANIFEST} cannot be opened ${where} (${String((e && e.message) || e).slice(0, 160)}) — run vibespace-ask again` });
        continue;
      }
      artifacts.push({ kind: 'design', host, path: p, name: AF.baseName(p) });
    } else artifacts.push({ kind: 'file', host, path: p, name: AF.baseName(p) });
  }
  return { artifacts, bad };
}
/** A filed ask → the asking conversation's rows (ONE `present` op each through noteOp — the one writer): its attachments,
 *  and (lane artifacts-by-intent r4) every /p/ link in its words (`said` = the ask's text + its WHOLE detail) — the agent
 *  putting a page in front of the person, «for you» from the ask on (the tray answer's quote of it is the agent's too). */
function presentAsk(session, artifacts, { id = '', at = Date.now(), said = [] } = {}) {
  if (!session) return 0;
  let n = 0;
  for (const op of AF.askOps({ artifacts, id, at, said })) {
    try { if (!noteOp(session, op).skipped) n++; } catch (e) { deps.log.warn?.(`[artifacts] ask attachment not shown: ${e.message}`); }
  }
  return n;
}

// ── THE REGISTRIES (lane artifacts-registries) ──
/** A published page's notification (onPublished: publish / re-publish / flags / unpublish) → its conversation's row; every
 *  OTHER conversation that shows its link hears `artifacts-changed` (its presented row re-resolves: a new name, gone). */
function notePage(page, extra = {}) {
  if (page && page.id) for (const [, s] of sessions()) if (s && s._artifacts && s._artifacts[AF.keyOf('', '/p/' + page.id)]) tellChanged(s);
  const session = page && page.sessionId ? sessions().get(page.sessionId) : null;
  const op = session ? AF.pageOp(page, { removed: !!(extra && extra.removed) }) : null;
  return op ? noteOp(session, op) : null;
}
/** A design's registry write (designs.json: registration / open / rename) → its conversation's row; a removal leaves it. */
function noteDesign(design, extra = {}) {
  const session = design && design.sessionId && !(extra && extra.removed) ? sessions().get(design.sessionId) : null;
  const op = session ? AF.designOp(design) : null;
  return op ? noteOp(session, op) : null;
}
/** The composer's upload (the route's result rows) → one `upload` row by: user per file. */
function noteUploads({ sessionId, host = '', files = [] } = {}) {
  const session = sessionId ? sessions().get(String(sessionId)) : null;
  if (!session) return 0;
  let n = 0;
  for (const f of files || []) { const op = AF.uploadOp(f, { host: host || session.host || '' }); if (op && !noteOp(session, op).skipped) n++; }
  return n;
}
/** The rebuild's third input (normalizers' store-rows seam): this conversation's pages + designs, from their stores, and
 *  (r6) its asks from the For-you store. */
function storeRowsOf(session, sessionId) {
  const id = sessionId || (session && session.sockName);
  if (!id) return {};
  const ask = (store) => { try { const s = store && store(); return s && typeof s.list === 'function' ? s.list({ sessionId: id }) || [] : []; } catch { return []; } };
  return AF.storeRows({ pages: ask(deps.pages), designs: ask(deps.designs), asks: asksOf(session, id) });
}
/** THE ASK STORE'S ONE READ (r6): every ask this conversation filed the For-you store keeps — open or answered. r7: WHOSE
 *  ask it is, the ask route answers (`deps.asks` = src/agent-routes/status.js asksOf over the store — the route's key, a
 *  pending fork's placeholder, the route's own items only); a hub that has not wired it reads as none. */
function asksOf(session, id) {
  try { const out = deps.asks && deps.asks(session, id); return Array.isArray(out) ? out : []; } catch { return []; }
}
/** WHOSE ITEM A TRAY ANSWER QUOTES (r10): `(itemId) → is it one of this conversation's asks` — asksOf's items, read once,
 *  only when a quote asks (the live consumer per record; the rebuild's derivation through normalizers' quote seam). */
function askIdOf(session, id) {
  let ids = null;
  return (itemId) => (ids || (ids = new Set(asksOf(session, id).map((it) => String((it && it.id) || ''))))).has(String(itemId));
}

// ── THE SERVICES (lane artifacts-services) — the jobs door: a job this conversation OWNS that listens on a port ──
const conversationOf = (session) => { try { return require('../claude-lock-capture.js').addressableId(session); } catch { return null; } };
const instanceBase = () => { try { return (deps.instanceUrl && deps.instanceUrl.url && deps.instanceUrl.url()) || ''; } catch { return ''; } };
const jobsList = () => { try { const jm = deps.jobs && deps.jobs(); return jm && jm.jobs ? [...jm.jobs.values()] : []; } catch { return []; } };
/** lane artifacts-services-url: the Ports panel's forward records (src/port-forward.js list()) — a row's link ladder reads them */
const forwardsList = () => { try { const pf = deps.ports && deps.ports(); return pf && typeof pf.list === 'function' ? pf.list() : []; } catch { return []; } };
// a service row's NAME is the engine's ONE accessor's (lane job-notify-user r5) — never the record's
const jobsLabel = () => { let jm = null; try { jm = deps.jobs && deps.jobs(); } catch { jm = null; } return require('../job-model.js').labelVia(jm); };
const linkFacts = () => ({ now: Date.now(), base: instanceBase(), forwards: forwardsList(), labelOf: jobsLabel() });
/** A conversation's service rows, DERIVED from the jobs engine at every read (AF.serviceRows: the lineage rule, the 24 h
 *  stopped window) — never folded into `session._artifacts`, never persisted. */
function servicesOf(session) {
  const cid = conversationOf(session);
  return cid ? AF.serviceRows(jobsList(), { cid, ...linkFacts() }) : {};
}
/** THE JOBS DOOR (src/jobs.js `_serviceDoor` via jobs-wiring's `onService`): a job's service facts moved (first listen,
 *  a moved port, stopped, up again) ⇒ its owner conversation's card is born at the first listen, then patched in place. */
function noteService(job) {
  const cid = AF.jobOwnerCid(job);
  const row = cid ? AF.serviceRow(job, linkFacts()) : null;
  if (!row) return 0;
  let n = 0;
  for (const [, s] of sessions()) {
    if (!s || conversationOf(s) !== cid) continue;
    try { if (normalizers().feedArtifactCard(s, AF.cardBlock(row))) n++; } catch (e) { deps.log.warn?.(`[artifacts] service card not fed: ${e.message}`); }
  }
  return n;
}
/** THE PORTS DOOR (lane artifacts-services-url): the PortForwardManager's `port-forwards-updated` broadcast (server.js hands
 *  every broadcast here — no timer of our own) ⇒ each live service card is re-fed with its link; publish / unpublish / a
 *  moved forward patches the card IN PLACE (an unchanged block is no edit — normalizers' patch compares). */
function noteForwards(msg) {
  if (!msg || msg.type !== 'port-forwards-updated') return 0;
  if (msg.held) return 0;   // r3228: port-forwards.json held — an UNREAD list says nothing of a link: the live cards keep the one they have
  const facts = { ...linkFacts(), forwards: Array.isArray(msg.forwards) ? msg.forwards : forwardsList() };
  const byCid = new Map();
  for (const j of jobsList()) {
    const cid = j && j.listen ? AF.jobOwnerCid(j) : null;
    const row = cid ? AF.serviceRow(j, facts) : null;
    if (row) (byCid.get(cid) || byCid.set(cid, []).get(cid)).push(row);
  }
  let n = 0;
  if (!byCid.size) return n;
  for (const [, s] of sessions()) {
    const rows = s && byCid.get(conversationOf(s));
    for (const row of rows || []) { // patch only (a card is born at the first listen — noteService — or by a rebuild); a running rebuild queues it
      const b = AF.cardBlock(row);
      try { if (s._rebuildQueue ? normalizers().feedArtifactCard(s, b) : normalizers().patchArtifactCard(s._normalizer, b)) n++; } catch (e) { deps.log.warn?.(`[artifacts] service card not re-fed: ${e.message}`); }
    }
  }
  return n;
}

function registries() {
  const out = [];
  for (const [sessionId, s] of sessions()) if (s && s._artifacts) out.push({ sessionId, rows: s._artifacts });
  return out;
}
/** THE CONTRACT (doc-window): the conversation `prefer` names (the window's own `from`) when its registry holds {host, path},
 *  else the newest conversation whose registry holds it (B-b0e3). */
function ownerOf({ host, path, prefer = null } = {}) { return AF.ownerOfIn(registries(), { host, path, prefer }); }
/** Every live conversation whose registry holds {host, path} → [sessionId] (the doc engine remembers them — B-b0e3's remainder). */
function holdersOf({ host, path } = {}) { return AF.holdersIn(registries(), { host, path }); }
/** THE CONTRACT (doc-window): ONE next-turn note to the conversation through the stash — free, never a billed wake. */
function noteEdit({ sessionId, conversationId = null, host, path, summary } = {}) {
  require('./search-index.js').noteArtifact({ sessionId, host, path }); // lane global-search: the saved file is re-read into the index
  const session = sessions().get(sessionId);
  // a STOPPED owner (lane doc-comments-stopped-owner): no live session, but the conversation the doc engine remembers — the note waits in its stash
  if ((!session && !conversationId) || !deps.deliver || typeof deps.deliver.stashFor !== 'function') return false;
  let cid = null;
  try { cid = session ? require('../claude-lock-capture.js').addressableId(session) : null; } catch { cid = null; }
  cid = cid || (conversationId ? String(conversationId) : null);
  if (!cid) return false;
  const st = deps.deliver.stashFor(cid, { source: 'doc-edit', kind: 'peer', fromName: DOC_EDIT_FROM, ref: 'artifact:' + AF.keyOf(host, path), text: agentText(AF.editNoteText({ path, summary }), { kind: 'block', max: 1200 }) }); // the Doc window's summary names the FILE's section headings ⇒ the belt
  return !(st && st.stored === false && st.queued === false);
}
/** The user's own save (ws `artifact-touch`): the row gets by:user edits+1, the card is patched, the agent hears it. */
function touch({ sessionId, host, path, summary } = {}) {
  const session = sessions().get(sessionId);
  if (!session || typeof path !== 'string' || !path.startsWith('/')) return { ok: false, error: 'no-session-or-path' };
  const r = noteOp(session, { host, path, op: 'edit', by: 'user' });
  if (r.skipped) return { ok: false, error: r.skipped };
  return { ok: true, noted: noteEdit({ sessionId, host, path, summary }), row: r.row };
}

/** lane pages-chip-groups: the conversation's clients re-read the list (the chat view's GET /api/artifacts) — no payload. */
function tellChanged(session) {
  if (!session || !session.sockName || typeof deps.toSession !== 'function') return;
  try { deps.toSession(session, session.sockName, { type: 'artifacts-changed', sessionId: session.sockName }); } catch (e) { deps.log.warn?.(`[artifacts] artifacts-changed not sent: ${e.message}`); }
}
/** The presented page rows of `s`, resolved against the pages store NOW (AF.resolvePresented): this conversation's own
 *  page (its session id or conversation id) drops out; the publisher's name = its live session's. */
function presentedResolved(s, sessionId, rows) {
  const store = (() => { try { return deps.pages && deps.pages(); } catch { return null; } })();
  if (store && typeof store.heldWords === 'function' && store.heldWords()) return { ...(rows || {}) };   // r3005: the pages list is held — every presented row keeps what it last knew (never «Unpublished» on an unread list)
  const cid = conversationOf(s);
  const live = [...sessions()];
  const nameOf = (p) => { const hit = (p.sessionId && sessions().get(p.sessionId)) || (p.conversationId && (live.find(([, x]) => x && conversationOf(x) === p.conversationId) || [])[1]); return (hit && hit.name) || ''; };
  return AF.resolvePresented(rows, { pageOf: (id) => (store && typeof store.byId === 'function' ? store.byId(id) : null), own: (p) => (p.sessionId && p.sessionId === sessionId) || (!!cid && p.conversationId === cid), base: instanceBase(), nameOf });
}
/** The Artifacts chip's list (the chat status bar asks on attach and after each card op): `view(rows)` as blocks. */
function listFor(sessionId) {
  const s = sessions().get(String(sessionId || ''));
  const v = AF.view({ ...(s ? presentedResolved(s, String(sessionId), s._artifacts || {}) : {}), ...(s ? servicesOf(s) : {}) }); // + the derived service rows; the presented pages resolved (lane pages-chip-groups)
  const host = s && s.host && s.host !== 'local' ? String(s.host) : '';
  return { ok: true, items: v.items.map(AF.cardBlock), code: v.code.map(AF.cardBlock), count: v.count, codeCount: v.codeCount, full: v.full,
    cwd: String((s && s.cwd) || ''), host, hostNames: hostNamesOf([host, ...v.items.map((r) => r.host), ...v.code.map((r) => r.host)]) }; // lane artifacts-by-intent: the folder a row names is read against the conversation's cwd
}
/** id → the machine's name as the host pickers show it (deps.hosts = server.js's HostManager — its record's `name`; an
 *  id it no longer knows: none), for the machines a view names (lane artifacts-by-intent r4: a folder on another
 *  machine says «gpu1:», never its id; r5: the hosts registry itself is the dep — test-artifacts pins the wiring). */
function hostNamesOf(ids) {
  const out = {};
  const hosts = (() => { try { return deps.hosts && deps.hosts(); } catch { return null; } })();
  if (!hosts || typeof hosts.get !== 'function') return out;
  for (const id of new Set(ids.map((x) => String(x || '')).filter((x) => x && x !== 'local'))) { let n = ''; try { n = String((hosts.get(id) || {}).name || ''); } catch { n = ''; } if (n) out[id] = n; }
  return out;
}
function mount(app) { app.get('/api/artifacts', (req, res) => res.json(listFor(req.query && req.query.sessionId))); return api; }

const api = { configure, mount, listFor, observe, helperOps, helperPrefetch, helperSettled, helperReadStats, _setHelperPrefetchMsForTest, _setHelperClockForTest, _pacerForTest: pacer, _helperShareForTest: () => ({ fgLive: _fgLive, fgOpen: _fgOpen, bgBudget: bgBudget() }), handover, judgeAsk, presentAsk, ownerOf, holdersOf, noteEdit, touch, notePage, noteDesign, noteUploads, storeRowsOf, servicesOf, noteService, noteForwards, DOC_EDIT_FROM };
module.exports = api;
