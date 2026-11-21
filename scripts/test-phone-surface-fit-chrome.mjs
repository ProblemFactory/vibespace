#!/usr/bin/env node
// AT 390 PX NO CONTROL OUTGROWS ITS SURFACE — DRAWN (lane bl-phone-ui, 主开发 r1198 unit 1; the tree's half is
// test-phone-surface-fit). Three rows in a month (B-16ab, B-0406, B-081b) were found by a person or a hosted picture, never by
// a gate: this suite opens EVERY surface of scripts/phone-surface-census.mjs's derived list that has an OPENER, on a phone,
// and measures it. A throwaway server in a git worktree (the tree under test's src/ + built public/, its client bundle
// rebuilt beside a probe entry that hands the openers' modules to the page), seeded as test-ui-fit-chrome seeds it (named
// accounts — one with a sixty-character name — and a pool, the CLI stand-ins of the owner's layout, the runner's planted
// states), one Task Group; headless Chrome over raw CDP at 390 × 844, DPR 3, touch, hover: none, pointer: coarse; zh, then en.
//   EACH SURFACE (opened by its one call, found as the family's NEW element or its declared root, measured once its box reads
//   the same twice): L1 its box inside the screen · L2 nothing past its inner box (a descendant under a sideways clip below
//   the surface is judged through that clip) · L3 no scroller in it (it too) wider inside than it is — but a DECLARED one
//   with its why — and the page never scrolls sideways. AS LAWS AGAINST THE RATCHET (census RATCHET: today's reds, a count a
//   surface × language × law): more is red (a new red), fewer is red (lower the row), equal is green. An opener that opens
//   nothing is red by name. L4 (primary controls ≥ 44 px, field text ≥ 16 px) is MEASURED AND PRINTED a surface — not a law
//   (主开发 rules on it from the numbers). Each red's picture is kept (VS_UI_SHOTS_DIR / --shots).
//   RED CONTROLS (each proves a law bites in this very page): ① a 600 px child planted on an opened dialog — L2 by its
//   name (the dialog clips sideways), the same child in its body — L3 names the body (a scroller), the dialog moved 200 px
//   right — L1; ② B-16ab (2)'s old rule (the Agents dialog's body min-width 380 px) planted
//   back — the Agents dialog's L2 + L3 grows over its own count; ③ a long-option select planted in a Settings row, the row
//   measured as its own surface: inside it with B-0406's two rules, past it (L2 by name) with just those two lifted
// A SURFACE'S DRAWS: its opener, then each `also` variant of census OPENERS (the shared input / confirm shell drawn as both;
// the phone's sheet from «+» and from ⋯) — each its own row (`key~label`) in the run and in the ratchet.
// THE FIRST RUN IS RED BY DESIGN: RATCHET starts empty, so today's reds read NEW; that counted run (hosted) prints RATCHET-NOW
// and keeps a picture of every red — its table is committed, then the suite is green at the reds it holds.
// Prints the suite's time a family (dialogs; menus and popovers; views) and in all, the excuses counted, RATCHET-NOW (the
// table this run would write) and the L4 table. Run: node scripts/test-phone-surface-fit-chrome.mjs [--family dialogs|menus|views]
//   [--langs zh,en] [--shots <dir>]. Requires google-chrome (SKIP without) and a fresh `npm run build`.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, CHROME_QUIET } from './scratch.mjs';
import { loadPage } from './cdp-page-load.mjs';
import { mintRoot, startHub, DAEMON_ROOT_ENV } from './hub-boot.mjs';   // THE SUITES' ONE HUB BOOT (test-architecture §57c)
import { armWatchdog } from './suite-watchdog.mjs';
import * as C from './phone-surface-census.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.log('✗ no public/bundle.js — run `npm run build` first'); process.exit(1); }
const FAMILIES = (arg('--family') || 'dialogs,menus,views').split(',').filter(Boolean);
const LANGS = (arg('--langs') || 'zh,en').split(',').filter(Boolean);
const T0 = performance.now();
const secs = (t) => ((performance.now() - t) / 1000).toFixed(1);

