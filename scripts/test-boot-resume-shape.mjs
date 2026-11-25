#!/usr/bin/env node
// B-cd4b — A HUB THAT RESUMES ABOUT 80 CONVERSATIONS AT BOOT, MEASURED (lane bl-loop-a). The field event of 2026-11-05: a
// rebuilt pod went NotReady for about 4 minutes — the sign-in page's GET (every probe of the chart asks it) timed out at
// 5 s while 164 agent processes started; the main thread was busy, not blocked; it recovered alone.
// THE LAW: from the hub's first loop turn to the last resumed conversation, the sign-in page answers within 1 s at every
// 500 ms sample, and no step holds the loop 250 ms or more (the boot law of the tree, test-boot-loop-hold).
// THE PIN (unit 1 of the row: the restore's billing-source backfill read off the loop with no program, the survivors' restore in
// bounded batches — src/server/boot-restore.js): judged on what that unit cures, at N = 80 —
//   ① DEAD under the WHOLE law; ② SURVIVE's W1 (the restore alone: from the first loop turn until its backfill has written back
//   every survivor's billing source, the page held back until then) under the whole law, and the restore's own line (every
//   survivor; its registration pass and each batch under 250 ms). W2 (the page's re-attaches) is REPORTED, not judged here:
//   hold 3 there (the claude transcript warm's one-shot reply) is the row's unit 2, then holds 4 and 5.
//   RED CONTROLS — the release's one synchronous pass planted back into the scratch tree's copy, each a restart judged on its W1:
//   every survivor attached in ONE turn (W1 breaks by a hold the boot trace names «listen»; the restore says one batch); the
//   release's forking backfill, verbatim (W1 breaks by a hold named in the restore file; the restore's batches still bounded).
//   DEAD's law is the same judge over the same clock (its release measure: 567 / 571 ms, the backfill; under the planted backfill
//   alone its hold read 268 ms — too near the law to be a control). CD4B_PAGE=ready = the measure (the page back at ready, as in
//   the field; every hold judged together; no controls).
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
// THE ENDS: the hub boots through scripts/hub-boot.mjs (one minted root; the hub and everything carrying its HOME ended by
// identity); this suite signals only its own two clocks. It refuses to start in a container (PID 1 not an init system: a pod
// hosts a person's hub) and below the memory it needs.
import { execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, vncEnv } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';
import { writeBootShape } from './boot-shape.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = Number(process.env.CD4B_N) || 80;
const MIX = String(process.env.CD4B_MIX || '56x2,16x10,6x40,2x100');
const SHAPES = String(process.env.CD4B_SHAPES || 'dead,survive').split(',').map((s) => s.trim()).filter(Boolean);
const PAGES = Math.max(1, Number(process.env.CD4B_PAGES) || 1);
// THE PAGE'S RETURN at the SURVIVE restart: «held» (the pin) — once the restore's last effect has landed, so the restore is
// judged alone; «ready» (the field's, the measure) — at ready, every hold judged together
const PAGE = process.env.CD4B_PAGE === 'ready' ? 'ready' : 'held';
const REDS = PAGE === 'held' && process.env.CD4B_REDS !== '0';
const SCALE = Number(process.env.BOOT_SHAPE_SCALE) || 1;
const ANSWER_LAW_MS = 1000, SAMPLE_MS = 500, HOLD_LAW_MS = 250, PROBE_TIMEOUT_MS = 5000;
// THE CLOCK LAW IS THE BOX'S (主开发 r965, after the suite's first hosted run: the dead scene held 316 / 323 ms on the Actions runner,
// a machine about 1.7 times slower). The law's number does not move — 250 ms is the owner's, on the hub. On the hosted runner (its own
// mark: GITHUB_ACTIONS=true — never a guess from speed) every scene still runs and every other leg is judged; the loop-hold law prints
// its reading and says by name that it is not judged there: a SKIP line (counted as a skip, never a green). The box's run is the law's proof.
const HOSTED = process.env.GITHUB_ACTIONS === 'true';
const CLOCK = [];   // each scene's longest hold and what the boot trace named it — printed at the end (inside a red run's last 40 lines)
const T_START = Date.now(), END_BY = T_START + (Number(process.env.CD4B_BUDGET_S) || 1080) * 1000;   // the runner's --one deadline is 20 min
const S = JSON.stringify;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const left = () => END_BY - Date.now();
let failed = 0, passed = 0;
const check = (n, c, e) => { if (typeof n !== 'string') throw new TypeError('check(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : S(e)).slice(0, 1600) : ''}`); } };

// ── the guard: the machine said, a container or too little memory refused in one line ──
const pid1 = (() => { try { return fs.readFileSync('/proc/1/comm', 'utf8').trim(); } catch { return '?'; } })();
const memAvailGiB = (() => { try { return Number(/MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))[1]) / 1048576; } catch { return 0; } })();
const NEED_GIB = 4 + N * 0.05;   // measured on the first test machine: ~2.8 GiB with the 80 live, ~4.6 GiB at the end (setup → DEAD → SURVIVE → the controls)
const memGiB = () => { try { return Number(/MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))[1]) / 1048576; } catch { return 0; } };
console.log(`machine: ${os.cpus().length} cores (${(os.cpus()[0] || {}).model || '?'}), ${Math.round(os.totalmem() / 2 ** 30)} GiB, ${memAvailGiB.toFixed(1)} GiB available, load ${os.loadavg().map((x) => x.toFixed(1)).join(' ')}, PID 1 «${pid1}», node ${process.version}`);
console.log(`N = ${N} · mix ${MIX} (count x MB of transcript) · shapes ${SHAPES.join(', ')} · pages ${PAGES} · boot-shape scale ${SCALE}`);
if (!['systemd', 'init'].includes(pid1)) { console.log(`REFUSED — PID 1 is «${pid1}», not an init system: a container (a pod hosts a person's hub); this measure runs on the first test machine only`); process.exit(2); }
if (memAvailGiB < NEED_GIB) { console.log(`REFUSED — ${memAvailGiB.toFixed(1)} GiB available, under the ${NEED_GIB.toFixed(1)} GiB this measure needs (4 + N × 0.05)`); process.exit(2); }

