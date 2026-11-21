#!/usr/bin/env node
// THE PHONE SURFACE CENSUS AS THE TREE STATES IT (lane bl-phone-ui, 主开发 r1198 unit 1 — «at 390 px no control outgrows its
// surface»; the drawn half is test-phone-surface-fit-chrome). FAST, PURE (acorn). scripts/phone-surface-census.mjs derives
// the list from the tree — every createModalShell / showContextMenu / createPopover call in src/, the page's own dialogs,
// the Settings view's categories and the four named windows — and holds the tables:
//   ① EVERY SURFACE HAS ONE ROW: an OPENER (one call in the page) or an EXCUSE (what opening it would take, in words) —
//     a surface with neither, or with an opener and words of its own, is red; the counts printed by kind
//   ② NO ROW OUTLIVES ITS SURFACE: an opener or words for a key the tree no longer holds, file words no surface takes
//   ③ THE EXCUSES GROW ONLY BY NAME: every surface excused by its FILE's words is listed in EXCUSED_BY_FILE_WORDS by name and
//     every listed name still is (a new surface in an excused file is red by its key: an opener, or words of its own)
//   ④ THE RATCHET'S ROWS: a surface with an opener, zh / en, the laws L1–L3, each a table of element NAMES with counts > 0
//   ⑤ THE VERDICT: judge() — a new red, a cured red the table still lists, a held red, a clean surface; ratchetOf() writes
//     back exactly the reds it was given
//   ⑥ THE MEASURE AND THE OPENERS PARSE: MEASURE_SOURCE is a function of (root, declared); every opener is an async body;
//     every module an opener names is a file of the tree
//     and every opener's TARGET exists (an export of its module, a method of the app, its list, its nav)
// RED CONTROLS (each a planted copy, judged by the same check): a new createModalShell site with no row · an opener taken
// out · a file-worded excuse not listed by name · a listed name that is opened now · a ratchet row for a surface with no
// opener · a ratchet higher than the run (a cure the table still lists) · an opener for a key that is gone · an opener whose
// function was renamed away.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './phone-surface-census.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok(cond, name): the condition goes FIRST and is a boolean (got a ${typeof c})`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '\n      ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : '')); } };
const tables = { OPENERS: C.OPENERS, EXCUSES: C.EXCUSES, EXCUSE_BY_FILE: C.EXCUSE_BY_FILE, RATCHET: C.RATCHET, EXCUSED_BY_FILE_WORDS: C.EXCUSED_BY_FILE_WORDS };

console.log('── ① every surface has one row ──');
const list = C.deriveSurfaces(repo);
const by = {}; for (const s of list) by[s.kind] = (by[s.kind] || 0) + 1;
const real = C.checkTables(list, tables);
console.log(`  (the derived list: ${list.length} surfaces — ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ')}; ${real.opened} with an opener, ${real.excused} excused)`);
ok(by.dialog >= 100 && by.menu >= 80 && by.popover >= 20 && by.view >= 20, 'the walk found the families (≥ 100 dialogs, ≥ 80 menus, ≥ 20 popovers, ≥ 20 views)', by);
ok(list.some((s) => s.key === 'dialog:agents-dialog-overlay') && list.some((s) => s.key === 'dialog:static:dialog-new-session') && list.some((s) => s.key === 'view:settings:Mobile'),
  'the list holds the three old rows\' surfaces by name (the Agents dialog, the page\'s new-conversation dialog, the Settings view\'s categories)');
const noRow = real.problems.filter((p) => p.kind === 'no-row' || p.kind === 'both');
ok(noRow.length === 0, 'every surface has exactly one row (an opener, or words of its own or its file\'s)', noRow.slice(0, 12));
console.log('── ② no row outlives its surface ──');
const gone = real.problems.filter((p) => p.kind === 'gone' || p.kind === 'stale-file');
ok(gone.length === 0, 'every opener and every key\'s words name a surface of the tree; every file\'s words are taken', gone.slice(0, 12));
console.log('── ③ the excuses grow only by name ──');
const named = real.problems.filter((p) => p.kind === 'new-by-file' || p.kind === 'stale-excuse');
console.log(`  (excused: ${real.excused} — ${C.EXCUSED_BY_FILE_WORDS.length} by their file's words, listed by name in EXCUSED_BY_FILE_WORDS; ${Object.keys(C.EXCUSES).length} by words of their own — a jump there is said here)`);
ok(named.length === 0, 'every surface excused by its file\'s words is listed BY NAME, and every listed name is still excused that way (a new one takes an opener or words of its own)', named.slice(0, 8));
console.log('── ④ the ratchet\'s rows ──');
const rat = real.problems.filter((p) => p.kind === 'ratchet');
ok(rat.length === 0, `every ratchet row names a surface with an opener, zh / en, L1–L3, each a table of element names with whole counts > 0 (${Object.keys(C.RATCHET).length} rows)`, rat.slice(0, 12));
ok(real.problems.length === 0, 'the tables are whole against the tree (no problem of any kind)', real.problems.slice(0, 6));

