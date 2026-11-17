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
//   ⑤ THE WORLD (U2): the hub's REAL wiring evaluated in-process over a scratch root — every wiring-time use of a route
//      module (server.js and src/server/*-wiring.js, piece by piece; route modules natively), server.js's own
//      middleware and app.locals in the boot's order, every free name what the wiring makes it (a `let` the boot fills in
//      later takes that assignment), every construction touched at MOUNT a CATALOG row (eval / make / inert, each with
//      its why, none untouched); no program starts. A name a handler touches only when a request comes is the sweep's.
//   ⑥ THE MOUNT: within the modules ③ found, the bearer routes the real wiring serves (a router's mount prefix joined)
//      = ③'s static list, both ways — a route gated off by a dep, one only a prefix or a computed path makes, a regex
//      path = RED. A router module (browser, apps, window-targets) registers when it loads: its gating is in its
//      handlers (the sweep's).
//   ⑦ CONTROLS of the world (last: every world shares the require cache, so a control's setup() re-points a router
//      module's context): a route planted IN a wiring file is mounted and ⑥ is green on it; a dep-gated route is
//      unmounted when the wiring passes null (⑥ names it) and mounted with the real dep; a router under a prefix and a
//      regex route are read as such; a blank or stale `unmounted` row, a construction with no row, a registering export
//      used where the boot never runs, a site that starts a program ⇒ each RED. A site runs without the try / if around
//      it in the wiring: the world shows what the boot CAN mount (it errs toward more routes, never fewer).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { trackedFiles } from './tracked-files.mjs';
import { scratch, scratchHome } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
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
  const body = vault.indexOf('}) {', anchor) + 4;   // the function body's first byte (after the destructured parameter list)
  ok(anchor > 0 && body > anchor && /^\n  app\.use\(\['\/api\/vault'/.test(vault.slice(body)), 'registerVaultRoutes\'s body is found (the controls\' anchor: its first statement)');
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

// ── ⑤–⑦ THE WORLD (U2): the hub's REAL wiring, mounted in-process ─────────────────────────────────────────────────
// A WIRING FILE is server.js or a src/server/*-wiring.js (the decomposition's names): its code runs at boot and is
// evaluated here PIECE BY PIECE, never called whole (a whole create() would build every engine of the hub). A SITE is
// (i) a call — or an `app.use(<it>)` — of an export of a module that is NOT a wiring file, made at wiring time in a
// wiring file (its chain of exported wiring functions reaches server.js's top level, each with ONE wiring-time
// caller), or (ii) a bearer route registered directly in a wiring file at wiring time. Each site's REAL source is
// evaluated in a scope where every free name is what the wiring makes it: the enclosing wiring function's parameter
// (its caller's argument, evaluated in the caller's scope — up to server.js), else a declaration of that file
// (evaluated from its own source, once), else — when that declaration CONSTRUCTS something at wiring time (a call or a
// `new` outside a function body, the safe few aside) — a CATALOG row: `eval` (the real construction, its arguments
// through the same scope), `make` (a census-built value: a real store on the scratch root, or a stand-in) or `inert`
// (a stand-in whose every member is a no-op, for an engine whose only part on the touched roads is a side effect).
// A construction with no row, a stand-in member nobody gave, a program started, a row nothing touched = RED.
console.log('⑤ the world (the hub\'s real wiring, evaluated in-process over a scratch root)');
const WIRING = new Set(FILES.filter((f) => f === 'server.js' || /^src\/server\/[a-z0-9-]+-wiring\.js$/.test(f)));
const HOME = scratchHome('agent-leak-home');
const ROOT = scratch('agent-leak'); fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
process.env.HOME = HOME; process.env.XDG_RUNTIME_DIR = path.join(HOME, '.run'); fs.mkdirSync(process.env.XDG_RUNTIME_DIR, { recursive: true, mode: 0o700 });
process.env.VIBESPACE_SKIP_AGENT_HOOKS = '1'; process.env.VS_NO_REAL_CLI = '1';
// NO PROGRAM RUNS: every child_process door refuses and is counted (a world that starts one is RED)
const SPAWNED = [];
{
  const cp = require('node:child_process');
  for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[k] = (...a) => { SPAWNED.push(`${k} ${String(a[0]).slice(0, 60)}`); throw Object.assign(new Error(`census: no program runs (${k} ${String(a[0]).slice(0, 40)})`), { code: 'ENOENT' }); };
}
const express = require('express');
// a router mounted under a prefix (`app.use('/api/agent', r)`) serves its routes under it: every `.use(<path>, fn)`
// records the path its function is mounted at (express 4 keeps only the regexp), and the stack walk prefixes with it
const MOUNTED_AT = new WeakMap();
{
  const proto = require('express/lib/router/index.js');
  const use0 = proto.use;
  proto.use = function (first, ...rest) { if (typeof first === 'string' || Array.isArray(first)) for (const fn of rest.flat()) if (typeof fn === 'function') MOUNTED_AT.set(fn, [].concat(first)); return use0.call(this, first, ...rest); };
}
const AST = new Map();
const astOf = (f, read = readRepo) => { const s = read(f); const k = f + '\0' + s; if (!AST.has(k)) AST.set(k, parse(s)); return AST.get(k); };
function walkA(n, fn, anc = []) {
  if (!n || typeof n.type !== 'string') return;
  if (fn(n, anc) === false) return;
  const next = [...anc, n];
  for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach((x) => walkA(x, fn, next)); else if (v && typeof v.type === 'string') walkA(v, fn, next); }
}
const FNS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const KNOWN = new Set(FILES);
const resolveSpec = (f, sp) => { const base = path.posix.normalize(path.posix.join(path.posix.dirname(f), sp)); return [base, base + '.js', base + '/index.js'].find((c) => KNOWN.has(c)) || null; };
const reqOf = (n, f) => (n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments[0] && n.arguments[0].type === 'Literal' && typeof n.arguments[0].value === 'string' && /^\./.test(n.arguments[0].value) ? resolveSpec(f, n.arguments[0].value) : null);

/** a wiring model over { read } (the controls overlay planted copies) */
function wiringModel(read) {
  const src = (f) => read(f);
  const text = (f, n) => src(f).slice(n.start, n.end);
  const lineOfAt = (f, i) => src(f).slice(0, i).split('\n').length;
  /** the uses of module M's exports in WIRING files: [{ file, node, anc, fnAnc, what, via }] */
  const usesMemo = new Map();
  function usesOf(M) {
    if (usesMemo.has(M)) return usesMemo.get(M);
    const out = [];
    const stem = path.posix.basename(M).replace(/\.js$/, '');
    for (const W of WIRING) {
      if (W === M || !src(W).includes(stem)) continue;
      const ast = astOf(W, read); if (!ast) continue;
      const alias = new Map();
      walkA(ast, (n) => {
        if (n.type !== 'VariableDeclarator' || !n.init) return;
        if (n.id.type === 'Identifier' && reqOf(n.init, W) === M) alias.set(n.id.name, '*');
        else if (n.id.type === 'Identifier' && n.init.type === 'MemberExpression' && reqOf(n.init.object, W) === M) alias.set(n.id.name, n.init.property.name);
        else if (n.id.type === 'ObjectPattern' && reqOf(n.init, W) === M) for (const p of n.id.properties) if (p.type === 'Property' && p.value.type === 'Identifier') alias.set(p.value.name, p.key.name || p.key.value);
      });
      const usesM = (e) => {
        if (!e) return null;
        if (e.type === 'MemberExpression' && !e.computed && reqOf(e.object, W) === M) return e.property.name;
        if (e.type === 'MemberExpression' && !e.computed && e.object.type === 'Identifier' && alias.get(e.object.name) === '*') return e.property.name;
        if (e.type === 'Identifier' && alias.has(e.name) && alias.get(e.name) !== '*') return alias.get(e.name);
        return null;
      };
      walkA(ast, (n, anc) => {
        if (n.type !== 'CallExpression') return;
        let what = usesM(n.callee), via = 'call';
        if (!what && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'use' && n.callee.object.type === 'Identifier' && n.callee.object.name === 'app') for (const a of n.arguments) { const w = usesM(a); if (w) { what = w; via = 'app.use'; } }
        if (what) out.push({ file: W, node: n, anc, fnAnc: [...anc].reverse().find((a) => FNS.has(a.type)) || null, what, via, of: M });
      });
    }
    usesMemo.set(M, out);
    return out;
  }
  function exportedAs(W, fname) {
    let name = null;
    walkA(astOf(W, read), (n) => { if (n.type === 'AssignmentExpression' && text(W, n.left) === 'module.exports' && n.right.type === 'ObjectExpression') for (const p of n.right.properties) if (p.type === 'Property' && p.value.type === 'Identifier' && p.value.name === fname) name = p.key.name || p.key.value; });
    return name;
  }
  /** a use's chain to server.js's top level: [use, its function's caller, …] — or { broken } */
  function chainOf(u, depth = 0) {
    if (depth > 6) return { broken: 'a chain deeper than six wiring functions' };
    if (!u.fnAnc) return u.file === 'server.js' ? [u] : { broken: `${u.file} runs it at its module's top level (only server.js's top level is the boot)` };
    const top = astOf(u.file, read).body;
    if (u.fnAnc.type !== 'FunctionDeclaration' || !top.includes(u.fnAnc)) return { broken: 'inside a function that is no top-level declaration of its wiring file (it runs when called, not at boot)' };
    const ex = exportedAs(u.file, u.fnAnc.id.name);
    if (!ex) return { broken: `${u.fnAnc.id.name} is not exported` };
    const chains = usesOf(u.file).filter((c) => c.what === ex && c.via === 'call').map((c) => chainOf(c, depth + 1)).filter((c) => Array.isArray(c));
    if (chains.length !== 1) return { broken: `${u.file} .${ex} has ${chains.length} wiring-time callers` };
    return [u, ...chains[0]];
  }
  return { usesOf, chainOf, text, lineOfAt };
}

/** the declarations visible at a node (innermost first): name → { kind, node, init, key, dflt, file, anc } */
function declsAt(f, anc) {
  const m = new Map();
  const add = (name, d) => { if (!m.has(name)) m.set(name, d); };
  for (let i = anc.length - 1; i >= 0; i--) {
    const a = anc[i];
    const body = a.type === 'Program' || a.type === 'BlockStatement' ? a.body : null;
    if (body) for (const st of body) {
      if ((st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') && st.id) add(st.id.name, { kind: 'fn', node: st, file: f, anc: anc.slice(0, i + 1) });
      if (st.type === 'VariableDeclaration') for (const d of st.declarations) {
        if (d.id.type === 'Identifier') add(d.id.name, { kind: 'var', node: d, init: d.init, file: f, anc: anc.slice(0, i + 1) });
        else if (d.id.type === 'ObjectPattern') for (const p of d.id.properties) if (p.type === 'Property') { const v = p.value.type === 'AssignmentPattern' ? p.value.left : p.value; if (v.type === 'Identifier') add(v.name, { kind: 'pick', node: d, init: d.init, key: p.key.name || p.key.value, file: f, anc: anc.slice(0, i + 1) }); }
      }
    }
    if (FNS.has(a.type)) for (const p0 of a.params) {
      const p = p0.type === 'AssignmentPattern' && p0.left.type === 'ObjectPattern' ? p0.left : p0;   // `function install({ … } = {})`
      if (p.type === 'ObjectPattern') for (const q of p.properties) { if (q.type !== 'Property') continue; const dv = q.value.type === 'AssignmentPattern' ? q.value : null; const id = dv ? dv.left : q.value; if (id.type === 'Identifier') add(id.name, { kind: 'param', key: q.key.name || q.key.value, dflt: dv ? dv.right : null, file: f, anc: anc.slice(0, i) }); }
      else { const id = p.type === 'AssignmentPattern' ? p.left : p; if (id.type === 'Identifier') add(id.name, { kind: 'positional', file: f }); }
    }
  }
  return m;
}
const SAFE_CALL = /^(require|path\.(join|resolve|dirname|basename|relative)|Object\.(freeze|assign|fromEntries|keys|entries|create)|String|Number|Boolean|Symbol|Array\.from|Array\.isArray|Date\.now|JSON\.(parse|stringify)|os\.(homedir|hostname|tmpdir|platform)|process\.cwd|Math\.\w+|parseInt|parseFloat)$/;
const SAFE_NEW = /^(Map|Set|WeakMap|WeakSet|Error|URL|RegExp)$/;
/** the construction an init makes at wiring time (a call / new outside every function body, the safe few aside), or null */
function constructsIn(f, init, text) {
  let hit = null;
  walkA(init, (n) => {
    if (hit || FNS.has(n.type)) return false;
    if (n.type === 'NewExpression' && !SAFE_NEW.test(text(f, n.callee))) { hit = text(f, n); return false; }
    if (n.type === 'CallExpression' && !SAFE_CALL.test(text(f, n.callee))) { hit = text(f, n); return false; }
  });
  return hit;
}
/** a `let x = null` (or `let x;`) filled in later: its FIRST wiring-time assignment `x = <expr>` in the block that
 *  declares it (into try / if / nested blocks, never into a function body — that one runs when called) */
function assignmentIn(block, name) {
  let rhs = null;
  for (const st of block.body || []) walkA(st, (n) => { if (rhs || FNS.has(n.type)) return false; if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier' && n.left.name === name) rhs = n.right; });
  return rhs;
}
const LITERALISH = new Set(['Literal', 'Identifier']);   // null / undefined / false / 0 / '' — a placeholder the boot replaces

/** THE WORLD over { read, catalog }: mounts every site on one express app → { app, sites, broken, threw, demanded, gaps, used, value } */
function buildWorld({ read = readRepo, catalog, routes, root = ROOT, modules = {} }) {
  const WM = wiringModel(read);
  const app = express();
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const MUTS = Object.keys(modules).length ? mutantCopies('agent-leak-world', REPO) : null;
  const loaded = new Map();
  const requireIn = (f) => {
    const real = createRequire(path.join(REPO, f));
    if (!MUTS) return real;
    const r = (spec) => { const rel = /^\./.test(spec) ? resolveSpec(f, spec) : null; if (rel && has(modules, rel)) { if (!loaded.has(rel)) loaded.set(rel, MUTS.load(rel, modules[rel], 'world')); return loaded.get(rel); } return real(spec); };
    r.resolve = real.resolve; r.cache = real.cache;
    return r;
  };
  const demanded = new Map(), gaps = new Set(), used = new Set(), threw = [], evaluated = new Set();
  const GLOBALS = new Set([...Object.getOwnPropertyNames(globalThis), 'undefined', 'NaN', 'Infinity']);
  const memo = new Map(), scopes = new Map();
  const made = new Map();
  const world = { root, data: path.join(root, 'data'), home: HOME, app, gaps, value: null, made };
  const rowValue = (key) => {
    const row = catalog[key];
    used.add(key);
    if (row.kind === 'inert') return inert(key);
    if (row.kind === 'make') return row.make(world);
    return undefined;
  };
  function scopeFor(f, anc, chainRest) {
    const block = [...anc].reverse().find((a) => a.type === 'BlockStatement' || a.type === 'Program' || FNS.has(a.type));
    const sk = `${f}\0${block ? block.start : 0}`;
    if (scopes.has(sk)) return scopes.get(sk);
    const decls = declsAt(f, anc);
    const local = new Map();
    const fixed = { require: requireIn(f), module: { exports: {} }, exports: {}, __filename: path.join(REPO, f), __dirname: f === 'server.js' ? root : path.dirname(path.join(REPO, f)), app };
    const resolve = (name) => {
      if (local.has(name)) return local.get(name);
      if (has(fixed, name)) return fixed[name];
      const key = `${f}:${name}`;
      const d = decls.get(name);
      if (!d) { demanded.set(key, 'no declaration in scope'); return undefined; }
      const mk = `${d.file}\0${d.node ? d.node.start : d.key}\0${name}`;
      if (memo.has(mk)) return memo.get(mk);
      let v;
      if (has(catalog, key) && catalog[key].kind !== 'eval') { v = rowValue(key); made.set(key, v); }
      else if (d.kind === 'fn') v = evalIn(d.file, d.anc, chainRest, '(' + WM.text(d.file, d.node) + ')');
      else if (d.kind === 'var' || d.kind === 'pick') {
        let init = d.init;
        if (d.kind === 'var' && (!init || (LITERALISH.has(init.type) && (init.type !== 'Identifier' || init.name === 'undefined')))) { const late = assignmentIn(d.anc[d.anc.length - 1], name); if (late) init = late; }
        if (!init) v = undefined;
        else {
          const c = constructsIn(d.file, init, WM.text);
          if (c && !has(catalog, key)) { demanded.set(key, 'constructs ' + squash(c).slice(0, 90)); v = undefined; }
          else {
            if (c) used.add(key);
            const whole = evalIn(d.file, d.anc, chainRest, '(' + WM.text(d.file, init) + ')');
            v = d.kind === 'pick' ? (whole == null ? undefined : whole[d.key]) : whole;
            if (c) made.set(key, v);
          }
        }
      } else if (d.kind === 'param') {
        const caller = chainRest[0];
        const arg = caller && caller.node.arguments[0];
        const prop = arg && arg.type === 'ObjectExpression' ? arg.properties.find((p) => p.type === 'Property' && (p.key.name || p.key.value) === d.key) : null;
        if (prop) v = evalIn(caller.file, [...caller.anc, caller.node], chainRest.slice(1), '(' + WM.text(caller.file, prop.value) + ')');
        else if (d.dflt) v = evalIn(d.file, d.anc, chainRest, '(' + WM.text(d.file, d.dflt) + ')');
      } else demanded.set(key, 'a positional parameter (the census maps an object parameter only)');
      memo.set(mk, v); evaluated.add(key);
      return v;
    };
    const scope = new Proxy(Object.create(null), {
      has: (t, k) => typeof k === 'string' && (has(fixed, k) || !GLOBALS.has(k)),
      get: (t, k) => (k === Symbol.unscopables ? undefined : resolve(k)),
      set: (t, k, v) => { local.set(k, v); return true; },
    });
    scopes.set(sk, scope);
    return scope;
  }
  function evalIn(f, anc, chainRest, expr) {
    // eslint-disable-next-line no-new-func
    return new Function('__scope', 'with (__scope) { return ' + expr + '; }')(scopeFor(f, anc, chainRest));
  }
  world.value = (f, name) => { const ast = astOf(f, read); return scopeFor(f, [ast], [])[name]; };
  // the sites: (i) uses of a non-wiring bearer module's exports, (ii) bearer registrations inside a wiring file
  const sites = [], broken = [];
  const bearerFiles = [...new Set(routes.map((r) => r.file))];
  for (const M of bearerFiles.filter((m) => !WIRING.has(m))) for (const u of WM.usesOf(M)) {
    const ch = WM.chainOf(u);
    const tag = `${u.file}:${WM.lineOfAt(u.file, u.node.start)} ${u.via === 'app.use' ? `app.use(${M}.${u.what})` : `${M}.${u.what}(…)`}`;
    if (Array.isArray(ch)) sites.push({ u, ch, tag }); else broken.push({ tag, why: ch.broken, what: u.what, of: M });
  }
  for (const W of bearerFiles.filter((m) => WIRING.has(m))) {
    const lines = new Set(routes.filter((r) => r.file === W).map((r) => r.line));
    walkA(astOf(W, read), (n, anc) => {
      if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || !lines.has(WM.lineOfAt(W, n.start)) || !RECV.test(WM.text(W, n.callee.object))) return;
      const u = { file: W, node: n, anc, fnAnc: [...anc].reverse().find((a) => FNS.has(a.type)) || null, what: 'route', via: 'route' };
      const ch = WM.chainOf(u);
      const tag = `${W}:${WM.lineOfAt(W, n.start)} ${WM.text(W, n.callee)}(${squash(WM.text(W, n.arguments[0])).slice(0, 60)}, …)`;
      if (Array.isArray(ch)) sites.push({ u, ch, tag }); else broken.push({ tag, why: ch.broken, what: 'route', of: W });
    });
  }
  // (iii) every top-level `app.use(…)` of server.js: the middleware in front of the routes (the cookie gate, the body
  // parser, the routers between), in the boot's order — express runs them in registration order
  for (const st of astOf('server.js', read).body) {
    const n = st.type === 'ExpressionStatement' ? st.expression : null;
    if (!n || n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed || n.callee.property.name !== 'use' || WM.text('server.js', n.callee.object) !== 'app') continue;
    const u = { file: 'server.js', node: n, anc: [astOf('server.js', read), st], fnAnc: null, what: 'use', via: 'middleware' };
    sites.push({ u, ch: [u], tag: `server.js:${WM.lineOfAt('server.js', n.start)} app.use(${squash(WM.text('server.js', n.arguments[0])).slice(0, 50)}…)`, middleware: true });
  }
  // (iv) every `app.locals.<x> = …` of server.js's top level (a route reads what the boot put there: authEnabled, safeFs…)
  for (const st of astOf('server.js', read).body) {
    const n = st.type === 'ExpressionStatement' ? st.expression : null;
    if (!n || n.type !== 'AssignmentExpression' || !/^app\.locals\./.test(WM.text('server.js', n.left))) continue;
    const u = { file: 'server.js', node: n, anc: [astOf('server.js', read), st], fnAnc: null, what: 'locals', via: 'locals' };
    sites.push({ u, ch: [u], tag: `server.js:${WM.lineOfAt('server.js', n.start)} ${WM.text('server.js', n.left)} = …`, middleware: true });
  }
  // a site that is the right side of an assignment runs AS the assignment (`app.locals.vaultGate = …vaultGate(…)`)
  for (const s0 of sites) { const par = s0.u.anc[s0.u.anc.length - 1]; if (par && par.type === 'AssignmentExpression' && par.right === s0.u.node) s0.u = { ...s0.u, node: par, anc: s0.u.anc.slice(0, -1) }; }
  // the boot's order: by the server.js line each chain ends at, then the site's own place
  const order = (s) => WM.lineOfAt('server.js', s.ch[s.ch.length - 1].node.start) * 1e6 + (s.ch.length > 1 ? s.u.node.start : 0);
  sites.sort((a, b) => order(a) - order(b));
  for (const s of sites) {
    try { evalIn(s.u.file, s.u.anc, s.ch.slice(1), WM.text(s.u.file, s.u.node)); }
    catch (e) { threw.push(`${s.tag} — ${String((e && e.message) || e).slice(0, 200)}`); }
  }
  return { world, app, sites, broken, threw, demanded, gaps, used, evaluated };
}
/** a stand-in whose every member is a no-op returning undefined (an engine whose part on the touched roads is a side effect) */
function inert(key) {
  const fn = function () { return undefined; };
  const p = new Proxy(fn, { get: (t, k) => (k === 'then' || typeof k === 'symbol' ? undefined : k === 'toJSON' ? () => `[inert ${key}]` : p), apply: () => undefined });
  return p;
}
/** a stand-in with the members it was given; any other member READ is a gap (RED: give the stand-in that member) */
function standIn(world, key, members) {
  return new Proxy(members, { get: (t, k) => { if (typeof k === 'symbol' || k === 'then' || k === 'toJSON' || k in t) return t[k]; world.gaps.add(`${key}.${String(k)}`); return undefined; } });
}
/** every route an app's stack serves: `METHOD /path` (a router's mount prefix joined), a regex path as `METHOD REGEX <source>` */
const stackRoutes = (stack, out = [], prefix = '') => {
  for (const l of stack || []) {
    if (l.route) { for (const m of Object.keys(l.route.methods)) for (const p of [].concat(l.route.path)) out.push(p instanceof RegExp ? `${m.toUpperCase()} REGEX ${prefix}${p.source}` : `${m.toUpperCase()} ${(prefix + p).replace(/\/\/+/g, '/')}`); }
    else if (l.handle && l.handle.stack) for (const at of MOUNTED_AT.get(l.handle) || ['']) stackRoutes(l.handle.stack, out, prefix + (at === '/' ? '' : at));
  }
  return out;
};
/** ⑥'s verdict over a world: the bearer routes it serves against the static list (a `routes` row `{ unmounted: why }`
 *  names a deliberate one — blank, or on a route that IS mounted, = RED) */
function mountVerdict(app, routes, table) {
  const served = stackRoutes(app._router.stack);
  const regex = served.filter((r) => / REGEX /.test(r));
  const mounted = new Set(served.filter((r) => !/ REGEX /.test(r) && C.bearerDoors.some((d) => underDoor(r.slice(r.indexOf(' ') + 1), d.test))));
  const want = new Set(routes.map((r) => `${r.method} ${r.path}`));
  const rows = table.routes || {};
  const named = Object.entries(rows).filter(([, r]) => r && has(r, 'unmounted'));
  return {
    mounted, want, regex,
    unmounted: [...want].filter((k) => !mounted.has(k) && !(rows[k] && rows[k].unmounted && String(rows[k].unmounted).trim())),
    extra: [...mounted].filter((k) => !want.has(k)),
    unmountedReasonless: named.filter(([, r]) => !String(r.unmounted || '').trim()).map(([k]) => k),
    unmountedStale: named.filter(([k]) => mounted.has(k)).map(([k]) => k),
  };
}

// THE CATALOG: every construction a site touches, by `<file>:<name>` — `eval` (the real construction from the wiring's
// own source), `make` (a census-built value) or `inert` — each with its why. A row nothing touched is DEAD (RED).
const R = (rel) => require(path.join(REPO, rel));
const CATALOG = {
  // ── server.js ──
  'server.js:wss': { kind: 'make', why: 'the WebSocket server: no client connects in the census (clients is empty; a broadcast reaches nobody)', make: () => ({ clients: new Set(), on() {}, handleUpgrade() {}, emit() {} }) },
  'server.js:readSessionMeta': { kind: 'make', why: 'session-stdout.js create()\'s meta reader: a map the world seeds (a conversation\'s meta by its id)', make: (w) => metaStore(w).read },
  'server.js:writeSessionMeta': { kind: 'make', why: 'the same store\'s writer', make: (w) => metaStore(w).write },
  'server.js:tasks': { kind: 'make', why: 'THE Task Groups store, real, on the scratch data dir with the real grants store (a group\'s outside visibility is a grant row)', make: (w) => new (R('src/task-groups.js').TaskGroupManager)({ dataDir: w.data, onChange: () => {}, readUserState: () => ({}), getSetting: () => undefined, isLiveKey: () => true, grants: w.value('server.js', 'grants'), homeDir: w.home }) },
  'server.js:grants': { kind: 'eval', why: 'THE grants store (grants-store.js install(create)), real, on the scratch data dir' },
  'server.js:sessionStatus': { kind: 'make', why: 'THE session status store, real, on the scratch data dir', make: (w) => new (R('src/session-status.js').SessionStatusManager)({ dataDir: w.data, onChange: () => {} }) },
  'server.js:userTodos': { kind: 'make', why: 'THE For-you store, real, on the scratch data dir (no expiry sweep timer)', make: (w) => new (R('src/user-todos.js').UserTodoManager)({ dataDir: w.data, onChange: () => {}, expirySweepMs: 0 }) },
  'server.js:spendGuard': { kind: 'make', why: 'THE SPEND CEILING: the census spends nothing — every authorize refuses by name', make: (w) => standIn(w, 'spendGuard', { authorize: () => ({ ok: false, allowed: false, code: 'census_no_spend', reason: 'the census starts no turn' }), note() {}, release() {}, reservationState: () => null, waitingReservations: () => [] }) },
  'server.js:jobsWiring': { kind: 'make', why: 'the Background Work engine: a stand-in that knows the jobs the world planted (jobByToken / get / list)', make: (w) => ({ getJobs: () => jobsOf(w) }) },
  'server.js:deliver': { kind: 'make', why: 'THE delivery ladder: a recorder — nothing reaches a CLI, a daemon or a stash on disk', make: (w) => standIn(w, 'deliver', { stashFor: (cid, env) => { (w.stash ||= []).push({ cid, env }); return { stored: true }; }, deliver: async () => ({ ok: false, code: 'census_no_delivery' }), drainStash: () => [], pendingFor: () => [] }) },
  'server.js:AGENT_BIN_DIR': { kind: 'make', why: 'agent-tool-generators create()\'s bin dir: a scratch path (no helper is written)', make: (w) => path.join(w.root, 'agent-bin') },
  'server.js:auth': { kind: 'make', why: 'THE cookie gate, real (src/auth.js) on the scratch data dir, a password set — the signed-in hub', make: (w) => { const a = new (R('src/auth.js').Auth)(w.data, {}); a.setPassword('census-' + process.pid); return a; } },
  'server.js:hosts': { kind: 'make', why: 'THE machines store (src/hosts.js), real, on the scratch data dir (no machine paired)', make: (w) => new (R('src/hosts.js').HostManager)({ dataDir: w.data }) },
  'server.js:instanceUrl': { kind: 'make', why: 'the instance\'s public address: loopback', make: (w) => standIn(w, 'instanceUrl', { url: () => 'http://127.0.0.1', publicUrl: () => null, status: () => ({}) }) },
  'server.js:integrationsWiring': { kind: 'make', why: 'the integrations store, real (src/server/integration-store.js) on the scratch data dir, no cluster env', make: (w) => ({ store: R('src/server/integration-store.js').create({ dataDir: w.data, env: {}, broadcast: () => {}, log: () => {} }) }) },
  'server.js:unblocker': { kind: 'make', why: 'the /proxy/ unblocker: a pass-through (it serves /proxy/ only; the census asks no proxied page)', make: () => (req, res, next) => next() },
  'server.js:pathMounts': { kind: 'make', why: 'the /svc path mounts: a pass-through handler (no service is mounted)', make: () => ({ handler: (req, res, next) => next() }) },
  'server.js:X_ENV': { kind: 'make', why: 'a pick of cli-env.js create(): the X display env (it probes the box\'s display with programs) — none', make: () => ({}) },
  'server.js:refreshXEnv': { kind: 'make', why: 'a pick of cli-env.js create(): the X env refresh — a no-op', make: () => () => ({}) },
  'server.js:harnessAvailability': { kind: 'inert', why: 'a pick of cli-env.js create(): which agent CLIs this box has (it runs `which`) — the census has none' },
  'src/server/mounts-plugins-wiring.js:hostVersion': { kind: 'make', why: 'the plugin loader\'s host version (read from package.json under the root; the scratch root has none) — the tree\'s own', make: () => R('package.json').version },
  'src/server/mounts-plugins-wiring.js:browserKeeper': { kind: 'make', why: 'THE browser keeper starts Chrome — not in the world: null is the product\'s own branch (keeperOr503: «browser profiles are not available on this server»); the browser routes are swept to that refusal', make: () => null },
  'src/server/mounts-plugins-wiring.js:browserDialogs': { kind: 'make', why: 'the browser dialogs over the keeper — null with it', make: () => null },
  'server.js:designEngine': { kind: 'inert', why: 'the design engine — U2 mounts its routes; the sweep (U3) gives it a seeded stand-in' },
  'server.js:desktopAccess': { kind: 'inert', why: 'the desktop access gate (remote machines\' displays) — no machine is paired' },
  // ── src/server/mounts-plugins-wiring.js ──
  'src/server/mounts-plugins-wiring.js:feedback': { kind: 'eval', why: 'THE feedback store, real, on the scratch data dir' },
  'src/server/mounts-plugins-wiring.js:vault': { kind: 'make', why: 'THE vault, real (vault-engine.js) on the scratch data dir with a light KDF; set up and unlocked by the world', make: (w) => R('src/server/vault-engine.js').create({ dataDir: w.data, kdf: { N: 1024, r: 8, p: 1 }, log: () => {}, idleTimer: false, bcast: () => {} }) },
  'src/server/mounts-plugins-wiring.js:vaultContents': { kind: 'eval', why: 'the Vault window\'s contents, real over the scratch vault' },
  'src/server/mounts-plugins-wiring.js:vaultRun': { kind: 'eval', why: 'the run door, real over the scratch vault' },
  'src/server/mounts-plugins-wiring.js:vaultPaste': { kind: 'eval', why: 'the paste door, real over the scratch vault' },
  'src/server/mounts-plugins-wiring.js:vaultTotp': { kind: 'eval', why: 'the two-step codes, real over the scratch vault' },
  'src/server/mounts-plugins-wiring.js:browserLogins': { kind: 'eval', why: 'the website logins, real over the scratch vault' },
  'src/server/mounts-plugins-wiring.js:automation': { kind: 'eval', why: 'THE automation keys engine, real over the scratch vault' },
  'src/server/mounts-plugins-wiring.js:vaultUseGrants': { kind: 'eval', why: 'the vault\'s use grants, real over THE grants store' },
  'src/server/mounts-plugins-wiring.js:vaultAttention': { kind: 'eval', why: 'the Vault window\'s «needs you» producers, real over THE For-you store' },
  // ── src/server/apps-wiring.js / window-live-wiring.js ──
  'src/server/apps-wiring.js:engine': { kind: 'inert', why: 'the apps engine (apt installs on a machine) — nothing installs in the census' },
  'src/server/window-live-wiring.js:engine': { kind: 'inert', why: 'the window targets engine (leases on live windows) — no window is open' },
  'src/server/window-live-wiring.js:handover': { kind: 'inert', why: 'the desktop handover engine — no desktop is handed over' },
};
const META = new Map();
function metaStore(w) {
  return { read: (id) => (META.has(String(id)) ? { ...META.get(String(id)) } : null), write: (id, m) => { META.set(String(id), { ...(META.get(String(id)) || {}), ...(m || {}) }); return true; } };
}
function jobsOf(w) {
  w.jobs ||= standIn(w, 'jobs', { jobByToken: (t) => (w.jobRows || []).find((j) => j.token === t) || null, get: (id) => (w.jobRows || []).find((j) => j.id === id) || null, list: () => [...(w.jobRows || [])], ready: true });
  return w.jobs;
}

const ROUTES_STATIC = C.routes;
const WORLD = buildWorld({ catalog: CATALOG, routes: ROUTES_STATIC });
{
  const B = WORLD;
  console.log(`    ${B.sites.length} sites mounted in the boot's order; ${B.evaluated.size} wiring names evaluated from their own source`);
  ok(B.sites.length >= 15, `every wiring-time use of a bearer module is a site whose chain reaches server.js (${B.sites.length}: ${[...new Set(B.sites.map((s) => s.u.file))].join(', ')})`);
  const registering = B.broken.filter((b) => b.what === 'route' || /^(register|setup|create|router)/.test(b.what));
  ok(!registering.length, 'no bearer route, and no registering export of a bearer module, is used at a place the boot does not run', registering.map((b) => `${b.tag} — ${b.why}`).join(' | '));
  ok(!B.threw.length, 'every site evaluates without throwing', B.threw.join(' | '));
  ok(!B.demanded.size, 'every construction a site touches is a CATALOG row (eval / make / inert, each with its why)', [...B.demanded].map(([k, v]) => `${k} — ${v}`).join(' | '));
  ok(!SPAWNED.length, 'no program started while the wiring mounted', SPAWNED.slice(0, 8).join(' | '));
  ok(!B.gaps.size, 'no stand-in member read that its row did not give', [...B.gaps].join(' | '));
}
console.log('⑥ the mount (the bearer routes the real wiring registers, against ③\'s static list)');
{
  const V = mountVerdict(WORLD.app, ROUTES_STATIC, TABLE);
  ok(V.mounted.size >= 130 && !V.unmounted.length, `every bearer route the tree registers is MOUNTED by the real wiring (${V.mounted.size} of ${V.want.size})`, V.unmounted.length ? 'gated off by a dep, or its module never mounted: ' + V.unmounted.join(' | ') : '');
  ok(!V.extra.length, 'within the modules ③ found, the real wiring mounts no bearer route ③ did not read (one only a router\'s prefix or a computed path makes)', V.extra.join(' | '));
  ok(!V.regex.length, 'no mounted route is a regex path the doors cannot judge', V.regex.join(' | '));
  ok(!V.unmountedReasonless.length && !V.unmountedStale.length, 'every `unmounted` row says why and names a route that is really unmounted', [...V.unmountedReasonless.map((k) => 'NO WHY ' + k), ...V.unmountedStale.map((k) => 'MOUNTED ' + k)].join(' | '));
  const dead = Object.keys(CATALOG).filter((k) => !WORLD.used.has(k));
  ok(!dead.length, `every CATALOG row is touched by the mount (${Object.keys(CATALOG).length} rows: ${Object.values(CATALOG).filter((r) => r.kind === 'eval').length} eval, ${Object.values(CATALOG).filter((r) => r.kind === 'make').length} make, ${Object.values(CATALOG).filter((r) => r.kind === 'inert').length} inert)`, dead.length ? 'DEAD: ' + dead.join(' | ') : '');
}

console.log('⑦ controls of the world (planted copies, each world on its own scratch root)');
{
  let n = 0;
  const again = (over = {}, { catalog = CATALOG, modules = {}, files = FILES } = {}) => {
    const read = overlay(over);
    const c = census({ files, read, table: TABLE });
    const B = buildWorld({ read, catalog, routes: c.routes, root: scratch(`agent-leak-c${++n}`), modules });
    const mounted = new Set(stackRoutes(B.app._router.stack));
    return { c, B, mounted };
  };
  const MPW = 'src/server/mounts-plugins-wiring.js';
  const mpw = readRepo(MPW);
  const at = mpw.indexOf("setTimeout(() => { try { const n = automation.reconcile();");
  ok(at > 0, 'the automation reconcile line is found in the wiring (the controls\' anchor)');
  // (a) a bearer route written straight into a wiring file: read by ③, mounted by evaluating it where it stands
  const planted = mpw.slice(0, at) + "app.get('/api/agent/planted-wiring', (req, res) => res.json({ live: activeSessions.size, groups: typeof sessionCallerOf }));\n" + mpw.slice(at);
  const a = again({ [MPW]: planted });
  const va = mountVerdict(a.B.app, a.c.routes, TABLE);
  ok(a.c.routes.some((r) => r.path === '/api/agent/planted-wiring' && r.file === MPW) && va.mounted.has('GET /api/agent/planted-wiring') && !va.unmounted.length && !va.extra.length && !a.B.threw.length, 'CONTROL: a bearer route planted IN the wiring file is read by ③ and mounted by the world — ⑥\'s verdict green on it (its handler closes over the wiring\'s own names)', [a.B.threw, va.unmounted, va.extra]);
  // (b) a route its module registers only when a dep is given: the wiring's dep made null ⇒ unmounted ⇒ RED
  const vault = readRepo('src/routes/vault.js');
  const vb = vault.indexOf('}) {', vault.indexOf('function registerVaultRoutes(')) + 4;
  const gated = vault.slice(0, vb) + "\n  if (paste) app.get('/api/agent/planted-gated', (req, res) => res.json({}));" + vault.slice(vb);
  const b = again({ 'src/routes/vault.js': gated }, { modules: { 'src/routes/vault.js': gated }, catalog: { ...CATALOG, [MPW + ':vaultPaste']: { kind: 'make', why: 'the control: the paste door absent', make: () => null } } });
  const vb2 = mountVerdict(b.B.app, b.c.routes, TABLE);
  ok(b.c.routes.some((r) => r.path === '/api/agent/planted-gated') && vb2.unmounted.includes('GET /api/agent/planted-gated'), 'CONTROL: a route gated on a dep the wiring passes null is read by ③ and NOT mounted — ⑥\'s verdict names it (gated off)', vb2.unmounted);
  const vb3 = mountVerdict(b.B.app, b.c.routes, { ...TABLE, routes: { ...(TABLE.routes || {}), 'GET /api/agent/planted-gated': { unmounted: '  ' }, 'GET /api/agent/vault/state': { unmounted: 'a planted stale row' } } });
  ok(vb3.unmountedReasonless.includes('GET /api/agent/planted-gated') && vb3.unmountedStale.includes('GET /api/agent/vault/state'), 'CONTROL: an `unmounted` row with a blank why, and one on a route that IS mounted ⇒ RED', [vb3.unmountedReasonless, vb3.unmountedStale]);
  const b2 = again({ 'src/routes/vault.js': gated }, { modules: { 'src/routes/vault.js': gated } });
  ok(b2.mounted.has('GET /api/agent/planted-gated'), 'CONTROL: the same route with the dep the real wiring passes IS mounted (the planted module copy is the one the wiring loads)');
  // a router mounted under a prefix: the world joins the prefix (a route ③'s literal read cannot see)
  {
    const r = express.Router(); r.get('/planted-sub', (req, res) => res.json({}));
    const x = express(); x.use('/api/agent', r); x.get(/^\/api\/agent\/planted-re$/, (req, res) => res.json({}));
    const vx = mountVerdict(x, [], TABLE);
    ok(vx.extra.includes('GET /api/agent/planted-sub') && vx.regex.length === 1, 'CONTROL: a router mounted under /api/agent serves GET /api/agent/planted-sub (⑥: a mounted route ③ did not read ⇒ RED), a regex route is said as such ⇒ RED', [vx.extra, vx.regex]);
  }
  // (c) a construction with no catalog row ⇒ RED
  const { ['server.js:hosts']: _drop, ...lessCat } = CATALOG;
  const c3 = again({}, { catalog: lessCat });
  ok(c3.B.demanded.has('server.js:hosts'), 'CONTROL: a construction the catalog does not name (server.js:hosts dropped) ⇒ RED', [...c3.B.demanded.keys()]);
  // (d) a registering export used where the boot does not run ⇒ RED
  const late = mpw.slice(0, at) + "const plantedLate = () => require('../routes/vault.js').registerVaultRoutes(app, { vault });\n" + mpw.slice(at);
  const d = again({ [MPW]: late });
  ok(d.B.broken.some((x) => x.what === 'registerVaultRoutes' && /no top-level declaration/.test(x.why)), 'CONTROL: a registering export called inside a function the boot never runs ⇒ RED (the site\'s chain is broken)', d.B.broken.map((x) => x.tag));
  // (e) a site that starts a program ⇒ refused and RED
  const sp0 = SPAWNED.length;
  const srv = readRepo('server.js');
  const ed = srv.indexOf("require('./src/routes/editor.js').registerEditorRoutes(app, { activeSessions,");
  ok(ed > 0, 'the editor routes\' mount is found in server.js (the controls\' anchor)');
  const spawny = srv.slice(0, ed) + srv.slice(ed).replace('registerEditorRoutes(app, { activeSessions,', "registerEditorRoutes(app, { planted: require('child_process').execFileSync('true'), activeSessions,");
  const e = again({ 'server.js': spawny });
  ok(SPAWNED.length > sp0 && e.B.threw.some((t) => /no program runs/.test(t)), 'CONTROL: a site that starts a program is refused and RED (the world starts none)', e.B.threw);
  SPAWNED.length = sp0;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
