#!/usr/bin/env node
// scripts/test-level-signal.mjs — THE MEASURED SPAN IS A FLOOR (lane level-signal-2b, majordomo piece 2b; 主开发 2026-11-17 13:13Z).
// A conversation's never-published background set reads EMPTY only on a build that has the level signal. Until this unit that was
// a span typed into the tree (2.1.281–2.1.321, the tracked dumps); the installed claude on the measuring box was already 2.1.322,
// so every new conversation read «background unknown» and the manager could end none of them until a release. Now a build has the
// signal when its OWN binary DECLARES it in its record union — read by the ONE reader of the binary the hub already has (the model
// catalog's streamed read, src/server/cli-model-catalog.js: off the loop, bounded, one at a time, kept per build in its ledger),
// never by the person's record-draft tool and never into its file. Measured once on the installed 2.1.322 (342 MB): the declaration
// sits inside the window the catalog already reads (285.8 MB; the read stops at 293.6 MB), the read 414–445 ms → 459–462 ms.
//   A  the PURE finder (src/claude-model-catalog.js levelSignalAt): the declaration found; a mention, a reader's comparison, a
//      different literal helper are not declarations. RED: a finder that takes any mention.
//   B  the catalog's read: declared / not declared / the window bound / a read cut short says nothing; the ledger keeps it across a
//      restart and refuses a malformed one; an older reader's entry is read once more.
//   C  the hub's judgment (src/conversation-facts.js trackedFacts): declared ⇒ known-empty; not declared / not read ⇒ unknown, said;
//      the doubts still come first; the list wired to the catalog; the judgment reads no file. RED: the span alone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';   // a red control's edit fails BY NAME when its anchor moves (RULES: a new red control is anchored)
import { writeStandIn } from './claude-catalog-stand-in.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CMC = require(path.join(REPO, 'src/claude-model-catalog.js'));
const CAT = require(path.join(REPO, 'src/server/cli-model-catalog.js'));
const CF = require(path.join(REPO, 'src/conversation-facts.js'));
const COL = require(path.join(REPO, 'src/server/conversation-facts.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-level-'));
const BASE = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/claude-model-catalog-2.1.321.json'), 'utf8'));
// the declaration's SHAPE as the record union states it (a short stand-in written here — the helpers' names are the bundle's own)
const DECL = 'var w1=p(()=>u({type:T("system"),subtype:T("background_tasks_changed"),tasks:C(u({task_id:o(),run_id:o(),task_type:o()}))}));\n';
const MENTION = 'var ls="Id of one run of the task: equal on every task_* event, background_tasks_changed entry";if(e.type==="system"&&e.subtype==="background_tasks_changed"){h.set(n,e)}f.includes("background_tasks_changed");\n';
let nCli = 0;
const cli = (version, extra = '') => { const f = writeStandIn(path.join(dir, `claude-${++nCli}`), { version, builtAt: '2026-11-17T00:00:00Z', catalog: BASE }); if (extra) fs.appendFileSync(f, extra); return f; };

console.log('A · the PURE finder (src/claude-model-catalog.js levelSignalAt)');
{
  ok(CMC.levelSignalAt(DECL) === DECL.indexOf('u({type:'), 'the record union\'s own object for the signal is found (the shape the dump recipe reads)');
  ok(CMC.levelSignalAt(MENTION) === -1, 'a description that names it, a reader\'s comparison and a call with it as an argument are not declarations');
  ok(CMC.levelSignalAt('a.b({type:x.y("system"),subtype:x.y("background_tasks_changed")') === 0 && CMC.levelSignalAt('u({type:T("system"),subtype:Q("background_tasks_changed")') === -1
    && CMC.levelSignalAt('u({type:T("result"),subtype:T("background_tasks_changed")') === -1 && CMC.levelSignalAt(null) === -1,
    'dotted helpers are found; a different literal helper, another record type, or no text is not a declaration');
  ok(CMC.levelSignalAt(MENTION + DECL) === MENTION.length + DECL.indexOf('u({type:'), 'mentions before it do not hide the declaration');
  const src = fs.readFileSync(path.join(REPO, 'src/claude-model-catalog.js'), 'utf8');
  const N = '    if (m) return from + m.index;\n';
  if (src.split(N).length !== 2) throw new Error('anchor missing: the finder');
  const mA = mutantCopies('level-signal-a', REPO).load('src/claude-model-catalog.js', anchored(src, N, '    return i;\n', 'any-mention'), 'any-mention');
  ok(mA.levelSignalAt(MENTION) >= 0, 'RED: a finder that takes any mention calls a build that merely names the signal «declared»');
}

