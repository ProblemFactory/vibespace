#!/usr/bin/env node
// THE MEMORY BOUND OF A BACKGROUND JOB (lane jobs-memory-bound, F6 of B-7f9e, 2026-10-26) — the FAST half: PURE rows and the real
// engine IN-PROCESS over hand-written run records; NOTHING is spawned (no child_process here — the engine's _spawn records the
// start). A fleet pod's cgroup has memory.oom.group=1: ONE process past the container's limit kills the WHOLE pod, the hub with
// it (the forensics of 2026-10-27: 638 restarts in 74 h). The legs that spawn REAL scopes and processes are HEAVY by the tier
// rule (B-f4cb): scripts/test-jobs-memory-scopes.mjs (acceptance round 6 split them out).
//   §1 PURE  THE LADDER (a job's own › the owner's setting, 0 = unbounded › the cluster's env › 4096; a stored value under
//            the floor held AT it), the size verdict (an agent never 0; 512k is refused by name, never «unbounded»), the
//            rung record, the named end's words — the server's and the card's; the properties field (the exact value,
//            and a Set that changes nothing writes nothing); THE INSTANCE'S CAP (round 3) and WHICH limit (round 4); the
//            RECORD's words (round 5) and what a run LEFT — a task's stopped, a service's kept; round 6: what LEFT the group
//            (said, not stopped), what the record names past its bound, and WHEN what a service kept was stopped
//   §1b PURE the wrapper's judges (data/bin/job-wrapper.js, required with no ctl dir): an allocation refused at the bound,
//            keyed on the CODE first, then the words of every node the hub runs; the manager's version; a scope's end
//   §2 PURE  THE PARK LAW and THE BOOT'S JUDGE (and the base's arithmetic as the control)
//   §3 IN-PROCESS (a fake cgroup tree through the engine's `cgroupRoot` seam; a busy threadpool = a read / write of it held)
//            ⑩ ONE JUDGE PER RUN END — five overlapping ticks over a held read judge one ended run once; ⑮ A REAP THAT DID
//            NOT FINISH IS ALWAYS RETRIED — the boot's, a replay's wait — and one that never answers is said once; ⑯ two
//            outcomes, two words (a scope gone is not a kernel without cgroup.kill); ⑰ a pass waits ONE read (judged first,
//            the deferred reaps retried at once); ⑱ an OOM the exit record names beats a stop pressed after it; ⑲ a kill
//            timer belongs to its run; ROUND 7: ㉚ the ladder is driven every tick (a timed-out task's wedged wrapper); ㉛ a
//            reap only for a wrapper proven gone; ㉜ one deadline a reap (the waits counted, no clock); ㉝ three causes, three
//            words; ㉞ nothing stopped is never «stopped at»; the cap as the engine states it (uncapped or capped — run both)
//   §6       the doors where the job is — and the one road of the park law (src/jobs.js counts every end in ONE place)
// RED on 6428c67e (the base): no rung, no named end, no park. RED on 0259f1ea / 8a2727c8 / 222f7f5d / b8d2a3a0: see the lane's
// report (rounds 1–5). RED on ef0012b5 (round 5): the boot's reap past its read's bound is dropped (⑮), a gone scope is said
// «no cgroup.kill» (⑯), a pass awaits each scope in series (⑰), a stop after the exit record erases its OOM (⑱), a stop's kill
// timer SIGKILLs the next run and labels it (⑲), the «kept» words outlive the clearing (§1). RED on 336761e5 (round 6): the
// timeout's step armed once — [SIGTERM, scope], «up» for ever (㉚); a live service's scope killed blind at a boot that could not
// read its pid.json (㉛); a retry pass waits two bounds (㉜); «did not answer» for a refused kill and for survivors (㉝);
// «stopped at» for what had already ended (㉞); the advice twice on the card (§1).
// Load: none — no process is started; scratch dataDirs under os.tmpdir(), removed at the end.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require('../src/job-model.js');
const { JobManager } = require('../src/jobs.js');
const L = await import(new URL('../src/lib/jobs-layout.js', import.meta.url));
// the wrapper's PURE judges: a require() with no ctl dir on argv (an older wrapper has none — and would exit: not required)
const WRAPPER_SRC = fs.readFileSync(path.join(REPO, 'data/bin/job-wrapper.js'), 'utf8');
const JW = (() => { if (!/module\.exports = \{ allocationRefused/.test(WRAPPER_SRC)) return {}; const argv = process.argv.splice(2); try { return require('../data/bin/job-wrapper.js'); } finally { process.argv.push(...argv); } })();
let pass = 0, fail = 0, skip = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 25) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(step); } return false; };
const read = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { return ''; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const fn = (name) => (typeof M[name] === 'function' ? M[name] : () => ({})); // the base has none of these: its rows go RED, never a throw
const LF = (name) => (typeof L[name] === 'function' ? L[name] : () => '');
const WF = (name) => (typeof JW[name] === 'function' ? JW[name] : () => ({}));
const act = (E, m, ...a) => (typeof E[m] === 'function' ? E[m](...a) : {}); // an engine door the base lacks answers nothing
const MiB = 1024 * 1024;

console.log('§1 PURE — THE LADDER, the size verdict, the rung record, the named end, the properties field');
{
  const of = fn('memoryMbOf');
  const rows = [
    ['nothing set ⇒ 4096 (the default)', of({}, {}), { mb: 4096, source: 'default' }],
    ['the cluster\'s env (a string) ⇒ its value', of({}, { cluster: '2048' }), { mb: 2048, source: 'cluster' }],
    ['the cluster\'s 0 is NOT unbounded (never the default) ⇒ 4096', of({}, { cluster: '0' }), { mb: 4096, source: 'default' }],
    ['the owner\'s setting over the cluster\'s', of({}, { setting: 8192, cluster: '2048' }), { mb: 8192, source: 'setting' }],
    ['the owner\'s explicit 0 = unbounded', of({}, { setting: 0, cluster: '2048' }), { mb: 0, source: 'setting' }],
    ['a job\'s own over every default', of({ memoryMb: 512 }, { setting: 8192, cluster: '2048' }), { mb: 512, source: 'job' }],
    ['an unset setting (undefined) falls through', of({}, { setting: undefined }), { mb: 4096, source: 'default' }],
    ['a broken value (NaN / negative) falls through', of({ memoryMb: -1 }, { setting: NaN, cluster: 'x' }), { mb: 4096, source: 'default' }],
    ['a stored value under the floor is held AT it (a job\'s 100, a setting\'s 100, a cluster\'s 64 ⇒ 256 — never unbounded)', [of({ memoryMb: 100 }, {}), of({}, { setting: 100 }), of({}, { cluster: '64' })], [{ mb: 256, source: 'job' }, { mb: 256, source: 'setting' }, { mb: 256, source: 'cluster' }]],
  ];
  for (const [n, got, want] of rows) ok(JSON.stringify(got) === JSON.stringify(want), `ladder: ${n}`, got);
  // THE INSTANCE'S CAP (round 3): the hub keeps max(1 GiB, 25 %) of the instance's own memory.max; a job may have the rest
  const capOf = fn('instanceCapOf');
  ok(JSON.stringify(capOf(8192)) === JSON.stringify({ limitMb: 8192, hubMb: 2048, capMb: 6144 }) && capOf(32768).capMb === 24576 && capOf(2048).hubMb === 1024 && capOf(2048).capMb === 1024 && capOf(1024).capMb === 256 && capOf(null) === null && capOf(0) === null,
    'the instance\'s cap: 8 GiB keeps the hub 2 GiB (25 %) ⇒ 6 GiB for a job; 32 GiB ⇒ 24 GiB; 2 GiB keeps 1 GiB (the floor of the share) ⇒ 1 GiB; 1 GiB ⇒ the 256 MB floor; no limit ⇒ no cap', [capOf(8192), capOf(2048), capOf(1024)]);
  const big = of({ memoryMb: 16384 }, { instanceMb: 8192 });
  ok(JSON.stringify(big) === JSON.stringify({ mb: 6144, source: 'job', askedMb: 16384, cap: { limitMb: 8192, hubMb: 2048 } }), 'the effective bound: a 16 GB job on an 8 GiB instance ⇒ 6 GiB, both numbers and the cap said (8a2727c8: 16 GB — the pod dies first)', big);
  ok(JSON.stringify(of({ memoryMb: 4096 }, { instanceMb: 8192 })) === JSON.stringify({ mb: 4096, source: 'job' }) && of({ memoryMb: 16384 }, { instanceMb: null }).mb === 16384 && of({}, { setting: 8192 }).mb === 8192,
    'a bound under the cap is untouched; a host with no memory.max caps nothing');
  const zero = of({}, { setting: 0, instanceMb: 8192 });
  ok(zero.mb === 6144 && zero.askedMb === 0 && zero.cap && zero.cap.limitMb === 8192, 'the owner\'s 0 (unbounded) on an 8 GiB instance ⇒ 6 GiB, capped and said — unbounded is no bound at all where the container dies first', zero);
  const v = fn('memoryValueVerdict');
  ok(v('8G').mb === 8192 && v('512M').mb === 512 && v('1.5g').mb === 1536 && v('4096').mb === 4096 && v(2048).mb === 2048 && v('8GB').mb === 8192 && v('2GiB').mb === 2048, 'size: 8G · 512M · 1.5g · 4096 (MB) · 8GB · 2GiB read as MB');
  ok(v('0').ok === false && /owner/.test(v('0').error || '') && v('0', { byUser: true }).ok === true && v('0', { byUser: true }).mb === 0, 'size: 0 (unbounded) is the user\'s alone — an agent is refused by name');
  ok(v('100M').ok === false && v('lots').ok === false && v('-1G').ok === false && /not a size/.test(v('lots').error || ''), 'size: under 256 MB, words, a negative — refused, said');
  const k512 = v('512k', { byUser: true }), m01 = v('0.1M', { byUser: true }), half = v(0.5, { byUser: true });
  ok(k512.ok === false && /at least 256 MB/.test(k512.error || '') && m01.ok === false && /at least 256 MB/.test(m01.error || '') && half.ok === false, 'size: «512k» (0.5 MB) is refused BY NAME («at least 256 MB») even for the owner — never rounded to 0 = unbounded (0259f1ea: unbounded)', { k512, m01 });
  ok(v('off', { byUser: true }).ok === true && v('off', { byUser: true }).mb === 0 && v('off').ok === false && /owner/.test(v('off').error || ''), 'size: «off» = unbounded, typed as such by the owner; an agent\'s «off» is refused like its 0');
  const br = fn('boundRecord');
  ok(JSON.stringify(br({ mb: 4096, by: 'cgroup', why: 'scope' })) === JSON.stringify({ mb: 4096, by: 'cgroup', why: 'scope' }) && br({ by: 'teleport' }).by === 'none' && /did not say/.test(br({}).why || ''), 'the rung record: {mb, by, why}; an unknown rung is `none`, said');
  const w = fn('memoryEndWhat');
  ok(w({ cause: 'oom-bound', memoryBound: { mb: 4096 } }) === 'stopped: used more than 4 GB' && /ran out of memory/.test(w({ cause: 'oom' })) && w({ cause: 'error' }) === '', 'the journal\'s named end: «stopped: used more than 4 GB» · the instance\'s OOM · nothing for another end');
  const t = (k, p) => (p ? k.replace(/\{(\w+)\}/g, (_, x) => p[x]) : k);
  const chip = LF('memoryChip'), ends = LF('memoryEndWords');
  ok(chip({ state: 'up', memoryMb: 4096, memoryBound: { mb: 4096, by: 'cgroup' } }, t) === '4 GB · cgroup' && chip({ state: 'up', memoryMb: 4096, memoryBound: { mb: 4096, by: 'rlimit-data' } }, t) === '4 GB · rlimit'
    && chip({ state: 'up', memoryMb: 4096, memoryBound: { mb: 4096, by: 'none', why: 'no rung' } }, t) === 'unbounded — this host cannot enforce a bound' && chip({ state: 'down', memoryMb: 0 }, t) === 'unbounded — set by the owner' && chip({ state: 'down' }, t) === '',
  'the card\'s chip: «4 GB · cgroup» / «4 GB · rlimit» / «unbounded — this host cannot enforce a bound» / the owner\'s 0 / nothing from an older hub');
  const capChip = chip({ state: 'up', memoryMb: 6144, memoryAskedMb: 16384, memoryCap: { limitMb: 8192, hubMb: 2048 }, memoryBound: { mb: 6144, by: 'rlimit-data', cap: { limitMb: 8192, hubMb: 2048 } } }, t);
  ok(capChip === '6 GB · rlimit · capped by the instance’s 8 GB limit' && chip({ state: 'down', memoryMb: 6144, memoryCap: { limitMb: 8192, hubMb: 2048 }, memoryBound: { mb: 6144, by: 'cgroup' } }, t) === '6 GB · cgroup · capped by the instance’s 8 GB limit', 'the card\'s chip says the cap: «6 GB · rlimit · capped by the instance’s 8 GB limit»', capChip);
  ok(ends({ run: { cause: 'oom-bound' }, memoryBound: { mb: 256 } }, t) === 'stopped: used more than 256 MB' && ends({ parkedFor: 'memory', run: { cause: 'oom-bound' } }, t) === 'parked: out of memory twice — raise its bound or fix the job'
    && ends({ run: { cause: 'oom' } }, t) === 'killed: the instance ran out of memory' && ends({ run: { cause: 'ok' } }, t) === '', 'the card\'s named end: the bound, the park first, the instance\'s OOM, nothing else');
  // the properties field shows the STORED bound exactly; Set without a change writes nothing (0259f1ea: 1500 MB showed «1.5GB»
  // and Set wrote 1536 back)
  const field = LF('memoryFieldValue'), setv = LF('memorySetValue');
  const own = (mb) => ({ memorySource: 'job', memoryMb: mb });
  ok(field(own(1500)) === '1500M' && field(own(1536)) === '1536M' && field(own(4096)) === '4G' && field(own(0)) === '0' && field({ memorySource: 'setting', memoryMb: 8192 }) === '', 'the field: the job\'s own bound exactly — «1500M», «1536M», «4G», «0»; empty when it follows the ladder', [field(own(1500)), field(own(1536)), field(own(4096))]);
  ok(setv(own(1500), ' 1500M ') === null && setv({ memorySource: 'default', memoryMb: 4096 }, '') === null && setv(own(1500), '2G') === '2G' && setv(own(1500), '') === 'inherit', 'Set: the field unchanged ⇒ nothing is written (null); a new size is written; emptied ⇒ back to the ladder');
  // ROUND 4 — the field shows the STORED (asked) value, never the effective one a cap lowered it to; the effective bound and the
  // limit stand beside it, read-only; Set compares with the stored value only (222f7f5d: a stored 16G showed «6G», a stored 0
  // «6G», and typing 6G wrote nothing)
  const capd = { memorySource: 'job', memoryMb: 6144, memoryAskedMb: 16384, memoryCap: { limitMb: 8192, hubMb: 2048, of: 'instance' } }, capd0 = { ...capd, memoryAskedMb: 0 };
  ok(field(capd) === '16G' && field(capd0) === '0' && setv(capd, '6G') === '6G' && setv(capd, '16G') === null && setv(capd0, '0') === null, 'the field under the cap: a stored 16G shows «16G», a stored 0 «0» — never the effective 6G; typing 6G writes 6G; the stored value again writes nothing (222f7f5d: «6G», «6G», 6G wrote nothing)', [field(capd), field(capd0), setv(capd, '6G')]);
  const effw = LF('memoryEffectiveWords');
  ok(effw(capd, t) === 'effective 6 GB · the instance’s limit 8 GB' && effw({ ...capd, memoryMb: 24576, memoryCap: { limitMb: 32768, hubMb: 8192, of: 'user slice' } }, t) === 'effective 24 GB · the user slice’s limit 32 GB' && effw({ ...capd, memoryCap: { limitMb: 8192, hubMb: 2048, of: 'vibespace.service' } }, t) === 'effective 6 GB · vibespace.service’s limit 8 GB' && effw(own(4096), t) === '',
    'beside the field, read-only: «effective 6 GB · the instance’s limit 8 GB» (the user slice’s, a unit’s by its name); nothing when nothing lowers it', effw(capd, t));
  // ROUND 4 — WHICH limit capped: the one that CONTAINS the job, named by the cgroup that holds it
  const holder = fn('limitHolder'), cw = fn('capWords');
  ok(holder('/') === 'instance' && holder('') === 'instance' && holder('/user.slice') === 'user slice' && holder('/user.slice/user-1000.slice') === 'user slice' && holder('/user.slice/user-1000.slice/user@1000.service/app.slice/vibespace.service') === 'vibespace.service' && holder('/kubepods.slice/kubepods-burstable.slice') === 'kubepods-burstable.slice',
    'which limit: «/» (a container\'s own root) is the instance; user.slice / user-<uid>.slice the user slice; any other cgroup by its name', [holder('/'), holder('/user.slice/user-1000.slice'), holder('/a/vibespace.service')]);
  const named = of({ memoryMb: 49152 }, { instanceMb: 32768, instanceOf: 'user slice' });
  ok(named.mb === 24576 && named.cap && named.cap.of === 'user slice' && cw(named.cap) === "the user slice's 32 GB limit" && cw({ limitMb: 8192 }) === "the instance's 8 GB limit" && cw({ limitMb: 8192, of: 'vibespace.service' }) === "vibespace.service's 8 GB limit",
    'the cap says which limit: a 48 GB job under a 32 GiB user slice ⇒ 24 GiB, «the user slice\'s 32 GB limit» (the journal\'s and the CLI\'s words)', named);
  const brc = fn('boundRecord')({ mb: 24576, by: 'cgroup', why: 'scope', confirmed: true, cap: { limitMb: 32768, hubMb: 8192, cgroup: '/user.slice' } });
  ok(brc.cap && brc.cap.of === 'user slice' && brc.cap.limitMb === 32768 && brc.cap.hubMb === 8192, 'the rung record carries the cap its proof read off the scope, named by its cgroup', brc);
  ok(chip({ state: 'up', memoryMb: 4096, memoryBound: { mb: 24576, by: 'cgroup', cap: { limitMb: 32768, hubMb: 8192, of: 'user slice' } } }, t) === '24 GB · cgroup · capped by the user slice’s 32 GB limit'
    && chip({ state: 'down', memoryMb: 6144, memoryCap: { limitMb: 8192, hubMb: 2048, of: 'vibespace.service' }, memoryBound: { mb: 6144, by: 'rlimit-data' } }, t) === '6 GB · rlimit · capped by vibespace.service’s 8 GB limit'
    && chip({ state: 'up', memoryMb: 6144, memoryCap: { limitMb: 8192, hubMb: 2048 }, memoryBound: { mb: 16384, by: 'cgroup' } }, t) === '16 GB · cgroup',
  'the chip names the limit that contains the job — a live run\'s own proof («24 GB · cgroup · capped by the user slice’s 32 GB limit»; a scope the hub\'s limit does not contain: «16 GB · cgroup»), an idle job\'s next run (a unit by its name)');
  // ROUND 5 — the RECORD's words (an unbounded scope is never «a cgroup at 0 MB»), what a run's job LEFT (the ruling: a task's
  // stopped and said, a service's kept), the card's words for both
  const bw = fn('boundWords');
  ok(bw({ by: 'cgroup', mb: 0, why: 'scope' }) === 'unbounded (the owner set 0) · in its own scope' && bw({ by: 'cgroup', mb: 6144 }) === 'held by a cgroup at 6 GB' && bw({ by: 'rlimit-data', mb: 512 }) === 'held by RLIMIT_DATA at 512 MB' && bw({ by: 'none', mb: 4096, why: 'no prlimit here' }) === 'unbounded — no prlimit here',
    'the rung in the RECORD\'s words: an unbounded scope (the owner\'s 0, nothing it shares limited) reads «unbounded (the owner set 0) · in its own scope», never «a cgroup at 0 MB»', [bw({ by: 'cgroup', mb: 0 }), bw({ by: 'cgroup', mb: 6144 })]);
  const lw = fn('leftWords'), lr = fn('leftRecord'), ew = fn('runEndWords');
  ok(lw({ n: 1 }) === 'the job left 1 process running — it was stopped; to keep a daemon, run it as a service job' && lw({ n: 3, force: true }) === 'the job left 3 processes running — they were stopped by force; to keep a daemon, run it as a service job' && lw({ n: 2, kept: true }) === 'it left 2 processes running — kept: a service\'s own until it is stopped or started again',
    'what a run LEFT, said (the ruling): a task\'s «the job left 1 process running — it was stopped; to keep a daemon, run it as a service job» (by force past the grace), a service\'s «kept»', [lw({ n: 1 }), lw({ n: 2, kept: true })]);
  ok(JSON.stringify(lr({ n: 2, kept: true, pids: [[123, 456], ['x', 1], [1, 2]], boot: 'b' })) === JSON.stringify({ n: 2, kept: true, pids: [[123, 456]], boot: 'b' }) && lr({ n: 0 }) === null && lr('junk') === null && JSON.stringify(lr({ n: 1, force: true, kept: false })) === '{"n":1,"force":true}',
    'exit.json `left`, sanitized: a count, kept or forced, a kept job\'s processes by identity (pid, start) where no scope holds them — junk is none');
  ok(typeof JW.leftWords === 'function' && [{ n: 1 }, { n: 2, force: true }, { n: 4, kept: true }].every((l) => WF('leftWords')(l) === lw(l)), 'the job\'s own log line says it in the SAME words (the wrapper\'s twin of the model\'s, pinned)');
  ok(ew({ left: { n: 1 }, forced: 'stopped by force: x' }) === lw({ n: 1 }) && ew({ forced: 'stopped by force: x' }) === 'stopped by force: x' && ew({}) === '', 'a run\'s end words (`show` / `poll`, the journal): what it left, else a kill we made, else none');
  const rlw = LF('runLeftWords');
  ok(rlw({ left: { n: 1 } }, t) === 'left 1 running — stopped; to keep a daemon, run it as a service job' && rlw({ left: { n: 2, force: true } }, t) === 'left 2 running — stopped by force; to keep a daemon, run it as a service job' && rlw({ left: { n: 1, kept: true } }, t) === 'left 1 running — kept: the service’s until it stops or starts again' && rlw({}, t) === '',
    'the card says it beside the state and in the run\'s row (a task\'s stopped, a service\'s kept)');
  const unb = chip({ state: 'up', memoryMb: 6144, memoryCap: { limitMb: 8192, hubMb: 2048 }, memoryBound: { mb: 0, by: 'cgroup' } }, t);
  ok(unb === 'unbounded (the owner set 0) · in its own scope', 'the chip of a live unbounded scope: «unbounded (the owner set 0) · in its own scope» (never the next run\'s capped ladder)', unb);
  // ROUND 6 — a task's process that LEFT its group (setsid: beyond a rung without a scope) is said, not stopped; what the record
  // names past its bound (64); once the engine stopped what a service kept, WHEN — never «kept» once they are gone (ef0012b5:
  // the card and show / poll said «kept» after the stop that stopped them)
  const at = new Date(2026, 9, 27, 14, 5).getTime();
  ok(lw({ n: 0, escaped: 1 }) === '1 process left its group — not stopped; run it as a service job' && lw({ n: 2, escaped: 1 }) === 'the job left 2 processes running — they were stopped; 1 process left its group — not stopped; run it as a service job'
    && lw({ n: 70, kept: true, pids: [[2, 1]], recorded: 64 }) === "it left 70 processes running — kept: a service's own until it is stopped or started again (64 of 70 recorded)" && lw({ n: 3, kept: true, escaped: 1 }) === "it left 3 processes running — kept: a service's own until it is stopped or started again (1 outside its group)"
    && lw({ n: 1, kept: true, cleared: at }) === 'it left 1 process running — stopped at 14:05',
  'round 6 words: what left its group «1 process left its group — not stopped; run it as a service job»; «(64 of 70 recorded)»; once stopped, «it left 1 process running — stopped at 14:05»', [lw({ n: 0, escaped: 1 }), lw({ n: 1, kept: true, cleared: at })]);
  ok(ew({ left: { n: 1, kept: true, cleared: at } }) === 'it left 1 process running — stopped at 14:05' && rlw({ left: { n: 1, kept: true, cleared: at } }, t) === 'left 1 running — stopped at 14:05'
    && rlw({ left: { n: 0, escaped: 2 } }, t) === '2 left its group — not stopped; run it as a service job' && rlw({ left: { n: 1, escaped: 1 } }, t) === 'left 1 running — stopped · 1 left its group — not stopped; run it as a service job',
  'after the stop that stopped what a service kept, `show` / `poll` and the card say WHEN — never «kept» (ef0012b5: «left 1 running — kept…» until the next run); what left the group is said on the card', [ew({ left: { n: 1, kept: true, cleared: at } }), rlw({ left: { n: 1, kept: true, cleared: at } }, t)]);
  ok(JSON.stringify(lr({ n: 0, escaped: 2 })) === '{"n":0,"escaped":2}' && lr({ n: 0 }) === null && JSON.stringify(lr({ n: 70, kept: true, pids: [[123, 4]], recorded: 64, cleared: at })) === JSON.stringify({ n: 70, kept: true, pids: [[123, 4]], boot: '', recorded: 64, cleared: at }) && !('cleared' in (lr({ n: 1, force: true, cleared: at }) || {})) && !('recorded' in (lr({ n: 2, kept: true, recorded: 1 }) || {})),
    'exit.json `left`, sanitized: an escapee-only record; the rows it names of more; WHEN a stopped service\'s were stopped (a kept record\'s only); a `recorded` with no rows is none');
  ok(typeof JW.leftWords === 'function' && [{ n: 0, escaped: 1 }, { n: 2, force: true, escaped: 3 }, { n: 70, kept: true, pids: [[2, 1]], recorded: 64, escaped: 2 }, { n: 1, kept: true, cleared: at }, { n: 2, kept: true, gone: at }].every((l) => WF('leftWords')(l) === lw(l)), 'round 6: the job\'s own log line says the new words the SAME way (the twins, pinned over every new shape — round 7: «had already ended» too)');
  // ROUND 7 — the card says «run it as a service job» ONCE beside what left the group (336761e5: twice); what a service kept that
  // had already ended on its own is said so — never «stopped at» (nothing was signalled)
  const once = rlw({ left: { n: 2, force: true, escaped: 1 } }, t);
  ok(once === 'left 2 running — stopped by force · 1 left its group — not stopped; run it as a service job' && once.split('run it as a service job').length === 2 && lw({ n: 2, force: true, escaped: 1 }).split('run it as a service job').length === 2,
    `round 7: the advice ONCE on the card — «${once}» (336761e5: «…; to keep a daemon, run it as a service job · …; run it as a service job»)`, once);
  ok(lw({ n: 1, kept: true, gone: at }) === 'it left 1 process running — it had already ended by 14:05' && lw({ n: 2, kept: true, gone: at }) === 'it left 2 processes running — they had already ended by 14:05' && rlw({ left: { n: 1, kept: true, gone: at } }, t) === 'left 1 running — had already ended by 14:05'
    && lr({ n: 1, kept: true, pids: [[2, 1]], gone: at }).gone === at && !lr({ n: 1, kept: true, pids: [[2, 1]], cleared: at, gone: at }).gone,
    'round 7: what had already ended on its own — «it left 1 process running — it had already ended by 14:05» (show / poll, the card); the record keeps `gone`, never beside `cleared`', [lw({ n: 1, kept: true, gone: at }), rlw({ left: { n: 1, kept: true, gone: at } }, t)]);
  // the words exist in every language the card speaks (the i18n tables carry each key)
  const keys = ['stopped: used more than {size}', 'parked: out of memory twice — raise its bound or fix the job', 'killed: the instance ran out of memory', 'unbounded — this host cannot enforce a bound', '{name}: parked — out of memory twice. Raise its bound or fix the job, then start it again', 'Memory bound of a background job (MB)', 'capped by the instance’s {size} limit',
    'capped by the user slice’s {size} limit', 'capped by {name}’s {size} limit', 'effective {size}', 'the instance’s limit {size}', 'the user slice’s limit {size}', '{name}’s limit {size}',
    'unbounded (the owner set 0) · in its own scope', 'left {n} running — stopped; to keep a daemon, run it as a service job', 'left {n} running — stopped by force; to keep a daemon, run it as a service job', 'left {n} running — kept: the service’s until it stops or starts again',
    'left {n} running — stopped at {time}', '{n} left its group — not stopped; run it as a service job'];
  for (const lang of ['zh', 'ja']) { const src = read(`src/lib/i18n-${lang}.js`); const miss = keys.filter((k) => !src.includes(JSON.stringify(k) + ':')); ok(!miss.length, `the named end, the park and the setting speak ${lang}`, miss); }
}

console.log('§1b PURE — the wrapper\'s judges: a refused allocation (the CODE first, then every node\'s words), the manager\'s version, a scope\'s end');
{
  const refused = WF('allocationRefused');
  // the job's last words under RLIMIT_DATA, MEASURED 2026-10-27 (Buffer.allocUnsafe past a 1 GB bound, uncaught) — one per
  // wording of every node the hub runs (/usr/bin/node 22.22.1, the nvm 24.12.0 and 24.22.1)
  const N24_22 = "    at evalTypeScript (node:internal/process/execution:295:3) {\n  code: 'ERR_MEMORY_ALLOCATION_FAILED'\n}\n\nNode.js v24.22.1\n";
  const N24_22_MSG = 'RangeError: Failed to allocate memory\n    at createUnsafeBuffer (node:internal/buffer:1113:25)\n    at allocate (node:buffer:493:10)\n';
  const N22 = 'RangeError: Array buffer allocation failed\n    at createUnsafeBuffer (node:internal/buffer:1089:25)\n    at allocate (node:buffer:448:10)\n\nNode.js v22.22.1\n';
  const N24_12 = 'RangeError: Array buffer allocation failed\n    at new ArrayBuffer (<anonymous>)\n    at new Uint8Array (<anonymous>)\n\nNode.js v24.12.0\n';
  const fixtures = [
    ['node 24.22 — the CODE (its print ends in the error\'s props)', N24_22, 'code ERR_MEMORY_ALLOCATION_FAILED'],
    ['node 24.22 — its words alone («Failed to allocate memory», a caught and re-said error)', N24_22_MSG, '«Failed to allocate memory»'],
    ['node 22.22', N22, '«Array buffer allocation failed»'],
    ['node 24.12', N24_12, '«Array buffer allocation failed»'],
    ['V8\'s heap', 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n', '«JavaScript heap out of memory»'],
    ['a syscall\'s ENOMEM', "Error: spawn ENOMEM\n    at ChildProcess.spawn (node:internal/child_process:420:11) {\n  errno: -12,\n  code: 'ENOMEM'\n}\n", 'code ENOMEM'],
    ['Python', 'Traceback (most recent call last):\n  File "<string>", line 1, in <module>\nMemoryError\n', '«MemoryError»'],
    ['C++', "terminate called after throwing an instance of 'std::bad_alloc'\n  what():  std::bad_alloc\n", '«std::bad_alloc»'],
    ['Go', 'fatal error: runtime: out of memory\n', '«runtime: out of memory»'],
    ['Rust', 'memory allocation of 1073741824 bytes failed\n', '«memory allocation of 1073741824 bytes failed»'],
    ['a JVM', 'Exception in thread "main" java.lang.OutOfMemoryError: Java heap space\n', '«OutOfMemoryError»'],
    ['NOT one: a name that does not resolve', 'Error: getaddrinfo ENOTFOUND db.internal\n', ''],
    ['NOT one: a line about memory', 'memory: 512 MB in use, all good\nexit 1\n', ''],
  ];
  for (const [n, text, want] of fixtures) { const got = refused(text); ok(got === want, `refused allocation: ${n} ⇒ ${want || 'none'}`, got); }
  const ver = WF('systemdMajor');
  ok(ver('259.5-0ubuntu3.4') === 259 && ver('systemd 249 (249.11-0ubuntu3.12)') === 249 && ver('252.33-1~deb12u1') === 252 && ver('') === 0 && ver(null) === 0, 'the manager\'s version: «259.5-0ubuntu3.4» (show -p Version) · «systemd 249 (…)» (--version) · nothing ⇒ 0 (OOMPolicy= only from 253)');
  const byResult = WF('scopeResultEnd');
  ok(byResult('oom-kill', 256 * MiB, 256).cause === 'oom-bound' && byResult('oom-kill', 100 * MiB, 256).cause === 'oom' && JSON.stringify(byResult('success', 0, 256)) === '{}', 'a scope ≥ 253: Result oom-kill at its bound ⇒ oom-bound; well below it ⇒ the host\'s oom; success ⇒ nothing');
  ok(byResult('oom-kill', 300 * MiB, 0).cause === 'oom', 'a scope with no bound of its own (the owner\'s 0, nothing containing it) killed by the kernel ⇒ the host\'s oom, never its «bound» (222f7f5d: oom-bound)');
  const wcap = WF('capOf'), rule = { minMb: M.MEMORY.minMb, hubShareMinMb: M.MEMORY.hubShareMinMb, hubShareRatio: M.MEMORY.hubShareRatio };
  ok([1024, 2048, 3000, 8192, 32768, 1048576].every((l) => JSON.stringify(wcap(l, rule)) === JSON.stringify(M.instanceCapOf(l))) && wcap(0, rule) === null && wcap(8192, null) === null, 'the cap\'s arithmetic: the wrapper\'s copy (its numbers handed in by the server) equals the model\'s instanceCapOf, limit for limit');
  const sharedA = WF('sharedAncestors');
  ok(JSON.stringify(sharedA('/user.slice/user-1000.slice/user@1000.service/app.slice/vibespace-job-x.scope', '/user.slice/user-1000.slice/user@1000.service/app.slice/vibespace.service')) === JSON.stringify(['/user.slice/user-1000.slice/user@1000.service/app.slice', '/user.slice/user-1000.slice/user@1000.service', '/user.slice/user-1000.slice', '/user.slice', '/']) && JSON.stringify(sharedA('/a/b.scope', '/')) === JSON.stringify(['/']),
    'what a scope SHARES with the hub: the common ancestors (app.slice up to «/») — never the hub\'s own unit');
  const byEvents = WF('scopeEventsEnd'), e = (oom, oomKill) => ({ oom, oomKill, oomGroupKill: 0 });
  ok(byEvents(e(0, 0), e(1, 1)).cause === 'oom-bound' && /memory\.events/.test(byEvents(e(0, 0), e(1, 1)).how || '') && byEvents(e(0, 0), e(0, 1)).cause === 'oom' && JSON.stringify(byEvents(e(0, 0), e(3, 0))) === '{}' && JSON.stringify(byEvents(null, e(1, 1))) === '{}', 'a scope < 253: its own memory.events — oom_kill with its own oom ⇒ oom-bound; oom_kill alone ⇒ the host\'s; no kill or nothing read ⇒ nothing');
}

console.log('§2 PURE — THE PARK LAW, THE BOOT\'S JUDGE (and the base\'s arithmetic as the control)');
{
  const on = fn('onMemoryEnd');
  const walk = (causes) => { let sup = { consecutiveFails: 0, parkedAt: null }, parkedAt = null; for (const [i, c] of causes.entries()) { const r = on(sup, c, 1000 + i); sup = r.supervise || sup; if (r.park && parkedAt === null) parkedAt = i; } return { parkedAt, sup }; };
  ok(walk(['oom-bound', 'oom-bound']).parkedAt === 1 && walk(['oom-bound', 'oom-bound']).sup.parkedFor === 'memory', 'two oom-bound ends in a row ⇒ parked at the second, by name (parkedFor memory)');
  ok(walk(['oom', 'oom-bound']).parkedAt === 1, 'an `oom` (a kill from outside) counts like its own bound');
  ok(walk(['oom-bound', 'ok', 'oom-bound', 'error', 'oom-bound']).parkedAt === null, 'any other end resets the count — never parked for ends that were not in a row');
  ok(walk(['oom', 'env-restart', 'oom']).parkedAt === null, 'an env-restart resets it too — OOM / restart / OOM is not two in a row');
  ok(walk(['oom' /* the boot's judge */, 'oom-bound' /* the replayed run, judged live */]).parkedAt === 1, 'a BOOT\'s judged end counts exactly like a run\'s (the replay is the second end ⇒ parked)');
  // CONTROL — the base's only law: onServiceExit parks after 6 FAST fails (uptime < 60 s); a job that grows for minutes, then
  // takes the pod down, is restarted forever (and a boot that finds no exit record never calls it at all)
  let sup = { consecutiveFails: 0, parkedAt: null }, basePark = false;
  for (let i = 0; i < 10; i++) { const d = M.onServiceExit({ desiredUp: true, supervise: sup }, { uptimeMs: 5 * 60e3, now: i }); sup = d.supervise; basePark = basePark || !!d.park; }
  ok(basePark === false, 'CONTROL: the base\'s arithmetic never parks a service that dies of memory after five minutes, ten times running');
  const judge = (...a) => { try { return fn('bootEndCause')(...a); } catch (e) { return { threw: e.message }; } }; // an older judge's options may throw on a second argument
  // the reviewer's scenario: an 8 GB pod, 7.4 GB in use (3.6 GB of it page cache), a healthy 3.8 GB service, a rolling update
  // — no OOM kill. The sample carries the round-1 fields too (jobMb / usedMb), so 0259f1ea's judge sees what it saw.
  const roll = { at: 9, cgId: 'b:7', oomKillAtStart: 0, oomGroupKillAtStart: 0, jobAnonMb: 3891, anonMb: 4199, fileMb: 3379, usedMb: 7578, limitMb: 8192, jobMb: 3891 };
  const rv = judge(roll, { cgId: 'b:7', oomKill: 0, oomGroupKill: 0 });
  ok(rv.cause === 'env-restart' && /no OOM kill/.test(rv.why || '') && rv.usedMb === 7578 && rv.anonMb === 4199, 'boot judge: the reviewer\'s rolling update (8 GB limit, 7.4 GB used — 3.6 GB of it cache — a 3.8 GB service, no OOM kill) ⇒ env-restart, its reasoning in the record (0259f1ea: oom, counted)', rv);
  const real = judge(roll, { cgId: 'b:7', oomKill: 0, oomGroupKill: 1 });
  ok(real.cause === 'oom' && real.oomKills === 1 && real.jobAnonMb === 3891 && /held 3891 of its 4199 MB of anon/.test(real.why || ''), 'boot judge: the SAME cgroup\'s oom_group_kill rose and the job held most of its anon ⇒ `oom`, both numbers in the record', real);
  ok(judge(roll, { cgId: 'b:8', oomKill: 0, oomGroupKill: 5 }).cause === 'env-restart' && /new container/.test(judge(roll, { cgId: 'b:8', oomGroupKill: 5 }).why || ''), 'boot judge: another cgroup (a new container) — its count is not this run\'s ⇒ env-restart');
  ok(judge({ ...roll, jobAnonMb: 300 }, { cgId: 'b:7', oomGroupKill: 1 }).cause === 'env-restart', 'boot judge: an OOM kill, but the job held 300 of 4199 MB anon (an innocent beside the runaway) ⇒ env-restart');
  ok(judge(null, null).cause === 'env-restart' && judge(null, { cgId: 'b:7', oomGroupKill: 9 }).cause === 'env-restart', 'boot judge: no sample (the instance never near its limit in anon) ⇒ env-restart (the base\'s word)');
}


// ── §3 IN-PROCESS — the real engine over scratch dataDirs and hand-written run records; NOTHING is spawned (its _spawn records
// the start instead — this file imports no child_process); a scope is a FAKE cgroup tree (the engine's `cgroupRoot` seam: its
// cgroup.procs and cgroup.kill regular files, a write to cgroup.kill empties cgroup.procs as the kernel would), and a busy
// threadpool is a read / write of THAT tree held back (FAULTS below). The legs are independent and run at once.
const said = [], logs = [], engines = [], dirs = [];
const owner = { conversation: { backend: 'claude', id: 'conv-M' }, sessionId: 'sess-M', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
const tmp = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); dirs.push(d); return d; };
const NO_LIMIT = (() => { const d = tmp('vs-jobs-mem-nolimit-'); fs.writeFileSync(path.join(d, 'memory.max'), 'max\n'); return d; })();
const BOOT = (() => { try { return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(); } catch { return ''; } })();
// a pid no process can have (past pid_max): a wrapper that is gone, without starting one to watch it die
const DEAD = (() => { try { return Number(fs.readFileSync('/proc/sys/kernel/pid_max', 'utf8').trim()) + 1; } catch { return 4194305; } })();
const engine = (dir, extra = {}, before = () => { }) => {
  const E = new JobManager({ dataDir: dir, broadcast: () => { }, notifyUser: (n) => said.push(n), log: (...a) => logs.push(a.join(' ')), memoryUnitPrefix: 'jobs-memory-bound-fast', memoryLimitDir: NO_LIMIT, ...extra });
  E.spawned = [];
  E._spawn = (job, trigger) => { E.spawned.push({ id: job.id, trigger }); job.runs.push({ startedAt: Date.now(), trigger, log: '' }); job.state = 'starting'; }; // never a process: the start, recorded
  before(E); // a stub the boot itself must meet
  E.init();
  for (const t of E._timers) clearInterval(t); // the suite drives the sweep itself
  E._timers = []; engines.push(E);
  return E;
};
const stopEngine = (E) => { for (const j of E.jobs.values()) j.desiredUp = false; E.shutdown(); };
const journal = (E, j, re) => E.events.some((e) => e.jobId === j.id && re.test(e.what || ''));
const lastRun = (j) => j.runs[j.runs.length - 1] || {};
// THE FAKE KERNEL: one shim over fs.promises for every leg — a path under a registered fault is read late / never, written
// late / never, or vanishes once read; a write to a fake cgroup.kill empties its cgroup.procs (every process killed)
const FAULTS = new Map(), realRead = fs.promises.readFile, realWrite = fs.promises.writeFile;
const faultOf = (p) => { for (const [k, f] of FAULTS) if (String(p).includes(k)) return f; return null; };
const never = () => new Promise(() => { });
fs.promises.readFile = function (p, ...a) {
  const f = faultOf(p);
  if (f && f.onRead) f.onRead(p);
  const go = () => realRead.call(fs.promises, p, ...a).finally(() => { if (f) f.readAt = f.readAt || Date.now(); }).then((v) => { if (f && f.vanish && String(p).endsWith('cgroup.procs')) fs.rmSync(path.dirname(String(p)), { recursive: true, force: true }); return v; });
  return f && f.readHang ? never() : f && f.readMs ? sleep(f.readMs).then(go) : go();
};
fs.promises.writeFile = function (p, ...a) {
  const f = faultOf(p);
  const go = () => realWrite.call(fs.promises, p, ...a).then((v) => { if (String(p).endsWith('cgroup.kill') && FAULTS.has(path.basename(path.dirname(String(p)))) && !(f && f.survive)) fs.writeFileSync(path.join(path.dirname(String(p)), 'cgroup.procs'), ''); return v; });
  return f && f.writeHang ? never() : f && f.writeGate ? f.writeGate.then(go) : f && f.writeMs ? sleep(f.writeMs).then(go) : go();
};
// a scope of the fake tree: <root>/fake.slice/<unit>, holding `pids` (never a real process: past pid_max), with a cgroup.kill
// unless `nokill` (a kernel before 5.14); its bound.json names it the way a wrapper's does
const fakeScope = (root, name, { pids = [DEAD + 1], nokill = false } = {}) => {
  const unit = `jobs-memory-bound-fast-${name}-${process.pid}.scope`, dir = path.join(root, 'fake.slice', unit);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'cgroup.procs'), pids.map((p) => `${p}\n`).join(''));
  if (!nokill) fs.writeFileSync(path.join(dir, 'cgroup.kill'), '');
  FAULTS.set(unit, {});
  return { unit, dir, cgroup: `/fake.slice/${unit}`, procs: () => { try { return fs.readFileSync(path.join(dir, 'cgroup.procs'), 'utf8').split('\n').filter(Boolean); } catch { return []; } } };
};
// a run a hub left behind, written by hand: its wrapper gone (a pid past pid_max), its bound naming a scope (or none)
const deadJob = (dir, id, { kind = 'task', scope = null, exit = null, state = 'up', desiredUp = true, restart = 'never', extra = {} } = {}) => {
  const startedAt = Date.now() - 60000, ctl = path.join(dir, 'job-logs', id, String(startedAt));
  fs.mkdirSync(ctl, { recursive: true });
  fs.writeFileSync(path.join(ctl, 'pid.json'), JSON.stringify({ pid: DEAD, starttime: 1, bootId: BOOT, startedAt }));
  fs.writeFileSync(path.join(ctl, 'current.log'), '');
  if (scope) fs.writeFileSync(path.join(ctl, 'bound.json'), JSON.stringify({ by: 'cgroup', mb: 256, askedMb: 256, confirmed: true, maxBytes: 256 * MiB, unit: scope.unit, cgroup: scope.cgroup }));
  if (exit) fs.writeFileSync(path.join(ctl, 'exit.json'), JSON.stringify(exit));
  return { id, name: id, kind, cmd: { argv: ['true'] }, state, desiredUp, restart, supervise: { consecutiveFails: 0, parkedAt: null }, owner, access: { view: 'group', control: 'session' }, runs: [{ startedAt, trigger: 'manual', log: path.join(ctl, 'current.log') }], createdAt: startedAt, ...extra };
};
const legs = [];
const leg = (title, body) => legs.push({ title, body, rows: [] });
// the CLI's own memLine (data/bin/vibespace-job — a file that ships alone): its lines, run over the engine's snapshot
const CLI = (() => { try { const src = read('data/bin/vibespace-job'), pick = (re) => (re.exec(src) || [''])[0]; return new Function(`${pick(/^const sizeWords = .*$/m)}\n${pick(/^const capWords = .*$/m)}\n${pick(/^function memLine\(j\) \{[\s\S]*?\n\}/m)}\nreturn { memLine };`)(); } catch { return { memLine: () => '' }; } })();

