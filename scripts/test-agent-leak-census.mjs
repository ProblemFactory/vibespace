#!/usr/bin/env node
// THE HUB-LEVEL LEAK CENSUS (B-1fe9, lane lg-leak-census, 2026-11-17). Per-suite route censuses (test-vault-law ⑨,
// test-vault-paste ⑩c) mount ONE routes module with a hand-kept subset of the deps its wiring passes: a leaking agent
// route gated on a missing dep, a route added in a wiring file itself, or an agent route in a module no vault suite
// mounts goes unseen. This census reads the hub's routes off the REAL wiring. Fast tier: acorn over the hub tree
// (server.js + src/, src/lib/ excluded — a page module registers no route), comments never count.
//   THE BEARERS: a conversation's session token (vsst_), a Background Work job's token (jbt_) and the maintainer key
//   (vsmk_, POST /api/agent/automation/:verb — an instance's env sha). An automation key's VALUE (vsak_) is never a
//   bearer: it is a vault entry; a conversation uses a key it was granted by id, with its own vsst_. The census reads
//   the SIGNED-IN hub (a hub nobody signs in to opens every route to anyone — the `!enabled` door of src/door.js, said, not swept),
//   and the gate's doors only (src/door.js's door class and src/auth.js's middleware, since the separation's B3a): the WebSocket upgrade dispatcher and the hub's side listeners (the CDP mediator,
//   the egress proxy, the metrics port) are other doors, judged by their own code.
//   ① THE DOORS: every `if` of the door class (src/door.js) and of src/auth.js's middleware whose consequent calls next() (`return next()`, a block around it,
//      `next(); return;`) is a door — and every next() the middleware calls must sit in one — each one CLASSIFIED in
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
//      its why, none untouched); no program starts (child_process is patched on its CJS module object: every require of
//      it is caught; an ESM named import keeps its own binding — only the suite's own helpers import so). A name a
//      handler touches only when a request comes is the sweep's.
//   ⑥ THE MOUNT: within the modules ③ found, the bearer routes the real wiring serves (a router's mount prefix joined)
//      = ③'s static list, both ways — a route gated off by a dep, one only a prefix or a computed path makes, a regex
//      path = RED. A router module (browser, apps, window-targets) registers when it loads: its gating is in its
//      handlers (the sweep's).
//   ⑧ THE SWEEP (U3, run before ⑦): two conversations — A asks, B owns what is planted THROUGH THE REAL WRITERS (B's
//      progress, B's job and A's on the real jobs engine, B's page — by their own tokens on the real routes —, a For-you
//      item, B's meta under its socket, a feedback report; the vault set up with B's secret and an ungranted website
//      login). Every mounted bearer route × five callers (A's vsst_, A's job's jbt_, the maintainer key vsmk_, a vsak_
//      value no door knows, no bearer), its params and a probe bag naming B's ids (never a sentinel — no echo can make a
//      hit); a row may send its own bodies naming B's things (`$B.<id>`). Then THE GRANTED KEY (a key minted through the
//      real engine, every verb, granted to A, each verb aimed at B — its arguments derived from the door's own refusals)
//      and THE RELATED PASS (A put in B's Task Group, every read again). Every answer (body + headers) is scanned for each
//      sentinel raw / hex / URI-encoded / base64 and base64url at every byte offset. One verdict function over the answers
//      and the table: `findings` (a hit; a blank why is no row), `shallow` (a crash, or a 5xx to A — by prefix, counted),
//      `shape` (A's 400: the request's shape refused before any reach — by prefix, counted), `deep` (the routes A takes
//      past their door, pinned both ways), `open` (2xx to no bearer), `anonymous` (a refusal to an unknown caller saying
//      more than its own words), `refused` (a program a handler would start) — a new entry or a dead row = RED, each
//      kind with a RED control over a planted table; no CRITICAL sentinel reaches A by any road, rowed or not.
//      SCOPE: 136 routes, 108 past their door (28 shallow), A and B unrelated except in the related pass, one granted
//      key with the default reach. Positive controls: A in B's group reads B's progress; ⑦'s planted wiring route
//      answering B's name and a secret base64-encoded inside JSON is seen (NEW, CRITICAL).
//   ⑦ CONTROLS of the world (last: every world shares the require cache, so a control's setup() re-points a router
//      module's context): a route planted IN a wiring file is mounted and ⑥ is green on it; a dep-gated route is
//      unmounted when the wiring passes null (⑥ names it) and mounted with the real dep; a router under a prefix and a
//      regex route are read as such; a blank or stale `unmounted` row, a construction with no row, a registering export
//      used where the boot never runs, a site that starts a program ⇒ each RED. A site runs without the try / if around
//      it in the wiring: the world shows what the boot CAN mount (it errs toward more routes, never fewer).
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this suite runs on a temp home of its own before any of its code
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { trackedFiles } from './tracked-files.mjs';
import { scratch, scratchHome, fixtureSid } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(REPO, 'package.json'));
const acorn = require('acorn');
const TABLE_REL = 'scripts/fixtures/agent-leak-census.json';
const TABLE = JSON.parse(fs.readFileSync(path.join(REPO, TABLE_REL), 'utf-8'));
let pass = 0, fail = 0;
// each part's own time, said (the hosted fast job warned of 12.3 s over the tier's 10 s, 2.369.410's close): said, never judged
const lap = (() => { let t = performance.now(); return (what) => { const n = performance.now(); console.log(`    (${what}: ${Math.round(n - t)} ms)`); t = n; }; })();
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
// B-7e49: a text's newline offsets, found ONCE (keyed by the text itself) — a line number is a binary search over them. The old
// form sliced and split the whole text before the place at every ask (every member call of a wiring file, every sort compare)
const NL = new Map();
const lineAt = (src, i) => {
  if (typeof src !== 'string' || !Number.isInteger(i) || i < 0) return src.slice(0, i).split('\n').length;   // a shape no AST gives: the old form
  let nl = NL.get(src);
  if (!nl) { nl = []; for (let j = src.indexOf('\n'); j !== -1; j = src.indexOf('\n', j + 1)) nl.push(j); NL.set(src, nl); }
  let lo = 0, hi = nl.length;   // the newlines BEFORE i (the old slice(0, i) held offsets 0 … i - 1)
  while (lo < hi) { const m = (lo + hi) >>> 1; if (nl[m] < i) lo = m + 1; else hi = m; }
  return lo + 1;
};

/** THE GATE'S DOORS. Since the separation's B3a they stand in TWO places: the door class (src/door.js doorClassOf — the
 *  middleware's door lines lifted verbatim: there `return next()` lets a request through its door, `return OPEN` the open
 *  instance, `return LOGIN` the login flow — every class auth.js PASSES), and what src/auth.js's middleware still passes itself
 *  (the cookie's check; its `PASSES.has(d.kind)` is the class's own pass, read through src/door.js). One file's doors: every
 *  `if (<cond>)` whose consequent lets the request through → [{ cond, line, test, file }], where `test` = { kind: 'prefix' |
 *  'exact', path } when the cond is ONE path test the census can read, else null. */
function doorsOf(src, file = 'src/auth.js', { fn = null, method = 'middleware', passes = [], skip = () => false } = {}) {
  const ast = parse(src);
  if (!ast) return { doors: null, why: `${file} does not parse` };
  let body = null;
  walk(ast, (n) => {
    if (body) return;
    if (fn && n.type === 'FunctionDeclaration' && n.id && n.id.name === fn) body = n.body;
    else if (!fn && n.type === 'MethodDefinition' && n.key && n.key.name === method) body = n.value.body;
  });
  if (!body) return { doors: null, why: fn ? `no ${fn}() function in ${file}` : `no ${method}() method in ${file}` };
  const doors = [], nexts = [], skipped = [];
  const isNextCall = (e) => e && e.type === 'CallExpression' && e.callee.type === 'Identifier' && e.callee.name === 'next';
  const isPass = (e) => isNextCall(e) || (!!e && e.type === 'Identifier' && passes.includes(e.name));
  // every `next()` the function calls (in any shape: `return next()`, `next(); return;`, `cond && next()`, …)
  walk(body, (n) => { if (isNextCall(n)) nexts.push(n.start); });
  // a DOOR = an `if` whose consequent itself lets the request through — `return next();` (or a pass class), or a block that
  // does it among other statements (`{ log(); return next(); }`, `{ next(); return; }`) — never one only a nested function or `if` reaches
  const callsNext = (st) => !!st && ((st.type === 'ReturnStatement' && isPass(st.argument)) || (st.type === 'ExpressionStatement' && isNextCall(st.expression)));
  walk(body, (n) => {
    if (n.type !== 'IfStatement') return;
    const c = n.consequent;
    if (!(callsNext(c) || (c.type === 'BlockStatement' && c.body.some(callsNext)))) return;
    const t = n.test, cond = squash(src.slice(t.start, t.end));
    if (skip(cond)) { skipped.push({ start: c.start, end: c.end }); return; }
    let test = null;
    if (t.type === 'CallExpression' && t.callee.type === 'MemberExpression' && !t.callee.computed && t.callee.object.type === 'Identifier' && t.callee.object.name === 'p'
      && t.callee.property.name === 'startsWith' && t.arguments.length === 1 && t.arguments[0].type === 'Literal' && typeof t.arguments[0].value === 'string') test = { kind: 'prefix', path: t.arguments[0].value };
    else if (t.type === 'BinaryExpression' && t.operator === '===' && t.left.type === 'Identifier' && t.left.name === 'p' && t.right.type === 'Literal' && typeof t.right.value === 'string') test = { kind: 'exact', path: t.right.value };
    doors.push({ cond, line: lineAt(src, n.start), test, start: c.start, end: c.end, file });
  });
  // a next() that no door's consequent holds is a pass the census cannot place (RED)
  const unplaced = nexts.filter((at) => !doors.some((d) => at >= d.start && at < d.end) && !skipped.some((d) => at >= d.start && at < d.end)).map((at) => `${file}:${lineAt(src, at)}`);
  return { doors, unplaced };
}
/** the gate's doors over a tree: the door class's, then what auth.js's middleware passes itself (see doorsOf) */
function gateDoors(read) {
  const a = doorsOf(read('src/door.js'), 'src/door.js', { fn: 'doorClassOf', passes: ['OPEN', 'LOGIN'] });
  const b = doorsOf(read('src/auth.js'), 'src/auth.js', { method: 'middleware', skip: (cond) => cond === 'PASSES.has(d.kind)' });
  if (!a.doors || !b.doors) return { doors: null, why: a.why || b.why };
  return { doors: [...a.doors, ...b.doors], unplaced: [...a.unplaced, ...b.unplaced] };
}

const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'use']);
const RECV = /^(app|router)$/;
/** Every route registration in `files`: rows [{ file, line, verb, method, path }] (one per path), dynamic
 *  [{ key, file, line }] (`<file> <recv>.<verb>(<first arg>)` — the table's key, line-free), requires: file → Set(file). */
