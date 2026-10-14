#!/usr/bin/env node
// test-browser-probe-ladder — B-0b8c (lane browser-probe-transient, 2026-10-14): ONE FAILED PROBE OF THE BROWSER CLI'S
// VERSION NEVER DECIDES FOR EVER. On the .268 boot the `--version` probe of the pinned binary (data/browser-tools, on the
// NFS mount) timed out ONCE under boot I/O and a loud 「shared profiles stay off」 notice was filed for a transient the
// 10-min memo healed minutes later. A failed probe is now a STATE that asks again on a bounded ladder; the notice waits
// for the ladder's end, names its tries + why, carries a Check again door and is withdrawn by the first answer.
// Fast, in-process: a fake clock (no fork) for the ladder's table, the REAL keeper over the fake binary
// (scripts/fixtures/fake-agent-browser.mjs — its `version-hang` mode) for the rest; never the real agent-browser.
//
//   ① PURE: floorVerdict's "not yet known" (undefined / an unsettled '' — fail CLOSED for the act, NO notice), the
//      settled verdict and its words, probeWhy's table, the ladder constant
//   ② the facts' LADDER on a fake clock: the production table attempt → delay → outcome (5 s → 15 s → 45 s → 2 min →
//      10 min, bounded); an answer stops it; a reader inside the memo forks nothing; stop() ends the rung; one-shot owners
//      (no ladder) never settle
//   ③ the REAL keeper over the fake binary (its version-hang / version-fail / version-hold modes): hangs twice then
//      answers ⇒ unknown → ok, NO notice; never answers ⇒ ONE For-you notice after the ladder (tries + why + Check again);
//      the door (the route) while it still fails files no second item; a later answer withdraws it; single flight under 3
//      concurrent readers (a held probe, counted forks); a restart ADOPTS the open item; shutdown ends the rung
//   ④ RED CONTROLS: the base tree's one-shot (browser-env's checkFloor over a probe that failed ONCE ⇒ the notice at once);
//      the same keeper with an EMPTY ladder ⇒ the notice after the first failure
//   ⑤ wiring: the pane's action, the model's verb → the route, the words (zh / ja)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fn(); } catch { v = false; } if (v) return true; if (Date.now() - t0 > ms) return false; await sleep(15); } };

const F = require('../src/browser-facts.js');
const B = require('../src/browser-profiles.js');

