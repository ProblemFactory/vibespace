#!/usr/bin/env node
// THE BOOT PHASE + THE BOOT LADDER (lane update-reload-ready, B-0ece) — PURE,
// fast. After ⚙ → Update the page reloaded onto a server that was listening but
// still booting, and the splash (app.ready ← /api/layouts → /api/active →
// /api/sessions, no timeout) sat there until a manual refresh.
//   ① src/server/boot-phase.js: `booting` until every registered step is done,
//     the implicit listen step holds it before arm(), the test hold, the stuck
//     cap turns it `ready` with the steps it gave up on + ONE boot-stuck event.
//   ② src/lib/boot-ladder.js: the ladder 1 → 2 → 5 → 10 s then give up; a
//     request that never answers is a stall, not a hang; waitServerReady
//     reloads only on `ready` (404 = an older server = ready), `booting` is
//     progress (the ladder resets), failures climb it.
//   ③ the wiring: server.js arms the phase after restoreSessions; app.ready
//     gates on awaitBootReady; the first-paint fetches ride _bootJson; the
//     update dialog and the stale-tab reload wait for ready.
//   ④ patched-copy controls: the same checks run on mutant copies and go red.
// Run: node scripts/test-boot-phase.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + JSON.stringify(e).slice(0, 600) : ''}`); } };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-boot-phase-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });

// ── ① the server phase ──
async function phaseLegs(mod, tag = '') {
  const res = [];
  const ok = (n, c, e) => res.push([tag + n, !!c, e]);
  const { phaseOf } = mod;
  ok('phaseOf: a pending step = booting, naming it', JSON.stringify(phaseOf({ steps: [{ name: 'restore', done: true }, { name: 'sessions-index', done: false }], startedAt: 0, now: 5000, stuckMs: 90000 })) === JSON.stringify({ phase: 'booting', waitingOn: ['sessions-index'], stuck: [] }));
  ok('phaseOf: every step done = ready', phaseOf({ steps: [{ name: 'a', done: true }], startedAt: 0, now: 1, stuckMs: 90000 }).phase === 'ready');
  ok('phaseOf: past the stuck cap = ready, the pending steps in stuck', JSON.stringify(phaseOf({ steps: [{ name: 'a', done: false }], startedAt: 0, now: 90000, stuckMs: 90000 })) === JSON.stringify({ phase: 'ready', waitingOn: [], stuck: ['a'] }));
  // the live object on a fake clock + fake timers
  let clock = 1000; const timers = [];
  const setTimer = (fn, ms) => { const t = { fn, at: clock + ms, unref() { } }; timers.push(t); return t; };
  const advance = (ms) => { clock += ms; for (const t of timers.splice(0)) { if (t.at <= clock) t.fn(); else timers.push(t); } };
  const recs = [];
  const bp = mod.create({ now: () => clock, stuckMs: 90000, sessionsCount: () => 44, record: (ev) => recs.push(ev), log: { log() { }, warn() { } }, testHoldMs: 8000, setTimer });
  const restored = bp.step('restore'), indexed = bp.step('sessions-index');
  ok('before arm(): booting, waiting on listen (nothing is ready before the listen callback registered the rest)', bp.snapshot().phase === 'booting' && bp.snapshot().waitingOn.includes('listen'), bp.snapshot());
  restored(); indexed();
  ok('steps done but not armed: still booting', bp.snapshot().phase === 'booting');
  bp.arm();
  ok('armed with a test hold: booting, waiting on test-hold only, 44 sessions counted', bp.snapshot().phase === 'booting' && JSON.stringify(bp.snapshot().waitingOn) === '["test-hold"]' && bp.snapshot().sessions === 44, bp.snapshot());
  advance(8000);
  const s = bp.snapshot();
  ok('the hold over: ready, readyAt stamped, no boot-stuck event', s.phase === 'ready' && s.readyAt === clock && !recs.length, { s, recs });
  // the stuck cap
  clock = 0; timers.length = 0; recs.length = 0;
  const bp2 = mod.create({ now: () => clock, stuckMs: 90000, record: (ev) => recs.push(ev), log: { log() { }, warn() { } }, setTimer });
  bp2.step('restore')(); bp2.step('sessions-index'); bp2.arm();
  advance(60000);
  ok('a step that never finishes: booting at 60 s', bp2.snapshot().phase === 'booting');
  advance(30000);
  const s2 = bp2.snapshot(); bp2.snapshot();
  ok('…ready at the 90 s cap with stuck = [sessions-index] (the fleet is not held hostage)', s2.phase === 'ready' && JSON.stringify(s2.stuck) === '["sessions-index"]', s2);
  ok('…and ONE boot-stuck telemetry event naming what it waited on', recs.length === 1 && recs[0].kind === 'event' && recs[0].name === 'boot-stuck' && /sessions-index/.test(recs[0].detail), recs);
  return res;
}

