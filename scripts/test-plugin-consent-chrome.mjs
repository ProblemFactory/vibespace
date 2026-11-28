#!/usr/bin/env node
// test-plugin-consent-chrome — THE CONSENT DIALOG READS AS ONE BODY (lane plugin-consent-layout; the owner, 2026-11-01, on his
// hub enabling the custom browser kernel plugin: «界面有点问题» → «布局问题»). Headless Chrome over a COPY of this tree (src,
// public, server.js; the bundle built by esbuild) with a PLANTED plugin under data/plugins/ whose manifest declares
// `server: true` + `contributes.browserEngine: true` — the two bullets of the owner's screenshot — in zh, 1000 × 600, uiScale 1.
// Every measure is through the page (computed styles, rects), never the bundle's text:
//   ① the planted plugin is listed valid, disabled, asking for consent
//   ② a real press on its switch opens «以信任方式启用「…」？» with the two bullets (server-process, browser-engine)
//   ③ the explanation is the dialog's BODY text: its font-size = the bullets' font-size, its color is not the dim token's
//     (the hint tone), it is no `.usage-note` (the Usage window's note class)
//   ④ the list has its own rhythm: 12 ≤ padding-left ≤ 20 px (the outside marker inside the dialog's text column — at padding 0
//     the markers hung on the dialog's border), the list box at the intro's left edge, margin 0, rows ≈ 6 px apart
//   ⑤ no blank band: nothing between the title row and the explanation but the body's own padding (no box there taller
//     than the body's gap); the explanation sits one body gap above the list it introduces
//   ⑥ the browser-engine bullet's zh sentence names the program VibeSpace starts as a profile's browser
//   ⑦ Cancel closes it and the switch is off again
//   ⑧ the read-only variant (the chip's «查看能力…») — ③ ④ ⑤ again
//   ⑨ lane plugin-update-button (the owner, 2026-11-02: no Update on the row — it lived only in the chip's menu) + B-db5d (the
//     owner, 2026-11-18: «更新 卸载应该收进...里»): the planted plugin carries a GIT install record (ref main, the owner's shape)
//     ⇒ its row draws neither «更新…» nor «卸载…»: chip · switch · the ⚙'s unseen place · ONE «⋯», all inside the row and the
//     viewport at 1000 × 600 on one line, the name not squeezed; a REAL press on the «⋯» opens 更新… then 卸载…; the chip's menu
//     has no 更新; a real press on a path-installed plugin's «⋯» → «更新…» with nothing new at its source says «… 已是最新（0.1.0）».
//     PNG <prefix>-row.png = the planted plugin's row, <prefix>-more-menu.png = its «⋯» open. B-6944: the same Update by KEYBOARD
//     ALONE — Enter on the focused «⋯» opens the menu with the focus on «更新…», the arrows move, Escape gives the focus back, Enter updates
//     (each key waits on the element it should focus, never a fixed pause).
//   ⑩ B-6944's round (the coordinator's smalls): an update HELD in flight (its request paused at the page's door) — the «⋯» opened by
//     Enter puts the focus on its FIRST STOP, the OFF «更新…» with its why (never on «卸载…» behind it), Enter there presses nothing
//     (the same menu, no second request, no dialog), ArrowDown reaches «卸载…»; a menu opened BY CODE a moment after a key while a
//     text field holds the focus — no focus moved, no character lost — and while a desktop's picture (a canvas) holds it — the keys
//     stay there; the plant proven: the same open from a focused button takes the focus; the person's own MENU key (Shift+F10) in a
//     text field — the menu takes the focus, on a desktop's canvas the key stays the canvas's (control: on a button it takes it);
//     after the held update ends, Enter on the new «⋯» lands on the first stop; a window's menu opened after a key — its «➤» row's
//     submenu by ArrowRight (the focus in it), ArrowLeft back to its row (the submenu hidden), Escape.
// On 160045063 (the base — run this file on a `git archive` copy) ③ ④ ⑤ ⑥ are RED, in both variants (15 rows); on 63f59d572
// ⑨ is RED (no 更新… on the row, 更新 in the chip's menu, the press finds no button); on f6ad84f50 (B-db5d's checkpoint) ⑨ is RED
// (更新… / 卸载… drawn inline, no «⋯» on the row).
// PNGs: PLUGIN_CONSENT_PNG_DIR (default: the scratch root) <prefix>-consent.png / <prefix>-readonly.png, prefix =
// PLUGIN_CONSENT_SHOT_PREFIX (default 'run'). This box's own fonts (the zh words need a CJK face; the runner's DejaVu has none).
// Requires google-chrome (SKIP without). Run: node scripts/test-plugin-consent-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, realClicker, CHROME_QUIET, chromeBelt, chromeReach, reachFrom } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

