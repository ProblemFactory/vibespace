#!/usr/bin/env node
// THE REMOTEAPP SETTINGS CARD in a real browser (design q-024 r1 §1.4, lane remoteapp-r1b) — heavy: headless Chrome over the
// REAL machine dialog (src/lib/machine-desktop.js) and card (src/lib/remoteapp-card.js), the REAL routes, access layer,
// integration store and keeper machine half — a stand-in paired Windows machine (its `remoteapp-facts` answer switchable,
// its 3389 a loopback server) and the fake xfreerdp holding a fixture certificate (scripts/fixtures/remoteapp/server-*.pem).
//   §1 the door: a Windows machine's dialog shows «RemoteApp settings…», never greyed; it opens the card
//   §2 the facts table: a Home machine with Remote Desktop off — four rows, each unmet fact a SENTENCE (the design's own
//      words in zh), the two admin commands behind «Copy the admin command» (shown in the fold, never run), not ready; no
//      control in the card is greyed; the fixed console-takeover sentence; the card grammar — every raw string (the
//      registry paths, the PowerShell, a fingerprint) only inside the ONE 技术细节 fold
//   §3 save SEALS: the typed password reaches the store as ciphertext, the page hears "set" (the box cleared, its
//      placeholder says so) and never holds it again
//   §4 「首次连接」 pins: the certificate the machine showed (the fixture's sha256) on the sealed row; the button becomes
//      「重新信任」; the facts re-read on a ready machine say ready; an agent too old says the version it needs
//   §5 a CHANGED certificate refuses: the launch ends rdp_cert_changed, the card says so with 「重新信任」, which pins the new one
//   §6 the phone (390 px): the same card, nothing past the edge; en words; PNGs (`--shots <dir>`): desk + phone, zh + en
//   CONTROL: a card built without the console-takeover sentence fails the words census (§2's sentence leg would be red)
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const D = require(path.join(REPO, 'src/desktop-display.js'));
const K = require(path.join(REPO, 'src/server/desktop-app-keeper.js'));
const A = require(path.join(REPO, 'src/server/desktop-access.js'));
const IS = require(path.join(REPO, 'src/server/integration-store.js'));
const R = require(path.join(REPO, 'src/routes/desktop-apps.js'));
const RA = require(path.join(REPO, 'src/remoteapp.js'));
const ZH = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default;
const express = require('express');
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
// the exit hooks run in order: Chrome and the sessions are ended BEFORE scratch()'s own hook removes the dir (Chrome alive
// would still be writing its profile into it)
let chrome = null, srv = null, machineSrv = null, keeper = null;
const bye = () => { try { if (chrome) process.kill(-chrome.pid, 'SIGKILL'); } catch { } try { srv && srv.close(); machineSrv && machineSrv.close(); } catch { } try { if (keeper) for (const r of keeper.machine.listApps()) for (const pid of Object.values(r.pids || {})) if (pid) { try { process.kill(-pid, 'SIGKILL'); } catch { } } } catch { } }; // Chrome's whole process group: its helpers too
process.on('exit', bye);
const root = scratch('racard'); fs.mkdirSync(root, { recursive: true });