// ── ONE minted root (scripts/hub-boot.mjs, the suites' one hub boot): the scratch worktree, the HOME, the clocks' files. The hub
// and everything it starts carry that HOME, and the helper ends them BY IDENTITY at each stop and at the exit; this suite signals
// only its own two clocks, by their handles. The conversations' folders lie OUTSIDE the root (discovery and the usage walk skip a
// «vs-» scratch folder — src/fixture-guard.js — and the boot would read less than the field's): removed by the exit listener
// registered BEFORE the mint (the helper's rule 3) ──
const WORK = path.join(os.tmpdir(), `cd4b-work-${process.pid}`);
process.on('exit', () => { try { fs.rmSync(WORK, { recursive: true, force: true }); } catch { } });
const root = mintRoot('cd4b');
const wt = path.join(root, 'wt'), HOME = path.join(root, 'home'), OUT = path.join(root, 'out'), FIX = path.join(root, 'canonical'), BIN = path.join(root, 'bin');
for (const d of [HOME, OUT, FIX, BIN]) fs.mkdirSync(d, { recursive: true });
let hub = null, ctl = null, smp = null, hubDied = null;
const hubs = {};   // each boot's hub by its tag: its own log (hub.log())

// ── the scratch worktree: this tree's code (the built tree the runner prepared), the shape in its data/ ──
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
// the conversations' folders: WORK, outside the root (above)
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
const boot = (tag, clock) => {
  const env = { ...strippedEnv(), ...VNC, HOME, CLAUDE_CMD: launcher, VS_NO_REAL_CLI: '1', VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANGELOG_FIXTURE_DIR: FIX, BOOT_GATE_OUT: path.join(OUT, `clock-${tag}.json`), ...(clock ? { VIBESPACE_BOOT_TRACE_CPU: '1', VIBESPACE_BOOT_TRACE: '1' } : {}) };   // the CPU sampler + the sync ops kept: each hold's sites (a read, a parse, a start)
  hub = hubs[tag] = startHub({ root, tree: wt, port: PORT, env, nodeArgs: clock ? ['-r', PRELOAD] : [], log: `hub-${tag}` });
  const me = hub; me.child.once('exit', (code, sig) => { if (hub === me && !me._stopping) { hubDied = { tag, code, sig, at: Date.now() }; console.log(`  THE HUB DIED (${tag}): exit ${code} signal ${sig}`); } });
  return hub;
};
/** The hub stopped through the helper, BY IDENTITY: the hub alone (`hubOnly`, a restart whose conversations outlive it) or with
 *  everything carrying its HOME; then a bounded wait until each signalled process is gone. → how many it signalled. */
const gone = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'latin1'); return st.slice(st.lastIndexOf(')') + 2)[0] === 'Z'; } catch { return true; } };
const stopHub = async (sig, { hubOnly = false } = {}) => {
  const h = hub; hub = null; if (!h) return 0; h._stopping = true;
  const r = h.stop({ signal: sig, hubOnly }) || {};
  const pids = (r.signalled || []).map((x) => x.pid);
  for (const tEnd = Date.now() + 15000; Date.now() < tEnd && pids.some((p) => !gone(p));) await sleep(100);
  for (const x of r.left || []) console.log(`  left by the helper: pid ${x.pid} (${x.why})`);
  return pids.length;
};
const getJson = async (u) => { try { const r = await fetch(`http://127.0.0.1:${PORT}${u}`, { signal: AbortSignal.timeout(30000) }); return r.ok ? await r.json() : null; } catch { return null; } };
const until = async (fn, ms, step = 250) => { const tEnd = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > tEnd || hubDied) return v; await sleep(step); } };
const ready = (ms = 180000) => until(async () => { const b = await getJson('/api/boot'); return b && b.phase === 'ready' ? b : null; }, ms);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
/** r1487 (box row 54: the one-pass copy wrote back 0 of 80 billing sources) — WHEN W1'S END MARKER NEVER COMES, what the scene's hub
 *  said and holds: its log's lines naming the restore, a fence, a catch-up, a thrown turn or the billing source (the last 40); the
 *  metas' billing source by VALUE (the end marker counts 'none' alone); the hub's own live rows' billing (`auth`: read from the
 *  conversation's in-memory source — set but unwritten tells apart from never set); one survivor's buffer file now. Printed only, judged
 *  nothing: the ✗ above is the leg. */
