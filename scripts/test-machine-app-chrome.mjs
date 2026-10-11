#!/usr/bin/env node
// lane machine-app-crop HEAVY (owner 2026-10-11 "都做吧" — route ② of B-bb0b): ONE app of a paired Windows machine as its
// own window, end to end on this box. The REAL agentd bundle runs as a Windows-shaped "device" (its hello and its window
// ops say win32; a fixture powershell.exe on its PATH answers the run's launch report, the window look and the pin the way
// the real scripts print them — the app's rectangle read from a state file this suite moves), plus an OLD agent (its
// hello-ack lacks the two capabilities). A stub RFB server stands in for the machine's TightVNC: 1280×800, a desktop with a
// green window and the "app" painted at the state's rectangle; it records every PointerEvent. The hub half is the real
// access layer + routes + the ONE picture bridge; the dialog + the window are the real src/lib/machine-desktop.js /
// machine-app.js in headless Chrome (zh), desk 1100 px and phone 390 px:
//   ① "Run as its own window…" is the default for `start "" blender`; the run → the launch report → the app's window found
//   ② the pane shows the CROP (the green window never shows) and pins the app on top; a click at the pane's centre arrives
//      at the app's centre on the machine; a click in the letterbox sends nothing; a drag out of the crop is held at its edge
//   ③ the app moves: the crop follows; the next click lands at the new centre    ④ the app closes: the words + the two buttons
//   ⑤ Run again → a new window; closing it ends the watch and UNPINS the app     ⑥ the phone: the crop fits 390 px
//   ⑦ an old agent: "update the agent" at once, the device never asked
// PNGs (when `--shots <dir>`): desk.png, phone.png, gone.png.
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
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

// ── the scratch devices ──────────────────────────────────────────────────────────────────────────────────────────
const root = scratch('mapp');
fs.mkdirSync(root, { recursive: true });
const realHome = process.env.HOME;
const homes = {}, started = [];
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
const STATE = path.join(root, 'app-state.json'), PINS = path.join(root, 'pins.log'), RUNS = path.join(root, 'runs.log');
const setApp = (rect, title = 'Blender 4.2') => fs.writeFileSync(STATE, JSON.stringify({ rect, title }));
setApp([300, 200, 800, 500]);
fs.writeFileSync(PINS, '');
// the fixture "PowerShell": reads the encoded script and answers as the real one prints on Windows (one dump per round)
const FAKE_PS = `#!${process.execPath}
const fs = require('fs');
const a = process.argv.slice(2); const s = Buffer.from(a[a.length - 1] || '', 'base64').toString('utf16le');
const st = () => { try { return JSON.parse(fs.readFileSync(${JSON.stringify(STATE)}, 'utf8')); } catch { return { rect: null }; } };
const out = (l) => process.stdout.write(l + '\\r\\n');
if (/Start-Process/.test(s)) { fs.appendFileSync(${JSON.stringify(RUNS)}, (/-PassThru/.test(s) ? 'window ' : 'plain ') + Date.now() + '\\n'); if (/-PassThru/.test(s)) out('vibespace-launched 9000 ' + Date.now()); process.exit(0); }
if (/\\$h = \\[IntPtr\\]/.test(s)) { const h = /\\$h = \\[IntPtr\\]\\[Int64\\](\\d+)/.exec(s)[1]; fs.appendFileSync(${JSON.stringify(PINS)}, (/\\[IntPtr\\]\\(-1\\)/.test(s) ? 'on ' : 'off ') + h + '\\n'); out('ok'); process.exit(0); }
const target = Number((/\\$target = \\[IntPtr\\]\\[Int64\\](\\d+)/.exec(s) || [])[1] || 0);
const poll = Number((/Start-Sleep -Milliseconds (\\d+)/.exec(s) || [])[1] || 250);
const deadline = Number((/-gt (\\d+)\\) \\{ exit 0 \\}/.exec(s) || [])[1] || 0);
const t0 = Date.now(); let round = 0;
const win = (r, t) => JSON.stringify({ t: 'win', hwnd: 131330, pid: 9012, title: t, vis: 1, min: 0, wr: [r[0] - 7, r[1], r[0] + r[2] + 7, r[1] + r[3] + 7], fb: [r[0], r[1], r[0] + r[2], r[1] + r[3]] });
const tick = () => {
  const { rect, title } = st();
  out(JSON.stringify({ t: 'screen', x: 0, y: 0, w: 1280, h: 800, dpi: 96, aware: 1 }));
  if (target) out(rect ? win(rect, title) : JSON.stringify({ t: 'win', hwnd: target, gone: 1 }));
  else {
    out(JSON.stringify({ t: 'win', hwnd: 65802, pid: 7420, title: 'Program Manager', vis: 1, min: 0, wr: [0, 0, 1280, 800], fb: null }));
    out(JSON.stringify({ t: 'win', hwnd: 66000, pid: 7420, title: 'Downloads', vis: 1, min: 0, wr: [0, 0, 250, 180], fb: [0, 0, 250, 180] }));
    if (round > 0 && rect) out(win(rect, title)); // the app draws its window a moment after the run
    for (const p of ['p 7420 1 1', 'p 9000 7420 ' + (t0 - 400), 'p 9012 9000 ' + (t0 - 300)]) out(p);
  }
  out('end ' + Date.now()); round++;
  if (deadline && Date.now() - t0 > deadline) process.exit(0);
  setTimeout(tick, poll);
};
tick();
`;
function mkHome(name) { const h = path.join(root, name); fs.mkdirSync(path.join(h, '.local/bin'), { recursive: true }); fs.writeFileSync(path.join(h, '.local/bin/powershell.exe'), FAKE_PS); fs.chmodSync(path.join(h, '.local/bin/powershell.exe'), 0o755); homes[name] = h; return h; }
mkHome('win'); mkHome('old');

