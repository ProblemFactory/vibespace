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
  oldCli: 'its CLI stated no version (an older CLI): whether it reports background tasks is unknown',
  turnRunning: 'a turn is running',
  noWakeGrant: 'this release reads no wake grant on a job yet',
  bgNoRaw: 'its wrapper did not record how many background tasks its CLI listed — whether work runs is unknown',
  bgIdless: 'its CLI listed a background task without a task id — a shape the hub has not measured, so whether work runs is unknown',
});

// ── THE FACTS KEPT WHERE THEY ARE BORN (主开发's ruling 2026-11-17 02:26Z, road A; acceptance 10:50Z: THE WRAPPER RECORDS, THE HUB
// JUDGES) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A conversation's wrapper reads every record from its CLI's first line and outlives every hub restart — but it NEVER updates,
// while the person's CLI updates itself often. So the step that runs in the wrapper records OBSERVATIONS only (what the records
// themselves state): whether it saw the CLI's first line, the CLI's version as stated (or that an init stated none), the last
// background set SEEN (or that none was ever seen), the NAMES of the tools used (a bounded set), the one-way wakeup mark the
// records state, the last record's time. The HUB — which a release can update — turns them into facts at read time
// (trackedFacts): known-empty only for a CLI version the tree has MEASURED, a timer by the hub's own list of tool names.
/** The shape version a wrapper advertises (`meta.caps.facts`) and writes (`meta.facts.v`). */
const FACTS_VERSION = 2;
/** THE MEASURED SPAN of the background level signal: the tracked dumps of the CLI builds (scripts/fixtures/claude-cli/<v>.json)
 *  from the first to the newest that declare `background_tasks_changed` — «emitted whenever membership changes», so a set never
 *  published from the CLI's start IS the empty set on a build inside the span. A build outside it (older, or newer and not yet
 *  measured) reads UNKNOWN and says so; a measurement lane moves the bound (test-conversation-facts pins it to the dumps). */
const LEVEL_MEASURED_FROM = '2.1.281';
const LEVEL_MEASURED_TO = '2.1.321';
/** Tool names that set a CLI timer (the tree's own recordings: the init's tools list names ScheduleWakeup and CronCreate). */
const TIMER_TOOLS = Object.freeze(['ScheduleWakeup', 'CronCreate']);
/** A tool the hub does not know whose name looks like a timer reads unknown, never «none seen». */
const TIMERISH = /cron|schedul|wake|remind/i;
/** The CLI's own cron tools that set NOTHING (the same recording names CronList and CronDelete beside CronCreate): the look-alike
 *  test skips them, and it reads only a tool's OWN last name part (`mcp__<server>__<tool>` → `<tool>`), never a server's name. */
const NON_TIMER_TOOLS = Object.freeze(['CronList', 'CronDelete']);
const ownToolName = (n) => { const i = n.lastIndexOf('__'); return n.startsWith('mcp__') && i > 4 ? n.slice(i + 2) : n; };
/** BG_MAX: the set elements kept (the cap aside, a kept count under the raw count = elements not understood). TOOLS_MAX: the
 *  tool names kept (each ≤ 64 chars, written only when the set changes) — 256, because the wrapper can never raise it later. */
const BG_MAX = 100, TOOLS_MAX = 256;

