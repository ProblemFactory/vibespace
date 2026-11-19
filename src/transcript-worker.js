/**
 * transcript-worker.js — heavy JSONL transcript work OFF the main thread
 * (2.235.0, the userL "slow server read as mass session death" follow-up:
 * the event-loop spikes that degraded the whole instance were single-threaded
 * transcript work — 32MB tail parses on every attach/history load, GB-scale
 * line-index builds, full-file turn scans. CPU was never the bottleneck; the
 * ONE loop thread was).
 *
 * Same architecture as safe-fs.js: a worker executes the EXISTING sync
 * implementations (zero logic duplication — this file, run as a worker,
 * simply requires the adapter/session-store modules; their module-level
 * mtime+size caches live in the worker where the work happens), the main
 * thread awaits a compact reply. Ops return either small objects (gapInfo,
 * turns) or parsed record arrays (structured-clone deserialize on main is
 * several times cheaper than the file read + string build + JSON.parse it
 * replaces). If the pool is down, callers fall back to the sync inline path —
 * behavior identical, just without the isolation.
 */

'use strict';

const { parentPort, isMainThread } = require('worker_threads');
let _shipped = null; // B-299b A2: does this checkout ship the transcript worker's script (the device bundle does not)
const SHIPPED = () => (_shipped == null ? (_shipped = require('fs').existsSync(require('path').join(__dirname, 'transcript-worker.js'))) : _shipped);

// The existing sync implementations — required lazily inside runOp so that
// loading THIS module from the main thread (for the inline fallback + pool
// construction) doesn't create a require cycle with adapters/codex.js.
function _codex() { return require('./adapters/codex'); }

// lane resume-all-paced (L2): ONE tail kept for its pages (boundedParsedPage — always this worker: the `history` lane, safe-fs.js)
// — a snapshot named by a token, dropped at its last page or 30 s after its last ask (an abandoned read never stays). L3: the
// snapshot holds the tail's LINES, never its parsed records — each page parses its own lines (measured on a 32 MB tail: the lines
// 35 MB with the string, the records 71 MB — their strings keep slices of it; one worker after four tails: heap 82 MB, not 155).
let _pageSnap = null;
// B-f3f9: the merged history of ONE conversation, kept for its pages (codexHistoryMergedPage) — its own snapshot beside the lines'
let _mergedSnap = null;
function _dropMergedSnapLater(snap) { clearTimeout(snap.timer); snap.timer = setTimeout(() => { if (_mergedSnap === snap) _mergedSnap = null; }, 30000); if (snap.timer.unref) snap.timer.unref(); }
function _dropPageSnapLater(snap) { clearTimeout(snap.timer); snap.timer = setTimeout(() => { if (_pageSnap === snap) _pageSnap = null; }, 30000); if (snap.timer.unref) snap.timer.unref(); }

/** one line of a bounded tail → its record, or undefined (blank, unparsable, or a subagent's record when `dropSub`) — boundedParsed's
 *  rule, shared by its pages (JSON.parse never answers undefined; a line `null` is a record unless `dropSub`, as it always was) */
function parseTailLine(line, dropSub) {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return undefined; }
  // EXACT parity with session-store isSubagentMessage — a superset
  // here would drop records the sync fallback keeps (cache divergence)
  if (dropSub && (msg === null || msg.parent_tool_use_id || msg.isSidechain)) return undefined;
  return msg;
}

