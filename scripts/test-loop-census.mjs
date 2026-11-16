#!/usr/bin/env node
// test-loop-census — lane hub-loop-stalls, unit loop-day-report M3: WHAT THE MAIN LOOP SPENDS ITSELF ON, BY ENGINE (FAST:
// PURE + the REAL watchdog thread in this process for ~4.5 s, 1.24 s of it a planted burn; src/loop-census.js, the census in
// src/server/sync-fs-witness-worker.js, `census()` in src/server/sync-fs-witness.js).
//   ① PURE — familyOf over one path per family (+ the two files the table's ORDER decides, node_modules, outside the
//      install); bookOf over sample answers (node_modules / internals / eval'd frames skipped, the instrument trimmed, no
//      frame ⇒ native, a stand-down ⇒ not sampled); slowerAfter (the rate halves past the bound, no slower than the
//      floor); censusFold of a FIXED take ⇒ a FIXED result
//   ② THE TABLE COVERS THE TREE — every file under src/ (read from disk) in exactly one family; the counts printed
//   ③ LIVE — the real watchdog at a dense test rate (50 ms) over a scratch install: a burn inside
//      <scratch>/src/server/channels-burn.js ⇒ its busy ticks book «channels», the idle half books idle; the setting off ⇒
//      paused, nothing asked; a 0.8 s synchronous child under a 0.4 s hold bar ⇒ held, and THE HOLD TAKES the census's ask
//      in flight (its first sample — never a wait behind it); a capture running ⇒ the census asks nothing; the take resets
//   ④ the doors — no watchdog / the census off ⇒ census() answers null; the three takers through one function
// MUTANTS (each run on a scratch COPY outside every worktree, each red here): the familyOf rule (① ③a), the priority
// rule — the hold does not take the census's ask (③c) / the census asks while a capture runs (③d) — the reset at take (③e).
// Run: TZ=UTC node scripts/test-loop-census.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const LC = require(path.join(REPO, 'src/loop-census.js'));
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-loop-census-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── ① PURE ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① PURE — the families table, one answer booked, the rate, one take folded');
{
  const FIX = [
    ['src/server/channels-engine.js', 'channels'], ['src/channel-store.js', 'channels'], ['src/channels/slack.js', 'channels'], ['src/routes/channels.js', 'channels'],
    ['src/server/usage-pool-engine.js', 'pool'], ['src/account-pool-auto.js', 'pool'], ['src/harnesses/claude-quota.js', 'pool'],
    ['src/agent-routes.js', 'hook'], ['src/agent-routes/status.js', 'hook'], ['src/server/hooks-late.js', 'hook'],
    ['src/server/stdout/claude-stream-json.js', 'parse'], ['src/message-manager.js', 'parse'], ['src/server/session-stdout.js', 'parse'],
    ['src/server/browser-keeper.js', 'browser'], ['src/browser-backends/cdp.js', 'browser'],
    ['src/jobs.js', 'jobs'], ['src/server/jobs-wiring.js', 'jobs'],
    ['src/ws-handler.js', 'page'], ['src/server/session-broadcast.js', 'page'], ['src/server/task-fanout.js', 'page'],
    ['src/turn-carry.js', 'hook'], ['src/agy-turn-usage.js', 'pool'],   // «turn» is parse's word too: the table's ORDER decides these two
    ['src/server/loop-blame.js', 'rest'], ['server.js', 'rest'], ['src/desktop-browser-app.js', 'rest'], ['src/server/sync-fs-witness.js', 'rest'],
    ['node_modules/ws/lib/websocket.js', 'rest'], ['data/plugins/x/index.js', 'rest'], ['', 'rest'],
  ];
  const wrong = FIX.map(([p, id]) => [p, id, LC.familyOf(p)]).filter(([, id, got]) => got !== id);
  ok(!wrong.length && LC.IDS.every((id) => FIX.some(([, f]) => f === id)) && LC.IDS.join() === 'channels,pool,hook,parse,browser,jobs,page,rest',
    `familyOf: one path per family (${LC.IDS.join(', ')}), the two the ORDER decides, a node_modules path and one outside src/ are the rest`, wrong);
  // the sample's own encoding (src/loop-hold.js SAMPLE_EXPR): 'C' + <n>:<name><n>:<file><line>,<own line><e|n> each
  const C = (frames) => 'C' + frames.map(({ fn = 'f', file, ev = false }) => `${fn.length}:${fn}${file.length}:${file}3,1${ev ? 'e' : 'n'}`).join('');
  const R = '/srv/hub';
  const S = (lines) => { const t = ['Error', ...lines].join('\n'); return `S${t.length}:${t}`; };
  const cases = [
    [C([{ file: `${R}/node_modules/ws/lib/receiver.js` }, { file: 'node:internal/streams/readable' }, { file: `${R}/src/server/channels-engine.js` }, { file: `${R}/server.js` }]), 'channels', 'node_modules and Node\'s internals skipped: the innermost frame of the install'],
    [C([{ fn: 'hr', file: `${R}/src/server/loop-blame.js` }, { file: `${R}/src/server/sync-fs-witness.js` }, { file: 'node:fs' }, { file: `${R}/src/usage-history.js` }]), 'pool', 'the instrument\'s own frames after a wrapped sync call trimmed: its caller'],
    [C([{ fn: 'hr', file: `${R}/src/server/loop-blame.js` }, { file: `${R}/src/server/sync-fs-witness.js` }]), 'rest', 'a stack that is the instrument\'s alone stays the instrument\'s'],
    [C([{ file: `${R}/src/jobs.js`, ev: true }, { file: `${R}/src/ws-handler.js` }]), 'page', 'an eval\'d frame is never the install\'s'],
    [C([{ file: '' }, { file: 'node:internal/timers' }, { file: '/elsewhere/plugin.js' }]), 'rest', 'no frame of the install: the rest'],
    [C([]), 'native', 'no JavaScript frame: native'],
    [S(['    at f0 (/srv/hub/src/x.js:1:1)', '    at f (/srv/hub/src/jobs.js:3:4)', '    at g (/srv/hub/src/ws-handler.js:5:6)']), 'jobs', 'the string form (locations only) books the same way'],
    ['D', null, 'a debugger\'s stand-down: not sampled'], ['A', null, 'an accessor\'s stand-down: not sampled'], [S(['garbage']), null, 'frames unreadable: not sampled'], [null, null, 'no text: not sampled'],
  ];
  const bad = cases.map(([t, want, why]) => [why, want, LC.bookOf(t, R)]).filter(([, want, got]) => got !== want);
  ok(!bad.length, `bookOf: ${cases.map(([, , why]) => why).join('; ')}`, bad);
  const sl = [LC.slowerAfter(1000, 4.5), LC.slowerAfter(1000, LC.ASK_BOUND_MS), LC.slowerAfter(4000, 9), LC.slowerAfter(8000, 50), LC.slowerAfter(1000, NaN), LC.slowerAfter(1000, 0.2)];
  ok(JSON.stringify(sl) === '[2000,null,8000,null,null,null]' && LC.ASK_BOUND_MS === 4 && LC.CENSUS_FLOOR_MS === 8000 && LC.CENSUS_EVERY_MS === 1000,
    'slowerAfter: an ask past 4 ms halves the rate (1 s → 2 s, 4 s → 8 s), never slower than one per 8 s; at the bound or under, unchanged', sl);
  const TAKE = { ev: 'census', id: 7, fromM: 1000, toM: 3601000, everyMs: 1000, ticks: { idle: 1500, held: 30, stopped: 0, notSampled: 12, paused: 8 }, pausedBy: { heap: 8 },
    families: { channels: 600, pool: 300, parse: 150, page: 150, rest: 90, native: 60, hook: 0, renamed: 10 }, asks: 1290, askOwnMs: 258, askMaxMs: 1.75, halved: null };
  const w = (id) => (id === 'rest' ? LC.REST.words : LC.FAMILIES.find((f) => f.id === id).words);
  const row = (id, n) => ({ family: id, words: w(id), ticks: n, share: n / 1360 });
  const WANT = { fromM: 1000, toM: 3601000, everyMs: 1000, sampledTicks: 2890, busyTicks: 1360, busyShare: 1360 / 2890,
    shares: [row('channels', 600), row('pool', 300), row('parse', 150), row('page', 150), row('rest', 100), row('hook', 0), row('browser', 0), row('jobs', 0)],
    native: { ticks: 60, share: 60 / 1360, words: LC.NATIVE_WORDS }, idle: { ticks: 1500, share: 1500 / 2890 }, held: { ticks: 30, share: 30 / 2890 }, stopped: { ticks: 0, share: 0 },
    notSampled: { ticks: 20, paused: 8, pausedBy: { heap: 8 } }, cost: { asks: 1290, ownMs: 258, meanMs: 0.2, maxMs: 1.75, halved: null }, words: LC.TICK_WORDS };
  const F = LC.censusFold(TAKE);
  ok(JSON.stringify(F) === JSON.stringify(WANT) && Math.abs(F.shares.reduce((s, x) => s + x.share, 0) + F.native.share - 1) < 1e-12,
    'censusFold of a FIXED take ⇒ a FIXED result: every family a share of the BUSY ticks (larger first, a tie in the table\'s order, a family id it does not know is the rest\'s), native beside them — together 1; idle / held of the sampled; paused counted not sampled; the asks\' cost', F);
  const E = LC.censusFold(null);
  ok(E.busyTicks === 0 && E.busyShare === null && E.shares.length === 8 && E.shares.every((x) => x.share === null) && E.cost.meanMs === null, 'an empty take folds to nothing claimed (no share without a tick)', E);
}

