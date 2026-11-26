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
//   ⑧ THE STAMP UNIT (r5015): a run's process record (pid.json) that cannot be read is «may still run», never «dead»: the boot HOLDS it
//      (a living wrapper adopted at the lift, never started beside itself; a dead one judged and replayed once); a person's Stop is the
//      way out (ends the run on purpose, nothing signalled from the record); a cron's fire skips beside it (said once); a removal is
//      refused with the way out (--orphan goes); the collapse and the archive keep the record (pins). Each with its red (a copy)
//   ⑨ r5074's smalls: the single take-back answers the held lock; a deleted entry's stops are owed and done at the lift; the end card's
//      owner reader answers a held engine by its words, and the press's answer names it
//   ALL PLANTS (r5135 law 1): each control is judged on a witness that its plant was read, else a NAMED SKIP in the closing line
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
const { ok, report, counts } = checker();
// 主开发 r5135 LAW 1: a control is judged on a WITNESS that its plant was in force — here, that the product READ the planted path (a refused
// read counted, on the loop or off it); a plant never read is a NAMED SKIP, counted in the closing line, never a red and never a green
let skipped = 0;
const skip = (m) => { skipped++; console.log(`  ⚠ SKIP: ${m}`); };
const plantHits = new Map(), hitsOf = (p) => plantHits.get(String(p)) || 0;
const judged = (witnessed, cond, name, detail) => { if (witnessed) ok(cond, name, detail); else skip(`${name} — its plant was never read: not judged`); };
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
fs.readFileSync = function (p, ...a) { const k = String(p); asked.set(k, (asked.get(k) || 0) + 1); if (refused.has(k)) { plantHits.set(k, hitsOf(k) + 1); throw eio(k); } return realRead.call(fs, p, ...a); };
fs.promises.readFile = function (p, ...a) { const k = String(p); if (refused.has(k)) { plantHits.set(k, hitsOf(k) + 1); return Promise.reject(eio(k)); } return realPRead.call(fs.promises, p, ...a); };
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
    return { f, r1, r2, during, said, after, logs, hit: hitsOf(f) };
  };
  const s = scene(JobManager), t = scene(TipHistory);
  const head = s.during && same(s.during.subarray(0, Buffer.byteLength(prior)), Buffer.from(prior));
  const tail = s.during ? s.during.toString('utf8').slice(Buffer.byteLength(prior)) : '';
  ok(!!(prior.length < 262144 && s.r1 === s.f && s.r2 === s.f && head && /the first new one[\s\S]*the second new one/.test(tail) && s.during.length > 262144),
    '① refused: the history\'s earlier bytes stand byte for byte at its head, each new block ADDED after them (nothing written over; the trim waits)', { head, tailLen: tail.length, len: s.during && s.during.length });
  ok(s.said === 1, '① said ONCE an episode (two drains while refused, one journal line naming the file and the code)', s.logs);
  ok(!!(s.after.length === 262144 && /the first new one[\s\S]*the second new one[\s\S]*the third, after the read came back/.test(s.after)),
    '① the next good read: the whole history read back and trimmed to its bound again, every block in order', { len: s.after.length });
  judged(t.hit > 0, !!(t.during && !t.during.toString('utf8').includes('an earlier notice 0') && t.during.length < 1000),
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
    const out = { held, made, lockSame: same(lockHeld, lock0), storeSame: same(storeHeld, store0), lifted, after: { ready: jm.ready, readOnly: jm.readOnly, loaded: jm.jobs.size }, lockAfter: realRead.call(fs, lock, 'utf8'), storeAfterSame: same(bytes(store), store0), logs, hit: hitsOf(lock) };
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
  judged(r.hit > 0, !!(r.held.ready === true && r.held.readOnly === false && JSON.parse(r.lockAfter).pid === process.pid),
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
    const out = { held, n1, n3, lifted, after: { endedAt: run.endedAt || null, exit: run.exit, state: j.state }, bytesSame: same(bytes(w.exitF), Buffer.from(EXIT)), hit: hitsOf(w.exitF) };
    end(jm);
    return out;
  };
  const s = await sweep(JobManager), sr = await sweep(TipExit);
  ok(!!(s.held.endedAt === null && s.held.state === 'up' && s.held.exit === undefined && s.held.said && s.bytesSame), '③ the SWEEP\'s road, refused: the run is NOT ended (no «ended with no code» saved), said in the journal; the record\'s bytes unchanged', s.held);
  ok(s.n3 === s.n1, '③ held, two more sweeps read the record no more ON the loop (the hold reads it again, off the loop)', { n1: s.n1, n3: s.n3 });
  ok(!!(s.lifted === true && s.after.endedAt === T + 5000 && s.after.exit === 7), '③ its lift: the next sweep judges the run ONCE, with the record\'s own code and end', s.after);
  judged(sr.hit > 0, !!(sr.held.endedAt !== null && sr.held.exit === null), 'RED — the tip\'s «no exit record» (a copy): the refused read judged the run ended with NO code, saved — its real end (code 7) lost', sr.held);
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
    const out = { held, lifted, after: { endedAt: run.endedAt || null, exit: run.exit, cause: run.cause || null, state: j.state }, hit: hitsOf(w.exitF) };
    end(jm);
    return out;
  };
  const b = await boot(JobManager), br = await boot(TipExit);
  ok(!!(b.held.endedAt === null && b.held.state === 'up' && b.held.exit === undefined), '③ the BOOT\'s road, refused: the boot judges nothing (not «died with its environment»)', b.held);
  ok(!!(b.lifted === true && b.after.endedAt === T + 5000 && b.after.exit === 7), '③ its lift: judged by the boot\'s own judge with the record\'s code and end', b.after);
  judged(br.hit > 0, !!(br.held.endedAt !== null && br.held.exit !== 7), 'RED — the tip (a copy): the refused read at the boot is «no exit record» — judged by the boot\'s guess, the real code lost', br.held);
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
    const out = { atBoot, pressed, lifted: !!(h && h.lifted), once, starts: starts.slice(), state: j.state, desiredUp: j.desiredUp, hit: hitsOf(w.exitF) };
    end(jm);
    return out;
  };
  const SVC = { kind: 'service', name: 'made-up service', desiredUp: true, restart: 'always' };
  const sv = await late(JobManager, undefined, SVC), svr = await late(TipLate, undefined, SVC);
  ok(!!(sv.atBoot.state === 'up' && sv.atBoot.starts === 0 && sv.lifted && sv.once === 1 && sv.starts.length === 1 && sv.starts[0].why === 'boot' && sv.starts[0].ok && sv.starts[0].id === 'jb-5e6f7a8b'),
    '③ r4994: a WANTED SERVICE whose record was held at the boot — nothing at the boot; at the lift the boot\'s judge sets it down and the boot\'s REPLAY starts it again (its own door, its conditions true), and two more sweeps start nothing more', sv);
  judged(svr.hit > 0, !!(svr.lifted && svr.once === 0 && svr.starts.length === 0 && svr.state === 'down'), 'RED — the tip\'s late judge (a copy, its replay cut): the service set down «the restarted server starts it again», and NOTHING starts it', svr);
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
    const out = { copies, kept: copies.length === 1 && realRead.call(fs, path.join(path.dirname(w.exitF), copies[0]), 'utf8') === TORN, endedAt: run.endedAt || null, read: asked.get(w.exitF) || 0 };
    end(jm);
    return out;
  };
  const tt = await torn(JobManager), tr = await torn(TipExit);
  ok(!!(tt.kept && tt.endedAt !== null), '③ TORN record bytes: kept beside it byte for byte (exit.json.corrupt-…), then the run judged with no record', tt);
  judged(tr.read > 0, !!(!tr.kept && tr.endedAt !== null), 'RED — the tip (a copy): torn bytes are «no exit record» at once — judged, nothing kept', tr);
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
    const a = door.answer(ASK, { answer: 'allow', reauthed: true, by: 'user', person: true, rev: 1 }), dn = door.answer(ASK, { answer: 'deny', by: 'user', person: true, rev: 1 }), rv = door.revokeAll(JOB, { by: 'user' });
    refused.delete(lock); end(jm);
    return { held, a, dn, rv, open: item.status === 'open', writes, audits: audits.length, hit: hitsOf(lock) };
  };
  const c = await card(VDOOR), cr = await card(TipDoor);
  ok(!!(c.held && c.a && c.a.ok === false && c.a.code === 'records-unread' && c.a.words === c.held && c.open && c.writes.length === 0 && c.audits === 0),
    '⑥ r5017: a person\'s ALLOW on a job\'s approval card while the lock is held answers the hold BY NAME — the card stays OPEN, nothing settled, no audit line', { a: c.a, open: c.open, writes: c.writes, audits: c.audits });
  ok(!!(c.dn && c.dn.ok === false && c.dn.code === 'records-unread' && c.dn.words === c.held && c.open && c.writes.length === 0), '⑥ r5074 (3): a person\'s DENY on the same card while the lock is held answers the hold by name too — the card still open, nothing written', c.dn);
  ok(!!(c.rv && c.rv.ok === false && c.rv.code === 'records-unread' && c.rv.words === c.held), '⑥ …and the job card\'s ✕ (take back its approvals) answers the hold by name, never «bad revoke»', c.rv);
  judged(cr.hit > 0, !!(cr.a && cr.a.code === 'ask_over' && !cr.open && cr.writes.length >= 1 && cr.audits >= 1 && cr.rv && cr.rv.code === 'bad_revoke'),
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
  'src/server/end-proposals.js': [3, 'HOLD jobOwnerReader answers a held engine BY ITS WORDS (r5074 (2)): an end card\'s press with wake ticks, a wake card\'s filing and a grant\'s change refuse by the hold\'s name, nothing written · VIEW wakeRowsReader (a card drawn while held lists no job rows)'],
  'src/server/jobs-wiring.js': [4, 'HOLD the detail, seen and acts (their gates) · PAST the create, after its gate'],
  'src/server/mounts-plugins-wiring.js': [1, 'VIEW jobName (the browser keeper\'s label; its own rule keeps the handle while the engine cannot say)'],
  'src/server/vault-job-door.js': [8, 'HOLD answer and revokeAll (r5017), the single revoke (r5074 (1): its guard asks the hold before its first lookup) · PAST ask, fileCards (the engine\'s own, never while held) · VIEW refOf (an audit\'s name), rowFacts\'s two (the rows view) · KEPT entryGone (r5074 (1): a deleted entry\'s jobs\' stop OWED while held, done at the lock\'s lift — afterLift)'],
};
const S2_ROWS = {
  'src/agent-routes.js': [7, 'HOLD jobAuth, the token gate, pageAuth · KEPT the three hook gates (the turn carries no job lines while held: nothing drained, the stash kept) and one comment'],
  'src/browser-job-principal.js': [1, 'KEPT (its unknown code)'], 'src/port-forward.js': [1, 'VIEW the ports\' owner names'], 'src/routes/browser.js': [1, 'HOLD'],
  'src/routes/design.js': [1, 'HOLD'], 'src/routes/feedback.js': [1, 'HOLD'], 'src/routes/vault.js': [4, 'PAST the vault doors\' gate (as S1)'], 'src/server/conversation-facts.js': [1, 'VIEW (the facts «cannot say»)'],
  'src/server/delivery-wake.js': [1, 'HOLD (r5017)'], 'src/server/jobs-wiring.js': [7, 'HOLD (seven gates)'], 'src/server/record-clear.js': [1, 'HOLD (r5017)'],
};
const CLASS_RE = /\b(HOLD|PAST|VIEW|KEPT|LEFT)\b/;
const treeFiles = () => { const out = new Map(); const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const r = path.posix.join(d, e.name); if (e.isDirectory()) walk(r); else if (/\.(?:c?js|mjs)$/.test(e.name) && r !== 'src/jobs.js') out.set(r, realRead.call(fs, path.join(ROOT, r), 'utf8')); } }; walk('src'); out.set('server.js', realRead.call(fs, path.join(ROOT, 'server.js'), 'utf8')); return out; };
// r5074 (3): THE NEEDLE IS THE LOOKUP ITSELF — '.jobs.get(' / 'jobByToken(' whatever the engine's variable is called — minus a NAMED
// EXCEPTION LIST of the other maps that happen to be called jobs (each with its why): a new caller by any name is red by name
const NOT_THE_ENGINE = {
  'src/vault-use.js': [['e.jobs.get(', 'a vault entry\'s own use summary (its jobs: a count Map), not the engine']],
  'src/lib/user-todos-actions.js': [['m.jobs.get(', 'an end card\'s own ticks (a Map in the page), not the engine']],
};
const countLines = (files, needles, except = {}) => { const by = {}; for (const [f, src] of files) { const ex = (except[f] || []).map(([t]) => t); const n = src.split('\n').filter((l) => { let r = l; for (const t of ex) r = r.split(t).join(''); return needles.some((x) => r.includes(x)); }).length; if (n) by[f] = n; } return by; };
const censusRed = (files, needles, rows, except = {}) => { const by = countLines(files, needles, except), red = []; for (const [f, n] of Object.entries(by)) { const row = rows[f]; if (!row) red.push(`${f}: ${n} line(s), NO ROW — a new caller: say what it answers under a held lock (the hold by name first)`); else if (row[0] !== n) red.push(`${f}: ${n} line(s), its row says ${row[0]} — a caller was added or removed: say what it answers`); } for (const f of Object.keys(rows)) if (!by[f]) red.push(`${f}: its row names lines the tree no longer has`); return red; };
{
  const TREE = treeFiles(), S1N = ['.jobs.get(', 'jobByToken('], S2N = ['jm.ready'];
  const r1 = censusRed(TREE, S1N, S1_ROWS, NOT_THE_ENGINE), r2 = censusRed(TREE, S2N, S2_ROWS);
  const exDead = Object.entries(NOT_THE_ENGINE).flatMap(([f, xs]) => xs.filter(([t]) => !(TREE.get(f) || '').includes(t)).map(([t]) => `${f}: ${t}`));
  ok(exDead.length === 0, '⑦ r5074 (3): every named exception (a map that is not the engine) is still in its file — a dead exception is red', exDead);
  ok(r1.length === 0 && Object.values(S1_ROWS).every(([, w]) => CLASS_RE.test(w)), `⑦ S1: every caller of the engine's lookup of a job or of its sign-in outside src/jobs.js has its row and its answer under a held lock (${Object.values(S1_ROWS).reduce((n, [k]) => n + k, 0)} lines in ${Object.keys(S1_ROWS).length} files)`, r1);
  ok(r2.length === 0 && Object.values(S2_ROWS).every(([, w]) => CLASS_RE.test(w) || /as S1/.test(w)), `⑦ S2: every not-ready gate outside src/jobs.js has its row (${Object.values(S2_ROWS).reduce((n, [k]) => n + k, 0)} lines in ${Object.keys(S2_ROWS).length} files)`, r2);
  const plantNew = new Map(TREE); plantNew.set('src/server/zz-new-door.js', "const job = jm.jobs.get(id); if (!job) return { error: 'no such job' };\n");
  const plantMore = new Map(TREE); plantMore.set('src/routes/design.js', TREE.get('src/routes/design.js') + "\nconst again = jm.jobByToken(token);\n");
  const plantRenamed = new Map(TREE); plantRenamed.set('src/server/zz-renamed-door.js', "const job = engine.jobs.get(id); if (!job) return { error: 'no such job' };\n");
  const n1 = censusRed(plantNew, S1N, S1_ROWS, NOT_THE_ENGINE), n2 = censusRed(plantMore, S1N, S1_ROWS, NOT_THE_ENGINE), n3 = censusRed(plantRenamed, S1N, S1_ROWS, NOT_THE_ENGINE);
  ok(n3.some((x) => x.startsWith('src/server/zz-renamed-door.js: 1 line(s), NO ROW')), 'CONTROL (⑦, r5074 (3)): a new caller whose engine variable has ANOTHER NAME (engine.jobs.get) is red by name too', n3);
  ok(n1.some((x) => x.startsWith('src/server/zz-new-door.js: 1 line(s), NO ROW')) && n2.some((x) => x.startsWith('src/routes/design.js: 2 line(s), its row says 1')),
    'CONTROL (⑦): a NEW caller in a new file is red by name, and one more caller in a mapped file is red by its count', { n1, n2 });
}
// ⑧ THE STAMP UNIT (B-f276, lane bl-proposals, 主开发 r5015 / r5074) ───────────────────────────────────────────────────────────────
console.log('⑧ a run\'s process record (pid.json) that cannot be read is «may still run», never «dead»');
const TipStampBoot = cut("    if (sa.state === 'unknown') return;\n", '', 'the boot reads an unknown process record as no stamp (the tip)');
const TipStop = cut("    if (sa && sa.state === 'unknown') return this._stopUnread(job, run, sa);\n", '', 'a stop with no way out of an unknown record (the tip)');
// r5238 LAW 6 (the hotfix of 2.369.420): the two orders of a Stop's road this unit owns, each red as the unit first built it
const TipOrder = cut(`    this._stopDoubt(job, run, { afterForward: endIt }).then(endIt, (e) => { this.d.log(\`[jobs] \${job.id}: the stop of what its run left failed:\`, e && e.message); endIt(); });\n`,
  `    endIt(); this._stopDoubt(job, run).catch((e) => this.d.log(\`[jobs] \${job.id}: the stop of what its run left failed:\`, e && e.message));\n`, 'the way out records its end before its forward (the unit as first built)');
