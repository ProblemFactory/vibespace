#!/usr/bin/env node
// B-f3f9 (card-door-in-chat's storm measure, 2026-11-16; parked by the coordinator, taken 2026-11-19): THE CODEX ATTACH'S MERGE OFF THE
// MAIN THREAD. With the parse in the transcript worker (resume-all-paced L2/L3), a codex conversation's records still crossed to the
// main thread and every merge ran there, so the hub's peak memory before a collection grew with its heap limit (+0.5 GB at the
// default, +2.6 GB at 8192 MB). THE CURE: the whole read — the fork ancestry's files and the thread's own, read, parsed, cut, tagged
// and merged, then the live buffer merged — in the worker's history lane; only the FINAL records cross, in pages, each re-tagged with
// its file's thread on the main side. Stand-ins only: small codex rollouts built at run time in this run's scratch HOME (a native
// parent cut at its fork ordinal, a wrapper-chain parent, the thread's own) and a live buffer; the hub's own functions and its real
// transcript pool (worker threads). No real transcript, no real CLI, no billed turn. The memory proof is the storm rig's (PROVE).
//   ① THE SAME RECORDS: rawAsync over the worker's merge = the sync road's raw() = the old async road — the records, their order and
//      every record's thread tag (a structured clone drops the non-enumerable tag: re-tagged from the page's `tids`/`tix`)
//   ② ZERO MERGES ON THE MAIN THREAD over rawAsync; the sync road counts its merges on the main thread (the counter counts).
//      RED: a copy of the store whose rawAsync never takes the worker's road merges on the main thread again
//   ③ IN PAGES: the final records cross a page at a time, the snapshot dropped at the last page; a gone snapshot is asked again
//   ④ THE FALLBACKS, SAID: a file not on disk ⇒ the old road (the thread/read copy); the worker's heap bound ⇒ the old road, its
//      reason logged — the records the same either way
//   ⑤ THE WIRING: the op runs in the history lane; rawAsync asks the worker's merge before the old steps
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const Module = require('node:module');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
const HOME = scratch('codex-merge-worker');
fs.mkdirSync(HOME, { recursive: true });
process.env.HOME = HOME;   // BEFORE the codex modules load: their sessions root is the scratch HOME's ~/.codex/sessions

// ── the stand-ins: P (a native parent, its records numbered by `ordinal`), W (a wrapper-chain parent), C (the thread, forked from P
//    below ordinal K) — each ~1 MB of turns; and C's live buffer (one record C already has, two new) ──
const P = '019a6e00-0000-7000-8000-00000000f3f1', W = '019a6e00-0000-7000-8000-00000000f3f2', C = '019a6e00-0000-7000-8000-00000000f3f3';
const K = 400;
const dir = path.join(HOME, '.codex', 'sessions', '2026', '11', '19');
fs.mkdirSync(dir, { recursive: true });
const T0 = Date.UTC(2026, 10, 19);
const ts = (i) => new Date(T0 + i * 1000).toISOString();
function rollout(id, { meta = {}, from = 0, turns = 120, ordinals = false, word = id.slice(-4) } = {}) {
  const lines = [JSON.stringify({ timestamp: ts(from), type: 'session_meta', payload: { id, timestamp: ts(from), cwd: '/srv/stand-in', originator: 'codex_cli_rs', cli_version: '0.153.0', ...meta } })];
  let ord = 0;
  const put = (o) => { lines.push(JSON.stringify(ordinals ? { ...o, ordinal: ord++ } : o)); };
  for (let i = from + 1; i <= from + turns; i++) {
    put({ timestamp: ts(i), type: 'turn_context', payload: { turn_id: `${word}-t${i}`, cwd: '/srv/stand-in', approval_policy: 'never', model: 'gpt-5-codex', effort: 'high', summary: 'auto' } });
    put({ timestamp: ts(i), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `${word} step ${i}: run the checks` }] } });
    put({ timestamp: ts(i), type: 'event_msg', payload: { type: 'user_message', message: `${word} step ${i}: run the checks`, kind: 'plain' } });
    for (let k = 0; k < 3; k++) {
      put({ timestamp: ts(i), type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: JSON.stringify({ command: ['bash', '-lc', `npm test -- ${i}.${k}`] }), call_id: `${word}_${i}_${k}` } });
      put({ timestamp: ts(i), type: 'response_item', payload: { type: 'function_call_output', call_id: `${word}_${i}_${k}`, output: JSON.stringify({ output: `ok ${i}.${k} `.repeat(60), metadata: { exit_code: 0 } }) } });
    }
    put({ timestamp: ts(i), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `${word} step ${i} done.` }] } });
  }
  const fp = path.join(dir, `rollout-2026-11-19T10-00-00-${id}.jsonl`);
  fs.writeFileSync(fp, lines.join('\n') + '\n');
  return { fp, lines };
}
const rp = rollout(P, { ordinals: true, turns: 160 });
const rw = rollout(W, { from: 1000, turns: 80 });
const rc = rollout(C, { from: 2000, turns: 120, meta: { forked_from_id: P, forked_from_ordinal_exclusive: K } });
const liveBuffer = [rc.lines[rc.lines.length - 1],
  JSON.stringify({ timestamp: ts(3000), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'live: one more step' }] } }),
  JSON.stringify({ timestamp: ts(3001), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'live: done' }] } })].join('\n') + '\n';
