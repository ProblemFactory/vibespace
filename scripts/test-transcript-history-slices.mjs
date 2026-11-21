#!/usr/bin/env node
// test-transcript-history-slices.mjs — FAST (in-process): ROW B-422c UNIT 2 (lane hub-loop-stalls, 主开发 r1006 item 2 — THE
// DEGRADATION ROAD of the TWO HISTORIES). THE LAW: a person can always read a conversation's history, and no step of it holds the
// loop 250 ms. With the REAL transcript pool closed for good, a history whose refusal is NOT the storage's and has stood past the
// stated time is read ON THE MAIN PROCESS in bounded slices (src/adapters/codex.js readJsonlTailSliced / readCodexRolloutSliced):
//   ① the Claude history: the first warm says «not loaded» (the refusal has not stood yet — nothing read); past the stated time the
//     warm loads it, NO synchronous read of the transcript, the longest loop turn UNDER THE LAW; its cache entry = the worker's
//     (readJsonlTail's full read, field for field). RED: the whole-file parse on the loop (readJsonlTail, timed here) — one turn
//     past the law.
//   ② the codex history (CodexSessionMessages.rawAsync): the same — its records = parseCodexSessionJsonl's. RED: that parse, timed.
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
const sids = ['a1111111-2222-4333-8444-555555555555', 'b1111111-2222-4333-8444-555555555555', 'c1111111-2222-4333-8444-555555555555', 'd1111111-2222-4333-8444-555555555555'];
const claudeFp = (sid) => path.join(projDir, sid + '.jsonl');
const BIG = 36 * 1024 * 1024;
function placeClaude(fp, bytes) {
  const out = fs.openSync(fp, 'w');
  try {
    let k = 0, n = 0;
    while (n < bytes) {
      const rows = [];
      for (let i = 0; i < 4096; i++, k++) rows.push(k % 2 ? `{"type":"assistant","uuid":"u${k}","message":{"role":"assistant","content":[{"type":"text","text":"a${k}"}]}}` : `{"type":"user","uuid":"u${k}","message":{"role":"user","content":"q${k}"}}`);
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
      for (let i = 0; i < 4096; i++, k++) rows.push(`{"type":"response_item","payload":{"type":"message","role":"${k % 2 ? 'assistant' : 'user'}","content":[{"type":"${k % 2 ? 'output' : 'input'}_text","text":"m${k}"}]}}`);
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
const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false; return true; };

C._setSlicedForTest({ afterMs: 60 });
console.log('① the Claude history, the pool closed for good');
{
  const sid = sids[0], fp = claudeFp(sid);
  const R0 = await road('① the first warm after the refusal', () => SS.warmSessionJsonlAsync(sid, cwd));
  ok(R0.out === false && content(R0).length === 0 && opens(R0).length === 0, `${R0.name}: «not loaded yet» — the refusal has not stood the stated time: nothing read, here or anywhere (${opens(R0).length} opens)`, { out: R0.out, reads: R0.reads.slice(0, 4) });
  await sleep(90);
  const R1 = await road('① the warm past the stated time', () => SS.warmSessionJsonlAsync(sid, cwd));
  const kept = SS.parseSessionJsonl(sid, cwd);
  ok(R1.out === true && content(R1).length === 0 && opens(R1).length >= 1 && R1.longest < LAW_MS && Array.isArray(kept) && !kept.notLoaded && kept.length > 100000,
    `${R1.name}: LOADED on the main process — ${kept.length} records, every file call async (${opens(R1).length} open, ${content(R1).length} sync reads), the longest turn ${R1.longest} ms < ${LAW_MS} ms (the law)`, { out: R1.out, longest: R1.longest, n: kept.length, notLoaded: kept.notLoaded });
  const t0 = performance.now();
  const sync = C.readJsonlTail(fp, null, { dropSubagent: true, warnLarge: false });
  const syncMs = Math.round(performance.now() - t0);
  const viaSlices = await C.readJsonlTailSliced(fp, { dropSubagent: true });
  const a = sync.entry, b = viaSlices.entry;
  const fields = ['mtimeMs', 'size', 'ino', 'dev', 'spanStart', 'spanEnd', 'partial', 'headProbe', 'tailProbe', 'incr'];
  ok(fields.every((k) => a[k] === b[k]) && a.starts.length === b.starts.length && a.starts.every((v, i) => v === b.starts[i]) && same(a.messages, b.messages),
    `① its entry is the worker's, field for field (readJsonlTail's full read: ${a.messages.length} records, the span ${a.spanStart}…${a.spanEnd})`, { diff: fields.filter((k) => a[k] !== b[k]) });
  ok(syncMs >= LAW_MS, `① RED — the whole-file parse on the loop (the release's road, readJsonlTail): ONE turn of ${syncMs} ms ≥ ${LAW_MS} ms`, { syncMs });
  // the read's note STAYS (the pool still refuses), marked: a parse with NO warm answers the loaded copy — one stat, never a read
  const Rp = await road('① a parse after it, no warm (the pool still refusing)', () => { const l = SS.parseSessionJsonl(sid, cwd); return { n: l.length, notLoaded: l.notLoaded || null }; });
  ok(Rp.out && Rp.out.n === kept.length && !Rp.out.notLoaded && content(Rp).length === 0 && opens(Rp).length === 0, `${Rp.name}: LOADED, untagged — ${content(Rp).length} reads (a stat only)`, { out: Rp.out, reads: Rp.reads.slice(0, 4) });
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
  await sleep(90);
  const R1 = await road('② the attach past the stated time', async () => { const m = new CS.CodexSessionMessages(sess, tid, {}); const all = await m.rawAsync(); return { n: all.length, notLoaded: m.notLoaded || null }; });
  const t0 = performance.now();
  const sync = C.parseCodexSessionJsonl(tid, { fp: codexFp });
  const syncMs = Math.round(performance.now() - t0);
  ok(R1.out && !R1.out.notLoaded && R1.out.n > 100000 && content(R1).length === 0 && opens(R1).length >= 1 && R1.longest < LAW_MS,
    `${R1.name}: LOADED on the main process — ${R1.out && R1.out.n} records after the merges (the sync parse's ${sync.length}), every file call async, the longest turn ${R1.longest} ms < ${LAW_MS} ms`, { out: R1.out, longest: R1.longest, reads: content(R1).slice(0, 3) });
  const viaSlices = await C.readCodexRolloutSliced(codexFp);
  ok(same(viaSlices, sync), `② its records are parseCodexSessionJsonl's, record for record (${sync.length})`);
  ok(syncMs >= LAW_MS, `② RED — the whole-file parse on the loop (parseCodexSessionJsonl): ONE turn of ${syncMs} ms ≥ ${LAW_MS} ms`, { syncMs });
}
console.log('③ the storage\'s refusal, ④ the other roads, ⑤ said once');
{
  const refusing = (shape) => ({ call() { return Promise.reject(Object.assign(new Error('a stand-in refusal'), shape)); } });
  C._setSlicedForTest({ afterMs: 0 });
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'path-hung' }));
  const Rh = await road('③ a hung path (the storage\'s refusal)', async () => { await SS.warmSessionJsonlAsync(sids[1], cwd); await sleep(5); return SS.warmSessionJsonlAsync(sids[1], cwd); });
  ok(Rh.out === false && opens(Rh).length === 0 && content(Rh).length === 0 && !C.slicedRoadFor(claudeFp(sids[1])).ok, `${Rh.name}: nothing read on the main process (${opens(Rh).length} opens) — «${C.slicedRoadFor(claudeFp(sids[1])).why}»`, { out: Rh.out, reads: Rh.reads.slice(0, 4) });
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'no-worker' }));
  const Rc = await road('③ the control: a refusal of another kind', () => SS.warmSessionJsonlAsync(sids[2], cwd));
  ok(Rc.out === true && opens(Rc).length >= 1, `${Rc.name}: read on the main process (${opens(Rc).length} open) — the RED the storage's guard keeps out`, { out: Rc.out });
  // the codex history's storage guard: a hung path ⇒ «not loaded», nothing opened
  C._setTranscriptPoolForTest(refusing({ status: 503, code: 'path-hung' }));
  const Rch = await road('③ the codex history on a hung path', async () => { const m = new CS.CodexSessionMessages({ backend: 'codex', backendSessionId: tid2, cwd, buffer: '' }, tid2, {}); await m.rawAsync(); return m.notLoaded || null; });
  ok(Rch.out === 'transcript_reader_restarting' && opens(Rch).length === 0, `${Rch.name}: «not loaded», nothing opened on the main process (${opens(Rch).length})`, { out: Rch.out });
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
console.log('⑥ a deadline on the codex merged read');
{
  C._setSlicedForTest({ afterMs: 0 });
  const mixed = { calls: [], call(op) { this.calls.push(op); return Promise.reject(Object.assign(new Error(op === 'codexHistoryMergedPage' ? 'Storage not responding (operation timed out).' : 'no worker'), op === 'codexHistoryMergedPage' ? { status: 503, safeFsTimeout: true, deadline: true } : { status: 503, code: 'no-worker' })); } };
  C._setTranscriptPoolForTest(mixed);
  const Rmd = await road('⑥ the codex history after its merged read ran out its deadline', async () => { const m = new CS.CodexSessionMessages({ backend: 'codex', backendSessionId: tid3, cwd, buffer: '' }, tid3, {}); await m.rawAsync(); return m.notLoaded || null; });
  ok(mixed.calls.includes('codexHistoryMergedPage') && Rmd.out === 'transcript_reader_restarting' && opens(Rmd).length === 0 && /storage hung/.test(C.slicedRoadFor(codexFp3).why), `${Rmd.name}: every file it named is the storage's — the per-file «no worker» after it never opens one on the main process (${opens(Rmd).length} opens; «${C.slicedRoadFor(codexFp3).why}»)`, { out: Rmd.out, calls: mixed.calls.slice(0, 4) });
}
console.log('⑦ the record\'s bounds');
{
  const stub = (code) => ({ call() { return Promise.reject(Object.assign(new Error('a stand-in refusal'), { status: 503, code })); } });
  const ask = async (fp) => { try { await C.jsonlGapInfoAsync(fp); } catch { } };
  C._setSlicedForTest({ afterMs: 60, standGapMs: 40 });
  C._setTranscriptPoolForTest(stub('no-worker'));
  const fpS = path.join(HOME, 'stand.jsonl');
  await ask(fpS); await sleep(90); await ask(fpS);
  ok(!C.slicedRoadFor(fpS).ok && /refused for 0 s/.test(C.slicedRoadFor(fpS).why), `⑦ a refusal STANDS only while asked again within the stated gap: refused, 90 ms of silence, refused again ⇒ it starts over («${C.slicedRoadFor(fpS).why}»)`);
  C._setSlicedForTest({ afterMs: 0 });
  const fpH = path.join(HOME, 'hung-first.jsonl');
  C._setTranscriptPoolForTest(stub('path-hung')); await ask(fpH);
  C._setTranscriptPoolForTest(stub('no-worker'));
  for (let i = 0; i < 700; i++) await ask(path.join(HOME, `many-${i}.jsonl`));
  ok(/storage hung/.test(C.slicedRoadFor(fpH).why) && C.slicedState().files <= 512 + 1, `⑦ the storage's record outlives the bound (700 records after it: ${C.slicedState().files} kept, it among them — «${C.slicedRoadFor(fpH).why}»)`, C.slicedState());
}
console.log('⑧ output identity on every small shape');
{
  C._setSlicedForTest({ afterMs: 0 });
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
  };
  let i = 0;
  for (const [name, text] of Object.entries(SHAPES)) {
    const fp = path.join(dir, `shape-${i++}.jsonl`);
    fs.writeFileSync(fp, text);
    try { await C.jsonlGapInfoAsync(fp); } catch { }   // its refusal stands (the stated time 0)
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
    C._setSlicedForTest({ afterMs: 0, deadlineMs: 300 });
    C._setTranscriptPoolForTest({ call() { return Promise.reject(Object.assign(new Error('a stand-in refusal'), { status: 503, code: 'no-worker' })); } });
    try { await C.jsonlGapInfoAsync(claudeFp(sids[2])); } catch { }   // another file whose refusal stands (⑦'s records pushed the old one out)
    const Rd = await road('⑨ the warm of a file that never answers', () => SS.warmSessionJsonlAsync(sid, cwd));
    const st = C.slicedState(), other = C.slicedRoadFor(claudeFp(sids[2]));
    ok(Rd.out === false && Rd.longest < LAW_MS && st.parked === 1 && !C.slicedRoadFor(fifo).ok && /storage hung/.test(C.slicedRoadFor(fifo).why) && !other.ok && /parked/.test(other.why),
      `${Rd.name}: its read ran out its deadline — «not loaded», the file is the STORAGE's for good, the parked read holds the one place (another file: «${other.why}»)`, { out: Rd.out, st, why: C.slicedRoadFor(fifo).why });
    const w = fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);   // the file answers at last: the parked open completes
    fs.closeSync(w);
    for (let i = 0; i < 100 && C.slicedState().parked; i++) await sleep(20);
    ok(C.slicedState().parked === 0 && !C.slicedRoadFor(fifo).ok, `⑨ the parked read answered at last ⇒ its place is free (parked ${C.slicedState().parked}); the file stays the storage's`, C.slicedState());
  }
  C._setTranscriptPoolForTest(pool);
  C._setSlicedForTest({});
}
console.warn = warnWas;
report();
