#!/usr/bin/env node
// THE DEAD BRIDGE (lane-dead-bridge, the 2026-09-30 production incident) — HEAVY.
//
// THE SHAPE. The server died at 12:03:17 (a relayed EMFILE in a debounce timer
// with no try/catch) and systemd restarted it. One restored session — the busy
// one — delivered NOTHING for three hours while its CLI kept calling the API
// (an OTel api_request row a minute). At 15:05:14 the owner typed, "Broken pty
// stdin detected — re-attaching dtach locally" fired, and the whole backlog
// arrived at once and was taken as live.
//
// THE MECHANISM, reproduced here on the real binaries (dtach 0.9, node-pty):
//   ① node-pty's forkpty master has no FD_CLOEXEC — every process the server
//     spawns after an attach inherits that attach's pty master;
//   ② the crash path killed no attach pty, so with the masters held elsewhere
//     the old `dtach -a` clients survived, reparented, blocked writing to a pty
//     nobody reads;
//   ③ dtach's master waits in pty_activity() for ANY attached client to be
//     writable; the new server's attach is accepted and the master re-enters
//     pty_activity before reading its attach packet — never attached. Its own
//     6-byte clear-screen preamble is all it ever gets (the 09-09 probe reads
//     that as alive).
//
// LEGS:
//   §1 the premise on raw dtach + node-pty (no server): the leak, the orphan,
//      the dead attach, the cure's ORDER (attach first, then end the orphan).
//   §2 a worktree server + a stub claude that streams stamped records, posts
//      OTel api_request rows and has the server spawn a long-lived job:
//      SIGKILL mid-stream, restart ⇒ the boot sweep ends the orphan and the
//      restored session streams within seconds.
//   §3 the CONTROL: the same restart on a pre-fix copy (no sweep, no watch)
//      stays DARK while the CLI keeps working.
//   §4 the WATCH: a stuck client the sweep may not touch (its parent is
//      alive) — the restored bridge is dead; silence + the OTel witness ⇒ the
//      re-attach within N minutes; the backlog is judged LATE (lane-hot-switch's
//      gate) and ONE card says "lost at … restored at … N records caught up".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, vncEnv, endRootedProcesses } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BL = require(path.join(REPO, 'src/bridge-liveness.js'));

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? `\n      ${extra}` : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };

const ROOT = scratch('dbridge');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const HOMEDIR = scratchHome('dbridge-home', fs);
const servers = new Set();
const worktrees = new Set();
const cleanup = () => {
  for (const s of servers) { try { s.kill('SIGKILL'); } catch { } }
  try { endRootedProcesses(ROOT); } catch { }
  try { endRootedProcesses(HOMEDIR); } catch { }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', REPO, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  try { fs.rmSync(HOMEDIR, { recursive: true, force: true }); } catch { }
};
const done = () => {
  console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed' + (skipped ? ', ' + skipped + ' skipped' : '') + ')' : 'ALL PASS (' + pass + (skipped ? ', ' + skipped + ' skipped' : '') + ')'}`);
  cleanup();
  process.exit(fail ? 1 : 0);
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

if (!fs.existsSync('/proc/self/fd')) { console.log('\ndead bridge'); skip('no /proc — the leak, the orphan and the sweep are all procfs facts'); done(); }
let DTACH = null; try { DTACH = execFileSync('/usr/bin/which', ['dtach'], { encoding: 'utf8' }).trim(); } catch { }
if (!DTACH) { console.log('\ndead bridge'); skip('dtach is not installed — no dtach session can be created here'); done(); }
const nodePty = require(path.join(REPO, 'node_modules/node-pty'));

// ── /proc helpers ────────────────────────────────────────────────────────────
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const ppidOf = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]); } catch { return null; } };
const commOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { return ''; } };
const argvOf = (pid) => { try { const a = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); if (a[a.length - 1] === '') a.pop(); return a; } catch { return []; } };
/** tty-index of every /dev/ptmx a process holds. */
const ptmxIndexes = (pid) => {
  const out = [];
  let fds = []; try { fds = fs.readdirSync(`/proc/${pid}/fd`); } catch { return out; }
  for (const fd of fds) {
    try {
      if (fs.readlinkSync(`/proc/${pid}/fd/${fd}`) !== '/dev/ptmx') continue;
      const m = /tty-index:\s*(\d+)/.exec(fs.readFileSync(`/proc/${pid}/fdinfo/${fd}`, 'utf8'));
      if (m) out.push(Number(m[1]));
    } catch { }
  }
  return out;
};
const ptsIndexOfStdout = (pid) => { try { const m = /^\/dev\/pts\/(\d+)$/.exec(fs.readlinkSync(`/proc/${pid}/fd/1`)); return m ? Number(m[1]) : null; } catch { return null; } };
const ttyNrOf = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[4]); } catch { return 0; } };
/** every attach CLIENT of one socket: `dtach -a <sock>`, or the `dtach -c <sock>` that created the session and stayed
 *  attached — told from the master (same argv) by its controlling terminal (a master has none) */
const attachClientsOf = (sock) => fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n)).map(Number)
  .filter((p) => commOf(p) === 'dtach').filter((p) => { const a = argvOf(p); return ['-a', '-c', '-A'].includes(a[1]) && a[2] === sock && ttyNrOf(p) > 0; });

// ── the record writer every leg uses: stamped JSON lines, its progress on disk ──
// `sync` = a blocking TTY write (node's own tty stdout is synchronous — the
// chat-wrapper's shape); in §2+ the stub CLI writes to a PIPE made non-blocking,
// like the real CLI whose writes queue in memory while it keeps working.
const WRITER = path.join(ROOT, 'writer.js');
fs.writeFileSync(WRITER, `
const fs = require('fs');
const prog = process.argv[2]; const every = Number(process.argv[3] || 5); const inlog = process.argv[4] || null; const blockFlag = process.argv[5] || null;
let n = 0; const pad = 'x'.repeat(400);
if (inlog) process.stdin.on('data', (d) => { try { fs.appendFileSync(inlog, String(d)); } catch {} });   // verify r1 ⑥: what reached the program's stdin
setInterval(() => {
  if (blockFlag && fs.existsSync(blockFlag)) { const t0 = Date.now(); while (Date.now() - t0 < 8000) {} try { fs.unlinkSync(blockFlag); } catch {} }   // verify r2 ⑦: a wrapper blocked 8 s in a synchronous op reads no stdin and prints nothing
  n++; process.stdout.write(JSON.stringify({ type: 'rec', n, t: Date.now(), pad }) + '\\n'); fs.writeFileSync(prog, n + ' ' + Date.now());
}, every);
`);
const progressOf = (f) => { try { const [n, t] = fs.readFileSync(f, 'utf8').split(' ').map(Number); return { n, t }; } catch { return { n: 0, t: 0 }; } };

