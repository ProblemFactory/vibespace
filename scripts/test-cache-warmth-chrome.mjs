#!/usr/bin/env node
// test-cache-warmth-chrome — THE PROMPT-CACHE WARMTH, DRAWN (lane cache-warmth-band, q-059 r1b — the owner's ruling on the
// design of record: «按照这个实现吧»). Headless Chrome over a COPY of this tree (src, public, server.js, data/bin; the bundle
// built by esbuild here) with `desktop.cacheWarmth` ON in its data/settings.json, a stub stream-json claude (its assistant
// record carries `message.usage` — the stamp's one writer reads it) and ≤ 14 conversations created over the hub's own ws.
// Facts reach the page two lawful ways: (a) the REAL road — a stub turn stamps the conversation and the hub's own answer
// carries `warmth[<id>]` + `serverNow`; (b) the TIER MATRIX — a CDP response rewrite of /api/sessions that moves each
// EXISTING entry's last request back (never adds a `warmth` / `serverNow` key the hub did not send; deletes an entry to make
// a window unknown). (b) proves the client, (a) the road; test-cache-warmth ④⑦ prove the hub's facts. Every measure is
// through the page (computed styles of the pseudo-elements, rects, attributes); every tick is the page's own 5 s poll.
//   ① the real road: the unrewritten answer names the conversation; its bar is fresh and the band ≈ bar × frac; the chip is up
//   ② the tier matrix: fresh / mid / late / critical / expired + a 5-min credits mid + an account move (expired) + an unknown
//      — the tier attribute, the band ∝ frac (±2 px), NO band for expired / moved / unknown, the hover words en then zh
//   ③ the blink over a critical band: ::after still blinks (blink-fade) and ::before keeps its width and colour
//   ④ a tab group: each tab its own band (∝ the TAB's width), none for the expired tab, no frame band; the label's words
//      survive a switch; a strip rebuild brings the bands back with no tick; the group tile = critical, then expired; the
//      chooser's rows each carry a ring; a split
//   ⑤ desktops: the squares' tiers (expired = --text-dim, waiting = still yellow), three adjacent preview rings (none for an
//      all-fresh desktop), the switcher form and «+N» with warmth on at 1100 / 1280, 8 desktops ⇒ the folded button's ring;
//      a reload: the held windows and which rung of the ladder resolved each
//   ⑥ «+N»: «+N · k critical» with the critical dot, stable across two ticks and a focus click, at 951 / 1024 / 1100 / 1280;
//      r2 (H3): at the 90-px floor a tile shows the SAME title characters with warmth on and off (the ring rides the icon;
//      RED: the r1 DOM re-planted — the ring a flex child before the icon — counts fewer)
//   ⑦ the summary chip: its counts = the rewrite's ground truth; its list ascending, expired last, unknown absent; a press
//      groups by desktop; a row on another desktop switches there and raises it; a tick moves the bands, never the rows
//   ⑧ the window list: a band per row, «By time left» pressed and ascending; a press = creation order; r2 (H1): a «name —
//      /path» title never pushes the words past the row (RED: the shrink rule undone); (H2) an «Other desktops» row of a
//      group = the group's worst, built and held, and so are the group's squares
//   ⑧b r2 (H4): the switcher's «+N» room at its boundary — ≥ STRIP_MIN_TILES whole tiles with warmth on and off; the warm
//      chip's longest form (en / zh / ja) fits taskbar-fit.js OVERFLOW_CHIP_WARM_PX (RED: a chip planted wider breaks it)
//   ⑨ the phone: session rows and switcher rows carry the band and the words; an expired row says «Expired», no band
//   ⑩ off and on, live: off ⇒ zero marks, «+N» exactly «+N», ZERO warmth mutations over two ticks, a failed poll draws
//      nothing; the window list as before; on ⇒ the marks return with no reload
//   ⑪ scale and cost: passMs over 3 ticks in the heaviest state (+ the ×150 extrapolation, said as one); NO timer / rAF
//      from a warmth function over three ticks (a PLANTED control proves the census sees one)
//   ⑫ Settings → Window draws the row; the theme editor's «Cache warmth» rows
//   RED controls: the band hidden by a planted style ⇒ the ① / ④ probes say ABSENT; one window rewritten to expired ⇒ its
//   probe reports no band where it reported one a tick before.
// Shots: CACHE_WARMTH_SHOTS (default: the scratch root), <leg>-<theme>.png. Requires google-chrome (SKIP without).
// Run: node scripts/test-cache-warmth-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1400) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

const VNC_ENV = await vncEnv(); // §57: a per-run display/port for anything the hub would start
const ROOT = scratch('cache-warmth-chrome');
const SHOTS = process.env.CACHE_WARMTH_SHOTS ? path.resolve(process.env.CACHE_WARMTH_SHOTS) : path.join(ROOT, 'shots');
const BIN = path.join(ROOT, 'bin'), CWD = path.join(ROOT, 'work');
for (const d of [BIN, SHOTS, CWD]) fs.mkdirSync(d, { recursive: true });
// the run's own words beside its shots (a green ci.mjs run keeps no output): every printed line → <SHOTS>/run.log at exit
const TRANSCRIPT = [];
{ const log0 = console.log.bind(console); console.log = (...a) => { TRANSCRIPT.push(a.join(' ')); log0(...a); }; }
process.on('exit', () => { try { fs.writeFileSync(path.join(SHOTS, 'run.log'), TRANSCRIPT.join('\n') + '\n'); } catch { } });
const chromeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-warmth-h-')), chromeRun = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-warmth-run-'));
fs.chmodSync(chromeRun, 0o700);
const homes = [];
let chrome = null, srv = null;
const cleanup = () => {
  try { chrome && chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.kill('SIGKILL'); } catch { }
  for (const r of [ROOT, chromeHome, chromeRun, ...homes]) { try { endRootedProcesses(r); } catch { } }
  for (const d of [ROOT, chromeHome, chromeRun, ...homes]) { if (d === SHOTS) continue; try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
armWatchdog({ capMs: 540e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });

// ── the stub CLI (test-desktop-small-chrome's, as it is): one assistant turn per user line, its record carrying
//    `message.usage` — the request stamp's writer (usage-pool-engine noteModelRequest) reads it; no old `timestamp` ──
fs.writeFileSync(path.join(BIN, 'claude'), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.308 (Claude Code) stub'); process.exit(0); }
const SID = 'cwarm-' + process.pid;
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5-1', cwd: process.cwd(), tools: ['Read'], permissionMode: 'default', claude_code_version: '2.1.308' });
let n = 0, buf = '';
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m = null; try { m = JSON.parse(line); } catch {} if (!m || m.type !== 'user') continue; const k = n++;
  setTimeout(() => {
    out({ type: 'assistant', session_id: SID, uuid: 'a-' + k, message: { id: 'm' + k, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'The weekly numbers are in: three sources agree, one is late by a day.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 40 } } });
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 300, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 40 } });
  }, 150); } });
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── THE TREE: a plain copy of this checkout (no git), its bundle built here; the switch ON before boot ──
const wt = path.join(ROOT, 'tree');
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
fs.writeFileSync(path.join(wt, 'data/settings.json'), J({ 'desktop.cacheWarmth': true }));

const [PORT, CDP_PORT] = await freePorts(2);
const home = scratchHome('cache-warmth-home', fs); homes.push(home);
srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: 'ignore',
  env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: home, PATH: `${BIN}:${path.join(wt, 'data/bin')}:${process.env.PATH}`, CLAUDE_CMD: path.join(BIN, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' } });
const origin = `http://127.0.0.1:${PORT}`;
let up = false;
for (let i = 0; i < 200 && !up; i++) { try { await fetch(`${origin}/api/home`); up = true; } catch { await sleep(250); } }
check('the tree\'s hub answers', up);
if (!up) process.exit(1);

// ── THE CONVERSATIONS: created over the hub's own ws, each one stub turn (the stamp) ──
const NAMES = ['研究', '运维', 'ops bot', '数据清洗'];
const N = 14;
const nameOf = (k) => `${NAMES[k % 4]} ${k + 1}`;
const WebSocket = require('ws');
const SIDS = await (async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const frames = [];
  await new Promise((r) => ws.on('open', r)); ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
  const ids = [];
  for (let k = 0; k < N; k++) {
    ws.send(J({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'cw' + k, sessionName: nameOf(k) }));
    let sid = null; for (let i = 0; i < 100 && !sid; i++) { const f = frames.find((m) => m?.type === 'created' && m.reqId === 'cw' + k); if (f) sid = f.sessionId; else await sleep(100); }
    if (sid) { ids.push(sid); await sleep(300); ws.send(J({ type: 'chat-input', sessionId: sid, text: 'Pull this week\'s numbers together' })); await sleep(400); }
  }
  await sleep(1500); ws.close(); return ids;
})();
check(`${N} stub conversations created over the hub's ws, each with one turn`, SIDS.length === N, SIDS.length);
if (SIDS.length < N) process.exit(1);

// ── CHROME + CDP: the /api/sessions answer passes through the Fetch domain (the rewrite of (b) — off until a leg plans) ──
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
  '--password-store=basic', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'],
{ stdio: 'ignore', env: { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun, DISPLAY: '' } });
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  sock.send(J({ id, method, params }));
});
/** THE REWRITE (b): PLAN = { <webui id>: { agoMs, ttl, lost, del } } over the hub's EXISTING entries; each plan is anchored on the
 *  first answer after it was set (so time then runs as it does: a later tick is later); `failNext` fails that many polls */
