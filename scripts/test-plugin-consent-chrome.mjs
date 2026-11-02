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
//   ⑨ lane plugin-update-button (the owner, 2026-11-02: no Update on the row — it lived only in the chip's menu): the planted
//     plugin carries a GIT install record (ref main, the owner's shape) ⇒ its row shows «更新…» beside «卸载…», both inside the
//     row and the viewport at 1000 × 600, the switch / ⚙ columns not widened (the name keeps its width); the chip's menu has no 更新; a real press on a path-installed plugin's «更新…» with
//     nothing new at its source says «… 已是最新（0.1.0）». PNG <prefix>-row.png = the planted plugin's row.
// On 160045063 (the base — run this file on a `git archive` copy) ③ ④ ⑤ ⑥ are RED, in both variants (15 rows); on 63f59d572
// ⑨ is RED (no 更新… on the row, 更新 in the chip's menu, the press finds no button).
// PNGs: PLUGIN_CONSENT_PNG_DIR (default: the scratch root) <prefix>-consent.png / <prefix>-readonly.png, prefix =
// PLUGIN_CONSENT_SHOT_PREFIX (default 'run'). This box's own fonts (the zh words need a CJK face; the runner's DejaVu has none).
// Requires google-chrome (SKIP without). Run: node scripts/test-plugin-consent-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, realClicker } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
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
check('the tree\'s server answers', up);
if (!up) process.exit(1);

const CDP_PORT = await freePort();
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
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
});
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
  check(`${tag} ③ the explanation is the dialog's body text — its font-size = the bullets' (${m.intro.fs} vs ${[...new Set(m.lis.map((l) => l.fs))].join('/')})`, m.lis.every((l) => l.fs === m.intro.fs), m.intro);
  check(`${tag} ③ the explanation is not in the dim hint tone (${m.intro.color} vs --text-dim ${m.dim})`, m.intro.color !== m.dim, m.intro);
  check(`${tag} ③ the explanation is no .usage-note (the Usage window's note class)`, !/\busage-note\b/.test(m.intro.cls), m.intro.cls);
  check(`${tag} ④ the list's padding-left holds its marker (12 ≤ ${m.list.pl} ≤ 20 px) — padding 0 hangs the outside markers on the dialog's border`, m.list.pl >= 12 && m.list.pl <= 20, m.list);
  check(`${tag} ④ the list box starts at the explanation's left edge, inside the body's padding (the marker in the dialog's text column)`, Math.abs(m.list.l - m.intro.l) <= 0.5 && m.list.l >= m.bodyPadL - 0.5, { list: m.list, intro: m.intro, bodyPadL: m.bodyPadL });
  check(`${tag} ④ the list has no margin of its own (the body's gap spaces it)`, m.list.mt === 0 && m.list.mb === 0, m.list);
  const rowGaps = m.lis.slice(1).map((l, i) => +(l.t - m.lis[i].b).toFixed(1));
  check(`${tag} ④ its rows stand ≈ 6 px apart (${rowGaps.join(', ') || 'one row'})`, rowGaps.every((g) => g >= 4 && g <= 8), m.lis);
  const band = +(m.intro.t - m.headB).toFixed(1);
  check(`${tag} ⑤ no blank band: the explanation starts the body's own padding below the title row (${band} px vs ${m.bodyPadTop})`, band <= m.bodyPadTop + 0.5, { band, kids: m.kids });
  check(`${tag} ⑤ no box between the title row and the explanation taller than the body's gap (${m.gap} px)`, m.between.every((b) => b.h <= m.gap), m.between);
  const toList = +(m.list.t - m.intro.b).toFixed(1);
  check(`${tag} ⑤ the explanation sits one body gap above the list it introduces (${toList} px vs ${m.gap})`, Math.abs(toList - m.gap) <= 0.5, { intro: m.intro, list: m.list });
};

