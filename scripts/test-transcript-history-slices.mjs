#!/usr/bin/env node
// test-transcript-history-slices.mjs — HEAVY (in-process; the fast tier's stated sum sits at its cap): ROW B-422c UNIT 2 (lane hub-loop-stalls, 主开发 r1006 item 2 — THE
// DEGRADATION ROAD of the TWO HISTORIES). THE LAW: a person can always read a conversation's history, and no step of it holds the
// loop 250 ms. With the REAL transcript pool closed for good, a history whose refusal is NOT the storage's and has stood past the
// stated time is read ON THE MAIN PROCESS in bounded slices (src/adapters/codex.js readJsonlTailSliced / readCodexRolloutSliced):
//   ① the Claude history: the first warm says «not loaded» (the refusal has not stood yet — nothing read); past the stated time the
//     warm loads it, NO synchronous read of the transcript, the longest loop turn UNDER THE LAW; its cache entry = the worker's
//     (readJsonlTail's full read, field for field). The whole-file parse on the loop (readJsonlTail, the release's road) is timed
//     here and PRINTED beside it (r1243: a premise on the machine's speed is no guard — the guards are the sliced road's longest
//     turn and its zero synchronous reads).
//   ② the codex history (CodexSessionMessages.rawAsync): the same — its records = parseCodexSessionJsonl's (that parse timed, printed).
//   ③ the STORAGE's refusal (a hung path): nothing read on the main process, ever (RED: a refusal of another kind reads it there).
//   ④ the four other roads never take it (the gap read refuses by name; nothing opened).
//   ⑤ said once a file in the journal.
//   ⑥ a deadline on the codex MERGED read (it names its files in `files`, never `fp`): every file it names is the storage's — none
//     is read on the main process after it (RED: the per-file «no worker» that follows would open it).
//   ⑦ the record's bounds: a refusal STANDS only while asked again within the stated gap; the storage's records outlive the bound.
//   ⑧ OUTPUT IDENTITY on every small shape (a few lines, no newline at all, a trailing partial line, CRLF, a BOM, invalid lines, a
//     side-chain record, an empty file): the sliced entry = readJsonlTail's, the sliced records = parseCodexSessionJsonl's.
//   ⑨ THE READ'S OWN DEADLINE (a real FIFO: its open never answers): the file becomes the storage's, the parked read holds the one
//     place (no other file is read there meanwhile), and frees it when the file answers at last.
// The placed transcripts are ~36 MB each (the tail bound is 32 MB): on disk under /var/tmp (src/fixture-guard.js TMP_ROOTS[1]),
// never /tmp (RAM), removed at every exit and on every signal.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import './scratch.mjs';   // FIRST (§113, B-ba47's order): a temp home of its own before any of this suite's code
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const { TMP_ROOTS } = require(path.join(REPO, 'src/fixture-guard.js'));
const HOME = fs.mkdtempSync(path.join(TMP_ROOTS[1], 'vs-ths-'));
process.on('exit', () => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch (e) { process.stderr.write(`the scratch ${HOME} could not be removed: ${e.message}\n`); } });
for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) process.on(sig, () => process.exit(128 + n));
process.env.HOME = HOME;
process.env.VIBESPACE_SKIP_AGENT_HOOKS = '1';
const LAW_MS = 250;   // 主开发 r1006: no step of a history's read holds the loop 250 ms

// THE PROBE, armed before any product module loads: the transcripts' synchronous calls, and their ASYNC opens (the sliced road's)
const watched = [];
const fdPath = new Map();
let counting = null;
const under = (p) => { const s = String(p); return watched.some((w) => s === w || s.startsWith(w + path.sep)); };
const note = (name, p) => { if (counting && under(p)) counting.reads.push(`${name} ${path.relative(HOME, String(p))}`); };
for (const name of ['readFileSync', 'statSync', 'lstatSync', 'readdirSync', 'existsSync', 'realpathSync']) {
  const real = fs[name];
  fs[name] = function (p, ...a) { note(name, p); return real.call(this, p, ...a); };
}
{ const real = fs.openSync; fs.openSync = function (p, ...a) { const fd = real.call(this, p, ...a); if (under(p)) fdPath.set(fd, String(p)); else fdPath.delete(fd); return fd; }; }
{ const real = fs.readSync; fs.readSync = function (fd, ...a) { if (fdPath.has(fd)) note('readSync', fdPath.get(fd)); return real.call(this, fd, ...a); }; }
{ const real = fs.promises.open; fs.promises.open = function (p, ...a) { note('promises.open', p); return real.call(this, p, ...a); }; }
(await import('node:module')).syncBuiltinESMExports();

