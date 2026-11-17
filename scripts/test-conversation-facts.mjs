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
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CF = require(path.join(REPO, 'src/conversation-facts.js'));
let pass = 0, fail = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

// ── C · the ONE builder and the list verb (in-process over fake sessions) ───────────────────────────────────────────
console.log('C · the builder (src/server/conversation-facts.js), the verb, the CLI words');
const COL = require(path.join(REPO, 'src/server/conversation-facts.js'));
const KEEPS = { sidecarFacts: { background: true, timers: true, lastRecordAt: true } };
const KEY_A = 'claude:e2e00000-0000-4000-8000-0000000000a1', KEY_B = 'claude:e2e00000-0000-4000-8000-0000000000b2', KEY_T = 'claude:e2e00000-0000-4000-8000-0000000000c3';
function fakeChat(name, step = []) { const st = CF.factsFresh(); for (const [rec, at] of step) CF.factsStep(st, rec, at); return { backend: 'claude', mode: 'chat', name, cwd: '/tmp', _convFacts: st }; }
const known = { capsOf: () => KEEPS, turnOf: () => 'idle', turnKnown: (s) => s.mode === 'chat', heldOf: () => 0, asksOf: () => [], goalOf: () => 'none', continueOf: () => ({ armed: false }),
  jobsOf: () => ({ running: 0, schedules: 0, nextFireAt: null }), waitingOf: () => ({ notices: 0 }), handoverOf: () => false, browserOf: () => null,
  desktopOf: () => ({ desktop: { id: 'd1', name: 'Main' }, window: true }), desktops: () => [{ id: 'd1', name: 'Main' }], machineMem: async () => ({ memTotal: 64e9, memAvailable: 20e9 }), memOf: async () => 2e9 };
{
  const A = fakeChat('Alpha', [[{ type: 'system', subtype: 'init', claude_code_version: '2.1.312' }, 1794880000000]]);
  const T = { backend: 'claude', mode: 'terminal', name: 'Term' };
  const keys = new Map([[A, KEY_A], [T, KEY_T]]);
  const sessions = new Map([['sess-1', A], ['sess-2', T]]);
  const r = await COL.create({ activeSessions: sessions, keyOf: (s) => keys.get(s), ...known }).list();
  const a = r.conversations.find((c) => c.key === KEY_A), t = r.conversations.find((c) => c.key === KEY_T);
  ok(a && a.endable && a.busy.length === 0 && Array.isArray(a.background) && a.timers === 'none-seen' && a.idleSince === 1794880000000 && a.memBytes === 2e9 && a.link === 'vibespace://conversation/' + KEY_A && a.desktop.link === 'vibespace://desktop/d1',
    'every fact KNOWN: an idle chat row is endable — its set, timers, idle age (the wrapper\'s record time), memory, desktop and ready link', a);
  ok(t && !t.endable && t.turn === null && t.turnWhy === CF.WHY.terminal && t.backgroundWhy === CF.WHY.terminalNone && t.busy.some((b) => b.code === 'turn_unknown'), 'a terminal row: turn and its facts unknown with their reasons, busy — never «idle»', t && { turn: t.turnWhy, busy: t.busy.map((b) => b.code) });
  ok(r.machine.memTotal === 64e9 && r.desktops[0].link === 'vibespace://desktop/d1' && r.pass.ranOut === false, 'the machine\'s memory and the desktops (with their links) ride the same snapshot', r.machine);
  // every fact × unknown: each source answers nothing, or throws
  for (const [label, over] of [['answers nothing', Object.fromEntries(Object.keys(known).map((k) => [k, () => undefined]))], ['throws', Object.fromEntries(Object.keys(known).map((k) => [k, () => { throw new Error('boom'); }]))]]) {
    const r2 = await COL.create({ activeSessions: new Map([['sess-1', A]]), keyOf: () => KEY_A, ...over, turnKnown: () => true, turnOf: () => 'idle' }).list();
    const row = r2.conversations[0];
    const blank = CF.ROW_FACTS.filter((f) => row[f] === null && !row[f + 'Why']);
    const unk = ['heldPrompts', 'asks', 'goal', 'continue', 'jobs', 'handover'].filter((f) => row[f] !== null);
    ok(row && !row.endable && blank.length === 0 && unk.length === 0 && row.browser && row.browser.known === false, `every source ${label}: each fact unknown WITH a reason (never blank, never 0), the row busy — the builder never throws`, { blank, unk, busy: row && row.busy.map((b) => b.code) });
  }
}
{
  // THE BOUNDED PASS: one at a time, ended at its time-out, question marks — never last time's values
  const many = new Map(); const keyOf = new Map();
  for (let i = 0; i < 6; i++) { const s = fakeChat('S' + i, [[{ type: 'system', subtype: 'init', claude_code_version: '2.1.312' }, 1]]); many.set('sess-' + i, s); keyOf.set(s, 'claude:e2e00000-0000-4000-8000-00000000000' + i); }
  let inFlight = 0, maxInFlight = 0, slow = false;
  const memOf = (s) => new Promise((res) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); if (slow && s.name === 'S2') return; /* never answers */ setTimeout(() => { inFlight--; res(1e9 + Number(s.name.slice(1))); }, 5); });
  const C = COL.create({ activeSessions: many, keyOf: (s) => keyOf.get(s), ...known, memOf, passMs: 400 });
  const first = await C.list();
  ok(first.pass.ranOut === false && first.conversations.every((c) => Number.isFinite(c.memBytes)) && maxInFlight === 1, `the pass walks the trees one at a time (at most ${maxInFlight} in flight) and fills every row`, first.pass);
  slow = true;
  const t0 = Date.now();
  const second = await C.list();
  const ms = Date.now() - t0;
  const after = second.conversations.filter((c) => ['S2', 'S3', 'S4', 'S5'].includes(c.name));
  ok(second.pass.ranOut && ms < 1500 && after.every((c) => c.memBytes === null && c.memBytesWhy === CF.WHY.timedOut), `a tree that never answers: the pass ENDS at its time-out (${ms} ms) and every row it did not finish says «${CF.WHY.timedOut}» — not the first pass's numbers`, after.map((c) => [c.name, c.memBytes]));
  ok(second.conversations.filter((c) => ['S0', 'S1'].includes(c.name)).every((c) => Number.isFinite(c.memBytes)), 'the rows it finished before the slow one keep what it measured this time');
  slow = false;
  let calls = 0;
  const C2 = COL.create({ activeSessions: many, keyOf: (s) => keyOf.get(s), ...known, memOf: async () => { calls++; await sleep(20); return 1e9; } });
  const [p1, p2] = [C2.list(), C2.list()];
  const [x1, x2] = await Promise.all([p1, p2]);
  ok(p1 === p2 && x1 === x2 && calls === 6, `single-flight: two callers at once share ONE pass (${calls} tree reads for 6 rows)`);
  const gone = await COL.create({ activeSessions: new Map([['sess-1', fakeChat('G')]]), keyOf: () => KEY_A, ...known, memOf: async () => ({ why: CF.WHY.noProcess }) }).list();
  ok(gone.conversations[0].memBytes === null && gone.conversations[0].memBytesWhy === CF.WHY.noProcess, 'a tree whose root is gone prints «no process found» — never 0', gone.conversations[0].memBytes);
  const zero = await COL.create({ activeSessions: new Map([['sess-1', fakeChat('Z')]]), keyOf: () => KEY_A, ...known, memOf: async () => 0 }).list();
  ok(zero.conversations[0].memBytes === null && zero.conversations[0].memBytesWhy === CF.WHY.noProcess, 'a sampler that answers 0 bytes is read as «no process found», never printed as 0');
  // RED CONTROL: a copy that takes a gone tree as 0
  const MUT = mutantCopies('conversation-facts-col', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/server/conversation-facts.js'), 'utf8');
  const NEEDLE = "        if (Number.isFinite(m.value) && m.value > 0) row.memBytes = m.value;\n        else { row.memBytes = null; row.memBytesWhy = (m.value && typeof m.value.why === 'string' && m.value.why) || WHY.noProcess; }";
  ok(src.split(NEEDLE).length === 2, 'the gone-tree rule is in the builder once (the mutation anchor)');
  const M = MUT.load('src/server/conversation-facts.js', src.replace(NEEDLE, '        row.memBytes = Number.isFinite(m.value) ? m.value : 0;'), 'gone-is-zero');
  const red = await M.create({ activeSessions: new Map([['sess-1', fakeChat('G')]]), keyOf: () => KEY_A, ...known, memOf: async () => ({ why: CF.WHY.noProcess }) }).list();
  ok(red.conversations[0].memBytes === 0, 'CONTROL a builder that takes a gone tree as 0 prints 0 — the leg above would be red', red.conversations[0].memBytes);
  const remote = await COL.create({ activeSessions: new Map([['sess-1', { ...fakeChat('R'), host: 'mac' }]]), keyOf: () => KEY_A, ...known }).list();
  ok(remote.conversations[0].memBytesWhy === CF.WHY.otherMachine, 'a conversation on another machine: «on another machine — not measured there yet»');
  const idleOld = await COL.create({ activeSessions: new Map([['sess-1', { backend: 'claude', mode: 'chat', name: 'Old', _convFacts: CF.factsAdopted() }]]), keyOf: () => KEY_A, ...known, agesOf: async (entries, signal) => new Map(entries.map(([id]) => [id, 1794870000000])) }).list();
  const io = idleOld.conversations[0];
  let sig = null;
  const hung = await COL.create({ activeSessions: new Map([['sess-1', { backend: 'claude', mode: 'chat', name: 'Old', _convFacts: CF.factsAdopted() }]]), keyOf: () => KEY_A, ...known, passMs: 300, agesOf: (entries, signal) => { sig = signal; return new Promise(() => {}); } }).list();
  ok(hung.pass.ranOut && hung.conversations[0].idleSince === null && hung.conversations[0].idleSinceWhy === CF.WHY.timedOut && sig && sig.cancelled === true, 'an age pass that never answers: ended at the time-out, its signal CANCELLED (the walk stops), the idle age «ran out of time»', { why: hung.conversations[0].idleSinceWhy, cancelled: sig && sig.cancelled });
  ok(io.idleSince === 1794870000000 && io.idleSinceSource === 'output file' && io.backgroundWhy === CF.WHY.oldWrapper && !io.endable, 'an OLDER wrapper: its idle age from the output file\'s own time (the pass); its set and timers «its wrapper is older than this record» — busy', { idle: io.idleSince, bg: io.backgroundWhy });
}
{
  // THE SOURCES (sourcesFrom): the hub's instances, shaped as the 2026-11-17 map read them, each an in-memory read
  const jobs = new Map([['j1', { owner: { conversation: { id: 'e2e00000-0000-4000-8000-0000000000a1' } }, state: 'up' }], ['j2', { owner: { conversation: { id: 'e2e00000-0000-4000-8000-0000000000a1' } }, kind: 'cron', state: 'scheduled', nextFireAt: 1794890000000 }],
    ['j3', { owner: { conversation: { id: 'e2e00000-0000-4000-8000-0000000000a1' } }, kind: 'cron', state: 'scheduled', nextFireAt: 1794880000000 }], ['j4', { owner: { conversation: { id: 'other' } }, state: 'done' }]]);
  const lay = { desktopMeta: [{ id: 'd1', name: 'Main' }, { id: '__stage__', name: 'x' }], desktops: { d1: { autoSave: { windows: [{ openSpec: { backendSessionId: 'e2e00000-0000-4000-8000-0000000000a1' } }] } } } };
  const S = COL.sourcesFrom({ getJobs: () => ({ ready: true, jobs }), persistenceRouter: { layoutsCached: () => lay }, userTodos: { forSession: () => [{ by: 'agent', kind: 'ask' }, { by: 'agent', kind: 'notice' }] },
    autoResume: () => ({ statusFor: () => ({ armed: true, resetsAt: 5 }) }), stashView: () => ({ inFlight: () => false }), deliver: () => ({ handoverArmed: () => true }),
    sysinfo: { history: () => [{ t: 1, m: 40e9, l: 64e9 }] }, stoppedSessions: async () => [{ backend: 'claude', backendSessionId: 'e2e00000-0000-4000-8000-0000000000d4', name: 'Gone', stoppedAt: 7, stopReason: 'dead-socket-at-boot' }],
    keeper: () => ({ inputSummaryFor: () => ({ input: 'user' }), inputsFor: () => [] }), browserStream: () => ({ viewerCount: () => 0 }), treeUsage: async () => ({ memBytes: 3e9 }) });
  const s = { backend: 'claude', backendSessionId: 'e2e00000-0000-4000-8000-0000000000a1', _goal: 'ship it', _goalStatus: 'active', _browserKey: 'bk1', _childPid: 4242, _convFacts: { heldAtBoot: 2 },
    _normalizer: { queuePublished: () => false, queueState: () => [] } };
  ok(JSON.stringify(S.jobsOf(KEY_A)) === JSON.stringify({ running: 1, schedules: 2, nextFireAt: 1794880000000 }), 'jobs by the OWNER conversation: 1 running, 2 schedules, the soonest next fire', S.jobsOf(KEY_A));
  ok(S.heldOf(s) === 2 && S.heldOf({ ...s, _normalizer: { queuePublished: () => true, queueState: () => [1] } }) === 1 && S.heldOf({}) === undefined, 'held prompts: the wrapper\'s live publication, else its sidecar queue read at the adoption, else unknown');
  ok(S.goalOf(s) === 'active' && S.goalOf({ _goal: 'x', _goalStatus: 'complete' }) === 'none' && S.goalOf({ _goal: 'x' }) === undefined && S.goalOf({}) === 'none', 'goal: active · complete = none · a goal with no status = unknown · no goal = none');
  ok(S.asksOf(KEY_A).length === 1 && JSON.stringify(S.continueOf(s, 'sess-1')) === '{"armed":true,"resetsAt":5}' && S.handoverOf(s) === true, 'asks (its own, never a notice), the armed continue, a hand-over armed for the turn end');
  const b = S.browserOf(s, 'sess-1');
  ok(b && b.drivenBy === 'person' && b.viewers === 0 && b.personBrowsing === false && CF.endVerdict({ ...IDLE, browser: b }).busy[0].code === 'browser', 'a browser the person took over: drivenBy person — busy (browser)', b);
  ok(S.browserOf({}, 'x') === null && S.browsers().why.includes('piece 6'), 'no browser key = no browser (a known answer); the list of every browser waits for the keeper\'s rows (piece 6), said so');
  ok(JSON.stringify(S.desktopOf(KEY_A)) === '{"desktop":{"id":"d1","name":"Main"},"window":true}' && S.desktopOf(KEY_B).window === false && S.desktops().length === 1, 'the stored layout (in memory): its desktop and window; another conversation has no window; the stage is not a desktop');
  const S0 = COL.sourcesFrom({ persistenceRouter: { layoutsCached: () => null }, sysinfo: { history: () => [] } });
  ok(S0.desktopOf(KEY_A).why && S0.desktops().why && (await S0.machineMem()).why === CF.WHY.measuring, 'no layout read since the boot, no memory sample yet: unknown with their reasons (never a guess)');
  ok(JSON.stringify(await S.machineMem()) === '{"memTotal":64000000000,"memAvailable":24000000000}' && (await S.memOf(s)) === 3e9 && JSON.stringify(await S.memOf({})) === JSON.stringify({ why: CF.WHY.noProcess }), 'the machine\'s memory from the sampler\'s last point; a tree\'s memory from its root pid; no pid = «no process found»');
  const ended = await S.endedRows();
  ok(ended.length === 1 && ended[0].key === 'claude:e2e00000-0000-4000-8000-0000000000d4' && ended[0].ended.by === 'restart', 'an ended conversation with a kept record: its key, and «ended by a restart»', ended);
  const src = fs.readFileSync(path.join(REPO, 'src/server/conversation-facts.js'), 'utf8').replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, '');
  const named = ['summaryFor(', 'stashFactOf(', 'ephemerals(', 'factFor(', 'factView(', 'readLayouts(', 'memInfo', 'snapshot(', 'peekNotifs(', 'openRequestFor('].filter((n) => src.includes(n));
  ok(named.length === 0, 'the sources call none of the readers the map found writing or reading a file (the stash summary, the keeper\'s fact and rows, the first layouts read, the memory reader, a job snapshot)', named);
}
{
  // THE DESKTOPS AFTER A RESTART WITH NO PAGE (主开发 2026-11-17 (d)): the layout read ONCE, asynchronously, when the cache is empty
  const P = require(path.join(REPO, 'src/routes/persistence.js'));
  const dd = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cfx-lay-'));
  fs.writeFileSync(path.join(dd, 'layouts.json'), JSON.stringify({ current: null, autoSave: null, saved: {}, customGrids: [], desktopMeta: [{ id: 'd1', name: 'Main' }], desktops: { d1: { autoSave: { windows: [{ openSpec: { backendSessionId: 'e2e00000-0000-4000-8000-0000000000a1' } }] } } } }));
  P.setup({ dataDir: dd, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
  const R = P.router;
  ok(R.layoutsCached() === null, 'PREMISE a hub just booted, no page: nothing has read the layout');
  const realSync = fs.readFileSync; let syncLayoutReads = 0;
  fs.readFileSync = function (f, ...rest) { if (String(f).endsWith('layouts.json')) syncLayoutReads++; return realSync.call(this, f, ...rest); };
  let r;
  try { r = await COL.create({ activeSessions: new Map([['sess-1', fakeChat('A')]]), keyOf: () => KEY_A, ...known, ...(() => { const S = COL.sourcesFrom({ persistenceRouter: R }); return { prepare: S.prepare, desktopOf: S.desktopOf, desktops: S.desktops }; })() }).list(); }
  finally { fs.readFileSync = realSync; }
  const row = r.conversations[0];
  ok(syncLayoutReads === 0 && r.desktops && r.desktops[0].name === 'Main' && row.desktop && row.desktop.id === 'd1' && row.window === true, 'after a restart with no page the list reads the layout itself — asynchronously (0 synchronous reads) — and knows the desktops and the window', { syncLayoutReads, desktops: r.desktops, row: row.desktop });
  ok(R.layoutsCached() !== null && R.readLayouts() === R.layoutsCached(), 'it filled readLayouts\' own cache: the page\'s first read finds it there (no second read, no sync read)');
  const slow = await COL.create({ activeSessions: new Map([['sess-1', fakeChat('A')]]), keyOf: () => KEY_A, ...known, passMs: 200, ...(() => { const S = COL.sourcesFrom({ persistenceRouter: { layoutsCached: () => null, layoutsAsync: () => new Promise(() => {}) } }); return { prepare: S.prepare, desktopOf: S.desktopOf, desktops: S.desktops }; })() }).list();
  ok(slow.desktops === null && /still being read/.test(slow.desktopsWhy) && slow.conversations[0].window === null && /still being read/.test(slow.conversations[0].windowWhy), 'a layout read that runs out of time: desktops and window unknown, said so — the pass is not held', { why: slow.desktopsWhy, ms: slow.pass.ms });
  fs.rmSync(dd, { recursive: true, force: true });
}
{
  // THE IDLE AGE: the day-report unit's own age pass (no copy) — the output file's time, null once cancelled
  const bd = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cfx-buf-'));
  fs.writeFileSync(path.join(bd, 'sess-1.buf'), 'x'); fs.utimesSync(path.join(bd, 'sess-1.buf'), new Date(1794870000000), new Date(1794870000000));
  const S = COL.sourcesFrom({ buffersDir: bd });
  const m = await S.agesOf([['sess-1', {}], ['sess-none', {}]], { cancelled: false, read: 0 });
  ok(m instanceof Map && m.get('sess-1') === 1794870000000 && !m.has('sess-none'), 'agesOf IS the day-report unit\'s outputTimes: the output file\'s own time; a conversation with no file is absent (unknown)', m && [...m]);
  ok((await S.agesOf([['sess-1', {}]], { cancelled: true, read: 0 })) === null, 'a cancelled pass answers null — never a partial map');
  const src = fs.readFileSync(path.join(REPO, 'src/server/conversation-facts.js'), 'utf8');
  ok(/require\('\.\/loop-day-report\.js'\)/.test(src) && /LDR\.outputTimes\(entries, buffersDir, \{ signal \}\)/.test(src) && !/fs\.promises\.stat|\.stat\(/.test(src.replace(/^\s*(\/\/|\*).*$/gm, '')), 'no second reader: the builder calls the day-report unit\'s function and stats nothing itself', null);
  fs.rmSync(bd, { recursive: true, force: true });
}
{
  // THE CHILD WALK (主开发 2026-11-17 (b)): treeUsage still reads the process table synchronously — accepted while NO single
  // synchronous stretch of the list holds the loop for 50 ms, at 84 conversations with trees of fifteen processes (a stand-in table)
  const { monitorEventLoopDelay } = await import('node:perf_hooks');
  const BF = require(path.join(REPO, 'src/browser-facts.js')), CI = require(path.join(REPO, 'src/cli-identity.js'));
  const FAKE = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cfx-proc-'));
  fs.mkdirSync(path.join(FAKE, 'self'));
  const selfStat = fs.readFileSync('/proc/self/stat', 'utf8'), selfStatus = fs.readFileSync('/proc/self/status', 'utf8');
  let selfSmaps = ''; try { selfSmaps = fs.readFileSync('/proc/self/smaps_rollup', 'utf8'); } catch { }
  const put = (pid, kids) => {
    const d = path.join(FAKE, String(pid)); fs.mkdirSync(path.join(d, 'task', String(pid)), { recursive: true });
    fs.writeFileSync(path.join(d, 'task', String(pid), 'children'), kids.join(' ') + (kids.length ? ' ' : ''));
    fs.writeFileSync(path.join(d, 'stat'), selfStat.replace(/^\d+/, String(pid))); fs.writeFileSync(path.join(d, 'status'), selfStatus);
    fs.writeFileSync(path.join(d, 'smaps_rollup'), selfSmaps); fs.writeFileSync(path.join(d, 'cmdline'), 'node\0stand-in\0');
  };
  const sessions = new Map(), keys = new Map();
  for (let t = 0; t < 84; t++) {
    const r0 = 200000 + t * 100;   // root → 2 children → 6 grandchildren each = 15 processes
    put(r0, [r0 + 1, r0 + 2]); put(r0 + 1, [3, 4, 5, 6, 7, 8].map((k) => r0 + k)); put(r0 + 2, [9, 10, 11, 12, 13, 14].map((k) => r0 + k));
    for (let k = 3; k <= 14; k++) put(r0 + k, []);
    const s = { ...fakeChat('T' + t), _childPid: r0 }; sessions.set('sess-' + t, s); keys.set(s, 'claude:e2e00000-0000-4000-8000-' + String(t).padStart(12, '0'));
  }
  const tree = (block = null) => (pid) => BF.treeUsage(pid, { readChildren: (p) => { if (block && p === block) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60); return CI.readChildPids(p, { procRoot: FAKE }); }, procRoot: FAKE });
  const longest = async (treeUsage) => {
    const S = COL.sourcesFrom({ treeUsage });
    const h = monitorEventLoopDelay({ resolution: 1 }); h.enable();
    const r = await COL.create({ activeSessions: sessions, keyOf: (s) => keys.get(s), ...known, memOf: S.memOf, passMs: 60000 }).list();
    await sleep(5); h.disable();
    return { ms: Math.round(h.max / 1e5) / 10, known: r.conversations.filter((c) => Number.isFinite(c.memBytes)).length, pids: 0, pass: r.pass.ms };
  };
  const m1 = await longest(tree());
  ok(m1.known === 84 && m1.ms < 50, `84 conversations × 15 processes: every tree measured, and the longest synchronous stretch of the list is ${m1.ms} ms (< 50; the pass took ${m1.pass} ms)`, m1);
  const m2 = await longest(tree(200500));
  ok(m2.ms >= 50, `CONTROL a tree whose walk blocks 60 ms in one stretch: the same instrument reads ${m2.ms} ms — the leg above would be red`, m2);
  fs.rmSync(FAKE, { recursive: true, force: true });
}
{
  // nothing on the hub loop: no synchronous file call and no child process in the builder (source census)
  const src = fs.readFileSync(path.join(REPO, 'src/server/conversation-facts.js'), 'utf8').replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, '');
  ok(!/\b\w+Sync\s*\(/.test(src) && !/child_process|require\(['"]fs['"]\)|require\(['"]node:fs['"]\)/.test(src), 'the builder makes no synchronous call and starts no child (it reads memory and asks its sources)');
}
{
  // THE VERB: the reach filter, self, beyondReach — a key with reach «opened» lists only its own; the instance key lists all
  const OPS = require(path.join(REPO, 'src/server/conversation-ops.js'));
  const A = fakeChat('Alpha'), B = fakeChat('Bravo'), ME = fakeChat('Me');
  const keys = new Map([[A, KEY_A], [B, KEY_B], [ME, 'claude:e2e00000-0000-4000-8000-0000000000ee']]);
  const sessions = new Map([['sess-a', A], ['sess-b', B], ['sess-me', ME]]);
  const listFacts = COL.create({ activeSessions: sessions, keyOf: (s) => keys.get(s), ...known });
  const verbs = OPS.automationVerbs({ activeSessions: sessions, listFacts });
  const caller = { conversationId: 'e2e00000-0000-4000-8000-0000000000ee', sessionKey: 'claude:e2e00000-0000-4000-8000-0000000000ee' };
  const opened = await verbs['conversations.list']({}, { caller, keyId: 'k1', reach: ({ conversationId }) => ({ ok: conversationId === 'e2e00000-0000-4000-8000-0000000000a1' }) });
  ok(opened.ok && opened.conversations.length === 2 && opened.conversations.some((c) => c.key === KEY_A) && opened.conversations.find((c) => c.self)?.name === 'Me' && opened.beyondReach === 1,
    'reach «opened»: only what the key opened, plus the caller marked self; the rest only counted (beyondReach 1)', opened.conversations.map((c) => [c.name, !!c.self]));
  const all = await verbs['conversations.list']({}, { caller, keyId: 'k1', reach: () => ({ ok: true }) });
  ok(all.ok && all.conversations.length === 3 && all.beyondReach === 0, 'the instance key lists all three');
  const MUT = mutantCopies('conversation-facts-ops', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/server/conversation-ops.js'), 'utf8');
  const NEEDLE = '        if (self || (v && v.ok)) rows.push(self ? { ...r, self: true } : r); else beyond++;';
  ok(src.split(NEEDLE).length === 2, 'the list\'s reach filter is in the handler once (the mutation anchor)');
  const RED = MUT.load('src/server/conversation-ops.js', src.replace(NEEDLE, '        rows.push(self ? { ...r, self: true } : r);'), 'no-reach-filter');
  const leak = await RED.automationVerbs({ activeSessions: sessions, listFacts })['conversations.list']({}, { caller, keyId: 'k1', reach: ({ conversationId }) => ({ ok: conversationId === 'e2e00000-0000-4000-8000-0000000000a1' }) });
  ok(leak.conversations.length === 3, 'CONTROL a handler without the reach filter hands an «opened» key all three — the leg above would be red', leak.conversations.length);
  const AK = require(path.join(REPO, 'src/automation-keys.js'));
  const row = AK.SCOPES.find((x) => x.verb === 'conversations.list');
  ok(row && row.layer === 'read' && row.billed === false && row.args({}).ok && !row.args({ x: 1 }).ok, 'the closed table: conversations.list is a READ, not billed, and takes no argument');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok(zh.includes(`"${row.label}": "列出对话与浏览器"`) && ja.includes(`"${row.label}": "会話とブラウザーを一覧表示"`), 'its label is worded in three languages (en key, zh, ja)');
}
{
  // the CLI's words: «unknown (why)», never blank / 0 / idle for a thing the hub does not know
  const API = require(path.join(REPO, 'data/bin/vibespace-api'));
  const term = CF.shapeRow({ key: KEY_T, name: 'Term', mode: 'terminal', turn: null, turnWhy: CF.WHY.terminal, background: null, backgroundWhy: CF.WHY.terminalNone, memBytes: null, memBytesWhy: CF.WHY.noProcess });
  const words = API.listWords({ machine: { memTotal: 64e9, memAvailable: 20e9 }, desktops: [], conversations: [term], browsers: [], beyondReach: 2 }, 1794880000000);
  ok(words.includes(`turn unknown (${CF.WHY.terminal})`) && words.includes(`memory unknown (${CF.WHY.noProcess})`) && !/turn idle|memory 0\b/.test(words) && words.includes('busy — turn_unknown') && words.includes('2 more beyond'), 'the table prints «unknown (<why>)» for every fact the hub does not know, the busy codes, and the count beyond reach', words);
  const BAN = /\b(sleep|asleep|hibernat\w*|suspend\w*|paus\w*)\b|睡眠|休眠|挂起|暂停|スリープ|休止/i;
  ok(!BAN.test(words) && !BAN.test(String(API.USAGE).split('vibespace-api list')[1] || '') && !BAN.test('List conversations and browsers 列出对话与浏览器 会話とブラウザーを一覧表示'), 'the list\'s words (table, usage, label in three languages) never say sleep');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