const [PORT, CDP_PORT] = await freePorts(2);
const root = mintRoot('phone-surface-fit');
const wt = path.join(root, 't');
const fakeHome = path.join(root, 'home');
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });   // rule nine (hub-boot.mjs)
for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
const chromeDir = scratch('phone-surface-fit-chrome');
const SHOTS = arg('--shots') ? path.resolve(arg('--shots')) : process.env.VS_UI_SHOTS_DIR ? path.join(process.env.VS_UI_SHOTS_DIR, 'test-phone-surface-fit-chrome') : scratch('phone-surface-fit-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const ORIGIN = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check(name, cond): the name goes FIRST and the condition is a boolean (got a ${typeof c})`); if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// THE CLI SHAPE (test-ui-fit-chrome's: the Agents dialog's widest rows depend on the machine) — a claude and a codex stand-in in
// the scratch HOME's ~/.local/bin, found through a scratch login shell; the hub's own PATH keeps no directory with either
const SHAPE_DIR = path.join(fakeHome, '.vs-shape', 'installed'), CLI_BIN = path.join(fakeHome, '.local', 'bin'), TOOLS = path.join(fakeHome, '.vs-shape', 'tools');
for (const d of [SHAPE_DIR, CLI_BIN, TOOLS]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(CLI_BIN, 'claude'), '#!/bin/sh\n[ "$1" = --version ] && { echo "2.1.314 (Claude Code)"; exit 0; }\nexit 1\n', { mode: 0o755 });
fs.writeFileSync(path.join(CLI_BIN, 'codex'), '#!/bin/sh\n[ "$1" = --version ] && { echo "codex-cli 0.130.0"; exit 0; }\nexit 1\n', { mode: 0o755 });
fs.symlinkSync(['/usr/bin/printenv', '/bin/printenv'].find((p) => fs.existsSync(p)) || '/usr/bin/printenv', path.join(TOOLS, 'printenv'));
fs.writeFileSync(path.join(SHAPE_DIR, 'login-shell'), `#!/bin/sh\nPATH='${CLI_BIN}:${TOOLS}:/usr/bin:/bin'; export PATH\nwhile [ $# -gt 0 ]; do case "$1" in -c) shift; exec /bin/sh -c "$1";; *) shift;; esac; done; exec /bin/sh -i\n`, { mode: 0o755 });
const hubPath = (process.env.PATH || '').split(':').filter((d) => d && !['claude', 'codex'].some((n) => fs.existsSync(path.join(d, n)))).join(':');

// ── the list, the throwaway server and its probe bundle ──
const list = C.deriveSurfaces(repo);
const tables = C.checkTables(list);   // the fast suite's verdict on the tables, said here too
const want = list.filter((s) => FAMILIES.includes(s.family));
const opened = want.filter((s) => C.openerOf(s)), excused = want.filter((s) => !C.openerOf(s));
const draws = opened.flatMap((s) => C.drawsOf(s).map((d) => ({ ...d, s })));   // a surface's opener, then its variants (key~label)
console.log(`the list: ${list.length} surfaces (derived from the tree) — this run's families ${FAMILIES.join(', ')}: ${opened.length} with an opener, ${excused.length} excused (EXCUSE_CEILING ${C.EXCUSE_CEILING} over every family) · langs ${LANGS.join(', ')}`);
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
// THE PROBE ENTRY: the client itself, then every module an opener names — ONE bundle, so the openers share the client's
// module instances (its dialog families, its i18n) — handed to the page as window.__fitMods by file name
const mods = C.openerModules(list);
const entry = ["import './client.js';", ...mods.map((m, k) => `import * as m${k} from './${path.relative('src', m)}';`),
  `window.__fitMods = { ${mods.map((m, k) => `${JSON.stringify(path.basename(m, '.js'))}: m${k}`).join(', ')} };`].join('\n');
fs.writeFileSync(path.join(wt, 'src', 'fit-probe-entry.js'), entry + '\n');
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const tb = performance.now();
await esbuild.build({ entryPoints: [path.join(wt, 'src/fit-probe-entry.js')], bundle: true, outfile: path.join(wt, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'silent' });
console.log(`  (the probe bundle: the client + ${mods.length} modules, built in ${secs(tb)} s)`);
const srvEnv = { ...process.env, ...VNC_ENV, PORT: String(PORT), HOST: '127.0.0.1', HOME: fakeHome, PATH: hubPath, SHELL: path.join(SHAPE_DIR, 'login-shell'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1', VS_NO_REAL_CLI: '1' };
for (const k of ['CLAUDE_CMD', 'CODEX_CMD', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) delete srvEnv[k];
for (const k of DAEMON_ROOT_ENV) delete srvEnv[k];
const hub = startHub({ root, tree: wt, port: PORT, env: srvEnv });
const chromeEnv = { ...process.env, HOME: chromeHome }; delete chromeEnv.DBUS_SESSION_BUS_ADDRESS; delete chromeEnv.DISPLAY;
const chrome = spawn(CHROME, [...CHROME_QUIET, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env: chromeEnv });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch { } try { fs.rmSync(chromeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } });
const PENDS = new Map();
armWatchdog({ capMs: 840e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((performance.now() - x.at) / 1000).toFixed(1)} s)`) });
if (!(await hub.ready({ ms: 40000 }))) console.log(`  (the hub did not answer in 40 s — its log:)\n${hub.log().slice(-2000)}`);
const api = async (p, body) => (await fetch(ORIGIN + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
const FX = {};
for (const [k, n] of [['A', 'Work Max'], ['B', 'Personal Max'], ['L', 'A very long subscription account name that runs to sixty chars']]) FX[k] = (await api('/api/accounts/subscription', { name: n })).id;
FX.P = (await api('/api/accounts/pool', { name: 'Main pool', members: [FX.A, FX.B] })).id;
const tg = await api('/api/tasks', { name: 'A Task Group whose name runs long enough to wrap twice on a phone' });
FX.task = tg && (tg.id || tg.task?.id || tg.taskId) || null;
check('the fixture stands: three accounts, a pool, a Task Group', !!(FX.A && FX.B && FX.L && FX.P && FX.task), FX);
check('the census tables are whole against the tree (test-phone-surface-fit\'s verdict)', tables.problems.length === 0, tables.problems.slice(0, 6));

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
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; PENDS.set(id, { method, at: performance.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const waitFor = async (expr, ms = 15000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(120); } try { return await evalJs(expr); } catch { return false; } };
const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name.replace(/[^A-Za-z0-9 _.-]/g, '_') + '.png'), Buffer.from(r.data, 'base64')); return true; } catch { return false; } };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
// the runner's planted states (test-ui-fit-chrome's): no rclone, the agent-hooks refusal with a path of the runner's shape
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
// THE PAGE'S HELPERS: the fixture, an anchor of the suite's own, the family finder, the closer
const FAMILY_SEL = { dialog: '.dialog', menu: '.context-menu, .taskbar-context-menu, [data-popover]', popover: '[data-popover]', view: '.window' };
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  window.__fitFx = ${JSON.stringify(FX)};
  const vis = (e) => { if (!e || !e.getClientRects().length) return false; const c = getComputedStyle(e); return c.visibility !== 'hidden' && c.display !== 'none'; };
  const SEL = ${JSON.stringify(FAMILY_SEL)};
  window.__fitAnchor = () => { let a = document.getElementById('fit-anchor'); if (!a) { a = document.createElement('button'); a.id = 'fit-anchor'; a.textContent = '·'; a.style.cssText = 'position:fixed;left:205px;top:160px;width:24px;height:24px;z-index:1'; document.body.appendChild(a); } return a; };
  window.__fitMark = (kind) => { document.querySelectorAll(SEL[kind]).forEach((e) => { if (vis(e)) e.dataset.fitSeen = '1'; }); };
  window.__fitFind = (kind, rootSel) => {
    document.querySelectorAll('[data-fit-root]').forEach((e) => delete e.dataset.fitRoot);
    const e = rootSel ? [...document.querySelectorAll(rootSel)].filter(vis).pop() : [...document.querySelectorAll(SEL[kind])].filter((x) => vis(x) && !x.dataset.fitSeen).pop();
    if (!e) return null;
    e.dataset.fitRoot = '1'; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',');
  };
  window.__fitClose = () => {
    const r = document.querySelector('[data-fit-root]');
    if (r) {
      delete r.dataset.fitRoot;
      if (r.closest('#dialog-overlay')) { r.classList.add('hidden'); document.getElementById('dialog-overlay').classList.add('hidden'); }
      else if (r.closest('.dialog-overlay')) r.closest('.dialog-overlay').remove();
      else if (!r.matches('.window')) r.remove();
    }
    document.querySelectorAll('[data-popover], .context-menu, .taskbar-context-menu').forEach((e) => e.remove());
    document.querySelectorAll('.dialog-overlay:not(#dialog-overlay)').forEach((e) => e.remove());
    document.getElementById('fit-anchor')?.remove();
    document.querySelectorAll('[data-fit-seen]').forEach((e) => delete e.dataset.fitSeen);
  };
})();` });
const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }); };
let curLang = null;
const load = async (lang) => {
  await loadPage(cdp, ORIGIN + '/', { bootMs: 60000 });
  if (lang !== curLang) {   // the language is read at boot: set it, then the second load is in it
    await evalJs(`(() => { try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {} return true; })()`);
    await loadPage(cdp, ORIGIN + '/', { bootMs: 60000 });
    curLang = lang;
  }
  return (await waitFor(`!document.getElementById('loading-screen') && !!window.app && !!window.__fitMods`, 40000));
};
await phone();
const DECL = C.DECLARED_SCROLLERS.map((d) => d.sel);
const MEASURE = (rootExpr) => evalJs(`(${C.MEASURE_SOURCE})(${rootExpr}, ${JSON.stringify(DECL)})`);
/** open one draw of a surface: its one call (8 s bound), its root (5 s), then SETTLED — its box, its scroll size and its count
 *  of elements read the same twice, 130 ms apart (≤ 2 s; the reader's 9: a full-screen root reads the same size at once while
 *  its rows still arrive) → { at, m } | { failed } */
