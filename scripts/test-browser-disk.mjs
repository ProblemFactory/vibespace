#!/usr/bin/env node
// lane browser-disk-sample (B-5fab): THE BROWSER DISK SAMPLE — a profile that grows past BROWSER_DISK_BYTES on disk is
// said in For you, with what grew. Fast, no Chrome:
//   §1 the cadence step function walked (a seeded 2 000-event walk: never two profiles in one minute, never a sample
//      inside 15 min of the last except a debounced start/stop, one child at a time, a timeout ⇒ the next on schedule)
//   §2 the `du -sk` parser over GNU + BSD lines + garbage, duVerdict (timeout / signal / exit ≠ 0 / vanished files)
//   §3 growthOf, topDirs, expandNames, the words; §4 the verdict over runaway-guard's own diskVerdict table + diskFact
//   §5 the REAL keeper over a SCRATCH profile dir (real blocks, the limit lowered through `limits` injection, real `du`):
//      ONE For-you notice naming the profile, the size, the limit, the top subdirectory and the remedy; none inside the
//      hysteresis; resolved when it shrinks; a new episode after the re-arm; GET rows carry `disk`
//   §6 a paired machine's row = disk_not_measured (no child); a timeout ⇒ unknown, logged once per hour, no notice;
//      a REAL `timeout` + SIGKILL ends a child that does not answer
//   §7 the panel row's On disk in en / zh / ja; §8 source pins (the du child census, PURE imports, no sync walk, the
//      view patches in place); §9 patched-copy controls (scripts/mutant-copy.mjs, §51): a sync walk, a notice with no
//      remedy, a step that samples two profiles in one minute — each red.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const D = require('../src/browser-disk.js');
const RG = require('../src/runaway-guard.js');
const LIMITS = require('../src/keeper-limits.js');
const RUN = require('../src/server/browser-disk-run.js');
const K = require('../src/server/browser-keeper.js');
const PM = await import('../src/lib/browser-panel-model.js');
const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const MIN = 60e3, G = 2 ** 30, MiB = 2 ** 20;
const SCR = scratchDir('bdisk');
process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { /* */ } });

