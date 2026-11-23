#!/usr/bin/env node
// test-transcript-pool-down.mjs — FAST (in-process): ROW B-422c (lane hub-loop-stalls, 主开发 r1006 — A for every road). AFTER A
// TRANSCRIPT-POOL FAILURE A READER READS NOTHING ON THE HUB'S LOOP AND SAYS SO BY NAME. The REAL pool made to refuse
// (src/adapters/codex.js transcriptPool().close(): every call answers 503), each road driven over a placed transcript in a
// scratch HOME; the transcript's SYNCHRONOUS reads on the main thread counted (readFileSync, openSync + readSync, statSync,
// lstatSync, readdirSync, existsSync of its path or folder), each road's longest loop turn printed. The six roads (the row's
// census of every reader that fell back after a pool failure):
//   ① the gap read (jsonlGapInfoAsync) ② the slab read (readJsonlLineRangeAsync) ③ the turn map (scanJsonlUserTurnsAsync)
//   ④ the Claude history (warmSessionJsonlAsync, then SessionMessages) ⑤ the codex history (CodexSessionMessages.rawAsync)
//   ⑥ the codex thread-metas walk (collectCodexThreadMetasAsync — the 5 s poll's listing)
// THE LAW: after the refusal NO CONTENT READ of the transcript (readSync / readFileSync of the file) on any road, and no WALK of the
// codex sessions folder (readdirSync) by the metas road; the three reads refuse by name (the transcript reader is restarting); the
// two histories answer «not loaded yet» (or their kept copy); the walk answers its kept listing (or «not known»). A stat or an
// existsSync of the file and the codex rollout FINDER's walk run with the pool up too (the finder is row B-a60e's): printed, not
// judged here. RED: the base (c80f44e8b-20261121043050-box: every road read the transcript).
// THEN, by stand-ins in the real pool's place (_setTranscriptPoolForTest): ④b the HTTP road (transcript-service page) says
// «not loaded»; EVERY refusal kind (no worker, no idle worker, a deadline, a hung path, the history lane's bound and wait) is the
// refusal by name, a deadline / hung path the STORAGE's; an op's own error and the device's IN-PLACE road are no pool failure
// (⑤b: the codex history reads the old road there, «not loaded» on the hub's pool); ④c the Claude history's kept copy BEHIND the
// file is answered tagged «not loaded»; the note ends on any warm's end but the refusal; a hung path ⇒ the parse asks no warm.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import './scratch.mjs';   // FIRST (§113, B-ba47's order): a temp home of its own before any of this suite's code
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import * as RQ from '../src/lib/history-reask.js';   // row B-422c (r1461): the page's re-ask decision, PURE

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
// the scratch HOME first: the product reads ~/.claude and ~/.codex through os.homedir() — some at module load
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tpd-'));
process.on('exit', () => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch (e) { process.stderr.write(`the scratch ${HOME} could not be removed: ${e.message}\n`); } });
for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) process.on(sig, () => process.exit(128 + n));
process.env.HOME = HOME;
process.env.VIBESPACE_SKIP_AGENT_HOOKS = '1';
const NOW = Date.now();

// THE PROBE, armed BEFORE any product module loads (a module that destructures `fs` at load gets the counting functions)
const watched = [];   // path prefixes of the placed transcripts
const fdPath = new Map();
let counting = null;   // {reads: [...]} while a road runs
const under = (p) => { const s = String(p); return watched.some((w) => s === w || s.startsWith(w + path.sep)); };
const note = (name, p) => { if (counting && under(p)) counting.reads.push(`${name} ${path.relative(HOME, String(p))}`); };
for (const name of ['readFileSync', 'statSync', 'lstatSync', 'readdirSync', 'existsSync', 'realpathSync']) {
  const real = fs[name];
  fs[name] = function (p, ...a) { note(name, p); return real.call(this, p, ...a); };
}
{ const real = fs.openSync; fs.openSync = function (p, ...a) { const fd = real.call(this, p, ...a); if (under(p)) fdPath.set(fd, String(p)); else fdPath.delete(fd); return fd; }; }
{ const real = fs.readSync; fs.readSync = function (fd, ...a) { if (fdPath.has(fd)) note('readSync', fdPath.get(fd)); return real.call(this, fd, ...a); }; }
(await import('node:module')).syncBuiltinESMExports();

// THE PLACED TRANSCRIPTS (~3 MB each; the shapes the parsers read)
const cwd = path.join(HOME, 'work', 'project-a');
fs.mkdirSync(cwd, { recursive: true });
const SS0 = require(path.join(REPO, 'src/session-store.js'));
const sid = '11111111-2222-4333-8444-555555555555', tid = '019a0000-1111-7222-8333-444444444444';
const projDir = path.join(HOME, '.claude', 'projects', SS0.cwdToProjectDir(cwd)), claudeFp = path.join(projDir, sid + '.jsonl');
fs.mkdirSync(projDir, { recursive: true });
{
  const lines = [];
  for (let k = 0; k < 6000; k++) {
    const user = k % 2 === 0;
    lines.push(JSON.stringify({ type: user ? 'user' : 'assistant', uuid: `u-${k}`, parentUuid: k ? `u-${k - 1}` : null, sessionId: sid, cwd, timestamp: new Date(NOW - (6000 - k) * 1000).toISOString(),
      message: user ? { role: 'user', content: `a question ${k} ` + 'q'.repeat(300) } : { role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: `an answer ${k} ` + 'a'.repeat(300) }] } }));
  }
  fs.writeFileSync(claudeFp, lines.join('\n') + '\n');
}
const codexDir = path.join(HOME, '.codex', 'sessions', '2026', '11', '20'), codexFp = path.join(codexDir, `rollout-2026-11-20T00-00-00-${tid}.jsonl`);
fs.mkdirSync(codexDir, { recursive: true });
{
  const lines = [JSON.stringify({ timestamp: new Date(NOW - 7e6).toISOString(), type: 'session_meta', payload: { id: tid, cwd, originator: 'codex_cli_rs', cli_version: '0.153.0' } })];
  for (let k = 0; k < 6000; k++) {
    const user = k % 2 === 0;
    lines.push(JSON.stringify({ timestamp: new Date(NOW - (6000 - k) * 1000).toISOString(), type: 'response_item', payload: { type: 'message', role: user ? 'user' : 'assistant', content: [{ type: user ? 'input_text' : 'output_text', text: `${user ? 'a question' : 'an answer'} ${k} ` + 'c'.repeat(300) }] } }));
  }
  fs.writeFileSync(codexFp, lines.join('\n') + '\n');
}
watched.push(claudeFp, projDir, path.join(HOME, '.codex'));
console.log(`the placed transcripts: Claude ${fs.statSync(claudeFp).size} bytes, codex ${fs.statSync(codexFp).size} bytes (scratch HOME ${HOME})`);

// THE REAL POOL, made to refuse
const C = require(path.join(REPO, 'src/adapters/codex.js'));
const pool = C.transcriptPool();
ok(!!pool && typeof pool.close === 'function', 'premise: this process has the real transcript pool');
pool.close();
let probe0 = null; try { await pool.call('gapInfo', { fp: claudeFp }); } catch (e) { probe0 = e; }
ok(!!probe0 && probe0.status === 503, `premise: the real pool refuses every call (${probe0 && probe0.message})`);

/** one road: its answer (or its refusal), the transcript's sync reads on the main thread, the longest loop turn */
async function road(name, fn) {
  const r = { name, reads: [], longest: 0 };
  let spin = true, last = performance.now();
  const tick = () => { const t = performance.now(); if (t - last > r.longest) r.longest = t - last; last = t; if (spin) setImmediate(tick); };
  setImmediate(tick);
  counting = r;
  try { r.out = await fn(); } catch (e) { r.err = { code: e && e.code, status: e && e.status, message: String((e && e.message) || e).slice(0, 160) }; }
  finally { counting = null; spin = false; }
  await new Promise((res) => setImmediate(res));
  r.longest = Math.round(r.longest);
  console.log(`  · ${name}: ${r.reads.length} sync read(s) of the transcript on the main thread${r.reads.length ? ` (${[...new Set(r.reads)].slice(0, 4).join(', ')})` : ''}; the longest turn ${r.longest} ms; ${r.err ? `refused: ${r.err.code || r.err.status} «${r.err.message}»` : `answered ${JSON.stringify(r.out === undefined ? null : Array.isArray(r.out) ? `[${r.out.length}]` : r.out && typeof r.out === 'object' ? Object.keys(r.out).slice(0, 6) : r.out).slice(0, 120)}`}`);
  return r;
}
const content = (r) => r.reads.filter((x) => /^(readSync|readFileSync) /.test(x)), walks = (r) => r.reads.filter((x) => /^readdirSync /.test(x));
const byName = (r) => !!(r.err && /restarting|try again|transcript_reader/i.test(`${r.err.code} ${r.err.message}`)) || !!(r.out && typeof r.out === 'object' && /restarting|not loaded/i.test(String(r.out.refused || r.out.notLoaded || '')));

console.log('the six roads, the pool refusing');
const R1 = await road('① the gap read', () => C.jsonlGapInfoAsync(claudeFp));
const R2 = await road('② the slab read', () => C.readJsonlLineRangeAsync(claudeFp, 100, 400));
const R3 = await road('③ the turn map', () => C.scanJsonlUserTurnsAsync(claudeFp, 'claude'));
const R4 = await road('④ the Claude history (the warm, then the reader)', async () => {
  const warmed = await SS0.warmSessionJsonlAsync(sid, cwd);
  const m = new SS0.SessionMessages({ backend: 'claude', claudeSessionId: sid, cwd, buffer: '' }, sid, {});
  m._ensureParsed();
  return { warmed, records: Array.isArray(m._all) ? m._all.length : null, notLoaded: m.notLoaded || null };
});
const CS = require(path.join(REPO, 'src/codex-session-store.js'));
// the codex rollout's FINDER walk and its head's meta read (extractCodexThreadMeta) run with the pool up too — rows B-a60e and the
// meta cache, not this row's fallback: made before the road, so the road's reads are its own (the head read then costs one stat)
C.findCodexSessionJsonlPath(tid); C.extractCodexThreadMeta(codexFp);
const R5 = await road('⑤ the codex history (rawAsync)', async () => {
  const m = new CS.CodexSessionMessages({ backend: 'codex', backendSessionId: tid, cwd, buffer: '' }, tid, {});
  const all = await m.rawAsync();
  return { records: Array.isArray(all) ? all.length : null, notLoaded: m.notLoaded || null };
});
const R6 = await road('⑥ the codex thread-metas walk', () => CS.collectCodexThreadMetasAsync());
// ④b THE HTTP ROAD (/api/session-messages → transcript-service page): the answer built on a refused reader SAYS it
const TS = require(path.join(REPO, 'src/transcript-service.js'));
const svc = TS.createTranscriptService({ activeSessions: new Map(), createSessionMessages: (shape, id) => new SS0.SessionMessages(shape, id || 'api', {}), hosts: null });
const R4b = await road('④b the Claude history over HTTP (transcript-service page)', () => svc.page({ backend: 'claude', sessionId: sid, cwd, memo: {} }));

for (const r of [R1, R2, R3]) ok(content(r).length === 0 && byName(r), `${r.name}: reads NOTHING of the transcript on the loop after the pool's refusal and refuses by name (${content(r).length} content reads, the longest turn ${r.longest} ms)`, { reads: r.reads.slice(0, 6), err: r.err, out: r.out });
for (const r of [R4, R5]) ok(content(r).length === 0 && !!(r.out && r.out.notLoaded), `${r.name}: reads NOTHING of the transcript on the loop and answers «not loaded yet» (${content(r).length} content reads, the longest turn ${r.longest} ms)`, { reads: r.reads.slice(0, 6), out: r.out, err: r.err });
ok(walks(R6).length === 0 && content(R6).length === 0 && !R6.err && R6.out === null, `${R6.name}: walks NOTHING on the loop — answers its kept listing: none yet, «not known» (null, never a throw; ${walks(R6).length} folder reads, the longest turn ${R6.longest} ms)`, { reads: R6.reads.slice(0, 6), out: Array.isArray(R6.out) ? R6.out.length : R6.out, err: R6.err });
ok(content(R4b).length === 0 && !R4b.err && R4b.out && R4b.out.notLoaded === 'transcript_reader_restarting' && Array.isArray(R4b.out.messages), `${R4b.name}: reads NOTHING on the loop and its answer carries «not loaded yet» (notLoaded — the page's fetch fails, the view that stands kept; ${content(R4b).length} content reads)`, { reads: R4b.reads.slice(0, 6), out: R4b.out && { notLoaded: R4b.out.notLoaded, n: (R4b.out.messages || []).length }, err: R4b.err });

