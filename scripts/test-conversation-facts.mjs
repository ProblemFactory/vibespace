#!/usr/bin/env node
// scripts/test-conversation-facts.mjs — THE CONVERSATION'S FACTS AND THE END VERDICT (lane conversation-facts, majordomo piece 2).
// The design: a fact is a value or null beside a `<fact>Why` sentence — never blank, never 0, never «idle» for a thing the hub
// does not know; ONE PURE verdict `endVerdict(row)` with the ten reasons, UNKNOWN IS BUSY, no idle and no memory input.
// MEASURED FIRST (the lane's line, 2026-11-17): after a hub restart with no page, 0 of 12 idle chat fixtures read known for
// background tasks, timers and idle age — so (主开发's ruling, road A) the WRAPPER keeps them where they are born.
//   A  the PURE module: every reason × value / unknown, the timer mark, the job reason until piece 7, the verdict's input type
//      (no idle, no memory), the row's never-blank rule, the refusal's words, the shared step function (the wrapper's and the
//      hub's), the sidecar reader, the never-sleep grep. RED CONTROL: a scratch copy with the unknown-is-busy branch switched
//      off fails the unknown legs.
//   The wrapper that keeps them is proven on the REAL data/bin/chat-wrapper.js in scripts/test-conversation-facts-wrapper.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CF = require(path.join(REPO, 'src/conversation-facts.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };

/** A row with every verdict fact known and nothing busy. */
const IDLE = Object.freeze({ state: 'running', turn: 'idle', background: [], heldPrompts: 0, asks: 0, goal: 'none', continue: { armed: false },
  timers: 'none-seen', browser: null, handover: false, jobs: { running: 0, schedules: 0, nextFireAt: null, wakeable: false } });
const codes = (v) => v.busy.map((b) => b.code);