/** attach through node-pty from THIS process; returns {p, text(), bytes(), maxN(), minN(), kill()} */
function attach(sock, { paused = false } = {}) {
  const p = nodePty.spawn(DTACH, ['-a', sock, '-E', '-r', 'winch'], { name: 'xterm-256color', cols: 120, rows: 30, env: { ...process.env, TERM: 'xterm-256color' } });
  let buf = '', bytes = 0, maxN = 0, minN = Infinity;
  const seen = new Set();
  p.onData((d) => { bytes += Buffer.byteLength(d); buf = (buf + d).slice(-400000); for (const m of d.matchAll(/"n":(\d+)/g)) { const v = Number(m[1]); if (seen.size < 20000) seen.add(v); if (v > maxN) maxN = v; if (v < minN) minN = v; } });
  if (paused) { try { p.pause(); } catch { } }
  /** the numbers missing between minN and maxN (a torn line at a cut may hide one number — the parse needs the whole `"n":N`) */
  const gaps = () => { const g = []; for (let v = (minN === Infinity ? 0 : minN); v <= maxN && g.length < 50; v++) if (!seen.has(v)) g.push(v); return g; };
  return { p, pid: p.pid, bytes: () => bytes, maxN: () => maxN, minN: () => (minN === Infinity ? 0 : minN), gaps, text: () => buf, kill: () => { try { p.kill(); } catch { } } };
}