// ── EVERY REFUSAL KIND, by stand-ins in the real pool's place (src/adapters/codex.js _setTranscriptPoolForTest) ──
console.log('every refusal kind of the pool, and what is NOT a pool failure');
const refusing = (shape, extra = {}) => ({ calls: [], ...extra, call(op) { this.calls.push(op); return Promise.reject(Object.assign(new Error(`a stand-in's ${shape.code || (shape.safeFsTimeout ? 'deadline' : 'refusal')}`), shape)); } });
const KINDS = [
  ['no worker', { status: 503, code: 'no-worker' }, false], ['no idle worker', { status: 503, code: 'no-idle-worker' }, false],
  ['a hung path', { status: 503, code: 'path-hung' }, true],
  ['the history lane\'s heap bound', { code: 'heap_bound' }, false], ['the history lane busy past its wait', { code: 'history_busy' }, false],
  ['a blocked mount (the door\'s storage-blocked)', { status: 503, code: 'storage-blocked' }, true],
];
// A DEADLINE names the CALL that ran it out, not the file that hung: the storage's when the pool's own memory remembers THIS file
// (the op the worker was running); a call queued behind another file's hung op is no storage's — that other file is
KINDS.push(['a deadline of the call itself (the pool remembers its file)', { status: 503, safeFsTimeout: true }, true, { _hungOf: (pl) => (pl && pl.fp === claudeFp ? { path: claudeFp, ms: 30000 } : null) }]);
KINDS.push(['a deadline of a call QUEUED behind another file\'s hung op (the pool remembers that other file)', { status: 503, safeFsTimeout: true }, false, { _hungOf: (pl) => (pl && pl.fp === '/elsewhere/other.jsonl' ? { path: '/elsewhere/other.jsonl', ms: 30000 } : null) }]);
for (const [name, shape, hung, extra] of KINDS) {
  C._setTranscriptPoolForTest(refusing(shape, extra || {}));
  let e = null; try { await C.jsonlGapInfoAsync(claudeFp); } catch (x) { e = x; }
  ok(!!e && e.code === 'transcript_reader_restarting' && e.status === 503 && e.storageHung === hung, `${name} ⇒ the refusal by name (transcript_reader_restarting, 503, the storage's: ${hung})`, { code: e && e.code, status: e && e.status, storageHung: e && e.storageHung });
}
// ── r3077 (主开发): THE NOTICE NAMES THE CAUSE IT HAS — each refusal kind PLACED at the fetch: the refusal by name → the HTTP answer's
// facts (readerRefusedAnswer) → the page's words (src/lib/reader-words.js, the one table of the toast, the line and the search): the
// storage's, a gone reader's, a BUSY or BOUNDED reader's, a RESTARTING one's; a refusal whose cause is not known names NO cause (never
// «restarting»). RED: the page's old rule — every refusal neither the storage's nor a gone reader's said «restarting» — tells a busy
// reader it is restarting
{
  const RW = await import(pathToFileURL(path.join(REPO, 'src/lib/reader-words.js')).href);
  const WORDS = { storage: 'not answering', gone: 'is not running', busy: 'is busy', restarting: 'is restarting', none: 'could not be read just now' };
  const PLACED = [
    ...KINDS.map(([name, shape, hung, extra]) => [name, shape, extra || {}, hung ? 'storage' : shape.code === 'no-worker' ? 'restarting' : 'busy']),
    ['a 503 that names nothing (no code, no deadline)', { status: 503 }, {}, null],
    ['a deadline while no worker of the pool ever ran (none could start)', { status: 503, safeFsTimeout: true, noWorker: true }, {}, 'restarting'],
  ];
  const bad = [];
  for (const [name, shape, extra, want] of PLACED) {
    C._setTranscriptPoolForTest(refusing(shape, extra));
    let e = null; try { await C.jsonlGapInfoAsync(claudeFp); } catch (x) { e = x; }
    const body = e ? C.readerRefusedAnswer(e).body : null, kind = RW.readerKindOf(body), ask = RW.readerAskWords(body, '12:00:00'), line = RW.readerLineWords(body, '12:00:00');
    const key = want || 'none';
    if (!body || kind !== want || !ask.includes(WORDS[key]) || !line.includes(WORDS[key]) || (key !== 'restarting' && (ask.includes('restarting') || line.includes('restarting')))) bad.push({ name, want, kind, cause: body && body.readerCause, ask });
  }
  ok(!bad.length, `r3077: each refusal kind placed at the fetch is said by the cause it HAS — ${PLACED.length} kinds (the storage's, a busy or bounded reader's, a restarting one's, none named when not known); none but a restarting reader is told «restarting»`, bad);
  // a reader gone for good (the pool closed): its own words, and a listing with no time promises none
  C._setTranscriptPoolForTest({ _closed: true, calls: [], call() { return Promise.reject(Object.assign(new Error('safeFs closed'), { status: 503 })); } });
  let eg = null; try { await C.jsonlGapInfoAsync(claudeFp); } catch (x) { eg = x; }
  const bg = eg ? C.readerRefusedAnswer(eg).body : null;
  ok(!!bg && RW.readerKindOf(bg) === 'gone' && RW.readerAskWords(bg, '12:00:00').includes(WORDS.gone) && RW.readerAskWords({ readerGone: true }, null) === 'The transcript reader is not running.' && RW.readerLineWords(bg, '12:00:00').includes(WORDS.gone),
    'r3077: a reader gone for good (its pool closed) is said gone — with its next try, and a listing with none promises no time', bg);
  // the history-ask's own «not loaded» (its read gave nothing: no facts) names no cause
  ok(RW.readerKindOf(null) === null && RW.readerLineWords(null, 'x').includes(WORDS.none) && !RW.readerLineWords(null, 'x').includes('restarting'), 'r3077: «not loaded» with no facts (the hub\'s history-ask that read nothing) names no cause');
  // RED: the page's OLD RULE (the cause never read: everything else «restarting») — a busy reader is told «restarting»
  const RWsrc = fs.readFileSync(path.join(REPO, 'src/lib/reader-words.js'), 'utf8');
  let red = anchored(RWsrc, "  return info.readerCause === 'busy' || info.readerCause === 'restarting' ? info.readerCause : null;\n", "  return 'restarting';\n", 'reader-old-rule');   // stale-pins: kept — the old rule, planted back as the RED
  red = anchored(red, "import { t } from './i18n.js';", `import { t } from ${JSON.stringify(pathToFileURL(path.join(REPO, 'src/lib/i18n.js')).href)};`, 'reader-old-rule-i18n');
  const redDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pool-down-r3077-')), redFile = path.join(redDir, 'reader-words-old.mjs');
  fs.writeFileSync(redFile, red);
  const RWold = await import(pathToFileURL(redFile).href);
  C._setTranscriptPoolForTest(refusing({ code: 'history_busy' }));
  let eb = null; try { await C.jsonlGapInfoAsync(claudeFp); } catch (x) { eb = x; }
  const bb = eb ? C.readerRefusedAnswer(eb).body : null;
  ok(!!bb && bb.readerCause === 'busy' && RWold.readerAskWords(bb, 'x').includes('is restarting'), `RED: the page's old rule tells a BUSY reader «${RWold.readerAskWords(bb, 'x')}»`, bb);
  fs.rmSync(redDir, { recursive: true, force: true });
}
{
  C._setTranscriptPoolForTest(refusing({ code: 'EACCES' }));
  let e = null; try { await C.jsonlGapInfoAsync(claudeFp); } catch (x) { e = x; }
  ok(!!e && e.code === 'EACCES', 'an error of the op itself (EACCES) stays what it was — never named a pool failure', { code: e && e.code });
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' }, { inPlace: true }));
  e = null; try { await C.jsonlGapInfoAsync(claudeFp); } catch (x) { e = x; }
  ok(!!e && e.code === 'no-worker', 'the device\'s IN-PLACE road (no worker script: its own loop) is no pool failure — its error passes as before', { code: e && e.code });
}
// SafeFs's own `no-idle-worker` (an `idleOnly` call while every worker is busy) is ORDINARY LOAD — never a refusal of every call
// (round w5gioyat2 asked; POOL_WIDE spelled it `no-idle`, a code SafeFs never sends — as pool-wide, every Claude parse would answer
// «not loaded» for 30 s under load). The control: «no worker» is one.
C._setTranscriptPoolForTest({ call: async () => null }); try { await C.jsonlGapInfoAsync(claudeFp); } catch { }   // an answer ends the pool-wide mark
ok(!C.poolRefusing(), 'premise: the pool answered — nothing refuses every call');
C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-idle-worker' })); try { await C.jsonlGapInfoAsync(claudeFp); } catch { }
ok(!C.poolRefusing() && !C.poolGone(), 'SafeFs\'s «no idle worker» (no-idle-worker: every worker busy) is ordinary load — never a refusal of every call (poolRefusing)');
C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' })); try { await C.jsonlGapInfoAsync(claudeFp); } catch { }
ok(C.poolRefusing() && !C.poolGone(), 'the control: «no worker» refuses every call for a while — and is not a pool GONE (its storage retry still asks the pool)');
// THE ARTIFACT PASS's own whole-file paged read (note: false) marks nothing of the file — a page past its deadline on a big healthy
// file never makes the person's history «not loaded» (r1243 item 5); the control (a history read): the storage's
{
  const fpA = path.join(projDir, 'artifact-only.jsonl');
  C._setTranscriptPoolForTest(refusing({ status: 503, safeFsTimeout: true, deadline: true }));
  await C.readJsonlBoundedParsedPagedAsync(fpA, { tailOnly: false, slot: 'helper', note: false });
  const quiet = !C.fileRefused(fpA) && !C.fileStorageHung(fpA);
  await C.readJsonlBoundedParsedPagedAsync(fpA, { tailOnly: false });
  ok(quiet && C.fileStorageHung(fpA), 'the artifact pass\'s paged read marks nothing of the file (its deadline never the person\'s history); the control, a history read: the storage\'s', { quiet, control: C.fileStorageHung(fpA) });
}
// the codex history: the pool's refusal ⇒ «not loaded yet», nothing parsed here; on the in-place road and for the op's own error ⇒
// the old road (the sync parse, said) — as before this row
{
  const parse = (pool) => { C._setTranscriptPoolForTest(pool); return CS.parseCodexSessionJsonlAsync(tid, { fp: codexFp }); };
  const Rb = await road('⑤b the codex history, the heap bound on the hub\'s pool', () => parse(refusing({ code: 'heap_bound' })).then((r) => ({ n: r.length, notLoaded: r.notLoaded || null })));
  ok(content(Rb).length === 0 && Rb.out && Rb.out.n === 0 && Rb.out.notLoaded === 'transcript_reader_restarting', `${Rb.name}: «not loaded yet», nothing parsed on the loop (${content(Rb).length} content reads)`, { out: Rb.out, err: Rb.err });
  const ip = await parse(refusing({ code: 'heap_bound' }, { inPlace: true }));
  ok(ip.length > 1000 && !ip.notLoaded, `the same bound on the device's IN-PLACE road ⇒ the old road (its own loop): ${ip.length} records, as before this row`, { n: ip.length, notLoaded: ip.notLoaded });
  const oe = await parse(refusing({ code: 'EIO' }));
  ok(oe.length > 1000 && !oe.notLoaded, `an error of the op itself (EIO) on the hub's pool ⇒ the old road, said: ${oe.length} records`, { n: oe.length, notLoaded: oe.notLoaded });
}

