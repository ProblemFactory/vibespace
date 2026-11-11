#!/usr/bin/env node
// test-cpu-capture-live — lane hub-loop-stalls commit 3, THE LIVE LEGS of the CPU capture (HEAVY: real child processes,
// ONE at a time, no hub; each child runs the REAL watchdog — src/server/sync-fs-witness.js + its thread +
// src/server/loop-holds.js — at PRODUCTION timings: the beat 250 ms, a hold 1 s, the capture 20 s at 50 ms; the trigger's
// lag reading is injected — test-cpu-capture pins the verdict itself):
//   Ⓐ THE SATURATED LOOP: a KNOWN busy function at ~80 % in callbacks of 50–200 ms (nothing ≥ 1 s) — commit 1 says nothing
//      (no [loop-hold] line); the trigger's capture names the function FIRST, its share within ±10 points of the child's
//      own measured truth; ONE block ≤ 15 lines; its .cpuprofile kept and its own table the block's; a second trigger
//      inside the interval captures nothing
//   Ⓑ THE SWITCH OFF: nothing automatic, the door works
//   Ⓒ IDLE IS NEVER WORK: ~10 % busy in one callback ⇒ ~10 % work, ~90 % idle — never that callback at 100 %; and a
//      MUTANT of the worker's tick (its idle rule removed, a scratch copy of src/) is RED by name
//   Ⓓ NATIVE TIME ON ITS CALLER: a function spending its time in one big JSON.parse is named by its JavaScript caller;
//      the block says «time inside native calls is counted on the JavaScript caller»
//   Ⓔ THE COLLECTOR FROM ITS RECORD: an allocating function ⇒ «GC: N % of the window (…)» = the child's own gc record
//   Ⓕ THE ASKS' COST: said; one past its bound ⇒ the rate halves, said; the sum past its bound ⇒ it stops early, said
//   Ⓖ THE CAPTURE'S OWN COST: a busy child's work done with and without a capture, interleaved — measured and printed
//   Ⓗ A DEBUGGER: a port open ⇒ the door refused by name, nothing automatic; opened mid-capture ⇒ it stops early, said
//   Ⓘ NODE 22: Ⓐ Ⓒ Ⓓ under the binary named by VS_NODE22 — else «not run: no Node 22 given»
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
  ten() { const go = () => { if (stop) return; H.tenBusy(20); setTimeout(go, 180); }; go(); },
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
  if (cfg.untilMs) setTimeout(finish, cfg.untilMs);
  else { const iv = setInterval(() => { const r = W.holds().report().capture; if (r.last) { clearInterval(iv); setTimeout(finish, cfg.afterMs || 0); } }, 100); }
}, cfg.startMs || 600);
setTimeout(finish, cfg.timeoutMs || 60000);
`);
function run(cfg, { node = process.execPath, timeoutMs = 90000 } = {}) {
  return new Promise((resolve) => {
    const c = spawn(node, [KID, JSON.stringify(cfg)], { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: os.tmpdir() } });
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
async function legSaturated(tag, node) {
  console.log(`Ⓐ the saturated loop names its top function — production timings, a 20 s capture (${tag})`);
  const r = await run({ plan: 'saturated', lag: 1, afterMs: 3000 }, { node });
  const L = r.out ? r.out.capture.last : null, b = block(r);
  const held = r.lines.filter((l) => l.startsWith('[loop-hold] the main loop was held') || l.startsWith('[sync-fs] the main loop has been held'));
  if (L) say(`${tag}: ${L.samples} samples in ${(L.windowMs / 1000).toFixed(1)} s — ${rowsOf(r).map((x) => `${x.fn} ${x.pct} %`).join(', ')}; the truth ${JSON.stringify(r.out.truth)}; the asks ${L.costMs} ms`);
  ok(held.length === 0 && r.out && r.out.holds.length === 0, `${tag}: callbacks of 50–200 ms — commit 1's hold watchdog says NOTHING (no hold of a second)`, held.slice(0, 2));
  ok(L && L.auto === true && L.cause === 'lag' && L.windowMs >= 19500 && L.everyMs === 50 && L.samples >= 360, `${tag}: the trigger's ONE capture: 20 s at 50 ms (${L ? L.samples : '?'} samples)`, L && { auto: L.auto, cause: L.cause, w: L.windowMs, n: L.samples });
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

const LEGS = String(process.env.VS_CC_LEGS || '').split(',').filter(Boolean), leg = (n) => !LEGS.length || LEGS.includes(n);
if (LEGS.length) console.log(`(only the legs ${LEGS.join(', ')} — VS_CC_LEGS; the gate runs every leg)`);
const report = {};
try {
  if (leg('A')) await legSaturated('Node 24', process.execPath);
  if (leg('B')) await legSwitch();
  if (leg('C')) {
    const c = await legIdle('Node 24', process.execPath);
    ok(c.ok, `Node 24: ~10 % busy in one callback ⇒ JavaScript ${c.sp.js} %, idle ${c.sp.idle} % (the callback ${c.L ? pctOf(c.r, 'tenBusy') : '?'} %, its truth ${c.r.out && c.r.out.truth ? c.r.out.truth.tenBusy : '?'} % ±5) — never that callback at 100 %`, c.L && c.L.split);
    // THE MUTANT: the worker's tick without its idle rule (a scratch copy of src/, one text swap in src/cpu-capture.js)
    const MUT = path.join(ROOT, 'mut'); fs.cpSync(path.join(REPO, 'src'), path.join(MUT, 'src'), { recursive: true });
    const mp = path.join(MUT, 'src/cpu-capture.js'), msrc = fs.readFileSync(mp, 'utf8'), anchor = "if (s !== 'running' && w === 'ep_poll' && beatAgeMs <= freshMs) return 'idle';";
    fs.writeFileSync(mp, msrc.replace(anchor, ''));
    const m = msrc.includes(anchor) ? await legIdle('Node 24', process.execPath, MUT) : { ok: true, sp: {} };
    ok(!m.ok, `MUTANT «the kernel state not read first» (the tick's idle rule removed) is RED by name: idle ${m.sp.idle} % — not ~90 %`, m.sp);
  }
  if (leg('D')) await legNative('Node 24', process.execPath);
  if (leg('E')) await legGc();
  if (leg('F')) await legCost();
  if (leg('G')) report.ownCost = await legOwnCost();
  if (leg('H')) await legDebugger();
  const n22 = process.env.VS_NODE22;
  if (!leg('node22')) { }
  else if (n22 && fs.existsSync(n22)) {
    console.log('Ⓘ Node 22 (' + n22 + ')');
    await legSaturated('Node 22', n22);
    const c = await legIdle('Node 22', n22);
    ok(c.ok, `Node 22: ~10 % busy ⇒ JavaScript ${c.sp.js} %, idle ${c.sp.idle} %`, c.L && c.L.split);
    await legNative('Node 22', n22);
  } else console.log('Ⓘ not run: no Node 22 given (VS_NODE22=/path/to/node22)');
  if (process.env.CC_REPORT) { try { fs.writeFileSync(process.env.CC_REPORT, JSON.stringify(report, null, 1)); } catch { } }
} finally {
  fs.rmSync(ROOT, { recursive: true, force: true });
}
console.log(`\nthe children used ${(cpuMs / 1000).toFixed(1)} cpu seconds`);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
