#!/usr/bin/env node
// lane stream-p1a-transport HEAVY (design q-041 r2 §2/§3 P1 + P1b — owner 2026-10-16 「一起做」): a paired Windows machine's
// desktop as a WebRTC STREAM in the machine desktop window, end to end on this box. The REAL agentd bundle runs Windows-shaped
// (its hello and THE injector say win32; a fixture powershell.exe on its PATH is the resident SendInput script — it logs every
// stdin line and answers `ok`, or `uipi` while an "elevated window" flag file exists); its fake source loops THE fixture
// (scripts/fixtures/stream/fake-desk-720p.h264 — a frame number in a binary band). The hub half: the real access layer + the
// routes (src/server/desktop-webrtc.js made by them) + the ONE picture bridge for the VNC fallback, whose machine side is a
// stub RFB server. The page: the real src/lib/machine-desktop.js + stream-view.js + vnc-view.js in headless Chrome (zh):
//   ① the window opens STREAMING: a <video> where the canvas was, the strip reads 串流 · N ms · N fps + 往返 · 抖动 · fps · 解码 · kbps
//   ② the picture PLAYS: the band read off the <video> twice advances (a screenshot pair)       stream-1.png, stream-2.png
//   ③ the stats strip: fps > 0, decode ms, kbps — and the agent's own numbers in the chip's title
//   ④ input over the data channel into THE resident script: a click at the picture's centre = M 640 360 · D 0 · U 0; a key = its
//      scan code; a Mac viewer's ⌘ = the machine's Ctrl (K 29 0 0) — RED CONTROL: the door without THE table sends K 91 1 0
//   ⑤ UIPI: an elevated window in front ⇒ the strip names it (the press never reached it)
//   ⑥ THE FALLBACK: the machine ends the stream ⇒ the <video> goes, the strip says why, the VNC picture signs in and draws  fallback.png
//   ⑦ relay-only — lane stream-relay-udp: the daemon's own UDP leg carries it, the strip says 经 hub 中转 · UDP; the copy's
//      firewall drops its self-probe ⇒ the strip says 机器防火墙挡住直连，经 hub 中转 with the owner's admin line to copy (the
//      netsh rule for its node.exe; the toast says where to paste it) — never on the direct path (①); the notice sits AHEAD of
//      the numbers, its copy button wholly in the strip's view (the topmost element at its centre) — RED CONTROL (lane
//      stream-relay-udp-ci): the old order (after the numbers) in a 900 px window puts the button past the strip's edge and a
//      click at its centre copies nothing, THE order in the same window copies; a hub that offers no leg
//      ⇒ 经设备链路 (the relay over the device link)                                                          relay.png, relay-link.png
//   ⑧ a hub with no fake source and a machine with no ffmpeg: its screen source is refused (no_ffmpeg) ⇒ the VNC picture at
//      once, NO note (the chip's title says why: 需要 ffmpeg ≥ 7（含 ddagrab 与 NVENC）…)
//   ⑨ phone 375×667: it plays in the same shell, the strip is ONE row (scrolled to its numbers), a TAP is a click on the machine   phone.png, phone-stats.png
//   ⑩ THE MACHINE'S OWN SCREEN (lane stream-p1b-screen): a fake ffmpeg.exe + PowerShell facts (an HDR primary, SDR white
//      200 nits): the HDR road plays, the strip reads NVENC · 编码 N ms, the chip's title says the HDR was mapped on the
//      machine; the capture ffmpeg dies ⇒ 串流停了（机器的屏幕采集停了）and the VNC picture signs in and draws   screen.png, screen-fallback.png
// PNGs when `--shots <dir>`.
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, scratch, endDaemonsOf, ONBOARDED_SOURCE } from './scratch.mjs';
import { writeFakeFfmpeg, factsLine, calibrationFrame } from './fixtures/stream/screen-fakes.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const NOVNC = path.join(REPO, 'public/novnc.js');
const FIXTURE = path.join(REPO, 'scripts/fixtures/stream/fake-desk-720p.h264');
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const f of [BUNDLE, NOVNC, FIXTURE]) if (!fs.existsSync(f)) { ok(false, `${path.relative(REPO, f)} exists (npm run build first)`); process.exit(1); }