const VNC_ENV = await vncEnv();
const ROOT = scratch('plugin-consent');
const SHOTS = process.env.PLUGIN_CONSENT_PNG_DIR || ROOT;
const PREFIX = process.env.PLUGIN_CONSENT_SHOT_PREFIX || 'run';
const BIN = path.join(ROOT, 'bin');
for (const d of [BIN, SHOTS]) fs.mkdirSync(d, { recursive: true });
const chromeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-consent-h-')), chromeRun = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-consent-run-'));
fs.chmodSync(chromeRun, 0o700);
const homes = [];
let chrome = null, srv = null;
const cleanup = () => {
  try { chrome && chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.kill('SIGKILL'); } catch { }
  for (const r of [ROOT, chromeHome, chromeRun, ...homes]) { try { endRootedProcesses(r); } catch { } }
  for (const d of [ROOT, chromeHome, chromeRun, ...homes]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
armWatchdog({ capMs: 240e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });

// a stub `claude` (the hub asks its version at boot; no conversation runs here)
fs.writeFileSync(path.join(BIN, 'claude'), `#!${process.execPath}\nif (process.argv.includes('--version')) console.log('2.1.308 (Claude Code) stub');\n`, { mode: 0o755 });

// ── THE TREE: a plain copy of this checkout (no git), its bundle built, the plugin planted ──
const wt = path.join(ROOT, 'tree');
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
const PID = 'consent.kernel';
const pdir = path.join(wt, 'data/plugins', PID);
fs.mkdirSync(pdir, { recursive: true });
fs.writeFileSync(path.join(pdir, 'vibespace-plugin.json'), J({ id: PID, version: '0.1.4', engines: { vibespace: '2.369.24' }, label: 'Custom Browser Kernel',
  description: 'A browser engine plugin (the shape of the owner\'s: its own server process, chosen as the agent browser).', server: true,
  contributes: { routes: true, browserEngine: true }, capabilities: { server: { fs: { read: [], write: [] }, net: [] } } }, null, 2));
fs.writeFileSync(path.join(pdir, 'server.js'), '// never started: the plugin stays disabled\n');
// ⑨: the planted plugin was installed from Git at ref main (the owner's Custom Browser Kernel) — its install record
fs.writeFileSync(path.join(wt, 'data/plugin-registry.json'), J({ enabled: {}, trust: {}, installs: { [PID]: { source: 'git', value: 'https://example.invalid/userW/custom-browser-kernel.git', ref: 'main', sha: '5e1f'.repeat(10), contentHash: null, installedAt: Date.now(), updatedAt: null, credential: null, by: 'user' } } }, null, 2));
// ⑨: a second plugin, installed through the page from a folder — its Update finds the same bytes
const HID = 'update.hello', hsrc = path.join(ROOT, 'hello-src');
fs.mkdirSync(hsrc, { recursive: true });
fs.writeFileSync(path.join(hsrc, 'vibespace-plugin.json'), J({ id: HID, version: '0.1.0', engines: { vibespace: '2.369.24' }, label: 'Update Hello', description: 'A plugin with nothing new at its source.' }, null, 2));

const port = await freePort();
const home = scratchHome('plugin-consent-home', fs); homes.push(home);
srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: 'ignore',
  env: { ...process.env, ...VNC_ENV, PORT: String(port), HOME: home, PATH: `${BIN}:${path.join(wt, 'data/bin')}:${process.env.PATH}`, CLAUDE_CMD: path.join(BIN, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
const origin = `http://127.0.0.1:${port}`;
let up = false;
for (let i = 0; i < 160 && !up; i++) { try { await fetch(`${origin}/api/home`); up = true; } catch { await sleep(250); } }
check('the tree\'s server answers', verdictOf(up));
if (!up) process.exit(1);

const CDP_PORT = await freePort();
chrome = spawn(CHROME, [...CHROME_QUIET, ...chromeBelt(), '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
  '--password-store=basic', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'],
{ stdio: 'ignore', env: { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun, DISPLAY: '' } });
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
  if (m.method === 'Fetch.requestPaused') heldReqs.push(m.params);   // ⑩: an update held in flight at the page's door
});
const heldReqs = [];
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  sock.send(J({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return !!(await evalJs(expr)); } catch { return false; } };
const realClick = realClicker({ evalJs, cdp });
const shot = async (name) => { try { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); const f = path.join(SHOTS, `${PREFIX}-${name}.png`); fs.writeFileSync(f, Buffer.from(data, 'base64')); console.log(`  (shot: ${f})`); } catch { } };
/** one leg: a throw is a NAMED ✗ with where it threw, and the walk goes on */
const step = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: the leg ran to its end`, false, String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); } };

await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); localStorage.setItem('vibespace.uiScale', '100'); } catch {}" });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 600, deviceScaleFactor: 1, mobile: false });
// B-9dd0's remainder (2): THE BELT, probed IN THE CHROME UNDER TEST (r1521: a fresh blank tab of the suite's own Chrome — take
// the belt off it and this leg is red): the box's own NAME, a vendor's name and a TEST-NET address are each refused; its CONTROL
// (r1246), a Chrome of its own with NO belt: the own name is reached (the leg can fail)
{
  const beltR = await reachFrom(CDP_PORT);
  const bareR = await chromeReach(CHROME, { env: { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun, DISPLAY: '' }, dir: path.join(ROOT, 'chrome-bare') });
  check('B-9dd0: Chrome\'s belt — the box\'s own NAME (a listener of this suite), a vendor\'s name and a TEST-NET address are each REFUSED (a dead proxy, a resolver that finds no name)', beltR.own === 'refused' && beltR.vendor === 'refused' && beltR.testnet === 'refused', beltR);
  if (bareR.own === 'reached') check('CONTROL: with NO belt the box\'s own name is REACHED — the belt leg above can fail', true, bareR);
  else console.log(`  ⊘ SKIP the belt's CONTROL: with no belt this box did not reach its own name (${JSON.stringify(bareR)}) — the belt leg is not shown discriminating here`);
}
await cdp('Page.navigate', { url: origin + '/' });
await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 40000) return rej(new Error("no app after 40s")); setTimeout(w, 200); })(); })');
await waitFor(`!document.getElementById('loading-screen')`, 30000);
await sleep(900);

/** the dialog as the page lays it out: the title row, the body's children, the list, and the dim token's resolved color */
const MEASURE = `(() => {
  const ov = document.getElementById('plugin-consent-dialog'); if (!ov) return null;
  const dlg = ov.querySelector('.dialog'), head = dlg.querySelector('.dialog-header'), body = dlg.querySelector('.dialog-body');
  const list = body.querySelector('.plugin-caps-list'), lis = list ? [...list.querySelectorAll('li')] : [];
  const cs = (e) => getComputedStyle(e), R = (e) => { const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right, h: r.height }; };
  const dimProbe = document.createElement('span'); dimProbe.style.color = 'var(--text-dim)'; body.appendChild(dimProbe); const dim = cs(dimProbe).color; dimProbe.remove();
  const intro = body.firstElementChild, hb = R(head).b, it = intro ? R(intro).t : hb;
  const between = [...dlg.querySelectorAll('*')].filter((e) => e !== body && !head.contains(e) && !(intro && (intro === e || intro.contains(e))) && !e.contains(head))
    .map((e) => ({ cls: e.className || e.tagName, ...R(e) })).filter((r) => r.h > 0 && r.t >= hb - 0.5 && r.b <= it + 0.5);
  return { title: (head.querySelector('h3') || head).textContent.trim(), headB: hb, bodyPadTop: parseFloat(cs(body).paddingTop), bodyPadL: R(body).l + parseFloat(cs(body).paddingLeft), gap: parseFloat(cs(body).rowGap), dim,
    intro: intro && { cls: intro.className, fs: cs(intro).fontSize, color: cs(intro).color, mt: parseFloat(cs(intro).marginTop), mb: parseFloat(cs(intro).marginBottom), ...R(intro) },
    list: list && { pl: parseFloat(cs(list).paddingLeft), mt: parseFloat(cs(list).marginTop), mb: parseFloat(cs(list).marginBottom), ...R(list) },
    lis: lis.map((li) => ({ id: [...li.classList].find((c) => c.startsWith('plugin-cap-')), fs: cs(li).fontSize, lh: cs(li).lineHeight, text: li.textContent, ...R(li) })),
    kids: [...body.children].map((k) => ({ cls: k.className, ...R(k) })), between };
})()`;
const judge = (tag, m) => {
  check(`${tag} the dialog is up with its intro, list and bullets`, !!(m && m.intro && m.list && m.lis.length), m);
  if (!m || !m.intro || !m.list || !m.lis.length) return;
  check(`${tag} ③ the explanation is the dialog's body text — its font-size = the bullets' (${m.intro.fs} vs ${[...new Set(m.lis.map((l) => l.fs))].join('/')})`, verdictOf(m.lis.every((l) => l.fs === m.intro.fs)), m.intro);
  check(`${tag} ③ the explanation is not in the dim hint tone (${m.intro.color} vs --text-dim ${m.dim})`, m.intro.color !== m.dim, m.intro);
  check(`${tag} ③ the explanation is no .usage-note (the Usage window's note class)`, !/\busage-note\b/.test(m.intro.cls), m.intro.cls);
  check(`${tag} ④ the list's padding-left holds its marker (12 ≤ ${m.list.pl} ≤ 20 px) — padding 0 hangs the outside markers on the dialog's border`, m.list.pl >= 12 && m.list.pl <= 20, m.list);
  check(`${tag} ④ the list box starts at the explanation's left edge, inside the body's padding (the marker in the dialog's text column)`, Math.abs(m.list.l - m.intro.l) <= 0.5 && m.list.l >= m.bodyPadL - 0.5, { list: m.list, intro: m.intro, bodyPadL: m.bodyPadL });
  check(`${tag} ④ the list has no margin of its own (the body's gap spaces it)`, m.list.mt === 0 && m.list.mb === 0, m.list);
  const rowGaps = m.lis.slice(1).map((l, i) => +(l.t - m.lis[i].b).toFixed(1));
  check(`${tag} ④ its rows stand ≈ 6 px apart (${rowGaps.join(', ') || 'one row'})`, verdictOf(rowGaps.every((g) => g >= 4 && g <= 8)), m.lis);
  const band = +(m.intro.t - m.headB).toFixed(1);
  check(`${tag} ⑤ no blank band: the explanation starts the body's own padding below the title row (${band} px vs ${m.bodyPadTop})`, band <= m.bodyPadTop + 0.5, { band, kids: m.kids });
  check(`${tag} ⑤ no box between the title row and the explanation taller than the body's gap (${m.gap} px)`, verdictOf(m.between.every((b) => b.h <= m.gap)), m.between);
  const toList = +(m.list.t - m.intro.b).toFixed(1);
  check(`${tag} ⑤ the explanation sits one body gap above the list it introduces (${toList} px vs ${m.gap})`, Math.abs(toList - m.gap) <= 0.5, { intro: m.intro, list: m.list });
};