async function saySilentBackfill(tag) {
  const lines = logOf(tag).split('\n').filter((l) => /\[boot-restore\]|fence|catch-up|threw|Error|backfill|billing|apiKeySource|loop-turn|a turn/.test(l));
  console.log(`  W1's end marker never came — the scene's hub log, ${lines.length} line(s) naming the restore, a fence, a catch-up, a throw or the billing source (the last 40):`);
  for (const l of lines.slice(-40)) console.log(`    ${l.slice(0, 300)}`);
  const vals = {}; try { for (const f of fs.readdirSync(META)) { if (!f.endsWith('.json')) continue; const m = readJson(path.join(META, f)); const v = m && 'apiKeySource' in m ? String(m.apiKeySource) : '(absent)'; vals[v] = (vals[v] || 0) + 1; } } catch { }
  console.log(`  the metas' billing source by value: ${S(vals)}`);
  const act = await getJson('/api/active'), rows = ((act && act.sessions) || []).filter((r) => liveIds.has(r.id)), bill = {};
  for (const r of rows) { const a = r.auth, k = a ? `${a.source || '?'}${a.guessed ? ' (guessed)' : ''}` : '(none)'; bill[k] = (bill[k] || 0) + 1; }
  console.log(`  the hub's live rows' billing (auth, from each conversation's in-memory source): ${S(bill)} — ${rows.length} of ${liveIds.size} rows read`);
  const one = [...liveIds][0]; let buf = null; try { buf = fs.readFileSync(path.join(BUF, one + '.buf'), 'utf8'); } catch { }
  console.log(`  one survivor's buffer file now: ${buf == null ? 'none' : `${buf.length} chars, ${buf.split('apiKeySource":"').length - 1} billing record(s), its last line ${S(buf.trimEnd().split('\n').pop().slice(0, 160))}`}`);
}
const logOf = (tag) => (hubs[tag] ? hubs[tag].log() : '');
const startAux = (tag) => {
  const env = { ...strippedEnv(), HOME };   // the helper's rule 9: a process this suite starts carries the HOME in the root
  ctl = spawn(process.execPath, [CONTROL, path.join(OUT, `control-${tag}.json`)], { stdio: 'ignore', env });
  smp = spawn(process.execPath, [SAMPLER, String(PORT), path.join(OUT, `login-${tag}.json`), String(SAMPLE_MS)], { stdio: 'ignore', env });
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
async function report(tag, from, to, marks, { label = tag, judge = 'law', fromFirst = true, plant = null } = {}) {
  const clock = readJson(path.join(OUT, `clock-${tag}.json`)), control = readJson(path.join(OUT, `control-${tag}.json`)), rows = readJson(path.join(OUT, `login-${tag}.json`)) || [];
  const first = fromFirst && clock && clock.first != null ? clock.origin + clock.first : from;   // a window from the first loop turn, or from `from`
  const firstAnswer = rows.find((r) => r.ms != null);
  const s = samplesOver(rows, first, to), h = holdsOver(clock, control, first, to);
  const trace = await getJson('/api/boot-trace?cpu=1');   // the CPU sampler's samples folded ONCE: every hold named by what ran in it
  const steps = trace ? [...(trace.steps || []), ...(trace.spans || [])].filter((x) => (x.ms || 0) >= 100).sort((a, b) => b.ms - a.ms).slice(0, 8).map((x) => `${x.name} ${x.ms} ms`) : [];
  const holdName = (h) => (h && (h.name || ((h.sites || [])[0] || {}).what)) || (h && h.faint && h.faint.length ? `unnamed (faint: ${h.faint.slice(0, 3).map((x) => `${x.ms} ms ${x.what}`).join(', ')})` : 'unnamed');
  // each hold with EVERY site the sampler saw in it, by its milliseconds (where a step's time went: a read, a parse, a fork)
  const siteWords = (h) => (h.sites || []).slice(0, 14).map((x) => `${x.ms != null ? x.ms + ' ms ' : ''}${x.what}`).join(' · ');
  const named = trace && Array.isArray(trace.holds) ? trace.holds.filter((h) => (h.ms || 0) >= 100).sort((x, y) => y.ms - x.ms).slice(0, 8).map((h) => `${h.ms} ms at +${((h.at || 0) / 1000).toFixed(1)} s: ${holdName(h)} — ${siteWords(h) || 'no site'}`) : [];
  console.log(`  ${label}: window ${((to - first) / 1000).toFixed(1)} s from the first loop turn (${marks}); the first /login answer at ${firstAnswer ? ((firstAnswer.at + firstAnswer.ms - first) / 1000).toFixed(1) + ' s' : 'never'}`);
  console.log(`  ${label}: /login — ${s.n} samples, ${s.preListen} refused before the listen, ${s.answered} answered, worst ${s.worst} ms (at +${s.worstAt != null ? (s.worstAt / 1000).toFixed(1) : '?'} s), ${s.overLaw} over ${ANSWER_LAW_MS} ms, ${s.overProbe} over the probe's ${PROBE_TIMEOUT_MS} ms; unanswered ${s.unansweredN} ${s.unansweredN ? S(s.unanswered) : ''}`);
  console.log(`  ${label}: loop — longest hold ${h.maxHeld} ms; ${h.over} gaps held ≥ ${HOLD_LAW_MS} ms (${h.sum} ms in all); the top: ${h.top.map((g) => `+${((g.abs - first) / 1000).toFixed(1)} s ${g.ms} ms (cpu ${g.cpu} · wait ${g.wait} · control ${g.ctl} ⇒ held ${g.held})`).join('; ')}`);
  console.log(`  ${label}: boot trace ≥ 100 ms: ${steps.join(' · ') || 'none'}`);
  CLOCK.push(`${label}: the longest hold ${h.maxHeld} ms${named.length ? ` — the trace's longest named: ${String(named[0]).slice(0, 220)}` : ''}`);
  // THE LISTEN STEP's window (the round's follow): from the listen callback to its last turn's end — server.js runs the restore's
  // registration ('restore') and the rest of the step ('listen-rest') each in a loop turn of its own, the boot trace's steps — and the
  // longest hold in it: the room under the bound, said in numbers (the law above judges every hold of the window)
  if (trace && trace.listenAt != null && clock && clock.first != null) {
    const base = trace.startedAt - trace.startAt, turns = (trace.steps || []).filter((x) => x.name === 'restore' || x.name === 'listen-rest');
    const w0 = base + trace.listenAt, w1 = base + (turns.length ? Math.max(...turns.map((x) => x.at + x.ms)) : trace.listenAt);
    const hw = holdsOver(clock, control, w0 - 2 * 10, w1);   // a hold begins at the clock's tick before it: one tick of slack
    console.log(`  ${label}: the listen step — ${turns.length ? turns.map((x) => `${x.name} ${x.ms} ms`).join(' · ') : 'no turns of its own (one turn)'}; ${Math.round(w1 - w0)} ms from the listen to its last turn's end; the longest hold in it ${hw.maxHeld} ms (${HOLD_LAW_MS - (hw.maxHeld || 0)} ms under the bound)`);
  }
  console.log(`  ${label}: the boot trace's holds ≥ 100 ms, named: ${named.length ? '\n    ' + named.join('\n    ') : 'none'}`);
  const hl = holdLines(tag); console.log(`  ${label}: the hub's [loop-hold] lines: ${hl.length}${hl.length ? '\n    ' + hl.slice(0, 6).join('\n    ') : ''}`);
  if (judge === 'law') {
    check(`${label}: THE LAW — /login answered within ${ANSWER_LAW_MS} ms at every ${SAMPLE_MS} ms sample past the listen (worst ${s.worst} ms, N = ${N})`, s.overLaw === 0 && s.unansweredN === 0 && s.answered > 0, s);
    const lawWords = `${label}: THE LAW — no loop hold ≥ ${HOLD_LAW_MS} ms from the first loop turn (longest ${h.maxHeld} ms, N = ${N})`;
    if (HOSTED) console.log(`  ⊘ SKIP: ${lawWords} — NOT JUDGED on the hosted runner (GITHUB_ACTIONS=true): the clock law is judged on the box only (主开发 r965); its reading is printed`);
    else check(lawWords, h.ok && h.over === 0, h.top);
  } else if (judge === 'red') {
    // TIED TO ITS PLANT: a hold ≥ the law that the boot trace names by the planted code (its step, or the sites its samples stood in)
    const tied = trace && Array.isArray(trace.holds) ? trace.holds.filter((x) => (x.ms || 0) >= HOLD_LAW_MS && !!plant && plant.re.test([x.name || '', ...(x.sites || []).map((y) => y.what), ...(x.faint || []).map((y) => y.what)].join(' · '))) : [];
    const redWords = `${label}: RED as it must be — the law breaks in this window BY ITS PLANT: a loop hold ≥ ${HOLD_LAW_MS} ms named by ${plant ? plant.what : '?'} (${tied.length ? tied.map((x) => `${x.ms} ms: ${holdName(x)}`).join('; ') : 'none'}; the longest hold ${h.maxHeld} ms, N = ${N})`;
    // 主开发 r2955 (the candidate's hosted red on Node 22: the release's one pass of 80 survivors held that runner 211–214 ms): a red
    // control's CLOCK is judged where its law is — on the box. On the hosted runner it is the law's named skip, its reading printed,
    // and the control is judged there by what it PLANTS: its structure checks below (the one batch; the release's backfill verbatim,
    // the restore's own batches under the bound) — never by a number of milliseconds a faster machine does not reach
    if (HOSTED) console.log(`  ⊘ SKIP: ${redWords} — NOT JUDGED on the hosted runner (GITHUB_ACTIONS=true): a red control's clock is judged on the box only, as its law (主开发 r2955); its plant is judged by its structure checks`);
    else check(redWords, h.ok && h.over > 0 && tied.length > 0, h.top);
  } else console.log(`  ${label}: reported, not judged in this unit (worst /login ${s.worst} ms, longest hold ${h.maxHeld} ms)`);
  return { s, h };
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
  console.log(`  memory: ${memGiB().toFixed(1)} GiB available with the ${live.size} live (${memAvailGiB.toFixed(1)} at the start)`);
  c.ws.close();
}

// ── the waits: each on a named effect, bounded ──
const BUF = path.join(wt, 'data', 'session-buffers'), META = path.join(wt, 'data', 'session-meta');
/** every live buffer's size read the same twice, 500 ms apart (nothing writes them any more) */
const settled = async (ids, ms = 20000) => {
  const sizes = () => [...ids].map((id) => { try { return fs.statSync(path.join(BUF, id + '.buf')).size; } catch { return -1; } }).join();
  let prev = sizes();
  for (const tEnd = Date.now() + ms; Date.now() < tEnd;) { await sleep(500); const now = sizes(); if (now === prev) return true; prev = now; }
  return false;
};
/** both clocks of this boot have written their first file */
const auxUp = (tag) => until(() => fs.existsSync(path.join(OUT, `control-${tag}.json`)) && fs.existsSync(path.join(OUT, `login-${tag}.json`)), 10000, 50);
/** every sign-in ask made by `by` has its answer (or its error) in the sampler's file */
const asksAnswered = (tag, by) => until(() => { const rows = readJson(path.join(OUT, `login-${tag}.json`)); return !!rows && rows.filter((r) => r.at <= by).every((r) => r.ms != null || r.err != null); }, 8000, 100);
/** the survivors whose billing source the restore's backfill has written back (its one write: the meta's apiKeySource) */
const billedN = () => { let n = 0; try { for (const f of fs.readdirSync(META)) { if (!f.endsWith('.json')) continue; const m = readJson(path.join(META, f)); if (m && m.apiKeySource === 'none') n++; } } catch { } return n; };
/** every meta's billing source taken out (the hub stopped): a restart's backfill then reads each survivor's again */
const unbill = () => { let n = 0; try { for (const f of fs.readdirSync(META)) { if (!f.endsWith('.json')) continue; const m = readJson(path.join(META, f)); if (m && 'apiKeySource' in m) { delete m.apiKeySource; fs.writeFileSync(path.join(META, f), S(m)); n++; } } } catch { } return n; };
/** the restore's own words (src/server/boot-restore.js drainSurvivorAttaches): how many, the registration pass, the batches */
const RESTORE_RE = /\[boot-restore\] (\d+) survivor\(s\): registered in (\d+) ms; attached in (\d+) batch\(es\) of ≤ (\S+) \((\d+) ms, the longest batch (\d+) ms\)/;
// unit 3's follow (r1050): «registered in N ms» is the wall time across the registration's turns; the bound judges its LONGEST turn
// («; registered in K turns of ≤ 32 (the longest M ms)»; a one-turn registration is its own longest)
const REG_TURNS_RE = /; registered in (\d+) turns of ≤ \d+ \(the longest (\d+) ms\)/;
const restoreLine = (log) => { const m = RESTORE_RE.exec(log); if (!m) return null; const t = REG_TURNS_RE.exec(log); return { line: m[0], n: +m[1], registered: +m[2], batches: +m[3], longest: +m[6], regTurns: t ? +t[1] : 1, regLongest: t ? +t[2] : +m[2] }; };

// ── THE RED CONTROLS' PLANTS: the release's one synchronous pass, written into the scratch tree's copy of the restore (never
// this tree): «one-pass-attach» = every survivor attached in the restore's one turn (the release's inline attach);
// «forking-backfill» = the release's billing-source backfill, verbatim (scripts/fixtures/boot-restore-backfill-release.txt:
// a `sh -c grep … | tail -1` started for every restored conversation in one synchronous loop). A plant whose anchor is gone
// is said and its control is red: a control that cannot be planted proves nothing ──
const RESTORE = path.join(wt, 'src', 'server', 'boot-restore.js');
const GREEN_RESTORE = fs.readFileSync(RESTORE, 'utf8');
const RELEASE_BACKFILL = fs.readFileSync(path.join(repo, 'scripts', 'fixtures', 'boot-restore-backfill-release.txt'), 'utf8');
const BACKFILL_FROM = '  // Backfill billing identity for sessions restored WITHOUT a recorded\n', BACKFILL_TO = '\n  }, 3000);\n';
const once = (t, x) => t.split(x).length === 2;
const SCENE_ADD = '{"type":"result","subtype":"success","result":"written in the window"}\n{"type":"system","subtype":"session_state_changed","state":"idle"}\n';
const PLANTS = {
  // THE SCENE (round wed0m8jzl — the loop law re-measured): each survivor's ring REWRITTEN inside the window, at its cap — its head cut,
  // two records appended, written whole (tmp + rename) as the wrapper does — a write PLACED just before each attach in the copy
  // (no load made); the catch-up then reads the whole ring and finds the read's end in it. The placed write's own cost is in the
  // batch it measures (an upper bound)
  'rewritten-ring': (t) => { const at = '    const cu = restoreCatchUp(session._restoreBuf);'; if (!once(t, at)) return null;
    return t.replace(at, `    try { const f = session._restoreBuf && session._restoreBuf.file; if (f) { const fsx = require('fs'); const old = fsx.readFileSync(f); const add = Buffer.from(${S(SCENE_ADD)}); fsx.writeFileSync(f + '.scene', Buffer.concat([old.subarray(Math.min(old.length, add.length + 4096)), add])); fsx.renameSync(f + '.scene', f); } } catch { }   // CD4B SCENE: the placed write\n` + at); },
  'one-pass-attach': (t) => (once(t, 'const ATTACH_BATCH = 8,') ? t.replace('const ATTACH_BATCH = 8,', 'const ATTACH_BATCH = Infinity,') : null),
  'forking-backfill': (t) => { if (!once(t, BACKFILL_FROM)) return null; const i = t.indexOf(BACKFILL_FROM), j = t.indexOf(BACKFILL_TO, i); return j < 0 ? null : t.slice(0, i) + RELEASE_BACKFILL + t.slice(j + BACKFILL_TO.length); },
};
// what names each plant's hold in the boot trace: the one-pass attach runs in the restore's own turn (the listen step's
// 'restore' turn since the round's follow; the attaches' localAttach); the forking backfill's callback is the planted code in
// the restore file
const PLANT_NAMES = {
  'one-pass-attach': { re: /^restore(?: · |$)|session-stdout\.js/, what: 'the restore\'s turn of the listen step (the attaches\' localAttach)' },
  'forking-backfill': { re: null, what: 'the planted backfill\'s own lines in the restore file' },   // its line range is set at the plant (below)
};
const plant = (name) => {
  const t = name ? PLANTS[name](GREEN_RESTORE) : GREEN_RESTORE; if (t == null) return false;
  if (name === 'forking-backfill') {   // the planted block's lines in the copy: a hold is the plant's only if the sampler stood IN them
    const lo = t.slice(0, t.indexOf(BACKFILL_FROM)).split('\n').length, hi = lo + RELEASE_BACKFILL.split('\n').length;
    PLANT_NAMES[name].re = { test: (x) => [...String(x).matchAll(/boot-restore\.js:(\d+)/g)].some((m) => Number(m[1]) >= lo && Number(m[1]) <= hi) };
    PLANT_NAMES[name].what = `the planted backfill's own lines (boot-restore.js:${lo}–${hi} of the copy)`;
  }
  fs.writeFileSync(RESTORE, t); return true;
};

// ── ② DEAD — the pod rebuild ──
async function deadShape(tag, { red = null } = {}) {
  const label = red ? `RED ${red} (${tag})` : tag;
  console.log(`② ${label} — the pod rebuild: the hub and every process it started killed; the boot, then «Resume all» (${PAGES} page${PAGES > 1 ? 's' : ''}, one create in flight each)`);
  const n = await stopHub('SIGKILL');
  liveIds.clear();   // every one of them died with its processes
  console.log(`  ended ${n} processes (the hub and every process carrying its HOME: dtach, wrappers, the stand-ins, the device daemon — the helper, by identity)`);
  startAux(tag); await auxUp(tag);
  const tBoot = Date.now(); boot(tag, true);
  const b = await ready();
  const tReady = Date.now();
  check(`${label}: the measured boot answers ready`, !!b);
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
  check(`${label}: all ${N} resumed (created) through the paced road`, created === N, ends.filter((e) => e.type !== 'created').slice(0, 3));
  await asksAnswered(tag, Date.now());
  await stopAux();
  await report(tag, tBoot, tLastAttach, `the spawn → ready → ${created} paced resumes → their attaches`, { label, judge: red ? 'red' : 'law' });
  for (const p of pages) p.ws.close();
}

// ── ③ SURVIVE — a hub restart where dtach lives ──
async function surviveShape(tag, { red = null, scene = null } = {}) {
  const label = red ? `RED ${red} (${tag})` : scene ? `SCENE ${scene} (${tag})` : tag;
  console.log(`③ ${label} — a hub restart where dtach lives: every buffer full, the boot re-attaches them all; the page returns ${PAGE === 'held' ? 'once the restore\'s last effect landed (W1 = the restore alone)' : 'at ready (the field\'s order)'}`);
  check(`${label}: the live conversations to restore: ${liveIds.size}`, liveIds.size > 0);
  await stopHub('SIGKILL', { hubOnly: true });
  // every LIVE conversation's buffer filled to the chat wrapper's ring (500 KB) — FOR EVERY RESTART, once the hub has stopped: a
  // page's re-attach makes the wrapper rewrite its buffer from its own memory (the queue's resync), so a buffer planted once is
  // gone by the next restart. Stream-json turns, each init with its billing source and each turn with its result line; written
  // once nothing writes them (the stand-in says nothing until it is asked), so the file stays as written across the restart
  // <id>.buf for EVERY live id: a wrapper the page never attached wrote none yet, and the restore reads that name whether the
  // wrapper made it or not
  // box row 127 (主开发 r1487's re-run): THE WRAPPER'S OWN REWRITE, LEFT TO LAND FIRST. Since the wrapper's hold, a restore's fence rides
  // each wrapper's ring FENCE_KEEP_MS (10 s) and LEAVES it by a whole rewrite of the file — a buffer planted before that rewrite is
  // overwritten by it (the red-attach scene began within 10 s of the ring scene's attaches: its registration read the wrappers' own
  // small rings, 0 of 80 billing sources). So the plant waits until no live buffer holds a fence (each keep ended, its rewrite
  // landed) — bounded, the ones still fenced named
  const fenced = () => [...liveIds].filter((id) => { try { return fs.readFileSync(path.join(BUF, id + '.buf'), 'latin1').includes('"type":"_fence"'); } catch { return false; } });
  { const tF = Date.now(); let still = fenced(); while (still.length && Date.now() - tF < 30000) { await sleep(250); still = fenced(); }
    check(`${label}: every survivor's fence left its ring before the plant (its own rewrite landed${still.length ? ` — ${still.length} STILL FENCED after 30 s: ${still.slice(0, 3).join(', ')}` : `, ${((Date.now() - tF) / 1000).toFixed(1)} s`})`, !still.length); }
  check(`${label}: the live buffers settled (each size read the same twice)`, await settled(liveIds));
  fs.mkdirSync(BUF, { recursive: true });
  const bufs = [...liveIds].map((id) => id + '.buf');
  const turn = (sid) => [
    S({ type: 'system', subtype: 'session_state_changed', state: 'running', session_id: sid }),
    S({ type: 'system', subtype: 'init', session_id: sid, cwd: CWDS[0], model: 'claude-sonnet-4-5', tools: ['Read', 'Edit', 'Bash'], apiKeySource: 'none' }),
    S({ type: 'assistant', message: { id: 'msg_' + hex(24), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'tool_use', id: 'toolu_' + hex(24), name: 'Read', input: { file_path: '/src/a.js' } }], usage: { input_tokens: 9, output_tokens: 80 } }, session_id: sid }),
    S({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_' + hex(24), content: words(5000) }] }, session_id: sid }),
    S({ type: 'assistant', message: { id: 'msg_' + hex(24), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'text', text: words(1200) }], usage: { input_tokens: 9, output_tokens: 300 } }, session_id: sid }),
    S({ type: 'result', subtype: 'success', is_error: false, duration_ms: 8000 + Math.floor(Math.random() * 9000), num_turns: 2, result: words(400), session_id: sid, total_cost_usd: 0.05 + Math.random() / 10, usage: { input_tokens: 18, cache_read_input_tokens: 90000, output_tokens: 380 }, modelUsage: { 'claude-sonnet-4-5': { inputTokens: 18, outputTokens: 380, costUSD: 0.07 } } }),
    S({ type: 'system', subtype: 'session_state_changed', state: 'idle', session_id: sid }),
  ].join('\n') + '\n';
  let filled = 0;
  for (const f of bufs) { let s = ''; while (s.length < 490000) s += turn(crypto.randomUUID()); fs.writeFileSync(path.join(BUF, f), s); filled += s.length; }
  console.log(`  ${bufs.length} buffers filled: ${(filled / 1e6).toFixed(1)} MB`);
  console.log(`  ${unbill()} meta(s) without their billing source (the restart's backfill reads each survivor's again)`);
  startAux(tag); await auxUp(tag);
  const tBoot = Date.now(); boot(tag, true);
  const b = await ready();
  check(`${label}: the measured boot answers ready`, !!b);
  const tReady = Date.now();
  let tW1 = null;
  if (PAGE === 'held') {
    // W1 — THE RESTORE ALONE: the restore (the listen callback's pass and its batches) and its backfill, until the backfill has
    // written back every survivor's billing source — the page held back until then (the hub's [loop-hold] words and the boot
    // trace name what ran in it)
    const all = await until(() => billedN() >= liveIds.size, 60000, 100);
    tW1 = Date.now();
    check(`${label}: the backfill wrote back every survivor's billing source (${billedN()} of ${liveIds.size}, ${((tW1 - tReady) / 1000).toFixed(1)} s after ready) — W1 ends`, !!all);
    if (!all) await saySilentBackfill(tag);   // r1487: W1's end marker never came — what the scene's hub said and holds, printed
  }
  const rl = restoreLine(logOf(tag));
  console.log(`  the restore's own line: ${rl ? rl.line : 'NONE'}`);
  if (scene) {   // a green scene: W1 under the whole law, and the restore says every survivor caught up what was written in the window
    await asksAnswered(tag, Date.now());
    await stopAux();
    const caughtN = (() => { const m = rl && / (\d+) caught up what they wrote since the read/.exec(rl.line + (logOf(tag).match(/\[boot-restore\] \d+ survivor\(s\): [^\n]*/) || [''])[0]); return m ? Number(m[1]) : 0; })();
    check(`${label}: the restore caught up EVERY survivor's rewritten ring (${caughtN} of ${liveIds.size}) and each batch stayed under ${HOLD_LAW_MS} ms (the longest ${rl ? rl.longest : '?'} ms, the placed write's own cost in it)`, !!rl && caughtN === liveIds.size && rl.longest < HOLD_LAW_MS, rl);
    await report(tag, tBoot, tW1 || Date.now(), `W1 — the spawn → ready → the restore, each ring rewritten in the window and caught up (${liveIds.size} survivors)`, { label });
    return rl;
  }
  if (red) {
    await asksAnswered(tag, Date.now());
    await stopAux();
    await report(tag, tBoot, tW1 || Date.now(), `W1 — the spawn → ready → the restore and its backfill (${liveIds.size} survivors)`, { label, judge: 'red', plant: PLANT_NAMES[red] });
    return rl;
  }
  check(`${label}: the restore says every survivor, its longest registration turn and each batch under ${HOLD_LAW_MS} ms`, !!rl && rl.n === liveIds.size && rl.regLongest < HOLD_LAW_MS && rl.longest < HOLD_LAW_MS, rl);
  // THE PAGE COMES BACK: an open page reconnects and re-attaches every window at once (the floor slab behind the first,
  // src/lib/view-visibility.js attachSlab) — each one's history rebuilt from its buffer and transcript
  const pg = await socket();
  const tA = Date.now();
  const att = await Promise.race([Promise.all([...liveIds].map((id) => pg.attach(id).then((a) => ({ id, ms: Date.now() - tA, type: a.type })))), sleep(Math.max(30000, Math.min(240000, left() - 90000))).then(() => null)]);
  const tLastAttach = Date.now();
  if (att) { const sa = [...att].sort((x, y) => y.ms - x.ms).slice(0, 3); console.log(`  ${att.length} re-attaches answered in ${((tLastAttach - tA) / 1000).toFixed(1)} s (slowest ${sa.map((a) => `${a.ms} ms ${a.type}`).join(', ')})`); }
  check(`${label}: every survivor re-attached by the returning page (${att ? att.filter((a) => a.type === 'attached').length : 0} of ${liveIds.size})`, !!att && att.every((a) => a.type === 'attached'));
  // the window runs past the restore's own timers (the capture at +2 s, the keeper re-adopt at +8 s, the re-probe ladder's first at
  // +10 s): a measured span, not a wait for an effect
  await sleep(Math.max(0, tReady + 25000 - Date.now()));
  pg.ws.close();
  const tEnd = Date.now();
  await asksAnswered(tag, tEnd);
  const restoredN = (logOf(tag).match(/✓ Reconnected: /g) || []).length;   // boot-restore.js says one line a survivor
  console.log(`  the hub reconnected ${restoredN} of ${liveIds.size}`);
  check(`${label}: the hub REGISTERED every survivor (its «✓ Reconnected» line, said at registration: ${restoredN} of ${liveIds.size}) — the attaches' end is the restore's own line, above`, restoredN === liveIds.size);
  await stopAux();
  if (PAGE === 'held') {
    await report(tag, tBoot, tW1, `W1 — the spawn → ready → the restore and its backfill (${liveIds.size} survivors), the page held`, { label: `${label} W1` });
    // W2 — the page's re-attaches: REPORTED, NOT JUDGED in this unit — hold 3 (the claude transcript warm's one-shot reply,
    // deserialized on the main thread) is unit 2 of this row, then the search index's live flush (hold 4) and the collections
    // (hold 5): each judged here when its unit lands
    await report(tag, tA, tEnd, `W2 — the page's ${liveIds.size} re-attaches → ready + 25 s (reported; judged from unit 2 on)`, { label: `${label} W2`, judge: 'none', fromFirst: false });
  } else await report(tag, tBoot, tEnd, `the spawn → ready (${liveIds.size} survivors restored) → the page's ${liveIds.size} re-attaches → ready + 25 s`, { label });
  return rl;
}