// ── ② the client ladder ──
async function ladderLegs(L, tag = '') {
  const res = [];
  const ok = (n, c, e) => res.push([tag + n, !!c, e]);
  ok('ladderWait: 1 → 2 → 5 → 10 s, then give up', JSON.stringify([1, 2, 3, 4, 5].map((n) => L.ladderWait(n))) === JSON.stringify([1000, 2000, 5000, 10000, null]));
  const waits = []; const sleep = async (ms) => { waits.push(ms); };
  const never = () => new Promise(() => { });
  const t0 = Date.now();
  const g = await L.ladderJson('/api/layouts', { fetchImpl: never, sleep, stallMs: 30 });
  ok('a request that never answers: stalls at the bound, climbs the whole ladder, gives up after 5 tries (not a hang)', g.gaveUp && g.gaveUp.tries === 5 && g.gaveUp.fail.why === 'stall' && JSON.stringify(waits) === '[1000,2000,5000,10000]' && Date.now() - t0 < 2000, { g, waits });
  waits.length = 0; let n = 0;
  const flaky = async () => (++n < 3 ? { ok: false, status: 502 } : { ok: true, status: 200, json: async () => ({ saved: {} }) });
  const r = await L.ladderJson('/api/layouts', { fetchImpl: flaky, sleep, stallMs: 30 });
  ok('two 502s then an answer: the JSON, after waits 1 s + 2 s', r.json && JSON.stringify(waits) === '[1000,2000]', { r, waits });
  ok('reasonOf: the reason in words (stall / http / starting / network)', L.reasonOf({ why: 'stall' }, 10000).params.n === 10 && L.reasonOf({ why: 'http', status: 502 }).params.code === 502 && /waiting on/.test(L.reasonOf({ why: 'starting', waitingOn: ['restore'] }).key) && L.reasonOf({ why: 'network' }).key === 'network error');
  // waitServerReady
  const seq = (answers) => { let i = 0; return async () => { const a = answers[Math.min(i++, answers.length - 1)]; if (a === 'down') throw new Error('ECONNREFUSED'); if (typeof a === 'number') return { ok: false, status: a }; return { ok: true, status: 200, json: async () => a }; }; };
  waits.length = 0; const st = [];
  const w1 = await L.waitServerReady({ fetchImpl: seq([{ phase: 'booting', sessions: 3 }, { phase: 'booting', sessions: 20 }, { phase: 'booting', sessions: 44 }, { phase: 'ready', sessions: 44 }]), sleep, onStatus: (b) => st.push(b.sessions) });
  ok('waitServerReady: booting ×3 then ready → ok, the line counted 3 → 20 → 44 sessions, polled at 1 s', w1.ok && JSON.stringify(st) === '[3,20,44]' && JSON.stringify(waits) === '[1000,1000,1000]', { w1, st, waits });
  const w2 = await L.waitServerReady({ fetchImpl: seq([404]), sleep });
  ok('waitServerReady: 404 (an older server, no phase) = ready', w2.ok && w2.boot.legacy);
  waits.length = 0;
  const w3 = await L.waitServerReady({ fetchImpl: seq(['down', 'down', { phase: 'booting', sessions: 1 }, 'down', 'down', 'down', 'down', 'down']), sleep });
  ok('waitServerReady: booting answers reset the ladder; 5 failures in a row give up', !w3.ok && w3.tries === 5 && JSON.stringify(waits) === '[1000,2000,1000,1000,2000,5000,10000]', { w3, waits });
  let clk = 0; const w4 = await L.waitServerReady({ fetchImpl: seq([{ phase: 'booting', waitingOn: ['sessions-index'] }]), sleep: async (ms) => { clk += ms; }, now: () => clk, capMs: 5000 });
  ok('waitServerReady: still booting past the cap → gives up with "still starting, waiting on sessions-index"', !w4.ok && w4.fail.why === 'starting' && JSON.stringify(w4.fail.waitingOn) === '["sessions-index"]', w4);
  ok('ladderConfig: production defaults; a suite\'s window.__vsBootLadderTest shortens them', L.ladderConfig({}).stallMs === L.STALL_MS && L.ladderConfig({ __vsBootLadderTest: { stallMs: 500, ladder: [100] } }).ladder[0] === 100);
  return res;
}