// ── THE CLAUDE HISTORY'S NOTE: a kept copy, the storage's refusal, the note's end ──
console.log('the Claude history\'s note');
C._setSlicedForTest({ storageRetryMs: 0 });   // the storage's retry due at once (its gap has its own leg at the end)
const TW = require(path.join(REPO, 'src/transcript-worker.js'));
const up = () => ({ calls: [], call(op, payload) { this.calls.push(op); return Promise.resolve(TW.runOp(op, payload)).then((x) => x.result); } });
{
  const P = up(); C._setTranscriptPoolForTest(P);
  // the refusal kinds above left the file the STORAGE's (the mark stands until a history read answers): a history read the pool
  // answers ends it — as at a hub whose storage came back
  try { await C.readJsonlTailAsync(claudeFp, { dropSubagent: true }); } catch { }
  ok(!C.fileStorageHung(claudeFp) && !C.fileRefused(claudeFp), 'premise of the note legs: a history read answered — no refusal of the file stands');
  const warmed = await SS0.warmSessionJsonlAsync(sid, cwd);   // the pool answers: the cache holds the 3 MB tail, the note (road ④'s) cleared
  const whole = SS0.parseSessionJsonl(sid, cwd);
  ok(warmed === true && Array.isArray(whole) && whole.length > 1000 && !whole.notLoaded, `the pool answering: the warm reads it, the note ends — ${whole.length} records, loaded`, { warmed, n: whole.length, notLoaded: whole.notLoaded });
  // the file REWRITTEN (not an append — the warm asks the pool for a full read), the pool then refusing: the kept copy is BEHIND
  const lines = fs.readFileSync(claudeFp, 'utf8').split('\n').filter(Boolean);
  // A REWRITE is a new file under the same name (its temp renamed over it): the warm's whole read of it lands. The same inode cut
  // shorter in place reads as an OLDER copy to B-cd4b's r935 (a) (a cached entry of that inode at least as large stays — the put that
  // keeps a newer append from being overwritten by a warm that waited), and every leg below asks for the rewrite's read
  const rewrite = (n) => { const tmp = claudeFp + '.rw'; fs.writeFileSync(tmp, lines.slice(0, n).join('\n') + '\n'); fs.renameSync(tmp, claudeFp); };
  rewrite(2000);
  const N = refusing({ status: 503, code: 'no-worker' }); C._setTranscriptPoolForTest(N);
  // THE ASKS of the pool for a history: a warm's are its pager's first page (B-cd4b unit 2) and, after a refusal that is not the
  // storage's, its one-shot `jsonlTail` (a storage's refusal throws at page 0: one); a STORAGE RETRY's first is its PROBE (主开发
  // r2344 (1): one small read under a short bound, on the general pool) — so a warm refused by the storage, or a refused storage retry,
  // is ONE ask
  const tails = (P) => P.calls.filter((o) => o === 'boundedParsedPage' || o === 'jsonlTail' || o === 'probe').length;
  const Rk = await road('④c the Claude history, its kept copy behind the file', async () => {
    const w = await SS0.warmSessionJsonlAsync(sid, cwd), asked = tails(N);
    const m = new SS0.SessionMessages({ backend: 'claude', claudeSessionId: sid, cwd, buffer: '' }, sid, {});
    m._ensureParsed();
    await new Promise((res) => setImmediate(res));
    return { warmed: w, records: Array.isArray(m._all) ? m._all.length : null, notLoaded: m.notLoaded || null, warmAsks: asked, afterParse: tails(N) };
  });
  ok(content(Rk).length === 0 && Rk.out && Rk.out.records === whole.length && Rk.out.notLoaded === 'transcript_reader_restarting', `${Rk.name}: the kept copy (${Rk.out && Rk.out.records} records) is answered TAGGED «not loaded» — the attach keeps the history unloaded, the next reads again (${content(Rk).length} content reads)`, { out: Rk.out, err: Rk.err });
  ok(!!Rk.out && Rk.out.warmAsks === 2 && Rk.out.afterParse === 4, `a refusal that is not the storage's ⇒ the parse asks the warm again, off the loop (${Rk.out && Rk.out.afterParse - Rk.out.warmAsks} more reads: one more warm — its page, then its one-shot)`, Rk.out);
  // the note ENDS on any end but the refusal: an op's own error (EACCES) — the next parse is the old road's (no «not loaded»)
  C._setTranscriptPoolForTest(refusing({ code: 'EACCES' }));
  await SS0.warmSessionJsonlAsync(sid, cwd);
  const after = SS0.parseSessionJsonl(sid, cwd);
  ok(Array.isArray(after) && !after.notLoaded && after.length === 2000, `the note ends when a warm ends in anything but the refusal (an op's own EACCES): the parse is the old road again (${after.length} records, no «not loaded»)`, { n: after.length, notLoaded: after.notLoaded });
  // THE STORAGE'S REFUSAL: a hung path. From a FRESH note (a warm that READ ends the last one — at any tree: the rate limit of an
  // older note never answers for the guard), the file rewritten (never an append — that one is folded in inline)
  C._setTranscriptPoolForTest(up()); await SS0.warmSessionJsonlAsync(sid, cwd);
  rewrite(1500);
  const H = refusing({ status: 503, code: 'path-hung' }); C._setTranscriptPoolForTest(H);
  await SS0.warmSessionJsonlAsync(sid, cwd);
  const asked0 = tails(H);
  SS0.parseSessionJsonl(sid, cwd); SS0.parseSessionJsonl(sid, cwd);
  await new Promise((res) => setImmediate(res));
  ok(asked0 === 1 && tails(H) === asked0, `a hung path (the storage's) ⇒ the parse asks no warm again (${tails(H) - asked0} more asks after two parses; the warm itself asked ${asked0})`, { asked0, asked1: tails(H) });
  { const pi = SS0.parseSessionJsonl(sid, cwd);
    ok(pi.notLoaded && pi.storageHung === true && typeof pi.retryAt === 'number' && pi.retryAt > Date.now(), `r1243 item 1: the storage's «not loaded» says its door (storageHung) and its next try (at +${pi.retryAt - Date.now()} ms) — the page's words and its own re-ask read them`, { storageHung: pi.storageHung, retryAt: pi.retryAt }); }
  // …and a warm while the storage's note stands (an attach's, a page's) runs NOTHING on this loop — no find, no stat: the pool alone
  const Rh = await road('④d a warm while the storage\'s note stands', () => SS0.warmSessionJsonlAsync(sid, cwd));
  ok(Rh.reads.length === 0 && Rh.out === false && tails(H) === asked0 + 1, `${Rh.name}: ${Rh.reads.length} sync calls of any kind on the transcript (no find, no stat) — the pool alone was asked (${tails(H) - asked0} ask), refused again`, { reads: Rh.reads.slice(0, 6), out: Rh.out });
  // THE STORAGE'S NOTE STAYS THE STORAGE'S: its own retry refused by another kind (no worker — between a deadline kill and the
  // respawn) ⇒ still no re-warm from the parse
  const Nw = refusing({ status: 503, code: 'no-worker' }); C._setTranscriptPoolForTest(Nw);
  await SS0.warmSessionJsonlAsync(sid, cwd);
  const w0 = tails(Nw);
  SS0.parseSessionJsonl(sid, cwd);
  await new Promise((res) => setImmediate(res));
  ok(w0 === 1 && tails(Nw) === w0, `the hung storage's retry refused as «no worker» ⇒ the note stays the storage's: the parse asks no warm (${tails(Nw) - w0} more)`, { w0, w1: tails(Nw) });
  // the hung note's two ENDS: the pool answers (the note ends, the history loads) …
  C._setTranscriptPoolForTest(up());
  const okEnd = await SS0.warmSessionJsonlAsync(sid, cwd), loaded = SS0.parseSessionJsonl(sid, cwd);
  ok(okEnd === true && !loaded.notLoaded && loaded.length === 1500, `the hung note ends when the pool answers its retry: the history loads (${loaded.length} records, no «not loaded»)`, { okEnd, n: loaded.length, notLoaded: loaded.notLoaded });
  // … or the op's own error (the note ends; the parse is the old road)
  rewrite(1200);
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'path-hung' })); await SS0.warmSessionJsonlAsync(sid, cwd);
  // the retry's read meets its own error (EACCES): the probe answers as the real worker's does (fileIsZst swallows every error of its
  // read — the probe has no op error of its own), the paged read after it meets the EACCES
  C._setTranscriptPoolForTest({ calls: [], call(op, payload) { this.calls.push(op); if (op === 'probe') return Promise.resolve(TW.runOp(op, payload)).then((x) => x.result); return Promise.reject(Object.assign(new Error("a stand-in's EACCES"), { code: 'EACCES' })); } });
  await SS0.warmSessionJsonlAsync(sid, cwd);
  const opEnd = SS0.parseSessionJsonl(sid, cwd);
  ok(!opEnd.notLoaded && opEnd.length === 1200, `the hung note ends on its retry's own op error (EACCES): the old road (${opEnd.length} records)`, { n: opEnd.length, notLoaded: opEnd.notLoaded });
  // TWO WARMS OF ONE SESSION AT ONCE ARE ONE (joined): the second ask while the first reads is the SAME read — never a second
  // history read of the file sent to the pool (unjoined re-warms queued reads whose deadlines ended workers)
  rewrite(1000);
  let release = null, held = false;   // the pager's FIRST page held (the warm's read in flight); its later pages answer at once
  const D = { calls: [], call(op, payload) { this.calls.push(op); if (op === 'boundedParsedPage' && !held) { held = true; return new Promise((res) => { release = () => res(Promise.resolve(TW.runOp(op, payload)).then((x) => x.result)); }); } return Promise.resolve(TW.runOp(op, payload)).then((x) => x.result); } };
  C._setTranscriptPoolForTest(D);
  const w1 = SS0.warmSessionJsonlAsync(sid, cwd), w2 = SS0.warmSessionJsonlAsync(sid, cwd);
  await new Promise((res) => setImmediate(res));
  const askedTails = tails(D);
  if (release) release();
  const [o1, o2] = await Promise.all([w1, w2]);
  ok(w1 === w2 && askedTails === 1 && o1 === true && o2 === true, `two warms of one session at once are ONE (the same read: ${askedTails} tail read asked of the pool)`, { same: w1 === w2, askedTails });
  // A LATE REFUSAL NEVER HIDES A CURRENT COPY: the file read (the cache IS the file), then a refusal of it lands — the parse reads
  // nothing on the loop and answers the copy LOADED (one stat shows it is the file)
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' })); try { await C.readJsonlTailAsync(claudeFp, { dropSubagent: true }); } catch { }   // a HISTORY read refused (a gap read's refusal says nothing of the tail)
  const Rl = await road('a parse after a late refusal of a file the cache holds whole', () => { const l = SS0.parseSessionJsonl(sid, cwd); return { n: l.length, notLoaded: l.notLoaded || null }; });
  ok(Rl.out && !Rl.out.notLoaded && Rl.out.n === 1000 && content(Rl).length === 0, `${Rl.name}: LOADED (${Rl.out && Rl.out.n} records), nothing read on the loop (${content(Rl).length})`, { out: Rl.out, reads: Rl.reads.slice(0, 4) });
  // ONE TAGGED TWIN per kept entry (the merge memo keys on the array): two parses under one note answer the SAME list
  rewrite(800);
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' })); await SS0.warmSessionJsonlAsync(sid, cwd);
  const t1 = SS0.parseSessionJsonl(sid, cwd), t2 = SS0.parseSessionJsonl(sid, cwd);
  ok(t1 === t2 && t1.notLoaded === 'transcript_reader_restarting' && t1.length === 1000, `the kept copy's tagged twin is ONE per cache entry (the same list twice: the merge memo hits; ${t1.length} records, tagged)`, { same: t1 === t2, n: t1.length, notLoaded: t1.notLoaded });
  // (1) A REFUSAL OF ANOTHER KIND NEVER UNHANGS THE STORAGE'S HOLD: a hung path, then «no worker» for the same file — the parse
  // asks no warm while the hold stands
  await SS0.warmSessionJsonlAsync(sid, cwd);   // SETTLED: a re-warm the last parse asked (under the stand-in before) ends first — warms of one session join
  const H1 = refusing({ status: 503, code: 'path-hung' }); C._setTranscriptPoolForTest(H1);
  rewrite(700);
  await SS0.warmSessionJsonlAsync(sid, cwd);   // the storage's: the file's record holds it
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' })); try { await C.readJsonlTailAsync(claudeFp, { dropSubagent: true }); } catch { }   // a HISTORY read refused as «no worker»
  C._setTranscriptPoolForTest(H1);
  const h1a = tails(H1); SS0.parseSessionJsonl(sid, cwd); await new Promise((res) => setImmediate(res));
  ok(C.fileStorageHung(claudeFp) && tails(H1) === h1a, `a refusal of another kind (no worker) after a hung path never unhangs it: the parse asks no warm (${tails(H1) - h1a} more)`);
  // (2) A HISTORY READ'S ANSWER FORGIVES THE FILE (the pool read it): after the hung path, the pool answers the retry — loaded, no
  // refusal of it stands
  C._setTranscriptPoolForTest(up());
  const okRead = await SS0.warmSessionJsonlAsync(sid, cwd);   // the storage's: the pool alone — it answers
  const loaded2 = SS0.parseSessionJsonl(sid, cwd);
  ok(okRead === true && !C.fileRefused(claudeFp) && !C.fileStorageHung(claudeFp) && !loaded2.notLoaded && loaded2.length === 700, `a history read's answer forgives the file (the pool read it): loaded (${loaded2.length} records), no refusal of it stands`, { okRead, n: loaded2.length });
  // (3) A TASK SCAN'S ANSWER NEVER FORGIVES THE TAIL'S REFUSAL (the whole-state read's MUST): the tail read refused («storage worker
  // restarted»: another file hung on its worker), the task scan answered on the other worker AFTER it — the parse still reads
  // nothing on the loop (RED: any answer forgave the file; the parse then read it whole)
  rewrite(600);
  const split = { calls: [], call(op, payload) { this.calls.push(op); if (op === 'boundedParsedPage' || op === 'jsonlTail') return Promise.reject(Object.assign(new Error('storage worker restarted'), { status: 503 })); return new Promise((res) => setTimeout(() => res(TW.runOp(op, payload).result), 5)); } };
  C._setTranscriptPoolForTest(split);
  await SS0.warmSessionJsonlAsync(sid, cwd);
  const Rt = await road('(3) a parse after the tail was refused and the task scan answered after it', () => { const l = SS0.parseSessionJsonl(sid, cwd); return { n: l.length, notLoaded: l.notLoaded || null }; });
  ok(split.calls.includes('taskLines') && content(Rt).length === 0 && Rt.out && Rt.out.notLoaded === 'transcript_reader_restarting', `${Rt.name}: nothing read on the loop (${content(Rt).length}) — «not loaded» (the copy behind the file)`, { out: Rt.out, calls: split.calls });
  // (4) THE HUNG RETRY THAT READS stamps its parse and warms the task scan beside it, as the normal road
  await SS0.warmSessionJsonlAsync(sid, cwd);   // SETTLED (the parse above asked a re-warm)
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'path-hung' })); await SS0.warmSessionJsonlAsync(sid, cwd);   // the storage's
  rewrite(500);
  const U = up(), metrics = [], metricWas = global.__vsMetric;
  global.__vsMetric = (n) => metrics.push(n);
  C._setTranscriptPoolForTest(U);
  const readC = await SS0.warmSessionJsonlAsync(sid, cwd);
  global.__vsMetric = metricWas;
  ok(readC === true && metrics.includes('srv-jsonl-parse-bytes') && U.calls.includes('taskLines'), `the hung retry that reads stamps its parse and warms the task scan (metrics: ${[...new Set(metrics)].join(', ') || 'none'}; asked: ${U.calls.join(', ')})`, { metrics, calls: U.calls });
  // (7) THE PAGE IS TOLD (r1243 item 2): a session answered «not loaded» is announced ONCE to the store's listeners when a warm next
  // loads it (ws-handler pushes `history-ready` to its clients — the page asks again by itself, never a re-open)
  { const heard = []; const off = SS0.onHistoryReadable((id) => heard.push(id));
    rewrite(300);
    C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' })); await SS0.warmSessionJsonlAsync(sid, cwd);
    const nl = SS0.parseSessionJsonl(sid, cwd);   // «not loaded» (the cache behind the file): the session awaits
    await SS0.warmSessionJsonlAsync(sid, cwd);   // settles the re-warm the parse asked
    const before = heard.length;
    C._setTranscriptPoolForTest(up()); await SS0.warmSessionJsonlAsync(sid, cwd);   // the pool answers: the warm loads it
    await SS0.warmSessionJsonlAsync(sid, cwd);   // a second load says nothing (told once)
    off();
    ok(!!nl.notLoaded && typeof nl.retryAt === 'number' && before === 0 && heard.filter((x) => x === sid).length === 1, `a page told «not loaded» (its own re-ask at +${nl.retryAt - Date.now()} ms) is NOTIFIED once when a warm loads its history (${heard.length} heard)`, { heard, before }); }
  // (5) THE STORAGE'S RETRY HAS A GAP: a file the storage's is asked of the pool again at most once a gap (30 s doubling, ≤ 8 min —
  // here 60 ms): a warm inside the gap asks nothing, the first after it asks once
  // (6) A GAP READ'S PLAIN REFUSAL notes nothing of the file (the mirror of the forgiving: only a history read's word counts)
  { const fpG = path.join(projDir, 'gap-only.jsonl'); C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' })); try { await C.jsonlGapInfoAsync(fpG); } catch { }
    ok(!C.fileRefused(fpG), 'a gap read\'s plain refusal notes nothing of the file (only a history read\'s refusal or the storage\'s does)'); }
  C._setSlicedForTest({ storageRetryMs: 60 });
  rewrite(250);   // SHORTER than the copy (7) loaded (300): a rewrite, the warm asks the pool for the whole read (400 was an append the warm folds in)
  const Hg = refusing({ status: 503, code: 'path-hung' }); C._setTranscriptPoolForTest(Hg);
  await SS0.warmSessionJsonlAsync(sid, cwd);   // the storage's (the cache was behind: the pool asked, refused)
  const g0 = tails(Hg);
  await SS0.warmSessionJsonlAsync(sid, cwd);   // inside the gap: nothing asked
  const g1 = tails(Hg);
  await new Promise((res) => setTimeout(res, 90));
  await SS0.warmSessionJsonlAsync(sid, cwd);   // past it: the pool asked once
  ok(g0 >= 1 && g1 === g0 && tails(Hg) === g0 + 1, `the storage's retry has a gap: inside it nothing asked (${g1 - g0}), past it the pool asked once (${tails(Hg) - g1})`, { g0, g1, g2: tails(Hg) });
  // (5b) A DUE STORAGE RETRY WHILE THE POOL ONLY REFUSED A MOMENT AGO (no worker: refusing every call, NOT gone) asks the POOL again —
  // never the main process's own read of a file the pool called hung (that road is the pool GONE's alone: the double fault, ⑤c of
  // the heavy suite). RED (the follow's first tip): the warm read it on the main process and parked the hub's one sliced place in it
  await new Promise((res) => setTimeout(res, 200));   // past the record's gap ((5)'s retry doubled it 60 → 120 ms): the retry is DUE
  const Nr = refusing({ status: 503, code: 'no-worker' }); C._setTranscriptPoolForTest(Nr);
  try { await C.jsonlGapInfoAsync(path.join(projDir, 'gap-only.jsonl')); } catch { }   // the pool refuses every call now
  const premise = C.poolRefusing() && !C.poolGone() && C.fileStorageHung(claudeFp);
  const w5b = await SS0.warmSessionJsonlAsync(sid, cwd);
  ok(premise && w5b === false && tails(Nr) === 1 && C.fileStorageHung(claudeFp), `a due storage retry while the pool refuses for a while (no worker) asks the pool (${tails(Nr)} ask) — the file the pool called hung is not read on the main process (warm ${w5b}, still the storage's)`, { premise, warmed: w5b, asks: tails(Nr) });
  // …THE CONTROL: the pool GONE (closed for good) ⇒ the due retry IS the main process's own read (r1243 item 3) — the file answers, the
  // warm loads it, the storage mark ends
  await new Promise((res) => setTimeout(res, 350));   // past the gap again (the retry above doubled it: 240 ms)
  const G = { _closed: true, calls: [], call(op) { this.calls.push(op); return Promise.reject(Object.assign(new Error('safeFs closed'), { status: 503 })); } };
  C._setTranscriptPoolForTest(G);
  const premiseG = C.poolGone() && C.fileStorageHung(claudeFp);
  const wG = await SS0.warmSessionJsonlAsync(sid, cwd);
  ok(premiseG && wG === true && !C.fileStorageHung(claudeFp) && !G.calls.includes('jsonlTail'), `the control: the pool GONE ⇒ the due retry is the main process's own read — the warm loads it (${wG}), the storage mark ends, the closed pool asked for no tail`, { premiseG, warmed: wG, calls: G.calls });
  // (8) A FILE THE STORAGE HOLDS NEVER HOLDS A LINE (主开发 r2246's MUST, r2344 (1) and (4)): the pool UP, modelled as the real one's
  // capacity — the GENERAL pool's two workers and the history lane's one, a call waiting for a free worker; TWO conversations on a
  // storage that hangs (their records the storage's, their retries due in step) and a third, healthy, attached meanwhile. The retry
  // PROBES first (one small read under its short bound): a dead file costs that bound and nothing else, so the healthy one's warm (its
  // page in the history lane, its task scan on the general pool) lands in its own time. RED (i): the retry as a one-shot read on the
  // general pool (r2246's road) — the two dead reads hold BOTH general workers and the healthy one's task scan waits behind them;
  // RED (ii): the retry on the warm line (the moved form's road) — the dead file's page holds the line every warm waits in
  const SSsrc = fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8'), MC = mutantCopies('pool-down-r2344', REPO);
  const workers = (dead) => {
    const lanes = { general: { free: 2, q: [] }, history: { free: 1, q: [] } }, ends = [];
    let ended = false;   // past the leg's window every dead read ends at once (a warm queued behind one never waits out the leg)
    const laneOf = (op) => (op === 'boundedParsedPage' || op === 'codexHistoryMergedPage' ? lanes.history : lanes.general);
    const take = (L) => (L.free > 0 ? (L.free--, Promise.resolve()) : new Promise((res) => L.q.push(res)));
    const give = (L) => { const n = L.q.shift(); if (n) n(); else L.free++; };
    const P = { calls: [], deadCalls: [], boundEnds: 0, async call(op, payload, opts = {}) {
      P.calls.push(op); const L = laneOf(op); await take(L);
      try {
        if (payload && dead.has(payload.fp)) {   // a storage that hangs: the call ends at ITS deadline (a short one: the probe's), or never
          P.deadCalls.push(op);
          return await new Promise((res, rej) => { const end = () => rej(Object.assign(new Error('a stand-in deadline'), { status: 503, safeFsTimeout: true })); if (ended) return end(); ends.push(end); if (opts && opts.timeoutMs) setTimeout(() => { P.boundEnds++; end(); }, opts.timeoutMs); });
        }
        return (await Promise.resolve(TW.runOp(op, payload))).result;
      } finally { give(L); }
    }, endAll() { ended = true; for (const e of ends.splice(0)) e(); } };
    return P;
  };
  const lineRun = async (SM, tag) => {
    const [x1, x2, y] = ['1', '2', '3'].map((k) => `8${tag}${k}11111-2222-4333-8444-555555555555`), fpOf = (id) => path.join(projDir, id + '.jsonl');
    for (const id of [x1, x2, y]) fs.writeFileSync(fpOf(id), lines.slice(0, 400).join('\n') + '\n');
    C._setSlicedForTest({ storageRetryMs: 0, probeMs: 200 });   // the retries due at once (the gap is set when a refusal is noted: first); a short probe
    C._setTranscriptPoolForTest(refusing({ status: 503, code: 'path-hung' }));
    for (const id of [x1, x2]) { try { await C.readJsonlTailAsync(fpOf(id), { dropSubagent: true }); } catch { } }   // the two: the storage's
    const P = workers(new Set([fpOf(x1), fpOf(x2)]));
    C._setTranscriptPoolForTest(P);
    const premise = C.fileStorageHung(fpOf(x1)) && C.fileStorageHung(fpOf(x2)) && !C.poolGone();
    const wx = [x1, x2].map((id) => SM.warmSessionJsonlAsync(id, cwd));   // their retries, in step
    await new Promise((res) => setImmediate(res));
    // THE ORDER, read (test-ci-gate §2e: never a clock bound): the healthy warm answers before the leg releases anything — every dead
    // call it waited on ended by its OWN short bound (counted at that moment). The window is only the REDs': a warm still waiting when
    // it closes is one held behind dead reads that no bound of theirs would end
    const wy = await Promise.race([SM.warmSessionJsonlAsync(y, cwd), new Promise((res) => setTimeout(() => res('still waiting'), 700))]);
    const byBound = P.boundEnds, dead = P.deadCalls.slice();
    P.endAll();   // the dead reads end at their deadlines
    const wxOut = await Promise.race([Promise.all(wx), new Promise((res) => setTimeout(() => res('still out'), 3000))]);
    return { premise, wy, byBound, dead, wx: wxOut };
  };
  const PROBED = `    else {
      let probe;
      try { probe = await C().probeTranscriptAsync(known); } catch { C().storageRetryClaim(known); return false; }   // sent, refused (its deadline: still hung) — the gap spent
      if (probe === 'busy') return false;   // NOT sent: no general worker idle
      C().storageRetryClaim(known);   // sent and answered: the gap spent; the file joins the warm line
      try { r = await warmPaged(known, { bulk }).p; } catch { return false; }
    }`;
  const h8 = await lineRun(SS0, 'a');
  const h8g = await lineRun(MC.load('src/session-store.js', anchored(SSsrc, PROBED, '    else { try { r = await C().readJsonlTailAsync(known, { dropSubagent: true }); } catch { return false; } }', 'retry-one-shot-general'), 'retry-one-shot-general'), 'b');   // stale-pins: kept — r2246's road, planted back as RED (i)
  const h8w = await lineRun(MC.load('src/session-store.js', anchored(SSsrc, PROBED, '    else { try { r = await warmPaged(known, { bulk }).p; } catch { return false; } }', 'retry-on-warm-line'), 'retry-on-warm-line'), 'c');   // stale-pins: kept — the moved form's road, planted back as RED (ii)
  ok(h8.premise && h8.dead.join() === 'probe' && h8.wy === true && Array.isArray(h8.wx) && h8.wx.every((x) => x === false), `(8) two files the storage holds, their retries in step: ONE probe is out (${h8.dead.join()}: one on the pool at a time, r2715 — the other retry not sent), it costs its bound; a healthy conversation's warm answers before the leg releases anything (the other worker free: ${h8.byBound} dead calls had ended by then)`, h8);
  ok(h8g.premise && h8g.dead.join() === 'jsonlTail,jsonlTail' && h8g.wy === 'still waiting', `RED (i): the retry as a one-shot on the general pool (${h8g.dead.join()}) ⇒ both general workers held, the healthy conversation's task scan waits (${h8g.wy} at 1000 ms)`, h8g);
  ok(h8w.premise && h8w.dead.join() === 'boundedParsedPage' && h8w.wy === 'still waiting', `RED (ii): the retry on the warm line (${h8w.dead.join()}) ⇒ the healthy conversation's warm waits behind the dead file's page (${h8w.wy} at 1000 ms)`, h8w);
  // THE PUT's RULE as each form had it (主开发 r2506's law now; earlier forms planted back as REDs)
  const RULE_NOW = 'const cachedCopyWins = (c, entry) => !!(c && entry && c !== entry && (entry.mtimeMs === -1 || (c.lookAt != null && entry.lookAt != null && c.lookAt > entry.lookAt)));';
  const RULE_SIZE = 'const cachedCopyWins = (c, entry) => !!(c && entry && c.ino != null && c.ino === entry.ino && (c.size || 0) >= (entry.size || 0));';   // stale-pins: kept — r935 (a) by size alone
  const RULE_2246 = 'const cachedCopyWins = (c, entry) => !!(c && entry && c.ino != null && c.ino === entry.ino && (c.size || 0) >= (entry.size || 0) && (c.mtimeMs || 0) > (entry.mtimeMs || 0));';   // stale-pins: kept — r2246's rule
  const RULE_TIMED = 'const cachedCopyWins = (c, entry) => !!(c && entry && entry.mtimeMs === -1 && c.ino != null && c.ino === entry.ino && (c.size || 0) >= (entry.size || 0));';   // stale-pins: kept — d135c99f2's rule
  // (9) A TRANSCRIPT CUT SHORTER IN PLACE (主开发 r2246, the lane's find — an editor's save, a redirect: the same inode, smaller, LATER by
  // its time): the warm's read of it LANDS — the parse then answers the cache, a stat only, nothing read on the loop. RED: r935 (a)'s
  // size-only rule (the stale copy stays; the parse reads the file on the loop, and the page was told «ready» over «not loaded»)
  const shrinkRun = async (SM, id) => {
    const f = path.join(projDir, id + '.jsonl');
    fs.writeFileSync(f, lines.slice(0, 900).join('\n') + '\n');
    C._setTranscriptPoolForTest(up());
    const w0 = await SM.warmSessionJsonlAsync(id, cwd);
    const ino0 = fs.statSync(f).ino;
    await new Promise((res) => setTimeout(res, 30));   // a later modification time
    fs.writeFileSync(f, lines.slice(0, 500).join('\n') + '\n');   // IN PLACE: the same inode, shorter
    const inPlace = fs.statSync(f).ino === ino0;
    const w1 = await SM.warmSessionJsonlAsync(id, cwd);
    const R = await road(`(9) a parse after the warm of a transcript cut shorter in place (${id.slice(0, 8)})`, () => { const l = SM.parseSessionJsonl(id, cwd); return { n: l.length, notLoaded: l.notLoaded || null }; });
    return { w0, w1, inPlace, n: R.out && R.out.n, notLoaded: R.out && R.out.notLoaded, reads: content(R).length };
  };
  const s9 = await shrinkRun(SS0, '91111111-2222-4333-8444-555555555561');
  const sizeOnly = anchored(SSsrc, RULE_NOW, RULE_SIZE, 'r935a-size-only');
  const s9r = await shrinkRun(MC.load('src/session-store.js', sizeOnly, 'r935a-size-only'), '91111111-2222-4333-8444-555555555562');
  ok(s9.w0 === true && s9.w1 === true && s9.inPlace && s9.n === 500 && !s9.notLoaded && s9.reads === 0, `(9) a transcript cut shorter in place: the warm's read lands — the parse answers it from the cache (${s9.n} records), nothing read on the loop (${s9.reads})`, s9);
  ok(s9r.inPlace && s9r.reads > 0, `RED: r935 (a) by size alone ⇒ the stale copy stays and the parse reads the file on the loop (${s9r.reads} reads)`, s9r);
  // (10) THE CYCLE ITSELF (主开发 r2344 (2) and (4)), on the REFUSING pool's road: a transcript cut shorter in place with an OLDER time
  // (a restore that keeps it, a clock stepped back) — the main process's sliced read lands (a read that carries its time is taken), the
  // parse answers it LOADED, the page is told at most once. RED: r2246's rule (the cached copy wins when it is strictly later): the stale
  // larger copy stays, each warm says «ready», each parse says «not loaded» — the history-ready pushes counted round after round
  const r2246Rule = anchored(SSsrc, RULE_NOW, RULE_2246, 'r2246-rule');
  const SS2246 = MC.load('src/session-store.js', r2246Rule, 'r2246-rule');
  const cycleRun = async (SM, id) => {
    const f = path.join(projDir, id + '.jsonl');
    fs.writeFileSync(f, lines.slice(0, 900).join('\n') + '\n');
    C._setSlicedForTest({});
    C._setTranscriptPoolForTest(up()); await SM.warmSessionJsonlAsync(id, cwd);   // the cache: the 900-line file
    const was = fs.statSync(f).mtime, ino0 = fs.statSync(f).ino;
    fs.writeFileSync(f, lines.slice(0, 500).join('\n') + '\n');   // IN PLACE, shorter …
    const back = new Date(was.getTime() - 60000); fs.utimesSync(f, back, back);   // … with an OLDER time
    const premise = fs.statSync(f).ino === ino0 && fs.statSync(f).mtimeMs < was.getTime();
    C._setSlicedForTest({ afterMs: 0 });   // the refusing pool's road: the main process reads it in slices at once
    C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' }));
    const heard = [], off = SM.onHistoryReadable((x) => heard.push(x));
    let last = null;
    for (let k = 0; k < 4; k++) { await SM.warmSessionJsonlAsync(id, cwd); last = SM.parseSessionJsonl(id, cwd); await new Promise((res) => setImmediate(res)); }
    await SM.warmSessionJsonlAsync(id, cwd);   // settles the re-warm the last parse asked
    off(); C._setSlicedForTest({});
    return { premise, pushes: heard.filter((x) => x === id).length, n: last.length, notLoaded: last.notLoaded || null };
  };
  const c10 = await cycleRun(SS0, 'a1111111-2222-4333-8444-555555555571'), c10r = await cycleRun(SS2246, 'a1111111-2222-4333-8444-555555555572');
  ok(c10.premise && c10.n === 500 && !c10.notLoaded && c10.pushes <= 1, `(10) a transcript cut shorter in place with an OLDER time, the pool refusing: the sliced read lands — LOADED (${c10.n} records), told ${c10.pushes} time(s)`, c10);
  ok(c10r.premise && !!c10r.notLoaded, `RED: r2246's rule (strictly later wins) ⇒ the stale copy stays — «not loaded» after 4 rounds (a skipped put says no «ready»: ${c10r.pushes} pushes)`, c10r);
  // (11) THE LAW, PURE (主开发 r2506): a read is judged by WHEN ITS LOOK AT THE FILE WAS TAKEN (`lookAt`), never by the file's own time
  // or size — a later or equal look is taken (an older restore, a cut in place, a clock stepped back); an EARLIER look never replaces the
  // copy (an older read landing after a newer one); a SHORT read (the file shrank under it: mtimeMs -1) never replaces a copy; a copy with
  // no look (put before the law) is replaced. RED: the timed-read rule (d135c99f2's: every read that carries its time taken)
  const SSTIMED = MC.load('src/session-store.js', anchored(SSsrc, RULE_NOW, RULE_TIMED, 'rule-timed'), 'rule-timed');   // stale-pins: kept — d135c99f2's rule, planted back as the RED
  const W = SS0.cachedCopyWins, WT = SSTIMED.cachedCopyWins, C0 = { ino: 7, size: 900, mtimeMs: 2000, lookAt: 100 };
  const CASES = [
    ['a later look, shorter, a later file time (a cut in place)', C0, { ino: 7, size: 500, mtimeMs: 3000, lookAt: 200 }, false],
    ['a later look, shorter, an OLDER file time (a restore that keeps it, a clock stepped back)', C0, { ino: 7, size: 500, mtimeMs: 1000, lookAt: 200 }, false],
    ['the same look (one tick)', C0, { ino: 7, size: 500, mtimeMs: 2000, lookAt: 100 }, false],
    ['an EARLIER look, shorter (an older read landing last)', C0, { ino: 7, size: 600, mtimeMs: 1500, lookAt: 50 }, true],
    ['an EARLIER look, another inode', C0, { ino: 8, size: 600, mtimeMs: 2500, lookAt: 50 }, true],
    ['a SHORT read (the file shrank under it), a later look', C0, { ino: 7, size: 500, mtimeMs: -1, lookAt: 200 }, true],
    ['two short reads', { ino: 7, size: 900, mtimeMs: -1, lookAt: 100 }, { ino: 7, size: 500, mtimeMs: -1, lookAt: 200 }, true],
    ['a copy with no look (put before the law)', { ino: 7, size: 900, mtimeMs: 2000 }, { ino: 7, size: 500, mtimeMs: 1000, lookAt: 200 }, false],
  ];
  const bad = CASES.filter(([, c, e, want]) => W(c, e) !== want).map(([n]) => n), badT = CASES.filter(([, c, e, want]) => WT(c, e) !== want).map(([n]) => n);
  ok(bad.length === 0, `(11) the law: a read judged by when its look at the file was taken — ${CASES.length} cases`, { bad });
  ok(badT.includes('an EARLIER look, shorter (an older read landing last)'), `RED: the timed-read rule fails the earlier look (${badT.length} cases: ${badT.join(' · ')})`, { badT });
  C._setSlicedForTest({});
  // (12) TWO READS IN FLIGHT, THE OLDER LOOK LANDING LAST (主开发 r2506): a warm's read is sent (its look: the 600-line file), the file
  // grows, the sync road reads it then (a LATER look, 700 lines, cached), and the warm's older read lands LAST — the newest history stays,
  // nothing is folded (the next parse a hit: no read on the loop), and the warm whose put was skipped is NOT «ready». RED: the timed-read
  // rule — the older read goes over the newer copy and the next parse folds the difference on the loop
  const lateRun = async (SM, id) => {
    const f = path.join(projDir, id + '.jsonl');
    fs.writeFileSync(f, lines.slice(0, 600).join('\n') + '\n');
    let release = null, held = false;
    const P = { calls: [], call(op, payload) { this.calls.push(op); const out = Promise.resolve(TW.runOp(op, payload)).then((x) => x.result); if (op === 'boundedParsedPage' && !held) { held = true; return new Promise((res) => { release = () => res(out); }); } return out; } };   // the page's read is TAKEN at the send, its answer held
    C._setTranscriptPoolForTest(P);
    const w = SM.warmSessionJsonlAsync(id, cwd);
    for (let k = 0; k < 50 && !release; k++) await new Promise((res) => setImmediate(res));
    fs.appendFileSync(f, lines.slice(600, 700).join('\n') + '\n');   // the file grows …
    const newer = SM.parseSessionJsonl(id, cwd).length;   // … the sync road reads it now: the LATER look, cached
    const sent = !!release; if (release) release();   // the older read lands LAST
    const wOut = await w;
    const R = await road(`(12) a parse after an older read landed last (${id.slice(0, 8)})`, () => SM.parseSessionJsonl(id, cwd).length);
    return { sent, newer, wOut, n: R.out, reads: content(R).length };
  };
  const l12 = await lateRun(SS0, 'b1111111-2222-4333-8444-555555555581'), l12r = await lateRun(SSTIMED, 'b1111111-2222-4333-8444-555555555582');
  ok(l12.sent && l12.newer === 700 && l12.wOut === false && l12.n === 700 && l12.reads === 0, `(12) the older read landing last never replaces the newer copy: the history stays ${l12.n} records, nothing folded on the loop (${l12.reads}); the warm whose put was skipped is not «ready» (${l12.wOut})`, l12);
  ok(l12r.sent && l12r.reads > 0, `RED: the timed-read rule ⇒ the older read goes over the newer copy — the next parse folds on the loop (${l12r.reads} reads)`, l12r);
  // THE POOL, MODELLED TRUE (主开发 r2715 / r2718 — as src/safe-fs.js call() hands a call out): to the least busy LIVE worker that is NOT
  // out on a look (ties: the first), queued behind what it runs; none ⇒ refused (every live worker looking: «no idle worker»; none alive:
  // «no worker»); `idleOnly`: refused when the picked worker runs anything; `keepOne`: refused unless ANOTHER live worker stays in the
  // hand-out; `look`: that worker leaves the hand-out while the call is out; a call's deadline, from its SEND, ENDS ITS WORKER — EVERY
  // call in it rejected, the pool's memory naming the op the worker was running — and the worker is gone (until revived)
  const modelPool = (n, { dead = new Set(), healthy = new Set() } = {}) => {
    const W = Array.from({ length: n }, (_, i) => ({ i, alive: true, looking: null, cur: null, q: [] }));
    const P = { W, calls: [], sent: [], ended: [], probeRefused: 0, hung: new Set(), running: [] };
    const load = (w) => (w.cur ? 1 : 0) + w.q.length;
    const pick = () => { let best = null; for (const w of W) { if (!w.alive || w.looking) continue; if (!best || load(w) < load(best)) best = w; } return best; };
    const busy = () => Object.assign(new Error('every worker of the transcript pool is busy — the call was not sent'), { status: 503, code: 'no-idle-worker' });
    const settle = (w, j) => { if (w.cur === j) w.cur = null; else { const k = w.q.indexOf(j); if (k >= 0) w.q.splice(k, 1); } if (w.looking === j) w.looking = null; if (!w.cur && w.alive) { const nx = w.q.shift(); if (nx) { w.cur = nx; nx.run(); } } };
    P._hungOf = (payload) => (payload && P.hung.has(payload.fp) ? { path: payload.fp, ms: 30000 } : null);   // the pool's path memory
    P.call = (op, payload, opts = {}) => new Promise((resolve, reject) => {
      P.calls.push(op);
      const refuse = (e) => { if (op === 'probe') P.probeRefused++; reject(e); };
      const w = pick();
      if (!w) return refuse(W.some((x) => x.alive && x.looking) ? busy() : Object.assign(new Error('no worker of the transcript pool is alive'), { status: 503, code: 'no-worker' }));
      if (opts.idleOnly && load(w)) return refuse(busy());
      if (opts.keepOne && !W.some((x) => x !== w && x.alive && !x.looking)) return refuse(busy());
      const fp = payload && payload.fp, j = { op, fp, done: false, w, reject };
      j.ok = (v) => { if (j.done) return; j.done = true; settle(w, j); resolve(v); };
      j.end = (e) => { if (j.done) return; j.done = true; settle(w, j); reject(e); };
      j.run = () => { if (healthy.has(fp)) P.running.push(j); else if (!dead.has(fp)) Promise.resolve(TW.runOp(op, payload)).then((x) => j.ok(x.result), (e) => j.end(e)); };
      if (op === 'probe') P.sent.push(fp);
      if (opts.look) w.looking = j;
      if (opts.timeoutMs) setTimeout(() => { if (!j.done) P.endWorker(w, j); }, opts.timeoutMs);
      if (w.cur) w.q.push(j); else { w.cur = j; j.run(); }
    });
    P.endWorker = (w, by) => {   // `by`'s deadline ends ITS worker: every call in it rejected
      const all = [w.cur, ...w.q].filter(Boolean); w.q = []; w.cur = null; w.looking = null; w.alive = false;
      if (all[0]) P.hung.add(all[0].fp);
      for (const j of all) { if (j.done) continue; j.done = true; if (j !== by) P.ended.push(j.fp); j.reject(Object.assign(new Error('a stand-in deadline'), { status: 503, safeFsTimeout: true })); }
    };
    P.free = () => { const j = P.running.shift(); if (j) j.ok(null); };
    P.freeAll = () => { for (const j of P.running.splice(0)) j.ok(null); };
    return P;
  };
  const CXsrc = fs.readFileSync(path.join(REPO, 'src/adapters/codex.js'), 'utf8');
  const PROBE_OPTS = '{ timeoutMs: STORAGE_PROBE_MS, idleOnly: true, look: true, keepOne: true }';
  const ONE_MARK = "  if (_probeOut) return _probeOut.fp === fp ? _probeOut.p : 'busy';\n";
  const pairOf = (from, to, tag) => { const cx = MC.write('src/adapters/codex.js', anchored(CXsrc, from, to, tag), tag); return { CM: require(cx), SM: MC.load('src/session-store.js', anchored(SSsrc, "require('./adapters/codex')", () => `require(${JSON.stringify(cx)})`, tag + '-ss', { count: 4 }), tag + '-ss') }; };
  const fpOf = (id) => path.join(projDir, id + '.jsonl');
  const ids = (tag, n) => Array.from({ length: n }, (_, k) => `c${tag}${k}11111-2222-4333-8444-555555555555`);
  const storageOf = async (CM, fps) => {   // these files: the storage's, their retries due at once (the gap set when the refusal is noted: first)
    CM._setSlicedForTest({ storageRetryMs: 0 });
    CM._setTranscriptPoolForTest(refusing({ status: 503, code: 'path-hung' }));
    for (const f of fps) { try { await CM.readJsonlTailAsync(f, { dropSubagent: true }); } catch { } }
    CM._setSlicedForTest({ storageRetryMs: 60000, probeMs: 100 });   // a SPENT gap now waits 2 minutes: a second ask at once tells it apart
  };
  const answer = (pr) => pr.then(() => 'answered', (e) => (e && e.code) || 'failed');
  const sleepT = (ms) => new Promise((res) => setTimeout(res, ms));
  // (8b) THE PROBE's BOUND ENDS ONLY THE PROBE, BEFORE ITS SEND (r2506): both general workers on HEALTHY long calls, a dead file's retry
  // due: NOT sent (no worker idle) — no healthy call ended, none marked, the gap unspent (asked again at once); a worker freed ⇒ the probe
  // runs there, alone, and costs its bound. RED: the probe not idle-only (look and keepOne kept) — queued behind a healthy call, its
  // deadline ends THAT worker: the healthy call ended, its file marked
  const run8b = async (CM, SM, tag) => {
    const [x, h1, h2] = ids(tag, 3);
    for (const id of [x, h1, h2]) fs.writeFileSync(fpOf(id), lines.slice(0, 300).join('\n') + '\n');
    await storageOf(CM, [fpOf(x)]);
    const P = modelPool(2, { dead: new Set([fpOf(x)]), healthy: new Set([fpOf(h1), fpOf(h2)]) }); CM._setTranscriptPoolForTest(P);
    const longs = [h1, h2].map((id) => answer(CM.jsonlGapInfoAsync(fpOf(id))));
    await new Promise((res) => setImmediate(res));
    const w1 = await SM.warmSessionJsonlAsync(x, cwd); await sleepT(200);
    const w2 = await SM.warmSessionJsonlAsync(x, cwd);
    const busyPhase = { probeRefused: P.probeRefused, sent: P.sent.length, ended: P.ended.slice(), hHung: [h1, h2].some((id) => CM.fileStorageHung(fpOf(id))) };
    P.free(); await new Promise((res) => setImmediate(res));
    const w3 = await SM.warmSessionJsonlAsync(x, cwd);
    const freed = { sent: P.sent.length, ended: P.ended.slice(), xHung: CM.fileStorageHung(fpOf(x)) };
    P.freeAll();
    return { w1, w2, w3, busyPhase, freed, healthyOut: await Promise.all(longs), healthyHung: [h1, h2].map((id) => CM.fileStorageHung(fpOf(id))) };
  };
  const p8 = await run8b(C, SS0, 'a');
  const R8b = pairOf(PROBE_OPTS, '{ timeoutMs: STORAGE_PROBE_MS, look: true, keepOne: true }', 'probe-not-idle-only');   // stale-pins: kept — the send without idleOnly, planted back as the RED
  const p8r = await run8b(R8b.CM, R8b.SM, 'b');
  ok(p8.busyPhase.probeRefused === 2 && p8.busyPhase.sent === 0 && !p8.busyPhase.ended.length && !p8.busyPhase.hHung && p8.w1 === false && p8.w2 === false
    && p8.freed.sent === 1 && !p8.freed.ended.length && p8.freed.xHung && p8.healthyOut.every((x) => x === 'answered') && p8.healthyHung.every((x) => !x),
    `(8b) both workers busy ⇒ the probe NOT sent (${p8.busyPhase.probeRefused} asks: the gap unspent), no healthy call ended, none marked; a worker freed ⇒ the probe ran there (${p8.freed.sent}), the dead file still the storage's`, p8);
  ok(p8r.busyPhase.ended.length >= 1 && p8r.healthyOut.some((x) => x !== 'answered'), `RED: the probe not idle-only ⇒ queued behind a healthy call, its deadline ended THAT worker — the healthy call ended (${p8r.busyPhase.ended.length})`, p8r);
  // (8c) THE PROBE ALONE IN ITS WORKER, AFTER ITS SEND (r2715): the probe out to a dead file, the other worker on a healthy long call, a
  // healthy call arrives — handed out as if the pool had one worker fewer (behind the long call), ANSWERED, never ended, its file not
  // refused. RED: the probe without `look` — the new call ties onto the probe's worker and is ended at the probe's bound
  const run8c = async (CM, SM, tag) => {
    const [x, h1, h2] = ids(tag, 3);
    for (const id of [x, h1, h2]) fs.writeFileSync(fpOf(id), lines.slice(0, 300).join('\n') + '\n');
    await storageOf(CM, [fpOf(x)]);
    const P = modelPool(2, { dead: new Set([fpOf(x)]), healthy: new Set([fpOf(h1)]) }); CM._setTranscriptPoolForTest(P);
    const wx = SM.warmSessionJsonlAsync(x, cwd);   // the probe: out on worker 0
    await new Promise((res) => setImmediate(res));
    const long = answer(CM.jsonlGapInfoAsync(fpOf(h1)));   // worker 1: a healthy long call
    await new Promise((res) => setImmediate(res));
    const h2out = answer(CM.jsonlGapInfoAsync(fpOf(h2)));   // the healthy call that arrives while the probe is out
    await sleepT(200);   // a placed wait past the probe's bound (100 ms)
    P.freeAll();
    return { sent: P.sent.length, wx: await wx, h2: await h2out, long: await long, ended: P.ended.slice(), h2Refused: CM.fileRefused(fpOf(h2)) || CM.fileStorageHung(fpOf(h2)) };
  };
  const p8c = await run8c(C, SS0, 'c');
  const R8c = pairOf(PROBE_OPTS, '{ timeoutMs: STORAGE_PROBE_MS, idleOnly: true, keepOne: true }', 'probe-without-look');   // stale-pins: kept — the send without look, planted back as the RED
  const p8cr = await run8c(R8c.CM, R8c.SM, 'd');
  ok(p8c.sent === 1 && p8c.h2 === 'answered' && !p8c.ended.length && !p8c.h2Refused && p8c.wx === false, `(8c) a healthy call arriving while the probe is out is handed out beside it, ANSWERED (${p8c.h2}), never ended, its file not refused`, p8c);
  ok(p8cr.sent === 1 && p8cr.h2 !== 'answered' && p8cr.ended.length >= 1, `RED: the probe without look ⇒ the healthy call tied onto the probe's worker and was ended at its bound (${p8cr.h2})`, p8cr);
  // (8d) ONE PROBE ON THE POOL AT A TIME (r2715's third side): two dead files due together — ONE probe sent, the other retry NOT sent, its
  // gap unspent (asked again once the first's probe settles: sent then). On THREE workers here, so keepOne cannot be what holds the second
  // (on the transcript pool's two it would be: the law holds by either). RED: the one-probe mark taken away — two probes out
  const R1 = pairOf(ONE_MARK, '', 'one-probe-mark-gone');   // stale-pins: kept — the mark taken away, planted back as the RED (8d, 8e)
  const run8d = async (CM, SM, tag) => {
    const [x1, x2] = ids(tag, 2);
    for (const id of [x1, x2]) fs.writeFileSync(fpOf(id), lines.slice(0, 300).join('\n') + '\n');
    await storageOf(CM, [fpOf(x1), fpOf(x2)]);
    const P = modelPool(3, { dead: new Set([fpOf(x1), fpOf(x2)]) }); CM._setTranscriptPoolForTest(P);
    const w1 = SM.warmSessionJsonlAsync(x1, cwd);
    await new Promise((res) => setImmediate(res));
    const w2 = await SM.warmSessionJsonlAsync(x2, cwd);   // the first's probe is out
    const atOnce = P.sent.slice();
    await w1; await sleepT(150);
    const w3 = await SM.warmSessionJsonlAsync(x2, cwd);   // asked again: due only if its gap is unspent
    return { atOnce, w2, w3, after: P.sent.slice() };
  };
  const p8d = await run8d(C, SS0, 'e'), p8dr = await run8d(R1.CM, R1.SM, 'f');
  ok(p8d.atOnce.length === 1 && p8d.w2 === false && p8d.after.length === 2, `(8d) two dead files due together: ONE probe out (${p8d.atOnce.length}), the other not sent and its gap unspent — sent once the first settled (${p8d.after.length})`, p8d);
  ok(p8dr.atOnce.length === 2, `RED: the one-probe mark taken away ⇒ two probes out at once (${p8dr.atOnce.length})`, p8dr);
  // (8e) ONE ASKER MORE OF THE SAME FILE JOINS (r2715): two asks of one file inside the bound — one probe, the second answered as the
  // first's. RED: the mark taken away — a second probe of the same file
  const run8e = async (CM, tag) => {
    const [x] = ids(tag, 1); fs.writeFileSync(fpOf(x), lines.slice(0, 300).join('\n') + '\n');
    CM._setSlicedForTest({ probeMs: 100 });
    const P = modelPool(3, { dead: new Set([fpOf(x)]) }); CM._setTranscriptPoolForTest(P);
    const a = answer(CM.probeTranscriptAsync(fpOf(x))), b = answer(CM.probeTranscriptAsync(fpOf(x)));
    const sent = P.sent.length;
    return { sent, a: await a, b: await b };
  };
  const p8e = await run8e(C, 'g'), p8er = await run8e(R1.CM, 'h');
  ok(p8e.sent === 1 && p8e.a === p8e.b, `(8e) two askers of one dead file inside the bound: ONE probe (${p8e.sent}), the second answered as the first's (${p8e.b})`, p8e);
  ok(p8er.sent === 2, `RED: the mark taken away ⇒ a second probe of the same file (${p8er.sent})`, p8er);
  // (8f) THE PROBE NEVER TAKES THE LAST WORKER (r2718): the other general worker GONE at the send (ended by a bound, not yet back) — the
  // probe NOT sent (its gap unspent), and a healthy call is handed out and answered. RED: the probe without keepOne — it takes the last
  // worker out of the hand-out and the healthy call is refused
  const run8f = async (CM, SM, tag) => {
    const [x, h] = ids(tag, 2);
    for (const id of [x, h]) fs.writeFileSync(fpOf(id), lines.slice(0, 300).join('\n') + '\n');
    await storageOf(CM, [fpOf(x)]);
    const P = modelPool(2, { dead: new Set([fpOf(x)]) }); P.W[1].alive = false; CM._setTranscriptPoolForTest(P);
    const wx = SM.warmSessionJsonlAsync(x, cwd);
    await new Promise((res) => setImmediate(res));
    const hOut = await answer(CM.jsonlGapInfoAsync(fpOf(h)));
    const sent = P.sent.length;
    const wxOut = await wx;
    return { sent, hOut, wx: wxOut };
  };
  const p8f = await run8f(C, SS0, 'i');
  const R8f = pairOf(PROBE_OPTS, '{ timeoutMs: STORAGE_PROBE_MS, idleOnly: true, look: true }', 'probe-without-keepone');   // stale-pins: kept — the send without keepOne, planted back as the RED
  const p8fr = await run8f(R8f.CM, R8f.SM, 'j');
  ok(p8f.sent === 0 && p8f.hOut === 'answered' && p8f.wx === false, `(8f) the other worker gone at the send: the probe NOT sent (${p8f.sent}), the healthy call answered (${p8f.hOut})`, p8f);
  ok(p8fr.sent === 1 && p8fr.hOut !== 'answered', `RED: the probe without keepOne ⇒ it took the last worker; the healthy call refused (${p8fr.hOut})`, p8fr);
  // (8h) THE PROBE ASKS THE PATH MEMORY ITSELF (r2715 / r2718: its `look` word skips the pool's own ask): a file the pool remembers
  // hung — its retry's probe refused at the door: NOT sent (no call reaches the pool), the refusal the storage's by name. RED: the door
  // ask put out — the probe is sent to the file the pool remembers dead and holds a worker for its bound
  const R8h = pairOf("    if (h) throw poolRefusalNoted(", "    if (false) throw poolRefusalNoted(", 'probe-no-door-ask');   // stale-pins: kept — the door ask put out, planted back as the RED
  const run8h = async (CM, tag) => {
    const [x] = ids(tag, 1); fs.writeFileSync(fpOf(x), lines.slice(0, 300).join('\n') + '\n');
    CM._setSlicedForTest({ probeMs: 100 });
    const P = modelPool(2, { dead: new Set([fpOf(x)]) }); P.hung.add(fpOf(x)); CM._setTranscriptPoolForTest(P);
    const out = await answer(CM.probeTranscriptAsync(fpOf(x)));
    return { out, calls: P.calls.length, sent: P.sent.length, hung: CM.fileStorageHung(fpOf(x)) };
  };
  const p8h = await run8h(C, 'm'), p8hr = await run8h(R8h.CM, 'n');
  ok(p8h.calls === 0 && p8h.out === 'transcript_reader_restarting' && p8h.hung, `(8h) a file the pool remembers hung: the probe refused at the door (${p8h.out}), NOT sent (${p8h.calls} calls), the storage's`, p8h);
  ok(p8hr.sent === 1, `RED: the door ask put out ⇒ the probe sent to the file the pool remembers dead (${p8hr.sent})`, p8hr);
  // (8g) SafeFs's OWN keepOne, REAL (src/safe-fs.js call()): two real transcript workers, one out on a held LOOK — a keepOne call is refused
  // as busy and never sent; the control: the same call without keepOne is sent and answered
  {
    const { SafeFs: SF } = require(path.join(REPO, 'src/safe-fs.js'));
    const K = new SF({ workerPath: path.join(REPO, 'src/transcript-worker.js'), name: 'keepone-leg', poolSize: 2, timeouts: { default: 5000 } });
    const fOK = fpOf(ids('k', 1)[0]); fs.writeFileSync(fOK, lines.slice(0, 50).join('\n') + '\n');
    const sab = new SharedArrayBuffer(4);
    try {
      const hold = K.call('__hold', { sab, ms: 5000 }, { look: true }).catch(() => null);
      await sleepT(50);
      let k1 = null; try { await K.call('probe', { fp: fOK }, { keepOne: true }); k1 = 'sent'; } catch (e) { k1 = (e && e.code) || 'failed'; }
      let k0 = null; try { await K.call('probe', { fp: fOK }, {}); k0 = 'sent'; } catch (e) { k0 = (e && e.code) || 'failed'; }
      Atomics.store(new Int32Array(sab), 0, 1); Atomics.notify(new Int32Array(sab), 0);
      await hold;
      ok(k1 === 'no-idle-worker' && k0 === 'sent', `(8g) SafeFs keepOne, real: with the other worker out on a look the keepOne call is refused as busy (${k1}); without it the call is sent (${k0})`, { k1, k0 });
    } finally { K.close(); }
  }
  for (const R of [R8b, R8c, R1, R8f]) R.CM._setSlicedForTest({});
  C._setSlicedForTest({});
}
C._setTranscriptPoolForTest(pool);   // the real pool (closed) back in its place