// ── the scratch device: Windows-shaped, THE resident script = a fixture powershell.exe ───────────────────────────────
const root = scratch('webrtc-chrome');
fs.mkdirSync(root, { recursive: true });
const realHome = process.env.HOME;
const rootOf = (h) => path.join(h, 'agentd-root');
let chrome = null, srv = null, vnc = null, dm = null;
const home = path.join(root, 'win');
const cleanup = () => {
  try { dm && dm.stop(); } catch { /* gone */ }
  try { endDaemonsOf(rootOf(home)); } catch { /* gone */ } // every daemon of this root (the pid file alone missed the device process — it outlived the suite)
  try { chrome && process.kill(-chrome.pid, 'SIGKILL'); } catch { try { chrome && chrome.kill('SIGKILL'); } catch { /* gone */ } }
  try { srv && srv.close(); } catch { /* gone */ }
  try { vnc && vnc.server.close(); } catch { /* gone */ }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.mkdirSync(path.join(home, '.local/bin'), { recursive: true });
const PS_LOG = path.join(root, 'ps-lines.txt'), ELEVATED = path.join(root, 'elevated'), FACTS = path.join(root, 'stream-facts.json');
fs.writeFileSync(FACTS, factsLine([{ id: '\\\\.\\DISPLAY1', x: 0, y: 0, w: 1280, h: 720, primary: true, hdr: true, white: 2500, adapter: 0, output: 0 }])); // ⑧ ⑩: the machine's screen facts (an HDR primary, SDR white 200 nits)
fs.writeFileSync(path.join(home, '.local/bin/powershell.exe'), `#!${process.execPath}
const fs = require('fs'); { const a = process.argv.slice(2); if (/'stream-facts'/.test(Buffer.from(a[a.length - 1] || '', 'base64').toString('utf16le'))) { process.stdout.write(fs.readFileSync(${JSON.stringify(FACTS)}, 'utf8') + '\\r\\n'); process.exit(0); } }
process.stdout.write('ready\\r\\n');
let buf = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); fs.appendFileSync(${JSON.stringify(PS_LOG)}, l + '\\n'); process.stdout.write(((l[0] === 'D' || (l[0] === 'K' && l.endsWith(' 0'))) && fs.existsSync(${JSON.stringify(ELEVATED)}) ? 'uipi' : 'ok') + '\\r\\n'); } });
`, { mode: 0o755 });
const psLines = () => (fs.existsSync(PS_LOG) ? fs.readFileSync(PS_LOG, 'utf8').trim().split('\n').filter(Boolean) : []);
const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const HELLO = /(op: "hello-ack",[\s\S]{0,200}?)platform: process\.platform,/;
const INJ = /(createInjector\(\{\s*)platform: process\.platform,/;
const SCR = /(createScreen\(\{\s*)platform: process\.platform,/;
ok(HELLO.test(bundleText) && INJ.test(bundleText) && SCR.test(bundleText) && /"stream-offer"/.test(bundleText) && /"stream-screen"/.test(bundleText), 'the bundle carries the hello-ack platform, THE injector\'s, THE screen source\'s and the stream-offer / stream-screen capabilities (the copy patches exactly those)');
fs.mkdirSync(path.join(root, 'bundle'), { recursive: true });
// lane stream-relay-udp: the copy's firewall drops its self-probe (no probe datagram is heard ⇒ directInbound blocked) and it names
// a Windows node.exe (the page builds the owner's admin line from it)
const PROBE = 'const i = tokens.findIndex((tk) => tk.equals(m));', PROGRAM = 'program: process.platform === "win32" ? process.execPath : null';
const NODE_EXE = 'C:\\Users\\owner\\AppData\\Local\\vibespace\\node\\node.exe';
ok(bundleText.split(PROBE).length === 2 && bundleText.split(PROGRAM).length === 2, 'the bundle carries the self-probe\'s receive line and the stream host\'s program (the copy patches exactly those)');
fs.writeFileSync(path.join(root, 'bundle', 'vibespace-agentd.js'), bundleText.replace(HELLO, '$1platform: "win32",').replace(INJ, '$1platform: "win32",').replace(SCR, '$1platform: "win32",').replace(PROBE, 'const i = -1;').replace(PROGRAM, `program: ${JSON.stringify(NODE_EXE)}`));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
process.env.HOME = home; process.env.VIBESPACE_AGENTD_ROOT = rootOf(home);
const dataDir = path.join(home, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
dm = new DeviceManager({ dataDir, bundlePath: path.join(root, 'bundle', 'vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
try { await dm.connect(); } finally { process.env.HOME = realHome; delete process.env.VIBESPACE_AGENTD_ROOT; }
ok(dm.status().info.platform === 'win32' && dm.status().info.capabilities.includes('stream-offer'), 'a real agent, Windows-shaped, says stream-offer');

// ── the machine's VNC server for the fallback: a stub RFB 3.8, VNC-password sign-in, one 1280×720 green frame ─────────
const FW = 1280, FH = 720, GREEN = [40, 150, 70];
const frame = (() => { const px = Buffer.alloc(FW * FH * 4); for (let i = 0; i < FW * FH; i++) { px[i * 4] = GREEN[0]; px[i * 4 + 1] = GREEN[1]; px[i * 4 + 2] = GREEN[2]; } return px; })();
function stubVnc() {
  const seen = { sessions: 0, authed: 0 };
  const u16 = (n) => Buffer.from([(n >> 8) & 255, n & 255]);
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
  const rect = (x, y, w, h, enc) => { const b = Buffer.alloc(12); b.writeUInt16BE(x, 0); b.writeUInt16BE(y, 2); b.writeUInt16BE(w, 4); b.writeUInt16BE(h, 6); b.writeInt32BE(enc, 8); return b; };
  const server = net.createServer((sock) => {
    const c = { stage: 0, buf: Buffer.alloc(0), full: false };
    sock.on('error', () => { });
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
        if (t === 3 && !c.full) { c.full = true; sock.write(Buffer.concat([Buffer.from([0, 0]), u16(1), rect(0, 0, FW, FH, 0), frame])); }
        c.buf = b.subarray(need);
      }
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, seen })));
}
vnc = await stubVnc();

// ── the hub: the real access layer + routes (+ the stream module they make) + the ONE picture bridge ───────────────────
const quiet = { log() { }, warn() { } };
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const DW = require(path.join(REPO, 'src/server/desktop-webrtc.js'));
const hosts = { list: () => [{ id: 'win-a', name: 'WIN-DESK1', transport: 'dial' }], linkState: () => 'online', connectedDevice: (id) => (id === 'win-a' ? dm : null), get: (id) => (id === 'win-a' ? { id, name: 'WIN-DESK1' } : null), isLocal: (id) => id === 'local', deviceBounded: async (id) => (id === 'win-a' ? dm : null) };
const access = ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: FIXTURE }) });
const DS = require(path.join(REPO, 'src/server/desktop-stream.js'));
const bridge = DS.create({ auth: { requestAuthed: () => true }, log: quiet, pingMs: 5000, resolveTarget: (id) => access.machineDesktopTarget(id), forwardPort: (h, p) => access.forwardPort(h, p) });
const express = require(path.join(REPO, 'node_modules/express'));
const R = require(path.join(REPO, 'src/routes/desktop-apps.js'));
const BASE = { access, stream: bridge, vnc: { status: async () => ({ available: true, running: false }) } };
R.setup({ ...BASE });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = `import { openMachineDesktop } from ${JSON.stringify(path.join(REPO, 'src/lib/machine-desktop.js'))};
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
const app = { wm, _hideWelcome() {} };
window.__open = (m) => { openMachineDesktop(app, m); return true; };
window.__closeAll = () => { for (const id of [...wm.windows.keys()]) wm.closeWindow(id); };
// the binary band (16 cells × 80 px at y 640–700 of the 1280×720 picture), read off the <video>
window.__band = () => { const v = document.querySelector('.vs-win .stream-video'); if (!v || !v.videoWidth) return null; const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const g = c.getContext('2d'); g.drawImage(v, 0, 0); let k = 0; for (let b = 0; b < 16; b++) { const d = g.getImageData(b * 80 + 40, 670, 1, 1).data; k = k * 2 + (d[0] > 128 ? 1 : 0); } return k; };`;
// ④'s RED control: the door WITHOUT THE table (a modifier key is sent as pressed — a Mac's ⌘ stays the Windows key)
const MOVE = '  const moved = modifierKeyOf({ key: e && e.key, code: e && e.code }, map);\n';
const noTable = { name: 'no-table', setup(b) { b.onLoad({ filter: /stream-input\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(MOVE)) throw new Error('the door\'s table line moved'); return { contents: src.replace(MOVE, '  const moved = null;\n'), loader: 'js' }; }); } };
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-notable.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [noTable] });
// ⑦'s RED control (lane stream-relay-udp-ci): the strip's OLD order — the firewall notice after the numbers
const FW_ORDER = '  strip.append(fwEl, streamEl, noteEl);\n';
const fwLast = { name: 'fw-last', setup(b) { b.onLoad({ filter: /machine-desktop\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(FW_ORDER)) throw new Error('the strip\'s order line moved'); return { contents: src.replace(FW_ORDER, '  strip.append(streamEl, fwEl, noteEl);\n'), loader: 'js' }; }); } };
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-fwlast.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [fwLast] });
const app = express(); app.use(express.json());
app.use(R.router);
const CSS = ['style', 'viewers', 'chat', 'fonts'].filter((n) => fs.existsSync(path.join(REPO, `public/${n}.css`)));
for (const n of CSS) app.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
app.get('/page.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page.js'))));
app.get('/page-notable.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-notable.js'))));
app.get('/page-fwlast.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-fwlast.js'))));
app.get('/novnc.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(NOVNC)));
const HTML = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-root);height:100vh;overflow:hidden}</style></head><body><script src="/page.js"></script></body></html>`;
app.get('/', (q, s) => s.type('text/html').send(HTML));
app.get('/notable', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-notable.js')));
app.get('/fwlast', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-fwlast.js')));
const PORT = await freePort();
srv = http.createServer(app);
srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head, bridge.upgradeId(new URL(req.url, 'http://x').pathname)));
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

// ── Chrome: a scratch profile, a private HOME / XDG_RUNTIME_DIR, no display (headless) ──────────────────────────────
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { stdio: 'ignore', env: cenv, detached: true });
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h, winCss, { at = '/', mac = false, touch = false } = {}) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); } catch {} window.__winCss = ${JSON.stringify(winCss)};${mac ? " Object.defineProperty(navigator, 'userAgentData', { value: { platform: 'macOS' }, configurable: true });" : ''}` });
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  if (touch) await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  const until = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}${at}` }); await sleep(300); await until('typeof window.__open === "function"', 10000);
  const mouse = async (type, x, y, buttons = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0); };
  const tap = async (x, y) => { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await sleep(60); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const key = async (k, code, vk, type = 'both') => { if (type !== 'up') await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk }); if (type !== 'down') await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
  const shot = async (file, sel) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = sel ? await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`) : [0, 0, w, h];
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0] - 6), y: Math.max(0, r[1] - 6), width: Math.min(r[2] + 12, w), height: Math.min(r[3] + 12, h), scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  return { cdp, ev, until, click, tap, key, shot, close: async () => { await ev('window.__closeAll()').catch(() => { }); await sleep(300); ws.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tg.id}`).catch(() => { }); } };
}
const WIN = '.vs-win[data-type="machine-desktop"]';
const M = { hostId: 'win-a', label: 'WIN-DESK1', setup: 'win32', code: 'desktop_ready', auth: 'password' };
const DESK = 'position:fixed;left:30px;top:30px;width:1100px;height:700px;display:flex;flex-direction:column;background:var(--bg-window);border:1px solid var(--border);box-shadow:0 6px 24px rgba(0,0,0,.25);border-radius:8px;overflow:hidden;z-index:5';
const PHONE = 'position:fixed;left:0;top:0;width:375px;height:667px;display:flex;flex-direction:column;background:var(--bg-window);overflow:hidden;z-index:5';
const playing = (p) => p.until(`(() => { const v = document.querySelector('${WIN} .stream-video'); return !!v && v.videoWidth === 1280 && v.currentTime > 0.2 && window.__band() !== null; })()`, 20000);
const stripText = (p) => p.ev(`(() => { const q = (s) => { const e = document.querySelector('${WIN} ' + s); return e && !e.hidden ? e.textContent : null; }; return { chip: q('.desktop-strip-status'), stream: q('.desktop-strip-stream'), note: q('.desktop-strip-note'), fw: q('.desktop-strip-firewall'), fwCopy: q('.desktop-strip-fw-copy'), fwTitle: (document.querySelector('${WIN} .desktop-strip-firewall') || {}).title || '', title: (document.querySelector('${WIN} .desktop-strip-status') || {}).title || '' }; })()`);
const centre = (p) => p.ev(`(() => { const b = document.querySelector('${WIN} .stream-video').getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`);
const sessions = async () => (await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/machine-desktop/stream/facts?host=win-a`)).json()).sessions || [];
const linesSince = (n) => psLines().slice(n);
// ⑦: the firewall notice's copy button — where it is (ahead of the numbers? wholly inside the strip's visible box? the topmost
// element at its centre?), then a click at its centre with the page's clipboard stubbed
const FW_RULE = `netsh advfirewall firewall add rule name="VibeSpace agent" dir=in action=allow program="${NODE_EXE}" protocol=UDP`;
async function fwCopyAt(p) {
  const up = await p.until(`(() => { const e = document.querySelector('${WIN} .desktop-strip-firewall'); return !!e && !e.hidden; })()`, 8000);
  const sf = await stripText(p);
  await p.ev(`Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true })`);
  const reach = await p.ev(`(() => { const r = (s) => document.querySelector('${WIN} ' + s).getBoundingClientRect(); const s = r('.desktop-strip'), b = r('.desktop-strip-fw-copy'), n = r('.desktop-strip-firewall'), st = r('.desktop-strip-stream'); const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2), hit = document.elementFromPoint(x, y); return { x, y, before: n.right <= st.left, inView: b.left >= s.left && b.right <= s.right, hit: !!(hit && hit.closest('.desktop-strip-fw-copy')), strip: [s.left, s.right].map(Math.round), button: [b.left, b.right].map(Math.round), numbers: [st.left, st.right].map(Math.round) }; })()`);
  await p.click(reach.x, reach.y);
  const copied = await p.until('window.__copied !== undefined', 3000) ? await p.ev('window.__copied') : null;
  const toast = await p.ev(`(document.getElementById('global-toasts') || {}).textContent || ''`);
  return { up, reach, copied, toast, sf };
}

