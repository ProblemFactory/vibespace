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
// r3 (主开发's acceptance r2 on e74bda88b): the seat's reach is by WINDOW IDENTITY, read where it is ordered — xpra's own window
// announcements on the socket beside his acts (MAJOR 1: his <select> popup / context menu — override-redirect, no transient-for,
// no class, no name, MEASURED — never reached him; MAJOR 2: an agent's file chooser cascaded over his window was admitted by its
// centre); every refusal is told (quietly when it is no act of his); focus never leaves his reach and a key / button is released
// where it was pressed (MAJOR 3); a pane's place survives its reconnect, a drag's release always lands, his moved window is his.
// r4 (主开发's acceptance r3 on 91487da3c): his reach is drawn above every other window and his press / the seat word RAISE his
// window (MAJOR 1: an agent's window announced after his covered it for good); the bridge reads his window AGAIN when it may have
// been replaced — a new top-level, his window lost, his press on another (MAJOR 2: a Chrome relaunch left all his input refused);
// a key's release goes to the focused window (xpra raises the window a key names), his pointer resting on his window opens his
// tooltip, a popup that does not touch the window he acted on is not his.
// In-process here, no browser, no display:
//   §1 PURE: deskSeat / deskSeatWhy / deskDoorAct / deskDoorOf (src/browser-picture.js); xScopeOf over the REAL row path (an
//      xwininfo tree → parseWininfoTree → seamlessWindows → the keeper's appWindowRow → xWindowOf); the bridge's readers —
//      xpraFields (floats, spans), lz4Inflate over xpra's OWN lz4 bytes, xpraWindowWatch over a split stream
//   §2 THE REAL WIRING (window-live-wiring install + the REAL desktop bridge + the REAL live-view relay; a fake keeper whose
//      xScopeFor is the keeper's own composition over that row path; a fake xpra upstream that ANNOUNCES its windows the way
//      xpra does — new-window / new-override-redirect / window-move-resize / lost-window, one of them lz4-compressed): watch ⇒
//      cut and told; browse yourself ⇒ his keymap replayed, his display size / geometry NEVER; his keys and clicks on HIS window,
//      the popups his acts open, his transients reach xpra; an agent's window, its dialog cascaded over his, its popup over his,
//      a point outside his windows, any size / geometry / close / foreign map: cut and TOLD; a release always reaches the
//      window of its press; a key held when his seat moves is released; ONE seat (the newest pane), «Use it here», a reconnect
//      that keeps its place, a pane gone re-elects; an agent's token and a ticket-shaped id never type; his holding ended ⇒ cut
//   §3 THE ROUTES (GET / POST /api/desktop/apps/:id/browser-seat) and THE CLIENT (xpra-client: the bridge's word to the view,
//      focus kept in his reach, releases at their press's window, his moved window re-mapped; no size from Watch's picture)
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
const PERSON = 'wl-' + HEX(32), PERSON2 = 'wl-' + HEX(32, 3), OTHER = 'wl-' + HEX(32, 5), OTHER2 = 'wl-' + HEX(32, 11), AGENT = 'wl-' + HEX(30) + 'aa', TICKET = 'xt-' + HEX(36);
// the display (xpra's wid IS the X id — measured): HIS Chrome window, an agent's CASCADED under it (Chrome cascades new windows by
// 10 px — heavy ⑥'s own geometry), the agent's file chooser (transient-for the agent's window, its centre inside his rect), his own
// file chooser, the <select> popup his click opens, a submenu of it, an agent's popup over his window
const HIS = 0x400003, AGENTS = 0x40000b, DLG = 0x600006, MYDLG = 0x600009, MENU = 0x400010, SUB = 0x400011, APOP = 0x400012, LATER = 0x40000d;
// r4: his tooltip (near his resting pointer), one far from it, a popup that does not touch his window; his window REPLACED (a
// Chrome relaunch: a new X window at his place), then his tab in yet another; an agent's window announced after the seat word
const TIP = 0x400013, TIPFAR = 0x400014, FAR = 0x400015, NEWHIS = 0x400030, NEWHIS2 = 0x400031, AG2 = 0x40000f;
const GEOM = { [HIS]: [100, 50, 400, 300], [AGENTS]: [90, 40, 400, 300], [DLG]: [200, 150, 200, 150], [MYDLG]: [220, 160, 200, 150], [MENU]: [150, 100, 120, 80], [SUB]: [270, 100, 100, 60], [APOP]: [120, 70, 100, 80], [TIP]: [300, 222, 120, 24], [TIPFAR]: [380, 300, 100, 24], [FAR]: [720, 500, 100, 80], [NEWHIS]: [100, 50, 400, 300], [NEWHIS2]: [100, 50, 400, 300] };
const PROFILE_DIR = '/p/bp-x1';
/** xwininfo -root -tree of that display, topmost first (the shapes MEASURED 2026-10-31 on Chrome 154 + xpra 6.5.4: a managed window
 *  inside its Xpra-CorralWindow; a <select> popup a nameless, classless top-level — `(has no name): ()`). `extra` = rows on top. */
const TREE = (extra = '') => `
xwininfo: Window id: 0x2cf (the root window) (has no name)

  Root window id: 0x2cf (the root window) (has no name)
  Parent window id: 0x0 (none)
     6 children:
${extra}     0x200010 "Xpra-CorralWindow-0x400003": ()  400x300+100+50  +100+50
        1 child:
        0x400003 "his page - Google Chrome": ("google-chrome (${PROFILE_DIR})" "Google-chrome")  400x300+0+0  +100+50
     0x200016 "Xpra-CorralWindow-0x600006": ()  200x150+200+150  +200+150
        1 child:
        0x600006 "Open File": ("chrome" "Chrome")  200x150+0+0  +200+150
     0x200012 "Xpra-CorralWindow-0x40000b": ()  400x300+90+40  +90+40
        1 child:
        0x40000b "agent page - Google Chrome": ("google-chrome (${PROFILE_DIR})" "Google-chrome")  400x300+0+0  +90+40
     0x400001 "google-chrome": ("google-chrome" "Google-chrome")  10x10+10+10  +10+10
     0x200004 (has no name): ()  1x1+0+0  +0+0
`;
const MENU_ROW = '     0x400010 (has no name): ()  120x80+150+100  +150+100\n';
/** r4: the same display with HIS window replaced by `wid` (a relaunched Chrome's window at his place), or gone (`wid` null). */
const TREE_AS = (wid) => (wid ? TREE().replaceAll('0x400003', '0x' + wid.toString(16)) : TREE().replace(/ {5}0x200010 "Xpra-CorralWindow-0x400003".*\n.*\n.*\n/, ''));
/** HIS window's announcement as xpra sends it to a client (the shape src/lib/xpra-client.js reads: [type, wid, x, y, w, h, metadata,
 *  client properties]) — 499 bytes, over xpra's MIN_COMPRESS_SIZE 378, so xpra sends it lz4-compressed: LZ4_HIS is xpra's OWN
 *  compressor's output (python3 -c "from xpra.net.lz4.lz4 import compress; …", xpra 6.5.4, acceleration 4) of exactly these bytes. */
const META_HIS = { title: 'his page - Google Chrome', 'class-instance': ['google-chrome (/p/bp-x1)', 'Google-chrome'], 'window-type': ['NORMAL'], 'icon-title': 'his page - Google Chrome', pid: 4242, 'size-constraints': { 'minimum-size': [500, 220], 'maximum-size': [32767, 32767] }, 'has-alpha': false, decorations: true, 'override-redirect': false, opacity: -1, 'frame-sizes': [0, 0, 0, 0], 'wm-name': 'his page - Google Chrome', role: 'browser', 'startup-id': '', 'command': 'google-chrome --user-data-dir=/p/bp-x1', 'content-type': 'text', 'set-initial-position': true, 'requested-position': [100, 50], 'fullscreen-monitors': [0, 0, 0, 0] };
const LZ4_HIS = Buffer.from('f3010000f28ec88a6e65772d77696e646f7740004000033e643e323f01903f012c79857469746c65986869732070616765202d20476f6f676c65204368726f6d658e636c6173732d696e7374616e6365c298676f6f676c652d6368726f6d6520282f702f62702d7831298d476f6f676c652d6368726f6d658b77696e646f772d74797065c1864e4f524d414c8a69636f6e2d7469746c65986869732070616765202d203800036f00f722837069643f10929073697a652d636f6e73747261696e7473688c6d696e696d756d2d73697a65c23f01f43f00dc8c6d61781400ff427fff3f7fff896861732d616c706861448b6465636f726174696f6e7343916f766572726964652d726564697265637444876f706163697479468b6672616d652d73697a6573c40000000087776d2d6e616d160107f11b84726f6c658762726f777365728a737461727475702d69648087636f6d6d616e64a6676f6f676c652d63d600f53c202d2d757365722d646174612d6469723d2f702f62702d78318c636f6e74656e742d747970658474657874947365742d696e697469616c2d706f736974696f6e43927265717565737465641400f010c23e643e329366756c6c73637265656e2d6d6f6e69746f7273c40000000066', 'hex');
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
  return { PIC: r('src/browser-picture.js'), BS: r('src/server/browser-stream.js'), WL: r('src/server/window-live-wiring.js'), XR: r('src/server/stream-relay-xpra.js'), DD: r('src/desktop-display.js') };
}
/** The keeper's `displayKeeper.windows(id)` rows of a tree: parseWininfoTree → seamlessWindows (an xpra display) → desktop-serve's
 *  own row (desktop-display appWindowRow — r3; a tree before it spells the same mapping inline). */
