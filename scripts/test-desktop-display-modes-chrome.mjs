#!/usr/bin/env node
// lane desktop-display-modes HEAVY (owner 2026-10-19 — a machine with several displays streams in THREE modes, the mode the
// window's and remembered per machine): a TWO-DISPLAY Windows machine end to end on this box — the REAL agentd bundle,
// Windows-shaped (its hello, THE injector and THE screen source say win32; a fixture powershell.exe answers the screen facts:
// DISPLAY1 «Desk 27» 1280×720 SDR, the primary, at 0,0 and DISPLAY2 «Side 32» 640×360 HDR at 1280,360 — bottom-aligned
// to its right — and is THE resident SendInput script; a fake ffmpeg.exe plays THE fixture for each display), the real hub
// half (src/server/desktop-webrtc.js through the routes), the page = the real src/lib/machine-desktop.js in headless Chrome (zh):
//   ③ ONE window that switches: the strip's switcher lists the machine's displays from the offer — [1][2][全部显示器][▾], each
//     titled with its own name, its pixels and HDR — and the mode control reads 单屏 · 切换; a pick restarts the stream ON that
//     display with NO blank frame (the last picture stays until the new stream's first) — RED CONTROL: the switch without THE
//     STILL shows blank frames; the display is REMEMBERED: closed and opened again, the window starts on it    switch*.png
//   ① a window PER display: 「在新窗口打开」 in the ▾ menu ⇒ two windows titled by their displays, each plays its own display
//     (two sessions on the hub, one per display) with its own stats row; closing one stops only its stream; THE PER-MACHINE
//     CAP: a third stream (another tab) is taken (two displays ⇒ 3), a fourth is refused and its window says the count
//     (已在串流 3 个画面——它有 2 个显示器，最多 3 个)                                                                windows.png
//   ② every display in ONE window: 全部一窗 ⇒ two panes laid out as on the machine (DISPLAY2 right of DISPLAY1, bottom-aligned,
//     half its size), both play; the stats row sums them (2 个显示器 · N fps · N kbps); a click lands on the display under it
//     (DISPLAY1's centre = M 640 360, DISPLAY2's carries its origin 1280,360); the keys follow the pointer (the pane it moved
//     over holds the focus); a pane folds to a stub along the top (its stream stops, the other grows) and back; × stops both
//                                                                                                        all.png, all-folded.png
//   phone 375×667 with ② remembered: ③ — one stream, no mode control, no 全部显示器                            phone.png
//   ② ON THE HDR ROAD (commit 2): two 2560-wide HDR displays ⇒ each stream shares 2 (the agent maps every 2nd pixel: 1280×360), the
//     strip says 已按 2 屏降分辨率, a click maps back ×2; one display folded ⇒ the other WHOLE again                 all-scaled.png
//   ④ (commit 2) the Mac's Accessibility banner goes on the next accepted input or a start whose facts say granted, and comes
//     back on a new refusal                                                                                       tcc-banner.png
//   THE OPENSPEC: each window's recipe (machine, mode, display, ②'s folded, who opened it); a replay by THIS device streams at
//     once in its mode; another device's waits for 「在这里显示」 (no stream until the press); a replayed window whose stream is
//     refused never asks the sign-in by itself (「显示 VNC 画面」 asks it)                                       restore.png
//   ⑤ NEVER SILENT (lane stream-fallback-never-silent — owner incident inc-mvf7z2a3-9sxi): the incident's sequence (MODE →
//     每显示器一窗 → a display segment → close one window) and the transient under the first window (its capture dies once):
//     the SAME session plays on — no VNC bridge, no sign-in; a source that ends (capture_interrupted) ⇒ 「串流中断：…——正在重新连接…」
//     and the same display again; ended again within the minute ⇒ 「串流中断：…」 over the last picture with 「重试」 「显示 VNC 画面」
//     and NOTHING by itself; the VNC picture only on that press; a display really gone ⇒ the main one; a switch = one session
//     (`switched` in the hub's log) — RED CONTROL: the pre-lane fallback opens the VNC picture by itself      never-silent*.png
//   ⑥ THE STALL (lane stream-leg-flap — the owner's Mac, 2026-10-20: both displays black at «串流 · 2 个显示器 · 0 fps» while ICE
//     stayed connected): ② over a relay-only hub whose device-link half drops the machine's RTP (a black hole — STUN, DTLS,
//     RTCP pass) ⇒ the chip reads the owner's 0 fps; within stallMs each pane says 「串流中断：画面不再传过来——正在重新连接…」,
//     both sessions end «stopped (stalled)» on the hub's record, the window offers both displays again BY ITSELF and they
//     play — RED CONTROL: the view without the rule sits on «0 fps» past stallMs + 6 s, nothing said    stall.png
// PNGs when `--shots <dir>`.
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, scratch, endDaemonsOf, ONBOARDED_SOURCE } from './scratch.mjs';
import { writeFakeFfmpeg, factsLine } from './fixtures/stream/screen-fakes.mjs';
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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const f of [BUNDLE, NOVNC, FIXTURE]) if (!fs.existsSync(f)) { ok(false, `${path.relative(REPO, f)} exists (npm run build first)`); process.exit(1); }

