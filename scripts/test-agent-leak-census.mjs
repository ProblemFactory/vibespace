#!/usr/bin/env node
// THE HUB-LEVEL LEAK CENSUS (B-1fe9, lane lg-leak-census, 2026-11-17). Per-suite route censuses (test-vault-law ⑨,
// test-vault-paste ⑩c) mount ONE routes module with a hand-kept subset of the deps its wiring passes: a leaking agent
// route gated on a missing dep, a route added in a wiring file itself, or an agent route in a module no vault suite
// mounts goes unseen. This census reads the hub's routes off the REAL wiring. Fast tier: acorn over the hub tree
// (server.js + src/, src/lib/ excluded — a page module registers no route), comments never count.
//   THE BEARERS: a conversation's session token (vsst_), a Background Work job's token (jbt_) and the maintainer key
//   (vsmk_, POST /api/agent/automation/:verb — an instance's env sha). An automation key's VALUE (vsak_) is never a
//   bearer: it is a vault entry; a conversation uses a key it was granted by id, with its own vsst_. The census reads
//   the SIGNED-IN hub (a hub nobody signs in to opens every route to anyone — the `!this.enabled` door, said, not swept),
//   and src/auth.js's middleware only: the WebSocket upgrade dispatcher and the hub's side listeners (the CDP mediator,
//   the egress proxy, the metrics port) are other doors, judged by their own code.
//   ① THE DOORS: every `if (…) return next();` in src/auth.js's middleware is a door, and each one is CLASSIFIED in
//      scripts/fixtures/agent-leak-census.json: `bearer` (a bearer reaches it without a cookie — this census sweeps it)
//      or `other: <why>` (its own credential). A new door in neither, a dead row, a reason-less `other` = RED. A
//      bearer door must be a path test the census can read (`p.startsWith('<prefix>')` / `p === '<path>'`).
//   ② THE REGISTRATIONS: every `<any receiver>.<get|post|put|patch|delete|all|use>('<path>', …)` with a literal path
//      and a handler, and every `app|router.<verb>(<computed>, …)`, in the hub tree; a path that is no literal (a
//      string, a template without holes, an array of them, a same-file const) is a `dynamic` row classified
//      `other: <why>` or `bearer: <METHOD path>, …` (those join the sweep) — an unrowed one, a dead row, another
//      value = RED. A `.use(<path>, …)` under a bearer door is a BELT, each a `belts` row with its why.
//   ③ THE BEARER ROUTES: every registration under a bearer door, by file, each module LOADED by the hub (reached from
//      server.js through its requires — loaded is not mounted: that proof is the world's, ⑦); every `routes` row
//      names a route that exists, every `skip` says why.
//   ④ CONTROLS (the same census over planted copies of the tree's files or of the table, never the tree): a new door,
//      a regex bearer door, an unrowed computed path, a mis-classified dynamic row, a belt with no row, a bearer route
//      in a module nothing requires, an unparsable file, and a dead or blank row of each table kind ⇒ each RED.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { trackedFiles } from './tracked-files.mjs';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(REPO, 'package.json'));
const acorn = require('acorn');
const TABLE_REL = 'scripts/fixtures/agent-leak-census.json';
const TABLE = JSON.parse(fs.readFileSync(path.join(REPO, TABLE_REL), 'utf-8'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1600) : '')); } };
const READ = new Map();
const readRepo = (f) => { if (!READ.has(f)) READ.set(f, fs.readFileSync(path.join(REPO, f), 'utf-8')); return READ.get(f); };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);

// ── THE MODEL (pure over { files, read }) ───────────────────────────────────────────────────────────────────────────
function hubFiles() {
  return trackedFiles(REPO, 'server.js', 'src').filter((f) => /\.js$/.test(f) && !f.startsWith('src/lib/') && fs.existsSync(path.join(REPO, f)));
}
function parse(src) {
  for (const sourceType of ['script', 'module']) { try { return acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true }); } catch { } }
  return null;
}
function walk(n, fn, parent = null) {
  if (!n || typeof n.type !== 'string') return;
  fn(n, parent);
  for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach((x) => walk(x, fn, n)); else if (v && typeof v.type === 'string') walk(v, fn, n); }
}
const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
const lineAt = (src, i) => src.slice(0, i).split('\n').length;

