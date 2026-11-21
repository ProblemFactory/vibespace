#!/usr/bin/env node
// B-cd4b unit 2 (hold 3; lane bl-loop-a): THE CLAUDE TRANSCRIPT WARM'S COLD READ COMES IN PAGES. Its one-shot reply (`jsonlTail` —
// readJsonlTail's whole entry) crossed to the main thread in ONE structured clone; measured at a hub restart with 80 survivors,
// the page's re-attaches: the loop held ~1.0–1.3 s at its deserialize. Now the ONE pager carries it (src/adapters/codex.js
// readJsonlBoundedParsedPagedAsync `entry`; the worker's boundedParsedPage runs readJsonlTail ONCE and hands its messages back a
// page at a time). The fixtures are built at run time in this run's scratch HOME — never a real transcript; no load, no real CLI.
//  ① THE SAME ENTRY: on four kinds of transcript — one past the tail bound (its seam), a partial last line, subagent records
//     dropped, one under a page — the entry assembled from the pages is DEEP-EQUAL to the one-shot's (mode and bytes too)
//  ② THE WARM PAGES: warmSessionJsonlAsync asks the pager (several pages, no `jsonlTail`) and caches the same records; RED: the
//     one-shot reply planted back (the warm calls `jsonlTail`)
//  ③ THE SLOTS: a warm ('warm'), a person's history read ('') and a helper's ('helper') at once — each keeps every page (no read's
//     snapshot cut: nothing «gone»), each equal to its one-shot; RED: the warm on the history reads' slot ⇒ a page gone
//  ④ ONE WARM AT A TIME: two warms at once both read through their pages, nothing gone; RED: the line taken away ⇒ gone
// Run: node scripts/test-claude-warm-pages.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = scratch('warm-pages');
fs.mkdirSync(HOME, { recursive: true });
process.env.HOME = HOME;   // BEFORE the stores load: the claude projects root is this scratch HOME's
os.homedir = () => HOME;   // …as the stores ask it (test-jsonl-incremental's way)
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string — the arguments are swapped'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 1200) : '')); } };
const M = mutantCopies('warm-pages', REPO);
const codex = require(path.join(REPO, 'src/adapters/codex.js'));
const S = require(path.join(REPO, 'src/session-store.js'));
const ssSrc = fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8');

// ── the fixtures: claude-shaped records (a user line, an assistant line with a long text), some a subagent's ──
const DIR = path.join(HOME, 'fx'); fs.mkdirSync(DIR, { recursive: true });
const pad = (n, k) => ('w' + k + ' ').repeat(Math.ceil(n / 4)).slice(0, n);
const rec = (k, extra = {}) => JSON.stringify({ type: k % 2 ? 'assistant' : 'user', uuid: `u-${k}`, sessionId: 's', message: { role: k % 2 ? 'assistant' : 'user', content: [{ type: 'text', text: pad(3000, k) }] }, ...extra });
const write = (name, lines, { tail = '\n' } = {}) => { const f = path.join(DIR, name); fs.writeFileSync(f, lines.join('\n') + tail); return f; };
const big = (name, mb) => { const f = path.join(DIR, name); const fd = fs.openSync(f, 'w'); let n = 0, k = 0; while (n < mb * 1048576) { const l = rec(k++, k % 9 === 0 ? { isSidechain: true } : {}) + '\n'; fs.writeSync(fd, l); n += l.length; } fs.closeSync(fd); return f; };
const FX = {
  'past the tail bound (its seam)': big('big.jsonl', Math.ceil(codex.JSONL_TAIL_BYTES / 1048576) + 4),   // 4 MiB past the tail bound: the seam leg reads a cut read (spanStart > 0, judged in ①)
  'a partial last line': write('partial.jsonl', Array.from({ length: 40 }, (_, k) => rec(k)), { tail: '\n' + rec(40) }),
  'subagent records dropped': write('sub.jsonl', Array.from({ length: 60 }, (_, k) => rec(k, k % 3 === 0 ? { parent_tool_use_id: 'p' + k } : k % 5 === 0 ? { isSidechain: true } : {}))),
  'one under a page': write('small.jsonl', Array.from({ length: 12 }, (_, k) => rec(k))),
};
const stats = () => codex.pagedReadStats();
const oneShot = (fp) => codex.readJsonlTailAsync(fp, { dropSubagent: true });
const paged = (fp, slot = 'warm') => codex.readJsonlBoundedParsedPagedAsync(fp, { entry: true, dropSubagent: true, slot });