function versionCmp(a, b) {
  const x = String(a).split(/[^\d]+/).filter(Boolean).map(Number), y = String(b).split(/[^\d]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
/** Is a stated CLI version inside the measured span of the level signal? ('' or null = not stated ⇒ false) */
function levelMeasured(v) {
  return typeof v === 'string' && /^\d+(\.\d+)*/.test(v) && versionCmp(v, LEVEL_MEASURED_FROM) >= 0 && versionCmp(v, LEVEL_MEASURED_TO) <= 0;
}
/** Observations of a CLI process read from its first line. */
function factsFresh() { return { v: FACTS_VERSION, fromStart: true, cli: null, bg: null, bgRaw: null, tools: [], wake: false, at: null }; }
/** The set AS SEEN (acceptance round 2, must 2 — the wrapper records, never understands): every object element is kept, one
 *  without a task id as `id: null` (a CLI that renames the key must not read as an empty set); `bgRaw` beside it = the raw
 *  element count, so the hub can tell a set it was handed whole from one with elements not kept. */
const bgOf = (tasks) => tasks.filter((t) => t && typeof t === 'object').slice(0, BG_MAX)
  .map((t) => ({ id: t.task_id != null ? String(t.task_id).slice(0, 64) : null, type: typeof t.task_type === 'string' ? t.task_type.slice(0, 32) : null, description: typeof t.description === 'string' ? t.description.slice(0, 200) : '' }));
const sameBg = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x.id === b[i].id && x.type === b[i].type && x.description === b[i].description);
/**
 * One record → the observations, in memory. NO JUDGMENT here (it runs in a wrapper that never updates). Returns true when an
 * observation CHANGED (the moments worth a sidecar write): the stated version (its FIRST arrival included — an init that
 * states none records ''), the background set seen, a tool name not seen before, the wakeup mark. The record time is never a
 * change. Only the CLI's own lines state the version and the set (a helper's records carry `parent_tool_use_id`).
 */
function factsStep(st, rec, now) {
  if (!st || typeof st !== 'object' || !rec || typeof rec !== 'object') return false;
  if (Number.isFinite(now)) st.at = now;
  let changed = false;
  if (rec.type === 'system' && rec.subtype === 'init' && !rec.parent_tool_use_id) {
    const v = typeof rec.claude_code_version === 'string' ? rec.claude_code_version.slice(0, 32) : '';
    if (st.cli !== v) { st.cli = v; changed = true; }
  }
  if (rec.type === 'system' && rec.subtype === 'background_tasks_changed' && Array.isArray(rec.tasks) && !rec.parent_tool_use_id) {
    const next = bgOf(rec.tasks), raw = rec.tasks.length;
    if (!sameBg(st.bg, next) || st.bgRaw !== raw) { st.bg = next; st.bgRaw = raw; changed = true; }
  }
  if (((rec.wakeup_source != null && rec.wakeup_source !== '') || (rec.scheduled_for != null && rec.scheduled_for !== '')) && !st.wake) { st.wake = true; changed = true; }
  if (rec.type === 'assistant' && rec.message && Array.isArray(rec.message.content)) {
    if (!Array.isArray(st.tools)) st.tools = [];
    for (const b of rec.message.content) {
      if (!b || b.type !== 'tool_use' || typeof b.name !== 'string') continue;
      const n = b.name.slice(0, 64);
      if (!st.tools.includes(n) && st.tools.length < TOOLS_MAX) { st.tools.push(n); changed = true; }
      else if (!st.tools.includes(n) && !st.toolsFull) { st.toolsFull = true; changed = true; }   // more names than kept: said, never dropped silently
    }
  }
  return changed;
}
/** The observations a wrapper's sidecar holds → a validated copy, or null (no field / another shape = an older wrapper). */
function factsFromSidecar(f) {
  if (!f || typeof f !== 'object' || f.v !== FACTS_VERSION) return null;
  return { v: FACTS_VERSION, fromStart: f.fromStart === true, cli: typeof f.cli === 'string' ? f.cli.slice(0, 32) : null,
    bg: Array.isArray(f.bg) ? bgOf(f.bg.map((t) => ({ task_id: t && t.id, task_type: t && t.type, description: t && t.description }))) : null,
    bgRaw: Number.isInteger(f.bgRaw) && f.bgRaw >= 0 ? f.bgRaw : null,
    tools: Array.isArray(f.tools) ? f.tools.filter((n) => typeof n === 'string').map((n) => n.slice(0, 64)).slice(0, TOOLS_MAX) : [], toolsFull: f.toolsFull === true,
    wake: f.wake === true, at: Number.isFinite(f.at) ? f.at : null };
}
/** THE ADOPTION PROOF (acceptance round 2, must 1): is the process a sidecar names the wrapper that wrote it? Judged from
 *  /proc/<pid>/stat ALONE (the boot reads it through proc-identity's stateOf / starttimeOf) — never that process's command
 *  line, which a wrapper stuck in the uninterruptible state on a sick mount can hold for ever. The sidecar's own `pid` and
 *  `startedAt` (the wrapper writes both at its start) against that pid's state and start time: a process in the
 *  uninterruptible ('D') or a dead state ('Z', 'X', gone) is NOT adopted; one that started after the sidecar was born is
 *  another process on a recycled pid. The start time is put on the wall clock through the hub's own (its stat ticks and its
 *  start moment, USER_HZ 100 as the tree's other /proc readers); a wall clock stepped forward since then reads «not adopted»
 *  — the safe side. `r` = { state, ticks, selfTicks, selfStartMs } → { pid: the adopted pid or -1, why: null or the reason }. */
const ADOPT_SLOP_MS = 2000, USER_HZ = 100;
function adoptionProof(meta, r) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const no = (why) => ({ pid: -1, why });
  const pid = Number.isInteger(m.pid) && m.pid > 1 ? m.pid : 0;
  if (!pid) return no('its file names no wrapper process');
  if (!Number.isFinite(m.startedAt)) return no('its file names no start moment');
  const x = r && typeof r === 'object' ? r : {};
  if (x.state == null) return no('the process its file names is gone');
  if (x.state === 'D') return no('the process its file names is stuck in an uninterruptible wait');
  if (x.state === 'Z' || x.state === 'X' || x.state === 'x') return no('the process its file names is dead');
  if (![x.ticks, x.selfTicks, x.selfStartMs].every(Number.isFinite)) return no('the start time of the process its file names could not be read');
  if (x.selfStartMs + (x.ticks - x.selfTicks) * (1000 / USER_HZ) > m.startedAt + ADOPT_SLOP_MS) return no('its pid now names a process that started after the file was written');
  return { pid, why: null };
}
/** At the hub's boot: the sidecar's observations are accepted only from the wrapper the boot adopted (its pid, proven by
 *  adoptionProof); anything else — no observations, another shape, a process not proven — reads as a process not read from
 *  its start, with the proof's reason when the sidecar had observations. */