const row = `.plugin-row[data-plugin="${PID}"]`;
await step('①', async () => {
  const r = await evalJs(`fetch('/api/plugins/manifests').then((x) => x.json()).then((j) => (j.plugins || []).find((p) => p.id === ${J(PID)}) || null)`);
  check('① the planted plugin is listed valid, disabled, asking for consent', !!r && r.valid && !r.enabled && r.consentRequired, r && { valid: r.valid, enabled: r.enabled, consentRequired: r.consentRequired, errors: r.errors });
});
await step('②', async () => {
  await evalJs('app.openPluginsDialog(); true');
  check('② the Plugins window lists the planted plugin with its switch', await waitFor(`!!document.querySelector('${row} .plugin-sw')`, 20000));
  const pressed = await realClick(`${row} .plugin-sw`);
  const up2 = await waitFor(`!!document.querySelector('#plugin-consent-dialog .plugin-caps-list')`, 15000);
  check('② a real press on its switch opens the consent dialog', !!pressed && up2, realClick.lastMiss);
  const m = await evalJs(MEASURE);
  check(`② «${m?.title}» lists the two bullets of the owner's screenshot (server-process, browser-engine)`, J(m?.lis.map((l) => l.id)) === J(['plugin-cap-server-process', 'plugin-cap-browser-engine']), m?.lis);
  await shot('consent');
  judge('consent:', m);
  const eng = m?.lis.find((l) => l.id === 'plugin-cap-browser-engine')?.text || '';
  check('⑥ the browser-engine bullet (zh) names the program VibeSpace starts as a profile\'s browser', eng.includes('它指定一个程序，由 VibeSpace 作为浏览器档案的浏览器来启动'), eng);
});
await step('⑦', async () => {
  const cancel = await evalJs(`(() => { const b = document.querySelector('#plugin-consent-dialog .plugin-consent-actions .mounts-btn:not(.plugin-consent-accept)'); if (b) b.dataset.pc = 'cancel'; return !!b; })()`);
  if (cancel) await realClick('[data-pc="cancel"]');
  const gone = await waitFor(`!document.getElementById('plugin-consent-dialog')`, 8000);
  const off = await evalJs(`(() => { const c = document.querySelector('${row} .plugin-sw input'); return !!c && !c.checked; })()`);
  check('⑦ Cancel closes it and the switch is off again', cancel && gone && off, { cancel, gone, off });
});
await step('⑧', async () => {
  await realClick(`${row} .plugin-chip`);
  const tagged = await waitFor(`(() => { const its = [...document.querySelectorAll('.context-menu-item')]; window.__pcMenu = its.map((x) => x.textContent.trim()); const i = its.find((x) => ['查看能力…', 'Show capabilities…'].includes(x.textContent.trim())); if (i) i.dataset.pc = 'caps'; return !!i; })()`, 8000);
  if (tagged) await realClick('[data-pc="caps"]');
  const up3 = await waitFor(`!!document.querySelector('#plugin-consent-dialog .plugin-caps-list')`, 15000);
  check('⑧ the chip\'s «查看能力…» opens the read-only variant', tagged && up3);
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
  check(`⑨ ONE door: the chip's menu lists ${J(menu)} — no 更新`, Array.isArray(menu) && menu.length > 0 && !menu.some((x) => /^(更新|Update)/.test(x)), menu);
  const inst = await evalJs(`fetch('/api/plugins/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${J(J({ source: 'path', value: hsrc }))} }).then((x) => x.json())`);
  check('⑨ a second plugin installs through the page from a folder (source path)', inst?.plugin?.id === HID, inst);
  await evalJs(`(() => { const b = [...document.querySelectorAll('.plugin-manifests-head .mounts-btn')].find((x) => ['重新扫描', 'Rescan'].includes(x.textContent.trim())); if (b) b.click(); return !!b; })()`);
  await waitFor(`!!document.querySelector('.plugin-row[data-plugin="${HID}"]')`, 15000);
  const M = await evalJs(`(() => {
    const row = document.querySelector('${row}'); if (!row) return null;
    row.scrollIntoView({ block: 'center' });
    const R = (e) => { const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right, w: r.width, h: r.height }; };
    const box = row.querySelector('.plugin-row-actions'), main = row.querySelector('.plugin-row-main'), sw = row.querySelector(':scope > .plugin-sw'), gear = row.querySelector(':scope > .plugin-gear');
    const btns = box ? [...box.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), cls: b.className, disabled: b.disabled, vis: getComputedStyle(b).visibility, ...R(b) })) : [];
    return { row: R(row), box: box && { parentIsRow: box.parentElement === row, ...R(box) }, btns, main: R(main), sw: R(sw), gear: R(gear), colGap: parseFloat(getComputedStyle(row).columnGap), vw: innerWidth, vh: innerHeight };
  })()`);
  if (M) { // the row's PNG first — on the base (no cluster) it is the «before»
    const pad = 6, x = Math.max(0, M.row.l - pad), y = Math.max(0, M.row.t - pad);
    try { const { data } = await cdp('Page.captureScreenshot', { format: 'png', clip: { x, y, width: Math.min(M.vw - x, M.row.w + 2 * pad), height: Math.min(M.vh - y, M.row.h + 2 * pad), scale: 1 } }); const f = path.join(SHOTS, `${PREFIX}-row.png`); fs.writeFileSync(f, Buffer.from(data, 'base64')); console.log(`  (shot: ${f})`); } catch { }
  }
  const upd = M?.btns.find((b) => b.text === '更新…'), un = M?.btns.find((b) => b.text === '卸载…');
  check(`⑨ the git-installed plugin's row shows «更新…» beside «卸载…» in one actions cluster (${J(M?.btns.map((b) => b.text))})`, !!upd && !!un && !!M.box?.parentIsRow && M.btns.indexOf(upd) < M.btns.indexOf(un) && /\bplugin-update\b/.test(upd.cls) && !upd.disabled, M);
  const inside = (b) => !!b && b.w > 0 && b.h > 0 && b.vis === 'visible' && b.l >= M.row.l - 0.5 && b.r <= M.row.r + 0.5 && b.t >= M.row.t - 0.5 && b.b <= M.row.b + 0.5 && b.l >= 0 && b.r <= M.vw && b.t >= 0 && b.b <= M.vh;
  const gaps = M && [M.sw.l - M.main.r, M.gear.l - M.sw.r].map((g) => +g.toFixed(1));
  check(`⑨ the cluster widens neither the switch nor the ⚙ column — the name keeps its width (${M && M.main.w.toFixed(0)} px; gaps ${J(gaps)} vs the row's ${M && M.colGap} px)`, !!M && gaps.every((g) => g <= M.colGap + 0.5), M && { main: M.main, sw: M.sw, gear: M.gear });
  check(`⑨ both buttons are drawn inside the row and the 1000 × 600 viewport, on one line (更新… ${upd ? `${upd.l.toFixed(0)},${upd.t.toFixed(0)} ${upd.w.toFixed(0)}×${upd.h.toFixed(0)}` : 'absent'}; 卸载… ${un ? `${un.l.toFixed(0)},${un.t.toFixed(0)}` : 'absent'})`, inside(upd) && inside(un) && Math.abs(upd.t - un.t) <= 1, M);
  const hrow = `.plugin-row[data-plugin="${HID}"]`;
  await evalJs(`(() => { const r = document.querySelector('${hrow}'); if (r) r.scrollIntoView({ block: 'center' }); return !!r; })()`);
  const pressed = await realClick(`${hrow} .plugin-update`);
  const said = await waitFor(`[...document.querySelectorAll('.global-toast')].some((x) => x.textContent.includes('${HID} 已是最新（0.1.0）'))`, 20000);
  const toasts = await evalJs(`[...document.querySelectorAll('.global-toast')].map((x) => x.textContent.trim())`);
  check(`⑨ a real press on «更新…» with nothing new at the source says «${HID} 已是最新（0.1.0）» (${J(toasts)})`, !!pressed && said, { pressed, miss: realClick.lastMiss, toasts });
});
check('no page exceptions', pageErrors.length === 0, pageErrors.slice(0, 3));
console.log(fail ? `✗ ${fail} failed, ${pass} passed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
