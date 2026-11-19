#!/usr/bin/env node
// test-codex-history-line.mjs — lane resume-all-paced L3 + its cure round (主开发 2026-11-16 23:16Z): THE HUB READS ONE CODEX
// HISTORY AT A TIME, A PERSON'S FIRST, IN PAGES THAT REACH THEIR SNAPSHOT, AND SAYS IT WHEN A PARSE GOES BACK ON THE LOOP. A small
// stand-in rollout of the attach suite's shape (test-codex-attach-off-loop builds the 104 MB one) built at run time in this run's
// scratch HOME — never a real transcript; the hub's own functions; no load, no real CLI, no billed turn.
//   ⑤ L3 MEMORY (measured: a storm of 8 such conversations, L2 before L3, took the hub to 7.0 GB against master's 3.6): (a) the
//      worker's paged read holds a snapshot of the tail between pages and the last page drops it — SIZES ONLY, not the snapshot's
//      form (lines against records depends on the shape: the storm's tail 35 MB against 71; on this fixture the heap readings do not
//      order them reliably); (b) the pages answer boundedParsed's
//      records exactly (blank, unparsable, `null`, subagent lines, page edges); (c) ONE history read at a time hub-wide — three
//      attaches at once read one after another, each when the one before ENDED (a failed one included) — RED CONTROL: the ungated
//      read, three at once; (d) every page reaches the worker holding its snapshot (the `history` lane) while another transcript op
//      holds the pool — RED CONTROL: L2's road (page 0 and page 2 by the pool's least-busy pick, a PLACED stall on page 0's worker): gone
//   ⑥ THE CURE ROUND (主开发 23:16Z): (P1 is test-codex-attach-off-loop's) P2 a read waiting its turn is acked (a placed stall holds the line); the wiring;
//      S3 a person's read before every bulk read queued, the bulk flag's road, one request = one read (RED CONTROL: no memo, three);
//      S2 a history past the worker's bound — no one-shot read, the parse on the loop counted and said; S5 a page bounded in bytes
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HOME = scratch('codex-line');
fs.mkdirSync(HOME, { recursive: true });
process.env.HOME = HOME;   // BEFORE the codex modules load: their sessions root is the scratch HOME's ~/.codex/sessions
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string — the arguments are swapped'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 1500) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAW_MS = 250;
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// ── the stand-in: ~3 MB (the attach suite's shape, smaller), many small records (turn_context, the user's message and its event twin, reasoning, ten calls a turn
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
  while (size < 3 * 1048576) {
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
const statsOf = () => (codex.pagedReadStats ? codex.pagedReadStats() : { pages: 0, reads: 0, gone: 0, oneShot: 0, failed: 0 });
const onLoopOf = () => (codex.codexParsesOnLoop ? codex.codexParsesOnLoop() : { count: 0, recent: [] });
const setBound = (mb, o) => { if (codex._setHistoryHeapMbForTest) codex._setHistoryHeapMbForTest(mb, o); };
const AR = (() => { try { return require(path.join(REPO, 'src/attach-read.js')); } catch { return { readOffLoop: async () => false }; } })();   // before the cure: no door — a re-attach read nothing off the loop, nothing acked
// the loop probe: a 5 ms timer; its worst lateness while a step runs = the longest hold of the loop
let worst = 0, last = performance.now();
const iv = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last - 5); last = n; }, 5);
const during = async (fn) => { await sleep(40); worst = 0; last = performance.now(); const t0 = performance.now(); const r = await fn(); const ms = performance.now() - t0; await sleep(40); return { r, gap: Math.round(worst), ms: Math.round(ms) }; };
v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc');
const heapMB = () => { gc(); return Math.round(process.memoryUsage().heapUsed / 1048576); };

const buffersDir = path.join(HOME, 'buffers'); fs.mkdirSync(buffersDir, { recursive: true });
const sess = (n) => ({ backend: 'codex', mode: 'chat', backendSessionId: ID, cwd: '/srv/stand-in', buffer: '', name: 'stand-in ' + n });