console.log('① – ⑥ desk 1280 px');
{
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playing(p);
  const canvas = await p.ev(`!!document.querySelector('${WIN} canvas')`);
  await p.until(`/解码 [\\d.]+ ms · \\d+ kbps$/.test((document.querySelector('${WIN} .desktop-strip-stream') || {}).textContent || '')`, 8000); // decode ms and kbps need a second getStats read
  const s1 = await stripText(p);
  ok(up && !canvas && /^串流 · \d+ ms · \d+ fps$/.test(s1.chip || '') && /^往返 \d+ ms · 抖动 \d+ ms · \d+ fps · 解码 [\d.]+ ms · \d+ kbps$/.test(s1.stream || '') && !s1.note && vnc.seen.sessions === 0, '① the window opens STREAMING: a <video> where the canvas was (no VNC session), the strip [串流 · N ms · N fps] [往返 · 抖动 · fps · 解码 · kbps]', s1);
  const di1 = ((await sessions())[0]?.stats || {}).directInbound || {};
  ok(di1.verdict === 'blocked' && di1.program === NODE_EXE && !s1.fw, '① the machine\'s self-probe says blocked (its node.exe named) — yet a DIRECT pair plays here, so the strip says nothing about the firewall (only the hub relay\'s path carries that sentence)', { di1, fw: s1.fw });
  const b1 = await p.ev('window.__band()');
  await p.shot('stream-1.png', WIN);
  await sleep(700);
  const b2 = await p.ev('window.__band()');
  await p.shot('stream-2.png', WIN);
  const adv = (b2 - b1 + 300) % 300;
  ok(b1 !== null && b2 !== null && b1 < 300 && b2 < 300 && adv >= 8 && adv <= 40, `② the picture PLAYS: the band read off the <video> advanced ${b1} → ${b2} in 700 ms (THE fixture at 30 fps)`, { b1, b2 });
  await sleep(1200);
  const s2 = await stripText(p);
  const fps = Number((/· (\d+) fps ·/.exec(s2.stream || '') || [])[1]);
  ok(fps >= 15 && /解码 [\d.]+ ms/.test(s2.stream) && /\d+ kbps$/.test(s2.stream) && /发出 \d+ fps、\d+ kbps/.test(s2.title), `③ the stats strip: ${fps} fps, decode ms, kbps; the agent's own numbers (sent fps, kbps) in the chip's title`, s2);
  const [cx, cy] = await centre(p);
  const n0 = psLines().length;
  await p.click(cx, cy);
  await p.key('a', 'KeyA', 65);
  const got = await (async () => { for (let i = 0; i < 60; i++) { const l = linesSince(n0); if (l.includes('K 30 0 1')) return l; await sleep(100); } return linesSince(n0); })();
  const pt = got.filter((l) => /^M /.test(l))[0] || '';
  const [, mx, my] = pt.split(' ').map(Number);
  ok(Math.abs(mx - 640) <= 2 && Math.abs(my - 360) <= 2 && got.includes('D 0') && got.includes('U 0') && got.indexOf('D 0') < got.indexOf('U 0') && got.includes('K 30 0 0') && got.includes('K 30 0 1'), '④ a click at the picture\'s centre reached THE resident script as M 640 360 · D 0 · U 0 (over the data channel), the key A as its scan code down + up', got);
  fs.writeFileSync(ELEVATED, '1');
  await p.click(cx, cy);
  const uipi = await p.until(`/管理员窗口/.test((document.querySelector('${WIN} .desktop-strip-note') || {}).textContent || '')`, 5000);
  fs.rmSync(ELEVATED);
  ok(uipi, '⑤ an elevated window in front: the press never reached it and the strip names it (Windows 不让输入进管理员窗口…)');
  await p.shot('uipi.png', WIN);
  const sid = (await sessions())[0]?.sid;
  const raw = await dm._request({ op: 'stream-stop', sid, timeoutMs: 5000 }); // the MACHINE ends it (past the client's own stop, so its `ended` push is heard)
  const fell = await p.until(`!document.querySelector('${WIN} .stream-video') && /串流停了/.test((document.querySelector('${WIN} .desktop-strip-note') || {}).textContent || '')`, 10000);
  const asked = await p.until(`!!document.querySelector('#machine-desktop-signin input[type=password]')`, 15000);
  if (asked) await p.ev(`(() => { const f = document.querySelector('#machine-desktop-signin form'); f.querySelector('input[type=password]').value = 'pw'; f.requestSubmit(); })()`);
  const drawn = await p.until(`(() => { const cv = document.querySelector('${WIN} canvas'); if (!cv || cv.width !== 1280) return false; const d = cv.getContext('2d').getImageData(640, 360, 1, 1).data; return Math.abs(d[0] - 40) < 8 && Math.abs(d[1] - 150) < 8 && Math.abs(d[2] - 70) < 8; })()`, 15000);
  const s3 = await stripText(p);
  ok(raw && raw.stopped && fell && asked && drawn && vnc.seen.authed === 1 && /机器那边结束了它（stopped）/.test(s3.note || ''), '⑥ the machine ends the stream ⇒ the <video> goes, the strip says why (串流停了（机器那边结束了它（stopped））——改为显示 VNC 画面), the VNC picture signs in and draws', { raw, fell, asked, drawn, s3, vnc: vnc.seen });
  await p.shot('fallback.png', WIN);
  await p.close();
}

