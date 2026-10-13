#!/usr/bin/env node
// lane desktop-v2-latency HEAVY (design q-030 §4 + §6 P1): the quality ladder, the paste, the keyboard lock and the strip of a
// paired machine's window, end to end on this box — P0's harness (test-desktop-v2-chrome: the REAL agentd bundle as a
// Windows-shaped device, the real access layer + routes + the ONE picture bridge, the real machine-desktop.js / vnc-view.js
// with the BUILT public/novnc.js in headless Chrome, zh) with a stub RFB that behaves like a real server: an incremental
// request is HELD until the picture changes (`animate` = a 64×64 patch every 200 ms — the `?netem` bench is xpra-only, so the
// stub's own 200 ms stands in as P0 did), a non-incremental one is answered at once with its rect, writes can be paced to
// `kbps`; it records every SetEncodings (quality / compression), request, key and ClientCutText.
//   ① the window: the first rung (8 / 2) rides noVNC's FIRST SetEncodings; the strip [machine ▾][1 · 2 · 全部][⤢ 全屏]
//      [⌨ 捕获快捷键][已连接 · N ms · F fps][清晰]
//   ② typing ⇒ ONE SetEncodings 3 / 1 (流畅); still ≥ 500 ms ⇒ ONE SetEncodings 8 / 2 (清晰) + ONE non-incremental request
//      for the SHOWN display (2: 1280,0 1280×800)
//   ③ a moving picture (the stub's 200 ms updates) ⇒ ONE 3 / 1; it stops ⇒ ONE 8 / 2 + the refresh
//   ④ a slow link (the stub paced to 600 kbps): the strip says 慢链路 and the still rung is 均衡 (6 / 4); the comparison row
//      (the status chip) reads today's numbers and the recorded 42.0 → 0.70 ms                                   ladder.png
//   ⑤ Ctrl+V with "héllo VibeSpace" on this computer's clipboard ⇒ ClientCutText on the machine, THEN the v (Ctrl held)
//   ⑥ ⤢ 全屏 on a secure page (127.0.0.1): the window's content is full screen, navigator.keyboard.lock() (all keys) is
//      asked and holds; Esc reaches the machine as a key; ⌨ off ⇒ unlock, on ⇒ lock; leaving ⇒ unlock     fullscreen.png
//   ⑦ an http page (this box's LAN address — not a secure context): no navigator.keyboard; the ⌨ press says the https
//      words and nothing locks; full screen still works
//   ⑧ phone 390: the strip with the new parts stays ONE row                                                       phone.png
// PNGs when `--shots <dir>`.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const NOVNC = path.join(REPO, 'public/novnc.js');
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const f of [BUNDLE, NOVNC]) if (!fs.existsSync(f)) { ok(false, `${path.relative(REPO, f)} exists (npm run build first)`); process.exit(1); }