// ═══ §1 THE PREMISE on raw dtach + node-pty ═══════════════════════════════════
console.log('\n§1 the premise — the leak, the orphan, the dead attach, the cure\'s order (raw dtach 0.9 + node-pty, no server)');
{
  const sock = path.join(ROOT, 'cw-raw');
  const prog = path.join(ROOT, 'raw.prog');
  const INLOG = path.join(ROOT, 'raw.in');
  execFileSync(DTACH, ['-n', sock, '-E', '-r', 'none', process.execPath, WRITER, prog, '5', INLOG]);
  await until(() => fs.existsSync(sock), 3000);
  const healthy = attach(sock); await sleep(600); healthy.kill(); await sleep(200);
  ok(healthy.maxN() > 20, `precondition: a healthy attach streams the writer's records (${healthy.maxN()} seen)`);

  // THE OLD SERVER: a node process that attaches through node-pty, then spawns a
  // long-lived child the way the server spawns a job or a mount, then dies by SIGKILL.
  const OLD = path.join(ROOT, 'oldserver.js');
  fs.writeFileSync(OLD, `
const pty = require(${JSON.stringify(path.join(REPO, 'node_modules/node-pty'))});
const cp = require('child_process'); const fs = require('fs');
const a = pty.spawn(${JSON.stringify(DTACH)}, ['-a', ${JSON.stringify(sock)}, '-E', '-r', 'winch'], { name: 'xterm-256color', cols: 120, rows: 30, env: process.env });
let maxN = 0; a.onData((d) => { for (const m of d.matchAll(/"n":(\\d+)/g)) { const v = Number(m[1]); if (v > maxN) maxN = v; } });   // verify r2: the last record the OLD server consumed
setInterval(() => { try { fs.writeFileSync(${JSON.stringify(path.join(ROOT, 'old.max'))}, String(maxN)); } catch {} }, 20);
setTimeout(() => {
  const h = cp.spawn('sleep', ['600'], { detached: true, stdio: 'ignore', cwd: ${JSON.stringify(ROOT)} }); h.unref();   // NOTHING passes the fd: it is inherited
  fs.writeFileSync(${JSON.stringify(path.join(ROOT, 'old.json'))}, JSON.stringify({ client: a.pid, holder: h.pid }));
  setTimeout(() => process.kill(process.pid, 'SIGKILL'), 300);
}, 500);
`);
  spawnSync(process.execPath, [OLD], { stdio: 'ignore', timeout: 10000 });
  const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'old.json'), 'utf8'));
  await sleep(2500);
  const clientPts = ptsIndexOfStdout(old.client);
  ok(clientPts != null && ptmxIndexes(old.holder).includes(clientPts),
    `① THE LEAK: a child spawned AFTER the attach holds the attach's pty master (holder ${old.holder} holds ptmx tty-index ${clientPts}) — node-pty's forkpty master has no FD_CLOEXEC`,
    `holder ptmx: ${JSON.stringify(ptmxIndexes(old.holder))}, client pts: ${clientPts}`);
  const pp = ppidOf(old.client);
  ok(alive(old.client) && pp !== null,
    `② THE ORPHAN: the old server died by SIGKILL and its dtach -a client lives on (pid ${old.client}, reparented to ${pp} ${commOf(pp)}) — the master it writes to never hung up`);
  const v = BL.orphanAttachVerdict({ argv: argvOf(old.client), ppid: pp, parentComm: commOf(pp), ttyNr: ttyNrOf(old.client), socketsDir: ROOT, selfPid: process.pid });
  ok(v.orphan === true && v.socket === sock, `…and the PURE verdict on its REAL /proc row says orphan (${v.why})`, JSON.stringify(v));
  const p1 = progressOf(prog); await sleep(1200); const p2 = progressOf(prog);
  ok(p2.n === p1.n, `③ THE STALL: the writer inside the session is BLOCKED (record ${p1.n} → ${p2.n} in 1.2 s) — the master waits for the stuck orphan`);

  const fresh = attach(sock);
  await sleep(4000);
  ok(fresh.bytes() <= 6 && fresh.maxN() === 0,
    `④ THE DEAD BRIDGE: a fresh attach gets only its own ${fresh.bytes()}-byte clear-screen preamble in 4 s and no record — what the 09-09 attach probe reads as alive`,
    JSON.stringify(fresh.text().slice(0, 80)));
  const frozenAt = progressOf(prog).n;
  // THE CURE'S ORDER: the attach is already connected — end the orphan now.
  process.kill(old.client, 'SIGKILL');
  const flowed = await until(() => fresh.maxN() > frozenAt + 50, 5000);
  ok(flowed, `⑤ attach FIRST, then end the orphan: the stuck attach is freed (records ${fresh.minN()}…${fresh.maxN()}, the writer was frozen at ${frozenAt})`);
  // The master held ONE read (≤ 4096 bytes) when the orphan died and drops it — that read is OLDER than everything still
  // in the pty's buffer, so what the writer wrote up to the freeze and after it arrives whole and in order.
  ok(fresh.minN() > 0 && fresh.minN() <= frozenAt && fresh.gaps().length <= 1,
    `…nothing the blocked writer wrote is lost: one unbroken run from ${fresh.minN()} (≤ the frozen ${frozenAt} — the pty's own buffer came through) to ${fresh.maxN()} (gaps: ${JSON.stringify(fresh.gaps())} — one torn line at the cut at most)`);
  // THE HOLE (verify r2, MEASURED): between the last record the OLD server consumed and the first the new client
  // receives lie the records the dead client swallowed (its pty + socket buffers) and the master's one held chunk —
  // never live, never in the catch-up's count; the CLI's own transcript / the wrapper's .buf hold them (the slab).
  const oldMax = Number((() => { try { return fs.readFileSync(path.join(ROOT, 'old.max'), 'utf8'); } catch { return '0'; } })());
  const hole = fresh.minN() - oldMax - 1;
  ok(oldMax > 0 && hole >= 0 && hole * 430 < 400e3,
    `THE HOLE a dead client swallows is bounded by its buffers: ${hole} record(s) (~${Math.round(hole * 430 / 1024)} KB) between the old server's last record ${oldMax} and the new client's first ${fresh.minN()} — in the transcript and the .buf, never live, never counted by the card`);
  fresh.kill();
  // CONTROL of the order: end the orphan FIRST, attach after — dtach discards every read while no client is attached.
  await sleep(300);
  const OLD2 = OLD.replace('.js', '2.js');
  fs.writeFileSync(OLD2, fs.readFileSync(OLD, 'utf8').replace(path.join(ROOT, 'old.json'), path.join(ROOT, 'old2.json')));
  spawnSync(process.execPath, [OLD2], { stdio: 'ignore', timeout: 10000 });
  const old2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'old2.json'), 'utf8'));
  await sleep(2500);
  const frozen2 = progressOf(prog).n;
  process.kill(old2.client, 'SIGKILL');
  await sleep(400);                               // the gap a kill-then-attach order leaves (a spawn takes about this long under load)
  const late = attach(sock);
  await until(() => late.maxN() > 0, 4000);
  ok(late.minN() - frozen2 > 12, `CONTROL (the other order): end the orphan first, attach 400 ms later — ${late.minN() - frozen2 - 1} record(s) the unblocked writer poured out meanwhile are DISCARDED by the master (no client attached)`);
  late.kill();
  // ⑥ THE DETECTOR'S RE-SEND (verify r1): a client that CONNECTED (it spoke its preamble) but was never attached
  // forwards the input into the master's socket queue, and the master reads that queue — attach, then the pushes —
  // AFTER the client dies: the input lands ONCE. The broken-stdin detector used to re-send it through the new
  // attach: TWICE (the 15:05 shape, reproduced). It re-sends only through a bridge that never spoke now.
  await sleep(300);
  const OLD3 = OLD.replace('.js', '3.js');
  fs.writeFileSync(OLD3, fs.readFileSync(OLD, 'utf8').replace(path.join(ROOT, 'old.json'), path.join(ROOT, 'old3.json')));
  spawnSync(process.execPath, [OLD3], { stdio: 'ignore', timeout: 10000 });
  const old3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'old3.json'), 'utf8'));
  await sleep(2500);
  const typed = (mark) => { try { return (fs.readFileSync(INLOG, 'utf8').match(new RegExp(mark, 'g')) || []).length; } catch { return 0; } };
  const c1 = attach(sock); await sleep(1000);
  ok(c1.bytes() <= 6 && alive(old3.client), `⑥ setup: a fresh attach is connected but not attached (${c1.bytes()} bytes) while the orphan ${old3.client} holds the master — the stuck-master shape`);
  c1.p.write('VSTYPED-once\r'); await sleep(2000);           // the detector's 5 s: no ack, no byte…
  c1.p.write('VSTYPED-two\r'); c1.p.write('{"type":"_frame_file","path":"/x/VSPTR.json"}\r'); await sleep(3000);   // verify r2: a second message and an image paste's pointer line typed INSIDE the window
  ok(typed('VSTYPED-once') === 0 && typed('VSTYPED-two') === 0 && typed('VSPTR') === 0, '⑥ setup: 5 s later none of the three inputs has reached the program (the master never read the unattached client)');
  c1.kill(); const c2 = attach(sock);                        // the heal's order: kill the old client, spawn the new one
  await until(() => c2.maxN() > 0, 4000); await sleep(1500);
  ok(typed('VSTYPED-once') === 1, `⑥ the queued input landed ONCE through the dead client's socket queue (${typed('VSTYPED-once')}×) — nothing to re-send`);
  const inOrder = (() => { try { return fs.readFileSync(INLOG, 'utf8').replace(/\r/g, '\n'); } catch { return ''; } })();
  ok(typed('VSTYPED-two') === 1 && typed('VSPTR') === 1 && /VSTYPED-once\nVSTYPED-two\n\{"type":"_frame_file","path":"\/x\/VSPTR.json"\}\n/.test(inOrder),
    `⑥ …and so did the second message and the frame-file pointer line, in order, once each (two=${typed('VSTYPED-two')}× ptr=${typed('VSPTR')}×) — one image, not two`, JSON.stringify(inOrder.slice(0, 160)));
  c2.p.write('VSTYPED-once\r'); await sleep(1500);
  ok(typed('VSTYPED-once') === 2, `⑥ CONTROL: re-sending it through the new attach — what the detector did before verify r1 — delivers it TWICE (${typed('VSTYPED-once')}×)`);
  c2.kill();
  try { process.kill(old3.client, 'SIGKILL'); } catch { } try { process.kill(old3.holder, 'SIGKILL'); } catch { }
  try { process.kill(old.holder, 'SIGKILL'); } catch { } try { process.kill(old2.holder, 'SIGKILL'); } catch { }
  for (const p of attachClientsOf(sock)) { try { process.kill(p, 'SIGKILL'); } catch { } }
  // ⑦ THE OTHER SHAPE the re-send rule must get right (verify r2): a HEALTHY master whose wrapper is blocked in a
  // synchronous op for 8 s (a huge .buf persist on a slow disk) — it reads no stdin and prints nothing, so the
  // detector fires (no ack, no byte) on a bridge that HAD spoken. The input already sits in the program's pty queue
  // through the attached client: the detector's sequence (kill the client, attach anew, re-send nothing) lands it
  // ONCE; the old unconditional re-send landed it TWICE here too.
  for (const resend of [false, true]) {
    const tag = resend ? 'B-ctl' : 'B';
    const sockB = path.join(ROOT, 'cw-raw-' + tag), progB = path.join(ROOT, tag + '.prog'), inB = path.join(ROOT, tag + '.in'), flag = path.join(ROOT, tag + '.block');
    execFileSync(DTACH, ['-n', sockB, '-E', '-r', 'none', process.execPath, WRITER, progB, '5', inB, flag]);
    await until(() => fs.existsSync(sockB), 3000);
    const b1 = attach(sockB); await until(() => b1.maxN() > 5, 4000);
    fs.writeFileSync(flag, '1'); await sleep(400);               // the wrapper is blocked for 8 s from its next tick
    const f1 = progressOf(progB).n; await sleep(500); const f2 = progressOf(progB).n;
    const typedB = () => { try { return (fs.readFileSync(inB, 'utf8').match(/VSTYPED-B/g) || []).length; } catch { return 0; } };
    b1.p.write('VSTYPED-B\r'); await sleep(5000);               // the detector's 5 s
    const quietSetup = f1 === f2 && typedB() === 0 && b1.maxN() > 5;
    b1.kill(); const b2 = attach(sockB);
    if (resend) setTimeout(() => { try { b2.p.write('VSTYPED-B\r'); } catch { } }, 500);   // what the detector did before verify r1
    await sleep(6500);
    if (!resend) ok(quietSetup && typedB() === 1 && b2.maxN() > 0, `⑦ a HEALTHY master, the wrapper blocked (writer ${f1}→${f2}, nothing typed reached it in 5 s): the fix's sequence lands the input ONCE (${typedB()}×) and the new attach streams`);
    else ok(quietSetup && typedB() === 2, `⑦ CONTROL: the old re-send through the new attach lands it TWICE here too (${typedB()}×) — the rule is right in both shapes`);
    b2.kill(); for (const p of attachClientsOf(sockB)) { try { process.kill(p, 'SIGKILL'); } catch { } }
    try { execFileSync('pkill', ['-9', '-f', sockB]); } catch { }
  }
}

