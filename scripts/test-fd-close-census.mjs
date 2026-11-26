#!/usr/bin/env node
// A DESCRIPTOR HAS ONE OWNER AND IS CLOSED ONCE (主开发 r621, 2026-11-20 — the class hunt of a product fault found that day:
// src/usage-ledger-dedup.js dedupSteps closed its temporary writer's descriptor before its rename and AGAIN in its finally; the
// writer's close kept the number and swallowed the error. Alone the second close fails unheard; beside another thread the number
// the first close freed is that thread's next open, and the second close closes ITS file — a test machine's Node aborted. Lane
// lg-leak-census cures that module; this census holds the CLASS everywhere else).
// THE LAW: a descriptor has ONE owner and is closed ONCE; the owner forgets the number in the statement that closes it (or the
// very next one); no close sits under an empty catch.
// THE CENSUS — by the syntax tree (acorn), never a text pattern: every function under src/, server.js and data/bin (the node
// scripts) that opens a descriptor by hand is a ROW (openSync, fs.open with its callback, a handle of the promises API). RED:
//   twice         a close that can run twice on one road — in the body AND in the finally, on the normal road AND the error road
//                 (try + catch), two in sequence; a close that FORGETS the number (assigns it null / undefined / -1 in its own
//                 statement or the next) is never a second close of a number
//   stream-too    a number handed to a stream / socket that closes it too ({ fd }, no autoClose: false) AND closed by hand
//   handle-raw    the raw .fd of a FileHandle closed by hand (the handle closes it again). A FileHandle's own close() twice is
//                 no double close: the handle forgets its number (fd -1) and a second close() resolves — CHECKED 2026-11-20 on
//                 Node 22 (v22.23.4, the test machine's major) and Node 24 (v24.22.1, the hub's): open /dev/null, close, close
//   loop-left     a loop that closes a variable declared OUTSIDE it, opened in this turn's try, closed in its finally/catch
//                 without forgetting — when this turn's open throws, last turn's number is closed again
//   above-n       a close of a for loop's own counter: «every descriptor above N» (numbers it never opened)
//   closer-keeps  a close()/end()/dispose() of an outer function's descriptor that keeps the number (a second call closes it
//                 again — the placed fault's own shape)
//   empty-catch   a close under an empty catch: TODAY'S 101 (102 with the held module's) are held as a NAMED ratchet by file (EMPTY_CATCH_DEBT — r621's list, by file,
//                 line and function, sent to the coordinator); a new one is red by
//                 its file, line and function; a file's count that falls is said (lower the row)
// HELD: nothing since lane lg-leak-census's unit A cured src/usage-ledger-dedup.js and removed its row (r690): that file is judged here
// like every other, and leg ④ reds the placed fault's own shape there.
// Each rule has a PLANT red by name; the law's own forms (forget at the close, exclusive branches, a handle closed twice, a closer
// that forgets) are planted GREEN. Fast: in-process, stated 2.5 s by its row (174 of 1245 files name an open or a close and are parsed).
// THE EMPTY CATCH, both spellings: a close in a try whose catch is empty, and a HANDLE's close under `.catch(() => { })` (counted alike).
// SHAPES THE MATCHER CANNOT SEE (none faulty today — round wwxskuzuw): a descriptor closed through an alias or a loop variable
// (agentd.js open(): `for (const fd of [inFd, outFd, errFd])` is tied to no row); a descriptor kept in an array or an object literal;
// a close helper that closes its argument, called twice; member descriptors (this.x = openSync) in the closer rule (none in the tree);
// close / open destructured from fs and called bare, and fs.close on an alias outside FSLIKE (none in src, server.js or data/bin).
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { gitEnvFrom } from './git-env.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored, scratchDir } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const J = (x) => JSON.stringify(x);

const acorn = require(path.join(REPO, 'node_modules/acorn'));
const FSLIKE = /^(fs|fsp|fsP|fsPromises|fsx|nodeFs|_fs)$/;
const isFn = (n) => n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
const isLoop = (n) => n && /^(For|ForIn|ForOf|While|DoWhile)Statement$/.test(n.type);
function parse(src) {
  const o = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
  try { return acorn.parse(src, { ...o, sourceType: 'module' }); } catch { return acorn.parse(src, { ...o, sourceType: 'script' }); }
}
function walk(node, parent, visit) {
  if (!node || typeof node.type !== 'string') return;
  node._p = parent; visit(node);
  for (const k of Object.keys(node)) { if (k === '_p' || k === 'loc' || k === 'start' || k === 'end') continue; const v = node[k]; if (Array.isArray(v)) v.forEach((c) => walk(c, node, visit)); else if (v && typeof v.type === 'string') walk(v, node, visit); }
}
const unwrap = (n) => { while (n && (n.type === 'AwaitExpression' || n.type === 'ChainExpression' || n.type === 'ParenthesizedExpression')) n = n.argument || n.expression; return n; };
const propName = (m) => m && m.type === 'MemberExpression' && !m.computed && m.property.type === 'Identifier' ? m.property.name : null;
const fsObj = (o) => o && ((o.type === 'Identifier' && FSLIKE.test(o.name)) || (o.type === 'MemberExpression' && propName(o) === 'promises') || (o.type === 'CallExpression' && o.callee.type === 'Identifier' && o.callee.name === 'require'));
/** the kind of descriptor an expression OPENS, or null */
function openKind(e) {
  const awaited = !!e && e.type === 'AwaitExpression';
  e = unwrap(e);
  if (!e || e.type !== 'CallExpression') return null;
  const c = e.callee;
  if (c.type === 'Identifier' && c.name === 'openSync') return 'fd';
  if (propName(c) === 'openSync') return 'fd';
  if (propName(c) === 'open' && fsObj(c.object)) {
    const o = c.object; const promises = (o.type === 'MemberExpression' && propName(o) === 'promises') || (o.type === 'Identifier' && /^(fsp|fsP|fsPromises)$/.test(o.name));
    if (promises) return 'handle';
    const last = e.arguments[e.arguments.length - 1];
    return isFn(last) ? 'fd-cb' : awaited ? 'handle' : 'fd-cb-ref';
  }
  return null;
}
/** a close call → { key, kind } or null */
function closeOf(e, text) {
  if (!e || e.type !== 'CallExpression') return null;
  const c = e.callee, a0 = e.arguments[0];
  if ((c.type === 'Identifier' && c.name === 'closeSync') || propName(c) === 'closeSync') return a0 ? { key: text(a0), arg: a0, kind: 'fd' } : null;
  if (propName(c) === 'close' && fsObj(c.object) && a0) return { key: text(a0), arg: a0, kind: 'fd' };
  if (propName(c) === 'close' && e.arguments.length === 0) return { key: text(c.object), arg: c.object, kind: 'handle' };
  return null;
}
/** the name of the function a node sits in (its declaration, its property / method key, its variable), '(top)' or '(anonymous)' */
const fnName = (node) => { const f = fnOf(node); if (!f) return '(top)'; if (f.id) return f.id.name; const P = f._p; if (P && (P.type === 'Property' || P.type === 'MethodDefinition') && P.key) return P.key.name || P.key.value; if (P && P.type === 'VariableDeclarator' && P.id.type === 'Identifier') return P.id.name; return '(anonymous)'; };
const stmtOf = (n) => { while (n && n._p && !/Statement$|Declaration$/.test(n.type)) n = n._p; return n; };
const fnOf = (n) => { n = n && n._p; while (n && !isFn(n)) n = n._p; return n || null; };
const contains = (a, b) => { for (let n = b; n; n = n._p) if (n === a) return true; return false; };
const isNullish = (r) => r && ((r.type === 'Literal' && (r.value === null || r.value === -1)) || (r.type === 'Identifier' && r.name === 'undefined') || (r.type === 'UnaryExpression' && r.operator === '-' && r.argument.type === 'Literal' && r.argument.value === 1));
/** does statement S assign key ← nullish (anywhere inside it, not in a nested function)? */
function forgets(S, key, text) {
  let hit = false;
  const v = (n) => { if (hit || !n || typeof n.type !== 'string') return; if (isFn(n)) return; if (n.type === 'AssignmentExpression' && n.operator === '=' && text(n.left) === key && isNullish(n.right)) { hit = true; return; } for (const k of Object.keys(n)) { if (k === '_p' || k === 'loc') continue; const x = n[k]; if (Array.isArray(x)) x.forEach(v); else if (x && typeof x.type === 'string') v(x); } };
  v(S); return hit;
}
/** the owner forgets the number in the statement that closes it (or the very next statement of its block) */
function forgettingClose(call, key, text) {
  const S = stmtOf(call);
  if (forgets(S, key, text)) return true;
  const P = S && S._p; const list = P && (P.type === 'BlockStatement' || P.type === 'Program' ? P.body : P.type === 'SwitchCase' ? P.consequent : null);
  if (list) { const i = list.indexOf(S); if (i >= 0 && list[i + 1] && forgets(list[i + 1], key, text)) return true; }
  // the close sits in a try whose finally (or the try's own next statement) forgets it
  for (let n = call._p; n && !isFn(n); n = n._p) if (n.type === 'TryStatement' && n.finalizer && !contains(n.finalizer, call) && forgets(n.finalizer, key, text)) return true;
  return false;
}
/** the closer forgets its number: after the close's statement — or after an enclosing if / try of its OWN function — the next
 *  statement of that block assigns the number null / undefined / -1 (the CLOSER rule only) */
