#!/usr/bin/env node
// test-pronoun-census — THE REPOSITORY'S PRONOUN RULE AS A RED TEST (the coordinator's r2517, lane paced-wake-retry, 2026-11-22).
// The standing rule: no gendered pronoun of a person in the tree — the person, the owner, they. Until this suite it was held only
// by a hand search over each pick's ADDED lines, and the tree was far from it (about 1 950 lines in about 250 files). This suite is
// a CENSUS WITH A RATCHET, not a rewording sweep:
//   - it reads git's own list of the tracked files of src, scripts, docs, data/bin and the root's *.md (ONE child: `git ls-files`,
//     run as scripts/pid-identity-census.mjs runs it — `-C <repo> ls-files -z`, the sanitized env of scripts/git-env.mjs), and
//     counts, file by file, the LINES that carry one of the eight words (the subject and object forms, the possessive-only form,
//     the reflexives) as a WHOLE word, any case. The words are joined from pieces below, so this file holds none;
//   - a file whose first 8 000 bytes hold a NUL is binary and not read (git grep's own rule, so the table restated by
//     `git grep -c -i -w` agrees line for line); scripts/fixtures/pronoun-census.json (the table) is not read: its keys are paths;
//   - a file ABOVE its row is RED, by name, with its lines; a file NOT in the table stands at ZERO; a file BELOW its row is a
//     printed note, never a red (a table every lane had to touch would meet in every pick): the table is restated in one sweep
//     now and then (the restate's command is in the table's own «restated» field);
//   - controls: a planted line in a scratch copy of a counted file, and a new file with one such word, are each red by name;
//   - a CODE IDENTIFIER of that spelling is no word of prose and is not counted (the coordinator's r2569: a module held in a constant of that name):
//     in a .js / .mjs / .cjs file holding a hit, acorn's tokenizer names each identifier token of the spelling, and one DECLARED (after
//     const / let / var / function, or inside an import declaration) or DIRECTLY FOLLOWED by a dot, an opening bracket or an assignment
//     is skipped; a word in a comment, a string or a document always counts (a file acorn cannot read counts every match);
//   - `node scripts/test-pronoun-census.mjs --restate` prints the table's counts by this very reading (the sweep's tool).
// No network; no child but the one list. Fast: one read of each file, one regex pass, a hit line skipped to its end.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gitEnvFrom } from './git-env.mjs';
import { checker } from './lib/check.mjs';
import * as acorn from 'acorn';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const t0 = process.hrtime.bigint();
const TABLE_REL = 'scripts/fixtures/pronoun-census.json';
const SCOPE = ['src', 'scripts', 'docs', 'data/bin', ':(glob)*.md'];
// the eight words, joined from pieces (a whole word here would count this file)
const WORDS = [['h', 'e'], ['h', 'im'], ['h', 'is'], ['sh', 'e'], ['h', 'er'], ['h', 'ers'], ['h', 'imself'], ['h', 'erself']].map((p) => p.join(''));
const WORD_RE = new RegExp('\\b(?:' + WORDS.join('|') + ')\\b', 'gi');
const BINARY_HEAD = 8000;   // git's buffer_is_binary: a NUL in the first 8 000 bytes

const CODE_EXT = /\.(?:js|mjs|cjs)$/;
const DECLARERS = new Set(['const', 'let', 'var', 'function']);
const T = acorn.tokTypes, AFTER = new Set([T.dot, T.questionDot, T.parenL, T.bracketL, T.eq, T.assign]);
/** r2569: the offsets of the CODE IDENTIFIERS of the words' spelling in a JavaScript text — declared (after const / let / var /
 *  function, or inside an import declaration) or directly followed by a dot, an opening bracket or an assignment. A text acorn cannot
 *  tokenize as a module nor as a script yields none: every match then counts. */