const openAndMeasure = async (s, o = C.openerOf(s)) => {
  await evalJs(`window.__fitMark(${JSON.stringify(s.kind)})`);
  const ran = await evalJs(`(async () => { const app = window.app, M = window.__fitMods, FX = window.__fitFx, anchor = window.__fitAnchor;
    const go = (async () => { ${o.open}; })(); return await Promise.race([go.then(() => 'ok', (e) => 'threw: ' + (e && e.message || e)), new Promise((r) => setTimeout(() => r('ok-pending'), 8000))]); })()`).catch((e) => 'threw: ' + e.message);
  if (String(ran).startsWith('threw')) return { failed: `the opener ${ran}` };
  let at = null; const t1 = performance.now();
  while (performance.now() - t1 < 5000 && !(at = await evalJs(`window.__fitFind(${JSON.stringify(s.kind)}, ${JSON.stringify(o.root || null)})`).catch(() => null))) await sleep(120);
  if (!at) return { failed: `no ${o.root || FAMILY_SEL[s.kind]} appeared in 5 s (the opener said ${ran})` };
  const KEY = `(() => { const r = document.querySelector('[data-fit-root]'); if (!r) return null; const b = r.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height), r.scrollWidth, r.scrollHeight, r.getElementsByTagName('*').length].join(','); })()`;
  for (let k = 0, prev = await evalJs(KEY).catch(() => null); k < 16; k++) { await sleep(130); const now = await evalJs(KEY).catch(() => null); if (now === prev) break; prev = now; }
  const m = await MEASURE(`document.querySelector('[data-fit-root]')`).catch((e) => ({ error: e.message }));
  if (m.error) return { failed: `the measure threw: ${m.error}` };
  return { at, m };
};
/** close a draw: its own close first (a dialog the page keeps — the new-conversation dialog's ✕), then the helper's sweep */
const close = async (d) => {
  if (d && d.close) await evalJs(`(async () => { const app = window.app, M = window.__fitMods; ${d.close}; })()`).catch(() => {});
  await evalJs(`window.__fitClose()`).catch(() => {});
};

