#!/usr/bin/env node
// test-codex-attach-off-loop.mjs — lane resume-all-paced, L2 (主开发 2026-11-16 18:13Z; the field incident: a bulk resume of ~40
// codex conversations with transcripts of 100–184 MB held the hub's loop 10–139 s). THE LAW: a resume and an attach of a conversation
// with a transcript over 100 MB hold no loop turn past the boot law's 250 ms (docs/kb-design-lessons.md §19).
// THE RIG: a stand-in codex rollout of REAL size (> 100 MB, the shape of a long conversation's event stream — many small records) built
// at run time in this run's scratch HOME — never a real transcript, never a person's; the hub's OWN functions on it; the longest loop
// hold read from a 5 ms timer's lateness. No load, no real CLI, no billed turn.
//   ① RESUME CONTINUITY (ws-create pickKnob → the codex descriptor's lastTurnModel / lastTurnEffort): read off the loop, backward in
//      chunks, one read for both knobs — the same answers as the sync reader (each knob the LAST turn_context that states it)
//   ② ATTACH (ws-handler: the store's records, then rebuildHistory): the store's rawAsync (the parse in the transcript worker, the merge
//      in slices) holds no turn past 250 ms — RED CONTROL: the master's path, the sync raw(), on the same rollout
//   ③ the same records either way (the async and the sync reader), and the same messages after rebuildHistory
//   ④ the wiring: the live attach awaits rawAsync before rebuildHistory; the read-only view's prepare() is it; the hooks are async
//   ⑥ THE CURE ROUND (主开发 23:16Z), P1 — A RE-ATTACH IS AN ATTACH: a re-attach's fresh reader reads off the loop before its chat
//      status — RED CONTROL: asked at once (d7a0c4b36's road), one parse on the loop of the 104 MB rollout, SAID; and the wiring.
//      The rest of L3's legs (the worker's lines, the one-read line, the pages' worker, the acks, a person first, the fallback said,
//      the page bytes) are test-codex-history-line's; the heap bound is test-codex-history-bound's.
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HOME = scratch('codex-loop');
fs.mkdirSync(HOME, { recursive: true });
process.env.HOME = HOME;   // BEFORE the codex modules load: their sessions root is the scratch HOME's ~/.codex/sessions
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string — the arguments are swapped'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 1500) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAW_MS = 250;
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// ── the stand-in: > 100 MB, many small records (turn_context, the user's message and its event twin, reasoning, ten calls a turn
//    with short outputs and their exec events, the answer, a token count); the LAST turn_context states a model and NO effort ──
const ID = '019a6e00-0000-7000-8000-0000000c0de6';
const dir = path.join(HOME, '.codex', 'sessions', '2026', '11', '16');
fs.mkdirSync(dir, { recursive: true });
const FP = path.join(dir, `rollout-2026-11-16T10-00-00-${ID}.jsonl`);
{
  const T0 = Date.UTC(2026, 10, 16);
  const pad = (n, seed) => { let s = ''; while (s.length < n) s += `line ${seed}: build step ok, 0 warnings, checked ${s.length}\n`; return s.slice(0, n); };
  const fd = fs.openSync(FP, 'w');
  let size = 0, chunk = '';
  const put = (o) => { chunk += JSON.stringify(o) + '\n'; if (chunk.length > 1 << 20) { size += fs.writeSync(fd, chunk); chunk = ''; } };
  const ts = (i) => new Date(T0 + i * 1000).toISOString();
  put({ timestamp: ts(0), type: 'session_meta', payload: { id: ID, timestamp: ts(0), cwd: '/srv/stand-in', originator: 'codex_cli_rs', cli_version: '0.153.0' } });
  let i = 0;
  while (size < 104 * 1048576) {
    i++;
    put({ timestamp: ts(i), type: 'turn_context', payload: { turn_id: 't' + i, cwd: '/srv/stand-in', approval_policy: 'never', model: 'gpt-5-codex', effort: 'high', summary: 'auto' } });
    put({ timestamp: ts(i), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `step ${i}: run the checks again` }] } });
    put({ timestamp: ts(i), type: 'event_msg', payload: { type: 'user_message', message: `step ${i}: run the checks again`, kind: 'plain' } });
    put({ timestamp: ts(i), type: 'response_item', payload: { type: 'reasoning', summary: [{ type: 'summary_text', text: `thinking about step ${i}` }], encrypted_content: pad(1200, i) } });
    for (let k = 0; k < 10; k++) {
      put({ timestamp: ts(i), type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: JSON.stringify({ command: ['bash', '-lc', `npm test -- --step ${i}.${k}`] }), call_id: `call_${i}_${k}` } });
      put({ timestamp: ts(i), type: 'response_item', payload: { type: 'function_call_output', call_id: `call_${i}_${k}`, output: JSON.stringify({ output: pad(700, `${i}.${k}`), metadata: { exit_code: 0, duration_seconds: 1.2 } }) } });
      put({ timestamp: ts(i), type: 'event_msg', payload: { type: 'exec_command_end', call_id: `call_${i}_${k}`, stdout: pad(200, k), exit_code: 0 } });
    }
    put({ timestamp: ts(i), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `Step ${i} done.` }] } });
  }
  i++;
  put({ timestamp: ts(i), type: 'turn_context', payload: { turn_id: 't' + i, cwd: '/srv/stand-in', approval_policy: 'never', model: 'gpt-5.1-codex', effort: null, summary: 'auto' } });
  put({ timestamp: ts(i), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'one more step' }] } });
  size += fs.writeSync(fd, chunk); fs.closeSync(fd);
  console.log(`  [rig] stand-in rollout: ${Math.round(size / 1048576)} MB, ${i} turns, in the scratch HOME`);
}

