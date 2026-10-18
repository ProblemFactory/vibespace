#!/usr/bin/env node
// lane machine-desktop-apps HEAVY (owner 2026-10-11, screenshot: "再检查一次" drawn one character per line; "装了 jasp 但是
// 列表里没有"): the REAL agentd bundle answers `desktop-apps-list` on scratch "devices" on this box — a Windows-shaped one
// (its hello says win32; a fixture powershell.exe on its PATH prints the Start Menu + Uninstall records the real script
// would) and a Mac-shaped one (its hello says darwin; a fixture ~/Applications) — plus an OLD agent (its hello-ack lacks
// the capability). The hub half is the real access layer + keeper + routes; the dialog is the real
// src/lib/machine-desktop.js in headless Chrome with the app's stylesheets, at desk 900 px and phone 390 px:
//   ① the action row never squeezes a button (every button's words on ONE line, scrollWidth ≤ clientWidth — measured)
//     + RED CONTROL: the base CSS (no wrap, the 24 px icon-button box) squeezes Check again into a column
//   ② the list shows JASP (listed ON the device by the real op); a press fills the command; the filter narrows
//   ③ Check again re-lists (a new app on the device appears)   ④ the Mac machine lists its bundles (`open -a "JASP"`)
//   ⑤ an old agent ⇒ the update words, answered at once (never a hang)
// PNGs (when `--shots <dir>`): desk.png, phone.png, old-daemon.png.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!fs.existsSync(BUNDLE)) { ok(false, 'the agentd bundle exists (npm run build first)'); process.exit(1); }

// ── the scratch devices ──────────────────────────────────────────────────────────────────────────────────────────
const root = scratch('mdapps');
fs.mkdirSync(root, { recursive: true });
const realHome = process.env.HOME;
const homes = {};
const started = [];
const rootOf = (h) => path.join(h, 'agentd-root');
const cleanup = () => {
  for (const h of started) { try { process.kill(Number(fs.readFileSync(path.join(rootOf(h), 'state', 'agentd.pid'), 'utf8')), 'SIGKILL'); } catch { /* gone */ } }
  try { chrome && chrome.kill('SIGKILL'); } catch { /* gone */ }
  try { srv && srv.close(); } catch { /* gone */ }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
};
let chrome = null, srv = null;
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const SM = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs';
const lnk = (n, t, a = '') => JSON.stringify({ k: 'lnk', n, p: `${SM}\\${n}.lnk`, t, a });
const WIN_RECORDS = [
  lnk('JASP', 'C:\\Program Files\\JASP\\JASP.exe'), lnk('Uninstall JASP', 'C:\\Program Files\\JASP\\unins000.exe'),
  lnk('Blender 4.2', 'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender-launcher.exe'), lnk('Notepad++', 'C:\\Program Files\\Notepad++\\notepad++.exe'),
  lnk('Google Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'), lnk('Chrome (Work)', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '--profile-directory="Profile 1"'),
  lnk('LibreOffice Calc', 'C:\\Program Files\\LibreOffice\\program\\scalc.exe'), lnk('Visual Studio Code', 'C:\\Users\\mart\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe'),
  JSON.stringify({ k: 'uninst', n: 'JASP 0.98.1', i: '"C:\\Program Files\\JASP\\JASP.exe",0', l: 'C:\\Program Files\\JASP\\', x: ['JASP.exe', 'unins000.exe'] }),
  JSON.stringify({ k: 'uninst', n: '7-Zip 24.08 (x64)', i: 'C:\\Program Files\\7-Zip\\7zFM.exe', l: 'C:\\Program Files\\7-Zip\\', x: ['7z.exe', '7zFM.exe', 'Uninstall.exe'] }),
];
function mkHome(name) { const h = path.join(root, name); fs.mkdirSync(path.join(h, '.local/bin'), { recursive: true }); homes[name] = h; return h; }
const winHome = mkHome('win'), oldHome = mkHome('old'), macHome = mkHome('mac');
const records = path.join(root, 'win-records.jsonl');
fs.writeFileSync(records, WIN_RECORDS.join('\r\n') + '\r\n');
for (const h of [winHome, oldHome]) { fs.writeFileSync(path.join(h, '.local/bin/powershell.exe'), `#!/bin/sh\n# the fixture "PowerShell": prints the records the real listing script prints on Windows\ncat '${records}'\n`); fs.chmodSync(path.join(h, '.local/bin/powershell.exe'), 0o755); }
const plist = (exe) => `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>${exe}</string></dict></plist>\n`;
for (const [rel, exe] of [['JASP.app', 'JASP'], ['Blender.app', 'Blender'], ['Utilities/Terminal.app', 'Terminal'], ['Fiji.app', 'ImageJ']]) { const d = path.join(macHome, 'Applications', rel, 'Contents'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'Info.plist'), plist(exe)); }

