'use strict';
/**
 * THE CONVERSATION ROW AND ITS END VERDICT — PURE (majordomo piece 2, lane conversation-facts; the design:
 * conversations.list, «the busy verdict»). No I/O, no clock, no require: the collector (src/server/conversation-facts.js)
 * gathers the facts; this file says what a row IS, how an unknown is worded, and whether an agent may end it.
 *
 * HOW UNKNOWN IS WRITTEN: a fact is a value, or null beside a `<fact>Why` sentence. Never blank, never 0, never «idle» for
 * a thing the hub does not know. `shapeRow` makes that true of every row it is handed (a fact it was handed no reason for
 * gets WHY.notCollected), so no reader has to guess.
 *
 * THE VERDICT: ONE function, `endVerdict(row)` — read by the list's `busy`, by the end verb (piece 3: one call) and by the
 * person's confirm. It reads ONLY `VERDICT_FIELDS` (the verdict's input type has no idle and no memory field — the suite
 * asserts it), no timer calls it, and an UNKNOWN fact is BUSY: it refuses with `<reason>_unknown` and the fact's reason.
 */

/** The reason sentences of an unknown fact (agent-facing: English, as the tree's rule says for verb answers). */
const WHY = Object.freeze({
  terminal: 'a terminal conversation publishes no turn',
  terminalNone: 'a terminal conversation publishes none of these facts',
  notRead: 'not read since the hub restarted',
  noHarnessBg: 'this harness does not report background tasks',
  noWrapper: 'no wrapper file',
  timerSet: 'it set a CLI timer; the hub cannot see whether one is still due',
  noTurnSeen: 'no turn seen',
  noRecord: 'no record kept',
  measuring: 'being measured — ask again',
  noProcess: 'no process found',
  otherMachine: 'on another machine — not measured there yet',
  timedOut: 'the facts pass ran out of time — ask again',
  notCollected: 'the hub did not collect this fact',
  notLive: 'the conversation is not running',
  oldWrapper: 'its wrapper is older than this record; it learns at its next start',
  oldCli: 'its CLI version does not report background tasks',
  turnRunning: 'a turn is running',
  noWakeGrant: 'this release reads no wake grant on a job yet',
});

// ── THE FACTS KEPT WHERE THEY ARE BORN (主开发's ruling 2026-11-17 02:26Z, road A) ──────────────────────────────────────
// A conversation's wrapper reads every record from its CLI's first line and outlives every hub restart, so IT keeps the
// three facts a restarted hub cannot read back: the last background set (or the empty set from the start, once the CLI's
// init names a version that publishes the level signal), the one-way timer mark, and the last record's time. ONE step
// function, called per record by the wrapper (data/bin/chat-wrapper.js) and by the hub's stdout consumer; it only updates
// memory and says whether the set or the mark CHANGED — the caller decides when to write (never a write per record).
/** The shape version a wrapper advertises (`meta.caps.facts`) and writes (`meta.facts.v`). */
const FACTS_VERSION = 1;
/** The first CLI version the tree records `system/background_tasks_changed` on (src/message-manager.js TASK_TYPE_MAP's
 *  note: «2.1.274's system/task_started + background_tasks_changed»). The binary's own text: «emitted whenever membership
 *  changes» — so a set never published from the CLI's start IS the empty set, on this version or later. */
const LEVEL_SINCE = '2.1.274';
/** Tool names that set a CLI timer — only the names the tree states (src/record-shape.js:341: «loop_wakeup (a
 *  ScheduleWakeup /loop wakeup)»); the cron road is stated without a tool name, so its FIRED record sets the mark. */
const TIMER_TOOLS = Object.freeze(['ScheduleWakeup']);
const BG_MAX = 100;

function versionAtLeast(v, min) {
  if (typeof v !== 'string' || !/^\d+(\.\d+)*/.test(v)) return false;
  const a = v.split(/[^\d]+/).filter(Boolean).map(Number), b = min.split('.').map(Number);
  for (let i = 0; i < b.length; i++) { const x = a[i] || 0; if (x !== b[i]) return x > b[i]; }
  return true;
}
/** A tracker for a CLI process read from its first line. `fromStart` is what allows the empty set and «none seen». */
function factsFresh() { return { v: FACTS_VERSION, fromStart: true, bg: null, timer: false, at: null, cli: null }; }
const bgOf = (tasks) => tasks.filter((t) => t && typeof t === 'object' && t.task_id != null).slice(0, BG_MAX)
  .map((t) => ({ id: String(t.task_id).slice(0, 64), type: typeof t.task_type === 'string' ? t.task_type.slice(0, 32) : null, description: typeof t.description === 'string' ? t.description.slice(0, 200) : '' }));