if (SHAPES.includes('dead') && (left() <= 420000 || hubDied)) check(`DEAD skipped (${Math.round(left() / 1000)} s left${hubDied ? ', the hub died' : ''})`, false);
else if (SHAPES.includes('dead')) await deadShape('dead');
if (SHAPES.includes('survive') && (left() <= 240000 || hubDied)) check(`SURVIVE skipped (${Math.round(left() / 1000)} s left${hubDied ? ', the hub died' : ''})`, false);
else if (SHAPES.includes('survive')) await surviveShape('survive');
console.log(`  memory: ${memGiB().toFixed(1)} GiB available now (${memAvailGiB.toFixed(1)} at the start; this measure asks ${NEED_GIB.toFixed(1)})`);

// ── ④ THE RED CONTROLS (the pin's; CD4B_PAGE=held): the release's one synchronous pass planted back, each run judged on its window
// alone — the law must BREAK there. Each control differs from the green run above by its plant only ──
if (REDS && SHAPES.includes('survive') && !hubDied && left() > 260000) {
  check('SCENE rewritten-ring: planted (a placed write before each attach in the copy)', plant('rewritten-ring'));
  await surviveShape('ring', { scene: 'rewritten-ring' });
  check('RED one-pass-attach: planted (the restore\'s ATTACH_BATCH = Infinity)', plant('one-pass-attach'));
  const r1 = await surviveShape('red-attach', { red: 'one-pass-attach' });
  check('RED one-pass-attach: the restore says it attached every survivor in ONE batch — the release\'s pass', !!r1 && r1.batches === 1 && r1.n === liveIds.size, r1);
  check('RED forking-backfill: planted (the release\'s backfill, verbatim)', plant('forking-backfill'));
  const r2 = await surviveShape('red-fork', { red: 'forking-backfill' });
  check('RED forking-backfill: the restore\'s own registration turns and batches stay under the bound — the break is the backfill\'s', !!r2 && r2.batches > 1 && r2.longest < HOLD_LAW_MS && r2.regLongest < HOLD_LAW_MS, r2);
  plant(null);
} else if (REDS) check(`the red controls skipped (${Math.round(left() / 1000)} s left${hubDied ? ', the hub died' : ''})`, false);
else console.log(`  the red controls: not run (CD4B_PAGE=${PAGE}${process.env.CD4B_REDS === '0' ? ', CD4B_REDS=0' : ''}) — a measure, not the pin`);

await stopHub('SIGTERM');
console.log(`\nTHE CLOCK, each scene's longest hold and what the boot trace named it${HOSTED ? ' (the hosted runner: printed — the loop-hold law is judged on the box only)' : ''}:${CLOCK.length ? '\n  ' + CLOCK.join('\n  ') : ' none measured'}`);
console.log(`\n${passed} passed, ${failed} failed (${((Date.now() - T_START) / 1000).toFixed(0)} s)`);
process.exit(failed ? 1 : 0);
