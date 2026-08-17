#!/usr/bin/env node
// SERVER-SIDE FREE-IDENTIFIER GATE (2.343.2). The client bundle has had this
// since 2.330.1 (test-bundle-globals); the server never did — and the audit
// that followed the 7th decomposition incident found SEVEN undeclared
// identifiers latent in src/server/* (classifyCliDeath, https, os,
// adapterRegistry, ClaudeCodeAdapter, agentdDeps, persistenceRouter), every
// one a runtime ReferenceError on its code path, most swallowed by degrade
// catches. This gate does a REAL scope analysis (acorn, already a transitive
// dep) over every server-tier file: any identifier read that resolves to no
// binding and no known global fails the build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const acorn = require('acorn');

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const GLOBALS = new Set([
  // JS + node ambient
  'globalThis', 'global', 'undefined', 'NaN', 'Infinity', 'console', 'process', 'Buffer', 'require', 'module', 'exports',
  '__dirname', '__filename', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'clearImmediate',
  'queueMicrotask', 'structuredClone', 'fetch', 'AbortController', 'AbortSignal', 'URL', 'URLSearchParams', 'TextEncoder',
  'TextDecoder', 'atob', 'btoa', 'performance', 'crypto', 'WebSocket', 'Headers', 'Request', 'Response', 'FormData', 'Blob',
  'JSON', 'Math', 'Date', 'RegExp', 'String', 'Number', 'Boolean', 'Array', 'Object', 'Function', 'Symbol', 'BigInt',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'Proxy', 'Reflect', 'Error', 'TypeError', 'RangeError',
  'SyntaxError', 'ReferenceError', 'EvalError', 'URIError', 'AggregateError', 'Intl', 'isNaN', 'isFinite', 'parseInt',
  'parseFloat', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'ArrayBuffer', 'SharedArrayBuffer',
  'DataView', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'Atomics', 'escape', 'unescape', 'eval', 'arguments',
]);

// server-tier files (client src/lib/** has its own bundle gate; agentd bundle
// is esbuild-checked; data/bin scripts run standalone with their own globals)
const files = ['server.js'];
const EXCLUDE = new Set(['src/client.js']); // ESM client entry — covered by test-bundle-globals
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(REPO, dir))) {
    const p = dir + '/' + e;
    if (fs.statSync(path.join(REPO, p)).isDirectory()) { if (p !== 'src/lib') walk(p); }
    else if (p.endsWith('.js') && !p.startsWith('src/lib/') && !EXCLUDE.has(p)) files.push(p);
  }
})('src');