// ── ② THE TABLE COVERS THE TREE ───────────────────────────────────────────────────────────────────────────────────────
console.log('② the table covers the tree — every file under src/ in exactly one family');
{
  const files = [];
  (function walk(rel) { for (const e of fs.readdirSync(path.join(REPO, rel), { withFileTypes: true })) { const r = `${rel}/${e.name}`; if (e.isDirectory()) walk(r); else if (e.isFile()) files.push(r); } })('src');
  const by = Object.fromEntries(LC.IDS.map((id) => [id, 0])), twice = [];
  for (const f of files) {
    by[LC.familyOf(f)]++;
    const hits = LC.FAMILIES.filter((x) => x.rules.some((re) => re.test(f))).map((x) => x.id);
    if (hits.length > 1) twice.push(`${f.slice(4)} → ${hits.join(' before ')}`);
  }
  console.log(`    ${LC.IDS.map((id) => `${id} ${by[id]}`).join(' · ')} — ${files.length} files; the order decides: ${twice.join(', ') || 'none'}`);
  ok(files.length > 500 && LC.IDS.reduce((s, id) => s + by[id], 0) === files.length && LC.IDS.every((id) => by[id] > 0) && files.every((f) => LC.IDS.includes(LC.familyOf(f))),
    `every one of the ${files.length} files under src/ is in exactly one family, and every family takes at least one file (no rule matches nothing)`, by);
}

