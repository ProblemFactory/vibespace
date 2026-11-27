#!/usr/bin/env node
// SESSION LIVENESS AFTER RESTORE (2026-09-09 production incident).
//
// THE PROMISE: dtach sessions survive a server restart BY DESIGN, so a
// restored session must stream live output to an attached client WITHOUT the
// user typing anything. On 2026-09-08 22:20 PDT (v2.369.77) it did not: twelve
// sessions were restored while `deviceMgr.connect()` was still in flight
// (journal: `spawned local daemon` 22:20:56 / `daemon 2.369.75 ≠ 2.369.77 —
// upgrading` / `routing ENABLED` 22:21:02, against a restore that ran
// 22:20:22–22:20:53), one claude session sat on "3 Bash · running…" for ~8
// minutes while its wrapper kept appending to its buffer FILE, and the only
// thing that healed it was the ws broken-stdin detector at 22:29:05 — i.e. the
// user typing.
//
// THE DEFECT under test: `attachToDtach`'s daemon path FIRE-AND-FORGOT the
// open. `deviceMgr.openSession()` resolves as soon as the `open-session`
// control frame is WRITTEN; the daemon's answer lives on `handle.ready`
// (`session-open` / `session-error` / pre-ready link death), which nothing
// awaited, and `setupSessionPty` ran on the shim regardless — a bridge the
// daemon never opened is then a SILENTLY dead pty (no journal line, session
// still LIVE, and the shim's onExit never fires so the re-attach ladder never
// runs either). Boot ordering put every restore behind exactly that window.
//
// WHAT THIS SUITE DRIVES: the REAL src/server/session-stdout.js, a REAL
// vibespace-device daemon on a real unix socket, REAL dtach sockets, and a
// REAL worktree server. The daemon's `open-session` handler is FAULT-INJECTED
// in a THROWAWAY copy of the bundle (three shapes: refuses / never answers /
// answers but relays nothing) because the journal proves neither a
// `session-error` nor an `[agentd] connection lost` in the incident window, so
// which silent shape hit those sessions is NOT established — all three are the
// same dead bridge and all three are covered.
//
// NEGATIVE CONTROL: a PATCHED COPY of the real module carrying master's
// pre-fix attach (no connected-gate, no `ready` await, no probe), asserted to
// have taken every patch. Under the same faults it produces no bytes at all.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { vncEnv, anchored } from './scratch.mjs';
import { WebSocket } from 'ws';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { scratch, freePort, endDaemonsOf, endRootedProcesses } = await import(path.join(REPO, 'scripts/scratch.mjs'));

// Master's fire-and-forget leaves `handle.ready` REJECTIONS unattached. In the
// server they are swallowed by server.js's global `unhandledRejection` handler
// (one context-free line, no session id); here they would kill the suite, so
// we mirror that handler and MEASURE them instead. NOTE for the incident file:
// the production journal carries no `unhandledRejection:` line in the restore
// window either, which is evidence AGAINST the `session-error` shape and for
// one of the two silent ones.
const unhandled = [];
process.on('unhandledRejection', (e) => unhandled.push(String((e && e.message) || e)));

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? `\n      ${extra}` : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the hosted run of 2.369.419 (run 45584145109): a word the pty echoes can come split over two frames («echo VSH» + «EALED») —
// a leg judges the JOINED stream of its frames (from a heal: only the frames since it), never each frame alone
const streamHas = (frames, re, from = 0) => re.test(frames.slice(from).map((f) => String(f.data || '')).join(''));

// ── throwaway everything (2.369.76 law: per-process paths, free ports) ──
const ROOT = scratch('restore-liveness');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

// The pre-fix controls are patched copies written OUTSIDE the tree
// (scripts/mutant-copy.mjs: this process's scratch dir, `require` re-bound on
// line 1 to the real module's path, so ./agent-tool-generators.js and
// ../normalizers resolve exactly as a sibling's). They used to be gitignored
// siblings (src/server/session-stdout.__*_control.js) that every src/ scanner
// running beside this suite read as source; §tree measures the new placement
// while they exist. CONTROL_SRC keeps the control's raw text for the e2e boot,
// which installs it INTO a worktree (where it must resolve that tree's files).
const MUTR = mutantCopies('restore-liveness', REPO);
let CONTROL_MODULE = null, CONTROL_SRC = null;

const daemonRoots = new Set();      // every VIBESPACE_AGENTD_ROOT we spawned into
const servers = new Set();          // every worktree server child
const stray = new Set();            // dtach fixture sockets
// Every `git worktree add` we made. It is REGISTERED here rather than removed
// at the end of the block that created it, because a leg may bail out early
// (an unmeasurable fixture is a loud fail, not a reason to skip §5/§6) and a
// worktree whose FILES were deleted with ROOT still leaves a prunable entry in
// the shared .git — we clean up after ourselves on every exit path.
const worktrees = new Set();

// B-442c (2026-10-02, the 16:23 OOM that stopped the production service): the pid file ALONE missed a daemon. §4 kills
// each server right as it reports "upgrading", and a self-upgrade spawns the NEW daemon before that one writes its pid:
// the kill ended the old pid, installStale deleted the root, and the orphan — its bundle gone — grew to 45.7 GB when its
// fs worker pool's respawns crashed (src/agentd/worker-pool.js is bounded since). scratch.mjs endDaemonsOf ends every
// daemon whose own root env lies in the root, the re-exec child included, and leaves the dtach sessions alone.
function killDaemons() {
  for (const root of daemonRoots) { try { endDaemonsOf(root); } catch { } }
}
function cleanup() {
  killDaemons();
  for (const s of servers) { try { s.kill('SIGKILL'); } catch { } }
  for (const sock of stray) { try { execFileSync('pkill', ['-f', sock], { stdio: 'ignore' }); } catch { } }
  // …and everything ELSE still living under our scratch root. The §4 fixture's
  // dtach master is spawned by the SERVER (a ws `create`), so it is in no set
  // of ours, and `dtach -c` deliberately outlives the process that started it
  // — that is the very property under test. Deleting ROOT does not end it: it
  // would keep running against an unlinked socket path forever (MEASURED: 8
  // stranded `dtach -c` + pty-wrapper + zsh trees, some 3.5 h old, before this
  // line existed). ROOT is per-pid (scripts/scratch.mjs), so this pattern can
  // only ever match processes this run created; it runs BEFORE the rmSync so
  // the paths it matches on still exist. `pkill -f` reads argv only — the device
  // daemon rewrites its title — so scratch.mjs endRootedProcesses (cwd, HOME, the
  // daemon's root env, argv) is the end of everything rooted here (B-442c).
  try { execFileSync('pkill', ['-f', ROOT], { stdio: 'ignore' }); } catch { }
  try { endRootedProcesses(ROOT); } catch { }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', REPO, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
}
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

// ── the FAULT-INJECTED daemon bundle ───────────────────────────────────────
// The shipped bundle keeps the source text verbatim, so `msg.op ===
// "open-session"` is a single unambiguous anchor. VS_FAULT_OPEN picks the
// shape; unset = the real handler, untouched.
const REAL_BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const OPEN_ANCHOR = 'if (msg.op === "open-session") {';
const FAULT = `${OPEN_ANCHOR}
        const __vsFault = process.env.VS_FAULT_OPEN || "";
        if (__vsFault === "silent") return;                                  /* never answers: \`ready\` stays PENDING forever */
        if (__vsFault === "error") { mux.control({ op: "session-error", chan: msg.chan, error: "injected fault: open-session refused" }); return; }
        if (__vsFault === "deadchan") { mux.control({ op: "session-open", chan: msg.chan, pid: 999999 }); return; } /* opens, then relays nothing, ever */`;

function buildBundle(dst, { version = null, fault = true } = {}) {
  let src = fs.readFileSync(REAL_BUNDLE, 'utf-8');
  if (fault) {
    if (src.split(OPEN_ANCHOR).length - 1 !== 1) throw new Error('fault anchor is not unique in the daemon bundle');
    src = src.replace(OPEN_ANCHOR, FAULT);
  }
  if (version) {
    const m = /VERSION: "[\d.]+"/.exec(src);
    if (!m) throw new Error('no VERSION literal in the daemon bundle');
    src = src.replace(m[0], `VERSION: "${version}"`);
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, src);
  return dst;
}

const REAL_VERSION = require(path.join(REPO, 'package.json')).version;
const FAULT_BUNDLE = buildBundle(path.join(ROOT, 'bundles', 'faulty.js'), { fault: true });
ok(fs.readFileSync(FAULT_BUNDLE, 'utf-8').includes('injected fault: open-session refused'),
  'PATCH LANDED: the throwaway daemon bundle carries the open-session fault injector');

// ── the PRE-FIX control module (master's attach, patched into a real copy) ──
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/session-stdout.js'), 'utf-8');
  let out = src, hits = 0;
  // the gate's text at the tip: B-cd4b added `!restore &&` (a restore attach keeps the local road); master's gate had neither
  // that nor the link check — the control plants it whole (a restore attach through the daemon, fire-and-forget, as master did)
  const gateA = "if (!restore && deviceMgr && !session.host && deviceMgr.status?.().connected) {";
  if (out.includes(gateA)) { out = out.replace(gateA, 'if (deviceMgr && !session.host) {'); hits++; }
  const start = out.indexOf('    deviceMgr.openSession({');
  const tail = '\n    return;\n  }\n  localAttach();\n}';
  const end = out.indexOf(tail, start);
  if (start > 0 && end > start) {
    out = out.slice(0, start) + `    deviceMgr.openSession({ cmd: DTACH_CMD, args: ['-a', socketPath, '-E', '-r', 'winch'], cols: 120, rows: 30 })
      .then((h) => { setupSessionPty(session, id, daemonPtyShim(h)); repaintClients(); })
      .catch((e) => { console.warn('[device] session attach failed — local pty fallback:', e.message); localAttach(); });` + out.slice(end);
    hits++;
  }
  const armLocal = "    armProbe(attachPty, 'local');\n";
  if (out.includes(armLocal)) { out = out.replace(armLocal, ''); hits++; }
  ok(hits === 3, 'PATCH LANDED: the pre-fix control took all 3 replacements (gate, fire-and-forget open, no local probe)', `hits=${hits}`);
  ok(!out.includes('h.ready.then') && !out.includes("armProbe(shim, 'device')"),
    'PATCH LANDED: the control observes neither `ready` nor the attach probe');
  CONTROL_SRC = out;
  CONTROL_MODULE = MUTR.write('src/server/session-stdout.js', out, 'prefix');
}

// ── harness: a session-stdout engine over a given DeviceManager ────────────
const dial = require(path.join(REPO, 'src/server/dial-pairing.js')).create({
  rootDir: REPO, AGENTD_DIR: path.join(ROOT, 'agentd-dir'), agentdHostToken: () => 'vsht_test',
  getHosts: () => null, getMounts: () => null, getMachineMounts: () => null,
  getPortForwards: () => null, getExitProxy: () => null,
});

function makeEngine({ getDeviceMgr, modulePath }) {
  const activeSessions = new Map();
  const frames = [];
  const eng = require(modulePath).create({
    rootDir: REPO, BUFFERS_DIR: path.join(ROOT, 'buffers'), META_DIR: path.join(ROOT, 'meta'),
    DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: '', CLAUDE_STREAM_TYPES: new Set(), _seenStreamTypes: new Set(),
    activeSessions, engine: {}, checkClaudeGoalStatus: () => { },
    broadcastToSession: (s, id, m) => frames.push(m), broadcastActiveSessions: () => { },
    noteModelSeen: () => { }, noteHarnessModels: () => { }, recordUsageAttribution: () => { },
    daemonPtyShim: dial.daemonPtyShim, agentEnv: () => process.env, sbSeenFirst: () => { },
    getDeviceMgr, getHosts: () => null, getUsageHistory: () => null, getTelemetry: () => null,
    getNoConvoRef: () => null, getDeliver: () => null, getPages: () => null, getPermissionRules: () => null,
  });
  return { eng, activeSessions, frames };
}

