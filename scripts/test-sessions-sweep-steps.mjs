#!/usr/bin/env node
// B-80cb (主开发 r1355, B) — THE CONVERSATIONS' SWEEP: NO STEP HOLDS THE LOOP. The claude walk (src/session-store.js
// discoverClaudeSessions) runs in the «sessions-sweep» worker on the healthy road (B-891e); at the FIRST sweep with no worker the
// route runs it on the hub's loop (its inline fallback, routes/sessions.js _sweepOnce), where it read every transcript in one go —
// one step of about a second at the owner's order of sizes, measured on stand-ins on the test machine. THE LAW: no step of the
// conversations' sweep holds the loop 250 ms at that order, cold. Judged by COUNTS, never a clock:
//   ① the walk on this thread (the fallback) over 12 500 stand-in transcripts in 30 folders, cold: no step reads more than
//      SWEEP_STEP_READS (256) transcripts (a read = a stat or a head read, ~0.1 ms each cold) — RED CONTROL: a copy whose walk never
//      yields reads every transcript in one step
//   ② THE ROUTE with its REAL worker: two lists asked at once share ONE sweep (one call into its pool)
//   ③ a list asked while a sweep runs answers the LAST WHOLE list (every row) and, the sweep late, says its age — never a half list
// The stand-ins live on the DISK (fixture-guard TMP_ROOTS[1] — never the memory-backed temp folder) and are removed at every exit.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import './scratch.mjs';   // §113 THE ORDER (主开发 r1845): the scratch import first after node's own
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const { TMP_ROOTS } = require(path.join(REPO, 'src/fixture-guard.js'));
const ROOT = fs.mkdtempSync(path.join(TMP_ROOTS[1], 'vs-sweep-steps-'));
const gone = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', gone);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { gone(); process.exit(130); });
const HOME = path.join(ROOT, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.HOME = HOME;
os.homedir = () => HOME;

// THE OWNER'S ORDER OF SIZES: 12 500 transcripts, each named in its head (the head scan stops at its first chunk)
const N = 12500, FOLDERS = 30, PER = Math.ceil(N / FOLDERS);
let written = 0;
for (let f = 0; f < FOLDERS && written < N; f++) {
  const cwd = `/w/proj-${f}`;
  const dir = path.join(HOME, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  for (let j = 0; j < PER && written < N; j++, written++) {
    const id = `5e5e5e5e-0000-4000-8000-${String(written).padStart(12, '0')}`;
    const at = new Date(Date.UTC(2026, 10, 1) + written * 1000).toISOString();
    fs.writeFileSync(path.join(dir, `${id}.jsonl`),
      JSON.stringify({ type: 'user', uuid: `u-${written}`, sessionId: id, cwd, timestamp: at, promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: `ask ${written}` }] } }) + '\n'
      + JSON.stringify({ type: 'assistant', uuid: `a-${written}`, sessionId: id, cwd, timestamp: at, requestId: `req_${written}`, message: { id: `msg_${written}`, model: 'claude-fable-5', role: 'assistant', content: [{ type: 'text', text: 'ok' }] } }) + '\n');
  }
}

console.log('① the walk on this thread (the inline fallback), cold, over the owner\'s order of sizes');
const SS_REL = 'src/session-store.js', SS_SRC = fs.readFileSync(path.join(REPO, SS_REL), 'utf8');
const SS = require(path.join(REPO, SS_REL));
const listed = await SS.discoverClaudeSessions({ activeSessions: new Map() });
const st = SS.lastWalkSteps();
ok(Array.isArray(listed) && listed.length === N && !!st && st.reads >= 2 * N && st.maxPerStep <= 256 && st.yields >= Math.floor(st.reads / 256),
  `the walk listed ${Array.isArray(listed) ? listed.length : '?'} of ${N}: ${st && st.reads} transcript reads in ${st && st.yields + 1} steps, at most ${st && st.maxPerStep} a step (the count bound: 256)`, st);