// ── the scratch device: Windows-shaped, two displays (the facts), THE resident script = a fixture powershell.exe ─────────
const root = scratch('display-modes');
fs.mkdirSync(root, { recursive: true });
const realHome = process.env.HOME;
const rootOf = (h) => path.join(h, 'agentd-root');
let chrome = null, srv = null, vnc = null, dm = null;
const home = path.join(root, 'win');
const cleanup = () => {
  try { dm && dm.stop(); } catch { /* gone */ }
  try { endDaemonsOf(rootOf(home)); } catch { /* gone */ }
  try { chrome && process.kill(-chrome.pid, 'SIGKILL'); } catch { try { chrome && chrome.kill('SIGKILL'); } catch { /* gone */ } }
  try { srv && srv.close(); } catch { /* gone */ }
  try { vnc && vnc.server.close(); } catch { /* gone */ }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const BIN = path.join(home, '.local/bin');
fs.mkdirSync(BIN, { recursive: true });
const D1 = { id: '\\\\.\\DISPLAY1', x: 0, y: 0, w: 1280, h: 720, primary: true, hdr: false, white: 1000, adapter: 0, output: 0, name: 'Desk 27' };
const D2 = { id: '\\\\.\\DISPLAY2', x: 1280, y: 360, w: 640, h: 360, primary: false, hdr: true, white: 1000, adapter: 0, output: 1, name: 'Side 32' };
const PS_LOG = path.join(root, 'ps-lines.txt'), FACTS = path.join(root, 'stream-facts.json');
fs.writeFileSync(FACTS, factsLine([D1, D2]));
fs.writeFileSync(path.join(BIN, 'powershell.exe'), `#!${process.execPath}
const fs = require('fs'); { const a = process.argv.slice(2), sc = Buffer.from(a[a.length - 1] || '', 'base64').toString('utf16le'); if (/'stream-facts'/.test(sc)) { process.stdout.write(fs.readFileSync(${JSON.stringify(FACTS)}, 'utf8') + '\\r\\n'); process.exit(0); }
  if (/VsQos/.test(sc)) { const ids = ((/foreach \\(\\$id in @\\(([\\d,]+)\\)\\)/.exec(sc) || [])[1] || '').split(',').map(Number); process.stdout.write(JSON.stringify({ t: 'unthrottle', rows: ids.map((pid) => ({ pid, ok: true, err: 0 })) }) + '\\r\\n'); process.exit(0); } } // lane stream-sdr-ecoqos: every road's power-throttling opt-out / give-back answered (else it waits on the resident script's stdin)
process.stdout.write('ready\\r\\n');
let buf = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); fs.appendFileSync(${JSON.stringify(PS_LOG)}, l + '\\n'); process.stdout.write('ok\\r\\n'); } });
`, { mode: 0o755 });
const psLines = () => (fs.existsSync(PS_LOG) ? fs.readFileSync(PS_LOG, 'utf8').trim().split('\n').filter(Boolean) : []);
const RAW = path.join(root, 'd2.f16'); fs.writeFileSync(RAW, Buffer.alloc(D2.w * D2.h * 8)); // DISPLAY2's FP16 frames (the HDR road's capture)
const DIE_N = path.join(root, 'die-capture-times'); // ⑤: the next N captures die mid-stream (DXGI_ERROR_ACCESS_LOST)
const FF = writeFakeFfmpeg(BIN, { log: path.join(root, 'ffmpeg.log'), fixture: FIXTURE, raw: RAW, dieCaptureTimes: DIE_N, version: '7.1', encoders: ['h264_nvenc', 'libx264'] });
const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const HELLO = /(op: "hello-ack",[\s\S]{0,200}?)platform: process\.platform,/;
const INJ = /(createInjector\(\{\s*)platform: process\.platform,/;
const SCR = /(createScreen\(\{\s*)platform: process\.platform,/;
ok(HELLO.test(bundleText) && INJ.test(bundleText) && SCR.test(bundleText), 'the bundle carries the hello-ack platform, THE injector\'s and THE screen source\'s (the copy patches exactly those)');
fs.mkdirSync(path.join(root, 'bundle'), { recursive: true });
fs.writeFileSync(path.join(root, 'bundle', 'vibespace-agentd.js'), bundleText.replace(HELLO, '$1platform: "win32",').replace(INJ, '$1platform: "win32",').replace(SCR, '$1platform: "win32",'));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
process.env.HOME = home; process.env.VIBESPACE_AGENTD_ROOT = rootOf(home);
const dataDir = path.join(home, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
dm = new DeviceManager({ dataDir, bundlePath: path.join(root, 'bundle', 'vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
try { await dm.connect(); } finally { process.env.HOME = realHome; delete process.env.VIBESPACE_AGENTD_ROOT; }
ok(dm.status().info.platform === 'win32' && dm.status().info.capabilities.includes('stream-screen'), 'a real agent, Windows-shaped, says stream-screen');

// ── the machine's VNC server (the fallback's): a stub RFB 3.8, VNC-password sign-in, one green frame ────────────────────
function stubVnc() {
  const seen = { sessions: 0, authed: 0, conns: 0 };
  const u16 = (n) => Buffer.from([(n >> 8) & 255, n & 255]);
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
  const server = net.createServer((sock) => {
    seen.conns++; // ⑤: every VNC picture's upstream connects here
    const c = { stage: 0, buf: Buffer.alloc(0) };
    sock.on('error', () => { });
    sock.write('RFB 003.008\n');
    sock.on('data', (d) => {
      c.buf = Buffer.concat([c.buf, d]);
      for (;;) {
        const b = c.buf;
        if (c.stage === 0) { if (b.length < 12) return; c.buf = b.subarray(12); c.stage = 1; sock.write(Buffer.from([1, 2])); continue; }
        if (c.stage === 1) { if (b.length < 1) return; c.buf = b.subarray(1); c.stage = 10; sock.write(crypto.randomBytes(16)); continue; }
        if (c.stage === 10) { if (b.length < 16) return; c.buf = b.subarray(16); c.stage = 2; seen.authed++; sock.write(Buffer.from([0, 0, 0, 0])); continue; }
        if (c.stage === 2) { if (b.length < 1) return; c.buf = b.subarray(1); c.stage = 3; seen.sessions++; const name = Buffer.from('WIN-DESK1'); sock.write(Buffer.concat([u16(1920), u16(1080), Buffer.from([32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 0, 8, 16, 0, 0, 0]), u32(name.length), name])); continue; }
        c.buf = Buffer.alloc(0); return;
      }
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, seen })));
}
vnc = await stubVnc();

// ── the hub: the real access layer + routes + the stream module (the machine's own screen source — no fake source) ─────────
const quiet = { log() { }, warn() { } };
const hubLines = []; // ⑤: the hub's stream log + the VNC bridge's (`… stopped (switched)`, `bridge opened`)
const rec = { log: (m) => { hubLines.push(String(m)); }, warn: (m) => { hubLines.push(String(m)); } };
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const DW = require(path.join(REPO, 'src/server/desktop-webrtc.js'));
const hosts = { list: () => [{ id: 'win-a', name: 'WIN-DESK1', transport: 'dial' }], linkState: () => 'online', connectedDevice: (id) => (id === 'win-a' ? dm : null), get: (id) => (id === 'win-a' ? { id, name: 'WIN-DESK1' } : null), isLocal: (id) => id === 'local', deviceBounded: async (id) => (id === 'win-a' ? dm : null) };
const access = ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000, env: () => ({}) });
const hub = DW.create({ access, log: rec });
const DS = require(path.join(REPO, 'src/server/desktop-stream.js'));
const bridge = DS.create({ auth: { requestAuthed: () => true }, log: rec, pingMs: 5000, resolveTarget: (id) => access.machineDesktopTarget(id), forwardPort: (h, p) => access.forwardPort(h, p) });
const express = require(path.join(REPO, 'node_modules/express'));
const R = require(path.join(REPO, 'src/routes/desktop-apps.js'));
R.setup({ access, stream: bridge, vnc: { status: async () => ({ available: true, running: false }) }, webrtc: hub });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = `import { openMachineDesktop } from ${JSON.stringify(path.join(REPO, 'src/lib/machine-desktop.js'))};
import { replayOpenSpec } from ${JSON.stringify(path.join(REPO, 'src/lib/window-types.js'))};
let n = 0;
const wm = { windows: new Map(), revealWindow() {},
  createWindow({ title, type, syncId }) {
    const id = syncId || ('w' + (++n)); const k = wm.windows.size; const el = document.createElement('div'); el.className = 'vs-win'; el.dataset.type = type; el.dataset.id = id;
    el.style.cssText = window.__winCss + (window.__tile ? ';left:' + (10 + (k % 2) * 625) + 'px;top:' + (10 + Math.floor(k / 2) * 420) + 'px' : '');
    const bar = document.createElement('div'); bar.className = 'vs-win-title'; bar.textContent = title;
    bar.style.cssText = 'flex:0 0 auto;padding:6px 10px;font-size:13px;font-weight:600;border-bottom:1px solid var(--border)';
    const content = document.createElement('div'); content.style.cssText = 'flex:1 1 auto;min-height:0;position:relative;display:flex;flex-direction:column';
    el.append(bar, content); document.body.append(el);
    const w = { id, element: el, content, title, type }; wm.windows.set(id, w); return w; },
  closeWindow(id) { const w = wm.windows.get(id); if (!w) return; wm.windows.delete(id); w.onClose && w.onClose(); w.element.remove(); },
  setTitle(id, t) { const w = wm.windows.get(id); if (w) w.element.querySelector('.vs-win-title').textContent = t; }, resizeWindowTo() {},
};
const app = { wm, _hideWelcome() {} };
window.__open = (m, o) => { openMachineDesktop(app, m, o || {}); return true; };
window.__replay = (spec, syncId) => { replayOpenSpec(app, spec, { syncId }); return true; };
window.__wins = () => [...wm.windows.values()].filter((w) => w.type === 'machine-desktop').map((w) => ({ id: w.id, title: w.element.querySelector('.vs-win-title').textContent, spec: w._openSpec || null, mode: w._desktopMode, display: w._desktopDisplay }));
window.__close = (id) => { wm.closeWindow(id); return true; };
window.__closeAll = () => { for (const id of [...wm.windows.keys()]) wm.closeWindow(id); };
// THE BLANK RECORDER: every animation frame, does the window's picture area show a picture (THE STILL, or a video with a frame)?
window.__watch = (sel) => { window.__blank = 0; window.__frames = 0; window.__stills = 0; const tick = () => { const p = document.querySelector(sel + ' .desktop-display-pane'); if (p) { const st = p.querySelector('.desktop-display-still'); const v = p.querySelector('.stream-video'); window.__frames++; if (st) window.__stills++; if (!st && !(v && v.readyState >= 2 && v.videoWidth)) window.__blank++; } if (window.__watching) requestAnimationFrame(tick); }; window.__watching = true; requestAnimationFrame(tick); return true; };`;
// THE STILL's RED control: the switch without it (the old view goes, the new one is black until its first picture)
const STILL = "const still = stillOf(stream, panes.pane(''));";
const noStill = { name: 'no-still', setup(b) { b.onLoad({ filter: /machine-desktop\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(STILL)) throw new Error('the still line moved'); return { contents: src.replace(STILL, 'const still = null;'), loader: 'js' }; }); } };
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-nostill.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [noStill] });
// ⑥'s RED CONTROL (lane stream-leg-flap): the view without THE STALL rule (a playing picture whose frames stopped is never acted on)
const STALL_ACT = "    if (sv.stalled && st.state === 'playing') { why = null; step('ended', 'stalled'); }\n";
const noStall = { name: 'no-stall', setup(b) { b.onLoad({ filter: /stream-view\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(STALL_ACT)) throw new Error('the stall line moved'); return { contents: src.replace(STALL_ACT, ''), loader: 'js' }; }); } };
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-nostall.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [noStall] });
// ⑤ RED CONTROL: the pre-lane fallback — a played stream's ending shows the VNC picture by itself (the ladder never asked)
const LADDER = "if (nv.act !== 'fallback') {";
const oldFallback = { name: 'old-fallback', setup(b) { b.onLoad({ filter: /machine-desktop\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(LADDER)) throw new Error('the ladder line moved'); return { contents: src.replace(LADDER, 'if (false) {'), loader: 'js' }; }); } };
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-oldfallback.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [oldFallback] });
const web = express(); web.use(express.json());
web.use(R.router);
const CSS = ['style', 'viewers', 'chat', 'fonts'].filter((n) => fs.existsSync(path.join(REPO, `public/${n}.css`)));
for (const n of CSS) web.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
web.get('/page.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page.js'))));
web.get('/page-nostill.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-nostill.js'))));
web.get('/page-nostall.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-nostall.js'))));
web.get('/page-oldfallback.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-oldfallback.js'))));
web.get('/novnc.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(NOVNC)));
const HTML = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-root);height:100vh;overflow:hidden}</style></head><body><script src="/page.js"></script></body></html>`;
web.get('/', (q, s) => s.type('text/html').send(HTML));
web.get('/nostill', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-nostill.js')));
web.get('/nostall', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-nostall.js')));
web.get('/oldfallback', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-oldfallback.js')));
const PORT = await freePort();
srv = http.createServer(web);
srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head, bridge.upgradeId(new URL(req.url, 'http://x').pathname)));
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

// ── Chrome: a scratch profile, a private HOME / XDG_RUNTIME_DIR, headless ────────────────────────────────────────────────
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { stdio: 'ignore', env: cenv, detached: true });
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h, winCss, { at = '/', touch = false, tile = false, keep = false } = {}) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); ${keep ? '' : "localStorage.removeItem('vibespace.desktopModes');"} } catch {} window.__winCss = ${JSON.stringify(winCss)}; window.__tile = ${tile};` });
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  if (touch) await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  const until = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}${at}` }); await sleep(300); await until('typeof window.__open === "function"', 10000);
  const mouse = async (type, x, y, buttons = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0); };
  const move = async (x, y) => mouse('mouseMoved', x, y);
  const key = async (k, code, vk) => { await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
  const shot = async (file, sel) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = sel ? await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`) : [0, 0, w, h];
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0] - 6), y: Math.max(0, r[1] - 6), width: Math.min(r[2] + 12, w), height: Math.min(r[3] + 12, h), scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  return { cdp, ev, until, click, move, key, shot, close: async () => { await ev('window.__closeAll()').catch(() => { }); await sleep(300); ws.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tg.id}`).catch(() => { }); } };
}
const WIN = '.vs-win[data-type="machine-desktop"]';
const M = { hostId: 'win-a', label: 'WIN-DESK1', setup: 'win32', code: 'desktop_ready', auth: 'password' };
const DESK = 'position:fixed;left:30px;top:30px;width:1100px;height:700px;display:flex;flex-direction:column;background:var(--bg-window);border:1px solid var(--border);box-shadow:0 6px 24px rgba(0,0,0,.25);border-radius:8px;overflow:hidden;z-index:5';
const HALF = 'position:fixed;width:615px;height:400px;display:flex;flex-direction:column;background:var(--bg-window);border:1px solid var(--border);border-radius:8px;overflow:hidden;z-index:5';
const PHONE = 'position:fixed;left:0;top:0;width:375px;height:667px;display:flex;flex-direction:column;background:var(--bg-window);overflow:hidden;z-index:5';
const sessions = async () => (await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/machine-desktop/stream/facts?host=win-a`)).json()).sessions || [];
const live = async () => (await sessions()).filter((s) => !s.ended);
const sourcesOf = async () => (await live()).map((s) => s.source && s.source.display).sort();
const untilN = async (f, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await sleep(150); } return !!(await f()); };
/** every <video> of a window that plays THE fixture */
const playingIn = (p, sel, n = 1) => p.until(`[...document.querySelectorAll(${JSON.stringify(sel + ' .stream-video')})].filter((v) => v.videoWidth === 1280 && v.currentTime > 0.2).length >= ${n}`, 25000);
const segOf = (p, sel = WIN) => p.ev(`[...document.querySelectorAll(${JSON.stringify(sel + ' .desktop-strip-displays:not([hidden]) .desktop-strip-seg')})].map((b) => [b.textContent, b.dataset.key, b.getAttribute('aria-pressed'), b.title])`);
const modeText = (p, sel = WIN) => p.ev(`(() => { const b = document.querySelector(${JSON.stringify(sel + ' .desktop-strip-mode')}); return b && !b.hidden ? b.textContent.trim() : null; })()`);
const menuRows = (p) => p.ev(`[...document.querySelectorAll('.context-menu .context-menu-item')].map((e) => e.textContent)`);
/** a window's element of a display (its id holds backslashes: matched by dataset, never inside a selector) */
const byDisplay = (sel, id) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => (e.dataset.key || e.dataset.display) === ${JSON.stringify(id)})`;
const pressMenu = (p, re) => p.ev(`(() => { const e = [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => ${re}.test(x.textContent)); if (!e) return false; e.click(); return true; })()`);
const L1 = '1 · Desk 27 · 1280×720', L2 = '2 · Side 32 · 640×360 · HDR';

console.log('③ ONE window that switches');
{
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playingIn(p, WIN);
  await p.until(`document.querySelectorAll('${WIN} .desktop-strip-displays:not([hidden]) .desktop-strip-seg').length === 3`, 8000);
  const seg = await segOf(p), mt = await modeText(p);
  ok(up && same(seg, [['1', D1.id, 'true', L1], ['2', D2.id, 'false', L2], ['全部显示器', '*', 'false', '全部一窗']]) && mt === '单屏 · 切换', '③ the switcher lists the machine\'s displays from the Windows offer — [1][2][全部显示器], titled with their own names, pixels and HDR, the streamed one (the primary) pressed — and the mode control reads 单屏 · 切换', { seg, mt });
  ok(same(await sourcesOf(), [D1.id]), '③ one session, on the primary', await sourcesOf());
  await p.ev(`document.querySelector('${WIN} .desktop-strip-more').click()`);
  const rows = await menuRows(p);
  ok(same(rows, [`✓ ${L1}`, '  在新窗口打开', ` ${L2}`, '  在新窗口打开']), '③ the ▾ menu: each display (✓ the shown one) and 「在新窗口打开」 under each', rows);
  await p.key('Escape', 'Escape', 27); await p.ev(`document.querySelectorAll('.context-menu').forEach((e) => e.remove())`);
  await p.shot('switch.png', WIN);
  await p.ev(`window.__watch('${WIN}')`);
  await p.ev(`${byDisplay(WIN + ' .desktop-strip-seg', D2.id)}.click()`);
  const moved = await untilN(async () => same(await sourcesOf(), [D2.id]), 10000) && (await playingIn(p, WIN));
  await sleep(400);
  const rec = await p.ev('({ blank: window.__blank, frames: window.__frames, stills: window.__stills })');
  await p.ev('window.__watching = false');
  const seg2 = await segOf(p);
  ok(moved && seg2[1][2] === 'true' && seg2[0][2] === 'false', '③ a pick restarts the stream ON that display (the hub\'s one session now shows DISPLAY2); the pick is pressed', { seg2, src: await sourcesOf() });
  ok(rec.frames > 10 && rec.blank === 0 && rec.stills > 0, `③ NO blank frame through the switch: ${rec.frames} animation frames watched, ${rec.stills} of them showing THE STILL (the last picture), 0 with nothing`, rec);
  await p.shot('switch-2.png', WIN);
  // remembered: closed and opened again ⇒ it starts on DISPLAY2
  await p.ev('window.__closeAll()');
  await untilN(async () => (await live()).length === 0, 5000);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const again = await playingIn(p, WIN);
  const w = (await p.ev('window.__wins()'))[0] || {};
  ok(again && same(await sourcesOf(), [D2.id]) && w.spec && w.spec.action === 'openMachineDesktop' && w.spec.mode === 'switch' && w.spec.display === D2.id && w.spec.hostId === 'win-a' && typeof w.spec.by === 'string', '③ the display is REMEMBERED: closed and opened again, the window starts on DISPLAY2 — and its openSpec says so (machine, mode switch, display, who opened it)', { src: await sourcesOf(), spec: w.spec });
  await p.close();
}
console.log('③ RED CONTROL: the switch without THE STILL');
{
  await untilN(async () => (await live()).length === 0, 5000);
  const p = await page(1280, 800, DESK, { at: '/nostill' });
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  await playingIn(p, WIN);
  await p.until(`document.querySelectorAll('${WIN} .desktop-strip-displays:not([hidden]) .desktop-strip-seg').length === 3`, 8000);
  await p.ev(`window.__watch('${WIN}')`);
  await p.ev(`${byDisplay(WIN + ' .desktop-strip-seg', D2.id)}.click()`);
  await untilN(async () => same(await sourcesOf(), [D2.id]), 10000); await playingIn(p, WIN); await sleep(400);
  const rec = await p.ev('({ blank: window.__blank, frames: window.__frames, stills: window.__stills })');
  ok(rec.blank > 3 && rec.stills === 0, `③ RED CONTROL: without THE STILL the switch shows ${rec.blank} blank animation frames of ${rec.frames} — the still is what hides them`, rec);
  await p.close();
}

console.log('① a window PER display — and THE PER-MACHINE CAP');
{
  await untilN(async () => (await live()).length === 0, 5000);
  const p = await page(1280, 860, HALF, { tile: true });
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  await playingIn(p, WIN);
  await p.until(`!!document.querySelector('${WIN} .desktop-strip-more')`, 8000);
  await p.ev(`document.querySelector('${WIN} .desktop-strip-more').click()`);
  const pressed = await p.ev(`(() => { const e = [...document.querySelectorAll('.context-menu .context-menu-item')].filter((x) => /在新窗口打开/.test(x.textContent))[1]; if (!e) return false; e.click(); return true; })()`); // DISPLAY2's
  const two = (await p.until(`window.__wins().length === 2`, 8000)) && (await playingIn(p, WIN, 2));
  await untilN(async () => (await live()).length === 2, 8000);
  const wins = await p.ev('window.__wins()');
  ok(pressed && two && same(wins.map((w) => [w.title, w.mode, w.display]), [['WIN-DESK1 — Desk 27', 'windows', D1.id], ['WIN-DESK1 — Side 32', 'windows', D2.id]]) && same(await sourcesOf(), [D1.id, D2.id].sort()), '① 「在新窗口打开」 (DISPLAY2) ⇒ two windows, each titled by its display (the first keeps DISPLAY1), each plays its own display — two sessions on the hub, one per display', { wins, src: await sourcesOf() });
  // lane stream-stats-popup: the numbers left the strip — each window's chip is its summary (串流 · ms · fps), its title the sentence
  await p.until(`[...document.querySelectorAll('${WIN} .desktop-strip-status')].filter((e) => /往返 \\d+ ms · 抖动 \\d+ ms · \\d+ fps/.test(e.title)).length === 2`, 10000);
  const rows = await p.ev(`[...document.querySelectorAll('${WIN}')].map((w) => { const s = w.querySelector('.desktop-strip-status'); return [w.querySelector('.desktop-strip-mode').textContent.trim(), /^串流 · \\d+ ms · \\d+ fps$/.test(s.textContent) && /往返 \\d+ ms · 抖动 \\d+ ms · \\d+ fps/.test(s.title), w.querySelector('.desktop-strip-seg[aria-pressed="true"]').textContent]; })`);
  ok(same(rows, [['每显示器一窗', true, '1'], ['每显示器一窗', true, '2']]), '① each window has its own stats (its chip 串流 · ms · fps, the title 往返 · 抖动 · fps …), its mode control reads 每显示器一窗, its own display pressed', rows);
  await p.shot('windows.png');
  // closing one ① window stops only its stream
  await p.ev(`window.__close(window.__wins()[1].id)`);
  const one = await untilN(async () => same(await sourcesOf(), [D1.id]), 6000);
  ok(one && (await p.ev('window.__wins().length')) === 1, '① closing DISPLAY2\'s window stops only its stream (DISPLAY1\'s window plays on)', await sourcesOf());
  // the door that names no display re-opens the remembered windows (both)
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const back = (await p.until(`window.__wins().length === 2`, 6000)) && (await untilN(async () => (await live()).length === 2, 8000));
  ok(back, '① the door with no display (the Desktop picker / the Apps dialog) re-opens every remembered display\'s window', await p.ev('window.__wins().map((w) => w.title)'));
  // THE PER-MACHINE CAP: two displays ⇒ 3 streams — another tab's ③ window is the third (taken), a fourth tab's is refused with its count
  const q = await page(1280, 800, DESK);
  await q.ev(`window.__open(${JSON.stringify(M)}, { mode: 'switch' })`);
  const third = await playingIn(q, WIN);
  const r4 = await page(1280, 800, DESK);
  await r4.ev(`window.__open(${JSON.stringify(M)}, { mode: 'switch' })`);
  const asked = await r4.until(`!!document.querySelector('#machine-desktop-signin input[type=password]')`, 15000); // the refused window shows the VNC picture (its sign-in first)
  if (asked) await r4.ev(`(() => { const f = document.querySelector('#machine-desktop-signin form'); f.querySelector('input[type=password]').value = 'pw'; f.requestSubmit(); })()`);
  const said = await r4.until(`/没有串流：这台机器已在串流 3 个画面——它有 2 个显示器，最多 3 个（每个显示器一个，再加一个）/.test((document.querySelector('${WIN} .desktop-strip-status') || {}).title || '')`, 15000);
  ok(third && asked && said && (await live()).length === 3, 'THE PER-MACHINE CAP: a third stream (another tab) is taken; a fourth is refused — its window shows the VNC picture and says the count: 没有串流：这台机器已在串流 3 个画面——它有 2 个显示器，最多 3 个（每个显示器一个，再加一个）', { third, asked, said, live: (await live()).length, title: await r4.ev(`(document.querySelector('${WIN} .desktop-strip-status') || {}).title || ''`) });
  await r4.close(); await q.close();
  await p.close();
}

console.log('② every display in ONE window');
{
  await untilN(async () => (await live()).length === 0, 5000);
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__open(${JSON.stringify(M)}, { mode: 'switch' })`);
  await playingIn(p, WIN);
  await p.until(`!!document.querySelector('${WIN} .desktop-strip-mode:not([hidden])')`, 8000);
  await p.ev(`document.querySelector('${WIN} .desktop-strip-mode').click()`);
  const modes = await menuRows(p);
  ok(same(modes, ['✓  单屏 · 切换', '  每显示器一窗', '  全部一窗']), 'the mode control lists the three modes (✓ the current one), each with its icon', modes);
  await pressMenu(p, /全部一窗/);
  const both = (await playingIn(p, WIN, 2)) && (await untilN(async () => same(await sourcesOf(), [D1.id, D2.id].sort()), 10000));
  const lay = await p.ev(`(() => { const r = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; }; const area = document.querySelector('${WIN} .desktop-display-pane').parentElement; const ps = [...document.querySelectorAll('${WIN} .desktop-display-pane')].filter((e) => !e.hidden); return { area: r(area), panes: ps.map((e) => ({ id: e.dataset.display, ...r(e), video: !!e.querySelector('.stream-video') })) }; })()`);
  const a = lay.panes.find((x) => x.id === D1.id), b = lay.panes.find((x) => x.id === D2.id);
  ok(both && a && b && a.video && b.video && Math.abs(a.x + a.w - b.x) <= 1 && Math.abs(a.y + a.h - (b.y + b.h)) <= 1 && Math.abs(b.w * 2 - a.w) <= 2 && Math.abs(b.h * 2 - a.h) <= 2 && lay.panes.every((x) => x.x >= lay.area.x && x.x + x.w <= lay.area.x + lay.area.w + 1), '② 全部一窗 ⇒ ONE window, two panes laid out as on the machine: DISPLAY2 right of DISPLAY1, bottom-aligned, half its size; both play (two sessions)', lay);
  await p.until(`/(^|\\n)2 个显示器 · [1-9]\\d* fps · [1-9]\\d* kbps/.test((document.querySelector('${WIN} .desktop-strip-status') || {}).title || '')`, 12000); // lane stream-stats-popup: the sum's sentence is the chip's title
  const st = await p.ev(`({ row: (document.querySelector('${WIN} .desktop-strip-status').title.split('\\n').find((l) => /^2 个显示器 · /.test(l)) || ''), chip: document.querySelector('${WIN} .desktop-strip-status').textContent, title: document.querySelector('${WIN} .desktop-strip-status').title, seg: [...document.querySelectorAll('${WIN} .desktop-strip-seg')].map((x) => x.getAttribute('aria-pressed')), mode: document.querySelector('${WIN} .desktop-strip-mode').textContent.trim() })`);
  const fpsSum = Number((/^2 个显示器 · (\d+) fps/.exec(st.row) || [])[1]);
  ok(fpsSum >= 30 && /^串流 · 2 个显示器 · \d+ fps$/.test(st.chip) && (!/最慢/.test(st.row) || /最慢：[12] · (Desk 27|Side 32)，\d+ fps$/.test(st.row)) && st.title.includes(L1) && st.title.includes(L2) && same(st.seg, ['true', 'true', 'true']) && st.mode === '全部一窗', `② the chip's title sums the two (${st.row}); the chip says 串流 · 2 个显示器; its title has each display's numbers; every number and 全部显示器 pressed; the mode 全部一窗`, st);
  await p.shot('all.png', WIN);
  // input: a click lands on the display under it, with that display's origin
  const c1 = [a.x + a.w / 2, a.y + a.h / 2], c2 = [b.x + b.w / 2, b.y + b.h / 2];
  let n0 = psLines().length;
  await p.click(c1[0], c1[1]);
  await untilN(() => psLines().slice(n0).includes('U 0'), 4000);
  const m1 = psLines().slice(n0).find((l) => /^M /.test(l)) || '';
  n0 = psLines().length;
  await p.click(c2[0], c2[1]);
  await untilN(() => psLines().slice(n0).includes('U 0'), 4000);
  const m2 = psLines().slice(n0).find((l) => /^M /.test(l)) || '';
  const [, x1, y1] = m1.split(' ').map(Number), [, x2, y2] = m2.split(' ').map(Number);
  ok(Math.abs(x1 - 640) <= 3 && Math.abs(y1 - 360) <= 3 && x2 >= D2.x && y2 >= D2.y, `② a click lands on the display under it: DISPLAY1's centre = ${m1}; DISPLAY2's carries its origin 1280,360 (${m2})`, { m1, m2 });
  // the keys follow the pointer: focus in DISPLAY1's view, the pointer moves over DISPLAY2 ⇒ DISPLAY2's view holds the focus; a key reaches the machine
  await p.click(c1[0], c1[1]); await sleep(150);
  const f1 = await p.ev(`document.activeElement && document.activeElement.closest('.desktop-display-pane') ? document.activeElement.closest('.desktop-display-pane').dataset.display : null`);
  await p.move(c2[0], c2[1]); await p.move(c2[0] + 4, c2[1] + 2); await sleep(150);
  const f2 = await p.ev(`document.activeElement && document.activeElement.closest('.desktop-display-pane') ? document.activeElement.closest('.desktop-display-pane').dataset.display : null`);
  n0 = psLines().length;
  await p.key('a', 'KeyA', 65);
  const keyed = await untilN(() => psLines().slice(n0).includes('K 30 0 1'), 4000);
  ok(f1 === D1.id && f2 === D2.id && keyed, '② the keys follow the pointer: focused in DISPLAY1\'s view, the pointer moved over DISPLAY2 ⇒ DISPLAY2\'s view holds the focus; a key reaches the machine', { f1, f2, keyed });
  // fold DISPLAY2: a stub along the top, its stream stops, DISPLAY1 grows; the stub brings it back
  await p.move(c2[0], c2[1]);
  await p.ev(`${byDisplay(WIN + ' .desktop-display-pane', D2.id)}.querySelector('.desktop-display-fold').click()`);
  const folded = await untilN(async () => same(await sourcesOf(), [D1.id]), 6000);
  const fl = await p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-display-stub'); const ps = [...document.querySelectorAll('${WIN} .desktop-display-pane')].filter((e) => !e.hidden); return { stub: s ? [s.textContent, s.dataset.display, Math.round(s.getBoundingClientRect().top - s.parentElement.getBoundingClientRect().top)] : null, panes: ps.map((e) => [e.dataset.display, Math.round(e.getBoundingClientRect().width)]), seg: [...document.querySelectorAll('${WIN} .desktop-strip-seg')].map((x) => x.getAttribute('aria-pressed')) }; })()`);
  ok(folded && fl.stub && fl.stub[0] === '2 · Side 32' && fl.stub[1] === D2.id && fl.stub[2] <= 8 && fl.panes.length === 1 && fl.panes[0][0] === D1.id && fl.panes[0][1] > a.w && same(fl.seg, ['true', 'false', 'true']), '② DISPLAY2 folded: a stub 「2 · Side 32」 along the top, its stream stopped (one session left), DISPLAY1\'s pane grew; its number unpressed', fl);
  await p.shot('all-folded.png', WIN);
  await p.ev(`document.querySelector('${WIN} .desktop-display-stub').click()`);
  const unfolded = (await untilN(async () => same(await sourcesOf(), [D1.id, D2.id].sort()), 8000)) && (await playingIn(p, WIN, 2));
  const spec = (await p.ev('window.__wins()'))[0].spec;
  ok(unfolded && !(await p.ev(`!!document.querySelector('${WIN} .desktop-display-stub')`)) && spec.mode === 'all' && !spec.folded, '② the stub brings DISPLAY2 back (two sessions, both play); the openSpec says all, nothing folded', spec);
  await p.ev('window.__closeAll()');
  ok(await untilN(async () => (await live()).length === 0, 5000), '② the window\'s × stops both streams');
  await p.close();
}