const RW = { plan: {}, anchor: null, failNext: 0, lastRaw: null, polls: 0, keysAdded: 0 };
const setPlan = (plan) => { RW.plan = plan; RW.anchor = null; };
const onPaused = async (p) => {
  const { requestId, request } = p;
  let u = null; try { u = new URL(request.url); } catch { }
  if (!u || u.pathname !== '/api/sessions') { cdp('Fetch.continueRequest', { requestId }).catch(() => { }); return; }
  RW.polls++;
  if (RW.failNext > 0) { RW.failNext--; cdp('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => { }); return; }
  let body = null;
  try { const r = await cdp('Fetch.getResponseBody', { requestId }); body = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body; } catch { cdp('Fetch.continueRequest', { requestId }).catch(() => { }); return; }
  let data = null; try { data = JSON.parse(body); } catch { }
  if (data && data.warmth && typeof data.warmth === 'object' && data.serverNow > 0) {
    RW.lastRaw = { warmth: JSON.parse(J(data.warmth)), serverNow: data.serverNow, keys: Object.keys(data) };
    const ids = Object.keys(RW.plan);
    if (ids.length) {
      if (RW.anchor == null) RW.anchor = data.serverNow;
      for (const id of ids) {
        if (!(id in data.warmth)) continue; // never ADD an entry the hub did not send
        const pl = RW.plan[id];
        if (pl.del) { delete data.warmth[id]; continue; }
        const last = RW.anchor - pl.agoMs;
        data.warmth[id] = { lastRequestAt: last, cacheTtlSec: pl.ttl || 3600, lost: !!pl.lost, inFlight: false, turnStartedAt: null }; // r3's fields
      }
      body = J(data);
    }
  }
  const headers = (p.responseHeaders || []).filter((h) => !/^(content-length|content-encoding|etag)$/i.test(h.name));
  cdp('Fetch.fulfillRequest', { requestId, responseCode: p.responseStatusCode || 200, responseHeaders: headers, body: Buffer.from(body).toString('base64') }).catch(() => { });
};
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); }
  if (m.method === 'Fetch.requestPaused') onPaused(m.params);
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return !!(await evalJs(expr)); } catch { return false; } };
const click = async (sel) => { const at = await evalJs(`(() => { const e = document.querySelector(${J(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); if (!at) return false; for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 }); await sleep(250); return true; };
const SHOT_LIST = [];
const shot = async (name, clip) => { try { const { data } = await cdp('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); const f = path.join(SHOTS, `${name}.png`); fs.writeFileSync(f, Buffer.from(data, 'base64')); SHOT_LIST.push(f); console.log(`  (shot: ${f})`); } catch (e) { console.log(`  (shot ${name} failed: ${e.message})`); } };
const theme = (name) => evalJs(`(app.themeManager.apply(${J(name)}), document.documentElement.getAttribute('data-theme'))`);
const bothThemes = async (name, clip) => { await theme('dark'); await sleep(120); await shot(`${name}-dark`, clip); await theme('light'); await sleep(120); await shot(`${name}-light`, clip); await theme('dark'); };
/** one leg: a throw is a NAMED ✗ with where it threw, and the walk goes on */
const step = async (name, fn) => { console.log(`— ${name}`); try { await fn(); } catch (e) { check(`${name}: the leg ran to its end`, false, String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); } };
/** the next real poll tick that brought an answer (the page's own 5 s chain; never shortened) */
const nextTick = async (n = 1) => { const want = RW.polls + n; const t0 = Date.now(); while (RW.polls < want && Date.now() - t0 < 6500 * n) await sleep(100); await sleep(250); return RW.polls >= want; };

// THE TIMER CENSUS (⑪): every setTimeout / setInterval / requestAnimationFrame whose stack names a warmth-chrome.js FUNCTION
// (never the file: the bundle has no sourcemap, every frame reads bundle.js:L:C) — counted only while `on`
const WARMTH_FN = String.raw`\bat (?:\S+\.)?(noteWarmthAnswer\w*|paintAll\d*|paintFrame\d*|paintTab\d*|paintTile\d*|paintPreviews\d*|paintOverflowChip\d*|paintSummary\d*|placeWarmthChip\d*|paintListRow\d*|paintSessionCard\d*|paintSwitcherRow\d*|paintRowPair\d*|warmthRows\d*|seatChip\d*) \(`;
const CENSUS = `(() => { Error.stackTraceLimit = 50; const RE = new RegExp(${J(WARMTH_FN)}); window.__wc = { on: false, hits: [] };
  for (const n of ['setTimeout', 'setInterval', 'requestAnimationFrame']) { const o = window[n]; window[n] = function (...a) { if (window.__wc.on) { const s = String(new Error().stack || ''); const l = s.split('\\n').find((x) => RE.test(x)); if (l) window.__wc.hits.push(n + ' ' + l.trim()); } return o.apply(this, a); }; } })();`;

await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/sessions*', requestStage: 'Response' }] });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'en'); localStorage.setItem('vibespace.uiScale', '100'); localStorage.setItem('theme', 'dark'); } catch {}" });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: CENSUS });
const device = async (w, h, phone = false) => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: phone ? 2 : 1, mobile: phone });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: phone, maxTouchPoints: phone ? 5 : 1 });
};
const load = async (w, h, phone = false) => {
  await device(w, h, phone);
  await cdp('Page.navigate', { url: origin + '/' });
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app && app.ready) return res(app.ready.then(() => true)); if (Date.now() - t0 > 40000) return rej(new Error("no app after 40s")); setTimeout(w, 200); })(); })');
  await waitFor(`!document.getElementById('loading-screen')`, 30000);
  await sleep(900);
};
await load(1280, 800);
check('the page booted (desktop class, 1280 × 800)', await evalJs('!!window.app && !app.isMobile'));

// ── the windows: one per conversation, found by its webui id ──
const winOf = (k) => `[...app.wm.windows.values()].find((w) => app.sessions.get(w.id)?.sessionId === ${J(SIDS[k])})`;
const attach = async (ks) => {
  for (const k of ks) {
    const has = await evalJs(`!!${winOf(k)}`);
    if (!has) await evalJs(`(app.attachSession(${J(SIDS[k])}, ${J(nameOf(k))}, ${J(CWD)}, { mode: 'chat', backend: 'claude' }), 1)`);
  }
  await waitFor(`${J(ks)}.every((k) => !![...app.wm.windows.values()].find((w) => app.sessions.get(w.id)?.sessionId === ${J(SIDS)}[k]))`, 20000);
  await sleep(400);
};
const WID = async (k) => evalJs(`${winOf(k)}?.id || null`);
/** THE PROBE of one window's frame band (through the page's computed ::before) */
const BAR = (k) => `(() => { const w = ${winOf(k)}; if (!w) return null; const bar = w.titleBar, cs = getComputedStyle(bar, '::before'), af = getComputedStyle(bar, '::after');
  const width = cs.content === 'none' || cs.display === 'none' ? 0 : (parseFloat(cs.width) || 0);
  return { id: w.id, tier: bar.getAttribute('data-warmth-tier'), frac: parseFloat(bar.style.getPropertyValue('--warmth-frac')), width, barW: bar.clientWidth, bg: cs.backgroundColor, content: cs.content,
    band: width > 0.5, title: bar.getAttribute('title'), tip: bar.hasAttribute('data-warmth-tip'), blink: af.animationName, waiting: w.element.classList.contains('window-waiting') }; })()`;
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

// the tier matrix (TTL 1 h unless said): the plan for k → its expected tier
const M = (min) => min * 60e3;
const MATRIX = { 0: { agoMs: M(5) }, 1: { agoMs: M(25) }, 2: { agoMs: M(45) }, 3: { agoMs: M(55) }, 4: { agoMs: M(65) }, 5: { agoMs: 120e3, ttl: 300 }, 6: { agoMs: M(2), lost: true }, 7: { del: true } };
const WANT = { 0: 'fresh', 1: 'mid', 2: 'late', 3: 'critical', 4: 'expired', 5: 'mid', 6: 'expired', 7: 'unknown' };
const planOf = (byK) => Object.fromEntries(Object.entries(byK).map(([k, v]) => [SIDS[k], v]));
const fracOf = (pl) => { const ttl = (pl.ttl || 3600) * 1000; return pl.lost ? 0 : Math.max(0, (ttl - pl.agoMs) / ttl); };
let PLAN_K = {};
const plan = (byK) => { PLAN_K = byK; setPlan(planOf(byK)); };

await step('① the real road (no rewrite): a stub turn stamps the conversation; the hub\'s own answer carries it', async () => {
  await attach([0]);
  await nextTick(1);
  const raw = RW.lastRaw;
  check('the UNREWRITTEN answer carries `warmth[<the conversation>]` and `serverNow` (TTL 3600: a scratch hub, no account ⇒ the subscription TTL)',
    !!raw && raw.serverNow > 0 && !!raw.warmth[SIDS[0]] && raw.warmth[SIDS[0]].cacheTtlSec === 3600 && raw.warmth[SIDS[0]].lastRequestAt > 0, raw && { serverNow: raw.serverNow, entry: raw.warmth[SIDS[0]], n: Object.keys(raw.warmth).length });
  check('…every one of the 14 stamped conversations is in it (each ran one stub turn)', !!raw && SIDS.every((s) => !!raw.warmth[s]), raw && SIDS.filter((s) => !raw.warmth[s]));
  const b = await evalJs(BAR(0));
  check('its title bar is FRESH and the band ≈ the bar\'s width × frac (±2 px)', b && b.tier === 'fresh' && b.band && near(b.width, b.barW * b.frac) && b.frac > 0.9, b);
  check('…the bar\'s hover words are warmthTitle\'s («Cache: about N min left · last request HH:MM»)', b && /^Cache: about \d+ min left · last request \d\d:\d\d$/.test(b.title || '') && b.tip, b && b.title);
  check('the summary chip beside For-you is up', await evalJs(`!!document.getElementById('taskbar-warmth')`));
});

await step('② the tier matrix (the CDP rewrite of EXISTING entries)', async () => {
  await attach([0, 1, 2, 3, 4, 5, 6, 7]);
  await evalJs(`app.wm.applyLayout('grid-2-4')`); await sleep(500);
  plan(MATRIX);
  await nextTick(2);
  const bars = {};
  for (const k of Object.keys(WANT)) bars[k] = await evalJs(BAR(+k));
  for (const [k, want] of Object.entries(WANT)) {
    const b = bars[k], live = ['fresh', 'mid', 'late', 'critical'].includes(want), pl = MATRIX[k];
    if (live) check(`${nameOf(+k)} (${pl.ttl === 300 ? '5-min credits, 3 min left' : `${pl.agoMs / 60e3} min ago`}): tier ${want}; the band ≈ bar × frac (±2 px), frac ≈ the plan's`,
      b && b.tier === want && b.band && near(b.width, b.barW * b.frac) && b.frac <= fracOf(pl) + 0.01 && b.frac >= fracOf(pl) - (pl.ttl === 300 ? 0.08 : 0.01), { b, planFrac: fracOf(pl) });
    else check(`${nameOf(+k)} (${want === 'unknown' ? 'entry deleted ⇒ unknown' : pl.lost ? 'an account move after the last request' : '65 min ago'}): NO band, no tier attribute`, b && !b.band && !b.tier, b);
  }
  check('hover words (en): live «Cache: about N min left · last request HH:MM» (critical 55 min ago ⇒ «about 5 min»), expired «Cache expired · last request HH:MM», the move its own sentence, unknown none',
    /^Cache: about 5 min left · last request \d\d:\d\d$/.test(bars[3].title || '') && /^Cache: about 35 min left/.test(bars[1].title || '') && /^Cache expired · last request \d\d:\d\d$/.test(bars[4].title || '') && bars[4].tip
    && /^Cache expired — the conversation moved to another account · last request \d\d:\d\d$/.test(bars[6].title || '') && !bars[7].title && !bars[7].tip, [3, 1, 4, 6, 7].map((k) => bars[k].title));
  // the taskbar ring's arc: stroke-dasharray: calc(var(--warmth-frac) * 100) 100 over pathLength 100 (UNVERIFIED in the brief — measured here)
  const rings = await evalJs(`[1, 2, 4].map((k) => { const w = [...app.wm.windows.values()].find((x) => app.sessions.get(x.id)?.sessionId === ${J(SIDS)}[k]); const r = document.querySelector('#taskbar-items .taskbar-item[data-win-id="' + w.id + '"] > .taskbar-icon > .warmth-ring'); const c = r && r.querySelector('circle');
    return r ? { tier: r.getAttribute('data-warmth-tier'), frac: parseFloat(r.style.getPropertyValue('--warmth-frac')), dash: getComputedStyle(c).strokeDasharray, stroke: getComputedStyle(c).stroke } : null; })`);
  const dash0 = (x) => parseFloat((String(x && x.dash).match(/-?\d+(?:\.\d+)?/) || [NaN])[0]); // Chrome serialises it «calc(58.2px), 100px»
  check('the tile rings: Chrome honours calc() in stroke-dasharray — the arc = frac × 100 of the circle (mid / late partial), the expired tile a FULL ring in --warmth-expired',
    rings[0]?.tier === 'mid' && near(dash0(rings[0]), rings[0].frac * 100, 1) && rings[1]?.tier === 'late' && near(dash0(rings[1]), rings[1].frac * 100, 1) && rings[1].frac < 0.3 && rings[2]?.tier === 'expired' && near(dash0(rings[2]), 100, 1), rings);
  await bothThemes('A-desktop-10-matrix');
  // zh: the dictionary is chosen once at module load ⇒ the language set before a reload
  const { identifier } = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });
  await load(1280, 800); await attach([0, 1, 2, 3, 4, 5, 6, 7]); await evalJs(`app.wm.applyLayout('grid-2-4')`); await nextTick(1);
  const z = {}; for (const k of [3, 4, 6, 7]) z[k] = await evalJs(BAR(k));
  check('hover words (zh, after a reload in zh): «缓存还剩约 5 分钟 · 上次请求 HH:MM», «缓存已过期 · 上次请求 HH:MM», «缓存已过期 — 对话已换到另一个账号 · 上次请求 HH:MM», unknown none',
    /^缓存还剩约 [45] 分钟 · 上次请求 \d\d:\d\d$/.test(z[3].title || '') && /^缓存已过期 · 上次请求 \d\d:\d\d$/.test(z[4].title || '') && /^缓存已过期 — 对话已换到另一个账号 · 上次请求 \d\d:\d\d$/.test(z[6].title || '') && !z[7].title, [3, 4, 6, 7].map((k) => z[k].title));
  await shot('A-desktop-10-matrix-zh-dark');
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  await load(1280, 800); await attach([0, 1, 2, 3, 4, 5, 6, 7]); await evalJs(`app.wm.applyLayout('grid-2-4')`); await nextTick(1);
  check('…back in en after the next reload', /^Cache: about/.test((await evalJs(BAR(3)))?.title || ''));
});

