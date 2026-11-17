#!/usr/bin/env node
// test-plain-words — lane ui-plain-words (the owner 2026-11-13: «你看看这个界面是不是应该优化下，最好走查一下所有界面找到可优化的
// 布局，提示文本等»; the UI walk's patterns «internal names, commands, variables and paths shown to a person» and «a wall of
// explanation before the action»). THE CENSUS of the face / fold law, derived from the tree, PURE (no build, no browser):
//   ① THE SHAPES: every human-visible key (scripts/i18n-extract.mjs extractKeys — t / tr / tc / i18nKey, index.html) whose English
//      or zh text shows an environment variable, an agent CLI command, a --flag, a file path, a setting key or an internal id is
//      either PROVEN to sit in a fold (every source occurrence is inside techFold( / techFoldHtml( / a settings `details: [` / an
//      item's `fold: [`) or is a row of the PRINTED, SHRINK-ONLY baseline (scripts/fixtures/plain-words-baseline.json). A new
//      instance is RED by name; a baseline row that no longer holds (gone, cured, folded) is RED until its row is removed.
//   ② THE WALL: a settings row whose description runs past WALL_CHARS with no `details:` is a baseline row, shrink-only too.
//   ③ THE ONE DOOR: a «Technical details» summary or a `data-fold="tech"` built OUTSIDE src/lib/plain-words.js counts per file
//      against the baseline (a new file, or more than the baseline's count, is RED).
//   ④ THE CARRIERS: settings-ui draws `details:` through techFold; the For-you row draws `i18n.fold` through techFoldHtml; the
//      store KEEPS `i18n.fold` (a real UserTodoManager round trip); the record (Copy) says the fold lines.
//   ⑤ THE BASE LINK COLOUR: style.css holds `:where(a) { color: var(--accent); }` (a theme variable, never a literal).
//   ⑥ CONTROLS: a planted key per shape is RED by name; a fold occurrence moved out of its fold is RED; a door built outside is
//      counted; a baseline row that shrank is RED.
// `node scripts/test-plain-words.mjs --print-baseline` prints the baseline the tree holds now (to shrink it after a cure).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { extractKeys, dictEntries } from './i18n-extract.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const BASELINE_PATH = path.join(REPO, 'scripts/fixtures/plain-words-baseline.json');
const WALL_CHARS = 240;
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// ── the shapes (each a named rule; the CLI names are DERIVED from the tracked data/bin) ──
const binNames = execFileSync('git', ['-C', REPO, 'ls-files', 'data/bin'], { encoding: 'utf8' }).split('\n').map((f) => path.basename(f)).filter((f) => /^vibespace-[a-z-]+$/.test(f));   // the TRACKED CLIs (§96: a census lists data/bin through git ls-files)
const SHAPES = {
  env: /\b[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}\b/,
  cli: new RegExp(`\\b(?:claude|codex|opencode|agy)\\s+(?:-p\\b|setup-token\\b|serve\\b|auth\\s+\\w|agents\\b|mcp\\s+\\w)|\\b(?:${binNames.map((n) => n.replace(/-/g, '\\-')).join('|')})\\s+[a-z][a-z-]*\\b`),
  flag: /(?:^|[\s(«“"'`])--[a-z][a-z0-9-]{2,}/,
  path: /(?:^|[\s(«“"'`])(?:~\/|data\/[\w.-]+\/|docs\/[\w.-]+|\/(?:usr|opt|var|etc|home)\/)|\b[\w-]+\.json\b/,
  id: /vault:\/\/|\bbk-[0-9a-f]{6,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/,
};
let settingKeys = [];
const settingKeyRe = () => (settingKeys.length ? new RegExp(`(?:^|[\\s(«“"'\`])(?:${settingKeys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[\\s)»”"'\`.,;:])`) : /$^/);

/** → the shapes a text shows (sorted names). */
function shapesOf(text, keyRe) {
  const s = String(text || '');
  const out = Object.entries(SHAPES).filter(([, re]) => re.test(s)).map(([n]) => n);
  if (keyRe.test(s)) out.push('setting-key');
  return out.sort();
}

// ── the fold proof: an occurrence of a key's literal is inside techFold( / techFoldHtml( / details: [ / fold: [ ──
const MARKERS = ['techFold(', 'techFoldHtml(', 'details: [', 'fold: ['];
/** the index of the bracket that closes the one opened at `open` (strings and comments skipped), or -1. */
function closeOf(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
/** is the occurrence at `at` inside a fold call / field? */
function inFold(src, at) {
  let best = -1, mk = '';
  for (const m of MARKERS) { const i = src.lastIndexOf(m, at); if (i > best && at - i < 6000) { best = i; mk = m; } }
  if (best < 0) return false;
  const open = best + mk.length - 1;
  const close = closeOf(src, open);
  return close > at;
}
/** every source occurrence of a key (its first 48 chars, in the quote forms a literal takes) → [{file, at, fold}] */
function occurrences(files, key) {
  const head = key.slice(0, 48);
  const forms = [...new Set([head, head.replace(/'/g, "\\'"), head.replace(/"/g, '\\"')])];
  const out = [];
  for (const [rel, src] of files) for (const f of forms) { let i = src.indexOf(f); while (i >= 0) { out.push({ file: rel, at: i, fold: inFold(src, i) }); i = src.indexOf(f, i + 1); } }
  return out;
}

// ── the tree ──
function srcFiles() {
  const out = new Map();
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (/\.js$/.test(e.name) && !/^i18n-(zh|ja)\.js$/.test(e.name) && e.name !== 'build-version.js') out.set(r, fs.readFileSync(path.join(REPO, r), 'utf8')); } };
  walk('src');
  return out;
}
const zh = new Map(dictEntries(read('src/lib/i18n-zh.js')).map((e) => [e.key, e.value]));
const DOOR_RE = /t\('Technical details'\)|dataset\.fold\s*=\s*'tech'|data-fold="tech"/g;

async function measure() {
  const S = await import(path.join(REPO, 'src/lib/settings-schema.js'));
  settingKeys = Object.keys(S.SETTINGS_SCHEMA).filter((k) => k.includes('.'));
  const keyRe = settingKeyRe();
  const files = srcFiles();
  const keys = [...extractKeys(REPO)];
  const hits = {};   // shape → [key]
  for (const k of keys) for (const sh of new Set([...shapesOf(k, keyRe), ...shapesOf(zh.get(k), keyRe)])) (hits[sh] ||= []).push(k);
  const wall = Object.entries(S.SETTINGS_SCHEMA).filter(([, row]) => String(row.description || '').length > WALL_CHARS && !row.details).map(([p]) => p).sort();
  const doors = {};
  for (const [rel, src] of files) { if (rel === 'src/lib/plain-words.js') continue; const n = (src.match(DOOR_RE) || []).length; if (n) doors[rel] = n; }
  return { files, keys: new Set(keys), hits, wall, doors, keyRe };
}

const M = await measure();
if (process.argv.includes('--print-baseline')) {
  const base = { about: 'scripts/test-plain-words.mjs — the PRINTED, SHRINK-ONLY debt of the face / fold law (lane ui-plain-words). Remove a row when it is cured; never add one.', shapes: {}, wall: M.wall, doors: M.doors };
  for (const [sh, ks] of Object.entries(M.hits)) {
    const debt = ks.filter((k) => { const occ = occurrences(M.files, k); return !(occ.length && occ.every((o) => o.fold)); }).sort();
    if (debt.length) base.shapes[sh] = debt;
  }
  console.log(JSON.stringify(base, null, 1));
  process.exit(0);
}
const B = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

console.log('① the shapes: every visible key that shows an internal name is folded, or a printed debt row');
{
  const fresh = [], shrank = [];
  for (const [sh, ks] of Object.entries(M.hits)) {
    const debt = new Set((B.shapes && B.shapes[sh]) || []);
    for (const k of ks) {
      if (debt.has(k)) continue;
      const occ = occurrences(M.files, k);
      if (!(occ.length && occ.every((o) => o.fold))) fresh.push(`${sh}: «${k.slice(0, 90)}» (${occ.filter((o) => !o.fold).map((o) => o.file).slice(0, 3).join(', ') || 'no source occurrence found'})`);
    }
  }
  for (const [sh, ks] of Object.entries(B.shapes || {})) for (const k of ks) if (!M.keys.has(k) || !(M.hits[sh] || []).includes(k)) shrank.push(`${sh}: «${k.slice(0, 90)}»`);
  const debtN = Object.values(B.shapes || {}).reduce((n, l) => n + l.length, 0);
  console.log(`    (the debt printed: ${Object.entries(B.shapes || {}).map(([s, l]) => `${s} ${l.length}`).join(' · ')}; ${debtN} rows)`);
  ok(fresh.length === 0, 'no NEW visible key shows an env variable, a CLI command, a --flag, a path, a setting key or an id outside a fold', fresh.slice(0, 12));
  ok(shrank.length === 0, 'every baseline row still holds (a row that was cured or folded is removed from scripts/fixtures/plain-words-baseline.json — the debt only shrinks)', shrank.slice(0, 12));
}

console.log('② the wall: a settings description past ' + WALL_CHARS + ' characters has a `details:` fold, or is a printed debt row');
{
  const base = new Set(B.wall || []);
  const fresh = M.wall.filter((p) => !base.has(p)), shrank = [...base].filter((p) => !M.wall.includes(p));
  console.log(`    (the debt printed: ${base.size} rows)`);
  ok(fresh.length === 0, 'no NEW settings row puts a wall before its control', fresh);
  ok(shrank.length === 0, 'every wall row in the baseline is still a wall (a cured one leaves the baseline)', shrank);
  const S = await import(path.join(REPO, 'src/lib/settings-schema.js'));
  const q = S.SETTINGS_SCHEMA['accounts.onDemandQuotaRefresh'];
  ok(q && Array.isArray(q.details) && q.details.length === 1 && /claude -p \/usage/.test(q.details[0]) && q.description.length <= WALL_CHARS && !/claude -p|statusline|dead-reckoner/.test(q.description) && q.options.length === 4,
    'settings-4: the quota refresh row\'s face is plain (no command, no statusline, no dead-reckoner), the mechanics are its `details:`, the four choices kept', q && { d: q.description.length, opts: q.options.length });
}

console.log('③ the one door: a «Technical details» fold is built by src/lib/plain-words.js');
{
  const base = B.doors || {};
  const fresh = Object.entries(M.doors).filter(([f, n]) => n > (base[f] || 0)).map(([f, n]) => `${f}: ${n} > ${base[f] || 0}`);
  const shrank = Object.entries(base).filter(([f, n]) => (M.doors[f] || 0) < n).map(([f, n]) => `${f}: ${M.doors[f] || 0} < ${n}`);
  console.log(`    (the debt printed: ${Object.keys(base).length} files, ${Object.values(base).reduce((a, b) => a + b, 0)} hand-built folds)`);
  ok(fresh.length === 0, 'no NEW hand-built «Technical details» / data-fold="tech" outside plain-words.js (use techFold / techFoldHtml)', fresh);
  ok(shrank.length === 0, 'a file whose hand-built folds moved onto the door has its baseline count lowered (the debt only shrinks)', shrank);
  const pw = read('src/lib/plain-words.js');
  ok(/export function techFold\(/.test(pw) && /export function techFoldHtml\(/.test(pw) && /data-fold="tech"/.test(pw) && /d\.dataset\.fold = 'tech'/.test(pw) && /escHtml\(l\)/.test(pw) && /p\.textContent = l/.test(pw), 'the door: techFold (DOM, textContent) and techFoldHtml (string, every line escaped), both data-fold="tech"');
}

console.log('④ the carriers: a settings row\'s `details:` and a For-you item\'s `i18n.fold` draw through the door');
{
  ok(/techFold\(schema\.details, \{ summary: 'details' \}\)/.test(read('src/lib/settings-ui.js')), 'settings-ui draws a row\'s `details:` through techFold (summary «详情»)');
  ok(/techFoldHtml\(ctx\.foldOf \? ctx\.foldOf\(i\) : \[\]/.test(read('src/lib/user-todos-row.js')), 'the For-you row (and the chat card it draws) puts `i18n.fold` under techFoldHtml');
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plain-words-'));
  try {
    const m = new UserTodoManager({ dataDir: dir, now: () => 1_790_000_000_000 });
    m.add('s1', { origin: 'channels', text: 'x', i18n: { text: { key: 'A {n}', params: { n: 1 } }, detail: [{ key: 'face' }], fold: [{ key: 'how it works' }, { key: 'when it ends {d}', params: { d: 7 } }] } });
    const it = (m.snapshot().open || [])[0];
    ok(it && it.i18n && Array.isArray(it.i18n.fold) && it.i18n.fold.length === 2 && it.i18n.fold[1].params.d === 7, 'the store KEEPS `i18n.fold` (a real UserTodoManager round trip)', it && it.i18n);
    const L = await import(path.join(REPO, 'src/lib/user-todos-layout.js'));
    const said = (l) => l.key.replace(/\{(\w+)\}/g, (x, k) => (l.params && l.params[k] != null ? String(l.params[k]) : x));
    ok(JSON.stringify(L.itemRecordLinesOf(it, said)) === JSON.stringify(['face', 'how it works', 'when it ends 7']) && JSON.stringify(L.itemDetailLinesOf(it, said)) === JSON.stringify(['face']), 'the face is the detail; the RECORD (Copy) says the fold lines too');
    try { m.add('s1', { origin: 'channels', text: 'y', i18n: { text: { key: 'B' }, fold: 'not lines' } }); ok(false, 'CONTROL: a fold that is not an array of lines is refused'); } catch (e) { ok(/i18n\.fold must be an array/.test(e.message), 'CONTROL: a fold that is not an array of lines is refused by name', e.message); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const ca = read('src/server/channels-access.js');
  ok(/fold: \[\n\s*\.\.\.\(own \|\| waiting\.length \?/.test(ca) && /Deny changes nothing/.test(ca.slice(ca.indexOf('fold: ['), ca.indexOf('fold: [') + 900)), 'chat-cards-5: the wake ask\'s mechanics ride `i18n.fold` (the zero count said only when non-zero)');
}

console.log('⑤ the base link colour: a link no surface styles reads in the theme\'s accent, never the browser\'s blue');
{
  const css = read('public/style.css');
  ok(/:where\(a\) \{ color: var\(--accent\); \}/.test(css) && /:where\(a\):hover \{ color: var\(--accent-hover\); \}/.test(css), 'style.css holds the zero-specificity base link rule, in theme variables');
}

console.log('⑥ controls: a planted instance of each rule is RED by name');
{
  const kr = M.keyRe;
  const planted = { env: 'Set VIBESPACE_FAKE_SWITCH to turn it on', cli: 'Run claude setup-token on that machine', flag: 'Start it with --no-sandbox', path: 'Edit data/fake/thing.json by hand', id: 'It is vault://store/key', 'setting-key': `Turn on ${settingKeys[0]} first` };
  for (const [sh, txt] of Object.entries(planted)) ok(shapesOf(txt, kr).includes(sh), `CONTROL ${sh}: «${txt}» is seen`, shapesOf(txt, kr));
  ok(shapesOf('Open the file you saved, then press Save.', kr).length === 0, 'CONTROL: a plain sentence shows no shape');
  const inside = "const f = techFold([t('Run claude setup-token there')], { mono: true });", outside = "el.textContent = t('Run claude setup-token there');";
  ok(inFold(inside, inside.indexOf('Run claude')) && !inFold(outside, outside.indexOf('Run claude')), 'CONTROL: the same key inside techFold( is folded, assigned to textContent is not');
  const nested = "schema = { description: t('x'), details: [t('Uses data/x/y.json'), t('more')], };";
  ok(inFold(nested, nested.indexOf('Uses data')) && !inFold(nested, nested.indexOf("t('x')")), 'CONTROL: a settings `details: [` array folds its lines, the description beside it does not');
  const planted2 = "const d = el('details'); d.dataset.fold = 'tech'; d.append(el('summary', null, t('Technical details')));";
  ok((planted2.match(DOOR_RE) || []).length === 2, 'CONTROL: a hand-built fold (dataset.fold + the summary) is counted by the door leg');
}

// ── pick 2 (M2a): names, not ids — what the machine's activity says ──
// every op of src/device-acts.js's TABLE (and its family) has a WORD in src/lib/device-acts-dialog.js ACT_WORDS, each word with
// its zh AND ja row (the walk's «tcp-connect» / «fs-op:read» / «sysinfo» drawn raw); who asked is a name, never «某人 · local»
{
  console.log('names, not ids (the device activity, nameOrGone())');
  const DA = require(path.join(REPO, 'src/device-acts.js'));
  const dlg = fs.readFileSync(path.join(REPO, 'src/lib/device-acts-dialog.js'), 'utf8');
  const tbl = dlg.slice(dlg.indexOf('const ACT_WORDS = {'), dlg.indexOf('};', dlg.indexOf('const ACT_WORDS = {')) + 2);
  const words = Object.fromEntries([...tbl.matchAll(/'([a-z][\w:-]*)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
  const unworded = Object.keys(DA.TABLE).filter((op) => !words[op] && !words[op.split(':')[0]]);
  ok(Object.keys(words).length >= 40 && !unworded.length, `every device op has a word (${Object.keys(DA.TABLE).length} ops in the TABLE, ${new Set(Object.values(words)).size} words)`, unworded);
  const Z = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, J = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const unrowed = [...new Set(Object.values(words))].filter((w) => typeof Z[w] !== 'string' || typeof J[w] !== 'string');
  ok(!unrowed.length, 'every op word has its zh AND ja row', unrowed);
  ok(/el\('span', 'device-acts-op', actWords\(r\.op\)\)/.test(dlg) && /whoText\(r\.by, nameOf\)/.test(dlg) && !/\$\{name\} · \$\{id\}/.test(dlg),
    'the row draws the op\'s word and who asked by name (the raw op and subject stay in the opened line)');
  ok(/\$\{r\.by \|\| t\('nobody named'\)\} · \$\{r\.op \|\| ''\}/.test(dlg), 'the opened line keeps the raw subject and op (an engineer reads them there)');
  // RED control: the old row — `${kind word} · ${raw id}` and the raw op
  const oldWho = (by) => { const k = by.split(':')[0]; return `${k === 'human' ? 'a person' : 'a conversation'} · ${by.slice(k.length + 1)}`; };
  ok(oldWho('human:local') === 'a person · local' && oldWho('agent:walk-sess-1').endsWith('walk-sess-1'), 'RED control: the old who-asked text prints the raw subject id');
  // nameOrGone(): a name, else the kind's words — never the id (the source: plain-words.js)
  const pw = fs.readFileSync(path.join(REPO, 'src/lib/plain-words.js'), 'utf8');
  ok(/export function nameOrGone\(kind, id, name\)/.test(pw) && /if \(n && n !== String\(id \?\? ''\)\.trim\(\)\) return n;/.test(pw) && /return \(GONE\[kind\] \|\| GONE\.conversation\)\(\);/.test(pw),
    'nameOrGone(kind, id, name): the name, else generic words — a name equal to the id is no name, and the id is never returned');
  const users = ['src/lib/jobs-panel.js', 'src/lib/path-field.js', 'src/lib/device-acts-dialog.js'].filter((f) => /\bnameOrGone\(/.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
  ok(users.length === 3, 'nameOrGone() is read by the jobs panel (a gone conversation / group), the path field (a machine) and the activity rows', users);
}

// ── pick 3: a browser replay's steps in words — every traced action (src/browser-trace.js TRACED_ACTIONS) has a verb in
// src/lib/browser-replay-window.js ACTION_WORDS with zh and ja rows; the CLI's own line (timelineLabel) is the tooltip ──
{
  console.log('the replay steps in words');
  const bt = fs.readFileSync(path.join(REPO, 'src/browser-trace.js'), 'utf8');
  const ta = bt.slice(bt.indexOf('const TRACED_ACTIONS = Object.freeze({'), bt.indexOf('});', bt.indexOf('const TRACED_ACTIONS = Object.freeze({')));
  const acts = [...ta.replace(/\/\/[^\n]*/g, '').matchAll(/'?([a-z][a-z-]*)'?\s*:\s*'(?:target|keys|point|scroll|navigation|viewport)'/g)].map((m) => m[1]);
  const rw = fs.readFileSync(path.join(REPO, 'src/lib/browser-replay-window.js'), 'utf8');
  const tbl = rw.slice(rw.indexOf('const ACTION_WORDS = {'), rw.indexOf('};', rw.indexOf('const ACTION_WORDS = {')));
  const words = Object.fromEntries([...tbl.matchAll(/'?([a-z][a-z-]*)'?:\s*\(\)\s*=>\s*t\('([^']+)'\)/g)].map((m) => [m[1], m[2]]));
  const missing = acts.filter((a) => !words[a]);
  ok(acts.length >= 25 && !missing.length, `every traced action has a verb (${acts.length} actions, ${new Set(Object.values(words)).size} verbs)`, missing);
  const Z = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, J = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const unrowed = [...new Set(Object.values(words))].filter((w) => typeof Z[w] !== 'string' || typeof J[w] !== 'string');
  ok(!unrowed.length, 'every verb has its zh AND ja row', unrowed);
  ok(/el\('span', 'brp-action-label', actionWords\(e\)/.test(rw) && /\{ title: timelineLabel\(e\) \}/.test(rw), 'the step label is the words; the CLI\'s line is its tooltip');
}

// ── pick 5 (M4): a dialog's button says what it does — no showConfirmDialog / showInputDialog call leans on the default «OK».
// A call names `confirmText:`, or spreads a words object (`...words`) whose builder names it (each builder below pinned by
// its own source) ──
{
  console.log('the dialog buttons say what they do');
  const callsOf = (src) => { const out = []; const re = /show(?:Confirm|Input)Dialog\(/g; let m;
    while ((m = re.exec(src))) { let i = m.index + m[0].length, d = 1, q = null;
      for (; i < src.length && d > 0; i++) { const c = src[i]; if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
        if (c === "'" || c === '"' || c === '`') q = c; else if ('({['.includes(c)) d++; else if (')}]'.includes(c)) d--; }
      out.push({ at: src.slice(0, m.index).split('\n').length, call: src.slice(m.index, i) }); }
    return out; };
  const files = execFileSync('git', ['-C', REPO, 'ls-files', 'src']).toString().split('\n').filter((f) => f.endsWith('.js') && !/i18n-|utils\.js$/.test(f));
  const bare = [];
  for (const f of files) { const src = fs.readFileSync(path.join(REPO, f), 'utf8'); if (!/show(?:Confirm|Input)Dialog\(/.test(src)) continue;
    for (const c of callsOf(src)) if (!/confirmText\s*:/.test(c.call) && !/\.\.\./.test(c.call) && !/^show\w+Dialog\(\s*\)$/.test(c.call)) bare.push(`${f}:${c.at}`); }
  ok(!bare.length, 'every confirm / input dialog names its button (confirmText) — none falls back to «OK»', bare);
  const BUILDERS = { 'src/lib/browser-build-model.js': ['downloadConfirmWords', 'removeConfirmWords'], 'src/lib/browser-cli-model.js': ['cliConfirmWords'], 'src/lib/pool-priority-model.js': ['gatherConfirmWords'] };
  const loose = [];
  for (const [f, names] of Object.entries(BUILDERS)) { const src = fs.readFileSync(path.join(REPO, f), 'utf8');
    for (const n of names) { const i = src.indexOf(`export function ${n}(`); const body = i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i)); if (!/confirmText\s*:/.test(body)) loose.push(`${f} ${n}`); } }
  ok(!loose.length, `the spread words builders name their button (${Object.values(BUILDERS).flat().length})`, loose);
  const planted = "showConfirmDialog({ title: t('Remove account'), message: msg })";
  ok(callsOf(planted).length === 1 && !/confirmText\s*:/.test(callsOf(planted)[0].call), 'CONTROL: a planted call without confirmText is seen as bare');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
