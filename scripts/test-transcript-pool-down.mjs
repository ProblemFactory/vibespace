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
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';

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
  ['no worker', { status: 503, code: 'no-worker' }, false], ['no idle worker', { status: 503, code: 'no-idle' }, false],
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
{
  C._setTranscriptPoolForTest(refusing({ code: 'EACCES' }));
  let e = null; try { await C.jsonlGapInfoAsync(claudeFp); } catch (x) { e = x; }
  ok(!!e && e.code === 'EACCES', 'an error of the op itself (EACCES) stays what it was — never named a pool failure', { code: e && e.code });
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' }, { inPlace: true }));
  e = null; try { await C.jsonlGapInfoAsync(claudeFp); } catch (x) { e = x; }
  ok(!!e && e.code === 'no-worker', 'the device\'s IN-PLACE road (no worker script: its own loop) is no pool failure — its error passes as before', { code: e && e.code });
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
  const warmed = await SS0.warmSessionJsonlAsync(sid, cwd);   // the pool answers: the cache holds the 3 MB tail, the note (road ④'s) cleared
  const whole = SS0.parseSessionJsonl(sid, cwd);
  ok(warmed === true && Array.isArray(whole) && whole.length > 1000 && !whole.notLoaded, `the pool answering: the warm reads it, the note ends — ${whole.length} records, loaded`, { warmed, n: whole.length, notLoaded: whole.notLoaded });
  // the file REWRITTEN (not an append — the warm asks the pool for a full read), the pool then refusing: the kept copy is BEHIND
  const lines = fs.readFileSync(claudeFp, 'utf8').split('\n').filter(Boolean);
  fs.writeFileSync(claudeFp, lines.slice(0, 2000).join('\n') + '\n');
  const N = refusing({ status: 503, code: 'no-worker' }); C._setTranscriptPoolForTest(N);
  const tails = (P) => P.calls.filter((o) => o === 'jsonlTail').length;
  const Rk = await road('④c the Claude history, its kept copy behind the file', async () => {
    const w = await SS0.warmSessionJsonlAsync(sid, cwd), asked = tails(N);
    const m = new SS0.SessionMessages({ backend: 'claude', claudeSessionId: sid, cwd, buffer: '' }, sid, {});
    m._ensureParsed();
    await new Promise((res) => setImmediate(res));
    return { warmed: w, records: Array.isArray(m._all) ? m._all.length : null, notLoaded: m.notLoaded || null, warmAsks: asked, afterParse: tails(N) };
  });
  ok(content(Rk).length === 0 && Rk.out && Rk.out.records === whole.length && Rk.out.notLoaded === 'transcript_reader_restarting', `${Rk.name}: the kept copy (${Rk.out && Rk.out.records} records) is answered TAGGED «not loaded» — the attach keeps the history unloaded, the next reads again (${content(Rk).length} content reads)`, { out: Rk.out, err: Rk.err });
  ok(!!Rk.out && Rk.out.warmAsks === 1 && Rk.out.afterParse === 2, `a refusal that is not the storage's ⇒ the parse asks the warm again, off the loop (${Rk.out && Rk.out.afterParse - Rk.out.warmAsks} more ask)`, Rk.out);
  // the note ENDS on any end but the refusal: an op's own error (EACCES) — the next parse is the old road's (no «not loaded»)
  C._setTranscriptPoolForTest(refusing({ code: 'EACCES' }));
  await SS0.warmSessionJsonlAsync(sid, cwd);
  const after = SS0.parseSessionJsonl(sid, cwd);
  ok(Array.isArray(after) && !after.notLoaded && after.length === 2000, `the note ends when a warm ends in anything but the refusal (an op's own EACCES): the parse is the old road again (${after.length} records, no «not loaded»)`, { n: after.length, notLoaded: after.notLoaded });
  // THE STORAGE'S REFUSAL: a hung path. From a FRESH note (a warm that READ ends the last one — at any tree: the rate limit of an
  // older note never answers for the guard), the file rewritten (never an append — that one is folded in inline)
  C._setTranscriptPoolForTest(up()); await SS0.warmSessionJsonlAsync(sid, cwd);
  fs.writeFileSync(claudeFp, lines.slice(0, 1500).join('\n') + '\n');
  const H = refusing({ status: 503, code: 'path-hung' }); C._setTranscriptPoolForTest(H);
  await SS0.warmSessionJsonlAsync(sid, cwd);
  const asked0 = tails(H);
  SS0.parseSessionJsonl(sid, cwd); SS0.parseSessionJsonl(sid, cwd);
  await new Promise((res) => setImmediate(res));
  ok(asked0 === 1 && tails(H) === asked0, `a hung path (the storage's) ⇒ the parse asks no warm again (${tails(H) - asked0} more asks after two parses; the warm itself asked ${asked0})`, { asked0, asked1: tails(H) });
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
  fs.writeFileSync(claudeFp, lines.slice(0, 1200).join('\n') + '\n');
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'path-hung' })); await SS0.warmSessionJsonlAsync(sid, cwd);
  C._setTranscriptPoolForTest(refusing({ code: 'EACCES' })); await SS0.warmSessionJsonlAsync(sid, cwd);
  const opEnd = SS0.parseSessionJsonl(sid, cwd);
  ok(!opEnd.notLoaded && opEnd.length === 1200, `the hung note ends on its retry's own op error (EACCES): the old road (${opEnd.length} records)`, { n: opEnd.length, notLoaded: opEnd.notLoaded });
  // TWO WARMS OF ONE SESSION AT ONCE ARE ONE (joined): the second ask while the first reads is the SAME read — never a second
  // history read of the file sent to the pool (unjoined re-warms queued reads whose deadlines ended workers)
  fs.writeFileSync(claudeFp, lines.slice(0, 1000).join('\n') + '\n');
  let release = null;
  const D = { calls: [], call(op, payload) { this.calls.push(op); if (op === 'jsonlTail') return new Promise((res) => { release = () => res(Promise.resolve(TW.runOp(op, payload)).then((x) => x.result)); }); return Promise.resolve(TW.runOp(op, payload)).then((x) => x.result); } };
  C._setTranscriptPoolForTest(D);
  const w1 = SS0.warmSessionJsonlAsync(sid, cwd), w2 = SS0.warmSessionJsonlAsync(sid, cwd);
  await new Promise((res) => setImmediate(res));
  const askedTails = D.calls.filter((o) => o === 'jsonlTail').length;
  if (release) release();
  const [o1, o2] = await Promise.all([w1, w2]);
  ok(w1 === w2 && askedTails === 1 && o1 === true && o2 === true, `two warms of one session at once are ONE (the same read: ${askedTails} tail read asked of the pool)`, { same: w1 === w2, askedTails });
  // A LATE REFUSAL NEVER HIDES A CURRENT COPY: the file read (the cache IS the file), then a refusal of it lands — the parse reads
  // nothing on the loop and answers the copy LOADED (one stat shows it is the file)
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' })); try { await C.readJsonlTailAsync(claudeFp, { dropSubagent: true }); } catch { }   // a HISTORY read refused (a gap read's refusal says nothing of the tail)
  const Rl = await road('a parse after a late refusal of a file the cache holds whole', () => { const l = SS0.parseSessionJsonl(sid, cwd); return { n: l.length, notLoaded: l.notLoaded || null }; });
  ok(Rl.out && !Rl.out.notLoaded && Rl.out.n === 1000 && content(Rl).length === 0, `${Rl.name}: LOADED (${Rl.out && Rl.out.n} records), nothing read on the loop (${content(Rl).length})`, { out: Rl.out, reads: Rl.reads.slice(0, 4) });
  // ONE TAGGED TWIN per kept entry (the merge memo keys on the array): two parses under one note answer the SAME list
  fs.writeFileSync(claudeFp, lines.slice(0, 800).join('\n') + '\n');
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' })); await SS0.warmSessionJsonlAsync(sid, cwd);
  const t1 = SS0.parseSessionJsonl(sid, cwd), t2 = SS0.parseSessionJsonl(sid, cwd);
  ok(t1 === t2 && t1.notLoaded === 'transcript_reader_restarting' && t1.length === 1000, `the kept copy's tagged twin is ONE per cache entry (the same list twice: the merge memo hits; ${t1.length} records, tagged)`, { same: t1 === t2, n: t1.length, notLoaded: t1.notLoaded });
  // (1) A REFUSAL OF ANOTHER KIND NEVER UNHANGS THE STORAGE'S HOLD: a hung path, then «no worker» for the same file — the parse
  // asks no warm while the hold stands
  await SS0.warmSessionJsonlAsync(sid, cwd);   // SETTLED: a re-warm the last parse asked (under the stand-in before) ends first — warms of one session join
  const H1 = refusing({ status: 503, code: 'path-hung' }); C._setTranscriptPoolForTest(H1);
  fs.writeFileSync(claudeFp, lines.slice(0, 700).join('\n') + '\n');
  await SS0.warmSessionJsonlAsync(sid, cwd);   // the storage's: the file's record holds it
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' })); try { await C.jsonlGapInfoAsync(claudeFp); } catch { }
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
  fs.writeFileSync(claudeFp, lines.slice(0, 600).join('\n') + '\n');
  const split = { calls: [], call(op, payload) { this.calls.push(op); if (op === 'jsonlTail') return Promise.reject(Object.assign(new Error('storage worker restarted'), { status: 503 })); return new Promise((res) => setTimeout(() => res(TW.runOp(op, payload).result), 5)); } };
  C._setTranscriptPoolForTest(split);
  await SS0.warmSessionJsonlAsync(sid, cwd);
  const Rt = await road('(3) a parse after the tail was refused and the task scan answered after it', () => { const l = SS0.parseSessionJsonl(sid, cwd); return { n: l.length, notLoaded: l.notLoaded || null }; });
  ok(split.calls.includes('taskLines') && content(Rt).length === 0 && Rt.out && Rt.out.notLoaded === 'transcript_reader_restarting', `${Rt.name}: nothing read on the loop (${content(Rt).length}) — «not loaded» (the copy behind the file)`, { out: Rt.out, calls: split.calls });
  // (4) THE HUNG RETRY THAT READS stamps its parse and warms the task scan beside it, as the normal road
  await SS0.warmSessionJsonlAsync(sid, cwd);   // SETTLED (the parse above asked a re-warm)
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'path-hung' })); await SS0.warmSessionJsonlAsync(sid, cwd);   // the storage's
  fs.writeFileSync(claudeFp, lines.slice(0, 500).join('\n') + '\n');
  const U = up(), metrics = [], metricWas = global.__vsMetric;
  global.__vsMetric = (n) => metrics.push(n);
  C._setTranscriptPoolForTest(U);
  const readC = await SS0.warmSessionJsonlAsync(sid, cwd);
  global.__vsMetric = metricWas;
  ok(readC === true && metrics.includes('srv-jsonl-parse-bytes') && U.calls.includes('taskLines'), `the hung retry that reads stamps its parse and warms the task scan (metrics: ${[...new Set(metrics)].join(', ') || 'none'}; asked: ${U.calls.join(', ')})`, { metrics, calls: U.calls });
  // (5) THE STORAGE'S RETRY HAS A GAP: a file the storage's is asked of the pool again at most once a gap (30 s doubling, ≤ 8 min —
  // here 60 ms): a warm inside the gap asks nothing, the first after it asks once
  C._setSlicedForTest({ storageRetryMs: 60 });
  fs.writeFileSync(claudeFp, lines.slice(0, 400).join('\n') + '\n');
  const Hg = refusing({ status: 503, code: 'path-hung' }); C._setTranscriptPoolForTest(Hg);
  await SS0.warmSessionJsonlAsync(sid, cwd);   // the storage's (the cache was behind: the pool asked, refused)
  const g0 = tails(Hg);
  await SS0.warmSessionJsonlAsync(sid, cwd);   // inside the gap: nothing asked
  const g1 = tails(Hg);
  await new Promise((res) => setTimeout(res, 90));
  await SS0.warmSessionJsonlAsync(sid, cwd);   // past it: the pool asked once
  ok(g0 >= 1 && g1 === g0 && tails(Hg) === g0 + 1, `the storage's retry has a gap: inside it nothing asked (${g1 - g0}), past it the pool asked once (${tails(Hg) - g1})`, { g0, g1, g2: tails(Hg) });
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
  ok(/pathKeys: \['fp'\],/.test(ad) && /climb: false,/.test(ad) && /laneOpts: \{ history: \{ resourceLimits: \{ maxOldGenerationSizeMb: HISTORY_HEAP_MB \}, hungMs: 0 \} \}/.test(ad), 'the transcript pool is built with all three (pathKeys fp, climb false, the history lane hungMs 0)');
}

