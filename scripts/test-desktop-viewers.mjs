#!/usr/bin/env node
// ONE ACTIVE VIEWER PER APP WINDOW (P8-2 x5, docs/design-desktop-apps.zh.md §7
// P8-2 "x5 多客户端 = 单活跃 viewer", 2026-09-22; the owner's ruling "直接block掉
// 非active客户端的app界面，因为多客户端同时操作鼠标感觉也会有问题" + "仿照terminal…
// 可以手动take over"). Fast, no display, no browser:
//   §1 the PURE rule (src/desktop-viewers.js): the state table (no lease /
//      an agent driving / a human takeover), first attach, the re-election
//      by recency, the broadcast shape (panes, never a socket's secret id),
//      the client's reading, the relay table;
//   §2 the keeper's election (join / leave / Resume here / the session
//      ending) and its `desktop-app-viewers` broadcast;
//   §3 THE BRIDGE over fake upstreams (a recording xpra ws server + a
//      recording TCP "VNC server") composed exactly as window-live-wiring
//      composes it: blocked ⇒ NO upstream at all and 0 packets either way;
//      active ⇒ everything; Resume here ⇒ the old active cut (4001), the new
//      one's held hello + display size + geometry replayed in order; an agent
//      driving ⇒ every viewer Watch (the picture only — configure-window /
//      display / keymap / input cut and held) and a human takeover replaying
//      them; the active viewer leaving ⇒ the dormant one takes over by itself;
//      the session ending ⇒ the blocked sockets closed; the rfb twin. The
//      CONTROL is a patched copy of the bridge whose seat state is always
//      'free' (the pre-x5 bridge): the blocked viewer's packets reach the
//      server there;
//   §4 the route (POST /viewers/takeover: a plain swap, the engine's takeover
//      when an agent holds the window, no_viewer 409) + the wiring pins;
//   §5 (2.369.156, the round-3 verifier's LOWs + INFO defaults) the GRACE
//      (the active pane's seat held 5 s while it reconnects — by its pane key
//      or as the `prev` successor of a reloaded window; others stay blocked;
//      then the most recently active), LOW-4 (the active pane's NEWER socket
//      takes the seat at once, its older one is cut — measured vs the pings'
//      two rounds), LOW-3 (an ANONYMOUS socket is a watch seat, never elected),
//      LOW-1 (zero warn lines per join), LOW-2 (the xpra rung's record names
//      the app for a blocked pane) — each with its control.
// Run: node scripts/test-desktop-viewers.mjs
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { WebSocketServer, WebSocket } = require(path.join(repo, 'node_modules/ws'));
const DV = require(path.join(repo, 'src/desktop-viewers.js'));
const DS = require(path.join(repo, 'src/server/desktop-stream.js'));
const K = require(path.join(repo, 'src/server/desktop-app-keeper.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000, step = 10) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
const root = scratch('desktop-viewers');
fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
// The negative controls' patched bridge/keeper copies are written OUTSIDE the
// tree (scripts/mutant-copy.mjs, `require` re-bound on line 1 to the real
// module's path). They used to be un-ignored siblings (src/server/vs-dv-mut-*):
// a dirty tree while the suite ran, read as source by every src/ scanner.
const MUTV = mutantCopies('dviewers', repo);

const cleanup = () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

console.log('§1 the PURE rule (src/desktop-viewers.js)');
{
  const S = { active: 'v-a' };
  ok(DV.viewerState(S, 'v-a', null) === 'active' && DV.viewerState(S, 'v-b', null) === 'blocked', 'no lease: the elected viewer is ACTIVE, every other one BLOCKED');
  ok(DV.viewerState({ active: null }, 'v-a', null) === 'blocked', 'nobody elected ⇒ nobody active (the join elects)');
  ok(['v-a', 'v-b', 'v-c'].every((v) => DV.viewerState(S, v, { input: 'agent', holder: null }) === 'watch'), 'an agent DRIVING the window ⇒ every human is WATCH — the elected one too');
  ok(DV.viewerState(S, 'v-b', { input: 'user', holder: 'v-b' }) === 'active' && DV.viewerState(S, 'v-a', { input: 'user', holder: 'v-b' }) === 'blocked', 'a human TAKEOVER of an agent\'s window ⇒ the taker is active, everyone else blocked (the election\'s own pick included)');
  ok(DV.viewerState(S, 'v-a', { input: 'user', holder: null }) === 'blocked', 'a takeover with no holder recorded makes nobody active (never a guess)');
  ok(JSON.stringify(DV.RELAY_RULES) === JSON.stringify({ active: { picture: true, input: true, geometry: true }, blocked: { picture: false, input: false, geometry: false }, watch: { picture: true, input: false, geometry: false } }), 'the relay table: active = everything, blocked = nothing, watch = the picture only');
  const vs = [{ viewerId: 'v-a', pane: 'pa', since: 1 }, { viewerId: 'v-b', pane: 'pb', since: 2 }, { viewerId: 'v-c', pane: 'pc', since: 3 }];
  ok(DV.activeAfterJoin({ active: null }, vs.slice(0, 1), 'v-a') === 'v-a' && DV.activeAfterJoin({ active: 'v-a' }, vs, 'v-b') === 'v-a' && DV.activeAfterJoin({ active: 'v-gone' }, vs, 'v-c') === 'v-c', 'FIRST ATTACH: the joiner is active only when nobody (present) is');
  ok(DV.nextActive(vs, 'v-a', { pa: 50, pb: 40, pc: 10 }) === 'v-b', 'the active one leaves ⇒ the MOST RECENTLY ACTIVE remaining viewer takes over (pb at 40 beats pc at 10)');
  ok(DV.nextActive(vs, 'v-a', new Map([['pc', 60]])) === 'v-c' && DV.nextActive(vs, 'v-a', {}) === 'v-c', 'recency from a Map too; panes never active ⇒ the most recently JOINED (the client a person just opened)');
  const naive = vs.filter((v) => v.viewerId !== 'v-a').sort((a, b) => b.since - a.since)[0].viewerId;
  ok(naive === 'v-c' && DV.nextActive(vs, 'v-a', { pa: 50, pb: 40, pc: 10 }) !== naive, `CONTROL: a naive "most recently joined" re-election would pick ${naive} — the rule picks the most recently ACTIVE instead`);
  ok(DV.nextActive(vs.slice(0, 1), 'v-a', {}) === null && DV.nextActive([], null, {}) === null, 'nobody left ⇒ null');
  const view = DV.viewersView('da-1', { active: 'v-b' }, [...vs, { viewerId: 'v-b2', pane: 'pb', since: 5, label: 'x' }]);
  ok(view.type === 'desktop-app-viewers' && view.id === 'da-1' && view.active === 'pb' && view.viewers.map((v) => v.id).join() === 'pa,pb,pc', 'the broadcast names PANES (the active one, and one row per pane even while it reconnects), oldest first', view);
  ok(!JSON.stringify(view).includes('v-'), 'the broadcast carries NO socket id — the viewer id is the bridge\'s secret', view);
  const held = DV.viewersView('da-1', { active: null, activePane: 'pa' }, vs.slice(1));
  ok(held.active === 'pa' && held.viewers.map((v) => v.id).join() === 'pb,pc' && DV.paneState({ active: held.active, myPane: 'pb' }) === 'blocked' && DV.paneState({ active: held.active, myPane: 'pa' }) === 'active', 'a HELD seat (the keeper\'s grace): the broadcast names the reconnecting pane as active though no socket of it is present — the others read blocked, the pane itself active', held);
  const noHeld = DV.viewersView('da-1', { active: null }, vs.slice(1));
  ok(noHeld.active === null && DV.paneState({ active: noHeld.active, myPane: 'pb' }) === 'active', 'CONTROL: without activePane the same moment broadcasts active: null — and every blocked client would read itself ACTIVE (paneState) while the bridge still blocks it', noHeld);
  ok(DV.paneState({ lease: null, active: 'pa', myPane: 'pa' }) === 'active' && DV.paneState({ lease: null, active: 'pb', myPane: 'pa' }) === 'blocked' && DV.paneState({ lease: null, active: null, myPane: 'pa' }) === 'active' && DV.paneState({ known: false }) === 'active', 'the client\'s reading: its pane active ⇒ active, another ⇒ blocked, nobody / not known yet ⇒ active (the server holds the picture back anyway)');
  ok(DV.paneState({ lease: { input: 'agent' }, active: 'pa', myPane: 'pa' }) === 'watch' && DV.paneState({ lease: { input: 'user', takenBy: { tag: 'tk-1' } }, myTag: 'tk-1' }) === 'active' && DV.paneState({ lease: { input: 'user', takenBy: { tag: 'tk-1' } }, myTag: 'tk-2', active: 'pa', myPane: 'pa' }) === 'blocked', 'the client\'s reading with a lease: agent ⇒ watch; the takeover tag is mine ⇒ active; somebody else\'s ⇒ blocked');
  ok(DV.viewerLabel('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36') === 'Chrome · Linux' && DV.viewerLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1') === 'Safari · iOS' && DV.viewerLabel('') === 'Client', 'a viewer\'s label is browser · OS from its User-Agent (no version, no device id)');
  const src = read('src/desktop-viewers.js');
  ok(!/require\(|import /.test(src.replace(/^\s*(\*|\/\/).*$/gm, '')), 'desktop-viewers.js imports nothing (PURE — bundled into the window too)');
}

console.log('§2 the keeper\'s election + its broadcast');
const bcasts = [];
const keeper = K.create({ dataDir: path.join(root, 'data'), env: () => ({ PATH: process.env.PATH }), broadcast: (m) => bcasts.push(m), viewerGraceMs: 0, log: { log() {}, warn() {} } }); // the re-election rule itself; the grace is §5's
{
  const vb = () => bcasts.filter((m) => m.type === 'desktop-app-viewers' && m.id === 'da-k').slice(-1)[0];
  keeper.viewerJoined('da-k', { viewerId: 'v-a', pane: 'pa', label: 'Chrome · Linux' });
  ok(keeper.activeViewer('da-k') === 'v-a' && vb().active === 'pa' && vb().viewers.length === 1 && vb().viewers[0].label === 'Chrome · Linux', 'A attaches first ⇒ A is active, broadcast `desktop-app-viewers` {active: pa}');
  keeper.viewerJoined('da-k', { viewerId: 'v-b', pane: 'pb' });
  ok(keeper.activeViewer('da-k') === 'v-a' && vb().active === 'pa' && vb().viewers.length === 2, 'B attaches ⇒ A stays active (B is blocked), the broadcast lists both');
  const t = keeper.takeoverViewer('da-k', 'v-b');
  ok(t.ok && keeper.activeViewer('da-k') === 'v-b' && vb().active === 'pb' && t.viewers.active === 'pb', 'B: Resume here ⇒ B active, A blocked, broadcast + the answer say pb');
  ok(!keeper.takeoverViewer('da-k', 'v-nope').ok && keeper.takeoverViewer('da-k', 'v-nope').code === 'no_viewer', 'a takeover by a socket id nobody holds is refused no_viewer');
  keeper.viewerJoined('da-k', { viewerId: 'v-c', pane: 'pc' });
  keeper.viewerLeft('da-k', 'v-b');
  ok(keeper.activeViewer('da-k') === 'v-a' && vb().active === 'pa', 'the active B leaves ⇒ A (the most recently ACTIVE, not C who joined later) takes over by itself');
  keeper.viewerLeft('da-k', 'v-a');
  ok(keeper.activeViewer('da-k') === 'v-c' && vb().active === 'pc', 'A leaves ⇒ C, the only one left');
  keeper.viewerJoined('da-k', { viewerId: 'v-a2', pane: 'pa' });
  ok(keeper.activeViewer('da-k') === 'v-c' && vb().viewers.find((v) => v.id === 'pa').since > 0, 'A reopens (a new socket, its pane key) while C is active ⇒ blocked');
  keeper.viewerLeft('da-k', 'v-c');
  keeper.viewerLeft('da-k', 'v-a2');
  ok(keeper.activeViewer('da-k') === null && vb().active === null && vb().viewers.length === 0, 'everybody left ⇒ null, an empty broadcast');
  keeper.viewerJoined('da-k', { viewerId: 'v-a3', pane: 'pa' });
  ok(keeper.activeViewer('da-k') === 'v-a3', 'the next one to attach is active again');
  keeper.viewerLeft('da-k', 'v-a3');
  ok(!bcasts.filter((m) => m.type === 'desktop-app-viewers').some((m) => /"v-/.test(JSON.stringify(m))), 'no broadcast ever carried a socket id');
}

console.log('§3 the bridge (over fake upstreams, composed as window-live-wiring composes it)');
const rpkt = (type) => { const t = Buffer.from(type); const payload = Buffer.concat([Buffer.from([192 + 2, 128 + t.length]), t, Buffer.from([0])]); const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 0x10; h.writeUInt32BE(payload.length, 4); return Buffer.concat([h, payload]); };
const typeOf = (b) => DS.xpraPacketType(b.subarray(8));
const fakeXpra = async () => {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0, handleProtocols: (ps) => (ps.has('binary') ? 'binary' : false) });
  await new Promise((r) => wss.on('listening', r));
  const st = { conns: 0, got: [], closed: 0 };
  // one relayed message may carry several packets (the bridge writes a replay + the packets beside it as ONE message): split by header
  const split = (b) => { const out = []; while (b.length >= 8 && b[0] === 0x50) { const n = b.readUInt32BE(4); out.push(typeOf(b.subarray(0, 8 + n))); b = b.subarray(8 + n); } return out; };
  wss.on('connection', (c) => { const n = ++st.conns; c.on('message', (m) => { for (const type of split(Buffer.from(m))) st.got.push({ conn: n, type }); c.send(rpkt('echo')); }); c.on('close', () => { st.closed++; }); c.send(rpkt('server-hello')); });
  return { port: wss.address().port, st, close: () => new Promise((r) => { for (const c of wss.clients) { try { c.terminate(); } catch {} } wss.close(r); }) };
};
const fakeRfb = async () => {
  const st = { conns: 0, got: [] };
  const socks = new Set();
  const srv = net.createServer((s) => { st.conns++; socks.add(s); s.write('RFB 003.008\n'); s.on('data', (d) => st.got.push(Buffer.from(d))); s.on('close', () => socks.delete(s)); s.on('error', () => {}); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { port: srv.address().port, st, close: () => new Promise((r) => { for (const s of socks) s.destroy(); srv.close(r); }) };
};
/** A bridge wired like window-live-wiring: the keeper's election + DV.viewerState + a lease we drive. */
async function rig(Smod, { kind = 'xpra', upstreamPort, graceMs = 0, Kmod = K }) {
  const k = Kmod.create({ dataDir: path.join(root, `k-${Math.random().toString(36).slice(2, 8)}`), env: () => ({}), broadcast: () => {}, viewerGraceMs: graceMs, log: { log() {}, warn() {} } });
  let lease = null;
  let alive = true;
  const log = [];
  const stream = Smod.create({
    auth: { requestAuthed: () => true },
    resolveTarget: () => (alive ? { kind, port: upstreamPort } : null),
    viewerSeats: { join: (id, { viewerId, pane, prev, ua }) => k.viewerJoined(id, { viewerId, pane, prev, label: DV.viewerLabel(ua) }), leave: (id, v) => k.viewerLeft(id, v), state: (id, v) => DV.viewerState({ active: k.activeViewer(id) }, v, lease) },
    log: { log: (l) => log.push(String(l)), warn: (l) => log.push('W ' + l) },
  });
  k.onViewers((id) => stream.refresh(id));
  const srv = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => stream.handleUpgrade(req, socket, head, 'da-x'));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const viewer = async (v, pane, extra = '') => {
    const q = v == null ? (extra ? `?${extra}` : '') : `?viewer=${v}&pane=${pane}${extra ? `&${extra}` : ''}`; // v null ⇒ an ANONYMOUS socket (LOW-3)
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/desktop/da-x/stream${q}`, kind === 'xpra' ? ['binary'] : undefined);
    const back = []; let closed = null;
    ws.on('message', (m) => back.push(Buffer.from(m)));
    ws.on('close', (code, reason) => { closed = { code, reason: String(reason) }; });
    await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
    return { ws, back, get closed() { return closed; }, send: (b) => ws.send(b), close: () => { try { ws.close(); } catch {} }, drop: () => { try { ws._socket.pause(); } catch {} } }; // drop: a SILENT drop — no close frame, no pongs (the socket stays open server-side)
  };
  return { k, stream, viewer, log, setLease: (l) => { lease = l; stream.refreshAll(); }, end: () => { alive = false; stream.refresh('da-x'); }, close: () => new Promise((r) => srv.close(r)) };
}
async function xpraScenario(Smod, label) {
  const up = await fakeXpra();
  const R = await rig(Smod, { kind: 'xpra', upstreamPort: up.port });
  const out = {};
  const A = await R.viewer('v-a', 'pa');
  await until(() => up.st.conns >= 1);
  A.send(Buffer.concat([rpkt('hello'), rpkt('key-action'), rpkt('display-configure'), rpkt('configure-window')]));
  await until(() => up.st.got.length >= 4);
  out.aTypes = up.st.got.filter((g) => g.conn === 1).map((g) => g.type);
  out.aBack = A.back.length;
  const B = await R.viewer('v-b', 'pb');
  await sleep(80);
  out.connsAfterB = up.st.conns;
  const gotBefore = up.st.got.length;
  B.send(Buffer.concat([rpkt('hello'), rpkt('key-action'), rpkt('button-action'), rpkt('display-configure'), rpkt('configure-window'), rpkt('keyboard-config'), rpkt('clipboard-token'), rpkt('shutdown-server')]));
  await sleep(120);
  out.bRelayed = up.st.got.length - gotBefore;
  out.bTypes = up.st.got.slice(gotBefore).map((g) => g.type);
  out.bBack = B.back.length;
  out.statsBlocked = R.stream.stats().blocked;
  // Resume here on B: the keeper moves the seat, the bridge cuts A and opens B's upstream with the held packets first
  const t0 = Date.now();
  R.k.takeoverViewer('da-x', 'v-b');
  const bConn = await until(() => (up.st.conns >= 2 ? up.st.conns : null), 2000);
  await until(() => up.st.got.filter((g) => g.conn === bConn).length >= 4, 2000);
  out.takeoverMs = Date.now() - t0;
  out.bReplay = up.st.got.filter((g) => g.conn === bConn).map((g) => g.type);
  await until(() => A.closed, 2000);
  out.aClosed = A.closed;
  out.upClosed = up.st.closed;
  B.send(rpkt('key-action'));
  await until(() => up.st.got.filter((g) => g.conn === bConn).length >= 5, 1000);
  out.bKeyAfter = up.st.got.filter((g) => g.conn === bConn).slice(-1)[0]?.type;
  out.bBackAfter = B.back.length;
  // A reconnects (as the pane does after a cut) ⇒ blocked, dormant
  const A2 = await R.viewer('v-a2', 'pa');
  await sleep(80);
  out.connsAfterA2 = up.st.conns;
  A2.send(rpkt('hello'));
  await sleep(60);
  // an AGENT drives the window ⇒ both Watch: A2 gets its upstream (the held hello first), B keeps its own; geometry / keymap / input cut
  R.setLease({ input: 'agent', holder: null });
  const a2Conn = await until(() => (up.st.conns >= 3 ? up.st.conns : null), 2000);
  await until(() => up.st.got.filter((g) => g.conn === a2Conn).length >= 1, 1000);
  out.a2First = up.st.got.filter((g) => g.conn === a2Conn).map((g) => g.type);
  const n1 = up.st.got.length;
  for (const V of [A2, B]) V.send(Buffer.concat([rpkt('map-window'), rpkt('configure-window'), rpkt('display-configure'), rpkt('keyboard-config'), rpkt('key-action'), rpkt('damage-sequence')]));
  await sleep(150);
  out.watchTypes = up.st.got.slice(n1).map((g) => g.type);
  out.a2BackInWatch = A2.back.length;
  // the human TAKES OVER the agent's window from A2 ⇒ A2 active (its held geometry/display/keymap replayed at once), B blocked (cut)
  const a2Before = up.st.got.filter((g) => g.conn === a2Conn).length;
  R.setLease({ input: 'user', holder: 'v-a2' });
  await until(() => up.st.got.filter((g) => g.conn === a2Conn).length >= a2Before + 3, 2000);
  out.a2Replay = up.st.got.filter((g) => g.conn === a2Conn).slice(a2Before).map((g) => g.type);
  await until(() => B.closed, 2000);
  out.bClosedAtTakeover = B.closed;
  // the lease goes (the agent detached): the election decides again — A2 is not the elected one, B was cut; B reconnects blocked
  const B2 = await R.viewer('v-b2', 'pb');
  R.setLease(null);
  await sleep(100);
  out.electedAfterLease = R.k.activeViewer('da-x');
  // the ACTIVE viewer leaves ⇒ the dormant one takes over by itself: its upstream opens with its held hello
  B2.send(rpkt('hello'));
  await sleep(50);
  const beforeLeave = up.st.conns;
  const act = R.k.activeViewer('da-x');
  const [stay, go] = act === 'v-b2' ? [A2, B2] : [B2, A2];
  go.close();
  const reConn = await until(() => (up.st.conns > beforeLeave ? up.st.conns : null), 2000);
  await until(() => reConn && up.st.got.some((g) => g.conn === reConn), 1000);
  out.reElect = { active: R.k.activeViewer('da-x'), stayWas: stay === A2 ? 'v-a2' : 'v-b2', firstUp: reConn ? up.st.got.filter((g) => g.conn === reConn).map((g) => g.type) : null, stayWasBlocked: stay === B2 };
  // the session ends ⇒ the remaining sockets are closed (a blocked socket holds nothing open upstream to notice it)
  const C = await R.viewer('v-c', 'pc');
  await sleep(50);
  R.end();
  await until(() => C.closed, 2000);
  out.endedClose = C.closed;
  out.log = R.log;
  for (const v of [A, B, A2, B2, C]) v.close();
  await R.close(); await up.close();
  console.log(`  (${label}: ${up.st.conns} upstream connection(s), takeover relayed in ${out.takeoverMs} ms)`);
  return out;
}
{
  const X = await xpraScenario(DS, 'x5 bridge');
  ok(X.aTypes.join() === 'hello,key-action,display-configure,configure-window', 'A (first) is ACTIVE: its hello, input, display size and geometry all reach xpra', X.aTypes);
  ok(X.connsAfterB === 1, `B attaches while A is active ⇒ BLOCKED: NO upstream connection is opened for it (${X.connsAfterB} connection(s) upstream)`);
  ok(X.bRelayed === 0 && X.bBack === 0 && X.statsBlocked >= 7, `a blocked viewer: 0 packets relayed either way — nothing of its hello / input / display size / geometry / keymap / clipboard / shutdown reaches xpra (${X.bRelayed}), nothing comes back (${X.bBack} messages), ${X.statsBlocked} counted`);
  ok(X.bReplay.slice(0, 4).join() === 'hello,keyboard-config,display-configure,configure-window', `Resume here on B: its upstream opens and what it said while blocked is replayed FIRST, in order — hello, keymap, display size, geometry (${X.bReplay.join(', ')}) — the app re-fits to B's pane`, X.bReplay);
  ok(X.takeoverMs < 1000, `…within ${X.takeoverMs} ms of the takeover`);
  ok(X.aClosed && X.aClosed.code === 4001 && /blocked/.test(X.aClosed.reason) && X.upClosed >= 1, 'the previous active A is CUT: its upstream closed and its socket closed 4001 "blocked" (the pane reconnects as a blocked viewer)', X.aClosed);
  ok(X.bKeyAfter === 'key-action' && X.bBackAfter > 0, 'B is active now: its input reaches xpra and the picture flows back');
  ok(X.connsAfterA2 === 2, 'A reconnecting after the cut is blocked: no upstream for it');
  ok(X.a2First[0] === 'hello', 'an agent DRIVES the window ⇒ A2 is WATCH: its upstream opens with its held hello (the picture)', X.a2First);
  ok(X.watchTypes.length > 0 && X.watchTypes.every((t) => t === 'map-window' || t === 'damage-sequence') && X.watchTypes.filter((t) => t === 'map-window').length === 2, `Watch (both viewers): only the picture's packets reach xpra (${X.watchTypes.join(', ')}) — configure-window, display-configure, keyboard-config and key-action are cut (the r3 open item closed)`, X.watchTypes);
  ok(X.a2Replay.slice(0, 3).join() === 'keyboard-config,display-configure,configure-window', `a human takes over the agent's window from A2 ⇒ A2 ACTIVE and its held keymap, display size and geometry are replayed at once (${X.a2Replay.join(', ')})`, X.a2Replay);
  ok(X.bClosedAtTakeover && X.bClosedAtTakeover.code === 4001, 'the other viewer (B, Watch until then) is BLOCKED by that takeover: cut 4001', X.bClosedAtTakeover);
  ok(X.reElect.active && X.reElect.firstUp && X.reElect.firstUp[0] === 'hello', `the ACTIVE viewer leaves ⇒ the remaining (dormant) one takes over by itself: its upstream opens with its held hello (${X.reElect.active}; first up: ${X.reElect.firstUp && X.reElect.firstUp.join(', ')})`, X.reElect);
  ok(X.endedClose && X.endedClose.code === 1001, 'the app session ending closes a blocked socket too (1001 — it had nothing upstream to notice it)', X.endedClose);
  ok(X.log.some((l) => /viewer v-b is BLOCKED \(another client is active\)/.test(l)) && X.log.some((l) => /is active now — the hello and the keymap and the display size and the window geometry it sent while blocked reach xpra first/.test(l)), 'the bridge NAMES a blocked viewer and the replay in its log', X.log.filter((l) => /BLOCKED|active now/.test(l)));
  const warns = X.log.filter((l) => l.startsWith('W '));
  ok(warns.length === 0, `LOW-1: ZERO warn lines over the scenario's 5 joins (every join's own broadcast refreshes the sockets while the joining one is not wired yet — skipped, never "reconcile failed") (${warns.length})`, warns);

  // CONTROL: the pre-x5 bridge (a patched copy whose seat state is always 'free') on the same scenario
  const src = read('src/server/desktop-stream.js');
  const from = "    if (!viewerSeats || !seat) return 'free';";
  ok(src.split(from).length === 2, 'the seat gate is spelled once in the bridge (the control patches exactly it)');
  const mfile = MUTV.write('src/server/desktop-stream.js', src.replace(from, "    return 'free'; // pre-x5: every socket relayed"), 'stream');
  const skipLine = "if (typeof c.reconcile !== 'function') continue; ";
  ok(src.split(skipLine).length === 2, 'LOW-1: the refresh skip is spelled once (the control removes exactly it)');
  const lfile = MUTV.write('src/server/desktop-stream.js', src.replace(skipLine, ''), 'low1');
  const L1 = await xpraScenario(require(lfile), 'CONTROL LOW-1 (no skip)');
  const l1w = L1.log.filter((l) => /^W .*reconcile failed — c\.reconcile is not a function/.test(l));
  ok(l1w.length >= 5, `CONTROL: without the skip every join logs the false "reconcile failed — c.reconcile is not a function" warn (${l1w.length} over 5 joins)`, L1.log.filter((l) => l.startsWith('W ')).slice(0, 3));
  const M = await xpraScenario(require(mfile), 'CONTROL pre-x5 bridge');
  ok(M.connsAfterB === 2 && M.bTypes.includes('display-configure') && M.bTypes.includes('configure-window') && M.bTypes.includes('key-action'), `CONTROL: through the pre-x5 bridge the "blocked" viewer B gets its own upstream (${M.connsAfterB} connections) and its packets reach xpra (${M.bTypes.join(', ')}) — its display size, geometry and keys resize and drive the ACTIVE viewer's app`, M.bTypes);
}
{
  const up = await fakeRfb();
  const R = await rig(DS, { kind: 'rfb', upstreamPort: up.port });
  const A = await R.viewer('v-a', 'pa');
  await until(() => A.back.length);
  ok(up.st.conns === 1 && Buffer.concat(A.back).toString('latin1').startsWith('RFB 003.008'), 'rfb: A (first) is active — its TCP opens, the banner comes back');
  const B = await R.viewer('v-b', 'pb');
  await sleep(80);
  B.send(Buffer.from('RFB 003.008\n'));
  await sleep(80);
  ok(up.st.conns === 1 && B.back.length === 0 && up.st.got.length === 0, `rfb: B is BLOCKED — no TCP for it (${up.st.conns} connection), 0 bytes either way`);
  R.k.takeoverViewer('da-x', 'v-b');
  await until(() => B.back.length && A.closed, 2000);
  ok(up.st.conns === 2 && Buffer.concat(B.back).toString('latin1').startsWith('RFB 003.008') && A.closed && A.closed.code === 4001, 'rfb: Resume here on B ⇒ B\'s TCP opens (a fresh handshake for a fresh socket) and A is cut 4001', { conns: up.st.conns, a: A.closed });
  A.close(); B.close(); await R.close(); await up.close();
}

console.log('§4 the route + the wiring pins');
{
  const express = require(path.join(repo, 'node_modules/express'));
  const routes = require(path.join(repo, 'src/routes/desktop-apps.js'));
  const alive = new Set(['v-a', 'v-b']);
  const k = K.create({ dataDir: path.join(root, 'route'), env: () => ({}), broadcast: () => {}, log: { log() {}, warn() {} } });
  k._store().apps['da-r'] = { id: 'da-r', state: 'ready', label: 'r', pids: {}, starts: {} };
  k.viewerJoined('da-r', { viewerId: 'v-a', pane: 'pa' }); k.viewerJoined('da-r', { viewerId: 'v-b', pane: 'pb' });
  let leaseIn = null; const takes = [];
  const engine = { leaseInput: () => leaseIn, takeover: (o) => { takes.push(o); return { ok: true, lease: { input: 'user', takenBy: { tag: 'tk-9' } } }; }, leaseOf: () => null };
  routes.setup({ keeper: k, windowEngine: engine, stream: { viewerAlive: (id, v) => alive.has(v) } });
  const app = express(); app.use(express.json()); app.use(routes.router);
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json() }; };
  const g = await (await fetch(`${base}/api/desktop/apps/da-r/viewers`)).json();
  ok(g.type === 'desktop-app-viewers' && g.active === 'pa' && g.viewers.length === 2, 'GET /api/desktop/apps/:id/viewers answers the broadcast payload (panes)', g);
  const r1 = await post('/api/desktop/apps/da-r/viewers/takeover', { viewerId: 'v-b' });
  ok(r1.status === 200 && r1.j.ok && r1.j.viewers.active === 'pb' && k.activeViewer('da-r') === 'v-b' && takes.length === 0, 'POST …/viewers/takeover (no lease): a plain swap — B active, the engine never asked', r1.j);
  const r2 = await post('/api/desktop/apps/da-r/viewers/takeover', { viewerId: 'v-gone' });
  ok(r2.status === 409 && r2.j.code === 'no_viewer', 'a pane whose socket is not open ⇒ 409 no_viewer, said in words', r2.j);
  leaseIn = { input: 'user', holder: 'v-b' };
  const r3 = await post('/api/desktop/apps/da-r/viewers/takeover', { viewerId: 'v-a' });
  ok(r3.status === 200 && takes.length === 1 && takes[0].viewerId === 'v-a' && takes[0].holderAlive === false && r3.j.lease.takenBy.tag === 'tk-9' && k.activeViewer('da-r') === 'v-a', 'an agent\'s window HELD by another human ⇒ the engine\'s takeover with holderAlive:false (the hold MOVES, never handed back — nothing announced, nothing billed), the taker active, its tag answered', { takes, j: r3.j });
  leaseIn = { input: 'agent', holder: null };
  await post('/api/desktop/apps/da-r/viewers/takeover', { viewerId: 'v-b' });
  ok(takes.length === 2 && takes[1].holderAlive === undefined, 'an agent DRIVING ⇒ the engine\'s ordinary human takeover (its own holder check)');
  await new Promise((r) => srv.close(r));
  // WIRING PINS — code at the start of a line, never text after a mid-line // (the 2.369.134 lesson)
  const code = read('src/server/window-live-wiring.js').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
  ok(/viewerSeats: \{/.test(code) && /state: \(id, viewerId\) => \(governed\(id\) \? DV\.viewerState\(\{ active: keeper\.activeViewer\(id\) \}, viewerId, engine\.leaseInput\(id\)\) : 'free'\)/.test(code), 'WIRING PIN: the bridge\'s seat state IS the PURE rule over the keeper\'s election and the engine\'s lease');
  ok(/keeper\.onViewers\?\.\(\(id\) => stream\.refresh\(id\)\)/.test(code) && /m\.type === 'window-leases-updated'\) \{ try \{ streamRef\?\.refreshAll\(\)/.test(code), 'WIRING PIN: a viewer change and every lease broadcast re-apply the sockets (refresh / refreshAll)');
  const rsrc = read('src/routes/desktop-apps.js');
  ok(/const v = ctx\.keeper\.takeoverViewer \? ctx\.keeper\.takeoverViewer\(req\.params\.id, viewerId\) : null;/.test(rsrc), 'WIRING PIN: the lease takeover route makes the taker the active viewer too');
  const w = read('src/lib/desktop-app-window.js');
  ok(/blockedTitle\.textContent = /.test(w) && !/blockedTitle\.innerHTML/.test(w) && /t\('Active on another client'\)/.test(w) && /t\('Resume here'\)/.test(w), 'the overlay names the app as TEXT (a title is peer-controlled) with the two words through t()');
  ok(/optimistic = \{ state: 'active'/.test(w) && w.indexOf('renderSeat(); // the overlay goes NOW') < w.indexOf("/viewers/takeover`"), 'Resume here flips the pane BEFORE the request (never waits for the broadcast echo)');
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const keys = ['Active on another client', 'Resume here', 'Make this window the active one — the other client is blocked until it resumes', 'Could not resume here'];
  ok(keys.every((k2) => zh[k2] && ja[k2]), 'the four new chrome strings have zh + ja entries');
}

console.log('§5 the grace, LOW-4, LOW-3, LOW-2 (2.369.156)');
{
  // ── the GRACE (INFO a, the product's default): the active pane's seat is held while it reconnects ──
  ok(K.VIEWER_GRACE_MS === 5000 && K.create({ dataDir: path.join(root, 'g-default'), env: () => ({}), broadcast: () => {}, log: { log() {}, warn() {} } }).viewerGraceMs === 5000, 'the default grace is 5 s (VIEWER_GRACE_MS) — a keeper made without the option holds the seat that long');
  const gb = [];
  const G = 200;
  const kg = K.create({ dataDir: path.join(root, 'g'), env: () => ({}), broadcast: (m) => gb.push(m), viewerGraceMs: G, log: { log() {}, warn() {} } });
  const last = () => gb.filter((m) => m.type === 'desktop-app-viewers' && m.id === 'da-g').slice(-1)[0];
  const st = (v) => DV.viewerState({ active: kg.activeViewer('da-g') }, v, null);
  kg.viewerJoined('da-g', { viewerId: 'v-a', pane: 'pa' }); kg.viewerJoined('da-g', { viewerId: 'v-b', pane: 'pb' });
  kg.viewerLeft('da-g', 'v-a');
  ok(kg.activeViewer('da-g') === null && st('v-b') === 'blocked' && last().active === 'pa' && DV.paneState({ active: last().active, myPane: 'pb' }) === 'blocked', 'the ACTIVE pane\'s socket closes while B watches ⇒ nobody is elected yet: B stays BLOCKED (bridge and client both), the broadcast still names pane pa', last());
  await sleep(5); // pc joins strictly later than pb (the recency tie-break below is by join time)
  kg.viewerJoined('da-g', { viewerId: 'v-c', pane: 'pc' });
  ok(kg.activeViewer('da-g') === null && st('v-c') === 'blocked', 'another client (pc) attaching INSIDE the grace is blocked too — never "first attach"');
  kg.viewerJoined('da-g', { viewerId: 'v-a2', pane: 'pa' });
  ok(kg.activeViewer('da-g') === 'v-a2' && last().active === 'pa', 'pane pa reconnecting inside the grace (a network blip: the same window, a new socket) takes its seat BACK');
  await sleep(G + 120);
  ok(kg.activeViewer('da-g') === 'v-a2', 'the grace\'s timer is gone with it: nothing re-elects afterwards');
  kg.viewerLeft('da-g', 'v-a2');
  kg.viewerJoined('da-g', { viewerId: 'v-a3', pane: 'pa-reload', prev: 'pa' });
  ok(kg.activeViewer('da-g') === 'v-a3' && last().active === 'pa-reload', 'a PAGE RELOAD: the new window (a fresh pane key) names pa as its predecessor (`prev`) ⇒ it keeps the seat');
  kg.viewerJoined('da-g', { viewerId: 'v-d', pane: 'pd', prev: 'pa' });
  ok(kg.activeViewer('da-g') === 'v-a3', '`prev` outside a grace changes nothing (a duplicated tab carries the same hint — it never takes a live seat)');
  kg.viewerLeft('da-g', 'v-d');
  kg.viewerLeft('da-g', 'v-a3');
  ok(kg.activeViewer('da-g') === null, '…the reloaded pane leaves too: held again');
  await sleep(G + 120);
  ok(kg.activeViewer('da-g') === 'v-c' && last().active === 'pc', 'the grace runs out with nobody back ⇒ the most recently active remaining viewer (never active: the most recently joined, pc) takes over by itself', last());
  kg.viewerLeft('da-g', 'v-c');
  ok(kg.activeViewer('da-g') === null, 'pc leaves: held for pc');
  const tk = kg.takeoverViewer('da-g', 'v-b');
  await sleep(G + 120);
  ok(tk.ok && kg.activeViewer('da-g') === 'v-b', 'Resume here INSIDE a grace wins at once, and the grace ends with it (still B after the timer would have fired)');
  // CONTROL: grace 0 — the pre-default rule: the reload hands the app to the other device at once
  const k0 = K.create({ dataDir: path.join(root, 'g0'), env: () => ({}), broadcast: () => {}, viewerGraceMs: 0, log: { log() {}, warn() {} } });
  k0.viewerJoined('da-0', { viewerId: 'v-a', pane: 'pa' }); k0.viewerJoined('da-0', { viewerId: 'v-b', pane: 'pb' });
  k0.viewerLeft('da-0', 'v-a');
  k0.viewerJoined('da-0', { viewerId: 'v-a2', pane: 'pa-reload', prev: 'pa' });
  ok(k0.activeViewer('da-0') === 'v-b', 'CONTROL: with no grace the same reload finds the app already handed to the OTHER device (B) — what the default prevents');

  // ── LOW-4: the active pane's NEWER socket takes the seat at once (keeper) ──
  const k4 = K.create({ dataDir: path.join(root, 'k4'), env: () => ({}), broadcast: () => {}, viewerGraceMs: G, log: { log() {}, warn() {} } });
  k4.viewerJoined('da-4', { viewerId: 'v-a', pane: 'pa' }); k4.viewerJoined('da-4', { viewerId: 'v-b', pane: 'pb' });
  k4.viewerJoined('da-4', { viewerId: 'v-a9', pane: 'pa' });
  ok(k4.activeViewer('da-4') === 'v-a9' && k4.viewersView('da-4').viewers.length === 2, 'LOW-4: pane pa reconnects through a new socket while its old one still holds the seat (a silent drop) ⇒ the seat moves to the NEWEST socket at once; still one row per pane');
  k4.viewerJoined('da-4', { viewerId: 'v-b2', pane: 'pb' });
  ok(k4.activeViewer('da-4') === 'v-a9', 'a BLOCKED pane reconnecting moves nothing');

  // ── the bridge: LOW-4 measured, the grace, LOW-3 ──
  const src = read('src/server/desktop-stream.js');
  const ksrc = read('src/server/desktop-app-keeper.js');
  const low4 = 'if (cur && cur.pane === p && s.active !== v) {';
  ok(ksrc.split(low4).length === 2, 'LOW-4: the seat move is spelled once in the keeper (the control disables exactly it)');
  const kfile = MUTV.write('src/server/desktop-app-keeper.js', ksrc.replace(low4, 'if (false && cur && cur.pane === p && s.active !== v) {'), 'keeper');
  const low4Leg = async (Kmod) => {
    const up = await fakeXpra();
    const R = await rig(DS, { kind: 'xpra', upstreamPort: up.port, Kmod });
    const A = await R.viewer('v-a', 'pa');
    await until(() => up.st.conns >= 1);
    A.send(rpkt('hello'));
    await until(() => up.st.got.length >= 1);
    A.drop(); // a SILENT drop: no close frame, no pong — the server still believes in it
    const t0 = Date.now();
    const A2 = await R.viewer('v-a2', 'pa');
    A2.send(Buffer.concat([rpkt('hello'), rpkt('key-action')]));
    const c2 = await until(() => (up.st.conns >= 2 ? up.st.conns : null), 1500);
    const got = c2 ? await until(() => { const g = up.st.got.filter((x) => x.conn === c2).map((x) => x.type); return g.length >= 2 ? g : null; }, 1500) : null;
    const ms = Date.now() - t0;
    const out = { active: R.k.activeViewer('da-x'), conns: up.st.conns, got, ms, upClosed: up.st.closed };
    try { A.ws.terminate(); } catch {} A2.close(); await R.close(); await up.close();
    return out;
  };
  const L4 = await low4Leg(K);
  ok(L4.active === 'v-a2' && L4.got && L4.got.join() === 'hello,key-action' && L4.ms < 1000 && L4.upClosed >= 1, `LOW-4 through the bridge: the active pane's old socket silently dropped, its new one attaches ⇒ ACTIVE in ${L4.ms} ms (was up to two ping rounds, 29.8 s measured): its hello + keys reach xpra, the old upstream is closed`, L4);
  const L4c = await low4Leg(require(kfile));
  ok(L4c.active === 'v-a' && L4c.conns === 1 && L4c.got === null, `CONTROL: without the seat move the pane's own reconnect is BLOCKED behind its dead socket (still ${L4c.active}; ${L4c.conns} upstream connection) — until the pings notice`, L4c);

  // the grace through the bridge: the active pane closes, B stays without an upstream, the pane's reconnect gets it
  {
    const up = await fakeXpra();
    const R = await rig(DS, { kind: 'xpra', upstreamPort: up.port, graceMs: 400 });
    const A = await R.viewer('v-a', 'pa'); await until(() => up.st.conns >= 1);
    const B = await R.viewer('v-b', 'pb'); await sleep(60);
    A.close();
    await sleep(200);
    const midConns = up.st.conns;
    const A2 = await R.viewer('v-a2', 'pa');
    const c2 = await until(() => (up.st.conns >= 2 ? up.st.conns : null), 1500);
    await sleep(500);
    ok(midConns === 1 && c2 === 2 && up.st.conns === 2 && R.k.activeViewer('da-x') === 'v-a2', `the grace through the bridge: A's socket closes ⇒ B gets NO upstream during it (${midConns} connection), A's pane reconnecting inside it is active (${up.st.conns} connections, never one for B)`, { midConns, conns: up.st.conns, active: R.k.activeViewer('da-x') });
    A2.close(); B.close(); await R.close(); await up.close();
  }

  // LOW-3: an ANONYMOUS socket watches and is never elected
  const anonLeg = async (Smod) => {
    const up = await fakeXpra();
    const R = await rig(Smod, { kind: 'xpra', upstreamPort: up.port });
    const N = await R.viewer(null, null);
    await until(() => up.st.conns >= 1, 1000);
    N.send(Buffer.concat([rpkt('hello'), rpkt('key-action'), rpkt('configure-window'), rpkt('display-configure'), rpkt('map-window')]));
    await sleep(150);
    const anonTypes = up.st.got.filter((g) => g.conn === 1).map((g) => g.type);
    const A = await R.viewer('v-a', 'pa');
    await sleep(100);
    const aConn = up.st.conns;
    A.send(Buffer.concat([rpkt('hello'), rpkt('key-action')]));
    await sleep(150);
    const aTypes = up.st.got.filter((g) => g.conn === aConn).map((g) => g.type);
    const out = { anonTypes, aTypes, active: R.k.activeViewer('da-x'), panes: R.k.viewersView('da-x').viewers.map((v) => v.id), log: R.log.filter((l) => /ANONYMOUS/.test(l)) };
    A.close(); await sleep(80);
    out.afterA = R.k.activeViewer('da-x');
    N.close(); await R.close(); await up.close();
    return out;
  };
  const N3 = await anonLeg(DS);
  ok(N3.anonTypes.join() === 'hello,map-window', `LOW-3: an ANONYMOUS socket (the hosted upstream page) is a WATCH seat: its hello and map-window reach xpra, its key-action / configure-window / display-configure are cut (${N3.anonTypes.join(', ')})`, N3);
  ok(N3.active === 'v-a' && N3.aTypes.join() === 'hello,key-action' && N3.panes.join() === 'pa' && N3.afterA === null && N3.log.length === 1, 'LOW-3: …it is never elected — the first NAMED pane is active and drives, the broadcast lists only named panes, and when that pane leaves nobody (not the anonymous socket) is active; the bridge names it once', N3);
  const seatAt = 'const seat = viewerSeats ? (viewerId || ANON) : null;';
  ok(src.split(seatAt).length === 2, 'LOW-3: the anonymous seat is spelled once (the control restores the old `anon-<n>` seating)');
  const afile = MUTV.write('src/server/desktop-stream.js', src.replace(seatAt, "const seat = viewerSeats ? (viewerId || 'anon-1') : null;"), 'anon');
  const N3c = await anonLeg(require(afile));
  ok(N3c.anonTypes.includes('key-action') && N3c.anonTypes.includes('configure-window') && N3c.active === 'anon-1', `CONTROL: seated as anon-<n> (the pre-fix bridge) the anonymous socket TAKES the active seat and its keys + geometry reach xpra (${N3c.anonTypes.join(', ')}; active ${N3c.active})`, N3c);

  // ── LOW-2: the xpra rung's RECORD names the app for a blocked pane ──
  const D = require(path.join(repo, 'src/desktop-display.js'));
  const hostile = 'vs-x5 <b>"t"</b> & <img src=x onerror=alert(1)>';
  const rows = [
    { id: 0x200006, name: 'Xpra-CorralWindow-0xa00005', cls: null, instance: null, x: 0, y: 0, w: 640, h: 472, depth: 1, mapped: true },
    { id: 0xa00005, name: hostile, cls: 'XTerm', instance: 'xterm', x: 0, y: 0, w: 640, h: 472, depth: 2, mapped: true },
    { id: 0xa00003, name: 'xterm', cls: 'XTerm', instance: 'xterm', x: 0, y: 0, w: 1, h: 1, depth: 1, mapped: true },
  ];
  let reads = 0;
  const fakeDisplay = { ...D, enumerateWindows: async () => { reads++; return { ok: true, why: null, windows: rows.map((r) => ({ ...r })) }; } };
  const tb = [];
  const kt = K.create({ dataDir: path.join(root, 't'), env: () => ({ PATH: process.env.PATH }), broadcast: (m) => tb.push(m), display: fakeDisplay, viewerGraceMs: 0, log: { log() {}, warn() {} } });
  kt._store().apps['da-t'] = { id: 'da-t', state: 'ready', backend: 'xpra', display: ':93', label: 'the launch label', pids: {}, starts: {} };
  kt._store().apps['da-v'] = { id: 'da-v', state: 'ready', backend: 'vnc-display', display: ':94', label: 'vnc', pids: {}, starts: {} };
  kt.viewerJoined('da-t', { viewerId: 'v-a', pane: 'pa' });
  ok(reads === 0, 'the ACTIVE pane reads the title off its own protocol — no X read for the first attach');
  kt.viewerJoined('da-t', { viewerId: 'v-b', pane: 'pb' });
  await until(() => kt.get('da-t').appTitle, 1000);
  const upd = tb.filter((m) => m.type === 'desktop-apps-updated').slice(-1)[0];
  const rowT = upd && upd.apps.find((a) => a.id === 'da-t');
  ok(reads === 1 && kt.get('da-t').appTitle === hostile && rowT && rowT.appTitle === hostile, `LOW-2: a BLOCKED pane appears on the xpra rung ⇒ the keeper reads X once and the RECORD carries the app's own title, verbatim as data (the Corral wrapper and the 1x1 leader skipped): ${JSON.stringify(kt.get('da-t').appTitle)}`, { reads, rec: kt.get('da-t') });
  kt.viewerJoined('da-t', { viewerId: 'v-c', pane: 'pc' }); kt.viewerJoined('da-t', { viewerId: 'v-d', pane: 'pd' });
  await sleep(50);
  ok(reads === 1, 'a burst of blocked joins reads X once (at most once a second off the tick, every 10 s on it)');
  kt.viewerJoined('da-v', { viewerId: 'v-a', pane: 'pa' }); kt.viewerJoined('da-v', { viewerId: 'v-b', pane: 'pb' });
  await sleep(50);
  ok(reads === 1 && kt.get('da-v').appTitle == null, 'a vnc-display record is never read here (its fit runs record the title already)');
  kt.shutdown();
  // CONTROL: the keeper before LOW-2 (the join's read removed) — the xpra record never learns the title, so a blocked pane's overlay could only name the label
  const joinRead = "if (s.active !== v) refreshAppTitle(id, 'blocked-join');";
  ok(ksrc.split(joinRead).length === 2, 'LOW-2: the blocked join\'s title read is spelled once (the control removes exactly it)');
  const tfile = MUTV.write('src/server/desktop-app-keeper.js', ksrc.replace(joinRead, ''), 'title');
  reads = 0;
  const kc = require(tfile).create({ dataDir: path.join(root, 'tc'), env: () => ({ PATH: process.env.PATH }), broadcast: () => {}, display: fakeDisplay, viewerGraceMs: 0, log: { log() {}, warn() {} } });
  kc._store().apps['da-t'] = { id: 'da-t', state: 'ready', backend: 'xpra', display: ':93', label: 'the launch label', pids: {}, starts: {} };
  kc.viewerJoined('da-t', { viewerId: 'v-a', pane: 'pa' }); kc.viewerJoined('da-t', { viewerId: 'v-b', pane: 'pb' });
  await sleep(100);
  ok(reads === 0 && kc.get('da-t').appTitle == null, `CONTROL: without the read the blocked pane's record has no title (${JSON.stringify(kc.get('da-t').appTitle)}) — the overlay falls to the launch label "${kc.get('da-t').label}"`);
  kc.shutdown();
  const w = read('src/lib/desktop-app-window.js');
  ok(/const titleText = \(\) => \(seatState\(\) === 'blocked' \? \(rec && rec\.appTitle\) \|\| appTitle : appTitle \|\| \(rec && rec\.appTitle\)\) \|\| \(rec && rec\.label\) \|\| t\('Desktop app'\);/.test(w), 'the window: a BLOCKED pane names the app by the record\'s title first (its own protocol title is the last one it saw before the cut), an active one by its live protocol title — the launch label only when neither exists');
  ok(/sessionStorage\.getItem\(prevKey\)/.test(w) && /&prev=\$\{encodeURIComponent\(prevPane\)\}/.test(w), 'the window names its predecessor pane (`prev`, per tab, sessionStorage) on its stream url — the grace\'s reload successor');
}

console.log('§6 (desktop A r1) a Scale ▸ relaunch CARRIES the active seat to the successor — the relaunching pane is never blocked on its own window');
{
  const R = 150;
  const cb = [];
  const kr = K.create({ dataDir: path.join(root, 'rl'), env: () => ({}), broadcast: (m) => cb.push(m), viewerGraceMs: 0, relaunchSeatMs: R, log: { log() {}, warn() {} } });
  ok(K.RELAUNCH_SEAT_MS === 10000 && typeof kr.carrySeat === 'function', 'the keeper exposes carrySeat and a RELAUNCH_SEAT_MS of 10 s (how long the carried seat waits for its pane after the relaunch answer)');
  // L active on the old app, H blocked (x5); the relaunch carries L's seat; the OTHER client retargets from the broadcast and
  // attaches FIRST (the measured race: the relaunching client learns its successor only from the HTTP answer, after the teardown)
  kr.viewerJoined('da-old', { viewerId: 'v-L', pane: 'pL' }); kr.viewerJoined('da-old', { viewerId: 'v-H', pane: 'pH' });
  const arm = kr.carrySeat('da-old', 'da-new');
  kr.viewerJoined('da-new', { viewerId: 'v-H2', pane: 'pH' });
  const lastNew = () => cb.filter((m) => m.type === 'desktop-app-viewers' && m.id === 'da-new').slice(-1)[0];
  ok(kr.activeViewer('da-new') === null && lastNew() && lastNew().active === 'pL', 'the other client (pH) attaching FIRST to the successor is BLOCKED — the broadcast already names pane pL as the seat holder', lastNew());
  kr.viewerJoined('da-new', { viewerId: 'v-L2', pane: 'pL' });
  ok(kr.activeViewer('da-new') === 'v-L2' && lastNew().active === 'pL', 'the relaunching pane (same pane key, a new socket) attaches second and is ACTIVE with no Resume');
  arm();
  await sleep(R + 80);
  ok(kr.activeViewer('da-new') === 'v-L2', 'arming after the seat was taken changes nothing');
  // the relaunching pane never comes (its window closed): the hold waits through the teardown, then runs out after the answer
  kr.viewerJoined('da-o2', { viewerId: 'v-P', pane: 'pP' });
  const arm2 = kr.carrySeat('da-o2', 'da-n2');
  kr.viewerJoined('da-n2', { viewerId: 'v-Q', pane: 'pQ' });
  await sleep(R + 80);
  ok(kr.activeViewer('da-n2') === null, 'unarmed (the old session is still being torn down) the carried seat is HELD whatever the time');
  arm2();
  await sleep(R + 80);
  ok(kr.activeViewer('da-n2') === 'v-Q', 'armed at the answer, the hold runs out after relaunchSeatMs ⇒ the remaining viewer takes over (never a seat held forever)');
  // nobody active on the old app ⇒ nothing to carry; an unknown old id too
  kr.viewerJoined('da-o3', { viewerId: 'v-W', pane: 'pW' }); kr.viewerLeft('da-o3', 'v-W');
  const arm3 = kr.carrySeat('da-o3', 'da-n3'); arm3();
  kr.viewerJoined('da-n3', { viewerId: 'v-X', pane: 'pX' });
  ok(kr.activeViewer('da-n3') === 'v-X' && typeof kr.carrySeat('da-none', 'da-n4') === 'function', 'no active pane on the old app ⇒ nothing carried: the first attach is active as ever (and an unknown id arms a no-op)');
  // CONTROL — the pre-r1 relaunch (no carry): the first attach wins, and it is the OTHER client
  const kc = K.create({ dataDir: path.join(root, 'rl-ctl'), env: () => ({}), broadcast: () => {}, viewerGraceMs: 0, log: { log() {}, warn() {} } });
  kc.viewerJoined('da-new', { viewerId: 'v-H2', pane: 'pH' }); kc.viewerJoined('da-new', { viewerId: 'v-L2', pane: 'pL' });
  ok(kc.activeViewer('da-new') === 'v-H2', 'CONTROL: without the carry the previously BLOCKED client wins the first-attach election (the verifier\'s server log)');
  const ksrc = fs.readFileSync(path.join(repo, 'src/server/desktop-app-keeper.js'), 'utf8');
  ok(/const armSeat = carrySeat\(id, next\.id\);\s*\n\s*rec\.replacedBy = next\.id;/.test(ksrc) && /finally \{ armSeat\(\); \}/.test(ksrc), 'WIRING PIN: relaunch() carries the seat BEFORE it commits replacedBy (the other clients retarget from that broadcast) and arms the hold after the old session\'s stop, even a failed one');
}

// ── tree: THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\ntree: the patched copies never touch the tree');
for (const r of copiesCensus(MUTV.files, MUTV.dir, repo, { minCopies: 5 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