function forgetsAfter(call, key, text) {
  if (forgettingClose(call, key, text)) return true;
  const f = fnOf(call);
  for (let x = stmtOf(call); x && x._p && x !== f && x._p !== f; x = x._p) {
    const P = x._p; const list = P.type === 'BlockStatement' || P.type === 'Program' ? P.body : P.type === 'SwitchCase' ? P.consequent : null;
    if (list) { const i = list.indexOf(x); if (i >= 0 && list[i + 1] && forgets(list[i + 1], key, text)) return true; }
  }
  return false;
}
const TERM = /^(ReturnStatement|ThrowStatement|BreakStatement|ContinueStatement)$/;
/** after `n`, inside container `upTo`, does the path end (a return/throw/break/continue directly in a block on the way up)? */
function endsBefore(n, upTo) {
  for (let c = n; c && c !== upTo; c = c._p) {
    const P = c._p; if (!P) break;
    if (P.type === 'BlockStatement' || P.type === 'SwitchCase') { const list = P.type === 'BlockStatement' ? P.body : P.consequent; const i = list.indexOf(c); if (i >= 0 && list.slice(i + 1).some((s) => TERM.test(s.type))) return true; if (TERM.test(c.type)) return true; }
    if (P.type === 'TryStatement' && P.finalizer && P.finalizer !== c) return false;   // a finally runs on every road out
  }
  return false;
}
/** can call sites A and B both run on one road? → a reason string, or null when they cannot */
function bothRun(A, B) {
  const anc = new Set(); for (let n = A; n; n = n._p) anc.add(n);
  let L = B; while (L && !anc.has(L)) L = L._p;
  const childOf = (x) => { let c = x; while (c && c._p !== L) c = c._p; return c; };
  const ca = childOf(A), cb = childOf(B);
  if (fnOf(A) !== fnOf(B)) return 'one close in a nested function, one outside (both can run)';
  if (L.type === 'IfStatement' && ca !== L.test && cb !== L.test && ca !== cb) return null;
  if (L.type === 'ConditionalExpression' && ca !== L.test && cb !== L.test && ca !== cb) return null;
  if (L.type === 'LogicalExpression') return null;
  if (L.type === 'SwitchStatement' && ca !== cb) return null;
  if (L.type === 'TryStatement') {
    const part = (c) => (c === L.block ? 'body' : c === L.handler ? 'catch' : c === L.finalizer ? 'finally' : '?');
    const pa = part(ca), pb = part(cb);
    if (pa === 'finally' || pb === 'finally') return `a close in the try's ${pa === 'finally' ? pb : pa} AND in its finally`;
    return `a close on the normal road (try) AND on the error road (catch)`;
  }
  // a sequence: the earlier one's road ends before the later one?
  const first = A.start < B.start ? A : B;
  if (endsBefore(first, L)) return null;
  return 'two closes in sequence on one road';
}
/** the node that DECLARES identifier `name` as seen from `from` (a declarator, a param, a catch param), or null (a global / unknown) */
function declOf(from, name) {
  const declIn = (list) => { for (const st of list || []) { if (st && st.type === 'VariableDeclaration') for (const d of st.declarations) if (d.id.type === 'Identifier' && d.id.name === name) return d; } return null; };
  for (let n = from._p, prev = from; n; prev = n, n = n._p) {
    if (n.type === 'BlockStatement' || n.type === 'Program') { const d = declIn(n.body); if (d) return d; }
    if (n.type === 'SwitchCase') { const d = declIn(n.consequent); if (d) return d; }
    if ((n.type === 'ForStatement' && n.init && n.init.type === 'VariableDeclaration') ) { const d = declIn([n.init]); if (d) return d; }
    if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type === 'VariableDeclaration') { const d = declIn([n.left]); if (d) return d; }
    if (n.type === 'CatchClause' && n.param && n.param.type === 'Identifier' && n.param.name === name) return n.param;
    if (isFn(n)) { for (const p of n.params) { const id = p.type === 'AssignmentPattern' ? p.left : p; if (id.type === 'Identifier' && id.name === name) return id; } }
  }
  return null;
}
function census(files) {
  const rows = [], findings = [], stats = { files: 0, parsed: 0, failed: [], opens: 0, closes: 0, emptyCatch: [] };
  for (const [rel, src] of Object.entries(files)) {
    stats.files++;
    if (!/openSync|closeSync|\bopen\(/.test(src)) continue;   // a file that names no open and no close holds no row (a descriptor is opened and closed only by these names)
    stats.scanned = (stats.scanned || 0) + 1;
    let ast; try { ast = parse(src); stats.parsed++; } catch (e) { stats.failed.push(`${rel}: ${e.message}`); continue; }
    const text = (n) => src.slice(n.start, n.end);
    const nl = []; for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) nl.push(i);
    const lineAt = (off) => { let lo = 0, hi = nl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (nl[m] < off) lo = m + 1; else hi = m; } return lo + 1; };
    const binds = [], closes = [], streamGiven = [];
    walk(ast, null, (n) => {
      if (n.type === 'VariableDeclarator' && n.init && n.id.type === 'Identifier') { const k = openKind(n.init); if (k) binds.push({ key: n.id.name, kind: k, node: n, fn: fnOf(n), decl: n }); }
      if (n.type === 'AssignmentExpression' && n.operator === '=') { const k = openKind(n.right); if (k) binds.push({ key: text(n.left), kind: k, node: n, fn: fnOf(n), member: n.left.type === 'MemberExpression', decl: n.left.type === 'Identifier' ? 'resolve' : null }); }
      if (n.type === 'CallExpression' && openKind(n) === 'fd-cb') { const cb = n.arguments[n.arguments.length - 1]; const p = cb.params[1]; if (p && p.type === 'Identifier') binds.push({ key: p.name, kind: 'fd', node: n, fn: cb, cbParam: true, decl: p }); }
      const c = closeOf(n, text); if (c) closes.push({ ...c, node: n, fn: fnOf(n) });
      // a descriptor handed to a stream / socket that closes it too
      if ((n.type === 'CallExpression' || n.type === 'NewExpression')) { const nm = n.callee.type === 'Identifier' ? n.callee.name : propName(n.callee); if (/^(createReadStream|createWriteStream|ReadStream|WriteStream|Socket)$/.test(nm || '')) for (const a of n.arguments) if (a && a.type === 'ObjectExpression') { const fdp = a.properties.find((p) => p.type === 'Property' && !p.computed && p.key && (p.key.name === 'fd' || p.key.value === 'fd')); const ac = a.properties.find((p) => p.type === 'Property' && p.key && (p.key.name === 'autoClose')); if (fdp && !(ac && ac.value.type === 'Literal' && ac.value.value === false)) streamGiven.push({ key: fdp.shorthand ? fdp.key.name : text(fdp.value), node: n }); } }
    });
    for (const b of binds) if (b.decl === 'resolve') b.decl = declOf(b.node, b.key) || ('global:' + b.key);
    for (const c of closes) c.decl = c.arg && c.arg.type === 'Identifier' ? (declOf(c.node, c.arg.name) || ('global:' + c.arg.name)) : null;
    stats.opens += binds.length; stats.closes += closes.length;
    // a close under an empty catch (any close site)
    const handleKeys = new Set(binds.filter((b) => b.kind !== 'fd' && b.kind !== 'fd-cb').map((b) => b.key));
    const emptyFn = (a) => !!a && isFn(a) && a.body && a.body.type === 'BlockStatement' && a.body.body.length === 0;
    for (const c of closes) {
      if (c.kind === 'handle' && !handleKeys.has(c.key)) continue;
      // the TRY form: the close in a try whose catch is empty; the PROMISE form (a handle's close): `.catch(() => {})` (round wwxskuzuw)
      const M = c.node._p; let empty = !!(M && M.type === 'MemberExpression' && propName(M) === 'catch' && M._p && M._p.type === 'CallExpression' && M._p.callee === M && emptyFn(M._p.arguments[0]));
      if (!empty) for (let n = c.node._p; n && !isFn(n); n = n._p) if (n.type === 'TryStatement' && contains(n.block, c.node)) { empty = !!(n.handler && n.handler.body.body.length === 0); break; }
      if (!empty) continue;
      { const bd = binds.find((x) => x.key === c.key && (x.member || c.decl === x.decl)); const oc = bd ? unwrap(bd.node.init || bd.node.right || bd.node) : null; const fl = oc && oc.arguments && oc.arguments[1]; const flags = !bd ? 'unknown (no open here)' : fl && fl.type === 'Literal' ? String(fl.value) : fl ? text(fl).slice(0, 40) : 'r (default)'; const w = !bd ? '?' : (fl && fl.type === 'Literal' ? /[wa+]/.test(String(fl.value)) : /O_WRONLY|O_RDWR|O_CREAT|O_APPEND|O_TRUNC/.test(fl ? text(fl) : '')) ? 'write' : 'read'; const synced = (() => { const f = fnOf(c.node); if (!f) return false; const t = text(f); const k = c.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return new RegExp(`f(data)?syncSync\\(\\s*${k}\\b|${k}\\.(sync|datasync)\\(`).test(t); })();
              findings.push({ rule: 'empty-catch', file: rel, line: lineAt(c.node.start), key: c.key, why: 'a close under an empty catch', flags, rw: w, synced, fn: (() => { const f = fnOf(c.node); if (!f) return '(top)'; if (f.id) return f.id.name; const P = f._p; if (P && (P.type === 'Property' || P.type === 'MethodDefinition') && P.key) return P.key.name || P.key.value; if (P && P.type === 'VariableDeclarator') return P.id.name; return '(anonymous)'; })() }); }
    }
    // a helper that closes every descriptor above N: closeSync(i) of the enclosing for loop's own counter
    for (const c of closes) for (let n = c.node._p; n && !isFn(n); n = n._p) if (n.type === 'ForStatement' && n.update && c.arg.type === 'Identifier' && n.update.type === 'UpdateExpression' && n.update.argument.type === 'Identifier' && n.update.argument.name === c.arg.name) findings.push({ rule: 'above-n', file: rel, line: lineAt(c.node.start), fn: fnName(c.node), key: c.key, why: 'closes every descriptor of a counted range (numbers it never opened)' });
    // the rows: each binding with its close sites
    for (const b of binds) {
      const scope = b.member ? null : (b.cbParam ? b.fn : b.fn);
      const mine = closes.filter((c) => c.key === b.key && (b.member ? true : c.decl === b.decl));
      const row = { file: rel, line: lineAt(b.node.start), key: b.key, kind: b.kind, closes: mine.map((c) => lineAt(c.node.start)) };
      rows.push(row);
      const keep = b.kind === 'handle' || b.kind === 'handle?' ? [] : mine.filter((c) => !forgettingClose(c.node, b.key, text));
      if (b.kind === 'handle' || b.kind === 'handle?') for (const c of closes) if (c.kind === 'fd' && c.arg.type === 'MemberExpression' && propName(c.arg) === 'fd' && text(c.arg.object) === b.key) findings.push({ rule: 'handle-raw', file: rel, line: lineAt(c.node.start), fn: fnName(c.node), key: c.key, why: 'the raw number of a FileHandle closed by hand — the handle closes it again' });
      for (let i = 0; i < keep.length; i++) for (let j = i + 1; j < keep.length; j++) { const why = bothRun(keep[i].node, keep[j].node); if (why) findings.push({ rule: 'twice', file: rel, line: lineAt(b.node.start), fn: fnName(keep[i].node), key: b.key, sites: [lineAt(keep[i].node.start), lineAt(keep[j].node.start)], why }); }
      // the loop: a variable declared outside a loop, opened inside it, closed in the loop's finally/catch without forgetting
      if (!b.member && b.node.type === 'AssignmentExpression') {
        let loop = null; for (let n = b.node._p; n && n !== b.fn; n = n._p) if (isLoop(n)) { loop = n; break; }
        if (loop && b.decl && typeof b.decl === 'object' && contains(loop, b.decl)) loop = null;   // declared inside the loop: fresh every turn
        if (loop) for (const c of keep) if (contains(loop, c.node)) { let inFin = false; for (let n = c.node._p; n && n !== loop; n = n._p) if (n.type === 'TryStatement' && (contains(n.finalizer || {}, c.node) || contains(n.handler || {}, c.node)) && contains(n.block, b.node)) inFin = true; if (inFin) findings.push({ rule: 'loop-left', file: rel, line: lineAt(c.node.start), fn: fnName(c.node), key: b.key, why: 'a loop closes a number kept from its previous turn when this turn\'s open threw' }); }
      }
      for (const g of streamGiven) if (g.key === b.key && mine.length) findings.push({ rule: 'stream-too', file: rel, line: lineAt(g.node.start), fn: fnName(g.node), key: b.key, sites: mine.map((c) => lineAt(c.node.start)), why: 'handed to a stream that closes it, and closed again' });
    }
    // a closer that keeps the number: a close of a descriptor DECLARED in an outer function, inside a nested function named
    // close/end/dispose — matched by the declaring scope (round wwxskuzuw: a lazy open in a sibling function, attach-roads' fileTail)
    for (const c of closes) {
      const f = c.fn; if (!f || !c.decl || typeof c.decl !== 'object') continue;
      const b = binds.find((x) => x.key === c.key && !x.member && x.kind !== 'handle' && x.kind !== 'handle?' && x.decl === c.decl); if (!b) continue;
      const declFn = fnOf(c.decl); if (!declFn || declFn === f || !contains(declFn, f)) continue;
      const P = f._p; const nm = P && P.type === 'Property' && P.key ? (P.key.name || P.key.value) : P && P.type === 'MethodDefinition' ? P.key.name : f.id ? f.id.name : null;
      if (/^(close|end|dispose|release|done|finish)$/i.test(nm || '') && !forgetsAfter(c.node, c.key, text)) findings.push({ rule: 'closer-keeps', file: rel, line: lineAt(c.node.start), fn: nm, key: c.key, why: `a ${nm}() that closes an outer descriptor and keeps the number (a second call closes it again)` });
    }
  }
  return { rows, findings, stats };
}

