#!/usr/bin/env node
// lane mac-ard-signin HEAVY (owner 2026-10-12 "连mac似乎不太成功" + inc-mv51w0ow-crw3): a paired Mac's whole desktop signs in
// from an INSECURE ORIGIN, end to end on this box. Measured on the owner's hub: the Mac's Screen Sharing greets
// `RFB 003.889`, offers ARD (type 30) first, noVNC picks it, asks the name + password, then encrypts them with WebCrypto —
// which an http://<hostname>:3456 page does not have; noVNC's async auth threw, nothing reached the Mac, 连接中… for 268 s.
// The REAL agentd bundle runs as a Mac-shaped device (its hello says darwin); a fixture ARD server stands in for Screen
// Sharing on the device's loopback: RFB 003.889, types [30, 2], 1024-bit DH params; it DECRYPTS the client's AES block
// with the shared secret and accepts the fixture's user/password (or, in `silent` mode, never answers). The hub half is
// the real access layer + routes + the ONE picture bridge; the page is the real src/lib/machine-desktop.js (+ vnc-view.js
// + noVNC) in headless Chrome (zh), served on the box's NON-LOOPBACK address — `window.isSecureContext === false` is
// asserted before any leg counts (a loopback / localhost page IS a secure context and proves nothing):
//   ① the machine's dialog over an Apps dialog: Open its desktop closes BOTH, the window opens, the sign-in is asked
//   ② name + password ⇒ 正在登录… ⇒ 已连接 and the fixture's frame drawn; the fixture read exactly the typed name + password
//   ③ a fixture that never answers ⇒ "登录没能完成：那台机器 20 秒内没有应答" + Reconnect at ~20 s     ④ the phone (390 px)
//   ⑤ RED control: the BASE vnc-view.js (e2a303c61) on the same insecure origin — 连接中… after the sign-in, nothing sent
//   ⑥ CONTROL: the same base page on 127.0.0.1 (a secure context) signs in — the loopback is blind to the bug
// lane heavy3-flake-races (the "words stay" flake of int274 / rel276, now named): the status record (WATCH) is armed AFTER the
// window opened, so its first word is whatever the connect gate left — 连接中… when the gate answered first, 正在启动桌面… when it
// had not (a loaded runner) — and the old `slice(1)` read the gate's own 连接中… as a re-ask. §3 holds the gate until the record
// is armed (that order, always) and judges "never 连接中… again" from the sign-in on; RED CONTROL: the old predicate.
// ci-355-red (the 2.369.355 runner: the control read ["连接中…","正在登录…",…]): ARMED = the record holds its first word. WATCH
// only STARTS it — its first look polls on 5 ms timers until the chip exists — and the gate used to answer the moment its POST
// arrived, so on a loaded page the answer outran that first look. §3 now holds the gate until the record's first word is in;
// §3b starves the first look (400 ms) and runs both release rules: on the POST's arrival ⇒ 连接中… first (the runner's
// record); on the armed record ⇒ 正在启动桌面… first.
// PNGs (when `--shots <dir>`): signin.png, connected.png, failed.png (desk 1100), phone.png (390).
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, scratch, endRootedProcesses, ONBOARDED_SOURCE } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
// the box's own non-loopback IPv4 (a LAN / tailnet / bridge address): the page served there is NOT a secure context
const IP = (() => { const all = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')); return (all.find((a) => /^(192\.168|10|100)\./.test(a.address)) || all[0] || {}).address || null; })();
if (!IP) { console.log('SKIP: this box has no non-loopback IPv4 address (an insecure origin needs one)'); process.exit(0); }
const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const NOVNC = path.join(REPO, 'public/novnc.js');
const BASE_SHA = 'e2a303c61'; // 2.369.257: the vnc-view.js the owner's page ran (no AES fallback, no sign-in status)
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const f of [BUNDLE, NOVNC]) if (!fs.existsSync(f)) { ok(false, `${path.relative(REPO, f)} exists (npm run build first)`); process.exit(1); }
// the zh words the page shows (the dictionary is the truth — the suite never retypes a translation)
const ZH = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default;
const Z = (k, vars = {}) => { const v = ZH[k]; if (!v) throw new Error(`no zh entry for ${JSON.stringify(k)}`); return v.replace(/\{(\w+)\}/g, (all, n) => (n in vars ? String(vars[n]) : all)); };

// ── the scratch device ──────────────────────────────────────────────────────────────────────────────────────────
const root = scratch('ardsi');
fs.mkdirSync(root, { recursive: true });
const realHome = process.env.HOME;
const started = [];
const rootOf = (h) => path.join(h, 'agentd-root');
let chrome = null, ard = null;
const servers = [];
const cleanup = () => {
  for (const h of started) { try { process.kill(Number(fs.readFileSync(path.join(rootOf(h), 'state', 'agentd.pid'), 'utf8')), 'SIGKILL'); } catch { /* gone */ } }
  try { chrome && chrome.kill('SIGKILL'); } catch { /* gone */ }
  for (const s of servers) { try { s.close(); } catch { /* gone */ } }
  try { ard && ard.server.close(); } catch { /* gone */ }
  try { endRootedProcesses(root); } catch { /* best effort */ }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const HELLO = /(op: "hello-ack",[\s\S]{0,200}?)platform: process\.platform,/;
ok(HELLO.test(bundleText), 'the bundle carries the hello-ack platform read (the Mac-shaped copy patches exactly that)');
fs.mkdirSync(path.join(root, 'bundle-mac'), { recursive: true });
fs.writeFileSync(path.join(root, 'bundle-mac', 'vibespace-agentd.js'), bundleText.replace(HELLO, (all, pre) => `${pre}platform: "darwin",`));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const macHome = path.join(root, 'mac'); fs.mkdirSync(macHome, { recursive: true });
async function deviceOn(h) {
  process.env.HOME = h; process.env.VIBESPACE_AGENTD_ROOT = rootOf(h);
  const dataDir = path.join(h, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
  started.push(h);
  const dm = new DeviceManager({ dataDir, bundlePath: path.join(root, 'bundle-mac', 'vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  try { await dm.connect(); } finally { process.env.HOME = realHome; delete process.env.VIBESPACE_AGENTD_ROOT; }
  return dm;
}
const dms = { 'mac-a': await deviceOn(macHome) };
ok((dms['mac-a'].status().info || {}).platform === 'darwin', 'a real agent whose hello says darwin (a Mac)');

// ── the Mac's Screen Sharing: RFB 003.889, ARD first, DH + AES-128-ECB over the name + password ─────────────────────
// RFC 2409 Oakley group 2 (1024-bit), generator 2 — the 128-byte key length the owner's Mac sent (260 B = 2 + 2 + 128 + 128)
const P = BigInt('0x' + 'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE65381FFFFFFFFFFFFFFFF');
const KEYLEN = 128;
const modPow = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; };
const toBuf = (n, len) => Buffer.from(n.toString(16).padStart(len * 2, '0'), 'hex');
const USER = 'mart', PASS = 'Sekr3t!x', FW = 1280, FH = 800, DESK = [30, 110, 200];
function paint() {
  const px = Buffer.alloc(FW * FH * 4);
  for (let i = 0; i < FW * FH; i++) { px[i * 4] = DESK[0]; px[i * 4 + 1] = DESK[1]; px[i * 4 + 2] = DESK[2]; }
  for (let y = 200; y < 600; y++) for (let x = 340; x < 940; x++) { const i = (y * FW + x) * 4; px[i] = 236; px[i + 1] = 236; px[i + 2] = 236; } // a Finder-ish window
  return px;
}
function ardServer() {
  const seen = { conns: 0, creds: [], refusedTypes: 0 };
  const frame = paint();
  const u16 = (n) => Buffer.from([(n >> 8) & 255, n & 255]);
  const st = { mode: 'accept' };
  const server = net.createServer((sock) => {
    seen.conns++;
    const c = { stage: 0, buf: Buffer.alloc(0), x: 0n };
    sock.on('error', () => { });
    sock.write('RFB 003.889\n');
    sock.on('data', (d) => {
      c.buf = Buffer.concat([c.buf, d]);
      for (;;) {
        const b = c.buf;
        if (c.stage === 0) { if (b.length < 12) return; c.buf = b.subarray(12); c.stage = 1; sock.write(Buffer.from([2, 30, 2])); continue; }
        if (c.stage === 1) {
          if (b.length < 1) return;
          c.buf = b.subarray(1);
          if (b[0] !== 30) { seen.refusedTypes++; sock.destroy(); return; }
          c.x = BigInt('0x' + crypto.randomBytes(32).toString('hex'));
          sock.write(Buffer.concat([u16(2), u16(KEYLEN), toBuf(P, KEYLEN), toBuf(modPow(2n, c.x, P), KEYLEN)]));
          c.stage = 2; continue;
        }
        if (c.stage === 2) {
          if (b.length < 128 + KEYLEN) return;
          const enc = b.subarray(0, 128), clientPub = BigInt('0x' + b.subarray(128, 128 + KEYLEN).toString('hex'));
          c.buf = b.subarray(128 + KEYLEN);
          const key = crypto.createHash('md5').update(toBuf(modPow(clientPub, c.x, P), KEYLEN)).digest();
          const dec = crypto.createDecipheriv('aes-128-ecb', key, null); dec.setAutoPadding(false);
          const plain = Buffer.concat([dec.update(enc), dec.final()]);
          const cstr = (o) => { const e = plain.indexOf(0, o); return plain.subarray(o, e < 0 || e > o + 63 ? o + 63 : e).toString('utf8'); };
          const got = { user: cstr(0), pass: cstr(64), mode: st.mode };
          seen.creds.push(got);
          if (st.mode === 'silent') { c.stage = 9; return; } // the Mac that never answers
          if (got.user !== USER || got.pass !== PASS) { const why = Buffer.from('Authentication failed'); sock.write(Buffer.concat([Buffer.from([0, 0, 0, 1]), Buffer.from([0, 0, 0, why.length]), why])); sock.end(); return; }
          sock.write(Buffer.from([0, 0, 0, 0])); c.stage = 3; continue;
        }
        if (c.stage === 3) { if (b.length < 1) return; c.buf = b.subarray(1); c.stage = 4; const name = Buffer.from('MacBook'); sock.write(Buffer.concat([u16(FW), u16(FH), Buffer.from([32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 0, 8, 16, 0, 0, 0]), Buffer.from([0, 0, 0, name.length]), name])); continue; }
        if (c.stage === 9) { c.buf = Buffer.alloc(0); return; }
        if (!b.length) return;
        const t = b[0];
        const need = t === 0 ? 20 : t === 2 ? (b.length >= 4 ? 4 + 4 * b.readUInt16BE(2) : 1e9) : t === 3 ? 10 : t === 4 ? 8 : t === 5 ? 6 : t === 6 ? (b.length >= 8 ? 8 + b.readUInt32BE(4) : 1e9) : 1;
        if (b.length < need) return;
        if (t === 3 && !b[1]) sock.write(Buffer.concat([Buffer.from([0, 0]), u16(1), u16(0), u16(0), u16(FW), u16(FH), Buffer.from([0, 0, 0, 0]), frame]));
        c.buf = b.subarray(need);
      }
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, seen, st })));
}
ard = await ardServer();

// ── the hub: the real access layer + routes + the ONE picture bridge ───────────────────────────────────────────────
const quiet = { log() { }, warn() { } };
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const hosts = { get: (id) => (dms[id] ? { id, name: 'MacBook' } : null), isLocal: (id) => id === 'local', deviceBounded: async (id) => dms[id] };
const access = ACC.create({ hosts, install: false, log: quiet, vncPort: ard.port, probeMs: 3000 });
const DS = require(path.join(REPO, 'src/server/desktop-stream.js'));
const bridge = DS.create({ auth: { requestAuthed: () => true }, log: quiet, pingMs: 5000, resolveTarget: (id) => access.machineDesktopTarget(id), forwardPort: (h, p) => access.forwardPort(h, p) });
const express = require(path.join(REPO, 'node_modules/express'));
const R = require(path.join(REPO, 'src/routes/desktop-apps.js'));
R.setup({ access, stream: bridge, vnc: {} });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = `import { showMachineDesktopDialog } from ${JSON.stringify(path.join(REPO, 'src/lib/machine-desktop.js'))};
import { createModalShell } from ${JSON.stringify(path.join(REPO, 'src/lib/utils.js'))};
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
window.__rejections = [];
window.addEventListener('unhandledrejection', (e) => window.__rejections.push(String((e.reason && e.reason.message) || e.reason)));
// the Apps dialog the machine's row is pressed in (desktop-app-launcher.js passes its own close as closeOpener)
window.__openApps = () => { const { close } = createModalShell({ id: 'desktop-launch-dialog', title: 'Apps', dialogClass: 'desktop-launch', escapeToClose: true }); window.__closeApps = close; };
window.__open = (m) => { document.getElementById('machine-desktop-dialog')?.remove(); showMachineDesktopDialog({ wm }, m, { recheck: async () => m, closeOpener: () => window.__closeApps && window.__closeApps() }); };`;
const VIEW = path.join(REPO, 'src/lib/vnc-view.js');
let baseView = null, baseWhy = null; // a shallow checkout lacks the object: the two base-page controls say so and skip
try { baseView = execFileSync('git', ['-C', REPO, 'show', `${BASE_SHA}:src/lib/vnc-view.js`], { encoding: 'utf8', env: gitEnvFrom(process.env), stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { baseWhy = String(e.stderr || e.message).trim().slice(0, 160); }
if (baseView) ok(!/installSubtleFallback/.test(baseView) && /setStatus\(t\('Connecting…'\)\)/.test(baseView), `the control's vnc-view.js is ${BASE_SHA}'s (no AES fallback, "Connecting…" the last word before noVNC)`);
else console.log(`  ⚠ SKIP (§5 + §6 controls): cannot read ${BASE_SHA}:src/lib/vnc-view.js — ${baseWhy}`);
const swapView = { name: 'base-view', setup(b) { b.onLoad({ filter: /vnc-view\.js$/ }, (a) => (a.path === VIEW ? { contents: baseView, loader: 'js', resolveDir: path.dirname(VIEW) } : undefined)); } };
for (const [file, plugins] of [['page.js', []], ...(baseView ? [['page-base.js', [swapView]]] : [])]) await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, file), loader: { '.css': 'empty' }, logLevel: 'error', plugins });
const app = express();
// the scratch hub listens on a LAN-reachable address for this run: only this box's own requests are served
app.use((q, s, next) => { const ra = String(q.socket.remoteAddress || '').replace(/^::ffff:/, ''); if (ra !== IP && ra !== '127.0.0.1') { s.status(403).end(); return; } next(); });
app.use(express.json());
// §3 (lane heavy3-flake-races): while `ghold.on` the window's connect gate (POST …/connect) waits here — the record's order made deterministic
const ghold = { on: false, held: [] };
app.use((q, s, next) => { if (ghold.on && q.method === 'POST' && q.path === '/api/desktop/machine-desktop/connect') { ghold.held.push(next); return; } next(); });
const gRelease = () => { ghold.on = false; for (const f of ghold.held.splice(0)) f(); };
app.use(R.router);
const CSS = ['xterm', 'style', 'viewers', 'chat', 'fonts'].filter((n) => fs.existsSync(path.join(REPO, `public/${n}.css`)));
for (const n of CSS) app.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
for (const f of ['page.js', 'page-base.js'].filter((x) => fs.existsSync(path.join(root, x)))) app.get(`/${f}`, (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, f))));
app.get('/novnc.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(NOVNC)));
app.get('/', (q, s) => s.type('text/html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-root);height:100vh;overflow:hidden}</style></head><body><script src="/${q.query.base ? 'page-base' : 'page'}.js"></script></body></html>`));
const PORT = await freePort();
for (const host of [IP, '127.0.0.1']) {
  const srv = http.createServer(app);
  srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head, bridge.upgradeId(new URL(req.url, 'http://x').pathname)));
  await new Promise((r) => srv.listen(PORT, host, r));
  servers.push(srv);
}

// ── Chrome: a scratch profile, a private HOME / XDG_RUNTIME_DIR, no display (headless) ──────────────────────────────
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { stdio: 'ignore', env: cenv });
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h, url) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const winCss = w < 600 ? 'position:fixed;left:0;top:0;width:100vw;height:100vh;display:flex;flex-direction:column;background:var(--bg-window);' : 'position:fixed;left:30px;top:24px;width:1040px;height:720px;display:flex;flex-direction:column;background:var(--bg-window);border:1px solid var(--border);border-radius:8px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.18)';
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); } catch {} window.__winCss = ${JSON.stringify(winCss)};` });
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  await cdp('Page.navigate', { url });
  for (let i = 0; i < 100 && !(await ev('typeof window.__open === "function"').catch(() => false)); i++) await sleep(100);
  const until = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
  const shot = async (file, sel = null) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = sel ? await ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].pop().getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`) : [0, 0, w, h];
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0] - 8), y: Math.max(0, r[1] - 8), width: Math.min(r[2] + 16, w), height: Math.min(r[3] + 16, h), scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  return { cdp, ev, until, shot, close: async () => { try { await cdp('Page.close'); } catch { /* gone */ } ws.close(); } };
}
const M = { hostId: 'mac-a', label: 'MacBook', code: 'desktop_ready', auth: 'ard', setup: 'darwin', desktop: true };
const STATUS = '.vs-win[data-type="machine-desktop"] .desktop-status';
// the status chip's every word, in order (a MutationObserver from the window's first paint)
const watchJs = (firstLookMs = 0) => `(() => { window.__st = []; const go = () => { const s = document.querySelector(${JSON.stringify(STATUS)}); if (!s) return setTimeout(go, 5); window.__st.push(s.textContent); new MutationObserver(() => { if (window.__st[window.__st.length - 1] !== s.textContent) window.__st.push(s.textContent); }).observe(s, { childList: true, characterData: true, subtree: true }); }; ${firstLookMs ? `setTimeout(go, ${firstLookMs})` : 'go()'}; return true; })()`;
const WATCH = watchJs();
const press = (text) => `(() => { const b = [...document.querySelectorAll('#machine-desktop-dialog button')].find((x) => x.textContent === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`;
const typeSignIn = (user, pass) => `(() => { const f = document.querySelector('#machine-desktop-signin form'); if (!f) return false; const i = f.querySelectorAll('input'); i[0].value = ${JSON.stringify(user)}; i[1].value = ${JSON.stringify(pass)}; f.requestSubmit(); return true; })()`;
const statusText = `document.querySelector(${JSON.stringify(STATUS)})?.textContent || ''`;
const deskPixel = `(() => { const c = document.querySelector('.vs-win[data-type="machine-desktop"] canvas'); if (!c || !c.width) return null; return [c.width, c.height, ...c.getContext('2d').getImageData(20, 20, 1, 1).data.slice(0, 3)]; })()`;
async function openAndAsk(p, { holdGate = false, firstLookMs = 0, releaseOnArrival = false } = {}) {
  if (holdGate) ghold.on = true;
  await p.ev('window.__openApps(), window.__open(' + JSON.stringify(M) + '), true');
  await p.until(`!!document.querySelector('#machine-desktop-dialog')`);
  const before = await p.ev(`[document.querySelectorAll('.dialog-overlay').length, !!document.getElementById('desktop-launch-dialog'), !!document.getElementById('machine-desktop-dialog')]`);
  const pressed = await p.ev(press(Z('Open its desktop → Desktop'))); // lane desktop-v2-entry: the dialog's link to the Desktop (it still opens the window at once)
  const after = await p.ev(`[document.querySelectorAll('.dialog-overlay').length, !!document.getElementById('desktop-launch-dialog'), !!document.getElementById('machine-desktop-dialog'), document.querySelectorAll('.vs-win[data-type="machine-desktop"]').length]`);
  await p.ev(firstLookMs ? watchJs(firstLookMs) : WATCH);
  let held = 0, armed = null;
  if (holdGate) {
    const t0 = Date.now(); while (!ghold.held.length && Date.now() - t0 < 10000) await sleep(50); held = ghold.held.length;
    if (!releaseOnArrival) armed = (await p.until('window.__st.length > 0', 10000)) ? await p.ev('window.__st[0]') : null; // the record ARMED (its first word in)
    gRelease(); // the gate answers now
  }
  const asked = await p.until(`!!document.querySelector('#machine-desktop-signin form input[type=password]')`, 15000);
  return { before, pressed, after, asked, held, armed };
}
const closeWins = (p) => p.ev(`(() => { for (const id of [...window.__wm.windows.keys()]) window.__wm.closeWindow(id); document.getElementById('machine-desktop-signin')?.remove(); return true; })()`);

