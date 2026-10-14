#!/usr/bin/env node
// THE BOOT SENTINEL (q-036 P0, lane affected-static-reach, 2026-10-14 — the owner: 「都按推荐来吧」). The affected heavy
// tier narrows a suite that only BOOTS the product to its static reach (scripts/reach-model.mjs): a change to
// channels-panel.js no longer runs the 150 suites that boot a page and never open Channels. What that gives up — a
// change that breaks the BOOT itself, a route that throws when it runs, a window that dies on open — is this suite's,
// `always: true`, on every push:
//   ① THE CENSUS (before any boot): every GET /api route the server files register (reach-model getRoutes — the same
//     derivation the attribution reads) is in exactly one row of scripts/fixtures/boot-sentinel-gets.json: `smoke`
//     (called here) or `skip` with its reason; a new GET in neither, a row no route answers, a reason-less skip = RED.
//     Every registered window type (reach-model windowRegistry — a new registerWindowType joins by itself) is opened
//     here unless its `windows.skip` row says why; a type with no open action and no row = RED.
//   ② A REAL BOOT: a scratch worktree of this tree (src/ public/ server.js package.json overlaid — what is about to
//     ship), its own HOME, server.js on a free port.
//   ③ EVERY GET: non-5xx, a JSON body parses when the route says JSON, ≤ 2 s each (`:params` filled from the table's
//     `fill` — a missing id answers 4xx, never 5xx).
//   ④ EVERY WINDOW TYPE: headless chrome on the page (the §47 passport), each type opened once through the registry's
//     own replay (app.replayOpenSpec({ action, …spec })) — a window of that type exists, no console error, no uncaught
//     exception — then closed. A live CONTROL plants a console.error and an uncaught throw inside one open: both RED.
// Budget ≤ 4 min (measured: SENTINEL_MS). SKIPs without chrome (the GET half still runs).
import { execSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ONBOARDED_SOURCE, vncEnv, scratch, scratchHome, freePort, endRootedProcesses, withoutVendorKeys } from './scratch.mjs';
import * as RM from './reach-model.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const T0 = Date.now();
let pass = 0, failed = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + String(e).slice(0, 600) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── ① THE CENSUS ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① the census (the tree\'s GET routes and window types against scripts/fixtures/boot-sentinel-gets.json)');
const TABLE = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/boot-sentinel-gets.json'), 'utf-8'));
const ls = spawnSync('git', ['-C', repo, 'ls-files', '--', 'src', 'server.js'], { encoding: 'utf-8' }).stdout.split('\n').filter((f) => /\.(?:m?js|cjs)$/.test(f));
const read = (f) => { try { return fs.readFileSync(path.join(repo, f), 'utf-8'); } catch { return ''; } };
const routes = RM.getRoutes(ls.filter((f) => !f.startsWith('src/lib/')).map((f) => [f, read(f)]));
const census = RM.getCensus(routes, TABLE);
ok(routes.length >= 200 && !census.unclassified.length, `every GET route is classified (${routes.length}: ${census.smoke.length} smoke, ${census.skip.length} skip with a reason)`, census.unclassified.length ? 'NEW — add each to smoke (read-only, answers fast) or skip with the reason:\n      ' + census.unclassified.join('\n      ') : '');
ok(!census.dead.length && !census.both.length && !census.reasonless.length, 'no dead row, no route in both lists, no skip without a reason', [...census.dead.map((p) => 'DEAD ' + p), ...census.both.map((p) => 'BOTH ' + p), ...census.reasonless.map((p) => 'NO REASON ' + p)].join(' · '));
const reg = RM.windowRegistry(ls.filter((f) => f.startsWith('src/lib/')).map((f) => [f, read(f)]));
const winSkip = (TABLE.windows && TABLE.windows.skip) || {};
const openable = [...reg.types].filter(([t]) => !Object.prototype.hasOwnProperty.call(winSkip, t));
const noAction = openable.filter(([, r]) => !r.actions.length).map(([t, r]) => `${t} (${r.file})`);
ok(reg.types.size >= 30 && !noAction.length, `every registered window type is opened here or skipped with a reason (${reg.types.size}: ${openable.length} opened, ${reg.types.size - openable.length} skipped)`, noAction.length ? 'no open action and no windows.skip row: ' + noAction.join(', ') : '');
const deadWin = Object.keys(winSkip).filter((t) => !reg.types.has(t));
ok(!deadWin.length && Object.values(winSkip).every((w) => String(w || '').trim()), 'every windows.skip row names a registered type and says why', deadWin.join(' '));

// ── ② A REAL BOOT ────────────────────────────────────────────────────────────────────────────────────────────────
console.log('② a real boot (a scratch worktree of this tree, its own HOME)');
const wt = scratch('boot-sentinel'), home = scratchHome('boot-sentinel-home');
const PORT = await freePort();
let srv = null, chrome = null;
const cleanup = () => {
  try { chrome && chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); endRootedProcesses(home); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { cleanup(); process.exit(143); });
