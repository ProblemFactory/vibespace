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
//     lane ci-351-reds (2026-10-24, red on two hosted runs at 253 / 258 ms): EVERY gap says its cause in three numbers —
//     the main thread's CPU in it (process.threadCpuUsage), its run-queue wait (ready, given no CPU: /proc/thread-self/
//     schedstat) and a SAME-BOX CONTROL's stall over it (an idle node process on the same 10 ms clock, started beside the
//     boot). A gap's HOLD = its ms − max(wait, control): what the boot itself did (CPU, or a call it blocked in); the law
//     judges the hold and never moves. The hosted reds were the product — the listen tick measured 255 ms of main-thread
//     CPU here — so the groups sweep, the OTel replay and the usage cursor prune were sliced off it (kb-design-lessons §19).
//   ② non-vacuous: the N sessions reconnected, the stash replay / identity repair / ledger warm ran (the warm loaded the
//     shape's rows in > 100 slices), and the server's own boot clock (GET /api/boot-trace) agrees with this one.
//   ③ RED CONTROL: the same boot with VIBESPACE_BOOT_TRACE_SYNC=1 (the warm the old way, in one tick) is red by the
//     same judge — and VIBESPACE_BOOT_TRACE=1 names the hold: the step (usage-ledger-warm) and its sync sites.
//     (lane ledger-dedup-law r10) + a TWO-HOLD control: short calls across two holds — each credited its own share, named.
//     Lane ledger-dedup-law r12: EVERY HOLD IS NAMED — the measured boot arms the server's CPU sampler (VIBESPACE_BOOT_TRACE_CPU=1:
//     no call wrapped), so a hold that is no step names the frames its CPU stood in (the r11 acceptance's unnamed 272 ms THE
//     LAW red was the browser census's walk — src/browser-orphans.js, O(daemons² × processes) on a busy box, fixed); the warm
//     of ④ is named by its calls OR its CPU in src/usage-history.js (r11 read `sites: []` on a slow boot — its reads landed
//     outside the step and its 3.3 s of parsing made no call); a pure control of the sampler beside the two-hold one.
//     Lane ledger-dedup-law r14: A HOLD IS NAMED ONLY BY WHAT FILLS IT — the tracer names a hold by a source (calls, CPU
//     samples) only when it saw at least half the hold or 100 ms of it (else `faint`); a hold the measured boot leaves
//     unnamed passes only when this suite's own three numbers say the BOX took most of it (held < half the gap), said so;
//     THE STOPPED CONTROL: a child with the tracer, SIGSTOPped 300 ms (the box — no work of its own) ⇒ that hold UNNAMED, a
//     300 ms spin in it named (a1d92418: one 1 ms sample named the stopped hold «cpu (program)» — the check could not fail).
//     Lane ledger-dedup-law r15: THE FILL IS THE RAW TIME — 600 calls of 0.4 ms at 600 sites in a 300 ms hold name it (f3027952
//     summed the sites' rounded ms: 0 — `faint`); THE DIAGNOSTICS ROW — ⚙ Diagnostics' own row expression lists a hold's
//     `faint` sites, greyed, under its named ones (f3027952 rendered `sites` only: they vanished from the table).
//   ⑤ A PROBE THAT CANNOT BE REAPED IS AN ANSWER (B-92a4, lane boot-probes-unkillable): the same boot with a fake `fuser`
//     + `pgrep` on PATH that ignore TERM and never answer about a restore socket (the NFS D-state stand-in) ⇒ the listener
//     opens within the probe cap + 5 s of the probes' start, the span names the N unanswered, every session is restored
//     (probe-pending, alive), none retired; once the questions answer again the re-probe settles all N alive.
//   ⑥ RED CONTROL: the pre-fix pair (runChild settles only in execFile's callback, no cap) over the same fakes ⇒ no
//     listener within 40 s.
// Run: node scripts/test-boot-loop-hold.mjs   (BOOT_SHAPE_SCALE=0.3 for a lighter shape; BOOT_SESSIONS=13)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
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

/** The control's stall over [at, at + ms] (absolute ms): the longest overlap of one of its own gaps with that span. */
const stallOver = (control, at, ms) => ((control && control.gaps) || []).reduce((m, x) => Math.max(m, Math.min(at + ms, x.at + x.ms) - Math.max(at, x.at)), 0);
/** THE JUDGE (PURE): the clock's gaps past the first loop turn, each with what the BOX can be shown to have done to it —
 *  `wait` (the main thread's run-queue wait in the gap) and `ctl` (the same-box control's stall over it) — and the HOLD,
 *  what the boot did: ms − max(wait, ctl). A hold at or over the law is red. A gap with no run-queue reading and no
 *  control is all hold (strict). `cpu` rides each gap for the words. */