const TipPending = cut('    if ((job._termAt || job._stopForce || (this._unreadStops && this._unreadStops.has(run0))) && this._runLive(job, run0)) {', '    if ((job._termAt || job._stopForce) && this._runLive(job, run0)) {', 'a start during the way out answers «already running» (the unit as first built)');   // stale-pins: kept — the replacement is the unit as first built (the red copy)
// r5291's follow: each red is the line as a20dcc4b9 had it
const TipTornLift = cut("if (facts && facts.setAside) { this._stampTornLift(job, run, facts.setAside); return; } this._stampLift(job, run, value || null);", 'this._stampLift(job, run, value || null);', 'a torn lift read as an empty record (a20dcc4b9)');
const TipStartWords = cut("      if (sa && sa.state === 'unknown') return { error: `${job.id} is already running — its process record could not be read (${sa.code}): Stop it to end that run on purpose (nothing is signalled from that record), then start it again` };\n", '', 'a Start refused on an unknown record with no way out named (a20dcc4b9)');
const TipSweep = cut("      if (run && !run.endedAt && this._stampHolds && this._stampHolds.has(path.join(this._ctlDir(job, run.startedAt), 'pid.json'))) continue;\n", '', 'a sweep tick that reads a held run on the loop (a20dcc4b9)');
const TipAskOver = cut("      this._vaultAskOver(job);   // r5291's should: a stopped job's approval card is over, as on the ordinary Stop (after the forward)\n", '', 'a way-out Stop that leaves the approval card open (a20dcc4b9)');
const TipTwice = cut(": force ? this._killGroup(job, 'SIGKILL') : this._termRun(job, run, sa); // round 7", ": force ? this._killGroup(job, 'SIGKILL') : this._termRun(job, run); // round 7", 'a stop that reads the record again before its signal (the unit as first built)');   // stale-pins: kept — the replacement is the unit as first built (the red copy)
const TipFire = cut("        if (sa.state === 'unknown') { this._fireSkipUnread(job, child, sa); return; }\n", '', 'a cron fire beside an unknown run (the tip)');
const TipRm = cut("    if (unknown && !orphan && !stop) return { error:", "    if (false) return { error:", 'a removal of a run whose record is unknown (the tip)');
{
  const T8 = Date.now() - 60000, ACC = { view: 'session', control: 'session' };
  const ALIVE = () => ({ pid: kid.pid, starttime: PI.starttimeOf(kid.pid), bootId: PI.bootIdOf() }), DEAD = () => ({ pid: 4194002, starttime: 1, bootId: PI.bootIdOf() });
  const setup8 = (tag, stamp, records = null) => {
    const dir = world(tag), job = { id: 'jb-7a8b9c0d', kind: 'service', name: 'made-up service', state: 'up', desiredUp: true, restart: 'always', owner: {}, access: ACC, runs: [{ startedAt: T8, trigger: 'manual' }], createdAt: T8 };
    const list = records || [job], pidOf = (j) => path.join(dir, 'job-logs', j.id, String(j.runs[j.runs.length - 1].startedAt), 'pid.json');
    for (const j of list) if (j.runs && j.runs.length) { fs.mkdirSync(path.dirname(pidOf(j)), { recursive: true }); fs.writeFileSync(pidOf(j), JSON.stringify(typeof stamp === 'function' ? stamp(j) : stamp)); }
    fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(list));
    return { dir, id: list[0].id, pidF: pidOf(list[0]), pidOf };
  };
  // (a) THE BOOT: the record refused at the start — nothing judged, nothing started; at its lift the boot's own adoption, once
  const bootScene = async (JM, stamp) => {
    const w = setup8('stamp-boot', stamp); refused.add(w.pidF);
    const { jm, logs } = engine(JM, w.dir);
    const starts = []; jm._startAfter = (job, why, cond) => { starts.push({ why, ok: !!(cond && cond()) }); return Promise.resolve(); };
    jm.init(); quiet(jm);
    const j = jm.jobs.get(w.id), run = j.runs[j.runs.length - 1];
    const atBoot = { state: j.state, ended: !!run.endedAt, starts: starts.length, held: !!(jm._stampHolds && jm._stampHolds.size) };
    refused.delete(w.pidF);
    const h = jm._stampHolds && [...jm._stampHolds.values()][0];
    const lifted = h ? await h.hold.again() : null;
    const after = { state: j.state, ended: !!run.endedAt, starts: starts.length, adopted: logs.some((l) => l.includes(`adopted ${w.id}`)) };
    const out = { atBoot, lifted, after, hit: hitsOf(w.pidF) };
    end(jm); return out;
  };
  const a8 = await bootScene(JobManager, ALIVE()), a8r = await bootScene(TipStampBoot, ALIVE()), d8 = await bootScene(JobManager, DEAD());
  judged(a8.hit > 0, !!(a8.atBoot.state === 'up' && !a8.atBoot.ended && a8.atBoot.starts === 0 && a8.atBoot.held && a8.lifted === true && a8.after.adopted && !a8.after.ended && a8.after.starts === 0),
    '⑧ (a) a LIVING wrapper whose process record is refused at the boot: HELD — not judged, nothing started; at its lift ADOPTED (the boot\'s own adoption, once), never started beside itself', a8);
  judged(a8r.hit > 0, !!(a8r.atBoot.ended && a8r.atBoot.starts >= 1), 'RED — the tip\'s boot (a copy): the refused record is «no stamp» — the living run judged DEAD at the boot and a start asked beside it', a8r);
  judged(d8.hit > 0, !!(!d8.atBoot.ended && d8.atBoot.starts === 0 && d8.lifted === true && d8.after.ended && d8.after.starts === 1),
    '⑧ (a) a DEAD wrapper\'s refused record: nothing at the boot; at its lift judged by the boot\'s judge and replayed ONCE (the start\'s own door)', d8);
  // (a-torn) r5291's REQUIRED FOLLOW: a TORN record at the boot — its hold sets the bytes aside and lifts with nothing, the live file still
  // torn. The run MAY STILL RUN: never judged, ended or started, said once; a removal still refused. The plant: torn bytes over the record;
  // the witness: their copy set aside (the hold read them)
  const tornBoot = async (JM) => {
    const w = setup8('stamp-torn', ALIVE());
    fs.writeFileSync(w.pidF, '{"pid": ' + kid.pid + ', "startti');
    const { jm, logs } = engine(JM, w.dir);
    const starts = []; jm._startAfter = (job, why) => { starts.push(String(why)); return Promise.resolve(); }; jm._spawn = (job, trig) => { starts.push(String(trig)); };
    jm.init(); quiet(jm);
    const j = jm.jobs.get(w.id), run = j.runs[j.runs.length - 1];
    const heldAtBoot = !!(jm._stampHolds && jm._stampHolds.size);
    if (heldAtBoot) await until(() => !jm._stampHolds.size, 'the torn record\'s hold lifted', 3000);
    const copies = fs.readdirSync(path.dirname(w.pidF)).filter((f) => f.startsWith('pid.json.corrupt-')).length;
    const after = { state: j.state, ended: !!run.endedAt, starts: starts.length, said: logs.filter((l) => l.includes('its process record is torn')).length };
    const r = jm.rm(j), kept = jm.jobs.has(w.id);
    const out = { heldAtBoot, copies, after, rm: r && r.error ? String(r.error).slice(0, 200) : r, kept };
    end(jm); return out;
  };
  const t8 = await tornBoot(JobManager), t8r = await tornBoot(TipTornLift);
  judged(t8.copies > 0, !!(t8.heldAtBoot && !t8.after.ended && t8.after.state === 'up' && t8.after.starts === 0 && t8.after.said === 1 && t8.kept && /process record could not be read \(torn bytes\)/.test(String(t8.rm))),
    '⑧ (a-torn) r5291: a TORN record at the boot is set aside and NOTHING is judged — the run not ended, nothing started, said once; a removal still refused', t8);
  judged(t8r.copies > 0, !!(t8r.after.ended && !t8r.kept), 'RED — the torn lift as a20dcc4b9 had it (a copy): read as an empty record, the run judged ended and a plain removal takes its record', t8r);
  // (a-sweep) r5291's should: a run the boot HOLDS is judged at the hold's lift alone — a sweep tick meanwhile reads nothing of it on the
  // loop. The plant: the record refused at the boot, then readable before the hold's own try; the witness: the boot's refused read
  const sweepHeld = async (JM) => {
    const w = setup8('stamp-sweep', DEAD()); refused.add(w.pidF);
    const { jm } = engine(JM, w.dir);
    jm._startAfter = () => Promise.resolve(); jm._spawn = () => { };
    jm.init(); quiet(jm);
    const j = jm.jobs.get(w.id), run = j.runs[j.runs.length - 1];
    refused.delete(w.pidF);
    const before = asked.get(w.pidF) || 0;
    await jm._sweepPass().catch(() => { });
    const tick = { reads: (asked.get(w.pidF) || 0) - before, ended: !!run.endedAt };
    const h = jm._stampHolds && [...jm._stampHolds.values()][0];
    const lifted = h ? await h.hold.again() : null;
    const out = { tick, lifted, ended: !!run.endedAt, hit: hitsOf(w.pidF) };
    end(jm); return out;
  };
  const s8 = await sweepHeld(JobManager), s8r = await sweepHeld(TipSweep);
  judged(s8.hit > 0, !!(s8.tick.reads === 0 && !s8.tick.ended && s8.lifted === true && s8.ended),
    '⑧ (a-sweep) r5291: a sweep tick reads NOTHING of a run the boot holds (no read on the loop beside the hold\'s own); the hold\'s lift alone judges it', s8);
  judged(s8r.hit > 0, !!(s8r.tick.reads >= 1), 'RED — the sweep as a20dcc4b9 had it (a copy): the tick reads the held run\'s record on the loop', s8r);
  // (a-start) r5291's should, word (b): a person's Start on a live job whose record is unknown names the way out, not only «already running»
  const startWords = async (JM) => {
    const w = setup8('stamp-startw', ALIVE()), { jm } = engine(JM, w.dir);
    jm._spawn = () => { }; jm._startAfter = () => Promise.resolve();
    jm.init(); quiet(jm);
    const j = jm.jobs.get(w.id); refused.add(w.pidF);
    let st = null; try { st = jm.start(j); } finally { refused.delete(w.pidF); }
    const out = { st, hit: hitsOf(w.pidF) }; end(jm); return out;
  };
  const w8 = await startWords(JobManager), w8r = await startWords(TipStartWords);
  judged(w8.hit > 0, !!(w8.st && /is already running — its process record could not be read \(\w+\): Stop it to end that run on purpose/.test(String(w8.st.error))),
    '⑧ (a-start) r5291: a Start on a live job whose record cannot be read is refused WITH the way out (Stop it, then start it again)', w8);
  judged(w8r.hit > 0, !!(w8r.st && /is already running$/.test(String(w8r.st.error))), 'RED — the Start as a20dcc4b9 had it (a copy): only «already running»', w8r);
  // (b) THE WAY OUT: a person's Stop of a live run whose record cannot be read ends it on purpose; a Start then goes on
  const wayOut = async (JM) => {
    const w = setup8('stamp-stop', ALIVE()), { jm } = engine(JM, w.dir);
    const asked = []; jm._spawn = (job, trig) => { asked.push(trig); }; jm._startAfter = (job, why) => { asked.push(why); return Promise.resolve(); };
    jm.init(); quiet(jm);
    let askOver = 0; jm._vaultAskOver = () => { askOver++; };   // r5291's should: the approval card's close, counted
    const j = jm.jobs.get(w.id), run = j.runs[j.runs.length - 1];
    refused.add(w.pidF);
    const s = jm.stop(j);
    await until(() => !(jm._unreadStops && jm._unreadStops.has(run)) && (!run.endedAt || !!run.doubtOver), 'the way-out Stop\'s forward made and its end recorded (or no such stop began)');
    const st = jm.start(j);
    refused.delete(w.pidF);
    const out = { s, ended: !!run.endedAt, cause: run.cause || null, doubtOver: !!run.doubtOver, start: st, asked: asked.slice(), askOver, hit: hitsOf(w.pidF) };
    end(jm); return out;
  };
  const b8 = await wayOut(JobManager), b8r = await wayOut(TipStop), b8a = await wayOut(TipAskOver);
  judged(b8.hit > 0, !!(b8.s && b8.s.ok && /could not be read/.test(String(b8.s.words)) && /nothing was signalled from that record/.test(String(b8.s.words)) && b8.ended && b8.cause === 'interrupted' && b8.doubtOver && !(b8.start && b8.start.error)),
    '⑧ (b) THE WAY OUT: a person\'s Stop of a live run whose record cannot be read ENDS it on purpose (nothing signalled from the record; the doubt\'s own stop ends its doubt) — a Start then goes on', b8);
  judged(b8r.hit > 0, !!(!b8r.ended && b8r.start && /is already running/.test(String(b8r.start.error))), 'RED — the tip\'s stop (a copy): the run never ends and every Start says «already running» — the person is WEDGED', b8r);
  judged(b8.hit > 0 && b8a.hit > 0, !!(b8.askOver === 1 && b8a.ended && b8a.askOver === 0), '⑧ (b) r5291: the way out closes the job\'s approval card ONCE, after the forward, as the ordinary Stop does — RED as a20dcc4b9 had it (a copy): the run ended, the card left open', { now: b8.askOver, then: b8a.askOver });
  // (b2) r5238 LAW 6 — THE FORWARD FIRST: the way out signals what carries the job's mark, THEN records, says and saves the run's end.
  // The plant: a made-up process (a fresh stand-in) the walk names as carrying the mark; the hub test placed (this suite's process is
  // no hub: B-2c5c's own suites judge that test). The witness: the signal reached it — what the run's record and the journal said THEN
  const forwardFirst = async (JM) => {
    const w = setup8('stamp-order', ALIVE()), { jm, logs } = engine(JM, w.dir);
    jm._spawn = () => { }; jm._startAfter = () => Promise.resolve();
    jm.init(); quiet(jm);
    const j = jm.jobs.get(w.id), run = j.runs[j.runs.length - 1];
    const mk = liveKid(), id = { pid: mk.pid, starttime: PI.starttimeOf(mk.pid), bootId: PI.bootIdOf() };
    let walked = 0; jm._walkMarked = async () => { walked++; return Object.assign([id], { scan: {} }); }; jm._hubTest = () => () => false;
    const said = () => logs.filter((l) => l.includes('stopped by its owner while its process record could not be read')).length;
    const seen = [], realSig = PI.signalIdentity;
    PI.signalIdentity = function (who, sig, ...r) { if (who && Number(who.pid) === mk.pid) seen.push({ sig, ended: !!run.endedAt, said: said() }); return realSig.call(this, who, sig, ...r); };
    refused.add(w.pidF);
    let s = null;
    try { s = jm.stop(j); await until(() => seen.length > 0 && !(jm._unreadStops && jm._unreadStops.has(run)), 'the marked process signalled and the forward made', 3000); }
    finally { PI.signalIdentity = realSig; refused.delete(w.pidF); }
    const out = { s, walked, seen: seen.slice(), ended: !!run.endedAt, said: said(), hit: hitsOf(w.pidF) };
    end(jm); return out;
  };
  const o8 = await forwardFirst(JobManager), o8r = await forwardFirst(TipOrder);
  judged(o8.hit > 0 && o8.walked > 0 && o8.seen.length > 0, !!(o8.s && o8.s.ok && o8.seen[0].sig === 'SIGTERM' && !o8.seen[0].ended && o8.seen[0].said === 0 && o8.ended && o8.said === 1),
    '⑧ (b2) r5238 law 6: the way out SIGNALS what carries the job\'s mark first — at the signal the run is not yet ended and nothing is said; its end is recorded and said ONCE after', o8);
  judged(o8r.hit > 0 && o8r.walked > 0 && o8r.seen.length > 0, !!(o8r.seen[0].ended && o8r.seen[0].said === 1), 'RED — the way out as first built (a copy): the run\'s end recorded and said BEFORE the signal', o8r);
  // (b3) r5238 LAW 6 — A STOP's ROAD READS THE RECORD NO MORE THAN BEFORE THE UNIT: the way-out question's one read is the answer the
  // signal takes (the ordinary road of a live run with a readable record). The plant: a fresh stand-in as the live wrapper; the witness:
  // the read counter of its pid.json inside the Stop
  const stopReads = async (JM) => {
    const mk = liveKid(), live = () => ({ pid: mk.pid, starttime: PI.starttimeOf(mk.pid), bootId: PI.bootIdOf() });
    const w = setup8('stamp-reads', live()), { jm } = engine(JM, w.dir);
    jm._spawn = () => { }; jm._startAfter = () => Promise.resolve();
    jm.init(); quiet(jm);
    const j = jm.jobs.get(w.id), run = j.runs[j.runs.length - 1];
    const before = asked.get(w.pidF) || 0, s = jm.stop(j), reads = (asked.get(w.pidF) || 0) - before;
    const out = { s: s && { ok: s.ok, hadProc: s.hadProc }, live: !run.endedAt, reads };
    end(jm); return out;
  };
  const r8 = await stopReads(JobManager), r8r = await stopReads(TipTwice);
  judged(r8r.reads > 0 && r8.reads > 0, !!(r8.s && r8.s.ok && r8.s.hadProc && r8.reads === r8r.reads - 1),
    '⑧ (b3) r5238 law 6: a live job\'s Stop reads its process record ONE time fewer than the unit as first built — the way-out question\'s read is the one the signal takes', { now: r8, first: r8r });
  judged(r8r.reads > 0, !!(r8r.reads === r8.reads + 1), 'RED — the unit as first built (a copy): the Stop reads the record once more before its signal', r8r);
  // (b4) A START PRESSED WHILE THE WAY OUT's FORWARD RUNS is remembered and done once the run has ended (B-cac2's road, as during a
  // stop's grace) — never «already running». The plant: the walk HELD (a placed hold, opened by the leg); the witness: the walk was asked
  const startDuring = async (JM) => {
    const w = setup8('stamp-start', ALIVE()), { jm, logs } = engine(JM, w.dir);
    jm._spawn = () => { }; jm._startAfter = () => Promise.resolve();
    jm.init(); quiet(jm);
    const j = jm.jobs.get(w.id), run = j.runs[j.runs.length - 1];
    let open = () => { }, walked = 0; const gate = new Promise((r) => { open = r; });
    jm._walkMarked = async () => { walked++; await gate; return Object.assign([], { scan: {} }); }; jm._hubTest = () => () => false;
    refused.add(w.pidF);
    let st = null, endedAtPress = null;
    try {
      jm.stop(j); await until(() => walked > 0, 'the way out reached its walk', 2000);
      endedAtPress = !!run.endedAt; st = jm.start(j); open();
      await until(() => !!run.endedAt, 'the way-out Stop\'s end recorded', 3000);
      if (st && st.pending) await until(() => logs.some((l) => l.includes('the start asked during its stop')), 'the remembered start done', 2000);
    } finally { open(); refused.delete(w.pidF); }
    const out = { walked, endedAtPress, st, ended: !!run.endedAt, done: logs.filter((l) => l.includes('the start asked during its stop')), hit: hitsOf(w.pidF) };
    end(jm); return out;
  };
  const p8 = await startDuring(JobManager), p8r = await startDuring(TipPending);
  judged(p8.hit > 0 && p8.walked > 0, !!(p8.endedAtPress === false && p8.st && p8.st.ok && p8.st.pending && /still stopping/.test(String(p8.st.words)) && p8.ended && p8.done.length === 1 && /started$/.test(p8.done[0])),
    '⑧ (b4) a Start pressed while the way out\'s forward runs is REMEMBERED («still stopping») and done once the run has ended — never «already running»', p8);
  judged(p8r.hit > 0 && p8r.walked > 0, !!(p8r.st && /is already running/.test(String(p8r.st.error)) && p8r.done.length === 0), 'RED — the unit as first built (a copy): that Start answers «already running» and nothing starts after', p8r);
  // (c) A CRON's ONE-RUN-AT-A-TIME FIRE beside its child whose record cannot be read
  const fire = async (JM) => {
    const cron = { id: 'jb-c1c2c3c4', kind: 'cron', name: 'made-up schedule', state: 'scheduled', desiredUp: true, schedule: { everyMs: 3600e3 }, action: { type: 'spawn-task', task: { cmd: { argv: ['true'] } } }, owner: {}, access: ACC, runs: [], createdAt: T8 };
    const child = { id: 'jb-c5c6c7c8', kind: 'task', name: 'made-up schedule run', cronParent: cron.id, state: 'up', owner: {}, access: ACC, runs: [{ startedAt: T8, trigger: 'cron' }], createdAt: T8 };
    const w = setup8('stamp-fire', ALIVE(), [child, cron]); refused.add(w.pidF);
    const { jm, logs } = engine(JM, w.dir);
    const asked = []; jm._spawn = (job, trig) => { asked.push(trig); }; jm._startAfter = (job, why) => { asked.push(why); return Promise.resolve(); };
    jm.init(); quiet(jm);
    const c = jm.jobs.get(cron.id);
    try { jm._fireCron(c, 'test'); } catch (e) { asked.push('threw: ' + e.message); }
    try { jm._fireCron(c, 'test'); } catch { }
    refused.delete(w.pidF);
    const out = { asked: asked.slice(), said: logs.filter((l) => /a fire skipped: its run jb-c5c6c7c8's process record could not be read/.test(l)).length, hit: hitsOf(w.pidF) };
    end(jm); return out;
  };
  const c8 = await fire(JobManager), c8r = await fire(TipFire);
  judged(c8.hit > 0, !!(c8.asked.length === 0 && c8.said === 1), '⑧ (c) a cron\'s fire beside its child whose record cannot be read: passed over, said ONCE a run (two fires), nothing started', c8);
  judged(c8r.hit > 0, !!(c8r.asked.length >= 1), 'RED — the tip\'s fire (a copy): the unknown record is «not alive» — a second run asked beside it', c8r);
  // (d) A REMOVAL of a job whose live run's record cannot be read
  const rmScene = async (JM) => {
    const w = setup8('stamp-rm', ALIVE()), { jm } = engine(JM, w.dir);
    jm.init(); quiet(jm);
    const j = jm.jobs.get(w.id); refused.add(w.pidF);
    const r1 = jm.rm(j), kept = jm.jobs.has(w.id);
    const r2 = kept ? jm.rm(j, { orphan: true }) : null, gone = !jm.jobs.has(w.id);
    refused.delete(w.pidF);
    const out = { r1, kept, r2, gone, hit: hitsOf(w.pidF) };
    end(jm); return out;
  };
  const d8b = await rmScene(JobManager), d8br = await rmScene(TipRm);
  judged(d8b.hit > 0, !!(d8b.r1 && /process record could not be read/.test(String(d8b.r1.error)) && /vibespace-job stop jb-7a8b9c0d/.test(String(d8b.r1.error)) && /--orphan/.test(String(d8b.r1.error)) && !/kill|pid \d|rm -/.test(String(d8b.r1.error)) && d8b.kept && d8b.gone),
    '⑧ (d) a removal while its live run\'s record cannot be read is REFUSED with the way out (a person\'s Stop, or --orphan) — never an end by a number or a file; --orphan goes', d8b);
  judged(d8br.hit > 0, !!(!d8br.kept), 'RED — the tip\'s removal (a copy): the record goes at once, its live process tracked nowhere', d8br);
  // (e) the collapse of old cron children and (f) the archive: an unknown record KEEPS the record (pins: both read through _stampAnswer)
  const J8 = realRead.call(fs, path.join(ROOT, 'src/jobs.js'), 'utf8');
  ok(J8.includes("        { const sa = this._stampAnswer(old); if (sa.state === 'unknown' || this._verifyAlive(sa.stamp)) continue; }") && J8.includes("      { const sa = this._stampAnswer(job); if (sa.state === 'unknown' || this._verifyAlive(sa.stamp)) continue; }"),
    '⑧ (e)(f) PINS: the collapse of old cron children and the archive keep a record whose run\'s process record cannot be read');
}

// ⑨ r5074's SMALLS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑨ r5074: the single take-back, a deleted entry\'s stops, the end card — under a held lock');
{
  const MJ9 = mutantCopies('jobs-side-files-smalls', ROOT);
  const DOOR_SRC = realRead.call(fs, path.join(ROOT, 'src/server/vault-job-door.js'), 'utf8');
  const TipRevoke = MJ9.load('src/server/vault-job-door.js', anchored(DOOR_SRC, "    if (jm && typeof jm.lockHeldWords === 'function' && jm.lockHeldWords()) return { ok: false, code: 'records-unread', words: jm.lockHeldWords() };   // B-f276 (主开发 r5074 (1))", "    /* MUTANT: the tip — no guard */ if (false) return null;   // B-f276 (主开发 r5074 (1))", 'r5074 (1): the single take-back with no guard (the tip)'), 'revoke-no-guard');
  const HELD = 'Background Work\'s lock (made up for the leg) could not be read (EIO)';
  const standIn = (held, jobs = new Map()) => ({ lockHeldWords: () => (held ? HELD : null), jobs, vaultEntryGone: () => true, vaultRevoked: () => true });
  const doorOf = (D, logs) => D.create({ vault: { state: () => 'unlocked', secretNames: () => [], secretGet: () => ({ ok: false }), noteUse() { }, blocked: () => false, onUnlock() { }, audit() { } }, grants: () => ({ rowsFor: () => [], onChange() { } }), log: (l) => logs.push(l) });
  const ROW = 'secrets:made-up-key#secret', JOB = 'jb-0d1e2f30';
  { const logs = [], door = doorOf(VDOOR, logs); const eng = standIn(true); door.bindJobs(eng);
    const rv = door.revoke(ROW, JOB);
    const g = door.entryGone(ROW), owedSaid = logs.filter((l) => l.includes(`the entry made-up-key`) || l.includes('stopped once it reads')).length;
    const again = door.afterLift(), owedAgain = logs.filter((l) => l.includes('stopped once it reads')).length;   // still held: owed again
    eng.lockHeldWords = () => null; const lifted = door.afterLift(), owedAfter = door.afterLift();
    judged(!!eng, !!(rv && rv.ok === false && rv.code === 'records-unread' && rv.words === HELD), '⑨ r5074 (1): the take-back of ONE job\'s use while the lock is held answers the hold by name — nothing written, the job not left running unstopped by a write', rv);
    ok(g === 0 && owedSaid >= 1 && again === 0 && owedAgain >= 2 && lifted === 0 && owedAfter === 0, '⑨ r5074 (1): a deleted entry while the lock is held OWES its jobs\' stop — said, kept owed while held, done at the lift (afterLift) once, then nothing owed', { g, owedSaid, again, owedAgain, lifted, owedAfter }); }
  { const logs = [], door = doorOf(TipRevoke, logs); door.bindJobs(standIn(true)); const rv = door.revoke(ROW, JOB);
    judged(true, !!(rv && rv.code !== 'records-unread'), 'RED — the tip\'s door (a copy): the take-back under a held lock goes on as if the job could be looked up', rv); }
  const EPS = require(path.join(ROOT, 'src/server/end-proposals.js')), EPC = require(path.join(ROOT, 'src/end-proposal.js'));
  const EP_SRC = realRead.call(fs, path.join(ROOT, 'src/server/end-proposals.js'), 'utf8');
  const TipOwner = MJ9.load('src/server/end-proposals.js', anchored(EP_SRC, "    if (held) return { held };\n", '', 'r5074 (2): the owner reader with no hold (the tip)'), 'owner-no-hold');
  const heldJm = { lockHeldWords: () => HELD, jobs: new Map() };
  const own = EPS.jobOwnerReader({ getJobs: () => heldJm, sessions: () => [], addressableId: () => null })('jb-0d1e2f30'), ownTip = TipOwner.jobOwnerReader({ getJobs: () => heldJm, sessions: () => [], addressableId: () => null })('jb-0d1e2f30');
  const words = typeof EPC.answerText === 'function' ? EPC.answerText({ failed: [{ key: 'claude:conv-a', name: 'a conversation', failed: 'jobs_unread', why: HELD }] }) : '';
  ok(!!(own && own.held === HELD && /jobs_unread: Background Work's lock \(made up for the leg\) could not be read/.test(String(words))), '⑨ r5074 (2): the end card\'s owner reader answers a held engine BY ITS WORDS (never «no owner»), and the press\'s answer names the hold', { own, words });
  judged(true, !!(ownTip === null), 'RED — the tip\'s owner reader (a copy): a held engine reads as «no owner» — a press with wake ticks dropped them without a word', ownTip);
  for (const r of copiesCensus(MJ9.files, MJ9.dir, ROOT, { minCopies: 2, label: 'side-files smalls ' })) ok(r.pass, r.name, r.detail);
}
for (const r of copiesCensus(MJD.files, MJD.dir, ROOT, { minCopies: 1, label: 'side-files door ' })) ok(r.pass, r.name, r.detail);
for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 15, label: 'side-files ' })) ok(r.pass, r.name, r.detail);
if (skipped) { console.log(counts.fail ? `\n${counts.fail} FAILED (${counts.pass} passed; ${skipped} SKIPPED: named above)` : `\n${counts.pass} passed, ${skipped} SKIPPED: the plants named above were never read — not ALL PASS`); process.exit(counts.fail ? 1 : 0); }
report();