await step('③ the blink over a critical band (the blink is untouched)', async () => {
  const before = await evalJs(BAR(3));
  await evalJs(`${winOf(3)}.element.classList.add('window-waiting'), 1`); await sleep(300);
  const b = await evalJs(BAR(3));
  check('a critical window that also waits: ::after still runs the blink (blink-fade) AND ::before keeps its width and colour',
    b && b.blink === 'blink-fade' && b.band && near(b.width, before.width, 1) && b.bg === before.bg && b.tier === 'critical', { before: before && [before.width, before.bg], after: b && [b.width, b.bg, b.blink] });
  const r = await evalJs(`(() => { const r = ${winOf(3)}.titleBar.getBoundingClientRect(); return { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: r.width + 16, height: r.height + 16 }; })()`);
  await bothThemes('A-desktop-10-blink-critical-closeup', r);
  await evalJs(`${winOf(3)}.element.classList.remove('window-waiting'), 1`);
});

await step('⑥ the «+N» chip: the worst tier it hides, in words, stable across ticks and a focus click', async () => {
  await attach([8, 9]);
  plan({ ...MATRIX, 8: { agoMs: M(56) }, 9: { agoMs: M(57) } });
  const CHIP = `(() => { const c = document.getElementById('taskbar-overflow'); if (!c) return null; const ids = c._hiddenIds || []; const tierOf = (id) => { const w = app.wm.windows.get(id); return w ? (w.titleBar.getAttribute('data-warmth-tier') || null) : null; };
    return { shown: !c.hidden, text: c.textContent, n: ids.length, dot: c.querySelector('.wsum-dot')?.getAttribute('data-warmth-tier') || null, crit: ids.filter((id) => tierOf(id) === 'critical').length, ids }; })()`;
  const per = [];
  for (const [w, h] of [[1100, 700], [951, 585], [1024, 600], [1280, 640]]) {
    await device(w, h); await sleep(700); await nextTick(1);
    const a = await evalJs(CHIP);
    await nextTick(1);
    const b = await evalJs(CHIP);
    let c = b;
    if (w === 1100) { // a focus click on a visible (not the active) tile between the ticks: the words survive the refit
      const at = await evalJs(`(() => { const s = document.getElementById('taskbar-items').getBoundingClientRect(); const t = [...document.querySelectorAll('#taskbar-items .taskbar-item')].find((e) => { const r = e.getBoundingClientRect(); return r.right <= s.right && !e.classList.contains('active'); }); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (at) { for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 }); }
      await sleep(400); await nextTick(1); c = await evalJs(CHIP);
      check(`1100 px, 10 conversations: «+N · k critical» with the critical dot (k = the hidden critical tiles) — «${a && a.text}»`,
        a && a.shown && a.dot === 'critical' && a.text === `+${a.n} · ${a.crit} critical` && a.crit >= 1, a);
      check('…the same words across two ticks and a focus click on a visible tile between them (the refit settles)', a && b && c && a.text === b.text && b.text === c.text && !!at, { a: a && a.text, b: b && b.text, c: c && c.text, clicked: !!at });
      await shot('A-desktop-12-plusN-1100-dark', { x: 0, y: h - 60, width: w, height: 60 });
    }
    per.push({ vp: `${w}x${h}`, shown: a && a.shown, a: a && a.text, b: b && b.text, c: c && c.text });
  }
  console.log('    «+N» per viewport: ' + J(per));
  check('…at desktop-small\'s four viewports (951 / 1024 / 1100 / 1280) the chip\'s words hold across ticks (a shown chip names the dot\'s tier)', per.every((p) => p.a === p.b && p.b === p.c && (!p.shown || /^\+\d+( · \d+ (critical|expired))?$/.test(p.a))), per);
  // r2 (H3): the floor exists so a tile keeps «an icon and a readable word» (taskbar-fit.js) — the title characters a 90-px
  // tile shows, warmth on vs off (the same window): the probe counts the characters left of the ellipsis
  const FLOOR = `(() => { const out = {}, s = document.getElementById('taskbar-items').getBoundingClientRect(), cv = document.createElement('canvas').getContext('2d');
    for (const tile of document.querySelectorAll('#taskbar-items > .taskbar-item[data-win-id]')) { const r = tile.getBoundingClientRect(); if (r.width > 91.5 || r.left < s.left - 0.5 || r.right > s.right + 0.5) continue;
      const el = tile.querySelector('.taskbar-title'), tn = el && el.firstChild; if (!tn || tn.nodeType !== 3) continue;
      const box = el.getBoundingClientRect(); cv.font = getComputedStyle(el).font; const over = el.scrollWidth > el.clientWidth + 0.5;
      const edge = box.left + el.clientWidth - (over ? cv.measureText('\\u2026').width : 0) + 0.5, rg = document.createRange(); let n = 0;
      for (let i = 0; i < tn.data.length; i++) { rg.setStart(tn, i); rg.setEnd(tn, i + 1); if (rg.getBoundingClientRect().right <= edge) n++; else break; }
      out[tile.dataset.winId] = { n, shown: tn.data.slice(0, n), tileW: Math.round(r.width * 10) / 10, titleW: el.clientWidth, ring: !!tile.querySelector('.warmth-ring') }; }
    return out; })()`;
  const floor = { on: {}, off: {} };
  for (const w of [951, 1024, 1100]) { await device(w, 640); await sleep(700); floor.on[w] = await evalJs(FLOOR); }
  await evalJs(`app.settings.set('desktop.cacheWarmth', false), 1`); await sleep(1300); await nextTick(1);
  for (const w of [951, 1024, 1100]) { await device(w, 640); await sleep(700); floor.off[w] = await evalJs(FLOOR); }
  await evalJs(`app.settings.set('desktop.cacheWarmth', true), 1`); await sleep(1300); await nextTick(1);
  const cmp = [951, 1024, 1100].map((w) => { const ids = Object.keys(floor.on[w]).filter((id) => floor.off[w][id]);
    return { w, tiles: ids.length, rings: ids.filter((id) => floor.on[w][id].ring).length, titleW: ids.map((id) => [floor.on[w][id].titleW, floor.off[w][id].titleW]), on: ids.map((id) => floor.on[w][id].shown), off: ids.map((id) => floor.off[w][id].shown), same: ids.every((id) => floor.on[w][id].n === floor.off[w][id].n) }; });
  console.log('    the 90-px floor — title characters shown per tile, warmth ON vs OFF (the same windows): ' + J(cmp));
  check(`H3: at the 90-px floor (951 / 1024 / 1100, 10 windows) every tile shows the SAME title characters with warmth on and off — the ring rides the icon's corner (${cmp.map((c) => c.rings).join(' / ')} ringed floor tiles)`,
    cmp.every((c) => c.tiles > 0 && c.rings > 0 && c.same), cmp);
  await device(951, 640); await sleep(700); await nextTick(1);
  await bothThemes('A-desktop-12-floor-951', { x: 0, y: 640 - 60, width: 951, height: 60 });
  // RED: the r1 DOM re-planted — each ring moved back to its tile's first flex child (12 px + the 6-px gap) ⇒ fewer characters
  const red = await evalJs(`(() => { for (const r of document.querySelectorAll('#taskbar-items .taskbar-icon > .warmth-ring')) r.closest('.taskbar-item').prepend(r); return ${FLOOR}; })()`);
  await evalJs(`(() => { for (const r of document.querySelectorAll('#taskbar-items > .taskbar-item > .warmth-ring')) r.parentElement.querySelector(':scope > .taskbar-icon, :scope > .taskbar-icon-stack')?.prepend(r); return 1; })()`);
  const rid = Object.keys(red).filter((id) => red[id].ring && floor.off[951][id]);
  console.log('    RED (the r1 ring in the flow) at 951 — shown OFF vs r1-ON: ' + J(rid.map((id) => [floor.off[951][id].shown, red[id].shown])));
  check('RED: the r1 DOM re-planted (the ring a flex child before the icon) ⇒ the probe counts FEWER characters on a ringed floor tile', rid.length > 0 && rid.some((id) => red[id].n < floor.off[951][id].n), rid.map((id) => [floor.off[951][id].n, red[id].n]));
  await device(1280, 800); await sleep(600);
  await evalJs(`app.wm.applyLayout('grid-2-4')`);
});

/** a tab group's strip as the page draws it: per tab its band (computed), the tab's width, its label's words */
const TABS = `(() => { const host = [...app.wm.windows.values()].find((w) => w._tabChain && w._tabChain.tabs[0] === w.id && w._tabChain.tabs.length >= 4); if (!host) return null;
  const sid = (id) => app.sessions.get(id)?.sessionId; const hb = getComputedStyle(host.titleBar, '::before');
  return { hostId: host.id, hostBefore: hb.content, hostTier: host.titleBar.getAttribute('data-warmth-tier'), hostTitle: host.titleBar.getAttribute('title'),
    tabs: [...host.titleBar.querySelectorAll('.tab-item[data-win-id]')].map((t) => { const b = t.querySelector(':scope > .tab-warmth'); const cs = b ? getComputedStyle(b) : null;
      return { sid: sid(t.dataset.winId), tier: b?.getAttribute('data-warmth-tier') || null, frac: b ? parseFloat(b.style.getPropertyValue('--warmth-frac')) : null, band: !!b && cs.display !== 'none' && parseFloat(cs.width) > 0.5, width: b ? parseFloat(cs.width) || 0 : 0, first: t.firstElementChild === b, tabW: t.clientWidth,
        label: t.querySelector('.tab-label')?.getAttribute('title') || null, waiting: t.classList.contains('waiting'), active: t.classList.contains('active') }; }) }; })()`;
const kOfSid = (sid) => SIDS.indexOf(sid);

await step('④ a tab group: each tab its own band, no frame band', async () => {
  plan(MATRIX);
  await evalJs(`(() => { const w = (k) => [...app.wm.windows.values()].find((x) => app.sessions.get(x.id)?.sessionId === ${J(SIDS)}[k]);
    app.wm.createTabChain(w(0), w(3)); const ch = w(0)._tabChain; app.wm.addToTabChain(ch, w(4)); app.wm.addToTabChain(ch, w(2)); app.wm.switchTab(ch, ch.tabs.indexOf(w(0).id));
    w(2).element.classList.add('window-waiting'); app.updateTaskbar(); return ch.tabs.length; })()`);
  await nextTick(1);
  const g = await evalJs(TABS);
  const by = Object.fromEntries((g?.tabs || []).map((x) => [kOfSid(x.sid), x]));
  check('four tabs: active fresh (研究 1), hidden critical, hidden expired, hidden late + waiting', g && g.tabs.length === 4 && by[0]?.active && by[2]?.waiting, g);
  check('each live tab carries ITS OWN band, the tab\'s first child, its length ∝ the TAB\'s width × its frac (±2 px), in its own tier',
    [0, 3, 2].every((k) => by[k] && by[k].band && by[k].first && by[k].tier === WANT[k] && near(by[k].width, by[k].tabW * by[k].frac)), [0, 3, 2].map((k) => by[k]));
  check('…the expired tab has NO band node', by[4] && by[4].tier === null && !by[4].band, by[4]);
  check('…and the frame draws none: the host bar\'s ::before computes content none (the :has guard), it carries no tier and no words', g && g.hostBefore === 'none' && !g.hostTier && !g.hostTitle, g && [g.hostBefore, g.hostTier, g.hostTitle]);
  check('each tab\'s LABEL carries the hover words (the expired one «Cache expired · …»)', [0, 3, 2].every((k) => /^Cache: about \d+ min left/.test(by[k]?.label || '')) && /^Cache expired · last request/.test(by[4]?.label || ''), [0, 3, 2, 4].map((k) => by[k]?.label));
  await evalJs(`(() => { const ch = ${winOf(0)}._tabChain; app.wm.switchTab(ch, 1); return 1; })()`); await sleep(200);
  const g2 = await evalJs(TABS);
  check('…after a switch (_markStrip owns tab.title) the label words stand', g2 && g2.tabs.every((x) => !!x.label), g2 && g2.tabs.map((x) => x.label));
  const polls = RW.polls, wrap0 = await evalJs(`!!app.settings.get('window.tabWrap')`);
  await evalJs(`app.settings.set('window.tabWrap', ${!wrap0}), 1`); await sleep(400);
  const g3 = await evalJs(TABS);
  check('a strip REBUILD (window.tabWrap toggled) brings every band back with NO tick (makeTab re-applies from the map)',
    RW.polls === polls && g3 && [0, 3, 2].every((k) => g3.tabs.find((x) => kOfSid(x.sid) === k)?.band), { pollsBetween: RW.polls - polls, tabs: g3 && g3.tabs.map((x) => [kOfSid(x.sid), x.band]) });
  await evalJs(`app.settings.set('window.tabWrap', ${wrap0}), 1`); await sleep(300);
  const RING = `(document.querySelector('#taskbar-items .taskbar-group .warmth-ring')?.getAttribute('data-warmth-tier') || null)`;
  check('the group tile\'s ring = the worst LIVE tier over its tabs: critical (the expired tab never outranks it)', (await evalJs(RING)) === 'critical', await evalJs(RING));
  plan({ ...MATRIX, 0: { agoMs: M(70) }, 2: { agoMs: M(70) }, 3: { agoMs: M(70) } });
  await nextTick(2);
  check('…every tab expired ⇒ the ring is the expired ring', (await evalJs(RING)) === 'expired', await evalJs(RING));
  plan(MATRIX); await nextTick(2);
  // the chooser: a press on the group's tile while the group is in front (headless Chrome has no hovering pen / mouse intent)
  for (let i = 0; i < 2 && !(await evalJs(`!!document.querySelector('.taskbar-group-chooser')`)); i++) { await click('#taskbar-items .taskbar-group'); await sleep(400); }
  await waitFor(`document.querySelectorAll('.taskbar-group-chooser .overlap-switcher-item').length === 4`, 4000);
  const rows = await evalJs(`[...document.querySelectorAll('.taskbar-group-chooser .overlap-switcher-item')].map((r) => ({ sid: app.sessions.get(r.dataset.winId)?.sessionId, ring: r.firstElementChild?.matches('.warmth-ring') ? r.firstElementChild.getAttribute('data-warmth-tier') : null }))`);
  check('the hover chooser: each row carries its own tab\'s ring (fresh / critical / expired / late)', rows.length === 4 && rows.every((r) => r.ring === WANT[kOfSid(r.sid)]), rows);
  await evalJs(`(app.wm.revealWindow(${winOf(0)}.id), app.wm.applyLayout('maximize'), 1)`); await sleep(500); // the group's frame at full size for the shots
  if (!(await evalJs(`!!document.querySelector('.taskbar-group-chooser')`))) { for (let i = 0; i < 2 && !(await evalJs(`!!document.querySelector('.taskbar-group-chooser')`)); i++) { await click('#taskbar-items .taskbar-group'); await sleep(400); } }
  await bothThemes('A-desktop-14-tabs-chooser');
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 300 }); await sleep(900);
  await evalJs(`document.querySelectorAll('[data-popover]').forEach((p) => p.remove()), 1`);
  await evalJs(`(() => { const ch = ${winOf(0)}._tabChain; app.wm.switchTab(ch, ch.tabs.indexOf(${winOf(0)}.id)); return 1; })()`); await sleep(300);
  await bothThemes('A-desktop-14-tabs');
  await evalJs(`(app.wm.bindSplit(${winOf(0)}, ${winOf(3)}), 1)`); await sleep(500);
  const sp = await evalJs(`[...document.querySelectorAll('.tab-item.tab-pane')].map((t) => ({ pane: getComputedStyle(t, '::before').backgroundColor, paneH: getComputedStyle(t, '::before').height, band: !!t.querySelector(':scope > .tab-warmth'), bandW: t.querySelector(':scope > .tab-warmth') ? parseFloat(getComputedStyle(t.querySelector(':scope > .tab-warmth')).width) : 0, tabW: t.clientWidth }))`);
  console.log('    split panes (the 2 px pane underline vs the band over it): ' + J(sp));
  check('a split: both panes still carry their own band over the pane underline', sp.length === 2 && sp.every((p) => p.band), sp);
  await bothThemes('A-desktop-14-tabs-split');
  await evalJs(`app.wm.applyLayout('grid-2-4')`); await sleep(400);
});