// the REAL bundle; its hello AND the window ops say win32 (the op's own platform), the old one lacks the two capabilities
const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const HELLO = /(op: "hello-ack",[\s\S]{0,200}?)platform: process\.platform,/;
const OPPLAT = /platform: process\.platform,(\s+)(params: msg|hwnd: a\.hwnd|hwnd: rec\.last\.hwnd)/g; // esbuild may break the object over lines
const CAP_LIST = /capabilities: \[([^\]]*)\]/;
const opHits = bundleText.match(OPPLAT) || [];
ok(HELLO.test(bundleText) && opHits.length === 3 && /"window-track", "window-pin"/.test((CAP_LIST.exec(bundleText) || [])[1] || ''), 'the bundle carries the hello-ack platform, the 3 window-op platform reads and the two capabilities (the copies patch exactly those)', opHits);
const asWin = bundleText.replace(HELLO, (all, pre) => `${pre}platform: "win32",`).replace(OPPLAT, (all, ws, rest) => `platform: "win32",${ws}${rest}`);
const dropCaps = (txt) => txt.replace(CAP_LIST, (all, inner) => `capabilities: [${inner.split(',').map((x) => x.trim()).filter((x) => x && x !== '"window-track"' && x !== '"window-pin"').join(', ')}]`);
for (const [n, txt] of Object.entries({ win: asWin, old: dropCaps(asWin) })) { fs.mkdirSync(path.join(root, 'bundle-' + n), { recursive: true }); fs.writeFileSync(path.join(root, 'bundle-' + n, 'vibespace-agentd.js'), txt); }
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
async function deviceOn(name) {
  const h = homes[name];
  process.env.HOME = h; process.env.VIBESPACE_AGENTD_ROOT = rootOf(h);
  const dataDir = path.join(h, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
  started.push(h);
  const dm = new DeviceManager({ dataDir, bundlePath: path.join(root, 'bundle-' + name, 'vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  try { await dm.connect(); } finally { process.env.HOME = realHome; delete process.env.VIBESPACE_AGENTD_ROOT; }
  return dm;
}
const dms = { 'win-a': await deviceOn('win'), 'win-old': await deviceOn('old') };
const info = (id) => dms[id].status().info || {};
ok(info('win-a').platform === 'win32' && info('win-a').capabilities.includes('window-track') && info('win-a').capabilities.includes('window-pin') && !info('win-old').capabilities.includes('window-track'), 'two real agents: a Windows-shaped one with window-track + window-pin, an old one without');

// ── the machine's VNC server: a stub RFB 3.8 (no sign-in), 1280×800, the app painted at the state's rectangle ───────────
const FW = 1280, FH = 800;
function paint() {
  const { rect } = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const px = Buffer.alloc(FW * FH * 4);
  const fill = (x0, y0, w, h, [r, g, b]) => { for (let y = Math.max(0, y0); y < Math.min(FH, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(FW, x0 + w); x++) { const i = (y * FW + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; } };
  fill(0, 0, FW, FH, [32, 84, 140]); // the desktop
  fill(0, 0, 250, 180, [40, 170, 70]); // another window (green) — never in the crop
  if (rect) {
    const [x, y, w, h] = rect;
    fill(x, y, w, h, [236, 236, 236]); fill(x, y, w, 30, [52, 52, 64]); // the app: its title bar + body
    fill(x + w / 2 - 40, y + h / 2 - 40, 80, 80, [240, 130, 20]); // an orange mark at its centre
    for (let gx = x + 20; gx < x + w; gx += 40) fill(gx, y + 30, 1, h - 30, [200, 200, 210]);
  }
  return px;
}
function stubVnc() {
  const seen = { pointers: [], keys: 0, conns: 0 };
  const clients = new Set();
  let frame = paint();
  const u16 = (n) => Buffer.from([(n >> 8) & 255, n & 255]);
  const sendFrame = (c) => {
    c.pending = false; c.dirty = false;
    const hdr = Buffer.concat([Buffer.from([0, 0]), u16(1), u16(0), u16(0), u16(FW), u16(FH), Buffer.from([0, 0, 0, 0])]);
    c.sock.write(Buffer.concat([hdr, frame]));
  };
  const server = net.createServer((sock) => {
    seen.conns++;
    const c = { sock, stage: 0, buf: Buffer.alloc(0), pending: false, dirty: true };
    clients.add(c);
    sock.on('error', () => { }); sock.on('close', () => clients.delete(c));
    sock.write('RFB 003.008\n');
    sock.on('data', (d) => {
      c.buf = Buffer.concat([c.buf, d]);
      for (;;) {
        const b = c.buf;
        if (c.stage === 0) { if (b.length < 12) return; c.buf = b.subarray(12); c.stage = 1; sock.write(Buffer.from([1, 1])); continue; }
        if (c.stage === 1) { if (b.length < 1) return; c.buf = b.subarray(1); c.stage = 2; sock.write(Buffer.from([0, 0, 0, 0])); continue; }
        if (c.stage === 2) { if (b.length < 1) return; c.buf = b.subarray(1); c.stage = 3; const name = Buffer.from('WIN-DESK1'); sock.write(Buffer.concat([u16(FW), u16(FH), Buffer.from([32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 0, 8, 16, 0, 0, 0]), Buffer.from([0, 0, 0, name.length]), name])); continue; }
        if (!b.length) return;
        const t = b[0];
        const need = t === 0 ? 20 : t === 2 ? (b.length >= 4 ? 4 + 4 * b.readUInt16BE(2) : 1e9) : t === 3 ? 10 : t === 4 ? 8 : t === 5 ? 6 : t === 6 ? (b.length >= 8 ? 8 + b.readUInt32BE(4) : 1e9) : 1;
        if (b.length < need) return;
        if (t === 5) seen.pointers.push({ mask: b[1], x: b.readUInt16BE(2), y: b.readUInt16BE(4), at: Date.now() });
        if (t === 4) seen.keys++;
        if (t === 3) { if (c.dirty || !b[1]) sendFrame(c); else c.pending = true; }
        c.buf = b.subarray(need);
      }
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, seen, repaint: () => { frame = paint(); for (const c of clients) { c.dirty = true; if (c.pending) sendFrame(c); } } })));
}
vnc = await stubVnc();

// ── the hub: the real access layer + routes + the ONE picture bridge ───────────────────────────────────────────────
const quiet = { log() { }, warn() { } };
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const LABELS = { 'win-a': 'WIN-DESK1', 'win-old': 'OLD-PC' };
const hosts = { get: (id) => (dms[id] ? { id, name: LABELS[id] } : null), isLocal: (id) => id === 'local', deviceBounded: async (id) => dms[id] };
const access = ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000 });
const DS = require(path.join(REPO, 'src/server/desktop-stream.js'));
const bridge = DS.create({ auth: { requestAuthed: () => true }, log: quiet, pingMs: 5000, resolveTarget: (id) => access.machineDesktopTarget(id), forwardPort: (h, p) => access.forwardPort(h, p) });
const express = require(path.join(REPO, 'node_modules/express'));
const R = require(path.join(REPO, 'src/routes/desktop-apps.js'));
R.setup({ access, stream: bridge, vnc: {} });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
// a minimal window manager: each window a framed box (title bar + content), the real page code inside
const entry = `import { showMachineDesktopDialog } from ${JSON.stringify(path.join(REPO, 'src/lib/machine-desktop.js'))};
let n = 0;
const wm = { windows: new Map(), revealWindow() {},
  createWindow({ title, type }) {
    const id = 'w' + (++n); const el = document.createElement('div'); el.className = 'vs-win'; el.dataset.type = type;
    el.style.cssText = window.__winCss; const bar = document.createElement('div'); bar.className = 'vs-win-title'; bar.textContent = title;
    bar.style.cssText = 'flex:0 0 auto;padding:6px 10px;font-size:13px;font-weight:600;border-bottom:1px solid var(--border)';
    const content = document.createElement('div'); content.style.cssText = 'flex:1 1 auto;min-height:0;position:relative;display:flex;flex-direction:column';
    el.append(bar, content); document.body.append(el);
    const w = { id, element: el, content, title, type, titleSpan: bar }; wm.windows.set(id, w); return w; },
  setTitle(id, t) { const w = wm.windows.get(id); if (w) { w.title = t; w.titleSpan.textContent = t; } },
  closeWindow(id) { const w = wm.windows.get(id); if (!w) return; wm.windows.delete(id); w.onClose && w.onClose(); w.element.remove(); },
};
window.__wm = wm;
window.__open = (m) => { document.getElementById('machine-desktop-dialog')?.remove(); showMachineDesktopDialog({ wm }, m, { recheck: async () => m }); };`;
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
const app = express(); app.use(express.json()); app.use(R.router);
const CSS = ['xterm', 'style', 'viewers', 'chat', 'fonts'].filter((n) => fs.existsSync(path.join(REPO, `public/${n}.css`)));
for (const n of CSS) app.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
app.get('/page.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page.js'))));
app.get('/novnc.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(NOVNC)));
app.get('/', (q, s) => s.type('text/html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-root);height:100vh;overflow:hidden}</style></head><body><script src="/page.js"></script></body></html>`));
const PORT = await freePort();
srv = http.createServer(app);
srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head, bridge.upgradeId(new URL(req.url, 'http://x').pathname)));
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

// ── Chrome: a scratch profile, a private HOME / XDG_RUNTIME_DIR, no display (headless) ──────────────────────────────
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { stdio: 'ignore', env: cenv });
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h, winCss) {
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
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  for (let i = 0; i < 100 && !(await ev('typeof window.__open === "function"').catch(() => false)); i++) await sleep(100);
  const until = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
  const mouse = async (type, x, y, buttons = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0); };
  const shot = async (file, sel = '.vs-win') => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].pop().getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0] - 8), y: Math.max(0, r[1] - 8), width: Math.min(r[2] + 16, w), height: Math.min(r[3] + 16, h), scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  return { cdp, ev, until, mouse, click, shot, close: () => ws.close() };
}
const ROW = (id, label) => JSON.stringify({ hostId: id, label, code: 'desktop_ready', auth: 'none', setup: 'win32', desktop: 'vnc-native', selectable: true });
const GEO = `(() => { const w = [...document.querySelectorAll('.vs-win[data-type="machine-app"]')].pop(); if (!w) return null; const pane = w.querySelector('.machine-app-pane'), box = w.querySelector('.machine-app-box'), st = w.querySelector('.machine-app-stage'), cv = st && st.querySelector('canvas'); const p = pane.getBoundingClientRect(), b = box.getBoundingClientRect(); return { shown: box.style.display !== 'none', pane: [p.left, p.top, p.width, p.height], box: [b.left, b.top, b.width, b.height], stage: [parseFloat(st.style.left), parseFloat(st.style.top), parseFloat(st.style.width)], fb: cv ? [cv.width, cv.height] : null, title: w.querySelector('.vs-win-title').textContent, say: w.querySelector('.machine-app-say').style.display === 'none' ? '' : w.querySelector('.machine-app-say').textContent, share: w.querySelector('.machine-app-share').style.display === 'none' ? '' : w.querySelector('.machine-app-share').textContent }; })()`;
const pins = () => fs.readFileSync(PINS, 'utf8').trim().split('\n').filter(Boolean);
const pointerAfter = async (n, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const p = vnc.seen.pointers.slice(n); if (p.some((e) => e.mask & 1)) return p; await sleep(50); } return vnc.seen.pointers.slice(n); };
const near = (e, x, y) => e && Math.abs(e.x - x) <= 1 && Math.abs(e.y - y) <= 1;
async function runAsWindow(p) {
  await p.ev(`window.__open(${ROW('win-a', 'WIN-DESK1')})`);
  await p.ev(`(() => { const i = document.querySelector('.machine-desktop-cmd'); i.value = 'start "" blender'; i.dispatchEvent(new Event('input')); })()`);
  const cls = await p.ev(`[...document.querySelectorAll('#machine-desktop-dialog button')].filter((b) => /独立窗口运行|^运行…$/.test(b.textContent)).map((b) => b.textContent + '=' + b.className)`);
  await p.ev(`[...document.querySelectorAll('#machine-desktop-dialog button')].find((b) => /独立窗口运行/.test(b.textContent)).click()`);
  await p.until(`!!document.querySelector('#machine-desktop-confirm .btn-create')`, 5000);
  await p.ev(`document.querySelector('#machine-desktop-confirm .btn-create').click()`);
  return cls;
}
const appWins = `document.querySelectorAll('.vs-win[data-type="machine-app"]').length`;