const codex = require(path.join(REPO, 'src/adapters/codex.js'));
const S = require(path.join(REPO, 'src/codex-session-store.js'));
const { rebuildHistory } = require(path.join(REPO, 'src/normalizers.js'));
const desc = require(path.join(REPO, 'src/harnesses/codex.js'));
// the cure round's seams, absent on a tree before it — the suite still runs to its end there (each leg red, never a crash)
const statsOf = () => {   // B-f3f9: a store's read is the worker's MERGED read now (the paged read its fallback) — both roads counted
  const p = codex.pagedReadStats ? codex.pagedReadStats() : { pages: 0, reads: 0, gone: 0, oneShot: 0, failed: 0 };
  const m = codex.mergedReadStats ? codex.mergedReadStats() : { pages: 0, reads: 0, gone: 0, failed: 0 };
  return { pages: p.pages + m.pages, reads: p.reads + m.reads, gone: p.gone + m.gone, oneShot: p.oneShot, failed: p.failed + m.failed };
};
const onLoopOf = () => (codex.codexParsesOnLoop ? codex.codexParsesOnLoop() : { count: 0, recent: [] });
const setBound = (mb, o) => { if (codex._setHistoryHeapMbForTest) codex._setHistoryHeapMbForTest(mb, o); };
const AR = (() => { try { return require(path.join(REPO, 'src/attach-read.js')); } catch { return { readOffLoop: async () => false }; } })();   // before the cure: no door — a re-attach read nothing off the loop, nothing acked
// the loop probe: a 5 ms timer; its worst lateness while a step runs = the longest hold of the loop
let worst = 0, last = performance.now();
const iv = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last - 5); last = n; }, 5);
const during = async (fn) => { await sleep(40); worst = 0; last = performance.now(); const t0 = performance.now(); const r = await fn(); const ms = performance.now() - t0; await sleep(40); return { r, gap: Math.round(worst), ms: Math.round(ms) }; };
v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc');
const heapMB = () => { gc(); return Math.round(process.memoryUsage().heapUsed / 1048576); };

console.log('— ① RESUME CONTINUITY: the last model and effort read off the loop, one read for both');
{
  const a = await during(() => Promise.all([desc.store.lastTurnModel(ID), desc.store.lastTurnEffort(ID)]));
  const b = await during(() => [codex.lastCodexTurnModel(ID), codex.lastCodexTurnEffort(ID)]);
  ok(JSON.stringify(a.r) === JSON.stringify(['gpt-5.1-codex', 'high']) && JSON.stringify(a.r) === JSON.stringify(b.r), 'the descriptor\'s hooks answer the sync reader\'s answers — model from the LAST turn_context, effort from the last that STATES one (the last states none)', { async: a.r, sync: b.r });
  ok(a.gap <= LAW_MS, `…and hold no loop turn past ${LAW_MS} ms (worst ${a.gap} ms over ${a.ms} ms; the sync reader, two 32 MB strings: worst ${b.gap} ms)`);
}

