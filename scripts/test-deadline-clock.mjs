#!/usr/bin/env node
// test-deadline-clock — B-ba7b (in-process, fast): A DEADLINE OF N s SHOWS N, NEVER N+1, AT +0 — WHATEVER THE CLOCK SAYS.
// The heavy test-wake-approve-card read «还剩 61 秒» (61 s left) for a 60 s ask once in 5 runs: ITS OWN two clock reads
// (noteHubClock's caller's Date.now() and its own default `at`) put «now» a millisecond before the card's stamp — cured in
// batch 29 with a held clock. On the product's road the hub's `now` is noted before any draw (setTodos), so «now» does not
// fall before a card's stamp; a device clock that steps back between the note and a tick, or the 'device' clock (an older
// hub sends no `now`), can. HARDENING (src/foryou-actions.js deadlineOf): «left» never exceeds the deadline's whole length —
// a card before its own stamp shows its whole length, unmoving, until the stamp passes. Legs: deadlineOf over fixed clocks
// at offsets from −1 ms to −30 s for asks of 10 s to an hour; the row's line with hubNow() a millisecond before the stamp;
// the warning and the end unchanged. RED CONTROL: a patched copy of foryou-actions.js without the clamp reads N+1.
// Run: node scripts/test-deadline-clock.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const FA = require(path.join(REPO, 'src/foryou-actions.js'));
const { ok, report } = checker();   // the tree's one assertion helper (scripts/lib/check.mjs: the condition first, a boolean)
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
// the words as the page's own formatter fills them (English keys, {name} placeholders)
const en = (k, p) => String(k).replace(/\{(\w+)\}/g, (m0, x) => (p && p[x] != null ? String(p[x]) : m0));
const T0 = 1900000000000;
const ask = (secs, x = {}) => ({ id: 'ut-dl', status: 'open', kind: 'action', createdAt: T0, expiresAt: T0 + secs * 1000, action: { type: 'vault-run-ask' }, ...x });

console.log('① deadlineOf: at +0 an ask of N s shows N — at every offset that puts «now» before the card\'s own stamp');
{
  const SIZES = [10, 30, 60, 90, 3600], OFFS = [0, -1, -5, -999, -1000, -1001, -30000];
  const bad = [];
  for (const n of SIZES) {
    const at0 = FA.deadlineOf(ask(n), { t: en, now: T0 });
    for (const off of OFFS) {
      const d = FA.deadlineOf(ask(n), { t: en, now: T0 + off });
      if (!d || d.state !== 'live' || d.left > d.total || d.text !== at0.text || d.short !== at0.short) bad.push({ n, off, left: d && d.left, total: d && d.total, text: d && d.text });
    }
  }
  const one = FA.deadlineOf(ask(60), { t: en, now: T0 - 1 });
  ok(!!(!bad.length && one && one.text === 'valid for 60 sec · 60 sec left by the server\'s clock' && one.left === 60000),
    `asks of ${SIZES.join(' / ')} s at offsets ${OFFS.join(' / ')} ms: every one reads its own length at +0 («${one && one.text}» a millisecond early), «left» never past the whole length`, bad.slice(0, 4));
  const d50 = FA.deadlineOf(ask(60), { t: en, now: T0 + 50000 }), d61 = FA.deadlineOf(ask(60), { t: en, now: T0 + 61000 }), d59 = FA.deadlineOf(ask(60), { t: en, now: T0 + 999 });
  ok(!!(d59.text === 'valid for 60 sec · 60 sec left by the server\'s clock' && d50.warn) && /10 sec left/.test(d50.text) && d61.state === 'due' && d61.text === FA.deadlineOf(ask(60), { t: en, now: T0 + 60000 }).text,
    `the count past +0 is unchanged: +0.999 s «60 sec left», +50 s the warning «10 sec left», +61 s «${d61.text}»`, { d59: d59.text, d50: d50.text, d61: d61.text });
}

console.log('② the line the tray and the chat card draw, with hubNow() a millisecond before the card\'s stamp (an order setTodos never takes; a device clock stepping back gives it)');
{
  const ROW = await import(pathToFileURL(path.join(REPO, 'src/lib/user-todos-row.js')).href);
  const realNow = Date.now;
  let line = null;
  try {
    Date.now = () => T0 + 1;                       // the render's instant
    ROW.noteHubClock(T0, T0 + 2);                  // the snapshot's «now» noted a millisecond after the render's instant: offset −2
    line = ROW.deadlineHtml(ask(60), en);
  } finally { Date.now = realNow; }
  // (the line is HTML: its apostrophe arrives escaped, &#39; — read back to the words the person sees)
  const words = ((/<div class="ut-deadline[^"]*"[^>]*>([^<]*)</.exec(line || '') || [])[1] || '').replace(/&#39;/g, '\'') || null;
  ok(words === 'valid for 60 sec · 60 sec left by the server\'s clock', `hubNow() a millisecond before the card's stamp: the row draws «${words}», never 61`, line);
}

console.log('③ RED CONTROL: deadlineOf without the clamp (a patched copy) reads N+1 at the same offset');
{
  const src = fs.readFileSync(path.join(REPO, 'src/foryou-actions.js'), 'utf8');
  const CLAMP = 'const left = Number.isFinite(at) ? (total > 0 ? Math.min(at - now, total) : at - now) : 0;';
  const OLD = 'const left = Number.isFinite(at) ? at - now : 0;';
  // the plant proves itself first: the clamp is in the tree, and the copy holds the old line in its place
  const planted = src.includes(CLAMP) ? editAnchor(src, CLAMP, OLD, "src/foryou-actions.js") : null;
  ok(!!planted && planted !== src && planted.includes(OLD) && !planted.includes(CLAMP), 'the control\'s plant is where it claims: the clamp line is in src/foryou-actions.js and the copy holds the unclamped line instead', { clampInTree: src.includes(CLAMP) });
  const p = planted ? mutantCopies('deadline-no-clamp', REPO).write('src/foryou-actions.js', planted) : null;
  const M = p ? require(p) : null;
  const d = M ? M.deadlineOf(ask(60), { t: en, now: T0 - 1 }) : null;
  ok(!!d && d.text === 'valid for 60 sec · 61 sec left by the server\'s clock', `without the clamp a 60 s ask a millisecond early reads «${d && d.text}» — RED by the law above`, d);
}

report();