// THE TIME BOUND (the one that holds at real sizes: a real transcript's head read is ~1 ms cold): a clock that moves 1 ms a read
const ticking = () => { let t = 0; return () => t++; };
await SS.discoverClaudeSessions({ activeSessions: new Map(), stepClock: ticking() });
const tt = SS.lastWalkSteps();
ok(!!tt && tt.reads >= 2 * N && tt.maxPerStep <= 21, `…and the time bound: with a read costing 1 ms by the walk's clock, no step passes 20 ms — at most ${tt && tt.maxPerStep} reads a step`, tt);
// THE REST ON A SMALL HOME (300 transcripts): the red controls and the route's rules hold at any size — only the law needs the
// owner's order (the fast tier's time). A worker started from here reads the HOME of its start (the pool is renewed by its seam)
const SMALL = path.join(ROOT, 'small'), NS = 300;
for (let f = 0, w = 0; f < 3; f++) {
  const cwd = `/w/small-${f}`;
  const dir = path.join(SMALL, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  for (let j = 0; j < NS / 3; j++, w++) {
    const id = `5e5e5e5e-0000-4000-9000-${String(w).padStart(12, '0')}`;
    const at = new Date(Date.UTC(2026, 10, 1) + w * 1000).toISOString();
    fs.writeFileSync(path.join(dir, `${id}.jsonl`), JSON.stringify({ type: 'user', uuid: `s-${w}`, sessionId: id, cwd, timestamp: at, promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: `small ${w}` }] } }) + '\n');
  }
}
process.env.HOME = SMALL;
os.homedir = () => SMALL;
const copyOf = (name, from, to, what) => { try { return mutantCopies(name, REPO).load(SS_REL, anchored(SS_SRC, from, to, what), name); } catch (e) { return { why: e.message }; } };
const NEVER = copyOf('sweep-steps-never', 'return inStep >= SWEEP_STEP_READS || now() - stepAt >= SWEEP_STEP_MS; };', 'return false; };', 'the walk never yields');
let stx = null;
if (NEVER.discoverClaudeSessions) { await NEVER.discoverClaudeSessions({ activeSessions: new Map() }); stx = NEVER.lastWalkSteps(); }
ok(!!stx && stx.yields === 0 && stx.reads >= 2 * NS && stx.maxPerStep === stx.reads, `RED CONTROL (a walk that never yields — the road before this unit): ${stx ? stx.maxPerStep : '?'} transcript reads in ONE step`, stx || NEVER.why);
const COUNT_ONLY = copyOf('sweep-steps-countonly', 'return inStep >= SWEEP_STEP_READS || now() - stepAt >= SWEEP_STEP_MS; };', 'return inStep >= SWEEP_STEP_READS; };', 'the count bound alone');
let stc = null;
if (COUNT_ONLY.discoverClaudeSessions) { await COUNT_ONLY.discoverClaudeSessions({ activeSessions: new Map(), stepClock: ticking() }); stc = COUNT_ONLY.lastWalkSteps(); }
ok(!!stc && stc.maxPerStep === 256, `RED CONTROL (the count bound alone): with a 1 ms read, a step of ${stc ? stc.maxPerStep : '?'} reads — 256 ms, past the time bound`, stc || COUNT_ONLY.why);

