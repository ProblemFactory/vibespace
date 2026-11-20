#!/usr/bin/env node
// B-cd4b — A HUB THAT RESUMES ABOUT 80 CONVERSATIONS AT BOOT, MEASURED (lane bl-loop-a). The field event of 2026-11-05: a
// rebuilt pod went NotReady for about 4 minutes — the sign-in page's GET (every probe of the chart asks it) timed out at
// 5 s while 164 agent processes started; the main thread was busy, not blocked; it recovered alone.
// THE LAW: from the hub's first loop turn to the last resumed conversation, the sign-in page answers within 1 s at every
// 500 ms sample, and no step holds the loop 250 ms or more (the boot law of the tree, test-boot-loop-hold).
// The scratch hub: this tree's code in a scratch worktree over production-shaped stores (scripts/boot-shape.mjs), an EMPTY
// scratch home, the tree's stand-in CLI (scripts/fixtures/claude-stand-in-cli.cjs — no vendor binary) as CLAUDE_CMD, and N
// claude chat conversations over synthetic transcripts of a stated size mix ($CD4B_MIX: «count x MB», …).
//   ① DEAD — a pod rebuild: the hub and every dtach / wrapper / CLI it started are killed; the measured boot retires N dead
//     sockets, then the person's «Resume all» is driven as the page drives it (src/lib/resume-pacer.js: ONE create in
//     flight, the next when the previous one's create has ENDED — the frame src/inbox-reopen.js builds; each created
//     window attaches, as the page's does); $CD4B_PAGES pages press at once (default 1).
//   ② SURVIVE — a hub restart where dtach lives: the N conversations live, each buffer full (the chat wrapper's 500 KB
//     ring, stream-json turns with their result lines); the measured boot re-attaches every one (src/server/boot-restore.js
//     restoreSessions).
// Each measured boot: the hub's loop under a 10 ms preload clock (every gap ≥ 20 ms with its main-thread CPU and run-queue
// wait) beside an idle same-box control clock; GET /login every 500 ms from a SEPARATE process (its own loop idle) from the
// spawn to the end; the hub's own [loop-hold] lines (holds of a second or more, named) and its boot trace.
// THIS PROBE ENDS ONLY WHAT IT STARTED (主开发 20:1xZ): a process rooted in this run's own minted scratch dirs (its cwd, HOME
// or an argv token there — endRootedProcesses' rule, asked with signal 0 first) AND started after this probe — never a name
// or a pattern. It refuses to start in a container (PID 1 not an init system: a pod hosts a person's hub) and below the
// memory it needs.
import { execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, vncEnv, endRootedProcesses } from './scratch.mjs';
import { writeBootShape } from './boot-shape.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = Number(process.env.CD4B_N) || 80;
const MIX = String(process.env.CD4B_MIX || '56x2,16x10,6x40,2x100');
const SHAPES = String(process.env.CD4B_SHAPES || 'dead,survive').split(',').map((s) => s.trim()).filter(Boolean);
const PAGES = Math.max(1, Number(process.env.CD4B_PAGES) || 1);
const SCALE = Number(process.env.BOOT_SHAPE_SCALE) || 1;
const ANSWER_LAW_MS = 1000, SAMPLE_MS = 500, HOLD_LAW_MS = 250, PROBE_TIMEOUT_MS = 5000;
const T_START = Date.now(), END_BY = T_START + (Number(process.env.CD4B_BUDGET_S) || 1080) * 1000;   // the runner's --one deadline is 20 min
const S = JSON.stringify;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const left = () => END_BY - Date.now();
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : S(e)).slice(0, 1600) : ''}`); } };

// ── the guard: the machine said, a container or too little memory refused in one line ──
const pid1 = (() => { try { return fs.readFileSync('/proc/1/comm', 'utf8').trim(); } catch { return '?'; } })();
const memAvailGiB = (() => { try { return Number(/MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))[1]) / 1048576; } catch { return 0; } })();
const NEED_GIB = 4 + N * 0.15;
console.log(`machine: ${os.cpus().length} cores (${(os.cpus()[0] || {}).model || '?'}), ${Math.round(os.totalmem() / 2 ** 30)} GiB, ${memAvailGiB.toFixed(1)} GiB available, load ${os.loadavg().map((x) => x.toFixed(1)).join(' ')}, PID 1 «${pid1}», node ${process.version}`);
console.log(`N = ${N} · mix ${MIX} (count x MB of transcript) · shapes ${SHAPES.join(', ')} · pages ${PAGES} · boot-shape scale ${SCALE}`);
if (!['systemd', 'init'].includes(pid1)) { console.log(`REFUSED — PID 1 is «${pid1}», not an init system: a container (a pod hosts a person's hub); this measure runs on the first test machine only`); process.exit(2); }
if (memAvailGiB < NEED_GIB) { console.log(`REFUSED — ${memAvailGiB.toFixed(1)} GiB available, under the ${NEED_GIB.toFixed(1)} GiB this measure needs (4 + N × 0.15)`); process.exit(2); }

// ── what this run started, and only that ──
const statOf = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'latin1'); return st.slice(st.lastIndexOf(')') + 2).split(' '); } catch { return null; } };
const startOf = (pid) => { const f = statOf(pid); return f ? Number(f[19]) : null; };   // field 22: start time, clock ticks since boot
const MY_START = startOf(process.pid);
const wt = scratch('cd4b-wt'), HOME = scratch('cd4b-home'), OUT = scratch('cd4b-out'), FIX = scratch('cd4b-canonical'), BIN = scratch('cd4b-bin');
for (const d of [HOME, OUT, FIX, BIN]) fs.mkdirSync(d, { recursive: true });
function mine() {
  const seen = new Set([...endRootedProcesses(wt, { signal: 0 }), ...endRootedProcesses(HOME, { signal: 0 })]);
  return [...seen].filter((p) => { const s = startOf(p); return s != null && MY_START != null && s >= MY_START; });
}
async function endMine(sig = 'SIGKILL') {
  const pids = mine();
  for (const p of pids) { try { process.kill(p, sig); } catch { } }
  for (let i = 0; i < 50 && pids.some((p) => { const f = statOf(p); return f && f[0] !== 'Z'; }); i++) await sleep(100);
  return pids.length;
}
let srv = null, ctl = null, smp = null, hubDied = null;
const cleanup = () => {
  for (const p of [srv, ctl, smp]) { try { p && p.kill('SIGKILL'); } catch { } }
  try { for (const p of mine()) { try { process.kill(p, 'SIGKILL'); } catch { } } } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  try { fs.rmSync(WORK, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

// ── the scratch worktree: this tree's code (the built tree the runner prepared), the shape in its data/ ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
let t0 = Date.now();
const shape = writeBootShape({ dataDir: path.join(wt, 'data'), homeDir: HOME, repoDir: wt, scale: SCALE });
console.log(`  boot shape: ${(shape.bytes / 1e6).toFixed(0)} MB in ${Date.now() - t0} ms`);

// ── N transcripts (claude's JSONL: a turn = a prompt, a Read tool_use, its ~6 KB result, an answer) ──
const POOL = crypto.randomBytes(1 << 16).toString('base64');
const words = (n) => { const i = Math.floor(Math.random() * (POOL.length - n)); return POOL.slice(i, i + n); };
const hex = (n) => crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
const cwdDir = (cwd) => cwd.replace(/[/._]/g, '-');   // src/session-store.js cwdToProjectDir
function writeTranscript(file, sid, cwd, bytes) {
  const fd = fs.openSync(file, 'w'); let n = 0, parent = null, k = 0; const tBase = Date.now() - 86400e3;
  const rec = (o) => { const u = crypto.randomUUID(); const l = S({ parentUuid: parent, isSidechain: false, userType: 'external', cwd, sessionId: sid, version: '2.1.308', gitBranch: 'main', uuid: u, timestamp: new Date(tBase + (k++) * 1500).toISOString(), ...o }) + '\n'; parent = u; return l; };
  while (n < bytes) {
    const tu = 'toolu_' + hex(24), f = `${cwd}/src/f${k}.js`;
    const chunk = rec({ type: 'user', message: { role: 'user', content: words(300) } })
      + rec({ type: 'assistant', requestId: 'req_' + hex(24), message: { id: 'msg_' + hex(24), type: 'message', role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'tool_use', id: tu, name: 'Read', input: { file_path: f } }], stop_reason: 'tool_use', usage: { input_tokens: 12, cache_read_input_tokens: 40000, output_tokens: 90 } } })
      + rec({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tu, content: words(6000) }] }, toolUseResult: { type: 'text', file: { filePath: f, numLines: 120 } } })
      + rec({ type: 'assistant', requestId: 'req_' + hex(24), message: { id: 'msg_' + hex(24), type: 'message', role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'text', text: words(900) }], stop_reason: 'end_turn', usage: { input_tokens: 8, cache_read_input_tokens: 46000, output_tokens: 300 } } });
    fs.writeSync(fd, chunk); n += Buffer.byteLength(chunk);
  }
  fs.closeSync(fd); return n;
}
const sizesMB = MIX.split(',').flatMap((p) => { const m = /^\s*(\d+)\s*x\s*([\d.]+)\s*$/.exec(p); return m ? Array(Number(m[1])).fill(Number(m[2])) : []; });
while (sizesMB.length < N) sizesMB.push(sizesMB[0] || 1);
sizesMB.length = N;
// the conversations' folders live OUTSIDE the «vs-» scratch roots: src/fixture-guard.js isFixtureProjectDir takes a «vs-» folder
// under a tmp root for a test fixture, and discovery and the usage walk skip it — the boot would read less than the field's
const WORK = path.join(os.tmpdir(), `cd4b-work-${process.pid}`);
const CWDS = Array.from({ length: 8 }, (_, i) => path.join(WORK, `project-${i}`));
const convs = [];
t0 = Date.now(); let tBytes = 0;
for (let i = 0; i < N; i++) {
  const cwd = CWDS[i % CWDS.length], sid = crypto.randomUUID(), dir = path.join(HOME, '.claude', 'projects', cwdDir(cwd));
  fs.mkdirSync(cwd, { recursive: true }); fs.mkdirSync(dir, { recursive: true });
  tBytes += writeTranscript(path.join(dir, sid + '.jsonl'), sid, cwd, sizesMB[i] * 1e6);
  convs.push({ i, sid, cwd, mb: sizesMB[i], name: `conversation ${i + 1}` });
}
console.log(`  ${N} transcripts: ${(tBytes / 1e6).toFixed(0)} MB in ${Date.now() - t0} ms`);

