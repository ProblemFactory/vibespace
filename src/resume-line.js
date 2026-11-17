'use strict';
/**
 * THE ONE LINE OF RESUMES NOBODY PRESSED — PURE (the manager design's piece 4, 主开发 2026-11-17; design int359/majordomo «The
 * verbs», conversations.resume). Every resume nobody pressed — the automation verb `conversations.resume` now, deliveries that
 * resume their addressee later — waits its turn on ONE line, and at most MAX_STARTS of them start at a time: a resume runs the
 * page's own create on the hub (a pre-resume read, a continuity check, a CLI spawn), so ten at once would be the storm lane
 * resume-all-paced cured for a person's «Resume all». The constant stands until one resume's hold of the loop is measured.
 *
 * The arithmetic only — the ORCH twin (src/server/resume-line.js) holds the one line of the hub and runs the starts. An entry is
 * `{ id, target, by }`: `target` the conversation key (`backend:conversation id` — the list's key), `by` who asked (an automation
 * key id). A target already running or waiting JOINS it (one resume per conversation — inbox-reopen's in-flight map is the one
 * dedupe below it). One asker's waiting entries beyond PER_ASKER_MAX are refused by name (`line_full`, with the count).
 * No idle clock: an entry starts when a start before it ENDED — or when one start passed its bound (START_BOUND_MS, 主开发's must
 * 4: a start that never answers would hold its place for ever; the ORCH line frees it and says so).
 * The line paces the resumes NOBODY PRESSED; a person's own resumes never enter it (a page paces its own).
 */
const MAX_STARTS = 2;       // at most two starts at a time (piece 4's constant — until a resume's loop hold is measured)
const PER_ASKER_MAX = 10;   // one asker's WAITING resumes beyond this are refused by name
const START_BOUND_MS = 180 * 1000;   // ONE start's bound: twice the create's own known bound (conversation-ops OPEN_TIMEOUT_MS, 90 s) — the discovery read before it, then the create

function emptyLine() { return { running: [], waiting: [] }; }

/** Put `entry` in line. → {ok:true, position (0 = starts now or running), joined?:true} | {ok:false, code:'line_full', count} */
function enqueue(line, entry, { perAskerMax = PER_ASKER_MAX } = {}) {
  const same = (e) => e.target === entry.target;
  const r = line.running.find(same);
  if (r) return { ok: true, joined: true, id: r.id, position: 0 };
  const wi = line.waiting.findIndex(same);
  if (wi >= 0) return { ok: true, joined: true, id: line.waiting[wi].id, position: wi + 1 };
  const mine = line.waiting.filter((e) => e.by === entry.by).length;
  if (entry.by != null && mine >= perAskerMax) return { ok: false, code: 'line_full', count: mine };
  line.waiting.push({ id: entry.id, target: entry.target, by: entry.by == null ? null : entry.by, payload: entry.payload || null });
  return { ok: true, id: entry.id, position: line.waiting.length };
}

/** The entries that may start NOW (moved from waiting to running): while fewer than maxStarts run, the first waiting. */
function takeStartable(line, { maxStarts = MAX_STARTS } = {}) {
  const out = [];
  while (line.running.length < maxStarts && line.waiting.length) {
    const e = line.waiting.shift();
    line.running.push(e);
    out.push(e);
  }
  return out;
}

/** A start ENDED (created, refused, failed — any end): its place frees. → the line */
function finished(line, id) {
  line.running = line.running.filter((e) => e.id !== id);
  return line;
}

/** Where an entry stands: 0 running, n ≥ 1 the n-th waiting, -1 not in line */
function positionOf(line, id) {
  if (line.running.some((e) => e.id === id)) return 0;
  const i = line.waiting.findIndex((e) => e.id === id);
  return i < 0 ? -1 : i + 1;
}

/** A RESUME NOBODY PRESSED MUST NOT START A TURN NOBODY PRESSED (主开发's ruling, 2026-11-17 02:23Z; the cure round's must 1). From the
 *  conversation's KEPT RECORD (`facts`: goal 'active' | 'none' | 'unknown' — 'none' only when a record STATED it — queue (the count
 *  of a queue really READ, or null: on a row that continues by itself an unread queue refuses — queue_unknown), timerMark true | null, mode 'chat' | 'terminal' | null, archived) and its harness's declared row (`harness`:
 *  `resumeContinues` — 'goal': a resume continues an active goal by itself; 'nothing': read to start nothing; and `headless`: the
 *  harness has a chat road, the only one the headless resume runs). A row that declares neither value is refused whatever the
 *  goal says. → {ok:true} | {ok:false, code, why}. A person's own press is not judged here. */
