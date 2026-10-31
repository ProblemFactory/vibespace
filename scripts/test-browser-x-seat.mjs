#!/usr/bin/env node
// ONE PERSON, ONE SEAT — the person browsing a browser himself acts on its X picture too (lane desktop-x-seat-browser,
// 2026-10-30; the owner, browsing «Shared (legacy)» himself on the attach road: «桌面打开虽然能看到 passkey 弹窗但无法点击» /
// «桌面模式打开从一开始就无法交互，和 passkey 无关»). MEASURED on 43d0f8d2d (a scratch hub, a headed Chrome on a scratch xpra
// display, the real bundle in a viewer Chrome): the desktop window on the browser's display believed itself active and the bridge
// cut every packet it sent (117 / 2471 «refused (watch-mode)»), while CDP's own clicks never reached Chrome's passkey dialog.
// r2 (主开发's acceptance r1 on cd952053d): the person's seat is an INPUT seat SCOPED to his own window (MAJOR A — an 'active'
// desktop socket replayed its display size + window geometry and fitted / slotted / belted the agents' Chrome windows), the door's
// label IS its act (MAJOR B — «Take over» called browse yourself), ONE socket of his at a time (FAIL 1 — two panes + another
// client were three 'active' sockets), and every socket is TOLD its seat in-band (FAIL 3 — 'watch-mode' reached only the log).
// In-process here, no browser, no display:
//   §1 PURE (src/browser-picture.js): deskSeat 'input' | 'watch' (a person's ELECTED socket while the browser has its human
//      holder), deskSeatWhy, xScopeOf (his window, Chrome's dialogs over it, the menus inside it), deskDoorAct, deskDoorOf; the
//      bridge's field reader (xpraFields) over real packets
//   §2 THE REAL WIRING (window-live-wiring install + the REAL desktop bridge + the REAL live-view relay, a fake keeper, a fake
//      xpra upstream): watch ⇒ cut and told why; browse yourself ⇒ his keymap replayed, his display size / geometry NEVER; his
//      keys and clicks on HIS window reach xpra, on another window / outside his window / any size, geometry or close: cut and
//      TOLD; two panes + another client ⇒ ONE seat (the newest pane), «Use it here» moves it, a pane gone re-elects; an agent's
//      token and a ticket-shaped id never type; his holding ended ⇒ cut, told
//   §3 THE ROUTES (GET / POST /api/desktop/apps/:id/browser-seat) and THE CLIENT (xpra-client hands the bridge's word to the view;
//      Watch's picture + his input sends no size)
//   §4 A SATELLITE PICTURE IS ONE INPUT WITH ITS IME (src/lib/keyboard-yield.js sameInput)
//   §5 THE WINDOW'S DOORS (source pins of src/lib/desktop-app-window.js, browser-live-window.js, xpra-view.js, style.css) and
//      their words (literal t() with zh + ja)
//   §6 MUTANTS — each rule's line undone in a copy of src: the leg that names it goes red
// Run: node scripts/test-browser-x-seat.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scratch, freePort } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { WebSocketServer, WebSocket } = require('ws');
const express = require('express');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000, step = 20) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { v = null; } if (v) return v; await sleep(step); } return null; };
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const ROOT = scratch('bxseat'); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const quiet = { log() { }, warn() { } };
const HEX = (n, k = 7) => Array.from({ length: n }, (_, i) => '0123456789abcdef'[(i * k + n) % 16]).join('');
const PERSON = 'wl-' + HEX(32), PERSON2 = 'wl-' + HEX(32, 3), OTHER = 'wl-' + HEX(32, 5), AGENT = 'wl-' + HEX(30) + 'aa', TICKET = 'xt-' + HEX(36);
const HIS = 7, MENU = 12, AGENTS = 9; // his Chrome window, a menu inside it, an agent's Chrome window (xpra wid = the X id)
const SCOPE = { wid: HIS, wids: [HIS, MENU], rects: [{ wid: HIS, x: 100, y: 50, w: 400, h: 300 }, { wid: MENU, x: 150, y: 100, w: 120, h: 80 }], known: [HIS, AGENTS, MENU] };

/** The shipped client's encoding (xpra-html5's rencode.js — rencodeplus, the 8-byte header): what a viewer's packets look like on the
 *  wire, booleans included (the bridge's own writer never needs one). */
function enc(v) {
  const out = [];
  const put = (x) => {
    if (x === null || x === undefined) { out.push(Buffer.from([69])); return; }
    if (typeof x === 'boolean') { out.push(Buffer.from([x ? 67 : 68])); return; }
    if (Array.isArray(x)) { out.push(Buffer.from([192 + x.length])); for (const e of x) put(e); return; }
    if (typeof x === 'string') { const b = Buffer.from(x, 'utf8'); out.push(b.length < 64 ? Buffer.from([128 + b.length]) : Buffer.from(`${b.length}:`, 'latin1')); out.push(b); return; }
    if (typeof x === 'number') {
      if (x >= 0 && x < 44) { out.push(Buffer.from([x])); return; }
      if (x < 0 && x >= -32) { out.push(Buffer.from([69 - x])); return; }
      if (x >= -128 && x < 128) { const b = Buffer.alloc(2); b[0] = 62; b.writeInt8(x, 1); out.push(b); return; }
      if (x >= -32768 && x < 32768) { const b = Buffer.alloc(3); b[0] = 63; b.writeInt16BE(x, 1); out.push(b); return; }
      const b = Buffer.alloc(5); b[0] = 64; b.writeInt32BE(x, 1); out.push(b); return;
    }
    const ks = Object.keys(x); out.push(Buffer.from([102 + ks.length])); for (const k of ks) { put(k); put(x[k]); }
  };
  put(v);
  const p = Buffer.concat(out), h = Buffer.alloc(8); h[0] = 0x50; h[1] = 0x10; h.writeUInt32BE(p.length, 4);
  return Buffer.concat([h, p]);
}
/** …and its decoder (a whole small packet: what the fake upstream and the viewer read — never the tree's own reader). */
function dec(p) {
  let i = 0;
  const one = () => {
    const b = p[i++];
    if (b < 44) return b;
    if (b >= 70 && b < 102) return 69 - b;
    if (b >= 128 && b < 192) { const s = p.toString('utf8', i, i + b - 128); i += b - 128; return s; }
    if (b >= 192) { const a = []; for (let k = 0; k < b - 192; k++) a.push(one()); return a; }
    if (b >= 102 && b < 127) { const o = {}; for (let k = 0; k < b - 102; k++) { const key = one(); o[key] = one(); } return o; }
    if (b === 62) { const v = p.readInt8(i); i += 1; return v; }
    if (b === 63) { const v = p.readInt16BE(i); i += 2; return v; }
    if (b === 64) { const v = p.readInt32BE(i); i += 4; return v; }
    if (b === 67 || b === 68) return b === 67;
    if (b === 69) return null;
    if (b === 59 || b === 60) { const list = b === 59, a = list ? [] : {}; while (p[i] !== 127) { if (list) a.push(one()); else { const key = one(); a[key] = one(); } } i++; return a; }
    if (b >= 0x30 && b <= 0x39) { let j = i - 1; while (p[j] >= 0x30 && p[j] <= 0x39) j++; const n = Number(p.toString('latin1', i - 1, j)); i = j + 1; const s = p.toString('utf8', i, i + n); i += n; return s; }
    throw new Error('undecodable ' + b);
  };
  try { return one(); } catch { return null; }
}
/** The modules of ONE tree (the worktree's, or a mutant copy — its own require cache). */
function load(root) {
  const r = (rel) => require(path.join(root, rel));
  return { PIC: r('src/browser-picture.js'), BS: r('src/server/browser-stream.js'), WL: r('src/server/window-live-wiring.js'), XR: r('src/server/stream-relay-xpra.js') };
}

