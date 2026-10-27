#!/usr/bin/env node
// THE MEMORY BOUND OF A BACKGROUND JOB (lane jobs-memory-bound, F6 of B-7f9e, 2026-10-26). A fleet pod's cgroup has
// memory.oom.group=1: ONE process past the container's limit kills the WHOLE pod, the hub with it (the forensics of
// 2026-10-27: 638 restarts in 74 h) — and nothing bounded a job, nor did a boot ever count a run that died with the pod.
//   §1 PURE  THE LADDER (a job's own › the owner's setting, 0 = unbounded › the cluster's env › 4096; a stored value under
//            the floor held AT it), the size verdict (an agent never 0; 512k is refused by name, never «unbounded»), the
//            rung record, the named end's words — the server's and the card's; the properties field (the exact value,
//            and a Set that changes nothing writes nothing); THE INSTANCE'S CAP (round 3): the effective bound = min(the
//            asked, the instance's memory.max less the hub's share max(1 GiB, 25 %)) — a 16 GB job on an 8 GiB pod runs at
//            6 GiB and the card says «capped by the instance’s 8 GB limit»; WHICH limit (round 4: the one that CONTAINS the
//            job — the instance, the user slice, a cgroup by name); the field shows the STORED value, the effective one beside it
//   §1b PURE the wrapper's judges (data/bin/job-wrapper.js, required with no ctl dir): an allocation refused at the bound,
//            keyed on the CODE first, then the words of every node the hub runs (a fixture per wording, measured) and
//            other runtimes'; the manager's version; a scope's end by its Result (≥ 253) or its own memory.events (< 253)
//   §2 PURE  THE PARK LAW: an `oom` / `oom-bound` end counts, ANY other resets (an env-restart too), 2 in a row park; THE
//            BOOT'S JUDGE: `oom` only when the SAME cgroup's oom_kill ROSE and the job held most of its ANON memory —
//            page cache is never pressure (the reviewer's rolling update: 8 GB limit, 7.4 GB used, 3.8 GB service ⇒
//            env-restart); the base's arithmetic as the control
//   §3 REAL  the wrapper PROVES the rung before the job runs and ENFORCES it — a tiny job past a small bound under the real
//            data/bin wrapper, spawned by the real engine: ① the cgroup rung (a scope of the user systemd, where one
//            answers — SKIP said elsewhere): 256 MB bound, a 512 MB Buffer ⇒ «stopped: used more than 256 MB»; a stop is
//            still a stop; ② the rlimit rung (forced): RLIMIT_DATA refuses ⇒ the same named end under THIS node (22 or
//            24 — the code or the words); ③ a systemd-run that refuses OOMPolicy (systemd < 253) and ④ one that never
//            answers ⇒ the job runs ONCE on the next rung, the refusal in its why; ⑤ a manager < 253 (no OOMPolicy for a
//            scope): the scope without it, the end read from the scope's own memory.events; ⑥ the instance's cap: a 16 GB
//            job on an instance whose memory.max is 8 GiB runs under RLIMIT_DATA 6 GiB, both numbers on the run; ROUND 4: ⑦ a
//            stop ENDS THE JOB — < 253, a job deaf to SIGTERM: its scope empty before the end is written, «stopped by force»;
//            a wrapper gone, its job not: the engine's step reaches the scope; ⑧ a refused rung's timer never judges the next
//            rung's child; ⑨ the cgroup rung's cap is what CONTAINS its scope (the hub's own limit does not; a user slice's does)
//   §4 REAL  the park law through the engine's own doors: a service's oom-bound end (1), its BOOT REPLAY's (2) ⇒ parked,
//            the next boot leaves it alone, the owner's start counts afresh; ⓑ oom → a restart → oom is NOT two in a row
//            (a service), ⓒ nor for a cron (fire 1 oom, fire 2 cut by a restart, fire 3 oom ⇒ still enabled)
//   §5 REAL  the boot's judge: the wrapper's anon sample (a fake cgroup), the whole group SIGKILLed (no exit.json —
//            memory.oom.group): ⓐ the instance's OOM count rose ⇒ `oom`, twice ⇒ parked; ⓑ a rolling update (no OOM kill,
//            a cgroup full of cache) ⇒ env-restart, not counted; ⓒ a SIGKILL from outside is never named an OOM off the
//            hub's whole-subtree counter
//   §6       the doors where the job is — and the one road of the park law (src/jobs.js counts every end in ONE place)
// RED on 6428c67e (the base): the job grows to 512 MB and ends `exit 0`; no rung, no named end, no park, a boot replays blind.
// RED on 0259f1ea (round 1): a refused systemd-run kills every job, by cgroup; restart resets nothing; cache is pressure;
// node 24.22's refusal is no OOM; a SIGKILL is an OOM off the hub's counter; 512k is unbounded; the field rounds.
// RED on 8a2727c8 (round 2): a 16 GB job on an 8 GiB pod is bound at 16 GB — the pod dies first.
// RED on 222f7f5d (round 3): a stop kills the < 253 holder and the job runs on (its ports held); a refused rung's timer refuses
// the next; the field shows the effective bound as if stored; a scope beside the hub is capped by the hub's own limit.
// Load: each job allocates ≤ 512 MB once (most far less, the cgroup legs stop at 256 MB), no busy loop; the real legs run at
// once (≤ ~0.6 s); scratch dataDirs under os.tmpdir(), one per leg.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  // the words exist in every language the card speaks (the i18n tables carry each key)
  const keys = ['stopped: used more than {size}', 'parked: out of memory twice — raise its bound or fix the job', 'killed: the instance ran out of memory', 'unbounded — this host cannot enforce a bound', '{name}: parked — out of memory twice. Raise its bound or fix the job, then start it again', 'Memory bound of a background job (MB)', 'capped by the instance’s {size} limit',
    'capped by the user slice’s {size} limit', 'capped by {name}’s {size} limit', 'effective {size}', 'the instance’s limit {size}', 'the user slice’s limit {size}', '{name}’s limit {size}'];
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

