#!/usr/bin/env node
// EVERY SUITE FILE PARSES (the coordinator's law, 2026-11-14; the train int402). Tonight a HEAVY suite that a lane had
// edited (test-task-detail-chrome) had not parsed since that lane's first pick: a comment placed mid-line swallowed the rest of a
// call. No gate saw it, because the suite runs only on the hosted runner, so the mirror would have been the first to meet it, red on
// both tries. The same cut has been in scripts/measure-input-receipts.mjs since it was born (2.369.192): its line 11 ended in a
// comment that took the arrow's `return v; };` with it. That file is a measurement, never a suite, and nothing ever ran it.
//
// THE LAW: every file under scripts/ that Node would load as code (*.mjs, *.cjs, *.js; node_modules aside) parses as the module
// kind it is. A file that does not parse is red BY ITS NAME AND LINE. In-process, ONE parse per file (acorn, the tree's own
// devDependency, ecmaVersion 'latest'), never one process per file:
//   *.mjs = an ES module (top-level await allowed);
//   *.cjs = CommonJS as Node wraps it (a top-level return is legal);
//   *.js  = the nearest package.json's "type"; with none, Node's own module-syntax detection: CommonJS first, and an ES module
//           when the CommonJS reading fails on module syntax (scripts/fixtures/mounts-dialog-baseline/baseline.js is one).
//   §1 THE TREE: every such file parses; the walk met at least 1000 files, this suite and scripts/ci.mjs among them.
//   §2 THE CONTROLS (a scratch tree, the same walk and the same parse): the mid-line comment that cuts a call is red by its file
//      and line; each module kind is read as its own (the same text green as one kind and red as the other); a red deep in a
//      subfolder is found; node_modules and non-code files are never read.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies, unanchoredEdits, anchorHelpers, scriptCensus } from './mutant-copy.mjs';
import { paramTextEdits, censusAll } from './lib/param-text-census.mjs';   // B-0d3e slice 8: the second list (a module only this suite imports)

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const acorn = createRequire(path.join(REPO, 'package.json'))('acorn');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };

/** Every *.mjs / *.cjs / *.js under <root>/scripts (node_modules aside), as paths relative to <root>, sorted. */
export function codeFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
      else if (e.isFile() && /\.(mjs|cjs|js)$/.test(e.name)) out.push(path.relative(root, p));
    }
  };
  walk(path.join(root, 'scripts'));
  return out.sort();
}

/** The module kind Node gives <rel>: 'module' | 'commonjs' | 'detect' (a .js file whose nearest package.json names no type). */
export function kindOf(root, rel, cache = new Map()) {
  if (rel.endsWith('.mjs')) return 'module';
  if (rel.endsWith('.cjs')) return 'commonjs';
  for (let dir = path.dirname(path.join(root, rel)); ; dir = path.dirname(dir)) {
    if (!cache.has(dir)) {
      let type = null;
      try { const t = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).type; type = t === 'module' || t === 'commonjs' ? t : 'none'; } catch {}
      cache.set(dir, type);
    }
    const t = cache.get(dir);
    if (t === 'module' || t === 'commonjs') return t;
    if (t === 'none' || dir === root || path.dirname(dir) === dir) return 'detect';   // the nearest package.json has no type (or none up to the root)
  }
}

const OPTS = {
  module: { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true },
  commonjs: { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true },
};
let lastAst = null;   // the tree the last good parse built (§3 reads it — ONE parse per file serves both laws)
const tryParse = (src, kind) => { try { lastAst = acorn.parse(src, OPTS[kind]); return null; } catch (e) { lastAst = null; return e; } };

/** The files under <root>/scripts that do not parse: [{ file, line, column, kind, message }]; plus what was read. */
export function unparseable(root, { visit = null } = {}) {
  const cache = new Map(); const bad = []; const kinds = { module: 0, commonjs: 0, detect: 0 }; let bytes = 0;
  const files = codeFiles(root);
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8'); bytes += src.length;
    const kind = kindOf(root, rel, cache); kinds[kind]++;
    let err;
    if (kind === 'detect') {
      const cjs = tryParse(src, 'commonjs');
      // Node's detection: the CommonJS reading first; module syntax there ⇒ the file is an ES module
      err = cjs && tryParse(src, 'module');
      if (err && !/'import' and 'export'|import\.meta|Cannot use keyword 'await'/.test(cjs.message) ) err = cjs;
    } else err = tryParse(src, kind);
    if (err) bad.push({ file: rel, line: err.loc ? err.loc.line : 0, column: err.loc ? err.loc.column : 0, kind, message: String(err.message).replace(/ \(\d+:\d+\)$/, '') });
    else if (visit && lastAst) visit(rel, src, lastAst);
  }
  return { files, bad, kinds, bytes };
}
const said = (b) => `${b.file}:${b.line}:${b.column} ${b.message} (read as ${b.kind === 'detect' ? 'Node detects it' : b.kind})`;

console.log('§1 THE TREE — every file under scripts/ that Node would load as code parses as the module kind it is');
{
  const t0 = performance.now();
  // §3's census rides this pass: every suite / lib module under scripts/ (not this file: its plants spell edits in strings)
  // B-7e49 (主开发 r2206): both of §3's censuses over ONE walk an AST (scripts/mutant-copy.mjs scriptCensus): the parse is the
  // law's own and serves both laws; no other reader in this process parses these files, and nothing is kept across runs
  const self = path.basename(fileURLToPath(import.meta.url));
  var EDITS = {}, HELPERS = {}, PARAMS = {};   // eslint-disable-line no-var — §3 reads them (PARAMS: the second list, B-0d3e slice 8)
  // B-0d3e (主开发 r2677 / r2799): the PLANTED sites (scripts/lib/census-plant.mjs), admitted by the walk's ONE filter like every
  // script it censuses — no branch of their own: a filter broken by a later edit loses the plant with the lists, and the plant legs
  // go red (§3's red control breaks a copy of this very filter); §3 takes the plant's row out of the maps before any list is judged
  var SCRIPT_RE = /^scripts\/((?:lib\/)?[^/]+\.mjs)$/, PLANT_REL = 'scripts/lib/census-plant.mjs', PLANT_KEY = 'lib/census-plant.mjs', PLANT_SRC = null, PLANT = null;   // eslint-disable-line no-var — §3 reads them
  var admitBy = (re) => (rel) => { const m = re.exec(rel); return m && m[1] !== self ? m[1] : null; };   // eslint-disable-line no-var — the filter, as §3's red control runs it on a copy
  const admit = admitBy(SCRIPT_RE);
  const r = unparseable(REPO, { visit: (rel, src, ast) => { const key = admit(rel); if (!key) return; const m = [rel, key]; if (key === PLANT_KEY) PLANT_SRC = src; const { edits: e, helpers: h, paramEdits: pe } = censusAll(src, { ast }); if (e.length) EDITS[m[1]] = e; if (h.length) HELPERS[m[1]] = h; if (pe.length) PARAMS[m[1]] = pe; } });
  const ms = Math.round(performance.now() - t0);
  ok(r.files.length >= 1000 && gateOf(r.files.includes('scripts/ci.mjs')) && verdictOf(r.files.includes('scripts/test-suite-files-parse.mjs')),
    `the walk met ${r.files.length} files (${(r.bytes / 1e6).toFixed(1)} MB: ${r.kinds.module} ES modules, ${r.kinds.commonjs} CommonJS, ${r.kinds.detect} by Node's detection), this suite and scripts/ci.mjs among them`);
  ok(r.bad.length === 0, `EVERY ONE PARSES (${ms} ms)${r.bad.length ? ` — ${r.bad.length} DO NOT:\n      ${r.bad.map(said).join('\n      ')}` : ''}`);
  const tops = fs.readdirSync(path.join(REPO, 'scripts')).filter((n) => /^test-.*\.mjs$/.test(n)).map((n) => `scripts/${n}`);
  ok(tops.length > 500 && verdictOf(tops.every((f) => r.files.includes(f))), `every scripts/test-*.mjs (${tops.length}) is among them`);
}