await step('RED controls — the probes can see ABSENCE', async () => {
  const b0 = await evalJs(BAR(1)), t0 = await evalJs(TABS);
  await evalJs(`(() => { const s = document.createElement('style'); s.id = '__red'; s.textContent = '.window-titlebar::before{display:none!important}.tab-warmth{display:none!important}'; document.head.appendChild(s); return 1; })()`);
  const b1 = await evalJs(BAR(1)), t1 = await evalJs(TABS);
  check('RED: with the band hidden by a planted style the ① frame probe reports it ABSENT (it reported it present a moment before)', b0?.band && b1 && !b1.band, [b0?.band, b1?.band]);
  check('RED: …and the ④ tab probes report every tab band ABSENT', t0 && t0.tabs.some((x) => x.band) && t1 && t1.tabs.every((x) => !x.band), t1 && t1.tabs.map((x) => x.band));
  await evalJs(`document.getElementById('__red').remove(), 1`);
  check('…the style removed: present again', (await evalJs(BAR(1)))?.band === true);
  plan({ ...MATRIX, 1: { agoMs: M(65) } }); await nextTick(2);
  const b2 = await evalJs(BAR(1));
  check('RED: one window rewritten to expired ⇒ its probe reports NO band where it reported one a tick before', b0?.band && b2 && !b2.band && !b2.tier, [b0?.tier, b2?.tier, b2?.band]);
  plan(MATRIX); await nextTick(2);
});

const DESKS = {};
const PREVIEWS = `(() => { const dm = app.desktopManager; const root = document.getElementById('desktop-previews'); const sid = (id) => app.sessions.get(id)?.sessionId || (app._warmth?.held.get(id)?.id) || null;
  const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;background:var(--text-dim);color:var(--yellow)'; document.body.appendChild(probe); const dim = getComputedStyle(probe).backgroundColor; probe.style.background = 'var(--yellow)'; const yellow = getComputedStyle(probe).backgroundColor; probe.remove();
  return { form: root.classList.contains('desktop-previews-compact') ? 'compact' : 'full', dim, yellow, active: dm.activeDesktopId,
    previews: [...root.querySelectorAll('.desktop-preview[data-desktop-id]')].map((p) => ({ desk: p.dataset.desktopId, tier: p.getAttribute('data-warmth-tier'), outline: getComputedStyle(p).outlineStyle, outlineColor: getComputedStyle(p).outlineColor,
      squares: [...p.querySelectorAll('.desktop-preview-win[data-win-id]')].map((q) => ({ id: q.dataset.winId, sid: sid(q.dataset.winId), tier: q.getAttribute('data-warmth-tier'), bg: getComputedStyle(q).backgroundColor, waiting: q.classList.contains('desktop-preview-win-waiting') })) })),
    button: (() => { const r = root.querySelector('.desktop-switch-compact > .warmth-ring'); return r ? r.getAttribute('data-warmth-tier') : null; })(),
    chip: (() => { const c = document.getElementById('taskbar-overflow'); return c ? { shown: !c.hidden, text: c.textContent } : null; })(),
    summary: document.getElementById('taskbar-warmth')?.textContent || null }; })()`;