console.log('④ a Mac viewer — and its RED CONTROL');
for (const [at, want, name] of [['/', 'K 29 0 0', 'the door through THE table: a Mac viewer\'s ⌘ (MetaLeft) reaches Windows as Ctrl (ControlLeft, scan 0x1d)'], ['/notable', 'K 91 1 0', 'RED CONTROL: the door WITHOUT the table sends the Windows key (scan 0x5b, extended) — the table is what moves it']]) {
  const p = await page(1280, 800, DESK, { at, mac: true });
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  await playing(p);
  const [cx, cy] = await centre(p);
  await p.click(cx, cy);
  await sleep(300);
  const n0 = psLines().length;
  await p.key('Meta', 'MetaLeft', 91, 'down');
  await p.key('Meta', 'MetaLeft', 91, 'up');
  const got = await (async () => { for (let i = 0; i < 40; i++) { const l = linesSince(n0).filter((x) => x.startsWith('K ')); if (l.length >= 2) return l; await sleep(100); } return linesSince(n0); })();
  ok(got[0] === want && got[1] === want.replace(/ 0$/, ' 1'), `④ ${name}`, got);
  await p.close();
}

console.log('⑦ relay-only ⑧ no source');
{
  const relayOnly = DW.create({ access, direct: false, log: quiet });
  R.setup({ ...BASE, webrtc: relayOnly });
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playing(p);
  const via = await p.until(`/经 hub 中转 · UDP$/.test((document.querySelector('${WIN} .desktop-strip-stream') || {}).textContent || '')`, 10000);
  const f = relayOnly.facts('win-a')[0] || {};
  ok(up && via && f.path === 'relay' && f.relay && f.relay.via === 'udp' && f.relay.leg.down > 0, '⑦ relay-only: the daemon\'s own UDP leg carries it — the strip says 经 hub 中转 · UDP, the record says path relay, via udp', { up, via, path: f.path, relay: f.relay });
  const fw = await fwCopyAt(p);
  ok(fw.up && /^机器防火墙挡住直连，经 hub 中转/.test(fw.sf.fw || '') && fw.sf.fwCopy === '复制管理员命令' && fw.sf.fwTitle === FW_RULE && fw.reach.before && fw.reach.inView && fw.reach.hit && fw.copied === FW_RULE && /已复制，请粘贴到 WIN-DESK1 上以管理员身份打开的 PowerShell/.test(fw.toast), '⑦ the machine\'s firewall blocks the direct path: the strip says 机器防火墙挡住直连，经 hub 中转 AHEAD of the numbers, its 复制管理员命令 in view (no sideways scroll), and it copies the netsh rule for its node.exe (the toast says where to paste it — VibeSpace never runs it)', fw);
  await p.shot('relay.png', WIN);
  await p.close();
  // RED CONTROL — the strip's OLD order (the notice after the numbers) in a 900 px window: the copy button is past the strip's
  // edge and a click at its centre copies nothing; THE order in the same window copies (in DejaVu — the hosted runner's sans —
  // the old order missed even in the desk's 1100 px window: the .296 mirror red)
  const narrow = DESK.replace('width:1100px', 'width:900px'), pair = {};
  for (const [name, at] of [['order', '/'], ['old', '/fwlast']]) {
    const pc = await page(1280, 800, narrow, { at });
    await pc.ev(`window.__open(${JSON.stringify(M)})`);
    await playing(pc);
    pair[name] = await fwCopyAt(pc);
    await pc.close();
  }
  ok(narrow !== DESK && pair.order.reach.inView && pair.order.copied === FW_RULE && pair.old.up && !pair.old.reach.before && !pair.old.reach.inView && !pair.old.reach.hit && pair.old.copied === null, '⑦ RED CONTROL: the old order (the notice after the numbers) in a 900 px window — the copy button past the strip\'s edge, a click at its centre copies nothing; THE order in the same window copies', { order: pair.order.reach, old: pair.old.reach, oldCopied: pair.old.copied });
  relayOnly.shutdown();
  const linkOnly = DW.create({ access, direct: false, udpLeg: false, log: quiet });
  R.setup({ ...BASE, webrtc: linkOnly });
  const pl = await page(1280, 800, DESK);
  await pl.ev(`window.__open(${JSON.stringify(M)})`);
  const upL = await playing(pl);
  const viaL = await pl.until(`/经设备链路$/.test((document.querySelector('${WIN} .desktop-strip-stream') || {}).textContent || '')`, 10000);
  const fl = linkOnly.facts('win-a')[0] || {};
  ok(upL && viaL && fl.path === 'relay' && fl.relay && fl.relay.via === 'link' && fl.relay.leg === null, '⑦ a hub that offers no leg: the relay over the device link — the strip says 经设备链路, the record via link', { upL, viaL, relay: fl.relay });
  await pl.shot('relay-link.png', WIN);
  await pl.close();
  linkOnly.shutdown();
  const noSource = DW.create({ access: ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000, env: () => ({}) }), log: quiet });
  R.setup({ ...BASE, webrtc: noSource });
  const q = await page(1280, 800, DESK);
  const before = vnc.seen.sessions;
  await q.ev(`window.__open(${JSON.stringify(M)})`);
  const asked = await q.until(`!!document.querySelector('#machine-desktop-signin input[type=password]')`, 15000);
  if (asked) await q.ev(`(() => { const f = document.querySelector('#machine-desktop-signin form'); f.querySelector('input[type=password]').value = 'pw'; f.requestSubmit(); })()`);
  await q.until(`!!document.querySelector('${WIN} canvas')`, 15000);
  await sleep(500);
  const s = await stripText(q);
  ok(asked && vnc.seen.sessions === before + 1 && !s.note && !(await q.ev(`!!document.querySelector('${WIN} .stream-video')`)) && /没有串流：需要 ffmpeg ≥ 7（含 ddagrab 与 NVENC）/.test(s.title), '⑧ a hub with no fake source, a machine with no ffmpeg (its screen source refused, no_ffmpeg): the rung is not taken ⇒ the VNC picture at once with NO note (the chip\'s title says why, in the page\'s words: 没有串流：需要 ffmpeg ≥ 7（含 ddagrab 与 NVENC）……)', s);
  await q.close();
  noSource.shutdown();
  R.setup({ ...BASE });
}

