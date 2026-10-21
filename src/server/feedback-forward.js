'use strict';
// AGENT FEEDBACK — THE ORIGIN'S FORWARD (lane feedback-forward; the rules are src/feedback-forward-model.js). Every NEW
// report this instance files (feedback-store `onNew` — a repeat that only bumps a count is not new) goes to the outbox
// (data/feedback-outbox.json, written whole through tmp + rename before anything is sent) when the instance has a
// forward target (`target()` = the telemetry forward URL + token: settings first, then the VIBESPACE_TELEMETRY_FORWARD_*
// env the fleet pods carry). No target ⇒ nothing is queued and nothing is sent. The pump sends the due reports ONE at a
// time, oldest first, to the hub's POST /api/feedback/forward (bearer = the forward token; X-VibeSpace-Feedback-Origin =
// this instance's origin key); a failure ends the pass and holds the outbox 1 min, then 2, 4 … 1 h after consecutive
// failed passes (any answer from the hub resets it); a refusal of the report itself (400 / 413 / 422) drops it, counted.
// THE NO-DOOR PAUSE (lane feedback-forward-404 — the fleet's target is the cluster's telemetry COLLECTOR, which has no
// feedback door: every pod retried each report hourly for ever, never said): a door that answers «not here» (404 / 405 /
// 501, the forward door or the marks door) PAUSES the outbox for that target — persisted (`pause.pausedUntil`, the reason),
// asked again ONCE a day, or at once when the target URL or the version it answers (VERSION_HEADER, also off the telemetry
// forward's own answers: `noteAnswer`) changes; the reports stay queued (the bound drops the oldest, by id, said) and a
// target that gains the door catches up. Said ONCE per pause: the log line, and ONE low For-you notice only when a person
// set telemetry.forwardUrl on this instance (`personSet`; a cluster-env target is the fleet admin's — the line only);
// `forwardOf(id)` tells the filer's `vibespace-feedback list`. The filing agent never waits: `enqueue` writes the outbox and returns; the send
// runs on a timer. THE MARK-BACK is a PULL (the hub has no door into an origin): at boot + 1 min and every 6 h the origin
// asks GET /api/feedback/forward/marks?since=<cursor> with the same two credentials and applies each mark to its own
// record (`applyMarks` — the filing agent's `vibespace-feedback list` then says «handled in 2.369.NNN»). The outbox
// survives a restart: `start()` sends what a crash or a stop left. THE BACKFILL: the first time this instance has a target
// (at start or at its first new report), the OPEN reports already on file (`backlog()` — filed before this build, or
// before the target was set) are queued once, oldest first, inside the same bound. ORCH tier.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FF = require('../feedback-forward-model.js');

const HEADER = 'X-VibeSpace-Feedback-Origin';
const NOTICE_KEY = 'feedback-forward';   // lane feedback-forward-404: the For-you key of the no-door notice (one per target)
const DOOR_TAIL = '/api/feedback/forward';
/** the hub's name for an origin key (its sha256, 16 hex) — the key itself never leaves the origin's outbox file */
const keyIdOf = (key) => crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16);
/** a failed request in a word: timeout / the socket's code / its message */
const failWord = (err) => (err && err.name === 'TimeoutError' ? 'timeout' : String((err && (err.code || err.message)) || 'unreachable'));

function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** deps: dataDir; target() → {url, token}; instance() → {name, version}; applyMarks(marks) → {applied} (the store's);
 *  backlog() → the OPEN own reports (public rows) the first target forwards once;
 *  lane feedback-forward-404: personSet() → the target is THIS instance's setting (a person's), not the cluster's env;
 *  userTodos → the For-you store (or a getter of it) the no-door notice is filed in;
 *  fetch / now / setTimeout / clearTimeout / log injectable (the suite runs two instances in one process on a fake clock) */