// THE HOLD NAMES EXACTLY WHAT IT HOLDS AND ENDS WITH IT (round wwxskuzuw's must): while held, a file's findings are PINNED one by one
// (the rule and the function of each); any other finding in that file is red by name; a pin the file no longer has is red «stale
// hold» with the pin (the row, when it is its last) to remove. Whichever lands second — this census or lane lg-leak-census's cure (its
// unit A) — removes the row: from then on the file is judged like every other, and the fault's own shape is red here
const HELD = Object.freeze({});   // EMPTY since lane lg-leak-census's unit A (r611 / r690): its cure landed second and removed src/usage-ledger-dedup.js's row — that file is judged like every other
// TODAY'S closes under an empty catch, by file (r621's list) — the sweep that says a failed close is its own unit; a NEW one is red
const EMPTY_CATCH_DEBT = Object.freeze({
  "data/bin/agy-wrapper.js": 1,
  "data/bin/job-wrapper.js": 1,
  "data/bin/vibespace-channels": 1,
  "data/bin/vibespace-claude-subscription-login.mjs": 1,
  "data/bin/vibespace-remote-keeper": 1,
  "data/bin/vibespace-usage-scan": 2,
  "src/account-material.js": 3,
  "src/adapters/codex.js": 2,
  "src/agent-routes.js": 1,
  "src/agentd/agentd.js": 5,   // (the fifth landed on the .414 train before this census: B-147f's start-that-never-happened, open(), its three pipe descriptors handed to the child — held as ruled)
  "src/agentd/attach-roads.js": 1,
  "src/agy-store-fs.js": 3,
  "src/app-secrets-seal.js": 1,
  "src/app-serve.js": 1,
  "src/app-system-serve.js": 1,
  "src/channel-store.js": 5,
  "src/claude-oat-probe.js": 1,
  "src/cli-identity.js": 1,
  "src/codex-fork-ledger-purge.js": 1,
  "src/design-fs.js": 4,
  "src/desktop-serve.js": 3,
  "src/device-audit.js": 1,
  "src/exit-proxy.js": 2,
  "src/harnesses/claude-home.js": 1,
  "src/hosts.js": 2,
  "src/jobs.js": 2,
  "src/machine-probes.js": 1,
  "src/managed-claude-settings.js": 1,
  "src/plugins/frp.js": 3,
  "src/plugins/tailscale.js": 1,
  "src/routes/chat-attachments.js": 1,
  "src/run-reads.js": 1,
  "src/safe-fs-worker.js": 2,
  "src/secret-box.js": 1,
  "src/secret-file.js": 4,   // B-dc3f r1195 (1), +1 BY NAME: the folder's close sits inside its sync's best effort, as the file's other closes — a write that LANDED is never reported failed for it
  "src/server/auto-resume-workflow.js": 2,
  "src/server/browser-attach-launch.js": 2,
  "src/server/browser-cli-install.js": 2,
  "src/server/browser-engines.js": 1,
  "src/server/browser-installs.js": 2,
  "src/server/channel-api.js": 1,
  "src/server/decision-engine.js": 1,
  "src/server/goal-sync.js": 1,
  "src/server/ops-routes.js": 2,
  "src/server/session-stdout.js": 1,
  "src/server/stdout/claude-stream-json.js": 1,
  "src/server/vault-engine.js": 3,
  "src/server/vault-run-door.js": 3,
  "src/session-store.js": 3,
  "src/store-exit-keeper.js": 1,
  "src/sysinfo.js": 1,
  "src/task-groups.js": 1,
  "src/turn-carry.js": 1,
  "src/usage-estimator.js": 1,   // B-360d part 3 U1: −1 (a line reader's close moved into the view's read)
  "src/usage-history.js": 1,
  "src/usage-origin-backfill.js": 1,
  "src/usage-routes.js": 1,
  "src/usage-walker.js": 2,
  "src/weekly-lanes-unfold.js": 1,
  "src/workflow-usage-tailer.js": 1,
  "src/ws-create.js": 1,
});
const STRUCTURAL = ['twice', 'stream-too', 'handle-raw', 'loop-left', 'above-n', 'closer-keeps'];
/** the census's verdict over a set of files: the structural findings outside HELD, the ratchet's new closes under an empty catch */
function verdict(files, held = HELD, { debt = EMPTY_CATCH_DEBT, partial = false } = {}) {
  const r = census(files);
  const pinned = (f) => !!held[f.file] && held[f.file].pins.some(([rule, fn]) => f.rule === rule && f.fn === fn);
  const judged = r.findings.filter((f) => !pinned(f));
  const stale = [];
  for (const [file, h] of Object.entries(held)) if (files[file] !== undefined) for (const [rule, fn] of h.pins) if (!r.findings.some((f) => f.file === file && f.rule === rule && f.fn === fn)) stale.push(`stale hold: ${file} no longer has «${rule}» in ${fn}() — remove that pin${h.pins.length === 1 ? ' (its row: the file is judged like every other)' : ''}`);
  const structural = judged.filter((f) => STRUCTURAL.includes(f.rule));
  const per = {}; for (const f of judged.filter((x) => x.rule === 'empty-catch')) (per[f.file] = per[f.file] || []).push(f);
  const grown = [], fell = [];
  for (const [file, list] of Object.entries(per)) if (list.length > (debt[file] || 0)) grown.push(`${file}: ${list.length} closes under an empty catch (held ${debt[file] || 0}) — ${list.map((f) => `${f.line} ${f.fn}() ${f.key}`).join('; ')}`);
  for (const [file, n] of Object.entries(debt)) {
    if (files[file] === undefined) { if (!partial) fell.push(`${file}: a row for a file that no longer exists — remove the row`); continue; }
    if ((per[file] || []).length < n) fell.push(`${file}: ${(per[file] || []).length} closes under an empty catch, held ${n} — restate the row to ${(per[file] || []).length} (a removed close and a new one never trade places silently)`);
  }
  return { r, structural, grown, fell, stale, held: r.findings.filter(pinned) };
}
const name = (f) => `${f.rule} ${f.file}:${f.line} ${f.key}${f.sites ? ' @' + f.sites.join(',') : ''} — ${f.why}`;

