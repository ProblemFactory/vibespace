#!/usr/bin/env node
// LANE STREAM-PING (browser-windows BL-r5-2) — THE WS KEEPALIVE, the fast gate. A half-open live-view viewer (no close
// frame, nothing ever read again) stayed counted on the browser bridge until the kernel's TCP timeout; the desktop bridge
// had pinged since 2.369.118. ONE rule now (src/ws-keepalive.js), armed by every long-lived ws bridge:
//   ① the PURE step table: tick ⇒ ping; a pong between two ticks keeps the peer; two silent rounds ⇒ dropped with the
//      desktop bridge's own words ("no pong for 40000 ms") and code 1006;
//   ② armKeepalive on a fake socket + fake timers: a live peer survives 50 rounds, a silent one is terminated at the 2nd
//      tick, onDrop fires once, stop() ends the timer; CONTROL: a copy whose tick never drops keeps the silent peer;
//   ③ THE CENSUS (grep-derived): every src/server/*-stream.js requires ../ws-keepalive.js and arms it, and no bridge pings
//      by hand (`.ping(` outside the module); CONTROL: a planted bridge without it is red by name;
//   ④ THE REAL BRIDGE (src/server/browser-stream.js over a fake upstream, real `ws` clients, keepaliveMs 200): a viewer
//      that never answers pings (autoPong:false — what a half-open peer is to the server) is dropped within 2 × 200 ms
//      (+ slack), the viewer count falls to 1 (the other viewer is told), ONE named close line is logged, the other
//      viewer keeps its picture; the client's reconnect ladder treats any close alike (pinned).
//   ⑤ OUR OWN STALL IS NOT THE PEER'S DEATH (verify r1 T1①, the 2.369.16 rule): the PURE stall table (a 60 s stall after
//      a ping, the blind band — tick on time, the gauge saw the gap —, the next clean round, the 7-round bound, a 4 s
//      lateness still judged), the loop-gap gauge on a fake clock; CONTROL: the step without its stall verdict drops;
//   ⑥ THE REAL BRIDGE THROUGH A STALL STORM (keepaliveMs 200): three live viewers, two 1 s sync bursts back to back
//      (one loop turn between them: the ticks ping, the pongs are not read yet) — nobody is dropped and every viewer
//      gets the next frame; CONTROL: the same storm through a copy of the bridge on the pre-fix rule drops all three.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { freePort } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const KA = require(path.join(REPO, 'src/ws-keepalive.js'));
const { WebSocket, WebSocketServer } = require('ws');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(e).slice(0, 500) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 20) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(every); } return pred(); };
const MUT = mutantCopies('ws-keepalive', REPO);

console.log('① the step table');
{
  let s = KA.keepaliveInit(0), r;
  r = KA.keepaliveStep(s, 'tick', 20000); ok(r.send === 'ping' && r.drop === false, 'tick 1: ping'); s = r.state;
  r = KA.keepaliveStep(s, 'pong', 20100); s = r.state; ok(s.alive === true && s.lastPongAt === 20100 && r.send === null, 'a pong keeps the peer');
  r = KA.keepaliveStep(s, 'tick', 40000); ok(r.send === 'ping' && !r.drop, 'tick 2 after a pong: ping again'); s = r.state;
  r = KA.keepaliveStep(s, 'tick', 60000); ok(r.drop && r.drop.code === 1006 && r.drop.reason === 'no pong for 40000 ms' && r.send === null, 'tick 3 with no pong since tick 2: dropped — "no pong for 40000 ms", code 1006 (the desktop bridge\'s words)', JSON.stringify(r));
  ok(KA.PING_MS === 20000 && KA.dropReason(200) === 'no pong for 400 ms', 'the cadence is 20 s; the reason names two rounds');
  ok(KA.keepaliveStep(KA.keepaliveInit(0), 'hello', 1).drop === false, 'an unknown event changes nothing');
}