// the REAL bundle, its hello (and the op's platform) saying win32 / darwin; the old agent = its capability list without the op
const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const HELLO = /(op: "hello-ack",[\s\S]{0,200}?)platform: process\.platform,/;
const OPPLAT = 'listInstalled({ platform: process.platform';
const CAP_LIST = /capabilities: \[([^\]]*)\]/;
ok(HELLO.test(bundleText) && bundleText.includes(OPPLAT) && /"desktop-apps-list"/.test((CAP_LIST.exec(bundleText) || [])[1] || ''), 'the bundle carries the hello-ack platform, the op\'s platform and the capability (the copies patch exactly those)');
const as = (plat) => bundleText.replace(HELLO, (all, pre) => `${pre}platform: ${JSON.stringify(plat)},`).replace(OPPLAT, `listInstalled({ platform: ${JSON.stringify(plat)}`);
const dropCap = (txt) => txt.replace(CAP_LIST, (all, inner) => `capabilities: [${inner.split(',').map((x) => x.trim()).filter((x) => x && x !== '"desktop-apps-list"').join(', ')}]`);
const copies = { win: as('win32'), mac: as('darwin'), old: dropCap(as('win32')) };
for (const [n, txt] of Object.entries(copies)) { fs.mkdirSync(path.join(root, 'bundle-' + n), { recursive: true }); fs.writeFileSync(path.join(root, 'bundle-' + n, 'vibespace-agentd.js'), txt); }
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
const dms = { 'win-a': await deviceOn('win'), 'mac-b': await deviceOn('mac'), 'win-old': await deviceOn('old') };
const info = (id) => dms[id].status().info || {};
ok(info('win-a').platform === 'win32' && info('win-a').capabilities.includes('desktop-apps-list') && info('mac-b').platform === 'darwin' && info('win-old').platform === 'win32' && !info('win-old').capabilities.includes('desktop-apps-list'), 'three real agents: a Windows-shaped and a Mac-shaped one with the op, an old Windows one without it');

// ── the hub: the real access layer + keeper + routes ────────────────────────────────────────────────────────────
const quiet = { log() { }, warn() { } };
const K = require(path.join(REPO, 'src/server/desktop-app-keeper.js'));
const keeper = K.create({ dataDir: path.join(root, 'hub-data'), env: () => ({}), broadcast() { }, log: quiet, tickMs: 3600e3 });
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const LABELS = { 'win-a': 'WIN-DESK1', 'mac-b': 'Mac-mini', 'win-old': 'OLD-PC' };
const hosts = { get: (id) => (dms[id] ? { id, name: LABELS[id] } : null), isLocal: (id) => id === 'local', deviceBounded: async (id) => dms[id] };
const access = ACC.create({ hosts, install: false, log: quiet, installedStore: () => keeper });
const express = require(path.join(REPO, 'node_modules/express'));
const R = require(path.join(REPO, 'src/routes/desktop-apps.js'));
R.setup({ keeper, access, vnc: {} });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = `import { showMachineDesktopDialog } from ${JSON.stringify(path.join(REPO, 'src/lib/machine-desktop.js'))};
window.__open = (m) => { document.getElementById('machine-desktop-dialog')?.remove(); showMachineDesktopDialog({ wm: { windows: new Map() } }, m, { install: () => {}, recheck: async () => m }); };`;
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
const app = express(); app.use(express.json()); app.use(R.router);
const CSS = ['xterm', 'style', 'viewers', 'chat', 'theme-editor', 'fonts'].filter((n) => fs.existsSync(path.join(REPO, `public/${n}.css`)));
for (const n of CSS) app.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
app.get('/page.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page.js'))));
app.get('/', (q, s) => s.type('text/html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-root);height:100vh}</style></head><body><script src="/page.js"></script></body></html>`));
const PORT = await freePort();
srv = await new Promise((r) => { const s = app.listen(PORT, '127.0.0.1', () => r(s)); });

// ── Chrome: a scratch profile, a private HOME / XDG_RUNTIME_DIR, no display (headless) ──────────────────────────────
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { stdio: 'ignore', env: cenv });
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: w < 600 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  for (let i = 0; i < 100 && !(await ev('typeof window.__open === "function"').catch(() => false)); i++) await sleep(100);
  const until = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
  const shot = async (file) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await ev(`(() => { const b = document.querySelector('#machine-desktop-dialog .dialog').getBoundingClientRect(); return [Math.max(0, b.left - 12), Math.max(0, b.top - 12), b.width + 24, b.height + 24]; })()`);
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: r[0], y: r[1], width: Math.min(r[2], w - r[0]), height: Math.min(r[3], h - r[1]), scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  return { cdp, ev, until, shot, close: () => ws.close() };
}
const ROW = (id, label) => JSON.stringify({ hostId: id, label, code: 'no_vnc', setup: id.startsWith('mac') ? 'darwin' : 'win32', desktop: 'vnc-native', selectable: true, why: 'no_listener' });
// every button of the action row: its words on ONE line, never cut (scrollWidth ≤ clientWidth)
const MEASURE = `[...document.querySelectorAll('#machine-desktop-dialog .desktop-install-actions > button')].map((b) => { const r = document.createRange(); r.selectNodeContents(b); const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; const bb = b.getBoundingClientRect(); return { text: b.textContent, w: Math.round(bb.width), h: Math.round(bb.height), lines, fits: b.scrollWidth <= b.clientWidth }; })`;
const names = `[...document.querySelectorAll('#machine-desktop-dialog .machine-apps-row')].filter((b) => b.isConnected && b.offsetParent).map((b) => b.querySelector('.machine-apps-name').textContent)`;

