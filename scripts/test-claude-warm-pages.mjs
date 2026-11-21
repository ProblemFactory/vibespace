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
//  ④ TWO WARMS AT ONCE (B-80cb cure, 主开发 r1524: the release read two cold tails at once), each in its own lane and slot: both
//     read through their pages, nothing gone; a third waits its turn; RED: both in one lane ⇒ gone; RED: no bound ⇒ three at once
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

  console.log('— ④ TWO WARMS AT ONCE, each in its own lane and slot (the worker keeps one snapshot a slot) — B-80cb cure, 主开发 r1524');
  const two = async (SM) => { const s0 = stats(); const sids = ['a0b10000-0000-4000-8000-00000000c4e1', 'a0b10000-0000-4000-8000-00000000c4e2']; for (const sid of sids) fs.copyFileSync(sid.endsWith('1') ? FX['past the tail bound (its seam)'] : hist, path.join(PROJ, sid + '.jsonl')); SM.jsonlCacheClear?.(); const r = await Promise.all(sids.map((sid) => SM.warmSessionJsonlAsync(sid, CWD))); return { r, gone: stats().gone - s0.gone }; };
  const g4 = await two(S);
  ok(g4.r.every((x) => x === true) && g4.gone === 0 && S.warmLineStats().atOnce === 2, `two warms at once: both read AT ONCE (${S.warmLineStats().atOnce} in flight) through their pages, each in its own lane, nothing gone (${g4.gone})`);
  const oneLane = anchored(ssSrc, "const WARM_LANES = ['warm', 'warm2'];", "const WARM_LANES = ['warm', 'warm'];", 'warm-one-lane');
  const g4r = await two(require(M.write('src/session-store.js', oneLane, 'warm-one-lane')));
  ok(g4r.gone > 0, `RED: both warms in ONE lane — the second warm's first page cuts the first's snapshot (${g4r.gone} gone)`);
  // three at once: two read, the third waits its turn in the line (never a third worker's heap, never a shared slot)
  // r2195 (c): «at once» = the pager's reads REALLY in flight (counted at the pager: the line's own count stops at its lanes' two)
  const three4 = async (SM) => { const s0 = stats(); const sids = ['a0b10000-0000-4000-8000-00000000c4f1', 'a0b10000-0000-4000-8000-00000000c4f2', 'a0b10000-0000-4000-8000-00000000c4f3']; for (const sid of sids) fs.copyFileSync(hist, path.join(PROJ, sid + '.jsonl')); SM.jsonlCacheClear?.(); const real = codex.readJsonlBoundedParsedPagedAsync; let now = 0, most = 0; codex.readJsonlBoundedParsedPagedAsync = function (fp, o) { now++; most = Math.max(most, now); return Promise.resolve(real.call(this, fp, o)).finally(() => { now--; }); }; let r; try { r = await Promise.all(sids.map((sid) => SM.warmSessionJsonlAsync(sid, CWD))); } finally { codex.readJsonlBoundedParsedPagedAsync = real; } return { r, gone: stats().gone - s0.gone, atOnce: most }; };
  const unbounded = anchored(anchored(ssSrc, '  while (_warmQ.free.length) {', '  while (_warmQ.person.length || _warmQ.bulk.length) {', 'warm-unbounded'), '    const lane = _warmQ.free.shift();', "    const lane = _warmQ.free.shift() || 'warm';", 'warm-unbounded-lane');
  const g43 = await three4(S), g43r = await three4(require(M.write('src/session-store.js', unbounded, 'warm-unbounded')));
  ok(g43.r.every((x) => x === true) && g43.gone === 0 && g43.atOnce === 2, `three warms at once: two read, the third waits its turn (at most ${g43.atOnce} in flight, nothing gone)`, g43);
  ok(g43r.atOnce === 3 && g43r.gone > 0, `RED: no bound on the warms in flight ⇒ ${g43r.atOnce} reads at once, a lane's snapshot cut (${g43r.gone} gone)`, g43r);

  console.log('— ⑤ ONE WARM IN FLIGHT A FILE (its fresh read\'s MUST): a second asker joins the first, never a second whole read');
  {
    // A, then B, then A again (an attach's task-state warm gave up at 10 s, its transcript warm asks again): the second A joins the
    // first and resolves with it, ahead of B — two reads in all. RED: the join taken away ⇒ the second A waits for its own turn after
    // B. And with the join taken away, the second warm's turn finds the cache filled for the same file and reads nothing; RED: that
    // check taken away too ⇒ two whole reads of one file
    const A = 'a0b10000-0000-4000-8000-00000000c5a1', B = 'a0b10000-0000-4000-8000-00000000c5b1';
    const order5 = async (SM) => {
      for (const sid of [A, B]) fs.copyFileSync(hist, path.join(PROJ, sid + '.jsonl'));
      SM.jsonlCacheClear?.(); const done = [], s0 = stats(), t0 = SM.warmLineStats ? SM.warmLineStats().turns : 0;
      const r = await Promise.all([[A, 'A'], [B, 'B'], [A, "A'"]].map(([sid, n]) => SM.warmSessionJsonlAsync(sid, CWD).then((x) => { done.push(n); return x; })));
      return { r, done: done.join(), reads: stats().reads - s0.reads, turns: (SM.warmLineStats ? SM.warmLineStats().turns : 0) - t0 };
    };
    // B-80cb cure: two warms at once ⇒ A and B read together and either may end first; the join is that the second A resolves WITH the
    // first (right after it) and takes no turn of its own
    const withIt = (d, a, b) => { const x = d.split(','); return x.indexOf(b) === x.indexOf(a) + 1; };
    // BOTH joins taken away: the file's (this suite's) and row B-422c's of the SESSION around it (one warm a session at a time — A
    // and A' are one session's asks, so that join alone would resolve A' with A and hide the file's join from this control)
    const noJoin = anchored(anchored(ssSrc, '    let w = _warmInFlight.get(fp);', '    let w = null;', 'warm-no-join'), '  if (was && (bulk || !was.bulk)) return was.p;', '  if (false) return was.p;', 'warm-no-session-join');
    const noFresh = anchored(noJoin, '  if (fresh && fresh()) return { fresh: true };', '  if (false) return { fresh: true };', 'warm-no-fresh');
    const SJ = require(M.write('src/session-store.js', noJoin, 'warm-no-join'));   // the fresh check's own pair runs on one lane (below)
    const g5 = await order5(S), r5 = await order5(SJ);
    ok(g5.r.every((x) => x === true) && withIt(g5.done, 'A', "A'") && g5.reads === 2 && g5.turns === 2, `the second A joins the first — resolved with it (${g5.done}); ${g5.reads} reads and ${g5.turns} turns for two files`, g5);
    ok(r5.turns === 3, `RED: the joins taken away (the file's and the session's) ⇒ the second A takes a turn of its own (${r5.turns} turns for two files)`, r5);
    const twice = async (SM) => { fs.copyFileSync(hist, path.join(PROJ, A + '.jsonl')); SM.jsonlCacheClear?.(); const s0 = stats(); const r = await Promise.all([SM.warmSessionJsonlAsync(A, CWD), SM.warmSessionJsonlAsync(A, CWD)]); return { r, reads: stats().reads - s0.reads }; };
    // the fresh check ALONE, on ONE lane (the second warm's turn comes after the first's read — two lanes would start both at once)
    const oneLane = (src, tag) => anchored(src, "const WARM_LANES = ['warm', 'warm2'];", "const WARM_LANES = ['warm'];", tag);
    const SJ1 = require(M.write('src/session-store.js', oneLane(noJoin, 'warm-no-join-1'), 'warm-no-join-1')), SF1 = require(M.write('src/session-store.js', oneLane(noFresh, 'warm-no-fresh-1'), 'warm-no-fresh-1'));
    const f5 = await twice(SJ1), f5r = await twice(SF1);
    ok(f5.r.every((x) => x === true) && f5.reads === 1, `with the join taken away (one lane), the second warm's turn finds the cache filled for the same file: ${f5.reads} read`, f5);
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
    // three bulk warms (a paced «Resume all»'s first attaches, `bulk: true`), then a person's: the first TWO bulk warms are in flight
    // (two at once, B-80cb cure) and finish, the person's runs THIRD; a person's ask for a file whose bulk warm still waits moves it up. Each warm's read
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
    const UP = [[B('e01'), true], [B('e02'), true], [B('e03'), true], [B('e04'), true], [B('e04'), false]];   // two in flight: the lift is seen with four
    const g7 = await order7(S, P4), u7 = await order7(S, UP);
    const fcfs = require(M.write('src/session-store.js', anchored(ssSrc, '(job.bulk ? _warmQ.bulk : _warmQ.person).push(job);', '_warmQ.bulk.push(job);', 'warm-fcfs'), 'warm-fcfs'));
    const noUp = require(M.write('src/session-store.js', anchored(ssSrc, '    if (w) { if (!bulk) promoteWarm(w.job); }', '    if (w) { }', 'warm-no-promote'), 'warm-no-promote'));
    const r7 = await order7(fcfs, P4.map(([x, b]) => [x.replace('c7', 'c8'), b])), ru7 = await order7(noUp, UP.map(([x, b]) => [x.replace('c7', 'c8'), b]));
    ok(g7.r.every((x) => x === true) && g7.order === '0,1,3,2' && u7.r.every((x) => x === true) && u7.order === '0,1,3,2',
      `three bulk warms then a person's: the two bulk ones in flight finish, the person's runs third (${g7.order}); a person's ask for a file whose bulk warm waits moves it up (${u7.order})`, { g7, u7 });
    ok(r7.order === '0,1,2,3' && ru7.order === '0,1,2,3', `RED: first come first served ⇒ the person's runs last (${r7.order}); RED: no move ⇒ the asked file waits its bulk turn (${ru7.order})`, { r7, ru7 });
  }

  console.log('— ⑧ THE LINE IS LET GO when a warm rejects (its worker dead mid-pages, its read refused): the warm behind it runs');
  {
    const small = FX['one under a page'];
    // B-80cb cure: two warms at once ⇒ the first TWO reads reject (both lanes), the third warm behind them must still ask its read
    const rej = async (SM, tag) => {
      const A = `a0b10000-0000-4000-8000-00000000c9${tag}1`, Bb = `a0b10000-0000-4000-8000-00000000c9${tag}2`, C = `a0b10000-0000-4000-8000-00000000c9${tag}3`;
      for (const sid of [A, Bb, C]) fs.copyFileSync(small, path.join(PROJ, sid + '.jsonl'));
      SM.jsonlCacheClear?.(); const real = codex.readJsonlBoundedParsedPagedAsync; let n = 0;
      codex.readJsonlBoundedParsedPagedAsync = function (fp, o) { if (n++ < 2) return Promise.reject(new Error('planted: the worker died mid-pages')); return real.call(this, fp, o); };
      try {
        const pa = SM.warmSessionJsonlAsync(A, CWD), pb = SM.warmSessionJsonlAsync(Bb, CWD), pc = SM.warmSessionJsonlAsync(C, CWD);
        // what happened, never a clock (r1093's small): the lanes are let go in microtasks — by the next turn the warm behind has asked
        // its read, or it never will (a held line has nothing left to pump it)
        const ra = await pa, rb = await pb; await new Promise((r) => setImmediate(r));
        const asked = n, rc = asked >= 3 ? await pc : null;
        return { ra, rb, rc, asked };
      } finally { codex.readJsonlBoundedParsedPagedAsync = real; }
    };
    const g8 = await rej(S, 'a');
    const held = require(M.write('src/session-store.js', anchored(ssSrc, 'Promise.resolve().then(() => warmTurn(job.fp, job.fresh, lane)).then(job.resolve, job.reject).finally(() => { _warmQ.free.push(lane); pumpWarm(); });', 'Promise.resolve().then(() => warmTurn(job.fp, job.fresh, lane)).then((v) => { job.resolve(v); _warmQ.free.push(lane); pumpWarm(); }, job.reject);', 'warm-held-on-reject'), 'warm-held-on-reject'));
    const r8 = await rej(held, 'b');
    ok(g8.ra === false && g8.rb === false && g8.asked === 3 && g8.rc === true, `two warms whose reads reject answer false (their callers read the old road) and the warm behind them asks its read and runs (${g8.rc})`, g8);
    ok(r8.ra === false && r8.rb === false && r8.asked === 2 && r8.rc === null, 'RED: the lanes let go only on success ⇒ the warm behind two rejected ones never asks its read', r8);
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

  console.log('— ⑩ THE DOORS (主开发 r1093): the mark is consumed where a door REPLIES, never inside a road — every door by every source, driven twice');
  {
    // THE CENSUS: every export of the service is a row of ENTRIES by name (an entry added later with no row is red by name); the
    // consume (src/bulk-read.js replied / personAct) is called nowhere but at the doors (a call inside a road is red by name; the
    // module is required whole, as BULK); every `attached` reply of the socket is classified, each door's consume right after its
    // send; no road reads the mark's field but through the one place. THE TABLE: each door, one marked conversation, for EACH SOURCE
    // of its reply — the local read, the paired machine's reply (a stand-in device), the device's failure then the local fallback,
    // a paired machine's copy fetched (view: it never asks the device), the hub's own copy (a live normalizer holding the whole
    // history) — driven twice: the first is bulk, the one after its reply a person's. RED: the tip's shape (the consume inside three
    // roads) ⇒ the device's reply leaves the mark. A REPLY THAT FAILS (a throw: the pager's bound; the asker gone) keeps the mark: the
    // retry is still the first read. ONE REQUEST, ONE FIRST READ: the withStatus composite on one memo reads in one line; RED: the
    // verdict not the request's ⇒ its status warms as a person's.
    const H = require(path.join(REPO, 'src/harnesses'));
    const TS10 = require(path.join(REPO, 'src/transcript-service.js'));
    const tsSrc10 = fs.readFileSync(path.join(REPO, 'src/transcript-service.js'), 'utf8');
    const DEV = '\u0000device:', HOST = 'h10', Q = 'needle';
    const ANSWER = { page: { messages: [], total: 0 }, turnmap: { turns: [], total: 0 }, searchIndexed: { matches: [], total: 0 }, status: { chatStatus: {}, taskState: null }, taskState: { todos: [] },
      gapInfo: { hasFile: true, gap: null }, gapSlab: { messages: [] }, searchFull: { matches: [], truncated: false }, fullTurnmap: { turns: [] } };
    let CUR = null, K = 0;
    // one conversation a paced «Resume all» marked, its own service, one source of the reply
    const conv = (TSm, backend, source, { failRead = 0, notLoaded = null } = {}) => {
      const sid = `a0b10000-0000-4000-8000-0000001${String(K++).padStart(5, '0')}`;
      fs.copyFileSync(FX['one under a page'], path.join(PROJ, sid + '.jsonl'));   // the gap family reads the file itself
      const remote = source !== 'local' && source !== 'hub-copy', asksDevice = source === 'device' || source === 'device-failed';
      const live = { backend, claudeSessionId: backend === 'claude' ? sid : null, backendSessionId: sid, host: remote ? HOST : null, _bulkRead: true };
      if (source === 'hub-copy') { live._normalizer = { total: 1, messages: [{ uuid: 'u-0' }], tailWindow: () => [], slice: () => [], turnMap: () => [], search: () => [] }; live._historyLoaded = true; }
      const c = { sid, live, seen: [], served: [], device: asksDevice };
      let fails = failRead;
      const sm = () => ({ raw: () => [], rawAsync: async (o) => { c.seen.push(!!(o && o.bulk)); if (fails > 0) { fails--; throw new Error('planted: the pager\'s bound'); } }, chatStatus: () => ({}), taskState: () => ({}), ...(notLoaded ? { notLoaded } : {}) });
      const hosts = { fetchTranscript: async () => { }, linkState: () => 'online',
        deviceBounded: async () => (c.device ? { connect: async () => ({ info: { capabilities: ['transcript-op'] } }),
          transcriptOp: async (method) => { c.served.push(live._bulkRead === true); if (source === 'device-failed') throw new Error('planted: the device hung up'); return ANSWER[method]; } } : null) };
      c.svc = TSm.createTranscriptService({ activeSessions: new Map([['w10-' + sid, live]]), createSessionMessages: sm, hosts });
      c.ref = (o = {}) => ({ backend, sessionId: sid, cwd: CWD, host: live.host, memo: {}, ...o });
      c.fp = () => (live.host ? DEV + HOST : path.join(PROJ, sid + '.jsonl'));
      c.local = () => { c.device = false; live.host = null; delete live._normalizer; live._historyLoaded = false; };   // the read after: here, by the local road
      return c;
    };
    const stubbed = async (fn) => {
      const saved = ['claude', 'codex'].map((b) => { const st = H.get(b).store; return [st, Object.prototype.hasOwnProperty.call(st, 'warmTranscript'), st.warmTranscript, Object.prototype.hasOwnProperty.call(st, 'warmTaskState'), st.warmTaskState]; });
      const warns = [], w0 = console.warn; console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
      for (const [st, , , hadT] of saved) { st.warmTranscript = async (id, cwd, o) => { CUR && CUR.seen.push(!!(o && o.bulk)); return true; }; if (hadT) st.warmTaskState = async (id, cwd, o) => { CUR && CUR.seen.push(!!(o && o.bulk)); return true; }; }
      try { return { out: await fn(), warns }; } finally { console.warn = w0; for (const [st, hadW, w, hadT, t] of saved) { if (hadW) st.warmTranscript = w; else delete st.warmTranscript; if (hadT) st.warmTaskState = t; } }
    };
    const ALL = ['local', 'device', 'device-failed', 'hub-copy'], FAM = ['local', 'device', 'device-failed'];
    const DOORS = {   // which door reads in a line (asks `bulk`): the gap family reads the file itself, in none
      view: { sources: ['local', 'remote-copy', 'hub-copy'], line: true, drive: (c) => c.svc.view(c.ref()) },
      page: { sources: ALL, line: true, drive: (c) => c.svc.page(c.ref(), { offset: 0, limit: 50 }) },
      turnmap: { sources: ALL, line: true, drive: (c) => c.svc.turnmap(c.ref()) },
      searchIndexed: { sources: ALL, line: true, drive: (c) => c.svc.searchIndexed(c.ref(), Q) },
      status: { sources: FAM, line: true, drive: (c) => c.svc.status(c.ref()) },   // no hub copy: it reads its reader (one request rides its memo, below)
      taskState: { sources: FAM, line: true, drive: (c) => c.svc.taskState(c.ref()) },
      gapInfo: { sources: FAM, line: false, drive: (c) => c.svc.gapInfo(c.ref()) },
      gapSlab: { sources: FAM, line: false, drive: (c) => c.svc.gapSlab(c.ref(), c.fp(), 0, 4) },
      searchFull: { sources: FAM, line: false, drive: (c) => c.svc.searchFull(c.ref(), c.fp(), Q) },
      searchFullStream: { sources: FAM, line: false, drive: (c) => c.svc.searchFullStream(c.ref(), c.fp(), Q, () => { }, {}) },
      fullTurnmap: { sources: FAM, line: false, drive: (c) => c.svc.fullTurnmap(c.ref(), c.fp()) },
    };
    const ROWS = [...Object.entries(DOORS).flatMap(([door, d]) => d.sources.map((source) => ({ door, backend: 'claude', source, d }))),
      ...['local', 'device'].map((source) => ({ door: 'page', backend: 'codex', source, d: DOORS.page }))];   // codex's raw read, its own line
    const table = (TSm) => stubbed(async () => {
      const rows = [];
      for (const { door, backend, source, d } of ROWS) {
        const c = conv(TSm, backend, source); CUR = c;
        let n = c.seen.length; await d.drive(c); const first = c.seen.slice(n), served = c.served.slice(), consumed = c.live._bulkRead === false;
        c.local(); n = c.seen.length; await d.drive(c); const second = c.seen.slice(n);
        rows.push({ name: `${door}${backend === 'codex' ? ' (codex)' : ''} by ${source}`, door, source, line: d.line, first, served, consumed, second });
      }
      CUR = null; return rows;
    });
    const good = await table(TS10);
    const rowOk = (x) => x.consumed && (x.source !== 'device' || (x.served.length > 0 && x.served.every((b) => b === true)))
      && x.first.every((b) => b === true) && x.second.every((b) => b === false) && (!x.line || (x.second.length > 0 && (x.source === 'device' || x.first.length > 0)));
    for (const x of good.out) ok(rowOk(x), `${x.name}: the first reply ${x.source === 'device' ? `served while bulk (${x.served.join(',')})` : `read bulk (${x.first.join(',') || 'no line: the file itself'})`}, consumed at its reply; the read after a person's (${x.second.join(',') || 'no line'})`, x);
    ok(good.out.filter((x) => x.source === 'device-failed').length === good.warns.filter((w) => /device read failed for h10/.test(w)).length,
      `every device that failed was SAID once (${good.warns.length} saying(s)), its local fallback then replied`, good.warns);
    // RED: THE TIP'S SHAPE — the consume inside three roads (view after its conversion, status, the todos read), no door
    const tip = anchored(anchored(anchored(anchored(tsSrc10,
      'const reply = (out) => { if (!(r.gone && r.gone()) && !said(out)) BULK.replied(live()); return out; };', 'const reply = (out) => out;', 'tip-no-door'),
      '    await gateRun(r, () => mm.convertHistoryAsync(sm.raw()));   // a paired machine\'s transcript read here: the device road\'s gate\n', '    await gateRun(r, () => mm.convertHistoryAsync(sm.raw()));   // a paired machine\'s transcript read here: the device road\'s gate\n    BULK.replied(session);\n', 'tip-view'),
      '    return { chatStatus, taskState: sm.taskState?.() || null, ...(sm.findUnknown ? { findUnknown: true } : {}) };', '    BULK.replied(session);\n    return { chatStatus, taskState: sm.taskState?.() || null, ...(sm.findUnknown ? { findUnknown: true } : {}) };', 'tip-status'),   // the status reply as B-a60e's cure has it (its «not known yet» flag)
      '    const st = sm.taskState() || {};\n', '    const st = sm.taskState() || {};\n    BULK.replied(live);\n', 'tip-todos');
    const red = await table(require(M.write('src/transcript-service.js', tip, 'ts-tip-shape')));
    const redDev = red.out.filter((x) => x.source === 'device'), redLocal = red.out.filter((x) => x.source === 'local' && x.line);
    ok(redDev.length >= 10 && redDev.every((x) => !x.consumed && x.second.some((b) => b === true) === x.line) && redLocal.every((x) => x.consumed),
      `RED: the tip's shape ⇒ the device's reply leaves the mark on every door (${redDev.map((x) => x.name).join(' · ')}), the next read bulk again; its local roads consume (${redLocal.length})`, { redDev, redLocal });
    // A REPLY THAT FAILS keeps the mark — a throw (the pager's bound), the asker gone: the retry is still the first read
    // 主开发 r2246: THE STATUS BESIDE A «NOT LOADED» PAGE spares the mark too — one request (/api/session-messages?withStatus=1: the page,
    // then its status, one memo): the history said «not loaded», a refusal said, so the retry is still the first read. RED: the reply
    // judging its own answer alone (the status carries no «not loaded» of its own: it consumed the mark)
    const nlRun = (TSm) => stubbed(async () => {
      const c = conv(TSm, 'claude', 'local', { notLoaded: 'transcript_reader_restarting' }); CUR = c;
      const ref = c.ref();
      const pg = await c.svc.page(ref, { offset: 0, limit: 50 }); const afterPage = c.live._bulkRead === true;
      await c.svc.status(ref);
      CUR = null; return { said: (pg && pg.notLoaded) || null, afterPage, kept: c.live._bulkRead === true };
    });
    const nl = await nlRun(TS10);
    const ownAnswer = anchored(tsSrc10, "    const said = (out) => !!(out && out.notLoaded) || !!(r.memo && r.memo.view && r.memo.view.notLoaded);", "    const said = (out) => !!(out && out.notLoaded);", 'status-own-answer');
    const nlr = await nlRun(require(M.write('src/transcript-service.js', ownAnswer, 'status-own-answer')));
    ok(!!nl.out.said && nl.out.afterPage && nl.out.kept, `the status beside a «not loaded» page (one request) spares the mark: kept after the page (${nl.out.afterPage}) and after its status (${nl.out.kept})`, nl.out);
    ok(!!nlr.out.said && nlr.out.afterPage && !nlr.out.kept, `RED: the reply judging its own answer alone ⇒ the status consumes the mark the page spared (${nlr.out.kept})`, nlr.out);
    const fails = await stubbed(async () => {
      const cT = conv(TS10, 'claude', 'local', { failRead: 1 }); CUR = cT;
      let threw = null; try { await cT.svc.page(cT.ref(), { offset: 0, limit: 50 }); } catch (e) { threw = e.message; }
      const keptT = cT.live._bulkRead === true; let n = cT.seen.length; await cT.svc.page(cT.ref(), { offset: 0, limit: 50 }); const retryT = cT.seen.slice(n), afterT = cT.live._bulkRead;
      const cG = conv(TS10, 'claude', 'local'); CUR = cG;
      await cG.svc.status(cG.ref({ gone: () => true })); const keptG = cG.live._bulkRead === true;
      n = cG.seen.length; await cG.svc.status(cG.ref()); const retryG = cG.seen.slice(n), afterG = cG.live._bulkRead;
      CUR = null; return { threw, keptT, retryT, afterT, keptG, retryG, afterG };
    });
    const f = fails.out;
    ok(f.threw === 'planted: the pager\'s bound' && f.keptT && f.retryT.length > 0 && f.retryT.every((b) => b === true) && f.afterT === false && f.keptG && f.retryG.length > 0 && f.retryG.every((b) => b === true) && f.afterG === false,
      `a reply that FAILS keeps the mark: a throw (${f.threw}) and an asker gone (its status replied to nobody) — each retry still reads bulk (${f.retryT.join(',')} · ${f.retryG.join(',')}) and its reply consumes`, f);
    // ONE REQUEST, ONE FIRST READ: the history route's withStatus composite (page, status, turnmap on ONE memo)
    const oneReq = async (TSm) => (await stubbed(async () => {
      const c = conv(TSm, 'claude', 'local'); CUR = c;
      const req = async () => { const ref = c.ref(), n = c.seen.length; await c.svc.page(ref, { offset: 0, limit: 50 }); await c.svc.status(ref); await c.svc.turnmap(ref); return c.seen.slice(n); };
      const r1 = await req(), r2 = await req(); CUR = null; return { r1, r2 };
    })).out;
    const o1 = await oneReq(TS10);
    const perRead = anchored(tsSrc10, "function bulkOf(r) { return r.memo && typeof r.memo.bulk === 'boolean' ? r.memo.bulk : BULK.isBulk(liveSession(r)); }", 'function bulkOf(r) { return BULK.isBulk(liveSession(r)); }', 'ts-verdict-per-read');   // stale-pins: kept (the red plants r1062's per-read verdict)
    const o1r = await oneReq(require(M.write('src/transcript-service.js', perRead, 'ts-verdict-per-read')));
    ok(o1.r1.length >= 4 && o1.r1.every((b) => b === true) && o1.r2.length >= 4 && o1.r2.every((b) => b === false),
      `one request, one first read: the withStatus composite reads in one line (${o1.r1.join(',')}), the next request a person's (${o1.r2.join(',')})`, o1);
    ok(o1r.r1[0] === true && o1r.r1.some((b) => b === false), `RED: the verdict not the request's ⇒ its status and turnmap warm as a person's (${o1r.r1.join(',')})`, o1r);
    // A FORK SHARING ITS PARENT'S THREAD ID (主开发 r1127): the history route names the window's own conversation (`webuiId`, sent by
    // the page's history read and its person's act), so a read of the parent never spends the fork's mark. RED: a read naming none
    // (the route before) ⇒ the first live match — the fork, listed first — is spent
    const fk = (await stubbed(async () => {
      const sid = 'a0b10000-0000-4000-8000-0000001f0001';
      const fork = { backend: 'claude', claudeSessionId: sid, backendSessionId: sid, host: null, _bulkRead: true }, parent = { backend: 'claude', claudeSessionId: sid, backendSessionId: sid, host: null };
      const svc = TS10.createTranscriptService({ activeSessions: new Map([['w-fork', fork], ['w-parent', parent]]), createSessionMessages: () => ({ raw: () => [], rawAsync: async () => { }, chatStatus: () => ({}), taskState: () => ({}) }), hosts: null });
      await svc.page({ backend: 'claude', sessionId: sid, cwd: CWD, memo: {}, webuiId: 'w-parent' }, { offset: 0, limit: 50 }); const kept = fork._bulkRead === true;
      await svc.page({ backend: 'claude', sessionId: sid, cwd: CWD, memo: {} }, { offset: 0, limit: 50 }); const spent = fork._bulkRead === false;
      return { kept, spent };
    })).out;
    const rsF = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8'), slF = fs.readFileSync(path.join(REPO, 'src/lib/session-lifecycle.js'), 'utf8');
    ok(fk.kept && fk.spent && /sessionId: resolvedSessionId, cwd, webuiId: req\.query\.webuiId, gone:/.test(rsF) && /webuiId: typeof ref\.webuiId === 'string' && ref\.webuiId \? ref\.webuiId : null/.test(tsSrc10)
      && (slF.match(/&webuiId=\$\{encodeURIComponent\(msg\.sessionId \|\| ''\)\}&(?:withStatus|person)=1/g) || []).length === 2,
      `a fork sharing its parent's thread id: a read naming the parent's own window leaves the fork's mark (${fk.kept}); RED a read naming none spends it (${fk.spent}); the route takes the window's id and the page sends it on its history read and its person's act (pinned by text)`, fk);
    // THE ENTRIES: every export by name — a door, or not one (its reason in NOT_DOORS); the ones that are not consume nothing
    const ENTRIES = { view: 'door', page: 'door', turnmap: 'door', searchIndexed: 'door', status: 'door', taskState: 'door', gapInfo: 'door', gapSlab: 'door', searchFull: 'door', searchFullStream: 'door', fullTurnmap: 'door',
      filePath: 'not', refreshRemote: 'not', rescue: 'not', picture: 'not', pictureHere: 'not', personAsk: 'not', bulkOf: 'not' };
    const entriesCensus = (keys) => ({ unlisted: keys.filter((k) => !Object.prototype.hasOwnProperty.call(ENTRIES, k)), dead: Object.keys(ENTRIES).filter((k) => !keys.includes(k)) });
    const keys = Object.keys(TS10.createTranscriptService({ activeSessions: new Map(), createSessionMessages: () => ({}), hosts: null }));
    const ec = entriesCensus(keys), ecPlanted = entriesCensus([...keys, 'plantedEntry']);
    const notDoors = ((tsSrc10.match(/const NOT_DOORS = \{([\s\S]*?)\n  \};/) || [])[1] || '').split('\n').map((l) => (l.match(/^\s+(\w+):/) || [])[1]).filter(Boolean);
    const nd = (await stubbed(async () => { const c = conv(TS10, 'claude', 'local'); c.svc.filePath(c.ref()); await c.svc.refreshRemote(c.ref()); const b = c.svc.bulkOf(c.ref()); const kept = c.live._bulkRead === true; c.svc.personAsk(c.ref()); return { b, kept, acted: c.live._bulkRead === false }; })).out;
    ok(!ec.unlisted.length && !ec.dead.length && ecPlanted.unlisted.join() === 'plantedEntry' && notDoors.slice().sort().join() === Object.keys(ENTRIES).filter((k) => ENTRIES[k] === 'not').sort().join()
      && Object.keys(ENTRIES).filter((k) => ENTRIES[k] === 'door').every((k) => good.out.some((x) => x.door === k)) && nd.b === true && nd.kept && nd.acted,
      `THE ENTRIES: every export of the service is a row by name (${keys.length}; unlisted ${ec.unlisted.join(', ') || 'none'}, dead ${ec.dead.join(', ') || 'none'}); CONTROL a planted entry named (${ecPlanted.unlisted.join()}); NOT_DOORS = the table's not-doors (${notDoors.join(', ')}: read from the source by its literal — a reformatted list finds nothing and fails HERE by name, never passes quietly), each consuming nothing; personAsk acts`, { ec, notDoors, nd });
    // THE CONSUME'S CALL SITES and the field's reads — by name, comments stripped (line numbers kept)
    const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
    const walk = (d, out = []) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.posix.join(d, e.name); if (e.isDirectory()) walk(r, out); else if (e.name.endsWith('.js')) out.push(r); } return out; };
    const tree = walk('src').map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]);
    const CONSUME = /\bBULK\s*\.\s*(?:replied|personAct)\s*\(/, REQ = /require\(\s*['"][./]+(?:[\w-]+\/)*bulk-read(?:\.js)?['"]\s*\)/;
    const SITES = [
      ['src/transcript-service.js', 'BULK.replied(live())', 1],   // THE DOOR: every export but NOT_DOORS, when it replies
      ['src/transcript-service.js', 'BULK.personAct(live)', 1],   // personAsk: a person's own act
      ['src/ws-handler.js', 'if (ws.readyState === WS_OPEN) BULK.replied(session);', 1],   // a terminal's attach
      ['src/ws-handler.js', 'if (ws.readyState === WS_OPEN && !livePayload.historyNotLoaded) BULK.replied(session);', 1],   // a chat attach (row B-422c: a «not loaded» reply consumes nothing)   // the socket's attach doors: a chat attach, a terminal's
      ['src/ws-handler.js', 'BULK.replied(s);', 1],   // View History's door
    ];
    const sitesCensus = (files) => {
      const found = [];
      for (const [f, t] of files) { if (f === 'src/bulk-read.js') continue; strip(t).split('\n').forEach((ln, i) => { if (CONSUME.test(ln) || (REQ.test(ln) && !/\bconst BULK = require\(/.test(ln))) found.push({ f, i: i + 1, ln: ln.trim() }); }); }
      const unlisted = found.filter((h) => !SITES.some(([f, needle]) => f === h.f && h.ln.includes(needle))).map((h) => `${h.f}:${h.i}`);
      const wrong = SITES.map(([f, needle, want]) => [f, needle, want, found.filter((h) => h.f === f && h.ln.includes(needle)).length]).filter(([, , want, got]) => want !== got).map(([f, needle, want, got]) => `${f} «${needle}» ${got} of ${want}`);
      return { unlisted, wrong };
    };
    const sc = sitesCensus(tree);
    const inRoad = anchored(tsSrc10, '    await gateRun(r, () => mm.convertHistoryAsync(sm.raw()));   // a paired machine\'s transcript read here: the device road\'s gate\n', '    await gateRun(r, () => mm.convertHistoryAsync(sm.raw()));   // a paired machine\'s transcript read here: the device road\'s gate\n    BULK.replied(session);\n', 'planted-road-consume');
    const scPlanted = sitesCensus([...tree.filter(([f]) => f !== 'src/transcript-service.js'), ['src/transcript-service.js', inRoad], ['src/planted-road.js', "const { replied } = require('./bulk-read');\nreplied(s);"]]);
    ok(!sc.unlisted.length && !sc.wrong.length && scPlanted.unlisted.length === 2 && scPlanted.unlisted[1] === 'src/planted-road.js:1' && /^src\/transcript-service\.js:\d+$/.test(scPlanted.unlisted[0]),
      `THE CONSUME is called at the doors only (${tree.length} files; unlisted ${sc.unlisted.join(', ') || 'none'}, ${sc.wrong.join(', ') || 'every door once'}); CONTROL a consume planted inside view's road and a destructured require are named (${scPlanted.unlisted.join(', ')})`, { sc, scPlanted });
    const READ = /\.\s*_bulkRead\b|\[\s*['"]_bulkRead['"]\s*\]|\{[^{}]*\b_bulkRead\b[^{}]*\}\s*=[^=>]/;
    const ALLOWED = new Set(['src/bulk-read.js', 'src/ws-create.js', 'src/session-schema.js']);
    const fieldCensus = (files) => files.filter(([f, t]) => !ALLOWED.has(f) && READ.test(strip(t))).map(([f]) => f);
    const outside = fieldCensus(tree), planted = fieldCensus([['src/planted-road.js', 'function read(s) { return !!s._bulkRead; }'], ['src/planted-pick.js', 'const { _bulkRead } = s;'], ['src/planted-comment.js', '// a comment naming s._bulkRead is no read']]);
    ok(outside.length === 0 && planted.join() === 'src/planted-road.js,src/planted-pick.js', `THE FIELD: no road reads the mark but through src/bulk-read.js (outside: ${outside.join(', ') || 'none'}); CONTROL a planted member read and a destructured one named, a comment not (${planted.join(', ')})`, { outside, planted });
    // THE SOCKET'S HISTORY REPLIES (ws-handler is not loaded here): every `attached` send classified; each door's consume right after it
    const wsS = strip(fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8'));
    const SENDS = [
      ['attachedFrameText(livePayload', 1, /ws\.send\(attachedFrameText\(livePayload, resume, \(\) => \(\{[\s\S]{0,600}?\}\)\)\);\s*\n\s*if \(ws\.readyState === WS_OPEN && !livePayload\.historyNotLoaded\) BULK\.replied\(session\);/],   // a chat attach
      ["buffer: session.buffer || ''", 1, /buffer: session\.buffer \|\| '' \}\)\);\s*\n\s*if \(ws\.readyState === WS_OPEN\) BULK\.replied\(session\);/],   // a terminal's attach
      ["name: data.name || '', cwd: data.cwd || '', mode: 'chat'", 1, /viewOnly: true(?:, \.\.\.\(sm\.findUnknown \? \{ findUnknown: true \} : \{\}\))?(?:, historyNotLoaded: [^\n]*?)? \}\)\);\s*\n\s*if \(ws\.readyState === WS_OPEN && !sm\.notLoaded\) for \(const \[, s\] of activeSessions\) if \(addressableId\(s\) === backendSessionId && \(s\.host \|\| null\) === \(data\.host \|\| null\)\) BULK\.replied\(s\);/],   // View History (row B-422c: its not-loaded info rides the same send; its own address, on its machine)
      ['sessionId: subId', 3, null],   // NOT A DOOR: a subagent's own transcript — a virtual session no create marks
    ];
    const sendsCensus = (t) => {
      const sends = t.split('\n').map((ln, i) => [i + 1, ln]).filter(([, ln]) => /ws\.send\(/.test(ln) && /type: 'attached'|attachedFrameText\(/.test(ln));
      const unlisted = sends.filter(([, ln]) => !SENDS.some(([needle]) => ln.includes(needle))).map(([i]) => `src/ws-handler.js:${i}`);
      const wrong = SENDS.filter(([needle, want, door]) => sends.filter(([, ln]) => ln.includes(needle)).length !== want || (door && !door.test(t))).map(([needle]) => needle);
      return { n: sends.length, unlisted, wrong };
    };
    const ss = sendsCensus(wsS), ssPlanted = sendsCensus(wsS + "\n      ws.send(JSON.stringify({ type: 'attached', sessionId: planted }));");
    ok(!ss.unlisted.length && !ss.wrong.length && ss.n === 6 && ssPlanted.unlisted.length === 1 && /const bulkRead = BULK\.isBulk\(session\);/.test(wsS) && /\{ bulk: BULK\.isBulk\(session\) \}/.test(wsS),
      `THE SOCKET: its ${ss.n} history replies classified — a chat attach, a terminal's attach and View History consume right after their send, while the socket is open (a hang-up keeps the mark); the subagents' three are no door (${ss.wrong.join(', ') || 'each as pinned'}); CONTROL a planted reply named (${ssPlanted.unlisted.join()}); its first attach and task warm read through isBulk`, { ss, ssPlanted });
    const rsSrc = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8');
    ok((rsSrc.match(/gone: \(\) => !!\(req\.socket && req\.socket\.destroyed\)/g) || []).length === 2 && /result = await transcripts\.searchFull\(ref, fp, req\.query\.search\);/.test(rsSrc),
      'the routes (pinned by text): the history route and the todos route tell the door when the asker hung up; the plain full search awaits its answer (ALSO CURED: it spread a Promise and replied no match)');
  }
} catch (e) { fail++; console.log('  ✗ threw: ' + ((e && e.stack) || e)); }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
