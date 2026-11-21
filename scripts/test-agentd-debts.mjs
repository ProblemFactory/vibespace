#!/usr/bin/env node
// THE DEVICE AGENT'S DEBTS, RUN FOR REAL (row B-27e8 — 主开发 r1132; lane bl-loop-a). The agent's BUILT bundle (esbuild with the
// release's flags, as test-agentd-stay) runs as daemons of their own roots and HOME; a hub's link is a stand-in on each socket.
//  ① A LOCK THAT NAMES NO PROCESS (r569, older than B-147f): an EMPTY lock (its open succeeded, its write failed: ENOSPC) was read as
//     pid 0 — process.kill(0, 0) SUCCEEDS (it signals the group) — so every later start was refused for good. Now: an empty lock, or
//     one naming no number, older than a write's moment is STALE — the agent starts and holds it; a FRESH empty lock (another agent
//     between its open and its write) is refused, exit 3 — planted a minute AHEAD, so no slow start can age it out (the scene's
//     daemons start together). The lock's write REALLY failing (a file-size limit of 0: the kernel refuses it, EFBIG — node ignores SIGXFSZ):
//     the agent refuses its OWN empty lock, exit 3, and never runs without it. RED: the cure cut ⇒ the aged empty lock refuses the
//     start, exit 3; RED: the write's error swallowed ⇒ the start goes past the singleton holding an EMPTY lock. No prlimit on the
//     machine ⇒ that scene is SKIPPED BY NAME
//  ② THE PIPE CONVERSATION'S START (pipeSessions.open, the B-147f cure read only until now): the daemon's own copy of the input fifo
//     is closed after the spawn — it holds the attach's one tail a start and nothing else of the start — and a start that never got a pid
//     closes its three handles. Read in the daemon's own table (/proc/<pid>/fd: Linux — elsewhere ② is SKIPPED BY NAME) by WHAT
//     EACH HANDLE NAMES (r1558: a count moved with unrelated handles under load): every start holds its tail's .out (a tail never
//     opened is named) and nothing else of its start. RED: the fifo's close cut ⇒ its .in left a start;
//     RED: the no-pid road's closes cut ⇒ its three handles left a start
//  ③ THE PID-0 KILL LAW IN THE STREAM MODULES (r569): every process.kill there is guarded by a real pid, and the five sites the
//     B-147f fold guarded keep `pid > 0` beside their kill (a census by line; CONTROL a guard removed in a copy is named). Their
//     Windows and Mac roads ran on no machine here: those machines are the integrator's
// Every wait is bounded on what happened.
// Run: node scripts/test-agentd-debts.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIG = require(path.join(REPO, 'src/agentd-signature.js'));
const { Mux, PROTO_VERSION } = require(path.join(REPO, 'src/agentd/mux.js'));
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n      ' + JSON.stringify(extra).slice(0, 1500) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 25) => { const end = Date.now() + ms; for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) return v; await sleep(step); } };
const T = scratch('agentd-debts');
fs.mkdirSync(T, { recursive: true });

const kids = [], started = [];   // the daemons, and the programs their pipe conversations started (detached: ended by pid)
const endKids = (sig) => { for (const c of kids) if (c.exitCode === null && c.signalCode === null) { try { c.kill(sig); } catch { } } };
const endStarted = () => { for (const p of started) if (p > 1) { try { process.kill(p, 'SIGKILL'); } catch { } } };
process.on('exit', () => { endKids('SIGKILL'); endStarted(); });
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => { endKids('SIGKILL'); endStarted(); process.exit(128 + os.constants.signals[sig]); });

