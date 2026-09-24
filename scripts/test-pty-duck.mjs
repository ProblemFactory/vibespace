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

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { scratch } = await import(path.join(REPO, 'scripts/scratch.mjs'));

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? `\n      ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : '')); } };
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
  ok(outOf(id).includes(`hello-${label}`), `${label}: the consumer streams the byte`, outOf(id));
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
  ok(outOf(id).includes('hello-oneslot'), 'CONTROL (pre-fix one-slot duck): the consumer still streams — the last registration won');
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
    ok(outOf(id).includes('mock-shell$'), 'opencode serve terminal: the banner held before the listeners existed reaches the CONSUMER (the one-slot hold gave it to the stamp and the terminal opened blank)', outOf(id));
    ok(Number(session._lastPtyDataAt) > 0, 'opencode serve terminal: …and the liveness stamp saw it too', { stamp: session._lastPtyDataAt });
    const t0 = Date.now();
    const serverSide = mock.state.ptySockets.find((x) => x.id === bridge.ptyId);
    serverSide?.ws.send('later-bytes');                   // the serve's shell prints something after the replay
    for (let i = 0; i < 40 && !outOf(id).includes('later-bytes'); i++) await sleep(50);
    ok(outOf(id).includes('later-bytes') && eng.ptyQuietSince(session, t0) === false,
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
  ok(ONE_SLOT.test("onData: (cb) => { h.onData = (buf) => cb(buf.toString('utf-8')); },") && ONE_SLOT.test('onExit: (cb) => { onExit = cb; },')
    && /on(?:Data|Exit)\s*:\s*\(\s*cb\s*\)\s*=>\s*\{\s*\n\s*on(?:Data|Exit)\s*=\s*cb\b/.test('onData: (cb) => {\n      onData = cb;')
    && !ONE_SLOT.test('onData: (cb) => data.on(cb),'),
  'CENSUS CONTROL: the three shipped one-slot shapes trip it, the shared SET does not');
  const wsc = read('src/ws-create.js'), br = read('src/server/boot-restore.js'), oc = read('src/server/opencode-pty-bridge.js');
  ok(/pipePtyShim\(r6Handle\)/.test(wsc) && /require\('\.\/pty-duck'\)/.test(wsc), 'WIRING PIN: ws-create\'s R6 create path builds its duck with pipePtyShim');
  ok(/pipePtyShim\(h\)/.test(br) && /require\('\.\.\/pty-duck'\)/.test(br), 'WIRING PIN: boot-restore\'s R6 re-open builds its duck with pipePtyShim');
  ok(/ptyListeners\(\{ hold: 500 \}\)/.test(oc) && /require\('\.\.\/pty-duck'\)/.test(oc), 'WIRING PIN: the OpenCode serve terminal holds its early bytes in a ptyListeners SET (bound 500)');
  ok(/ptyListeners\(\)/.test(read('src/server/dial-pairing.js')), 'WIRING PIN: daemonPtyShim shares the same SET');
}

// ── § 4 WHY THE STAMP MATTERS ON THE R6 CREATE PATH (the healer) ───────────
// ws-create keeps `socketPath` on an R6 session (the cw-* path it never
// creates), so ws-handler's broken-stdin detector arms on every input: no
// `_stdin_ack` in 5 s and ptyQuietSince(sentAt) ⇒ reattachLocalPty. With the
// stamp dropped the second half is ALWAYS true, so the ack alone stood between
// a healthy pipe session and the healer — whose first act is session.pty.kill(),
// i.e. the daemon's `kill-pipe-session`. A dial (remote) session never rides
// these ducks: it is a LOCAL dtach whose program talks to the device through
// the DialSessionBridge (node-pty, or daemonPtyShim after a restore).
console.log('— §4 the healer on an R6-shaped session: its first act kills the pipe handle —');
{
  const h = { pid: 9, write() { }, kill() { h.killed = (h.killed || 0) + 1; } };
  const d = duck ? duck.pipePtyShim(h) : { onData() { }, onExit() { }, kill() { h.kill(); }, write() { } };
  const id = 'sess-duck-r6';
  const session = { mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: path.join(ROOT, 'cw-never-created'), cwd: ROOT };
  activeSessions.set(id, session);
  eng.setupSessionPty(session, id, d);
  let healed = false, err = null;
  try { healed = eng.reattachLocalPty(id, session, 'test: no ack within 5 s'); } catch (e) { err = e; }
  activeSessions.delete(id);                                           // the replacement's exit must not tear down a stub engine
  try { if (session.pty !== d) session.pty?.kill?.(); } catch { }
  if (err && /ENOENT|spawn/i.test(String(err.message))) console.log(`  - SKIP: dtach is not installed here (${err.message}) — the healer leg needs it`);
  else ok(healed === true && h.killed === 1, 'reattachLocalPty on an R6-shaped session (socketPath set, never created) KILLS the pipe handle — a false "silent" verdict ends a healthy session', { healed, killed: h.killed, err: err && err.message });
}

console.log(fail ? `\nFAIL (${fail} failed, ${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