// ── the scratch device ──────────────────────────────────────────────────────────────────────────────────────────
const root = scratch('dv2l');
fs.mkdirSync(root, { recursive: true });
const realHome = process.env.HOME;
const started = [];
const rootOf = (h) => path.join(h, 'agentd-root');
let chrome = null, srv = null, vnc = null;
const cleanup = () => {
  for (const h of started) { try { process.kill(Number(fs.readFileSync(path.join(rootOf(h), 'state', 'agentd.pid'), 'utf8')), 'SIGKILL'); } catch { /* gone */ } }
  try { chrome && chrome.kill('SIGKILL'); } catch { /* gone */ }
  try { srv && srv.close(); } catch { /* gone */ }
  try { vnc && vnc.server.close(); } catch { /* gone */ }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
// the fixture "PowerShell": the display-facts script answered the way the real one prints (one JSON line, DeviceName ids)
const FACTS = { t: 'displays', origin: 'top-left', aware: 1, rows: [{ id: '\\\\.\\DISPLAY1', name: 'DELL P2419H', x: 0, y: 0, w: 1280, h: 800, scale: 1, primary: 1 }, { id: '\\\\.\\DISPLAY2', name: 'LG 27UL', x: 1280, y: 0, w: 1280, h: 800, scale: 1, primary: 0 }] };
const FAKE_PS = `#!${process.execPath}
const a = process.argv.slice(2); const s = Buffer.from(a[a.length - 1] || '', 'base64').toString('utf16le');
if (/AllScreens/.test(s)) { process.stdout.write(${JSON.stringify(JSON.stringify(FACTS))} + '\\r\\n'); process.exit(0); }
process.exit(1);
`;
const home = path.join(root, 'win');
fs.mkdirSync(path.join(home, '.local/bin'), { recursive: true });
fs.writeFileSync(path.join(home, '.local/bin/powershell.exe'), FAKE_PS); fs.chmodSync(path.join(home, '.local/bin/powershell.exe'), 0o755);
// the REAL bundle; its hello AND the display-facts op say win32
const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const HELLO = /(op: "hello-ack",[\s\S]{0,200}?)platform: process\.platform,/;
const FACTS_PLAT = /(readDisplayFacts\(\{\s*)platform: process\.platform,/;
ok(HELLO.test(bundleText) && FACTS_PLAT.test(bundleText) && /"display-facts"/.test(bundleText), 'the bundle carries the hello-ack platform, the display-facts op and its capability (the copy patches exactly those)');
fs.mkdirSync(path.join(root, 'bundle'), { recursive: true });
fs.writeFileSync(path.join(root, 'bundle', 'vibespace-agentd.js'), bundleText.replace(HELLO, (all, pre) => `${pre}platform: "win32",`).replace(FACTS_PLAT, (all, pre) => `${pre}platform: "win32",`));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
process.env.HOME = home; process.env.VIBESPACE_AGENTD_ROOT = rootOf(home);
const dataDir = path.join(home, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
started.push(home);
const dm = new DeviceManager({ dataDir, bundlePath: path.join(root, 'bundle', 'vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
try { await dm.connect(); } finally { process.env.HOME = realHome; delete process.env.VIBESPACE_AGENTD_ROOT; }
ok(dm.status().info.platform === 'win32' && dm.status().info.capabilities.includes('display-facts'), 'a real agent, Windows-shaped, says display-facts');

// ── the machine's VNC server: a stub RFB 3.8 with the VNC-password sign-in, 2560×800 = two 1280×800 screens ──────────
const FW = 2560, FH = 800, HALF = 1280;
const C1 = [176, 48, 48], M1 = [250, 250, 250], C2 = [40, 150, 70], M2 = [240, 130, 20];
const frame = (() => {
  const px = Buffer.alloc(FW * FH * 4);
  const fill = (x0, y0, w, h, [r, g, b]) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * FW + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; } };
  fill(0, 0, HALF, FH, C1); fill(600, 360, 80, 80, M1); fill(HALF, 0, HALF, FH, C2); fill(HALF + 600, 360, 80, 80, M2);
  return px;
})();
function stubVnc() {
  const seen = { sessions: 0, authed: 0, log: [] };
  const st = { delayMs: 200, animate: false, kbps: 0 };
  const conns = new Set();
  const u16 = (n) => Buffer.from([(n >> 8) & 255, n & 255]);
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
  const s32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
  const rect = (x, y, w, h, enc) => Buffer.concat([u16(x), u16(y), u16(w), u16(h), s32(enc)]);
  const SCREENS = Buffer.concat([Buffer.from([2, 0, 0, 0]), u32(1), u16(0), u16(0), u16(HALF), u16(FH), u32(0), u32(2), u16(HALF), u16(0), u16(HALF), u16(FH), u32(0)]);
  const region = (x, y, w, h) => { const b = Buffer.alloc(w * h * 4); for (let yy = 0; yy < h; yy++) frame.copy(b, yy * w * 4, ((y + yy) * FW + x) * 4, ((y + yy) * FW + x + w) * 4); return b; };
  // writes paced to st.kbps (0 = as fast as the socket takes them), in order
  const out = (c, buf) => {
    if (!st.kbps) { c.q = c.q.then(() => { if (!c.sock.destroyed) c.sock.write(buf); }); return; }
    c.q = c.q.then(async () => { for (let i = 0; i < buf.length && !c.sock.destroyed; i += 4096) { const part = buf.subarray(i, i + 4096); c.sock.write(part); await sleep(Math.round(part.length * 8 / st.kbps)); } });
  };
  const update = (c, rs) => out(c, Buffer.concat([Buffer.from([0, 0]), u16(rs.length), ...rs]));
  let flip = 0;
  const change = (c) => { const [w, h] = st.kbps ? [160, 150] : [64, 64]; flip ^= 1; update(c, [Buffer.concat([rect(HALF + 100, 100, w, h, 0), Buffer.alloc(w * h * 4, flip ? 200 : 90)])]); };
  // a request is WANTED until answered: a non-incremental one at once with its rect, an incremental one when the picture changes
  const serve = (c) => {
    if (!c.want || c.sock.destroyed) return;
    if (c.full) { const r = c.full; c.want = false; c.full = null; clearTimeout(c.timer); c.timer = null; const rs = []; if (c.ext && !c.screensSent) { c.screensSent = true; rs.push(Buffer.concat([rect(0, 0, FW, FH, -308), SCREENS])); } rs.push(Buffer.concat([rect(...r, 0), region(...r)])); update(c, rs); return; }
    if (st.animate && !c.timer) c.timer = setTimeout(() => { c.timer = null; if (c.sock.destroyed || !c.want || c.full) return; c.want = false; change(c); }, st.delayMs);
  };
  const server = net.createServer((sock) => {
    const c = { sock, stage: 0, buf: Buffer.alloc(0), ext: false, want: false, full: null, timer: null, q: Promise.resolve() };
    conns.add(c);
    sock.setNoDelay(true);
    sock.on('error', () => { }); sock.on('close', () => { clearTimeout(c.timer); conns.delete(c); });
    sock.write('RFB 003.008\n');
    sock.on('data', (d) => {
      c.buf = Buffer.concat([c.buf, d]);
      for (;;) {
        const b = c.buf;
        if (c.stage === 0) { if (b.length < 12) return; c.buf = b.subarray(12); c.stage = 1; sock.write(Buffer.from([1, 2])); continue; }
        if (c.stage === 1) { if (b.length < 1) return; c.buf = b.subarray(1); c.stage = 10; sock.write(crypto.randomBytes(16)); continue; }
        if (c.stage === 10) { if (b.length < 16) return; c.buf = b.subarray(16); c.stage = 2; seen.authed++; sock.write(Buffer.from([0, 0, 0, 0])); continue; }
        if (c.stage === 2) { if (b.length < 1) return; c.buf = b.subarray(1); c.stage = 3; seen.sessions++; const name = Buffer.from('WIN-DESK1'); sock.write(Buffer.concat([u16(FW), u16(FH), Buffer.from([32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 0, 8, 16, 0, 0, 0]), u32(name.length), name])); continue; }
        if (!b.length) return;
        const t = b[0];
        const need = t === 0 ? 20 : t === 2 ? (b.length >= 4 ? 4 + 4 * b.readUInt16BE(2) : 1e9) : t === 3 ? 10 : t === 4 ? 8 : t === 5 ? 6 : t === 6 ? (b.length >= 8 ? 8 + Math.abs(b.readInt32BE(4)) : 1e9) : t === 150 ? 10 : t === 251 ? (b.length >= 8 ? 8 + 16 * b[6] : 1e9) : 1;
        if (b.length < need) return;
        const at = Date.now();
        if (t === 2) { const e = []; for (let i = 0; i < b.readUInt16BE(2); i++) e.push(b.readInt32BE(4 + 4 * i)); if (e.includes(-308)) c.ext = true; seen.log.push({ t: 'enc', q: e.find((x) => x >= -32 && x <= -23) + 32, c: e.find((x) => x >= -256 && x <= -247) + 256, at }); }
        if (t === 3) { const r = [b.readUInt16BE(2), b.readUInt16BE(4), b.readUInt16BE(6), b.readUInt16BE(8)]; seen.log.push({ t: 'req', inc: b[1], rect: r.join(','), at }); c.want = true; if (!b[1]) c.full = r; serve(c); }
        if (t === 4) seen.log.push({ t: 'key', down: b[1], sym: b.readUInt32BE(4), at });
        if (t === 6) seen.log.push({ t: 'cut', text: b.subarray(8, need).toString('latin1'), at });
        c.buf = b.subarray(need);
      }
    });
  });
  const kick = () => { for (const c of conns) serve(c); };
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, seen, st, kick })));
}
vnc = await stubVnc();

// ── the hub: the real access layer + routes + the ONE picture bridge ───────────────────────────────────────────────
const quiet = { log() { }, warn() { } };
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const hosts = { list: () => [{ id: 'win-a', name: 'WIN-DESK1', transport: 'dial' }], linkState: () => 'online', connectedDevice: (id) => (id === 'win-a' ? dm : null), get: (id) => (id === 'win-a' ? { id, name: 'WIN-DESK1' } : null), isLocal: (id) => id === 'local', deviceBounded: async (id) => (id === 'win-a' ? dm : null) };
const access = ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000 });
const DS = require(path.join(REPO, 'src/server/desktop-stream.js'));
const bridge = DS.create({ auth: { requestAuthed: () => true }, log: quiet, pingMs: 5000, resolveTarget: (id) => access.machineDesktopTarget(id), forwardPort: (h, p) => access.forwardPort(h, p) });
const express = require(path.join(REPO, 'node_modules/express'));
const R = require(path.join(REPO, 'src/routes/desktop-apps.js'));
R.setup({ access, stream: bridge, vnc: { status: async () => ({ available: true, running: false }) } });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = `import { openDesktopPicker } from ${JSON.stringify(path.join(REPO, 'src/lib/desktop-picker.js'))};
import { showMachineDesktopDialog } from ${JSON.stringify(path.join(REPO, 'src/lib/machine-desktop.js'))};
let n = 0;
const wm = { windows: new Map(), revealWindow() {},
  createWindow({ title, type }) {
    const id = 'w' + (++n); const el = document.createElement('div'); el.className = 'vs-win'; el.dataset.type = type;
    el.style.cssText = window.__winCss; const bar = document.createElement('div'); bar.className = 'vs-win-title'; bar.textContent = title;
    bar.style.cssText = 'flex:0 0 auto;padding:6px 10px;font-size:13px;font-weight:600;border-bottom:1px solid var(--border)';
    const content = document.createElement('div'); content.style.cssText = 'flex:1 1 auto;min-height:0;position:relative;display:flex;flex-direction:column';
    el.append(bar, content); document.body.append(el);
    const w = { id, element: el, content, title, type }; wm.windows.set(id, w); return w; },
  closeWindow(id) { const w = wm.windows.get(id); if (!w) return; wm.windows.delete(id); w.onClose && w.onClose(); w.element.remove(); },
};
const app = { wm, _vncAvailable: true, _vncSeat: null, localOpened: 0, openDesktop() { app.localOpened++; }, _hideWelcome() {} };
window.__app = app;
window.__picker = (o) => openDesktopPicker(app, o || {});
window.__dialog = (m) => showMachineDesktopDialog(app, m, { recheck: async () => m });
window.__closeAll = () => { for (const id of [...wm.windows.keys()]) wm.closeWindow(id); };`;
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
const novncFile = NOVNC;
const IP = Object.values(os.networkInterfaces()).flat().find((x) => x && x.family === 'IPv4' && !x.internal)?.address || null;
const fromBox = (a) => { const v = String(a || '').replace(/^::ffff:/, ''); return v === '127.0.0.1' || (IP && v === IP); };
const app = express(); app.use((q, s, n) => (fromBox(q.socket.remoteAddress) ? n() : s.status(403).end())); app.use(express.json()); app.use(R.router);
const CSS = ['style', 'viewers', 'chat', 'fonts'].filter((n) => fs.existsSync(path.join(REPO, `public/${n}.css`)));
for (const n of CSS) app.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
app.get('/page.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page.js'))));
app.get('/novnc.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(novncFile)));
app.get('/', (q, s) => s.type('text/html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-root);height:100vh;overflow:hidden}</style></head><body><script src="/page.js"></script></body></html>`));
const PORT = await freePort();
srv = http.createServer(app);
const onUpgrade = (req, socket, head) => { if (!fromBox(socket.remoteAddress)) { socket.destroy(); return; } bridge.handleUpgrade(req, socket, head, bridge.upgradeId(new URL(req.url, 'http://x').pathname)); };
srv.on('upgrade', onUpgrade);
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
let srvIp = null;
if (IP) { srvIp = http.createServer(app); srvIp.on('upgrade', onUpgrade); await new Promise((r) => srvIp.listen(PORT, IP, r)); process.on('exit', () => { try { srvIp.close(); } catch { /* gone */ } }); }

// ── Chrome: a scratch profile, a private HOME / XDG_RUNTIME_DIR, no display (headless) ──────────────────────────────
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { stdio: 'ignore', env: cenv });
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h, winCss, origin = `http://127.0.0.1:${PORT}`) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); } catch {} window.__winCss = ${JSON.stringify(winCss)};` });
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true }); // a background target's first press would only focus the page
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  const until = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
  const load = async () => { await cdp('Page.navigate', { url: `${origin}/` }); await sleep(300); await until('typeof window.__picker === "function"', 10000); };
  await load();
  const mouse = async (type, x, y, buttons = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0); };
  const key = async (k, code, vk) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
  const shot = async (file, sel) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = sel ? await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`) : [0, 0, w, h];
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0] - 6), y: Math.max(0, r[1] - 6), width: Math.min(r[2] + 12, w), height: Math.min(r[3] + 12, h), scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  return { cdp, ev, until, click, key, shot, load, close: () => ws.close() };
}
const WIN = '.vs-win[data-type="machine-desktop"]';
// the canvas against the stub's known pattern (in the page): every pixel of a crop of display `which` (1 | 2), or of the whole fb
const PATTERN = (which) => `(() => { const cv = document.querySelector('${WIN} canvas'); if (!cv) return null; const W = cv.width, H = cv.height; const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
  const C = ${JSON.stringify({ C1, M1, C2, M2 })}; let bad = 0, other = 0;
  const want = (x, y) => { const s = ${which === 'all' ? 'x < 1280 ? 1 : 2' : which}; const lx = ${which === 'all' ? 'x % 1280' : 'x'}; const m = lx >= 600 && lx < 680 && y >= 360 && y < 440; return s === 1 ? (m ? C.M1 : C.C1) : (m ? C.M2 : C.C2); };
  const otherOf = (x, y) => { const s = ${which === 1 ? 2 : 1}; return s === 1 ? [C.C1, C.M1] : [C.C2, C.M2]; };
  const near = (i, c) => Math.abs(d[i] - c[0]) <= 6 && Math.abs(d[i + 1] - c[1]) <= 6 && Math.abs(d[i + 2] - c[2]) <= 6;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (x === 0 && y === 0) continue; if (!near(i, want(x, y))) { bad++; if (otherOf(x, y).some((c) => near(i, c))) other++; } }
  return { W, H, bad, other }; })()`;