// ── the census ──
const results = [], failed = [], l4 = [], timing = {};
for (const lang of LANGS) {
  check(`[${lang}] the phone page booted with the probe bundle (window.__fitMods)`, await load(lang));
  for (const fam of FAMILIES) {
    const tf = performance.now();
    const these = draws.filter((d) => d.s.family === fam);
    console.log(`── [${lang}] ${fam}: ${these.length} draws of ${new Set(these.map((d) => d.s.key)).size} surfaces with an opener ──`);
    let since = 0;
    for (const d of these) {
      const s = d.s;
      if (since >= 20) { await load(lang); since = 0; }
      const ts = performance.now(), e0 = pageErrors.length;
      const r = await openAndMeasure(s, d);
      if (r.failed) {
        failed.push({ key: d.key, lang, why: r.failed });
        check(`[${lang}] ${d.key} opens (${s.file || 'view'})`, false, r.failed);
        await shot(`${lang}-OPENER-${d.key}`);
        await load(lang); since = 0; continue;
      }
      const { m } = r, row = { key: d.key, lang, L1: m.L1.length, L2: m.L2.length, L3: m.L3.length };
      results.push(row);
      l4.push({ key: d.key, lang, n: m.L4.n, small: m.L4.small, font: m.L4.font, ex: m.L4.ex });
      const v = C.judge([row]);
      const bad = v.filter((x) => x.verdict === 'new' || x.verdict === 'cured');
      const red = row.L1 + row.L2 + row.L3 > 0;
      if (red) await shot(`${lang}-${d.key}`);
      const said = `L1 ${row.L1} · L2 ${row.L2} · L3 ${row.L3} (ratchet ${['L1', 'L2', 'L3'].map((l) => C.RATCHET[d.key]?.[lang]?.[l] || 0).join('/')}) · L4 ${m.L4.small}/${m.L4.n} small, ${m.L4.font} small text · ${secs(ts)} s`;
      check(`[${lang}] ${d.key} — ${said}`, bad.length === 0,
        bad.map((x) => `${x.law} ${x.verdict === 'new' ? 'NEW' : 'CURED — lower the ratchet row'}: ${x.now} (was ${x.was})`).join('; ') + ' — ' + JSON.stringify({ box: m.box, L1: m.L1.slice(0, 3), L2: m.L2.slice(0, 5), L3: m.L3.slice(0, 3) }));
      if (pageErrors.length > e0) console.log(`      (the page threw while it was open: ${pageErrors.slice(e0).map((x) => String(x).split('\n')[0]).join(' | ').slice(0, 300)})`);
      if (s.family !== 'views' || !s.key.startsWith('view:settings:')) { await close(d); if (s.family === 'views') { await load(lang); since = 0; } }
      since++;
    }
    if (fam === 'views') await load(lang);
    timing[`${lang} ${fam}`] = secs(tf);
    // the table so far, after every family (a run cut short by its watchdog still leaves what it measured)
    console.log(`  RATCHET-SO-FAR (${lang} ${fam}, ${secs(T0)} s): ${JSON.stringify(C.ratchetOf(results))}`);
  }
}