const FORMS = {};

await step('⑤ desktops: the squares, three adjacent preview rings, the folded button, a reload', async () => {
  await attach([10, 11, 12, 13]);
  plan({ ...MATRIX, 8: { agoMs: M(45) }, 9: { agoMs: M(5) }, 10: { agoMs: M(25) }, 11: { agoMs: M(5) }, 12: { agoMs: M(5) }, 13: { agoMs: M(5) } });
  const ids = await evalJs(`(() => { const dm = app.desktopManager; const d1 = dm.activeDesktopId; const d2 = dm.createDesktop(), d3 = dm.createDesktop(), d4 = dm.createDesktop(); return { d1, d2, d3, d4 }; })()`);
  Object.assign(DESKS, ids);
  for (const [k, d] of [[8, 'd2'], [9, 'd2'], [10, 'd3'], [11, 'd3'], [12, 'd4'], [13, 'd4']]) await evalJs(`(app.desktopManager.moveWindowToDesktop(${winOf(k)}.id, ${J(DESKS[d])}), 1)`);
  await evalJs(`app.desktopManager.switchTo(${J(DESKS.d1)})`); await sleep(500);
  await evalJs(`app.wm.applyLayout('grid-2-4')`);
  await nextTick(2);
  const p = await evalJs(PREVIEWS);
  const pv = Object.fromEntries((p.previews || []).map((x) => [x.desk, x]));
  check('each preview\'s ring = its desktop\'s WORST LIVE tier: critical (the group) · late · mid · none for the all-fresh desktop',
    pv[DESKS.d1]?.tier === 'critical' && pv[DESKS.d2]?.tier === 'late' && pv[DESKS.d3]?.tier === 'mid' && !pv[DESKS.d4]?.tier && pv[DESKS.d1]?.outline === 'solid' && pv[DESKS.d4]?.outline !== 'solid', p.previews?.map((x) => [x.desk, x.tier, x.outline]));
  const sq = (k) => (p.previews || []).flatMap((x) => x.squares).find((s) => s.sid === SIDS[k]);
  check('the squares carry their tier (another desktop\'s too: late / fresh / mid)', sq(8)?.tier === 'late' && sq(9)?.tier === 'fresh' && sq(10)?.tier === 'mid' && sq(1)?.tier === 'mid', [8, 9, 10, 1].map((k) => sq(k)?.tier));
  check('an EXPIRED square computes --text-dim\'s colour (visible, as drawn), not the faint border token', sq(6)?.tier === 'expired' && sq(6)?.bg === p.dim, { sq: sq(6), dim: p.dim });
  check('a WAITING square still computes the yellow (the blink wins over the tier)', sq(2)?.waiting && sq(2)?.bg === p.yellow, { sq: sq(2), yellow: p.yellow });
  for (const [w, h] of [[1280, 800], [1100, 700]]) { await device(w, h); await sleep(700); await nextTick(1); const q = await evalJs(PREVIEWS); FORMS[`on-${w}`] = { form: q.form, chip: q.chip, summary: q.summary }; }
  // the same state with warmth OFF (the live flip): does the summary chip fold the previews / cut a tile?
  await evalJs(`app.settings.set('desktop.cacheWarmth', false), 1`); await sleep(1300); await nextTick(1);
  for (const [w, h] of [[1280, 800], [1100, 700]]) { await device(w, h); await sleep(700); const q = await evalJs(PREVIEWS); FORMS[`off-${w}`] = { form: q.form, chip: q.chip, summary: q.summary }; }
  await evalJs(`app.settings.set('desktop.cacheWarmth', true), 1`); await sleep(1300); await nextTick(1);
  console.log('    the switcher form and «+N», 4 desktops, 10 windows on this one — warmth ON vs OFF: ' + J(FORMS));
  // r2 (H4): while warmth is drawn the verdict budgets the warm «+N» chip's longest form (OVERFLOW_CHIP_WARM_PX) — at 1100 px
  // with 4 desktops that folds the previews (r1's 48-px budget kept them full and left the strip 3 whole tiles: ⑧b)
  check(`the previews: full at 1280 on and off and at 1100 off; at 1100 on the warm chip's budget decides — ${FORMS['on-1100']?.form}`, ['on-1280', 'off-1280', 'off-1100'].every((k) => FORMS[k]?.form === 'full') && ['full', 'compact'].includes(FORMS['on-1100']?.form), FORMS);
  await device(1280, 800); await sleep(600); await nextTick(1);
  const r = await evalJs(`(() => { const r = document.getElementById('desktop-previews').getBoundingClientRect(); return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6), width: r.width + 12, height: r.height + 12 }; })()`);
  await bothThemes('A-desktop-11-previews-rings', r);
  await bothThemes('A-desktop-11-desktops');
  // a reload: the other desktops come back held (unbuilt) or built — their squares and counts resolve either way
  const before = await evalJs(`document.getElementById('taskbar-warmth')?.textContent || null`);
  // each desktop visited once (its record captured), then back; the records reach the hub (the layout's own save)
  for (const d of ['d2', 'd3', 'd4', 'd1']) {
    await evalJs(`app.desktopManager.switchTo(${J(DESKS[d])})`); await sleep(900);
    // r2 (H2): a tab group on d2 and on d3 — its host the FRESH conversation, its guest the worse one (the host's own tier ≠
    // the group's worst); d2's is built again when ⑦ goes there, d3's stays held
    if (d === 'd2' || d === 'd3') { const [h, g] = d === 'd2' ? [9, 8] : [11, 10]; await evalJs(`(app.wm.createTabChain(${winOf(h)}, ${winOf(g)}), 1)`); await sleep(500); }
  }
  await sleep(4000);
  await load(1280, 800); await nextTick(2);
  const held = await evalJs(`[...(app._warmth?.held || new Map())].map(([id, h]) => ({ id, desk: h.deskId, conv: h.id, rung: h.rung }))`);
  const built = await evalJs(`[8, 9, 10, 11, 12, 13].map((k) => !![...app.wm.windows.values()].find((w) => app.sessions.get(w.id)?.sessionId === ${J(SIDS)}[k]))`);
  console.log(`    after the reload: other desktops' windows built here: ${J(built)}; held records: ${J(held)}`);
  const q = await evalJs(PREVIEWS);
  const after = q.summary;
  const pv2 = Object.fromEntries((q.previews || []).map((x) => [x.desk, x]));
  check(`after a reload the other desktops' conversations still resolve (${held.length} held, rung ${[...new Set(held.map((h) => h.rung))].join('/') || '—'}; ${built.filter(Boolean).length} built): rings late / mid, every square there carries a tier, the summary's counts unchanged`,
    pv2[DESKS.d2]?.tier === 'late' && pv2[DESKS.d3]?.tier === 'mid' && [DESKS.d2, DESKS.d3, DESKS.d4].every((d) => (pv2[d]?.squares || []).length > 0 && pv2[d].squares.every((s) => !!s.tier)) && held.every((h) => h.rung !== 'none') && after === before,
    { before, after, rings: q.previews?.map((x) => [x.desk, x.tier, x.squares.map((s) => s.tier)]) });
  await attach([0, 1, 2, 3, 4, 5, 6, 7]);
});

const ROWS = (sel) => `[...document.querySelectorAll(${J(sel)})].map((r) => ({ id: r.dataset.winId || null, desk: r.dataset.desktopId || null, sid: app.sessions.get(r.dataset.winId)?.sessionId || app._warmth?.held.get(r.dataset.winId)?.id || null,
  tabs: (app.wm.windows.get(r.dataset.winId)?._tabChain?.tabs || []).map((t) => app.sessions.get(t)?.sessionId || null), band: !!r.querySelector(':scope > .wl-band'), tier: r.querySelector(':scope > .wl-band')?.getAttribute('data-warmth-tier') || null, frac: r.querySelector(':scope > .wl-band')?.style.getPropertyValue('--warmth-frac') || '', left: r.querySelector(':scope > .wl-left')?.textContent || '' }))`;
/** the plan's time left for conversation k now (live), or a rank for expired / unknown */
const leftOfK = (k) => { const pl = PLAN_K[k]; if (!pl) return 3600e3 - 60e3; if (pl.del) return Infinity; if (pl.lost) return 1e12; const ttl = (pl.ttl || 3600) * 1000; return pl.agoMs >= ttl ? 1e12 : ttl - pl.agoMs; };