// a REAL dtach session whose program prints a marker on a timer
let sockSeq = 0;
function mkDtachFixture(tag) {
  const dir = path.join(ROOT, 'dtach', tag + '-' + (++sockSeq));
  fs.mkdirSync(dir, { recursive: true });
  const prog = path.join(dir, 'emit.js');
  fs.writeFileSync(prog, `let n=0;setInterval(()=>process.stdout.write('TICK'+(++n)+'\\n'),250);setTimeout(()=>process.exit(0),120000);\n`);
  const sock = path.join(dir, 's.sock');
  execFileSync('dtach', ['-n', sock, '-E', '-z', process.execPath, prog]);
  stray.add(sock);
  return sock;
}
function mkQuietFixture(tag) {
  const dir = path.join(ROOT, 'dtach', tag + '-' + (++sockSeq));
  fs.mkdirSync(dir, { recursive: true });
  const prog = path.join(dir, 'quiet.js');
  fs.writeFileSync(prog, `process.stdin.resume();setTimeout(()=>process.exit(0),120000);\n`);
  const sock = path.join(dir, 's.sock');
  execFileSync('dtach', ['-n', sock, '-E', '-z', process.execPath, prog]);
  stray.add(sock);
  return sock;
}

const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
function newDaemon(tag, { fault = '', bundle = FAULT_BUNDLE } = {}) {
  const root = path.join(ROOT, 'daemons', tag);
  process.env.VIBESPACE_AGENTD_ROOT = root;
  process.env.VIBESPACE_NODE_MODULES = path.join(REPO, 'node_modules');
  if (fault) process.env.VS_FAULT_OPEN = fault; else delete process.env.VS_FAULT_OPEN;
  daemonRoots.add(root);
  return new DeviceManager({
    dataDir: path.join(root, 'data'), bundlePath: bundle, version: REAL_VERSION,
    nodeModules: path.join(REPO, 'node_modules'), log: () => { },
  });
}

// ── § 1 THE PROBE'S PREMISE (measured, both transports) ────────────────────
console.log('— §1 dtach -a emits its redraw preamble even when the program is SILENT —');
{
  const pty = require(path.join(REPO, 'node_modules/node-pty'));
  const sock = mkQuietFixture('quiet-local');
  const p = pty.spawn('dtach', ['-a', sock, '-E', '-r', 'winch'], { name: 'xterm-256color', cols: 120, rows: 30, env: process.env });
  let seen = '';
  p.onData((d) => { seen += d; });
  await sleep(800);
  ok(seen.length > 0, 'local: a healthy attach to a SILENT program produces bytes (the probe can tell alive from dead)', JSON.stringify(seen));
  ok(/\x1b\[H|\x1b\[[0-3]?J/.test(seen), 'local: those bytes are dtach\'s redraw preamble (what the terminal branch already strips)', JSON.stringify(seen));
  try { p.kill(); } catch { }

  const dm = newDaemon('premise');
  await dm.connect();
  const h = await dm.openSession({ cmd: 'dtach', args: ['-a', sock, '-E', '-r', 'winch'], cols: 120, rows: 30 });
  let devSeen = '';
  h.onData = (b) => { devSeen += b.toString('utf-8'); };
  await h.ready;
  await sleep(800);
  ok(devSeen.length > 0, 'through the DAEMON: the same preamble relays over the mux (the probe works on both transports)', JSON.stringify(devSeen));
  try { h.kill(); } catch { }
  dm.stop();
}

// ── § 2 THE MECHANISM MATRIX (real daemon, real dtach, real module) ────────
console.log('— §2 a device attach that never opens must FALL BACK / HEAL, not go silent —');
const BUDGET_MS = 8000;   // > ATTACH_PROBE_MS(4000) + confirm(600) and > DEVICE_OPEN_READY_MS(5000)

async function attachLeg({ label, fault, modulePath, expectBytes, expectDaemon = null }) {
  const dm = newDaemon('leg-' + label.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), { fault });
  await dm.connect();
  const { eng, activeSessions, frames } = makeEngine({ getDeviceMgr: () => dm, modulePath });
  const id = 'sess-' + label.replace(/[^a-z0-9]+/gi, '') + '-' + Date.now();
  const sock = mkDtachFixture(label);
  const session = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: sock, name: label, cwd: ROOT };
  activeSessions.set(id, session);
  const logs = [];
  const realWarn = console.warn, realLog = console.log;
  console.warn = (...a) => logs.push(a.join(' ')); console.log = (...a) => logs.push(a.join(' '));
  try {
    eng.attachToDtach(id, sock, session);
    const t0 = Date.now();
    while (Date.now() - t0 < BUDGET_MS) { if (streamHas(frames, /TICK/)) break; await sleep(150); }
  } finally { console.warn = realWarn; console.log = realLog; }
  const gotBytes = streamHas(frames, /TICK/);
  // READ THE VERDICT BEFORE TEARING DOWN. Killing the pty fires the product's
  // own detach ladder (session.pty = null, re-attach in 1s) against a
  // DeviceManager we are about to stop — so a verdict read after the teardown
  // is a verdict about the teardown.
  const onDaemon = session.pty?._daemon === true;
  const hasPty = !!session.pty;
  activeSessions.delete(id);
  try { session.pty?.kill?.(); } catch { }
  dm.stop();
  return { gotBytes, logs, onDaemon, hasPty, label };
}

for (const [fault, what] of [['', 'a healthy daemon'], ['error', 'open-session REFUSED'], ['silent', 'open-session NEVER ANSWERED'], ['deadchan', 'open-session answered but the channel relays NOTHING']]) {
  const fixed = await attachLeg({ label: 'fixed-' + (fault || 'healthy'), fault, modulePath: path.join(REPO, 'src/server/session-stdout.js'), expectBytes: true });
  ok(fixed.gotBytes, `FIX / ${what}: the session streams within ${BUDGET_MS} ms with ZERO input`,
    fixed.logs.join(' | '));
  if (fault === '') {
    ok(fixed.onDaemon, 'FIX / a healthy daemon: the attach really ran through the DEVICE (the daemon path is not disabled)',
      fixed.logs.join(' | '));
  } else {
    ok(fixed.hasPty && !fixed.onDaemon, `FIX / ${what}: it ended on a LOCAL pty (fallback or heal)`);
    ok(fixed.logs.some((l) => /local pty fallback|re-attaching dtach locally/.test(l)),
      `FIX / ${what}: it SAID so (never a silent degrade)`, fixed.logs.join(' | '));
  }
  if (fault) {
    const before = unhandled.length;
    const ctl = await attachLeg({ label: 'ctl-' + fault, fault, modulePath: CONTROL_MODULE, expectBytes: false });
    ok(!ctl.gotBytes, `PRE-FIX CONTROL / ${what}: NOTHING arrives — the incident's silent dead pty`, ctl.logs.join(' | '));
    ok(!ctl.logs.some((l) => /local pty fallback|re-attaching/.test(l)),
      `PRE-FIX CONTROL / ${what}: and it never even SAYS anything (no journal line to find it by)`, ctl.logs.join(' | '));
    if (fault === 'error') {
      ok(unhandled.length > before && /open-session refused/.test(unhandled.join(' | ')),
        'PRE-FIX CONTROL / open-session REFUSED: master leaves the `ready` rejection UNHANDLED (the server prints one context-free line, with no session id)',
        unhandled.join(' | '));
    }
  }
}

// ── § 2b BYTES THAT ARRIVE BEFORE THERE IS A LISTENER ──────────────────────
// The daemon's session channel exists from `conn.sessions.set(chan, …)`, which
// runs BEFORE the open-session frame is even written, so DATA on that channel
// is protocol-legal before `session-open`. `ready` is a PROMISE, so anything
// that keys off it settles a microtask later than the synchronous dispatch of
// whatever frames came in the same socket read — bytes in that gap reach a
// `handle.onData` that is still null and are dropped. For a chatty session
// that is invisible; for a SILENT one (an idle claude waiting on a prompt) the
// preamble is the probe's ONLY evidence, so the loss turns a healthy daemon
// into a heal on every attach — the fix's own guard firing on the fix.
// HONEST MEASUREMENT (scripts/dbg-open-coalesce.mjs, this box, a daemon
// patched to answer session-open and write a data frame in the same tick):
// 0/8 landed in the same read — the reader is scheduled between the two
// writes here — so this leg does NOT wait for a coalesced read it cannot make
// happen. It drives the SHAPE the contract allows, directly.
console.log('— §2b a byte that arrives before `ready` settles must not be dropped —');
{
  const earlyLeg = async (modulePath) => {
    const { eng, activeSessions, frames } = makeEngine({
      modulePath,
      getDeviceMgr: () => ({
        status: () => ({ connected: true }),
        // data BEFORE ready, in the same tick — exactly the window above
        openSession: async () => {
          const h = { pid: 424242, write() { }, resize() { }, kill() { } };
          let settle; h.ready = new Promise((r) => { settle = r; });
          setTimeout(() => { try { h.onData?.(Buffer.from('VSEARLYBYTE\n')); } catch { } settle({ pid: 424242 }); }, 30);
          return h;
        },
      }),
    });
    const id = 'sess-early-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const sock = mkDtachFixture('early');
    const session = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: sock, cwd: ROOT };
    activeSessions.set(id, session);
    const logs = [];
    const realWarn = console.warn, realLog = console.log;
    console.warn = (...a) => logs.push(a.join(' ')); console.log = (...a) => logs.push(a.join(' '));
    try {
      eng.attachToDtach(id, sock, session);
      const t0 = Date.now();                       // > the probe's 4.0 s + 0.6 s confirm
      while (Date.now() - t0 < 7000) { if (streamHas(frames, /TICK/)) break; await sleep(150); }
    } finally { console.warn = realWarn; console.log = realLog; }
    const r = {
      early: streamHas(frames, /VSEARLYBYTE/),
      onDaemon: session.pty?._daemon === true,
      healed: logs.some((l) => /re-attaching dtach locally/.test(l)),
      tick: streamHas(frames, /TICK/),
      heals: Number(session._attachProbeHeals || 0),
      logs,
    };
    activeSessions.delete(id);
    try { session.pty?.kill?.(); } catch { }
    return r;
  };

  const fixed = await earlyLeg(path.join(REPO, 'src/server/session-stdout.js'));
  ok(fixed.early, 'FIX: a byte delivered before `ready` settles still reaches the clients (buffered, replayed once the shim has listeners)', fixed.logs.join(' | '));
  ok(fixed.onDaemon && !fixed.healed, 'FIX: …and it counts as the attach\'s proof of life — a session that says nothing else is NOT healed off the daemon', `onDaemon=${fixed.onDaemon} healed=${fixed.healed} | ${fixed.logs.join(' | ')}`);
  ok(fixed.heals === 0, 'FIX: an attach that produced a byte leaves the heal counter at 0 (the bound is on CONSECUTIVE silent attaches, never a lifetime cap)', `heals=${fixed.heals}`);

  // NEGATIVE CONTROL — a copy of the REAL module with ONLY the early-data
  // replay removed. One mechanism, one control: the byte is lost AND the
  // probe then heals a bridge that was working the whole time.
  let noReplay;
  {
    const src = fs.readFileSync(path.join(REPO, 'src/server/session-stdout.js'), 'utf-8');
    const line = "      for (const buf of (h._earlyData || []).splice(0)) { try { h.onData(buf); } catch { } }\n";
    ok(src.includes(line), 'PATCH LANDED: the early-data replay is where the control expects it');
    noReplay = MUTR.write('src/server/session-stdout.js', editAnchor(src, line, '', "src/server/session-stdout.js"), 'noreplay');
  }
  const ctl = await earlyLeg(noReplay);
  ok(!ctl.early, 'NEGATIVE CONTROL: without the replay that byte is dropped on the floor (no listener existed yet)', ctl.logs.join(' | '));
  ok(ctl.healed, 'NEGATIVE CONTROL: …and the probe then heals a bridge that was never broken', `healed=${ctl.healed} | ${ctl.logs.join(' | ')}`);
  ok(ctl.tick, 'NEGATIVE CONTROL: the local heal does rescue it (the cost is a needless re-attach, not a lost session)');
  ok(ctl.heals === 1, 'NEGATIVE CONTROL: …and exactly ONE heal is counted (the counter moves only when the probe really acted)', `heals=${ctl.heals}`);
}