console.log(`§0 the page is on an INSECURE origin (http://${IP}:${PORT})`);
const desk = await page(1100, 800, `http://${IP}:${PORT}/`);
const ctx = await desk.ev('({ secure: window.isSecureContext, subtle: !!(window.crypto && window.crypto.subtle), origin: location.origin })');
ok(ctx && ctx.secure === false && ctx.subtle === false, `window.isSecureContext === false and crypto.subtle is absent at ${ctx && ctx.origin} — the owner's http://<hostname>:3456 condition`, ctx);
if (!ctx || ctx.secure !== false) { console.log('\n  (the legs below would prove nothing on a secure context — stopping)'); console.log(`\n${fail} FAILED (${pass} passed)`); process.exit(1); }

console.log('§1 Open its desktop closes the dialog it was pressed in AND the Apps dialog beneath; the sign-in is asked');
{
  const r = await openAndAsk(desk);
  ok(r.before[0] === 2 && r.before[1] && r.before[2], 'before: two dialogs — the Apps dialog and the machine\'s dialog over it', r.before);
  ok(r.pressed && r.after[0] === 0 && !r.after[1] && !r.after[2] && r.after[3] === 1, `pressing ${Z('Open its desktop → Desktop')} closes BOTH dialogs and opens the machine's window`, r.after);
  ok(r.asked && await desk.ev(`document.querySelectorAll('.dialog-overlay').length === 1 && !!document.querySelector('#machine-desktop-signin input[type=text]')`), 'the Mac asks its user name + password — the only dialog left on the page');
  await desk.shot('signin.png');
}