// ── THE TRANSCRIPT POOL REMEMBERS A HUNG TRANSCRIPT (B-23e5's memory, by the pool's own key `fp`): a REAL pool and worker, an op held
// past its deadline (the worker's __hold: a placed stall, never a clock guess) ⇒ that file is refused by name at the pool's door,
// no worker sent into it again; the control, a pool without the key: nothing remembered (the release: a fresh worker every ask) ──
{
  const { SafeFs } = require(path.join(REPO, 'src/safe-fs.js'));
  const sleepMs = (ms) => new Promise((res) => setTimeout(res, ms));
  const mkPool = (pathKeys, extra = {}) => new SafeFs({ workerPath: path.join(REPO, 'src/transcript-worker.js'), name: 'transcript-leg', poolSize: 1, timeouts: { default: 200 }, ...(pathKeys ? { pathKeys } : {}), ...extra });
  const held = async (P) => { let e = null; try { await P.call('__hold', { fp: claudeFp, sab: new SharedArrayBuffer(4), ms: 4000 }); } catch (x) { e = x; } return e; };
  const P1 = mkPool(['fp']), P0 = mkPool(null);
  try {
    const e1 = await held(P1), e0 = await held(P0);
    let next = null; try { await P1.call('jsonlTail', { fp: claudeFp, dropSubagent: true }); } catch (x) { next = x; }
    ok(!!e1 && e1.safeFsTimeout === true && !!next && next.code === 'path-hung' && next.status === 503 && !!P1._hungOf({ fp: claudeFp }, 'jsonlTail', 200) && !P0._hungOf({ fp: claudeFp }, 'jsonlTail', 200) && !!e0 && e0.safeFsTimeout === true,
      `a transcript read that ran out its deadline is REMEMBERED by the transcript pool (its key fp): the next read of that file is refused by name (${next && next.code}), no worker sent into it; the control (no key): nothing remembered`, { e1: e1 && (e1.code || e1.message), next: next && next.code, p0Hung: !!P0._hungOf({ fp: claudeFp }, 'jsonlTail', 200) });
  } finally { P1.close(); P0.close(); }
  // THE DOOR READS `fp` TOO: a transcript under a BLOCKED mount is refused by name at the pool's door, no worker asked (control: no key)
  const blockedAt = (p) => (String(p).startsWith(projDir + path.sep) ? projDir : false);
  const B1 = mkPool(['fp'], { blocked: blockedAt }), B0 = mkPool(null, { blocked: blockedAt });
  try {
    let b1 = null, b0 = null;
    try { await B1.call('jsonlTail', { fp: claudeFp, dropSubagent: true }); } catch (x) { b1 = x; }
    try { await B0.call('jsonlTail', { fp: claudeFp, dropSubagent: true }); } catch (x) { b0 = x; }
    ok(!!b1 && b1.code === 'storage-blocked' && !(b0 && b0.code === 'storage-blocked'), `a transcript under a blocked mount is refused at the transcript pool's door by name (${b1 && b1.code}); the control (no key): asked of a worker (${b0 ? b0.code || b0.message : 'answered'})`, { b1: b1 && b1.code, b0: b0 && (b0.code || b0.message) });
  } finally { B1.close(); B0.close(); }
  // NO FOLDER FROM TWO ENDS (climb: false): two transcripts of one folder that ran out their deadlines never name the folder — a
  // deadline may end a long parse; the control (a pool that climbs) names it
  const two = async (P) => { const fa = path.join(projDir, 'aaaa.jsonl'), fb = path.join(projDir, 'bbbb.jsonl'); await Promise.all([fa, fb].map((fp) => P.call('__hold', { fp, sab: new SharedArrayBuffer(4), ms: 4000 }).catch(() => null))); };
  const third = { fp: path.join(projDir, 'cccc.jsonl') };
  const K1 = mkPool(['fp'], { poolSize: 2, climb: false }), K0 = mkPool(['fp'], { poolSize: 2 });
  // the control's look: B-23e5's remainder names a folder only after a no-follow look at its dead children (lstatKinds, an op of the
  // FILE pool's worker — the transcript worker has none, so a climbing transcript pool would never name it); answered here as that
  // look answers two children that are no link
  K0._lookIdle = () => Promise.resolve({ links: [false, false] });
  try {
    await two(K1); await two(K0);
    for (let i = 0; i < 50 && !K0._hungOf(third, 'jsonlTail', 200); i++) await sleepMs(20);
    ok(!K1._hungOf(third, 'jsonlTail', 200) && !!K0._hungOf(third, 'jsonlTail', 200), `two ends in one folder never name the folder in the transcript pool (climb: false): a third conversation of that folder is still asked; the control (a pool that climbs) names it`, { k1: !!K1._hungOf(third, 'jsonlTail', 200), k0: !!K0._hungOf(third, 'jsonlTail', 200) });
  } finally { K1.close(); K0.close(); }
  // THE HISTORY LANE ADDS NOTHING (hungMs: 0 — its pages parse a snapshot in memory): its deadline end is never a dead file;
  // the control (a lane that notes) remembers it
  const L1 = mkPool(['fp'], { laneOpts: { history: { hungMs: 0 } } }), L0 = mkPool(['fp']);
  try {
    for (const P of [L1, L0]) await P.call('__hold', { fp: claudeFp, sab: new SharedArrayBuffer(4), ms: 4000 }, { lane: 'history' }).catch(() => null);
    ok(!L1._hungOf({ fp: claudeFp }, 'jsonlTail', 200) && !!L0._hungOf({ fp: claudeFp }, 'jsonlTail', 200), 'the history lane\'s deadline end adds nothing to the memory (hungMs: 0); the control lane remembers the file', { l1: !!L1._hungOf({ fp: claudeFp }, 'jsonlTail', 200), l0: !!L0._hungOf({ fp: claudeFp }, 'jsonlTail', 200) });
  } finally { L1.close(); L0.close(); }
  const ad = fs.readFileSync(path.join(REPO, 'src/adapters/codex.js'), 'utf8');
  ok(/pathKeys: \['fp'\],/.test(ad) && /climb: false,/.test(ad) && /laneOpts: \{ history: \{ resourceLimits: \{ maxOldGenerationSizeMb: HISTORY_HEAP_MB \}, hungMs: 0 \}, warm: \{ resourceLimits: \{ maxOldGenerationSizeMb: HISTORY_HEAP_MB \}, hungMs: 0 \}, warm2: \{ resourceLimits: \{ maxOldGenerationSizeMb: HISTORY_HEAP_MB \}, hungMs: 0 \} \}/.test(ad), 'the transcript pool is built with all three (pathKeys fp, climb false, the history lane hungMs 0)');
}