// THE PLACED TRANSCRIPTS — short records, so the whole-file parse of the 32 MB tail is as long as a tail can make it
const cwd = path.join(HOME, 'work', 'project-s');
fs.mkdirSync(cwd, { recursive: true });
const SS = require(path.join(REPO, 'src/session-store.js'));
const projDir = path.join(HOME, '.claude', 'projects', SS.cwdToProjectDir(cwd));
fs.mkdirSync(projDir, { recursive: true });
const sids = ['a1111111-2222-4333-8444-555555555555', 'b1111111-2222-4333-8444-555555555555', 'c1111111-2222-4333-8444-555555555555', 'd1111111-2222-4333-8444-555555555555', 'e1111111-2222-4333-8444-555555555555', 'f1111111-2222-4333-8444-555555555555', '71111111-2222-4333-8444-555555555555'];
const claudeFp = (sid) => path.join(projDir, sid + '.jsonl');
const BIG = 36 * 1024 * 1024;
function placeClaude(fp, bytes) {
  const out = fs.openSync(fp, 'w');
  try {
    let k = 0, n = 0;
    while (n < bytes) {
      const rows = [];
      for (let i = 0; i < 4096; i++, k++) rows.push(`{"type":"user","uuid":"u${k}","message":{"role":"user","content":"q"}}`);   // the shortest records a history holds: the most of them in the 32 MB tail (the RED's margin)
      const chunk = rows.join('\n') + '\n';
      fs.writeSync(out, chunk); n += Buffer.byteLength(chunk);
    }
  } finally { fs.closeSync(out); }
}
placeClaude(claudeFp(sids[0]), BIG);
for (const sid of sids.slice(1)) placeClaude(claudeFp(sid), 64 * 1024);
const tid = '019b0000-1111-7222-8333-444444444444';
const codexDir = path.join(HOME, '.codex', 'sessions', '2026', '11', '21'), codexFp = path.join(codexDir, `rollout-2026-11-21T00-00-00-${tid}.jsonl`);
fs.mkdirSync(codexDir, { recursive: true });
{
  const out = fs.openSync(codexFp, 'w');
  try {
    fs.writeSync(out, JSON.stringify({ type: 'session_meta', payload: { id: tid, cwd, originator: 'codex_cli_rs', cli_version: '0.153.0' } }) + '\n');
    let k = 0, n = 0;
    while (n < BIG) {
      const rows = [];
      for (let i = 0; i < 4096; i++, k++) rows.push(k % 2 ? `{"type":"event_msg","payload":{"type":"agent_reasoning","text":"r${k}"}}` : `{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"m${k}"}]}}`);   // short rows: the most records in the tail
      const chunk = rows.join('\n') + '\n';
      fs.writeSync(out, chunk); n += Buffer.byteLength(chunk);
    }
  } finally { fs.closeSync(out); }
}
const tid2 = '019b0000-2222-7222-8333-444444444444', tid3 = '019b0000-3333-7222-8333-444444444444';
const codexFp2 = path.join(codexDir, `rollout-2026-11-21T00-00-01-${tid2}.jsonl`), codexFp3 = path.join(codexDir, `rollout-2026-11-21T00-00-02-${tid3}.jsonl`);
for (const [fp, id] of [[codexFp2, tid2], [codexFp3, tid3]]) fs.writeFileSync(fp, [JSON.stringify({ type: 'session_meta', payload: { id, cwd, originator: 'codex_cli_rs', cli_version: '0.153.0' } }), '{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hi"}]}}'].join('\n') + '\n');
watched.push(projDir, path.join(HOME, '.codex'));
console.log(`the placed transcripts: Claude ${fs.statSync(claudeFp(sids[0])).size} bytes, codex ${fs.statSync(codexFp).size} bytes (under ${HOME})`);

const C = require(path.join(REPO, 'src/adapters/codex.js'));
const CS = require(path.join(REPO, 'src/codex-session-store.js'));
if (typeof C._setSlicedForTest !== 'function' || typeof C.readJsonlTailSliced !== 'function') { ok(false, 'premise: this tree has the histories\' sliced road (row B-422c unit 2) — it has not'); report(); process.exit(1); }
const pool = C.transcriptPool();
pool.close();   // THE POOL CLOSED FOR GOOD: every call refused
let probe0 = null; try { await pool.call('gapInfo', { fp: claudeFp(sids[0]) }); } catch (e) { probe0 = e; }
ok(!!probe0 && probe0.status === 503, `premise: the real transcript pool refuses every call (${probe0 && probe0.message})`);
const said = [];
const warnWas = console.warn;
console.warn = (...a) => { said.push(a.join(' ')); warnWas(...a); };