console.log('② ③ the route with its real worker: one sweep in flight; a list asked meanwhile answers the last whole list, with its age');
const R_REL = 'src/routes/sessions.js', R_SRC = fs.readFileSync(path.join(REPO, R_REL), 'utf8');
const ctxOf = (tag) => { const BUF = path.join(ROOT, 'buffers-' + tag); fs.mkdirSync(BUF, { recursive: true }); return { activeSessions: new Map(), webuiPids: new Set(), refreshWebuiPids: () => { }, createSessionMessages: () => ({}), BUFFERS_DIR: BUF, PERMISSION_MODES: [], execFileSync, hosts: { device: async () => null }, accounts: null, sessionAuth: () => ({}), serverSetting: () => undefined }; };
const routes = new Map();   // a module is set up ONCE (its GET's closure holds its cache); a pool is renewed only through its seam
const routeOf = (Mod, tag) => {
  if (routes.has(Mod)) return routes.get(Mod);
  Mod._sweepTestSeam({ pollWaitMs: 1 });
  Mod.setup(ctxOf(tag));
  const layer = Mod.router.stack.find((l) => l.route && l.route.path === '/api/sessions');
  const get = (query = {}) => new Promise((resolve, reject) => {
    let code = 200;
    const res = { status: (c) => { code = c; return res; }, type: () => res, set: () => res, json: (b) => resolve({ code, body: b }), send: (b) => resolve({ code, body: JSON.parse(Buffer.isBuffer(b) ? b.toString() : String(b)) }) };
    Promise.resolve(layer.route.stack[0].handle({ query }, res)).catch(reject);
  });
  const r = { get };
  routes.set(Mod, r);
  return r;
};
const rowsOf = (a) => (a && a.body && Array.isArray(a.body.sessions) ? a.body.sessions.length : -1);
// ② two lists asked at once share ONE sweep (one call into the pool); RED: a route that starts a sweep for every list
const twoAtOnce = async (Mod, tag) => {
  const { get } = routeOf(Mod, tag);
  const first = await get();
  const pool = Mod.sweepPool(); const call0 = pool.call.bind(pool); let calls = 0;
  pool.call = (...a) => { calls++; return call0(...a); };
  try { const [a, b] = await Promise.all([get({ rebuild: '1' }), get({ rebuild: '1' })]); return { calls, rows: [rowsOf(first), rowsOf(a), rowsOf(b)] }; }
  finally { pool.call = call0; }
};
const R = require(path.join(REPO, R_REL));
const one = await twoAtOnce(R, 'now');
ok(one.calls === 1 && one.rows.every((n) => n === NS), `two lists asked at once share ONE sweep: ${one.calls} call(s) into the sweep's pool, rows ${one.rows.join(' / ')}`, one);
let R2 = null, why2 = null;
try { R2 = mutantCopies('sweep-steps-twice', REPO).load(R_REL, anchored(R_SRC, '      if (!_sweepInFlight) {\n        _sweepInFlight = _runSessionsSweep()', '      if (true) {\n        _sweepInFlight = _runSessionsSweep()', 'a sweep for every list'), 'twice'); } catch (e) { why2 = e.message; }
const two = R2 ? await twoAtOnce(R2, 'twice') : null;
ok(!!two && two.calls === 2, `RED CONTROL (a route that starts a sweep for every list): ${two ? two.calls : '?'} calls into the pool`, two || why2);
// ③ a list asked while a sweep runs answers the LAST WHOLE list and says its age (every time — not only a late sweep);
// RED: a route that answers without the age
const meanwhileOf = async (Mod, tag) => {
  const { get } = routeOf(Mod, tag);
  await get();                                  // a whole list
  Mod._sweepTestSeam({ cacheTtlMs: 0, pollWaitMs: 1 });   // the cache's 4.5 s gone: a list asked now meets the sweep in flight
  const running = get({ rebuild: '1' });        // a sweep in flight…
  const meanwhile = await get();                // …and a list asked while it runs
  const done = await running;
  return { rows: rowsOf(meanwhile), done: rowsOf(done), age: meanwhile.body && meanwhile.body.listAge };
};
const mw = await meanwhileOf(R, 'age');
ok(mw.rows === NS && mw.done === NS && !!mw.age && Number.isFinite(mw.age.ageMs) && mw.age.ageMs >= 0 && Number.isFinite(mw.age.since),
  `a list asked while a sweep runs answers the LAST WHOLE list (${mw.rows} of ${NS} rows, never a half one) and says its age (listAge.ageMs ${mw.age && mw.age.ageMs})`, mw);
let R3 = null, why3 = null;
try { R3 = mutantCopies('sweep-steps-noage', REPO).load(R_REL, anchored(R_SRC, 'const aged = _sweepInFlight && body === _sessionsCache && _sessionsBuiltAt ?', 'const aged = false ?', 'no age'), 'noage'); } catch (e) { why3 = e.message; }
const mx = R3 ? await meanwhileOf(R3, 'noage') : null;
ok(!!mx && mx.rows === NS && !mx.age, `RED CONTROL (a route that answers without the age): ${mx ? mx.rows : '?'} rows, no age`, mx || why3);
for (const Mod of routes.keys()) { try { Mod._sweepTestSeam({}); } catch { } }   // every route's pool closed (the seam forgets it)
report();