// ── ③ LIVE ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('③ LIVE — the real watchdog thread in this process, a dense test rate (50 ms), a scratch install');
const ROOT = path.join(TMP, 'install');
fs.mkdirSync(path.join(ROOT, 'src/server'), { recursive: true });
// the planted work: a module whose install-relative path is the channels family's (its frames are the only install frames)
fs.writeFileSync(path.join(ROOT, 'src/server/channels-burn.js'), "'use strict';\nfunction burn(span) { const t0 = Date.now(); let x = 0; while (Date.now() - t0 < span) x += Math.sqrt(x + 1); return x; }\nmodule.exports = { burn };\n");
const B = require(path.join(ROOT, 'src/server/channels-burn.js'));
const SFW = require(path.join(REPO, 'src/server/sync-fs-witness.js'));
const said = [];
let samplingOn = true;
const quiet = { warn: (l) => said.push(String(l)), log() {}, error() {}, info() {} };
const W = SFW.create({ rootDir: ROOT, armed: true, readMountinfo: () => '', fresh: true, beatMs: 50, holdMs: 400, noAnswerMs: 50, liveMs: 60000, censusEveryMs: 50, samplingOn: () => samplingOn,
  log: quiet, holdsOptions: { eluEveryMs: 50, eluBeforeMs: 500, captureMs: 800, captureEveryMs: 20, autoCapture: false } }).start({ installHook: false });