for (const [label, w, h, file] of [['desk 900 px', 900, 760, 'desk.png'], ['phone 390 px', 390, 844, 'phone.png']]) {
  console.log(`① – ③ the Windows machine's dialog (${label})`);
  const p = await page(w, h);
  await p.ev(`window.__open(${ROW('win-a', 'WIN-DESK1')})`);
  ok(await p.until(`document.querySelectorAll('#machine-desktop-dialog .machine-apps-row').length > 0`), `${label}: the dialog lists the machine's apps (asked through the real op)`);
  const got = await p.ev(names);
  ok(got.includes('JASP') && got.includes('7-Zip 24.08 (x64)') && got.includes('Chrome (Work)') && !got.some((n) => /Uninstall|JASP 0\.98/.test(n)), `${label}: JASP is listed (once), the Uninstall-key app too, no uninstaller`, got);
  const title = await p.ev(`document.querySelector('.machine-apps-title').textContent`);
  ok(title === `WIN-DESK1上已安装（${got.length}）`, `${label}: the head says "{machine}上已安装（n）" (zh)`, title);
  const m1 = await p.ev(MEASURE);
  ok(m1.length === 4 && m1[0].text === '串流一个窗口…' && m1[3].text === 'RemoteApp 设置…' && m1.every((b) => b.lines === 1 && b.fits && b.h <= 40), `${label}: ① every action-row button holds its words on ONE line, uncut (${m1.map((b) => `${b.text} ${b.w}×${b.h}`).join(' · ')})`, m1); // + lane remoteapp-r1b's «RemoteApp settings…» on a Windows machine; + lane stream-p2w-build's «Stream one window…» first (int304)
  if (w === 900) {
    await p.ev(`(() => { const s = document.createElement('style'); s.id = 'base-rule'; s.textContent = '.desktop-install-actions{flex-wrap:nowrap!important}.desktop-install-actions>button{flex:0 1 auto!important;white-space:normal!important}.desktop-install-actions>.file-tool-btn{width:24px!important;height:24px!important;min-height:0!important;padding:0!important}'; document.head.append(s); })()`);
    const m0 = await p.ev(MEASURE);
    const again = m0.find((b) => b.text === '再检查一次');
    ok(again && again.lines >= 3 && again.w <= 30, `RED CONTROL: the base rule (no wrap, the 24 px icon-button box) draws "再检查一次" as a column (${again && `${again.w}×${again.h}, ${again.lines} lines`})`, m0);
    await p.ev(`document.getElementById('base-rule').remove()`);
  }
  await p.ev(`[...document.querySelectorAll('.machine-apps-row')].find((b) => b.querySelector('.machine-apps-name').textContent === 'JASP').click()`);
  const cmd = await p.ev(`document.querySelector('.machine-desktop-cmd').value`);
  ok(cmd === 'start "" "C:\\Program Files\\JASP\\JASP.exe"', `${label}: ② a press on JASP fills the command box with its launch line`, cmd);
  await p.ev(`(() => { const f = document.querySelector('.machine-apps-filter'); f.value = 'chrome'; f.dispatchEvent(new Event('input')); })()`);
  const filtered = await p.ev(names);
  ok(filtered.length === 2 && filtered.every((n) => /Chrome/.test(n)), `${label}: the filter narrows the list by name`, filtered);
  await p.ev(`(() => { const f = document.querySelector('.machine-apps-filter'); f.value = ''; f.dispatchEvent(new Event('input')); })()`);
  const docW = await p.ev(`document.documentElement.scrollWidth`);
  const dlg = await p.ev(`(() => { const b = document.querySelector('#machine-desktop-dialog .dialog').getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.height)]; })()`);
  ok(docW <= w && dlg[0] >= 0 && dlg[1] <= w && dlg[2] <= h * 0.9, `${label}: the dialog fits the screen (${dlg[1] - dlg[0]} px wide, ${dlg[2]} px tall ≤ 90vh, no sideways scroll)`, { docW, dlg });
  await p.shot(file);
  if (w === 900) {
    console.log('③ Check again lists the machine again');
    fs.appendFileSync(records, lnk('Fiji', 'C:\\Fiji.app\\ImageJ-win64.exe') + '\r\n');
    await p.ev(`[...document.querySelectorAll('#machine-desktop-dialog .desktop-install-actions > button')].find((b) => b.textContent === '再检查一次').click()`);
    ok(await p.until(`[...document.querySelectorAll('.machine-apps-name')].some((n) => n.textContent === 'Fiji')`), 'Check again re-lists: the app just added on the machine appears');
  }
  p.close();
}