// ── §1 the cadence walk ──
console.log('§1 diskSampleStep — a seeded 2 000-event walk');
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function walk(step, seed = 7, n = 2000) {
  const rnd = mulberry(seed), ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  let st = null, t = 1_800_000_000_000, pending = null; const samples = [], kicks = [], bad = [];
  let timeouts = 0, running = null;
  const take = (r, ev) => { st = r.state; if (!r.sample) return; const s = { ...r.sample, at: t };
    if (running) bad.push(`two children: ${running.id} still running when ${s.id} began`);
    const prevAny = samples[samples.length - 1]; if (prevAny && t - prevAny.at < MIN) bad.push(`two samples in one minute: ${prevAny.id}@${prevAny.at} then ${s.id}@${t}`);
    const prev = [...samples].reverse().find((x) => x.id === s.id);
    if (s.why === 'due' && prev && t - prev.at < D.DISK_SAMPLE_EVERY_MS) bad.push(`${s.id} due ${Math.round((t - prev.at) / 1000)} s after its last`);
    if (s.why !== 'due') { const k = kicks.find((x) => x.id === s.id && x.kind === s.why && x.at >= (prev ? prev.at : 0) && x.at <= t); if (!k) bad.push(`${s.id} ${s.why} sample with no ${s.why} event since its last`); const pk = [...samples].reverse().find((x) => x.id === s.id && x.why !== 'due'); if (pk && t - pk.at < MIN) bad.push(`${s.id} two start/stop samples inside a minute`); }
    if (ev === 'start' || ev === 'stop') { /* a kick sample may start on its own event */ }
    samples.push(s); running = s; const dur = Math.floor(rnd() * 75e3) + 500; pending = { id: s.id, at: t + dur, timeout: dur >= 60e3 }; };
  for (let i = 0; i < n; i++) {
    t += Math.floor(rnd() * 40e3);
    if (pending && pending.at <= t) { if (pending.timeout) timeouts++; const r = step(st, { type: 'done', id: pending.id }, t); running = null; pending = null; take(r, 'done'); continue; }
    const x = rnd();
    if (x < 0.75) take(step(st, { type: 'tick', ids }, t), 'tick');
    else { const kind = x < 0.875 ? 'start' : 'stop', id = ids[Math.floor(rnd() * ids.length)]; kicks.push({ id, kind, at: t }); take(step(st, { type: kind, id }, t), kind); }
  }
  const gaps = ids.map((id) => { const at = samples.filter((s) => s.id === id).map((s) => s.at); let g = 0; for (let j = 1; j < at.length; j++) g = Math.max(g, at[j] - at[j - 1]); return g; });
  return { samples, bad, timeouts, maxGap: Math.max(...gaps), kickSamples: samples.filter((s) => s.why !== 'due').length };
}
{
  const w = walk(D.diskSampleStep);
  ok(w.samples.length > 100 && w.kickSamples > 10 && w.timeouts > 5, `the walk is not vacuous: ${w.samples.length} samples, ${w.kickSamples} start/stop samples, ${w.timeouts} timeouts`);
  ok(w.bad.length === 0, `never two profiles in one minute, never two children, never a due sample inside 15 min, a start/stop sample only after its event (${w.bad.slice(0, 3).join(' | ') || 'none'})`);
  ok(w.maxGap <= D.DISK_SAMPLE_EVERY_MS + 12 * MIN, `every profile is measured again on schedule (largest gap ${Math.round(w.maxGap / MIN)} min, 6 profiles, 1 per minute)`);
  // the debounce, the timeout schedule, the stale child
  let r = D.diskSampleStep(null, { type: 'tick', ids: ['a', 'b'] }, 0);
  ok(r.sample && r.sample.id === 'a' && r.sample.why === 'due', 'a new profile is due at once (the first in order)');
  const s0 = r.state;
  r = D.diskSampleStep(s0, { type: 'tick', ids: ['a', 'b'] }, 30e3); ok(!r.sample, 'b waits: a child runs');
  r = D.diskSampleStep(r.state, { type: 'done', id: 'a' }, 40e3); ok(!r.sample, 'b waits: the minute is a\'s');
  r = D.diskSampleStep(r.state, { type: 'tick', ids: ['a', 'b'] }, 60e3); ok(r.sample && r.sample.id === 'b', 'b one minute later (staggered)');
  r = D.diskSampleStep(r.state, { type: 'done', id: 'b' }, 70e3);
  let k = D.diskSampleStep(r.state, { type: 'start', id: 'a' }, 125e3); ok(k.sample && k.sample.id === 'a' && k.sample.why === 'start', 'a start samples at once when the minute is free');
  k = D.diskSampleStep(k.state, { type: 'done', id: 'a' }, 126e3);
  k = D.diskSampleStep(k.state, { type: 'stop', id: 'a' }, 150e3); ok(!k.sample && k.state.profiles.a.kickAt === null, 'a stop 25 s after the start is debounced away (one per 60 s)');
  k = D.diskSampleStep(k.state, { type: 'tick', ids: ['a', 'b'] }, 190e3); ok(!k.sample, 'and nothing is due inside 15 min');
  const t1 = D.diskSampleStep(null, { type: 'tick', ids: ['x'] }, 0); // x's child times out (done after 60 s, measured nothing)
  let t2 = D.diskSampleStep(t1.state, { type: 'done', id: 'x' }, 61e3); t2 = D.diskSampleStep(t2.state, { type: 'tick', ids: ['x'] }, 14 * MIN);
  ok(!t2.sample, 'a timed-out sample is not retried early (unknown, then the schedule)');
  t2 = D.diskSampleStep(t2.state, { type: 'tick', ids: ['x'] }, 15 * MIN); ok(t2.sample && t2.sample.id === 'x', '…and runs again 15 min after the timed-out one began');
  const w1 = D.diskSampleStep(null, { type: 'tick', ids: ['y'] }, 0); // a `done` that never comes is forgotten
  ok(!D.diskSampleStep(w1.state, { type: 'start', id: 'y' }, 2 * MIN).sample && D.diskSampleStep(w1.state, { type: 'start', id: 'y' }, 3 * MIN + 1).sample, 'a child whose done never came is forgotten after 2 × the timeout + a minute (never a wedged clock)');
  const gone = D.diskSampleStep(s0, { type: 'tick', ids: ['b'] }, 61e3); ok(!gone.state.profiles.a && gone.state.profiles.b, 'a removed profile leaves the schedule');
  ok(JSON.stringify(s0) === JSON.stringify(D.diskSampleStep(null, { type: 'tick', ids: ['a', 'b'] }, 0).state), 'the step never mutates its input');
}

