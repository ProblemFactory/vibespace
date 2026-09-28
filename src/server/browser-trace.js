'use strict';
/**
 * THE ACTION-TRACE RECORDER, THE PER-PROFILE SCREENCAST AND THE HOUSEKEEPING
 * — ORCH (agent browser P5, docs/design-agent-browser-v2.md §4.5 / §6.4 / §7.1
 * / §8 step 3, D7 / D8 / D35). Every decision is src/browser-trace.js's
 * (PURE); this module owns the files, the timers and the two seams it hangs on:
 *
 *   · THE BRIDGE'S TAPS (src/server/browser-stream.js `tap`): for every lease
 *     whose browser is live — and for every relay a live view opens, the
 *     ephemeral browser included — the recorder listens to the stream server's
 *     own `command` / `result` / `frame` / `url` records. A traced `command`
 *     snapshots the LAST frame held as the BEFORE picture; the matching
 *     `result` starts the after-clock (the first frame ≥ AFTER_SETTLE_MS later,
 *     else the latest by AFTER_MAX_MS) and, for a target action, ONE `get box
 *     <selector>` through the daemon (the only way the element's box is known;
 *     best effort, bounded, its own `boundingbox` command never traced). The
 *     entry is written as `<id>.json` + `<id>-before.jpg` + `<id>-after.jpg`
 *     under data/browser-trace/<profileId | ephemeral>/, appended to that
 *     scope's `index.ndjson`, pushed to the live view's viewers as a `trace`
 *     record and to every client as `browser-trace-appended` (no bytes).
 *     Setting `browser.actionTrace` (default ON, D35) gates the whole thing.
 *   · THE KEEPER'S LEASE SEAM (`onLease`): attach / browser-ready arm a tap
 *     (a tap NEVER starts a browser — only a live one is tapped; the bridge's
 *     `streamPortFor` then only asks the daemon for its port); detach /
 *     lease-dropped / browser-stopped disarm it. LANE H (2026-09-25): a
 *     conversation's managed EPHEMERAL browser is a holder like any lease — its
 *     `browser-ready` (and every `verb` on it while no tap holds it) arms a tap
 *     on THAT browser (`EPHEMERAL_REF`, never the session's default pane) with
 *     no viewer at all, scope `ephemeral`; the arming promise is RETURNED so the
 *     keeper holds the verb until the tap is connected (bounded) and the first
 *     command is on the record; a sub-agent's ephemeral (its pairs are not its
 *     session's) is not tapped in this release. The same seam starts and
 *     stops the per-profile SCREENCAST (`record start <file>` / `record stop`
 *     under the lease's own session, `record: true` profiles only, refused BY
 *     NAME below the 0.37.0 floor — D7's opt-in; frames of a logged-in profile
 *     are a secret with a storage bill).
 *
 * BROWSER SESSIONS (the owner, 2026-09-27): the same lease seam opens and
 * closes a SESSION per (conversation's browser key, trace scope) — a `start`
 * marker when the lease is granted / the browser is joined or launched, an
 * `end` marker when the lease is released (detach, lease dropped, a stop by a
 * person, a backend switch; an IDLE stop is not an end — src/browser-sessions.js
 * `stopEndsSession`) — appended to `data/browser-trace/<scope>/sessions.ndjson`;
 * every entry of the run carries the session id (`browserSession`), an action
 * with no open session opens one. A restart re-opens a session whose lease came
 * back, else writes its end with reason `restart`. `onSession(marker)` (the
 * wiring) puts the chat card into the live conversation; every marker is
 * broadcast `browser-sessions-updated`.
 * RETENTION BY SIZE ONLY: an hourly sweep (and one at boot) applies the PURE
 * `traceSizePlan` — over the per-scope limit (setting
 * `browser.traceBytesPerProfile`, default 1 GiB) the oldest sessions' FRAMES go
 * first, every action list stays (its entry is stamped `framesRemoved`) — and the
 * recordings their own 7 d / 200 MB bound (src/browser-recording-retention.js);
 * it logs what it removed and why. HOUSEKEEPING (§8 step 3, D8): sizes are measured with `du -sb` in a
 * child (never a sync walk on the loop — 98 GB live under ~/.agent-browser on
 * the design's machine), cached; orphans are directories carrying a Chromium
 * marker that no record names; `forget` RENAMES the directory beside itself
 * (`<dir>.forgotten-<ts>`) and files a ledger row BEFORE the record goes;
 * permanent deletion is `deleteForgotten`, its own route, a human's click.
 * Nothing here deletes a profile directory on a timer.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const T = require('../browser-trace.js');
const BS = require('../browser-sessions.js'); // 2026-09-27: browser SESSIONS (markers, pairing, the chat cards) — PURE
const RR = require('../browser-recording-retention.js'); // the video recordings keep their own 7 d / 200 MB bound
const INT = require('../browser-interrupt.js'); // the owner's ruling (2026-09-27): what was IN FLIGHT at a takeover is read off this recorder's ring
const B = require('../browser-profiles.js');
const S = require('../browser-stream.js');

const SWEEP_EVERY_MS = 60 * 60 * 1000;
const SIZE_CACHE_MS = 10 * 60 * 1000;
/** VERIFY r1 L1: a `verb` does not re-arm a tap whose arming FAILED within this long (a new browser always arms). */
const ARM_RETRY_MS = 30 * 1000;
const DU_TIMEOUT_MS = 120 * 1000;
const INDEX_FILE = 'index.ndjson';
const FILE_MODE = 0o600;

const namedError = (code, msg, extra = {}) => { const e = new Error(msg); e.code = code; Object.assign(e, extra); return e; };
function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: FILE_MODE });
  fs.renameSync(tmp, file);
}
const SCOPE_RE = /^(bp-[0-9a-f]{8}|ephemeral)$/;