function codeIdentifiers(text) {
  for (const sourceType of ['module', 'script']) {
    try {
      const toks = [...acorn.tokenizer(text, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowImportExportEverywhere: true, allowAwaitOutsideFunction: true })];
      const out = new Set();
      let inImport = false;
      for (let k = 0; k < toks.length; k++) {
        const t = toks[k], prev = toks[k - 1], next = toks[k + 1];
        if (t.type === T._import && !(next && (next.type === T.parenL || next.type === T.dot))) { inImport = true; continue; }
        if (inImport && (t.type === T.semi || (t.type === T.name && t.value === 'from'))) { inImport = false; continue; }
        if (t.type !== T.name || !WORDS.includes(String(t.value).toLowerCase())) continue;
        if (inImport || (prev && DECLARERS.has(prev.value) && (prev.type === T.name || prev.type.keyword)) || (next && AFTER.has(next.type))) out.add(t.start);
      }
      return out;
    } catch { /* try the other source type; neither ⇒ none */ }
  }
  return new Set();
}
/** The lines (1-based) of `text` that carry one of the words as a whole word: one pass, a hit line skipped to its end; a match at an
 *  offset in `skip` (a code identifier) does not count, and the scan goes on along its line. */
function hitLines(text, skip = null) {
  const out = [];
  let line = 0, from = 0;
  WORD_RE.lastIndex = 0;
  for (let m; (m = WORD_RE.exec(text));) {
    if (skip && skip.has(m.index)) continue;
    for (let i; (i = text.indexOf('\n', from)) !== -1 && i < m.index;) { line++; from = i + 1; }
    out.push(line + 1);
    const end = text.indexOf('\n', m.index);
    if (end === -1) break;
    WORD_RE.lastIndex = end;
  }
  return out;
}
/** Each listed file under `root`: → Map path → its hit lines (a missing or binary file is not read). */
function census(root, files) {
  const found = new Map();
  let read = 0, binary = 0, idents = 0;
  for (const rel of files) {
    if (rel === TABLE_REL) continue;
    let buf;
    try { buf = fs.readFileSync(path.join(root, rel)); } catch { continue; }   // a tracked file absent from the work tree is not read
    if (buf.subarray(0, BINARY_HEAD).includes(0)) { binary++; continue; }
    read++;
    const text = buf.toString('utf8');
    let lines = hitLines(text);
    if (lines.length && CODE_EXT.test(rel)) { const skip = codeIdentifiers(text); if (skip.size) { lines = hitLines(text, skip); idents += skip.size; } }
    if (lines.length) found.set(rel, lines);
  }
  return { found, read, binary, idents };
}
/** The ratchet: → { over: [{ f, n, row, lines }], below: [{ f, n, row }] } — a file not in `counts` stands at zero. */
function judge(counts, found) {
  const over = [], below = [];
  for (const [f, lines] of found) { const row = counts[f] || 0; if (lines.length > row) over.push({ f, n: lines.length, row, lines }); }
  for (const [f, row] of Object.entries(counts)) { const n = (found.get(f) || []).length; if (n < row) below.push({ f, n, row }); }
  return { over, below };
}
const lineText = (root, f, ln) => { try { return fs.readFileSync(path.join(root, f), 'utf8').split('\n')[ln - 1].trim().slice(0, 140); } catch { return ''; } };

const table = JSON.parse(fs.readFileSync(path.join(REPO, TABLE_REL), 'utf8'));
const counts = table.counts || {};
const files = execFileSync('git', ['-C', REPO, 'ls-files', '-z', '--', ...SCOPE], { encoding: 'utf8', env: gitEnvFrom(process.env), maxBuffer: 1 << 26 }).split('\0').filter(Boolean);
const { found, read, binary, idents } = census(REPO, files);
if (process.argv.includes('--restate')) {   // the sweep's tool: the counts by this very reading, for the table's «counts»
  console.log(JSON.stringify(Object.fromEntries([...found].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([f, l]) => [f, l.length])), null, 1));
  process.exit(0);
}
const { over, below } = judge(counts, found);
const total = [...found.values()].reduce((s, l) => s + l.length, 0), rowsTotal = Object.values(counts).reduce((s, n) => s + n, 0);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`pronoun census: ${files.length} tracked files listed, ${read} read, ${binary} binary, ${idents} code identifiers of the spelling skipped; ${total} lines in ${found.size} files carry one of the words (the table: ${rowsTotal} lines in ${Object.keys(counts).length} rows) — ${Math.round(ms)} ms`);
console.log('  the ten files with the most: ' + [...found].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1)).slice(0, 10).map(([f, l]) => `${f} ${l.length}`).join(' · '));
for (const b of below) console.log(`  note: ${b.f} — ${b.n} below its row ${b.row} (the next restate lowers it)`);