/** src/auth.js's doors: every `if (<cond>) return next();` inside the `middleware()` method → [{ cond, line, test }]
 *  where `test` = { kind: 'prefix' | 'exact', path } when the cond is ONE path test the census can read, else null. */
function doorsOf(src) {
  const ast = parse(src);
  if (!ast) return { doors: null, why: 'src/auth.js does not parse' };
  let mw = null;
  walk(ast, (n) => { if (!mw && n.type === 'MethodDefinition' && n.key && n.key.name === 'middleware') mw = n; });
  if (!mw) return { doors: null, why: 'no middleware() method in src/auth.js' };
  const doors = [];
  const isNext = (s) => s && s.type === 'ReturnStatement' && s.argument && s.argument.type === 'CallExpression' && s.argument.callee.type === 'Identifier' && s.argument.callee.name === 'next';
  walk(mw.value.body, (n) => {
    if (n.type !== 'IfStatement') return;
    const c = n.consequent;
    if (!(isNext(c) || (c.type === 'BlockStatement' && c.body.length === 1 && isNext(c.body[0])))) return;
    const t = n.test;
    let test = null;
    if (t.type === 'CallExpression' && t.callee.type === 'MemberExpression' && !t.callee.computed && t.callee.object.type === 'Identifier' && t.callee.object.name === 'p'
      && t.callee.property.name === 'startsWith' && t.arguments.length === 1 && t.arguments[0].type === 'Literal' && typeof t.arguments[0].value === 'string') test = { kind: 'prefix', path: t.arguments[0].value };
    else if (t.type === 'BinaryExpression' && t.operator === '===' && t.left.type === 'Identifier' && t.left.name === 'p' && t.right.type === 'Literal' && typeof t.right.value === 'string') test = { kind: 'exact', path: t.right.value };
    doors.push({ cond: squash(src.slice(t.start, t.end)), line: lineAt(src, n.start), test });
  });
  return { doors };
}

const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'use']);
const RECV = /^(app|router)$/;
/** Every route registration in `files`: rows [{ file, line, verb, method, path }] (one per path), dynamic
 *  [{ key, file, line }] (`<file> <recv>.<verb>(<first arg>)` — the table's key, line-free), requires: file → Set(file). */