// ── §2 parser + verdict ──
console.log('§2 parseDu / duVerdict');
{
  const gnu = '1310724\t/home/u/.agent-browser/vs-p1\n', bsd = '1310724\t/Users/u/.agent-browser/vs-p1\n';
  ok(JSON.stringify(D.parseDu(gnu)) === JSON.stringify([{ kb: 1310724, path: '/home/u/.agent-browser/vs-p1' }]), 'GNU du -sk line');
  ok(D.parseDu(bsd)[0].kb === 1310724 && D.parseDu('12 /a b/c d\r\n')[0].path === '/a b/c d', 'BSD line, a path with spaces, a CRLF');
  ok(D.parseDu('du: cannot read directory\n\nNaN\tx\n-5\tx\n12\n\t\n').length === 0, 'garbage is skipped');
  const dir = '/home/u/.agent-browser/vs-p1';
  ok(JSON.stringify(D.duVerdict({ code: 0, stdout: gnu.replace('/home/u/.agent-browser/vs-p1', dir) }, dir)) === JSON.stringify({ state: 'ok', bytes: 1310724 * 1024, partial: false }), 'exit 0 + the total ⇒ ok, KiB × 1024');
  ok(D.duVerdict({ timedOut: true, signal: 'SIGKILL', code: null, stdout: '' }, dir).state === 'unknown', 'a timeout ⇒ unknown');
  ok(D.duVerdict({ code: null, signal: 'SIGTERM', stdout: gnu }, dir).state === 'unknown', 'a signal ⇒ unknown');
  ok(D.duVerdict({ spawnError: 'ENOENT' }, dir).state === 'unknown', 'no du ⇒ unknown');
  const perm = D.duVerdict({ code: 1, stdout: gnu, stderr: `du: cannot read directory '${dir}/x': Permission denied\n` }, dir);
  ok(perm.state === 'unknown' && /exited 1: du: cannot read/.test(perm.why), 'exit ≠ 0 ⇒ unknown (said with du\'s line)');
  const vanished = D.duVerdict({ code: 1, stdout: gnu, stderr: `du: cannot access '${dir}/Default/Cache/f_01': No such file or directory\n` }, dir);
  ok(vanished.state === 'ok' && vanished.partial === true, 'exit 1 whose only complaint is a file that vanished mid-walk ⇒ the total, said partial');
  ok(D.duVerdict({ code: 0, stdout: '' }, dir).state === 'unknown', 'exit 0 with no total ⇒ unknown');
}