function freeIdentifiers(src, file) {
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: file.endsWith('.mjs') ? 'module' : 'script', allowReturnOutsideFunction: true }); }
  catch (e) { return [['<parse error>', e.message]]; }
  const out = [];
  // scope chain: each entry = Set of names
  const moduleScope = new Set();
  // pass 1: hoist module-level var/function declarations (approx: walk top level)
  const scopes = [moduleScope];
  const declare = (name) => scopes[scopes.length - 1].add(name);
  const declared = (name) => scopes.some((s) => s.has(name)) || GLOBALS.has(name);
  function declarePattern(node) {
    if (!node) return;
    switch (node.type) {
      case 'Identifier': declare(node.name); break;
      case 'ObjectPattern': for (const p of node.properties) declarePattern(p.type === 'RestElement' ? p.argument : p.value); break;
      case 'ArrayPattern': for (const el of node.elements) declarePattern(el); break;
      case 'AssignmentPattern': declarePattern(node.left); break;
      case 'RestElement': declarePattern(node.argument); break;
    }
  }
  // hoister: collects var + function decls into the CURRENT scope before walking
  function hoist(node) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'VariableDeclaration': if (node.kind === 'var') for (const d of node.declarations) declarePattern(d.id); break;
      case 'FunctionDeclaration': if (node.id) declare(node.id.name); return; // don't descend into nested fn for hoisting
      case 'FunctionExpression': case 'ArrowFunctionExpression': case 'ClassDeclaration': case 'ClassExpression': return;
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(hoist);
      else if (v && typeof v.type === 'string') hoist(v);
    }
  }
  function walkFn(node, params) {
    scopes.push(new Set(['this']));
    for (const p of params || []) declarePattern(p);
    if (node.id && node.id.name) declare(node.id.name);
    hoist(node.body);
    if (node.body && Array.isArray(node.body.body)) node.body.body.forEach(hoistShallow);
    walk(node.body, null);
    scopes.pop();
  }
  function walk(node, parent) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'VariableDeclaration': {
        for (const d of node.declarations) { declarePattern(d.id); if (d.init) walk(d.init, node); }
        return;
      }
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        if (node.type === 'FunctionDeclaration' && node.id) declare(node.id.name);
        walkFn(node, node.params);
        return;
      }
      case 'ClassDeclaration': case 'ClassExpression': {
        if (node.id) declare(node.id.name);
        walk(node.body, node); if (node.superClass) walk(node.superClass, node);
        return;
      }
      case 'BlockStatement': case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': case 'CatchClause': {
        scopes.push(new Set());
        if (node.type === 'CatchClause' && node.param) declarePattern(node.param);
        if (node.type === 'ForStatement') { if (node.init) walk(node.init, node); if (node.test) walk(node.test, node); if (node.update) walk(node.update, node); }
        if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
          if (node.left.type === 'VariableDeclaration') { for (const d of node.left.declarations) declarePattern(d.id); }
          else walk(node.left, node);
          walk(node.right, node);
        }
        const body = node.body ? (Array.isArray(node.body) ? node.body : [node.body]) : [];
        body.forEach(hoistShallow);
        for (const st of body) walk(st, node);
        scopes.pop();
        return;
      }
      case 'MemberExpression': {
        walk(node.object, node);
        if (node.computed) walk(node.property, node);
        return;
      }
      case 'MethodDefinition': case 'PropertyDefinition': {
        if (node.computed) walk(node.key, node);
        if (node.value) walk(node.value, node);
        return;
      }
      case 'Property': {
        if (node.computed) walk(node.key, node);
        walk(node.value, node);
        return;
      }
      case 'ObjectPattern': case 'ArrayPattern': return; // handled at declaration sites
      case 'LabeledStatement': { walk(node.body, node); return; }
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'MetaProperty': return; // import.meta / new.target
      case 'Identifier': {
        // a READ position identifier
        if (!declared(node.name)) out.push([node.name, 'line ' + src.slice(0, node.start).split('\n').length]);
        return;
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'type' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) walk(c, node); }
      else if (v && typeof v.type === 'string') walk(v, node);
    }
  }
  function hoistShallow(n) { // lexical pre-pass: const/let/class/function names
    // are in scope for the WHOLE block (TDZ is an execution-order concern, not
    // a binding one — liveWithHistory/_rateLimitCache false positives)
    if (!n) return;
    if (n.type === 'FunctionDeclaration' && n.id) declare(n.id.name);
    if (n.type === 'ClassDeclaration' && n.id) declare(n.id.name);
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) declarePattern(d.id);
  }
  hoist(ast);
  ast.body.forEach(hoistShallow);
  for (const st of ast.body) walk(st, ast);
  return out;
}

let totalBad = 0;
for (const f of files) {
  const bad = freeIdentifiers(fs.readFileSync(path.join(REPO, f), 'utf-8'), f);
  // dedupe by name
  const uniq = [...new Map(bad.map(([n, w]) => [n, w])).entries()];
  if (uniq.length) { totalBad += uniq.length; console.error(`  ✗ ${f}: ${uniq.map(([n, w]) => `${n} (${w})`).join(', ')}`); }
}
ok(totalBad === 0, `every identifier in ${files.length} server-tier files resolves to a binding or a known global`);

// NEGATIVE CONTROL: the exact incident shape must go red
const probe = freeIdentifiers('function f(){ return classifyCliDeath(x, 1); }\nconst x = 1;', 'probe.js');
ok(probe.some(([n]) => n === 'classifyCliDeath'), 'NEGATIVE CONTROL: an undeclared call is detected');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