console.log('⑨ phone 375×667');
{
  const p = await page(375, 667, PHONE, { touch: true });
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playing(p);
  await p.until(`/^往返 \\d+ ms/.test((document.querySelector('${WIN} .desktop-strip-stream') || {}).textContent || '')`, 8000);
  const row = await p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-strip'); const kids = [...s.children].filter((e) => !e.hidden).map((e) => e.getBoundingClientRect()); const v = document.querySelector('${WIN} .stream-video').getBoundingClientRect(); return { h: Math.round(s.getBoundingClientRect().height), oneRow: Math.max(...kids.map((r) => r.top)) < Math.min(...kids.map((r) => r.bottom)), vw: Math.round(v.width) }; })()`);
  ok(up && row.oneRow && row.h <= 34 && row.vw === 375, '⑨ the phone plays it in the same shell, full width; the strip is ONE row (it scrolls sideways)', row);
  const [cx, cy] = await centre(p);
  const n0 = psLines().length;
  await p.tap(cx, cy);
  const got = await (async () => { for (let i = 0; i < 40; i++) { const l = linesSince(n0); if (l.includes('U 0')) return l; await sleep(100); } return linesSince(n0); })();
  const pt = got.find((l) => /^M /.test(l)) || '';
  const [, mx, my] = pt.split(' ').map(Number);
  ok(Math.abs(mx - 640) <= 4 && Math.abs(my - 360) <= 4 && got.includes('D 0') && got.includes('U 0'), '⑨ a TAP at the picture\'s centre is a click at the machine\'s 640 360 (touch → pointer events → the data channel)', got);
  await p.shot('phone.png');
  const scrolled = await p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-strip'); s.scrollLeft = s.scrollWidth; const st = document.querySelector('${WIN} .desktop-strip-stream').getBoundingClientRect(); return s.scrollLeft > 0 && st.right <= 375 + 1 && st.left >= 0; })()`);
  ok(scrolled, '⑨ the strip scrolls sideways to its stream numbers (往返 · 抖动 · fps · 解码 · kbps in view)');
  await p.shot('phone-stats.png');
  await p.close();
}
console.log('⑩ the machine\'s own screen: the HDR road, NVENC on the strip — and its capture dying');
{
  const SP = require(path.join(REPO, 'src/stream-plan.js'));
  const cal = calibrationFrame(1280, 720, SP.CALIBRATION.rows);
  const RAW = path.join(root, 'cal.f16'), DIE = path.join(root, 'die-capture');
  fs.writeFileSync(RAW, cal.buf);
  writeFakeFfmpeg(path.join(home, '.local/bin'), { log: path.join(root, 'ffmpeg.log'), fixture: FIXTURE, raw: RAW, dieCapture: DIE, version: '7.1', encoders: ['h264_nvenc', 'libx264'] });
  const screenHub = DW.create({ access: ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000, env: () => ({}) }), log: quiet });
  R.setup({ ...BASE, webrtc: screenHub });
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playing(p);
  const nv = await p.until(`/ · NVENC · 编码 \\d+ ms$/.test((document.querySelector('${WIN} .desktop-strip-stream') || {}).textContent || '')`, 10000);
  const s = await stripText(p);
  const f = screenHub.facts('win-a')[0] || {};
  ok(up && nv && /HDR 已在机器上映射（SDR 白点 200 nits）/.test(s.title) && f.source && f.source.kind === 'screen' && f.source.encoder === 'NVENC' && f.source.mode === 'mapped', '⑩ the machine\'s own screen (no fake source on the hub): the HDR road plays, the strip reads … · NVENC · 编码 N ms, the chip\'s title says HDR 已在机器上映射（SDR 白点 200 nits）', { s, src: f.source });
  await p.shot('screen.png', WIN);
  fs.writeFileSync(DIE, '1');
  const fell = await p.until(`!document.querySelector('${WIN} .stream-video') && /串流停了（机器的屏幕采集停了）/.test((document.querySelector('${WIN} .desktop-strip-note') || {}).textContent || '')`, 12000);
  const asked = await p.until(`!!document.querySelector('#machine-desktop-signin input[type=password]')`, 15000);
  if (asked) await p.ev(`(() => { const f = document.querySelector('#machine-desktop-signin form'); f.querySelector('input[type=password]').value = 'pw'; f.requestSubmit(); })()`);
  const drawn = await p.until(`(() => { const cv = document.querySelector('${WIN} canvas'); if (!cv || cv.width !== 1280) return false; const d = cv.getContext('2d').getImageData(640, 360, 1, 1).data; return Math.abs(d[0] - 40) < 8 && Math.abs(d[1] - 150) < 8 && Math.abs(d[2] - 70) < 8; })()`, 15000);
  fs.rmSync(DIE);
  ok(fell && drawn, '⑩ the capture ffmpeg dies ⇒ the stream ends BY NAME: the <video> goes, the strip says 串流停了（机器的屏幕采集停了）——改为显示 VNC 画面, the VNC picture signs in and draws', { fell, asked, drawn });
  await p.shot('screen-fallback.png', WIN);
  await p.close();
  screenHub.shutdown();
  R.setup({ ...BASE });
}
ok((await sessions()).length === 0, 'every window closed ⇒ no stream session left on the hub');
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