// ── RED CONTROLS: each law bites in this very page ──
{
  const lang = LANGS[0];
  console.log(`── RED CONTROLS [${lang}] ──`);
  await load(lang);
  // ① a planted 600 px child (L2 + L3 by its name), the dialog moved 200 px right (L1)
  const input = list.find((s) => s.key === 'dialog:utils:_modalShell');
  const r1 = input && await openAndMeasure(input);
  if (r1 && !r1.failed) {
    const m = await MEASURE(`(() => { const r = document.querySelector('[data-fit-root]'); const p = document.createElement('div'); p.id = 'fit-plant-wide'; p.style.cssText = 'width:600px;height:20px;flex:none'; p.textContent = 'planted'; r.appendChild(p); return r; })()`);   // on the dialog itself: under no clip of its own (the body scrolls — a plant there is the body's L3)
    check('CONTROL ①: a 600 px child planted on the dialog itself — L2 names it (the dialog clips sideways: what runs past is cut, so L2 is the law that sees it)', m.L2.some((x) => x.el.includes('fit-plant-wide')), { L2: m.L2.slice(0, 3), L3: m.L3.slice(0, 3) });
    const mb = await MEASURE(`(() => { const r = document.querySelector('[data-fit-root]'); document.getElementById('fit-plant-wide')?.remove(); const b = r.querySelector('.dialog-body'); const p = document.createElement('div'); p.id = 'fit-plant-body'; p.style.cssText = 'width:600px;height:20px;flex:none'; (b || r).appendChild(p); return r; })()`);
    check('CONTROL ①c: the same child in the dialog\'s body (a scroller) — L3 names the body', mb.L3.some((x) => /dialog-body/.test(x.el)), { L2: mb.L2.slice(0, 3), L3: mb.L3.slice(0, 3) });
    await evalJs(`document.getElementById('fit-plant-body')?.remove()`);
    const m2 = await MEASURE(`(() => { const r = document.querySelector('[data-fit-root]'); r.style.position = 'relative'; r.style.left = '200px'; return r; })()`);
    check('CONTROL ①b: the dialog moved 200 px right — L1 names it', m2.L1.length === 1, m2.L1);
    await close(input);
  } else check('CONTROL ①: the input dialog opened for the plant', false, r1 && r1.failed);
  // ② B-16ab (2)'s old rule planted back: the Agents dialog's body runs past the dialog
  const agents = list.find((s) => s.key === 'dialog:agents-dialog-overlay');
  await evalJs(`(() => { const st = document.createElement('style'); st.id = 'fit-control'; st.textContent = '.dialog.agents-dialog .agents-dialog-body { min-width: 380px !important; }'; document.head.appendChild(st); return true; })()`);
  const r2 = agents && await openAndMeasure(agents);
  const base2 = results.find((x) => x.key === 'dialog:agents-dialog-overlay' && x.lang === lang), was2 = base2 ? base2.L2 + base2.L3 : null;
  check(`CONTROL ②: B-16ab (2)'s old rule (the body's 380 px floor) — the Agents dialog's L2 + L3 grows over its own count without it (${was2})`, !!(r2 && !r2.failed && was2 !== null && (r2.m.L2.length + r2.m.L3.length) > was2), r2 && (r2.failed || { L2: r2.m.L2.slice(0, 3), L3: r2.m.L3.slice(0, 3), was: was2 }));
  await evalJs(`document.getElementById('fit-control')?.remove()`); await close(agents);
  // ③ B-0406's block lifted with a planted long-option select in the Settings view: L2 names the planted control
  await load(lang);
  const sv = list.find((s) => s.key.startsWith('view:settings:'));
  const r3 = sv && await openAndMeasure(sv);
  if (r3 && !r3.failed) {
    const PLANT = `(() => { const r = document.querySelector('[data-fit-root]'); const row = r.querySelector('.settings-row'); if (!row) return null;
      const c = row.cloneNode(false); c.id = 'fit-plant-row'; c.innerHTML = '<div class="settings-row-label"><span>A setting</span></div><div class="settings-row-control" id="fit-plant-ctl"><select class="settings-select" id="fit-plant-select"><option>' + 'An option label long enough to be wider than the phone itself on one line'.repeat(2) + '</option></select></div>';
      row.parentElement.insertBefore(c, row); return r; })()`;
    // the planted row is measured AS ITS OWN SURFACE (the view's body clips sideways — style.css .settings-body: a plant judged
    // from the view's root would sit under that clip, the reader's 10): its control inside it, then not
    const planted = await evalJs(`!!${PLANT}`);
    const kept = planted && await MEASURE(`document.getElementById('fit-plant-row')`);
    check('CONTROL ③: B-0406\'s block in place — the planted long-option select stays inside its row (the row measured as a surface)', !!(kept && kept.L2.length === 0), kept && { L2: kept.L2.slice(0, 3) });
    // ONLY B-0406's two rules out (the base's own .settings-row-control rules stay): by their exact selectors and declarations
    const out = await evalJs(`(() => { let n = 0; for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; } for (let i = rules.length - 1; i >= 0; i--) { const r = rules[i], t = r.selectorText || '';
      if ((t === '.settings-row-control' && r.style.maxWidth === '100%' && r.style.flexShrink === '1') || t === '.settings-row-control > .settings-select, .settings-combobox > .settings-select') { sh.deleteRule(i); n++; } } } return n; })()`);
    const lifted = await MEASURE(`document.getElementById('fit-plant-row')`);
    check(`CONTROL ③b: B-0406's two rules lifted from the live sheet (${out} taken out) — L2 names the planted control past its row`, out === 2 && lifted.L2.some((x) => x.el.includes('fit-plant')), { out, L2: lifted.L2.slice(0, 4) });
  } else check('CONTROL ③: the Settings view opened for the plant', false, r3 && r3.failed);
}

