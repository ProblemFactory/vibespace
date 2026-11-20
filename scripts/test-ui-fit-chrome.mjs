#!/usr/bin/env node
// THE FIT LAWS DRAWN (lane ui-phone-and-fit — the owner's «走查一下所有界面»; the tree's half is test-ui-fit). A throwaway
// server in a git worktree (the tree under test's src/ + built public/), seeded with the neutral Background Work fixture
// (scripts/jobs-triage-fixture.mjs), named accounts and a pool (fake, never used), the owner's CLI layout (a claude and a codex
// stand-in behind a scratch login shell — the Agents column's widest rows), and headless Chrome over raw CDP.
//   ① EVERY RAIL DOOR READS AT 200, 260 AND 360 (主开发 07:02Z: «the row first, NO new floor»; the width sweep's sidebar ladder,
//      scripts/lib/fit-ladder.mjs SIDEBAR_LADDER): every door of the rail (the
//      live `.rail-item[data-rail]` list) whose press shows a column, at the sidebar's 260 px and its 200 px floor —
//      scripts/ui-fit-census.mjs FIT_FACTS: no control drawn on two lines when it would fit on one, none cut, no text past
//      the column's edge, no name squeezed one character a line, no Latin word broken where it fits, no sideways scroll.
//      The hosted runner's states are PLANTED in the page's answers (no rclone ⇒ the Remote column's set-up card; a worktree
//      checkout ⇒ the Agents column's refusal with its path), so every machine draws the rows the runner drew.
//      CONTROL: the rail row's and the button bar's wrap undone by an injected sheet ⇒ the Agents / Jobs columns fault
//   ② THE CHECK ROW: every label the client builds around a checkbox or a radio (ui-fit-census checkLabelSites — its
//      classes and inline styles) drawn inside a dialog's body — the box left of its words, on the words' first line
//      (a switch drawn by its own rule — its box hidden — is counted apart). CONTROL: the row rule deleted from the live
//      sheet ⇒ a label with no row class of its own stacks (the files publish dialog's #49)
//   ③ THE PORTS PANEL RENDERS ONCE (#9): a port forwarded through the panel's own box (its re-render and the hub's
//      forwards push race) ⇒ ONE forwards section, one row, one section per machine (the base drew each twice)
//   ④ THE TOUR STEPS ASIDE (#4): a guided terminal window opened while the tour is up ⇒ the tour hidden while it is up,
//      back when it closes
//   ⑤ THE DISK NOTICE (#3): a phone (390 × 844): an edited file changed on disk ⇒ the notice drawn whole on its own line
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-ui-fit-chrome.mjs [--shots <dir>]
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, CHROME_QUIET } from './scratch.mjs';
import { loadPage } from './cdp-page-load.mjs';
import { mintRoot, startHub, DAEMON_ROOT_ENV } from './hub-boot.mjs';   // THE SUITES' ONE HUB BOOT (test-architecture §57c)
import { armWatchdog } from './suite-watchdog.mjs';
import { clientSources, checkLabelSites } from './ui-fit-census.mjs';
import { columnFactsSource as FIT_FACTS, columnReads as reads, SIDEBAR_LADDER } from './lib/fit-ladder.mjs'; // ONE ladder helper (pick 0)
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.log('✗ no public/bundle.js — run `npm run build` first'); process.exit(1); }