console.log('§2 name + password ⇒ 正在登录… ⇒ 已连接, the fixture\'s frame drawn; the Mac read exactly what was typed');
{
  const n0 = ard.seen.creds.length;
  ard.st.mode = 'accept';
  ok(await desk.ev(typeSignIn(USER, PASS)), 'the sign-in form submitted');
  const connected = await desk.until(`${JSON.stringify(Z('Connected'))} === (${statusText})`, 15000);
  const words = await desk.ev('window.__st');
  const iSign = words.indexOf(Z('Signing in…')), iConn = words.lastIndexOf(Z('Connected'));
  ok(connected && iSign >= 0 && iConn > iSign && !words.slice(iSign).includes(Z('Connecting…')), `the status said ${Z('Signing in…')} once the sign-in was handed over, then ${Z('Connected')} — never ${Z('Connecting…')} past the sign-in`, words);
  const got = ard.seen.creds.slice(n0);
  ok(got.length === 1 && got[0].user === USER && got[0].pass === PASS, 'the Mac decrypted the AES block with the DH secret and read exactly the typed name + password', got);
  ok(await desk.until(`(() => { const p = ${deskPixel}; return !!p && p[0] === ${FW} && p[2] === ${DESK[0]} && p[3] === ${DESK[1]} && p[4] === ${DESK[2]}; })()`, 10000), 'the Mac\'s frame is drawn (1280 px framebuffer, the desktop colour at 20,20)', await desk.ev(deskPixel));
  const sub = await desk.ev(`(() => { const d = Object.getOwnPropertyDescriptor(window.crypto, 'subtle'); return { own: !!d, fns: d ? Object.keys(d.value).sort() : null, rejections: window.__rejections }; })()`);
  ok(sub.own && JSON.stringify(sub.fns) === '["encrypt","importKey"]' && sub.rejections.length === 0, 'the page\'s crypto.subtle is the PURE AES (an own property: importKey + encrypt) and nothing rejected', sub);
  await desk.shot('connected.png', '.vs-win');
  await closeWins(desk);
}