// ═══ ① PURE ══════════════════════════════════════════════════════════════════
console.log('— ① PURE: "not yet known" fails closed and says nothing; the settled verdict names its tries');
{
  ok(JSON.stringify(F.PROBE_RETRY_MS) === JSON.stringify([5e3, 15e3, 45e3, 120e3, 600e3]) && Object.isFrozen(F.PROBE_RETRY_MS) && F.PROBE_TIMEOUT_MS === 8000,
    'THE LADDER: 5 s → 15 s → 45 s → 2 min → 10 min after each miss (bounded, frozen); each try waits up to 8 s');
  const never = B.floorVerdict(undefined);
  ok(never.state === 'unknown' && never.sharedProfiles === false && never.settled === false && B.floorNotice(never) === null, 'never asked (undefined) ⇒ unknown — NOT YET KNOWN: no shared profile (fail closed), no notice (it read "absent" before, a fact nobody measured)');
  const oneMiss = B.floorVerdict('', B.FLOOR_VERSION, { at: 9000, since: 1000, ok: false, why: 'timed out after 8 s', attempts: 1, nextAt: 14000, exhausted: false });
  ok(oneMiss.state === 'unknown' && oneMiss.sharedProfiles === false && oneMiss.settled === false && oneMiss.attempts === 1 && B.floorNotice(oneMiss) === null,
    'ONE failed probe with the ladder still asking ⇒ unknown, unsettled: capability OFF for the act, and NO notice');
  ok(B.floorNotice(B.floorVerdict('')) === null && B.floorNotice(B.floorVerdict('weird build')) === null, 'a verdict with no probe state (a one-shot reader) never settles ⇒ never a notice');
  const done = B.floorVerdict('', B.FLOOR_VERSION, { at: 834e3, since: 1000, ok: false, why: 'timed out after 8 s', attempts: 6, nextAt: null, exhausted: true });
  const words = B.floorNotice(done);
  ok(done.settled === true && done.attempts === 6 && done.spanMs === 833e3 && done.why === 'timed out after 8 s', 'the ladder EXHAUSTED ⇒ settled, carrying the tries, the last why and the span', done);
  ok(words === 'Could not read the agent-browser version after 6 tries over 14 minutes (timed out after 8 s): shared profiles stay off until it answers. Per-session isolation is on and working; `npm ls -g agent-browser` shows what is installed.',
    'THE NOTICE names the tries, the span and the last why — and what still works', words);
  const detail = B.floorNoticeDetail(done, { retryMs: F.PROBE_RETRY_MS, timeoutMs: F.PROBE_TIMEOUT_MS });
  ok(/again 5 s, 15 s, 45 s, 2 min and 10 min after each miss/.test(detail) && /waiting up to 8 s/.test(detail) && /Check again asks once more now/.test(detail) && /goes away by itself/.test(detail) && !/agent-browser/.test(detail),
    'its detail: the ladder, the wait per try, the door, the withdrawal — and never the hidden CLI\'s name (§52b: only floorNotice may say it)', detail);
  ok(B.floorVerdict('0.38.1', B.FLOOR_VERSION, { ok: true, attempts: 3 }).state === 'ok' && B.floorVerdict(null).state === 'absent' && B.floorNotice(B.floorVerdict(null)) === null
    && /too old for shared profiles/.test(B.floorNotice(B.floorVerdict('0.32.0'))), 'answers are unchanged: ok / absent (silent) / too-old (its own notice)');
  const W = (err, version = '') => F.probeWhy({ err, version, timeoutMs: 8000 });
  ok(W(Object.assign(new Error('t'), { killed: true, signal: 'SIGTERM' })) === 'timed out after 8 s' && F.probeWhy({ err: { killed: true }, version: '', timeoutMs: 250 }) === 'timed out after 250 ms'
    && W({ signal: 'SIGKILL' }) === 'ended by SIGKILL' && W({ code: 1 }) === 'exited 1 without a version' && W({ code: 'EACCES' }) === 'could not run (EACCES)'
    && W(null) === 'answered without a version' && W(null, '0.38.1') === null && W(null, null) === null,
    'probeWhy: timed out / ended by a signal / exited N / could not run / answered without a version; null for an answer (a version, or no binary)');
}

// ═══ ② the LADDER on a fake clock (no fork) ═══════════════════════════════════
console.log('— ② the facts\' ladder on a fake clock: the production table, bounded, stopped by an answer');
/** A facts instance over a fake execFile (each 'hang' advances the clock by the probe's timeout and answers like a killed
 *  child) and fake timers (`waiting` = the rungs set, fired by hand). */
