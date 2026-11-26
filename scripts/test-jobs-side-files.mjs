#!/usr/bin/env node
// test-jobs-side-files — THREE FILES OF THE JOBS ENGINE THAT ARE NOT ITS STORE, UNDER THE STORE-READ LAW (B-f276, slice
// «jobs-side-files», lane bl-proposals s1126). THE LAW (src/store-read.js): a read tells MISSING (ENOENT, the only «empty») from
// UNREADABLE and TORN; a store whose failed or torn read is taken as «empty» is written over, and what it held is gone. The three
// reads of src/jobs.js did that:
//   job-notifications-read/<conversation>.md (spillNotifs) — a failed read was «no history»: the drain wrote its newest block OVER
//     the conversation's whole history of drained notifications. NOW: the block is ADDED at its end, said once, trimmed again once
//     it reads.
//   jobs.lock (_takeLock) — a failed read fell through to the write: a lock a live engine may hold was TAKEN (two engines on one
//     jobs.json). NOW: HELD (src/store-read-hold.js) — the engine loads, adopts and writes nothing, its doors say the hold by name, and
//     it starts at the lift with the lift's answer (read-only beside a live engine, else the owner); torn bytes kept beside it first.
//   job-logs/<run>/exit.json (_ctlJson) — a failed or torn read was «no exit record», and the two roads that SAVE a gone wrapper's
//     end judged the run on it (the sweep: ended with no code; the boot: died with its environment). NOW: HELD — the run judges
//     nothing, said on its row, its file read again off the loop; at the lift the run is judged once with what was read, on the road
//     that met the hold (one met at the boot: the boot's own judge).
// EVERY UNREADABLE FILE HERE IS A PLACED REFUSAL of the read call for that one path (fs.readFileSync / fs.promises.readFile answer
// EIO), never permissions or a broken disk; a torn file is its bytes. Made-up values; a scratch data folder; nothing real is read.
//   ① THE HISTORY: refused — the earlier bytes byte for byte at the file's head, the new block after them, said ONCE; a second drain
//      adds again; the next good read trims it back to its bound; an absent file starts with the block. RED: the tip's read (a copy)
//   ② THE LOCK: refused while a LIVE engine's lock is there — held: not taken, nothing loaded or written, the doors' words name it;
//      its lift → read-only beside that engine (the lock's bytes unchanged). A dead owner's lock refused → its lift takes it and the
//      engine starts as the owner (its records loaded). Torn bytes → kept beside it, then taken. RED: the tip's take (a copy)
//   ③ THE EXIT RECORD: the sweep's road refused — the run not ended, said, no read again ON the loop while held; the lift judges it
//      with its code. The boot's road refused — not judged at the boot; the lift judges it by the boot's judge (its code). Torn bytes
//      kept beside it, then judged with no record. RED: the tip's «no exit record» (a copy)
//      r4994: a WANTED SERVICE whose record was held at the boot gets the boot's own replay at the lift, ONCE (RED: the tip's late judge
//      with no replay); a stamp with no boot id lifts to «unverified», as the boot says it
//      r5017: a person's Start while the record is held is refused (the job reads as running) and the lift starts it ONCE; a person's
//      Stop meanwhile — the lift starts nothing (their Stop stands)
//   ⑥ r5017: A JOB's APPROVAL CARD while the lock is held — Allow and the ✕ answer the hold BY NAME, the card stays OPEN, nothing is
//      settled or audited (RED: the door with no lock guard, the tip, in a copy: «over», the card closed, an audit line «over»)
//   ⑦ r5017: THE CENSUS — every caller of the engine's lookup of a job or of a job's sign-in, and every not-ready gate, outside
//      src/jobs.js, by a FIXED-STRING search; each file's count its row's, each row saying what it answers under a held lock; a NEW
//      caller is red by name (controls: a new file, one more line in a mapped file)
//   ④ PINS: every jobs door (src/server/jobs-wiring.js: the list, the held digest, the wake rows, a create, a job's detail, seen, its
//      acts; src/agent-routes.js; the job-token gates of src/agent-routes.js and src/routes/browser.js) answers the lock's hold by name;
//      a job's token while held is answered by the hold (tokenHeldAnswer), never «unknown job token» (r4994)
// Run: node scripts/test-jobs-side-files.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
import { checker } from './lib/check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const WD = armWatchdog({ capMs: 40e3 });
const BASE = scratch('jobs-side-files');
fs.rmSync(BASE, { recursive: true, force: true }); fs.mkdirSync(BASE, { recursive: true });
const kids = new Set();
process.on('exit', () => { for (const k of kids) { try { k.kill('SIGKILL'); } catch { } } try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { } });

// THE PLACED REFUSAL: a read of a path in `refused` answers EIO (both roads: the loop's sync read and the hold's read off the loop);
// `asked` counts each path's sync reads (a read again ON the loop while held would show here)
const realRead = fs.readFileSync, realPRead = fs.promises.readFile;
const refused = new Set(), asked = new Map();
const eio = (p) => Object.assign(new Error(`EIO: i/o error, read '${p}'`), { code: 'EIO', errno: -5, syscall: 'read' });
fs.readFileSync = function (p, ...a) { const k = String(p); asked.set(k, (asked.get(k) || 0) + 1); if (refused.has(k)) throw eio(k); return realRead.call(fs, p, ...a); };
fs.promises.readFile = function (p, ...a) { const k = String(p); if (refused.has(k)) return Promise.reject(eio(k)); return realPRead.call(fs.promises, p, ...a); };
const bytes = (f) => { try { return realRead.call(fs, f); } catch { return null; } };
const same = (a, b) => !!a && !!b && Buffer.compare(a, b) === 0;
const tick = () => new Promise((r) => setImmediate(r));
// a wait ON ITS FACT with a named expiry (r4340 law 1): true when the fact holds; at the expiry a HARNESS line, false
const until = async (fact, what, ms = 5000) => { const end = Date.now() + ms; while (!fact()) { if (Date.now() > end) { console.log(`  HARNESS: ${what} — not within ${ms} ms`); return false; } await new Promise((r) => setTimeout(r, 5)); } return true; };

const PI = require(path.join(ROOT, 'src/proc-identity.js'));
const JSRC = realRead.call(fs, path.join(ROOT, 'src/jobs.js'), 'utf8');
const { JobManager } = require(path.join(ROOT, 'src/jobs.js'));
const MJ = mutantCopies('jobs-side-files', ROOT);
const cut = (from, to, why) => MJ.load('src/jobs.js', anchored(JSRC, from, to, why), why.replace(/\W+/g, '-').slice(0, 40)).JobManager;
// THE TIP's THREE READS, each placed back in a copy
const TipHistory = cut("      const histA = SR.storeAnswer(read, { parse: (t) => t });", "      const histA = { state: 'data', value: read.text || '' };   /* MUTANT: the tip — a failed read is «no history» */", 'the history read as the tip');
const TipLock = cut("    if (lockA.state === 'unreadable' || lockA.state === 'corrupt') return lockA;", "    /* MUTANT: the tip — a lock that could not be read is taken */", 'the lock taken as the tip');
const TipLate = cut("    try { this._bootReplayOne(job); }   // r4994: and the boot's REPLAY of it, once (a wanted service up again, an update window's task run) — its words true\n    catch (e) { if (e && e.code === 'memory-budget' && job.kind === 'service' && job.state === 'down' && job.desiredUp) this._budgetLadder(job, e); else this.d.log(`[jobs] the late replay of ${job.id} (its exit record read at last) refused:`, e.message); }   // r5017 (lens two): as _retryRefused — never out of the sweep's pass\n", '', 'the late judge with no replay as the tip');   // (its replay and the catch r5017 put round it, cut together)
const TipExit = cut("    const a = this._ctlAnswer(job, run, 'exit.json');", "    const a0 = this._ctlAnswer(job, run, 'exit.json'), a = a0.state === 'unreadable' || a0.state === 'corrupt' ? { state: 'missing' } : a0;   /* MUTANT: the tip — «no exit record» */", 'the exit record as the tip');

let n = 0;
function world(tag) { const dir = path.join(BASE, `${tag}-${++n}`); fs.mkdirSync(dir, { recursive: true }); return dir; }
function engine(JM, dir) { const logs = []; const jm = new JM({ dataDir: dir, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => logs.push(a.join(' ')), apiBase: 'http://127.0.0.1:9', memoryRungs: [] }); return { jm, logs }; }
const quiet = (jm) => { for (const t of jm._timers || []) { clearInterval(t); clearTimeout(t); } jm._timers = []; };
const end = (jm) => { try { quiet(jm); jm.shutdown(); } catch { } };

// ① THE HISTORY ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① the drained notifications\' history: a read that failed adds, never writes over');
{
  const line = (k) => `- 2026-01-01T00:00:${String(k % 60).padStart(2, '0')}.000Z jb-0000${k % 10} made-up: an earlier notice ${k}\n`;
  let prior = '\n## drained 2026-01-01T00:00:00.000Z\n'; for (let k = 0; prior.length < 262144 - 100; k++) prior += line(k);   // within 100 characters under the 256 KB bound: two new blocks pass it
  const items = (t) => [{ ts: Date.now(), jobId: 'jb-1a2b3c4d', jobName: 'made-up job', text: t }];
  const scene = (JM) => {
    const dir = world('hist'), { jm, logs } = engine(JM, dir), f = path.join(dir, 'job-notifications-read', 'conv-a.md');
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, prior);
    refused.add(f);
    const r1 = jm.spillNotifs('conv-a', items('the first new one')), r2 = jm.spillNotifs('conv-a', items('the second new one'));
    const during = bytes(f), said = logs.filter((l) => l.includes('conv-a.md') && l.includes('could not be read (EIO)')).length;
    refused.delete(f);
    jm.spillNotifs('conv-a', items('the third, after the read came back'));
    const after = realRead.call(fs, f, 'utf8');
    return { f, r1, r2, during, said, after, logs };
  };
  const s = scene(JobManager), t = scene(TipHistory);
  const head = s.during && same(s.during.subarray(0, Buffer.byteLength(prior)), Buffer.from(prior));
  const tail = s.during ? s.during.toString('utf8').slice(Buffer.byteLength(prior)) : '';
  ok(!!(prior.length < 262144 && s.r1 === s.f && s.r2 === s.f && head && /the first new one[\s\S]*the second new one/.test(tail) && s.during.length > 262144),
    '① refused: the history\'s earlier bytes stand byte for byte at its head, each new block ADDED after them (nothing written over; the trim waits)', { head, tailLen: tail.length, len: s.during && s.during.length });
  ok(s.said === 1, '① said ONCE an episode (two drains while refused, one journal line naming the file and the code)', s.logs);
  ok(!!(s.after.length === 262144 && /the first new one[\s\S]*the second new one[\s\S]*the third, after the read came back/.test(s.after)),
    '① the next good read: the whole history read back and trimmed to its bound again, every block in order', { len: s.after.length });
  ok(!!(t.during && !t.during.toString('utf8').includes('an earlier notice 0') && t.during.length < 1000),
    'RED — the tip\'s read (a copy): the refused read is «no history» — the newest block written OVER the conversation\'s whole history', { len: t.during && t.during.length });
  const dir = world('hist-absent'), { jm } = engine(JobManager, dir), f = path.join(dir, 'job-notifications-read', 'conv-b.md');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  jm.spillNotifs('conv-b', items('the first ever'));
  ok(/^\n## drained [^\n]+\n- [^\n]+the first ever\n$/.test(realRead.call(fs, f, 'utf8')), '① a file truly ABSENT is a first drain: it starts with the block (as before)');
}