// ── r1461 (round wwvmy3yti): THE LEGS ITS READERS FOUND MISSING — the page's re-ask as a PURE decision with its controls, who gets
// the push, the storage retry's own park, a late I/O failure, the codex double fault, the 503 with its retry time ──
console.log('r1461: the page\'s re-ask decision, the push\'s waiters, the two parks, a late I/O failure, the codex double fault, the 503');
{
  // (a) THE STORM BOUND: a window answered «not loaded» again at every ask (the hub's time «now») asks ≤ 4 times in its first minute,
  // ≤ 8 in ten (2 s doubling, ≤ 10 min). CONTROL: the back-off RESET at every answer (a reconnect's «not loaded» counted as a fresh
  // start) asks ~30 times a minute — 40 windows, 1200 asks: the leg sees it
  const NL = (now) => ({ type: 'not-loaded', now, code: 'transcript_reader_restarting', info: { retryIn: 0 } });
  const asksIn = (next, ms) => {
    let st, t = 0, asks = 0;
    st = next(st, NL(t)).state;
    while (st.due && st.due <= ms) { t = st.due; const r = next(st, { type: 'due', now: t }); st = r.state; if (r.act === 'ask') { asks++; st = next(st, NL(t)).state; } }
    return asks;
  };
  const resetting = (st, ev) => RQ.reaskNext(ev.type === 'not-loaded' ? { ...st, tries: 0 } : st, ev);
  const a1 = asksIn(RQ.reaskNext, 60000), a10 = asksIn(RQ.reaskNext, 600000), c1 = asksIn(resetting, 60000);
  ok(a1 <= 4 && a10 <= 8 && c1 >= 25, `the storm bound: ${a1} asks in the first minute, ${a10} in ten (2 s doubling, ≤ 10 min) — CONTROL: a back-off reset at every answer asks ${c1} times a minute`, { a1, a10, c1 });
  // (b) ONLY AN ANSWER THAT CARRIES THE HISTORY RESETS IT: after a load, the next «not loaded» asks at 2 s again. CONTROL: tries kept
  // over a load (never reset) — that window waits its old back-off
  let st = RQ.reaskNext(undefined, NL(0)).state;
  for (let i = 0; i < 5; i++) { st = RQ.reaskNext(st, { type: 'due', now: st.due }).state; st = RQ.reaskNext(st, NL(st.due || 0)).state; }
  const afterLoad = RQ.reaskNext(RQ.reaskNext(st, { type: 'loaded' }).state, NL(1e6)).state;
  const neverReset = (s0, ev) => ev.type === 'loaded' ? { state: { ...s0, code: null, due: 0 }, act: 'cancel' } : RQ.reaskNext(s0, ev);
  const keptOver = RQ.reaskNext(neverReset(st, { type: 'loaded' }).state, NL(1e6)).state;
  ok(st.tries === 5 && afterLoad.tries === 0 && afterLoad.due - 1e6 === RQ.FLOOR_MS && keptOver.due - 1e6 > RQ.FLOOR_MS * 16, `a load resets the back-off (the next ask at +${afterLoad.due - 1e6} ms) — CONTROL: tries kept over a load wait +${keptOver.due - 1e6} ms`, { tries: st.tries, after: afterLoad.due - 1e6, kept: keptOver.due - 1e6 });
  // (c) THE CHEAP ASK, THEN THE RELOAD ONLY WHEN READABLE: the timer asks (`ask`), never reloads; `ready` reloads once; a second
  // ready while that reload is on its way is that reload (owed) — and an answer «not loaded» after it asks again in 2 s
  let s2 = RQ.reaskNext(undefined, NL(0)).state, t2 = 0;   // a real timeline: each ask at its due, answered «not loaded» then
  for (let i = 0; i < 4; i++) { t2 = s2.due; s2 = RQ.reaskNext(s2, { type: 'due', now: t2 }).state; s2 = RQ.reaskNext(s2, NL(t2)).state; }
  const dueAct = RQ.reaskNext(s2, { type: 'due', now: s2.due }).act;
  const r1 = RQ.reaskNext(s2, { type: 'ready', now: t2 + 100 }), r2 = RQ.reaskNext(r1.state, { type: 'ready', now: t2 + 600 });
  const afterOwed = RQ.reaskNext(r2.state, NL(t2 + 1000)).state;
  ok(s2.tries === 4 && dueAct === 'ask' && r1.act === 'reload' && r2.act === null && r2.state.owed === true && afterOwed.due - (t2 + 1000) === RQ.PROMPT_MS, `the timer ASKS (${dueAct}), the hub's «ready» RELOADS once (${r1.act}, then ${r2.act}: owed), and a «not loaded» after the owed ready asks again in ${afterOwed.due - (t2 + 1000)} ms (not its back-off's ${s2.due - t2} ms)`);
  // (d) AN EARLIER ASK STANDS (one answer said twice: the attach handler, then the reset) and the hub's time on the PAGE's clock
  const early = RQ.reaskAt({ now: 0, at: 0, tries: 6, pendingDue: 2000 }), late = RQ.reaskAt({ now: 0, at: 0, tries: 6 });
  const hubNow = 5_000_000, pageNow = hubNow + 3_600_000;   // a page clock an hour ahead of the hub's
  const viaDelay = RQ.retryAtOf({ retryAt: hubNow + 30000, retryIn: 30000 }, pageNow), viaInstant = RQ.retryAtOf({ retryAt: hubNow + 30000 }, pageNow);
  ok(early === 2000 && late === 128000 && viaDelay === pageNow + 30000 && viaInstant < pageNow, `an earlier ask stands (${early} ms, not ${late}); the hub's next try counted on the page's clock (+${viaDelay - pageNow} ms — by the hub's instant alone it would be already past)`);
}
{
  // (e) WHO GETS THE PUSH (r1461 (2)): every live conversation whose history waits on that transcript BY THE ID ITS MARKS ARE KEPT
  // UNDER (getHistorySessionId — a fork's or a resumed parent's backend id first), on every device; never another conversation's,
  // never one loaded, never one nobody watches. CONTROL: the old match (claudeSessionId) misses the fork and takes a stranger
  const devices = (n) => new Map(Array.from({ length: n }, (_, i) => [{ device: i }, {}]));
  const sessions = new Map([
    ['live-two-devices', { claudeSessionId: 'X', backendSessionId: 'X', clients: devices(2) }],
    ['fork-of-x', { claudeSessionId: 'Z', backendSessionId: 'X', clients: devices(1) }],
    ['loaded', { claudeSessionId: 'X', _historyLoaded: true, clients: devices(1) }],
    ['another-conversation', { claudeSessionId: 'Y', clients: devices(1) }],
    ['nobody-watching', { claudeSessionId: 'X', clients: new Map() }],
    ['reads-w', { claudeSessionId: 'X', backendSessionId: 'W', clients: devices(1) }],
  ]);
  const got = SS0.historyWaitersOf(sessions, 'X').map(([sid]) => sid);
  const told = SS0.historyWaitersOf(sessions, 'X').reduce((n, [, s]) => n + s.clients.size, 0);
  const old = [...sessions].filter(([, s]) => s.claudeSessionId === 'X' && !s._historyLoaded && s.clients.size).map(([sid]) => sid);
  ok(got.join() === 'live-two-devices,fork-of-x' && told === 3 && old.join() === 'live-two-devices,reads-w', `the push reaches ${got.join(' + ')} (${told} devices) — CONTROL: by claudeSessionId alone it reached ${old.join(' + ')}`, { got, old });
}
{
  // (e2) THE VIEW WINDOWS WAITING ON IT (not in activeSessions: a stopped conversation, View History): told once at its readable, by
  // the view id each asked under; a closed socket skipped; another history's views never; bounded
  const { createViewWaiters } = require(path.join(REPO, 'src/ws-handler.js'));
  const W = createViewWaiters({ max: 3 });
  const wsA = { open: true }, wsB = { open: false };
  W.note('X', wsA, 'view-1'); W.note('X', wsB, 'view-2'); W.note('X', wsA, 'view-1b'); W.note('Y', wsA, 'view-y');
  const takeX = W.take('X', (w) => w.open).map(([w, v]) => (w === wsA ? 'A:' : 'B:') + v), again = W.take('X', (w) => w.open), takeY = W.take('Y', (w) => w.open).map(([, v]) => v);
  for (const id of ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']) W.note(id, wsA, 'v-' + id);
  ok(takeX.join() === 'A:view-1,A:view-1b' && again.length === 0 && takeY.join() === 'view-y' && W.size() === 3, `the views waiting on X are told once (${takeX.join(', ')}; a closed socket skipped; again: ${again.length}); Y's view only at Y's; the map bounded (${W.size()})`);
}
{
  // (e3) A CODEX CONVERSATION'S MARK (its reader, by its own thread id — the id its windows wait under): «not loaded» marks it, the
  // read that next loads it tells the listeners once
  const heard = []; const off = SS0.onHistoryReadable((id) => heard.push(id));
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' }));
  const m1 = new CS.CodexSessionMessages({ backend: 'codex', backendSessionId: tid, cwd, buffer: '' }, tid, {}); await m1.rawAsync();
  const before = heard.filter((x) => x === tid).length;
  C._setTranscriptPoolForTest(up());
  const m2 = new CS.CodexSessionMessages({ backend: 'codex', backendSessionId: tid, cwd, buffer: '' }, tid, {}); await m2.rawAsync();
  const m3 = new CS.CodexSessionMessages({ backend: 'codex', backendSessionId: tid, cwd, buffer: '' }, tid, {}); await m3.rawAsync();
  off();
  ok(!!m1.notLoaded && before === 0 && !m2.notLoaded && heard.filter((x) => x === tid).length === 1, `a codex conversation answered «not loaded» (${m1.notLoaded}) is told ONCE when its reader next loads it (${heard.filter((x) => x === tid).length})`, { notLoaded: m1.notLoaded, heard });
}
{
  // (f) THE STORAGE RETRY'S OWN PARK (r1461 (1)): the pool gone, one conversation's storage dead — its due retry on the main process
  // parks, and while it stays parked ANOTHER file's read goes on (RED at 82ca957dc: every other file refused «a read … still parked»),
  // a SECOND storage retry waits its turn (one parked at a time); a plain read that parks still holds the plain road (unit 2's
  // rule) — and a late I/O FAILURE keeps the own-deadline mark (the storage failing), a late answer of the file ends it
  const lines = fs.readFileSync(claudeFp, 'utf8').split('\n').filter(Boolean);   // the placed Claude transcript's records
  const mk = (name) => { const f = path.join(projDir, name); fs.writeFileSync(f, lines.slice(0, 60).join('\n') + '\n'); return f; };
  const D = mk('dead-storage.jsonl'), D2 = mk('dead-storage-2.jsonl'), H = mk('healthy.jsonl'), E = mk('late-eio.jsonl'), N = mk('late-enoent.jsonl'), O = mk('other.jsonl');
  const realOpen = fs.promises.open, plan = new Map();   // fp → { after, fail }: a placed answer (never a clock guess of the storage)
  fs.promises.open = function (p, ...a) { const q = plan.get(p); if (!q) return realOpen.call(this, p, ...a); return new Promise((res, rej) => setTimeout(() => (q.fail ? rej(Object.assign(new Error(`a placed ${q.fail}`), { code: q.fail })) : res(realOpen.call(fs.promises, p, ...a))), q.after)); };
  const settle = async (cond, ms = 3000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20)); return cond(); };
  try {
    C._setSlicedForTest({ afterMs: 0, deadlineMs: 300, storageRetryMs: 0 });   // the read's deadline 300 ms: a healthy 60-line file reads far inside it
    C._setTranscriptPoolForTest(refusing({ status: 503, code: 'path-hung' }));
    for (const f of [D, D2]) { try { await C.readJsonlTailAsync(f, { dropSubagent: true }); } catch { } }   // the storage's (sticky)
    C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' }));
    for (const f of [H, E, N, O]) { try { await C.readJsonlTailAsync(f, { dropSubagent: true }); } catch { } }   // refused, not the storage's
    const G = { _closed: true, calls: [], call(op) { this.calls.push(op); return Promise.reject(Object.assign(new Error('safeFs closed'), { status: 503 })); } };
    C._setTranscriptPoolForTest(G);
    let gone = null; try { await C.readJsonlTailAsync(O, { dropSubagent: true }); } catch (e) { gone = e; }
    ok(!!gone && gone.readerGone === true && C.poolGone(), `a refusal of a pool GONE says so (readerGone) — the page promises no «moment»`, { readerGone: gone && gone.readerGone });
    plan.set(D, { after: 1200, fail: 'EIO' }); plan.set(D2, { after: 1200, fail: 'EIO' });
    const p1 = C.readJsonlTailSliced(D, { dropSubagent: true, storageRetry: true }).then(() => null, (e) => e);
    const e1 = await p1;
    const st1 = C.slicedState(), road2 = C.slicedRoadFor(D2, { storageRetry: true }), roadH = C.slicedRoadFor(H);
    let readH = null; try { readH = await C.readJsonlTailSliced(H, { dropSubagent: true }); } catch (e) { readH = e; }
    ok(!!e1 && e1.code === 'sliced_read_deadline' && st1.storageParked === 1 && st1.parked === 0 && !road2.ok && /storage retry/.test(road2.why) && roadH.ok && readH && readH.entry && readH.entry.messages.length > 0,
      `a storage retry parked in a dead file (storageParked ${st1.storageParked}) refuses NO other file: a healthy one reads (${readH && readH.entry ? readH.entry.messages.length + ' records' : readH && readH.message}); a SECOND storage retry waits its turn («${road2.why}»)`, { st1, road2, roadH });
    // …and while it is parked a second storage retry's GAP is not spent (it could not run) and the page is told not before a minute
    const t1 = Date.now(), dueD2 = C.storageRetryDue(D2), nextD2 = C.nextReadAt(D2);
    ok(dueD2 === false && nextD2 - t1 >= 59000, `with the storage retry's one place held, another dead file's retry is not due (its gap kept) and its page asks again in +${nextD2 - t1} ms`, { dueD2 });
    // the parked storage retry's late FAILURE frees its place — its file stays the storage's
    await settle(() => C.slicedState().storageParked === 0);
    ok(C.slicedState().storageParked === 0 && C.fileStorageHung(D), 'the parked storage retry\'s late failure frees its place — the file stays the storage\'s', C.slicedState());
    // a plain read that parks: the plain road holds (unit 2's), the storage's line is its own — measured with a real retry gap (5 s)
    C._setSlicedForTest({ afterMs: 0, deadlineMs: 300, storageRetryMs: 5000 });
    plan.set(E, { after: 600, fail: 'EIO' });
    const eE = await C.readJsonlTailSliced(E, { dropSubagent: true }).then(() => null, (e) => e);
    const st2 = C.slicedState(), roadO = C.slicedRoadFor(O);
    ok(!!eE && eE.code === 'sliced_read_deadline' && st2.parked === 1 && st2.storageParked === 0 && !roadO.ok && /still parked/.test(roadO.why), `a PLAIN read parked holds the plain road as before («${roadO.why}»)`, { st2 });
    // …and its file is never read again while that read is parked: a storage retry of THE SAME file is refused (RED at 54a51379b's
    // first form: the plain park left no retry time — the retry was due at once and went into the same dead file), and it waits a gap
    const roadE = C.slicedRoadFor(E, { storageRetry: true }), dueE = C.storageRetryDue(E), nextE = C.nextReadAt(E) - Date.now();
    ok(!roadE.ok && /its own read on the main process is still parked/.test(roadE.why) && dueE === false && nextE >= 4000, `a storage retry into the file a plain read is parked in is refused («${roadE.why}») and waits its gap (due: ${dueE}; the page asks again in +${nextE} ms)`, { roadE, dueE, nextE });
    // the late answers: E's I/O failure KEEPS its own-deadline mark; then N's late ENOENT (the file's own answer) ends N's
    await settle(() => C.slicedState().parked === 0);
    const keptE = C.fileStorageHung(E);
    plan.set(N, { after: 600, fail: 'ENOENT' });
    await C.readJsonlTailSliced(N, { dropSubagent: true }).then(() => null, () => null);
    const markedN = C.fileStorageHung(N);
    await settle(() => C.slicedState().parked === 0);
    const endedN = !C.fileStorageHung(N);
    ok(keptE && markedN && endedN, `a late I/O FAILURE (EIO) after the hang keeps the own-deadline mark (the storage failing: ${keptE}); CONTROL: a late ENOENT — the file's own answer — ends it (${endedN})`, { keptE, markedN, endedN });
  } finally { fs.promises.open = realOpen; plan.clear(); C._setSlicedForTest({}); }
}
{
  // (g) THE CODEX DOUBLE FAULT: a rollout the storage's, the pool GONE ⇒ its due retry is the main process's own read — loaded, the
  // mark ends. CONTROL: the pool only refusing (no worker, not gone) ⇒ the pool is asked again, «not loaded», still the storage's
  const parseWith = (p) => { C._setTranscriptPoolForTest(p); return CS.parseCodexSessionJsonlAsync(tid, { fp: codexFp }); };
  C._setSlicedForTest({ storageRetryMs: 0 });
  await parseWith(up());   // a history read the pool answers: no refusal of it stands
  await parseWith(refusing({ status: 503, code: 'path-hung' }));   // the storage's
  const Nw = refusing({ status: 503, code: 'no-worker' });
  const ctl = await parseWith(Nw);
  const ctlHung = C.fileStorageHung(codexFp);
  const G = { _closed: true, call() { return Promise.reject(Object.assign(new Error('safeFs closed'), { status: 503 })); } };
  const got = await parseWith(G);
  ok(!!ctl.notLoaded && ctl.storageHung === true && ctlHung && Nw.calls.length >= 1 && Array.isArray(got) && !got.notLoaded && got.length > 1000 && !C.fileStorageHung(codexFp),
    `the codex double fault: the pool GONE ⇒ the due retry reads on the main process (${got.length} records, the mark ended) — CONTROL: the pool only refusing ⇒ asked again (${Nw.calls.length}), «not loaded»`, { ctl: ctl.notLoaded, n: got.length });
  C._setSlicedForTest({});
}
{
  // (h) THE 503 WITH ITS RETRY TIME (src/routes/sessions.js through the pure readerRefusedAnswer) and nextReadAt's other branches
  const now = 1_000_000;
  const a = C.readerRefusedAnswer({ message: 'm', code: 'transcript_reader_restarting', storageHung: true, retryAt: now + 30000 }, now);
  const past = C.readerRefusedAnswer({ code: 'transcript_reader_restarting', retryAt: now - 5000, readerGone: true }, now);
  const none = C.readerRefusedAnswer({ code: 'transcript_reader_restarting' }, now);
  ok(a.status === 503 && a.retryAfter === '30' && a.body.retryIn === 30000 && a.body.storageHung === true && a.body.readerGone === false
    && past.retryAfter === '2' && past.body.retryIn === 0 && past.body.readerGone === true && none.retryAfter === '2' && none.body.retryAt === null && none.body.retryIn === null,
    `the 503: Retry-After ${a.retryAfter} s + retryIn ${a.body.retryIn} ms + its door; a past time ⇒ ${past.retryAfter} s / 0; none ⇒ ${none.retryAfter} s / null`);
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' }));
  const fresh = path.join(projDir, 'fresh-refusal.jsonl'); fs.writeFileSync(fresh, fs.readFileSync(claudeFp, 'utf8').split('\n').filter(Boolean).slice(0, 5).join('\n') + '\n');
  try { await C.readJsonlTailAsync(fresh, { dropSubagent: true }); } catch { }
  const t0 = Date.now(), atFresh = C.nextReadAt(fresh), atZst = C.nextReadAt(path.join(projDir, 'never.jsonl.zst'));
  ok(atFresh - t0 >= 9500 && atFresh < atZst && atZst - t0 >= 59000, `nextReadAt: a fresh refusal ⇒ when the main process's read opens (+${atFresh - t0} ms); a compressed rollout ⇒ a minute (+${atZst - t0} ms)`);
}
{
  // (i) NO POOL ON THIS PROCESS (its build's tries spent — the pool GONE, never an object): a Claude history refused and stood past
  // the stated time IS read on the main process, the warm's road through B-cd4b's pager told by the refusal THROWN. RED at the move's
  // first form 4e0cca88e: the pager answered null there, the warm ended «false» before its catch — «not loaded» until a restart.
  // CONTROL: the same with the stated time not yet passed — «not loaded» (the guard decides, not the leg)
  const sidN = '91111111-2222-4333-8444-555555555555', fpN = path.join(projDir, sidN + '.jsonl');
  fs.writeFileSync(fpN, fs.readFileSync(claudeFp, 'utf8').split('\n').filter(Boolean).slice(0, 40).join('\n') + '\n');
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' }));
  try { await C.readJsonlTailAsync(fpN, { dropSubagent: true }); } catch { }   // refused once: the file's record
  C._setTranscriptPoolForTest(false);
  C._setSlicedForTest({ afterMs: 3600000 });
  const ctl = await SS0.warmSessionJsonlAsync(sidN, cwd);
  C._setSlicedForTest({ afterMs: 0 });
  const got = await SS0.warmSessionJsonlAsync(sidN, cwd);
  const parsed = SS0.parseSessionJsonl(sidN, cwd);
  ok(C.poolGone() && ctl === false && got === true && Array.isArray(parsed) && !parsed.notLoaded && parsed.length > 0,
    `no pool on this process: the warm reads the history on the main process (${got}; the parse answers ${parsed.length} records, loaded) — CONTROL: before the stated time, «not loaded» (${ctl})`, { gone: C.poolGone(), ctl, got, n: parsed.length, notLoaded: parsed.notLoaded || null });
  C._setSlicedForTest({});
}
C._setTranscriptPoolForTest(pool);   // the real pool (closed) back in its place

