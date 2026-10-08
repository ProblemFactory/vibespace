#!/usr/bin/env node
// RETIRING A MOVED CLAUDE.md LINE (lane claude-md-retire, B-00be, 2.369.239 — fast, in-process + the real CLI on scratch
// copies). The first lane that deletes or renames a file used to go red on test-architecture §82 with nothing but a hash:
// its file line is a MOVED row (lane claude-md-diet). scripts/claude-md-retire.mjs is the one way to drop it. This suite
// proves ① the fixture's rows / sha256 / lines regenerate BYTE-IDENTICAL from the diet's before-text (git show f835b0e58:
// CLAUDE.md; a depth-1 checkout SKIPs by name) and its `heads` are those rows' clear first 48 characters, ② the shared census
// answers the diet's own census on every zero-retirement shape, ③ the retire verb (by file path / by head text / ambiguous /
// not found / twice / --dry-run / a short why) on scratch copies, ④ §82's verdict over those copies: removed WITH a
// retirement = green, WITHOUT = red naming block + row + the head in words, a dead retirement / a short why / a bad date =
// red, a retirement + an edited row = green with the sha leg over the rows left.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { scratchDir } from './scratch.mjs';
import { BEFORE_REF, FIXTURE, beforeBlocks, beforeText, census, cut, formatFixture, judge, region, rowOf, sha256 } from './claude-md-retire.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname), SCRIPT = path.join(REPO, 'scripts/claude-md-retire.mjs');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const raw = fs.readFileSync(path.join(REPO, FIXTURE), 'utf8'), fx = JSON.parse(raw), K = fx.keyChars;
const blk = (name, f = fx) => f.blocks.find((b) => b.name === name);
const homeLines = (b, repo = REPO) => region(fs.readFileSync(path.join(repo, b.home), 'utf8'), b.region) || [];

console.log(`① the fixture regenerates from the diet's before-text (${BEFORE_REF}) and its clear heads align`);
const md = beforeText(REPO), before = md && Object.fromEntries(beforeBlocks(md).map((x) => [x.name, x.lines]));
if (!md) console.log(`  SKIP ① regeneration: ${BEFORE_REF} is not in this checkout (a depth-1 clone) — ② ③ ④ still run, the sha legs SKIP`);
else for (const b of fx.blocks) {
  const g = before[b.name] || [];
  ok(JSON.stringify(g.map((l) => rowOf(l, K))) === JSON.stringify(b.rows) && g.length === b.lines && sha256(g.join('\n')) === b.sha256,
    `${b.name}: ${g.length} non-blank lines cut from ${BEFORE_REF}:CLAUDE.md give the fixture's rows, line count and sha256 byte-identical`);
  ok(JSON.stringify(g.map((l) => cut(l, K))) === JSON.stringify(b.heads), `${b.name}: its ${b.heads.length} clear heads are those lines' first ${K} characters, same order`);
}
for (const b of fx.blocks) ok(b.heads.length === b.rows.length && b.heads.every((t, i) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 10) === b.rows[i].split(':')[0]),
  `${b.name}: every clear head hashes to its row's head (git-free)`);
ok(formatFixture(fx) === raw, 'the fixture is in the retire verb\'s own format (a rewrite changes only `retired`)');
ok(fx.blocks.every((b) => Array.isArray(b.retired) && b.retired.length === 0), 'the real tree retires nothing today (every block: retired [])');
// int238: a moved row widened at its tail is "edited since the move" — green under §82 (lanes browser-profile-clone and browser-disk-sample
// each widen one file-index row), so the real tree is judged as §82 judges it: nothing lost, every moved row verbatim or edited
for (const b of fx.blocks) { const j = judge(fx, b, homeLines(b)); ok(j.ok && j.census.lost === 0 && j.census.verbatim + j.census.edited === b.lines, `real §82 ④ ${j.line}`); }