// ② THE LOCK ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('② jobs.lock: a lock that could not be read is never taken');
const liveKid = () => { const s = path.join(BASE, 'live.cjs'); fs.writeFileSync(s, 'setTimeout(() => { }, 60000);\n'); const k = spawn(process.execPath, [s], { stdio: 'ignore' }); kids.add(k); return k; };
const kid = liveKid();
await until(() => PI.starttimeOf(kid.pid) > 0, 'the stand-in engine\'s process is up');
const JOBS = [{ id: 'jb-0d1e2f30', kind: 'task', name: 'made-up kept record', state: 'done', owner: {}, access: { view: 'session', control: 'session' }, runs: [{ startedAt: 1000, endedAt: 2000, exit: 0 }], createdAt: 1000 }];
{
  const scene = async (JM, owner) => {
    const dir = world('lock'), lock = path.join(dir, 'jobs.lock'), store = path.join(dir, 'jobs.json');
    fs.writeFileSync(store, JSON.stringify(JOBS)); fs.writeFileSync(lock, JSON.stringify(owner));
    const lock0 = bytes(lock), store0 = bytes(store);
    refused.add(lock);
    const { jm, logs } = engine(JM, dir);
    jm.init(); quiet(jm);
    const held = { ready: jm.ready, readOnly: jm.readOnly, loaded: jm.jobs.size, words: typeof jm.lockHeldWords === 'function' ? jm.lockHeldWords() : null, tok: jm.tokenHeldAnswer(['jbt', 'madeup0token'].join('_')) };
    try { jm._dirty = true; jm._save({}); } catch { }   // a writer asked while held
    const made = (() => { try { return jm.create({ kind: 'task', name: 'asked while held', cmd: { argv: ['true'] } }, {}); } catch (e) { return { error: e.message }; } })();
    const lockHeld = bytes(lock), storeHeld = bytes(store);
    refused.delete(lock);
    const lifted = jm._lockHold ? await jm._lockHold.again() : null;
    await until(() => jm.ready, 'the engine started at the lock\'s lift');
    quiet(jm);
    const out = { held, made, lockSame: same(lockHeld, lock0), storeSame: same(storeHeld, store0), lifted, after: { ready: jm.ready, readOnly: jm.readOnly, loaded: jm.jobs.size }, lockAfter: realRead.call(fs, lock, 'utf8'), storeAfterSame: same(bytes(store), store0), logs };
    end(jm);
    return out;
  };
  const live = { pid: kid.pid, starttime: PI.starttimeOf(kid.pid), at: 1 };
  const a = await scene(JobManager, live), r = await scene(TipLock, live);
  ok(!!(a.held.ready === false && a.held.readOnly === true && a.held.loaded === 0 && a.lockSame && a.storeSame),
    '② refused, a LIVE engine\'s lock there: HELD — not taken (its bytes unchanged), no record loaded, nothing written over jobs.json, a writer asked meanwhile writes nothing', a.held);
  ok(!!(a.held.words && /jobs\.lock/.test(a.held.words) && /\(EIO\)/.test(a.held.words) && /another VibeSpace may hold it/.test(a.held.words)), '② its words name the lock and the code (what every jobs door answers while held)', a.held.words);
  ok(!!(a.made && a.made.error === a.held.words), '② a start asked while held is refused BY the hold\'s words, never recorded', a.made);
  ok(!!(a.held.tok && a.held.tok.status === 503 && a.held.tok.code === 'jobs_lock_unread' && a.held.tok.error.startsWith(a.held.words)), '② r4994: a job\'s token while held is answered BY the hold (503), never «unknown job token»', a.held.tok);
  ok(!!(a.storeAfterSame), '② …and jobs.json is the same bytes after the lift too (read-only beside the live engine: nothing written, ever)');
  ok(!!(a.lifted === true && a.after.ready && a.after.readOnly === true && a.after.loaded === 1 && JSON.parse(a.lockAfter).pid === kid.pid && a.logs.some((l) => /another engine holds the lock/.test(l))),
    '② its lift: the live engine\'s lock read — READ-ONLY beside it (its records shown), the lock never written', { after: a.after, lock: a.lockAfter });
  ok(!!(r.held.ready === true && r.held.readOnly === false && JSON.parse(r.lockAfter).pid === process.pid),
    'RED — the tip\'s take (a copy): the refused read falls through to the write — the live engine\'s lock TAKEN, a second owner of jobs.json', { held: r.held, lock: r.lockAfter });
  const dead = await scene(JobManager, { pid: 4194000, starttime: 1, at: 1 });
  ok(!!(dead.held.ready === false && dead.lockSame && dead.lifted === true && dead.after.ready && dead.after.readOnly === false && dead.after.loaded === 1 && JSON.parse(dead.lockAfter).pid === process.pid),
    '② refused, a DEAD owner\'s lock: held while unread, then its lift TAKES it — the engine starts as the owner, its records loaded', { held: dead.held, after: dead.after });
}
{
  const dir = world('lock-torn'), lock = path.join(dir, 'jobs.lock'), TORN = '{"pid": 41, "startti';
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(JOBS)); fs.writeFileSync(lock, TORN);
  const { jm } = engine(JobManager, dir);
  jm.init(); quiet(jm);
  const heldAtOnce = !jm.ready;
  await until(() => jm.ready, 'the torn lock kept aside and taken');
  quiet(jm);
  const copies = fs.readdirSync(dir).filter((x) => x.startsWith('jobs.lock.corrupt-'));
  ok(!!(heldAtOnce && jm.ready && !jm.readOnly && copies.length === 1 && realRead.call(fs, path.join(dir, copies[0]), 'utf8') === TORN && JSON.parse(realRead.call(fs, lock, 'utf8')).pid === process.pid),
    '② TORN lock bytes: held, kept beside it byte for byte (jobs.lock.corrupt-…), then taken — the engine the owner', { copies, ready: jm.ready });
  end(jm);
}