// ── the stand-in as CLAUDE_CMD (answers the boot probes, else the stand-in) ──
const STAND_IN = path.join(repo, 'scripts/fixtures/claude-stand-in-cli.cjs');
const launcher = path.join(BIN, 'claude');
fs.writeFileSync(launcher, `#!/bin/sh\ncase "$1" in --version) echo "2.1.308 (Claude Code) stand-in"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac\nexec ${S(process.execPath)} ${S(STAND_IN)} "$@"\n`, { mode: 0o755 });

// ── the clocks: the hub's (a preload) and the same-box control's ──
const PRELOAD = path.join(OUT, 'clock.cjs');
fs.writeFileSync(PRELOAD, `if (require('worker_threads').isMainThread) {
const { performance } = require('perf_hooks'); const fs = require('fs');
const out = process.env.BOOT_GATE_OUT, gaps = []; let last = performance.now(), first = null;
let sfd = -1; try { sfd = fs.openSync('/proc/thread-self/schedstat', 'r'); } catch { }
const sb = Buffer.alloc(96), facts = () => { const c = process.threadCpuUsage(); let w = null; if (sfd >= 0) { try { const n = fs.readSync(sfd, sb, 0, 96, 0); w = Number(sb.toString('latin1', 0, n).split(' ')[1]) / 1e6; } catch { } } return { cpu: (c.user + c.system) / 1000, wait: w }; };
let lastF = facts();
setInterval(() => { const t = performance.now(), f = facts(); if (first === null) first = Math.round(t); else if (t - last - 10 >= 20) gaps.push({ at: Math.round(last), ms: Math.round(t - last - 10), cpu: Math.round(f.cpu - lastF.cpu), wait: f.wait == null || lastF.wait == null ? null : Math.round(f.wait - lastF.wait) }); last = t; lastF = f; }, 10);
setInterval(() => { try { fs.writeFileSync(out + '.tmp', JSON.stringify({ origin: performance.timeOrigin, first, gaps })); fs.renameSync(out + '.tmp', out); } catch { } }, 250).unref();
}
`);
const CONTROL = path.join(OUT, 'control.cjs');
fs.writeFileSync(CONTROL, `const { performance } = require('perf_hooks'); const fs = require('fs');
const out = process.argv[2], gaps = []; let last = performance.now();
setInterval(() => { const t = performance.now(); if (t - last - 10 >= 20) gaps.push({ at: Math.round(performance.timeOrigin + last), ms: Math.round(t - last - 10) }); last = t; }, 10);
const save = () => { try { fs.writeFileSync(out + '.tmp', JSON.stringify({ gaps })); fs.renameSync(out + '.tmp', out); } catch { } };
setInterval(save, 250); process.on('SIGTERM', () => { save(); process.exit(0); });
`);
// THE SIGN-IN SAMPLER: its own process, GET /login every 500 ms on a fixed clock (a slow answer never delays the next ask —
// the chart's probes are independent), each answer's time; a refused connection (no listener yet) is said as such
const SAMPLER = path.join(OUT, 'sampler.cjs');
fs.writeFileSync(SAMPLER, `const http = require('http'); const fs = require('fs');
const [port, out, every] = [Number(process.argv[2]), process.argv[3], Number(process.argv[4])]; const rows = [];
const save = () => { try { fs.writeFileSync(out + '.tmp', JSON.stringify(rows)); fs.renameSync(out + '.tmp', out); } catch { } };
const ask = () => { const at = Date.now(), row = { at, ms: null, status: null, err: null }; rows.push(row);
  const req = http.get({ host: '127.0.0.1', port, path: '/login', timeout: 60000, agent: false }, (res) => { row.status = res.statusCode; row.ms = Date.now() - at; res.resume(); });
  req.on('timeout', () => { row.err = 'timeout 60 s'; req.destroy(); }); req.on('error', (e) => { if (row.ms == null) { row.err = e.code || e.message; row.errMs = Date.now() - at; } }); };
ask(); setInterval(ask, every); setInterval(save, 250); process.on('SIGTERM', () => { save(); process.exit(0); });
`);