// ── § 3 BOOT ORDERING: the daemon path is taken only on an ALREADY-LIVE link ─
console.log('— §3 a restore must not race the daemon connect/self-upgrade —');
{
  const dm = newDaemon('ordering');                     // constructed, NOT connected
  ok(dm.status().connected === false, 'precondition: the link is not established yet (exactly the boot window)');
  const { eng, activeSessions, frames } = makeEngine({ getDeviceMgr: () => dm, modulePath: path.join(REPO, 'src/server/session-stdout.js') });
  const sock = mkDtachFixture('ordering');
  const id = 'sess-ordering-' + Date.now();
  const session = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: sock, cwd: ROOT };
  activeSessions.set(id, session);
  eng.attachToDtach(id, sock, session);
  ok(session.pty && !session.pty._daemon, 'FIX: a restore while the link is still connecting attaches LOCALLY, in the same tick');
  const t0 = Date.now();
  while (Date.now() - t0 < 5000 && !streamHas(frames, /TICK/)) await sleep(120);
  ok(streamHas(frames, /TICK/), 'FIX: and it streams immediately (no blind window while the daemon comes up)');
  try { session.pty?.kill?.(); } catch { }

  // control: master takes the daemon path in that same window
  const ctl = makeEngine({ getDeviceMgr: () => dm, modulePath: CONTROL_MODULE });
  const sock2 = mkDtachFixture('ordering-ctl');
  const id2 = 'sess-ordering-ctl-' + Date.now();
  const s2 = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: sock2, cwd: ROOT };
  ctl.activeSessions.set(id2, s2);
  ctl.eng.attachToDtach(id2, sock2, s2);
  const t1 = Date.now();
  while (Date.now() - t1 < 8000 && !s2.pty) await sleep(120);
  ok(s2.pty?._daemon === true, 'PRE-FIX CONTROL: master attaches through the daemon in that same window (the gate is what changed)');
  try { s2.pty?.kill?.(); } catch { }

  // and once the link IS live, the fix still uses the daemon
  await dm.connect();
  const sock3 = mkDtachFixture('ordering-live');
  const id3 = 'sess-ordering-live-' + Date.now();
  const s3 = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: sock3, cwd: ROOT };
  activeSessions.set(id3, s3);
  eng.attachToDtach(id3, sock3, s3);
  const t2 = Date.now();
  while (Date.now() - t2 < 5000 && !s3.pty?._daemon) await sleep(120);
  ok(s3.pty?._daemon === true, 'FIX: with the link already live the daemon path is still taken (this is a gate, not a removal)');
  try { s3.pty?.kill?.(); } catch { }
  dm.stop();
}