// ③ THE EXIT RECORD ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('③ a gone wrapper\'s exit record that could not be read judges nothing');
{
  const T = Date.now() - 60000;
  const setup = (tag, exitText, stamp = { pid: 4194001, starttime: 1, bootId: PI.bootIdOf() }, extra = {}) => {
    const dir = world(tag), job = { id: 'jb-5e6f7a8b', kind: 'task', name: 'made-up task', state: 'up', owner: {}, access: { view: 'session', control: 'session' }, runs: [{ startedAt: T, trigger: 'manual' }], createdAt: T, ...extra };
    const ctl = path.join(dir, 'job-logs', job.id, String(T)); fs.mkdirSync(ctl, { recursive: true });
    fs.writeFileSync(path.join(ctl, 'pid.json'), JSON.stringify(stamp));   // a wrapper's stamp (by default one that stamped and is gone)
    const exitF = path.join(ctl, 'exit.json'); fs.writeFileSync(exitF, exitText);
    fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify([job]));
    return { dir, exitF, id: job.id, pidF: path.join(ctl, 'pid.json') };
  };
  const EXIT = JSON.stringify({ code: 7, endedAt: T + 5000, scopeEmpty: true });
  // the SWEEP's road: the engine runs, then the wrapper is found gone
  const sweep = async (JM) => {
    // the wrapper ALIVE at the boot (the stand-in process: adopted, nothing judged), then gone — its stamp now names a dead process
    const w = setup('exit-sweep', EXIT, { pid: kid.pid, starttime: PI.starttimeOf(kid.pid), bootId: PI.bootIdOf() }), { jm, logs } = engine(JM, w.dir);
    jm.init(); quiet(jm);
    const j = jm.jobs.get(w.id), run = j.runs[j.runs.length - 1];
    fs.writeFileSync(w.pidF, JSON.stringify({ pid: 4194001, starttime: 1, bootId: PI.bootIdOf() }));
    refused.add(w.exitF);
    await jm._sweepPass().catch(() => { });
    const n1 = asked.get(w.exitF) || 0;
    await jm._sweepPass().catch(() => { }); await jm._sweepPass().catch(() => { });
    const n3 = asked.get(w.exitF) || 0;
    const held = { endedAt: run.endedAt || null, state: j.state, exit: run.exit, said: logs.some((l) => /exit\.json could not be read \(EIO\)/.test(l)) };
    refused.delete(w.exitF);
    const h = jm._exitHolds && jm._exitHolds.get(w.exitF);
    const lifted = h ? await h.hold.again() : null;
    await jm._sweepPass().catch(() => { });
    const out = { held, n1, n3, lifted, after: { endedAt: run.endedAt || null, exit: run.exit, state: j.state }, bytesSame: same(bytes(w.exitF), Buffer.from(EXIT)) };
    end(jm);
    return out;
  };
  const s = await sweep(JobManager), sr = await sweep(TipExit);
  ok(!!(s.held.endedAt === null && s.held.state === 'up' && s.held.exit === undefined && s.held.said && s.bytesSame), '③ the SWEEP\'s road, refused: the run is NOT ended (no «ended with no code» saved), said in the journal; the record\'s bytes unchanged', s.held);
  ok(s.n3 === s.n1, '③ held, two more sweeps read the record no more ON the loop (the hold reads it again, off the loop)', { n1: s.n1, n3: s.n3 });
  ok(!!(s.lifted === true && s.after.endedAt === T + 5000 && s.after.exit === 7), '③ its lift: the next sweep judges the run ONCE, with the record\'s own code and end', s.after);
  ok(!!(sr.held.endedAt !== null && sr.held.exit === null), 'RED — the tip\'s «no exit record» (a copy): the refused read judged the run ended with NO code, saved — its real end (code 7) lost', sr.held);
  // the BOOT's road: the hub starts while the wrapper is already gone
  const boot = async (JM) => {
    const w = setup('exit-boot', EXIT); refused.add(w.exitF);
    const { jm } = engine(JM, w.dir);
    jm.init(); quiet(jm);
    const j = jm.jobs.get(w.id), run = j.runs[j.runs.length - 1];
    const held = { endedAt: run.endedAt || null, state: j.state, exit: run.exit, cause: run.cause || null };
    refused.delete(w.exitF);
    const h = jm._exitHolds && jm._exitHolds.get(w.exitF);
    const lifted = h ? await h.hold.again() : null;
    await jm._sweepPass().catch(() => { });
    const out = { held, lifted, after: { endedAt: run.endedAt || null, exit: run.exit, cause: run.cause || null, state: j.state } };
    end(jm);
    return out;
  };
  const b = await boot(JobManager), br = await boot(TipExit);
  ok(!!(b.held.endedAt === null && b.held.state === 'up' && b.held.exit === undefined), '③ the BOOT\'s road, refused: the boot judges nothing (not «died with its environment»)', b.held);
  ok(!!(b.lifted === true && b.after.endedAt === T + 5000 && b.after.exit === 7), '③ its lift: judged by the boot\'s own judge with the record\'s code and end', b.after);
  ok(!!(br.held.endedAt !== null && br.held.exit !== 7), 'RED — the tip (a copy): the refused read at the boot is «no exit record» — judged by the boot\'s guess, the real code lost', br.held);
  // r4994: A WANTED SERVICE whose record is held at the boot — judged at the lift by the boot's judge AND given the boot's replay, ONCE
  // (the start's own door: _startAfter, stood in here so nothing is spawned). The record refused at the boot, then gone (a «missing»
  // right after a failed read is read once more: two reads again)
  const late = async (JM, stamp, extra, between = null) => {
    const w = setup('exit-late', EXIT, stamp, extra); refused.add(w.exitF);
    const { jm } = engine(JM, w.dir);
    const starts = []; jm._startAfter = (job, why, cond) => { starts.push({ id: job.id, why, ok: !!(cond && cond()) }); return Promise.resolve(); };
    jm.init(); quiet(jm);
    const j = jm.jobs.get(w.id), atBoot = { state: j.state, starts: starts.length };
    const pressed = between ? between(jm, j) : null;   // r5017: a person's press between the boot and the lift
    fs.unlinkSync(w.exitF); refused.delete(w.exitF);
    const h = jm._exitHolds && jm._exitHolds.get(w.exitF);
    if (h) { await h.hold.again(); await h.hold.again(); }
    await jm._sweepPass().catch(() => { });
    const once = starts.length;
    await jm._sweepPass().catch(() => { }); await jm._sweepPass().catch(() => { });
    const out = { atBoot, pressed, lifted: !!(h && h.lifted), once, starts: starts.slice(), state: j.state, desiredUp: j.desiredUp };
    end(jm);
    return out;
  };
  const SVC = { kind: 'service', name: 'made-up service', desiredUp: true, restart: 'always' };
  const sv = await late(JobManager, undefined, SVC), svr = await late(TipLate, undefined, SVC);
  ok(!!(sv.atBoot.state === 'up' && sv.atBoot.starts === 0 && sv.lifted && sv.once === 1 && sv.starts.length === 1 && sv.starts[0].why === 'boot' && sv.starts[0].ok && sv.starts[0].id === 'jb-5e6f7a8b'),
    '③ r4994: a WANTED SERVICE whose record was held at the boot — nothing at the boot; at the lift the boot\'s judge sets it down and the boot\'s REPLAY starts it again (its own door, its conditions true), and two more sweeps start nothing more', sv);
  ok(!!(svr.lifted && svr.once === 0 && svr.starts.length === 0 && svr.state === 'down'), 'RED — the tip\'s late judge (a copy, its replay cut): the service set down «the restarted server starts it again», and NOTHING starts it', svr);
  const ps = await late(JobManager, undefined, SVC, (jm, j) => jm.start(j)), pt = await late(JobManager, undefined, SVC, (jm, j) => jm.stop(j));
  ok(!!(ps.pressed && /is already running/.test(String(ps.pressed.error)) && ps.lifted && ps.starts.length === 1 && ps.starts[0].why === 'boot'),
    '③ r5017: a person\'s START between the boot and the lift is refused (the job reads as running while its record is held) — the lift then starts it ONCE, never twice', ps);
  ok(!!(pt.pressed && pt.pressed.ok && pt.lifted && pt.starts.length === 0 && pt.desiredUp === false),
    '③ r5017: a person\'s STOP between the boot and the lift — the lift starts NOTHING (their Stop stands: not wanted up)', pt);
  const uv = await late(JobManager, { pid: 4194001, starttime: 1 }, {});
  ok(!!(uv.lifted && uv.state === 'unverified' && uv.starts.length === 0), '③ …a stamp with no boot id, its record held at the boot: «unverified» at the lift, as the boot says it (nothing started)', uv);
  // TORN bytes: kept beside the record, then the run judged with no record
  const TORN = '{"code": 7, "endedA';
  const torn = async (JM) => {
    const w = setup('exit-torn', TORN), { jm } = engine(JM, w.dir);
    jm.init(); quiet(jm);
    const j = jm.jobs.get(w.id), run = j.runs[j.runs.length - 1];
    if (!run.endedAt) await until(() => !!(jm._exitHolds && jm._exitHolds.get(w.exitF) && jm._exitHolds.get(w.exitF).lifted), 'the torn record kept aside');
    await jm._sweepPass().catch(() => { });
    const copies = fs.readdirSync(path.dirname(w.exitF)).filter((x) => x.startsWith('exit.json.corrupt-'));
    const out = { copies, kept: copies.length === 1 && realRead.call(fs, path.join(path.dirname(w.exitF), copies[0]), 'utf8') === TORN, endedAt: run.endedAt || null };
    end(jm);
    return out;
  };
  const tt = await torn(JobManager), tr = await torn(TipExit);
  ok(!!(tt.kept && tt.endedAt !== null), '③ TORN record bytes: kept beside it byte for byte (exit.json.corrupt-…), then the run judged with no record', tt);
  ok(!!(!tr.kept && tr.endedAt !== null), 'RED — the tip (a copy): torn bytes are «no exit record» at once — judged, nothing kept', tr);
}

