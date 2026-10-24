// THE SYNC FS CENSUS SCANNER (lane hub-fuse-sync-guard): every `fs.<x>Sync(` call site in the hub's main-thread code —
// server.js, src/*.js, src/server/*.js, src/routes/*.js — parsed (acorn), with its enclosing scope (Class.method /
// function / const name / route:VERB path / <module>) and its path arguments' source; a path made only of constants (a
// literal, the checkout, the data dir, os.homedir(), /proc, and a file constant built of those — a fixpoint over the
// file's declarations) is `const`, a descriptor call `fd` (its path was judged at its open), the rest `var` — each a row
// of scripts/test-sync-fs-census.mjs. `node scripts/sync-fs-census.mjs <repo> [out.json]` prints the counts.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const SCOPE_DIRS = ['src', 'src/server', 'src/routes'];
export const FD_FNS = new Set(['readSync', 'writeSync', 'closeSync', 'fstatSync', 'fsyncSync', 'fdatasyncSync', 'ftruncateSync', 'futimesSync', 'fchmodSync', 'fchownSync', 'readvSync', 'writevSync']);
export const TWO_PATH = new Set(['renameSync', 'copyFileSync', 'cpSync', 'linkSync', 'symlinkSync']);

export function filesOf(repo) {
  return ['server.js', ...SCOPE_DIRS.flatMap((d) => fs.readdirSync(path.join(repo, d)).filter((f) => f.endsWith('.js')).sort().map((f) => `${d}/${f}`))];
}

// the roots the law calls constant: a literal, the checkout (__dirname / rootDir), the data dir, os.homedir(), /proc
const ROOT_ATOM = /^(?:'[^'$]*'|"[^"$]*"|`[^`$]*`|__dirname|__filename|os\.homedir\(\)|os\.tmpdir\(\)|ROOT|REPO|rootDir|ROOT_DIR|dataDir|DATA_DIR|this\.dataDir|this\._dataDir|this\.rootDir|this\._rootDir|opts\.dataDir|procRoot|PROC_ROOT|procDir|\d+|process\.execPath)$/;

function splitTop(expr, sep) {
  const out = []; let d = 0, st = 0;
  for (let j = 0; j < expr.length; j++) {
    const c = expr[j];
    if (c === '\'' || c === '"') { const q = c; for (j++; j < expr.length && expr[j] !== q; j++) if (expr[j] === '\\') j++; continue; }
    if (c === '`') { for (j++; j < expr.length && expr[j] !== '`'; j++) if (expr[j] === '\\') j++; continue; }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--; else if (c === sep && d === 0) { out.push(expr.slice(st, j).trim()); st = j + 1; }
  }
  out.push(expr.slice(st).trim()); return out;
}

/** Is the expression's source a constant path (a literal, a root, a join of those, a file constant). */
export function isConst(a, env = new Set()) {
  a = String(a || '').replace(/\s+/g, ' ').trim();
  if (!a) return false;
  if (ROOT_ATOM.test(a)) return true;
  if (/^['"`]\/(proc|sys|dev)\//.test(a) || /^`\$\{(procRoot|PROC_ROOT|procDir)\}/.test(a)) return true;
  if (/^[A-Za-z_$][\w$]*$/.test(a) || /^this\.[\w$]+$/.test(a)) return env.has(a);
  if (a.startsWith('`') && a.endsWith('`')) return [...a.matchAll(/\$\{([^}]*)\}/g)].every((m) => isConst(m[1], env));
  const m = /^path\.(?:join|resolve|dirname|basename)\((.*)\)$/.exec(a);
  if (m) return splitTop(m[1], ',').every((x) => isConst(x, env));
  const plus = splitTop(a, '+'); if (plus.length > 1) return plus.every((x) => isConst(x, env));
  const call = /^([A-Za-z_$][\w$]*)\(\)$/.exec(a); if (call) return env.has(call[1] + '()');
  return false;
}

/** A file's constants: the names whose EVERY declaration is a constant expression (a fixpoint over the AST). */
function constEnv(ast, src) {
  const decl = new Map();
  const add = (k, node) => { if (!decl.has(k)) decl.set(k, []); decl.get(k).push(node ? src.slice(node.start, node.end) : null); };
  walk(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') {
      if (n.init && (n.init.type === 'ArrowFunctionExpression' || n.init.type === 'FunctionExpression')) {
        const b = n.init.body;
        if (!n.init.params.length && b.type !== 'BlockStatement') add(n.id.name + '()', b);
        else if (!n.init.params.length && b.body.length === 1 && b.body[0].type === 'ReturnStatement') add(n.id.name + '()', b.body[0].argument);
      } else add(n.id.name, n.init);
    } else if (n.type === 'VariableDeclarator') { // destructured: never constant
      walk(n.id, (x) => { if (x.type === 'Identifier') add(x.name, null); });
    } else if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') add(n.left.name, n.operator === '=' ? n.right : null);
    else if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.type === 'ThisExpression' && !n.left.computed) add('this.' + n.left.property.name, n.operator === '=' ? n.right : null);
    else if (n.type === 'FunctionDeclaration' && n.id && !n.params.length && n.body.body.length === 1 && n.body.body[0].type === 'ReturnStatement') add(n.id.name + '()', n.body.body[0].argument);
    else if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression')) {
      for (const p of n.params) walk(p, (x) => { if (x.type === 'Identifier') add(x.name, null); });
    }
  });
  const env = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const [k, vs] of decl) if (!env.has(k) && vs.every((v) => v !== null && isConst(v, env))) { env.add(k); changed = true; }
  }
  return env;
}