// ── §3 growth, top, words ──
console.log('§3 growthOf / topDirs / expandNames / words');
{
  ok(JSON.stringify(D.growthOf({ bytes: 1 * G, at: 0 }, { bytes: 1.5 * G, at: 15 * MIN })) === JSON.stringify({ bytes: 0.5 * G, ms: 15 * MIN }), 'growthOf: next − prev over the time between');
  ok(D.growthOf(null, { bytes: 1, at: 1 }) === null && D.growthOf({ bytes: NaN, at: 0 }, { bytes: 1, at: 1 }) === null && D.growthOf({ bytes: 1, at: 5 }, { bytes: 2, at: 1 }) === null, 'growthOf: null without two measurements in order');
  const dir = '/d/vs-p1';
  const top = D.topDirs(D.parseDu(`5\t${dir}/ShaderCache\n1600000\t${dir}/Default/Cache\n410000\t${dir}/Default/Service Worker\n7\t${dir}/Default/Local Storage\n9\t/elsewhere\n`), dir);
  ok(JSON.stringify(top.map((x) => x.name)) === JSON.stringify(['Default/Cache', 'Default/Service Worker', 'Default/Local Storage']) && top[0].bytes === 1600000 * 1024, 'topDirs: the 3 largest under the dir, relative, largest first');
  ok(JSON.stringify(D.expandNames(['Default', 'Profile 2', 'ShaderCache', 'Defaults'])) === JSON.stringify(['Default', 'Profile 2']), 'expandNames: Chrome\'s own profile folders are listed by their children');
  ok(D.sizeWords(2.4 * G) === '2.4 GB' && D.sizeWords(2 * G) === '2 GB' && D.sizeWords(420 * MiB) === '420 MB' && D.sizeWords(7.5 * MiB) === '7.5 MB' && D.sizeWords(12 * 1024) === '12 KB', 'sizeWords');
}

// ── §4 the verdict ──
console.log('§4 diskVerdict (runaway-guard\'s own table) + diskFact');
{
  ok(RG.diskVerdict(2 * G + 1).over && !RG.diskVerdict(2 * G).over, 'over at 2 GiB + 1, not at 2 GiB');
  ok(RG.diskVerdict(0.9 * 2 * G - 1).clear && !RG.diskVerdict(0.9 * 2 * G).clear, 'clear below the re-arm fraction, not at it');
  const lim = { ...LIMITS, BROWSER_DISK_BYTES: 4 * MiB };
  ok(RG.diskVerdict(4 * MiB + 1, { limits: lim }).over && RG.diskVerdict(4 * MiB + 1, { limits: lim }).limit === 4 * MiB, 'the limit comes from `limits` injection (never the constant)');
  ok(D.diskFact({ dir: '/d', measured: { state: 'ok', bytes: 2.4 * G, at: 5 } }).state === 'over' && D.diskFact({ dir: '/d', measured: { state: 'ok', bytes: 1.3 * G, at: 5 } }).state === 'ok', 'diskFact: ok / over');
  ok(D.diskFact({ dir: '/d' }).state === 'pending' && D.diskFact({ dir: '/d', measured: { state: 'unknown', why: 'du did not finish within 60 s', at: 9 }, last: { bytes: 7, at: 1 } }).bytes === 7, 'diskFact: pending before the first answer; unknown keeps the last measured bytes');
  const rem = D.diskFact({ dir: '/d', hostId: 'mac-1' });
  ok(rem.state === 'not-measured' && rem.code === 'disk_not_measured' && rem.reason === 'remote' && /paired machine/.test(rem.why), 'diskFact: a paired machine\'s row answers disk_not_measured with why');
}

