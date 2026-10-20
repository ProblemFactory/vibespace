#!/usr/bin/env node
// lane desktop-vnc-remember HEAVY (owner 2026-10-19 「现在远程桌面密码能保留了吧 就存到 vault 里？」): a paired Windows machine's
// desktop sign-in REMEMBERED, end to end in headless Chrome (zh, then ja). The machine is scripts/fake-vnc-machine.mjs — a VNC
// server that CHECKS the password with noVNC's own DES — reached through a stand-in agent's tcpForward; the hub half is the
// REAL vault engine (set up, unlocked), integration store, access layer, routes and the ONE picture bridge (its RFB relay +
// src/server/rfb-signin.js); the page is the real src/lib/machine-desktop.js + vnc-view.js with the BUILT public/novnc.js:
//   ① the window asks: 「…VibeSpace 不会保存。」, the tick 「记住这台机器的登录」 unticked; ticked ⇒ the sentence says it is sealed
//      in the vault; the password typed ⇒ 已连接 ⇒ the toast 「已记住…」; the hub's row kept · auto; integrations.json holds
//      its ciphertext, never the password                                                          signin-ticked.png
//   ② closed and reopened: NO dialog — 已连接 by itself; the machine took the HUB's answer (the page typed nothing)
//   ③ the password changed on the machine: reopened ⇒ the dialog says 「上次记住的密码不对，请重输」 with the tick ON; the new
//      password typed ⇒ 已连接 + 「已记住」 ⇒ the next window connects by itself again                    signin-refused.png
//   ④ the vault LOCKED: reopened ⇒ the dialog says 「保险库已锁定——先解锁后可自动登录」 (the two facts on their own line), no tick; typed ⇒ 已连接; nothing
//      stored (integrations.json byte-identical); unlocked ⇒ by itself again                           signin-locked.png
//   ⑤ the machine's dialog shows 「忘掉登录」 (only while one is kept); pressed ⇒ 「已忘掉…」, the button gone, the next window
//      asks again with no tick on                                                                   machine-dialog.png
//   ⑥ the Machines card's chip 「登录已记住」 (src/lib/machine-signin-chip.js, the real style.css): one line inside the card's
//      summary, its title says where it is sealed and where to forget it; none when nothing is kept     machines-chip.png
//   ⑦ ja: the dialog's words (「このマシンのサインインを記憶する」 and the sealed sentence)
//   ⑧ RED CONTROL: a relay that ignores the remembered sign-in (a patched copy) ⇒ ②'s window ASKS — the leg can fail
// PNGs when `--shots <dir>`.
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { fakeVncMachine } from './fake-vnc-machine.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const NOVNC = path.join(REPO, 'public/novnc.js');
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!fs.existsSync(NOVNC)) { ok(false, 'public/novnc.js exists (npm run build first)'); process.exit(1); }
const MUT = mutantCopies('dsc', REPO);