console.log('① – ⑤ desk 1100 px');
{
  const p = await page(1100, 800, 'position:fixed;left:40px;top:30px;width:900px;height:620px;display:flex;flex-direction:column;background:var(--bg-primary);border:1px solid var(--border);box-shadow:0 6px 24px rgba(0,0,0,.25);border-radius:8px;overflow:hidden;z-index:5');
  const cls = await runAsWindow(p);
  ok(cls.join(' | ') === '作为独立窗口运行…=btn-create | 运行…=file-tool-btn', '① `start "" blender` names a GUI app: "Run as its own window…" is the default (the filled button)', cls);
  ok(await p.until(`(() => { const g = ${GEO}; return g && g.shown && g.fb && g.fb[0] === ${FW}; })()`), '① the run → the launch report → the app\'s window found → the picture cropped to it');
  const runs = fs.readFileSync(RUNS, 'utf8');
  ok(/^window \d+$/m.test(runs) && !/^plain/m.test(runs), 'the machine ran the reporting plan (Start-Process -PassThru)', runs);
  let g = await p.ev(GEO);
  const s = g.box[2] / 800;
  ok(Math.abs(g.box[2] / g.box[3] - 1.6) < 0.01 && g.box[2] <= g.pane[2] + 0.5 && g.box[3] <= g.pane[3] + 0.5 && (Math.abs(g.box[2] - g.pane[2]) < 1 || Math.abs(g.box[3] - g.pane[3]) < 1), `② the crop is the app's 800×500 fitted into the pane (${g.box[2].toFixed(1)}×${g.box[3].toFixed(1)} in ${g.pane[2]}×${g.pane[3]})`, g);
  ok(Math.abs(g.stage[0] + 300 * s) < 0.6 && Math.abs(g.stage[1] + 200 * s) < 0.6 && Math.abs(g.stage[2] - FW * s) < 0.6, '② the whole picture is laid out shifted by the app\'s origin (only the app shows)', g);
  ok(g.title === 'WIN-DESK1上的Blender 4.2' && /只显示WIN-DESK1上的这个应用/.test(await p.ev(`document.querySelector('.vs-win[data-type="machine-app"]').textContent`)), '② the title = the app\'s window title; the pane says what it shows (zh)', g.title);
  ok(await p.until(`true`) && pins().join() === 'on 131330', '② the app is pinned on top of the machine\'s other windows (HWND_TOPMOST)', pins());
  await sleep(600);
  await p.shot('desk.png');
  await p.click(5, 5); // the page's own first press (outside the window)
  g = await p.ev(GEO);
  let n = vnc.seen.pointers.length;
  await p.click(g.box[0] + g.box[2] / 2, g.box[1] + g.box[3] / 2);
  let got = await pointerAfter(n);
  ok(near(got.find((e) => e.mask & 1), 700, 450), `② a click at the pane's centre arrives at the app's centre on the machine (700, 450) — got ${JSON.stringify(got.find((e) => e.mask & 1))}`, got);
  if (g.box[0] - g.pane[0] > 6) {
    n = vnc.seen.pointers.length;
    await p.click(g.pane[0] + 3, g.pane[1] + g.pane[3] / 2);
    await sleep(400);
    ok(vnc.seen.pointers.length === n, '② a click in the letterbox beside the crop sends nothing to the machine', vnc.seen.pointers.slice(n));
  }
  n = vnc.seen.pointers.length;
  const cx = g.box[0] + g.box[2] / 2, cy = g.box[1] + g.box[3] / 2;
  await p.mouse('mouseMoved', cx, cy); await p.mouse('mousePressed', cx, cy, 1);
  for (const dx of [100, 250, 400, 520]) { await p.mouse('mouseMoved', cx + dx, cy, 1); await sleep(30); }
  await p.mouse('mouseReleased', cx + 520, cy, 0); await sleep(400);
  const drag = vnc.seen.pointers.slice(n);
  ok(drag.length >= 3 && Math.max(...drag.map((e) => e.x)) <= 300 + 800 - 1 && Math.max(...drag.map((e) => e.x)) >= 300 + 800 - 3 && drag.some((e) => !(e.mask & 1)), `② a drag out of the crop is held at the app's right edge (max x ${Math.max(...drag.map((e) => e.x))} ≤ 1099; the release arrives)`, drag);

  console.log('③ the app moves: the crop follows');
  setApp([450, 250, 800, 500]); vnc.repaint();
  ok(await p.until(`(() => { const g = ${GEO}; return g && Math.abs(g.stage[0] + 450 * ${s}) < 0.6; })()`, 5000), '③ the pane follows the new rectangle (pushed by the device watch, long-polled by the page)');
  g = await p.ev(GEO);
  n = vnc.seen.pointers.length;
  await p.click(g.box[0] + g.box[2] / 2, g.box[1] + g.box[3] / 2);
  got = await pointerAfter(n);
  ok(near(got.find((e) => e.mask & 1), 850, 500), `③ the next click lands at the app's NEW centre (850, 500) — got ${JSON.stringify(got.find((e) => e.mask & 1))}`, got);

  console.log('④ the app closes on the machine');
  setApp(null); vnc.repaint();
  ok(await p.until(`(() => { const g = ${GEO}; return g && /已在WIN-DESK1上关闭/.test(g.say); })()`, 5000), '④ gone ⇒ the pane says "“Blender 4.2”已在WIN-DESK1上关闭"');
  const acts = await p.ev(`[...document.querySelectorAll('.vs-win[data-type="machine-app"] .machine-app-say button')].map((b) => b.textContent)`);
  ok(acts.join() === '打开它的整个桌面,再次运行', '④ with "Open its whole desktop" and "Run again"', acts);
  await p.shot('gone.png');

  console.log('⑤ Run again → a new window; closing it unpins the app');
  setApp([300, 200, 800, 500], 'Blender 4.2'); vnc.repaint();
  await p.ev(`[...document.querySelectorAll('.vs-win[data-type="machine-app"] .machine-app-say button')].find((b) => b.textContent === '再次运行').click()`);
  await p.until(`!!document.querySelector('#machine-desktop-confirm .btn-create')`, 5000);
  await p.ev(`document.querySelector('#machine-desktop-confirm .btn-create').click()`);
  ok(await p.until(`(() => { const g = ${GEO}; return ${appWins} === 1 && g && g.shown && !g.say; })()`), '⑤ Run again: the gone window closed, a new one follows the app again');
  await p.until('true');
  for (let i = 0; i < 30 && pins().length < 2; i++) await sleep(100);
  await p.ev(`(() => { const w = [...window.__wm.windows.values()].find((x) => x.type === 'machine-app'); window.__wm.closeWindow(w.id); })()`);
  for (let i = 0; i < 50 && pins().at(-1) !== 'off 131330'; i++) await sleep(100);
  ok(pins().join() === 'on 131330,on 131330,off 131330', '⑤ closing the window ends the watch and the device UNPINS the app (HWND_NOTOPMOST)', pins());
  p.close();
}

