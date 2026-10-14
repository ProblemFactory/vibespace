#!/usr/bin/env node
// THE SHARED TABLES' IMPACT RULES (lane affected-heavy-deps, B-165f, 2026-10-13): scripts/affected-model.mjs (PURE)
// and its wiring in scripts/ci.mjs affectedSuites, over REAL git history in throwaway repositories.
//
// §1 the diff readers — the -U0 hunks, which lines hold code, a dictionary / schema-row / selector change and the
// edits each refuses to attribute · §2 the rules over stub suites, with the controls the brief names: a changed entry
// a zh suite renders ⇒ that suite, an entry nobody names ⇒ only the census / readers / zh pages (never an English
// page), a schema edit beyond the display words ⇒ the old rule; this module's own text is never evidence (a mutant
// without that filter goes red) · §3 the wiring over a real repository — an attributable edit narrows, an
// unattributable one keeps the old rule, a rule never adds, a zh runner / a lone sha keep the old rule, `why` lists
// the drop · §4 the census over the REAL table — every heavy suite reachable, the modeled files' fallback = the old
// reach exactly, the full tier = the table.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as M from './affected-model.mjs';
import { SUITES, affectedSuites, suiteInputs, listAffected, reachContext } from './ci.mjs';
import { gitEnvFrom } from './git-env.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// the §47 passport word, built from parts: a stub suite that drives a page says it, and THE TIER RULE reads this file too
const PASSPORT = ['ONBOARDED', 'SOURCE'].join('_');
const GIT_ENV = gitEnvFrom(process.env);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
const tmpDirs = [];
const mktmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `vs-affected-${tag}-`)); tmpDirs.push(d); return d; };
const git = (root, args, env = GIT_ENV) => {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8', env });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  return (r.stdout || '').trim();
};
const diffOf = (a, b) => { // a -U0 diff of two texts, by git itself (the reader's real input)
  const d = mktmp('diff');
  fs.writeFileSync(path.join(d, 'a'), a); fs.writeFileSync(path.join(d, 'b'), b);
  return spawnSync('git', ['diff', '--no-index', '-U0', path.join(d, 'a'), path.join(d, 'b')], { encoding: 'utf-8', env: GIT_ENV }).stdout;
};
const change = (file, a, b) => M.changeOf(file, { hunks: M.parseHunks(diffOf(a, b)), oldText: a, newText: b });
const names = (picks) => [...picks.keys()].sort().join(',');

const DICT = 'export default {\n  "Hello": "你好",\n  "Bye": "再见",\n  // a comment\n  "Quarterly report": "季度报告",\n};\n';
const SCHEMA = [
  "import { t } from './i18n.js';",
  'const X = 1;',
  'const SETTINGS_SCHEMA = {',
  "  'a.one': {",
  "    type: 'boolean', default: true, label: t('One'),",
  "    description: t('The first {n} rows'),",
  '  },',
  "  'a.two': { type: 'string', default: '', label: t('Two') },",
  '};',
  'export default SETTINGS_SCHEMA;',
  ''].join('\n');
const CSS = [
  ':root { --x: 1; }',
  '.w-chip { color: red; }',
  '.w-box > .w-chip,',
  '.w-alt { margin: 0; }',
  '/* a comment',
  '   spanning lines */',
  '@media (max-width: 600px) {',
  '  .w-chip { color: blue; }',
  '  .w-alt { padding: 0; }',
  '}',
  '@keyframes spin { from { opacity: 0; } to { opacity: 1; } }',
  'button { border: 0; }',
  'html:not(.w-off) .w-field > textarea { padding: 0; }',
  ''].join('\n');
const edit = (text, from, to) => { if (!text.includes(from)) throw new Error('fixture edit: ' + from); return text.replace(from, to); };

