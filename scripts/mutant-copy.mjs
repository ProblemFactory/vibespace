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
import { scratch } from './scratch.mjs';
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

/** One per suite: `const M = mutantCopies('spend', REPO)`.
 *  M.write(origRel, src, tag?) → absolute path of the copy (CJS or ESM by the
 *  original's syntax: `esm: true` forces ESM). M.load(...) → require()d module
 *  (CJS only). M.files = every path written. M.dir = the scratch dir. */
export function mutantCopies(name, repo) {
  const dir = scratch(name + '-mut');
  fs.mkdirSync(dir, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } });
  const files = [];
  let seq = 0;
  /** `name` (optional) = the copy's file name inside `dir` without extension,
   *  for a CLOSED WORLD of copies that require each other by absolute path
   *  (M.pathFor gives that path before the file exists). */
  const extOf = (orig, src, esm) => (esm ?? (/\.mjs$/.test(orig) || (/^(import|export)\b/m.test(src) && !/\bmodule\.exports\b|\brequire\s*\(/.test(src)))) ? '.mjs' : '.cjs';
  function pathFor(name, ext = '.cjs') { return path.join(dir, String(name).replace(/[^\w.-]/g, '_') + ext); }
  function write(origRel, src, tag, { esm, name } = {}) {
    const orig = path.isAbsolute(origRel) ? origRel : path.join(repo, origRel);
    // ESM by the original's own syntax unless told: top-level import/export and
    // no CommonJS surface (src/lib/*.js are ESM, the server tree is CJS).
    const ext = extOf(orig, src, esm);
    const stem = name ?? (path.basename(orig).replace(/\.(c|m)?js$/, '') + '-' + (tag ? String(tag).replace(/[^\w.-]/g, '_') + '-' : '') + (++seq));
    const f = pathFor(stem, ext);
    let body;
    if (ext === '.mjs') {
      body = rebaseEsm(src, orig);
    } else {
      const at = cjsInsertAt(src);
      const bind = `var require = require('node:module').createRequire(${JSON.stringify(orig)}), __filename = ${JSON.stringify(orig)}, __dirname = ${JSON.stringify(path.dirname(orig))};`;
      body = src.slice(0, at) + bind + src.slice(at);
    }
    fs.writeFileSync(f, body);
    files.push(f);
    return f;
  }
  function load(origRel, src, tag, opts = {}) { return req(write(origRel, src, tag, { ...opts, esm: false })); }
  return { dir, files, write, load, pathFor };
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
