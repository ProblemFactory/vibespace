// PATCHED COPIES LIVE OUTSIDE THE TREE (B-0220, generalized in 2.369.164 batch
// r1). A negative control loads a copy of a product module with ONE named edit.
// Nineteen suites used to write those copies as SIBLINGS of the real module
// (src/server/vs-*-mut-*.js, src/lib/.chat-view.*prefix-*.js, …) so their
// relative requires resolved — gitignored, unlinked on exit, swept by PID at
// start. Gitignored hides a file from git only: every suite that SCANS src/
// while one of those runs beside it counts the copy as product code (a
// 2026-09-22 integration: test-auto-resume-loop's noteRecovered census, 3 red,
// green alone), and a SIGKILL strands it for the next scanner. So the copy is
// written into the process's scratch dir instead, and the module is told where
// it "really" lives, on the SAME line as the original's first statement so
// every line number stays the original's:
//   CJS  → `var require = createRequire(<real path>), __filename = …, __dirname = …;`
//          './x' and '../x' reach the very files AND require-cache entries a
//          sibling reached; the copy is `.cjs`, so it is CommonJS whatever the
//          nearest package.json says.
//   ESM  → every relative specifier (`from './x'`, `import './x'`,
//          `import('./x')`) is rewritten to the real file's URL, and
//          `import.meta.url` to the real module's URL; the copy is `.mjs`.
// The tree is never written; `treeLitter()` is the census each suite runs
// WHILE its copies still exist (after exit it would pass on the pre-fix
// placement too). NOT a test-*.mjs on purpose (the tier census would demand a
// tier) — like scratch.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { scratch, stampScratchRun } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';

const req = createRequire(import.meta.url);

/** Index at which the CJS rebinding goes: after a shebang line and after a
 *  'use strict' directive (a statement before it would demote it to an
 *  expression and silently drop strict mode), never inside a comment. */