try {
// ── §1 THE DIFF READERS ──────────────────────────────────────────────────
console.log('\n§1 the diff readers');
{
  const h = M.parseHunks('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -3,0 +4,2 @@ ctx\n+four\n+five\n@@ -10 +12 @@\n-ten\n+twelve\n');
  ok(h.length === 2 && h[0].plus.map((l) => l.line).join() === '4,5' && !h[0].minus.length && h[1].minus[0].line === 10 && h[1].plus[0].line === 12,
    'parseHunks: -U0 hunks carry the old / new line numbers (an insertion after 3 is lines 4–5; "-10 +12" one each)');
  const js = M.codeLines("a();\n// c\n/* b\n still */ x();\nconst u = 'http://h';\n\n");
  ok(js.slice(1, 6).join() === 'true,false,false,true,true', 'codeLines: a // line and a block comment\'s inner line hold no code; // inside a string is code');
  ok(M.codeLines(CSS, { js: false }).slice(5, 7).join() === 'false,false', 'codeLines (CSS): both lines of a block comment are comment');

  const c1 = change('src/lib/i18n-zh.js', DICT, edit(DICT, '"你好"', '"您好"'));
  ok(c1.rule === 'i18n-table' && c1.attributable && c1.keys.join() === 'Hello' && c1.values.sort().join() === '你好,您好', 'a dictionary value edit: one key, both values');
  const c2 = change('src/lib/i18n-zh.js', DICT, edit(DICT, '  // a comment\n', '  // a reworded comment\n  "New key": "新键",\n'));
  ok(c2.attributable && c2.keys.join() === 'New key', 'a comment line is no change; an added entry is its key');
  const c3 = change('src/lib/i18n-zh.js', DICT, edit(DICT, 'export default {', 'const extra = 1;\nexport default {'));
  ok(!c3.attributable && /not a dictionary entry/.test(c3.offending[0]), 'CONTROL: a code line in the dictionary file is not attributable (the old rule)');

  const s1 = change('src/lib/settings-schema.js', SCHEMA, edit(SCHEMA, "t('The first {n} rows')", "t('The first {n} rows shown')"));
  ok(s1.rule === 'settings-text' && s1.attributable && s1.keys.join() === 'a.one' && s1.words.includes('The first {n} rows shown'), 'a description edit: attributable to its row, the old and new words');
  const s2 = change('src/lib/settings-schema.js', SCHEMA, edit(SCHEMA, "label: t('One')", "label: t('Only one')"));
  ok(s2.attributable && s2.keys.join() === 'a.one', 'a label edit on the line that also holds type + default: equal once the words are masked ⇒ words only');
  const s3 = change('src/lib/settings-schema.js', SCHEMA, edit(SCHEMA, "label: t('Two')", "label: t('Second')"));
  ok(s3.attributable && s3.keys.join() === 'a.two', 'a one-line row\'s label edit: its key');
  const s4 = change('src/lib/settings-schema.js', SCHEMA, edit(SCHEMA, 'default: true', 'default: false'));
  ok(!s4.attributable && /'a\.one': more than display words/.test(s4.offending[0]), 'CONTROL: a DEFAULT edit is not attributable (it reaches every reader)');
  const s5 = change('src/lib/settings-schema.js', SCHEMA, edit(SCHEMA, '};\nexport', "  'a.three': { type: 'boolean', default: true, label: t('Three') },\n};\nexport"));
  ok(!s5.attributable, 'CONTROL: a NEW row is not attributable (code may already read the key it declares)');
  const s6 = change('src/lib/settings-schema.js', SCHEMA, edit(SCHEMA, 'const X = 1;', 'const X = 2;'));
  ok(!s6.attributable && /outside every row/.test(s6.offending[0]), 'CONTROL: an edit outside SETTINGS_SCHEMA\'s rows is not attributable (the brief\'s second control)');

  const k1 = change('public/style.css', CSS, edit(CSS, '.w-chip { color: red; }', '.w-chip { color: green; }'));
  ok(k1.rule === 'css-selectors' && k1.attributable && k1.tokens.join() === 'w-chip', 'a declaration edit: the rule\'s class');
  const k2 = change('public/style.css', CSS, edit(CSS, '.w-alt { margin: 0; }', '.w-alt { margin: 1px; }'));
  ok(k2.attributable && k2.tokens.sort().join() === 'w-alt,w-box,w-chip' && k2.selectors.map((x) => x.required.join('+')).sort().join() === 'w-alt,w-box+w-chip',
    'a two-line selector list: every selector, each with the names a page must draw for it');
  const k3 = change('public/style.css', CSS, edit(CSS, '@media (max-width: 600px)', '@media (max-width: 700px)'));
  ok(k3.attributable && k3.tokens.sort().join() === 'w-alt,w-chip', 'an @media prelude edit: every rule inside it');
  const k4 = change('public/style.css', CSS, edit(CSS, '/* a comment', '/* a reworded comment'));
  ok(k4.attributable && !k4.tokens.length, 'a comment edit: attributable, no names');
  for (const [tag, from, to] of [[':root', '--x: 1', '--x: 2'], ['button', 'border: 0', 'border: 1px'], ['@keyframes', 'opacity: 0', 'opacity: 0.5']]) {
    const k = change('public/style.css', CSS, edit(CSS, from, to));
    ok(!k.attributable, `CONTROL: a ${tag} edit is not attributable (${k.offending[0] || 'attributed!'})`);
  }
  const st = M.selectorTokens('html:not(.w-off) .w-field > textarea, .a[data-x=".b"]#i');
  ok(st[0].all.join() === 'w-off,w-field' && st[0].required.join() === 'w-field' && st[0].anchor.join() === 'w-field' && st[1].all.join() === 'a,i',
    'selectorTokens: a :not() name is no requirement; an attribute value is no name');
  const re = M.tokenRe('recording');
  ok(["el.classList.add('recording')", "b.className = 'x recording'", '.recording {', "'recording'"].every((t) => re.test(t)) && !re.test('the recording started') && M.tokenRe('voice-btn').test('a voice-btn here'),
    'tokenRe: a plain word counts only where code spells a class; a hyphenated name anywhere');
}

// ── §2 THE RULES OVER STUB SUITES ────────────────────────────────────────
console.log('\n§2 the rules (stub suites)');
{
  const T = new Map(Object.entries({
    'scripts/test-zh.mjs': "await page.evaluate(() => localStorage.setItem('vibespace.lang', 'zh'));",
    'scripts/test-en.mjs': "spawn(process.execPath, ['server.js']);",
    'scripts/test-reader.mjs': "import zh from '../src/lib/i18n-zh.js';",
    'scripts/test-channels-i18n.mjs': 'drive();',
    'scripts/test-names-key.mjs': "assert(text.includes('Quarterly report'));",
    'scripts/test-self.mjs': 'import x from "./ci.mjs";',
    'scripts/affected-model.mjs': fs.readFileSync(path.join(REPO, 'scripts/affected-model.mjs'), 'utf-8'),
    'scripts/test-widget.mjs': "document.querySelector('.w-box .w-chip');",
    'scripts/test-chip.mjs': "document.querySelector('.w-chip');",
    'scripts/test-loads.mjs': "import w from '../src/lib/widget.js';",
    'scripts/test-modname.mjs': "// drives the popup of widget.js\nopen();",
    'scripts/test-pixel.mjs': "import pixelmatch from 'pixelmatch';",
    'scripts/test-schema.mjs': "import S from '../src/lib/settings-schema.js';",
    'scripts/test-window.mjs': "click('.settings-window .x');",
    'scripts/test-drawer.mjs': '// settings-ui.js draws it',
    'src/lib/widget.js': "el.className = 'w-box'; inner.className = 'w-chip';",
    'src/lib/other.js': "x.className = 'w-chip';",
    'src/server/x.js': "res.send('<div class=\"w-box\"></div>');",
    'src/lib/settings-ui.js': "import S from './settings-schema.js';",
    'public/index.html': '<div id="shell"></div>',
  }));
  const textOf = (f) => T.get(f) || '';
  const suites = [...T.keys()].filter((f) => /^scripts\/test-/.test(f)).map((f) => ({ name: path.basename(f, '.mjs') }));
  const closures = {
    'test-loads': { scripts: ['scripts/test-loads.mjs'], loads: ['src/lib/widget.js'] },
    'test-schema': { scripts: ['scripts/test-schema.mjs'], loads: ['src/lib/settings-schema.js'] },
    'test-self': { scripts: ['scripts/test-self.mjs', 'scripts/affected-model.mjs'], loads: [] },
  };
  const closureOf = (n) => closures[n] || { scripts: [`scripts/${n}.mjs`], loads: [] };
  const productFiles = ['public/index.html', 'src/lib/other.js', 'src/lib/settings-ui.js', 'src/lib/widget.js', 'src/server/x.js'];
  const sel = (ch, env = { LANG: 'C.UTF-8' }, model = M) => model.ruleSelect({ change: ch, suites, closureOf, textOf, productFiles, env });

  const zh = sel(change('src/lib/i18n-zh.js', DICT, edit(DICT, '"季度报告"', '"季报"')));
  ok(zh.attributable && names(zh.picks) === 'test-channels-i18n,test-reader,test-zh',
    `a zh entry: the zh page, the file's own reader, the i18n census — not the English boot, not the English suite naming the key, not the suite that only loads ci.mjs (${names(zh.picks)})`);
  ok(/renders in zh/.test(zh.picks.get('test-zh')) && /opens src\/lib\/i18n-zh\.js itself/.test(zh.picks.get('test-reader')), 'each pick says why');
  const nobody = sel(change('src/lib/i18n-zh.js', DICT, edit(DICT, '"再见"', '"拜拜"')));
  ok(names(nobody.picks) === names(zh.picks), 'an entry NO suite names: the same census / reader / zh-page set — never an English page');
  const ja = sel(change('src/lib/i18n-ja.js', DICT, edit(DICT, '"你好"', '"こんにちは"')));
  ok(!ja.picks.has('test-zh') && !ja.picks.has('test-reader') && ja.picks.has('test-channels-i18n'), 'a ja entry: a zh page and a zh-table reader are not its readers');
  const zhRunner = sel(change('src/lib/i18n-zh.js', DICT, edit(DICT, '"你好"', '"您好"')), { LANG: 'zh_CN.UTF-8' });
  ok(!zhRunner.attributable && /locale is zh_CN/.test(zhRunner.why), 'CONTROL: on a zh RUNNER every page reads the dictionary ⇒ not attributable (the old rule)');
  ok(!sel(change('src/lib/i18n-zh.js', DICT, edit(DICT, '"你好"', '"您好"')), { LANGUAGE: 'ja:en', LANG: 'C.UTF-8' }).attributable, 'CONTROL: LANGUAGE wins over LANG (ja:en ⇒ not attributable)');
  // the self filter, by a mutant copy of the module without it
  const mdir = mktmp('mutant');
  fs.copyFileSync(path.join(REPO, 'scripts/i18n-extract.mjs'), path.join(mdir, 'i18n-extract.mjs'));
  const src = fs.readFileSync(path.join(REPO, 'scripts/affected-model.mjs'), 'utf-8');
  const filt = 'return { scripts: c.scripts.filter((f) => f !== SELF), loads: c.loads.filter((f) => f !== SELF) };';
  ok(src.includes(filt), 'CONTROL: the self filter line is in the module');
  fs.writeFileSync(path.join(mdir, 'affected-model.mjs'), src.replace(filt, 'return c;'));
  const MUT = await import(pathToFileURL(path.join(mdir, 'affected-model.mjs')).href);
  ok(sel(change('src/lib/i18n-zh.js', DICT, edit(DICT, '"你好"', '"您好"')), undefined, MUT).picks.has('test-self'),
    'CONTROL (mutant): without the self filter a suite that only loads ci.mjs reads as a zh page — the module names every language');

  const css = sel(change('public/style.css', CSS, edit(CSS, '.w-alt { margin: 0; }', '.w-alt { margin: 1px; }')));
  ok(css.attributable && names(css.picks) === 'test-loads,test-modname,test-pixel,test-widget',
    `.w-box > .w-chip keyed by .w-box (one client module draws it, two draw .w-chip): the suite naming it, loading / naming its module, the pixel suite — not the suite naming only .w-chip (${names(css.picks)})`);
  ok(!css.picks.has('test-chip') && /loads src\/lib\/widget\.js, which draws \.w-box/.test(css.picks.get('test-loads') || ''), 'a server module that prints the class is no drawer (src/server/x.js)');
  const chip = sel(change('public/style.css', CSS, edit(CSS, '.w-chip { color: red; }', '.w-chip { color: green; }')));
  ok(chip.picks.has('test-chip') && chip.picks.has('test-widget'), '.w-chip alone: every suite naming .w-chip');
  T.set('public/index.html', '<div class="w-box"><span class="w-chip"></span></div>');
  const every = sel(change('public/style.css', CSS, edit(CSS, '.w-alt { margin: 0; }', '.w-alt { margin: 1px; }')));
  ok(!every.attributable && /public\/index\.html draws every name of '\.w-box > \.w-chip'/.test(every.why), 'CONTROL: a rule whose every name the page shell draws styles every page ⇒ not attributable');
  T.set('public/index.html', '<div id="shell"></div>');

  const set = sel(change('src/lib/settings-schema.js', SCHEMA, edit(SCHEMA, "t('The first {n} rows')", "t('The first {n} rows shown')")));
  ok(set.attributable && names(set.picks) === 'test-drawer,test-schema,test-window',
    `a description edit: the in-process loader, the Settings window's suite, the suite naming a module that draws schema rows — nothing else (${names(set.picks)})`);
  T.set('scripts/test-names-key.mjs', "patch({ 'a.one': false });");
  ok(sel(change('src/lib/settings-schema.js', SCHEMA, edit(SCHEMA, "t('The first {n} rows')", "t('The first {n} rows shown')"))).picks.has('test-names-key'), 'a suite naming the row\'s key is a pick');
  ok(!sel(change('src/lib/settings-schema.js', SCHEMA, edit(SCHEMA, 'default: true', 'default: false'))).attributable, 'CONTROL: a default edit ⇒ not attributable (the old rule)');
}

// ── §3 THE WIRING OVER A REAL REPOSITORY ─────────────────────────────────
console.log('\n§3 the wiring (ci.mjs affectedSuites, real git)');
{
  const repo = mktmp('repo');
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.email', 'gate@test.local']); git(repo, ['config', 'user.name', 'gate test']); git(repo, ['config', 'commit.gpgsign', 'false']);
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), body); };
  const commitAll = (msg) => { git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', msg]); return git(repo, ['rev-parse', 'HEAD']); };
  w('server.js', '// boot\n');
  w('src/lib/i18n.js', "import zh from './i18n-zh.js';\nexport const t = (s) => s;\n");
  w('src/lib/i18n-zh.js', DICT);
  w('src/lib/settings-schema.js', SCHEMA);
  w('src/lib/widget.js', "import { t } from './i18n.js';\nel.className = 'w-box'; inner.className = 'w-chip';\n");
  w('public/style.css', CSS);
  w('public/index.html', '<div id="shell"></div>\n');
  // the page suites carry the §47 passport (ONBOARDED_SOURCE): lane affected-static-reach's rule lets a client file or a
  // shared table reach only a suite that drives a browser, and these four stand for page suites
  w('scripts/test-zh.mjs', `spawn(process.execPath, ['server.js']);\naddScript(${PASSPORT});\nlocalStorage.setItem('vibespace.lang', 'zh');\n`);
  w('scripts/test-en.mjs', `spawn(process.execPath, ['server.js']);\naddScript(${PASSPORT});\n`);
  w('scripts/test-widget.mjs', `spawn(process.execPath, ['server.js']);\naddScript(${PASSPORT});\ndocument.querySelector('.w-chip');\n`);
  w('scripts/test-window.mjs', `spawn(process.execPath, ['server.js']);\naddScript(${PASSPORT});\nclick('.settings-window');\n`);
  w('scripts/test-import.mjs', "import w from '../src/lib/widget.js';\nconsole.log(w);\n");
  const S = ['test-zh', 'test-en', 'test-widget', 'test-window', 'test-import'].map((name) => ({ name }));
  const c0 = commitAll('base');
  const run = (range, extra = {}) => affectedSuites({ range, suites: S, root: repo, env: { LANG: 'C.UTF-8' }, ...extra });
  const sel = (a) => a.selected.map((s) => s.name).sort().join(',');

  w('src/lib/i18n-zh.js', edit(DICT, '"你好"', '"您好"'));
  const c1 = commitAll('a zh entry');
  const a1 = run(`${c0}..${c1}`);
  ok(sel(a1) === 'test-zh', `a zh ENTRY edit selects the zh page only — the English boots and the in-process importer drop (${sel(a1)})`);
  const r1 = a1.rules.find((r) => r.file === 'src/lib/i18n-zh.js');
  ok(r1 && r1.attributable && r1.old === 5 && r1.now === 1 && r1.dropped.length === 4 && /◇ src\/lib\/i18n-zh\.js — i18n-table: .*⇒ 1 of the 5 suites the old rule selects \(dropped 4, added 0\)/.test(a1.summary),
    'the summary says the rule, the old rule\'s count, the drop and that it added nothing');
  ok(!/dropped: /.test(a1.summary) && /dropped: .*test-en/.test(run(`${c0}..${c1}`, { why: true }).summary), '`why` lists the dropped names (and only then)');
  ok(sel(run(`${c0}..${c1}`, { env: { LANG: 'zh_CN.UTF-8' } })) === 'test-en,test-import,test-widget,test-window,test-zh', 'CONTROL: on a zh runner the same edit is the old rule (all 5)');
  ok(sel(run(c1)) === 'test-en,test-import,test-widget,test-window,test-zh' && /lone-sha range/.test(run(c1).summary), 'CONTROL: a lone-sha range has no single base ⇒ the old rule, said');

  w('src/lib/i18n-zh.js', 'const extra = 1;\n' + edit(DICT, '"你好"', '"您好"'));
  const c2 = commitAll('a code line in the dictionary');
  ok(sel(run(`${c1}..${c2}`)) === 'test-en,test-import,test-widget,test-window,test-zh' && /the OLD rule \(5 suites\) — not a dictionary entry/.test(run(`${c1}..${c2}`).summary),
    'CONTROL: a code line in the dictionary ⇒ the old rule (all 5), and the summary says why');
  // lane affected-static-reach: the old rule's fallback then meets the reach rule — a shared table is read only on a page
  w('scripts/test-srv.mjs', "spawn(process.execPath, ['server.js']);\nawait fetch('/api/sessions');\n");
  const SS = [...S, { name: 'test-srv' }];
  ok(sel(affectedSuites({ range: `${c1}..${c2}`, suites: SS, root: repo, env: { LANG: 'C.UTF-8' } })) === 'test-en,test-import,test-widget,test-window,test-zh'
    && sel(affectedSuites({ range: `${c1}..${c2}`, suites: SS, root: repo, env: { LANG: 'C.UTF-8' }, reach: false })).includes('test-srv'),
    'a server-only booting suite (no browser) is dropped for a dictionary fallback — the old rule (reach: false) selects it');
  fs.rmSync(path.join(repo, 'scripts/test-srv.mjs'));

  w('public/style.css', edit(CSS, '.w-chip { color: red; }', '.w-chip { color: green; }'));
  const c3 = commitAll('a .w-chip rule');
  const a3 = run(`${c2}..${c3}`);
  const r3 = a3.rules.find((r) => r.file === 'public/style.css');
  ok(sel(a3) === 'test-widget' && r3.outside.join() === 'test-import',
    `a .w-chip edit selects the suite naming it; the importer of the module that draws it never loads style.css — named, NOT added (${sel(a3)}; outside ${r3.outside.join()})`);
  // a BUILD OUTPUT draws every class but is no source (B: a built tree selected 127 suites for the .266 edit, not 98)
  w('public/bundle.js', "a.className = 'w-chip'; b.className = 'w-box';\n");
  w('scripts/test-bundle.mjs', `spawn(process.execPath, ['server.js']);\naddScript(${PASSPORT});\nload('/bundle.js');\n`);
  const SB = [...S, { name: 'test-bundle' }];
  const bsel = () => sel(affectedSuites({ range: `${c2}..${c3}`, suites: SB, root: repo, env: { LANG: 'C.UTF-8' } }));
  ok(bsel() === 'test-widget', 'an UNTRACKED build output (public/bundle.js drawing .w-chip) is no drawer: the suite naming it is not selected');
  git(repo, ['add', '-f', 'public/bundle.js']);
  ok(bsel() === 'test-bundle,test-widget', 'CONTROL: the same file TRACKED is a drawer — the suite naming it is selected');
  git(repo, ['rm', '-q', '--cached', 'public/bundle.js']);
  fs.rmSync(path.join(repo, 'public/bundle.js')); fs.rmSync(path.join(repo, 'scripts/test-bundle.mjs'));
  const bare = mktmp('bare');
  fs.cpSync(repo, bare, { recursive: true, filter: (src) => !src.includes(`${path.sep}.git`) });
  const ub = affectedSuites({ range: `${c2}..${c3}`, suites: S, root: bare, gitRoot: repo, env: { LANG: 'C.UTF-8' } });
  ok(sel(ub) === 'test-en,test-widget,test-window,test-zh' && /tracked sources could not be listed/.test(ub.summary), 'CONTROL: a tree whose tracked sources git cannot list knows no drawer ⇒ the old rule, said');
  w('public/style.css', edit(CSS, 'button { border: 0; }', 'button { border: 1px; }'));
  const c4 = commitAll('a button rule');
  ok(sel(run(`${c3}..${c4}`)) === 'test-en,test-widget,test-window,test-zh', 'CONTROL: a global selector (button) ⇒ the old rule: every suite that boots the page');

  w('src/lib/settings-schema.js', edit(SCHEMA, "t('The first {n} rows')", "t('The first {n} rows shown')"));
  const c5 = commitAll('a description');
  ok(sel(run(`${c4}..${c5}`)) === 'test-window', `a schema DESCRIPTION edit selects the Settings window's suite only (${sel(run(`${c4}..${c5}`))})`);
  w('src/lib/settings-schema.js', edit(SCHEMA, 'default: true', 'default: false'));
  const c6 = commitAll('a default');
  ok(sel(run(`${c5}..${c6}`)) === 'test-en,test-widget,test-window,test-zh', 'CONTROL: a schema DEFAULT edit ⇒ the old rule (every boot)');

  w('src/lib/widget.js', "import { t } from './i18n.js';\nel.className = 'w-box'; inner.className = 'w-chip big';\n");
  const c7 = commitAll('widget.js');
  ok(sel(run(`${c6}..${c7}`)) === 'test-en,test-import,test-widget,test-window,test-zh', 'any other product file is no table: its importer loads it, the suite naming .w-chip meets its reach, the three that derive no reach run on it (reach \'all\')');
  ok(sel(run(`${c6}..${c7}`, { reach: false })) === 'test-en,test-import,test-widget,test-window,test-zh', '…the same five as the old rule here (reach: false)');
  w('src/lib/i18n-zh.js', edit(fs.readFileSync(path.join(repo, 'src/lib/i18n-zh.js'), 'utf-8'), '"再见"', '"拜拜"'));
  w('public/style.css', edit(fs.readFileSync(path.join(repo, 'public/style.css'), 'utf-8'), '.w-chip { color: red; }', '.w-chip { color: teal; }'));
  const c8 = commitAll('a zh entry + a .w-chip rule');
  ok(sel(run(`${c7}..${c8}`)) === 'test-widget,test-zh', `one range, two tables: the union of each file's verdict (${sel(run(`${c7}..${c8}`))})`);
  const ciSrc = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8');
  // `, host` (lane ci-aidev-desktop-batch): --list-affected also takes the --host cut
  ok(/listAffected\(\{ range: rangeArg \|\| null, shard, dir, why: !!arg\('why'\)(?:, host)? \}\)/.test(ciSrc) && /affectedSuites\(\{ range, suites: all, root: runRoot, gitRoot: repo, why \}\)/.test(ciSrc),
    'WIRING: --why reaches --list-affected and the heavy gate\'s selection');
}