ok(files.length > 3000 && read > 2500 && Object.keys(counts).length > 100, `the census reads git's own list of tracked files (${files.length} listed, ${read} read, ${binary} binary) and a table of ${Object.keys(counts).length} rows`);
for (const o of over) {
  const shown = o.lines.slice(0, 8).map((ln) => `${ln}: «${lineText(REPO, o.f, ln)}»`).join(' · ');
  ok(false, `${o.f}: ${o.n} lines carry a gendered pronoun against its row of ${o.row} — write the person, the owner or they. Lines MOVED here from another file (a suite split): move their count from the old file's row to this file's row in ${TABLE_REL}`, shown + (o.lines.length > 8 ? ` · and ${o.lines.length - 8} more` : ''));
}
ok(over.length === 0, `no file is above its row (${found.size} files carry ${total} lines; ${below.length} below their rows, each a note)`);

// CONTROLS, each red by name: a planted line in a scratch copy of a counted file, and a file the table does not name
{
  const { scratch } = await import('./scratch.mjs');
  const dir = scratch('pronoun-census'); fs.mkdirSync(dir, { recursive: true });
  try {
    const pick = Object.keys(counts).find((f) => found.has(f) && found.get(f).length === counts[f]);
    const plantedRel = pick, freshRel = 'scripts/zz-planted-pronoun.mjs';
    const src = fs.readFileSync(path.join(REPO, pick), 'utf8');
    for (const [rel, text] of [[plantedRel, src + (src.endsWith('\n') ? '' : '\n') + '// planted: ' + WORDS[2] + ' line\n'], [freshRel, '// planted: ' + WORDS[3] + ' wrote this\n']]) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text);
    }
    const c = judge(counts, census(dir, [plantedRel, freshRel]).found);
    const planted = c.over.find((o) => o.f === plantedRel), fresh = c.over.find((o) => o.f === freshRel);
    ok(!!planted && planted.n === counts[pick] + 1 && planted.lines.at(-1) === src.split('\n').length + (src.endsWith('\n') ? 0 : 1), `RED CONTROL — a line planted in a scratch copy of ${pick} is red by name (${planted ? planted.n + ' lines against its row of ' + planted.row + ', the planted one ' + planted.lines.at(-1) : 'NOT FOUND'})`);
    ok(!!fresh && fresh.row === 0 && fresh.n === 1 && fresh.lines[0] === 1, `RED CONTROL — a file the table does not name, with one such word, is red by name (${fresh ? fresh.f + ': 1 line against zero' : 'NOT FOUND'})`);
    // r2569: a planted CODE IDENTIFIER of the spelling is NOT red; the same letters in a comment ARE
    const identRel = 'scripts/zz-planted-identifier.mjs', commentRel = 'scripts/zz-planted-comment.mjs', U = WORDS[0].toUpperCase();
    fs.writeFileSync(path.join(dir, identRel), `const ${U} = require('node:path');\n${U}.join('a', 'b');\nlet ${WORDS[2]} = 1; ${WORDS[2]} = 2;\nimport { ${WORDS[1]} } from 'x';\nconsole.log(${U}[0]);\n`);
    fs.writeFileSync(path.join(dir, commentRel), `const x = 1;   // ${U} wrote this\nconst y = '${WORDS[2]} tab';\n`);
    const ic = judge(counts, census(dir, [identRel, commentRel]).found);
    const id = ic.over.find((o) => o.f === identRel), cm = ic.over.find((o) => o.f === commentRel);
    ok(!id, `a planted CODE IDENTIFIER of the spelling (declared by const / let / import, followed by a dot, a bracket or an assignment) is not counted${id ? ' — counted ' + id.n + ' lines: ' + id.lines.join(', ') : ''}`);
    ok(!!cm && cm.n === 2 && cm.row === 0, `the same letters in a COMMENT and in a STRING count (${cm ? cm.n + ' lines against zero' : 'NOT FOUND'})`);
    const words = WORDS.map((w, i) => [i % 2 ? w.toUpperCase() : w, hitLines(`a ${i % 2 ? w.toUpperCase() : w} b`).length, hitLines(`a${w}b ${w}x x${w}`).length]);
    ok(words.every(([, n, m]) => n === 1 && m === 0), 'each of the eight words is found whole in any case, and never inside another word', words.map(([w, n, m]) => `${w}:${n}/${m}`).join(' '));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
report();
