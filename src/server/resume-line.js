'use strict';
/**
 * THE ONE LINE OF RESUMES NOBODY PRESSED — ORCH (the manager design's piece 4, 主开发 2026-11-17). The hub's single line; the
 * arithmetic is PURE src/resume-line.js. `start(entry)` runs one resume (conversation-ops' resume verb: inbox-reopen's headless
 * create — the page's own resume road, nothing sent); each next entry starts when a start before it ENDED (created, refused,
 * failed — any end, a throw included: the place frees and the line moves). At most MAX_STARTS at a time. A person's own resumes
 * never enter it (a page paces its own: src/lib/resume-pacer.js) — the line paces the resumes NOBODY PRESSED.
 * ONE START HAS A BOUND (主开发's must 4): a start that has not answered in `startBoundMs` (START_BOUND_MS) frees its place, says
 * one named line and answers its asker with the reason — a bound on one start, never an idle clock; a late answer is dropped
 * (inbox-reopen's in-flight map still keeps one conversation from starting twice).
 * `ready` (a promise): nothing starts before it settles — server.js resolves it once the boot ADOPTED the live sessions, the
 * keepers' re-adopted ones included (its 8 s re-adoption settled, resolved or thrown), so a resume never races the adoption of a
 * conversation still running.
 *
 * THE JOIN'S CONTRACT (for every road that enters this line — the verb now, a delivery's wake later): a submit for a conversation
 * already running or waiting in line does NOT start it again — it answers `joined: true` and the SAME result promise as the entry
 * already there: that entry's start answer, in THAT entry's shape (a resume's {ok, sessionId, …}, a wake's own run answer). A
 * joining asker therefore never reads the answer as its own: when the join's end comes it RE-LOOKS at the conversation (is it
 * live now? what do its facts say?) and acts on that.
 * createResumeLine({ start, ready, startBoundMs }) → { submit({target, by, payload}), state() }.
 *   submit — `payload` rides to `start(entry)` (the resume's cwd, host and asker)
 *          → { ok:true, position (0 = started now), joined (the conversation was already in line), result: Promise<start's answer> }
 *          | { ok:false, code:'line_full', count } (one asker's waiting resumes past PER_ASKER_MAX).
 * startThrough(road) → the hub's `start`: road.reopen (inbox-reopen's reopen, bound by server.js once built) with the entry's
 *   conversation key, folder and host, asked by the entry's actor; no road yet ⇒ refused by name.
 * sidecarNameOf(kept) / keptFacts(kept, sidecar) → an ended conversation's facts for the verdict (below) — THE READER of the kept
 *   record; its WRITER is piece 3's (lane conversation-facts: an end's record, written after the kill — 主开发's ruling 14:51Z).
 * factsReaderOver({buffersDir, road, readJson}) → the verb's `resumeFactsOf(key)` — `road.kept` = boot-restore keptRecordOf (bound
 *   by server.js), `readJson(path)` = the wiring's async reader (this module reads no file itself).
 */
const path = require('path');
const L = require('../resume-line.js');

function createResumeLine({ start, ready = null, maxStarts = L.MAX_STARTS, perAskerMax = L.PER_ASKER_MAX, startBoundMs = L.START_BOUND_MS, log = console.log,
  setTimer = (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; }, clearTimer = (t) => clearTimeout(t) } = {}) {
  const line = L.emptyLine();
  let open = !ready;
  if (ready) Promise.resolve(ready).then(() => { open = true; pump(); }, (err) => log(`[resume-line] the boot gate failed: ${(err && err.message) || err} — the line stays shut`));
  const ends = new Map(); // entry id → { promise, resolve } — every asker of one conversation hears the same end
  let seq = 0;

  function pump() {
    if (!open) return;
    for (const e of L.takeStartable(line, { maxStarts })) {
      let settled = false, timer = null;
      const end = (r, late) => {
        if (settled) { if (late) log(`[resume-line] ${e.target}: its start answered after its bound — dropped (${(r && r.ok) ? 'it started' : (r && r.why) || 'refused'})`); return; }
        settled = true;
        if (timer) clearTimer(timer);
        L.finished(line, e.id);
        if (r && r.ok === false) log(`[resume-line] ${e.target}: did not start — ${String(r.why || 'no reason given').slice(0, 300)}`);
        const d = ends.get(e.id); ends.delete(e.id);
        if (d) d.resolve(r);
        try { pump(); } catch (err) { log(`[resume-line] the line could not move on: ${err.message}`); }
      };
      if (Number.isFinite(startBoundMs) && startBoundMs > 0) {
        timer = setTimer(() => {
          const why = `the start did not answer in ${startBoundMs >= 1000 ? Math.round(startBoundMs / 1000) + ' s' : startBoundMs + ' ms'} — its place in line is freed`;
          end({ ok: false, why });
        }, startBoundMs);
      }
      Promise.resolve()
        .then(() => start(e))
        .then((r) => r, (err) => ({ ok: false, why: (err && err.message) || String(err) }))
        .then((r) => end(r, true));
    }
  }

  function submit({ target, by = null, payload = null } = {}) {
    const id = 'resume-' + (++seq);
    const q = L.enqueue(line, { id, target: String(target || ''), by, payload }, { perAskerMax });
    if (!q.ok) return { ok: false, code: q.code, count: q.count };
    let d = ends.get(q.id);
    if (!d) { let resolve; const promise = new Promise((r) => { resolve = r; }); d = { promise, resolve }; ends.set(q.id, d); }
    pump();
    return { ok: true, position: L.positionOf(line, q.id), joined: !!q.joined, result: d.promise };
  }

  function state() { return { running: line.running.length, waiting: line.waiting.length, open }; }

  return { submit, state };
}