console.log('② armKeepalive on a fake socket');
function fakeWs() { const h = {}; return { readyState: 1, pings: 0, terminated: 0, on(ev, fn) { (h[ev] = h[ev] || []).push(fn); }, off(ev, fn) { h[ev] = (h[ev] || []).filter((x) => x !== fn); }, ping() { this.pings++; }, terminate() { this.terminated++; this.readyState = 3; }, emit(ev) { for (const fn of h[ev] || []) fn(); } }; }
function fakeTimers() { let fn = null, cleared = false; return { setIntervalFn: (f) => { fn = f; return 1; }, clearIntervalFn: () => { cleared = true; }, tick: () => fn && fn(), get cleared() { return cleared; } }; }
function armedLeg(K) {
  const out = {};
  { const ws = fakeWs(), T = fakeTimers(); let drops = 0; K.armKeepalive(ws, { pingMs: 100, now: () => 0, onDrop: () => drops++, ...T }); for (let i = 0; i < 50; i++) { T.tick(); ws.emit('pong'); } out.live = { pings: ws.pings, terminated: ws.terminated, drops }; }
  { const ws = fakeWs(), T = fakeTimers(); const seen = []; K.armKeepalive(ws, { pingMs: 100, now: () => 0, onDrop: (d) => seen.push(d), ...T }); T.tick(); T.tick(); T.tick(); out.silent = { pings: ws.pings, terminated: ws.terminated, seen, cleared: T.cleared }; }
  return out;
}
{
  const r = armedLeg(KA);
  ok(r.live.pings === 50 && r.live.terminated === 0 && r.live.drops === 0, 'a peer that answers every ping survives 50 rounds', JSON.stringify(r.live));
  ok(r.silent.pings === 1 && r.silent.terminated === 1 && r.silent.seen.length === 1 && r.silent.seen[0].reason === 'no pong for 200 ms and nothing acknowledged' && r.silent.cleared, 'a silent peer: pinged once, terminated at the 2nd tick, onDrop once with the named reason (the round\'s evidence read and silent: "… and nothing acknowledged" — the 2.369.202 integration folded lane desktop-keepalive\'s rule in here), the timer stopped', JSON.stringify(r.silent));
  // the evidence rule (lane desktop-keepalive, ONE rule for both bridges since the 2.369.202 integration): a peer whose pong
  // waits behind the send queue but who TALKS every round (an RFB client\'s update requests, a live view\'s input) is alive
  { const ws = fakeWs(), T = fakeTimers(); let drops = 0; KA.armKeepalive(ws, { pingMs: 100, now: () => 0, onDrop: () => drops++, ...T }); for (let i = 0; i < 20; i++) { T.tick(); ws.emit('message'); } ok(ws.terminated === 0 && drops === 0 && ws.pings === 20, 'a peer with no pong that sends bytes every round is never dropped (livenessVerdict: bytes from the peer ⇒ alive) — still pinged every round', JSON.stringify({ terminated: ws.terminated, pings: ws.pings })); }
  ok(KA.livenessVerdict({ pong: true }) === 'alive' && KA.livenessVerdict({ inbound: 1 }) === 'alive' && KA.livenessVerdict({ queuedBefore: 9, wroteBefore: 1, wroteNow: 2 }) === 'draining' && KA.livenessVerdict({ wroteBefore: 1, wroteNow: 2 }) === 'silent' && KA.livenessVerdict({}) === 'silent', 'livenessVerdict (PURE, here since the integration): pong / bytes ⇒ alive, progress through a backlog ⇒ draining, else silent');
  const src = fs.readFileSync(path.join(REPO, 'src/ws-keepalive.js'), 'utf8');
  const cut = src.replace("return { state: s, send: null, drop: { code: KEEPALIVE_DROP_CODE, reason }, stalled };", "return { state: s, send: 'ping', drop: false, stalled };");
  const bad = armedLeg(MUT.load('src/ws-keepalive.js', cut, 'never-drops'));
  ok(cut !== src && bad.silent.terminated === 0, 'CONTROL: a keepalive whose tick never drops keeps the silent peer for ever (the leg above would be red)', JSON.stringify(bad.silent));
}