// ═══ §5 B-c20d — A NEVER-SPOKE BRIDGE HOLDS EVERY INPUT; THE TERMINAL HEAL REPAINTS (raw dtach + the REAL session-stdout + user-input) ═══
// Found by verify r2 (held): the detector re-sent only ITS OWN input through a bridge that never spoke, and a SECOND
// message typed inside the first one's 5 s was never re-sent — the first re-send's ack (or the new attach's bytes)
// ended the second detector. And a terminal's clients kept the hole a dead client swallowed until a reload: the
// healer never repainted the .buf tail (the onExit ladder's re-attach does). The never-spoke bridge = the device
// channel that never opened: a duck that relays nothing. CONTROLS: copies of the real modules with b924041f's rule.
console.log('\n§5 B-c20d — a never-spoke bridge holds every input for the heal (in order); the terminal heal repaints the .buf tail');
{
  const MUT = mutantCopies('dbridge', REPO);
  const SS_SRC = fs.readFileSync(path.join(REPO, 'src/server/session-stdout.js'), 'utf8');
  const UI_SRC = fs.readFileSync(path.join(REPO, 'src/server/user-input.js'), 'utf8');
  const preSS = SS_SRC.replace("function reattachLocalPty(id, session, why, { kind = 'reattach' } = {}) {", "function reattachLocalPty(id, session, why, { kind = 'reattach', resend = null } = {}) {")
    .replace('const replay = takeHeldInputs(session);', 'const replay = resend != null ? [resend] : [];');
  const preUI = UI_SRC.replace(/(Broken pty stdin detected \(\$\{neverSpoke[^\n]*?\}\))`\);/, '$1`, { resend: neverSpoke ? payloadLine : null });');
  const noPaint = SS_SRC.replace(/^\s*repaintFromBuf\(id, session\);[^\n]*\n/m, '');
  ok(/resend != null \? \[resend\]/.test(preSS) && /\{ resend: neverSpoke \? payloadLine : null \}/.test(preUI) && noPaint !== SS_SRC, 'control setup: the pre-fix copies re-send the detector\'s OWN input only (b924041f\'s rule), the no-repaint copy lost exactly the healer\'s repaint line');
  const BUFS = path.join(ROOT, 'c20d-bufs'); fs.mkdirSync(BUFS, { recursive: true });
  const makeEng = (mod) => {
    const activeSessions = new Map(), frames = [];
    const eng = mod.create({ rootDir: REPO, BUFFERS_DIR: BUFS, META_DIR: path.join(ROOT, 'c20d-meta'), DTACH_CMD: DTACH, USAGE_SCANNER_PATH: '',
      CLAUDE_STREAM_TYPES: new Set(), _seenStreamTypes: new Set(), activeSessions, engine: {}, checkClaudeGoalStatus() { },
      broadcastToSession: (s, id, m) => frames.push(m), broadcastActiveSessions() { }, noteModelSeen() { }, noteHarnessModels() { }, recordUsageAttribution() { },
      daemonPtyShim: (h) => h, agentEnv: () => process.env, sbSeenFirst() { }, getDeviceMgr: () => null, getHosts: () => null, getUsageHistory: () => null,
      getTelemetry: () => null, getNoConvoRef: () => null, getDeliver: () => null, getPages: () => null, getPermissionRules: () => null });
    return { eng, activeSessions, frames };
  };
  const deadDuck = () => { const d = { _daemon: true, pid: -1, wrote: [], onData: () => ({ dispose() { } }), onExit: () => ({ dispose() { } }), write: (x) => d.wrote.push(x), resize() { }, kill() { } }; return d; };
  const adapterRegistry = { get: () => ({ formatChatInput: (t) => ({ stdinPayload: JSON.stringify({ type: 'user', text: t }), userMsg: null }) }) };
  const twoMessages = async (SSmod, UImod, tag) => {
    const sock = path.join(ROOT, 'cw-c20d-' + tag), inlog = path.join(ROOT, 'c20d-' + tag + '.in');
    execFileSync(DTACH, ['-n', sock, '-E', '-r', 'none', process.execPath, WRITER, path.join(ROOT, 'c20d-' + tag + '.prog'), '50', inlog]);
    await until(() => fs.existsSync(sock), 3000);
    const { eng, activeSessions } = makeEng(SSmod);
    const id = 'sess-c20d-' + tag;
    const session = { mode: 'chat', backend: 'vs-c20d', clients: new Map(), buffer: '', socketPath: sock, cwd: ROOT };
    activeSessions.set(id, session);
    const dead = deadDuck();
    eng.setupSessionPty(session, id, dead);
    const send = UImod.createUserInputSender({ activeSessions, adapterRegistry, BUFFERS_DIR: BUFS, broadcastToSession() { }, feedLive() { }, autoResume: null,
      reattachLocalPty: eng.reattachLocalPty, ptyQuietSince: eng.ptyQuietSince, writeSessionInput: eng.writeSessionInput, log() { } }).send;
    const r1 = send(id, 'VSC20D-one'); await sleep(2000);
    const r2 = send(id, 'VSC20D-two');                       // INSIDE the first message's 5 s
    await sleep(8500);                                        // detector 1 heals at 5 s (+0.5 s replay), detector 2 judges at 7 s
    const text = (() => { try { return fs.readFileSync(inlog, 'utf8'); } catch { return ''; } })();
    const n = (m) => (text.match(new RegExp(m, 'g')) || []).length;
    const out = { sent: !!(r1.ok && r2.ok), deadGot: dead.wrote.length, healed: session.pty !== dead, one: n('VSC20D-one'), two: n('VSC20D-two'), inOrder: text.indexOf('VSC20D-one') >= 0 && text.indexOf('VSC20D-one') < text.indexOf('VSC20D-two') };
    activeSessions.delete(id); try { session.pty?.kill?.(); } catch { }
    try { execFileSync('pkill', ['-9', '-f', sock]); } catch { }
    return out;
  };
  const fx = await twoMessages(require(path.join(REPO, 'src/server/session-stdout.js')), require(path.join(REPO, 'src/server/user-input.js')), 'fix');
  ok(fx.sent && fx.deadGot === 2 && fx.healed, `⑧ setup: both messages went into a bridge that never spoke (${fx.deadGot} writes swallowed) and the detector healed it`, JSON.stringify(fx));
  ok(fx.one === 1 && fx.two === 1 && fx.inOrder, `⑧ B-c20d: the heal replays EVERY input the never-spoke bridge was handed — the second message typed inside the first one's 5 s lands too, once each, in order (one=${fx.one}× two=${fx.two}×)`, JSON.stringify(fx));
  const ct = await twoMessages(MUT.load('src/server/session-stdout.js', preSS, 'pre'), MUT.load('src/server/user-input.js', preUI, 'pre'), 'ctl');
  ok(ct.sent && ct.healed && ct.one === 1 && ct.two === 0, `⑧ CONTROL (b924041f's rule): the detector re-sends only its own input — the second message is LOST (one=${ct.one}× two=${ct.two}×)`, JSON.stringify(ct));
  const repaint = async (SSmod, tag) => {
    const sock = path.join(ROOT, 'cw-c20dt-' + tag);
    execFileSync(DTACH, ['-n', sock, '-E', '-r', 'none', process.execPath, WRITER, path.join(ROOT, 'c20dt-' + tag + '.prog'), '600000']);
    await until(() => fs.existsSync(sock), 3000);
    const id = 'sess-c20dt-' + tag;
    fs.writeFileSync(path.join(BUFS, id + '.buf'), 'VSHOLE-before\r\nVSHOLE-swallowed-by-the-dead-client\r\n');   // the wrapper's tee holds what the dead client swallowed
    const { eng, activeSessions, frames } = makeEng(SSmod);
    const session = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: sock, cwd: ROOT };
    activeSessions.set(id, session);
    eng.setupSessionPty(session, id, deadDuck());
    const healed = eng.reattachLocalPty(id, session, 'test: the watch heals a terminal');
    await sleep(1000);
    const out = { healed, painted: frames.some((f) => f.type === 'output' && /^\x1b\[2J\x1b\[3J\x1b\[H/.test(f.data || '') && /VSHOLE-swallowed-by-the-dead-client/.test(f.data || '')), buffer: /VSHOLE-swallowed/.test(session.buffer) };
    activeSessions.delete(id); try { session.pty?.kill?.(); } catch { }
    try { execFileSync('pkill', ['-9', '-f', sock]); } catch { }
    return out;
  };
  const rp = await repaint(require(path.join(REPO, 'src/server/session-stdout.js')), 'fix');
  ok(rp.healed && rp.painted && rp.buffer, '⑨ B-c20d: a terminal heal repaints the .buf tail to its clients (clear + the hole the dead client swallowed) and re-seeds session.buffer — no reload needed', JSON.stringify(rp));
  const rc = await repaint(MUT.load('src/server/session-stdout.js', noPaint, 'nopaint'), 'ctl');
  ok(rc.healed && !rc.painted && !rc.buffer, '⑨ CONTROL: without the repaint the clients keep the hole until a reload (the pre-fix healer)', JSON.stringify(rc));
  // ⑩ verify r1: a never-spoke bridge that EXITS on its own (a device link that died before its preamble) — the onExit
  // ladder re-attaches at 1 s, and the inputs it was holding ride that re-attach. CONTROL: a copy without the carry (the
  // lane's first cut) re-attaches and the held message is gone.
  const noCarry = SS_SRC.replace(/^\s*const carry = takeHeldInputs\(session\);[^\n]*\n/m, '').replace(/^\s*if \(carry\.length\) session\._bridgeHeldInputs = [^\n]*\n/m, '');
  const exitLadder = async (SSmod, tag) => {
    const sock = path.join(ROOT, 'cw-c20dx-' + tag), inlog = path.join(ROOT, 'c20dx-' + tag + '.in');
    execFileSync(DTACH, ['-n', sock, '-E', '-r', 'none', process.execPath, WRITER, path.join(ROOT, 'c20dx-' + tag + '.prog'), '300', inlog]);
    await until(() => fs.existsSync(sock), 3000);
    const { eng, activeSessions } = makeEng(SSmod);
    const id = 'sess-c20dx-' + tag;
    const session = { mode: 'chat', backend: 'vs-c20d', clients: new Map(), buffer: '', socketPath: sock, cwd: ROOT };
    activeSessions.set(id, session);
    const exits = new Set();
    const dead = { ...deadDuck(), onExit: (cb) => { exits.add(cb); return { dispose() { exits.delete(cb); } }; } };
    eng.setupSessionPty(session, id, dead);
    const send = require(path.join(REPO, 'src/server/user-input.js')).createUserInputSender({ activeSessions, adapterRegistry, BUFFERS_DIR: BUFS, broadcastToSession() { }, feedLive() { }, autoResume: null,
      reattachLocalPty: eng.reattachLocalPty, ptyQuietSince: eng.ptyQuietSince, writeSessionInput: eng.writeSessionInput, log() { } }).send;
    const r = send(id, 'VSC20DX-one'); await sleep(1500);
    for (const cb of [...exits]) cb({ exitCode: 0 });   // the bridge exits having forwarded nothing
    await sleep(8000);
    const text = (() => { try { return fs.readFileSync(inlog, 'utf8'); } catch { return ''; } })();
    const out = { sent: r.ok, reattached: !!session.pty && session.pty !== dead, one: (text.match(/VSC20DX-one/g) || []).length };
    activeSessions.delete(id); try { session.pty?.kill?.(); } catch { }
    try { execFileSync('pkill', ['-9', '-f', sock]); } catch { }
    return out;
  };
  const xf = await exitLadder(require(path.join(REPO, 'src/server/session-stdout.js')), 'fix');
  ok(xf.sent && xf.reattached && xf.one === 1, `⑩ verify r1: a never-spoke bridge that EXITS hands its held input to the onExit ladder's re-attach — it lands once (one=${xf.one}×)`, JSON.stringify(xf));
  const xc = await exitLadder(MUT.load('src/server/session-stdout.js', noCarry, 'nocarry'), 'ctl');
  ok(SS_SRC.length - noCarry.length > 200 && xc.sent && xc.reattached && xc.one === 0, `⑩ CONTROL (no carry — the lane's first cut): the ladder re-attaches and the held message is LOST (one=${xc.one}×)`, JSON.stringify(xc));
  // ⑪ verify r1: a heal racing the bridge's first byte — a real attach connects and forwards the input during a 6 s
  // event-loop stall, and the loop's next turn runs the TIMERS phase before the poll phase that reads its preamble.
  // The detector's confirm stage judges after that poll phase. CONTROL: a copy that judges at once replays the input
  // the bridge already forwarded — the CLI gets it twice (a second billed turn; b924041f's detector did the same).
  const noConfirm = UI_SRC.replace('setTimeout(() => { if (silent()) setTimeout(() => {', 'setTimeout(() => { if (silent()) (() => {').replace('}, STDIN_CONFIRM_MS); }, 5000);', '})(); }, 5000);');
  const stall = async (UImod, tag) => {
    const sock = path.join(ROOT, 'cw-c20ds-' + tag), inlog = path.join(ROOT, 'c20ds-' + tag + '.in');
    execFileSync(DTACH, ['-n', sock, '-E', '-r', 'none', process.execPath, WRITER, path.join(ROOT, 'c20ds-' + tag + '.prog'), '600000', inlog]);   // an idle CLI: prints nothing
    await until(() => fs.existsSync(sock), 3000);
    const { eng, activeSessions } = makeEng(require(path.join(REPO, 'src/server/session-stdout.js')));
    const id = 'sess-c20ds-' + tag;
    const session = { mode: 'chat', backend: 'vs-c20d', clients: new Map(), buffer: '', socketPath: sock, cwd: ROOT };
    activeSessions.set(id, session);
    const send = UImod.createUserInputSender({ activeSessions, adapterRegistry, BUFFERS_DIR: BUFS, broadcastToSession() { }, feedLive() { }, autoResume: null,
      reattachLocalPty: eng.reattachLocalPty, ptyQuietSince: eng.ptyQuietSince, writeSessionInput: eng.writeSessionInput, log() { } }).send;
    let r = null, first = null;
    await new Promise((res) => setImmediate(() => { eng.attachToDtach(id, sock, session); first = session.pty; r = send(id, 'VSC20DS-one'); const t0 = Date.now(); while (Date.now() - t0 < 6000) { } res(); }));
    await sleep(7000);
    const text = (() => { try { return fs.readFileSync(inlog, 'utf8'); } catch { return ''; } })();
    const out = { sent: !!(r && r.ok), healed: session.pty !== first, one: (text.match(/VSC20DS-one/g) || []).length };
    activeSessions.delete(id); try { session.pty?.kill?.(); } catch { }
    try { execFileSync('pkill', ['-9', '-f', sock]); } catch { }
    return out;
  };
  const sf = await stall(require(path.join(REPO, 'src/server/user-input.js')), 'fix');
  ok(sf.sent && !sf.healed && sf.one === 1, `⑪ verify r1: after a 6 s stall the detector judges once the bridge's preamble is read — no heal, the input reaches the CLI once (one=${sf.one}×)`, JSON.stringify(sf));
  const sc = await stall(MUT.load('src/server/user-input.js', noConfirm, 'noconfirm'), 'ctl');
  ok(noConfirm !== UI_SRC && /\}\)\(\); \}, 5000\);/.test(noConfirm) && sc.sent && sc.healed && sc.one === 2, `⑪ CONTROL (judged in the timers phase, no confirm): the heal replays an input the bridge already forwarded — the CLI got it TWICE (one=${sc.one}×)`, JSON.stringify(sc));
}

