#!/usr/bin/env node
// lane desktop-v2-latency (design q-030 §4 + §6 P1 seed TESTS): the REAL src/lib/vnc-view.js (ladder + pasteKeys, the machine
// window's options) over an RFB whose quality / compression setters, _sendEncodings, clipboardPasteFrom and sendKey are
// noVNC 1.7's OWN (borrowed from the bundled @novnc/novnc core, writing through its own Websock into the channel the view
// opens) — so every byte checked below is the byte noVNC puts on the wire. Fake DOM, fake WebSocket, no chrome.
//   §1 the ladder: the first rung rides noVNC's first SetEncodings (nothing extra); input ⇒ ONE SetEncodings (quality 3 /
//      compression 1 in the same message); still 500 ms ⇒ ONE SetEncodings (8 / 2) + ONE non-incremental request for the shown
//      display; a moving picture (answers to incremental requests) ⇒ fluid, a hover is not input; a slow link ⇒ lean / balanced
//   §2 paste: Ctrl+V is kept from noVNC (stopPropagation, never preventDefault — the browser's paste must happen); the paste
//      event's text/plain goes as ClientCutText (CRLF → LF, noVNC's Latin-1), THEN the V; nothing to paste ⇒ the V alone;
//      a watching pane / Ctrl+C are left alone
//   §3 the strip: the machine window passes ladder + pasteKeys, full screen = its content, the lock behind keyboardLockGate
//      with the page's isSecureContext; every new word in zh + ja
//   §4 RED CONTROL: a copy of vnc-view that writes the compression through noVNC's public setter sends TWO SetEncodings
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 700) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = () => sleep(0); // the ladder judges in a microtask after noVNC's send
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.log('  ✗ src/lib/build-version.js missing — run `npm run build` first'); process.exit(1); }

