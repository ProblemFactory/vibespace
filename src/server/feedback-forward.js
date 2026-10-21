'use strict';
// AGENT FEEDBACK — THE ORIGIN'S FORWARD (lane feedback-forward; the rules are src/feedback-forward-model.js). Every NEW
// report this instance files (feedback-store `onNew` — a repeat that only bumps a count is not new) goes to the outbox
// (data/feedback-outbox.json, written whole through tmp + rename before anything is sent) when the instance has a
// forward target (`target()` = the telemetry forward URL + token: settings first, then the VIBESPACE_TELEMETRY_FORWARD_*
// env the fleet pods carry). No target ⇒ nothing is queued and nothing is sent. The pump sends the due reports ONE at a
// time, oldest first, to the hub's POST /api/feedback/forward (bearer = the forward token; X-VibeSpace-Feedback-Origin =
// this instance's origin key); a failure ends the pass and holds the outbox 1 min, then 2, 4 … 1 h after consecutive
// failed passes (any answer from the hub resets it); a refusal of the report itself (400 / 413 / 422) drops it, counted. The filing agent never waits: `enqueue` writes the outbox and returns; the send
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
 *  fetch / now / setTimeout / clearTimeout / log injectable (the suite runs two instances in one process on a fake clock) */
function create({ dataDir, target = () => ({}), instance = () => ({}), applyMarks = () => ({ applied: 0 }), backlog = () => [], fetch = globalThis.fetch, now = () => Date.now(), setTimeout: setT = setTimeout, clearTimeout: clearT = clearTimeout, log = () => { } }) {
  const file = path.join(dataDir, 'feedback-outbox.json');
  let state = { v: 1, key: null, queue: [], sent: 0, dropped: 0, refused: 0, fails: 0, holdUntil: 0, marksSince: 0, marksAt: 0, backfilled: false };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (raw && typeof raw === 'object') {
      state = {
        ...state,
        key: FF.KEY_RE.test(String(raw.key || '')) ? raw.key : null,
        queue: Array.isArray(raw.queue) ? raw.queue.filter((x) => x && typeof x.id === 'string' && x.body && typeof x.body === 'object').slice(-FF.LIMITS.outboxMax) : [],
        sent: Number(raw.sent) || 0, dropped: Number(raw.dropped) || 0, refused: Number(raw.refused) || 0, fails: Number(raw.fails) || 0, holdUntil: Number(raw.holdUntil) || 0,
        marksSince: Number(raw.marksSince) || 0, marksAt: Number(raw.marksAt) || 0, backfilled: raw.backfilled === true,
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
  const schedule = () => {
    if (stopped) return;
    if (timer) { clearT(timer); timer = null; }
    if (!state.queue.length) return;
    timer = setT(() => { timer = null; api.pump(); }, Math.max(0, state.holdUntil - now()));
    if (timer && typeof timer.unref === 'function') timer.unref();
  };

  const api = {};
  const push = (row) => {
    const inst = instance() || {};
    const p = FF.outboxPush(state.queue, { id: row.id, body: FF.wireBody(row, { instance: inst.name, version: inst.version }), tries: 0, firstAt: now() });
    state.queue = p.queue;
    state.dropped += p.dropped;
    if (p.dropped) log(`[feedback] the forward outbox is full (${FF.LIMITS.outboxMax}): ${p.dropped} oldest unsent report(s) dropped`);
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
      const out = { sent: 0, dropped: 0, retry: 0 };
      try {
        for (;;) {
          const d = doors();
          if (!d || stopped || now() < state.holdUntil) break;
          const item = state.queue.slice().sort((a, b) => (Number(a.firstAt) || 0) - (Number(b.firstAt) || 0))[0];
          if (!item) break;
          let status = 0, why = '';
          try {
            const res = await fetch(d.forward, { method: 'POST', headers: headers(d), body: JSON.stringify(item.body), signal: AbortSignal.timeout(FF.LIMITS.sendTimeoutMs) });
            status = res.status;
            if (status >= 300) why = String(((await res.json().catch(() => ({}))) || {}).code || status);
          } catch (e) { why = failWord(e); }
          const v = FF.sendVerdict(status);
          const i = state.queue.indexOf(item);
          if (v === 'sent' || v === 'drop') {
            if (i >= 0) state.queue.splice(i, 1);
            state.fails = 0; state.holdUntil = 0;   // the hub answered
            if (v === 'sent') { state.sent++; out.sent++; } else { state.refused++; out.dropped++; log(`[feedback] the hub refused report ${item.id} (${why}) — dropped`); }
            save();
            continue;
          }
          item.tries = (Number(item.tries) || 0) + 1;
          item.lastWhy = why;
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
      if (!d) return { ok: false, why: 'no_target', applied: 0 };
      let applied = 0, pages = 0;
      try {
        for (; pages < FF.LIMITS.marksPages; pages++) {
          const res = await fetch(`${d.marks}?since=${encodeURIComponent(String(state.marksSince))}`, { headers: headers(d), signal: AbortSignal.timeout(FF.LIMITS.sendTimeoutMs) });
          if (res.status !== 200) return { ok: false, why: String(res.status), applied };
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
  /** this instance's own origin id (the hub refuses a forward from itself — a hub whose target is itself) */
  api.keyId = () => (state.key ? keyIdOf(state.key) : null);
  /** the counters (⚙ Diagnostics / the suite) — never the key */
  api.facts = () => ({ target: !!doors(), queued: state.queue.length, sent: state.sent, dropped: state.dropped, refused: state.refused, fails: state.fails, marksSince: state.marksSince, marksAt: state.marksAt, nextAt: state.queue.length ? Math.max(now(), state.holdUntil) : null });
  api.file = file;
  return api;
}

module.exports = { create, keyIdOf, HEADER };