leg('§3 IN-PROCESS ⑩ ONE JUDGE PER RUN END — five overlapping ticks while a scope\'s read is slow judge one ended run ONCE (round 4: once per tick — parked after a single OOM)', async (ok) => {
  // the reviewer's df2 repro, in-process and short: a service run whose wrapper is gone, its exit record oom-bound ONCE, its
  // bound naming a scope whose cgroup.procs read answers late (a busy threadpool — THIS scope only); the read's bound is the
  // engine's seam (0.008 s for 2 s); five ticks land while the first pass waits
  const dir = tmp('vs-jobs-mem-'), root = tmp('vs-jobs-mem-cg-'), S = fakeScope(root, 'judge', { pids: [] });
  const E = engine(dir, { reapReadMs: 8, reapConfirmMs: 10, cgroupRoot: root });
  const b = { by: 'cgroup', mb: 256, askedMb: 256, confirmed: true, maxBytes: 256 * MiB, unit: S.unit, cgroup: S.cgroup };
  const job = deadJob(dir, 'jb-judge001', { kind: 'service', scope: S, restart: 'always', exit: { code: null, signal: 'SIGKILL', endedAt: Date.now(), memory: { ...b, cause: 'oom-bound', how: 'its scope was killed at MemoryMax (oom-kill)' } } });
  E.jobs.set(job.id, job);
  const f = Object.assign(FAULTS.get(S.unit), { readMs: 25, writeMs: 25 }); // its read and its kill held past their bound
  let finals = 0, judgedAt = 0;
  const fin = E._finalizeRun.bind(E);
  E._finalizeRun = (...a) => { finals++; judgedAt = judgedAt || Date.now(); return fin(...a); };
  const t0 = Date.now();
  await Promise.all([1, 2, 3, 4, 5].map(() => E._sweep()));
  await until(() => f.readAt && E._reapLater.size === 1, 500, 5); // the held read answers; the reap that did not finish waits
  const readAt = f.readAt;
  Object.assign(f, { readMs: 0, writeMs: 0 });
  await E._sweep(); // a later tick (the threadpool free again): what did not finish is retried
  const sup = job.supervise || {}, judgedIn = judgedAt - t0;
  ok(finals === 1 && sup.oomEnds === 1 && !sup.parkedAt && job.state !== 'failed' && !said.some((n) => n.jobId === job.id && /parked/.test(n.text || '')), `one end, ONE judgment: five overlapping ticks ⇒ finalizeCalls ${finals}, oomEnds ${sup.oomEnds}, ${sup.parkedAt ? 'PARKED' : 'not parked'} (b8d2a3a0: one per tick — parked «out of memory twice» after a single OOM)`, { finals, sup, state: job.state });
  ok(judgedAt && judgedAt < readAt && E._reapLater instanceof Map && E._reapLater.size === 0,
    `the read past its bound never holds the judgment: judged from exit.json ${judgedIn} ms in, before the held read answered (${readAt - t0} ms); the reap that did not finish ran on a later tick`, { judgedIn, readIn: readAt - t0, reapLater: E._reapLater && E._reapLater.size });
  const before = JSON.stringify(job.supervise);
  fin(job, job.runs[0], { code: null, signal: 'SIGKILL', endedAt: Date.now(), memory: { ...b, cause: 'oom-bound' } }, 'sweep');
  ok(JSON.stringify(job.supervise) === before, 'a run already judged (endedAt) is never judged again — a second caller returns, oomEnds stays 1', job.supervise);
  // `show` / `poll` of a run an UNBOUNDED scope held (the owner's 0, nothing shared limited): the record's words
  const line = CLI.memLine(E.snapshot({ ...job, id: 'jb-judge002', memoryMb: 0, runs: [{ startedAt: Date.now(), trigger: 'manual', memoryMb: 0, memoryBound: { mb: 0, by: 'cgroup', why: 'a scope of the user systemd' } }] }));
  ok(/ · last run unbounded \(the owner set 0\) · in its own scope/.test(line) && !/0 MB/.test(line), `show / poll: «${line}» — the record's words (b8d2a3a0: «held by a cgroup at 0 MB»)`, line);
  stopEngine(E);
});