function create({ dataDir, homeDir = os.homedir(), keeper = null, bridge = null, serverSetting = () => undefined, broadcast = null, log = console, now = Date.now,
  execFileImpl = execFile, sweepEveryMs = SWEEP_EVERY_MS, runtime = null,
  // 2026-09-27: every session marker, as it is written — the wiring puts the chat card into the live conversation
  onSession = null } = {}) {
  if (!dataDir) throw new Error('browser-trace: dataDir is required');
  const traceRoot = path.join(dataDir, T.TRACE_DIR);
  const recRoot = path.join(dataDir, T.RECORDING_DIR);
  const forgottenFile = path.join(dataDir, T.FORGOTTEN_FILE);
  const abBase = path.join(homeDir, '.agent-browser');
  const rt = () => runtime || (keeper && keeper._runtime) || null;
  const setting = (k, d) => { try { const v = serverSetting(k); return v === undefined || v === null || v === '' ? d : v; } catch { return d; } };
  const enabled = () => setting('browser.actionTrace', true) !== false && setting('browser.actionTrace', true) !== 'false';
  /** The per-scope record limit in bytes (setting MB → bytes, default 1 GiB, floor 64 MB). */
  const bytesLimit = () => T.traceBytesLimit(setting(T.TRACE_BYTES_SETTING, undefined));

  // ── state ──
  const taps = new Map();        // key → tap state
  const indexes = new Map();     // scope → entries[] (loaded lazily)
  const byId = new Map();        // entry id → { scope, entry }
  const recordings = new Map();  // `${profileId}|${browserKey}` → { profileId, browserKey, sessionId, file, since }
  const recStarting = new Map(); // lane live-input: the same key → the ONE start in flight (single flight)
  const recordingRefusals = new Map(); // profileId → { code, error, at }
  const sizeCache = new Map();   // dir → { bytes, at }
  let forgotten = null;
  let lastSweep = null;
  let timer = null;
  let unsubLease = null;
  // VERIFY r1 L1: tap key → when its last arming FAILED — a `verb` does not re-arm (and hold) it inside ARM_RETRY_MS
  const armFailedAt = new Map();
  // VERIFY r2 L5: tap key → the failure (its armFailedAt) already SAID to the clients — a verb inside the backoff records
  // nothing, and that is said ONCE per failure (typed), never an unexplained empty Browser actions row
  const armFailSaid = new Map();
  // 2026-09-27 BROWSER SESSIONS: scope → markers (loaded lazily from sessions.ndjson, appended in memory), and the OPEN
  // session per (browser key, scope) — loaded from disk once (a start with no end) before the first event decides anything
  const markersBy = new Map();
  const openSessions = new Map();
  let openLoaded = false;

  const bc = (m) => { try { broadcast?.(m); } catch (e) { log.warn?.(`[browser-trace] broadcast failed: ${e && e.message}`); } };
  /** VERIFY r2 L5: `browser-trace-status` — `arm_failed` {until = the end of the backoff, the why} when an EPHEMERAL
   *  tap's arming failed (until then its verbs are not recorded), `armed` when a later arming clears it. Once per failure. */
  function sayTapStatus(tp, code, { at = null, error = null } = {}) {
    if (!tp || tp.profileId) return; // the backoff (and so the gap) is the ephemeral tap's alone
    const base = { type: 'browser-trace-status', sessionId: tp.sessionId, profileId: null, browserKey: tp.wantKey || tp.browserKey || null, child: !!tp.childKey, code };
    if (code === 'arm_failed') {
      if (armFailSaid.get(tp.key) === at) return;
      armFailSaid.set(tp.key, at);
      bc({ ...base, at, until: at + ARM_RETRY_MS, error: String(error || 'the tap could not be armed').slice(0, 300) });
    } else if (armFailSaid.has(tp.key)) { armFailSaid.delete(tp.key); bc({ ...base, at: now() }); }
  }
  // naive study 2 (finding 4): a SUB-AGENT's ephemeral browser is its own tap (`<session>|child:<key>`), scope `ephemeral`
  const tapKey = (sessionId, profileId, childKey = null) => (childKey ? `${sessionId}|child:${childKey}` : `${sessionId}|${profileId || T.EPHEMERAL_SCOPE}`);
  const scopeDir = (scope) => path.join(traceRoot, scope);

  // ── the index per scope ──
  function loadIndex(scope) {
    if (indexes.has(scope)) return indexes.get(scope);
    const out = [];
    try {
      const text = fs.readFileSync(path.join(scopeDir(scope), INDEX_FILE), 'utf8');
      for (const line of text.split('\n')) { if (!line.trim()) continue; try { const e = JSON.parse(line); if (e && T.isEntryId(e.id)) { out.push(e); byId.set(e.id, { scope, entry: e }); } } catch { /* a torn line is skipped */ } }
    } catch { /* no index yet */ }
    indexes.set(scope, out);
    return out;
  }
  function scopes() {
    let names = [];
    try { names = fs.readdirSync(traceRoot).filter((n) => SCOPE_RE.test(n)); } catch { names = []; }
    return names;
  }
  function appendIndex(scope, entry) {
    const list = loadIndex(scope);
    list.push(entry);
    byId.set(entry.id, { scope, entry });
    try { fs.mkdirSync(scopeDir(scope), { recursive: true, mode: 0o700 }); fs.appendFileSync(path.join(scopeDir(scope), INDEX_FILE), JSON.stringify(entry) + '\n', { mode: FILE_MODE }); }
    catch (e) { log.warn?.(`[browser-trace] index append failed (${scope}): ${e && e.message}`); }
  }
  function rewriteIndex(scope, entries) {
    indexes.set(scope, entries);
    try { const f = path.join(scopeDir(scope), INDEX_FILE); const tmp = f + '.tmp-' + crypto.randomBytes(4).toString('hex'); fs.writeFileSync(tmp, entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''), { mode: FILE_MODE }); fs.renameSync(tmp, f); }
    catch (e) { log.warn?.(`[browser-trace] index rewrite failed (${scope}): ${e && e.message}`); }
  }

  // ── browser sessions: the markers, the open set, start / end ──
  function loadMarkers(scope) {
    if (markersBy.has(scope)) return markersBy.get(scope);
    const out = [];
    try {
      const text = fs.readFileSync(path.join(scopeDir(scope), BS.MARKERS_FILE), 'utf8');
      for (const line of text.split('\n')) { if (!line.trim()) continue; try { const m = JSON.parse(line); if (BS.isMarker(m)) out.push(m); } catch { /* a torn line is skipped */ } }
    } catch { /* no markers yet */ }
    markersBy.set(scope, out);
    return out;
  }
  function appendMarker(scope, m) {
    loadMarkers(scope).push(m);
    try { fs.mkdirSync(scopeDir(scope), { recursive: true, mode: 0o700 }); fs.appendFileSync(path.join(scopeDir(scope), BS.MARKERS_FILE), JSON.stringify(m) + '\n', { mode: FILE_MODE }); }
    catch (e) { log.warn?.(`[browser-trace] session marker not written (${scope}): ${e && e.message}`); }
  }
  /** Every start with no end, per (key, scope) — read once, before the first lease event or action decides anything. */
  function ensureOpenLoaded() {
    if (openLoaded) return;
    openLoaded = true;
    for (const sc of scopes()) {
      const pending = new Map();
      for (const m of loadMarkers(sc)) { if (m.phase === 'start') pending.set(m.id, m); else pending.delete(m.id); }
      if (!pending.size) continue;
      const counts = new Map(); let last = new Map();
      for (const e of loadIndex(sc)) if (pending.has(e.browserSession)) { counts.set(e.browserSession, (counts.get(e.browserSession) || 0) + 1); last.set(e.browserSession, Math.max(last.get(e.browserSession) || 0, Number(e.at) || 0)); }
      for (const m of pending.values()) {
        const k = BS.sessionKey(m.browserKey, sc);
        const prev = openSessions.get(k);
        // two starts for one key on disk (a crash between them): the newer is the one still open; the older is ended
        if (prev && prev.at > m.at) { endOpen(sc, m, 'restart', counts.get(m.id) || 0, Math.max(m.at, last.get(m.id) || 0)); continue; }
        if (prev) endOpen(sc, prev, 'restart', prev.count, Math.max(prev.at, prev.lastAt || 0));
        openSessions.set(k, { ...m, scope: sc, count: counts.get(m.id) || 0, lastAt: last.get(m.id) || 0, fromDisk: true });
      }
    }
  }
  function sayMarker(m) {
    bc({ type: 'browser-sessions-updated', browserKey: m.browserKey, profileId: m.profileId || null, marker: m });
    try { onSession?.(m); } catch (e) { log.warn?.(`[browser-trace] session hook failed: ${e && e.message}`); }
  }
  /** Open the session of (browser key, scope) unless one is open; answers it. */
  function startSession({ browserKey, profileId = null, webuiSessionId = null, why = null, at = null } = {}) {
    if (!/^bk-[0-9a-f]{8}(\.\d{1,4})?$/.test(String(browserKey || ''))) return null;
    // the trace switch OFF means nothing is recorded — no new session either (an open one still ends: its end is written)
    if (!enabled()) return null;
    ensureOpenLoaded();
    const scope = profileId || T.EPHEMERAL_SCOPE;
    const k = BS.sessionKey(browserKey, scope);
    const had = openSessions.get(k);
    if (had) { if (webuiSessionId && !had.webuiSessionId) had.webuiSessionId = webuiSessionId; return had; }
    let label = null; try { label = profileId && keeper && typeof keeper.profile === 'function' ? (keeper.profile(profileId) || {}).label || null : null; } catch { label = null; }
    const m = BS.markerFor({ phase: 'start', id: BS.mintSessionId(crypto.randomBytes(4).toString('hex')), browserKey, profileId, webuiSessionId, label, at: at || now(), reason: why });
    appendMarker(scope, m);
    const o = { ...m, scope, count: 0, lastAt: 0 };
    openSessions.set(k, o);
    log.log?.(`[browser-trace] browser session ${m.id} started: ${browserKey} on ${profileId || 'its own browser'}${why ? ` (${why})` : ''}`);
    sayMarker(m);
    return o;
  }
  function endOpen(scope, o, reason, count, at) {
    const m = BS.markerFor({ phase: 'end', id: o.id, browserKey: o.browserKey, profileId: o.profileId || null, webuiSessionId: o.webuiSessionId || null, label: o.label || null, at, count, durationMs: Math.max(0, at - o.at), reason });
    appendMarker(scope, m);
    log.log?.(`[browser-trace] browser session ${o.id} ended (${reason}): ${o.browserKey} on ${o.profileId || 'its own browser'}, ${count} action(s)`);
    sayMarker(m);
    return m;
  }
  /** Close the open session of (browser key, scope) — `reason` ∈ BS.END_REASONS. */
  function endSession({ browserKey, profileId = null, reason = 'stopped', at = null } = {}) {
    ensureOpenLoaded();
    const scope = profileId || T.EPHEMERAL_SCOPE;
    const k = BS.sessionKey(browserKey, scope);
    const o = openSessions.get(k);
    if (!o) return null;
    openSessions.delete(k);
    return endOpen(scope, o, reason, o.count, at || now());
  }
  /** The open session an entry of this tap belongs to — an action with none opens one (it is its own session). */
  function sessionForTap(tp) {
    const bk = tp.browserKey || tp.wantKey || null;
    if (!bk) return null;
    return startSession({ browserKey: bk, profileId: tp.profileId || null, webuiSessionId: tp.sessionId || null, why: 'action' });
  }

  // ── the tap listener ──
  function tapState(key, { sessionId, profileId, browserKey, target }) {
    // `ops` = every command / result record of an agent OPERATION (traced or not — `eval` is an observation to the trace,
    // an operation to a takeover), bounded: PURE browser-interrupt.inFlightAt reads it at the takeover instant
    return { key, sessionId, profileId: profileId || null, browserKey: browserKey || null, target, untap: null, pending: new Map(), frames: [], lastUrl: '', ended: false, timers: new Set(), entries: 0, ops: [] };
  }
  /** lane J: the page size a frame shows — the picture's own size + the relay's page reading (src/browser-stream.js). */
  function pageOf(msg, relay) {
    const pic = typeof msg.data === 'string' ? S.jpegSize(msg.data) : null;
    const v = relay && relay.viewport && relay.viewport.ok ? relay.viewport : null;
    const md = msg.metadata || {};
    return S.frameGeometry({ picW: pic ? pic.width : 0, picH: pic ? pic.height : 0, page: v, meta: Number(md.deviceWidth) > 0 ? { width: Number(md.deviceWidth), height: Number(md.deviceHeight) } : null });
  }
  function onRecord(tp, msg, relay = null) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'tap-end') { tp.ended = true; for (const p of [...tp.pending.values()]) finalizeNow(tp, p, 'the stream ended'); if (taps.get(tp.key) === tp) taps.delete(tp.key); for (const t of tp.timers) clearTimeout(t); return; }
    if (msg.type === 'url' && typeof msg.url === 'string') { tp.lastUrl = msg.url; return; }
    if (msg.type === 'frame') {
      const rec = { at: now(), seq: Number.isFinite(msg.seq) ? msg.seq : tp.frames.length ? (tp.frames[tp.frames.length - 1].seq || 0) + 1 : 1, meta: T.frameMeta(msg, pageOf(msg, relay)), data: typeof msg.data === 'string' ? msg.data : '' };
      tp.frames.push(rec);
      if (tp.frames.length > T.FRAME_RING) tp.frames.splice(0, tp.frames.length - T.FRAME_RING);
      for (const p of tp.pending.values()) if (p.resultAt && !p.afterDone) { p.since.push({ at: rec.at, seq: rec.seq, rec }); checkAfter(tp, p); }
      return;
    }
    // the owner's ruling (2026-09-27): EVERY operation's command / result lands on the ring a takeover reads (bounded)
    if ((msg.type === 'command' || msg.type === 'result') && msg.id != null) INT.noteRecord(tp.ops, { kind: msg.type, id: msg.id, action: msg.action, at: now() });
    if (msg.type === 'command') {
      if (!T.isTracedCommand(msg)) return;
      if (tp.pending.size >= T.PENDING_CAP) { const oldest = tp.pending.keys().next().value; finalizeNow(tp, tp.pending.get(oldest), 'too many actions in flight'); }
      const before = tp.frames.length ? tp.frames[tp.frames.length - 1] : null;
      tp.pending.set(msg.id, { id: msg.id, command: msg, at: now(), before, kind: T.classifyAction(msg.action), resultAt: 0, result: null, since: [], afterDone: false, after: null, afterSame: false, box: null, boxWhy: null, boxDone: false, url: tp.lastUrl });
      return;
    }
    if (msg.type === 'result') {
      const p = tp.pending.get(msg.id);
      if (!p) return;
      p.result = msg; p.resultAt = now();
      const sel = p.kind === 'target' ? T.selectorOf(msg.params || p.command.params) : null;
      if (sel) probeBox(tp, p, sel); else p.boxDone = true;
      const t = setTimeout(() => { tp.timers.delete(t); if (!p.afterDone) checkAfter(tp, p, true); }, T.AFTER_MAX_MS + 20);
      if (t.unref) t.unref();
      tp.timers.add(t);
      checkAfter(tp, p);
    }
  }
  function checkAfter(tp, p, timedOut = false) {
    if (p.afterDone) return;
    const pick = T.afterFramePick({ resultAt: p.resultAt, frames: p.since, beforeSeq: p.before ? p.before.seq : null, now: timedOut ? p.resultAt + T.AFTER_MAX_MS : now() });
    if (pick.pick === 'wait') return;
    p.afterDone = true;
    if (pick.index >= 0) { p.after = p.since[pick.index].rec; p.afterSame = !!pick.same; }
    else { p.after = p.before; p.afterSame = true; }
    maybeFinalize(tp, p);
  }
  function probeBox(tp, p, selector) {
    const r = rt();
    if (!r || typeof r.exec !== 'function') { p.boxWhy = 'no runtime to ask'; p.boxDone = true; maybeFinalize(tp, p); return; }
    const tg = tp.target || {};
    const ns = tg.kind === 'ephemeral' ? null : tg.ns;
    // naive study 2: a profile's probe runs under the lease's session over the keeper browser's CDP url
    // (keeper.leaseCliOpts) — never with the profile directory, which would start a second Chrome on it
    const optsP = tg.kind === 'ephemeral' ? Promise.resolve({ extraEnv: S.pairsToEnv(tg.envPairs || []) })
      : Promise.resolve(keeper && typeof keeper.leaseCliOpts === 'function' ? keeper.leaseCliOpts(tg.profileId, String(tg.sessionName || '').replace(/^vs-/, '')) : null);
    optsP.then((o) => { if (!o) throw new Error('the browser answered no CDP url — nothing to probe without starting a second browser'); return r.exec(ns, ['get', 'box', selector], { ...o, timeout: T.BOX_PROBE_TIMEOUT_MS }); }).then((res) => {
      const box = T.boxFromProbe(res && res.json);
      if (box) p.box = box; else p.boxWhy = (res && (res.error || (res.json && res.json.error) || res.stderr || '').toString().trim().slice(0, 200)) || 'the element box was not answered';
    }).catch((e) => { p.boxWhy = String(e && e.message || e).slice(0, 200); }).finally(() => { p.boxDone = true; maybeFinalize(tp, p); });
  }
  function maybeFinalize(tp, p) { if (p.afterDone && p.boxDone && !p.written) finalize(tp, p); }
  function finalizeNow(tp, p, why) { if (p.written) return; if (!p.afterDone) { p.afterDone = true; p.after = p.since.length ? p.since[p.since.length - 1].rec : p.before; p.afterSame = !p.since.length; } if (!p.boxDone) { p.boxDone = true; p.boxWhy = p.boxWhy || why; } finalize(tp, p); }
  function finalize(tp, p) {
    p.written = true;
    tp.pending.delete(p.id);
    const id = T.mintEntryId(crypto.randomBytes(6).toString('hex'));
    const scope = tp.profileId || T.EPHEMERAL_SCOPE;
    const dir = scopeDir(scope);
    try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch (e) { log.warn?.(`[browser-trace] cannot create ${dir}: ${e && e.message}`); return; }
    const writeFrame = (rec, which) => {
      if (!rec || !rec.data) return null;
      const file = `${id}-${which}.jpg`;
      try { const buf = Buffer.from(rec.data, 'base64'); fs.writeFileSync(path.join(dir, file), buf, { mode: FILE_MODE }); return { file, bytes: buf.length, ...rec.meta, at: rec.at }; }
      catch (e) { log.warn?.(`[browser-trace] frame write failed: ${e && e.message}`); return null; }
    };
    const before = writeFrame(p.before, 'before');
    const after = p.afterSame && p.after === p.before ? (before ? { ...before, file: before.file } : null) : writeFrame(p.after, 'after');
    const position = T.positionOf({ kind: p.kind, params: p.command.params, box: p.box, boxWhy: p.boxWhy });
    const bs = sessionForTap(tp); // 2026-09-27: the browser session this action belongs to (an action with none opens one)
    const entry = T.entryFor({ id, at: p.at, sessionId: tp.sessionId, browserKey: tp.browserKey, profileId: tp.profileId, browserSession: bs ? bs.id : null, command: p.command, result: p.result, position, before, after, afterSame: p.afterSame, url: tp.lastUrl || p.url || null });
    if (bs) { bs.count++; bs.lastAt = Math.max(bs.lastAt || 0, entry.at); }
    try { fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(entry), { mode: FILE_MODE }); } catch (e) { log.warn?.(`[browser-trace] entry write failed: ${e && e.message}`); }
    appendIndex(scope, entry);
    tp.entries++;
    if (!tp.childKey) { try { bridge?.broadcastTo?.(tp.sessionId, tp.profileId, { type: 'trace', entry }); } catch { /* optional */ } } // a sub-agent's browser has no live view of its own
    bc({ type: 'browser-trace-appended', sessionId: tp.sessionId, profileId: tp.profileId, browserKey: tp.browserKey, entry: { id: entry.id, at: entry.at, action: entry.action, kind: entry.kind, text: entry.text, ok: entry.ok, scope, browserSession: entry.browserSession } });
  }

  // ── arming ──
  /**
   * Arm ONE tap: a named profile's (`profileId`) or — `profileId` null — the
   * session's own EPHEMERAL browser (`S.EPHEMERAL_REF`: never whatever pane is
   * the session's default, which would file an attachment's actions under the
   * `ephemeral` scope). A tap never STARTS a browser: a profile must be live,
   * and an ephemeral one must be `ready` in the keeper (asking its stream
   * status with no daemon would make the CLI launch one). Concurrent callers
   * share the one arming (`tp.arming`) — the keeper's verb waits on it.
   */
  function watch({ sessionId, profileId = null, browserKey = null, child = false } = {}) {
    if (!enabled()) return Promise.resolve({ ok: false, code: 'trace_off', error: 'the action trace is off (browser.actionTrace)' });
    if (!bridge || typeof bridge.tap !== 'function') return Promise.resolve({ ok: false, code: 'unavailable', error: 'the stream bridge is not wired' });
    if (!sessionId) return Promise.resolve({ ok: false, code: 'bad-request', error: 'a session id is required' });
    const childKey = !profileId && child && B.isChildKey(browserKey) ? String(browserKey) : null;
    const key = tapKey(sessionId, profileId, childKey);
    const had = taps.get(key);
    if (had) return had.arming ? had.arming.then((r) => (r && r.ok ? { ...r, already: true } : r)) : Promise.resolve({ ok: true, key, already: true });
    // a tap never STARTS a browser — a named profile must already be live
    if (profileId && keeper) { const rec = keeper.browserOf(profileId); if (!rec || rec.state !== 'ready') return Promise.resolve({ ok: false, code: 'not-live', error: `profile ${profileId} has no live browser to trace` }); }
    // lane H: an ephemeral tap needs its HOLDER ROW (the keeper's one representation — ready, not a sub-agent's)
    if (!profileId && keeper && browserKey && typeof keeper.holdersFor === 'function') { const held = keeper.holdersFor(browserKey).some((r) => r.ephemeral && !!r.child === !!childKey && r.browserKey === browserKey); if (!held) return Promise.resolve({ ok: false, code: 'not-live', error: `the ephemeral browser of ${browserKey} is not running — nothing to trace` }); }
    const tp = tapState(key, { sessionId, profileId, browserKey: null, target: null });
    tp.childKey = childKey;
    tp.wantKey = browserKey ? String(browserKey) : null; // r2 L5: the key a status names before the relay says it
    taps.set(key, tp);
    tp.arming = arm(tp, key, sessionId, profileId).finally(() => { tp.arming = null; });
    return tp.arming;
  }
  async function arm(tp, key, sessionId, profileId) {
    let r;
    // the ref: a named profile's id, a sub-agent's `~child:<key>` (its OWN browser, naive study 2), else the session's own ephemeral
    const ref = profileId || (tp.childKey ? S.childRefFor(tp.childKey) : S.EPHEMERAL_REF);
    // r2 L5: every failed arming is recorded for the backoff AND said (once) to the clients
    const failArm = (code, error) => { const at = now(); armFailedAt.set(key, at); sayTapStatus(tp, 'arm_failed', { at, error }); return { ok: false, code, error }; };
    try { r = await bridge.tap(sessionId, ref, (msg, _text, relay) => onRecord(tp, msg, relay)); } catch (e) { if (taps.get(key) === tp) taps.delete(key); return failArm('internal', String(e && e.message)); } // lane J: the relay rides along (its page reading stamps the frame)
    if (!r || !r.ok) { if (taps.get(key) === tp) taps.delete(key); try { r && r.untap && r.untap(); } catch { /* */ } return failArm((r && r.code) || 'refused', (r && r.error) || 'tap refused'); }
    armFailedAt.delete(key);
    // disarmed while it was connecting (the browser stopped, the lease went): let the relay go
    if (taps.get(key) !== tp) { try { r.untap && r.untap(); } catch { /* */ } return { ok: false, code: 'ended', error: 'disarmed while the tap was connecting' }; }
    tp.untap = r.untap;
    const relay = bridge._relays ? [...bridge._relays.values()].find((x) => x.key === r.key) : null;
    tp.browserKey = relay ? relay.browserKey : (tp.childKey || null);
    tp.target = relay ? relay.target : (r.target || null);
    if (tp.ended) { taps.delete(key); return failArm('ended', 'the stream ended at once'); }
    sayTapStatus(tp, 'armed');
    log.log?.(`[browser-trace] tracing ${sessionId} on ${profileId || (tp.childKey ? 'its sub-agent browser ' + tp.childKey : 'its ephemeral browser')}`);
    return { ok: true, key };
  }
  function unwatch({ sessionId, profileId = null, childKey = null } = {}) {
    const key = tapKey(sessionId, profileId, childKey);
    armFailedAt.delete(key); armFailSaid.delete(key);
    const tp = taps.get(key);
    if (!tp) return false;
    for (const p of [...tp.pending.values()]) finalizeNow(tp, p, 'tracing stopped');
    for (const t of tp.timers) clearTimeout(t);
    taps.delete(key);
    try { tp.untap?.(); } catch { /* */ }
    return true;
  }
  /** Arm a tap for every lease on a profile whose browser is live (attach / browser-ready / boot). */
  function armProfile(profileId) {
    if (!keeper) return Promise.resolve([]);
    const ps = [];
    for (const l of keeper.leasesOn(profileId)) if (l.sessionId) ps.push(watch({ sessionId: l.sessionId, profileId }).catch(() => null));
    return Promise.all(ps);
  }
  /** Lane H: the tap on a conversation's managed EPHEMERAL browser (scope
   *  `ephemeral`) — armed on its `browser-ready`, re-armed on a `verb` when no
   *  tap holds it; a sub-agent's ephemeral is not its session's pane. */
  /** Naive study 2 (finding 4): a SUB-AGENT's ephemeral browser is recorded too ("no recorded actions" under every
   *  helper's command: nobody was viewing) — its own tap, `~child:<key>`, never a live view. */
  function armEphemeral(ev) {
    if (!ev.sessionId) return Promise.resolve(null);
    return watch({ sessionId: ev.sessionId, profileId: null, browserKey: ev.browserKey || null, child: !!ev.child }).catch(() => null);
  }
  /** VERIFY r1 L1: THE ARM WAIT BELONGS TO THE VERB THAT STARTED THE BROWSER. A `verb` on an already-live browser
   *  arms only when NO tap holds it — never joining an arming another event started (a tap stuck arming used to
   *  hold EVERY verb for the whole wait: 3150 / 3098 / 3108 ms on 0.38.1) — and not within ARM_RETRY_MS of a
   *  FAILED arming of the same key (a failed tap was deleted and every next verb re-armed and waited again). A
   *  `browser-ready` (a NEW browser) always arms. */
  function armOnVerb(ev) {
    if (!ev.sessionId) return null;
    const key = tapKey(ev.sessionId, null, ev.child && B.isChildKey(ev.browserKey) ? ev.browserKey : null);
    if (taps.has(key)) return null;
    const failed = armFailedAt.get(key);
    // r2 L5: inside the backoff this verb is not recorded — said once per failure (a no-op when the failure already was)
    if (failed != null && now() - failed < ARM_RETRY_MS) { sayTapStatus({ key, sessionId: ev.sessionId, profileId: null, wantKey: ev.browserKey || null, childKey: ev.child && B.isChildKey(ev.browserKey) ? ev.browserKey : null }, 'arm_failed', { at: failed, error: 'the last arming failed' }); return null; }
    return armEphemeral(ev);
  }
  /** Every event answers a promise when it ARMS a tap — the keeper holds the
   *  verb that caused it until the tap is connected (bounded, lane H). */
  /** 2026-09-27: the SESSION half of a lease event — a grant / a launch / a join opens (per holder), a release closes
   *  (after the taps finalized what was in flight, so the last actions carry the session they happened in); an IDLE
   *  stop closes nothing. Sessions are recorded whether or not the trace is on (they are small, and say what ran). */
  function sessionsOnEvent(ev) {
    const reason = BS.endReasonFor(ev);
    if (ev.ephemeral) {
      if (!ev.browserKey) return;
      if (ev.kind === 'browser-ready' || ev.kind === 'verb') startSession({ browserKey: ev.browserKey, profileId: null, webuiSessionId: ev.sessionId || null, why: ev.kind === 'verb' ? 'verb' : 'launch' });
      else if (reason) endSession({ browserKey: ev.browserKey, profileId: null, reason });
      return;
    }
    if (!ev.profileId) return;
    if (ev.kind === 'attach') startSession({ browserKey: ev.browserKey, profileId: ev.profileId, webuiSessionId: ev.sessionId || null, why: 'attach' });
    else if (ev.kind === 'browser-ready') { for (const l of keeper ? keeper.leasesOn(ev.profileId) : []) startSession({ browserKey: l.browserKey, profileId: ev.profileId, webuiSessionId: l.sessionId || null, why: 'launch' }); }
    else if ((ev.kind === 'detach' || ev.kind === 'lease-dropped') && reason) endSession({ browserKey: ev.browserKey, profileId: ev.profileId, reason });
    else if (ev.kind === 'browser-stopped' && reason) { ensureOpenLoaded(); for (const o of [...openSessions.values()]) if (o.profileId === ev.profileId) endSession({ browserKey: o.browserKey, profileId: ev.profileId, reason }); }
  }
  function onLeaseEvent(ev) {
    if (!ev) return null;
    const out = leaseTaps(ev);
    try { sessionsOnEvent(ev); } catch (e) { log.warn?.(`[browser-trace] session bookkeeping failed on ${ev.kind}: ${e && e.message}`); }
    return out;
  }
  function leaseTaps(ev) {
    if (ev.ephemeral) {
      if (ev.kind === 'browser-ready') return armEphemeral(ev);
      if (ev.kind === 'verb') return armOnVerb(ev);
      if ((ev.kind === 'browser-stopped' || ev.kind === 'lease-dropped' || ev.kind === 'detach') && ev.sessionId) unwatch({ sessionId: ev.sessionId, profileId: null, childKey: ev.child && B.isChildKey(ev.browserKey) ? ev.browserKey : null });
      return null;
    }
    if (ev.kind === 'attach') { const p = ev.sessionId ? watch({ sessionId: ev.sessionId, profileId: ev.profileId }).catch(() => null) : null; maybeStartRecording(ev.profileId, ev.browserKey, ev.sessionId).catch(() => { }); return p; }
    else if (ev.kind === 'browser-ready') { const p = armProfile(ev.profileId); for (const l of keeper ? keeper.leasesOn(ev.profileId) : []) maybeStartRecording(ev.profileId, l.browserKey, l.sessionId).catch(() => { }); return p; }
    else if (ev.kind === 'detach' || ev.kind === 'lease-dropped') { if (ev.sessionId) unwatch({ sessionId: ev.sessionId, profileId: ev.profileId }); stopRecording(ev.profileId, ev.browserKey, ev.kind).catch(() => { }); }
    else if (ev.kind === 'browser-stopped') { for (const tp of [...taps.values()]) if (tp.profileId === ev.profileId) unwatch({ sessionId: tp.sessionId, profileId: tp.profileId }); for (const k of [...recordings.keys()]) if (k.startsWith(ev.profileId + '|')) recordings.delete(k); }
    else if (ev.kind === 'profile-updated' && ev.changed && ev.changed.record) { if (ev.changed.record.now) { for (const l of keeper ? keeper.leasesOn(ev.profileId) : []) maybeStartRecording(ev.profileId, l.browserKey, l.sessionId).catch(() => { }); } else { for (const k of [...recordings.keys()]) if (k.startsWith(ev.profileId + '|')) stopRecording(ev.profileId, k.slice(ev.profileId.length + 1), 'record off').catch(() => { }); } }
    return null;
  }

  // ── the per-profile screencast (D7) ──
  async function maybeStartRecording(profileId, browserKey, sessionId = null) {
    if (!keeper || !browserKey) return { ok: false, code: 'bad-request' };
    const p = keeper.profile(profileId);
    const v = T.recordingVerdict({ version: keeper._facts ? keeper._facts.lastVersion() : undefined, profile: p });
    if (!v.ok) { if (p && p.record && v.code !== 'recording_off') { recordingRefusals.set(profileId, { code: v.code, error: v.error, at: now() }); log.warn?.(`[browser-trace] recording refused for ${profileId}: ${v.error}`); } return v; }
    const rec = keeper.browserOf(profileId);
    if (!rec || rec.state !== 'ready') return { ok: false, code: 'not-live', error: 'no live browser' };
    const key = `${profileId}|${browserKey}`;
    if (recordings.has(key)) return { ok: true, already: true, ...recordings.get(key) };
    // lane live-input (the owner's journal: "recording … → …132332.webm" then, 106 ms later, "record start failed … 132438.webm"):
    // ONE start per recording at a time — the `attach` every agent command emits and the panel's record-on fan-out raced
    // through the awaits below. A second ask while one is starting answers with THAT start (never a second `record start`).
    if (recStarting.has(key)) return recStarting.get(key).then((x) => (x && x.ok ? { ...x, already: true } : x));
    const run = startRecording(profileId, browserKey, sessionId, key).finally(() => { if (recStarting.get(key) === run) recStarting.delete(key); });
    recStarting.set(key, run);
    return run;
  }
  async function startRecording(profileId, browserKey, sessionId, key) {
    const refuse = (code, error) => {
      // a refusal is recorded only when it is REAL: this recording is not running (a start another ask won cannot fail it)
      if (!recordings.has(key)) { recordingRefusals.set(profileId, { code, error, at: now() }); try { keeper.list && bc({ type: 'browser-profiles-updated', ...keeper.list() }); } catch { /* */ } }
      return { ok: false, code, error };
    };
    const r = rt();
    if (!r) return { ok: false, code: 'unavailable', error: 'no runtime' };
    const rel = T.recordingFileFor({ profileId, sessionId: sessionId || browserKey, at: now() });
    const file = path.join(recRoot, rel);
    try { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); } catch (e) { return refuse('dir_unwritable', e.message); }
    // naive study 2: under the lease's session over the keeper browser's CDP url — never the profile directory
    const o = typeof keeper.leaseCliOpts === 'function' ? await keeper.leaseCliOpts(profileId, browserKey) : null;
    if (!o) return refuse('browser_no_cdp', 'the browser answered no CDP url — a screencast cannot join it without starting a second browser');
    const res = await r.exec(B.sessionNameFor(profileId), ['record', 'start', file], { ...o, timeout: 20000 });
    if (!res.ok) { const why = T.cleanRecordError(res.error || res.stderr || res.stdout || ''); log.warn?.(`[browser-trace] record start failed for ${profileId}: ${why}`); return refuse('record_failed', why); }
    const st = { profileId, browserKey, sessionId: sessionId || null, file: rel, since: now() };
    recordings.set(key, st);
    recordingRefusals.delete(profileId);
    log.log?.(`[browser-trace] recording ${profileId} (${browserKey}) → ${rel}`);
    try { keeper.list && bc({ type: 'browser-profiles-updated', ...keeper.list() }); } catch { /* */ }
    // turned off while it was starting ⇒ stopped at once (the switch's last word wins)
    const pNow = keeper.profile(profileId);
    if (pNow && !pNow.record) stopRecording(profileId, browserKey, 'record off (while starting)').catch(() => { });
    return { ok: true, ...st };
  }
  async function stopRecording(profileId, browserKey, why = 'stop') {
    const key = `${profileId}|${browserKey}`;
    const st = recordings.get(key);
    if (!st) return { ok: false, code: 'not_recording' };
    recordings.delete(key);
    const r = rt(); const p = keeper ? keeper.profile(profileId) : null;
    let res = null;
    if (r && p) { try { const o = typeof keeper.leaseCliOpts === 'function' ? await keeper.leaseCliOpts(profileId, browserKey) : null; res = o ? await r.exec(B.sessionNameFor(profileId), ['record', 'stop'], { ...o, timeout: 20000 }) : { ok: false, error: 'the browser answered no CDP url (it stopped?) — nothing to tell to stop recording' }; } catch (e) { res = { ok: false, error: String(e && e.message) }; } }
    log.log?.(`[browser-trace] recording of ${profileId} (${browserKey}) stopped (${why})${res && !res.ok ? ' — record stop answered: ' + (res.error || res.stderr || '').trim().slice(0, 200) : ''}`);
    try { keeper && keeper.list && bc({ type: 'browser-profiles-updated', ...keeper.list() }); } catch { /* */ }
    return { ok: true, file: st.file, stopped: !!(res && res.ok) };
  }
  function recordingsOf(profileId) {
    const dir = path.join(recRoot, String(profileId));
    let names = [];
    try { names = fs.readdirSync(dir).filter(T.isRecordingFile); } catch { return []; }
    return names.map((n) => { let st = null; try { st = fs.statSync(path.join(dir, n)); } catch { return null; } const live = [...recordings.values()].find((x) => x.file === `${profileId}/${n}`); return { file: n, bytes: st.size, mtime: st.mtimeMs, live: !!live }; }).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
  }
  function recordingPath(profileId, file) {
    if (!B.isProfileId(profileId) || !T.isRecordingFile(file)) return null;
    return path.join(recRoot, profileId, file);
  }
  function digest() {
    const out = {};
    for (const st of recordings.values()) out[st.profileId] = { file: st.file, since: st.since, browserKey: st.browserKey, sessionId: st.sessionId };
    const refused = {}; for (const [id, r] of recordingRefusals) refused[id] = { ...r };
    return { recording: out, recordingRefused: refused, traceOn: enabled(), traceTaps: taps.size };
  }

  // ── reading ──
  /** `anyOf`: an entry matches when it carries the session id OR the browser
   *  key (a resume re-carries the key while the webui id churns — the tool
   *  card of a resumed conversation still finds its actions); default = both. */
  function list({ sessionId = null, profileId = undefined, browserKey = null, anyOf = false, from = 0, to = Infinity, limit = 200 } = {}) {
    const names = profileId ? [String(profileId)] : (profileId === null ? [T.EPHEMERAL_SCOPE] : scopes());
    let all = [];
    for (const sc of names) { if (!SCOPE_RE.test(sc)) continue; all = all.concat(loadIndex(sc)); }
    let hits = T.entriesInWindow(all, { sessionId: anyOf ? null : sessionId, from: Number(from) || 0, to: Number.isFinite(Number(to)) && to !== Infinity ? Number(to) : Infinity });
    // naive study 2 (finding 4): a conversation's key also finds its SUB-AGENTS' browsers (`bk-<key>.<n>`) — the helpers' actions stay findable after it stops
    const keyHit = (e) => e.browserKey === browserKey || (B.isChildKey(e.browserKey) && B.parentKeyOf(e.browserKey) === browserKey);
    if (anyOf && (sessionId || browserKey)) hits = hits.filter((e) => (sessionId && e.sessionId === sessionId) || (browserKey && keyHit(e)));
    else if (browserKey) hits = hits.filter(keyHit);
    hits.sort((a, b) => a.at - b.at);
    const n = Math.max(1, Math.min(1000, Number(limit) || 200));
    return hits.length > n ? hits.slice(hits.length - n) : hits;
  }
  function entry(id) { if (!T.isEntryId(id)) return null; if (!byId.has(id)) for (const sc of scopes()) { loadIndex(sc); if (byId.has(id)) break; } const h = byId.get(id); return h ? h.entry : null; }
  /** 2026-09-27: every scope's sessions (PURE pairing over markers + entries), filtered — newest first. `browserKey`
   *  = a conversation's own key (its helpers' child keys included), `profileId` = one scope (null = the ephemeral one),
   *  `sessionId` = a live webui id (matched with the key, a resume churns the id). */
  function sessions({ browserKey = null, profileId = undefined, sessionId = null } = {}) {
    ensureOpenLoaded();
    const names = profileId ? [String(profileId)] : (profileId === null ? [T.EPHEMERAL_SCOPE] : scopes());
    let out = [];
    for (const sc of names) {
      if (!SCOPE_RE.test(sc)) continue;
      out = out.concat(BS.pairSessions({ markers: loadMarkers(sc), entries: loadIndex(sc), now: now() }).map((x) => ({ ...x, scope: sc })));
    }
    if (browserKey || sessionId) {
      const byKey = browserKey ? new Set(BS.sessionsOfKey(out, browserKey).map((x) => x.id)) : new Set();
      out = out.filter((x) => byKey.has(x.id) || (sessionId && x.webuiSessionId === sessionId));
    }
    return out.sort((a, b) => b.startAt - a.startAt || (b.order || 0) - (a.order || 0));
  }
  /** One session's entries, oldest first (its tag, or — an implicit one — the span of its browser). */
  function sessionEntries(id, { scope = null } = {}) {
    if (!BS.isSessionId(id)) return [];
    const names = scope ? [scope] : scopes();
    for (const sc of names) {
      if (!SCOPE_RE.test(sc)) continue;
      const all = loadIndex(sc);
      const tagged = all.filter((e) => e.browserSession === id);
      if (tagged.length) return tagged.slice().sort((a, b) => a.at - b.at);
      const ss = BS.pairSessions({ markers: loadMarkers(sc), entries: all, now: now() });
      const s = ss.find((x) => x.id === id);
      if (s) return all.filter((e) => BS.sessionOfEntry(e, ss) === id).sort((a, b) => a.at - b.at);
    }
    return [];
  }
  /** The chat cards of ONE conversation (its browser key): start + end per session, stable ids, oldest first. */
  function chatCardsFor(browserKey) {
    if (!B.isBrowserKey(browserKey)) return [];
    try { return BS.chatCardsFor(sessions({ browserKey }), browserKey, { limit: bytesLimit() }); } catch (e) { log.warn?.(`[browser-trace] chat cards for ${browserKey} not derived: ${e && e.message}`); return []; }
  }
  function framePath(id, which) {
    const e = entry(id);
    if (!e) return null;
    const f = which === 'before' ? e.before : e.after;
    if (!f || !f.file) return null;
    return path.join(scopeDir(e.scope || e.profileId || T.EPHEMERAL_SCOPE), f.file);
  }

  // ── retention: BY SIZE ONLY (the owner, 2026-09-27) ──
  /** The plan's input for one scope: its sessions, each with its entries' frame and list bytes. */
  function scopeForPlan(sc) {
    const entries = loadIndex(sc);
    const ss = BS.pairSessions({ markers: loadMarkers(sc), entries, now: now() });
    const byS = new Map(ss.map((x) => [x.id, { id: x.id, startAt: x.startAt, open: x.open, entries: [] }]));
    const loose = { id: null, startAt: 0, open: false, entries: [] };
    for (const e of entries) { const sid = BS.sessionOfEntry(e, ss); (byS.get(sid) || loose).entries.push({ id: e.id, at: e.at, frameBytes: T.entryFrameBytes(e), listBytes: T.entryListBytes(e) }); }
    return { key: sc, sessions: [...byS.values(), ...(loose.entries.length ? [loose] : [])] };
  }
  function sweep() {
    const t = now();
    const limit = bytesLimit();
    const plan = T.traceSizePlan({ scopes: scopes().map(scopeForPlan), bytesPerScope: limit });
    for (const sc of new Set(plan.removeFrames.map((r) => r.key))) {
      const gone = new Map(plan.removeFrames.filter((r) => r.key === sc).map((r) => [r.id, r]));
      const list = loadIndex(sc);
      for (const e of list) {
        const r = gone.get(e.id);
        if (!r) continue;
        const files = new Set([e.before && e.before.file, e.after && e.after.file].filter(Boolean));
        for (const f of files) { try { fs.unlinkSync(path.join(scopeDir(sc), f)); } catch { /* gone already */ } }
        // the ACTION LIST stays: the entry keeps everything but its pictures, and says why they went
        e.before = null; e.after = null;
        e.framesRemoved = { at: t, why: 'size', limit };
        try { fs.writeFileSync(path.join(scopeDir(sc), `${e.id}.json`), JSON.stringify(e), { mode: FILE_MODE }); } catch { /* the index line is the record */ }
      }
      rewriteIndex(sc, list);
    }
    // recordings: their own bound, per profile (src/browser-recording-retention.js), over the files themselves
    const recRemoved = [];
    let recDirs = [];
    try { recDirs = fs.readdirSync(recRoot).filter((n) => B.isProfileId(n)); } catch { recDirs = []; }
    for (const pid of recDirs) {
      const files = recordingsOf(pid).filter((f) => !f.live).map((f) => ({ id: f.file, at: f.mtime, bytes: f.bytes }));
      const rp = RR.recordingRetentionPlan({ groups: [{ key: pid, entries: files }], now: t });
      for (const r of rp.remove) { try { fs.unlinkSync(path.join(recRoot, pid, r.id)); recRemoved.push({ profileId: pid, file: r.id, why: r.why, bytes: r.bytes }); } catch { /* */ } }
    }
    const framesRemoved = plan.removeFrames.length;
    lastSweep = { at: t, removed: framesRemoved, framesRemoved, bytesRemoved: plan.bytesRemoved, limit, recordingsRemoved: recRemoved.length, recordingBytesRemoved: recRemoved.reduce((n, r) => n + r.bytes, 0), kept: plan.kept };
    if (framesRemoved || recRemoved.length) log.log?.(`[browser-trace] sweep: the frames of ${framesRemoved} action(s) (${Math.round(plan.bytesRemoved / 1024)} KB) + ${recRemoved.length} recording(s) removed — ${[...plan.removeFrames, ...recRemoved].slice(0, 3).map((r) => r.why).join('; ')}${framesRemoved + recRemoved.length > 3 ? '; …' : ''} (every action list kept)`);
    bc({ type: 'browser-housekeeping-updated', sweep: lastSweep });
    return { ...lastSweep, plan, recordings: recRemoved };
  }
  /** What one scope holds now against its limit (the panel's `{used} of {size}`). */
  function usageOf(sc) {
    let frames = 0, lists = 0;
    for (const e of loadIndex(sc)) { frames += T.entryFrameBytes(e); lists += T.entryListBytes(e); }
    return { used: frames + lists, frameBytes: frames, listBytes: lists, limit: bytesLimit() };
  }

  // ── sizes (a child process, cached) ──
  function duBatch(dirs, { timeoutMs = DU_TIMEOUT_MS } = {}) {
    const want = dirs.filter((d) => d && !sizeCache.has(d) || (sizeCache.get(d) && now() - sizeCache.get(d).at > SIZE_CACHE_MS));
    if (!want.length) return Promise.resolve(Object.fromEntries(dirs.map((d) => [d, sizeCache.get(d) ? sizeCache.get(d).bytes : null])));
    return new Promise((resolve) => {
      let done = false;
      const finish = (out) => { if (done) return; done = true; resolve(Object.fromEntries(dirs.map((d) => [d, sizeCache.get(d) ? sizeCache.get(d).bytes : (out[d] ?? null)]))); };
      try {
        execFileImpl('du', ['-sb', '--', ...want], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
          const out = {};
          for (const line of String(stdout || '').split('\n')) { const m = /^(\d+)\s+(.+)$/.exec(line.trim()); if (m) { out[m[2]] = Number(m[1]); sizeCache.set(m[2], { bytes: Number(m[1]), at: now() }); } }
          if (err && !Object.keys(out).length) log.warn?.(`[browser-trace] du failed: ${err.message}`);
          finish(out);
        });
      } catch (e) { log.warn?.(`[browser-trace] du unavailable: ${e && e.message}`); finish({}); }
    });
  }
  const dirMtime = (d) => { try { return fs.statSync(d).mtimeMs; } catch { return 0; } };

  // ── the forgotten ledger ──
  function loadForgotten() { if (forgotten) return forgotten; try { const j = JSON.parse(fs.readFileSync(forgottenFile, 'utf8')); forgotten = Array.isArray(j.forgotten) ? j.forgotten : []; } catch { forgotten = []; } return forgotten; }
  function saveForgotten() { try { fs.mkdirSync(path.dirname(forgottenFile), { recursive: true }); writeJsonAtomic(forgottenFile, { version: 1, forgotten: loadForgotten() }); } catch (e) { log.warn?.(`[browser-trace] forgotten ledger not saved: ${e && e.message}`); } }
  function fileForgotten({ profileId = null, label = '', dir, to, bytes = null, why = 'forgotten' }) {
    const row = { id: 'fg-' + crypto.randomBytes(4).toString('hex'), profileId, label, from: dir, dir: to, bytes, at: now(), why, deletedAt: null };
    loadForgotten().push(row);
    saveForgotten();
    return row;
  }
  /** `forget` a registry profile: verdict → RENAME the directory beside itself → ledger row → the record goes. */
  async function forgetProfile(id, { unpin = false } = {}) {
    if (!keeper) throw namedError('unavailable', 'no keeper');
    const p = keeper.profile(id);
    const reg = keeper._reg();
    const v = T.forgetVerdict({ profile: p, leases: reg.leases, browsers: reg.browsers });
    if (!v.ok) throw namedError(v.code, v.error);
    // lane S2: a profile a conversation still PINS is never moved aside (the rename would come before the removal's own refusal)
    if (!unpin && typeof keeper.pinnedBy === 'function' && keeper.pinnedBy(id).length) { const pv = require('../browser-fact.js').deletePinnedVerdict({ label: p.label, pinnedBy: keeper.pinnedBy(id) }); throw namedError(pv.code, pv.error); }
    for (const tp of [...taps.values()]) if (tp.profileId === id) unwatch({ sessionId: tp.sessionId, profileId: id });
    const bytes = sizeCache.get(p.dir) ? sizeCache.get(p.dir).bytes : null;
    let to = null;
    let exists = false; try { exists = fs.statSync(p.dir).isDirectory(); } catch { exists = false; }
    if (exists) { to = T.forgottenDirName(p.dir, now()); try { fs.renameSync(p.dir, to); } catch (e) { throw namedError('forget_failed', `could not move ${p.dir} aside (${e.message}) — nothing was removed`); } }
    const row = fileForgotten({ profileId: id, label: p.label, dir: p.dir, to, bytes, why: exists ? 'forgotten by the user (directory moved aside, never deleted by itself)' : 'forgotten by the user (its directory was already gone)' });
    const r = keeper.removeProfile(id, { unpin });
    log.log?.(`[browser-trace] profile ${id} "${p.label}" forgotten: ${p.dir} → ${to || '(no directory)'} (ledger ${row.id})`);
    bc({ type: 'browser-housekeeping-updated', forgotten: row });
    return { ok: true, removed: r.removed, from: p.dir, to, ledger: row };
  }
  /** `forget` an orphan directory (no record): verdict on the path → rename → ledger. */
  function forgetOrphan(dir) {
    const v = T.orphanPathVerdict({ dir, base: abBase });
    if (!v.ok) throw namedError(v.code, v.error);
    let real = null; try { real = fs.realpathSync(dir); } catch { throw namedError('not-found', `${dir} does not exist`); }
    if (!real.startsWith(fs.realpathSync(abBase) + '/')) throw namedError('not_ours', `${dir} resolves outside ${abBase}`);
    if (keeper && keeper._reg().profiles.some((p) => p.dir === dir || p.dir === real)) throw namedError('leased', `${dir} is a registered profile — forget it from its row`);
    const to = T.forgottenDirName(dir, now());
    try { fs.renameSync(dir, to); } catch (e) { throw namedError('forget_failed', `could not move ${dir} aside (${e.message}) — nothing was removed`); }
    const row = fileForgotten({ profileId: null, label: path.basename(dir), dir, to, bytes: sizeCache.get(dir) ? sizeCache.get(dir).bytes : null, why: 'orphan forgotten by the user (directory moved aside, never deleted by itself)' });
    log.log?.(`[browser-trace] orphan ${dir} forgotten → ${to} (ledger ${row.id})`);
    bc({ type: 'browser-housekeeping-updated', forgotten: row });
    return { ok: true, from: dir, to, ledger: row };
  }
  /** The ONE permanent deletion — a human's explicit click on a forgotten row. */
  async function deleteForgotten(fid) {
    const row = loadForgotten().find((r) => r.id === fid);
    if (!row) throw namedError('not-found', `no forgotten row ${fid}`);
    if (row.deletedAt) return { ok: true, already: true, row };
    if (row.dir) {
      const v = T.orphanPathVerdict({ dir: row.dir, base: abBase });
      if (!v.ok && !String(row.dir).startsWith(abBase + '/')) throw namedError('not_ours', `${row.dir} is not under ${abBase} — refusing to delete it`);
      if (!T.isForgottenName(row.dir)) throw namedError('not_ours', `${row.dir} is not a forgotten directory — refusing to delete it`);
      try { await fs.promises.rm(row.dir, { recursive: true, force: true }); } catch (e) { throw namedError('delete_failed', `could not delete ${row.dir}: ${e.message}`); }
    }
    row.deletedAt = now();
    saveForgotten();
    log.log?.(`[browser-trace] forgotten ${fid} deleted permanently (${row.dir || 'no directory'})`);
    bc({ type: 'browser-housekeeping-updated', deleted: row });
    return { ok: true, row };
  }
  /** Adopt an orphan directory in place (migration step 3's "label the ones worth keeping"). */
  function adoptOrphan({ dir, label }) {
    if (!keeper) throw namedError('unavailable', 'no keeper');
    const v = T.orphanPathVerdict({ dir, base: abBase });
    if (!v.ok) throw namedError(v.code, v.error);
    const r = keeper.adoptDirectory({ label, dir, legacy: false, owner: { kind: 'instance', id: null } });
    if (!r.profile) throw namedError('adopt_failed', r.why || 'could not adopt');
    bc({ type: 'browser-housekeeping-updated', adopted: r.profile.id });
    return r;
  }

  // ── the panel's view ──
  async function orphans() {
    let names = [];
    try { names = fs.readdirSync(abBase, { withFileTypes: true }).map((d) => ({ name: d.name, isDir: d.isDirectory() })); } catch { return { base: abBase, orphans: [], why: `${abBase} is not readable` }; }
    const rows = [];
    for (const n of names) {
      if (!n.isDir) continue;
      const full = path.join(abBase, n.name);
      let markers = []; try { markers = fs.readdirSync(full).filter((x) => T.PROFILE_MARKERS.includes(x)); } catch { markers = []; }
      rows.push({ name: n.name, isDir: true, markers, mtime: dirMtime(full) });
    }
    const registered = keeper ? keeper._reg().profiles.map((p) => p.dir).filter(Boolean) : [];
    const cands = T.orphanCandidates({ names: rows, registeredDirs: registered, base: abBase, now: now() });
    const sizes = await duBatch(cands.map((c) => c.dir));
    return { base: abBase, orphans: cands.map((c) => ({ ...c, bytes: sizes[c.dir] ?? null })) };
  }
  async function housekeeping() {
    const reg = keeper ? keeper._reg() : { profiles: [], leases: [], browsers: {} };
    const scope = T.sweepScope(reg.profiles);
    const sizes = await duBatch(scope.map((p) => p.dir).filter(Boolean));
    const dirFacts = {};
    for (const p of scope) if (p.dir) dirFacts[p.id] = { bytes: sizes[p.dir] ?? null, mtime: dirMtime(p.dir) };
    const rows = T.housekeepingVerdict({ profiles: reg.profiles, leases: reg.leases, browsers: reg.browsers, dirFacts, now: now() });
    for (const r of rows) {
      r.trace = { ...T.scopeDigest(loadIndex(r.id)), ...usageOf(r.id) };
      r.recordings = recordingsOf(r.id);
      r.recordingBytes = r.recordings.reduce((s, f) => s + f.bytes, 0);
      r.recording = [...recordings.values()].find((x) => x.profileId === r.id) || null;
      r.recordingRefused = recordingRefusals.get(r.id) || null;
      r.usage = keeper && typeof keeper.usageOf === 'function' ? keeper.usageOf(r.id) : null; // 2026-09-25: the live resource row (report only — memBytes + memMetric, `over`)
    }
    const eph = { scope: T.EPHEMERAL_SCOPE, trace: { ...T.scopeDigest(loadIndex(T.EPHEMERAL_SCOPE)), ...usageOf(T.EPHEMERAL_SCOPE) } };
    const o = await orphans();
    // takeover C3: every managed ephemeral browser — the record, whose conversation, its state (the panel's Stop is the profile stop route)
    const ephemeralBrowsers = keeper && typeof keeper.ephemerals === 'function' ? keeper.ephemerals() : [];
    return { profiles: rows, ephemeral: eph, ephemeralBrowsers, orphans: o.orphans, orphansBase: o.base, orphansWhy: o.why || null, forgotten: loadForgotten().slice().reverse(), sweep: lastSweep,
      limits: { bytesPerProfile: bytesLimit(), bytesDefault: T.TRACE_BYTES_PER_PROFILE, bytesFloor: T.TRACE_BYTES_FLOOR, recordingRetentionMs: RR.RECORDING_RETENTION_MS, recordingBytesPerProfile: RR.RECORDING_BYTES_PER_PROFILE, staleDays: T.STALE_PROFILE_DAYS, graceMs: T.INFLIGHT_GRACE_MS, recordingFloor: T.RECORDING_FLOOR },
      traceOn: enabled(), taps: [...taps.values()].map((tp) => ({ sessionId: tp.sessionId, profileId: tp.profileId, entries: tp.entries, pending: tp.pending.size })), version: keeper && keeper._facts ? keeper._facts.lastVersion() ?? null : null };
  }

  // ── boot / timers ──
  async function boot() {
    loadForgotten();
    if (keeper && typeof keeper.onLease === 'function' && !unsubLease) unsubLease = keeper.onLease(onLeaseEvent);
    if (keeper && typeof keeper.addDigest === 'function') keeper.addDigest(digest);
    let armed = 0;
    if (keeper && enabled()) {
      const reg = keeper._reg();
      // lane H: a managed ephemeral browser that is READY (adopted across the restart) is tapped too — scope `ephemeral`,
      // on THAT browser; never a screencast (a per-profile opt-in), never a sub-agent's (its pairs are not its session's)
      for (const l of reg.leases) {
        const rec = reg.browsers[l.profileId];
        if (!rec || rec.state !== 'ready' || !l.sessionId) continue;
        if (typeof keeper.isEphemeral === 'function' && keeper.isEphemeral(l.profileId)) { const r = await watch({ sessionId: l.sessionId, profileId: null, browserKey: l.browserKey, child: B.isChildKey(l.browserKey) }); if (r.ok) armed++; continue; } // naive study 2: a sub-agent's too
        const r = await watch({ sessionId: l.sessionId, profileId: l.profileId }); if (r.ok) armed++; maybeStartRecording(l.profileId, l.browserKey, l.sessionId).catch(() => { });
      }
    }
    // 2026-09-27: a session left open by the last run is RE-OPENED when its lease came back (the keeper re-adopted it),
    // else it ENDS with reason `restart` at its last known moment (its last action, else its start)
    let reopened = 0, endedAtBoot = 0;
    try {
      ensureOpenLoaded();
      const reg = keeper ? keeper._reg() : { leases: [] };
      for (const [k, o] of [...openSessions.entries()]) {
        if (!o.fromDisk) continue;
        const held = (reg.leases || []).some((l) => l.browserKey === o.browserKey && (o.profileId ? l.profileId === o.profileId : (typeof keeper.isEphemeral === 'function' && keeper.isEphemeral(l.profileId))));
        if (held) { o.fromDisk = false; reopened++; continue; }
        openSessions.delete(k);
        endOpen(o.scope, o, 'restart', o.count, Math.max(o.at, o.lastAt || 0));
        endedAtBoot++;
      }
    } catch (e) { log.warn?.(`[browser-trace] boot session check failed: ${e && e.message}`); }
    if (reopened || endedAtBoot) log.log?.(`[browser-trace] boot: ${reopened} browser session(s) re-opened (their lease came back), ${endedAtBoot} ended (restart)`);
    let sw = null; try { sw = sweep(); } catch (e) { log.warn?.(`[browser-trace] boot sweep failed: ${e && e.message}`); }
    if (!timer && sweepEveryMs > 0) { timer = setInterval(() => { try { sweep(); } catch (e) { log.warn?.(`[browser-trace] sweep failed: ${e && e.message}`); } }, sweepEveryMs); if (timer.unref) timer.unref(); }
    return { armed, reopened, endedAtBoot, sweep: sw ? { removed: sw.removed, recordingsRemoved: sw.recordingsRemoved } : null };
  }
  /**
   * WHAT WAS IN FLIGHT AT A TAKEOVER (the owner's ruling, 2026-09-27): the keeper asks at the instant; the tap of that
   * (conversation, browser) — a profile's, the conversation's ephemeral one, a helper's (`child:<key>`) — answers PURE
   * `inFlightAt(ring, at)`. No tap (the trace is off, or the browser was never tapped) ⇒ [] (the mediator's aborted
   * calls then name what was cut).
   */
  function inFlightFor({ sessionId = null, browserKey = null, profileId = null, at = 0 } = {}) {
    const childKey = !profileId && browserKey && B.isChildKey(browserKey) ? String(browserKey) : null;
    let tp = sessionId ? taps.get(tapKey(sessionId, profileId, childKey)) : null;
    if (!tp) tp = [...taps.values()].find((x) => (profileId ? x.profileId === profileId : !x.profileId && (childKey ? x.childKey === childKey : !x.childKey)) && (x.browserKey === browserKey || x.wantKey === browserKey)) || null;
    return tp ? INT.inFlightAt(tp.ops, at) : [];
  }
  function install() {
    if (keeper && typeof keeper.onLease === 'function' && !unsubLease) unsubLease = keeper.onLease(onLeaseEvent);
    if (keeper && typeof keeper.addDigest === 'function') keeper.addDigest(digest);
    if (keeper && typeof keeper.setInFlightReader === 'function') keeper.setInFlightReader(inFlightFor); // the owner's ruling (2026-09-27)
  }
  function shutdown() { if (timer) clearInterval(timer); timer = null; for (const tp of [...taps.values()]) unwatch({ sessionId: tp.sessionId, profileId: tp.profileId }); try { unsubLease?.(); } catch { /* */ } unsubLease = null; }

  return {
    enabled, watch, unwatch, list, entry, framePath, sweep, housekeeping, sessions, sessionEntries, chatCardsFor, startSession, endSession, usageOf, bytesLimit, orphans, forgetProfile, forgetOrphan, deleteForgotten, adoptOrphan,
    maybeStartRecording, stopRecording, recordingsOf, recordingPath, digest, boot, install, shutdown, inFlightFor,
    traceRoot, recRoot, forgottenFile, abBase, _taps: taps, _recordings: recordings, _onRecord: onRecord, _lastSweep: () => lastSweep, _openSessions: openSessions,
  };
}

module.exports = { create, SWEEP_EVERY_MS, INDEX_FILE, ARM_RETRY_MS };