// ── § 4 END-TO-END: a real worktree server, a real daemon at a MISMATCHED
//       version (so the self-upgrade + re-exec really happens under the
//       restore), a real ws client, and ZERO input. ───────────────────────────
console.log('— §4 end-to-end restore over a self-upgrading daemon —');
e2e: {
  const wt = path.join(ROOT, 'wt');
  worktrees.add(wt);
  execFileSync('git', ['-C', REPO, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js', 'package.json']) {   // overlay the WORKING tree (2.335.1)
    execFileSync('rm', ['-rf', path.join(wt, f)]);
    execFileSync('cp', ['-r', path.join(REPO, f), path.join(wt, f)]);
  }
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
  fs.mkdirSync(path.join(wt, 'data', 'bin'), { recursive: true });
  // The bundle the SERVER streams during the self-upgrade carries the real
  // version AND the fault; the daemon it finds already installed carries an
  // OLD version, so the hello-ack mismatch → upgrade → re-exec path runs.
  buildBundle(path.join(wt, 'data/bin/vibespace-agentd.js'), { fault: true });
  const staleBundle = buildBundle(path.join(ROOT, 'bundles', 'stale.js'), { fault: true, version: '0.0.1' });
  const wtRoot = path.join(ROOT, 'daemons', 'e2e');
  daemonRoots.add(wtRoot);
  const installStale = () => {
    killDaemons();
    fs.rmSync(wtRoot, { recursive: true, force: true });
    fs.mkdirSync(path.join(wtRoot, '0.0.1'), { recursive: true });
    fs.copyFileSync(staleBundle, path.join(wtRoot, '0.0.1', 'agentd.js'));
    fs.chmodSync(path.join(wtRoot, '0.0.1', 'agentd.js'), 0o700);
    try { fs.unlinkSync(path.join(wtRoot, 'current')); } catch { }
    fs.symlinkSync(path.join(wtRoot, '0.0.1'), path.join(wtRoot, 'current'));
  };

  const PORT = await freePort();
  const bootEnv = {
    ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '',
    VIBESPACE_AGENTD_ROOT: wtRoot, VIBESPACE_NODE_MODULES: path.join(REPO, 'node_modules'),
    VS_FAULT_OPEN: 'deadchan', // the incident's exact shape: the open is ANSWERED, the channel never relays
  };
  const boot = () => { const c = spawn('node', ['server.js'], { cwd: wt, env: bootEnv, stdio: ['ignore', 'pipe', 'pipe'] }); servers.add(c); return c; };
  const waitReady = (p) => new Promise((res, rej) => {
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (out.includes('Ready.')) res(out); });
    p.stderr.on('data', (d) => { out += d; });
    setTimeout(() => rej(new Error('boot timeout\n' + out.slice(-2000))), 45000);
  });
  const journal = (p) => { let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; }); return () => out; };

  // ① create a terminal session that keeps printing on a timer
  installStale();
  let srv = boot(); let jrn = journal(srv); await waitReady(srv);
  const ws1 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws1.on('open', r));
  const msgs = []; ws1.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  ws1.send(JSON.stringify({ type: 'create', backend: 'shell', mode: 'terminal', cwd: ROOT, cols: 80, rows: 24, reqId: 'r1' }));
  await new Promise((res, rej) => {
    const t = setInterval(() => { if (msgs.some((m) => m.type === 'created')) { clearInterval(t); res(); } }, 200);
    setTimeout(() => { clearInterval(t); rej(new Error('no created reply: ' + JSON.stringify(msgs.map((m) => m.type)))); }, 20000);
  });
  const sid = msgs.find((m) => m.type === 'created').sessionId;
  // THE FIXTURE COMMAND IS PARSED BY WHOEVER $SHELL IS. Typing
  // `while :; do echo VSTICK; sleep 0.4; done` at a fixed 1.2 s into an
  // INTERACTIVE login shell is a coin flip: measured here (scripts/
  // dbg-shell-fixture.mjs, zsh + oh-my-zsh) it lands mid-startup, the shell
  // parses a fragment, answers `parse error near \`do'` and sits at its prompt
  // — and then the control leg's "nothing arrived" is VACUOUS. So: two script
  // FILES (no quoting, no `;`, nothing a line editor can mangle), a readiness
  // HANDSHAKE whose marker cannot be matched by its own terminal echo (the
  // typed line names a path; only the script PRINTS the marker), and a retry
  // on each — because "did the shell take the command" is the thing being
  // established, not something to assume.
  const readySh = path.join(ROOT, 'ready.sh'), tickSh = path.join(ROOT, 'tick.sh');
  fs.writeFileSync(readySh, 'echo VSREADY_OK\n');
  fs.writeFileSync(tickSh, 'while :; do echo VSTICK; sleep 0.4; done\n');
  const outText = () => msgs.filter((m) => m.type === 'output' && m.sessionId === sid).map((m) => m.data || '').join('');
  const typeUntil = async (line, re, tries, waitMs) => {
    for (let i = 0; i < tries; i++) {
      ws1.send(JSON.stringify({ type: 'input', sessionId: sid, data: line + '\n' }));
      const t = Date.now();
      while (Date.now() - t < waitMs) { if (re.test(outText())) return true; await sleep(150); }
    }
    return re.test(outText());
  };
  const shellReady = await typeUntil(`sh ${readySh}`, /VSREADY_OK/, 12, 1500);
  ok(shellReady, 'e2e setup: the login shell inside dtach is taking commands (the handshake marker only the SCRIPT can print)',
    JSON.stringify(outText().slice(-300)));
  if (!shellReady) { ws1.close(); srv.kill('SIGKILL'); servers.delete(srv); break e2e; }  // failed LOUDLY above; every leg below would be vacuous
  const ticking = await typeUntil(`exec sh ${tickSh}`, /VSTICK[\s\S]*VSTICK/, 3, 4000);
  ok(ticking, 'e2e setup: the session is emitting on a timer before the restart', JSON.stringify(outText().slice(-300)));
  if (!ticking) { ws1.close(); srv.kill('SIGKILL'); servers.delete(srv); break e2e; }      // ditto
  ws1.close(); srv.kill('SIGKILL'); servers.delete(srv);
  await sleep(600);

  // An INDEPENDENT reader of the same dtach socket: it answers "is the fixture
  // still printing?" without going through the server at all, so a zero from
  // the control below can never be a zero about a dead shell (a vacuous
  // control is worse than no control).
  const nodePty = require(path.join(REPO, 'node_modules/node-pty'));
  const sockDir = path.join(wt, 'data', 'sockets');
  const fixtureSock = () => path.join(sockDir, fs.readdirSync(sockDir).filter((f) => f.startsWith('cw-'))[0]);
  const fixtureAlive = async () => {
    const p2 = nodePty.spawn('dtach', ['-a', fixtureSock(), '-E', '-r', 'winch'], { name: 'xterm-256color', cols: 80, rows: 24, env: process.env });
    let seen = '';
    p2.onData((d) => { seen += d; });
    await sleep(2500);
    try { p2.kill(); } catch { }
    return /VSTICK/.test(seen);
  };
  ok(await fixtureAlive(), 'e2e precondition: the dtach session is STILL printing after the restart (an independent reader says so)');

  // ② the CONTROL boot: master's attach + the dead channel
  installStale();
  const savedFixed = fs.readFileSync(path.join(wt, 'src/server/session-stdout.js'), 'utf-8');
  fs.writeFileSync(path.join(wt, 'src/server/session-stdout.js'), CONTROL_SRC);
  srv = boot(); jrn = journal(srv); await waitReady(srv);
  {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise((r) => ws.on('open', r));
    const got = [], all = [];
    ws.on('message', (d) => { try { const m = JSON.parse(d); all.push(m); if (m.type === 'output' && /VSTICK/.test(m.data || '')) got.push(m); } catch { } });
    ws.send(JSON.stringify({ type: 'attach', sessionId: sid, cols: 80, rows: 24 }));
    await sleep(12000);   // > the whole fixed budget, and ZERO input the entire time
    // A zero that comes from "the attach never happened" would be a VACUOUS
    // control, so the attach itself is asserted first.
    ok(all.some((m) => m.type === 'attached' && m.sessionId === sid),
      'PRE-FIX CONTROL e2e: the client really attached (the zero below is about output, not about a failed attach)',
      JSON.stringify(all.map((m) => m.type)));
    ok(got.length === 0, 'PRE-FIX CONTROL e2e: the restored session streams NOTHING with no input — the production incident',
      `frames=${got.length}; journal tail: ${jrn().slice(-400)}`);
    ok(await fixtureAlive(), 'PRE-FIX CONTROL e2e: …while the session itself never stopped printing (the zero is the BRIDGE, not the shell)');
    ok(/upgrading \(attempt 1\/3\)/.test(jrn()), 'PRE-FIX CONTROL e2e: the daemon really took the self-upgrade path (the incident environment)',
      jrn().slice(-400));
    ws.close();
  }
  srv.kill('SIGKILL'); servers.delete(srv);
  fs.writeFileSync(path.join(wt, 'src/server/session-stdout.js'), savedFixed);
  await sleep(600);

  // ③ the FIXED boot: same daemon fault, same version skew, no input at all
  installStale();
  srv = boot(); jrn = journal(srv); await waitReady(srv);
  {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise((r) => ws.on('open', r));
    const got = [], all = [];
    ws.on('message', (d) => { try { const m = JSON.parse(d); all.push(m); if (m.type === 'output' && /VSTICK/.test(m.data || '')) got.push(m); } catch { } });
    ws.send(JSON.stringify({ type: 'attach', sessionId: sid, cols: 80, rows: 24 }));
    const t0 = Date.now();
    while (Date.now() - t0 < 12000 && got.length === 0) await sleep(200);
    ok(all.some((m) => m.type === 'attached' && m.sessionId === sid), 'FIX e2e: the client attached',
      JSON.stringify(all.map((m) => m.type)));
    ok(got.length > 0, 'FIX e2e: the restored session streams to an attached client with ZERO input',
      `frames=${JSON.stringify(all.map((m) => m.type))}; journal tail: ${jrn().slice(-900)}`);
    // The environment claim is asserted with a BOUNDED WAIT, not read at
    // whatever instant the leg above happened to finish. The fix makes the
    // session stream in ~1 s while the daemon's version handshake + bundle
    // upload + re-exec take several; the control leg only ever passed this
    // because it sat on a flat 12 s sleep. An assertion whose subject may not
    // have HAPPENED yet measures the other leg's duration, not the daemon.
    const tUp = Date.now();
    while (Date.now() - tUp < 25000 && !/upgrading \(attempt 1\/3\)/.test(jrn())) await sleep(250);
    ok(/upgrading \(attempt 1\/3\)/.test(jrn()), 'FIX e2e: measured in the SAME environment — the daemon self-upgraded under the restore',
      jrn().slice(-400));
    ws.close();
  }
  srv.kill('SIGKILL'); servers.delete(srv);

  // ④ A HELD POOL STAMP SURVIVES THE RESTORE (design-reset-credits r2/r3). A
  //    session-meta carrying `heldPoolMember` restores as a process that still
  //    speaks as that member: the billing badge (sessionAuth → accounts.
  //    poolMemberOfSession, the ONE rule) names it even after the pool default
  //    moved on — while the same meta WITHOUT the stamp (a process older than
  //    every ledger row of its pool) is `unknown` and follows the link. Same
  //    self-upgrading daemon, same dead channel, zero input.
  installStale();
  srv = boot(); jrn = journal(srv); await waitReady(srv);
  let sid2 = null;
  {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise((r) => ws.on('open', r));
    const m2 = []; ws.on('message', (d) => { try { m2.push(JSON.parse(d)); } catch { } });
    ws.send(JSON.stringify({ type: 'create', backend: 'shell', mode: 'terminal', cwd: ROOT, cols: 80, rows: 24, reqId: 'r2' }));
    await new Promise((res, rej) => {
      const t = setInterval(() => { if (m2.some((m) => m.type === 'created')) { clearInterval(t); res(); } }, 200);
      setTimeout(() => { clearInterval(t); rej(new Error('no created reply (2nd): ' + JSON.stringify(m2.map((m) => m.type)))); }, 20000);
    });
    sid2 = m2.find((m) => m.type === 'created').sessionId;
    ws.close();
  }
  // item 8 (store-writer follow-up): THE KILL WAITS FOR THE FACT THIS LEG NEEDS, ON DISK — each session's meta, found by
  // its webuiSessionId (the file patchMeta rewrites below) — by a bounded poll, never 1.5 s of pace. A meta's FIRST version
  // is written at the socket's birth, before the `created` reply; its later versions ride the store writer (100 ms) and a
  // SIGKILL loses one not written yet — none of them is this leg's: it rewrites the file itself with the server down.
  {
    const META_BOUND_MS = 10000;
    const mdir = path.join(wt, 'data', 'session-meta');
    const metaOf = (id) => { let names = []; try { names = fs.readdirSync(mdir).filter((f) => f.endsWith('.json')); } catch { } return names.some((f) => { try { return JSON.parse(fs.readFileSync(path.join(mdir, f), 'utf-8')).webuiSessionId === id; } catch { return false; } }); };
    const t0 = Date.now();
    let seen = { sid: metaOf(sid), sid2: metaOf(sid2) };
    while (!(seen.sid && seen.sid2) && Date.now() - t0 < META_BOUND_MS) { await sleep(100); seen = { sid: metaOf(sid), sid2: metaOf(sid2) }; }
    ok(seen.sid && seen.sid2, `e2e ④ setup: both sessions' metas are on disk before the SIGKILL (found by webuiSessionId)${seen.sid && seen.sid2 ? '' : ` — not within ${META_BOUND_MS / 1000} s`}`, JSON.stringify({ ...seen, ms: Date.now() - t0 }));
  }
  srv.kill('SIGKILL'); servers.delete(srv);
  await sleep(600);
  // the accounts, written with the server DOWN: two ChatGPT logins + a codex
  // pool whose default is moved A→B AFTER both sessions were created
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const prevHome = process.env.CODEX_HOME; process.env.CODEX_HOME = path.join(ROOT, 'shared-codex'); // keep the seed off the real ~/.codex
  const wam = new AccountManager({ dataDir: path.join(wt, 'data') });
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sub = (name) => {
    const { id } = wam.createCodexSubscription({ name });
    const idTok = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ email: name.replace(/\W+/g, '').toLowerCase() + '@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus', chatgpt_account_id: 'acct-' + name.replace(/\W+/g, '') } })}.sig`;
    fs.writeFileSync(path.join(wam.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-' + name, id_token: idTok } }));
    return id;
  };
  const cxA = sub('Cx Alpha'), cxB = sub('Cx Beta');
  wam.createPool({ name: 'CxRestore', backend: 'codex' });
  const cxP = wam.list().accounts.find((a) => a.type === 'pooled' && a.backend === 'codex').id;
  wam.setPoolTarget(cxP, cxA); wam.setPoolTarget(cxP, cxB, { why: 'pool-switch' });
  if (prevHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevHome;
  ok(wam.poolCurrent(cxP) === cxB, 'e2e ④ setup: the pool default is on Cx Beta — only a STAMP can answer Cx Alpha now');
  const metaDir = path.join(wt, 'data', 'session-meta');
  const patchMeta = (id, extra) => {
    for (const f of fs.readdirSync(metaDir)) {
      const p = path.join(metaDir, f);
      let m; try { m = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { continue; }
      if (m.webuiSessionId === id) { fs.writeFileSync(p, JSON.stringify({ ...m, ...extra })); return true; }
    }
    return false;
  };
  ok(patchMeta(sid, { backend: 'codex', accountId: cxP, heldPoolMember: cxA }), 'e2e ④ setup: the first session\'s meta carries accountId + heldPoolMember (the r2 spawn stamp)');
  ok(patchMeta(sid2, { backend: 'codex', accountId: cxP }), 'e2e ④ setup: the second session\'s meta carries the pool and NO stamp');
  installStale();
  srv = boot(); jrn = journal(srv); await waitReady(srv);
  {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise((r) => ws.on('open', r));
    const all = []; ws.on('message', (d) => { try { all.push(JSON.parse(d)); } catch { } });
    const rowOf = (id) => { const l = all.filter((m) => m.type === 'active-sessions').pop(); return l ? (l.sessions || []).find((s) => (s.id || s.webuiId || s.sessionId) === id) : null; };
    const t0 = Date.now();
    while (Date.now() - t0 < 10000 && !(rowOf(sid) && rowOf(sid2))) await sleep(200);
    const row = rowOf(sid), row2 = rowOf(sid2);
    ok(!!row && !!row2, 'e2e ④ both sessions restored (the active-sessions payload on connect)', JSON.stringify(((all.filter((m) => m.type === 'active-sessions').pop() || {}).sessions || []).map((s) => s.id || s.webuiId || s.sessionId)));
    ok(!!row && !!row.auth && row.auth.source === 'pooled' && row.auth.poolTarget === 'Cx Alpha',
      'FIX e2e ④ the restored process\'s billing badge names the member it HOLDS (Cx Alpha) although the pool default is on Cx Beta — the stamp survived the restore', JSON.stringify(row && row.auth));
    ok(!!row2 && !!row2.auth && row2.auth.source === 'pooled' && row2.auth.poolTarget === 'Cx Beta',
      'e2e ④ CONTROL: the same meta WITHOUT the stamp (older than every ledger row of its pool ⇒ unknown) follows the link (Cx Beta)', JSON.stringify(row2 && row2.auth));
    const tUp = Date.now();
    while (Date.now() - tUp < 25000 && !/upgrading \(attempt 1\/3\)/.test(jrn())) await sleep(250);
    ok(/upgrading \(attempt 1\/3\)/.test(jrn()), 'e2e ④ …measured under the same self-upgrading daemon', jrn().slice(-300));
    ws.close();
  }
  srv.kill('SIGKILL'); servers.delete(srv);

  // ⑤ THE EMFILE-SHAPED RESTART (lane-dead-bridge, 2026-09-30 12:03:17). The production server died of an EMFILE
  //    thrown from session-status's debounce timer. Here the server runs at a limit it cannot raise (prlimit soft =
  //    hard), its table is FILLED with open connections, and a status write lands: the fixed server keeps running,
  //    names who ran out and retries until the write lands; the PRE-FIX copy of the store dies of it — and after
  //    either, the restored session streams with ZERO input (the promise this suite exists for).
  emfile: {
    let prlimitBin = null; try { prlimitBin = execFileSync('/usr/bin/which', ['prlimit'], { encoding: 'utf8' }).trim(); } catch { }
    if (!prlimitBin) { console.log('  ⊘ SKIP e2e ⑤: no prlimit — a server limit node cannot raise cannot be set here'); break emfile; }
    const http = await import('node:http');
    const LIM = 640;
    const ssFile = path.join(wt, 'src/session-status.js');
    const ssFixed = fs.readFileSync(ssFile, 'utf8');
    // lane hub-loop-stalls commit 2: session-status writes through THE STORE WRITER (its own thread; a failed write is
    // reported, never thrown) — the pre-fix copy is then its write put BACK on the main thread: a bare synchronous write in
    // its own 500 ms timer (the 2026-09-30 shape), the same options object; the older timer shape where a tree still has it
    const SW_DIRTY = "require('./store-writer.js').storeWriter().dirty(this._file, { name: 'session-status.write', debounceMs: 500,";
    const ssPre = ssFixed.includes(SW_DIRTY)
      ? ssFixed.replace(SW_DIRTY, "((o) => { if (!this._writeTimer) this._writeTimer = setTimeout(() => { this._writeTimer = null; const j = o.produce(); if (j != null) { fs.writeFileSync(this._file + '.tmp', j); fs.renameSync(this._file + '.tmp', this._file); o.onWritten(true); } }, 500); })({ name: 'session-status.write', debounceMs: 500,")
      : ssFixed.replace('this._writeTimer = setTimeout(() => { this._writeTimer = null; this._flushFromTimer(); }, 500);', 'this._writeTimer = setTimeout(() => { this._writeTimer = null; this._flush(); }, 500);');
    ok(ssPre !== ssFixed, 'e2e ⑤ setup: the pre-fix session-status copy took its patch (its write a bare synchronous one in a main-thread timer)');
    const bootLimited = () => { const c = spawn(prlimitBin, [`--nofile=${LIM}:${LIM}`, 'node', 'server.js'], { cwd: wt, env: bootEnv, stdio: ['ignore', 'pipe', 'pipe'] }); servers.add(c); return c; };
    const fdCount = (pid) => { try { return fs.readdirSync(`/proc/${pid}/fd`).length; } catch { return null; } };
    /** fill the server's table with ws connections until it refuses one; returns the open sockets */
    const fill = async (pid) => {
      const open = [];
      // lane race-sweep (B-6b74, 1/10 at box load ~35: the probe POST answered 0): the status write rides the ONE keep-alive
      // connection warmed before the fill (a full table accepts no new one) — and node closes an idle keep-alive socket after
      // its keepAliveTimeout (5 s, the server sets none); a fill slower than that dropped it. The fill keeps it in use every
      // keepAliveTimeout / 5 (the mechanism's constant, slack 5)
      const KEEPALIVE_MS = 5000; let lastUse = Date.now();
      for (let i = 0; i < LIM + 50; i++) {
        if (Date.now() - lastUse > KEEPALIVE_MS / 5) { await req('GET', '/api/session-status'); lastUse = Date.now(); }
        const w = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
        const r = await new Promise((res) => { const t = setTimeout(() => res('timeout'), 3000); w.once('open', () => { clearTimeout(t); res('open'); }); w.once('error', () => { clearTimeout(t); res('error'); }); w.once('close', () => { clearTimeout(t); res('close'); }); });
        if (r !== 'open') break;
        w.on('error', () => { }); open.push(w);
        await new Promise((res) => setTimeout(res, 5));
        if (w.readyState !== 1) break;   // accepted, then closed by libuv's EMFILE trick
      }
      return open;
    };
    const keep = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const req = (method, p, body) => new Promise((res) => {
      const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, agent: keep, headers: { 'Content-Type': 'application/json' } }, (resp) => { let d = ''; resp.on('data', (c) => { d += c; }); resp.on('end', () => res({ status: resp.statusCode, body: d })); });
      r.on('error', (e) => res({ status: 0, body: String(e.message) })); r.end(body ? JSON.stringify(body) : undefined);
    });
    // lane race-sweep (B-6b74 — 主开发 on the .322 chain at load 45–55, 1 of 80): 12 s from the SEND raced the server's own backlog
    // (583 close handlers, the debounced writers, then the attach). Each wait is now for its LAST EFFECT: the attach's own
    // `attached` answer — bounded by an in-run control, a request sent right AFTER the attach (the server answering that one but
    // not the attach is the red) — then a VSTICK within the fixture's tick (TICK_MS) × 25; the state is printed either way
    const TICK_MS = 400;   // tickSh: `while :; do echo VSTICK; sleep 0.4; done`
    const streams = async (label, { beforeSend = null } = {}) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      const up = await new Promise((r) => { ws.once('open', () => r(true)); ws.once('error', () => r(false)); });
      if (!up) return { ok: false, label, why: 'the WebSocket did not open' };
      ws.on('error', () => { });
      const got = [], types = new Set(); let ackAt = null;
      ws.on('message', (d) => { try { const m = JSON.parse(d); types.add(m.type); if (m.type === 'attached' && m.sessionId === sid && ackAt == null) ackAt = Date.now(); if (m.type === 'output' && m.sessionId === sid && /VSTICK/.test(m.data || '')) got.push(m); } catch { } });
      if (beforeSend) await beforeSend();
      const t0 = Date.now();
      ws.send(JSON.stringify({ type: 'attach', sessionId: sid, cols: 80, rows: 24 }));
      const after = await Promise.race([req('GET', '/api/session-status').then((r) => ({ status: r.status, at: Date.now() })), sleep(60000).then(() => ({ status: 'no answer in 60 s', at: Date.now() }))]);
      while (ackAt == null && Date.now() - after.at < TICK_MS * 25) await sleep(50);
      if (ackAt != null) while (!got.length && Date.now() - ackAt < TICK_MS * 25) await sleep(50);
      ws.close();
      return { ok: got.length > 0, label, attachedMs: ackAt == null ? null : ackAt - t0, laterRequest: { status: after.status, ms: after.at - t0 }, frames: got.length, types: [...types] };
    };

    // (a) the FIXED store under a full table
    installStale();
    srv = bootLimited(); jrn = journal(srv); await waitReady(srv);
    ok(new RegExp(`\\[fd\\] open-files limit: soft ${LIM} / hard ${LIM}`).test(jrn()), `e2e ⑤ the boot line says the limit it really runs at (soft ${LIM} / hard ${LIM})`, (jrn().match(/\[fd\][^\n]*/) || [''])[0]);
    await req('GET', '/api/session-status');   // the keep-alive connection the status write will ride (no new accept needed)
    await req('POST', '/api/session-status', { sessionKey: 'webui:warm', state: 'done' });   // the JSON body parser loads its charset module lazily — on a full table that require() itself is refused
    const conns = await fill(srv.pid);
    const held = fdCount(srv.pid);
    ok(held >= LIM - 2, `e2e ⑤ setup: the server's table is full (${held} of ${LIM} after ${conns.length} connections)`);
    const r1 = await req('POST', '/api/session-status', { sessionKey: 'webui:emfile-probe', state: 'working', reason: 'emfile' });
    // HOLD the table full for a minute: every debounced writer that fires meanwhile meets the EMFILE (measured: the
    // session-status write, the channels index, port-forwards, the usage cursors, the fd gauge itself) — none may end the server
    for (let k = 0; k < 12 && srv.exitCode === null; k++) await sleep(5000);
    // .396 seam 3 (lane hub-loop-stalls commit 2, round 2 law B): the route answers AFTER the store writer's write of the
    // person's override — at a full table that write fails, so the law's answer is 503 «not-durable» carrying the record
    // (applied, kept in memory, retried); 200 when the write got through. Either, with the server alive — never another
    // status, never no answer; what makes the 503 honest is the next two legs (WHO ran out; the SAME status lands after)
    let r1Body = null; try { r1Body = JSON.parse(r1.body); } catch { }
    const r1Met = r1.status === 200 && r1Body?.success === true && r1Body?.status?.state === 'working' ? '200 — on disk before the answer'
      : r1.status === 503 && r1Body?.code === 'not-durable' && r1Body?.status?.state === 'working' && r1Body?.status?.reason === 'emfile' ? '503 not-durable — applied, kept in memory, retried'
        : null;
    ok(!!r1Met && srv.exitCode === null, `FIX e2e ⑤ a minute at a FULL table, the status write included, did NOT kill the server, and the POST answered by the law (this run: ${r1Met || `POST ${r1.status} — ${String(r1.body).slice(0, 120)}`}; exit ${srv.exitCode})`,
      jrn().split('\n').filter((l) => /EMFILE|Error|\[fd\]|\[channels\]/.test(l)).slice(-12).join('\n'));
    const failLine = (jrn().match(/\[fd\] a background write failed \(EMFILE[^\n]*/) || [''])[0];
    ok(/This server ran out of file handles \(EMFILE\)/.test(failLine) && new RegExp(`holds ${LIM} of ${LIM}`).test(failLine), `FIX e2e ⑤ …and it said WHO ran out: ${JSON.stringify(failLine.slice(0, 220))}`);
    for (const w of conns) { try { w.terminate(); } catch { } }
    // seam 3: bound to THIS probe's key and its record — the same state and reason the POST carried (a 503 above is honest
    // only if this lands)
    const landed = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 70000) { try { const st = JSON.parse(fs.readFileSync(path.join(wt, 'data/session-status.json'), 'utf8')); const rec = st && st.statuses && st.statuses['webui:emfile-probe']; if (rec && rec.state === 'working' && rec.reason === 'emfile') return true; } catch { } await sleep(500); } return false; })();
    ok(landed, `FIX e2e ⑤ the pressure gone, the retry LANDED: data/session-status.json carries webui:emfile-probe as the POST set it (working, «emfile») — the POST answered ${r1.status}`);
    const sAfter = await streams('after-pressure');
    ok(sAfter.ok, 'FIX e2e ⑤ the session still streams to a new client after the pressure', JSON.stringify(sAfter));
    srv.kill('SIGKILL'); servers.delete(srv);
    await sleep(800);
    installStale();
    srv = boot(); jrn = journal(srv); await waitReady(srv);
    const sRest = await streams('restored');
    ok(sRest.ok, 'FIX e2e ⑤ after a kill at the end of the EMFILE episode the restored session streams with ZERO input', JSON.stringify(sRest));
    // lane race-sweep: THE RED CONTROL for streams()'s wait — a server that reaches the attach LATE (SIGSTOPped 13 s right after
    // the send: the .322 chain's backlog, made deterministic). The pre-fix wait (12 s from the send) calls the session dead; the
    // wait for the attach's own answer streams it
    if (sRest.ok) {
      // both clients connected FIRST, then the server stopped, then both attaches sent — the server reaches them 13 s later
      let opened = 0, stopped = null; const bothOpen = () => { if (++opened === 2) { process.kill(srv.pid, 'SIGSTOP'); stopped = sleep(13000).then(() => process.kill(srv.pid, 'SIGCONT')); } return new Promise((r) => { const t = setInterval(() => { if (stopped) { clearInterval(t); r(); } }, 20); }); };
      const preFix = (async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
        await new Promise((r) => { ws.once('open', r); ws.once('error', r); }); ws.on('error', () => { });
        const got = []; ws.on('message', (d) => { try { const m = JSON.parse(d); if (m.type === 'output' && m.sessionId === sid && /VSTICK/.test(m.data || '')) got.push(m); } catch { } });
        await bothOpen();
        ws.send(JSON.stringify({ type: 'attach', sessionId: sid, cols: 80, rows: 24 }));
        const t0 = Date.now(); while (Date.now() - t0 < 12000 && !got.length) await sleep(200);
        ws.close(); return got.length > 0;
      })();
      const fixed = streams('stalled-server', { beforeSend: bothOpen });
      const [pre, fix] = await Promise.all([preFix, fixed]);
      await stopped;
      ok(!pre && fix.ok, `CONTROL: a server that reaches the attach 13 s late — the pre-fix wait (12 s from the send) says the session is dead (${pre}); the wait for the attach's answer streams it (attached ${fix.attachedMs} ms after the send)`, JSON.stringify({ pre, fix }));
    }
    srv.kill('SIGKILL'); servers.delete(srv);
    await sleep(800);

    // (b) CONTROL: the pre-fix store — the same write kills the server (the 12:03 crash), and the crash path ends its attach
    fs.writeFileSync(ssFile, ssPre);
    installStale();
    srv = bootLimited(); jrn = journal(srv); await waitReady(srv);
    const sockOf = (() => { const d = path.join(wt, 'data', 'sockets'); for (const f of fs.readdirSync(d)) { const m = path.join(wt, 'data', 'session-meta', f + '.json'); try { if (JSON.parse(fs.readFileSync(m, 'utf8')).webuiSessionId === sid) return path.join(d, f); } catch { } } return null; })();
    const clientsOf = (sock) => fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n)).filter((n) => { try { const a = fs.readFileSync(`/proc/${n}/cmdline`, 'utf8').split('\0'); const st = fs.readFileSync(`/proc/${n}/stat`, 'utf8'); return /dtach$/.test(a[0]) && ['-a', '-c'].includes(a[1]) && a[2] === sock && Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[4]) > 0; } catch { return false; } }).map(Number);
    await req('GET', '/api/session-status');
    await req('POST', '/api/session-status', { sessionKey: 'webui:warm', state: 'done' });
    const conns2 = await fill(srv.pid);
    const before = clientsOf(sockOf).filter((p) => { try { return Number(fs.readFileSync(`/proc/${p}/stat`, 'utf8').split(') ')[1].split(' ')[1]) === srv.pid; } catch { return false; } });
    const exited = new Promise((r) => srv.once('exit', (code) => r(code)));
    await req('POST', '/api/session-status', { sessionKey: 'webui:emfile-probe-2', state: 'working' });
    const code = await Promise.race([exited, sleep(8000).then(() => 'alive')]);
    servers.delete(srv);
    for (const w of conns2) { try { w.terminate(); } catch { } }
    ok(code === 1 && /EMFILE: too many open files, open '[^']*session-status\.json\.tmp'/.test(jrn()), `PRE-FIX CONTROL e2e ⑤ the same write KILLS the server: exit ${code}, ${JSON.stringify((jrn().match(/Error: EMFILE[^\n]*/) || [''])[0].slice(0, 140))}`);
    ok(/\[fd\] This server ran out of file handles \(EMFILE\)/.test(jrn()), 'e2e ⑤ …the crash handler named who ran out before dying');
    await sleep(500);
    ok(before.length >= 1 && before.every((p) => { try { process.kill(p, 0); return false; } catch { return true; } }), `e2e ⑤ …and ended its attach client(s) on the way out (${JSON.stringify(before)} gone) — a crash leaves no orphan to hold the next server's attach`);
    fs.writeFileSync(ssFile, ssFixed);
    installStale();
    srv = boot(); jrn = journal(srv); await waitReady(srv);
    const sCrash = await streams('restored-after-crash');
    ok(sCrash.ok, 'e2e ⑤ after the EMFILE crash the restored session streams with ZERO input', JSON.stringify(sCrash));
    srv.kill('SIGKILL'); servers.delete(srv);
  }
}   // the worktree is removed by cleanup() — see `worktrees` above