console.log('§3 a Mac that never answers the sign-in ⇒ the named status with Reconnect at ~20 s');
{
  ard.st.mode = 'silent';
  const r = await openAndAsk(desk, { holdGate: true });
  ok(r.asked, 'the sign-in is asked again for the second window');
  ok(r.held === 1 && r.armed === Z('Starting desktop…'), `its connect gate was held until the status record was ARMED — its first word in, ${Z('Starting desktop…')} (the loaded runner's order, every run)`, { held: r.held, armed: r.armed });
  const t0 = Date.now();
  await desk.ev(typeSignIn(USER, PASS));
  ok(await desk.until(`${JSON.stringify(Z('Signing in…'))} === (${statusText})`, 5000), `${Z('Signing in…')} while the Mac is silent`, await desk.ev(statusText));
  const want = Z('The sign-in could not be completed: {why}', { why: Z('the machine did not answer in {n} s', { n: 20 }) });
  const named = await desk.until(`${JSON.stringify(want)} === (${statusText})`, 26000);
  const took = (Date.now() - t0) / 1000;
  const re = await desk.ev(`(() => { const b = [...document.querySelectorAll('.vs-win[data-type="machine-desktop"] .desktop-bar button')].find((x) => x.textContent === ${JSON.stringify(Z('Reconnect'))}); return !!b && getComputedStyle(b).display !== 'none'; })()`);
  ok(named && took >= 19 && took < 24 && re, `"${want}" at ${took.toFixed(1)} s (bound 20 s), with ${Z('Reconnect')} shown`, { st: await desk.ev(statusText), took, re });
  await sleep(1500);
  const st3 = await desk.ev('window.__st'), iS3 = st3.indexOf(Z('Signing in…'));
  ok(await desk.ev(`${JSON.stringify(want)} === (${statusText})`) && iS3 >= 0 && !st3.slice(iS3).includes(Z('Connecting…')), 'the words stay after the socket closes (no ladder re-asks the sign-in, never 连接中… again)', st3);
  ok(st3[0] === Z('Starting desktop…') && st3.slice(1).includes(Z('Connecting…')), 'RED CONTROL (the old predicate): a record armed while the gate was out starts at 正在启动桌面…, and "everything after its first word" counts the gate\'s own 连接中… as a re-ask', st3);
  await desk.shot('failed.png', '.vs-win');
  await closeWins(desk);
}