console.log('③ the census: every long-lived ws bridge arms the ONE rule');
// rv-desktop-apps F-B4 (lane dc-seams-desktop, the 2.369.215 integration): the desktop bridge hands its KA to one relay per
// stream kind (src/server/stream-relays.js); each relay arms it on its own socket — a bridge that registers relays is armed
// when EVERY relay it registers arms it, and no relay pings by hand
const relaysOf = (src, read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8')) => (/require\(['"]\.\/stream-relays\.js['"]\)/.test(src)
  ? [...read('src/server/stream-relays.js').matchAll(/require\(['"]\.\/(stream-relay-[\w-]+\.js)['"]\)/g)].map((m) => [`src/server/${m[1]}`, read(`src/server/${m[1]}`)]) : []);
function census(files, relays = (src) => relaysOf(src)) {
  const bad = [];
  const handPing = (src) => /\.ping\(\)/.test(src.replace(/\/\/[^\n]*/g, ''));
  for (const [f, src] of files) {
    if (!/require\(['"]\.\.\/ws-keepalive\.js['"]\)/.test(src)) bad.push(`${f}: does not require ../ws-keepalive.js`);
    const rs = relays(src);
    if (!/\bKA\.armKeepalive\(/.test(src) && !(rs.length && rs.every(([, r]) => /\bKA\.armKeepalive\(/.test(r)))) bad.push(`${f}: never arms the keepalive${rs.length ? ` (relays that do not: ${rs.filter(([, r]) => !/\bKA\.armKeepalive\(/.test(r)).map(([rf]) => rf).join(', ')})` : ''}`);
    if (handPing(src)) bad.push(`${f}: pings by hand (the rule lives in src/ws-keepalive.js)`);
    for (const [rf, r] of rs) if (handPing(r)) bad.push(`${rf}: pings by hand (the rule lives in src/ws-keepalive.js)`);
  }
  return bad;
}
{
  const dir = path.join(REPO, 'src/server');
  const bridges = fs.readdirSync(dir).filter((f) => /-stream\.js$/.test(f)).map((f) => [`src/server/${f}`, fs.readFileSync(path.join(dir, f), 'utf8')]);
  const bad = census(bridges);
  ok(bridges.length >= 2 && !bad.length, `every src/server/*-stream.js (${bridges.map((b) => b[0]).join(', ')}) arms the keepalive and pings nowhere else`, bad.join('; '));
  const planted = census([...bridges, ['src/server/planted-stream.js', "const pinger = setInterval(() => ws.ping(), 20000);"]]);
  ok(planted.some((b) => b.startsWith('src/server/planted-stream.js: does not require')) && planted.some((b) => /planted-stream\.js: pings by hand/.test(b)), 'CONTROL: a planted bridge with its own pinger is red by name', planted.join('; '));
  // the 2.369.215 integration: the desktop bridge is credited through its relays — one relay that stops arming reddens it by name
  const relaysCut = (src) => relaysOf(src).map(([rf, r]) => [rf, rf.endsWith('stream-relay-rfb.js') ? r.split('KA.armKeepalive(').join('KA.armKeepAlive(') : r]);
  const unarmed = census(bridges, relaysCut);
  ok(relaysOf(fs.readFileSync(path.join(dir, 'desktop-stream.js'), 'utf8')).length >= 2 && unarmed.some((b) => /desktop-stream\.js: never arms the keepalive \(relays that do not: src\/server\/stream-relay-rfb\.js\)/.test(b)), 'CONTROL: a relay of the desktop bridge that never arms the keepalive is red by name (the bridge is credited through its relays only)', unarmed.join('; '));
}

console.log('④ the real browser bridge: a half-open viewer is dropped, the other keeps its picture');
{
  const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8'));
  const FRAME = FIX.server_to_client.frame;
  const upPort = await freePort();
  const clients = new Set();
  const wss = new WebSocketServer({ port: upPort, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  wss.on('connection', (ws) => { clients.add(ws); ws.send(JSON.stringify(FIX.server_to_client.status)); ws.send(JSON.stringify(FIX.server_to_client.tabs)); ws.on('close', () => clients.delete(ws)); });
  const blast = () => { for (const c of clients) if (c.readyState === 1) c.send(JSON.stringify({ ...FRAME, metadata: { ...FRAME.metadata, timestamp: Date.now() } })); };
  const BS = require(path.join(REPO, 'src/server/browser-stream.js'));
  const lines = [];
  const activeSessions = new Map([['sess-1', { _browserKey: 'bk-0000000a', name: 'one' }]]);
  const set = { attachments: [{ profileId: 'bp-00000001', alias: 'work', label: 'Work', isDefault: true }] };
  const keeper = { setFor: () => set, list: () => ({ profiles: [{ id: 'bp-00000001', label: 'Work', dir: '/tmp/x' }] }), streamPortFor: async () => ({ ok: true, port: upPort }) };
  const bridge = BS.create({ keeper, activeSessions, requestAuthed: (req) => /(^|; )vs=1/.test(String(req.headers.cookie || '')), log: { warn() {}, log: (l) => lines.push(String(l)) }, keepaliveMs: 200 });
  const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
  const PORT = await freePort();
  await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
  const viewer = (opts = {}) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/browser/stream?session=sess-1`, { headers: { Cookie: 'vs=1' }, ...opts });
    const v = { ws, frames: 0, msgs: [], closed: null };
    ws.on('message', (d) => { try { const m = JSON.parse(d); if (m.type === 'frame') v.frames++; else v.msgs.push(m); } catch { } });
    ws.on('close', (c) => { v.closed = c; }); ws.on('error', () => {});
    return v;
  };
  const a = viewer();
  const b = viewer({ autoPong: false });   // a peer that never answers a ping: the server cannot tell it from a half-open socket
  await until(() => a.msgs.some((m) => m.type === 'viewers' && m.count === 2) || bridge.viewerCount('sess-1') === 2, 3000);
  const two = bridge.viewerCount('sess-1');
  const t0 = Date.now();
  const gone = await until(() => bridge.viewerCount('sess-1') === 1, 3000);
  const took = Date.now() - t0;
  ok(two === 2 && gone && took <= 2 * 200 + 400, `the silent viewer is dropped within 2 × 200 ms (+ slack): ${took} ms, the count 2 → ${bridge.viewerCount('sess-1')}`, JSON.stringify({ two, took }));
  const named = lines.filter((l) => /\[browser-stream\] .*: viewer \d+ closed \(no pong for 400 ms and nothing acknowledged\) after \d+s, code 1006/.test(l));
  ok(named.length === 1, 'ONE named close line: "viewer N closed (no pong for 400 ms and nothing acknowledged) after Ns, code 1006"', lines.join(' | '));
  await sleep(700);
  const f0 = a.frames; blast(); await until(() => a.frames > f0, 2000);
  ok(a.frames > f0 && a.closed === null && bridge.viewerCount('sess-1') === 1, 'the other viewer is never dropped (it answers its pings) and keeps its picture after the drop', JSON.stringify({ frames: a.frames, f0, closed: a.closed }));
  a.ws.close(); await until(() => bridge.viewerCount('sess-1') === 0, 2000);
  ok(lines.some((l) => /viewer \d+ closed \(the viewer closed its socket\) after \d+s, code 1005/.test(l)), 'a clean close is named too (who closed, the code)', lines.slice(-2).join(' | '));
  try { b.ws.terminate(); } catch { }
  bridge.shutdown?.(); srv.close(); for (const c of clients) c.terminate(); wss.close();
  const win = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/ws\.onclose = \(\) => \{/.test(win) && !/ws\.onclose = \(e\w*\)/.test(win), 'the client\'s reconnect ladder reads every close alike (no code test) — a keepalive drop reconnects like a network loss');
  const oc = (win.match(/ws\.onclose = \(\) => \{[\s\S]*?\n    \};/) || [''])[0];
  ok(oc && !/showToast/.test(oc) && /scheduleReconnect\(\)/.test(oc) && /Connection lost/.test(oc), 'verify r1 T1②: a keepalive drop names nothing to the client (terminate ⇒ 1006, like any network loss) — no toast, the status line "Connection lost" and the reconnect ladder (first step 1 s)', oc.slice(0, 300));
}
console.log('⑤ our own stall is not the peer\'s death (verify r1 T1①, the 2.369.16 rule)');
const KA_SRC = fs.readFileSync(path.join(REPO, 'src/ws-keepalive.js'), 'utf8');
const NO_STALL = KA_SRC.replace('if (stalled && s.misses <= MAX_STALLED_MISSES) return', 'if (false) return'); // the pre-fix rule
function stallTable(K) {
  const o = {};
  let s = K.keepaliveStep(K.keepaliveInit(0), 'tick', 20000).state;          // a ping goes out at 20 s
  o.stall60 = K.keepaliveStep(s, 'tick', 80000, { loopGapMs: 60000 });       // OUR loop blocked 60 s: the pong sat unread
  s = K.keepaliveStep(o.stall60.state, 'pong', 80005).state;                 // read at once when the loop is back
  o.after = K.keepaliveStep(s, 'tick', 100000);
  s = K.keepaliveStep(K.keepaliveInit(0), 'tick', 20000).state;
  o.blind = K.keepaliveStep(s, 'tick', 40000, { loopGapMs: 19000 });         // the tick ON TIME, the gauge saw a 19 s gap
  o.cleanAfter = K.keepaliveStep(o.blind.state, 'tick', 60000);              // still silent in a clean round
  s = K.keepaliveStep(K.keepaliveInit(0), 'tick', 20000).state;
  o.late4 = K.keepaliveStep(s, 'tick', 44000);                               // 4 s late: within the grace — a verdict
  s = K.keepaliveStep(K.keepaliveInit(0), 'tick', 20000).state;
  o.bound = []; let t = 20000;
  for (let i = 0; i < 9; i++) { t += 60000; const x = K.keepaliveStep(s, 'tick', t); o.bound.push(x.drop ? x.drop.reason : x.send); s = x.state; if (x.drop) break; }
  return o;
}
{
  const o = stallTable(KA);
  ok(!o.stall60.drop && o.stall60.send === 'ping' && o.stall60.stalled === true, 'a ping at 20 s, then OUR loop blocked 60 s (no pong could be read): the tick at 80 s is no verdict — re-pinged, not dropped', JSON.stringify(o.stall60));
  ok(!o.after.drop && o.after.send === 'ping', '…the pong read when the loop is back keeps the peer; the next clean round pings as usual', JSON.stringify(o.after));
  ok(!o.blind.drop && o.blind.stalled === true, 'the blind band: the tick ON TIME but the gauge saw a 19 s loop gap in the round ⇒ no verdict', JSON.stringify(o.blind));
  ok(o.cleanAfter.drop && o.cleanAfter.drop.code === 1006 && o.cleanAfter.drop.reason === 'no pong for 40000 ms after 1 stalled round(s)', 'a peer still silent in the next CLEAN round is dropped — the reason names the forgiven round', JSON.stringify(o.cleanAfter));
  ok(o.late4.drop && o.late4.drop.reason === 'no pong for 40000 ms', 'a tick 4 s late (within the 5 s grace) is still a verdict, in the classic words', JSON.stringify(o.late4));
  ok(o.bound.length === 7 && o.bound.slice(0, 6).every((x) => x === 'ping') && /^no pong for \d+ ms \(7 stalled rounds in a row\)$/.test(o.bound[6]), 'the bound: a peer silent through 6 stalled rounds in a row is dropped at the 7th (2.369.16 MAX_TAINTED_MISSES)', JSON.stringify(o.bound));
  ok(KA.keepaliveInit(0).stallGraceMs === 5000 && KA.keepaliveInit(0, { pingMs: 200 }).stallGraceMs === 100 && KA.STALL_GRACE_MS === 5000 && KA.MAX_STALLED_MISSES === 6, 'the grace is min(5 s, pingMs / 2): 5000 at the production 20 s, 100 at 200 ms');
  let c = 0, pulse = null, cleared = 0;
  const G = KA.createLoopGauge({ clock: () => c, pulseMs: 1000, setIntervalFn: (f) => { pulse = f; return 7; }, clearIntervalFn: () => { cleared++; } });
  G.retain(); G.retain();
  c = 1000; pulse(); c = 2000; pulse(); const quiet = G.read(0);
  c = 5500; pulse();                                   // the loop turned 3.5 s after the last turn: 2.5 s past the cadence
  const r1 = G.read(2000), r2 = G.read(r1.at);
  c = 9000; const r3 = G.read(r2.at);                  // a tick in the SAME turn as a block's end sees it before the pulse does
  G.release(); const still = cleared; G.release();
  ok(quiet.gapMs === 0 && r1.gapMs === 2500 && r2.gapMs === 0 && r3.gapMs === 2500 && still === 0 && cleared === 1 && G.users === 0, 'the loop-gap gauge: a quiet loop reads 0, a 3.5 s block reads 2.5 s past the cadence once (not again after it), a read sees a block before the pulse does; the pulse runs while any keepalive holds it', JSON.stringify({ quiet, r1, r2, r3, still, cleared }));
  // the wiring: armKeepalive hands the gauge's gap to the step (fake timers, a fake gauge)
  const wiringLeg = (K) => {
    const ws = fakeWs(), T = fakeTimers(); let gap = 0; const seen = [];
    K.armKeepalive(ws, { pingMs: 20000, now: () => 0, onDrop: (d) => seen.push(d.reason), gauge: { retain() {}, release() {}, now: () => 0, read: () => ({ gapMs: gap, at: 0 }) }, ...T });
    T.tick(); gap = 19000; T.tick(); const mid = { terminated: ws.terminated, pings: ws.pings }; gap = 0; T.tick();
    return { mid, terminated: ws.terminated, seen };
  };
  const wr = wiringLeg(KA);
  ok(wr.mid.terminated === 0 && wr.mid.pings === 2 && wr.terminated === 1 && wr.seen[0] === 'no pong for 40000 ms and nothing acknowledged after 1 stalled round(s)', 'armKeepalive hands the gauge\'s gap to the step: a silent peer is re-pinged through a stalled round and dropped in the next clean one', JSON.stringify(wr));
  const NO_WIRE = KA_SRC.replace('loopGapMs = g.gapMs;', 'loopGapMs = 0;');
  const wm = wiringLeg(MUT.load('src/ws-keepalive.js', NO_WIRE, 'no-gauge-wire'));
  ok(NO_WIRE !== KA_SRC && wm.mid.terminated === 1, 'CONTROL: an armKeepalive that never reads the gauge drops the silent peer inside the stalled round', JSON.stringify(wm));
  const pre = stallTable(MUT.load('src/ws-keepalive.js', NO_STALL, 'no-stall-verdict'));
  ok(NO_STALL !== KA_SRC && pre.stall60.drop && pre.blind.drop, 'CONTROL: the step without its stall verdict (the pre-fix rule) drops the peer at the 60 s stall and in the blind band', JSON.stringify({ stall60: pre.stall60.drop, blind: pre.blind.drop }));
}

console.log('⑥ the REAL browser bridge through a stall storm: nobody is dropped');
async function stormLeg(BSmod) {
  const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8'));
  const FRAME = FIX.server_to_client.frame;
  const upPort = await freePort(); const ups = new Set();
  const up = new WebSocketServer({ port: upPort, host: '127.0.0.1' }); await new Promise((r) => up.on('listening', r));
  up.on('connection', (ws) => { ups.add(ws); ws.send(JSON.stringify(FIX.server_to_client.status)); ws.send(JSON.stringify(FIX.server_to_client.tabs)); ws.on('close', () => ups.delete(ws)); });
  const blast = () => { for (const c of ups) if (c.readyState === 1) c.send(JSON.stringify({ ...FRAME, metadata: { ...FRAME.metadata, timestamp: Date.now() } })); };
  const lines = [];
  const activeSessions = new Map([['sess-1', { _browserKey: 'bk-0000000a', name: 'one' }]]);
  const set = { attachments: [{ profileId: 'bp-00000001', alias: 'work', label: 'Work', isDefault: true }] };
  const keeper = { setFor: () => set, list: () => ({ profiles: [{ id: 'bp-00000001', label: 'Work', dir: '/tmp/x' }] }), streamPortFor: async () => ({ ok: true, port: upPort }) };
  const bridge = BSmod.create({ keeper, activeSessions, requestAuthed: () => true, log: { warn() {}, log: (l) => lines.push(String(l)) }, keepaliveMs: 200 });
  const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
  const PORT = await freePort(); await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
  const vs = [0, 1, 2].map(() => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/browser/stream?session=sess-1`); const v = { ws, frames: 0, closed: null }; ws.on('message', (d) => { try { if (JSON.parse(d).type === 'frame') v.frames++; } catch { } }); ws.on('close', (c) => { v.closed = c; }); ws.on('error', () => {}); return v; });
  await until(() => bridge.viewerCount('sess-1') === 3, 3000);
  await sleep(600);                                    // a few clean rounds: every viewer answers
  const before = bridge.viewerCount('sess-1');
  const busy = (ms) => { const t = Date.now(); while (Date.now() - t < ms) { /* the stall */ } };
  // where real work runs (an immediate / I/O callback): burst 1, ONE loop turn (timers: the ticks ping; poll: the pongs
  // are not read yet), burst 2 — the 2.369.16 storm
  await new Promise((r) => setImmediate(() => { busy(1000); setImmediate(() => { busy(1000); r(); }); }));
  await sleep(700);
  const after = bridge.viewerCount('sess-1');
  const f0 = vs.map((v) => v.frames); blast(); await until(() => vs.every((v, i) => v.frames > f0[i]) || vs.some((v) => v.closed !== null), 2000);
  const out = { before, after, framed: vs.filter((v, i) => v.frames > f0[i]).length, named: lines.filter((l) => /closed \(no pong/.test(l)) };
  for (const v of vs) { try { v.ws.terminate(); } catch { } }
  bridge.shutdown?.(); srv.close(); for (const c of ups) c.terminate(); up.close();
  return out;
}
{
  const BS = require(path.join(REPO, 'src/server/browser-stream.js'));
  const r = await stormLeg(BS);
  ok(r.before === 3 && r.after === 3 && r.framed === 3 && r.named.length === 0, `two 1 s bursts back to back at keepaliveMs 200: all 3 live viewers stay (count ${r.before} → ${r.after}), no close line, each gets the next frame`, JSON.stringify(r));
  const kaPre = MUT.write('src/ws-keepalive.js', NO_STALL, 'storm-pre');
  const bsSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8');
  const bsPre = bsSrc.replace("require('../ws-keepalive.js')", `require(${JSON.stringify(kaPre)})`);
  const c = await stormLeg(MUT.load('src/server/browser-stream.js', bsPre, 'storm-pre'));
  ok(bsPre !== bsSrc && c.before === 3 && c.after === 0 && c.named.length === 3, `CONTROL: the same storm through the bridge on the pre-fix rule drops all 3 live viewers at once (count ${c.before} → ${c.after}, ${c.named.length} named line(s)) — our stall read as their death`, JSON.stringify(c));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