console.log('── ⑤ the verdict ──');
const N = (L1 = {}, L2 = {}, L3 = {}) => ({ L1, L2, L3 });
const run = [{ key: 'a', lang: 'zh', names: N({}, { 'div.x': 2 }) }, { key: 'b', lang: 'zh', names: N({}, {}, { 'div.y': 1 }) }, { key: 'c', lang: 'en', names: N({ 'div.dialog': 1 }) },
  { key: 'd', lang: 'zh', names: N() }, { key: 'e', lang: 'zh', names: N({}, { 'span.new': 1 }) }];
const table = { a: { zh: { L2: { 'div.x': 2 } } }, b: { zh: { L3: { 'div.y': 2 } } }, d: { zh: {} }, e: { zh: { L2: { 'span.old': 1 } } } };
const v = C.judge(run, table), at = (k, l) => v.find((x) => x.key === k && x.law === l)?.verdict;
ok(at('a', 'L2') === 'held' && at('b', 'L3') === 'cured' && at('c', 'L1') === 'new' && at('d', 'L2') === 'clean' && at('a', 'L1') === 'clean',
  'judge BY NAME: the same names as the row are held, a listed name fewer or gone is cured (the table still lists it), a name not in the table is new, none is clean', v);
ok(at('e', 'L2') === 'new' && v.find((x) => x.key === 'e' && x.law === 'L2').added.join() === 'span.new' && v.find((x) => x.key === 'e' && x.law === 'L2').gone.join() === 'span.old',
  'judge BY NAME (round w8jjldn9f (1)): one cut element traded for another at the same count is NEW by the new name — a count read it «held»', v.filter((x) => x.key === 'e'));
const back = C.ratchetOf(run);
ok(JSON.stringify(back) === JSON.stringify({ a: { zh: { L2: { 'div.x': 2 } } }, b: { zh: { L3: { 'div.y': 1 } } }, c: { en: { L1: { 'div.dialog': 1 } } }, e: { zh: { L2: { 'span.new': 1 } } } }), 'ratchetOf writes back exactly the reds it was given, by name (a clean surface has no row)', back);
const nm = C.namesOf({ L1: [], L2: [{ k: 'div.a' }, { k: 'div.a' }, { k: 'span.b' }], L3: [{ k: 'page' }] });
ok(JSON.stringify(nm) === JSON.stringify({ L1: {}, L2: { 'div.a': 2, 'span.b': 1 }, L3: { page: 1 } }), 'namesOf counts a measure\'s reds by their structural names', nm);

console.log('── ⑥ the measure and the openers parse ──');
let measureOk = false; try { measureOk = typeof new Function('return ' + C.MEASURE_SOURCE)() === 'function'; } catch (e) { measureOk = String(e); }
ok(measureOk === true && ['L1', 'L2', 'L3', 'L4'].every((l) => C.MEASURE_SOURCE.includes(l + ':') || C.MEASURE_SOURCE.includes(l + ' ') || C.MEASURE_SOURCE.includes(l + ',')), 'MEASURE_SOURCE is a function and names L1 L2 L3 L4', measureOk);
const AsyncFn = Object.getPrototypeOf(async () => {}).constructor;
const bad = [];
let draws = 0;
for (const s of list) for (const d of C.drawsOf(s)) { draws++; try { new AsyncFn('app', 'M', 'FX', 'anchor', d.open); if (d.close) new AsyncFn('app', 'M', 'FX', 'anchor', d.close); } catch (e) { bad.push(d.key + ': ' + e.message); } }
ok(bad.length === 0, `every draw's opener (and its close) is an async body that parses (${draws} draws)`, bad.slice(0, 6));
const targets = C.openerTargetProblems(list, repo);
ok(targets.length === 0, 'every opener\'s target exists: each M[\'file\'].name an export of that file, each app / sidebar / nav method defined in src/lib', targets.slice(0, 8));
const mods = C.openerModules(list), missing = mods.filter((m) => !fs.existsSync(path.join(repo, m)));
ok(mods.length > 10 && missing.length === 0, `every module an opener names is a file of the tree (${mods.length})`, missing);