console.log('④ the Mac machine lists its bundles');
{
  const p = await page(900, 760);
  await p.ev(`window.__open(${ROW('mac-b', 'Mac-mini')})`);
  ok(await p.until(`document.querySelectorAll('#machine-desktop-dialog .machine-apps-row').length > 0`), 'the Mac\'s dialog lists its apps');
  const got = await p.ev(names);
  ok(['Blender', 'Fiji', 'JASP', 'Terminal'].every((n) => got.includes(n)), 'its ~/Applications bundles (Utilities one level in)', got);
  await p.ev(`[...document.querySelectorAll('.machine-apps-row')].find((b) => b.querySelector('.machine-apps-name').textContent === 'JASP').click()`);
  ok(await p.ev(`document.querySelector('.machine-desktop-cmd').value`) === 'open -a "JASP"', 'a press fills `open -a "JASP"`');
  p.close();
}

console.log('⑤ an old agent: the update words, answered at once');
{
  const t0 = Date.now();
  const r = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/machine-desktop/apps?host=win-old&fresh=1`)).json();
  const ms = Date.now() - t0;
  ok(r.code === 'host_needs_daemon' && Array.isArray(r.rows) && ms < 2000, `the old agent is never asked: host_needs_daemon in ${ms} ms (never a hang)`, r);
  const p = await page(900, 760);
  await p.ev(`window.__open(${ROW('win-old', 'OLD-PC')})`);
  ok(await p.until(`/VibeSpace 代理/.test(document.querySelector('.machine-apps-note').textContent)`), 'the dialog says the list needs that machine\'s agent updated (zh)');
  const note = await p.ev(`document.querySelector('.machine-apps-note').textContent`);
  ok(note === '这份列表需要更新OLD-PC上的 VibeSpace 代理（它会自动更新；一分钟后再检查一次）', 'the words, verbatim', note);
  await p.shot('old-daemon.png');
  p.close();
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? ', ' + fail + ' failed' : ''})`);
for (const dm of Object.values(dms)) { try { dm.stop(); } catch { /* gone */ } }
// Chrome writes its profile until it has exited: wait for that, then the exit handler removes the scratch whole
if (chrome && chrome.exitCode == null) { const gone = new Promise((r) => chrome.once('exit', r)); try { chrome.kill('SIGTERM'); } catch { /* gone */ } await Promise.race([gone, sleep(5000)]); }
process.exit(fail ? 1 : 0);