const signIn = async (p) => { const asked = await p.until(`!!document.querySelector('#machine-desktop-signin input[type=password]')`, 15000); if (asked) await p.ev(`(() => { const f = document.querySelector('#machine-desktop-signin form'); f.querySelector('input[type=password]').value = 'pw'; f.requestSubmit(); })()`); return asked; };
const connected = (p) => p.until(`(() => { const s = document.querySelector('${WIN} .desktop-strip-status'); return !!s && /已连接/.test(s.textContent) && document.querySelectorAll('${WIN} .desktop-strip-seg').length === 3; })()`, 20000);
const seg = (p, label) => p.ev(`[...document.querySelectorAll('${WIN} .desktop-strip-seg')].find((b) => b.textContent === ${JSON.stringify(label)}).click()`);
const cropOk = async (p) => { await sleep(400); const r = await p.ev(PATTERN(2)); return { ok: !!r && r.W === 1280 && r.H === 800 && r.bad === 0, r }; };
const DESK = 'position:fixed;left:30px;top:70px;width:1100px;height:600px;display:flex;flex-direction:column;background:var(--bg-window);border:1px solid var(--border);box-shadow:0 6px 24px rgba(0,0,0,.25);border-radius:8px;overflow:hidden;z-index:5';

const strip = (p) => p.ev(`[...document.querySelector('${WIN} .desktop-strip').children].filter((e) => !e.hidden).map((e) => e.classList.contains('desktop-strip-displays') ? [...e.children].map((b) => b.textContent).join(' · ') : e.classList.contains('desktop-strip-status') ? e.textContent.replace(/\\d+|—/g, 'N') : e.textContent)`);
const rung = (p) => p.ev(`(() => { const r = document.querySelector('${WIN} .desktop-strip-rung'); return r && !r.hidden ? r.textContent : null; })()`);
const log = (from, t) => vnc.seen.log.slice(from).filter((m) => !t || m.t === t);
const ladderOf = (from) => log(from).filter((x) => x.t === 'enc' || (x.t === 'req' && x.inc === 0)).map((x) => (x.t === 'enc' ? `${x.q}/${x.c}` : `full:${x.rect}`));
const rectOf = (p, sel) => p.ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`);
const fullBtnAt = (p) => p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} .desktop-strip-btn')].find((x) => x.textContent === '⤢ 全屏').getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`);
const keysBtn = (p) => p.ev(`(() => { const b = document.querySelector('${WIN} .desktop-strip-keys'); return { pressed: b.getAttribute('aria-pressed'), locked: b.classList.contains('is-locked'), title: b.title }; })()`);
const ctrlV = async (p) => {
  await p.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
  await p.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 2 });
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 2 });
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 });
};
const open = async (p) => {
  await p.ev('window.__picker()');
  await p.until(`!!document.querySelector('.desktop-picker-row[data-group="remote"]')`, 15000);
  await p.ev(`document.querySelector('.desktop-picker-row[data-group="remote"]').click()`);
  const asked = await signIn(p);
  return asked && await connected(p);
};
// the browser target (clipboard permission for the paste leg)
const ver = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((r) => bws.on('open', r));
let bseq = 0; const bpend = new Map();
bws.on('message', (d) => { const m = JSON.parse(d); if (m.id && bpend.has(m.id)) { bpend.get(m.id)(m); bpend.delete(m.id); } });
const bcdp = (method, params = {}) => new Promise((r) => { const id = ++bseq; bpend.set(id, r); bws.send(JSON.stringify({ id, method, params })); });