await step('⑦ the summary chip and its list (every desktop, by time left)', async () => {
  plan(PLAN_K); await nextTick(2); // re-anchored: the 5-min credits conversation reads the plan's tier, not one ⑤'s minutes aged
  const tiers = SIDS.map((s, k) => (PLAN_K[k] ? WANT[k] || (PLAN_K[k].agoMs >= M(50) ? 'critical' : PLAN_K[k].agoMs >= M(40) ? 'late' : PLAN_K[k].agoMs >= M(20) ? 'mid' : 'fresh') : 'fresh'));
  const truth = { critical: tiers.filter((x) => x === 'critical').length, late: tiers.filter((x) => x === 'late').length, expired: tiers.filter((x) => x === 'expired').length, known: tiers.filter((x) => x !== 'unknown').length };
  const chip = await evalJs(`(() => { const c = document.getElementById('taskbar-warmth'); if (!c) return null; const r = c.getBoundingClientRect(); return { text: c.textContent, h: r.height, segs: [...c.querySelectorAll('.wsum-seg')].map((s) => s.textContent), dots: [...c.querySelectorAll('.wsum-dot')].map((d) => d.getAttribute('data-warmth-tier')), nextIsForYou: c.nextElementSibling?.id === 'taskbar-user-todos', title: c.title }; })()`);
  check(`the chip's counts = the rewrite's ground truth (critical ${truth.critical} · late ${truth.late} · expired ${truth.expired} / ${truth.known}; the unknown one is not counted) — «${chip && chip.text}»`,
    chip && chip.segs.join('|') === `Going cold ${truth.critical}|Late ${truth.late}|Expired ${truth.expired}` && chip.text.endsWith(`/ ${truth.known}`) && chip.dots.join(',') === 'critical,late,expired', { chip, truth });
  check('…it sits beside For-you, ≥ 24 px tall, with its words in the title', chip && chip.nextIsForYou && chip.h >= 24 && /^Prompt-cache warmth on every desktop/.test(chip.title), chip);
  await click('#taskbar-warmth');
  await waitFor(`!!document.querySelector('.warmth-list .overlap-switcher-item')`, 3000);
  const L = '.warmth-list .overlap-switcher-item';
  const rows = await evalJs(ROWS(L));
  const ks = rows.map((r) => kOfSid(r.sid));
  const lefts = ks.map(leftOfK);
  check(`the list: one row per known conversation (${rows.length}), «By time left» pressed, ascending, expired last, the unknown one absent`,
    rows.length === truth.known && (await evalJs(`document.querySelector('.warmth-list .wl-sort')?.getAttribute('aria-pressed')`)) === 'true' && !ks.includes(7) && lefts.every((x, i) => i === 0 || x >= lefts[i - 1]) && rows.every((r) => r.band), { ks, lefts: lefts.map((x) => (x > 1e11 ? 'expired' : Math.round(x / 1000))) });
  check('…each row says its time («N min left» / «Expired»)', rows.every((r) => /^\d+ min left$|^Expired$/.test(r.left)), rows.map((r) => r.left));
  await bothThemes('A-desktop-12-summary-list');
  await click('.warmth-list .wl-sort');
  const g = await evalJs(ROWS(L));
  const order = await evalJs(`app.desktopManager.desktops.map((d) => d.id)`);
  const di = g.map((r) => order.indexOf(r.desk));
  check('one press groups the rows by desktop, in the desktops\' order', (await evalJs(`document.querySelector('.warmth-list .wl-sort')?.getAttribute('aria-pressed')`)) === 'false' && di.every((x, i) => x >= 0 && (i === 0 || x >= di[i - 1])), di);
  await click('.warmth-list .wl-sort');
  const other = (await evalJs(ROWS(L))).find((r) => kOfSid(r.sid) === 8);
  const ok8 = await click(`.warmth-list .overlap-switcher-item[data-win-id="${other?.id}"]`);
  await waitFor(`app.desktopManager.activeDesktopId === ${J(DESKS.d2)} && app.sessions.get(app.wm.activeWindowId)?.sessionId === ${J(SIDS[8])}`, 8000);
  const went = await evalJs(`({ desk: app.desktopManager.activeDesktopId, active: app.sessions.get(app.wm.activeWindowId)?.sessionId || null })`);
  check('a row of a conversation on ANOTHER desktop switches there and raises it (the window list\'s own jump)', ok8 && went.desk === DESKS.d2 && went.active === SIDS[8], { went, want: [DESKS.d2, SIDS[8]] });
  await evalJs(`app.desktopManager.switchTo(${J(DESKS.d1)})`); await sleep(600);
  await click('#taskbar-warmth'); await waitFor(`!!document.querySelector('.warmth-list .overlap-switcher-item')`, 3000);
  const a = await evalJs(ROWS(L)); await nextTick(1); const b = await evalJs(ROWS(L));
  check('reopened, one tick later: the band lengths moved, the row ORDER did not', a.length && a.map((r) => r.id).join() === b.map((r) => r.id).join() && a.some((r, i) => r.frac !== b[i].frac), { a: a.map((r) => r.frac), b: b.map((r) => r.frac) });
  await evalJs(`document.querySelectorAll('[data-popover]').forEach((p) => p.remove()), 1`);
});

await step('⑧ the window list: a band per row, «By time left»', async () => {
  await click('#taskbar-status');
  await waitFor(`!!document.querySelector('.overlap-switcher .wl-head')`, 3000);
  const S = '.overlap-switcher:not(.warmth-list) > .overlap-switcher-item:not(.overlap-switcher-group):not(.overlap-switcher-other)';
  const rows = await evalJs(ROWS(S));
  // a group's host row sorts by its tabs' worst (the tile's rule): the least time left among its live tabs
  const keyOf = (r) => { const ks = (r.tabs && r.tabs.length > 1 ? r.tabs : [r.sid]).map(kOfSid).filter((k) => k >= 0); if (!ks.length) return Infinity; const l = ks.map(leftOfK).filter((x) => x < 1e11); return l.length ? Math.min(...l) : Math.min(...ks.map(leftOfK)); };
  const lefts = rows.map(keyOf);
  check(`every active-desktop row carries a band and its id; «By time left» pressed; ascending (expired, then unknown last) — ${rows.length} rows`,
    rows.length > 0 && rows.every((r) => r.band && r.id) && (await evalJs(`document.querySelector('.overlap-switcher .wl-sort')?.getAttribute('aria-pressed')`)) === 'true' && lefts.every((x, i) => i === 0 || x >= lefts[i - 1]), { lefts: lefts.map((x) => (x === Infinity ? 'unknown' : x > 1e11 ? 'expired' : Math.round(x / 1000))) });
  await bothThemes('A-desktop-10-window-list');
  await click('.overlap-switcher .wl-sort');
  const plain = await evalJs(ROWS(S));
  const creation = await evalJs(`(() => { const a = app.desktopManager.activeDesktopId; return [...app.wm.windows].filter(([id, w]) => !(w._tabChain && w._tabChain.tabs[0] !== id) && !(a && w._desktopId && w._desktopId !== a)).map(([id]) => id); })()`);
  check('one press returns the rows to the creation order', plain.map((r) => r.id).join() === creation.join(), { plain: plain.map((r) => r.id), creation });
  await click('.overlap-switcher .wl-sort');
  // r2 (H1): a «name — /path» title (≥ 40 characters) never pushes a row's words past its edge — the label shrinks
  if (!(await evalJs(`!!document.querySelector('.overlap-switcher-group.open')`))) await click('.overlap-switcher-group');
  await waitFor(`!!document.querySelector('.overlap-switcher-other .wl-left')`, 3000);
  const EDGE = `[...document.querySelectorAll('.overlap-switcher:not(.warmth-list) > .overlap-switcher-item:not(.overlap-switcher-group)')].map((r) => { const l = r.querySelector(':scope > .wl-left'), lab = r.querySelector(':scope > .wl-name'), rr = r.getBoundingClientRect(), lr = l ? l.getBoundingClientRect() : null;
    return { id: r.dataset.winId, other: r.classList.contains('overlap-switcher-other'), sid: app.sessions.get(r.dataset.winId)?.sessionId || app._warmth?.held.get(r.dataset.winId)?.id || null, title: lab ? lab.textContent : null, words: l ? l.textContent : null, wordsW: lr ? Math.round(lr.width) : 0, past: lr ? Math.round((lr.right - (rr.left + r.clientLeft + r.clientWidth)) * 10) / 10 : null, cut: lab ? lab.scrollWidth > lab.clientWidth : null }; })`;
  const long = (rows) => rows.filter((r) => r.title && r.title.length >= 40 && r.title.includes('/') && kOfSid(r.sid) >= 0 && WANT[kOfSid(r.sid)] !== 'unknown');
  const e1 = long(await evalJs(EDGE));
  check(`H1: every row whose title is a «name — /path» (≥ 40 characters; ${e1.length} rows, ${e1.filter((r) => r.other).length} under «Other desktops») keeps its words whole inside the row — the label ends in an ellipsis`,
    e1.length >= 6 && e1.some((r) => r.other) && e1.every((r) => r.words && r.wordsW > 0 && r.past <= 0.5 && r.cut), e1.map((r) => [r.title.length, r.words, r.past, r.cut]));
  await bothThemes('A-desktop-10-window-list-others');
  await evalJs(`(() => { const s = document.createElement('style'); s.id = '__red'; s.textContent = '.overlap-switcher-item > .wl-name { flex: 0 0 auto !important; min-width: auto !important; }'; document.head.appendChild(s); return 1; })()`);
  const e2 = long(await evalJs(EDGE));
  await evalJs(`document.getElementById('__red').remove(), 1`);
  check('RED: the shrink rule undone by a planted style ⇒ the probe sees the words pushed past the row\'s edge', e2.length > 0 && e2.some((r) => r.past > 0.5), e2.map((r) => r.past));
  // r2 (H2): an «Other desktops» row of a tab GROUP = the group's worst, never its host's alone (r1 painted the host)
  const grp = await evalJs(`[${J(SIDS[9])}, ${J(SIDS[11])}].map((sid) => { const r = [...document.querySelectorAll('.overlap-switcher-other')].find((x) => (app.sessions.get(x.dataset.winId)?.sessionId || app._warmth?.held.get(x.dataset.winId)?.id) === sid); if (!r) return { sid, row: false };
    const id = r.dataset.winId, built = app.wm.windows.has(id), tabs = built ? (app.wm.windows.get(id)._tabChain?.tabs || []) : (app._warmth.heldChains.get(id) || []);
    return { row: true, built, tabs: tabs.length, tier: r.querySelector(':scope > .wl-band')?.getAttribute('data-warmth-tier') || null, words: r.querySelector(':scope > .wl-left')?.textContent || '', own: app._warmth.byId.get(sid)?.tier || null }; })`);
  check('H2: an «Other desktops» row of a tab GROUP = its group\'s worst — d2\'s group BUILT: late, d3\'s HELD: mid (each host alone is fresh: what r1 painted)',
    grp[0]?.row && grp[0].built && grp[0].tabs === 2 && grp[0].tier === 'late' && grp[0].own === 'fresh' && grp[1]?.row && !grp[1].built && grp[1].tabs === 2 && grp[1].tier === 'mid' && grp[1].own === 'fresh', grp);
  const pq = await evalJs(PREVIEWS);
  const sqOf = (k) => (pq.previews || []).flatMap((x) => x.squares).find((q) => q.sid === SIDS[k]);
  const drawn = (ks) => ks.map(sqOf).filter(Boolean);
  check('…and the groups\' squares take the group\'s worst: d2 (built) late, d3 (held) mid — the host\'s square too (its own tier fresh)',
    !!sqOf(9) && !!sqOf(11) && drawn([8, 9]).every((q) => q.tier === 'late') && drawn([10, 11]).every((q) => q.tier === 'mid'), [8, 9, 10, 11].map((k) => sqOf(k)?.tier || 'no square'));
  await click('.overlap-switcher-group'); // folded again, as the list opens by default
  await evalJs(`document.querySelectorAll('[data-popover]').forEach((p) => p.remove()), 1`);
});