// ④ PINS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ the jobs doors say the lock\'s hold by name');
{
  const W = realRead.call(fs, path.join(ROOT, 'src/server/jobs-wiring.js'), 'utf8'), A = realRead.call(fs, path.join(ROOT, 'src/agent-routes.js'), 'utf8');
  const HELD = '(jm.lockHeldWords && jm.lockHeldWords()) || ';
  ok(W.split('if (!jm.ready) return res.status(503).json({ error: ' + HELD).length === 8 && !/if \(!jm\.ready\) return res\.status\(503\)\.json\(\{ error: (?!\(jm\.lockHeldWords)/.test(W),
    '④ src/server/jobs-wiring.js: each of its seven not-ready answers says the lock\'s hold first (none without it)');
  const headOf = (route) => { const i = W.indexOf(route); return i < 0 ? '' : W.slice(i, W.indexOf('\n', W.indexOf('\n', i) + 1)); };
  const doors = ["app.get('/api/jobs/:id', (req, res) => {", "app.post('/api/jobs/seen', (req, res) => {", "app.post('/api/jobs/:id/:act', (req, res) => {"];
  ok(doors.every((d) => headOf(d).includes('if (!jm.ready) return res.status(503).json({ error: ' + HELD)),
    '④ r4994: a job\'s DETAIL, SEEN and its ACTS (Stop, Start, Restart…) ask the hold FIRST — never «no such job» or a success with nothing done for a job it could not look for', doors.filter((d) => !headOf(d).includes(HELD)));
  ok(A.split('if (!jm.ready) { res.status(503).json({ error: ' + HELD).length === 2, '④ src/agent-routes.js: the agent\'s jobs door says it too');
  const B = realRead.call(fs, path.join(ROOT, 'src/routes/browser.js'), 'utf8'), TOKEN = "(jm && jm.lockHeldWords && jm.lockHeldWords()) || 'the jobs engine is not ready — retry shortly'";
  ok(A.split(TOKEN).length === 2 && B.split(TOKEN).length === 2 && !A.includes("{ error: 'the jobs engine is not ready — retry shortly'") && !B.includes("error: 'the jobs engine is not ready — retry shortly'"),   // stale-pins: kept — a deliberate absence check (the old «not ready» words gone from both gates)
    '④ r4994: the two job-token gates that said «not ready» (src/agent-routes.js, src/routes/browser.js) say the lock\'s hold first');
}
// ⑥ A JOB's APPROVAL CARD WHILE THE LOCK IS HELD ─────────────────────────────────────────────────────────────────────────────────
console.log('⑥ a job\'s approval card while the lock is held: answered by the hold, the card stays open');
const LOCKGUARD = "    if (!job && jm && typeof jm.lockHeldWords === 'function' && jm.lockHeldWords()) return { ok: false, code: 'records-unread', words: jm.lockHeldWords() };   // B-f276 (s1126, r5017): the lock HELD — the engine could not look for the job: the hold by name, the card stays open, nothing settled or written\n";
const MJD = mutantCopies('jobs-side-files-door', ROOT);
const VDOOR = require(path.join(ROOT, 'src/server/vault-job-door.js')), VJ = require(path.join(ROOT, 'src/vault-job.js'));
const TipDoor = MJD.load('src/server/vault-job-door.js', anchored(realRead.call(fs, path.join(ROOT, 'src/server/vault-job-door.js'), 'utf8'), LOCKGUARD, '', 'r5017: the door with no lock guard (the tip)', { count: 2 }), 'door-no-lock');
{
  const card = async (D) => {
    const dir = world('card'), lock = path.join(dir, 'jobs.lock');
    fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(JOBS)); fs.writeFileSync(lock, JSON.stringify({ pid: kid.pid, starttime: PI.starttimeOf(kid.pid), at: 1 }));
    refused.add(lock);
    const { jm } = engine(JobManager, dir); jm.init(); quiet(jm);
    const ASK = ['vj', '0123456789abcdef'].join('-'), JOB = 'jb-0d1e2f30';
    const item = { id: 'td-made-up-1', status: 'open', action: { type: VJ.ASK_TYPE, askId: ASK, jobId: JOB, conv: 'conv-a', rev: 1, e0: 'secret:made-up-key' } };
    const writes = [], audits = [];
    const todos = { openItems: () => (item.status === 'open' ? [item] : []), snapshot: () => ({ open: item.status === 'open' ? [item] : [] }), get: (id) => (id === item.id ? item : null),
      setStatus: (id, st, why) => { writes.push(['status', id, st, why]); item.status = st; }, resolveAnswered: (ids, why) => { writes.push(['answered', ids, why]); item.status = 'done'; } };
    const vault = { state: () => 'unlocked', secretNames: () => [], secretGet: () => ({ ok: false, code: 'none' }), noteUse() { }, blocked: () => false, onUnlock() { }, audit: (k, l) => audits.push(l) };
    const door = D.create({ vault, grants: () => ({ rowsFor: () => [], onChange() { } }), userTodos: todos, log: () => { } });
    door.bindJobs(jm);
    await Promise.resolve(jm.readCopies()).catch(() => { });   // the kept copies READ, as a live hub has them by a person's press (before, the door's own kept-copy guard over-keeps every id)
    const held = jm.lockHeldWords();
    const a = door.answer(ASK, { answer: 'allow', reauthed: true, by: 'user', person: true, rev: 1 }), rv = door.revokeAll(JOB, { by: 'user' });
    refused.delete(lock); end(jm);
    return { held, a, rv, open: item.status === 'open', writes, audits: audits.length };
  };
  const c = await card(VDOOR), cr = await card(TipDoor);
  ok(!!(c.held && c.a && c.a.ok === false && c.a.code === 'records-unread' && c.a.words === c.held && c.open && c.writes.length === 0 && c.audits === 0),
    '⑥ r5017: a person\'s ALLOW on a job\'s approval card while the lock is held answers the hold BY NAME — the card stays OPEN, nothing settled, no audit line', { a: c.a, open: c.open, writes: c.writes, audits: c.audits });
  ok(!!(c.rv && c.rv.ok === false && c.rv.code === 'records-unread' && c.rv.words === c.held), '⑥ …and the job card\'s ✕ (take back its approvals) answers the hold by name, never «bad revoke»', c.rv);
  ok(!!(cr.a && cr.a.code === 'ask_over' && !cr.open && cr.writes.length >= 1 && cr.audits >= 1 && cr.rv && cr.rv.code === 'bad_revoke'),
    'RED — the tip\'s door (a copy, no lock guard): «the job is over», the card CLOSED and an audit line «over» for a job it never looked for; the ✕ «bad revoke»', { a: cr.a && cr.a.code, open: cr.open, writes: cr.writes, audits: cr.audits, rv: cr.rv && cr.rv.code });
}

// ⑦ THE CENSUS OF THE ENGINE's LOOKUPS OUTSIDE ITS FILE ─────────────────────────────────────────────────────────────────────────
console.log('⑦ every caller of the engine\'s lookups and every not-ready gate outside src/jobs.js, by a fixed-string search');
// THE SEARCH (fixed strings, line by line, over src/ and server.js, the .js / .cjs / .mjs files, src/jobs.js out):
//   S1 = a line holding 'jm.jobs.get(' or 'jm.jobByToken(' (the engine's lookup of a job, of a job's sign-in)
//   S2 = a line holding 'jm.ready' (a not-ready gate)
// Each file's count is its row's. Each row says what its lines answer while the lock is held (HOLD: the hold by name, first · PAST:
// reached only past a door that asks it · VIEW: a name or a list only, nothing decided, closed or written · KEPT: «cannot say», the
// thing kept, never released or closed on a guess · LEFT: refuses or omits, not by name — with its why)
const S1_ROWS = {
  'src/agent-routes.js': [8, 'HOLD jobAuth, the token gate, the agent docs gate, pageAuth (tokenHeldAnswer) · PAST a cron parent and the create\'s three lines, after jobAuth'],
  'src/browser-job-principal.js': [1, 'KEPT jobRunningIn: jobsUnknownCode says jobs_lock_unread, the handle kept'],
  'src/routes/browser.js': [3, 'HOLD jobFactsOf (its gate) · VIEW the children\'s names, a job\'s label in its facts'],
  'src/routes/design.js': [1, 'HOLD tokenHeldAnswer'], 'src/routes/feedback.js': [1, 'HOLD tokenHeldAnswer'],
  'src/routes/vault.js': [4, 'PAST the vault doors\' gate (app.use over /api/vault and /api/agent/vault: tokenHeldAnswer) answers EVERY jbt_ bearer the hold by name, the lock\'s too since r4994, before any door runs — its four lookups (bearerOf, agentOk, agentPrincipal, runCallerOf) are reached only past it'],
  'src/server/delivery-wake.js': [2, 'HOLD the wake grant (its gate) · PAST a cron parent'],
  'src/server/end-proposals.js': [3, 'LEFT jobOwnerReader / wakeRowsReader read a held engine as «no job owns it»: a card drawn during the hold lists no job rows; one drawn before it and pressed during it ends the conversation without storing its jobs\' ticks — nothing about a job is written, the press is not refused (a refusal needs its own words, zh and ja)'],
  'src/server/jobs-wiring.js': [4, 'HOLD the detail, seen and acts (their gates) · PAST the create, after its gate'],
  'src/server/mounts-plugins-wiring.js': [1, 'VIEW jobName (the browser keeper\'s label; its own rule keeps the handle while the engine cannot say)'],
  'src/server/vault-job-door.js': [8, 'HOLD answer and revokeAll (r5017) · PAST ask, fileCards (the engine\'s own, never while held) · VIEW refOf (an audit\'s name), rowFacts\'s two (the rows view) · LEFT entryGone (a deleted entry\'s jobs are not stopped while held: the engine holds no record of them; their use of it is refused at the vault, fail closed)'],
};
const S2_ROWS = {
  'src/agent-routes.js': [7, 'HOLD jobAuth, the token gate, pageAuth · KEPT the three hook gates (the turn carries no job lines while held: nothing drained, the stash kept) and one comment'],
  'src/browser-job-principal.js': [1, 'KEPT (its unknown code)'], 'src/port-forward.js': [1, 'VIEW the ports\' owner names'], 'src/routes/browser.js': [1, 'HOLD'],
  'src/routes/design.js': [1, 'HOLD'], 'src/routes/feedback.js': [1, 'HOLD'], 'src/routes/vault.js': [4, 'PAST the vault doors\' gate (as S1)'], 'src/server/conversation-facts.js': [1, 'VIEW (the facts «cannot say»)'],
  'src/server/delivery-wake.js': [1, 'HOLD (r5017)'], 'src/server/jobs-wiring.js': [7, 'HOLD (seven gates)'], 'src/server/record-clear.js': [1, 'HOLD (r5017)'],
};
const CLASS_RE = /\b(HOLD|PAST|VIEW|KEPT|LEFT)\b/;
const treeFiles = () => { const out = new Map(); const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const r = path.posix.join(d, e.name); if (e.isDirectory()) walk(r); else if (/\.(?:c?js|mjs)$/.test(e.name) && r !== 'src/jobs.js') out.set(r, realRead.call(fs, path.join(ROOT, r), 'utf8')); } }; walk('src'); out.set('server.js', realRead.call(fs, path.join(ROOT, 'server.js'), 'utf8')); return out; };
const countLines = (files, needles) => { const by = {}; for (const [f, src] of files) { const n = src.split('\n').filter((l) => needles.some((x) => l.includes(x))).length; if (n) by[f] = n; } return by; };
const censusRed = (files, needles, rows) => { const by = countLines(files, needles), red = []; for (const [f, n] of Object.entries(by)) { const row = rows[f]; if (!row) red.push(`${f}: ${n} line(s), NO ROW — a new caller: say what it answers under a held lock (the hold by name first)`); else if (row[0] !== n) red.push(`${f}: ${n} line(s), its row says ${row[0]} — a caller was added or removed: say what it answers`); } for (const f of Object.keys(rows)) if (!by[f]) red.push(`${f}: its row names lines the tree no longer has`); return red; };
{
  const TREE = treeFiles(), S1N = ['jm.jobs.get(', 'jm.jobByToken('], S2N = ['jm.ready'];
  const r1 = censusRed(TREE, S1N, S1_ROWS), r2 = censusRed(TREE, S2N, S2_ROWS);
  ok(r1.length === 0 && Object.values(S1_ROWS).every(([, w]) => CLASS_RE.test(w)), `⑦ S1: every caller of the engine's lookup of a job or of its sign-in outside src/jobs.js has its row and its answer under a held lock (${Object.values(S1_ROWS).reduce((n, [k]) => n + k, 0)} lines in ${Object.keys(S1_ROWS).length} files)`, r1);
  ok(r2.length === 0 && Object.values(S2_ROWS).every(([, w]) => CLASS_RE.test(w) || /as S1/.test(w)), `⑦ S2: every not-ready gate outside src/jobs.js has its row (${Object.values(S2_ROWS).reduce((n, [k]) => n + k, 0)} lines in ${Object.keys(S2_ROWS).length} files)`, r2);
  const plantNew = new Map(TREE); plantNew.set('src/server/zz-new-door.js', "const job = jm.jobs.get(id); if (!job) return { error: 'no such job' };\n");
  const plantMore = new Map(TREE); plantMore.set('src/routes/design.js', TREE.get('src/routes/design.js') + "\nconst again = jm.jobByToken(token);\n");
  const n1 = censusRed(plantNew, S1N, S1_ROWS), n2 = censusRed(plantMore, S1N, S1_ROWS);
  ok(n1.some((x) => x.startsWith('src/server/zz-new-door.js: 1 line(s), NO ROW')) && n2.some((x) => x.startsWith('src/routes/design.js: 2 line(s), its row says 1')),
    'CONTROL (⑦): a NEW caller in a new file is red by name, and one more caller in a mapped file is red by its count', { n1, n2 });
}
for (const r of copiesCensus(MJD.files, MJD.dir, ROOT, { minCopies: 1, label: 'side-files door ' })) ok(r.pass, r.name, r.detail);
for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 4, label: 'side-files ' })) ok(r.pass, r.name, r.detail);
report();