const PER_FILE = new Map();   // (file, its text) → what it registers and requires — a control re-walks only its planted file
function fileFacts(f, src) {
  const key = f + '\0' + src;
  if (PER_FILE.has(key)) return PER_FILE.get(key);
  const ast = parse(src);
  if (!ast) { PER_FILE.set(key, null); return null; }
  const consts = new Map(), specs = [], rows = [], dynamic = [];
  walk(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
      if (n.init.type === 'Literal' && typeof n.init.value === 'string') consts.set(n.id.name, n.init.value);
      else if (n.init.type === 'TemplateLiteral' && !n.init.expressions.length) consts.set(n.id.name, n.init.quasis[0].value.cooked);
    }
    if (n.type !== 'CallExpression') return;
    if (n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments[0] && n.arguments[0].type === 'Literal' && /^\.\.?\//.test(String(n.arguments[0].value))) { specs.push(n.arguments[0].value); return; }
    if (n.callee.type !== 'MemberExpression' || n.callee.computed || !VERBS.has(n.callee.property.name) || !n.arguments.length) return;
    rows.push(n);
  });
  const regs = [];
  for (const n of rows) {
    const a = n.arguments[0], verb = n.callee.property.name, recv = src.slice(n.callee.object.start, n.callee.object.end);
    const appLike = RECV.test(recv);
    // another receiver counts only with a literal path and a handler (`a.get('/api/tls', h)` — tls.js's registerRoutes(a))
    const literalPath = (a.type === 'Literal' && typeof a.value === 'string' && a.value.startsWith('/')) || (a.type === 'TemplateLiteral' && !a.expressions.length && a.quasis[0].value.cooked.startsWith('/'));
    if (!appLike && !(literalPath && n.arguments.length >= 2)) continue;
    let paths = null;
    if (a.type === 'Literal' && typeof a.value === 'string') paths = [a.value];
    else if (a.type === 'TemplateLiteral' && !a.expressions.length) paths = [a.quasis[0].value.cooked];
    else if (a.type === 'ArrayExpression' && a.elements.length && a.elements.every((e) => e && e.type === 'Literal' && typeof e.value === 'string')) paths = a.elements.map((e) => e.value);
    else if (a.type === 'Identifier' && consts.has(a.name)) paths = [consts.get(a.name)];
    const line = lineAt(src, n.start);
    if (!paths) {
      // app.use(fn) / app.use(express.json()) / app.use(router): ONE argument, or a first argument that is a call or a
      // function, is a middleware with no path; a `.use(<name>, …)` may be a computed prefix — it is a dynamic row
      if (verb === 'use' && (n.arguments.length === 1 || /^(CallExpression|ArrowFunctionExpression|FunctionExpression)$/.test(a.type))) continue;
      dynamic.push({ key: `${f} ${recv}.${verb}(${squash(src.slice(a.start, a.end)).slice(0, 80)})`, file: f, line });
      continue;
    }
    for (const p of paths) regs.push({ file: f, line, verb, method: verb === 'use' ? 'USE' : verb.toUpperCase(), path: p });
  }
  const out = { specs, rows: regs, dynamic };
  PER_FILE.set(key, out);
  return out;
}
/** Every route registration in `files`: rows [{ file, line, verb, method, path }] (one per path), dynamic
 *  [{ key, file, line }] (`<file> <recv>.<verb>(<first arg>)` — the table's key, line-free), requires: file → Set(file). */
function registrationsOf(files, read) {
  const rows = [], dynamic = [], requires = new Map(), unparsed = [];
  const known = new Set(files);
  for (const f of files) {
    const x = fileFacts(f, read(f));
    if (!x) { unparsed.push(f); continue; }
    rows.push(...x.rows); dynamic.push(...x.dynamic);
    const edges = new Set();
    for (const sp of x.specs) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(f), sp));
      const t = [base, base + '.js', base + '/index.js'].find((c) => known.has(c));
      if (t) edges.add(t);
    }
    requires.set(f, edges);
  }
  return { rows, dynamic, requires, unparsed };
}
const underDoor = (p, t) => (t.kind === 'prefix' ? p.startsWith(t.path) : p === t.path);
function reachFrom(requires, root) {
  const seen = new Set([root]), q = [root];
  while (q.length) { const f = q.shift(); for (const t of requires.get(f) || []) if (!seen.has(t)) { seen.add(t); q.push(t); } }
  return seen;
}