console.log('② the shared census answers the diet\'s census on every zero-retirement shape');
// the diet's census82 as it shipped in 2.369.235 (test-architecture §82), kept here as the reference
const diet = (block, lines) => {
  const h = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10), c48 = (l) => [...l].slice(0, K).join('');
  const have = { head: new Map(), full: new Map() }, byFull = new Map();
  for (const l of lines.filter((x) => x.trim())) { const a = h(c48(l)), b = h(l); have.head.set(a, (have.head.get(a) || 0) + 1); have.full.set(b, (have.full.get(b) || 0) + 1); if (!byFull.has(b)) byFull.set(b, l); }
  const need = { head: new Map(), full: new Map() };
  for (const r of block.rows) { const [a, b] = r.split(':'); need.head.set(a, (need.head.get(a) || 0) + 1); need.full.set(b, (need.full.get(b) || 0) + 1); }
  let lost = 0, edited = 0;
  for (const [a, n] of need.head) lost += Math.max(0, n - (have.head.get(a) || 0));
  for (const [b, n] of need.full) edited += Math.max(0, n - (have.full.get(b) || 0));
  edited -= lost;
  const sha = edited || lost ? null : crypto.createHash('sha256').update(block.rows.map((r) => byFull.get(r.split(':')[1])).join('\n')).digest('hex');
  return { lost, edited, verbatim: block.rows.length - lost - edited, shaOk: sha === null ? null : sha === block.sha256 && block.rows.length === block.lines };
};
const bug = blk('bugfix-index'), fil = blk('file-index'), bl = homeLines(bug), fl = homeLines(fil);
const at = (ls, i) => ls.findIndex((l, k) => k > ls.length / 3 && l.startsWith(i));
const m1 = at(bl, '- '), m2 = at(fl, 'src/');
const shapes = [
  ['the real block', bug, bl], ['the real file index', fil, fl],
  ['a line dropped', bug, bl.filter((_, i) => i !== m1)], ['a head reworded', bug, bl.map((l, i) => (i === m1 ? 'X' + l.slice(1) : l))],
  ['a tail edited', bug, bl.map((l, i) => (i === m1 ? l + ' (edited)' : l))], ['a line doubled', fil, [...fl, fl[m2]]],
  ['two lines dropped + one edited', fil, fl.filter((_, i) => i !== m2 && i !== m2 + 1).map((l) => (l.startsWith('scripts/') ? l + ' x' : l))],
  ['an empty home', bug, []],
];
for (const [n, b, ls] of shapes) {
  const a = diet(b, ls), c = census(fx, b, ls);
  ok(a.lost === c.lost && a.edited === c.edited && a.verbatim === c.verbatim && a.shaOk === c.shaOk && c.retired === 0, `${n}: lost ${c.lost} · edited ${c.edited} · verbatim ${c.verbatim} · sha ${c.shaOk} — the same as the diet's`);
}

