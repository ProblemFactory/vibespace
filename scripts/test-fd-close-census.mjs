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
//   empty-catch   a close under an empty catch: TODAY'S 97 (98 with the held module's) are held as a NAMED ratchet by file (EMPTY_CATCH_DEBT — r621's list, by file,
//                 line and function, sent to the coordinator); a new one is red by
//                 its file, line and function; a file's count that falls is said (lower the row)
// HELD: src/usage-ledger-dedup.js is lane lg-leak-census's (its unit A): its findings are PRINTED, never judged here.
// Each rule has a PLANT red by name; the law's own forms (forget at the close, exclusive branches, a handle closed twice, a closer
// that forgets) are planted GREEN. Fast: in-process, about 1.6 s (174 of 1245 files name an open or a close and are parsed).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { gitEnvFrom } from './git-env.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();

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
    for (const c of closes) { if (c.kind === 'handle' && !handleKeys.has(c.key)) continue; for (let n = c.node._p; n && !isFn(n); n = n._p) { if (n.type === 'TryStatement' && contains(n.block, c.node)) { if (n.handler && n.handler.body.body.length === 0) { { const bd = binds.find((x) => x.key === c.key && (x.member || c.decl === x.decl)); const oc = bd ? unwrap(bd.node.init || bd.node.right || bd.node) : null; const fl = oc && oc.arguments && oc.arguments[1]; const flags = !bd ? 'unknown (no open here)' : fl && fl.type === 'Literal' ? String(fl.value) : fl ? text(fl).slice(0, 40) : 'r (default)'; const w = !bd ? '?' : (fl && fl.type === 'Literal' ? /[wa+]/.test(String(fl.value)) : /O_WRONLY|O_RDWR|O_CREAT|O_APPEND|O_TRUNC/.test(fl ? text(fl) : '')) ? 'write' : 'read'; const synced = (() => { const f = fnOf(c.node); if (!f) return false; const t = text(f); const k = c.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return new RegExp(`f(data)?syncSync\\(\\s*${k}\\b|${k}\\.(sync|datasync)\\(`).test(t); })();
              findings.push({ rule: 'empty-catch', file: rel, line: lineAt(c.node.start), key: c.key, why: 'a close under an empty catch', flags, rw: w, synced, fn: (() => { const f = fnOf(c.node); if (!f) return '(top)'; if (f.id) return f.id.name; const P = f._p; if (P && (P.type === 'Property' || P.type === 'MethodDefinition') && P.key) return P.key.name || P.key.value; if (P && P.type === 'VariableDeclarator') return P.id.name; return '(anonymous)'; })() }); } stats.emptyCatch.push(`${rel}:${lineAt(c.node.start)}`); } break; } } }
    // a helper that closes every descriptor above N: closeSync(i) of the enclosing for loop's own counter
    for (const c of closes) for (let n = c.node._p; n && !isFn(n); n = n._p) if (n.type === 'ForStatement' && n.update && c.arg.type === 'Identifier' && n.update.type === 'UpdateExpression' && n.update.argument.type === 'Identifier' && n.update.argument.name === c.arg.name) findings.push({ rule: 'above-n', file: rel, line: lineAt(c.node.start), key: c.key, why: 'closes every descriptor of a counted range (numbers it never opened)' });
    // the rows: each binding with its close sites
    for (const b of binds) {
      const scope = b.member ? null : (b.cbParam ? b.fn : b.fn);
      const mine = closes.filter((c) => c.key === b.key && (b.member ? true : c.decl === b.decl));
      const row = { file: rel, line: lineAt(b.node.start), key: b.key, kind: b.kind, closes: mine.map((c) => lineAt(c.node.start)) };
      rows.push(row);
      const keep = b.kind === 'handle' || b.kind === 'handle?' ? [] : mine.filter((c) => !forgettingClose(c.node, b.key, text));
      if (b.kind === 'handle' || b.kind === 'handle?') for (const c of closes) if (c.kind === 'fd' && c.arg.type === 'MemberExpression' && propName(c.arg) === 'fd' && text(c.arg.object) === b.key) findings.push({ rule: 'handle-raw', file: rel, line: lineAt(c.node.start), key: c.key, why: 'the raw number of a FileHandle closed by hand — the handle closes it again' });
      for (let i = 0; i < keep.length; i++) for (let j = i + 1; j < keep.length; j++) { const why = bothRun(keep[i].node, keep[j].node); if (why) findings.push({ rule: 'twice', file: rel, line: lineAt(b.node.start), key: b.key, sites: [lineAt(keep[i].node.start), lineAt(keep[j].node.start)], why }); }
      // the loop: a variable declared outside a loop, opened inside it, closed in the loop's finally/catch without forgetting
      if (!b.member && b.node.type === 'AssignmentExpression') {
        let loop = null; for (let n = b.node._p; n && n !== b.fn; n = n._p) if (isLoop(n)) { loop = n; break; }
        if (loop && b.decl && typeof b.decl === 'object' && contains(loop, b.decl)) loop = null;   // declared inside the loop: fresh every turn
        if (loop) for (const c of keep) if (contains(loop, c.node)) { let inFin = false; for (let n = c.node._p; n && n !== loop; n = n._p) if (n.type === 'TryStatement' && (contains(n.finalizer || {}, c.node) || contains(n.handler || {}, c.node)) && contains(n.block, b.node)) inFin = true; if (inFin) findings.push({ rule: 'loop-left', file: rel, line: lineAt(c.node.start), key: b.key, why: 'a loop closes a number kept from its previous turn when this turn\'s open threw' }); }
      }
      for (const g of streamGiven) if (g.key === b.key && mine.length) findings.push({ rule: 'stream-too', file: rel, line: lineAt(g.node.start), key: b.key, sites: mine.map((c) => lineAt(c.node.start)), why: 'handed to a stream that closes it, and closed again' });
    }
    // a closer that keeps the number: a close of an OUTER function's descriptor inside a nested function named close/end/dispose
    for (const c of closes) { const f = c.fn; if (!f) continue; const b = binds.find((x) => x.key === c.key && !x.member && x.fn && x.fn !== f && contains(x.fn, f) && x.kind !== 'handle' && x.kind !== 'handle?'); if (!b) continue; const P = f._p; const nm = P && P.type === 'Property' && P.key ? (P.key.name || P.key.value) : P && P.type === 'MethodDefinition' ? P.key.name : f.id ? f.id.name : null; if (/^(close|end|dispose|release|done|finish)$/i.test(nm || '') && !forgettingClose(c.node, c.key, text)) findings.push({ rule: 'closer-keeps', file: rel, line: lineAt(c.node.start), key: c.key, why: `a ${nm}() that closes an outer descriptor and keeps the number (a second call closes it again)` }); }
  }
  return { rows, findings, stats };
}