// ── the real engine over scratch dataDirs (one per leg), the worktree's REAL wrapper copied in (as test-jobs-engine does).
// The REAL legs are independent (a dataDir, a lock and engines of their own) and run AT ONCE; their rows print in order.
const PREFIX = 'jobs-memory-bound-test'; // every scope this suite makes is named so — and none outlives it (asserted at the end)
const said = [], logs = [], engines = [], dirs = [];
const owner = { conversation: { backend: 'claude', id: 'conv-M' }, sessionId: 'sess-M', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
const caller = { conversationId: 'conv-M', sessionId: 'sess-M', sessionCreatedAt: 1, groups: new Set() };
const scratch = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-jobs-mem-'));
  fs.mkdirSync(path.join(d, 'bin'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'data/bin/job-wrapper.js'), path.join(d, 'bin', 'job-wrapper.js'));
  dirs.push(d);
  return d;
};
// a FAKE tool in a leg's <dataDir>/bin — first on the job's PATH (the engine puts it there), so the wrapper meets it
const fake = (dir, name, body) => fs.writeFileSync(path.join(dir, 'bin', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
const realOf = (cmd) => String(spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).stdout || '').trim();
// THE INSTANCE every leg runs on unless it names its own: no memory.max (a host that caps nothing) — the suite's own cgroup
// may carry one (env.sh's scope: 24 GiB), and the cap would then lower an owner's 0; leg ⑥ names an 8 GiB instance
const NO_LIMIT = (() => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-jobs-mem-nolimit-')); fs.writeFileSync(path.join(d, 'memory.max'), 'max\n'); dirs.push(d); return d; })();
const engineIn = (dir) => (extra = {}) => {
  const E = new JobManager({ dataDir: dir, broadcast: () => { }, notifyUser: (n) => said.push(n), log: (...a) => logs.push(a.join(' ')), memoryUnitPrefix: PREFIX, memoryLimitDir: NO_LIMIT, ...extra });
  E.init();
  for (const t of E._timers) clearInterval(t); // the suite drives the sweep itself (no 5 s tick)
  E._timers = [];
  engines.push(E);
  return E;
};
const stopEngine = (E) => { for (const j of E.jobs.values()) j.desiredUp = false; E.shutdown(); }; // its backoff timers find nothing to restart
const ctlOf = (j) => path.dirname(j.runs[j.runs.length - 1].log);
// the run is over when its exit record exists AND its wrapper is gone (it writes exit.json, then exits — a sweep between the
// two sees it alive and judges nothing; the engine's own 5 s tick would judge it next)
const settle = async (E, j, ms = 8000) => { const done = await until(() => fs.existsSync(path.join(ctlOf(j), 'exit.json')) && !E._verifyAlive(E._readStamp(j)), ms, 10); await E._sweep(); return done; };
// a run is RUNNING its job once the wrapper proved the bound (bound.json confirmed — the go was said) and is alive
const running = (E, j, ms = 4000) => until(() => { const b = readJson(path.join(ctlOf(j), 'bound.json')); return b && b.confirmed && E._verifyAlive(E._readStamp(j)); }, ms, 10);
// the instance restarts under a run: its whole group SIGKILLed at once — no exit record (as under memory.oom.group)
const killGroup = async (E, j) => { const st = E._readStamp(j); try { process.kill(-st.pid, 'SIGKILL'); } catch { } return until(() => !E._verifyAlive(st), 3000, 10); };
const lastRun = (j) => j.runs[j.runs.length - 1] || {};
const NODE = process.execPath;
const GROW = 'const b=Buffer.alloc(512*1024*1024,1); console.log("survived", b.length)';                     // touches 512 MB (the cgroup legs stop it at 256)
const RESERVE = 'const a=Buffer.allocUnsafe(512*1024*1024), b=Buffer.allocUnsafe(512*1024*1024); console.log("survived", a.length + b.length)'; // maps 1 GB, touches ~0 (RLIMIT_DATA counts the mapping)
const HOLD = 'const b=Buffer.alloc(96*1024*1024,1); setInterval(()=>b[0]++, 60000)'; // ~110 MB anon, held
// RESERVE — or, while the flag file exists, sleep (a run the instance's restart cuts)
const SWITCH = (flag) => `if (require('fs').existsSync(${JSON.stringify(flag)})) setInterval(() => {}, 60000); else { ${RESERVE} }`;
const userSystemd = (() => { const r = spawnSync('systemctl', ['--user', 'show', '-p', 'ControlGroup', '--value'], { encoding: 'utf8', timeout: 3000 }); const cg = r.status === 0 ? String(r.stdout).trim() : ''; try { return cg && /\bmemory\b/.test(fs.readFileSync(`/sys/fs/cgroup${cg}/cgroup.controllers`, 'utf8')); } catch { return false; } })();
// the fake-manager legs need only a cgroup v2 root with a memory controller (the fake says the user systemd sits at «/») and prlimit
const fakeable = (() => { try { return /\bmemory\b/.test(fs.readFileSync('/sys/fs/cgroup/cgroup.controllers', 'utf8')) && !!realOf('prlimit'); } catch { return false; } })();
const FAKE_CTL_259 = 'case "$*" in\n  *"-p ControlGroup"*) echo /;;\n  *"-p Version"*) echo 259.5;;\n  *--version*) echo "systemd 259 (259.5)";;\n  *) exit 1;;\nesac';
const REFUSE_OOMPOLICY = 'for a in "$@"; do case "$a" in OOMPolicy=*) echo "Unknown assignment: $a" >&2; exit 1;; esac; done';
const fakeCgroup = (dir, { anonMb = 150, fileMb = 40, currentMb = 190, maxMb = 200 } = {}) => { // the container's cgroup as the wrapper reads it
  const cg = path.join(dir, 'fake-cgroup');
  fs.mkdirSync(cg);
  fs.writeFileSync(path.join(cg, 'memory.max'), maxMb ? String(maxMb * MiB) : 'max'); fs.writeFileSync(path.join(cg, 'memory.current'), String(currentMb * MiB));
  fs.writeFileSync(path.join(cg, 'memory.stat'), `anon ${anonMb * MiB}\nfile ${fileMb * MiB}\nkernel 1048576\n`); fs.writeFileSync(path.join(cg, 'memory.events'), 'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\noom_group_kill 0\n');
  return cg;
};
// a scope's processes NOW, read off the REAL manager by its unit (its ControlGroup) — [] once it is empty or gone; and the
// suite's own kill of a scope it made (a RED run's leftover never outlives the suite)
const CTL = realOf('systemctl') || 'systemctl';
const scopeProcs = (u) => { if (!u) return []; const r = spawnSync(CTL, ['--user', 'show', '-p', 'ControlGroup', '--value', u], { encoding: 'utf8', timeout: 3000 }); const cg = String(r.stdout || '').trim(); if (!cg) return []; try { return fs.readFileSync(`/sys/fs/cgroup${cg}/cgroup.procs`, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
const killScopeOf = (u) => { if (u && u.startsWith(PREFIX)) { spawnSync(CTL, ['--user', 'kill', '--signal=KILL', u], { timeout: 3000 }); spawnSync(CTL, ['--user', 'reset-failed', u], { timeout: 3000 }); } };
const FAKE_CTL_252 = (ctl) => `case "$*" in *"-p Version"*) echo 252.33-1~deb12u1; exit 0;; *--version*) echo "systemd 252 (252.33-1~deb12u1)"; exit 0;; esac\nexec ${ctl} "$@"`;
// the suite's OWN walk of what a scope shares with this process (independent of the wrapper's): the common ancestors
const sharedOf = (a, b) => { const pa = a.split('/').filter(Boolean), pb = b.split('/').filter(Boolean); let n = 0; while (n < pa.length && n < pb.length && pa[n] === pb[n]) n++; return Array.from({ length: n + 1 }, (_, i) => '/' + pa.slice(0, n - i).join('/')); };
const selfCgroup = (() => { try { return (fs.readFileSync('/proc/self/cgroup', 'utf8').split('\n').find((l) => l.startsWith('0::')) || '0::/').slice(3) || '/'; } catch { return '/'; } })();
const bumpGroupKill = (cg) => { const p = path.join(cg, 'memory.events'), t = fs.readFileSync(p, 'utf8'); fs.writeFileSync(p, t.replace(/^oom_group_kill (\d+)$/m, (_, n) => `oom_group_kill ${Number(n) + 1}`)); };
const legs = [];
const leg = (title, body) => legs.push({ title, body, rows: [] });

leg('§3 REAL ① the cgroup rung — proven before the job runs, the bound enforced, the end named', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the cgroup rung: no user systemd with a memory controller answers here (a fleet pod, a CI runner) — the rlimit rung (②) is this host\'s'); return; }
  const A = engineIn(scratch())();
  const r = A.create({ kind: 'task', name: 'grow', cmd: { argv: [NODE, '-e', GROW] }, memoryMb: 256, owner }, caller);
  const j = A.jobs.get(r.job && r.job.id);
  ok(!!j && lastRun(j).memoryMb === 256, 'cgroup: a job created with memory 256 runs asking 256 MB', r.error);
  // a stop is still a stop: the scope holds the job, the engine's group kill still reaches it (started beside the first)
  const r2 = A.create({ kind: 'task', name: 'sleeper', cmd: { argv: ['sleep', '30'] }, memoryMb: 256, owner }, caller);
  const j2 = A.jobs.get(r2.job && r2.job.id);
  await settle(A, j);
  const run = lastRun(j), ex = readJson(path.join(ctlOf(j), 'exit.json')) || {};
  ok(run.cause === 'oom-bound' && j.state === 'failed', `cgroup: 256 MB bound, a 512 MB Buffer ⇒ the job ends oom-bound, failed (base: grows to 512 MB, exit 0)`, { cause: run.cause, state: j.state, exit: run.exit });
  ok(run.memoryBound && run.memoryBound.by === 'cgroup' && run.memoryBound.mb === 256, 'cgroup: the run carries the rung it MEASURED — {mb 256, by cgroup, why}', run.memoryBound);
  ok(ex.memory && ex.memory.confirmed === true && ex.memory.maxBytes === 256 * MiB && /oom-kill/.test(ex.memory.how || ''), 'cgroup: the wrapper read the scope\'s memory.max (256 MiB) back off the child before the go, and the scope\'s Result oom-kill ended it', ex.memory);
  ok(A.events.some((e) => e.jobId === j.id && /stopped: used more than 256 MB/.test(e.what || '')) && logs.some((l) => l.includes(j.id) && /stopped: used more than 256 MB/.test(l)), 'cgroup: the job\'s journal and the server\'s log name the end «stopped: used more than 256 MB»');
  ok(/stopped: used more than 256 MB/.test(run.lastLine || ''), 'cgroup: the card\'s last line names it too (the wrapper\'s exit line)', run.lastLine);
  const snap = A.snapshot(j);
  ok(LF('memoryChip')(snap, (k) => k) === '256 MB · cgroup' && snap.memorySource === 'job', 'cgroup: the snapshot gives the card «256 MB · cgroup» (its own bound)', { chip: LF('memoryChip')(snap, (k) => k), src: snap.memorySource });
  ok(await until(() => { const b = readJson(path.join(ctlOf(j2), 'bound.json')); return b && b.confirmed; }, 3000, 10), 'cgroup: a running job\'s rung is confirmed while it runs (bound.json)');
  await A._sweep();
  ok(lastRun(j2).memoryBound && lastRun(j2).memoryBound.by === 'cgroup' && LF('memoryChip')(A.snapshot(j2), (k) => k) === '256 MB · cgroup', 'cgroup: the card says «256 MB · cgroup» WHILE it runs');
  A.stop(j2);
  await settle(A, j2);
  ok(lastRun(j2).cause === 'interrupted', 'cgroup: the owner\'s stop reaches the scoped job and stays a stop (never named a memory end)', lastRun(j2).cause);
  stopEngine(A);
});

leg(`§3 REAL ② the rlimit rung (forced — the pod's: no user systemd there) under THIS node (${process.version})`, async (ok) => {
  const B = engineIn(scratch())({ memoryRungs: ['rlimit-data'] });
  const r = B.create({ kind: 'task', name: 'reserve', cmd: { argv: [NODE, '-e', RESERVE] }, memoryMb: 1024, owner }, caller);
  const j = B.jobs.get(r.job && r.job.id);
  // the size the creator gave rides the run; an agent's 0 is refused at create, the user's is not (started beside the first)
  ok(/owner/.test(B.create({ kind: 'task', name: 'zero', cmd: { argv: ['true'] }, memoryMb: '0', owner }, caller).error || '') && /at least 256 MB/.test(B.create({ kind: 'task', name: 'tiny', cmd: { argv: ['true'] }, memoryMb: '512k', owner }, caller).error || ''), 'create: an agent\'s memory 0 (unbounded) and its 512k are refused by name');
  const u = B.create({ kind: 'task', name: 'user-zero', cmd: { argv: ['true'] }, memoryMb: '0', owner: { ...owner, createdBy: 'user' } }, { isUser: true, groups: new Set() });
  const ju = B.jobs.get(u.job && u.job.id);
  await settle(B, j);
  const run = lastRun(j), ex = readJson(path.join(ctlOf(j), 'exit.json')) || {};
  ok(run.cause === 'oom-bound' && j.state === 'failed', `rlimit: 1 GB bound, 1 GB of Buffers ⇒ RLIMIT_DATA refuses, the end is oom-bound under node ${process.version} (base: exit 0; 0259f1ea under 24.22: error)`, { cause: run.cause, exit: run.exit, how: ex.memory && ex.memory.how });
  ok(run.memoryBound && run.memoryBound.by === 'rlimit-data' && ex.memory && ex.memory.confirmed === true && ex.memory.maxBytes === 1024 * MiB, 'rlimit: the rung rlimit-data, its limit read back off the child (/proc/<pid>/limits) before the go', ex.memory);
  ok(/RLIMIT_DATA/.test((ex.memory && ex.memory.how) || '') && /stopped: used more than 1 GB/.test(run.lastLine || ''), `rlimit: named by the job's last words (${(ex.memory && ex.memory.how) || 'none'}), the card's line «stopped: used more than 1 GB»`, run.lastLine);
  if (ju) await settle(B, ju);
  ok(ju && lastRun(ju).memoryBound && lastRun(ju).memoryBound.by === 'none' && /owner set 0/.test(lastRun(ju).memoryBound.why) && LF('memoryChip')(B.snapshot(ju), (k) => k) === 'unbounded — set by the owner', 'create: the user\'s 0 runs unbounded — said, never silent');
  const set = act(B, 'setMemory', ju || {}, '8G', { byUser: false });
  const evs = B.events.length, again = act(B, 'setMemory', ju || {}, '8192', { byUser: false });
  ok(set.ok && set.memoryMb === 8192 && set.memorySource === 'job' && again.ok && again.unchanged === true && B.events.length === evs, 'properties: the bound changes (8G ⇒ 8192, its own); the same value again changes nothing and writes nothing (no event)', again);
  ok(act(B, 'setMemory', ju, 'inherit').memorySource === 'default', 'properties: «inherit» goes back to the ladder');
  stopEngine(B);
});

leg('§3 REAL ③ a manager that refuses OOMPolicy= (systemd < 253: «Unknown assignment») — the job runs ONCE on the next rung', async (ok) => {
  if (!fakeable) { skip++; ok.say('  - SKIP the refused-rung leg: no cgroup v2 memory controller or no prlimit here'); return; }
  const dir = scratch();
  fake(dir, 'systemctl', FAKE_CTL_259);
  fake(dir, 'systemd-run', `${REFUSE_OOMPOLICY}\necho "fake systemd-run: not this call" >&2; exit 1`);
  const E = engineIn(dir)();
  const j = E.jobs.get((E.create({ kind: 'task', name: 'refused', cmd: { argv: ['sh', '-c', 'echo ran-once'] }, memoryMb: 1024, owner }, caller).job || {}).id);
  await settle(E, j);
  const run = lastRun(j), ex = readJson(path.join(ctlOf(j), 'exit.json')) || {}, log = fs.readFileSync(run.log, 'utf8');
  ok(run.cause === 'ok' && (log.match(/ran-once/g) || []).length === 1, 'refused: the job RAN, exactly once, and ended ok (0259f1ea: never ran — exit 1)', { cause: run.cause, exit: run.exit, log: log.slice(-200) });
  ok(ex.memory && ex.memory.by === 'rlimit-data' && ex.memory.confirmed === true && /^systemd-run refused: Unknown assignment: OOMPolicy=stop/.test(ex.memory.why || ''), 'refused: the rung is rlimit-data, proven, and its why says «systemd-run refused: Unknown assignment: OOMPolicy=stop» (0259f1ea: by cgroup)', ex.memory);
  ok(/\[job-wrapper\] the cgroup rung did not hold the job — systemd-run refused/.test(log), 'refused: the job\'s log says the cgroup rung did not hold it, and why');
  stopEngine(E);
});

leg('§3 REAL ④ a manager that never answers — the wait is bounded, the job runs ONCE on the next rung', async (ok) => {
  if (!fakeable) { skip++; ok.say('  - SKIP the silent-manager leg: no cgroup v2 memory controller or no prlimit here'); return; }
  const dir = scratch();
  fake(dir, 'systemctl', FAKE_CTL_259);
  fake(dir, 'systemd-run', 'exec sleep 5'); // a D-Bus call that hangs (the wrapper's wait: 3 s; the engine's test seam: 0.3 s)
  const E = engineIn(dir)({ memorySample: { gateMs: 300 } });
  const t0 = Date.now();
  const j = E.jobs.get((E.create({ kind: 'task', name: 'silent', cmd: { argv: ['sh', '-c', 'echo ran-once'] }, memoryMb: 1024, owner }, caller).job || {}).id);
  await settle(E, j);
  const run = lastRun(j), ex = readJson(path.join(ctlOf(j), 'exit.json')) || {}, log = fs.readFileSync(run.log, 'utf8');
  ok(run.cause === 'ok' && (log.match(/ran-once/g) || []).length === 1 && Date.now() - t0 >= 300, 'silent: the job ran exactly once, after the bounded wait (0259f1ea: never ran — the wrapper waits on the hung systemd-run)', { cause: run.cause, ms: Date.now() - t0 });
  ok(ex.memory && ex.memory.by === 'rlimit-data' && ex.memory.confirmed === true && /systemd-run did not answer in 0\.3 s/.test(ex.memory.why || ''), 'silent: rlimit-data, proven, «systemd-run did not answer in 0.3 s» in its why', ex.memory);
  stopEngine(E);
});

leg('§3 REAL ⑤ a manager < 253 — the scope WITHOUT OOMPolicy=, the end read from the scope\'s own memory.events', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the < 253 leg: no user systemd with a memory controller answers here'); return; }
  const dir = scratch(), ctl = realOf('systemctl'), run0 = realOf('systemd-run');
  // a 252 manager: its Version says so, its systemd-run refuses OOMPolicy= (the real one, under this 259, runs the scope with
  // OOMPolicy=continue — a scope with no OOM policy of its own, as before 253: the kernel's kill is the only end)
  fake(dir, 'systemctl', `case "$*" in *"-p Version"*) echo 252.33-1~deb12u1; exit 0;; *--version*) echo "systemd 252 (252.33-1~deb12u1)"; exit 0;; esac\nexec ${ctl} "$@"`);
  fake(dir, 'systemd-run', `${REFUSE_OOMPOLICY}\nexec ${run0} -p OOMPolicy=continue "$@"`);
  const E = engineIn(dir)();
  const j = E.jobs.get((E.create({ kind: 'task', name: 'grow-252', cmd: { argv: [NODE, '-e', GROW] }, memoryMb: 256, owner }, caller).job || {}).id);
  await settle(E, j);
  const run = lastRun(j), ex = readJson(path.join(ctlOf(j), 'exit.json')) || {};
  ok(run.cause === 'oom-bound' && j.state === 'failed', '< 253: 256 MB bound, a 512 MB Buffer ⇒ oom-bound (0259f1ea: OOMPolicy refused — exit 1, error)', { cause: run.cause, exit: run.exit });
  ok(ex.memory && ex.memory.by === 'cgroup' && ex.memory.confirmed === true && ex.memory.maxBytes === 256 * MiB && /systemd 252 has no OOMPolicy for a scope/.test(ex.memory.why || '') && /memory\.events: oom [1-9]\d*, oom_kill [1-9]\d* \(at MemoryMax\)/.test(ex.memory.how || ''), '< 253: the scope held it (memory.max read back), its why says 252 has no OOMPolicy, its end is the scope\'s own memory.events (oom ≥ 1 — the kernel may count a second while its victim dies — oom_kill ≥ 1)', ex.memory);
  stopEngine(E);
});

leg('§3 REAL ⑥ the instance\'s cap — a 16 GB job on an instance whose memory.max is 8 GiB runs at 6 GiB, and says so', async (ok) => {
  if (!realOf('prlimit')) { skip++; ok.say('  - SKIP the cap leg: no prlimit here'); return; }
  const dir = scratch(), lim = path.join(dir, 'instance-cgroup');
  fs.mkdirSync(lim); fs.writeFileSync(path.join(lim, 'memory.max'), String(8 * 1024 * MiB)); // the pod's own memory.max: 8 GiB
  const E = engineIn(dir)({ memoryRungs: ['rlimit-data'], memoryLimitDir: lim });
  const j = E.jobs.get((E.create({ kind: 'task', name: 'big', cmd: { argv: ['sh', '-c', 'echo capped-run'] }, memoryMb: '16G', owner }, caller).job || {}).id);
  await settle(E, j);
  const run = lastRun(j), ex = readJson(path.join(ctlOf(j), 'exit.json')) || {};
  ok(run.memoryMb === 6144 && run.memoryAskedMb === 16384 && run.memoryCap && run.memoryCap.limitMb === 8192 && run.memoryCap.hubMb === 2048, 'cap: the run asked 16 GB and runs at 6 GiB — both numbers and the cap on its record (8a2727c8: 16 GB)', { memoryMb: run.memoryMb, asked: run.memoryAskedMb, cap: run.memoryCap });
  ok(run.cause === 'ok' && ex.memory && ex.memory.by === 'rlimit-data' && ex.memory.mb === 6144 && ex.memory.maxBytes === 6144 * MiB, 'cap: the wrapper held it at the EFFECTIVE bound — RLIMIT_DATA 6 GiB read back off the child', ex.memory);
  const snap = E.snapshot(j), words = LF('memoryChip')(snap, (k, p) => (p ? k.replace(/\{(\w+)\}/g, (_, x) => p[x]) : k));
  ok(snap.memoryMb === 6144 && snap.memoryAskedMb === 16384 && words === '6 GB · rlimit · capped by the instance’s 8 GB limit', 'cap: the card says «6 GB · rlimit · capped by the instance’s 8 GB limit»', { words, snap: { mb: snap.memoryMb, asked: snap.memoryAskedMb, cap: snap.memoryCap } });
  // the engine's own read, without the seam: the tightest memory.max of its cgroup and every ancestor (here, whatever this
  // host gives the suite — env.sh's scope carries 24 GiB, a CI runner none) equals the suite's own walk of /proc/self/cgroup
  const own = (() => { let mb = null; const rel = (fs.readFileSync('/proc/self/cgroup', 'utf8').split('\n').find((l) => l.startsWith('0::')) || '0::/').slice(3); const parts = rel.split('/').filter(Boolean);
    for (let i = parts.length; i >= 0; i--) { try { const v = fs.readFileSync(path.join('/sys/fs/cgroup', ...parts.slice(0, i), 'memory.max'), 'utf8').trim(); if (/^\d+$/.test(v)) mb = Math.min(mb === null ? Infinity : mb, Math.floor(Number(v) / MiB)); } catch { } } return mb; })();
  const H = engineIn(scratch())({ memoryLimitDir: undefined });
  const hubRead = (act(H, '_instanceLimit') || {}).mb ?? act(H, '_instanceLimitMb');
  ok(hubRead === own, `cap: the engine reads its own cgroup's tightest memory.max (here ${own === null ? 'none — no cap' : own + ' MB'})`, hubRead);
  stopEngine(H);
  const four = act(E, 'setMemory', j, '4G'), back = act(E, 'setMemory', j, '16G');
  ok(four.memoryMb === 4096 && !four.memoryCap && back.memoryMb === 6144 && back.memoryAskedMb === 16384 && back.memoryCap && back.memoryCap.limitMb === 8192 && E.events.some((e) => e.jobId === j.id && /capped by the instance's 8 GB limit \(asked 16 GB\)/.test(e.what || '')), 'cap: the properties / CLI take the ASKED value and answer the effective one (4G stays 4 GB; 16G ⇒ 6 GB, capped, said in the journal)', { four, back });
  stopEngine(E);
});

leg('§3 REAL ⑦ a stop ENDS THE JOB, never just its holder — systemd < 253 (a fake 252 over the real manager), a job deaf to SIGTERM', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the stop legs: no user systemd with a memory controller answers here'); return; }
  const dir = scratch(), ctl = realOf('systemctl'), run0 = realOf('systemd-run');
  fake(dir, 'systemctl', FAKE_CTL_252(ctl));
  fake(dir, 'systemd-run', `${REFUSE_OOMPOLICY}\nexec ${run0} -p OOMPolicy=continue "$@"`);
  const DEAF = ['sh', '-c', 'trap "" TERM; exec sleep 9'];
  // ⓐ the owner's stop: SIGTERM to the wrapper's group — the job ignores it; the scope's drain bound (10 s) is the engine's
  // test seam here, 0.3 s
  const deaf = async () => {
    const E = engineIn(dir)({ memorySample: { stopMs: 300 } });
    const j = E.jobs.get((E.create({ kind: 'task', name: 'deaf', cmd: { argv: DEAF }, memoryMb: 256, owner }, caller).job || {}).id);
    const up = await running(E, j), b = readJson(path.join(ctlOf(j), 'bound.json')) || {};
    const before = scopeProcs(b.unit);
    E.stop(j);
    await until(() => !E._verifyAlive(E._readStamp(j)), 3000, 10);
    const atEnd = scopeProcs(b.unit);
    await E._sweep(); // the engine's own tick: a requested stop's kill step (222f7f5d: gated on the wrapper's life — it is gone)
    await until(() => !scopeProcs(b.unit).length, 1500, 25);
    return { E, j, up, b, before, atEnd, after: scopeProcs(b.unit), ex: readJson(path.join(ctlOf(j), 'exit.json')) || {}, run: lastRun(j) };
  };
  // ⓑ the engine's kill step never hangs on the wrapper's life: a wrapper killed ALONE (its job left in its scope — the real
  // manager, ≥ 253) — the owner's stop is said to the scope, and the sweep reaps what an ended run left there
  const orphan = async () => {
    const E = engineIn(scratch())();
    const k = E.jobs.get((E.create({ kind: 'task', name: 'orphan', cmd: { argv: DEAF }, memoryMb: 256, owner }, caller).job || {}).id);
    const up = await running(E, k), b = readJson(path.join(ctlOf(k), 'bound.json')) || {};
    try { process.kill(E._readStamp(k).pid, 'SIGKILL'); } catch { } // the wrapper alone — not its group
    await until(() => !E._verifyAlive(E._readStamp(k)), 2000, 10);
    const orphaned = scopeProcs(b.unit);
    E.stop(k);
    await E._sweep();
    await until(() => !scopeProcs(b.unit).length, 1500, 25);
    return { E, k, up, b, orphaned, left: scopeProcs(b.unit) };
  };
  const [A, B] = await Promise.all([deaf(), orphan()]);
  ok(A.up && A.b.by === 'cgroup' && /systemd 252/.test(A.b.why || '') && A.before.length >= 1, `deaf: it runs in its scope on the < 253 rung (cgroup.procs before the stop: [${A.before.join(' ')}])`, A.b);
  ok(!A.atEnd.length && !A.after.length, `deaf: the stop ENDED the job — its scope's cgroup.procs when its wrapper ended: [${A.atEnd.join(' ')}], after the engine's step: [${A.after.join(' ')}] (222f7f5d: the holder died at once, the wrapper left, «sleep 9» stayed)`, { atEnd: A.atEnd, after: A.after });
  ok(A.ex.signal === 'SIGKILL' && A.ex.stop === 'SIGTERM' && /^stopped by force: it did not end on SIGTERM in 0\.3 s — its scope was killed$/.test(A.ex.forced || ''), `deaf: exit.json names the job's OWN end (signal ${A.ex.signal}), the stop (${A.ex.stop}) and «${A.ex.forced || 'no force'}» (222f7f5d: the holder's SIGTERM, no force)`, A.ex);
  ok(A.run.cause === 'interrupted' && /stopped by force/.test(A.run.forced || '') && /stopped by force/.test(A.run.lastLine || '') && A.E.events.some((e) => e.jobId === A.j.id && /stopped by force/.test(e.what || '')), 'deaf: the run stays a stop (interrupted) and says «stopped by force» — its record, its last line, its journal', { cause: A.run.cause, forced: A.run.forced, lastLine: A.run.lastLine });
  ok(B.up && B.orphaned.length >= 1 && !B.left.length && /^stopped by force: its wrapper was gone and its scope still held 1 process — its scope was killed$/.test(lastRun(B.k).forced || ''), `a wrapper gone, its job not (cgroup.procs: [${B.orphaned.join(' ')}]) — the engine's step reached the SCOPE: [${B.left.join(' ')}], said on the run (222f7f5d: nothing reached it)`, { orphaned: B.orphaned, left: B.left, forced: lastRun(B.k).forced });
  for (const u of [A.b.unit, B.b.unit]) killScopeOf(u); // a RED run's orphans never outlive the suite
  stopEngine(A.E); stopEngine(B.E);
});

leg('§3 REAL ⑧ a timer belongs to its rung — a refused rung\'s proof never judges the next rung\'s child', async (ok) => {
  if (!fakeable) { skip++; ok.say('  - SKIP the late-refusal leg: no cgroup v2 memory controller or no prlimit here'); return; }
  const dir = scratch(), pl = realOf('prlimit');
  fake(dir, 'systemctl', FAKE_CTL_259);
  fake(dir, 'systemd-run', 'sleep 0.25; echo "Unknown assignment: OOMPolicy=stop" >&2; exit 1'); // refused LATE in its window
  fake(dir, 'prlimit', `sleep 0.2; exec ${pl} "$@"`); // the next rung: slow but sound — it proves well inside ITS OWN window
  const E = engineIn(dir)({ memorySample: { gateMs: 400 } });
  const j = E.jobs.get((E.create({ kind: 'task', name: 'late', cmd: { argv: ['sh', '-c', 'echo ran-once'] }, memoryMb: 1024, owner }, caller).job || {}).id);
  await settle(E, j);
  const ex = readJson(path.join(ctlOf(j), 'exit.json')) || {}, m = ex.memory || {}, log = fs.readFileSync(lastRun(j).log, 'utf8');
  ok(m.by === 'rlimit-data' && m.confirmed === true && m.why === 'systemd-run refused: Unknown assignment: OOMPolicy=stop — RLIMIT_DATA on the job instead' && (log.match(/ran-once/g) || []).length === 1, `late refusal: the next rung proves in its own window — ${m.by}, «${m.why}» (222f7f5d: the refused rung's timer judged prlimit by ITS deadline — by none, «prlimit did not answer»)`, m);
  stopEngine(E);
});

leg('§3 REAL ⑨ the cap is the limit that CONTAINS the job — a scope beside the hub is not inside the hub\'s own limit; a slice it shares is', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the containment leg: no user systemd with a memory controller answers here'); return; }
  // where this host puts a user scope (the manager's app.slice), and what that shares with this process — the suite's own walk
  const um = String(spawnSync(CTL, ['--user', 'show', '-p', 'ControlGroup', '--value'], { encoding: 'utf8', timeout: 3000 }).stdout || '').trim();
  const shared = sharedOf(`${um}/app.slice/x.scope`, selfCgroup);
  const realLim = shared.map((d) => { try { const v = fs.readFileSync(path.join('/sys/fs/cgroup', d, 'memory.max'), 'utf8').trim(); return /^\d+$/.test(v) ? Math.floor(Number(v) / MiB) : null; } catch { return null; } }).filter((v) => v !== null).sort((x, y) => x - y)[0] ?? null;
  const want = realLim ? Math.min(16384, M.instanceCapOf(realLim).capMb) : 16384;
  // (a) the HUB's own cgroup holds 8 GiB (the seam stands for it — env.sh's scope, the hub's unit); a 16 GB job on the cgroup
  // rung lives in a scope BESIDE the hub: that limit does not contain it, nothing lowers it (the rlimit rung, inside the hub,
  // still is — leg ⑥)
  const dir = scratch(), lim = path.join(dir, 'hub-cgroup');
  fs.mkdirSync(lim); fs.writeFileSync(path.join(lim, 'memory.max'), String(8 * 1024 * MiB));
  const E = engineIn(dir)({ memoryLimitDir: lim });
  const j = E.jobs.get((E.create({ kind: 'task', name: 'beside', cmd: { argv: ['sh', '-c', 'echo beside'] }, memoryMb: '16G', owner }, caller).job || {}).id);
  await settle(E, j);
  const bj = (readJson(path.join(ctlOf(j), 'exit.json')) || {}).memory || {}, rj = lastRun(j);
  ok(bj.by === 'cgroup' && bj.mb === want && bj.maxBytes === want * MiB && rj.memoryMb === want && (realLim ? !!rj.memoryCap : !rj.memoryCap), `beside: a 16 GB job whose hub holds 8 GiB runs at ${want} MB on the cgroup rung — its scope's memory.max read back ${bj.maxBytes}; the hub's own limit does not contain it (222f7f5d: 6 GiB, «capped by the instance's 8 GB»)`, { by: bj.by, mb: bj.mb, cap: rj.memoryCap });
  // (b) a limit the scope SHARES with the hub (a fake tree of memory.max files — the seam `limitRoot`; this host's real
  // user.slice holds the production hub and is never touched): 32 GiB there ⇒ a 48 GB job runs at 24 GiB, and the record
  // names WHICH limit
  const top = shared[shared.length - 2] || '/', base = top.split('/').filter(Boolean).pop() || '';
  const name = top === '/' ? 'instance' : /^user(-\d+)?\.slice$/.test(base) ? 'user slice' : base;
  const tree = path.join(dir, 'cgroup-tree');
  fs.mkdirSync(path.join(tree, top), { recursive: true }); fs.writeFileSync(path.join(tree, top, 'memory.max'), String(32 * 1024 * MiB));
  const F = engineIn(scratch())({ memorySample: { limitRoot: tree } });
  const k = F.jobs.get((F.create({ kind: 'task', name: 'shared', cmd: { argv: ['sh', '-c', 'echo shared'] }, memoryMb: '48G', owner }, caller).job || {}).id);
  await settle(F, k);
  const bk = (readJson(path.join(ctlOf(k), 'exit.json')) || {}).memory || {}, rk = lastRun(k);
  const tr = (key, p) => (p ? key.replace(/\{(\w+)\}/g, (_, x) => p[x]) : key), words = LF('memoryChip')(F.snapshot(k), tr);
  ok(bk.by === 'cgroup' && bk.mb === 24576 && bk.maxBytes === 24576 * MiB && rk.memoryMb === 24576 && rk.memoryAskedMb === 49152 && rk.memoryCap && rk.memoryCap.limitMb === 32768 && rk.memoryCap.of === name,
    `shared: ${top} at 32 GiB ⇒ a 48 GB job's scope is set to 24 GiB before the go (read back ${bk.maxBytes}); the run names the limit — «${name}» (222f7f5d: 48 GiB, nothing read off the scope)`, { by: bk.by, mb: bk.mb, cap: rk.memoryCap });
  const capName = name === 'instance' ? 'the instance’s' : name === 'user slice' ? 'the user slice’s' : `${name}’s`;
  const set64 = act(F, 'setMemory', k, '64G');
  ok(words === `24 GB · cgroup · capped by ${capName} 32 GB limit` && set64.memoryMb === 24576 && set64.memoryCap && set64.memoryCap.of === name && F.events.some((e) => e.jobId === k.id && e.what && e.what.includes(`capped by ${capName.replace('’', "'")} 32 GB limit (asked 64 GB)`)),
    `shared: the card says «${words}»; the next run's words follow what contains this host's scopes (a 64G ⇒ 24 GB, the journal names the limit)`, { words, set64 });
  stopEngine(E); stopEngine(F);
});

leg('§4 REAL — the park law through the engine\'s doors (a boot replay counts exactly like a run)', async (ok) => {
  const engine = engineIn(scratch());
  const C1 = engine({ memoryRungs: ['rlimit-data'] });
  const r = C1.create({ kind: 'service', name: 'hog-svc', cmd: { argv: [NODE, '-e', RESERVE] }, memoryMb: 1024, owner }, caller);
  const id = r.job && r.job.id;
  let j = C1.jobs.get(id);
  await settle(C1, j);
  ok(lastRun(j).cause === 'oom-bound' && (j.supervise || {}).oomEnds === 1 && j.state === 'down' && !(j.supervise || {}).parkedAt, 'service: its first oom-bound end counts 1 — down, not parked', { cause: lastRun(j).cause, sup: j.supervise, state: j.state });
  ok(C1.events.some((e) => e.jobId === id && /stopped: used more than 1 GB — 1 more out-of-memory end parks it/.test(e.what || '')), 'service: the journal names the end and what the next one does');
  C1._save(); stopEngine(C1);
  const C2 = engine({ memoryRungs: ['rlimit-data'] }); // THE BOOT: the replay starts the desiredUp service (base: forever)
  j = C2.jobs.get(id);
  ok(lastRun(j).trigger === 'boot', 'boot: the replay starts it again (trigger boot)', lastRun(j).trigger);
  await settle(C2, j);
  const parkWords = 'parked: out of memory twice — raise its bound or fix the job';
  ok(lastRun(j).cause === 'oom-bound' && j.supervise.parkedAt && j.supervise.parkedFor === 'memory' && j.state === 'failed', 'boot: the REPLAY\'s oom-bound end is the second ⇒ parked by name (base: restarted again)', { cause: lastRun(j).cause, sup: j.supervise, state: j.state });
  ok(said.some((n) => n.jobId === id && n.text.includes(parkWords) && n.i18n && n.i18n.text && /parked — out of memory twice/.test(n.i18n.text.key)) && C2.events.some((e) => e.jobId === id && e.what.includes(parkWords)), 'park: said to the owner in For you (worded per device) and in the job\'s journal');
  ok(LF('memoryEndWords')(C2.snapshot(j), (k) => k) === parkWords, 'park: the card says «parked: out of memory twice — raise its bound or fix the job»');
  const runs = j.runs.length;
  C2._save(); stopEngine(C2);
  const C3 = engine({ memoryRungs: ['rlimit-data'] }); // the next boot leaves a parked job alone
  j = C3.jobs.get(id);
  ok(j.runs.length === runs && j.state === 'failed', 'park: the next boot does NOT replay it (not restarted until the owner acts)', { runs: j.runs.length, was: runs, state: j.state });
  ok(C3.start(j).ok && lastRun(j).trigger === 'manual' && !j.supervise.oomEnds, 'park: the owner\'s start runs it again, counting afresh');
  await settle(C3, j);
  ok(lastRun(j).cause === 'oom-bound' && j.supervise.oomEnds === 1 && !j.supervise.parkedAt, 'park: after the owner acted, one more end is 1 of 2 — not parked yet', j.supervise);
  stopEngine(C3);
});

leg('§4 REAL ⓑ a non-memory end resets — oom → a restart → oom is NOT two in a row (a service)', async (ok) => {
  const dir = scratch(), engine = engineIn(dir), flag = path.join(dir, 'sleep-instead');
  const deps = { memoryRungs: ['rlimit-data'] };
  const E1 = engine(deps);
  const id = (E1.create({ kind: 'service', name: 'svc-reset', cmd: { argv: [NODE, '-e', SWITCH(flag)] }, memoryMb: 1024, owner }, caller).job || {}).id;
  let j = E1.jobs.get(id);
  await settle(E1, j);
  ok(lastRun(j).cause === 'oom-bound' && (j.supervise || {}).oomEnds === 1, 'reset (service): run 1 ends oom-bound — 1 of 2', { cause: lastRun(j).cause, sup: j.supervise });
  fs.writeFileSync(flag, ''); E1._save(); stopEngine(E1);
  const E2 = engine(deps); // the boot replays it — this run sleeps, and the instance restarts under it
  j = E2.jobs.get(id);
  ok(await running(E2, j) && await killGroup(E2, j), 'reset (service): run 2 runs, and the instance restarts under it (its group killed, no exit record)');
  E2._save(); stopEngine(E2); fs.rmSync(flag, { force: true });
  const E3 = engine(deps); // the boot judges run 2 env-restart — then replays run 3 (an oom again)
  j = E3.jobs.get(id);
  const cut = j.runs[j.runs.length - 2] || {};
  ok(cut.cause === 'env-restart' && !(j.supervise || {}).oomEnds, 'reset (service): the boot ends run 2 env-restart and the count RESETS (0259f1ea: the run left open, still 1)', { cause: cut.cause, sup: j.supervise });
  await settle(E3, j);
  ok(lastRun(j).cause === 'oom-bound' && (j.supervise || {}).oomEnds === 1 && !(j.supervise || {}).parkedAt && j.state === 'down', 'reset (service): run 3 ends oom-bound — 1 of 2, NOT parked (0259f1ea: parked)', { cause: lastRun(j).cause, sup: j.supervise, state: j.state });
  stopEngine(E3);
});

leg('§4 REAL ⓒ the same for a cron — fire 1 oom, fire 2 cut by a restart, fire 3 oom ⇒ still enabled', async (ok) => {
  const dir = scratch(), engine = engineIn(dir), flag = path.join(dir, 'sleep-instead');
  const deps = { memoryRungs: ['rlimit-data'] };
  const E1 = engine(deps);
  const cid = (E1.create({ kind: 'cron', name: 'cron-reset', schedule: { at: Date.now() + 3600e3 }, action: { type: 'spawn-task', task: { cmd: { argv: [NODE, '-e', SWITCH(flag)] }, memoryMb: 1024 } }, owner }, caller).job || {}).id;
  const kidOf = (E) => [...E.jobs.values()].find((x) => x.cronParent === cid);
  let cron = E1.jobs.get(cid);
  E1._fireCron(cron, 'schedule');
  let kid = kidOf(E1);
  await settle(E1, kid);
  ok(lastRun(kid).cause === 'oom-bound' && (kid.supervise || {}).oomEnds === 1, 'reset (cron): fire 1 ends oom-bound — its child counts 1', { cause: lastRun(kid).cause, sup: kid.supervise });
  fs.writeFileSync(flag, '');
  E1._fireCron(cron, 'schedule');
  kid = kidOf(E1);
  ok(await running(E1, kid) && await killGroup(E1, kid), 'reset (cron): fire 2 runs, and the instance restarts under it');
  E1._save(); stopEngine(E1); fs.rmSync(flag, { force: true });
  const E2 = engine(deps);
  cron = E2.jobs.get(cid); kid = kidOf(E2);
  ok(lastRun(kid).cause === 'env-restart' && !(kid.supervise || {}).oomEnds, 'reset (cron): the boot ends fire 2 env-restart — the count RESETS (0259f1ea: still 1)', { cause: lastRun(kid).cause, sup: kid.supervise });
  E2._fireCron(cron, 'schedule');
  kid = kidOf(E2);
  await settle(E2, kid);
  ok(lastRun(kid).cause === 'oom-bound' && (kid.supervise || {}).oomEnds === 1 && cron.desiredUp !== false && cron.state !== 'failed' && !(cron.supervise || {}).parkedFor, 'reset (cron): fire 3 ends oom-bound — 1 of 2, the cron stays ENABLED (0259f1ea: parked, disabled)', { cause: lastRun(kid).cause, sup: kid.supervise, cron: { desiredUp: cron.desiredUp, state: cron.state } });
  stopEngine(E2);
});

leg('§5 REAL ⓐ the boot\'s judge: the instance\'s OOM count ROSE and the job held most of its anon (memory.oom.group took the wrapper too)', async (ok) => {
  const dir = scratch(), engine = engineIn(dir), cg = fakeCgroup(dir); // the container's cgroup: 150 of 200 MiB anon, 40 MiB of cache
  const deps = { memoryRungs: ['rlimit-data'], memorySample: { sampleDir: cg, sampleMs: 50 } };
  const D1 = engine(deps);
  const id = (D1.create({ kind: 'service', name: 'pod-killer', cmd: { argv: [NODE, '-e', HOLD] }, owner }, caller).job || {}).id;
  const cycle = async (E, n) => {
    const j = E.jobs.get(id);
    const seen = await until(() => { const p = readJson(path.join(ctlOf(j), 'pressure.json')); return p && (p.jobAnonMb >= 90 || p.jobMb >= 100); }, 6000, 10);
    ok(seen, `pressure ${n}: the wrapper samples the instance's anon and the job's share (pressure.json)`);
    bumpGroupKill(cg); // the container's own OOM kill — memory.oom.group: every process of it at once
    await killGroup(E, j);
    ok(!fs.existsSync(path.join(ctlOf(j), 'exit.json')), `pressure ${n}: no exit record survives (as under memory.oom.group)`);
    E._save(); stopEngine(E);
  };
  await cycle(D1, 1);
  const D2 = engine(deps);
  let j = D2.jobs.get(id);
  const prev = j.runs[j.runs.length - 2] || {}, mj = prev.memoryJudge || {};
  ok(prev.cause === 'oom' && mj.jobAnonMb >= 90 && mj.anonMb === 150 && mj.limitMb === 200 && mj.oomKills === 1 && /OOM-killed/.test(mj.why || ''), 'boot 1: the run that died with the instance is judged `oom` — its count rose, the job held most of the anon; the numbers and the reason ride the run', { cause: prev.cause, mj });
  ok(j.supervise.oomEnds === 1 && lastRun(j).trigger === 'boot', 'boot 1: counted 1 of 2 — the replay runs it once more', { sup: j.supervise, trigger: lastRun(j).trigger });
  await cycle(D2, 2);
  const D3 = engine(deps);
  j = D3.jobs.get(id);
  ok(lastRun(j).cause === 'oom' && j.supervise.parkedFor === 'memory' && j.state === 'failed', 'boot 2: the second death with the instance ⇒ parked by name (base: replayed every boot — 638 times in 74 h)', { cause: lastRun(j).cause, sup: j.supervise, state: j.state });
  const n = j.runs.length;
  stopEngine(D3);
  const D4 = engine(deps);
  ok(D4.jobs.get(id).runs.length === n && D4.jobs.get(id).state === 'failed' && !D4._verifyAlive(D4._readStamp(D4.jobs.get(id))), 'boot 3: a parked job is not replayed (failed, nothing alive)', { runs: D4.jobs.get(id).runs.length, was: n, state: D4.jobs.get(id).state });
  stopEngine(D4);
});

leg('§5 REAL ⓑ a rolling update of a pod full of cache — no OOM kill ⇒ env-restart, never counted (page cache is not pressure)', async (ok) => {
  const dir = scratch(), engine = engineIn(dir), cg = fakeCgroup(dir); // memory.current at 95 % of the limit: what round 1 called «full»
  const deps = { memoryRungs: ['rlimit-data'], memorySample: { sampleDir: cg, sampleMs: 50 } };
  const R1 = engine(deps);
  const id = (R1.create({ kind: 'service', name: 'healthy-svc', cmd: { argv: [NODE, '-e', HOLD] }, owner }, caller).job || {}).id;
  let j = R1.jobs.get(id);
  ok(await until(() => { const p = readJson(path.join(ctlOf(j), 'pressure.json')); return p && (p.jobAnonMb >= 90 || p.jobMb >= 100); }, 6000, 10), 'rolling: the wrapper samples the instance (95 % of its limit in use)');
  await killGroup(R1, j); // the update's restart: no OOM kill in the instance's count
  R1._save(); stopEngine(R1);
  const R2 = engine(deps);
  j = R2.jobs.get(id);
  const prev = j.runs[j.runs.length - 2] || {};
  ok(prev.cause === 'env-restart' && !(j.supervise || {}).oomEnds && /no OOM kill/.test((prev.memoryJudge || {}).why || '') && lastRun(j).trigger === 'boot', 'rolling: the boot judges it env-restart — not counted, its reason in the record, the replay runs it (0259f1ea: oom, counted 1)', { cause: prev.cause, sup: j.supervise, judge: prev.memoryJudge });
  stopEngine(R2);
});

leg('§5 REAL ⓒ a SIGKILL from outside is never named an OOM off the hub\'s whole-subtree counter', async (ok) => {
  if (!realOf('prlimit')) { skip++; ok.say('  - SKIP the outside-kill leg: no prlimit here'); return; }
  const dir = scratch(), cg = fakeCgroup(dir, { maxMb: 0 }); // the hub's cgroup (no limit — no sample) whose oom_kill another process raises
  const E = engineIn(dir)({ memoryRungs: ['rlimit-data'], memorySample: { sampleDir: cg, sampleMs: 50 } });
  const j = E.jobs.get((E.create({ kind: 'task', name: 'killed-outside', cmd: { argv: [NODE, '-e', 'setInterval(() => {}, 60000)'] }, memoryMb: 1024, owner }, caller).job || {}).id);
  ok(await running(E, j), 'outside: the job runs');
  const st = E._readStamp(j), kid = Number((fs.readFileSync(`/proc/${st.pid}/task/${st.pid}/children`, 'utf8').trim().split(/\s+/))[0]);
  fs.writeFileSync(path.join(cg, 'memory.events'), 'low 0\nhigh 0\nmax 0\noom 1\noom_kill 3\noom_group_kill 0\n'); // something ELSE of the hub's was OOM-killed meanwhile
  try { process.kill(kid, 'SIGKILL'); } catch { }
  await settle(E, j);
  const ex = readJson(path.join(ctlOf(j), 'exit.json')) || {};
  ok(lastRun(j).cause === 'error' && !(ex.memory || {}).cause, 'outside: the job SIGKILLed from outside ends an error — not «killed: out of memory» off the hub\'s counter (0259f1ea: oom)', { cause: lastRun(j).cause, memory: ex.memory });
  stopEngine(E);
});

try {
  await Promise.all(legs.map(async (g) => {
    const rec = (c, n, e) => g.rows.push(['row', c, n, e]);
    rec.say = (line) => g.rows.push(['say', line]);
    try { await g.body(rec); } catch (e) { g.rows.push(['row', false, `${g.title.slice(0, 12)}: the leg threw`, String(e && e.stack || e).slice(0, 400)]); }
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
    ok(/const GATE_KEEP = 'read -r go <&3 \|\| exit 125; \( \(trap "" TERM INT HUP; read -r ack <&3\) <\/dev\/null >\/dev\/null 2>&1 & \); exec "\$@" 3<&-';/.test(WRAPPER_SRC) && !/GATE_HOLD/.test(WRAPPER_SRC) && /r\.timer = setTimeout\(\(\) => prove\(r, c, deadline\), 10\)/.test(WRAPPER_SRC) && !/setTimeout\(\(\) => prove\(deadline\)/.test(WRAPPER_SRC),
      'the wrapper: the job is exec\'d on every rung (the < 253 keeper double-forked beside it, deaf to a stop); a proof\'s timer is bound to its rung and its child');
    ok(/const hadProc = force && scope \? this\._escalate\(job, scope\) : this\._killGroup\(job, force \? 'SIGKILL' : 'SIGTERM'\);/.test(jobs) && /this\._escalate\(job, this\._runScope\(job, run\)\); \/\/ round 4/.test(jobs) && /await this\._reapScope\(job, run\);/.test(jobs) && jobs.split("setTimeout(() => this._killGroup(job, 'SIGKILL')").length === 1,
      'src/jobs.js: every kill step goes through _escalate (the scope on the cgroup rung, whether or not its wrapper lives); a dead wrapper\'s scope is reaped');
    // THE ONE ROAD: the model's park law is called in ONE place, and every end — the sweep's and the boot's, `oom` and
    // env-restart — goes through it (0259f1ea: two bookkeeping paths, the boot's env-restart in neither)
    ok(jobs.split('M.onMemoryEnd(').length === 2 && /const memPark = windowEnd \? null : this\._countEnd\(job, run\.cause\);/.test(jobs) && /const mp = ends \? this\._countEnd\(job, v\.cause\) : null;/.test(jobs) && /this\._bootNoExit\(job, run, M\.bootEndCause\(sample, sample \? this\._cgroupNow\(\) : null\)\);/.test(jobs), 'src/jobs.js: ONE call of the park law (_countEnd) — _finalizeRun and the boot\'s _bootNoExit (oom AND env-restart) both end there');
    // the wrapper's named end reads only the job's own facts: no counter of the hub's whole subtree, and OOMPolicy= only ≥ 253
    const memEnd = (/function memoryEnd\(code, signal\) \{[\s\S]*?\n\}/.exec(WRAPPER_SRC) || [''])[0];
    ok(memEnd && !/ownCg|oomKillsAtSpawn|oomKills\(\)/.test(memEnd) && !/oomKillsAtSpawn/.test(WRAPPER_SRC) && /\.\.\.\(policy \? \['-p', 'OOMPolicy=stop'\] : \[\]\)/.test(WRAPPER_SRC) && /const policy = version >= 253;/.test(WRAPPER_SRC), 'the wrapper: its named end reads no counter of the hub\'s subtree; OOMPolicy=stop only where the manager is ≥ 253');
  }
} finally {
  // nothing this suite started outlives it — a live job group (a RED run on a base that replays blind) is killed by its stamp
  for (const E of engines) for (const j of E.jobs.values()) { try { const st = E._readStamp(j); if (E._verifyAlive(st)) process.kill(-st.pid, 'SIGKILL'); } catch { } }
  const left = spawnSync('systemctl', ['--user', 'list-units', '--all', '--no-legend', '--plain', `${PREFIX}-*`], { encoding: 'utf8', timeout: 3000 });
  if (userSystemd) ok(left.status === 0 && !String(left.stdout || '').trim(), 'no scope this suite made outlives it (failed ones are reset by the wrapper that read them)', String(left.stdout || '').trim());
  for (const l of String(left.stdout || '').split('\n')) killScopeOf(l.trim().split(/\s+/)[0]); // said above, then gone — never left running
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
}

console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped (said above)` : ''}`);
process.exit(fail ? 1 : 0);
