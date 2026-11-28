#!/usr/bin/env node
// THE node-pty DUCKS (B-ae4b — fast twin of test-restore-liveness §6).
//
// setupSessionPty registers TWO data listeners on every pty it wires: the
// LIVENESS STAMP first (`session._lastPtyDataAt`, read only through
// `ptyQuietSince`), then the protocol consumer. node-pty keeps a listener SET;
// three of the four ducks that stand in for it kept ONE slot, so the consumer
// REPLACED the stamp — the measured failure mode is a dropped STAMP, not a dead
// consumer: `ptyQuietSince` reads "silent" for a bridge that is relaying bytes.
//   · src/ws-create.js     the R6 device-pipe create shim   (one slot)
//   · src/server/boot-restore.js  the R6 boot re-open shim  (one slot, verbatim twin)
//   · src/server/opencode-pty-bridge.js  the serve terminal (one slot + a
//     pre-listener HOLD that flushed the banner into the stamp only — the
//     terminal opened blank, the very bug that hold was written to fix)
//   · src/server/dial-pairing.js daemonPtyShim             (already a SET)
// The healer consequence (§4) is why the stamp matters on the R6 create path.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this script runs on a temp home of its own before any of its code

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { scratch, anchored } = await import(path.join(REPO, 'scripts/scratch.mjs'));

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? `\n      ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : '')); } };
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
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');

const ROOT = scratch('pty-duck');
fs.mkdirSync(path.join(ROOT, 'buffers'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'meta'), { recursive: true });
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });

let duck = null;
try { duck = require(path.join(REPO, 'src/pty-duck.js')); } catch (e) { duck = null; }

// ── § 1 THE PURE LISTENER SET ───────────────────────────────────────────────
console.log('— §1 ptyListeners is a listener SET (and its hold reaches every early registrant) —');
ok(!!duck && typeof duck.ptyListeners === 'function' && typeof duck.pipePtyShim === 'function',
  'src/pty-duck.js exports ptyListeners + pipePtyShim (the ONE listener half of every non-node-pty duck)');
if (duck) {
  const L = duck.ptyListeners();
  const seen = [];
  const d1 = L.on((v) => seen.push('a:' + v));
  L.on((v) => seen.push('b:' + v));
  L.emit('x');
  ok(seen.join(',') === 'a:x,b:x', 'two listeners → both fire, in registration order', seen.join(','));
  d1.dispose(); seen.length = 0; L.emit('y');
  ok(seen.join(',') === 'b:y', 'dispose() removes only its OWN listener', seen.join(','));
  const T = duck.ptyListeners(); const tseen = [];
  T.on(() => { throw new Error('boom'); }); T.on((v) => tseen.push(v)); T.emit('z');
  ok(tseen.join() === 'z', 'a throwing listener never starves the next one');

  const H = duck.ptyListeners({ hold: 3 }); const hs = [];
  H.emit('banner'); H.emit('prompt$ ');
  H.on((v) => hs.push('stamp:' + v));        // setupSessionPty registers the stamp…
  H.on((v) => hs.push('consumer:' + v));     // …and the consumer in the SAME tick
  H.emit('live');                            // a byte arriving while the replay is queued keeps its place
  await sleep(0);
  ok(hs.filter((s) => s.startsWith('consumer:')).join('|') === 'consumer:banner|consumer:prompt$ |consumer:live',
    'hold: the held banner reaches the CONSUMER registered second (a one-slot hold flushed it into the stamp only)', hs);
  ok(hs.filter((s) => s.startsWith('stamp:')).length === 3, 'hold: …and the stamp saw every held byte too', hs);
  const B = duck.ptyListeners({ hold: 2 }); for (let i = 0; i < 10; i++) B.emit(String(i)); const bs = []; B.on((v) => bs.push(v)); await sleep(0);
  ok(bs.join() === '0,1', 'hold is BOUNDED (a consumer that never arrives cannot grow memory)', bs);
  const E = duck.ptyListeners({ hold: 5 }); const es = []; E.on((v) => es.push(v)); E.emit('now');
  ok(es.join() === 'now', 'nothing held ⇒ the first listener stops the holding (live bytes are delivered synchronously)', es);

  const h = { pid: 0, write() { }, kill() { h.killed = true; } };
  const s = duck.pipePtyShim(h); const ps = [];
  s.onData((v) => ps.push('1' + v)); s.onData((v) => ps.push('2' + v)); const px = []; s.onExit((e) => px.push(e.exitCode)); s.onExit((e) => px.push(e.exitCode));
  h.onData(Buffer.from('q')); h.onExit(undefined);
  ok(ps.join() === '1q,2q' && px.join() === '0,0' && s.pid === -1, 'pipePtyShim: every data AND exit listener fires (Buffer → utf-8, exit code defaults to 0, pid -1 when absent)', { ps, px, pid: s.pid });
}

// ── § 2 EVERY DUCK THROUGH THE REAL setupSessionPty ────────────────────────
console.log('— §2 each duck carries BOTH the liveness stamp and the consumer through the real setupSessionPty —');
const dial = require(path.join(REPO, 'src/server/dial-pairing.js')).create({
  rootDir: REPO, AGENTD_DIR: path.join(ROOT, 'agentd-dir'), agentdHostToken: () => 'vsht_test',
  getHosts: () => null, getMounts: () => null, getMachineMounts: () => null,
  getPortForwards: () => null, getExitProxy: () => null,
});
const activeSessions = new Map();
const frames = [];
const eng = require(path.join(REPO, 'src/server/session-stdout.js')).create({
  rootDir: REPO, BUFFERS_DIR: path.join(ROOT, 'buffers'), META_DIR: path.join(ROOT, 'meta'),
  DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: '', CLAUDE_STREAM_TYPES: new Set(), _seenStreamTypes: new Set(),
  activeSessions, engine: {}, checkClaudeGoalStatus: () => { },
  broadcastToSession: (s, id, m) => frames.push({ id, ...m }), broadcastActiveSessions: () => { },
  noteModelSeen: () => { }, noteHarnessModels: () => { }, recordUsageAttribution: () => { },
  daemonPtyShim: dial.daemonPtyShim, agentEnv: () => process.env, sbSeenFirst: () => { },
  getDeviceMgr: () => null, getHosts: () => null, getUsageHistory: () => null, getTelemetry: () => null,
  getNoConvoRef: () => null, getDeliver: () => null, getPages: () => null, getPermissionRules: () => null,
});
const outOf = (id) => frames.filter((f) => f.id === id && f.type === 'output').map((f) => f.data).join('');
let seq = 0;
function wire(ptyDuck) {
  const id = 'sess-duck-' + (++seq);
  const session = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: null, cwd: ROOT };
  activeSessions.set(id, session);
  eng.setupSessionPty(session, id, ptyDuck);
  return { id, session };
}
async function throughSetup(label, mkDuck) {
  const h = { pid: 7, write() { }, resize() { }, kill() { } };
  const d = mkDuck(h);
  const { id, session } = wire(d);
  await sleep(0);
  const t0 = Date.now();
  h.onData(Buffer.from(`hello-${label}`));
  ok(verdictOf(outOf(id).includes(`hello-${label}`)), `${label}: the consumer streams the byte`, outOf(id));
  ok(eng.ptyQuietSince(session, t0) === false, `${label}: …AND the liveness stamp saw it (ptyQuietSince reads ALIVE)`, { stamp: session._lastPtyDataAt, t0 });
  activeSessions.delete(id);
}
await throughSetup('daemonPtyShim', (h) => dial.daemonPtyShim(h));
if (duck) await throughSetup('pipePtyShim (R6 create + R6 boot re-open)', (h) => duck.pipePtyShim(h));

// NEGATIVE CONTROL — the pre-fix one-slot literal (verbatim from ws-create /
// boot-restore @348aa226) through the SAME setupSessionPty: the consumer lives,
// the STAMP is gone. This is the failure mode, measured, not the one the old
// comments claimed (they said the consumer would die).
{
  const h = { pid: 7, write() { }, kill() { } };
  const oneSlot = {
    pid: h.pid || -1,
    onData: (cb) => { h.onData = (buf) => cb(buf.toString('utf-8')); },
    onExit: (cb) => { h.onExit = (code) => cb({ exitCode: code ?? 0 }); },
    write: (str) => { try { h.write(str); } catch { } }, resize: () => { }, kill: () => { try { h.kill(); } catch { } },
  };
  const { id, session } = wire(oneSlot);
  const t0 = Date.now();
  h.onData(Buffer.from('hello-oneslot'));
  ok(verdictOf(outOf(id).includes('hello-oneslot')), 'CONTROL (pre-fix one-slot duck): the consumer still streams — the last registration won');
  ok(eng.ptyQuietSince(session, t0) === true && session._lastPtyDataAt === undefined,
    'CONTROL (pre-fix one-slot duck): the STAMP was dropped — ptyQuietSince reads "silent" for a bridge relaying bytes', { stamp: session._lastPtyDataAt });
  activeSessions.delete(id);
}

// The OpenCode serve terminal, over a real mock serve + a real websocket: the
// serve greets the socket before the session layer registers anything.
{
  const { startMockServe, createMockState } = await import(path.join(REPO, 'scripts/dev/mock-opencode-serve.mjs'));
  const serve = require(path.join(REPO, 'src/opencode-serve.js'));
  const mock = await startMockServe({ state: createMockState(), pty: true });
  try {
    const client = new serve.OpencodeServeClient(mock.url);
    const locator = { client: async () => client, ensure: async () => client, state: () => ({ ready: true, installed: true, parked: false, lastError: null, caps: { fork: true }, version: '1.18.29' }), invalidate: () => { }, _client: client };
    const facts = serve.createFacts(locator, { log: { warn() { } } });
    require(path.join(REPO, 'src/server/opencode-access.js')).create({ facts, hosts: null });
    const bridge = await require(path.join(REPO, 'src/server/opencode-pty-bridge.js')).openOpencodePty({ cwd: '/work/alpha', title: 'duck', log: { warn() { } } });
    await sleep(500);                                    // the banner arrives BEFORE any listener (the create is still in flight)
    const { id, session } = wire(bridge.shim);           // stamp + terminal consumer, registered in one tick
    await sleep(300);
    ok(verdictOf(outOf(id).includes('mock-shell$')), 'opencode serve terminal: the banner held before the listeners existed reaches the CONSUMER (the one-slot hold gave it to the stamp and the terminal opened blank)', outOf(id));
    ok(Number(session._lastPtyDataAt) > 0, 'opencode serve terminal: …and the liveness stamp saw it too', { stamp: session._lastPtyDataAt });
    const t0 = Date.now();
    const serverSide = mock.state.ptySockets.find((x) => x.id === bridge.ptyId);
    serverSide?.ws.send('later-bytes');                   // the serve's shell prints something after the replay
    for (let i = 0; i < 40 && !outOf(id).includes('later-bytes'); i++) await sleep(50);
    ok(gateOf(outOf(id).includes('later-bytes')) && eng.ptyQuietSince(session, t0) === false,
      'opencode serve terminal: a LIVE byte after the replay reaches the consumer AND stamps (both stay registered)', { out: outOf(id), stamp: session._lastPtyDataAt, t0, sock: !!serverSide });
    const exits = []; bridge.shim.onExit((e) => exits.push(e)); bridge.shim.onExit((e) => exits.push(e));
    activeSessions.delete(id);
    bridge.shim.kill(); await sleep(250);
    ok(exits.length === 2, 'opencode serve terminal: every onExit listener fires on kill (a SET, like node-pty)', exits);
  } finally { await mock.close(); }
}

// ── § 3 THE CENSUS: no one-slot duck literal anywhere in the server tree ────
console.log('— §3 census: no one-slot pty duck remains, and every former site uses the shared SET —');
const ONE_SLOT = /on(?:Data|Exit)\s*:\s*\(\s*cb\s*\)\s*=>\s*\{?\s*[\w.]+\s*=(?!=)/;
{
  const files = ['server.js'];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const p = dir + '/' + e.name;
      if (e.isDirectory()) { if (e.name !== 'lib') walk(p); } else if (/\.(c?js|mjs)$/.test(e.name)) files.push(p);
    }
  })('src');
  const hits = [];
  for (const f of files) read(f).split('\n').forEach((l, i) => { if (!/^\s*(\/\/|\*)/.test(l) && ONE_SLOT.test(l)) hits.push(`${f}:${i + 1}: ${l.trim().slice(0, 90)}`); });
  // a multi-line literal (`onData: (cb) => {\n  onData = cb;`) is caught on the joined text too
  const multi = files.filter((f) => /on(?:Data|Exit)\s*:\s*\(\s*cb\s*\)\s*=>\s*\{\s*\n\s*on(?:Data|Exit)\s*=\s*cb\b/.test(read(f)));
  ok(hits.length === 0 && multi.length === 0, `no one-slot onData/onExit duck in ${files.length} server-side files`, [...hits, ...multi]);
  ok(gateOf(ONE_SLOT.test("onData: (cb) => { h.onData = (buf) => cb(buf.toString('utf-8')); },")) && gateOf(ONE_SLOT.test('onExit: (cb) => { onExit = cb; },'))
    && gateOf(/on(?:Data|Exit)\s*:\s*\(\s*cb\s*\)\s*=>\s*\{\s*\n\s*on(?:Data|Exit)\s*=\s*cb\b/.test('onData: (cb) => {\n      onData = cb;'))
    && !ONE_SLOT.test('onData: (cb) => data.on(cb),'),
  'CENSUS CONTROL: the three shipped one-slot shapes trip it, the shared SET does not');
  const wsc = read('src/ws-create.js'), br = read('src/server/boot-restore.js'), oc = read('src/server/opencode-pty-bridge.js');
  ok(gateOf(/pipePtyShim\(r6Handle\)/.test(wsc)) && verdictOf(/require\('\.\/pty-duck'\)/.test(wsc)), 'WIRING PIN: ws-create\'s R6 create path builds its duck with pipePtyShim');
  ok(gateOf(/pipePtyShim\(h\)/.test(br)) && verdictOf(/require\('\.\.\/pty-duck'\)/.test(br)), 'WIRING PIN: boot-restore\'s R6 re-open builds its duck with pipePtyShim');
  ok(gateOf(/ptyListeners\(\{ hold: 500 \}\)/.test(oc)) && verdictOf(/require\('\.\.\/pty-duck'\)/.test(oc)), 'WIRING PIN: the OpenCode serve terminal holds its early bytes in a ptyListeners SET (bound 500)');
  ok(verdictOf(/ptyListeners\(\)/.test(read('src/server/dial-pairing.js'))), 'WIRING PIN: daemonPtyShim shares the same SET');
}

// ── § 4 THE HEALER ON AN R6 PIPE SESSION (B-b675) ──────────────────────────
// ws-create kept `socketPath` on an R6 session (the cw-* path it never
// creates), so ws-handler's broken-stdin detector armed on every input: no
// `_stdin_ack` in 5 s and ptyQuietSince(sentAt) ⇒ reattachLocalPty — whose
// first act is session.pty.kill(), i.e. the daemon's `kill-pipe-session`: a
// late ack and 5 s of quiet ended a healthy pipe. The fix nulls the socketPath
// in the r6Handle branch (as the ocPty branch does) and the healer REFUSES a
// pipe duck (`_pipe`) as the belt. A dial (remote) session never rides these
// ducks: it is a LOCAL dtach whose program talks to the device through the
// DialSessionBridge (node-pty, or daemonPtyShim after a restore) — and a
// daemonPtyShim relays a real `dtach -a`, so it stays healable (the attach
// probe's job). CONTROL: a copy of session-stdout without the refusal kills it.
console.log('— §4 the healer on an R6-shaped session: it refuses the pipe duck (B-b675); the control kills it —');
{
  const SS = read('src/server/session-stdout.js');
  const BELT = /^\s*if \(session\.pty && session\.pty\._pipe\) \{[^\n]*return false; \}\n/m;
  const noBelt = editAnchor(SS, BELT, '', "src/server/session-stdout.js");
  ok(noBelt !== SS, 'control setup: the copy lost exactly the healer\'s pipe-duck refusal');
  const MUT = (await import(path.join(REPO, 'scripts/mutant-copy.mjs'))).mutantCopies('pty-duck', REPO);
  const engOf = (mod) => mod.create({
    rootDir: REPO, BUFFERS_DIR: path.join(ROOT, 'buffers'), META_DIR: path.join(ROOT, 'meta'),
    DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: '', CLAUDE_STREAM_TYPES: new Set(), _seenStreamTypes: new Set(),
    activeSessions, engine: {}, checkClaudeGoalStatus: () => { }, broadcastToSession: () => { }, broadcastActiveSessions: () => { },
    noteModelSeen: () => { }, noteHarnessModels: () => { }, recordUsageAttribution: () => { },
    daemonPtyShim: dial.daemonPtyShim, agentEnv: () => process.env, sbSeenFirst: () => { },
    getDeviceMgr: () => null, getHosts: () => null, getUsageHistory: () => null, getTelemetry: () => null,
    getNoConvoRef: () => null, getDeliver: () => null, getPages: () => null, getPermissionRules: () => null,
  });
  const leg = (E, tag) => {
    const h = { pid: 9, write() { }, kill() { h.killed = (h.killed || 0) + 1; } };
    const d = duck ? duck.pipePtyShim(h) : { onData() { }, onExit() { }, kill() { h.kill(); }, write() { } };
    const id = 'sess-duck-r6-' + tag;
    const session = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: path.join(ROOT, 'cw-never-created'), cwd: ROOT };
    activeSessions.set(id, session);
    E.setupSessionPty(session, id, d);
    let healed = false, err = null;
    try { healed = E.reattachLocalPty(id, session, 'test: no ack within 5 s'); } catch (e) { err = e; }
    activeSessions.delete(id);                                           // the replacement's exit must not tear down a stub engine
    try { if (session.pty !== d) session.pty?.kill?.(); } catch { }
    return { healed, killed: h.killed || 0, still: session.pty === d, err: err && err.message };
  };
  const fixed = leg(eng, 'fix');
  ok(fixed.healed === false && fixed.killed === 0 && verdictOf(fixed.still), 'the healer REFUSES an R6 pipe duck: nothing is killed, the pipe stays the session\'s bridge (B-b675)', fixed);
  const ctl = leg(engOf(MUT.load('src/server/session-stdout.js', noBelt, 'nobelt')), 'ctl');
  if (ctl.err && /ENOENT|spawn/i.test(ctl.err)) console.log(`  - SKIP: dtach is not installed here (${ctl.err}) — the control leg needs it`);
  else ok(ctl.healed === true && ctl.killed === 1, 'CONTROL: without the refusal the healer KILLS the pipe handle (a false "silent" verdict ends a healthy session — the pre-fix shape)', ctl);
  const wsc = read('src/ws-create.js');
  const r6 = (/\} else if \(r6Handle\) \{([\s\S]*?)setupSessionPty\(session, id, pipePtyShim\(r6Handle\)\);/.exec(wsc) || [])[1] || '';
  ok(verdictOf(/^\s*session\.socketPath = null;/m.test(r6)), 'ws-create\'s r6Handle branch nulls the socketPath it never creates (the braces: no detector, no dead-bridge watch on a pipe)');
  ok(verdictOf(/^\s*_pipe: true,/m.test(read('src/pty-duck.js'))), 'pipePtyShim marks its duck `_pipe` (what the healer refuses)');
}

// ── § 5 A BRIDGE'S LIFE SIGNS ARE ITS OWN (B-1217, lane lg-recovery) ──────────────
// setupSessionPty stamped `_lastPtyDataAt` from ANY pty it ever wired, and a bridge's birth could share a millisecond with its
// predecessor's last byte (ptyQuietSince reads that tie as «spoke»). So a killed dtach client's goodbye («[detached]», which
// dtach's attach client prints when it is ended — the shape test-fork-groups records), landing AFTER the new bridge's birth,
// made the new bridge read «it spoke»: B-c20d's hold of what a person typed and the never-spoke detector stood down for exactly
// the bridge they guard, and the dead-bridge watch read it alive — after a heal the held keystrokes were not replayed. The pair
// of stand-ins below goes through the REAL setupSessionPty / writeSessionInput / reattachLocalPty; the RED is a copy of the
// release's two lines.
console.log('— §5 a bridge\'s life signs are its own: a replaced bridge\'s goodbye never speaks for its successor (B-1217) —');
{
  const SS = read('src/server/session-stdout.js');
  const CURE = "  session._ptyOpenedAt = Math.max(Date.now(), (Number(session._lastPtyDataAt) || 0) + 1);";
  const STAMP = "  ptyProcess.onData(() => { if (session.pty === ptyProcess) session._lastPtyDataAt = Math.max(Date.now(), Number(session._ptyOpenedAt) || 0); });";
  ok(gateOf(SS.includes(CURE)) && verdictOf(SS.includes(STAMP)), 'the two lines stand in setupSessionPty (the birth after the predecessor\'s last byte; the stamp only from the current bridge, never dated before its birth)');
  const releaseSS = anchored(anchored(SS, CURE, '  session._ptyOpenedAt = Date.now();' /* stale-pins: kept — the release's line, this control's plant */, 'release: the birth at now'),
    STAMP, '  ptyProcess.onData(() => { session._lastPtyDataAt = Date.now(); });' /* stale-pins: kept — the release's line, this control's plant */, 'release: any pty stamps');
  const MUT5 = (await import(path.join(REPO, 'scripts/mutant-copy.mjs'))).mutantCopies('pty-duck-b1217', REPO);
  // the heal's new attach: a stand-in for `dtach -a` that takes the replay and says nothing (the leg reads what the heal HOLDS for it)
  const STANDIN = path.join(ROOT, 'stand-in-dtach'); fs.writeFileSync(STANDIN, '#!/bin/sh\nexec sleep 30\n', { mode: 0o755 });
  const SOCK = path.join(ROOT, 'cw-b1217-never-created');
  const engFrom = (mod) => mod.create({
    rootDir: REPO, BUFFERS_DIR: path.join(ROOT, 'buffers'), META_DIR: path.join(ROOT, 'meta'),
    DTACH_CMD: STANDIN, USAGE_SCANNER_PATH: '', CLAUDE_STREAM_TYPES: new Set(), _seenStreamTypes: new Set(),
    activeSessions, engine: {}, checkClaudeGoalStatus: () => { }, broadcastToSession: () => { }, broadcastActiveSessions: () => { },
    noteModelSeen: () => { }, noteHarnessModels: () => { }, recordUsageAttribution: () => { },
    daemonPtyShim: dial.daemonPtyShim, agentEnv: () => process.env, sbSeenFirst: () => { },
    getDeviceMgr: () => null, getHosts: () => null, getUsageHistory: () => null, getTelemetry: () => null,
    getNoConvoRef: () => null, getDeliver: () => null, getPages: () => null, getPermissionRules: () => null,
  });
  const E5 = engFrom(require(path.join(REPO, 'src/server/session-stdout.js'))), R5 = engFrom(MUT5.load('src/server/session-stdout.js', releaseSS, 'release'));
  // r1676: f28ff4de8's stamp (no floor at the birth) — the RED of the clock stepped back
  const noFloorSS = anchored(SS, STAMP, '  ptyProcess.onData(() => { if (session.pty === ptyProcess) session._lastPtyDataAt = Date.now(); });' /* stale-pins: kept — f28ff4de8's line, this control's plant */, 'no floor at the birth');
  const NF5 = engFrom(MUT5.load('src/server/session-stdout.js', noFloorSS, 'no-floor'));
  // a local stand-in (node-pty's listener SET) or a paired machine's bridge (dial.daemonPtyShim over a handle) — each with a way to speak
  const local = () => { const L = duck.ptyListeners(); return { pty: { pid: 11, onData: (cb) => L.on(cb), onExit: () => ({ dispose() { } }), write() { }, resize() { }, kill() { } }, say: (t) => L.emit(t) }; };
  const paired = () => { const h = { pid: 12, write() { }, resize() { }, kill() { } }; const p = dial.daemonPtyShim(h); return { pty: p, say: (t) => h.onData(Buffer.from(t)) }; };
  const GOODBYE = '\x1b[999H\r\n[detached]\r\n';
  let n5 = 0;
  // A speaks, B is wired in its place (the heal's wiring), A's goodbye lands AFTER B's birth, a person types, then the heal
  const scene = async (E, mk, { frozen = false } = {}) => {
    const id = 'sess-b1217-' + (++n5);
    const session = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: SOCK, cwd: ROOT };
    activeSessions.set(id, session);
    const realNow = Date.now, T = realNow();
    if (frozen) Date.now = () => T;                    // a stall placed: the whole replacement inside ONE millisecond
    const r = {};
    try {
      const A = mk(); E.setupSessionPty(session, id, A.pty); A.say('prompt$ '); r.lastReal = session._lastPtyDataAt;
      const B = mk(); E.setupSessionPty(session, id, B.pty);
      let C = null;
      if (frozen) { C = mk(); E.setupSessionPty(session, id, C.pty); }   // replaced TWICE in that millisecond
      if (!frozen) await sleep(5);                        // the goodbye comes on a later turn, after the new birth
      A.say(GOODBYE); if (C) B.say(GOODBYE);
      r.lastOutput = session._lastPtyDataAt;
      r.neverSpoke = E.ptyQuietSince(session, Number(session._ptyOpenedAt) || 0);
      E.writeSessionInput(session, 'echo HELD');
      r.held = session._bridgeHeldInputs ? session._bridgeHeldInputs.lines.slice() : null;
      E.reattachLocalPty(id, session, 'test: B-1217 heal');
      r.replay = session._bridgeHeldInputs && session._bridgeHeldInputs.replaying ? session._bridgeHeldInputs.lines.slice() : [];
      r.speaker = mk === local ? 'local' : 'paired';
    } finally {
      Date.now = realNow;
      activeSessions.delete(id);                         // the stand-in attach's exit must not run the ladder on a stub engine
      try { session.pty?.kill?.(); } catch { }
    }
    return r;
  };
  if (duck) {
    const cured = await scene(E5, local), rel = await scene(R5, local);
    ok(cured.neverSpoke === true && JSON.stringify(cured.held) === '["echo HELD"]' && JSON.stringify(cured.replay) === '["echo HELD"]',
      'THE GOODBYE: the replaced bridge\'s «[detached]» after the new birth counts for nobody — the new bridge still reads never-spoke, holds what the person typed, and the heal replays it', cured);
    ok(rel.neverSpoke === false && rel.held === null && rel.replay.length === 0, 'RED (a copy of the release\'s two lines): the goodbye makes the new bridge read «spoke» — nothing held, nothing replayed', rel);
    const twice = await scene(E5, local, { frozen: true }), twiceRel = await scene(R5, local, { frozen: true });
    ok(twice.neverSpoke === true && JSON.stringify(twice.replay) === '["echo HELD"]', 'A BRIDGE REPLACED TWICE IN ONE MILLISECOND (the clock held): the third bridge is born after the first one\'s last byte, the goodbyes of both count for nobody, the heal replays', twice);
    ok(twiceRel.neverSpoke === false && twiceRel.replay.length === 0, 'RED (the release\'s lines, the same millisecond): the tie and the goodbyes read «spoke» — nothing replayed', twiceRel);
    const pair = await scene(E5, paired), pairRel = await scene(R5, paired);
    ok(pair.neverSpoke === true && JSON.stringify(pair.replay) === '["echo HELD"]' && pairRel.neverSpoke === false && pairRel.replay.length === 0,
      'A PAIRED MACHINE\'S BRIDGE (dial.daemonPtyShim pair): the same law — its predecessor\'s goodbye never speaks for it (RED on the release\'s lines)', { pair, pairRel });
    ok(cured.lastReal > 0 && cured.lastOutput === cured.lastReal && rel.lastOutput > rel.lastReal,
      'the SESSION\'s last output across the heal is its program\'s last byte: kept (never reset at a birth), and a dying client\'s goodbye does not move it (RED: the release\'s goodbye moved it)', { cured: [cured.lastReal, cured.lastOutput], rel: [rel.lastReal, rel.lastOutput] });
    // r1676: THE WALL CLOCK STEPPED BACK inside a heal's window. B is born (after A's last byte), then the clock steps back 10 s, then B
    // speaks a real byte: B SPOKE — what a person types after it is forwarded by B, never held, so a later heal replays nothing (no
    // keystroke twice). RED: f28ff4de8's stamp dated B's byte before B's birth, so B read «never spoke», held the line and the heal replayed it
    const stepBack = (E) => {
      const id = 'sess-b1217-step-' + (++n5); const session = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: SOCK, cwd: ROOT };
      activeSessions.set(id, session);
      const realNow = Date.now, T0 = realNow(); const r = {};
      try {
        Date.now = () => T0;
        const A = local(); E.setupSessionPty(session, id, A.pty); A.say('prompt$ ');
        const B = local(); E.setupSessionPty(session, id, B.pty);
        Date.now = () => T0 - 10000;                     // the step back (an NTP step, a VM resume)
        B.say('the bridge speaks');
        r.spoke = !E.ptyQuietSince(session, Number(session._ptyOpenedAt) || 0);
        E.writeSessionInput(session, 'echo ONCE');
        E.reattachLocalPty(id, session, 'test: B-1217 heal after a step back');
        r.replay = session._bridgeHeldInputs && session._bridgeHeldInputs.replaying ? session._bridgeHeldInputs.lines.slice() : [];
      } finally { Date.now = realNow; activeSessions.delete(id); try { session.pty?.kill?.(); } catch { } }
      return r;
    };
    const sb = stepBack(E5), sbRel = stepBack(NF5);
    ok(sb.spoke === true && sb.replay.length === 0, 'r1676 THE CLOCK STEPPED BACK 10 s after a bridge\'s birth: its real byte still says «spoke» — what the person typed is forwarded once, the heal replays nothing', sb);
    ok(sbRel.spoke === false && JSON.stringify(sbRel.replay) === '["echo ONCE"]', 'RED (f28ff4de8\'s stamp, a copy): the byte dated before the birth reads «never spoke» — the heal would type the line a second time', sbRel);
    // the current bridge's own byte still stamps (readers of the session's last output and the bridge's liveness both move)
    {
      const id = 'sess-b1217-own'; const session = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: null, cwd: ROOT };
      activeSessions.set(id, session);
      const A = local(); E5.setupSessionPty(session, id, A.pty); await sleep(2);
      const t0 = Date.now(); A.say('more output');
      ok(E5.ptyQuietSince(session, t0) === false && Number(session._lastPtyDataAt) >= t0, 'the CURRENT bridge\'s byte stamps as before (the session\'s last output and its liveness both move)', { stamp: session._lastPtyDataAt, t0 });
      activeSessions.delete(id);
    }
  }
  ok(verdictOf(MUT5.files.every((f) => !f.startsWith(REPO))), 'the release copy lives outside the tree');
}

console.log(fail ? `\nFAIL (${fail} failed, ${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