const sameBg = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x.id === b[i].id && x.type === b[i].type && x.description === b[i].description);
/**
 * One record → the tracker, in memory. Returns true when the background set or the timer mark CHANGED (the moments worth a
 * sidecar write); the record time alone is never a change. Any record counts for the time; only the CLI's own lines move
 * the set (a helper's records carry `parent_tool_use_id`, and the level signal is the main process's).
 */
function factsStep(st, rec, now) {
  if (!st || typeof st !== 'object' || !rec || typeof rec !== 'object') return false;
  if (Number.isFinite(now)) st.at = now;
  let changed = false;
  if (rec.type === 'system' && rec.subtype === 'init' && typeof rec.claude_code_version === 'string' && !rec.parent_tool_use_id) {
    st.cli = rec.claude_code_version.slice(0, 32);
    if (st.bg === null && st.fromStart && versionAtLeast(st.cli, LEVEL_SINCE)) { st.bg = []; changed = true; }
  }
  if (rec.type === 'system' && rec.subtype === 'background_tasks_changed' && Array.isArray(rec.tasks) && !rec.parent_tool_use_id) {
    const next = bgOf(rec.tasks);
    if (!sameBg(st.bg, next)) { st.bg = next; changed = true; }
  }
  let timer = (rec.wakeup_source != null && rec.wakeup_source !== '') || (rec.scheduled_for != null && rec.scheduled_for !== '');
  if (!timer && rec.type === 'assistant' && rec.message && Array.isArray(rec.message.content)) {
    timer = rec.message.content.some((b) => b && b.type === 'tool_use' && TIMER_TOOLS.includes(b.name));
  }
  if (timer && !st.timer) { st.timer = true; changed = true; }
  return changed;
}
/** The tracker a wrapper's sidecar holds → a validated copy, or null (no field = a wrapper older than this record). */
function factsFromSidecar(f) {
  if (!f || typeof f !== 'object' || f.v !== FACTS_VERSION) return null;
  return { v: FACTS_VERSION, fromStart: f.fromStart === true, bg: Array.isArray(f.bg) ? bgOf(f.bg.map((t) => ({ task_id: t && t.id, task_type: t && t.type, description: t && t.description }))) : null,
    timer: f.timer === true, at: Number.isFinite(f.at) ? f.at : null, cli: typeof f.cli === 'string' ? f.cli.slice(0, 32) : null };
}
/** An adopted process whose wrapper kept NO facts: not read from its start, so neither the empty set nor «none seen». */
function factsAdopted() { return { v: FACTS_VERSION, fromStart: false, bg: null, timer: false, at: null, cli: null, old: true }; }
/**
 * The tracker → the row's three facts. `keeps` = the harness row's `sidecarFacts` ({background, timers, lastRecordAt});
 * a harness whose wrapper keeps none of them says so (never a harness id here). `turn` decides whether idleSince applies.
 */
function trackedFacts(st, { keeps = null, turn = null } = {}) {
  const k = keeps && typeof keeps === 'object' ? keeps : {};
  const out = {};
  if (!k.background) { out.background = null; out.backgroundWhy = WHY.noHarnessBg; }
  else if (st && Array.isArray(st.bg)) out.background = st.bg;
  else if (st && st.fromStart && st.cli === null) out.background = [];   // the CLI has run nothing yet: no task can exist
  else { out.background = null; out.backgroundWhy = !st || st.old ? WHY.oldWrapper : (st.fromStart ? WHY.oldCli : WHY.notRead); }
  if (!k.timers) { out.timers = null; out.timersWhy = WHY.notCollected; }
  else if (st && st.timer) { out.timers = null; out.timersWhy = WHY.timerSet; }
  else if (st && st.fromStart) out.timers = 'none-seen';
  else { out.timers = null; out.timersWhy = !st || st.old ? WHY.oldWrapper : WHY.notRead; }
  if (turn === 'running' || turn === 'waiting') { out.idleSince = null; out.idleSinceWhy = WHY.turnRunning; }
  else if (turn !== 'idle') { out.idleSince = null; out.idleSinceWhy = WHY.terminal; }
  else if (k.lastRecordAt && st && Number.isFinite(st.at)) out.idleSince = st.at;
  else { out.idleSince = null; out.idleSinceWhy = WHY.noTurnSeen; }   // the collector fills it from the output file's time
  return out;
}