const sumOf = (t) => Object.values(t.ticks).reduce((s, n) => s + n, 0) + Object.values(t.families).reduce((s, n) => s + n, 0);
try {
  await sleep(400);   // the watchdog thread up
  ok(!!(await W.census()), 'census() answers the take of a running census');
  // (a) half busy inside the channels family, half idle
  for (let i = 0; i < 6; i++) { B.burn(140); await sleep(1); }
  await sleep(400);
  const a = await W.census(), fa = LC.censusFold(a);
  ok(a && a.families.channels >= 5 && fa.shares[0].family === 'channels' && fa.shares[0].share > 0.5 && a.ticks.idle >= 5 && a.asks >= 5 && a.askMaxMs > 0 && a.everyMs === 50,
    `(a) a burn inside src/server/channels-burn.js: «channels» books ${a && a.families.channels} of ${fa.busyTicks} busy ticks, the idle half ${a && a.ticks.idle} idle ticks; ${a && a.asks} asks, their own run ${a && a.askOwnMs.toFixed(2)} ms (largest ${a && a.askMaxMs.toFixed(3)} ms)`, a);
  // (b) the setting off: paused, nothing asked
  samplingOn = false; await sleep(300);
  const b = await W.census();
  samplingOn = true; await sleep(150); await W.census();
  ok(b && b.ticks.paused >= 3 && b.pausedBy.off >= 3 && b.asks === 0, `(b) the sampling setting off pauses the census as it stops a capture: ${b && b.ticks.paused} ticks paused (off), nothing asked`, b);
  // (c) a hold: a synchronous child (no JavaScript runs) past the 0.4 s bar — the census's ask in flight is TAKEN by the hold
  const h0 = W.holds().ring().length;
  cp.spawnSync('sleep', ['0.8']);
  await sleep(300);
  const c = await W.census(), held = W.holds().ring().slice(h0);
  ok(c && held.length === 1 && held[0].samples >= 1 && c.ticks.held >= 1 && c.ticks.notSampled >= 1,
    `(c) a 0.8 s synchronous child: ${c && c.ticks.held} ticks held; the HOLD TOOK the census's ask in flight — its first sample «${held[0] && held[0].frame}» — and the census's waiting ticks are not sampled (${c && c.ticks.notSampled})`, { c, held });
  // (d) a capture running: the census asks nothing (its busy ticks are not sampled); the capture samples
  const r = W.holds().startCapture({ auto: false });
  await W.census();   // after the capture's message (one port, in order): this take's window lies inside the capture
  for (let i = 0; i < 4; i++) { B.burn(100); await sleep(1); }
  const d = await W.census();
  for (let i = 0; i < 40 && !W.holds().captureReport().last; i++) await sleep(100);   // the capture's end (its 0.8 s window, then its names)
  const last = W.holds().captureReport().last;
  ok(r.ok && d && d.asks === 0 && d.ticks.notSampled >= 3 && last && last.samples >= 10,
    `(d) while a capture runs the census asks nothing: ${d && d.ticks.notSampled} busy ticks not sampled, ${d && d.asks} asks — the capture took ${last && last.samples} samples`, { r, d, last: last && { samples: last.samples, split: last.split } });
  // (e) the take resets: the next hour starts where it ended, from zero
  await sleep(250);
  const e1 = await W.census(), e2 = await W.census();
  ok(e1 && e2 && e2.fromM === e1.toM && sumOf(e1) >= 3 && sumOf(e2) <= 2 && e2.asks <= 1 && e2.halved === null,
    `(e) a take resets the counts: the next starts at its end (${e1 && sumOf(e1)} ticks, then ${e2 && sumOf(e2)})`, { e1, e2 });
} finally { W.stop(); }

// ── ④ THE DOORS ───────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ the doors');
{
  const none = SFW.create({ rootDir: ROOT, readMountinfo: () => '', fresh: true, live: false, log: quiet }).start({ installHook: false });
  const off = SFW.create({ rootDir: ROOT, readMountinfo: () => '', fresh: true, beatMs: 50, holdMs: 400, censusEveryMs: 0, log: quiet }).start({ installHook: false });
  await sleep(200);
  const [n1, n2] = [await none.census(), await off.census()];
  none.stop(); off.stop();
  ok(n1 === null && n2 === null, 'census() answers null with no watchdog thread and with the census off (no take, never a guess)', { n1, n2 });
  const WK = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8');
  ok(/const q = takeCensusAsk\(\{ kind: 'hold', h \}\) \|\| ask\(\{ kind: 'hold', h \}\);/.test(WK) && /if \(!hold\) takeCensusAsk\(\{ kind: 'capture', c, pending: \[\] \}\);/.test(WK)
    && /if \(!hold && takeCensusAsk\(\{ kind: 'profile', pr, pq: \{ countedTo: now, counted: false \} \}\)\) return;/.test(WK)
    && /const k = CC\.tickOf\(\{ state, wchan, sys, beatAgeMs: now - T\[1\], freshMs: 2 \* beatMs \+ noAnswerMs, holdOpen: !!hold, mine: own, other: \(!!inflight && !own\) \|\| !!cap \|\| !!prof \}\);/.test(WK)
    && /startCensus\(censusEveryMs\);/.test(WK),
    'the watchdog: a hold, a capture and a profile TAKE the census\'s ask through ONE function; the census\'s tick is a capture\'s tick (CC.tickOf) with every other asker counted as «another ask out»; it starts with the watchdog');
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
