#!/usr/bin/env node
// THE PHONE'S BACK GESTURE in a real Chrome (lane mobile-back-guard, 2026-10-18 — the owner: 「在手机版上能不能 block 一下
// 那个返回手势啊？」). A throwaway server in a git worktree (test-mobile-gaps' harness: the built public/ overlaid) and
// headless Chrome over raw CDP at 390×844, DPR 3, an Android UA, touch emulation, hover:none / pointer:coarse — so
// app.isMobile AND app.isTouch hold as on a phone. Every app is entered from a "previous page" (a data: URL), so
// "leaving VibeSpace" is the tab landing back on it. Two kinds of back: `history.back()` from the page (the brief's
// leg) and the BROWSER's own back — the Alt+Left accelerator, i.e. NavigationController::GoBack with Chrome's
// back-button intervention, the same path Android's back gesture takes.
//   A  phone: one sentinel at boot; the window switcher, the "+" sheet (history.back()), the New Session dialog, the
//      For-you tray, the window area (→ the sidebar, the window kept), the Task Groups drill-down (→ its list) each
//      close on ONE back with the URL and the history length unchanged; at home the toast (seen — not an unread
//      notification), a lapse of 2 s re-arms, a second back inside 2 s leaves to the previous page
//   B  an untouched page is never stranded (Chrome may skip an entry pushed before any tap — it is said which way it
//      went); a reload standing on the sentinel keeps ONE sentinel and the next back still closes a menu; a #fragment
//      navigation is no back (the sheet stays, a sentinel stands above it)
//   C  a `?` deep link in zh: the first back closes no window and says 再返回一次退出; after 2 s the window yields
//   D  the Mobile setting off: one browser back leaves at once
//   E  a 1280×800 desktop: no sentinel, `overscroll-behavior` stays auto (the phone: none), one back leaves
//   F  (lane phone-first-screen, design q-044 decision 5) asks open ⇒ the boot lands on the ATTENTION PAGE, which is home:
//      a back on it arms the toast; ☰ then back closes the sidebar (back on the page, no toast); a window opened from it
//      hides it and one back returns to the page (the window kept); the For-you sheet over it closes on one back
//   G  A BACK NEVER COSTS A LOAD (lane phone-back-reload — the owner's Android phone: a back press reloaded VibeSpace, the
//      splash, then home). 382×580, the back/forward cache OFF (Chrome is launched so), the browser's own back. Each road
//      runs twice — on a bundle rebuilt with the PRE-FIX rules (RED: the load happens and the diary + an automatic
//      incident say so) and on the shipped one: a tab DISCARDED (chrome://discards' Urgent Discard) and shown again —
//      its first back closes the window, same document; a renderer KILLED (Page.crash) and reloaded — the 「再返回一次
//      退出」 exit lands on the page before VibeSpace in ONE traversal; a SECOND load of the app in the tab (a `?` link
//      over an older document) — the same; a cross-site previous entry + location.reload() + two browser reloads — the
//      back stays same-document, the exit lands on the other site; a DROPPED go(1) (RED control: the diary says so);
//      the whole tab VibeSpace's — the exit's ONE named load, no incident for it. The diary's boot rows: navigate/push,
//      reload/keep, back_forward/rebuild (disc 1), reload/push (state lost). ACCEPTANCE ROUND 2, each on a bundle with
//      round 1's rules (RED) then the shipped one: the second-load road with ONE iframe link followed inside the older
//      document (a joint step the Navigation API never shows) — the exit ends on the page before VibeSpace, ONE extra
//      load, and that older document never boots the app (its diary row: hop); round 1 lands on it and it stays; a
//      FORWARD press after the stay arm's exit files nothing (round 1: «a back press cost a page load»)
//   H  the stale-tab reload: a server whose version the bundle never matches — ONE reload, ONE notice, then quiet across
//      two reconnects (the diary's stale rows say reload, notice); two reconnects 300 ms apart — ONE reload, the notice
//      only from the reloaded page (round 2)
// Its own clock: 720 s (suite-watchdog); run bare it assumes its ci.mjs row's budget (900 s) and says so at start.
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-mobile-back-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT, OTHER_PORT] = await freePorts(3);
const wt = scratch('mobile-back-wt');
const fakeHome = scratchHome('mobile-back-home', fs);
const chromeDir = scratch('mobile-back-chrome'); // its own registered scratch root (a `${wt}-chrome` sibling outlived Chrome's SIGKILL twice)
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PREV = 'data:text/html,<title>prev</title><h1>the page before VibeSpace</h1>';
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── throwaway server in a worktree (no rebuild: overlays the built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const stubPath = `${wt}-claude-stub`; // never a vendor CLI: the boot probes get a version and nothing else
fs.writeFileSync(stubPath, '#!/bin/sh\nfor a in "$@"; do case "$a" in --version) echo "2.1.288 (Claude Code) stub"; exit 0;; esac; done\nexit 0\n', { mode: 0o755 });
const startServer = () => spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
let srv = startServer(); // `let`: F restarts it on a For-you store with asks (the store reads data/user-todos.json at boot)
const restartWith = async (items) => {
  const was = srv; was.kill('SIGKILL');
  await new Promise((r) => { if (was.exitCode !== null || was.signalCode) r(); else { was.once('exit', r); setTimeout(r, 3000); } });
  fs.writeFileSync(path.join(wt, 'data', 'user-todos.json'), JSON.stringify({ items }, null, 2));
  srv = startServer();
  for (let i = 0; i < 80; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }
};
// G: chrome://discards (its Urgent Discard) is a debug page — Local State turns those on; the back/forward cache OFF, as a
// phone under memory pressure keeps none (the existing legs never come back to a cacheable page, so nothing else moves);
// every leg sets its own device metrics, so the 382×580 window only matters to a discarded tab's restored page
fs.mkdirSync(chromeDir, { recursive: true }); fs.writeFileSync(path.join(chromeDir, 'Local State'), JSON.stringify({ internal_only_uis_enabled: true }));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-features=BackForwardCache', '--window-size=382,580', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' }); // the window a phone's: a tab shown again after a discard boots before any emulation reaches it
const other = spawn(process.execPath, ['-e', `require('http').createServer((q, s) => { s.setHeader('content-type', 'text/html'); s.end(q.url === '/link' ? '<a href="/b" style="display:block;width:100%;height:200px;background:#eee">follow</a>' : '<title>other</title><h1>another site</h1>'); }).listen(${OTHER_PORT}, '127.0.0.1')`], { stdio: 'ignore' }); // G: a cross-site previous entry; /link — a page with one link (G7's embedded page)
const OTHER = `http://localhost:${OTHER_PORT}/`;
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { other.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, chromeDir]) { try { endRootedProcesses(root); } catch { } } // whatever the server / Chrome started under its roots (§57b)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome, stubPath]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
// run bare (no gate) the suite assumes its ci.mjs row's budget (budgetFor: a chrome heavy row, 900 s) and says so — the
// default 300 s killed a bare run at 270 s (acceptance round 2); its own 720 s ceiling fires first either way
const BARE = !process.env.VIBESPACE_SUITE_BUDGET_MS;
const WD = armWatchdog({ capMs: 720e3, env: BARE ? { ...process.env, VIBESPACE_SUITE_BUDGET_MS: '900000' } : process.env, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
console.log(`watchdog: ${Math.round(WD.deadline.ms / 1000)} s (${WD.deadline.capped ? "the suite's own ceiling" : 'the budget − 30 s'}; the budget ${Math.round(WD.deadline.budgetMs / 1000)} s — ${BARE ? "a bare run: its ci.mjs row's" : "the gate's"})`);
for (let i = 0; i < 80; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
let sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 }); // `let`: G re-attaches after a discard (a new target)
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
let mainLoads = 0, appLoads = 0; // G: main-frame cross-document commits (Page.frameNavigated) — a back that LOADED; appLoads: of VibeSpace
const onMessage = (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); }
  if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) { mainLoads++; if (m.params.frame.url.startsWith(ORIGIN)) appLoads++; }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
};
sock.on('message', onMessage);
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  sock.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard over the nav bar
const nav = async () => { const h = await cdp('Page.getNavigationHistory'); return { index: h.currentIndex, len: h.entries.length, url: h.entries[h.currentIndex].url }; };
const onApp = (n) => n.url.startsWith(ORIGIN);
/** The BROWSER's back (the Alt+Left accelerator → NavigationController::GoBack, the intervention's skip rule included). */
const browserBack = async (wait = 700) => {
  for (const type of ['rawKeyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, modifiers: 1, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 });
  await sleep(wait);
};
const jsBack = async (wait = 700) => { await evalJs('history.back(); true'); await sleep(wait); };
const tapAt = async (x, y) => {
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(50);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(250);
};
const centerOf = (sel) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const tap = async (sel) => { const p = await centerOf(sel); if (!p) throw new Error('tap: nothing at ' + sel); await tapAt(p.x, p.y); };
const longPress = async (sel, ms = 700) => {
  const p = await centerOf(sel); if (!p) throw new Error('longPress: nothing at ' + sel);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] }); await sleep(ms);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300);
};
const toasts = () => evalJs(`[...document.querySelectorAll('#global-toasts .global-toast-body')].map((e) => e.textContent)`);
const phone = async (width = 390, height = 844, deviceScaleFactor = 3) => {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: true });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
};
const desk = async () => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'hover' }, { name: 'pointer', value: 'fine' }] });
};
/** The previous page, then VibeSpace (`query` = a deep link); waits for the restore to settle. */
const boot = async (query = '') => {
  await cdp('Page.navigate', { url: PREV }); await sleep(300);
  await cdp('Page.navigate', { url: `${ORIGIN}/${query}` });
  await waitFor('!!(window.app && app.ready)', 20000);
  await evalJs('app.ready.then(() => true)');
  await waitFor('!app.layoutManager._restoring', 15000);
  await sleep(1200);
};
/** A harmless tap (the person touched the page once — Chrome's activation): the empty window area. */
const touchOnce = async () => {
  const at = await evalJs(`(() => { const el = document.elementFromPoint(195, 640); return el ? (el.id || el.className || el.tagName) : null; })()`);
  await tapAt(195, 640);
  return at;
};
const state = () => evalJs('JSON.stringify(history.state)');