console.log(`  [rig] three stand-in rollouts (${[rp, rw, rc].map((r) => Math.round(fs.statSync(r.fp).size / 1024) + ' KB').join(', ')}) + a live buffer, in the scratch HOME`);

const codex = require(path.join(REPO, 'src/adapters/codex.js'));
const S = require(path.join(REPO, 'src/codex-session-store.js'));
const buffersDir = path.join(HOME, 'buffers'); fs.mkdirSync(buffersDir, { recursive: true });
const sess = (n, extra = {}) => ({ backend: 'codex', mode: 'chat', backendSessionId: C, forkedFrom: [W], cwd: '/srv/stand-in', buffer: liveBuffer, name: 'stand-in ' + n, ...extra });
const tagsOf = (recs) => recs.map((r) => S.recordThreadOf(r) || '');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(tagsOf(a)) === JSON.stringify(tagsOf(b));
/** a copy of the store with ONE anchored edit (scratch.mjs: a moved line fails BY NAME), compiled where the file lives */
function storeCopy(anchor, to, name) {
  const file = path.join(REPO, 'src/codex-session-store.js');
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(anchored(read('src/codex-session-store.js'), anchor, to, name), file);
  return m.exports;
}

console.log('— ① the same records: the worker\'s merge, the sync road, the old async road');
const syncRecs = new S.CodexSessionMessages(sess('sync'), 'w-sync', { buffersDir }).raw();
const ancestry = S.resolveCodexForkAncestry(C, [W]);
ok(JSON.stringify(ancestry) === JSON.stringify([{ id: P, untilOrdinal: K }, { id: W, untilOrdinal: null }]), 'the stand-in\'s ancestry: the native parent cut at its fork ordinal, then the wrapper-chain parent', ancestry);
const m0 = S.mergeCounts(), st0 = codex.mergedReadStats();
const asyncRecs = await new S.CodexSessionMessages(sess('async'), 'w-async', { buffersDir }).rawAsync();
const m1 = S.mergeCounts(), st1 = codex.mergedReadStats();
const tagged = tagsOf(asyncRecs);
ok(Array.isArray(asyncRecs) && asyncRecs.length > 1000 && same(asyncRecs, syncRecs), `rawAsync over the worker's merge = the sync road's raw(): ${asyncRecs.length} records, their order and every thread tag`, { a: asyncRecs.length, s: syncRecs.length });
ok(tagged.includes(P) && tagged.includes(W) && tagged.includes(C) && tagged.includes('') && !asyncRecs.some((r) => Number.isInteger(r.ordinal) && r.ordinal >= K && S.recordThreadOf(r) === P),
  'every file\'s records carry their thread across the worker line (P, W, C; the live buffer\'s none) and P is cut below its fork ordinal');
ok(st1.reads === st0.reads + 1 && st1.failed === st0.failed && st1.pages >= 1, 'the worker\'s merged road was taken (one read, no give-up)', { st0, st1 });

console.log('— ② zero merges on the main thread over rawAsync');
ok(m1.main === m0.main, `rawAsync ran NO merge on the main thread (main ${m0.main} → ${m1.main})`);
const s0 = S.mergeCounts();
new S.CodexSessionMessages(sess('sync2'), 'w-sync2', { buffersDir }).raw();
const s1 = S.mergeCounts();
ok(s1.main - s0.main === 4, `the counter counts: the sync road's _ensureParsed merged four times on the main thread (P, W, C, the live buffer: ${s1.main - s0.main})`);
{
  const SB = storeCopy('      const { files, fps } = codexHistoryFiles(threadId, ancestry);\n', '      const { fps } = codexHistoryFiles(threadId, ancestry); const files = null;\n', 'f3f9-no-worker-merge');
  const b0 = SB.mergeCounts();
  const baseRecs = await new SB.CodexSessionMessages(sess('base'), 'w-base', { buffersDir }).rawAsync();
  const b1 = SB.mergeCounts();
  ok(b1.main - b0.main === 4 && same(baseRecs, syncRecs), `CONTROL (the base's road — no worker merge): the same records, merged FOUR times on the main thread (${b1.main - b0.main}) — the worker's road is what takes them off`);
}