console.log('phone 375×667 with ② remembered');
{
  const p = await page(375, 667, PHONE, { touch: true });
  await p.ev(`localStorage.setItem('vibespace.desktopModes', JSON.stringify({ 'win-a': { mode: 'all' } }))`);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playingIn(p, WIN);
  await p.until(`document.querySelectorAll('${WIN} .desktop-strip-displays:not([hidden]) .desktop-strip-seg').length >= 2`, 8000);
  await sleep(800);
  const s = { seg: await segOf(p), mode: await modeText(p), n: (await live()).length, panes: await p.ev(`document.querySelectorAll('${WIN} .stream-video').length`) };
  ok(up && s.n === 1 && s.panes === 1 && s.mode === null && same(s.seg.map((x) => x[0]), ['1', '2']), '② remembered, yet a phone opens ③: one stream, the switcher [1][2] — no 全部显示器, no mode control', s);
  await p.shot('phone.png');
  await p.close();
}

console.log('② ON THE HDR ROAD (commit 2): two 2560-wide HDR displays share the window ⇒ each mapped at every 2nd pixel');
{
  await untilN(async () => (await live()).length === 0, 5000);
  const E1 = { ...D1, w: 2560, h: 720, hdr: true }, E2 = { ...D2, x: 2560, y: 0, w: 2560, h: 720, hdr: true };
  const RAWE = path.join(root, 'wide.f16'); fs.writeFileSync(RAWE, Buffer.alloc(E1.w * E1.h * 8, 0x3c));
  FF.set({ raw: RAWE }); fs.writeFileSync(FACTS, factsLine([E1, E2])); await dm.streamFacts({ force: true }).catch(() => null);
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__open(${JSON.stringify(M)}, { mode: 'all' })`);
  const scaledBoth = await untilN(async () => { const ss = await live(); return ss.length === 2 && ss.every((x) => x.source && x.source.scaled && x.source.scaled.step === 2); }, 30000);
  const plays = await playingIn(p, WIN, 2);
  const chipOk = await p.until(`(() => { const e = document.querySelector('${WIN} .desktop-strip-scaled'); return !!e && !e.hidden && e.textContent === '已按 2 屏降分辨率' && /1280×360（原 2560×720）/.test(e.title); })()`, 8000);
  const ss = await live();
  ok(scaledBoth && plays && chipOk && ss.every((x) => JSON.stringify(x.source.scaled) === JSON.stringify({ share: 2, step: 2, w: 1280, h: 360, from: { w: 2560, h: 720 } })), '② two HDR displays: each stream asks share 2 (the first view restarted under THE STILL), the agent maps every 2nd pixel (1280×360 of 2560×720) and the strip says 已按 2 屏降分辨率', { scaledBoth, plays, chipOk, scaled: ss.map((x) => x.source && x.source.scaled) });
  await p.shot('all-scaled.png', WIN);
  const b2 = await p.ev(`(() => { const e = [...document.querySelectorAll('${WIN} .desktop-display-pane')].find((x) => x.dataset.display === ${JSON.stringify(E2.id)}); const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  const n0 = psLines().length;
  await p.click(b2[0], b2[1]);
  await untilN(() => psLines().slice(n0).includes('U 0'), 4000);
  const mv = psLines().slice(n0).find((l) => /^M /.test(l)) || '';
  const [, mx, my] = mv.split(' ').map(Number);
  // the fake encoder answers THE fixture (1280×720) whatever size it is told, so the page's point is the fixture's centre + the origin
  // (2560 + 640, 360); the agent doubles it from the origin ⇒ 2560 + 1280, 720 (a real 1280×360 picture: the display's centre 3840, 360)
  ok(Math.abs(mx - 3840) <= 6 && Math.abs(my - 720) <= 6, `② a click at the scaled pane's centre: the page's point ×2 from the display's origin reaches the machine — ${mv}`, mv);
  await p.ev(`[...document.querySelectorAll('${WIN} .desktop-display-pane')].find((x) => x.dataset.display === ${JSON.stringify(E2.id)}).querySelector('.desktop-display-fold').click()`);
  const whole = await untilN(async () => { const s1 = await live(); return s1.length === 1 && s1[0].source && s1[0].source.display === E1.id && !s1[0].source.scaled; }, 15000);
  const chipGone = await p.until(`document.querySelector('${WIN} .desktop-strip-scaled').hidden`, 8000);
  ok(whole && chipGone && (await playingIn(p, WIN, 1)), '② one display left (the other folded): its stream restarts WHOLE (no share), the strip\'s 已按…降分辨率 goes', { whole, chipGone });
  await p.close();
  await untilN(async () => (await live()).length === 0, 5000);
  FF.set({ raw: RAW }); fs.writeFileSync(FACTS, factsLine([D1, D2])); await dm.streamFacts({ force: true }).catch(() => null);
}

console.log('④ the Mac\'s Accessibility banner (commit 2): goes on the next accepted input or a start whose facts say granted; a new refusal shows it again');
{
  await untilN(async () => (await live()).length === 0, 5000);
  const p = await page(1280, 800, DESK);
  // the page's fetch wrapped: the long poll's agent numbers carry the injected input facts; a start's source the injected tcc
  await p.ev(`(() => { window.__inj = null; window.__startTcc = null; const real = window.fetch.bind(window); const J = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
    window.fetch = async (u, o) => { const url = String(u); const r = await real(u, o);
      if (/\\/stream\\/watch\\?/.test(url) && window.__inj) { const j = await r.json(); if (j && j.stats) j.stats = { ...j.stats, input: { n: window.__inj.n, refused: window.__inj.refused, dropped: 0 } }; return J(j); }
      if (/\\/stream\\/start$/.test(url) && window.__startTcc) { const j = await r.json(); if (j && j.take) j.source = { ...j.source, tcc: { accessibility: window.__startTcc } }; return J(j); }
      return r; }; return true; })()`);
  await p.ev(`window.__open(${JSON.stringify({ ...M, label: 'Macbook', setup: 'darwin' })}, { mode: 'switch' })`);
  await playingIn(p, WIN);
  const shown = () => p.ev(`(() => { const e = document.querySelector('${WIN} .desktop-strip-tcc'); return !!e && !e.hidden && /辅助功能/.test(e.textContent); })()`);
  await p.ev(`window.__inj = { n: 5, refused: { code: 'accessibility_permission', at: 1000 } }`);
  const up1 = await p.until(`(() => { const e = document.querySelector('${WIN} .desktop-strip-tcc'); return !!e && !e.hidden && /辅助功能/.test(e.textContent); })()`, 8000);
  await p.ev(`window.__inj = { n: 9, refused: { code: 'accessibility_permission', at: 1000 } }`);
  const gone1 = await p.until(`document.querySelector('${WIN} .desktop-strip-tcc').hidden`, 8000);
  await p.ev(`window.__inj = { n: 9, refused: { code: 'accessibility_permission', at: 2000 } }`);
  const up2 = await p.until(`(() => { const e = document.querySelector('${WIN} .desktop-strip-tcc'); return !!e && !e.hidden; })()`, 8000);
  ok(up1 && gone1 && up2, '④ refused (Accessibility) ⇒ the banner; the machine takes input again (its count 5 → 9, no newer refusal) ⇒ it goes; refused again ⇒ it is back', { up1, gone1, up2 });
  await p.shot('tcc-banner.png', WIN);
  await p.ev(`window.__inj = null; window.__startTcc = 'granted'`);
  await p.ev(`[...document.querySelectorAll('${WIN} .desktop-strip-seg')].find((b) => b.dataset.key === ${JSON.stringify(D2.id)}).click()`);
  const gone2 = await p.until(`document.querySelector('${WIN} .desktop-strip-tcc').hidden`, 15000);
  ok(gone2 && !(await shown()), '④ a start whose facts say Accessibility granted (the switch to display 2) ⇒ the banner goes', { gone2 });
  await p.ev("localStorage.removeItem('vibespace.desktopModes')");
  await p.close();
}

console.log('THE OPENSPEC: a reload, another device');
{
  await untilN(async () => (await live()).length === 0, 5000);
  const p = await page(1280, 800, DESK);
  const tag = await p.ev(`(() => { let d = localStorage.getItem('vibespace.deviceTag'); if (!d) { d = 'dtest00001'; localStorage.setItem('vibespace.deviceTag', d); } return d; })()`);
  // this device's ② window comes back streaming in its mode
  const SPEC = { action: 'openMachineDesktop', hostId: 'win-a', label: 'WIN-DESK1', setup: 'win32' };
  await p.ev(`window.__replay(${JSON.stringify({ ...SPEC, mode: 'all', by: tag })}, 'win-restored-1')`);
  const mine = (await playingIn(p, WIN, 2)) && (await untilN(async () => (await live()).length === 2, 8000));
  const w1 = (await p.ev('window.__wins()'))[0] || {};
  ok(mine && w1.id === 'win-restored-1' && w1.mode === 'all', 'a replay by THIS device (a reload): the window comes back under its own id, in its mode (②: both displays streaming)', w1);
  await p.ev('window.__closeAll()');
  await untilN(async () => (await live()).length === 0, 5000);
  // another device's waits for a press
  await p.ev(`window.__replay(${JSON.stringify({ ...SPEC, mode: 'switch', display: D2.id, by: 'dsomeone99' })}, 'win-restored-2')`);
  const card = await p.until(`/WIN-DESK1 的桌面在另一台设备上打开过/.test((document.querySelector('${WIN} .desktop-display-say') || {}).textContent || '')`, 5000);
  await sleep(1500);
  const quiet0 = (await live()).length === 0 && !(await p.ev(`!!document.querySelector('${WIN} .stream-video')`));
  ok(card && quiet0, 'another device\'s window (a layout replayed from elsewhere): 「WIN-DESK1 的桌面在另一台设备上打开过」 + 「在这里显示」 — no stream until the press', { card, quiet0 });
  await p.shot('restore.png', WIN);
  await p.ev(`document.querySelector('${WIN} .desktop-display-say-act').click()`);
  const shown = (await playingIn(p, WIN)) && (await untilN(async () => same(await sourcesOf(), [D2.id]), 8000));
  ok(shown, '「在这里显示」 streams it here, on the display its openSpec names (DISPLAY2)', await sourcesOf());
  await p.ev('window.__closeAll()');
  await untilN(async () => (await live()).length === 0, 5000);
  // a replayed window whose stream is refused never asks the sign-in by itself
  fs.renameSync(FF.exe, FF.exe + '.away');
  await dm.streamFacts({ force: true }).catch(() => null);
  await p.ev(`window.__replay(${JSON.stringify({ ...SPEC, mode: 'switch', by: tag })}, 'win-restored-3')`);
  const ask = await p.until(`/没有串流/.test((document.querySelector('${WIN} .desktop-display-ask') || {}).textContent || '')`, 15000);
  await sleep(800);
  const noDialog = !(await p.ev(`!!document.querySelector('#machine-desktop-signin')`));
  await p.ev(`document.querySelector('${WIN} .desktop-display-ask button').click()`);
  const dialog = await p.until(`!!document.querySelector('#machine-desktop-signin input[type=password]')`, 10000);
  fs.renameSync(FF.exe + '.away', FF.exe);
  ok(ask && noDialog && dialog, 'a replayed window whose stream is refused (no ffmpeg) never asks the sign-in by itself: 「没有串流：…」 + 「显示 VNC 画面」, which asks it', { ask, noDialog, dialog });
  await p.close();
}
console.log('⑤ NEVER SILENT (lane stream-fallback-never-silent — incident inc-mvf7z2a3-9sxi): a playing stream never shows the VNC picture by itself');
{
  await untilN(async () => (await live()).length === 0, 5000);
  const p = await page(1280, 860, HALF, { tile: true });
  const signin = () => p.ev(`!!document.querySelector('#machine-desktop-signin')`);
  /** no VNC picture since the mark: no upstream to the machine's VNC server, no bridge in the hub's log, no sign-in */
  const noVnc = async (m) => vnc.seen.conns === m.conns && !hubLines.slice(m.lines).some((l) => /bridge opened/.test(l)) && !(await signin());
  const mark = () => ({ conns: vnc.seen.conns, lines: hubLines.length });
  const clock = (sel) => p.ev(`(() => { const v = document.querySelector(${JSON.stringify(sel + ' .stream-video')}); return v ? v.currentTime : -1; })()`);
  const say = () => p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-display-say'); return s ? { text: s.querySelector('span').textContent, buttons: [...s.querySelectorAll('button')].map((b) => b.textContent) } : null; })()`);
  const noteText = () => p.ev(`(() => { const n = document.querySelector('${WIN} .desktop-strip-note'); return n && !n.hidden ? n.textContent : ''; })()`);
  await p.ev(`window.__open(${JSON.stringify(M)}, { mode: 'switch' })`);
  await playingIn(p, WIN);
  await p.until(`(() => { const b = document.querySelector('${WIN} .desktop-strip-mode'); return !!b && !b.hidden; })()`, 8000);
  const m0 = mark();
  // THE OWNER'S SEQUENCE (the incident pack's action ring): the strip's MODE button → a mode → a display segment → a window's ×
  await p.ev(`document.querySelector('${WIN} .desktop-strip-mode').click()`);
  const picked = await pressMenu(p, '/每显示器一窗/');
  const two = (await p.until(`window.__wins().length === 2`, 8000)) && (await playingIn(p, WIN, 2)) && (await untilN(async () => (await live()).length === 2, 8000));
  const w2 = (await p.ev('window.__wins()')).find((w) => w.display === D2.id) || {};
  await p.ev(`(() => { const w = document.querySelector('${WIN}[data-id="${w2.id}"]'); ${byDisplay(WIN + '[data-id="' + w2.id + '"] .desktop-strip-seg', D1.id)}.click(); return !!w; })()`);
  await sleep(600);
  const each = await sourcesOf();
  ok(picked && two && same(each, [D1.id, D2.id].sort()), '⑤ the incident\'s sequence: MODE → 每显示器一窗 ⇒ a window for DISPLAY2; its display segment 1 only shows the first window — ONE session per display (never two on one)', { picked, two, each });
  const s1 = (await live()).find((s) => s.source && s.source.display === D1.id) || {};
  await p.ev(`window.__close(${JSON.stringify(w2.id)})`);
  await untilN(async () => same(await sourcesOf(), [D1.id]), 6000);
  fs.writeFileSync(DIE_N, '1'); // THE TRANSIENT under the first window (on the Mac: SCK -3805 the moment the sibling helper quit)
  const again = await untilN(async () => { const s = (await live()).find((x) => x.sid === s1.sid); return !!(s && s.stats && s.stats.screen && s.stats.screen.captureRestarts === 1); }, 8000);
  const c1 = await clock(WIN); await sleep(1500); const c2 = await clock(WIN);
  const live1 = await live();
  ok(again && live1.length === 1 && live1[0].sid === s1.sid && c2 > c1 + 0.5 && (await noVnc(m0)), `⑤ the second window closed and DISPLAY1's capture died under the first: the SAME session (${s1.sid}) captured it again in place — the first window still streams (its clock ${c1.toFixed(1)} → ${c2.toFixed(1)} s), no VNC bridge, no sign-in`, { again, live: live1.map((s) => [s.sid, s.source && s.source.display]), c1, c2, conns: vnc.seen.conns - m0.conns });
  await p.shot('never-silent-plays.png', WIN);
  // the source runs out of restarts (capture_interrupted) ⇒ the window says so and starts the same display again
  fs.writeFileSync(DIE_N, '3');
  const said = await p.until(`/串流中断：机器的屏幕采集一再中断——正在重新连接/.test((document.querySelector('${WIN} .desktop-strip-note') || {}).textContent || '')`, 12000);
  const back = (await untilN(async () => { const l = await live(); return l.length === 1 && l[0].sid !== s1.sid && l[0].source && l[0].source.display === D1.id; }, 10000)) && (await playingIn(p, WIN));
  ok(said && back && (await noVnc(m0)), '⑤ the source ran out of restarts (capture_interrupted): 「串流中断：机器的屏幕采集一再中断——正在重新连接…」 and the SAME display again 1 s on — it plays; no VNC bridge, no sign-in', { said, back, live: (await live()).map((s) => s.source && s.source.display) });
  // … and ends again within the minute ⇒ the person chooses; nothing starts by itself
  fs.writeFileSync(DIE_N, '3');
  const asked = await p.until(`(() => { const s = document.querySelector('${WIN} .desktop-display-say'); return !!s && s.querySelectorAll('button').length === 2; })()`, 15000);
  await sleep(2500);
  const ask = await say(), quiet1 = (await live()).length === 0 && (await noVnc(m0)), held = await p.ev(`!!document.querySelector('${WIN} .desktop-display-still')`);
  ok(asked && ask && ask.text === '串流中断：机器的屏幕采集一再中断' && same(ask.buttons, ['重试', '显示 VNC 画面']) && quiet1 && held, '⑤ ended again within the minute: 「串流中断：机器的屏幕采集一再中断」 over the last picture with TWO buttons 「重试」 「显示 VNC 画面」 — 2.5 s on nothing started by itself: no stream, no VNC bridge, no sign-in', { ask, quiet1, held, note: await noteText() });
  await p.shot('never-silent-ask.png', WIN);
  await p.ev(`document.querySelectorAll('${WIN} .desktop-display-say button')[0].click()`);
  const retried = (await untilN(async () => (await live()).length === 1, 8000)) && (await playingIn(p, WIN));
  ok(retried && !(await say()) && !(await p.ev(`!!document.querySelector('${WIN} .desktop-display-still')`)) && (await noVnc(m0)), '⑤ 「重试」 ⇒ the display streams again; the ask and the last picture go', { retried, ask: await say() });
  fs.writeFileSync(DIE_N, '3');
  const asked2 = await p.until(`(() => { const s = document.querySelector('${WIN} .desktop-display-say'); return !!s && s.querySelectorAll('button').length === 2; })()`, 15000);
  const quiet2 = await noVnc(m0);
  await p.ev(`document.querySelectorAll('${WIN} .desktop-display-say button')[1].click()`);
  const dialog = await p.until(`!!document.querySelector('#machine-desktop-signin input[type=password]')`, 10000);
  ok(asked2 && quiet2 && dialog && vnc.seen.conns > m0.conns, '⑤ ended again ⇒ asked again (still no VNC); 「显示 VNC 画面」 ⇒ the VNC picture — its sign-in — only on that press', { asked2, quiet2, dialog, conns: vnc.seen.conns - m0.conns });
  await p.close();
  fs.writeFileSync(DIE_N, '0');
  // a display REALLY gone (unplugged under its capture: two facts reads 1 s apart lack it) ⇒ the same display is refused ⇒ the main one
  await untilN(async () => (await live()).length === 0, 5000);
  const q = await page(1280, 800, DESK);
  await q.ev(`window.__open(${JSON.stringify(M)}, { mode: 'switch' })`);
  await playingIn(q, WIN);
  await q.until(`document.querySelectorAll('${WIN} .desktop-strip-displays:not([hidden]) .desktop-strip-seg').length === 3`, 8000);
  const m1 = { conns: vnc.seen.conns, lines: hubLines.length };
  const sw0 = (await live())[0] || {};
  await q.ev(`${byDisplay(WIN + ' .desktop-strip-seg', D2.id)}.click()`);
  const onD2 = (await untilN(async () => same(await sourcesOf(), [D2.id]), 10000)) && (await playingIn(q, WIN));
  const switched = hubLines.slice(m1.lines).some((l) => l.includes(`session ${sw0.sid} stopped (switched)`));
  ok(onD2 && switched && (await live()).length === 1, '⑤ a display switch leaves ONE session — the old one stopped `switched` (the hub\'s log says so)', { onD2, switched, live: (await live()).length });
  fs.writeFileSync(FACTS, factsLine([D1])); // DISPLAY2 unplugged …
  fs.writeFileSync(DIE_N, '1'); // … under its capture
  const main = (await untilN(async () => same(await sourcesOf(), [D1.id]), 15000)) && (await playingIn(q, WIN));
  const qSignin = await q.ev(`!!document.querySelector('#machine-desktop-signin')`);
  ok(main && vnc.seen.conns === m1.conns && !qSignin && hubLines.slice(m1.lines).some((l) => /stopped \(display_gone\)/.test(l)), '⑤ DISPLAY2 really gone (display_gone after two reads): the same display again is refused ⇒ the MAIN display streams — no VNC bridge, no sign-in', { main, src: await sourcesOf(), conns: vnc.seen.conns - m1.conns });
  fs.writeFileSync(FACTS, factsLine([D1, D2]));
  await q.ev("localStorage.removeItem('vibespace.desktopModes')");
  await q.close();
  fs.writeFileSync(DIE_N, '0');
}
console.log('⑤ RED CONTROL: the pre-lane fallback');
{
  await untilN(async () => (await live()).length === 0, 5000);
  await dm.streamFacts({ force: true }).catch(() => null);
  const p = await page(1280, 800, DESK, { at: '/oldfallback' });
  await p.ev(`window.__open(${JSON.stringify(M)}, { mode: 'switch' })`);
  await playingIn(p, WIN);
  const c0 = vnc.seen.conns;
  fs.writeFileSync(DIE_N, '3');
  const dialog = await p.until(`!!document.querySelector('#machine-desktop-signin')`, 15000);
  ok(dialog && vnc.seen.conns > c0, '⑤ RED CONTROL: the pre-lane fallback (the ladder never asked) — the same ending opens the VNC picture by itself (its sign-in on the screen, an upstream to the VNC server): the incident', { dialog, conns: vnc.seen.conns - c0 });
  fs.writeFileSync(DIE_N, '0');
  await p.close();
}
ok((await live()).length === 0, 'every window closed ⇒ no stream session left on the hub');
hub.shutdown();
console.log('⑥ THE STALL (lane stream-leg-flap — the owner\'s two displays sat black at «串流 · 2 个显示器 · 0 fps», 2026-10-20)');
{
  await untilN(async () => (await live()).length === 0, 5000);
  const SM = require(path.join(REPO, 'src/stream-model.js'));
  // THE BLACK HOLE: a relay-only hub over the device link whose links opened BEFORE it is armed drop the machine's RTP once it
  // is (STUN, DTLS, RTCP pass — ICE stays connected and the machine keeps sending: the owner's black «0 fps» on this box);
  // a session offered after it is whole. The hub module is the shipped one; only its device handle's onData is wrapped.
  const isRtp = (q) => q.length > 1 && (q[0] & 0xc0) === 0x80 && !(q[1] >= 192 && q[1] <= 223);
  async function stallRun(at) {
    const hole = { armed: false, dropped: 0 };
    const holed = (h) => {
      const mine = !hole.armed;
      let fn = null, rest = new Uint8Array(0);
      const filtered = (d) => {
        const all = new Uint8Array(rest.length + d.length); all.set(rest); all.set(d, rest.length);
        const u = SM.relayUnframe(all); rest = new Uint8Array(u.rest);
        const keep = u.frames.filter((f) => { if (mine && hole.armed && isRtp(f.payload)) { hole.dropped++; return false; } return true; });
        if (fn && keep.length) fn(Buffer.concat(keep.map((f) => Buffer.from(SM.relayFrame(f.ip, f.port, f.payload)))));
      };
      const own = Object.getOwnPropertyDescriptor(h, 'onData'); // the link's handle keeps its reader in a setter (src/agentd/client.js tcpForward)
      Object.defineProperty(h, 'onData', { configurable: true, get: () => fn, set: (f) => { fn = f; own.set.call(h, f ? filtered : f); } });
      return h;
    };
    const holeAccess = { streamRung: async (...a) => { const v = await access.streamRung(...a); return v && v.take && v.dm ? { ...v, dm: new Proxy(v.dm, { get: (o, k) => (k === 'tcpForward' ? async (...x) => holed(await o.tcpForward(...x)) : typeof o[k] === 'function' ? o[k].bind(o) : o[k]) }) } : v; } };
    const stallHub = DW.create({ access: holeAccess, direct: false, udpLeg: false, log: rec });
    R.setup({ access, stream: bridge, vnc: { status: async () => ({ available: true, running: false }) }, webrtc: stallHub });
    const p = await page(1280, 800, DESK, { at });
    const chip = () => p.ev(`(document.querySelector('${WIN} .desktop-strip-status') || {}).textContent || ''`);
    const says = () => p.ev(`[...document.querySelectorAll('${WIN} .desktop-display-say span')].map((s) => s.textContent)`);
    await p.ev(`window.__open(${JSON.stringify(M)}, { mode: 'all' })`);
    const both = (await playingIn(p, WIN, 2)) && (await untilN(async () => (await live()).length === 2, 10000));
    const first = (await live()).map((s) => s.key);
    const vncAt = vnc.seen.conns, l0 = hubLines.length;
    hole.armed = true; const t0 = Date.now();
    const black = await p.until(`/^串流 · 2 个显示器 · 0 fps$/.test((document.querySelector('${WIN} .desktop-strip-status') || {}).textContent || '')`, 9000);
    const blackChip = await chip();
    const said = await p.until(`[...document.querySelectorAll('${WIN} .desktop-display-say span')].filter((s) => /^串流中断：画面不再传过来——正在重新连接…$/.test(s.textContent)).length === 2`, SM.STREAM_LIMITS.stallMs + 6000);
    const saidMs = Date.now() - t0, saidWords = await says();
    const again = said && (await untilN(async () => { const l = await live(); return l.length === 2 && l.every((s) => !first.includes(s.key)); }, 15000)) && (await p.until(`[...document.querySelectorAll('${WIN} .stream-video')].filter((v) => v.videoWidth === 1280 && v.currentTime > 0.2).length === 2 && !document.querySelector('${WIN} .desktop-display-say')`, 25000));
    if (again) await p.until(`/^串流 · 2 个显示器 · [1-9]\\d* fps$/.test((document.querySelector('${WIN} .desktop-strip-status') || {}).textContent || '')`, 8000); // the new views' first second of numbers
    const lines = hubLines.slice(l0);
    const r = { both, black, blackChip, said, saidMs, saidWords, again, stalled: lines.filter((l) => / stopped \(stalled\)$/.test(l)).length, offered: lines.filter((l) => / offered \(/.test(l)).length, dropped: hole.dropped, vnc: vnc.seen.conns - vncAt, chip: await chip() };
    if (at === '/') await p.shot('stall.png', WIN);
    await p.close(); stallHub.shutdown();
    R.setup({ access, stream: bridge, vnc: { status: async () => ({ available: true, running: false }) }, webrtc: hub });
    return r;
  }
  const S = await stallRun('/');
  ok(S.both && S.black && S.dropped > 100, `② both displays play over the relay; the machine's pictures then fall into the black hole (${S.dropped} RTP datagrams dropped, ICE still connected) — the chip reads the owner's «${S.blackChip}»`, S);
  ok(S.said && S.saidMs >= SM.STREAM_LIMITS.stallMs - 2000 && S.saidMs <= SM.STREAM_LIMITS.stallMs + 6000 && S.stalled === 2, `THE STALL: ${S.saidMs} ms after the pictures stopped (stallMs ${SM.STREAM_LIMITS.stallMs}) each pane says 「串流中断：画面不再传过来——正在重新连接…」 and both sessions end «stopped (stalled)» on the hub's record`, S);
  ok(S.again && S.offered === 2 && S.vnc === 0 && /^串流 · 2 个显示器 · [1-9]\d* fps$/.test(S.chip), `…and the window offers both displays again BY ITSELF (2 new sessions), both play, the words go — no VNC picture, nothing to press (${S.chip})`, S);
  const C = await stallRun('/nostall');
  ok(C.both && C.black && !C.said && C.stalled === 0 && C.offered === 0 && /^串流 · 2 个显示器 · 0 fps$/.test(C.chip), `RED CONTROL — the page without THE STALL rule in the same black hole: «${C.chip}» ${Math.round((SM.STREAM_LIMITS.stallMs + 6000) / 1000)} s on, nothing said, no session ended or offered (the owner's window)`, C);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
