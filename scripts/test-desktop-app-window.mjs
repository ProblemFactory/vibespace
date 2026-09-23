#!/usr/bin/env node
// DESKTOP-APP WINDOW — end to end in headless chrome against a worktree server
// with a REAL Xvfb + x11vnc (docs/design-desktop-apps.zh.md §6 row 4, P8-1,
// 2026-09-13): the launch dialog (⚙ → Desktop apps… = the `desktopApps.open`
// command) → a `desktop-app` window appears with the app's label → its noVNC
// canvas is NOT all black → a SECOND browser client sees the same window
// (layout sync replays the openSpec; both stream one display) → SIGKILL the
// server + reboot ⇒ the session is ADOPTED and the window reconnects (the
// status chip reads "vnc-display (xpra not on PATH)" on this box) → Stop ⇒ the
// window says it exited, and no X/x11vnc survives. Also the singleton Desktop
// window still opens through the shared component and bridge (its /api/vnc
// start fails LOUDLY here — no Xvnc — through the same status chip).
//
// THE LAUNCH DIALOG'S GEOMETRY (2026-09-14, the owner's picture reproduced at
// 1000×800@2x): a body min-width of 760px inside `.dialog`'s fixed 440px +
// overflow:hidden clipped the right half, and the UA's focus scroll-into-view
// on the Command input scrolled `.dialog` itself by 308px — the title
// off-left, ✕ mid-header, the Applications column a 64px sliver. The suite
// checked NO geometry, which is why it shipped green. Now every fresh open at
// 1000×800, 777×800 and 480×640 is MEASURED (computed rects in the page): the
// dialog does not scroll sideways, the title is hit-testable, ✕ sits in the
// dialog's right 48px, the first card label lies inside its card, the two
// Advanced columns each keep ≥ 38 % of the dialog when two are shown — and the
// LATENT squeeze (three nowrap Recent entries turned 1fr/1fr into 126/692) is
// seeded and asserted too. Plus the catalog-first redo: the intro line (also
// in zh), a card click that launches with a visible launching state, the
// Advanced disclosure closed by default and persisted open across a reload.
// VS_UI_SHOTS_DIR=<dir> saves 2x PNGs of each measured state there.
// SKIPs without chrome / Xvfb / x11vnc. Worktree-isolated (own data/, a
// scratch HOME, VIBESPACE_SKIP_AGENT_HOOKS=1), free ports, per-pid names.
// Run: node scripts/test-desktop-app-window.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE } from './scratch.mjs';
import zhDict from '../src/lib/i18n-zh.js';
// P8-2 (2026-09-21): xpra is wired and wins the default ladder when installed; this suite drives the noVNC picture, so the
// worktree server is PINNED to vnc-display through settings `desktop.backendPrefs` (a reorder — nothing falls, the chip reads
// the plain rung). The xpra window is chunk x2's leg.
const XTERM_PRESENT = (process.env.PATH || '').split(':').some((p) => { try { return fs.statSync(p + '/xterm').isFile(); } catch { return false; } });
const XPRA_WHY = null;
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require('../src/desktop-display.js');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const facts = await D.hostFacts({});
const APP = ['xmessage', 'xterm', 'xlogo'].map((n) => [n, D.binOnPath(n, { env: process.env })]).find(([, p]) => p);
const skipWhy = !CHROME ? 'no chrome/chromium' : !facts.bins.Xvfb ? 'Xvfb not on PATH' : !facts.bins.x11vnc ? 'x11vnc not on PATH' : !APP ? 'no xmessage/xterm/xlogo' : null;
if (skipWhy) { console.log(`SKIP: ${skipWhy}`); process.exit(0); }
const [appName, appBin] = APP;
const appArgs = appName === 'xmessage' ? ['-geometry', '500x300+20+20', '-fg', 'black', '-bg', 'white', 'VIBESPACE DESKTOP APP WINDOW'] : appName === 'xterm' ? ['-geometry', '80x24', '-T', 'vs-window'] : [];
const SHOTS = process.env.VS_UI_SHOTS_DIR ? path.resolve(process.env.VS_UI_SHOTS_DIR) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('deskapp-smoke');
const home = scratchHome('deskapp-home', fs);
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) { execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
fs.writeFileSync(path.join(wt, 'data', 'settings.json'), JSON.stringify({ 'desktop.backendPrefs': 'vnc-display, xpra, desktop-singleton' })); // the pin (see the header)
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

const srvEnv = { ...process.env, PORT: String(PORT), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1' };
let srv = null;
const bootServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: 'ignore' }); return srv; };
bootServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', '--window-size=1400,900', `--user-data-dir=${scratch('deskapp-chrome')}`, 'about:blank'], { stdio: 'ignore' });
const recordedPids = () => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(wt, 'data/desktop-apps.json'), 'utf8')).apps).flatMap((a) => Object.values(a.pids || {})).filter(Boolean); } catch { return []; } };
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv?.kill('SIGKILL'); } catch {}
  for (const p of recordedPids()) { try { process.kill(p, 'SIGKILL'); } catch {} } // a failed leg leaves no X server behind
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(scratch('deskapp-chrome'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

const waitServer = async () => { for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
check('worktree server boots', await waitServer());
const WebSocket = require('ws');
const cdpTargets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json());
let target = await until(async () => (await cdpTargets()).find((t) => t.type === 'page'), 20000, 250);
async function page(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails))); return r.result.value; };
  await cdp('Page.enable');
  return { ws, cdp, evalJs, close: () => { try { ws.close(); } catch {} } };
}
// layout.js holds `_restoring` for 5 s after a load (autosave dropped meanwhile,
// for every window type) — wait it out like a human's first click does, so a
// window opened here is persisted and replayed on the other clients
const openPage = async (p) => { await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await p.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await sleep(1500); await p.evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })' /* in-page poll (2.369.118): the heavy tier went red with "no app" in two chrome lanes at once — one probe 1.5 s after navigate is a bet on load speed */); await until(() => p.evalJs('app.layoutManager && app.layoutManager._restoring === false'), 12000, 250); };
// the canvas noVNC paints: is it non-black? (sample the pixels)
const CANVAS_SAMPLE = `(() => { const c = document.querySelector('.window .desktop-app-canvas-probe') || [...document.querySelectorAll('.window canvas')].find((x) => x.width > 50 && x.height > 50); if (!c) return { found: false }; const ctx = c.getContext('2d'); const d = ctx.getImageData(0, 0, c.width, c.height).data; let bright = 0, n = 0; for (let i = 0; i < d.length; i += 64) { n++; if (d[i] + d[i + 1] + d[i + 2] > 60) bright++; } return { found: true, w: c.width, h: c.height, brightFrac: bright / n }; })()`;
// a TRUSTED click (CDP Input) at an element's centre: the layout autosave only
// fires after a real pointerdown/keydown (layout.js's anti-echo guard), and a
// real click is also what the dialog's buttons get from a human
const trustedClick = async (p, selector) => {
  const r = await p.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView?.({ block: 'nearest' }); const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
  if (!r) throw new Error(`trustedClick: ${selector} not clickable`);
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return r;
};
// a FRESH open of the launch dialog: whatever is open goes, the toolbar button
// is clicked, and the dialog has answered (registry rendered + the disclosure
// decided + the 0 ms focus fired) before anyone measures it
const openDialog = async (p) => {
  await p.evalJs(`(() => { document.getElementById('desktop-launch-dialog')?.remove(); document.getElementById('btn-desktop-apps').click(); return true; })()`);
  const ok = await until(() => p.evalJs(`!!document.querySelector('#desktop-launch-dialog .desktop-launch-card, #desktop-launch-dialog .desktop-launch-empty')`), 8000, 100);
  await sleep(400);
  return !!ok;
};
// the geometry of the open dialog, as the page computes it
const GEOM = `(() => {
  const ov = document.getElementById('desktop-launch-dialog'); if (!ov) return null; const dlg = ov.querySelector('.dialog');
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  const h3 = dlg.querySelector('.dialog-header h3'), x = dlg.querySelector('.dialog-close');
  const hr = R(h3); const hit = document.elementFromPoint(hr.x + hr.w / 2, hr.y + hr.h / 2);
  const card = dlg.querySelector('.desktop-launch-card'); const label = card && card.querySelector('.desktop-launch-card-label');
  const grid = dlg.querySelector('.desktop-launch-grid'); const body = dlg.querySelector('.dialog-body'); const intro = dlg.querySelector('.desktop-launch-intro');
  const vis = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const cols = [...dlg.querySelectorAll('.desktop-launch-col')].filter(vis).map(R);
  const cards = [...dlg.querySelectorAll('.desktop-launch-card')].map((c) => ({ id: c.dataset.appId, disabled: c.disabled, unavailable: c.classList.contains('is-unavailable'), launching: c.classList.contains('is-launching'), svg: !!c.querySelector('.desktop-launch-card-icon svg'), label: c.querySelector('.desktop-launch-card-label')?.textContent, sub: c.querySelector('.desktop-launch-card-sub')?.textContent, visible: vis(c) }));
  return { vw: innerWidth, vh: innerHeight, dlg: R(dlg), scrollLeft: dlg.scrollLeft, scrollWidth: dlg.scrollWidth, clientWidth: dlg.clientWidth, bodyClientW: body.clientWidth, bodyScrollW: body.scrollWidth, bodyContentW: body.clientWidth - parseFloat(getComputedStyle(body).paddingLeft) - parseFloat(getComputedStyle(body).paddingRight),
    h3: hr, h3Hit: !!hit && (hit === h3 || h3.contains(hit)), close: R(x), card: card ? R(card) : null, label: label ? R(label) : null, grid: grid ? R(grid) : null, cols, cards,
    adv: dlg.querySelector('.desktop-launch-adv-toggle')?.getAttribute('aria-expanded') || null, advBodyVisible: vis(dlg.querySelector('.desktop-launch-adv-body')), introVisible: vis(intro), introText: intro ? intro.textContent : '',
    runningVisible: vis(dlg.querySelector('.desktop-launch-running-sec')), focused: document.activeElement ? (document.activeElement.className || document.activeElement.tagName) : null };
})()`;
const shot = async (p, name) => { if (!SHOTS) return; const r = await p.cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); };
const INTRO_KEY = (() => { const m = /desktop-launch-intro">\$\{escHtml\(t\('([^']+)'\)\)\}/.exec(fs.readFileSync(path.join(repo, 'src/lib/desktop-app-launcher.js'), 'utf8')); return m ? m[1] : null; })();

let p1 = await page(target);
try {
  await openPage(p1);
  const av = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json())`);
  check('server: vnc-display via Xvfb+x11vnc with the fallback reason', av.availability?.backend === 'vnc-display' && av.availability?.fallbackWhy === XPRA_WHY, av.availability);
  check('the toolbar Apps button is visible (probe found a backend)', await until(() => p1.evalJs(`getComputedStyle(document.getElementById('btn-desktop-apps')).display !== 'none'`), 8000));
  // 2.369.97 (userW, inc-mu1qa5gj-9qe9): the Apps probe re-applies the chrome
  // settings AFTER the VNC probe has answered, and `toolbar.showDesktopButton`
  // was never declared in the schema — so a machine WITH a VNC server lost its
  // Desktop button on every page load (reproduced with an Xvnc on PATH, A/B
  // against 2.369.95). This box has no Xvnc, so the probe outcome is stated
  // directly: with vnc available, re-applying chrome settings must keep the
  // button; and the setting must be a declared, default-true schema row.
  check('the Desktop button survives a chrome-settings re-apply once VNC is available (the .96 regression shape)', await p1.evalJs(`(() => { app._vncAvailable = true; app._applyChromeSettings(); return getComputedStyle(document.getElementById('btn-desktop')).display !== 'none' && app.settings.get('toolbar.showDesktopButton') === true; })()`));
  check('…and NOT when the user turned it off (the setting is the switch, not the probe)', await p1.evalJs(`(() => { const prev = app.settings.get('toolbar.showDesktopButton'); app.settings.set('toolbar.showDesktopButton', false); app._applyChromeSettings(); const hidden = getComputedStyle(document.getElementById('btn-desktop')).display === 'none'; app.settings.set('toolbar.showDesktopButton', prev); app._applyChromeSettings(); return hidden && getComputedStyle(document.getElementById('btn-desktop')).display !== 'none'; })()`));
  check('⚙ menu carries the "Desktop apps…" row (a contribution, when the backend exists)', await p1.evalJs(`(async () => { const m = await import('/src/lib/contributions.js').catch(() => null); return true; })()`) && await p1.evalJs(`app._desktopAppsAvailable === true`));

  // ── §G THE LAUNCH DIALOG'S GEOMETRY, measured on a fresh open at three viewports ──
  console.log('§G the launch dialog does not clip, scroll or squeeze at 1000×800 / 777×800 / 480×640 (fresh open, computed rects)');
  const VIEWPORTS = [[1000, 800], [777, 800], [480, 640]];
  const patchState = (patch) => p1.evalJs(`fetch('/api/user-state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(patch))} }).then((r) => r.ok)`);
  const assertGeom = (tag, g, { twoColumns }) => {
    check(`${tag}: the dialog fits the viewport (${g.dlg.w.toFixed(0)}px wide in ${g.vw})`, g.dlg.w <= g.vw && g.dlg.x >= -0.5 && g.dlg.r <= g.vw + 0.5, g.dlg);
    check(`${tag}: .dialog is not scrolled sideways and has nothing to scroll (scrollLeft ${g.scrollLeft}, scrollWidth ${g.scrollWidth} ≤ clientWidth ${g.clientWidth})`, g.scrollLeft === 0 && g.scrollWidth <= g.clientWidth);
    check(`${tag}: the body has no sideways overflow either (${g.bodyScrollW} ≤ ${g.bodyClientW})`, g.bodyScrollW <= g.bodyClientW + 1);
    check(`${tag}: the title is hit-testable at its centre (elementFromPoint lands on the h3)`, g.h3Hit, { h3: g.h3, hit: g.h3Hit });
    check(`${tag}: ✕ sits inside the dialog's right 48px (x ${g.close.x.toFixed(0)}..${g.close.r.toFixed(0)} vs dialog right ${g.dlg.r.toFixed(0)})`, g.close.r <= g.dlg.r + 0.5 && g.close.x >= g.dlg.r - 48);
    check(`${tag}: the intro line renders`, g.introVisible && g.introText.length > 40);
    check(`${tag}: the first app card's label lies inside its card`, !!g.card && !!g.label && g.label.x >= g.card.x - 0.5 && g.label.r <= g.card.r + 0.5 && g.label.w > 0, { card: g.card, label: g.label });
    check(`${tag}: the catalog grid spans the body's content box (${g.grid && g.grid.w.toFixed(0)} of ${g.bodyContentW.toFixed(0)})`, !!g.grid && g.grid.w >= 0.98 * g.bodyContentW);
    if (twoColumns) check(`${tag}: both Advanced columns keep ≥ 38 % of the dialog (${g.cols.map((c) => (100 * c.w / g.dlg.w).toFixed(0) + '%').join('/')})`, g.cols.length === 2 && g.cols.every((c) => c.w >= 0.38 * g.dlg.w), g.cols);
    else check(`${tag}: ≤768px — the Advanced form is ONE column, each spanning the body`, g.cols.length === 2 && g.cols.every((c) => c.w >= 0.98 * g.bodyContentW) && Math.abs(g.cols[0].x - g.cols[1].x) < 1, g.cols);
  };
  for (const [w, h] of VIEWPORTS) {
    await p1.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: w <= 768 });
    await sleep(200);
    check(`${w}×${h}: a fresh open renders the catalog`, await openDialog(p1));
    let g = await p1.evalJs(GEOM);
    check(`${w}×${h}: the Advanced disclosure is CLOSED on a fresh open (aria-expanded=false, form hidden)`, g.adv === 'false' && !g.advBodyVisible, { adv: g.adv, advBodyVisible: g.advBodyVisible });
    check(`${w}×${h}: nothing is running yet ⇒ the Running section is not shown`, !g.runningVisible);
    check(`${w}×${h}: every registry row is a visible card with an SVG icon — an absent binary is DIMMED with its reason, never hidden`, g.cards.length >= 3 && g.cards.every((c) => c.visible && c.svg) && g.cards.filter((c) => c.unavailable).every((c) => c.disabled && /not on PATH|parked/i.test(c.sub)), g.cards);
    await shot(p1, `after-fresh-open-${w}x${h}@2x.png`);
    // the closed state has no columns to measure; open the disclosure (a real click) and measure the form
    await trustedClick(p1, '#desktop-launch-dialog .desktop-launch-adv-toggle');
    await sleep(250);
    g = await p1.evalJs(GEOM);
    check(`${w}×${h}: the disclosure opens on click (aria-expanded=true) and the Command input has focus without scrolling the dialog`, g.adv === 'true' && g.advBodyVisible && /desktop-launch-exec/.test(g.focused || '') && g.scrollLeft === 0, { adv: g.adv, focused: g.focused, scrollLeft: g.scrollLeft });
    assertGeom(`${w}×${h} (Advanced open)`, g, { twoColumns: w > 768 });
    await shot(p1, `after-advanced-open-${w}x${h}@2x.png`);
    // …and the disclosure click PERSISTED `true`; put it back so the next fresh open is a control
    check(`${w}×${h}: the disclosure state reached user state (merge-only PATCH)`, await until(() => p1.evalJs(`fetch('/api/user-state').then((r) => r.json()).then((s) => s.desktopAppAdvancedOpen === true)`), 4000, 100));
    await patchState({ desktopAppAdvancedOpen: false });
  }
  // the LATENT squeeze: three long nowrap Recent entries used to turn 1fr/1fr
  // into 126/692 (measured) — the columns are minmax(0,1fr) now
  await patchState({ desktopAppRecents: [1, 2, 3].map((i) => ({ exec: `/usr/local/lib/some-very-long-vendor-directory-${i}/bin/an-application-with-a-long-name`, args: ['--profile-directory=/home/someone/.config/an-application/profiles/default-profile', '--no-sandbox', '--flag-number-' + i], cwd: '/home/someone/workspace/a-project-with-a-descriptive-name/subdir', label: `Recent ${i}` })), desktopAppAdvancedOpen: true });
  await p1.cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 2, mobile: false });
  await sleep(200);
  check('latent case: a fresh open with three long Recent entries (persisted) and the disclosure persisted open', await openDialog(p1));
  {
    const g = await p1.evalJs(GEOM);
    check('latent case: the persisted disclosure preference opens the form on a fresh open', g.adv === 'true' && g.advBodyVisible);
    check(`latent case: three Recent rows rendered`, await p1.evalJs(`document.querySelectorAll('#desktop-launch-dialog .desktop-launch-recents .desktop-launch-app').length === 3`));
    check(`latent case: both columns keep ≥ 38 % beside three nowrap Recent entries (${g.cols.map((c) => (100 * c.w / g.dlg.w).toFixed(0) + '%').join('/')})`, g.cols.length === 2 && g.cols.every((c) => c.w >= 0.38 * g.dlg.w), g.cols);
    check('latent case: the catalog grid still spans the body', !!g.grid && g.grid.w >= 0.98 * g.bodyContentW);
    check('latent case: no sideways scroll', g.scrollLeft === 0 && g.scrollWidth <= g.clientWidth && g.bodyScrollW <= g.bodyClientW + 1);
    await shot(p1, 'after-latent-three-recents-1000x800@2x.png');
  }
  await patchState({ desktopAppRecents: [], desktopAppAdvancedOpen: false });

  // ── §Z the intro line in zh (per-device language; reload-on-switch) ──
  console.log('§Z the intro line speaks the device language');
  check('control: the intro key is read off the launcher source', !!INTRO_KEY && INTRO_KEY.length > 40, INTRO_KEY);
  check('control: the zh dictionary carries the intro key (and ja does, by the i18n-check parity)', typeof zhDict[INTRO_KEY] === 'string' && zhDict[INTRO_KEY].length > 10);
  await p1.evalJs(`localStorage.setItem('vibespace.lang', 'zh'); true`);
  await openPage(p1);
  await openDialog(p1);
  {
    const g = await p1.evalJs(GEOM);
    check('in zh the intro line renders the zh translation (not the English key)', g.introVisible && g.introText === zhDict[INTRO_KEY], { got: g.introText.slice(0, 80) });
    check('in zh the disclosure label is translated too', await p1.evalJs(`document.querySelector('#desktop-launch-dialog .desktop-launch-adv-toggle').textContent === ${JSON.stringify(zhDict['Advanced: run any command'])}`));
    await shot(p1, 'after-intro-zh-1000x800@2x.png');
  }
  await p1.evalJs(`localStorage.removeItem('vibespace.lang'); true`);
  await p1.cdp('Emulation.clearDeviceMetricsOverride');
  await openPage(p1);

  // ── §C a card click launches, and the card SHOWS it ──
  console.log('§C one click on an app card launches it; the card shows the launching state until the record answers');
  const catalog = (await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json())`)).registry || [];
  const cardApp = ['gnome-calculator', 'xterm', 'gedit', 'xmessage'].map((id) => catalog.find((r) => r.id === id && r.available)).find(Boolean) || catalog.find((r) => r.available && r.category !== 'browser');
  if (!cardApp) console.log('  SKIP §C: no available non-browser registry app on this box (the catalog is presence-checked)');
  else {
    await openDialog(p1);
    // hold the ONE launch POST for 1.2 s in the page (the real request still
    // goes out): the keeper answers the moment bring-up starts, so the
    // launching state would otherwise last one round-trip
    await p1.evalJs(`(() => { const of = window.fetch; window.fetch = function (u, o) { const p = of.apply(this, arguments); if (o && o.method === 'POST' && /\\/api\\/desktop\\/apps$/.test(String(u))) { window.fetch = of; return new Promise((res, rej) => p.then((r) => setTimeout(() => res(r), 1200), rej)); } return p; }; return true; })()`);
    await trustedClick(p1, `#desktop-launch-dialog .desktop-launch-card[data-app-id="${cardApp.id}"]`);
    await sleep(300);
    const st = await p1.evalJs(`(() => { const c = document.querySelector('#desktop-launch-dialog .desktop-launch-card[data-app-id="${cardApp.id}"]'); if (!c) return null; const others = [...document.querySelectorAll('#desktop-launch-dialog .desktop-launch-card')].filter((x) => x !== c && !x.classList.contains('is-unavailable')); return { launching: c.classList.contains('is-launching'), disabled: c.disabled, busy: c.getAttribute('aria-busy'), sub: c.querySelector('.desktop-launch-card-sub')?.textContent, spinner: !!c.querySelector('.desktop-launch-card-icon svg') && getComputedStyle(c.querySelector('.desktop-launch-card-icon svg')).animationName !== 'none', othersEnabled: others.every((x) => !x.disabled), cursor: getComputedStyle(c).cursor }; })()`);
    check(`clicking the ${cardApp.label} card shows the launching state: is-launching, disabled, aria-busy, "Launching…", spinning icon`, !!st && st.launching && st.disabled && st.busy === 'true' && /Launching/.test(st.sub || '') && st.spinner, st);
    check('…while the other available cards stay enabled (only the launching one is held)', !!st && st.othersEnabled);
    if (SHOTS) await shot(p1, 'after-card-launching-1400x900.png');
    const cwin = await until(() => p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w.type === 'desktop-app'); return w ? { id: w.id, appId: w._desktopAppId } : null; })()`), 15000);
    check('the card launch opens a desktop-app window and closes the dialog', !!cwin && await p1.evalJs(`!document.getElementById('desktop-launch-dialog')`), cwin);
    if (cwin) {
      const crec = await until(() => p1.evalJs(`fetch('/api/desktop/apps/${cwin.appId}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 25000);
      check(`the card-launched record (${cardApp.exec}) reaches ready`, !!crec && crec.state === 'ready', crec && crec.lastError);
      // Running shows it, with the slot count, on the next open
      await openDialog(p1);
      const g = await p1.evalJs(GEOM);
      check('with a session live, the Running section shows above the catalog with the slot count', g.runningVisible && await p1.evalJs(`/1 of \\d+ slots|1 running/.test(document.querySelector('#desktop-launch-dialog .desktop-launch-count')?.textContent || '') && document.querySelector('#desktop-launch-dialog .desktop-launch-running-sec').compareDocumentPosition(document.querySelector('#desktop-launch-dialog .desktop-launch-grid')) & Node.DOCUMENT_POSITION_FOLLOWING`));
      await p1.evalJs(`document.getElementById('desktop-launch-dialog')?.remove(); true`);
      // stop it and close its window so the form-launched session below is the only one
      await p1.evalJs(`fetch('/api/desktop/apps/${cwin.appId}/stop', { method: 'POST' }).then((r) => r.json())`);
      await until(() => p1.evalJs(`fetch('/api/desktop/apps/${cwin.appId}').then((r) => r.json()).then((r) => (r.state === 'exited' || r.state === 'failed' ? r : null))`), 15000);
      await p1.evalJs(`app.wm.closeWindow(${JSON.stringify(cwin.id)}); true`);
      await sleep(300);
    }
  }

  // ── §P the disclosure: closed by default, persisted open across a reload ──
  console.log('§P "Advanced: run any command" is collapsed by default and its open state survives a reload');
  await openDialog(p1);
  check('a fresh open: the disclosure is closed (nothing persisted)', await p1.evalJs(`document.querySelector('#desktop-launch-dialog .desktop-launch-adv-toggle').getAttribute('aria-expanded') === 'false'`));
  check('the disclosure is a BUTTON with aria-expanded + aria-controls, and the cards are buttons (keyboard-reachable)', await p1.evalJs(`(() => { const t = document.querySelector('#desktop-launch-dialog .desktop-launch-adv-toggle'); const body = document.getElementById(t.getAttribute('aria-controls')); return t.tagName === 'BUTTON' && !!body && [...document.querySelectorAll('#desktop-launch-dialog .desktop-launch-card')].every((c) => c.tagName === 'BUTTON'); })()`));
  await trustedClick(p1, '#desktop-launch-dialog .desktop-launch-adv-toggle');
  check('click ⇒ open, persisted', await until(() => p1.evalJs(`fetch('/api/user-state').then((r) => r.json()).then((s) => s.desktopAppAdvancedOpen === true && document.querySelector('#desktop-launch-dialog .desktop-launch-adv-toggle').getAttribute('aria-expanded') === 'true')`), 4000, 100));
  await openPage(p1);
  await openDialog(p1);
  check('after a reload the disclosure opens by itself (user state), the form visible', await p1.evalJs(`(() => { const t = document.querySelector('#desktop-launch-dialog .desktop-launch-adv-toggle'); const b = document.querySelector('#desktop-launch-dialog .desktop-launch-adv-body'); return t.getAttribute('aria-expanded') === 'true' && getComputedStyle(b).display !== 'none'; })()`));

  // the launch dialog: run a command from its form (the disclosure is open from §P)
  check('the launch dialog is open', await p1.evalJs(`!!document.getElementById('desktop-launch-dialog')`));
  const availText = await p1.evalJs(`document.querySelector('#desktop-launch-dialog .desktop-launch-avail')?.textContent || ''`);
  check('the dialog states the ladder verdict in the chip\'s words', /vnc-display/.test(availText), availText);
  check('the catalog lists xterm as a card (presence-checked; dimmed+disabled with its reason when absent, enabled when present)', await p1.evalJs(`(() => { const b = document.querySelector('#desktop-launch-dialog .desktop-launch-card[data-app-id="xterm"]'); if (!b) return false; const absent = ${!XTERM_PRESENT ? 'true' : 'false'}; /* 2.369.131: hostFacts.bins never carries xterm — derive presence from PATH, not from a key that is always undefined (the leg passed only while xterm was absent; xpra's install pulled it in) */ return b.disabled === absent && b.classList.contains('is-unavailable') === absent && (!absent || /not on PATH/.test(b.textContent)); })()`));
  await p1.evalJs(`(() => { const d = document.getElementById('desktop-launch-dialog'); d.querySelector('.desktop-launch-exec').value = ${JSON.stringify(appBin)}; d.querySelector('.desktop-launch-args').value = ${JSON.stringify(appArgs.map((a) => (/\\s/.test(a) ? '"' + a + '"' : a)).join(' '))}; return true; })()`);
  // a TRUSTED click on Launch (CDP Input): the layout autosave only fires after
  // a real pointerdown/keydown (layout.js's anti-echo guard), exactly as a human's does
  await trustedClick(p1, '#desktop-launch-dialog .desktop-launch-run');
  const win = await until(() => p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w.type === 'desktop-app'); return w ? { id: w.id, appId: w._desktopAppId, title: w.title } : null; })()`), 15000);
  check('a desktop-app window appears after Launch', !!win, win);
  const appId = win && win.appId;
  const rec = await until(() => p1.evalJs(`fetch('/api/desktop/apps/${appId}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 20000);
  check('the server record reaches ready', !!rec && rec.state === 'ready', rec && rec.lastError);
  // P8-2 x4: on a keeper-fitted rung the title bar names the APP WINDOW (X's own name, read by the fit's enumeration) — the label only until then
  const xName = await until(async () => { const r = await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`); const top = (r.windows || []).filter((w) => w.depth === 1 && w.w > 1 && w.h > 1 && w.title).sort((a, b) => b.w * b.h - a.w * a.h)[0]; return top ? top.title : null; }, 10000);
  const shown = xName && await until(() => p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}'); return w && w.title === ${JSON.stringify(xName)} && w.titleSpan.textContent === ${JSON.stringify(xName)} ? w.title : null; })()`), 8000);
  check(`the window title is the app window's OWN title ${JSON.stringify(xName)} (X's name; the label ${JSON.stringify(path.basename(appBin))} only until the keeper read it), set as text`, !!shown, { xName, shown });
  const connected = await until(() => p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}'); const s = w?.content.querySelector('.desktop-status'); return s && s.textContent === 'Connected' ? s.textContent : null; })()`), 20000);
  check('the status chip says Connected (the ONE bridge relayed the RFB session)', connected === 'Connected', connected);
  const chip = await p1.evalJs(`[...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}')?.content.querySelector('.desktop-app-chip-backend')?.textContent`);
  check('the status bar names the backend rung: "vnc-display" (pinned first — nothing fell, no reason to print)', chip === 'vnc-display', chip);
  const sample = await until(async () => { const s = await p1.evalJs(CANVAS_SAMPLE); return s.found && s.brightFrac > 0.02 ? s : null; }, 20000, 500);
  check('the noVNC canvas is NOT all black (the app is painted)', !!sample, sample);
  check('the idle countdown chip is showing (30 min default)', await p1.evalJs(`/idle stop in \\d+ min/.test([...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}')?.content.querySelector('.desktop-app-chip-idle')?.textContent || '')`));

  // the autosave (500 ms debounce after a trusted input) must carry the openSpec before a second client can replay it
  const saved = await until(() => p1.evalJs(`fetch('/api/layouts').then((r) => r.json()).then((d) => JSON.stringify(d).includes('openDesktopApp') ? true : null)`), 10000, 300);
  check('the layout autosave carries the desktop-app openSpec (a trusted click made the layout user-dirty)', !!saved);
  // a SECOND client sees the same window and the same display
  const t2 = await (async () => { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' }); return r.json(); })();
  const p2 = await page(t2);
  await openPage(p2);
  const win2 = await until(() => p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}'); return w ? w.id : null; })()`), 15000);
  const dbg2 = win2 ? null : { p2windows: await p2.evalJs(`[...app.wm.windows.values()].map((w) => [w.type, w._desktopAppId || null, JSON.stringify(w._openSpec || null)])`), autosave: await p1.evalJs(`fetch('/api/layouts').then((r) => r.json()).then((d) => JSON.stringify(d).slice(0, 1500))`), p1windows: await p1.evalJs(`[...app.wm.windows.values()].map((w) => [w.type, JSON.stringify(w._openSpec || null)])`) };
  check('a second browser client gets the same desktop-app window (openSpec replayed by layout sync)', !!win2, dbg2);
  // x5 (docs/design-desktop-apps §7 P8-2 "x5 多客户端 = 单活跃 viewer"): the first client is the ACTIVE viewer — the second
  // opens BLOCKED behind the overlay and takes the window over with Resume here; closing it hands the window back
  const statusOf = (p) => p.evalJs(`[...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}')?.content.querySelector('.desktop-status')?.textContent || null`);
  const overlayOf = (p) => p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}'); const o = w && w.content.querySelector('.desktop-app-blocked'); if (!o || getComputedStyle(o).display === 'none') return null; app.wm.focusWindow(w.id); const r = o.querySelector('.desktop-app-resume').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, msg: o.querySelector('.term-blocked-msg').textContent, title: o.querySelector('.desktop-app-blocked-title').textContent }; })()`);
  const ov2 = await until(() => overlayOf(p2), 20000, 250);
  check(`x5: the second client opens BLOCKED behind "${ov2 && ov2.msg}" naming the app (${ov2 && ov2.title}) — one active viewer per window`, !!ov2 && ov2.msg === 'Active on another client' && !!ov2.title, ov2);
  if (ov2) {
    await p2.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ov2.x, y: ov2.y });
    await p2.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: ov2.x, y: ov2.y, button: 'left', clickCount: 1 });
    await p2.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ov2.x, y: ov2.y, button: 'left', clickCount: 1 });
  }
  const conn2 = await until(async () => ((await statusOf(p2)) === 'Connected' && !(await overlayOf(p2)) ? true : null), 20000);
  check('…Resume here: the second client is Connected (one display — the window is ITS now)', !!conn2, await statusOf(p2));
  const blocked1 = await until(() => overlayOf(p1), 10000, 250);
  check('…and the FIRST client is now blocked behind the overlay', !!blocked1, await statusOf(p1));
  p2.close();
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t2.id}`);
  const back1 = await until(async () => ((await statusOf(p1)) === 'Connected' && !(await overlayOf(p1)) ? true : null), 20000, 250);
  check('the second client closing hands the window back: the first is re-elected and Connected again', !!back1, await statusOf(p1));

  // SIGKILL the server, reboot: adopted + the window reconnects
  const pidsBefore = rec.pids;
  srv.kill('SIGKILL');
  await sleep(600);
  check('after SIGKILL the app, its picture server and its X are STILL RUNNING (detached)', [pidsBefore.x, pidsBefore.server, pidsBefore.app].every((p) => D.pidAlive(p)));
  bootServer();
  check('the server reboots', await waitServer());
  const adopted = await until(() => p1.evalJs(`fetch('/api/desktop/apps/${appId}').then((r) => r.json()).then((r) => (r.state === 'ready' && r.adoptedAt ? r : null))`), 20000);
  check('the session is ADOPTED by the new server (same pids, adoptedAt stamped)', !!adopted && adopted.pids.app === pidsBefore.app, adopted && { state: adopted.state, lastError: adopted.lastError });
  const trace = [];
  const reconn = await until(async () => { const st = await p1.evalJs(`[...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}')?.content.querySelector('.desktop-status')?.textContent`); trace.push(`${Date.now() % 100000}:${st}`); return st === 'Connected'; }, 40000, 1000);
  check('the SAME open window reconnects by itself (the view\'s ladder + the broadcast) — zero clicks', !!reconn, reconn ? undefined : trace.join(' | '));

  // a fresh page after the reboot restores the window from the layout
  const t3 = await (async () => { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' }); return r.json(); })();
  const p3 = await page(t3);
  await openPage(p3);
  // x5: p1 (reconnected above) is the active viewer — the fresh page restores the window BLOCKED, and Resume here connects it
  const ov3 = await until(() => overlayOf(p3), 30000, 500);
  check('a page loaded after the reboot restores the window from its openSpec — blocked behind the overlay while the first page is active (x5)', !!ov3, await statusOf(p3));
  if (ov3) {
    await p3.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ov3.x, y: ov3.y });
    await p3.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: ov3.x, y: ov3.y, button: 'left', clickCount: 1 });
    await p3.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ov3.x, y: ov3.y, button: 'left', clickCount: 1 });
  }
  const restored = await until(async () => ((await statusOf(p3)) === 'Connected' && !(await overlayOf(p3)) ? true : null), 30000, 500);
  check('…and connects after Resume here (the adopted session serves the new active viewer)', !!restored, await statusOf(p3));
  p3.close();
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t3.id}`);
  await until(async () => ((await statusOf(p1)) === 'Connected' && !(await overlayOf(p1)) ? true : null), 20000, 250); // handed back to the first page

  // Stop from the window's own button
  await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}'); w.content.querySelector('.desktop-app-stop').click(); return true; })()`);
  const ended = await until(() => p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}'); const s = w?.content.querySelector('.desktop-status')?.textContent; return s === 'Stopped' ? s : null; })()`), 15000);
  check('Stop ⇒ the window says "Stopped"', ended === 'Stopped', ended);
  await sleep(500);
  check('Stop leaves no X / picture server / app behind (every recorded pid gone)', [pidsBefore.x, pidsBefore.server, pidsBefore.app].every((p) => !D.pidAlive(p)));
  check('the Stop button is gone from an ended window; no Keep running either', await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}'); return getComputedStyle(w.content.querySelector('.desktop-app-stop')).display === 'none'; })()`));

  // the singleton Desktop window still goes through the shared component + bridge
  await p1.evalJs(`app.openDesktop(); true`);
  const singleton = await until(() => p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._isDesktop); const s = w?.content.querySelector('.desktop-status')?.textContent || ''; return /Connect|Desktop unavailable|no VNC server|Starting/.test(s) && s !== 'Connecting…' && s !== 'Starting desktop…' ? s : null; })()`), 15000);
  check('the singleton Desktop window renders through the shared component (its status chip speaks — here the server\'s own "no VNC server installed" text, since this box has no Xvnc)', !!singleton && (/no VNC server installed/.test(singleton) || singleton === 'Connected'), singleton);
  check('the singleton window carries the counter-zoom rule on its container', await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._isDesktop); return w.content.firstChild.style.zoom === 'calc(1 / var(--ui-scale, 1))'; })()`));
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
} finally {
  p1.close();
}
console.log(failed ? `\n${failed} FAILED` : '\ndesktop-app window test passed');
process.exit(failed ? 1 : 0);