function runOp(op, payload = {}) {
  switch (op) {
    case 'boundedParsedPage': {
      // a big tail's records handed back in PAGES (lane resume-all-paced, L2 — measured: ONE structured clone of 68 000 records was
      // ~100 ms of the MAIN loop at its deserialize): page 0 reads the bounded tail and names the snapshot (its lines); every page
      // parses ITS lines from that snapshot (the file may grow meanwhile — the attach reads one instant, as the sync path does).
      // `start`/`count`/`total`/`next` count LINES; a page ends at `count` lines or `maxBytes` of their text, whichever first (at
      // least one line), and says where the next begins (`next`); a blank or unparsable line yields no record (parseTailLine).
      // THE HEAP BOUND (L3 cure): `capMb` — this worker checks its own heap after the tail's read and after each page, and refuses
      // past it by name (`heap_bound`), the snapshot dropped; a parent --max-old-space-size replaces the worker's resourceLimits,
      // this check binds under every start of the hub (usage-cold-worker.js's rule)
      const capBytes = (Number(payload.capMb) || 0) * 1048576;
      const overCap = (where) => {
        if (!capBytes) return;
        const used = require('v8').getHeapStatistics().used_heap_size;
        if (used <= capBytes) return;
        if (_pageSnap) { clearTimeout(_pageSnap.timer); _pageSnap = null; }
        throw Object.assign(new Error(`this history needs more memory than the history worker's ${payload.capMb} MB bound (${Math.round(used / 1048576)} MB ${where})`), { code: 'heap_bound' });
      };
      let snap = _pageSnap;
      if (!payload.token) {
        const content = _codex().readJsonlBounded(payload.fp, { tailOnly: payload.tailOnly !== false });
        snap = _pageSnap = { token: `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`, fp: payload.fp, lines: content.split('\n'), timer: null };
        overCap('after the tail was read');
      } else if (!snap || snap.token !== payload.token) {
        return { result: { gone: true } };
      }
      const start = Math.max(0, payload.start | 0), count = Math.max(1, payload.count | 0), total = snap.lines.length;
      const maxBytes = Math.max(0, Number(payload.maxBytes) || 0);
      const records = [];
      let i = start, bytes = 0;
      for (; i < Math.min(total, start + count); i++) {
        if (maxBytes && i > start && bytes >= maxBytes) break;
        const line = snap.lines[i]; bytes += line.length;
        const msg = parseTailLine(line, !!payload.dropSubagent); if (msg !== undefined) records.push(msg);
      }
      overCap('after a page');
      if (i >= total) { clearTimeout(snap.timer); if (_pageSnap === snap) _pageSnap = null; } else _dropPageSnapLater(snap);
      return { result: { token: snap.token, total, next: i, records } };
    }
    case 'codexHistoryMergedPage': {
      // B-f3f9 (the codex attach's merge off the main thread — card-door-in-chat's storm measure: with the parse in this worker, the
      // records still crossed and the merges ran on the main thread, so the hub's peak memory before a collection grew with its heap
      // limit). Three kinds of call on ONE snapshot (_mergedSnap, dropped at the last page or 30 s after the last ask):
      //  · THE HISTORY (no token): codex-session-store's _ensureParsed steps HERE — each file of the fork ancestry, then the thread's
      //    own (every one: no cap), read (the bounded tail), parsed (parseTailLine), cut at its fork ordinal, tagged with its thread and
      //    merged in order. A file a compressed read refuses for good (EZSTBIG / EZSTUNSUPPORTED) reads as nothing, as both old roads
      //    end it; any other failure throws (the caller reads the old road). → { token, historyCount }
      //  · THE LIVE BUFFER (token + `liveBuffer`, the first page): merged LAST, the buffer the caller read AFTER the history was
      //    merged (as late as the old road read it); then pages.
      //  · A PAGE (token, start, count): a slice of the FINAL records — ≤ `count` records and ≤ `maxBytes` of their JSON (at least
      //    one) — and per record the thread it came from (the tag is non-enumerable: a structured clone drops it — `tids` + `tix`).
      // THE HEAP BOUND (`capMb`): after each file, the history, the merge and each page — refused by name (`heap_bound`), dropped.
      const S = require('./codex-session-store');
      const capBytes = (Number(payload.capMb) || 0) * 1048576;
      const overCap = (where) => {
        if (!capBytes) return;
        const used = require('v8').getHeapStatistics().used_heap_size;
        if (used <= capBytes) return;
        if (_mergedSnap) { clearTimeout(_mergedSnap.timer); _mergedSnap = null; }
        throw Object.assign(new Error(`this history needs more memory than the history worker's ${payload.capMb} MB bound (${Math.round(used / 1048576)} MB ${where})`), { code: 'heap_bound' });
      };
      if (!payload.token) {
        if (_mergedSnap) { clearTimeout(_mergedSnap.timer); _mergedSnap = null; }   // one conversation at a time: an older read's pages are gone
        let history = [];
        for (const f of Array.isArray(payload.files) ? payload.files : []) {
          let content = '';
          try { content = _codex().readJsonlBounded(f.fp, { tailOnly: true }); }
          catch (e) { if (e && (e.code === 'EZSTBIG' || e.code === 'EZSTUNSUPPORTED')) continue; throw e; }
          const recs = [];
          for (const line of content.split('\n')) { const msg = parseTailLine(line, false); if (msg !== undefined) recs.push(msg); }
          content = null;
          const one = S.tagRecordThread(S.cutRecordsAtOrdinal(recs, f.untilOrdinal), f.threadId || null);
          if (one.length) history = S.mergeCodexRecords(history, one);
          overCap('after a file');
        }
        const snap = _mergedSnap = { token: `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`, history, records: null, timer: null };
        _dropMergedSnapLater(snap);
        overCap('after the history');
        return { result: { token: snap.token, historyCount: history.length } };
      }
      const snap = _mergedSnap;
      if (!snap || snap.token !== payload.token) return { result: { gone: true } };
      if (!snap.records) {
        if (typeof payload.liveBuffer !== 'string') return { result: { gone: true } };   // a page before the live merge: never answered from half a read
        snap.records = S.mergeCodexRecords(snap.history, S.parseBufferRecords(payload.liveBuffer));
        snap.history = null;
        overCap('after the merge');
      }
      const start = Math.max(0, payload.start | 0), count = Math.max(1, payload.count | 0), total = snap.records.length;
      const maxBytes = Math.max(0, Number(payload.maxBytes) || 0);
      const records = [], tids = [], tix = [];
      let i = start, bytes = 0;
      for (; i < Math.min(total, start + count); i++) {
        if (maxBytes && i > start && bytes >= maxBytes) break;
        const r = snap.records[i];
        if (maxBytes) { try { bytes += JSON.stringify(r).length; } catch { bytes += 1; } }
        records.push(r);
        const t = S.recordThreadOf(r);
        if (!t) { tix.push(-1); continue; }
        let k = tids.indexOf(t); if (k < 0) { k = tids.length; tids.push(t); }
        tix.push(k);
      }
      overCap('after a page');
      if (i >= total) { clearTimeout(snap.timer); if (_mergedSnap === snap) _mergedSnap = null; } else _dropMergedSnapLater(snap);
      return { result: { token: snap.token, total, next: i, records, tids, tix } };
    }
    case '__hold': {
      // TESTS ONLY (safe-fs-worker.js's __sleep, held by the test instead of a clock): this worker waits on payload.sab until the
      // test releases it (Atomics.notify) or payload.ms passes (≤ 30 s) — a PLACED stall, never a timing guess (test-codex-attach-off-loop ⑤ (d))
      Atomics.wait(new Int32Array(payload.sab), 0, 0, Math.min(Number(payload.ms) || 5000, 30000));
      return { result: true };
    }
    case 'gapInfo': {
      // Builds/extends the worker-side line index as a side effect.
      return { result: _codex().jsonlGapInfo(payload.fp) };
    }
    case 'lineRange': {
      return { result: _codex().readJsonlLineRange(payload.fp, payload.startLine, payload.endLine) };
    }
    case 'userTurns': {
      return { result: _codex().scanJsonlUserTurns(payload.fp, payload.backend, payload.sent || null) };
    }
    case 'boundedParsed': {
      // readJsonlBounded + line split + JSON.parse, all off-loop. Returns raw
      // parsed records; the caller applies its own filtering (session-store
      // filters subagent records) so the semantics stay in ONE place... except
      // filtering here would ship less across the thread boundary — the caller
      // passes dropSubagent to keep the wire payload minimal.
      const { readJsonlBounded } = _codex();
      const content = readJsonlBounded(payload.fp, { tailOnly: payload.tailOnly !== false });
      const records = [];
      const dropSub = !!payload.dropSubagent;
      for (const line of content.split('\n')) { const msg = parseTailLine(line, dropSub); if (msg !== undefined) records.push(msg); }
      return { result: records };
    }
    case 'jsonlTail': {
      // perf chunk C: the async warm's cold read — readJsonlTail's FULL path
      // (no previous entry here: the cache lives on the main thread), so the
      // entry that crosses back carries its byte span and the next change to
      // the file is folded in as an append on the main thread. Same function
      // as the sync reader — zero duplication.
      return { result: _codex().readJsonlTail(payload.fp, null, { dropSubagent: !!payload.dropSubagent }) };
    }
    case 'codexThreadMetas': {
      // S3 discovery hot path: the ~/.codex/sessions walk + per-rollout head
      // reads (dir-mtime + file-mtime cached) — the facts half of
      // listCodexThreads, run where the reads happen. Same function as the
      // inline fallback (codex-session-store requires adapters/codex — lazy
      // require for the same cycle reason as _codex()).
      return { result: require('./codex-session-store').collectCodexThreadMetas() };
    }
    case 'codexOpenThreads': {
      // the /proc (or lsof) open-rollout scan → thread ids (uncached here;
      // the main thread keeps the 10s cache). B-f64b: on the MAIN thread (the pool down, no worker alive — SafeFs runs the
      // op inline) it answers null = not known: never the whole process walk on the loop (locate's rule below)
      if (isMainThread) return { result: null };
      const { listOpenCodexRolloutPaths, codexThreadIdOf } = require('./discovery-facts');
      const { CODEX_SESSIONS_DIR } = _codex();
      const ids = new Set();
      for (const p of listOpenCodexRolloutPaths({ sessionsDir: CODEX_SESSIONS_DIR })) { const t = codexThreadIdOf(p); if (t) ids.add(t); }
      return { result: [...ids] };
    }
    case 'locate': {
      // lane layout-stopped-window r2: does a conversation have a transcript HERE — its harness descriptor's own
      // `store.locate(id, cwd)` (claude: the path rule, then the projects scan; codex: the rollout walk), run where a walk may
      // take its time (boot-restore's dead-socket retire asks it). On the main thread (the pool down) it answers null =
      // unknown: never a sync walk on the loop.
      // lane dead-socket-keeps-chat-meta: a null from locate is «no transcript» ONLY where the descriptor says its locate is
      // proof (`store.locateIsProof` — claude, codex: the conversation IS a file locate finds); agy's sqlite store and an ACP
      // agent's answer null for EVERY id (no file to locate) — that is «unknown», and the kept stopped meta stays (2.369.365
      // deleted the owner's kind of session — a local agy chat — once this answered `false` for it)
      if (isMainThread) return { result: null };
      const h = require('./harnesses').list().find((x) => x && x.id === payload.backend);
      if (!(h && h.store && typeof h.store.locate === 'function')) return { result: null };
      return { result: h.store.locate(payload.id, payload.cwd || '') ? true : h.store.locateIsProof === true ? false : null };
    }
    case 'picture': { // lane chat-attachments-persist (the cut): a picture read from the record it came in — its span in the file
      // (src/transcript-picture.js; this thread's index of the file is kept and EXTENDED, never rebuilt, while it only grows).
      // ASYNC (fs.promises): the inline fallback (SafeFs awaits it) never holds the hub's loop
      // the place's file through the harness's own locate (a walk may take its time HERE, never on the hub's loop)
      if (isMainThread) return { result: { unavailable: true } };
      const TP = require('./transcript-picture.js'), q = payload || {};
      const h = require('./harnesses').list().find((x) => x && x.id === q.backend);   // transcript-service named it (its norm)
      const locate = h && h.store && typeof h.store.locate === 'function' ? (id, cwd) => h.store.locate(id, cwd) : null;
      return TP.placeFile({ backend: q.backend, tx: q.tx, cwd: q.cwd, agent: q.agent }, { locate })
        .then((fp) => (fp ? TP.reader().find({ fp, backend: q.backend, key: q.key, n: q.n }).then((r) => ({ ...r, fp })) : { unknown: true }))
        .then((result) => ({ result }));
    }
    case 'pictureHeld': return { result: require('./transcript-picture.js').reader().held() };
    case 'taskLines': { // B-299b A2: a claude transcript's task-tool lines past a byte offset, parsed to their facts (session-store
      // taskLinesSince — the warm's task scan). On the main thread (the pool down) it answers null: never a read on the loop
      // …except where no such worker ships (the device agent's bundle — its read's MUST-2): the device reads its own transcript
      // in place, on its own loop, as the release did there (the hub's checkout always has this script)
      if (isMainThread && SHIPPED()) return { result: null };
      return { result: require('./session-store').taskLinesSince(payload.fp, payload.offset || 0) };
    }
    case '__sleep': { // test hook (deadline/restart path)
      const until = Date.now() + (payload.ms || 1000);
      while (Date.now() < until) { /* burn */ }
      return { result: true };
    }
    default:
      throw Object.assign(new Error('unknown transcript op: ' + op), { code: 'EBADOP' });
  }
}

if (!isMainThread && parentPort) {
  const { answerMemory } = require('./worker-memory.js');
  parentPort.on('message', (msg) => {
    if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js)
    const { id, op, payload } = msg || {};
    const fail = (e) => parentPort.postMessage({ id, ok: false, error: { message: e.message, code: e.code } });
    try {
      const out = runOp(op, payload);
      if (out && typeof out.then === 'function') out.then(({ result }) => parentPort.postMessage({ id, ok: true, result }), fail);   // an async op (picture)
      else parentPort.postMessage({ id, ok: true, result: out.result });
    } catch (e) { fail(e); }
  });
}

module.exports = { runOp };
