#!/usr/bin/env node
// THE EXIT GOES ON — EVERY go() WATCHED TO ITS END, in a real Chrome both ways of the back/forward cache (lane
// phone-back-reload, acceptance round 3). A throwaway server in a git worktree (test-mobile-back-chrome's harness: the
// built public/ overlaid), another site beside it (the page before VibeSpace; the older document's embedded page), and
// headless Chrome over raw CDP at 382×580 (an Android UA, touch, hover:none / pointer:coarse), the BROWSER's own back
// and forward (Alt+Left / Alt+Right). Chrome is launched twice — the back/forward cache OFF (a phone under memory
// pressure keeps none), then ON (Chrome's default) — and each road runs on a bundle rebuilt with ROUND 2's rules (RED)
// then on the shipped one:
//   ① a hop CANCELLED by a 204: G7's road (one iframe link followed inside the older document, so the exit's go() lands
//      ON it and that document goes on back) onto a previous page that answers 204 the second time (asked again — the
//      judges require that second visit: a page the cache shows again is another road) — round 2 stood on
//      the splash for good (no App, its beforeunload listener held, the intent kept); shipped: the App boots within 4 s
//      of the hop's go(), no beforeunload listener of the module left (getEventListeners(window), against a booted
//      page's own count), the intent dropped, the diary's row «hop stay why cancelled»
//   ② a hop STOPPED: the same road onto a previous page that answers in 8 s, Page.stopLoading once the hop's request
//      reached that site (the person taps stop while it loads): the same judges
//   ③ NO KEY, NO HOP: navigation.activation removed (Chromium 102–122, Safari 26.0–26.1: entries() without it) — G3's
//      exit, then a FORWARD press inside the intent's 10 s: round 2 hopped the person back out of the page they chose;
//      shipped: no intent written, the page they went forward onto boots and stays
//   ④ (the cache ON) G7's road as shipped: the exit ends on the page before VibeSpace — and whether the older document
//      it went through was LOADED or kept by the cache is said as measured (Chrome 154: loaded — the cache names
//      ConflictingBrowsingInstance; a kept one going on is test-back-guard's fake-world leg, RED from round 2)
// Its own clock: 600 s (suite-watchdog); run bare it assumes its ci.mjs row's budget (900 s) and says so at start.
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-exit-hop-chrome.mjs
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
const wt = scratch('exit-hop-wt');
const fakeHome = scratchHome('exit-hop-home', fs);
const chromeRoot = scratch('exit-hop-chrome');
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
// the other site: /link — one link (the older document's embedded page); /p204-<n> — a page the first time, then 204;
// /slow-<n> — a page the first time, then one 8 s late; both no-store AND with an unload listener, so a back asks the
// site again (measured on Chrome 154 with the cache on: a no-store page left for a VibeSpace page was KEPT and shown again
// — no second visit, no 204; an unload listener still keeps a page out: UnloadHandlerExistsInMainFrame); /hits — the counts
const aux = spawn(process.execPath, ['-e', `const hits = {}; require('http').createServer((q, s) => {
  const p = q.url.split('?')[0]; hits[p] = (hits[p] || 0) + 1;
  s.setHeader('content-type', 'text/html');
  const page = '<title>other</title><h1>another site</h1>';
  if (p === '/hits') return s.end(JSON.stringify(hits));
  if (p === '/link') return s.end('<a href="/b" style="display:block;width:100%;height:200px;background:#eee">follow</a>');
  const asked = p.startsWith('/p204-') || p.startsWith('/slow-'), body = asked ? page + '<script>addEventListener("unload", () => {});</script>' : page;
  if (asked) s.setHeader('cache-control', 'no-store');
  if (p.startsWith('/p204-') && hits[p] > 1) { s.statusCode = 204; return s.end(); }
  if (p.startsWith('/slow-') && hits[p] > 1) return setTimeout(() => s.end(body), 8000);
  s.end(body);
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
const WD = armWatchdog({ capMs: 600e3, env: BARE ? { ...process.env, VIBESPACE_SUITE_BUDGET_MS: '900000' } : process.env, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
console.log(`watchdog: ${Math.round(WD.deadline.ms / 1000)} s (${WD.deadline.capped ? "the suite's own ceiling" : 'the budget − 30 s'}; the budget ${Math.round(WD.deadline.budgetMs / 1000)} s — ${BARE ? "a bare run: its ci.mjs row's" : "the gate's"})`);
for (let i = 0; i < 80; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP onto the Chrome of the moment ──
const WebSocket = require('ws');
let sock = null, seq = 0, appLoads = 0, restores = 0;
const pend = new Map(), pageErrors = [], notUsed = [];
const onMessage = (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); }
  if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId && m.params.frame.url.startsWith(ORIGIN)) { if (m.params.type === 'BackForwardCacheRestore') restores++; else appLoads++; }
  if (m.method === 'Page.backForwardCacheNotUsed') notUsed.push({ t: Date.now(), why: (m.params.notRestoredExplanations || []).map((x) => x.reason) });
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
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
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
};
const quit = async () => {
  try { sock.close(); } catch { }
  if (chrome && chrome.exitCode === null) { const gone = new Promise((r) => chrome.once('exit', r)); chrome.kill('SIGKILL'); await Promise.race([gone, sleep(3000)]); }
  try { endRootedProcesses(chromeRoot); } catch { }
  chrome = null;
};
const nav = async () => { const h = await cdp('Page.getNavigationHistory'); return { index: h.currentIndex, url: h.entries[h.currentIndex].url }; };
const onApp = (n) => n.url.startsWith(ORIGIN);
const key = async (dir) => { for (const type of ['rawKeyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, modifiers: 1, key: dir, code: dir, windowsVirtualKeyCode: dir === 'ArrowLeft' ? 37 : 39, nativeVirtualKeyCode: dir === 'ArrowLeft' ? 37 : 39 }); };
/** The BROWSER's back (Alt+Left → NavigationController::GoBack, the intervention's path — Android's back takes it). */
const browserBack = async (wait = 700) => { await key('ArrowLeft'); await sleep(wait); };
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
const diary = () => evalJs(`JSON.parse(sessionStorage.getItem('vibespace.navLog') || '[]')`);
/** The window's beforeunload listeners (the DevTools command line's getEventListeners). */
const unloadListeners = async () => (await cdp('Runtime.evaluate', { expression: '(getEventListeners(window).beforeunload || []).length', includeCommandLineAPI: true, returnByValue: true })).result?.value;
/** navigation.activation gone (as on Chromium 102–122 / Safari 26.0–26.1 — entries() stays): an init script while held. */
const NO_ACTIVATION = "try { if (globalThis.Navigation) Object.defineProperty(Navigation.prototype, 'activation', { get() { return undefined; }, configurable: true }); } catch {}";

// ── the bundles: the shipped one, and the client rebuilt with ROUND 2's rules ──
const bundleFile = path.join(wt, 'public/bundle.js');
const realBundle = fs.readFileSync(bundleFile);
const useBundle = (buf) => fs.writeFileSync(bundleFile, buf); // the index route stamps ?v=<mtime> per request: the next load runs it
/** Round 2's rules, from the tree's own files: a go() that never ends is never bounded, a tap while it is pending does
 *  nothing, the exit writes its intent with or without navigation.activation, and exitHop lets the clock alone decide. */
const ROUND2 = {
  'mobile-back.js': [
    ['  const onLeave = () => { began = true; clearTimeout(bound); bound = setTimeout(() => { off(); cancelled(); }, GONE_WAIT_MS); };', '  const onLeave = () => { began = true; };'],
    ['  const onInput = () => { off(); input(); };', '  const onInput = () => { if (!began) { off(); input(); } };'],
    ['    if (tellsArrival()) exitIntentWrite({ t: Date.now(), hop: 0, key: entryKey(), to: \'below\' });', '    exitIntentWrite({ t: Date.now(), hop: 0, key: entryKey(), to: \'below\' });']],
  'back-guard.js': [["  if (!(typeof fromKey === 'string' && fromKey !== '' && fromKey === intent.key)) return 'clear';", "  if (fromKey !== undefined && fromKey !== intent.key) return 'clear';"]],
};
const buildRound2 = async () => {
  const esbuild = require(path.join(repo, 'node_modules/esbuild'));
  const src = Object.fromEntries(Object.keys(ROUND2).map((f) => [f, fs.readFileSync(path.join(wt, 'src/lib', f), 'utf8')]));
  if (!Object.entries(ROUND2).every(([f, swaps]) => swaps.every(([a]) => src[f].split(a).length === 2))) return null;
  const red = Object.fromEntries(Object.entries(ROUND2).map(([f, swaps]) => [f, swaps.reduce((t, [a, b]) => t.replace(a, b), src[f])]));
  const out = await esbuild.build({ entryPoints: [path.join(wt, 'src/client.js')], outfile: path.join(wt, 'public/bundle.round-2.js'), bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'silent',
    plugins: [{ name: 'round-2', setup(b) { b.onLoad({ filter: /src[\\/]lib[\\/](mobile-back|back-guard)\.js$/ }, (a) => ({ contents: red[path.basename(a.path)], loader: 'js' })); } }] });
  const js = out.outputFiles.find((f) => f.path.endsWith('bundle.round-2.js'));
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
  await evalJs(`location.href = '/?session=exit-hop-${tag}'; true`); await sleep(600); await settle();
  await atHome(); await browserBack(300);
  return (await toasts()).includes('Press back again to exit');
};
/** ① / ② — the exit's go() lands on the older document; its hop's go() onto `prev` never ends (204 / stopped). */
const cancelRoad = async (kind) => {
  const prev = `${AUX}/${kind === '204' ? 'p204' : 'slow'}-${++nth}`;
  const armed = await iframeRoad(prev, kind);
  const t0 = Date.now(), l0 = appLoads;
  await browserBack(100); // the exit: lands ON the older document, which goes on onto `prev`
  if (kind === 'stop') { // once the hop's go() asked the slow site (its second visit), the person taps stop — never an evaluate before: one waits while a traversal is pending
    const p = new URL(prev).pathname;
    for (const until = Date.now() + 10000; Date.now() < until;) { try { if ((await (await fetch(AUX + '/hits')).json())[p] >= 2) break; } catch { } await sleep(100); }
    await sleep(400); await cdp('Page.stopLoading');
  }
  let bootedAt = 0;
  for (const until = Date.now() + 9000; Date.now() < until && !bootedAt;) { try { bootedAt = await evalJs('window.app ? Date.now() : 0'); } catch { } if (!bootedAt) await sleep(150); }
  await sleep(1200);
  const rows = (await diary().catch(() => [])).filter((r) => r.t >= t0 - 500);
  const go = rows.find((r) => r.k === 'hop' && r.skip), stayed = rows.find((r) => r.k === 'hop' && r.stay);
  const n = await nav(), asked = await (await fetch(AUX + '/hits')).json().then((h) => h[new URL(prev).pathname] || 0).catch(() => 0);
  return { armed, asked, loads: appLoads - l0, onApp: onApp(n), url: n.url.slice(0, 40), booted: !!bootedAt, ms: go && bootedAt ? bootedAt - go.t : null, hop: go ? go.n : null, why: stayed ? stayed.why : null,
    unload: await unloadListeners().catch(() => null), intent: await evalJs(`sessionStorage.getItem('vibespace.exitIntent')`).catch(() => 'unreadable') };
};
/** ③ — navigation.activation removed: G3's exit (past an older document, onto the page before VibeSpace), then a
 *  FORWARD press inside the intent's 10 s onto the older document. */
const forwardRoad = async () => {
  const { identifier } = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: NO_ACTIVATION });
  try {
    await phone();
    await cdp('Page.navigate', { url: `${AUX}/plain-${++nth}` }); await sleep(600);
    await cdp('Page.navigate', { url: ORIGIN + '/' }); await settle(); await tapAt(191, 300);
    const api = await evalJs(`({ entries: typeof navigation.entries === 'function', activation: navigation.activation === undefined ? 'absent' : 'present' })`);
    await evalJs(`location.href = '/?session=exit-hop-forward'; true`); await sleep(600); await settle();
    await atHome(); await browserBack(300);
    const t0 = Date.now(), l0 = appLoads, r0 = restores;
    await browserBack(1500);
    const out = await nav();
    await key('ArrowRight'); await sleep(2500); // forward inside 10 s: onto the older document
    let n = await nav();
    const booted = onApp(n) && await waitFor('!!(window.app && app.ready)', 10000);
    n = await nav();
    const rows = onApp(n) ? (await diary().catch(() => [])).filter((r) => r.t >= t0 - 3000) : [];
    return { api, left: out.url.startsWith(AUX), stays: onApp(n) && booted, url: n.url.slice(0, 40), loads: appLoads - l0, restored: restores - r0, hops: rows.filter((r) => r.k === 'hop').map((r) => (r.drop ? 'drop' : r.stay ? `stay:${r.why}` : `n${r.n}`)) };
  } finally { await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
};
/** ④ — G7's road as shipped onto a page that answers: where the exit ends, and how the older document was gone through. */
const keptRoad = async () => {
  const armed = await iframeRoad(`${AUX}/plain-${++nth}`, 'kept');
  const t0 = Date.now(), l0 = appLoads, r0 = restores;
  await browserBack(3500);
  const n = await nav();
  return { armed, outside: n.url.startsWith(AUX), loads: appLoads - l0, restored: restores - r0, cache: notUsed.filter((x) => x.t >= t0).map((x) => x.why.join('+')) };
};

try {
  const round2 = await buildRound2();
  check('the client rebuilds with round 2\'s rules from the tree\'s own mobile-back.js + back-guard.js (every anchor found once)', !!round2);
  for (const cache of ['off', 'on']) {
    console.log(`${cache === 'off' ? 'I' : 'II'}  the back/forward cache ${cache.toUpperCase()} — each road on round 2's rules (RED), then the shipped ones`);
    await launch(cache);
    await phone(); await cdp('Page.navigate', { url: ORIGIN + '/' }); await settle();
    const own = await unloadListeners(); // a booted page's own beforeunload listeners (the App's, none of the exit's)
    const R = {}, G = {};
    if (round2) { useBundle(round2); try { R.c204 = await cancelRoad('204'); R.stop = await cancelRoad('stop'); R.fwd = await forwardRoad(); } finally { useBundle(realBundle); } }
    G.c204 = await cancelRoad('204'); G.stop = await cancelRoad('stop'); G.fwd = await forwardRoad();
    if (cache === 'on') G.kept = await keptRoad();
    console.log(`  · round 2 ${JSON.stringify(R).slice(0, 900)}`);
    console.log(`  · shipped ${JSON.stringify(G).slice(0, 900)} (a booted page's own beforeunload listeners: ${own})`);
    const C = cache === 'off' ? 'I' : 'II';
    const red = (x) => !!x && x.armed && x.asked === 2 && x.hop === 1 && !x.booted && x.unload >= 1 && !!x.intent && x.intent !== 'unreadable';
    const green = (x) => x.armed && x.asked === 2 && x.hop === 1 && x.booted && x.ms !== null && x.ms <= 4000 && x.onApp && x.loads === 1 && x.why === 'cancelled' && x.unload === own && x.intent === null;
    check(`${C}① RED (round 2): the hop's go() onto a page that answers 204 — the older document stands on the splash for good: no App, its beforeunload listener held, the intent kept`, red(R.c204), R.c204);
    check(`${C}① the shipped rules: the same 204 — the App boots within 4 s of the hop's go() (the diary: hop stay why cancelled), no beforeunload listener of the module left, the intent dropped`, green(G.c204), G.c204);
    check(`${C}② RED (round 2): the hop's go() onto a slow page, stopped while it loads — the splash for good, the listener held, the intent kept`, red(R.stop), R.stop);
    check(`${C}② the shipped rules: the same stop — the App boots within 4 s of the hop's go(), no listener of the module left, the intent dropped`, green(G.stop), G.stop);
    check(`${C}③ RED (round 2): navigation.activation removed (entries() kept) — the exit, then a FORWARD press inside 10 s: the person is hopped back OUT of the page they went forward onto`, !!R.fwd && R.fwd.api.activation === 'absent' && R.fwd.api.entries && R.fwd.left && !R.fwd.stays && R.fwd.url.startsWith(AUX), R.fwd);
    check(`${C}③ the shipped rules: no key, no hop — the exit writes no intent there, and the page the person went forward onto boots and stays (${G.fwd.restored ? 'kept by the cache and shown again' : 'loaded'})`, G.fwd.api.activation === 'absent' && G.fwd.left && G.fwd.stays && !G.fwd.hops.some((h) => /^n/.test(h)), G.fwd);
    if (G.kept) check(`II④ the cache ON, G7's road as shipped: the exit ends on the page before VibeSpace; the older document it went through was ${G.kept.restored ? 'KEPT by the cache and went on' : `LOADED (the cache said: ${G.kept.cache.join(' · ') || 'nothing'})`}`, G.kept.armed && G.kept.outside && G.kept.loads + G.kept.restored === 1, G.kept);
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