const row = `.plugin-row[data-plugin="${PID}"]`;
await step('①', async () => {
  const r = await evalJs(`fetch('/api/plugins/manifests').then((x) => x.json()).then((j) => (j.plugins || []).find((p) => p.id === ${J(PID)}) || null)`);
  check('① the planted plugin is listed valid, disabled, asking for consent', !!r && gateOf(r.valid) && !r.enabled && verdictOf(r.consentRequired), r && { valid: r.valid, enabled: r.enabled, consentRequired: r.consentRequired, errors: r.errors });
});
await step('②', async () => {
  await evalJs('app.openPluginsDialog(); true');
  check('② the Plugins window lists the planted plugin with its switch', verdictOf(await waitFor(`!!document.querySelector('${row} .plugin-sw')`, 20000)));
  const pressed = await realClick(`${row} .plugin-sw`);
  const up2 = await waitFor(`!!document.querySelector('#plugin-consent-dialog .plugin-caps-list')`, 15000);
  check('② a real press on its switch opens the consent dialog', !!pressed && verdictOf(up2), realClick.lastMiss);
  const m = await evalJs(MEASURE);
  check(`② «${m?.title}» lists the two bullets of the owner's screenshot (server-process, browser-engine)`, J(m?.lis.map((l) => l.id)) === J(['plugin-cap-server-process', 'plugin-cap-browser-engine']), m?.lis);
  await shot('consent');
  judge('consent:', m);
  const eng = m?.lis.find((l) => l.id === 'plugin-cap-browser-engine')?.text || '';
  check('⑥ the browser-engine bullet (zh) names the program VibeSpace starts as a profile\'s browser', verdictOf(eng.includes('它指定一个程序，由 VibeSpace 作为浏览器档案的浏览器来启动')), eng);
});
await step('⑦', async () => {
  const cancel = await evalJs(`(() => { const b = document.querySelector('#plugin-consent-dialog .plugin-consent-actions .mounts-btn:not(.plugin-consent-accept)'); if (b) b.dataset.pc = 'cancel'; return !!b; })()`);
  if (cancel) await realClick('[data-pc="cancel"]');
  const gone = await waitFor(`!document.getElementById('plugin-consent-dialog')`, 8000);
  const off = await evalJs(`(() => { const c = document.querySelector('${row} .plugin-sw input'); return !!c && !c.checked; })()`);
  check('⑦ Cancel closes it and the switch is off again', gateOf(cancel) && gateOf(gone) && verdictOf(off), { cancel, gone, off });
});
await step('⑧', async () => {
  await realClick(`${row} .plugin-chip`);
  const tagged = await waitFor(`(() => { const its = [...document.querySelectorAll('.context-menu-item')]; window.__pcMenu = its.map((x) => x.textContent.trim()); const i = its.find((x) => ['查看能力…', 'Show capabilities…'].includes(x.textContent.trim())); if (i) i.dataset.pc = 'caps'; return !!i; })()`, 8000);
  if (tagged) await realClick('[data-pc="caps"]');
  const up3 = await waitFor(`!!document.querySelector('#plugin-consent-dialog .plugin-caps-list')`, 15000);
  check('⑧ the chip\'s «查看能力…» opens the read-only variant', gateOf(tagged) && verdictOf(up3));
  const m = await evalJs(MEASURE);
  check(`⑧ «${m?.title}» has no Enable button`, !!m && !(await evalJs(`!!document.querySelector('#plugin-consent-dialog .plugin-consent-accept')`)));
  await shot('readonly');
  judge('read-only:', m);
});
await step('⑨', async () => {
  const closeB = await evalJs(`(() => { const b = document.querySelector('#plugin-consent-dialog .plugin-consent-actions .mounts-btn'); if (b) b.dataset.pc = 'close'; return !!b; })()`);
  if (closeB) await realClick('[data-pc="close"]');
  await waitFor(`!document.getElementById('plugin-consent-dialog')`, 8000);
  const menu = await evalJs('window.__pcMenu || null');
  check(`⑨ ONE door: the chip's menu lists ${J(menu)} — no 更新`, gateOf(Array.isArray(menu)) && menu.length > 0 && !menu.some((x) => /^(更新|Update)/.test(x)), menu);
  const inst = await evalJs(`fetch('/api/plugins/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${J(J({ source: 'path', value: hsrc }))} }).then((x) => x.json())`);
  check('⑨ a second plugin installs through the page from a folder (source path)', inst?.plugin?.id === HID, inst);
  await evalJs(`(() => { const b = [...document.querySelectorAll('.plugin-manifests-head .mounts-btn')].find((x) => ['重新扫描', 'Rescan'].includes(x.textContent.trim())); if (b) b.click(); return !!b; })()`);
  await waitFor(`!!document.querySelector('.plugin-row[data-plugin="${HID}"]')`, 15000);
  // B-db5d (the owner, 2026-11-18, this row at a narrow width — its name broken over three lines beside chip · switch · 更新… ·
  // 卸载… · «⋯»: «更新 卸载应该收进...里»): Update… and Uninstall… are ROWS OF THE ROW'S «⋯» MENU at every width (rail-row
  // data-rail-fold="always" → the PURE row-fold-model `always`). The row reads dot · the name block · chip · switch · the ⚙'s unseen
  // place (this plugin has nothing to configure: no control) · «⋯»; the controls stand side by side inside the row and the
  // viewport, the name at its 9 em basis or the controls on their own line; a REAL press on the «⋯» opens 更新… then 卸载…; a real
  // press on the path plugin's «⋯» → «更新…» with nothing new at its source says «… 已是最新（0.1.0）». (Through the rail row since
  // the .408 train: one controls group.)
  const M = await evalJs(`(() => {
    const row = document.querySelector('${row}'); if (!row) return null;
    row.scrollIntoView({ block: 'center' });
    const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right, w: r.width, h: r.height }; };
    const ctl = row.querySelector(':scope > .rail-row-ctl'), main = row.querySelector(':scope > .rail-row-main');
    const kids = ctl ? [...ctl.children].map((k) => ({ cls: String(k.className), text: k.textContent.trim(), seen: getComputedStyle(k).visibility === 'visible' && getComputedStyle(k).display !== 'none', ...R(k) })) : [];
    return { row: R(row), ctl: R(ctl), main: R(main), basis: main ? 9 * parseFloat(getComputedStyle(main).fontSize) : 0, kids,
      inline: [...row.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((x) => /^(更新|卸载|Update|Uninstall)/.test(x)), cluster: !!row.querySelector('.plugin-row-actions'),
      gap: ctl ? parseFloat(getComputedStyle(ctl).columnGap) || 0 : 0, vw: innerWidth, vh: innerHeight };
  })()`);
  if (M) { // the row's PNG first — on the checkpoint (the two buttons inline) it is the «before»
    const pad = 6, x = Math.max(0, M.row.l - pad), y = Math.max(0, M.row.t - pad);
    try { const { data } = await cdp('Page.captureScreenshot', { format: 'png', clip: { x, y, width: Math.min(M.vw - x, M.row.w + 2 * pad), height: Math.min(M.vh - y, M.row.h + 2 * pad), scale: 1 } }); const f = path.join(SHOTS, `${PREFIX}-row.png`); fs.writeFileSync(f, Buffer.from(data, 'base64')); console.log(`  (shot: ${f})`); } catch { }
  }
  const kidsSaid = J((M?.kids || []).map((k) => k.cls.split(' ').pop() + (k.seen ? '' : ' (unseen)')));
  check(`⑨ B-db5d: the git-installed plugin's row draws neither «更新…» nor «卸载…» (inline: ${J(M?.inline)}); its controls end in ONE «⋯» (${kidsSaid})`, !!M && M.inline.length === 0 && !M.cluster && verdictOf(/\brail-row-more\b/.test((M.kids.at(-1) || {}).cls || '')), M);
  check(`⑨ the ⚙'s place-keeper (nothing to configure) is no control — not drawn, not folded (${kidsSaid})`, !!M && verdictOf(M.kids.some((k) => /plugin-gear-none/.test(k.cls) && !k.seen)), M && M.kids);
  const seen = (M?.kids || []).filter((k) => k.seen && k.w > 0);
  const sameLine = (a, b) => Math.min(a.b, b.b) - Math.max(a.t, b.t) > 2;   // their boxes overlap vertically: one line (centred items have different tops)
  const tight = seen.length >= 3 && seen.every((k, i) => i === 0 || !sameLine(k, seen[i - 1]) || (k.l - seen[i - 1].r >= 2 && k.l - seen[i - 1].r <= M.gap + 0.5));
  check(`⑨ the controls squeeze nothing — side by side on a line (gaps 2–${M && M.gap} px), the name at its 9 em basis or the controls on their own line (name ${M && M.main && M.main.w.toFixed(0)} px of ${M && M.basis.toFixed(0)})`, !!M && !!M.main && gateOf(tight) && (M.main.w >= M.basis - 0.5 || M.ctl.t >= M.main.b - 0.5), M && { main: M.main, ctl: M.ctl, kids: M.kids });
  const inside = (b) => !!b && b.w > 0 && b.h > 0 && b.l >= M.row.l - 0.5 && b.r <= M.row.r + 0.5 && b.t >= M.row.t - 0.5 && b.b <= M.row.b + 0.5 && b.l >= 0 && b.r <= M.vw && b.t >= 0 && b.b <= M.vh;
  check(`⑨ every control is drawn inside the row and the 1000 × 600 viewport, on one line (${seen.map((k) => `${k.cls.split(' ').pop()} ${k.l.toFixed(0)},${k.t.toFixed(0)}`).join(' · ')})`, seen.length >= 3 && gateOf(seen.every(inside)) && verdictOf(seen.every((k) => sameLine(k, seen[0]))), M);
  // the «⋯» AS A PERSON PRESSES IT (a real press: the top element at its point is the button)
  const pressedMore = await realClick(`${row} .rail-row-more`);
  const opened = await waitFor(`(() => { const its = [...document.querySelectorAll('.context-menu > .context-menu-item')]; window.__pcMore = its.map((x) => x.textContent.trim()); return its.length > 0; })()`, 8000);
  const moreMenu = await evalJs('window.__pcMore || null');
  const ptrFocus = await evalJs(`!!document.activeElement && !!document.activeElement.closest('.context-menu')`);
  check(`⑨ B-6944: a POINTER's menu takes no focus (the focus stays where the press left it: in the menu ${ptrFocus})`, ptrFocus === false, ptrFocus);
  if (opened) await shot('more-menu');
  check(`⑨ B-db5d: a real press on the row's «⋯» opens «更新…» first, then «卸载…» (${J(moreMenu)})`, !!pressedMore && gateOf(opened) && J(moreMenu) === J(['更新…', '卸载…']), { pressedMore, miss: realClick.lastMiss, moreMenu });
  await evalJs(`(() => { document.querySelectorAll('.context-menu').forEach((p) => p.remove()); return true; })()`);
  const hrow = `.plugin-row[data-plugin="${HID}"]`;
  await evalJs(`(() => { const r = document.querySelector('${hrow}'); if (r) r.scrollIntoView({ block: 'center' }); return !!r; })()`);
  const pm = await realClick(`${hrow} .rail-row-more`);
  const tagU = await waitFor(`(() => { const i = [...document.querySelectorAll('.context-menu > .context-menu-item')].find((x) => x.textContent.trim() === '更新…'); if (i) i.dataset.pc = 'upd'; return !!i; })()`, 8000);
  const pressed = tagU ? await realClick('[data-pc="upd"]') : false;
  const said = await waitFor(`[...document.querySelectorAll('.global-toast')].some((x) => x.textContent.includes('${HID} 已是最新（0.1.0）'))`, 20000);
  const toasts = await evalJs(`[...document.querySelectorAll('.global-toast')].map((x) => x.textContent.trim())`);
  check(`⑨ a real press on the «⋯» then its «更新…», nothing new at the source, says «${HID} 已是最新（0.1.0）» (${J(toasts)})`, !!pm && !!pressed && verdictOf(said), { pm, pressed, miss: realClick.lastMiss, toasts });
  // B-6944 — THE KEYBOARD ALONE (the readers of B-db5d: Update… / Uninstall… were native buttons a Tab reached; in the «⋯» a
  // keyboard-only person reached no row): the path plugin's «⋯» focused (a script focus stands in for the Tabs), Enter opens the menu
  // WITH THE FOCUS ON «更新…», ArrowDown reaches «卸载…», ArrowUp comes back, Escape closes it and gives the focus back to the «⋯»;
  // Enter again, then Enter on «更新…» updates — the toast says so. No pointer event in any of it.
  const KC = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, ArrowRight: 39, ArrowLeft: 37 };
  // each key WAITS ON THE ELEMENT IT SHOULD FOCUS (B-6944's round: never a fixed 150 ms) — `until` = a page expression; a key that
  // should change nothing is followed by one that must (the wait on that one proves the first left the menu standing)
  const key = async (k, until = null) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: KC[k], nativeVirtualKeyCode: KC[k], ...(k === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: KC[k], nativeVirtualKeyCode: KC[k] }); if (until) await waitFor(until, 4000); };
  const ON = (text) => `(() => { const a = document.activeElement; return !!a && !!a.closest('.context-menu') && (a.textContent || '').trim() === ${J(text)}; })()`;
  const BACK = `(() => document.activeElement === document.querySelector('${hrow} .rail-row-more') && !document.querySelector('.context-menu'))()`;
  const focusNow = () => evalJs(`(() => { const a = document.activeElement; return a ? { text: (a.textContent || '').trim(), role: a.getAttribute('role'), more: a === document.querySelector('${hrow} .rail-row-more'), inMenu: !!a.closest('.context-menu'), menu: !!document.querySelector('.context-menu') } : null; })()`);   // more: THE «⋯» that opened it
  await evalJs(`(() => { document.querySelectorAll('.context-menu, #global-toasts > .global-toast').forEach((e) => e.remove()); const b = document.querySelector('${hrow} .rail-row-more'); if (b) b.focus(); return !!b && document.activeElement === b; })()`);
  await key('Enter', ON('更新…'));
  const k1 = await focusNow();
  await key('ArrowDown', ON('卸载…')); const k2 = await focusNow();
  await key('ArrowUp', ON('更新…')); const k3 = await focusNow();
  await key('Escape', BACK); const k4 = await focusNow();
  check(`⑨ B-6944: by keyboard alone — Enter on the «⋯» opens its menu with the focus on «更新…» (${J(k1)}), ArrowDown reaches «卸载…» (${k2 && k2.text}), ArrowUp comes back (${k3 && k3.text}), Escape closes it and the focus is the «⋯» again (${J(k4)})`,
    !!k1 && gateOf(k1.inMenu) && k1.role === 'menuitem' && k1.text === '更新…' && !!k2 && k2.text === '卸载…' && !!k3 && k3.text === '更新…' && !!k4 && !k4.menu && verdictOf(k4.more), { k1, k2, k3, k4 });
  await key('Enter', ON('更新…')); const k5 = await focusNow();
  await evalJs(`(() => { const r = document.querySelector('${hrow}'); if (r) r.dataset.k10old = '1'; return !!r; })()`);   // ⑩ waits for the list this update redraws
  await key('Enter');
  const saidK = await waitFor(`[...document.querySelectorAll('.global-toast')].some((x) => x.textContent.includes('${HID} 已是最新（0.1.0）'))`, 20000);
  check(`⑨ B-6944: …and Enter on «更新…» updates — «${HID} 已是最新（0.1.0）» said, no pointer used (${J(k5)})`, !!k5 && k5.text === '更新…' && verdictOf(saidK), { k5, toasts: await evalJs(`[...document.querySelectorAll('.global-toast')].map((x) => x.textContent.trim())`) });

  // ⑩ B-6944's round ① — THE FIRST FOCUS IS THE FIRST STOP: an update HELD in flight (its POST paused at the page's door: Update…
  // is off while it runs and says why), the «⋯» opened by Enter — the focus on the OFF «更新…» (never on «卸载…» behind it)
  // the update above redraws the plugin list (render(): two requests, the body cleared between them) — wait for the NEW row
  const NEWROW = `(() => { const r = document.querySelector('${hrow}'); return !!r && !r.dataset.k10old && !!r.querySelector('.rail-row-more'); })()`;
  check('⑩ the plugin list redrawn after ⑨\'s update (a new row, not the one the update was pressed on)', verdictOf(await waitFor(NEWROW, 15000)));
  try {
  await evalJs(`(() => { document.querySelectorAll('.context-menu, #global-toasts > .global-toast').forEach((e) => e.remove()); const b = document.querySelector('${hrow} .rail-row-more'); if (b) b.focus(); return !!b && document.activeElement === b; })()`);
  heldReqs.length = 0;
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/plugins/manifests/*/update*', requestStage: 'Request' }] });
  let held = null;
  try {
    await key('Enter', ON('更新…'));
    await key('Enter');   // presses «更新…»: its POST is held
    for (let i = 0; i < 80 && !heldReqs.length; i++) await sleep(100);
    held = heldReqs[0] || null;
    await evalJs(`(() => { document.querySelectorAll('.context-menu').forEach((e) => e.remove()); const b = document.querySelector('${hrow} .rail-row-more'); if (b) b.focus(); return document.activeElement === b; })()`);
    await key('Enter', `!!document.activeElement && !!document.activeElement.closest('.context-menu')`);
    const r1 = await evalJs(`(() => { const a = document.activeElement, m = a && a.closest('.context-menu'); if (m) m.dataset.k10 = '1'; window.__k10clicks = 0; if (a) a.addEventListener('click', () => { window.__k10clicks++; }); const w = a && a.getAttribute('aria-describedby') ? document.getElementById(a.getAttribute('aria-describedby')) : null; return a ? { text: (a.textContent || '').trim(), off: a.getAttribute('aria-disabled') === 'true', why: w ? w.textContent.trim() : null, rows: m ? [...m.querySelectorAll('[data-menu-stop]')].map((x) => (x.textContent || '').trim()) : null } : null; })()`);
    check(`⑩ ① an update held in flight (${held ? 'its POST paused' : 'NO request held'}): Enter on the «⋯» puts the focus on its FIRST STOP — the OFF «更新…» with its why («${r1 && r1.why}»), not «卸载…» (rows ${J(r1 && r1.rows)})`, !!held && !!r1 && gateOf(r1.off) && gateOf(/^更新…/.test(r1.text)) && !!r1.why && !!r1.rows && verdictOf(/卸载…/.test(r1.rows[r1.rows.length - 1])), { held: !!held, r1 });
    // Enter on the off row presses nothing — then ArrowDown must reach «卸载…» IN THE SAME MENU (the wait on it proves the Enter left it standing)
    await key('Enter');
    await key('ArrowDown', ON('卸载…'));
    const r2 = await evalJs(`(() => { const a = document.activeElement, m = a && a.closest('.context-menu'); return { clicks: window.__k10clicks, text: a ? (a.textContent || '').trim() : null, same: !!m && m.dataset.k10 === '1', dialog: !!document.querySelector('.modal-overlay:not(.hidden) .dialog, #dialog-overlay:not(.hidden)') }; })()`);
    check(`⑩ ①: Enter on the off «更新…» pressed nothing — no click reached it (${r2 && r2.clicks}), the same menu, no second update asked (${heldReqs.length} held), no dialog; ArrowDown reaches «卸载…» (${r2 && r2.text})`, !!r2 && r2.clicks === 0 && gateOf(r2.same) && r2.text === '卸载…' && !r2.dialog && heldReqs.length === 1, { r2, held: heldReqs.length });
    await key('Escape', BACK);
  } finally {
    // the row the held update will redraw is MARKED BEFORE the request is let go (the hosted red of checkpoint 1: stamped after the
    // «已是最新» toast was seen, it landed on the NEW row on a fast runner — the product says the toast first and redraws after it)
    await evalJs(`(() => { const r = document.querySelector('${hrow}'); if (r) r.dataset.k10old = '1'; return true; })()`).catch(() => null);
    for (const h of heldReqs) await cdp('Fetch.continueRequest', { requestId: h.requestId }).catch(() => null);   // every request held, not only the first
    await cdp('Fetch.disable').catch(() => null);
  }
  const saidH = await waitFor(`[...document.querySelectorAll('.global-toast')].some((x) => x.textContent.includes('${HID} 已是最新（0.1.0）'))`, 20000);
  check('⑩ ①: …the held update let go, it ends as before («已是最新» said)', verdictOf(saidH));
  check('⑩ the plugin list redrawn after the held update (a new row for ②: not the row marked before the request was let go)', verdictOf(await waitFor(NEWROW, 15000)));
  // ① THE REDRAW WHEN THE HELD UPDATE ENDS (主开发 09:53Z): Enter on the NEW row's «⋯» — the focus on its first stop, the live
  // «更新…» again, never «卸载…»
  await evalJs(`(() => { document.querySelectorAll('.context-menu').forEach((e) => e.remove()); const b = document.querySelector('${hrow} .rail-row-more'); if (b) b.focus(); return !!b && document.activeElement === b; })()`);
  await key('Enter', `!!document.activeElement && !!document.activeElement.closest('.context-menu')`);
  const r3 = await evalJs(`(() => { const a = document.activeElement; return a ? { text: (a.textContent || '').trim(), off: a.getAttribute('aria-disabled') === 'true' } : null; })()`);
  check(`⑩ ① after the held update ended and the list redrew: Enter on the new «⋯» — the focus on the first stop «${r3 && r3.text}», live again (never «卸载…»)`, !!r3 && r3.text === '更新…' && !r3.off, r3);
  await key('Escape', `!document.querySelector('.context-menu')`);

  // ⑩ ② — A MENU OPENED BY CODE A MOMENT AFTER A KEY: the plant first (from a focused BUTTON it takes the focus — a key a moment ago
  // is what lets it), then a TEXT FIELD and a desktop's PICTURE (a canvas) holding the keys: no focus moved, no character lost
  const KEYT = async (k, text) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: 'Key' + k.toUpperCase(), windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), text, unmodifiedText: text }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: 'Key' + k.toUpperCase(), windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) }); };
  const OPEN_BY_CODE = `(() => { document.querySelectorAll('.context-menu').forEach((e) => e.remove()); const b = document.querySelector('${hrow} .rail-row-more'); b.click(); return !!document.querySelector('.context-menu'); })()`;
  await evalJs(`(() => { const b = document.querySelector('${hrow} .rail-row-more'); b.focus(); return document.activeElement === b; })()`);
  await KEYT('a', 'a');
  const plant = await evalJs(OPEN_BY_CODE);
  await waitFor(`!!document.activeElement && !!document.activeElement.closest('.context-menu')`, 3000);
  const p0 = await evalJs(`(() => { const a = document.activeElement; return { inMenu: !!a && !!a.closest('.context-menu'), text: a ? (a.textContent || '').trim() : null }; })()`);
  check(`⑩ ② THE PLANT: a menu opened BY CODE a moment after a key, the focus on a button — it takes the focus (${J(p0)})`, gateOf(plant) && verdictOf(p0.inMenu), p0);
  await key('Escape', `!document.querySelector('.context-menu')`);
  for (const [what, make] of [['a text field', `(() => { const f = document.createElement('input'); f.id = 'zz-k10'; f.type = 'text'; document.body.appendChild(f); f.focus(); return document.activeElement === f; })()`],
    ['a desktop\'s picture (a canvas that takes the keys)', `(() => { const f = document.createElement('canvas'); f.id = 'zz-k10'; f.tabIndex = 0; f.width = 120; f.height = 80; f.dataset.keys = ''; f.addEventListener('keydown', (e) => { f.dataset.keys += e.key; }); document.body.appendChild(f); f.focus(); return document.activeElement === f; })()`]]) {
    const focused = await evalJs(make);
    await KEYT('a', 'a'); await KEYT('b', 'b');
    if (what === 'a text field') await key('Enter');   // plain typing in a field is no gesture: its Enter is (isGestureKey) — the key a moment before the open
    const stamped = await evalJs(`(() => { const f = document.getElementById('zz-k10'); return document.activeElement === f; })()`);
    const opened = await evalJs(OPEN_BY_CODE);
    await KEYT('c', 'c');
    await waitFor(`(() => { const f = document.getElementById('zz-k10'); return !!f && (f.value === 'abc' || f.dataset.keys === 'abc'); })()`, 3000);
    const r = await evalJs(`(() => { const f = document.getElementById('zz-k10'), a = document.activeElement; return { kept: a === f, typed: f.tagName === 'INPUT' ? f.value : f.dataset.keys, menu: !!document.querySelector('.context-menu'), inMenu: !!a && !!a.closest('.context-menu') }; })()`);
    check(`⑩ ② a menu opened BY CODE a moment after a key while ${what} holds the focus — no focus moved (${r.kept}), no character lost («${r.typed}»), the menu open beside it`, gateOf(focused) && gateOf(stamped) && gateOf(opened) && gateOf(r.kept) && r.typed === 'abc' && gateOf(r.menu) && !r.inMenu, r);
    await evalJs(`(() => { document.querySelectorAll('.context-menu, #zz-k10').forEach((e) => e.remove()); return true; })()`);
  }

  // ⑩ ③ THE PERSON'S OWN MENU KEY (主开发 09:53Z — the typing guard is for a menu CODE opened): Shift+F10 while a TEXT FIELD holds
  // the focus — the menu takes the focus (a keyboard-only person walks the menu they asked for). A stand-in surface: the field's
  // own `contextmenu` opens the «⋯» menu (where the browser raises one for the key); where it raises none, the open comes a moment
  // after the key, by code — the key the person pressed decides either way. Its control is ⑩ ②'s field: Enter, then a code open —
  // no focus. On a remote desktop's CANVAS the menu key is the remote machine's: the canvas keeps the focus and the key; control:
  // the same key on a button takes the focus.
  const MENUKEY = async () => { await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'F10', code: 'F10', windowsVirtualKeyCode: 121, nativeVirtualKeyCode: 121, modifiers: 8 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F10', code: 'F10', windowsVirtualKeyCode: 121, nativeVirtualKeyCode: 121, modifiers: 8 }); };
  const viaKey = async (make) => {
    await evalJs(`(() => { document.querySelectorAll('.context-menu, #zz-k10').forEach((e) => e.remove()); window.__k10road = null; return true; })()`);
    const focused = await evalJs(make);
    await evalJs(`(() => { const f = document.getElementById('zz-k10') || document.querySelector('${hrow} .rail-row-more'); window.__k10cm = { f, h: (e) => { e.preventDefault(); window.__k10road = 'the key\\'s own contextmenu'; ${OPEN_BY_CODE}; } }; f.addEventListener('contextmenu', window.__k10cm.h, { once: true }); return true; })()`);
    await MENUKEY();
    if (!(await waitFor(`!!document.querySelector('.context-menu')`, 600))) { await evalJs(`(() => { window.__k10road = 'code a moment after the key'; return ${OPEN_BY_CODE}; })()`); }
    await waitFor(`!!document.activeElement && !!document.activeElement.closest('.context-menu')`, 1500);
    await evalJs(`(() => { const c = window.__k10cm; if (c) c.f.removeEventListener('contextmenu', c.h); window.__k10cm = null; return true; })()`);   // the fallback road leaves no listener behind
    return { focused, ...(await evalJs(`(() => { const a = document.activeElement, f = document.getElementById('zz-k10'); return { road: window.__k10road, menu: !!document.querySelector('.context-menu'), inMenu: !!a && !!a.closest('.context-menu'), first: a ? (a.textContent || '').trim() : null, kept: !!f && a === f, keys: f ? (f.dataset.keys || '') : null }; })()`)) };
  };
  const mf = await viaKey(`(() => { const f = document.createElement('input'); f.id = 'zz-k10'; f.type = 'text'; document.body.appendChild(f); f.focus(); return document.activeElement === f; })()`);
  check(`⑩ ③ the person's MENU KEY (Shift+F10) in a text field: the menu takes the focus — «${mf.first}», the first stop (${mf.road})`, gateOf(mf.focused) && gateOf(mf.menu) && gateOf(mf.inMenu) && mf.first === '更新…', mf);
  await key('Escape', `!document.querySelector('.context-menu')`);
  const mc = await viaKey(`(() => { const f = document.createElement('canvas'); f.id = 'zz-k10'; f.tabIndex = 0; f.width = 120; f.height = 80; f.dataset.keys = ''; f.addEventListener('keydown', (e) => { f.dataset.keys += e.key; }); document.body.appendChild(f); f.focus(); return document.activeElement === f; })()`);
  check(`⑩ ③ …on a remote desktop's CANVAS the menu key is the remote machine's: the canvas keeps the focus and the key («${mc.keys}»), no menu takes it (${mc.road})`, gateOf(mc.focused) && gateOf(mc.menu) && gateOf(mc.kept) && !mc.inMenu && verdictOf(/F10/.test(mc.keys || '')), mc);
  const mb = await viaKey(`(() => { const b = document.querySelector('${hrow} .rail-row-more'); b.focus(); return document.activeElement === b; })()`);
  check(`⑩ ③ CONTROL: the same key on a button — the menu takes the focus («${mb.first}»: the key reaches the page and a menu opened then is walked; the FIELD scene above is the one the base fails — there Shift+F10 is no gesture key)`, gateOf(mb.focused) && verdictOf(mb.inMenu), mb);
  await evalJs(`(() => { document.querySelectorAll('.context-menu, #zz-k10').forEach((e) => e.remove()); return true; })()`);

  // ⑩ ④ — A SUBMENU BY ITS ARROW: a window (a file explorer) and a second desktop — its title bar's menu opened a moment after a
  // key; the «➤» row (Move to Desktop) reached by ArrowDown, ArrowRight opens its submenu WITH the focus in it, ArrowLeft goes back
  // to its row (the submenu hidden), Escape closes the menu. The window is found by the type the PRODUCT gives it — 'files'
  // (app.openFileExplorer; checkpoint 1's hosted red: the type 'file-explorer', which no window ever had, timed a silent wait out
  // and the next line threw) — and by its id (the one this leg opened). Every wait the walk depends on is red BY ITS NAME.
  // RED CONTROL: the same walk with the «➤» row's keyboard opener planted away (`_showSub`, B-6944's door) — ArrowRight then opens
  // nothing and the focus never enters a submenu
  const K4 = 'zz-k10';
  const wait4 = async (name, expr, ms = 4000) => { if (await waitFor(expr, ms)) return true; check(`⑩ ④ ${name} — waited ${ms} ms in vain`, false, await evalJs(`(() => { const a = document.activeElement; return { focus: a ? (a.textContent || '').trim().slice(0, 40) : null, menus: document.querySelectorAll('.taskbar-context-menu').length }; })()`).catch(() => null)); return false; };
  const fx = await evalJs(`(() => { const before = new Set(app.wm.windows.keys()); app.desktopManager.createDesktop(${J(K4)}); app.openFileExplorer(); const w = [...app.wm.windows.values()].find((x) => !before.has(x.id) && x.type === 'files'); window.__k10win = w ? w.id : null; return { id: window.__k10win, types: [...app.wm.windows.values()].filter((x) => !before.has(x.id)).map((x) => x.type) }; })()`);
  const WIN4 = `app.wm.windows.get(window.__k10win)`;
  const s4 = { fx };
  const walk4 = async ({ plant = false } = {}) => {
    // a key a moment before the menu opens (its stamp; the focus on no field), then the title bar's contextmenu
    await evalJs(`(() => { document.querySelectorAll('.taskbar-context-menu').forEach((m) => m.remove()); if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); return true; })()`);
    await KEYT('a', 'a');
    await evalJs(`(() => { const w = ${WIN4}; const r = w.titleBar.getBoundingClientRect(); w.titleBar.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + r.height / 2, button: 2 })); return true; })()`);
    const inTop = `(() => { const a = document.activeElement; return !!a && !!a.parentElement && a.parentElement === document.querySelector('.taskbar-context-menu'); })()`;   // a submenu carries the same class: the TOP menu is the first in the tree
    if (!(await wait4(`${plant ? '(control) ' : ''}the window's menu opened a moment after a key takes the focus at a row of the top menu`, inTop, 3000))) return null;
    let parentRow = null;
    for (let i = 0; i < 16 && !parentRow; i++) {
      parentRow = await evalJs(`(() => { const a = document.activeElement; return a && a.getAttribute('aria-haspopup') === 'menu' && /➤/.test(a.textContent || '') ? (a.textContent || '').trim().split('\\n')[0].slice(0, 40) : null; })()`);
      if (!parentRow) { const before = await evalJs(`(document.activeElement && document.activeElement.textContent || '').trim()`); await key('ArrowDown'); if (!(await wait4(`${plant ? '(control) ' : ''}ArrowDown moves the focus to the next row (from «${before.slice(0, 30)}»)`, `(document.activeElement && document.activeElement.textContent || '').trim() !== ${J(before)}`))) return null; }
    }
    if (!parentRow) { check(`⑩ ④ ${plant ? '(control) ' : ''}the «➤» row (Move to Desktop) reached by ArrowDown within 16 rows`, false); return null; }
    if (plant) await evalJs(`(() => { const a = document.activeElement; a._showSub = null; return true; })()`);   // the CONTROL: the row's keyboard opener gone
    const IN_SUB = `(() => { const a = document.activeElement, top = document.querySelector('.taskbar-context-menu'), sub = a && a.closest('[role="menu"]'); return !!sub && sub !== top && getComputedStyle(sub).display !== 'none'; })()`;
    await key('ArrowRight');
    if (plant) { await sleep(600); return { parentRow, s1: await evalJs(`(() => { const a = document.activeElement, top = document.querySelector('.taskbar-context-menu'), sub = a && a.closest('[role="menu"]'); return { text: a ? (a.textContent || '').trim().split('\\n')[0].slice(0, 40) : null, inSub: !!sub && sub !== top, menuOpen: !!top && top.isConnected, onRow: !!a && !!top && a.parentElement === top && a.getAttribute('aria-haspopup') === 'menu' }; })()`) }; }
    if (!(await wait4('ArrowRight on the «➤» row opens its submenu with the focus inside it', IN_SUB))) return null;
    const s1 = await evalJs(`(() => { const a = document.activeElement, sub = a && a.closest('[role="menu"]'); const top = document.querySelector('.taskbar-context-menu'); return { text: a ? (a.textContent || '').trim() : null, inSub: !!sub && sub !== top, subShown: !!sub && sub !== top && getComputedStyle(sub).display !== 'none' }; })()`);
    await key('ArrowLeft');
    if (!(await wait4('ArrowLeft goes back to the «➤» row in the top menu', inTop))) return null;
    const s2 = await evalJs(`(() => { const a = document.activeElement; const sub = a && a.querySelector(':scope > [role="menu"]'); return { text: a ? (a.textContent || '').trim().split('\\n')[0].slice(0, 40) : null, parent: !!a && a.getAttribute('aria-haspopup') === 'menu', expanded: a ? a.getAttribute('aria-expanded') : null, subHidden: !sub || getComputedStyle(sub).display === 'none' }; })()`);
    await key('Escape');
    if (!(await wait4('Escape closes the menu', `!document.querySelector('.taskbar-context-menu')`))) return null;
    return { parentRow, s1, s2, s3: true };
  };
  if (await wait4(`the file explorer this leg opened is drawn — found by the type the product gives it ('files', its id ${fx && fx.id}; new windows' types ${J(fx && fx.types)})`, `(() => { const w = ${WIN4}; return !!w && w.type === 'files' && !!w.titleBar && w.titleBar.getClientRects().length > 0; })()`, 10000)) {
    const r4 = await walk4();
    if (r4) check(`⑩ ④ a window's menu opened a moment after a key: the «➤» row («${r4.parentRow}») reached by ArrowDown, ArrowRight opens its submenu WITH the focus in it («${r4.s1.text}»), ArrowLeft back to its row (the submenu hidden: ${r4.s2.subHidden}, aria-expanded ${r4.s2.expanded}), Escape closes the menu`,
      gateOf(r4.s1.inSub) && gateOf(r4.s1.subShown) && r4.s1.text === K4 && gateOf(r4.s2.parent) && gateOf(r4.s2.subHidden) && r4.s2.expanded === 'false' && verdictOf(r4.s3), r4);
    const c4 = await walk4({ plant: true });
    // red ONLY because the opener is gone: the menu still open and the focus still ON the arrow row (its words, captured before the
    // key) — never a focus lost some other way (the reader's small, 02:08Z)
    check(`⑩ ④ RED CONTROL: the «➤» row's keyboard opener planted away — ArrowRight opens nothing: the focus never enters a submenu, the menu still open (${c4 && c4.s1 && c4.s1.menuOpen}), the focus still on the arrow row «${c4 && c4.s1 && c4.s1.text}»`,
      !!c4 && !!c4.s1 && !c4.s1.inSub && gateOf(c4.s1.menuOpen) && gateOf(c4.s1.onRow) && c4.s1.text === c4.parentRow, c4);
    await evalJs(`(() => { document.querySelectorAll('.taskbar-context-menu').forEach((m) => m.remove()); return true; })()`);
  }
  await evalJs(`(() => { if (window.__k10win && app.wm.windows.get(window.__k10win)) app.wm.requestClose(window.__k10win); const d = app.desktopManager.desktops.find((x) => x.name === ${J(K4)}); if (d) app.desktopManager.deleteDesktop(d.id); return true; })()`).catch(() => null);   // leave the page as ⑩ found it
  } catch (e) { check('⑩ B-6944\'s round: the leg ran to its end', false, String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); }
});
check('no page exceptions', pageErrors.length === 0, pageErrors.slice(0, 3));
console.log(fail ? `✗ ${fail} failed, ${pass} passed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