console.log('— ② ATTACH: the store\'s records and rebuildHistory, off the loop');
const buffersDir = path.join(HOME, 'buffers'); fs.mkdirSync(buffersDir, { recursive: true });
const sess = (n) => ({ backend: 'codex', mode: 'chat', backendSessionId: ID, cwd: '/srv/stand-in', buffer: '', name: 'stand-in ' + n });
const A = sess('a'), B = sess('b');
let smA = null, smB = null;
// S8 (主开发 23:16Z — the hosted runner): the hold is judged as the other timing legs are — the MEDIAN of three rounds of the off-loop
// read (its single turns: a page's deserialize, the merge's one sort), then the whole attach once; the red control once (more load
// only makes it larger). THE LEGS PIN THE ROAD THEY NAME: every round counts its pages — a read that fell back to the one-shot road
// (one big clone) is red here, however short its hold
const rounds = [];
for (let k = 0; k < 3; k++) {
  const s0 = statsOf();
  const r = await during(async () => { const sm = new S.CodexSessionMessages(sess('r' + k), 'w-r' + k, { buffersDir }); await sm.rawAsync(); });
  const s1 = statsOf();
  rounds.push({ gap: r.gap, pages: s1.pages - s0.pages, oneShot: s1.oneShot - s0.oneShot, reads: s1.reads - s0.reads });
}
const med = rounds.map((r) => r.gap).sort((x, y) => x - y)[1];
ok(med <= LAW_MS && rounds.every((r) => r.pages >= 5 && r.oneShot === 0 && r.reads === 1), `the off-loop read holds no loop turn past ${LAW_MS} ms — the median of three rounds ${med} ms (${rounds.map((r) => r.gap).join(' / ')}); each round read in PAGES (${rounds.map((r) => r.pages).join(' / ')} pages, no one-shot read)`, rounds);
const sa0 = statsOf();
const a = await during(async () => { smA = new S.CodexSessionMessages(A, 'w-a', { buffersDir }); await smA.rawAsync(); await rebuildHistory(A, 'w-a', smA.raw()); });
const sa1 = statsOf();
ok(a.gap <= LAW_MS && sa1.pages - sa0.pages >= 5 && sa1.oneShot === sa0.oneShot, `the attach (rawAsync — the parse in the transcript worker, the merge in slices — then rebuildHistory) holds no loop turn past ${LAW_MS} ms (worst ${a.gap} ms over ${a.ms} ms), its read in ${sa1.pages - sa0.pages} pages`);
const b = await during(async () => { smB = new S.CodexSessionMessages(B, 'w-b', { buffersDir }); await rebuildHistory(B, 'w-b', smB.raw()); });
ok(b.gap > LAW_MS, `RED CONTROL — the master's path (the sync raw()) on the same rollout holds the loop ${b.gap} ms in ONE turn (> ${LAW_MS} ms)`);

console.log('— ③ THE SAME RECORDS AND MESSAGES either way');
{
  const hash = (recs) => { const h = crypto.createHash('sha1'); for (const r of recs) h.update(JSON.stringify(r)); return h.digest('hex'); };
  const ra = smA.raw(), rb = smB.raw();
  ok(ra.length === rb.length && ra.length > 10000 && hash(ra) === hash(rb), `rawAsync's records = raw()'s (${ra.length} records, the same bytes)`, { a: ra.length, b: rb.length });
  const ma = A._normalizer && A._normalizer.messages, mb = B._normalizer && B._normalizer.messages;
  ok(Array.isArray(ma) && ma.length > 1000 && ma.length === mb.length && hash(ma.map((m) => ({ ...m, id: undefined, ts: undefined }))) === hash(mb.map((m) => ({ ...m, id: undefined, ts: undefined }))), `…and rebuildHistory renders the same ${ma ? ma.length : '?'} messages`);
  const f = smA.raw(); ok(smA.raw() === f && (await smA.rawAsync()) === f, '…read once: raw() and a second rawAsync() answer the records already read (no second parse)');
}

console.log('— ④ THE WIRING');
{
  const ws = read('src/ws-handler.js');
  const i = ws.indexOf('await readOffLoop(sm, { bulk: bulkRead'), j = ws.indexOf('await rebuildHistory(session, data.sessionId, sm.raw()');   // L3: through src/attach-read.js readOffLoop (sm.rawAsync)
  ok(i > 0 && j > i && ws.lastIndexOf('const sm = reSm && session === waitedFor ? reSm : createSessionMessages(session, data.sessionId);', i) > 0 && /await sm\.rawAsync\(\{ bulk, wanted \}\)/.test(read('src/attach-read.js')), 'the live attach (ws-handler) awaits sm.rawAsync() (src/attach-read.js readOffLoop) before rebuildHistory reads sm.raw()');
  const st = new S.CodexSessionMessages(sess('c'), 'w-c', { buffersDir }), tsv = read('src/transcript-service.js');
  ok((tsv.match(/if \(typeof sm\.rawAsync === 'function'\) await sm\.rawAsync\(\);/g) || []).length === 2 && ws.includes("await readOffLoop(sm, { label: `view ${backendSessionId}`, wanted: () => ws.readyState === WS_OPEN });") && /readyState === WS_OPEN \}\);[^\n]*\n\s*if \(ws\.readyState !== WS_OPEN\) break;/.test(ws),
    'the read-only view (ws-handler — the restore opens every stopped conversation as one) and the transcript service\'s view and status await rawAsync first');
  ok(typeof st.prepare !== 'function', 'a codex reader has NO prepare(): to the search index that marks a «serve-backed» reader it skips — codex conversations stay searchable (the gate\'s test-global-search red)');
  ok(desc.store.lastTurnModel(ID) instanceof Promise && desc.store.lastTurnEffort(ID) instanceof Promise, 'the continuity hooks are async (ws-create awaits them)');
}