const DECLARED = new Set(['nothing', 'goal']);
function resumeVerdict(facts = {}, harness = {}) {
  const f = facts || {}, h = harness || {};
  const door = 'a person can resume it from its window';
  if (f.archived) return { ok: false, code: 'archived', why: 'that conversation is archived — un-archiving it is the person\'s' };
  if (h.headless === false || f.mode === 'terminal') return { ok: false, code: 'needs_a_page', why: h.headless === false ? 'this harness has no chat road — it resumes only in a window a person opens' : 'it ran in a terminal window — it resumes only in a window a person opens' };
  if (!DECLARED.has(h.resumeContinues)) return { ok: false, code: 'harness_unread', why: `this harness has not declared what its resume does by itself — ${door}` };
  if (f.goal === 'active') return { ok: false, code: 'goal_active', why: `resuming it would continue its goal — a billed turn; ${door}` };
  if (f.timerMark === true) return { ok: false, code: 'timer_marked', why: `it set a CLI timer, and whether that timer is still due cannot be seen — resuming it could start a billed turn; ${door}` };
  if (f.queue == null && h.resumeContinues === 'goal') return { ok: false, code: 'queue_unknown', why: `its kept record does not say its thread's queue was read, and this harness runs what waits there by itself when resumed — a billed turn nobody typed; ${door}` };
  if (Number.isInteger(f.queue) && f.queue > 0) return { ok: false, code: 'queue_kept', why: `${f.queue} message${f.queue === 1 ? '' : 's'} still wait${f.queue === 1 ? 's' : ''} in its thread's queue, and a resume could run them — a billed turn nobody typed; ${door}` };
  if (f.goal !== 'none' && h.resumeContinues === 'goal') return { ok: false, code: 'goal_unknown', why: `its kept record does not state whether a goal is active, and this harness continues an active goal by itself when resumed — a billed turn; ${door}` };
  return { ok: true };
}

/** The harness half of the verdict from its capability row (src/backend-caps.js capsOf): its declared `resumeContinues`, and
 *  `headless` — a chat stream to parse (the headless resume starts chat only; a terminal-only harness has none). */
function harnessRowOf(caps) {
  const c = caps || {};
  return { resumeContinues: c.resumeContinues, headless: !c.terminalOnly && !!c.streamProtocol };
}

/** The desktop of the row that shows conversation `sessionKey` (`backend:id`) in the hub's layouts (data/layouts.json: each desktop's
 *  autoSave window list) → {id, name} — the first in the desktops' own order — or null: no row anywhere, so no page makes a window
 *  for it (the hub never picks a desktop). Read only. */
function rowDesktopOf(layouts, sessionKey) {
  const key = String(sessionKey || ''), at = key.indexOf(':');
  if (at <= 0 || !layouts || typeof layouts !== 'object') return null;
  const backend = key.slice(0, at), id = key.slice(at + 1);
  const desks = (layouts.desktops && typeof layouts.desktops === 'object') ? layouts.desktops : {};
  const meta = Array.isArray(layouts.desktopMeta) ? layouts.desktopMeta : [];
  const order = [...meta.map((m) => m && m.id).filter((d) => d && Object.hasOwn(desks, d)), ...Object.keys(desks).filter((d) => !meta.some((m) => m && m.id === d))];
  const shows = (w) => {
    if (!w || typeof w !== 'object') return false;
    const o = (w.openSpec && typeof w.openSpec === 'object') ? w.openSpec : {};
    const cid = w.backendSessionId || w.claudeSessionId || o.backendSessionId || o.claudeSessionId || null;
    return cid === id && (w.backend || o.backend || 'claude') === backend;
  };
  for (const d of order) {
    const wins = desks[d] && desks[d].autoSave && Array.isArray(desks[d].autoSave.windows) ? desks[d].autoSave.windows : [];
    if (wins.some(shows)) { const m = meta.find((x) => x && x.id === d); return { id: d, name: (m && typeof m.name === 'string' && m.name) || null }; }
  }
  return null;
}

module.exports = { MAX_STARTS, PER_ASKER_MAX, START_BOUND_MS, emptyLine, enqueue, takeStartable, finished, positionOf, resumeVerdict, harnessRowOf, rowDesktopOf };