console.log('── RED CONTROLS (planted copies, the same check) ──');
const planted = 'export function plantedFitDialog() { return createModalShell({ id: \'planted-fit-dialog\', kind: \'decision\', title: \'x\' }); }\n';
const withPlant = C.deriveSurfaces(repo, { files: [...C.srcFiles(repo), 'src/lib/zz-planted-fit.js'], read: (f) => (f === 'src/lib/zz-planted-fit.js' ? planted : fs.readFileSync(path.join(repo, f), 'utf8')) });
const p1 = C.checkTables(withPlant, tables).problems;
ok(withPlant.some((s) => s.key === 'dialog:planted-fit-dialog') && p1.some((p) => p.kind === 'no-row' && p.key === 'dialog:planted-fit-dialog'), 'CONTROL: a new createModalShell site with no row is red by its key', p1.slice(0, 3));
const firstOpen = Object.keys(C.OPENERS)[0], noOpen = { ...tables, OPENERS: Object.fromEntries(Object.entries(C.OPENERS).filter(([k]) => k !== firstOpen)) };
const p2 = C.checkTables(list, noOpen).problems;
ok(p2.some((p) => p.key === firstOpen && (p.kind === 'no-row' || p.kind === 'new-by-file')), `CONTROL: an opener taken out (${firstOpen}) is red by its key (no row, or a new file-worded excuse)`, p2.slice(0, 3));
const fileKey = C.EXCUSED_BY_FILE_WORDS[0], p3 = C.checkTables(list, { ...tables, EXCUSED_BY_FILE_WORDS: C.EXCUSED_BY_FILE_WORDS.slice(1) }).problems;
ok(p3.some((p) => p.kind === 'new-by-file' && p.key === fileKey), `CONTROL: a surface excused only by its file's words and not listed (${fileKey}) is red BY NAME — a new one in an excused file`, p3.slice(0, 2));
const p3b = C.checkTables(list, { ...tables, EXCUSED_BY_FILE_WORDS: [...C.EXCUSED_BY_FILE_WORDS, Object.keys(C.OPENERS)[0]] }).problems;
ok(p3b.some((p) => p.kind === 'stale-excuse' && p.key === Object.keys(C.OPENERS)[0]), 'CONTROL: a listed name that is opened now (or gone) is red — the list only holds what its file\'s words excuse', p3b.slice(0, 2));
const p3c = C.checkTables(list, { ...tables, EXCUSED_BY_FILE_WORDS: [...C.EXCUSED_BY_FILE_WORDS, 'menu:planted:one-more'] }).problems;
ok(p3c.some((p) => p.kind === 'list-grew'), 'CONTROL: a list one name longer than its max is red (list-grew) — the list may not grow by an edit alone', p3c.filter((p) => p.kind === 'list-grew'));
const p3d = C.checkTables(list, { ...tables, EXCUSED_BY_FILE_WORDS_MAX: C.EXCUSED_BY_FILE_WORDS_MAX + 1 }).problems;
ok(p3d.some((p) => p.kind === 'list-max'), 'CONTROL: a max one higher than the list is red (list-max) — the max only falls, to the list', p3d.filter((p) => p.kind === 'list-max'));
const excusedKey = list.find((s) => !C.openerOf(s)).key;
const p4 = C.checkTables(list, { ...tables, RATCHET: { [excusedKey]: { zh: { L2: { 'div.x': 1 } } } } }).problems;
ok(p4.some((p) => p.kind === 'ratchet' && p.key === excusedKey), `CONTROL: a ratchet row for a surface with no opener (${excusedKey}) is red`, p4.slice(0, 2));
const p5 = C.judge([{ key: 'x', lang: 'zh', names: N() }], { x: { zh: { L2: { 'div.x': 1 } } } });
ok(p5.some((x) => x.verdict === 'cured'), 'CONTROL: a ratchet higher than the run reads «cured» (the browser suite reds it until the row is lowered)', p5);
const p6 = C.checkTables(list, { ...tables, OPENERS: { ...C.OPENERS, 'dialog:no-such-dialog-anywhere': { open: 'null' } } }).problems;
ok(p6.some((p) => p.kind === 'gone' && p.key === 'dialog:no-such-dialog-anywhere'), 'CONTROL: an opener for a key that is gone is red', p6.slice(0, 2));
const firstM = Object.keys(C.OPENERS).find((k) => /M\['/.test(C.OPENERS[k].open)), renamed = C.OPENERS[firstM].open.replace(/(M\['[\w-]+'\]\.)(\w+)/, '$1$2RenamedAway');
const saved = C.OPENERS[firstM]; C.OPENERS[firstM] = { ...saved, open: renamed };
const p7 = C.openerTargetProblems(list, repo); C.OPENERS[firstM] = saved;
ok(p7.some((x) => x.key === firstM && /RenamedAway/.test(x.target)), `CONTROL: an opener whose function was renamed away (${firstM}) is red by its target`, p7.slice(0, 2));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