// ── ① THE TREE ──
console.log('① every hand-opened descriptor of src/, server.js and data/bin is a row; none is closed twice; no new close under an empty catch');
const tracked = execFileSync('git', ['ls-files', 'src', 'server.js', 'data/bin'], { cwd: REPO, encoding: 'utf-8', env: gitEnvFrom(process.env) }).split('\n').filter(Boolean);
const FILES = {};
for (const f of tracked) { let s; try { s = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { continue; } if (/\.(c|m)?js$/.test(f) || (/^data\/bin\//.test(f) && /^#!.*\bnode\b/.test(s))) FILES[f] = s; }
const T = verdict(FILES);
const kinds = {}; for (const w of T.r.rows) kinds[w.kind] = (kinds[w.kind] || 0) + 1;
console.log(`  · ${T.r.rows.length} rows (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}) in ${new Set(T.r.rows.map((w) => w.file)).size} files; ${T.r.stats.scanned} of ${T.r.stats.files} files name an open or a close and were parsed`);
ok(T.r.stats.failed.length === 0 && T.r.stats.scanned > 100 && T.r.rows.length > 150, `the census read the tree: ${T.r.stats.scanned} files parsed, none failed, ${T.r.rows.length} rows`, T.r.stats.failed);
ok(T.structural.length === 0, 'no descriptor outside the held module can be closed twice (body + finally, normal + error road, a sequence, a stream that closes it too, a handle\'s raw .fd, a loop\'s last number, «every descriptor above N», a closer that keeps its number)', T.structural.map(name));
ok(T.grown.length === 0, `no NEW close under an empty catch (today's ${Object.values(EMPTY_CATCH_DEBT).reduce((a, b) => a + b, 0)} held by file — the sweep that says a failed close is its own unit)`, T.grown);
ok(T.fell.length === 0, 'the empty-catch ratchet holds exactly: no row fell (a fall is restated by its count) and no row names a file that no longer exists', T.fell);
ok(T.stale.length === 0, 'every hold names a finding its file still has (a hold ends with what it holds — «stale hold» otherwise)', T.stale);
for (const f of T.held) console.log(`  · HELD (${HELD[f.file].why}): ${name(f)} — pinned as «${f.rule}» in ${f.fn}()`);

// ── ② THE PLANTS: each rule red by name ──
console.log('② each rule, planted, is red by name');
const P = (src, held = {}) => verdict({ 'src/planted.js': "const fs = require('fs'); const fsp = require('fs/promises');\n" + src }, held, { debt: {}, partial: true });
const plants = {
  twice: ["function a(p, b) { const fd = fs.openSync(p, 'r'); try { fs.readSync(fd, b); fs.closeSync(fd); } finally { fs.closeSync(fd); } }", /in the try's body AND in its finally/],
  'twice ': ["function a(p) { const fd = fs.openSync(p, 'r'); try { use(fd); fs.closeSync(fd); } catch (e) { fs.closeSync(fd); throw e; } }", /normal road \(try\) AND on the error road/],
  'twice  ': ["function a(p) { const fd = fs.openSync(p, 'r'); fs.closeSync(fd); log(); fs.closeSync(fd); }", /two closes in sequence/],
  'stream-too': ["function a(p) { const fd = fs.openSync(p, 'r'); const s = fs.createReadStream(null, { fd }); s.pipe(out); fs.closeSync(fd); }", /handed to a stream/],
  'handle-raw': ["async function a(p) { const h = await fsp.open(p, 'r'); fs.closeSync(h.fd); await h.close(); }", /raw number of a FileHandle/],
  'loop-left': ["function a(ps) { let fd; for (const p of ps) { try { fd = fs.openSync(p, 'r'); use(fd); } finally { fs.closeSync(fd); } } }", /previous turn/],
  'above-n': ["function a() { for (let i = 3; i < 1024; i++) { try { fs.closeSync(i); } catch (e) { log(e); } } }", /counted range/],
  'closer-keeps': ["function writerOf(p) { const fd = fs.openSync(p, 'w'); return { write(b) { fs.writeSync(fd, b); }, close() { fs.closeSync(fd); } }; }", /close\(\) that closes an outer descriptor and keeps the number/],
  // the placed fault in its REAL spelling (src/usage-ledger-dedup.js writerOf + dedupSteps at the release): the number exposed on the
  // object, the close under its empty catch, closed before the rename AND in the finally — once the hold ends, this plant guards it
  'closer-keeps ': ["function writerOf(file) { const fd = fs.openSync(file, 'w'); const w = { bytes: 0, fd, raw(b) { fs.writeSync(fd, b); }, close() { try { fs.closeSync(fd); } catch { } } }; return w; }\nfunction dedupSteps(p) { const w = writerOf(p + '.tmp'); try { w.raw('x'); w.close(); fs.renameSync(p + '.tmp', p); return; } finally { w.close(); } }", /close\(\) that closes an outer descriptor and keeps the number/],
  // the lazy open in a SIBLING function (attach-roads' fileTail spelling): the closer is judged by the scope that DECLARES the number
  'closer-keeps  ': ["function fileTail(file) { let fd = null; const stat = () => { if (fd === null) fd = fs.openSync(file, 'r'); return fd; }; return { stat, close() { try { if (fd !== null) fs.closeSync(fd); } catch (e) { log(e); } } }; }", /close\(\) that closes an outer descriptor and keeps the number/],
};
for (const [rule, [src, re]] of Object.entries(plants)) {
  const v = P(src); const hit = v.structural.filter((f) => f.rule === rule.trim() && re.test(f.why));
  ok(v.r.stats.failed.length === 0 && hit.length >= 1, `PLANT ${rule.trim()}: «${src.slice(0, 96)}…» is RED by name`, v.structural.map(name));
}
{ const v = P("async function a(p) { const h = await fsp.open(p, 'r'); try { await h.read(); } finally { await h.close().catch(() => { }); } }");
  ok(v.r.stats.failed.length === 0 && v.grown.length === 1 && /1 closes under an empty catch \(held 0\) — \d+ a\(\) h/.test(v.grown[0]), 'PLANT empty-catch (the PROMISE form): a handle\'s close under `.catch(() => { })` is counted like the try form — red by name', v.grown); }
{ const H = { 'src/planted.js': { why: 'a plant', pins: [['closer-keeps', 'close']] } };
  const WR = "function writerOf(file) { const fd = fs.openSync(file, 'w'); return { close() { try { fs.closeSync(fd); } catch (e) { log(e); } } }; }";
  const held = P(WR, H), other = P(WR + "\nfunction b(p) { const fd = fs.openSync(p, 'r'); fs.closeSync(fd); fs.closeSync(fd); }", H), clean = P("function writerOf(file) { let fd = fs.openSync(file, 'w'); return { close() { if (fd === null) return; fs.closeSync(fd); fd = null; } }; }", H);
  ok(held.structural.length === 0 && held.stale.length === 0 && held.held.length === 1, 'THE HOLD, held: the pinned finding (rule + function) is printed, not judged', { s: held.structural.map(name), st: held.stale });
  ok(other.structural.length === 1 && other.structural[0].rule === 'twice' && other.structural[0].fn === 'b', 'THE HOLD names exactly what it holds: ANOTHER finding in the held file is red by name', other.structural.map(name));
  ok(clean.stale.length === 1 && /stale hold: src\/planted\.js no longer has «closer-keeps» in close\(\) — remove that pin \(its row/.test(clean.stale[0]), 'THE HOLD ends with what it holds: a held file that reads CLEAN is red «stale hold», with the row to remove', clean.stale); }
{ const v = P("function a(p) { const fd = fs.openSync(p, 'r'); try { use(fd); } finally { try { fs.closeSync(fd); } catch { } } }");
  ok(v.r.stats.failed.length === 0 && v.grown.length === 1 && /src\/planted\.js: 1 closes under an empty catch \(held 0\) — \d+ a\(\) fd/.test(v.grown[0]), 'PLANT empty-catch: a NEW close under an empty catch is RED by its file, line, function and number', v.grown); }

{ const base = { 'src/planted.js': "const fs = require('fs');\nfunction a(p) { const fd = fs.openSync(p, 'r'); try { use(fd); } finally { try { fs.closeSync(fd); } catch { } } }" };
  const fell = verdict(base, {}, { debt: { 'src/planted.js': 2 } }), gone = verdict(base, {}, { debt: { 'src/planted.js': 1, 'src/gone.js': 1 } });
  ok(fell.fell.length === 1 && /src\/planted\.js: 1 closes under an empty catch, held 2 — restate the row to 1/.test(fell.fell[0]) && gone.fell.length === 1 && /src\/gone\.js: a row for a file that no longer exists/.test(gone.fell[0]), 'PLANT the ratchet: a FALL is red with the count to restate, and a row for a file that no longer exists is red', { fell: fell.fell, gone: gone.fell }); }

// ── ③ THE LAW'S OWN FORMS: green ──
console.log('③ the law\'s own forms are never a finding');
const greens = {
  'the close forgets the number in its own statement, the finally closes only what is left': "function a(p) { let fd = fs.openSync(p, 'r'); try { use(fd); fs.closeSync(fd); fd = null; } finally { if (fd !== null) fs.closeSync(fd); } }",
  'two closes on exclusive roads (one returns first)': "function a(p, x) { const fd = fs.openSync(p, 'r'); if (x) { fs.closeSync(fd); return 1; } fs.closeSync(fd); return 2; }",
  'if / else closes': "function a(p, x) { const fd = fs.openSync(p, 'r'); if (x) fs.closeSync(fd); else { use(fd); fs.closeSync(fd); } }",
  'a FileHandle closed on two roads (the handle forgets its number)': "async function a(p) { const h = await fsp.open(p, 'r'); try { await h.read(); } catch (e) { await h.close(); throw e; } await h.close(); }",
  'a closer that forgets its number': "function writerOf(p) { let fd = fs.openSync(p, 'w'); return { close() { if (fd === null) return; fs.closeSync(fd); fd = null; } }; }",
  'a lazy open in a sibling function, the closer forgetting its number after its try (attach-roads\' fileTail form)': "function fileTail(file) { let fd = null; const stat = () => { if (fd === null) fd = fs.openSync(file, 'r'); return fd; }; return { stat, close() { try { if (fd !== null) fs.closeSync(fd); } catch (e) { log(e); } fd = null; } }; }",
  'a loop whose variable is fresh each turn': "function a(ps) { for (const p of ps) { let fd = null; try { fd = fs.openSync(p, 'r'); use(fd); } finally { if (fd !== null) fs.closeSync(fd); } } }",
  'a descriptor handed to a child at spawn, then closed once (the child holds its own copy)': "function a(p) { const fd = fs.openSync(p, 'a'); const c = spawn('x', [], { stdio: ['ignore', fd, fd] }); fs.closeSync(fd); return c; }",
};
for (const [what, src] of Object.entries(greens)) { const v = P(src); ok(v.r.stats.failed.length === 0 && v.r.rows.length >= 1 && v.structural.length === 0 && v.grown.length === 0, `GREEN: ${what}`, v.structural.map(name).concat(v.grown)); }

// ── ④ THE PLACED FAULT, read by the census's own rule (pinned while held — ① reds a stale hold or any other finding there) ──
{
  const LD = FILES['src/usage-ledger-dedup.js'] || '';
  const v = census({ 'src/usage-ledger-dedup.js': LD });
  if (v.stats.failed.length) ok(false, '④ src/usage-ledger-dedup.js parses', v.stats.failed);
  const fault = v.findings.filter((f) => f.rule === 'closer-keeps');
  if (HELD['src/usage-ledger-dedup.js']) ok(fault.length === 1 && fault[0].fn === 'close', `④ the placed fault (src/usage-ledger-dedup.js, lane lg-leak-census's to cure) is FOUND by the census's own rule: ${fault.map(name).join(' · ')}`, fault.map(name));
  else ok(fault.length === 0, '④ src/usage-ledger-dedup.js is judged like every other file (its hold ended): no closer keeps its number there', fault.map(name));
}
// ── ⑤ THE ONE CLOSE OF A WRITTEN FILE (row B-15ac — 主开发 r635 / r755): a close of a file that was WRITTEN with no fsync before
// it is where a deferred write error arrives (a network or FUSE data folder) — said once (its code, where), closed once, the number
// forgotten; one helper (src/fd-close.js) and ONE spelling: each fallback (the wrappers', the channels CLI's) says the helper's words,
// built here from its own file's text. A PLACED failure (fs.closeSync answering EIO), never a real mount. RED (in a copy): the hosts
// delta's old swallow — nothing said.
console.log('⑤ a close of a written file says a failed close once (its code, where), closes once, forgets the number — one helper, one spelling');
{
  const FCm = require(path.join(REPO, 'src/fd-close.js'));
  const eio = () => Object.assign(new Error('EIO: a stand-in refused close'), { code: 'EIO' });
  const placed = (fn, refuse = () => true) => { const cs = fs.closeSync; let n = 0; fs.closeSync = function (fd, ...a) { n++; if (refuse(fd)) throw eio(); return cs.call(this, fd, ...a); }; try { return { r: fn(), n }; } finally { fs.closeSync = cs; } };
  const WORDS = FCm.closeFailedWords('a stand-in store', 'EIO');
  const said = [];
  const one = placed(() => FCm.closeWritten(424242, 'a stand-in store', (l) => said.push(l)));
  const none = placed(() => FCm.closeWritten(null, 'none', (l) => said.push('NOT ' + l)));
  let threw = null; try { placed(() => FCm.closeWritten(424242, 'x', () => { throw new Error('a sink that throws'); })); } catch (e) { threw = e.message; }
  ok(one.r === null && one.n === 1 && J(said) === J([WORDS]) && WORDS === 'a stand-in store: the file could not be closed (EIO) — what was written may not be on disk' && none.r === null && none.n === 0 && threw === null,
    '⑤ closeWritten: a failed close is SAID once (the site\'s name, the code — no path), the descriptor closed ONCE, the number forgotten (→ null); null is closed already; a sink that throws never makes it throw', { said, one: one.n, none: none.n, threw });
  const hs = []; const hr = await FCm.closeWrittenHandle({ close: async () => { throw eio(); } }, 'a stand-in handle', (l) => hs.push(l));
  ok(hr === null && J(hs) === J([FCm.closeFailedWords('a stand-in handle', 'EIO')]), '⑤ closeWrittenHandle: a FileHandle\'s failed close is said once in the same words (→ null)', hs);
  // ONE SPELLING: every fallback, built from its file's own text, says EXACTLY the helper's words
  const FALL = /const closeWritten = FC \? FC\.closeWritten : (\(fd, where, say\) => \{[^\n]*\});\n/, FALLH = /const closeWrittenHandle = FCL \? FCL\.closeWrittenHandle : (async \(fh, where, say\) => \{[^\n]*\});\n/;
  const spell = {};
  for (const f of ['data/bin/chat-wrapper.js', 'data/bin/codex-chat-wrapper.js', 'data/bin/pty-wrapper.js', 'data/bin/job-wrapper.js']) {
    const m = FALL.exec(FILES[f] || ''); if (!m) { spell[f] = 'no fallback'; continue; }
    const fb = new Function('fs', `return ${m[1]};`)(fs); const got = [];   // eslint-disable-line no-new-func
    const r = placed(() => fb(424242, 'a stand-in store', (l) => got.push(l)));
    spell[f] = r.r === null && J(got) === J([WORDS]) ? 'same' : J(got);
  }
  { const m = FALLH.exec(FILES['data/bin/vibespace-channels'] || ''); if (!m) spell['data/bin/vibespace-channels'] = 'no fallback';
    else { const fb = new Function(`return ${m[1]};`)(); const got = []; const r = await fb({ close: async () => { throw eio(); } }, 'a stand-in handle', (l) => got.push(l));   // eslint-disable-line no-new-func
      spell['data/bin/vibespace-channels'] = r === null && J(got) === J([FCm.closeFailedWords('a stand-in handle', 'EIO')]) ? 'same' : J(got); } }
  ok(Object.values(spell).length === 5 && Object.values(spell).every((v) => v === 'same'), '⑤ ONE SPELLING: the four wrappers\' fallbacks and the channels CLI\'s, built from their own text, say EXACTLY the helper\'s words', spell);
  { const drift = (FILES['data/bin/pty-wrapper.js'] || '').replace('— what was written may not be on disk`); } catch { } } return null; };', '— it may be lost`); } catch { } } return null; };');
    const m = FALL.exec(drift); const fb = m ? new Function('fs', `return ${m[1]};`)(fs) : null; const got = []; if (fb) placed(() => fb(424242, 'a stand-in store', (l) => got.push(l)));   // eslint-disable-line no-new-func
    ok(drift !== FILES['data/bin/pty-wrapper.js'] && !!fb && got.length === 1 && got[0] !== WORDS, 'CONTROL (a fallback whose words drifted, in its text): it no longer says the helper\'s words — red', got); }
  // THE SITES go through it (pins): the hub's two, the three wrappers' overwrite, the job's log rotation (its number forgotten), the CLI
  const P = (f, re) => re.test(FILES[f] || '');
  const sites = {
    hosts: P('src/hosts.js', /\} finally \{ fd = FC\.closeWritten\(fd, `the hosts delta \(\$\{path\.basename\(cachePath\)\}\)`, \(l\) => \{ closeFailed = true; console\.warn\(`\[hosts\] \$\{l\}`\); \}\); \}[^\n]*\n\s*return !closeFailed;/),
    channels: P('src/channel-store.js', /journalFd = FC\.closeWritten\(journalFd, 'the channels journal', \(l\) => warn\(`\[channels\] \$\{l\}`\)\);/),
    chat: P('data/bin/chat-wrapper.js', /\} finally \{ fd = closeWritten\(fd, `\$\{path\.basename\(file\)\} \(rewritten in place\)`, log\); \}/),
    codex: P('data/bin/codex-chat-wrapper.js', /\} finally \{ fd = closeWritten\(fd, `\$\{path\.basename\(file\)\} \(rewritten in place\)`, log\); \}/),
    pty: P('data/bin/pty-wrapper.js', /\} finally \{ fd = closeWritten\(fd, `\$\{path\.basename\(file\)\} \(rewritten in place\)`, log\); \}/),
    job: P('data/bin/job-wrapper.js', /logFd = closeWritten\(logFd, "the job's log \(its rotation\)", \(l\) => \{ logOwed = l; \}\);/) && !/fs\.closeSync\(logFd\)/.test(FILES['data/bin/job-wrapper.js'] || '') && !/fs\.writeSync\(logFd, /.test((FILES['data/bin/job-wrapper.js'] || '').replace(/function logOpen\(\) \{[\s\S]*?\n\}\n/, '')),
    cli: P('data/bin/vibespace-channels', /if \(fh\) fh = await closeWrittenHandle\(fh, 'the attachment being saved', \(w\) => \{ closeSaid = w; \}\);\n\s*if \(closeSaid\) console\.error\(`vibespace-channels: \$\{closeSaid\}`\);/),
  };
  ok(Object.values(sites).every(Boolean), '⑤ THE SITES go through the helper: the hosts delta, the channels journal, the chat / codex / pty wrappers\' overwrite in place (their own log), the job\'s log rotation (the number forgotten — a reopen that throws leaves none, never a closed one), the channels CLI\'s attachment (pins)', sites);
  // a hub site DRIVEN: the hosts delta's close refused (placed) — said once in the journal by its name
  const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
  const deltaScene = (HM, tag) => {
    const d = scratchDir('fd-close-delta-' + tag); const f = path.join(d, 'cache.jsonl'); fs.writeFileSync(f, 'old\n');
    const warns = []; const cw = console.warn; console.warn = (...a) => warns.push(a.join(' '));
    let r; try { r = placed(() => HM.prototype._appendDeltaAt.call({}, f, 4, Buffer.from('new\n'))); } finally { console.warn = cw; }
    fs.rmSync(d, { recursive: true, force: true });
    return { landed: r.r, closes: r.n, said: warns.filter((l) => /^\[hosts\] the hosts delta \(cache\.jsonl\): the file could not be closed \(EIO\)/.test(l)).length };
  };
  const ds = deltaScene(HostManager, 'real');
  ok(ds.landed === false && ds.closes === 1 && ds.said === 1, '⑤ the hosts delta, driven: its close refused (placed) is SAID once in the hub\'s journal by its name, and it answers FALSE (no landing — its caller reads the whole file again: round wrm8730fx), closed once', ds);
  const HSRC = FILES['src/hosts.js'];
  const XH = mutantCopies('fdc-delta-swallow', REPO).load('src/hosts.js', anchored(HSRC, /\} finally \{ fd = FC\.closeWritten\(fd, `the hosts delta[^\n]*\n/, '} finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { } } }   // MUTANT: the old swallow\n', 'delta-swallow'), 'delta-swallow').HostManager;
  const xd = deltaScene(XH, 'red');
  ok(xd.landed === true && xd.said === 0, 'CONTROL (the hosts delta\'s old swallow, in a copy): its close refused and NOTHING said — red', xd);
}

// ── ⑤b ITS FOLLOW (round wrm8730fx, 主开发 r831): every road a PLACED close failure, never only a pin on its text — the channels
// journal (a real store), a wrapper's in-place rewrite and the job log's rotation (each built from its own file's text), the channels
// CLI's attachment (the real CLI, a child, its FileHandle's close refused by a preload). REDs (in copies): each road's old line.
console.log('⑤b every close road, driven: the channels journal, a wrapper\'s rewrite in place, the job log\'s rotation with a reopen that throws, the CLI\'s attachment');
{
  const FCm = require(path.join(REPO, 'src/fd-close.js'));
  const eio = () => Object.assign(new Error('EIO: a stand-in refused close'), { code: 'EIO' });
  const placed = (fn, refuse = () => true) => { const cs = fs.closeSync; let n = 0; fs.closeSync = function (fd, ...a) { if (refuse(fd)) { n++; throw eio(); } return cs.call(this, fd, ...a); }; try { return { r: fn(), n }; } finally { fs.closeSync = cs; } };
  // THE CHANNELS JOURNAL: a real store, one stamp (the journal opens), its close refused for the journal's descriptor only
  const CSREL = 'src/channel-store.js';
  const journalScene = async (CS, tag) => {
    const d = scratchDir('fdc-journal-' + tag); const warns = [];
    const st = CS.createChannelStore({ dir: d, log: { warn: (...a) => warns.push(a.join(' ')), log() { } } });
    await st.index.update(() => { st.index.entry('acct', 'c1', { create: true }); });
    st.stamps.set('acct/c1', { lastPollAt: 1000 });
    const jl = st.stamps.log;
    const r = placed(() => st.close(), (fd) => { try { return fs.readlinkSync(`/proc/self/fd/${fd}`) === jl; } catch { return false; } });
    return { refused: r.n, said: warns.filter((l) => /\[channels\] the channels journal: the file could not be closed \(EIO\) — what was written may not be on disk/.test(l)).length };
  };
  const js = await journalScene(require(path.join(REPO, CSREL)), 'real');
  ok(js.refused === 1 && js.said === 1, '⑤b the channels journal, driven (a real store): its close refused (placed) is SAID once in the hub\'s journal by its name', js);
  const XJ = mutantCopies('fdc-journal-swallow', REPO).load(CSREL, anchored(FILES[CSREL], /^ {4}journalFd = FC\.closeWritten\(journalFd, 'the channels journal'[^\n]*\n/m, '    if (journalFd !== null) { try { fs.closeSync(journalFd); } catch { } journalFd = null; }   // MUTANT: the old swallow\n', 'journal-swallow'), 'journal-swallow');
  const xj = await journalScene(XJ, 'red');
  ok(xj.refused === 1 && xj.said === 0, 'CONTROL (the journal\'s old swallow, in a copy): its close refused and NOTHING said — red', xj);
  // A WRAPPER'S REWRITE IN PLACE (pty-wrapper's overwriteIfPresent, built from its own text): the session meta it rewrites
  const owOf = (src) => { const a = src.indexOf('function overwriteIfPresent('), b = src.indexOf('\n}\n', a) + 3; return new Function('fs', 'path', 'closeWritten', 'log', `${src.slice(a, b)}\nreturn overwriteIfPresent;`); };   // eslint-disable-line no-new-func
  const owScene = (src, tag) => {
    const d = scratchDir('fdc-overwrite-' + tag); const f = path.join(d, 'sess-1.meta.json'); fs.writeFileSync(f, '{"old":"a longer old meta"}');
    const logs = []; const fn = owOf(src)(fs, path, FCm.closeWritten, (m) => logs.push(m));
    const r = placed(() => fn(f, '{"new":1}', { pad: true }));
    return { refused: r.n, said: logs.filter((l) => /^sess-1\.meta\.json \(rewritten in place\): the file could not be closed \(EIO\)/.test(l)).length, bytes: fs.readFileSync(f, 'utf8').trim() };
  };
  const PTY = FILES['data/bin/pty-wrapper.js'];
  const ow = owScene(PTY, 'real');
  ok(ow.refused === 1 && ow.said === 1 && ow.bytes === '{"new":1}', '⑤b a wrapper\'s rewrite in place (pty-wrapper overwriteIfPresent, from its own text): its close refused (placed) is SAID once in the wrapper\'s own log, the meta rewritten', ow);
  const xow = owScene(PTY.replace(/\} finally \{ fd = closeWritten\(fd, `\$\{path\.basename\(file\)\} \(rewritten in place\)`, log\); \}[^\n]*/, '} finally { try { fs.closeSync(fd); } catch {} }'), 'red');
  ok(xow.refused === 1 && xow.said === 0, 'CONTROL (the wrapper\'s old swallow, in its text): its close refused and NOTHING said — red', xow);
  // THE JOB LOG'S ROTATION (job-wrapper's logOpen + writeLog, from its own text): the close refused AND the reopen throws — the
  // sentence is OWED and written at the next open, the number never a closed one
  const rotOf = (src, logPath, logCap) => {
    const a = src.indexOf('let logOwed = null;'), b = src.indexOf('\n}\n', src.indexOf('function writeLog(buf) {')) + 3;
    return new Function('fs', 'closeWritten', 'logPath', 'logCap', `let logFd = fs.openSync(logPath, 'a'); let logSize = fs.fstatSync(logFd).size; let held = null;\n${src.slice(a, b)}\nreturn { writeLog, fd: () => logFd };`)(fs, FCm.closeWritten, logPath, logCap);   // eslint-disable-line no-new-func
  };
  const rotScene = (src, tag) => {
    const d = scratchDir('fdc-rotation-' + tag); const lp = path.join(d, 'job.log');
    const J = rotOf(src, lp, 10);
    J.writeLog(Buffer.from('first-8\n'));
    const os = fs.openSync; let refusedOpen = 0;
    fs.openSync = function (f, ...a) { if (String(f) === lp && !refusedOpen) { refusedOpen++; throw Object.assign(new Error('EMFILE: a stand-in'), { code: 'EMFILE' }); } return os.call(this, f, ...a); };
    let r; try { r = placed(() => J.writeLog(Buffer.from('second8\n'))); } finally { fs.openSync = os; }
    const afterFd = J.fd();
    J.writeLog(Buffer.from('third\n'));
    const text = fs.readFileSync(lp, 'utf8');
    return { refusedClose: r.n, refusedOpen, noNumber: afterFd === null, said: /\[job-wrapper\] the job's log \(its rotation\): the file could not be closed \(EIO\) — what was written may not be on disk/.test(text), third: text.includes('third'), rotated: fs.existsSync(lp + '.1') };
  };
  const JW = FILES['data/bin/job-wrapper.js'];
  const rs = rotScene(JW, 'real');
  ok(rs.refusedClose === 1 && rs.refusedOpen === 1 && rs.noNumber && rs.said && rs.third && rs.rotated,
    '⑤b the job log\'s rotation (from its own text): its close refused AND its reopen throwing leave NO number (never a closed one); the next write reopens and the owed sentence is in the log before its line', rs);
  const xrs = rotScene(JW.replace('logFd = closeWritten(logFd, "the job\'s log (its rotation)", (l) => { logOwed = l; });', 'logFd = closeWritten(logFd, "the job\'s log (its rotation)", () => { });'), 'red');
  ok(xrs.refusedClose === 1 && xrs.noNumber && !xrs.said && xrs.third, 'CONTROL (the sentence dropped with the failed reopen, in its text): the log never says the close failed — red', xrs);
  // THE CHANNELS CLI'S ATTACHMENT (the real CLI, a child): its FileHandle's close refused (a preload) — said, closed ONCE
  const cliScene = async (cliPath, tag) => {
    const d = scratchDir('fdc-cli-' + tag); const out = path.join(d, 'got.bin'), count = path.join(d, 'closes.txt'), pre = path.join(d, 'pre.cjs');
    fs.writeFileSync(pre, `const fs = require('fs'); const fsp = fs.promises; const open = fsp.open; let n = 0; process.on('exit', () => { try { fs.writeFileSync(${JSON.stringify(count)}, String(n)); } catch { } });
fsp.open = async (...a) => { const h = await open.apply(fsp, a); if (String(a[0]).includes('.vibespace-attachment-')) { const c = h.close.bind(h); h.close = async () => { n++; await c(); throw Object.assign(new Error('EIO: a stand-in refused close'), { code: 'EIO' }); }; } return h; };\n`);
    const body = Buffer.from('attachment bytes\n');
    const srv = http.createServer((req, res) => { req.resume(); res.writeHead(200, { 'content-length': body.length, 'x-vibespace-attachment': encodeURIComponent(JSON.stringify({ mime: 'application/octet-stream', from: 'a stand-in', conversation: { title: 'a stand-in' } })) }); res.end(body); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const env = { PATH: process.env.PATH, HOME: d, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'vst_x' };
    const r = await new Promise((resolve) => { const ch = spawn(process.execPath, ['-r', pre, cliPath, 'attachment', 'acc/c1', 'm1', 'a1', '--out', out], { env }); let err = ''; ch.stderr.on('data', (x) => { err += x; }); ch.on('close', (code) => resolve({ code, err })); });
    srv.close();
    let closes = -1; try { closes = Number(fs.readFileSync(count, 'utf8')); } catch { }
    return { code: r.code, closes, said: /EIO: a stand-in refused close/.test(r.err), kept: fs.existsSync(out), err: r.err.slice(0, 300) };
  };
  const cl = await cliScene(path.join(REPO, 'data/bin/vibespace-channels'), 'real');
  ok(cl.code === 1 && cl.closes === 1 && cl.said && !cl.kept, '⑤b the channels CLI\'s attachment (the real CLI, a child): its close refused is SAID and the command exits 1, nothing kept — the handle forgotten BEFORE the awaited close, so it is closed ONCE', cl);
  { const d = scratchDir('fdc-cli-red-bin'); const cli = path.join(d, 'vibespace-channels');
    fs.writeFileSync(cli, anchored(FILES['data/bin/vibespace-channels'], /^ {6}\{ const saving = fh; fh = null; await saving\.close\(\); \}[^\n]*\n/m, '      await fh.close(); fh = null;   // MUTANT: the release\'s order\n', 'cli-order'));
    for (const [from, to] of [['src/cli-call.js', 'cli-call.js'], ['src/agent-cli-text.js', 'agent-cli-text.js'], ['src/fd-close.js', 'fd-close.js']]) fs.copyFileSync(path.join(REPO, from), path.join(d, to));
    const xcl = await cliScene(cli, 'red');
    ok(xcl.code === 1 && xcl.closes === 2, 'CONTROL (the release\'s order — the handle forgotten only AFTER its awaited close, in a copy): the catch closes it a SECOND time — red', xcl); }
}

// ── ⑥ THE SYNCED NAME (row B-bcb8 unit B — 主开发 r4367; THE LAW of r4474): a record the hub reads takes its name only after ONE sync of
// its temp. A sync that FAILS (the write error's class — EIO, ENOSPC, EDQUOT, EROFS, any unknown code) or a close that fails after the
// write is a FAILED WRITE: thrown, the temp removed, the OLD record stands, the caller's own road taken. ONLY a sync the file system does
// not do at all (EINVAL, ENOTSUP, EOPNOTSUPP, ENOSYS) is said once and lands. PLACED failures (fs.fsyncSync / fs.closeSync answering a
// code), never a real disk. ONE helper and ONE spelling; EACH RECORD from its wrapper's own code. RED: bf8355a8a's form (in a copy: a
// failed sync said, the temp renamed over the good record anyway). THE TWO BUFFERS (r4563 + r4578 — a buffer is not a durable record): no
// road asks a sync; every road's write and close judged; the durable road written and renamed before it says. RED: 1ce0eb76e's (one sync a write)
console.log('⑥ a record takes its name after ONE sync — a failed sync is a FAILED WRITE (the old record stands); only a sync the file system does not do is said and lands; a buffer\'s timer asks none');
{
  const FCm = require(path.join(REPO, 'src/fd-close.js'));
  const D6 = scratchDir('fdc-synced-name');
  const errOf = (code) => Object.assign(new Error(`${code}: a stand-in`), { code });
  const fdPath = (fd) => { try { return fs.readlinkSync(`/proc/self/fd/${fd}`); } catch { return ''; } };
  // THE PLACED FAILURE: a sync answering `sync`, a temp's close answering `close` (the descriptor's path read before; the close is real),
  // a temp's write answering `write` (r4563: a full local disk is refused at the write itself)
  const placed6 = (fn, { sync = null, close = null, write = null } = {}) => {
    const fsy = fs.fsyncSync, cls = fs.closeSync, wrs = fs.writeSync, asked = [];
    fs.fsyncSync = function (fd) { asked.push(path.basename(fdPath(fd))); if (sync) throw errOf(sync); return fsy.call(this, fd); };
    if (close) fs.closeSync = function (fd, ...a) { const p = fdPath(fd); cls.call(this, fd, ...a); if (p.endsWith('.tmp')) throw errOf(close); };
    if (write) fs.writeSync = function (fd, ...a) { if (fdPath(fd).endsWith('.tmp')) throw errOf(write); return wrs.call(this, fd, ...a); };
    try { let r, threw = null; try { r = fn(); } catch (e) { threw = (e && e.code) || String(e); } return { r, threw, asked }; } finally { fs.fsyncSync = fsy; fs.closeSync = cls; fs.writeSync = wrs; }
  };
  const OLD = 'the good older record';
  const fresh = (dir, n) => { const f = path.join(dir, n); fs.writeFileSync(f, OLD); return f; };
  // (a) THE HELPER: the write error's class and an unknown code, each over a good record — thrown with its code, the temp removed, the
  // OLD record byte for byte, nothing said
  const wrong = {};
  for (const code of ['EIO', 'ENOSPC', 'EDQUOT', 'EROFS', 'EXYZ']) {
    const f = fresh(D6, `w-${code}.json`), s = [];
    const r = placed6(() => FCm.renameSynced(f + '.tmp', f, 'new bytes', { where: 'a stand-in record', say: (l) => s.push(l) }), { sync: code });
    wrong[code] = r.threw === code && fs.readFileSync(f, 'utf8') === OLD && !fs.existsSync(f + '.tmp') && !s.length && r.asked.length === 1 ? 'failed write' : J({ threw: r.threw, file: fs.readFileSync(f, 'utf8'), tmp: fs.existsSync(f + '.tmp'), said: s });
  }
  ok(Object.values(wrong).every((v) => v === 'failed write'), '⑥ renameSynced: a sync that FAILS (EIO, ENOSPC, EDQUOT, EROFS, an unknown code) is a FAILED WRITE — thrown with its code, the temp removed, the OLD record standing byte for byte, nothing said', wrong);
  { const f = fresh(D6, 'w-close.json'); const r = placed6(() => FCm.renameSynced(f + '.tmp', f, 'new bytes', { where: 'x' }), { close: 'EIO' });
    ok(r.threw === 'EIO' && fs.readFileSync(f, 'utf8') === OLD && !fs.existsSync(f + '.tmp'), '⑥ renameSynced: a CLOSE that fails after the write (a deferred write error) is a failed write too — thrown, the temp removed, the old record stands', { threw: r.threw }); }
  // (b) the class the file system does not do: said once (no path), the record lands
  const nos = {};
  for (const code of ['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS']) {
    const f = fresh(D6, `n-${code}.json`), s = [];
    const r = placed6(() => FCm.renameSynced(f + '.tmp', f, 'new bytes', { where: 'a stand-in record', say: (l) => s.push(l) }), { sync: code });
    nos[code] = !r.threw && fs.readFileSync(f, 'utf8') === 'new bytes' && J(s) === J([FCm.syncUnsupportedWords('a stand-in record', code)]) ? 'said, landed' : J({ threw: r.threw, said: s });
  }
  ok(Object.values(nos).every((v) => v === 'said, landed') && J([...FCm.SYNC_UNSUPPORTED].sort()) === J(['EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP']) && FCm.syncUnsupportedWords('a stand-in record', 'EINVAL') === 'a stand-in record: its file system does not do a sync (EINVAL) — its new bytes took their name unsynced',
    '⑥ renameSynced: ONLY a sync the file system does not do at all (EINVAL, ENOTSUP, EOPNOTSUPP, ENOSYS) is SAID once (the site\'s name, the code — no path) and the record lands', nos);
  // (c) a healthy sync: asked once, nothing said, landed; a failed WRITE throws and the old record stands
  { const f = fresh(D6, 'ok.json'), s = []; const r = placed6(() => FCm.renameSynced(f + '.tmp', f, Buffer.from('xyz'), { where: 'ok', say: (l) => s.push(l) }));
    const g = fresh(D6, 'full.json'), ws0 = fs.writeSync; let threw = null; fs.writeSync = () => { throw errOf('ENOSPC'); };
    try { FCm.renameSynced(g + '.tmp', g, 'x', { where: 'full' }); } catch (e) { threw = e.code; } finally { fs.writeSync = ws0; }
    ok(!r.threw && r.asked.length === 1 && !s.length && fs.readFileSync(f, 'utf8') === 'xyz' && threw === 'ENOSPC' && fs.readFileSync(g, 'utf8') === OLD && !fs.existsSync(g + '.tmp'), '⑥ renameSynced: a healthy sync asked ONCE, nothing said, landed; a failed WRITE throws, the old record stands, the temp gone', { asked: r.asked, said: s, threw }); }
  // ONE SPELLING: each wrapper's fallback, built from its own text
  const FB6 = /const renameSynced = FC && FC\.renameSynced \? FC\.renameSynced : (\(tmp, final, bytes, \{ mode, where, say(?:, sync = true)? \} = \{\}\) => \{[^\n]*\});/;   // r4563: the sync a named choice (bf8355a8a's form had none)
  const fbOf = (text) => { const m = FB6.exec(text || ''); return m ? new Function('fs', 'closeWritten', `return ${m[1]};`)(fs, FCm.closeWritten) : null; };   // eslint-disable-line no-new-func
  const WR6 = ['data/bin/job-wrapper.js', 'data/bin/chat-wrapper.js', 'data/bin/codex-chat-wrapper.js', 'data/bin/acp-wrapper.js', 'data/bin/agy-wrapper.js'];
  const spell6 = {};
  for (const f of WR6) {
    const fb = fbOf(FILES[f]); if (!fb) { spell6[f] = 'no fallback'; continue; }
    const g = fresh(D6, `s-${path.basename(f)}.json`), n = fresh(D6, `s2-${path.basename(f)}.json`), s = [];
    const a = placed6(() => fb(g + '.tmp', g, 'new bytes', { where: 'a stand-in record', say: (l) => s.push(l) }), { sync: 'EIO' });
    const b = placed6(() => fb(n + '.tmp', n, 'new bytes', { where: 'a stand-in record', say: (l) => s.push(l) }), { sync: 'EINVAL' });
    spell6[f] = a.threw === 'EIO' && fs.readFileSync(g, 'utf8') === OLD && !fs.existsSync(g + '.tmp') && !b.threw && fs.readFileSync(n, 'utf8') === 'new bytes' && J(s) === J([FCm.syncUnsupportedWords('a stand-in record', 'EINVAL')]) ? 'same' : J({ a: a.threw, b: b.threw, said: s });
  }
  ok(Object.values(spell6).length === 5 && Object.values(spell6).every((v) => v === 'same'), '⑥ ONE SPELLING: the five wrappers\' fallbacks (job, chat, codex, acp, agy), built from their own text — a failed sync a failed write (the old record stands), a sync not done said in the helper\'s EXACT words and landed', spell6);
  // EACH RECORD, from its wrapper's own code, over a GOOD OLDER record: its sync FAILED (EIO) — the old record byte for byte, the temps gone,
  // the caller's OWN road taken (as a failed writeFileSync was at the release); a sync NOT DONE (EINVAL) — said once in that wrapper's sink,
  // landed. RED: bf8355a8a's spelling (in a copy) — the failed sync said, the temp renamed over the good record anyway
  const fnText = (text, header) => { const i = (text || '').indexOf(header); if (i < 0) return null; const eol = text.indexOf('\n', i), line = text.slice(i, eol); if ((line.match(/\{/g) || []).length === (line.match(/\}/g) || []).length) return line; const j = text.indexOf('\n}\n', i); return j > i ? text.slice(i, j + 2) : null; };
  const linesFrom = (text, head, n) => { const i = (text || '').indexOf(head); if (i < 0) return null; let j = i; for (let k = 0; k < n; k++) { j = text.indexOf('\n', j + 1); if (j < 0) return null; } return text.slice(i, j); };
  const between = (text, x, y) => { const i = (text || '').indexOf(x), j = i < 0 ? -1 : text.indexOf(y, i + x.length); return i >= 0 && j > i ? text.slice(i + x.length, j) : null; };
  const F = (...a) => new Function(...a);   // eslint-disable-line no-new-func
  const RECORDS = [
    { f: 'data/bin/job-wrapper.js', name: 'pid.json', where: "the job's pid record", road: 'threw', code: (t) => between(t, 'fs.mkdirSync(ctlDir, { recursive: true });\n', 'function writeExit(exit) {'),
      run: (code, rs, say, d) => { const lp = path.join(d, 'current.log'); try { F('fs', 'path', 'ctlDir', 'stamp', 'renameSynced', 'logPath', code)(fs, path, d, { pid: 1 }, rs, lp); } finally { try { for (const l of fs.readFileSync(lp, 'utf8').split('\n').filter(Boolean)) say(l.replace(/^\[job-wrapper\] /, '')); } catch { } } },
      tip: `renameSynced(path.join(ctlDir, 'pid.json.tmp'), path.join(ctlDir, 'pid.json'), JSON.stringify(stamp), { where: "the job's pid record", say: (l) => recordSay(l) });`,
      rel: "fs.writeFileSync(path.join(ctlDir, 'pid.json.tmp'), JSON.stringify(stamp)); fs.renameSync(path.join(ctlDir, 'pid.json.tmp'), path.join(ctlDir, 'pid.json'));" },
    { f: 'data/bin/job-wrapper.js', name: 'exit.json', where: "the job's exit record", road: 'swallowed', code: (t) => fnText(t, 'function writeExit(exit) {'),
      run: (code, rs, say, d) => F('fs', 'path', 'ctlDir', 'renameSynced', 'recordSay', `${code}\nreturn writeExit;`)(fs, path, d, rs, say)({ code: 0 }),
      tip: `renameSynced(path.join(ctlDir, 'exit.json.tmp'), path.join(ctlDir, 'exit.json'), JSON.stringify(exit), { where: "the job's exit record", say: (l) => recordSay(l) });`,
      rel: "fs.writeFileSync(path.join(ctlDir, 'exit.json.tmp'), JSON.stringify(exit)); fs.renameSync(path.join(ctlDir, 'exit.json.tmp'), path.join(ctlDir, 'exit.json'));" },
    { f: 'data/bin/job-wrapper.js', name: 'bound.json', where: "the job's bound record", road: 'swallowed', code: (t) => fnText(t, 'function writeBound() {'),
      run: (code, rs, say, d) => F('fs', 'path', 'ctlDir', 'boundRec', 'renameSynced', 'recordSay', `${code}\nreturn writeBound;`)(fs, path, d, { mb: 1 }, rs, say)(),
      tip: `renameSynced(path.join(ctlDir, 'bound.json.tmp'), path.join(ctlDir, 'bound.json'), JSON.stringify(boundRec), { where: "the job's bound record", say: (l) => recordSay(l) });`,
      rel: "fs.writeFileSync(path.join(ctlDir, 'bound.json.tmp'), JSON.stringify(boundRec)); fs.renameSync(path.join(ctlDir, 'bound.json.tmp'), path.join(ctlDir, 'bound.json'));" },
    { f: 'data/bin/chat-wrapper.js', name: 'meta.json', where: 'the session meta sidecar', road: 'returned its error', code: (t) => fnText(t, 'function persistMeta() {'),
      run: (code, rs, say, d) => F('fs', 'path', 'metaFile', 'meta', 'renameSynced', 'log', `let metaTimer = null;\n${code}\nreturn persistMeta;`)(fs, path, path.join(d, 'meta.json'), { a: 1 }, rs, say)(),
      tip: "renameSynced(tmp, metaFile, JSON.stringify(meta), { where: 'the session meta sidecar', say: log });", rel: 'fs.writeFileSync(tmp, JSON.stringify(meta)); fs.renameSync(tmp, metaFile);' },
    { f: 'data/bin/chat-wrapper.js', name: 'handed.json', where: 'the handed records', road: 'returned false, said', code: (t) => linesFrom(t, '  const tmp = `${file}.${process.pid}.tmp`;', 3),
      run: (code, rs, say, d) => F('fs', 'path', 'file', 'text', 'renameSynced', 'log', 'sayOnce', `${code}\nreturn true;`)(fs, path, path.join(d, 'handed.json'), '{"v":1}', rs, say, (k, l) => say(l)),
      tip: "renameSynced(tmp, file, text, { mode: 0o600, where: 'the handed records', say: log });", rel: 'fs.writeFileSync(tmp, text, { mode: 0o600 }); fs.renameSync(tmp, file);' },
    ...['codex-chat', 'acp', 'agy'].map((w) => ({ f: `data/bin/${w}-wrapper.js`, name: 'meta.json', where: 'the session meta sidecar', road: 'swallowed', code: (t) => fnText(t, 'function persistMeta() {'),
      run: (code, rs, say, d) => F('fs', 'path', 'metaFile', 'meta', 'renameSynced', 'log', `let metaTimer = null;\n${code}\nreturn persistMeta;`)(fs, path, path.join(d, 'meta.json'), { a: 1 }, rs, say)(),
      tip: "renameSynced(tmp, metaFile, JSON.stringify(meta), { where: 'the session meta sidecar', say: log });", rel: 'fs.writeFileSync(tmp, JSON.stringify(meta)); fs.renameSync(tmp, metaFile);' })),
  ];
  // bf8355a8a's spelling, the RED's copy (its words: a failed sync said, the temp renamed anyway)
  const LINED_FB = "const renameSynced = FC && FC.renameSynced ? FC.renameSynced : (tmp, final, bytes, { mode, where, say } = {}) => { const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes)); let fd = fs.openSync(tmp, 'w', mode === undefined ? 0o666 : mode); try { for (let o = 0; o < b.length;) { const n = fs.writeSync(fd, b, o, b.length - o); if (!(n > 0)) throw Object.assign(new Error('a short write'), { code: 'ESHORT' }); o += n; } try { fs.fsyncSync(fd); } catch (e) { try { if (typeof say === 'function') say(`${where}: its new bytes could not be synced before it took its name (${(e && e.code) || 'error'}) \u2014 after a power cut it may read empty`); } catch { } } } finally { fd = closeWritten(fd, where, say); } fs.renameSync(tmp, final); };   // B-bcb8 unit B: src/fd-close.js renameSynced, the same words inline (test-fd-close-census \u2465)";
  const linedFb = fbOf(LINED_FB);
  const roadOf = (r, said) => (r.threw ? 'threw' : r.r instanceof Error ? 'returned its error' : r.r === false && said.length ? 'returned false, said' : said.length ? 'said' : 'swallowed');
  const rec6 = {}, nos6 = {}, red6 = {}, rel6 = {}, wc6 = {};
  let k6 = 0;
  for (const R of RECORDS) {
    const key = `${path.basename(R.f)} ${R.name}`, t = FILES[R.f] || '', fb = fbOf(t), code = R.code(t);
    if (!fb || !code || !code.includes(R.tip) || !linedFb) { rec6[key] = nos6[key] = red6[key] = rel6[key] = wc6[key] = 'its code, its anchor or the lined copy is gone'; continue; }
    const scene = (rs, sync, more = {}) => { const d = scratchDir(`fdc-rec-${++k6}`), s = []; const final = fresh(d, R.name); const r = placed6(() => R.run(code, rs, (l) => s.push(l), d), { sync, ...more }); return { r, said: s, old: fs.readFileSync(final, 'utf8') === OLD, tmps: fs.readdirSync(d).filter((x) => x.endsWith('.tmp')) }; };
    const w = scene(fb, 'EIO'), n = scene(fb, 'EINVAL'), x = scene(linedFb, 'EIO'), h = scene(FCm.renameSynced, 'EIO'), hn = scene(FCm.renameSynced, 'EINVAL');   // fb: a scratch copy's road; FCm: the installed road (src/ beside it)
    const v = (() => { const d = scratchDir(`fdc-rec-${++k6}`), s = []; fresh(d, R.name); const r = placed6(() => R.run(code.split(R.tip).join(R.rel), fb, (l) => s.push(l), d), { sync: 'EIO' }); return { asked: r.asked, old: fs.readFileSync(path.join(d, R.name), 'utf8') === OLD }; })();
    const mine = (r) => r.asked.length === 1 && r.asked[0].startsWith(R.name) && r.asked[0].endsWith('.tmp');
    const stands = (s) => mine(s.r) && s.old && !s.tmps.length && roadOf(s.r, s.said) === R.road;
    const landed = (s) => mine(s.r) && !s.old && !s.r.threw && s.said.filter((l) => l === FCm.syncUnsupportedWords(R.where, 'EINVAL')).length === 1;
    rec6[key] = stands(w) && stands(h) ? `old stands, ${R.road}` : J({ fallback: { asked: w.r.asked, old: w.old, tmps: w.tmps, road: roadOf(w.r, w.said), said: w.said }, helper: { asked: h.r.asked, old: h.old, tmps: h.tmps, road: roadOf(h.r, h.said), said: h.said } });
    nos6[key] = landed(n) && landed(hn) ? 'said, landed' : J({ fallback: { asked: n.r.asked, old: n.old, threw: n.r.threw, said: n.said }, helper: { asked: hn.r.asked, old: hn.old, threw: hn.r.threw, said: hn.said } });
    rel6[key] = !v.asked.length && !v.old ? 'no sync asked' : J(v);
    // r4594 (2): a refusal placed at the WRITE (ENOSPC) and at the CLOSE (EIO) for this record too, through the helper and the fallback
    const wc = [fb, FCm.renameSynced].flatMap((rs) => [scene(rs, null, { write: 'ENOSPC' }), scene(rs, null, { close: 'EIO' })]);
    wc6[key] = wc.every((s) => s.old && !s.tmps.length && roadOf(s.r, s.said) === R.road) ? `old stands, ${R.road}` : J(wc.map((s) => ({ old: s.old, tmps: s.tmps, road: roadOf(s.r, s.said), said: s.said })));
    red6[key] = !x.old ? 'the good record replaced' : J({ old: x.old, threw: x.r.threw });
  }
  ok(Object.keys(rec6).length === 8 && Object.values(rec6).every((v) => /^old stands, /.test(v)), '⑥ EACH RECORD, from its wrapper\'s own code over a GOOD older record: by the helper AND by its fallback: ONE sync asked, of its own temp; FAILED (EIO, placed) — the old record stands byte for byte, the temps gone, the caller\'s own road taken (the job\'s pid throws at its start, its exit and bound swallowed as at the release; chat\'s meta returns its error, its handed records return false and say it; codex\'s, acp\'s and agy\'s swallowed) — the EIGHT durable records (r4563)', rec6);
  ok(Object.keys(nos6).length === 8 && Object.values(nos6).every((v) => v === 'said, landed'), '⑥ EACH RECORD: a sync the file system does not do (EINVAL, placed) — said once in that wrapper\'s own sink, the record LANDED', nos6);
  ok(Object.keys(red6).length === 8 && Object.values(red6).every((v) => v === 'the good record replaced'), 'RED (bf8355a8a\'s spelling, in a copy): the failed sync said, the temp renamed OVER the good record — for every record', red6);
  ok(Object.keys(rel6).length === 8 && Object.values(rel6).every((v) => v === 'no sync asked'), 'RED (the release\'s form of each record, in a copy): no sync asked at all — the record took its name over the good one unsynced', rel6);
  ok(Object.keys(wc6).length === 8 && Object.values(wc6).every((v) => /^old stands, /.test(v)), '⑥ EACH OF THE EIGHT RECORDS (r4594): a refusal placed at the WRITE (ENOSPC) and at the CLOSE (EIO), through the helper and the fallback — the old record byte for byte, the temps gone, the caller\'s own road', wc6);
  // r4594 (3): THE FIVE FALLBACKS ARE ONE LINE, letter for letter (a CONTROL in memory: one letter changed in one of them is red)
  const fbLines = WR6.map((f) => ((FILES[f] || '').split('\n').find((l) => l.startsWith('const renameSynced = FC && FC.renameSynced ? FC.renameSynced : ')) || ''));
  const same5 = (ls) => ls.length === 5 && ls.every((l) => l && l === ls[0]);
  const alt5 = fbLines.map((l, i) => (i === 2 ? l.replace("code: 'ESHORT'", "code: 'ESHORT2'") : l));
  ok(same5(fbLines) && alt5[2] !== fbLines[2] && !same5(alt5), '⑥ THE FIVE FALLBACKS (job, chat, codex, acp, agy) are one line, letter for letter; CONTROL: one letter changed in one of them (in memory) is red', fbLines.map((l) => l.length));
  // THE TWO BUFFERS (主开发 r4563 + r4578 — A BUFFER IS NOT A DURABLE RECORD): the buffer file asks NO sync on ANY road — the timer's
  // (every 1–2 s, 250 ms while a person follows), the exit flushes, and the durable road's (chat's persistNow: the queue's records, a
  // turn's state, the journal's rewrite; codex's journal rewrite — the next timer write renames an unsynced ring over it within 2 s).
  // EVERY road's write and close are JUDGED: on a network folder a write error held back by the client comes out at the close, on a local
  // disk a full disk is refused at the write — the road by which a full disk never replaces a good buffer with an empty one. The durable
  // road keeps its ORDER: written, closed and renamed BEFORE the line is said. Through the helper AND the fallback, from each wrapper's own
  // code. RED: 1ce0eb76e's form (in a copy: its call names no choice — the helper's default, one sync a write)
  const BUFFERS = [
    { f: 'data/bin/chat-wrapper.js', name: 'chat.buf', where: 'the chat buffer', road: 'said' },
    { f: 'data/bin/codex-chat-wrapper.js', name: 'codex.buf', where: 'the codex buffer', road: 'swallowed' },
  ];
  const CHOICE = ', sync: false }';
  const bufRun = (code, rs, say, d, name) => F('fs', 'path', 'bufferFile', 'buffer', 'JOURNAL', 'renameSynced', 'log', `let writeTimer = null;\n${code}\nreturn persistBuffer;`)(fs, path, path.join(d, name), 'history', null, rs, say)();
  const cnt6 = {}, red16 = {}, ref6 = {}, wire6 = {};
  for (const B of BUFFERS) {
    const key = path.basename(B.f), t = FILES[B.f] || '', fb = fbOf(t), code = fnText(t, 'function persistBuffer() {');
    const lined = code ? code.split(CHOICE).join(' }') : null;   // 1ce0eb76e's call, in a copy: no choice named
    if (!fb || !code || !code.includes(`{ where: '${B.where}', say: log${CHOICE}`) || lined === code) { cnt6[key] = red16[key] = ref6[key] = wire6[key] = 'its code or its anchor is gone'; continue; }
    const scene = (rs, src, placed) => { const d = scratchDir(`fdc-buf-${++k6}`), s = []; const final = fresh(d, B.name); const r = placed6(() => bufRun(src, rs, (l) => s.push(l), d, B.name), placed); return { r, said: s, now: fs.readFileSync(final, 'utf8'), tmps: fs.readdirSync(d).filter((x) => x.endsWith('.tmp')) }; };
    const both = (fn) => [fb, FCm.renameSynced].map(fn);   // fb: a scratch copy's road; FCm: the installed road
    const tm = both((rs) => scene(rs, code, {}));   // the ONE writer every road calls: the timer, an exit's flush, the durable road
    cnt6[key] = tm.every((s) => !s.r.asked.length && !s.r.threw && s.now === 'history' && !s.tmps.length && !s.said.length) ? 'no sync asked, landed' : J(tm.map((s) => ({ asked: s.r.asked, threw: s.r.threw, now: s.now, tmps: s.tmps, said: s.said })));
    const rd = both((rs) => scene(rs, lined, {}));
    red16[key] = rd.every((s) => s.r.asked.length === 1 && s.r.asked[0].startsWith(B.name) && s.now === 'history') ? 'one sync a write' : J(rd.map((s) => ({ asked: s.r.asked, now: s.now })));
    const rf = [...both((rs) => scene(rs, code, { write: 'ENOSPC' })), ...both((rs) => scene(rs, code, { close: 'EIO' }))];
    ref6[key] = rf.every((s) => s.now === OLD && !s.tmps.length && !s.r.asked.length && roadOf(s.r, s.said) === B.road) ? `old stands, ${B.road}` : J(rf.map((s) => ({ now: s.now, tmps: s.tmps, asked: s.r.asked, road: roadOf(s.r, s.said), said: s.said })));
    // the wiring: no road names a sync — every call of the writer is bare (the timer, the exits, chat's persistNow, codex's journal rewrite)
    const calls = (t.match(/persistBuffer\([^)]*\)/g) || []);
    wire6[key] = calls.length >= 3 && calls.every((c) => c === 'persistBuffer()') && (t.match(/renameSynced\(tmp, bufferFile, /g) || []).length === 1 ? 'no road asks a sync' : J({ calls });
  }
  ok(Object.keys(cnt6).length === 2 && Object.values(cnt6).every((v) => v === 'no sync asked, landed'), '⑥ THE TWO BUFFERS (r4563 + r4578): the buffer\'s writer asks NO sync — the chat and the codex buffer, through the helper AND the fallback, landed', cnt6);
  ok(Object.keys(red16).length === 2 && Object.values(red16).every((v) => v === 'one sync a write'), 'RED (1ce0eb76e\'s call, in a copy: no choice named): ONE sync asked at every buffer write', red16);
  ok(Object.keys(ref6).length === 2 && Object.values(ref6).every((v) => /^old stands, /.test(v)), '⑥ THE TWO BUFFERS: a PLACED refusal at the write (ENOSPC — a full local disk) and at the close (EIO — a write error a network client held back): the OLD buffer byte for byte, the temp gone, no sync asked, the caller\'s own road (chat says it once in its own log, codex swallows) — a full disk never replaces a good buffer with an empty one', ref6);
  ok(Object.keys(wire6).length === 2 && Object.values(wire6).every((v) => v === 'no road asks a sync'), '⑥ THE TWO BUFFERS\' WIRING (r4578): every call of the writer is bare — the timer\'s, the exits\', chat\'s persistNow and codex\'s journal rewrite — none names a sync', wire6);
  // THE DURABLE ROAD'S ORDER (r4578), from the chat wrapper's own record / durable / persistNow / persistBuffer / say / batch code: a
  // durable line (queue_changed) is in the file — written, closed, renamed, NO sync asked — BEFORE it is said, alone and inside an input's
  // batch. A placed refusal at the write: the old buffer stands, the temp gone, the failure in the wrapper's own log BEFORE the saying —
  // and the line is then said, as at the release (persistBuffer swallows; record says)
  {
    const t = FILES['data/bin/chat-wrapper.js'] || '';
    const parts = [t.split('\n').find((l) => l.startsWith('const DURABLE_RECORDS = new Set([')), fnText(t, 'function persistBuffer() {'), fnText(t, 'function persistNow() {'),
      t.split('\n').find((l) => l.startsWith('let batchDepth = 0, batchOut = [], durableDue = false;')), fnText(t, 'function say(line) {'), fnText(t, 'function beginBatch() {'),
      fnText(t, 'function endBatch() {'), fnText(t, 'function durable() {'), fnText(t, 'function record(type, fields = {}) {')];
    let ord = 'its code or its anchor is gone';
    if (parts.every(Boolean) && fbOf(t)) {
      const run = (rs, placed, batched) => {
        const d = scratchDir(`fdc-ord-${++k6}`), ev = [], bf = path.join(d, 'chat.buf'); fs.writeFileSync(bf, OLD);
        const proc = { pid: process.pid, stdout: { write: (s) => { ev.push({ said: s.trim(), onDisk: fs.readFileSync(bf, 'utf8') }); return true; } } };
        const r = placed6(() => { const api = F('fs', 'path', 'process', 'bufferFile', 'JOURNAL', 'renameSynced', 'log', 'schedulePersist', 'trimBuffer', 'noteHandWord',
          `let buffer = 'history\\n'; let writeTimer = null;\n${parts.join('\n')}\nreturn { record, beginBatch, endBatch };`)(fs, path, proc, bf, null, rs, (l) => ev.push({ log: l }), () => { }, () => { }, () => { });
          if (batched) { api.beginBatch(); api.record('queue_changed', { items: [] }); api.endBatch(); } else api.record('queue_changed', { items: [] }); }, placed);
        return { r, ev, tmps: fs.readdirSync(d).filter((x) => x.endsWith('.tmp')), now: fs.readFileSync(bf, 'utf8') };
      };
      const L = J({ type: 'queue_changed', items: [] });
      const ok1 = (s) => !s.r.threw && !s.r.asked.length && s.ev.length === 1 && s.ev[0].said === L && s.ev[0].onDisk === `history\n${L}\n` && !s.tmps.length;
      const ok2 = (s) => !s.r.threw && !s.r.asked.length && s.now === OLD && !s.tmps.length && s.ev.length === 2 && /^history buffer write failed: /.test(s.ev[0].log || '') && s.ev[1].said === L && s.ev[1].onDisk === OLD;
      const sc = [fbOf(t), FCm.renameSynced].flatMap((rs) => [false, true].flatMap((b) => [['healthy', run(rs, {}, b)], ['refused', run(rs, { write: 'ENOSPC' }, b)]]));
      ord = sc.every(([k, s]) => (k === 'healthy' ? ok1(s) : ok2(s))) ? 'renamed before said, no sync' : J(sc.map(([k, s]) => ({ k, asked: s.r.asked, threw: s.r.threw, ev: s.ev, tmps: s.tmps })));
    }
    ok(ord === 'renamed before said, no sync', '⑥ THE DURABLE ROAD\'S ORDER (r4578, chat\'s own record / durable / persistNow / say code, alone and in an input\'s batch, helper and fallback): the line is in the file — written, closed, renamed, NO sync asked — BEFORE it is said; a placed refusal at the write: the old buffer stands, the temp gone, the failure in the wrapper\'s own log BEFORE the saying (then the line said, as at the release)', ord);
  }
}

report();