const [PORT] = await freePorts(1);
const VNC = await vncEnv();
const logPath = path.join(OUT, 'server.log'), logFd = fs.openSync(logPath, 'a');
const boot = (tag, clock) => {
  const env = { ...process.env, ...VNC, HOME, PORT: String(PORT), CLAUDE_CMD: launcher, VS_NO_REAL_CLI: '1', VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANGELOG_FIXTURE_DIR: FIX, BOOT_GATE_OUT: path.join(OUT, `clock-${tag}.json`), ...(clock ? { VIBESPACE_BOOT_TRACE_CPU: '1' } : {}) };
  fs.writeSync(logFd, `\n==== boot ${tag} ====\n`);
  srv = spawn(process.execPath, [...(clock ? ['-r', PRELOAD] : []), 'server.js'], { cwd: wt, env, stdio: ['ignore', logFd, logFd] });
  const me = srv; me.once('exit', (code, sig) => { if (srv === me && !me._stopping) { hubDied = { tag, code, sig, at: Date.now() }; console.log(`  THE HUB DIED (${tag}): exit ${code} signal ${sig}`); } });
  return srv;
};
const stopHub = async (sig) => { const p = srv; srv = null; if (!p) return; p._stopping = true; try { p.kill(sig); } catch { } await Promise.race([new Promise((r) => (p.exitCode !== null || p.signalCode ? r() : p.once('exit', r))), sleep(15000)]); };
const getJson = async (u) => { try { const r = await fetch(`http://127.0.0.1:${PORT}${u}`, { signal: AbortSignal.timeout(30000) }); return r.ok ? await r.json() : null; } catch { return null; } };
const until = async (fn, ms, step = 250) => { const tEnd = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > tEnd || hubDied) return v; await sleep(step); } };
const ready = (ms = 180000) => until(async () => { const b = await getJson('/api/boot'); return b && b.phase === 'ready' ? b : null; }, ms);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const logOf = (tag) => { const all = fs.readFileSync(logPath, 'utf8'); const i = all.lastIndexOf(`==== boot ${tag} ====`); return i < 0 ? '' : all.slice(i).split('\n==== boot ')[0]; };
const startAux = (tag) => {
  ctl = spawn(process.execPath, [CONTROL, path.join(OUT, `control-${tag}.json`)], { stdio: 'ignore' });
  smp = spawn(process.execPath, [SAMPLER, String(PORT), path.join(OUT, `login-${tag}.json`), String(SAMPLE_MS)], { stdio: 'ignore' });
};
const stopAux = async () => { for (const p of [smp, ctl]) { if (!p) continue; try { p.kill('SIGTERM'); } catch { } await Promise.race([new Promise((r) => (p.exitCode !== null ? r() : p.once('exit', r))), sleep(5000)]); } smp = ctl = null; };