const rowsOf = (DD, text) => DD.seamlessWindows(DD.parseWininfoTree(text)).map(typeof DD.appWindowRow === 'function' ? DD.appWindowRow : (w) => ({ id: w.id, title: w.name, cls: w.cls, instance: w.instance, x: w.x, y: w.y, w: w.w, h: w.h, mapped: w.mapped, depth: w.depth == null ? null : w.depth, ...(w.frame ? { frame: w.frame } : {}) }));
/** The keeper's xScopeFor over those rows (browser-keeper.js: xWindowFor — his CDP bounds matched — then PIC.xScopeOf); only the
 *  CDP read and the row read are this fake's. */
const keeperScope = (PIC, rows) => { const xw = PIC.xWindowOf({ bounds: { left: 100, top: 50, width: 400, height: 300 }, rows, profileDir: PROFILE_DIR }); const wid = typeof PIC.xSeatRootOf === 'function' ? PIC.xSeatRootOf(xw) : xw.wid; return wid == null ? { wid: null, why: xw.why, wids: [], rects: [], known: [] } : { wid, why: xw.why, ...PIC.xScopeOf(wid, rows, { profileDir: PROFILE_DIR }) }; }; // r4: the root only when his bounds TELL it

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
  const NEW = (wid, meta = {}, type = 'new-window') => enc([type, wid, ...GEOM[wid], meta, {}]);
  const OR = (wid) => NEW(wid, { 'override-redirect': true, 'window-type': ['MENU'] }, 'new-override-redirect'); // MEASURED: a <select> popup = override-redirect, type MENU, nothing else
  const TIPOR = (wid) => NEW(wid, { 'override-redirect': true, 'window-type': ['TOOLTIP'] }, 'new-override-redirect'); // r4: a tooltip (Chrome's: override-redirect)
  const HISMETA = { title: 'his page - Google Chrome', 'class-instance': ['google-chrome (/p/bp-x1)', 'Google-chrome'], 'window-type': ['NORMAL'] };
  const lz4His = () => { const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 0x10; h[2] = 0x11; h.writeUInt32BE(LZ4_HIS.length, 4); return Buffer.concat([h, LZ4_HIS]); }; // level byte 0x10 | 1: lz4
  const up = new WebSocketServer({ port: upPort, host: '127.0.0.1' }); await new Promise((r) => up.on('listening', r));
  up.on('connection', (ws) => {
    const c = { ws, types: [], pk: [], answered: false }; ups.push(c);
    ws.on('message', (d) => {
      for (let x = Buffer.from(d); x.length >= 8;) { const n = x.readUInt32BE(4), p = x.subarray(8, 8 + n), ty = L.XR.xpraPacketType(p), f = dec(p); c.types.push(ty); c.pk.push({ type: ty, wid: Array.isArray(f) ? f[1] : null, pressed: Array.isArray(f) && typeof f[3] === 'boolean' ? f[3] : null }); x = x.subarray(8 + n); }
      if (!c.answered) { // xpra's first word (the bridge's `owed` goes up after it), then — as xpra does for a new client — every window it has
        c.answered = true; ws.send(L.XR.rencodePlus(['hello', {}]));
        ws.send(lz4His()); ws.send(NEW(AGENTS, { title: 'agent page - Google Chrome', 'class-instance': ['google-chrome (/p/bp-x1)', 'Google-chrome'] })); ws.send(NEW(DLG, { title: 'Open File', 'transient-for': AGENTS, modal: true, 'window-type': ['DIALOG'] }));
      }
      for (let x = Buffer.from(d); x.length >= 8;) { const n = x.readUInt32BE(4), f = dec(x.subarray(8, 8 + n)); if (Array.isArray(f) && f[0] === 'ping') ws.send(enc(['ping_echo', f[1], 0, 0, 0, 0, ''])); x = x.subarray(8 + n); } // the FENCE: its echo comes down behind every word the bridge wrote before
    });
  });
  const recs = { 'da-x1': { id: 'da-x1', kind: 'display-for-browser', forBrowser: 'bp-x1', state: 'ready' }, 'app-1': { id: 'app-1', kind: 'app', state: 'ready' } };
  const deskKeeper = { get: (id) => recs[id] || null, streamTarget: (id) => (recs[id] ? { kind: 'xpra', port: upPort } : null), noteInput() { }, list: () => [], onViewers() { }, setWatchProbe() { } };
  const humans = new Set(); const leaseFns = [];
  let tree = TREE(); // the display's tree now (a popup open adds its row — the keeper reads it fresh)
  const bk = {
    setFor: () => ({ attachments: [] }), list: () => ({ profiles: [] }),
    humanOf: (pid) => (humans.has(pid) ? { profileId: pid, browserKey: 'hu-' + String(pid).slice(3), state: 'driving' } : null),
    pictureSourceFor: (pid) => (pid === 'bp-x1' ? { source: 'x', why: 'attach', displaySession: 'da-x1' } : { source: 'screencast', why: 'driver', displaySession: null }),
    xScopeFor: async (pid, { browserKey } = {}) => (humans.has(pid) && browserKey === 'hu-' + String(pid).slice(3) ? keeperScope(L.PIC, rowsOf(L.DD, tree)) : { wid: null, wids: [], rects: [], known: [] }), // NO hand-written scope (r2's): the keeper's own composition over the real row path
    onLease: (fn) => { leaseFns.push(fn); return () => { }; },
  };
  const lease = (ev) => { for (const fn of leaseFns) fn(ev); };
  const relay = L.BS.create({ keeper: bk, activeSessions: new Map(), requestAuthed: () => true, log: quiet });
  const app = express(); app.use(express.json());
  const clock = { skew: 0 }; // the bridge's clock (r3: the popup window is its time) — moved on, never slept through
  const w = L.WL.install({ app, auth: { requestAuthed: () => true }, vnc: { port: 5900 }, keeper: deskKeeper, DESKTOP_SINGLETON_ID: 'desktop', dataDir: path.join(ROOT, 'data-' + tag), env: {}, activeSessions: new Map(), serverSetting: () => undefined, broadcast() { }, browserStream: relay, log: quiet, now: () => Date.now() + clock.skew });
  const srv = http.createServer(app);
  srv.on('upgrade', (req, socket, head) => { const id = w.desktopStream.upgradeId(new URL(req.url, 'http://x').pathname); if (id) w.desktopStream.handleUpgrade(req, socket, head, id); else socket.destroy(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const PORT = srv.address().port;
  const pkt = (a) => enc(a);
  const KEY = (wid, down = true) => ['key-action', wid, 'a', down, [], 97, 'a', 38, 0];
  const CLICK = (wid, x, y, down = true) => ['button-action', wid, 1, down, [x, y, 0, 0], [], []];
  const RELEASE = (wid, x, y) => CLICK(wid, x, y, false);
  const POINT = (wid, x, y) => ['pointer-position', wid, [x, y], [], []];
  const socks = [];
  const sock = async (viewer, { pane = viewer, headers = {} } = {}) => {
    const n0 = ups.length;
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/desktop/da-x1/stream?viewer=${viewer}&pane=${pane}`, ['binary'], { headers });
    const s = { ws, told: [], echoes: new Set(), up: null };
    ws.on('error', () => { });
    ws.on('message', (d) => { // the bridge's word to THIS socket (r2): ['vibespace-seat', {seat, why, code, refused, acts, wids}]
      for (let x = Buffer.from(d); x.length >= 8;) { const n = x.readUInt32BE(4), p = x.subarray(8, 8 + n); const ty = x[2] === 0 ? L.XR.xpraPacketType(p) : null; if (ty === 'vibespace-seat' || ty === 'ping_echo') { const f = dec(p); if (Array.isArray(f) && ty === 'ping_echo') s.echoes.add(f[1]); else if (Array.isArray(f) && f[1]) s.told.push(f[1]); } x = x.subarray(8 + n); }
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
  /** xpra announces to `s` (its own upstream socket) — then a fence: the bridge has read it before anything `s` sends next */
  const ann = async (s, ...bufs) => { for (const b of bufs) s.up.ws.send(b); await after(s); };
  /** a QUIET word (r3: coalesced, ≤ XPRA_TELL_QUIET_MS) — the next told word whose count passed `n` */
  const toldPast = (s, n) => until(() => { const l = s.last(); return l && l.refused > n ? l : null; }, 1000);
  const typed = (got, wid) => got.some((x) => x.type === 'key-action' && (wid === undefined || x.wid === wid));
  const clicks = (got, wid) => got.filter((x) => x.type === 'button-action' && x.wid === wid).length;
  const seatOf = async (viewer, id = 'da-x1') => { const r = await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${id}/browser-seat?viewer=${encodeURIComponent(viewer)}`); let j = null; try { j = await r.json(); } catch { } return { status: r.status, seat: j && j.seat, why: j && j.why, profileId: j && j.profileId, connected: j && j.connected }; };
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
    { const w0 = P.last() || {}; await after(P, POINT(HIS, 150, 80)); const l = await toldPast(P, w0.refused || 0); out.watchPointerTold = !!l && (l.acts || 0) === (w0.acts || 0); } // r3: never silent — a pointer passing by, quietly
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
    out.toldInput = !!(P.last() && P.last().seat === 'input' && JSON.stringify(P.last().wids) === JSON.stringify([HIS])); // r3: exactly HIS — never the agent's file chooser cascaded over it
    out.toldInputWids = P.last() && P.last().wids;
    const replayed = P.up.types.slice(k1);
    out.geometryNeverReplayed = !replayed.includes('desktop_size') && !replayed.includes('configure-window');
    // his keys and clicks on HIS window, his paste reach xpra
    const g1 = await after(P, KEY(HIS), KEY(HIS, false), CLICK(HIS, 150, 80), RELEASE(HIS, 150, 80), ['clipboard-token', 'CLIPBOARD']);
    out.personTypes = typed(g1, HIS) && clicks(g1, HIS) === 2 && g1.some((x) => x.type === 'clipboard-token');
    // ── MAJOR 1: the <select> popup HIS click opened — xpra announces it right after his act (override-redirect, nameless:
    // the row seamlessWindows drops) — is HIS: his click on an option reaches xpra, he is told it ──
    tree = TREE(MENU_ROW);
    await ann(P, OR(MENU));
    const g2 = await after(P, POINT(MENU, 160, 110), CLICK(MENU, 160, 110), RELEASE(MENU, 160, 110));
    out.menuMine = clicks(g2, MENU) === 2 && g2.some((x) => x.type === 'pointer-position' && x.wid === MENU);
    out.toldMenu = !!(P.last() && Array.isArray(P.last().wids) && P.last().wids.includes(MENU));
    // …HIS file chooser (transient-for his window — measured: GTK's dialog names its browser window): his clicks and keys reach it
    await ann(P, NEW(MYDLG, { title: 'Open File', 'transient-for': HIS, modal: true, 'window-type': ['DIALOG'] }));
    const g3 = await after(P, CLICK(MYDLG, 300, 230), RELEASE(MYDLG, 300, 230), KEY(MYDLG), KEY(MYDLG, false));
    out.transientMine = clicks(g3, MYDLG) === 2 && typed(g3, MYDLG);
    // r4 MINOR: a key pressed on his window, released while his dialog has the focus — the release goes AS SENT (the focused window:
    // xpra raises nothing for it), never re-addressed to the press's window (xpra would raise his window over his dialog)
    const g3b = (await after(P, KEY(HIS), KEY(MYDLG, false))).filter((x) => x.type === 'key-action');
    out.releaseInReach = g3b.length === 2 && g3b[1].wid === MYDLG && g3b[1].pressed === false;
    out.releaseInReachGot = g3b;
    out.toldTransient = !!(P.last() && P.last().wids.includes(MYDLG) && P.last().wids.includes(MENU));
    // …it closes (xpra's lost-window): it leaves his reach (his popup stays open — its submenu comes below)
    await ann(P, enc(['lost-window', MYDLG]));
    out.toldLost = !!(P.last() && JSON.stringify(P.last().wids) === JSON.stringify([HIS, MENU]));
    // ── MAJOR 2: WINDOW IDENTITY FIRST — the agent's file chooser cascaded over his window (its centre inside his rect): cut, told ──
    const t0 = P.last() || {};
    const g4 = await after(P, CLICK(DLG, 300, 225), KEY(DLG));
    out.cascadeDialogCut = g4.length === 0;
    out.toldCascade = !!(P.last() && P.last().code === 'not-your-window' && (P.last().acts || 0) > (t0.acts || 0));
    // …a key, a click on the agent's own window: cut, told 'not-your-window'
    const r0 = (P.last() || {}).refused || 0;
    const g5 = await after(P, KEY(AGENTS), CLICK(AGENTS, 95, 45));
    out.otherWidCut = g5.length === 0;
    out.toldNotYours = !!(P.last() && P.last().refused > r0 && P.last().code === 'not-your-window');
    // …NEVER SILENT: the client's own focus of an agent's window, a pointer passing over it — cut and TOLD, quietly (no act: no toast)
    { const q0 = P.last() || {}; clock.skew += 300; await after(P, ['focus', AGENTS, []]); const q1 = await toldPast(P, q0.refused || 0); clock.skew += 300; await after(P, POINT(AGENTS, 95, 45)); const q2 = q1 ? await toldPast(P, q1.refused) : null; out.quietTold = !!q1 && q1.code === 'focus-elsewhere' && !!q2 && q2.code === 'pointer-outside' && (q2.acts || 0) === (q0.acts || 0); out.quiet = [q1, q2]; }
    // …a press addressed to his window OUTSIDE it (xpra moves the X pointer to the packet's root point): cut
    out.outsideCut = (await after(P, CLICK(HIS, 900, 700))).length === 0;
    // …a display size, a geometry (his window's or an agent's), a close (his or an agent's), an unmap: cut, told 'input-only'
    const r1 = (P.last() || {}).refused || 0;
    const g6 = await after(P, ['desktop_size', 640, 480], ['configure-window', HIS, 0, 0, 640, 480, {}, 0, {}, false], ['configure-window', AGENTS, 0, 0, 640, 480, {}, 0, {}, false], ['close-window', HIS], ['close-window', AGENTS], ['unmap-window', AGENTS, true]);
    out.geometryCut = g6.length === 0;
    out.toldInputOnly = !!(P.last() && P.last().refused > r1 && P.last().code === 'input-only');
    { const r2 = (P.last() || {}).refused || 0; out.lifecycleTold = (await after(P, ['shutdown-server'])).length === 0 && !!(P.last() && P.last().refused > r2 && P.last().code === 'server-lifecycle'); } // a cut the scope never judges is told too
    out.routeInput = await seatOf(PERSON);
    out.routeAgent = await seatOf(AGENT);
    // …a map-window is the server's own geometry or nothing (xpra applies its geometry from its ui driver — his key made him that)
    out.mapGeometryCut = (await after(P, ['map-window', AGENTS, 0, 0, 800, 600, {}])).length === 0;
    out.mapOwnPasses = (await after(P, ['map-window', AGENTS, 90, 40, 400, 300, {}])).some((x) => x.type === 'map-window');
    // ── MINOR: a drag that ends outside his window — its release reaches xpra at the window of its press (never a button left down) ──
    const d1 = await after(P, CLICK(HIS, 150, 80), POINT(AGENTS, 95, 45), RELEASE(HIS, 900, 700));
    out.releaseOutside = d1.some((x) => x.type === 'button-action' && x.wid === HIS && x.pressed === false);
    const d2 = await after(P, CLICK(HIS, 150, 80), RELEASE(AGENTS, 95, 45)); // an older client addressed it where the pointer was
    out.releaseReaddressed = d2.filter((x) => x.type === 'button-action').length === 2 && d2.every((x) => x.type !== 'button-action' || x.wid === HIS) && d2.some((x) => x.pressed === false);
    // ── MINOR: his window moved (xpra's window-move-resize): his first press at its new place reaches xpra ──
    await ann(P, enc(['window-move-resize', HIS, 300, 200, 400, 300]));
    out.movedStillMine = clicks(await after(P, CLICK(HIS, 650, 450), RELEASE(HIS, 650, 450)), HIS) === 2;
    await ann(P, enc(['window-move-resize', HIS, 100, 50, 400, 300]));
    // ── MAJOR 2: an agent's popup over his window, opened with no act of his (an agent's CDP click): never his ──
    clock.skew += ((L.XR.XPRA_POPUP_OPEN_MS) || 1500) + 150; // his last act is older than the popup window now (a tree without the injected clock sleeps it)
    if (!L.XR.XPRA_POPUP_OPEN_MS) await sleep(1650);
    await ann(P, OR(APOP));
    out.agentPopupCut = (await after(P, CLICK(APOP, 150, 100))).length === 0;
    // …a SUBMENU: his pointer resting in his popup (no press for a while — the act that opens it), then xpra announces a popup
    // touching it — his
    await after(P, POINT(MENU, 160, 170)); // in his popup, far from where its submenu opens (r4: beyond his hover's reach — the popup rule alone)
    await ann(P, OR(SUB));
    out.submenuMine = clicks(await after(P, CLICK(SUB, 300, 120), RELEASE(SUB, 300, 120)), SUB) === 2;
    tree = TREE();
    await ann(P, enc(['lost-window', MENU]), enc(['lost-window', SUB]), enc(['lost-window', APOP]));
    out.toldClosed = !!(P.last() && JSON.stringify(P.last().wids) === JSON.stringify([HIS]));
    const OPEN_MS = L.XR.XPRA_POPUP_OPEN_MS || 1500, ASK_MS = L.XR.XPRA_SCOPE_ASK_MS || 1000;
    // ── r4 MINOR: his pointer RESTING on his window (no press for a while) — the tooltip that opens under it is his ──
    clock.skew += OPEN_MS + 150;
    await after(P, POINT(HIS, 300, 200));
    await ann(P, TIPOR(TIP));
    out.hoverTipMine = clicks(await after(P, POINT(TIP, 310, 230), CLICK(TIP, 310, 230), RELEASE(TIP, 310, 230)), TIP) === 2;
    // …bounded: a popup over his window far from his resting pointer is not his
    clock.skew += OPEN_MS + 150;
    await after(P, POINT(HIS, 120, 60));
    await ann(P, TIPOR(TIPFAR));
    out.hoverFarCut = (await after(P, CLICK(TIPFAR, 400, 310))).length === 0;
    // ── r4 MINOR (the rule's other half): a popup opening right after his press but NOT touching his window — not his ──
    clock.skew += OPEN_MS + 150;
    await after(P, CLICK(HIS, 150, 80), RELEASE(HIS, 150, 80));
    await ann(P, OR(FAR));
    out.farPopupCut = (await after(P, CLICK(FAR, 730, 510))).length === 0;
    await ann(P, enc(['lost-window', TIP]), enc(['lost-window', TIPFAR]), enc(['lost-window', FAR]));
    // ── r4 MAJOR 2: his window REPLACED while his browsing goes on (a Chrome relaunch, a crash restored): it closes — ONE read, his
    // reach is empty, told; the new one is announced — ONE read, it is his, told before he acts; his input lands in it ──
    const wordIs = (want) => until(() => (P.last() && JSON.stringify(P.last().wids) === JSON.stringify(want) ? P.last() : null), 800);
    clock.skew += ASK_MS + 100;
    tree = TREE_AS(null);
    await ann(P, enc(['lost-window', HIS]));
    out.rereadOnLost = !!(await wordIs([]));
    clock.skew += ASK_MS + 100;
    tree = TREE_AS(NEWHIS);
    await ann(P, NEW(NEWHIS, HISMETA));
    out.rereadOnNew = !!(await wordIs([NEWHIS])) && clicks(await after(P, CLICK(NEWHIS, 150, 80), RELEASE(NEWHIS, 150, 80)), NEWHIS) === 2;
    // …his tab moved into another window the display already showed (no announcement of his): his press there is refused, the
    // bridge reads again (≤ 1 per second), and his next press lands
    clock.skew += ASK_MS + 100;
    await ann(P, NEW(NEWHIS2, HISMETA)); // read at once: not his yet (his tab is still in NEWHIS)
    await until(() => false, 50);
    tree = TREE_AS(NEWHIS2);
    clock.skew += ASK_MS + 100;
    const p1 = await after(P, CLICK(NEWHIS2, 150, 80), RELEASE(NEWHIS2, 150, 80));
    out.rereadOnPress = clicks(p1, NEWHIS2) === 0 && !!(await wordIs([NEWHIS2])) && clicks(await after(P, CLICK(NEWHIS2, 150, 80), RELEASE(NEWHIS2, 150, 80)), NEWHIS2) === 2;
    // his window back where the scene began (xpra announces it; his reach follows)
    clock.skew += ASK_MS + 100;
    tree = TREE();
    await ann(P, enc(['lost-window', NEWHIS]), enc(['lost-window', NEWHIS2]), lz4His());
    out.rereadBack = !!(await wordIs([HIS]));
    // ── MAJOR 3 (the bridge's half): a key he holds when his seat moves is RELEASED in X, at the window that got it ──
    await after(P, KEY(HIS));
    const kk = P.up.pk.length;
    // ── FAIL 1: ONE PERSON, ONE SEAT — a second pane, then another client: the NEWEST pane holds it, the others watch, told ──
    const P2 = await sock(PERSON2, { pane: 'pane-b' });
    await after(P2);
    out.noStuckKey = !!(await until(() => P.up.pk.slice(kk).some((x) => x.type === 'key-action' && x.wid === HIS && x.pressed === false), 1000));
    out.secondPaneWins = typed(await after(P2, KEY(HIS), KEY(HIS, false))) && !typed(await after(P, KEY(HIS)));
    await after(P);
    out.toldOther = !!(P.last() && P.last().seat === 'watch' && P.last().why === 'other-window');
    const C = await sock(OTHER, { pane: 'pane-c', headers: { 'User-Agent': 'another-client' } });
    await after(C);
    const ones = [typed(await after(P, KEY(HIS), KEY(HIS, false))), typed(await after(P2, KEY(HIS), KEY(HIS, false))), typed(await after(C, KEY(HIS), KEY(HIS, false)))];
    out.oneSeat = ones.filter(Boolean).length === 1 && ones[2] === true;
    out.ones = ones;
    out.routeOther = await seatOf(PERSON);
    // «Use it here» on the FIRST pane: it takes the seat, the other client watches
    out.takeAgent = (await take(PERSON, { Authorization: 'Bearer vsst_agenttoken' })).status;
    out.takeBad = (await take('no spaces')).status;
    out.takeGone = (await take('wl-' + HEX(32, 9))).status;
    out.take = await take(PERSON);
    await after(P);
    out.takeHere = typed(await after(P, KEY(HIS), KEY(HIS, false))) && !typed(await after(C, KEY(HIS)));
    // ── MINOR: a pane that RECONNECTS (its old socket closing first) keeps its place — it never undoes «Use it here» ──
    C.ws.terminate();
    await until(async () => (await seatOf(OTHER)).connected === false, 2000); // the hub saw its socket go (its pane's place: r3 keeps it)
    const C2 = await sock(OTHER2, { pane: 'pane-c', headers: { 'User-Agent': 'another-client' } });
    await after(C2);
    out.reconnectKeeps = typed(await after(P, KEY(HIS), KEY(HIS, false))) && !typed(await after(C2, KEY(HIS)));
    // that pane gone: the newest remaining pane takes the seat
    P.ws.terminate();
    await until(() => C2.last() && C2.last().seat === 'input', 1500);
    out.leaveReelect = typed(await after(C2, KEY(HIS), KEY(HIS, false))) && !typed(await after(P2, KEY(HIS)));
    // ── his holding ended (human-end): cut again, told ──
    humans.delete('bp-x1'); lease({ kind: 'human-end', profileId: 'bp-x1', key: 'hu-x1' });
    await after(C2);
    out.toldEnd = !!(C2.last() && C2.last().seat === 'watch' && C2.last().why === 'not-browsing');
    out.endCut = !typed(await after(C2, KEY(HIS)));
    out.routeAfter = await seatOf(OTHER2);
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
 *  'input' mode: watch + not view-only) keeps focus in his reach, releases at the press's window, re-maps his moved window and
 *  never sends a display size; → facts. `bust` = a fresh module URL (a mutant copy's own client). */
async function clientFacts(root, bust = '') {
  const C = await import(pathToFileURL(path.join(root, 'src/lib/xpra-client.js')).href + bust);
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
  const A = { key: 'a', code: 'KeyA', keyCode: 65, mods: {} }, B = { key: 'b', code: 'KeyB', keyCode: 66, mods: {} }, K = { key: 'c', code: 'KeyC', keyCode: 67, mods: {} };
  w.feed(['hello', { 'packet-types': ['keyboard-config'] }]);
  // his window, then an agent's — announced BEFORE the seat word (the client focused the last one: no reach known yet)
  w.feed(['new-window', HIS, 100, 50, 400, 300, { title: 'his' }, {}]);
  w.feed(['new-window', AGENTS, 90, 40, 400, 300, { title: 'agent' }, {}]);
  const nw = w.all.length;
  w.feed(['vibespace-seat', { seat: 'input', why: '', code: 'not-your-window', refused: 2, acts: 1, wids: [HIS] }]);
  await sleep(0);
  // r4 MAJOR 1: the seat word RAISES his window — xpra told (the focus packet), drawn above the agent's announced after his
  const wHis = c.windows.get(HIS), wAg = c.windows.get(AGENTS), at0 = c.windowAt(150, 100);
  const seatRaise = { focus: w.all.slice(nw).some((p) => p[0] === 'focus' && p[1] === HIS), above: !!wHis && !!wAg && wHis.z > wAg.z, at: at0 ? at0.wid : 0 };
  // …his press in the OVERLAP (focused already) raises it again, xpra told, the click his
  let n0 = w.all.length;
  c.pointerButton(150, 100, 0, true, {}); c.pointerButton(150, 100, 0, false, {});
  const pressRaise = w.all.slice(n0).map((p) => (p[0] === 'focus' ? ['focus', p[1]] : p[0] === 'button-action' ? ['button', p[1], p[3]] : [p[0]]));
  n0 = w.all.length;
  c.keyDown(A); // his first key: HIS window (the seat word brought focus home)
  w.feed(['new-window', LATER, 600, 40, 400, 300, { title: 'another agent' }, {}]); // MAJOR 3: another conversation's window appears mid-typing
  c.keyUp(A); c.keyDown(B); c.keyUp(B);
  const n1 = w.all.length;
  // his own file chooser joins his reach (focused when it appears); a key held while focus moves is released where it was pressed
  w.feed(['vibespace-seat', { seat: 'input', why: '', code: '', refused: 2, acts: 1, wids: [HIS, MYDLG] }]);
  w.feed(['new-window', MYDLG, 220, 160, 200, 150, { title: 'Open File', 'transient-for': HIS }, {}]);
  w.feed(['new-window', AG2, 110, 60, 400, 300, { title: 'agent 2' }, {}]); // r4: another agent window, announced AFTER the seat word, over his
  const at2 = c.windowAt(150, 100), reach = { his: !!(c.windows.get(HIS) || {}).reach, ag2: !!(c.windows.get(AG2) || {}).reach, at: at2 ? at2.wid : 0 };
  c.pointerButton(150, 100, 0, true, {}); c.pointerButton(150, 100, 0, false, {}); // back to HIS — a point the agents' windows cover too
  c.keyDown(K);
  c.pointerButton(300, 230, 0, true, {}); c.pointerButton(300, 230, 0, false, {}); // focus → his dialog
  c.keyUp(K);
  // r4: his dialog gone before the bridge's word (no window of his focused): a key held there is released at the window of its press
  const L2 = { key: 'l', code: 'KeyL', keyCode: 76, mods: {} };
  c.keyDown(L2); w.feed(['lost-window', MYDLG]); c.keyUp(L2);
  // a drag from his window that ends over the agent's: the release goes to his window (X's implicit grab)
  c.pointerButton(495, 200, 0, true, {}); c.pointerButton(95, 45, 0, false, {});
  // xpra moved his window: the client says where it draws it now (the server's own geometry — nothing sized)
  w.feed(['window-move-resize', HIS, 300, 200, 400, 300]);
  c.resize(1000, 700);
  const all = w.all.slice(n0), keys = (from, to) => w.all.slice(from, to).filter((p) => p[0] === 'key-action').map((p) => [p[1], p[2], p[3]]);
  const btn = all.filter((p) => p[0] === 'button-action').map((p) => [p[1], p[3]]);
  const maps = w.all.filter((p) => p[0] === 'map-window').map((p) => p.slice(1, 6));
  // r4 MINOR: OUTSIDE the input seat (an app's own desktop window: active) a key's release goes to the focused window — the app's
  // dialog that opened while Ctrl was down — never back to the main window (xpra would raise the main over the dialog)
  const active = C.createXpraClient({ url: 'ws://x', workerUrl: 'w.js', screen: { width: 800, height: 600 }, Worker: FakeWorker });
  active.connect();
  const wa = await until(() => FakeWorker.last && FakeWorker.last !== w && FakeWorker.last.all.length ? FakeWorker.last : null, 2000);
  let activeKeys = null;
  if (wa) {
    wa.feed(['hello', { 'packet-types': ['keyboard-config'] }]);
    wa.feed(['new-window', 100, 0, 0, 800, 600, { title: 'app' }, {}]);
    const ctrl = { key: 'Control', code: 'ControlLeft', keyCode: 17, mods: { ctrl: true } }, o = { key: 'o', code: 'KeyO', keyCode: 79, mods: { ctrl: true } };
    const k0 = wa.all.length;
    active.keyDown(ctrl); active.keyDown(o); active.keyUp(o);
    wa.feed(['new-window', 101, 200, 150, 300, 200, { title: 'Open', 'transient-for': 100 }, {}]);
    active.keyUp(ctrl);
    activeKeys = wa.all.slice(k0).filter((p) => p[0] === 'key-action').map((p) => [p[1], p[3]]);
  }
  try { active.close?.(); } catch { }
  try { c.close?.(); } catch { }
  return { seen, sent: all.map((p) => p[0]), keys: keys(n0, n1), keysC: w.all.slice(n1).filter((p) => p[0] === 'key-action' && p[2] === 'c').map((p) => [p[1], p[3]]), keysL: w.all.slice(n1).filter((p) => p[0] === 'key-action' && p[2] === 'l').map((p) => [p[1], p[3]]), focusLater: all.some((p) => p[0] === 'focus' && p[1] === LATER), btn, maps, seatRaise, pressRaise, reach, activeKeys };
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
    reachDrawn: /w\.el\.style\.zIndex = String\(\(win\.reach \? Z_REACH : 0\) \+ \(Z_BASE\[win\.kind\] \|\| Z_BASE\.main\) \+ Math\.min\(win\.z, 99999\)\);/.test(view) && /const Z_REACH = (\d+);/.test(view) && Number(/const Z_REACH = (\d+);/.exec(view)[1]) >= 300000 + 99999,
    toastOnActs: /const more = \(Number\(v\.acts\) \|\| 0\) > bseat\.acts;/.test(dw) && /if \(more && bseat\.seat === 'input'\) \{/.test(dw),
    dw, live,
  };
}


// ═══ §1 ═══
console.log('§1 PURE — the seat, why it watches, his window (the real row path), the door\'s act (src/browser-picture.js); the bridge\'s readers');
const W0 = load(REPO);
{ const p = pureTable(W0.PIC); ok(p.ok, "a person's ELECTED socket ⇒ 'input' only while the browser has its human holder; his other socket, no holder, an agent's socket, a ticket-shaped id, no id ⇒ 'watch'", p.rows); }
{
  const PIC = W0.PIC, DD = W0.DD, why = typeof PIC.deskSeatWhy === 'function' ? PIC.deskSeatWhy : () => 'missing';
  ok(why({ viewerId: PERSON, person: true, human: true }) === null && why({ viewerId: PERSON, person: true, human: true, elected: false }) === 'other-window' && why({ viewerId: PERSON, person: true }) === 'not-browsing' && why({ viewerId: AGENT, human: true }) === 'watch-mode' && why({ viewerId: TICKET, person: true, human: true }) === 'watch-mode', "deskSeatWhy names every watch: 'other-window' (his other pane holds it), 'not-browsing' (its agents use it), 'watch-mode' (an agent's token, a ticket, no id); null = held");
  // THE REAL ROW PATH (acceptance r2 MAJOR 1: r2's fixture row was a shape this path never produces): the measured tree → rows
  const raw = DD.parseWininfoTree(TREE(MENU_ROW)), rows = rowsOf(DD, TREE(MENU_ROW));
  ok(raw.some((r) => r.id === MENU && r.name === null && r.cls === null && r.depth === 1) && !rows.some((r) => r.id === MENU) && rows.some((r) => r.id === DLG && r.frame), "MEASURED: his <select> popup is a nameless, classless top-level in the tree and seamlessWindows drops it — no row can say whose a menu is (the bridge reads xpra's announcements in order)", rows.map((r) => [r.id, r.title]));
  const sc = keeperScope(PIC, rows);
  ok(sc.wid === HIS && JSON.stringify(sc.wids) === JSON.stringify([HIS]) && sc.rects.length === 1 && sc.rects[0].x === 100, "xScopeOf over the real path: HIS window (his CDP bounds told) and only it — never the agent's file chooser cascaded over it (its centre inside his rect: r2's dialogsOver took it)", sc);
  ok(keeperScope(PIC, rows.filter((r) => r.id !== HIS && r.id !== AGENTS)).wids.length === 0 && PIC.xScopeOf(null, rows).wids.length === 0, 'xScopeOf: his window not on the display (or untold) ⇒ it reaches nothing');
  { const left = rows.filter((r) => r.id !== HIS), xw = PIC.xWindowOf({ bounds: { left: 100, top: 50, width: 400, height: 300 }, rows: left, profileDir: PROFILE_DIR }); ok(typeof PIC.xSeatRootOf === 'function' && xw.why === 'only-window' && keeperScope(PIC, left).wids.length === 0 && PIC.xSeatRootOf({ wid: HIS, why: 'bounds' }) === HIS, "r4 MAJOR 2 — his window closed, an agent's window left in his browser (xWindowOf: 'only-window'): his seat reaches NOTHING — its root only where his CDP bounds tell it (xSeatRootOf), never handed the agent's window", { why: xw.why, scope: keeperScope(PIC, left) }); }
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
  // r3: xpra's window metadata carries floats and long ints; a press's own `pressed` byte is where its release flips it
  const d64 = Buffer.alloc(8); d64.writeDoubleBE(1.5); const f32 = Buffer.alloc(4); f32.writeFloatBE(0.25);
  const fl = fx(Buffer.concat([Buffer.from([195, 129, 0x78, 44]), d64, Buffer.from([66]), f32]), 3), big = fx(Buffer.concat([Buffer.from([194, 129, 0x79, 61]), Buffer.from('12345678901', 'latin1'), Buffer.from([127])]), 2);
  const spans = [], kp = rp(['key-action', 7, 'a', true, [], 97, 'a', 38, 0]); fx(kp, 4, 4096, spans);
  ok(!!fl && fl[1] === 1.5 && fl[2] === 0.25 && !!big && big[1] === 12345678901 && spans.length === 4 && kp[spans[3][0]] === 67, "xpraFields (r3): a float64 / float32 / long int of xpra's metadata reads (never the whole packet unreadable); `spans` points at a press's own CHR_TRUE", { fl, big, spans });
  const lz = typeof XR.lz4Inflate === 'function' ? XR.lz4Inflate(LZ4_HIS) : null, rawHis = enc(['new-window', HIS, 100, 50, 400, 300, META_HIS, {}]).subarray(8);
  ok(!!lz && lz.equals(rawHis) && LZ4_HIS.length < rawHis.length, `lz4Inflate reads xpra's OWN lz4 bytes (xpra 6.5.4's compressor, ${LZ4_HIS.length} B → ${rawHis.length} B: literals + matches) — a Chrome window's announcement is over xpra's 378-byte compress floor`);
  ok(typeof XR.lz4Inflate === 'function' && XR.lz4Inflate(Buffer.from([0x10, 0, 0, 0, 0x50, 0x61])) === null && XR.lz4Inflate(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x7f]), LZ4_HIS.subarray(4)])) === null, 'lz4Inflate: a truncated block, a declared size over the bound ⇒ null (never a guess)');
  // the way down, read: a header split across chunks, a raw chunk skipped unread, an lz4 main packet, a plain one, a draw (not a window)
  const got = [];
  const watch = typeof XR.xpraWindowWatch === 'function' ? XR.xpraWindowWatch((f) => got.push([f[0], f[1], f[6] && f[6]['transient-for'], f[6] && f[6].title])) : null;
  if (watch) {
    const hdr = (level, index, n) => { const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 0x10; h[2] = level; h[3] = index; h.writeUInt32BE(n, 4); return h; };
    const rawChunk = Buffer.concat([hdr(0, 1, 300), Buffer.alloc(300, 7)]), lzPk = Buffer.concat([hdr(0x11, 0, LZ4_HIS.length), LZ4_HIS]);
    const dlg = enc(['new-window', DLG, 200, 150, 200, 150, { title: 'Open File', 'transient-for': AGENTS }, {}]), draw = enc(['draw', HIS, 0, 0, 10, 10, 'png', 'x', 1, 0, {}]);
    const all = Buffer.concat([rawChunk, lzPk, dlg, draw, enc(['lost-window', DLG])]);
    // the cuts split the first header, the raw chunk and the lz4 body
    watch(all.subarray(0, 3)); watch(all.subarray(3, 305)); watch(all.subarray(305, 320)); watch(all.subarray(320, 600)); watch(all.subarray(600));
    watch(Buffer.from('disconnect bye')); watch(dlg); // not xpra's framing: the reading ends for good
  }
  ok(JSON.stringify(got) === JSON.stringify([['new-window', HIS, null, 'his page - Google Chrome'], ['new-window', DLG, AGENTS, 'Open File'], ['lost-window', DLG, null, null]]), "xpraWindowWatch: xpra's window announcements read on their way down — split headers, a raw chunk skipped, lz4 inflated, a draw passed by, a bare `disconnect` line ends the reading", got);
}