// ── §5 the real keeper over a scratch profile dir ──
console.log('§5 the keeper — a scratch profile, real blocks, real du, a fake For-you store');
const fill = (f, bytes) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, crypto.randomBytes(Math.round(bytes))); };
function fakeTodos() {
  const items = []; let n = 0; const calls = { add: 0, setStatus: [] };
  return { items, calls, add(key, o) { calls.add++; const it = { id: 'td-' + (++n), sessionKey: key, status: 'open', ...o }; items.push(it); return it; },
    get(id) { return items.find((i) => i.id === id) || null; }, setStatus(id, status, by) { calls.setStatus.push([id, status, by]); const it = items.find((i) => i.id === id); if (it) it.status = status; return it; },
    forSession(k) { return items.filter((i) => i.sessionKey === k && i.status === 'open'); } };
}
const quiet = { log() { }, warn() { }, error() { } };
{
  const HOME = path.join(SCR, 'home'), dataDir = path.join(SCR, 'data'); fs.mkdirSync(HOME, { recursive: true });
  let clock = 1_800_000_000_000; const warns = [];
  const todos = fakeTodos();
  const lim = { ...LIMITS, BROWSER_DISK_BYTES: 4 * MiB };
  const k = K.create({ dataDir, homeDir: HOME, env: () => ({ PATH: '/usr/bin:/bin', HOME }), broadcast: () => { }, serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3,
    log: { ...quiet, warn: (m) => warns.push(String(m)) }, userTodos: todos, limits: lim, now: () => clock, taskInfo: () => null, hostKnown: () => false });
  const p = k.createProfile({ label: 'work' }, { owner: { kind: 'instance', id: null } });
  ok(p && p.dir && fs.existsSync(p.dir), `a named profile with its folder (${path.relative(SCR, p.dir)})`);
  ok(k.diskOf(p.id).state === 'pending' && k.list().profiles.find((x) => x.id === p.id).disk.state === 'pending', 'before the first sample: pending, on the GET rows too');
  const cache = path.join(p.dir, 'Default', 'Cache', 'data_1');
  fill(cache, 6 * MiB); fill(path.join(p.dir, 'Default', 'Local Storage', 'leveldb.log'), 1 * MiB); fill(path.join(p.dir, 'ShaderCache', 'blob'), 0.5 * MiB);
  const sample = async () => { k._disk.pass(); await k._disk.settled(); };
  await sample();
  const d1 = k.diskOf(p.id);
  ok(d1.state === 'over' && d1.bytes >= 7.5 * MiB && d1.bytes < 8 * MiB && d1.at === clock && d1.limit === 4 * MiB, `measured with real blocks: ${(d1.bytes / MiB).toFixed(2)} MiB, over the injected 4 MiB`);
  const row = k.list().profiles.find((x) => x.id === p.id).disk;
  ok(row && row.bytes === d1.bytes && row.at === d1.at && row.state === 'over', 'GET /api/browser/profiles rows carry disk {bytes, at, state} — the same fact');
  ok(todos.calls.add === 1 && todos.items[0].origin === 'browser' && todos.items[0].kind === 'notice' && todos.items[0].sessionKey === 'browser', 'ONE For-you notice, origin browser, kind notice');
  const n1 = todos.items[0];
  ok(n1.text.startsWith('The agent browser profile "work" is '), `it names the profile: ${n1.text}`);
  ok(/ is 7\.5 MB on disk \(limit 4 MB\)/.test(n1.text), 'it names the size and the limit');
  ok(/what grew: Default\/Cache /.test(n1.text), 'it names the top subdirectory first (Default/Cache)');
  ok(/Delete… in the Agent browser panel frees it; New profile… copied from "work" keeps its logins/.test(n1.text), 'it names the remedy in plain words');
  ok(/du -sk/.test(n1.detail) && /Nothing is stopped or deleted/.test(n1.detail), 'the detail says how it was measured and that nothing is stopped');
  clock += 15 * MIN; await sample();
  ok(todos.calls.add === 1, 'still over 15 min later: no second notice');
  fs.rmSync(cache); fill(cache, 2.3 * MiB); clock += 15 * MIN; await sample();
  const mid = k.diskOf(p.id);
  ok(mid.state === 'ok' && mid.bytes < 4 * MiB && mid.bytes >= 3.6 * MiB && todos.calls.setStatus.length === 0, `under the limit but above the re-arm fraction (${(mid.bytes / MiB).toFixed(2)} MiB): the notice stays`);
  fs.rmSync(cache); fill(cache, 6 * MiB); clock += 15 * MIN; await sample();
  ok(todos.calls.add === 1, 'over again inside the hysteresis: no second notice');
  fs.rmSync(cache); fill(cache, 0.1 * MiB); clock += 15 * MIN; await sample();
  ok(todos.calls.setStatus.length === 1 && todos.calls.setStatus[0][0] === n1.id && todos.items[0].status === 'done', 'it shrank below the re-arm fraction: the notice is resolved');
  for (let i = 0; i < 3; i++) { clock += 15 * MIN; await sample(); }
  fs.rmSync(cache); fill(cache, 6 * MiB); clock += 15 * MIN; await sample();
  ok(todos.calls.add === 2 && todos.items[1].status === 'open', 'after the re-arm (3 clear samples) a new crossing is a new notice');
  ok(warns.filter((w) => /reported, nothing stopped or deleted/.test(w)).length === 2, 'the journal says each crossing once');
  // a restart forgets reportTransition's state — the open notice is adopted, never filed twice
  const k2 = K.create({ dataDir, homeDir: HOME, env: () => ({ PATH: '/usr/bin:/bin', HOME }), broadcast: () => { }, serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: quiet, userTodos: todos, limits: lim, now: () => clock, taskInfo: () => null, hostKnown: () => false });
  k2._disk.pass(); await k2._disk.settled();
  ok(todos.calls.add === 2 && k2.diskOf(p.id).state === 'over', 'a restarted keeper adopts the open notice (no third)');
  // a start / stop event samples (debounced) — through the keeper's lease seam
  ok(read('src/server/browser-keeper.js').includes("onLease((ev) => { if (ev && ev.profileId && ev.local && (ev.kind === 'browser-ready' || ev.kind === 'browser-stopped')) disk.event("), 'the keeper samples at its browser\'s start / stop (the lease seam: browser-ready / browser-stopped)');
  k.shutdown?.(); k2.shutdown?.();
}