console.log('③ the retire verb on a scratch copy (fixture + both kb files; never the checkout)');
const S = scratchDir('claude-md-retire');
process.on('exit', () => fs.rmSync(S, { recursive: true, force: true }));
for (const f of [FIXTURE, 'docs/kb-file-structure.md', 'docs/kb-bugfix-invariants.md']) { fs.mkdirSync(path.dirname(path.join(S, f)), { recursive: true }); fs.copyFileSync(path.join(REPO, f), path.join(S, f)); }
const read = (f) => fs.readFileSync(path.join(S, f), 'utf8');
const snap = () => [FIXTURE, 'docs/kb-file-structure.md', 'docs/kb-bugfix-invariants.md'].map(read).join('\0');
const run = (...a) => { const r = spawnSync(process.execPath, [SCRIPT, ...a, '--repo', S], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const WHY = 'src/exit-shell.js removed by a test lane, its rows live in src/exit-run.js';
const fsBefore = read('docs/kb-file-structure.md').split('\n'), shellAt = fsBefore.findIndex((l) => l.startsWith('src/exit-shell.js — '));
let r = run('file-index', 'src/exit-shell.js', '--why', WHY);
const fx1 = JSON.parse(read(FIXTURE)), shellRow = fil.heads.findIndex((t) => t.startsWith('src/exit-shell.js — '));
ok(r.code === 0 && shellAt > 0 && read('docs/kb-file-structure.md') === fsBefore.filter((_, i) => i !== shellAt).join('\n'),
  `by file path: exit 0, docs/kb-file-structure.md lost exactly its line ${shellAt + 1} and nothing else — "${r.out.split('\n')[0]}"`);
const ret1 = blk('file-index', fx1).retired;
ok(ret1.length === 1 && ret1[0].head === fil.rows[shellRow].split(':')[0] && ret1[0].why === WHY && /^\d{4}-\d{2}-\d{2}$/.test(ret1[0].at)
  && formatFixture({ ...fx1, blocks: fx1.blocks.map((b) => ({ ...b, retired: [] })) }) === raw, 'the fixture gained ONE {head, why, at} retirement and is otherwise byte-identical');
let s0 = snap(); r = run('file-index', 'src/exit-shell.js', '--why', WHY);
ok(r.code === 0 && /already retired/.test(r.out) && snap() === s0, `twice: exit 0, "${r.out.trim().split('\n')[0].slice(0, 90)}…", nothing written`);
const incident = bl[m1], text30 = [...incident].slice(0, 30).join('');
r = run('docs/kb-bugfix-invariants.md', text30, '--why', 'the incident\'s file was renamed by a test lane', '--dry-run');
ok(r.code === 0 && /would retire bugfix-index row \d+/.test(r.out) && /would remove docs\/kb-bugfix-invariants\.md line \d+/.test(r.out) && snap() === s0, '--dry-run (by home file + head text): says what it would retire and remove, writes nothing');
r = run('bugfix-index', text30, '--why', 'the incident\'s file was renamed by a test lane');
ok(r.code === 0 && !read('docs/kb-bugfix-invariants.md').split('\n').includes(incident) && blk('bugfix-index', JSON.parse(read(FIXTURE))).retired.length === 1, `by head text ("${text30}"): retired, its line gone`);
const pfx = (() => { const hs = fil.heads; for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) { const p = [...hs[i]].slice(0, 22).join(''); if ([...p].length === 22 && hs[j].startsWith(p) && hs[i].split(':')[0] !== hs[j].split(':')[0] && !/^[`│├└ ]/.test(p)) return p; } return null; })();
s0 = snap(); r = run('file-index', pfx || 'none', '--why', WHY);
ok(!!pfx && r.code === 2 && /ambiguous/.test(r.out) && (r.out.match(/file-index row \d+:/g) || []).length >= 2 && snap() === s0, `ambiguous ("${pfx}"): refused with ${(r.out.match(/file-index row \d+:/g) || []).length} candidates listed, nothing written`);
r = run('file-index', 'src/no-such-file-ever.js', '--why', WHY);
ok(r.code === 2 && /not found/.test(r.out) && snap() === s0, 'not found: refused, nothing written');
r = run('file-index', 'src/exit-runs.js', '--why', 'gone');
ok(r.code === 2 && /--why must name/.test(r.out) && snap() === s0, 'a why under 12 characters: refused, nothing written');
r = run('no-such-block', 'src/exit-runs.js', '--why', WHY);
ok(r.code === 2 && /no block or home file/.test(r.out) && /file-index/.test(r.out) && snap() === s0, 'an unknown block: refused naming the four blocks');

console.log('④ §82\'s verdict over the scratch copies');
const v = (f, name, lines, b4 = before) => judge(f, blk(name, f), lines ?? homeLines(blk(name, f), S), { before: b4 && b4[name] });
const fxS = JSON.parse(read(FIXTURE));
const a = ['file-index', 'bugfix-index'].map((n) => v(fxS, n));
ok(a.every((j) => j.ok && j.census.retired === 1 && j.census.lost === 0 && (md ? j.census.shaOk === true : j.census.shaOk === null)),
  `(a) removed WITH a retirement ⇒ green — ${a[0].line}`);
const sFl = homeLines(blk('file-index', fxS), S), gone = sFl.findIndex((l, i) => i > sFl.length / 2 && l.startsWith('src/'));
const goneRow = fil.heads.findIndex((t) => t === cut(sFl[gone], K));
const b = v(fxS, 'file-index', sFl.filter((_, i) => i !== gone));
ok(!b.ok && b.census.lost === 1 && b.said.includes(`lost: file-index row ${goneRow + 1}: "${fil.heads[goneRow]}"`), `(b) removed WITHOUT ⇒ red, in words: ${b.said[0]}`);
const withRet = (name, extra) => ({ ...fxS, blocks: fxS.blocks.map((x) => (x.name === name ? { ...x, retired: [...x.retired, ...extra] } : x)) });
const live = sFl.findIndex((l, i) => i > gone && l.startsWith('src/')), liveHead = fil.rows[fil.heads.findIndex((t) => t === cut(sFl[live], K))].split(':')[0];
const c = v(withRet('file-index', [{ head: liveHead, why: 'a control: this line was not removed', at: '2026-10-08' }]), 'file-index');
ok(!c.ok && c.said.some((x) => x.startsWith('dead retirement: file-index row ')), `(c) a retirement whose line still exists ⇒ red: ${c.said.find((x) => x.startsWith('dead'))}`);
const d = v(withRet('file-index', [{ head: fil.rows[gone > -1 ? fil.heads.findIndex((t) => t === cut(sFl[gone], K)) : 0].split(':')[0], why: 'short', at: '2026-10-08' }]), 'file-index', sFl.filter((_, i) => i !== gone));
ok(!d.ok && d.census.lost === 0 && d.said.some((x) => /why "short" is under 12 characters/.test(x)), `(d) a why of 5 characters ⇒ red: ${d.said[0]}`);
const d2 = v(withRet('file-index', [{ head: fil.rows[goneRow].split(':')[0], why: 'a control: the date is malformed', at: '2026-02-30' }]), 'file-index', sFl.filter((_, i) => i !== gone));
ok(!d2.ok && d2.said.some((x) => /at "2026-02-30" is not a YYYY-MM-DD date/.test(x)), '(d) an `at` of 2026-02-30 ⇒ red');
const eL = sFl.map((l, i) => (i === live ? l + ' (edited)' : l)), e = v(fxS, 'file-index', eL);
ok(e.ok && e.census.edited === a[0].census.edited + 1 && e.census.retired === 1 && (md ? e.census.shaOk === true && /verbatim rows left re-assembled hash like/.test(e.line) : /SKIP the before-text sha/.test(e.line)),
  `(e) a retirement + one EDITED other row ⇒ green — ${e.line}`);
const e2 = v(fxS, 'file-index', eL, null);
ok(e2.ok && e2.census.shaOk === null && /SKIP the before-text sha/.test(e2.line), '(e) without the before-text (a depth-1 checkout) the sha leg says SKIP; the per-row leg still holds');
if (md) {
  const bad = { ...before, 'file-index': before['file-index'].map((l, i) => (i === shellRow + 3 ? l + '!' : l)) };
  const e3 = v(fxS, 'file-index', eL, bad);
  ok(!e3.ok && e3.census.shaOk === false && /SHA MISMATCH/.test(e3.line), '(e) control: a before-text that does not regenerate the fixture rows ⇒ SHA MISMATCH, never a silent pass');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
