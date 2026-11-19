#!/usr/bin/env node
// WHY A SESSION STOPPED — A FACT OF THE SESSION (lane auto-resume-bulk, .349; a fleet power user, 2026-10-23: dozens of
// conversations stopped on usage walls the same day with auto-resume off — nothing remembered which). Gate row
// `test-stopped-by`, fast, PURE + source pins.
//   §1 stopVerdict: the wall machine's walled turn ⇒ quota (its stated reset, its slot, the harness's own line bounded);
//      a walled turn outranks an error; an overload ONLY from the harness's DECLARED enum (the real registry rows —
//      claude `overloaded`, codex `serverOverloaded` in both spellings); a 429 `rate_limit`, a `server_error`, no error,
//      a harness that declares none ⇒ nothing. CONTROL: with no declared list the claude enum is NOT an overload
//   §2 normalizeStoppedBy: a persisted value re-validated (bad kinds / no `at` ⇒ null, overload carries no reset)
//   §3 stillWalled: the pool's live verdict outranks the stored reset BOTH ways; no verdict ⇒ the stated reset
//   §4 planBatch: earliest stop first; every skip reason (gone / running / no-verb / walled + until / quarantined)
//   §5 the words, through the REAL client dictionaries: «因用量上限停止 · 14:00 重置», «模型过载 · 停于 13:42»,
//      «自动继续：开/关», «因用量上限/过载停止 (N)», «将开启 37 个会话；已开启 3 个», «恢复了 29 个 · 跳过 8 个（仍在用量上限内）· 拒绝 0»,
//      «没有因用量上限停止的会话» — and every WORD_KEYS key in zh AND ja with its {params} kept
//   §6 wiring pins (the fact's writer, clearers, restore, the live list, the card, the filter, the descriptors' rows)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CLK = (ms, now) => { const d = new Date(ms), n = new Date(now), p = (x) => String(x).padStart(2, '0'); const hm = `${p(d.getHours())}:${p(d.getMinutes())}`; return d.toDateString() === n.toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`; };   // the suite's own clock (the page hands page-time's)
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SB = require('../src/stopped-by.js');
const harnesses = require('../src/harnesses');
let failed = 0, passed = 0;
const ok = (name, cond, extra) => {
  if (typeof name !== 'string') throw new TypeError(`ok(name, cond): the name is a ${typeof name}, not a string — the arguments are swapped`);   // the swap guard (test-ci-gate-tiers §7b)
  if (cond) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra !== undefined ? `\n    ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
};
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const NOW = 1_800_000_000_000, MIN = 60 * 1000, HOUR = 60 * MIN;
const CLAUDE = harnesses.overloadErrorsOf('claude'), CODEX = harnesses.overloadErrorsOf('codex');

// ── §1 THE VERDICT ──────────────────────────────────────────────────────────
console.log('§1 stopVerdict (the walled turn, the declared overload enum)');
{
  const q = SB.stopVerdict({ walled: true, resetsAt: NOW + 2 * HOUR, memberId: 'sub-a', said: "You've hit your limit · resets 2pm", at: NOW });
  ok('a walled turn ⇒ quota, with its stated reset, its slot and the harness\'s own line', q && q.kind === 'quota' && q.resetsAt === NOW + 2 * HOUR && q.memberId === 'sub-a' && q.at === NOW && /hit your limit/.test(q.said), q);
  ok('a walled turn OUTRANKS a typed error (the wall ended it, whatever else it said)', SB.stopVerdict({ walled: true, lastError: 'overloaded', overloadErrors: CLAUDE, at: NOW }).kind === 'quota');
  ok('a wall with no stated reset keeps `resetsAt: null` (never a guessed time)', SB.stopVerdict({ walled: true, at: NOW }).resetsAt === null);
  ok('the harness\'s line is BOUNDED to one line of ≤ SAID_MAX chars', (() => { const v = SB.stopVerdict({ walled: true, said: 'x\n'.repeat(400), at: NOW }); return v.said.length <= SB.SAID_MAX && !/\n/.test(v.said); })());
  ok('the REAL registry: claude declares `overloaded`, codex `serverOverloaded` (both spellings), shell nothing', CLAUDE.includes('overloaded') && CODEX.some((x) => /^server_?overloaded$/i.test(x)) && harnesses.overloadErrorsOf('shell').length === 0 && harnesses.overloadErrorsOf('nope').length === 0, { CLAUDE, CODEX });
  const ROWS = [
    ['claude `error: "overloaded"` (the CLI maps a 529 / overloaded_error to it)', 'overloaded', CLAUDE, 'overload'],
    ['codex `serverOverloaded` (the app-server camelCase)', 'serverOverloaded', CODEX, 'overload'],
    ['codex `server_overloaded` (the rollout snake_case — one variant, two spellings)', 'server_overloaded', CODEX, 'overload'],
    ['claude `rate_limit` (a 429) is NOT an overload', 'rate_limit', CLAUDE, null],
    ['claude `server_error` (a 5xx) is NOT an overload', 'server_error', CLAUDE, null],
    ['claude `authentication_failed` is NOT an overload', 'authentication_failed', CLAUDE, null],
    ['no error ⇒ nothing to mark', null, CLAUDE, null],
    ['codex `usageLimitExceeded` is the WALL machine\'s, never an overload', 'usageLimitExceeded', CODEX, null],
    ['a harness that declares no enum ⇒ never an overload', 'overloaded', harnesses.overloadErrorsOf('shell'), null],
  ];
  for (const [name, err, decl, kind] of ROWS) {
    const v = SB.stopVerdict({ lastError: err, overloadErrors: decl, said: 'API Error: Repeated 529 Overloaded errors', at: NOW });
    ok(name, kind === null ? v === null : (v && v.kind === kind && v.resetsAt === undefined && v.memberId === undefined), v);
  }
  ok('CONTROL: the verdict reads the DECLARED list — with none handed in, claude\'s own enum value is not an overload (no backend-id fallback)', SB.stopVerdict({ lastError: 'overloaded', at: NOW }) === null);
}

// ── §2 NORMALIZE ────────────────────────────────────────────────────────────
console.log('§2 normalizeStoppedBy (a persisted value, re-validated)');
ok('bad shapes ⇒ null (no kind, an unknown kind, no `at`, not an object)', [null, {}, { kind: 'quota' }, { kind: 'nap', at: NOW }, 'quota', 7].every((x) => SB.normalizeStoppedBy(x) === null));
ok('a quota fact keeps its reset + slot; an overload carries neither', (() => {
  const q = SB.normalizeStoppedBy({ kind: 'quota', at: NOW, resetsAt: NOW + HOUR, memberId: 'm', said: 'x', extra: 1 });
  const o = SB.normalizeStoppedBy({ kind: 'overload', at: NOW, resetsAt: NOW + HOUR, memberId: 'm' });
  return q.resetsAt === NOW + HOUR && q.memberId === 'm' && !('extra' in q) && !('resetsAt' in o) && !('memberId' in o);
})());
ok('liveFactOf: a quota stop carries its switch and HOW the core waits for it (timed / early: a watch with its bucket / not at all); an overload and a harness with no resume verb carry none', (() => {
  const q = { kind: 'quota', at: NOW, resetsAt: NOW + HOUR }, o = { kind: 'overload', at: NOW };
  const on = SB.liveFactOf(q, { resume: 'prompt', enabled: true, armed: true }), noWait = SB.liveFactOf(q, { resume: 'prompt', enabled: true, armed: false, watch: false });
  const early = SB.liveFactOf(q, { resume: 'prompt', enabled: true, armed: true, watch: true, bucket: 'sevenDay' }), blind = SB.liveFactOf(q, { resume: 'prompt', enabled: true, armed: true, watch: true, bucket: null });
  const ov = SB.liveFactOf(o, { resume: 'prompt', enabled: true, armed: false }), noVerb = SB.liveFactOf(q, { resume: null, enabled: true });
  return on.autoResume === true && on.waiting === 'timed' && early.waiting === 'early' && blind.waiting === false && noWait.autoResume === true && noWait.waiting === false && ov.autoResume === null && noVerb.autoResume === null && SB.liveFactOf(null, {}) === null && SB.liveFactOf(q, null).autoResume === null;
})());
ok('the fact keeps the WALL\'s lane / bucket / scoped name (the switch\'s arm is the wall\'s); anything that is not a short word is dropped', (() => { const v = SB.stopVerdict({ walled: true, resetsAt: NOW + HOUR, at: NOW, lane: 'claude', bucket: 'sevenDay', scopedName: 'Fable' }); const n = SB.normalizeStoppedBy(v); const bad = SB.normalizeStoppedBy({ ...v, bucket: 'x'.repeat(80), lane: 'a\nb' }); return n.lane === 'claude' && n.bucket === 'sevenDay' && n.scopedName === 'Fable' && bad.bucket === null && bad.lane === null; })());
ok('the live fact carries the SERVER\'s waiting bound (statusFor maxWaitMs ⇒ waitBoundMs) — none for a stop that cannot continue', SB.liveFactOf({ kind: 'quota', at: 1, resetsAt: 2 }, { resume: 'prompt', enabled: true, armed: true, maxWaitMs: 93600000 }).waitBoundMs === 93600000 && SB.liveFactOf({ kind: 'overload', at: 1 }, { resume: 'prompt', enabled: true, maxWaitMs: 93600000 }).waitBoundMs === null);
ok('isStoppedBy is the filter predicate (a row with a valid fact; nothing else)', SB.isStoppedBy({ stoppedBy: { kind: 'overload', at: NOW } }) && !SB.isStoppedBy({ stoppedBy: null }) && !SB.isStoppedBy({}) && !SB.isStoppedBy(null));

// ── §3 STILL WALLED ─────────────────────────────────────────────────────────
console.log('§3 stillWalled (the pool\'s live verdict outranks the stored reset, both ways)');
{
  const qF = { kind: 'quota', at: NOW - HOUR, resetsAt: NOW + 2 * HOUR };
  const qP = { kind: 'quota', at: NOW - 3 * HOUR, resetsAt: NOW - MIN };
  const ov = { kind: 'overload', at: NOW - 5 * MIN };
  const W = (sb, v) => SB.stillWalled(sb, v, NOW);
  ok('quota, reset ahead, no verdict ⇒ walled until its stated reset', W(qF, null).walled && W(qF, null).until === NOW + 2 * HOUR);
  ok('quota, reset passed, no verdict ⇒ open', !W(qP, null).walled);
  ok('quota, reset ahead, but the pool serves NOW (usable:true — another member) ⇒ open', !W(qF, { usable: true }).walled);
  ok('quota, reset passed, but the pool says blocked until T ⇒ walled until T', W(qP, { usable: false, blockedUntil: NOW + HOUR }).walled && W(qP, { usable: false, blockedUntil: NOW + HOUR }).until === NOW + HOUR);
  ok('overload, no verdict ⇒ open (an overload has no reset to wait for)', !W(ov, null).walled);
  ok('overload on an account that has since WALLED ⇒ waits like any other', W(ov, { usable: false, blockedUntil: NOW + HOUR }).walled);
  ok('a verdict that cannot tell (usable undefined) falls back to the stated reset', W(qF, { usable: undefined }).walled && !W(qP, { usable: undefined }).walled);
}

// ── §4 THE PLAN ─────────────────────────────────────────────────────────────
console.log('§4 planBatch (who, in which order, who is skipped and why)');
{
  const f = (at, extra = {}) => ({ kind: 'quota', at, resetsAt: NOW - MIN, ...extra });
  const rows = [
    { id: 'late', name: 'Late', stoppedBy: f(NOW - 1 * HOUR), live: true, canResume: true },
    { id: 'early', name: 'Early', stoppedBy: { kind: 'overload', at: NOW - 5 * HOUR }, live: true, canResume: true },
    { id: 'mid', name: 'Mid', stoppedBy: f(NOW - 3 * HOUR), live: true, canResume: true },
    { id: 'gone', stoppedBy: f(NOW - 2 * HOUR), live: false, canResume: true },
    { id: 'busy', stoppedBy: f(NOW - 2 * HOUR), live: true, streaming: true, canResume: true },
    { id: 'shell', stoppedBy: f(NOW - 2 * HOUR), live: true, canResume: false },
    { id: 'walled', stoppedBy: f(NOW - 2 * HOUR, { resetsAt: NOW + HOUR }), live: true, canResume: true },
    { id: 'pool-walled', stoppedBy: f(NOW - 2 * HOUR), live: true, canResume: true, verdict: { usable: false, blockedUntil: NOW + 30 * MIN } },
    { id: 'quar', stoppedBy: f(NOW - 2 * HOUR), live: true, canResume: true, quarantined: NOW + 9 * MIN },
    { id: 'clean', live: true, canResume: true },
  ];
  const p = SB.planBatch(rows, { now: NOW });
  ok('EARLIEST STOP FIRST (the order the batch continues in)', p.eligible.map((e) => e.id).join(',') === 'early,mid,late', p.eligible.map((e) => e.id));
  const why = Object.fromEntries(p.skipped.map((s) => [s.id, s]));
  ok('skipped and NAMED: gone / running / no-verb / walled (stated reset) / walled (the pool) / quarantined', why.gone.why === 'gone' && why.busy.why === 'running' && why.shell.why === 'no-verb' && why.walled.why === 'walled' && why.walled.until === NOW + HOUR && why['pool-walled'].why === 'walled' && why['pool-walled'].until === NOW + 30 * MIN && why.quar.why === 'quarantined' && why.quar.until === NOW + 9 * MIN, p.skipped);
  ok('a session with no stop fact is neither resumed nor skipped (it is not in the set)', !p.eligible.some((e) => e.id === 'clean') && !p.skipped.some((s) => s.id === 'clean'));
  ok('the plan is deterministic on a tie (same instant ⇒ by id)', SB.planBatch([{ id: 'b', stoppedBy: f(NOW), live: true, canResume: true }, { id: 'a', stoppedBy: f(NOW), live: true, canResume: true }], { now: NOW + HOUR }).eligible.map((e) => e.id).join() === 'a,b');
}

// ── §5 THE WORDS ────────────────────────────────────────────────────────────
console.log('§5 the words (en, and zh/ja through the REAL client dictionaries)');
const zh = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default;
const ja = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
const tZh = (s, p) => fill(zh[s] !== undefined ? zh[s] : s, p);
{
  const at = new Date(2026, 9, 23, 13, 42).getTime(), now = new Date(2026, 9, 23, 13, 50).getTime(), reset = new Date(2026, 9, 23, 14, 0).getTime();
  const q = { kind: 'quota', at, resetsAt: reset, said: 'You hit your limit' }, o = { kind: 'overload', at };
  ok('zh quota chip: «因用量上限停止 · 14:00 重置» (the release\'s word for a usage limit, 用量上限)', SB.chipWords(q, tZh, { now, clock: CLK }).text === '因用量上限停止 · 14:00 重置', SB.chipWords(q, tZh, { now, clock: CLK }).text);
  ok('zh overload chip: «模型过载 · 停于 13:42»', SB.chipWords(o, tZh, { now, clock: CLK }).text === '模型过载 · 停于 13:42', SB.chipWords(o, tZh, { now, clock: CLK }).text);
  ok('zh toggle: «自动继续：开» / «自动继续：关»; a harness with no verb draws none (null)', SB.chipWords(q, tZh, { now, clock: CLK, autoResumeOn: true }).toggle === '自动继续：开' && SB.chipWords(q, tZh, { now, clock: CLK, autoResumeOn: false }).toggle === '自动继续：关' && SB.chipWords(q, tZh, { now, clock: CLK, autoResumeOn: null }).toggle === null);
  ok('en: "Stopped by a usage limit · resets 14:00" and a passed reset says so', SB.chipWords(q, null, { now, clock: CLK }).text === 'Stopped by a usage limit · resets 14:00' && SB.chipWords(q, null, { clock: CLK, now: reset + MIN }).text === 'Stopped by a usage limit · the limit has reset');
  ok('another day: the chip names the date (M/D HH:MM)', SB.chipWords({ kind: 'quota', at, resetsAt: new Date(2026, 9, 25, 9, 5).getTime() }, null, { now, clock: CLK }).text.endsWith('10/25 09:05'));
  ok('the page prints every stop time through page-time (the ONE formatter): the card and the skip rows hand its stampAt; the PURE default is no hand-built clock', /stoppedChipWords\(stopF, tr, \{[^}]*clock: stopClock \}\)/.test(read('src/lib/session-card.js')) && /const stopClock = \(ms, now\) => whenAt\(ms, \{ now \}\)/.test(read('src/lib/session-card.js')) && /t\('until \{time\}', \{ time: stampAt\(s\.until, \{ now: Date\.now\(\), words: true \}\) \}\)/.test(read('src/lib/bulk-resume.js')) && !/getHours|getMinutes/.test(read('src/stopped-by.js')));
  ok('the tip carries the harness\'s own line and how long the mark stays', /You hit your limit/.test(SB.chipWords(q, tZh, { now, clock: CLK }).tip) && /再次运行/.test(SB.chipWords(q, tZh, { now, clock: CLK }).tip));
  ok('zh filter: «因用量上限/过载停止 (3)»', SB.filterWords(3, tZh) === '因用量上限/过载停止 (3)');
  ok('the tip is ONE line (the instant tooltip collapses a newline): its parts joined by « · »', !/\n/.test(SB.chipWords(q, tZh, { now, clock: CLK }).tip) && SB.chipWords(q, tZh, { now, clock: CLK }).tip.split(' · ').length >= 3);
  ok('ON with no wait for THIS limit says so: «自动继续：开 · 这次上限不等待»', SB.chipWords(q, tZh, { now, clock: CLK, autoResumeOn: true, waiting: false }).toggle === '自动继续：开 · 这次上限不等待' && SB.chipWords(q, tZh, { now, clock: CLK, autoResumeOn: true, waiting: true }).toggle === '自动继续：开');
  ok('a WATCH it can open early says so: «自动继续：开 · 只在上限提前解除时继续» (never the timed promise)', SB.chipWords(q, tZh, { now, clock: CLK, autoResumeOn: true, waiting: 'early' }).toggle === '自动继续：开 · 只在上限提前解除时继续');
  ok('zh counts: «将开启 37 个会话；已开启 3 个»', SB.autoResumeAllWords({ total: 40, on: 3 }, tZh).line === '将开启 37 个会话；已开启 3 个', SB.autoResumeAllWords({ total: 40, on: 3 }, tZh));
  ok('zh buttons: «对所有会话开启自动继续» + «全部关闭»', SB.autoResumeAllWords({}, tZh).onButton === '对所有会话开启自动继续' && SB.autoResumeAllWords({}, tZh).offButton === '全部关闭');
  ok('zh resume button: «恢复所有因用量上限/过载停止的会话 (12)»; an EMPTY set SAYS so: «没有因用量上限停止的会话»', SB.resumeButtonWords(12, tZh) === '恢复所有因用量上限/过载停止的会话 (12)' && SB.resumeButtonWords(0, tZh) === '没有因用量上限停止的会话');
  ok('stopped sessions that cannot be resumed NOW are never «none stopped»: «3 个停下的会话现在都不能恢复»', SB.resumeButtonWords(0, tZh, { waiting: 3 }) === '3 个停下的会话现在都不能恢复' && SB.resumeButtonWords(0, tZh) === '没有因用量上限停止的会话');
  // the follow-up's cure: ONE in the singular (en + zh); a conversation running again is not counted as stopped; BOTH doors pinned
  ok('one stopped session is said in the singular: «The stopped session cannot be resumed now» / «这个停下的会话现在不能恢复»', SB.resumeButtonWords(0, null, { waiting: 1 }) === 'The stopped session cannot be resumed now' && SB.resumeButtonWords(0, tZh, { waiting: 1 }) === '这个停下的会话现在不能恢复' && SB.resumeButtonWords(0, null, { waiting: 2 }) === 'None of the 2 stopped sessions can be resumed now');
  ok('the count is of the STOPPED ones — a conversation running again (why «running») is not one of them', SB.waitingCount([{ why: 'walled' }, { why: 'running' }, { why: 'walled' }, { why: 'quarantined' }]) === 3 && SB.waitingCount(null) === 0);
  const BR = read('src/lib/bulk-resume.js');
  const bothDoors = (src) => /resumeButton: resumeButtonWords\(n, t, \{ waiting: waitingCount\(plan\.skipped\) \}\)/.test(src) && /resumeButtonWords\(0, t, \{ waiting: waitingCount\(p\.skipped\) \}\)/.test(src);
  ok('BOTH doors count the waiting ones the same way: the Settings row (planWords) and the dialog', bothDoors(BR));
  ok('RED: either door without it is caught (the Settings row\'s door had no control)', !bothDoors(BR.replace('{ waiting: waitingCount(plan.skipped) }', '{}')) && !bothDoors(BR.replace('{ waiting: waitingCount(p.skipped) }', '{}')));
  const skipped = Array.from({ length: 8 }, (_, i) => ({ id: 's' + i, why: 'walled', until: reset }));
  ok('zh outcome: «恢复了 29 个 · 跳过 8 个（仍在用量上限内）· 拒绝 0»', SB.summaryWords({ resumed: 29, skipped, refused: 0 }, tZh) === '恢复了 29 个 · 跳过 8 个（仍在用量上限内）· 拒绝 0', SB.summaryWords({ resumed: 29, skipped, refused: 0 }, tZh));
  ok('mixed skips say how many of them are walls; an undelivered continue is counted aloud', /跳过 9 个（其中 8 个仍在用量上限内）/.test(SB.summaryWords({ resumed: 1, skipped: [...skipped, { why: 'running' }], refused: 0, failed: 2 }, tZh)) && /未能送达 2/.test(SB.summaryWords({ resumed: 1, skipped, failed: 2 }, tZh)));
  ok('a batch cut short says how many it never reached: «… · 未轮到 2»; the cure\'s three skip reasons have words', /· 未轮到 2$/.test(SB.summaryWords({ resumed: 1, skipped: [], refused: 0, notReached: 2 }, tZh)) && ['resumed', 'pending', 'moved-refused'].every((k) => SB.SKIP_KEYS[k] && zh[SB.SKIP_KEYS[k]]));
  // lg-recovery U2 cure: a refusal re-asked before ITS continue is said BY NAME with the authorizer's own reason; a reason not
  // in the table says the skip alone (never a raw code); every skipped row grouped by reason with its count; «stopped n»
  ok('U2 cure: a skip the spend guard refused before its continue says WHICH rule: «花费守卫这次拒绝了它（它的账号正在按超额付费）»; an unknown reason says the skip alone', SB.skipWords({ why: 'refused', reason: 'overage-in-use' }, tZh) === '花费守卫这次拒绝了它（它的账号正在按超额付费）' && SB.skipWords({ why: 'refused', reason: 'identity-unknown' }, tZh) === '花费守卫这次拒绝了它' && SB.skipWords({ why: 'moved-refused', reason: 'hour-cap' }, null) === 'the account it moved to refused the spend (its account used its turns nobody typed this hour)', SB.skipWords({ why: 'refused', reason: 'overage-in-use' }, tZh));
  ok('U2 cure: the skipped rows GROUPED by reason with their counts, in the order they first appear — every row kept (never «and n more»)', (() => { const g = SB.skipGroups([{ id: 'a', why: 'walled', until: reset }, { id: 'b', why: 'refused', reason: 'overage-in-use' }, { id: 'c', why: 'walled', until: reset + 60000 }, ...Array.from({ length: 50 }, (_, i) => ({ id: 'r' + i, why: 'running' }))], tZh); return g.length === 3 && g[0].n === 2 && g[0].head === '仍在用量上限内 —— 2 个' && g[1].rows[0].id === 'b' && g[2].n === 50 && g.reduce((n, x) => n + x.rows.length, 0) === 53; })());
  ok('U2 cure: a batch a Stop cut short says it: «… · 已停止 3»', /· 已停止 3$/.test(SB.summaryWords({ resumed: 1, skipped: [], refused: 0, stopped: 3 }, tZh)), SB.summaryWords({ resumed: 1, skipped: [], refused: 0, stopped: 3 }, tZh));
  ok('zh skip row: «仍在用量上限内，至 14:00»', SB.skipWords({ why: 'walled', until: reset }, tZh, { now, clock: CLK }) === '仍在用量上限内，至 14:00', SB.skipWords({ why: 'walled', until: reset }, tZh, { now, clock: CLK }));
  const params = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  const miss = { zh: [], ja: [], params: [] };
  for (const k of SB.WORD_KEYS) {
    if (zh[k] === undefined) miss.zh.push(k);
    if (ja[k] === undefined) miss.ja.push(k);
    for (const d of [zh, ja]) if (d[k] !== undefined && params(d[k]) !== params(k)) miss.params.push(k);
  }
  ok(`every word key (${SB.WORD_KEYS.length}) is in zh AND ja, {params} kept`, !miss.zh.length && !miss.ja.length && !miss.params.length, miss);
  ok('CONTROL: the census bites — a key missing from the dictionary is reported', zh['Stopped by a usage limit · resets {time} (planted)'] === undefined);
}

// ── §6 WIRING PINS ──────────────────────────────────────────────────────────
console.log('§6 wiring pins');
{
  const eng = read('src/server/usage-pool-engine.js');
  ok('the engine writes the fact at the WALLED turn — after the demotion, whatever auto-resume says (before its `armIfEnabled` early return)', (() => {
    const i = eng.indexOf('function onWalledTurn('), d = eng.indexOf('demoteWalledAccount(session, sigs)', i), w = eng.indexOf('noteStoppedBy(session, stoppedBy.stopVerdict({ walled: true', i), a = eng.indexOf('if (!ar?.armIfEnabled) return;', i);
    return i > 0 && d > i && w > d && a > w;
  })());
  ok('the normal turn end decides overload from the harness\'s DECLARED enum, else clears', /stoppedBy\.stopVerdict\(\{ lastError: lastError\.error, overloadErrors: harnesses\.overloadErrorsOf\(session\.backend\)/.test(eng) && /if \(ov\) noteStoppedBy\(session, ov\); else clearStoppedBy\(session, 'turn completed'\);/.test(eng));
  ok('a turn that produces (claude main thread) clears it; the fact is persisted through the meta store', /if \(session\._stoppedBy\) noteTurnRunning\(session\);/.test(eng) && /sessionMetaStore\.patchSessionMeta\(session\.sockName, \{ stoppedBy: session\._stoppedBy \|\| null \}, \{ owner: session\._webuiId \|\| null \}\)/.test(eng));
  ok('codex task_started and an ACP prompt_start END the stop; codex task_failed hands its typed enum through codexErrorEnum', /task_started[^\n]*\n?[^\n]*noteTurnRunning\?\.\(session\)/.test(read('src/server/stdout/codex-events.js')) && /codexErrorEnum\(p\.codexErrorInfo \?\? p\.codex_error_info\)\.name/.test(read('src/server/stdout/codex-events.js')) && /prompt_start[^\n]*\n[^\n]*noteTurnRunning\?\.\(session\)/.test(read('src/server/stdout/acp-events.js')));
  ok('codex: a LATE task_failed (a backlog) or one the app-server will RETRY marks nothing; the stop carries the record\'s own instant', /task_failed' && !recordIsLate\?\.\(session, msg\) && msg\.payload\.willRetry !== true && msg\.payload\.will_retry !== true\)/.test(read('src/server/stdout/codex-events.js')) && /\{ final: true, at: Date\.parse\(msg\.timestamp\) \|\| null \}/.test(read('src/server/stdout/codex-events.js')) && /function noteTurnError\(session, error, said = null, \{ final = false, at = null \} = \{\}\)/.test(eng));
  ok('the wall\'s reset is the STATED one or none — never the verdict\'s blockedUntil (a guess the engine may have written)', /const resetsAt = stated \|\| 0;/.test(eng) && !/const resetsAt = stated \|\| \(\(\) => \{ try \{ return Number\(quotaVerdictFor/.test(eng));
  ok('the stream\'s road reads nothing from the mount: the stop fact goes through the store\'s patchSessionMeta (its pending copy, else an async read; no stub for a socket with no meta)', (() => { const i = eng.indexOf('function persistStoppedBy(session) {'); const b = eng.slice(i, eng.indexOf('\n}\n', i)); const st = read('src/server/session-stdout.js'); return i > 0 && !/readSessionMeta/.test(b) && /function patchSessionMeta\(sockName, patch, \{ owner = null \} = \{\}\)/.test(st) && /fs\.promises\.readFile\(fp, 'utf-8'\)/.test(st) && /if \(!m \|\| typeof m !== 'object' \|\| !Object\.keys\(m\)\.length \|\| !mine\(m\)\) return false;/.test(st); })());
  ok('the claude consumer notes the typed error of EVERY main-thread assistant record (synthetic ones included), never a backlog\'s', /!msg\.isSidechain && !recordIsLate\?\.\(session, msg\)\) \{\s*\n\s*try \{ const tb = [^\n]*noteTurnError\?\.\(session, typeof msg\.error === 'string' \? msg\.error : null/.test(read('src/server/stdout/claude-stream-json.js')));
  ok('the descriptors DECLARE the enum (quota.overloadErrors) and the registry validates + hands it out', /overloadErrors: Object\.freeze\(\['overloaded'\]\)/.test(read('src/harnesses/claude-quota.js')) && /overloadErrors: Object\.freeze\(\['serverOverloaded'/.test(read('src/harnesses/codex-quota.js')) && /function overloadErrorsOf\(id\)/.test(read('src/harnesses/index.js')) && /quota\.overloadErrors must be a list/.test(read('src/harnesses/index.js')));
  ok('boot restores the fact AND the per-session auto-resume flag (sessionFromMeta — all restore paths)', /_stoppedBy: meta\.stoppedBy && typeof meta\.stoppedBy === 'object' \? meta\.stoppedBy : null/.test(read('src/server/boot-restore.js')) && /typeof meta\.autoResume === 'boolean' \? \{ _autoResume: meta\.autoResume \}/.test(read('src/server/boot-restore.js')));
  ok('the live list carries it (server.js payload) and the sidebar GATES on a scalar projection of it', /stoppedBy: s\._stoppedBy \? \(\(\) => \{ try \{ return require\('\.\/src\/stopped-by\.js'\)\.liveFactOf\(s\._stoppedBy, autoResume\.statusFor\(id\)\); \} catch \{ return require\('\.\/src\/stopped-by\.js'\)\.liveFactOf\(s\._stoppedBy, null\); \} \}\)\(\) : null,/.test(read('server.js')) && /stoppedBy: \{ digest: \(v\) => \(v && typeof v === 'object' \? `\$\{v\.kind\}\|/.test(read('src/lib/sidebar.js')));
  ok('the card draws the chip from chipWords; the filter row\'s pill reads isStoppedBy', /stoppedChipWords\(stopF, tr,/.test(read('src/lib/session-card.js')) && /stoppedOnly: ctx\.stoppedOnly, stoppedBy: ctx\.stoppedOnly \? isStoppedBy\(s\) : false,/.test(read('src/lib/sidebar.js')) && /if \(f\.stoppedOnly && !f\.tasksTab && !f\.stoppedBy\) return \{ show: false, why: 'stopped' \};/.test(read('src/locate-verdict.js')));   // B-b842: the pill is a fact of the list's ONE predicate (never on the Tasks board)
  ok('PURE: src/stopped-by.js requires nothing and names no harness id', !/require\(/.test(read('src/stopped-by.js').replace(/^\s*\/\/.*$/gm, '')) && !/'(claude|codex|shell|opencode|antigravity)'/.test(read('src/stopped-by.js').replace(/^\s*\/\/.*$/gm, '')));
}

// FORM TWO (主开发 2026-11-18 16:20Z): a conversation left stopped because the press is refused on ITS account — one group per
// account, the account NAMED in the rule: «left stopped (B is billing paid overage) — 10»
{
  const rows = [{ id: 'b1', why: 'account-refused', reason: 'overage-in-use', member: 'B' }, { id: 'b2', why: 'account-refused', reason: 'overage-in-use', member: 'B' }, { id: 'c1', why: 'account-refused', reason: 'overage-in-use', member: 'C' }];
  const en = SB.skipGroups(rows, null).map((g) => g.head), zhW = SB.skipGroups(rows, tZh).map((g) => g.head);
  ok('FORM TWO: one group per refused ACCOUNT, the account named in the rule (en)', en.join(' | ') === 'left stopped (B is billing paid overage) — 2 | left stopped (C is billing paid overage) — 1', JSON.stringify(en));
  ok('FORM TWO: the machine\'s own login is named in words, never by its ledger key', SB.skipGroups([{ id: 'g1', why: 'account-refused', reason: 'overage-in-use', member: '__global__' }], null)[0].head === 'left stopped (This machine’s own login is billing paid overage) — 1' && /本机自己的登录/.test(SB.skipGroups([{ id: 'g1', why: 'account-refused', reason: 'overage-in-use', member: '__global__' }], tZh)[0].head), JSON.stringify(SB.skipGroups([{ id: 'g1', why: 'account-refused', reason: 'overage-in-use', member: '__global__' }], tZh)));
  ok('FORM TWO: …and in zh (the account named in the rule)', /^留在停止状态.*B 正在使用付费超额.*2 个$/.test(zhW[0]), JSON.stringify(zhW));
}

// THE PRESSES OF THE DAY in a person's words (主开发 2026-11-18 21:04Z (a)) — the spending view's lines; and the page's three smalls
{
  const P = [{ at: 2, press: 'rb-2', planned: 3, delivered: null, byAccount: [] }, { at: 1, press: 'rb-1', planned: 30, delivered: 28, byAccount: [{ key: '__global__', name: '__global__', n: 20 }, { key: 'B', name: 'B', n: 8 }] }];
  const clk = (ms) => (ms === 1 ? '14:02' : '15:10');
  const en = SB.pressWords(P, null, { clock: clk, running: 'rb-2' }), zhP = SB.pressWords(P, tZh, { clock: clk, running: 'rb-2' });   // rb-2 is the batch running now
  ok('PRESSES OF THE DAY (en): the head counts them; a press says planned and continued, a running one says so; the accounts with the machine\'s login in words', en.head === 'Your presses today (2)' && en.rows[0].line === '15:10 — 3 planned, still running' && en.rows[1].line === '14:02 — 30 planned, 28 continued' && en.rows[1].accounts.join(' · ') === 'This machine’s own login: 20 · B: 8', JSON.stringify(en));
  ok('PRESSES OF THE DAY (zh)', zhP.head === '你今天的批量恢复（2 次）' && /计划 30 个，已继续 28 个/.test(zhP.rows[1].line) && /本机自己的登录：20/.test(zhP.rows[1].accounts[0]), JSON.stringify(zhP));
  ok('PRESSES OF THE DAY: none ⇒ no block at all (null)', SB.pressWords([], null) === null && SB.pressWords(null, null) === null);
  // 主开发 21:55Z (the MUST): a press not ended is RUNNING only while it is the running batch — else a restart cut it short, said
  // with how many it had continued; CONTROL first: the same row while its batch IS the running one reads «still running»
  const cutRow = [{ at: 3, press: 'rb-9', planned: 30, delivered: null, byAccount: [{ key: 'A', name: 'A', n: 7 }, { key: 'B', name: 'B', n: 2 }] }];
  const live9 = SB.pressWords(cutRow, null, { clock: () => '09:00', running: 'rb-9' }), cut9 = SB.pressWords(cutRow, null, { clock: () => '09:00', running: null }), cut9zh = SB.pressWords(cutRow, tZh, { clock: () => '09:00', running: 'rb-other' });
  ok('PRESSES OF THE DAY — CONTROL FIRST: the row of the batch running NOW reads «still running»', live9.rows[0].line === '09:00 — 30 planned, still running', live9.rows[0].line);
  ok('PRESSES OF THE DAY: the same row with NO batch running (a restart) reads «cut short by a restart after 9 continued» — never «still running» for a day (zh too, with another batch running)', cut9.rows[0].line === '09:00 — 30 planned, cut short by a restart after 9 continued' && /被重启打断/.test(cut9zh.rows[0].line) && /已继续 9 个/.test(cut9zh.rows[0].line), JSON.stringify({ en: cut9.rows[0].line, zh: cut9zh.rows[0].line }));
  ok('the page (21:55Z): the Settings row hands the running batch to the words, and an UNREADABLE record (null) says so — never an empty list read as no presses', /pressWords\(plan && plan\.presses, t, \{ clock: [^}]*\}\), running: plan && plan\.running \}\)/.test(read('src/lib/bulk-resume.js')) && /if \(plan && plan\.presses === null\) box\.appendChild/.test(read('src/lib/bulk-resume.js')));
  const page = read('src/lib/bulk-resume.js');
  ok('the page (21:04Z (c)): no quiet preview read ⇒ «could not be read now», never «still refused»', /!overKnown \? t\('[^']*Whether an account in paid overage would be refused could not be read now/.test(page));
  ok('the page (21:04Z (d)): the account billed as overage is named OUTSIDE the cost box\'s condition (an estimate missing names it too)', /if \(n && overAllowed && Array\.isArray\(p\.overage\.billed\) && p\.overage\.billed\.length\) \{/.test(page) && !/if \(cw\) \{[^}]*bill paid overage/.test(page));
  ok('the page (21:04Z (e)): the two other account refusals have their door — sign it in again; the vendor\'s spend control', /why === 'identity-cannot-serve'\) return ' ' \+ t\('Sign the account in again \(Accounts\)\.'\)/.test(page) && /why === 'spend-control-reached'\) return ' ' \+ t\('Its spend control is set with its vendor — raise it there\.'\)/.test(page));
  ok('the page (21:04Z (a)): the Settings row lists the presses of the day from the plan', /pressWords\(plan && plan\.presses, t,/.test(page));
}

console.log(`\n${failed ? 'FAILED' : 'ALL PASS'} (${passed} passed, ${failed} failed)`);
process.exit(failed ? 1 : 0);