// ── fixtures from SHAPES: a password built at runtime, a host id, two fixture certificates ──
const PW = ['Rw', crypto.randomBytes(6).toString('hex'), '-q#7'].join('');
const HOST = 'dev-' + 'w1n';
const FAKE = path.join(REPO, 'scripts/fixtures/remoteapp/xfreerdp');
const PEM_A = path.join(REPO, 'scripts/fixtures/remoteapp/server-a.pem'), PEM_B = path.join(REPO, 'scripts/fixtures/remoteapp/server-b.pem');
const fpOf = (f) => new crypto.X509Certificate(fs.readFileSync(f)).fingerprint256.toLowerCase();
const home = path.join(root, 'home'); fs.mkdirSync(home, { recursive: true });
machineSrv = net.createServer((s) => { s.on('data', (b) => { if (String(b).includes('VS-FAKE-RDP hello')) s.write('VS-FAKE-MACHINE 3389\n'); }); s.on('error', () => { }); });
await new Promise((r) => machineSrv.listen(0, '127.0.0.1', r));
let factsAnswer = null;
const factsOf = (o) => RA.parseRemoteappFacts(JSON.stringify({ t: 'remoteapp-facts', edition: 'Professional', product: 'Windows 11 Pro', build: '26100', deny: '0', listening: 1, allowList: '1', gpu: '1', ...o }));
const dm = {
  status: () => ({ connected: true, info: { platform: 'win32' } }),
  desktopServe: async () => ({ ok: false, code: 'unused', error: 'this stand-in runs no desktop-serve op' }),
  desktopAppsList: async () => ({ rows: [{ name: 'Notepad', launch: 'start "" "C:\\Windows\\System32\\notepad.exe"', source: 'start-menu' }], listedAt: Date.now(), total: 1 }),
  remoteappFacts: async () => { if (factsAnswer === 'old') { const e = new Error('daemon lacks remoteapp-facts (capabilities gate)'); e.code = 'host_needs_daemon'; e.daemonVersion = '2.369.250'; throw e; } return factsAnswer; },
  tcpForward: async (port) => {
    if (port !== 3389) throw new Error(`nothing listens on ${port}`);
    const s = net.connect(machineSrv.address().port, '127.0.0.1');
    await new Promise((r, j) => { s.once('connect', r); s.once('error', j); });
    const h = { onData: null, onClose: null, write: (b) => s.write(b), close: () => s.destroy() };
    s.on('data', (b) => h.onData && h.onData(b)); s.on('close', () => h.onClose && h.onClose()); s.on('error', () => { });
    return h;
  },
};
const hosts = { deviceBounded: async () => dm, get: (id) => (id === HOST ? { id, name: 'Lab PC' } : null), isLocal: (id) => !id || id === 'local', list: () => [] };
let serverPid = null;
const stubDisplay = {
  ...D,
  hostFacts: async () => ({ hostId: 'local', bins: { xpra: '/usr/bin/xpra', xfreerdp: FAKE }, xpra: null }),
  RECIPES: { ...D.RECIPES, 'xpra-seamless': async (ctx) => { const sp = D.spawnDetached('sleep', ['300'], { env: ctx.base, logFd: ctx.logFd }); const c = await sp.spawned; serverPid = c.pid; ctx.onPart('x', c, { alsoServer: true, display: ':4242', port: 1 }); return { display: ':4242', port: 1, probe: 'http', wm: false }; } },
  waitForListen: async () => ({ ok: true }), listenerHeldBy: () => serverPid, waitForXftDpi: async () => ({ ok: true }),
  windowTree: async () => { throw new Error('no X here'); }, enumerateWindows: async () => { throw new Error('no X here'); },
};
const quiet = { log() { }, warn() { }, error() { }, info() { } };
const dataDir = path.join(root, 'data');
const store = IS.create({ dataDir, env: {}, broadcast: () => { }, log: quiet });
let serverPem = PEM_A;
const acc = A.create({ hosts, local: () => keeper.machine, install: false, integrations: store, log: quiet });
// the sh fake on a runner-shaped PATH (no node needed); the server fingerprint passed, never parsed by the fake
keeper = K.create({ dataDir, env: () => ({ PATH: `${path.dirname(FAKE)}:/usr/bin:/bin`, HOME: home, VS_FAKE_RDP_WINDOW: '0', VS_FAKE_RDP_SERVER_PEM: serverPem, VS_FAKE_RDP_SERVER_FP: fpOf(serverPem), VS_FAKE_RDP_PASSWORD_SHA256: sha(PW) }), broadcast: () => { }, display: stubDisplay, access: () => acc, log: quiet, serverSetting: () => undefined });
R.setup({ keeper, access: acc, vnc: {} });

