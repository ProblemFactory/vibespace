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
import { scratchDir, anchored } from './scratch.mjs';
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
const ok = (c, m) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
  ok(gateOf(r.sample) && r.sample.id === 'a' && r.sample.why === 'due', 'a new profile is due at once (the first in order)');
  const s0 = r.state;
  r = D.diskSampleStep(s0, { type: 'tick', ids: ['a', 'b'] }, 30e3); ok(!r.sample, 'b waits: a child runs');
  r = D.diskSampleStep(r.state, { type: 'done', id: 'a' }, 40e3); ok(!r.sample, 'b waits: the minute is a\'s');
  r = D.diskSampleStep(r.state, { type: 'tick', ids: ['a', 'b'] }, 60e3); ok(gateOf(r.sample) && r.sample.id === 'b', 'b one minute later (staggered)');
  r = D.diskSampleStep(r.state, { type: 'done', id: 'b' }, 70e3);
  let k = D.diskSampleStep(r.state, { type: 'start', id: 'a' }, 125e3); ok(gateOf(k.sample) && k.sample.id === 'a' && k.sample.why === 'start', 'a start samples at once when the minute is free');
  k = D.diskSampleStep(k.state, { type: 'done', id: 'a' }, 126e3);
  k = D.diskSampleStep(k.state, { type: 'stop', id: 'a' }, 150e3); ok(!k.sample && k.state.profiles.a.kickAt === null, 'a stop 25 s after the start is debounced away (one per 60 s)');
  k = D.diskSampleStep(k.state, { type: 'tick', ids: ['a', 'b'] }, 190e3); ok(!k.sample, 'and nothing is due inside 15 min');
  const t1 = D.diskSampleStep(null, { type: 'tick', ids: ['x'] }, 0); // x's child times out (done after 60 s, measured nothing)
  let t2 = D.diskSampleStep(t1.state, { type: 'done', id: 'x' }, 61e3); t2 = D.diskSampleStep(t2.state, { type: 'tick', ids: ['x'] }, 14 * MIN);
  ok(!t2.sample, 'a timed-out sample is not retried early (unknown, then the schedule)');
  t2 = D.diskSampleStep(t2.state, { type: 'tick', ids: ['x'] }, 15 * MIN); ok(gateOf(t2.sample) && t2.sample.id === 'x', '…and runs again 15 min after the timed-out one began');
  const w1 = D.diskSampleStep(null, { type: 'tick', ids: ['y'] }, 0); // a `done` that never comes is forgotten
  ok(!D.diskSampleStep(w1.state, { type: 'start', id: 'y' }, 2 * MIN).sample && verdictOf(D.diskSampleStep(w1.state, { type: 'start', id: 'y' }, 3 * MIN + 1).sample), 'a child whose done never came is forgotten after 2 × the timeout + a minute (never a wedged clock)');
  const gone = D.diskSampleStep(s0, { type: 'tick', ids: ['b'] }, 61e3); ok(!gone.state.profiles.a && verdictOf(gone.state.profiles.b), 'a removed profile leaves the schedule');
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
  ok(perm.state === 'unknown' && verdictOf(/exited 1: du: cannot read/.test(perm.why)), 'exit ≠ 0 ⇒ unknown (said with du\'s line)');
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
  ok(gateOf(RG.diskVerdict(2 * G + 1).over) && !RG.diskVerdict(2 * G).over, 'over at 2 GiB + 1, not at 2 GiB');
  ok(gateOf(RG.diskVerdict(0.9 * 2 * G - 1).clear) && !RG.diskVerdict(0.9 * 2 * G).clear, 'clear below the re-arm fraction, not at it');
  const lim = { ...LIMITS, BROWSER_DISK_BYTES: 4 * MiB };
  ok(gateOf(RG.diskVerdict(4 * MiB + 1, { limits: lim }).over) && RG.diskVerdict(4 * MiB + 1, { limits: lim }).limit === 4 * MiB, 'the limit comes from `limits` injection (never the constant)');
  ok(D.diskFact({ dir: '/d', measured: { state: 'ok', bytes: 2.4 * G, at: 5 } }).state === 'over' && D.diskFact({ dir: '/d', measured: { state: 'ok', bytes: 1.3 * G, at: 5 } }).state === 'ok', 'diskFact: ok / over');
  ok(D.diskFact({ dir: '/d' }).state === 'pending' && D.diskFact({ dir: '/d', measured: { state: 'unknown', why: 'du did not finish within 60 s', at: 9 }, last: { bytes: 7, at: 1 } }).bytes === 7, 'diskFact: pending before the first answer; unknown keeps the last measured bytes');
  const rem = D.diskFact({ dir: '/d', hostId: 'mac-1' });
  ok(rem.state === 'not-measured' && rem.code === 'disk_not_measured' && rem.reason === 'remote' && verdictOf(/paired machine/.test(rem.why)), 'diskFact: a paired machine\'s row answers disk_not_measured with why');
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
  ok(gateOf(p) && gateOf(p.dir) && verdictOf(fs.existsSync(p.dir)), `a named profile with its folder (${path.relative(SCR, p.dir)})`);
  ok(k.diskOf(p.id).state === 'pending' && k.list().profiles.find((x) => x.id === p.id).disk.state === 'pending', 'before the first sample: pending, on the GET rows too');
  const cache = path.join(p.dir, 'Default', 'Cache', 'data_1');
  fill(cache, 6 * MiB); fill(path.join(p.dir, 'Default', 'Local Storage', 'leveldb.log'), 1 * MiB); fill(path.join(p.dir, 'ShaderCache', 'blob'), 0.5 * MiB);
  const sample = async () => { k._disk.pass(); await k._disk.settled(); };
  await sample();
  const d1 = k.diskOf(p.id);
  ok(d1.state === 'over' && d1.bytes >= 7.5 * MiB && d1.bytes < 8 * MiB && d1.at === clock && d1.limit === 4 * MiB, `measured with real blocks: ${(d1.bytes / MiB).toFixed(2)} MiB, over the injected 4 MiB`);
  const row = k.list().profiles.find((x) => x.id === p.id).disk;
  ok(gateOf(row) && row.bytes === d1.bytes && row.at === d1.at && row.state === 'over', 'GET /api/browser/profiles rows carry disk {bytes, at, state} — the same fact');
  ok(todos.calls.add === 1 && todos.items[0].origin === 'browser' && todos.items[0].kind === 'notice' && todos.items[0].sessionKey === 'browser', 'ONE For-you notice, origin browser, kind notice');
  const n1 = todos.items[0];
  ok(verdictOf(n1.text.startsWith('The agent browser profile "work" is ')), `it names the profile: ${n1.text}`);
  ok(verdictOf(/ is 7\.5 MB on disk \(limit 4 MB\)/.test(n1.text)), 'it names the size and the limit');
  ok(verdictOf(/what grew: Default\/Cache /.test(n1.text)), 'it names the top subdirectory first (Default/Cache)');
  ok(verdictOf(/Delete… in the Agent browser panel frees it; New profile… copied from "work" keeps its logins/.test(n1.text)), 'it names the remedy in plain words');
  ok(gateOf(/du -sk/.test(n1.detail)) && verdictOf(/Nothing is stopped or deleted/.test(n1.detail)), 'the detail says how it was measured and that nothing is stopped');
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
  ok(verdictOf(read('src/server/browser-keeper.js').includes("onLease((ev) => { if (ev && ev.profileId && ev.local && (ev.kind === 'browser-ready' || ev.kind === 'browser-stopped')) disk.event(")), 'the keeper samples at its browser\'s start / stop (the lease seam: browser-ready / browser-stopped)');
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
  ok(spawns === 1 && s.diskOf(rows[1]).state === 'unknown' && verdictOf(/did not finish within 60 s/.test(s.diskOf(rows[1]).why)), 'a timed-out child ⇒ unknown (never a verdict)');
  clock += 15 * MIN; s.pass(); await s.settled();
  ok(spawns === 2 && warns.length === 1, 'the unknown is logged once per hour (2 timeouts, 1 line)');
  clock += 60 * MIN; s.pass(); await s.settled();
  ok(warns.length === 2, '…and again after the hour');
  // a REAL child that does not answer is killed by the call's own timeout + SIGKILL
  // "killed" is the child's OWN end (lane wall-clock-ratchet-down: `< 3000 ms` judged the machine): execFile's timeout
  // killed it with SIGKILL — a `sleep 5` left to run out ends with code 0 and no signal; the ms are information
  let ended = null;
  const real = RUN.createDiskSampler({ profiles: () => [], timeoutMs: 150, execFileImpl: (cmd, args, opts, cb) => execFile('sleep', ['5'], opts, (e, so, se) => { ended = { killed: !!(e && e.killed), signal: (e && e.signal) || null }; cb(e, so, se); }) });
  const t0 = Date.now(); const rr = await real.sampleDir({ dir: SCR });
  ok(rr.state === 'unknown' && gateOf(ended) && ended.killed === true && ended.signal === 'SIGKILL', `a real child past its timeout is killed by the call's own timeout (${JSON.stringify(ended)}, ${Date.now() - t0} ms) ⇒ unknown`);
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
  ok(over.tone === 'warn' && verdictOf(/said in For you/.test(over.title)), 'over: the warn tone + the For-you sentence in its title');
  ok(PM.diskFold(r({ state: 'pending', bytes: null }), words(null)).v === 'not measured yet' && PM.diskFold(r(null), words(zh)).v === '尚未测量', 'pending / absent ⇒ not measured yet');
  const unk = PM.diskFold(r({ state: 'unknown', why: 'du did not finish within 60 s', bytes: null }), words(ja));
  ok(unk.v === 'まだ計測していません' && verdictOf(/60 s/.test(unk.title)), 'unknown ⇒ not measured yet (its why in the title)');
  ok(PM.diskFold(r({ state: 'not-measured', reason: 'remote', code: 'disk_not_measured' }), words(null)).v === 'not measured — its folder is on a paired machine' && verdictOf(/ペアリング/.test(PM.diskFold(r({ state: 'not-measured', reason: 'remote' }), words(ja)).v)), 'a remote row prints its why (en / ja)');
  ok(PM.usageLine(okRow, words(null)).l1 === '1.3 GB' && PM.usageLine(r(null), words(null)).l1 === '0.2 GB', 'the size cell reads the measured sample, the panel\'s own reading until then');
  const keys = PM.rowFold(okRow, words(null)).map((f) => f.key);
  ok(keys.indexOf('disk') >= 0 && keys.indexOf('disk') + 1 === keys.indexOf('records'), `the fold's On disk sits next to the records (${keys.join(' ')})`);
  for (const [n, dict] of [['zh', zh], ['ja', ja]]) ok(verdictOf(['On disk', 'not measured yet', 'not measured — its folder is on a paired machine', 'not measured — VibeSpace keeps no folder for it', 'Over the profile disk budget — said in For you; Delete… in its menu frees it'].every((s2) => typeof dict[s2] === 'string' && dict[s2] !== s2)), `${n}: every new word is translated`);
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
  ok(gateOf(/const \{ use, ageMs, disk, \.\.\.rest \} = r \|\| \{\};/.test(view)) && verdictOf(/rowsById\.set\(r\.id, \{ row, sig \}\); \}\n\s+patchDisk\(row, r\);/.test(view)), 'the row signature leaves `disk` out and a kept row is PATCHED (patchDisk), never rebuilt for a new sample');
  ok(verdictOf(/r\.disk = keeper && typeof keeper\.diskOf === 'function' \? keeper\.diskOf\(r\.id\) : null;/.test(read('src/server/browser-trace.js'))), 'the housekeeping rows read the keeper\'s ONE fact');
  ok(!/\bfsp?\.(?:rm|rmdir|unlink)\b|\bunlink(?:Sync)?\(|\.stop\(|\bkill\(/.test(run), 'report only: the sampler stops no browser and deletes no file');
}

// ── §9 patched-copy controls ──
console.log('§9 patched copies — each red');
{
  const M = mutantCopies('bdisk', REPO);
  // (a) a sync walk
  const run = read('src/server/browser-disk-run.js');
  const syncSrc = editAnchor(run, "return D.duVerdict(await du([dir]), dir);", "const walk = (d) => { let n = 0; for (const e of require('fs').readdirSync(d, { withFileTypes: true })) n += e.isDirectory() ? walk(path.join(d, e.name)) : require('fs').statSync(path.join(d, e.name)).blocks * 512; return n; }; return { state: 'ok', bytes: walk(dir), partial: false };", "src/server/browser-disk-run.js");
  ok(syncSrc !== run, 'the sync-walk copy is patched');
  const S = M.load('src/server/browser-disk-run.js', syncSrc, 'sync');
  const sm = await S.createDiskSampler({ profiles: () => [] }).sampleDir({ dir: SCR });
  ok(sm.state === 'ok' && verdictOf(SYNC_WALK.test(syncSrc)), 'RED: a copy that samples with a sync walk still measures — and the no-sync pin catches it');
  // (b) a notice that names no remedy
  const pure = read('src/browser-disk.js');
  const noRem = editAnchor(pure, 'remedy: `Delete… in the Agent browser panel frees it; New profile… copied from "${name}" keeps its logins`', "remedy: 'See the panel.'", "src/browser-disk.js");
  ok(noRem !== pure, 'the no-remedy copy is patched');
  const NR = M.load('src/browser-disk.js', noRem, 'noremedy');
  const remedyNamed = (Dm) => { const n = Dm.diskNotice({ label: 'work', verdict: RG.diskVerdict(3 * G), top: [{ name: 'Default/Cache', bytes: 2 * G }] }); return /Delete… in the Agent browser panel frees it/.test(n.text) && /New profile… copied from "work" keeps its logins/.test(n.text); };
  ok(gateOf(remedyNamed(D)) && !remedyNamed(NR), 'RED: a copy whose notice names no remedy fails the remedy check (the real one passes)');
  // (c) two profiles in one minute
  const twoSrc = editAnchor(pure, '  if (s.slotAt !== null && now - s.slotAt < DISK_SLOT_MS) return { state: s, sample: null };\n', '', "src/browser-disk.js");
  ok(twoSrc !== pure, 'the two-in-a-minute copy is patched');
  const TW = M.load('src/browser-disk.js', twoSrc, 'twominute');
  const tw = walk(TW.diskSampleStep);
  ok(verdictOf(tw.bad.some((b) => /two samples in one minute/.test(b))), `RED: a copy that samples two profiles in one minute fails the walk (${tw.bad.filter((b) => /one minute/.test(b)).length} violations)`);
  const cc = childCensus(run.replace("{ timeout: timeoutMs, killSignal: 'SIGKILL', ", '{ '));
  ok(cc.bad.length === 1, 'RED: a du child without its timeout / kill fails the census');
}


// ── B-574d «browser-stores» 6/8 (lane nl-migrations, 主开发 r5101): THE LINEAGE LEDGER ON ONE FILE LANE OF THE STORE WRITER — appends and
// the trim (a rewrite of its own bytes: the newer half, whole lines) in order: past its bound many times over, every line it keeps is
// whole and the kept lines are the NEWEST, with no gap (a trim never drops a line newer than the ones it kept); an earlier start's
// file is indexed off the loop and trimmed on its line boundaries. RED (anchored copy): a trim that drops the lines owed at its turn
console.log('B-574d browser-stores 6/8: the lineage ledger on the store writer\'s lane');
{
  const ledScene = async (Kmod, tag, { pre = null } = {}) => {
    const S6 = path.join(SCR, `bs6-${tag}`), HOME6 = path.join(S6, 'home'), D6 = path.join(S6, 'data'); fs.mkdirSync(HOME6, { recursive: true }); fs.mkdirSync(D6, { recursive: true });
    const LF = path.join(D6, 'browser-lineage-journal.ndjson'); if (pre) pre(LF);
    const k6 = Kmod.create({ dataDir: D6, homeDir: HOME6, env: () => ({ PATH: '/usr/bin:/bin', HOME: HOME6 }), broadcast: () => { }, serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: quiet, userTodos: fakeTodos(), now: () => Date.now(), taskInfo: () => null, hostKnown: () => false });
    const pad = 'x'.repeat(900);
    for (let i = 0; i < 1500; i++) { k6._lineageLedger('bs6', { n: i, pad }); if (i % 150 === 149) await k6._ledgerDurable(); }   // bursts landed by the writer's thread: its trims run there
    await k6._ledgerDurable(); await new Promise((r) => setTimeout(r, 30)); await k6._ledgerDurable();
    const txt = fs.readFileSync(LF, 'utf8'), rows = txt.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
    const ns = rows.filter((x) => x && x.kind === 'bs6').map((x) => x.n), olds = rows.filter((x) => x && x.kind === 'old').map((x) => x.n);
    try { k6.shutdown(); } catch { }
    return { size: Buffer.byteLength(txt), torn: rows.filter((x) => x === null).length, first: ns[0], last: ns[ns.length - 1], kept: ns.length, gapless: ns.every((v, i) => i === 0 || v === ns[i - 1] + 1), olds: olds.length, oldsGapless: olds.every((v, i) => i === 0 || v === olds[i - 1] + 1), whole: txt.endsWith('\n') };
  };
  const L6 = await ledScene(K, 'real');
  ok(L6.torn === 0 && gateOf(L6.whole) && L6.last === 1499 && L6.first > 0 && gateOf(L6.gapless) && L6.size < (1 << 20) + 200 * 1024,
    `B-574d browser-stores 6/8: 1500 lines of ~1 KB (past the 1 MiB ring many times) — the file stays bounded (${L6.size} bytes), every line whole, the kept ones the NEWEST (${L6.first}…${L6.last}) with no gap: no trim dropped a line newer than the ones it kept`);
  const OLD = (LF) => { const lines = []; for (let i = 0; i < 1300; i++) lines.push(JSON.stringify({ at: 1, boot: 'earlier', kind: 'old', n: i, pad: 'y'.repeat(900) })); fs.writeFileSync(LF, lines.join('\n') + '\n'); };
  const L6o = await ledScene(K, 'earlier', { pre: OLD });
  ok(L6o.torn === 0 && gateOf(L6o.whole) && L6o.last === 1499 && gateOf(L6o.oldsGapless) && gateOf(L6o.gapless) && L6o.olds < 1300 && L6o.size < (1 << 20) + 200 * 1024, `…an earlier start's 1.3 MB file (its line starts read once, off the loop): trimmed on its own line boundaries — no torn line, the old lines kept (${L6o.olds}) gapless before the new ones`);
  const KS6 = read('src/server/browser-keeper.js'), THEN = "then: text, as: 'browser-lineage-ledger.write' };";
  if (KS6.split(THEN).length === 2) {
    const M6 = mutantCopies('bdisk-bs6', REPO);
    const L6x = await ledScene(M6.load('src/server/browser-keeper.js', anchored(KS6, THEN, "then: '', as: 'browser-lineage-ledger.write' };   /* RED: the lines owed at the trim dropped */", 'the trim keeps the owed lines'), 'bs6-then-dropped'), 'red');
    ok(!L6x.gapless || L6x.last !== 1499, 'RED (a copy whose trim drops the lines owed at its turn): a gap in the kept lines (or the newest lost) — 6/8 goes red', L6x);
  } else ok(false, 'RED control: the trim\'s owed lines are spelled once in the keeper');
}

// ── B-574d «browser-stores» 8/8 (lane nl-migrations; the chain's own read): THE LEDGER'S CURES — each by a PLACED fault with a WITNESS
// that the product read it inside the leg (主开发 r5135, law 1: a plant never read is a NAMED SKIP, never a red and never a green), each
// with its anchored RED: (a) a write that failed offers its lines again — and (b) a file not there with more than the ring's bound owed
// is APPENDED, never rewritten (a rewrite of a missing file failed for good, every line owed); (c) two keepers over one data folder
// lose none of each other's lines; (d) a trim never answered whose rename landed offers nothing again, one whose rename did not offers
// its lines again; (e) a trim answered ERENAMEDNOSYNC is landed at once; (f) an append cut short by its thread's death offers only
// the pieces not wholly in the file; (g) a trim answered EREWRITEMAIN (no writer thread) stops the trims, said once in its own words
console.log('B-574d browser-stores 8/8: the lineage ledger\'s cures');
{
  const KS8 = read('src/server/browser-keeper.js');
  const W8 = require('../src/store-writer.js').storeWriter();
  const logOf8 = (said) => ({ log() { }, info() { }, error() { }, warn(m) { said.push(String(m)); } });
  const skip8 = (name, why) => console.log(`  SKIP ${name}: ${why} — its plant was never read (主开发 r5135 law 1): not judged`);
  const mk8 = (Kmod, D, H, said = []) => Kmod.create({ dataDir: D, homeDir: H, env: () => ({ PATH: '/usr/bin:/bin', HOME: H }), broadcast: () => { }, serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: logOf8(said), userTodos: fakeTodos(), now: () => Date.now(), taskInfo: () => null, hostKnown: () => false });
  const rowsOf8 = (LF) => { let t = ''; try { t = fs.readFileSync(LF, 'utf8'); } catch { return { rows: [], whole: false }; } return { rows: t.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }), whole: t.endsWith('\n') }; };
  const dirs8 = (tag) => { const S = path.join(SCR, `bs8-${tag}`), H = path.join(S, 'home'), D = path.join(S, 'data'); fs.mkdirSync(H, { recursive: true }); fs.mkdirSync(D, { recursive: true }); return { H, D, LF: path.join(D, 'browser-lineage-journal.ndjson') }; };
  // (a) + (b): THE PLANT — a folder in the ledger's name before its first line; 1200 lines of ~1 KB owed (past the 1 MiB ring); the
  // name freed; the writer's retry
  const sceneA = async (Kmod, tag) => {
    const { H, D, LF } = dirs8(`a-${tag}`); fs.mkdirSync(LF);
    const said = [], k = mk8(Kmod, D, H, said), pad = 'z'.repeat(900);
    for (let i = 0; i < 1200; i++) k._lineageLedger('bs8a', { n: i, pad });
    const first = await k._ledgerDurable();
    const st = W8.stats().find((x) => x.file === LF);
    const witness = first === false && !!(st && st.failures > 0);   // the plant read: the writer's write of the folder's name failed
    const told = said.some((m) => m.includes('the lineage ledger could not be written'));
    fs.rmSync(LF, { recursive: true, force: true });
    const landed = await k._ledgerDurable();
    const R = rowsOf8(LF), ns = R.rows.filter((x) => x && x.kind === 'bs8a').map((x) => x.n);
    try { k.shutdown(); } catch { }
    return { witness, told, landed, kept: ns.length, all: ns.length === 1200 && ns.every((v, i) => v === i), torn: R.rows.filter((x) => x === null).length, whole: R.whole };
  };
  // the three scenes at once (three files, one writer): their retries' waits overlap
  const MA = mutantCopies('bdisk-bs8a', REPO), KEEP = '  L.owed = pieces.concat(L.owed);\n  if (L.owed.length > LEDGER_OWED_MAX)', TRIM = 'Array.isArray(L.starts) && at > 0 && !L.noRewrite && total > LEDGER_MAX';
  const [A, Ax, Ay] = await Promise.all([sceneA(K, 'real'),
    sceneA(MA.load('src/server/browser-keeper.js', anchored(KS8, KEEP, '  L.owed = L.owed;   /* RED: the failed write\'s lines dropped */\n  if (L.owed.length > LEDGER_OWED_MAX)', 'the failed write offers its lines again'), 'bs8-lines-dropped'), 'red-drop'),
    sceneA(MA.load('src/server/browser-keeper.js', anchored(KS8, TRIM, 'Array.isArray(L.starts) && !L.noRewrite && total > LEDGER_MAX /* RED: a file with no bytes rewritten */', 'a file with no bytes is appended'), 'bs8-missing-rewritten'), 'red-rewrite')]);
  if (!A.witness) skip8('8/8 (a)+(b)', 'the folder in the ledger\'s name: the writer\'s write of it never failed');
  else ok(gateOf(A.told) && A.landed === true && gateOf(A.all) && A.torn === 0 && verdictOf(A.whole), 'B-574d browser-stores 8/8 (a)+(b): 1200 lines owed while the ledger\'s name is a folder (its write refused, said) land once the name is free — every line once, in order, whole: a failed write offers its lines again, and a file not there past the ring\'s bound is appended, never rewritten', A);
  { if (!Ax.witness) skip8('8/8 (a) RED', 'the copy\'s write of the folder never failed');
    else ok(!Ax.all, 'RED (anchored copy: a failed write\'s lines dropped): the lines owed while the name was a folder never land — 8/8 (a) goes red', { kept: Ax.kept });
    if (!Ay.witness) skip8('8/8 (b) RED', 'the copy\'s write of the folder never failed');
    else ok(Ay.landed === false && !Ay.all, 'RED (anchored copy: a file with no bytes rewritten past the bound): the rewrite of a file not there fails again and again — no line lands — 8/8 (b) goes red', { landed: Ay.landed, kept: Ay.kept }); }
  // (c) two keepers over one data folder: THE PLANT — two keepers of distinct boots (each one's own line landed first, the witness),
  // then their lines interleaved in one turn
  const sceneC = async (Kmod, tag) => {
    const { H, D, LF } = dirs8(`c-${tag}`);
    const k1 = mk8(Kmod, D, H); await new Promise((r) => setTimeout(r, 5)); const k2 = mk8(Kmod, D, H);
    k1._lineageLedger('bs8c-own', { by: 1 }); await k1._ledgerDurable(); k2._lineageLedger('bs8c-own', { by: 2 }); await k2._ledgerDurable();
    const own = rowsOf8(LF).rows.filter((x) => x && x.kind === 'bs8c-own'), witness = own.length === 2 && own[0].boot !== own[1].boot;
    for (let i = 0; i < 40; i++) (i % 2 ? k2 : k1)._lineageLedger('bs8c', { n: i });
    await k1._ledgerDurable(); await k2._ledgerDurable();
    const ns = rowsOf8(LF).rows.filter((x) => x && x.kind === 'bs8c').map((x) => x.n).sort((a, b) => a - b);
    try { k1.shutdown(); } catch { } try { k2.shutdown(); } catch { }
    return { witness, kept: ns.length, all: ns.length === 40 && ns.every((v, i) => v === i) };
  };
  const C = await sceneC(K, 'real');
  if (!C.witness) skip8('8/8 (c)', 'the two keepers\' own lines did not land under two boots');
  else ok(verdictOf(C.all), 'B-574d browser-stores 8/8 (c): two keepers over one data folder (two boots) interleave 40 lines in one turn — every line of both lands: the ledger\'s state is the file\'s', C);
  { const ST = 'const f = ledgerFile(), L = ledOf(f);', DT = 'produce: (o) => produceLedgerOf(f, o), onWritten: (ok, e) => ledgerWrittenOf(f, ok, e)';
    const per = anchored(anchored(KS8, ST, 'const f = ledgerFile(), K8 = f + \'#\' + bootId, L = ledOf(K8);   /* RED: the ledger\'s state per keeper */', 'the ledger\'s state is the file\'s'), DT, 'produce: (o) => produceLedgerOf(K8, o), onWritten: (ok, e) => ledgerWrittenOf(K8, ok, e)', 'one producer for the file');
    const Cx = await sceneC(mutantCopies('bdisk-bs8c', REPO).load('src/server/browser-keeper.js', per, 'bs8-per-keeper'), 'red');
    if (!Cx.witness) skip8('8/8 (c) RED', 'the copy\'s two keepers did not land their own lines under two boots');
    else ok(!Cx.all, 'RED (anchored copy: the ledger\'s state per keeper, as at 6/8): the keeper whose producer is not the file\'s last loses its lines — 8/8 (c) goes red', { kept: Cx.kept }); }
  // (d) + (e): the ledger's own state, driven through its handle on a file past the ring's bound (its line starts known)
  const big8 = (n, kind) => { const out = []; for (let i = 0; i < n; i++) out.push(JSON.stringify({ kind, n: i, pad: 'q'.repeat(900) }) + '\n'); return out; };
  const sceneD = (Kmod, tag, { landedRename, answer = null }) => {
    const G = Kmod._ledger; const S = path.join(SCR, `bs8-d-${tag}`); fs.mkdirSync(S, { recursive: true });
    const LF = path.join(S, 'ledger.ndjson'), old = big8(1200, 'old'); fs.writeFileSync(LF, old.join(''));
    const L = G.ledOf(LF); let off = 0; L.starts = old.map((p) => { const s0 = off; off += Buffer.byteLength(p); return s0; }); L.onDisk = off; L.tailChecked = true; L.recheck = false;
    L.owed = big8(3, 'new');
    const p1 = G.produceLedgerOf(LF, {}), w = L.writing;
    const witness = !!w;   // a write was taken: the plant (its answer withheld, or the unsynced answer) applies to it
    const isRewrite = !!(p1 && p1.rewrite && w && w.rewrite);   // judged: the trim's road taken past the bound
    if (isRewrite && landedRename) { const buf = fs.readFileSync(LF); fs.writeFileSync(LF, Buffer.concat([buf.subarray(w.keep, w.at), Buffer.from(w.text)])); }   // the file the landed rename leaves
    if (answer) G.ledgerWrittenOf(LF, false, Object.assign(new Error('the rename landed, its directory sync did not'), { code: answer }));
    const settledAtOnce = L.owed.length === 0 && !L.unsure && L.onDisk === fs.statSync(LF).size;
    const unanswered = !!L.writing;
    L.owed.push(JSON.stringify({ kind: 'next', n: 0 }) + '\n');
    const p2 = G.produceLedgerOf(LF, {}); const text2 = p2 ? String(p2.append || p2.then || '') : '';
    G.ledgerWrittenOf(LF, true, null);
    return { witness, isRewrite, unanswered, settledAtOnce, newAgain: (text2.match(/"kind":"new"/g) || []).length, next: text2.includes('"kind":"next"') };
  };
  const D1 = sceneD(K, 'landed', { landedRename: true }), D2 = sceneD(K, 'unlanded', { landedRename: false });
  if (!(D1.witness && D1.unanswered && D2.witness && D2.unanswered)) skip8('8/8 (d)', 'no write was taken, or its answer was not withheld');
  else ok(gateOf(D1.isRewrite) && gateOf(D2.isRewrite) && D1.newAgain === 0 && gateOf(D1.next) && D2.newAgain === 3 && verdictOf(D2.next), 'B-574d browser-stores 8/8 (d): a trim never answered (its thread stopped) — its rename landed (the file holds the trimmed bytes): nothing offered again; it did not (the file as before): its three lines offered again, once', { landed: D1, unlanded: D2 });
  const E = sceneD(K, 'unsynced', { landedRename: true, answer: 'ERENAMEDNOSYNC' });
  if (!E.witness) skip8('8/8 (e)', 'no write was taken for the unsynced answer');
  else ok(gateOf(E.isRewrite) && gateOf(E.settledAtOnce) && E.newAgain === 0 && verdictOf(E.next), 'B-574d browser-stores 8/8 (e): a trim answered ERENAMEDNOSYNC (its rename landed, its directory\'s sync did not) is landed AT ONCE — the size known, nothing owed, its lines never offered again', E);
  { const MD = mutantCopies('bdisk-bs8d', REPO);
    const HOLD = '  if (t.size !== null && landed !== w.at && t.size === landed) return;   // the file holds them';
    const Dx = sceneD(MD.load('src/server/browser-keeper.js', anchored(KS8, HOLD, '  /* RED: a write not known landed always offered again */', 'a landed rename offers nothing again'), 'bs8-always-again'), 'red-again', { landedRename: true });
    if (!(Dx.witness && Dx.unanswered)) skip8('8/8 (d) RED', 'the copy took no write, or its answer was not withheld');
    else ok(gateOf(Dx.isRewrite) && Dx.newAgain === 3, 'RED (anchored copy: an unanswered write always offered again): the landed trim\'s three lines written twice — 8/8 (d) goes red', Dx);
    const NOSYNC = "  if (!ok && w.rewrite && e && e.code === 'ERENAMEDNOSYNC') ok = true;";
    const Ex = sceneD(MD.load('src/server/browser-keeper.js', anchored(KS8, NOSYNC, '  /* RED: ERENAMEDNOSYNC a failed write */', 'a rewrite whose rename landed is landed'), 'bs8-nosync-failed'), 'red-nosync', { landedRename: true, answer: 'ERENAMEDNOSYNC' });
    if (!Ex.witness) skip8('8/8 (e) RED', 'the copy took no write for the unsynced answer');
    else ok(gateOf(Ex.isRewrite) && !Ex.settledAtOnce, 'RED (anchored copy: ERENAMEDNOSYNC read as a failed write): the landed trim left owed, its size unknown until the file is read again — 8/8 (e) goes red', Ex); }
  // (f) an append CUT SHORT (its thread died inside it: nothing truncated it back): THE PLANT — the file holds the write's first two
  // pieces whole and five bytes of the third, then the ETHREAD answer; only the pieces not wholly in the file are offered again, after
  // a '\n' that terminates the torn tail
  const sceneF = (Kmod, tag) => {
    const G = Kmod._ledger, S = path.join(SCR, `bs8-f-${tag}`); fs.mkdirSync(S, { recursive: true });
    const LF = path.join(S, 'ledger.ndjson'), base = JSON.stringify({ kind: 'base' }) + '\n'; fs.writeFileSync(LF, base);
    const L = G.ledOf(LF); L.starts = [0]; L.onDisk = Buffer.byteLength(base); L.tailChecked = true; L.recheck = false;
    L.owed = [0, 1, 2, 3].map((n) => JSON.stringify({ kind: 'cut', n }) + '\n');
    const p1 = G.produceLedgerOf(LF, {}), w = L.writing;
    const witness = !!(p1 && p1.append && w && !w.rewrite);   // an append was taken: the cut applies to it
    if (witness) fs.appendFileSync(LF, Buffer.from(w.text).subarray(0, Buffer.byteLength(w.pieces[0]) + Buffer.byteLength(w.pieces[1]) + 5));
    G.ledgerWrittenOf(LF, false, Object.assign(new Error('the thread stopped during the append'), { code: 'ETHREAD' }));
    L.owed.push(JSON.stringify({ kind: 'next' }) + '\n');
    const p2 = G.produceLedgerOf(LF, {}), t2 = p2 ? String(p2.append || '') : '';
    G.ledgerWrittenOf(LF, true, null);
    return { witness, terminated: t2.startsWith('\n'), ns: (t2.match(/"kind":"cut","n":\d/g) || []).map((x) => Number(x.slice(-1))), next: t2.includes('"kind":"next"') };
  };
  const F8 = sceneF(K, 'real');
  if (!F8.witness) skip8('8/8 (f)', 'no append was taken for the cut');
  else ok(gateOf(F8.terminated) && F8.ns.join() === '2,3' && verdictOf(F8.next), 'B-574d browser-stores 8/8 (f): an append cut short by its thread\'s death inside its third piece — only the pieces not wholly in the file are offered again (the third, the fourth), after a \'\\n\' that ends the torn tail: none written twice', F8);
  { const CUTA = '  if (!w.rewrite && w.at !== null && t.size !== null && t.size > w.at && t.size < landed) {';
    const Fx = sceneF(mutantCopies('bdisk-bs8f', REPO).load('src/server/browser-keeper.js', anchored(KS8, CUTA, '  if (false) {   /* RED: a cut-short append offered again whole */', 'a cut-short append offers only its unwritten pieces'), 'bs8-cut-whole'), 'red');
    if (!Fx.witness) skip8('8/8 (f) RED', 'the copy took no append for the cut');
    else ok(Fx.ns.join() === '0,1,2,3', 'RED (anchored copy: a cut-short append offered again whole): its first two pieces are written twice — 8/8 (f) goes red', Fx); }
  // (g) a trim answered EREWRITEMAIN (the writer has no thread; a rewrite is never made on the main thread): THE PLANT — that answer
  // to a trim; the lines are appended, no trim is tried again this process (also once the file's lines are indexed again), said ONCE
  // in its own words — never the failure's line, which stays for a real failure
  const sceneG = async (Kmod, tag) => {
    const G = Kmod._ledger, S = path.join(SCR, `bs8-g-${tag}`); fs.mkdirSync(S, { recursive: true });
    const LF = path.join(S, 'ledger.ndjson'), old = big8(1200, 'old'); fs.writeFileSync(LF, old.join(''));
    const said = [], L = G.ledOf(LF); let off = 0; L.starts = old.map((p) => { const s0 = off; off += Buffer.byteLength(p); return s0; }); L.onDisk = off; L.tailChecked = true; L.recheck = false; L.log = logOf8(said);
    L.owed = big8(3, 'new');
    const p1 = G.produceLedgerOf(LF, {}), w = L.writing;
    const witness = !!w, isRewrite = !!(p1 && p1.rewrite);
    G.ledgerWrittenOf(LF, false, Object.assign(new Error('a rewrite is never written on the main thread'), { code: 'EREWRITEMAIN' }));
    L.owed.push(JSON.stringify({ kind: 'more', n: 0 }) + '\n');
    const p2 = G.produceLedgerOf(LF, {}); const t2 = p2 ? String(p2.append || p2.then || '') : '';
    G.ledgerWrittenOf(LF, true, null);
    for (let i = 0; i < 150 && !Array.isArray(L.starts); i++) await new Promise((r) => setTimeout(r, 20));   // the file's lines indexed again, off the loop (bounded: 3 s)
    L.owed.push(JSON.stringify({ kind: 'more', n: 1 }) + '\n');
    const p3 = G.produceLedgerOf(LF, {});
    G.ledgerWrittenOf(LF, true, null);
    return { witness, isRewrite, p2append: !!(p2 && p2.append && !p2.rewrite), newOnce: (t2.match(/"kind":"new"/g) || []).length, p3append: !!(p3 && p3.append && !p3.rewrite), indexed: Array.isArray(L.starts),
      saidOwn: said.filter((m) => m.includes('cannot be trimmed while the store writer has no thread')).length, saidFailure: said.filter((m) => m.includes('could not be written')).length };
  };
  const G8 = await sceneG(K, 'real');
  if (!G8.witness) skip8('8/8 (g)', 'no write was taken for the EREWRITEMAIN answer');
  else ok(gateOf(G8.isRewrite) && gateOf(G8.p2append) && G8.newOnce === 3 && gateOf(G8.indexed) && gateOf(G8.p3append) && G8.saidOwn === 1 && G8.saidFailure === 0, 'B-574d browser-stores 8/8 (g): a trim answered EREWRITEMAIN (no writer thread) — its lines appended once, no trim tried again (also once the file is indexed again), said ONCE in its own words (the failure\'s line kept for a real failure)', G8);
  { const MAIN = "  if (!ok && w.rewrite && e && e.code === 'EREWRITEMAIN') {";
    const Gx = await sceneG(mutantCopies('bdisk-bs8g', REPO).load('src/server/browser-keeper.js', anchored(KS8, MAIN, "  if (false) {   /* RED: EREWRITEMAIN a failed write like any other */", 'a main-only trim stops the trims'), 'bs8-main-again'), 'red');
    if (!Gx.witness) skip8('8/8 (g) RED', 'the copy took no write for the EREWRITEMAIN answer');
    else ok(gateOf(Gx.indexed) && !Gx.p3append, 'RED (anchored copy: EREWRITEMAIN a failed write like any other): once the file is indexed again the next line is a trim again (and fails again) — 8/8 (g) goes red', Gx); }
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