await step('⑧b the switcher\'s «+N» room at its boundary (r2 H4): whole tiles with warmth on and off', async () => {
  const TF = await import(path.join(repo, 'src/lib/taskbar-fit.js'));
  const keep = PLAN_K; // plan() makes its argument THE plan — the matrix is put back by name at the end
  plan({ ...keep, 5: { agoMs: M(55) }, 6: { agoMs: M(56) }, 7: { agoMs: M(57) } }); await nextTick(2); // the strip's tail critical ⇒ the chip's long form
  // a sixth tile (a Files window, no warmth) at the strip's end: at the warm budget's boundary the five tiles alone fit whole and
  // no chip shows — with six, a critical tile is hidden there and the chip says so (the case the budget is for)
  const before = await evalJs(`[...app.wm.windows.keys()]`);
  await evalJs(`(app.openFileExplorer(${J(CWD)}), 1)`); await sleep(900);
  const extra = (await evalJs(`[...app.wm.windows.keys()]`)).filter((id) => !before.includes(id));
  const FIT = `(() => { const root = document.getElementById('desktop-previews'), c = document.getElementById('taskbar-overflow'), s = document.getElementById('taskbar-items');
    const tiles = [...s.children].filter((e) => e.classList.contains('taskbar-item')), ids = (c && !c.hidden && c._hiddenIds) || [];
    return { form: root.classList.contains('desktop-previews-compact') ? 'compact' : 'full', tiles: tiles.length, whole: tiles.length - ids.length, chip: c && !c.hidden ? { text: c.textContent, w: c.offsetWidth } : null, strip: Math.round(s.getBoundingClientRect().width), bar: document.getElementById('taskbar').clientWidth, mobile: !!app.isMobile }; })()`;
  const at = async (w) => { await device(w, 700); await sleep(450); return evalJs(FIT); };
  // the narrowest DESKTOP-class viewport judged 'full' (a phone-class page has no taskbar: it counts as not full here)
  const full = (f) => !f.mobile && f.bar > 0 && f.form === 'full';
  const boundary = async () => { let lo = 600, hi = 2400; if (!full(await at(hi))) return { w: null }; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (full(await at(mid))) hi = mid; else lo = mid; } await at(hi); await sleep(500); return { w: hi, ...(await evalJs(FIT)) }; };
  // the chip's longest forms: the dot + «+88 · 88 …» in en / zh / ja (the dictionaries' own words), measured as the chip draws them
  const word = (lang, key) => { if (lang === 'en') return key; const l = fs.readFileSync(path.join(repo, `src/lib/i18n-${lang}.js`), 'utf8').split('\n').find((x) => x.trim().startsWith(J(key) + ':')); return l ? JSON.parse(l.trim().slice(J(key).length + 1).trim().replace(/,$/, '')) : null; };
  const LONG = ['en', 'zh', 'ja'].flatMap((lang) => ['+{n} · {k} critical', '+{n} · {k} expired'].map((key) => ({ lang, s: String(word(lang, key)).replace('{n}', '88').replace('{k}', '88') })));
  const forms = await evalJs(`(() => { const c = document.getElementById('taskbar-overflow'); const m = (html) => { const x = c.cloneNode(false); x.removeAttribute('id'); x.hidden = false; x.innerHTML = html; c.parentNode.appendChild(x); const w = x.offsetWidth; x.remove(); return w; };
    const dot = '<span class="wsum-dot" data-warmth-tier="critical" aria-hidden="true"></span>'; return { plain88: m('+88'), forms: ${J(LONG)}.map((f) => ({ ...f, w: m(dot + f.s) })) }; })()`);
  const longest = Math.max(...forms.forms.map((f) => f.w));
  const on = await boundary();
  await evalJs(`app.settings.set('desktop.cacheWarmth', false), 1`); await sleep(1300); await nextTick(1);
  const off = await boundary();
  await evalJs(`app.settings.set('desktop.cacheWarmth', true), 1`); await sleep(1300); await nextTick(1);
  await waitFor(`!!app._warmth?.drawn && !!document.getElementById('taskbar-warmth')`, 12000); // drawn again before the RED below
  console.log(`    the switcher's boundary (the narrowest viewport judged 'full', 4 desktops): ON ${J(on)} · OFF ${J(off)}`);
  console.log(`    the «+N» chip's forms (px): plain «+88» ${forms.plain88}; ${forms.forms.map((f) => `${f.lang} «${f.s}» ${f.w}`).join('; ')} — the longest ${longest} + the plain room's margin ${TF.OVERFLOW_CHIP_PX - forms.plain88} = ${longest + TF.OVERFLOW_CHIP_PX - forms.plain88}; OVERFLOW_CHIP_WARM_PX = ${TF.OVERFLOW_CHIP_WARM_PX}`);
  check(`H4: at the switcher's boundary the strip keeps ≥ STRIP_MIN_TILES (${TF.STRIP_MIN_TILES}) whole tiles — warmth ON (${on.w} px: ${on.whole} whole, the chip «${on.chip && on.chip.text}» ${on.chip && on.chip.w} px) and OFF (${off.w} px: ${off.whole} whole, «${off.chip && off.chip.text}»)`,
    extra.length === 1 && on.w && off.w && on.form === 'full' && off.form === 'full' && on.whole >= TF.STRIP_MIN_TILES && off.whole >= TF.STRIP_MIN_TILES && !!on.chip && !!off.chip, { on, off, extra });
  check(`…the warm budget is the longest warm form + the plain room's own margin (${longest} + ${TF.OVERFLOW_CHIP_PX - forms.plain88} ≤ OVERFLOW_CHIP_WARM_PX ${TF.OVERFLOW_CHIP_WARM_PX} ≤ that + 8)`,
    TF.OVERFLOW_CHIP_WARM_PX >= longest + TF.OVERFLOW_CHIP_PX - forms.plain88 && TF.OVERFLOW_CHIP_WARM_PX <= longest + TF.OVERFLOW_CHIP_PX - forms.plain88 + 8, forms);
  // THE WORST CASE at the ON boundary: the chip held at its longest warm form's width (what it says there depends on which
  // tiles the strip cuts) — the floor still holds; RED: a chip planted wider than the budget ⇒ the probe counts fewer whole tiles
  if (on.w) {
    await device(on.w, 700); await sleep(500);
    await evalJs(`(() => { const s = document.createElement('style'); s.id = '__worst'; s.textContent = '#taskbar-overflow { min-width: ${longest}px !important; }'; document.head.appendChild(s); return 1; })()`);
    await sleep(500); const wc = await evalJs(FIT);
    await evalJs(`document.getElementById('__worst').remove(), 1`); await sleep(400);
    check(`…the worst case: the chip held at the longest warm form's width (${longest} px) at the ON boundary still leaves ≥ ${TF.STRIP_MIN_TILES} whole tiles (${wc.whole}, the strip ${wc.strip} px)`, wc.form === 'full' && !!wc.chip && wc.whole >= TF.STRIP_MIN_TILES, wc);
    await evalJs(`(() => { const s = document.createElement('style'); s.id = '__red'; s.textContent = '#taskbar-overflow { min-width: ${TF.OVERFLOW_CHIP_WARM_PX + 120}px !important; }'; document.head.appendChild(s); return 1; })()`);
    await sleep(500); const r = await evalJs(FIT);
    await evalJs(`document.getElementById('__red').remove(), 1`);
    check(`RED: a chip planted ${TF.OVERFLOW_CHIP_WARM_PX + 120} px wide at the ON boundary ⇒ the probe counts fewer than ${TF.STRIP_MIN_TILES} whole tiles (${r.whole})`, r.whole < TF.STRIP_MIN_TILES, r);
    await sleep(400);
    const fb = await evalJs(`(() => { const r = document.getElementById('taskbar').getBoundingClientRect(); return { x: 0, y: r.top - 4, width: innerWidth, height: r.height + 4 }; })()`);
    await bothThemes('A-desktop-12-plusN-boundary', fb);
  }
  await evalJs(`(() => { for (const id of ${J(extra)}) app.wm.closeWindow(id); return 1; })()`); await sleep(400);
  plan(keep); await device(1280, 800); await sleep(600); await nextTick(2);
});

await step('⑤ (cont.) eight desktops at 1100 × 700 fold the previews: the button\'s ring = the worst across all', async () => {
  await evalJs(`(() => { const dm = app.desktopManager; for (let i = 0; i < 4; i++) dm.createDesktop(); dm.switchTo(${J(DESKS.d1)}); return dm.desktops.length; })()`);
  await device(1100, 700); await sleep(800); await nextTick(1);
  const p = await evalJs(PREVIEWS);
  check(`8 desktops at 1100 px ⇒ the compact button; its ring = the worst live tier on every desktop (critical) — form ${p.form}`, p.form === 'compact' && p.button === 'critical', { form: p.form, button: p.button });
  const r = await evalJs(`(() => { const r = document.getElementById('taskbar').getBoundingClientRect(); return { x: 0, y: r.top - 4, width: innerWidth, height: r.height + 4 }; })()`);
  await bothThemes('A-desktop-12-compact-1100', r);
});

await step('⑪ scale and cost: the pass time, and no timer from a warmth function', async () => {
  await evalJs(`document.querySelectorAll('[data-popover]').forEach((p) => p.remove()), 1`);
  const state = await evalJs(`({ wins: app.wm.windows.size, desks: app.desktopManager.desktops.length, group: [...app.wm.windows.values()].some((w) => w._tabChain && w._tabChain.tabs.length >= 4), compact: document.getElementById('desktop-previews').classList.contains('desktop-previews-compact'), known: app._warmth.byId.size })`);
  await evalJs(`(window.__wc.hits = [], window.__wc.on = true, 1)`);
  const ms = [];
  for (let i = 0; i < 3; i++) { await nextTick(1); ms.push(await evalJs(`app._warmth.passMs`)); }
  const hits = await evalJs(`(window.__wc.on = false, window.__wc.hits.slice())`);
  const per = Math.max(...ms) / Math.max(1, state.known);
  console.log(`    the heaviest state ${J(state)}: passMs over 3 ticks = ${ms.map((x) => x.toFixed(2)).join(' / ')} ms — EXTRAPOLATION ×150 conversations (linear in the conversations, userW's scale): ≈ ${(per * 150).toFixed(1)} ms per 5 s tick`);
  check(`the heaviest state (14 conversations, 8 desktops, a group, the compact form): one pass ≤ 50 ms on every tick (${ms.map((x) => x.toFixed(2)).join(' / ')} ms)`, state.desks === 8 && state.group && state.compact && ms.length === 3 && ms.every((x) => typeof x === 'number' && x < 50), { state, ms });
  check('over three ticks (no popover open) NO setTimeout / setInterval / requestAnimationFrame came from a warmth-chrome.js function', hits.length === 0, hits);
  await evalJs(`(window.__wc.hits = [], window.__wc.on = true, 1)`);
  const c = await evalJs(`(() => { function noteWarmthAnswerControl() { requestAnimationFrame(() => {}); } noteWarmthAnswerControl(); window.__wc.on = false; return window.__wc.hits.slice(); })()`);
  check('…CONTROL: a planted noteWarmthAnswerControl() calling requestAnimationFrame once raises the census by exactly 1 (subtracted: 0)', c.length === 1 && /noteWarmthAnswerControl/.test(c[0]) && c.length - 1 === 0, c);
  await bothThemes('A-desktop-12-heavy');
});

