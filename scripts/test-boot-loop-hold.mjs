#!/usr/bin/env node
// THE BOOT HOLDS NOTHING (heavy, a real boot — B-1319, lane boot-loop-hold, 2026-10-13). Production said "main loop held
// 7450ms" 8 s after a restart: every timer, every WebSocket accept, every child's stdout waited. This suite boots a
// scratch worktree server the way production boots: over PRODUCTION-SHAPED stores (scripts/boot-shape.mjs — the sizes
// of production's ledger, OTel stash, anchors, channels index, todos, task groups, session status…, every value
// synthetic) with N real dtach sessions to restore (a first boot creates them and is SIGKILLed).
//   ① THE LAW: the suite's own clock (a 10 ms interval from a preload, process start) — from the first turn of the loop
//     (the main-module evaluation before it is the code loading, said apart: the port is not open, nothing waits) until
//     the boot's deferred steps are done (the ledger warm settled, 8 s after listen + the walk), NO gap ≥ 250 ms;
//     monitorEventLoopDelay's max beside it (it never sees a boot's first interval — the hold the incident was).
//   ② non-vacuous: the N sessions reconnected, the stash replay / identity repair / ledger warm ran (the warm loaded the
//     shape's rows in > 100 slices), and the server's own boot clock (GET /api/boot-trace) agrees with this one.
//   ③ RED CONTROL: the same boot with VIBESPACE_BOOT_TRACE_SYNC=1 (the warm the old way, in one tick) is red by the
//     same judge — and VIBESPACE_BOOT_TRACE=1 names the hold: the step (usage-ledger-warm) and its sync sites.
// Run: node scripts/test-boot-loop-hold.mjs   (BOOT_SHAPE_SCALE=0.3 for a lighter shape; BOOT_SESSIONS=13)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, vncEnv, endRootedProcesses } from './scratch.mjs';
import { writeBootShape } from './boot-shape.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAW_MS = 250, SESSIONS = Number(process.env.BOOT_SESSIONS) || 13, SCALE = Number(process.env.BOOT_SHAPE_SCALE) || 1;
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1200) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** THE JUDGE (PURE): the clock's gaps past the first loop turn → the holds at or over the law. */
function judge(clock, law = LAW_MS) {
  const gaps = (clock && clock.gaps) || [];
  const over = gaps.filter((g) => g.ms >= law);
  return { ok: !!clock && clock.first != null && !over.length, over, maxMs: gaps.reduce((m, g) => Math.max(m, g.ms), 0), firstMs: clock ? clock.first : null };
}
console.log('① the judge');
check('a 300 ms gap past the first turn is red', !judge({ first: 900, gaps: [{ at: 2000, ms: 300 }] }).ok);
check('a 249 ms gap is green; the first turn (the code loading) is never judged', judge({ first: 5000, gaps: [{ at: 2000, ms: 249 }] }).ok);
check('no clock answer is red (an unread clock proves nothing)', !judge(null).ok && !judge({ first: null, gaps: [] }).ok);

// ── the scratch server: this tree's code in a worktree, the shape in its data/, HOME a scratch home ──
const wt = scratch('blh-wt'), HOME = scratch('blh-home'), FIX = scratch('blh-canonical'), OUT = scratch('blh-out');
for (const d of [HOME, FIX, OUT]) fs.mkdirSync(d, { recursive: true });
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
let srv = null;
const cleanup = () => {
  try { srv && srv.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); endRootedProcesses(HOME); } catch { } // the dtach sessions + the device daemon the scratch server started
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const t0 = Date.now();
const shape = writeBootShape({ dataDir: path.join(wt, 'data'), homeDir: HOME, repoDir: wt, scale: SCALE });
console.log(`  shape: ${(shape.bytes / 1e6).toFixed(0)} MB in ${Date.now() - t0} ms — ${JSON.stringify(shape.rows)}`);
const [PORT] = await freePorts(1);
const VNC = await vncEnv();
// the suite's own loop clock, independent of the server's: a preload ticking every 10 ms from process start
const PRELOAD = path.join(OUT, 'clock.cjs');
fs.writeFileSync(PRELOAD, `if (require('worker_threads').isMainThread) { // a Worker inherits -r: its own clock would overwrite the main thread's
const { performance, monitorEventLoopDelay } = require('perf_hooks'); const fs = require('fs');
const out = process.env.BOOT_GATE_OUT, gaps = []; let last = performance.now(), first = null;
const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
setInterval(() => { const t = performance.now(); if (first === null) first = Math.round(t); else if (t - last - 10 >= 100) gaps.push({ at: Math.round(last), ms: Math.round(t - last - 10) }); last = t; }, 10).unref();
setInterval(() => { try { fs.writeFileSync(out + '.tmp', JSON.stringify({ first, gaps, eldMax: Math.round(h.max / 1e6) })); fs.renameSync(out + '.tmp', out); } catch { } }, 250).unref();
}
`);
const logFd = fs.openSync(path.join(OUT, 'server.log'), 'a');
const boot = (tag, extra = {}, clock = true) => {
  const env = { ...process.env, ...VNC, HOME, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANGELOG_FIXTURE_DIR: FIX, BOOT_GATE_OUT: path.join(OUT, `clock-${tag}.json`), ...extra };
  fs.writeSync(logFd, `\n==== boot ${tag} ====\n`);
  srv = spawn(process.execPath, [...(clock ? ['-r', PRELOAD] : []), 'server.js'], { cwd: wt, env, stdio: ['ignore', logFd, logFd] });
  return srv;
};
const stop = async (sig = 'SIGTERM') => { const p = srv; srv = null; if (!p) return; p.kill(sig); await Promise.race([new Promise((r) => (p.exitCode !== null || p.signalCode ? r() : p.once('exit', r))), sleep(15000)]); try { p.kill('SIGKILL'); } catch { } };
const getJson = async (u) => { try { const r = await fetch(`http://127.0.0.1:${PORT}${u}`); return r.ok ? await r.json() : null; } catch { return null; } };
const until = async (fn, ms) => { const tEnd = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > tEnd) return v; await sleep(250); } };
const ready = () => until(async () => { const b = await getJson('/api/boot'); return b && b.phase === 'ready' ? b : null; }, 120000);
const warmDone = () => until(async () => { const r = await getJson('/api/boot-trace'); const w = r && (r.spans || []).find((s) => s.name === 'usage-ledger-warm' && s.ms != null); return w ? r : null; }, 150000);
const readClock = (tag) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, `clock-${tag}.json`), 'utf8')); } catch { return null; } };
const logOf = (tag) => { const all = fs.readFileSync(path.join(OUT, 'server.log'), 'utf8'); const i = all.lastIndexOf(`==== boot ${tag} ====`); return i < 0 ? '' : all.slice(i).split('\n==== boot ')[0]; };