// end what this run started BEFORE exiting: scratch.mjs removes its dirs on 'exit' first, and a live chrome or server
// would write into the removed HOME again (six vs-boot-sentinel-home-<pid> dirs were left that way)
const finish = async (code) => { cleanup(); await sleep(500); process.exit(code); }; // a SIGKILLed chrome needs a moment to let go of its profile
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) { fs.rmSync(path.join(wt, f), { recursive: true, force: true }); fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true }); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'sentinel.md'), '# The sentinel\n\nA page the doc / file / editor windows open.\n');
fs.mkdirSync(path.join(wt, 'sentinel-dir'), { recursive: true }); fs.writeFileSync(path.join(wt, 'sentinel-dir', 'a.txt'), 'a\n');
fs.writeFileSync(path.join(wt, 'sentinel-dir', 'a.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')); // the viewer's own kind (a .txt opens the editor, a .md the doc)
// the table's {path} / {dir} / {cwd} fills: the sentinel's own fixture files (a query a route needs, a window's spec)
const FILLS = { path: path.join(wt, 'sentinel.md'), txt: path.join(wt, 'sentinel-dir', 'a.txt'), png: path.join(wt, 'sentinel-dir', 'a.png'), dir: path.join(wt, 'sentinel-dir'), cwd: wt, sid: 'sentinel-view', task: '' }; // {sid}: a view of no conversation — the chat window opens on nothing (no transcript written, none discovered)
const filled = (v) => (typeof v === 'string' ? v.replace(/\{(path|txt|png|dir|cwd|sid|task)\}/g, (_, k) => FILLS[k]) : v);
const fillSpec = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, filled(v)]));
const env = { ...withoutVendorKeys(process.env), ...VNC_ENV, HOME: home, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
const srvLog = [];
srv = spawn(process.execPath, ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
for (const s of [srv.stdout, srv.stderr]) s.on('data', (d) => { if (srvLog.length < 400) srvLog.push(String(d)); });
let up = false;
const tBoot = Date.now();
for (let i = 0; i < 240 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${PORT}/api/home`)).status < 500; } catch { await sleep(250); } }
ok(up, `the server boots and answers (${Date.now() - tBoot} ms)`, up ? '' : srvLog.join('').slice(-1500));
if (!up) { console.log(`\n${failed} FAILED`); await finish(1); }
// the jobs engine settles after the listen (its routes answer 503 'starting' until then): wait ≤ 20 s, then judge
let jobsUp = false;
for (let i = 0; i < 80 && !jobsUp; i++) { try { jobsUp = (await fetch(`http://127.0.0.1:${PORT}/api/jobs`)).status !== 503; } catch { } if (!jobsUp) await sleep(250); }
ok(jobsUp, `the jobs engine settles (${Date.now() - tBoot} ms after the spawn)`);

// ── ③ EVERY GET ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log(`③ every GET of the census (${census.smoke.length} routes, ≤ ${TABLE.budgetMs || 2000} ms each)`);
const fill = { ...(TABLE.fill || {}) };
const tGets = Date.now();
const bad = [], slow = [];
const seen = [];
for (const p of census.smoke) {
  const q = TABLE.query && TABLE.query[p] ? '?' + filled(TABLE.query[p]).split('&').map((kv) => { const i = kv.indexOf('='); return `${kv.slice(0, i)}=${encodeURIComponent(kv.slice(i + 1))}`; }).join('&') : '';
  const url = `http://127.0.0.1:${PORT}${RM.fillRoute(p, fill)}${q}`;
  const t = Date.now();
  let verdict;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'manual' });
    const body = await r.text();
    verdict = RM.getVerdict({ status: r.status, type: r.headers.get('content-type') || '', body, ms: Date.now() - t, budgetMs: TABLE.budgetMs || 2000, allow: (TABLE.answers && TABLE.answers[p] && TABLE.answers[p].status) || [] });
  } catch (e) { verdict = { ok: false, why: `threw — ${e.message}`, ms: Date.now() - t }; }
  seen.push(`${p} ${verdict.status ?? '-'} ${verdict.ms} ms`);
  if (!verdict.ok) (/slow/.test(verdict.why) ? slow : bad).push(`GET ${p} — ${verdict.why}`);
}
if (process.env.SENTINEL_DUMP) fs.writeFileSync(process.env.SENTINEL_DUMP, seen.join('\n') + '\n');
ok(!bad.length, `every smoked GET answers non-5xx and its JSON parses (${census.smoke.length} in ${Date.now() - tGets} ms)`, bad.join('\n    '));
ok(!slow.length, `every smoked GET answers within ${TABLE.budgetMs || 2000} ms`, slow.join('\n    '));