// ── §6 remote, timeout, unknown ──
console.log('§6 a paired machine\'s row, a timeout, a real kill');
{
  let spawns = 0; const warns = [];
  let clock = 1_000_000;
  const rows = [{ id: 'r1', label: 'mac', dir: '/Users/x/.agent-browser/vs-r1', host: 'mac-1' }, { id: 'l1', label: 'slow', dir: SCR }];
  const s = RUN.createDiskSampler({ profiles: () => rows, now: () => clock, log: { ...quiet, warn: (m) => warns.push(String(m)) },
    execFileImpl: (cmd, args, opts, cb) => { spawns++; setImmediate(() => cb(Object.assign(new Error('killed'), { killed: true, signal: 'SIGKILL', code: null }), '', '')); } });
  const r = await s.sampleDir({ dir: '/Users/x/.agent-browser/vs-r1', hostId: 'mac-1' });
  ok(r.state === 'not-measured' && r.code === 'disk_not_measured' && spawns === 0, 'sampleDir({hostId}) answers disk_not_measured — no child');
  ok(s.diskOf(rows[0]).code === 'disk_not_measured' && s.diskOf(rows[0]).reason === 'remote', 'the remote row\'s fact says why');
  s.pass(); await s.settled();
  ok(spawns === 1 && s.diskOf(rows[1]).state === 'unknown' && /did not finish within 60 s/.test(s.diskOf(rows[1]).why), 'a timed-out child ⇒ unknown (never a verdict)');
  clock += 15 * MIN; s.pass(); await s.settled();
  ok(spawns === 2 && warns.length === 1, 'the unknown is logged once per hour (2 timeouts, 1 line)');
  clock += 60 * MIN; s.pass(); await s.settled();
  ok(warns.length === 2, '…and again after the hour');
  // a REAL child that does not answer is killed by the call's own timeout + SIGKILL
  const real = RUN.createDiskSampler({ profiles: () => [], timeoutMs: 150, execFileImpl: (cmd, args, opts, cb) => execFile('sleep', ['5'], opts, cb) });
  const t0 = Date.now(); const rr = await real.sampleDir({ dir: SCR });
  ok(rr.state === 'unknown' && Date.now() - t0 < 3000, `a real child past its timeout is killed (${Date.now() - t0} ms) ⇒ unknown`);
}

