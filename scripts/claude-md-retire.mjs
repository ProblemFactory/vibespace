#!/usr/bin/env node
// RETIRE A MOVED CLAUDE.md LINE (lane claude-md-retire, B-00be, 2.369.239) — the ONE way a lane that deletes or renames a
// file drops that file's index line without going red on test-architecture §82. Lane claude-md-diet moved the per-file /
// per-incident lines out of CLAUDE.md f835b0e58 into the kb INDEX heads; scripts/fixtures/claude-md-moved.json keeps every
// moved row (a head hash : a whole-line hash), its clear first 48 characters (`heads`, same order as `rows`) and, per block,
// the rows lanes retired (`retired: [{head, why, at}]`). A bare deletion of a moved line is LOST (red); a retired one is not.
//   node scripts/claude-md-retire.mjs <block | home file> "<the line's first ≥ 20 characters | the file path it names>" --why "…"
//     finds the row by its head (ambiguous / not found ⇒ refused, with the candidates), appends {head, why, at} to its block's
//     `retired` (already retired ⇒ says so, exit 0) and removes that ONE line from the kb INDEX head (an atomic rewrite).
//   --dry-run     prints what would change and writes nothing
//   --repo <dir>  another checkout (test-claude-md-retire runs it on scratch copies)
// A rename = retire the old line + write the new line yourself (a new line is not in the fixture: §82 holds MOVED rows only).
// The module half (region / census / faults / judge / beforeBlocks) IS §82's census; test-claude-md-retire shares it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BEFORE_REF = 'f835b0e58';   // the CLAUDE.md the diet cut the blocks from (the fixture's `about` names it)
export const FIXTURE = 'scripts/fixtures/claude-md-moved.json';
export const WHY_MIN = 12;
const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const h10 = (s) => sha256(s).slice(0, 10);
export const cut = (l, k = 48) => [...l].slice(0, k).join('');
export const rowOf = (l, k = 48) => h10(cut(l, k)) + ':' + h10(l);
export const formatFixture = (fx) => JSON.stringify(fx, null, 1) + '\n';
const bump = (m, k, d = 1) => m.set(k, (m.get(k) || 0) + d);
const isDay = (s) => { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };

// a region = its `## ` heading line up to the next `## ` heading outside a code fence; regionAt keeps the line indexes
export const regionAt = (text, head) => {
  const lines = text.split('\n'), at = lines.findIndex((l) => l.startsWith(head));
  if (at < 0) return null;
  const idx = []; let fence = false;
  for (let i = at + 1; i < lines.length; i++) { const l = lines[i]; if (l.startsWith('```')) fence = !fence; if (!fence && /^## /.test(l)) break; idx.push(i); }
  return { lines, idx };
};
export const region = (text, head) => { const r = regionAt(text, head); return r && r.idx.map((i) => r.lines[i]); };

// the diet's cut of the before-text (its tools/move.py): each block = the body between two headings outside code fences;
// its rows are the body's NON-BLANK lines. test-claude-md-retire proves this regenerates the fixture byte-identical.
export const BLOCKS = [
  ['file-index', 'docs/kb-file-structure.md', '## INDEX', '## File Structure (index', '## Developer Guide: Where to Find'],
  ['task-map', 'docs/kb-file-structure.md', '## TASK → FILE MAP', '### Common Tasks → File Location Map', '### Architecture Patterns — INDEX'],
  ['server-key-functions', 'docs/kb-file-structure.md', '## SERVER-SIDE KEY FUNCTIONS', '### Server-Side Key Functions', '## Key Design Decisions'],
  ['bugfix-index', 'docs/kb-bugfix-invariants.md', '## INDEX', '### Bug Fixes Applied — INDEX', null],
];
export const beforeBlocks = (md) => {
  const L = md.split('\n');
  const at = (prefix) => { let fence = false; const hits = []; L.forEach((l, i) => { if (l.startsWith('```')) fence = !fence; else if (!fence && l.startsWith(prefix)) hits.push(i); }); return hits.length === 1 ? hits[0] : -1; };
  return BLOCKS.map(([name, home, reg, from, to]) => {
    const a = at(from), b = to ? at(to) : L.length;
    return a < 0 || b < a ? { name, home, region: reg, lines: null } : { name, home, region: reg, lines: L.slice(a + 1, b).filter((l) => l.trim()) };
  });
};
// the before-text itself — null when this checkout does not hold BEFORE_REF (a depth-1 clone): every caller says SKIP by name
export const beforeText = (repo = REPO) => {
  const r = spawnSync('git', ['-C', repo, 'show', `${BEFORE_REF}:CLAUDE.md`], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return r.status === 0 && r.stdout ? r.stdout : null;
};

// §82 ④ per block: each NON-RETIRED row is verbatim (its whole line is in the home), edited (only its head is) or LOST; a
// retired row is neither. Rows meet the home's non-blank lines in fixture order, each line used once. The sha leg: with no
// retirement it is the diet's — no edit, no loss ⇒ the block re-assembled hashes to the fixture sha256 (that stored sha stays
// the zero-retirement proof); with retirements nothing new is stored: the verbatim rows left, re-assembled in fixture order,
// must hash like the same rows of the before-text (opts.before = that block's before lines; absent ⇒ shaOk null, said SKIP).
export const census = (fx, block, lines, { before } = {}) => {
  const K = fx.keyChars, rows = block.rows.map((r) => r.split(':')), heads = block.heads || [];
  const headLeft = new Map(), fullLeft = new Map(), byFull = new Map();
  for (const l of lines.filter((x) => x.trim())) { const a = h10(cut(l, K)), b = h10(l); bump(headLeft, a); bump(fullLeft, b); if (!byFull.has(b)) byFull.set(b, l); }
  const state = rows.map(() => ''), left = new Map();
  for (const r of block.retired || []) bump(left, r.head);
  // a retirement takes a row of its head whose whole line is gone first (two rows can share a head: two ``` fences)
  const order = rows.map((_, i) => i).sort((x, y) => (byFull.has(rows[x][1]) ? 1 : 0) - (byFull.has(rows[y][1]) ? 1 : 0) || x - y);
  for (const i of order) if (left.get(rows[i][0]) > 0) { state[i] = 'retired'; bump(left, rows[i][0], -1); }
  rows.forEach(([a, b], i) => { if (!state[i] && fullLeft.get(b) > 0) { state[i] = 'verbatim'; bump(fullLeft, b, -1); bump(headLeft, a, -1); } });
  rows.forEach(([a], i) => { if (state[i]) return; if (headLeft.get(a) > 0) { state[i] = 'edited'; bump(headLeft, a, -1); } else state[i] = 'lost'; });
  const n = (s) => state.filter((x) => x === s).length, retired = n('retired'), edited = n('edited'), lost = n('lost');
  const lostRows = state.flatMap((s, i) => (s === 'lost' ? [{ row: i + 1, head: heads[i] }] : []));
  let shaOk = null;
  if (!retired) {
    if (!edited && !lost) shaOk = sha256(rows.map(([, b]) => byFull.get(b)).join('\n')) === block.sha256 && rows.length === block.lines;
  } else if (!lost && before) {
    const keep = (_, i) => state[i] === 'verbatim';
    shaOk = before.length === rows.length && before.every((l, i) => rowOf(l, K) === block.rows[i])
      && sha256(rows.filter(keep).map(([, b]) => byFull.get(b)).join('\n')) === sha256(before.filter(keep).join('\n'));
  }
  return { lost, edited, retired, verbatim: n('verbatim'), shaOk, lostRows, state };
};

// the `retired` list's own faults, red by name: a retirement naming no row, more retirements of a head than rows carry it,
// a DEAD retirement (its line is still in the home: more lines carry the head than the non-retired rows need), a `why`
// under 12 characters, an `at` that is not a YYYY-MM-DD date
export const faults = (fx, block, lines) => {
  const K = fx.keyChars, heads = block.heads || [], out = [], rowsBy = new Map(), have = new Map(), ret = new Map();
  for (const r of block.rows) bump(rowsBy, r.split(':')[0]);
  for (const l of lines.filter((x) => x.trim())) bump(have, h10(cut(l, K)));
  const label = (a) => { const i = block.rows.findIndex((x) => x.startsWith(a + ':')); return `${block.name} row ${i + 1}: "${heads[i] ?? '?'}"`; };
  for (const r of block.retired || []) {
    if (!r || typeof r.head !== 'string' || !rowsBy.has(r.head)) { out.push(`retirement ${JSON.stringify(r && r.head)} names no row of ${block.name}`); continue; }
    bump(ret, r.head);
    if (typeof r.why !== 'string' || [...r.why.trim()].length < WHY_MIN) out.push(`retirement of ${label(r.head)}: why ${JSON.stringify(r.why)} is under ${WHY_MIN} characters — name the deletion / rename`);
    if (!isDay(r.at)) out.push(`retirement of ${label(r.head)}: at ${JSON.stringify(r.at)} is not a YYYY-MM-DD date`);
  }
  for (const [a, k] of ret) {
    const need = rowsBy.get(a);
    if (k > need) out.push(`${k} retirements of ${label(a)} but ${need} row(s) carry that head`);
    else if ((have.get(a) || 0) > need - k) out.push(`dead retirement: ${label(a)} — its line is still in ${block.home} (retire = remove the line: node scripts/claude-md-retire.mjs)`);
  }
  return out;
};

// §82 ④'s verdict for one block, in words (test-architecture and test-claude-md-retire print the same lines)
export const judge = (fx, block, lines, opts = {}) => {
  const c = census(fx, block, lines, opts), f = faults(fx, block, lines);
  const sha = c.retired
    ? (c.lost ? '' : c.shaOk === null ? ` · SKIP the before-text sha (${BEFORE_REF} is not in this checkout); the fixture sha256 stays the zero-retirement proof`
      : c.shaOk ? ` · the ${c.verbatim} verbatim rows left re-assembled hash like the same rows of ${BEFORE_REF} (the fixture sha256 stays the zero-retirement proof)` : ' · SHA MISMATCH against the before-text')
    : c.shaOk === null ? '' : c.shaOk ? ' · the block re-assembled hashes to the fixture sha256' : ' · SHA MISMATCH';
  const said = [...c.lostRows.map((r) => `lost: ${block.name} row ${r.row}: "${r.head ?? '(no clear head)'}"`), ...f];
  return { ok: c.lost === 0 && c.shaOk !== false && f.length === 0, census: c, said,
    line: `${block.name}: ${block.lines} moved lines — ${c.verbatim} verbatim, ${c.edited} edited since the move, ${c.retired} retired, ${c.lost} LOST in ${block.home}${sha}` };
};

// ── the retire verb ──
export const blocksFor = (fx, where) => { const w = String(where || '').replace(/^\.\//, ''); return fx.blocks.filter((b) => b.name === w || b.home === w || b.home === 'docs/' + w); };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = (head, p) => new RegExp(`(?:^|[\\s\`'"(\\[|*])${esc(p)}(?=$|[\\s\`'")\\]|*,:;])`).test(head);
export const findRows = (fx, blocks, what) => {
  const w = String(what || '').trim(), byText = [...w].length >= 20, byPath = /[/.]/.test(w) && !/\s/.test(w), out = [];
  for (const b of blocks) (b.heads || []).forEach((t, i) => { if ((byText && t.startsWith(cut(w, fx.keyChars))) || (byPath && names(t, w))) out.push({ block: b, i, head: t, a: b.rows[i].split(':')[0] }); });
  return { usable: byText || byPath, rows: [...new Map(out.map((c) => [c.block.name + ':' + c.a, c])).values()] };
};
const writeAtomic = (file, text) => { const tmp = `${file}.retire-${process.pid}.tmp`; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); };

export const retire = ({ repo = REPO, where, what, why, at = new Date().toISOString().slice(0, 10), dryRun = false }) => {
  const fxFile = path.join(repo, FIXTURE), fx = JSON.parse(fs.readFileSync(fxFile, 'utf8')), K = fx.keyChars;
  const blocks = blocksFor(fx, where);
  if (!blocks.length) return { code: 2, say: [`refused: no block or home file "${where}" — ${fx.blocks.map((b) => `${b.name} (${b.home} "${b.region}")`).join(', ')}`] };
  if ([...String(why || '').trim()].length < WHY_MIN) return { code: 2, say: [`refused: --why must name the deletion / rename in ≥ ${WHY_MIN} characters (e.g. "src/foo.js removed by lane X, its rows live in src/bar.js")`] };
  const { usable, rows } = findRows(fx, blocks, what);
  if (!usable) return { code: 2, say: [`refused: give the line's first ≥ 20 characters or the file path it names (got ${JSON.stringify(what)})`] };
  if (!rows.length) return { code: 2, say: [`refused: not found — no moved row of ${blocks.map((b) => b.name).join(' / ')} starts with or names ${JSON.stringify(what)}`] };
  if (rows.length > 1) return { code: 2, say: [`refused: ambiguous — ${rows.length} moved rows match ${JSON.stringify(what)}; give more of the line:`, ...rows.map((c) => `  ${c.block.name} row ${c.i + 1}: "${c.head}"`)] };
  const [c] = rows, b = c.block, label = `${b.name} row ${c.i + 1}: "${c.head}"`;
  const homeFile = path.join(repo, b.home), text = fs.readFileSync(homeFile, 'utf8'), reg = regionAt(text, b.region);
  if (!reg) return { code: 2, say: [`refused: ${b.home} has no "${b.region}" head`] };
  const hits = reg.idx.filter((i) => reg.lines[i].trim() && h10(cut(reg.lines[i], K)) === c.a);
  const need = b.rows.filter((r) => r.startsWith(c.a + ':')).length, done = (b.retired || []).filter((r) => r.head === c.a);
  const surplus = hits.length - (need - done.length - 1);
  if (done.length && (done.length >= need || surplus <= 0)) return { code: 0, say: [`already retired: ${label} (${done[0].at}: ${done[0].why}) — nothing to do`] };
  let drop = null;
  if (surplus === 1) {
    const exact = hits.filter((i) => h10(reg.lines[i]) === b.rows[c.i].split(':')[1]);
    drop = hits.length === 1 ? hits[0] : exact.length === 1 ? exact[0] : null;
  }
  if (surplus > 0 && drop === null) return { code: 2, say: [`refused: ${hits.length} lines of ${b.home} carry the head of ${label} (lines ${hits.map((i) => i + 1).join(', ')}) — delete the right one, then run this again to record it`] };
  const say = [`${dryRun ? 'would retire' : 'retired'} ${label}`, `  why: ${why.trim()} · at: ${at}`,
    drop === null ? `  its line is already gone from ${b.home} — the retirement is recorded only` : `  ${dryRun ? 'would remove' : 'removed'} ${b.home} line ${drop + 1}`];
  if (dryRun) return { code: 0, say: [...say, '(dry run: nothing written)'] };
  (b.retired ||= []).push({ head: c.a, why: why.trim(), at });
  writeAtomic(fxFile, formatFixture(fx));
  if (drop !== null) writeAtomic(homeFile, reg.lines.filter((_, i) => i !== drop).join('\n'));
  return { code: 0, say };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), take = (f) => { const i = argv.indexOf(f); return i < 0 ? undefined : argv.splice(i, 2)[1]; };
  const dryRun = argv.includes('--dry-run'); if (dryRun) argv.splice(argv.indexOf('--dry-run'), 1);
  const why = take('--why'), repo = take('--repo');
  if (argv.length !== 2 || argv.some((a) => a.startsWith('--'))) {
    console.error('usage: node scripts/claude-md-retire.mjs <block | home file> "<the line\'s first ≥ 20 characters | the file path it names>" --why "…" [--dry-run] [--repo <dir>]');
    process.exit(2);
  }
  const r = retire({ repo: repo ? path.resolve(repo) : REPO, where: argv[0], what: argv[1], why, dryRun });
  (r.code ? console.error : console.log)(r.say.join('\n'));
  process.exit(r.code);
}