function factsAtAdoption(wrapperMeta, adoptedPid, notWhy = null) {
  const m = wrapperMeta && typeof wrapperMeta === 'object' ? wrapperMeta : null;
  const pidOk = !!m && Number.isInteger(m.pid) && m.pid > 0 && (adoptedPid == null || m.pid === adoptedPid);
  const f = pidOk ? factsFromSidecar(m.facts) : null;
  if (f) return f;
  return factsAdopted(!pidOk && m && factsFromSidecar(m.facts) && typeof notWhy === 'string' && notWhy ? `its wrapper was not adopted at the hub's start: ${notWhy}` : null);
}
/** An adopted process whose wrapper kept NO observations (or was not proven): not read from its start, so neither the empty
 *  set nor «none seen». `why` replaces the older-wrapper sentence when the reason is another. */
function factsAdopted(why = null) { return { v: FACTS_VERSION, fromStart: false, cli: null, bg: null, bgRaw: null, tools: [], wake: false, at: null, old: true, ...(why ? { oldWhy: why } : {}) }; }
/**
 * THE HUB'S JUDGMENT of the observations → the row's three facts. `keeps` = the harness row's `sidecarFacts` ({background,
 * timers, lastRecordAt}); a harness whose wrapper keeps none of them says so (never a harness id here). `turn` decides idleSince.
 */
function trackedFacts(st, { keeps = null, turn = null } = {}) {
  const k = keeps && typeof keeps === 'object' ? keeps : {};
  const out = {};
  if (!k.background) { out.background = null; out.backgroundWhy = WHY.noHarnessBg; }
  else if (st && Array.isArray(st.bg)) {                                             // a set SEEN is the set, on any build —
    if (!Number.isInteger(st.bgRaw)) { out.background = null; out.backgroundWhy = WHY.bgNoRaw; }   // when it was kept WHOLE
    else if (st.bg.some((t) => !t || t.id == null)) { out.background = null; out.backgroundWhy = WHY.bgIdless; }
    else if (st.bg.length < st.bgRaw && st.bg.length < BG_MAX) { out.background = null; out.backgroundWhy = `its CLI listed ${st.bgRaw} background tasks and its wrapper understood ${st.bg.length} — whether work runs is unknown`; }
    else out.background = st.bg;
  }
  else if (!st || st.old) { out.background = null; out.backgroundWhy = (st && st.oldWhy) || WHY.oldWrapper; }
  else if (!st.fromStart) { out.background = null; out.backgroundWhy = WHY.notRead; }
  else if (st.cli === null) out.background = [];                                     // the CLI has run nothing yet: no task can exist
  else if (st.cli === '') { out.background = null; out.backgroundWhy = WHY.oldCli; }
  else if (levelMeasured(st.cli)) out.background = [];                               // never published on a MEASURED build = none
  else { out.background = null; out.backgroundWhy = `its CLI version ${st.cli} is not measured for background tasks (measured ${LEVEL_MEASURED_FROM}–${LEVEL_MEASURED_TO})`; }
  const tools = st && Array.isArray(st.tools) ? st.tools : [];
  const timerTool = tools.find((n) => TIMER_TOOLS.includes(n));
  const timerish = tools.find((n) => !TIMER_TOOLS.includes(n) && !NON_TIMER_TOOLS.includes(n) && TIMERISH.test(ownToolName(n)));
  if (!k.timers) { out.timers = null; out.timersWhy = WHY.notCollected; }
  else if (st && (st.wake || timerTool)) { out.timers = null; out.timersWhy = WHY.timerSet; }
  else if (!st || st.old) { out.timers = null; out.timersWhy = (st && st.oldWhy) || WHY.oldWrapper; }
  else if (!st.fromStart) { out.timers = null; out.timersWhy = WHY.notRead; }
  else if (timerish) { out.timers = null; out.timersWhy = `it used a tool the hub does not know («${timerish}»), which may set a timer`; }
  else if (st.toolsFull) { out.timers = null; out.timersWhy = 'it used more tools than the hub keeps names of'; }
  else out.timers = 'none-seen';
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
  if (r.browser === undefined) o.browser = { known: false, why: WHY.notCollected };   // a row that never said its browser is not «none»
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
  else if (j.items.length < j.running + j.schedules) add('job_unknown', `its jobs are unknown (${j.running + j.schedules} counted, ${j.items.length} listed with their grant)`);
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
  FACTS_VERSION, LEVEL_MEASURED_FROM, LEVEL_MEASURED_TO, TIMER_TOOLS, NON_TIMER_TOOLS, TIMERISH, BG_MAX, TOOLS_MAX, levelMeasured, factsFresh, factsStep, factsFromSidecar,
  adoptionProof, factsAtAdoption, factsAdopted, trackedFacts };