// ═══ the worktree server + the stub CLI (§2–§4) ═══════════════════════════════
const VNC_ENV = await vncEnv();   // per-run singleton-Desktop display + port (test-architecture §57)
const wt = path.join(ROOT, 'wt');
worktrees.add(wt);
execFileSync('git', ['-C', REPO, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) {   // overlay the WORKING tree (a pre-commit run tests what will be committed)
  execFileSync('rm', ['-rf', path.join(wt, f)]);
  execFileSync('cp', ['-r', path.join(REPO, f), path.join(wt, f)]);
}
fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const FIXED_SERVER = fs.readFileSync(path.join(wt, 'server.js'), 'utf8');
// THE PRE-FIX CONTROL: the same tree without the boot sweep + the watch (the one line that starts both)
const SWEEP_LINE_RE = /^.*bridgeWatch\.bootSweep\(\); bridgeWatch\.start\(\);.*$/m;
const CONTROL_SERVER = FIXED_SERVER.replace(SWEEP_LINE_RE, '  /* control: no boot sweep, no dead-bridge watch */');
ok(CONTROL_SERVER !== FIXED_SERVER && !/bridgeWatch\.bootSweep/.test(CONTROL_SERVER), 'control setup: the patched copy lost exactly the boot-sweep + watch line');

const BIN = path.join(ROOT, 'bin');
const PROJ = path.join(ROOT, 'proj');
fs.mkdirSync(BIN, { recursive: true }); fs.mkdirSync(PROJ, { recursive: true });
const STUB_PROG = path.join(ROOT, 'stub.prog');
const STUB_EXIT = path.join(ROOT, 'stub.exit');
const STUB_SID = crypto.randomUUID();   // a random conversation id — no transcript is ever written under it
// THE STUB CLI: stamps every assistant record at EMISSION (as claude 2.1.281 does), a rate_limit_event every 50, an
// OTel api_request a second (the witness), and — once — asks the server to start a long-lived Background Work job,
// the production shape of the process that inherited the attach's pty master. Its stdout is a pipe made NON-blocking,
// like the real CLI: while the bridge is dead its records queue in memory and it keeps working.
fs.writeFileSync(path.join(BIN, 'claude'), `#!${process.execPath}
const fs = require('fs'), http = require('http');
const args = process.argv.slice(2);
if (!args.includes('--output-format')) { if (args.includes('--version')) console.log('2.1.281 (Claude Code)'); process.exit(0); }
try { process.stdout._handle.setBlocking(false); } catch {}
const sid = ${JSON.stringify(STUB_SID)};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'hook_started', session_id: sid, hook_name: 'SessionStart' });
out({ type: 'system', subtype: 'init', session_id: sid, cwd: process.cwd(), model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
let n = 0; const pad = 'x'.repeat(700);
setInterval(() => {
  n++;
  out({ type: 'assistant', timestamp: new Date().toISOString(), session_id: sid, uuid: require('crypto').randomUUID(), message: { id: 'msg_vsrec_' + n, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'VSREC ' + n + ' ' + pad }], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } });
  if (n % 50 === 0) out({ type: 'rate_limit_event', session_id: sid, uuid: require('crypto').randomUUID(), rate_limit_info: { status: 'allowed_warning', rateLimitType: 'five_hour', resetsAt: Math.floor(Date.now() / 1000) + 3600, utilization: 0.5 } });
  // the counter is RENAMED into place: a rewrite in place (O_TRUNC, then the write) left a reader an empty file — mirror-216 read it as 0
  fs.writeFileSync(${JSON.stringify(STUB_PROG + '.tmp')}, n + ' ' + Date.now() + ' ' + process.pid); fs.renameSync(${JSON.stringify(STUB_PROG + '.tmp')}, ${JSON.stringify(STUB_PROG)});
}, 20);
process.on('exit', (code) => { try { fs.writeFileSync(${JSON.stringify(STUB_EXIT)}, String(code)); } catch {} });
const EP = process.env.OTEL_EXPORTER_OTLP_ENDPOINT, HDR = process.env.OTEL_EXPORTER_OTLP_HEADERS || '';
fs.writeFileSync(${JSON.stringify(path.join(ROOT, 'stub.env'))}, JSON.stringify({ otel: !!EP, api: process.env.VIBESPACE_API || null, token: !!process.env.VIBESPACE_SESSION_TOKEN }));
let req = 0;
if (EP) setInterval(() => {
  req++;
  const at = { event: 'api_request', ts: new Date().toISOString() };
  const body = JSON.stringify({ resourceLogs: [{ resource: { attributes: [{ key: 'service.version', value: { stringValue: '2.1.281' } }] }, scopeLogs: [{ logRecords: [{ timeUnixNano: String(Date.now() * 1e6), body: { stringValue: 'claude_code.api_request' }, attributes: [
    { key: 'event.name', value: { stringValue: 'api_request' } }, { key: 'session.id', value: { stringValue: sid } },
    { key: 'event.timestamp', value: { stringValue: at.ts } }, { key: 'request_id', value: { stringValue: 'req_vsstub_' + req } } ] }] }] }] });
  const i = HDR.indexOf('='); const u = new URL(EP + '/v1/logs');
  const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', [HDR.slice(0, i)]: HDR.slice(i + 1) } }, (res) => res.resume());
  r.on('error', () => {}); r.end(body);
}, 1000);
`, { mode: 0o755 });

const PORT = await freePort();
const SETTINGS = path.join(wt, 'data', 'settings.json');
const setMinutes = (m) => fs.writeFileSync(SETTINGS, JSON.stringify({ 'session.deadBridgeMinutes': m }));
const bootEnv = {
  ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: HOMEDIR, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '',
  CLAUDE_CMD: path.join(BIN, 'claude'), PATH: [BIN, path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin'].join(':'),
};
for (const k of Object.keys(bootEnv)) if (/^(VIBESPACE_API|VIBESPACE_SESSION_TOKEN|VIBESPACE_JOB_TOKEN|CLAUDE_WEBUI_|AGENT_BROWSER_)/.test(k)) delete bootEnv[k];
let journal = '';
function boot(src = FIXED_SERVER) {
  fs.writeFileSync(path.join(wt, 'server.js'), src);
  const c = spawn(process.execPath, ['server.js'], { cwd: wt, env: bootEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  servers.add(c);
  c.jr = '';
  c.stdout.on('data', (d) => { c.jr += d; journal += d; });
  c.stderr.on('data', (d) => { c.jr += d; journal += d; });
  c.on('exit', () => servers.delete(c));
  return c;
}
const ready = (c) => until(() => c.jr.includes('Ready.'), 60000, 100);
async function stop(c, sig) { if (!c || c.exitCode !== null) return; const gone = new Promise((r) => c.once('exit', r)); try { c.kill(sig); } catch { } await Promise.race([gone, sleep(10000)]); }
const { WebSocket } = await import('ws');
async function connect() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const st = { ws, frames: [], maxRec: 0, recs: new Set(), cards: [], lagged: 0 };
  ws.on('message', (d) => {
    const txt = String(d);
    let m = null; try { m = JSON.parse(txt); } catch { return; }
    if (st.frames.length < 400) st.frames.push({ type: m.type, sessionId: m.sessionId });
    if (m.type === 'lagged') st.lagged++;
    for (const x of txt.matchAll(/VSREC (\d+)/g)) { const v = Number(x[1]); st.recs.add(v); if (v > st.maxRec) st.maxRec = v; }
    if (/records? caught up/.test(txt)) st.cards.push(txt);
  });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  return st;
}
// the stub's counter as EVIDENCE: "ok" with its record, or WHY there is none — a missing or unreadable counter is not "0 records"
// (mirror-216: one read caught the stub's in-place rewrite empty, Number('') = 0, and §3's control printed "the CLI wrote 1648 → 0")
let stubLast = null;
const stubRead = () => {
  let txt;
  try { txt = fs.readFileSync(STUB_PROG, 'utf8'); } catch (e) { return { state: e.code === 'ENOENT' ? 'missing' : e.code || String(e) }; }
  const m = /^(\d+) (\d+) (\d+)$/.exec(txt);
  if (!m) return { state: txt ? `unparsable (${JSON.stringify(txt.slice(0, 40))})` : 'empty' };
  return (stubLast = { state: 'ok', n: Number(m[1]), t: Number(m[2]), pid: Number(m[3]) });
};
const stubN = () => { const r = stubRead(); return r.state === 'ok' ? r.n : NaN; };
// the sentence a stopped stub fails with: its counter, its pid, its exit
const stubState = () => {
  const r = stubRead(), pid = stubLast && stubLast.pid;
  const exit = fs.existsSync(STUB_EXIT) ? fs.readFileSync(STUB_EXIT, 'utf8') : null;
  // kill(pid, 0) answers for a zombie too (mirror-216's kill-the-stub control: the wrapper, blocked on the stalled master, never reaps it)
  const st = (() => { try { const t = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return t[t.lastIndexOf(')') + 2]; } catch { return null; } })();
  return `its counter ${r.state === 'ok' ? `sits at ${r.n}, written ${((Date.now() - r.t) / 1000).toFixed(1)} s ago` : `file is ${r.state}`}; `
    + (pid ? `its pid ${pid} is ${st === null ? 'GONE' : st === 'Z' ? 'a ZOMBIE (dead, unreaped — the wrapper above it is stuck on the master)' : `ALIVE (state ${st})`}` : 'its pid was never read')
    + (exit !== null ? `; it exited with code ${exit}` : pid && (st === null || st === 'Z') ? '; no exit record (ended by a signal)' : '');
};
const sockDir = path.join(wt, 'data', 'sockets');

// ═══ §2 SIGKILL mid-stream → the boot sweep ═══════════════════════════════════
console.log('\n§2 a real server, a stub CLI streaming stamped records, SIGKILL mid-stream, restart → the boot sweep');
let SID = null, SOCK = null;
e2e: {
  setMinutes(3);
  let A = boot(); if (!ok(await ready(A), 'boot A: the post-fix worktree server is Ready', A.jr.slice(-1500))) break e2e;
  const c1 = await connect();
  c1.ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: PROJ, cols: 120, rows: 30, reqId: 'r1' }));
  const created = await until(() => c1.frames.find((f) => f.type === 'created'), 20000);
  SID = created ? c1.frames.find((f) => f.type === 'created').sessionId : null;
  if (!ok(!!SID, `setup: a chat session was created (${SID})`, JSON.stringify(c1.frames.slice(0, 20)))) break e2e;
  c1.ws.send(JSON.stringify({ type: 'attach', sessionId: SID, cols: 120, rows: 30 }));
  ok(await until(() => c1.maxRec >= 40, 20000), `setup: the server streams the stub's records live (${c1.maxRec} seen)`);
  SOCK = path.join(sockDir, fs.readdirSync(sockDir).find((f) => f.startsWith('cw-')));
  const env = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'stub.env'), 'utf8')); } catch { return {}; } })();
  ok(env.otel && env.api && env.token, `setup: the CLI was spawned with the OTel exporter + the agent API (its witness and its job door) — ${JSON.stringify(env)}`);
  // the long-lived process the server spawns AFTER the attach — a Background Work job, as in production
  const metaFile = fs.readdirSync(path.join(wt, 'data', 'session-meta')).find((f) => f.startsWith(path.basename(SOCK)));
  const token = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'session-meta', metaFile), 'utf8')).agentToken;
  const startHolder = async (name) => {
    let out = {};
    for (let i = 0; i < 40; i++) {   // "jobs engine starting — retry shortly" right after a boot
      const r = await fetch(`http://127.0.0.1:${PORT}/api/agent/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ kind: 'task', name, note: '', context: null, schedule: null, access: { view: 'group', control: 'session' }, stopWithOwner: false, cmd: { argv: ['sleep', '900'], cwd: PROJ }, untilOutput: null, timeoutMs: null, stdinOpen: false, notifyUser: false, notifyOk: false, restart: 'never', ports: [], publish: false }) });
      out = await r.json().catch(() => ({}));
      if (!(out && /starting/.test(String(out.error || '')))) break;
      await sleep(500);
    }
    return out;
  };
  const j1 = await startHolder('holder-a');
  ok(j1 && j1.job && j1.job.id, `setup: the server started a long-lived job after the attach (${j1 && j1.job && j1.job.id})`, JSON.stringify(j1).slice(0, 300));
  await sleep(1500);
  const clientA = attachClientsOf(SOCK).find((p) => ppidOf(p) === A.pid);
  const ptsA = clientA ? ptsIndexOfStdout(clientA) : null;
  const holders = fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n)).map(Number).filter((p) => p !== A.pid && ptsA != null && ptmxIndexes(p).includes(ptsA));
  ok(holders.length > 0, `THE LEAK in the product: the server's attach pty master (tty ${ptsA}) is held by ${holders.length} other process(es) it spawned later (${holders.slice(0, 4).map((p) => `${p} ${commOf(p)}`).join(', ')})`);
  const before = c1.maxRec;
  c1.ws.close();
  await stop(A, 'SIGKILL');
  await sleep(9000);   // the orphan's buffers fill at ~35 KB/s; the master stalls on it
  ok(clientA && alive(clientA) && ppidOf(clientA) !== A.pid, `after SIGKILL the old attach client ${clientA} is an ORPHAN (alive, reparented to ${ppidOf(clientA)} ${commOf(ppidOf(clientA))})`);
  const s1 = stubN(); await sleep(1500); const s2 = stubN();
  ok(s2 > s1, `…and the CLI keeps WORKING meanwhile (the stub's record ${s1} → ${s2}) — its non-blocking stdout queues in memory`);
  const bufM1 = fs.statSync(path.join(wt, 'data', 'session-buffers', SID + '.buf')).mtimeMs;
  await sleep(2500);
  const bufM2 = fs.statSync(path.join(wt, 'data', 'session-buffers', SID + '.buf')).mtimeMs;
  ok(bufM1 === bufM2, 'MEASURED: the wrapper\'s buffer FILE is frozen while the master stalls (its synchronous TTY write blocks its whole event loop — the .buf witness is blind to THIS shape; the OTel witness is not)');

  const B = boot();
  ok(await ready(B), 'boot B (post-fix) is Ready');
  const swept = await until(() => /\[bridge\] boot: ended \d+ orphaned dtach attach client/.test(B.jr), 8000);
  ok(swept && !alive(clientA), `the BOOT SWEEP ended the orphan ${clientA} (journal: ${JSON.stringify((B.jr.match(/\[bridge\] boot:[^\n]*/) || [''])[0].slice(0, 160))})`);
  const c2 = await connect();
  c2.ws.send(JSON.stringify({ type: 'attach', sessionId: SID, cols: 120, rows: 30 }));
  const flows = await until(() => c2.maxRec > Math.max(before, s2) + 20, 15000);
  ok(flows, `THE FIX: the restored session streams with ZERO input (record ${c2.maxRec}, past ${Math.max(before, s2)} at the kill)`);
  c2.ws.close();

  // ═══ §3 the CONTROL: the same restart on the pre-fix copy stays dark ═══
  console.log('\n§3 CONTROL — the same restart without the sweep and the watch stays DARK');
  const j2 = await startHolder('holder-b');   // B's own attach master must outlive B too (a job B spawned after its attach)
  ok(j2 && j2.job, 'control setup: server B started its own long-lived job after its attach');
  await sleep(1200);
  const clientB = attachClientsOf(SOCK).find((p) => ppidOf(p) === B.pid);
  await stop(B, 'SIGKILL');
  await sleep(9000);
  ok(clientB && alive(clientB), `control setup: B's attach client ${clientB} is an orphan too`);
  const C = boot(CONTROL_SERVER);
  ok(await ready(C), 'boot C (the pre-fix copy) is Ready');
  const c3 = await connect();
  c3.ws.send(JSON.stringify({ type: 'attach', sessionId: SID, cols: 120, rows: 30 }));
  await sleep(4000);                               // the attach slab (history from the wrapper's buffer file) lands first
  // the precondition is EVIDENCE, not a sleep: the stub writes 500 more records (≤ 25 s), and the silence is judged over that span
  const n0 = stubN(), live0 = c3.maxRec, t0 = Date.now();
  const wrote = await until(() => stubN() > n0 + 500, 25000, 250);
  const n1 = stubN(), span = ((Date.now() - t0) / 1000).toFixed(1), dark = c3.maxRec;
  ok(wrote, wrote ? `control precondition: the stub CLI keeps writing while the bridge is dark (record ${n0} → ${n1} in ${span} s)`
    : `control precondition: the stub CLI STOPPED writing while the bridge is dark (record ${n0} → ${n1} in ${span} s) — ${stubState()}`);
  ok(dark <= live0, `THE CONTROL: over those ${span} s the pre-fix restore delivers NO new record (${dark} seen, ${live0} before)`);
  ok(attachClientsOf(SOCK).includes(clientB), `THE CONTROL: the orphan ${clientB} still holds the master`);
  c3.ws.close();
  await stop(C, 'SIGTERM');   // the clean shutdown ends C's own attach pty (no new orphan); B's orphan stays for §4's sweep
  ok(!/\[bridge\]/.test(C.jr), 'control: the pre-fix copy never swept or healed anything');
}

// ═══ §4 THE WATCH: a stuck client the sweep may not touch ═══════════════════════
console.log('\n§4 the watch — silence + the CLI\'s own witness ⇒ re-attach; the backlog is late; one card');
watch: {
  if (!SID || !SOCK) { skip('§4 needs §2\'s session'); break watch; }
  setMinutes(2.1);
  const D = boot();
  if (!ok(await ready(D), 'boot D (post-fix) is Ready')) break watch;
  await until(() => /\[bridge\] boot: ended/.test(D.jr), 6000);
  const c4 = await connect();
  c4.ws.send(JSON.stringify({ type: 'attach', sessionId: SID, cols: 120, rows: 30 }));
  ok(await until(() => c4.maxRec > stubN() - 200 && c4.maxRec > 0, 20000), `D swept B's orphan and streams (record ${c4.maxRec})`);
  c4.ws.close();
  // A PERSON'S OWN ATTACH that stops reading (its parent — this process — is alive: the sweep must leave it alone)
  const paused = attach(SOCK, { paused: true });
  await sleep(1500);
  await stop(D, 'SIGTERM');   // the clean shutdown ends D's attach: the paused client is the only one left, and it fills
  await sleep(12000);
  const w1 = stubN();
  ok(alive(paused.pid) && w1 > 0, `setup: the paused client ${paused.pid} is attached and full; the CLI keeps writing (record ${w1})`);
  const E = boot();
  if (!ok(await ready(E), 'boot E (post-fix, session.deadBridgeMinutes = 2.1) is Ready')) break watch;
  const eReady = Date.now();
  const c5 = await connect();
  c5.ws.send(JSON.stringify({ type: 'attach', sessionId: SID, cols: 120, rows: 30 }));
  await sleep(20000);
  ok(!/\[bridge\] boot: ended/.test(E.jr) && alive(paused.pid), 'the boot sweep left the paused client alone (its parent lives — a person\'s attach is never ended)');
  const darkMax = c5.maxRec;
  ok(stubN() > w1 + 500 && darkMax < w1, `the restored bridge is DEAD: 20 s after Ready no new record reached the server (${darkMax} seen, the CLI is at ${stubN()})`);
  const healed = await until(() => /dead bridge: no output for/.test(E.jr), 2.1 * 60e3 + 60000, 500);
  const healLine = (E.jr.match(/\[[^\]]*\] dead bridge:[^\n]*/) || [''])[0];
  ok(healed && /API request/.test(healLine), `THE WATCH healed it ${Math.round((Date.now() - eReady) / 1000)} s after Ready, on the OTel witness: ${JSON.stringify(healLine.slice(0, 200))}`);
  const flowed = await until(() => c5.maxRec > w1 + 1000, 20000);
  ok(flowed, `…and the backlog flows (record ${c5.maxRec}; the CLI wrote ${w1} before the restart)`);
  const late = await until(() => /records arriving [^\n]* late — a stalled bridge's backlog/.test(E.jr), 15000);
  ok(late, `THE LATE GATE (lane-hot-switch): the backlog was judged late — ${JSON.stringify((E.jr.match(/\[stream\][^\n]*stalled bridge's backlog[^\n]*/) || [''])[0].slice(0, 200))}`);
  const settled = await until(() => /\[bridge\] [^\n]*: heal caught up \d+ record/.test(E.jr), 40000, 500);
  const cu = (E.jr.match(/\[bridge\] [^\n]*: heal caught up (\d+) record\(s\) \/ \d+ byte\(s\) — (\d+) of them stamped/) || []);
  ok(settled && Number(cu[1]) > 1000 && Number(cu[2]) > 100, `THE CATCH-UP was counted through the late rule: ${cu[1]} record(s), ${cu[2]} stamped > 2 min before they arrived`);
  const card = (E.jr.match(/\[bridge\] [^\n]*: card — ([^\n]*)/) || [])[1] || '';
  ok(/^The connection to this conversation's output was lost at \d\d:\d\d and restored at \d\d:\d\d — \d+ records caught up \(they are shown, not re-run\)\.$/.test(card), `THE CARD: ${JSON.stringify(card)}`);
  ok(c5.cards.length >= 1 || c5.lagged > 0, `…and it reached the chat (${c5.cards.length} card frame(s)${c5.lagged ? `; the client was told it lagged ${c5.lagged}×` : ''})`);
  const after = c5.maxRec; await sleep(4000);
  ok(c5.maxRec > after, `after the catch-up the bridge STAYS live with the paused client still attached (${after} → ${c5.maxRec})`);
  ok((E.jr.match(/dead bridge: no output for/g) || []).length === 1, 'exactly one heal — the budget and the settle kept it from repeating');
  paused.kill();
  c5.ws.close();
  await stop(E, 'SIGTERM');
}

done();
