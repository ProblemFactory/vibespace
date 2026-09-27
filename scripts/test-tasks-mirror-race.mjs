#!/usr/bin/env node
// THE TASK-GROUP MIRROR NEVER GOES BACKWARDS (R4 verify r1, 2026-09-27 — the
// test-channels-e2e ⑮ flake: "the Grant access… roster and the Reach roster
// were empty on 1 of 3 runs"). Heavy tier: a real worktree server + headless
// chrome.
//
// THE RACE, named. At page load TWO `GET /api/tasks` are in flight — the
// sidebar's boot fetch (`_initTasks`) and the ws-connect refetch (app.js's
// reconnect handler runs on the first connect too) — both answered by the
// server BEFORE the test (or a user on another client) creates a Task Group.
// The server broadcasts `tasks-updated` with the new group; the page applies
// it. When one of the two fetches' body then finishes parsing AFTER that
// broadcast (measured: 3–4 of 30 page loads under a 12× CPU throttle, with
// `Object.defineProperty` naming `_fetchTasks` as the last writer), its stale
// snapshot replaced the fresh list, and every roster built from the mirror
// (Grant access…, Reach & policy) was empty. FIX (src/lib/sidebar-tasks.js):
// every broadcast bumps a generation; a fetch issued before it gives up its
// answer (it still says "loaded"). The leg in test-channels-e2e also waits for
// the mirror's own loaded signal before creating the group.
//
// Legs: ① THE CONSTRUCTED INTERLEAVING — the page's /api/tasks answers are
// GATED until the broadcast has been applied, then released: with the guard
// the group stays (N trials, 0 misses); ② the CONTROL — the scratch bundle
// rebuilt with the guard removed shows the miss on EVERY constructed trial
// (the very red this suite exists for); ③ the NATURAL race — 20 page loads at
// CPU ×12 on the shipped bundle, the group in the mirror and in the Grant
// access… roster every time. Never the machine-global :7/5901; per-pid scratch.
// Run: node scripts/test-tasks-mirror-race.mjs [--trials N] [--throttle R]   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const TRIALS = Math.max(1, Number(argOf('--trials', 20)) || 20), THROTTLE = Math.max(1, Number(argOf('--throttle', 12)) || 12), CONSTRUCTED = 5;