leg('§3 IN-PROCESS ⑮ A REAP THAT DID NOT FINISH IS ALWAYS RETRIED — the boot\'s, a start\'s — and one that never answers is said ONCE (ef0012b5: the boot\'s answer was dropped — an ended run\'s scope ran on for ever, unsaid)', async (ok) => {
  const dir = tmp('vs-jobs-mem-'), root = tmp('vs-jobs-mem-cg-');
  const A = fakeScope(root, 'boot-exit'), B = fakeScope(root, 'boot-noexit'), C = fakeScope(root, 'never'), D = fakeScope(root, 'replay');
  // the hub's boot meets a busy threadpool: these scopes' reads AND writes are held (past the read's bound, 0.005 s here); C's
  // never answer at all
  for (const s of [A, B]) Object.assign(FAULTS.get(s.unit), { readMs: 20, writeMs: 20 });
  let openD; Object.assign(FAULTS.get(D.unit), { readMs: 20, writeGate: new Promise((r) => { openD = r; }) }); // D's kill lands once its replay started — by state, never a race of delays (the legs run at once)
  Object.assign(FAULTS.get(C.unit), { readHang: true, writeHang: true });
  const jobs = [
    deadJob(dir, 'jb-bootexit', { scope: A, exit: { code: 0, signal: null, endedAt: Date.now() - 30000 } }), // a task judged from its exit record
    deadJob(dir, 'jb-bootnoex', { scope: B }),                                                                // a task with none: env-restart
    deadJob(dir, 'jb-bootnever', { scope: C, exit: { code: 0, signal: null, endedAt: Date.now() - 30000 } }), // a scope that never answers
    deadJob(dir, 'jb-bootrepl', { kind: 'service', scope: D }),                                               // a service the boot replays
  ];
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(jobs));
  const E = engine(dir, { reapReadMs: 5, reapConfirmMs: 10, reapTries: 3, cgroupRoot: root, memorySample: { stopMs: 5 } }); // stopMs: the replay's wait (10 s), 0.005 s
  const [a, b, c, d] = jobs.map((j) => E.jobs.get(j.id));
  await until(() => E.spawned.length === 1, 1000, 5); // the replay: past its wait, «starts anyway»
  const atSpawn = { pending: [...E._reapLater.keys()].map((r) => [a, b, c, d].find((j) => j.runs.includes(r)).id).sort(), dProcs: D.procs() };
  openD(); // the threadpool lets D's kill through — late: still ours
  ok(lastRun(a).cause === 'ok' && a.state === 'done' && lastRun(b).cause === 'env-restart' && E.spawned.length === 1 && E.spawned[0].trigger === 'boot' && journal(E, d, /its last run's scope did not answer in 0\.005 s — its next run starts anyway \(the reap is retried\)/),
    'the boot judges what it finds (done; env-restart) without its reads; the replay waits out its bound, then starts — said', { a: lastRun(a).cause, b: lastRun(b).cause, spawned: E.spawned });
  ok(JSON.stringify(atSpawn.pending) === JSON.stringify(['jb-bootexit', 'jb-bootnever', 'jb-bootnoex', 'jb-bootrepl']), `every reap that did not finish ENQUEUED ITSELF — the boot's, and the one the replay waited on: ${atSpawn.pending.join(', ') || 'none'} (ef0012b5: none — the boot's answers dropped, the replay's given up)`, atSpawn);
  await until(() => [a, b, d].every((j) => j.runs[0]._reap && j.runs[0]._reap.killed), 500, 5); // the held kills land (late — still ours)
  for (const s of [A, B, D]) Object.assign(FAULTS.get(s.unit), { readMs: 0, writeMs: 0 }); // the threadpool is free again
  await E._sweep(); // a later tick, whatever the jobs' states (done, interrupted, up)
  const W1 = 'stopped by force: its wrapper was gone and its scope did not answer a read in 0.005 s — its scope was killed';
  ok([A, B, D].every((s) => !s.procs().length) && [a, b, d].every((j) => j.runs[0].forced === W1 && journal(E, j, new RegExp(W1))),
    `the next tick finishes them — the scopes empty (each one's kill, written blind past the read's bound, landed late: still OURS, said), each run says «${W1}» (ef0012b5: [${atSpawn.dProcs.join(' ')}] kept running, nothing said)`, [a, b, d].map((j) => j.runs[0].forced));
  await E._sweep(); await E._sweep(); await E._sweep(); // C never answers: tries 2, 3 — then said, dropped; a fourth tick says nothing
  const cSaid = E.events.filter((e) => e.jobId === c.id && /its scope did not answer a read in 3 tries — not reaped: systemctl --user kill --signal=KILL jobs-memory-bound-fast-never-/.test(e.what || ''));
  ok(cSaid.length === 1 && E._reapLater.size === 0 && C.procs().length === 1, `a scope that never answers is retried a bounded number of times, then said ONCE — «${(cSaid[0] || {}).what || 'nothing'}» (ef0012b5: never retried; round 5's sweep retried for ever at 2 s a pass, unsaid)`, { said: cSaid.length, pending: E._reapLater.size });
  stopEngine(E);
});