console.log('① – ⑥ desk 1280 px (127.0.0.1 — a secure context)');
{
  const p = await page(1280, 800, DESK);
  // the keyboard lock, spied (the real one still runs)
  await p.ev(`(() => { const k = navigator.keyboard; if (!k) return; window.__locks = []; const L = k.lock.bind(k), U = k.unlock.bind(k); k.lock = (...a) => { window.__locks.push('lock:' + a.length); return L(...a).then((v) => { window.__locks.push('held'); return v; }, (e) => { window.__locks.push('refused:' + e.name); throw e; }); }; k.unlock = () => { window.__locks.push('unlock'); return U(); }; })()`);
  const up = await open(p);
  await sleep(700);
  const e0 = log(0, 'enc');
  ok(up && e0.length === 1 && e0[0].q === 8 && e0[0].c === 2, '① the first rung (8 / 2) rides noVNC\'s FIRST SetEncodings — nothing extra on connect', vnc.seen.log.slice(0, 6));
  const s1 = await strip(p);
  ok(JSON.stringify(s1) === JSON.stringify(['WIN-DESK1 ▾', '1 · 2 · 全部', '⤢ 全屏', '⌨ 捕获快捷键', '已连接 · N ms · N fps', '清晰']), '① the strip: [WIN-DESK1 ▾][1 · 2 · 全部][⤢ 全屏][⌨ 捕获快捷键][已连接 · N ms · F fps][清晰]', s1);

  await seg(p, '2');
  await sleep(300);
  let m = vnc.seen.log.length;
  const [cx, cy] = await rectOf(p, `${WIN} canvas`);
  await p.click(cx, cy); // a press is input — and the picture has the keyboard now
  for (const k of 'hello') { await p.key(k, 'Key' + k.toUpperCase(), k.toUpperCase().charCodeAt(0)); await sleep(40); }
  await sleep(120);
  const typed = ladderOf(m), r2 = await rung(p);
  ok(JSON.stringify(typed) === '["3/1"]' && r2 === '流畅' && log(m, 'key').length === 10, '② a press + five keys ⇒ ONE SetEncodings 3 / 1 (流畅); the ten key events once each', { typed, r2, keys: log(m, 'key').length });
  await sleep(800);
  const still = ladderOf(m), r2b = await rung(p);
  ok(JSON.stringify(still) === '["3/1","8/2","full:1280,0,1280,800"]' && r2b === '清晰', '② still ≥ 500 ms ⇒ ONE 8 / 2 (清晰) + ONE non-incremental request for the SHOWN display (2: 1280,0 1280×800)', { still, r2b });

  m = vnc.seen.log.length;
  vnc.st.animate = true; vnc.kick();
  await sleep(1500);
  const mv = ladderOf(m), r3 = await rung(p), ups = log(m, 'req').filter((x) => x.inc === 1).length;
  vnc.st.animate = false;
  await sleep(1000);
  const st3 = ladderOf(m), r3b = await rung(p);
  ok(JSON.stringify(mv) === '["3/1"]' && r3 === '流畅' && ups >= 5, `③ a moving picture (the stub's 200 ms updates: ${ups} in 1.5 s) ⇒ ONE 3 / 1 (流畅)`, { mv, r3, ups });
  ok(JSON.stringify(st3) === '["3/1","8/2","full:1280,0,1280,800"]' && r3b === '清晰', '③ it stops ⇒ ONE 8 / 2 (清晰) + ONE refresh of display 2', { st3, r3b });

  m = vnc.seen.log.length;
  vnc.st.kbps = 600; vnc.st.animate = true; vnc.kick();
  const slowSeen = await p.until(`(() => { const s = document.querySelector('${WIN} .desktop-strip-slow'); return !!s && !s.hidden; })()`, 15000);
  vnc.st.animate = false;
  await sleep(2000);
  const e4 = ladderOf(m), r4 = await rung(p), slowTitle = await p.ev(`document.querySelector('${WIN} .desktop-strip-slow').title`);
  ok(slowSeen && r4 === '均衡' && e4[e4.length - 1] === '6/4' && /实测 \d+ kbps —— 低于 2000 kbps/.test(slowTitle), '④ a slow link (the stub paced to 600 kbps) ⇒ 慢链路 (its title says the measure) and the still rung 均衡 6 / 4', { e4, r4, slowTitle });
  await p.ev(`document.querySelector('${WIN} .desktop-strip-status').click()`);
  await sleep(1200);
  const cmp = await p.ev(`[...document.querySelectorAll('${WIN} .desktop-strip-compare > div')].map((d) => d.textContent)`);
  ok(cmp.length === 2 && /^本次：浏览器 ⇄ hub \d+ ms · hub ⇄ 机器 \d+ ms · 更新往返 (\d+|—) ms · \d+ fps · \d+ kbps$/.test(cmp[0]) && /42\.0 ms.*0\.70 ms/.test(cmp[1]), '④ the status chip opens the comparison row: today\'s numbers · the recorded reference 42.0 → 0.70 ms', cmp);
  await p.shot('ladder.png', WIN);
  vnc.st.kbps = 0;
  await p.ev(`document.querySelector('${WIN} .desktop-strip-status').click()`);

  await bcdp('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: `http://127.0.0.1:${PORT}` });
  const wrote = await p.ev(`navigator.clipboard.writeText('héllo VibeSpace').then(() => 'ok', (e) => 'err ' + e.message)`);
  await p.click(cx, cy); await sleep(300);
  m = vnc.seen.log.length;
  await ctrlV(p);
  await sleep(400);
  const pl = log(m).filter((x) => x.t === 'cut' || x.t === 'key').map((x) => (x.t === 'cut' ? 'cut:' + x.text : `key:${x.down ? 'd' : 'u'}:${x.sym.toString(16)}`));
  ok(wrote === 'ok' && JSON.stringify(pl) === JSON.stringify(['key:d:ffe3', 'cut:héllo VibeSpace', 'key:d:76', 'key:u:76', 'key:u:ffe3']), '⑤ Ctrl+V ⇒ the machine gets Ctrl down, ClientCutText "héllo VibeSpace", THEN v down / up, Ctrl up — once each', { wrote, pl });

  await p.click(...(await fullBtnAt(p)));
  const full = await p.until(`document.fullscreenElement === document.querySelector('${WIN} .desktop-machine-content')`, 5000);
  await sleep(400);
  const l1 = await p.ev('window.__locks'), kb = await keysBtn(p);
  ok(full && JSON.stringify(l1) === '["lock:0","held"]' && kb.pressed === 'true' && kb.locked && /按住 Esc 2 秒退出全屏/.test(kb.title), '⑥ ⤢ 全屏: the window\'s CONTENT is full screen; navigator.keyboard.lock() (all keys) asked once and held; ⌨ says what it captures and "hold Esc 2 s"', { full, l1, kb });
  await p.shot('fullscreen.png');
  m = vnc.seen.log.length;
  await p.key('Escape', 'Escape', 27);
  await sleep(300);
  const esc = log(m, 'key').map((x) => `${x.down ? 'd' : 'u'}:${x.sym.toString(16)}`);
  ok(JSON.stringify(esc) === '["d:ff1b","u:ff1b"]' && await p.ev('!!document.fullscreenElement'), '⑥ Esc reaches the machine as a key (ff1b down / up) and the page stays full screen', esc);
  await p.ev(`document.querySelector('${WIN} .desktop-strip-keys').click()`); await sleep(200);
  const off = await keysBtn(p);
  await p.ev(`document.querySelector('${WIN} .desktop-strip-keys').click()`); await sleep(300);
  const l2 = (await p.ev('window.__locks')).slice(2);
  ok(JSON.stringify(l2) === '["unlock","lock:0","held"]' && off.pressed === 'false' && /快捷键留在这台电脑上/.test(off.title), '⑥ ⌨ off ⇒ unlock (its title says the shortcuts stay here); on ⇒ lock again', { l2, off });
  await p.click(...(await fullBtnAt(p)));
  const left = await p.until('!document.fullscreenElement', 5000);
  await sleep(200);
  const l3 = (await p.ev('window.__locks')).slice(5);
  ok(left && JSON.stringify(l3) === '["unlock"]', '⑥ leaving full screen ⇒ unlock', { left, l3 });
  p.close();
}
console.log('⑦ an http page (this box\'s LAN address — not a secure context)');
if (!IP) console.log('  SKIP (LOUD): no non-loopback IPv4 on this box — the insecure leg needs one');
else {
  const p = await page(1280, 800, DESK, `http://${IP}:${PORT}`);
  const ctx = await p.ev('({ secure: window.isSecureContext, kbd: typeof navigator.keyboard })');
  const up = await open(p);
  const kb = await keysBtn(p);
  await p.ev(`document.querySelector('${WIN} .desktop-strip-keys').click()`);
  await sleep(300);
  const said = await p.ev(`document.body.innerText.includes('捕获快捷键要在 https 地址打开 VibeSpace —— 这一页是 http')`);
  ok(up && ctx.secure === false && ctx.kbd === 'undefined' && kb.pressed === 'false' && /https/.test(kb.title) && said && (await keysBtn(p)).pressed === 'false', `⑦ http://${IP}: not a secure context, no navigator.keyboard; ⌨ reads off, its press says the https words, nothing locks`, { up, ctx, kb, said });
  await p.click(...(await fullBtnAt(p)));
  const full = await p.until(`document.fullscreenElement === document.querySelector('${WIN} .desktop-machine-content')`, 5000);
  ok(full, '⑦ full screen still works on http (without the lock)');
  p.close();
}
console.log('⑧ phone 390');
{
  const p = await page(390, 844, 'position:fixed;left:0;top:0;width:390px;height:844px;display:flex;flex-direction:column;background:var(--bg-window);overflow:hidden;z-index:5');
  await p.ev('window.__picker()');
  await p.until(`!!document.querySelector('.desktop-picker-row[data-group="remote"]')`, 15000);
  await p.ev(`document.querySelector('.desktop-picker-row[data-group="remote"]').click()`);
  await signIn(p);
  await connected(p);
  await sleep(600);
  const row = await p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-strip'); const kids = [...s.children].filter((e) => !e.hidden).map((e) => e.getBoundingClientRect()); return { n: kids.length, h: Math.round(s.getBoundingClientRect().height), oneRow: Math.max(...kids.map((r) => r.top)) < Math.min(...kids.map((r) => r.bottom)), scrolls: s.scrollWidth > s.clientWidth }; })()`);
  ok(row.n === 6 && row.oneRow && row.h <= 34, '⑧ the phone\'s strip with ⌨ and the rung is still ONE row (it scrolls sideways)', row);
  await p.shot('phone.png');
  p.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