// ── § 5 ONE HEALER, TWO TRIGGERS ───────────────────────────────────────────
console.log('— §5 the attach probe and the input detector share ONE re-attach —');
{
  // (§5 the wiring pins — MOVED to the fast scripts/test-restore-liveness-pins.mjs — lane lg-text-legs-3, B-94d3: a leg that reads only source text runs in every lane's gate)

  // functional: the healer re-attaches and RESENDS
  const dmNone = null;
  const { eng, activeSessions, frames } = makeEngine({ getDeviceMgr: () => dmNone, modulePath: path.join(REPO, 'src/server/session-stdout.js') });
  const sock = mkQuietFixture('healer');
  const id = 'sess-healer-' + Date.now();
  const session = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: sock, cwd: ROOT };
  activeSessions.set(id, session);
  // lane race-sweep (B-6b74, 1/10 at box load ~20): the attach's LAST EFFECT — its first byte — never a 400 ms nap; how long
  // it took is this run's own measure of the box (the heal's bound below scales with it)
  const tAttach = Date.now();
  eng.attachToDtach(id, sock, session);
  while (!Number(session._lastPtyDataAt) && Date.now() - tAttach < BUDGET_MS) await sleep(20);
  const attachMs = Date.now() - tAttach;
  const before = session.pty;
  ok(eng.ptyQuietSince(session, Date.now()) === true, 'ptyQuietSince: no byte since NOW (the reader is not vacuously true)');
  ok(eng.ptyQuietSince(session, 0) === false, 'ptyQuietSince: a byte HAS arrived since epoch (the stamp is really written)');
  // THE TIE. The stamp is milliseconds and both callers take `since` right
  // before the thing they time, so a byte landing in that same millisecond is
  // the byte they are waiting for. It must read ALIVE: the losing side of this
  // tie RE-SENDS the user's keystroke (ws-handler's detector), and a local
  // terminal's echo really can come back inside the same ms as the write.
  ok(eng.ptyQuietSince(session, Number(session._lastPtyDataAt)) === false,
    'ptyQuietSince: a byte stamped in the SAME millisecond as `since` reads ALIVE (the tie may not cost a duplicated keystroke)');
  // B-c20d: what the healer re-sends is what a bridge that NEVER SPOKE was handed (writeSessionInput holds it) — the
  // device channel that never opened, modelled by a duck that relays nothing
  const dead = { _daemon: true, pid: -1, onData: () => ({ dispose() { } }), onExit: () => ({ dispose() { } }), write() { }, resize() { }, kill() { } };
  try { before.kill(); } catch { }
  eng.setupSessionPty(session, id, dead);
  eng.writeSessionInput(session, 'echo VSHEALED');
  const sinceHeal = frames.length;   // the stream the NEW attach produces starts here
  const healed = eng.reattachLocalPty(id, session, 'test heal');
  ok(healed === true && session.pty !== dead && session.pty !== before, 'reattachLocalPty replaces the pty and reports it');
  // the replay through the NEW attach is another attach + an echo: bounded by the healer's own budget or 20 × this run's
  // first attach, whichever is larger (the old 5 s literal read red once on 2 busy cpus), its state printed
  const t0 = Date.now(), healBound = Math.max(BUDGET_MS, attachMs * 20);
  while (Date.now() - t0 < healBound && !streamHas(frames, /VSHEALED/, sinceHeal)) await sleep(50);
  ok(streamHas(frames, /VSHEALED/, sinceHeal), 'reattachLocalPty RESENDS the input the never-spoke bridge was holding (judged on the joined stream since the heal)',
    JSON.stringify({ attachMs, healBound, waitedMs: Date.now() - t0, frames: frames.length, sinceHeal, tail: frames.slice(-3).map((f) => String(f.data || '').slice(-60)) }));
  try { session.pty?.kill?.(); } catch { }
  // B-1217 (the folded B-380f, lane lg-recovery): THIS LEG'S RUNNER RED, PLACED. setupSessionPty stamped the birth at `now` and
  // took a byte from ANY pty it ever wired: a byte of the OLD attach in the stand-in's birth millisecond reads «spoke» by
  // ptyQuietSince's tie, so writeSessionInput held nothing and the heal had nothing to resend. THE STALL PLACED (never load): the
  // clock held at the old attach's last byte from the stand-in's birth through the heal — on the cure the stand-in is born after
  // that byte and the heal replays; on a copy of the release's two lines nothing is held, every run
  const SS5 = fs.readFileSync(path.join(REPO, 'src/server/session-stdout.js'), 'utf8');
  const release5 = anchored(anchored(SS5, '  session._ptyOpenedAt = Math.max(Date.now(), (Number(session._lastPtyDataAt) || 0) + 1);', '  session._ptyOpenedAt = Date.now();' /* stale-pins: kept — the release's line, this control's plant */, 'release: the birth at now'),
    '  ptyProcess.onData(() => { if (session.pty === ptyProcess) session._lastPtyDataAt = Math.max(Date.now(), Number(session._ptyOpenedAt) || 0); });', '  ptyProcess.onData(() => { session._lastPtyDataAt = Date.now(); });' /* stale-pins: kept — the release's line, this control's plant */, 'release: any pty stamps');
  const stalledHeal = async (modulePath, tag) => {
    const { eng: E, activeSessions: AS, frames: F } = makeEngine({ getDeviceMgr: () => null, modulePath });
    const sock2 = mkQuietFixture('healer-' + tag);
    const id2 = 'sess-healer-' + tag + '-' + Date.now();
    const s2 = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: sock2, cwd: ROOT };
    AS.set(id2, s2);
    const tA = Date.now();
    E.attachToDtach(id2, sock2, s2);
    while (!Number(s2._lastPtyDataAt) && Date.now() - tA < BUDGET_MS) await sleep(20);
    const aMs = Date.now() - tA, old = s2.pty, lastByte = Number(s2._lastPtyDataAt);
    const dead2 = { _daemon: true, pid: -1, onData: () => ({ dispose() { } }), onExit: () => ({ dispose() { } }), write() { }, resize() { }, kill() { } };
    const realNow = Date.now; let replay = [], fromHeal = 0;
    Date.now = () => lastByte;   // the stall placed: the stand-in is born, typed into and healed inside the old attach's last-byte millisecond
    try {
      try { old.kill(); } catch { }
      E.setupSessionPty(s2, id2, dead2);
      E.writeSessionInput(s2, 'echo VSSTALLED');
      fromHeal = F.length;
      E.reattachLocalPty(id2, s2, 'test heal (B-1217 stall placed)');
      replay = s2._bridgeHeldInputs && s2._bridgeHeldInputs.replaying ? s2._bridgeHeldInputs.lines.slice() : [];
    } finally { Date.now = realNow; }
    const t1 = Date.now(), bound = Math.max(BUDGET_MS, aMs * 20);
    if (replay.length) while (Date.now() - t1 < bound && !streamHas(F, /VSSTALLED/, fromHeal)) await sleep(50);
    const seen = streamHas(F, /VSSTALLED/, fromHeal);
    try { s2.pty?.kill?.(); } catch { }
    AS.delete(id2);
    return { replay, seen, aMs, lastByte, frames: F.length };
  };
  const st = await stalledHeal(path.join(REPO, 'src/server/session-stdout.js'), 'b1217-cure');
  ok(JSON.stringify(st.replay) === '["echo VSSTALLED"]' && st.seen, 'B-1217 THE STALL PLACED: the stand-in born in the old attach\'s last-byte millisecond still reads never-spoke — the heal holds the input and the new attach carries it', st);
  const sr = await stalledHeal(MUTR.write('src/server/session-stdout.js', release5, 'b1217-release'), 'b1217-release');
  ok(sr.replay.length === 0 && !sr.seen, 'B-1217 RED (a copy of the release\'s two lines, the same stall): the tie reads «spoke» — nothing held, nothing resent (the runner\'s red, every run)', sr);
}