console.log('B · the catalog\'s ONE read of the binary carries the fact (src/server/cli-model-catalog.js)');
{
  const yes = await CAT.readBinary(cli('2.1.990', DECL), {});
  const no = await CAT.readBinary(cli('2.1.991', MENTION), {});
  ok(yes.state === 'read' && yes.models.length > 0 && yes.level && yes.level.declared === true && Number.isInteger(yes.level.at) && CMC.READER_VERSION === 3,
    'a build that declares it: the same read keeps its models AND level {declared: true, at} (the reader\'s version moved to 3)', yes.level);
  ok(no.state === 'read' && no.level && no.level.declared === false && no.level.at === null, 'a build that only names it: declared false — a verdict about the bytes', no.level);
  // the window: past the catalog's parts the scan goes on at most LEVEL_SCAN_MAX (as the plan values do) — a declaration beyond it is not read
  const far = cli('2.1.992'); const fd = fs.openSync(far, 'r+'); const tail = 80 << 20; fs.ftruncateSync(fd, tail); fs.writeSync(fd, DECL, tail); fs.closeSync(fd);
  const ef = await CAT.readBinary(far, {});
  ok(CAT.LEVEL_SCAN_MAX === 64 << 20 && ef.state === 'read' && ef.level && ef.level.declared === false && ef.level.whole === false && no.level.whole === true,
    'a declaration past the bound (80 MiB into a sparse file, the window ends 64 MiB after the catalog) is not read: the scan stays bounded — and the entry says the file was NOT read whole (a small file read to its end says it was)', { far: ef.level, small: no.level });
  const dP = path.join(dir, 'dataP');
  await CAT.noteBinary({ cmd: far, version: '2.1.992', dataDir: dP, which: (c) => c, event: () => { }, log: () => { } });
  ok(CAT.levelSignalOf('2.1.992') === 'partial', 'levelSignalOf says «partial» for a binary read only in part — never false («does not declare»)');
  CAT._reset();
  const never = () => new Promise(() => { });
  const cut = await CAT.readBinary(cli('2.1.993', DECL), { open: never, timeoutMs: 20 });
  ok(cut.retry === true && cut.level === undefined, 'a read cut short by its bound says nothing about the signal (tried again at a later tick)', { retry: cut.retry, level: cut.level });
  // the ledger: kept across a restart, read IN MEMORY, refused when malformed, an older reader's entry read once more
  const d1 = path.join(dir, 'data1'), f990 = cli('2.1.990', DECL);
  await CAT.noteBinary({ cmd: f990, version: '2.1.990', dataDir: d1, which: (c) => c, event: () => { }, log: () => { } });
  ok(CAT.levelSignalOf('2.1.990') === true && CAT.levelSignalOf('2.1.999') === null && CAT.levelSignalOf('') === null, 'levelSignalOf: the build read ⇒ true; a build never read ⇒ null (unknown), never false');
  CAT._reset(); CAT.boot({ dataDir: d1, event: () => { }, log: () => { } });
  ok(CAT.levelSignalOf('2.1.990') === true, 'after a restart the boot\'s ledger answers at once (no re-read)');
  const led = JSON.parse(fs.readFileSync(path.join(d1, CAT.LEDGER), 'utf8')); const k = led.current;
  const d2 = path.join(dir, 'data2'); fs.mkdirSync(d2);
  fs.writeFileSync(path.join(d2, CAT.LEDGER), JSON.stringify({ ...led, binaries: { [k]: { ...led.binaries[k], level: { declared: 'yes', at: 1 } } } }));
  CAT._reset(); CAT.boot({ dataDir: d2, event: () => { }, log: () => { } });
  ok(CAT.levelSignalOf('2.1.990') === null, 'a ledger entry whose level is not of the reader\'s shape is dropped at the load (what the load accepts is what the save writes)');
  const d3 = path.join(dir, 'data3'); fs.mkdirSync(d3);
  fs.writeFileSync(path.join(d3, CAT.LEDGER), JSON.stringify({ ...led, binaries: { [k]: { ...led.binaries[k], reader: 2, level: undefined } } }));
  CAT._reset(); CAT.boot({ dataDir: d3, event: () => { }, log: () => { } });
  const before = CAT.levelSignalOf('2.1.990');
  await CAT.noteBinary({ cmd: f990, version: '2.1.990', dataDir: d3, which: (c) => c, event: () => { }, log: () => { } });
  ok(before === null && CAT.levelSignalOf('2.1.990') === true, 'an entry an older reader wrote carries no level: unknown until this reader reads that binary once more (the next tick does)');
  CAT._reset();
  const src = fs.readFileSync(path.join(REPO, 'src/server/cli-model-catalog.js'), 'utf8');
  // RED: the early return as it was — after a boot the binary in use, read by an older reader, is never read once more
  const NE = '    if (st.key === key && l.current === key && l.binaries[key] && l.binaries[key].reader === CMC.READER_VERSION && !l.binaries[key].retry) return l.binaries[key];';
  if (src.split(NE).length !== 2) throw new Error('anchor missing: the early return');
  const mB = mutantCopies('level-signal-b', REPO).load('src/server/cli-model-catalog.js', anchored(src, NE, '    if (st.key === key && l.current === key && !(l.binaries[key] && l.binaries[key].retry)) return l.binaries[key];', 'boot-skips-reread'), 'boot-skips-reread');   // stale-pins: kept — the RED control re-creates the release's early return on purpose
  const d3b = path.join(dir, 'data3b'); fs.mkdirSync(d3b);
  fs.writeFileSync(path.join(d3b, CAT.LEDGER), JSON.stringify({ ...led, binaries: { [k]: { ...led.binaries[k], reader: 2, level: undefined } } }));
  mB.boot({ dataDir: d3b, event: () => { }, log: () => { } });
  await mB.noteBinary({ cmd: f990, version: '2.1.990', dataDir: d3b, which: (c) => c, event: () => { }, log: () => { } });
  ok(mB.levelSignalOf('2.1.990') === null, 'RED: with the early return as it was, a boot over an older reader\'s entry never reads the binary in use again — its level stays unknown until the CLI updates');
  const fn = src.slice(src.indexOf('function levelSignalOf('), src.indexOf('function status('));
  ok(fn.length > 100 && !/\bfs\.|require\(/.test(fn), 'levelSignalOf reads no file (the in-memory ledger only)');
}

console.log('C · the hub\'s judgment: the span is the FLOOR (src/conversation-facts.js trackedFacts)');
{
  const K = { keeps: { background: true, timers: true, lastRecordAt: true }, turn: 'idle' };
  const st = (v, more = []) => { const s = CF.factsFresh(); CF.factsStep(s, { type: 'system', subtype: 'init', claude_code_version: v }, 1); for (const r of more) CF.factsStep(s, r, 2); return s; };
  const t = (s, d) => CF.trackedFacts(s, { ...K, levelDeclared: d });
  // the first build ABOVE the span, READ from the module (B-9ff2 step 2: a pinned dump moves the span — 2.1.322 → 2.1.328 — so a typed
  // «2.1.323» fell inside it; the cure the tree already holds for its stand-ins: the span's own top, never typed)
  const ABOVE = CF.LEVEL_MEASURED_TO.split('.').map((x, i) => (i === 2 ? Number(x) + 1 : x)).join('.');
  ok(Array.isArray(t(st(ABOVE), () => true).background) && t(st(ABOVE), () => true).background.length === 0, 'a build outside the span whose binary DECLARES the signal: a never-published set is known-empty');
  ok(t(st(ABOVE), () => false).background === null && /does not declare the background signal/.test(t(st(ABOVE), () => false).backgroundWhy), 'a build whose binary does not declare it: unknown, said');
  ok(t(st(ABOVE), () => 'partial').background === null && /not found in the bytes read/.test(t(st(ABOVE), () => 'partial').backgroundWhy) && !/does not declare/.test(t(st(ABOVE), () => 'partial').backgroundWhy),
    '«could not look» is not «does not declare»: a binary read only in part reads unknown, «not found in the bytes read»');
  ok(t(st('2.1.200'), () => true).background === null && /2\.1\.200 is not measured for background tasks/.test(t(st('2.1.200'), () => true).backgroundWhy) && t(st('2.1.280'), () => true).background === null,
    'MUST (主开发 14:26Z) BELOW THE FLOOR STAYS UNKNOWN: an older build whose binary declares the signal is never asked — nothing ever measured it');
  ok(t(st(ABOVE), () => null).background === null && /above the measured span .* has not been read for the background signal yet/.test(t(st(ABOVE), () => null).backgroundWhy)
    && t(st(ABOVE), () => { throw new Error('x'); }).background === null && t(st(ABOVE)).background === null, 'not read yet, a reader that throws, or no reader: unknown, said');
  ok(Array.isArray(t(st('2.1.312'), () => false).background), 'inside the span the tracked dumps decide (the floor)');
  const open = st(ABOVE, [{ type: 'system', subtype: 'task_started', task_id: 't1', task_type: 'local_bash', is_backgrounded: true }]);
  ok(t(open, () => true).background === null && /the CLI's set omits a task it started and has not ended/.test(t(open, () => true).backgroundWhy), 'the doubts come first: a declared build with a started task the set does not name (and no ending record) still reads unknown');
  // the list wired to the catalog's in-memory answer
  const d4 = path.join(dir, 'data4');
  await CAT.noteBinary({ cmd: cli('2.1.995', DECL), version: '2.1.995', dataDir: d4, which: (c) => c, event: () => { }, log: () => { } });
  const S = COL.sourcesFrom({});
  const A = { backend: 'claude', mode: 'chat', name: 'A', cwd: '/tmp', _convFacts: st('2.1.995') };
  const known = { turnOf: () => 'idle', turnKnown: () => true, heldOf: () => 0, asksOf: () => [], goalOf: () => 'none', continueOf: () => ({ armed: false }), jobsOf: () => ({ running: 0, schedules: 0, nextFireAt: null, items: [] }),
    waitingOf: () => ({ notices: 0 }), handoverOf: () => false, browserOf: () => null, desktopOf: () => ({ desktop: null, window: false }), desktops: () => [], machineMem: async () => ({ memTotal: 1, memAvailable: 1 }), memOf: async () => 1 };
  const r = await COL.create({ activeSessions: new Map([['s1', A]]), keyOf: () => 'claude:e2e00000-0000-4000-8000-0000000000d5', capsOf: S.capsOf, levelDeclared: S.levelDeclared, ...known }).list();
  const row = r.conversations[0];
  ok(S.levelDeclared('2.1.995') === true && Array.isArray(row.background) && row.background.length === 0 && row.endable === true, 'the list asks the catalog\'s in-memory answer: a conversation on a declaring build outside the span is known-empty and endable', { bg: row.background, why: row.backgroundWhy, busy: row.busy });
  CAT._reset();
  // RED: the span alone (today's) — the declaring build reads unknown and the manager can end none of its conversations
  const src = fs.readFileSync(path.join(REPO, 'src/conversation-facts.js'), 'utf8');
  const N = '    if (d === true) out.background = [];\n    else {';
  if (src.split(N).length !== 2) throw new Error('anchor missing: the floor');
  const mC = mutantCopies('level-signal-c', REPO).load('src/conversation-facts.js', anchored(src, N, '    {', 'span-only'), 'span-only');
  ok(mC.trackedFacts(st(ABOVE), { ...K, levelDeclared: () => true }).background === null, `RED: the span alone reads a declaring ${ABOVE} «unknown» — the feature off from the first build above the span`);
  const NF = "  else if (!(/^\\d+(\\.\\d+)*/.test(st.cli) && versionCmp(st.cli, LEVEL_MEASURED_TO) > 0)) { out.background = null; out.backgroundWhy = `its CLI version ${st.cli} is not measured for background tasks (measured ${LEVEL_MEASURED_FROM}–${LEVEL_MEASURED_TO})`; }   // BELOW the floor: nothing ever measured it — never asked\n";
  if (src.split(NF).length !== 2) throw new Error('anchor missing: below the floor');
  const mF = mutantCopies('level-signal-floor', REPO).load('src/conversation-facts.js', anchored(src, NF, '', 'below-floor-asked'), 'below-floor-asked');
  ok(Array.isArray(mF.trackedFacts(st('2.1.200'), { ...K, levelDeclared: () => true }).background), 'RED: without the floor\'s branch a 2.1.200 build whose binary declares the signal reads «owns nothing» — on a build nothing ever measured');
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