const [PORT, CDP_PORT, SVC_PORT] = await freePorts(3);
// the tree and the home live in ONE root the boot helper minted: at exit it ends the hub and everything rooted there, removes the
// worktree through git, then the root (test-architecture §57c — no hub boot outside scripts/hub-boot.mjs)
const root = mintRoot('ui-fit');
const wt = path.join(root, 't');
const fakeHome = path.join(root, 'home');
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });   // rule nine (hub-boot.mjs): the suite's own browser and sleeper carry a HOME in the root, so the helper ends them before the root goes
for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
const chromeDir = scratch('ui-fit-chrome');
const stubDir = path.join(root, 'stub');
const CWD = path.join(stubDir, 'work');
const SHOTS = arg('--shots') ? path.resolve(arg('--shots')) : scratch('ui-fit-shots');
for (const d of [stubDir, CWD, SHOTS]) fs.mkdirSync(d, { recursive: true });
const ORIGIN = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const check = (n, c, e) => { if (typeof n !== 'string') throw new Error(`check: the name goes FIRST (got a ${typeof n})`); if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// THE CLI SHAPE (test-roster-row-fold ③'s census — what the Agents column draws depends on the machine): the owner's layout,
// the widest rows — a claude and a codex stand-in in the scratch HOME's ~/.local/bin, found through a scratch login shell
// (an sh script: its PATH = that bin + a tools dir holding printenv); the hub's own PATH keeps no directory with either. A
// terminal (the guided window of ④) gets an interactive sh from the same shell.
const SHAPE_DIR = path.join(fakeHome, '.vs-shape', 'installed'), CLI_BIN = path.join(fakeHome, '.local', 'bin'), TOOLS = path.join(fakeHome, '.vs-shape', 'tools');
for (const d of [SHAPE_DIR, CLI_BIN, TOOLS]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(CLI_BIN, 'claude'), '#!/bin/sh\n[ "$1" = --version ] && { echo "2.1.314 (Claude Code)"; exit 0; }\nexit 1\n', { mode: 0o755 });
fs.writeFileSync(path.join(CLI_BIN, 'codex'), '#!/bin/sh\n[ "$1" = --version ] && { echo "codex-cli 0.130.0"; exit 0; }\nexit 1\n', { mode: 0o755 });
fs.symlinkSync(['/usr/bin/printenv', '/bin/printenv'].find((p) => fs.existsSync(p)) || '/usr/bin/printenv', path.join(TOOLS, 'printenv'));
fs.writeFileSync(path.join(SHAPE_DIR, 'login-shell'), `#!/bin/sh\nPATH='${CLI_BIN}:${TOOLS}:/usr/bin:/bin'; export PATH\nwhile [ $# -gt 0 ]; do case "$1" in -c) shift; exec /bin/sh -c "$1";; *) shift;; esac; done; exec /bin/sh -i\n`, { mode: 0o755 });
const hubPath = (process.env.PATH || '').split(':').filter((d) => d && !['claude', 'codex'].some((n) => fs.existsSync(path.join(d, n)))).join(':');

// ── throwaway server in a worktree, its data/ seeded with the jobs fixture ──
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const dataDir = path.join(wt, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const { makeFixture, writeAliveStamp } = await import(path.join(repo, 'scripts/jobs-triage-fixture.mjs'));
// THE FIXTURE'S «NOW» IS HANDED TO THE PAGE (主开发's rule, 2026-11-14 — a new suite that draws a time never reads the wall clock):
// the jobs' ages are drawn by the page's own clock (jobs-panel.js hum(Date.now() − t)), so each document starts its clock AT the
// fixture's now (advancing from there) — the rows read «2m», «1h», «4d» as the fixture wrote them, however long the run took
const FIX_NOW = Date.now();
const fx = makeFixture(FIX_NOW);
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));
fs.writeFileSync(path.join(dataDir, 'jobs.json'), JSON.stringify(fx.jobs.map(strip)));
fs.writeFileSync(path.join(dataDir, 'job-notifications.json'), JSON.stringify(fx.notifs));
const sleeper = spawn('sleep', ['900'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });   // HOME: rule nine
for (const id of [fx.ids.running, fx.ids.awaiting]) writeAliveStamp(fs, path, dataDir, fx.jobs.find((j) => j.id === id), sleeper.pid);
const svc = await new Promise((res) => { const s = http.createServer((q, r) => r.end('<!doctype html><title>svc</title>')); s.listen(SVC_PORT, '127.0.0.1', () => res(s)); });
const srvEnv = { ...process.env, ...VNC_ENV, PORT: String(PORT), HOST: '127.0.0.1', HOME: fakeHome, PATH: hubPath, SHELL: path.join(SHAPE_DIR, 'login-shell'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1', VS_NO_REAL_CLI: '1' };
for (const k of ['CLAUDE_CMD', 'CODEX_CMD', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) delete srvEnv[k];
for (const k of DAEMON_ROOT_ENV) delete srvEnv[k];   // a device root, if the caller's env names one, would lie outside the minted root
const hub = startHub({ root, tree: wt, port: PORT, env: srvEnv });   // its output: <root>/hub.log
const chromeEnv = { ...process.env, HOME: chromeHome }; delete chromeEnv.DBUS_SESSION_BUS_ADDRESS; delete chromeEnv.DISPLAY;
const chrome = spawn(CHROME, [...CHROME_QUIET, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env: chromeEnv });
const cleanup = () => {
  // the helper's end ran first (registered at the mint): the hub, every process carrying the root's HOME (Chrome and the sleeper
  // by rule nine, the hub's terminals by its HOME), the worktree through git, then the root — the kills by handle are no-ops by then
  try { chrome.kill('SIGKILL'); } catch { }
  try { sleeper.kill('SIGKILL'); } catch { }
  try { svc.close(); } catch { }
  for (const d of [chromeDir]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);   // a signal is the boot helper's (armed at mintRoot: each ends in exit, so this runs) — no signal line here
const PENDS = new Map();
armWatchdog({ capMs: 840e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
if (!(await hub.ready({ ms: 40000 }))) console.log(`  (the hub did not answer in 40 s — its log:)\n${hub.log().slice(-2000)}`);   // the log lives in the minted root, gone at exit
const api = async (p, body) => (await fetch(ORIGIN + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
const ACC = {};
for (const [k, n] of [['A', 'Work Max'], ['B', 'Personal Max'], ['L', 'A very long subscription account name that runs to sixty chars']]) ACC[k] = (await api('/api/accounts/subscription', { name: n })).id;
ACC.P = (await api('/api/accounts/pool', { name: 'Main pool', members: [ACC.A, ACC.B] })).id;

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const T = ${FIX_NOW}, p0 = performance.now(), R = Date, at = () => Math.round(T + (performance.now() - p0));
  function D(...a) { if (!new.target) return new R(at()).toString(); return a.length ? new R(...a) : new R(at()); }
  D.prototype = R.prototype; D.now = at; D.parse = R.parse; D.UTC = R.UTC; Object.setPrototypeOf(D, R); window.Date = D; })();` }); // the fixture's now, handed to the page
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" }); // the walk's language (zh)
// THE MACHINE'S OWN STATES, PLANTED (the .408 prep mirror: green on this box, red on the hosted runner — not its fonts: the runner
// has no rclone, so the Remote column drew its set-up card this box never drew; and both draw the integration's refusal with the
// checkout's path — the suite's server runs from a git worktree — but this box's path is short and breaks at a hyphen, the runner's
// is 37 characters with no break of its own). Every machine now draws both: /api/mounts answers «no rclone», /api/agent-hooks the
// worktree refusal with a path of the runner's drawing shape — its checkout path with the account's name one letter longer (38
// characters, no hyphen, no break of its own), never a real account's home (test-architecture §68: on the hosted runner «runner» IS
// an account under /home) — the page's answers only, the hub untouched.
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const F = window.fetch;
  window.fetch = async function (input, init) {
    const r = await F.apply(this, arguments);
    try {
      const u = new URL(typeof input === 'string' ? input : input.url, location.href), m = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (m !== 'GET' || (u.pathname !== '/api/mounts' && u.pathname !== '/api/agent-hooks') || !r.ok) return r;
      const j = await r.clone().json();
      if (u.pathname === '/api/mounts') j.rcloneAvailable = false; else j.refused = { kind: 'worktree', checkout: '/home/runners/work/vibespace/vibespace' };
      return new Response(JSON.stringify(j), { status: r.status, statusText: r.statusText, headers: r.headers });
    } catch { return r; }
  }; })();` });
const desk = async (w = 1440, h = 900) => { await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'hover' }, { name: 'pointer', value: 'fine' }] }); };
const phone = async (w = 390, h = 844) => { await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }); };
const load = async () => { await loadPage(cdp, ORIGIN + '/', { bootMs: 60000 }); await waitFor(`!document.getElementById('loading-screen')`, 30000); await sleep(1200); };
/** checkpoint 61 (the coordinator's readers): every census fold stands on its OWN full row — its left and width are its id row's
 *  content box (±1 px); the folds that do not, said */