// daemonPtyShim must serve MORE THAN ONE data listener (the stamp + the consumer).
// With one slot the consumer registered second REPLACES the stamp — the stamp is
// what dies, not the consumer. The other ducks + the census: test-pty-duck.
console.log('— §6 the device pty shim is a real node-pty duck (multi-listener) —');
{
  const seen = [];
  const fakeHandle = { write() { }, resize() { }, kill() { } };
  const shim = dial.daemonPtyShim(fakeHandle);
  const d1 = shim.onData((s) => seen.push('a:' + s));
  shim.onData((s) => seen.push('b:' + s));
  fakeHandle.onData(Buffer.from('x'));
  ok(seen.join(',') === 'a:x,b:x', 'both onData listeners fire (a one-slot shim let the consumer REPLACE the liveness stamp registered first)', seen.join(','));
  d1.dispose();
  seen.length = 0;
  fakeHandle.onData(Buffer.from('y'));
  ok(seen.join(',') === 'b:y', 'dispose() removes only its OWN listener', seen.join(','));
}


// A PAIRED MACHINE THAT CANNOT BE REACHED NEVER STOPS THE HUB (lane hub-dies-dead-ssh-host — the .346 verify round's HIGH:
// picking it in New Session killed the hub, `Error: write EPIPE` its last journal line). A REAL worktree server with a
// dead ssh record (h-dead, my-mac) and a stub `ssh` first on its PATH that closes its stdin and exits 255 at once (never a
// real machine): the machine's stdin roads (the tools tar, the usage scanner) and its host rung (the folder listing, its
// recent folders, its home) are pressed over HTTP — each answers, the field's words name the machine, and the hub answers
// the NEXT request. RED CONTROL: the same server with a copy of hosts.js whose feedStdin does not listen (the pre-fix
// shape) DIES of the first stdin road — its process exits right after the tools install, a stream write error in its
// journal, the next request refused.
// DETERMINISTIC (r2, 主开发: the control read «survived» once of 86 on the .346 stack): the tools tar is padded to ~6 MB
// (one tracked tool in the throwaway worktree) — no socket buffer can hold it (a child's stdin is a socketpair: ~108 KiB
// measured here, wmem_default 208 KiB), so the write can never finish before the stub exits; the stub closes its stdin
// first; the write error may be EPIPE or ECONNRESET (a reader that leaves unread bytes resets the socket) — both are the
// death; the boot gets 120 s and «did not boot» is its own red, never read as «survived».
console.log('— §7 a paired machine that cannot be reached never stops the hub —');
{
  // B-1217 (the folded B-380f, lane lg-recovery): THE CONTROL'S DEATH WAS A RACE. Node destroys a child's stdin when the child
  // exits, and a plain destroy emits no 'error' — so the pre-fix hub died only when the kernel's EPIPE on the pending tar write
  // was handled BEFORE the child's exit was. A fake ssh that closes stdin and exits at once let either come first (red on the
  // runner at load 2.5–2.8: the exit first ⇒ nothing uncaught ⇒ the control's hub lived). The fake ssh now KEEPS ITS PROCESS for
  // LINGER7_S after closing stdin (its stderr line first, as ssh prints it): the write fails while the child lives. The release's
  // shape stays as BIN7_NOW, only for the race's own control below (a stall placed in its window).
  // THE MIRROR OF 2.369.419 (run 45633627765, Node 24): the RED CONTROL lived once — exit null, no write error, the next request
  // 200: the linger is a CLOCK, and a hub whose loop came back to the write after it saw the child's exit first. The first cure
  // (e0bbd86f0) HELD THE CHILD (its BIN7_HELD; gone since box row 839, below): it closes its stdin and stays alive until the scene RELEASES it, after the hub's death was looked
  // for — the write meets EPIPE while the child lives, whatever the box's timing; the old linger stays for the fixed hub and for
  // its own placement below (red at will under the old wait).
  // BOX ROW 839 (主开发 r4446): the second cure of this control fell at the box too — the write placed after the child said its stdin
  // closed LIVED once of three, while «the write made, then the child closes» died. No third guess at what a real pipe does: THE
  // JUDGED CONTROL's FAULT IS PLACED AT THE STREAM. What the fix guards is «an error on the child's stdin never ends the hub»: the
  // control PLANTS that error event on the stream, by the same edit of the copy, in BOTH copies — the pre-fix copy (no listener)
  // DIES of it every time; a copy of the FIXED hub with the same plant LIVES and answers the next request. THE REAL-PIPE ORDERS of the
  // pre-fix copy STAY AS OBSERVATIONS: each printed with what it did, NEVER judged (what a box does, not a law). NO NAME IS SHARED
  // between two scenes: each scene makes its own fake ssh in its own folder, with its own release, «closed», «written», calls and
  // «gone» files, all removed at its end; and the scenes run ONE AT A TIME (each awaited before the next begins).
  const LINGER7_S = 3;
  const NEVER_CLOSED7 = '[s7-control] the child never said its stdin closed';
  const PLANT_WORDS7 = 'write EPIPE (the §7 plant)';
  // a scene's own fake ssh: closes its stdin (after the hub's write, for «after-written»), says «closed», lingers / is held / exits
  // r4863 (the FOURTH FORM — the order made by the scene): «written-then-ends» waits for the copy's mark, then closes its stdin and
  // ends at once (never held: the install still answers)
  const sceneSsh = (tag, kind) => {
    const dir = path.join(ROOT, 's7-' + tag);
    fs.mkdirSync(dir, { recursive: true });
    const f = { dir, bin: path.join(dir, 'bin'), release: path.join(dir, 'release'), closed: path.join(dir, 'closed'), written: path.join(dir, 'written'), calls: path.join(dir, 'calls.log'), gone: path.join(dir, 'gone'), held: kind === 'held' || kind === 'held-after' };
    fs.mkdirSync(f.bin, { recursive: true });
    const waitWritten = kind === 'held-after' || kind === 'written-then-ends' ? `i=0; while [ ! -e '${f.written}' ] && [ $i -lt 1200 ]; do sleep 0.05; i=$((i+1)); done\n` : '';
    const stay = f.held ? `i=0; while [ ! -e '${f.release}' ] && [ $i -lt 1200 ]; do sleep 0.1; i=$((i+1)); done\n` : kind === 'linger' ? `sleep ${LINGER7_S}\n` : '';
    fs.writeFileSync(path.join(f.bin, 'ssh'), `#!/bin/sh\n${waitWritten}exec 0<&-\n: > '${f.closed}'\necho x >> '${f.calls}'\necho "ssh: Could not resolve hostname mac.example.test: Name or service not known" >&2\n${stay}: > '${f.gone}'\nexit 255\n`, { mode: 0o755 });
    return f;
  };
  // r4863: THE DEATH's OWN WORDS — the error the hub's uncaught handler printed (server.js: console.error(e), then its exit flush): its
  // first line and the next, kept whole for the judged lines (a journal's last 600 characters showed only the exit flush).
  // r5058 (a)(b): read from the ERROR STREAM ALONE (the merged journal can split a long line of the other stream around the death) and
  // only in its tail written after the install was asked (an error logged before the death's window is never the death)
  // r5058 (b), as the kit read it (run 086530a3d-20261126114046h-box): the hub's helper child (src/server/child-starter.js) SHARES its
  // error stream, and when the hub is dead the helper's own write to it fails — its «Error: write EPIPE … WriteWrap.onWriteComplete»
  // lands AFTER the hub's death line. So the death is the FIRST error line of the tail (the hub's handler prints before anything that
  // shares its stream can react to its death); every later one is printed beside it, never read as the death
  const errorLinesOf = (text) => { const L = String(text).split('\n'), o = []; for (let i = 0; i < L.length; i++) if (/^[A-Za-z]*Error(?: \[[A-Z_]+\])?: /.test(L[i])) o.push(L.slice(i, i + 2).map((x) => x.trim()).join(' ⏎ ').slice(0, 300)); return o; };
  const deathOf = (text) => errorLinesOf(text)[0] || null;
  const DRAIN_MS7 = 10000;   // r4928: the bound on a dead copy's output draining after its exit (named when it runs out)
  // r4928 (B) BESIDE (A): what the copy died of, by its death's own words — the plant, a real pipe error on the stream it writes
  // (WRITE_ERR7: a write's EPIPE / ECONNRESET, a destroyed stream), something else, or no words at all
  const deathKindOf = (d) => (!d ? 'no words' : d.includes(PLANT_WORDS7) ? 'the plant' : WRITE_ERR7.test(d) ? 'a real pipe error on the stream' : 'something else');
  const PAD7 = 6 << 20;           // the tools tar's padding: far past any socket buffer, under installAgentTools' 8 MB tar bound
  const WRITE_ERR7 = /write (?:EPIPE|ECONNRESET)|ERR_STREAM_DESTROYED/;
  // ONE SCENE: a REAL worktree server with the dead machine, its own ssh; `srcOf(scene)` gives its src/hosts.js (null: the product's)
  const deadHub = async (tag, srcOf, { expectDeath = false, kind = 'linger' } = {}) => {
    const sc = sceneSsh(tag, kind);
    const hostsSrc = srcOf ? srcOf(sc) : null;
    const wt = path.join(ROOT, 'wt-dead-' + tag);
    worktrees.add(wt);
    execFileSync('git', ['-C', REPO, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' });
    for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(REPO, f), path.join(wt, f)]); }
    if (hostsSrc) fs.writeFileSync(path.join(wt, 'src/hosts.js'), hostsSrc);
    fs.appendFileSync(path.join(wt, 'data/bin/vibespace-docs'), '\n' + ('#'.repeat(1023) + '\n').repeat(PAD7 >> 10)); // a tracked tool, never regenerated at boot
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
    fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
    fs.writeFileSync(path.join(wt, 'data/hosts.json'), JSON.stringify({ hosts: [{ id: 'h-dead', name: 'my-mac', host: 'mac.example.test', user: 'me', port: 22, transport: 'ssh', createdAt: Date.now() }] }));
    const PORT = await freePort();
    const root7 = path.join(ROOT, 'daemons', 'dead-' + tag); daemonRoots.add(root7);
    const env = { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_AGENTD_ROOT: root7, VIBESPACE_NODE_MODULES: path.join(REPO, 'node_modules'), PATH: `${sc.bin}:${process.env.PATH}` };
    const srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] }); servers.add(srv);
    let out = '', errOut = ''; srv.stdout.on('data', (d) => { out += d; }); srv.stderr.on('data', (d) => { out += d; errOut += d; });   // r5058 (a): the error stream ALSO alone
    let ends = 0; srv.stdout.on('end', () => { ends++; }); srv.stderr.on('end', () => { ends++; });   // r4928: its output DRAINED = both streams ended
    let exited = null; srv.on('exit', (c, sig) => { exited = { code: c, sig }; });
    const t0 = Date.now(); while (!out.includes('Ready.') && exited == null && Date.now() - t0 < 120000) await sleep(100);
    const bootMs = Date.now() - t0;
    const call = async (p, body) => { try { const c = new AbortController(); const tm = setTimeout(() => c.abort(), 15000); const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: c.signal }); clearTimeout(tm); let j = null; try { j = await r.json(); } catch { } return { status: r.status, j }; } catch (e) { return { status: 'NO ANSWER', err: String(e.message || e) }; } };
    const steps = {};
    const errAtInstall = errOut.length;   // r5058 (b): the death is read only in the error stream's tail written after the install was asked
    steps.install = await call('/api/hosts/h-dead/agent-tools/install', {});
    let deathWaitMs = 0;
    { const t1 = Date.now(); while (exited == null && Date.now() - t1 < (expectDeath ? 15000 : 800)) await sleep(100); deathWaitMs = Date.now() - t1; } // the control's death is AT this road
    const exitedAfterInstall = exited;
    // r4928: THE WORDS ARE READ AT THE END — a copy that died is read only after its output drained to its end (both streams ended),
    // under a named bound: never a look at a journal whose last line may not have landed
    let drained = null;
    if (exited != null) { const t3 = Date.now(); while (ends < 2 && Date.now() - t3 < DRAIN_MS7) await sleep(25); drained = ends >= 2; if (!drained) console.log(`  [harness] §7 ${tag}: the dead copy's output did not drain within ${DRAIN_MS7} ms of its exit — its words are read as they stand`); }
    if (sc.held) fs.writeFileSync(sc.release, '');   // the death was looked for: THIS scene's held child may go now
    steps.harvest = await call('/api/usage-stats/harvest-hosts', { host: 'h-dead', force: true }); await sleep(800);
    steps.slice = await call(`/api/hosts/h-dead/dir-complete?path=Doc&bases=${encodeURIComponent('["~"]')}&probe=%5B%5D&q=Doc&kind=folder`);
    steps.recent = await call('/api/hosts/h-dead/recent-cwds');
    steps.home = await call('/api/home?host=h-dead');
    steps.next = await call('/api/home');
    const r = { steps, exited, exitedAfterInstall, deathWaitMs, bootMs, drained, ready: out.includes('Ready.'), writeErr: (out.match(WRITE_ERR7) || [''])[0], neverClosed: out.includes(NEVER_CLOSED7), planted: out.includes(PLANT_WORDS7), death: deathOf(errOut.slice(errAtInstall)), errorLines: errorLinesOf(errOut.slice(errAtInstall)), journal: () => out };
    try { srv.kill('SIGKILL'); } catch { }
    // THE SCENE ENDS: its ssh gone (its own «gone» file, bounded), then every file of the scene removed — nothing reaches the next scene
    { const t2 = Date.now(); while (!fs.existsSync(sc.gone) && Date.now() - t2 < 5000) await sleep(50); r.sshGone = fs.existsSync(sc.gone); }
    r.plantReached = fs.existsSync(sc.written);   // r5058 (c): the copy's own mark that its planted write ran — read before the folder goes
    try { fs.rmSync(sc.dir, { recursive: true, force: true }); } catch { }
    return r;
  };
  try {
    const fixed = await deadHub('fixed', null);
    const s = fixed.steps;
    ok(fixed.ready, `§7 the hub with a dead paired machine boots (${fixed.bootMs} ms)`, fixed.journal().slice(-600));
    ok(s.install.status === 400 && /my-mac cannot be reached/.test(s.install.j?.error || '') && s.harvest.status === 200 && s.harvest.j?.hosts?.['h-dead']?.error && /my-mac cannot be reached/.test(s.harvest.j.hosts['h-dead'].error),
      '§7 the stdin roads answer with the machine BY NAME (a ~6 MB tools tar → 400 «my-mac cannot be reached — ssh: …»; the usage harvest names it per machine)', JSON.stringify({ install: s.install, harvest: s.harvest }).slice(0, 600));
    ok(s.slice.j?.unreachable?.host === 'my-mac' && /Could not resolve hostname/.test(s.slice.j.unreachable.line) && s.recent.j?.unreachable?.host === 'my-mac' && s.home.status === 400 && s.home.j?.code === 'host-unreachable',
      '§7 the host rung refuses it BY NAME before any listing spawns (dir-complete + recent-cwds say `unreachable`; its home is a 400 host-unreachable)', JSON.stringify({ slice: s.slice.j, recent: s.recent.j, home: s.home }).slice(0, 600));
    ok(s.next.status === 200 && fixed.exited == null && !fixed.writeErr, '§7 …and the hub answers the NEXT request (alive, no stream write error in its journal)', JSON.stringify({ next: s.next.status, exited: fixed.exited, writeErr: fixed.writeErr, tail: fixed.journal().slice(-400) }));
    const src7 = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
    const LISTENER7 = "  stdin.on('error', (e) => { if (!fed.error) fed.error = e; });\n";
    const preFix7 = src7.replace(LISTENER7, '');
    const STALL7 = "  try { if (bytes == null) stdin.end(); else stdin.end(bytes); } catch (e) { if (!fed.error) fed.error = e; }\n";
    const BODY7 = 'try { if (bytes == null) stdin.end(); else stdin.end(bytes); } catch (e) { if (!fed.error) fed.error = e; }';
    // (A) THE PLANT: right after the one write of feedStdin, the stream's own 'error' event, placed — no pipe, no clock decides it
    // r4863 (THE FOURTH FORM, the order made by the scene): right after the write the copy writes ITS SCENE's mark, then queues the
    // plant on this turn's next tick. The scene's child closes its stdin only after it sees the mark, and the hub hears of that close
    // only in a later turn of its loop — so no real pipe error can come before the planted one (the third form let the child close at
    // once: a write that met the closed pipe queued the REAL error first, and the copy died of it — the hosted red of 2.369.420's proof)
    const PLANT_CALL7 = `process.nextTick(() => stdin.emit('error', Object.assign(new Error(${JSON.stringify(PLANT_WORDS7)}), { code: 'EPIPE', syscall: 'write' })));`;
    const PLANT7 = (sc) => STALL7 + `  require('fs').writeFileSync(${JSON.stringify(sc.written)}, ''); ${PLANT_CALL7} /* the §7 plant: the error the fix guards, placed at the stream — after the scene's mark */\n`;
    const plantedPre7 = (sc) => (preFix7.includes(STALL7) ? preFix7.replace(STALL7, PLANT7(sc)) : null);
    const plantedFixed7 = (sc) => (src7.includes(STALL7) ? src7.replace(STALL7, PLANT7(sc)) : null);
    // (B) THE REAL-PIPE ORDERS of the pre-fix copy, each a form written whole (one template a form, r1632) — observed, never judged
    const WHEN_CLOSED7 = (sc, inner) => `(function w7(n) { if (require('fs').existsSync(${JSON.stringify(sc.closed)})) { ${inner} } else if (n >= 400) { console.warn(${JSON.stringify(NEVER_CLOSED7)}); ${inner} } else setTimeout(() => w7(n + 1), 25); })(0);`;
    const EXIT_FORM7 = `  child.once('exit', () => { ${BODY7} }); /* B-1217: the write only after the child's exit */\n`;
    const CLOSED_FORM7 = (sc) => `  ${WHEN_CLOSED7(sc, BODY7)} /* box row 823: the write only after the child said its stdin closed */\n`;
    const WRITTEN_FORM7 = (sc) => `  ${BODY7} require('fs').writeFileSync(${JSON.stringify(sc.written)}, ''); /* box row 823's order: the write MADE, then the child closes */\n`;
    const formOf = (form) => (sc) => preFix7.replace(STALL7, typeof form === 'function' ? form(sc) : form);
    // r4863: THE THIRD FORM's ORDER, PLACED — the write made only after the child said its stdin closed, the plant queued behind it
    // (observed below with its death's words, never judged)
    const OLD_ORDER7 = (sc) => preFix7.replace(STALL7, `  ${WHEN_CLOSED7(sc, BODY7 + ' ' + PLANT_CALL7)} /* the third form's order, placed: the write after the close, the plant behind it */\n`);
    const compiles7 = (src) => { try { new (require('node:vm').Script)('(function (exports, require, module, __filename, __dirname) {' + src + '\n})', { filename: 'hosts-copy.js' }); return true; } catch (e) { return String(e && e.message); } };
    const probe7 = { closed: '/tmp/s7-probe-closed', written: '/tmp/s7-probe-written' };   // the compile checks' stand-in paths (never written)
    ok(preFix7 !== src7 && preFix7.includes(STALL7) && !!plantedPre7(probe7) && !!plantedFixed7(probe7) && plantedPre7(probe7).includes(PLANT7(probe7)) && plantedFixed7(probe7).includes(PLANT7(probe7)) && plantedFixed7(probe7).includes(LISTENER7) && !plantedPre7(probe7).includes(LISTENER7),
      '§7 the copies take their edits: the listener gone from the pre-fix copy, the plant beside the one write of feedStdin in BOTH copies, each form written whole');
    ok(compiles7(plantedPre7(probe7)) === true && compiles7(plantedFixed7(probe7)) === true && compiles7(OLD_ORDER7(probe7)) === true && compiles7(formOf(EXIT_FORM7)(probe7)) === true && compiles7(formOf(CLOSED_FORM7)(probe7)) === true && compiles7(formOf(WRITTEN_FORM7)(probe7)) === true,
      '§7 …and every copy of src/hosts.js COMPILES (a copy that does not parse is red here, by name — never a hub that silently never boots)',
      { plantedPre: compiles7(plantedPre7(probe7)), plantedFixed: compiles7(plantedFixed7(probe7)), oldOrder: compiles7(OLD_ORDER7(probe7)), exitForm: compiles7(formOf(EXIT_FORM7)(probe7)), closedForm: compiles7(formOf(CLOSED_FORM7)(probe7)), writtenForm: compiles7(formOf(WRITTEN_FORM7)(probe7)) });
    const broken7 = preFix7.replace(STALL7, `  child.once('exit', (() => { ${BODY7} }); /* the form 3837f878c wrote */\n`);
    ok(compiles7(broken7) !== true, `§7 CONTROL of the compile check: the form 3837f878c wrote (its exit call never closed) does NOT compile — «${compiles7(broken7)}»`);
    // (A) THE JUDGED CONTROL — one scene pair, the error planted at the stream
    const ctl = await deadHub('planted-prefix', (sc) => plantedPre7(sc), { expectDeath: true, kind: 'written-then-ends' });
    ok(ctl.ready, `§7 RED CONTROL setup: the pre-fix copy with the plant booted (${ctl.bootMs} ms — «did not boot» is this red, never «survived»)`, ctl.journal().slice(-600));
    // r4928 THE LAW THE CONTROL PROVES: «a hub that does not listen dies of an error on the child's stdin» — the planted error (A: the
    // order made by the scene puts it first) OR a real pipe error on that same stream proves it, each named by the death's own words,
    // read after the copy's output drained; red when the copy lived, died of something else, or died with no words
    const ctlKind = deathKindOf(ctl.death);
    // r5429 (主开发, the token of r5125 — law 1: a control is judged on a WITNESS its plant was in force): the copy's own mark that its
    // planted write ran (plantReached) is part of the verdict, never only said — a copy that died before its plant proves nothing
    ok(ctl.plantReached === true && ctl.exitedAfterInstall != null && ctl.exitedAfterInstall.code === 1 && (ctlKind === 'the plant' || ctlKind === 'a real pipe error on the stream') && ctl.steps.next.status === 'NO ANSWER',
      `§7 RED CONTROL: the same hub with a feedStdin that does not listen DIES of an 'error' on the child's stdin — of ${ctlKind}, by its death's own words «${ctl.death || 'no error line printed'}» (its output ${ctl.drained === true ? 'drained to its end' : ctl.drained === false ? `NOT DRAINED in ${DRAIN_MS7} ms` : 'not asked'}, ${ctl.plantReached ? (ctl.exitedAfterInstall == null ? 'it SURVIVED the plant' : 'the plant was reached') : 'the plant was NEVER reached'}, ${ctl.errorLines.length > 1 ? `then ${ctl.errorLines.length - 1} more error line(s) on its stream after the death, never read as it «${ctl.errorLines.slice(1).join(' | ').slice(0, 240)}», ` : ''}exit ${JSON.stringify(ctl.exitedAfterInstall)}, looked for ${ctl.deathWaitMs} ms, the stream's write error «${ctl.writeErr}», the next request ${ctl.steps.next.status})`, `${ctl.death || '(no death line)'}\n${ctl.journal().slice(-600)}`);
    const live = await deadHub('planted-fixed', (sc) => plantedFixed7(sc), { expectDeath: true, kind: 'written-then-ends' });
    ok(live.ready && live.plantReached === true && live.exitedAfterInstall == null && live.exited == null && live.steps.next.status === 200,
      `§7 …and the FIXED hub with the SAME plant LIVES and answers the next request (${live.plantReached ? 'the plant reached' : 'the plant NEVER reached'}, exit ${JSON.stringify(live.exited)}, the install ${live.steps.install.status}, the next request ${live.steps.next.status})`, live.journal().slice(-600));
    // r4863: THE THIRD FORM's ORDER, PLACED — OBSERVED, NEVER JUDGED. The lane first judged it «dies of the REAL pipe error first»: on
    // the box (Node 24, two tries of run 18f78a0f3-20261126070603h-box) it died of the PLANT even with the write after the close — a
    // write's own failure reaches its 'error' at least two ticks later, behind the plant's one. What killed the hosted copy is not
    // known (its death's words were never kept); this form keeps them, so its next reading names it. Printed with its death's words
    { const old = await deadHub('old-order', OLD_ORDER7, { expectDeath: true, kind: 'held' });
      console.log(`  ⊙ §7 observed, not judged — the third form's order placed (the write after the child said its stdin closed, the plant behind it): exit ${JSON.stringify(old.exitedAfterInstall)}, looked for ${old.deathWaitMs} ms, its death's own words «${old.death || 'no error line printed'}», next ${old.steps.next.status}`); }
    // (B) THE REAL-PIPE ORDERS, OBSERVED: each printed with what it did, never judged
    const observe = async (tag, srcOf, kind, words) => {
      const o = await deadHub(tag, srcOf, { expectDeath: true, kind });
      console.log(`  ⊙ §7 observed, not judged — the pre-fix write ${words}: exit ${JSON.stringify(o.exitedAfterInstall)}, looked for ${o.deathWaitMs} ms, «${o.writeErr}», its death's own words «${o.death || '—'}», next ${o.steps.next.status}${o.neverClosed ? `, «${NEVER_CLOSED7}»` : ''}${o.sshGone ? '' : ', its ssh not gone in 5 s'}`);
    };
    await observe('at-once', () => preFix7, 'linger', `made AT ONCE (the release's control; the ssh lingers ${LINGER7_S} s)`);
    await observe('after-closed', formOf(CLOSED_FORM7), 'held', 'made after the child said its stdin closed, the child held');
    await observe('after-exit', formOf(EXIT_FORM7), 'now', "made at the child's exit (B-1217's race)");
    await observe('written-then-closed', formOf(WRITTEN_FORM7), 'held-after', 'made, THEN the child closes its stdin, the child held (box row 823)');
  } catch (e) { ok(false, '§7 the dead-machine leg ran', String((e && e.stack) || e).slice(0, 600)); }
}

// ── §tree THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\n§tree the patched copies never touch the tree');
for (const r of copiesCensus(MUTR.files, MUTR.dir, REPO, { minCopies: 2, match: /session-stdout\.__\w+_control\.js/ })) ok(r.pass, '§tree ' + r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(fail ? `\nFAIL (${fail} failed, ${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
