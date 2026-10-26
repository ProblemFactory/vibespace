#!/usr/bin/env node
// THE EXIT ON A SLOW LINK — A STAYED go() IS SUSPENDED, NEVER FORGOTTEN, in a real Chrome both ways of the back/forward
// cache (lane phone-back-reload, acceptance round 4). test-exit-hop-chrome's harness: a throwaway server in a git
// worktree (the built public/ overlaid), another site beside it (the page before VibeSpace; the older document's
// embedded page), headless Chrome over raw CDP at 382×580 (an Android UA, touch, hover:none / pointer:coarse), the
// BROWSER's own back (Alt+Left); the network is slowed per document with the Fetch domain (the older document's HTML
// held — a cold cache on a slow link; the HTTP cache off while it is held). Chrome is launched twice — the cache OFF,
// then ON — and each road runs on a bundle rebuilt with ROUND 3's rules (RED: the bound drops the intent and watches
// nothing after, no re-arm, a tap only drops the intent, no incident for a late landing) then on the shipped one:
//   ⑤ the exit on a slow link: G7's road (one iframe link followed inside the older document, so the exit's go() lands
//      ON it), the older document's HTML answering in 3.5 s — round 3 dropped the intent at the 3 s bound and the older
//      document booted with none, filing nothing (the owner's silent load); shipped: it goes on — the tab ends on the
//      page before VibeSpace; the diary has the stay AND the late commit (leave why cancelled, rearm, leave slow ≈3500)
//   ⑥ the same at 12 s, past the intent's 10 s window: the older document boots and files ONE incident «a slow exit»
//      (round 3: none)
//   ⑦ a cancelled exit, then a back: G3's road onto a page before VibeSpace that answers 204 — after the stay, the next
//      back is ours: the 「再返回一次退出」 toast on the same document (round 3: no sentinel above the page — the
//      browser's own back LOADED the older document)
//   ⑧ a tap while the exit's go() is pending (G7's road, the older document answering in 6 s; the tap 1 s in): the go()
//      is ABORTED by the step onto the sentinel above — the page stays, re-armed, the older document never loads (round 3:
//      the traversal went on and the older document booted — the tap lost)
// Its own clock: 780 s (suite-watchdog); run bare it assumes its ci.mjs row's budget (900 s) and says so at start.
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-exit-slow-chrome.mjs
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
const wt = scratch('exit-slow-wt');
const fakeHome = scratchHome('exit-slow-home', fs);
const chromeRoot = scratch('exit-slow-chrome');
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
// the other site: /link — one link (the older document's embedded page); /p204-<n> — a page the first time, then 204
// (no-store + an unload listener, so a back asks the site again — test-exit-hop-chrome's measured trap); /plain-<n> — a page
const aux = spawn(process.execPath, ['-e', `const hits = {}; require('http').createServer((q, s) => {
  const p = q.url.split('?')[0]; hits[p] = (hits[p] || 0) + 1;
  s.setHeader('content-type', 'text/html');
  const page = '<title>other</title><h1>another site</h1>';
  if (p === '/hits') return s.end(JSON.stringify(hits));
  if (p === '/link') return s.end('<a href="/b" style="display:block;width:100%;height:200px;background:#eee">follow</a>');
  if (p.startsWith('/p204-')) { s.setHeader('cache-control', 'no-store'); if (hits[p] > 1) { s.statusCode = 204; return s.end(); } return s.end(page + '<script>addEventListener("unload", () => {});</script>'); }
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
const WD = armWatchdog({ capMs: 780e3, env: BARE ? { ...process.env, VIBESPACE_SUITE_BUDGET_MS: '900000' } : process.env, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
console.log(`watchdog: ${Math.round(WD.deadline.ms / 1000)} s (${WD.deadline.capped ? "the suite's own ceiling" : 'the budget − 30 s'}; the budget ${Math.round(WD.deadline.budgetMs / 1000)} s — ${BARE ? "a bare run: its ci.mjs row's" : "the gate's"})`);
for (let i = 0; i < 80; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP onto the Chrome of the moment ──
const WebSocket = require('ws');
let sock = null, seq = 0, appLoads = 0, restores = 0;
const pend = new Map(), pageErrors = [];
/** The older document's HTML held this long (0 = answered at once): the Fetch domain's paused requests. */
let holdMs = 0;
const held = [];
const onMessage = (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); }
  if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId && m.params.frame.url.startsWith(ORIGIN)) { if (m.params.type === 'BackForwardCacheRestore') restores++; else appLoads++; }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
  if (m.method === 'Fetch.requestPaused') {
    const { requestId, request } = m.params, go = () => cdp('Fetch.continueRequest', { requestId }).catch(() => { });
    if (holdMs && request.url === ORIGIN + '/') { held.push({ at: Date.now(), ms: holdMs }); setTimeout(go, holdMs); } else go();
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
/** The older document's HTML held `ms` from now on (a cold cache: the HTTP cache off while held); 0 = the network as it is. */
const slowNet = async (ms) => {
  holdMs = ms;
  await cdp('Network.setCacheDisabled', { cacheDisabled: ms > 0 });
  if (ms) await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] }); else await cdp('Fetch.disable');
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
const TOAST = 'Press back again to exit';
const incidents = async () => ((await (await fetch(`${ORIGIN}/api/incidents`)).json()).incidents || []);
/** The tab's diary from t0 on — read on a VibeSpace page of the tab (its sessionStorage); off it, a fresh one is
 *  loaded in the tab to read it (after the road: its own rows come later than every judged one). */
const diaryFrom = async (t0) => {
  if (!onApp(await nav())) { await cdp('Page.navigate', { url: ORIGIN + '/?session=exit-slow-read' }); await waitFor('!!window.app', 20000); }
  return (await evalJs(`JSON.parse(sessionStorage.getItem('vibespace.navLog') || '[]')`).catch(() => [])).filter((r) => r.t >= t0 - 500);
};
const TOLD = new Set(['leave', 'rearm', 'hop', 'cost']);
const told = (rows) => rows.filter((r) => TOLD.has(r.k)).map(row).join(' ');
const row = (r) => (r.k === 'rearm' ? `rearm:${r.why}` : r.k === 'leave' ? (r.why || (r.slow ? `slow:${r.slow}` : `${r.skip}/${r.load}`)) : r.k === 'hop' ? (r.slow ? `hop-slow:${r.slow}` : r.stay ? `hop-stay:${r.why}` : r.drop ? 'hop-drop' : `hop${r.n}`) : r.k === 'cost' ? `cost:${r.why || 'back'}` : r.k);

// ── the bundles: the shipped one, and the client rebuilt with ROUND 3's rules ──
const bundleFile = path.join(wt, 'public/bundle.js');
const realBundle = fs.readFileSync(bundleFile);
const useBundle = (buf) => fs.writeFileSync(bundleFile, buf); // the index route stamps ?v=<mtime> per request: the next load runs it
/** Round 3's rules, from the tree's own mobile-back.js: the bound drops the intent and watches nothing after, a stay never
 *  re-arms, a tap while the go() is pending only drops the intent, and a late landing files nothing. */
const ROUND3 = [
  ["  const onLeave = () => { began = true; clearTimeout(bound); bound = setTimeout(() => { off(); stayed('cancelled', null); linger(); }, GONE_WAIT_MS); };", "  const onLeave = () => { began = true; clearTimeout(bound); bound = setTimeout(() => { off(); drop(); stayed('cancelled', null); }, GONE_WAIT_MS); };"],
  ["  const onInput = () => {\n    off();\n    if (!began) { drop(); input(); return; }\n    const abort = abortGo();\n    if (!abort) drop();\n    stayed('input', abort);\n    const end = linger();\n    abort?.then((landed) => { if (landed) { drop(); end(); } });\n  };", "  const onInput = () => { off(); drop(); if (began) stayed('input', null); else input(); };"],
  ["        else if (enabled() && app.isMobile !== false) { push(); navNote({ k: 'rearm', why }); }\n", ''],
  ['  const late = slowExit({ navType: facts.type, prev, now: Date.now(), came });', '  const late = false;'],
];
const buildRound3 = async () => {
  const esbuild = require(path.join(repo, 'node_modules/esbuild'));
  const src = fs.readFileSync(path.join(wt, 'src/lib/mobile-back.js'), 'utf8');
  if (!ROUND3.every(([a]) => src.split(a).length === 2)) return null;
  const red = ROUND3.reduce((t, [a, b]) => t.replace(a, b), src);
  const out = await esbuild.build({ entryPoints: [path.join(wt, 'src/client.js')], outfile: path.join(wt, 'public/bundle.round-3.js'), bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'silent',
    plugins: [{ name: 'round-3', setup(b) { b.onLoad({ filter: /src[\\/]lib[\\/]mobile-back\.js$/ }, () => ({ contents: red, loader: 'js' })); } }] });
  const js = out.outputFiles.find((f) => f.path.endsWith('bundle.round-3.js'));
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
  await evalJs(`location.href = '/?session=exit-slow-${tag}'; true`); await sleep(600); await settle(); await tapAt(191, 300);
  await atHome(); await browserBack(300);
  return (await toasts()).includes(TOAST);
};
/** ⑤ / ⑥ — the exit's go() onto the older document, its HTML held `ms`: where the tab ends, what booted, what was filed. */
const slowRoad = async (ms) => {
  const armed = await iframeRoad(`${AUX}/plain-${++nth}`, `slow-${ms}`);
  const i0 = (await incidents()).length, l0 = appLoads, r0 = restores, h0 = held.length;
  await slowNet(ms);
  const t0 = Date.now();
  await browserBack(100); // the exit: its go() lands on the older document — held
  await sleep(ms + 2500); // never an evaluate while the traversal is pending (it waits for the commit)
  await slowNet(0);
  let n = await nav();
  const booted = onApp(n) && await waitFor('!!(window.app && app.ready)', 12000);
  if (booted) await sleep(1500); // the incident's POST
  n = await nav();
  const all = await incidents(), inc = all.slice(0, all.length - i0); // newest first
  const loads = appLoads - l0, restored = restores - r0; // before the diary's own read
  const rows = await diaryFrom(t0);
  return { armed, held: held.length - h0, outside: n.url.startsWith(AUX), onApp: onApp(n), booted, loads, restored, rows: told(rows),
    slow: rows.find((r) => r.k === 'leave' && r.slow)?.slow || null, incidents: inc.map((x) => String(x.note || '').slice(0, 40)) };
};
/** ⑦ — G3's road onto a page that answers 204 the second time: the exit's go() cancelled; after the stay, the next back. */
const cancelBackRoad = async () => {
  const prev = `${AUX}/p204-${++nth}`;
  await phone();
  await cdp('Page.navigate', { url: prev }); await sleep(600);
  await cdp('Page.navigate', { url: ORIGIN + '/' }); await settle(); await tapAt(191, 300);
  await evalJs(`location.href = '/?session=exit-slow-cancel'; true`); await sleep(600); await settle(); await tapAt(191, 300);
  await atHome(); await browserBack(300);
  const armed = (await toasts()).includes(TOAST);
  const t0 = Date.now();
  await browserBack(100); // the exit: onto `prev`, which answers 204 — announced, then nothing
  await sleep(4200); // past the 3 s bound (and the first toast's 2 s)
  const asked = await (await fetch(AUX + '/hits')).json().then((h) => h[new URL(prev).pathname] || 0).catch(() => 0);
  const stayed = await evalJs(`window.__exitMark = ${t0}; ({ st: history.state, app: !!window.app })`).catch(() => null);
  const l0 = appLoads, r0 = restores;
  await browserBack(900); // the NEXT back
  const n = await nav();
  const same = onApp(n) && await evalJs(`window.__exitMark === ${t0}`).catch(() => false);
  const said = (await toasts()).includes(TOAST);
  const loads = appLoads - l0, restored = restores - r0;
  const rows = await diaryFrom(t0);
  return { armed, asked, stayed, loads, restored, onApp: onApp(n), same, said, rows: told(rows) };
};
/** ⑧ — G7's road, the older document's HTML held 6 s; a tap 1 s into the exit's pending go(). The tap: a pointerdown the
 *  page dispatches to itself on a timer set just before the back (a CDP command waits while a traversal is pending —
 *  measured in round 3: it would land after the commit, on the next document). */
const tapRoad = async () => {
  const armed = await iframeRoad(`${AUX}/plain-${++nth}`, 'tap');
  const l0 = appLoads, r0 = restores;
  await evalJs(`window.__exitMark = 1; setTimeout(() => window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), 1100); true`);
  await slowNet(6000);
  const t0 = Date.now();
  await browserBack(100); // the exit: its go() pending on the held older document; the tap 1 s in
  await sleep(8000);
  await slowNet(0);
  const n = await nav();
  const same = onApp(n) && await evalJs('window.__exitMark === 1').catch(() => false);
  const st = same ? await evalJs('history.state').catch(() => null) : null;
  const loads = appLoads - l0, restored = restores - r0;
  const rows = await diaryFrom(t0);
  return { armed, loads, restored, onApp: onApp(n), same, st, rows: told(rows) };
};

try {
  const round3 = await buildRound3();
  check('the client rebuilds with round 3\'s rules from the tree\'s own mobile-back.js (every anchor found once)', !!round3);
  for (const cache of ['off', 'on']) {
    console.log(`${cache === 'off' ? 'I' : 'II'}  the back/forward cache ${cache.toUpperCase()} — each road on round 3's rules (RED), then the shipped ones`);
    await launch(cache);
    const R = {}, G = {};
    if (round3) { useBundle(round3); try { R.late = await slowRoad(3500); R.later = await slowRoad(12000); R.back = await cancelBackRoad(); R.tap = await tapRoad(); } finally { useBundle(realBundle); } }
    G.late = await slowRoad(3500); G.later = await slowRoad(12000); G.back = await cancelBackRoad(); G.tap = await tapRoad();
    console.log(`  · round 3 ${JSON.stringify(R).slice(0, 1400)}`);
    console.log(`  · shipped ${JSON.stringify(G).slice(0, 1400)}`);
    const C = cache === 'off' ? 'I' : 'II';
    check(`${C}⑤ RED (round 3): the exit on a slow link (the older document's HTML at 3.5 s) — the bound dropped the intent; the older document booted with none and filed NOTHING (the owner's silent load)`,
      !!R.late && R.late.armed && R.late.held >= 1 && R.late.onApp && R.late.booted && R.late.incidents.length === 0 && !/slow:/.test(R.late.rows), R.late);
    check(`${C}⑤ the shipped rules: the same road — the page stayed at the bound and re-armed, the late commit told (leave slow ≈3.5 s), and the older document WENT ON: the tab on the page before VibeSpace, nothing filed`,
      G.late.armed && G.late.held >= 1 && G.late.outside && G.late.loads === 1 && /^3\/0 cancelled rearm:cancelled slow:\d+ hop1\b/.test(G.late.rows) && G.late.slow >= 3400 && G.late.slow < 5000 && G.late.incidents.length === 0, G.late);
    check(`${C}⑥ RED (round 3): the same at 12 s, past the intent's window — the older document booted and filed nothing`,
      !!R.later && R.later.held >= 1 && R.later.onApp && R.later.booted && R.later.incidents.length === 0, R.later);
    check(`${C}⑥ the shipped rules: at 12 s the older document boots and files ONE incident «a slow exit» (the diary: leave slow ≈12 s, then its cost row why slow)`,
      G.later.held >= 1 && G.later.onApp && G.later.booted && G.later.incidents.length === 1 && /a slow exit/.test(G.later.incidents[0]) && /slow:\d+/.test(G.later.rows) && /cost:slow/.test(G.later.rows) && G.later.slow >= 11900, G.later);
    check(`${C}⑦ RED (round 3): a cancelled exit (the page before VibeSpace answers 204), then a back — no sentinel above the page: the browser's own back LOADED the older document`,
      !!R.back && R.back.armed && R.back.asked === 2 && !R.back.same && R.back.loads + R.back.restored === 1, R.back);
    check(`${C}⑦ the shipped rules: after the stay the page stands on a sentinel again (rearm why cancelled), and the next back is ours — the 「再返回一次退出」 toast on the same document, no load`,
      G.back.armed && G.back.asked === 2 && G.back.stayed?.st?.vs === 1 && G.back.same && G.back.said && G.back.loads === 0 && /cancelled rearm:cancelled/.test(G.back.rows), G.back);
    check(`${C}⑧ RED (round 3): a tap 1 s into the exit's pending go() (the older document at 6 s) — the traversal went on: the older document LOADED and booted, the tap lost`,
      !!R.tap && R.tap.armed && !R.tap.same && R.tap.onApp && R.tap.loads === 1, R.tap);
    check(`${C}⑧ the shipped rules: the tap ABORTS the pending go() by the step onto the sentinel above — the page stays, re-armed (leave why input, rearm why input), the older document never loads`,
      G.tap.armed && G.tap.same && G.tap.st?.vs === 1 && G.tap.loads === 0 && /input rearm:input/.test(G.tap.rows), G.tap);
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