function ladderWorld(script, { retryMs = F.PROBE_RETRY_MS } = {}) {
  let clock = 1e6, calls = 0;
  const waiting = [];
  const timers = { set: (run, delay) => { const h = { run, delay, due: clock + delay }; waiting.push(h); return h; }, clear: (h) => { const i = waiting.indexOf(h); if (i >= 0) waiting.splice(i, 1); } };
  const execFileImpl = (bin, args, opts, cb) => {
    const a = script[Math.min(calls, script.length - 1)]; calls++;
    if (a === 'hang') { clock += opts.timeout; cb(Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' }), '', ''); } else cb(null, 'agent-browser ' + a, '');
  };
  const f = F.createBrowserFacts({ execFileImpl, now: () => clock, retryMs, timers });
  return { f, waiting, calls: () => calls, clock: () => clock, advance: (ms) => { clock += ms; },
    fire: async () => { const h = waiting.shift(); if (!h) return null; clock = Math.max(clock, h.due); h.run(); await sleep(0); return h; } };
}
{
  // THE TABLE: a binary that never answers — attempt → delay before it → outcome
  const w = ladderWorld(['hang']);
  const rows = [];
  const t0 = w.clock();
  await w.f.probeVersion();
  rows.push({ attempt: 1, after: 'boot', outcome: w.f.lastProbe().ok ? 'answer' : 'miss', next: w.f.lastProbe().nextAt ? (w.f.lastProbe().nextAt - w.f.lastProbe().at) / 1000 + ' s' : (w.f.lastProbe().exhausted ? 'exhausted' : '—') });
  let fired;
  while ((fired = await w.fire())) {
    const p = w.f.lastProbe();
    rows.push({ attempt: p.attempts, after: fired.delay / 1000 + ' s', outcome: p.ok ? 'answer' : 'miss', next: p.nextAt ? (p.nextAt - p.at) / 1000 + ' s' : (p.exhausted ? 'exhausted' : '—') });
    if (rows.length > 20) break;
  }
  console.log('    attempt │ after   │ outcome │ next');
  for (const r of rows) console.log(`    ${String(r.attempt).padEnd(7)} │ ${r.after.padEnd(7)} │ ${r.outcome.padEnd(7)} │ ${r.next}`);
  const p = w.f.lastProbe();
  ok(rows.length === 6 && rows.map((r) => r.after).join() === 'boot,5 s,15 s,45 s,120 s,600 s' && rows.slice(0, 5).every((r) => r.next !== 'exhausted') && rows[5].next === 'exhausted',
    'THE TABLE: the boot miss, then 5 s / 15 s / 45 s / 2 min / 10 min — EXHAUSTED only at the 6th miss (5 retries, bounded)', rows);
  ok(w.calls() === 6 && w.waiting.length === 0 && p.exhausted && p.attempts === 6 && p.nextAt === null && p.why === 'timed out after 8 s' && p.since === t0 && p.at - p.since === 833e3,
    'after the last rung: 6 probes, NO timer left, the state names 6 tries over 833 s (785 s of waits + 6 × 8 s timeouts)', p);
  ok(B.floorNotice(B.floorVerdict(w.f.lastVersion(), B.FLOOR_VERSION, p)).startsWith('Could not read the agent-browser version after 6 tries over 14 minutes (timed out after 8 s)'), 'the verdict over that state is settled ⇒ the notice\'s words');
  // a later probe (the Check again door, a reader past the memo) still misses: counted, no new ladder
  await w.f.probeVersion({ fresh: true });
  ok(w.f.lastProbe().attempts === 7 && w.f.lastProbe().exhausted && w.waiting.length === 0, 'exhausted stays exhausted: a later miss counts (7 tries), no second ladder');
  // and an answer resets everything
  const w2 = ladderWorld(['hang', 'hang', 'hang', 'hang', 'hang', 'hang', 'hang', '0.38.1']);
  await w2.f.probeVersion(); while (await w2.fire()) { /* to the end */ }
  await w2.f.probeVersion({ fresh: true }); await w2.f.probeVersion({ fresh: true });
  ok(w2.f.lastProbe().ok === true && w2.f.lastProbe().attempts === 8 && w2.f.lastProbe().exhausted === false && w2.f.lastVersion() === '0.38.1', 'the first answer after it: ok, the tries it took (8), not exhausted');
}
{
  // HANGS TWICE, THEN ANSWERS: unknown → known, the ladder ends by itself
  const w = ladderWorld(['hang', 'hang', '0.38.1']);
  await w.f.probeVersion();
  const v1 = B.floorVerdict(w.f.lastVersion(), B.FLOOR_VERSION, w.f.lastProbe());
  ok(v1.state === 'unknown' && !v1.settled && v1.sharedProfiles === false && B.floorNotice(v1) === null, 'after the first miss: unknown, NOT settled, capability off, no notice');
  await w.fire();
  const reader0 = w.calls();
  w.advance(1000); await w.f.probeVersion(); await w.f.probeVersion();
  ok(w.calls() === reader0 && w.waiting.length === 1 && w.waiting[0].delay === 15e3, 'a READER inside the memo while a rung waits forks nothing and moves no rung (the per-action fork rule)');
  await w.fire();
  const p = w.f.lastProbe();
  ok(p.ok && p.attempts === 3 && w.waiting.length === 0 && w.f.lastVersion() === '0.38.1' && B.floorVerdict(w.f.lastVersion(), B.FLOOR_VERSION, p).state === 'ok', 'the third try answers ⇒ ok (3 tries), NO rung left — the floor is known without anybody being told it was not', p);
}
{
  // stop(): the owner's end
  const w = ladderWorld(['hang']);
  await w.f.probeVersion();
  ok(w.waiting.length === 1, 'a miss leaves ONE rung waiting');
  w.f.stop();
  ok(w.waiting.length === 0 && w.f.lastProbe().nextAt === null, 'stop() clears it (the owner\'s shutdown — no timer outlives its owner)');
  await w.f.probeVersion({ fresh: true });
  ok(w.waiting.length === 0 && w.f.lastProbe().exhausted === false, '…and none is set again after it');
  // one-shot owners (no ladder): browser-env's too-old reader, the panel's PATH binary
  const o = ladderWorld(['hang'], { retryMs: null });
  await o.f.probeVersion(); await o.f.probeVersion({ fresh: true });
  ok(o.waiting.length === 0 && o.f.lastProbe().exhausted === false && B.floorNotice(await o.f.floor()) === null, 'a one-shot owner (no ladder) never sets a rung and never settles ⇒ never the notice');
  // the control shape: an EMPTY ladder is the old one-shot verdict
  const e = ladderWorld(['hang'], { retryMs: [] });
  await e.f.probeVersion();
  ok(e.f.lastProbe().exhausted === true && e.f.lastProbe().attempts === 1, 'CONTROL SHAPE: an EMPTY ladder is exhausted by its first miss (the one-shot that decided for ever)');
}

// ═══ ③ the REAL keeper over the fake binary ═══════════════════════════════════
console.log('— ③ the real keeper over the fake binary (real child processes, a short ladder)');
// a hung fake (Atomics.wait) outlives a probe its caller abandoned at exit (the keeper's other `--version` reader waits 8 s):
// every one is named in <state>/hung-pids and ended — registered BEFORE scratch(), whose own exit handler removes the dir
let reapHung = () => { };
process.on('exit', () => reapHung());
const ROOT = scratch('bprobe');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const AB = path.join(ROOT, 'ab-state');
const fake = writeFakeAgentBrowser(path.join(ROOT, 'bin'), AB);
reapHung = () => { let pids = []; try { pids = fs.readFileSync(path.join(AB, 'hung-pids'), 'utf8').split('\n').map(Number).filter((n) => n > 1); } catch { } for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch { } } };
process.on('exit', () => { try { fake.reap(); } catch { } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
const PATH_ENV = `${path.join(ROOT, 'bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
const mode = (name) => (v) => { const p = path.join(AB, name); if (v === null) fs.rmSync(p, { force: true }); else fs.writeFileSync(p, String(v)); };
const hang = mode('version-hang'), failing = mode('version-fail'), hold = mode('version-hold'), release = mode('version-release');
const probes = () => { try { return fs.readFileSync(path.join(AB, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((c) => c.verb === '--version').length; } catch { return 0; } };
const K = require('../src/server/browser-keeper.js');
const { UserTodoManager } = require('../src/user-todos.js');
// an answering probe gets a whole second (a loaded runner starts node slowly); a failing one exits at once ('version-fail')
const LADDER = { retryMs: [30, 30, 30, 30, 30], timeoutMs: 1000 };
const journal = [];
const quiet = { log: (...a) => journal.push(a.join(' ')), warn: (...a) => journal.push(a.join(' ')), error: () => { } };
const keepers = [];
const mkKeeper = (dataDir, todos, ladder = LADDER, extra = {}) => {
  fs.mkdirSync(dataDir, { recursive: true });
  const k = K.create({ dataDir, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB }), serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: quiet, hostKnown: () => false, userTodos: todos, probeLadder: ladder, ...extra });
  keepers.push(k);
  return k;
};
const mkTodos = (dir) => { fs.mkdirSync(dir, { recursive: true }); return new UserTodoManager({ dataDir: dir, onChange: () => { }, expirySweepMs: 0 }); };
const floorItems = (todos) => todos.forSession('browser').filter((i) => i.action && i.action.type === 'browser-floor-check');
process.on('exit', () => { for (const k of keepers) { try { k.shutdown(); } catch { } } });
// the keeper's OWN probe state is the judge (its facts' tries), never the fake's call count: the keeper has a second,
// memoized `--version` reader (the running browsers' CLI, cliVersionAt) that may ask the same binary at boot

{
  // (a) HANGS TWICE, THEN ANSWERS ⇒ unknown → ok, NO notice
  const todos = mkTodos(path.join(ROOT, 'todos-a'));
  const k = mkKeeper(path.join(ROOT, 'data-a'), todos, { retryMs: [150, 150, 150, 150, 150], timeoutMs: 1000 });
  hang('always');
  await k.boot();
  const sawMiss = await waitFor(() => { const p = k.floorFacts().lastProbe; return p && !p.ok; }, 5000);
  const during = k.floorFacts();
  ok(sawMiss && during.floor && during.floor.state === 'unknown' && during.floor.settled === false && during.floor.sharedProfiles === false && during.lastProbe.why === 'timed out after 1 s' && floorItems(todos).length === 0,
    'the BOOT probe hung (killed at its timeout) ⇒ the floor reads unknown, unsettled — no shared profile opens on it, and nothing is filed', during);
  const twice = await waitFor(() => (k.floorFacts().lastProbe?.attempts || 0) >= 2, 6000);
  hang(0); // it hung twice; from now on it answers
  const healed = await waitFor(() => k.floorFacts().lastProbe?.ok === true, 8000);
  const f = k.floorFacts();
  ok(twice && healed && f.version === '0.38.1' && f.floor.state === 'ok' && f.floor.sharedProfiles === true && f.lastProbe.attempts === 3,
    'HUNG TWICE, THEN ANSWERED: the ladder asked again by itself — the third try ⇒ ok (3 tries), the floor known', f);
  ok(floorItems(todos).length === 0 && todos.forSession('browser').length === 0 && !journal.some((l) => /Could not read/.test(l)), 'NO notice was ever filed (the For-you store holds nothing, the journal says nothing) — a transient stays a transient');
  ok(k.list().floor && k.list().floor.state === 'ok' && k.list().lastProbe && k.list().lastProbe.attempts === 3, 'the digest (GET /api/browser/profiles) carries the floor + the probe state');
  k.shutdown();
}
{
  // (c) SINGLE FLIGHT under 3 concurrent readers — the door, the act's read, the installs page — over a COUNTED execFile
  // (the keeper's facts as production builds them, plus a counter: every fork is one call of the wrapper)
  const { execFile } = require('node:child_process');
  let forks = 0;
  const counted = (...a) => { forks++; return execFile(...a); };
  const env = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB };
  const facts = F.createBrowserFacts({ cmd: path.join(ROOT, 'bin', 'agent-browser'), execFileImpl: counted, env, retryMs: LADDER.retryMs, timeoutMs: 5000 });
  const k = mkKeeper(path.join(ROOT, 'data-c1'), mkTodos(path.join(ROOT, 'todos-c1')), LADDER, { facts });
  fs.rmSync(path.join(AB, 'held.log'), { force: true });
  hold(1);
  const readers = Promise.all([k.checkFloorNow(), facts.probeVersion(), k.cliFacts().then((c) => c.inUse.version)]);
  const held = await waitFor(() => { try { return fs.readFileSync(path.join(AB, 'held.log'), 'utf8').trim().length > 0; } catch { return false; } }, 5000);
  await sleep(150); // every reader has asked by now
  release(1);
  const rs = await readers;
  hold(null); release(null);
  ok(held && forks === 1 && rs[0].version === '0.38.1' && rs[1] === '0.38.1' && rs[2] === '0.38.1' && facts.lastProbe().attempts === 1,
    `SINGLE FLIGHT: the door, the act's read and the installs page asked while ONE probe was held ⇒ ${forks} fork, one answer for all three`, { forks, rs: [rs[0].version, rs[1], rs[2]] });
  k.shutdown();
}
{
  // (b) NEVER ANSWERS ⇒ ONE notice after the ladder
  const todosB = mkTodos(path.join(ROOT, 'todos-b'));
  const kB = mkKeeper(path.join(ROOT, 'data-b'), todosB);
  failing('always');
  await kB.boot();
  const third = await waitFor(() => (kB.floorFacts().lastProbe?.attempts || 0) >= 3, 5000);
  ok(third && floorItems(todosB).length === 0, 'three misses in: still NOTHING filed (the ladder is still asking)');
  const ex = await waitFor(() => kB.floorFacts().lastProbe?.exhausted === true, 8000);
  await sleep(20);
  const items = floorItems(todosB);
  const it = items[0] || {};
  ok(ex && items.length === 1 && kB.floorFacts().lastProbe.attempts === 6, `the ladder EXHAUSTED (6 tries) ⇒ exactly ONE For-you item (${items.length})`, { items, probe: kB.floorFacts().lastProbe });
  ok(it.kind === 'notice' && it.origin === 'browser' && it.sessionName === 'Agent browser' && it.action && it.action.type === 'browser-floor-check',
    'it is a browser notice carrying the Check again door (action browser-floor-check)', it);
  ok(/^Could not read the agent-browser version after 6 tries over \d+ seconds? \(exited 1 without a version\): shared profiles stay off until it answers\./.test(it.text || '')
    && /again 30 ms, 30 ms, 30 ms, 30 ms and 30 ms after each miss, each time waiting up to 1 s/.test(it.detail || '') && /Check again asks once more now/.test(it.detail || ''),
    'its words name the tries, the span and the last why; the detail names the ladder and the door', { text: it.text, detail: it.detail });
  // the facts API + the door, through the REAL router
  const express = require('express');
  const R = require('../src/routes/browser.js');
  const app = express(); app.use(express.json());
  R.setup({ keeper: kB, activeSessions: new Map(), browserEnv: () => null });
  app.use(R.router);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const API = `http://127.0.0.1:${srv.address().port}`;
  const j = async (method, p) => { const res = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const reg = R.router.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
  ok(reg.includes('GET /api/browser/floor') && reg.includes('POST /api/browser/floor/check') && reg.includes('GET /api/browser/profiles') && reg.includes('GET /api/browser/cli') && reg.length >= 60,
    `the router registers the floor routes beside their neighbours at MOUNT (${reg.length} routes) — none nested inside another handler`);
  let r = await j('GET', '/api/browser/floor');
  ok(r.status === 200 && r.json.version === '' && r.json.floor.state === 'unknown' && r.json.floor.settled === true && r.json.lastProbe.attempts === 6 && r.json.lastProbe.ok === false && r.json.lastProbe.why === 'exited 1 without a version' && typeof r.json.lastProbe.at === 'number',
    'GET /api/browser/floor: {version, floor, lastProbe {at, ok, why, attempts, …}}', r.json);
  const n1 = probes();
  r = await j('POST', '/api/browser/floor/check');
  ok(r.status === 200 && r.json.floor.state === 'unknown' && r.json.lastProbe.attempts === 7 && probes() - n1 >= 1 && floorItems(todosB).length === 1,
    'Check again while it still fails: ONE probe, still unknown (7 tries) — and NO second item', { json: r.json, items: floorItems(todosB).length });
  failing(0);
  r = await j('POST', '/api/browser/floor/check');
  const after = todosB.get(it.id);
  ok(r.status === 200 && r.json.floor.state === 'ok' && r.json.version === '0.38.1' && after && after.status === 'done' && floorItems(todosB).length === 0,
    'Check again once it answers ⇒ ok — and the notice is WITHDRAWN (resolved by the fact that negates it)', { json: r.json, status: after && after.status });
  ok(journal.some((l) => /its "could not read" notice is withdrawn/.test(l)), 'the journal says it was withdrawn');
  await new Promise((r2) => srv.close(r2));
  kB.shutdown();
}
{
  // (d) A RESTART ADOPTS the open item — never a second one; the next answer withdraws it
  const todos = mkTodos(path.join(ROOT, 'todos-d'));
  failing('always');
  const k1 = mkKeeper(path.join(ROOT, 'data-d1'), todos);
  await k1.boot();
  await waitFor(() => k1.floorFacts().lastProbe?.exhausted === true, 8000);
  await sleep(20);
  k1.shutdown();
  const first = floorItems(todos);
  const k2 = mkKeeper(path.join(ROOT, 'data-d2'), todos);
  await k2.boot();
  await waitFor(() => k2.floorFacts().lastProbe?.exhausted === true, 8000);
  await sleep(20);
  ok(first.length === 1 && floorItems(todos).length === 1 && floorItems(todos)[0].id === first[0].id, 'a second keeper (a restart) whose ladder also ends adopts the OPEN item — still exactly one', { first: first.length, now: floorItems(todos).length });
  k2.shutdown();
  failing(0);
  const k3 = mkKeeper(path.join(ROOT, 'data-d3'), todos);
  await k3.boot();
  await waitFor(() => k3.floorFacts().lastProbe?.ok === true, 5000);
  await sleep(20);
  ok(floorItems(todos).length === 0 && todos.get(first[0].id).status === 'done', 'a restart whose boot probe answers withdraws the item the previous run filed');
  k3.shutdown();
}
{
  // (e) SHUTDOWN ends the rung
  const todos = mkTodos(path.join(ROOT, 'todos-e'));
  failing('always');
  const k = mkKeeper(path.join(ROOT, 'data-e'), todos, { retryMs: [200, 200, 200, 200, 200], timeoutMs: 1000 });
  await k.boot();
  await waitFor(() => k.floorFacts().lastProbe && k.floorFacts().lastProbe.nextAt, 5000);
  k.shutdown();
  const n0 = probes();
  await sleep(350);
  ok(probes() === n0 && k.floorFacts().lastProbe.nextAt === null && floorItems(todos).length === 0, 'keeper.shutdown() mid-ladder: the waiting rung never fires (no timer outlives its owner)');
  failing(0);
}

// ═══ ④ RED CONTROLS ══════════════════════════════════════════════════════════
console.log('— ④ RED controls: the old one-shot files the notice after the FIRST failure');
{
  // (i) THE BASE TREE: browser-env's checkFloor over a probe that failed ONCE (a killed child, the 8 s timeout's shape).
  // The pre-fix tree = the parent of the commit that brought the ladder (PROBE_RETRY_MS) — HEAD while it is uncommitted.
  const killedOnce = () => { let n = 0; return (bin, args, opts, cb) => { n++; if (n === 1) cb(Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' }), '', ''); else cb(null, 'agent-browser 0.38.1', ''); }; };
  const run = async (root, tag) => {
    const BE = require(path.join(root, 'src/server/browser-env.js'));
    const FF = require(path.join(root, 'src/browser-facts.js'));
    const notices = [];
    const dir = path.join(ROOT, 'env-' + tag); fs.mkdirSync(dir, { recursive: true });
    const e = BE.create({ dataDir: dir, homeDir: HOME, serverNotice: (k, t) => { notices.push({ k, t }); return 1; }, telemetry: null, serverSetting: () => undefined, log: { warn() { }, log() { } }, keepOn: () => false,
      env: { XDG_RUNTIME_DIR: dir }, socketDirBase: path.join(dir, 'sb'), facts: FF.createBrowserFacts({ execFileImpl: killedOnce() }) });
    await e.checkFloor();
    return notices;
  };
  let base = null, why = null;
  try {
    const env = gitEnvFrom(process.env);
    const intro = execFileSync('git', ['log', '--format=%H', '-S', 'PROBE_RETRY_MS', '--', 'src/browser-facts.js'], { cwd: REPO, encoding: 'utf8', env }).trim().split('\n').filter(Boolean).pop();
    const headHas = execFileSync('git', ['show', 'HEAD:src/browser-facts.js'], { cwd: REPO, encoding: 'utf8', env, maxBuffer: 64 << 20 }).includes('PROBE_RETRY_MS');
    const ref = intro ? intro + '^' : headHas ? null : 'HEAD';
    if (!ref) why = 'the commit that brought the ladder is not in this checkout (a depth-1 clone)';
    else {
      base = path.join(ROOT, 'base');
      fs.mkdirSync(base, { recursive: true });
      const tar = execFileSync('git', ['archive', '--format=tar', ref, 'src'], { cwd: REPO, env, maxBuffer: 256 << 20 });
      execFileSync('tar', ['-x', '-C', base], { input: tar });
    }
  } catch (e) { base = null; why = 'the pre-fix tree could not be read: ' + (e && e.message); }
  if (!base) console.log(`  - SKIP the base-tree control: ${why}`);
  else {
    const before = await run(base, 'base');
    ok(before.length === 1 && before[0].k === 'agent-browser-floor' && /Could not read the installed agent-browser version/.test(before[0].t),
      'RED ON THE BASE TREE: one failed probe ⇒ the 「shared profiles stay off」 notice AT ONCE (the .268 incident, reproduced)', before);
    const now = await run(REPO, 'now');
    ok(now.length === 0, 'THIS TREE, the same probe: browser-env says nothing (an unsettled unknown is not its sentence)', now);
  }
  // (ii) the same keeper with an EMPTY ladder — the one-shot shape in this tree's own code
  const todos = mkTodos(path.join(ROOT, 'todos-x'));
  failing('always');
  const k = mkKeeper(path.join(ROOT, 'data-x'), todos, { retryMs: [], timeoutMs: 1000 });
  await k.boot();
  await waitFor(() => floorItems(todos).length > 0, 5000);
  ok(floorItems(todos).length === 1 && k.floorFacts().lastProbe.attempts === 1 && /after 1 try over/.test(floorItems(todos)[0].text), 'CONTROL: an EMPTY ladder ⇒ the notice after the FIRST failure (1 try) — the ladder is what holds it back', { items: floorItems(todos).map((i) => i.text), probe: k.floorFacts().lastProbe });
  k.shutdown();
  failing(0);
}

// ═══ ⑤ wiring ════════════════════════════════════════════════════════════════
console.log('— ⑤ wiring: the pane\'s Check again, the model\'s verb, the words');
{
  const L = await import(pathToFileURL(path.join(REPO, 'src/lib/inbox-window-layout.js')).href);
  const item = { id: 'ut-1', sessionKey: 'browser', status: 'open', kind: 'notice', text: 'x', action: { type: 'browser-floor-check' } };
  const v = L.itemView(item, {});
  ok(Array.isArray(v.actions) && v.actions[0] === 'browser-floor-check' && !L.itemView({ ...item, status: 'done' }, {}).actions.includes('browser-floor-check'), 'the For-you window\'s pane: Check again FIRST on the open item, gone once it is resolved', v.actions);
  const act = read('src/lib/user-todos-actions.js');
  const at = act.indexOf("rec.action.type === 'browser-floor-check'");
  const verb = at >= 0 ? act.slice(at, act.indexOf('\n    }\n', at)) : '';
  ok(/fetchJson\('\/api\/browser\/floor\/check', \{ method: 'POST'/.test(verb) && /return true;/.test(verb) && /return false;/.test(verb), 'the model\'s verb posts the ONE door (POST /api/browser/floor/check); an answer advances, a miss stays');
  const win = read('src/lib/inbox-window.js');
  ok(/'browser-floor-check': \(\) => actBtn\('browser-floor-check', UI_ICONS\.refresh, t\('Check again'\)/.test(win) && /if \(a === 'browser-floor-check'\) \{ if \(await model\.runAction\(it\)\) advance\(id\); return; \}/.test(win), 'the window draws the button and runs the model\'s verb');
  const Z = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default;
  const Jx = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
  const keys = ['Check again', 'Ask for the browser version once more now — this notice goes away by itself once it reads', 'The browser version reads again: {version}', 'Still no answer: {why}'];
  ok(keys.every((k) => Z[k] && Jx[k]), 'the words: zh + ja for the button, its title and both toasts', keys.filter((k) => !Z[k] || !Jx[k]));
}

for (const k of keepers) { try { k.shutdown(); } catch { } }
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? ` passed, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
