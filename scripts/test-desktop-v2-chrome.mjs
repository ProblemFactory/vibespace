#!/usr/bin/env node
// lane desktop-v2-entry HEAVY (design q-030 P0 — owner 2026-10-12 "应该允许选择显示器…桌面不再直接打开一个本地桌面，而是选择本地
// 或者remote"): the Desktop picker + ONE display of a paired Windows machine, end to end on this box. The REAL agentd bundle
// runs as a Windows-shaped device (its hello and the display-facts op say win32; a fixture powershell.exe on its PATH prints
// the AllScreens table the real script prints — two 1280×800 screens side by side). A stub RFB server stands in for its
// TightVNC: a 2560×800 framebuffer (screen 1 red with a white mark, screen 2 green with an orange mark), the VNC-password
// sign-in, ExtendedDesktopSize (-308) with the two screen rects, each incremental update answered after `delayMs`; it
// records every PointerEvent and every session. The hub half: the real access layer + routes + the ONE picture bridge; the
// page: the real src/lib/desktop-picker.js + machine-desktop.js + vnc-view.js with the BUILT (patched) public/novnc.js in
// headless Chrome (zh), desk 1280 px and phone 390 px:
//   ① the picker: 本机 (VibeSpace 虚拟桌面) + 远程 (WIN-DESK1 就绪); no recent row yet                      picker.png
//   ② a press opens the window: the sign-in is asked; the strip reads [WIN-DESK1 ▾] [1 · 2 · 全部] [⤢ 全屏] [已连接 …]
//   ③ 2: ONLY the second display's pixels are drawn (the whole canvas against the stub's pattern)     display2.png, strip.png
//   ④ a click at the picture's centre arrives at the second display's centre on the machine (the viewport offset)
//   ⑤ 1 · 全部 switch with ONE session on the server; 全部 restores the whole framebuffer
//   ⑥ the stats: 已连接 · N ms · F fps; the stub's 200 ms update delay reads as an update round trip of 190–450 ms
//   ⑦ reload: the picker's FIRST row is the last choice (WIN-DESK1 · 2 …); Enter opens it on display 2 — the sign-in asked again
//   ⑧ the Apps dialog's machine: "打开它的桌面 → 桌面" shows the window at once and becomes the picker's recent choice
//   ⑨ people only: the displays / link routes and the bridge refuse an agent token by name (human_only)
//   ⑩ phone 390: the picker is a bottom sheet; the window's strip is ONE row                               phone.png
//   ⑫ lane win-desktop-cursor-hdr (owner 2026-10-13 "鼠标如此巨大"), DPR 2: the stub sends a 96 px pointer (Cursor
//      pseudo-encoding, hotspot 24,12) over display 2 at view scale 0.5 ⇒ the canvas's CSS cursor image decodes to 48×48 with
//      the hotspot 12 6; a smaller window (scale 0.375) redraws it at 36; the stats row names the path   cursor-after.png
//   ⑬ a 256 px pointer ⇒ the machine paints it: a second SetEncodings without -239 / VMware on the SAME session, a 3 px dot
//      here, the stats row says so — and the reconnect's first SetEncodings leaves them out too
//   ⑭ HDR (the fixture's DISPLAY2 hdr 1, DISPLAY1 hdr 0): 「HDR 已开 · 画面会偏白」 with the remedy title on 2 and on 全部,
//      nothing on 1                                                                                       hdr-chip.png
//   ⑪ RED CONTROL: noVNC built WITHOUT the patch (scripts/build-novnc.mjs --unpatched) ⇒ ③'s crop predicate fails, and the
//      96 px pointer stays 96 px at scale 0.5 (DPR 2)                                                    cursor-before.png
//   ⑮ lane heavy3-flake-races (the ②③④ / ⑫ flake of rel276, now named): THE TABLE LANDS LATE — the machine's display table
//      (GET …/displays, through the agent) is HELD on the hub while the -308 rects draw the strip: the names are not there yet
//      (② waits for them now — RED CONTROL: the old read right after 已连接 sees 显示器 1 / 显示器 2); 2 is pressed, then the
//      table is released ⇒ display 2 STAYS drawn (carryPick: the RFB id → the OS id at the same place); RED CONTROL: the
//      pre-fix machine-desktop.js falls back to the whole 2560 px framebuffer the moment the names arrive
// PNGs when `--shots <dir>`.
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
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
const root = scratch('dv2');
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
const FACTS = { t: 'displays', origin: 'top-left', aware: 1, rows: [{ id: '\\\\.\\DISPLAY1', name: 'DELL P2419H', x: 0, y: 0, w: 1280, h: 800, scale: 1, primary: 1, hdr: 0 }, { id: '\\\\.\\DISPLAY2', name: 'LG 27UL', x: 1280, y: 0, w: 1280, h: 800, scale: 1, primary: 0, hdr: 1 }] };
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
  const seen = { pointers: [], sessions: 0, authed: 0, encs: [] };
  const st = { delayMs: 40, cursor: null }; // cursor: {side, hx, hy} — sent once per change to a session that offered -239
  const u16 = (n) => Buffer.from([(n >> 8) & 255, n & 255]);
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
  const s32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
  const rect = (x, y, w, h, enc) => Buffer.concat([u16(x), u16(y), u16(w), u16(h), s32(enc)]);
  const SCREENS = Buffer.concat([Buffer.from([2, 0, 0, 0]), u32(1), u16(0), u16(0), u16(HALF), u16(FH), u32(0), u32(2), u16(HALF), u16(0), u16(HALF), u16(FH), u32(0)]);
  const full = (c) => {
    const rs = [];
    if (c.ext && !c.screensSent) { c.screensSent = true; rs.push(Buffer.concat([rect(0, 0, FW, FH, -308), SCREENS])); }
    rs.push(Buffer.concat([rect(0, 0, FW, FH, 0), frame]));
    c.sock.write(Buffer.concat([Buffer.from([0, 0]), u16(rs.length), ...rs]));
  };
  // lane win-desktop-cursor-hdr: the Cursor pseudo-encoding (-239): w·h RGBX pixels + the 1-bit mask; an arrow, black edge, white
  const cursorRect = (c) => {
    const k = st.cursor;
    if (!k || c.cursorSent === k || !(c.encs || []).includes(-239)) return null;
    c.cursorSent = k;
    const n = k.side, pix = Buffer.alloc(n * n * 4), mask = Buffer.alloc(Math.ceil(n / 8) * n);
    const inside = (x, y) => y < n * 0.9 && x <= y * 0.62;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 3, y) || !inside(x + 3, y) || !inside(x, y + 3) || !inside(x, y - 3);
      pix.fill(edge ? 0 : 255, (y * n + x) * 4, (y * n + x) * 4 + 3);
      mask[y * Math.ceil(n / 8) + (x >> 3)] |= 0x80 >> (x & 7);
    }
    return Buffer.concat([rect(k.hx, k.hy, n, n, -239), pix, mask]);
  };
  const tick = (c) => { const cr = cursorRect(c); c.sock.write(Buffer.concat([Buffer.from([0, 0]), u16(cr ? 2 : 1), rect(0, 0, 1, 1, 0), Buffer.from([...C1, 0]), ...(cr ? [cr] : [])])); };
  const conns = new Set();
  const server = net.createServer((sock) => {
    const c = { sock, stage: 0, buf: Buffer.alloc(0), ext: false, full: false, timer: null };
    conns.add(c); sock.on('error', () => { }); sock.on('close', () => { clearTimeout(c.timer); conns.delete(c); });
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
        if (t === 2) { c.encs = []; for (let i = 0; i < b.readUInt16BE(2); i++) { c.encs.push(b.readInt32BE(4 + 4 * i)); if (b.readInt32BE(4 + 4 * i) === -308) c.ext = true; } seen.encs.push({ session: seen.sessions, cursor: c.encs.includes(-239), vmware: c.encs.includes(0x574d5664) }); }
        if (t === 5) seen.pointers.push({ mask: b[1], x: b.readUInt16BE(2), y: b.readUInt16BE(4), at: Date.now() });
        if (t === 3) { if (!b[1] || !c.full) { c.full = true; full(c); } else if (!c.timer) c.timer = setTimeout(() => { c.timer = null; if (!sock.destroyed) tick(c); }, st.delayMs); }
        c.buf = b.subarray(need);
      }
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, seen, st, drop: () => { for (const c of conns) c.sock.destroy(); } })));
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
window.__closeAll = () => { for (const id of [...wm.windows.keys()]) wm.closeWindow(id); };
window.__desktopView = () => [...wm.windows.values()].map((w) => w._desktopView).find(Boolean) || null;`;
// ⑮'s RED control: the page with the PRE-FIX machine-desktop.js (no carry — a pick keyed by the RFB id dies at the remap)
const CARRY = '    const carried = carryPick(prev, map, want);\n    if (carried !== want) { want = carried; rememberDesktop(m.hostId, want); }\n';
const preFix = { name: 'pre-fix-carry', setup(b) { b.onLoad({ filter: /machine-desktop\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(CARRY)) throw new Error('the carry lines moved'); return { contents: src.replace(CARRY, ''), loader: 'js' }; }); } };
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-prefix.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [preFix] });
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
// the mutant: noVNC built without the patch (the shipped build script's own --unpatched switch)
const MUTANT = path.join(root, 'novnc-unpatched.js');
execFileSync(process.execPath, [path.join(REPO, 'scripts/build-novnc.mjs'), MUTANT, '--unpatched'], { cwd: REPO, stdio: 'pipe' });
let novncFile = NOVNC;
const app = express(); app.use(express.json());
// ⑮ (lane heavy3-flake-races): while `dhold.on` the machine's display table waits here — the late table made deterministic
const dhold = { on: false, held: [] };
app.use((q, s, next) => { if (dhold.on && q.path === '/api/desktop/machine-desktop/displays') { dhold.held.push(next); return; } next(); });
const dRelease = () => { dhold.on = false; for (const f of dhold.held.splice(0)) f(); };
app.use(R.router);
const CSS = ['style', 'viewers', 'chat', 'fonts'].filter((n) => fs.existsSync(path.join(REPO, `public/${n}.css`)));
for (const n of CSS) app.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
app.get('/page.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page.js'))));
app.get('/page-prefix.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-prefix.js'))));
app.get('/novnc.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(novncFile)));
const HTML = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-root);height:100vh;overflow:hidden}</style></head><body><script src="/page.js"></script></body></html>`;
app.get('/', (q, s) => s.type('text/html').send(HTML));
app.get('/prefix', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-prefix.js')));
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
async function page(w, h, winCss, dpr = 1, at = '/') {
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
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 600 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  const until = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
  const load = async () => { await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}${at}` }); await sleep(300); await until('typeof window.__picker === "function"', 10000); };
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
const NAMED = '1 · DELL P2419H|2 · LG 27UL|全部';
const DESK = 'position:fixed;left:30px;top:70px;width:1100px;height:600px;display:flex;flex-direction:column;background:var(--bg-window);border:1px solid var(--border);box-shadow:0 6px 24px rgba(0,0,0,.25);border-radius:8px;overflow:hidden;z-index:5';

console.log('① – ⑨ desk 1280 px');
{
  const p = await page(1280, 800, DESK);
  await p.ev('window.__picker()');
  await p.until(`!!document.querySelector('.desktop-picker-row[data-group="remote"]')`, 15000);
  const rows = await p.ev(`[...document.querySelectorAll('.desktop-picker > *')].map((e) => e.classList.contains('desktop-picker-group') ? '#' + e.textContent : e.classList.contains('desktop-picker-row') ? e.dataset.group + ':' + e.querySelector('.desktop-picker-name').textContent + '=' + e.querySelector('.desktop-picker-state').textContent : '~' + e.textContent)`);
  ok(JSON.stringify(rows) === JSON.stringify(['#本机', 'local:VibeSpace 虚拟桌面=就绪', '#远程', 'remote:WIN-DESK1=就绪']), '① the picker: 本机 (VibeSpace 虚拟桌面) + 远程 (WIN-DESK1 就绪), no recent row yet', rows);
  await p.shot('picker.png', '.desktop-picker');
  await p.ev(`document.querySelector('.desktop-picker-row[data-group="remote"]').click()`);
  const asked = await signIn(p);
  const up = await connected(p);
  const strip = await p.ev(`[...document.querySelector('${WIN} .desktop-strip').children].filter((e) => !e.hidden && !e.classList.contains('desktop-strip-hdr')).map((e) => e.classList.contains('desktop-strip-displays') ? [...e.children].map((b) => b.textContent).join(' · ') : e.classList.contains('desktop-strip-status') ? e.textContent.replace(/\\d+|—/g, 'N') : e.textContent)`);
  ok(asked && up && vnc.seen.authed === 1 && vnc.seen.sessions === 1 && JSON.stringify(strip) === JSON.stringify(['WIN-DESK1 ▾', '1 · 2 · 全部', '⤢ 全屏', '⌨ 捕获快捷键', '已连接 · N ms · N fps', '清晰']), '② the press opens the window: the sign-in asked; the strip [WIN-DESK1 ▾] [1 · 2 · 全部] [⤢ 全屏] [⌨ 捕获快捷键] [已连接 · N ms · N fps] [清晰] (P1 added ⌨ + the rung)', { asked, up, seen: { a: vnc.seen.authed, s: vnc.seen.sessions }, strip });
  // the machine's own table is an HTTP read through the agent, the -308 rects ride the first frame: either lands first
  // (⑮ holds the table to prove both orders) — the names are WAITED for, never read the moment the strip says 已连接
  await p.until(`[...document.querySelectorAll('${WIN} .desktop-strip-seg')].map((b) => b.title).join('|') === ${JSON.stringify(NAMED)}`, 10000);
  const titles = await p.ev(`[...document.querySelectorAll('${WIN} .desktop-strip-seg')].map((b) => b.title)`);
  ok(titles.join('|') === NAMED, '② the displays carry the machine\'s own names (the OS table agreed with the -308 rects)', titles);
  await seg(p, '2');
  const c2 = await cropOk(p);
  ok(c2.ok, '③ 2: ONLY the second display is drawn — a 1280×800 canvas, every pixel the stub\'s screen-2 pattern (0 off, 0 from screen 1)', c2.r);
  await p.shot('display2.png', WIN); await p.shot('strip.png', `${WIN} .desktop-strip`);
  // ④ a click at the picture's centre → the machine's second display's centre
  const box = await p.ev(`(() => { const b = document.querySelector('${WIN} canvas').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
  await p.click(box[0] + box[2] - 4, box[1] + 4); await sleep(150); // a warm-up press (a fresh target's first press only focuses)
  const n0 = vnc.seen.pointers.length;
  await p.click(box[0] + box[2] / 2, box[1] + box[3] / 2);
  const t0 = Date.now(); let press = null;
  while (!press && Date.now() - t0 < 5000) { press = vnc.seen.pointers.slice(n0).find((e) => e.mask & 1); if (!press) await sleep(50); }
  const tol = Math.ceil(1280 / box[2]) + 1;
  ok(press && Math.abs(press.x - (HALF + 640)) <= tol && Math.abs(press.y - 400) <= tol, `④ a click at the picture's centre arrives at (${HALF + 640}, 400) on the machine — the viewport offset carried (±${tol})`, { press, box });
  await seg(p, '1');
  const c1 = await (async () => { await sleep(400); return p.ev(PATTERN(1)); })();
  await seg(p, '全部');
  await sleep(400);
  const all = await p.ev(PATTERN('all'));
  ok(c1 && c1.W === 1280 && c1.bad === 0 && all && all.W === 2560 && all.H === 800 && all.bad === 0 && vnc.seen.sessions === 1, '⑤ 1 shows screen 1 only, 全部 restores the whole 2560×800 framebuffer — ONE session on the server through every switch', { c1, all, sessions: vnc.seen.sessions });
  // ⑥ the stats: the stub answers each update 200 ms late
  vnc.st.delayMs = 200;
  await sleep(7500);
  const chip = await p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-strip-status'); return { text: s.textContent, title: s.title }; })()`);
  const trip = Number((/更新往返 (\d+) ms/.exec(chip.title) || [])[1]);
  const fps = Number((/· (\d+) fps$/.exec(chip.text) || [])[1]);
  ok(/^已连接 · \d+ ms · \d+ fps$/.test(chip.text) && trip >= 190 && trip <= 450 && fps >= 2 && fps <= 6 && /浏览器 ⇄ hub \d+ ms · hub ⇄ 机器 \d+ ms/.test(chip.title), `⑥ the stats strip: ${chip.text}; a 200 ms server delay reads as an update round trip of ${trip} ms at ${fps} fps; both link numbers measured`, chip);
  vnc.st.delayMs = 40;
  // ⑦ reload: the last choice is the picker's FIRST row; Enter opens it on display 2, the sign-in asked again
  await seg(p, '2');
  await p.load();
  await p.ev('window.__picker()');
  await p.until(`!!document.querySelector('.desktop-picker-row[data-group="remote"]')`, 15000);
  const first = await p.ev(`(() => { const r = document.querySelector('.desktop-picker-row'); return { group: r.dataset.group, name: r.querySelector('.desktop-picker-name').textContent, focused: document.activeElement === r }; })()`);
  ok(first.group === 'recent' && first.name === 'WIN-DESK1 · 2 LG 27UL' && first.focused, '⑦ after a reload the picker\'s FIRST row is the last choice (WIN-DESK1 · 2 LG 27UL), focused', first);
  await p.key('Enter', 'Enter', 13);
  const again = await signIn(p);
  await connected(p);
  const c2b = await cropOk(p);
  ok(again && vnc.seen.authed === 2 && c2b.ok, '⑦ Enter opens it straight on display 2 — and the sign-in is asked again (design 014 D1: nothing kept)', { again, authed: vnc.seen.authed, r: c2b.r });
  // ⑧ the Apps dialog: its machine's desktop is a link to the Desktop picker now
  await p.ev('window.__closeAll()');
  await p.ev(`window.__dialog(${JSON.stringify({ hostId: 'win-a', label: 'WIN-DESK1', code: 'desktop_ready', auth: 'vnc', setup: 'win32', desktop: 'vnc-native', selectable: true })})`);
  const link = await p.ev(`[...document.querySelectorAll('#machine-desktop-dialog button')].map((b) => b.textContent).filter((x) => /桌面/.test(x))`);
  await p.ev(`[...document.querySelectorAll('#machine-desktop-dialog button')].find((b) => b.textContent === '打开它的桌面 → 桌面').click()`);
  const asked8 = await signIn(p);
  const up8 = await connected(p);
  const focus = await p.ev(`(() => ({ dialog: !!document.getElementById('machine-desktop-dialog'), windows: document.querySelectorAll('${WIN}').length, recent: JSON.parse(localStorage.getItem('vibespace.desktopRecent') || 'null') }))()`);
  ok(JSON.stringify(link) === JSON.stringify(['打开它的桌面 → 桌面']) && !focus.dialog && focus.windows === 1 && asked8 && up8 && focus.recent && focus.recent.hostId === 'win-a', '⑧ the Apps dialog keeps app launching; its "打开它的桌面 → 桌面" closes it and shows the window at once (sign-in asked) — and the Desktop picker remembers it as the recent choice', { link, focus, asked8, up8 });
  p.close();
}
console.log('⑨ people only');
{
  const ask = async (u, auth) => { const r = await fetch(`http://127.0.0.1:${PORT}${u}`, { headers: auth ? { Authorization: 'Bearer vsst_agent' } : {} }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const own = await ask('/api/desktop/machine-desktop/displays?host=win-a');
  const agent = await ask('/api/desktop/machine-desktop/displays?host=win-a', true);
  const agentLink = await ask('/api/desktop/machine-desktop/link?host=win-a', true);
  const ownLink = await ask('/api/desktop/machine-desktop/link?host=win-a');
  ok(own.status === 200 && own.body.ok && own.body.displays.map((d) => `${d.name}@${d.x},${d.y}`).join('|') === 'DELL P2419H@0,0|LG 27UL@1280,0' && ownLink.status === 200 && Number.isFinite(ownLink.body.device), '⑨ the person: the machine\'s table through the real agent (DeviceName prefix gone) and a measured hub ⇄ machine round trip', { own, ownLink });
  ok(agent.status === 403 && agent.body.code === 'human_only' && agentLink.status === 403 && agentLink.body.code === 'human_only', '⑨ an agent token: both new routes refuse by name (human_only)', { agent, agentLink });
  const wsr = await new Promise((resolve) => {
    const w = new WebSocket(`ws://127.0.0.1:${PORT}/api/desktop/machine-desktop.win-a/stream`, { headers: { Authorization: 'Bearer vsst_agent' } });
    w.on('unexpected-response', (req, res) => { resolve(res.statusCode); req.destroy(); w.terminate(); });
    w.on('open', () => { resolve('open'); w.terminate(); }); w.on('error', () => resolve('error'));
  });
  ok(wsr === 403, '⑨ the bridge refuses an agent token for the machine\'s picture (403 human_only)', wsr);
}
console.log('⑩ phone 390');
{
  const p = await page(390, 844, 'position:fixed;left:0;top:0;width:390px;height:844px;display:flex;flex-direction:column;background:var(--bg-window);overflow:hidden;z-index:5');
  await p.ev('window.__picker()');
  await p.until(`!!document.querySelector('.desktop-picker-row[data-group="remote"]')`, 15000);
  const sheet = await p.ev(`(() => { const b = document.querySelector('.desktop-picker').getBoundingClientRect(); return { sheet: document.querySelector('.desktop-picker').classList.contains('desktop-picker-sheet'), left: b.left, right: b.right, bottom: Math.round(b.bottom) }; })()`);
  ok(sheet.sheet && sheet.left === 0 && sheet.right === 390 && sheet.bottom === 844, '⑩ the phone\'s picker is a bottom sheet (full width, on the bottom edge)', sheet);
  await p.ev(`document.querySelector('.desktop-picker-row').click()`);
  await signIn(p);
  await connected(p);
  await sleep(500);
  const row = await p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-strip'); const kids = [...s.children].filter((e) => !e.hidden).map((e) => e.getBoundingClientRect()); return { h: Math.round(s.getBoundingClientRect().height), oneRow: Math.max(...kids.map((r) => r.top)) < Math.min(...kids.map((r) => r.bottom)), scrolls: s.scrollWidth > s.clientWidth }; })()`);
  ok(row.oneRow && row.h <= 34, '⑩ the window\'s strip on a phone is ONE row (it scrolls sideways when it must)', row);
  await p.shot('phone.png');
  p.close();
}
// lane win-desktop-cursor-hdr: the canvas's CSS cursor (what Chrome draws for the machine's pointer) decoded in the page
const CURSOR = `(async () => { const cv = document.querySelector('${WIN} canvas'); if (!cv) return null; const cs = getComputedStyle(cv).cursor; const m = /url\\("?(data:[^")]+)"?\\)\\s*(\\d+)\\s+(\\d+)/.exec(cs); if (!m) return { css: cs.slice(0, 60) }; const im = new Image(); im.src = m[1]; await im.decode(); const v = window.__desktopView && window.__desktopView(); return { w: im.naturalWidth, h: im.naturalHeight, hot: m[2] + ' ' + m[3], scale: Math.round(v.rfb._display.scale * 1000) / 1000, dpr: devicePixelRatio, url: m[1] }; })()`;
// the window sized so display 2 (1280×800) is drawn at `pw` px wide (scale pw / 1280)
const sizeWin = (p, pw) => p.ev(`(() => { const w = document.querySelector('${WIN}'); w.style.width = '${pw + 2}px'; w.style.height = '${Math.round(pw * 0.625) + 230}px'; return true; })()`);
const cursorIs = (p, side) => p.until(`(async () => { const r = await ${CURSOR}; return !!r && r.w === ${side}; })()`, 8000);
// a headless screenshot has no mouse: the CSS cursor image is laid where the pointer would be (its hotspot on the picture's centre)
const showPointer = (p, r) => p.ev(`(() => { const b = document.querySelector('${WIN} canvas').getBoundingClientRect(); const i = document.createElement('img'); i.id = 'shot-pointer'; i.src = ${JSON.stringify((r && r.url) || '')}; const [hx, hy] = ${JSON.stringify(((r && r.hot) || '0 0').split(' ').map(Number))}; i.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;left:' + (b.left + b.width / 2 - hx) + 'px;top:' + (b.top + b.height / 2 - hy) + 'px;width:${(r && r.w) || 0}px;height:${(r && r.h) || 0}px'; document.body.append(i); return true; })()`);
const CURSOR_DESK = DESK.replace('width:1100px;height:600px', 'width:642px;height:630px');
console.log('⑫ – ⑭ the pointer at the picture\'s scale (DPR 2) + the HDR chip');
{
  vnc.st.cursor = null; vnc.st.delayMs = 40;
  const p = await page(1280, 800, CURSOR_DESK, 2);
  await p.ev('window.__picker()');
  await p.until(`!!document.querySelector('.desktop-picker-row[data-group="remote"]')`, 15000);
  await p.ev(`document.querySelector('.desktop-picker-row[data-group="remote"]').click()`);
  await signIn(p);
  await connected(p);
  await seg(p, '2');
  await sizeWin(p, 640);
  const sess = vnc.seen.sessions;
  vnc.st.cursor = { side: 96, hx: 24, hy: 12 };
  await cursorIs(p, 48);
  const c12 = await p.ev(CURSOR);
  await p.ev(`document.querySelector('${WIN} .desktop-strip-status').click()`);
  await sleep(1200);
  const words = await p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-strip-status'); const c = document.querySelector('${WIN} .desktop-strip-compare'); return { title: s.title, row: c.hidden ? '' : c.textContent }; })()`);
  ok(c12 && c12.w === 48 && c12.h === 48 && c12.hot === '12 6' && Math.abs(c12.scale - 0.5) < 0.005 && c12.dpr === 2 && /指针：在这里随画面缩放绘制，为原 96 px 的 50%/.test(words.title) && /指针：在这里随画面缩放绘制/.test(words.row),
    `⑫ a 96 px pointer (hotspot 24,12) over display 2 at scale ${c12 && c12.scale}, DPR 2 ⇒ the CSS cursor image is ${c12 && c12.w}×${c12 && c12.h}, hotspot ${c12 && c12.hot}; the stats row names the path`, { c12: c12 && { ...c12, url: undefined }, words });
  await p.ev(`document.querySelector('${WIN} .desktop-strip-status').click()`);
  await showPointer(p, c12);
  await p.shot('cursor-after.png', WIN);
  await p.ev(`document.getElementById('shot-pointer').remove()`);
  await sizeWin(p, 480);
  await cursorIs(p, 36);
  const c12b = await p.ev(CURSOR);
  ok(c12b && c12b.w === 36 && c12b.hot === '9 5' && Math.abs(c12b.scale - 0.375) < 0.005, `⑫ a smaller window (scale ${c12b && c12b.scale}) redraws the same pointer at ${c12b && c12b.w} px — no new image from the machine`, c12b && { ...c12b, url: undefined });
  // ⑬ a 256 px pointer: the machine paints it
  const before13 = vnc.seen.encs.length;
  vnc.st.cursor = { side: 256, hx: 8, hy: 8 };
  const again = await p.until(`(() => { const c = document.querySelector('${WIN} .desktop-strip-status'); return /由机器画进画面/.test(c.title); })()`, 8000);
  await sleep(600);
  const resent = vnc.seen.encs.slice(before13);
  const c13 = await p.ev(CURSOR);
  const title13 = await p.ev(`document.querySelector('${WIN} .desktop-strip-status').title`);
  ok(again && resent.length >= 1 && resent.every((e) => e.session === sess && !e.cursor && !e.vmware) && vnc.seen.sessions === sess && c13 && c13.w === 3 && /指针：由机器画进画面 —— 它的 256 px 指针太大，这里画不了/.test(title13),
    '⑬ a 256 px pointer ⇒ SetEncodings again on the same session, without the pointer pseudo-encodings (the machine paints it; the ladder\'s later rungs keep them out), a 3 px dot here, the stats row says so', { again, resent, sessions: vnc.seen.sessions, sess, c13: c13 && { w: c13.w, css: c13.css } });
  const enc0 = vnc.seen.encs.length;
  vnc.drop();
  const asked13 = await signIn(p);
  const up13 = await connected(p);
  const first = vnc.seen.encs.slice(enc0)[0];
  ok(asked13 && up13 && vnc.seen.sessions === sess + 1 && first && !first.cursor && !first.vmware, '⑬ the reconnect\'s first SetEncodings leaves the pointer pseudo-encodings out too (the choice lasts the window)', { up13, first, sessions: vnc.seen.sessions });
  // ⑭ the HDR chip
  await sizeWin(p, 1000);
  const hdr = async () => p.ev(`(() => { const h = document.querySelector('${WIN} .desktop-strip-hdr'); return h ? { shown: !h.hidden && h.getBoundingClientRect().width > 0, text: h.textContent, title: h.title } : null; })()`);
  await seg(p, '2'); await sleep(300);
  const h2 = await hdr();
  await p.shot('hdr-chip.png', `${WIN} .desktop-strip`);
  await seg(p, '1'); await sleep(300);
  const h1 = await hdr();
  await seg(p, '全部'); await sleep(300);
  const hAll = await hdr();
  ok(h2 && h2.shown && h2.text === 'HDR 已开 · 画面会偏白' && h2.title === 'Windows 的 HDR 画面被 TightVNC 原样抓取、没有色调映射；远程期间在 Windows 设置 › 显示 关闭"使用 HDR"（或按 Win+Alt+B 切换）' && h1 && !h1.shown && hAll && hAll.shown,
    '⑭ HDR: display 2 (hdr 1) shows 「HDR 已开 · 画面会偏白」 with the remedy; display 1 (hdr 0) nothing; 全部 (an HDR screen in it) shows it', { h2, h1, hAll });
  vnc.st.cursor = null;
  p.close();
}
console.log('⑮ the table lands late: 2 pressed on the -308 rects, then the machine\'s names arrive');
{
  const lateTable = async (at) => {
    const p = await page(1280, 800, DESK, 1, at);
    dhold.on = true;
    await p.ev('window.__picker()');
    await p.until(`!!document.querySelector('.desktop-picker-row[data-group="remote"]')`, 15000);
    await p.ev(`document.querySelector('.desktop-picker-row[data-group="remote"]').click()`);
    await signIn(p);
    const up = await connected(p);
    const t0 = Date.now(); while (!dhold.held.length && Date.now() - t0 < 10000) await sleep(50); // the window's one table read, held
    const held = dhold.held.length;
    const early = await p.ev(`[...document.querySelectorAll('${WIN} .desktop-strip-seg')].map((b) => b.title).join('|')`);
    await seg(p, '2');
    const two = await p.until(`(() => { const r = ${PATTERN(2)}; return !!r && r.W === 1280 && r.bad === 0; })()`, 8000);
    dRelease();
    const named = await p.until(`[...document.querySelectorAll('${WIN} .desktop-strip-seg')].map((b) => b.title).join('|') === ${JSON.stringify(NAMED)}`, 10000);
    // the names are drawn by the same apply() that set the crop: the view's own crop now is the verdict
    const after = await p.ev(`(() => { const v = window.__desktopView(); const b = [...document.querySelectorAll('${WIN} .desktop-strip-seg')].find((x) => x.getAttribute('aria-pressed') === 'true'); return { crop: v && v.crop, pressed: b ? b.textContent : null, recent: JSON.parse(localStorage.getItem('vibespace.desktopRecent') || 'null') }; })()`);
    const drawn = after.crop ? await p.until(`(() => { const r = ${PATTERN(2)}; return !!r && r.W === 1280 && r.bad === 0; })()`, 8000) : await p.until(`(() => { const r = ${PATTERN('all')}; return !!r && r.W === 2560 && r.bad === 0; })()`, 8000);
    p.close();
    return { up, held, early, two, named, after, drawn };
  };
  const f = await lateTable('/');
  ok(f.up && f.held === 1 && f.early === '显示器 1|显示器 2|全部' && f.two,
    '⑮ the table held: the strip draws off the -308 rects with no names yet (RED CONTROL for ②: the old read right after 已连接 sees 显示器 1 / 显示器 2), and 2 crops on them', f);
  ok(f.named && f.after.crop && f.after.crop.x === HALF && f.after.crop.w === HALF && f.after.pressed === '2' && f.after.recent && /DISPLAY2$/.test(String(f.after.recent.display)) && f.drawn,
    '⑮ released: the names arrive and display 2 STAYS drawn — the pick moved from the RFB id to the OS id at the same place (carryPick), and the recent choice names the OS id', f.after);
  const g = await lateTable('/prefix');
  ok(g.up && g.held === 1 && g.two && g.named && !g.after.crop && g.drawn,
    '⑮ RED CONTROL: the pre-fix machine-desktop.js drops the pick the moment the names arrive — the whole 2560 px framebuffer (the mirror\'s ③ {W:2560} and ④ press at x 1280)', g.after);
}
console.log('⑪ RED CONTROL: noVNC without the patch');
{
  novncFile = MUTANT;
  const p = await page(1280, 800, DESK, 2);
  await p.ev('window.__picker()');
  await p.until(`!!document.querySelector('.desktop-picker-row[data-group="remote"]')`, 15000);
  await p.ev(`document.querySelector('.desktop-picker-row[data-group="remote"]').click()`);
  await signIn(p);
  await connected(p);
  await seg(p, '2');
  const m = await cropOk(p);
  ok(!m.ok && m.r && m.r.W === 2560, '⑪ RED CONTROL: with noVNC built WITHOUT the patch the crop leg goes red (the canvas stays the whole 2560 px framebuffer)', m.r);
  // the whole 2560 px framebuffer in a window 1282 px wide = scale 0.5, as ⑫'s display 2 in 642
  await p.ev(`(() => { const w = document.querySelector('${WIN}'); w.style.width = '1282px'; w.style.height = '520px'; w.style.left = '0px'; return true; })()`);
  vnc.st.cursor = { side: 96, hx: 24, hy: 12 };
  await cursorIs(p, 96);
  const cm = await p.ev(CURSOR);
  ok(cm && cm.w === 96 && cm.hot === '24 12' && Math.abs(cm.scale - 0.5) < 0.005, `⑪ RED CONTROL: unpatched, the same 96 px pointer stays ${cm && cm.w} px at scale ${cm && cm.scale} (the owner's "鼠标如此巨大")`, cm && { ...cm, url: undefined });
  await showPointer(p, cm);
  await p.shot('cursor-before.png', WIN);
  vnc.st.cursor = null;
  p.close();
  novncFile = NOVNC;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