// ═══ §2 ═══
console.log('§2 the REAL wiring — the desktop bridge, the live-view relay, a fake xpra upstream that announces its windows');
const S = await scene(REPO, 'main');
if (S.error) ok(false, 'the scene ran', S.error);
ok(S.opened, 'three sockets on the browser display: a person\'s (the desktop window), an agent\'s token, a ticket-shaped id');
ok(S.toldWatch === true && S.toldAgent === true, "FAIL 3 — every seated socket is TOLD its seat in-band: the person 'watch' / 'not-browsing', the agent's token 'watch' / 'watch-mode'");
ok(S.watchCut === true, 'no human holder: the person\'s key, keymap, display size and geometry are CUT');
ok(S.toldWatchRefused === true, "…and the refused act is told to THAT socket (its count, its code) — never only the hub's close line");
ok(S.watchPointerTold === true, "r3 MAJOR 2 (never silent) — a pointer passing by while he watches is told too: its count grows, no act (no toast)");
ok(S.heldReplay === true, 'browse yourself (human-start) re-seats the display AT ONCE: the keymap he sent while watching reaches xpra with nothing new sent');
ok(S.geometryNeverReplayed === true, "MAJOR A — the display size and the window geometry he sent while watching are NEVER replayed (only the live view's ruling pane sizes a Chrome window)");
ok(S.toldInput === true, `he is told his INPUT seat and the windows it reaches: exactly HIS window (r3: never the agent's file chooser cascaded over it) (${JSON.stringify(S.toldInputWids)})`);
ok(S.personTypes === true, 'his key, his click on HIS window, his paste reach xpra — ONE PERSON, ONE SEAT');
ok(S.menuMine === true && S.toldMenu === true, "r3 MAJOR 1 — the <select> popup HIS click opened (xpra's new-override-redirect right after his act; the tree's nameless row seamlessWindows drops) is his: his pointer and click on it reach xpra, he is told it");
ok(S.transientMine === true && S.toldTransient === true, "r3 — HIS file chooser (xpra's transient-for = his window) takes his clicks and keys, told");
ok(S.releaseInReach === true, "r4 MINOR — a key pressed on his window and released while his dialog has the focus: the release goes as sent (the focused window — xpra raises nothing for it), never re-addressed to his window over his dialog", S.releaseInReachGot);
ok(S.toldLost === true, "…it closes (xpra's lost-window): it leaves his reach, told");
ok(S.cascadeDialogCut === true && S.toldCascade === true, "r3 MAJOR 2 — WINDOW IDENTITY FIRST: the AGENT's file chooser cascaded over his window (transient-for the agent's; its centre inside his rect) takes nothing of his — cut, told 'not-your-window' (an act: the toast)");
ok(S.otherWidCut === true && S.toldNotYours === true, "MAJOR A — a key, a click addressed to an AGENT's window are cut, told 'not-your-window'");
ok(S.quietTold === true, `r3 MAJOR 2 — NEVER SILENT: the client's own focus of an agent's window ('focus-elsewhere') and a pointer passing over it ('pointer-outside') are cut and TOLD — quietly, no act (${JSON.stringify(S.quiet)})`);
ok(S.outsideCut === true, 'MAJOR A — a press addressed to his window but OUTSIDE it (xpra moves the X pointer there) is cut');
ok(S.geometryCut === true && S.toldInputOnly === true, "MAJOR A — a display size, a configure-window (his or an agent's), a close-window (his or an agent's), an unmap: cut, told 'input-only'");
ok(S.lifecycleTold === true, "r3 MAJOR 2 (never silent) — a server-lifecycle packet from his seat (cut from every viewer) is told too: 'server-lifecycle'");
ok(S.mapGeometryCut === true && S.mapOwnPasses === true, "r3 — a map-window with ANOTHER geometry is cut (xpra applies it from its ui driver, which his key made him); with the server's own it passes (the picture needs it)");
ok(S.releaseOutside === true && S.releaseReaddressed === true, "r3 MINOR — a drag that ends outside his window: its release reaches xpra AT the window of its press (re-addressed when a client sent it elsewhere) — never a button left down in X");
ok(S.movedStillMine === true, "r3 MINOR — his window moved (xpra's window-move-resize): his first press at its new place reaches xpra — no stale rect, no read after a miss");
ok(S.agentPopupCut === true, "r3 MAJOR 2 — an agent's popup over his window, opened with no act of his: never his (a window is not his because it lies inside his rect)");
ok(S.submenuMine === true && S.toldClosed === true, "r3 MAJOR 1 — a submenu (a popup opening as his pointer rests in his popup, touching it — no press for a while) is his too; his popups closed, his reach is his window again");
ok(S.hoverTipMine === true, "r4 MINOR — his pointer RESTING on his window (no press for a while): the tooltip that opens under it is his — his pointer and click on it reach xpra");
ok(S.hoverFarCut === true, "r4 MINOR — bounded: a popup over his window far from his resting pointer (> XPRA_HOVER_REACH_PX) is not his — cut");
ok(S.farPopupCut === true, "r4 MINOR — a popup opening right after his press but NOT touching the window he pressed: not his — cut (the rule's «touches» half)");
ok(S.rereadOnLost === true, "r4 MAJOR 2 — his window closes (xpra's lost-window) while his browsing goes on: the bridge reads his window again — his reach is empty, told");
ok(S.rereadOnNew === true, "r4 MAJOR 2 — a new top-level announced (his Chrome relaunched at his place): ONE read, it is his, told before he acts — his click lands in it");
ok(S.rereadOnPress === true, "r4 MAJOR 2 — his tab in another window the display already showed: his press there is refused, the bridge reads again, his next press lands");
ok(S.rereadBack === true, "r4 — his window announced again: his reach follows it");
ok(S.noStuckKey === true, 'r3 MAJOR 3 — a key he holds when his seat moves to another pane is RELEASED in X at the window that got it — never left down');
ok(S.agentCut === true, 'an AGENT\'s token on the same display never types (its verbs are its own)');
ok(S.ticketCut === true, 'a ticket-shaped id never falls to the person rule (the live-view relay\'s ticket verdict is the only one for it)');
ok(S.secondPaneWins === true && S.toldOther === true, "FAIL 1 — a second pane of his: the NEWEST pane holds the seat; the first watches, told 'other-window'");
ok(S.oneSeat === true, `FAIL 1 — two panes + another client: exactly ONE of his sockets types (the newest) (${JSON.stringify(S.ones)})`);
ok(S.takeHere === true && S.take && S.take.ok === true && S.take.seat === 'input', `«Use it here» (POST browser-seat) moves his seat to that pane; the other client watches (${JSON.stringify(S.take)})`);
ok(S.takeAgent === 403 && S.takeBad === 400 && S.takeGone === 409, `«Use it here» is a person's press: an agent token 403, a bad id 400, a pane not connected 409 (${S.takeAgent}, ${S.takeBad}, ${S.takeGone})`);
ok(S.reconnectKeeps === true, "r3 MINOR — a pane that RECONNECTS (its old socket gone first) keeps its place: it never undoes «Use it here»");
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
  ok(!c.error && c.seen.length >= 1 && c.seen[0].seat === 'input' && c.seen[0].code === 'not-your-window' && c.seen[0].refused === 2 && c.seen[0].acts === 1 && JSON.stringify(c.seen[0].wids) === JSON.stringify([HIS]), "the client hands the bridge's word to the view (on.seat): seat, code, counts (every refusal, the acts), windows", c.seen);
  ok(!c.error && JSON.stringify(c.keys) === JSON.stringify([[HIS, 'a', true], [HIS, 'a', false], [HIS, 'b', true], [HIS, 'b', false]]) && !c.focusLater, "r3 MAJOR 3 — focus stays in his reach: the seat word brings it home (another's window announced last), a window that appears mid-typing takes nothing — his keys land in his window", c.keys);
  ok(!c.error && c.seatRaise && c.seatRaise.focus === true && c.seatRaise.above === true && c.seatRaise.at === HIS, "r4 MAJOR 1 — the seat word RAISES his window: the focus packet to HIS, his window above the agent's announced after it, a point they share is his", c.seatRaise);
  ok(!c.error && JSON.stringify(c.pressRaise) === JSON.stringify([['focus', HIS], ['button', HIS, true], ['button', HIS, false]]), "r4 MAJOR 1 — his press in the overlap, his window focused already: raised again (the focus packet to HIS — xpra raises it in X), the click his", c.pressRaise);
  ok(!c.error && c.reach && c.reach.his === true && c.reach.ag2 === false && c.reach.at === HIS && JSON.stringify(c.btn.slice(0, 2)) === JSON.stringify([[HIS, true], [HIS, false]]), "r4 MAJOR 1 — an agent's window announced AFTER the seat word, over his: his reach stays above it (drawn and addressed) — his click in the overlap is his", { reach: c.reach, btn: c.btn });
  ok(!c.error && JSON.stringify(c.keysC) === JSON.stringify([[HIS, true], [MYDLG, false]]), "r4 MINOR — a key held while focus moves to his own dialog is released at the FOCUSED window (xpra raises nothing — r3's release at the press's window raised his window over his dialog)", c.keysC);
  ok(!c.error && JSON.stringify(c.keysL) === JSON.stringify([[MYDLG, true], [MYDLG, false]]), "r4 — in his input seat with no window of his focused (his dialog gone before the bridge's word): a held key's release goes to the window of its press", c.keysL);
  ok(!c.error && JSON.stringify(c.activeKeys) === JSON.stringify([[100, true], [100, true], [100, false], [101, false]]), "r4 MINOR — outside the input seat (an app's desktop window): Ctrl released after the app's dialog opened goes to the focused dialog, never back to the main window", c.activeKeys);
  ok(!c.error && JSON.stringify(c.btn.slice(-2)) === JSON.stringify([[HIS, true], [HIS, false]]), "r3 MINOR — a drag from his window that ends over the agents': the client addresses the release to his window (X's implicit grab)", c.btn);
  ok(!c.error && c.maps.some((m) => JSON.stringify(m) === JSON.stringify([HIS, 300, 200, 400, 300])), "r3 MINOR — xpra moved his window: the client maps it where it now draws it (the server's own geometry), so his pointer lands where he points", c.maps);
  ok(!c.error && c.sent.includes('key-action') && c.sent.includes('button-action') && !c.sent.some((x) => /desktop_size|display-configure|configure-display|configure-window/.test(x)) && JSON.stringify(c.maps[0]) === JSON.stringify([HIS, 100, 50, 400, 300]), "Watch's picture with his input (the view's 'input' mode): his key and click are sent, his window mapped where the server has it, a pane resize sends no size", c.sent);
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
  ok(D.toastOnActs, "r3 — the window's one toast is for a refused ACT (his press, his key: `acts`); a quiet refusal is told, never toasted");
  ok(D.labelIsAct, "MAJOR B — the door's label IS its act: «Use it here» POSTs the seat, «Browse yourself» / «Open your browsing window» open his own tab (and hold his seat in THIS pane — measured: a synced copy on another client took it); no «Take over» that is no takeover");
  ok(D.doorVerdict, "MAJOR B — the door's act is deskDoorAct's (a conversation's temporary browser: no button, the words say why)");
  ok(D.inputMode, "the view's 'input' mode: Watch's picture (nothing sized), his input sent");
  ok(D.reachDrawn, "r4 MAJOR 1 — the view stacks his reach (the client's win.reach) above every window of the others, popups included");
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
  const XRF = 'src/server/stream-relay-xpra.js', XCF = 'src/lib/xpra-client.js';
  const MUTANTS = [
    { tag: 'no-holder-rule', need: 'watchCut', file: 'src/browser-picture.js', from: "return person && human && elected ? 'input' : 'watch';", to: "return person && elected ? 'input' : 'watch';", red: (s) => s.watchCut === false },
    { tag: 'seat-root-only-window', file: 'src/browser-picture.js', from: "return xw && xw.why === 'bounds' && xw.wid != null", to: 'return xw && xw.wid != null', pure: true, red: (P) => P.xSeatRootOf({ wid: AGENTS, why: 'only-window' }) !== null },
    { tag: 'ticket-falls-through', file: 'src/browser-picture.js', from: "if (!viewerId || X_TICKET_RE.test(String(viewerId))) return 'watch';", to: "if (!viewerId) return 'watch';", pure: true, red: (P) => P.deskSeat({ viewerId: TICKET, person: true, human: true }) !== 'watch' },
    { tag: 'ticket-elected', need: 'toldInput', file: 'src/server/window-live-wiring.js', from: ' || PIC.X_TICKET_RE.test(String(viewerId))) return;', to: ') return;', red: (s) => s.toldInput === false },
    { tag: 'every-socket-a-person', need: 'agentCut', file: 'src/server/desktop-stream.js', from: "person: !bearerOf(req) });", to: 'person: true });', red: (s) => s.agentCut === false },
    { tag: 'wiring-ignores-person', need: 'agentCut', file: 'src/server/window-live-wiring.js', from: 'if (!person || !viewerId || PIC.X_TICKET_RE', to: 'if (!viewerId || PIC.X_TICKET_RE', red: (s) => s.agentCut === false },
    { tag: 'no-reseat-at-holding', need: 'heldReplay', file: 'src/server/browser-stream.js', from: "if (ev && (ev.kind === 'human-start' || ev.kind === 'human-end') && ev.profileId) { noteHumanSeat(ev.profileId); askXScope(ev.profileId, ev.kind); }", to: '', red: (s) => s.heldReplay === false },
    { tag: 'replay-geometry', need: 'geometryNeverReplayed', file: XRF, from: "else if (s === 'input') replayInput();", to: "else if (s === 'input') replayHeld();", red: (s) => s.geometryNeverReplayed === false },
    { tag: 'popup-never-his', need: 'menuMine', file: XRF, from: 'if (a) e.owner = a.wid;', to: '', red: (s) => s.menuMine === false },
    { tag: 'submenu-not-an-act', need: 'submenuMine', file: XRF, from: "(type === 'pointer-position' && book.get(wid) && book.get(wid).or)", to: 'false', red: (s) => s.submenuMine === false },
    { tag: 'transient-ignored', need: 'transientMine', file: XRF, from: 'const up = e ? (e.or ? e.owner : e.tf) : 0;', to: 'const up = e ? (e.or ? e.owner : 0) : 0;', red: (s) => s.transientMine === false },
    { tag: 'geometry-not-identity', need: 'cascadeDialogCut', file: XRF, from: 'if (!mineWid(wid, top)) { // identity first', to: 'if (false) { // identity first', red: (s) => s.cascadeDialogCut === false },
    { tag: 'quiet-silent', need: 'quietTold', file: XRF, from: '.some((c) => !XPRA_QUIET_CODES.has(c))) tellSeat(); else tellQuiet(); }', to: '.some((c) => !XPRA_QUIET_CODES.has(c))) tellSeat(); }', red: (s) => s.quietTold === false },
    { tag: 'no-point-check', need: 'outsideCut', file: XRF, from: 'if (!mineAll(top).some((w) => inRect(rectOf(w), c[0], c[1]))) {', to: 'if (false) {', red: (s) => s.outsideCut === false },
    { tag: 'geometry-passes', need: 'geometryCut', file: XRF, from: "if (!Object.hasOwn(XPRA_SCOPED_INPUT, type)) return 'input-only';", to: 'if (!Object.hasOwn(XPRA_SCOPED_INPUT, type)) return null;', red: (s) => s.geometryCut === false },
    { tag: 'lifecycle-silent', need: 'lifecycleTold', file: XRF, from: "if (r.dropped > coded) r.codes[r.lifecycle ? 'server-lifecycle' : 'input-only'] = r.dropped - coded;", to: '', red: (s) => s.lifecycleTold === false },
    { tag: 'map-geometry-passes', need: 'mapGeometryCut', file: XRF, from: "type !== null && type !== 'map-window' && (XPRA_WATCH_TYPES", to: 'type !== null && (XPRA_WATCH_TYPES', red: (s) => s.mapGeometryCut === false },
    { tag: 'release-readdressed-in-reach', need: 'releaseInReach', file: XRF, from: 'if (wid === d.wid || mineWid(wid, top)) return null;', to: 'if (wid === d.wid) return null;', red: (s) => s.releaseInReach === false },
    { tag: 'hover-not-an-act', need: 'hoverTipMine', file: XRF, from: "else if (type === 'pointer-position') hover = {", to: 'else if (false) hover = {', red: (s) => s.hoverTipMine === false },
    { tag: 'hover-unbounded', need: 'hoverFarCut', file: XRF, from: ' && touches({ x: hover.x, y: hover.y, w: 1, h: 1 }, e, XPRA_HOVER_REACH_PX)) return hover;', to: ') return hover;', red: (s) => s.hoverFarCut === false },
    { tag: 'popup-touch-ignored', need: 'farPopupCut', file: XRF, from: 'mineWid(act.wid) && touches(rectOf(act.wid), e, XPRA_POPUP_GAP_PX)) return act;', to: 'mineWid(act.wid)) return act;', red: (s) => s.farPopupCut === false },
    { tag: 'no-reread-on-lost', need: 'rereadOnLost', file: XRF, from: "if (wid === topOf() && seatState(id, seatRef.seat) === 'input') ask(", to: 'if (false) ask(', red: (s) => s.rereadOnLost === false },
    { tag: 'no-reread-on-new', need: 'rereadOnNew', file: XRF, from: "else if (!e.or && !e.tf && seatState(id, seatRef.seat) === 'input' && !mineWid(wid)) ask(", to: 'else if (false) ask(', red: (s) => s.rereadOnNew === false },
    { tag: 'no-reread-on-press', need: 'rereadOnPress', file: XRF, from: "else if (pressed === true) ask(`a press on window ${wid}, not his`);", to: '', red: (s) => s.rereadOnPress === false },
    { tag: 'release-dropped', need: 'releaseOutside', file: XRF, from: 'if (pressed === false && downs.has(key)) {', to: 'if (false) {', red: (s) => s.releaseOutside === false },
    { tag: 'rects-stale', need: 'movedStillMine', file: XRF, from: "if (type === 'window-move-resize' || type === 'configure-override-redirect') Object.assign(e,", to: 'if (false) Object.assign(e,', red: (s) => s.movedStillMine === false },
    { tag: 'popup-by-geometry', need: 'agentPopupCut', file: XRF, from: 'act && t - act.at <= XPRA_POPUP_OPEN_MS && ', to: 'act && ', red: (s) => s.agentPopupCut === false },
    { tag: 'no-release-on-seat-loss', need: 'noStuckKey', file: XRF, from: "if (s !== 'input') releaseDowns(", to: "if (false) releaseDowns(", red: (s) => s.noStuckKey === false },
    { tag: 'silent', need: 'toldWatch', file: XRF, from: 'sendDown(rencodePlus([XPRA_SEAT_PACKET,', to: 'void (([XPRA_SEAT_PACKET,', red: (s) => s.toldWatch === false },
    { tag: 'no-election', need: 'oneSeat', file: 'src/server/window-live-wiring.js', from: "elected: !!viewerId && electedOf(id) === String(viewerId)", to: 'elected: true', red: (s) => s.oneSeat === false },
    { tag: 'take-ignored', need: 'takeHere', file: 'src/server/window-live-wiring.js', from: 'e.panes.set(s.pane, ++e.seq); s.seq = ++e.seq;', to: 's.seq = ++e.seq;', red: (s) => s.takeHere === false },
    { tag: 'pane-forgotten', need: 'reconnectKeeps', file: 'src/server/window-live-wiring.js', from: 'e.gone.set(pane, now()); // r3', to: 'e.panes.delete(pane); // r3', red: (s) => s.reconnectKeeps === false },
    { tag: 'focus-follows-windows', file: XCF, from: 'if (!win || !mayFocus(wid)) return;', to: 'if (!win) return;', client: true, red: (c) => !c.error && (c.focusLater || c.keys.some((k) => k[0] !== HIS)) },
    { tag: 'key-release-never-at-press', file: XCF, from: 'if (seatWids && !seatWids.has(wid)) wid = at;', to: '', client: true, red: (c) => !c.error && JSON.stringify(c.keysL) !== JSON.stringify([[MYDLG, true], [MYDLG, false]]) },
    { tag: 'key-release-at-press', file: XCF, from: 'if (seatWids && !seatWids.has(wid)) wid = at;', to: 'wid = at;', client: true, red: (c) => !c.error && JSON.stringify(c.keysC) !== JSON.stringify([[HIS, true], [MYDLG, false]]) },
    { tag: 'seat-word-no-raise', file: XCF, from: 'if (home) focusWindow(home); }', to: 'if (home) focusedWid = home; }', client: true, red: (c) => !c.error && (!c.seatRaise || c.seatRaise.focus !== true) },
    { tag: 'press-never-raises', file: XCF, from: "(win.wid !== focusedWid || win.reach)) focusWindow(win.wid);", to: 'win.wid !== focusedWid) focusWindow(win.wid);', client: true, red: (c) => !c.error && JSON.stringify(c.pressRaise) !== JSON.stringify([['focus', HIS], ['button', HIS, true], ['button', HIS, false]]) },
    { tag: 'no-reach-layer', file: XCF, from: 'const rank = (w) => (w.reach ? 3e9 : 0) + ', to: 'const rank = (w) => ', client: true, red: (c) => !c.error && (!c.reach || c.reach.at !== HIS) },
    { tag: 'button-release-at-pointer', file: XCF, from: 'else if (buttonWid.has(b)) { at = windows.get(buttonWid.get(b)) || win; buttonWid.delete(b); }', to: '', client: true, red: (c) => !c.error && JSON.stringify(c.btn.slice(-2)) !== JSON.stringify([[HIS, true], [HIS, false]]) },
    { tag: 'no-remap-on-move', file: XCF, from: 'if (moved && watch && !viewOnly && seatWids && seatWids.has(wid) && win.mapped) send(', to: 'if (false) send(', client: true, red: (c) => !c.error && !c.maps.some((m) => JSON.stringify(m) === JSON.stringify([HIS, 300, 200, 400, 300])) },
    { tag: 'door-on-any-prompt', file: 'src/browser-picture.js', from: "(stuck.state === 'prompt' && !!stuck.prompt && stuck.prompt.native === true)", to: "(stuck.state === 'prompt')", pure: true, red: (P) => P.deskDoorOf({ source: { source: 'x', displaySession: 'da-x1' }, stuck: { state: 'prompt', prompt: { type: 'file' } }, human: true }) === 'da-x1' },
    { tag: 'door-in-any-view', file: 'src/browser-picture.js', from: 'if (!human || !source ||', to: 'if (!source ||', pure: true, red: (P) => P.deskDoorOf({ source: { source: 'x', displaySession: 'da-x1' }, stuck: { state: 'passkey', headed: true } }) === 'da-x1' },
    { tag: 'temporary-door', file: 'src/browser-picture.js', from: "if (!profile || profile.ephemeral === true) return { act: null, code: 'not_attachable' };", to: "if (!profile) return { act: 'browse', code: null };", pure: true, red: (P) => P.deskDoorAct({ profile: null }).act !== null },
    { tag: 'satellite-not-one-input', file: 'src/lib/keyboard-yield.js', from: '(el.closest(SATELLITE_HOST) || el.closest(INPUT_HOSTS))', to: 'el.closest(INPUT_HOSTS)', sat: true, red: (f) => f.satellite === false },
    { tag: 'door-says-take-over', file: 'src/lib/desktop-app-window.js', from: ": doorAct === 'open' ? t('Open your browsing window') : t('Browse yourself');", to: ": t('Take over');", door: true, red: (d) => d.labelIsAct === false },
    { tag: 'unread-is-active', file: 'src/lib/desktop-app-window.js', from: "browserDisplay() ? bseat.seat || 'watch' :", to: "browserDisplay() && bseat.seat ? bseat.seat :", door: true, red: (d) => d.unknownIsWatch === false },
    { tag: 'toast-on-any-refusal', file: 'src/lib/desktop-app-window.js', from: 'const more = (Number(v.acts) || 0) > bseat.acts;', to: 'const more = (Number(v.refused) || 0) > bseat.refused;', door: true, red: (d) => d.toastOnActs === false },
  ];
  for (const m of MUTANTS) {
    const f = path.join(M, m.file), orig = fs.readFileSync(f, 'utf8');
    if (orig.split(m.from).length !== 2) { ok(false, `mutant ${m.tag}: its line is in ${m.file} exactly once`); continue; }
    fs.writeFileSync(f, orig.replace(m.from, m.to));
    for (const k of Object.keys(require.cache)) if (k.startsWith(M + path.sep)) delete require.cache[k];
    let facts = null;
    try { facts = m.pure ? load(M).PIC : m.sat ? await satelliteFacts(M + '/./') : m.door ? doorFacts(M) : m.client ? await clientFacts(M, `?mutant=${m.tag}`) : await scene(M, m.tag, m.need); } catch (e) { facts = { error: String(e && e.message) }; }
    fs.writeFileSync(f, orig);
    const shown = facts && !m.pure && !m.door ? facts : undefined;
    ok(!!facts && !facts.error && m.red(facts), `MUTANT ${m.tag} (${m.file}) ⇒ its leg goes RED`, shown);
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