function judge(clock, law = LAW_MS, control = null) {
  const gaps = ((clock && clock.gaps) || []).map((g) => { const ctl = Math.round(stallOver(control, (clock.origin || 0) + g.at, g.ms)); return { ...g, ctl, held: Math.max(0, g.ms - Math.max(g.wait || 0, ctl)) }; });
  const over = gaps.filter((g) => g.held >= law);
  const top = gaps.reduce((m, g) => (!m || g.ms > m.ms ? g : m), null);
  return { ok: !!clock && clock.first != null && !over.length, over, gaps, top, maxMs: top ? top.ms : 0, maxHeld: gaps.reduce((m, g) => Math.max(m, g.held), 0), firstMs: clock ? clock.first : null };
}
/** A gap in words: «listen 226 ms (cpu 223 · run-queue wait 3 · control 0 ⇒ held 223)». */
const holdName = (h) => (h && (h.name || ((h.sites || [])[0] || {}).what)) || null; // r12: a step / span, else what ran in it
// r14: an unnamed hold in words — the sites the tracer saw in it too thinly to name it (`faint`), if any
const holdWords = (h) => holdName(h) || (h && h.faint && h.faint.length ? `unnamed (faint: ${h.faint.map((x) => `${x.ms} ms ${x.what}`).join(', ')})` : null);
const gapWords = (g, names = []) => g ? `${holdWords(names.find((h) => Math.abs(h.at - g.at) <= 50)) || '—'} ${g.ms} ms (cpu ${g.cpu ?? '?'} · run-queue wait ${g.wait ?? '?'} · control ${g.ctl} ⇒ held ${g.held})` : 'none';
console.log('① the judge');
check('a 300 ms gap past the first turn is red', !judge({ first: 900, gaps: [{ at: 2000, ms: 300 }] }).ok);
check('a 249 ms gap is green; the first turn (the code loading) is never judged', judge({ first: 5000, gaps: [{ at: 2000, ms: 249 }] }).ok);
check('no clock answer is red (an unread clock proves nothing)', !judge(null).ok && !judge({ first: null, gaps: [] }).ok);
check('a 300 ms gap that was 300 ms of main-thread CPU is red — with or without a control beside it', !judge({ first: 900, gaps: [{ at: 2000, ms: 300, cpu: 300, wait: 0 }] }).ok && !judge({ first: 900, origin: 1e6, gaps: [{ at: 2000, ms: 300, cpu: 300, wait: 0 }] }, LAW_MS, { gaps: [{ at: 1e6 + 2100, ms: 30 }] }).ok);
check('a 300 ms gap the box made wait 120 ms for a CPU holds 180 ms: green, and said', judge({ first: 900, gaps: [{ at: 2000, ms: 300, cpu: 175, wait: 120 }] }).ok && judge({ first: 900, gaps: [{ at: 2000, ms: 300, cpu: 175, wait: 120 }] }).maxHeld === 180);
check('a 300 ms gap the same-box control stalled 200 ms over is green (the whole box was held); a stall elsewhere excuses nothing', judge({ first: 900, origin: 1e6, gaps: [{ at: 2000, ms: 300, cpu: 90, wait: 0 }] }, LAW_MS, { gaps: [{ at: 1e6 + 2050, ms: 200 }] }).ok && !judge({ first: 900, origin: 1e6, gaps: [{ at: 2000, ms: 300, cpu: 90, wait: 0 }] }, LAW_MS, { gaps: [{ at: 1e6 + 5000, ms: 200 }] }).ok);
check('no run-queue reading and no control ⇒ the whole gap is the hold (strict)', !judge({ first: 900, gaps: [{ at: 2000, ms: 260, cpu: 100, wait: null }] }).ok);