/** THE CENSUS of a tree ({ files, read }) against a table → every verdict ①–③ reads. */
function census({ files, read, table }) {
  const out = { doors: [], doorUnclassified: [], doorDead: [], doorReasonless: [], bearerUnreadable: [], bearerDoors: [] };
  const D = doorsOf(read('src/auth.js'));
  out.doorsWhy = D.why || null;
  const doorRows = table.doors || {};
  if (D.doors) {
    out.doors = D.doors;
    const conds = new Set(D.doors.map((d) => d.cond));
    for (const d of D.doors) {
      if (!has(doorRows, d.cond)) { out.doorUnclassified.push(`src/auth.js:${d.line} if (${d.cond}) return next();`); continue; }
      const v = String(doorRows[d.cond] || '');
      if (v === 'bearer') { if (d.test) out.bearerDoors.push(d); else out.bearerUnreadable.push(`src/auth.js:${d.line} ${d.cond}`); }
      else if (!/^other: \S/.test(v)) out.doorReasonless.push(d.cond);
    }
    out.doorDead = Object.keys(doorRows).filter((c) => !conds.has(c));
  }
  const R = registrationsOf(files, read);
  out.unparsed = R.unparsed;
  out.rows = R.rows;
  const dynRows = table.dynamic || {};
  const dynKeys = new Set(R.dynamic.map((d) => d.key));
  out.dynamicUnrowed = R.dynamic.filter((d) => !has(dynRows, d.key)).map((d) => `${d.key} (line ${d.line})`);
  out.dynamicDead = Object.keys(dynRows).filter((k) => !dynKeys.has(k));
  const DYN_BEARER = /^bearer: ((?:GET|POST|PUT|PATCH|DELETE|ALL|USE) \/\S+)(?:, (?:GET|POST|PUT|PATCH|DELETE|ALL|USE) \/\S+)*$/;
  out.dynamicReasonless = Object.entries(dynRows).filter(([, v]) => !(/^other: \S/.test(String(v || '')) || DYN_BEARER.test(String(v || '')))).map(([k]) => k);
  out.dynamic = R.dynamic;
  const named = [];   // a dynamic row classified bearer: its routes join the sweep, at the registration's own place
  for (const d of R.dynamic) { const v = String(dynRows[d.key] || ''); if (!v.startsWith('bearer: ')) continue; for (const mp of v.slice(8).split(', ')) { const [method, p] = mp.split(' '); named.push({ file: d.file, line: d.line, verb: method === 'USE' ? 'use' : method.toLowerCase(), method, path: p, dynamic: true }); } }
  out.bearer = [...R.rows, ...named].filter((r) => r.dynamic || out.bearerDoors.some((d) => underDoor(r.path, d.test)));
  out.routes = out.bearer.filter((r) => r.verb !== 'use');
  out.belts = out.bearer.filter((r) => r.verb === 'use');
  const beltRows = table.belts || {};
  const beltKey = (r) => `${r.path} ${r.file}`;
  out.beltUnrowed = out.belts.filter((r) => !has(beltRows, beltKey(r))).map((r) => `${beltKey(r)} (line ${r.line})`);
  out.beltDead = Object.keys(beltRows).filter((k) => !out.belts.some((r) => beltKey(r) === k));
  out.beltReasonless = Object.entries(beltRows).filter(([, why]) => String(why || '').trim().length < 10).map(([k]) => k);
  const reach = reachFrom(R.requires, 'server.js');
  out.unreached = [...new Set(out.bearer.map((r) => r.file))].filter((f) => !reach.has(f));
  const keys = new Set(out.routes.map((r) => `${r.method} ${r.path}`));
  const routeRows = table.routes || {};
  out.routeDead = Object.keys(routeRows).filter((k) => !keys.has(k));
  out.routeReasonless = Object.entries(routeRows).filter(([, r]) => has(r, 'skip') && !String(r.skip || '').trim()).map(([k]) => k);
  const seen = new Map();
  for (const r of out.routes) { const k = `${r.method} ${r.path}`; seen.set(k, [...(seen.get(k) || []), `${r.file}:${r.line}`]); }
  out.twice = [...seen].filter(([, at]) => at.length > 1).map(([k, at]) => `${k} (${at.join(', ')})`);
  return out;
}

// ── ①–③ THE TREE ────────────────────────────────────────────────────────────────────────────────────────────────────
const FILES = hubFiles();
const C = census({ files: FILES, read: readRepo, table: TABLE });