const PER_FILE = new Map();   // file → (its text → what it registers and requires) — a control re-walks only its planted file. Two levels,
//   the text ITSELF the inner key (B-7e49): a joined «file\0text» key was a fresh copy of the whole file to hash at every ask
function fileFacts(f, src) {
  let byText = PER_FILE.get(f);
  if (!byText) PER_FILE.set(f, (byText = new Map()));
  if (byText.has(src)) return byText.get(src);
  const ast = parse(src);
  if (!ast) { byText.set(src, null); return null; }
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
  byText.set(src, out);
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
  const D = gateDoors(read);
  out.doorsWhy = D.why || null;
  const doorRows = table.doors || {};
  out.unplaced = D.unplaced || [];
  if (D.doors) {
    out.doors = D.doors;
    const conds = new Set(D.doors.map((d) => d.cond));
    for (const d of D.doors) {
      if (!has(doorRows, d.cond)) { out.doorUnclassified.push(`${d.file}:${d.line} if (${d.cond}) … next()`); continue; }
      const v = String(doorRows[d.cond] || '');
      if (v === 'bearer') { if (d.test) out.bearerDoors.push(d); else out.bearerUnreadable.push(`${d.file}:${d.line} ${d.cond}`); }
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

console.log('① the doors (the door class src/door.js and src/auth.js\'s middleware — every `if` whose consequent lets a request through)');
ok(!C.doorsWhy && C.doors.length >= 10, `the middleware's doors are read (${C.doors.length})`, C.doorsWhy);
ok(!C.unplaced.length, 'every next() the middleware calls sits in a door the census reads (any shape: `return next()`, a block around it, `next(); return;`)', C.unplaced.join(' | '));
ok(!C.doorUnclassified.length, 'every door is classified in the table (`bearer` or `other: <why>`)', C.doorUnclassified.length ? 'NEW — add each to ' + TABLE_REL + ' doors: ' + C.doorUnclassified.join(' | ') : '');
ok(!C.doorDead.length && !C.doorReasonless.length, 'no dead door row, no `other` without its why', [...C.doorDead.map((c) => 'DEAD ' + c), ...C.doorReasonless.map((c) => 'NO WHY ' + c)].join(' | '));
ok(!C.bearerUnreadable.length && C.bearerDoors.length >= 2, `every bearer door is a path test the census reads (${C.bearerDoors.map((d) => (d.test.kind === 'prefix' ? d.test.path + '*' : d.test.path)).join(', ')})`, C.bearerUnreadable.join(' | '));
ok(C.bearerDoors.some((d) => d.test.kind === 'prefix' && d.test.path === '/api/agent/'), 'the agent prefix /api/agent/ is a bearer door');
if (C.doors.some((d) => d.cond === '!enabled')) console.log('    said, not swept: on a hub nobody signs in to (`!enabled`, the door class), every route is open to any caller — this census reads the signed-in hub');
{
  // THE CLASSES THE GATE LETS THROUGH ARE PINNED (主开发 r1341 4): src/auth.js PASSES is exactly door / open / login — the three this
  // census reads in src/door.js (`return next()` = a door, `return OPEN`, `return LOGIN`) — and doorClassOf returns no pass class
  // any other way (a door written `return DOOR` would pass the census unseen; so would a fourth class added to PASSES)
  const passPin = (authSrc, doorSrc) => {
    const passes = ((authSrc.match(/const PASSES = Object\.freeze\(new Set\(\[([^\]]*)\]\)\)/) || [])[1] || '').split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean).sort();
    const ast = parse(doorSrc); let body = null; const returned = new Set();
    if (ast) walk(ast, (n) => { if (!body && n.type === 'FunctionDeclaration' && n.id && n.id.name === 'doorClassOf') body = n.body; });
    if (body) walk(body, (n) => { if (n.type === 'ReturnStatement' && n.argument && n.argument.type === 'Identifier') returned.add(n.argument.name); });
    return { ok: JSON.stringify(passes) === JSON.stringify(['door', 'login', 'open']) && !!body && [...returned].every((r) => ['OPEN', 'LOGIN', 'PAGE'].includes(r)), passes, returned: [...returned].sort() };
  };
  const A = readRepo('src/auth.js'), D = readRepo('src/door.js'), real = passPin(A, D);
  ok(real.ok, `the gate lets through exactly ${real.passes.join(' / ')} (src/auth.js PASSES), and the door class returns no pass class but through next() / OPEN / LOGIN (it returns ${real.returned.join(', ')})`, real);
  const fourth = passPin(A.replace("new Set(['door', 'open', 'login'])", "new Set(['door', 'open', 'login', 'page'])"), D);
  const asDoor = passPin(A, D.replace("if (p.startsWith('/api/agent/')) return next();", "if (p.startsWith('/api/agent/')) return DOOR;"));
  ok(!fourth.ok && !asDoor.ok, `CONTROLS: a fourth class in PASSES (${fourth.passes.join(', ')}) and a door returned as DOOR (${asDoor.returned.join(', ')}) are each RED`, { fourth, asDoor });
}

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
  ok(!C.unreached.length, 'every module holding a bearer route is LOADED by the hub (reached from server.js through its requires; mounted is ⑦\'s proof)', C.unreached.join(' '));
  ok(!C.routeDead.length && !C.routeReasonless.length, `every \`routes\` row names a bearer route that exists, every skip says why (${Object.keys(TABLE.routes || {}).length} rows)`, [...C.routeDead.map((k) => 'DEAD ' + k), ...C.routeReasonless.map((k) => 'NO WHY ' + k)].join(' | '));
  if (C.twice.length) console.log('    the same method + path registered twice: ' + C.twice.join(' · '));
}