/** §1 — PURE deskSeat over its table; → { ok, rows } */
function pureTable(PIC) {
  if (!PIC || typeof PIC.deskSeat !== 'function') return { ok: false, rows: 'deskSeat is not exported' };
  const rows = [
    [{ viewerId: PERSON, person: true, human: true }, 'input'],
    [{ viewerId: PERSON, person: true, human: true, elected: false }, 'watch'],
    [{ viewerId: PERSON, person: true, human: false }, 'watch'],
    [{ viewerId: AGENT, person: false, human: true }, 'watch'],
    [{ viewerId: TICKET, person: true, human: true }, 'watch'],
    [{ viewerId: null, person: true, human: true }, 'watch'],
  ].map(([a, want]) => ({ a, want, got: PIC.deskSeat(a) }));
  return { ok: rows.every((x) => x.got === x.want), rows };
}

/** §2 + §3 — THE REAL WIRING over a fake keeper and a fake xpra upstream; → the legs' facts. */
const STOP = Symbol('stop');
/** `need` (a mutant's): the scene ends as soon as that fact is measured — a broken rule's later legs are not waited out. */
async function scene(root, tag, need = null) {
  const L = load(root);
  const facts = { tag };
  const out = new Proxy(facts, { set: (o, k, v) => { o[k] = v; if (need && k === need) throw STOP; return true; } });
  const upPort = await freePort();
  const ups = [];
  const up = new WebSocketServer({ port: upPort, host: '127.0.0.1' }); await new Promise((r) => up.on('listening', r));
  up.on('connection', (ws) => {
    const c = { types: [], pk: [], answered: false }; ups.push(c);
    ws.on('message', (d) => {
      for (let x = Buffer.from(d); x.length >= 8;) { const n = x.readUInt32BE(4), p = x.subarray(8, 8 + n), ty = L.XR.xpraPacketType(p); c.types.push(ty); c.pk.push({ type: ty, wid: (() => { const f = dec(p); return Array.isArray(f) ? f[1] : null; })() }); x = x.subarray(8 + n); }
      if (!c.answered) { c.answered = true; ws.send(L.XR.rencodePlus(['hello', {}])); } // xpra's first word: the bridge's `owed` goes up after it
      for (let x = Buffer.from(d); x.length >= 8;) { const n = x.readUInt32BE(4), f = dec(x.subarray(8, 8 + n)); if (Array.isArray(f) && f[0] === 'ping') ws.send(enc(['ping_echo', f[1], 0, 0, 0, 0, ''])); x = x.subarray(8 + n); } // the FENCE: its echo comes down behind every word the bridge wrote before
    });
  });
  const recs = { 'da-x1': { id: 'da-x1', kind: 'display-for-browser', forBrowser: 'bp-x1', state: 'ready' }, 'app-1': { id: 'app-1', kind: 'app', state: 'ready' } };
  const deskKeeper = { get: (id) => recs[id] || null, streamTarget: (id) => (recs[id] ? { kind: 'xpra', port: upPort } : null), noteInput() { }, list: () => [], onViewers() { }, setWatchProbe() { } };
  const humans = new Set(); const leaseFns = [];
  const bk = {
    setFor: () => ({ attachments: [] }), list: () => ({ profiles: [] }),
    humanOf: (pid) => (humans.has(pid) ? { profileId: pid, browserKey: 'hu-' + String(pid).slice(3), state: 'driving' } : null),
    pictureSourceFor: (pid) => (pid === 'bp-x1' ? { source: 'x', why: 'attach', displaySession: 'da-x1' } : { source: 'screencast', why: 'driver', displaySession: null }),
    xScopeFor: async (pid, { browserKey } = {}) => (humans.has(pid) && browserKey === 'hu-' + String(pid).slice(3) ? JSON.parse(JSON.stringify(SCOPE)) : { wid: null, wids: [], rects: [], known: [] }),
    onLease: (fn) => { leaseFns.push(fn); return () => { }; },
  };
  const lease = (ev) => { for (const fn of leaseFns) fn(ev); };
  const relay = L.BS.create({ keeper: bk, activeSessions: new Map(), requestAuthed: () => true, log: quiet });
  const app = express(); app.use(express.json());
  const w = L.WL.install({ app, auth: { requestAuthed: () => true }, vnc: { port: 5900 }, keeper: deskKeeper, DESKTOP_SINGLETON_ID: 'desktop', dataDir: path.join(ROOT, 'data-' + tag), env: {}, activeSessions: new Map(), serverSetting: () => undefined, broadcast() { }, browserStream: relay, log: quiet });
  const srv = http.createServer(app);
  srv.on('upgrade', (req, socket, head) => { const id = w.desktopStream.upgradeId(new URL(req.url, 'http://x').pathname); if (id) w.desktopStream.handleUpgrade(req, socket, head, id); else socket.destroy(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const PORT = srv.address().port;
  const pkt = (a) => enc(a);
  const KEY = (wid) => ['key-action', wid, 'a', true, [], 97, 'a', 38, 0];
  const CLICK = (wid, x, y) => ['button-action', wid, 1, true, [x, y, 0, 0], [], []];
  const socks = [];
  const sock = async (viewer, { pane = viewer, headers = {} } = {}) => {
    const n0 = ups.length;
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/desktop/da-x1/stream?viewer=${viewer}&pane=${pane}`, ['binary'], { headers });
    const s = { ws, told: [], echoes: new Set(), up: null };
    ws.on('error', () => { });
    ws.on('message', (d) => { // the bridge's word to THIS socket (r2): ['vibespace-seat', {seat, why, code, refused, wids}]
      for (let x = Buffer.from(d); x.length >= 8;) { const n = x.readUInt32BE(4), p = x.subarray(8, 8 + n); const ty = L.XR.xpraPacketType(p); if (ty === 'vibespace-seat' || ty === 'ping_echo') { const f = dec(p); if (Array.isArray(f) && ty === 'ping_echo') s.echoes.add(f[1]); else if (Array.isArray(f) && f[1]) s.told.push(f[1]); } x = x.subarray(8 + n); }
    });
    await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
    socks.push(ws);
    ws.send(pkt(['hello', {}]));
    s.up = await until(() => (ups[n0] && ups[n0].answered ? ups[n0] : null));
    s.send = (...arrs) => { for (const a of arrs) ws.send(pkt(a)); };
    s.last = () => s.told[s.told.length - 1] || null;
    return s;
  };
  /** what the upstream got for `s` after it sent `arrs` and a ping behind them (the ping passes every seat), once the ping's echo is
   *  back down — THE FENCE (event-driven, no clock): every word the bridge wrote to `s` before it has arrived */
  let pings = 0;
  const after = async (s, ...arrs) => { const p = ++pings; const k0 = s.up.pk.length; s.send(...arrs, ['ping', p]); await until(() => s.echoes.has(p)); return s.up.pk.slice(k0).filter((x) => x.type !== 'ping'); };
  const typed = (got, wid) => got.some((x) => x.type === 'key-action' && (wid === undefined || x.wid === wid));
  const seatOf = async (viewer, id = 'da-x1') => { const r = await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${id}/browser-seat?viewer=${encodeURIComponent(viewer)}`); let j = null; try { j = await r.json(); } catch { } return { status: r.status, seat: j && j.seat, why: j && j.why, profileId: j && j.profileId }; };
  const take = async (viewer, headers = {}) => { const r = await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/da-x1/browser-seat`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ viewerId: viewer }) }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, ...(j || {}) }; };
  try {
    const P = await sock(PERSON, { pane: 'pane-a' }), A = await sock(AGENT, { headers: { Authorization: 'Bearer vsst_agenttoken' } }), T = await sock(TICKET);
    out.opened = !!(P.up && A.up && T.up);
    // ── nobody browses it: the person watches, TOLD why; his keymap, display size and geometry are cut (held by the base) ──
    await after(P);
    out.toldWatch = !!(P.last() && P.last().seat === 'watch' && P.last().why === 'not-browsing');
    const g0 = await after(P, ['keyboard-config', {}], ['desktop_size', 800, 600], ['configure-window', AGENTS, 0, 0, 800, 600, {}, 0, {}, false], KEY(HIS));
    out.watchCut = !!P.up && g0.length === 0;
    out.toldWatchRefused = !!(P.last() && P.last().refused > 0 && P.last().code === 'not-browsing');
    out.routeWatch = await seatOf(PERSON);
    // ── browse yourself: human-start re-seats the display AT ONCE — the held KEYMAP reaches xpra with nothing new sent, the held
    // display size and window geometry NEVER (MAJOR A: only the live view's ruling pane sizes a Chrome window) ──
    humans.add('bp-x1'); const k1 = P.up.types.length;
    lease({ kind: 'human-start', profileId: 'bp-x1', key: 'hu-x1' });
    out.agentCut = !typed(await after(A, KEY(HIS))); // …and a fence on ANOTHER socket — P itself sends nothing new (its own packet would re-judge its seat and replay)
    out.ticketCut = !typed(await after(T, KEY(HIS)));
    out.heldReplay = P.up.types.slice(k1).includes('keyboard-config') || !!(await until(() => P.up.types.slice(k1).includes('keyboard-config'), 1000));
    out.toldAgent = !!(A.last() && A.last().seat === 'watch' && A.last().why === 'watch-mode');
    await after(P);
    out.toldInput = !!(P.last() && P.last().seat === 'input' && Array.isArray(P.last().wids) && P.last().wids.includes(HIS) && P.last().wids.includes(MENU));
    const replayed = P.up.types.slice(k1);
    out.geometryNeverReplayed = !replayed.includes('desktop_size') && !replayed.includes('configure-window');
    // his keys and clicks on HIS window (and a menu inside it) reach xpra
    const g1 = await after(P, KEY(HIS), CLICK(HIS, 150, 80), CLICK(MENU, 160, 110), ['clipboard-token', 'CLIPBOARD']);
    out.personTypes = typed(g1, HIS) && g1.filter((x) => x.type === 'button-action').length === 2 && g1.some((x) => x.type === 'clipboard-token');
    // …another window never: a key, a click, a focus on the agent's window — cut, told 'not-your-window'
    const r0 = (P.last() || {}).refused || 0;
    const g2 = await after(P, KEY(AGENTS), CLICK(AGENTS, 600, 400), ['focus', AGENTS, []]);
    out.otherWidCut = g2.length === 0;
    out.toldNotYours = !!(P.last() && P.last().refused > r0 && P.last().code === 'not-your-window');
    // …the client's own focus of a window it drew, a pointer passing over it: cut, counted — never told (only his ACT is)
    const rq = (P.last() || {}).refused || 0;
    const gq = await after(P, ['focus', AGENTS, []], ['pointer-position', AGENTS, [600, 400], [], []], KEY(AGENTS));
    out.quietCut = gq.length === 0;
    out.focusQuiet = (P.last() || {}).refused === rq + 1;
    // …a press addressed to his window OUTSIDE it (xpra moves the X pointer to the packet's root point): cut
    out.outsideCut = (await after(P, CLICK(HIS, 900, 700))).length === 0;
    // …a display size, a geometry (his window's or an agent's), a close (his or an agent's), an unmap, a command: cut, told 'input-only'
    const r1 = (P.last() || {}).refused || 0;
    const g3 = await after(P, ['desktop_size', 640, 480], ['configure-window', HIS, 0, 0, 640, 480, {}, 0, {}, false], ['configure-window', AGENTS, 0, 0, 640, 480, {}, 0, {}, false], ['close-window', HIS], ['close-window', AGENTS], ['unmap-window', AGENTS, true]);
    out.geometryCut = g3.length === 0;
    out.toldInputOnly = !!(P.last() && P.last().refused > r1 && P.last().code === 'input-only');
    out.routeInput = await seatOf(PERSON);
    out.routeAgent = await seatOf(AGENT);
    // ── FAIL 1: ONE PERSON, ONE SEAT — a second pane, then another client: the NEWEST pane holds it, the others watch, told ──
    const P2 = await sock(PERSON2, { pane: 'pane-b' });
    await after(P2);
    out.secondPaneWins = typed(await after(P2, KEY(HIS))) && !typed(await after(P, KEY(HIS)));
    await after(P);
    out.toldOther = !!(P.last() && P.last().seat === 'watch' && P.last().why === 'other-window');
    const C = await sock(OTHER, { pane: 'pane-c', headers: { 'User-Agent': 'another-client' } });
    await after(C);
    const ones = [typed(await after(P, KEY(HIS))), typed(await after(P2, KEY(HIS))), typed(await after(C, KEY(HIS)))];
    out.oneSeat = ones.filter(Boolean).length === 1 && ones[2] === true;
    out.ones = ones;
    out.routeOther = await seatOf(PERSON);
    // «Use it here» on the FIRST pane: it takes the seat, the other client watches
    out.takeAgent = (await take(PERSON, { Authorization: 'Bearer vsst_agenttoken' })).status;
    out.takeBad = (await take('no spaces')).status;
    out.takeGone = (await take('wl-' + HEX(32, 9))).status;
    out.take = await take(PERSON);
    await after(P);
    out.takeHere = typed(await after(P, KEY(HIS))) && !typed(await after(C, KEY(HIS)));
    // that pane gone: the newest remaining pane takes the seat
    P.ws.terminate();
    await until(() => C.last() && C.last().seat === 'input', 1500);
    out.leaveReelect = typed(await after(C, KEY(HIS))) && !typed(await after(P2, KEY(HIS)));
    // ── his holding ended (human-end): cut again, told ──
    humans.delete('bp-x1'); lease({ kind: 'human-end', profileId: 'bp-x1', key: 'hu-x1' });
    await after(C);
    out.toldEnd = !!(C.last() && C.last().seat === 'watch' && C.last().why === 'not-browsing');
    out.endCut = !typed(await after(C, KEY(HIS)));
    out.routeAfter = await seatOf(OTHER);
    out.routeBad = (await seatOf('no spaces allowed')).status;
    out.routeMissing = (await seatOf(PERSON, 'da-gone')).status;
    out.routeApp = await seatOf(PERSON, 'app-1');
  } catch (e) { if (e !== STOP) facts.error = String(e && e.stack || e).slice(0, 600); }
  for (const s of socks) { try { s.terminate(); } catch { } }
  try { relay.shutdown(); } catch { } try { w.shutdown(); } catch { }
  try { srv.closeAllConnections?.(); } catch { }
  await new Promise((r) => srv.close(r)); await new Promise((r) => up.close(r));
  return facts;
}
/** §3 — the CLIENT over a fake Protocol worker: the bridge's word reaches `on.seat`; Watch's picture with his input (the view's
 *  'input' mode: watch + not view-only) sends his key and click and never a display size; → facts */
async function clientFacts(root) {
  const C = await import(pathToFileURL(path.join(root, 'src/lib/xpra-client.js')).href);
  class FakeWorker {
    constructor() { this.posted = []; FakeWorker.last = this; setTimeout(() => this.onmessage?.({ data: { c: 'r' } }), 0); }
    postMessage(m) { this.posted.push(m); if (m.c === 'o') setTimeout(() => this.onmessage?.({ data: { c: 'p', p: ['open'] } }), 0); }
    terminate() { }
    feed(p) { this.onmessage?.({ data: { c: 'p', p } }); }
    get all() { return this.posted.filter((m) => m.c === 's').map((m) => m.p); }
  }
  const seen = [];
  const c = C.createXpraClient({ url: 'ws://x', workerUrl: 'w.js', screen: { width: 800, height: 600 }, Worker: FakeWorker, on: { seat: (v) => seen.push(v) } });
  c.watch = true; c.viewOnly = false;
  c.connect();
  const w = await until(() => FakeWorker.last && FakeWorker.last.all.length ? FakeWorker.last : null, 2000);
  if (!w) { c.close?.(); return { error: 'no hello' }; }
  w.feed(['hello', { 'packet-types': ['keyboard-config'] }]);
  w.feed(['vibespace-seat', { seat: 'input', why: '', code: 'not-your-window', refused: 2, wids: [HIS] }]);
  w.feed(['new-window', HIS, 100, 50, 400, 300, { title: 'his' }, {}]);
  await sleep(0);
  const n0 = w.all.length;
  c.keyDown({ key: 'a', code: 'KeyA', keyCode: 65, mods: {} });
  c.pointerButton(150, 80, 0, true, {});
  c.resize(1000, 700);
  const sent = w.all.slice(n0).map((p) => p[0]);
  const maps = w.all.filter((p) => p[0] === 'map-window').map((p) => p.slice(1, 6));
  try { c.close?.(); } catch { }
  return { seen, sent, maps };
}
/** §4 — sameInput over a fake satellite (a pane, its stage + canvas, its IME) and a main picture shell; → facts */
async function satelliteFacts(root) {
  const KY = await import(pathToFileURL(path.join(root, 'src/lib/keyboard-yield.js')).href);
  class El {
    constructor(tag, cls = '', parent = null) { this.nodeType = 1; this.tagName = tag; this.className = cls; this.parent = parent; }
    contains(o) { for (let n = o; n; n = n.parent) if (n === this) return true; return false; }
    closest(sel) { const wants = String(sel).split(',').map((x) => x.trim()); for (let n = this; n && n.nodeType === 1; n = n.parent) { const cls = String(n.className).split(/\s+/); if (wants.some((x) => (x.startsWith('.') ? cls.includes(x.slice(1)) : n.tagName === x.toUpperCase()))) return n; } return null; }
  }
  const win = new El('DIV', 'window'), host = new El('DIV', 'desktop-satellite-mount', win);
  const sp = new El('DIV', 'xpra-pane xpra-satellite', host), st = new El('DIV', 'xpra-stage', sp), xw = new El('DIV', 'xpra-win', st), canvas = new El('CANVAS', '', xw), ime = new El('TEXTAREA', 'xpra-ime', sp);
  const other = new El('DIV', 'xpra-pane xpra-satellite', host), otherIme = new El('TEXTAREA', 'xpra-ime', other);
  const shell = new El('DIV', 'picture-shell', win), mainPane = new El('DIV', 'xpra-pane', shell), mainCanvas = new El('CANVAS', '', mainPane), mainIme = new El('TEXTAREA', 'xpra-ime', mainPane);
  return { satellite: KY.sameInput(canvas, ime), otherSatellite: KY.sameInput(canvas, otherIme), main: KY.sameInput(mainCanvas, mainIme) };
}
/** §5 — the doors' source facts of ONE tree; → facts */
function doorFacts(root) {
  const dw = read(root, 'src/lib/desktop-app-window.js'), live = read(root, 'src/lib/browser-live-window.js'), view = read(root, 'src/lib/xpra-view.js'), css = read(root, 'public/style.css');
  const rule = (css.match(/\n\.desktop-app-xseat \{[^}]*\}/) || [''])[0];
  return {
    unknownIsWatch: /const seatState = \(\) => \(browserDisplay\(\) \? bseat\.seat \|\| 'watch' :/.test(dw),
    failedIsWatch: /if \(!r \|\| r\.error \|\| !r\.seat\) setBrowserSeat\('watch', null, \{ failed: true \}\);/.test(dw) && dw.includes("t('View only — this window\\'s seat could not be read; it is asked again when it reconnects')"),
    told: /onSeat: \(v\) => applyBrowserSeat\(v\),/.test(dw) && /seat: \(v\) => \{ try \{ onSeat\?\.\(v\); \}/.test(view) && read(root, 'src/lib/xpra-client.js').includes("case 'vibespace-seat':"),
    labelIsAct: /xDoorBtn\.textContent = doorAct === 'take' \? t\('Use it here'\) : doorAct === 'open' \? t\('Open your browsing window'\) : t\('Browse yourself'\);/.test(dw)
      && /const takeSeatHere = \(\) => fetchJson\(`\/api\/desktop\/apps\/\$\{encodeURIComponent\(id\)\}\/browser-seat`, \{ method: 'POST'/.test(dw)
      && /if \(doorAct === 'take'\) \{\n\s*const r = await takeSeatHere\(\);/.test(dw)
      && /if \(\(doorAct === 'browse' \|\| doorAct === 'open'\) && typeof app\.browseYourself === 'function'\) \{\n\s*await takeSeatHere\(\);/.test(dw)
      && !/xDoorBtn\.textContent = t\('Take over'\)/.test(dw),
    doorVerdict: /const a = deskDoorAct\(\{ profile: prof, human: browserHuman\(\) \}\);/.test(dw) && /xDoorBtn\.style\.display = doorAct \? '' : 'none';/.test(dw),
    inputMode: /const next = m === 'watch' \|\| m === 'blocked' \|\| m === 'input' \? \(m === 'input' \? 'watch' : m\) : 'active';/.test(view) && /const sends = \(\) => mode === 'active' \|\| \(mode === 'watch' && inputSeat\);/.test(view) && /client\.viewOnly = viewOnly \|\| !sends\(\);/.test(view),
    liveDoorHuman: /deskDoorOf\(\{ source: pictureNow\(\), xShown: xOn\(\), stuck: st\.fact && st\.fact\.stuck, human: !!H \}\)/.test(live),
    liveDoorRejudged: /const renderMode = \(\) => \{\n    renderDeskDoor\(\);/.test(live) && /scheduleReport\(\); renderDeskDoor\(\);/.test(live) && /renderOwner\(\); renderDeskDoor\(\);/.test(live) && /const renderDialog = \(\) => \{\n    renderDeskDoor\(\);/.test(live),
    themeShadow: !!rule && !/rgba?\(/.test(rule) && rule.includes('box-shadow: var(--shadow-window)'),
    dw, live,
  };
}

// ═══ §1 ═══
console.log('§1 PURE — the seat, why it watches, his window\'s reach, the door\'s act (src/browser-picture.js); the bridge\'s field reader');
const W0 = load(REPO);
{ const p = pureTable(W0.PIC); ok(p.ok, "a person's ELECTED socket ⇒ 'input' only while the browser has its human holder; his other socket, no holder, an agent's socket, a ticket-shaped id, no id ⇒ 'watch'", p.rows); }
{
  const PIC = W0.PIC, why = typeof PIC.deskSeatWhy === 'function' ? PIC.deskSeatWhy : () => 'missing';
  ok(why({ viewerId: PERSON, person: true, human: true }) === null && why({ viewerId: PERSON, person: true, human: true, elected: false }) === 'other-window' && why({ viewerId: PERSON, person: true }) === 'not-browsing' && why({ viewerId: AGENT, human: true }) === 'watch-mode' && why({ viewerId: TICKET, person: true, human: true }) === 'watch-mode', "deskSeatWhy names every watch: 'other-window' (his other pane holds it), 'not-browsing' (its agents use it), 'watch-mode' (an agent's token, a ticket, no id); null = held");
  const sc = typeof PIC.xScopeOf === 'function' ? PIC.xScopeOf : () => ({ wids: [] });
  const rows = [
    { id: 10, title: 'a - Google Chrome', instance: 'google-chrome (/p)', cls: 'Google-chrome', x: 0, y: 0, w: 800, h: 600, frame: 5, depth: 2 },
    { id: 11, title: 'b - Google Chrome', instance: 'google-chrome (/p)', cls: 'Google-chrome', x: 900, y: 0, w: 800, h: 600, frame: 6, depth: 2 },
    { id: 12, title: '', instance: null, cls: null, x: 950, y: 100, w: 200, h: 100, depth: 1 },
    { id: 13, title: 'Open File', instance: 'chrome', cls: 'Chrome', x: 1000, y: 150, w: 400, h: 300, frame: 7, depth: 2 },
    { id: 14, title: '', instance: null, cls: null, x: 100, y: 100, w: 200, h: 100, depth: 1 },
  ];
  const s = sc(11, rows, { profileDir: '/p' });
  ok(JSON.stringify(s.wids) === JSON.stringify([11, 13, 12]) && s.rects.length === 3 && s.rects[0].x === 900 && JSON.stringify(s.known) === JSON.stringify([10, 11, 12, 13, 14]), "xScopeOf: HIS window, Chrome's dialog over it, the menu inside it — never the other browser window nor a menu over it; every row read is `known`", s);
  ok(sc(99, rows, { profileDir: '/p' }).wids.length === 0 && sc(null, rows).wids.length === 0, 'xScopeOf: his window not on the display (or untold) ⇒ it reaches nothing');
  const act = typeof PIC.deskDoorAct === 'function' ? PIC.deskDoorAct : () => ({ act: 'missing' });
  ok(act({ profile: null }).act === null && act({ profile: null }).code === 'not_attachable' && act({ profile: { id: 'bp-1', ephemeral: true } }).act === null && act({ profile: { id: 'bp-1' } }).act === 'browse' && act({ profile: { id: 'bp-1' }, human: true }).act === 'open', "deskDoorAct: browse-yourself's road (browse / open his window) — none on a conversation's temporary browser (not_attachable, said)");
}
{
  const PIC = W0.PIC, X = { source: 'x', why: 'attach', displaySession: 'da-x1' }, SC = { source: 'screencast', why: 'driver', displaySession: null };
  const pk = { state: 'passkey', headed: true }, sheet = { state: 'prompt', prompt: { type: 'http-auth', native: true } };
  const f = typeof PIC.deskDoorOf === 'function' ? PIC.deskDoorOf : () => 'missing';
  ok(f({ source: X, xShown: false, stuck: pk, human: true }) === 'da-x1' && f({ source: X, xShown: false, stuck: sheet, human: true }) === 'da-x1', "THE RAW FALLBACK's door in HIS browse window: Chrome's own window holds the page (a passkey request on a headed browser, Chrome's sign-in sheet) and the view draws the page's picture ⇒ the browser's display");
  ok(f({ source: X, xShown: false, stuck: pk }) === null, "…never in a conversation's view (the Desktop's seat reaches HIS window only — r2)");
  ok(f({ source: X, xShown: true, stuck: pk, human: true }) === null && f({ source: SC, stuck: pk, human: true }) === null && f({ source: X, stuck: { state: 'passkey', headed: false }, human: true }) === null && f({ source: X, stuck: { state: 'prompt', prompt: { type: 'file' } }, human: true }) === null && f({ source: X, stuck: null, human: true }) === null, 'no door when the view draws the X picture, off the X road, a headless passkey, a page prompt, no fact');
  ok(!!PIC.DESK_DOOR_WORDS && /Desktop/.test(PIC.DESK_DOOR_WORDS.line) && PIC.DESK_DOOR_WORDS.button === 'Open in Desktop', 'the ONE line lives in the shared words module (browser-picture.js DESK_DOOR_WORDS) — the way, never a second sentence');
}
{
  const XR = W0.XR, rp = (a) => enc(a).subarray(8), fx = typeof XR.xpraFields === 'function' ? XR.xpraFields : () => null;
  const a = fx(rp(['button-action', 4194307, 1, true, [-5, 300, 70000, -40000], ['control'], []]), 5), b = fx(rp(['key-action', 7, 'a', true, [], 97, 'a', 38, 0]), 2), c = fx(rp(['pointer-position', 1234567, [10, 20], [], []]), 3);
  ok(!!a && a[1] === 4194307 && a[3] === true && JSON.stringify(a[4]) === JSON.stringify([-5, 300, 70000, -40000]) && !!b && b[1] === 7 && !!c && c[1] === 1234567 && JSON.stringify(c[2]) === JSON.stringify([10, 20]), "xpraFields reads a packet's window id and pointer position (fixed / int8 / int16 / int32, negative too) — what the bridge scopes by", [a, b, c]);
  ok(fx(Buffer.from('l10:key-actioni7ee'), 2) === null && fx(Buffer.from([0xc3, 0x8a]), 2) === null && fx(Buffer.from([0x66, 0x00]), 2) === null, 'bencode, a truncated list, a non-list: unreadable — never "his window"');
}

// ═══ §2 ═══
console.log('§2 the REAL wiring — the desktop bridge, the live-view relay, a fake xpra upstream');
const S = await scene(REPO, 'main');
if (S.error) ok(false, 'the scene ran', S.error);
ok(S.opened, 'three sockets on the browser display: a person\'s (the desktop window), an agent\'s token, a ticket-shaped id');
ok(S.toldWatch === true && S.toldAgent === true, "FAIL 3 — every seated socket is TOLD its seat in-band: the person 'watch' / 'not-browsing', the agent's token 'watch' / 'watch-mode'");
ok(S.watchCut === true, 'no human holder: the person\'s key, keymap, display size and geometry are CUT');
ok(S.toldWatchRefused === true, "…and the refused act is told to THAT socket (its count, its code) — never only the hub's close line");
ok(S.heldReplay === true, 'browse yourself (human-start) re-seats the display AT ONCE: the keymap he sent while watching reaches xpra with nothing new sent');
ok(S.geometryNeverReplayed === true, "MAJOR A — the display size and the window geometry he sent while watching are NEVER replayed (only the live view's ruling pane sizes a Chrome window)");
ok(S.toldInput === true, "he is told his INPUT seat and the windows it reaches (his window + the menu inside it)");
ok(S.personTypes === true, 'his key, his click on HIS window and on the menu inside it, his paste reach xpra — ONE PERSON, ONE SEAT');
ok(S.otherWidCut === true, "MAJOR A — a key, a click, a focus addressed to an AGENT's window are cut");
ok(S.toldNotYours === true, "…told 'not-your-window'");
ok(S.quietCut === true && S.focusQuiet === true, "the client's own focus of an agent's window and a pointer passing over it are cut and counted, never told — only his act (the key) is");
ok(S.outsideCut === true, 'MAJOR A — a press addressed to his window but OUTSIDE it (xpra moves the X pointer there) is cut');
ok(S.geometryCut === true, 'MAJOR A — a display size, a configure-window (his or an agent\'s), a close-window (his or an agent\'s), an unmap: cut');
ok(S.toldInputOnly === true, "…told 'input-only'");
ok(S.agentCut === true, 'an AGENT\'s token on the same display never types (its verbs are its own)');
ok(S.ticketCut === true, 'a ticket-shaped id never falls to the person rule (the live-view relay\'s ticket verdict is the only one for it)');
ok(S.secondPaneWins === true && S.toldOther === true, "FAIL 1 — a second pane of his: the NEWEST pane holds the seat; the first watches, told 'other-window'");
ok(S.oneSeat === true, `FAIL 1 — two panes + another client: exactly ONE of his sockets types (the newest) (${JSON.stringify(S.ones)})`);
ok(S.takeHere === true && S.take && S.take.ok === true && S.take.seat === 'input', `«Use it here» (POST browser-seat) moves his seat to that pane; the other client watches (${JSON.stringify(S.take)})`);
ok(S.takeAgent === 403 && S.takeBad === 400 && S.takeGone === 409, `«Use it here» is a person's press: an agent token 403, a bad id 400, a pane not connected 409 (${S.takeAgent}, ${S.takeBad}, ${S.takeGone})`);
ok(S.leaveReelect === true, 'the pane that held it gone: the newest remaining pane takes the seat');
ok(S.toldEnd === true && S.endCut === true, 'his holding ended (human-end): cut again, told');
console.log('§3 the routes the window asks, and the client');
ok(S.routeWatch && S.routeWatch.status === 200 && S.routeWatch.seat === 'watch' && S.routeWatch.why === 'not-browsing' && S.routeWatch.profileId === 'bp-x1', `before: 'watch' / 'not-browsing' for his socket, the browser named (${JSON.stringify(S.routeWatch)})`);
ok(S.routeInput && S.routeInput.seat === 'input' && S.routeInput.why === null && S.routeAgent && S.routeAgent.seat === 'watch' && S.routeAgent.why === 'watch-mode', `holding: 'input' for his socket, 'watch' / 'watch-mode' for the agent's (${JSON.stringify([S.routeInput, S.routeAgent])})`);
ok(S.routeOther && S.routeOther.seat === 'watch' && S.routeOther.why === 'other-window', `his older pane: 'watch' / 'other-window' (${JSON.stringify(S.routeOther)})`);
ok(S.routeAfter && S.routeAfter.seat === 'watch', `ended: 'watch' again (${JSON.stringify(S.routeAfter)})`);
ok(S.routeBad === 400 && S.routeMissing === 404 && S.routeApp && S.routeApp.status === 200 && S.routeApp.seat === null, `a bad viewer id 400, an unknown app 404, a desktop app that is no browser display: seat null (${S.routeBad}, ${S.routeMissing}, ${JSON.stringify(S.routeApp)})`);
{
  const c = await clientFacts(REPO);
  ok(!c.error && c.seen.length === 1 && c.seen[0].seat === 'input' && c.seen[0].code === 'not-your-window' && c.seen[0].refused === 2 && JSON.stringify(c.seen[0].wids) === JSON.stringify([HIS]), "the client hands the bridge's word to the view (on.seat): seat, code, count, windows", c);
  ok(!c.error && c.sent.includes('key-action') && c.sent.includes('button-action') && !c.sent.some((x) => /desktop_size|display-configure|configure-display|configure-window/.test(x)) && c.maps.length === 1 && JSON.stringify(c.maps[0]) === JSON.stringify([HIS, 100, 50, 400, 300]), "Watch's picture with his input (the view's 'input' mode): his key and click are sent, his window mapped where the server has it, a pane resize sends no size", c);
}

// ═══ §4 ═══
console.log('§4 a satellite picture is one input with its own IME (src/lib/keyboard-yield.js)');
{
  const f = await satelliteFacts(REPO);
  ok(f.satellite === true, 'a press on his Chrome window in its SATELLITE and the focus on that satellite\'s textarea are ONE input (measured: his driving browse window reclaimed it — his Escape went to the page)');
  ok(f.otherSatellite === false && f.main === true, 'another satellite\'s textarea is not; the main picture shell\'s rule is unchanged');
}

// ═══ §5 ═══
console.log("§5 the window's doors (source pins) and their words");
const D = doorFacts(REPO);
{
  ok(D.unknownIsWatch, "FAIL 3 — a browser display's pane is WATCH until the bridge (or the route) says otherwise — never this window's election's 'active'");
  ok(D.failedIsWatch, 'FAIL 3 — a failed seat answer is WATCH and SAID («…seat could not be read…»), never active by default');
  ok(D.told, "FAIL 3 — the window takes the bridge's in-band word (xpra-client → xpra-view onSeat → the window)");
  ok(D.labelIsAct, "MAJOR B — the door's label IS its act: «Use it here» POSTs the seat, «Browse yourself» / «Open your browsing window» open his own tab (and hold his seat in THIS pane — measured: a synced copy on another client took it); no «Take over» that is no takeover");
  ok(D.doorVerdict, "MAJOR B — the door's act is deskDoorAct's (a conversation's temporary browser: no button, the words say why)");
  ok(D.inputMode, "the view's 'input' mode: Watch's picture (nothing sized), his input sent");
  ok(D.liveDoorHuman && D.liveDoorRejudged, "the live view's raw-fallback door: only in his browse-yourself window, judged again at every fact, X mount / unmount, mode and digest change");
  ok(D.themeShadow, 'the Watch door strip\'s shadow is the theme\'s (--shadow-window), never a literal colour');
  const zh = read(REPO, 'src/lib/i18n-zh.js'), ja = read(REPO, 'src/lib/i18n-ja.js');
  const keys = [...D.dw.matchAll(/\bt\((?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)].map((m) => (m[1] !== undefined ? m[1] : m[2]).replace(/\\(['"])/g, '$1')).filter((k) => /^(View only — |Use it here|Only your own window|Make this window the one|Open your own tab in this browser|You browse this browser yourself|You are browsing it|Browse yourself|Open your browsing window)/.test(k));
  const has = (src, k) => src.includes(JSON.stringify(k)) || src.includes(`'${k.replace(/'/g, "\\'")}'`);
  ok(keys.length >= 12 && keys.every((k) => has(zh, k) && has(ja, k)), `every word of the doors is a literal t() with zh + ja (${keys.length})`, keys.filter((k) => !has(zh, k) || !has(ja, k)));
  const PICw = W0.PIC.DESK_DOOR_WORDS || {};
  ok(D.live.includes('t("' + PICw.line + '")') && D.live.includes("t('" + PICw.button + "')") && has(zh, PICw.line) && has(ja, PICw.line) && has(zh, PICw.button) && has(ja, PICw.button), "the live view says the door's words (literal t() of DESK_DOOR_WORDS, zh + ja)");
  ok(zh.includes('只能看——这个浏览器由「{name}」的 agent 在操作；自己浏览后可在这里操作你自己的窗口'), "zh says the owner's sentence, its way true to its act: 只能看——这个浏览器由 <X> 在操作；自己浏览后可在这里操作你自己的窗口");
}

// ═══ §6 ═══
console.log('§6 mutants — each rule undone in a copy of src: its leg goes red');
{
  const M = path.join(ROOT, 'mut');
  fs.cpSync(path.join(REPO, 'src'), path.join(M, 'src'), { recursive: true });
  fs.cpSync(path.join(REPO, 'public/style.css'), path.join(M, 'public/style.css'));
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(M, 'node_modules'));
  const MUTANTS = [
    { tag: 'no-holder-rule', need: 'watchCut', file: 'src/browser-picture.js', from: "return person && human && elected ? 'input' : 'watch';", to: "return person && elected ? 'input' : 'watch';", red: (s) => s.watchCut === false },
    { tag: 'ticket-falls-through', file: 'src/browser-picture.js', from: "if (!viewerId || X_TICKET_RE.test(String(viewerId))) return 'watch';", to: "if (!viewerId) return 'watch';", pure: true, red: (P) => P.deskSeat({ viewerId: TICKET, person: true, human: true }) !== 'watch' },
    { tag: 'ticket-elected', need: 'toldInput', file: 'src/server/window-live-wiring.js', from: ' || PIC.X_TICKET_RE.test(String(viewerId))) return;', to: ') return;', red: (s) => s.toldInput === false },
    { tag: 'every-socket-a-person', need: 'agentCut', file: 'src/server/desktop-stream.js', from: "person: !bearerOf(req) });", to: 'person: true });', red: (s) => s.agentCut === false },
    { tag: 'wiring-ignores-person', need: 'agentCut', file: 'src/server/window-live-wiring.js', from: 'if (!person || !viewerId || PIC.X_TICKET_RE', to: 'if (!viewerId || PIC.X_TICKET_RE', red: (s) => s.agentCut === false },
    { tag: 'no-reseat-at-holding', need: 'heldReplay', file: 'src/server/browser-stream.js', from: "if (ev && (ev.kind === 'human-start' || ev.kind === 'human-end') && ev.profileId) { noteHumanSeat(ev.profileId); askXScope(ev.profileId, ev.kind); }", to: '', red: (s) => s.heldReplay === false },
    { tag: 'replay-geometry', need: 'geometryNeverReplayed', file: 'src/server/stream-relay-xpra.js', from: "else if (s === 'input') replayInput();", to: "else if (s === 'input') replayHeld();", red: (s) => s.geometryNeverReplayed === false },
    { tag: 'any-window', need: 'otherWidCut', file: 'src/server/stream-relay-xpra.js', from: 'if (wid === null || !sc || !sc.wids.has(wid)) {', to: 'if (wid === null || !sc) {', red: (s) => s.otherWidCut === false },
    { tag: 'focus-told', need: 'focusQuiet', file: 'src/server/stream-relay-xpra.js', from: "const quiet = type === 'focus' ? 'focus-elsewhere' : 'pointer-outside';", to: "const quiet = type === 'focus' ? 'not-your-window' : 'pointer-outside';", red: (s) => s.focusQuiet === false },
    { tag: 'no-point-check', need: 'outsideCut', file: 'src/server/stream-relay-xpra.js', from: 'if (sc.rects.length && !inside(sc.rects, c[0], c[1])) {', to: 'if (false) {', red: (s) => s.outsideCut === false },
    { tag: 'geometry-passes', need: 'geometryCut', file: 'src/server/stream-relay-xpra.js', from: "if (!Object.hasOwn(XPRA_SCOPED_INPUT, type)) return 'input-only';", to: 'if (!Object.hasOwn(XPRA_SCOPED_INPUT, type)) return null;', red: (s) => s.geometryCut === false },
    { tag: 'silent', need: 'toldWatch', file: 'src/server/stream-relay-xpra.js', from: 'sendDown(rencodePlus([XPRA_SEAT_PACKET,', to: 'void (([XPRA_SEAT_PACKET,', red: (s) => s.toldWatch === false },
    { tag: 'no-election', need: 'oneSeat', file: 'src/server/window-live-wiring.js', from: "elected: !!viewerId && electedOf(id) === String(viewerId)", to: 'elected: true', red: (s) => s.oneSeat === false },
    { tag: 'take-ignored', need: 'takeHere', file: 'src/server/window-live-wiring.js', from: 'e.panes.set(s.pane, ++e.seq); s.seq = ++e.seq;', to: 's.seq = ++e.seq;', red: (s) => s.takeHere === false },
    { tag: 'door-on-any-prompt', file: 'src/browser-picture.js', from: "(stuck.state === 'prompt' && !!stuck.prompt && stuck.prompt.native === true)", to: "(stuck.state === 'prompt')", pure: true, red: (P) => P.deskDoorOf({ source: { source: 'x', displaySession: 'da-x1' }, stuck: { state: 'prompt', prompt: { type: 'file' } }, human: true }) === 'da-x1' },
    { tag: 'door-in-any-view', file: 'src/browser-picture.js', from: 'if (!human || !source ||', to: 'if (!source ||', pure: true, red: (P) => P.deskDoorOf({ source: { source: 'x', displaySession: 'da-x1' }, stuck: { state: 'passkey', headed: true } }) === 'da-x1' },
    { tag: 'temporary-door', file: 'src/browser-picture.js', from: "if (!profile || profile.ephemeral === true) return { act: null, code: 'not_attachable' };", to: "if (!profile) return { act: 'browse', code: null };", pure: true, red: (P) => P.deskDoorAct({ profile: null }).act !== null },
    { tag: 'satellite-not-one-input', file: 'src/lib/keyboard-yield.js', from: '(el.closest(SATELLITE_HOST) || el.closest(INPUT_HOSTS))', to: 'el.closest(INPUT_HOSTS)', sat: true, red: (f) => f.satellite === false },
    { tag: 'door-says-take-over', file: 'src/lib/desktop-app-window.js', from: ": doorAct === 'open' ? t('Open your browsing window') : t('Browse yourself');", to: ": t('Take over');", door: true, red: (d) => d.labelIsAct === false },
    { tag: 'unread-is-active', file: 'src/lib/desktop-app-window.js', from: "browserDisplay() ? bseat.seat || 'watch' :", to: "browserDisplay() && bseat.seat ? bseat.seat :", door: true, red: (d) => d.unknownIsWatch === false },
  ];
  for (const m of MUTANTS) {
    const f = path.join(M, m.file), orig = fs.readFileSync(f, 'utf8');
    if (orig.split(m.from).length !== 2) { ok(false, `mutant ${m.tag}: its line is in ${m.file} exactly once`); continue; }
    fs.writeFileSync(f, orig.replace(m.from, m.to));
    for (const k of Object.keys(require.cache)) if (k.startsWith(M + path.sep)) delete require.cache[k];
    let facts = null;
    try { facts = m.pure ? load(M).PIC : m.sat ? await satelliteFacts(M + '/./') : m.door ? doorFacts(M) : await scene(M, m.tag, m.need); } catch (e) { facts = { error: String(e && e.message) }; }
    fs.writeFileSync(f, orig);
    const shown = facts && !m.pure && !m.door ? facts : undefined;
    ok(!!facts && !facts.error && m.red(facts), `MUTANT ${m.tag} (${m.file}) ⇒ its leg goes RED`, shown);
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
