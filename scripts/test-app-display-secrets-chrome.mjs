#!/usr/bin/env node
// lane app-display-secrets HEAVY (B-4a59 piece 4): a real Chrome on the plan's private bus. With the Secret Service it
// keeps its OSCrypt key there ("v11" ciphertext, the store counts it) and a cookie it was given decrypts after a browser
// restart; the RED control — the setting off, no service — is Chrome's basic store ("v10"). The window's ⋯ ▸ Stored
// logins row is the REAL showContextMenu (esbuild iife of src/lib/utils.js + style.css) with the store's own count
// → PNG (VS_SECRETS_PNG). Fixtures only: scratch Xvfb (pinned high), HOME, runtime dir, profile; never the owner's bus.
// lane secrets-chrome-skip: a machine without the portal binaries (the CI runner) or python3-gi is a SKIP with the
// plan's / the facts' why (rc 0) BEFORE any plan.dirs use — test-desktop-app-rung-chrome's pattern for xpra.
// lane display-secret-fd (B-6c6d): ①b is the finding's own measurement — WHILE the real Chrome runs on the private
// bus, every readable /proc/<pid>/environ on this box is scanned for the per-display key: only a planted control
// (the scan's own positive control) holds it — never dbus-daemon, never a service it activated, never the app.
import { createRequire } from 'module';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';
import { spawn, spawnSync } from 'child_process';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require(path.join(ROOT, 'src/desktop-apps.js')), D = require(path.join(ROOT, 'src/desktop-display.js'));
const CHROME = ['/opt/google/chrome/chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${x ? ` — ${x}` : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-adsec-h-')), kids = [];
const env = { PATH: process.env.PATH, HOME: path.join(tmp, 'home'), XDG_RUNTIME_DIR: path.join(tmp, 'run') };
for (const d of [env.HOME, env.XDG_RUNTIME_DIR]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
// a display nobody holds: neither a socket nor a lock (a killed Xvfb leaves both — 188..193 were all stale on the hub)
const DISP = `:${Array.from({ length: 24 }, (_, i) => 188 + i).find((n) => !fs.existsSync(`/tmp/.X11-unix/X${n}`) && !fs.existsSync(`/tmp/.X${n}-lock`))}`;
const pre = M.portalPlan({ dir: path.join(tmp, 'pre'), display: DISP, authFile: null, bins: D.portalBins({ env }), why: 'browser' });
const preFacts = pre.ok ? await D.appSecretsFacts({ env, mode: 'on', dataDir: path.join(tmp, 'pre-data'), id: 'da-pre' }) : null;
const skipWhy = !pre.ok ? `portalPlan: ${pre.why}` : /^python3 /.test((preFacts && preFacts.why) || '') ? `appSecretsFacts: ${preFacts.why}` : null;
if (skipWhy) { console.log(`SKIP: ${skipWhy}`); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0); }
const srv = http.createServer((q, s) => { s.writeHead(200, { 'Set-Cookie': 'sid=kept-across-restart; Max-Age=86400', 'Content-Type': 'text/html' }); s.end('<title>login</title><p>hi'); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${srv.address().port}/`;
async function cdp(prof) { // DevToolsActivePort → the browser target's websocket
  for (let i = 0; i < 100; i++) { try { const [port, p] = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n'); const ws = new WebSocket(`ws://127.0.0.1:${port}${p}`); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); let n = 0; const wait = new Map(); ws.onmessage = (m) => { const o = JSON.parse(m.data); if (wait.has(o.id)) { wait.get(o.id)(o); wait.delete(o.id); } }; return { ws, send: (method, params = {}, sessionId) => new Promise((r) => { const id = ++n; wait.set(id, r); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }) }; } catch { await sleep(100); } }
  throw new Error('no DevToolsActivePort');
}
let chromeChild = null; // lane display-secret-fd: the running app, for the environ census
async function chromeRun(appDir, plan, prof, fn) {
  try { fs.unlinkSync(path.join(prof, 'DevToolsActivePort')); } catch { /* first run */ }
  const c = spawn(CHROME, [`--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--disable-features=ChromeWhatsNewUI', 'about:blank'], { env: { ...env, DISPLAY: DISP, DBUS_SESSION_BUS_ADDRESS: plan.address, XDG_CURRENT_DESKTOP: 'GNOME' }, stdio: 'ignore' });
  kids.push(c); chromeChild = c;
  const b = await cdp(prof);
  const out = await fn(b);
  await b.send('Browser.close'); for (let i = 0; i < 100 && c.exitCode === null; i++) await sleep(100);
  return out;
}
async function bus(appDir, mode) {
  const plan = M.portalPlan({ dir: appDir, display: DISP, authFile: null, bins: D.portalBins({ env }), why: 'browser' });
  const facts = mode === 'on' ? await D.appSecretsFacts({ env, mode, dataDir: path.join(tmp, 'data'), id: path.basename(appDir) }) : { off: true };
  const ss = M.secretServicePlan({ plan, facts });
  if (ss.files.length) plan.files.push(...ss.files); // lane display-secret-fd: the service file + the one-shot key file; the key never rides the bus env
  const child = await D.startPortalBus({ plan, env, logFd: fs.openSync(path.join(appDir, 'app.log'), 'a') }); kids.push(child);
  return { plan, ss, child, facts };
}
// lane display-secret-fd: every process on this box whose environ holds `needle` — the agent's `cat /proc/*/environ`
const commOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { return '?'; } };
function procHolders(needle) {
  const out = []; let read = 0;
  for (const d of fs.readdirSync('/proc')) {
    if (!/^[0-9]+$/.test(d)) continue;
    let text = '';
    try { text = fs.readFileSync(`/proc/${d}/environ`, 'utf8'); } catch { continue; } // another user's, or gone
    read++;
    if (text.includes(needle)) out.push(`${d} ${commOf(d)}`);
  }
  return { out, read };
}
const prefixes = (prof) => spawnSync('python3', ['-c', 'import sqlite3,sys; print(",".join(sorted({bytes(r[0][:3]).decode("latin1") for r in sqlite3.connect(sys.argv[1]).execute("select encrypted_value from cookies")})))', path.join(prof, 'Default', 'Cookies')], { encoding: 'utf8' }).stdout.trim();
const visit = async (b) => { const { targetId } = (await b.send('Target.createTarget', { url: URL0 })).result; await sleep(1500); const all = (await b.send('Storage.getCookies')).result.cookies; await b.send('Target.closeTarget', { targetId }); return all; };
try {
  if (!CHROME) throw new Error('no Chrome on this machine');
  const X = spawn('Xvfb', [DISP, '-nolisten', 'tcp', '-screen', '0', '1280x800x24'], { stdio: 'ignore' }); kids.push(X); await sleep(600);
  console.log(`① with the Secret Service (Chrome ${spawnSync(CHROME, ['--version'], { encoding: 'utf8' }).stdout.trim()}, ${DISP})`);
  const appOn = path.join(tmp, 'data', 'desktop-apps', 'da-chrome1'); fs.mkdirSync(appOn, { recursive: true });
  const profOn = path.join(tmp, 'prof-on');
  let b1 = await bus(appOn, 'on');
  const c1 = await chromeRun(appOn, b1.plan, profOn, visit);
  check('Chrome took the cookie', c1.some((c) => c.name === 'sid' && c.value === 'kept-across-restart'));
  check('Chrome sealed it with the KEYRING key (v11), not the basic store', prefixes(profOn) === 'v11', prefixes(profOn));
  const n1 = D.appSecretsOf({ rec: { secrets: 'on' }, dir: appOn }).count;
  check('the app\'s store keeps Chrome\'s item (the ⋯ count)', n1 >= 1, String(n1));
  b1.child.kill('SIGTERM'); await sleep(800); b1 = await bus(appOn, 'on'); // the whole session restarts: a NEW bus + service reads the sealed file
  const c2 = await chromeRun(appOn, b1.plan, profOn, async (b) => (await b.send('Storage.getCookies')).result.cookies);
  check('after a browser + bus restart the cookie still decrypts (the key round-tripped through the sealed store)', c2.some((c) => c.name === 'sid' && c.value === 'kept-across-restart'), JSON.stringify(c2.map((c) => c.name)));
  console.log('①b the environ census (lane display-secret-fd): the key is in NO process of this box but the planted control');
  await chromeRun(appOn, b1.plan, profOn, async () => {
    const keyHex = b1.facts.keyHex;
    const planted = spawn('sleep', ['5'], { env: { PATH: process.env.PATH, VS_SECRETS_SCAN_CONTROL: keyHex }, stdio: 'ignore' }); kids.push(planted);
    await sleep(300);
    const session = spawnSync('ps', ['-s', String(b1.child.pid), '-o', 'pid=,comm='], { encoding: 'utf8' }).stdout.trim().split('\n').map((l) => l.trim()).join(' · ');
    const { out, read } = procHolders(keyHex);
    console.log(`  census: ${read} environs read · the bus's session: ${session} · the app: ${chromeChild.pid} chrome`);
    check('ONLY the planted control holds the key — not dbus-daemon, not a service it activated, not the app (the scan proves itself on the control)', out.length === 1 && out[0] === `${planted.pid} sleep`, `${out.join(' · ')} (read ${read})`);
    check('the key file of this bring-up is gone — the service took it at start', !fs.existsSync(b1.ss.keyFile), b1.ss.keyFile);
    planted.kill('SIGKILL');
  });
  const log = fs.readFileSync(path.join(appOn, 'app.log'), 'utf8');
  check('Chrome\'s libsecret opened a plain session; nothing it stored is in the log', /OpenSession plain/.test(log) && !/kept-across-restart/.test(log), log.split('\n').filter((l) => l.includes('[secrets]')).slice(0, 4).join(' / '));
  console.log('② RED control: the setting off (no service on the bus)');
  const appOff = path.join(tmp, 'data', 'desktop-apps', 'da-chrome2'); fs.mkdirSync(appOff, { recursive: true });
  const profOff = path.join(tmp, 'prof-off'), b2 = await bus(appOff, 'off');
  await chromeRun(appOff, b2.plan, profOff, visit);
  check('no service ⇒ Chrome falls back to its basic store (v10)', prefixes(profOff) === 'v10', prefixes(profOff));
  console.log('③ the window\'s ⋯ ▸ Stored logins (the real showContextMenu, the store\'s count)');
  const esb = require(path.join(ROOT, 'node_modules/esbuild'));
  const entry = `import { showContextMenu } from './src/lib/utils.js'; import { t } from './src/lib/i18n.js';
    window.go = (n) => { showContextMenu(40, 40, [{ label: t('Scale'), children: [] }, { label: t('Stored logins ({n})', { n }), children: [{ label: t('VibeSpace keeps this app\\'s logins for it in its own session; after you forget them the app asks again.'), disabled: true }, { label: t('Forget all'), action() {} }] }, { label: t('Keep running'), action() {} }, { label: t('Stop app'), action() {} }]);
      const it = [...document.querySelectorAll('.context-menu *')].find((r) => r.children.length && /^Stored logins/.test(r.textContent.trim())) || [...document.querySelectorAll('.context-menu *')].find((r) => /^Stored logins/.test(r.textContent.trim()));
      if (it) it.dispatchEvent(new MouseEvent('mouseenter')); };`;
  const js = (await esb.build({ stdin: { contents: entry, resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'silent' })).outputFiles[0].text;
  fs.writeFileSync(path.join(tmp, 'menu.html'), `<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="file://${ROOT}/public/style.css"></head><body style="background:#1e1e1e;width:900px;height:360px"><script>${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`);
  const pngOut = process.env.VS_SECRETS_PNG || path.join(tmp, 'menu.png');
  await chromeRun(appOn, b1.plan, path.join(tmp, 'prof-png'), async (b) => {
    const { targetId } = (await b.send('Target.createTarget', { url: `file://${tmp}/menu.html` })).result;
    const { sessionId } = (await b.send('Target.attachToTarget', { targetId, flatten: true })).result;
    await sleep(800); await b.send('Runtime.evaluate', { expression: `go(${n1})` }, sessionId); await sleep(700);
    const txt = (await b.send('Runtime.evaluate', { expression: '[...document.querySelectorAll(".context-menu")].map((m) => m.innerText).join(" | ")', returnByValue: true }, sessionId)).result.result.value;
    check('the ⋯ menu reads "Stored logins (n)" with the store\'s count + Forget all', txt.includes(`Stored logins (${n1})`) && /Forget all/.test(txt), txt.slice(0, 200));
    await b.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 360, deviceScaleFactor: 1, mobile: false }, sessionId);
    fs.writeFileSync(pngOut, Buffer.from((await b.send('Page.captureScreenshot', { format: 'png' }, sessionId)).result.data, 'base64'));
  });
  check('PNG written', fs.statSync(pngOut).size > 5000, pngOut);
} finally {
  srv.close(); for (const k of kids.reverse()) { try { k.kill('SIGKILL'); } catch { /* gone */ } }
  await sleep(300); fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
