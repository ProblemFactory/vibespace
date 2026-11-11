// lane hub-sync-holds — THE LOOP-CHILD CENSUS (the owner's hub, 2026-11-11: each a named hold of the main loop). Every site in
// src/ and server.js (tracked files) that runs a SYNCHRONOUS CHILD (execSync / execFileSync / spawnSync — called bare, through
// child_process, or through a destructured alias) or WALKS A DIRECTORY TREE SYNCHRONOUSLY (a function that reads a directory
// with fs.readdirSync and calls itself; fs.readdirSync(…, { recursive: true })) — named by its enclosing scope
// (scripts/sync-fs-census.mjs's scopeOf). A binding of a child function the scanner cannot follow (a computed member, a
// re-export) is an UNCLASSIFIED site: red, never skipped. test-hub-sync-holds §C holds the rows.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { walk, scopeOf } from './sync-fs-census.mjs';

export const CHILD_SYNC = new Set(['execSync', 'execFileSync', 'spawnSync']);

/** every tracked .js under src/ + server.js */
export function filesOf(repo) {
  return execFileSync('git', ['-C', repo, 'ls-files', '--', 'src', 'server.js'], { encoding: 'utf8' }).split('\n').filter((f) => /\.js$/.test(f)).sort();
}
const isCp = (o) => (o.type === 'CallExpression' && o.callee.type === 'Identifier' && o.callee.name === 'require' && o.arguments[0] && o.arguments[0].type === 'Literal' && /^(node:)?child_process$/.test(o.arguments[0].value));
const recursiveOpt = (n) => n.arguments.some((a) => a.type === 'ObjectExpression' && a.properties.some((p) => p.type === 'Property' && !p.computed && ((p.key.name || p.key.value) === 'recursive') && p.value.type === 'Literal' && p.value.value === true));
const fnName = (fn, up) => (fn.type === 'FunctionDeclaration' && fn.id ? fn.id.name
  : up && up.type === 'VariableDeclarator' && up.id.type === 'Identifier' ? up.id.name
  : fn.id ? fn.id.name : up && up.type === 'Property' && !up.computed ? (up.key.name || up.key.value)
  : up && up.type === 'MethodDefinition' && !up.computed ? up.key.name : null);