/** A socket to the hub, its frames: a frame over 64 KB (a history page) is never parsed — its type and session read off its head. */
const WebSocket = require('ws');
async function socket() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { maxPayload: 512 * 1024 * 1024 });
  const ends = new Map(), attached = new Map(), errs = []; let inFlight = 0;
  ws.on('message', (d) => {
    let m = null;
    if (d.length <= 65536) { try { m = JSON.parse(String(d)); } catch { return; } }
    else { const h = String(d.subarray(0, 400)); const ty = /"type":"([^"]+)"/.exec(h), sid = /"sessionId":"([^"]+)"/.exec(h); m = { type: ty && ty[1], sessionId: sid && sid[1], big: d.length }; }
    if (!m) return;
    if (m.reqId && (m.type === 'created' || m.type === 'error')) { const f = ends.get(m.reqId); if (f) f(m); }
    if (m.type === 'attached' && m.sessionId) { const f = attached.get(m.sessionId); if (f) f(m); }
    else if (m.type === 'error' && m.sessionId && attached.has(m.sessionId)) { errs.push(m); const f = attached.get(m.sessionId); if (f) f(m); }
  });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  ws.on('error', () => { });   // a hub killed under an open socket (the restart shapes) is no fault of the probe's
  ws.on('close', () => { for (const f of [...ends.values(), ...attached.values()]) f({ type: 'closed' }); });   // a dead hub ends every wait at once
  const create = (frame, ms) => new Promise((r) => { if (ws.readyState !== 1) { r({ type: 'closed' }); return; } const t = setTimeout(() => { ends.delete(frame.reqId); r({ type: 'timeout' }); }, ms); ends.set(frame.reqId, (m) => { clearTimeout(t); ends.delete(frame.reqId); r(m); }); ws.send(S(frame)); });
  // the page's slab (src/lib/view-visibility.js attachSlab): the full text window while no other attach of this socket is
  // unanswered, the floor behind one
  const attach = (sessionId) => new Promise((r) => { const slab = inFlight >= 1 ? 'floor' : 'text'; inFlight++; attached.set(sessionId, (m) => { attached.delete(sessionId); inFlight--; r(m); }); if (ws.readyState !== 1) { attached.delete(sessionId); inFlight--; r({ type: 'closed' }); return; } ws.send(S({ type: 'attach', sessionId, slab })); });
  return { ws, create, attach, errs };
}
const resumeFrame = (c, reqId, bulk = false) => ({ type: 'create', backend: 'claude', mode: 'chat', cwd: c.cwd, sessionName: c.name, resume: true, resumeId: c.sid, cols: 120, rows: 30, reqId, ...(bulk ? { bulk: true } : {}) });