// a Task Group for the task window (the sidebar loads it at the page's boot)
try { FILLS.task = (await (await fetch(`http://127.0.0.1:${PORT}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Sentinel' }) })).json()).task.id; } catch { }
ok(!!FILLS.task, `a fixture Task Group for the task window (${FILLS.task || 'none'})`);
// ── ④ EVERY WINDOW TYPE ──────────────────────────────────────────────────────────────────────────────────────────
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log(`④ SKIP: no chrome/chromium — the window half is not judged\n\n${failed ? `${failed} FAILED` : `ALL PASS (${pass})`} · ${Math.round((Date.now() - T0) / 1000)} s`); await finish(failed ? 1 : 0); }
console.log(`④ every window type opened once (${openable.length}) — headless chrome`);
const CDP_PORT = await freePort();
const profile = path.join(home, 'chrome');
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,900', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
ok(!!target, 'chrome exposes a page target');
if (!target) await finish(1);
const WebSocket = require('ws');
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map(); const events = [];
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') events.push({ kind: 'uncaught', text: m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown' });
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') events.push({ kind: 'console.error', text: (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300) });
});
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaljs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? { error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text } : r.result?.result?.value; };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
let ready = false;
for (let i = 0; i < 200 && !ready; i++) { ready = await evaljs(`(async () => { if (!window.app || !window.app.ready) return false; await Promise.race([window.app.ready, new Promise(r => setTimeout(r, 100))]); return !!document.querySelector('.sidebar'); })()`).catch(() => false); if (ready !== true) { ready = false; await sleep(300); } }
const bootErrors = events.splice(0);
ok(ready === true, 'the page boots (app.ready, the workspace drawn)');
ok(!bootErrors.length, 'no console error and no uncaught exception during the page boot', bootErrors.map((e) => `${e.kind}: ${e.text}`).join(' | '));
const specs = (TABLE.windows && TABLE.windows.spec) || {};
const openOne = async (type, action, spec, plant = '') => {
  events.length = 0;
  const r = await evaljs(`(async () => {
    const before = new Set(app.wm.windows.keys());
    // every window CREATED during the open counts (a replay of an unknown record may close its window before it paints)
    const created = [], own = Object.prototype.hasOwnProperty.call(app.wm, 'createWindow'), orig = app.wm.createWindow;
    app.wm.createWindow = function (o) { created.push(o && o.type); return orig.apply(this, arguments); };
    let threw = null;
    try { ${plant} const w = app.replayOpenSpec(${JSON.stringify({ action, ...spec })}); if (w && typeof w.then === 'function') await w; } catch (e) { threw = String(e && e.stack || e).slice(0, 400); }
    await new Promise((r) => setTimeout(r, 600));
    if (own) app.wm.createWindow = orig; else delete app.wm.createWindow;
    const fresh = [...app.wm.windows.entries()].filter(([id]) => !before.has(id));
    const types = [...new Set([...created, ...fresh.map(([, w]) => w.type)])];
    for (const [id] of fresh) { try { app.wm.closeWindow(id); } catch {} }
    await new Promise((r) => setTimeout(r, 150));
    return { threw, types, n: created.length };
  })()`);
  await sleep(50);
  return { ...(r && !r.error ? r : { threw: r && r.error, types: [], n: 0 }), events: events.splice(0) };
};
const tWin = Date.now();
const winBad = [];
for (const [type, rec] of openable) {
  const action = rec.actions.find((a) => specs[a]) || rec.actions[0]; // the action the table gives a spec for, else the first
  const r = await openOne(type, action, fillSpec(specs[action]));
  const v = RM.windowVerdict({ type, ...r });
  if (!v.ok) winBad.push(`${type} (${action}) — ${v.why}`);
  else console.log(`    · ${type} via ${action}: ${r.n} window(s) [${r.types.join(', ')}]`);
}
ok(!winBad.length, `every window type opens with no console error and no uncaught exception (${openable.length} in ${Date.now() - tWin} ms)`, winBad.join('\n    '));
// THE LIVE CONTROL: the same open, with a console.error and an uncaught throw planted inside it — both must be RED
{
  const [type, rec] = openable.find(([t]) => t === 'usage') || openable[0];
  const c1 = RM.windowVerdict({ type, ...(await openOne(type, rec.actions[0], fillSpec(specs[rec.actions[0]]), "console.error('sentinel control: a planted console error');")) });
  const c2 = RM.windowVerdict({ type, ...(await openOne(type, rec.actions[0], fillSpec(specs[rec.actions[0]]), "setTimeout(() => { throw new Error('sentinel control: a planted uncaught throw'); }, 0);")) });
  ok(!c1.ok && /console\.error/.test(c1.why) && !c2.ok && /uncaught/.test(c2.why), `CONTROL: a planted console.error and a planted uncaught throw inside one open are both RED (${c1.why.slice(0, 80)} · ${c2.why.slice(0, 80)})`);
}
ws.close();
const total = Date.now() - T0;
ok(total <= 240000, `the sentinel's budget: ≤ 4 min (${Math.round(total / 1000)} s)`);
console.log(`\n${failed ? `${failed} FAILED` : `ALL PASS (${pass})`} · ${Math.round(total / 1000)} s`);
await finish(failed ? 1 : 0);