// ── the page: the real dialog + card, and (the CONTROL) a card built without the console-takeover sentence ──
const cardSrc = fs.readFileSync(path.join(REPO, 'src/lib/remoteapp-card.js'), 'utf8');
const anchor = '  const takeover = el(\'p\', \'ra-takeover\', consoleTakeoverWords());';
ok(cardSrc.split(anchor).length === 2, 'the control\'s anchor is found once in the card');
const mutCard = cardSrc.replace(anchor, "  const takeover = el('p', 'ra-takeover-gone', '');").replace('export function openRemoteappSettings(', 'export function openRemoteappSettingsMut(');
const entry = `import { showMachineDesktopDialog } from ${JSON.stringify(path.join(REPO, 'src/lib/machine-desktop.js'))};
import { openRemoteappSettings } from ${JSON.stringify(path.join(REPO, 'src/lib/remoteapp-card.js'))};
const wm = { windows: new Map(), revealWindow() {}, createWindow() { const el = document.createElement('div'); return { id: 'w', element: el, content: el }; }, setTitle() {}, closeWindow() {} };
const app = { wm, openDesktopApp() {} };
window.__openDialog = (m) => { document.getElementById('machine-desktop-dialog')?.remove(); showMachineDesktopDialog(app, m, { recheck: async () => m }); };
window.__openCard = (m) => openRemoteappSettings(app, m);`;
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
await esbuild.build({ stdin: { contents: mutCard + '\nwindow.__openCardMut = (m) => openRemoteappSettingsMut({}, m);\n', resolveDir: path.join(REPO, 'src/lib'), loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'mut.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
const app = express(); app.use(express.json()); app.use(R.router);
const CSS = ['style', 'viewers', 'chat', 'fonts'].filter((n) => fs.existsSync(path.join(REPO, `public/${n}.css`)));
for (const n of CSS) app.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
for (const f of ['page.js', 'mut.js']) app.get(`/${f}`, (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, f))));
app.get('/', (q, s) => s.type('text/html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-root);font-family:system-ui,sans-serif}</style></head><body><script src="/${q.query.mut ? 'mut' : 'page'}.js"></script></body></html>`));
const PORT = await freePort();
srv = http.createServer(app); await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { stdio: 'ignore', env: cenv, detached: true }); // its own process group (ended whole)
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h, lang, { mut = false } = {}) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 }); await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/${mut ? '?mut=1' : ''}` });
  const fn = mut ? '__openCardMut' : '__openCard';
  for (let i = 0; i < 100 && !(await ev(`typeof window.${fn} === "function"`).catch(() => false)); i++) await sleep(100);
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
  const shot = async (file) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const pic = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  return { cdp, ev, waitFor, shot, close: () => ws.close() };
}
const ROW = { hostId: HOST, name: 'Lab PC', label: 'Lab PC', code: 'desktop_ready', auth: 'none', setup: 'win32', desktop: 'vnc-native', selectable: true };
const CARD = "document.querySelector('#remoteapp-settings')";
const toastHas = (re) => `[...document.querySelectorAll('.toast, [class*="toast"]')].some((t) => ${re}.test(t.textContent))`;
const z = (k, v = {}) => String(ZH[k]).replace(/\{(\w+)\}/g, (m, n) => (n in v ? v[n] : m));
const SENTENCE_TAKEOVER = 'RDP 登录后那台机器的屏幕会显示锁屏；正在它面前用的人会被挤出。适合无人值守的机器';
const takeoverCensus = `(() => { const c = ${CARD}; return !!c && c.textContent.includes(${JSON.stringify(SENTENCE_TAKEOVER)}); })()`;

console.log('§1 the door — a Windows machine\'s dialog opens the card');
factsAnswer = factsOf({ edition: 'Core', product: 'Windows 11 Home', deny: '1', listening: 0, allowList: null, gpu: null });
const p = await page(1100, 1700, 'zh'); // tall enough for the whole card in one PNG
{
  await p.ev(`window.__openDialog(${JSON.stringify(ROW)})`);
  ok(await p.waitFor(`!!document.querySelector('.machine-remoteapp-settings')`), 'the machine dialog of a Windows machine shows «RemoteApp settings…»');
  const b = await p.ev(`(() => { const b = document.querySelector('.machine-remoteapp-settings'); return { text: b.textContent, disabled: b.disabled }; })()`);
  ok(b.text === ZH['RemoteApp settings…'] && b.disabled === false, 'its zh words, never greyed', b);
  await p.ev(`document.querySelector('.machine-remoteapp-settings').click()`);
  ok(await p.waitFor(`!!${CARD} && document.querySelectorAll('#remoteapp-settings .ra-fact').length === 4`), 'it opens the card, and the machine\'s facts arrive: four rows');
}

console.log('§2 the facts table — sentences, doors, the takeover line, one fold');
{
  const rows = await p.ev(`[...document.querySelectorAll('#remoteapp-settings .ra-fact')].map((r) => ({ key: r.dataset.fact, met: r.dataset.met, state: r.querySelector('.ra-fact-state').textContent, copy: !!r.querySelector('.ra-copy') }))`);
  ok(JSON.stringify(rows.map((r) => [r.key, r.met])) === '[["edition","0"],["rdp","0"],["allowlist","0"],["gpu","0"]]', 'a Home machine with Remote Desktop off: edition / Remote Desktop / allow list / GPU — each unmet', rows);
  ok(rows[0].state === '这台是 Windows Home，没有远程桌面服务；RemoteApp 做不了，「作为独立窗口运行…」（裁剪画面）可用', 'the Home sentence (the design\'s words, the cropped mode named by its button)', rows[0].state);
  ok(rows[1].state === '打开 设置 → 系统 → 远程桌面；无需开放防火墙到局域网', 'Remote Desktop off: the design\'s sentence verbatim', rows[1].state);
  ok(rows[2].state === z('Windows opens only listed programs as RemoteApps; copy the admin command and run it once in an administrator PowerShell on {machine}', { machine: 'Lab PC' }) && rows[2].copy && rows[3].copy && !rows[0].copy && !rows[1].copy, 'the allow list and the GPU policy: a sentence + «复制管理员命令» (their door); the edition and Remote Desktop rows: a sentence only', rows.map((r) => r.copy));
  ok(rows[3].state === 'Blender 这类走软件渲染；要 GPU 请用管理员命令开这条策略', 'the GPU policy\'s sentence (the design\'s words + the admin command)', rows[3].state);
  ok(await p.ev(`(() => { const r = document.querySelector('#remoteapp-settings [data-ready]'); return r && r.dataset.ready === '0' && r.textContent === ${JSON.stringify(z('{machine} is not ready for RemoteApp yet', { machine: 'Lab PC' }))}; })()`), 'not ready, said in words');
  ok(await p.ev(takeoverCensus) && await p.ev(`document.querySelector('#remoteapp-settings .ra-takeover').textContent === ${JSON.stringify(SENTENCE_TAKEOVER)}`), 'the fixed console-takeover sentence, the design\'s words verbatim (no machine name)');
  const greyed = await p.ev(`[...document.querySelectorAll('#remoteapp-settings button, #remoteapp-settings input')].filter((x) => x.disabled).map((x) => x.textContent || x.name)`);
  ok(greyed.length === 0, 'no control in the card is greyed (an unmet fact is a sentence with its door)', greyed);
  const g = await p.ev(`(() => { const c = ${CARD}; const fold = c.querySelector('[data-fold="tech"]'); const clone = c.cloneNode(true); clone.querySelectorAll('[data-fold="tech"]').forEach((f) => f.remove()); const out = clone.textContent; return { folds: c.querySelectorAll('[data-fold="tech"]').length, outRaw: /HKLM|New-ItemProperty|Get-ItemProperty|([0-9a-f]{2}:){31}[0-9a-f]{2}|https?:\\/\\//.test(out), inFold: fold.textContent }; })()`);
  ok(g.folds === 1 && g.outRaw === false && g.inFold.includes(RA.ALLOWLIST_COMMAND) && g.inFold.includes(RA.GPU_COMMAND), 'the card grammar: ONE 技术细节 fold holds both admin commands; no registry path, PowerShell or fingerprint outside it', { folds: g.folds, outRaw: g.outRaw });
  await p.ev(`document.querySelector('#remoteapp-settings .ra-fact[data-fact="allowlist"] .ra-copy').click()`);
  ok(await p.waitFor(toastHas(`/${z('Copied — paste it into an administrator PowerShell on {machine}', { machine: 'Lab PC' }).slice(0, 3)}/`)), '«复制管理员命令» copies the line and says where it goes (VibeSpace never runs it)');
  await p.shot('remoteapp-card.facts.zh.1100.png');
}

console.log('§3 save seals');
{
  await p.ev(`(() => { const c = ${CARD}; const set = (n, v) => { const i = c.querySelector('input[name="' + n + '"]'); i.value = v; i.dispatchEvent(new Event('input')); }; set('user', 'someone'); set('password', ${JSON.stringify(PW)}); c.querySelector('.ra-save').click(); })()`);
  ok(await p.waitFor(toastHas(`/${z('Saved {machine}’s sign-in', { machine: 'Lab PC' })}/`)), 'Save ⇒ 「已保存 Lab PC 的登录信息」');
  const file = fs.readFileSync(path.join(dataDir, 'integrations.json'), 'utf8');
  ok(file.includes(`remoteapp/${HOST}`) && !file.includes(PW) && store.resolveMachine('remoteapp', HOST).values.password === PW && store.resolveMachine('remoteapp', HOST).values.user === 'someone', 'the store holds the sign-in, the password SEALED (integrations.json: ciphertext only)');
  const pg = await p.ev(`(() => { const c = ${CARD}; const pw = c.querySelector('input[name="password"]'); return { value: pw.value, ph: pw.placeholder, html: document.documentElement.outerHTML.includes(${JSON.stringify(PW)}) }; })()`);
  ok(pg.value === '' && pg.ph === ZH['Saved — type to replace'] && pg.html === false, 'the page holds it no more: the box cleared, its placeholder says saved, no byte of it in the document', pg);
}

console.log('§4 the first connection pins');
{
  const before = await p.ev(`(() => { const c = ${CARD}; return { state: c.querySelector('.ra-cert').dataset.state, btn: c.querySelector('.ra-trust').textContent }; })()`);
  ok(before.state === 'none' && before.btn === '首次连接', 'no pin yet: 「首次连接」', before);
  await p.ev(`${CARD}.querySelector('.ra-trust').click()`);
  ok(await p.waitFor(`${CARD}.querySelector('.ra-cert').dataset.state === 'pinned'`), 'pressed ⇒ the certificate line says pinned');
  const after = await p.ev(`(() => { const c = ${CARD}; return { btn: c.querySelector('.ra-trust').textContent, line: c.querySelector('.ra-cert').textContent, fold: c.querySelector('[data-fold="tech"]').textContent }; })()`);
  ok(store.machineView('remoteapp', HOST).values.certFp === fpOf(PEM_A) && after.fold.includes(fpOf(PEM_A)) && after.btn === '重新信任' && after.line === z('{machine}’s certificate is pinned; every launch checks it.', { machine: 'Lab PC' }), 'the machine certificate\'s sha256 pinned on the sealed row (shown only in the fold); the button is now 「重新信任」', after.btn);
  ok(await p.ev(toastHas(`/${z('Signed in to {machine} and pinned its certificate', { machine: 'Lab PC' })}/`)), 'said: 「已登录 Lab PC 并钉住它的证书」');
  factsAnswer = factsOf({});
  await p.ev(`${CARD}.querySelector('.ra-recheck').click()`);
  ok(await p.waitFor(`(() => { const r = document.querySelector('#remoteapp-settings [data-ready]'); return r && r.dataset.ready === '1' && document.querySelectorAll('#remoteapp-settings .ra-fact[data-met="1"]').length === 4; })()`), '«再检查一次» on a set-up Pro machine: every row met, ready');
  await p.shot('remoteapp-card.ready.zh.1100.png');
  factsAnswer = 'old';
  await p.ev(`${CARD}.querySelector('.ra-recheck').click()`);
  const need = require(path.join(REPO, 'package.json')).version;
  ok(await p.waitFor(`${CARD}.querySelector('.ra-facts').textContent === ${JSON.stringify(z('{machine}’s agent ({have}) cannot read these settings; it needs version {need} or later', { machine: 'Lab PC', have: '2.369.250', need }))}`), 'an agent too old: the version it has and the one it needs, in words (never a guess)');
  factsAnswer = factsOf({});
}

console.log('§5 a changed certificate refuses');
{
  serverPem = PEM_B;
  const v = await acc.launchRemoteApp(HOST, { program: 'notepad.exe' }).catch((e) => ({ id: null, e }));
  const end = await until(() => { const r = v.id && keeper.get(v.id); return r && !['launching', 'ready'].includes(r.state) ? r : null; });
  ok(end && end.rdp.ended === 'rdp_cert_changed', 'the machine shows another certificate ⇒ the launch ends rdp_cert_changed', end && end.rdp);
  await until(() => acc.forwards().length === 0);
  await p.ev(`window.__openCard(${JSON.stringify(ROW)})`);
  ok(await p.waitFor(`${CARD}.querySelector('.ra-cert').dataset.state === 'refused'`), 'the card reopened says refused');
  const r = await p.ev(`(() => { const c = ${CARD}; return { line: c.querySelector('.ra-cert').textContent, btn: c.querySelector('.ra-trust').textContent }; })()`);
  ok(r.line === z('{machine} showed a different certificate at the last launch, so the launch was refused. If the machine was reinstalled, trust it again.', { machine: 'Lab PC' }) && r.btn === '重新信任', 'its sentence and 「重新信任」', r);
  await p.shot('remoteapp-card.refused.zh.1100.png');
  await p.ev(`${CARD}.querySelector('.ra-trust').click()`);
  ok(await p.waitFor(`${CARD}.querySelector('.ra-cert').dataset.state === 'pinned'`) && store.machineView('remoteapp', HOST).values.certFp === fpOf(PEM_B), '「重新信任」 pins the new certificate');
  ok(await p.ev(toastHas(`/${z('Signed in to {machine} and pinned its new certificate', { machine: 'Lab PC' })}/`)), 'said: the NEW certificate');
  const v2 = await acc.launchRemoteApp(HOST, { program: 'notepad.exe' }).catch((e) => ({ id: null, e }));
  const r2 = await until(() => { const x = v2.id && keeper.get(v2.id); return x && x.state !== 'launching' ? x : null; });
  ok(r2 && r2.state === 'ready', 'and the next launch connects');
  if (v2.id) await keeper.machine.stop(v2.id).catch(() => { }); await until(() => acc.forwards().length === 0);
  p.close();
}

console.log('§6 the phone, en, the PNGs');
{
  factsAnswer = factsOf({ allowList: '0', gpu: null });
  const ph = await page(390, 844, 'zh');
  await ph.ev(`window.__openCard(${JSON.stringify(ROW)})`);
  ok(await ph.waitFor(`document.querySelectorAll('#remoteapp-settings .ra-fact').length === 4`), 'the card opens on a phone');
  const geo = await ph.ev(`(() => { const d = document.querySelector('.dialog.remoteapp-settings').getBoundingClientRect(); const over = [...document.querySelectorAll('#remoteapp-settings button, #remoteapp-settings input')].filter((x) => { const b = x.getBoundingClientRect(); return b.width && (b.right > innerWidth + 0.5 || b.left < -0.5); }).map((x) => x.className || x.name); const inp = document.querySelector('#remoteapp-settings input[name="user"]').getBoundingClientRect().width; return { w: d.width, right: d.right, over, inp }; })()`);
  ok(geo.right <= 390 && geo.over.length === 0 && geo.inp > 200, 'the same card at 390 px: nothing past the edge, the boxes keep their width', geo);
  await ph.shot('remoteapp-card.zh.390.png');
  await ph.ev(`${CARD}.querySelector('.ra-trust').scrollIntoView({ block: 'end' })`);
  await ph.shot('remoteapp-card.zh.390.bottom.png');
  ph.close();
  const en = await page(1100, 1700, 'en');
  await en.ev(`window.__openCard(${JSON.stringify(ROW)})`);
  ok(await en.waitFor(`document.querySelectorAll('#remoteapp-settings .ra-fact').length === 4`), 'en: the card opens');
  const enText = await en.ev(`${CARD}.textContent`);
  ok(enText.includes('After the Remote Desktop sign-in, that machine’s own screen shows its lock screen') && enText.includes('Windows opens only listed programs as RemoteApps') && enText.includes('Trust again'), 'en: the takeover sentence, the allow-list sentence, «Trust again» (pinned)');
  await en.shot('remoteapp-card.en.1100.png');
  en.close();
}

console.log('CONTROL — the words census can fail');
{
  const m = await page(1100, 1000, 'zh', { mut: true });
  await m.ev(`window.__openCardMut(${JSON.stringify(ROW)})`);
  ok(await m.waitFor(`document.querySelectorAll('#remoteapp-settings .ra-fact').length === 4`), 'the control card opens (the same card, its takeover line removed)');
  ok((await m.ev(takeoverCensus)) === false, 'CONTROL: a card without the console-takeover sentence fails the census (§2\'s sentence leg would be red)');
  m.close();
}

// end Chrome and wait for its group to be gone, so the scratch dir's removal at exit races nothing
try { process.kill(-chrome.pid, 'SIGKILL'); } catch { }
await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 3000); });
await sleep(200);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