// ── G's tools (lane phone-back-reload) ──
const DROP_GO1 = "try { if (sessionStorage.getItem('vs-test-drop-go1')) { const g = history.go.bind(history); history.go = (n) => (n === 1 ? undefined : g(n)); } } catch {}"; // the hypothesis-2 mutant, armed per tab by a flag
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: DROP_GO1 });
const diary = () => evalJs(`JSON.parse(sessionStorage.getItem('vibespace.navLog') || '[]')`);
const settle = async () => { await waitFor('!!(window.app && app.ready)', 25000); await evalJs('app.ready.then(() => true)'); await waitFor('!app.layoutManager._restoring', 15000); await sleep(900); };
const touch382 = () => tapAt(191, 300); // the 382×580 phone's empty window area
const atHome = async () => { await evalJs('document.querySelectorAll("[data-popover]").forEach((e) => e.remove()); if (!app.sidebar.isOpen) app.sidebar.toggle(true); true'); await sleep(300); };
/** A browser-level CDP socket (Target.* across tabs). */
const browserWs = async () => {
  const v = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
  const b = new WebSocket(v.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 }); await new Promise((r) => b.on('open', r));
  let n = 0; const bp = new Map(); b.on('message', (d) => { const m = JSON.parse(d); if (m.id && bp.has(m.id)) { bp.get(m.id)(m); bp.delete(m.id); } });
  const call = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++n; const tm = setTimeout(() => rej(new Error(method + ': no answer')), 20000); bp.set(id, (m) => { clearTimeout(tm); if (m.error) rej(new Error(method + ': ' + m.error.message)); else res(m.result); }); b.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  return { call, close: () => b.close() };
};
/** This suite's page socket onto another target (a discarded tab comes back as a NEW one): the domains + the init scripts again. */
const attachTo = async (targetId) => {
  try { sock.close(); } catch { }
  let t = null; for (let i = 0; i < 40 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.id === targetId); } catch { } if (!t) await sleep(250); }
  sock = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 }); await new Promise((r) => sock.on('open', r)); sock.on('message', onMessage);
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.addScriptToEvaluateOnNewDocument', { source: DROP_GO1 });
  target = t;
};
/** chrome://discards' Urgent Discard on this tab (DevTools off it first — a tab under DevTools is never discarded), then the tab shown again. */
const discardAndShow = async (dims) => {
  const B = await browserWs();
  const t2 = await B.call('Target.createTarget', { url: 'chrome://discards' });
  try { sock.close(); } catch { }
  await sleep(3000);
  const { sessionId } = await B.call('Target.attachToTarget', { targetId: t2.targetId, flatten: true });
  const evalIn = async (expression) => (await B.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)).result?.value;
  const deep = "const deep = (root, sel, out = []) => { for (const el of root.querySelectorAll('*')) { if (el.matches(sel)) out.push(el); if (el.shadowRoot) deep(el.shadowRoot, sel, out); } return out; };";
  const host = new URL(ORIGIN).host;
  let row = '';
  for (let k = 0; k < 3 && !/discarded/.test(row); k++) {
    await evalIn(`(() => { ${deep} const r = deep(document, 'tr').find((x) => (x.textContent || '').includes(${JSON.stringify(host)})); if (!r) return 'no row'; const l = deep(r, '*').filter((e) => /Urgent Discard/.test(e.textContent || '') && ![...e.children].some((c) => /Urgent Discard/.test(c.textContent || ''))); if (l[0]) l[0].click(); return 'clicked'; })()`);
    await sleep(2500);
    row = (await evalIn(`(() => { ${deep} const r = deep(document, 'tr').find((x) => (x.textContent || '').includes(${JSON.stringify(host)})); return r ? r.textContent.replace(/\\s+/g, ' ').slice(0, 200) : ''; })()`)) || '';
  }
  const fresh = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page' && x.url.startsWith(ORIGIN));
  // shown again FIRST (DevTools onto a discarded, unloaded tab never finishes its handshake): the restored page boots at
  // the 382×580 window — a phone — before this socket is back on it; under a loaded machine a show was once not
  // followed by a load — shown again (up to three times), never reloaded (a reload is another road)
  await B.call('Target.closeTarget', { targetId: t2.targetId });
  let loaded = false, seen = null;
  for (let k = 0; k < 3 && !loaded; k++) {
    await B.call('Target.activateTarget', { targetId: fresh.id }); await sleep(1500);
    if (k === 0) { await attachTo(fresh.id); await phone(...dims); }
    loaded = await waitFor('!!(window.app && app.ready)', 12000);
    if (!loaded) { seen = await evalJs(`({ href: location.href, rs: document.readyState, app: typeof window.app, vis: document.visibilityState, disc: document.wasDiscarded })`).catch((e) => String(e.message)); console.log(`    the shown tab (show ${k + 1}): ${JSON.stringify(seen)}`); }
  }
  B.close();
  return { discarded: /discarded/.test(row), loaded, seen, row };
};
const crashAndReload = async () => {
  sock.send(JSON.stringify({ id: ++seq, method: 'Page.crash' })); // never answered: the renderer is gone (Android's low-memory kill)
  await sleep(1500); await cdp('Page.reload');
};
/** The client rebuilt with mobile-back.js patched ([from, to] pairs; null when an anchor moved). */
const buildBundle = async (tag, swaps) => {
  const esbuild = require(path.join(repo, 'node_modules/esbuild'));
  const mb = fs.readFileSync(path.join(wt, 'src/lib/mobile-back.js'), 'utf8');
  if (!swaps.every(([a]) => mb.includes(a))) return null;
  const red = swaps.reduce((t, [a, b]) => t.replace(a, b), mb);
  const out = await esbuild.build({ entryPoints: [path.join(wt, 'src/client.js')], outfile: path.join(wt, `public/bundle.${tag}.js`), bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'silent',
    plugins: [{ name: tag, setup(b) { b.onLoad({ filter: /src[\\/]lib[\\/]mobile-back\.js$/ }, () => ({ contents: red, loader: 'js' })); } }] });
  const js = out.outputFiles.find((f) => f.path.endsWith(`bundle.${tag}.js`));
  return js ? Buffer.from(js.contents) : null;
};
/** The pre-fix wiring (RED controls from the base rule): bootStep without the restore facts, no exit plan. */
const buildRedBundle = () => buildBundle('pre-fix', [
  ['const step = bootStep({ phone: true, enabled: enabled(), state: stateAtBoot, navType: facts.type, wasDiscarded: facts.disc, belowSame });', 'const step = bootStep({ phone: true, enabled: enabled(), state: stateAtBoot });'],
  ['const exit = ents ? exitPlan({ current: ents.current, block: ents.list.length, length: history.length }) : null;', 'const exit = null;']]);