const FOLD_ROWS = `(() => { const fs = [...document.querySelectorAll('#all-sessions-list .ob-cli-where-fold')].filter((d) => d.getClientRects().length);
  const bad = fs.map((d) => { const row = d.parentElement, c = getComputedStyle(row), rr = row.getBoundingClientRect(), fr = d.getBoundingClientRect();
    const left = rr.left + (parseFloat(c.borderLeftWidth) || 0) + (parseFloat(c.paddingLeft) || 0), width = row.clientWidth - (parseFloat(c.paddingLeft) || 0) - (parseFloat(c.paddingRight) || 0);
    return Math.abs(fr.left - left) <= 1 && Math.abs(fr.width - width) <= 1 ? null : { fold: [Math.round(fr.left), Math.round(fr.width)], box: [Math.round(left), Math.round(width)] }; }).filter(Boolean);
  return { n: fs.length, bad }; })()`;
/** checkpoint 61: every census fold («found by your shell at …») in the open rail column, opened by a REAL press on its summary */
const openCliFolds = async () => {
  const n = await evalJs(`(() => { const fs = [...document.querySelectorAll('#all-sessions-list .ob-cli-where-fold')].filter((d) => d.getClientRects().length); fs.forEach((d, k) => { d.querySelector(':scope > summary').dataset.uf = 'cliwhere-' + k; }); return fs.length; })()`);
  for (let k = 0; k < n; k++) await press(`[data-uf="cliwhere-${k}"]`);
  await sleep(300);
  const opened = await evalJs(`[...document.querySelectorAll('#all-sessions-list .ob-cli-where-fold')].filter((d) => d.getClientRects().length && d.open).length`);
  return { n, opened };
};
const press = async (sel) => { const p = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); if (!p) return false; await evalJs(`(() => { let t = document.elementFromPoint(${p.x}, ${p.y}); while (t && typeof t.click !== 'function') t = t.parentElement; t?.click(); return !!t; })()`); /* what is under the point — an icon's SVG has no click(): its nearest clickable ancestor, the control the person pressed (its first claim: «elementFromPoint(...)?.click is not a function» on a rail door's icon) */ await sleep(300); return true; };
const openRail = async (id) => {
  for (let k = 0; k < 2; k++) { if (await evalJs(`!!(app.sidebar.isOpen && app.sidebar._activeTab === ${JSON.stringify(id)})`)) break; await press(`.rail-item[data-rail="${id}"]`); await sleep(400); }
  return evalJs(`!!(app.sidebar.isOpen && app.sidebar._activeTab === ${JSON.stringify(id)})`);
};
const UNDO_ROW = `.btn-bar, .rail-panel .agent-actions, .rail-row, .rail-row > .rail-row-ctl { flex-wrap: nowrap !important; } .btn-bar > :is(button, .btn-bar-group), .rail-panel .agent-actions > button { white-space: normal !important; flex: 0 1 auto !important; }`;