console.log('① the doors (src/auth.js\'s middleware — every `if (…) return next();`)');
ok(!C.doorsWhy && C.doors.length >= 10, `the middleware's doors are read (${C.doors.length})`, C.doorsWhy);
ok(!C.doorUnclassified.length, 'every door is classified in the table (`bearer` or `other: <why>`)', C.doorUnclassified.length ? 'NEW — add each to ' + TABLE_REL + ' doors: ' + C.doorUnclassified.join(' | ') : '');
ok(!C.doorDead.length && !C.doorReasonless.length, 'no dead door row, no `other` without its why', [...C.doorDead.map((c) => 'DEAD ' + c), ...C.doorReasonless.map((c) => 'NO WHY ' + c)].join(' | '));
ok(!C.bearerUnreadable.length && C.bearerDoors.length >= 2, `every bearer door is a path test the census reads (${C.bearerDoors.map((d) => (d.test.kind === 'prefix' ? d.test.path + '*' : d.test.path)).join(', ')})`, C.bearerUnreadable.join(' | '));
ok(C.bearerDoors.some((d) => d.test.kind === 'prefix' && d.test.path === '/api/agent/'), 'the agent prefix /api/agent/ is a bearer door');
if (C.doors.some((d) => d.cond === '!this.enabled')) console.log('    said, not swept: on a hub nobody signs in to (`!this.enabled`), every route is open to any caller — this census reads the signed-in hub');

console.log('② the registrations (every app / router route in the hub tree)');
ok(!C.unparsed.length && C.rows.length > 600, `the hub tree parses and registers ${C.rows.length} route paths across ${new Set(C.rows.map((r) => r.file)).size} files`, C.unparsed.join(' '));
ok(!C.dynamicUnrowed.length, `every registration whose path is no literal is a \`dynamic\` row with its why (${C.dynamic.length})`, C.dynamicUnrowed.length ? 'NEW — add each to ' + TABLE_REL + ' dynamic: ' + C.dynamicUnrowed.join(' | ') : '');
ok(!C.dynamicDead.length && !C.dynamicReasonless.length, 'no dead dynamic row; each is `other: <why>` or `bearer: <METHOD path>, …`', [...C.dynamicDead.map((k) => 'DEAD ' + k), ...C.dynamicReasonless.map((k) => 'UNCLASSIFIED ' + k)].join(' | '));

