#!/usr/bin/env node
// THE LATE WATCH HOLDS, in a real Chrome both ways of the back/forward cache (lane phone-back-reload, acceptance rounds 5
// and 6).
// test-exit-slow-chrome's harness: a throwaway server in a git worktree (the built public/ overlaid), another site beside
// it (the page before VibeSpace; the older document's embedded page), headless Chrome over raw CDP at 382×580 (an Android
// UA, touch, hover:none / pointer:coarse), the BROWSER's own back (Alt+Left); the network slowed per document with the
// Fetch domain (a document's HTML held — a cold cache on a slow link; the HTTP cache off while one is held). Chrome is
// launched twice — the cache OFF, then ON — and each road runs on a bundle rebuilt with an older round's rules (RED) then
// on the shipped one — ⑨–⑪ on ROUND 4's (a tap after the stay only drops the intent, a boot blind to its own hop rows,
// every popstate ends the late watch), ⑫ ⑬ on ROUND 5's (36df506a: a tap at the pointerdown, the browser's own back or
// forward told only by a key):
//   ⑨ a tap AFTER the stay: G7's road (the exit's go() lands on the older document), its HTML held 6 s, a tap (its
//      pointerdown and pointerup — round 6: a tap ends in one) 4 s into
//      the exit — the stay at 3 s stood a new sentinel, so nothing stands above the page: the tap's step goes DOWN onto
//      the page's own entry and ABORTS the suspended go() — the page stays, re-armed (rearm why input-late), the older
//      document never loads (round 4: the tap only dropped the intent; at 6 s the older document loaded and booted —
//      the person yanked to it while using the page)
//   ⑩ a chain of slow pages: the older document's HTML at 3.5 s and the page before VibeSpace (where its hop goes) at
//      10 s — the older document goes on, stays at its own bound and boots, then leaves: the tab outside and NOTHING
//      filed (round 4: its boot read the exit's slow row and filed «a slow exit»)
//   ⑪ a #fragment link during the late watch (a link to a heading followed 4 s into the exit with no tap — an assistive
//      technology's activation; a tap would abort the go() — ⑨): its navigation is a push that aborts nothing, the
//      commit comes at 6 s and the watch holds — the slow row, the re-key — so the older document goes on: the tab
//      outside (round 4: the fragment's popstate ended the watch; the older document booted with no intent and filed
//      nothing — the owner's silent load)
//   ⑫ a MOUSE's back button during the late watch (CDP Input.dispatchMouseEvent button 'back' at 4 s — the page gets its
//      pointerdown and pointerup, button 3, and the browser goes back at the release): no tap — the step down never runs
//      (no rearm why input-late); the browser's own back aborts the suspended go() and lands on the page's entry — the
//      page stays, nothing loads (round 5: read as a tap — the step down ran)
//   ⑬ a PAN during the late watch (CDP touch moves at 4 s — the page gets a pointerdown, then the pointercancel of the
//      touch the browser took): no tap — the commit comes at 6 s and the watch holds: the older document goes on, the
//      tab outside (round 5: the pointerdown was the tap — the step down cancelled the exit under a touch the person
//      never ended on the page)
// Its own clock: 840 s (suite-watchdog); run bare it assumes its ci.mjs row's budget (900 s) and says so at start.
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-exit-late-chrome.mjs
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