/** one road: its answer, the transcript's sync reads and async opens on the main thread, the longest loop turn */
async function road(name, fn) {
  const r = { name, reads: [], longest: 0 };
  let spin = true, last = performance.now();
  const tick = () => { const t = performance.now(); if (t - last > r.longest) r.longest = t - last; last = t; if (spin) setImmediate(tick); };
  setImmediate(tick);
  counting = r;
  try { r.out = await fn(); } catch (e) { r.err = { code: e && e.code, message: String((e && e.message) || e).slice(0, 160) }; }
  finally { counting = null; spin = false; }
  await new Promise((res) => setImmediate(res));
  r.longest = Math.round(r.longest);
  console.log(`  · ${name}: ${r.reads.filter((x) => !/^promises\./.test(x)).length} sync call(s), ${r.reads.filter((x) => /^promises\.open /.test(x)).length} async open(s) of the transcript; the longest turn ${r.longest} ms${r.err ? `; threw ${r.err.code || ''} «${r.err.message}»` : ''}`);
  return r;
}
const content = (r) => r.reads.filter((x) => /^(readSync|readFileSync) /.test(x));
const opens = (r) => r.reads.filter((x) => /^promises\.open /.test(x));
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const TW = require(path.join(REPO, 'src/transcript-worker.js'));
const up = () => ({ calls: [], call(op, payload) { this.calls.push(op); return Promise.resolve(TW.runOp(op, payload)).then((x) => x.result); } });   // a pool that answers (in place: the legs' control)
const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false; return true; };