leg('§3 IN-PROCESS ⑯ TWO OUTCOMES, TWO WORDS — a scope that is gone is not a kernel without cgroup.kill', async (ok) => {
  const dir = tmp('vs-jobs-mem-'), root = tmp('vs-jobs-mem-cg-');
  const K = fakeScope(root, 'kill'), G = fakeScope(root, 'gone'), N = fakeScope(root, 'nokill', { nokill: true }), V = fakeScope(root, 'vanish');
  const E = engine(dir, { reapReadMs: 10, reapConfirmMs: 10, cgroupRoot: root });
  const sc = (s) => ({ unit: s.unit, dir: s.dir });
  fs.rmSync(G.dir, { recursive: true, force: true });
  const outs = [await E._killScope(sc(K)), await E._killScope(sc(G)), await E._killScope(sc(N))];
  ok(JSON.stringify(outs) === JSON.stringify(['killed', 'gone', 'nokill']), `_killScope: «killed» / «gone» (nothing there) / «nokill» (it holds processes, no cgroup.kill — a kernel before 5.14) — ${JSON.stringify(outs)} (ef0012b5: true / false / false)`, outs);
  // the reviewer's 1.85 s shape: the read lists the job, then it ends and its scope goes before the kill lands
  FAULTS.get(V.unit).vanish = true;
  const v = deadJob(dir, 'jb-vanish01', { scope: V, exit: { code: 0, signal: null, endedAt: Date.now() } }), n = deadJob(dir, 'jb-nokill01', { scope: N, exit: { code: 0, signal: null, endedAt: Date.now() } });
  E.jobs.set(v.id, v); E.jobs.set(n.id, n);
  await E._sweep();
  await until(() => !E._reaping || (!E._reaping.has(v.runs[0]) && !E._reaping.has(n.runs[0])), 500, 5);
  ok(!v.runs[0].forced && !E.events.some((e) => e.jobId === v.id && /cgroup\.kill/.test(e.what || '')), `a scope gone before its kill: nothing killed, nothing said (ef0012b5: «${'not killed: this kernel has no cgroup.kill'}» on a 7.0 kernel)`, v.runs[0].forced);
  ok(/^its wrapper was gone and its scope still held 1 process — not killed: this kernel has no cgroup\.kill — systemctl --user kill --signal=KILL jobs-memory-bound-fast-nokill-\d+\.scope$/.test(n.runs[0].forced || '') && N.procs().length === 1, 'a scope that holds a process on a kernel with no cgroup.kill: said so, with the line to run', n.runs[0].forced);
  stopEngine(E);
});