const C = { crypto }, K = SIG.generateKeyPair(C), KROW = { keyId: K.keyId, publicKey: K.publicKey };
const bundle = path.join(T, 'agentd-debts.js');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), ['src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', '--external:xlsx', '--preserve-symlinks', `--outfile=${bundle}`, '--log-level=error'], { cwd: REPO });
const bsrc = fs.readFileSync(bundle, 'utf8').replace(/\b(const|var|let) RELEASE_KEYS = \[[^\]]*\];/, (_, kw) => `${kw} RELEASE_KEYS = [];`);
const realVersion = (/\bVERSION\s*:\s*"(\d+\.\d+\.\d+)"/.exec(bsrc) || [])[1];
const muts = {
  noEmptyStale: bsrc.replace('if (!(pid > 0)) {', 'if (false) {'),
  fifoKept: bsrc.replace(/(\w+)\.closeSync\(errFd\);(\s*)\w+\.closeSync\(inFd\);/, '$1.closeSync(errFd);$2/* the daemon\'s copy of the fifo kept */'),   // the pipe start's (another road closes an inFd too)
  noPidKept: bsrc.replace('for (const fd of [inFd, outFd, errFd])', 'for (const fd of [])'),   // the no-pid road's loop (the spawn's own stdio array is the same three)
  writeSwallowed: (() => { const re = /([\w$]+)\.writeSync\(([\w$]+), String\(process\.pid\)\);/g; return (bsrc.match(re) || []).length === 1 ? bsrc.replace(re, 'try { $1.writeSync($2, String(process.pid)); } catch { }') : bsrc; })(),   // the lock's write (the ONE such write) with its error swallowed
};
ok(!!realVersion && Object.values(muts).every((m) => m !== bsrc), `(the base: the built bundle ${realVersion}, its release keys emptied; ${Object.keys(muts).length} RED copies, each with one edit applied: ${Object.entries(muts).map(([k, m]) => `${k} ${m !== bsrc ? 'applied' : 'NOT APPLIED'}`).join(', ')})`);
const HOMEN = path.join(T, 'home'); fs.mkdirSync(HOMEN, { recursive: true });   // never the person's HOME
const tok = (p) => [p, '_'].join('') + crypto.randomBytes(12).toString('hex');   // built at run time (no token-shaped literal)
const install = (name, src) => {
  const root = path.join(T, name);
  const inst = path.join(root, realVersion); fs.mkdirSync(inst, { recursive: true });
  fs.writeFileSync(path.join(inst, 'agentd.js'), src);
  fs.symlinkSync(inst, path.join(root, 'current'));
  const state = path.join(root, 'state'); fs.mkdirSync(state, { recursive: true, mode: 0o700 });
  const token = tok('vsht');
  fs.writeFileSync(path.join(state, 'token'), token, { mode: 0o600 });
  fs.writeFileSync(path.join(state, 'trusted-keys.json'), SIG.trustText([KROW], { from: 'test', at: 'x' }), { mode: 0o600 });
  const read = (f) => { try { return fs.readFileSync(path.join(state, f), 'utf8'); } catch { return null; } };
  return { name, root, state, token, lock: path.join(state, 'agentd.lock'), log: () => read('agentd.log') || '', lockPid: () => { const t = read('agentd.lock'); return t == null ? null : t.trim(); } };
};
const start = (d) => {
  const c = spawn(process.execPath, [path.join(d.root, 'current', 'agentd.js')], { detached: true, stdio: 'ignore', env: { ...process.env, HOME: HOMEN, VIBESPACE_AGENTD_ROOT: d.root, VIBESPACE_DEVICE_ROOT: d.root } });
  c.unref(); kids.push(c); d.child = c;
  d.exited = null; c.once('exit', (code, sig) => { d.exited = { code, sig }; });
};
const PRLIMIT = (() => { try { execFileSync('prlimit', ['--version'], { stdio: 'ignore', timeout: 5000 }); return true; } catch { return false; } })();
const PROC = process.platform === 'linux' && fs.existsSync('/proc/self/fd');   // ②'s count reads the daemon's own table
// the lock's write REALLY fails: under a file-size limit of 0 the kernel refuses every write to a file (EFBIG; node ignores SIGXFSZ) —
// the lock's open succeeds, its write does not. Its stderr is kept (the refusal's words); its end is read at 'close' (stderr drained)
const startNoWrite = (d) => {
  const c = spawn('prlimit', ['--fsize=0', '--', process.execPath, path.join(d.root, 'current', 'agentd.js')], { detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, HOME: HOMEN, VIBESPACE_AGENTD_ROOT: d.root, VIBESPACE_DEVICE_ROOT: d.root } });
  d.err = ''; c.stderr.on('data', (b) => { if (d.err.length < 8192) d.err += b; });
  c.unref(); kids.push(c); d.child = c;
  d.exited = null; c.once('close', (code, sig) => { d.exited = { code, sig }; });
};
const link = (stream, token) => {
  const inbox = []; let waiters = [];
  const mux = new Mux(stream, { onControl: (m) => { inbox.push(m); waiters = waiters.filter((w) => !w(m)); }, onData: () => { }, onDead: () => { } });
  const wait = (pred, ms = 10000) => new Promise((res) => {
    const hit = inbox.find(pred); if (hit) { inbox.splice(inbox.indexOf(hit), 1); res(hit); return; }
    const t = setTimeout(() => res({ op: 'TIMEOUT' }), ms);
    waiters.push((m) => { if (!pred(m)) return false; clearTimeout(t); inbox.splice(inbox.indexOf(m), 1); res(m); return true; });
  });
  return { mux, wait, hello: () => { mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: token }); return wait((m) => m.op === 'hello-ack'); } };
};
const sockOf = (d) => until(() => { try { const p = fs.readFileSync(path.join(d.state, 'socket-path'), 'utf8').trim(); return fs.existsSync(p) ? p : null; } catch { return null; } }, 10000);
const sockLink = async (d) => { const p = await sockOf(d); if (!p) return null; const s = net.connect(p); const okc = await new Promise((r) => { s.once('connect', () => r(true)); s.once('error', () => r(false)); }); if (!okc) return null; const L = link(s, d.token); const ack = await L.hello(); return { L, s, ack, p }; };
const fdsOf = (d) => { try { return fs.readdirSync(`/proc/${d.child.pid}/fd`).length; } catch { return -1; } };