// ── what the run says ──
const all = C.judge(results);
const listedNotRun = Object.keys(C.RATCHET).filter((k) => want.some((s) => s.key === k.split('~')[0]) && !results.some((r) => r.key === k));
check('every ratchet row of these families was measured (a row for a surface that did not open is red)', listedNotRun.length === 0, listedNotRun);
console.log('\n── L4 (the finger rule — printed, not a law): primary controls under 44 px and field text under 16 px, a surface ──');
for (const x of l4) if (x.small || x.font) console.log(`  ${x.lang} ${x.key}: ${x.small}/${x.n} small, ${x.font} small text  ${x.ex.join(' · ').slice(0, 220)}`);
console.log(`  L4 in all: ${l4.reduce((a, x) => a + x.small, 0)} controls under 44 px and ${l4.reduce((a, x) => a + x.font, 0)} fields under 16 px over ${l4.length} surface draws (${l4.filter((x) => x.small || x.font).length} with any)`);
console.log(`\nRATCHET-NOW (the table this run would write; ${Object.keys(C.ratchetOf(results)).length} surfaces red today):\n${JSON.stringify(C.ratchetOf(results), null, 1)}`);
console.log(`\nexcused (not opened): ${excused.length} of this run's families — EXCUSE_CEILING ${C.EXCUSE_CEILING} over the whole list; opener failures: ${failed.length}${failed.length ? ' — ' + failed.map((f) => `${f.lang} ${f.key}`).join(', ') : ''}`);
console.log(`the verdicts: ${all.filter((x) => x.verdict === 'new').length} new, ${all.filter((x) => x.verdict === 'cured').length} cured-but-listed, ${all.filter((x) => x.verdict === 'held').length} held at the ratchet`);
const total = secs(T0);
console.log(`THE SUITE'S TIME: ${total} s in all — ${Object.entries(timing).map(([k, v]) => `${k} ${v} s`).join(' · ')}${Number(total) > 600 ? ' — OVER TEN MINUTES: split by family (--family dialogs | menus | views)' : ''}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