console.log('§3b the armed moment, proven: the record\'s first look starved 400 ms (a loaded page), the gate held both ways');
{
  ard.st.mode = 'silent';
  const early = await openAndAsk(desk, { holdGate: true, firstLookMs: 400, releaseOnArrival: true });
  await sleep(300); const stE = await desk.ev('window.__st'); await closeWins(desk);
  ok(early.held === 1 && stE[0] === Z('Connecting…') && !stE.includes(Z('Starting desktop…')), `RED CONTROL (the gate answered on its POST's arrival — §3's old rule): the starved record begins at ${Z('Connecting…')}, the runner's record`, stE);
  const bounded = await openAndAsk(desk, { holdGate: true, firstLookMs: 400 });
  await sleep(300); const stB = await desk.ev('window.__st'); await closeWins(desk);
  ok(bounded.held === 1 && bounded.armed === Z('Starting desktop…') && stB[0] === Z('Starting desktop…') && stB.includes(Z('Connecting…')), `…the gate held until the record is armed: the same starved record begins at ${Z('Starting desktop…')}, then ${Z('Connecting…')}`, stB);
}
await desk.close();

console.log('§4 the phone (390 px): the same sign-in, connected');
{
  ard.st.mode = 'accept';
  const phone = await page(390, 844, `http://${IP}:${PORT}/`);
  ok((await phone.ev('window.isSecureContext')) === false, 'the phone page is on the insecure origin too');
  const r = await openAndAsk(phone);
  const fit = await phone.ev(`(() => { const d = document.querySelector('#machine-desktop-signin .dialog').getBoundingClientRect(); return [Math.round(d.left), Math.round(d.right), innerWidth]; })()`);
  ok(r.asked && fit[0] >= 0 && fit[1] <= fit[2], 'the sign-in dialog fits 390 px', fit);
  await phone.shot('phone.png');
  await phone.ev(typeSignIn(USER, PASS));
  ok(await phone.until(`${JSON.stringify(Z('Connected'))} === (${statusText})`, 15000), `the phone signs in: ${Z('Connected')}`, await phone.ev(statusText));
  await closeWins(phone);
  await phone.close();
}