const root = scratch('dsc');
fs.mkdirSync(root, { recursive: true });
let chrome = null, srv = null;
const machines = [];
const cleanup = () => {
  try { if (chrome) process.kill(-chrome.pid, 'SIGKILL'); } catch { /* gone */ }
  try { srv && srv.close(); } catch { /* gone */ }
  for (const m of machines) { try { m.close(); } catch { /* gone */ } }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

const PW = 'Vn' + crypto.randomBytes(2).toString('hex') + '!', PW2 = 'Wq' + crypto.randomBytes(2).toString('hex') + '#';
const HOST = 'win-a';
const mWin = await fakeVncMachine({ mode: 'vnc', password: PW, name: 'WIN-DESK1' });
machines.push(mWin);
const dm = {
  status: () => ({ connected: true, info: { platform: 'win32', capabilities: [] } }),
  desktopServe: async () => ({ ok: false, code: 'unused', error: 'this stand-in runs no desktop-serve op' }),
  tcpForward: async () => {
    const s = net.connect(mWin.port, '127.0.0.1');
    await new Promise((r, j) => { s.once('connect', r); s.once('error', j); });
    const h = { onData: null, onClose: null, write: (b) => s.write(b), close: () => s.destroy() };
    s.on('data', (b) => h.onData && h.onData(b)); s.on('close', () => h.onClose && h.onClose()); s.on('error', () => { });
    return h;
  },
};
const hosts = { deviceBounded: async () => dm, connectedDevice: (id) => (id === HOST ? dm : null), get: (id) => (id === HOST ? { id, name: 'WIN-DESK1', transport: 'dial' } : null), isLocal: (id) => !id || id === 'local', list: () => [{ id: HOST, name: 'WIN-DESK1', transport: 'dial' }], linkState: () => 'online' };

// ── the hub: the vault (set up, unlocked) → the store → the access layer → the bridge + routes ──
const quiet = { log() { }, warn() { }, error() { }, info() { } };
const dataDir = path.join(root, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const VAULT_PW = 'vault-' + crypto.randomBytes(6).toString('hex');
const eng = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
const su = await eng.setup(VAULT_PW);
const store = require(path.join(REPO, 'src/server/integration-store.js')).create({ dataDir, env: {}, broadcast: () => { }, log: quiet });
const access = require(path.join(REPO, 'src/server/desktop-access.js')).create({ hosts, install: false, integrations: store, log: quiet, probeMs: 3000 });
const DS = require(path.join(REPO, 'src/server/desktop-stream.js'));
const mkBridge = (D) => D.create({ auth: { requestAuthed: () => true }, log: quiet, pingMs: 5000, resolveTarget: (id) => access.machineDesktopTarget(id), forwardPort: (h, p) => access.forwardPort(h, p) });
let bridge = mkBridge(DS);
// ⑧'s copy: the relay with the remembered sign-in never handed over
const relaySrc = fs.readFileSync(path.join(REPO, 'src/server/stream-relay-rfb.js'), 'utf8');
const HAND = '  return (a) => bridgeRfb(a.ws, a.id, a.port, a.viewerId, a.req, a.signIn || null);\n';
const blindRelay = MUT.write('src/server/stream-relay-rfb.js', relaySrc.replace(HAND, HAND.replace('a.signIn || null', 'null')), 'blind');
const blindRegs = MUT.write('src/server/stream-relays.js', fs.readFileSync(path.join(REPO, 'src/server/stream-relays.js'), 'utf8').replace("require('./stream-relay-rfb.js')", `require(${JSON.stringify(blindRelay)})`), 'blind');
const DSblind = MUT.load('src/server/desktop-stream.js', fs.readFileSync(path.join(REPO, 'src/server/desktop-stream.js'), 'utf8').replace("require('./stream-relays.js')", `require(${JSON.stringify(blindRegs)})`), 'blind');
ok(relaySrc.includes(HAND) && su && su.ok, 'the vault is set up; ⑧\'s blind relay copy is built from the hand-over line');
const express = require(path.join(REPO, 'node_modules/express'));
const R = require(path.join(REPO, 'src/routes/desktop-apps.js'));
R.setup({ access, stream: bridge, vnc: { status: async () => ({ available: true, running: false }) } });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = `import { openMachineDesktop, showMachineDesktopDialog } from ${JSON.stringify(path.join(REPO, 'src/lib/machine-desktop.js'))};
import { signinChipHtml } from ${JSON.stringify(path.join(REPO, 'src/lib/machine-signin-chip.js'))};
let n = 0;
const wm = { windows: new Map(), revealWindow() {},
  createWindow({ title, type }) {
    const id = 'w' + (++n); const el = document.createElement('div'); el.className = 'vs-win'; el.dataset.type = type;
    el.style.cssText = 'position:fixed;left:30px;top:70px;width:900px;height:560px;display:flex;flex-direction:column;background:var(--bg-window);border:1px solid var(--border);z-index:5';
    const bar = document.createElement('div'); bar.className = 'vs-win-title'; bar.textContent = title;
    const content = document.createElement('div'); content.style.cssText = 'flex:1 1 auto;min-height:0;position:relative;display:flex;flex-direction:column';
    el.append(bar, content); document.body.append(el);
    const w = { id, element: el, content, title, type }; wm.windows.set(id, w); return w; },
  closeWindow(id) { const w = wm.windows.get(id); if (!w) return; wm.windows.delete(id); w.onClose && w.onClose(); w.element.remove(); },
};
const app = { wm, _hideWelcome() {}, ws: { onGlobal() { return () => {}; } }, openDesktopApp() {} };
const M = { hostId: ${JSON.stringify(HOST)}, label: 'WIN-DESK1', setup: 'win32', code: 'desktop_ready', auth: 'password' };
window.__open = () => { openMachineDesktop(app, M); return true; };
window.__closeAll = () => { for (const b of document.querySelectorAll('#machine-desktop-signin .file-tool-btn, #machine-desktop-dialog .dialog-close')) b.click(); for (const id of [...wm.windows.keys()]) wm.closeWindow(id); document.querySelectorAll('#machine-desktop-signin, #machine-desktop-dialog, #global-toasts').forEach((e) => e.remove()); return true; };
window.__dialog = () => { showMachineDesktopDialog(app, M, { recheck: async () => M }); return true; };
window.__chip = (kept) => { const s = document.createElement('div'); s.className = 'agents-mach-sum'; s.id = 'chip-card'; s.style.cssText = 'width:360px;margin:20px;border:1px solid var(--border)';
  s.innerHTML = '<span class="agents-mach-dot"></span><span class="agents-mach-name">WIN-DESK1</span><span class="agents-machine-sub">设备</span>' + signinChipHtml(kept ? { kept: true } : null) + '<span class="agents-mach-quota" style="color:var(--green,#3fb950)">5h 12%</span>';
  document.body.append(s); return true; };`;
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
const web = express(); web.use(express.json()); web.use(R.router);
const CSS = ['style', 'viewers', 'chat', 'fonts'].filter((nm) => fs.existsSync(path.join(REPO, `public/${nm}.css`)));
for (const nm of CSS) web.get(`/${nm}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${nm}.css`))));
web.get('/page.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page.js'))));
web.get('/novnc.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(NOVNC)));
const HTML = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((nm) => `<link rel="stylesheet" href="/${nm}.css">`).join('')}<style>body{margin:0;background:var(--bg-root);height:100vh;overflow:hidden}</style></head><body><script src="/page.js"></script></body></html>`;
web.get('/', (q, s) => s.type('text/html').send(HTML));
const PORT = await freePort();
srv = http.createServer(web);
srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head, bridge.upgradeId(new URL(req.url, 'http://x').pathname)));
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const api = async (method, url, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${url}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => null); };
const stateOf = async () => ((await api('GET', `/api/desktop/machine-desktop/signins?host=${HOST}`)) || {}).signin || null;
const fileNow = () => { try { return fs.readFileSync(path.join(dataDir, 'integrations.json'), 'utf8'); } catch { return ''; } };

// ── Chrome: a scratch profile, its own process group (killed whole at exit), headless ──
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { stdio: 'ignore', env: cenv, detached: true });
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(lang) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  const until = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await sleep(300); await until('typeof window.__open === "function"', 10000);
  const shot = async (file, sel) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0] - 6), y: Math.max(0, r[1] - 6), width: r[2] + 12, height: r[3] + 12, scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  return { cdp, ev, until, shot, close: () => ws.close() };
}
const WIN = '.vs-win[data-type="machine-desktop"]';
const DLG = '#machine-desktop-signin';
const asked = (p, ms = 15000) => p.until(`!!document.querySelector('${DLG} input[type=password]')`, ms);
const dialogFacts = (p) => p.ev(`(() => { const d = document.querySelector('${DLG}'); if (!d) return null; const k = d.querySelector('.machine-desktop-signin-keep input');
  return { said: d.querySelector('.machine-desktop-signin-said')?.textContent || '', refused: d.querySelector('.machine-desktop-signin-refused')?.textContent || null, locked: d.querySelector('.machine-desktop-signin-locked')?.textContent || null, where: d.querySelector('.machine-desktop-signin-locked-where')?.textContent || null,
    keep: k ? { checked: k.checked, label: d.querySelector('.machine-desktop-signin-keep').textContent } : null }; })()`);
const tick = (p) => p.ev(`(() => { document.querySelector('${DLG} .machine-desktop-signin-keep input').click(); return true; })()`);
const type = (p, pw) => p.ev(`(() => { const f = document.querySelector('${DLG} form'); f.querySelector('input[type=password]').value = ${JSON.stringify(pw)}; f.requestSubmit(); return true; })()`);
const connected = (p, ms = 20000) => p.until(`(() => { const s = document.querySelector('${WIN} .desktop-strip-status'); return !!s && /已连接|接続/.test(s.textContent); })()`, ms);
const toast = (p, re, ms = 8000) => p.until(`[...document.querySelectorAll('#global-toasts .global-toast-body')].some((e) => ${re}.test(e.textContent))`, ms);
const reopen = async (p) => { await p.ev('window.__closeAll()'); await sleep(250); await p.ev('window.__open()'); };

console.log('① – ⑥ zh');
{
  const p = await page('zh');
  const n0 = mWin.seen.length;
  await p.ev('window.__open()');
  ok(await asked(p), '① the window asks for the sign-in (nothing kept yet)');
  const f0 = await dialogFacts(p);
  ok(f0 && f0.said === 'WIN-DESK1需要它的 VNC 密码。VibeSpace 不会保存。' && f0.keep && f0.keep.checked === false && f0.keep.label === '记住这台机器的登录' && !f0.refused && !f0.locked, '① 「…VibeSpace 不会保存。」 and the tick 「记住这台机器的登录」, unticked', f0);
  await tick(p);
  const f1 = await dialogFacts(p);
  ok(f1 && f1.keep.checked === true && f1.said === 'WIN-DESK1需要它的 VNC 密码。VibeSpace 会把它封进保险库，保险库解锁时自动登录。', '① ticked ⇒ the sentence says it is sealed in the vault and signs in by itself', f1 && f1.said);
  await p.shot('signin-ticked.png', `${DLG}`);
  await type(p, PW);
  ok(await connected(p), '① the password typed ⇒ 已连接');
  ok(await toast(p, '/已记住WIN-DESK1的登录（封进了保险库）/'), '① the toast 「已记住WIN-DESK1的登录（封进了保险库）」');
  const s1 = await stateOf();
  const file1 = fileNow();
  ok(s1 && s1.kept && s1.auth === 'vnc' && s1.auto && file1.includes(`desktop-signin/${HOST}`) && !file1.includes(PW), '① the hub keeps the row (vnc · auto); integrations.json holds its ciphertext, never the password', s1);
  ok(mWin.seen.slice(n0).some((r) => r.type === 2 && r.verdict === 'ok'), '① the machine took the typed sign-in (noVNC in the page answered its challenge)');

  await reopen(p);
  let n1 = mWin.seen.length;
  const up = await connected(p);
  const dlg = await p.ev(`!!document.querySelector('${DLG}')`);
  ok(up && !dlg, '② reopened: NO dialog — 已连接 by itself', { up, dlg });
  ok(mWin.seen.slice(n1).filter((r) => r.verdict === 'ok').length === 1 && mWin.seen.slice(n1).every((r) => r.verdict !== 'refused'), '② the machine took the HUB\'s answer (one sign-in, none refused)', mWin.seen.slice(n1));

  mWin.st.password = PW2;
  await reopen(p);
  ok(await asked(p), '③ the password changed on the machine: reopened ⇒ the dialog');
  const f3 = await dialogFacts(p);
  ok(f3 && f3.refused === '上次记住的密码不对，请重输' && f3.keep && f3.keep.checked === true && f3.said === 'WIN-DESK1需要它的 VNC 密码。VibeSpace 会把它封进保险库，保险库解锁时自动登录。', '③ 「上次记住的密码不对，请重输」, the tick ON (the sentence says sealed)', f3);
  await p.shot('signin-refused.png', `${DLG}`);
  await type(p, PW2);
  ok(await connected(p) && await toast(p, '/已记住WIN-DESK1的登录/'), '③ the new password typed ⇒ 已连接 + 「已记住」');
  const s3 = await stateOf();
  ok(s3 && s3.kept && !s3.refused && s3.auto && s3.at >= s1.at, '③ the row rewritten: refused cleared, auto', s3);
  await reopen(p);
  ok(await connected(p) && !(await p.ev(`!!document.querySelector('${DLG}')`)), '③ the next window connects by itself again');

  eng.lock('test');
  const before4 = fileNow();
  await reopen(p);
  ok(await asked(p), '④ the vault LOCKED: reopened ⇒ the dialog');
  const f4 = await dialogFacts(p);
  ok(f4 && f4.locked === '保险库已锁定——先解锁后可自动登录' && f4.keep === null && f4.said === 'WIN-DESK1需要它的 VNC 密码。VibeSpace 不会保存。', '④ 「保险库已锁定——先解锁后可自动登录」, no tick, 「不会保存」', f4);
  ok(f4 && f4.where === '页面顶部的「解锁…」；「待你处理」里写明了在等它的事', '④ …and the two facts (where to unlock, For you) on their own line beside it — the words stay verbatim (test-vault-words)', f4);
  await p.shot('signin-locked.png', `${DLG}`);
  await type(p, PW2);
  ok(await connected(p), '④ typed ⇒ 已连接');
  await sleep(400);
  ok(fileNow() === before4, '④ nothing stored (integrations.json byte-identical)');
  await eng.unlock(VAULT_PW);
  await reopen(p);
  ok(await connected(p) && !(await p.ev(`!!document.querySelector('${DLG}')`)), '④ unlocked ⇒ by itself again');

  await p.ev('window.__closeAll()');
  await p.ev('window.__dialog()');
  ok(await p.until(`!!document.querySelector('#machine-desktop-dialog .machine-signin-forget')`, 8000), '⑤ the machine\'s dialog shows 「忘掉登录」 (a sign-in is kept)');
  const fb = await p.ev(`(() => { const b = document.querySelector('#machine-desktop-dialog .machine-signin-forget'); return { text: b.textContent, title: b.title }; })()`);
  ok(fb.text === '忘掉登录' && /保险库/.test(fb.title), '⑤ its words: 忘掉登录 (the title: sealed in the vault, forget to be asked again)', fb);
  await p.shot('machine-dialog.png', '#machine-desktop-dialog');
  await p.ev(`document.querySelector('#machine-desktop-dialog .machine-signin-forget').click()`);
  ok(await toast(p, '/已忘掉WIN-DESK1的登录/') && await p.until(`!document.querySelector('#machine-desktop-dialog .machine-signin-forget')`, 5000), '⑤ pressed ⇒ 「已忘掉WIN-DESK1的登录」, the button gone');
  const s5 = await stateOf();
  ok(s5 && s5.kept === false && !fileNow().includes(`desktop-signin/${HOST}`), '⑤ the row is gone', s5);
  await p.ev('window.__closeAll()');
  await p.ev('window.__open()');
  ok(await asked(p), '⑤ the next window asks again');
  const f5 = await dialogFacts(p);
  ok(f5 && f5.keep && f5.keep.checked === false && !f5.refused, '⑤ …with the tick off and no refused line', f5);
  await p.ev('window.__closeAll()');

  await p.ev('window.__chip(true)');
  const c6 = await p.ev(`(() => { const card = document.getElementById('chip-card'), c = card.querySelector('.agents-mach-signin'); if (!c) return null; const a = card.getBoundingClientRect(), b = c.getBoundingClientRect();
    return { text: c.textContent, title: c.title, inside: b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom, oneLine: b.height < 20, w: Math.round(b.width) }; })()`);
  ok(c6 && c6.text === '登录已记住' && c6.inside && c6.oneLine && /保险库/.test(c6.title) && /忘掉/.test(c6.title), '⑥ the Machines card\'s chip 「登录已记住」: one line inside the card, its title says sealed in the vault + where to forget it', c6);
  await p.shot('machines-chip.png', '#chip-card');
  await p.ev(`document.getElementById('chip-card').remove(); window.__chip(false)`);
  ok(await p.ev(`!document.querySelector('#chip-card .agents-mach-signin')`), '⑥ none when nothing is kept');
  p.close();
}

console.log('⑦ ja');
{
  await api('POST', '/api/desktop/machine-desktop/signin', { host: HOST, password: PW2 });
  mWin.st.password = PW;
  const p = await page('ja');
  await p.ev('window.__open()');
  ok(await asked(p), '⑦ ja: the remembered one refused ⇒ the dialog');
  const f7 = await dialogFacts(p);
  ok(f7 && f7.keep && f7.keep.label === 'このマシンのサインインを記憶する' && f7.refused === '記憶したパスワードが通りませんでした。もう一度入力してください' && /保管庫に封印/.test(f7.said), '⑦ ja words: このマシンのサインインを記憶する · 記憶したパスワードが通りませんでした… · 保管庫に封印', f7);
  await type(p, PW);
  ok(await connected(p), '⑦ typed ⇒ connected');
  p.close();
}

console.log('⑧ RED CONTROL');
{
  const s = await stateOf();
  const p = await page('zh');
  bridge = mkBridge(DSblind);
  await p.ev('window.__open()');
  const askedBlind = await asked(p, 10000);
  bridge = mkBridge(DS);
  await p.ev('window.__closeAll()');
  await p.ev('window.__open()');
  const upReal = await connected(p);
  const dlgReal = await p.ev(`!!document.querySelector('${DLG}')`);
  ok(s && s.auto && askedBlind && upReal && !dlgReal, '⑧ a relay that ignores the remembered sign-in ⇒ the window ASKS (the real one: by itself) — ②\'s leg can fail', { auto: s && s.auto, askedBlind, upReal, dlgReal });
  p.close();
}

for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 3 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);
try { access.shutdown(); } catch { /* gone */ }
try { eng.close(); } catch { /* gone */ }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