console.log('— ③ in pages');
{
  const files = [{ fp: rp.fp, threadId: P, untilOrdinal: K }, { fp: rw.fp, threadId: W, untilOrdinal: null }, { fp: rc.fp, threadId: C, untilOrdinal: null }];
  const p0 = codex.mergedReadStats();
  const got = await codex.codexHistoryMergedPagedAsync({ files, liveBuffer }, { page: 500 });
  const p1 = codex.mergedReadStats();
  ok(!!got && got.records.length === syncRecs.length && JSON.stringify(got.records) === JSON.stringify(syncRecs) && JSON.stringify(got.threads) === JSON.stringify(tagsOf(syncRecs)),
    'pages of 500: the same final records and, per record, its thread');
  ok(p1.pages - p0.pages === Math.ceil(syncRecs.length / 500) && p1.reads === p0.reads + 1, `one read in ${p1.pages - p0.pages} pages (${syncRecs.length} records / 500)`);
  // the protocol by hand: the history, a page before the live merge, the live merge + pages, the snapshot gone after its last page
  const pool = codex.transcriptPool();
  const h = await pool.call('codexHistoryMergedPage', { files });
  const early = await pool.call('codexHistoryMergedPage', { token: h.token, start: 0, count: 10 });
  const all = await pool.call('codexHistoryMergedPage', { token: h.token, start: 0, count: 1e6, liveBuffer });
  const after = await pool.call('codexHistoryMergedPage', { token: h.token, start: 0, count: 10, liveBuffer });
  ok(!!h && typeof h.token === 'string' && h.historyCount === syncRecs.length - 2 && early.gone === true && all.total === syncRecs.length && all.next === all.total && after.gone === true,
    'by hand: the history call answers its count (the live buffer\'s two new records not yet in), a page asked BEFORE the live merge answers «gone» (never half a read), the live merge + one page answers all, and the snapshot is DROPPED after its last page', { hc: h && h.historyCount, early, total: all.total, after });
  // M5: a page is bounded by BYTES too (≤ PAGE_BYTES = 4 MB of its records' JSON) — a run of big tool outputs never crosses as one clone
  const big = rollout('019a6e00-0000-7000-8000-00000000f3f4', { from: 4000, turns: 1, word: 'bigs' });
  const blines = [big.lines[0]];
  for (let k = 0; k < 330; k++) blines.push(JSON.stringify({ timestamp: ts(4100 + k), type: 'response_item', payload: { type: 'function_call_output', call_id: `big_${k}`, output: 'x'.repeat(32 * 1024) } }));
  fs.writeFileSync(big.fp, blines.join('\n') + '\n');
  const b0 = codex.mergedReadStats();
  const gotBig = await codex.codexHistoryMergedPagedAsync({ files: [{ fp: big.fp, threadId: 'big', untilOrdinal: null }], liveBuffer: '' }, { page: 1e6 });
  const b1 = codex.mergedReadStats();
  ok(!!gotBig && gotBig.records.length === 331 && b1.pages - b0.pages >= 3, `a ~10 MB history with no count bound crosses in ${b1.pages - b0.pages} pages of ≤ 4 MB (never one clone)`);
}

console.log('— ⑥ the live buffer is read when the history is merged, never before (the old road read it after its history too)');
{
  // the session's buffer answers only once the worker's HISTORY call has come back — a road that read it at the start reads ''
  const pool = codex.transcriptPool(), realCall = pool.call;
  let historyBack = false;
  pool.call = function (op, payload, ...rest) { const r = realCall.call(this, op, payload, ...rest); if (op === 'codexHistoryMergedPage' && payload && !payload.token) r.then(() => { historyBack = true; }, () => {}); return r; };
  const lateSess = () => { const o = sess('late'); delete o.buffer; Object.defineProperty(o, 'buffer', { get: () => (historyBack ? liveBuffer : ''), enumerable: true }); return o; };
  try {
    historyBack = false;
    const late = await new S.CodexSessionMessages(lateSess(), 'w-late', { buffersDir }).rawAsync();
    ok(same(late, syncRecs), 'a buffer that fills while the history is read: its records are in (the buffer read at the live merge)');
    historyBack = false;
    const SE = storeCopy("liveBuffer: () => this._session?.buffer || ''", "liveBuffer: this._session?.buffer || ''", 'f3f9-buffer-read-early');
    const early = await new SE.CodexSessionMessages(lateSess(), 'w-early', { buffersDir }).rawAsync();
    ok(early.length === syncRecs.length - 2 && !same(early, syncRecs), `CONTROL (the buffer read when the read STARTS): the two records the buffer gained meanwhile are missing (${syncRecs.length - early.length})`);
  } finally { pool.call = realCall; }
}