// ── THE PAGE'S WIRING (the page's words are drawn by the chrome suites; these pins hold the roads that say them) ──
{
  const cv = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8'), csr = fs.readFileSync(path.join(REPO, 'src/lib/chat-search.js'), 'utf8'), sl = fs.readFileSync(path.join(REPO, 'src/lib/session-lifecycle.js'), 'utf8');
  const rw = fs.readFileSync(path.join(REPO, 'src/lib/reader-words.js'), 'utf8');   // r3077: the one table of the words
  const ws = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
  const askCase = ws.slice(ws.indexOf("case 'history-ask': {"), ws.indexOf("case 'attach': {"));
  const pins = [
    ['the page fetch of a refused history FAILS (the view that stands kept), «try again» unless quiet — in the words of the cause it has (r3077)', /if \(data && data\.notLoaded\) \{\n\s+const info = \{ storageHung: !!data\.storageHung, readerGone: !!data\.readerGone, readerCause: data\.readerCause \|\| null, retryAt: data\.retryAt \|\| null, retryIn: data\.retryIn \?\? null \};\n\s+if \(!quietRefusal\) this\._sayReaderRestarting\(info\);\n\s+throw Object\.assign\(new Error\(this\._readerAskWords\(info\)\)/.test(cv)],
    ['the read-only 2 s poll asks quietly', /_fetchMessagePage\(nextOffset, 200, \{ withStatus: true, quietRefusal: true \}\)/.test(cv)],
    ['the view reset says the line again (after the heal: test-hidden-view-suspend pins nothing between the rebuild and it)', /this\.loadHistory\(msg\.messages \|\| \[\], msg\.totalCount \|\| 0, msg\.isStreaming, msg\);\s*\n(\s*\/\/.*\n)*\s*this\._seqPoisoned = false;\n\s+if \(msg && msg\.historyNotLoaded\) this\._sayHistoryNotLoaded\(msg\.historyNotLoaded, \{ again: true, info: msg\.historyNotLoadedInfo \|\| null \}\);/.test(cv)],
    ['the words of the cause the refusal has (r3077, src/lib/reader-words.js — ONE table: the storage\'s, the reader GONE\'s with no «moment» (r1461 (1)), a busy reader\'s, a restarting one\'s, else no cause named): the line asks again by itself', /const words = readerLineWords\(info, this\._clockOf\(at\)\);/.test(cv) && /if \(k === 'storage'\) return t\("This conversation's file is not answering, so its history is not loaded yet/.test(rw) && /if \(k === 'gone'\) return t\('The history is not loaded yet, or not all of it — the transcript reader is not running\. Trying again at/.test(rw) && /return t\('The history is not loaded yet, or not all of it — it could not be read just now\. It fills in here by itself in a moment\.'\);/.test(rw)],
    ['ONE line: a later answer changes its WORDS in place — a re-ask that changes nothing adds no row and moves none (r1461 (3))', /if \(inner\) \{ inner\.textContent = words; return; \}/.test(cv)],
    ['the page\'s re-ask is the PURE decision\'s (src/lib/history-reask.js — legs above): its timer, its act', /import \{ reaskNext, retryAtOf \} from '\.\/history-reask\.js';/.test(cv) && /const \{ state, act \} = reaskNext\(this\._reask, \{ now: Date\.now\(\), \.\.\.ev \}\);/.test(cv) && /setTimeout\(\(\) => this\._reaskEvent\(\{ type: 'due' \}\)/.test(cv)],
    ['the timer\'s ask is the CHEAP one (`history-ask`); the reload — a live window\'s re-attach — only when the hub said readable', /: \{ type: 'history-ask', sessionId: this\.sessionId \};/.test(cv) && /_reloadHistory\(\) \{\n\s+if \(this\._disposed\) return;\n\s+if \(!this\._readOnly\) \{ this\._reattach\(false\); return; \}/.test(cv) && /msg\.type === 'history-ready' && msg\.sessionId === sessionId\) \{\n\s+this\._onHistoryReady\(\);/.test(cv)],
    ['the hub\'s `history-ask` REBUILDS NOTHING: it reads again and answers `history-not-loaded` (the door, the next try) or `history-ready`', askCase.length > 200 && !/rebuildHistory|convertWithCards|createMessageManager/.test(askCase) && /reply\(\{ type: 'history-not-loaded', historyNotLoaded: sm\.notLoaded,/.test(askCase) && /reply\(\{ type: 'history-ready' \}\)/.test(askCase) && /live\.clients\.has\(ws\)/.test(askCase)],
    ['the push matches the id the marks are kept under (historyWaitersOf — r1461 (2))', /for \(const \[sid, s\] of SSH\.historyWaitersOf\(activeSessions, historyId\)\)/.test(ws) && !/s\.claudeSessionId !== claudeSessionId/.test(ws)],   // stale-pins: kept (the absence check: the listener matches by claudeSessionId no more)
    ['the ask and the reload take ITS OWN answer only (one socket carries every window\'s)', (cv.match(/if \(msg\.sessionId !== sid\) return;/g) || []).length >= 2],
    ['the time in the page\'s own clock (page-time clockOf — its language, its zone), never toLocaleTimeString', /_clockOf\(ms\) \{ return clockOf\(Number\(ms\) \|\| Date\.now\(\), \{ seconds: true \}\); \}/.test(cv) && /const when = clockOf\(retryAtOf\(data, Date\.now\(\)\)/.test(csr) && !/toLocaleTimeString/.test(csr)],   // stale-pins: kept (the absence check: chat-search prints no toLocaleTimeString any more)
    ['a view\'s reloaded slab: «not loaded» again over the same total is left as drawn; else EVERY row goes (a record drawn as a system row too) and the page\'s own lines are said again', /if \(msg\.historyNotLoaded && this\._total === total\) return;/.test(cv) && /_reloadViewSlab\(msg\) \{[\s\S]{0,900}this\._messageList\.querySelectorAll\('\.chat-msg, \.chat-msg-system'\)\.forEach\(el => el\.remove\(\)\);[\s\S]{0,400}if \(this\._rescueNoteSaid\) this\._renderers\.appendSystem/.test(cv)],
    ['a live window whose session ENDED while its history was not loaded asks its conversation\'s view (never a sub-agent viewer\'s parent)', /_viewSpecNow\(\) \{ return this\._readOnly \? \(this\._viewAttachSpec \|\| \(this\._viewAttachSpec = this\._viewSpecOfIds\(\)\)\) : null; \}/.test(cv) && /_viewSpecOfIds\(\) \{\n\s+if \(this\.sessionId\.startsWith\('sub-'\)\) return null;/.test(cv)],
    ['a closed view asks nothing again', /clearTimeout\(this\._historyReaskTimer\); this\._historyReaskTimer = null; try \{ this\._historyAskCancel\?\.\(\); this\._historyReloadCancel\?\.\(\); this\._historyReadyOff\?\.\(\); \} catch \{ \}   \/\/ row B-422c: a closed view/.test(cv)],
    ['r1243: a view-only window keeps its own request for the re-ask', /chatView\._viewAttachSpec = viewSpec;/.test(sl) && /this\._viewAttachSpec = spec;/.test(cv)],
    ['the minimap fallback draws nothing from it', /if \(d\.turns\?\.length && !d\.notLoaded\) this\._chatMinimap\.render\(d\.turns\)/.test(cv)],
    ['/api/subagents\' reason in the page\'s words — the reader gone\'s with no time promised', /if \(r\?\.reason === 'transcript_reader_restarting'\) \{ this\._sayReaderRestarting\(\{ readerGone: !!r\.readerGone \}\); return; \}/.test(cv) && /: t\('The transcript reader is not running\.'\);/.test(rw) && /return readerAskWords\(info, readerKindOf\(info\) === 'gone' && !at \? null : this\._clockOf\(at\)\);/.test(cv)],
    ['a VIEW hears its own history-ready (the hub notes the view waiting at its view attach and its ask, and tells it at the readable)', /this\._historyReadyOff = this\.ws\.onGlobal\(\(m\) => \{ if \(m && m\.type === 'history-ready' && m\.sessionId === vid && !this\._disposed\) this\._onHistoryReady\(\); \}\);/.test(cv) && /for \(const \[vws, vsid\] of _viewWaiters\.take\(historyId, \(w\) => w\.readyState === WS_OPEN\)\)/.test(ws) && /if \(sm\.notLoaded\) _viewWaiters\.note\(SSH\.getHistorySessionId\(\{ backendSessionId, claudeSessionId: data\.claudeSessionId \|\| backendSessionId \}\), ws, data\.sessionId\);/.test(ws) && /if \(viewHid\) _viewWaiters\.note\(viewHid, ws, data\.sessionId\);/.test(askCase)],
    ['the hub\'s ask: a newer ask of the same window supersedes an older one before it reads; a read that failed is never «ready»', /await readOffLoop\(sm, \{ label: `history-ask \$\{data\.sessionId\}`, wanted: current, bulk: live \? BULK\.isBulk\(live\) : false \}\);/.test(askCase) && /if \(!parsed\) \{ reply\(\{ type: 'history-not-loaded', historyNotLoaded: 'transcript_reader_restarting', historyNotLoadedInfo: null \}\); break; \}/.test(askCase)],
    ['a search of it says the words of the cause the refusal has (the one table), never «No results»', /this\._searchStatus\.textContent = readerAskWords\(data, when\);/.test(csr) && /import \{ readerAskWords \} from '\.\/reader-words\.js';/.test(csr)],
    ['the resume road says the line', /if \(data\.notLoaded\) chatView\._sayHistoryNotLoaded\?\.\(data\.notLoaded, \{ info: \{ storageHung: !!data\.storageHung, readerGone: !!data\.readerGone, readerCause: data\.readerCause \|\| null, retryAt: data\.retryAt \|\| null, retryIn: data\.retryIn \?\? null \} \}\);/.test(sl)],
    ['the REBUILD alone sets _historyNotLoaded (never an attach that joined it)', /session\._historyNotLoaded = notLoaded \|\| null;/.test(fs.readFileSync(path.join(REPO, 'src/normalizers.js'), 'utf8')) && !/session\._historyNotLoaded = /.test(ws)],   // stale-pins: kept (the absence check: ws-handler writes it no more)
  ];
  for (const [name, held] of pins) ok(held, `the page: ${name}`);
}
report();
