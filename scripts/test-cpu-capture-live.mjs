#!/usr/bin/env node
// test-cpu-capture-live — lane hub-loop-stalls commit 3, THE LIVE LEGS of the CPU capture (HEAVY: real child processes,
// ONE at a time, no hub; each child runs the REAL watchdog — src/server/sync-fs-witness.js + its thread +
// src/server/loop-holds.js — at PRODUCTION timings: the beat 250 ms, a hold 1 s, the capture 20 s at 50 ms; the trigger's
// lag reading is injected — test-cpu-capture pins the verdict itself):
//   Ⓐ THE SATURATED LOOP: a KNOWN busy function at ~80 % in callbacks of 50–200 ms (nothing ≥ 1 s) — commit 1 says nothing
//      (no [loop-hold] line); the trigger's capture names the function FIRST, its share within ±10 points of the child's
//      own measured truth; ONE block ≤ 15 lines; its .cpuprofile kept and its own table the block's; a second trigger
//      inside the interval captures nothing. Its samples are judged at the rate the capture SAYS it ran: asked every 50 ms,
//      halved only where an ask passed its bound and the block says so (the hosted runner's .401 heavy: one ask took 4.36 ms
//      ⇒ every 100 ms, 244 samples) — a pin on that capture's own record first
//   Ⓑ THE SWITCH OFF: nothing automatic, the door works
//   Ⓒ IDLE IS NEVER WORK: ~10 % busy in one callback ⇒ ~10 % work, ~90 % idle — never that callback at 100 %; and a
//      MUTANT of the worker's tick (its idle rule removed, a scratch copy of src/) is RED by name
//   Ⓓ NATIVE TIME ON ITS CALLER: a function spending its time in one big JSON.parse is named by its JavaScript caller;
//      the block says «time inside native calls is counted on the JavaScript caller»
//   Ⓔ THE COLLECTOR FROM ITS RECORD: an allocating function ⇒ «GC: N % of the window (…)» = the child's own gc record
//   Ⓕ THE ASKS' COST: said; one past its bound ⇒ the rate halves, said; the sum past its bound ⇒ it stops early, said
//   Ⓖ THE CAPTURE'S OWN COST: a busy child's work done with and without a capture, interleaved — measured and printed
//   Ⓗ A DEBUGGER: a port open ⇒ the door refused by name, nothing automatic; opened mid-capture ⇒ it stops early, said
//   Ⓘ NODE 22: Ⓐ Ⓒ Ⓓ under the binary named by VS_NODE22 — else «not run: no Node 22 given». The legs above are labelled
//      by the Node that runs this suite (the hosted runner's is 22, this box's 24) — the same laws on either
//   Ⓙ A READ, A WRITE THAT NEVER RETURNS (the follow-up, heading .394): the watchdog thread's stat of the install's files
//      never answers (a preload in that thread stands for the hung kernel call and counts it) — four captures START ONE
//      read, the later three say why their functions go by location alone; the capture file's write never answers —
//      three captures start ONE write, the later two say it is not kept. Two MUTANTS (a scratch copy of src/: the read's
//      guard cleared at the budget; the write's guard removed) are RED by name. THE READ'S PREMISE, asserted by name: each
//      capture samples the install's code (a function to name) — the loop is busy half the time, not 10 %
// Run: node scripts/test-cpu-capture-live.mjs        (VS_NODE22=/path/to/node22 for Ⓘ; VS_CC_LEGS=A,C… a maintainer's subset)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const C = require(path.join(REPO, 'src/cpu-capture.js'));
let pass = 0, fail = 0, cpuMs = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
const say = (s) => console.log('  · ' + s);
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cc-live-'));
fs.mkdirSync(path.join(ROOT, 'src'));
fs.writeFileSync(path.join(ROOT, 'src/hogs.js'), `'use strict';
const spans = [];
function spin(ms) { const t = Date.now(); let x = 0; while (Date.now() - t < ms) for (let i = 0; i < 2000; i++) x += Math.sqrt(i + x); return x; }
function knownBusy(ms) { const s = Date.now(); const t = s; let x = 0; while (Date.now() - t < ms) for (let i = 0; i < 2000; i++) x += Math.sqrt(i + x); spans.push(['knownBusy', s, Date.now()]); return x; }
function otherWork(ms) { const s = Date.now(); let x = 0; while (Date.now() - s < ms) for (let i = 0; i < 2000; i++) x += Math.cbrt(i + x); spans.push(['otherWork', s, Date.now()]); return x; }
function tenBusy(ms) { const s = Date.now(); let x = 0; while (Date.now() - s < ms) for (let i = 0; i < 2000; i++) x += Math.sqrt(i + x); spans.push(['tenBusy', s, Date.now()]); return x; }
function jsonCaller(text) { const s = Date.now(); const v = JSON.parse(text); spans.push(['jsonCaller', s, Date.now()]); return v.length; }
function churn(ms) { const s = Date.now(); let keep = 0; while (Date.now() - s < ms) { const a = new Array(256).fill(keep); keep += a.length & 1; } spans.push(['churn', s, Date.now()]); return keep; }
function unit() { let x = 0; for (let i = 0; i < 400000; i++) x += Math.sqrt(i + x); return x; }
module.exports = { spans, spin, knownBusy, otherWork, tenBusy, jsonCaller, churn, unit };
`);
const KID = path.join(ROOT, 'kid.cjs');
fs.writeFileSync(KID, `'use strict';
const cfg = JSON.parse(process.argv[2]);
const TREE = cfg.tree || ${JSON.stringify(REPO)};
const H = require(${JSON.stringify(path.join(ROOT, 'src/hogs.js'))});
const lines = [];
const dataDir = ${JSON.stringify(ROOT)} + '/data-' + process.pid;
let gcOwn = [];
if (cfg.inspectFirst) require('inspector').open(0, '127.0.0.1');   // a debugger port open before the watchdog starts
if (cfg.ownGc) { const { PerformanceObserver, performance } = require('perf_hooks'); const off = Date.now() - performance.now(); new PerformanceObserver((l) => { for (const e of l.getEntries()) gcOwn.push([off + e.startTime, e.duration]); }).observe({ entryTypes: ['gc'] }); }
const W = cfg.noWitness ? null : require(TREE + '/src/server/sync-fs-witness.js').create({ rootDir: ${JSON.stringify(ROOT)}, dataDir, armed: true, readMountinfo: () => '', fresh: true, samplingOn: () => cfg.sampling !== false,
  log: { warn: (l) => { lines.push(l); process.stderr.write(l + '\\n'); }, log() {} },
  holdsOptions: { autoCapture: cfg.auto !== false, triggerEveryMs: cfg.triggerEveryMs || 300, captureMs: cfg.captureMs || 20000, captureEveryMs: cfg.everyMs || 50, captureOpts: cfg.captureOpts || {},
    lagNow: () => (cfg.lag ? { level: cfg.lag, medianMs: 640, at: Date.now() } : null) } }).start();
const out = { lines, cfg };
const rnd = (() => { let s = 12345; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
let stop = false;
const plans = {
  saturated() { const go = () => { if (stop) return; const x = 50 + 150 * rnd(); if (rnd() < 0.9) H.knownBusy(x); else H.otherWork(x); setTimeout(go, x * 0.12); }; go(); },
  ten() { const go = () => { if (stop) return; H.tenBusy(20); setTimeout(go, cfg.restMs || 180); }; go(); },
  json() { const text = '[' + '{"a":1,"b":"xyz","c":[1,2,3]},'.repeat(cfg.jsonN || 200000) + '{"a":2}]'; const go = () => { if (stop) return; H.jsonCaller(text); setTimeout(go, 40); }; go(); },
  churn() { const go = () => { if (stop) return; H.churn(120); setTimeout(go, 30); }; go(); },
  units() {   // work units back to back; the main thread's OWN cpu time (its schedstat) at the start and the end
    const ran = () => Number(String(require('fs').readFileSync('/proc/self/task/' + process.pid + '/schedstat', 'utf8')).split(' ')[0]) / 1e6;
    out.units = 0; out.ran0 = ran(); const go = () => { if (stop) { return; } H.unit(); out.units++; out.ran1 = ran(); setImmediate(go); }; go(); },
  idle() { },
};
const finish = () => {
  stop = true;
  const rep = W ? W.holds().report() : null;
  out.capture = rep ? rep.capture : null; out.holds = rep ? rep.holds.map((h) => h.line) : [];
  const last = out.capture && out.capture.last;
  if (last) {
    const span = (name) => H.spans.filter((x) => x[0] === name).reduce((a, x) => a + Math.max(0, Math.min(x[2], last.endedAt) - Math.max(x[1], last.startedAt)), 0) / Math.max(1, last.endedAt - last.startedAt);
    out.truth = Object.fromEntries(['knownBusy', 'otherWork', 'tenBusy', 'jsonCaller', 'churn'].map((n) => [n, Math.round(1000 * span(n)) / 10]));
    if (last.file) { try { const p = JSON.parse(require('fs').readFileSync(dataDir + '/cpu-profiles/' + last.file, 'utf8')); const C = require(TREE + '/src/cpu-capture.js'); const a = C.aggregate(p); out.file = { header: p.$vibespace, nodes: p.nodes.length, samples: p.samples.length, top: a.listed.slice(0, 3).map((r) => [r.fn, r.loc, Math.round(1000 * r.share) / 10]), idle: Math.round(1000 * a.share.idle) / 10 }; } catch (e) { out.file = { error: e.message }; } }
    if (cfg.ownGc) out.gcOwnPct = Math.round(1000 * gcOwn.reduce((a, [s, d]) => a + Math.max(0, Math.min(s + d, last.endedAt) - Math.max(s, last.startedAt)), 0) / Math.max(1, last.endedAt - last.startedAt)) / 10;
  }
  out.cpuMs = (process.cpuUsage().user + process.cpuUsage().system) / 1000;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
};
setTimeout(() => {
  (plans[cfg.plan] || plans.idle)();
  if (cfg.inspectAt != null) setTimeout(() => { require('inspector').open(0, '127.0.0.1'); out.inspected = true; }, cfg.inspectAt);
  if (cfg.doorAt != null) setTimeout(() => { out.door = W.holds().startCapture({ auto: false }); }, cfg.doorAt);
  if (cfg.doorAt2 != null) setTimeout(() => { out.door2 = W.holds().startCapture({ auto: false }); }, cfg.doorAt2);
  for (const at of cfg.doors || []) setTimeout(() => { (out.doors = out.doors || []).push(W.holds().startCapture({ auto: false })); }, at);
  if (cfg.untilMs) setTimeout(finish, cfg.untilMs);
  else { const iv = setInterval(() => { const r = W.holds().report().capture; if (r.last) { clearInterval(iv); setTimeout(finish, cfg.afterMs || 0); } }, 100); }
}, cfg.startMs || 600);
setTimeout(finish, cfg.timeoutMs || 60000);
`);
// Ⓙ's preload: in the watchdog THREAD only, a stat of the install's .js files / a write under the child's data dir never
// answers — each call is logged (one line) and left pending for the child's life (the hung kernel call it stands for)
const HANG = path.join(ROOT, 'hang.cjs');
fs.writeFileSync(HANG, `'use strict';
if (!require('worker_threads').isMainThread && process.env.VS_CC_HANG) {
  const fs = require('fs'), h = JSON.parse(process.env.VS_CC_HANG);
  const hang = (fn, test) => { const orig = fs.promises[fn]; fs.promises[fn] = function (p, ...rest) { if (test(String(p))) { fs.appendFileSync(h.log, fn + ' ' + p + '\\n'); return new Promise(() => {}); } return orig.call(this, p, ...rest); }; };
  if (h.stat) hang('stat', (p) => p.startsWith(h.stat) && /\\.c?js$/.test(p));
  if (h.write) hang('writeFile', (p) => p.startsWith(h.write));
}
`);
function run(cfg, { node = process.execPath, timeoutMs = 90000, pre = null, env = {} } = {}) {
  return new Promise((resolve) => {
    const c = spawn(node, [...(pre ? ['-r', pre] : []), KID, JSON.stringify(cfg)], { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: os.tmpdir(), ...env } });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const kill = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, timeoutMs);
    c.on('exit', (code) => { clearTimeout(kill); let j = null; try { j = JSON.parse(out); } catch { } if (j && j.cpuMs) cpuMs += j.cpuMs; resolve({ code, out: j, err, lines: err.split('\n').filter(Boolean) }); });
  });
}
const block = (r) => (r.out ? r.out.lines.filter((l) => l.includes('\n[cpu-profile]') || /^\[cpu-profile\] (the loop is degraded|captured on request)/.test(l)) : []);
const rowsOf = (r) => (r.out && r.out.capture && r.out.capture.last ? r.out.capture.last.rows : []);
const pctOf = (r, fn) => { const x = rowsOf(r).find((y) => y.fn === fn); return x ? x.pct : 0; };