// ── a fake DOM (listeners kept per phase so a capture listener runs first) ──
class El {
  constructor(tag) { this.tagName = tag; this.style = {}; this.children = []; this.className = ''; this.textContent = ''; this.title = ''; this.hidden = false; this.dataset = {}; this._l = []; this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false }; }
  append(...els) { for (const e of els) this.children.push(e); }
  appendChild(e) { this.children.push(e); return e; }
  removeChild(e) { return e; }
  prepend(...els) { this.children.unshift(...els); }
  insertBefore(e) { this.children.push(e); return e; }
  replaceChildren(...els) { this.children = els; }
  addEventListener(k, fn, o) { this._l.push({ k, fn, capture: o === true || !!(o && o.capture) }); }
  removeEventListener() {}
  remove() {} setAttribute() {} removeAttribute() {} getAttribute() { return null; } focus() {} blur() {}
  querySelector() { return null; } querySelectorAll() { return []; } contains() { return true; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 500 }; }
  get isConnected() { return true; }
  set innerHTML(v) { this._html = v; } get innerHTML() { return this._html || ''; }
}
// dispatch on `el` as the target: capture listeners first, then the rest (what the browser does at the target's ancestor)
const fire = (el, type, init = {}) => { const ev = { type, defaultPrevented: false, propagationStopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, stopImmediatePropagation() { this.propagationStopped = true; }, ...init }; for (const l of el._l.filter((x) => x.k === type && x.capture)) l.fn(ev); for (const l of el._l.filter((x) => x.k === type && !x.capture)) l.fn(ev); return ev; };
globalThis.window = globalThis;
globalThis.document = { createElement: (t) => new El(t), body: new El('body'), documentElement: new El('html'), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, hidden: false };
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { protocol: 'https:', host: 'vibe.example', origin: 'https://vibe.example', href: 'https://vibe.example/' };
globalThis.isSecureContext = true;
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node', platform: 'Linux', maxTouchPoints: 0, clipboard: null }, configurable: true });
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.MutationObserver = class { observe() {} disconnect() {} };
// the channel the view opens (noVNC 1.7 takes it): every send recorded as bytes, `recv(n)` = n bytes in
class FakeWS {
  constructor(url) { this.url = url; this.readyState = 1; this.binaryType = 'blob'; this.protocol = ''; this.onopen = this.onmessage = this.onerror = this.onclose = null; this.sent = []; this._m = []; FakeWS.last = this; }
  send(d) { this.sent.push(Uint8Array.from(d instanceof Uint8Array ? d : new Uint8Array(d))); }
  close() { this.readyState = 3; }
  addEventListener(k, fn) { if (k === 'message') this._m.push(fn); }
  removeEventListener() {}
  recv(n) { for (const fn of this._m) fn({ data: new ArrayBuffer(n) }); }
}
Object.assign(FakeWS, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
const NV = path.join(REPO, 'node_modules/@novnc/novnc/core/');
const { default: RealRFB } = await import(pathToFileURL(NV + 'rfb.js').href);
const { default: Websock } = await import(pathToFileURL(NV + 'websock.js').href);
globalThis.WebSocket = FakeWS;
// an RFB whose wire-facing methods ARE noVNC's (the protocol state machine is not needed: `up()` = connected)
const P = RealRFB.prototype, D = (k) => Object.getOwnPropertyDescriptor(P, k);
class HalfRFB {
  constructor(target, channel) {
    Object.assign(this, { _l: {}, _rfbConnectionState: 'connecting', _viewOnly: false, _fbDepth: 24, _qualityLevel: 6, _compressionLevel: 2, _clipboardServerCapabilitiesFormats: {}, _clipboardServerCapabilitiesActions: {}, _qemuExtKeyEventSupported: false, _fbWidth: 2560, _fbHeight: 800 });
    this._sock = new Websock(); this._sock.attach(channel); HalfRFB.last = this;
  }
  addEventListener(k, fn) { (this._l[k] ||= []).push(fn); }
  emit(k, detail) { for (const fn of this._l[k] || []) fn({ detail }); }
  get qualityLevel() { return D('qualityLevel').get.call(this); } set qualityLevel(v) { D('qualityLevel').set.call(this, v); }
  get compressionLevel() { return D('compressionLevel').get.call(this); } set compressionLevel(v) { D('compressionLevel').set.call(this, v); }
  get viewOnly() { return this._viewOnly; } set viewOnly(v) { this._viewOnly = !!v; }
  _sendEncodings() { return P._sendEncodings.call(this); }
  clipboardPasteFrom(t) { return P.clipboardPasteFrom.call(this, t); }
  sendKey(k, c, d) { return P.sendKey.call(this, k, c, d); }
  disconnect() {} focus() {}
  up() { this._rfbConnectionState = 'connected'; this.emit('connect'); }
}
// the wire, read back: SetEncodings → {q, c}; requests → incremental flag + rect; keys; cut text
const wire = (ws, from = 0) => ws.sent.slice(from).map((b) => {
  const v = new DataView(b.buffer);
  if (b[0] === 2) { const n = v.getUint16(2); const e = []; for (let i = 0; i < n; i++) e.push(v.getInt32(4 + 4 * i)); return { t: 'enc', q: e.find((x) => x >= -32 && x <= -23) + 32, c: e.find((x) => x >= -256 && x <= -247) + 256 }; }
  if (b[0] === 3) return { t: 'req', inc: b[1], rect: [v.getUint16(2), v.getUint16(4), v.getUint16(6), v.getUint16(8)] };
  if (b[0] === 4) return { t: 'key', down: b[1], sym: v.getUint32(4) };
  if (b[0] === 5) return { t: 'ptr', mask: b[1] };
  if (b[0] === 6) { const n = v.getUint32(4); return { t: 'cut', text: Buffer.from(b.subarray(8, 8 + n)).toString('latin1') }; }
  return { t: 'other', type: b[0] };
});
const encs = (ws, from) => wire(ws, from).filter((m) => m.t === 'enc');
const M = RealRFB.messages;

async function mount(V) {
  const host = new El('div');
  const qs = [];
  const view = V.createVncView(host, { url: 'wss://vibe.example/api/desktop/machine-desktop.win-a/stream', autoReconnect: false, resizeSession: false, channel: true, ladder: true, pasteKeys: true, onQuality: (p) => qs.push(p.rung), loadRFB: async () => HalfRFB });
  view.connect();
  for (let i = 0; i < 50 && !HalfRFB.last; i++) await sleep(10);
  const rfb = HalfRFB.last, ws = FakeWS.last;
  return { host, view, rfb, ws, qs };
}

const V = await import(pathToFileURL(path.join(REPO, 'src/lib/vnc-view.js')).href);
console.log('§1 the ladder (noVNC\'s own SetEncodings)');
HalfRFB.last = null;
const A = await mount(V);
ok(!!A.rfb && A.rfb._qualityLevel === 8 && A.rfb._compressionLevel === 2 && encs(A.ws).length === 0 && A.view.quality.rung === 'sharp', 'before connect the first rung (sharp 8 / 2) is written — it rides noVNC\'s own first SetEncodings, nothing extra is sent', { q: A.rfb && A.rfb._qualityLevel, sent: wire(A.ws) });
A.rfb.up();
let mark = A.ws.sent.length;
M.pointerEvent(A.rfb._sock, 100, 100, 0);
await tick();
ok(encs(A.ws, mark).length === 0 && A.view.quality.rung === 'sharp', 'a hover (PointerEvent, no button) is not input: no SetEncodings');
A.rfb.sendKey(0x61, 'KeyA', true); A.rfb.sendKey(0x61, 'KeyA', false); A.rfb.sendKey(0x62, 'KeyB');
await tick();
let e = encs(A.ws, mark);
ok(e.length === 1 && e[0].q === 3 && e[0].c === 1 && A.view.quality.rung === 'fluid', 'input ⇒ ONE SetEncodings carrying quality 3 AND compression 1 (three key events, one message)', wire(A.ws, mark));
A.view.setCrop({ x: 1280, y: 0, w: 1280, h: 800 });
mark = A.ws.sent.length;
await sleep(Math.round(500 * 0.6));
ok(encs(A.ws, mark).length === 0, 'still 300 ms: no change yet (settling)');
await sleep(400);
let w = wire(A.ws, mark);
ok(same(w, [{ t: 'enc', q: 8, c: 2 }, { t: 'req', inc: 0, rect: [1280, 0, 1280, 800] }]) && A.view.quality.rung === 'sharp', 'still ≥ 500 ms ⇒ ONE SetEncodings (8 / 2), then ONE non-incremental request for the SHOWN display (1280,0 1280×800)', w);
await sleep(700);
ok(A.ws.sent.length === mark + 2, 'and nothing more while it stays still');
// a moving picture: answers (≥ 24 KB) to incremental requests, two inside a second
mark = A.ws.sent.length;
for (let i = 0; i < 3; i++) { A.ws.recv(20000); M.fbUpdateRequest(A.rfb._sock, true, 0, 0, 2560, 800); await sleep(60); }
w = wire(A.ws, mark).filter((m) => m.t === 'enc');
ok(same(w, [{ t: 'enc', q: 3, c: 1 }]) && A.view.quality.rung === 'fluid', 'a moving picture (updates answering incremental requests, ≥ 24 KB in a second) ⇒ ONE SetEncodings 3 / 1', wire(A.ws, mark));
await sleep(650);
ok(A.view.quality.rung === 'sharp' && encs(A.ws, mark).length === 2, 'the picture stops ⇒ sharp again (one more SetEncodings — the refresh that follows does not flip it back)', wire(A.ws, mark));
// a full refresh answered is not a change; one big answer alone is not a moving picture
mark = A.ws.sent.length;
M.fbUpdateRequest(A.rfb._sock, false, 0, 0, 2560, 800); A.ws.recv(400000); M.fbUpdateRequest(A.rfb._sock, true, 0, 0, 2560, 800);
await sleep(50);
ok(encs(A.ws, mark).length === 0 && A.view.quality.rung === 'sharp', 'a non-incremental answer (400 KB) is not a moving picture: still sharp');
ok(same(A.qs.slice(0, 3), ['sharp', 'fluid', 'sharp']), 'onQuality saw every rung (the strip redraws from it)', A.qs);
// a slow link (a fresh window): 2 × 40 KB updates, each 600 ms from its first byte to the next request ⇒ ~530 kbps < 2000
HalfRFB.last = null;
const S2 = await mount(V);
S2.rfb.up();
M.fbUpdateRequest(S2.rfb._sock, true, 0, 0, 2560, 800); // noVNC's request after its first update
await tick();
mark = S2.ws.sent.length;
for (let i = 0; i < 2; i++) { S2.ws.recv(20000); await sleep(300); S2.ws.recv(20000); await sleep(300); M.fbUpdateRequest(S2.rfb._sock, true, 0, 0, 2560, 800); }
await sleep(20);
const st = S2.view.stats();
w = encs(S2.ws, mark);
ok(st.kbps != null && st.kbps < 2000 && S2.view.quality.slow && S2.view.quality.rung === 'lean' && same(w, [{ t: 'enc', q: 6, c: 4 }, { t: 'enc', q: 1, c: 6 }]), `a slow link (measured ${st.kbps} kbps): the first slow update (still) ⇒ balanced 6 / 4, the picture moving ⇒ lean 1 / 6 — one SetEncodings each`, { st, w, q: S2.view.quality });
await sleep(650);
w = encs(S2.ws, mark);
ok(S2.view.quality.rung === 'balanced' && same(w, [{ t: 'enc', q: 6, c: 4 }, { t: 'enc', q: 1, c: 6 }, { t: 'enc', q: 6, c: 4 }]), 'still on the slow link ⇒ balanced 6 / 4 (one rung under sharp)', w);
S2.view.dispose();

console.log('§2 paste: the page\'s clipboard → ClientCutText, then the V');
const canvas = A.view.mount; // the listeners sit on the mount, the canvas inside it is the event's target
mark = A.ws.sent.length;
let kd = fire(canvas, 'keydown', { key: 'v', code: 'KeyV', ctrlKey: true });
ok(kd.propagationStopped && !kd.defaultPrevented, 'Ctrl+V: kept from noVNC (stopPropagation) and NOT prevented — the browser\'s own paste must happen');
let pe = fire(canvas, 'paste', { clipboardData: { getData: (k) => (k === 'text/plain' ? 'héllo\r\nwörld' : '') } });
w = wire(A.ws, mark).filter((m) => m.t !== 'enc' && m.t !== 'req');
ok(pe.defaultPrevented && same(w, [{ t: 'cut', text: 'héllo\nwörld' }, { t: 'key', down: 1, sym: 0x76 }, { t: 'key', down: 0, sym: 0x76 }]), 'the paste event ⇒ ClientCutText "héllo⏎wörld" (CRLF → LF, noVNC\'s Latin-1 bytes), THEN v down / up — in that order on the wire', w);
const cutBytes = A.ws.sent.slice(mark).find((b) => b[0] === 6);
ok(!!cutBytes && same([...cutBytes.subarray(0, 8)], [6, 0, 0, 0, 0, 0, 0, 11]) && cutBytes[9] === 0xe9, 'the bytes: type 6, 3 padding, length 11 (u32), é = 0xE9', cutBytes && [...cutBytes]);
mark = A.ws.sent.length;
fire(canvas, 'keydown', { key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true });
await sleep(120);
w = wire(A.ws, mark).filter((m) => m.t !== 'enc' && m.t !== 'req');
ok(same(w, [{ t: 'key', down: 1, sym: 0x56 }, { t: 'key', down: 0, sym: 0x56 }]), 'nothing to paste (no paste event): the V alone after 80 ms (Ctrl+Shift+V ⇒ V)', w);
mark = A.ws.sent.length;
const kc = fire(canvas, 'keydown', { key: 'c', code: 'KeyC', ctrlKey: true });
A.rfb.viewOnly = true;
const kw = fire(canvas, 'keydown', { key: 'v', code: 'KeyV', ctrlKey: true });
const pw = fire(canvas, 'paste', { clipboardData: { getData: () => 'secret' } });
await sleep(120);
A.rfb.viewOnly = false;
ok(!kc.propagationStopped && !kw.propagationStopped && !pw.defaultPrevented && wire(A.ws, mark).filter((m) => m.t === 'cut' || m.t === 'key').length === 0, 'Ctrl+C goes to noVNC as before; a watching (view-only) pane sends nothing and keeps its hands off the paste');

console.log('§3 the machine window\'s strip');
const md = read('src/lib/machine-desktop.js');
ok(/channel: true,\n    ladder: true,[^\n]*\n    pasteKeys: true,/.test(md) && /onQuality: \(\) => drawRung\(\),/.test(md), 'the machine window asks for the ladder and the paste chord');
ok(/c\.requestFullscreen\(\)/.test(md) && !/winInfo\.element \|\| c/.test(md) && /keyboardLockGate\(\{ secure: pageIsSecure\(\), api: hasLock\(\), fullscreen: document\.fullscreenElement === c, want: wantKeys \}\)/.test(md)
  && /if \(g\.lock && !locked\) \{ locked = true; navigator\.keyboard\.lock\(\)/.test(md) && /document\.removeEventListener\('fullscreenchange', onFull\)/.test(md),
  'full screen = the window\'s CONTENT; navigator.keyboard.lock() only through keyboardLockGate with the page\'s isSecureContext (pageIsSecure) and full screen; released on close');
ok(/if \(g\.why === 'insecure'\) \{ showToast\(t\('Capturing shortcuts needs VibeSpace opened at an https address — this page is http'\)/.test(md), 'on http the ⌨ press says the https words (no lock attempted)');
const zh = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, ja = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
const block = md.slice(md.indexOf('lane desktop-v2-latency (design q-030 §4): full screen'), md.indexOf('const view = createVncView(pane'));
const keys = [...new Set([...block.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]))];
const missing = keys.filter((k) => !zh[k] || !ja[k]);
ok(keys.length >= 15 && missing.length === 0, `every new strip word (${keys.length}) is in zh and ja`, missing);
ok(same(['Sharp', 'Balanced', 'Fluid', 'Lean', 'Slow link', 'Capture shortcuts'].map((k) => zh[k]), ['清晰', '均衡', '流畅', '省流', '慢链路', '捕获快捷键']), 'the zh words: 清晰 · 均衡 · 流畅 · 省流 · 慢链路 · 捕获快捷键');

console.log('§4 RED control');
const src = read('src/lib/vnc-view.js');
const FROM = 'rfb._compressionLevel = p.compressionLevel; rfb.qualityLevel = p.qualityLevel;';
if (src.split(FROM).length !== 2) ok(false, 'the control\'s anchor is in vnc-view.js once');
else {
  const MV = await import(mutantCopies('dv2l', REPO).write('src/lib/vnc-view.js', src.replace(FROM, 'rfb.compressionLevel = p.compressionLevel; rfb.qualityLevel = p.qualityLevel;'), 'public-setters', { esm: true }));
  HalfRFB.last = null;
  const B = await mount(MV);
  B.rfb.up();
  const m0 = B.ws.sent.length;
  B.rfb.sendKey(0x61, 'KeyA');
  await tick();
  const eb = encs(B.ws, m0);
  ok(eb.length === 2, `RED CONTROL: the compression written through noVNC's public setter ⇒ ${eb.length} SetEncodings for one rung change (the "exactly one" predicate above fails)`, eb);
  B.view.dispose();
}
A.view.dispose();
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