try {
  await desk(); await load();
  // ③ THE PORTS PANEL RENDERS ONCE — a forward through the panel's own box
  if (await openRail('ports')) {
    await waitFor(`!!document.querySelector('.rail-panel-ports .ports-manual-input')`, 10000);
    await evalJs(`(() => { const i = document.querySelector('.rail-panel-ports .ports-manual-input'); i.focus(); i.value = '${SVC_PORT}'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await press('.rail-panel-ports .ports-manual .mounts-icon-btn');
    await waitFor(`!!document.querySelector('.rail-panel-ports .ports-row[data-forward-id]')`, 10000); await sleep(2500);
    const p = await evalJs(`(() => { const c = document.querySelector('.rail-panel-ports'); return { machines: c.querySelectorAll(':scope > .ports-machine').length, forwards: c.querySelectorAll('.ports-row[data-forward-id]').length, heads: [...c.querySelectorAll(':scope > div > .usage-section-title')].map((e) => e.textContent) }; })()`);
    check(`③ a port forwarded through the panel's box: ONE section per machine (${p.machines}), ONE forward row (${p.forwards}), the forwards head once (${p.heads.length})`, p.machines === 1 && p.forwards === 1 && p.heads.filter((h) => h === p.heads[0]).length === 1, p);
  } else check('③ the Ports door opens its column', false);

  // ① EVERY RAIL DOOR AT 260 AND AT 200
  const doors = await evalJs(`[...document.querySelectorAll('.rail-item[data-rail]')].filter((b) => b.getClientRects().length).map((b) => b.dataset.rail)`);
  const columns = {};
  for (const w of SIDEBAR_LADDER) {
    await evalJs(`localStorage.setItem('sidebarWidth', '${w}'); true`); await load();
    const sw = await evalJs(`Math.round(document.getElementById('sidebar').getBoundingClientRect().width)`);
    for (const id of doors) {
      if (!await openRail(id)) continue;                       // a door that opens a window or a menu: not a column
      columns[id] = true;
      await sleep(id === 'agents' || id === 'plugins' || id === 'jobs' ? 2200 : 1200);
      await evalJs(`document.querySelectorAll('.context-menu, #global-toasts > .global-toast').forEach((e) => e.remove()); true`);
      if (id === 'agents') {   // checkpoint 61: the census line «found by your shell at …» is a FOLD now — measured OPEN, opened by a real press
        const rowsClosed = await evalJs(FOLD_ROWS);
        const fo = await openCliFolds();
        const rowsOpen = await evalJs(FOLD_ROWS);
        check(`① «agents» at ${w}: every census fold stands on its OWN full row — its left and width its id row's content box, CLOSED (${rowsClosed.n - rowsClosed.bad.length} of ${rowsClosed.n}) and OPEN (${rowsOpen.n - rowsOpen.bad.length} of ${rowsOpen.n})`, rowsClosed.n > 0 && !rowsClosed.bad.length && rowsOpen.n > 0 && !rowsOpen.bad.length, { rowsClosed, rowsOpen });
        check(`① «agents» at ${w}: the census folds («found by your shell at …») opened by a real press (${fo.opened} of ${fo.n}) — measured OPEN`, fo.n > 0 && fo.opened === fo.n, fo);
      }
      const f = await evalJs(FIT_FACTS('#all-sessions-list'));
      await shot(`rail-${id}.${w}.png`);
      check(`① «${id}» at a ${w} px sidebar (${sw} px drawn, its column ${f && f.w} px): it reads — ${f ? f.controls + ' controls' : 'no column'}`, reads(f), f);
      // a row made by rule still reads as its PARTS (the reader's must-fix: «dev-serverdown»): two inline parts of a row's main
      // are on different lines or at least 4 px apart
      const glued = await evalJs(`[...document.querySelectorAll('#all-sessions-list .rail-row-main')].flatMap((m) => { const kids = [...m.children].filter((k) => getComputedStyle(k).display.startsWith('inline') || k.tagName === 'SPAN'); const out = []; for (let i = 1; i < kids.length; i++) { const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect(); if (!a.width || !b.width) continue; const same = Math.abs(a.top - b.top) < 3; if (same && b.left - a.right < 4) out.push(kids[i - 1].textContent.slice(0, 20) + '|' + kids[i].textContent.slice(0, 12)); } return out; }).slice(0, 5)`);
      if (id === 'jobs' || glued.length) check(`① «${id}» at ${w}: a row's parts never run together (${glued.length ? glued.join(' · ') : 'name · state apart'})`, glued.length === 0, glued);
    }
    if (w === 200) { // CONTROLS (checkpoint 61): the census fold's own row planted away; its BODY squeezed by a plant — CLOSED its words are never judged, OPEN they are
      await openRail('agents'); await sleep(1500);
      // …and the own-row rule planted AWAY: the closed fold is then no full row (the pin above can fail)
      const away = await evalJs(`(() => { const s = document.createElement('style'); s.id = 'zz-no-fold-row'; s.textContent = '.ob-backend-id > .ob-cli-where-fold { flex: 0 1 auto !important; min-width: auto !important; }'; document.head.appendChild(s); const r = ${FOLD_ROWS}; s.remove(); return r; })()`);
      check(`① CONTROL: the census fold's own-row rule planted away — the CLOSED fold is no full row (${away.bad.length} of ${away.n} off its id row's box)`, away.n > 0 && away.bad.length === away.n, away);
      // the fold's BODY planted 2 em wide (its summary keeps its width: a closed fold shows its summary, which the walk rightly reads —
      // the hosted pre-run's red on round 2's control, whose plant narrowed the summary too). THE LAW: the walk never judges the words
      // INSIDE a closed fold and judges them once it is open — the body's and the summary's words taken from the page (the fold's
      // summary element against its other children). What makes it RED: the walk judging a closed fold's body (a squeezed text that is
      // a body's words while the fold is closed), or not judging an open one (no body text squeezed while it is open).
      await evalJs(`(() => { const s = document.createElement('style'); s.id = 'zz-undo-fold'; s.textContent = '.ob-backend-id > .ob-cli-where-fold > .tech-fold-body { width: 2em !important; max-width: 2em !important; }'; document.head.appendChild(s); return true; })()`);
      const FOLD_TEXTS = `(() => { const fs = [...document.querySelectorAll('#all-sessions-list .ob-cli-where-fold')].filter((d) => d.getClientRects().length); return { body: fs.flatMap((d) => [...d.children].filter((c) => c.tagName !== 'SUMMARY').map((c) => c.textContent.trim())).filter(Boolean), summary: fs.map((d) => (d.querySelector(':scope > summary') || {}).textContent || '').map((x) => x.trim()) }; })()`;
      const texts = await evalJs(FOLD_TEXTS);
      const ofBody = (q) => texts.body.some((b) => b.includes(q));
      const closedF = await evalJs(FIT_FACTS('#all-sessions-list'));
      const fo = await openCliFolds();
      const openF = await evalJs(FIT_FACTS('#all-sessions-list'));
      await evalJs(`document.getElementById('zz-undo-fold')?.remove(); true`);
      const closedBody = closedF ? closedF.squeezed.filter(ofBody) : null, openBody = openF ? openF.squeezed.filter(ofBody) : null;
      check(`① CONTROL: «agents» at 200 with the census fold's BODY planted 2 em wide — CLOSED no squeezed text is a fold's body words (${closedBody && closedBody.length}; squeezed there: ${closedF && (closedF.squeezed.join(' · ') || 'none')}), OPEN (${fo.opened} of ${fo.n}) the body's words ARE judged (${openBody && openBody.slice(0, 2).join(' · ')})`, texts.body.length > 0 && fo.n > 0 && fo.opened === fo.n && !!closedBody && closedBody.length === 0 && !!openBody && openBody.length > 0, { texts, fo, closed: closedF && closedF.squeezed, open: openF && openF.squeezed });
    }
    if (w === 200) { // CONTROL: the row's and the bar's wrap undone
      for (const id of ['agents', 'jobs']) {
        await openRail(id); await sleep(1500);
        const f = await evalJs(`(() => { const s = document.createElement('style'); s.id = 'zz-undo'; s.textContent = ${JSON.stringify(UNDO_ROW)}; document.head.appendChild(s); return true; })()`) && await evalJs(FIT_FACTS('#all-sessions-list'));
        await evalJs(`document.getElementById('zz-undo')?.remove(); true`);
        check(`① CONTROL: «${id}» at 200 with the rail row's and the bar's wrap undone faults (${f && [...f.wrapped, ...f.cut, ...f.clipped, ...f.squeezed].slice(0, 3).join(' · ')})`, !!f && !reads(f), f);
      }
    }
  }
  check(`① the rail's columns were all read: ${Object.keys(columns).join(', ')}`, ['ports', 'agents', 'plugins', 'jobs', 'channels', 'system'].every((k) => columns[k]), { doors, columns });

  // ② THE CHECK ROW
  const SITES = checkLabelSites(clientSources(repo));
  const shapes = [...new Map(SITES.map((s) => [s.classes.join(' ') + '|' + s.inline, { classes: s.classes, inline: s.inline, at: `${s.file}:${s.line}` }])).values()];
  const drawRows = (rowRuleOn) => evalJs(`(() => {
    const shapes = ${JSON.stringify(shapes)};
    ${rowRuleOn ? '' : `for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch { continue; } for (let i = rs.length - 1; i >= 0; i--) if ((rs[i].selectorText || '').includes(':where(:has(> input')) sh.deleteRule(i); }`}
    const ov = document.createElement('div'); ov.className = 'dialog-overlay'; ov.id = 'zz-check-rows'; ov.style.cssText = 'display:flex; overflow:auto';
    const dlg = document.createElement('div'); dlg.className = 'dialog'; const body = document.createElement('div'); body.className = 'dialog-body'; dlg.appendChild(body); ov.appendChild(dlg); document.body.appendChild(ov);
    const out = [];
    for (const sh of shapes) {
      const lab = document.createElement('label'); if (sh.classes.length) lab.className = sh.classes.join(' '); if (sh.inline) lab.style.cssText = sh.inline;
      const cb = document.createElement('input'); cb.type = 'checkbox'; const words = document.createElement('span'); words.textContent = '允许它用这个账号登录 Let it sign in';
      lab.append(cb, words); body.appendChild(lab);
      const c = cb.getBoundingClientRect(), cs = getComputedStyle(cb);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || c.width < 4) { out.push({ at: sh.at, cls: sh.classes.join(' '), switch: true }); continue; }
      const r = document.createRange(); r.selectNodeContents(words); const first = [...r.getClientRects()][0];
      out.push({ at: sh.at, cls: sh.classes.join(' '), row: !!first && c.right <= first.left + 1 && c.top + c.height / 2 >= first.top - 2 && c.top + c.height / 2 <= first.bottom + 2, box: [Math.round(c.left), Math.round(c.top)], words: first && [Math.round(first.left), Math.round(first.top)] });
    }
    return out;   // the overlay stays for its picture; the caller removes it
  })()`);
  const dropRows = () => evalJs(`document.getElementById('zz-check-rows')?.remove(); true`);
  const rowsNow = await drawRows(true); await shot('check-rows.png'); await dropRows();
  const stacked = rowsNow.filter((x) => !x.switch && !x.row);
  check(`② every check-row label the client builds (${SITES.length} sites, ${shapes.length} shapes; ${rowsNow.filter((x) => x.switch).length} switches drawn by their own rule) draws its box left of its words, on their first line`, rowsNow.length === shapes.length && shapes.length >= 30 && !stacked.length, stacked);
  const rowsOff = await drawRows(false); await shot('check-rows.control.png'); await dropRows();
  const stackedOff = rowsOff.filter((x) => !x.switch && !x.row);
  check(`② CONTROL: the row rule deleted from the live sheet ⇒ ${stackedOff.length} shapes stack (${stackedOff.slice(0, 3).map((x) => x.at).join(', ')})`, stackedOff.length > 0, rowsOff.slice(0, 5));
  await load(); // the deleted rule back

  // ④ THE TOUR STEPS ASIDE
  const tour = await evalJs(`(async () => {
    const w = document.getElementById('welcome'); if (!w) return null;
    w.classList.remove('hidden'); w.classList.add('onboarding'); w.style.display = '';
    const p = app.runGuidedCli({ title: 'Install', cmd: 'true', hint: '', checkDone: async () => false });
    await new Promise((r) => setTimeout(r, 1500));
    const dlg = document.querySelector('.guided-cli-dialog');
    const during = { yield: w.classList.contains('ob-yield'), vis: getComputedStyle(w).visibility, dialog: !!dlg && dlg.getClientRects().length > 0 };
    const cancel = dlg && (dlg.querySelector('.dialog-close') || [...dlg.querySelectorAll('button')].find((b) => /取消|Cancel|关闭|Close/.test(b.textContent + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.title || '')))); // its ✕ (.dialog-close) — the first claim pressed nothing
    cancel?.click();
    await Promise.race([p, new Promise((r) => setTimeout(r, 5000))]);
    await new Promise((r) => setTimeout(r, 300));
    const after = { yield: w.classList.contains('ob-yield'), vis: getComputedStyle(w).visibility };
    w.classList.remove('onboarding'); w.classList.add('hidden');
    return { during, after, cancelled: !!cancel };
  })()`);
  check(`④ a guided window opened while the tour is up: the tour steps aside (${tour && tour.during.vis}) while the window is up, and is back (${tour && tour.after.vis}) once it closes`, !!tour && tour.during.dialog && tour.during.yield && tour.during.vis === 'hidden' && tour.cancelled && !tour.after.yield && tour.after.vis === 'visible', tour);

  // ⑤ THE DISK NOTICE ON A PHONE — the need line on its OWN row under the toolbar (the restack for 2.369.412: ui-needs-a-button's need
  // line MEETS ui-phone-and-fit's wrap mark; 主开发's ruling 2026-11-11 14:09Z, restated 2026-11-18 20:10Z): the toolbar stays ONE line
  // at a phone width with the notice shown and after each of its two doors is pressed. RED CONTROL: the notice put back INTO the bar
  // (where the release drew it) — the plant proven first — and the leg reads it red
  const file = path.join(CWD, 'notes.txt'); fs.writeFileSync(file, 'notes\n\nfirst\n');
  await phone(); await load();
  await evalJs(`app.openEditor(${JSON.stringify(file)}, 'notes.txt'); true`);
  const opened = await waitFor(`!!document.querySelector('.editor-toolbar') && !!document.querySelector('.cm-content')`, 15000);
  const BAR = `(() => { const bar = document.querySelector('.editor-toolbar'); if (!bar) return null; const kids = [...bar.children].filter((e) => e.getClientRects().length); const rows = (() => { const rs = kids.map((e) => e.getBoundingClientRect()).sort((a, b) => a.top - b.top); let n = 0, bottom = -Infinity; for (const r of rs) { if (r.top >= bottom - 0.5) { n++; bottom = r.bottom; } else bottom = Math.max(bottom, r.bottom); } return n; })(); const n = document.querySelector('.code-editor-disk-need'); const shown = !!n && getComputedStyle(n).display !== 'none' && n.getClientRects().length > 0; const r = n && n.getBoundingClientRect(), b = bar.getBoundingClientRect(); return { rows, h: Math.round(b.height), shown, inBar: !!n && bar.contains(n), below: !!r && shown && r.top >= b.bottom - 0.5, doors: n ? n.querySelectorAll('.need-door').length : 0, inside: !!r && r.left >= 0 && r.right <= innerWidth + 0.5, text: n ? n.textContent.trim().slice(0, 80) : '' }; })()`;
  const edit = async (txt) => { await evalJs(`(() => { const c = document.querySelector('.cm-content'); c.focus(); document.execCommand('insertText', false, ${JSON.stringify(txt)}); return true; })()`); await sleep(400); };
  const diskChange = async (txt) => { await sleep(1100); fs.writeFileSync(file, txt); await evalJs(`window.dispatchEvent(new Event('focus')); true`); return waitFor(`(() => { const n = document.querySelector('.code-editor-disk-need'); return !!n && getComputedStyle(n).display !== 'none'; })()`, 8000); };
  const gone = () => waitFor(`(() => { const n = document.querySelector('.code-editor-disk-need'); return !n || getComputedStyle(n).display === 'none'; })()`, 8000);
  if (opened) {
    await sleep(1500);
    await edit('mine ');
    const s1 = await diskChange('notes\n\nchanged on disk\n');
    const shown = await evalJs(BAR);
    await shot('disk-notice.390.png');
    check(`⑤ 390 × 844: an edited file changed on disk ⇒ the notice «${shown && shown.text}» on its OWN row under the toolbar (${shown && shown.doors} doors, inside the screen) and the toolbar ONE line`, s1 && !!shown && shown.shown && !shown.inBar && shown.below && shown.doors === 2 && shown.inside && shown.rows === 1, shown);
    await press('.code-editor-disk-need .need-door[data-door="disk-keep"]'); await gone();
    const kept = await evalJs(BAR);
    check('⑤ …«Keep my changes» pressed: the notice goes and the toolbar is still ONE line', !!kept && !kept.shown && kept.rows === 1, kept);
    await edit('more ');
    const s2 = await diskChange('notes\n\nchanged again\n');
    const yesBefore = await evalJs(`document.querySelectorAll('.dialog-footer .btn-create').length`);
    await press('.code-editor-disk-need .need-door[data-door="disk-reload"]');
    // the confirm of the dialog the reload OPENED — the newest one drawn (checkpoint 61: the first .btn-create in the page may be another dialog's)
    const asked = await waitFor(`[...document.querySelectorAll('.dialog-footer .btn-create')].filter((b) => b.getClientRects().length).length > 0 && document.querySelectorAll('.dialog-footer .btn-create').length > ${yesBefore}`, 8000);
    if (asked) { await evalJs(`(() => { const b = [...document.querySelectorAll('.dialog-footer .btn-create')].filter((x) => x.getClientRects().length).pop(); b.dataset.uf = 'reload-yes'; return true; })()`); await press('[data-uf="reload-yes"]'); }
    await gone();
    const reloaded = await evalJs(BAR);
    const doc = await evalJs(`(document.querySelector('.cm-content')?.textContent || '')`);
    check(`⑤ …«Reload from disk» pressed (and confirmed in the dialog it opened): the notice goes, the editor holds the disk's text («${doc.slice(0, 40)}»), and the toolbar is still ONE line`, s2 && asked && !!reloaded && !reloaded.shown && reloaded.rows === 1 && /changed again/.test(doc) && !/more /.test(doc), { s2, asked, reloaded, doc: doc.slice(0, 80) });
    // CONTROL (checkpoint 61): the measure can fail — a bar made to WRAP (its left part a whole row) reads TWO lines
    const wrapped = await evalJs(`(() => { const s = document.createElement('style'); s.id = 'zz-wrap-bar'; s.textContent = '.editor-toolbar { flex-wrap: wrap !important; } .editor-toolbar > .editor-toolbar-left { flex-basis: 100% !important; }'; document.head.appendChild(s); const r = ${BAR}; s.remove(); return r; })()`);
    check(`⑤ CONTROL: the toolbar made to wrap reads ${wrapped && wrapped.rows} lines by the same measure (a child that starts at or below the line's bottom starts a new one)`, !!wrapped && wrapped.rows === 2, wrapped);
    await edit('red ');
    await diskChange('notes\n\nchanged for the control\n');
    const plant = await evalJs(`(() => { const n = document.querySelector('.code-editor-disk-need'), left = document.querySelector('.editor-toolbar .editor-toolbar-left'); if (!n || !left) return null; left.append(n); return true; })()`);
    const red = await evalJs(BAR);
    check('⑤ RED CONTROL: the plant is in place (the notice inside the bar, as the release drew it) — and the own-row leg reads it red', plant === true && !!red && red.inBar && !(red.shown && !red.inBar && red.below && red.rows === 1), { plant, red });
  } else check('⑤ the editor opened the file', false);
  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 5));
} catch (e) {
  check('the suite ran to its end', false, String(e && e.stack || e));
}
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${fail ? ' passed, ' + fail + ' failed' : ''})`);
process.exit(fail ? 1 : 0);