// ── §4 THE CENSUS OVER THE REAL TABLE ────────────────────────────────────
console.log('\n§4 the census (the real table)');
{
  const heavy = SUITES.filter((s) => s.tier === 'heavy');
  const memo = new Map();
  const inputs = new Map(heavy.map((s) => [s.name, suiteInputs(s, { root: REPO, memo })]));
  const isProduct = (p) => p === 'server.js' || p.startsWith('src/') || p.startsWith('public/') || p.startsWith('data/bin/');
  const unreachable = heavy.filter((s) => { const { files, prefixes } = inputs.get(s.name); return !s.always && !(s.reads && s.reads.length) && ![...files, ...prefixes].some(isProduct); });
  ok(heavy.length > 200 && !unreachable.length, `every one of the ${heavy.length} heavy suites is reachable — always:, a reads: list or a product input (${unreachable.map((s) => s.name).join(', ') || 'none unreachable'})`);
  ok(heavy.every((s) => inputs.get(s.name).files.has(`scripts/${s.name}.mjs`)), 'every heavy suite is selected by its own file');
  for (const f of Object.keys(M.MODELED)) {
    const reach = heavy.filter((s) => { if (s.always) return false; const { files, prefixes } = inputs.get(s.name); return files.has(f) || [...prefixes].some((p) => f.startsWith(p)); }).map((s) => s.name).sort();
    const fb = affectedSuites({ range: 'nope..nope', suites: heavy, root: REPO, changed: [f], memo, env: { LANG: 'C.UTF-8' }, reach: false });
    const got = fb.selected.filter((s) => !s.always).map((s) => s.name).sort();
    ok(reach.length > 100 && got.join() === reach.join() && /the OLD rule/.test(fb.summary), `${f}: an edit the rule cannot attribute (here: no diff) keeps the old reach exactly (${got.length} = ${reach.length}; reach: false)`);
    // …and the static reach (lane affected-static-reach) then keeps exactly the suites that drive a browser or load the table themselves
    const rc = reachContext({ suites: heavy, root: REPO, memo });
    const want = reach.filter((n) => { const s = heavy.find((x) => x.name === n); return rc.own(s, f) || rc.suite(s).browser; });
    const now = affectedSuites({ range: 'nope..nope', suites: heavy, root: REPO, changed: [f], memo, env: { LANG: 'C.UTF-8' } }).selected.filter((s) => !s.always).map((s) => s.name).sort();
    ok(now.length < got.length && now.join() === want.join(), `${f}: with the static reach, a shared table read on every page keeps the old reach's browser suites + its own loaders (${now.length} of ${got.length})`);
  }
  const full = listAffected({ dir: mktmp('markers') }).names.sort();
  ok(full.join() === heavy.map((s) => s.name).sort().join(), `the FULL heavy tier is the table (${full.length} suites) — the rules touch only the affected selection`);
  ok(Object.keys(M.KEPT).includes('server.js') && Object.keys(M.KEPT).includes('scripts/ci.mjs') && !M.MODELED['server.js'] && !M.MODELED['scripts/ci.mjs'], 'server.js and scripts/ci.mjs keep the old rule (KEPT, said in the summary)');
}
} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
}
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