// ── §7 the panel row ──
console.log('§7 the Agent browser row: On disk in en / zh / ja');
{
  const fillT = (dict) => (s, p) => String(dict ? (dict[s] ?? s) : s).replace(/\{(\w+)\}/g, (m, k2) => (p && k2 in p ? String(p[k2]) : m));
  const words = (dict) => ({ w: { t: fillT(dict), bytes: (n) => `${(n / G).toFixed(1)} GB`, size: (n) => `${Math.round(n / G)} GB` } });
  const r = (disk, extra = {}) => ({ id: 'p1', label: 'work', bytes: 0.2 * G, trace: { n: 0, used: 0, limit: G }, disk, ...extra });
  const okRow = r({ bytes: 1.3 * G, at: 1, state: 'ok', limit: 2 * G });
  const en = PM.diskFold(okRow, words(null));
  ok(en.key === 'disk' && en.k === 'On disk' && en.v === '1.3 GB of 2 GB' && en.tone === '', `en: ${en.k}: ${en.v}`);
  ok(PM.diskFold(okRow, words(zh)).k === '磁盘占用' && PM.diskFold(okRow, words(zh)).v === '1.3 GB / 2 GB' && PM.diskFold(okRow, words(ja)).k === 'ディスク使用量', 'zh / ja: the label and the size');
  const over = PM.diskFold(r({ bytes: 2.4 * G, at: 1, state: 'over', limit: 2 * G }), words(null));
  ok(over.tone === 'warn' && /said in For you/.test(over.title), 'over: the warn tone + the For-you sentence in its title');
  ok(PM.diskFold(r({ state: 'pending', bytes: null }), words(null)).v === 'not measured yet' && PM.diskFold(r(null), words(zh)).v === '尚未测量', 'pending / absent ⇒ not measured yet');
  const unk = PM.diskFold(r({ state: 'unknown', why: 'du did not finish within 60 s', bytes: null }), words(ja));
  ok(unk.v === 'まだ計測していません' && /60 s/.test(unk.title), 'unknown ⇒ not measured yet (its why in the title)');
  ok(PM.diskFold(r({ state: 'not-measured', reason: 'remote', code: 'disk_not_measured' }), words(null)).v === 'not measured — its folder is on a paired machine' && /ペアリング/.test(PM.diskFold(r({ state: 'not-measured', reason: 'remote' }), words(ja)).v), 'a remote row prints its why (en / ja)');
  ok(PM.usageLine(okRow, words(null)).l1 === '1.3 GB' && PM.usageLine(r(null), words(null)).l1 === '0.2 GB', 'the size cell reads the measured sample, the panel\'s own reading until then');
  const keys = PM.rowFold(okRow, words(null)).map((f) => f.key);
  ok(keys.indexOf('disk') >= 0 && keys.indexOf('disk') + 1 === keys.indexOf('records'), `the fold's On disk sits next to the records (${keys.join(' ')})`);
  for (const [n, dict] of [['zh', zh], ['ja', ja]]) ok(['On disk', 'not measured yet', 'not measured — its folder is on a paired machine', 'not measured — VibeSpace keeps no folder for it', 'Over the profile disk budget — said in For you; Delete… in its menu frees it'].every((s2) => typeof dict[s2] === 'string' && dict[s2] !== s2), `${n}: every new word is translated`);
}

