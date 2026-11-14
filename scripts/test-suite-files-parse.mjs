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
import { fileURLToPath } from 'node:url';
import { scratchDir } from './scratch.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const acorn = createRequire(path.join(REPO, 'package.json'))('acorn');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };

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
const tryParse = (src, kind) => { try { acorn.parse(src, OPTS[kind]); return null; } catch (e) { return e; } };

/** The files under <root>/scripts that do not parse: [{ file, line, column, kind, message }]; plus what was read. */
export function unparseable(root) {
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
  }
  return { files, bad, kinds, bytes };
}
const said = (b) => `${b.file}:${b.line}:${b.column} ${b.message} (read as ${b.kind === 'detect' ? 'Node detects it' : b.kind})`;

console.log('§1 THE TREE — every file under scripts/ that Node would load as code parses as the module kind it is');
{
  const t0 = performance.now();
  const r = unparseable(REPO);
  const ms = Math.round(performance.now() - t0);
  ok(r.files.length >= 1000 && r.files.includes('scripts/ci.mjs') && r.files.includes('scripts/test-suite-files-parse.mjs'),
    `the walk met ${r.files.length} files (${(r.bytes / 1e6).toFixed(1)} MB: ${r.kinds.module} ES modules, ${r.kinds.commonjs} CommonJS, ${r.kinds.detect} by Node's detection), this suite and scripts/ci.mjs among them`);
  ok(r.bad.length === 0, `EVERY ONE PARSES (${ms} ms)${r.bad.length ? ` — ${r.bad.length} DO NOT:\n      ${r.bad.map(said).join('\n      ')}` : ''}`);
  const tops = fs.readdirSync(path.join(REPO, 'scripts')).filter((n) => /^test-.*\.mjs$/.test(n)).map((n) => `scripts/${n}`);
  ok(tops.length > 500 && tops.every((f) => r.files.includes(f)), `every scripts/test-*.mjs (${tops.length}) is among them`);
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
    ok(reds['scripts/test-cut-call.mjs'] && reds['scripts/test-cut-call.mjs'].line === 5,
      'the mid-line comment that cuts a call is RED by its file and the line the parse stopped at (5, under the cut on 4)', reds['scripts/test-cut-call.mjs'] && said(reds['scripts/test-cut-call.mjs']));
    ok(reds['scripts/measure-cut-arrow.mjs'] && reds['scripts/measure-cut-arrow.mjs'].line === 2, 'the arrow whose return the comment took is RED by file and line', reds['scripts/measure-cut-arrow.mjs'] && said(reds['scripts/measure-cut-arrow.mjs']));
    ok(!reds['scripts/tla.mjs'] && reds['scripts/tla.cjs'], 'top-level await: green as an ES module, RED as CommonJS');
    ok(!reds['scripts/ret.cjs'] && reds['scripts/ret.mjs'], 'a top-level return: green as CommonJS (Node wraps it), RED as an ES module');
    ok(!reds['scripts/hashbang.mjs'] && !reds['scripts/fixtures/detect/esm.js'] && !reds['scripts/fixtures/detect/cjs.js'] && !reds['scripts/fixtures/typed/a.js'],
      'a hashbang, a .js ES module by Node\'s detection, a .js CommonJS file and a .js under "type": "module" are all green');
    ok(reds['scripts/fixtures/typed2/b.js'] && reds['scripts/fixtures/typed2/b.js'].kind === 'commonjs', 'module syntax in a .js under "type": "commonjs" is RED (Node refuses it there)');
    ok(reds['scripts/fixtures/deep/er/broken.cjs'] && reds['scripts/fixtures/deep/er/broken.cjs'].line === 1, 'a red deep in a subfolder is found, by file and line');
    ok(!r.files.some((f) => f.includes('node_modules') || /\.(txt|json)$/.test(f)), 'node_modules and non-code files are never read');
    ok(r.bad.length === 6, `exactly the six planted reds, nothing else (${r.bad.length}: ${r.bad.map((b) => b.file).join(', ')})`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