leg('§3 IN-PROCESS ⑰ A PASS WAITS ONE READ — the runs are judged first, the reaps go on beside them, the deferred ones retried AT ONCE (ef0012b5: in series — K hung scopes held a pass 2K s)', async (ok) => {
  const dir = tmp('vs-jobs-mem-'), root = tmp('vs-jobs-mem-cg-');
  const hung = [1, 2, 3].map((i) => fakeScope(root, `hung${i}`));
  for (const s of hung) Object.assign(FAULTS.get(s.unit), { readHang: true, writeHang: true });
  const E = engine(dir, { reapReadMs: 6, reapConfirmMs: 10, cgroupRoot: root });
  const H = hung.map((s, i) => { const j = deadJob(dir, `jb-hung0${i + 1}`, { scope: s, exit: { code: 0, signal: null, endedAt: Date.now() } }); E.jobs.set(j.id, j); return j; });
  const B = deadJob(dir, 'jb-behind1', { exit: { code: 0, signal: null, endedAt: Date.now() } }); E.jobs.set(B.id, B); // behind them, no scope
  // what the engine's own bound saw: how many runs were judged when the first read gave up; how many reads a retry pass began
  // before its first one gave up (no clock — the order of events)
  const w = E._within.bind(E), sp = E._scopeProcs.bind(E), seen = [];
  let calls = 0;
  E._within = (p, ms) => w(p, ms).then((x) => { if (x === null) seen.push({ judged: [...H, B].filter((j) => j.runs[0].endedAt).length, calls }); return x; });
  E._scopeProcs = (s) => { calls++; return sp(s); };
  await E._sweep();
  await until(() => E._reapLater.size === 3, 500, 5);
  const firstGiveUp = seen[0] || {};
  seen.length = 0; calls = 0;
  await E._sweep(); // the deferred reaps: retried
  const retryGiveUp = seen[0] || {};
  ok(firstGiveUp.judged === 4 && B.runs[0].endedAt, `judged FIRST: all ${firstGiveUp.judged} runs (the job behind three hung scopes too) were judged before the first read gave up (ef0012b5: ${'0'} — each scope's read awaited in turn)`, firstGiveUp);
  ok(retryGiveUp.calls === 3, `the deferred reaps are retried at once: ${retryGiveUp.calls} reads begun before the first gave up (ef0012b5: 1 — in series)`, retryGiveUp);
  stopEngine(E);
});

