// lane hub-sync-holds rank 12a round 2 — THE UPDATE-DOOR CENSUS (the owner's word, 2026-11-11: «a restart changes no version»;
// the acceptance panel's M1c: a pull re-added through a module — async, with serviceEnv, behind the old throwaway guard — passed
// every gate). Every CALL in src/ and server.js (tracked files: a superset of what the boot can reach) that would UPDATE
// VibeSpace's own checkout or bundle:
//   (A) a spawn-family call — spawn / spawnSync / exec / execSync / execFile / execFileSync / fork, bare or as a member of any
//       receiver — whose argument text (every string literal, template quasi and array element under its arguments, function
//       bodies excluded) names `git pull | fetch | merge`, `npm install | i | ci | rebuild` or `npm run build`;
//   (B) ANY call (a helper such as run('git', [...]) too) whose first argument is the literal 'git' or 'npm' and a later
//       literal is an update verb (git: pull / fetch / merge; npm: install / i / ci / rebuild, or run … build);
//   (C) round 3 — THE DOOR'S CALLERS: ANY call whose argument text names `update.sh` by any spelling (a literal, a template
//       piece, a path.join / path.resolve piece — `'scripts/update.sh'`, `path.join(__dirname, '..', 'scripts', 'update.sh')`),
//       counted at the OUTERMOST such call (a path built for a spawn is one site, the spawn), whatever runs it — a spawn on a
//       timer after listen included (the panel's plant: «update.sh 20 s after boot» passed every pin while only the words
//       pull / install / build were looked for).
// Each site is a ROW of test-hub-sync-holds §12a — the ONE update door (⚙ → Update VibeSpace…, which runs scripts/update.sh)
// or another program's install (named) — a site with no row is red, a row with no site is red.
// NOT FOLLOWED (said, so the next gap is named, never assumed covered): a command assembled from variables only (no literal
// names git / npm, the verb or update.sh — the program in a variable, `sh -c` with its command in a variable, a helper handed
// an argv ARRAY built elsewhere, npm's own npm-cli.js run through node); a spawn reached through a computed callee whose
// arguments carry no such literal; what any OTHER script a call runs does inside it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { walk, scopeOf } from './sync-fs-census.mjs';
import { filesOf } from './loop-child-census.mjs';

export const SPAWN = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']);
export const DOOR_RE = /\bupdate\.sh\b/;
export const UPDATE_RE = /\bgit\s+(?:-C\s+\S+\s+)?(?:pull|fetch|merge)\b|\bnpm\s+(?:install|i|ci|rebuild)\b|\bnpm\s+run\s+build\b/;
const VERBS = { git: new Set(['pull', 'fetch', 'merge']), npm: new Set(['install', 'i', 'ci', 'rebuild']) };
const isFn = (n) => n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionDeclaration');

/** every string under a node — literals, template quasis, array elements, concatenations — never inside a function body */
function stringsOf(node) {
  const out = [];
  const visit = (n) => {
    if (!n || typeof n !== 'object' || isFn(n)) return;
    if (n.type === 'Literal' && typeof n.value === 'string') { out.push(n.value); return; }
    if (n.type === 'TemplateLiteral') { for (const q of n.quasis) out.push(q.value.cooked || ''); for (const e of n.expressions) visit(e); return; }
    for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v); }
  };
  visit(node);
  return out;
}
const calleeName = (c) => (c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier' ? c.property.name : null);

/** one file → [{file, line, scope, kind, what}] — kind: spawn (A) | helper (B) */
export function sitesOf(repo, rel, { acorn = null, src: given = null } = {}) {
  const A = acorn || createRequire(path.join(repo, 'package.json'))('acorn');
  const src = given !== null ? given : fs.readFileSync(path.join(repo, rel), 'utf8');
  const code = src.replace(/^#!.*/, '');
  const opts = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true };
  let ast;
  try { ast = A.parse(code, { ...opts, sourceType: 'script' }); } catch { ast = A.parse(code, { ...opts, sourceType: 'module', allowReturnOutsideFunction: false }); }
  const sites = [];
  walk(ast, (n, anc) => {
    if (n.type !== 'CallExpression') return;
    const name = calleeName(n.callee);
    const args = n.arguments || [];
    let kind = null, what = '';
    if (name && SPAWN.has(name)) {
      const text = args.flatMap(stringsOf).join(' ');
      const m = UPDATE_RE.exec(text);
      if (m) { kind = 'spawn'; what = m[0]; }
    }
    if (!kind && args[0] && args[0].type === 'Literal' && (args[0].value === 'git' || args[0].value === 'npm')) {
      const prog = args[0].value; const later = args.slice(1).flatMap(stringsOf);
      const hit = later.find((s) => VERBS[prog].has(s)) || (prog === 'npm' && later.includes('run') && later.includes('build') ? 'run build' : null);
      if (hit) { kind = 'helper'; what = `${prog} ${hit}`; }
    }
    // (C) the door's callers: any call naming update.sh in its argument text, at the OUTERMOST such call
    if (!kind && args.flatMap(stringsOf).some((t) => DOOR_RE.test(t)) && !(anc || []).some((a) => a.type === 'CallExpression' && (a.arguments || []).flatMap(stringsOf).some((t) => DOOR_RE.test(t)))) { kind = 'door'; what = 'update.sh'; }
    if (kind) sites.push({ file: rel, line: n.loc.start.line, scope: scopeOf(anc, n), kind, what });
  });
  return sites;
}

// a file can hold a site only if it holds (A) the shell text itself, or (B) a quoted 'git' / 'npm' AND a quoted update verb
const QUOTED_PROG = /['"`](?:git|npm)['"`]/, QUOTED_VERB = /['"`](?:pull|fetch|merge|install|i|ci|rebuild|build)['"`]/;
const mayName = (src) => UPDATE_RE.test(src) || DOOR_RE.test(src) || (QUOTED_PROG.test(src) && QUOTED_VERB.test(src));
const memo = new Map();
/** the whole census → { sites, files } (patch: {rel: src} to plant a control — patched files are never memoised) */
export function census(repo, { acorn = null, patch = {} } = {}) {
  const A = acorn || createRequire(path.join(repo, 'package.json'))('acorn');
  const files = [...new Set([...filesOf(repo), ...Object.keys(patch)])].sort();
  const sites = [];
  for (const rel of files) {
    const own = Object.prototype.hasOwnProperty.call(patch, rel);
    const src = own ? patch[rel] : fs.readFileSync(path.join(repo, rel), 'utf8');
    if (!mayName(src)) continue;
    if (!own && memo.has(rel) && memo.get(rel).src === src) { sites.push(...memo.get(rel).r); continue; }
    const r = sitesOf(repo, rel, { acorn: A, src });
    if (!own) memo.set(rel, { src, r });
    sites.push(...r);
  }
  return { sites, files: files.length };
}