/** The name of a kept record's wrapper sidecar (BUFFERS_DIR/<name>.json): its webui id as boot-restore names it — meta.webuiSessionId,
 *  else sess-<n> of cw-<n>; a name that is not a plain file name ⇒ null (never read). */
const plainName = (n) => typeof n === 'string' && /^[A-Za-z0-9._-]+$/.test(n) && !n.includes('..');
function sidecarNameOf(k) {
  if (!k || !k.meta) return null;
  const n = k.meta.webuiSessionId || ('sess-' + String(k.sockFile || '').replace(/^cw-/, '').replace(/\.orphan$/, ''));
  return plainName(n) ? n : null;
}

/** A goal as a record STATES it (主开发's must 1: «no goal stated» is not «no goal»): `src` names the goal only when it HOLDS the key
 *  (`goal` or `goalStatus` — the codex wrapper writes them only after its goal read succeeded; a sidecar that never heard is
 *  silent) → 'active' | 'none' | 'unknown'. */
const GOAL_DONE = new Set(['complete', 'paused', 'cleared']);
function statedGoal(src) {
  if (!src || typeof src !== 'object' || !(Object.hasOwn(src, 'goal') || Object.hasOwn(src, 'goalStatus'))) return 'unknown';
  const status = src.goalStatus || (src.goal ? 'active' : null);
  return status === 'active' ? 'active' : (status == null || GOAL_DONE.has(status)) ? 'none' : 'unknown';
}
/** The thread queue a record STATES — only when the queue was really READ (主开发's ruling 14:51Z: the codex wrapper starts its
 *  sidecar with an empty `queue` before any thread/queue/list answered, so an empty list alone is no fact): an end's record says
 *  `queueRead: true` with its `queueCount`; a wrapper's sidecar carries `queueReadAt` (when a fresh list answered) beside `queue`.
 *  → the count, or null (not read: unknown) */
function statedQueue(src, { ended = false } = {}) {
  if (!src || typeof src !== 'object') return null;
  if (ended) return src.queueRead === true && Number.isInteger(src.queueCount) && src.queueCount >= 0 ? src.queueCount : null;
  return Number.isFinite(src.queueReadAt) && Array.isArray(src.queue) ? src.queue.length : null;
}
/** An end's record states its goal by `goalStated` (true only when the sidecar HELD the goal keys) and `goalStatus`. */
const endGoal = (at) => (at && at.goalStated === true ? statedGoal({ goalStatus: at.goalStatus == null ? null : at.goalStatus }) : 'unknown');

/** An ENDED conversation's facts for the resume verb, from its KEPT RECORD (`k` = boot-restore keptRecordOf: {sockFile, meta, id}).
 *  THE RECORD'S CONTRACT (主开发 14:51Z, piece 3 writes it): an END's record — reason «ended», `endedBy`, the time — carries
 *  `meta.endFacts` {goalStated, goalStatus, queueRead, queueCount} and the mode / folder / machine as of the end; a boot's record
 *  (a dead socket retired, «dead-socket-at-boot») reads its wrapper's sidecar (`wm`, the parsed sidecarNameOf(k) file, or null). The goal: 'active' | 'none' (STATED none only) | 'unknown'; the queue: its stated length or
 *  null; the timer mark is the design's one-way CLI timer mark (`meta.cliTimerMark` — NOTHING WRITES IT YET, so it cannot refuse
 *  today); the mode the wrapper's 'chat' else the meta's (boot-restore's own rule, default 'terminal'). What the record cannot
 *  say is UNKNOWN, never «none». */
function keptFacts(k, wm = null) {
  if (!k || !k.meta) return { goal: 'unknown', queue: null, timerMark: null, mode: null, cwd: null, hostId: null, kept: false };
  const m = k.meta;
  const at = m.endFacts && typeof m.endFacts === 'object' ? m.endFacts : null;
  if (!wm || typeof wm !== 'object') wm = null;
  return { goal: at ? endGoal(at) : statedGoal(wm), queue: at ? statedQueue(at, { ended: true }) : statedQueue(wm), timerMark: m.cliTimerMark === true ? true : null,
    mode: at ? (at.mode || m.mode || 'terminal') : (wm && wm.mode === 'chat') ? 'chat' : (m.mode || 'terminal'),   // an end's facts carry the mode, folder and machine as of the end
    cwd: (at && at.folder) || m.cwd || null, hostId: (at && at.machine) || m.host || null, kept: true, ended: !!at };
}

/** The verb's facts of an ended conversation: its kept record (an end's carries the facts as of the end — piece 3 writes it) and,
 *  for a boot's record, its wrapper's sidecar. */
function factsReaderOver({ buffersDir, road, readJson }) {
  return async (sessionKey) => {
    let k = null; try { k = road && typeof road.kept === 'function' ? await road.kept(sessionKey) : null; } catch { k = null; }
    const name = k && k.meta && k.meta.endFacts ? null : sidecarNameOf(k);
    let wm = null; if (name) { try { wm = await readJson(path.join(buffersDir, name + '.json')); } catch { wm = null; } }
    return keptFacts(k, wm);
  };
}

function startThrough(road) {
  return (e) => {
    const p = e.payload || {};
    if (!road || typeof road.reopen !== 'function') return Promise.resolve({ ok: false, why: 'this server cannot resume conversations yet (still booting) — try again in a moment' });
    return road.reopen({ sessionKey: e.target, cwd: p.cwd || '', hostId: p.hostId || undefined }, { by: p.actBy || null });
  };
}

module.exports = { createResumeLine, startThrough, keptFacts, sidecarNameOf, statedGoal, statedQueue, factsReaderOver };