console.log('⑥ the phone: 390 px');
{
  fs.writeFileSync(PINS, '');
  const p = await page(390, 844, 'position:fixed;inset:0;display:flex;flex-direction:column;background:var(--bg-primary);z-index:5');
  await runAsWindow(p);
  ok(await p.until(`(() => { const g = ${GEO}; return g && g.shown && g.fb && g.fb[0] === ${FW}; })()`), '⑥ the phone opens the app\'s window too');
  const g = await p.ev(GEO);
  ok(Math.abs(g.box[2] - g.pane[2]) < 1 && g.box[2] <= 390 && Math.abs(g.box[2] / g.box[3] - 1.6) < 0.01 && (await p.ev('document.documentElement.scrollWidth')) <= 390, `⑥ the crop fits the phone's width (${g.box[2].toFixed(1)}×${g.box[3].toFixed(1)}), no sideways scroll`, g);
  await sleep(600);
  await p.shot('phone.png');
  await p.click(2, 2);
  const g2 = await p.ev(GEO);
  const n = vnc.seen.pointers.length;
  await p.click(g2.box[0] + g2.box[2] / 2, g2.box[1] + g2.box[3] / 2);
  const got = await pointerAfter(n);
  ok((({ x, y } = got.find((e) => e.mask & 1) || {}) => Math.abs(x - 700) <= 2 && Math.abs(y - 450) <= 2)(), `⑥ a click at the crop's centre lands at the app's centre within one CSS pixel of the 0.49× crop (${JSON.stringify(got.find((e) => e.mask & 1))})`, got);
  await p.ev(`(() => { const w = [...window.__wm.windows.values()].find((x) => x.type === 'machine-app'); window.__wm.closeWindow(w.id); })()`);
  p.close();
}

console.log('⑦ an old agent: the update words, at once');
{
  const t0 = Date.now();
  const r = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/machine-app/track`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ host: 'win-old', pid: 9000, since: Date.now() }) })).json();
  const ms = Date.now() - t0;
  ok(r.code === 'host_needs_daemon' && ms < 2000, `the old agent is never asked: host_needs_daemon in ${ms} ms (never a hang)`, r);
  const a = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/machine-app/track`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer vsst_x' }, body: JSON.stringify({ host: 'win-a', pid: 9000 }) })).json();
  ok(a.code === 'human_only', 'an agent token is refused by name (people only, like the whole desktop)', a);
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? ', ' + fail + ' failed' : ''})`);
for (const dm of Object.values(dms)) { try { dm.stop(); } catch { /* gone */ } }
try { chrome.kill('SIGTERM'); } catch { /* gone */ }
await sleep(300);
process.exit(fail ? 1 : 0);