try {
  console.log('— ① A LOCK THAT NAMES NO PROCESS · ② THE PIPE CONVERSATION\'S START — real daemons of the built bundle');
  const aged = (d, text) => { fs.writeFileSync(d.lock, text); const t = new Date(Date.now() - 60000); fs.utimesSync(d.lock, t, t); };
  const E1 = install('empty-aged', bsrc), E2 = install('empty-aged-red', muts.noEmptyStale), E3 = install('empty-fresh', bsrc), E4 = install('word-aged', bsrc);
  const E5 = install('write-fails', bsrc), E6 = install('write-fails-red', muts.writeSwallowed);
  const P1 = install('pipe', bsrc), P2 = install('pipe-fifo-red', muts.fifoKept), P3 = install('pipe-nopid-red', muts.noPidKept);
  const ahead = (d, text) => { fs.writeFileSync(d.lock, text); const t = new Date(Date.now() + 60000); fs.utimesSync(d.lock, t, t); };   // a slow start cannot age it out
  aged(E1, ''); aged(E2, ''); ahead(E3, ''); aged(E4, 'not-a-pid\n');
  const PIPES = PROC ? [P1, P2, P3] : [];
  for (const d of [E1, E2, E3, E4, ...PIPES]) start(d);
  if (PRLIMIT) { startNoWrite(E5); startNoWrite(E6); }
  const holds = (d) => d.exited === null && d.lockPid() === String(d.child.pid);
  const pl = {};
  await Promise.all([
    until(() => holds(E1) && holds(E4) && E2.exited && E3.exited && (!PRLIMIT || (E5.exited && E6.exited)), 10000),
    ...PIPES.map(async (d) => { pl[d.name] = await sockLink(d); }),
  ]);
  ok(holds(E1) && holds(E4), `① an EMPTY lock, and one naming no number, older than a write's moment: STALE — the agent starts and holds it (pids ${E1.lockPid()}, ${E4.lockPid()})`, { e1: E1.exited, e4: E4.exited, log: E1.log().split('\n').slice(-3) });
  ok(!!E3.exited && E3.exited.code === 3 && E3.lockPid() === '', `① a FRESH empty lock — another agent between its open and its write (its time a minute AHEAD: no slow start ages it out; a clock ahead reads the same) — is refused, exit 3 (${JSON.stringify(E3.exited)}), and left as it is`, E3.exited);
  ok(!!E2.exited && E2.exited.code === 3, `RED: the cure cut ⇒ the aged empty lock refuses the start for good (exit ${E2.exited && E2.exited.code}: «already running (pid ?)»)`, E2.exited);
  if (PRLIMIT) {
    ok(!!E5.exited && E5.exited.code === 3 && /already running \(pid \?/.test(E5.err) && E5.lockPid() === '',
      `① the lock's write REALLY fails (the kernel refuses it: EFBIG under a file-size limit of 0): the agent refuses its OWN empty lock — exit ${E5.exited && E5.exited.code}, «already running (pid ?» — and never runs without it; the empty lock is left (a start past the grace takes it)`, { exited: E5.exited, err: E5.err.slice(0, 300), lock: E5.lockPid() });
    ok(E6.lockPid() === '' && !/already running/.test(E6.err) && !(E6.exited && E6.exited.code === 3),
      `RED: the write's error swallowed ⇒ the start goes PAST the singleton holding an EMPTY lock (${E6.exited ? `exit ${E6.exited.code} at a later write: ${(/\bE[A-Z]{3,}\b/.exec(E6.err) || ['?'])[0]}` : 'still running'})`, { exited: E6.exited, err: E6.err.slice(0, 300) });
  } else console.log('  – ① the lock\'s failed write: SKIPPED BY NAME — no prlimit on this machine (the kernel\'s refusal needs a file-size limit of 0)');
  if (PROC) {
  const up = [P1, P2, P3].every((d) => pl[d.name] && pl[d.name].ack.op === 'hello-ack');
  ok(up, `(② three real daemons answer hello on their sockets — ${realVersion})`, Object.fromEntries(Object.entries(pl).map(([k, v]) => [k, v && v.ack && v.ack.op])));
  const N = 6;   // a start's handles counted at its reply: ONE transient handle (a log append, mkfifo's pipes) may sit in a count — each bound allows it
  // r1558 (red under load, three sightings: «4 descriptors for 6 pipe starts»): A COUNT IS NOT THE FACT. The first form counted the
  // table's growth; under load an unrelated handle open at the base (a log append, a probe's pipes) and gone later lowered it, even
  // with every tail open (its own gate: 4 for 6, no tail missing). So each handle is judged by WHAT IT NAMES, once the fact holds:
  // the daemon's own table (/proc/<pid>/fd, each link read) holds every started conversation's tail (its .out) — bounded, a start
  // whose tail never opened NAMED — and then NOTHING ELSE of a start: no fifo (.in), no .err, no second .out. A handle that names
  // none of them is not this leg's (it can come and go). The REDs leak exactly those names: the fifo kept (one .in a start), the
  // no-pid road's three kept (.in, a second .out, .err a start)
  const handlesOf = (d, sids) => {
    let dir = path.join(d.state, 'sessions'); try { dir = fs.realpathSync(dir); } catch { }
    const want = new Map(), per = new Map(sids.map((x) => [x, { out: 0, in: 0, err: 0 }]));
    for (const x of sids) for (const k of ['out', 'in', 'err']) want.set(path.join(dir, `${x}.${k}`), [x, k]);
    try { for (const fd of fs.readdirSync(`/proc/${d.child.pid}/fd`)) { let l = null; try { l = fs.readlinkSync(`/proc/${d.child.pid}/fd/${fd}`); } catch { } const w = l && want.get(l); if (w) per.get(w[0])[w[1]]++; } } catch { }
    return per;
  };
  const opens = async (d, how) => {
    const L = pl[d.name] && pl[d.name].L; if (!L) return { delta: null, extra: null };
    const base = fdsOf(d), pids = [], sids = [];
    for (let i = 0; i < N; i++) {
      const chan = (how === 'fresh' ? 200 : 300) + i, sid = `dbt-${how}-${i}`; sids.push(sid);
      const spec = how === 'fresh' ? { cmd: process.execPath, args: ['-e', 'setTimeout(() => { }, 30000)'] } : { cmd: path.join(T, 'no-such-program'), args: [] };
      L.mux.control({ op: 'open-pipe-session', chan, sid, ...spec, cwd: T, env: {} });
      const m = await L.wait((x) => (x.op === 'pipe-session-open' || x.op === 'session-error') && x.chan === chan, 8000);
      pids.push(m.op === 'pipe-session-open' ? m.pid : m.op);
      if (Number.isInteger(m.pid) && m.pid > 1) started.push(m.pid);
    }
    let h = handlesOf(d, sids); const tailless = () => sids.filter((x) => h.get(x).out < 1);
    for (const tEnd = Date.now() + 10000; tailless().length && Date.now() < tEnd;) { await sleep(25); h = handlesOf(d, sids); }
    const left = tailless(), extra = sids.reduce((n, x) => { const c = h.get(x); return n + Math.max(0, c.out - 1) + c.in + c.err; }, 0);
    return { delta: fdsOf(d) - base, pids, unopened: left, extra, per: Object.fromEntries(sids.map((x) => [x, h.get(x)])) };
  };
  const g = {}, r1 = {}, r2 = {};
  for (const how of ['fresh', 'nopid']) { g[how] = await opens(P1, how); r1[how] = await opens(P2, how); r2[how] = await opens(P3, how); }
  const never = [...(g.fresh.unopened || []), ...(g.nopid.unopened || [])];
  ok(up && !never.length && g.fresh.extra === 0 && g.fresh.pids.every((p) => Number.isInteger(p) && p > 1) && g.nopid.extra === 0 && g.nopid.pids.every((p) => p === null),
    `② ${N} pipe conversations started: each holds its tail (its .out) and NOTHING ELSE of its start — no fifo, no .err, no second .out (${g.fresh.extra} left; the table grew by ${g.fresh.delta}, a handle that names none of them not judged); ${N} starts that never got a pid: ${g.nopid.extra} of their three handles left${never.length ? ` — NEVER OPENED in 10 s: ${never.join(', ')}` : ''}`, { g });
  ok(r1.fresh.extra >= N, `RED: the fifo's close cut ⇒ its .in left a start (${r1.fresh.extra} for ${N}: at least ${N})`, r1);
  ok(r2.nopid.extra >= 3 * N, `RED: the no-pid road's closes cut ⇒ three handles left a start (${r2.nopid.extra} for ${N}: at least ${3 * N})`, r2);
  } else console.log(`  – ② SKIPPED BY NAME: the descriptor count reads /proc/<pid>/fd — this machine (${process.platform}) has none`);

  console.log('— ③ THE PID-0 KILL LAW IN THE STREAM MODULES (by line)');
  {
    const FILES = ['src/agentd/stream-screen.js', 'src/agentd/stream-window-source.js', 'src/agentd/stream-mac.js', 'src/desktop-sound.js'];
    // THE FOLD'S FIVE (B-147f): each kill of a start that may have failed carries a real pid beside it (or on the line above)
    const FOLD = [
      ['src/agentd/stream-screen.js', 'const finish = (r) =>', 'ffmpeg()\'s finish: a start with no pid'],
      ['src/agentd/stream-screen.js', 'const end = (c) =>', 'the stream\'s ends'],
      ['src/agentd/stream-window-source.js', 'const kill = (c) =>', 'the window source\'s kill'],
      ['src/agentd/stream-mac.js', 'if (child && child.exitCode == null && child.pid > 0)', 'the mac stream\'s finish'],
      ['src/desktop-sound.js', 'for (const c of [r.helper, r.enc])', 'desktop-sound endRun (its guard opens the loop)'],
    ];
    const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
    const census = (files) => {
      const unguarded = [], foldOff = [];
      for (const [f, t] of files) {
        const L = strip(t).split('\n');
        L.forEach((ln, i) => { if (/\bprocess\.kill\(/.test(ln) && !/pid > 0/.test(ln) && !/pid > 0/.test(L[i - 1] || '')) unguarded.push(`${f}:${i + 1}`); });
        for (const [ff, needle] of FOLD) if (ff === f) {
          const i = L.findIndex((ln) => ln.includes(needle));
          const near = i >= 0 ? L.slice(i, i + 3).join('\n') : '';
          if (i < 0 || !/pid > 0/.test(near)) foldOff.push(`${f} «${needle}»`);
        }
      }
      return { unguarded, foldOff };
    };
    const tree = FILES.map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]);
    const cg = census(tree);
    const cut = tree.map(([f, t]) => [f, f === 'src/agentd/stream-window-source.js' ? t.replace('if (c && c.exitCode == null && !c.killed && c.pid > 0) {', 'if (c && c.exitCode == null && !c.killed) {') : t]);
    const cr = census([...cut, ['src/planted-kill.js', 'function end(c) {\n  process.kill(c.pid, 0);\n}\n']]);
    ok(!cg.unguarded.length && !cg.foldOff.length, `every process.kill in the four stream modules is guarded by a real pid, and the fold's ${FOLD.length} sites keep \`pid > 0\` beside their kill (${cg.unguarded.join(', ') || 'none unguarded'}; ${cg.foldOff.join(', ') || 'none off'}) — their Windows and Mac roads ran on no machine here`, cg);
    ok(cr.foldOff.length === 1 && /stream-window-source/.test(cr.foldOff[0]) && cr.unguarded.join() === 'src/planted-kill.js:2', `CONTROL: a guard removed in a copy, and a planted unguarded kill, are named (${[...cr.foldOff, ...cr.unguarded].join(', ')})`, cr);
  }
} catch (e) { fail++; console.error('  ✗ threw: ' + ((e && e.stack) || e)); }
finally {
  endKids('SIGTERM');
  await until(() => kids.every((c) => c.exitCode !== null || c.signalCode !== null), 5000);
  endKids('SIGKILL'); endStarted();
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