function cjsInsertAt(src) {
  let i = 0;
  if (src.startsWith('#!')) { const nl = src.indexOf('\n'); i = nl < 0 ? src.length : nl + 1; }
  const prologueStart = i;
  let j = i;
  for (;;) {
    const ws = /^\s*/.exec(src.slice(j))[0]; j += ws.length;
    if (src.startsWith('//', j)) { const nl = src.indexOf('\n', j); j = nl < 0 ? src.length : nl + 1; continue; }
    if (src.startsWith('/*', j)) { const e = src.indexOf('*/', j + 2); j = e < 0 ? src.length : e + 2; continue; }
    break;
  }
  const m = /^(['"])use strict\1;?/.exec(src.slice(j));
  return m ? j + m[0].length : prologueStart;
}

/** Rewrite relative ESM specifiers of a module that lived at `origAbs`. */
export function rebaseEsm(src, origAbs) {
  const base = pathToFileURL(origAbs);
  const abs = (spec) => JSON.stringify(new URL(spec, base).href);
  return src
    .replace(/(\bfrom\s*)(['"])(\.\.?\/[^'"\n]+)\2/g, (_, a, q, s) => a + abs(s))
    .replace(/(\bimport\s*)(['"])(\.\.?\/[^'"\n]+)\2/g, (_, a, q, s) => a + abs(s))
    .replace(/(\bimport\s*\(\s*)(['"])(\.\.?\/[^'"\n]+)\2/g, (_, a, q, s) => a + abs(s))
    .replace(/\bimport\.meta\.url\b/g, JSON.stringify(base.href));
}

// ONE exit handler for every scratch dir this process made (2.369.187 mirror log): a
// listener per `mutantCopies()` call put a suite with eleven controls past Node's
// ten-listener warning (`MaxListenersExceededWarning: 11 exit listeners`) — noise
// on every run, and a real leak for a suite that makes copies in a loop.
const MUT_DIRS = new Set();
let mutExitHooked = false;
function removeOnExit(dir) {
  MUT_DIRS.add(dir);
  if (mutExitHooked) return;
  mutExitHooked = true;
  process.on('exit', () => { for (const d of MUT_DIRS) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
}

/** One per suite: `const M = mutantCopies('spend', REPO)`.
 *  M.write(origRel, src, tag?) → absolute path of the copy (CJS or ESM by the
 *  original's syntax: `esm: true` forces ESM). M.load(...) → require()d module
 *  (CJS only). M.files = every path written. M.dir = the scratch dir. */
export function mutantCopies(name, repo) {
  const dir = scratch(name + '-mut');
  fs.mkdirSync(dir, { recursive: true });
  stampScratchRun(dir); // owned by this process (B-1d08): a copy's children are this run's, never another sweep's litter
  removeOnExit(dir);
  const files = [];
  let seq = 0;
  /** `name` (optional) = the copy's file name inside `dir` without extension,
   *  for a CLOSED WORLD of copies that require each other by absolute path
   *  (M.pathFor gives that path before the file exists).
   *  `selfPath: true` (CJS only) = a SELF-SPAWNING script (it re-runs itself as
   *  `spawn(node, [__filename, …])`, e.g. data/bin/vibespace-remote-keeper's
   *  daemon): only `require` is rebound to the original — `__filename` and
   *  `__dirname` stay the COPY's own, or the copy would hand its daemon role to
   *  the real, unpatched file and the control would judge the original. */
  const extOf = (orig, src, esm) => (esm ?? (/\.mjs$/.test(orig) || (/^(import|export)\b/m.test(src) && !/\bmodule\.exports\b|\brequire\s*\(/.test(src)))) ? '.mjs' : '.cjs';
  function pathFor(name, ext = '.cjs') { return path.join(dir, String(name).replace(/[^\w.-]/g, '_') + ext); }
  function write(origRel, src, tag, { esm, name, selfPath = false, same = false } = {}) {
    const orig = path.isAbsolute(origRel) ? origRel : path.join(repo, origRel);
    // B-0d3e: A CONTROL THAT BUILDS NOTHING FAILS BY NAME. A patched copy byte-identical to its original means the edit
    // found no anchor (`src.replace(gone, …)` answers the text unchanged): the control would judge the real module and
    // go green — or red on a misleading sentence. A deliberate unpatched copy says so: `same: true`, or a closed world's
    // `name` (its copies require each other by path, patched or not).
    if (!same && name == null) {
      let was = null;
      try { was = fs.readFileSync(orig, 'utf-8'); } catch { /* no original to compare: a planted file */ }
      if (was !== null && was === String(src)) throw new Error(`CONTROL BUILT NOTHING: the copy of ${path.relative(repo, orig) || origRel}${tag ? ` («${tag}»)` : ''} is byte-identical to the file — its edit's anchor is gone (move the anchor with the product line; a deliberate unpatched copy passes { same: true })`);
    }
    // ESM by the original's own syntax unless told: top-level import/export and
    // no CommonJS surface (src/lib/*.js are ESM, the server tree is CJS).
    const ext = extOf(orig, src, esm);
    const stem = name ?? (path.basename(orig).replace(/\.(c|m)?js$/, '') + '-' + (tag ? String(tag).replace(/[^\w.-]/g, '_') + '-' : '') + (++seq));
    const f = pathFor(stem, ext);
    let body;
    if (ext === '.mjs') {
      if (selfPath) throw new Error('mutantCopies: selfPath is a CJS option (an ESM copy has no __filename to keep)');
      body = rebaseEsm(src, orig);
    } else {
      const at = cjsInsertAt(src);
      const bind = selfPath
        ? `var require = require('node:module').createRequire(${JSON.stringify(orig)});`
        : `var require = require('node:module').createRequire(${JSON.stringify(orig)}), __filename = ${JSON.stringify(orig)}, __dirname = ${JSON.stringify(path.dirname(orig))};`;
      body = src.slice(0, at) + bind + src.slice(at);
    }
    fs.writeFileSync(f, body);
    files.push(f);
    return f;
  }
  function load(origRel, src, tag, opts = {}) { return req(write(origRel, src, tag, { ...opts, esm: false })); }
  return { dir, files, write, load, pathFor };
}

/** B-0d3e: THE UNANCHORED EDITS of a script — every `.replace(` / `.replaceAll(` / `.split(…).join(` on a product file's
 *  text (a binding read from src/, server.js or data/bin) whose result reaches a LOADER (a mutant copy's write / load, a
 *  `_compile`, a vm run, `new Function`, a written copy), directly or through the one const it is bound to — each the
 *  anchor of a red control that says nothing when the product line moves. scripts/scratch.mjs `anchored()` is the door
 *  that fails by name (it calls no `.replace` in the suite). → [{ line, text }] (a file that does not parse → []). */
export function unanchoredEdits(src, { ast: given = null } = {}) {
  // the cheap door first: no line that reads a product file, or no edit, or no loader ⇒ nothing to parse
  if (!/\.(?:replace|replaceAll|join)\(/.test(src) || !/(?:\.load|\.write|_compile|runIn\w*Context|compileFunction|writeFileSync|new Function)\(/.test(src)) return [];
  if (!src.split('\n').some((l) => /\b(?:readFileSync|readRepo|readSrc|readTree|readText|readFile|read)\s*\(/.test(l) && /['"`](?:src\/|server\.js|data\/bin\/|src['"`])/.test(l))) return [];
  let ast = given;
  if (!ast) for (const sourceType of ['module', 'script']) { try { ast = req('acorn').parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }); break; } catch { } }
  if (!ast) return [];
  const text = (n) => src.slice(n.start, n.end);
  // ONE ancestor stack, pushed and popped (a copy per node made the walk quadratic in a long suite)
  const walk = (n, fn, anc = []) => { if (!n || typeof n.type !== 'string') return; fn(n, anc); anc.push(n); for (const k in n) { if (k === 'type' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x, fn, anc); } else if (v && typeof v.type === 'string') walk(v, fn, anc); } anc.pop(); };
  const READ = /\b(?:readFileSync|readRepo|readSrc|readTree|readText|readFile|read)\s*\(/, PRODUCT = /['"`](?:src\/|server\.js|data\/bin\/|src['"`])/;
  const LOADER = /(?:^|\.)(?:load|write|_compile|runInThisContext|runInNewContext|compileFunction|writeFileSync)$/;
  // ONE walk: the product bindings, the identifiers handed to a loader, and every candidate edit with what it reaches
  const product = new Set(), loaderArgs = new Set(), cands = [];
  const isLoader = (n) => (n.type === 'CallExpression' && LOADER.test(text(n.callee))) || (n.type === 'NewExpression' && /^(?:Function|vm\.Script|Script)$/.test(text(n.callee)));
  const baseOf = (n) => { let b = n; while (b && b.type === 'CallExpression' && b.callee.type === 'MemberExpression' && /^(?:replace|replaceAll|split|join)$/.test(b.callee.property.name || '')) b = b.callee.object; return b; };
  const ids = (n, into) => walk(n, (x) => { if (x.type === 'Identifier') into.add(x.name); });
  walk(ast, (n, anc) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && READ.test(text(n.init)) && PRODUCT.test(text(n.init))) product.add(n.id.name);
    else if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && READ.test(text(n.right)) && PRODUCT.test(text(n.right))) product.add(n.left.name);
    if ((n.type === 'CallExpression' || n.type === 'NewExpression') && isLoader(n)) for (const a of n.arguments) ids(a, loaderArgs);
    if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed) return;
    const prop = n.callee.property.name;
    const edit = (prop === 'replace' || prop === 'replaceAll') || (prop === 'join' && n.callee.object.type === 'CallExpression' && n.callee.object.callee.type === 'MemberExpression' && n.callee.object.callee.property.name === 'split');
    if (!edit) return;
    const base = baseOf(n);
    if (!base || base.type !== 'Identifier') return;
    let inLoader = false, decl = null;
    for (let i = anc.length - 1; i >= 0; i--) { if (!inLoader && isLoader(anc[i])) inLoader = true; if (!decl && anc[i].type === 'VariableDeclarator' && anc[i].id.type === 'Identifier') decl = anc[i].id.name; }
    cands.push({ n, base: base.name, inLoader, decl });
  });
  const out = [];
  for (const c of cands) if (product.has(c.base) && (c.inLoader || (c.decl && loaderArgs.has(c.decl)))) out.push({ line: src.slice(0, c.n.start).split('\n').length, text: text(c.n).replace(/\s+/g, ' ').slice(0, 100) });
  return out;
}
/** THE ANCHOR HELPERS (B-0d3e — the row's «every helper that builds a control from an anchor»): every function in a script
 *  whose OWN PARAMETER is the anchor of a `.replace` / `.replaceAll` / `.split` and whose body reaches a loader (a mutant
 *  copy's load / write, a compile, `new Function`, a require / import) — a suite's `cut` / `swap` / `mutantOf` / `patch`.
 *  One whose body neither throws, nor calls scratch.mjs `anchored()`, nor reports through the suite's own check (`ok` /
 *  `check` / `assert` — «CONTROL (tag): the patch applies») answers null or an unpatched copy when its anchor
 *  moves: the control builds nothing and the suite reds on a sentence that names no anchor (test-channels-slack-send's
 *  cut, 2026-11-18) — or stays green. → [{ line, name }] of the helpers that do NOT fail by name. */
export function anchorHelpers(src, { ast: given = null } = {}) {
  if (!/\.(?:replace|replaceAll|split)\(/.test(src) || !/(?:\.load|\.write|_compile|runIn\w*Context|compileFunction|writeFileSync|new Function)\s*\(/.test(src)) return [];
  let ast = given;
  if (!ast) for (const sourceType of ['module', 'script']) { try { ast = req('acorn').parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }); break; } catch { } }
  if (!ast) return [];
  const text = (n) => src.slice(n.start, n.end);
  const walk = (n, fn, anc = []) => { if (!n || typeof n.type !== 'string') return; fn(n, anc); anc.push(n); for (const k in n) { if (k === 'type' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) { for (const x of v) walk(x, fn, anc); } else if (v && typeof v.type === 'string') walk(v, fn, anc); } anc.pop(); };
  const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
  const LOADER = /(?:^|\.)(?:load|write|_compile|runInThisContext|runInNewContext|runInContext|compileFunction|writeFileSync)$|^require$/;
  const params = (fn) => { const out = new Set(); for (let q of fn.params) { if (q.type === 'AssignmentPattern') q = q.left; if (q.type === 'Identifier') out.add(q.name); } return out; };
  const found = new Map();
  walk(ast, (n, anc) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed || !/^(?:replace|replaceAll|split)$/.test(n.callee.property.name || '')) return;
    const a = n.arguments[0];
    if (!a || a.type !== 'Identifier') return;
    for (let i = anc.length - 1; i >= 0; i--) {
      if (!FN.has(anc[i].type) || !params(anc[i]).has(a.name)) continue;
      if (!found.has(anc[i])) { const up = anc[i - 1]; found.set(anc[i], (anc[i].id && anc[i].id.name) || (up && up.type === 'VariableDeclarator' && up.id.type === 'Identifier' && up.id.name) || (up && up.type === 'Property' && up.key && (up.key.name || up.key.value)) || (up && up.type === 'AssignmentExpression' && text(up.left).slice(0, 40)) || '(anonymous)'); }
      break;
    }
  });
  const out = [];
  for (const [fn, name] of found) {
    let loads = false, names = false;
    walk(fn.body, (x) => {
      if (x.type === 'ThrowStatement') names = true;
      else if (x.type === 'CallExpression' && (/(?:^|\.)anchored$/.test(text(x.callee)) || /^(?:ok|check|assert|expect)\w*$|^assert\.\w+$/.test(text(x.callee)))) names = true;
      else if (x.type === 'CallExpression' && LOADER.test(text(x.callee))) loads = true;
      else if (x.type === 'ImportExpression' || (x.type === 'NewExpression' && /^(?:Function|vm\.Script|Script)$/.test(text(x.callee)))) loads = true;
    });
    if (loads && !names) out.push({ line: src.slice(0, fn.start).split('\n').length, name: String(name) });
  }
  return out;
}

/** rv-browser F7 (lane dc-browser-installs): the REAL keeper over PATCHED install files — a closed world of copies: each
 *  patched installer row file, src/server/browser-installs.js (patched or not) with its INSTALLERS line pointing at the row
 *  copy, src/server/browser-keeper.js (patched or not) with its slot require pointing at that. `patched` = {repo-rel: src}. */
export function keeperWithInstalls(M, repo, patched, tag) {
  const SLOT = 'src/server/browser-installs.js', KEEPER = 'src/server/browser-keeper.js';
  const read = (rel) => (rel in patched ? patched[rel] : fs.readFileSync(path.join(repo, rel), 'utf8'));
  const swap = (src, from, to, what) => { if (!src.includes(from)) throw new Error(`keeperWithInstalls: ${what} has no ${from}`); return src.replace(from, to); };
  let slot = read(SLOT);
  for (const rel of Object.keys(patched)) if (rel !== SLOT && rel !== KEEPER) slot = swap(slot, `require('./${path.basename(rel)}')`, `require(${JSON.stringify(M.write(rel, patched[rel], tag))})`, SLOT);
  return M.load(KEEPER, swap(read(KEEPER), "require('./browser-installs.js')", `require(${JSON.stringify(M.write(SLOT, slot, tag))})`, KEEPER), tag);
}

/** git's own view of `sub` (default src/), untracked AND ignored — the pre-fix
 *  copies were gitignored, so a plain `git status` never saw them — narrowed to
 *  what THIS process could have written (its pid in the name, or `match`).
 *  Returns {entries, err}. Run it while the copies exist. */
export function treeLitter(repo, { sub = 'src', match = null } = {}) {
  let out;
  try {
    out = execFileSync('git', ['-C', repo, 'status', '--porcelain', '--ignored', '--untracked-files=all', '--', sub],
      { encoding: 'utf8', env: gitEnvFrom(process.env) });
  } catch (e) { return { entries: null, err: e.message }; }
  const pid = String(process.pid);
  const entries = out.split('\n').filter((l) => l && (l.includes('-' + pid + '-') || l.includes('-' + pid + '.') || (match && match.test(l))));
  return { entries, err: null };
}

/** The standard census leg, as rows for the suite's own `ok` (the suites'
 *  assert helpers disagree on argument order): `[{name, pass, detail}]`.
 *  `files`/`dir` = what the suite wrote and where it meant to (M.files, M.dir);
 *  `minCopies` guards a census that judged nothing. */
export function copiesCensus(files, dir, repo, { minCopies = 1, match = null, label = '' } = {}) {
  const { entries, err } = treeLitter(repo, { match });
  const rel = (f) => path.relative(repo, f);
  return [
    { name: `${label}git status (untracked + ignored) shows nothing under src/ that this run wrote`,
      pass: entries !== null && entries.length === 0, detail: err || (entries || []).join(' ; ') },
    { name: `${label}…and the run really made patched copies to judge (${files.length}), every one outside the checkout, in this process's scratch dir, on disk now`,
      pass: files.length >= minCopies && files.every((f) => rel(f).startsWith('..' + path.sep) && f.startsWith(dir + path.sep) && fs.existsSync(f)),
      detail: JSON.stringify(files) },
  ];
}

/** LEGACY LITTER: a pre-fix run killed with SIGKILL left its in-tree copies
 *  behind. Nothing writes there any more; this removes what an old run
 *  stranded, only for a PID that is GONE (a live pre-fix run in the same
 *  worktree keeps its modules — deleting one mid-require is worse). `re` must
 *  capture the pid in group 1. */
export function sweepLegacy(repo, dirs, re) {
  for (const d of dirs) {
    let names = [];
    try { names = fs.readdirSync(path.join(repo, d)); } catch { continue; }
    for (const f of names) {
      const m = re.exec(f);
      if (!m || Number(m[1]) === process.pid) continue;
      try { process.kill(Number(m[1]), 0); continue; } catch (e) { if (e.code === 'EPERM') continue; }
      try { fs.unlinkSync(path.join(repo, d, f)); } catch { }
    }
  }
}