console.log('§2 THE CONTROLS — a scratch tree through the same walk and the same parse');
{
  const root = scratchDir('suite-files-parse');
  try {
    const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
    put('package.json', '{ "name": "scratch" }\n');   // no "type": a .js file is read by Node's detection
    // THE SHAPE THAT HID TONIGHT: a comment placed mid-line takes the rest of the call with it (`)` and the next statement)
    put('scripts/test-cut-call.mjs', [
      "import fs from 'node:fs';",
      'const ok = (c, m) => { if (!c) throw new Error(m); };',
      "ok(fs.existsSync('.'), 'the tree is there'); // a comment at the END of a line cuts nothing",
      "ok(true, 'two' // the reason it holds ); ok(true, 'three');",
      "console.log('done');",
      '',
    ].join('\n'));
    // the measure script's shape (an arrow whose `return v; };` the comment took)
    put('scripts/measure-cut-arrow.mjs', "const f = (x) => { const v = x * 2; // the doubled value return v; };\nconst y = await Promise.resolve(f(1));\nexport default y;\n");
    // each kind read as its own: the same text green as one kind, red as the other
    const TLA = 'const x = await Promise.resolve(1);\nexport default x;\n';
    const RET = "if (process.env.NEVER_SET_X) return;\nmodule.exports = 1;\n";
    put('scripts/tla.mjs', TLA); put('scripts/tla.cjs', TLA);
    put('scripts/ret.cjs', RET); put('scripts/ret.mjs', RET);
    put('scripts/hashbang.mjs', '#!/usr/bin/env node\nconsole.log(1);\n');
    put('scripts/fixtures/detect/esm.js', "import fs from 'node:fs';\nexport const a = fs;\n");      // no type ⇒ Node detects an ES module
    put('scripts/fixtures/detect/cjs.js', 'module.exports = 2;\n');
    put('scripts/fixtures/typed/package.json', '{ "type": "module" }\n'); put('scripts/fixtures/typed/a.js', "import fs from 'node:fs';\nexport default fs;\n");
    put('scripts/fixtures/typed2/package.json', '{ "type": "commonjs" }\n'); put('scripts/fixtures/typed2/b.js', 'export const b = 1;\n');   // typed commonjs: Node refuses ESM syntax
    put('scripts/fixtures/deep/er/broken.cjs', 'module.exports = { a: 1,, };\n');
    put('scripts/node_modules/x/never.mjs', 'this is not code (\n'); put('scripts/fixtures/not-code.txt', 'this is not code (\n'); put('scripts/fixtures/n.json', '{ broken\n');
    const r = unparseable(root);
    const reds = Object.fromEntries(r.bad.map((b) => [b.file, b]));
    ok(gateOf(reds['scripts/test-cut-call.mjs']) && reds['scripts/test-cut-call.mjs'].line === 5,
      'the mid-line comment that cuts a call is RED by its file and the line the parse stopped at (5, under the cut on 4)', reds['scripts/test-cut-call.mjs'] && said(reds['scripts/test-cut-call.mjs']));
    ok(gateOf(reds['scripts/measure-cut-arrow.mjs']) && reds['scripts/measure-cut-arrow.mjs'].line === 2, 'the arrow whose return the comment took is RED by file and line', reds['scripts/measure-cut-arrow.mjs'] && said(reds['scripts/measure-cut-arrow.mjs']));
    ok(!reds['scripts/tla.mjs'] && verdictOf(reds['scripts/tla.cjs']), 'top-level await: green as an ES module, RED as CommonJS');
    ok(!reds['scripts/ret.cjs'] && verdictOf(reds['scripts/ret.mjs']), 'a top-level return: green as CommonJS (Node wraps it), RED as an ES module');
    ok(!reds['scripts/hashbang.mjs'] && !reds['scripts/fixtures/detect/esm.js'] && !reds['scripts/fixtures/detect/cjs.js'] && !reds['scripts/fixtures/typed/a.js'],
      'a hashbang, a .js ES module by Node\'s detection, a .js CommonJS file and a .js under "type": "module" are all green');
    ok(gateOf(reds['scripts/fixtures/typed2/b.js']) && reds['scripts/fixtures/typed2/b.js'].kind === 'commonjs', 'module syntax in a .js under "type": "commonjs" is RED (Node refuses it there)');
    ok(gateOf(reds['scripts/fixtures/deep/er/broken.cjs']) && reds['scripts/fixtures/deep/er/broken.cjs'].line === 1, 'a red deep in a subfolder is found, by file and line');
    ok(!r.files.some((f) => f.includes('node_modules') || /\.(txt|json)$/.test(f)), 'node_modules and non-code files are never read');
    ok(r.bad.length === 6, `exactly the six planted reds, nothing else (${r.bad.length}: ${r.bad.map((b) => b.file).join(', ')})`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

console.log('\n§3 A RED CONTROL THAT BUILDS NOTHING FAILS BY NAME (B-0d3e) — the anchored door, the loader\'s guard, the unanchored edits only fall');
{
  // THE TREE: every `.replace` / `.replaceAll` / `.split().join()` on a product file's text whose result reaches a loader
  // without scripts/scratch.mjs `anchored()` — each the anchor of a red control that says nothing when its line moves.
  // ONE-WAY (the §7b rule): a file that ADDS one is red by name and the red prints the row that admits it on purpose; a
  // file whose count falls is never red (many lanes merge suites into one train) — its stale row is only said. Every
  // mutant copy written through scripts/mutant-copy.mjs fails by name besides when its copy equals the file (all its
  // anchors gone); anchored() fails by name on each one.
  // THE RATCHET HOLDS BY ITSELF (主开发 2026-11-18 23:33Z — the 2.369.412 block's 166 were counted in once; the read of 01:11Z:
  // a rise inside the founding row was still one number away): a count may FALL, never RISE without a backlog row's id beside
  // it. Every count lives under a row — `rows: { "B-xxxx": { why, files } }` — and a file's cap is the largest count any row
  // gives it. THE FOUNDING ROW (B-0d3e, the list the census brought) IS FALL-ONLY: its counts and total are pinned in
  // scripts/fixtures/census-founding-pins.json, and a founding count above its pin is red — a rise enters only as a NEW row
  // under the raising unit's own backlog id. RED by name: a plain `files` map (a number with no row id); a row whose id is no
  // B-xxxx, whose why has fewer than 20 characters, or whose count is not a whole number; the founding row above its pin;
  // and a live count above every row's cap. (The one escape no suite closes: an invented id of the right shape.)
  const ROW_ID = /^B-[0-9a-f]{4}$/, WHY_MIN = 20;
  const PINS = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'census-founding-pins.json'), 'utf-8'));
  const capsOf = (fx, pin = null) => {
    const caps = {}, bad = [];
    if (fx && fx.files && Object.keys(fx.files).length) bad.push(`a plain «files» map (${Object.keys(fx.files).length} counts with no row id beside them)`);
    for (const [id, g] of Object.entries((fx && fx.rows) || {})) {
      if (!ROW_ID.test(id)) { bad.push(`row «${id}»: its id is no backlog id (B-xxxx)`); continue; }
      if (!g || typeof g.files !== 'object' || g.files === null) { bad.push(`row «${id}»: no «files» map`); continue; }
      if (String(g.why || '').trim().length < WHY_MIN) { bad.push(`row «${id}»: a why of fewer than ${WHY_MIN} characters`); continue; }
      const notWhole = Object.entries(g.files).filter(([, n]) => !Number.isInteger(n) || n < 0).map(([f, n]) => `${f}: ${JSON.stringify(n)}`);
      if (notWhole.length) { bad.push(`row «${id}»: a count that is not a whole number (${notWhole.slice(0, 3).join(', ')})`); continue; }
      if (pin && id === pin.row) {
        const over = Object.entries(g.files).filter(([f, n]) => n > ((pin.files || {})[f] || 0)).map(([f, n]) => `${f} ${n} > its pin ${(pin.files || {})[f] || 0}`);
        const tot = Object.values(g.files).reduce((a, b) => a + b, 0);
        if (over.length || tot > pin.total) bad.push(`the founding row «${id}» raised above its pin (${over.length ? over.slice(0, 4).join(', ') : `total ${tot} > ${pin.total}`}) — it is fall-only: add a row under YOUR OWN backlog id with its why`);
      }
      for (const [f, n] of Object.entries(g.files)) caps[f] = Math.max(caps[f] || 0, n);
    }
    return { caps, bad };
  };
  const UFX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'unanchored-controls.json'), 'utf-8'));
  const { caps: LISTED, bad: UBAD } = capsOf(UFX, PINS['unanchored-controls']);
  ok(!UBAD.length, `every count of scripts/fixtures/unanchored-controls.json stands under a backlog row's id (${Object.keys(UFX.rows || {}).join(', ')})${UBAD.length ? ` — NO ROW ID: ${UBAD.join(' | ')}` : ''}`);
  // the PLANT out of the maps before any list is judged (it stands outside every list)
  if (PLANT_SRC !== null) PLANT = { src: PLANT_SRC, edits: EDITS[PLANT_KEY] || [], helpers: HELPERS[PLANT_KEY] || [], paramEdits: PARAMS[PLANT_KEY] || [] };
  delete EDITS[PLANT_KEY]; delete HELPERS[PLANT_KEY]; delete PARAMS[PLANT_KEY];
  const per = Object.fromEntries(Object.entries(EDITS).map(([f, e]) => [f, e.length]));
  const total = Object.values(per).reduce((a, b) => a + b, 0);
  const judge = (p, listed) => ({ added: Object.entries(p).filter(([f, n]) => n > (listed[f] || 0)).map(([f]) => f), fell: Object.keys(listed).filter((f) => (p[f] || 0) < listed[f]) });
  // THE WHOLE LIST (checkpoint 60): a red names EVERY file over its count, one file a line with all its items. The old
  // edits message kept six files and ok() cut its detail at 600 characters (about two files read), so a file behind the cut
  // stayed red unseen; the helper census kept six. Each over-count line is printed whole by sayOver.
  const overLines = (added, n, listed, items, say) => added.map((f) => `${f}: ${n[f]} > ${listed[f] || 0} — ${items[f].map(say).join(' · ')}`);
  const sayOver = (lines, log = console.log) => { for (const l of lines) log('      ' + l); };
  const j = judge(per, LISTED);
  // NON-VACUOUS BY A PLANT, never by a count of debt (主开发 r2677: «a census that goes red because the debt was paid is the wrong
  // shape»; the floor it replaces asked the live count to hold half of the list, so the row's own fall would have reddened it).
  // §1's walk admitted scripts/lib/census-plant.mjs by its one filter, like every script, and both censuses answered there: its one
  // planted helper — its own parameter the anchor of a product edit that reaches a loader and fails by no name — is ONE edit and
  // ONE anchor helper. A walk, or a census, that read nothing finds nothing there. The plants stand outside every list.
  const plantSaid = (c) => (c ? `${c.edits.length} edit(s)${c.edits.length ? ' at line ' + c.edits.map((e) => e.line).join(', ') : ''}, ${c.helpers.length} helper(s)${c.helpers.length ? ' ' + c.helpers.map((h) => h.name).join(', ') : ''}` : 'the walk did not meet it');
  const plantFound = (c) => !!c && c.edits.length === 1 && c.helpers.length === 1 && c.helpers[0].name === 'plantedCut' && c.edits[0].line === c.helpers[0].line;
  ok(verdictOf(plantFound(PLANT)), `the walk finds the PLANTED site in ${PLANT_REL} (${plantSaid(PLANT)}) — the census can see: non-vacuous by a plant, not by the list's debt (the live list: ${total} edits in ${Object.keys(per).length} scripts)`);
  const censusOf = (t) => { let ast = null; try { ast = acorn.parse(t, OPTS.module); } catch { return null; } return censusAll(t, { ast }); };   // a copy that does not parse: null, a red by name
  const unplanted = PLANT ? PLANT.src.split('\n').filter((l) => !l.startsWith('export const plantedCut')).join('\n') : '';
  const UNP = PLANT ? censusOf(unplanted) : null;
  ok(!!UNP && unplanted !== PLANT.src && !plantFound(UNP) && !UNP.edits.length && !UNP.helpers.length && UNP.paramEdits.length === 1, `RED CONTROL: the same censuses over a copy of the plant with plantedCut taken out find ${plantSaid(UNP)} — the leg above would go red — and still the other plant (${UNP ? UNP.paramEdits.length : '?'} of the second list: the census answered on the copy)`);
  // RED CONTROL of the FILTER (主开发 r2799): a copy of the walk's own pattern with its lib branch broken admits no plant — so a later
  // edit that breaks the filter loses the plant with the lists, and the plant legs above go red; the true filter admits it
  const BROKEN_RE = new RegExp(SCRIPT_RE.source.replace('(?:lib\\/)?', ''));
  ok(BROKEN_RE.source !== SCRIPT_RE.source && admitBy(SCRIPT_RE)(PLANT_REL) === PLANT_KEY && admitBy(BROKEN_RE)(PLANT_REL) === null && PLANT_SRC !== null, `RED CONTROL: the walk's filter admits the plant (${admitBy(SCRIPT_RE)(PLANT_REL)}; the walk met it: ${PLANT_SRC !== null}); a copy of it with the lib branch broken (${BROKEN_RE}) admits ${admitBy(BROKEN_RE)(PLANT_REL) || 'none'} — the plant legs would go red with the lists`);
  // THE SECOND LIST (B-0d3e slice 8, 主开发 r2678: «the new kind is counted APART: a second list of the same census with its own
  // fixture and its own founding pin, its one row B-0d3e … born with the planted control and no count floor»): scripts/lib/param-text-census.mjs
  // paramTextEdits — a plain edit whose TEXT is a helper's parameter or a loop's variable (no name bound to a product read: those
  // are the first list's), whose result is the text a loader runs or writes. One-way as the first list: a file over its row's count
  // is red by name, a count that falls is said; the founding row is pinned («param-text-edits») and only falls.
  const PFX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'param-text-edits.json'), 'utf-8'));
  const { caps: PLISTED, bad: PBAD } = capsOf(PFX, PINS['param-text-edits']);
  ok(!PBAD.length && !!PINS['param-text-edits'], `every count of scripts/fixtures/param-text-edits.json stands under a backlog row's id (${Object.keys(PFX.rows || {}).join(', ')}), its founding row pinned${PBAD.length ? ` — NO ROW ID: ${PBAD.join(' | ')}` : ''}`);
  const pper = Object.fromEntries(Object.entries(PARAMS).map(([f, e]) => [f, e.length]));
  const pj = judge(pper, PLISTED);
  const overP = overLines(pj.added, pper, PLISTED, PARAMS, (e) => `line ${e.line} ${e.text}`);
  ok(!overP.length, `the second list's edits (a text HANDED by a parameter or a loop, then loaded) never rise without a row's id beside it (the list ${Object.values(PLISTED).reduce((a, b) => a + b, 0)} in ${Object.keys(PLISTED).length} files; live ${Object.values(pper).reduce((a, b) => a + b, 0)} in ${Object.keys(pper).length})${overP.length ? ` — ${overP.length} file(s) over their count, EVERY ONE on its own line below (to admit one on purpose: a row under YOUR backlog id in scripts/fixtures/param-text-edits.json)` : ''}`);
  sayOver(overP);
  if (pj.fell.length) console.log(`    (${pj.fell.length} file(s) of the second list now carry fewer — not red; lower their rows when convenient: ${pj.fell.slice(0, 8).join(', ')}${pj.fell.length > 8 ? ', …' : ''})`);
  // ITS DOOR AND WALK ARE THE FIRST LIST'S (主开发 r2799's should): the module reads them by the same text, pinned here — the walk line,
  // the product read's patterns and the edit / loader door, each found verbatim in scripts/mutant-copy.mjs
  { const MC = fs.readFileSync(path.join(REPO, 'scripts', 'mutant-copy.mjs'), 'utf-8'), PT = fs.readFileSync(path.join(REPO, 'scripts', 'lib', 'param-text-census.mjs'), 'utf-8');
    const lineOf = (t, head) => (t.split('\n').find((l) => l.trim().startsWith(head)) || '').trim();
    const DOOR = "!/\\.(?:replace|replaceAll|join)\\(/.test(src) || !/(?:\\.load|\\.write|_compile|runIn\\w*Context|compileFunction|writeFileSync|new Function)\\(/.test(src)";
    const same = { walk: !!lineOf(PT, 'const walkAst = ') && MC.split('\n').some((l) => l.trim() === lineOf(PT, 'const walkAst = ')), read: !!lineOf(PT, 'const READ = ') && MC.includes(lineOf(PT, 'const READ = ')), door: PT.includes(DOOR) && MC.includes(DOOR) };
    ok(gateOf(same.walk) && gateOf(same.read) && verdictOf(same.door), `the second list's door and walk are the first list's own text (scripts/lib/param-text-census.mjs ≡ scripts/mutant-copy.mjs: walk ${same.walk}, product read ${same.read}, edit / loader door ${same.door})`); }
  // ITS PLANT and ITS RED: plantedHandedText in the same plant file — one edit of this list, none of the first's
  const plant2 = (c) => !!c && c.paramEdits.length === 1 && c.paramEdits[0].text === "text.replace('const ', 'let ')";
  ok(gateOf(plant2(PLANT)) && verdictOf(plantFound(PLANT)), `the walk finds the second list's PLANTED site in ${PLANT_REL} (plantedHandedText: ${PLANT ? PLANT.paramEdits.map((e) => `line ${e.line} ${e.text}`).join(', ') || 'none' : 'the walk did not meet it'}), and the first list's plant is unchanged by it (${plantSaid(PLANT)})`);
  const unplanted2 = PLANT ? PLANT.src.split('\n').filter((l) => !l.startsWith('export const plantedHandedText')).join('\n') : '';
  const UNP2 = PLANT ? censusOf(unplanted2) : null;
  ok(!!UNP2 && unplanted2 !== PLANT.src && !plant2(UNP2) && !UNP2.paramEdits.length && verdictOf(plantFound(UNP2)), `RED CONTROL: the same census over a copy of the plant with plantedHandedText taken out finds ${UNP2 ? UNP2.paramEdits.length : '?'} edit(s) of the second list — the leg above would go red — and still the first plant (${plantSaid(UNP2)}: the census answered on the copy)`);
  const overE = overLines(j.added, per, LISTED, EDITS, (e) => `line ${e.line} ${e.text}`);
  ok(!overE.length, `the unanchored control edits never rise without a row's id beside it (the list ${Object.values(LISTED).reduce((a, b) => a + b, 0)} in ${Object.keys(LISTED).length} files)${overE.length ? ` — ${overE.length} file(s) over their count, EVERY ONE on its own line below with all its edits: build the new edit with anchored() from scripts/scratch.mjs, or raise the file's count under YOUR backlog row's id in scripts/fixtures/unanchored-controls.json «rows» (a plain number is refused)` : ''}`);
  sayOver(overE);
  if (j.fell.length) console.log(`    (${j.fell.length} listed file(s) now carry fewer — not red; lower their rows when convenient: ${j.fell.slice(0, 8).join(', ')}${j.fell.length > 8 ? ', …' : ''})`);
  // THE CONTROLS — the door, the guard, the walk, the one-way rule
  const T = 'const x = 1;\nconst y = 2;\n';
  ok(anchored(T, 'const y = 2;', 'const y = 3;', 'plant') === 'const x = 1;\nconst y = 3;\n', 'anchored(): an anchor present once is replaced');
  const threw = (f) => { try { f(); return null; } catch (e) { return String(e.message); } };
  ok(verdictOf(/^ANCHOR GONE «plant-gone»/.test(threw(() => anchored(T, 'const z = 9;', '', 'plant-gone')) || '')), 'CONTROL: an anchor that is gone THROWS BY NAME («ANCHOR GONE» + the control\'s name)');
  ok(verdictOf(/^ANCHOR NOT UNIQUE «plant-two»: .* — 2 times/.test(threw(() => anchored(T, 'const ', 'let ', 'plant-two')) || '')), 'CONTROL: an anchor found twice THROWS BY NAME («ANCHOR NOT UNIQUE» + its count)');
  ok(anchored(T, /const (\w)/, 'let $1', 're', { count: 'any' }) === 'let x = 1;\nlet y = 2;\n' && verdictOf(/^ANCHOR GONE/.test(threw(() => anchored(T, /var /, '', 're-gone')) || '')), 'anchored(): a RegExp anchor (count any); a RegExp that matches nothing throws by name');
  const seen = []; const viaFn = anchored(T, 'const ', (m, at) => { seen.push(at); return 'let '; }, 'plant-fn', { count: 'any' });
  ok(anchored(T, /const y/y, 'let y', 're-sticky') === 'const x = 1;\nlet y = 2;\n' && gateOf(/^ANCHOR MATCHES NOTHING «re-empty»/.test(threw(() => anchored(T, /z*/, '!', 're-empty', { count: 'any' })) || ''))
    && viaFn === 'let x = 1;\nlet y = 2;\n' && seen.join() === '0,13',
    'anchored(): a sticky RegExp is found anywhere (its flag ignored); one that can match the empty string is refused by name; a replacer is called once per match with its offset, whatever the count');
  const MUT = mutantCopies('files-parse-b0d3e', REPO);
  const real = fs.readFileSync(path.join(REPO, 'src/pairing-token.js'), 'utf-8');
  ok(verdictOf(/^CONTROL BUILT NOTHING: the copy of src\/pairing-token\.js \(«gone-anchor»\)/.test(threw(() => MUT.write('src/pairing-token.js', real.replace('a line no file has', ''), 'gone-anchor')) || '')), 'CONTROL: a mutant copy byte-identical to its file (its edit found no anchor) FAILS BY NAME in scripts/mutant-copy.mjs');
  ok(!threw(() => MUT.write('src/pairing-token.js', real, 'deliberate', { same: true })) && !threw(() => MUT.write('src/pairing-token.js', real, null, { name: 'closed-world-copy' })) && !threw(() => MUT.write('src/pairing-token.js', real + '\n// planted', 'edited')), 'a deliberate unpatched copy says so ({ same: true }, or a closed world\'s name); a real edit writes');
  const P = (body) => `import fs from 'node:fs';\nconst src = fs.readFileSync(path.join(REPO, 'src/x.js'), 'utf8');\n${body}\n`;
  // THE SECOND LIST'S RULES (B-0d3e slice 8), each pinned by a planted script (P builds it: a product read, then the body; `true` = the body alone)
  const CASES2 = [
    ["const def = (mutate) => { const out = mutate(src); return MUT.load('src/x.js', out, 't'); }; const m = def((s) => s.replace('a', 'b'));", 0, "NOT FOLLOWED, a stated limit (主开发 r2799): a text handed to an ARROW given as an argument (test-frp-plugin's mutantDef), edited there, then loaded"],
    ["const cut = (s, a, b) => MUT.load('src/x.js', s.replace(a, b), 't');", 1, "a helper HANDED the text: its edit is the text a copy loads"],
    ["const m = MUT.load('src/x.js', [['a', 'b']].reduce((t, [a, b]) => t.replace(a, b), src), 't');", 1, "a fold's step: the fold's answer is the copy's text"],
    ["const f = (s) => { for (const [a, b] of [['a', 'b']]) s = s.replace(a, b); return s; }; const m = MUT.load('src/x.js', f(src), 't');", 1, "a loop's edit in a helper whose call is a copy's text"],
    ["const sw = (s, a, b) => s.replace(a, b); const m = MUT.load('src/x.js', sw(src, 'a', 'b'), 't');", 1, "a helper that returns its edit, its call a copy's text"],
    ["const g = (s) => { const out = s.replace('a', 'b'); return MUT.load('src/x.js', out, 't'); };", 1, "held in a name the copy's text names"],
    ["const w = (s) => fs.writeFileSync('out/x.js', s.replace('a', 'b'));", 1, "writeFileSync's data"],
    ["const nf = (s) => new Function('x', s.replace('a', 'b'));", 1, "new Function's body (its last argument)"],
    ["const g = (name) => MUT.load('src/x.js', src, name.replace(/\\W+/g, '-'));", 0, "a copy's NAME edited is no control"],
    ["const g = (k) => fs.writeFileSync('out/x', JSON.stringify({ k: k.replace(/x/g, 'y') }));", 0, "an edit nested in written data hands nothing on whole"],
    ["function editAnchor(text, from, to) { return text.replace(from, to); } const m = MUT.load('src/x.js', editAnchor(src, 'a', 'b'), 't');", 0, "the edit inside editAnchor itself"],
    ["const g = (s) => MUT.load('src/x.js', s.replace(\"require('./y.js')\", 'z'), 't');", 0, "a module path re-bound (a literal naming require)"],
    ["const g = (s) => MUT.load('src/x.js', s.replace('a', 'b'), 't');\n", 0, "a script that reads no product file (the door)", true],
    ["const g = (src) => MUT.load('src/x.js', src.replace('a', 'b'), 't');", 0, "a parameter that shares a product binding's name is the first list's"],
    ["const c = editAnchor(src, 'q', 'r', 'f'); const g = (c) => MUT.load('src/x.js', c.replace('a', 'b'), 't');", 0, "a name bound to a cured link is the first list's"],
    ["const g = (s) => MUT.load('src/x.js', s.replace('a', 'b').replace('c', 'd'), 't');", 2, "each link of a chain the copy loads (the chain step)"],
    ["const sw = (s, a, b) => { return s.replace(a, b); }; const m = MUT.load('src/x.js', sw(src, 'a', 'b'), 't');", 1, "a helper's return in a block body"],
    ["for (const t of [src]) MUT.load('src/x.js', t.replace('a', 'b'), 't');", 1, "a loop's variable as the text"],
    ["const g = (s) => MUT.load('src/x.js', editAnchor(s.replace('a', 'b'), 'c', 'd', 'f'), 't');", 1, "an edit handed on through a cure's text argument"],
    ["const pre = [['a', 'b']].reduce((x, [a, b]) => x.replace(a, b), src); fs.writeFileSync('out/x.js', pre);", 1, "a fold's answer held in a name the data is"],
    ["const f = (s) => [['a', 'b']].reduce((t, [a, b]) => t.replace(a, b), s); const m = MUT.load('src/x.js', f(src), 't');", 1, "a helper whose body is a fold"],
    ["const m = MUT.load('src/x.js', [['a', 'b']].reduce((t, [a, b]) => { return t.replace(a, b); }, src), 't');", 1, "a fold's step with a block body"],
    ["const r = (s) => vm.runInContext(s.replace('a', 'b'), {});", 1, "a vm run in a context (its first argument)"],
    ["const g = (k) => { const v = k.replace('a', 'b'); return MUT.load('src/x.js', src.replace('A', v), 't'); };", 0, "a name only PART of a copy's text (a replacement value) hands nothing on whole"],
    ["const sw = (s) => s.replace('a', 'b'); const m = MUT.load('src/x.js', src.replace('A', sw('x')), 't');", 0, "a helper's call only PART of a copy's text hands nothing on whole"],
    ["const editAnchor = (t, f, to) => t.replace(f, to); const m = MUT.load('src/x.js', editAnchor(src, 'a', 'b'), 't');", 0, "the cure bound as an arrow"],
  ];
  const miss2 = CASES2.map(([body, want, why, raw]) => { const t = raw ? body : P(body); const got = paramTextEdits(t).length, viaWalk = censusAll(t, { ast: acorn.parse(t, OPTS.module) }).paramEdits.length; return [got, viaWalk, want, why]; }).filter(([g, v, w]) => g !== w || v !== w);
  ok(!miss2.length, `CONTROL: the second list's ${CASES2.length} rules each answer as planted, alone and through the one walk${miss2.length ? ' — ' + miss2.map(([g, v, w, why]) => `«${why}»: ${g} alone / ${v} by the walk, ${w} meant`).join(' | ') : ''}`);
  const nA = unanchoredEdits(P("const m = MUT.load('src/x.js', src.replace('a', 'b'), 't');")).length;
  const nB = unanchoredEdits(P("const m = MUT.load('src/x.js', anchored(src, 'a', 'b', 't'), 't');")).length;
  const nC = unanchoredEdits(P("const code = src.replace(/\\/\\/.*$/gm, ''); ok(code.includes('x'), 'read'); const real = MUT.load('src/x.js', src, 'as-is', { same: true });")).length;
  const nD = unanchoredEdits(P("const p = src.replace('a', 'b').replace('c', 'd'); const f = new Function(p);")).length;
  ok(nA === 1 && nB === 0 && nC === 0 && nD === 2, `CONTROL: the walk finds a replace-then-load (1), never an anchored() edit (0) nor a read that feeds no loader (0), and each link of a chain bound once and loaded (2) — ${[nA, nB, nC, nD].join(' / ')}`);
  // B-7e49 (主开发 r2206): THE ONE WALK — §1 reads both censuses through scriptCensus (one walk an AST); planted scripts, one a door
  // each way, answer there exactly what the two calls answer — the planted edit and the planted helper found, neither lost
  const BOTH = P("const cut = (from, to) => { if (src.split(from).length !== 2) return null; return MUT.load('src/x.js', src.replace(from, to), 't'); };");
  const E_ONLY = P("const m = MUT.load('src/x.js', [src, ';'].join(''), 't');");   // the edits' door only (a product read, a join, a loader)
  const H_ONLY = "const t = 'x';\nconst cut = (from, to) => { if (t.split(from).length !== 2) return null; return MUT.load('src/x.js', t.replace(from, to), 't'); };\n";
  const NONE = 'const x = 1;\n';
  const one = (t) => { const f = scriptCensus(t, { ast: acorn.parse(t, OPTS.module) }); return { e: f.edits, h: f.helpers, same: JSON.stringify(f.edits) === JSON.stringify(unanchoredEdits(t)) && JSON.stringify(f.helpers) === JSON.stringify(anchorHelpers(t)) }; };
  const fb = one(BOTH), fe = one(E_ONLY), fh = one(H_ONLY), fn0 = one(NONE);
  ok(gateOf(fb.same) && fb.e.length === 1 && fb.h.length === 1 && gateOf(fe.same) && fe.e.length === 0 && fe.h.length === 0 && gateOf(fh.same) && fh.e.length === 0 && fh.h.length === 1 && gateOf(fn0.same) && !fn0.e.length && !fn0.h.length,
    `CONTROL (B-7e49): the ONE walk answers what the two calls answer — a script both doors admit ${fb.e.length} edit / ${fb.h.length} helper (the plants found), the edits' door alone ${fe.e.length} / ${fe.h.length}, the helpers' door alone ${fh.e.length} / ${fh.h.length}, neither ${fn0.e.length} / ${fn0.h.length}`);
  // B-0d3e's reach (lane lg-text-legs-2): a chain is followed to its read THROUGH a cured link (a suite's editAnchor, scratch.mjs
  // anchored()), inline or held in a name — before it, a call base was no name and an edit appended after a cure was invisible
  // (2.369.414 held nine in five suites, test-cli-level-scan's path-only control among them). Only a REBASE of module paths is
  // left out: every match, a relative path and no module's name in the pattern, a replacement that re-roots each path the same way
  const nE = unanchoredEdits(P("const m = MUT.load('src/x.js', editAnchor(src, 'a', 'b', 'src/x.js').replace('c', 'd'), 't');")).length;
  const nE2 = unanchoredEdits(P("const m = MUT.load('src/x.js', anchored(src, 'a', 'b', 't').split('c').join('d'), 't');")).length;
  const nE3 = unanchoredEdits(P("const c = editAnchor(src, 'a', 'b', 'src/x.js'); const m = MUT.load('src/x.js', c.replace('c', 'd'), 't');")).length;
  const nE4 = unanchoredEdits(P("let c; c = anchored(src, 'a', 'b', 't'); const m = MUT.load('src/x.js', c.replace('c', 'd'), 't');")).length;
  ok(nE === 1 && nE2 === 1 && nE3 === 1 && nE4 === 1, `CONTROL (the planted red): a SECOND EDIT appended to a cured chain is counted — after editAnchor() ${nE}, after anchored() ${nE2}, after a cured link held in a name ${nE3} / assigned to one ${nE4} (1 each; the census before followed no cured link and counted 0)`);
  const L = (e) => `const m = MUT.load('src/x.js', ${e}, 't');`, G = "src.replace(/require\\('\\.\\/([\\w-]+\\.js)'\\)/g, ";
  const CASES = [   // [the body, the count meant, what it is] — a REBASE (0), then one look-alike per rule it must keep counted (1)
    [L("anchored(anchored(src, 'a', 'b', 't'), 'c', 'd', 't2').replace(/require\\('\\.\\//g, `require('${ROOT}/`)"), 0, 'cured links chained, then a prefix rebase'],
    [L("src.replace(/require\\('\\.\\.\\//g, `require('${path.join(ROOT, 'src')}/`)"), 0, 'a prefix rebase to a plain path call'],
    [L(G + "(_, f) => 'require(' + JSON.stringify(path.join(ROOT, f)) + ')')"), 0, 'a rebase by a function of the captured name'],
    ["const S = JSON.stringify; " + L("src.replace(/from '\\.\\.\\/([^']+)'/g, (m, f) => `from ${S(path.join(ROOT, f))}`)"), 0, 'the same through a name bound to a plain call'],
    [L("src.split(\"require('../\").join(`require('${ROOT}/`)"), 0, 'a split/join prefix rebase (its pattern is split\'s)'],
    [L(G + "(_, f) => 'require(' + JSON.stringify(map[f]) + ')')"), 1, 'a lookup x[y]'],
    [L(G + "(_, f) => 'require(' + JSON.stringify(f === 'a.js' ? FAKE : path.join(ROOT, f)) + ')')"), 1, 'a choice ?:'],
    [L(G + "(_, f) => 'require(' + JSON.stringify(path.join(ROOT, f || 'index.js')) + ')')"), 1, 'a choice ||'],
    [L(G + "function (_, f) { if (f === 'a.js') return FAKE; return 'require(' + JSON.stringify(path.join(ROOT, f)) + ')'; })"), 1, 'a choice by if'],
    [L(G + "function (_, f) { switch (f) { default: return 'require(' + JSON.stringify(path.join(ROOT, f)) + ')'; } })"), 1, 'a choice by switch'],
    [L(G + "function (_, f) { let r; for (r of [f]); return 'require(' + JSON.stringify(path.join(ROOT, r)) + ')'; })"), 1, 'a loop'],
    [L(G + "(_, f) => 'require(' + JSON.stringify(path.join(ROOT, pick(f))) + ')')"), 1, 'a call that is not a path\'s own (a lookup by call)'],
    [L(G + "(m) => m + ' ')"), 1, 'the whole match, no captured name read'],
    [L(G + "() => \"require('./fake.js')\")"), 1, 'one module named for every path'],
    [L(G + "\"require('./fake.js')\")"), 1, 'a captured name, a fixed string for it'],
    [L("src.replace(/require\\('\\.\\/store\\.js'(\\))/g, (_, close) => \"require('./fake.js'\" + close)"), 1, 'a fixed module in the pattern, its tail caught'],
    [L("src.replace(/require\\('\\.\\/(store)\\.js'\\)/g, (_, f) => 'require(' + JSON.stringify(path.join(ROOT, f + '.js')) + ')')"), 1, 'a group that fixes the name'],
    [L("src.replace(/require\\('\\.\\//g, () => `require('${FAKE}/`)"), 1, 'a prefix pattern with a function'],
    [L("src.replace(/require\\('\\.\\//g, `require('${useMut ? MUTDIR : ROOT}/`)"), 1, 'a choice inside a prefix template'],
    [L("src.replace(/'\\.\\//g, `'${ROOT}/`)"), 1, 'a relative path with no require / import / from'],
    [L("src.split(\"require('./store.js')\").join(\"require('./fake.js')\")"), 1, 'a fixed module swapped'],
    [L("src.replace(/require\\('\\.\\//, `require('${ROOT}/`)"), 1, 'the first match only'],
    [L("src.replace(\"require('../\", `require('${ROOT}/`)"), 1, 'a string prefix, the first match only'],
    [L("src.replace(\"require('./a.js')\", 'R')"), 1, 'one require, not every'],
    [L("src.replaceAll('moved from the queue', 'R')"), 1, 'prose that says «from»'],
    [L("src.split('a').join(\"require('../\")"), 1, 'a path in the REPLACEMENT is no pattern'],
    [L("src.replace(/^import [^\\n]*\\n/gm, '')"), 1, 'import lines stripped (no relative path)'],
    ["const from = 'a', to = 'b'; " + L('src.split(from).join(to)'), 1, 'an anchor held in a variable named «from»'],
  ];
  const caseMiss = CASES.map(([body, want, why]) => [unanchoredEdits(P(body)).length, want, why]).filter(([got, want]) => got !== want);
  // the ONE walk answers these as the lone calls do, for BOTH of the first list's censuses (主开发 r2799's should: before, only the
  // second list's cases compared them)
  const parity1 = CASES.filter(([body]) => { const t = P(body), w = censusAll(t, { ast: acorn.parse(t, OPTS.module) }); return JSON.stringify(w.edits) !== JSON.stringify(unanchoredEdits(t)) || JSON.stringify(w.helpers) !== JSON.stringify(anchorHelpers(t)); }).map(([, , why]) => why);
  ok(!parity1.length, `CONTROL: the one walk (censusAll) answers the first list's ${CASES.length} planted scripts as unanchoredEdits and anchorHelpers alone do${parity1.length ? ' — DIFFERS: ' + parity1.join(' | ') : ''}`);
  ok(caseMiss.length === 0, `CONTROL: only a REBASE of module paths is left out — ${CASES.filter((c) => c[1] === 0).length} rebases not counted, ${CASES.filter((c) => c[1] === 1).length} look-alikes counted${caseMiss.length ? ' — WRONG: ' + caseMiss.map(([g, w, y]) => `${y} ${g} (meant ${w})`).join(' · ') : ''}`);
  const jA = judge({ 'test-new.mjs': 1, 'test-old.mjs': 3 }, { 'test-old.mjs': 3 }), jB = judge({ 'test-old.mjs': 1 }, { 'test-old.mjs': 3 });
  ok(jA.added.join() === 'test-new.mjs' && !jB.added.length && jB.fell.join() === 'test-old.mjs', 'CONTROL: a file that ADDS an unanchored edit is red by name; one whose count falls is only said (the one-way rule)');
  const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`test-over-${i}.mjs`, Array.from({ length: 30 }, (_, k) => ({ line: k + 1, text: 'src.replace(' + 'x'.repeat(90) + ')' }))]));
  const mper = Object.fromEntries(Object.entries(many).map(([f, e]) => [f, e.length])), mj = judge(mper, {});
  const whole = overLines(mj.added, mper, {}, many, (e) => `line ${e.line} ${e.text}`);
  // RED: the old edits message exactly — six files, each with its advice, through ok()'s 600-character cut of the detail
  const oldCut = JSON.stringify(mj.added.slice(0, 6).map((f) => `${f}: ${mper[f]} > 0 — a new edit: ${many[f].slice(0, 2).map((e) => `line ${e.line} ${e.text}`).join(' · ')} — build it with anchored() from scripts/scratch.mjs, or raise its count to ${mper[f]} under YOUR backlog row\'s id in scripts/fixtures/unanchored-controls.json «rows» (a plain number is refused)`)).slice(0, 600);
  const printed = []; sayOver(whole, (x) => printed.push(x));
  const named = (s) => Object.keys(many).filter((f) => s.includes(f)).length;
  ok(whole.length === 9 && gateOf(whole.every((l, i) => l.startsWith(`test-over-${i}.mjs: 30 > 0 — line 1 `) && l.includes(' · line 30 '))) && printed.length === 9 && gateOf(printed.every((l, i) => l === '      ' + whole[i])) && named(printed.join('\n')) === 9 && named(oldCut) < 6,
    `CONTROL: an over-count red names EVERY file, one printed line each, whole, with all its items — 9 files over their counts ⇒ ${printed.length} printed lines naming ${named(printed.join('\n'))}; RED (the old edits message: six files, its detail cut at 600 characters) named ${named(oldCut)}, under the six its slice kept`);
  const W19 = 'a why of nineteen c'.slice(0, 19), W20 = 'a why of twenty char'.slice(0, 20), row = (why, files) => ({ why, files });
  const cA = capsOf({ files: { 'test-a.mjs': 2 } }), cB = capsOf({ rows: { 'X-1': row('a row id that is no backlog id at all', { 'test-a.mjs': 2 }) } });
  const cC = capsOf({ rows: { 'B-0001': row(W19, { 'test-a.mjs': 2 }) } }), cC20 = capsOf({ rows: { 'B-0001': row(W20, { 'test-a.mjs': 2 }) } });
  const cN = capsOf({ rows: { 'B-0001': row('a count written as a word is no count', { 'test-a.mjs': 'two' }) } });
  const cD = capsOf({ rows: { 'B-0001': row('the first list of this census, counted in once', { 'test-a.mjs': 2 }), 'B-0002': row('a unit that raised one file under its own row', { 'test-a.mjs': 3 }) } });
  ok(cA.bad.length === 1 && gateOf(/plain «files»/.test(cA.bad[0])) && cB.bad.length === 1 && gateOf(/row «X-1»: its id is no backlog id/.test(cB.bad[0]))
    && cC.bad.length === 1 && gateOf(/row «B-0001»: a why of fewer than 20 characters/.test(cC.bad[0])) && !cC20.bad.length
    && cN.bad.length === 1 && gateOf(/a count that is not a whole number \(test-a\.mjs: "two"\)/.test(cN.bad[0]))
    && !cD.bad.length && cD.caps['test-a.mjs'] === 3
    && judge({ 'test-a.mjs': 4 }, cD.caps).added.join() === 'test-a.mjs' && !judge({ 'test-a.mjs': 3 }, cD.caps).added.length && judge({ 'test-a.mjs': 1 }, cD.caps).fell.join() === 'test-a.mjs',
    'CONTROL: a count with no row id beside it is RED by its words — a plain «files» map, an id that is no B-xxxx, a why of 19 characters (20 holds), a count that is not a whole number; a file\'s cap is the largest count any row gives it — one over it is a rise (red), at it held, under it a fall (said)');
  const PIN = { row: 'B-0001', total: 2, files: { 'test-a.mjs': 2 } };
  const fRaised = capsOf({ rows: { 'B-0001': row('the founding list, raised by one in place', { 'test-a.mjs': 3 }) } }, PIN);
  const fNew = capsOf({ rows: { 'B-0001': row('the founding list as it was pinned', { 'test-a.mjs': 2 }), 'B-0002': row('a unit that raised one file under its own row', { 'test-a.mjs': 3 }) } }, PIN);
  const fFell = capsOf({ rows: { 'B-0001': row('the founding list after a file fell', { 'test-a.mjs': 1 }) } }, PIN);
  const fFile = capsOf({ rows: { 'B-0001': row('the founding list given a file it never had', { 'test-a.mjs': 2, 'test-b.mjs': 1 }) } }, PIN);
  ok(fRaised.bad.length === 1 && gateOf(/the founding row «B-0001» raised above its pin \(test-a\.mjs 3 > its pin 2\) — it is fall-only: add a row under YOUR OWN backlog id/.test(fRaised.bad[0]))
    && !fNew.bad.length && fNew.caps['test-a.mjs'] === 3 && !fFell.bad.length && fFile.bad.length === 1 && verdictOf(/test-b\.mjs 1 > its pin 0/.test(fFile.bad[0])),
    'CONTROL: THE FOUNDING ROW IS FALL-ONLY — raised above its pin in place is RED by name (and a file it never had), the same rise as a NEW row under its own id holds, a fall holds');
  // THE ANCHOR HELPERS (the row's «every helper that builds a control from an anchor»): a function whose own parameter is
  // an anchor and whose body reaches a loader FAILS BY NAME — it throws or checks ABOUT the anchor (B-287c: under a test of it,
  // or judging its edit / test), or it builds through anchored(). The ones that
  // answer null or an unpatched copy instead are listed in scripts/fixtures/anchor-helpers.json, ONE-WAY like the edits:
  // a file that adds one is red by name (a new helper takes scratch.mjs anchored()); a fall is said.
  const HFX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'anchor-helpers.json'), 'utf-8'));
  const { caps: HLISTED, bad: HBAD } = capsOf(HFX, PINS['anchor-helpers']);
  ok(!HBAD.length, `every count of scripts/fixtures/anchor-helpers.json stands under a backlog row's id (${Object.keys(HFX.rows || {}).join(', ')})${HBAD.length ? ` — NO ROW ID: ${HBAD.join(' | ')}` : ''}`);
  const hper = Object.fromEntries(Object.entries(HELPERS).map(([f, h]) => [f, h.length]));
  const htotal = Object.values(hper).reduce((a, b) => a + b, 0), hj = judge(hper, HLISTED);
  console.log(`    ${htotal} anchor helper(s) in ${Object.keys(hper).length} script(s) answer null or an unpatched copy when their anchor moves (the controls below prove the walk finds one)`);
  const overH = overLines(hj.added, hper, HLISTED, HELPERS, (h) => `line ${h.line} ${h.name}`);
  ok(!overH.length, `the anchor helpers that do not fail by name never rise without a row's id beside it (the list ${Object.values(HLISTED).reduce((a, b) => a + b, 0)} in ${Object.keys(HLISTED).length} files)${overH.length ? ` — ${overH.length} file(s) over their count, EVERY ONE on its own line below with all its helpers: build the new one through scripts/scratch.mjs anchored() (it throws «ANCHOR GONE» by the control's name), or raise the file's count under YOUR backlog row's id in scripts/fixtures/anchor-helpers.json «rows»` : ''}`);
  sayOver(overH);
  if (hj.fell.length) console.log(`    (${hj.fell.length} listed file(s) now carry fewer helpers — not red; lower their rows when convenient: ${hj.fell.slice(0, 8).join(', ')}${hj.fell.length > 8 ? ', …' : ''})`);
  // a listed helper that stays on purpose says why («<file>#<name>»: a control skipped by name on a base without its line, or a caller that names the anchor)
  const HWHY = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'anchor-helpers.json'), 'utf-8')).why || {};
  const whyDead = Object.keys(HWHY).filter((k) => { const [f, n] = k.split('#'); return !(HELPERS[f] || []).some((h) => h.name === n); });
  ok(verdictOf(Object.values(HWHY).every((w) => typeof w === 'string' && w.length >= 20)), `every helper that stays on purpose says why (${Object.keys(HWHY).length} in the list)`);
  if (whyDead.length) console.log(`    (${whyDead.length} why row(s) name no live helper — not red; drop them: ${whyDead.join(', ')})`);
  const H = (body) => anchorHelpers(P(body)).length;
  const hA = H("const cut = (from, to) => { if (src.split(from).length !== 2) return null; return MUT.load('src/x.js', src.replace(from, to), 't'); };");
  const hB = H("const cut = (from, to) => { if (!src.includes(from)) throw new Error('ANCHOR GONE ' + from); return MUT.load('src/x.js', src.replace(from, to), 't'); };");
  const hC = H("const strip = (re) => src.replace(re, ''); ok(strip(/x/).length > 0, 'n'); const real = MUT.load('src/x.js', src, 'as-is', { same: true });");
  const hD = H("function swap(a, b) { return require(MUT.write('src/x.js', anchored(src.replace('k', 'k'), a, b, 'swap'), 'swap')); }");
  const hE = H("const patch = (from, to, tag) => { const m = src.replace(from, to); ok(m !== src, `CONTROL (${tag}): the patch applies`); return MUT.load('src/x.js', m, tag); };");
  ok(hA === 1 && hB === 0 && hC === 0 && hD === 0 && hE === 0, `CONTROL: the helper walk finds a cut that answers null (1), never one that throws by name (0), one whose body reaches no loader (0), one that builds through anchored() (0) nor one that reports through the suite's check (0) — ${[hA, hB, hC, hD, hE].join(' / ')}`);
  // B-287c (lane bl-tests-e): «fails by name» is a throw or a check ABOUT the anchor — the old walk counted ANY throw or check in the
  // body, so an unrelated one let a helper that answers null pass. The plants wanting 1 are that hole (each read 0 under «any»);
  // the plants wanting 0 guard against narrowing too far (a check that judges the anchor, a throw under a test of its edit's
  // result, a throw under a `?:` on it, a check under a `||` on it)
  const PLANTS287 = [
    ['an unrelated throw', 1, "const cut = (from, to) => { if (!fs.existsSync(f)) throw new Error('no file ' + f); if (src.split(from).length !== 2) return null; return MUT.load('src/x.js', src.replace(from, to), 't'); };"],
    ['an unrelated check', 1, "const cut = (from, to) => { ok(fs.existsSync(f), 'the file is there'); return MUT.load('src/x.js', src.replace(from, to), 't'); };"],
    ['a check that judges the anchor', 0, "const cut = (from, to) => { ok(src.includes(from), `CONTROL: the anchor ${from} is there`); return MUT.load('src/x.js', src.replace(from, to), 't'); };"],
    ['a throw under a test of its edit\'s result', 0, "const cut = (from, to) => { const parts = src.split(from); if (parts.length !== 2) throw new Error('moved'); return MUT.load('src/x.js', parts.join(to), 't'); };"],
    ['a throw under a ?: on the anchor', 0, "const cut = (from, to) => (src.split(from).length === 2 ? MUT.load('src/x.js', src.replace(from, to), 't') : (() => { throw new Error('moved'); })());"],
    ['a check under a || on the anchor', 0, "const cut = (from, to) => { src.includes(from) || ok(false, 'moved'); return MUT.load('src/x.js', src.replace(from, to), 't'); };"],
    ['a check naming the anchor only in its message (a template)', 1, "const cut = (from, to) => { ok(fs.existsSync(f), `the anchor ${from}`); return MUT.load('src/x.js', src.replace(from, to), 't'); };"],
    ['a check naming the anchor only in its message (a concatenation)', 1, "const cut = (from, to) => { ok(fs.existsSync(f), 'the anchor ' + from); return MUT.load('src/x.js', src.replace(from, to), 't'); };"],
    ['a throw naming the anchor under an unrelated test', 1, "const cut = (from, to) => { if (!fs.existsSync(f)) throw new Error('no file for ' + from); return MUT.load('src/x.js', src.replace(from, to), 't'); };"],
    ['a check judging a value merely HANDED the edit', 1, "const cut = (from, to) => { const p = MUT.write('src/x.js', src.replace(from, to), 't'); ok(fs.existsSync(p), 'written'); return require(p); };"],
    // B-1747 (r3179): the guard tool's wraps judge the value they hold — a check of the anchor under one still fails by name
    ['a check that judges the anchor through the guard tool\'s verdictOf', 0, "import { verdictOf } from './lib/check.mjs'; const cut = (from, to) => { const m = src.replace(from, to); ok(verdictOf(m !== src), 'CONTROL: the patch applies'); return MUT.load('src/x.js', m, 't'); };"],
    ['a check that judges the anchor through its gate (gateOf)', 0, "import { gateOf } from './lib/check.mjs'; const cut = (from, to) => { ok(gateOf(src.includes(from)) && 1 === 1, 'the anchor is there'); return MUT.load('src/x.js', src.replace(from, to), 't'); };"],
    ['a check that judges the anchor through the alias (verdictOfGuard)', 0, "import { verdictOf as verdictOfGuard } from './lib/check.mjs'; const cut = (from, to) => { ok(verdictOfGuard(src.split(from).length === 2), 'the anchor stands once'); return MUT.load('src/x.js', src.replace(from, to), 't'); };"],
    // r3293 (2): a function of the FILE's OWN named like the checker's is no wrap — the walk does not read through it
    ['a check through a function of the file\'s own named verdictOf (no import)', 1, "const verdictOf = (x) => true; const cut = (from, to) => { const m = src.replace(from, to); ok(verdictOf(m !== src), 'CONTROL: the patch applies'); return MUT.load('src/x.js', m, 't'); };"],
    // the reader's find: an imported verdictOf that a block binds AGAIN is that block's function there — not read through
    ['a check through an imported verdictOf that a block binds again', 1, "import { verdictOf } from './lib/check.mjs'; const cut = (from, to) => { const verdictOf = (x) => true; const m = src.replace(from, to); ok(verdictOf(m !== src), 'CONTROL: the patch applies'); return MUT.load('src/x.js', m, 't'); };"],
  ];
  const got287 = PLANTS287.map(([n, want, body]) => [n, want, H(body)]);
  ok(verdictOf(got287.every(([, want, got]) => got === want)), `CONTROL (B-287c): each plant is judged by what it is about — ${got287.map(([n, want, got]) => `${n} ${got}${got === want ? '' : ` (want ${want})`}`).join(' · ')}`);
  // RED (B-1747, r3179): the walk WITHOUT its look-through reads the three wrapped checks as helpers that do not fail by name
  const MUTX = mutantCopies('suite-files-parse-wrap', REPO), MCSRC = fs.readFileSync(path.join(REPO, 'scripts', 'mutant-copy.mjs'), 'utf-8');
  const LOOK = "      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && CHECKER.has(n.callee.name) && n.arguments.length === 1) return ofAnchor(n.arguments[0]);\n";
  const NOLOOK = await import(pathToFileURL(MUTX.write('scripts/mutant-copy.mjs', anchored(MCSRC, LOOK, '', 'the walk without the look-through'), 'mc-no-look')).href);
  const wrapped = PLANTS287.filter(([n]) => /guard tool's verdictOf|its gate \(gateOf\)|the alias \(verdictOfGuard\)/.test(n));
  const red = wrapped.map(([n, , body]) => [n, NOLOOK.anchorHelpers(P(body)).length]);
  ok(wrapped.length === 3 && verdictOf(red.every(([, got]) => got === 1)), `RED (the walk without its look-through through the guard tool's wraps): each wrapped check reads as a helper that does not fail by name — ${red.map(([n, got]) => `${n} ${got}`).join(' · ')}`);
  // RED (the reader's find): the walk WITHOUT its alone rule reads through the block's own verdictOf — the plant reads 0
  const ALONE = "    for (const nm of [...CHECKER]) if (seen.get(nm) !== 1) CHECKER.delete(nm);\n";
  const NOALONE = await import(pathToFileURL(MUTX.write('scripts/mutant-copy.mjs', anchored(MCSRC, ALONE, '', 'the walk without the alone rule'), 'mc-no-alone')).href);
  const shadow = PLANTS287.filter(([n]) => /a block binds again/.test(n)), redA = shadow.map(([n, , body]) => [n, NOALONE.anchorHelpers(P(body)).length]);
  ok(shadow.length === 1 && verdictOf(redA.every(([, got]) => got === 0)), `RED (the walk without its alone rule): the check through a block's own verdictOf reads as looked through — ${redA.map(([n, got]) => `${n} ${got}`).join(' · ')}`);
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