console.log('— ⑤ L3 MEMORY: the worker keeps lines between pages; one history read at a time');
{
  const TW = require(path.join(REPO, 'src/transcript-worker.js'));   // the worker's own ops, run here (its inline road) to read their heap
  // (a) on a fixture whose records are LARGER than their lines (arrays of small numbers: two characters a number in the text, eight
  // bytes a number parsed) — so a snapshot kept as lines and one kept as records differ by their size, and a revert to records is red
  const INF = path.join(HOME, 'inflate.jsonl');
  { const nums = Array.from({ length: 400 }, (_, k) => k % 10).join(','); let t = '', i = 0; while (t.length < 8 * 1048576) t += `{"timestamp":"2026-11-16T00:00:00.000Z","type":"response_item","payload":{"type":"x","v":[${nums}],"i":${i++}}}\n`; fs.writeFileSync(INF, t); }
  const tailMB = Math.round(fs.statSync(INF).size / 1048576);
  const memMB = () => { gc(); gc(); const u = process.memoryUsage(); return Math.round((u.heapUsed + u.external) / 1048576); };
  const base = memMB();
  let r = TW.runOp('boundedParsedPage', { fp: INF, tailOnly: true, start: 0, count: 8192 }).result;
  const token = r.token, total = r.total; r = null;
  const held = memMB() - base;   // the snapshot alone (page 0's records dropped)
  // SIZES ONLY, NOT A FORM (主开发 23:16Z: «say that it pins a size only»): what lines save against records depends on the transcript's
  // shape — measured: on the storm's rollouts the lines 35 MB against the records' 71; on this numbers fixture the heap readings
  // (after two full collections) do not order lines against records reliably at all. So (a) pins what holds every time: a
  // snapshot is held between pages (the measure sees at least the tail), and the last page drops it.
  ok(held >= 0.9 * tailMB, `(a) between pages the worker holds the ${tailMB} MB tail's snapshot (${held} MB, heap + external — a big ASCII string is external; the measure sees it) — SIZES ONLY, not the snapshot's form`);
  for (let start = r?.next || 8192; start < total;) { const pg = TW.runOp('boundedParsedPage', { fp: INF, tailOnly: true, start, count: 8192, token }).result; start = pg.next; }
  ok(memMB() - base <= 8, `…and the last page drops it (${memMB() - base} MB left)`);
  // (b) exact parity with boundedParsed on the odd lines, across page edges
  const odd = path.join(HOME, 'odd.jsonl');
  const lines = [JSON.stringify({ type: 'a', n: 1 }), '', '   ', 'not json {', 'null', '5', JSON.stringify({ type: 'sub', parent_tool_use_id: 'p1' }), JSON.stringify({ type: 'side', isSidechain: true }), JSON.stringify({ type: 'b', n: 2 }), '  ' + JSON.stringify({ type: 'c', n: 3 }) + '  ', '"str"', JSON.stringify({ type: 'd', n: 4 })];
  fs.writeFileSync(odd, lines.join('\n') + '\n');
  for (const dropSubagent of [false, true]) {
    const one = TW.runOp('boundedParsed', { fp: odd, tailOnly: true, dropSubagent }).result;
    for (const count of [1, 3, 5, 100]) {
      const got = []; let tok = null, tot = Infinity;
      for (let start = 0; start < tot; start += count) { const p = TW.runOp('boundedParsedPage', { fp: odd, tailOnly: true, start, count, dropSubagent, ...(tok ? { token: tok } : {}) }).result; tok = p.token; tot = p.total; got.push(...p.records); }
      ok(JSON.stringify(got) === JSON.stringify(one) && one.length === (dropSubagent ? 6 : 9), `(b) pages of ${count} line(s) answer boundedParsed's ${one.length} records exactly (dropSubagent ${dropSubagent})`, { got, one });
    }
  }
  // (c)/(d) on a SMALL rollout (the gate's order and the pages' worker do not depend on the size): the rig's first 5000 lines
  const SID = '019a6e00-0000-7000-8000-0000000c0de7', SFP = path.join(path.dirname(FP), `rollout-2026-11-16T10-00-01-${SID}.jsonl`);
  { const fd = fs.openSync(FP, 'r'), buf = Buffer.alloc(4 << 20); const got = fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
    fs.writeFileSync(SFP, buf.subarray(0, got).toString('utf8').split('\n').slice(0, 5000).join('\n').replace(ID, SID) + '\n'); }
  const small = (n) => ({ ...sess(n), backendSessionId: SID });
  const smallN = (await new S.CodexSessionMessages(small('s0'), 'w-s0', { buffersDir }).rawAsync()).length;
  // (c) one history read at a time — the store's reads seen at the paged reader they call
  const real = codex.readJsonlBoundedParsedPagedAsync;
  let inflight = 0, most = 0; const order = [];
  codex.readJsonlBoundedParsedPagedAsync = async (...args) => { inflight++; most = Math.max(most, inflight); order.push('start'); try { return await real(...args); } finally { inflight--; order.push('end'); } };
  try {
    const stores = [1, 2, 3].map((k) => new S.CodexSessionMessages(small('g' + k), 'w-g' + k, { buffersDir }));
    const all = await Promise.all(stores.map((st) => st.rawAsync()));
    ok(most === 1 && order.join(',') === 'start,end,start,end,start,end' && smallN > 1000 && all.every((x) => x.length === smallN), `(c) three attaches at once read ONE AT A TIME, each when the one before ended (${order.join(',')}; ${smallN} records each)`);
    inflight = 0; most = 0; order.length = 0;
    await Promise.all([1, 2, 3].map(() => S.parseCodexSessionJsonlAsync(SID)));
    ok(most === 3, `RED CONTROL — the ungated read (L2 before L3), three at once: ${most} in flight together`);
  } finally { codex.readJsonlBoundedParsedPagedAsync = real; }
  // (d) the pages' worker: a snapshot lives in ONE worker; another transcript op holding the pool's first worker sent L2's next page
  // to the other one (least busy)
  // the stalls are PLACED (the worker's __hold op waits on a shared word until the test releases it) — never a scan that may have ended
  const pool = codex.transcriptPool();
  const word = () => new SharedArrayBuffer(4), release = (b) => { const w = new Int32Array(b); Atomics.store(w, 0, 1); Atomics.notify(w, 0); };
  // RED CONTROL — L2's ROAD: page 0 AND page 2 sent where the pool's least-busy pick sends them (no lane); page 0 makes its snapshot
  // on worker #k, a stall is placed on #k, page 2 goes to the other worker — its snapshot is not there
  const w0 = pool._pick();
  const q0 = await pool._send(w0, 'boundedParsedPage', { fp: SFP, tailOnly: true, start: 0, count: 1000 }, 60000);
  const h0 = word(), held0 = pool._send(w0, '__hold', { sab: h0, ms: 20000 }, 30000).catch(() => null);
  const w2 = pool._pick();
  const red = await pool._send(w2, 'boundedParsedPage', { fp: SFP, tailOnly: true, start: q0.next, count: 1000, token: q0.token }, 60000);
  release(h0); await held0;
  ok(w2 !== w0 && !!red && red.gone === true, `RED CONTROL — L2's road: page 0 on pool worker #${w0.slot}, a stall placed on it, page 2 sent where the least-busy pick sends it (#${w2.slot}): no snapshot there (gone)`);
  // the reader's own door (the history lane): page 0, then BOTH pool workers held by placed stalls, then page 2
  const p0 = await pool.call('boundedParsedPage', { fp: SFP, tailOnly: true, start: 0, count: 1000 });
  const ha = word(), hb = word(), ra = pool.call('__hold', { sab: ha, ms: 20000 }).catch(() => null), rb = pool.call('__hold', { sab: hb, ms: 20000 }).catch(() => null);
  const bothHeld = pool._workers.every((w) => w.inflight.size === 1);
  const p1 = await pool.call('boundedParsedPage', { fp: SFP, tailOnly: true, start: p0.next, count: 1000, token: p0.token });
  release(ha); release(hb); await Promise.all([ra, rb]);
  ok(bothHeld && !!p1 && !p1.gone && p1.token === p0.token && p1.records.length > 500, `(d) through the reader's own door (the \`history\` lane) page 2 reaches its snapshot with BOTH pool workers held (${p1 && p1.records ? p1.records.length : 0} records)`);
  const seen = [];
  const first = S.oneReadAtATime(async () => { seen.push('a'); await sleep(30); throw new Error('a failed read'); });
  const second = S.oneReadAtATime(async () => { seen.push('b'); return 'b read'; });
  const [fa, sb] = await Promise.allSettled([first, second]);
  ok(fa.status === 'rejected' && sb.status === 'fulfilled' && sb.value === 'b read' && seen.join('') === 'ab', '(c) a read that FAILS ends its turn: the next one runs (its failure is its own caller\'s)');

console.log('— ⑥ THE CURE ROUND (主开发 23:16Z): every attach reads off the loop and is told while it waits; a person first; a fallback said; pages bounded in bytes');
// (⑤'s scope — the small rollout and the worker module)
{
  const TW2 = () => require(path.join(REPO, 'src/transcript-worker.js'));
  const WS = read('src/ws-handler.js');
  // P2 — WHILE AN ATTACH WAITS, THE WINDOW IS TOLD: the line held by a read in progress (a placed stall), a re-attach's read queued
  let releaseGate; const holder = S.oneReadAtATime(() => new Promise((r) => { releaseGate = r; }));
  await sleep(5);
  const acks = [];
  const smQ = new S.CodexSessionMessages(small('q'), 'w-q', { buffersDir });
  const q = AR.readOffLoop(smQ, { ack: () => acks.push(S.readsWaiting ? S.readsWaiting() : {}), ackMs: 30, label: 'w-q' });
  await sleep(200);
  const whileQueued = acks.length;
  releaseGate(); await holder; await q;
  const atEnd = acks.length; await sleep(100);
  ok(whileQueued >= 4 && acks.slice(0, whileQueued).every((w) => w.person >= 1 && w.reading) && acks.length === atEnd, `P2 a read waiting its turn is acked every 30 ms while it waits (${whileQueued} acks in 200 ms, each with the read queued behind one in progress); the acks stop when it has read`);
  const iT = WS.indexOf('const progressTimer = setInterval('), iW = WS.indexOf("const warm = harnessOf(session.backend || 'claude').store?.warmTranscript; if (warm) await warm(session.claudeSessionId"), iR = WS.indexOf('await readOffLoop(sm, { bulk: bulkRead');
  ok(iT > 0 && iT < iW && iW < iR && /\}, ATTACH_ACK_MS\);/.test(WS.slice(iT, iW)), 'P2 (the wiring) the first attach\'s acks start BEFORE the warm and the off-loop read (the re-attach\'s read carries its own `ack`, P1)');
  // S3 — A PERSON'S OWN WINDOW GOES FIRST: the line held, two bulk reads then a person's queued → the person's runs first
  let rel2; const hold2 = S.oneReadAtATime(() => new Promise((r) => { rel2 = r; }));
  await sleep(5);
  const order3 = [];
  const b1 = S.oneReadAtATime(async () => { order3.push('bulk 1'); }, { bulk: true });
  const b2 = S.oneReadAtATime(async () => { order3.push('bulk 2'); }, { bulk: true });
  const px = S.oneReadAtATime(async () => { order3.push('person'); });
  rel2(); await Promise.all([hold2, b1, b2, px]);
  ok(order3.join(',') === 'person,bulk 1,bulk 2', `S3 a person's read goes before every bulk read already queued (${order3.join(' → ')})`);
  ok(/later: \{ stay: true, bulk: true \}/.test(read('src/lib/resume-pacer.js')) && /extra: \{ stay: true, bulk: true \}/.test(read('src/lib/layout.js')) && /bulk: \(bulk && resumeId\) \? true : undefined/.test(read('src/lib/session-lifecycle.js')) && /_bulkRead: !!\(data\.resume && data\.bulk === true\)/.test(read('src/ws-create.js')) && /const bulkRead = !!session\._bulkRead; session\._bulkRead = false;/.test(WS), 'S3 (the wiring) a paced «Resume all» and a group\'s later members send `bulk`; the hub marks the conversation, and only its FIRST attach reads in the bulk line');
  // S3 — ONE REQUEST, ONE READ: a page, its status and its turn map through the transcript service
  const { createTranscriptService } = require(path.join(REPO, 'src/transcript-service.js'));
  const TS = createTranscriptService({ activeSessions: new Map(), createSessionMessages: (shape) => new S.CodexSessionMessages(shape, 'api', { buffersDir }), hosts: null });
  const ref = () => ({ backend: 'codex', sessionId: SID, cwd: '/srv/stand-in' });
  const reads = async (withMemo) => { const r0 = statsOf().reads, R = withMemo ? { ...ref(), memo: {} } : null; await TS.page(R || ref(), {}); await TS.status(R || ref()); await TS.turnmap(R || ref()); return statsOf().reads - r0; };
  const one = await reads(true), three = await reads(false);
  ok(one === 1 && three === 3, `S3 one request — a page, its status and its turn map — joins the read line ONCE (${one} read); RED CONTROL: without the request's memo, ${three} reads`);
  ok(read('src/routes/sessions.js').split("host: req.query.host, memo: {} }").length === 3, 'S3 (the wiring) both session-messages routes give the request its memo');
  // S2 — A PARSE THAT GOES BACK ON THE LOOP IS SAID: the history worker's bound refuses (here 1 MB), the read gives up WITHOUT the
  // one-shot read, and the parse on the loop is counted and logged with its reason
  const l0 = onLoopOf().count, o0 = statsOf().oneShot, said2 = [];
  const cw2 = console.warn; console.warn = (...x) => said2.push(x.join(' '));
  setBound(1);
  try { await new S.CodexSessionMessages(small('hb'), 'w-hb', { buffersDir }).rawAsync(); } finally { setBound(768); console.warn = cw2; }
  const l1 = onLoopOf();
  ok(l1.count === l0 + 1 && /heap bound/.test(l1.recent[l1.recent.length - 1].why) && statsOf().oneShot === o0 && said2.some((w) => /ON THE MAIN LOOP/.test(w) && /heap bound/.test(w)), `S2 a history past the worker's bound: no one-shot read, ONE parse on the loop — counted and said: «${(said2.find((w) => /ON THE MAIN LOOP/.test(w)) || '').slice(0, 120)}…»`);
  // S5 — A PAGE IS BOUNDED IN BYTES as well as in lines: pages of ≤ 200 000 characters of text, `next` where the next begins, the same records
  const one2 = TW2().runOp('boundedParsed', { fp: SFP, tailOnly: true }).result, got = []; let tok = null, tot = Infinity, at = 0, pages = 0, maxText = 0;
  while (at < tot) { const pg = TW2().runOp('boundedParsedPage', { fp: SFP, tailOnly: true, start: at, count: 8192, maxBytes: 200000, ...(tok ? { token: tok } : {}) }).result; tok = pg.token; tot = pg.total; maxText = Math.max(maxText, (pg.next - at)); got.push(...pg.records); at = pg.next; pages++; }
  ok(pages >= 10 && maxText < 8192 && JSON.stringify(got) === JSON.stringify(one2), `S5 a page ends at 200 000 characters of its lines as well as at 8192 lines (${pages} pages, the longest ${maxText} lines) and the pages answer the same ${one2.length} records`);
}
}

clearInterval(iv);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