const report = (rows) => rows.forEach(([n, c, e]) => check(n, c, e));
const phaseMod = require(path.join(repo, 'src/server/boot-phase.js'));
report(await phaseLegs(phaseMod));
// src/lib is ESM in a typeless package: import a .mjs copy (no reparse warning), like the mutants below
const ladderCopy = path.join(tmp, 'boot-ladder.mjs'); fs.writeFileSync(ladderCopy, read('src/lib/boot-ladder.js'));
const ladderMod = await import(pathToFileURL(ladderCopy).href);
report(await ladderLegs(ladderMod));

// ── ③ the wiring ──
const server = read('server.js'), app = read('src/lib/app.js'), layout = read('src/lib/layout.js'), ops = read('src/server/ops-routes.js'), sessions = read('src/routes/sessions.js');
const restoreAt = server.indexOf('restoreSessions(); bootBrowserKeeper();'), armAt = server.indexOf('bootPhase.arm()');
check('server.js: the phase is armed in the listen callback, AFTER restoreSessions (restore done, the first sweep warmed)', restoreAt > 0 && armAt > restoreAt && /bootRestored\(\); require\('\.\/src\/routes\/sessions'\)\.warmSessions\(\)[^\n]*\.finally\(bootSessionsIndexed\)/.test(server));
check('ops-routes: GET /api/boot answers the snapshot (no-store); /api/version carries the phase', /app\.get\('\/api\/boot'/.test(ops) && /no-store/.test(ops) && /phase: bootPhase \? bootPhase\.snapshot\(\)\.phase : 'ready'/.test(ops));
check('sessions route: warmSessions() shares the in-flight sweep (one sweep, never two)', /_warmSweep = \(\) => \{\s*if \(!_sweepInFlight\) _sweepInFlight = _runSessionsSweep\(\)/.test(sessions));
check('app.ready: gates on awaitBootReady() BEFORE loadAutoSave (a page opened mid-boot waits, then loads by itself)', /if \(!await awaitBootReady\(\)\) return;\s*await this\.layoutManager\.loadAutoSave\(\);/.test(app));
const las = layout.slice(layout.indexOf('async loadAutoSave()'), layout.indexOf('async _offerResumeAll('));
check('loadAutoSave: no raw fetch left — /api/layouts, /api/active, /api/sessions ride _bootJson', !/\bfetch\(/.test(las) && (las.match(/this\._bootJson\('/g) || []).length === 3, (las.match(/fetch\([^)]*\)/g) || []));
const rs = layout.slice(layout.indexOf('async restoreState(state)'), layout.indexOf('// Restore windows — use gridBounds'));
check('restoreState: its /api/active + /api/sessions ride _bootJson', (rs.match(/this\._bootJson\('\/api\/(active|sessions)'\)/g) || []).length === 2 && !/await fetch\('\/api\/(active|sessions)'\)/.test(rs));
check('the update dialog: its reload waits for the boot phase (waitServerReady) before location.reload', /const reload = async \(msg\) => \{\s*done = true;\s*const r = await waitServerReady\(/.test(app));
check('the stale-tab reload: waits for ready before it burns its once-per-version key', /if \(!\(await waitServerReady\(\{ \.\.\.bootDeps\(\) \}\)\)\.ok\) return;[^\n]*\n[^\n]*\n\s*sessionStorage\.setItem\(key/.test(app));
const splash = read('src/lib/boot-splash.js');
check('boot-splash: giving up records ONE boot-stuck telemetry event naming the request, then shows the reason + Reload', /track\('event', 'boot-stuck'/.test(splash) && /The server did not answer \{what\} \(\{reason\}\) after \{n\} tries\./.test(splash) && /location\.reload\(\)/.test(splash));
check('boot-splash: a request that gave up NEVER resolves (restoring from nothing would let the first autosave overwrite the layout)', /if \(r\.gaveUp\) \{ splashGiveUp\(r\.gaveUp\); return new Promise\(\(\) => \{ \}\); \}/.test(splash));

// ── ④ patched-copy controls: each mutant must turn its leg red ──
const mutant = (rel, from, to, ext) => {
  const src = read(rel);
  if (!src.includes(from)) return null;
  const f = path.join(tmp, path.basename(rel, ext) + '-' + Math.random().toString(36).slice(2, 8) + ext);
  fs.writeFileSync(f, src.replace(from, to));
  return f;
};
const redsOf = (rows) => rows.filter(([, c]) => !c).map(([n]) => n);
{
  const f = mutant('src/server/boot-phase.js', "const waitingOn = steps.filter((s) => !s.done).map((s) => s.name);", 'const waitingOn = [];', '.js');
  const reds = f ? redsOf(await phaseLegs(require(f), 'mutant ')) : ['(anchor moved)'];
  check(`control: phaseOf that ignores pending steps (ready = merely listening) turns ① red (${reds.length} red)`, f && reds.length >= 3, reds);
}
{
  const f = mutant('src/server/boot-phase.js', "        try { record({ kind: 'event', name: 'boot-stuck', detail }); } catch { }\n", '', '.js');
  const reds = f ? redsOf(await phaseLegs(require(f), 'mutant ')) : ['(anchor moved)'];
  check(`control: a stuck cap that records nothing turns the boot-stuck leg red (${reds.length} red)`, f && reds.some((n) => /boot-stuck/.test(n)), reds);
}
{
  const f = mutant('src/lib/boot-ladder.js', "  try { return await Promise.race([go, stall]); } finally { clearTimeout(timer); }", '  try { return await go; } finally { clearTimeout(timer); }', '.mjs');
  // a hang must not hang the control itself: race the mutant's legs against 3 s
  const reds = f ? await Promise.race([import(pathToFileURL(f).href).then((m) => ladderLegs(m, 'mutant ')).then(redsOf), new Promise((r) => setTimeout(() => r(["(hung — the stall bound is gone)"]), 1200))]) : ['(anchor moved)'];
  check(`control: a ladder without the stall bound hangs on a request that never answers (${reds.join(' | ').slice(0, 80)})`, f && reds.length >= 1, reds);
}
{
  const f = mutant('src/lib/boot-ladder.js', "    if (r.ok && r.json && r.json.phase !== 'booting') return { ok: true, boot: r.json };", "    if (r.ok && r.json) return { ok: true, boot: r.json };", '.mjs');
  const reds = f ? redsOf(await import(pathToFileURL(f).href).then((m) => ladderLegs(m, 'mutant '))) : ['(anchor moved)'];
  check(`control: the old reload rule (any answer = reload) turns the waitServerReady legs red (${reds.length} red)`, f && reds.some((n) => /booting ×3/.test(n)), reds);
}
console.log(failed ? `FAILED (${failed} of ${passed + failed})` : `ALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