const [PORT, CDP_PORT, AUX_PORT] = await freePorts(3);
const wt = scratch('exit-late-wt');
const fakeHome = scratchHome('exit-late-home', fs);
const chromeRoot = scratch('exit-late-chrome');
const ORIGIN = `http://127.0.0.1:${PORT}`;
const AUX = `http://localhost:${AUX_PORT}`; // another site
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── throwaway server in a worktree (no rebuild: overlays the built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const stubPath = `${wt}-claude-stub`; // never a vendor CLI: the boot probes get a version and nothing else
fs.writeFileSync(stubPath, '#!/bin/sh\nfor a in "$@"; do case "$a" in --version) echo "2.1.288 (Claude Code) stub"; exit 0;; esac; done\nexit 0\n', { mode: 0o755 });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
// the other site: /link — one link (the older document's embedded page); /slowp-<n> — a page, never kept (no-store + an
// unload listener, so a back asks the site again — test-exit-hop-chrome's measured trap: the Fetch domain can hold it);
// /plain-<n> — a page
const aux = spawn(process.execPath, ['-e', `const hits = {}; require('http').createServer((q, s) => {
  const p = q.url.split('?')[0]; hits[p] = (hits[p] || 0) + 1;
  s.setHeader('content-type', 'text/html');
  const page = '<title>other</title><h1>another site</h1>';
  if (p === '/hits') return s.end(JSON.stringify(hits));
  if (p === '/link') return s.end('<a href="/b" style="display:block;width:100%;height:200px;background:#eee">follow</a>');
  if (p.startsWith('/slowp-')) { s.setHeader('cache-control', 'no-store'); return s.end(page + '<script>addEventListener("unload", () => {});</script>'); }
  s.end(page);
}).listen(${AUX_PORT}, '127.0.0.1')`], { stdio: 'ignore' });
let chrome = null;
const cleanup = () => {
  try { chrome?.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { aux.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, chromeRoot]) { try { endRootedProcesses(root); } catch { } } // whatever the server / Chrome started under its roots (§57b)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeRoot, fakeHome, stubPath]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
// run bare (no gate) the suite assumes its ci.mjs row's budget (budgetFor: a chrome heavy row, 900 s) and says so
const BARE = !process.env.VIBESPACE_SUITE_BUDGET_MS;
const WD = armWatchdog({ capMs: 840e3, env: BARE ? { ...process.env, VIBESPACE_SUITE_BUDGET_MS: '900000' } : process.env, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
console.log(`watchdog: ${Math.round(WD.deadline.ms / 1000)} s (${WD.deadline.capped ? "the suite's own ceiling" : 'the budget − 30 s'}; the budget ${Math.round(WD.deadline.budgetMs / 1000)} s — ${BARE ? "a bare run: its ci.mjs row's" : "the gate's"})`);
for (let i = 0; i < 80; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP onto the Chrome of the moment ──
const WebSocket = require('ws');
let sock = null, seq = 0, appLoads = 0, restores = 0;
const pend = new Map(), pageErrors = [];
/** A document's HTML held this long (by its URL): the Fetch domain's paused requests. */
const holds = new Map();
const held = [];
const onMessage = (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); }
  if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId && m.params.frame.url.startsWith(ORIGIN)) { if (m.params.type === 'BackForwardCacheRestore') restores++; else appLoads++; }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
  if (m.method === 'Fetch.requestPaused') {
    const { requestId, request } = m.params, go = () => cdp('Fetch.continueRequest', { requestId }).catch(() => { });
    const ms = holds.get(request.url);
    if (ms) { held.push({ at: Date.now(), ms, url: request.url }); setTimeout(go, ms); } else go();
  }
};
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
/** Chrome with the back/forward cache off or on, its first page target attached (the init scripts on it). */
const launch = async (cache) => {
  const dir = path.join(chromeRoot, cache); fs.mkdirSync(dir, { recursive: true });
  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    ...(cache === 'off' ? ['--disable-features=BackForwardCache'] : []), '--window-size=382,580', `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {} if (!target) await sleep(250); }
  if (!target) throw new Error('chrome never exposed a CDP page target');
  sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => sock.on('open', r)); sock.on('message', onMessage);
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
};
const quit = async () => {
  try { sock.close(); } catch { }
  if (chrome && chrome.exitCode === null) { const gone = new Promise((r) => chrome.once('exit', r)); chrome.kill('SIGKILL'); await Promise.race([gone, sleep(3000)]); }
  try { endRootedProcesses(chromeRoot); } catch { }
  chrome = null;
};
/** These documents' HTML held from now on — [[url, ms], …] (a cold cache: the HTTP cache off while one is held); [] = the
 *  network as it is. */
const slowNet = async (list) => {
  holds.clear(); for (const [u, ms] of list) holds.set(u, ms);
  await cdp('Network.setCacheDisabled', { cacheDisabled: holds.size > 0 });
  if (holds.size) await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] }); else await cdp('Fetch.disable');
};
const nav = async () => { const h = await cdp('Page.getNavigationHistory'); return { index: h.currentIndex, url: h.entries[h.currentIndex].url }; };
const onApp = (n) => n.url.startsWith(ORIGIN);
const key = async (dir) => { for (const type of ['rawKeyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, modifiers: 1, key: dir, code: dir, windowsVirtualKeyCode: dir === 'ArrowLeft' ? 37 : 39, nativeVirtualKeyCode: dir === 'ArrowLeft' ? 37 : 39 }); };
/** The BROWSER's back (Alt+Left → NavigationController::GoBack, the intervention's path — Android's back takes it). */
const browserBack = async (wait = 700) => { await key('ArrowLeft'); await sleep(wait); };
/** A mouse's back button pressed and released (CDP: a command sent while a traversal is pending is answered at once —
 *  measured, round 6; only Runtime.evaluate waits for the commit). */
const mouseBack = async (x, y) => {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'back', buttons: 8, clickCount: 1 }); await sleep(60);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'back', buttons: 0, clickCount: 1 });
};
/** A touch the browser takes: a vertical pan over the side bar (its pointerdown, then a pointercancel — measured). */
const pan = async (x, y0, y1) => {
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let y = y0; y1 < y0 ? y >= y1 : y <= y1; y += y1 < y0 ? -20 : 20) { await sleep(16); await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); }
  await sleep(30); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const tapAt = async (x, y) => {
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(50);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(250);
};
const phone = async () => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 382, height: 580, deviceScaleFactor: 2.75, mobile: true });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
};
const settle = async () => { await waitFor('!!(window.app && app.ready)', 25000); await evalJs('app.ready.then(() => true)'); await waitFor('!app.layoutManager._restoring', 15000); await sleep(900); };
const atHome = async () => { await evalJs('document.querySelectorAll("[data-popover]").forEach((e) => e.remove()); if (!app.sidebar.isOpen) app.sidebar.toggle(true); true'); await sleep(300); };
const toasts = () => evalJs(`[...document.querySelectorAll('#global-toasts .global-toast-body')].map((e) => e.textContent)`).catch(() => []);
const TOAST = 'Press back again to exit';
const incidents = async () => ((await (await fetch(`${ORIGIN}/api/incidents`)).json()).incidents || []);
/** The tab's diary from t0 on — read on a VibeSpace page of the tab (its sessionStorage); off it, a fresh one is
 *  loaded in the tab to read it (after the road: its own rows come later than every judged one). */
const diaryFrom = async (t0) => {
  if (!onApp(await nav())) { await cdp('Page.navigate', { url: ORIGIN + '/?session=exit-late-read' }); await waitFor('!!window.app', 20000); }
  return (await evalJs(`JSON.parse(sessionStorage.getItem('vibespace.navLog') || '[]')`).catch(() => [])).filter((r) => r.t >= t0 - 500);
};
const TOLD = new Set(['leave', 'rearm', 'hop', 'cost']);
const told = (rows) => rows.filter((r) => TOLD.has(r.k)).map(row).join(' ');
const row = (r) => (r.k === 'rearm' ? `rearm:${r.why}${r.abort === 0 ? '/0' : ''}` : r.k === 'leave' ? (r.why || (r.slow ? `slow:${r.slow}` : `${r.skip}/${r.load}`)) : r.k === 'hop' ? (r.slow ? `hop-slow:${r.slow}` : r.stay ? `hop-stay:${r.why}` : r.drop ? 'hop-drop' : `hop${r.n}`) : r.k === 'cost' ? `cost:${r.why || 'back'}` : r.k);

// ── the bundles: the shipped one, and the client rebuilt with ROUND 4's and with ROUND 5's rules ──
const bundleFile = path.join(wt, 'public/bundle.js');
const realBundle = fs.readFileSync(bundleFile);
const useBundle = (buf) => fs.writeFileSync(bundleFile, buf); // the index route stamps ?v=<mtime> per request: the next load runs it
/** Round 4's rules, from the tree's own mobile-back.js: a tap after the stay only drops the intent, the boot's slowExit
 *  blind to the document's own hop rows, and every popstate ends the late watch. */
const ROUND4 = [
  ["  const onLateInput = (e) => { if (tapOf(downs, e)) { stopTaps(); tapped('input-late'); } };\n", '  const onLateInput = () => { stopTaps(); drop(); };\n'],
  [', mine: navLogRead().filter((r) => r && r.d === DOC_ID) });', ' });'],
  ["    if (how ? how === 'traverse' : location.href === baseHref) lingering?.();", '    lingering?.();'],
];
/** Round 5's rules (36df506a's late watch): a pointer's tap at its pointerdown (a pointercancel too late to matter), the
 *  browser's own back or forward told only by a key (round 7: in the ONE tap, tapOf, both phases share). */
const ROUND5 = [
  ["const navInput = (e) => !!e && (e.type === 'keydown' ? !!e.altKey || !!e.metaKey || e.key === 'BrowserBack' || e.key === 'BrowserForward' : e.button === 3 || e.button === 4);", "const navInput = (e) => !!e && e.type === 'keydown' && (!!e.altKey || !!e.metaKey || e.key === 'BrowserBack' || e.key === 'BrowserForward');"],
  ["  if (e.type === 'pointerdown') { downs.add(id); return false; }\n", "  if (e.type === 'pointerdown') return true;\n"],
];
const buildRound = async (swaps, tag) => {
  const esbuild = require(path.join(repo, 'node_modules/esbuild'));
  const src = fs.readFileSync(path.join(wt, 'src/lib/mobile-back.js'), 'utf8');
  if (!swaps.every(([a]) => src.split(a).length === 2)) return null;
  const red = swaps.reduce((t, [a, b]) => t.replace(a, b), src);
  const out = await esbuild.build({ entryPoints: [path.join(wt, 'src/client.js')], outfile: path.join(wt, `public/bundle.${tag}.js`), bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'silent',
    plugins: [{ name: tag, setup(b) { b.onLoad({ filter: /src[\\/]lib[\\/]mobile-back\.js$/ }, () => ({ contents: red, loader: 'js' })); } }] });
  const js = out.outputFiles.find((f) => f.path.endsWith(`bundle.${tag}.js`));
  return js ? Buffer.from(js.contents) : null;
};

// ── the roads ──
let nth = 0;
/** G7's road: the page before VibeSpace (`prev`), the older document with ONE iframe link followed inside it (a joint
 *  step the Navigation API never shows), a `?` load over it; at home the exit's first back (the toast). */
const iframeRoad = async (prev, tag) => {
  await phone();
  await cdp('Page.navigate', { url: prev }); await sleep(600);
  await cdp('Page.navigate', { url: ORIGIN + '/' }); await settle(); await tapAt(191, 300);
  await evalJs(`(() => { const f = document.createElement('iframe'); f.src = ${JSON.stringify(AUX + '/link')}; f.style.cssText = 'position:fixed;left:0;top:0;width:380px;height:220px;z-index:2147483647;border:0'; document.body.appendChild(f); return true; })()`);
  await sleep(1500); await tapAt(150, 100); await sleep(1200); // a tap on its link: a joint step
  await evalJs(`location.href = '/?session=exit-late-${tag}'; true`); await sleep(600); await settle(); await tapAt(191, 300);
  await atHome(); await browserBack(300);
  return (await toasts()).includes(TOAST);
};
const OLDER = () => ORIGIN + '/'; // the older document's URL (G7's road loads the app at /)
/** Where the tab stands after a road, what loaded, what was filed, the diary — `i0`/`l0`/`r0`: the counts before it. */
const after = async ({ t0, i0, l0, r0, h0, mark = false }) => {
  let n = await nav();
  const same = mark && onApp(n) && await evalJs('window.__exitMark === 1').catch(() => false);
  const st = same ? await evalJs('history.state').catch(() => null) : null;
  const booted = !same && onApp(n) && await waitFor('!!(window.app && app.ready)', 12000);
  if (booted) await sleep(1500); // the incident's POST
  n = await nav();
  const all = await incidents(), inc = all.slice(0, all.length - i0); // newest first
  const loads = appLoads - l0, restored = restores - r0; // before the diary's own read
  const rows = await diaryFrom(t0);
  return { held: held.length - h0, outside: n.url.startsWith(AUX), onApp: onApp(n), same, st, booted, loads, restored, rows: told(rows), incidents: inc.map((x) => String(x.note || '').slice(0, 40)) };
};
const counts = async () => ({ i0: (await incidents()).length, l0: appLoads, r0: restores, h0: held.length });
/** ⑨ — the older document's HTML held 6 s; a tap 4.1 s into the exit (after the 3 s stay). The tap: a pointerdown and its
 *  pointerup the page dispatches to itself on a timer set just before the back (round 3's road; ⑫ ⑬ send theirs by
 *  CDP's Input domain, which answers while a traversal is pending — measured, round 6). */
const lateTapRoad = async () => {
  const armed = await iframeRoad(`${AUX}/plain-${++nth}`, 'tap');
  await evalJs(`window.__exitMark = 1; setTimeout(() => { for (const t of ['pointerdown', 'pointerup']) window.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true })); }, 4100); true`);
  const c = await counts();
  await slowNet([[OLDER(), 6000]]);
  const t0 = Date.now();
  await browserBack(100); // the exit: its go() pending on the held older document; the stay at 3 s, the tap at 4.1 s
  await sleep(8500);
  await slowNet([]);
  return { armed, ...(await after({ t0, ...c, mark: true })) };
};
/** ⑩ — the older document's HTML held 3.5 s, the page before VibeSpace (where the older document's hop goes) 10 s. */
const chainRoad = async () => {
  const prev = `${AUX}/slowp-${++nth}`;
  const armed = await iframeRoad(prev, 'chain');
  const c = await counts();
  await slowNet([[OLDER(), 3500], [prev, 10000]]);
  const t0 = Date.now();
  await browserBack(100); // the exit: late onto the older document (3.5 s), its hop late onto the page before (10 s more)
  await sleep(16000); // never an evaluate while a traversal is pending (it waits for the commit)
  await slowNet([]);
  return { armed, ...(await after({ t0, ...c })) };
};
/** ⑪ — the older document's HTML held 6 s; 4.1 s into the exit a link to a heading followed with no tap (a timer set
 *  just before the back: a click() — no pointerdown, so no abort). */
const fragRoad = async () => {
  const armed = await iframeRoad(`${AUX}/plain-${++nth}`, 'frag');
  await evalJs(`setTimeout(() => { const a = document.createElement('a'); a.href = '#exit-late-heading'; a.textContent = 'a heading'; document.body.appendChild(a); a.click(); }, 4100); true`);
  const c = await counts();
  await slowNet([[OLDER(), 6000]]);
  const t0 = Date.now();
  await browserBack(100);
  await sleep(8500);
  await slowNet([]);
  return { armed, ...(await after({ t0, ...c })) };
};

/** The page's own record of the pointer events it got from now on (the tab's sessionStorage — read with the diary). */
const PTR = 'exit-late.ptr';
const ptrWatch = () => evalJs(`sessionStorage.setItem('${PTR}', '[]'); for (const t of ['pointerdown', 'pointerup', 'pointercancel']) addEventListener(t, (e) => { try { const l = JSON.parse(sessionStorage.getItem('${PTR}') || '[]'); l.push(t + ':' + e.button); sessionStorage.setItem('${PTR}', JSON.stringify(l)); } catch { } }, true); true`);
const ptrRead = async () => (await evalJs(`sessionStorage.getItem('${PTR}') || '[]'`).then(JSON.parse).catch(() => [])).join(' ');
/** ⑫ ⑬ — the older document's HTML held 6 s; 4.1 s into the exit (after the 3 s stay) the press, by CDP: `mouse` — a
 *  mouse's back button (the browser's back at its release), `pan` — a touch the browser takes. */
const pressRoad = async (kind) => {
  const armed = await iframeRoad(`${AUX}/plain-${++nth}`, kind);
  await evalJs('window.__exitMark = 1; true'); await ptrWatch();
  const c = await counts();
  await slowNet([[OLDER(), 6000]]);
  const t0 = Date.now();
  await browserBack(100); // the exit: its go() pending on the held older document; the stay at 3 s
  await sleep(4100 - (Date.now() - t0));
  const sent = Date.now() - t0;
  if (kind === 'mouse') await mouseBack(191, 300); else await pan(191, 440, 180);
  const answered = Date.now() - t0;
  await sleep(8500 - (Date.now() - t0));
  await slowNet([]);
  const a = await after({ t0, ...c, mark: true });
  return { armed, sent, answered, ptr: await ptrRead(), ...a };
};

try {
  const round4 = await buildRound(ROUND4, 'round-4'), round5 = await buildRound(ROUND5, 'round-5');
  check('the client rebuilds with round 4\'s rules from the tree\'s own mobile-back.js (every anchor found once)', !!round4);
  check('…and with round 5\'s (36df506a\'s late watch: a tap at the pointerdown, the browser\'s own back or forward told only by a key)', !!round5);
  for (const cache of ['off', 'on']) {
    console.log(`${cache === 'off' ? 'I' : 'II'}  the back/forward cache ${cache.toUpperCase()} — each road on round 4's rules (RED), then the shipped ones`);
    await launch(cache);
    const R = {}, G = {};
    if (round4) { useBundle(round4); try { R.tap = await lateTapRoad(); R.chain = await chainRoad(); R.frag = await fragRoad(); } finally { useBundle(realBundle); } }
    if (round5) { useBundle(round5); try { R.mouse = await pressRoad('mouse'); R.pan = await pressRoad('pan'); } finally { useBundle(realBundle); } }
    G.tap = await lateTapRoad(); G.chain = await chainRoad(); G.frag = await fragRoad(); G.mouse = await pressRoad('mouse'); G.pan = await pressRoad('pan');
    console.log(`  · round 4/5 ${JSON.stringify(R).slice(0, 2400)}`);
    console.log(`  · shipped ${JSON.stringify(G).slice(0, 2400)}`);
    const C = cache === 'off' ? 'I' : 'II';
    check(`${C}⑨ RED (round 4): a tap 4 s into the exit, after the stay (the older document's HTML at 6 s) — it only dropped the intent: the older document LOADED and booted (the person yanked to it)`,
      !!R.tap && R.tap.armed && R.tap.held >= 1 && !R.tap.same && R.tap.onApp && R.tap.loads === 1, R.tap);
    check(`${C}⑨ the shipped rules: the tap's step DOWN onto the page's own entry ABORTS the suspended go() — the page stays, re-armed (rearm why input-late), the older document never loads`,
      G.tap.armed && G.tap.held >= 1 && G.tap.same && G.tap.st?.vs === 1 && G.tap.loads === 0 && /cancelled rearm:cancelled rearm:input-late\b/.test(G.tap.rows), G.tap);
    // the boot's cost row is its verdict — the capture itself is one per tab per half hour (⑨'s RED road filed one already)
    check(`${C}⑩ RED (round 4): a chain of slow pages (the older document at 3.5 s, the page before VibeSpace at 10 s) — the older document went on, stayed at its own bound and booted: «a slow exit» FILED (its boot's cost row why slow)`,
      !!R.chain && R.chain.armed && R.chain.held >= 2 && R.chain.outside && /hop1 hop-stay:cancelled cost:slow\b/.test(R.chain.rows) && R.chain.incidents.every((x) => /a slow exit/.test(x)), R.chain);
    check(`${C}⑩ the shipped rules: the same chain — the tab outside, the diary tells it (hop 1, hop stay why cancelled, hop slow), NOTHING filed`,
      G.chain.armed && G.chain.held >= 2 && G.chain.outside && G.chain.incidents.length === 0 && /slow:\d+ hop1 hop-stay:cancelled hop-slow:\d+/.test(G.chain.rows) && !/cost:/.test(G.chain.rows), G.chain);
    check(`${C}⑪ RED (round 4): a #fragment link followed 4 s into the exit ended the late watch — no slow row, no re-key: the older document booted with no intent and filed NOTHING (the owner's silent load)`,
      !!R.frag && R.frag.armed && R.frag.held >= 1 && R.frag.onApp && R.frag.booted && !/slow:/.test(R.frag.rows) && R.frag.incidents.length === 0, R.frag);
    check(`${C}⑪ the shipped rules: the fragment link aborts nothing and ends no watch — the late commit told (leave slow), the intent re-keyed: the older document goes on, the tab outside, nothing filed`,
      G.frag.armed && G.frag.held >= 1 && G.frag.outside && G.frag.loads === 1 && /^3\/0 cancelled rearm:cancelled slow:\d+ hop1\b/.test(G.frag.rows) && G.frag.incidents.length === 0, G.frag);
    // round 6 — the press sent by CDP while the go() is pending, answered at once (sent → answered: the 60 ms hold)
    check(`${C}⑫ RED (round 5, 36df506a): a mouse's back button 4 s into the exit (pointerdown and pointerup, button 3) — read as a tap: the step down ran (rearm why input-late)`,
      !!R.mouse && R.mouse.armed && R.mouse.held >= 1 && /^pointerdown:3 pointerup:3\b/.test(R.mouse.ptr) && /rearm:input-late\b/.test(R.mouse.rows) && R.mouse.answered - R.mouse.sent < 1500, R.mouse);
    check(`${C}⑫ the shipped rules: the mouse's back button is no tap — no step down; the browser's own back at the release aborts the suspended go(): the page stays, re-armed, the older document never loads`,
      G.mouse.armed && G.mouse.held >= 1 && /^pointerdown:3 pointerup:3\b/.test(G.mouse.ptr) && G.mouse.same && G.mouse.st?.vs === 1 && G.mouse.loads === 0 && /^3\/0 cancelled rearm:cancelled$/.test(G.mouse.rows), G.mouse);
    check(`${C}⑬ RED (round 5, 36df506a): a pan 4 s into the exit (a pointerdown, then the pointercancel of the touch the browser took) — the pointerdown was the tap: the step down cancelled the exit (rearm why input-late), the page stays`,
      !!R.pan && R.pan.armed && R.pan.held >= 1 && /^pointerdown:0 pointercancel:/.test(R.pan.ptr) && R.pan.same && R.pan.loads === 0 && /rearm:input-late\b/.test(R.pan.rows), R.pan);
    check(`${C}⑬ the shipped rules: the pan is no tap — no step; the commit at 6 s, the watch holds (leave slow, the re-key): the older document goes on, the tab outside, nothing filed`,
      G.pan.armed && G.pan.held >= 1 && /^pointerdown:0 pointercancel:/.test(G.pan.ptr) && !/pointerup/.test(G.pan.ptr) && G.pan.outside && G.pan.loads === 1 && /^3\/0 cancelled rearm:cancelled slow:\d+ hop1\b/.test(G.pan.rows) && !/input-late/.test(G.pan.rows) && G.pan.incidents.length === 0, G.pan);
    await quit();
  }
  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 5));
} catch (err) {
  fail++; console.log('  ✗ the suite threw: ' + (err?.stack || err));
}
console.log(`${fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`}`);
await quit();
await sleep(300);
process.exit(fail ? 1 : 0);