/** Every fact a row carries as value-or-unknown (each null one has a `<fact>Why`). NOT here, because null is a KNOWN answer
 *  for them: `browser` (null = it has none; a browser whose users are unknown is an object with `known: false` and a `why`)
 *  and `desktop` (null = no window on any desktop). `state` is always known (running | ended); an ended row's `ended`
 *  ({at, by}) is null + `endedWhy` when no record was kept. */
const ROW_FACTS = Object.freeze(['turn', 'background', 'heldPrompts', 'timers', 'goal', 'continue', 'asks', 'jobs', 'waiting',
  'idleSince', 'memBytes', 'handover']);
/** What the verdict may read — and nothing else (no idleSince, no memBytes: idle age only sorts, memory only reports). */
const VERDICT_FIELDS = Object.freeze(['state', 'turn', 'turnWhy', 'background', 'backgroundWhy', 'heldPrompts', 'heldPromptsWhy',
  'asks', 'asksWhy', 'goal', 'goalWhy', 'continue', 'continueWhy', 'timers', 'timersWhy', 'browser',
  'handover', 'handoverWhy', 'jobs', 'jobsWhy']);
/** The design's ten reasons, in its order. */
const REASONS = Object.freeze(['turn', 'background', 'held', 'asks', 'goal', 'continue', 'timer', 'browser', 'handover', 'job']);

const isCount = (n) => Number.isInteger(n) && n >= 0;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const whyOf = (r, fact) => (typeof r[fact + 'Why'] === 'string' && r[fact + 'Why'].trim()) ? r[fact + 'Why'].trim() : WHY.notCollected;

/** The verdict's input: a frozen copy of the VERDICT_FIELDS of `row`, nothing more. */
function verdictInput(row) {
  const r = row && typeof row === 'object' ? row : {};
  const o = {};
  for (const k of VERDICT_FIELDS) o[k] = r[k] === undefined ? null : r[k];
  return Object.freeze(o);
}

/**
 * May an AGENT end this conversation? → { endable, busy: [{code, why}] }. An ended row is endable with nothing busy (there
 * is nothing left to stop). Each reason is its own code; an unknown fact refuses as `<reason>_unknown` with its reason.
 */
function endVerdict(row) {
  const r = verdictInput(row);
  if (r.state === 'ended') return { endable: true, busy: [] };
  const busy = [];
  const add = (code, why) => busy.push({ code, why });
  const unknown = (code, label, fact) => add(code + '_unknown', `${label} unknown (${whyOf(r, fact)})`);
  // 1 turn — running, or waiting on the person
  if (r.turn === 'running') add('turn', 'a turn is running');
  else if (r.turn === 'waiting') add('turn', 'a turn is waiting on a person');
  else if (r.turn !== 'idle') unknown('turn', 'the turn is', 'turn');
  // 2 background — the CLI lists background tasks
  if (!Array.isArray(r.background)) unknown('background', 'background tasks are', 'background');
  else if (r.background.length) add('background', `${plural(r.background.length, 'background task is', 'background tasks are')} running`);
  // 3 held — a prompt held in the wrapper's queue would never run
  if (!isCount(r.heldPrompts)) unknown('held', 'held prompts are', 'heldPrompts');
  else if (r.heldPrompts > 0) add('held', `${plural(r.heldPrompts, 'prompt is', 'prompts are')} held in its queue`);
  // 4 asks — open For-you questions it asked
  if (!isCount(r.asks)) unknown('asks', 'its open questions are', 'asks');
  else if (r.asks > 0) add('asks', `${plural(r.asks, 'open question', 'open questions')} it asked would close unanswered`);
  // 5 goal — a goal loop is active
  if (r.goal === 'active') add('goal', 'a goal loop is active');
  else if (r.goal !== 'none') unknown('goal', 'its goal loop is', 'goal');
  // 6 continue — armed after a usage limit
  const c = r.continue;
  if (c && typeof c === 'object' && c.armed === true) add('continue', 'a continue is armed after a usage limit');
  else if (!(c && typeof c === 'object' && c.armed === false)) unknown('continue', 'an armed continue is', 'continue');
  // 7 timer — the one-way mark: once set, whether one is still due cannot be seen
  if (r.timers !== 'none-seen') {
    if (whyOf(r, 'timers') === WHY.timerSet) add('timer', WHY.timerSet);
    else unknown('timer', 'CLI timers are', 'timers');
  }
  // 8 browser — a person drives or watches its browser (the facts the keeper's own release verdict refuses on);
  //   null = it has no browser (a known answer); an object whose users are not all known is busy
  const b = r.browser;
  if (b !== null && b !== undefined) {
    if (typeof b !== 'object' || b.known === false || typeof b.drivenBy === 'undefined' || !isCount(b.viewers) || typeof b.personBrowsing !== 'boolean') {
      add('browser_unknown', `who uses its browser is unknown (${(b && typeof b.why === 'string' && b.why) || WHY.notCollected})`);
    } else if (b.drivenBy) add('browser', 'a person drives its browser');
    else if (b.viewers > 0) add('browser', 'a person watches its browser');
    else if (b.personBrowsing) add('browser', 'a person browses in its browser');
  }
  // 9 handover — a hand-over to it is in flight
  if (r.handover === true) add('handover', 'a hand-over to it is in flight');
  else if (r.handover !== false) unknown('handover', 'a hand-over is', 'handover');
  // 10 job — it owns a registered job or schedule WITHOUT the person's grant «may wake its conversation» (the owner's rule,
  //    2026-11-17: a conversation ended on purpose is resumed only by a job or schedule that carries that grant — piece 7 owns the
  //    field). An unknown grant refuses; when every job and schedule it owns carries the grant, this reason does not hold.
  const j = r.jobs;
  if (!j || typeof j !== 'object' || !isCount(j.running) || !isCount(j.schedules) || !Array.isArray(j.items)) unknown('job', 'its jobs are', 'jobs');
  else {
    const without = j.items.filter((x) => !x || x.wakeGrant !== true);
    const unknownGrant = without.filter((x) => !x || x.wakeGrant !== false);
    if (unknownGrant.length) add('job_unknown', `whether ${plural(unknownGrant.length, 'job or schedule it owns carries', 'jobs or schedules it owns carry')} the person's grant to wake it is unknown (${(unknownGrant[0] && typeof unknownGrant[0].wakeGrantWhy === 'string' && unknownGrant[0].wakeGrantWhy) || WHY.notCollected}) — the person decides, job by job`);
    else if (without.length) add('job', `${plural(without.length, 'job or schedule it owns has', 'jobs or schedules it owns have')} no grant from the person to wake it — the person decides, job by job`);
  }
  return { endable: busy.length === 0, busy };
}