// ── §8 source pins ──
console.log('§8 the du child census, PURE imports, the view patches in place');
const SYNC_WALK = /\b(?:readdirSync|statSync|lstatSync|execFileSync|spawnSync|execSync|opendirSync)\b/;
const childCensus = (src) => { const calls = [...src.matchAll(/\b(?:execFileImpl|execFile|spawn|exec)\(\s*'du'[^;]*/g)].map((m) => m[0]); return { calls, bad: calls.filter((c) => !/\btimeout:/.test(c) || !/\bkillSignal:\s*'SIGKILL'/.test(c)) }; };
{
  const run = read('src/server/browser-disk-run.js'), pure = read('src/browser-disk.js');
  const c = childCensus(run);
  ok(c.calls.length === 1 && c.bad.length === 0, `every du child carries a timeout + a SIGKILL on timeout (${c.calls.length} call site)`);
  ok(!/\bspawn\(|\bexec\(/.test(run) && (run.match(/execFileImpl\(/g) || []).length === 1, 'ONE spawn site in the sampler (both children go through du())');
  ok(!SYNC_WALK.test(run), 'the sampler never walks a directory synchronously (no *Sync fs / child call)');
  const reqs = [...pure.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]).sort();
  ok(JSON.stringify(reqs) === JSON.stringify(['./keeper-limits', './runaway-guard']) && !/\bimport\b.*from/.test(pure), `the PURE half imports only keeper-limits + runaway-guard (${reqs.join(', ')})`);
  const view = read('src/lib/browser-trace-view.js');
  ok(/const \{ use, ageMs, disk, \.\.\.rest \} = r \|\| \{\};/.test(view) && /rowsById\.set\(r\.id, \{ row, sig \}\); \}\n\s+patchDisk\(row, r\);/.test(view), 'the row signature leaves `disk` out and a kept row is PATCHED (patchDisk), never rebuilt for a new sample');
  ok(/r\.disk = keeper && typeof keeper\.diskOf === 'function' \? keeper\.diskOf\(r\.id\) : null;/.test(read('src/server/browser-trace.js')), 'the housekeeping rows read the keeper\'s ONE fact');
  ok(!/\bfsp?\.(?:rm|rmdir|unlink)\b|\bunlink(?:Sync)?\(|\.stop\(|\bkill\(/.test(run), 'report only: the sampler stops no browser and deletes no file');
}

// ── §9 patched-copy controls ──
console.log('§9 patched copies — each red');
{
  const M = mutantCopies('bdisk', REPO);
  // (a) a sync walk
  const run = read('src/server/browser-disk-run.js');
  const syncSrc = run.replace("return D.duVerdict(await du([dir]), dir);", "const walk = (d) => { let n = 0; for (const e of require('fs').readdirSync(d, { withFileTypes: true })) n += e.isDirectory() ? walk(path.join(d, e.name)) : require('fs').statSync(path.join(d, e.name)).blocks * 512; return n; }; return { state: 'ok', bytes: walk(dir), partial: false };");
  ok(syncSrc !== run, 'the sync-walk copy is patched');
  const S = M.load('src/server/browser-disk-run.js', syncSrc, 'sync');
  const sm = await S.createDiskSampler({ profiles: () => [] }).sampleDir({ dir: SCR });
  ok(sm.state === 'ok' && SYNC_WALK.test(syncSrc), 'RED: a copy that samples with a sync walk still measures — and the no-sync pin catches it');
  // (b) a notice that names no remedy
  const pure = read('src/browser-disk.js');
  const noRem = pure.replace('remedy: `Delete… in the Agent browser panel frees it; New profile… copied from "${name}" keeps its logins`', "remedy: 'See the panel.'");
  ok(noRem !== pure, 'the no-remedy copy is patched');
  const NR = M.load('src/browser-disk.js', noRem, 'noremedy');
  const remedyNamed = (Dm) => { const n = Dm.diskNotice({ label: 'work', verdict: RG.diskVerdict(3 * G), top: [{ name: 'Default/Cache', bytes: 2 * G }] }); return /Delete… in the Agent browser panel frees it/.test(n.text) && /New profile… copied from "work" keeps its logins/.test(n.text); };
  ok(remedyNamed(D) && !remedyNamed(NR), 'RED: a copy whose notice names no remedy fails the remedy check (the real one passes)');
  // (c) two profiles in one minute
  const twoSrc = pure.replace('  if (s.slotAt !== null && now - s.slotAt < DISK_SLOT_MS) return { state: s, sample: null };\n', '');
  ok(twoSrc !== pure, 'the two-in-a-minute copy is patched');
  const TW = M.load('src/browser-disk.js', twoSrc, 'twominute');
  const tw = walk(TW.diskSampleStep);
  ok(tw.bad.some((b) => /two samples in one minute/.test(b)), `RED: a copy that samples two profiles in one minute fails the walk (${tw.bad.filter((b) => /one minute/.test(b)).length} violations)`);
  const cc = childCensus(run.replace("{ timeout: timeoutMs, killSignal: 'SIGKILL', ", '{ '));
  ok(cc.bad.length === 1, 'RED: a du child without its timeout / kill fails the census');
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