/** one file → { sites: [{file, line, scope, kind}], unclassified: [{file, line, what}] } — kind: child:<fn> | child-ref:<fn> | walk */
export function sitesOf(repo, rel, { acorn = null, src: given = null } = {}) {
  const A = acorn || createRequire(path.join(repo, 'package.json'))('acorn');
  const src = given !== null ? given : fs.readFileSync(path.join(repo, rel), 'utf8');
  const code = src.replace(/^#!.*/, '');
  const opts = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true };
  let ast;
  try { ast = A.parse(code, { ...opts, sourceType: 'script' }); } catch { ast = A.parse(code, { ...opts, sourceType: 'module', allowReturnOutsideFunction: false }); }
  const sites = [], unclassified = [];
  // the names this file binds to a sync child function: `const { execFileSync: efs } = require('child_process')`, `const cp = require('child_process')`
  const aliases = new Map(), cpNames = new Set(['child_process']);
  // round 2: fs under ANOTHER NAME (`const fsx = require('fs')`) and a DESTRUCTURED readdirSync (`const { readdirSync: rd } = require('fs')`)
  const fsNames = new Set(['fs']), rdAliases = new Set();
  const isFsReq = (o) => o && o.type === 'CallExpression' && o.callee.type === 'Identifier' && o.callee.name === 'require' && o.arguments[0] && o.arguments[0].type === 'Literal' && /^(node:)?fs$/.test(o.arguments[0].value);
  const isFsRead = (m) => m.type === 'CallExpression' && ((m.callee.type === 'MemberExpression' && !m.callee.computed && m.callee.property.name === 'readdirSync'
    && ((m.callee.object.type === 'Identifier' && fsNames.has(m.callee.object.name)) || (m.callee.object.type === 'CallExpression' && m.callee.object.callee.type === 'Identifier' && m.callee.object.callee.name === 'require')))
    || (m.callee.type === 'Identifier' && rdAliases.has(m.callee.name)));
  walk(ast, (n) => {
    if (n.type !== 'VariableDeclarator' || !n.init) return;
    if (isFsReq(n.init) && n.id.type === 'Identifier') { fsNames.add(n.id.name); return; }
    if (isFsReq(n.init) && n.id.type === 'ObjectPattern') { for (const p of n.id.properties) if (p.type === 'Property' && !p.computed && (p.key.name || p.key.value) === 'readdirSync' && p.value.type === 'Identifier') rdAliases.add(p.value.name); return; }
    const init = n.init.type === 'MemberExpression' && isCp(n.init.object) ? n.init : n.init;
    if (isCp(n.init) && n.id.type === 'Identifier') { cpNames.add(n.id.name); return; }
    if (isCp(n.init) && n.id.type === 'ObjectPattern') {
      for (const p of n.id.properties) {
        if (p.type !== 'Property') { unclassified.push({ file: rel, line: n.loc.start.line, what: 'a rest binding of child_process' }); continue; }
        if (p.computed) { unclassified.push({ file: rel, line: n.loc.start.line, what: 'a computed binding of child_process' }); continue; }
        const k = p.key.name || p.key.value; if (CHILD_SYNC.has(k) && p.value.type === 'Identifier') aliases.set(p.value.name, k);
      }
      return;
    }
    // `const efs = require('child_process').execFileSync` / `= cp.execFileSync`
    if (init.type === 'MemberExpression' && !init.computed && CHILD_SYNC.has(init.property.name) && (isCp(init.object) || (init.object.type === 'Identifier' && cpNames.has(init.object.name))) && n.id.type === 'Identifier') aliases.set(n.id.name, init.property.name);
    if (init.type === 'MemberExpression' && init.computed && (isCp(init.object) || (init.object.type === 'Identifier' && cpNames.has(init.object.name)))) unclassified.push({ file: rel, line: n.loc.start.line, what: 'a computed member of child_process' });
  });
  // A SYNC CHILD FUNCTION USED AS A VALUE (`exec = childProcess.execFileSync` as a default, a dependency handed on): its calls
  // are made under another name the scanner cannot follow — so the hand-off ITSELF is a site (kind child-ref:<fn>) whose row
  // says where those calls run
  const isChildRef = (n) => (n.type === 'MemberExpression' && !n.computed && CHILD_SYNC.has(n.property.name) && (isCp(n.object) || (n.object.type === 'Identifier' && cpNames.has(n.object.name))))
    || (n.type === 'Identifier' && (CHILD_SYNC.has(n.name) || aliases.has(n.name)));
  walk(ast, (n, parents) => {
    const up = parents[parents.length - 1];
    if (isChildRef(n) && up && !(up.type === 'CallExpression' && up.callee === n) && !(up.type === 'MemberExpression' && up.object === n)
      && !(up.type === 'Property' && (up.key === n || (up.value === n && parents[parents.length - 2] && parents[parents.length - 2].type === 'ObjectPattern')))
      && !(up.type === 'VariableDeclarator' && (up.id === n || (up.init === n && up.id.type === 'Identifier' && aliases.has(up.id.name))))
      && !(n.type === 'Identifier' && up.type === 'MemberExpression' && up.property === n)) {
      sites.push({ file: rel, line: n.loc.start.line, scope: scopeOf(parents), kind: 'child-ref:' + (n.type === 'Identifier' ? (aliases.get(n.name) || n.name) : n.property.name) }); // a row says where its calls run
    }
    if (n.type === 'CallExpression') {
      const c = n.callee;
      let fn = null;
      if (c.type === 'Identifier' && (CHILD_SYNC.has(c.name) || aliases.has(c.name))) fn = aliases.get(c.name) || c.name;
      else if (c.type === 'MemberExpression' && !c.computed && CHILD_SYNC.has(c.property.name) && (isCp(c.object) || (c.object.type === 'Identifier' && cpNames.has(c.object.name)))) fn = c.property.name;
      else if (c.type === 'MemberExpression' && c.computed && (isCp(c.object) || (c.object.type === 'Identifier' && cpNames.has(c.object.name)))) unclassified.push({ file: rel, line: n.loc.start.line, what: 'a computed call of child_process' });
      // round 2: a BOUND call of a sync child — `ex.call(null, …)`, `cp.execFileSync.apply(cp, […])`
      else if (c.type === 'MemberExpression' && !c.computed && (c.property.name === 'call' || c.property.name === 'apply') && isChildRef(c.object)) fn = c.object.type === 'Identifier' ? (aliases.get(c.object.name) || c.object.name) : c.object.property.name;
      if (fn) sites.push({ file: rel, line: n.loc.start.line, scope: scopeOf(parents), kind: 'child:' + fn });
      if (isFsRead(n) && recursiveOpt(n)) sites.push({ file: rel, line: n.loc.start.line, scope: scopeOf(parents), kind: 'walk' });
    }
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
      const name = fnName(n, parents[parents.length - 1]);
      if (!name) return;
      let reads = false, self = false;
      walk(n.body, (m) => { if (isFsRead(m)) reads = true; if (m.type === 'CallExpression' && ((m.callee.type === 'Identifier' && m.callee.name === name) || (m.callee.type === 'MemberExpression' && !m.callee.computed && m.callee.object.type === 'ThisExpression' && m.callee.property.name === name))) self = true; });
      // round 2: an ITERATIVE walk — a loop in this function that reads a directory and both pushes to and pops / shifts a stack
      let iter = false;
      const isFnNode = (x) => x.type === 'FunctionDeclaration' || x.type === 'FunctionExpression' || x.type === 'ArrowFunctionExpression';
      if (reads && !self) walk(n.body, (L, ps) => {
        if (iter || (ps || []).some(isFnNode) || !/^(WhileStatement|DoWhileStatement|ForStatement|ForOfStatement|ForInStatement)$/.test(L.type)) return; // THIS function's own loops only
        let r = false, push = false, pop = false;
        walk(L, (m) => { if (isFsRead(m)) r = true; if (m.type === 'CallExpression' && m.callee.type === 'MemberExpression' && !m.callee.computed) { const k = m.callee.property.name; if (k === 'push' || k === 'unshift') push = true; if (k === 'pop' || k === 'shift') pop = true; } });
        if (r && push && pop) iter = true;
      });
      if (reads && (self || iter)) sites.push({ file: rel, line: n.loc.start.line, scope: scopeOf([...parents, n]), kind: 'walk' });
    }
  });
  return { sites, unclassified };
}