console.log('③ the bearer routes (every registration under a bearer door, and the module that holds it)');
{
  const per = {}; for (const r of C.routes) per[r.file] = (per[r.file] || 0) + 1;
  console.log('    ' + Object.entries(per).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f.replace(/^src\//, '')} ${n}`).join(' · '));
  ok(!C.beltUnrowed.length && !C.beltDead.length && !C.beltReasonless.length, `every belt (a \`.use\` under a bearer door) is a \`belts\` row with its why (${C.belts.map((r) => `${r.path} ${r.file.replace(/^src\//, '')}:${r.line}`).join(', ')})`, [...C.beltUnrowed.map((k) => 'NEW ' + k), ...C.beltDead.map((k) => 'DEAD ' + k), ...C.beltReasonless.map((k) => 'NO WHY ' + k)].join(' | '));
  ok(C.routes.length >= 130 && Object.keys(per).length >= 10, `${C.routes.length} bearer routes in ${Object.keys(per).length} modules`);
  for (const want of ['src/agent-routes.js', 'src/agent-routes/status.js', 'src/routes/vault.js', 'src/routes/browser.js', 'src/routes/editor.js', 'src/server/plugin-loader.js']) ok(per[want] > 0, `the census reads ${want}'s bearer routes`);
  ok(!C.unreached.length, 'every module holding a bearer route is LOADED by the hub (reached from server.js through its requires; mounted is ⑦\'s proof)', C.unreached.join(' '));
  ok(!C.routeDead.length && !C.routeReasonless.length, `every \`routes\` row names a bearer route that exists, every skip says why (${Object.keys(TABLE.routes || {}).length} rows)`, [...C.routeDead.map((k) => 'DEAD ' + k), ...C.routeReasonless.map((k) => 'NO WHY ' + k)].join(' | '));
  if (C.twice.length) console.log('    the same method + path registered twice: ' + C.twice.join(' · '));
}

// ── ④ CONTROLS ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ controls (the census over planted copies — the tree is never written)');
const overlay = (over) => (f) => (has(over, f) ? over[f] : readRepo(f));
{
  // a new door: a path test the table does not classify
  const auth = readRepo('src/auth.js');
  const at = auth.indexOf("if (p.startsWith('/api/agent/')) return next();");
  ok(at > 0, 'the agent door is found in src/auth.js (the controls\' anchor)');
  const planted = auth.slice(0, at) + "if (p.startsWith('/api/planted/')) return next();\n      " + auth.slice(at);
  const c1 = census({ files: FILES, read: overlay({ 'src/auth.js': planted }), table: TABLE });
  ok(c1.doorUnclassified.length === 1 && /\/api\/planted\//.test(c1.doorUnclassified[0]), 'CONTROL: a planted door the table does not name ⇒ RED (unclassified)', c1.doorUnclassified);
  const c1b = census({ files: FILES, read: overlay({ 'src/auth.js': planted }), table: { ...TABLE, doors: { ...TABLE.doors, "p.startsWith('/api/planted/')": 'bearer' } } });
  ok(c1b.bearerDoors.some((d) => d.test.path === '/api/planted/') && !c1b.doorUnclassified.length, 'CONTROL: classified `bearer`, the planted door joins the sweep\'s doors');
  const c1c = census({ files: FILES, read: overlay({ 'src/auth.js': planted.replace("if (p.startsWith('/api/planted/'))", "if (/^\\/api\\/planted\\//.test(p))") }), table: { ...TABLE, doors: { ...TABLE.doors, '/^\\/api\\/planted\\//.test(p)': 'bearer' } } });
  ok(c1c.bearerUnreadable.length === 1, 'CONTROL: a `bearer` door written as a regex the census cannot read ⇒ RED', c1c.bearerUnreadable);
}
{
  // a dynamic route, and a bearer route in a module nothing requires
  const vault = readRepo('src/routes/vault.js');
  const anchor = vault.indexOf('function registerVaultRoutes(');
  const body = vault.indexOf('{', vault.indexOf(')', anchor)) + 1;
  ok(anchor > 0 && body > anchor, 'registerVaultRoutes is found (the controls\' anchor)');
  const dyn = vault.slice(0, body) + "\n  app.get(PLANTED_PATH, (req, res) => res.json({}));" + vault.slice(body);
  const c2 = census({ files: FILES, read: overlay({ 'src/routes/vault.js': dyn }), table: TABLE });
  ok(c2.dynamicUnrowed.length === 1 && /PLANTED_PATH/.test(c2.dynamicUnrowed[0]), 'CONTROL: a route whose path is no literal and no row ⇒ RED', c2.dynamicUnrowed);
  const lit = vault.slice(0, body) + "\n  const PLANTED = '/api/agent/planted-const';\n  app.get(PLANTED, (req, res) => res.json({}));" + vault.slice(body);
  const c3 = census({ files: FILES, read: overlay({ 'src/routes/vault.js': lit }), table: TABLE });
  ok(c3.routes.some((r) => r.path === '/api/agent/planted-const' && r.file === 'src/routes/vault.js'), 'CONTROL: a route whose path is a same-file const is read as a bearer route');
  const lone = "'use strict';\nmodule.exports = (app) => { app.post('/api/agent/planted-lone', (req, res) => res.json({})); };\n";
  const c4 = census({ files: [...FILES, 'src/server/planted-lone.js'], read: overlay({ 'src/server/planted-lone.js': lone }), table: TABLE });
  ok(c4.unreached.includes('src/server/planted-lone.js'), 'CONTROL: a bearer route in a module the hub never loads ⇒ RED (unreached)', c4.unreached);
  const c5 = census({ files: FILES, read: readRepo, table: { ...TABLE, routes: { ...(TABLE.routes || {}), 'GET /api/agent/planted-dead': { skip: 'x' }, [`${C.routes[0].method} ${C.routes[0].path}`]: { skip: ' ' } } } });
  ok(c5.routeDead.includes('GET /api/agent/planted-dead') && c5.routeReasonless.length === 1, 'CONTROL: a routes row no route answers ⇒ DEAD, a skip with a blank why ⇒ RED', [c5.routeDead, c5.routeReasonless]);
  // a computed bearer path rowed `bearer:` joins the sweep; rowed with anything else it is RED
  const dyn2 = vault.slice(0, body) + "\n  app.get(PLANTED_PATH, (req, res) => res.json({}));" + vault.slice(body);
  const k2 = 'src/routes/vault.js app.get(PLANTED_PATH)';
  const c6 = census({ files: FILES, read: overlay({ 'src/routes/vault.js': dyn2 }), table: { ...TABLE, dynamic: { ...TABLE.dynamic, [k2]: 'bearer: GET /api/agent/planted-computed' } } });
  ok(!c6.dynamicUnrowed.length && !c6.dynamicReasonless.length && c6.routes.some((r) => r.path === '/api/agent/planted-computed' && r.file === 'src/routes/vault.js'), 'CONTROL: a computed path rowed `bearer: GET /api/agent/…` joins the bearer routes', c6.dynamicReasonless);
  const c7 = census({ files: FILES, read: overlay({ 'src/routes/vault.js': dyn2 }), table: { ...TABLE, dynamic: { ...TABLE.dynamic, [k2]: 'a computed path, fine' } } });
  ok(c7.dynamicReasonless.includes(k2), 'CONTROL: a dynamic row that is neither `other: <why>` nor `bearer: <METHOD path>` ⇒ RED', c7.dynamicReasonless);
  const belt = vault.slice(0, body) + "\n  app.use('/api/agent/planted-belt', (req, res, next) => next());" + vault.slice(body);
  const c8 = census({ files: FILES, read: overlay({ 'src/routes/vault.js': belt }), table: TABLE });
  ok(c8.beltUnrowed.length === 1 && /planted-belt/.test(c8.beltUnrowed[0]), 'CONTROL: a new belt under a bearer door with no `belts` row ⇒ RED', c8.beltUnrowed);
  const other = "'use strict';\nmodule.exports = (a) => { a.post('/api/agent/planted-recv', (req, res) => res.json({})); };\n";
  const c9 = census({ files: [...FILES, 'src/server/planted-recv.js'], read: overlay({ 'src/server/planted-recv.js': other }), table: TABLE });
  ok(c9.routes.some((r) => r.path === '/api/agent/planted-recv'), 'CONTROL: a route on another receiver (`a.post(\'/api/agent/…\', h)`) is read');
  const c10 = census({ files: FILES, read: overlay({ 'src/routes/vault.js': vault + '\n)(' }), table: TABLE });
  ok(c10.unparsed.includes('src/routes/vault.js'), 'CONTROL: a hub file that does not parse ⇒ RED (unparsed)', c10.unparsed);
}
{
  // a dead or blank row of each table kind (the table planted, the tree as it is)
  const t = JSON.parse(JSON.stringify(TABLE));
  t.doors["p === '/api/planted-dead-door'"] = 'other: a door no middleware has';
  t.doors["p.startsWith('/otel/')"] = 'other:';
  t.dynamic['src/planted.js app.get(NOPE)'] = 'other: a registration nobody makes';
  t.belts['/api/agent/planted-dead-belt src/routes/vault.js'] = 'a belt nobody mounts';
  const k = Object.keys(t.belts).find((x) => x.startsWith('/api/agent/vault '));
  t.belts[k] = '';
  const c = census({ files: FILES, read: readRepo, table: t });
  ok(c.doorDead.includes("p === '/api/planted-dead-door'") && c.doorReasonless.includes("p.startsWith('/otel/')"), 'CONTROL: a door row no door has ⇒ DEAD, an `other:` with no why ⇒ RED', [c.doorDead, c.doorReasonless]);
  ok(c.dynamicDead.includes('src/planted.js app.get(NOPE)'), 'CONTROL: a dynamic row no registration has ⇒ DEAD', c.dynamicDead);
  ok(c.beltDead.includes('/api/agent/planted-dead-belt src/routes/vault.js') && c.beltReasonless.includes(k), 'CONTROL: a belt row no belt has ⇒ DEAD, a belt row with no why ⇒ RED', [c.beltDead, c.beltReasonless]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