leg('§3 IN-PROCESS ⑱ THE EXIT RECORD\'S OWN WORDS WIN — an out-of-memory end it names, the owner\'s stop pressed after it, is still counted (ef0012b5: erased — interrupted)', async (ok) => {
  const dir = tmp('vs-jobs-mem-'), E = engine(dir);
  const mem = { by: 'rlimit-data', mb: 256, askedMb: 256, confirmed: true, cause: 'oom-bound', how: 'an allocation past RLIMIT_DATA was refused (its last words: «Array buffer allocation failed»)' };
  const late = deadJob(dir, 'jb-latestp1', { kind: 'service', desiredUp: false, exit: { code: 1, signal: null, endedAt: Date.now(), memory: mem } });
  const real = deadJob(dir, 'jb-realstp1', { kind: 'service', desiredUp: false, exit: { code: null, signal: 'SIGTERM', stop: 'SIGTERM', endedAt: Date.now(), memory: mem } });
  for (const j of [late, real]) { j._stopRequested = true; E.jobs.set(j.id, j); }
  await E._sweep();
  ok(late.runs[0].cause === 'oom-bound' && (late.supervise || {}).oomEnds === 1, `a stop pressed after exit.json was written (no \`stop\` in it): the OOM it names stands — ${late.runs[0].cause}, oomEnds ${(late.supervise || {}).oomEnds} (ef0012b5: interrupted, the count reset)`, { cause: late.runs[0].cause, sup: late.supervise });
  ok(real.runs[0].cause === 'interrupted' && !(real.supervise || {}).oomEnds, 'a stop the wrapper heard (`stop` in its exit record) stays a stop', { cause: real.runs[0].cause, sup: real.supervise });
  stopEngine(E);
});

leg('§3 IN-PROCESS ⑲ A KILL TIMER BELONGS TO ITS RUN — a stop\'s kill step never reaches the run started after it (ef0012b5: SIGKILLed it, «stopped by force: it did not end on SIGTERM»)', async (ok) => {
  const dir = tmp('vs-jobs-mem-'), E = engine(dir);
  const job = deadJob(dir, 'jb-timer001', { kind: 'service' }); E.jobs.set(job.id, job);
  const kills = [];
  E._killGroup = (j, sig) => { kills.push(sig); return true; }; // its group answers (no process: the signal recorded)
  E._killStepMs = () => 10; // the grace's seam (10 s, a second more on every rung)
  E.stop(job);
  const run1 = job.runs[0];
  run1.endedAt = Date.now(); run1.cause = 'interrupted'; // it ended on its SIGTERM, judged — and the owner starts it again at once
  const run2 = { startedAt: Date.now() + 1, trigger: 'manual' }; job.runs.push(run2); job.state = 'up';
  await sleep(30);
  ok(JSON.stringify(kills) === JSON.stringify(['SIGTERM']) && !job._forced, `the first stop's kill step, past its grace, reaches nothing — signals ${JSON.stringify(kills)}, no words on the new run (ef0012b5: SIGKILL to the new run's group, «stopped by force» on a run nobody stopped)`, { kills, forced: job._forced });
  stopEngine(E);
});

// ── ROUND 7 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
leg('§3 IN-PROCESS ㉚ THE LADDER IS DRIVEN EVERY TICK — a timed-out task whose wrapper is wedged after its scope\'s kill: SIGTERM, the scope, then its wrapper with its group; the run ends «timeout» (336761e5: the step armed once — [SIGTERM, scope], «up» for ever)', async (ok) => {
  const dir = tmp('vs-jobs-mem-'), root = tmp('vs-jobs-mem-cg-'), S = fakeScope(root, 'ladder');
  const E = engine(dir, { cgroupRoot: root, wedgeMs: 25 }); // WEDGE_MS 3 s, 0.025 s here
  const job = deadJob(dir, 'jb-ladder01', { scope: S, extra: { timeoutMs: 1000 } }); E.jobs.set(job.id, job); // started 60 s ago: past its time limit
  const kills = [];
  let wedged = true; // its wrapper: alive and wedged (it never writes its end) until its group is killed
  E._verifyAlive = (st) => !!st && wedged;
  E._killGroup = (j, sig) => { kills.push(`group:${sig}`); if (sig === 'SIGKILL') wedged = false; return true; };
  const ks = E._killScope.bind(E); E._killScope = (s, o) => { kills.push('scope'); return ks(s, o); };
  E._killStepMs = () => 10; // the grace's seam (10 s, a second more on every rung)
  await E._sweep();                 // its time limit: SIGTERM, once
  await sleep(15); await E._sweep(); // a step later: its scope
  await E._sweep(); await E._sweep(); // inside the wedge step: nothing more
  const before = [...kills];
  await sleep(28); await E._sweep(); // its wrapper still there 0.025 s on: with its group
  await E._sweep();                 // its wrapper gone: the run judged
  const run = job.runs[0];
  ok(before[0] === 'group:SIGTERM' && kills.filter((k) => k === 'group:SIGTERM').length === 1, `rung 1: its SIGTERM, once — ${JSON.stringify(kills)}`, kills);
  ok(JSON.stringify(before) === JSON.stringify(['group:SIGTERM', 'scope']) && !S.procs().length, `rung 2: its scope killed ONCE, a kill step after the SIGTERM — ticks inside the wedge step write nothing more (${JSON.stringify(before)})`, before);
  ok(kills[kills.length - 1] === 'group:SIGKILL' && run.cause === 'timeout' && job.state === 'failed' && /stopped by force: it did not end on SIGTERM in 10 s — its scope was killed, then its wrapper \(still there 0\.025 s later\) with its process group/.test(run.forced || ''),
    `rung 3: a wrapper still there a wedge step later is killed with its group, every tick until it is gone — the run ends «${run.cause}», «${run.forced}» (336761e5: [group:SIGTERM, scope] and «up» for ever)`, { kills, cause: run.cause, state: job.state, forced: run.forced });
  stopEngine(E);
});