console.log(`§5 RED control: the BASE vnc-view.js (${BASE_SHA}) on the same insecure origin — the owner's 连接中…`);
if (baseView) {
  const base = await page(1100, 800, `http://${IP}:${PORT}/?base=1`);
  ok((await base.ev('window.isSecureContext')) === false, 'the base page is on the insecure origin');
  const n0 = ard.seen.creds.length;
  const r = await openAndAsk(base);
  await base.ev(typeSignIn(USER, PASS));
  await sleep(6000);
  const st = await base.ev(statusText), rej = await base.ev('window.__rejections');
  ok(st === Z('Connecting…') && ard.seen.creds.length === n0 && rej.some((x) => /subtle|importKey|undefined/.test(x)), `RED: the base page still says ${Z('Connecting…')} 6 s after the sign-in, the Mac received nothing, noVNC's auth rejected unseen (${rej[0] || '—'})`, { st, sent: ard.seen.creds.length - n0, rej, asked: r.asked });
  await closeWins(base);
  await base.close();
}

console.log('§6 CONTROL: the same base page on 127.0.0.1 (a secure context) signs in — a loopback test is blind to the bug');
if (baseView) {
  const loop = await page(1100, 800, `http://127.0.0.1:${PORT}/?base=1`);
  ok((await loop.ev('window.isSecureContext')) === true && (await loop.ev('!!window.crypto.subtle')) === true, 'http://127.0.0.1 IS a secure context (WebCrypto present)');
  await openAndAsk(loop);
  await loop.ev(typeSignIn(USER, PASS));
  ok(await loop.until(`${JSON.stringify(Z('Connected'))} === (${statusText})`, 15000), `the base page connects on loopback (${Z('Connected')})`, await loop.ev(statusText));
  await closeWins(loop);
  await loop.close();
}

console.log('§7 the launcher hands its own close to the machine\'s dialog (the Apps dialog closes with it)');
{
  const src = fs.readFileSync(path.join(REPO, 'src/lib/desktop-app-launcher.js'), 'utf8');
  ok(/showMachineDesktopDialog\(app, m, \{[^}]*closeOpener: close,/.test(src) && /const \{ overlay, body, close \} = createModalShell\(\{ id: 'desktop-launch-dialog'/.test(src), 'desktop-app-launcher.js passes the Apps dialog\'s close as closeOpener');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