function walk(node, visit, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parents);
  parents.push(node);
  for (const k of Object.keys(node)) {
    if (k === 'start' || k === 'end' || k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, parents); }
    else if (v && typeof v.type === 'string') walk(v, visit, parents);
  }
  parents.pop();
}

const keyName = (k) => (!k ? '?' : k.type === 'Identifier' ? k.name : k.type === 'PrivateIdentifier' ? '#' + k.name : k.type === 'Literal' ? String(k.value) : '[computed]');
const ROUTE_VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'use']);
const memberName = (m) => (m.type === 'MemberExpression' ? `${m.object.type === 'ThisExpression' ? 'this' : m.object.type === 'Identifier' ? m.object.name : m.object.type === 'MemberExpression' ? memberName(m.object) : '?'}.${keyName(m.property)}` : m.type === 'Identifier' ? m.name : '?');

/** The enclosing scope's NAME of a node from its parents: Class.method / function / const name / route:VERB path / <module>. */
function scopeOf(parents) {
  const names = [];
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i], up = parents[i - 1];
    if (p.type === 'FunctionDeclaration' && p.id) { names.push(p.id.name); continue; }
    if (p.type === 'FunctionExpression' || p.type === 'ArrowFunctionExpression') {
      if (up && up.type === 'MethodDefinition') { const cls = parents.slice(0, i).reverse().find((x) => x.type === 'ClassDeclaration' || x.type === 'ClassExpression'); names.push(`${cls && cls.id ? cls.id.name : '<class>'}.${keyName(up.key)}`); i--; continue; }
      if (up && up.type === 'Property') { names.push(keyName(up.key)); continue; }
      if (up && up.type === 'VariableDeclarator' && up.id.type === 'Identifier') { names.push(up.id.name); continue; }
      if (up && up.type === 'AssignmentExpression') { names.push(memberName(up.left)); continue; }
      if (up && up.type === 'CallExpression' && up.callee.type === 'MemberExpression' && ROUTE_VERBS.has(keyName(up.callee.property)) && up.arguments[0] && up.arguments[0].type === 'Literal' && typeof up.arguments[0].value === 'string') {
        names.push(`route:${keyName(up.callee.property).toUpperCase()} ${up.arguments[0].value}`); continue;
      }
      continue; // an anonymous callback: its parent's scope names it
    }
    if (p.type === 'PropertyDefinition') { const cls = parents.slice(0, i).reverse().find((x) => x.type === 'ClassDeclaration' || x.type === 'ClassExpression'); names.push(`${cls && cls.id ? cls.id.name : '<class>'}.${keyName(p.key)}`); continue; }
  }
  return names.length ? names.reverse().join(' > ') : '<module>';
}

const isFsObject = (o) => (o.type === 'Identifier' && o.name === 'fs')
  || (o.type === 'CallExpression' && o.callee.type === 'Identifier' && o.callee.name === 'require' && o.arguments[0] && o.arguments[0].type === 'Literal' && /^(node:)?fs$/.test(o.arguments[0].value));

/** Every `fs.<x>Sync(` site of one file: { file, line, fn, scope, paths: [source], kind: 'const' | 'fd' | 'var' }. */
export function sitesOf(repo, rel, { acorn = null, src: given = null } = {}) {
  const A = acorn || createRequire(path.join(repo, 'package.json'))('acorn');
  const src = given !== null ? given : fs.readFileSync(path.join(repo, rel), 'utf8');
  const code = src.replace(/^#!.*/, '');
  const opts = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true };
  let ast;
  try { ast = A.parse(code, { ...opts, sourceType: 'script' }); } catch { ast = A.parse(code, { ...opts, sourceType: 'module', allowReturnOutsideFunction: false }); }
  const env = constEnv(ast, src);
  const out = [];
  walk(ast, (n, parents) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed) return;
    const fn = keyName(n.callee.property);
    if (!/^[a-z][A-Za-z]*Sync$/.test(fn) || !isFsObject(n.callee.object)) return;
    const args = n.arguments.map((a) => src.slice(a.start, a.end).replace(/\s+/g, ' '));
    const paths = TWO_PATH.has(fn) ? args.slice(0, 2) : args.slice(0, 1);
    const kind = FD_FNS.has(fn) ? 'fd' : paths.length && paths.every((a) => isConst(a, env)) ? 'const' : 'var';
    out.push({ file: rel, line: n.loc.start.line, fn, scope: scopeOf(parents), paths, kind });
  });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repo = process.argv[2];
  const all = filesOf(repo).flatMap((f) => sitesOf(repo, f));
  const by = (k) => all.filter((s) => s.kind === k).length;
  console.log('sites', all.length, 'const', by('const'), 'fd', by('fd'), 'var', by('var'));
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(all.filter((s) => s.kind === 'var')));
}