const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('tasks-mirror');
const fakeHome = scratchHome('tasks-mirror-home', fs);
const chromeDir = scratch('tasks-mirror-chrome');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── throwaway worktree + WORKING-TREE overlay (a pre-commit run tests what is about to ship) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
const bundle = () => execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css --minify', { cwd: wt, stdio: 'ignore' });
bundle();

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: 'ignore', env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1' } });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,1000', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const waitServer = async () => { for (let i = 0; i < 120; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
ok(await waitServer(), 'the worktree server booted');

// ── CDP ──
const WebSocket = require('ws');
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
const tgt = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((res) => ws.on('open', res));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
await cdp('Runtime.enable'); await cdp('Page.enable');
const evaljs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result.result.value; };
// THE GATE (leg ①/②): every GET /api/tasks answer is held until `window.__releaseTasks()`; a
// timeline of the mirror's writers is kept for the report (the setter is installed after load)
const PROBE = `${ONBOARDED_SOURCE}; window.__tl = []; window.__gated = null; window.__gatedN = 0; window.__releaseTasks = () => { if (window.__gated) { window.__gated.resolve(); } };
(() => { const f = window.fetch; window.fetch = function (u, o) { const p = f.apply(this, arguments);
  if (String(u) === '/api/tasks' && (!o || !o.method || o.method === 'GET') && window.__gateTasks) {
    if (!window.__gated) { let resolve; const promise = new Promise((r) => { resolve = r; }); window.__gated = { promise, resolve }; }
    window.__gatedN++; window.__tl.push({ ev: 'gated', t: performance.now() });
    return p.then(async (res) => { window.__arrivedN = (window.__arrivedN || 0) + 1; window.__tl.push({ ev: 'arrived', t: performance.now() }); await window.__gated.promise; window.__tl.push({ ev: 'released', t: performance.now() }); return res; });
  }
  return p; }; })();`;
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
const J = { 'Content-Type': 'application/json' };
const load = async ({ gate = false } = {}) => {
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  // the gate flag must exist before the app's first fetch: set it in the very first evaluate that sees the new document
  for (let i = 0; i < 200; i++) {
    try { const r = await evaljs(`(() => { ${gate ? 'window.__gateTasks = true;' : ''} return !!(window.app && window.app.wm && window.app.sidebar); })()`); if (r) break; } catch {}
    await sleep(50);
  }
  return evaljs(`(() => { const sb = window.app.sidebar; let v = sb._tasks; Object.defineProperty(sb, '_tasks', { configurable: true, get() { return v; }, set(x) { window.__tl.push({ ev: 'set', t: performance.now(), n: (x || []).length }); v = x; } }); return true; })()`);
};
const mirrorHas = (gid) => evaljs(`(window.app.sidebar._tasks || []).some((x) => x.id === ${JSON.stringify(gid)})`);
const waitMirror = (gid) => evaljs(`(async () => { for (let i = 0; i < 80; i++) { if ((window.app.sidebar._tasks || []).some((x) => x.id === ${JSON.stringify(gid)})) return true; await new Promise((r) => setTimeout(r, 125)); } return false; })()`);
const rosterHas = (title) => evaljs(`(async () => {
  const w = window.app.openChannel('fake-poll', 'fake-poll-ops');
  for (let i = 0; i < 40; i++) { if (w.content.querySelector('[data-channel-assign]')) break; await new Promise((r) => setTimeout(r, 250)); }
  w.content.querySelector('[data-channel-assign]').click();
  for (let i = 0; i < 40; i++) { if (document.querySelector('#chan-access-dialog .chan-access-row select')) break; await new Promise((r) => setTimeout(r, 250)); }
  const sel = document.querySelector('#chan-access-dialog .chan-access-row select');
  const opts = sel ? [...sel.options].map((o) => o.textContent) : [];
  for (const o of document.querySelectorAll('.dialog-overlay')) o.remove();
  for (const x of [...window.app.wm.windows.values()].filter((x) => x.type === 'channel')) window.app.wm.closeWindow(x.id);
  return opts.some((o) => o.includes(${JSON.stringify(title)}));
})()`);
const mkGroup = async (title) => { const r = await (await fetch(`http://127.0.0.1:${PORT}/api/tasks`, { method: 'POST', headers: J, body: JSON.stringify({ title }) })).json(); return r.task && r.task.id; };
const rmGroup = (gid) => fetch(`http://127.0.0.1:${PORT}/api/tasks/${encodeURIComponent(gid)}`, { method: 'DELETE' }).catch(() => {});

/** ONE CONSTRUCTED TRIAL: load with the answers gated → create the group → the broadcast lands
 *  → release the stale answers → is the group still in the mirror? */
async function constructed(i, tag) {
  await load({ gate: true });
  // BOTH boot GETs (the sidebar's and the ws-connect refetch) must have been ANSWERED by the server
  // (headers arrived, bodies held) BEFORE the group is created — so both bodies are the pre-group
  // snapshot by construction; the ws connect can land later than the app's first paint, so the
  // count is waited for (a request merely issued could still be served after the POST)
  const held = await evaljs('(async () => { for (let i = 0; i < 200; i++) { if ((window.__arrivedN || 0) >= 2) return window.__arrivedN; await new Promise((r) => setTimeout(r, 50)); } return window.__arrivedN || 0; })()');
  const gid = await mkGroup(`${tag} ${i}`);
  const seen = await waitMirror(gid);
  await evaljs('window.__releaseTasks(), 1');
  await sleep(700);
  const still = await mirrorHas(gid);
  const tl = await evaljs('window.__tl');
  await rmGroup(gid);
  return { held: held >= 2, gated: held, seen, still, sets: tl.filter((x) => x.ev === 'set').map((x) => x.n).join('>'), released: tl.filter((x) => x.ev === 'released').length };
}

// ── ① THE CONSTRUCTED INTERLEAVING on the shipped bundle ──
console.log(`① the stale answers released AFTER the broadcast — ${CONSTRUCTED} constructed trials on the shipped bundle`);
{
  const out = [];
  for (let i = 1; i <= CONSTRUCTED; i++) out.push(await constructed(i, 'Held'));
  ok(out.every((r) => r.held && r.seen && r.released >= 2), `FIXTURE: every trial held BOTH boot answers of /api/tasks (${out.map((r) => r.gated).join('/')}), saw the broadcast apply the group, then released them (${out.map((r) => r.sets).join(' ; ')})`, JSON.stringify(out));
  ok(out.every((r) => r.still), `the group stays in the mirror after the stale answers land — ${out.filter((r) => r.still).length}/${CONSTRUCTED} (a fetch issued before a broadcast never overwrites it)`, JSON.stringify(out));
  const roster = await (async () => { const gid = await mkGroup('Roster check'); await waitMirror(gid); await evaljs('window.__releaseTasks(), 1'); const r = await rosterHas('Roster check'); await rmGroup(gid); return r; })();
  ok(roster, 'and the Grant access… roster names it');
}

// ── ③ THE NATURAL RACE at CPU ×THROTTLE on the shipped bundle ──
console.log(`③ ${TRIALS} page loads at CPU ×${THROTTLE}: the group is in the mirror and in the roster every time`);
{
  const out = [];
  for (let i = 1; i <= TRIALS; i++) {
    await cdp('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await load();
    const gid = await mkGroup(`Ops triage ${i}`);
    const seen = await waitMirror(gid);
    await sleep(400);   // the window in which the stale answer used to land
    const still = await mirrorHas(gid);
    const tl = await evaljs('window.__tl');
    out.push({ i, seen, still, sets: tl.filter((x) => x.ev === 'set').map((x) => x.n).join('>') });
    await rmGroup(gid);
    await cdp('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  const misses = out.filter((r) => !(r.seen && r.still));
  ok(misses.length === 0, `${TRIALS}/${TRIALS} loads keep the group in the mirror (misses: ${misses.length})`, JSON.stringify(misses));
  await cdp('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await load();
  const gid = await mkGroup('Roster under load');
  await waitMirror(gid);
  const r = await rosterHas('Roster under load');
  await cdp('Emulation.setCPUThrottlingRate', { rate: 1 });
  await rmGroup(gid);
  ok(r, 'the Grant access… roster names the group under the throttle too');
}

// ── ② CONTROL: the guard removed, rebuilt into the scratch bundle ⇒ the constructed trials MISS ──
console.log('② CONTROL: the pre-fix mirror (no generation guard) rebuilt into the scratch bundle');
{
  const MOD = path.join(wt, 'src/lib/sidebar-tasks.js');
  const src = fs.readFileSync(MOD, 'utf8');
  const GUARD = "      if ((this._tasksGen || 0) !== gen) { this._tasksLoaded = true; this._tasksLoadErr = null; return; }\n";
  ok(src.includes(GUARD), 'the guard is spelled where the control removes it');
  fs.writeFileSync(MOD, src.replace(GUARD, ''));
  bundle();
  const out = [];
  for (let i = 1; i <= CONSTRUCTED; i++) out.push(await constructed(i, 'Ctl'));
  ok(out.every((r) => r.held && r.seen && r.released >= 2) && out.every((r) => !r.still), `CONTROL: without the guard the same interleaving EMPTIES the mirror on every trial — ${out.filter((r) => !r.still).length}/${CONSTRUCTED} (${out.map((r) => r.sets).join(' ; ')}) — leg ① would go red`, JSON.stringify(out));
  fs.writeFileSync(MOD, src);
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