// ── Ⓐ THE SATURATED LOOP ──────────────────────────────────────────────────────────────────────────────────────────
// THE RATE IT RAN AT, AS THE CAPTURE SAYS IT: asked every 50 ms; one ask past its 4 ms bound halves the rate (the product's
// own law, Ⓕ) and the block says so. The hosted runner's .401 heavy (Node 22): «the rate halved to every 100 ms — an ask took
// 4.36 ms of the main thread (the bound 4 ms)», 244 samples — the old «≥ 360 samples» assumed no ask ever passes its bound.
// Measured on this box (the asks' own runs, 4 captures each): Node 24 p50 0.07–0.09 ms, max 1.46 ms; Node 22 p50 0.09–0.10 ms,
// max 0.29 ms; a CPU shared with a hog, the child niced below it: max 3.07 ms — no halving, 385–416 samples. So the samples are
// ≥ 90 % of the window at the rate it ran at the END (≤ 110 % at 50 ms), and the block names a halving exactly when it ran one.
const HALVED_WORDS = /the rate halved(?: \d+ times)? to every (\d+) ms — an ask took \d+\.\d\d ms of the main thread \(the bound 4 ms\)/;
function rateOf(L) {
  if (!L) return { ok: false, last: null, said: null };
  const m = (L.lines || []).map((l) => HALVED_WORDS.exec(l)).find(Boolean), last = L.finalEveryMs || L.everyMs;
  const ok = L.everyMs === 50 && L.windowMs >= 19500 && (L.finalEveryMs ? !!m && Number(m[1]) === L.finalEveryMs : !m)
    && L.samples >= 0.9 * L.windowMs / last && L.samples <= 1.1 * L.windowMs / L.everyMs;
  return { ok, last, said: m ? m[0] : null };
}
// the hosted runner's own capture (the .401 cut's heavy shard 2, try 1 — its record and its block's cost line)
const RUNNER_401 = { auto: true, cause: 'lag', windowMs: 20000, everyMs: 50, finalEveryMs: 100, samples: 244,
  lines: ['[cpu-profile]   244 samples, the asks themselves took 25 ms of the main thread (0.1 %); the rate halved to every 100 ms — an ask took 4.36 ms of the main thread (the bound 4 ms); kept as data/cpu-profiles/2026-11-14T03-34-09-216Z-auto.cpuprofile'] };