leg('§3 IN-PROCESS ㉛ A REAP ONLY FOR A WRAPPER PROVEN GONE — its pid.json unreadable at a boot whose read of the scope hangs: nothing killed, said; once read alive, nothing reaped and no run beside it (336761e5: the live service\'s scope killed blind)', async (ok) => {
  const dir = tmp('vs-jobs-mem-'), root = tmp('vs-jobs-mem-cg-'), S = fakeScope(root, 'unproven');
  Object.assign(FAULTS.get(S.unit), { readHang: true }); // a busy threadpool: its read never answers
  const job = deadJob(dir, 'jb-unprov01', { kind: 'service', scope: S });
  const ctl = path.dirname(job.runs[0].log), pj = path.join(ctl, 'pid.json');
  fs.renameSync(pj, pj + '.away'); // the stamp unreadable at the boot (no /proc proof either way)
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify([job]));
  const killed = [];
  const E = engine(dir, { reapReadMs: 5, reapConfirmMs: 10, cgroupRoot: root, memorySample: { stopMs: 400 } }, (E0) => { const ks = E0._killScope.bind(E0); E0._killScope = (s, o) => { killed.push(s.unit); return ks(s, o); }; E0._killGroup = () => false; });
  const j = E.jobs.get(job.id);
  await sleep(20);
  const W = /^cannot prove its wrapper is gone \(pid\.json unreadable\) — its scope is not reaped; if it is gone: systemctl --user kill --signal=KILL jobs-memory-bound-fast-unproven-\d+\.scope$/;
  ok(!killed.length && S.procs().length === 1 && E.events.filter((e) => e.jobId === j.id && W.test(e.what || '')).length === 1, `the boot proves nothing — its scope keeps its process, no kill written, said once: «${(E.events.find((e) => e.jobId === j.id && /cannot prove/.test(e.what || '')) || {}).what || 'nothing'}» (336761e5: «its wrapper was gone and its scope did not answer a read» — killed)`, { killed, procs: S.procs() });
  const me = { ...JSON.parse(fs.readFileSync(pj + '.away', 'utf8')), pid: process.pid, starttime: Number(fs.readFileSync('/proc/self/stat', 'utf8').split(') ')[1].split(' ')[19]) };
  fs.writeFileSync(pj, JSON.stringify(me)); // read again: its wrapper RUNS (a live identity)
  await until(() => journal(E, j, /not started beside it/), 300, 5);
  ok(!killed.length && S.procs().length === 1 && !E.spawned.length && journal(E, j, /its wrapper is running after all \(its pid\.json read again\) — nothing reaped/) && journal(E, j, /^its last run's wrapper still runs \(pid \d+\) — not started beside it \(boot\)/),
    'read alive: nothing reaped and its replay never starts a run beside it — both said', { killed, spawned: E.spawned });
  stopEngine(E);
});

leg('§3 IN-PROCESS ㉜ ONE DEADLINE PER REAP — a retry pass over hung reads and kill writes waits ONE budget per reap: the kill still in flight is inspected, never awaited again (no clock: the waits counted; 336761e5: two in series — 4 s a pass at the 2 s bound)', async (ok) => {
  const dir = tmp('vs-jobs-mem-'), root = tmp('vs-jobs-mem-cg-');
  const hung = [1, 2, 3].map((i) => fakeScope(root, `deadline${i}`));
  for (const s of hung) Object.assign(FAULTS.get(s.unit), { readHang: true, writeHang: true });
  const E = engine(dir, { reapReadMs: 8, reapConfirmMs: 10, cgroupRoot: root });
  for (const [i, s] of hung.entries()) { const j = deadJob(dir, `jb-deadln${i + 1}`, { scope: s, exit: { code: 0, signal: null, endedAt: Date.now() } }); E.jobs.set(j.id, j); }
  await E._sweep();
  await until(() => E._reapLater.size === 3, 500, 5); // pass 1's reaps: each read past its bound, each kill written blind (still hung)
  const w = E._within.bind(E), waits = [];
  E._within = (p, ms) => { const rec = { ms, gaveUp: false }; waits.push(rec); return w(p, ms).then((x) => { if (x === null) rec.gaveUp = true; return x; }); };
  await E._sweep(); // the retry pass
  const gaveUp = waits.filter((x) => x.gaveUp), most = Math.max(...waits.map((x) => x.ms));
  ok(gaveUp.length === 3 && waits.length === 3 && most <= 8, `the retry pass: ${waits.length} bounded waits for 3 reaps, each within ONE budget (≤ ${most} ms of 8) — the kill in flight inspected, not awaited (336761e5: 6 — the read, then the kill again: two bounds a pass)`, waits);
  stopEngine(E);
});

leg('§3 IN-PROCESS ㉝ THREE CAUSES, THREE WORDS — a dropped reap says why: no read answered, its kill refused (the errno), processes that survived its kill (the count) (336761e5: «did not answer» for all three)', async (ok) => {
  const dir = tmp('vs-jobs-mem-'), root = tmp('vs-jobs-mem-cg-');
  const R = fakeScope(root, 'refused', { nokill: true }), V = fakeScope(root, 'survived', { pids: [DEAD + 1, DEAD + 2] });
  fs.mkdirSync(path.join(R.dir, 'cgroup.kill')); // a write to it is REFUSED (EISDIR) — its reads answer every time
  FAULTS.get(V.unit).survive = true;               // its kill lands, its processes stay (a D-state process survives cgroup.kill)
  const E = engine(dir, { reapReadMs: 40, reapConfirmMs: 20, reapTries: 2, cgroupRoot: root }); // a read answers well inside its bound (node 22 too)
  const r = deadJob(dir, 'jb-refused1', { scope: R, exit: { code: 0, signal: null, endedAt: Date.now() } }), v = deadJob(dir, 'jb-survive1', { scope: V, exit: { code: 0, signal: null, endedAt: Date.now() } });
  E.jobs.set(r.id, r); E.jobs.set(v.id, v);
  for (let i = 0; i < 4; i++) { await E._sweep(); await until(() => !E._reaping || (!E._reaping.has(r.runs[0]) && !E._reaping.has(v.runs[0])), 200, 5); }
  const said = (j) => (E.events.filter((e) => e.jobId === j.id && /not reaped/.test(e.what || '')).map((e) => e.what));
  ok(said(r).length === 1 && /^its wrapper was gone and its scope still held 1 process — its kill was refused \(EISDIR\) in 2 tries — not reaped: systemctl --user kill --signal=KILL jobs-memory-bound-fast-refused-\d+\.scope$/.test(said(r)[0]), `a refused kill: «${said(r)[0]}»`, said(r));
  ok(said(v).length === 1 && /^its wrapper was gone and 2 processes survived its kill in 2 tries — not reaped: /.test(said(v)[0]) && V.procs().length === 2, `processes that survived its kill: «${said(v)[0]}» (the unanswered read: ⑮ — «did not answer a read in 3 tries»)`, said(v));
  stopEngine(E);
});