/** Round 1's wiring (round 2's RED controls): no exit intent read at a boot, a cost detector blind to the way in. */
const buildRound1Bundle = () => buildBundle('round-1', [['  const intent = exitIntentRead();\n', '  const intent = null;\n'], ['now: Date.now(), came })) {', "now: Date.now(), came: 'back' })) {"]]);
const incidents = async () => ((await (await fetch(`${ORIGIN}/api/incidents`)).json()).incidents || []);
/** One browser back; did it LOAD (a main-frame commit)? where did it land? */
const backAndSee = async (wait = 1500) => {
  const l0 = mainLoads; await browserBack(wait);
  const n = await nav();
  return { loaded: mainLoads > l0, onApp: onApp(n), url: n.url.slice(0, 30), index: n.index };
};

try {
  // a Task Group for the sidebar's drill-down (its card → the detail with the ‹ All Task Groups row)
  await fetch(`${ORIGIN}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Back guard group' }) });

  // ── A: the phone ──
  console.log('A  phone 390×844: one back = one layer closed');
  await phone(); await boot();
  const env = await evalJs(`({ mobile: app.isMobile, touch: app.isTouch, state: history.state, osb: getComputedStyle(document.documentElement).overscrollBehaviorY, osbx: getComputedStyle(document.body).overscrollBehaviorX })`);
  const n0 = await nav();
  check('A0 app.isMobile + isTouch; ONE sentinel ({vs:1}) above the page\'s entry; html/body overscroll-behavior none on a coarse pointer', env.mobile && env.touch && env.state?.vs === 1 && env.osb === 'none' && env.osbx === 'none', { env, n0 });
  const tapped = await touchOnce();
  await tap('#mobile-nav-title'); await sleep(300);
  const swOpen = await evalJs(`!!document.querySelector('.mobile-win-switcher')`);
  await browserBack();
  let n = await nav();
  check('A1 the window switcher open → the browser\'s back closes it; same URL, same history length, back on the sentinel', swOpen && !(await evalJs(`!!document.querySelector('.mobile-win-switcher')`)) && onApp(n) && n.len === n0.len && (await state()) === '{"vs":1}', { swOpen, n, n0, tapped });
  await longPress('#mobile-nav-new'); // the "+" long-press create sheet (a [data-popover] context menu)
  const sheetOpen = await evalJs(`!!document.querySelector('.mobile-sheet[data-popover]')`);
  const before = await evalJs('({ href: location.href, len: history.length })');
  await jsBack();
  const after = await evalJs('({ href: location.href, len: history.length, pop: !!document.querySelector("[data-popover]"), st: history.state })');
  check('A2 the "+" sheet open → history.back() closes it; location.href and history.length unchanged', sheetOpen && !after.pop && after.href === before.href && after.len === before.len && after.st?.vs === 1, { sheetOpen, before, after });
  await evalJs('app.showNewSessionDialog(); true'); await sleep(300);
  const dlgOpen = await evalJs(`!document.getElementById('dialog-overlay').classList.contains('hidden')`);
  await browserBack();
  n = await nav();
  check('A3 the New Session dialog → one back hides it (app.hideDialogs), still on VibeSpace', dlgOpen && (await evalJs(`document.getElementById('dialog-overlay').classList.contains('hidden')`)) && onApp(n) && n.len === n0.len, { dlgOpen, n });
  await tap('#mobile-nav-todos'); await sleep(400);
  const fyOpen = await evalJs(`!document.getElementById('user-todos-popup').classList.contains('hidden')`);
  await browserBack();
  n = await nav();
  check('A4 the For-you tray → one back closes it (through its own hidePopup), still on VibeSpace', fyOpen && (await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`)) && onApp(n) && n.len === n0.len, { fyOpen, n });
  await evalJs('app.openFileExplorer(); true'); await sleep(900);
  const win = await evalJs('({ n: app.wm.windows.size, sb: app.sidebar.isOpen })');
  await browserBack();
  const win2 = await evalJs('({ n: app.wm.windows.size, sb: app.sidebar.isOpen })');
  n = await nav();
  check('A5 a window on show → one back yields it to the sidebar (home); the window is NOT closed', win.n >= 1 && !win.sb && win2.sb && win2.n === win.n && onApp(n) && n.len === n0.len, { win, win2, n });
  await tap('.sidebar-tab[data-tab="tasks"]'); await sleep(500);
  await waitFor(`[...document.querySelectorAll('#sidebar .mobile-folder-card')].some((c) => c.textContent.includes('Back guard group'))`, 8000);
  await evalJs(`[...document.querySelectorAll('#sidebar .mobile-folder-card')].find((c) => c.textContent.includes('Back guard group')).click(); true`); await sleep(400);
  const dd = await evalJs(`({ back: !!document.querySelector('#sidebar .mobile-folder-back'), dd: !!app.sidebar._mobileDrilldown })`);
  await browserBack();
  const dd2 = await evalJs(`({ back: !!document.querySelector('#sidebar .mobile-folder-back'), dd: !!app.sidebar._mobileDrilldown, sb: app.sidebar.isOpen })`);
  check('A6 the Task Groups drill-down → one back returns to the list (its ‹ row), the sidebar stays open', dd.back && dd.dd && !dd2.back && !dd2.dd && dd2.sb, { dd, dd2 });
  await browserBack(300);
  const t1 = await toasts(); const st1 = await state(); n = await nav();
  const hist = await evalJs(`(JSON.parse(localStorage.getItem('vibespace.toastHistory') || '[]')[0]) || null`);
  check('A7 at home → the toast "Press back again to exit"; VibeSpace stays (on its own entry for the window)', t1.includes('Press back again to exit') && onApp(n) && st1 === 'null', { t1, st1, n });
  check('A7b the toast is the person\'s own act — recorded seen, never an unread notification', hist?.m === 'Press back again to exit' && hist?.seen === true, hist);
  await sleep(2400);
  const st2 = await state(); n = await nav();
  check('A8 after 2 s the page stands on the sentinel again (no new entry)', st2 === '{"vs":1}' && n.len === n0.len && onApp(n), { st2, n, n0 });
  await browserBack(300);
  const t2 = await toasts();
  await browserBack(900);
  n = await nav();
  check('A9 the next back re-arms (the toast again); a second back 0.3 s later leaves to the previous page', t2.includes('Press back again to exit') && n.url.startsWith('data:'), { t2, n });

  // ── B: an untouched page; a reload on the sentinel ──
  console.log('B  an untouched page; a reload standing on the sentinel');
  await boot();
  const bs = await state(), nb0 = await nav();
  await browserBack(900);
  n = await nav();
  const stood = onApp(n) && n.len === nb0.len && (await state()) === '{"vs":1}' && !(await toasts()).length;
  // Chrome MAY skip an entry a page pushed before any tap (its back-button intervention — measured both ways on cold
  // pages; the app's boot push was kept 4 of 4) — either way the person is never stranded:
  console.log(`  · untouched page, one browser back: ${n.url.startsWith('data:') ? 'left to the previous page (Chrome skipped the entry)' : 'stayed — one layer closed, back on the sentinel'}`);
  check('B1 never touched: one browser back either leaves (Chrome\'s skip) or closes one layer and stands on the sentinel — never stranded', bs === '{"vs":1}' && (n.url.startsWith('data:') || stood), { bs, n });
  await boot(); await touchOnce();
  const nb = await nav();
  await cdp('Page.reload'); await waitFor('!!(window.app && app.ready)', 20000); await evalJs('app.ready.then(() => true)'); await sleep(1500);
  const nr = await nav(); const sr = await state();
  check('B2 a reload ON the sentinel keeps ONE sentinel (no second entry)', sr === '{"vs":1}' && nr.len === nb.len && nr.index === nb.index, { nb, nr, sr });
  await longPress('#mobile-nav-new');
  const pop2 = await evalJs(`!!document.querySelector('[data-popover]')`);
  await browserBack();
  n = await nav();
  check('B3 after the reload a back still closes the open sheet and stays (the entry below stayed same-document)', pop2 && !(await evalJs(`!!document.querySelector('[data-popover]')`)) && onApp(n) && n.len === nb.len, { pop2, n });
  await longPress('#mobile-nav-new');
  await evalJs("location.hash = 'install'; true"); await sleep(400); // a same-document #fragment navigation (a link in rendered markdown)
  const f1 = await evalJs(`({ pop: !!document.querySelector('[data-popover]'), st: history.state, hash: location.hash, sb: app.sidebar.isOpen })`);
  await browserBack();
  const f2 = await evalJs(`({ pop: !!document.querySelector('[data-popover]'), st: history.state, hash: location.hash })`); n = await nav();
  check('B4 a #fragment navigation is no back: the sheet stays open, a sentinel stands above it; the next back closes the sheet and stays', f1.pop && f1.st?.vs === 1 && f1.hash === '#install' && !f2.pop && f2.st?.vs === 1 && onApp(n), { f1, f2, n });

  // ── C: a `?` deep link, in zh ──
  console.log('C  a deep link (?…) in zh');
  const zh = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });
  await boot('?session=back-guard'); await touchOnce();
  await evalJs('app.openFileExplorer(); true'); await sleep(900);
  const c0 = await evalJs('({ n: app.wm.windows.size, sb: app.sidebar.isOpen })');
  await browserBack(300);
  const c1 = await evalJs('({ n: app.wm.windows.size, sb: app.sidebar.isOpen })'); const tz = await toasts();
  check('C1 the first back after a `?` link closes no window: it arms — 再返回一次退出', c0.n >= 1 && !c0.sb && !c1.sb && c1.n === c0.n && tz.includes('再返回一次退出'), { c0, c1, tz });
  await sleep(2400); await browserBack();
  const c2 = await evalJs('({ n: app.wm.windows.size, sb: app.sidebar.isOpen })');
  check('C2 then the same rule: the next back (after the window) yields the window to the sidebar', c2.sb && c2.n === c0.n, c2);
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: zh.identifier });
  await evalJs("localStorage.removeItem('vibespace.lang'); true");

  // ── F: the attention page is HOME (lane phone-first-screen, design q-044 decision 5) — before D: D's setting write must not race F's restart ──
  console.log('F  asks open: the attention page is home');
  await restartWith([1, 2, 3].map((k) => ({ id: 'ut-fback' + k, sessionKey: 'claude:back-guard-' + k, sessionName: 'back guard', text: 'Which bucket should the nightly export use? (' + k + ')', detail: null, urgency: 'normal', kind: 'action', origin: 'agent', status: 'open', by: 'agent', createdAt: Date.now() - k * 60e3, resolvedAt: null, resolvedBy: null, jobId: null })));
  await evalJs('sessionStorage.clear(); true'); // a COLD open: lane foryou-honest — a RELOAD of a tab with a window on show keeps that window
  await boot(); const F_at = await touchOnce(); // (195, 640): the page's empty area below its three rows
  const F_act = await evalJs('({ active: navigator.userActivation?.hasBeenActive, state: history.state, len: history.length })');
  const F_pageOn = () => evalJs(`!document.getElementById('phone-home').classList.contains('hidden')`);
  const F_exitToasts = async () => (await toasts()).filter((x) => x.includes('Press back again to exit')).length;
  const F_f0 = await evalJs(`({ page: !document.getElementById('phone-home').classList.contains('hidden'), rows: document.querySelectorAll('#phone-home .ut-item').length, sb: app.sidebar.isOpen, state: history.state })`);
  check('F0 asks open: the boot lands on the attention page (home) — 3 rows, the sidebar shut, ONE sentinel above the page\'s entry', F_f0.page && F_f0.rows === 3 && !F_f0.sb && F_f0.state?.vs === 1, { ...F_f0, F_at, F_act });
  await browserBack(300);
  const F_fa = await toasts(); let F_fn = await nav();
  check('F1 at home on the page: one back arms the exit toast; the page stays, VibeSpace stays', F_fa.includes('Press back again to exit') && (await F_pageOn()) && onApp(F_fn), { F_fa, F_fn });
  await sleep(2400);
  await tap('#mobile-nav-menu'); await sleep(300);
  const F_sbOpen = await evalJs('app.sidebar.isOpen'); const F_tb = await F_exitToasts();
  await browserBack();
  const F_f2 = await evalJs(`({ sb: app.sidebar.isOpen, page: !document.getElementById('phone-home').classList.contains('hidden') })`); F_fn = await nav();
  check('F2 ☰ over the page, then one back: the sidebar closes — back on the page, no exit toast', F_sbOpen && !F_f2.sb && F_f2.page && (await F_exitToasts()) === F_tb && onApp(F_fn), { F_sbOpen, F_f2, F_tb, F_fn });
  await evalJs('app.openFileExplorer(); true'); await sleep(900);
  const F_f3a = await evalJs(`({ n: app.wm.windows.size, page: !document.getElementById('phone-home').classList.contains('hidden'), sb: app.sidebar.isOpen })`);
  await browserBack();
  const F_f3b = await evalJs(`({ n: app.wm.windows.size, page: !document.getElementById('phone-home').classList.contains('hidden'), sb: app.sidebar.isOpen })`); F_fn = await nav();
  check('F3 a window opened over the page hides it (the central yield); one back returns to the PAGE — the window kept, the sidebar shut', F_f3a.n >= 1 && !F_f3a.page && F_f3b.page && !F_f3b.sb && F_f3b.n === F_f3a.n && onApp(F_fn), { F_f3a, F_f3b, F_fn });
  await tap('#mobile-nav-todos'); await sleep(400);
  const F_fy = await evalJs(`({ page: !document.getElementById('phone-home').classList.contains('hidden'), sheet: !document.getElementById('user-todos-popup').classList.contains('hidden'), type: app.wm.windows.get(app.wm.activeWindowId)?.type || null })`);
  await browserBack();
  check('F4 the badge on the page TOGGLES it (lane foryou-honest: one surface — never the sheet over the page): the page steps aside for the window it covered; one back returns to the page', !F_fy.page && !F_fy.sheet && F_fy.type === 'files' && (await F_pageOn()) && (await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`)) && onApp(await nav()), { F_fy });

  // ── D: the Mobile setting off ──
  console.log('D  the Mobile setting off');
  await boot(); await touchOnce();
  await evalJs("app.settings.set('mobile.backGuard', false); true"); await sleep(300);
  await longPress('#mobile-nav-new');
  await browserBack(1000);
  n = await nav();
  check('D1 setting off: one browser back leaves VibeSpace at once (a sheet open or not)', n.url.startsWith('data:'), n);
  await boot(); await evalJs("app.settings.set('mobile.backGuard', undefined); true"); await sleep(1500); // the settings save is debounced 500 ms: navigating sooner lost the restore and left the guard off for every later phone leg (G)

  // ── E: a desktop ──
  console.log('E  a 1280×800 desktop');
  await desk(); await boot();
  const e0 = await evalJs(`({ mobile: app.isMobile, state: history.state, osb: getComputedStyle(document.documentElement).overscrollBehaviorY })`);
  const ne = await nav();
  await browserBack(900);
  const ne2 = await nav();
  check('E1 a desktop pushes no sentinel, keeps overscroll-behavior auto, and one back leaves', e0.mobile === false && e0.state === null && e0.osb === 'auto' && ne2.url.startsWith('data:') && ne2.index === ne.index - 1, { e0, ne, ne2 });

  // ── G: a back never costs a load (lane phone-back-reload) ──
  console.log('G  a back never costs a load — 382×580, back/forward cache off; each road on the PRE-FIX wiring (RED) then the shipped one');
  const DIMS = [382, 580, 2.75];
  const bundleFile = path.join(wt, 'public/bundle.js');
  const realBundle = fs.readFileSync(bundleFile), redBundle = await buildRedBundle();
  check('G0 the pre-fix wiring rebuilds from the tree\'s own mobile-back.js (its two anchors found)', !!redBundle);
  await restartWith([]); // F's asks off the server: home is the conversation list again, as the roads below assume
  await phone(...DIMS); await boot();
  const guardOn = await evalJs(`app.settings.get('mobile.backGuard') !== false && !app.phoneHome?.hasRows?.()`);
  check('G0b the Mobile back guard is ON for G (D\'s restore landed on the server) and home is the conversation list (no asks open)', guardOn);
  const useBundle = (buf) => fs.writeFileSync(bundleFile, buf); // the index route stamps ?v=<mtime> per request: the next load runs it
  const roads = async (tag) => {
    const R = {};
    await phone(...DIMS);
    console.log(`  · ${tag}: the discard road`);
    await boot(); await touch382(); await evalJs('app.openFileExplorer(); true'); await sleep(900);
    const disc = await discardAndShow(DIMS); console.log(`    discarded: ${disc.discarded}, shown again and loaded: ${disc.loaded}`);
    if (disc.loaded) {
      await settle();
      const dBoot = (await diary()).filter((r) => r.k === 'boot').at(-1);
      await evalJs('if (app.sidebar.isOpen) app.sidebar.toggle(false); app.openFileExplorer(); true'); await sleep(900);
      const i0 = (await incidents()).length;
      const setting = await evalJs(`app.settings.get('mobile.backGuard')`), hist0 = (await nav()).index;
      const db = await backAndSee(); if (db.loaded && db.onApp) await settle();
      if (!db.onApp) { console.log(`    the first back LEFT VibeSpace: ${JSON.stringify({ db, setting, hist0, nav: await cdp('Page.getNavigationHistory').then((h) => h.entries.map((e, i) => (i === h.currentIndex ? '*' : '') + e.url.slice(0, 26))).catch(() => null) })}`); await boot(); }
      const dAfter = await evalJs('({ st: history.state, sb: app.sidebar.isOpen })');
      await sleep(1500);
      const dRows = await diary();
      const said = (await evalJs(`JSON.parse(localStorage.getItem('vibespace.toastHistory') || '[]').map((x) => x.m)`)).filter((m) => /back press reloaded the page/.test(m)).length; // the toast history: the capture's toast may be gone from the screen already
      R.discard = { disc, setting, boot: dBoot, back: db, after: dAfter, cost: dRows.filter((r) => r.k === 'cost').length, incidents: (await incidents()).length - i0, said };
    } else R.discard = { disc, back: {}, after: {} };
    console.log(`  · ${tag}: the renderer-kill road`);
    await boot(); await touch382(); await evalJs('app.openFileExplorer(); true'); await sleep(900);
    await crashAndReload(); await settle();
    const cBoot = (await diary()).filter((r) => r.k === 'boot').at(-1);
    await evalJs('if (app.sidebar.isOpen) app.sidebar.toggle(false); app.openFileExplorer(); true'); await sleep(900);
    const c1 = await backAndSee();
    await atHome(); const c2 = await backAndSee(300); const cToast = (await toasts().catch(() => [])).includes('Press back again to exit');
    const c3 = await backAndSee(1500); if (c3.loaded && c3.onApp) await settle();
    R.crash = { boot: cBoot, window: c1, armed: cToast && c2.onApp && !c2.loaded, exit: c3, leave: c3.onApp ? null : 'left' };
    if (c3.onApp) R.crash.rows = (await diary()).slice(-4);
    console.log(`  · ${tag}: the second-load road (a \`?\` link over an older document of the tab)`);
    await boot(); await touch382();
    await evalJs(`location.href = '/?session=back-reload'; true`); await sleep(600); await settle();
    await atHome(); const s1 = await backAndSee(300); const sToast = (await toasts().catch(() => [])).includes('Press back again to exit');
    const s2 = await backAndSee(1500); if (s2.loaded && s2.onApp) await settle();
    R.second = { armed: sToast && s1.onApp && !s1.loaded, exit: s2 };
    return R;
  };
  let RED = null, GREEN = null;
  if (redBundle) { useBundle(redBundle); try { RED = await roads('red'); } finally { useBundle(realBundle); } }
  GREEN = await roads('green');
  console.log('  · RED  ' + JSON.stringify(RED).slice(0, 900));
  console.log('  · GREEN ' + JSON.stringify(GREEN).slice(0, 900));
  check('G1 RED (the pre-fix wiring): a discarded tab shown again — its FIRST back (a window on show) LOADS the page (the owner\'s splash); the diary\'s cost row + ONE automatic incident in the back\'s own words say so', !!RED && RED.discard.disc.discarded && RED.discard.disc.loaded && RED.discard.back.loaded && RED.discard.cost >= 1 && RED.discard.incidents === 1 && RED.discard.said >= 1, RED?.discard);
  check('G1 the shipped wiring: the discarded tab\'s boot REBUILDS (diary: back_forward, rebuild, disc 1) and its first back closes the window — same document, back on the sentinel, no incident', GREEN.discard.disc.discarded && GREEN.discard.disc.loaded && GREEN.discard.boot?.type === 'back_forward' && GREEN.discard.boot?.step === 'rebuild' && GREEN.discard.boot?.disc === 1 && !GREEN.discard.back.loaded && GREEN.discard.back.onApp && GREEN.discard.after.st?.vs === 1 && GREEN.discard.after.sb && GREEN.discard.incidents === 0, GREEN.discard);
  check('G2 RED: a renderer killed + reloaded (diary: reload, push, state null) — the 「再返回一次退出」 exit LOADS the older VibeSpace entry', !!RED && RED.crash.boot?.type === 'reload' && RED.crash.boot?.st === 'null' && RED.crash.armed && RED.crash.exit.loaded && RED.crash.exit.onApp, RED?.crash);
  check('G2 the shipped wiring: the window back stays same-document; the exit lands on the page before VibeSpace — no VibeSpace load', GREEN.crash.boot?.st === 'null' && !GREEN.crash.window.loaded && GREEN.crash.window.onApp && GREEN.crash.armed && !GREEN.crash.exit.onApp && GREEN.crash.exit.url.startsWith('data:'), GREEN.crash);
  check('G3 RED: a second load of the app in the tab (a `?` link over an older document) — the exit LOADS the older document', !!RED && RED.second.armed && RED.second.exit.loaded && RED.second.exit.onApp, RED?.second);
  check('G3 the shipped wiring: the exit skips every older entry in ONE traversal onto the page before VibeSpace', GREEN.second.armed && !GREEN.second.exit.onApp && GREEN.second.exit.url.startsWith('data:'), GREEN.second);
  { // ACCEPTANCE ROUND 2 — each road on round 1's wiring (RED) then the shipped one
    const round1 = await buildRound1Bundle();
    check('G7·G8 round 1\'s wiring rebuilds from the tree\'s own mobile-back.js (its two anchors found)', !!round1);
    const forwardKey = async () => { for (const type of ['rawKeyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, modifiers: 1, key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 }); };
    /** G3's road with ONE iframe link followed inside the OLDER document (the embedded Browser window following a link). */
    const iframeRoad = async () => {
      await phone(...DIMS); await boot(); await touch382();
      const j0 = (await cdp('Page.getNavigationHistory')).entries.length;
      await evalJs(`(() => { const f = document.createElement('iframe'); f.src = ${JSON.stringify(OTHER + 'link')}; f.style.cssText = 'position:fixed;left:0;top:0;width:380px;height:220px;z-index:2147483647;border:0'; document.body.appendChild(f); return true; })()`);
      await sleep(1500); await tapAt(150, 100); await sleep(1200); // a tap on its link: a joint step
      const step = (await cdp('Page.getNavigationHistory')).entries.length - j0;
      await evalJs(`location.href = '/?session=back-reload-3'; true`); await sleep(600); await settle();
      const t0 = Date.now();
      await atHome(); const a = await backAndSee(300); const armed = (await toasts().catch(() => [])).includes('Press back again to exit') && a.onApp && !a.loaded;
      const l0 = appLoads; const x = await backAndSee(3500); const loads = appLoads - l0;
      if (x.onApp) await settle(); else { await cdp('Page.navigate', { url: ORIGIN + '/' }); await settle(); } // the diary is read on a VibeSpace page
      const rows = (await diary()).filter((r) => r.t >= t0), d0 = rows[0]?.d;
      const hops = rows.filter((r) => r.k === 'hop' && r.d !== d0 && !r.drop), hopDoc = hops[0]?.d;
      return { step, armed, exit: x, loads, hops, booted: !!hopDoc && rows.some((r) => r.k === 'boot' && r.d === hopDoc), stayBoot: rows.filter((r) => r.k === 'boot' && r.d !== d0).map((r) => `${r.type}/${r.step}`).slice(0, 2) };
    };
    /** The stay arm's exit (nothing of ours below: the browser's own back leaves), then a FORWARD press inside 5 s. */
    const forwardRoad = async () => {
      await phone(...DIMS); await boot(); await touch382(); await atHome();
      const i0 = (await incidents()).length, t0 = Date.now();
      await browserBack(300); await browserBack(900);
      const out = await nav();
      await forwardKey(); await sleep(600); await settle(); await sleep(2500); // a capture is filed after app.ready
      const rows = (await diary()).filter((r) => r.t >= t0);
      return { left: out.url.startsWith('data:'), back: onApp(await nav()), boot: rows.filter((r) => r.k === 'boot').at(-1), cost: rows.filter((r) => r.k === 'cost').length, incidents: (await incidents()).length - i0 };
    };
    let R7 = null, R8 = null;
    if (round1) { useBundle(round1); try { R7 = await iframeRoad(); R8 = await forwardRoad(); } finally { useBundle(realBundle); } }
    const G7 = await iframeRoad(), G8 = await forwardRoad();
    console.log('  · round 1 ' + JSON.stringify({ R7, R8 }).slice(0, 700));
    console.log('  · shipped ' + JSON.stringify({ G7, G8 }).slice(0, 700));
    check('G7 RED (round 1): one iframe link inside the older document — the exit\'s go() LANDS on that document, which boots and stays (a load: the owner\'s symptom)', !!R7 && R7.step === 1 && R7.armed && R7.exit.onApp && R7.loads === 1, R7);
    check('G7 the shipped wiring: the exit ends on the page before VibeSpace — ONE extra load, the older document never boots the app (its diary row: hop 1, then gone)', G7.step === 1 && G7.armed && !G7.exit.onApp && G7.exit.url.startsWith('data:') && G7.loads === 1 && G7.hops.length === 1 && G7.hops[0].n === 1 && !G7.booted, G7);
    check('G8 RED (round 1): the stay arm\'s exit, then a FORWARD press inside 5 s — «a back press cost a page load» is filed (the diary\'s cost row)', !!R8 && R8.left && R8.back && R8.cost === 1, R8);
    check('G8 the shipped wiring: the same forward press files nothing — the boot row says came other (from another site\'s page)', G8.left && G8.back && G8.cost === 0 && G8.incidents === 0 && G8.boot?.came === 'other', G8);
  }
  { // the reload roads + a cross-site previous entry (shipped wiring): location.reload() (the stale-tab path) then two browser reloads
    await cdp('Page.navigate', { url: OTHER }); await sleep(500); await cdp('Page.navigate', { url: ORIGIN + '/' }); await settle(); await touch382();
    await evalJs('location.reload(); true'); await sleep(500); await settle();
    await cdp('Page.reload'); await sleep(300); await settle(); await cdp('Page.reload'); await sleep(300); await settle();
    const boots = (await diary()).filter((r) => r.k === 'boot').slice(-3);
    await evalJs('if (app.sidebar.isOpen) app.sidebar.toggle(false); app.openFileExplorer(); true'); await sleep(900);
    const r1 = await backAndSee(); await atHome(); const r2 = await backAndSee(300); const r3 = await backAndSee(1500);
    const go1 = (await diary().catch(() => [])).filter((r) => r.k === 'go1');
    check('G4 a cross-site previous entry, location.reload() + two browser reloads (diary: reload/keep ×3): the window back stays same-document, the exit lands on the OTHER site — never a VibeSpace load', boots.length === 3 && boots.every((b) => b.type === 'reload' && b.step === 'keep') && !r1.loaded && r1.onApp && r2.onApp && !r2.loaded && r3.url.startsWith(OTHER.slice(0, 20)), { boots, r1, r2, r3 });
    void go1;
  }
  { // the re-arm lands (go1 rows with their ms); the DROPPED go(1) mutant (hypothesis 2) — RED control: the diary says landed 0 + the push
    await boot(); await touch382(); await evalJs('if (app.sidebar.isOpen) app.sidebar.toggle(false); app.openFileExplorer(); true'); await sleep(900);
    await backAndSee(900);
    const okRows = (await diary()).filter((r) => r.k === 'go1').slice(-1);
    await evalJs("sessionStorage.setItem('vs-test-drop-go1', '1'); true"); await cdp('Page.reload'); await settle();
    await evalJs('if (app.sidebar.isOpen) app.sidebar.toggle(false); app.openFileExplorer(); true'); await sleep(900);
    await backAndSee(1200);
    const mutRows = (await diary()).filter((r) => r.k === 'go1').slice(-1);
    await evalJs("sessionStorage.removeItem('vs-test-drop-go1'); true");
    const landed = (rows) => rows.length === 1 && rows[0].ms >= 0 && rows[0].ms < 500;
    check('G5 the re-arm go(1) lands — the diary\'s go1 row carries its ms (< 500, never the belt)', landed(okRows), okRows);
    check('G5 CONTROL: a DROPPED go(1) is red on that judge — the diary says landed 0 + the 500 ms push', !landed(mutRows) && mutRows[0]?.landed === 0 && mutRows[0]?.push === 1, mutRows);
  }
  { // the whole tab VibeSpace's (a tab opened straight onto it, then a `?` link): the exit's ONE named load, no incident for it
    const B = await browserWs(); const home = target.id;
    const t3 = await B.call('Target.createTarget', { url: ORIGIN + '/' }); // the app is the tab's FIRST entry (an about:blank one stays an entry)
    await B.call('Target.activateTarget', { targetId: t3.targetId }); // in front: a background tab never boots the app here
    await attachTo(t3.targetId); await phone(...DIMS);
    await settle(); await touch382();
    await evalJs(`location.href = '/?session=back-reload-2'; true`); await sleep(600); await settle();
    const i0 = (await incidents()).length;
    await atHome(); await backAndSee(300); const w2 = await backAndSee(1500); if (w2.loaded) await settle();
    await sleep(1200);
    const rows = await diary();
    const leave = rows.filter((r) => r.k === 'leave').at(-1), next = rows.find((r) => r.k === 'boot' && r.t > (leave?.t || 0));
    check('G6 the whole tab VibeSpace\'s: the exit goes to the tab\'s first entry (the next boot stands on it: entries *…) — ONE load, named in the diary (leave load 1) — and files NO incident', w2.loaded && w2.onApp && leave?.load === 1 && leave?.skip === 2 && next?.type === 'back_forward' && /^\*/.test(next?.ents || '') && !rows.some((r) => r.k === 'cost' && r.t > (leave?.t || 0)) && (await incidents()).length === i0, { w2, leave, tail: rows.slice(-3) });
    await B.call('Target.activateTarget', { targetId: home }); await B.call('Target.closeTarget', { targetId: t3.targetId }); B.close();
    await attachTo(home); await sleep(500);
  }

  // ── H: the stale-tab reload (lane phone-back-reload: once per version per tab, then the notice) ──
  console.log('H  the stale-tab reload: ONE per version per tab, then ONE notice');
  {
    const pj = path.join(wt, 'package.json'), pjSrc = fs.readFileSync(pj, 'utf8');
    fs.writeFileSync(pj, JSON.stringify({ ...JSON.parse(pjSrc), version: '9.9.9' }, null, 2)); // the server's /api/version the bundle never matches
    const tH = Date.now() - 1000; // the tab's diary holds the whole suite's boots: H judges its own rows
    await restartWith([]);
    await phone(...DIMS);
    await cdp('Page.navigate', { url: PREV }); await sleep(300);
    await cdp('Page.navigate', { url: `${ORIGIN}/` });
    await sleep(9000); await settle();
    for (let k = 0; k < 2; k++) { await restartWith([]); await sleep(8000); } // two reconnects (a phone's screen waking)
    const rows = (await diary()).filter((r) => r.t >= tH && (r.k === 'stale' || r.k === 'boot'));
    const stale = rows.filter((r) => r.k === 'stale').map((r) => r.d2).join();
    const bootTypes = rows.filter((r) => r.k === 'boot').map((r) => r.type).join();
    const notes = (await evalJs(`JSON.parse(localStorage.getItem('vibespace.toastHistory') || '[]').map((x) => x.m)`)).filter((m) => /still runs VibeSpace/.test(m));
    check('H1 a bundle that never matches the server: ONE reload, ONE notice («still runs VibeSpace …»), then quiet across two reconnects — the diary\'s stale rows say reload, notice', stale === 'reload,notice' && bootTypes.split(',').filter((x) => x === 'reload').length === 1 && notes.length === 1, { stale, bootTypes, notes });
    // round 2: two reconnects 300 ms apart — both inside the reload's 800 ms — on a tab with no stamps yet
    await evalJs(`Object.keys(sessionStorage).filter((k) => /^vibespace\\.(reloaded-for|stale-said)\\./.test(k)).forEach((k) => sessionStorage.removeItem(k)); true`);
    const t2 = Date.now();
    await evalJs('app._checkBundleFreshness(); setTimeout(() => app._checkBundleFreshness(), 300); true');
    await sleep(9000); await settle(); await sleep(1500);
    const rows2 = (await diary()).filter((r) => r.t >= t2 && (r.k === 'stale' || r.k === 'boot'));
    const st2 = rows2.filter((r) => r.k === 'stale'), reloads2 = rows2.filter((r) => r.k === 'boot' && r.type === 'reload').length;
    check('H2 two reconnects 300 ms apart: ONE reload; the notice only from the RELOADED page (its bundle still stale) — never said before the reload', st2.map((r) => r.d2).join() === 'reload,notice' && st2[0].d !== st2[1].d && reloads2 === 1, { st2, reloads2 });
    fs.writeFileSync(pj, pjSrc);
  }
  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 5));
} catch (err) {
  fail++; console.log('  ✗ the suite threw: ' + (err?.stack || err));
}
console.log(`${fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`}`);
// Chrome first, and wait for it: a profile dir removed while its processes still write comes back
try { sock.close(); } catch { }
if (chrome.exitCode === null) { const gone = new Promise((r) => chrome.once('exit', r)); chrome.kill('SIGKILL'); await Promise.race([gone, sleep(3000)]); }
try { endRootedProcesses(chromeDir); } catch { }
await sleep(300);
process.exit(fail ? 1 : 0);