// ── boot 0: N real sessions to restore, then the server dies the way a restart kills it ──
console.log(`② ${SESSIONS} real sessions (a first boot creates them, then SIGKILL)`);
boot('setup', {}, false);
check('the setup boot answers ready', !!(await ready()));
{
  const WebSocket = require('ws');
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  const created = []; ws.on('message', (d) => { try { const m = JSON.parse(d); if (m.type === 'created') created.push(m); } catch { } });
  for (let i = 0; i < SESSIONS; i++) {
    ws.send(JSON.stringify({ type: 'create', backend: 'shell', mode: 'terminal', cwd: HOME, cols: 120, rows: 30, reqId: 'r' + i }));
    await until(async () => created.length > i, 20000);
  }
  check(`${SESSIONS} shell sessions created`, created.length === SESSIONS, created.length);
  ws.close();
}
await stop('SIGKILL');

// ── boot 1: THE MEASURED BOOT ──
console.log('③ the measured boot: production-shaped stores + the restore');
boot('measured');
const b1 = await ready();
await warmDone();
await sleep(600); // the clocks' next ticks past the warm's last slice (a hold is recorded when the loop turns again)
const rep1 = await getJson('/api/boot-trace');
const c1 = readClock('measured'), j1 = judge(c1), log1 = logOf('measured');
await stop();
const reconnected = (log1.match(/✓ Reconnected:/g) || []).length;
check(`the ${SESSIONS} sessions were restored (the restore really ran)`, !!b1 && reconnected === SESSIONS, reconnected);
const span = (r, n) => ((r && r.spans) || []).find((s) => s.name === n) || null;
const warm1 = span(rep1, 'usage-ledger-warm');
check('the ledger warm ran in slices and loaded the shape\'s ledger', !!warm1 && warm1.slices > 100 && warm1.rows > shape.rows.ledger * 0.5, warm1);
check('the OTel stash replay, the identity repair and the restore probes ran off the loop (each a span that ended)', ['otel-replay', 'identity-repair', 'restore-probes'].every((n) => span(rep1, n) && span(rep1, n).ms != null), rep1 && rep1.spans);
check(`THE LAW: no gap ≥ ${LAW_MS} ms from the first loop turn to the warm's end (max ${j1.maxMs} ms; code loading ${j1.firstMs} ms, not judged; monitorEventLoopDelay max ${c1 && c1.eldMax} ms)`, j1.ok, { over: j1.over, named: rep1 && rep1.holds });
check('the server\'s own boot clock agrees: its longest hold is under the law and its code-loading time is this clock\'s first turn (±150 ms)', !!rep1 && rep1.maxHoldMs < LAW_MS && Math.abs((rep1.mainMs || 0) - (c1 ? c1.first : 0)) <= 150 + (rep1.startAt || 0), rep1 && { mainMs: rep1.mainMs, startAt: rep1.startAt, first: c1 && c1.first, maxHoldMs: rep1.maxHoldMs });

// ── boot 2: THE RED CONTROL — the warm the old way (one tick), with the sync-op tracer on ──
console.log('④ RED control: VIBESPACE_BOOT_TRACE_SYNC=1 (+ VIBESPACE_BOOT_TRACE=1)');
boot('control', { VIBESPACE_BOOT_TRACE_SYNC: '1', VIBESPACE_BOOT_TRACE: '1' });
await ready();
await until(async () => { const r = await getJson('/api/boot-trace'); return r && (r.steps || []).some((s) => s.name === 'usage-ledger-warm') ? r : null; }, 150000);
await sleep(600);
const rep2 = await getJson('/api/boot-trace');
const c2 = readClock('control'), j2 = judge(c2);
await stop();
check(`the same judge is RED on the old warm (max ${j2.maxMs} ms)`, !j2.ok && j2.over.length > 0, j2);
const named = rep2 && (rep2.holds || []).find((h) => h.name === 'usage-ledger-warm');
check('…the server names the hold: the step usage-ledger-warm, and the tracer its sync sites in src/usage-history.js', !!named && named.ms >= LAW_MS && (named.sites || []).some((x) => /usage-history\.js/.test(x.what)), named || (rep2 && rep2.holds));

console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