leg('§3 IN-PROCESS ㉞ NOTHING STOPPED IS NEVER «STOPPED AT» — what a service kept had already ended on its own: said so, no `cleared`; the scan\'s bound and what it could not read are said (336761e5: «stopped at HH:MM», nothing signalled)', async (ok) => {
  const dir = tmp('vs-jobs-mem-'), E = engine(dir, { memorySample: { stopMs: 5 } });
  const j = deadJob(dir, 'jb-alreadyg', { kind: 'service', state: 'down', exit: null });
  j.runs[0].endedAt = Date.now() - 1000; j.runs[0].cause = 'ok';
  j.runs[0].left = { n: 1, kept: true, pids: [[DEAD, 12345]], boot: BOOT }; // its daemon exited on its own since its run's end
  E.jobs.set(j.id, j);
  const PI = require('../src/proc-identity.js'), real = PI.membersOf;
  PI.membersOf = () => Object.assign([], { scan: { scanned: 3000, total: 3100, unreadable: 2, cut: true } }); // the scan hit its bound
  try { E.stop(j); await until(() => j.runs[0].left.gone || j.runs[0].left.cleared, 300, 5); } finally { PI.membersOf = real; }
  const l = j.runs[0].left, snap = E.snapshot(j), card = LF('runLeftWords')({ left: snap.run.left }, (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v || {})[k]));
  ok(!l.cleared && l.gone > 0 && /^it left 1 process running — it had already ended by \d\d:\d\d$/.test(snap.run.endWords || '') && /^left 1 running — had already ended by \d\d:\d\d$/.test(card) && !E.events.some((e) => e.jobId === j.id && /^stopped what/.test(e.what || '')),
    `nothing was running: «${snap.run.endWords}» / card «${card}» — no «stopped at», no journal line claiming a stop (336761e5: «stopped at HH:MM»)`, { left: l, end: snap.run.endWords, card });
  ok(journal(E, j, /^what its last run left running had already ended — nothing stopped \(its mark searched in 3000 of 3100 processes — the scan's bound, 2 unreadable\)$/), 'the scan says its bound and what it could not read — never a silent skip', E.events.filter((e) => e.jobId === j.id).map((e) => e.what));
  ok(!E._pending(j, j.runs[0]), 'and nothing is pending for its next start');
  stopEngine(E);
});

leg('§3 IN-PROCESS — the cap as the engine states it, and the properties (the ladder\'s answer, the cap said)', async (ok) => {
  // the engine's own read, without the seam: the tightest memory.max of its cgroup and every ancestor (env.sh's scope carries
  // 24 GiB, a CI runner none) — the suite's own walk of /proc/self/cgroup
  const own = (() => { let mb = null; const rel = (fs.readFileSync('/proc/self/cgroup', 'utf8').split('\n').find((l) => l.startsWith('0::')) || '0::/').slice(3); const parts = rel.split('/').filter(Boolean);
    for (let i = parts.length; i >= 0; i--) { try { const v = fs.readFileSync(path.join('/sys/fs/cgroup', ...parts.slice(0, i), 'memory.max'), 'utf8').trim(); if (/^\d+$/.test(v)) mb = Math.min(mb === null ? Infinity : mb, Math.floor(Number(v) / MiB)); } catch { } } return mb; })();
  const H = engine(tmp('vs-jobs-mem-'), { memoryLimitDir: undefined });
  // round 5: the engine's answer AS IT STATES IT — {mb: null, of: null} on a host with no limit (b8d2a3a0's row turned the null
  // into {} through a method round 4 removed: red on every uncapped host — a CI runner, this box's plain shell)
  const hubRead = act(H, '_instanceLimit');
  ok(hubRead && hubRead.mb === own && (own === null ? hubRead.of === null : typeof hubRead.of === 'string'), `cap: the engine reads its own cgroup's tightest memory.max (here ${own === null ? 'none — no cap' : own + ' MB'})`, hubRead);
  stopEngine(H);
  const dir = tmp('vs-jobs-mem-'), lim = path.join(dir, 'instance-cgroup');
  fs.mkdirSync(lim); fs.writeFileSync(path.join(lim, 'memory.max'), String(8 * 1024 * MiB)); // a pod's own memory.max: 8 GiB
  const E = engine(dir, { memoryLimitDir: lim });
  const j = deadJob(dir, 'jb-props001', { state: 'done', extra: { memoryMb: 16384 } }); E.jobs.set(j.id, j);
  const set = act(E, 'setMemory', j, '8G'), evs = E.events.length, again = act(E, 'setMemory', j, '8192');
  ok(set.ok && set.memoryMb === 6144 && set.memoryAskedMb === 8192 && again.unchanged === true && E.events.length === evs, 'properties: 8G on an 8 GiB instance answers the effective 6 GiB (asked 8192); the same value again changes nothing and writes nothing', { set, again });
  const four = act(E, 'setMemory', j, '4G'), back = act(E, 'setMemory', j, '16G');
  ok(four.memoryMb === 4096 && !four.memoryCap && back.memoryMb === 6144 && back.memoryAskedMb === 16384 && back.memoryCap && back.memoryCap.limitMb === 8192 && E.events.some((e) => e.jobId === j.id && /capped by the instance's 8 GB limit \(asked 16 GB\)/.test(e.what || '')), 'cap: the properties / CLI take the ASKED value and answer the effective one (4G stays 4 GB; 16G ⇒ 6 GB, capped, said in the journal)', { four, back });
  ok(act(E, 'setMemory', j, 'inherit').memorySource === 'default', 'properties: «inherit» goes back to the ladder');
  stopEngine(E);
});

try {
  await Promise.all(legs.map(async (g) => {
    const rec = (c, n, e) => g.rows.push(['row', c, n, e]);
    rec.say = (line) => g.rows.push(['say', line]);
    try { await g.body(rec); } catch (e) { g.rows.push(['row', false, `${g.title.slice(0, 20)}: the leg threw`, String(e && e.stack || e).slice(0, 400)]); }
  }));
  for (const g of legs) { console.log(g.title); for (const [k, a, b, c] of g.rows) if (k === 'say') console.log(a); else ok(a, b, c); }
  console.log('§6 the doors where the job is — the CLI, the routes, the setting, the chart, the one road of the park law');
  {
    const cli = read('data/bin/vibespace-job'), wiring = read('src/server/jobs-wiring.js'), routes = read('src/agent-routes.js'), schema = read('src/lib/settings-schema.js'), chart = read('deploy/helm/vibespace-user/templates/main.yaml'), panel = read('src/lib/jobs-panel.js'), jobs = read('src/jobs.js');
    ok(/memoryMb: typeof flags\.memory === 'string' \? flags\.memory : undefined/.test(cli) && /case 'memory': \{/.test(cli) && /\[--memory 8G\]/.test(cli), 'CLI: `vibespace-job run --memory 8G` carries it, `memory <id> <size>` changes it, the usage says so');
    ok(/memoryMb: b\.memoryMb/.test(routes) && /act === 'memory'\) r = a\.jm\.setMemory\(job, req\.body\?\.value \?\? null, \{ byUser: false \}\)/.test(routes) && /act === 'memory' \|\| act === 'notify'|act === 'notify' \|\| act === 'memory'/.test(routes), 'agent routes: create carries memoryMb; `memory` is the owner conversation\'s (canEdit) and never 0');
    ok(/act === 'memory'\) r = jm\.setMemory\(job, req\.body\?\.value \?\? null, \{ byUser: true \}\)/.test(wiring) && /memoryCtx: \(\) => \(\{ setting: serverSetting\('jobs\.memoryMb'\), cluster: process\.env\.VIBESPACE_JOBS_MEMORY_MB \}\)/.test(wiring), 'jobs-wiring: the panel\'s properties set it (the user may say 0); the ladder reads the setting AS STORED and the chart\'s env');
    ok(/'jobs\.memoryMb': \{\s*\n\s*type: 'number', default: 4096, min: 0,/.test(schema), 'the setting jobs.memoryMb lives in the schema (default 4096, 0 = unbounded)');
    ok(/name: VIBESPACE_JOBS_MEMORY_MB/.test(chart) && /fetchJson\(`\/api\/jobs\/\$\{j\.id\}\/memory`/.test(panel), 'the chart renders the cluster\'s default; the card\'s properties post the bound');
    ok(/memIn\.value = memoryFieldValue\(job\);/.test(panel) && /const value = memorySetValue\(job, memIn\.value\);\s*\n\s*if \(value === null\)/.test(panel), 'the properties field shows the stored bound exactly, and an unchanged Set posts nothing');
    ok(/capped by \$\{capWords\(c\)\} \(asked \$\{asked\}; the hub keeps/.test(cli) && /capped by \$\{capWords\(r\.memoryCap\)\} \(asked/.test(cli) && /r2\.memoryCap\?\.limitMb \? ' · ' \+ memoryCapWords\(r2\.memoryCap, t\)/.test(panel) && /memoryAskedMb: r\.memoryAskedMb \?\? null, memoryCap: r\.memoryCap \|\| null/.test(wiring),
      'the cap is said where the job is, and WHICH limit: `show` / `poll` (asked, effective, the hub\'s share), `memory <id>`, the properties toast, the API\'s runs');
    ok(/memEff\.textContent = memoryEffectiveWords\(job, t\);/.test(panel) && /memRow\.append\(memLbl, memIn, memSet, memFact, memEff\);/.test(panel), 'the properties: the effective bound and its limit stand BESIDE the stored value, read-only');
    // a stop ends the JOB: the gate execs it on every rung (the < 253 keeper sits beside it, never its parent) and nothing but
    // its own rung and child is read by a proof's timer
    ok(/const GATE_KEEP = 'read -r go <&3 \|\| exit 125; \( \(trap "" TERM INT HUP; read -r ack <&3\) <\/dev\/null >\/dev\/null 2>&1 & echo "keeper \$!" >&3 \); exec "\$@" 3<&-';/.test(WRAPPER_SRC) && /const isKeeper = \(pid\) => !!keeper && Number\(pid\) === keeper\.pid/.test(WRAPPER_SRC) && !/\/cmdline`/.test(WRAPPER_SRC) && !/GATE_HOLD/.test(WRAPPER_SRC) && /r\.timer = setTimeout\(\(\) => prove\(r, c, deadline\), 10\)/.test(WRAPPER_SRC) && !/setTimeout\(\(\) => prove\(deadline\)/.test(WRAPPER_SRC),
      'the wrapper: the job is exec\'d on every rung (the < 253 keeper double-forked beside it, deaf to a stop — round 6: known by the PID its gate says, never its command line); a proof\'s timer is bound to its rung and its child');
    ok(/const hadProc = force && scope \? this\._escalate\(job, scope, undefined, run\) : force \? this\._killGroup\(job, 'SIGKILL'\) : this\._termRun\(job, run\);/.test(jobs) && /this\._escalate\(job, this\._runScope\(job, run\), undefined, run\); \/\/ round 4/.test(jobs) && /else if \(run && !this\._reapLater\.has\(run\)\) this\._reapLater\.set\(run, \{ job, tries: 0 \}\);/.test(jobs) && jobs.split("setTimeout(() => this._killGroup(job, 'SIGKILL')").length === 1,
      'src/jobs.js: every kill step goes through _escalate (the scope on the cgroup rung, whether or not its wrapper lives); a dead wrapper\'s scope is reaped — round 6: a reap that did not finish enqueues itself');
    // ROUND 6: a kill timer belongs to its run — armed for it, fired only while it runs, disarmed by the next spawn; every start
    // of a service goes through _startAfter
    ok(!jobs.includes('setTimeout(() => this._escalate(') && jobs.split('this._armKillStep(job, run, ').length === 4 && /for \(const t of job\._killSteps \|\| \[\]\) clearTimeout\(t\);/.test(jobs) && /if \(this\._runLive\(job, run\)\) this\._escalate\(job, scope, this\._graceWords\(\), run\);/.test(jobs) && /this\._startAfter\(job, 'manual', /.test(jobs) && !/prev\.left\.kept && !prev\.left\.cleared\) \{/.test(jobs),
      'src/jobs.js: a kill step is armed for its run (stop, timeout, until-marker — no bare timer left), fires only while that run runs, and the next spawn disarms it; every start of a service goes through _startAfter');
    // ROUND 5: one judge per run end (no re-entered pass, an idempotent judge); every service start awaits its predecessor;
    // a service's spec says it is one (it keeps what it leaves)
    ok(/if \(run\.endedAt\) return; \/\/ ONE JUDGE PER RUN END/.test(jobs) && /if \(this\._sweepRun\) \{/.test(jobs) && /this\._startAfter\(job, 'boot', replays\)/.test(jobs) && /this\._startAfter\(job, 'restart-policy'/.test(jobs) && /kind: job\.kind === 'service' \? 'service' : 'task'/.test(jobs) && !/this\._spawn\(job, 'boot'\)/.test(jobs) && !/this\._spawn\(job, 'restart-policy'\)/.test(jobs),
      'src/jobs.js: a run is judged once (a pass never re-entered, the judge idempotent); the boot replay and the restart policy start a service only through _startAfter; the spec names a service');
    // THE ONE ROAD: the model's park law is called in ONE place, and every end — the sweep's and the boot's, `oom` and
    // env-restart — goes through it (0259f1ea: two bookkeeping paths, the boot's env-restart in neither)
    ok(jobs.split('M.onMemoryEnd(').length === 2 && /const memPark = windowEnd \? null : this\._countEnd\(job, run\.cause\);/.test(jobs) && /const mp = ends \? this\._countEnd\(job, v\.cause\) : null;/.test(jobs) && /this\._bootNoExit\(job, run, M\.bootEndCause\(sample, sample \? this\._cgroupNow\(\) : null\)\);/.test(jobs), 'src/jobs.js: ONE call of the park law (_countEnd) — _finalizeRun and the boot\'s _bootNoExit (oom AND env-restart) both end there');
    // the wrapper's named end reads only the job's own facts: no counter of the hub's whole subtree, and OOMPolicy= only ≥ 253
    const memEnd = (/function memoryEnd\(code, signal\) \{[\s\S]*?\n\}/.exec(WRAPPER_SRC) || [''])[0];
    ok(memEnd && !/ownCg|oomKillsAtSpawn|oomKills\(\)/.test(memEnd) && !/oomKillsAtSpawn/.test(WRAPPER_SRC) && /\.\.\.\(policy \? \['-p', 'OOMPolicy=stop'\] : \[\]\)/.test(WRAPPER_SRC) && /const policy = version >= 253;/.test(WRAPPER_SRC), 'the wrapper: its named end reads no counter of the hub\'s subtree; OOMPolicy=stop only where the manager is ≥ 253');
  }
} finally {
  fs.promises.readFile = realRead; fs.promises.writeFile = realWrite;
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
}

console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped (said above)` : ''}`);
process.exit(fail ? 1 : 0);