console.log('— ⑦ every file of a long chain: no cap');
{
  const chain = [];
  for (let k = 0; k < 34; k++) { const id = `019a6e00-0000-7000-8000-0000000c${String(k).padStart(4, '0')}`; rollout(id, { from: 5000 + k * 10, turns: 1, word: 'ch' + k }); chain.push(id); }
  const longSess = (n) => sess(n, { forkedFrom: [W, ...chain] });
  const longSync = new S.CodexSessionMessages(longSess('long-sync'), 'w-long-sync', { buffersDir }).raw();
  const r0 = codex.mergedReadStats();
  const longAsync = await new S.CodexSessionMessages(longSess('long'), 'w-long', { buffersDir }).rawAsync();
  const r1 = codex.mergedReadStats();
  ok(r1.reads === r0.reads + 1 && same(longAsync, longSync) && tagsOf(longAsync).includes(C) && chain.every((id) => tagsOf(longAsync).includes(id)), `a chain of ${chain.length + 2} files read whole in the worker (the thread's own file last, never cut off)`);
}

console.log('— ④ the fallbacks, said');
{
  const logs = []; const logWas = console.log, warnWas = console.warn; console.log = (...a) => { logs.push(a.join(' ')); }; console.warn = (...a) => { logs.push(a.join(' ')); };   // the give-up is a warn
  let lost = null;
  try {
    const f0 = codex.mergedReadStats();
    lost = await new S.CodexSessionMessages(sess('lost', { forkedFrom: [W, '019a6e00-0000-7000-8000-00000000dead'] }), 'w-lost', { buffersDir }).rawAsync();
    const f1 = codex.mergedReadStats();
    console.log = logWas;
    const lostSync = new S.CodexSessionMessages(sess('lost-sync', { forkedFrom: [W, '019a6e00-0000-7000-8000-00000000dead'] }), 'w-lost-sync', { buffersDir }).raw();
    ok(f1.reads === f0.reads && f1.failed === f0.failed && same(lost, lostSync), 'a file of the ancestry not on disk ⇒ the old road (it reads the thread/read copy), never the worker\'s merge — the records the same');
    console.log = (...a) => { logs.push(a.join(' ')); };
    codex._setHistoryHeapMbForTest(1);
    const h0 = codex.mergedReadStats();
    const bound = await new S.CodexSessionMessages(sess('bound'), 'w-bound', { buffersDir }).rawAsync();
    const h1 = codex.mergedReadStats();
    codex._setHistoryHeapMbForTest(768);
    console.log = logWas;
    ok(h1.failed === h0.failed + 1 && same(bound, syncRecs), 'the worker\'s heap bound refuses the merged read ⇒ the old road reads the same records', { h0, h1 });
    ok(logs.some((l) => /\[codex\] a conversation's merged history read fell back to the paged parse \(\d+\): the history worker's heap bound/.test(l)), 'the give-up is SAID with its reason (the heap bound)', logs.filter((l) => /merged history/.test(l)).slice(0, 2));
  } finally { console.log = logWas; console.warn = warnWas; codex._setHistoryHeapMbForTest(768); }
}

console.log('— ⑤ the wiring');
{
  const store = read('src/codex-session-store.js'), sfs = read('src/safe-fs.js');
  const raw = (store.match(/  rawAsync\(\{ bulk = false, wanted = null \} = \{\}\) \{[\s\S]*?\n  \}\n/) || [''])[0];
  ok(raw.indexOf('codexHistoryMergedPagedAsync(') > 0 && raw.indexOf('codexHistoryMergedPagedAsync(') < raw.indexOf('await parseCodexSessionJsonlAsync(forkId, { fp: fps.get(forkId) })'), 'rawAsync asks the worker\'s merge before the old steps (which stay its fallback, reading the paths it looked up — never a second walk)');
  ok(/codexHistoryMergedPage: 'history'/.test(sfs), 'the op runs in the history lane (one worker: its pages answer from its own snapshot)');
}

report();