/** The sign-in samples over a window [from, to] (absolute ms): answered / worst / over the law / over the probe's 5 s. A
 *  refused connection BEFORE the first answer is the hub not listening yet (the startup probe's span, B-b1f7) and is said
 *  apart; every other sample with no answer counts against the law. */
function samplesOver(rows, from, to) {
  const w = (rows || []).filter((r) => r.at >= from && r.at <= to);
  const firstOk = w.find((r) => r.ms != null);
  const preListen = w.filter((r) => r.ms == null && r.err === 'ECONNREFUSED' && (!firstOk || r.at < firstOk.at));
  const answered = w.filter((r) => r.ms != null), unanswered = w.filter((r) => r.ms == null && !preListen.includes(r));
  const worst = answered.reduce((m, r) => (!m || r.ms > m.ms ? r : m), null);
  return { n: w.length, preListen: preListen.length, answered: answered.length, unanswered: unanswered.map((r) => ({ at: r.at - from, err: r.err })).slice(0, 5), unansweredN: unanswered.length,
    worst: worst ? worst.ms : null, worstAt: worst ? worst.at - from : null, overLaw: answered.filter((r) => r.ms > ANSWER_LAW_MS).length, overProbe: answered.filter((r) => r.ms > PROBE_TIMEOUT_MS).length + unanswered.length };
}
/** The hub clock's gaps in [from, to] (absolute ms), each with the control's stall over it: held = ms − max(run-queue wait, control). */
function holdsOver(clock, control, from, to) {
  if (!clock || clock.first == null) return { ok: false, top: [], maxHeld: null };
  const stall = (at, ms) => ((control && control.gaps) || []).reduce((m, x) => Math.max(m, Math.min(at + ms, x.at + x.ms) - Math.max(at, x.at)), 0);
  const gaps = (clock.gaps || []).map((g) => { const at = clock.origin + g.at; const c = Math.round(stall(at, g.ms)); return { ...g, abs: at, ctl: c, held: Math.max(0, g.ms - Math.max(g.wait || 0, c)) }; }).filter((g) => g.abs >= from && g.abs <= to);
  const top = [...gaps].sort((a, b) => b.held - a.held).slice(0, 6);
  return { ok: true, top, maxHeld: top.length ? top[0].held : 0, over: gaps.filter((g) => g.held >= HOLD_LAW_MS).length, sum: gaps.filter((g) => g.held >= HOLD_LAW_MS).reduce((s, g) => s + g.held, 0) };
}
const holdLines = (tag) => logOf(tag).split('\n').filter((l) => l.includes('[loop-hold]')).map((l) => l.slice(0, 420));
async function report(tag, from, to, marks) {
  const clock = readJson(path.join(OUT, `clock-${tag}.json`)), control = readJson(path.join(OUT, `control-${tag}.json`)), rows = readJson(path.join(OUT, `login-${tag}.json`)) || [];
  const first = clock && clock.first != null ? clock.origin + clock.first : from;
  const firstAnswer = rows.find((r) => r.ms != null);
  const s = samplesOver(rows, first, to), h = holdsOver(clock, control, first, to);
  const trace = await getJson('/api/boot-trace');
  const steps = trace ? [...(trace.steps || []), ...(trace.spans || [])].filter((x) => (x.ms || 0) >= 100).sort((a, b) => b.ms - a.ms).slice(0, 8).map((x) => `${x.name} ${x.ms} ms`) : [];
  console.log(`  ${tag}: window ${((to - first) / 1000).toFixed(1)} s from the first loop turn (${marks}); the first /login answer at ${firstAnswer ? ((firstAnswer.at + firstAnswer.ms - first) / 1000).toFixed(1) + ' s' : 'never'}`);
  console.log(`  ${tag}: /login — ${s.n} samples, ${s.preListen} refused before the listen, ${s.answered} answered, worst ${s.worst} ms (at +${s.worstAt != null ? (s.worstAt / 1000).toFixed(1) : '?'} s), ${s.overLaw} over ${ANSWER_LAW_MS} ms, ${s.overProbe} over the probe's ${PROBE_TIMEOUT_MS} ms; unanswered ${s.unansweredN} ${s.unansweredN ? S(s.unanswered) : ''}`);
  console.log(`  ${tag}: loop — longest hold ${h.maxHeld} ms; ${h.over} gaps held ≥ ${HOLD_LAW_MS} ms (${h.sum} ms in all); the top: ${h.top.map((g) => `+${((g.abs - first) / 1000).toFixed(1)} s ${g.ms} ms (cpu ${g.cpu} · wait ${g.wait} · control ${g.ctl} ⇒ held ${g.held})`).join('; ')}`);
  console.log(`  ${tag}: boot trace ≥ 100 ms: ${steps.join(' · ') || 'none'}`);
  const hl = holdLines(tag); console.log(`  ${tag}: the hub's [loop-hold] lines: ${hl.length}${hl.length ? '\n    ' + hl.slice(0, 6).join('\n    ') : ''}`);
  check(`${tag}: THE LAW — /login answered within ${ANSWER_LAW_MS} ms at every ${SAMPLE_MS} ms sample past the listen (worst ${s.worst} ms, N = ${N})`, s.overLaw === 0 && s.unansweredN === 0 && s.answered > 0, s);
  check(`${tag}: THE LAW — no loop hold ≥ ${HOLD_LAW_MS} ms from the first loop turn (longest ${h.maxHeld} ms, N = ${N})`, h.ok && h.over === 0, h.top);
}