C._setSlicedForTest({ storageRetryMs: 0, afterMs: 300 });
console.log('① the Claude history, the pool closed for good');
{
  const sid = sids[0], fp = claudeFp(sid);
  const R0 = await road('① the first warm after the refusal', () => SS.warmSessionJsonlAsync(sid, cwd));
  ok(R0.out === false && content(R0).length === 0 && opens(R0).length === 0, `${R0.name}: «not loaded yet» — the refusal has not stood the stated time: nothing read, here or anywhere (${opens(R0).length} opens)`, { out: R0.out, reads: R0.reads.slice(0, 4) });
  await sleep(400);
  const R1 = await road('① the warm past the stated time', () => SS.warmSessionJsonlAsync(sid, cwd));
  const kept = SS.parseSessionJsonl(sid, cwd);
  ok(R1.out === true && content(R1).length === 0 && opens(R1).length >= 1 && R1.longest < LAW_MS && Array.isArray(kept) && !kept.notLoaded && kept.length > 300000,
    `${R1.name}: LOADED on the main process — ${kept.length} records, every file call async (${opens(R1).length} open, ${content(R1).length} sync reads), the longest turn ${R1.longest} ms < ${LAW_MS} ms (the law)`, { out: R1.out, longest: R1.longest, n: kept.length, notLoaded: kept.notLoaded });
  const t0 = performance.now();
  const sync = C.readJsonlTail(fp, null, { dropSubagent: true, warnLarge: false });
  const syncMs = Math.round(performance.now() - t0);
  const viaSlices = await C.readJsonlTailSliced(fp, { dropSubagent: true });
  const a = sync.entry, b = viaSlices.entry;
  const fields = ['mtimeMs', 'size', 'ino', 'dev', 'spanStart', 'spanEnd', 'partial', 'headProbe', 'tailProbe', 'incr'];
  ok(fields.every((k) => a[k] === b[k]) && a.starts.length === b.starts.length && a.starts.every((v, i) => v === b.starts[i]) && same(a.messages, b.messages),
    `① its entry is the worker's, field for field (readJsonlTail's full read: ${a.messages.length} records, the span ${a.spanStart}…${a.spanEnd})`, { diff: fields.filter((k) => a[k] !== b[k]) });
  console.log(`  · ① the whole-file parse on the loop (the release's road, readJsonlTail): ONE turn of ${syncMs} ms — the sliced road's longest ${R1.longest} ms (printed: a machine's speed is no guard)`);
  // while the pool refuses the FILE (its record: no answer for it since) — through a warm with no word from the pool («already
  // warm») — the file then GROWN, a parse with NO warm reads nothing on the loop (the copy tagged, the warm asked again) — RED: the
  // parse's sync append read
  await SS.warmSessionJsonlAsync(sid, cwd);   // already warm: no word from the pool
  // grown PAST the warm's inline append (4 MB — a bounded read the warm folds in with the pool up too): the pool's work
  fs.appendFileSync(fp, Array.from({ length: 80000 }, (_, k) => `{"type":"user","uuid":"g${k}","message":{"role":"user","content":"q"}}`).join('\n') + '\n');
  const Rp = await road('① a parse of the grown file, no warm (the pool still refusing)', () => { const l = SS.parseSessionJsonl(sid, cwd); return { n: l.length, notLoaded: l.notLoaded || null }; });
  ok(Rp.out && Rp.out.notLoaded === 'transcript_reader_restarting' && Rp.out.n === kept.length && content(Rp).length === 0, `${Rp.name}: nothing read on the loop (${content(Rp).length} reads) — the copy behind the file answered tagged, the warm asked again`, { out: Rp.out, reads: Rp.reads.slice(0, 4) });
  await SS.warmSessionJsonlAsync(sid, cwd);   // the warm the parse asked for (or joins it): sliced again, the grown file loaded
  const Rq = await road('① a parse after the grown file was read again', () => { const l = SS.parseSessionJsonl(sid, cwd); return { n: l.length, notLoaded: l.notLoaded || null }; });
  const grownN = C.readJsonlTail(fp, null, { dropSubagent: true, warnLarge: false }).entry.messages.length;
  ok(Rq.out && !Rq.out.notLoaded && Rq.out.n === grownN && content(Rq).length === 0, `${Rq.name}: LOADED (${Rq.out && Rq.out.n} records = the grown file's tail), a stat only (${content(Rq).length} reads)`, { out: Rq.out, grownN });
  const Rm = await road('① the reader\'s consumption of it (printed, not judged — the healthy road\'s cost too)', () => { const m = new SS.SessionMessages({ backend: 'claude', claudeSessionId: sid, cwd, buffer: '' }, sid, {}); m._ensureParsed(); return Array.isArray(m._all) ? m._all.length : null; });
  void Rm;
}
SS.jsonlCacheClear();   // the next leg's memory: the 32 MB entry goes
console.log('② the codex history, the pool closed for good');
{
  const sess = { backend: 'codex', backendSessionId: tid, cwd, buffer: '' };
  // the codex rollout's FINDER walk and its head's meta read run with the pool up too (row B-a60e's, the meta cache) — made before
  // the road, so the road's reads are its own (the first heavy run: the finder's head read was the one sync read of the first attach)
  C.findCodexSessionJsonlPath(tid); C.extractCodexThreadMeta(codexFp);
  const R0 = await road('② the first attach after the refusal', async () => { const m = new CS.CodexSessionMessages(sess, tid, {}); const all = await m.rawAsync(); return { n: all.length, notLoaded: m.notLoaded || null }; });
  ok(R0.out && R0.out.notLoaded === 'transcript_reader_restarting' && content(R0).length === 0 && opens(R0).length === 0, `${R0.name}: «not loaded yet», nothing read (${opens(R0).length} opens)`, { out: R0.out });
  await sleep(400);
  const R1 = await road('② the attach past the stated time', async () => { const m = new CS.CodexSessionMessages(sess, tid, {}); const all = await m.rawAsync(); return { n: all.length, notLoaded: m.notLoaded || null }; });
  const t0 = performance.now();
  const sync = C.parseCodexSessionJsonl(tid, { fp: codexFp });
  const syncMs = Math.round(performance.now() - t0);
  ok(R1.out && !R1.out.notLoaded && R1.out.n > 100000 && content(R1).length === 0 && opens(R1).length >= 1 && R1.longest < LAW_MS,
    `${R1.name}: LOADED on the main process — ${R1.out && R1.out.n} records after the merges (the sync parse's ${sync.length}), every file call async, the longest turn ${R1.longest} ms < ${LAW_MS} ms`, { out: R1.out, longest: R1.longest, reads: content(R1).slice(0, 3) });
  const viaSlices = await C.readCodexRolloutSliced(codexFp);
  ok(same(viaSlices, sync), `② its records are parseCodexSessionJsonl's, record for record (${sync.length})`);
  console.log(`  · ② the whole-file parse on the loop (parseCodexSessionJsonl): ONE turn of ${syncMs} ms — the sliced road's longest ${R1.longest} ms (printed)`);
}
console.log('③ the storage\'s refusal, ④ the other roads, ⑤ said once');
{
  const refusing = (shape) => ({ call() { return Promise.reject(Object.assign(new Error('a stand-in refusal'), shape)); } });
  C._setSlicedForTest({ storageRetryMs: 0, afterMs: 0 });
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'path-hung' }));
  const Rh = await road('③ a hung path (the storage\'s refusal)', async () => { await SS.warmSessionJsonlAsync(sids[1], cwd); await sleep(5); return SS.warmSessionJsonlAsync(sids[1], cwd); });
  ok(Rh.out === false && opens(Rh).length === 0 && content(Rh).length === 0 && !C.slicedRoadFor(claudeFp(sids[1])).ok, `${Rh.name}: nothing read on the main process (${opens(Rh).length} opens) — «${C.slicedRoadFor(claudeFp(sids[1])).why}»`, { out: Rh.out, reads: Rh.reads.slice(0, 4) });
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' }));
  const Rc = await road('③ the control: a refusal of another kind', () => SS.warmSessionJsonlAsync(sids[2], cwd));
  ok(Rc.out === true && opens(Rc).length >= 1, `${Rc.name}: read on the main process (${opens(Rc).length} open) — the RED the storage's guard keeps out`, { out: Rc.out });
  // the codex history's storage guard: a hung path ⇒ «not loaded», nothing opened
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'path-hung' }));
  const Rch = await road('③ the codex history on a hung path', async () => { const m = new CS.CodexSessionMessages({ backend: 'codex', backendSessionId: tid2, cwd, buffer: '' }, tid2, {}); await m.rawAsync(); return m.notLoaded || null; });
  ok(Rch.out === 'transcript_reader_restarting' && opens(Rch).length === 0, `${Rch.name}: «not loaded», the sliced road opened nothing (${opens(Rch).length}; the codex finder's own head read — row B-a60e's — is printed above)`, { out: Rch.out });
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' }));
  const roads = [['the gap read', () => C.jsonlGapInfoAsync(claudeFp(sids[0]))], ['the slab read', () => C.readJsonlLineRangeAsync(claudeFp(sids[0]), 1, 50)], ['the turn map', () => C.scanJsonlUserTurnsAsync(claudeFp(sids[0]), 'claude')]];
  for (const [name, fn] of roads) {
    const Rg = await road(`④ ${name} of a file whose refusal stood`, async () => { try { await fn(); return 'answered'; } catch (e) { return e.code; } });
    ok(Rg.out === 'transcript_reader_restarting' && opens(Rg).length === 0 && content(Rg).length === 0, `${Rg.name}: refused by name, nothing opened — it never takes the sliced road`, { out: Rg.out });
  }
  const Rw = await road('④ the codex thread-metas walk', () => CS.collectCodexThreadMetasAsync());
  ok(opens(Rw).length === 0 && content(Rw).length === 0, `${Rw.name}: nothing opened on the main process (its kept listing)`, { out: Rw.out === null ? null : typeof Rw.out });
  SS.jsonlCacheClear();
  C._setTranscriptPoolForTest(pool);
  const again = await SS.warmSessionJsonlAsync(sids[0], cwd);   // a second sliced read of the first file
  const lines = said.filter((l) => /read on the main process in bounded slices/.test(l));
  const perFile = (sid) => lines.filter((l) => l.includes(path.basename(claudeFp(sid)))).length;
  ok(again === true && perFile(sids[0]) === 1 && perFile(sids[2]) === 1 && perFile(sids[1]) === 0, `⑤ said ONCE a file in the journal (the first file read again: ${again}, ${perFile(sids[0])} line; the hung one: ${perFile(sids[1])}): «${(lines[0] || '').slice(0, 160)}»`, lines.slice(0, 3));
  SS.jsonlCacheClear();
}
console.log('⑤b the read note\'s two ends');
{
  const fail = { calls: [], call(op) { this.calls.push(op); return Promise.reject(Object.assign(new Error('a stand-in refusal'), { status: 503, code: 'no-worker' })); } };
  const hungP = { call() { return Promise.reject(Object.assign(new Error('a stand-in refusal'), { status: 503, code: 'path-hung' })); } };
  C._setSlicedForTest({ storageRetryMs: 0, afterMs: 0 });
  // (a) THE STORAGE'S WORD WINS: a read note's file the memory then calls the storage's (another road's hung path) — a parse of
  // the grown file makes NO stat and asks NO warm (RED: its warm's find + stat on the loop, against the hung storage)
  const sa = sids[4], fa = claudeFp(sa);
  C._setTranscriptPoolForTest(fail);
  ok(await SS.warmSessionJsonlAsync(sa, cwd) === true, 'premise: a history read on the main process (its note marked)');
  C._setTranscriptPoolForTest(hungP); try { await C.jsonlGapInfoAsync(fa); } catch { }   // another road: a hung path
  fs.appendFileSync(fa, '{"type":"user","uuid":"later","message":{"role":"user","content":"q"}}\n');
  C._setTranscriptPoolForTest(fail); fail.calls.length = 0;
  // a WARM first (the attach, a page — the hot roads warm before they parse): the pool alone, no find, no stat
  const Rw1 = await road('⑤b(a) a warm after the memory called the file the storage\'s', () => SS.warmSessionJsonlAsync(sa, cwd));
  const asks = () => fail.calls.filter((o) => o === 'boundedParsedPage').length;   // a warm's ask of the pool: its pager's first page (B-cd4b unit 2)
  ok(Rw1.reads.length === 0 && asks() === 1 && !fail.calls.includes('jsonlTail') && Rw1.out === false, `${Rw1.name}: no call of any kind on the transcript (${Rw1.reads.length}) — the pool alone asked (${asks()}), no one-shot after the storage's refusal`, { reads: Rw1.reads.slice(0, 4), calls: fail.calls });
  fail.calls.length = 0;
  const Ra = await road('⑤b(a) a parse of the grown file then', () => { const l = SS.parseSessionJsonl(sa, cwd); return { n: l.length, notLoaded: l.notLoaded || null }; });
  await new Promise((res) => setImmediate(res));
  ok(Ra.reads.length === 0 && fail.calls.filter((o) => o === 'boundedParsedPage' || o === 'jsonlTail').length === 0, `${Ra.name}: no call of any kind on the transcript (${Ra.reads.length}), no warm asked (${fail.calls.length} pool calls) — the copy last read answered (${Ra.out && Ra.out.n} records)`, { reads: Ra.reads.slice(0, 4), calls: fail.calls, out: Ra.out });
  // (b) THE POOL ANSWERING AGAIN: a warm that reaches it, then the file grown — the parse answers the grown file WHOLE (its re-warm
  // folds the append in, one stat shows the copy is the file): never a stale «not loaded» on a healthy hub
  const sb = sids[5], fb = claudeFp(sb);
  C._setTranscriptPoolForTest(fail);
  ok(await SS.warmSessionJsonlAsync(sb, cwd) === true, 'premise: a second history read on the main process');
  C._setTranscriptPoolForTest(up());
  await SS.warmSessionJsonlAsync(sb, cwd);   // already warm — its task scan answered: the file forgiven
  const n0 = SS.parseSessionJsonl(sb, cwd).length;
  fs.appendFileSync(fb, '{"type":"user","uuid":"after","message":{"role":"user","content":"q"}}\n');
  const nb = SS.parseSessionJsonl(sb, cwd);
  ok(!nb.notLoaded && nb.length === n0 + 1, `⑤b(b) the pool answering again: the grown file's parse answers it whole (${nb.length} records, untagged)`, { n0, n: nb.length, notLoaded: nb.notLoaded });
}
console.log('⑤c the double fault: the pool closed for good AND the file the storage\'s');
{
  // r1243 item 3: the pool refusing every call cannot retry a storage file — the DUE retry is the main process's own sliced read
  // (RED: it asked the pool, which never answers — the conversation «not loaded» until a restart)
  C._setSlicedForTest({ storageRetryMs: 0, afterMs: 0 });
  const sc = sids[6];
  C._setTranscriptPoolForTest({ call() { return Promise.reject(Object.assign(new Error('a stand-in refusal'), { status: 503, code: 'path-hung' })); } });
  await SS.warmSessionJsonlAsync(sc, cwd);   // the storage's
  C._setTranscriptPoolForTest(pool);   // the real pool, closed for good: poolRefusing
  ok(C.fileStorageHung(claudeFp(sc)) && C.poolRefusing(), 'premise: the file the storage\'s, the pool refusing every call');
  const Rd2 = await road('⑤c the storage\'s due retry with the pool closed', () => SS.warmSessionJsonlAsync(sc, cwd));
  const got = SS.parseSessionJsonl(sc, cwd);
  ok(Rd2.out === true && opens(Rd2).length >= 1 && content(Rd2).length === 0 && !got.notLoaded && got.length > 0 && !C.fileStorageHung(claudeFp(sc)), `${Rd2.name}: read on the main process in slices (${opens(Rd2).length} open, ${content(Rd2).length} sync reads) — loaded (${got.length} records), the storage mark ended by its answer`, { out: Rd2.out, n: got.length, notLoaded: got.notLoaded });
}
console.log('⑥ a deadline on the codex merged read');
{
  C._setSlicedForTest({ storageRetryMs: 0, afterMs: 0 });
  const mixed = { calls: [], call(op) { this.calls.push(op); return Promise.reject(Object.assign(new Error(op === 'codexHistoryMergedPage' ? 'Storage not responding (operation timed out).' : 'no worker'), op === 'codexHistoryMergedPage' ? { status: 503, safeFsTimeout: true, deadline: true } : { status: 503, code: 'no-worker' })); } };
  C._setTranscriptPoolForTest(mixed);
  const Rmd = await road('⑥ the codex history after its merged read ran out its deadline', async () => { const m = new CS.CodexSessionMessages({ backend: 'codex', backendSessionId: tid3, cwd, buffer: '' }, tid3, {}); await m.rawAsync(); return m.notLoaded || null; });
  ok(mixed.calls.includes('codexHistoryMergedPage') && !mixed.calls.includes('boundedParsed') && Rmd.out === 'transcript_reader_restarting' && opens(Rmd).length === 0 && /storage hung/.test(C.slicedRoadFor(codexFp3).why), `${Rmd.name}: every file it named is the storage's — the per-file «no worker» after it never takes the sliced road (it opened nothing) (${opens(Rmd).length} opens; «${C.slicedRoadFor(codexFp3).why}»)`, { out: Rmd.out, calls: mixed.calls.slice(0, 4) });
}
// NEVER STUCK: a rollout once the storage's is asked of the POOL again (off the loop, once a gap) — the pool answering, it is read
// (RED: no pool call ever — the conversation unreadable until a restart)
{
  C._setTranscriptPoolForTest(up());
  const Rn = await road('⑥ the same codex history once the pool answers again', async () => { const m = new CS.CodexSessionMessages({ backend: 'codex', backendSessionId: tid3, cwd, buffer: '' }, tid3, {}); const all = await m.rawAsync(); return { n: all.length, notLoaded: m.notLoaded || null }; });
  ok(Rn.out && !Rn.out.notLoaded && Rn.out.n >= 1 && !C.fileStorageHung(codexFp3), `${Rn.name}: asked of the pool again and READ (${Rn.out && Rn.out.n} records) — the storage mark forgiven by its answer`, { out: Rn.out });
}
console.log('⑦ the record\'s bounds');
{
  const stub = (code) => ({ call() { return Promise.reject(Object.assign(new Error('a stand-in refusal'), { status: 503, code })); } });
  const ask = async (fp) => { try { await C.readJsonlTailAsync(fp, { dropSubagent: true }); } catch { } };   // a HISTORY read refused: it notes the file
  C._setSlicedForTest({ storageRetryMs: 0, afterMs: 60, standGapMs: 40 });
  C._setTranscriptPoolForTest(stub('no-worker'));
  const fpS = path.join(HOME, 'stand.jsonl');
  await ask(fpS); await sleep(90); await ask(fpS);
  ok(!C.slicedRoadFor(fpS).ok && /refused for 0 s/.test(C.slicedRoadFor(fpS).why), `⑦ a refusal STANDS only while asked again within the stated gap: refused, 90 ms of silence, refused again ⇒ it starts over («${C.slicedRoadFor(fpS).why}»)`);
  C._setSlicedForTest({ storageRetryMs: 0, afterMs: 0 });
  const fpH = path.join(HOME, 'hung-first.jsonl');
  C._setTranscriptPoolForTest(stub('path-hung')); await ask(fpH);
  C._setTranscriptPoolForTest(stub('no-worker'));
  for (let i = 0; i < 4200; i++) await ask(path.join(HOME, `many-${i}.jsonl`));
  ok(/storage hung/.test(C.slicedRoadFor(fpH).why) && C.slicedState().files <= 4096 + 1, `⑦ the storage's record outlives the bound (4200 records after it: ${C.slicedState().files} kept, it among them — «${C.slicedRoadFor(fpH).why}»)`, C.slicedState());
}
console.log('⑧ output identity on every small shape');
{
  C._setSlicedForTest({ storageRetryMs: 0, afterMs: 0 });
  C._setTranscriptPoolForTest({ call() { return Promise.reject(Object.assign(new Error('a stand-in refusal'), { status: 503, code: 'no-worker' })); } });
  const dir = path.join(HOME, 'shapes');
  fs.mkdirSync(dir, { recursive: true });
  const r = (k) => `{"type":"user","uuid":"s${k}","message":{"role":"user","content":"x${k} é"}}`;
  const SHAPES = {
    'a few lines': [r(1), r(2), r(3)].join('\n') + '\n',
    'no newline at all': r(1),
    'a trailing partial line': [r(1), r(2)].join('\n') + '\n' + r(3).slice(0, 20),
    'a trailing whole line without its newline': [r(1), r(2), r(3)].join('\n'),
    'CRLF': [r(1), r(2)].join('\r\n') + '\r\n',
    'a BOM': '\uFEFF' + [r(1), r(2)].join('\n') + '\n',
    'invalid lines': [r(1), '{broken', '', '   ', r(2), 'null', '[1,2]'].join('\n') + '\n',
    'a side-chain record': [r(1), '{"type":"assistant","isSidechain":true,"uuid":"sc"}', '{"type":"user","parent_tool_use_id":"t1","uuid":"pt"}', r(2)].join('\n') + '\n',
    'an empty file': '',
    'long lines (300 KB each: a step ends at 1 MB)': Array.from({ length: 12 }, (_, k) => `{"type":"user","uuid":"L${k}","message":{"role":"user","content":"${'z'.repeat(300 * 1024)}"}}`).join('\n') + '\n',
  };
  let i = 0;
  for (const [name, text] of Object.entries(SHAPES)) {
    const fp = path.join(dir, `shape-${i++}.jsonl`);
    fs.writeFileSync(fp, text);
    try { await C.readJsonlTailAsync(fp, { dropSubagent: true }); } catch { }   // its refusal stands (the stated time 0)
    const want = C.readJsonlTail(fp, null, { dropSubagent: true, warnLarge: false }).entry, got = (await C.readJsonlTailSliced(fp, { dropSubagent: true })).entry;
    const fields = ['mtimeMs', 'size', 'ino', 'dev', 'spanStart', 'spanEnd', 'partial', 'headProbe', 'tailProbe', 'incr'];
    const wantC = C.parseCodexSessionJsonl('shape', { fp }), gotC = await C.readCodexRolloutSliced(fp);
    ok(fields.every((k) => want[k] === got[k]) && JSON.stringify(want.starts) === JSON.stringify(got.starts) && same(want.messages, got.messages) && same(wantC, gotC),
      `⑧ ${name}: the sliced entry is readJsonlTail's (${want.messages.length} records) and the sliced records are parseCodexSessionJsonl's (${wantC.length})`, { diff: fields.filter((k) => want[k] !== got[k]), n: [want.messages.length, got.messages.length, wantC.length, gotC.length] });
  }
}
console.log('⑨ the read\'s own deadline (a FIFO whose open never answers)');
{
  const sid = sids[3], fifo = claudeFp(sid);
  fs.rmSync(fifo, { force: true });
  let made = true; try { execFileSync('mkfifo', [fifo]); } catch (e) { made = false; console.log(`  (mkfifo failed: ${e.message})`); }
  ok(made, 'premise: a FIFO placed as the transcript (mkfifo)');
  if (made) {
    C._setSlicedForTest({ storageRetryMs: 0, afterMs: 0, deadlineMs: 300 });
    C._setTranscriptPoolForTest({ call() { return Promise.reject(Object.assign(new Error('a stand-in refusal'), { status: 503, code: 'no-worker' })); } });
    try { await C.readJsonlTailAsync(claudeFp(sids[2]), { dropSubagent: true }); } catch { }   // another file whose refusal stands (⑦'s records pushed the old one out)
    const Rd = await road('⑨ the warm of a file that never answers', () => SS.warmSessionJsonlAsync(sid, cwd));
    const st = C.slicedState(), other = C.slicedRoadFor(claudeFp(sids[2]));
    // the FIFO's road: its own read is parked in it (r1461's read — said first, never a second read into it) and the file is the
    // storage's (its mark stands beneath it)
    ok(Rd.out === false && Rd.longest < LAW_MS && st.parked === 1 && !C.slicedRoadFor(fifo).ok && /its own read on the main process is still parked/.test(C.slicedRoadFor(fifo).why) && C.fileStorageHung(fifo) && !other.ok && /parked/.test(other.why),
      `${Rd.name}: its read ran out its deadline — «not loaded», the file is the STORAGE's for good, the parked read holds the one place (another file: «${other.why}»)`, { out: Rd.out, st, why: C.slicedRoadFor(fifo).why });
    const w = fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);   // the file answers at last: the parked open completes
    fs.closeSync(w);
    for (let i = 0; i < 100 && C.slicedState().parked; i++) await sleep(20);
    ok(C.slicedState().parked === 0 && !C.fileStorageHung(fifo) && C.slicedRoadFor(fifo).ok, `⑨ the parked read answered at last ⇒ its place is free (parked ${C.slicedState().parked}) and the file ANSWERED: its own-deadline mark ends, the road opens again (r1243 item 3 — it was stuck until a restart)`, { st: C.slicedState(), why: C.slicedRoadFor(fifo).why });
  }
  C._setTranscriptPoolForTest(pool);
  C._setSlicedForTest({});
}
console.warn = warnWas;
report();