// ── THE PAGE'S WIRING (the page's words are drawn by the chrome suites; these pins hold the roads that say them) ──
{
  const cv = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8'), csr = fs.readFileSync(path.join(REPO, 'src/lib/chat-search.js'), 'utf8'), sl = fs.readFileSync(path.join(REPO, 'src/lib/session-lifecycle.js'), 'utf8');
  const pins = [
    ['the page fetch of a refused history FAILS (the view that stands kept), «try again» unless quiet', /if \(data && data\.notLoaded\) \{\n\s+if \(!quietRefusal\) this\._sayReaderRestarting\(\);\n\s+throw /.test(cv)],
    ['the read-only 2 s poll asks quietly', /_fetchMessagePage\(nextOffset, 200, \{ withStatus: true, quietRefusal: true \}\)/.test(cv)],
    ['the view reset says the line again', /this\.loadHistory\(msg\.messages \|\| \[\], msg\.totalCount \|\| 0, msg\.isStreaming, msg\);\n\s+if \(msg && msg\.historyNotLoaded\) this\._sayHistoryNotLoaded\(msg\.historyNotLoaded, \{ again: true \}\);/.test(cv)],
    ['the minimap fallback draws nothing from it', /if \(d\.turns\?\.length && !d\.notLoaded\) this\._chatMinimap\.render\(d\.turns\)/.test(cv)],
    ['/api/subagents\' reason in the page\'s words', /if \(r\?\.reason === 'transcript_reader_restarting'\) \{ this\._sayReaderRestarting\(\); return; \}/.test(cv)],
    ['a search of it says «try again», never «No results»', /if \(data && data\.notLoaded\) \{ if \(!stale\(\)\) this\._searchStatus\.textContent = t\('The transcript reader is restarting — try again in a moment\.'\); return; \}/.test(csr)],
    ['the resume road says the line', /if \(data\.notLoaded\) chatView\._sayHistoryNotLoaded\?\.\(data\.notLoaded\);/.test(sl)],
    ['the REBUILD alone sets _historyNotLoaded (never an attach that joined it)', /session\._historyNotLoaded = notLoaded \|\| null;/.test(fs.readFileSync(path.join(REPO, 'src/normalizers.js'), 'utf8')) && !/session\._historyNotLoaded = /.test(fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8'))],   // stale-pins: kept (the absence check: ws-handler writes it no more)
  ];
  for (const [name, held] of pins) ok(held, `the page: ${name}`);
}
report();