await step('⑩ off and on, live (the hub\'s answer is the switch)', async () => {
  await device(1100, 700); await sleep(500);
  await evalJs(`(window.__offMut = { n: 0, on: false, recs: [] }, new MutationObserver((rs) => { if (!window.__offMut.on) return; for (const r of rs) { const t = r.target;
    const hit = (r.type === 'attributes' && (/^data-warmth/.test(r.attributeName) || (r.attributeName === 'style' && String(t.getAttribute?.('style') || '').includes('--warmth')) || (r.attributeName === 'title' && t.hasAttribute?.('data-warmth-tip'))))
      || (r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1 && (n.matches('.tab-warmth, .warmth-ring, .wl-band, .wl-left, .sess-warmth, .sess-warmth-left, .wsum-dot, #taskbar-warmth') || !!n.querySelector?.('.tab-warmth, .warmth-ring, .wsum-dot'))));
    if (hit) { window.__offMut.n++; if (window.__offMut.recs.length < 5) window.__offMut.recs.push(r.type + ':' + (r.attributeName || '') + ':' + (t.className?.baseVal ?? t.className)); } } }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: false }), 1)`);
  const MARKS = `document.querySelectorAll('[data-warmth-tier], .tab-warmth, .warmth-ring, .sess-warmth, .wl-band, #taskbar-warmth, [data-warmth-tip]').length`;
  check('on: marks are drawn', (await evalJs(MARKS)) > 0, await evalJs(MARKS));
  await evalJs(`app.settings.set('desktop.cacheWarmth', false), 1`);
  await sleep(1300); await nextTick(1);
  check('OFF (app.settings.set, no reload): zero marks — no tier, band, ring, phone band, summary chip or warmth title left', (await evalJs(MARKS)) === 0, await evalJs(`[...document.querySelectorAll('[data-warmth-tier], .tab-warmth, .warmth-ring, #taskbar-warmth, [data-warmth-tip]')].slice(0, 5).map((e) => e.className?.baseVal ?? e.className)`));
  const chip = await evalJs(`(() => { const c = document.getElementById('taskbar-overflow'); return c ? { text: c.textContent, n: (c._hiddenIds || []).length, dot: !!c.querySelector('.wsum-dot'), shown: !c.hidden } : null; })()`);
  check(`…the «+N» chip reads exactly «+N» («${chip && chip.text}»)`, chip && chip.text === '+' + chip.n && !chip.dot, chip);
  await evalJs(`(window.__offMut.on = true, 1)`);
  await nextTick(2);
  const mut = await evalJs(`(window.__offMut.on = false, window.__offMut)`);
  check('…a MutationObserver over the next two ticks records ZERO warmth mutations (off = nothing computed, nothing drawn)', mut.n === 0, mut);
  RW.failNext = 1; await nextTick(1); await sleep(300);
  check('…a FAILED poll draws nothing (it never re-derives from the forgotten ON answer)', (await evalJs(MARKS)) === 0 && RW.failNext === 0, await evalJs(MARKS));
  await click('#taskbar-status');
  await waitFor(`!!document.querySelector('.overlap-switcher .overlap-switcher-item')`, 3000);
  const wl = await evalJs(`(() => { const p = document.querySelector('.overlap-switcher'); return { head: !!p.querySelector('.wl-head'), band: !!p.querySelector('.wl-band, .wl-left'), name: !!p.querySelector('.wl-name'), ids: [...p.querySelectorAll(':scope > .overlap-switcher-item:not(.overlap-switcher-group):not(.overlap-switcher-other)')].filter((r) => r.dataset.winId).length }; })()`);
  check('…the window list is as before: no head row, no band, no shrinking label, no data-win-id on the active-desktop rows', !wl.head && !wl.band && !wl.name && wl.ids === 0, wl);
  await evalJs(`document.querySelectorAll('[data-popover]').forEach((p) => p.remove()), 1`);
  const off8 = {}; for (const [w, h] of [[1280, 800], [1100, 700]]) { await device(w, h); await sleep(700); const q = await evalJs(PREVIEWS); off8[`off-${w}`] = { form: q.form, chip: q.chip }; }
  console.log('    warmth OFF — the switcher form and «+N» (8 desktops now): ' + J(off8));
  // ⑫ the settings row, drawn: Settings → Window shows it, OFF now (the person's flip a moment ago — the default is off)
  await device(1280, 800); await sleep(500);
  await evalJs(`(app._settingsUI.open({ category: 'Window' }), 1)`);
  await waitFor(`[...document.querySelectorAll('.settings-window *')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'Prompt-cache warmth on conversation boxes')`, 5000);
  const row = await evalJs(`(() => { const lab = [...document.querySelectorAll('.settings-window *')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'Prompt-cache warmth on conversation boxes'); if (!lab) return null; let r = lab; for (let i = 0; i < 5 && r && !r.querySelector('input[type=checkbox]'); i++) r = r.parentElement; const cb = r?.querySelector('input[type=checkbox]'); lab.scrollIntoView({ block: 'center' }); return { found: true, on: cb ? cb.checked : null, desc: /no request and no timer/.test(r?.textContent || '') }; })()`);
  check('⑫ Settings → Window draws the row «Prompt-cache warmth on conversation boxes» with its description; it reads OFF now', row && row.found && row.on === false && row.desc, row);
  await bothThemes('A-desktop-11-settings-row');
  await evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'settings') app.wm.closeWindow(w.id); return 1; })()`);
  await evalJs(`app.settings.set('desktop.cacheWarmth', true), 1`);
  await sleep(1300); await nextTick(1);
  check('ON again: the marks return on the next tick, with no reload', (await evalJs(MARKS)) > 0 && (await evalJs(`!!document.getElementById('taskbar-warmth')`)), await evalJs(MARKS));
});

await step('⑫ the theme editor\'s «Cache warmth» rows (opened through the product\'s door: ⚙ → Appearance → ✎)', async () => {
  await click('#btn-global-settings');
  await waitFor(`!!document.querySelector('.global-settings-popover')`, 3000);
  const head = await evalJs(`(() => { const e = [...document.querySelectorAll('.global-settings-popover *')].find((x) => x.childElementCount <= 2 && /^Appearance/.test(x.textContent.trim()) && x.closest('[role=menuitem], button, .gear-row, .menu-item, div')); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (head) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: head.x, y: head.y }); for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: head.x, y: head.y, button: 'left', clickCount: 1 }); }
  await waitFor(`!!document.querySelector('button[title="Theme Editor"]')`, 3000);
  await click('button[title="Theme Editor"]');
  const opened = await waitFor(`!!document.querySelector('.theme-editor-name')`, 5000);
  const rows = opened ? await evalJs(`[...document.querySelectorAll('*')].filter((e) => e.childElementCount === 0 && /^--warmth-(fresh|mid|late|critical|expired)$|^(Fresh|Mid|Late|Critical|Expired)/.test(e.textContent.trim()) && e.closest('.theme-editor, [class*=theme-editor]')).map((e) => e.textContent.trim()).slice(0, 12)`) : [];
  const group = opened ? await evalJs(`[...document.querySelectorAll('*')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'Cache warmth')`) : false;
  check('the theme editor opens through ⚙ → Appearance → ✎, and lists the «Cache warmth» group', opened && group, { head, opened, group, rows });
  // the shot: the ⚙ menu closed, the «Cache warmth» group scrolled into the editor's view
  await evalJs(`(() => { document.querySelectorAll('.global-settings-popover').forEach((p) => p.remove()); const h = [...document.querySelectorAll('*')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'Cache warmth'); h?.scrollIntoView({ block: 'start' }); return !!h; })()`);
  await sleep(300);
  await bothThemes('A-desktop-11-theme-editor');
  await evalJs(`(() => { document.querySelectorAll('[data-popover]').forEach((p) => p.remove()); for (const w of [...app.wm.windows.values()]) if (w.type === 'theme-editor' || /theme/i.test(w.type)) app.wm.closeWindow(w.id); document.querySelector('.theme-editor-close, .theme-editor .close')?.click(); return 1; })()`);
});

await step('⑨ the phone (390 × 844, touch): session rows and switcher rows', async () => {
  plan(PLAN_K);
  await load(390, 844, true);
  check('the phone class', await evalJs('app.isMobile'));
  await nextTick(2);
  await evalJs(`(app.sidebar.toggle?.(true), 1)`); await sleep(600);
  const cards = await evalJs(`[...document.querySelectorAll('.session-item-card')].filter((c) => c._webuiId && c.offsetParent).map((c) => { const b = c.querySelector(':scope > .sess-warmth'); const l = c.querySelector('.sess-warmth-left');
    return { sid: c._webuiId, band: !!b && parseFloat(getComputedStyle(b).width) > 0.5, w: b ? parseFloat(getComputedStyle(b).width) : 0, cw: c.clientWidth, frac: b ? parseFloat(b.style.getPropertyValue('--warmth-frac')) : null, tier: b?.getAttribute('data-warmth-tier') || null, words: l?.textContent || null, first: c.firstElementChild === b }; })`);
  const live = cards.filter((c) => c.band), exp = cards.find((c) => c.sid === SIDS[4]);
  check(`phone session rows: a live row carries the band (its first child, width ∝ frac ±2 px) and «N min left» (${live.length} live of ${cards.length} shown)`,
    live.length >= 3 && live.every((c) => c.first && near(c.w, c.cw * c.frac) && /^\d+ min left$/.test(c.words || '')), cards.slice(0, 6));
  check('…an expired row says «Expired» with no band; the unknown row neither', exp && !exp.band && exp.words === 'Expired' && (() => { const u = cards.find((c) => c.sid === SIDS[7]); return !u || (!u.band && !u.words); })(), { exp, unk: cards.find((c) => c.sid === SIDS[7]) });
  await bothThemes('A-phone-6-sessions');
  await evalJs(`(app.sidebar.toggle?.(false), 1)`); await sleep(400);
  await evalJs(`(app._mobileNav._showWindowSwitcher(), 1)`);
  await waitFor(`document.querySelectorAll('.mobile-win-switcher .mobile-win-row').length > 0`, 4000);
  const sw = await evalJs(`[...document.querySelectorAll('.mobile-win-switcher .mobile-win-row')].map((r) => { const b = r.querySelector(':scope > .sess-warmth'); return { sid: app.sessions.get(r.dataset.winId)?.sessionId || null, band: !!b && parseFloat(getComputedStyle(b).width) > 0.5, words: r.querySelector('.sess-warmth-left')?.textContent || null }; })`);
  const swk = sw.map((r) => kOfSid(r.sid));
  const wantOf = (k) => (WANT[k] !== undefined ? WANT[k] : 'live');
  const badRows = sw.filter((r) => { const k = kOfSid(r.sid); if (k < 0) return false; const want = wantOf(k);
    return want === 'unknown' ? (r.band || !!r.words) : want === 'expired' ? (r.band || r.words !== 'Expired') : !(r.band && /^\d+ min left$/.test(r.words || '')); });
  check(`the window switcher: one row per tab (the group's four are listed), each live row its band + words, an expired row «Expired» and no band, the unknown one neither`,
    [0, 2, 3, 4].every((k) => swk.includes(k)) && badRows.length === 0, { badRows, swk });
  await bothThemes('A-phone-6-switcher');
});

console.log(`\n  shots (${SHOT_LIST.length}): ${SHOT_LIST.map((f) => path.basename(f)).join(', ')}`);
check('no page error thrown during the walk', pageErrors.length === 0, pageErrors.slice(0, 4));
console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