// ── ④ CONTROLS ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ controls (the census over planted copies — the tree is never written)');
const overlay = (over) => (f) => (has(over, f) ? over[f] : readRepo(f));
{
  // a new door: a path test the table does not classify
  const auth = readRepo('src/door.js');   // the doors' own file since the separation's B3a (the door class)
  const at = auth.indexOf("if (p.startsWith('/api/agent/')) return next();");
  ok(at > 0, 'the agent door is found in src/door.js (the controls\' anchor)');
  const planted = auth.slice(0, at) + "if (p.startsWith('/api/planted/')) return next();\n      " + auth.slice(at);
  const c1 = census({ files: FILES, read: overlay({ 'src/door.js': planted }), table: TABLE });
  ok(c1.doorUnclassified.length === 1 && /\/api\/planted\//.test(c1.doorUnclassified[0]), 'CONTROL: a planted door the table does not name ⇒ RED (unclassified)', c1.doorUnclassified);
  const c1b = census({ files: FILES, read: overlay({ 'src/door.js': planted }), table: { ...TABLE, doors: { ...TABLE.doors, "p.startsWith('/api/planted/')": 'bearer' } } });
  ok(c1b.bearerDoors.some((d) => d.test.path === '/api/planted/') && !c1b.doorUnclassified.length, 'CONTROL: classified `bearer`, the planted door joins the sweep\'s doors');
  const c1c = census({ files: FILES, read: overlay({ 'src/door.js': planted.replace("if (p.startsWith('/api/planted/'))", "if (/^\\/api\\/planted\\//.test(p))") }), table: { ...TABLE, doors: { ...TABLE.doors, '/^\\/api\\/planted\\//.test(p)': 'bearer' } } });
  ok(c1c.bearerUnreadable.length === 1, 'CONTROL: a `bearer` door written as a regex the census cannot read ⇒ RED', c1c.bearerUnreadable);
  const blockDoor = auth.slice(0, at) + "if (p.startsWith('/api/planted-block/')) { req.planted = 1; return next(); }\n      if (p === '/api/planted-tail') { next(); return; }\n      " + auth.slice(at);
  const c1d = census({ files: FILES, read: overlay({ 'src/door.js': blockDoor }), table: TABLE });
  ok(c1d.doorUnclassified.length === 2 && c1d.doorUnclassified.every((x) => /planted-(block|tail)/.test(x)), 'CONTROL: a door written as a block with more statements, and one as `next(); return;` ⇒ each read and RED (unclassified)', c1d.doorUnclassified);
  const loose = auth.slice(0, at) + "p === '/api/planted-loose' && next();\n      " + auth.slice(at);
  const c1e = census({ files: FILES, read: overlay({ 'src/door.js': loose }), table: TABLE });
  ok(c1e.unplaced.length === 1, 'CONTROL: a next() no door holds (`cond && next()`) ⇒ RED (unplaced)', c1e.unplaced);
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
lap('①–④ the static census');
console.log('⑤ the world (the hub\'s real wiring, evaluated in-process over a scratch root)');
const WIRING = new Set(FILES.filter((f) => f === 'server.js' || /^src\/server\/[a-z0-9-]+-wiring\.js$/.test(f)));
// A FIXTURE CARRIER RE-HOMES ITS OWN PROCESS (test-fixture-isolation (c): this suite mints session ids with fixtureSid): the
// real home's project list is read BEFORE the re-home, HOME and os.homedir point at a scratch home before any product code
// loads, a signal ends the run through 'exit' (the scratch dirs' own removal), and the last leg proves the real
// ~/.claude/projects gained no fixture entry
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const HOME = scratchHome('agent-leak-home');
const ROOT = scratch('agent-leak'); fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
const cleanup = () => { for (const d of [HOME, ROOT]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
os.homedir = () => HOME;
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
const AST = new Map();   // file → (its text → its AST): two levels, as PER_FILE (B-7e49)
const astOf = (f, read = readRepo) => { const s = read(f); let byText = AST.get(f); if (!byText) AST.set(f, (byText = new Map())); if (!byText.has(s)) byText.set(s, parse(s)); return byText.get(s); };
function walkA(n, fn, anc = []) {
  if (!n || typeof n.type !== 'string') return;
  if (fn(n, anc) === false) return;
  const next = [...anc, n];
  for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach((x) => walkA(x, fn, next)); else if (v && typeof v.type === 'string') walkA(v, fn, next); }
}
/** B-7e49: what the wiring model asks of an AST again and again (every bearer module's uses in every wiring file, every chain's
 *  export, every route line, in every world) read off ONE walkA of it: its VariableDeclarators, its CallExpressions (each with
 *  the ancestor list walkA hands it) and its AssignmentExpressions, in walkA's order — the same nodes, the same lists, a list
 *  read instead of a new walk (no reader of these prunes: each of its walks visited every node) */
const INDEXED = new WeakMap();
const NO_AST = Object.freeze({ decls: [], calls: [], assigns: [] });
function indexOf(ast) {
  if (!ast || typeof ast !== 'object') return NO_AST;
  let x = INDEXED.get(ast);
  if (!x) {
    x = { decls: [], calls: [], assigns: [] };
    walkA(ast, (n, anc) => { if (n.type === 'VariableDeclarator') x.decls.push(n); else if (n.type === 'CallExpression') x.calls.push([n, anc]); else if (n.type === 'AssignmentExpression') x.assigns.push(n); });
    INDEXED.set(ast, x);
  }
  return x;
}
const FNS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const KNOWN = new Set(FILES);
const resolveSpec = (f, sp) => { const base = path.posix.normalize(path.posix.join(path.posix.dirname(f), sp)); return [base, base + '.js', base + '/index.js'].find((c) => KNOWN.has(c)) || null; };
const reqOf = (n, f) => (n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments[0] && n.arguments[0].type === 'Literal' && typeof n.arguments[0].value === 'string' && /^\./.test(n.arguments[0].value) ? resolveSpec(f, n.arguments[0].value) : null);

/** a wiring model over { read } (the controls overlay planted copies) */
function wiringModel(read) {
  const src = (f) => read(f);
  const text = (f, n) => src(f).slice(n.start, n.end);
  const lineOfAt = (f, i) => lineAt(src(f), i);
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
      for (const n of indexOf(ast).decls) {
        if (!n.init) continue;
        if (n.id.type === 'Identifier' && reqOf(n.init, W) === M) alias.set(n.id.name, '*');
        else if (n.id.type === 'Identifier' && n.init.type === 'MemberExpression' && reqOf(n.init.object, W) === M) alias.set(n.id.name, n.init.property.name);
        else if (n.id.type === 'ObjectPattern' && reqOf(n.init, W) === M) for (const p of n.id.properties) if (p.type === 'Property' && p.value.type === 'Identifier') alias.set(p.value.name, p.key.name || p.key.value);
      }
      const usesM = (e) => {
        if (!e) return null;
        if (e.type === 'MemberExpression' && !e.computed && reqOf(e.object, W) === M) return e.property.name;
        if (e.type === 'MemberExpression' && !e.computed && e.object.type === 'Identifier' && alias.get(e.object.name) === '*') return e.property.name;
        if (e.type === 'Identifier' && alias.has(e.name) && alias.get(e.name) !== '*') return alias.get(e.name);
        return null;
      };
      for (const [n, anc] of indexOf(ast).calls) {
        let what = usesM(n.callee), via = 'call';
        if (!what && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'use' && n.callee.object.type === 'Identifier' && n.callee.object.name === 'app') for (const a of n.arguments) { const w = usesM(a); if (w) { what = w; via = 'app.use'; } }
        if (what) out.push({ file: W, node: n, anc, fnAnc: [...anc].reverse().find((a) => FNS.has(a.type)) || null, what, via, of: M });
      }
    }
    usesMemo.set(M, out);
    return out;
  }
  function exportedAs(W, fname) {
    let name = null;
    for (const n of indexOf(astOf(W, read)).assigns) if (text(W, n.left) === 'module.exports' && n.right.type === 'ObjectExpression') for (const p of n.right.properties) if (p.type === 'Property' && p.value.type === 'Identifier' && p.value.name === fname) name = p.key.name || p.key.value;
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
function assignmentIn(blockAnc, name) {
  let hit = null;   // { rhs, anc }: evaluated WHERE IT STANDS (a try block's own consts are visible there)
  const block = blockAnc[blockAnc.length - 1];
  for (const st of block.body || []) walkA(st, (n, anc) => { if (hit || FNS.has(n.type)) return false; if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier' && n.left.name === name) hit = { rhs: n.right, anc: [...blockAnc, ...anc, n] }; }, []);
  return hit;
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
  const demanded = new Map(), gaps = new Set(), used = new Set(), threw = [], evaluated = new Set(), dirnameReads = new Set();
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
      if (name === '__dirname' && f !== 'server.js') dirnameReads.add(f);   // the real tree's folder: never a data path (⑤ says so)
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
        let init = d.init, initAnc = d.anc;
        if (d.kind === 'var' && (!init || (LITERALISH.has(init.type) && (init.type !== 'Identifier' || init.name === 'undefined')))) { const late = assignmentIn(d.anc, name); if (late) { init = late.rhs; initAnc = late.anc; } }
        if (!init) v = undefined;
        else {
          const c = constructsIn(d.file, init, WM.text);
          if (c && !has(catalog, key)) { demanded.set(key, `constructs ${squash(c).slice(0, 90)} (declared at ${d.file} line ${WM.lineOfAt(d.file, init.start)})`); v = undefined; }
          else {
            if (c) used.add(key);
            // one construction per declaration: every pick of `const { a, b } = create(…)` reads the same value
            const wk = `${d.file}\0${d.node.start}\0init`;
            const whole = d.kind === 'pick' && memo.has(wk) ? memo.get(wk) : evalIn(d.file, initAnc, chainRest, '(' + WM.text(d.file, init) + ')');
            if (d.kind === 'pick') memo.set(wk, whole);
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
    for (const [n, anc] of indexOf(astOf(W, read)).calls) {
      if (n.callee.type !== 'MemberExpression' || !lines.has(WM.lineOfAt(W, n.start)) || !RECV.test(WM.text(W, n.callee.object))) continue;
      const u = { file: W, node: n, anc, fnAnc: [...anc].reverse().find((a) => FNS.has(a.type)) || null, what: 'route', via: 'route' };
      const ch = WM.chainOf(u);
      const tag = `${W}:${WM.lineOfAt(W, n.start)} ${WM.text(W, n.callee)}(${squash(WM.text(W, n.arguments[0])).slice(0, 60)}, …)`;
      if (Array.isArray(ch)) sites.push({ u, ch, tag }); else broken.push({ tag, why: ch.broken, what: 'route', of: W });
    }
  }
  // (iii) every top-level `app.use(…)` of server.js: the middleware in front of the routes (the cookie gate, the body
  // parser, the routers between), in the boot's order — express runs them in registration order
  for (const st of astOf('server.js', read).body) {
    const n = st.type === 'ExpressionStatement' ? st.expression : null;
    if (!n || n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed || n.callee.property.name !== 'use' || WM.text('server.js', n.callee.object) !== 'app') continue;
    const u = { file: 'server.js', node: n, anc: [astOf('server.js', read), st], fnAnc: null, what: 'use', via: 'middleware' };
    sites.push({ u, ch: [u], tag: `server.js:${WM.lineOfAt('server.js', n.start)} app.use(${squash(WM.text('server.js', n.arguments[0])).slice(0, 50)}…)`, middleware: true });
  }
  // (iv) every wiring-time write of server.js to app.locals — `app.locals.<x> = …` and `Object.defineProperty(app.locals, …)`
  // (a route reads what the boot put there: the authEnabled getter, safeFs…), at its top level or inside a block / if
  // there (never inside a function: that one runs when called)
  walkA(astOf('server.js', read), (n, anc) => {
    if (FNS.has(n.type)) return false;
    if (n.type !== 'ExpressionStatement') return;
    const e = n.expression;
    const isAssign = e.type === 'AssignmentExpression' && /^app\.locals\./.test(WM.text('server.js', e.left));
    const isDefine = e.type === 'CallExpression' && WM.text('server.js', e.callee) === 'Object.defineProperty' && e.arguments[0] && WM.text('server.js', e.arguments[0]) === 'app.locals';
    if (!isAssign && !isDefine) return;
    const u = { file: 'server.js', node: e, anc: [...anc, n], fnAnc: null, what: 'locals', via: 'locals' };
    sites.push({ u, ch: [u], tag: `server.js:${WM.lineOfAt('server.js', e.start)} ${squash(WM.text('server.js', e)).slice(0, 60)}`, middleware: true });
  });
  // a site that is the right side of an assignment runs AS the assignment (`app.locals.vaultGate = …vaultGate(…)`)
  for (const s0 of sites) { const par = s0.u.anc[s0.u.anc.length - 1]; if (par && par.type === 'AssignmentExpression' && par.right === s0.u.node) s0.u = { ...s0.u, node: par, anc: s0.u.anc.slice(0, -1) }; }
  // the boot's order: by the server.js line each chain ends at, then the site's own place
  const order = (s) => WM.lineOfAt('server.js', s.ch[s.ch.length - 1].node.start) * 1e6 + (s.ch.length > 1 ? s.u.node.start : 0);
  sites.sort((a, b) => order(a) - order(b));
  for (const s of sites) {
    try { evalIn(s.u.file, s.u.anc, s.ch.slice(1), WM.text(s.u.file, s.u.node)); }
    catch (e) { threw.push(`${s.tag} — ${String((e && e.message) || e).slice(0, 200)}`); }
  }
  return { world, app, sites, broken, threw, demanded, gaps, used, evaluated, dirnameReads };
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
  'server.js:spendGuard': { kind: 'make', why: 'THE SPEND CEILING: the census spends nothing — every authorize refuses by name', make: (w) => standIn(w, 'spendGuard', { authorize: () => ({ ok: false, allowed: false, code: 'census_no_spend', reason: 'the census starts no turn' }), note() {}, release() {}, reservationState: () => null, waitingReservations: () => [], nudgeRec: () => null }) },
  'server.js:jobsWiring': { kind: 'make', why: 'THE Background Work engine, real (src/jobs.js JobManager) on the scratch data dir — its timers cleared, its spawn stubbed (a run is recorded, nothing starts)', make: (w) => {
    const jm = new (R('src/jobs.js').JobManager)({ dataDir: path.join(w.data, 'jobs'), broadcast() {}, log() {}, notifyUser() {}, deliverToConversation: async () => ({ ok: true, lane: 'message' }), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true });
    jm.init(); for (const t of jm._timers || []) clearInterval(t);
    jm._spawn = (job, trigger) => { job.runs = job.runs || []; job.runs.push({ startedAt: Date.now(), trigger }); job.state = 'up'; };
    return { jm, getJobs: () => jm };
  } },
  'server.js:deliver': { kind: 'eval', why: 'THE delivery ladder, real (conversation-deliver.js) on the scratch data dir and the scratch HOME — every spend it asks is refused by the census\'s spend ceiling, no machine is paired' },
  'server.js:AGENT_BIN_DIR': { kind: 'make', why: 'agent-tool-generators create()\'s bin dir: a scratch path (no helper is written)', make: (w) => path.join(w.root, 'agent-bin') },
  'server.js:auth': { kind: 'make', why: 'THE cookie gate, real (src/auth.js) on the scratch data dir, a password set — the signed-in hub', make: (w) => { const a = new (R('src/auth.js').Auth)(w.data, {}); a.setPassword('census-' + process.pid); return a; } },
  'server.js:hosts': { kind: 'make', why: 'THE machines store (src/hosts.js), real, on the scratch data dir (no machine paired)', make: (w) => new (R('src/hosts.js').HostManager)({ dataDir: w.data }) },
  // the Task Groups' ctx sync (task-groups-wiring.js ctxSync — moved out of server.js by «make room»): two picks of ONE construction
  'server.js:scheduleCtxSync': { kind: 'eval', why: 'a pick of task-groups-wiring.js ctxSync(), real: the remote ctx-folder sync — no session runs on a machine, so it syncs nothing (its 60 s timer never fires in the suite\'s seconds)' },
  'server.js:remoteCtxBaseFor': { kind: 'eval', why: 'the same ctxSync()\'s other pick: a remote session\'s ctx-folder base — none is remote' },
  'server.js:convOps': { kind: 'make', why: 'a pick of task-groups-wiring.js mountRoutes() (a wiring function — never evaluated whole): the conversation-ops module itself, its seam provided as the boot provides it there (conversation-ops.provide({ tasks, spendGuard }) — the real Task Groups store and the census\'s spend ceiling), so a conversation verb answers from a ready module', make: (w) => { const m = R('src/server/conversation-ops.js'); m.provide({ tasks: w.value('server.js', 'tasks'), spendGuard: w.value('server.js', 'spendGuard') }); return m; } },
  'server.js:instanceUrl': { kind: 'make', why: 'the instance\'s public address: loopback', make: (w) => standIn(w, 'instanceUrl', { url: () => 'http://127.0.0.1', publicUrl: () => null, status: () => ({}) }) },
  'server.js:integrationsWiring': { kind: 'make', why: 'the integrations store, real (src/server/integration-store.js) on the scratch data dir, no cluster env', make: (w) => ({ store: R('src/server/integration-store.js').create({ dataDir: w.data, env: {}, broadcast: () => {}, log: () => {} }) }) },
  'server.js:unblocker': { kind: 'make', why: 'the /proxy/ unblocker: a pass-through (it serves /proxy/ only; the census asks no proxied page)', make: () => (req, res, next) => next() },
  'server.js:pathMounts': { kind: 'make', why: 'the /svc path mounts: a pass-through handler (no service is mounted)', make: () => ({ handler: (req, res, next) => next() }) },
  'server.js:X_ENV': { kind: 'make', why: 'a pick of cli-env.js create(): the X display env (it probes the box\'s display with programs) — none', make: () => ({}) },
  'server.js:refreshXEnv': { kind: 'make', why: 'a pick of cli-env.js create(): the X env refresh — a no-op', make: () => () => ({}) },
  'server.js:fallbackFactOf': { kind: 'make', why: 'a pick of usage-pool-engine.js create() (B-d578 r3918): the conversation\'s own fallback fact, read only by the live payload of the page\'s /ws (no client here) — no census conversation is on a pool\'s fallback: null', make: () => () => null },
  'server.js:harnessAvailability': { kind: 'inert', why: 'a pick of cli-env.js create(): which agent CLIs this box has (it runs `which`) — the census has none' },
  'src/server/mounts-plugins-wiring.js:hostVersion': { kind: 'make', why: 'the plugin loader\'s host version (read from package.json under the root; the scratch root has none) — the tree\'s own', make: () => R('package.json').version },
  'src/server/mounts-plugins-wiring.js:browserKeeper': { kind: 'make', why: 'THE browser keeper starts Chrome — not in the world: null is the product\'s own branch (keeperOr503: «browser profiles are not available on this server»); the browser routes are swept to that refusal', make: () => null },
  'src/server/mounts-plugins-wiring.js:browserDialogs': { kind: 'make', why: 'the browser dialogs over the keeper — null with it', make: () => null },
  'server.js:designEngine': { kind: 'eval', why: 'THE design engine, real (design-engine.js) on the scratch data dir' },
  'server.js:sendUserInput': { kind: 'make', why: 'THE typing path into a running CLI: a recorder (no CLI runs in the census)', make: (w) => (...a) => { (w.typed ||= []).push(a.length); return { ok: false, code: 'census_no_cli' }; } },
  'server.js:broadcastToSession': { kind: 'eval', why: 'the per-session broadcast, real (session-broadcast.js) — no client listens' },
  'server.js:decisionEngine': { kind: 'inert', why: 'a pick of mounts-plugins-wiring create() (the whole wiring — never evaluated whole): the decision API, no judgment is asked' },
  'server.js:mounts': { kind: 'inert', why: 'a pick of mounts-plugins-wiring create(): the mount manager — no storage is mounted' },
  'server.js:telemetry': { kind: 'inert', why: 'the telemetry recorder — nothing is reported' },
  // the manager stack (lane conversation-facts, restacked onto int411): conversations.list's in-memory sources (server.js listSources)
  'server.js:autoResume': { kind: 'inert', why: 'the auto-resume engine (it arms timers that resume a conversation at its reset) — a source of conversations.list (listSources): no conversation runs in the census, so no row reads its armed state (the list says it does not know)' },
  'server.js:sysinfo': { kind: 'inert', why: 'a pick of sysinfo-wiring create(): the machine\'s sampler (it reads /proc on a timer) — conversations.list\'s memory source: the census list reads the machine\'s memory as not read' },
  'server.js:stoppedSessions': { kind: 'inert', why: 'a pick of boot-restore create() (the boot\'s restore — never evaluated whole): the kept stopped rows conversations.list reads — the census world keeps none' },
  'server.js:jsonBody': { kind: 'eval', why: 'THE body parser (express.json, 50 MB) — every agent POST reads its body through it' },
  'server.js:channelsWiring': { kind: 'eval', why: 'THE channels + agent groups wiring, real (channels-wiring.js create) on the scratch data dir — no channel connected' },
  'server.js:publishedPages': { kind: 'eval', why: 'THE published pages store, real (published-pages.js) on the scratch data dir' },
  'server.js:exitProxy': { kind: 'eval', why: 'THE machines\' exits (ExitProxyManager), real over the scratch machines store and THE grants store — no machine paired' },
  'src/server/mounts-plugins-wiring.js:feedbackForward': { kind: 'eval', why: 'the feedback forwarder, real — no collector configured, nothing is sent' },
  'server.js:desktopKeeper': { kind: 'inert', why: 'the desktop-app keeper (a machine\'s windows over xpra / VNC) — no window is open; the window targets engine reads it' },
  'src/server/mounts-plugins-wiring.js:jobBindings': { kind: 'eval', why: 'the jobs\' browser bindings, real (browser-bindings.js) on the scratch data dir' },
  'src/server/mounts-plugins-wiring.js:browserKept': { kind: 'eval', why: 'the kept browsers\' store, real (browser-kept.js) on the scratch data dir — r3786: the routes\' browser-env asks its verdict; over the absent keeper its notes\' reconcile does not finish (no registry to read), so it starts no child and removes nothing' },
  'src/server/mounts-plugins-wiring.js:browserKeys': { kind: 'eval', why: 'the per-conversation browser keys, real (browser-key.js) — over the absent keeper' },
  'server.js:stashView': { kind: 'eval', why: 'the stash hand-over view, real (stash-handover.js) over the real delivery ladder' },
  'server.js:accounts': { kind: 'inert', why: 'the agent CLI accounts store — no account in the census (nothing signs in)' },
  'server.js:browserKeeper': { kind: 'make', why: 'server.js\'s pick of the browser keeper (mounts-plugins-wiring create) — null with the wiring\'s own row', make: () => null },
  'server.js:browserKeys': { kind: 'make', why: 'server.js\'s pick of the browser keys (mounts-plugins-wiring create) — the wiring\'s own real one (its row)', make: (w) => w.made.get('src/server/mounts-plugins-wiring.js:browserKeys') || null },
  'server.js:recordClear': { kind: 'eval', why: 'THE record clear (record-clear.js), real over the real stores — a conversation clears only its own records' },
  'src/server/mounts-plugins-wiring.js:automationSettings': { kind: 'eval', why: 'the automation opens\' settings accessors, real (harness-config-sync.js) over the census\'s settings' },
  'server.js:desktopAccess': { kind: 'make', why: 'the desktop access gate (a machine\'s ops — apps, displays): every op answers «no machine in the census» (the apps engine reads its result\'s fields)', make: (w) => standIn(w, 'desktopAccess', { setAppPlanner() {}, planDigest: () => null, call: async () => ({ ok: false, code: 'census_no_machine', error: 'no machine in the census', status: { ok: false, code: 'census_no_machine' }, results: [], plan: null }), hosts: () => [], machine: () => null }) },
  // ── src/server/mounts-plugins-wiring.js ──
  'src/server/mounts-plugins-wiring.js:feedback': { kind: 'eval', why: 'THE feedback store, real, on the scratch data dir' },
  'src/server/mounts-plugins-wiring.js:vault': { kind: 'make', why: 'THE vault, real (vault-engine.js) on the scratch data dir with a light KDF; set up and unlocked by the world', make: (w) => R('src/server/vault-engine.js').create({ dataDir: w.data, kdf: { N: 1024, r: 8, p: 1 }, log: () => {}, idleTimer: false, bcast: () => {} }) },
  'src/server/mounts-plugins-wiring.js:vaultContents': { kind: 'eval', why: 'the Vault window\'s contents, real over the scratch vault' },
  'src/server/mounts-plugins-wiring.js:vaultRun': { kind: 'eval', why: 'the run door, real over the scratch vault' },
  'src/server/mounts-plugins-wiring.js:vaultPaste': { kind: 'eval', why: 'the paste door, real over the scratch vault' },
  'src/server/mounts-plugins-wiring.js:vaultJobSecrets': { kind: 'eval', why: 'B-ef1b: the retired job-secrets notice\'s door, real over the scratch vault + data dir (its route is a person\'s)' },
  'src/server/mounts-plugins-wiring.js:vaultJob': { kind: 'eval', why: 'lane vault-job-approval: the Background job\'s vault door, real over the scratch vault, THE grants store and THE For-you store — no timer, no process (its routes, the card\'s answer and the ✕, are a person\'s; no job in the census)' },
  'src/server/mounts-plugins-wiring.js:vaultTotp': { kind: 'eval', why: 'the two-step codes, real over the scratch vault' },
  'src/server/mounts-plugins-wiring.js:browserLogins': { kind: 'eval', why: 'the website logins, real over the scratch vault' },
  'src/server/mounts-plugins-wiring.js:browserProxyLogins': { kind: 'eval', why: 'B-8b87: a browser proxy\'s logins, real over the scratch vault (names only; its one reader is the keeper\'s forwarder, absent here) — no timer, no process, no network' },
  'src/server/mounts-plugins-wiring.js:automation': { kind: 'eval', why: 'THE automation keys engine, real over the scratch vault' },
  'src/server/mounts-plugins-wiring.js:vaultUseGrants': { kind: 'eval', why: 'the vault\'s use grants, real over THE grants store' },
  'src/server/mounts-plugins-wiring.js:vaultAttention': { kind: 'eval', why: 'the Vault window\'s «needs you» producers, real over THE For-you store' },
  // the manager design's piece 4 (conversations.resume) — its ONE line and its kept-record reader, met when the stack was restacked onto the train
  'src/server/mounts-plugins-wiring.js:resumeLine': { kind: 'make', why: 'THE resume line (resume-line.js createResumeLine) starts real resumes — a stand-in that starts nothing: every submit refuses by name (the census resumes no conversation), the line is empty', make: (w) => standIn(w, 'resumeLine', { submit: () => ({ ok: false, code: 'census_no_resume' }), state: () => ({ running: 0, waiting: 0, open: true }) }) },
  'src/server/mounts-plugins-wiring.js:resumeFactsOf': { kind: 'make', why: 'the kept-record READER (resume-line.js factsReaderOver), real, over no road: the census world keeps no ended conversation, so every key reads the reader\'s own «nothing kept» (goal unknown)', make: (w) => R('src/server/resume-line.js').factsReaderOver({ buffersDir: path.join(w.data, 'buffers'), road: null, readJson: async () => null }) },
  // the proposal card (lane login-request-card, majordomo piece 3b): the list's ONE builder hoisted so the card's rows come from it, and
  // the card's store — both start nothing when built (no timer, no spawn); a press reaches only the stand-in doors of the census world
  'src/server/mounts-plugins-wiring.js:listFacts': { kind: 'eval', why: 'conversations.list\'s ONE builder (conversation-facts.js), real, over the census world\'s sessions and stores' },
  'src/server/mounts-plugins-wiring.js:endProposals': { kind: 'eval', why: 'THE proposal card\'s store (end-proposals.js), real over THE For-you store: one card per proposer, nothing pressed in the census' },
  // ── src/server/apps-wiring.js / window-live-wiring.js ──
  'src/server/apps-wiring.js:engine': { kind: 'eval', why: 'THE apps engine, real (apps-engine.js) on the scratch data dir — its access stand-in installs nothing' },
  'src/server/window-live-wiring.js:engine': { kind: 'eval', why: 'THE window targets engine, real (window-targets-engine.js) on the scratch data dir — no window is open' },
  'src/server/window-live-wiring.js:handover': { kind: 'inert', why: 'the desktop handover engine — no desktop is handed over' },
};
const META = new Map();
function metaStore(w) {
  return { read: (id) => (META.has(String(id)) ? { ...META.get(String(id)) } : null), write: (id, m) => { META.set(String(id), { ...(META.get(String(id)) || {}), ...(m || {}) }); return true; } };
}

const ROUTES_STATIC = C.routes;
const WORLD = buildWorld({ catalog: CATALOG, routes: ROUTES_STATIC });
WORLD.world.value('server.js', 'convOps');   // the boot provides conversation-ops' seam inside mountRoutes — at boot, before any request
{
  const B = WORLD;
  console.log(`    ${B.sites.length} sites mounted in the boot's order; ${B.evaluated.size} wiring names evaluated from their own source`);
  ok(B.sites.length >= 31, `every wiring-time use of a bearer module is a site whose chain reaches server.js (${B.sites.length}: ${[...new Set(B.sites.map((s) => s.u.file))].join(', ')})`);
  const registering = B.broken.filter((b) => b.what === 'route' || /^(register|setup|create|router)/.test(b.what));
  ok(!registering.length, 'no bearer route, and no registering export of a bearer module, is used at a place the boot does not run', registering.map((b) => `${b.tag} — ${b.why}`).join(' | '));
  ok(!B.threw.length, 'every site evaluates without throwing', B.threw.join(' | '));
  ok(!B.demanded.size, 'every construction a site touches is a CATALOG row (eval / make / inert, each with its why)', B.demanded.size ? 'ADD A CATALOG ROW (eval / make / inert, with its why) in scripts/test-agent-leak-census.mjs for each — `git log -L <line>,<line>:<file>` names the commit that made the construction: ' + [...B.demanded].map(([k, v]) => `${k} — ${v}`).join(' | ') : '');
  ok(!SPAWNED.length, 'no program started while the wiring mounted', SPAWNED.slice(0, 8).join(' | '));
  ok(!B.gaps.size, 'no stand-in member read that its row did not give', [...B.gaps].join(' | '));
  ok(!B.dirnameReads.size, 'no evaluated wiring code outside server.js reads its own __dirname (the real tree\'s folder — only server.js\'s is the scratch root; a data path built from another would land in the checkout)', [...B.dirnameReads].join(' | '));
}
lap('⑤ the world');
console.log('⑥ the mount (the bearer routes the real wiring registers, against ③\'s static list)');
{
  const V = mountVerdict(WORLD.app, ROUTES_STATIC, TABLE);
  ok(V.mounted.size >= 130 && !V.unmounted.length, `every bearer route the tree registers is MOUNTED by the real wiring (${V.mounted.size} of ${V.want.size})`, V.unmounted.length ? 'gated off by a dep, or its module never mounted: ' + V.unmounted.join(' | ') : '');
  ok(!V.extra.length, 'within the modules ③ found, the real wiring mounts no bearer route ③ did not read (one only a router\'s prefix or a computed path makes)', V.extra.join(' | '));
  ok(!V.regex.length, 'no mounted route is a regex path the doors cannot judge', V.regex.join(' | '));
  ok(!V.unmountedReasonless.length && !V.unmountedStale.length, 'every `unmounted` row says why and names a route that is really unmounted', [...V.unmountedReasonless.map((k) => 'NO WHY ' + k), ...V.unmountedStale.map((k) => 'MOUNTED ' + k)].join(' | '));
}

// ── ⑧ THE SWEEP (U3): every mounted bearer route × every bearer, over sentinels planted through the real writers ──────
// Conversation A asks; conversation B owns everything planted. A sentinel is an alphanumeric word (never escaped, never
// cut by a belt) or a token; an answer is scanned whole — body and headers — for each one raw, base64, base64url, hex and
// URI-encoded. CRITICAL: B's tokens, a vault secret's bytes, a website login's password; LAW: an ungranted login's user
// name; CONV: B's name, folder, words, Task Group, progress, job, For-you item, meta. A hit is a FINDING: a row of the
// table's `findings` (listed for the coordinator, never fixed here) — a new hit or a row no hit answers = RED.
lap('⑥ the mount');
console.log('⑧ the sweep (every mounted bearer route × every bearer, over sentinels planted through the real writers)');
const crypto = require('node:crypto');
const http = require('node:http');
const hex = (n) => crypto.randomBytes(n).toString('hex');
const word = (k) => `zq${k}${hex(5)}`;
const SENT = { bName: word('bname'), bCwd: word('bcwd'), bPrompt: word('bprompt'), bGroup: word('bgroup'), bProgress: word('bprogress'), bJob: word('bjob'), bJobNote: word('bjobnote'), bTodo: word('btodo'), bMeta: word('bmeta'), bPage: word('bpage'), secret: word('secret') + hex(8), loginUser: word('loginuser'), loginPass: word('loginpass') + hex(4), chanLabel: word('chanlabel'), chanUser: word('chanuser') };
const KIND = { bToken: 'CRITICAL', bJobToken: 'CRITICAL', secret: 'CRITICAL', loginPass: 'CRITICAL', loginUser: 'LAW', bName: 'CONV', bCwd: 'CONV', bPrompt: 'CONV', bGroup: 'CONV', bProgress: 'CONV', bJob: 'CONV', bJobNote: 'CONV', bTodo: 'CONV', bMeta: 'CONV', bPage: 'CONV', chanLabel: 'LAW', chanUser: 'LAW' };
const TA = 'vsst_' + hex(24), TB = 'vsst_' + hex(24), TM = 'vsmk_' + crypto.randomBytes(32).toString('base64url').slice(0, 43);
process.env.VIBESPACE_MAINTAINER_KEY_SHA = crypto.createHash('sha256').update(TM).digest('hex');
const SID_A = fixtureSid(hex(6)), SID_B = fixtureSid(hex(6));
const KEY_A = 'claude:' + SID_A, KEY_B = 'claude:' + SID_B;
const W0 = WORLD.world;
const sessions = W0.value('server.js', 'activeSessions');
const CWD_A = path.join(ROOT, 'conv-a'), CWD_B = path.join(ROOT, SENT.bCwd);
fs.mkdirSync(CWD_A, { recursive: true }); fs.mkdirSync(CWD_B, { recursive: true });
fs.writeFileSync(path.join(CWD_B, 'notes.md'), SENT.bPrompt + '\n');
sessions.set('wA', { agentToken: TA, claudeSessionId: SID_A, backendSessionId: SID_A, backend: 'claude', _webuiId: 'wA', sockName: 'cw-census-a', clients: new Set(), name: 'census asker', cwd: CWD_A, createdAt: Date.now() - 60e3 });
sessions.set('wB', { agentToken: TB, claudeSessionId: SID_B, backendSessionId: SID_B, backend: 'claude', _webuiId: 'wB', sockName: 'cw-census-b', clients: new Set(), name: SENT.bName, cwd: CWD_B, createdAt: Date.now() - 120e3 });
const ROUTE_ERRORS = new Map();   // route → the first error a handler threw (express's own error path, quietly)
let SWEEP_PASS = 'main';   // the census error path counts the main sweep's throws (the key and related passes are judged by their findings)
WORLD.app.use((err, req, res, next) => { const k = `${req.method} ${req.route ? (req.baseUrl || '') + req.route.path : req.path}`; if (SWEEP_PASS === 'main' && !ROUTE_ERRORS.has(k)) ROUTE_ERRORS.set(k, String((err && err.message) || err).slice(0, 160)); if (!res.headersSent) res.status(500).json({ error: 'census: the handler threw', code: 'census_threw' }); });
const SERVER = await new Promise((r) => { const sv = WORLD.app.listen(0, '127.0.0.1', () => r(sv)); });
const PORT = SERVER.address().port;
const REJECTED = [];
process.on('unhandledRejection', (e) => REJECTED.push(String((e && e.message) || e).slice(0, 160)));
/** one request: no Accept-Encoding (the compression middleware sends the bytes as they are) */
function call(method, p, { bearer = null, body = undefined, raw = null, timeoutMs = 4000, port = PORT } = {}) {
  return new Promise((resolve) => {
    const data = raw !== null ? String(raw) : body === undefined ? null : JSON.stringify(body);
    const headers = { host: `127.0.0.1:${port}` };
    if (bearer) headers.authorization = 'Bearer ' + bearer;
    if (data !== null) { headers['content-type'] = raw !== null ? 'text/html' : 'application/json'; headers['content-length'] = Buffer.byteLength(data); }
    const rq = http.request({ host: '127.0.0.1', port, path: p, method, headers, timeout: timeoutMs }, (x) => {
      const chunks = []; x.on('data', (c) => chunks.push(c));
      x.on('end', () => resolve({ status: x.statusCode, text: Buffer.concat(chunks).toString('utf8'), headers: x.headers }));
    });
    rq.on('timeout', () => { rq.destroy(); resolve({ status: 0, text: '', headers: {}, timedOut: true }); });
    rq.on('error', (e) => resolve({ status: -1, text: String(e.message), headers: {} }));
    rq.end(data === null ? undefined : data);
  });
}
const json = (r) => { try { return JSON.parse(r.text); } catch { return null; } };
// ── the planting, through the real writers (B's own token where a route writes it) ──
const tasksStore = W0.made.get('server.js:tasks');
const gB = tasksStore.create({ title: 'census b group', objective: SENT.bGroup + ' objective', sessions: [KEY_B] });   // the title is no sentinel: the id is its slug, and A's probes carry the id
sessions.get('wB')._initialGroupId = gB.id;
const plant = [];
plant.push(['B\'s progress (POST /api/agent/task-progress, B\'s token)', await call('POST', '/api/agent/task-progress', { bearer: TB, body: { note: SENT.bProgress, detail: SENT.bProgress + ' detail' } })]);
plant.push(['B\'s job (POST /api/agent/jobs, B\'s token)', await call('POST', '/api/agent/jobs', { bearer: TB, body: { name: SENT.bJob, note: SENT.bJobNote, cmd: 'true' } })]);
plant.push(['A\'s job (POST /api/agent/jobs, A\'s token)', await call('POST', '/api/agent/jobs', { bearer: TA, body: { name: 'census-a-job', cmd: 'true' } })]);
plant.push(['B\'s page (POST /api/agent/pages/publish, B\'s token)', await call('POST', `/api/agent/pages/publish?title=${SENT.bPage}`, { bearer: TB, raw: `<html><body>${SENT.bPage} ${SENT.bPrompt}</body></html>` })]);
plant.push(['B\'s feedback report (POST /api/agent/feedback, B\'s token)', await call('POST', '/api/agent/feedback', { bearer: TB, body: { text: SENT.bPrompt + ' feedback', about: 'census' } })]);
const JM = W0.made.get('server.js:jobsWiring').jm;
const jobB = [...JM.jobs.values()].find((j) => j.name === SENT.bJob), jobA = [...JM.jobs.values()].find((j) => j.name === 'census-a-job');
const TJA = jobA ? JM._jobToken(jobA) : null, TJB = jobB ? JM._jobToken(jobB) : null;
W0.made.get('server.js:userTodos').add(KEY_B, { text: SENT.bTodo, detail: SENT.bTodo + ' detail', by: 'agent', origin: 'agent', sessionName: SENT.bName });
// B-166e part 2 smalls (主开发 2026-11-19 01:20Z): the OWNER's channels items — words that name accounts (labels, a vendor
// address) — in the shapes the channels engine files them (sessionKey 'channels', the names in the text / detail and the
// i18n params): no agent bearer route returns either (agents read For-you only on their own keys). (1) THE CLIENT-SWAP ITEM:
// in this world no memo holds it, so the engine's own sweep closes it at the vault's first event — it stays in the store,
// RESOLVED, and is swept as such; (2) a landed sign-in's «finish connecting» item, which no check closes — OPEN through
// every pass
// the channels wiring is made HERE, before the plant (the world makes it lazily): its engine's boot ends the last run's
// landed sign-ins (their «finish connecting» items) and runs the client-swap check — a plant made before it would be ended
// by the boot, not by anything a caller did
const CHW = W0.value('server.js', 'channelsWiring');
ok(!!(CHW && CHW.channels && typeof CHW.channels.clientSwapSettled === 'function'), 'the channels wiring is made before the owner\'s channels items are planted (its boot comes first)', JSON.stringify(Object.keys(CHW || {}).slice(0, 8)));
if (CHW && CHW.channels && typeof CHW.channels.clientSwapSettled === 'function') await CHW.channels.clientSwapSettled();
const CHAN_L1 = 'Its OAuth client is another one now. These accounts keep refreshing with the client they signed in with until the vendor deletes it: {labels}.';
const CHAN_L2 = 'Re-authorize opens the next one; this item resolves when none is left.';
W0.made.get('server.js:userTodos').add('channels', { origin: 'channels', kind: 'action', urgency: 'normal', by: 'agent', sessionName: 'Channels', openCap: 20,
  text: 'Gmail: the company preset «census» signs in with another client now — 1 account(s) still signed in with the old one; re-authorize each',
  detail: `${CHAN_L1.replace('{labels}', SENT.chanLabel)}\n${CHAN_L2}`, action: { type: 'channel-reauth', adapterId: 'census-acct' },
  i18n: { text: { key: '{kind}: the company preset «{preset}» signs in with another client now — {n} account(s) still signed in with the old one; re-authorize each', params: { kind: 'Gmail', preset: 'census', n: 1 } }, detail: [{ key: CHAN_L1, params: { labels: SENT.chanLabel } }, { key: CHAN_L2, params: {} }], source: { key: 'Channels' } } });
const CHAN_USER = `${SENT.chanUser}@example.test`, CHAN_UNTIL = Date.now() + 30 * 60e3;
W0.made.get('server.js:userTodos').add('channels', { origin: 'channels', kind: 'action', urgency: 'normal', by: 'agent', sessionName: 'Channels', openCap: 20, expiresAt: CHAN_UNTIL,
  text: `Gmail: signed in as ${CHAN_USER} — finish connecting`,
  detail: 'The sign-in landed but the account was not connected — open Connect an account to finish; the sign-in waits 30 minutes from its start.',
  action: { type: 'channel-connect', kind: 'gmail', flowId: 'census-flow' },
  i18n: { text: { key: '{kind}: signed in as {user} — finish connecting', params: { kind: 'Gmail', user: CHAN_USER } }, detail: [{ key: 'The sign-in landed but the account was not connected — open Connect an account to finish; {until}.', params: { until: { at: CHAN_UNTIL, key: 'the sign-in waits until {time}', gone: 'the sign-in has run out — sign in again' } } }], source: { key: 'Channels' } } });
META.set('cw-census-b', { name: SENT.bMeta, title: SENT.bMeta, customName: SENT.bMeta, prompt: SENT.bPrompt });   // every reader keys the meta by the session's sockName
const VAULT = W0.made.get('src/server/mounts-plugins-wiring.js:vault');
const VAULT_PW = 'census-vault-' + hex(4);
const vaultUp = await VAULT.setup(VAULT_PW);
const putB = VAULT.secretPut('apikey:census-b', SENT.secret, { actor: 'owner' });
const LOGIN_ORIGIN = 'https://census-login.example';
const loginB = W0.made.get('src/server/mounts-plugins-wiring.js:browserLogins').addOwn({ origin: LOGIN_ORIGIN, username: SENT.loginUser, password: SENT.loginPass });
ok(plant.every(([, r]) => r.status >= 200 && r.status < 300) && jobA && jobB && TJA && TJB, 'the planting runs through the real routes (B\'s progress, B\'s and A\'s jobs — the real jobs engine, its spawn stubbed)', plant.map(([n, r]) => `${n} → ${r.status} ${r.text.slice(0, 160)}`).join(' | '));
ok(vaultUp && vaultUp.ok && putB && putB.ok !== false && loginB && loginB.ok !== false, 'the vault is set up and holds B\'s secret and an ungranted website login (the real engine and the real web-login door)', JSON.stringify({ vaultUp, putB, loginB }).slice(0, 400));
const TOKENS = { bToken: TB, bJobToken: TJB };
const B_REF = {};   // `$B.<key>` in a row's body: B's planted things, by the ids the real writers gave them
const pageB = (() => { try { return JSON.parse(plant.find(([n]) => /B's page/.test(n))[1].text); } catch { return null; } })();
const todoB = (W0.made.get('server.js:userTodos').snapshot().open || []).find((i) => i && String(i.text || '').includes(SENT.bTodo)) || null;
const fbB = (() => { try { return JSON.parse(plant.find(([n]) => /B's feedback/.test(n))[1].text).report; } catch { return null; } })();
Object.assign(B_REF, { group: gB.id, sid: SID_B, key: KEY_B, job: jobB && jobB.id, page: pageB && (pageB.id || (pageB.page && pageB.page.id)), todo: todoB && todoB.id, feedback: fbB && fbB.id });
const UT = W0.made.get('server.js:userTodos');
const chanIdOf = (needle) => (UT.idsWhere((i) => i && i.sessionKey === 'channels' && JSON.stringify([i.text, i.detail, i.i18n]).includes(needle)) || [])[0] || null;
const chanSwapId = chanIdOf(SENT.chanLabel), chanLandId = chanIdOf(SENT.chanUser);
ok(!!(chanSwapId && chanLandId && JSON.stringify(UT.get(chanSwapId).i18n).includes(SENT.chanLabel) && JSON.stringify(UT.get(chanLandId).i18n).includes(SENT.chanUser)), 'the owner\'s two channels items are planted through the real For-you writer (the account names in their words and i18n params)', JSON.stringify({ swap: chanSwapId, landed: chanLandId }));
ok(Object.values(B_REF).every((v) => typeof v === 'string' && v.length > 3), 'B\'s planted things have the ids their real writers gave them (group, conversation, job, page, For-you item, feedback report)', JSON.stringify(B_REF));
const NEEDLES = [];
for (const [k, v] of Object.entries({ ...SENT, ...TOKENS })) {
  if (!v) continue;
  // base64 / base64url at EVERY byte offset: the bytes before the sentinel shift its encoding (three alignments); the
  // core of each — its first block (the prefix's) and its last (the suffix's) cut — is the same whatever surrounds it
  const b64 = [0, 1, 2].map((sh) => Buffer.concat([Buffer.alloc(sh), Buffer.from(v)]).toString('base64').replace(/=+$/, '').slice(sh ? 4 : 0, -4));
  const forms = new Set([v, ...b64, ...b64.map((x) => x.replace(/\+/g, '-').replace(/\//g, '_')), Buffer.from(v).toString('hex'), encodeURIComponent(v)]);
  for (const f of forms) NEEDLES.push([k, f]);
}
/** the sentinels an answer carries → [kind key] (nothing A sends carries one: the probe bag names B's ids, never a
 *  sentinel — so no echo can make a hit, and none is blanked) */
const hitsIn = (r) => { const hay = r.text + '\n' + JSON.stringify(r.headers || {}); const out = new Set(); for (const [k, f] of NEEDLES) if (hay.includes(f)) out.add(k); return [...out]; };
// ── the sweep ──
const BEARERS = [['A', TA], ['A-job', TJA], ['maintainer', TM], ['vsak', 'vsak_' + crypto.randomBytes(32).toString('base64url').slice(0, 43)], ['none', null]];
const BAG = { id: gB.id, group: gB.id, groupId: gB.id, task: gB.id, taskId: gB.id, session: SID_B, sessionId: SID_B, sessionKey: KEY_B, conversation: SID_B, conversationId: SID_B, conv: SID_B, cid: SID_B, sid: SID_B, webuiId: 'wB', ref: jobB ? jobB.id : 'census', job: jobB ? jobB.id : 'census', jobId: jobB ? jobB.id : 'census', name: 'apikey:census-b', entry: 'apikey:census-b', origin: LOGIN_ORIGIN, to: SID_B, peer: SID_B, target: SID_B };
const fillParam = (route, name) => {
  const n = name.toLowerCase(), p = route.toLowerCase();
  if (/ref|job/.test(n) || (/\/jobs\//.test(p) && n === 'id')) return BAG.job;
  if (/group|task/.test(n)) return gB.id;
  if (/conv|session|sid|cid/.test(n)) return SID_B;
  if (/entry|secret/.test(n)) return BAG.entry;
  if (n === 'verb') return 'feedback.list';   // the maintainer key's verb (POST /api/agent/automation/:verb)
  return 'census';
};
const MOUNTED = [...new Set(stackRoutes(WORLD.app._router.stack).filter((r) => C.bearerDoors.some((d) => underDoor(r.slice(r.indexOf(' ') + 1), d.test))))];
const RESULTS = [];
const subst = (v) => (typeof v === 'string' && v.startsWith('$B.') ? B_REF[v.slice(3)] ?? v : Array.isArray(v) ? v.map(subst) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, subst(x)])) : v);
const bodiesOf = (route) => { const row = (TABLE.routes || {})[route] || {}; return row.bodies ? row.bodies.map((b) => ({ bare: true, body: b })) : [{ bare: !!row.bare, body: row.body || {} }]; };
async function sweepOne(route, who, bearer) {
  const [method, rp] = [route.slice(0, route.indexOf(' ')), route.slice(route.indexOf(' ') + 1)];
  const row = (TABLE.routes || {})[route] || {};
  if (row.skip) return;
  const p = rp.replace(/:([A-Za-z_]\w*)(\([^)]*\))?\??/g, (_, n) => encodeURIComponent(fillParam(rp, n))).replace(/\*$/, 'census');
  const qs = method === 'GET' ? '?' + new URLSearchParams(BAG).toString() : '';
  const many = bodiesOf(route).length > 1;
  for (const [i, b] of bodiesOf(route).entries()) {
    // `bare`: a closed argument set refuses the bag — the row's own body alone
    const body = method === 'GET' ? undefined : b.bare ? subst(b.body) : { ...BAG, text: 'census', note: 'census', words: 'census', purpose: 'census', ...subst(b.body) };
    const r = await call(method === 'ALL' ? 'POST' : method, p + qs, { bearer, body });
    RESULTS.push({ route: many ? `${route} #${i}` : route, who, status: r.status, timedOut: !!r.timedOut, hits: hitsIn(r), text: r.text });
  }
}
async function pool(jobs, n) { const q = [...jobs]; await Promise.all(Array.from({ length: n }, async () => { while (q.length) await q.shift()(); })); }
// r4077 (lane bl-msg, the coordinator's find): THE BUILT-IN AGENTS ADAPTER's ROWS. It lists every live conversation by its name
// (src/channels/agents.js listConversations) and answers its reach with msg-acl, but its rows reach the conversation index only
// through the engine's discovery pass, whose FIRST timer tick comes 5 s after the wiring started the engine. A quick run read
// GET /api/agent/channels/list before that tick (no Agents row: B was never listed); a slow one after it, and the related pass
// told A B's name (an intermittent NEW). The pass is AWAITED here, once, before the sweeps, so every pass reads the same rows:
// the main pass proves an unrelated A is never told, the related pass that a fellow member of B's Task Group is (its findings row).
const agentsRowOfB = () => { const ix = CHW && CHW.channels && CHW.channels.store && CHW.channels.store.index; const live = ix && typeof ix.live === 'function' ? ix.live() || {} : {}; return Object.values(live).find((en) => en && en.adapterId === 'agents' && JSON.stringify(en).includes(SENT.bName)) || null; };
const agentsBefore = !!agentsRowOfB();
const agentsPass = CHW && CHW.channels && typeof CHW.channels.pass === 'function' ? await CHW.channels.pass('agents', { force: true }) : null;
const AGENTS_ROW_B = agentsRowOfB();
ok(!!AGENTS_ROW_B, `r4077: the Agents adapter's pass is awaited before the sweeps, and B's conversation is its row in the index (${agentsBefore ? 'there before the pass: the engine\'s first tick came first' : 'not there before the pass: a quick run'})`, JSON.stringify({ pass: agentsPass, row: AGENTS_ROW_B && { key: AGENTS_ROW_B.key, adapterId: AGENTS_ROW_B.adapterId } }).slice(0, 400));
const reads = MOUNTED.filter((r) => r.startsWith('GET ')), writes = MOUNTED.filter((r) => !r.startsWith('GET '));
await pool(reads.flatMap((r) => BEARERS.map(([w, b]) => () => sweepOne(r, w, b))), 12);
const lastOf = (r) => ((TABLE.routes || {})[r] || {}).last ? 1 : 0;
for (const r of [...writes].sort((x, y) => lastOf(x) - lastOf(y))) for (const [w, b] of BEARERS) await sweepOne(r, w, b);   // writes one at a time, in order (a write may change what the next one finds); a `last` row after the rest
const by = (pred) => RESULTS.filter(pred);
const deep = new Set(by((x) => x.who === 'A' && x.status >= 200 && x.status < 300).map((x) => x.route));
const errs = by((x) => x.status >= 500 || x.status <= 0 || x.timedOut);
console.log(`    ${RESULTS.length} answers: ${MOUNTED.length} routes × ${BEARERS.length} bearers; A's token reached ${deep.size} routes past their door (2xx); ${errs.length} answers 5xx / no answer`);
for (const [w] of BEARERS) { const s = {}; for (const x of by((y) => y.who === w)) { const k = x.timedOut ? 'timeout' : String(x.status); s[k] = (s[k] || 0) + 1; } console.log(`      ${w}: ${Object.entries(s).map(([k, v]) => `${k}×${v}`).join(' ')}`); }
// ── THE GRANTED KEY (the row's «automation key»): a key minted through the REAL engine, every verb, granted to A with the
// default reach (what the key itself opened) — then every verb aimed at B. Each verb's arguments are its own: the door
// names an unknown one and it is dropped (derived, never typed). Its answers join the findings as caller `A-key`.
SWEEP_PASS = 'after';
const AE = W0.made.get('src/server/mounts-plugins-wiring.js:automation');
const AKEYS = require(path.join(REPO, 'src/automation-keys.js'));
const reopened = await VAULT.unlock(VAULT_PW);   // the sweep's last write locked it (an agent may)
const minted = AE.mint({ name: 'census-key', scopes: [...AKEYS.VERBS], limits: { cwdRoots: [CWD_A], accounts: 'any', permissionModes: ['default'], models: 'any', modes: ['chat'] }, by: 'census' });   // its opens may land in A's folder only
const granted = minted && minted.ok ? AE.grant(minted.key.id, ['session:' + SID_A], { by: 'census' }) : null;
ok(reopened && reopened.ok !== false && minted && minted.ok && granted && granted.ok, `a key is minted through the real engine with every verb (${AKEYS.VERBS.length}) and granted to A (the default reach)`, JSON.stringify({ minted, granted }).slice(0, 300));
const KEY_RESULTS = [];
const layerOf = (v) => ((AKEYS.scopeOf ? AKEYS.scopeOf(v) : (AKEYS.SCOPES || []).find((x) => x.verb === v)) || {}).layer;
if (minted && minted.ok) for (const verb of [...AKEYS.VERBS].sort((a, b) => (layerOf(a) === 'read' ? 0 : 1) - (layerOf(b) === 'read' ? 0 : 1))) {   // the reads first (an act may change what a read finds)
  let args = { target: SID_B, group: gB.id, task: gB.id, id: B_REF.feedback, name: 'census', version: '2.369.407', force: false, resolveAsks: false, cwd: CWD_A };
  let r = null;
  for (let i = 0; i < 12; i++) {
    r = await call('POST', `/api/agent/automation/${verb}?key=${encodeURIComponent(minted.key.id)}`, { bearer: TA, body: args });
    const m = /unknown argument "([^"]+)"/.exec(String((json(r) || {}).why || ''));
    if (!m) break;
    const { [m[1]]: _drop, ...rest } = args; args = rest;
  }
  KEY_RESULTS.push({ route: `POST /api/agent/automation/${verb}`, who: 'A-key', status: r.status, timedOut: !!r.timedOut, hits: hitsIn(r), text: r.text });
}
// ── THE RELATED PASS: A put in B's Task Group, every read again — what a member may see is a finding row (allowed by
// membership, listed), and no CRITICAL sentinel even then ──
tasksStore.bind(gB.id, KEY_A);
const MAIN = RESULTS.length;
// THE HOOK READS FIRST, IN THE HOOK'S ORDER, EACH AWAITED (the train 2.369.410's close: a hosted red, green on its retry).
// GET /api/agent/task-context (SessionStart) and GET /api/agent/prompt-context (the prompt) move A's OWN seen marks: a
// caller with no confirm header marks as it composes (src/turn-carry.js), and B's group has no context rows (no signature
// read to wait on). Fired in the pool together, whichever the server composed first told A the group and the other found
// nothing new — prompt-context carried bGroup + bProgress once (two NEW hits), nothing on the retry. Both answer A while A
// is a member (bound above, unbound below after every read answered): an order race, never a leak. The next read starts
// once the previous answer is composed and its marks moved — that event, never a sleep; the rest of the pass is pooled.
const HOOK_READS = ['GET /api/agent/task-context', 'GET /api/agent/prompt-context'];
for (const r of HOOK_READS) if (reads.includes(r)) await sweepOne(r, 'A-related', TA);
await pool(reads.filter((r) => !HOOK_READS.includes(r)).flatMap((r) => [() => sweepOne(r, 'A-related', TA)]), 12);
tasksStore.unbind(gB.id, KEY_A);
const RELATED = RESULTS.splice(MAIN);
for (const x of RELATED) x.who = 'A-related';
console.log(`    the granted key: ${KEY_RESULTS.length} verbs aimed at B — ${KEY_RESULTS.map((x) => `${x.route.split('/').pop()} ${x.status}`).join(', ')}`);
console.log(`    the related pass: ${RELATED.length} reads with A in B's group — ${RELATED.filter((x) => x.hits.length).length} carry B's facts`);
// r4077: with B's Agents row in the index through every pass, channels/list never names B to an unrelated A (the main pass)
// and names B to a fellow member of B's Task Group (the related pass, its findings row)
{ const main = RESULTS.find((x) => x.route === 'GET /api/agent/channels/list' && x.who === 'A'), rel = RELATED.find((x) => x.route === 'GET /api/agent/channels/list');
  ok(!!(main && rel && main.status === 200 && rel.status === 200 && !main.hits.includes('bName') && rel.hits.includes('bName')), 'r4077: GET /api/agent/channels/list with B\'s Agents row in the index never names B to an unrelated A (the main pass) and names B to a fellow member of B\'s Task Group (the related pass)', JSON.stringify({ main: main && { status: main.status, hits: main.hits }, related: rel && { status: rel.status, hits: rel.hits } })); }
// ── the verdicts — ONE function over the answers and a table (the controls below run it over planted tables) ──
const CRASH_RE = /Cannot read propert|is not a function|is not iterable|is not defined|is not a constructor/;
const ANON_KEYS = new Set(['ok', 'error', 'code', 'why', 'hint', 'success']);   // what a refusal to an unknown caller may say
function sweepVerdicts(results, table) {
  const by = (pred) => results.filter(pred);
  const pathOf = (r) => r.slice(r.indexOf(' ') + 1);
  const why = (v) => String((v && typeof v === 'object' ? v.why : v) || '').trim().length >= 20;
  const prefixRows = (kind, now) => {   // rows by path prefix, each { why, n }: n = how many routes it covers today
    const T = table[kind] || {};
    const cover = (r) => Object.keys(T).filter((pre) => pathOf(r).startsWith(pre)).sort((a, b) => b.length - a.length)[0];
    const per = {}; for (const r of now) { const c = cover(r); if (c) per[c] = (per[c] || 0) + 1; }
    return {
      now, per,
      unrowed: now.filter((r) => !cover(r)),
      dead: Object.keys(T).filter((pre) => !per[pre]),
      blank: Object.entries(T).filter(([, v]) => !why(v)).map(([k]) => k),
      count: Object.entries(T).filter(([k, v]) => per[k] && v && v.n !== per[k]).map(([k, v]) => `${k} n ${v && v.n} → ${per[k]}`),
    };
  };
  // SHALLOW: a route a caller CRASHES in (a stand-in short of a member reads so), or a token-bearing caller (A, its job, the maintainer key) gets a 5xx from — the
  // world cannot take it past its door; SHAPE: A's 400 — the request's shape refused before any reach is judged
  const shallow = prefixRows('shallow', [...new Set(by((x) => CRASH_RE.test(x.text) || (x.who !== 'none' && x.who !== 'vsak' && x.status >= 500)).map((x) => x.route))]);   // any token-bearing caller's 5xx (a handler that throws for a job token or the maintainer key too)
  const shape = prefixRows('shape', [...new Set(by((x) => x.who === 'A' && x.status === 400 && !CRASH_RE.test(x.text)).map((x) => x.route))]);
  // DEEP: the routes A's token takes past their door (2xx), pinned both ways — a lost one and a new one are each said
  const deepNow = [...new Set(by((x) => x.who === 'A' && x.status >= 200 && x.status < 300).map((x) => x.route))].sort();
  const deepRow = new Set(table.deep || []);
  const deep = { now: deepNow, lost: [...deepRow].filter((r) => !deepNow.includes(r)), gained: deepNow.filter((r) => !deepRow.has(r)) };
  // OPEN: a 2xx to no bearer, or to a value no door knows
  const OPEN = table.open || {};
  const openNow = [...new Set(by((x) => (x.who === 'none' || x.who === 'vsak') && x.status >= 200 && x.status < 300).map((x) => x.route))];
  const open = { now: openNow, unrowed: openNow.filter((r) => !(has(OPEN, r) && why(OPEN[r]))), dead: Object.keys(OPEN).filter((r) => !openNow.includes(r)) };
  // ANONYMOUS: what a refusal to an unknown caller carries beyond its own words (a JSON key outside ANON_KEYS)
  const ANON = table.anonymous || {};
  const anonNow = [...new Set(by((x) => x.who === 'none' || x.who === 'vsak').flatMap((x) => { let j = null; try { j = JSON.parse(x.text); } catch { } return j && typeof j === 'object' && !Array.isArray(j) && Object.keys(j).some((k) => !ANON_KEYS.has(k)) ? [x.route] : []; }))];
  const anon = { now: anonNow, unrowed: anonNow.filter((r) => !(has(ANON, r) && why(ANON[r]))), dead: Object.keys(ANON).filter((r) => !anonNow.includes(r)) };
  // FINDINGS: every hit `<route> · <caller> · <sentinel>` — a row whose why is blank is no row
  const F = table.findings || {};
  const hits = [...new Set(by((x) => x.hits.length).flatMap((x) => x.hits.map((h) => `${x.route} · ${x.who} · ${h}`)))];
  const findings = { hits, unrowed: hits.filter((h) => !(has(F, h) && why(F[h]))), dead: Object.keys(F).filter((h) => !hits.includes(h)), critical: hits.filter((h) => KIND[h.split(' · ')[2]] === 'CRITICAL' && !(has(F, h) && why(F[h]))) };
  return { shallow, shape, deep, open, anon, findings };
}
const swept = MOUNTED.filter((r) => !((TABLE.routes || {})[r] || {}).skip);
const expected = swept.reduce((n, r) => n + bodiesOf(r).length, 0) * BEARERS.length;
ok(RESULTS.length === expected && !by((x) => x.timedOut || x.status <= 0).length, `every mounted bearer route answered every bearer (${RESULTS.length} = ${swept.length} routes, ${expected / BEARERS.length} requests each × ${BEARERS.length}; none timed out)`, by((x) => x.timedOut || x.status <= 0).map((x) => `${x.who} ${x.route}`).join(' | '));
{
  const RF = TABLE.refused || {};
  const progs = [...new Set(SPAWNED.map((x) => x.split(' ')[1]))];
  ok(progs.every((p) => has(RF, p)) && Object.keys(RF).every((p) => progs.includes(p)) && Object.values(RF).every((w) => String(w || '').trim().length >= 20), `every program a handler would start is refused and is a \`refused\` row with its why (${progs.join(', ') || 'none'})`, [...progs.filter((p) => !has(RF, p)).map((p) => 'NEW ' + p), ...Object.keys(RF).filter((p) => !progs.includes(p)).map((p) => 'DEAD ' + p)].join(' | '));
}
ok(!WORLD.demanded.size && !WORLD.gaps.size && !REJECTED.length, 'after the sweep: no construction without a row, no stand-in member missing, no unhandled rejection (a handler\'s own names are rows too)', (WORLD.demanded.size ? 'ADD A CATALOG ROW (eval / make / inert, with its why) in scripts/test-agent-leak-census.mjs for each — `git log -L <line>,<line>:<file>` names the commit that made the construction: ' : '') + [...[...WORLD.demanded].map(([k, v]) => `${k} — ${v}`), ...[...WORLD.gaps].map((g) => `${g} (give the stand-in that member)`), ...REJECTED].slice(0, 12).join(' | '));
SPAWNED.length = 0;   // the controls below count their own
{
  const dead = Object.keys(CATALOG).filter((k) => !WORLD.used.has(k));
  ok(!dead.length, `every CATALOG row is touched by the mount or the sweep (${Object.keys(CATALOG).length} rows: ${Object.values(CATALOG).filter((r) => r.kind === 'eval').length} eval, ${Object.values(CATALOG).filter((r) => r.kind === 'make').length} make, ${Object.values(CATALOG).filter((r) => r.kind === 'inert').length} inert)`, dead.length ? 'DEAD: ' + dead.join(' | ') : '');
}
const ALL_RESULTS = [...RESULTS, ...KEY_RESULTS, ...RELATED];
const SV = sweepVerdicts(RESULTS, TABLE);
/** the routes a handler threw on (the census error path) that are no shallow route — none may be */
const strayErrors = (errors, shallowNow) => [...errors.keys()].filter((k) => !shallowNow.some((r) => r === k || r.startsWith(k + ' #')));
{
  const stray = strayErrors(ROUTE_ERRORS, SV.shallow.now);
  ok(!stray.length, `every route a handler threw on (the census error path, ${ROUTE_ERRORS.size}) is a shallow route — none throws unseen behind a 4xx-looking answer`, stray.map((k) => `${k} → ${ROUTE_ERRORS.get(k)}`).join(' | '));
}
const SVF = sweepVerdicts(ALL_RESULTS, TABLE).findings;   // the findings over every pass (the five callers, the granted key, the related reads)
const textOf = (r) => ((RESULTS.find((x) => x.route === r && x.who === 'A') || {}).text || '').slice(0, 110);
const said = (v) => [...v.unrowed.map((r) => 'NEW ' + r + ' → ' + textOf(r)), ...v.dead.map((k) => 'DEAD ' + k), ...(v.blank || []).map((k) => 'NO WHY ' + k), ...(v.count || []).map((k) => 'COUNT ' + k)].join(' | ');
ok(!SV.shallow.unrowed.length && !SV.shallow.dead.length && !SV.shallow.blank.length && !SV.shallow.count.length, `every route the world cannot take past its door (a crash, or a 5xx to a token-bearing caller) is a \`shallow\` row with its why and its count (${SV.shallow.now.length}: ${Object.entries(SV.shallow.per).map(([k, n]) => `${k}* ${n}`).join(', ')})`, said(SV.shallow));
ok(!SV.shape.unrowed.length && !SV.shape.dead.length && !SV.shape.blank.length && !SV.shape.count.length, `every route whose request SHAPE A's token is refused on (a 400 — the reach never judged) is a \`shape\` row with its why and its count (${SV.shape.now.length})`, said(SV.shape));
ok(!SV.deep.lost.length && !SV.deep.gained.length, `the routes A's token takes past their door are the table's \`deep\` set, both ways (${SV.deep.now.length})`, [...SV.deep.lost.map((r) => 'LOST ' + r), ...SV.deep.gained.map((r) => 'NEW ' + r)].join(' | '));
ok(!SV.open.unrowed.length && !SV.open.dead.length, `no bearer route answers 2xx with no bearer or a value no door knows, unless it is an \`open\` row with its why (${SV.open.now.length})`, said(SV.open));
ok(!SV.anon.unrowed.length && !SV.anon.dead.length, `a refusal to an unknown caller says only its own words (${[...ANON_KEYS].join(' / ')}), unless it is an \`anonymous\` row with its why (${SV.anon.now.length})`, said(SV.anon));
for (const h of SVF.hits) console.log(`    FINDING ${KIND[h.split(' · ')[2]]}: ${h}${has(TABLE.findings || {}, h) ? '' : ' — NEW'}`);
ok(!SVF.unrowed.length, `every answer that carries another conversation's fact or a secret's bytes is a \`findings\` row with its why (${SVF.hits.length} hit(s) over the five callers, the granted key and the related reads)`, SVF.unrowed.map((h) => 'NEW ' + h).join(' | '));
ok(!SVF.dead.length, 'no findings row no answer carries', SVF.dead.join(' | '));
{ const land = UT.get(chanLandId), swap = UT.get(chanSwapId);
  ok(!!(land && land.status === 'open' && swap && JSON.stringify(swap.i18n).includes(SENT.chanLabel)), 'through every pass the owner\'s «finish connecting» item stood OPEN and the client-swap item stayed in the store with its labels (open or resolved — swept either way)', JSON.stringify({ landed: land && land.status, swap: swap && { status: swap.status, by: swap.resolvedBy } })); }
ok(!SVF.hits.some((h) => /· A(-job|-key|-related)? ·/.test(h) && KIND[h.split(' · ')[2]] === 'CRITICAL'), 'no CRITICAL sentinel (B\'s tokens, a secret\'s bytes, a login\'s password) reaches A by any road — its token, its job, its granted key, its membership — rowed or not');
ok(!SVF.critical.length, 'no CRITICAL sentinel reaches any caller outside a listed finding', SVF.critical.join(' | '));
// r4077's two REDS (the same verdict function over this run's answers): (1) THE AWAIT CUT, a quick run's answer: the related pass's
// channels/list as listFor builds it with no Agents row in the index (B's row out of the answer) ⇒ its findings row is DEAD;
// (2) THE ROW CUT ⇒ the item is NEW again, and only it
{ const ROW = 'GET /api/agent/channels/list · A-related · bName';
  const noAgents = (txt) => { try { const j = JSON.parse(txt); j.conversations = (j.conversations || []).filter((c) => c && c.adapterId !== 'agents'); return JSON.stringify(j); } catch { return txt; } };
  const quick = ALL_RESULTS.map((x) => { if (!(x.who === 'A-related' && x.route === 'GET /api/agent/channels/list')) return x; const text = noAgents(x.text); const still = hitsIn({ text }); return { ...x, text, hits: x.hits.filter((h) => h !== 'bName' || still.includes('bName')) }; });
  const v1 = sweepVerdicts(quick, TABLE).findings;
  ok(v1.dead.length === 1 && v1.dead[0] === ROW && !v1.unrowed.length, 'RED (r4077): the Agents pass not awaited (a quick run: no Agents row when the related pass reads) ⇒ its findings row is DEAD', JSON.stringify({ dead: v1.dead, unrowed: v1.unrowed }));
  const t = JSON.parse(JSON.stringify(TABLE)); delete t.findings[ROW];
  const v2 = sweepVerdicts(ALL_RESULTS, t).findings;
  ok(v2.unrowed.length === 1 && v2.unrowed[0] === ROW && !v2.dead.length, `RED (r4077): the findings row cut ⇒ «NEW ${ROW}» again, and only it`, v2.unrowed.join(' | ')); }
// ── the table kinds' RED controls: the same verdict function over planted tables ──
{
  const t = JSON.parse(JSON.stringify(TABLE));
  const firstShallow = Object.keys(t.shallow)[0], firstShape = Object.keys(t.shape)[0], firstFinding = Object.keys(t.findings)[0], firstAnon = Object.keys(t.anonymous)[0];
  t.shallow['/api/agent/planted-dead/'] = { n: 1, why: 'a planted shallow row no route has' };
  t.shallow[firstShallow] = { ...t.shallow[firstShallow], n: t.shallow[firstShallow].n + 1 };
  t.shape[firstShape] = { ...t.shape[firstShape], why: ' ' };
  t.deep = [...t.deep.slice(1), 'GET /api/agent/planted-deep'];
  t.open = { 'GET /api/agent/planted-open': 'a planted open row no route answers' };
  t.anonymous[firstAnon] = '';
  t.findings['GET /api/agent/planted-finding · A · bName'] = 'a planted findings row no answer carries';
  t.findings[firstFinding] = '';
  const v = sweepVerdicts(ALL_RESULTS, t);
  ok(v.shallow.dead.includes('/api/agent/planted-dead/') && v.shallow.count.length === 1, 'CONTROL: a `shallow` row no route has ⇒ DEAD, one whose count moved ⇒ RED', [v.shallow.dead, v.shallow.count]);
  ok(v.shape.blank.includes(firstShape), 'CONTROL: a `shape` row with no why ⇒ RED', v.shape.blank);
  ok(v.deep.lost.includes('GET /api/agent/planted-deep') && v.deep.gained.length === 1, 'CONTROL: the `deep` set pinned both ways — a route the table names that A no longer reaches, and one it reaches that the table does not name ⇒ each RED', v.deep);
  ok(v.open.dead.includes('GET /api/agent/planted-open') && v.anon.unrowed.includes(firstAnon), 'CONTROL: an `open` row no route answers ⇒ DEAD; an `anonymous` row with no why is no row ⇒ RED', [v.open.dead, v.anon.unrowed]);
  ok(v.findings.dead.includes('GET /api/agent/planted-finding · A · bName') && v.findings.unrowed.includes(firstFinding), 'CONTROL: a `findings` row no answer carries ⇒ DEAD; one with no why is no row (its hit ⇒ NEW) — a blank why never silences a hit', [v.findings.dead, v.findings.unrowed]);
}
// the two late asserts' RED controls (主开发 08:54Z: an assert never seen red is a comment)
{
  const st = strayErrors(new Map([['GET /api/agent/planted-throw', 'census: planted']]), SV.shallow.now);
  ok(st.length === 1 && st[0] === 'GET /api/agent/planted-throw', 'CONTROL: a route the census error path caught that is no shallow route ⇒ RED (strayErrors names it)', st);
}
// ── the positive controls: the same scanner over the same real routes, where the fact MAY be read ──
{
  // (p1) A joins B's Task Group: the group read now answers B's group and progress, and the scanner sees both
  const before = await call('GET', `/api/agent/task?group=${encodeURIComponent(gB.id)}`, { bearer: TA });
  tasksStore.bind(gB.id, KEY_A);
  const inside = await call('GET', `/api/agent/task?group=${encodeURIComponent(gB.id)}`, { bearer: TA });
  tasksStore.unbind(gB.id, KEY_A);
  const after = await call('GET', `/api/agent/task?group=${encodeURIComponent(gB.id)}`, { bearer: TA });
  const hIn = hitsIn(inside);
  ok(before.status === 403 && inside.status === 200 && hIn.includes('bProgress') && after.status === 403, 'POSITIVE CONTROL: A put in B\'s Task Group reads it (200) and the scanner sees B\'s progress in that answer; out again ⇒ 403 (the sweep\'s refusals are real refusals)', [before.status, inside.status, hIn, after.status, inside.text.slice(0, 200)]);
}


lap('⑧ the sweep and its verdicts');
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
  // the planted route LEAKS: every live conversation's name, and a secret's bytes in base64 — the sweep's scanner must see both
  globalThis.__lgPlantedSecret = SENT.secret;
  const planted = mpw.slice(0, at) + "app.get('/api/agent/planted-wiring', (req, res) => res.json({ live: activeSessions.size, groups: typeof sessionCallerOf, names: [...activeSessions.values()].map((s) => s.name), k: Buffer.from(JSON.stringify({ nm: String(globalThis.__lgPlantedSecret) })).toString('base64') }));\n" + mpw.slice(at);
  const a = again({ [MPW]: planted });
  const va = mountVerdict(a.B.app, a.c.routes, TABLE);
  ok(a.c.routes.some((r) => r.path === '/api/agent/planted-wiring' && r.file === MPW) && va.mounted.has('GET /api/agent/planted-wiring') && !va.unmounted.length && !va.extra.length && !a.B.threw.length, 'CONTROL: a bearer route planted IN the wiring file is read by ③ and mounted by the world — ⑥\'s verdict green on it (its handler closes over the wiring\'s own names)', [a.B.threw, va.unmounted, va.extra]);
  {
    const ss = a.B.world.value('server.js', 'activeSessions');
    ss.set('wA', { ...sessions.get('wA') }); ss.set('wB', { ...sessions.get('wB') });
    const sv = await new Promise((r) => { const x = a.B.app.listen(0, '127.0.0.1', () => r(x)); });
    const ans = await call('GET', '/api/agent/planted-wiring', { bearer: TA, port: sv.address().port });
    sv.close();
    const h = hitsIn(ans);
    const fv = sweepVerdicts([{ route: 'GET /api/agent/planted-wiring', who: 'A', status: ans.status, text: ans.text, hits: h }], TABLE).findings;
    ok(ans.status === 200 && h.includes('bName') && h.includes('secret') && fv.unrowed.includes('GET /api/agent/planted-wiring · A · secret') && fv.critical.length === 1, 'CONTROL: the planted wiring route answers B\'s name and a secret\'s bytes base64-encoded INSIDE a JSON object (no 3-byte alignment) — the scanner sees both, and the findings verdict says NEW and CRITICAL ⇒ RED', [ans.status, h, fv.unrowed, ans.text.slice(0, 120)]);
  }
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
  // a wiring file whose evaluated code reads its own __dirname (the real tree's folder) ⇒ RED
  {
    const fb = mpw.indexOf("require('../routes/feedback.js').registerFeedbackRoutes(app, {");
    ok(fb > 0, 'the feedback routes\' mount is found in the wiring (the control\'s anchor)');
    const dirny = mpw.slice(0, fb) + mpw.slice(fb).replace("registerFeedbackRoutes(app, {", "registerFeedbackRoutes(app, { plantedDir: __dirname,");
    const dd = again({ [MPW]: dirny });
    ok(dd.B.dirnameReads.has(MPW) && !dd.B.threw.length, 'CONTROL: a wiring site that reads its own __dirname (mounts-plugins-wiring.js) ⇒ RED (dirnameReads names the file)', [...dd.B.dirnameReads]);
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
lap('⑦ the controls');

// ── the REAL home is untouched (this process was re-homed before the world loaded) ──
{
  const { fixtureLitter } = require(path.join(REPO, 'src/fixture-guard.js'));
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name)).map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  ok(lit.offenders.length === 0, `the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.slice(0, 3));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