const HELD = Object.freeze({ 'src/usage-ledger-dedup.js': 'lane lg-leak-census cures it (its unit A, b69a526a1): printed here, never judged' });
// TODAY'S closes under an empty catch, by file (r621's list) — the sweep that says a failed close is its own unit; a NEW one is red
const EMPTY_CATCH_DEBT = Object.freeze({
  "data/bin/agy-wrapper.js": 1,
  "data/bin/chat-wrapper.js": 1,
  "data/bin/codex-chat-wrapper.js": 1,
  "data/bin/job-wrapper.js": 2,
  "data/bin/pty-wrapper.js": 1,
  "data/bin/vibespace-channels": 2,
  "data/bin/vibespace-claude-subscription-login.mjs": 1,
  "data/bin/vibespace-remote-keeper": 1,
  "data/bin/vibespace-usage-scan": 2,
  "src/account-material.js": 3,
  "src/adapters/codex.js": 2,
  "src/agentd/agentd.js": 5,   // (the fifth landed on the .414 train before this census: B-147f's start-that-never-happened, open(), its three pipe descriptors handed to the child — held as ruled)
  "src/agentd/attach-roads.js": 1,
  "src/agy-store-fs.js": 3,
  "src/app-secrets-seal.js": 1,
  "src/channel-store.js": 6,
  "src/claude-oat-probe.js": 1,
  "src/cli-identity.js": 1,
  "src/codex-fork-ledger-purge.js": 1,
  "src/desktop-serve.js": 3,
  "src/device-audit.js": 1,
  "src/exit-proxy.js": 2,
  "src/harnesses/claude-home.js": 1,
  "src/hosts.js": 3,
  "src/jobs.js": 1,
  "src/machine-probes.js": 1,
  "src/managed-claude-settings.js": 1,
  "src/plugins/frp.js": 3,
  "src/plugins/tailscale.js": 1,
  "src/routes/chat-attachments.js": 1,
  "src/run-reads.js": 1,
  "src/safe-fs-worker.js": 2,
  "src/secret-box.js": 1,
  "src/secret-file.js": 2,
  "src/server/auto-resume-workflow.js": 2,
  "src/server/browser-attach-launch.js": 2,
  "src/server/browser-cli-install.js": 2,
  "src/server/browser-installs.js": 2,
  "src/server/channel-api.js": 1,
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
  "src/usage-estimator.js": 2,
  "src/usage-history.js": 1,
  "src/usage-origin-backfill.js": 1,
  "src/usage-routes.js": 1,
  "src/usage-walker.js": 2,
  "src/weekly-lanes-unfold.js": 1,
  "src/workflow-usage-tailer.js": 1,
  "src/ws-create.js": 1
});
const STRUCTURAL = ['twice', 'stream-too', 'handle-raw', 'loop-left', 'above-n', 'closer-keeps'];
/** the census's verdict over a set of files: the structural findings outside HELD, the ratchet's new closes under an empty catch */
function verdict(files) {
  const r = census(files);
  const judged = r.findings.filter((f) => !HELD[f.file]);
  const structural = judged.filter((f) => STRUCTURAL.includes(f.rule));
  const per = {}; for (const f of judged.filter((x) => x.rule === 'empty-catch')) (per[f.file] = per[f.file] || []).push(f);
  const grown = [], fell = [];
  for (const [file, list] of Object.entries(per)) if (list.length > (EMPTY_CATCH_DEBT[file] || 0)) grown.push(`${file}: ${list.length} closes under an empty catch (held ${EMPTY_CATCH_DEBT[file] || 0}) — ${list.map((f) => `${f.line} ${f.fn}() ${f.key}`).join('; ')}`);
  for (const [file, n] of Object.entries(EMPTY_CATCH_DEBT)) if (files[file] !== undefined && (per[file] || []).length < n) fell.push(`${file}: ${(per[file] || []).length} of ${n}`);
  return { r, structural, grown, fell, held: r.findings.filter((f) => HELD[f.file]) };
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
if (T.fell.length) console.log(`  · the empty-catch debt FELL (lower its row): ${T.fell.join(' · ')}`);
for (const f of T.held) console.log(`  · HELD (${HELD[f.file]}): ${name(f)}`);

// ── ② THE PLANTS: each rule red by name ──
console.log('② each rule, planted, is red by name');
const P = (src) => verdict({ 'src/planted.js': "const fs = require('fs'); const fsp = require('fs/promises');\n" + src });
const plants = {
  twice: ["function a(p, b) { const fd = fs.openSync(p, 'r'); try { fs.readSync(fd, b); fs.closeSync(fd); } finally { fs.closeSync(fd); } }", /in the try's body AND in its finally/],
  'twice ': ["function a(p) { const fd = fs.openSync(p, 'r'); try { use(fd); fs.closeSync(fd); } catch (e) { fs.closeSync(fd); throw e; } }", /normal road \(try\) AND on the error road/],
  'twice  ': ["function a(p) { const fd = fs.openSync(p, 'r'); fs.closeSync(fd); log(); fs.closeSync(fd); }", /two closes in sequence/],
  'stream-too': ["function a(p) { const fd = fs.openSync(p, 'r'); const s = fs.createReadStream(null, { fd }); s.pipe(out); fs.closeSync(fd); }", /handed to a stream/],
  'handle-raw': ["async function a(p) { const h = await fsp.open(p, 'r'); fs.closeSync(h.fd); await h.close(); }", /raw number of a FileHandle/],
  'loop-left': ["function a(ps) { let fd; for (const p of ps) { try { fd = fs.openSync(p, 'r'); use(fd); } finally { fs.closeSync(fd); } } }", /previous turn/],
  'above-n': ["function a() { for (let i = 3; i < 1024; i++) { try { fs.closeSync(i); } catch (e) { log(e); } } }", /counted range/],
  'closer-keeps': ["function writerOf(p) { const fd = fs.openSync(p, 'w'); return { write(b) { fs.writeSync(fd, b); }, close() { fs.closeSync(fd); } }; }", /close\(\) that closes an outer descriptor and keeps the number/],
};
for (const [rule, [src, re]] of Object.entries(plants)) {
  const v = P(src); const hit = v.structural.filter((f) => f.rule === rule.trim() && re.test(f.why));
  ok(v.r.stats.failed.length === 0 && hit.length >= 1, `PLANT ${rule.trim()}: «${src.slice(0, 96)}…» is RED by name`, v.structural.map(name));
}
{ const v = P("function a(p) { const fd = fs.openSync(p, 'r'); try { use(fd); } finally { try { fs.closeSync(fd); } catch { } } }");
  ok(v.r.stats.failed.length === 0 && v.grown.length === 1 && /src\/planted\.js: 1 closes under an empty catch \(held 0\) — \d+ a\(\) fd/.test(v.grown[0]), 'PLANT empty-catch: a NEW close under an empty catch is RED by its file, line, function and number', v.grown); }

// ── ③ THE LAW'S OWN FORMS: green ──
console.log('③ the law\'s own forms are never a finding');
const greens = {
  'the close forgets the number in its own statement, the finally closes only what is left': "function a(p) { let fd = fs.openSync(p, 'r'); try { use(fd); fs.closeSync(fd); fd = null; } finally { if (fd !== null) fs.closeSync(fd); } }",
  'two closes on exclusive roads (one returns first)': "function a(p, x) { const fd = fs.openSync(p, 'r'); if (x) { fs.closeSync(fd); return 1; } fs.closeSync(fd); return 2; }",
  'if / else closes': "function a(p, x) { const fd = fs.openSync(p, 'r'); if (x) fs.closeSync(fd); else { use(fd); fs.closeSync(fd); } }",
  'a FileHandle closed on two roads (the handle forgets its number)': "async function a(p) { const h = await fsp.open(p, 'r'); try { await h.read(); } catch (e) { await h.close(); throw e; } await h.close(); }",
  'a closer that forgets its number': "function writerOf(p) { let fd = fs.openSync(p, 'w'); return { close() { if (fd === null) return; fs.closeSync(fd); fd = null; } }; }",
  'a loop whose variable is fresh each turn': "function a(ps) { for (const p of ps) { let fd = null; try { fd = fs.openSync(p, 'r'); use(fd); } finally { if (fd !== null) fs.closeSync(fd); } } }",
  'a descriptor handed to a child at spawn, then closed once (the child holds its own copy)': "function a(p) { const fd = fs.openSync(p, 'a'); const c = spawn('x', [], { stdio: ['ignore', fd, fd] }); fs.closeSync(fd); return c; }",
};
for (const [what, src] of Object.entries(greens)) { const v = P(src); ok(v.r.stats.failed.length === 0 && v.r.rows.length >= 1 && v.structural.length === 0 && v.grown.length === 0, `GREEN: ${what}`, v.structural.map(name).concat(v.grown)); }

// ── ④ THE PLACED FAULT, read by the census's own rule ──
{
  const LD = FILES['src/usage-ledger-dedup.js'] || '';
  const v = census({ 'src/usage-ledger-dedup.js': LD });
  if (v.stats.failed.length) ok(false, '④ src/usage-ledger-dedup.js parses', v.stats.failed);
  const fault = v.findings.filter((f) => f.rule === 'closer-keeps' || f.rule === 'twice');
  if (fault.length) ok(fault.some((f) => f.rule === 'closer-keeps'), `④ the placed fault (src/usage-ledger-dedup.js, lane lg-leak-census's to cure) is FOUND by the census's own rule: ${fault.map(name).join(' · ')}`, fault.map(name));
  else ok(LD.length > 0, '④ src/usage-ledger-dedup.js reads CLEAN — its cure (lane lg-leak-census) has landed; the closer-keeps plant above keeps the rule red', null);
}
report();