try {
  console.log('— ① THE SAME ENTRY: the pages assembled equal the one-shot reply');
  for (const [what, fp] of Object.entries(FX)) {
    const a = await oneShot(fp), s0 = stats(), b = await paged(fp), s1 = stats();
    const pages = s1.pages - s0.pages;
    const seamOk = what !== 'past the tail bound (its seam)' || (!!a && a.entry.spanStart > 0);   // its read really starts past the head (the tail bound cut it)
    ok(!!a && !!b && isDeepStrictEqual(b.entry, a.entry) && b.mode === a.mode && b.bytes === a.bytes && s1.gone === s0.gone && s1.oneShot === s0.oneShot && s1.failed === s0.failed && pages >= 1 && seamOk,
      `${what}: the paged entry is DEEP-EQUAL to the one-shot's (${a && a.entry.messages.length} records, partial ${a && a.entry.partial}, span ${a && a.entry.spanStart}–${a && a.entry.spanEnd}, mode ${a && a.mode}) in ${pages} page(s) — by the pages (no one-shot fallback, no failure)`,
      { keysA: a && Object.keys(a.entry), keysB: b && Object.keys(b.entry), pages });
  }
  const sBig = stats(); await paged(FX['past the tail bound (its seam)']); const bigPages = stats().pages - sBig.pages;
  ok(bigPages >= 3, `the big one crosses in ${bigPages} pages, never one clone`);

  console.log('— ② THE WARM PAGES (the attach\'s store.warmTranscript)');
  const pool = codex.transcriptPool();
  const seen = async (fn) => { const ops = []; const call0 = pool.call; pool.call = function (op, ...a) { ops.push(op); return call0.call(this, op, ...a); }; try { return { r: await fn(), ops }; } finally { pool.call = call0; } };
  const CWD = path.join(HOME, 'proj');
  const PROJ = path.join(HOME, '.claude', 'projects', CWD.replace(/[/._]/g, '-')); fs.mkdirSync(PROJ, { recursive: true });
  const warmOf = async (SM, sid) => { fs.copyFileSync(FX['past the tail bound (its seam)'], path.join(PROJ, sid + '.jsonl')); SM.jsonlCacheClear?.(); return seen(() => SM.warmSessionJsonlAsync(sid, CWD)); };
  const want = (await oneShot(FX['past the tail bound (its seam)'])).entry.messages;
  const g = await warmOf(S, 'a0b10000-0000-4000-8000-00000000c4d2');
  const msgs = S.parseSessionJsonl('a0b10000-0000-4000-8000-00000000c4d2', CWD);
  const pagesG = g.ops.filter((o) => o === 'boundedParsedPage').length, tailG = g.ops.filter((o) => o === 'jsonlTail').length;
  ok(g.r === true && pagesG >= 3 && tailG === 0 && isDeepStrictEqual(msgs, want),
    `the warm asks the pager (${pagesG} pages, ${tailG} one-shot reply) and caches the SAME records (${msgs.length}) — the sync parse after it is a hit, equal`);
  const oneShotSrc = anchored(anchored(ssSrc, '        const q = warmPaged(fp, { fresh, bulk }); w.job = q.job;', '        ', 'warm-one-shot-unqueued'), '        const r = await q.p;', "        const r = await require('./adapters/codex').readJsonlTailAsync(fp, { dropSubagent: true });", 'warm-one-shot');
  const SR = require(M.write('src/session-store.js', oneShotSrc, 'warm-one-shot'));
  const rr = await warmOf(SR, 'a0b10000-0000-4000-8000-00000000c4d3');
  ok(rr.ops.filter((o) => o === 'jsonlTail').length === 1 && rr.ops.filter((o) => o === 'boundedParsedPage').length === 0,
    'RED: the one-shot reply planted back — the warm asks `jsonlTail` once, no page: the whole entry in one clone');

  console.log('— ③ THE SLOTS: a warm, a person\'s history read and a helper\'s at once — every page reaches its snapshot');
  const hist = big('hist.jsonl', 10), helper = big('helper.jsonl', 10);
  const wantH = await codex.readJsonlBoundedParsedAsync(hist, { tailOnly: true }), wantP = await codex.readJsonlBoundedParsedAsync(helper, { tailOnly: true }), wantW = (await oneShot(FX['past the tail bound (its seam)'])).entry;
  const three = async (warmSlot) => { const s0 = stats(); const [w, h, p] = await Promise.all([paged(FX['past the tail bound (its seam)'], warmSlot), codex.readJsonlBoundedParsedPagedAsync(hist, {}), codex.readJsonlBoundedParsedPagedAsync(helper, { slot: 'helper' })]); return { w, h, p, gone: stats().gone - s0.gone }; };
  const t3 = await three('warm');
  ok(t3.gone === 0 && isDeepStrictEqual(t3.w && t3.w.entry, wantW) && isDeepStrictEqual(t3.h, wantH) && isDeepStrictEqual(t3.p, wantP),
    `three paged reads at once in their own slots ('warm', '', 'helper'): nothing gone (${t3.gone}), each equal to its one-shot`);
  const r3 = await three('');
  ok(r3.gone > 0, `RED: the warm on the history reads' slot ('') — a person's read finds its snapshot cut (${r3.gone} gone)`);

  console.log('— ④ ONE WARM AT A TIME (the worker keeps one snapshot a slot)');
  const two = async (SM) => { const s0 = stats(); const sids = ['a0b10000-0000-4000-8000-00000000c4e1', 'a0b10000-0000-4000-8000-00000000c4e2']; for (const sid of sids) fs.copyFileSync(sid.endsWith('1') ? FX['past the tail bound (its seam)'] : hist, path.join(PROJ, sid + '.jsonl')); SM.jsonlCacheClear?.(); const r = await Promise.all(sids.map((sid) => SM.warmSessionJsonlAsync(sid, CWD))); return { r, gone: stats().gone - s0.gone }; };
  const g4 = await two(S);
  ok(g4.r.every((x) => x === true) && g4.gone === 0, `two warms at once: both read through their pages, nothing gone (${g4.gone})`);
  const noLine = anchored(ssSrc, '  if (_warmQ.busy) return;\n', '', 'warm-no-line');
  const g4r = await two(require(M.write('src/session-store.js', noLine, 'warm-no-line')));
  ok(g4r.gone > 0, `RED: the line taken away — the second warm's first page cuts the first's snapshot (${g4r.gone} gone)`);

  console.log('— ⑤ ONE WARM IN FLIGHT A FILE (its fresh read\'s MUST): a second asker joins the first, never a second whole read');
  {
    // A, then B, then A again (an attach's task-state warm gave up at 10 s, its transcript warm asks again): the second A joins the
    // first and resolves with it, ahead of B — two reads in all. RED: the join taken away ⇒ the second A waits for its own turn after
    // B. And with the join taken away, the second warm's turn finds the cache filled for the same file and reads nothing; RED: that
    // check taken away too ⇒ two whole reads of one file
    const A = 'a0b10000-0000-4000-8000-00000000c5a1', B = 'a0b10000-0000-4000-8000-00000000c5b1';
    const order5 = async (SM) => {
      for (const sid of [A, B]) fs.copyFileSync(hist, path.join(PROJ, sid + '.jsonl'));
      SM.jsonlCacheClear?.(); const done = [], s0 = stats();
      const r = await Promise.all([[A, 'A'], [B, 'B'], [A, "A'"]].map(([sid, n]) => SM.warmSessionJsonlAsync(sid, CWD).then((x) => { done.push(n); return x; })));
      return { r, done: done.join(), reads: stats().reads - s0.reads };
    };
    const noJoin = anchored(ssSrc, '    let w = _warmInFlight.get(fp);', '    let w = null;', 'warm-no-join');
    const noFresh = anchored(noJoin, '  if (fresh && fresh()) return { fresh: true };', '  if (false) return { fresh: true };', 'warm-no-fresh');
    const SJ = require(M.write('src/session-store.js', noJoin, 'warm-no-join')), SF = require(M.write('src/session-store.js', noFresh, 'warm-no-fresh'));
    const g5 = await order5(S), r5 = await order5(SJ);
    ok(g5.r.every((x) => x === true) && g5.done === "A,A',B" && g5.reads === 2, `the second A joins the first (resolved: ${g5.done}; ${g5.reads} reads for two files)`, g5);
    ok(r5.done === "A,B,A'", `RED: the join taken away ⇒ the second A waits its own turn after B (${r5.done})`, r5);
    const twice = async (SM) => { fs.copyFileSync(hist, path.join(PROJ, A + '.jsonl')); SM.jsonlCacheClear?.(); const s0 = stats(); const r = await Promise.all([SM.warmSessionJsonlAsync(A, CWD), SM.warmSessionJsonlAsync(A, CWD)]); return { r, reads: stats().reads - s0.reads }; };
    const f5 = await twice(SJ), f5r = await twice(SF);
    ok(f5.r.every((x) => x === true) && f5.reads === 1, `with the join taken away, the second warm's turn finds the cache filled for the same file: ${f5.reads} read`, f5);
    ok(f5r.reads === 2, `RED: the fresh check taken away too ⇒ ${f5r.reads} whole reads of one file`, f5r);
  }

  console.log('— ⑥ THE HEAP BOUND (its fresh read\'s MUST): a warm the history lane refuses is read in one piece on the general pool, said — never parsed on the loop');
  {
    // the history worker answers the warm's first page with its heap bound (planted): the pager reads the entry as the warm read it
    // before the unit (jsonlTail on the general pool) and says why; RED: the bound answered null (the caller then parsed on the loop)
    const refuse = async (CX) => {
      const pl = CX.transcriptPool(), call0 = pl.call, said = [];
      pl.call = function (op, ...a) { if (op === 'boundedParsedPage') { const e = new Error('planted: the heap bound'); e.code = 'heap_bound'; return Promise.reject(e); } return call0.call(this, op, ...a); };
      try { return { r: await CX.readJsonlBoundedParsedPagedAsync(hist, { entry: true, dropSubagent: true, slot: 'warm', onFail: (w) => said.push(String(w)) }), said }; } finally { pl.call = call0; }
    };
    const want6 = (await oneShot(hist)).entry, h6 = await refuse(codex);
    const cxSrc = fs.readFileSync(path.join(REPO, 'src/adapters/codex.js'), 'utf8');
    const h6r = await refuse(require(M.write('src/adapters/codex.js', anchored(cxSrc, "      if (code === 'heap_bound' && !entry) return said(", "      if (code === 'heap_bound') return said(", 'warm-heap-null'), 'warm-heap-null')));
    ok(!!h6.r && isDeepStrictEqual(h6.r.entry, want6) && h6.said.length === 1 && /heap bound[\s\S]*the entry read in one piece on the general pool/.test(h6.said[0]),
      `refused by the heap bound: the same entry, read in one piece on the general pool, and said («${h6.said[0] || 'nothing said'}»)`, h6.said);
    ok(h6r.r === null, 'RED: the heap bound answered null — the warm returned false and the conversation was parsed on the loop', h6r.said);
  }

  console.log('— ⑦ A PERSON\'S OWN ACT FIRST (its follow, 主开发 r935): a person\'s warm runs before every bulk warm not yet started');
  {
    // three bulk warms (a paced «Resume all»'s first attaches, `bulk: true`), then a person's: the first bulk warm is in flight and
    // finishes, the person's runs SECOND; a person's ask for a file whose bulk warm still waits moves that warm up. Each warm's read
    // is seen at the pager (its start, in order). RED: first come first served (one line for all) ⇒ the person's runs last; RED: no
    // move ⇒ the file the person asked for waits its bulk turn
    const small = FX['one under a page'];
    const order7 = async (SM, asks) => {
      for (const [sid] of asks) fs.copyFileSync(small, path.join(PROJ, sid + '.jsonl'));
      SM.jsonlCacheClear?.(); const seen = [], real = codex.readJsonlBoundedParsedPagedAsync;
      codex.readJsonlBoundedParsedPagedAsync = function (fp, o) { seen.push(path.basename(fp, '.jsonl')); return real.call(this, fp, o); };
      try { const r = await Promise.all(asks.map(([sid, bulk]) => SM.warmSessionJsonlAsync(sid, CWD, bulk ? { bulk: true } : null))); return { r, order: seen.map((x) => asks.findIndex(([y]) => y === x)).join() }; }
      finally { codex.readJsonlBoundedParsedPagedAsync = real; }
    };
    const B = (k) => `a0b10000-0000-4000-8000-0000000c7${k}`;
    const P4 = [[B('b01'), true], [B('b02'), true], [B('b03'), true], [B('d01'), false]];   // hex ids only (a well-formed conversation id)
    const UP = [[B('e01'), true], [B('e02'), true], [B('e03'), true], [B('e03'), false]];
    const g7 = await order7(S, P4), u7 = await order7(S, UP);
    const fcfs = require(M.write('src/session-store.js', anchored(ssSrc, '(job.bulk ? _warmQ.bulk : _warmQ.person).push(job);', '_warmQ.bulk.push(job);', 'warm-fcfs'), 'warm-fcfs'));
    const noUp = require(M.write('src/session-store.js', anchored(ssSrc, '    if (w) { if (!bulk) promoteWarm(w.job); }', '    if (w) { }', 'warm-no-promote'), 'warm-no-promote'));
    const r7 = await order7(fcfs, P4.map(([x, b]) => [x.replace('c7', 'c8'), b])), ru7 = await order7(noUp, UP.map(([x, b]) => [x.replace('c7', 'c8'), b]));
    ok(g7.r.every((x) => x === true) && g7.order === '0,3,1,2' && u7.r.every((x) => x === true) && u7.order === '0,2,1',
      `three bulk warms then a person's: the bulk one in flight finishes, the person's runs second (${g7.order}); a person's ask for a file whose bulk warm waits moves it up (${u7.order})`, { g7, u7 });
    ok(r7.order === '0,1,2,3' && ru7.order === '0,1,2', `RED: first come first served ⇒ the person's runs last (${r7.order}); RED: no move ⇒ the asked file waits its bulk turn (${ru7.order})`, { r7, ru7 });
  }

  console.log('— ⑧ THE LINE IS LET GO when a warm rejects (its worker dead mid-pages, its read refused): the warm behind it runs');
  {
    const small = FX['one under a page'];
    const rej = async (SM, tag) => {
      const A = `a0b10000-0000-4000-8000-00000000c9${tag}1`, Bb = `a0b10000-0000-4000-8000-00000000c9${tag}2`;
      for (const sid of [A, Bb]) fs.copyFileSync(small, path.join(PROJ, sid + '.jsonl'));
      SM.jsonlCacheClear?.(); const real = codex.readJsonlBoundedParsedPagedAsync; let n = 0;
      codex.readJsonlBoundedParsedPagedAsync = function (fp, o) { if (!n++) return Promise.reject(new Error('planted: the worker died mid-pages')); return real.call(this, fp, o); };
      try {
        let rb = null; const pa = SM.warmSessionJsonlAsync(A, CWD), pb = SM.warmSessionJsonlAsync(Bb, CWD); pb.then((v) => { rb = v; });
        const ra = await pa; const tEnd = Date.now() + 1500; while (rb === null && Date.now() < tEnd) await new Promise((r) => setTimeout(r, 5));
        return { ra, rb };
      } finally { codex.readJsonlBoundedParsedPagedAsync = real; }
    };
    const g8 = await rej(S, 'a');
    const held = require(M.write('src/session-store.js', anchored(ssSrc, 'Promise.resolve().then(() => warmTurn(job.fp, job.fresh)).then(job.resolve, job.reject).finally(() => { _warmQ.busy = false; pumpWarm(); });', 'Promise.resolve().then(() => warmTurn(job.fp, job.fresh)).then((v) => { job.resolve(v); _warmQ.busy = false; pumpWarm(); }, job.reject);', 'warm-held-on-reject'), 'warm-held-on-reject'));
    const r8 = await rej(held, 'b');
    ok(g8.ra === false && g8.rb === true, `a warm whose read rejects answers false (its caller reads the old road) and the warm behind it runs (${g8.rb})`, g8);
    ok(r8.ra === false && r8.rb === null, 'RED: the line let go only on success ⇒ the warm behind a rejected one never runs', r8);
  }

  console.log('— ⑨ THE CONVERSATION DECIDES (主开发 r1035): a bulk resume\'s conversation is bulk on the HISTORY road too, until a person\'s own act');
  {
    // the page that pressed «Resume all» never attaches over the socket: it reads each created conversation's history over HTTP
    // (GET /api/session-messages → src/transcript-service.js view / status). The service reads the LIVE conversation's own mark
    // (`_bulkRead`): its warm and codex's raw read go in the bulk line. A person's own act (person=1: a press in the window, or the
    // app going to it) clears the mark and asks the warm as a person's (it joins the one in flight and moves it up). RED: the view's
    // warm without the conversation's mark (the release's gap) ⇒ every resumed conversation's warm is a person's
    const H = require(path.join(REPO, 'src/harnesses')); const st = H.get('claude').store;
    const tsSrc = fs.readFileSync(path.join(REPO, 'src/transcript-service.js'), 'utf8');
    const SID9 = 'a0b10000-0000-4000-8000-0000000c9d01';
    const road = async (TSm) => {
      const calls = [], raws = [], w0 = st.warmTranscript;
      st.warmTranscript = async (id, cwd, o) => { calls.push({ id, bulk: !!(o && o.bulk) }); return true; };
      try {
        const live = { backend: 'claude', claudeSessionId: SID9, backendSessionId: SID9, host: null, _bulkRead: true };
        const svc = TSm.createTranscriptService({ activeSessions: new Map([['w9', live]]), createSessionMessages: () => ({ raw: () => [], rawAsync: async (o) => { raws.push(!!(o && o.bulk)); } }), hosts: null });
        const ref = () => ({ backend: 'claude', sessionId: SID9, cwd: CWD, memo: {} });
        await svc.view(ref());
        const asked = svc.personAsk ? svc.personAsk(ref()) : null;
        await new Promise((r) => setImmediate(r));
        return { calls, raws, cleared: live._bulkRead === false, asked };
      } finally { st.warmTranscript = w0; }
    };
    const g9 = await road(require(path.join(REPO, 'src/transcript-service.js')));
    const gap = anchored(tsSrc, '...(live ? { session: live } : {}), bulk: bulkOf(r) }); } catch { }   // r1035: the conversation\'s own mark', '...(live ? { session: live } : {}) }); } catch { }', 'ts-no-mark');   // stale-pins: kept (the red plants the road without the mark)
    const r9 = await road(require(M.write('src/transcript-service.js', gap, 'ts-no-mark')));
    ok(g9.calls.length === 2 && g9.calls[0].bulk === true && g9.raws[0] === true && g9.calls[1].bulk === false && g9.cleared && g9.asked && g9.asked.ok,
      `the history road of a bulk resume's conversation warms in the BULK line (the conversation's own mark) and its raw read with it; a person's own act clears the mark and asks the warm as a person's (${JSON.stringify(g9.calls)})`, g9);
    ok(r9.calls.length >= 1 && r9.calls[0].bulk === false, `RED: the view's warm without the conversation's mark ⇒ a person's (${JSON.stringify(r9.calls)})`, r9);
    // THE PAGE (pinned by text: it is not loaded here): a bulk resume's window tells the hub ONCE at a person's own act while its history
    // waits — a press in the window, or the app going to it (ChatView.focus)
    const slSrc = fs.readFileSync(path.join(REPO, 'src/lib/session-lifecycle.js'), 'utf8'), cvSrc = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
    ok(/if \(bulk\) \{\s*let told = false;\s*const tell = \(\) => \{ if \(told \|\| !chatView\._historyInFlight\) return; told = true; fetch\(`\/api\/session-messages\?[^`]*&person=1/.test(slSrc) && /chatView\._personAct = tell;\s*winInfo\.content\?\.addEventListener\?\.\('pointerdown', tell, \{ once: true \}\);/.test(slSrc)
      && /focus\(\) \{\s*if \(this\._chatInput\) this\._chatInput\.focus\(\);\s*this\._personAct\?\.\(\);/.test(cvSrc), 'the page: a bulk resume\'s window tells the hub once (person=1) at a press in it or the app going to it, while its history waits');
  }
} catch (e) { fail++; console.log('  ✗ threw: ' + ((e && e.stack) || e)); }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