function create({ dataDir, target = () => ({}), instance = () => ({}), applyMarks = () => ({ applied: 0 }), backlog = () => [], personSet = () => false, userTodos = null, fetch = globalThis.fetch, now = () => Date.now(), setTimeout: setT = setTimeout, clearTimeout: clearT = clearTimeout, log = () => { } }) {
  const file = path.join(dataDir, 'feedback-outbox.json');
  let state = { v: 1, key: null, queue: [], sent: 0, dropped: 0, refused: 0, fails: 0, holdUntil: 0, marksSince: 0, marksAt: 0, backfilled: false, pause: null, targetVersion: null, lost: [] };
  const str = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);
  const pauseOf = (p) => (p && typeof p === 'object' && typeof p.door === 'string' && p.door
    ? { door: p.door, target: String(p.target || ''), version: str(p.version, 40), status: Number(p.status) || 0, reason: 'no-door', since: Number(p.since) || 0, pausedUntil: Number(p.pausedUntil) || 0, probes: Number(p.probes) || 0, todoId: str(p.todoId, 80) }
    : null);
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (raw && typeof raw === 'object') {
      state = {
        ...state,
        key: FF.KEY_RE.test(String(raw.key || '')) ? raw.key : null,
        queue: Array.isArray(raw.queue) ? raw.queue.filter((x) => x && typeof x.id === 'string' && x.body && typeof x.body === 'object').slice(-FF.LIMITS.outboxMax) : [],
        sent: Number(raw.sent) || 0, dropped: Number(raw.dropped) || 0, refused: Number(raw.refused) || 0, fails: Number(raw.fails) || 0, holdUntil: Number(raw.holdUntil) || 0,
        marksSince: Number(raw.marksSince) || 0, marksAt: Number(raw.marksAt) || 0, backfilled: raw.backfilled === true,
        pause: pauseOf(raw.pause), targetVersion: str(raw.targetVersion, 40), lost: Array.isArray(raw.lost) ? raw.lost.filter((x) => typeof x === 'string').slice(-FF.LIMITS.outboxMax) : [],
      };
    }
  } catch { /* none yet (ENOENT) or unreadable: an empty outbox — the next report writes a whole file */ }
  let timer = null, marksTimer = null, pumping = null, pulling = null, stopped = false;
  const save = () => { try { writeJsonAtomic(file, state); return true; } catch (e) { log('[feedback] data/feedback-outbox.json not written:', e.message); return false; } };
  const doors = () => {
    const t = target() || {};
    const token = String(t.token || '').trim();
    const d = FF.forwardDoors(t.url);
    return d && token ? { ...d, token } : null;
  };
  const key = () => {
    if (!state.key) { state.key = 'fk_' + crypto.randomBytes(32).toString('base64url'); save(); }
    return state.key;
  };
  const headers = (d) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${d.token}`, [HEADER]: key() });
  // ── THE NO-DOOR PAUSE (lane feedback-forward-404) ──
  const todosOf = () => (typeof userTodos === 'function' ? userTodos() : userTodos);
  const waitingWord = () => `${state.queue.length} record${state.queue.length === 1 ? '' : 's'} waiting`;
  /** the version a target answered — only a PRESENT header moves it (a door that names none says nothing new) */
  const noteVersion = (res) => {
    const v = res && res.headers && typeof res.headers.get === 'function' ? str(res.headers.get(FF.VERSION_HEADER), 40) : null;
    if (!v || v === state.targetVersion) return false;
    state.targetVersion = v;
    return true;
  };
  const holds = (d) => FF.pauseHolds(state.pause, { door: d.forward, version: state.targetVersion }, now());
  /** the door answered «not here»: the pause starts — said ONCE — or, on a re-probe, goes on one more day (said nothing) */
  const pauseFor = (d, status) => {
    const again = !!state.pause && state.pause.door === d.forward;
    const p0 = again ? state.pause : null;
    state.pause = { door: d.forward, target: d.forward.slice(0, -DOOR_TAIL.length), version: state.targetVersion, status, reason: 'no-door', since: p0 ? p0.since : now(), pausedUntil: now() + FF.LIMITS.reprobeMs, probes: p0 ? p0.probes + 1 : 0, todoId: p0 ? p0.todoId : null };
    state.fails = 0; state.holdUntil = 0;   // the target answered: the backoff is not this
    if (again) return;
    const w = FF.pauseWords({ target: state.pause.target, status, waiting: state.queue.length });
    log(w.log);
    if (!personSet()) return;   // a cluster-env target is the fleet admin's, not the user's: the log line only
    const todos = todosOf();
    if (!todos) return;
    try {
      const r = todos.add(NOTICE_KEY, { origin: 'server', kind: 'notice', urgency: 'low', by: 'agent', sessionName: 'Agent feedback', text: w.text, detail: w.detail, i18n: w.i18n });
      state.pause.todoId = (r && (r.id || (r.item && r.item.id))) || null;
    } catch (e) { log('[feedback] the For-you notice of the paused forward was not filed:', e.message); }
  };
  /** the pause ends — the target took a report / answered its marks door (`why`), or it is no longer the target (null) */
  const unpause = (why) => {
    const p = state.pause;
    if (!p) return;
    state.pause = null;
    log(why ? `feedback forward resumed: ${p.target} ${why} — ${waitingWord()}` : `feedback forward: ${p.target} is no longer the target — its pause ends; ${waitingWord()}`);
    const todos = todosOf();
    if (p.todoId && todos) { try { const it = todos.get(p.todoId); if (it && it.status === 'open') todos.setStatus(p.todoId, 'done', 'feedback'); } catch { /* the store's own log */ } }
  };
  /** before a send or a pull: a pause for ANOTHER door (or none) ends; → the pause holds (no request) */
  const paused = (d) => {
    if (state.pause && (!d || state.pause.door !== d.forward)) { unpause(null); save(); }
    if (!d || !holds(d)) return false;
    return true;
  };
  /** the pause no longer holds (the day, the version): THIS request is the re-probe — claimed before it is sent */
  const claimProbe = () => {
    if (!state.pause) return false;
    state.pause.pausedUntil = now() + FF.LIMITS.reprobeMs;
    state.pause.version = state.targetVersion;
    save();
    return true;
  };
  const schedule = () => {
    if (stopped) return;
    if (timer) { clearT(timer); timer = null; }
    if (!state.queue.length) return;
    const d = doors();
    const at = Math.max(state.holdUntil, d && holds(d) ? state.pause.pausedUntil : 0);   // paused ⇒ the next day's re-probe
    timer = setT(() => { timer = null; api.pump(); }, Math.max(0, at - now()));
    if (timer && typeof timer.unref === 'function') timer.unref();
  };

  const api = {};
  const push = (row) => {
    const inst = instance() || {};
    const p = FF.outboxPush(state.queue, { id: row.id, body: FF.wireBody(row, { instance: inst.name, version: inst.version }), tries: 0, firstAt: now() });
    state.queue = p.queue;
    state.dropped += p.dropped;
    if (p.dropped) {   // lane feedback-forward-404: by id — the filer's `vibespace-feedback list` says it stayed here
      state.lost = [...state.lost.filter((x) => !p.gone.includes(x)), ...p.gone].slice(-FF.LIMITS.outboxMax);
      log(`[feedback] the forward outbox is full (${FF.LIMITS.outboxMax}): ${p.dropped} oldest unsent report(s) dropped — ${p.gone.join(', ')} stay on this instance only`);
    }
  };
  /** THE BACKFILL, once: the OPEN reports already on file, oldest first (the newest survive the bound) */
  const backfillOnce = () => {
    if (state.backfilled || !doors()) return 0;
    let rows = [];
    try { rows = (backlog() || []).filter((r) => r && r.id && r.status !== 'handled' && !r.origin).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0)); } catch (e) { log('[feedback] the backfill could not list the reports:', e.message); return 0; }
    for (const r of rows) push(r);
    state.backfilled = true;
    key();
    save();
    if (rows.length) log(`[feedback] ${rows.length} open report(s) filed before a forward target queued for the maintainer hub`);
    return rows.length;
  };
  /** a NEW report filed here → queued (never blocks the filer). → { queued, why? } */
  api.enqueue = (row) => {
    if (!row || !row.id) return { queued: false, why: 'no_report' };
    if (!doors()) return { queued: false, why: 'no_target' };
    backfillOnce();
    push(row);
    key();
    save();
    schedule();
    return { queued: true };
  };
  /** send the queued reports, oldest first, one at a time; the first failure ends the pass and holds the outbox (the hub is
   *  likely down): 1 min, 2, 4 … 1 h after consecutive failed passes */
  api.pump = () => {
    if (pumping) return pumping;
    pumping = (async () => {
      const out = { sent: 0, dropped: 0, retry: 0, paused: 0 };
      try {
        for (;;) {
          const d = doors();
          if (paused(d) || !d || stopped || now() < state.holdUntil) break;   // paused: no request till the re-probe
          const item = state.queue.slice().sort((a, b) => (Number(a.firstAt) || 0) - (Number(b.firstAt) || 0))[0];
          if (!item) break;
          const probe = claimProbe();
          let status = 0, why = '';
          try {
            const res = await fetch(d.forward, { method: 'POST', headers: headers(d), body: JSON.stringify(item.body), signal: AbortSignal.timeout(FF.LIMITS.sendTimeoutMs) });
            status = res.status;
            noteVersion(res);
            if (status >= 300) why = String(((await res.json().catch(() => ({}))) || {}).code || status);
          } catch (e) { why = failWord(e); }
          const v = FF.sendVerdict(status);
          const i = state.queue.indexOf(item);
          if (v === 'sent' || v === 'drop') {
            if (state.pause) unpause('took a report');   // the door is there: the queue catches up now
            if (i >= 0) state.queue.splice(i, 1);
            state.fails = 0; state.holdUntil = 0;   // the hub answered
            if (v === 'sent') { state.sent++; out.sent++; } else { state.refused++; out.dropped++; log(`[feedback] the hub refused report ${item.id} (${why}) — dropped`); }
            save();
            continue;
          }
          item.tries = (Number(item.tries) || 0) + 1;
          item.lastWhy = why;
          if (v === 'no-door') { pauseFor(d, status); out.paused++; save(); break; }
          if (probe) { out.retry++; save(); break; }   // the re-probe got no answer: the pause stands, asked again in a day
          state.fails += 1;
          state.holdUntil = now() + FF.backoffMs(state.fails);
          out.retry++;
          save();
          log(`[feedback] report ${item.id} not forwarded (${why}) — ${state.queue.length} waiting, again in ${Math.round(FF.backoffMs(state.fails) / 60e3)} min`);
          break;
        }
      } catch (e) { log('[feedback] the forward pass stopped:', e.message); }
      return out;
    })().finally(() => { pumping = null; schedule(); });
    return pumping;
  };
  /** THE MARK-BACK: ask the hub for the marks on this origin's reports since the cursor; apply each to the own record */
  api.pullMarks = () => {
    if (pulling) return pulling;
    pulling = (async () => {
      const d = doors();
      if (paused(d)) return { ok: false, why: 'paused', applied: 0 };   // lane feedback-forward-404: the same door family
      if (!d) return { ok: false, why: 'no_target', applied: 0 };
      claimProbe();
      let applied = 0, pages = 0;
      try {
        for (; pages < FF.LIMITS.marksPages; pages++) {
          const res = await fetch(`${d.marks}?since=${encodeURIComponent(String(state.marksSince))}`, { headers: headers(d), signal: AbortSignal.timeout(FF.LIMITS.sendTimeoutMs) });
          noteVersion(res);
          if (res.status !== 200 && FF.sendVerdict(res.status) === 'no-door') { pauseFor(d, res.status); save(); return { ok: false, why: 'no-door', status: res.status, applied }; }
          if (res.status !== 200) return { ok: false, why: String(res.status), applied };
          if (state.pause) { unpause('answered its feedback door'); save(); schedule(); }
          const a = await res.json();
          const marks = Array.isArray(a && a.marks) ? a.marks.slice(0, FF.LIMITS.marksPage) : [];
          applied += (applyMarks(marks) || {}).applied || 0;
          const next = Number(a.next);
          if (Number.isFinite(next) && next > state.marksSince) state.marksSince = next;
          state.marksAt = now();
          save();
          if (!a.more || !marks.length) break;
        }
        return { ok: true, applied, pages: pages + 1 };
      } catch (e) { const word = failWord(e); return { ok: false, why: word, applied }; }
    })().finally(() => { pulling = null; });
    return pulling;
  };
  /** boot: send what the outbox holds (a crash / a stop left it), the first pull 1 min later, then every 6 h */
  api.start = () => {
    stopped = false;
    backfillOnce();
    schedule();
    const every = (ms) => { if (stopped) return; marksTimer = setT(() => { api.pullMarks().catch(() => { }).finally(() => every(FF.LIMITS.marksEveryMs)); }, ms); if (marksTimer && typeof marksTimer.unref === 'function') marksTimer.unref(); };
    if (!marksTimer) every(FF.LIMITS.marksBootMs);
    return api;
  };
  api.stop = () => { stopped = true; if (timer) clearT(timer); if (marksTimer) clearT(marksTimer); timer = marksTimer = null; };
  /** lane feedback-forward-404: an answer the TELEMETRY forward got (src/telemetry.js onForwardAnswer) — the same target's
   *  VERSION_HEADER. A paused outbox asks again at once when the version moved (a hub updated to a build with the door
   *  catches up the same hour); a collector that names no version changes nothing. → true when the version moved */
  api.noteAnswer = (url, res) => {
    const d = doors(), t = FF.forwardDoors(url);
    if (!d || !t || t.forward !== d.forward || !noteVersion(res)) return false;
    save();
    schedule();
    return true;
  };
  /** a report's forward state, for its filer's `vibespace-feedback list`: 'paused' (queued; the target has no feedback
   *  door) | 'waiting' (queued) | 'dropped' (the outbox was full — it stays on this instance) | null (sent / never queued) */
  api.forwardOf = (id) => {
    if (state.queue.some((x) => x.id === id)) { const d = doors(); return state.pause && d && state.pause.door === d.forward ? 'paused' : 'waiting'; }
    return state.lost.includes(id) ? 'dropped' : null;
  };
  /** this instance's own origin id (the hub refuses a forward from itself — a hub whose target is itself) */
  api.keyId = () => (state.key ? keyIdOf(state.key) : null);
  /** the counters (⚙ Diagnostics / the suite) — never the key */
  api.facts = () => {
    const d = doors();
    const p = state.pause;
    return { target: !!d, queued: state.queue.length, sent: state.sent, dropped: state.dropped, refused: state.refused, fails: state.fails, marksSince: state.marksSince, marksAt: state.marksAt,
      paused: p ? { target: p.target, status: p.status, since: p.since, pausedUntil: p.pausedUntil, probes: p.probes, version: p.version } : null,
      nextAt: state.queue.length ? Math.max(now(), state.holdUntil, d && holds(d) ? p.pausedUntil : 0) : null };
  };
  api.file = file;
  return api;
}

module.exports = { create, keyIdOf, HEADER };