// a file that names none of these cannot hold a site — never parsed (the census stays fast); a parsed file is kept by its text
const MAY_HOLD = /\b(?:execSync|execFileSync|spawnSync|readdirSync|child_process)\b/;
const memo = new Map(); // file → { src, r }

/** the whole tree → { sites, unclassified }; `patch` = {file: text} judged in place of the file (a control's planted copy) */
export function census(repo, { acorn = null, patch = {} } = {}) {
  const A = acorn || createRequire(path.join(repo, 'package.json'))('acorn');
  const sites = [], unclassified = [];
  const files = filesOf(repo);
  const one = (f, src) => {
    if (!MAY_HOLD.test(src)) return;
    const hit = memo.get(f);
    const r = hit && hit.src === src ? hit.r : sitesOf(repo, f, { acorn: A, src });
    if (!hit || hit.src !== src) { if (!Object.prototype.hasOwnProperty.call(patch, f)) memo.set(f, { src, r }); }
    sites.push(...r.sites); unclassified.push(...r.unclassified);
  };
  for (const f of files) one(f, Object.prototype.hasOwnProperty.call(patch, f) ? patch[f] : fs.readFileSync(path.join(repo, f), 'utf8'));
  for (const [f, src] of Object.entries(patch)) if (!files.includes(f)) one(f, src);
  return { sites, unclassified };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { sites, unclassified } = census(process.argv[2] || process.cwd());
  const key = (s) => `${s.file}|${s.scope}|${s.kind}`;
  const by = new Map(); for (const s of sites) by.set(key(s), [...(by.get(key(s)) || []), s.line]);
  for (const [k, lines] of [...by].sort()) console.log(`${k}  ×${lines.length}  @${lines.join(',')}`);
  console.log(`${sites.length} sites, ${by.size} rows, ${unclassified.length} unclassified`, JSON.stringify(unclassified));
}