// ── A · the PURE module ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log('A · the PURE module (src/conversation-facts.js)');
/** The unknown legs as a judge over ANY copy of the module (the red control runs the same judge on the switched-off copy). */
function unknownLegs(M) {
  const out = [];
  const one = (name, row, code, why) => { const v = M.endVerdict({ ...IDLE, ...row }); out.push({ name, good: !v.endable && v.busy.length === 1 && v.busy[0].code === code && (!why || v.busy[0].why.includes(why)), got: v }); };
  one('turn unknown (terminal mode)', { turn: null, turnWhy: M.WHY.terminal }, 'turn_unknown', M.WHY.terminal);
  one('background unknown (not read since the restart)', { background: null, backgroundWhy: M.WHY.notRead }, 'background_unknown', M.WHY.notRead);
  one('background unknown (an old wrapper)', { background: null, backgroundWhy: M.WHY.oldWrapper }, 'background_unknown', M.WHY.oldWrapper);
  one('held prompts unknown (no wrapper file)', { heldPrompts: null, heldPromptsWhy: M.WHY.noWrapper }, 'held_unknown', M.WHY.noWrapper);
  one('timers unknown (an old wrapper)', { timers: null, timersWhy: M.WHY.oldWrapper }, 'timer_unknown', M.WHY.oldWrapper);
  one('asks unknown', { asks: null }, 'asks_unknown', M.WHY.notCollected);
  one('goal unknown', { goal: null }, 'goal_unknown');
  one('continue unknown', { continue: null }, 'continue_unknown');
  one('handover unknown', { handover: null }, 'handover_unknown');
  one('jobs unknown', { jobs: null }, 'job_unknown');
  one('a browser whose users are unknown', { browser: { id: 'b1', known: false, why: M.WHY.timedOut } }, 'browser_unknown', M.WHY.timedOut);
  one('a turn value nobody defined', { turn: 'thinking' }, 'turn_unknown');
  return out;
}
{
  const v = CF.endVerdict(IDLE);
  ok(v.endable === true && v.busy.length === 0, 'every fact known and nothing busy ⇒ endable, busy empty', v);
  const each = [
    ['turn running', { turn: 'running' }, 'turn'], ['turn waiting on a person', { turn: 'waiting' }, 'turn'],
    ['2 background tasks', { background: [{ id: 'a' }, { id: 'b' }] }, 'background'], ['a held prompt', { heldPrompts: 1 }, 'held'],
    ['an open ask', { asks: 2 }, 'asks'], ['a goal loop', { goal: 'active' }, 'goal'], ['an armed continue', { continue: { armed: true, resetsAt: 1 } }, 'continue'],
    ['the timer mark', { timers: null, timersWhy: CF.WHY.timerSet }, 'timer'], ['a person drives its browser', { browser: { id: 'b', drivenBy: 'person', viewers: 0, personBrowsing: false } }, 'browser'],
    ['a person watches its browser', { browser: { id: 'b', drivenBy: null, viewers: 1, personBrowsing: false } }, 'browser'], ['a person browses in it', { browser: { id: 'b', drivenBy: null, viewers: 0, personBrowsing: true } }, 'browser'],
    ['a hand-over in flight', { handover: true }, 'handover'], ['a schedule, no delivery could resume it', { jobs: { running: 0, schedules: 1, wakeable: false } }, 'job'],
    ['a running job, no delivery could resume it', { jobs: { running: 1, schedules: 0, wakeable: false } }, 'job'],
  ];
  const bad = each.map(([n, r, c]) => [n, CF.endVerdict({ ...IDLE, ...r }), c]).filter(([, v, c]) => v.endable || codes(v).join() !== c);
  ok(bad.length === 0, `the ten reasons, each ALONE, refuse with its own code (${each.length} rows)`, bad.map(([n, v]) => [n, codes(v)]));
  ok(CF.REASONS.length === 10 && each.every(([, , c]) => CF.REASONS.includes(c)), 'REASONS is the design\'s ten, and every code above is one of them', CF.REASONS);
  const wake = CF.endVerdict({ ...IDLE, jobs: { running: 1, schedules: 2, wakeable: true } });
  ok(wake.endable, 'a job or schedule whose delivery CAN resume it is not busy by itself (piece 7\'s switch)', wake);
  ok(CF.endVerdict({ ...IDLE, browser: { id: 'b', drivenBy: null, viewers: 0, personBrowsing: false } }).endable, 'an idle browser nobody uses is not busy');
  const all = CF.endVerdict({ ...IDLE, turn: 'running', background: [{ id: 'a' }], heldPrompts: 1 });
  ok(codes(all).join() === 'turn,background,held', 'several reasons at once are each named, in the design\'s order', codes(all));
  ok(CF.endVerdict({ ...IDLE, state: 'ended', turn: null, background: null }).endable, 'an ended row has nothing left to stop (endable, busy empty)');
  const legs = unknownLegs(CF);
  for (const l of legs) ok(l.good, `UNKNOWN IS BUSY — ${l.name} ⇒ its own <reason>_unknown with the reason sentence`, l.got);
}
{
  const noIdle = CF.VERDICT_FIELDS.filter((f) => /idle|mem|age|rss|pss|bytes/i.test(f));
  ok(noIdle.length === 0, 'the verdict\'s input type has no idle and no memory field', noIdle);
  const inp = CF.verdictInput({ ...IDLE, idleSince: 1, memBytes: 5e9, extra: 1 });
  ok(Object.keys(inp).sort().join() === [...CF.VERDICT_FIELDS].sort().join() && Object.isFrozen(inp), 'verdictInput hands the verdict exactly VERDICT_FIELDS (frozen) — idleSince / memBytes never reach it', Object.keys(inp));
  const a = CF.endVerdict({ ...IDLE, idleSince: 1, memBytes: 1 }), b = CF.endVerdict({ ...IDLE, idleSince: 1794880000000, memBytes: 64e9, idleSinceWhy: 'x' });
  ok(JSON.stringify(a) === JSON.stringify(b), 'two rows that differ only in idle age and memory get the same verdict');
  const src = fs.readFileSync(path.join(REPO, 'src/conversation-facts.js'), 'utf8');
  const body = src.slice(src.indexOf('function endVerdict('), src.indexOf('/** The refusal an agent'));
  ok(body.length > 200 && !/Date\.now|setTimeout|setInterval|new Date|idleSince|memBytes/.test(body), 'endVerdict reads no clock and names neither idleSince nor memBytes (source)', body.length);
}
{
  const row = CF.shapeRow({ key: 'claude:e2e00000-0000-4000-8000-0000000000c1', turn: 'idle', background: [], timers: null, timersWhy: CF.WHY.timerSet, memBytes: 0 });
  const blank = CF.ROW_FACTS.filter((f) => row[f] === null && !(typeof row[f + 'Why'] === 'string' && row[f + 'Why'].length > 5));
  ok(blank.length === 0, 'shapeRow: every unknown fact carries a reason sentence — never blank', blank);
  ok(row.heldPromptsWhy === CF.WHY.notCollected && CF.cellOf(row, 'heldPrompts') === `unknown (${CF.WHY.notCollected})`, 'a fact nobody collected prints «unknown (the hub did not collect this fact)» — never 0', CF.cellOf(row, 'heldPrompts'));
  ok(CF.cellOf(row, 'timers') === `unknown (${CF.WHY.timerSet})` && row.busy.some((b) => b.code === 'timer'), 'the timer mark prints unknown with its reason, and the row is busy (timer)', CF.cellOf(row, 'timers'));
  ok(CF.cellOf(row, 'memBytes') === '0' && row.endable === false, 'a value of 0 prints 0 only because it IS 0; the row\'s verdict rides in busy/endable', [CF.cellOf(row, 'memBytes'), row.endable]);
  const term = CF.shapeRow({ key: 'claude:t', mode: 'terminal', turn: null, turnWhy: CF.WHY.terminal });
  ok(CF.cellOf(term, 'turn') === `unknown (${CF.WHY.terminal})` && !/idle/.test(CF.cellOf(term, 'turn')) && term.busy[0].code === 'turn_unknown', 'a terminal row prints «unknown (a terminal conversation publishes no turn)» — never «idle»', CF.cellOf(term, 'turn'));
  const ended = CF.shapeRow({ key: 'claude:e', state: 'ended' });
  ok(ended.ended === null && ended.endedWhy === CF.WHY.noRecord && ended.turnWhy === CF.WHY.notLive && ended.endable, 'an ended row with no kept record says «no record kept»; its live facts say it is not running', ended);
  const ref = CF.refusalOf(CF.endVerdict({ ...IDLE, background: [{ id: 'a' }, { id: 'b' }] }));
  ok(ref.ok === false && ref.code === 'subject_busy' && ref.why === 'not ended — 2 background tasks are running. Nothing was stopped. A person can terminate it from System → Conversations and browsers.', 'the refusal says why, that nothing was stopped, and names the person\'s door (the design\'s sentence)', ref.why);
}
{
  // the shared step: the wrapper's and the hub's
  const st = CF.factsFresh();
  const t0 = CF.trackedFacts(st, { keeps: { background: true, timers: true, lastRecordAt: true }, turn: 'idle' });
  ok(Array.isArray(t0.background) && t0.background.length === 0 && t0.timers === 'none-seen' && t0.idleSince === null && t0.idleSinceWhy === CF.WHY.noTurnSeen, 'a CLI read from its start that has run nothing: known-empty, none seen, idle age «no turn seen»', t0);
  ok(CF.factsStep(st, { type: 'system', subtype: 'init', claude_code_version: '2.1.312' }, 1000) === true && Array.isArray(st.bg) && st.bg.length === 0, 'an init naming a level-publishing CLI (≥ ' + CF.LEVEL_SINCE + ') makes the empty set known — a change worth one write', st);
  ok(CF.factsStep(st, { type: 'result' }, 2000) === false && st.at === 2000, 'any record moves the record time in memory, and is NOT a change (no write)', st.at);
  ok(CF.factsStep(st, { type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'x', task_type: 'local_bash', description: 'a server' }] }, 3000) === true && st.bg.length === 1, 'the level signal sets the set (a change)');
  ok(CF.factsStep(st, { type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'x', task_type: 'local_bash', description: 'a server' }] }, 3100) === false, 'the same set again is not a change');
  ok(CF.factsStep(st, { type: 'system', subtype: 'background_tasks_changed', parent_tool_use_id: 'toolu_1', tasks: [] }, 3200) === false && st.bg.length === 1, 'a helper\'s record never moves the conversation\'s set');
  ok(CF.factsStep(st, { type: 'command_lifecycle', state: 'started', wakeup_source: 'loop_wakeup', scheduled_for: 5 }, 4000) === true && st.timer === true, 'a fired wakeup (record-shape\'s wakeup_source / scheduled_for) sets the one-way mark');
  ok(CF.factsStep(st, { type: 'command_lifecycle', state: 'completed' }, 4100) === false && st.timer === true, 'the mark never clears');
  const st2 = CF.factsFresh();
  CF.factsStep(st2, { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'ScheduleWakeup', input: {} }] } }, 1);
  ok(st2.timer === true, 'a ScheduleWakeup tool call (the name the tree states) sets the mark');
  const old = CF.factsFresh(); CF.factsStep(old, { type: 'system', subtype: 'init', claude_code_version: '2.1.200' }, 1);
  const to = CF.trackedFacts(old, { keeps: { background: true, timers: true, lastRecordAt: true }, turn: 'idle' });
  ok(to.background === null && to.backgroundWhy === CF.WHY.oldCli && to.idleSince === 1, 'a CLI older than the level signal: the set is unknown («its CLI version does not report background tasks»); its idle age is known', to);
  const back = CF.factsFromSidecar(JSON.parse(JSON.stringify(st)));
  ok(back && back.bg.length === 1 && back.timer === true && back.at === 4100 && back.fromStart === true, 'the sidecar copy reads back as the same tracker', back);
  ok(CF.factsFromSidecar(undefined) === null && CF.factsFromSidecar({ v: 99 }) === null, 'a sidecar with no facts (or another shape) reads as null — never guessed');
  const ad0 = CF.trackedFacts(CF.factsAdopted(), { keeps: { background: true, timers: true, lastRecordAt: true }, turn: 'idle' });
  ok(ad0.background === null && ad0.backgroundWhy === CF.WHY.oldWrapper && ad0.timers === null && ad0.timersWhy === CF.WHY.oldWrapper, 'an adopted conversation whose wrapper kept no facts: «its wrapper is older than this record; it learns at its next start»', ad0);
  const adLive = CF.factsAdopted(); CF.factsStep(adLive, { type: 'system', subtype: 'background_tasks_changed', tasks: [] }, 9);
  const al = CF.trackedFacts(adLive, { keeps: { background: true, timers: true, lastRecordAt: true }, turn: 'idle' });
  ok(Array.isArray(al.background) && al.timers === null && al.timersWhy === CF.WHY.oldWrapper, '…a level signal heard live after the restart makes its set known again (the full set); «none seen» still cannot be said', al);
  const none = CF.trackedFacts(st, { keeps: { background: false, timers: false, lastRecordAt: false }, turn: 'idle' });
  ok(none.background === null && none.backgroundWhy === CF.WHY.noHarnessBg && none.timers === null && none.idleSince === null, 'a harness row that keeps none of them: unknown with its reason (the row decides, never a harness id)', none);
  ok(CF.trackedFacts(st, { keeps: { background: true, timers: true, lastRecordAt: true }, turn: 'running' }).idleSinceWhy === CF.WHY.turnRunning, 'a running turn has no idle age («a turn is running»)');
}
{
  // the words: never «sleep» or its kin, in any language — the strings this module adds, with a planted control
  const BAN = /\b(sleep|asleep|hibernat\w*|suspend\w*|paus\w*)\b|睡眠|休眠|挂起|暂停|スリープ|休止/i;
  const words = [...Object.values(CF.WHY), CF.refusalOf(CF.endVerdict({ ...IDLE, turn: 'running' })).why,
    ...CF.endVerdict({ state: 'running' }).busy.map((b) => b.why), ...CF.endVerdict({ ...IDLE, turn: 'running', background: [{}, {}], heldPrompts: 2, asks: 1, goal: 'active', continue: { armed: true }, timers: null, timersWhy: CF.WHY.timerSet, handover: true, jobs: { running: 1, schedules: 1, wakeable: false }, browser: { drivenBy: 'p', viewers: 0, personBrowsing: false } }).busy.map((b) => b.why)];
  ok(words.length > 30 && words.every((w) => !BAN.test(w)), `the module's ${words.length} sentences never say sleep (or its kin)`, words.filter((w) => BAN.test(w)));
  ok(BAN.test('the conversation is asleep') && BAN.test('会话已暂停') && BAN.test('スリープ中'), 'CONTROL the grep catches a planted «asleep» / 暂停 / スリープ');
}
{
  // RED CONTROL: the unknown-is-busy branch switched off in a scratch copy — the same unknown legs must FAIL on it
  const MUT = mutantCopies('conversation-facts', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/conversation-facts.js'), 'utf8');
  const NEEDLE = "const unknown = (code, label, fact) => add(code + '_unknown', `${label} unknown (${whyOf(r, fact)})`);";
  ok(src.split(NEEDLE).length === 2, 'the mutation anchor (the unknown branch) is in the module once');
  const M = MUT.load('src/conversation-facts.js', src.replace(NEEDLE, 'const unknown = () => {};'), 'unknown-not-busy');
  const red = unknownLegs(M).filter((l) => !l.good);
  ok(red.length >= 10, `CONTROL with unknown-is-busy switched off, ${red.length} of the unknown legs go red (an unknown would read endable)`, red.map((l) => l.name));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