/** The refusal an agent's end answers with (piece 3 calls this; it says why and names the door). */
function refusalOf(verdict, { stopped = 'Nothing was stopped.' } = {}) {
  const busy = (verdict && Array.isArray(verdict.busy)) ? verdict.busy : [];
  const why = 'not ended — ' + (busy.length ? busy.map((b) => b.why).join('; ') : 'busy') + '. ' + stopped
    + ' A person can terminate it from System → Conversations and browsers.';
  return { ok: false, code: 'subject_busy', busy, why };
}

/**
 * The row as the list answers it: every ROW_FACT a value or null + `<fact>Why` (a missing reason becomes WHY.notCollected
 * — never blank), then `busy` / `endable` from THE verdict. Unknown keys pass through untouched (key, name, desktop, link…).
 */
function shapeRow(raw) {
  const r = { ...(raw && typeof raw === 'object' ? raw : {}) };
  const ended = r.state === 'ended';
  if (!ended) r.state = 'running';
  for (const f of ROW_FACTS) {
    if (r[f] === undefined) r[f] = null;
    if (r[f] === null) { if (!(typeof r[f + 'Why'] === 'string' && r[f + 'Why'].trim())) r[f + 'Why'] = ended ? WHY.notLive : WHY.notCollected; }
    else delete r[f + 'Why'];
  }
  if (ended) {
    if (r.ended === undefined || r.ended === null) { r.ended = null; if (!(typeof r.endedWhy === 'string' && r.endedWhy.trim())) r.endedWhy = WHY.noRecord; }
  } else delete r.ended;
  if (r.browser === undefined) r.browser = null;
  if (r.desktop === undefined) r.desktop = null;
  // a timer mark prints unknown with its own reason (the value is null; the why says a timer was set)
  const v = endVerdict(r);
  r.busy = v.busy;
  r.endable = v.endable;
  return r;
}

/** One cell of the CLI table: the value in words, or `unknown (<why>)` — never blank. */
function cellOf(row, fact) {
  const v = row ? row[fact] : null;
  if (v === null || v === undefined) return `unknown (${row && typeof row[fact + 'Why'] === 'string' && row[fact + 'Why'] ? row[fact + 'Why'] : WHY.notCollected})`;
  if (Array.isArray(v)) return String(v.length);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

module.exports = { WHY, ROW_FACTS, VERDICT_FIELDS, REASONS, verdictInput, endVerdict, refusalOf, shapeRow, cellOf,
  FACTS_VERSION, LEVEL_SINCE, TIMER_TOOLS, versionAtLeast, factsFresh, factsStep, factsFromSidecar, factsAdopted, trackedFacts };
