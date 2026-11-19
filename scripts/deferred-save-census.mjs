// deferred-save-census.mjs — lane lg-store-writes, B-0248 (主开发 03:00Z: the class becomes a CENSUS, a red test, not a hunt).
// For every store this chain DEFERS (its bytes handed to src/store-writer.js instead of written in place), EVERY CALL SITE of its
// save — found mechanically over server.js, src/*.js, src/server/*.js, src/routes/*.js (acorn, the enclosing scope named as
// scripts/sync-fs-census.mjs names it): the save, the commit, the hand-off, and the marks a tick turns into a save.
//   jobs           src/jobs.js `this._save(` / `this._saveNotifs(` / `this._dirty = true`; elsewhere `<jm>._save(` / `<jm>._saveNotifs(`
//   task-groups    src/task-groups.js `this._save(`; elsewhere `<tasks>._save(`
//   browser-keeper src/server/browser-keeper.js `commit(` / `commitSync(` / `save(` / `saveNow(` / `dirty = true` / `sweepDirty = true`
//   usage-cache    `writeCacheObject(` / `writeReading(` / `writeSidecar(` / `writeWindowStamp(` anywhere (the hub hands them off)
// → [{store, file, line, scope, call}] — the census suite (test-deferred-save-census) holds ONE verdict per (store, file, scope, call).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { filesOf, walk, scopeOf } from './sync-fs-census.mjs';

const keyName = (k) => (!k ? '?' : k.type === 'Identifier' ? k.name : k.type === 'Literal' ? String(k.value) : '[computed]');
const objName = (o) => (!o ? '' : o.type === 'ThisExpression' ? 'this' : o.type === 'Identifier' ? o.name : o.type === 'MemberExpression' ? `${objName(o.object)}.${keyName(o.property)}` : '');
const JM_NAMES = /(^|\.)(jm|jobs|jobManager|JM)$/;
const TG_NAMES = /(^|\.)(tasks|tg|taskGroups|tgm)$/;
const USAGE_CALLS = new Set(['writeCacheObject', 'writeReading', 'writeSidecar', 'writeWindowStamp']);

/** the deferred-save call sites of one file */
export function siteOfFile(repo, rel, { acorn = null, src: given = null } = {}) {
  const A = acorn || createRequire(path.join(repo, 'package.json'))('acorn');
  const src = given !== null ? given : fs.readFileSync(path.join(repo, rel), 'utf8');
  const code = src.replace(/^#!.*/, '');
  const opts = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true };
  let ast;
  try { ast = A.parse(code, { ...opts, sourceType: 'script' }); } catch { ast = A.parse(code, { ...opts, sourceType: 'module', allowReturnOutsideFunction: false }); }
  const out = [];
  // the NAMED function a site sits in (scopeOf's last name): its whole text, so a verdict can be checked against the code
  const fnTextOf = (parents) => {
    for (let i = parents.length - 1; i >= 0; i--) {
      const p = parents[i];
      if (p.type === 'FunctionDeclaration' || p.type === 'FunctionExpression' || p.type === 'ArrowFunctionExpression') {
        const up = parents[i - 1];
        const named = p.type === 'FunctionDeclaration' || (up && (up.type === 'MethodDefinition' || up.type === 'Property' || up.type === 'VariableDeclarator' || up.type === 'AssignmentExpression' || (up.type === 'CallExpression' && up.callee && up.callee.type === 'MemberExpression')));
        if (named) return code.slice(p.start, p.end);
      }
    }
    return '';
  };
  const add = (store, n, parents, call) => out.push({ store, file: rel, line: n.loc.start.line, scope: scopeOf(parents), call, fnText: fnTextOf(parents) });
  walk(ast, (n, parents) => {
    if (n.type === 'AssignmentExpression' && n.operator === '=' && n.right && n.right.type === 'Literal' && n.right.value === true) {
      const l = n.left;
      if (rel === 'src/jobs.js' && l.type === 'MemberExpression' && l.object.type === 'ThisExpression' && keyName(l.property) === '_dirty') add('jobs', n, parents, '_dirty = true');
      if (rel === 'src/server/browser-keeper.js' && l.type === 'Identifier' && (l.name === 'dirty' || l.name === 'sweepDirty')) add('browser-keeper', n, parents, `${l.name} = true`);
      return;
    }
    if (n.type !== 'CallExpression') return;
    const c = n.callee;
    if (c.type === 'Identifier') {
      if (rel === 'src/server/browser-keeper.js' && (c.name === 'commit' || c.name === 'commitSync' || c.name === 'save' || c.name === 'saveNow')) add('browser-keeper', n, parents, `${c.name}()`);
      if (USAGE_CALLS.has(c.name)) add('usage-cache', n, parents, `${c.name}()`);
      return;
    }
    if (c.type !== 'MemberExpression' || c.computed) return;
    const prop = keyName(c.property), obj = objName(c.object);
    if (prop === '_save' || prop === '_saveNotifs') {
      if (rel === 'src/jobs.js' && obj === 'this') add('jobs', n, parents, `${prop}()`);
      else if (rel === 'src/task-groups.js' && obj === 'this' && prop === '_save') add('task-groups', n, parents, '_save()');
      else if (JM_NAMES.test(obj)) add('jobs', n, parents, `${prop}()`);
      else if (TG_NAMES.test(obj) && prop === '_save') add('task-groups', n, parents, '_save()');
    }
    if (USAGE_CALLS.has(prop)) add('usage-cache', n, parents, `${prop}()`);
  });
  // a definition is not a call site: the writer functions' own bodies keep their inner recursion out of the census
  return out.filter((s) => !(s.store === 'usage-cache' && (rel === 'src/usage-cache-write.js' || rel === 'src/window-stamp.js') && /^(writeCacheObject|writeReading|writeSidecar|writeWindowStamp)\b/.test(s.scope)));
}

/** every deferred-save call site of the tree */
export function deferredSaveSites(repo, opts = {}) {
  return filesOf(repo).flatMap((rel) => siteOfFile(repo, rel, opts));
}

/** the census's key of a site: one verdict covers every call of the same kind in one function */
export const rowKeyOf = (s) => `${s.store} · ${s.file} · ${s.scope} · ${s.call}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const repo = process.argv[2] || process.cwd();
  const all = deferredSaveSites(repo);
  const keys = new Map(); for (const s of all) keys.set(rowKeyOf(s), (keys.get(rowKeyOf(s)) || 0) + 1);
  const by = {}; for (const s of all) by[s.store] = (by[s.store] || 0) + 1;
  const rows = {}; for (const k of keys.keys()) { const st = k.split(' · ')[0]; rows[st] = (rows[st] || 0) + 1; }
  console.log(JSON.stringify({ sites: all.length, byStore: by, rows: keys.size, rowsByStore: rows }));
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify([...keys].map(([k, n]) => ({ key: k, n })), null, 1));
}