function pinRate() {
  const said = rateOf(RUNNER_401), unsaid = rateOf({ ...RUNNER_401, lines: [] }), unmoved = rateOf({ ...RUNNER_401, finalEveryMs: undefined }),
    few = rateOf({ ...RUNNER_401, samples: 170 }), old = rateOf({ ...RUNNER_401, finalEveryMs: undefined, lines: [] });
  ok(said.ok && !unsaid.ok && !unmoved.ok && !few.ok && !old.ok, 'the rate read as the capture says it: the hosted runner\'s (244 samples, halved to every 100 ms where an ask took 4.36 ms, said) holds; the same halving unsaid, a halving said at an unmoved rate, 170 samples at 100 ms, 244 at 50 ms — each refused',
    { said, unsaid: unsaid.ok, unmoved: unmoved.ok, few: few.ok, old: old.ok });
}
async function legSaturated(tag, node) {
  console.log(`Ⓐ the saturated loop names its top function — production timings, a 20 s capture (${tag})`);
  const r = await run({ plan: 'saturated', lag: 1, afterMs: 3000 }, { node });
  const L = r.out ? r.out.capture.last : null, b = block(r);
  const held = r.lines.filter((l) => l.startsWith('[loop-hold] the main loop was held') || l.startsWith('[sync-fs] the main loop has been held'));
  const rate = rateOf(L);
  if (L) say(`${tag}: ${L.samples} samples in ${(L.windowMs / 1000).toFixed(1)} s at every ${rate.last} ms${rate.said ? ` («${rate.said}»)` : ''} — ${rowsOf(r).map((x) => `${x.fn} ${x.pct} %`).join(', ')}; the truth ${JSON.stringify(r.out.truth)}; the asks ${L.costMs} ms`);
  ok(held.length === 0 && r.out && r.out.holds.length === 0, `${tag}: callbacks of 50–200 ms — commit 1's hold watchdog says NOTHING (no hold of a second)`, held.slice(0, 2));
  ok(L && L.auto === true && L.cause === 'lag' && rate.ok, `${tag}: the trigger's ONE capture: 20 s asked every 50 ms${rate.last && rate.last !== 50 ? `, halved to every ${rate.last} ms where an ask passed its bound — said` : ''} (${L ? L.samples : '?'} samples ≥ 90 % of the window at the rate it ran)`,
    L && { auto: L.auto, cause: L.cause, w: L.windowMs, every: L.everyMs, final: L.finalEveryMs, n: L.samples, said: rate.said, cost: (L.lines || []).find((l) => /\d+ samples, the asks/.test(l)) });
  ok(L && L.rows[0] && L.rows[0].fn === 'knownBusy' && L.rows[0].loc === 'src/hogs.js:4' && Math.abs(L.rows[0].pct - r.out.truth.knownBusy) <= 10, `${tag}: it names the KNOWN function FIRST — knownBusy · src/hogs.js:4 at ${L && L.rows[0] ? L.rows[0].pct : '?'} %, the child's own measure ${r.out && r.out.truth ? r.out.truth.knownBusy : '?'} % (±10 points)`, L && L.rows);
  ok(b.length === 1 && b[0].split('\n').length <= 15 && b[0].split('\n').every((l) => l.startsWith('[cpu-profile] ')) && /time inside native calls is counted on the JavaScript caller/.test(b[0]) && /\d+ samples, the asks themselves took \d+ ms of the main thread/.test(b[0]),
    `${tag}: ONE block in the journal, ≤ 15 lines (${b[0] ? b[0].split('\n').length : 0})`, b);
  ok(r.out && r.out.file && r.out.file.header && r.out.file.header.sampledEveryMs === 50 && r.out.file.top[0] && r.out.file.top[0][0] === 'knownBusy' && Math.abs(r.out.file.top[0][2] - L.rows[0].pct) <= 0.1,
    `${tag}: its .cpuprofile is kept under data/cpu-profiles — «sampled every 50 ms» in its header, its own table the block's (${r.out && r.out.file ? JSON.stringify(r.out.file.top[0]) : '?'})`, r.out && r.out.file);
  ok(r.out && r.out.capture.verdict && r.out.capture.verdict.why === 'interval' && b.length === 1, `${tag}: the trigger kept firing for 3 s more — a second trigger inside the interval captures nothing («${r.out && r.out.capture.verdict ? r.out.capture.verdict.why : '?'}»)`);
  if (b[0]) console.log(b[0].split('\n').map((l) => '      ' + l).join('\n'));
  return r;
}
// ── Ⓑ THE SWITCH OFF ──────────────────────────────────────────────────────────────────────────────────────────────
async function legSwitch() {
  console.log('Ⓑ the switch off: nothing automatic, the door works');
  const r = await run({ plan: 'saturated', lag: 1, sampling: false, captureMs: 4000, doorAt: 3000, afterMs: 200 });
  const L = r.out && r.out.capture.last, b = block(r);
  ok(r.out && r.out.capture.verdict && r.out.capture.verdict.why === 'off' && b.length === 1 && L && L.auto === false && L.cause === 'door', `with telemetry.loopHoldSampling off: 3 s of triggers captured nothing; the door's press captured ONE (${L ? L.samples : 0} samples)`, r.out && { v: r.out.capture.verdict, door: r.out.door });
  ok(L && L.rows[0] && L.rows[0].fn === 'knownBusy' && /^\[cpu-profile\] captured on request/.test(b[0] || ''), 'the door\'s capture names the function — the same table', L && L.rows);
}
// ── Ⓒ IDLE IS NEVER WORK ──────────────────────────────────────────────────────────────────────────────────────────
async function legIdle(tag, node, tree = null) {
  console.log(`Ⓒ idle is never work${tree ? ' — MUTANT tree' : ''} (${tag})`);
  // the production window (400 ticks): a 10 % share is read within ±5 points at 3.3σ (the tick's class is exact — measured,
  // every tick inside the busy spans booked on its function and every one outside idle; the rest is the binomial spread)
  const r = await run({ plan: 'ten', captureMs: tree ? 6000 : 20000, auto: false, doorAt: 400, afterMs: 100, ...(tree ? { tree } : {}) }, { node });
  const L = r.out && r.out.capture.last;
  const sp = L ? L.split : {};
  if (L) say(`${tag}${tree ? ' (mutant)' : ''}: JavaScript ${sp.js} %, outside JavaScript ${sp.native} %, idle ${sp.idle} %; tenBusy ${pctOf(r, 'tenBusy')} %, its truth ${r.out.truth.tenBusy} %`);
  return { r, ok: !!L && Math.abs(sp.js - r.out.truth.tenBusy) <= 5 && sp.idle >= 80 && Math.abs(pctOf(r, 'tenBusy') - r.out.truth.tenBusy) <= 5, L, sp };
}
// ── Ⓓ NATIVE TIME ON ITS CALLER · Ⓔ THE COLLECTOR ─────────────────────────────────────────────────────────────────
async function legNative(tag, node) {
  console.log(`Ⓓ native time on its JavaScript caller (${tag})`);
  const r = await run({ plan: 'json', captureMs: 6000, auto: false, doorAt: 600, afterMs: 100 }, { node });
  const L = r.out && r.out.capture.last;
  if (L) say(`${tag}: ${rowsOf(r).map((x) => `${x.fn} ${x.pct} %`).join(', ')}; the truth jsonCaller ${r.out.truth.jsonCaller} %; outside JavaScript ${L.split.native} %`);
  ok(L && L.rows[0] && L.rows[0].fn === 'jsonCaller' && L.rows[0].loc === 'src/hogs.js:7' && Math.abs(L.rows[0].pct - r.out.truth.jsonCaller) <= 10 && !L.rows.some((x) => /parse/i.test(x.fn)),
    `${tag}: a function spending its time in ONE big JSON.parse is named by its caller — jsonCaller · src/hogs.js:7 at ${L && L.rows[0] ? L.rows[0].pct : '?'} % (its truth ${r.out && r.out.truth ? r.out.truth.jsonCaller : '?'} %)`, L && L.rows);
  ok(L && L.lines.some((l) => l === '[cpu-profile]   time inside native calls is counted on the JavaScript caller; functions under 3 % are not listed'), `${tag}: the block says so`);
}
async function legGc() {
  console.log('Ⓔ the collector from the process\'s own record');
  const r = await run({ plan: 'churn', captureMs: 4000, auto: false, doorAt: 400, afterMs: 300, ownGc: true });
  const L = r.out && r.out.capture.last;
  const gl = L ? L.lines.find((l) => /^\[cpu-profile\]   GC/.test(l)) : null;
  say(`${gl || 'no GC line'} — the child's own record ${r.out ? r.out.gcOwnPct : '?'} %`);
  ok(L && L.gc && L.gc.pct > 0 && /GC: \d+\.\d % of the window \((scavenge|mark-compact|incremental marking)/.test(gl || '') && Math.abs(L.gc.pct - r.out.gcOwnPct) <= 1, `an allocating function: «GC: ${L && L.gc ? L.gc.pct : '?'} % of the window (…)», the child's own gc record ${r.out ? r.out.gcOwnPct : '?'} % (±1 point)`, L && L.gc);
}
// ── Ⓕ THE ASKS' COST ──────────────────────────────────────────────────────────────────────────────────────────────
async function legCost() {
  console.log('Ⓕ the asks\' own cost: said, the rate halved, an early stop');
  const h = await run({ plan: 'saturated', captureMs: 4000, auto: false, doorAt: 400, afterMs: 100, captureOpts: { askBoundMs: 0.0001 } });
  const H = h.out && h.out.capture.last;
  ok(H && H.finalEveryMs === 400 && H.lines.some((l) => /the rate halved 3 times to every 400 ms — an ask took \d+\.\d\d ms of the main thread \(the bound 0\.0001 ms\)/.test(l)) && H.samples < 40,
    `every ask past its bound (here 0.0001 ms) ⇒ the rate halves each time, to its floor of one ask per 400 ms, said (${H ? H.samples : '?'} samples)`, H && H.lines);
  const s = await run({ plan: 'saturated', captureMs: 6000, auto: false, doorAt: 400, afterMs: 100, captureOpts: { costMaxMs: 2 } });
  const S = s.out && s.out.capture.last;
  ok(S && S.stopped === 'cost' && S.windowMs < 5000 && S.lines.some((l) => /it stopped early at \d+\.\d s: the asks had taken their bound of the main thread/.test(l)), `the asks' sum past its bound (here 2 ms) ⇒ it stops early, said (at ${S ? (S.windowMs / 1000).toFixed(1) : '?'} s)`, S && S.lines);
}
// ── Ⓖ THE CAPTURE'S OWN COST ──────────────────────────────────────────────────────────────────────────────────────
async function legOwnCost() {
  console.log('Ⓖ the capture\'s own cost — a busy child\'s work with and without one, ABBA, per second of the main thread\'s own CPU');
  const res = { on: [], off: [] };
  for (const side of ['off', 'on', 'on', 'off']) {
    const r = await run({ plan: 'units', auto: false, captureMs: 10000, doorAt: side === 'on' ? 50 : null, untilMs: 10050, startMs: 400 });
    res[side].push(r.out && r.out.ran1 > r.out.ran0 ? (1000 * r.out.units) / (r.out.ran1 - r.out.ran0) : 0);   // units per cpu second of the main thread
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, loss = 1 - mean(res.on) / mean(res.off), noise = Math.abs(res.off[0] - res.off[1]) / mean(res.off);
  const f = (a) => a.map((x) => x.toFixed(1)).join(' / ');
  say(`work units per cpu second of the main thread: without ${f(res.off)}, with a capture ${f(res.on)} — the capture cost ${(100 * loss).toFixed(1)} % (the two runs without one differ by ${(100 * noise).toFixed(1)} %: the measure's own noise)`);
  ok([...res.on, ...res.off].every((x) => x > 0) && loss < 0.05, `the capture's own cost, measured: ${(100 * loss).toFixed(1)} % of a busy main thread's work per cpu second (< 5 %; noise ${(100 * noise).toFixed(1)} %)`, res);
  return { res, loss, noise };
}
// ── Ⓗ A DEBUGGER ──────────────────────────────────────────────────────────────────────────────────────────────────
async function legDebugger() {
  console.log('Ⓗ a debugger port: the door refused, nothing automatic; opened mid-capture: it stops');
  const r = await run({ plan: 'saturated', lag: 1, captureMs: 4000, inspectFirst: true, doorAt: 1500, untilMs: 3000, startMs: 300, triggerEveryMs: 300 });
  ok(r.out && r.out.door && r.out.door.error === 'debugger_attached' && !(r.out.capture && r.out.capture.last) && block(r).length === 0, 'a debugger port open: the door is refused «debugger_attached» and the trigger captures nothing', r.out && { door: r.out.door, v: r.out.capture && r.out.capture.verdict });
  const m = await run({ plan: 'saturated', captureMs: 6000, auto: false, doorAt: 300, inspectAt: 2500, afterMs: 100 });
  const L = m.out && m.out.capture.last;
  ok(L && L.stopped === 'debugger' && L.windowMs < 5000 && L.lines.some((l) => /it stopped early at \d+\.\d s: a debugger was attached/.test(l)), `a debugger opened mid-capture: it stops early, said (at ${L ? (L.windowMs / 1000).toFixed(1) : '?'} s)`, L && L.lines);
}

// ── Ⓙ A READ, A WRITE THAT NEVER RETURNS ──────────────────────────────────────────────────────────────────────────
const blocksOf = (r) => (r.out ? r.out.lines.filter((l) => l.startsWith('[cpu-profile] captured on request')) : []);
async function legHungRead(tree = null) {
  const log = path.join(ROOT, `hang-read-${Date.now()}.log`); fs.writeFileSync(log, '');
  // four door captures of 1.2 s, 4 s apart (each ends within its 2 s reading time on any tree). THE PREMISE: each capture
  // samples the install's code, so it HAS a function to name — a capture that sampled none reads nothing and rightly says no
  // reason. At 10 % busy (20 ms in 200) that was chance: of 118 such captures on this box (Node 24 4 / 59, Node 22 7 / 59)
  // 11 sampled no JavaScript at all, and on a CPU shared with a hog 9 of 118 sampled only frames outside the child's install
  // — the old leg red 1 of 17 here, 3 times on the hosted runner («4 blocks», one or two of them with no reason). Busy HALF
  // the time (20 ms in 40): 0 of 177 captures (this box, Node 22, the hog) without its row, the row ≥ 27.7 %. The premise is
  // asserted by name (its row at src/hogs.js in every block), the law judged only on it
  const r = await run({ plan: 'ten', restMs: 20, auto: false, captureMs: 1200, doors: [300, 4300, 8300, 12300], untilMs: 16500, ...(tree ? { tree } : {}) },
    { pre: HANG, env: { VS_CC_HANG: JSON.stringify({ log, stat: ROOT + '/' }) } });
  const stats = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean), b = blocksOf(r);
  const named = b.map((x) => { const m = /^\[cpu-profile\]\s+([\d.]+) % · [^\n]* · src\/hogs\.js:\d+/m.exec(x); return m ? Number(m[1]) : 0; });
  const premise = b.length === 4 && named.every((p) => p > 0);
  const law = stats.length === 1 && b.length === 4 && (r.out.doors || []).every((d) => d && d.ok)
    && /some functions are said by their location alone: the install's files did not answer within the capture's reading time/.test(b[0])
    && b.slice(1).every((x) => /some functions are said by their location alone: a read of the install's files has not returned — one read waits, no other starts/.test(x));
  return { r, stats, b, named, premise, law, ok: premise && law };
}
async function legHungWrite(tree = null) {
  const log = path.join(ROOT, `hang-write-${Date.now()}.log`); fs.writeFileSync(log, '');
  // three door captures of 1.2 s: the first's write never answers (its 10 s spent), the next two end while it is pending
  const r = await run({ plan: 'ten', auto: false, captureMs: 1200, doors: [300, 13000, 15500], untilMs: 18000, ...(tree ? { tree } : {}) },
    { pre: HANG, env: { VS_CC_HANG: JSON.stringify({ log, write: ROOT + '/data-' }) } });
  const writes = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean), b = blocksOf(r);
  return { r, writes, b, ok: writes.length === 1 && b.length === 3 && (r.out.doors || []).every((d) => d && d.ok) && /its \.cpuprofile was not kept \(the disk did not answer in 10 s\)/.test(b[0] || '') && b.slice(1).every((x) => /its \.cpuprofile was not kept \(the last capture's file \S+ has not been written yet — the disk has not answered; one write waits, no other starts\)/.test(x)) };
}
async function legHung() {
  console.log('Ⓙ a read, a write that never returns: ONE in flight, whoever starts it');
  const a = await legHungRead();
  ok(a.premise, `the read leg's premise: each of the ${a.b.length} captures samples the install's code — its function's row ${a.named.join(' / ')} % (a loop busy half the time)`, { named: a.named, splits: a.b.map((x) => (/the split: [^\n]*/.exec(x) || [''])[0]) });
  ok(a.ok, a.premise ? `four captures against a stat that never answers: ${a.stats.length} read started (ONE); ${a.b.length} blocks — the first «did not answer within the capture's reading time», the later three «a read has not returned»`
    : 'four captures against a stat that never answers: NOT JUDGED — the premise above failed', { stats: a.stats, doors: a.r.out && a.r.out.doors, b: a.b.map((x) => x.split('\n').slice(-1)[0]) });
  const w = await legHungWrite();
  ok(w.ok, `three captures against a write that never answers: ${w.writes.length} write started (ONE); the first «the disk did not answer in 10 s», the next two «has not been written yet»`, { writes: w.writes, doors: w.r.out && w.r.out.doors, b: w.b.map((x) => x.split('\n').slice(-1)[0]) });
  // THE MUTANTS: a scratch copy of src/, one text swap each in the watchdog thread
  const mut = (name, from, to) => { const dir = path.join(ROOT, name); fs.cpSync(path.join(REPO, 'src'), path.join(dir, 'src'), { recursive: true }); const p = path.join(dir, 'src/server/sync-fs-witness-worker.js'), t = fs.readFileSync(p, 'utf8'); if (!t.includes(from)) return null; fs.writeFileSync(p, t.replace(from, to)); return dir; };
  const m1 = mut('mut-read', "if (took == null) why = 'budget';", "if (took == null) { why = 'budget'; naming = null; }");
  const ma = m1 ? await legHungRead(m1) : { ok: true, stats: [] };
  ok(ma.premise !== false && !ma.ok && ma.stats.length > 1, `MUTANT «the read's guard cleared at its budget» is RED by name: ${ma.stats.length} reads started`, ma.stats);
  const m2 = mut('mut-write', 'if (c.dir && writing) fileError = CC.writePendingWords(writing);\n    else if (c.dir) {', 'if (c.dir) {');
  const mw = m2 ? await legHungWrite(m2) : { ok: true, writes: [] };
  ok(!mw.ok && mw.writes.length > 1, `MUTANT «no guard on the capture's write» is RED by name: ${mw.writes.length} writes started`, mw.writes);
}

const LEGS = String(process.env.VS_CC_LEGS || '').split(',').filter(Boolean), leg = (n) => !LEGS.length || LEGS.includes(n);
if (LEGS.length) console.log(`(only the legs ${LEGS.join(', ')} — VS_CC_LEGS; the gate runs every leg)`);
const report = {};
const HERE = `Node ${process.versions.node.split('.')[0]}`;   // the Node running this suite (the hosted runner's 22, this box's 24)
try {
  if (leg('A')) { pinRate(); await legSaturated(HERE, process.execPath); }
  if (leg('B')) await legSwitch();
  if (leg('C')) {
    const c = await legIdle(HERE, process.execPath);
    ok(c.ok, `${HERE}: ~10 % busy in one callback ⇒ JavaScript ${c.sp.js} %, idle ${c.sp.idle} % (the callback ${c.L ? pctOf(c.r, 'tenBusy') : '?'} %, its truth ${c.r.out && c.r.out.truth ? c.r.out.truth.tenBusy : '?'} % ±5) — never that callback at 100 %`, c.L && c.L.split);
    // THE MUTANT: the worker's tick without its idle rule (a scratch copy of src/, one text swap in src/cpu-capture.js)
    const MUT = path.join(ROOT, 'mut'); fs.cpSync(path.join(REPO, 'src'), path.join(MUT, 'src'), { recursive: true });
    const mp = path.join(MUT, 'src/cpu-capture.js'), msrc = fs.readFileSync(mp, 'utf8'), anchor = "if (s !== 'running' && w === 'ep_poll' && beatAgeMs <= freshMs) return 'idle';";
    fs.writeFileSync(mp, msrc.replace(anchor, ''));
    const m = msrc.includes(anchor) ? await legIdle(HERE, process.execPath, MUT) : { ok: true, sp: {} };
    ok(!m.ok, `MUTANT «the kernel state not read first» (the tick's idle rule removed) is RED by name: idle ${m.sp.idle} % — not ~90 %`, m.sp);
  }
  if (leg('D')) await legNative(HERE, process.execPath);
  if (leg('E')) await legGc();
  if (leg('F')) await legCost();
  if (leg('G')) report.ownCost = await legOwnCost();
  if (leg('H')) await legDebugger();
  if (leg('J')) await legHung();
  const n22 = process.env.VS_NODE22;
  if (!leg('node22')) { }
  else if (n22 && fs.existsSync(n22)) {
    console.log('Ⓘ Node 22 (' + n22 + ')');
    await legSaturated('Node 22', n22);
    const c = await legIdle('Node 22', n22);
    ok(c.ok, `Node 22: ~10 % busy ⇒ JavaScript ${c.sp.js} %, idle ${c.sp.idle} %`, c.L && c.L.split);
    await legNative('Node 22', n22);
  } else console.log(`Ⓘ not run: no Node 22 given (VS_NODE22=/path/to/node22) — the legs above ran under this suite's Node ${process.version}`);
  if (process.env.CC_REPORT) { try { fs.writeFileSync(process.env.CC_REPORT, JSON.stringify(report, null, 1)); } catch { } }
} finally {
  fs.rmSync(ROOT, { recursive: true, force: true });
}
console.log(`\nthe children used ${(cpuMs / 1000).toFixed(1)} cpu seconds`);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
