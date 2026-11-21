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
  'past the tail bound (its seam)': big('big.jsonl', Math.ceil(codex.JSONL_TAIL_BYTES / 1048576) + 2),
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
    ok(!!a && !!b && isDeepStrictEqual(b.entry, a.entry) && b.mode === a.mode && b.bytes === a.bytes && s1.gone === s0.gone,
      `${what}: the paged entry is DEEP-EQUAL to the one-shot's (${a && a.entry.messages.length} records, partial ${a && a.entry.partial}, span ${a && a.entry.spanStart}–${a && a.entry.spanEnd}, mode ${a && a.mode}) in ${pages} page(s)`,
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
  const oneShotSrc = anchored(ssSrc, '    const r = await warmPaged(fp);', "    const r = await require('./adapters/codex').readJsonlTailAsync(fp, { dropSubagent: true });", 'warm-one-shot');
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
  const noLine = anchored(ssSrc, "  const run = _warmLine.then(() => readJsonlBoundedParsedPagedAsync(fp, { entry: true, dropSubagent: true, slot: 'warm' }));", "  const run = readJsonlBoundedParsedPagedAsync(fp, { entry: true, dropSubagent: true, slot: 'warm' });", 'warm-no-line');
  const g4r = await two(require(M.write('src/session-store.js', noLine, 'warm-no-line')));
  ok(g4r.gone > 0, `RED: the line taken away — the second warm's first page cuts the first's snapshot (${g4r.gone} gone)`);
} catch (e) { fail++; console.log('  ✗ threw: ' + ((e && e.stack) || e)); }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