// ── the scratch server: this tree's code in a worktree, the shape in its data/, HOME a scratch home ──
const wt = scratch('blh-wt'), HOME = scratch('blh-home'), FIX = scratch('blh-canonical'), OUT = scratch('blh-out');
for (const d of [HOME, FIX, OUT]) fs.mkdirSync(d, { recursive: true });
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
let srv = null, ctl = null; // the server, and the same-box control beside a measured boot
const cleanup = () => {
  try { srv && srv.kill('SIGKILL'); } catch { }
  try { ctl && ctl.kill('SIGKILL'); } catch { }
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
// the suite's own loop clock, independent of the server's: a preload ticking every 10 ms from process start; each gap
// carries the main thread's CPU in it and its run-queue wait (schedstat's 2nd field, ns; read by pread — never a reopen);
// every gap ≥ 20 ms is kept, so the listen tick is measured even when it is short
const PRELOAD = path.join(OUT, 'clock.cjs');
fs.writeFileSync(PRELOAD, `if (require('worker_threads').isMainThread) { // a Worker inherits -r: its own clock would overwrite the main thread's
const { performance, monitorEventLoopDelay } = require('perf_hooks'); const fs = require('fs');
const out = process.env.BOOT_GATE_OUT, gaps = []; let last = performance.now(), first = null;
let sfd = -1; try { sfd = fs.openSync('/proc/thread-self/schedstat', 'r'); } catch { }
const sb = Buffer.alloc(96), facts = () => { const c = process.threadCpuUsage(); let w = null; if (sfd >= 0) { try { const n = fs.readSync(sfd, sb, 0, 96, 0); w = Number(sb.toString('latin1', 0, n).split(' ')[1]) / 1e6; } catch { } } return { cpu: (c.user + c.system) / 1000, wait: w }; };
let lastF = facts();
const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
setInterval(() => { const t = performance.now(), f = facts(); if (first === null) first = Math.round(t); else if (t - last - 10 >= 20) gaps.push({ at: Math.round(last), ms: Math.round(t - last - 10), cpu: Math.round(f.cpu - lastF.cpu), wait: f.wait == null || lastF.wait == null ? null : Math.round(f.wait - lastF.wait) }); last = t; lastF = f; }, 10).unref();
setInterval(() => { try { fs.writeFileSync(out + '.tmp', JSON.stringify({ origin: performance.timeOrigin, first, gaps, eldMax: Math.round(h.max / 1e6) })); fs.renameSync(out + '.tmp', out); } catch { } }, 250).unref();
}
`);
const CONTROL = path.join(OUT, 'control.cjs');
fs.writeFileSync(CONTROL, `const { performance, monitorEventLoopDelay } = require('perf_hooks'); const fs = require('fs');
const out = process.argv[2], gaps = []; let last = performance.now();
const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
setInterval(() => { const t = performance.now(); if (t - last - 10 >= 20) gaps.push({ at: Math.round(performance.timeOrigin + last), ms: Math.round(t - last - 10) }); last = t; }, 10);
const save = () => { try { fs.writeFileSync(out + '.tmp', JSON.stringify({ gaps, eldMax: Math.round(h.max / 1e6) })); fs.renameSync(out + '.tmp', out); } catch { } };
setInterval(save, 250); process.on('SIGTERM', () => { save(); process.exit(0); });
`);
// THE SAME-BOX CONTROL: an idle node process on the same 10 ms clock (gaps in absolute ms) — the whole box held shows here
const ctlStart = (tag) => { ctl = spawn(process.execPath, [CONTROL, path.join(OUT, `control-${tag}.json`)], { stdio: 'ignore' }); };
const ctlStop = async (tag) => { const p = ctl; ctl = null; if (!p) return null; p.kill('SIGTERM'); await Promise.race([new Promise((r) => (p.exitCode !== null ? r() : p.once('exit', r))), sleep(5000)]); try { return JSON.parse(fs.readFileSync(path.join(OUT, `control-${tag}.json`), 'utf8')); } catch { return null; } };
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
ctlStart('measured');
boot('measured', { VIBESPACE_BOOT_TRACE_CPU: '1' }); // r12: the sampler only — every hold named by what ran in it
const b1 = await ready();
await warmDone();
await sleep(600); // the clocks' next ticks past the warm's last slice (a hold is recorded when the loop turns again)
const c1 = readClock('measured'); // r12: the clock read BEFORE the sampler's one fold (its stop is a turn of its own)
const rep1 = await getJson('/api/boot-trace?cpu=1'), log1 = logOf('measured'); // r12: ?cpu=1 — the samples folded, once
const k1 = await ctlStop('measured');
await stop();
const j1 = judge(c1, LAW_MS, k1), names1 = (rep1 && rep1.holds) || [];
const ctlMax1 = ((k1 && k1.gaps) || []).reduce((m, x) => Math.max(m, x.ms), 0);
console.log(`  the gaps ≥ 100 ms: ${j1.gaps.filter((g) => g.ms >= 100).map((g) => gapWords(g, names1)).join(' · ') || 'none'}; the control's own longest stall ${ctlMax1} ms (monitorEventLoopDelay ${k1 && k1.eldMax} ms)`);
// the listen tick = the gap that holds the server's own listenAt (the same process clock); none ≥ 20 ms = a short tick
const listen1 = rep1 && rep1.listenAt != null ? j1.gaps.find((g) => g.at <= rep1.listenAt && rep1.listenAt <= g.at + g.ms + 10) : null;
console.log(`  the listen tick: ${listen1 ? `${listen1.ms} ms on the clock, ${listen1.cpu} ms of main-thread CPU (run-queue wait ${listen1.wait ?? '?'}, control ${listen1.ctl})` : 'under 20 ms on the clock'} (kb-design-lessons §19: re-measured each release)`);
const reconnected = (log1.match(/✓ Reconnected:/g) || []).length;
check(`the ${SESSIONS} sessions were restored (the restore really ran)`, !!b1 && reconnected === SESSIONS, reconnected);
const span = (r, n) => ((r && r.spans) || []).find((s) => s.name === n) || null;
const warm1 = span(rep1, 'usage-ledger-warm');
check('the ledger warm ran in slices and loaded the shape\'s ledger', !!warm1 && warm1.slices > 100 && warm1.rows > shape.rows.ledger * 0.5, warm1);
check('the OTel stash replay, the identity repair and the restore probes ran off the loop (each a span that ended)', ['otel-replay', 'identity-repair', 'restore-probes'].every((n) => span(rep1, n) && span(rep1, n).ms != null), rep1 && rep1.spans);
check(`THE LAW: no hold ≥ ${LAW_MS} ms from the first loop turn to the warm's end — the longest gap ${gapWords(j1.top, names1)}; the longest hold ${j1.maxHeld} ms; code loading ${j1.firstMs} ms, not judged; monitorEventLoopDelay max ${c1 && c1.eldMax} ms`, j1.ok, { over: j1.over.map((g) => gapWords(g, names1)), named: names1 });
// r12: the server names EVERY hold it recorded (≥ 100 ms) — its step / span, or the frames its CPU stood in (the sampler ran).
// r14: named only by what FILLS it (the tracer's rule) — a hold this suite's own clock saw the BOX take most of (held, its
// ms − max(run-queue wait, the control's stall), under half the gap) may go unnamed, and is said as the box's
const gapOf1 = (h) => j1.gaps.find((x) => Math.abs(x.at - h.at) <= 50) || null;
const boxMade = (h) => { const g = gapOf1(h); return !!g && g.held < g.ms / 2; };
const unnamed1 = names1.filter((h) => !holdName(h) && !boxMade(h));
check(`every hold the server recorded is NAMED — ${names1.map((h) => `${h.ms} ms ${holdWords(h) || 'UNNAMED'}${!holdName(h) && boxMade(h) ? ` — the box's (wait ${gapOf1(h).wait ?? '?'} · control ${gapOf1(h).ctl} of ${gapOf1(h).ms} ms)` : ''}`).join(' · ') || 'none ≥ 100 ms'} (the sampler: ${rep1 && rep1.cpu ? `${rep1.cpu.samples} samples${rep1.cpu.error ? ', ' + rep1.cpu.error : ''}` : 'NOT armed'}; 935a9f0b: «— 272 ms», the browser census's walk, unnamed)`, !!rep1 && !!rep1.cpu && rep1.cpu.samples > 0 && !unnamed1.length, { unnamed1, cpu: rep1 && rep1.cpu });
// the server's own clock by the same rule: each of its holds at or over the law is a gap this clock judged the BOX's
const serverOver = names1.filter((h) => h.ms >= LAW_MS).filter((h) => { const g = j1.gaps.find((x) => Math.abs(x.at - h.at) <= 50); return !g || g.held >= LAW_MS; });
check(`the server's own boot clock agrees: its longest hold ${rep1 && rep1.maxHoldMs} ms (${serverOver.length ? 'held by the boot' : rep1 && rep1.maxHoldMs >= LAW_MS ? 'the box\'s, by the same three numbers' : 'under the law'}) and its code-loading time is this clock's first turn (±150 ms)`, !!rep1 && !serverOver.length && Math.abs((rep1.mainMs || 0) - (c1 ? c1.first : 0)) <= 150 + (rep1.startAt || 0), rep1 && { mainMs: rep1.mainMs, startAt: rep1.startAt, first: c1 && c1.first, maxHoldMs: rep1.maxHoldMs, serverOver });

// ── boot 2: THE RED CONTROL — the warm the old way (one tick), with the sync-op tracer on ──
console.log('④ RED control: VIBESPACE_BOOT_TRACE_SYNC=1 (+ VIBESPACE_BOOT_TRACE=1)');
ctlStart('control');
boot('control', { VIBESPACE_BOOT_TRACE_SYNC: '1', VIBESPACE_BOOT_TRACE: '1' });
await ready();
await until(async () => { const r = await getJson('/api/boot-trace'); return r && (r.steps || []).some((s) => s.name === 'usage-ledger-warm') ? r : null; }, 150000);
await sleep(600);
const rep2 = await getJson('/api/boot-trace?cpu=1'); // r12: the sampler's samples folded (once)
const c2 = readClock('control'), k2 = await ctlStop('control'), j2 = judge(c2, LAW_MS, k2);
await stop();
check(`the same judge (law + the same-box control) is RED on the old warm: ${gapWords(j2.top, (rep2 && rep2.holds) || [])}`, !j2.ok && j2.over.length > 0, j2);
const named = rep2 && (rep2.holds || []).find((h) => h.name === 'usage-ledger-warm');
const warmBy = (k) => ((named && named.sites) || []).filter((x) => /usage-history\.js/.test(x.what) && (k === 'cpu') === /^cpu /.test(x.what)).length;
check(`…the server names the hold: the step usage-ledger-warm, and the tracer its sites in src/usage-history.js — ${warmBy('call')} by its sync calls, ${warmBy('cpu')} by the CPU it spent there (r11: \`sites: []\` on a slow boot — its 3.3 s of parsing made no call)`, !!named && named.ms >= LAW_MS && (named.sites || []).length > 0 && warmBy('call') + warmBy('cpu') > 0, named || (rep2 && rep2.holds));
// lane ledger-dedup-law r10: THE TWO-HOLD CONTROL — the control above warms in ONE tick (one hold), so a fold that crossed holds
// stayed green there; a stepped warm is many holds of short calls. 600 calls of 0.5 ms, 0.3 ms apart, across two 240 ms holds
// (the loop turning between them, a fake clock): each hold is credited only its own share (by overlap, the op closed when the
// loop turned) and names its site — r9 folded the run into ONE op credited 300 ms to the first hold, the second «sites: []»
{
  const BT = require(path.join(repo, 'src/server/boot-trace.js')), f = path.join(repo, 'package.json'), orig = fs.existsSync;
  let clock = 0, turnNo = 0; const ops = [];
  fs.existsSync = function (...a) { clock += 0.5; return orig.apply(this, a); };
  const undo = BT.wrapSync({ ops, now: () => clock, turn: () => turnNo });
  try { for (let k = 0; k < 600; k++) { clock += 0.3; if (k === 300) turnNo++; fs.existsSync(f); } } finally { undo(); fs.existsSync = orig; }
  const two = [{ at: 0, ms: 240 }, { at: 240, ms: 240 }].map((g) => { const sites = typeof BT.sitesOf === 'function' ? BT.sitesOf(ops, g) : []; return { ...g, credited: sites.reduce((n, x) => n + x.ms, 0), named: sites.some((x) => /test-boot-loop-hold\.mjs/.test(x.what)) }; });
  check(`…the two-hold control: 600 short calls across two 240 ms holds — hold 1 credited ${two[0].credited} ms, hold 2 ${two[1].credited} ms, each naming its site (a fold never crosses a hold)`, two.every((g) => g.named && g.credited > 0 && g.credited <= g.ms), { two, ops: ops.length });
}

// lane ledger-dedup-law r12: THE SAMPLER'S CONTROL — 300 ms of pure CPU in a function of this file (no sync call: the call
// tracer sees nothing) ⇒ the sampler names this file's frame for most of it (935a9f0b: no sampler — nothing named)
{
  const BT = require(path.join(repo, 'src/server/boot-trace.js'));
  const smp = typeof BT.cpuSampler === 'function' ? BT.cpuSampler({ now: () => performance.now() }) : null;
  const spinParse = (ms) => { const t1 = performance.now(); let n = 0; while (performance.now() - t1 < ms) n += JSON.parse(`{"n":${n}}`).n >= 0 ? 1 : 0; return n; };
  const w0 = performance.now(); spinParse(300); const w = { at: w0, ms: performance.now() - w0 };
  if (smp) smp.drain(false);
  const got = smp ? smp.sitesIn(w) : [], mine = got.filter((x) => /test-boot-loop-hold\.mjs/.test(x.what)).reduce((n, x) => n + x.ms, 0);
  if (smp) smp.stop();
  check(`…the sampler's control: 300 ms of pure CPU in this file (no sync call) — ${mine} ms named to its frame (${got.map((x) => `${x.ms} ms ${x.what}`).join(' · ') || 'nothing named'})`, mine >= 200, got);
}

// lane ledger-dedup-law r14: THE STOPPED CONTROL — a hold is named only by what FILLS it. A child runs the tracer with the sampler
// alone; it is STOPPED 300 ms (SIGSTOP: the box, no work of its own), then spins 300 ms of CPU ⇒ the stopped hold is UNNAMED
// (what the sampler saw of it said `faint`), the spun one named by its CPU (a1d92418: one 1 ms sample named the stopped hold
// «cpu (program)» — the acceptance's stop-hold probe, 6 of 6 — so «every hold is NAMED» could not fail)
{
  const src = `const BT = require(${JSON.stringify(path.join(repo, 'src/server/boot-trace.js'))}), { performance } = require('perf_hooks');
const one = BT.start({ dataDir: null, env: { VIBESPACE_BOOT_TRACE_CPU: '1' }, windowMs: 60000 }); setInterval(() => {}, 1000);
process.stdin.on('data', (d) => { for (const c of String(d).split('\\n')) { if (c === 'spin') { const t = performance.now(); while (performance.now() - t < 300) JSON.parse('{"n":1}'); process.stdout.write('spun\\n'); } if (c === 'report') { process.stdout.write(JSON.stringify(one.report({ cpu: true })) + '\\n'); one.close(); process.exit(0); } } });
process.stdout.write('ready\\n');`;
  const child = spawn(process.execPath, ['-e', src], { stdio: ['pipe', 'pipe', 'inherit'] });
  const end = () => { try { child.kill('SIGKILL'); } catch { } };
  process.on('exit', end);
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const said = (w, ms = 15000) => until(async () => (out.split('\n').includes(w) ? true : null), ms);
  let rep = null;
  try {
    await said('ready'); await sleep(400);
    child.kill('SIGSTOP'); await sleep(300); child.kill('SIGCONT'); await sleep(400);
    child.stdin.write('spin\n'); await said('spun'); await sleep(300);
    child.stdin.write('report\n');
    await until(async () => { const l = out.split('\n').find((x) => x.startsWith('{')); return l ? (rep = JSON.parse(l)) : null; }, 15000);
  } catch { } finally { end(); }
  const big = ((rep && rep.holds) || []).filter((h) => h.ms >= 200).sort((a, b) => a.at - b.at), stopped = big[0] || null, spun = big[1] || null;
  check(`…the STOPPED control: a child stopped 300 ms (SIGSTOP — the box) holds ${stopped ? stopped.ms : '?'} ms, ${stopped ? holdWords(stopped) || 'unnamed, nothing seen in it' : 'NO HOLD'}${stopped && holdName(stopped) ? ' — NAMED' : ''}; its 300 ms spin holds ${spun ? spun.ms : '?'} ms, named ${spun ? holdName(spun) || 'NOTHING' : '—'} (a1d92418: the stopped hold named «cpu (program)» by one sample)`,
    !!stopped && !holdName(stopped) && !!spun && !!holdName(spun) && (spun.sites || []).some((x) => /^cpu /.test(x.what)), rep && rep.holds);
}

// lane ledger-dedup-law r15: THE FILL IS THE RAW TIME — 600 calls of 0.4 ms, each at its own site, in a 300 ms hold (a burst of
// lazy requires): the calls saw 240 ms of it ⇒ they name it (f3027952 summed each site's ROUNDED ms — 0 — and the 240 ms went
// `faint`); the same 600 calls at 3 sites name it too
{
  const BT = require(path.join(repo, 'src/server/boot-trace.js')), w = { at: 1000, ms: 300 };
  const at = (k) => Array.from({ length: 600 }, (_, i) => ({ op: 'readFileSync', site: `src/x${i % k}.js:1`, at: 1000 + i * 0.45, span: 0.4, ms: 0.4 }));
  const fill = (k) => { const all = BT.sitesOf(at(k), w, Infinity); return { fills: BT.fills(all, w), shown: all.slice(0, 3).reduce((n, x) => n + x.ms, 0) }; };
  const many = fill(600), few = fill(3);
  check(`…the fill is the raw time: 600 calls of 0.4 ms in a 300 ms hold — at 600 sites ${many.fills ? 'NAME it' : 'do NOT name it (faint)'}, at 3 sites ${few.fills ? 'name it' : 'do NOT name it'} (the top three shown ${many.shown} / ${few.shown} ms)`, many.fills && few.fills, { many, few });
}

// lane ledger-dedup-law r15: THE DIAGNOSTICS ROW — ⚙ Diagnostics' own row expression (src/lib/setup-flows.js) over a hold with a
// named site and a `faint` one ⇒ both listed, the faint one greyed (f3027952 read `sites` only: the faint one vanished)
{
  const src = fs.readFileSync(path.join(repo, 'src/lib/setup-flows.js'), 'utf8');
  const expr = (src.split('\n').find((l) => l.includes('const rows = bt.holds.slice(0, 5)')) || '').trim().replace(/^const rows = /, 'return ').replace(/;$/, '');
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  let row = '';
  try { row = new Function('bt', 'esc', expr)({ holds: [{ at: 215, ms: 309, name: 'listen', sites: [{ ms: 160, what: 'cpu named-site (src/x.js:1)' }], faint: [{ ms: 43, what: 'fs.readFileSync faint-site src/y.js:2' }] }] }, esc); } catch (e) { row = `THREW ${e.message}`; }
  const faint = /<div class="dim faint">43 ms · fs\.readFileSync faint-site/.test(row), named = /<div class="dim">160 ms · cpu named-site/.test(row);
  check(`…the Diagnostics row: a hold's named site ${named ? 'listed' : 'MISSING'}, its faint one ${faint ? 'listed, greyed' : 'MISSING'} — ${row.replace(/<[^>]+>/g, ' | ').replace(/( \| )+/g, ' | ').slice(0, 200)}`, named && faint, row);
}

// ── boots 3 + 4: THE RESTORE'S PROBES CANNOT BE REAPED (B-92a4) ──
console.log('⑤ a fake fuser + pgrep that ignore TERM and never answer about a restore socket (the NFS D-state stand-in)');
const FAKE = path.join(OUT, 'fake-bin'), HELD = path.join(OUT, 'held-mode'), HELD_PIDS = path.join(OUT, 'held-pids'), CAP = 8000;
fs.mkdirSync(FAKE, { recursive: true });
const realOf = (b) => process.env.PATH.split(':').map((d) => path.join(d, b)).find((f) => { try { fs.accessSync(f, fs.constants.X_OK); return true; } catch { return false; } });
for (const b of ['fuser', 'pgrep']) fs.writeFileSync(path.join(FAKE, b), `#!/bin/sh\nfor a; do case "$a" in */sockets/cw-*) if [ "$(cat ${JSON.stringify(HELD)} 2>/dev/null)" = hang ]; then echo $$ >> ${JSON.stringify(HELD_PIDS)}; trap '' TERM; exec sleep 120; fi;; esac; done\nexec ${realOf(b)} "$@"\n`, { mode: 0o755 });
const isFake = (p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').startsWith('sleep\u0000120'); } catch { return false; } }; // a recorded pid is ended only while it is still that fake
const endHeld = () => { try { for (const p of fs.readFileSync(HELD_PIDS, 'utf8').split('\n').map(Number).filter((n) => n > 1 && isFake(n))) { try { process.kill(p, 'SIGKILL'); } catch { } } } catch { } };
process.on('exit', endHeld);
const heldEnv = { PATH: `${FAKE}:${process.env.PATH}`, VIBESPACE_PROBE_CAP_MS: String(CAP) };
fs.writeFileSync(HELD, 'hang');
boot('held', heldEnv);
await until(async () => getJson('/api/boot'), 60000);
fs.writeFileSync(HELD, 'real'); // the listener is up: the questions answer again, and the re-probe (10 s after listen) settles every pending socket
const b3 = await ready();
const rep3 = await getJson('/api/boot-trace'), probes3 = span(rep3, 'restore-probes');
const reprobes = (r) => ((r && r.notes) || []).filter((n) => /^re-probe \d\/5:/.test(n.text));
const settledAll = (r) => reprobes(r).reduce((n, x) => n + Number((/: (\d+) alive, 0 dead/.exec(x.text) || [])[1] || 0), 0) === SESSIONS;
const rep3b = await until(async () => { const r = await getJson('/api/boot-trace'); return settledAll(r) ? r : null; }, 90000);
const log3 = logOf('held');
await stop();
const sockets3 = fs.readdirSync(path.join(wt, 'data', 'sockets')).filter((f) => f.startsWith('cw-')).length;
const reconnected3 = (log3.match(/✓ Reconnected:/g) || []).length;
check(`the listener opened at the cap: ${rep3 && probes3 ? rep3.listenAt - probes3.at : '?'} ms after the probes began (cap ${CAP} ms + 5 s; ${rep3 && rep3.listenAt} ms after the process started)`, !!b3 && !!probes3 && rep3.listenAt - probes3.at <= CAP + 5000, { listenAt: rep3 && rep3.listenAt, probes3 });
check(`the boot trace names what did not answer — restore-probes: ${probes3 && probes3.note}`, !!probes3 && probes3.unanswered === SESSIONS && new RegExp(`^${SESSIONS} unanswered \\((fuser|pgrep|not asked) cw-`).test(probes3.note || ''), probes3);
check(`every session restored (${reconnected3}/${SESSIONS} reconnected, probe-pending), none retired, every socket in place (${sockets3})`, reconnected3 === SESSIONS && !/Dead socket|Duplicate of/.test(log3) && sockets3 === SESSIONS && new RegExp(`${SESSIONS} session\\(s\\) adopted probe-pending`).test(log3), log3.split('\n').filter((l) => /Dead socket|Duplicate|probe-pending|\[child\]/.test(l)).slice(0, 8));
check(`the re-probe after listen settles all ${SESSIONS} alive once they answer: ${reprobes(rep3b).map((n) => n.text).join(' | ')}`, !!rep3b && reprobes(rep3b).every((n) => /0 dead \(retired\), 0 duplicate/.test(n.text)), rep3b && rep3b.notes);
endHeld();

console.log('⑥ RED control: the pre-fix pair (runChild settles only in its callback; no cap) over the same fakes');
{
  // the pre-fix runChild (2.369.274), verbatim
  const OLD_RUN_CHILD = `function runChild(bin, args, timeout) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let timer = null, timedOut = false;
    const child = execFile(bin, args, { maxBuffer: 4 * 1024 * 1024 }, (e, out, err) => {
      clearTimeout(timer);
      resolve({ code: e ? (e.code === 'ENOENT' ? 'ENOENT' : timedOut && e.signal ? 'TIMEOUT' : e.code || e.signal || 1) : 0, out: String(out || ''), err: String(err || (e && e.message) || ''), ms: Date.now() - t0 });
    });
    timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch { } }, timeout);
  });
}
`;
  const tlsF = path.join(wt, 'src/server/tls.js'), brF = path.join(wt, 'src/server/boot-restore.js');
  const tlsReal = fs.readFileSync(tlsF, 'utf8'), brReal = fs.readFileSync(brF, 'utf8');
  const rcA = tlsReal.indexOf('function runChild('), rcB = tlsReal.indexOf('\n}\n', rcA) + 3;
  const RACE = 'await Promise.race([Promise.all([drain(), drain(), drain(), drain()]), new Promise((r) => { cap = setTimeout(() => { out.capped = true; r(); }, capMs); })]);';
  check('control setup: the copy cuts runChild\'s answering timer and the cap\'s race', rcA > 0 && brReal.includes(RACE));
  fs.writeFileSync(tlsF, tlsReal.slice(0, rcA) + OLD_RUN_CHILD + tlsReal.slice(rcB));
  fs.writeFileSync(brF, brReal.replace(RACE, 'await Promise.all([drain(), drain(), drain(), drain()]);'));
  fs.writeFileSync(HELD, 'hang');
  boot('held-control', heldEnv, false);
  const t4 = Date.now();
  const listened = await until(async () => ((await getJson('/api/boot')) ? true : null), 40000);
  const ms4 = Date.now() - t4, log4 = logOf('held-control');
  await stop('SIGKILL');
  fs.writeFileSync(tlsF, tlsReal); fs.writeFileSync(brF, brReal);
  endHeld();
  check(`the pre-fix pair has NO listener within 40 s (RED): ${listened ? 'it listened at ' + ms4 + ' ms' : 'none at ' + ms4 + ' ms'}${/worker pool up/.test(log4) ? ' — its log ends past `[safe-fs] worker pool up`, the incident\'s last line' : ''}`, !listened && ms4 >= 40000 && !/running at http/.test(log4));
}

console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