console.log('— ⑥ THE CURE ROUND (主开发 23:16Z): P1 — a re-attach reads off the loop before its chat status');
{
  const WS = read('src/ws-handler.js');
  // P1 — A RE-ATTACH IS AN ATTACH: the history loaded elsewhere, a FRESH reader (every attach makes one) read off the loop first
  const loop0 = onLoopOf().count;
  const smR = new S.CodexSessionMessages(sess('re'), 'w-re', { buffersDir });
  await AR.readOffLoop(smR, { label: 'w-re' });
  const st = await during(async () => smR.chatStatus());
  ok(onLoopOf().count === loop0 && st.gap <= 50, `P1 a re-attach's fresh reader, read off the loop first, answers its chat status with no parse on the loop and no hold (worst ${st.gap} ms)`);
  const smX = new S.CodexSessionMessages(sess('rx'), 'w-rx', { buffersDir });
  const warned = []; const cw = console.warn; console.warn = (...x) => warned.push(x.join(' '));
  let sx; try { sx = await during(async () => smX.chatStatus()); } finally { console.warn = cw; }
  const onLoop = onLoopOf(), last = onLoop.recent[onLoop.recent.length - 1] || {};
  ok(onLoop.count === loop0 + 1 && sx.gap > LAW_MS && /before its off-loop read/.test(last.why || '') && warned.some((w) => /ON THE MAIN LOOP/.test(w)), `RED CONTROL — d7a0c4b36's re-attach (the fresh reader asked its status at once): ONE parse on the loop (${sx.gap} ms) — and it is SAID: «${(warned.find((w) => /ON THE MAIN LOOP/.test(w)) || '').slice(0, 110)}…»`);
  ok(/\n {14}if \(sm !== reSm\) await readOffLoop\(sm, \{ label: data\.sessionId, ack: /.test(WS) && WS.indexOf('await readOffLoop(sm, { label: data.sessionId, ack:') < WS.indexOf('const chatStatus = sm.chatStatus() || {};') && WS.indexOf('if (session._normalizer && !session._historyLoaded) {') < WS.indexOf('await readOffLoop(sm, { label: data.sessionId, ack:'), 'P1 (the wiring) ws-handler\'s attach reads off the loop on EVERY attach — after the first-attach block, at its level, before the chat status — and the view door reads through the same door', { view: /await readOffLoop\(sm, \{ label: `view /.test(WS) });
  // B-299b's attach rule (r2–r4: every wait of an attach in the PENDING window, never between the join and the verdict) — the
  // re-attach's read stands there (the restack onto the 2.369.412 block, its adversarial read's S1)
  ok(WS.indexOf('if (s0._historyLoaded) { reSm = createSessionMessages(s0, data.sessionId); await readOffLoop(reSm, { label: data.sessionId, wanted: () => ws.readyState === WS_OPEN && activeSessions.get(data.sessionId) === s0, ack:') > 0   // the wait that waits is the one acked (and dropped for a closed socket)
    && WS.indexOf('await warmTaskStateFor(s0);') < WS.indexOf('await readOffLoop(reSm,')
    && WS.indexOf('await readOffLoop(reSm,') < WS.indexOf('const session = activeSessions.get(data.sessionId);   // read AFTER the warm'),
    'P1 on B-299b\'s rule (the wiring): a re-attach reads its history off the loop in the PENDING window, ACKED while it waits — after the task-state warm, before the session is read again and the socket joins');
  ok(/\n {14}const sm = reSm && session === waitedFor \? reSm : createSessionMessages\(session, data\.sessionId\);/.test(WS) && /if \(sm !== reSm\) await readOffLoop\(sm, /.test(WS),
    'P1 on B-299b\'s rule: the attach keeps the reader read in the pending window and awaits nothing for it after the join (from the join to the send stays synchronous)');
}

clearInterval(iv);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