// ── boot 0 (setup): N conversations resumed live, then the measured shapes ──
console.log(`① setup: ${N} claude chat conversations on the stand-in`);
boot('setup', false);
check('the setup boot answers ready', !!(await ready()));
const live = new Map(), liveIds = new Set();   // liveIds: the server ids of the conversations running NOW (their buffers <id>.buf)
{
  const c = await socket(); t0 = Date.now(); const refused = [];
  for (const v of convs) {
    if (left() < 600000 || hubDied) break;
    const m = await c.create(resumeFrame(v, 'setup-' + v.i), 120000);
    if (m.type === 'created') { live.set(v.sid, m.sessionId); liveIds.add(m.sessionId); } else refused.push({ i: v.i, type: m.type, code: m.code, message: String(m.message || m.error || '').slice(0, 160) });
  }
  console.log(`  ${live.size} of ${N} created in ${((Date.now() - t0) / 1000).toFixed(1)} s${refused.length ? '; not: ' + S(refused.slice(0, 3)) : ''}`);
  check(`all ${N} conversations created live (the stand-in behind the real chat wrapper)`, live.size === N, refused.slice(0, 3));
  c.ws.close();
}
await sleep(2000);

if (SHAPES.includes('dead') && (left() <= 420000 || hubDied)) check(`DEAD skipped (${Math.round(left() / 1000)} s left${hubDied ? ', the hub died' : ''})`, false);
else if (SHAPES.includes('dead')) {
  console.log(`② DEAD — the pod rebuild: the hub and every process it started killed; the boot, then «Resume all» (${PAGES} page${PAGES > 1 ? 's' : ''}, one create in flight each)`);
  await stopHub('SIGKILL');
  const n = await endMine('SIGKILL');
  liveIds.clear();   // every one of them died with its processes
  console.log(`  ended ${n} processes this run started (dtach, wrappers, the stand-ins, the device daemon)`);
  startAux('dead'); await sleep(300);
  const tBoot = Date.now(); boot('dead', true);
  const b = await ready();
  const tReady = Date.now();
  check('the measured boot answers ready', !!b);
  // the press: each page resumes its share, one create in flight, the next when the previous one's create has ENDED
  const shares = Array.from({ length: PAGES }, (_, p) => convs.filter((v) => v.i % PAGES === p));
  const ends = [], attaches = [];
  const pages = await Promise.all(shares.map(() => socket()));
  await Promise.all(shares.map(async (share, p) => {
    for (const [k, v] of share.entries()) {
      if (left() < 150000 || hubDied) break;
      const t = Date.now(); const m = await pages[p].create(resumeFrame(v, `r${p}-${v.i}`, k > 0), Math.min(180000, Math.max(10000, left() - 60000)));
      ends.push({ i: v.i, ms: Date.now() - t, type: m.type, code: m.code });
      if (m.type === 'created') { liveIds.add(m.sessionId); const ta = Date.now(); attaches.push(pages[p].attach(m.sessionId).then((a) => ({ i: v.i, ms: Date.now() - ta, type: a.type, at: Date.now() }))); }
    }
  }));
  const tLastCreate = Date.now();
  const att = await Promise.race([Promise.all(attaches), sleep(Math.max(30000, Math.min(360000, left() - 120000))).then(() => null)]);
  const tLastAttach = Date.now();
  const created = ends.filter((e) => e.type === 'created').length;
  const slow = [...ends].sort((a, b2) => b2.ms - a.ms).slice(0, 3);
  console.log(`  ready ${((tReady - tBoot) / 1000).toFixed(1)} s after the spawn; ${created} of ${N} created in ${((tLastCreate - tReady) / 1000).toFixed(1)} s (create ends: median ${ends.map((e) => e.ms).sort((a, b2) => a - b2)[Math.floor(ends.length / 2)]} ms, slowest ${slow.map((e) => `#${e.i} ${e.ms} ms ${e.type}`).join(', ')}); ${att ? att.length + ' attaches answered' : 'attaches NOT all answered'} ${((tLastAttach - tLastCreate) / 1000).toFixed(1)} s after the last create`);
  if (att) { const sa = [...att].sort((a, b2) => b2.ms - a.ms).slice(0, 3); console.log(`  slowest attaches: ${sa.map((a) => `#${a.i} (${convs[a.i].mb} MB) ${a.ms} ms ${a.type}`).join(', ')}`); }
  check(`all ${N} resumed (created) through the paced road`, created === N, ends.filter((e) => e.type !== 'created').slice(0, 3));
  await sleep(1500);
  await stopAux();
  await report('dead', tBoot, tLastAttach, `the spawn → ready → ${created} paced resumes → their attaches`);
  for (const p of pages) p.ws.close();
}

if (SHAPES.includes('survive') && (left() <= 240000 || hubDied)) check(`SURVIVE skipped (${Math.round(left() / 1000)} s left${hubDied ? ', the hub died' : ''})`, false);
else if (SHAPES.includes('survive')) {
  console.log('③ SURVIVE — a hub restart where dtach lives: every buffer full, the boot re-attaches them all');
  // every LIVE conversation's buffer (the ids created last: the setup's, or the paced resume's) filled to the chat
  // wrapper's ring (500 KB): stream-json turns, each with its result line — written while its wrapper is idle (the
  // stand-in says nothing until it is asked), so the file stays as written across the restart
  await sleep(3000);
  const BUF = path.join(wt, 'data', 'session-buffers');
  // <id>.buf for EVERY live id — a wrapper the page never attached wrote none yet (the stand-in says nothing until asked), and the
  // restore reads that name whether the wrapper made it or not
  fs.mkdirSync(BUF, { recursive: true });
  const bufs = [...liveIds].map((id) => id + '.buf');
  check(`the live conversations to restore: ${bufs.length}`, liveIds.size > 0);
  const turn = (sid) => [
    S({ type: 'system', subtype: 'session_state_changed', state: 'running', session_id: sid }),
    S({ type: 'system', subtype: 'init', session_id: sid, cwd: CWDS[0], model: 'claude-sonnet-4-5', tools: ['Read', 'Edit', 'Bash'] }),
    S({ type: 'assistant', message: { id: 'msg_' + hex(24), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'tool_use', id: 'toolu_' + hex(24), name: 'Read', input: { file_path: '/src/a.js' } }], usage: { input_tokens: 9, output_tokens: 80 } }, session_id: sid }),
    S({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_' + hex(24), content: words(5000) }] }, session_id: sid }),
    S({ type: 'assistant', message: { id: 'msg_' + hex(24), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'text', text: words(1200) }], usage: { input_tokens: 9, output_tokens: 300 } }, session_id: sid }),
    S({ type: 'result', subtype: 'success', is_error: false, duration_ms: 8000 + Math.floor(Math.random() * 9000), num_turns: 2, result: words(400), session_id: sid, total_cost_usd: 0.05 + Math.random() / 10, usage: { input_tokens: 18, cache_read_input_tokens: 90000, output_tokens: 380 }, modelUsage: { 'claude-sonnet-4-5': { inputTokens: 18, outputTokens: 380, costUSD: 0.07 } } }),
    S({ type: 'system', subtype: 'session_state_changed', state: 'idle', session_id: sid }),
  ].join('\n') + '\n';
  let filled = 0;
  for (const f of bufs) { let s = ''; while (s.length < 490000) s += turn(crypto.randomUUID()); fs.writeFileSync(path.join(BUF, f), s); filled += s.length; }
  console.log(`  ${bufs.length} buffers filled: ${(filled / 1e6).toFixed(1)} MB`);
  await stopHub('SIGKILL');
  const alive = mine().length;
  startAux('survive'); await sleep(300);
  const tBoot = Date.now(); boot('survive', true);
  const b = await ready();
  check('the measured boot answers ready', !!b);
  const tReady = Date.now();
  // restoreSessions runs in the listen callback (server.js), one synchronous pass — every survivor is re-attached before the hub
  // answers anything. Then THE PAGE COMES BACK: an open page reconnects and re-attaches every window at once (the floor slab
  // behind the first, src/lib/view-visibility.js attachSlab) — each one's history rebuilt from its buffer and transcript
  const pg = await socket();
  const tA = Date.now();
  const att = await Promise.race([Promise.all([...liveIds].map((id) => pg.attach(id).then((a) => ({ id, ms: Date.now() - tA, type: a.type })))), sleep(Math.max(30000, Math.min(240000, left() - 90000))).then(() => null)]);
  const tLastAttach = Date.now();
  if (att) { const sa = [...att].sort((x, y) => y.ms - x.ms).slice(0, 3); console.log(`  ${att.length} re-attaches answered in ${((tLastAttach - tA) / 1000).toFixed(1)} s (slowest ${sa.map((a) => `${a.ms} ms ${a.type}`).join(', ')})`); }
  check(`every survivor re-attached by the returning page (${att ? att.filter((a) => a.type === 'attached').length : 0} of ${liveIds.size})`, !!att && att.every((a) => a.type === 'attached'));
  // the window runs past the restore's own timers (the capture at +2 s, the keeper re-adopt at +8 s, the re-probe ladder's first at +10 s)
  await sleep(Math.max(0, tReady + 25000 - Date.now()));
  pg.ws.close();
  await sleep(1500);   // the sampler's last asks answered before it stops
  const tEnd = Date.now();
  const restoredN = (logOf('survive').match(/✓ Reconnected: /g) || []).length;   // boot-restore.js says one line a survivor
  console.log(`  ${alive} processes of this run alive across the restart; the hub reconnected ${restoredN} of ${bufs.length}`);
  check(`the hub re-attached every survivor (${restoredN} of ${bufs.length})`, restoredN === bufs.length);
  await stopAux();
  await report('survive', tBoot, tEnd, `the spawn → ready (${bufs.length} survivors restored) → the page's ${liveIds.size} re-attaches → ready + 25 s`);
}

await stopHub('SIGTERM');
await endMine('SIGKILL');
console.log(`\n${passed} passed, ${failed} failed (${((Date.now() - T_START) / 1000).toFixed(0)} s)`);
process.exit(failed ? 1 : 0);
