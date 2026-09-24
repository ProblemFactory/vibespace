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
 *     lease-dropped / browser-stopped disarm it. The same seam starts and
 *     stops the per-profile SCREENCAST (`record start <file>` / `record stop`
 *     under the lease's own session, `record: true` profiles only, refused BY
 *     NAME below the 0.37.0 floor — D7's opt-in; frames of a logged-in profile
 *     are a secret with a storage bill).
 *
 * RETENTION: an hourly sweep (and one at boot) applies the PURE plan — 7 days
 * or 200 MB per profile for traces AND recordings — and logs what it removed
 * and why. HOUSEKEEPING (§8 step 3, D8): sizes are measured with `du -sb` in a
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
const B = require('../browser-profiles.js');
const S = require('../browser-stream.js');

const SWEEP_EVERY_MS = 60 * 60 * 1000;
const SIZE_CACHE_MS = 10 * 60 * 1000;
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
  execFileImpl = execFile, sweepEveryMs = SWEEP_EVERY_MS, runtime = null } = {}) {
  if (!dataDir) throw new Error('browser-trace: dataDir is required');
  const traceRoot = path.join(dataDir, T.TRACE_DIR);
  const recRoot = path.join(dataDir, T.RECORDING_DIR);
  const forgottenFile = path.join(dataDir, T.FORGOTTEN_FILE);
  const abBase = path.join(homeDir, '.agent-browser');
  const rt = () => runtime || (keeper && keeper._runtime) || null;
  const setting = (k, d) => { try { const v = serverSetting(k); return v === undefined || v === null || v === '' ? d : v; } catch { return d; } };
  const enabled = () => setting('browser.actionTrace', true) !== false && setting('browser.actionTrace', true) !== 'false';

  // ── state ──
  const taps = new Map();        // key → tap state
  const indexes = new Map();     // scope → entries[] (loaded lazily)
  const byId = new Map();        // entry id → { scope, entry }
  const recordings = new Map();  // `${profileId}|${browserKey}` → { profileId, browserKey, sessionId, file, since }
  const recordingRefusals = new Map(); // profileId → { code, error, at }
  const sizeCache = new Map();   // dir → { bytes, at }
  let forgotten = null;
  let lastSweep = null;
  let timer = null;
  let unsubLease = null;

  const bc = (m) => { try { broadcast?.(m); } catch (e) { log.warn?.(`[browser-trace] broadcast failed: ${e && e.message}`); } };
  const tapKey = (sessionId, profileId) => `${sessionId}|${profileId || T.EPHEMERAL_SCOPE}`;
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
  const entryBytes = (e) => (e.before ? Number(e.before.bytes) || 0 : 0) + (e.after ? Number(e.after.bytes) || 0 : 0) + 600;

  // ── the tap listener ──
  function tapState(key, { sessionId, profileId, browserKey, target }) {
    return { key, sessionId, profileId: profileId || null, browserKey: browserKey || null, target, untap: null, pending: new Map(), frames: [], lastUrl: '', ended: false, timers: new Set(), entries: 0 };
  }
  function onRecord(tp, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'tap-end') { tp.ended = true; for (const p of [...tp.pending.values()]) finalizeNow(tp, p, 'the stream ended'); taps.delete(tp.key); for (const t of tp.timers) clearTimeout(t); return; }
    if (msg.type === 'url' && typeof msg.url === 'string') { tp.lastUrl = msg.url; return; }
    if (msg.type === 'frame') {
      const rec = { at: now(), seq: Number.isFinite(msg.seq) ? msg.seq : tp.frames.length ? (tp.frames[tp.frames.length - 1].seq || 0) + 1 : 1, meta: T.frameMeta(msg), data: typeof msg.data === 'string' ? msg.data : '' };
      tp.frames.push(rec);
      if (tp.frames.length > T.FRAME_RING) tp.frames.splice(0, tp.frames.length - T.FRAME_RING);
      for (const p of tp.pending.values()) if (p.resultAt && !p.afterDone) { p.since.push({ at: rec.at, seq: rec.seq, rec }); checkAfter(tp, p); }
      return;
    }
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
    const opts = tg.kind === 'ephemeral' ? { extraEnv: S.pairsToEnv(tg.envPairs || []), timeout: T.BOX_PROBE_TIMEOUT_MS } : { dir: tg.dir || null, session: tg.sessionName || null, timeout: T.BOX_PROBE_TIMEOUT_MS };
    const ns = tg.kind === 'ephemeral' ? null : tg.ns;
    Promise.resolve().then(() => r.exec(ns, ['get', 'box', selector], opts)).then((res) => {
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
    const entry = T.entryFor({ id, at: p.at, sessionId: tp.sessionId, browserKey: tp.browserKey, profileId: tp.profileId, command: p.command, result: p.result, position, before, after, afterSame: p.afterSame, url: tp.lastUrl || p.url || null });
    try { fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(entry), { mode: FILE_MODE }); } catch (e) { log.warn?.(`[browser-trace] entry write failed: ${e && e.message}`); }
    appendIndex(scope, entry);
    tp.entries++;
    try { bridge?.broadcastTo?.(tp.sessionId, tp.profileId, { type: 'trace', entry }); } catch { /* optional */ }
    bc({ type: 'browser-trace-appended', sessionId: tp.sessionId, profileId: tp.profileId, browserKey: tp.browserKey, entry: { id: entry.id, at: entry.at, action: entry.action, kind: entry.kind, text: entry.text, ok: entry.ok, scope } });
  }

  // ── arming ──
  async function watch({ sessionId, profileId = null } = {}) {
    if (!enabled()) return { ok: false, code: 'trace_off', error: 'the action trace is off (browser.actionTrace)' };
    if (!bridge || typeof bridge.tap !== 'function') return { ok: false, code: 'unavailable', error: 'the stream bridge is not wired' };
    if (!sessionId) return { ok: false, code: 'bad-request', error: 'a session id is required' };
    const key = tapKey(sessionId, profileId);
    if (taps.has(key)) return { ok: true, key, already: true };
    // a tap never STARTS a browser — a named profile must already be live
    if (profileId && keeper) { const rec = keeper.browserOf(profileId); if (!rec || rec.state !== 'ready') return { ok: false, code: 'not-live', error: `profile ${profileId} has no live browser to trace` }; }
    const tp = tapState(key, { sessionId, profileId, browserKey: null, target: null });
    taps.set(key, tp);
    let r;
    try { r = await bridge.tap(sessionId, profileId || '', (msg) => onRecord(tp, msg)); } catch (e) { taps.delete(key); return { ok: false, code: 'internal', error: String(e && e.message) }; }
    if (!r || !r.ok) { taps.delete(key); try { r && r.untap && r.untap(); } catch { /* */ } return { ok: false, code: (r && r.code) || 'refused', error: (r && r.error) || 'tap refused' }; }
    tp.untap = r.untap;
    const relay = bridge._relays ? [...bridge._relays.values()].find((x) => x.key === r.key) : null;
    tp.browserKey = relay ? relay.browserKey : null;
    tp.target = relay ? relay.target : (r.target || null);
    if (tp.ended) { taps.delete(key); return { ok: false, code: 'ended', error: 'the stream ended at once' }; }
    log.log?.(`[browser-trace] tracing ${sessionId} on ${profileId || 'its ephemeral browser'}`);
    return { ok: true, key };
  }
  function unwatch({ sessionId, profileId = null } = {}) {
    const key = tapKey(sessionId, profileId);
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
    if (!keeper) return;
    for (const l of keeper.leasesOn(profileId)) if (l.sessionId) watch({ sessionId: l.sessionId, profileId }).catch(() => { });
  }
  function onLeaseEvent(ev) {
    if (!ev) return;
    if (ev.kind === 'attach') { if (ev.sessionId) watch({ sessionId: ev.sessionId, profileId: ev.profileId }).catch(() => { }); maybeStartRecording(ev.profileId, ev.browserKey, ev.sessionId).catch(() => { }); }
    else if (ev.kind === 'browser-ready') { armProfile(ev.profileId); for (const l of keeper ? keeper.leasesOn(ev.profileId) : []) maybeStartRecording(ev.profileId, l.browserKey, l.sessionId).catch(() => { }); }
    else if (ev.kind === 'detach' || ev.kind === 'lease-dropped') { if (ev.sessionId) unwatch({ sessionId: ev.sessionId, profileId: ev.profileId }); stopRecording(ev.profileId, ev.browserKey, ev.kind).catch(() => { }); }
    else if (ev.kind === 'browser-stopped') { for (const tp of [...taps.values()]) if (tp.profileId === ev.profileId) unwatch({ sessionId: tp.sessionId, profileId: tp.profileId }); for (const k of [...recordings.keys()]) if (k.startsWith(ev.profileId + '|')) recordings.delete(k); }
    else if (ev.kind === 'profile-updated' && ev.changed && ev.changed.record) { if (ev.changed.record.now) { for (const l of keeper ? keeper.leasesOn(ev.profileId) : []) maybeStartRecording(ev.profileId, l.browserKey, l.sessionId).catch(() => { }); } else { for (const k of [...recordings.keys()]) if (k.startsWith(ev.profileId + '|')) stopRecording(ev.profileId, k.slice(ev.profileId.length + 1), 'record off').catch(() => { }); } }
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
    const r = rt();
    if (!r) return { ok: false, code: 'unavailable', error: 'no runtime' };
    const rel = T.recordingFileFor({ profileId, sessionId: sessionId || browserKey, at: now() });
    const file = path.join(recRoot, rel);
    try { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); } catch (e) { return { ok: false, code: 'dir_unwritable', error: e.message }; }
    const res = await r.exec(B.sessionNameFor(profileId), ['record', 'start', file], { dir: p.dir, session: B.sessionNameFor(browserKey), timeout: 20000 });
    if (!res.ok) { const why = (res.error || res.stderr || res.stdout || '').trim().slice(0, 300); recordingRefusals.set(profileId, { code: 'record_failed', error: why, at: now() }); log.warn?.(`[browser-trace] record start failed for ${profileId}: ${why}`); return { ok: false, code: 'record_failed', error: why }; }
    const st = { profileId, browserKey, sessionId: sessionId || null, file: rel, since: now() };
    recordings.set(key, st);
    recordingRefusals.delete(profileId);
    log.log?.(`[browser-trace] recording ${profileId} (${browserKey}) → ${rel}`);
    try { keeper.list && bc({ type: 'browser-profiles-updated', ...keeper.list() }); } catch { /* */ }
    return { ok: true, ...st };
  }
  async function stopRecording(profileId, browserKey, why = 'stop') {
    const key = `${profileId}|${browserKey}`;
    const st = recordings.get(key);
    if (!st) return { ok: false, code: 'not_recording' };
    recordings.delete(key);
    const r = rt(); const p = keeper ? keeper.profile(profileId) : null;
    let res = null;
    if (r && p) { try { res = await r.exec(B.sessionNameFor(profileId), ['record', 'stop'], { dir: p.dir, session: B.sessionNameFor(browserKey), timeout: 20000 }); } catch (e) { res = { ok: false, error: String(e && e.message) }; } }
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
    if (anyOf && (sessionId || browserKey)) hits = hits.filter((e) => (sessionId && e.sessionId === sessionId) || (browserKey && e.browserKey === browserKey));
    else if (browserKey) hits = hits.filter((e) => e.browserKey === browserKey);
    hits.sort((a, b) => a.at - b.at);
    const n = Math.max(1, Math.min(1000, Number(limit) || 200));
    return hits.length > n ? hits.slice(hits.length - n) : hits;
  }
  function entry(id) { if (!T.isEntryId(id)) return null; if (!byId.has(id)) for (const sc of scopes()) { loadIndex(sc); if (byId.has(id)) break; } const h = byId.get(id); return h ? h.entry : null; }
  function framePath(id, which) {
    const e = entry(id);
    if (!e) return null;
    const f = which === 'before' ? e.before : e.after;
    if (!f || !f.file) return null;
    return path.join(scopeDir(e.scope || e.profileId || T.EPHEMERAL_SCOPE), f.file);
  }

  // ── retention ──
  function sweep() {
    const t = now();
    const groups = scopes().map((sc) => ({ key: sc, entries: loadIndex(sc).map((e) => ({ id: e.id, at: e.at, bytes: entryBytes(e) })) }));
    const plan = T.traceRetentionPlan({ groups, now: t });
    let removedFiles = 0;
    for (const sc of new Set(plan.remove.map((r) => r.key))) {
      const gone = new Set(plan.remove.filter((r) => r.key === sc).map((r) => r.id));
      const kept = [];
      for (const e of loadIndex(sc)) {
        if (!gone.has(e.id)) { kept.push(e); continue; }
        byId.delete(e.id);
        for (const f of [`${e.id}.json`, e.before && e.before.file, e.after && e.after.file]) { if (!f) continue; try { fs.unlinkSync(path.join(scopeDir(sc), f)); removedFiles++; } catch { /* gone already */ } }
      }
      rewriteIndex(sc, kept);
    }
    // recordings: the same rule per profile (age, then size) over the files themselves
    const recRemoved = [];
    let recDirs = [];
    try { recDirs = fs.readdirSync(recRoot).filter((n) => B.isProfileId(n)); } catch { recDirs = []; }
    for (const pid of recDirs) {
      const files = recordingsOf(pid).filter((f) => !f.live).map((f) => ({ id: f.file, at: f.mtime, bytes: f.bytes }));
      const rp = T.traceRetentionPlan({ groups: [{ key: pid, entries: files }], now: t });
      for (const r of rp.remove) { try { fs.unlinkSync(path.join(recRoot, pid, r.id)); recRemoved.push({ profileId: pid, file: r.id, why: r.why, bytes: r.bytes }); } catch { /* */ } }
    }
    lastSweep = { at: t, removed: plan.remove.length, bytesRemoved: plan.bytesRemoved, recordingsRemoved: recRemoved.length, recordingBytesRemoved: recRemoved.reduce((s, r) => s + r.bytes, 0), kept: plan.kept };
    if (plan.remove.length || recRemoved.length) log.log?.(`[browser-trace] sweep: ${plan.remove.length} trace entr${plan.remove.length === 1 ? 'y' : 'ies'} (${Math.round(plan.bytesRemoved / 1024)} KB) + ${recRemoved.length} recording(s) removed — ${[...plan.remove, ...recRemoved].slice(0, 5).map((r) => r.why).join('; ')}${plan.remove.length + recRemoved.length > 5 ? '; …' : ''}`);
    bc({ type: 'browser-housekeeping-updated', sweep: lastSweep });
    return { ...lastSweep, plan, recordings: recRemoved };
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
  async function forgetProfile(id) {
    if (!keeper) throw namedError('unavailable', 'no keeper');
    const p = keeper.profile(id);
    const reg = keeper._reg();
    const v = T.forgetVerdict({ profile: p, leases: reg.leases, browsers: reg.browsers });
    if (!v.ok) throw namedError(v.code, v.error);
    for (const tp of [...taps.values()]) if (tp.profileId === id) unwatch({ sessionId: tp.sessionId, profileId: id });
    const bytes = sizeCache.get(p.dir) ? sizeCache.get(p.dir).bytes : null;
    let to = null;
    let exists = false; try { exists = fs.statSync(p.dir).isDirectory(); } catch { exists = false; }
    if (exists) { to = T.forgottenDirName(p.dir, now()); try { fs.renameSync(p.dir, to); } catch (e) { throw namedError('forget_failed', `could not move ${p.dir} aside (${e.message}) — nothing was removed`); } }
    const row = fileForgotten({ profileId: id, label: p.label, dir: p.dir, to, bytes, why: exists ? 'forgotten by the user (directory moved aside, never deleted by itself)' : 'forgotten by the user (its directory was already gone)' });
    const r = keeper.removeProfile(id);
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
      r.trace = T.scopeDigest(loadIndex(r.id));
      r.recordings = recordingsOf(r.id);
      r.recordingBytes = r.recordings.reduce((s, f) => s + f.bytes, 0);
      r.recording = [...recordings.values()].find((x) => x.profileId === r.id) || null;
      r.recordingRefused = recordingRefusals.get(r.id) || null;
    }
    const eph = { scope: T.EPHEMERAL_SCOPE, trace: T.scopeDigest(loadIndex(T.EPHEMERAL_SCOPE)) };
    const o = await orphans();
    // takeover C3: every managed ephemeral browser — the record, whose conversation, its state (the panel's Stop is the profile stop route)
    const ephemeralBrowsers = keeper && typeof keeper.ephemerals === 'function' ? keeper.ephemerals() : [];
    return { profiles: rows, ephemeral: eph, ephemeralBrowsers, orphans: o.orphans, orphansBase: o.base, orphansWhy: o.why || null, forgotten: loadForgotten().slice().reverse(), sweep: lastSweep,
      limits: { retentionMs: T.TRACE_RETENTION_MS, bytesPerProfile: T.TRACE_BYTES_PER_PROFILE, staleDays: T.STALE_PROFILE_DAYS, graceMs: T.INFLIGHT_GRACE_MS, recordingFloor: T.RECORDING_FLOOR },
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
      // takeover C3: a managed ephemeral browser's lease arms nothing here (its trace scope is `ephemeral`, armed by the live view's tap)
      for (const l of reg.leases) { if (typeof keeper.isEphemeral === 'function' && keeper.isEphemeral(l.profileId)) continue; const rec = reg.browsers[l.profileId]; if (rec && rec.state === 'ready' && l.sessionId) { const r = await watch({ sessionId: l.sessionId, profileId: l.profileId }); if (r.ok) armed++; maybeStartRecording(l.profileId, l.browserKey, l.sessionId).catch(() => { }); } }
    }
    let sw = null; try { sw = sweep(); } catch (e) { log.warn?.(`[browser-trace] boot sweep failed: ${e && e.message}`); }
    if (!timer && sweepEveryMs > 0) { timer = setInterval(() => { try { sweep(); } catch (e) { log.warn?.(`[browser-trace] sweep failed: ${e && e.message}`); } }, sweepEveryMs); if (timer.unref) timer.unref(); }
    return { armed, sweep: sw ? { removed: sw.removed, recordingsRemoved: sw.recordingsRemoved } : null };
  }
  function install() { if (keeper && typeof keeper.onLease === 'function' && !unsubLease) unsubLease = keeper.onLease(onLeaseEvent); if (keeper && typeof keeper.addDigest === 'function') keeper.addDigest(digest); }
  function shutdown() { if (timer) clearInterval(timer); timer = null; for (const tp of [...taps.values()]) unwatch({ sessionId: tp.sessionId, profileId: tp.profileId }); try { unsubLease?.(); } catch { /* */ } unsubLease = null; }

  return {
    enabled, watch, unwatch, list, entry, framePath, sweep, housekeeping, orphans, forgetProfile, forgetOrphan, deleteForgotten, adoptOrphan,
    maybeStartRecording, stopRecording, recordingsOf, recordingPath, digest, boot, install, shutdown,
    traceRoot, recRoot, forgottenFile, abBase, _taps: taps, _recordings: recordings, _onRecord: onRecord, _lastSweep: () => lastSweep,
  };
}

module.exports = { create, SWEEP_EVERY_MS, INDEX_FILE };
