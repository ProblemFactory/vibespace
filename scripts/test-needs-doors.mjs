#!/usr/bin/env node
// THE NEEDS-DOORS CENSUS — ONE suite, two tables (主开发, 2026-11-13: lane machine-needs-at-pairing's «machine» rows in
// src/machine-needs.js, lane ui-needs-a-button's «ui» rows in src/ui-needs.js; ONE row vocabulary: a door present / none (why) /
// deferred «lane · B-id»). The runner is machine-needs-at-pairing's (scripts/test-machine-needs.mjs, landed first) over both tables:
//   ① THE CENSUS, derived and PRINTED: every sentence a person reads (each t() / tr() / i18nKey() literal in src/ — the same reader as
//      scripts/i18n-extract.mjs) that a table's net catches is claimed by a row of that table or by a non-need with its reason. A
//      sentence the MACHINE table claims is its (a machine's need); the UI table claims the rest
//   ② A DOOR ON EVERY SURFACE THAT STATES IT: a row whose door is present — every file that states one of its sentences (a PURE
//      model's words count for the surface that draws them: `via` — one file, or every surface that draws them) carries the
//      door's marker in its source
//   ②b THE DOOR ON ITS LINE (the verifier's list for picks 3–6 — a marker cannot see placement): every present row's surfaces read
//      as an AST (acorn): the sentence and a LIVE door (a `run` that calls something) are drawn TOGETHER in the shape the row
//      declares — by default the sentence IS the `words` of a needLine call whose `doors` hold the live door
//   ③ CONTROLS: a new sentence a net catches that no row claims is RED by name; a surface stating a present-door need without its
//      door is RED by name
//   ⑩ THE STORED-WORDS CENSUS (the closure verifier's list for picks 3–6, item 1 — a hand list of five missed a sixth): every producer
//      that STORES words is read from the tree — each call of the store's filing methods and the i18n its item keeps (storedWordsReader),
//      here and in the release this tree was cut from (git cat-file). CLOSURE 4 — A FILING IS FOUND BY WHAT ITS RECEIVER HOLDS, never
//      by the handle's spelling: the store is the class src/user-todos.js declares (its methods that take an item's `i18n` are the
//      filing methods: add, redrawItem); every call of one (two arguments or more) in server.js and src/ (not src/lib) is placed —
//      followed back to `new` of the store, `this` inside it, an adapter whose filing method files to it, or a handle the tree's
//      wiring sets to it (the handle names read FORWARD from the store, printed), or known not to be the store; a call carrying words
//      on a receiver the census cannot place is RED BY NAME, never skipped. Found on the lane's .401 tree: 106 filings in 48 producer
//      files (closure 4 found 12 the spellings hid — oat-identity `t = T()`, engine-distribution `ut = T()`, the frp plugin
//      `ut = forYou()` with relay-token.js's words, browser-dialogs' eight `forYou.add?.(`, the store's own set-aside notice); ONE
//      filing the store REFUSES (browser-dialogs promptAsk: its i18n.detail is an object, not an array of lines — add() throws, the
//      sign-in ask is never filed) is REFUSED_DEBT, named. THE RELEASE IS FOUND BY ANCESTRY, never by a subject's words: the newest
//      commit at or below HEAD that changed package.json's "version" line (git log -G'"version":' -- package.json) whose version
//      differs from its parent's (content) — a lane never bumps the version, so that is what the tree was cut from (a lane commit
//      titled «2.N.N: …» is no release); a HEAD that is such a commit is checked against the one before it; a shallow clone holds
//      none with its parent: the comparison is SKIPPED by name and counted in the suite's last line («· 1 skipped by name: …»).
//      The release 66c6d99c0 stored 505 sentences with rows (435 seen before closure 4), 6 of them filed by no producer now — the 6
//      STORED_WORDS_LEGACY rows; of its 89 zh rows gone at 30378b3fc ONE was stored (the paused feedback forward's detail), the other
//      88 were never stored. A SERVER NOTICE's words are not stored as keys anywhere a later page
//      draws them: serverNotice sends {key, params} once, the page words it on arrival, and its toast history (localStorage) keeps the
//      words as said — never the key — so a reworded notice key (pick 5's LLM stop notice) strands nothing
// DEBT (closure 3, the verifier's M5): the nets read the ENGLISH key — a need word added to a zh / ja VALUE only is not seen.
// The machine table is read when it exists (it lands on its own lane's pick); the ui table always.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const SKIPS = [];   // closure 4 (item 3): a leg that did not run is named and counted in the last line
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 1400) : '')); } };
const TABLES = [['machine', 'src/machine-needs.js'], ['ui', 'src/ui-needs.js']].filter(([, f]) => fs.existsSync(path.join(REPO, f))).map(([scope, f]) => ({ scope, file: f, T: require(path.join(REPO, f)) }));
ok(TABLES.some((x) => x.scope === 'ui'), 'the ui table exists (src/ui-needs.js)');
console.log(`tables: ${TABLES.map((x) => x.scope + ' (' + x.file + ')').join(' · ')}`);

// ── the tree's words: every t() / tr() / i18nKey() literal in src/ (not the dictionaries), with the files that hold it ──
const tRe = /\b(?:t|tr|i18nKey)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const unescapeJs = (raw) => JSON.parse('"' + raw.replace(/\\.|"/g, (x) => (x === '"' ? '\\"' : x === "\\'" ? "'" : x)) + '"');
const sources = new Map();
const walk = (dir) => { for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js') && !/^i18n/.test(e.name)) sources.set(p, fs.readFileSync(path.join(REPO, p), 'utf8')); } };
walk('src');
const words = new Map();
for (const [file, text] of sources) for (const m of text.matchAll(tRe)) { let k; try { k = unescapeJs(m[1] != null ? m[1] : m[2]); } catch { continue; } if (!words.has(k)) words.set(k, new Set()); words.get(k).add(file); }

/** The census of every table over a set of sentences: a sentence goes to the FIRST table that claims it (machine, then ui). */
function census(ws) {
  const out = TABLES.map(({ scope, T }) => ({ scope, T, rows: new Map(T.NEEDS.map((r) => [r.id, { row: r, sentences: [], files: new Set() }])), non: [], unclaimed: [] }));
  for (const [s, files] of ws) {
    let taken = false;
    for (const c of out) {
      if (!c.T.inNet(s)) continue;
      const r = c.T.needOf(s);
      if (r) { const e = c.rows.get(r.id); e.sentences.push(s); for (const f of files) for (const g of [].concat((r.door.via && r.door.via[f]) || f)) e.files.add(g); taken = true; break; }
      const n = c.T.notNeedOf(s);
      if (n) { c.non.push({ s, why: n.why }); taken = true; break; }
    }
    if (taken) continue;
    const first = out.find((c) => c.T.inNet(s));
    if (first) first.unclaimed.push({ s, files: [...files] });
  }
  return out;
}
const markerOf = (mk, f) => (mk instanceof RegExp ? mk : mk[f] || /(?!)/);
const doorless = (e, src = (f) => sources.get(f) || '') => (e.row.door.present ? [...e.files].filter((f) => !markerOf(e.row.door.present.marker, f).test(src(f))) : []);

console.log('① THE CENSUS (derived from the tree)');
const C = census(words);
for (const c of C) {
  const caught = [...words.keys()].filter((s) => c.T.inNet(s)).length;
  console.log(`  [${c.scope}] the net catches ${caught} sentence(s)`);
  for (const e of c.rows.values()) {
    const d = e.row.door;
    const door = d.present ? `door present (${[...e.files].sort().join(', ') || 'no surface'})` : d.none ? `NONE — ${d.none}` : `deferred «${d.deferred}»`;
    console.log(`  · [${c.scope}] ${e.row.id} — ${e.row.need} — ${e.sentences.length} sentence(s) — ${door}`);
  }
  console.log(`  · [${c.scope}] not needs: ${c.non.length} (${[...new Set(c.non.map((x) => x.why))].length} reasons)`);
  ok(c.unclaimed.length === 0, `[${c.scope}] every sentence its net catches is claimed — by a row or a non-need with its reason (${caught})`, c.unclaimed.slice(0, 12));
  ok([...c.rows.values()].every((e) => e.sentences.length > 0), `[${c.scope}] every row claims at least one sentence of the tree (no dead row)`, [...c.rows.values()].filter((e) => !e.sentences.length).map((e) => e.row.id));
  ok(c.T.NEEDS.every((r) => (!!r.door.present + !!r.door.none + !!r.door.deferred) === 1), `[${c.scope}] every row has exactly one door verdict (present / none / deferred)`);
  // lane ui-needs-a-button pick 5: THE UI TABLE ENDS WITH NO DEFERRED ROW — every caught sentence a door, a none with its reason, or a non-need
  if (c.scope === 'ui') ok(c.T.NEEDS.every((r) => !r.door.deferred) && !('DEFERRED' in c.T), '[ui] no deferred row is left in the ui table (every caught sentence: a door, a none with its reason, or a non-need)', c.T.NEEDS.filter((r) => r.door.deferred).map((r) => r.id));
  else ok(c.T.NEEDS.filter((r) => r.door.deferred).every((r) => r.door.deferred === c.T.DEFERRED), `[${c.scope}] every deferred door names its owner («${c.T.DEFERRED}»)`);
  if (c.scope === 'machine') ok(c.T.NEEDS.every((r) => ['a', 'b', 'c', '-'].includes(r.kind) && Array.isArray(r.platforms) && r.platforms.length), '[machine] every row has a kind and its platforms');
}

console.log('② A DOOR ON EVERY SURFACE THAT STATES IT');
for (const c of C) for (const e of c.rows.values()) if (e.row.door.present) ok(doorless(e).length === 0 && e.files.size > 0, `[${c.scope}] ${e.row.id}: every surface that states it draws its door (${[...e.files].sort().join(', ')})`, doorless(e));

console.log('②b THE DOOR ON ITS LINE — each surface read as an AST (the verifier\'s list for picks 3–6: a marker cannot see placement)');
// THE SHAPE READER: an expression's WORDS (the t() / tr() / i18nKey() literals that can flow into it) and its DOORS (the door objects
// it can hold, and whether each `run` calls something), followed through bindings, calls, returns, a helper's parameters and the
// imports of the files the census names. A row's shape (src/ui-needs.js `shape`) says how its sentence and its door are tied.
function shapeReader({ follow = null, read = null } = {}) {
  const acorn = require(path.join(REPO, 'node_modules/acorn'));
  const FILES = new Map();
  const kids = (n) => { const out = []; for (const k in n) { if (k === 'parent' || k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') out.push(x); } else if (v && typeof v.type === 'string') out.push(v); } return out; };
  const fileOf = (f) => {
    if (FILES.has(f)) return FILES.get(f);
    let src = read ? read(f) : undefined; if (typeof src !== 'string') { try { src = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { FILES.set(f, null); return null; } }
    let ast = null;
    for (const sourceType of ['module', 'script']) { try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }); break; } catch { /* the other */ } }
    if (!ast) { FILES.set(f, null); return null; }
    const nodes = [];
    const stack = [[ast, null]];
    while (stack.length) { const [n, p] = stack.pop(); n.parent = p; n.file = f; nodes.push(n); for (const c of kids(n)) stack.push([c, n]); }
    const asg = new Map(), masg = new Map(), byCallee = new Map();
    const add = (m, k, v) => { if (k == null) return; let a = m.get(k); if (!a) m.set(k, a = []); a.push(v); };
    for (const n of nodes) {
      if (n.type === 'AssignmentExpression') { if (n.left.type === 'Identifier') add(asg, n.left.name, n); else if (n.left.type === 'MemberExpression') add(masg, n.left.computed ? null : nameOf(n.left.property), n); }
      if (n.type === 'CallExpression') { const c = n.callee.type === 'ChainExpression' ? n.callee.expression : n.callee; add(byCallee, c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? nameOf(c.property) : null, n); }
    }
    const rec = { f, src, ast, nodes, asg, masg, byCallee };
    FILES.set(f, rec);
    return rec;
  };
  const T_FN = /^(t|tr|i18nKey|tc|tDevice)$/;
  const isFn = (n) => n && /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type);
  const nameOf = (k) => (k && (k.type === 'Identifier' ? k.name : k.type === 'Literal' ? String(k.value) : null));
  const srcOf = (n) => (n && FILES.get(n.file) ? FILES.get(n.file).src.slice(n.start, n.end) : '');
  // ── bindings ──
  const patNames = (p, pathTo = [], out = []) => {
    if (!p) return out;
    if (p.type === 'Identifier') out.push({ name: p.name, path: pathTo, id: p });
    else if (p.type === 'ObjectPattern') for (const q of p.properties) { if (q.type === 'RestElement') patNames(q.argument, pathTo, out); else patNames(q.value, [...pathTo, nameOf(q.key)], out); }
    else if (p.type === 'ArrayPattern') p.elements.forEach((e, i) => patNames(e, [...pathTo, i], out));
    else if (p.type === 'AssignmentPattern') { const o = patNames(p.left, pathTo, []); for (const x of o) out.push({ ...x, dflt: p.right }); }
    else if (p.type === 'RestElement') patNames(p.argument, pathTo, out);
    return out;
  };
  const declIn = (stmts, name) => {
    for (const s of stmts) {
      const d = s && s.type === 'ExportNamedDeclaration' ? s.declaration : s;
      if (!d) continue;
      if (d.type === 'VariableDeclaration') for (const v of d.declarations) for (const b of patNames(v.id)) if (b.name === name) return { kind: 'var', decl: v, path: b.path, id: b.id };
      if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id && d.id.name === name) return { kind: 'fn', node: d, id: d.id };
      if (d.type === 'ImportDeclaration') for (const sp of d.specifiers) if (sp.local.name === name) return { kind: 'import', decl: d, spec: sp, id: sp.local };
    }
    return null;
  };
  // each scope's names, read once (a block / the program / a function's params / a loop head / a catch)
  const SCOPES = new WeakMap();
  const scopeNames = (n) => {
    if (SCOPES.has(n)) return SCOPES.get(n);
    const m = new Map();
    const put = (name, b) => { if (!m.has(name)) m.set(name, b); };
    const stmts = (list) => { for (const s0 of list) { const d = s0 && s0.type === 'ExportNamedDeclaration' ? s0.declaration : s0; if (!d) continue; if (d.type === 'VariableDeclaration') for (const v of d.declarations) for (const x of patNames(v.id)) put(x.name, { kind: 'var', decl: v, path: x.path, id: x.id }); if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) put(d.id.name, { kind: 'fn', node: d, id: d.id }); if (d.type === 'ImportDeclaration') for (const sp of d.specifiers) put(sp.local.name, { kind: 'import', decl: d, spec: sp, id: sp.local }); } };
    if (isFn(n)) { n.params.forEach((p, i) => { for (const x of patNames(p)) put(x.name, { kind: 'param', fn: n, index: i, path: x.path, dflt: x.dflt, id: x.id }); }); if (n.type === 'FunctionExpression' && n.id) put(n.id.name, { kind: 'fn', node: n, id: n.id }); }
    else if (n.type === 'BlockStatement' || n.type === 'Program' || n.type === 'StaticBlock') stmts(n.body);
    else if (n.type === 'SwitchCase') stmts(n.consequent);
    else if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type === 'VariableDeclaration') for (const x of patNames(n.left.declarations[0].id)) put(x.name, { kind: n.type === 'ForOfStatement' ? 'forof' : 'forin', loop: n, path: x.path, id: x.id });
    else if (n.type === 'ForStatement' && n.init && n.init.type === 'VariableDeclaration') stmts([n.init]);
    else if (n.type === 'CatchClause' && n.param) for (const x of patNames(n.param)) put(x.name, { kind: 'catch', id: x.id });
    SCOPES.set(n, m);
    return m;
  };
  const BIND = new WeakMap();
  const bindingOf = (id) => {
    if (BIND.has(id)) return BIND.get(id);
    let r = null;
    for (let n = id.parent; n && !r; n = n.parent) { const m = scopeNames(n); if (m.size && m.has(id.name)) r = m.get(id.name); }
    BIND.set(id, r);
    return r;
  };
  const sameBinding = (a, b) => !!(a && b && a.id && a.id === b.id);
  // ── modules ──
  // an import is followed only into a file the census names (a file that states a row's sentence, a surface, need-line.js)
  const resolveModule = (from, spec) => { if (!/^\.\.?\//.test(spec)) return null; const p = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)); for (const c of [p, p + '.js', p + '/index.js']) if ((!follow || follow.has(c)) && fs.existsSync(path.join(REPO, c)) && fs.statSync(path.join(REPO, c)).isFile()) return c; return null; };
  const EXP = new Map();
  const exportOf = (f, name) => { const k = f + '\0' + name; if (!EXP.has(k)) { EXP.set(k, []); EXP.set(k, exportOf1(f, name)); } return EXP.get(k); };
  const exportOf1 = (f, name) => {
    const R = fileOf(f); if (!R) return [];
    const out = [];
    for (const s of R.ast.body) {
      if (s.type === 'ExportNamedDeclaration' && s.declaration) { const d = s.declaration; if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id.name === name) out.push(d); if (d.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.type === 'Identifier' && v.id.name === name && v.init) out.push(v.init); }
      if (s.type === 'ExportNamedDeclaration' && !s.declaration) for (const sp of s.specifiers) if (nameOf(sp.exported) === name) { const d = declIn(R.ast.body, nameOf(sp.local)); if (d) out.push(...valOfBinding(d)); }
    }
    // CommonJS: module.exports = { name, … } / module.exports.name = …
    for (const n of R.masg.get('exports') || []) {
      if (n.type === 'AssignmentExpression' && srcOf(n.left) === 'module.exports' && n.right.type === 'ObjectExpression') for (const p of n.right.properties) if (p.type === 'Property' && nameOf(p.key) === name) out.push(...(p.value.type === 'Identifier' ? valOf(p.value) : [p.value]));
    }
    for (const n of R.masg.get(name) || []) if (srcOf(n.left) === `module.exports.${name}`) out.push(n.right);
    return out;
  };
  // ── values: the expressions a node can stand for (followed one hop at a time; cycles cut) ──
  let BUDGET = 0;
  const valOfBinding = (b, seen = new Set()) => {
    if (!b) return [];
    if (b.kind === 'fn') return [b.node];
    if (b.kind === 'var') {
      const base = b.decl.init ? [b.decl.init] : [];
      // assignments to the same binding (x = …) anywhere in its file
      const R = FILES.get(b.id.file);
      const asg = R ? (R.asg.get(b.id.name) || []).filter((n) => sameBinding(bindingOf(n.left), b)).map((n) => n.right) : [];
      const all = [...base, ...asg];
      return b.path.length ? selectPath(all, b.path, seen) : all;
    }
    if (b.kind === 'import') {
      const f = resolveModule(b.decl.file || b.id.file, b.decl.source.value); if (!f) return [];
      if (b.spec.type === 'ImportNamespaceSpecifier') return [{ type: '#namespace', file: f }];
      return exportOf(f, b.spec.type === 'ImportDefaultSpecifier' ? 'default' : nameOf(b.spec.imported));
    }
    if (b.kind === 'param') {
      const out = b.dflt ? [b.dflt] : [];
      const args = callersOf(b.fn).map((c) => c.arguments[b.index]).filter(Boolean);
      out.push(...(b.path.length ? selectPath(args, b.path, seen) : args));
      // a callback's parameter: an element of what it walks (.map / .forEach / .filter / .find / .some / .every on a receiver)
      const call = b.fn.parent;
      if (call && call.type === 'CallExpression' && call.arguments[0] === b.fn && call.callee.type === 'MemberExpression' && /^(map|forEach|filter|find|some|every|flatMap)$/.test(nameOf(call.callee.property)) && b.index === 0) out.push(...elementsOf(call.callee.object, seen));
      return out;
    }
    if (b.kind === 'forof') return selectPath(elementsOf(b.loop.right, seen), b.path, seen);
    return [];
  };
  const elementsOf = (n, seen = new Set(), d = 0) => {
    if (!n || d > 14 || seen.has(n)) return [];
    seen.add(n);
    const out = [];
    switch (n.type) {
      case 'Identifier': {
        const b = bindingOf(n); if (!b) return out;
        const R = FILES.get(n.file);
        if (R) for (const c of [...(R.byCallee.get('push') || []), ...(R.byCallee.get('unshift') || [])]) if (c.callee.type === 'MemberExpression' && c.callee.object.type === 'Identifier' && c.callee.object.name === n.name && sameBinding(bindingOf(c.callee.object), b)) out.push(...c.arguments);
        for (const v of valOfBinding(b, new Set())) out.push(...elementsOf(v, seen, d + 1));
        return out;
      }
      case 'ArrayExpression': for (const e of n.elements) { if (!e) continue; if (e.type === 'SpreadElement') out.push(...elementsOf(e.argument, seen, d + 1)); else out.push(e); } return out;
      case 'ConditionalExpression': return [...elementsOf(n.consequent, seen, d + 1), ...elementsOf(n.alternate, seen, d + 1)];
      case 'LogicalExpression': return [...elementsOf(n.left, seen, d + 1), ...elementsOf(n.right, seen, d + 1)];
      case 'ChainExpression': case 'ParenthesizedExpression': return elementsOf(n.expression, seen, d + 1);
      case 'AwaitExpression': return elementsOf(n.argument, seen, d + 1);
      case 'CallExpression': {
        const c = n.callee.type === 'ChainExpression' ? n.callee.expression : n.callee;
        const pn = c.type === 'MemberExpression' ? nameOf(c.property) : null;
        if (pn === 'map' && isFn(n.arguments[0])) return returnsOf(n.arguments[0]);
        if (pn === 'flatMap' && isFn(n.arguments[0])) { for (const r of returnsOf(n.arguments[0])) out.push(...elementsOf(r, seen, d + 1)); return out; }
        if (pn && /^(filter|slice|concat|sort|reverse)$/.test(pn)) { out.push(...elementsOf(c.object, seen, d + 1)); if (pn === 'concat') for (const a of n.arguments) out.push(...elementsOf(a, seen, d + 1)); return out; }
        if (c.type === 'Identifier' && T_FN.test(c.name)) return [n];
        const fns = calleeFns(n, new Set());
        if (fns.length) { for (const f of fns) for (const r of returnsOf(f)) out.push(...elementsOf(r, seen, d + 1)); return out; }
        return [n];
      }
      default: return [n];
    }
  };
  const selectPath = (vals, p, seen) => { let cur = vals; for (const k of p) { const nx = []; for (const v of cur.flatMap((x) => valOf(x, seen))) { if (v.type === 'ObjectExpression') { for (const q of v.properties) if (q.type === 'Property' && nameOf(q.key) === String(k)) nx.push(q.value); } else if (v.type === 'ArrayExpression' && typeof k === 'number') { if (v.elements[k]) nx.push(v.elements[k]); } } cur = nx; } return cur; };
  const FBM = new Map();
  const fnByMember = (file, name) => { const key = file + '\0' + name; if (FBM.has(key)) return FBM.get(key); const R = fileOf(file); if (!R) return []; const out = []; FBM.set(key, out); for (const n of R.nodes) { if ((n.type === 'MethodDefinition' || (n.type === 'Property' && (n.method || isFn(n.value)))) && nameOf(n.key) === name && isFn(n.value)) out.push(n.value); if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && nameOf(n.left.property) === name && isFn(n.right)) out.push(n.right); } return out; };
  const calleeFns = (call, seen) => {
    const c = call.callee.type === 'ChainExpression' ? call.callee.expression : call.callee;
    if (c.type === 'Identifier') return valOf(c, seen).filter(isFn);
    if (c.type === 'MemberExpression') {
      if (c.computed && c.property.type !== 'Literal') return valOf(c, new Set()).filter(isFn);
      const pn = nameOf(c.property);
      if (c.object.type === 'ThisExpression') return fnByMember(call.file, pn);
      const objs = valOf(c.object, seen);
      const out = [];
      for (const o of objs) { if (o.type === '#namespace') out.push(...exportOf(o.file, pn).filter(isFn)); if (o.type === 'ObjectExpression') for (const q of o.properties) if (q.type === 'Property' && nameOf(q.key) === pn && isFn(q.value)) out.push(q.value); }
      return out;
    }
    return isFn(c) ? [c] : [];
  };
  const RET = new WeakMap();
  const returnsOf = (fn) => { if (fn.type === 'ArrowFunctionExpression' && fn.expression) return [fn.body]; if (RET.has(fn)) return RET.get(fn); const out = []; const st = [fn.body]; while (st.length) { const x = st.pop(); if (x.type === 'ReturnStatement') { if (x.argument) out.push(x.argument); continue; } if (isFn(x)) continue; st.push(...kids(x)); } RET.set(fn, out); return out; };
  const callersOf = (fn) => {
    const R = FILES.get(fn.file); if (!R) return [];
    const p = fn.parent;
    let name = null, b = null;
    if (p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier') { name = p.id.name; b = bindingOf(p.id); }
    else if (fn.type === 'FunctionDeclaration' && fn.id) { name = fn.id.name; b = { kind: 'fn', node: fn, id: fn.id }; }
    else if (p && (p.type === 'MethodDefinition' || p.type === 'Property')) name = nameOf(p.key);
    if (!name) return [];
    return (R.byCallee.get(name) || []).filter((n) => (n.callee.type === 'Identifier' && (!b || sameBinding(bindingOf(n.callee), b))) || (n.callee.type === 'MemberExpression' && !b));
  };
  let DEPTH = 0;
  function valOf(n, seen = new Set()) {
    if (DEPTH > 40) return [];
    DEPTH++;
    try { return valOf1(n, seen); } finally { DEPTH--; }
  }
  function valOf1(n, seen) {
    if (!n || ++BUDGET > 400000) return [];
    if (n.type === '#namespace' || isFn(n) || n.type === 'ObjectExpression' || n.type === 'ArrayExpression' || n.type === 'Literal' || n.type === 'TemplateLiteral') return [n];
    if (seen.has(n)) return [];
    seen.add(n);
    switch (n.type) {
      case 'Identifier': { if (n.name === 'undefined') return []; const b = bindingOf(n); return b ? valOfBinding(b, seen).flatMap((v) => valOf(v, seen)) : []; }
      case 'ChainExpression': return valOf(n.expression, seen);
      case 'AwaitExpression': return valOf(n.argument, seen);
      case 'ParenthesizedExpression': return valOf(n.expression, seen);
      case 'SequenceExpression': return valOf(n.expressions[n.expressions.length - 1], seen);
      case 'AssignmentExpression': return valOf(n.right, seen);
      case 'ConditionalExpression': return [...valOf(n.consequent, seen), ...valOf(n.alternate, seen)];
      case 'MemberExpression': {
        if (n.computed && !(n.property.type === 'Literal')) { const out = []; for (const o of valOf(n.object, seen)) if (o.type === 'ObjectExpression') for (const q of o.properties) if (q.type === 'Property') out.push(...valOf(q.value, seen)); return out.length ? out : [n]; }
        const pn = nameOf(n.property); const out = [];
        for (const o of valOf(n.object, seen)) { if (o.type === 'ObjectExpression') { for (const q of o.properties) if (q.type === 'Property' && nameOf(q.key) === pn) out.push(...valOf(q.value, seen)); } else if (o.type === '#namespace') out.push(...exportOf(o.file, pn)); }
        return out.length ? out : [n];
      }
      case 'LogicalExpression': return [...valOf(n.left, seen), ...valOf(n.right, seen)];
      case 'CallExpression': { if (n.callee.type === 'Identifier' && T_FN.test(n.callee.name)) return [n]; if (n.callee.type === 'MemberExpression' && srcOf(n.callee) === 'Object.freeze' && n.arguments[0]) return valOf(n.arguments[0], seen); const fns = calleeFns(n, new Set()); return fns.length ? fns.flatMap((f) => returnsOf(f)).flatMap((r) => valOf(r, seen)) : [n]; }
      default: return [n];
    }
  }
  // ── WORDS: the t() literals that can flow into an expression ──
  const WMEMO = new WeakMap();
  function wordsOf(n, seen = null) {
    if (!seen && n && typeof n === 'object') { if (WMEMO.has(n)) return WMEMO.get(n); const r = wordsOf1(n, new Set()); WMEMO.set(n, r); return r; }
    return wordsOf1(n, seen || new Set());
  }
  function wordsOf1(n, seen) {
    const out = new Set();
    const go = (x) => {
      if (!x || seen.has(x) || ++BUDGET > 400000) return;
      seen.add(x);
      switch (x.type) {
        case 'CallExpression': {
          const c = x.callee.type === 'ChainExpression' ? x.callee.expression : x.callee;
          if (c.type === 'Identifier' && T_FN.test(c.name)) { const a = x.arguments[0]; if (a && a.type === 'Literal' && typeof a.value === 'string') out.add(a.value); else go(a); if (x.arguments[1]) go(x.arguments[1]); return; }
          const fns = calleeFns(x, new Set());
          if (fns.length) { for (const f of fns) for (const r of returnsOf(f)) go(r); for (const a of x.arguments) if (!isFn(a)) go(a); return; }
          if (c.type === 'MemberExpression' && /^(map|flatMap)$/.test(nameOf(c.property)) && isFn(x.arguments[0])) { for (const r of returnsOf(x.arguments[0])) go(r); return; }
          for (const a of x.arguments) if (!isFn(a)) go(a);
          if (c.type === 'MemberExpression') go(c.object);
          return;
        }
        case 'Identifier': { const vs = valOf(x, new Set()); for (const v of vs) go(v); for (const e of elementsOf(x)) if (!vs.includes(e)) go(e); return; }
        case 'MemberExpression': {
          const objs = valOf(x.object, new Set());
          const pn = x.computed ? null : nameOf(x.property);
          let hit = false;
          for (const o of objs) if (o.type === 'ObjectExpression') { for (const q of o.properties) if (q.type === 'Property' && (pn === null || nameOf(q.key) === pn)) { hit = true; go(q.value); } }
          // writes to the same member of the same binding (cl.textContent = …)
          if (x.object.type === 'Identifier' && pn) { const b = bindingOf(x.object); const R = FILES.get(x.file); if (b && R) for (const a of R.masg.get(pn) || []) if (a.left.object.type === 'Identifier' && a.left.object.name === x.object.name && sameBinding(bindingOf(a.left.object), b)) { hit = true; go(a.right); } }
          if (!hit && pn === null) for (const o of objs) go(o);
          return;
        }
        case 'TemplateLiteral': for (const e of x.expressions) go(e); return;
        case 'TaggedTemplateExpression': go(x.quasi); return;
        case 'BinaryExpression': case 'LogicalExpression': go(x.left); go(x.right); return;
        case 'ConditionalExpression': go(x.consequent); go(x.alternate); return;
        case 'ArrayExpression': for (const e of x.elements) go(e); return;
        case 'ObjectExpression': for (const q of x.properties) go(q.type === 'Property' ? q.value : q.argument); return;
        case 'SpreadElement': go(x.argument); return;
        case 'ChainExpression': case 'ParenthesizedExpression': go(x.expression); return;
        case 'AwaitExpression': go(x.argument); return;
        case 'AssignmentExpression': go(x.right); return;
        case 'SequenceExpression': go(x.expressions[x.expressions.length - 1]); return;
        default: return;
      }
    };
    go(n);
    return out;
  }
  // ── DOORS: the door objects an expression can hold, and whether each one's run calls something ──
  const containsCall = (n) => { let hit = false; const st = [n]; while (st.length && !hit) { const x = st.pop(); if (x.type === 'CallExpression' || x.type === 'NewExpression' || x.type === 'ImportExpression') hit = true; else st.push(...kids(x)); } return hit; };
  const liveFn = (f) => (f.type === 'ArrowFunctionExpression' && f.expression ? containsCall(f.body) : f.body.type === 'BlockStatement' && f.body.body.length > 0 && containsCall(f.body));
  function liveRun(v, seen = new Set()) {
    if (!v || seen.has(v)) return false;
    seen.add(v);
    if (isFn(v)) return liveFn(v);
    if (v.type === 'Identifier') { const vals = valOf(v, new Set()); return vals.length ? vals.some((x) => liveRun(x, seen)) : true; }   // an unbound reference: a function handed in (an opener)
    if (v.type === 'MemberExpression') return true;
    if (v.type === 'ConditionalExpression') return liveRun(v.consequent, seen) || liveRun(v.alternate, seen);
    if (v.type === 'LogicalExpression') return liveRun(v.left, seen) || liveRun(v.right, seen);
    if (v.type === 'CallExpression') { const fa = v.arguments.filter(isFn); if (fa.length) return fa.some(liveFn); const fns = calleeFns(v, new Set()); return fns.length ? fns.some((f) => returnsOf(f).some((r) => liveRun(r, seen))) : true; }
    return false;
  }
  const propOf = (o, name) => (o.properties || []).find((p) => p.type === 'Property' && nameOf(p.key) === name);
  function doorsOf(n, seen = new Set()) {
    const objs = [], opaque = [];
    const go = (x) => {
      if (!x || seen.has(x) || ++BUDGET > 400000) return;
      seen.add(x);
      switch (x.type) {
        case 'ArrayExpression': for (const e of x.elements) go(e); return;
        case 'ObjectExpression': objs.push(x); return;
        case 'SpreadElement': go(x.argument); return;
        case 'ConditionalExpression': go(x.consequent); go(x.alternate); return;
        case 'LogicalExpression': if (x.operator === '&&') go(x.right); else { go(x.left); go(x.right); } return;
        case 'Identifier': { const vals = valOf(x, new Set()); for (const v of vals) go(v); for (const e of elementsOf(x, new Set())) if (!vals.includes(e)) go(e); if (!vals.length) opaque.push(x); return; }
        case 'CallExpression': { const c = x.callee.type === 'ChainExpression' ? x.callee.expression : x.callee; if (c.type === 'MemberExpression' && /^(filter|concat|slice)$/.test(nameOf(c.property))) { go(c.object); for (const a of x.arguments) if (!isFn(a)) go(a); return; } if (c.type === 'MemberExpression' && nameOf(c.property) === 'map' && isFn(x.arguments[0])) { for (const r of returnsOf(x.arguments[0])) go(r); return; } const fns = calleeFns(x, new Set()); if (fns.length) for (const f of fns) for (const r of returnsOf(f)) go(r); else opaque.push(x); return; }
        case 'Literal': return;
        case 'ChainExpression': case 'ParenthesizedExpression': go(x.expression); return;
        case 'AwaitExpression': go(x.argument); return;
        case 'MemberExpression': { for (const v of valOf(x.object, new Set())) if (v.type === 'ObjectExpression') { const q = propOf(v, nameOf(x.property)); if (q) go(q.value); } return; }
        default: opaque.push(x);
      }
    };
    go(n);
    const doors = objs.filter((o) => propOf(o, 'run') || propOf(o, 'label'));
    // closure 3 (item 2): a run whose every call CLOSES (close / rclose / iclose / m.close() / x.remove() / hide) reaches no act — it
    // counts only on a door whose words ARE the closing («Close», «Cancel», «Dismiss»; door id …-close / dismiss / cancel)
    const closesOnly = (o) => { const run = (propOf(o, 'run') || {}).value; if (!isFn(run)) return false; const cs = []; const st = [run.body]; while (st.length) { const x = st.pop(); if (x.type === 'CallExpression') cs.push(x); st.push(...kids(x)); } const closer = (c) => { const k = c.callee.type === 'ChainExpression' ? c.callee.expression : c.callee; const nm = k.type === 'Identifier' ? k.name : k.type === 'MemberExpression' && !k.computed ? nameOf(k.property) : ''; return /^(?:[a-z]?close|close[A-Z]\w*|hide|dismiss|remove)$/.test(nm || ''); }; if (!cs.length || !cs.every(closer)) return false; const d = (propOf(o, 'door') || {}).value, lb = (propOf(o, 'label') || {}).value; const said = (v) => (v && v.type === 'Literal' ? String(v.value) : v && v.type === 'CallExpression' && v.arguments[0] && v.arguments[0].type === 'Literal' ? String(v.arguments[0].value) : ''); return !(/(?:^|-)(?:close|dismiss|cancel)$/.test(said(d)) || /^(?:Close|Cancel|Dismiss|Not now)$/.test(said(lb))); };
    const isLive = (o) => liveRun((propOf(o, 'run') || {}).value) && !closesOnly(o);
    return { doors, live: doors.filter(isLive), dead: doors.filter((o) => !isLive(o)), opaque };
  }
  const calls = (f, name) => { const R = fileOf(f); return R ? (R.byCallee.get(name) || []) : []; };
  // ── THE SHAPES: how a row's sentence and its door are tied on screen (each kind checked over the surface's AST) ──
  const ancestors = (n) => { const out = []; for (let x = n.parent; x; x = x.parent) out.push(x); return out; };
  const fnsAround = (n) => ancestors(n).filter(isFn);
  const hits = (n, S, tok) => (tok ? srcOf(n).includes(tok) : false) || [...wordsOf(n)].some((k) => S.has(k));
  const VISIBLE = new Set(['textContent', 'innerHTML', 'innerText', 'nodeValue']);
  const ADDS = new Set(['append', 'appendChild', 'prepend', 'replaceChildren', 'insertBefore', 'after', 'before']);
  const TEXT_MAKERS = { el: 2, mk: 2, noteLine: 1, whNote: 0, textNode: 0, createTextNode: 0 };
  const WRITERS = { noteText: [0, 1], setText: [0, 1] };   // the tree's own text writers (utils): (element, words)
  const HF = new Map();
  const helperFns = (call) => { const b = bindingOf(call.callee); if (!b || (b.kind !== 'var' && b.kind !== 'fn')) return []; if (HF.has(b.id)) return HF.get(b.id); HF.set(b.id, []); const fns = valOfBinding(b, new Set()).filter(isFn); HF.set(b.id, fns); return fns; };
  const HS = new WeakMap();
  /** in a helper: a visible write whose words are its parameter #vi, onto its parameter #ti (or an element it closes over) */
  const helperSinks = (fn, depth = 0) => {
    if (depth > 1) return [];
    if (HS.has(fn)) return HS.get(fn);
    HS.set(fn, []);
    const out = [];
    const pIdx = (x, hop = 0) => {
      if (!x || hop > 2) return -1;
      if (x.type === 'LogicalExpression') return pIdx(x.left, hop + 1);
      if (x.type !== 'Identifier') return -1;
      const i = fn.params.findIndex((p) => p.type === 'Identifier' && p.name === x.name);
      if (i >= 0) return i;
      const b = bindingOf(x);   // a local copy of a parameter (const v = text || '')
      return b && b.kind === 'var' && b.decl.init && b.decl.start >= fn.start && b.decl.end <= fn.end ? pIdx(b.decl.init, hop + 1) : -1;
    };
    const st = [fn.body];
    while (st.length) {
      const x = st.pop();
      if (x !== fn.body && isFn(x)) continue;
      if (x.type === 'AssignmentExpression' && x.left.type === 'MemberExpression' && VISIBLE.has(nameOf(x.left.property))) { const vi = pIdx(x.right.type === 'LogicalExpression' ? x.right.left : x.right); if (vi >= 0) out.push({ vi, ti: pIdx(x.left.object), target: x.left.object }); }
      if (x.type === 'CallExpression' && x.callee.type === 'Identifier' && WRITERS[x.callee.name]) { const [wti, wvi] = WRITERS[x.callee.name]; const va = x.arguments[wvi]; const vi = pIdx(va && va.type === 'LogicalExpression' ? va.left : va); if (vi >= 0) out.push({ vi, ti: pIdx(x.arguments[wti]), target: x.arguments[wti] }); }
      else if (x.type === 'CallExpression' && x.callee.type === 'Identifier' && x.callee !== fn) { for (const inner of (x.callee.name !== (fn.parent && fn.parent.id && fn.parent.id.name) ? helperFns(x) : [])) for (const hp of helperSinks(inner, depth + 1)) { const va = x.arguments[hp.vi]; const vi = pIdx(va && va.type === 'LogicalExpression' ? va.left : va); if (vi >= 0) out.push({ vi, ti: hp.ti >= 0 ? pIdx(x.arguments[hp.ti]) : -1, target: hp.ti >= 0 ? x.arguments[hp.ti] : hp.target }); } }
      st.push(...kids(x));
    }
    HS.set(fn, out);
    return out;
  };
  /** every place the file writes WORDS a person reads (never a title / placeholder / aria label): { site, target, value } */
  const SINKS = new Map();
  const sinksOf = (f) => {
    if (SINKS.has(f)) return SINKS.get(f);
    const R = fileOf(f); const out = [];
    if (R) for (const n of R.nodes) {
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && VISIBLE.has(nameOf(n.left.property))) out.push({ site: n, target: n.left.object, value: n.right });
      if (n.type === 'CallExpression') {
        const c = n.callee.type === 'ChainExpression' ? n.callee.expression : n.callee;
        const cn = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' ? nameOf(c.property) : null;
        if (c.type === 'MemberExpression' && ADDS.has(cn)) for (const a of n.arguments) out.push({ site: n, target: c.object, value: a });
        if (cn in TEXT_MAKERS && n.arguments[TEXT_MAKERS[cn]]) out.push({ site: n, target: n, value: n.arguments[TEXT_MAKERS[cn]] });
      }
      if (n.type === 'Property' && nameOf(n.key) === 'textContent' && n.parent && n.parent.type === 'ObjectExpression') out.push({ site: n, target: n.parent.parent || n, value: n.value });
    }
    // a call to a helper that writes one of its arguments as another's words (noteText(el, text), say(text) over a bound element)
    if (R) for (const n of R.nodes) {
      if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || T_FN.test(n.callee.name) || n.callee.name in TEXT_MAKERS || !n.arguments.length) continue;
      if (WRITERS[n.callee.name]) { const [ti, vi] = WRITERS[n.callee.name]; if (n.arguments[vi]) out.push({ site: n, target: n.arguments[ti], value: n.arguments[vi] }); continue; }
      for (const fn of helperFns(n)) for (const hp of helperSinks(fn)) { const v = n.arguments[hp.vi]; if (!v) continue; out.push({ site: n, target: hp.ti >= 0 ? n.arguments[hp.ti] : hp.target, value: v }); }
    }
    SINKS.set(f, out);
    return out;
  };
  // the binding an element expression stands for (an identifier's, or the declarator a maker call initialises)
  const elBinding = (x) => {
    if (!x) return null;
    if (x.type === 'Identifier') return bindingOf(x);
    if (x.type === 'MemberExpression' && x.computed && x.object.type === 'Identifier') return bindingOf(x.object);
    if (x.parent && x.parent.type === 'VariableDeclarator' && x.parent.init === x && x.parent.id.type === 'Identifier') return bindingOf(x.parent.id);
    return null;
  };
  const childrenOf = (c) => { const out = []; for (const a of c.arguments) { if (a.type === 'SpreadElement') out.push(...elementsOf(a.argument)); else if (a.type === 'Identifier') { const b = bindingOf(a); if (b && b.kind === 'forof') out.push(...elementsOf(b.loop.right)); else out.push(a); } else out.push(a); } return out; };
  const isEl = (o, b) => { if (!o || !b) return false; if (sameBinding(elBinding(o), b)) return true; if (o.type === 'MemberExpression' && o.computed && o.object.type === 'Identifier') return elementsOf(o.object).some((e) => sameBinding(elBinding(e), b) || (e.type === 'Identifier' && sameBinding(bindingOf(e), b))); return false; };
  const addsTo = (f, b) => { const R = fileOf(f); const out = []; if (!R || !b) return out; for (const nm of ADDS) for (const c of R.byCallee.get(nm) || []) { const o = c.callee.type === 'MemberExpression' ? c.callee.object : null; if (o && isEl(o, b)) out.push(c); } return out; };
  const handlersOf = (f, b) => { const R = fileOf(f); const out = []; if (!R || !b) return out; for (const a of [...(R.masg.get('onclick') || []), ...(R.masg.get('onchange') || [])]) if (sameBinding(elBinding(a.left.object), b)) out.push(a.right); for (const c of R.byCallee.get('addEventListener') || []) if (c.callee.type === 'MemberExpression' && sameBinding(elBinding(c.callee.object), b) && c.arguments[0] && /^(click|change|keydown)$/.test(String(c.arguments[0].value))) out.push(c.arguments[1]); return out; };
  /** a node that puts a LIVE door on screen: needDoorButton(door) / a button maker with its handler / a needLine with its doors /
   *  a button element whose click handler calls something / a container holding one (one level) */
  function liveDoorNode(f, d, depth = 0) {
    if (!d || depth > 3) return false;
    if (d.type === 'SpreadElement') return liveDoorNode(f, d.argument, depth);
    if (d.type === 'ConditionalExpression') return liveDoorNode(f, d.consequent, depth) || liveDoorNode(f, d.alternate, depth);
    if (d.type === 'LogicalExpression') return liveDoorNode(f, d.right, depth) || (d.operator !== '&&' && liveDoorNode(f, d.left, depth));
    if (d.type === 'CallExpression') {
      const c = d.callee.type === 'ChainExpression' ? d.callee.expression : d.callee;
      const cn = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' ? nameOf(c.property) : null;
      if (cn === 'needDoorButton') { const x = doorsOf(d.arguments[0]); return x.live.length > 0 && x.dead.length === 0; }
      if (cn === 'needLine') { const o = d.arguments[0]; const dp = o && o.type === 'ObjectExpression' ? propOf(o, 'doors') : null; const x = dp ? doorsOf(dp.value) : { live: [], dead: [] }; return x.live.length > 0 && x.dead.length === 0; }
      if (/^(textBtn|btn|button|door)$/.test(cn || '')) { const fa = d.arguments.find((a) => isFn(a) || a.type === 'Identifier'); if (fa) return liveRun(fa); const fns = calleeFns(d, new Set()); return fns.some((fn) => returnsOf(fn).some((r) => liveDoorNode(f, r, depth + 1)) || (handlersInFn(fn).length && handlersInFn(fn).every((h) => liveRun(h)))); }
      if (cn === 'map' && isFn(d.arguments[0])) return returnsOf(d.arguments[0]).some((r) => liveDoorNode(f, r, depth + 1));
      return false;
    }
    if (d.type === 'Identifier') {
      const b = bindingOf(d); if (!b) return false;
      if (b.kind === 'var' && b.decl.init && b.decl.init !== d && liveDoorNode(f, b.decl.init, depth + 1)) return true;
      const hs = handlersOf(f, b);
      if (hs.length && hs.some((h) => liveRun(h))) return true;
      return addsTo(f, b).some((c) => childrenOf(c).some((a) => liveDoorNode(f, a, depth + 1)));
    }
    return false;
  }
  const handlersInFn = (fn) => { const out = []; const st = [fn.body]; while (st.length) { const x = st.pop(); if (x.type === 'AssignmentExpression' && x.left.type === 'MemberExpression' && /^on(click|change)$/.test(nameOf(x.left.property) || '')) out.push(x.right); if (x !== fn.body && isFn(x)) continue; st.push(...kids(x)); } return out; };
  const doorLive = (o) => liveRun((propOf(o, 'run') || {}).value);
  // a door named by its id: an object { door: '<id>', run }, an element with dataset.door = '<id>' and its handler, a maker's id
  function doorsById(f, id) {
    const R = fileOf(f); const out = [];
    if (!R) return out;
    for (const n of R.nodes) {
      if (n.type === 'ObjectExpression') { const q = propOf(n, 'door'); if (q && q.value.type === 'Literal' && q.value.value === id) out.push({ node: n, live: doorLive(n) }); }
      if (n.type === 'AssignmentExpression' && srcOf(n.left).endsWith('.dataset.door') && n.right.type === 'Literal' && n.right.value === id) { const b = elBinding(n.left.object.object); const hs = handlersOf(f, b); out.push({ node: n, live: hs.length > 0 && hs.some((h) => liveRun(h)) }); }
      if (n.type === 'CallExpression' && /^settingsDoor|^pluginsDoor|^pluginDoor|^integrationDoor$/.test(nameOf(n.callee.type === 'Identifier' ? n.callee : n.callee.property) || '')) {
        const mk = nameOf(n.callee.type === 'Identifier' ? n.callee : n.callee.property); const a1 = n.arguments[1];
        const mid = mk === 'settingsDoor' && a1 && a1.type === 'Literal' ? 'settings:' + a1.value : mk === 'pluginsDoor' ? 'plugins' : mk === 'integrationDoor' && a1 && a1.type === 'Literal' ? 'integration:' + a1.value : null;
        if (mid === id) { const x = doorsOf(n); out.push({ node: n, live: x.live.length > 0 && x.dead.length === 0 }); }
      }
    }
    return out;
  }
  const t_sites = (f, S) => { const R = fileOf(f); return R ? R.nodes.filter((n) => n.type === 'CallExpression' && n.callee.type === 'Identifier' && T_FN.test(n.callee.name) && n.arguments[0] && n.arguments[0].type === 'Literal' && S.has(n.arguments[0].value)) : []; };
  const carriers = (f, S, tok) => [...t_sites(f, S), ...sinksOf(f).filter((k) => hits(k.value, S, tok)).map((k) => k.site)];
  const SHAPE = {
    // the sentence IS the words of a needLine call, and the same call's doors hold a live door (every door it can draw is live)
    line(f, S, sh) { for (const c of calls(f, 'needLine')) { const o = c.arguments[0]; if (!o || o.type !== 'ObjectExpression') continue; const w = propOf(o, 'words'); if (!w || !hits(w.value, S, sh.words)) continue; const dp = propOf(o, 'doors'); const x = dp ? doorsOf(dp.value) : { live: [], dead: [] }; if (x.live.length && !x.dead.length) return { ok: true }; } return { ok: false, why: 'no needLine call whose words carry the sentence holds a live door' }; },
    // a toast that says the sentence with its door (`action`) — a live one
    toast(f, S, sh) { for (const c of calls(f, 'showToast')) { if (!c.arguments[0] || !hits(c.arguments[0], S, sh.words)) continue; const o = c.arguments[1]; const acts = []; const walkO = (x) => { if (!x) return; if (x.type === 'ObjectExpression') for (const q of x.properties) { if (q.type === 'SpreadElement') walkO(q.argument); else if (nameOf(q.key) === 'action') acts.push(q.value); } else if (x.type === 'ConditionalExpression') { walkO(x.consequent); walkO(x.alternate); } else if (x.type === 'LogicalExpression') walkO(x.right); }; walkO(o); for (const a of acts) { const x = doorsOf(a); if (x.live.length && !x.dead.length) return { ok: true }; } } return { ok: false, why: 'no showToast that says the sentence carries a live door (action)' }; },
    // the element that SAYS the sentence (or its parent) also holds a live door (needDoorButton / a button with its handler / a needLine)
    element(f, S, sh) { for (const k of sinksOf(f)) { if (!hits(k.value, S, sh.words)) continue; const b = elBinding(k.target); if (!b) continue; if (addsTo(f, b).some((c) => childrenOf(c).some((a) => a !== k.value && liveDoorNode(f, a)))) return { ok: true }; const R = fileOf(f); for (const nm of ADDS) for (const c of R.byCallee.get(nm) || []) { const kids0 = childrenOf(c); if (!kids0.some((a) => sameBinding(elBinding(a), b) || a === k.target)) continue; const pb = c.callee.type === 'MemberExpression' ? elBinding(c.callee.object) : null; if (pb && addsTo(f, pb).some((cc) => childrenOf(cc).some((a) => !sameBinding(elBinding(a), b) && a !== k.target && liveDoorNode(f, a)))) return { ok: true }; } } return { ok: false, why: 'no element that says the sentence (nor its parent) holds a live door' }; },
    // a heading over need lines: the function that says it draws need lines, each with a live door (every door they can draw is live)
    lines(f, S) { const at = carriers(f, S); for (const site of at) for (const fn of fnsAround(site)) { const ls = calls(f, 'needLine').filter((c) => c.start >= fn.start && c.end <= fn.end); if (!ls.length) continue; return ls.every((c) => { const dp = c.arguments[0] && c.arguments[0].type === 'ObjectExpression' ? propOf(c.arguments[0], 'doors') : null; const x = dp ? doorsOf(dp.value) : { live: [], dead: [] }; return x.live.length && !x.dead.length; }) ? { ok: true } : { ok: false, why: 'a need line under the heading holds no live door' }; } return { ok: false, why: 'no need line drawn by the function that says the heading' }; },
    // an HTML template that says the sentence AND carries the door's attribute; the attribute's handler (or a link's href) is live
    html(f, S, sh) { const R = fileOf(f); const attr = sh.html; for (const st of R.nodes.filter((n) => n.type === 'TemplateLiteral' && n.quasis.some((q) => q.value.raw.includes(attr)))) { let top = st; while (top.parent && (top.parent.type === 'BinaryExpression' || top.parent.type === 'TemplateLiteral' || top.parent.type === 'ConditionalExpression' || top.parent.type === 'ParenthesizedExpression')) top = top.parent; if (!hits(top, S, sh.words)) continue; if (/^<a\b|href="https?:/.test(attr) || new RegExp(`<a [^>]*${attr.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}[^>]*href="https?:`).test(srcOf(st))) return { ok: true }; const key = sh.key || attr;
        // a delegated door: `const x = e.target.closest('<key>')` and the branch on x opens something
        for (const c of R.byCallee.get('closest') || []) { const a = c.arguments[0]; if (!a || a.type !== 'Literal' || !String(a.value).includes(key)) continue; let d = c; while (d.parent && d.parent.type !== 'VariableDeclarator' && !/Statement$/.test(d.parent.type)) d = d.parent; const v = d.parent && d.parent.type === 'VariableDeclarator' && d.parent.id.type === 'Identifier' ? d.parent.id.name : null; const fn = fnsAround(c)[0]; if (!v || !fn) continue; if (R.nodes.some((n) => n.type === 'IfStatement' && n.start >= fn.start && n.end <= fn.end && new RegExp(`^${v}\\b`).test(srcOf(n.test)) && (n.consequent.type === 'BlockStatement' ? n.consequent.body.length > 0 : true) && containsCall(n.consequent))) return { ok: true }; }
        const fns = R.nodes.filter((n) => isFn(n) && srcOf(n).length < 4000 && srcOf(n).includes(key) && liveFn(n)); if (fns.length) return { ok: true }; } return { ok: false, why: `no template says the sentence with ${attr} and a live handler for it` }; },
    // a chip that IS the door: the function that says the sentence gives the chip a live handler (`<binding> = () => opener()`)
    chip(f, S, sh) { const R = fileOf(f); const as = R.asg.get(sh.chip) || []; if (!as.length || !as.every((a) => liveRun(a.right))) return { ok: false, why: `the chip's handler ${sh.chip} is missing or empty` }; for (const a of as) { const fn = fnsAround(a)[0]; if (!fn) continue; const said = [...R.asg.values()].flat().filter((x) => x.start >= fn.start && x.end <= fn.end && x.left.type === 'Identifier' && x.left.name !== sh.chip); if (said.some((x) => hits(x.right, S, sh.words))) return { ok: true }; } return { ok: false, why: `the chip's handler ${sh.chip} is not given where its words are said` }; },
    // the door named by its id is live and is built in a function around a place that says the sentence
    beside(f, S, sh) { const ds = doorsById(f, sh.beside); if (!ds.length) return { ok: false, why: `no door ${sh.beside}` }; if (!ds.every((d) => d.live)) return { ok: false, why: `the door ${sh.beside} has an empty handler` }; for (const site of carriers(f, S, sh.words)) for (const fn of fnsAround(site)) if (ds.some((d) => d.node.start >= fn.start && d.node.end <= fn.end)) return { ok: true }; return { ok: false, why: `the door ${sh.beside} is not built where the sentence is said` }; },
    // words said only under a condition (no door: the need is WHERE they are said)
    // a For-you item (the hub filed its words): its door is the item's own — the registry row's (`opens`) or its bucket's
    item(f, S, sh) { const A = fileOf('src/lib/user-todos-actions.js'); if (!A) return { ok: false, why: 'no user-todos-actions.js' }; if (sh.opens) { const rd = A.nodes.find((n) => n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === 'ROW_DOORS' && n.init && n.init.type === 'ObjectExpression'); const q = rd && propOf(rd.init, sh.opens); if (!q || !liveRun(q.value)) return { ok: false, why: `ROW_DOORS.${sh.opens} is missing or empty` }; const R = fileOf(f); return (R.byCallee.get('doorOf') || []).length ? { ok: true } : { ok: false, why: 'the surface never draws the row\'s declared door (doorOf)' }; } if (sh.bucket) { const ifs = A.nodes.filter((n) => n.type === 'IfStatement' && new RegExp(`^key === '${sh.bucket}'$`).test(srcOf(n.test))); return ifs.length && ifs.every((n) => n.consequent.type === 'BlockStatement' ? n.consequent.body.length && containsCall(n.consequent) : containsCall(n.consequent)) ? { ok: true } : { ok: false, why: `the «${sh.bucket}» bucket has no live door` }; } return { ok: false, why: 'an item shape names its door (opens / bucket)' }; },
    guard(f, S, sh) { for (const site of carriers(f, S, sh.words)) for (const a of ancestors(site)) if ((a.type === 'IfStatement' || a.type === 'ConditionalExpression') && srcOf(a.test).includes(sh.guard)) return { ok: true }; return { ok: false, why: `the sentence is said outside «${sh.guard}»` }; },
  };
  const shapesOf = (row) => { const sh = row.door && row.door.present && row.door.present.shape; return (Array.isArray(sh) ? sh : [sh || 'line']).map((x) => (typeof x === 'string' ? { kind: x } : { kind: Object.keys(x).find((k) => k in SHAPE), ...x })); };
  /** a row on one surface: every sentence it states there is carried by one of its declared shapes, with a live door */
  function shapeVerdict(row, f, sentences) {
    const out = [];
    for (const s of sentences) {
      const S = new Set([s]); const tried = [];
      let ok = false;
      for (const sh of shapesOf(row)) { const fnk = SHAPE[sh.kind]; if (!fnk) { tried.push(`unknown shape ${sh.kind}`); continue; } const r = fnk(f, S, sh); if (r.ok) { ok = true; break; } tried.push(`${sh.kind}: ${r.why}`); }
      if (!ok) out.push({ s: s.slice(0, 60), why: tried.join('; ') });
    }
    return out;
  }
  return { shapeVerdict, shapesOf };
}
const uiC = C.find((c) => c.scope === 'ui');
const SHAPE_FOLLOW = new Set(['src/lib/need-line.js']);
/** a row's surfaces, each with the sentences it states (a PURE model's words count for the surfaces `via` names) */
const surfacesOf = (e) => { const by = new Map(); for (const s of e.sentences) for (const f of words.get(s) || []) for (const g of [].concat((e.row.door.via && e.row.door.via[f]) || f)) { SHAPE_FOLLOW.add(f); SHAPE_FOLLOW.add(g); if (!by.has(g)) by.set(g, new Set()); by.get(g).add(s); } return by; };
const shapeRows = uiC ? [...uiC.rows.values()].filter((e) => e.row.door.present).map((e) => ({ e, by: surfacesOf(e) })) : [];
const SR = shapeReader({ follow: SHAPE_FOLLOW, read: (f) => sources.get(f) });
const shapeRed = (R, e, by) => [...by].flatMap(([f, ss]) => R.shapeVerdict(e.row, f, [...ss]).map((x) => ({ f, ...x })));
for (const { e, by } of shapeRows) {
  const red = shapeRed(SR, e, by);
  ok(red.length === 0, `[ui] ${e.row.id}: its words and a live door are drawn together — ${SR.shapesOf(e.row).map((x) => x.kind).join(' / ')} (${[...by.keys()].sort().join(', ')})`, red);
}
// CONTROLS — the three mutants the marker census let through at 152 green (the verifier's mutants.mjs M2b / M4 and mutant-m3b.mjs),
// planted in memory: each is RED here by its row's name while the marker census stays green
const PLANTS = [
  ['ref-release', 'src/lib/channel-account-dialogs.js', "cls: 'dialog-hint', doors: [release] }", "cls: 'dialog-hint', doors: [] }", 'a reference line with its «Release…» taken off (doors: [])'],
  ['remove-failed', 'src/lib/desktop-app-launcher.js', 'run: () => { rclose(); removeRegistered(row, { forget: true, onDone }); } }', 'run: () => { } }', '«Forget it» with its handler emptied'],
  ['mount-offline', 'src/lib/sidebar-mounts.js', "ctx.body.prepend(needLine({ words: tr('“{name}” is offline — a mount works once it is connected.', { name: h.name }), tone: 'off', cls: 'mounts-offline-need', doors: [pairDoor(this.app, h, { kind: 'secondary' })] }));",
    "ctx.body.prepend(needLine({ words: '', tone: 'off', cls: 'mounts-offline-need', doors: [pairDoor(this.app, h, { kind: 'secondary' })] })); ctx.body.firstChild.title = tr('“{name}” is offline — a mount works once it is connected.', { name: h.name });", 'the need words moved into the line\'s title, the marker kept'],
];
for (const [id, f, a, b, what] of PLANTS) {
  const s0 = sources.get(f) || '';
  const planted = s0.split(a).length === 2 ? s0.replace(a, b) : null;
  const row = shapeRows.find((x) => x.e.row.id === id);
  const red = planted && row ? shapeRed(shapeReader({ follow: SHAPE_FOLLOW, read: (g) => (g === f ? planted : sources.get(g)) }), row.e, row.by) : null;
  const markerGreen = planted && row ? doorless(row.e, (g) => (g === f ? planted : sources.get(g) || '')).length === 0 : false;
  ok(!!red && red.length > 0 && red.every((x) => x.f === f) && markerGreen, `CONTROL: ${id} — ${what} — is RED by its name here (the marker census stays green)`, red || { anchor: !!planted, row: !!row });
}

console.log('③ CONTROLS');
const ui = C.find((c) => c.scope === 'ui');
const planted = new Map(words); planted.set('Turn it on in Settings → Frobnicate first', new Set(['src/lib/planted.js']));
const P = census(planted).find((c) => c.scope === 'ui');
ok(P && P.unclaimed.length === 1 && /Frobnicate/.test(P.unclaimed[0].s), 'CONTROL: a new «… in Settings → X» sentence that no row claims is RED by name', P && P.unclaimed);
const fc = ui && ui.rows.get('folder-create');
const stripped = (f) => (f === 'src/lib/path-field.js' ? (sources.get(f) || '').replace(/data-act="tick"/g, 'data-act="gone"') : sources.get(f) || '');
ok(fc && JSON.stringify(doorless(fc, stripped)) === JSON.stringify(['src/lib/path-field.js']), 'CONTROL: the folder field stating «create it?» with its create door taken out is RED by name', fc && doorless(fc, stripped));

console.log('④ THE SERVER\'S ACTS, DRIVEN IN-PROCESS (lane ui-needs-a-button picks 1–2 + the reader\'s list)');
const os = await import('node:os');
const http = await import('node:http');
const { execFileSync } = await import('node:child_process');
const { pathToFileURL } = await import('node:url');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-needs-doors-'));
const FIFO_BOUND_MS = 400;   // the FIFO leg's read bound: this suite WAITS it on purpose (verifier #4: its ci.mjs row can state no less)
const T32 = (c) => String(c).repeat(32);
{
  // for-you-2: a parked ask is a POINTER — its one closer says what stays true; the note's words name the conversation's card
  const FA = require(path.join(REPO, 'src/foryou-actions.js'));
  const parked = (type) => ({ id: 'x', status: 'open', action: { type } });
  ok(typeof FA.isParkedAsk === 'function' && FA.isParkedAsk(parked('main-ask')) && FA.isParkedAsk(parked('helper-ask')) && !FA.isParkedAsk(parked('exit-run-ask'))
    && JSON.stringify(FA.closersOf(parked('main-ask'))) === '["hide"]' && JSON.stringify(FA.closersOf(parked('helper-ask'))) === '["hide"]',
    'for-you-2: a parked ask (main-ask / helper-ask) is a pointer — its ONE closer is the hide («Stop reminding (the conversation stays paused)»), never «Mark done»', typeof FA.closersOf === 'function' ? FA.closersOf(parked('main-ask')) : null);
  const IR = require(path.join(REPO, 'src/inbox-reply.js'));
  const LAY = await import(pathToFileURL(path.join(REPO, 'src/lib/inbox-window-layout.js')).href);
  const pv = LAY.itemView({ id: 'h1', type: 'helper-ask', status: 'open', sessionKey: 'claude:x', createdAt: 1 }, { reply: { show: false, enabled: false, code: 'card_item', why: IR.REPLY_WHY.card_item } });
  ok(pv && pv.reply && !pv.reply.show && pv.reply.code === 'card_item', 'for-you-2: the window\'s VIEW of a parked ask keeps the code its door is drawn off (card_item) — the door reaches the screen', pv && pv.reply);
  ok(IR.REPLY_WHY.card_item === 'Answered on the conversation’s card — open the conversation to answer it', 'for-you-2: the note names the conversation\'s card (never «the helper\'s»); its door «Open the conversation and answer» is on its line', IR.REPLY_WHY.card_item);
}
{
  // reader #1: «Stop reminding (the conversation stays paused)» HOLDS ACROSS A HUB RESTART — a filer never reopens an item the person hid
  // for the same request (main-asks / helper-asks), while a NEW request of the same conversation is still filed
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const drive = (kind) => {
    const dir = fs.mkdtempSync(path.join(TMP, 'parked-'));
    const todos = new UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
    const at = Date.now() - 600000;
    const asks = [{ requestId: 'req-1', toolName: 'Bash', kind: kind === 'main' ? 'permission' : 'helper', at, msgId: 'm1', label: 'Fetch the page' }];
    const session = { _webuiId: 'w1', name: 'Session 1', _historyLoaded: true, _normalizer: { pendingAsks: () => asks.slice(), messageIndex: new Map([['m1', { permission: { requestId: 'req-1', toolName: 'Bash', input: { command: 'echo hi' } } }]]) } };
    const file = kind === 'main' ? 'src/server/main-asks.js' : 'src/server/helper-asks.js';
    const type = kind === 'main' ? 'main-ask' : 'helper-ask';
    const saved = {};
    const fresh = () => { for (const k of Object.keys(require.cache)) if (k.endsWith(file)) delete require.cache[k]; const M = require(path.join(REPO, file)); M.install({ userTodos: todos, sessionKeyFor: () => 'claude:w1', activeSessions: new Map([['w1', session]]), log: { log() {}, warn() {} }, readAskedAt: () => saved, persistAskedAt: (_s, m) => Object.assign(saved, m) }); return M; };
    const items = () => todos._state.items.filter((i) => i.action && i.action.type === type).map((i) => `${i.action.requestId}:${i.status}/${i.resolvedBy || '-'}`);
    const out = [];
    let M = fresh(); M.sync(session); out.push(items());
    const it = todos._state.items.find((i) => i.action && i.action.type === type);
    if (it) todos.setStatus(it.id, 'dismissed', 'user');
    out.push(items());
    // a second ask of the conversation, waiting since before the restart (its card's time is its clock at the first look)
    asks.push({ requestId: 'req-2', toolName: 'Edit', kind: kind === 'main' ? 'permission' : 'helper', at, msgId: 'm2', label: 'Edit the file' });
    M = fresh(); M.sync(session); out.push(items());   // a hub restart: a fresh module, the same store, the asks still wait
    try { todos.stop(); } catch { /* the store's timers */ }
    return out;
  };
  for (const kind of ['main', 'helper']) {
    const r = drive(kind);
    ok(JSON.stringify(r[0]) === '["req-1:open/-"]' && JSON.stringify(r[1]) === '["req-1:dismissed/hidden"]' && r[2].includes('req-1:dismissed/hidden') && r[2].some((x) => /^req-2:open/.test(x)) && r[2].length === 2,
      `reader #1 (${kind}-ask): filed → «Stop reminding» (hidden) → a hub RESTART → still hidden (r.399 picks: reopened); the conversation's OTHER waiting request is still filed`, r);
  }
}
{
  // desktop-apps-27: a .deb FILE that is not there is its own code, never «no such package» (and never handed to an agent)
  const DEB = require(path.join(REPO, 'src/app-kinds/deb.js'));
  const r27 = await DEB.planner({ p: { debPath: '/nonexistent-vs-' + process.pid + '/package.deb' }, kind: 'deb', ret: (x) => x, fsp: fs.promises, path, A: { fmtBytes: (n) => String(n) }, DEB_MAX: 1 << 30 }).catch((e) => ({ threw: String(e && e.message) }));
  const DAL = fs.readFileSync(path.join(REPO, 'src/lib/desktop-app-launcher.js'), 'utf8');
  ok(r27 && r27.ok === false && r27.code === 'file_missing' && /package\.deb$/.test(String(r27.path || '')) && !/'file_missing'/.test((/HAND_OFF_CODES = Object\.freeze\(\[[^\]]*\]/.exec(DAL) || [''])[0]),
    'desktop-apps-27: a .deb that is not there ⇒ code file_missing with its path (r.398: not_found — «no such package» and «let an agent find another way»); it is never a hand-off code', r27);
  const AM = require(path.join(REPO, 'src/app-manifest.js'));
  ok(AM.PLAN_CODES.includes('file_missing') && AM.PLAN_CODES.includes('file_unreadable'), 'reader #9: the plan refusals\' closed set (app-manifest PLAN_CODES) names the two .deb FILE codes', AM.PLAN_CODES);
}
{
  // browser-live-1: the person's STOP — any conversation's own tab without a takeover; never another's / nobody's / a mediated one
  const TB = require(path.join(REPO, 'src/browser-tabs.js'));
  const V = (o) => TB.userTabVerdict({ act: 'stop', ...o });
  ok(TB.USER_TAB_ACTS.includes('stop') && V({ owner: 'agent' }).ok && V({ owner: 'you' }).ok && V({ owner: 'agent', mediated: true }).code === 'mediated_tabs' && V({ owner: 'other' }).code === 'not_your_tab' && V({ owner: 'orphan' }).code === 'not_your_tab'
    && TB.TAB_REFUSALS.includes('stop_failed') && /stopped .* loading/.test(TB.userActsSentence([{ kind: 'tab-stop', title: 'Shop', url: 'https://shop.example/' }])),
    'browser-live-1: a stop is the person\'s on the viewed conversation\'s own tab WITHOUT a takeover (nothing but the load stops), on the person\'s own; another\'s, nobody\'s, a mediated one refused by name; said to the agent at the handback while driving');
  const BS = require(path.join(REPO, 'src/browser-stream.js'));
  const vv = BS.viewerMessageVerdict({ type: 'tab-act', act: 'stop', targetId: T32('A'), rid: 3 });
  ok(vv && vv.kind === 'tab-act' && vv.act === 'stop' && !vv.refusal, 'browser-live-1: the bridge takes a {type: tab-act, act: stop} from a viewer', vv);
  // the bridge's guard, DRIVEN (reader #4): a view a bearer opened is refused agent_forbidden, one with no press from this page not_a_press
  const SBS = require(path.join(REPO, 'src/server/browser-stream.js'));
  const WO = require(path.join(REPO, 'src/write-origin.js'));
  const page = (h) => WO.pageOfUpgrade({ headers: { host: 'vs.test', ...h }, url: '/api/browser/stream' });
  const sr = (viewer, msg) => { if (typeof SBS.stopRefusalOf !== 'function') return 'no stopRefusalOf'; const personPress = WO.isPress(WO.pressOf(viewer.page, 'WS /api/browser/stream tab-act stop')); return SBS.stopRefusalOf(viewer, msg, personPress); };
  const person = { bearer: false, page: page({ 'sec-fetch-site': 'same-origin' }) }, agent = { bearer: true, page: page({ authorization: 'Bearer vsst_' + 'a'.repeat(24) }) }, script = { bearer: false, page: page({}) };
  const r1 = sr(agent, vv), r2 = sr(script, vv), r3 = sr(person, vv), r4 = sr(agent, { ...vv, act: 'switch' });
  ok(r1 && r1.code === 'agent_forbidden' && r1.ok === false && r1.type === 'tab-ack' && r2 && r2.code === 'not_a_press' && r3 === null && r4 === null,
    'browser-live-1 (reader #4): the bridge\'s guard, driven — a stop from a view a BEARER opened ⇒ agent_forbidden, from a page that is no press ⇒ not_a_press; the person\'s page passes; a switch is not judged here', { r1, r2, r3, r4 });
  // the keeper's stop over a FAKE CDP (reader #4): Page.stopLoading on THAT tab through the keeper's own CDP; a refused stop sends nothing
  const KP = require(path.join(REPO, 'src/server/browser-keeper.js'));
  if (typeof KP.personStop !== 'function') ok(false, 'browser-live-1 (reader #4): the keeper\'s stop is driven with a fake CDP — personStop (src/server/browser-keeper.js) is missing');
  else {
    const sent = [], notes = [], unnotes = [];
    let answer = { ok: true };
    const args = (o = {}) => ({ id: T32('B'), owner: 'agent', driving: false, counts: { agent: 2, you: 0 }, row: { title: 'Shop', url: 'https://shop.example/' }, target: { kind: 'lease' },
      withCdpUrl: async (_t, fn) => fn('ws://cdp.test/devtools/browser/fake'), refuse: (v) => { throw Object.assign(new Error(v.error), { code: v.code }); },
      VP: { stopLoadingOf: async (url, id) => { sent.push([url, id]); return answer; } }, note: (x) => { notes.push(x); return { rec: notes.length }; }, unnote: (rec, why) => unnotes.push([rec, why]), ...o });
    const a = await KP.personStop(args());
    const b = await KP.personStop(args({ driving: true }));
    answer = { ok: false, error: 'Not attached to an active page' };
    const c = await KP.personStop(args({ driving: true })).catch((e) => ({ code: e.code }));
    const n0 = sent.length;
    const d = await KP.personStop(args({ owner: 'other' })).catch((e) => ({ code: e.code }));
    ok(a.ok && a.stopped && a.targetId === T32('B') && sent[0] && sent[0][1] === T32('B') && /^ws:/.test(sent[0][0]) && b.ok && notes.length >= 1 && notes[0].kind === 'tab-stop' && notes[0].title === 'Shop'
      && c.code === 'stop_failed' && unnotes.length === 1 && /Not attached/.test(unnotes[0][1]) && d.code === 'not_your_tab' && sent.length === n0,
      'browser-live-1 (reader #4): the keeper\'s stop, driven over a fake CDP — Page.stopLoading on THAT tab (its target id); recorded while driving (said at the handback); a refused stop takes its record back (stop_failed); another conversation\'s tab sends nothing', { a, b, c, d, sent, notes, unnotes });
  }
  // reader #2: the loop fact names WHICH tab loops — loopIn → the row fact → loopBlock → the conversation's fact → the page (its digest too)
  const ST = require(path.join(REPO, 'src/browser-stuck.js'));
  const lp = { urls: ['https://bank.example/a', 'https://bank.example/b'], hosts: ['bank.example'], hops: 12, sinceMs: 9000, runStart: 5, targetId: T32('B') };
  const blk = ST.loopBlock(lp), fact = ST.stuckFact({ loop: { ...ST.loopBlock(lp), runStart: lp.runStart } });
  const BF = require(path.join(REPO, 'src/browser-fact.js'));
  const dg = (id) => BF.factDigest({ key: 'k', using: {}, stuck: { state: 'loop', loop: { urls: lp.urls, targetId: id } } });
  const BD = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  ok(blk.targetId === T32('B') && fact.loop && fact.loop.targetId === T32('B') && dg(T32('A')) !== dg(T32('B')) && /if \(lp\) return \{ state: 'loop', since: lp\.runStart \|\| 0, \.\.\.\(lp\.targetId \? \{ targetId:/.test(BD),
    'reader #2: the loop fact carries the LOOPING tab\'s target id — browser-dialogs loopIn → the row fact (read), loopBlock → the conversation\'s fact (driven), and a loop that moves to another tab is a new digest (the page redraws its doors)', { blk, fact });
}
{
  // machines-1: an ssh machine that refused the key — the PUBLIC half of the key it signs in with, READ (never made), the person's only
  const key = path.join(TMP, 'k');
  execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'needs-doors', '-f', key, '-q']);
  const pub = fs.readFileSync(key + '.pub', 'utf8').trim();
  const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
  fs.mkdirSync(path.join(TMP, 'data'), { recursive: true });
  const H = new HostManager({ dataDir: path.join(TMP, 'data') });
  const id = H.add({ name: 'gpu-01', user: 'ubuntu', host: '127.0.0.1', port: 22, keyPath: key });
  const before = fs.readdirSync(TMP).sort().join(',');
  const readPub = (x, o) => (typeof H.publicKeyOf === 'function' ? H.publicKeyOf(x, o) : { ok: false, code: 'no publicKeyOf (the release)' });
  const a = await readPub(id);
  fs.rmSync(key + '.pub');
  const b = await readPub(id);
  const after = fs.readdirSync(TMP).sort().join(',');
  ok(a.ok && a.keys[0].publicKey === pub && a.keys[0].source === 'file' && b.ok && b.keys[0].publicKey.split(' ').slice(0, 2).join(' ') === pub.split(' ').slice(0, 2).join(' ') && b.keys[0].source === 'derived' && after === before.replace('k.pub,', '').replace(',k.pub', '')
    && !/PRIVATE KEY/.test(JSON.stringify([a, b])) && !fs.existsSync(path.join(TMP, 'data', 'ssh', 'id_ed25519')),
    'machines-1: publicKeyOf reads the PUBLIC half of an existing machine\'s key — its .pub, else derived on the server (ssh-keygen -y); no key is made, no private byte is answered', { a, b });
  // reader #3: THE READ IS BOUNDED — a .pub that never answers (a FIFO: its open waits for a writer forever, as a hung mount's read does)
  // is given up at the bound and the derive answers; r.399 picks: fs.promises.readFile held a threadpool thread and never answered
  const fifo = key + '.pub';
  execFileSync('mkfifo', [fifo]);
  const c = await Promise.race([Promise.resolve(readPub(id, { timeoutMs: FIFO_BOUND_MS })), new Promise((r) => setTimeout(() => r({ hung: true }), 3500))]);
  try { const fd = fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); fs.closeSync(fd); } catch { /* no reader left: nothing waits on it */ }
  const HS = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
  const pk = (/async publicKeyOf\([\s\S]*?\n  \}\n/.exec(HS) || [''])[0];
  ok(c && c.ok && c.keys[0].source === 'derived' && pk && !/fs\.promises|readFileSync|readFile\(/.test(pk),
    'reader #3: a .pub read that never answers (a FIFO standing in for a hung mount) is given up at the bound — the derive answers before the watchdog (a hang is { hung }); publicKeyOf reads through a bounded child, never fs on the hub', { c });
  // GET /api/hosts/:id/public-key — DRIVEN through an in-process app (reader #4 / #7): THE person verdict (routes/vault.js personVerdict)
  const express = require(path.join(REPO, 'node_modules/express'));
  const app = express();
  const calls = [];
  const hosts = { publicKeyOf: async (hid) => { calls.push(hid); return hid === 'h1' ? { ok: true, keys: [{ publicKey: 'ssh-ed25519 AAAAfake needs-doors', source: 'file' }] } : { ok: false, code: 'no_key' }; }, list: () => [], get: () => null, keyInfo: () => ({ exists: false }) };
  const ER = require(path.join(REPO, 'src/server/exit-routes.js'));
  let made = null;
  try { ER.create({ app, rootDir: REPO, AGENT_BIN_DIR: path.join(TMP, 'no-bin'), activeSessions: new Map(), auth: { enabled: false, requestAuthed: () => true, checkToken: () => true }, wss: null, WS_OPEN: 1, bcastAll: () => {}, integrationEnabled: () => true, unpairDialDevice: () => {}, hosts, getExitProxy: () => null, getMounts: () => null, getPortForwards: () => null }); } catch (e) { made = e.message; }
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = srv.address().port;
  const get = (p, headers = {}) => new Promise((res) => { http.get({ host: '127.0.0.1', port, path: p, headers }, (r) => { let body = ''; r.on('data', (d) => { body += d; }); r.on('end', () => { let j = null; try { j = JSON.parse(body); } catch { /* not json */ } res({ status: r.statusCode, code: j && j.code, key: !!(j && j.keys) }); }); }).on('error', (e) => res({ err: e.message })); });
  const SAME = { 'sec-fetch-site': 'same-origin' };
  const rows = {
    page: await get('/api/hosts/h1/public-key', SAME),
    session: await get('/api/hosts/h1/public-key', { ...SAME, authorization: 'Bearer vsst_' + 'x'.repeat(20) }),
    job: await get('/api/hosts/h1/public-key', { ...SAME, authorization: 'Bearer jbt_' + 'y'.repeat(20) }),
    automation: await get('/api/hosts/h1/public-key', { ...SAME, authorization: 'Bearer vsak_' + 'z'.repeat(20) }),
    lowercase: await get('/api/hosts/h1/public-key', { ...SAME, authorization: 'bearer abc123' }),
    crossSite: await get('/api/hosts/h1/public-key', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }),
    noBrowser: await get('/api/hosts/h1/public-key'),
    noKey: await get('/api/hosts/h2/public-key', SAME),
  };
  await new Promise((r) => srv.close(r));
  // verifier #3 (the route): «Add it again with a key…» — POST /api/hosts `replaces` names the ssh machine the new record REPLACES: its
  // name is no clash, and the old record is removed only AFTER the new one is saved (a refused add leaves it as it was); without
  // `replaces` the name is still refused (the host-name-taken refusal)
  {
    fs.mkdirSync(path.join(TMP, 'data-replace'), { recursive: true });
    const H2 = new HostManager({ dataDir: path.join(TMP, 'data-replace') });
    const oldId = H2.add({ name: 'gpu-02', user: 'ubuntu', host: '10.0.0.5', port: 2222 });
    const app2 = express();
    app2.use(express.json());
    let made2 = null;
    try { ER.create({ app: app2, rootDir: REPO, AGENT_BIN_DIR: path.join(TMP, 'no-bin'), activeSessions: new Map(), auth: { enabled: false, requestAuthed: () => true, checkToken: () => true }, wss: null, WS_OPEN: 1, bcastAll: () => {}, integrationEnabled: () => true, unpairDialDevice: () => {}, hosts: H2, getExitProxy: () => null, getMounts: () => null, getPortForwards: () => null }); } catch (e) { made2 = e.message; }
    const srv2 = await new Promise((r) => { const x = app2.listen(0, '127.0.0.1', () => r(x)); });
    const post = (p, body) => new Promise((res) => { const data = JSON.stringify(body); const rq = http.request({ host: '127.0.0.1', port: srv2.address().port, path: p, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (r) => { let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { /* not json */ } res({ status: r.statusCode, id: j && j.id, error: j && j.error }); }); }); rq.on('error', (e) => res({ err: e.message })); rq.end(data); });
    const rows2 = () => H2._state.hosts.map((h) => `${h.name}@${h.host}:${h.port}${h.id === oldId ? ' (old)' : ''}`);
    const taken = await post('/api/hosts', { name: 'gpu-02', user: 'ubuntu', host: '10.0.0.6', port: '2222' });
    const after1 = rows2();
    const refused = await post('/api/hosts', { name: 'gpu-02', user: '', host: '10.0.0.6', port: '2222', replaces: oldId });
    const after2 = rows2();
    const done = await post('/api/hosts', { name: 'gpu-02', user: 'ubuntu', host: '10.0.0.6', port: '2222', replaces: oldId });
    const after3 = rows2();
    await new Promise((r) => srv2.close(r));
    ok(!made2 && taken.status === 400 && JSON.stringify(after1) === '["gpu-02@10.0.0.5:2222 (old)"]' && refused.status === 400 && JSON.stringify(after2) === JSON.stringify(after1)
      && done.status === 200 && done.id && done.id !== oldId && JSON.stringify(after3) === '["gpu-02@10.0.0.6:2222"]',
      'machines-1 (verifier #3): POST /api/hosts `replaces`, DRIVEN — the same name without it is still refused; a refused add leaves the old machine as it was; a saved one REPLACES it (one «gpu-02», the new address; the old record removed only after the new one is saved)', { made2, taken, refused, done, after1, after2, after3 });
  }
  const ERS = fs.readFileSync(path.join(REPO, 'src/server/exit-routes.js'), 'utf8');
  const route = (/app\.get\('\/api\/hosts\/:id\/public-key'[\s\S]*?\n\}\);/.exec(ERS) || [''])[0];
  ok(!made && rows.page.status === 200 && rows.page.key && ['session', 'job', 'automation', 'lowercase'].every((k) => rows[k].status === 403 && rows[k].code === 'human_only' && !rows[k].key)
    && rows.crossSite.status === 403 && rows.crossSite.code === 'cross_site' && rows.noBrowser.status === 403 && rows.noBrowser.code === 'cross_site'
    && rows.noKey.status === 404 && rows.noKey.code === 'no_key' && JSON.stringify(calls) === '["h1","h2"]' && !/generateKey/.test(route) && !/BEARER_KIND/.test(ERS),
    'machines-1 (reader #4 / #7): GET /api/hosts/:id/public-key, DRIVEN — THE person verdict: this page reads the key; any bearer ⇒ 403 human_only, another site or a browser-less caller ⇒ 403 cross_site (never read); no key ⇒ 404 no_key; no local verdict copy, no key made', { made, rows, calls });
  // plugins-integrations-19 (主开发 Q3, words only): the relay address ending /slack/ on a Lark / Google card is ONE page for every provider
  const OSU = fs.readFileSync(path.join(REPO, 'src/oauth-setup.js'), 'utf8');
  ok(/'row\.public': i18nKey\('[^']*one page for Lark, Slack and Google/.test(OSU) && /'row\.own\.tpl': i18nKey\('[^']*one page serves every provider/.test(OSU),
    'plugins-integrations-19: the relay rows say one page serves Lark, Slack and Google (the published path is not renamed)');
  // sidebar-sessions-4: the tick is drawn whether or not the parent exists (one row, its door on the line)
  const PF = fs.readFileSync(path.join(REPO, 'src/lib/path-field.js'), 'utf8');
  ok(/\+ `<label class="pf-tickrow"><input type="checkbox" data-act="tick"/.test(PF) && !/x\.parentOk \? `<label class="pf-tickrow">/.test(PF) && !/nor the folder above — pick another/.test(PF),   // stale-pins: kept — a «gone» check: the old words must stay out
    'sidebar-sessions-4: «create it?» always carries its create on the line — a missing parent too (made with it at use: /api/mkdir is mkdir -p)');
}

console.log('⑤ THE PAGE\'S DOORS, DRAWN AND PRESSED (the client bundled by esbuild — build-version stubbed — over a minimal DOM)');
// ── a minimal DOM: elements with children, classes, data-*, style.cssText, listeners, simple selectors ──
const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function mkStyle() {
  const st = {};
  Object.defineProperty(st, 'cssText', { enumerable: false, get() { return Object.keys(st).filter((k) => st[k] !== '' && st[k] != null).map((k) => `${kebab(k)}: ${st[k]}`).join('; '); }, set(v) { for (const k of Object.keys(st)) delete st[k]; for (const part of String(v || '').split(';')) { const m = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(part); if (m) st[camel(m[1])] = m[2]; } } });
  Object.defineProperty(st, 'setProperty', { enumerable: false, value(k, v) { st[camel(k)] = String(v); } });
  Object.defineProperty(st, 'removeProperty', { enumerable: false, value(k) { delete st[camel(k)]; } });
  return st;
}
let DOC = null;
function matchSel(n, sel) {
  return String(sel).split(',').some((one) => {
    const last = one.trim().replace(/^:scope\s*>\s*/, '').split(/\s*>\s*|\s+/).pop();
    const m = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(last);
    if (!m || n.nodeType !== 1) return false;
    if (m[1] && n.tagName !== m[1].toUpperCase()) return false;
    for (const c of (m[2] || '').split('.').filter(Boolean)) if (!n.classList.contains(c)) return false;
    for (const a of (m[3] || '').match(/\[[^\]]+\]/g) || []) { const am = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(a); if (!am) return false; const v = am[1].startsWith('data-') ? n.dataset[camel(am[1].slice(5))] : n.getAttribute(am[1]); if (am[2] === undefined ? v == null : String(v) !== am[2]) return false; }
    return true;
  });
}
class Nd {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.nodeType = tag === '#text' ? 3 : 1; this.children = []; this.parentNode = null; this.style = mkStyle(); this.dataset = {}; this.attributes = {}; this._text = ''; this._ls = {}; this.className = ''; this.id = ''; this.value = ''; this.disabled = false; }
  get classList() { const n = this; const list = () => String(n.className || '').split(/\s+/).filter(Boolean); return { add: (...c) => { n.className = [...new Set([...list(), ...c])].join(' '); }, remove: (...c) => { n.className = list().filter((x) => !c.includes(x)).join(' '); }, contains: (c) => list().includes(c), toggle: (c, f) => { const has = list().includes(c); const want = f === undefined ? !has : !!f; if (want !== has) { if (want) n.classList.add(c); else n.classList.remove(c); } return want; } }; }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0] || null; }
  get parentElement() { return this.parentNode; }
  get isConnected() { for (let n = this; n; n = n.parentNode) if (n === DOC.body) return true; return false; }
  _drop(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); n.parentNode = null; }
  appendChild(n) { if (n.parentNode) n.parentNode._drop(n); this.children.push(n); n.parentNode = this; return n; }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? textNode(n) : n); }
  prepend(...ns) { for (const n of ns.reverse()) this.insertBefore(typeof n === 'string' ? textNode(n) : n, this.children[0] || null); }
  insertBefore(n, ref) { if (n.parentNode) n.parentNode._drop(n); const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); n.parentNode = this; return n; }
  replaceChildren(...ns) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = ''; this.append(...ns); }
  remove() { if (this.parentNode) this.parentNode._drop(this); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = String(v ?? ''); }
  get innerHTML() { return this._html || ''; }
  set innerHTML(v) { this.children = []; this._text = ''; this._html = String(v ?? ''); }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  hasAttribute(k) { return k in this.attributes; }
  addEventListener(type, f) { (this._ls[type] ||= []).push(f); }
  removeEventListener(type, f) { const l = this._ls[type]; if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } }
  listening(type) { return (this._ls[type] || []).length; }
  dispatchEvent(ev) { for (const f of [...(this._ls[ev.type] || [])]) f(ev); return true; }
  matches(sel) { return matchSel(this, sel); }
  closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matchSel(n, sel)) return n; return null; }
  contains(x) { for (let n = x; n; n = n.parentNode) if (n === this) return true; return false; }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (matchSel(c, sel)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  focus() { DOC.activeElement = this; }
  blur() {}
  select() { this.selected = true; }
  click() { const ev = { type: 'click', target: this, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }; if (typeof this.onclick === 'function') this.onclick(ev); this.dispatchEvent(ev); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  get offsetWidth() { return parseFloat(this.style.width) || 0; }
  get offsetHeight() { return parseFloat(this.style.height) || 0; }
  get offsetLeft() { return parseFloat(this.style.left) || 0; }
  get offsetTop() { return parseFloat(this.style.top) || 0; }
}
const textNode = (s) => { const n = new Nd('#text'); n._text = String(s); return n; };
DOC = new Nd('#document'); DOC.nodeType = 9;
DOC.body = new Nd('body'); DOC.head = new Nd('head'); DOC.documentElement = new Nd('html'); DOC.documentElement.lang = 'en';
let PREVIEW = null, EXEC_COPY = false;
Object.assign(DOC, {
  createElement: (tg) => new Nd(tg), createTextNode: textNode, hidden: false, visibilityState: 'visible', hasFocus: () => true,
  getElementById: (id) => { const walk = (n) => { for (const c of n.children) { if (c.id === id) return c; const r = walk(c); if (r) return r; } return null; }; return walk(DOC.body); },
  querySelector: (sel) => (PREVIEW && /desktop-preview-win/.test(sel) ? PREVIEW : DOC.body.querySelector(sel)), querySelectorAll: (sel) => DOC.body.querySelectorAll(sel),
  execCommand: () => EXEC_COPY,
});
const PREFS = {};
let RELOADS = 0;
Object.assign(globalThis, {
  window: globalThis, document: DOC, localStorage: { getItem: (k) => (k in PREFS ? PREFS[k] : null), setItem: (k, v) => { PREFS[k] = String(v); }, removeItem: (k) => { delete PREFS[k]; } },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: (i) => clearTimeout(i), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} }, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  location: { origin: 'http://vs.test', href: 'http://vs.test/', protocol: 'http:', host: 'vs.test', hostname: 'vs.test', pathname: '/', search: '', hash: '', reload() { RELOADS++; } },
  getComputedStyle: () => ({ getPropertyValue: () => '' }), addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
  CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } },
});
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', languages: ['en'], userAgent: 'node', maxTouchPoints: 0, clipboard: null }, configurable: true, writable: true });
const realFetch = globalThis.fetch;
let FETCH = async () => { throw new Error('no fetch in this leg'); };
globalThis.fetch = (...a) => FETCH(...a);
// ── the client, bundled ONCE (one module instance: one i18n, one utils) ──
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const stubBuildVersion = { name: 'stub-build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
const ENTRY = [['NL', 'need-line'], ['UT', 'utils'], ['SM', 'sidebar-mounts'], ['WN', 'window'], ['LB', 'browser-loop-banner'], ['SU', 'settings-ui'], ['SET', 'settings'], ['SS', 'settings-schema'],
  ['DAL', 'desktop-app-launcher'], ['AID', 'app-install-dialog'], ['UTR', 'user-todos-row'], ['IW', 'inbox-window'], ['LAY', 'inbox-window-layout'], ['OCR', 'oauth-connect-row'], ['BNP', 'browser-new-profile-model'], ['CAD', 'channel-account-dialogs']]
  .map(([k, f]) => `export * as ${k} from './${f}.js';`).join('\n');
let CL = null;
try {
  const out = await esbuild.build({ stdin: { contents: ENTRY, resolveDir: path.join(REPO, 'src/lib'), sourcefile: 'needs-doors-entry.js', loader: 'js' }, bundle: true, format: 'esm', write: false, plugins: [stubBuildVersion], logLevel: 'silent', loader: { '.css': 'empty' } });
  const f = path.join(TMP, 'client.mjs');
  fs.writeFileSync(f, out.outputFiles[0].text);
  CL = await import(pathToFileURL(f).href);
} catch (e) { ok(false, 'the client bundles and imports under the minimal DOM', String(e && e.message).slice(0, 600)); }
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const fn = (m, k) => !!(CL && CL[m] && typeof CL[m][k] === 'function');
if (CL) {
  const { NL, UT, SM, WN, LB, SU, SET, SS, DAL, AID, UTR, IW, OCR, BNP, CAD } = CL;
  // need-line: the door makers DRIVEN (reader #4) — settingsDoor {section} opens the row's whole section; without, Settings searched
  // for the row's own words; integrationDoor with no id opens the window
  {
    const opened = [], ints = [];
    const app = { _settingsUI: { open: (o) => opened.push(o) }, openIntegration: (id) => ints.push(id) };
    const sd = NL.settingsDoor(app, 'spend.unattendedPerIdentityDay', { section: true }), ss = NL.settingsDoor(app, 'browser.maxRunning'), sx = NL.settingsDoor(app, 'no.such.row'), it0 = NL.integrationDoor(app, null), it1 = NL.integrationDoor(app, 'llm');
    for (const d of [sd, ss, it0, it1]) if (d && typeof d.run === 'function') d.run();
    const cat = SS.SETTINGS_SCHEMA['spend.unattendedPerIdentityDay'].category, lab = SS.SETTINGS_SCHEMA['browser.maxRunning'].label;
    ok(sd && ss && sx === null && JSON.stringify(opened) === JSON.stringify([{ category: String(cat) }, { search: String(lab) }]) && JSON.stringify(ints) === '[null,"llm"]' && sd.door === 'settings:spend.unattendedPerIdentityDay',
      'need-line (reader #4): settingsDoor { section } opens the row\'s whole Settings section, plain it searches the row\'s own words, an unknown row draws no door; integrationDoor with no id opens the window', { opened, ints });
    ok(!('needLineHtml' in NL) && !('bindNeedDoors' in NL) && !/needLineHtml|bindNeedDoors/.test(fs.readFileSync(path.join(REPO, 'src/lib/need-line.js'), 'utf8')), 'reader #16: need-line.js has no string twin (needLineHtml / bindNeedDoors — no surface used them; a listener bound with no signal)');
  }
  // reader #0: copyText SAYS whether it copied — the clipboard API, else the textarea fallback's own answer (execCommand)
  {
    const nav = globalThis.navigator;
    const run = async (clip, exec) => { nav.clipboard = clip; EXEC_COPY = exec; return UT.copyText('k'); };
    const got = [await run({ writeText: async () => {} }, false), await run({ writeText: async () => { throw new Error('denied'); } }, true), await run({ writeText: async () => { throw new Error('denied'); } }, false), await run(null, false), await run(null, true)];
    ok(JSON.stringify(got) === '[true,true,false,false,true]', 'reader #0: copyText resolves true / false — the clipboard took it; refused but the fallback copied; refused and the fallback too; no clipboard API and the fallback refused; no API, the fallback copied (r.399: always undefined)', got);
  }
  // machines-1: the ssh error's cause in words (reader #4) and the public-key door's every answer (reader #0 / #8)
  {
    const W = typeof SM.hostErrorWords === 'function' ? SM.hostErrorWords : null;
    const w = (raw) => (W ? W(raw, 'ubuntu@gpu-01') : null);
    const a = w('ubuntu@gpu-01: Permission denied (publickey).'), b = w('ssh: connect to host gpu-01 port 22: Connection refused'), c = w('ssh: connect to host gpu-01 port 22: Connection timed out'), d = w('ssh: Could not resolve hostname gpu-01'), e = w('Host key verification failed.'), f = w('weird');
    ok(a && a.refused && a.words === 'Can’t sign in to ubuntu@gpu-01: it refused the key.' && b && !b.refused && /connection was refused/.test(b.words) && /no answer/.test(c.words) && /name was not found/.test(d.words) && /host key changed/.test(e.words) && f.words === 'Can’t reach ubuntu@gpu-01.',
      'machines-1 (reader #4): an ssh machine\'s error, CLASSIFIED — refused the key (its door: the public key to add) / connection refused / no answer / name not found / host key changed / the rest', { a, b, c, d, e, f });
    class FakeSidebar {}
    SM.installSidebarMounts(FakeSidebar);
    const sb = new FakeSidebar();
    const opened = [];
    sb._hostsData = { key: { exists: false }, hosts: [] };
    sb._showAddHostDialog = (hd, from) => opened.push([hd, from]);
    const nav = globalThis.navigator;
    const press = async (answer, clip = { writeText: async (x) => { clip.got = x; } }, exec = false) => {
      FETCH = answer instanceof Error ? async () => { throw answer; } : async () => ({ ok: answer.status === 200, status: answer.status, json: async () => answer.body });
      nav.clipboard = clip; EXEC_COPY = exec;
      const row = DOC.createElement('div'); DOC.body.appendChild(row);
      const more = DOC.createElement('details'); row.appendChild(more);
      const place = (n) => { for (const o of row.querySelectorAll('.mounts-key-shown')) o.remove(); row.insertBefore(n, more); };
      if (typeof sb._publicKeyDoor !== 'function') return { missing: true };
      await sb._publicKeyDoor({ id: 'h1', name: 'gpu-01', user: 'ubuntu', host: 'gpu-01' }, 'ubuntu@gpu-01', place);
      const shown = row.querySelector('.mounts-key-shown');
      row.remove();
      return { shown, clip, code: shown ? shown.dataset.code : null, words: shown ? (shown.querySelector('.need-words') || shown).textContent : '', field: shown ? shown.querySelector('textarea') : null, doors: shown ? shown.querySelectorAll('button').filter((b) => b.dataset.door !== 'dismiss') : [] };
    };
    const KEY = 'ssh-ed25519 AAAAC3fake needs-doors';
    const okKey = { status: 200, body: { ok: true, keys: [{ publicKey: KEY, source: 'file' }] } };
    const r1 = await press(okKey);
    const r2 = await press(okKey, { writeText: async () => { throw new Error('denied'); } }, false);
    ok(!r1.missing && !r1.shown && r1.clip.got === KEY && r2.shown && r2.code === 'copy_refused' && r2.field && r2.field.value === KEY && r2.field.readOnly === true && /select the key in this field/.test(r2.words) && r2.shown.querySelector('textarea') === r2.field,
      'machines-1 (reader #0): «Copy the public key to add» — copied, it says so; a clipboard that REFUSED shows the key itself in a read-only field on the row, the words pointing at THAT field (r.399: «Copied» either way)', { r1: r1.missing ? 'no _publicKeyDoor' : { shown: !!r1.shown, got: r1.clip.got }, r2: { code: r2.code, words: r2.words, value: r2.field && r2.field.value } });
    const r3 = await press({ status: 404, body: { ok: false, code: 'no_key' } });
    const before3 = opened.length;
    if (r3.doors && r3.doors[0]) r3.doors[0].click();
    const r4 = await press({ status: 404, body: { ok: false, code: 'not_ssh' } });
    const r5 = await press({ status: 403, body: { error: 'x', code: 'human_only' } });
    const r6 = await press(new Error('offline'));
    ok(r3.code === 'no_key' && /^No public key to show/.test(r3.words) && r3.doors.length === 1 && r3.doors[0].dataset.door === 'key-setup' && r3.doors[0].textContent === 'Add it again with a key…' && opened.length === before3 + 1
      && r4.code === 'not_ssh' && /dials in/.test(r4.words) && r4.doors.length === 0 && r5.code === 'human_only' && /shown only to you/.test(r5.words) && r6.code === 'network' && /Could not reach VibeSpace/.test(r6.words),
      'machines-1 (reader #8): a key that cannot be shown says WHY by its code — no key (and «Add it again with a key…»: Add machine\'s create / paste a key) / a dial machine / refused / the hub not reached (r.399: one «no key» toast for all)', { r3: [r3.code, r3.words], r4: [r4.code, r4.words], r5: [r5.code, r5.words], r6: [r6.code, r6.words] });
    // verifier #3: «Add it again with a key…» does what its words say for THIS machine — the door hands the machine to the form; the form
    // is filled from it (name, user, address, port), SAYS it replaces it, and its submit names the record it replaces; the plain
    // «Add machine» is blank and replaces nothing
    const handed = opened.length ? opened[opened.length - 1][1] : null;
    const seen = [];
    const sb3 = new FakeSidebar();
    sb3._hostsData = { key: { exists: true, path: '/k' }, hosts: [] };
    sb3._mountsDialog = (title, fields, submit, onSubmit, opts) => { seen.push({ title, fields, submit, onSubmit, opts }); return {}; };
    sb3._renderMounts = () => {};
    const H3 = { id: 'h1', name: 'gpu-01', user: 'ubuntu', host: 'gpu-01.example', port: 2222 };
    FakeSidebar.prototype._showAddHostDialog.call(sb3, sb3._hostsData, H3);
    FakeSidebar.prototype._showAddHostDialog.call(sb3, sb3._hostsData);
    const [dA, dP] = seen;
    const val = (d, k) => (d && (d.fields.find((x) => x.key === k) || {}).value) || '';
    const note = dA ? dA.fields.filter((x) => x.type === 'note').map((x) => x.value).join(' ') : '';
    const posts = [];
    FETCH = async (url, o) => { posts.push([String(url), o && o.body ? JSON.parse(o.body) : null]); return { ok: true, status: 200, json: async () => (String(url) === '/api/hosts' ? { success: true, id: 'h2' } : { ok: true }) }; };
    if (dA) await dA.onSubmit({ name: val(dA, 'name'), user: val(dA, 'user'), host: val(dA, 'host'), port: val(dA, 'port'), keyChoice: 'default' }, { close() {}, err: { isConnected: true } }).catch(() => {});
    const sent = (posts.find(([u]) => u === '/api/hosts') || [])[1];
    ok(handed && handed.id === 'h1' && dA && ['name', 'user', 'host', 'port'].map((k) => val(dA, k)).join('|') === 'gpu-01|ubuntu|gpu-01.example|2222' && /replaces “gpu-01”/.test(note) && /replace/i.test(dA.submit)
      && sent && sent.replaces === 'h1' && sent.name === 'gpu-01' && sent.port === '2222' && dP && ['name', 'user', 'host'].every((k) => !val(dP, k)) && !dP.fields.some((x) => x.type === 'note') && val(dP, 'port') === '22',
      'machines-1 (verifier #3): «Add it again with a key…» opens THIS machine\'s form — filled from it (name, user, address, port), saying it REPLACES it, its submit naming the record it replaces; the plain Add machine stays blank (r.dcd495a1f: a blank form, the refusing row kept)', { handed: handed && handed.id, fields: dA && dA.fields.map((x) => [x.key, x.value]), submit: dA && dA.submit, sent });
    // the verifier's list for picks 1–2 (closure): the replaced machine's exit grants and port forwards go with its old entry (a new
    // record, a new id) — the note SAYS so, and says to set them again (never carried over)
    ok(/old entry is removed once the new one is saved/.test(note) && /Its exit grants and port forwards go with the old entry — set them again once the machine is added\./.test(note),
      '«Add and replace» (closure, picks 1–2): the form\'s note names what goes with the old entry — its exit grants and port forwards — and says to set them again', note);
    FETCH = async () => { throw new Error('no fetch in this leg'); };
  }
  // machines-1 (verifier #2): the public-key door's answer is the PANEL's, per machine — a Machines re-render (the hosts-updated /
  // mounts-updated broadcast) puts it back on the machine's row; its «Dismiss» ends it, as do the machine's removal and a re-test that passes
  {
    class Sb2 {}
    SM.installSidebarMounts(Sb2);
    const sb2 = new Sb2();
    let onGlobal = null;
    sb2.app = { ws: { onGlobal: (f) => { onGlobal = f; } } };
    sb2.listEl = DOC.createElement('div'); DOC.body.appendChild(sb2.listEl);
    sb2._activeTab = 'mounts';
    const H1 = { id: 'h1', name: 'gpu-01', user: 'ubuntu', host: 'gpu-01', port: 22, keyPath: '/k', keySource: 'app' };
    let hostsNow = [H1];
    const failing = () => ({ ok: false, error: 'ubuntu@gpu-01: Permission denied (publickey).', at: Date.now() });
    sb2._hostStatus = { h1: failing() };
    const KEY2 = 'ssh-ed25519 AAAAC3fake needs-doors-2';
    FETCH = async (url) => {
      const u = String(url);
      const body = u === '/api/mounts' ? { mounts: [], shares: [], rcloneAvailable: true } : u === '/api/hosts' ? { hosts: hostsNow, key: { exists: true } } : u === '/api/mount-tokens' ? { tokens: [] } : u === '/api/machine-mounts' ? { mounts: [] } : /\/public-key$/.test(u) ? { ok: true, keys: [{ publicKey: KEY2, source: 'file' }] } : {};
      return { ok: true, status: 200, json: async () => body };
    };
    globalThis.navigator.clipboard = { writeText: async () => { throw new Error('denied'); } }; EXEC_COPY = false;
    const rowOf = () => sb2.listEl.querySelectorAll('.mounts-row').find((r) => r._hostId === 'h1') || null;
    const answerOf = () => { const r = rowOf(); const a = r && r.querySelector('.mounts-key-shown'); return a ? `${a.dataset.code}:${(a.querySelector('textarea') || {}).value || ''}` : null; };
    const doorOf = (root, name) => (root ? root.querySelectorAll('.need-door').find((b) => b.dataset.door === name) || null : null);
    const ask = async () => { const d = doorOf(rowOf(), 'public-key'); if (d) d.click(); await tick(10); };
    const render = async (ev) => { if (ev && onGlobal) onGlobal({ type: ev }); else await sb2._renderMounts(); await tick(10); };
    let err2 = null;
    const seen2 = {};
    try {
      await render();
      await ask(); seen2.answered = answerOf();
      await render('hosts-updated'); seen2.hostsUpdated = answerOf();
      await render('mounts-updated'); seen2.mountsUpdated = answerOf();
      const dis = doorOf(rowOf() && rowOf().querySelector('.mounts-key-shown'), 'dismiss');
      if (dis) dis.click();
      seen2.dismissed = answerOf(); await render(); seen2.dismissedRerender = answerOf();
      await ask(); sb2._hostStatus.h1 = { ok: true, latencyMs: 5, at: Date.now() }; await render(); sb2._hostStatus.h1 = failing(); await render(); seen2.afterPass = answerOf();
      await ask(); hostsNow = []; await render(); hostsNow = [H1]; await render(); seen2.afterRemove = answerOf();
    } catch (e) { err2 = String((e && e.stack) || e).slice(0, 400); }
    sb2.listEl.remove();
    ok(!err2 && seen2.answered === 'copy_refused:' + KEY2 && seen2.hostsUpdated === seen2.answered && seen2.mountsUpdated === seen2.answered && seen2.dismissed === null && seen2.dismissedRerender === null && seen2.afterPass === null && seen2.afterRemove === null,
      'machines-1 (verifier #2): the public-key door\'s answer (here the key in its field) survives a Machines re-render — the hosts-updated and mounts-updated broadcasts put it back on the machine\'s row; its «Dismiss» ends it, and so do a re-test that passes and the machine\'s removal (r.dcd495a1f: gone at the next render)', { err2, seen2 });
    FETCH = async () => { throw new Error('no fetch in this leg'); };
  }
  // for-you-2: the For-you window's door DRAWN and PRESSED (reader #4), the tray row's closer and its door (reader #4 / #10)
  {
    const it = { id: 'h1', status: 'open', sessionKey: 'claude:x', text: 'A helper needs your approval to use Bash', createdAt: Date.now(), action: { type: 'helper-ask', requestId: 'r1' } };
    const jumps = [];
    const model = { jump: (k, x) => jumps.push([k, x.id]) };
    const el = DOC.createElement('div');
    const v = { reply: { show: false, enabled: false, code: 'card_item', why: 'Answered on the conversation’s card — open the conversation to answer it' } };
    if (fn('IW', 'paintWhy')) IW.paintWhy(el, v.reply.why, v, it, model);
    const btn = el.querySelector('.need-door');
    if (btn) btn.click();
    const el2 = DOC.createElement('div');
    if (fn('IW', 'paintWhy')) IW.paintWhy(el2, 'Background Work item — answer it in the job panel', { reply: { show: false, enabled: false, code: 'job_item', why: 'x' } }, it, model);
    ok(fn('IW', 'paintWhy') && btn && btn.dataset.door === 'jump' && btn.textContent === 'Open the conversation and answer' && /^Answered on the conversation’s card/.test(el.textContent) && JSON.stringify(jumps) === '[["claude:x","h1"]]' && !el2.querySelector('.need-door') && el2.textContent === 'Background Work item — answer it in the job panel',
      'for-you-2 (reader #4): the For-you pane\'s note on a parked ask carries «Open the conversation and answer» — PRESSED, it jumps to the conversation; another note draws no door', { jumps, text: el.textContent });
    const ctx = { t: (x, p) => (p ? x.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)) : x), wordsOf: (i) => i.text, detailOf: () => '', nameFor: () => 'Session 1', replyState: () => ({ show: false }) };
    const FA = require(path.join(REPO, 'src/foryou-actions.js'));
    const pointer = (FA.POINTER_ROWS || []).find((x) => !(FA.PARKED_ASK_TYPES || []).includes(x));
    const html = (item) => UTR.renderRow({ item, band: 2 }, ctx).innerHTML;
    const hp = html(it), hm = html({ ...it, id: 'm1', action: { type: 'main-ask', requestId: 'r2' } }), ho = pointer ? html({ ...it, id: 'p1', text: 'A pointer', action: { type: pointer, requestId: 'r3' } }) : '';
    const attr = (h, cls, a) => { const m = new RegExp(`<button[^>]*class="${cls}[^"]*"[^>]*\\b${a}="([^"]*)"`).exec(h); return m ? m[1] : null; };
    ok(attr(hp, 'ut-act ut-dismiss ut-hide', 'data-label') === 'Stop reminding (the conversation stays paused)' && attr(hm, 'ut-act ut-dismiss ut-hide', 'data-label') === 'Stop reminding (the conversation stays paused)' && (!pointer || attr(ho, 'ut-act ut-dismiss ut-hide', 'data-label') === 'Hide'),
      'for-you-2 (reader #4): the tray row of a parked ask, DRAWN — its one closer says «Stop reminding (the conversation stays paused)»; another pointer\'s says «Hide»', { parked: attr(hp, 'ut-act ut-dismiss ut-hide', 'data-label'), pointer, other: attr(ho, 'ut-act ut-dismiss ut-hide', 'data-label') });
    ok(attr(hp, 'ut-go', 'data-label') === 'Open the conversation and answer' && attr(hp, 'ut-go', 'aria-label') === 'Open the conversation and answer' && /class="ut-go ut-go-answer"/.test(hp) && (!pointer || attr(ho, 'ut-go', 'data-label') === 'Chat'),
      'reader #10: the tray and the phone sheet draw the parked ask\'s door — the row\'s trailing door (its press is the jump to the conversation) says «Open the conversation and answer»; another row\'s says «Chat»', { parked: attr(hp, 'ut-go', 'data-label'), other: attr(ho, 'ut-go', 'data-label') });
    const CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
    ok(/\.ut-go\.ut-go-answer::after \{ white-space: normal;/.test(CSS) && /:has\(> \.ut-go-answer\) > :is\(\.ut-text, \.ut-meta\) \{ margin-right: 104px; \}/.test(CSS), 'reader #10: the longer door wraps inside itself on the phone (never cut), and the row\'s words keep clear of it');
  }
  // browser-live-1: the loop banner's doors — which views draw them and WHICH TAB they act on (reader #2 / #4)
  {
    const rows = [{ targetId: T32('A'), active: true, title: 'Mail' }, { targetId: T32('B'), active: false, title: 'Bank' }];
    const loop = { urls: ['https://bank.example/a', 'https://bank.example/b'], hops: 14, sinceMs: 9000, targetId: T32('B') };
    const rowOf = fn('LB', 'loopTabRowOf') ? LB.loopTabRowOf : () => null, shown = fn('LB', 'loopDoorsShown') ? LB.loopDoorsShown : () => ({});
    const r = rowOf(rows, loop), gone = rowOf(rows.slice(0, 1), loop), none = rowOf(rows, { ...loop, targetId: undefined });
    ok(r === rows[1] && gone === null && none === null, 'reader #2: the banner\'s doors act on the LOOPING tab\'s row (the fact\'s target id) — never the active tab; a looping tab that is not listed (or a fact naming none) gives no row', { r, gone, none });
    const sv = shown({ row: r }), sd = shown({ row: r, driving: true }), sh = shown({ row: r, human: true }), sn = shown({ row: null, driving: true });
    ok(JSON.stringify([sv, sd, sh, sn]) === JSON.stringify([{ stop: true, close: false }, { stop: true, close: true }, { stop: false, close: true }, { stop: false, close: false }]),
      'reader #2 / #4: the show flags — a conversation\'s view may stop; a close only while driving or in the person\'s own window; no looping row ⇒ no door at all', [sv, sd, sh, sn]);
    const acts = [];
    const bn = LB.createLoopBanner(DOC, { stop: () => acts.push(['stop', rowOf(rows, loop)]), close: () => acts.push(['close', rowOf(rows, loop)]) });
    bn.render(loop, null, sv);
    const s1 = bn.parts.stop && bn.parts.stop.style.display === '' && bn.parts.close.style.display === 'none' && bn.parts.stop.textContent === 'Stop loading';
    if (bn.parts.stop) bn.parts.stop.click();
    bn.render(loop, null, sn);
    ok(s1 && acts.length === 1 && acts[0][0] === 'stop' && acts[0][1] === rows[1] && bn.parts.doors.style.display === 'none' && /may propose clearing the site’s stored login/.test(bn.parts.hint.textContent),
      'browser-live-1: the loop banner draws its ways out as DOORS on its line — «Stop loading» pressed stops the LOOPING tab; with no looping row no door is drawn', acts.map((x) => [x[0], x[1] && x[1].title]));
  }
  // window-manager-1: move mode, DRIVEN (reader #4 / #12) — Esc and «Cancel» put the window AND its preview rect back, every listener leaves
  {
    const wm = Object.create(WN.WindowManager.prototype);
    const el = DOC.createElement('div'); el.style.cssText = 'left: 100px; top: 50px; width: 400px; height: 300px; z-index: 7';
    DOC.body.appendChild(el);
    const win = { id: 'w1', element: el, isMaximized: false, isMinimized: false, _isSnapped: false, onResize() {} };
    Object.assign(wm, { windows: new Map([['w1', win]]), zIndex: 50, workspace: { offsetWidth: 1600, offsetHeight: 1000, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 1000 }) }, focusWindow() {}, witnessGeometry() {}, _captureGridBounds() {}, _notify() {}, restore() {} });
    PREVIEW = DOC.createElement('div'); PREVIEW.style.cssText = 'left: 10%; top: 5%';
    const fire = (type, init = {}) => DOC.dispatchEvent({ type, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...init });
    const listening = () => ['mousemove', 'mousedown', 'keydown'].map((x) => DOC.listening(x)).join(',');
    const overlayUp = () => DOC.body.children.some((c) => c.querySelector && c.querySelector('.move-mode-hint'));
    let witnessed = 0;
    wm.witnessGeometry = () => { witnessed++; };
    const run = async (end) => {
      witnessed = 0;
      wm.startMoveMode('w1');
      const hint = DOC.body.querySelector('.move-mode-hint'), cancel = hint ? hint.querySelector('.move-mode-cancel') : null;
      fire('mousemove', { clientX: 900, clientY: 700 });
      await tick(8);
      const moved = { left: el.style.left, preview: PREVIEW.style.left };
      if (end === 'esc') fire('keydown', { key: 'Escape' });
      // verifier #0: a REAL press on «Cancel» — its mousedown reaches the document's CAPTURE listener first (the drop's), then the click
      // comes only to a button still on the page (a mousedown that dropped the window took the hint, and the click never comes)
      let mid = null;
      if (end === 'cancel') { fire('mousedown', { target: cancel || el }); mid = { listening: listening(), overlay: overlayUp(), witnessed }; if (cancel && cancel.isConnected) cancel.click(); }
      if (end === 'drop') fire('mousedown', { target: DOC.body });
      return { moved, mid, cancel: cancel ? cancel.textContent : null, left: el.style.left, top: el.style.top, z: el.style.zIndex, preview: PREVIEW.style.left, listening: listening(), overlay: overlayUp(), witnessed };
    };
    const esc = await run('esc');
    const can = await run('cancel');
    const drop = await run('drop');
    ok(esc.moved.left !== '100px' && esc.moved.preview !== '10%' && esc.left === '100px' && esc.top === '50px' && esc.z === '7' && esc.preview === '10%' && esc.listening === '0,0,0' && !esc.overlay,
      'window-manager-1 (reader #4 / #12): move mode, Esc — the window back EXACTLY where it was, its desktop-preview rect too (processMove moved both live), the overlay gone, every listener removed', esc);
    ok(can.cancel === 'Cancel' && can.left === '100px' && can.preview === '10%' && can.listening === '0,0,0' && !can.overlay,
      'reader #12: the hint carries «Cancel» — a button every input can press (a touch tablet has no Esc); its press does what Esc does, never a drop', can);
    ok(drop.left !== '100px' && drop.listening === '0,0,0' && !drop.overlay, 'window-manager-1 (reader #4): a click drops the window where it is and removes EVERY listener of the mode — the Esc one too', drop);
    ok(can.mid && can.mid.overlay && can.mid.listening === '1,1,1' && can.mid.witnessed === 0 && can.left === '100px' && can.top === '50px' && can.preview === '10%' && can.witnessed === 0 && can.listening === '0,0,0' && !can.overlay && drop.witnessed === 1,
      'window-manager-1 (verifier #0): a REAL press on «Cancel» — its mousedown through the document\'s capture listener is NO drop (the mode still on: the hint up, its three listeners, no placement recorded), the click that follows puts the window back in place; a press anywhere else is the drop', { can, dropWitnessed: drop.witnessed });
    const CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
    const hintCss = (/\.move-mode-hint \{[^}]*\}/.exec(CSS) || [''])[0];
    ok(/box-shadow: var\(--shadow-window\)/.test(hintCss) && !/rgba\(/.test(hintCss) && /\.move-mode-hint > \.move-mode-cancel \{ pointer-events: auto; \}/.test(CSS), 'reader #12: the hint\'s shadow is the theme\'s (--shadow-window, no literal colour); its Cancel takes the pointer (the hint itself lets it through)', hintCss);
    PREVIEW = null; el.remove();
  }
  // desktop-apps-27: «Choose another file…» DRAWN and PRESSED (reader #4); the words without facts are whole (reader #9)
  {
    let repicks = 0;
    const mk = (code, o = {}) => (fn('DAL', 'debRefusalLine') ? DAL.debRefusalLine({ code }, { debPath: '/home/u/app.deb', machine: 'gpu-01', repick: () => { repicks++; }, ...o }) : null);
    const l1 = mk('file_missing'), l2 = mk('file_unreadable'), l3 = mk('not_found'), l4 = mk('file_missing', { debPath: '' });
    const b1 = l1 && l1.querySelector('.need-door');
    if (b1) b1.click();
    ok(l1 && b1 && b1.dataset.door === 'deb-repick' && b1.textContent === 'Choose another file…' && repicks === 1 && /^This file is not on gpu-01: \/home\/u\/app\.deb/.test(l1.textContent) && l2 && /cannot be read on gpu-01/.test(l2.textContent) && l3 === null && l4 === null,
      'desktop-apps-27 (reader #4): a .deb file that is not there DRAWS «Choose another file…» on its line — pressed, the path form reopens; any other refusal draws none', { l1: l1 && l1.textContent, repicks });
    const w = [AID.appRefusalText('file_missing'), AID.appRefusalText('file_unreadable'), AID.appRefusalText('file_missing', { path: '/a.deb' }), AID.appRefusalText('file_missing', { machine: 'gpu-01', path: '/a.deb' })];
    ok(w[0] === 'The .deb file is not there any more.' && w[1] === 'The .deb file cannot be read.' && w[2] === w[0] && w[3] === 'This file is not on gpu-01: /a.deb' && w.every((x) => !/ on : |: $| on \{|\{path\}/.test(x)),
      'reader #9: appRefusalText(file_missing | file_unreadable) with no path / machine is a WHOLE sentence (r.399 picks: «在上找不到这个文件：»)', w);
  }
  // closure 3 (item 2): «A LIVE DOOR» MEANS A PRESS REACHES WHAT ITS WORDS PROMISE — ②b reads a run that calls something (and,
  // since closure 3, not only a closer) as live; what a run's other call DOES it cannot follow. remove-failed's doors are PRESSED
  // here by name: «Forget it» (its own confirm, then the forget request for THIS entry), «Copy the command» (the recipe on the
  // clipboard), «Close» (the dialog gone, nothing sent)
  {
    const sent = [], nav = globalThis.navigator, clip = { writeText: async (x) => { clip.got = x; } };
    const hadElement = Object.prototype.hasOwnProperty.call(globalThis, 'Element');
    if (!hadElement) globalThis.Element = Nd;   // a sheet's close detaches through Element.prototype.remove (utils createModalShell)
    const okBtn = async () => { for (let i = 0; i < 50; i++) { await tick(2); const b = DOC.body.querySelectorAll('button.btn-create').pop(); if (b) return b; } return null; };
    const lineOf = () => DOC.body.querySelectorAll('.desktop-adopt-witness').pop() || null;
    const doorIn = (line, name) => (line ? line.querySelectorAll('.need-door').find((x) => x.dataset.door === name) || null : null);
    FETCH = async (url) => { const u = String(url); sent.push(u); const forget = /\/forget$/.test(u); return { ok: forget, status: forget ? 200 : 500, json: async () => (forget ? { ok: true } : { ok: false, code: 'failed', error: 'the recipe exited 100', output: 'E: frob is held' }) }; };
    nav.clipboard = clip;
    const row = { id: 'app-frob', label: 'Frob', remove: { exec: 'apt-get', args: ['remove', '-y', 'frob'] } };
    const open = async () => { sent.length = 0; if (!fn('DAL', 'removeRegistered')) return null; const p = DAL.removeRegistered(row, { onDone: async () => ({ registry: [] }) }); const c = await okBtn(); if (c) c.click(); await p; return lineOf(); };
    const l1 = await open();
    const asked = sent.slice();
    const cp = doorIn(l1, 'remove-copy'); if (cp) cp.click(); await tick(10);
    const copied = clip.got || null, stays = !!(l1 && l1.isConnected);
    const n0 = sent.length; const cl = doorIn(l1, 'remove-close'); if (cl) cl.click(); await tick(5);
    const closed = !!l1 && !l1.isConnected && sent.length === n0;
    const l2 = await open();
    const fg = doorIn(l2, 'remove-forget'); if (fg) fg.click();
    const c2 = await okBtn(); const confirmWords = c2 ? c2.textContent : null; if (c2) c2.click(); await tick(10);
    const forgot = sent.filter((u) => u === '/api/desktop/apps/app-frob/forget');
    ok(asked.join() === '/api/desktop/apps/app-frob/remove' && !!fg && fg.textContent === 'Forget it' && confirmWords === 'Forget' && forgot.length === 1 && !!l2 && !l2.isConnected,
      'remove-failed (closure 3, item 2): «Forget it» PRESSED reaches its act — its own confirm («Forget»), then the forget request for THIS entry (…/app-frob/forget); the failed dialog closes', { asked, door: fg && fg.textContent, confirmWords, sent: sent.slice(0, 4), open: !!(l2 && l2.isConnected) });
    ok(!!copied && /apt-get remove -y frob/.test(copied) && stays && closed, 'remove-failed (closure 3, item 2): «Copy the command» PRESSED puts the recipe on the clipboard (the dialog stays); «Close» PRESSED closes it and sends nothing', { copied, stays, closed });
    FETCH = async () => { throw new Error('no fetch in this leg'); }; nav.clipboard = null;
    if (!hadElement) delete globalThis.Element;
  }
  // settings-13: «Takes effect after a reload» against the value this PAGE LOADED with, re-judged on the store's change event (reader #4 / #13)
  {
    const path13 = Object.keys(SS.SETTINGS_SCHEMA).find((p) => { const r = SS.SETTINGS_SCHEMA[p]; return r && !r.liveApply && r.type === 'boolean' && !r.store; });
    const sch = SS.SETTINGS_SCHEMA[path13];
    const loadWith = async (vals) => { FETCH = async () => ({ ok: true, status: 200, json: async () => ({ ...vals }) }); const m = new SET.SettingsManager(); await m.load(); FETCH = async () => ({ ok: true, status: 200, json: async () => ({}) }); return m; };
    const line = (m) => { if (!fn('SU', 'SettingsUI') || typeof SU.SettingsUI.prototype._reloadLine !== 'function') return null; const ui = Object.create(SU.SettingsUI.prototype); ui.settings = m; ui.app = {}; const l = ui._reloadLine(path13, sch); if (l) DOC.body.appendChild(l); return l; };
    const m = await loadWith({});
    const l = line(m);
    const shown = () => (l ? l.style.display !== 'none' : null);
    const s0 = shown();
    m.set(path13, !sch.default); const s1 = shown();
    m.set(path13, sch.default); const s2 = shown();
    const m3 = await loadWith({});
    const l3 = line(m3);
    m3.applyRemote({ [path13]: !sch.default });   // another client's change, by the broadcast
    const s3 = l3 ? l3.style.display !== 'none' : null;
    if (l3) l3.remove();
    const door = l && l.querySelector('.need-door');
    if (door) door.click();
    const m2 = await loadWith({});
    m2.set(path13, !sch.default);   // changed EARLIER in the page's life (a quick menu, another window) — before Settings is first drawn
    const l2 = line(m2);
    ok(path13 && l && JSON.stringify([s0, s1, s2, s3]) === '[false,true,false,true]' && door && door.textContent === 'Reload now' && RELOADS === 1 && l2 && l2.style.display !== 'none',
      `settings-13 (reader #4 / #13): a row that takes effect at the next load (${path13}) shows «Takes effect after a reload» + «Reload now» once its value differs from the one this PAGE LOADED with — re-judged on the store's change (this page, another client's broadcast); a value moved before Settings was first drawn shows it too`, { s: [s0, s1, s2, s3], l2: l2 && l2.style.display, reloads: RELOADS });
    if (l) l.remove();
    if (l2) l2.remove();
    FETCH = async () => { throw new Error('no fetch in this leg'); };
  }
  // settings-13 (verifier #1): the reload lines' store listeners leave with the surface that bound them — a Settings window opened on
  // the row, drawn again twice (a re-render, a search keystroke) and closed: ONE listener for the row while it is drawn, NONE after the close
  {
    const path1 = Object.keys(SS.SETTINGS_SCHEMA).find((p) => { const r = SS.SETTINGS_SCHEMA[p]; return r && !r.liveApply && r.type === 'boolean' && !r.store; });
    FETCH = async () => ({ ok: true, status: 200, json: async () => ({}) });
    const m = new SET.SettingsManager(); await m.load();
    const wins = new Map();
    let win = null;
    const app = { settings: m, isMobile: false, wm: { windows: wins, revealWindow() {}, createWindow: (o) => { win = { id: 'settings-1', type: o.type, content: DOC.createElement('div'), onClose: null }; wins.set(win.id, win); DOC.body.appendChild(win.content); return win; } } };
    const counts = [];
    let err1 = null, drawn = false;
    const count = () => (m._listeners && m._listeners[path1] ? m._listeners[path1].size : 0);
    try {
      const ui = new SU.SettingsUI(app);
      const label = String(SS.SETTINGS_SCHEMA[path1].label);
      ui.open({ search: label }); counts.push(count());
      drawn = !!win.content.querySelector('.settings-reload-need');
      const content = win.content.querySelector('.settings-content'), nav = win.content.querySelector('.settings-nav');
      ui._renderContent(content, nav); counts.push(count());
      const inp = win.content.querySelector('.settings-search');
      inp.value = label; inp.oninput(); counts.push(count());
      if (typeof win.onClose === 'function') win.onClose();
      win.content.remove();
      counts.push(count());
    } catch (e) { err1 = String((e && e.stack) || e).slice(0, 400); }
    ok(!err1 && drawn && JSON.stringify(counts) === '[1,1,1,0]',
      `settings-13 (verifier #1): the reload line's store listener (${path1}) leaves with the surface that bound it — one while the row is drawn (open, a re-render, a search keystroke), none after the window closes (r.dcd495a1f: one more per render, kept after the close)`, { err1, drawn, counts });
    FETCH = async () => { throw new Error('no fetch in this leg'); };
  }
  // plugins-integrations-13: the https why's door, DRAWN (reader #4 / #14) — on the default «auto» the line also says what is missing
  {
    const drawn = (mode) => {
      const opened = [];
      const app = { settings: { get: (k) => (k === 'server.https' ? mode : undefined) }, _settingsUI: { open: (o) => opened.push(o) } };
      const box = DOC.createElement('div');
      OCR.renderConnectRow(box, { label: 'Connect', words: {}, whys: { 'self-hosted': 'Connecting needs an https address: turn on Tailscale HTTPS, or paste a Dropline key' } }, { connectWhy: 'self-hosted', account: {} }, () => {}, { app });
      const w = box.querySelector('.oauth-connect-words'), b = w && w.querySelector('.need-door');
      if (b) b.click();
      return { text: w ? w.textContent : '', door: b ? b.textContent : null, opened };
    };
    const au = drawn('auto'), of = drawn('off');
    ok(/HTTPS Certificates for your tailnet in the Tailscale admin console/.test(au.text) && au.door === 'Use my own certificate files…' && au.opened.length === 1 && au.opened[0].search === SS.SETTINGS_SCHEMA['server.https'].label
      && !/Tailscale admin console/.test(of.text) && of.door === 'Turn on HTTPS…' && of.opened.length === 1,
      'plugins-integrations-13 (reader #4 / #14): «Connecting needs an https address» — on the default «auto» the line also says what is missing (the tailnet\'s HTTPS certificates, on Tailscale\'s side) and its door is the row for «My own certificate files»; with https off, «Turn on HTTPS…»', { au, of });
    const VT = fs.readFileSync(path.join(REPO, 'src/lib/voice-teach-ui.js'), 'utf8'), IWS = fs.readFileSync(path.join(REPO, 'src/lib/integrations-window.js'), 'utf8'), PU = fs.readFileSync(path.join(REPO, 'src/lib/plugins-ui.js'), 'utf8');
    ok(/renderConnectRow\(box, DROPLINE_CONNECT, st, rerender, \{ app \}\)/.test(VT) && /renderConnectRow\(box, v\.connect, st, \(\) => refresh\(v\.id\), \{ app \}\)/.test(IWS) && /renderVoiceSheet\([\s\S]{0,120}app: this \}\)/.test(PU) && !/t\('[^']*Services › Integrations/.test(VT + PU),   // stale-pins: kept — a «gone» check: the old words must stay out
      'plugins-integrations-13: both surfaces hand the app to the Connect block (its door is drawn on the voice sheet AND the Integrations card); no wrong menu path in the key link or the chip\'s title');
  }
  // browser-profiles-4: the browser list's needs said ONCE, each with its door's target — the chosen cloud browser's own card
  {
    const rows = [{ id: 'chromium', control: { ok: true } }, { id: 'cloud:browserbase', control: { ok: true } }, { id: 'cloud:kernel', control: { ok: true } }, { id: 'local-window', control: { ok: false, code: 'provider_needs_consent' } }];
    const ch = typeof BNP.providerChoices === 'function' ? BNP.providerChoices({ providers: rows }) : [];
    const needs = typeof BNP.providerNeedsOf === 'function' ? BNP.providerNeedsOf(ch, { chosen: 'cloud:kernel' }) : [];
    const none = typeof BNP.providerNeedsOf === 'function' ? BNP.providerNeedsOf(BNP.providerChoices({ providers: rows.slice(0, 1) })) : null;
    ok(needs.length === 2 && needs[0].need === 'key' && needs[0].integration === 'cloud:kernel' && needs[1].setting === 'window.realDesktopTargets'
      && ch.filter((c) => c.need === 'key').every((c) => !/⚙|→|Integrations/.test(c.note)) && Array.isArray(none) && none.length === 0,
      'browser-profiles-4: the cloud rows no longer say «(⚙ → Integrations)» each — ONE line under the list, its door the chosen cloud browser\'s card; the desktop window\'s consent its switch; nothing when nothing needs it', { needs, notes: ch.map((c) => c.note) });
  }
  // usage-16: on with no key ⇒ the chip is the door to the key's card; a DOOR chip's words wrap in the narrow rail (reader #6)
  {
    const PU = fs.readFileSync(path.join(REPO, 'src/lib/plugins-ui.js'), 'utf8'), CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
    ok(/t\('Add the API key…'\)/.test(PU) && /if \(p\.enabled && !p\.configured && !stopW\) onChip = \(\) => this\.openIntegration\?\.\(p\.integration \|\| 'llm'\)/.test(PU),
      'usage-16: the LLM plugin on with no key — its chip says «Add the API key…» and opens the key\'s card');
    const rule = (/\nbutton\.plugin-chip-primary \{[^}]*\}/.exec(CSS) || [''])[0];
    ok(/white-space: normal/.test(rule) && /text-overflow: clip/.test(rule) && CSS.lastIndexOf(rule) > CSS.indexOf('.plugin-chip { max-width: 100%'),
      'usage-16 (reader #6): a primary chip is a DOOR — its words wrap in the narrow rail, never ellipsized («填写 API ...» at 1440)', rule);
  }
  // the verifier's list for picks 3–6 (#2): «Release…» beside a RULE's reference opens THAT rule's Grant access — the account's does not
  // hold the rule's row. refTarget is the grain each reference's door opens; pressed, the rule's door READS the rule (a rule the
  // account no longer lists is said by the dialog's own words — the account's Grant access never says them)
  {
    const RT = CAD && typeof CAD.refTarget === 'function' ? CAD.refTarget : null;
    const acct = { id: 'mail-1', label: 'Mail' };
    const who = { kind: 'agent', id: 'c1', name: 'alpha' };
    const rRule = { kind: 'access', key: 'pat-1', scope: 'pattern', title: 'title has deploy', principal: who }, rAcct = { kind: 'access', key: 'mail-1', scope: 'account', principal: who }, rConv = { kind: 'access', key: 'k9', convId: 'c9', title: 'Ops', scope: 'conversation', principal: who };
    const tg = RT ? [RT(acct, rRule), RT(acct, rAcct), RT(acct, rConv)] : [];
    let pressed = null;
    if (RT && typeof CAD.showRemoveRefusedDialog === 'function') {
      const seen = [], before = new Set(DOC.body.children);
      FETCH = async (url) => { seen.push(String(url)); return { ok: true, status: 200, json: async () => ({ adapter: { id: 'mail-1', label: 'Mail', patterns: [] } }) }; };
      CAD.showRemoveRefusedDialog({}, acct, [rRule]);
      const line = DOC.body.querySelectorAll('[data-ref-kind="access"]')[0] || null;
      const door = line ? line.querySelector('button') : null;
      if (door) door.click();
      for (let i = 0; i < 20 && !DOC.body.querySelectorAll('.global-toast-body').some((x) => /That rule no longer exists/.test(x.textContent)); i++) await tick(10);
      pressed = { door: door ? door.textContent : null, fetched: seen, said: DOC.body.querySelectorAll('.global-toast-body').map((x) => x.textContent) };
      for (const n of DOC.body.children.filter((c) => !before.has(c))) Nd.prototype.remove.call(n);   // the refusal dialog, the toast
      FETCH = async () => { throw new Error('no fetch in this leg'); };
    }
    ok(tg.length === 3 && tg[0].kind === 'pattern' && tg[0].id === 'pat-1' && tg[0].adapter === acct && tg[1].kind === 'account' && tg[2].kind === 'conversation' && tg[2].conv.id === 'c9'
      && !!pressed && pressed.door === 'Release…' && pressed.fetched.join() === '/api/channels/adapters/mail-1/view' && pressed.said.some((x) => /That rule no longer exists/.test(x))
      && /const target = refTarget\(a, ref\);[\s\S]{0,200}showGrantAccessDialog\(app, target\)/.test(fs.readFileSync(path.join(REPO, 'src/lib/channel-account-dialogs.js'), 'utf8')),
      'channels-accounts-4 (verifier #2, picks 3–6): «Release…» beside a RULE\'s reference opens that RULE\'s Grant access (showGrantAccessDialog {kind: pattern, id}) — pressed, it reads the rule; an account-scope reference opens the account\'s, a conversation\'s its own', { targets: tg.map((x) => x && { kind: x.kind, id: x.id || (x.conv && x.conv.id) || null }), pressed });
  }
  // the verifier's list for picks 3–6 (#6): a door that could not do its act SAYS why on its own line — «Add an SSH machine…» whose
  // answer is an error (fetchJson: null = unreachable, {error}) puts the words on the no-machine line, never a silent press
  {
    const say = typeof NL.sayOnLine === 'function' ? NL.sayOnLine : null;
    const line = NL.needLine({ words: 'No machines yet — add an SSH machine or pair a device.', doors: [{ label: 'x', run: () => {} }] });
    const kids = (n) => n.children.filter((c) => c.classList.contains('need-said'));
    const a1 = say ? say(line, 'Could not open it: Could not reach the server') : null, n1 = kids(line).length;
    const a2 = say ? say(line, 'Could not open it: forbidden') : null, n2 = kids(line).length;
    if (say) say(line, '');
    const n3 = kids(line).length;
    const MA = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
    ok(!!a1 && a1 === a2 && n1 === 1 && n2 === 1 && n3 === 0 && a2.textContent === 'Could not open it: forbidden' && a2.getAttribute('role') === 'alert' && a2.parentNode === null
      && /door: 'add-ssh-host', run: async \(\) => \{ const hd = await fetchJson\('\/api\/hosts'\); if \(hd && hd\.key\) \{[^}]*\} sayOnLine\(noneLine, t\('Could not open it: \{why\}', \{ why: hd && hd\.error \? String\(hd\.error\) : t\('Could not reach the server'\) \}\)\);/.test(MA)
      && /const noneLine = body\.appendChild\(needLine\(\{ words: t\('No machines yet/.test(MA),
      'agents-accounts-6 (verifier #6, picks 3–6): «Add an SSH machine…» that cannot open the form SAYS why on its line (sayOnLine: one .need-said, role=alert, replaced, taken away) — the hub\'s error, or «Could not reach the server»', { n1, n2, n3, said: a2 && a2.textContent });
  }
}
globalThis.fetch = realFetch;

console.log('⑥ THE NEED-WORD NET (reader #5: a sentence that says something failed / is needed / is off / is not set / is missing)');
{
  const UI = TABLES.find((x) => x.scope === 'ui').T;
  // THE FROZEN DEBT (scripts/fixtures/need-debt.json — out of src, where its sentences would read as surfaces to other censuses)
  const DEBT_FILE = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/need-debt.json'), 'utf8'));
  const DEBT = Array.isArray(DEBT_FILE.list) ? DEBT_FILE.list : [];
  const SHAPES = (DEBT_FILE.shapes || []).map((x) => new RegExp(x));
  const needDebtOf = (s) => { const p = String(s).slice(0, 64); return DEBT.includes(p) ? p : SHAPES.find((r) => r.test(String(s))) || null; };
  const claimedBy = (s) => TABLES.some(({ T }) => T.needOf(s) || T.notNeedOf(s));
  const needNet = (ws) => {
    const out = { caught: 0, claimed: 0, debt: new Set(), fresh: [] };
    if (!UI.NET.need) return { ...out, fresh: [{ s: 'the ui table has no NEED net (NET.need)' }] };
    for (const [s, files] of ws) {
      if (!UI.NET.need.test(s)) continue;
      out.caught++;
      if (claimedBy(s)) { out.claimed++; continue; }
      const d = needDebtOf(s);
      if (d) { out.debt.add(String(d)); continue; }
      out.fresh.push({ s, files: [...files] });
    }
    return out;
  };
  const N = needNet(words);
  console.log(`  · the need net catches ${N.caught} sentence(s): ${N.claimed} claimed by a row / a non-need, ${N.debt.size} by the frozen debt (${DEBT.length} entries + ${SHAPES.length} shapes)`);
  ok(N.fresh.length === 0, `every sentence the need net catches is a row, a non-need with its reason, or an entry of the frozen NEED_DEBT — a NEW one is red by its words (${N.caught})`, N.fresh.slice(0, 12));
  const stale = DEBT.filter((p) => !N.debt.has(p)).concat(SHAPES.filter((r) => !N.debt.has(String(r))).map(String));
  ok(stale.length === 0, 'the NEED_DEBT is current — an entry whose sentence is gone or now claimed by a row is taken out (the list only shrinks)', stale.slice(0, 12));
  const NEED_DEBT_CEILING = 361;   // re-frozen at the move onto 2.369.405 (70efb5e10) — it may only go DOWN
  ok(DEBT.length > 0 && DEBT.length <= NEED_DEBT_CEILING, `the NEED_DEBT never grows (${DEBT.length} ≤ ${NEED_DEBT_CEILING})`);
  // CONTROL: the reader's planted sentences (logs-reader/planted.log) — three need sentences the r.399 nets let through, and a direction
  const PLANTED = ['Sign-in failed — the token has expired.', 'This machine needs a key before it can connect.', 'Turn it on in the Advanced section of the settings window.', 'Enable it with the switch below.'];
  const pw = new Map(words); for (const s of PLANTED) pw.set(s, new Set(['src/lib/planted-needs.js']));
  const PN = needNet(pw), PC = census(pw).find((c) => c.scope === 'ui');
  const redNeed = PN.fresh.map((x) => x.s), redNet = PC ? PC.unclaimed.map((x) => x.s) : [];
  ok(PLANTED.slice(0, 3).every((s) => redNeed.includes(s)) && redNet.includes(PLANTED[3]) && PN.fresh.every((x) => PLANTED.includes(x.s)),
    'CONTROL: the reader\'s planted sentences go RED by name — «Sign-in failed…», «This machine needs a key…», «Turn it on in the Advanced section…» (the need net), «Enable it with the switch below.» (the direction net)', { redNeed, redNet: redNet.filter((s) => PLANTED.includes(s)) });
}

console.log('⑦ THE RELEASE FACTS (verifier #4 / #5)');
{
  // verifier #4: the ci.mjs row states this suite's cost truly — never less than what the suite WAITS on purpose (the FIFO read's bound)
  const CI = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8');
  const rowM = /\{ name: 'test-needs-doors', tier: 'fast', why: 'in-process · ([\d.]+) (ms|s)' \}/.exec(CI);
  const statedMs = rowM ? Number(rowM[1]) * (rowM[2] === 's' ? 1000 : 1) : null;
  ok(statedMs !== null && statedMs > FIFO_BOUND_MS, `verifier #4: scripts/ci.mjs's test-needs-doors row states a cost above the ${FIFO_BOUND_MS} ms this suite waits on purpose (the FIFO read's bound) — it states ${rowM ? rowM[1] + ' ' + rowM[2] : 'no time'}`, rowM && rowM[0]);
  // verifier #5: the user CHANGELOG's newest «Fixed» is what a user of the RELEASE notices — none of its bullets names a door the same
  // version ADDS (a defect of a door the release never had is the engineering log's); the three languages keep one bullet count
  const sectionOf = (file) => { const t = fs.readFileSync(path.join(REPO, file), 'utf8'); const top = t.split(/\n## /)[1] || ''; const fixed = (top.split(/\n### /).find((x) => /^(Fixed|修复|修正)\s/.test(x)) || ''); return { head: top.split('\n')[0], fixed: fixed.split('\n').filter((l) => l.startsWith('- ')) }; };
  const en = sectionOf('CHANGELOG.md'), zh = sectionOf('CHANGELOG.zh.md'), ja = sectionOf('CHANGELOG.ja.md');
  const ADDED_DOORS = ['Copy the public key to add', 'Stop loading', 'Close this tab', 'Reload now', 'Add the API key'];   // the doors picks 1–2 ADD (CHANGELOG «Added»)
  const named = en.fixed.filter((b) => ADDED_DOORS.some((d) => b.includes(d)));
  ok(/^2\.369\.\d+ — /.test(en.head) && en.fixed.length > 0 && named.length === 0 && zh.fixed.length === en.fixed.length && ja.fixed.length === en.fixed.length,
    `verifier #5: CHANGELOG ${en.head} «Fixed» says what a user of the release notices — no bullet names a door this version adds (${en.fixed.length} bullets, the same in zh / ja)`, { named, counts: [en.fixed.length, zh.fixed.length, ja.fixed.length] });
}

console.log('⑥ WINDOWS, DIALOGS AND MACHINE ROWS (lane ui-needs-a-button pick 3)');
{
  const { pathToFileURL } = await import('node:url');
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const imp = (f) => import(pathToFileURL(path.join(REPO, f)).href);
  // machines-6: an offline device's state SHORT (the row draws the pairing sheet's door beside it; the whole sentence folded)
  const DA = await imp('src/lib/dial-address-picker.js');
  const short = typeof DA.dialStateShort === 'function' ? [DA.dialStateShort({ state: 'silent', at: Date.now(), host: 'h' }), DA.dialStateShort({ state: 'never', at: Date.now() }), DA.dialStateShort({ state: 'connected', at: Date.now() })] : [];
  const SM = src('src/lib/sidebar-mounts.js');
  ok(/^Offline since \S/.test(short[0] || '') && short[1] === 'Never connected' && short[2] === '' && /const shortOff = dialStateShort\(rs\);[\s\S]{0,300}doors: \[pairDoor\(this\.app, h, \{ kind: 'secondary' \}\)\][\s\S]{0,300}tx\.textContent = dialWords/.test(SM),
    'machines-6: an offline device says «Offline since …» / «Never connected» with «Show the pairing command…» on the row; what to check is folded under it', short);
  const NL = src('src/lib/need-line.js');
  ok(/export function pairDoor\(app, host = null/.test(NL) && /run: \(\) => sb\._showDevicePairDialog\(host \|\| null\)/.test(NL),
    'need-line: pairDoor opens THE pairing sheet (pair-dialog-polish\'s dialog, never changed) — that machine\'s, or a new pairing');
  ok(/doors: \[pairDoor\(this\.app, h, \{ kind: 'primary' \}\)/.test(SM) && /copy\.className = 'btn-cancel'; copy\.textContent = tr\('Copy'\)/.test(SM),
    'machines-29: «Show the pairing command…» is the primary of the elevate dialog; the PowerShell recipe\'s Copy the second way');
  ok(/if \(!h\.dialLive\) \{[\s\S]{0,200}dataset\.door = 'dial-reinstall'[\s\S]{0,200}this\._showGraduateDialog\(\{ \.\.\.h, graduated: false \}\)/.test(SM) && /rm\.className = h\.dialLive \? 'btn-create danger' : 'btn-cancel danger'/.test(SM),
    'machines-27: installed but not dialed in ⇒ «Reinstall…» (the install form again) is the primary, «Remove dial-out» a secondary danger');
  ok(/_offlineMountNeed\(h\) \{[\s\S]{0,400}rs\.state === 'connected'\) return;[\s\S]{0,200}ctx\.body\.prepend\(needLine/.test(SM) && /this\._offlineMountNeed\(h\); \/\/ lane ui-needs-a-button \(storage-5\)/.test(SM),
    'storage-5: a mount onto a dial machine that is not connected says so first, with its pairing sheet on the line (Mount stays live)');
  ok(/if \(e && e\.code === 'host-name-taken'\) e\.door = this\._hostRowDoor\(v\.name, close\)/.test(SM) && /const door = e && e\.door && typeof e\.door\.run === 'function' \? e\.door : null; err\.replaceChildren\(e\.message \|\| tr\('Failed'\), \.\.\.\(door \? \[' ', needDoorButton\(door\)\] : \[\]\)\)/.test(src('src/lib/mounts-dialog.js')),
    'machines-12: a name already taken (ui-language\'s code host-name-taken) carries «Open that machine» on the error line');
  // agents-accounts-6 / -8
  const MA = src('src/lib/manage-agents.js');
  ok(/needLine\(\{ words: t\('No machines yet — add an SSH machine or pair a device\.'\)[\s\S]{0,80}doors: \[addSsh, pairDoor\(this, null/.test(MA) && !/t\('No machines yet — add an SSH host or pair a device in the Remote tab\.'\)/.test(MA),   // stale-pins: kept — a «gone» check: the old words must stay out
    'agents-accounts-6: no machine yet — «Add an SSH machine…» and «Pair a device…» on the line, never «in the Remote tab»');
  ok(/if \(info\.installed && !info\.loggedIn\) \{[\s\S]{0,200}quietLogin \? t\('Log in on this machine…'\)/.test(MA) && !/claude \/login\)…'\)/.test(MA),   // stale-pins: kept — a «gone» check: the old words must stay out
    'agents-accounts-8: the machine login stays a door on its row (quiet beside the named accounts); the menu item names no command');
  // gear-and-system-12
  const AP = src('src/lib/app.js');
  ok(/\]\.filter\(Boolean\);\n\s*if \(sensRows\.length\) sensWrap\.append\(\.\.\.sensRows\);/.test(AP) && /door: 'set-password', run: \(\) => this\._showPasswordDialog\(\)/.test(AP) && !/disabled: !info\.sensitive\./.test(AP),   // stale-pins: kept — a «gone» check: the old words must stay out
    'gear-and-system-12: only the sensitive data that exists is a row (no greyed rows); none ⇒ one line; no password ⇒ «Set a password…»');
  // channels-accounts-4 / outbox-2 / policy-7 / policy-1
  const CA = src('src/lib/channel-account-dialogs.js');
  ok(/function refDoor\(app, a, ref, close\)/.test(CA) && /showGrantAccessDialog\(app, target\)/.test(CA) && /showAccountReachDialog\(app, a\)/.test(CA) && /disc\.dataset\.door = 'disconnect'/.test(CA) && !/same rule as a credential with submounts/.test(CA),   // stale-pins: kept — a «gone» check: the old words must stay out
    'channels-accounts-4: each reference carries «Release…» (its Grant access / Reach & policy), «Disconnect» sits beside them; the rule\'s echo is gone');
  const WV = await imp('src/lib/webhook-view.js');
  const pk = typeof WV.pickerRows === 'function' ? WV.pickerRows([{ id: 'c1', name: 'Billing', delivery: { mode: 'none' } }, { id: 'c2', name: 'Ops', delivery: { mode: 'reply-url' } }]) : [];
  ok(pk.length === 2 && pk[0].disabled && pk[0].why === 'takes no replies' && /if \(pk\.disabled\) \{ m\.body\.appendChild\(needLine\([\s\S]{0,200}door: 'callers', run: \(\) => \{ m\.close\(\); showCallersDialog\(app, slug/.test(src('src/lib/channel-webhook.js')),
    'channels-groups-outbox-2: a caller that takes no replies is its line with «Change delivery…» (Callers…), never a greyed box', pk);
  const CP = require(path.join(REPO, 'src/channel-policy.js'));
  const d1 = typeof CP.policyDoorOf === 'function' ? CP.policyDoorOf({ grain: 'conversation', source: 'conversation' }) : null, d2 = d1 ? CP.policyDoorOf({ grain: 'conversation', source: 'account' }) : null;
  const FE = src('src/lib/channel-filter-editor.js');
  ok(d1 && d1.grain === 'conversation' && d2.grain === 'account' && d1.label === 'Change the sending policy…' && /cap\.code === 'policy-review' && policyAbove\) capNote\.textContent/.test(FE) && /door: 'policy', run \}/.test(FE)
    && /policyAbove: true \}\);/.test(src('src/lib/channel-reach-editor.js')) && /if \(opts\.length === 1\) auth\.appendChild\(el\('span', 'chan-radio-words chan-auth-only', t\('Can only draft \(you approve\)'\)\)\)/.test(FE),
    'channels-policy-7 / -1: a review policy\'s refusal opens WHERE it is set (the conversation\'s or the account\'s Reach & policy); inside Reach & policy it names the row above; one possible answer is said, not a lone radio');
  // browser-profiles-19 / browser-live-13
  const SWm = require(path.join(REPO, 'src/browser-switch.js'));
  const L = SWm.proposalLines({ why: 'sign-in-refused', host: 'shop.example', plan: { kind: 'none' } });
  ok(L && L.none && Array.isArray(L.none.doors) && L.none.doors.join() === 'browser-plugin,agent-browser' && !/⚙|→/.test(L.none.key) && /'browser-plugin': app && typeof app\._pluginInstallDialog === 'function'/.test(src('src/lib/browser-proposal-card.js')),
    'browser-profiles-19: why no switch is offered names its two ways as doors on the card («Install a browser plugin…», «Agent browser…»), no menu path', L && L.none);
  const BP = require(path.join(REPO, 'src/browser-passkey.js'));
  const pw = BP.passkeyWords({ state: BP.PASSKEY_OPEN_CODE, rpId: 'shop.example', id: 'p1' }, null, {});
  ok(pw && pw.settings === 'Passkey settings…' && !/Agent browser panel/.test(pw.line) && /open: 'passkeys'/.test(src('src/lib/browser-live-window.js')) && /if \(r && !pkOpen\.has\(r\.id\)\) pkToggle\(r\);/.test(src('src/lib/browser-trace-view.js')),
    'browser-live-13: a page waiting for a passkey has «Passkey settings…» beside Cancel — the Agent browser panel at that profile, its Passkeys open', pw);
  // closure 3 (item 7): the door is drawn only with a SAVED profile — a conversation's temporary browser has none, so its line names no
  // profile and promises no door: its passkeys are kept with the conversation and removed with it (browser-keeper removeProfile drops
  // a record's passkeys; a temporary browser's record goes with its conversation). The view says the line its door matches
  const pwT = BP.passkeyWords({ state: BP.PASSKEY_OPEN_CODE, rpId: 'shop.example', id: 'p1' }, null, { temporary: true });
  const LW = src('src/lib/browser-live-window.js');
  ok(pwT && pwT.settings === '' && !/profile/i.test(pwT.line) && /^This temporary browser keeps its passkeys with this conversation; they are removed with it\./.test(pwT.line) && /profile’s passkey settings/.test(pw.line)
    && /temporary: !pkPid, deskDoor: door \}/.test(LW) && /if \(pkw\.settings && pkPid && typeof app\.openBrowserProfiles === 'function'\)/.test(LW),
    'browser-live-13 (closure 3): a temporary browser\'s passkey line names no profile and promises no door — its passkeys live with the conversation and go with it; the view passes `temporary` exactly when it draws no «Passkey settings…»', { line: pwT && pwT.line, settings: pwT && pwT.settings });
}

console.log('⑦ ACTS, DEAD ENDS AND COMPANY WORDS (lane ui-needs-a-button pick 4)');
{
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const LA = src('src/lib/desktop-app-launcher.js');
  ok(/door: 'install-recheck'/.test(LA) && /sayDeadEnd\('no_sudo'/.test(LA) && /sayDeadEnd\('no_apt'/.test(LA) && /door: 'install-terminal'/.test(LA) && /door: 'install-xpra-page'/.test(LA) && !/in a terminal there, then check again/.test(LA),   // stale-pins: kept — a «gone» check: the old words must stay out
    'desktop-apps-20 / -21 (M5): no passwordless sudo ⇒ «Open a terminal» + «Check again»; no apt-get ⇒ «Open the xpra download page» + «Check again» + «Close» — on the refusal\'s line; «there» never said of this machine (the machine table\'s marker: door: \'install-recheck\')');
  ok(/dataset\.door = 'registry-install'/.test(LA) && /openAppSearch\(app, machineOf\(host\), \{ query,/.test(LA) && /\{ onDone = null, query = '' \}/.test(src('src/lib/app-install-dialog.js')),
    'desktop-apps-3: a built-in app that is not installed carries «Install…» — the package search with its program\'s name filled in');
  ok(/door: 'remove-forget'/.test(LA) && /door: 'remove-copy'/.test(LA) && /desktop-remove-details/.test(LA) && !/p\.textContent = \[said, r && r\.error\]/.test(LA),   // stale-pins: kept — a «gone» check: the old words must stay out
    'desktop-apps-18: a failed removal says it ONCE with «Forget it» / «Copy the command» / «Close»; the error and output once, under «Details»');
  const CE = src('src/lib/code-editor.js');
  ok(/'● ' \+ t\('Unsaved'\)/.test(CE) && /'✓ ' \+ t\('Saved'\)/.test(CE) && /door: 'disk-keep'/.test(CE) && /m <= \(this\._diskKept \|\| 0\)/.test(CE),
    'desktop-apps-30: the editor\'s marks are words of the page\'s language; a file changed on disk says so with «Reload from disk» / «Keep my changes» (kept = quiet until it changes again)');
  const OS = require(path.join(REPO, 'src/oauth-setup.js'));
  const kOwn = typeof OS.refusalKeys === 'function' ? OS.refusalKeys({ preset: false }) : [], kPre = typeof OS.refusalKeys === 'function' ? OS.refusalKeys({ preset: true }) : [];
  ok(!kOwn.includes('refusal.admin') && kPre.includes('refusal.admin') && !/admin/.test(OS.WORDS.refusal) && /company app/.test(OS.WORDS['refusal.admin'] || ''),
    'M3 (plugins-integrations-20): a company app\'s admin is named only beside a company preset — the refusal line itself assumes none', { kOwn, kPre });
  const SC = src('src/lib/signin-card.js');
  ok(!/Ask your administrator|Your company uses/.test(SC) && /data-door="claude-signup" href="https:\/\/claude\.ai\/"/.test(SC) && !/your company uses/i.test(src('src/lib/setup-flows.js')),   // stale-pins: kept — a «gone» check: the old words must stay out
    'agents-accounts-15 / first-run-6 (M3): no Claude preset kind exists ⇒ the sign-in words are personal; «No Claude account yet?» carries «Sign up at claude.ai»');
  const MP = ['cloud', 'drive', 'gmail', 'onedrive'].map((n) => src(`src/mount-providers/${n}.js`)).join('\n');
  ok(!/below — no terminal needed/.test(MP) && (MP.match(/— no terminal needed/g) || []).length >= 4,   // stale-pins: kept — a «gone» check: the old words must stay out
    'storage-1: no access box points BELOW at its Connect button (drawn above it) — the button is named, no direction');
  const UI = TABLES.find((x) => x.scope === 'ui').T;
  const deferredRows = UI.NEEDS.filter((r) => r.door.deferred).map((r) => r.id);
  const remainder = [...words.keys()].filter((w) => UI.inNet(w) && (UI.needOf(w) || {}).id === 'settings-paths').length;
  ok(deferredRows.length <= 1 && deferredRows.every((id) => id === 'settings-paths') && remainder <= 49,
    `the ui table's deferred remainder is at most ONE row, shrink-only (${remainder} ≤ 49 path sentences, each named in pick 4's report; pick 5 takes it to none)`, { deferredRows, remainder });
}

console.log('⑧ THE LAST SETTINGS PATHS, THE OUTBOX DRAFTER, THE PULL DIALOG (lane ui-needs-a-button pick 5)');
{
  const { pathToFileURL } = await import('node:url');
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const NL = src('src/lib/need-line.js');
  ok(/export function pluginDoor\(app, id/.test(NL) && /app\.openPluginDoor\(\{ plugin: String\(id\) \}\)/.test(NL) && /export function pluginsDoor\(app/.test(NL) && /app\.openPluginsDialog\(\)/.test(NL),
    'need-line: pluginDoor (a plugin\'s own settings — its sheet / rows / the list) and pluginsDoor (the Plugins list) over the openers the app has');
  // the engine fact line: what it says is missing, as a door's target (PURE)
  const BB = await import(pathToFileURL(path.join(REPO, 'src/lib/browser-build-model.js')).href);
  const fd = typeof BB.engineFactDoor === 'function' ? BB.engineFactDoor : () => 'none';
  const gone = fd({ defaultEngine: { value: 'plugin:ghost', source: 'user' }, engines: [] });
  const bare = fd({ defaultEngine: { value: 'default' }, engines: [{ id: 'kern', source: 'user', binary: { code: 'browser_engine_kernel_missing' } }] });
  const fine = fd({ defaultEngine: { value: 'default' }, engines: [{ id: 'kern', source: 'user', measuredVersion: '1' }] });
  ok(gone && gone.plugins === true && bare && bare.plugin === 'kern' && fine === null && /engineFactDoor\(r\)[\s\S]{0,200}pluginDoor\(this\.app, fd\.plugin/.test(src('src/lib/settings-ui.js')),
    'engine fact: the named engine not running ⇒ the Plugins list; an owner\'s engine with no program ⇒ that plugin\'s settings; nothing missing ⇒ no door', { gone, bare, fine });
  // For you: the lapsed-subscription notice lands where it is answered (the «accounts» bucket's door = Manage Agents)
  ok(/todos\.add\('accounts', mode === 'off' \?/.test(src('src/server/usage-pool-engine.js')) && /if \(key === 'accounts'\) \{ close\(\); app\._showAgentsDialog/.test(src('src/lib/user-todos-actions.js')),
    'pool-serve: the lapsed notice is filed under For you\'s «accounts» bucket — its door opens Manage Agents (never «Session not found»)');
  const FA = require(path.join(REPO, 'src/foryou-actions.js'));
  const cc = (FA.ROWS || []).find((r) => r.type === 'cli-check-again') || {};
  ok(cc.checkOffSetting === 'accounts.cliSelfMeasure' && !/in Settings/.test(String((cc.checkSaid || {}).off || '')) && /r\.state === 'off' && checkRow\.checkOffSetting \? \{ action: settingsDoor\(app, checkRow\.checkOffSetting/.test(src('src/lib/user-todos-actions.js')),
    'cli-check-again: a check that is turned off says so and its toast opens the switch the row declares (checkOffSetting)', cc.checkOffSetting);
  // the billing menu: a greyed row named the setting — now the menu's last row opens it
  ok(/shipBlocked = true;/.test(src('src/lib/session-lifecycle.js')) && /if \(shipBlocked\) \{ const d = settingsDoor\(this, 'accounts\.shipSubscriptionToRemote'/.test(src('src/lib/session-lifecycle.js')),
    'billing menu: a login that cannot ship adds ONE row that opens «Ship subscription logins to remote hosts»');
  // channels-groups-outbox-4: the drafter on EVERY Outbox row; an agent's name filters the list
  const OB = src('src/lib/channel-outbox.js');
  const rowFn = OB.slice(OB.indexOf('export function renderProposalRow('), OB.indexOf('export function renderProposalRow(') + 4000);
  ok(/drafterFilterOf\(app, p\)[\s\S]{0,200}'chan-orow-drafter', drafterLabel\(p\)/.test(rowFn) && /app\.openChannelOutbox\(\{ filter: f \}\)/.test(rowFn),
    'channels-groups-outbox-4: every Outbox row says who drafted it; an agent\'s name filters the list to its drafts (no longer only in the right-click menu)');
  // storage-5, the PULL direction: the same offline line + pairing door as the push dialog
  const SM = src('src/lib/sidebar-mounts.js');
  const pull = SM.slice(SM.indexOf('    _showMachinePullDialog(h) {'), SM.indexOf('    _showMachinePullDialog(h) {') + 3000);
  ok(/this\._offlineMountNeed\(h\); \/\/ lane ui-needs-a-button pick 5 \(storage-5, the PULL direction\)/.test(pull),
    'storage-5 (pull): «Mount a folder from …» on an offline machine says so first, with its pairing door (as the push dialog)');
}

console.log('⑨ THE OUTBOX POINTER\'S DOOR (lane ui-needs-a-button pick 6 — 主开发\'s ruling on pick 5\'s report: a new For-you action type)');
{
  const os = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const FA = require(path.join(REPO, 'src/foryou-actions.js'));
  const doorOf = typeof FA.doorOf === 'function' ? FA.doorOf : () => null;   // (the release has none: its legs red by name, never a crash)
  const row = (FA.ROW_OF || {})['open-outbox'] || null;
  const item = (o = {}) => ({ id: 'ut-ob00000001', status: 'open', kind: 'action', origin: 'channels', by: 'agent', sessionKey: 'channels', createdAt: 1, text: 'New messages awaiting approval on R4 mail', action: { type: 'open-outbox', adapterId: 'mail-1' }, ...o });
  const d = doorOf(item());
  ok(!!row && row.handled === true && row.card === 'none' && row.identity === 'adapterId' && row.producer === 'src/server/channels-outbound.js' && !row.closer && !row.decide && !!d && d.opens === 'outbox' && d.verb === 'Open the Outbox' && doorOf('open-outbox') === d,
    'the registry: open-outbox is a row — one pointer per ACCOUNT (identity adapterId), filed by the channels engine — that DECLARES its door: «Open the Outbox», which opens the Outbox', row);
  ok(doorOf(item({ action: undefined })) === null && doorOf({ id: 'x', status: 'open', action: { type: 'open-channel', adapterId: 'a', convId: 'c', key: 'k' } }) === null && JSON.stringify(FA.closersOf(item())) === '["done","dismiss"]',
    'a pointer filed before this change (no action) has no door — no button until it is filed again; a conversation\'s pointer keeps its own door; the item keeps its closers (✓ ✕)', FA.closersOf(item()));
  // THE WINDOW'S VIEW (PURE itemView — the caller hands it the registry's door, as it hands the closers): «Open the Outbox» FIRST
  const LAY = await import(pathToFileURL(path.join(REPO, 'src/lib/inbox-window-layout.js')).href);
  const view = (it) => LAY.itemView(it, { t: (k) => k, door: doorOf(it), closers: FA.closersOf(it) });
  const v = view(item()), vOld = view(item({ action: undefined })), vDone = view(item({ status: 'done', resolvedAt: 2 }));
  ok(v.actions[0] === 'door' && !!v.door && v.door.verb === 'Open the Outbox' && v.door.opens === 'outbox' && v.actions.includes('done') && v.actions.includes('dismiss') && !vOld.actions.includes('door') && !vDone.actions.includes('door'),
    'the For-you window\'s view: an open pointer draws «Open the Outbox» first, its ✓ ✕ beside it; one with no action draws none; a resolved one none', { open: v.actions, old: vOld.actions, done: vDone.actions });
  // THE STORE: one pointer per account — two accounts under the same label are two items; a re-file of one account is its item
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-needs-ob-'));
  let u = null;
  try {
    u = new UserTodoManager({ dataDir: dir, onChange: () => {}, expirySweepMs: 0 });
    const file = (adapterId) => u.add('channels', { origin: 'channels', urgency: 'normal', by: 'agent', sessionName: 'Channels', text: 'New messages awaiting approval on Mail', action: { type: 'open-outbox', adapterId } });
    const a = file('mail-1'), b = file('mail-2'), c = file('mail-1');
    ok(a.id !== b.id && c.id === a.id && u.get(b.id).action.adapterId === 'mail-2' && !!doorOf(u.get(a.id)), 'the store: two accounts under one label are TWO pointers, each with its door; a re-file of one account is its item', { a: a.id, b: b.id, c: c.id });
  } finally { try { if (u) u.stop(); } catch { } fs.rmSync(dir, { recursive: true, force: true }); }
  // THE ACT — source pins: src/lib/user-todos-actions.js imports need-line.js (unimportable unbuilt); the row renderer draws off doorOf
  const ACT = src('src/lib/user-todos-actions.js');
  ok(/const ROW_DOORS = \{ outbox: \(\) => app\.openChannelOutbox\?\.\(\) \};/.test(ACT) && /const rd = rowDoorOf\(item\);\s*\n\s*if \(rd\) \{ close\(\); ROW_DOORS\[rd\.opens\]\(item\); return; \}/.test(ACT) && /\|\| !!rowDoorOf\(item\)\n/.test(ACT),
    'the act: the jump opens THE Outbox (app.openChannelOutbox, no filter — its census opens on what waits) for an item whose row declares the door; isDoor says so (a tap on the row\'s body opens it too)');
  ok(/if \(e\.target\.closest\('\.ut-door'\)\) \{ const rec = byId\(id\); if \(rec\) jump\(rec\.sessionKey, rec\); return; \}/.test(src('src/lib/user-todos-panel.js')),
    'the tray: a press on «Open the Outbox» is THE door (model.jump) — the popup, the mini inbox, the phone sheet and the chat card share rowClick');
  const OB = src('src/server/channels-outbound.js'), at = OB.indexOf('async function composePointerSync(');
  ok(at > 0 && /userTodos\.add\(INBOX_KEY, \{\s*\n[^\n]*\n\s*action: \{ type: 'open-outbox', adapterId \},/.test(OB.slice(at, at + 2400)),
    'the producer: the account\'s pointer is filed with its action { type: \'open-outbox\', adapterId }');
  // CONTROL: the census over both surfaces (`via` names two) — the row's door taken out is RED by name
  const ob = ui && ui.rows.get('outbox-pointer');
  const noDoor = (f) => (f === 'src/lib/user-todos-row.js' ? (sources.get(f) || '').replace(' + doorHtml(i, t)', '') : sources.get(f) || '');
  ok(!!ob && !!ob.row.door.present && [...ob.files].sort().join() === 'src/lib/inbox-window.js,src/lib/user-todos-row.js' && JSON.stringify(doorless(ob, noDoor)) === JSON.stringify(['src/lib/user-todos-row.js']),
    'CONTROL: the pointer\'s sentence is stated by the tray row AND the For-you window (`via`); the row without its door is RED by name', ob && { files: [...ob.files], red: doorless(ob, noDoor) });
}

// ── THE STORED-WORDS READER (closure 3, item 1) — the words a For-you producer STORES with its item: its `i18n` (text / source a
// line, detail lines, each line's key, its WORDS and clause params, its fold), read from the tree by acorn. A filing = a call of the
// STORE's filing methods (the methods of src/user-todos.js's class that take an item's `i18n`: add, redrawItem) whose RECEIVER holds
// the store — closure 4: found by what the receiver holds, never by its spelling (placeOf below: `t = T()`, `ut = forYou()` and
// `this.userTodos` are followed to the store; a receiver it cannot place is UNPLACED, red by name). The item's i18n is followed
// through bindings and reassignments, calls and returns (a model's function, a required module's export, a method by its name),
// a helper's parameters (its callers in the file, a property method's callers by name, an exported factory's callers in the files
// that require it, a class constructor's `new`, an iterator's element), `this.k` (what the class sets it to), until a key is a
// literal. A line whose key it cannot read is OPEN (red); a fact a producer hands in as a param is not a word of the item. Files: a
// Map path → source (this tree, or the release's from git; src/ outside src/lib, and server.js — where the hub builds the store).
function storedWordsReader({ files, acorn, shared = { recs: new Map(), idx: new Map(), scopes: new WeakMap(), binds: new WeakMap(), rets: new WeakMap() } }) {
  const FILES = files;
  const kids = (n) => { const out = []; for (const k in n) { if (k === 'parent' || k === 'file') continue; const v = n[k]; if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') out.push(x); } else if (v && typeof v.type === 'string') out.push(v); } return out; };
  const P = new Map(); let parsed = 0;
  const parse = (f) => {
    if (P.has(f)) return P.get(f);
    const src = FILES.get(f); let rec = src == null ? null : shared.recs.get(f + '\0' + src.length) ;
    if (rec && rec.src !== src) rec = null;
    if (src != null && !rec) {
      let ast = null;
      for (const sourceType of ['script', 'module']) { try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }); break; } catch { /* the other */ } }
      parsed++;
      if (ast) {
        const nodes = [], st = [[ast, null]];
        while (st.length) { const [n, p] = st.pop(); n.parent = p; n.file = f; nodes.push(n); for (const c of kids(n)) st.push([c, n]); }
        const byCallee = new Map(), asg = new Map(), byNew = new Map(), ids = new Map();
        const put = (m, k, v) => { if (k == null) return; let x = m.get(k); if (!x) m.set(k, x = []); x.push(v); };
        for (const n of nodes) {
          if (n.type === 'CallExpression') { const c = n.callee.type === 'ChainExpression' ? n.callee.expression : n.callee; put(byCallee, c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : null, n); }
          if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') put(asg, n.left.name, n);
          if (n.type === 'Identifier') put(ids, n.name, n);
          if (n.type === 'NewExpression') put(byNew, n.callee.type === 'Identifier' ? n.callee.name : n.callee.type === 'MemberExpression' && !n.callee.computed ? n.callee.property.name : null, n);
        }
        rec = { f, src, ast, nodes, byCallee, asg, byNew, ids };
        shared.recs.set(f + '\0' + src.length, rec);
      }
    }
    P.set(f, rec || null);
    return rec || null;
  };
  const isFn = (n) => !!n && /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type);
  const nameOf = (k) => (k && (k.type === 'Identifier' ? k.name : k.type === 'Literal' ? String(k.value) : null));
  const srcOf = (n) => (P.get(n.file) || parse(n.file)).src.slice(n.start, n.end);
  const calleeOf = (c) => (c.callee.type === 'ChainExpression' ? c.callee.expression : c.callee);
  // ── bindings (scopes read once per AST, shared between trees) ──
  const patNames = (p, pathTo = [], out = []) => {
    if (!p) return out;
    if (p.type === 'Identifier') out.push({ name: p.name, path: pathTo, id: p });
    else if (p.type === 'ObjectPattern') for (const q of p.properties) { if (q.type === 'RestElement') patNames(q.argument, pathTo, out); else patNames(q.value, [...pathTo, nameOf(q.key)], out); }
    else if (p.type === 'ArrayPattern') p.elements.forEach((e, i) => patNames(e, [...pathTo, i], out));
    else if (p.type === 'AssignmentPattern') { for (const x of patNames(p.left, pathTo, [])) out.push({ ...x, dflt: p.right }); }
    else if (p.type === 'RestElement') patNames(p.argument, pathTo, out);
    return out;
  };
  const scopeNames = (n) => {
    if (shared.scopes.has(n)) return shared.scopes.get(n);
    const m = new Map(); const put = (k, b) => { if (!m.has(k)) m.set(k, b); };
    const stmts = (list) => { for (const s0 of list) { const d = s0 && (s0.type === 'ExportNamedDeclaration' ? s0.declaration : s0); if (!d) continue; if (d.type === 'VariableDeclaration') for (const v of d.declarations) for (const x of patNames(v.id)) put(x.name, { kind: 'var', decl: v, path: x.path, id: x.id }); if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) put(d.id.name, { kind: 'fn', node: d, id: d.id }); } };
    if (isFn(n)) { n.params.forEach((p, i) => { for (const x of patNames(p)) put(x.name, { kind: 'param', fn: n, index: i, path: x.path, dflt: x.dflt, id: x.id }); }); if (n.type === 'FunctionExpression' && n.id) put(n.id.name, { kind: 'fn', node: n, id: n.id }); }
    else if (n.type === 'BlockStatement' || n.type === 'Program' || n.type === 'StaticBlock') stmts(n.body);
    else if (n.type === 'SwitchCase') stmts(n.consequent);
    else if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type === 'VariableDeclaration') for (const x of patNames(n.left.declarations[0].id)) put(x.name, { kind: 'forof', loop: n, path: x.path, id: x.id });
    else if (n.type === 'ForStatement' && n.init && n.init.type === 'VariableDeclaration') stmts([n.init]);
    else if (n.type === 'CatchClause' && n.param) for (const x of patNames(n.param)) put(x.name, { kind: 'catch', id: x.id });
    shared.scopes.set(n, m); return m;
  };
  const bindingOf = (id) => { if (shared.binds.has(id)) return shared.binds.get(id); let r = null; for (let n = id.parent; n && !r; n = n.parent) { const m = scopeNames(n); if (m.has(id.name)) r = m.get(id.name); } shared.binds.set(id, r); return r; };
  const returnsOf = (fn) => { if (fn.type === 'ArrowFunctionExpression' && fn.expression) return [fn.body]; if (shared.rets.has(fn)) return shared.rets.get(fn); const out = [], st = [fn.body]; while (st.length) { const x = st.pop(); if (x.type === 'ReturnStatement') { if (x.argument) out.push(x.argument); continue; } if (isFn(x)) continue; st.push(...kids(x)); } shared.rets.set(fn, out); return out; };
  // ── modules (CommonJS: require('./x') → x's module.exports) ──
  const resolveReq = (from, spec) => { if (!/^\.\.?\//.test(spec)) return null; const p = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)); for (const c of [p, p + '.js', p + '/index.js']) if (FILES.has(c)) return c; return null; };
  const EXP = new Map();
  const exportOf = (f, name) => {
    const k = f + '\0' + name; if (EXP.has(k)) return EXP.get(k);
    const R = parse(f), out = [];
    if (R) for (const n of R.nodes) {
      if (n.type !== 'AssignmentExpression' || n.left.type !== 'MemberExpression') continue;
      const l = srcOf(n.left);
      if (l === 'module.exports' && n.right.type === 'ObjectExpression') { for (const p of n.right.properties) if (p.type === 'Property' && nameOf(p.key) === name) out.push(p.value); }
      else if (l === `module.exports.${name}` || l === `exports.${name}`) out.push(n.right);
    }
    EXP.set(k, out); return out;
  };
  // ── names across the tree: the member calls `.name(` and the definitions `name(…) {` / `name: (…) =>` / `function name` at a
  // line's start, each file's list read once (shared between trees by content) ──
  const idxOf = (f) => { const s = FILES.get(f); const k = f + '\0' + s.length; let e = shared.idx.get(k); if (!e || e.src !== s) { e = { src: s, requires: [...s.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)].map((m) => m[1]), calls: new Set([...s.matchAll(/\.([A-Za-z_$][\w$]*)\??\.?\(/g)].map((m) => m[1])), defs: new Set([...s.matchAll(/^[ \t]*(?:(?:async|static|get|set)[ \t]+)*(?:function[ \t]*\*?[ \t]*)?([A-Za-z_$][\w$]*)[ \t]*(?:\(|[:=][ \t]*(?:async[ \t]*)?(?:function\b|\(|[A-Za-z_$][\w$]*[ \t]*=>))/gm)].map((m) => m[1])) }; shared.idx.set(k, e); } return e; };
  let NAMES = null;
  const named = () => { if (!NAMES) { NAMES = { calls: new Map(), defs: new Map(), requirers: new Map() }; for (const f of FILES.keys()) { const e = idxOf(f); for (const [m, set] of [[NAMES.calls, e.calls], [NAMES.defs, e.defs]]) for (const n of set) { let x = m.get(n); if (!x) m.set(n, x = []); x.push(f); } for (const r of e.requires) { const t = resolveReq(f, r); if (!t) continue; let x = NAMES.requirers.get(t); if (!x) NAMES.requirers.set(t, x = new Set()); x.add(f); } } } return NAMES; };
  const GENERIC = new Set(['add', 'set', 'get', 'push', 'call', 'apply', 'bind', 'then', 'catch', 'run', 'map', 'emit', 'send', 'log', 'warn', 'error', 'create', 'file', 'update', 'has', 'delete', 'remove', 'start', 'stop', 'close', 'open', 'write', 'read', 'join', 'slice', 'filter', 'find', 'forEach', 'reduce', 'some', 'every', 'toString', 'trim', 'replace', 'split', 'test', 'exec', 'keys', 'values', 'entries', 'assign', 'freeze', 'stringify', 'parse', 'resolve', 'reject', 'all', 'concat', 'sort', 'includes', 'indexOf']);
  const CN = new Map();
  const callsNamed = (name) => { if (CN.has(name)) return CN.get(name); const fs0 = named().calls.get(name) || []; const out = []; if (fs0.length <= 8) for (const f of fs0) { const R = parse(f); if (R) out.push(...(R.byCallee.get(name) || []).filter((c) => calleeOf(c).type === 'MemberExpression')); } CN.set(name, out); return out; };
  const DN = new Map();
  const defsNamed = (name, inFile = null) => {
    const key = (inFile || '') + '\0' + name; if (DN.has(key)) return DN.get(key);
    const out = []; DN.set(key, out);
    const fs0 = inFile ? [inFile] : named().defs.get(name) || [];
    if (fs0.length > 4) return out;
    for (const f of fs0) { const R = parse(f); if (R) for (const x of R.nodes) { if ((x.type === 'MethodDefinition' || x.type === 'Property') && nameOf(x.key) === name && isFn(x.value)) out.push(x.value); else if (x.type === 'FunctionDeclaration' && x.id && x.id.name === name) out.push(x); else if (x.type === 'VariableDeclarator' && x.id.type === 'Identifier' && x.id.name === name && isFn(x.init)) out.push(x.init); else if (x.type === 'AssignmentExpression' && x.left.type === 'MemberExpression' && nameOf(x.left.property) === name && isFn(x.right)) out.push(x.right); } }
    return out;
  };
  const ITER = /^(map|forEach|filter|find|some|every|flatMap)$/;
  const callersOf = (fn) => {
    const p = fn.parent;
    if (p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier') { const b = bindingOf(p.id); return (parse(fn.file).byCallee.get(p.id.name) || []).filter((c) => c.callee.type === 'Identifier' && bindingOf(c.callee) === b); }
    if (fn.type === 'FunctionDeclaration' && fn.id) return (parse(fn.file).byCallee.get(fn.id.name) || []).filter((c) => c.callee.type === 'Identifier');
    if (p && p.type === 'MethodDefinition' && p.kind === 'constructor') return newsOf(p.parent.parent);   // closure 4: constructor options
    if (p && (p.type === 'Property' || p.type === 'MethodDefinition')) { const nm = nameOf(p.key); return nm && !GENERIC.has(nm) ? callsNamed(nm) : []; }
    return [];
  };
  // an EXPORTED function (module.exports = { create }): its callers in the files that require its module (M.create(…) /
  // require('./x').create(…)) — a factory's context object is read where the factory is called
  const RQ = new Map();
  const requirersOf = (f) => { if (RQ.has(f)) return RQ.get(f); const gs = [...(named().requirers.get(f) || [])]; const out = []; RQ.set(f, out); if (gs.length > 6) return out; for (const g of gs) { const R = parse(g); if (!R) continue; for (const c of R.byCallee.get('require') || []) if (c.arguments[0] && c.arguments[0].type === 'Literal' && resolveReq(g, String(c.arguments[0].value)) === f) out.push(c); } return out; };
  // a CLASS's constructor options (closure 4): its `new C(…)` in its own file and in the files that require its module
  const NW = new WeakMap();
  const newsOf = (C) => {
    if (NW.has(C)) return NW.get(C);
    const out = []; NW.set(C, out);
    const nm = C.id ? C.id.name : C.parent && C.parent.type === 'VariableDeclarator' && C.parent.id.type === 'Identifier' ? C.parent.id.name : null;
    if (nm) for (const f of new Set([C.file, ...requirersOf(C.file).map((c) => c.file)])) { const R = parse(f); if (R) out.push(...(R.byNew.get(nm) || [])); }
    return out;
  };
  // `this` → its class (a method, a field, a static block) or its object literal (an object's method); null in a plain function
  const thisOf = (x) => { for (let n = x.parent; n; n = n.parent) { if (n.type === 'PropertyDefinition' || n.type === 'StaticBlock') return n.parent.parent; if (isFn(n) && n.type !== 'ArrowFunctionExpression') { const p = n.parent; if (p && p.type === 'MethodDefinition') return p.parent.parent; if (p && p.type === 'Property' && p.parent.type === 'ObjectExpression') return p.parent; return null; } } return null; };
  // what a class sets `this.k` to: every `this.k = v` in its methods, a field `k = v`
  const TS = new Map();
  const thisSets = (C, k) => { const key = C.file + '\0' + C.start + '\0' + k; if (TS.has(key)) return TS.get(key); const out = []; const R = parse(C.file); if (R) for (const n of R.nodes) { if (n.start < C.start || n.end > C.end) continue; if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'MemberExpression' && n.left.object.type === 'ThisExpression' && !n.left.computed && nameOf(n.left.property) === k && thisOf(n.left.object) === C) out.push(n.right); else if (n.type === 'PropertyDefinition' && !n.computed && nameOf(n.key) === k && n.value && n.parent.parent === C) out.push(n.value); } TS.set(key, out); return out; };
  const XA = new Map();
  const exportsOfFile = (f) => { if (XA.has(f)) return XA.get(f); const R = parse(f); const byNode = new Map(), byName = new Map(); const put = (m, k, v) => { let x = m.get(k); if (!x) m.set(k, x = []); x.push(v); }; if (R) for (const n of R.ast.body) { const e = n.type === 'ExpressionStatement' ? n.expression : null; if (!e || e.type !== 'AssignmentExpression' || e.left.type !== 'MemberExpression') continue; const l = srcOf(e.left); if (l === 'module.exports' && e.right.type === 'ObjectExpression') { for (const p of e.right.properties) if (p.type === 'Property') { if (p.value.type === 'Identifier') put(byName, p.value.name, nameOf(p.key)); else put(byNode, p.value, nameOf(p.key)); } } else if (/^(module\.)?exports\.\w+$/.test(l)) { if (e.right.type === 'Identifier') put(byName, e.right.name, nameOf(e.left.property)); else put(byNode, e.right, nameOf(e.left.property)); } } const r = { byNode, byName }; XA.set(f, r); return r; };
  const exportedAs = (fn) => { const x = exportsOfFile(fn.file); const id = fn.type === 'FunctionDeclaration' ? fn.id && fn.id.name : fn.parent && fn.parent.type === 'VariableDeclarator' && fn.parent.id.type === 'Identifier' && fn.parent.parent.parent && fn.parent.parent.parent.type === 'Program' ? fn.parent.id.name : null; return [...(x.byNode.get(fn) || []), ...(id ? x.byName.get(id) || [] : [])]; };
  const XC = new WeakMap();
  const exportCallers = (fn) => {
    if (XC.has(fn)) return XC.get(fn);
    const out = []; XC.set(fn, out);
    const names = exportedAs(fn); if (!names.length) return out;
    for (const rq of requirersOf(fn.file)) {
      const R = parse(rq.file);
      // require('./x').create(…) directly, or a binding of the module: const M = require('./x') … M.create(…)
      const p = rq.parent;
      if (p && p.type === 'MemberExpression' && p.object === rq && names.includes(nameOf(p.property)) && p.parent && p.parent.type === 'CallExpression' && p.parent.callee === p) out.push(p.parent);
      if (p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier') { const b = bindingOf(p.id); for (const nm of names) for (const c of R.byCallee.get(nm) || []) { const cal = calleeOf(c); if (cal.type === 'MemberExpression' && cal.object.type === 'Identifier' && cal.object.name === p.id.name && bindingOf(cal.object) === b) out.push(c); } }
      if (p && p.type === 'VariableDeclarator' && p.id.type === 'ObjectPattern') for (const q of p.id.properties) if (q.type === 'Property' && names.includes(nameOf(q.key)) && q.value.type === 'Identifier') { const b = bindingOf(q.value); for (const c of R.byCallee.get(q.value.name) || []) if (c.callee.type === 'Identifier' && bindingOf(c.callee) === b) out.push(c); }
    }
    return out;
  };
  // a function handed BY NAME to an iterator (lines.map(strip)): its first parameter is an element of the receiver
  const byRef = (fn) => { const p = fn.parent; const id = fn.type === 'FunctionDeclaration' ? fn.id : p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier' ? p.id : null; if (!id) return []; const R = parse(fn.file), out = []; for (const nm of ['map', 'forEach', 'filter', 'find', 'some', 'every', 'flatMap']) for (const c of R.byCallee.get(nm) || []) { const a = c.arguments[0], cal = calleeOf(c); if (a && a.type === 'Identifier' && a.name === id.name && cal.type === 'MemberExpression') { const b = bindingOf(a); if (b && b.id === id) out.push(cal.object); } } return out; };
  // the item's OWN stored words handed back (a redraw that keeps them): the store's get(id) — its receiver placed at the store
  const ownWords = (x) => { if (x.type !== 'CallExpression' || calleeOf(x).type !== 'MemberExpression' || nameOf(calleeOf(x).property) !== 'get') return false; if (!HANDLES_READ) TAINT = true; return placeOf(calleeOf(x).object, null).kind === 'store'; };   // (read while the handle names are still being read: kept for this pass only)
  // ── VALUES: what an expression can stand for — objects, arrays, literals, functions, modules (#ns), or #open (unread) ──
  const PK = new Map(), AR = new Map(), OPENS = new Map();
  const mkPick = (of, key) => { let m = PK.get(of); if (!m) PK.set(of, m = new Map()); const k = key == null ? '\0' : String(key); if (!m.has(k)) m.set(k, { type: '#pick', of, key }); return m.get(k); };
  const mkArr = (n, els) => { if (!AR.has(n)) AR.set(n, { type: 'ArrayExpression', elements: els, file: n.file }); return AR.get(n); };
  // closure 4: an OPEN value keeps the NAME it was reached by (a destructured key, a member's property, a parameter's or a callee's
  // name) — the store's handles are placed by it; a SOFT open is a parameter whose callers the reader cannot see but which has a
  // default: the words ignore it (as before), the placement does not (a default is never the whole story of a handle)
  const nameAt = (v) => (!v ? null : v.type === 'Identifier' ? v.name : v.type === 'MemberExpression' && !v.computed ? v.property.name : v.type === 'CallExpression' ? nameAt(calleeOf(v)) : v.type === 'ChainExpression' ? nameAt(v.expression) : null);
  const openOf = (v) => { if (!OPENS.has(v)) OPENS.set(v, { type: '#open', node: v, name: nameAt(v) }); return OPENS.get(v); };
  const SOFTS = new Map(), KEYED = new Map();
  const softOf = (v) => { if (!SOFTS.has(v)) SOFTS.set(v, { type: '#open', node: v, name: nameAt(v), soft: true }); return SOFTS.get(v); };
  const keyedOf = (o, key) => { const base = o.base || o; let m = KEYED.get(base); if (!m) KEYED.set(base, m = new Map()); const k = String(key); if (!m.has(k)) m.set(k, { type: '#open', node: base.node, name: k, soft: base.soft, base }); return m.get(k); };   // one per (open, key): a cycle never grows a chain
  const pick = (vals, key) => {
    const out = [];
    for (const v of vals) {
      if (v.type === 'ObjectExpression') { for (const q of v.properties) { if (q.type === 'Property' && (key == null || nameOf(q.key) === String(key))) out.push(q.value); if (q.type === 'SpreadElement') out.push(mkPick(q.argument, key)); } }
      else if (v.type === '#ns') { if (key != null) out.push(...exportOf(v.file, String(key))); else out.push(openOf(v)); }
      else if (v.type === 'ArrayExpression') { if (typeof key === 'number') { if (v.elements[key]) out.push(v.elements[key]); } else for (const e of v.elements) if (e) out.push(e.type === 'SpreadElement' ? mkPick(e.argument, null) : e); }
      else if (v.type === '#open') out.push(key == null ? v : keyedOf(v, key));
      else if (!(v.type === 'Literal' || v.type === 'TemplateLiteral' || isFn(v))) out.push(key == null ? openOf(v) : keyedOf(openOf(v), key));
    }
    return out;
  };
  // memo with a FIXPOINT: a value read inside a cycle (or from such a value) is TAINTED — kept for this pass, read again in the
  // next with the last pass's answer, until nothing grows (the answer is the same in any order the filings are read)
  const VM = new Map(), VIN = new Set(); let TAINT = false, PASS = 0, BUDGET = 0;
  const TERMINAL = (n) => n.type === '#open' || n.type === '#ns' || isFn(n) || n.type === 'ObjectExpression' || n.type === 'ArrayExpression' || n.type === 'Literal' || n.type === 'TemplateLiteral';
  function values(n) {
    if (!n) return [];
    if (TERMINAL(n)) return [n];
    const m = VM.get(n);
    if (m && (m.pass === PASS || !m.tainted)) { if (m.tainted) TAINT = true; return m.r; }
    if (VIN.has(n) || ++BUDGET > 400000) { TAINT = true; return m ? m.r : []; }
    VIN.add(n); const saved = TAINT; TAINT = false;
    let r; try { r = [...new Set(values1(n))]; } finally { VIN.delete(n); }
    VM.set(n, { r, tainted: TAINT, pass: PASS });
    TAINT = saved || TAINT;
    return r;
  }
  const all = (xs) => xs.flatMap((x) => values(x));
  function values1(n) {
    switch (n.type) {
      case '#pick': return all(pick(values(n.of), n.key));
      case 'Identifier': {
        if (n.name === 'undefined') return [];
        const b = bindingOf(n); if (!b) return [openOf(n)];
        const src = [];
        if (b.kind === 'fn') return [b.node];
        if (b.kind === 'var') { if (b.decl.init) src.push(b.decl.init); for (const a of parse(b.id.file).asg.get(b.id.name) || []) if (bindingOf(a.left) === b) src.push(a.right); }
        else if (b.kind === 'param') {
          if (b.dflt) src.push(b.dflt);
          const cs = [...callersOf(b.fn), ...exportCallers(b.fn)]; for (const c of cs) if (c.arguments[b.index]) src.push(c.arguments[b.index]);
          const call = b.fn.parent, inIter = call && call.type === 'CallExpression' && call.arguments[0] === b.fn && calleeOf(call).type === 'MemberExpression' && ITER.test(nameOf(calleeOf(call).property));
          if (inIter && b.index === 0) src.push(mkPick(calleeOf(call).object, null));
          const refs = b.index === 0 ? byRef(b.fn) : []; for (const r of refs) src.push(mkPick(r, null));
          if (!cs.length && !inIter && !refs.length) src.push(b.dflt ? softOf(n) : openOf(n));
        }
        else if (b.kind === 'forof') src.push(mkPick(b.loop.right, null));
        else src.push(openOf(n));
        let vals = all(src);
        for (const k of b.path || []) vals = all(pick(vals, k));
        return vals;
      }
      case 'MemberExpression': {
        const key = n.computed ? (n.property.type === 'Literal' ? n.property.value : null) : n.property.name;
        // closure 4: `this.k` in a class reads what the class sets it to (a constructor's options reach it through the class's `new`)
        if (n.object.type === 'ThisExpression' && key != null) { const C = thisOf(n.object); if (C && C.type !== 'ObjectExpression') { const set = thisSets(C, String(key)); if (set.length) return all(set); } }
        return all(pick(values(n.object), key));
      }
      case 'ChainExpression': case 'ParenthesizedExpression': return values(n.expression);
      case 'AwaitExpression': return values(n.argument);
      case 'SequenceExpression': return values(n.expressions[n.expressions.length - 1]);
      case 'AssignmentExpression': return values(n.right);
      case 'ConditionalExpression': return [...values(n.consequent), ...values(n.alternate)];
      case 'LogicalExpression': return [...values(n.left), ...values(n.right)];
      case 'CallExpression': {
        const c = calleeOf(n);
        if (c.type === 'Identifier' && c.name === 'require' && n.arguments[0] && n.arguments[0].type === 'Literal') { const f = resolveReq(n.file, String(n.arguments[0].value)); return f ? [{ type: '#ns', file: f }] : [openOf(n)]; }
        if (c.type === 'Identifier' && /^(i18nKey|t|tr)$/.test(c.name) && n.arguments[0]) return values(n.arguments[0]);
        if (ownWords(n)) return [];   // the item the store already holds (a redraw keeps its own words): no new words
        if (c.type === 'MemberExpression' && /^Object\.(freeze|assign)$/.test(srcOf(c))) return all(n.arguments);
        const pn = c.type === 'MemberExpression' && !c.computed ? c.property.name : null;
        if ((pn === 'map' || pn === 'flatMap') && n.arguments[0]) { const cbs = isFn(n.arguments[0]) ? [n.arguments[0]] : values(n.arguments[0]).filter(isFn); if (cbs.length) return [mkArr(n, cbs.flatMap(returnsOf))]; }
        if (pn && /^(filter|slice|concat|sort|reverse)$/.test(pn)) return [...values(c.object), ...(pn === 'concat' ? all(n.arguments) : [])];
        let fns = c.type === 'Identifier' ? values(c).filter(isFn) : isFn(c) ? [c] : c.type === 'MemberExpression' ? all(pick(values(c.object), c.computed ? null : c.property.name)).filter(isFn) : [];
        if (!fns.length && c.type === 'MemberExpression' && !c.computed && !GENERIC.has(c.property.name)) fns = defsNamed(c.property.name, c.object.type === 'ThisExpression' ? n.file : null);
        return fns.length ? all(fns.flatMap(returnsOf)) : [n];
      }
      default: return [n];
    }
  }
  // ── WORDS, read by the item's shape (src/user-todos.js normalizeI18n): i18n.text / .source a LINE, i18n.detail LINES; a line's
  // `key`, its WORDS / clause params (`{key}` / `{at, key, gone}`) and its fold (`more`) — a key the reader cannot read is OPEN ──
  const NOT_TEXT = (v) => isFn(v) || v.type === 'ObjectExpression' || v.type === 'ArrayExpression' || v.type === 'NewExpression' || v.type === 'UnaryExpression' || v.type === 'UpdateExpression' || (v.type === 'BinaryExpression' && v.operator !== '+');
  const keyWords = (k, out, sink) => { for (const v of values(k)) { if (v.type === 'Literal') { if (typeof v.value === 'string') out.add(v.value); } else if (v.type === 'TemplateLiteral' && !v.expressions.length) out.add(v.quasis[0].value.cooked); else if (!NOT_TEXT(v) && !v.soft) sink.push(v.type === '#open' ? v.node : v); } };
  // a LINE (depth 0: text / source / a detail row / a fold row) — its key unread is OPEN; a param's WORDS (depth 1+) unread is LOOSE
  // (a param is a fact the producer hands in; a WORDS param is the rarer case, and a fact read as one is no word of the item)
  function lineWords(l, out, seen, depth = 0) {
    for (const v of values(l)) {
      if (seen.has(v)) continue; seen.add(v);
      const sink = depth ? out.loose : out.open;
      if (v.type === 'ObjectExpression') {
        for (const k of pick([v], 'key')) keyWords(k, out, sink);
        for (const k of pick([v], 'gone')) keyWords(k, out, sink);
        for (const p of all(pick(all(pick([v], 'params')), null))) if (p.type === 'ObjectExpression') lineWords(p, out, seen, depth + 1); else if (p.type === '#open' && !p.soft) out.loose.push(p.node);
        for (const m of all(pick(all(pick([v], 'more')), null))) lineWords(m, out, seen, depth);
      } else if (v.type === 'ArrayExpression') { for (const e of pick([v], null)) lineWords(e, out, seen, depth); }
      else if (v.type === '#open') { if (!v.soft) sink.push(v.node); }
      else if (!(v.type === 'Literal' && v.value == null) && !NOT_TEXT(v)) sink.push(v);
    }
  }
  function i18nWords(root, out) {
    const seen = new Set();
    for (const l of all(pick(values(root), 'text'))) lineWords(l, out, seen);
    for (const l of all(pick(values(root), 'source'))) lineWords(l, out, seen);
    for (const d of all(pick(values(root), 'detail'))) {
      if (d.type === 'Literal' && d.value == null) continue;
      // closure 4: the store's shape (normalizeI18n) — `detail` is an ARRAY of lines; an object or a string is REFUSED (add() throws,
      // the item is never filed): a refusal of its own, never read as lines
      if (d.type === 'ObjectExpression' || d.type === 'Literal' || d.type === 'TemplateLiteral') { if (out.refused) out.refused.push(d); continue; }
      for (const l of pick([d], null)) lineWords(l, out, seen);
    }
  }
  // ── THE STORE (closure 4): the class src/user-todos.js declares whose methods take an item's `i18n` — those are its FILING
  // methods. A FILING CALL = a call of one of them (two arguments or more) anywhere in the files; its receiver is PLACED below ──
  const STORE_FILE = 'src/user-todos.js';
  const takesI18n = (fn) => fn.params.slice(1).some((q) => { const o = q.type === 'AssignmentPattern' ? q.left : q; return o.type === 'ObjectPattern' && o.properties.some((x) => x.type === 'Property' && nameOf(x.key) === 'i18n'); });
  let STORE = null; const FILING = [];
  { const R = parse(STORE_FILE); if (R) for (const n of R.nodes) if (!STORE && /^Class(Declaration|Expression)$/.test(n.type)) { const ms = n.body.body.filter((m) => m.type === 'MethodDefinition' && m.kind === 'method' && isFn(m.value) && takesI18n(m.value)); if (ms.length) { STORE = n; FILING.push(...ms.map((m) => nameOf(m.key))); } } }
  const lineOf = (n) => (P.get(n.file) || parse(n.file)).src.slice(0, n.start).split('\n').length;
  const siteOf = (n) => (n && n.file ? `${n.file}:${lineOf(n)}` : '?');
  const FILE_RE = FILING.length ? new RegExp(`\\.\\s*(?:${FILING.join('|')})\\b`) : /$^/;
  const cands = [];
  for (const [f, s] of FILES) {
    if (!FILE_RE.test(s)) continue;
    const R = parse(f);
    if (!R) { cands.push({ f, line: 0, unparsed: true, words: new Set(), open: [], place: { kind: 'store', how: 'unparsed' } }); continue; }
    for (const name of FILING) for (const c of R.byCallee.get(name) || []) {
      const cal = calleeOf(c);
      if (cal.type !== 'MemberExpression' || c.arguments.length < 2) continue;
      cands.push({ f, line: lineOf(c), recv: srcOf(cal.object).replace(/\?$/, ''), recvNode: cal.object, arg: c.arguments[1], method: name, call: c });
    }
  }
  // ── PLACING A RECEIVER: what it can hold, read by values() — bindings, calls and returns, a deps object's property at the factory's
  // callers, a constructor's options at its `new`, `this.k` at what the class sets it to — each value judged:
  //   THE STORE: `new <the store's class>(…)`; `this` inside it; an ADAPTER (an object / class / module whose filing method itself
  //     files to the store); or a HANDLE where the reader's road ends (a parameter whose callers it cannot see — a plugin's host
  //     handle `h` —, a member of one): the name it was reached by is one of the store's HANDLE NAMES below
  //   NOT the store: any other class's instance, object, array, literal, function or module
  //   OPEN: anything else — the receiver is UNPLACED: red by name when its call carries words, never skipped
  const HANDLES = new Map(), FLOW = new Set(), ADAPT = new Map(), PLACING = new Set(); let HANDLES_READ = false, FLOW_FROM = '';
  function handleOf(name) { return name && HANDLES.has(name) ? { site: HANDLES.get(name) } : null; }
  function candsIn(fn) { return cands.filter((c) => !c.unparsed && c.f === fn.file && c.call.start >= fn.start && c.call.end <= fn.end); }
  function adapterOf(holder, m) {
    let r = ADAPT.get(holder); if (!r) ADAPT.set(holder, r = new Map());
    const k = m || '*'; if (r.has(k)) return r.get(k);
    r.set(k, null);
    const names = m ? [m] : FILING, fns = [];
    if (holder.type === 'ObjectExpression') { for (const q of holder.properties) if (q.type === 'Property' && names.includes(nameOf(q.key))) fns.push(...values(q.value).filter(isFn)); }
    else if (/^Class/.test(holder.type)) { for (const q of holder.body.body) if (q.type === 'MethodDefinition' && names.includes(nameOf(q.key))) fns.push(q.value); }
    else if (holder.type === '#ns') { for (const nm of names) fns.push(...all(exportOf(holder.file, nm)).filter(isFn)); }
    let out = null;
    for (const fn of fns) { for (const c of candsIn(fn)) { const pl = placeOf(c.recvNode, c.method); if (pl.kind === 'store') { out = { site: siteOf(c.call), how: pl.how }; break; } } if (out) break; }
    r.set(k, out);
    return out;
  }
  function classify(v, m) {
    if (v.type === '#open') { const h = handleOf(v.name); return h ? { kind: 'store', by: 'handle', how: `the handle «${v.name}» (set to the store at ${h.site})` } : { kind: 'open', how: `${siteOf(v.node)} «${v.name || srcOf(v.node).slice(0, 40)}»${v.soft ? ' (only a default seen)' : ''}` }; }
    if (v.type === 'NewExpression') {
      const cls = values(v.callee);
      if (cls.includes(STORE)) return { kind: 'store', by: 'store', how: `new ${STORE.id ? STORE.id.name : 'the store'} (${siteOf(v)})` };
      for (const C of cls) if (/^Class/.test(C.type)) { const a = adapterOf(C, m); if (a) return { kind: 'store', by: 'adapter', how: `an adapter whose ${m || 'filing method'} files to the store (${a.site})` }; }
      return { kind: 'not', how: `new ${srcOf(v.callee).slice(0, 40)}` };
    }
    if (v.type === 'ThisExpression') { const C = thisOf(v); if (C && C === STORE) return { kind: 'store', by: 'store', how: `this, inside the store (${siteOf(v)})` }; if (!C) return { kind: 'open', how: `${siteOf(v)} «this» in a plain function` }; v = C; }
    if (v.type === 'ObjectExpression' || /^Class/.test(v.type) || v.type === '#ns') { const a = adapterOf(v, m); return a ? { kind: 'store', by: 'adapter', how: `an adapter whose ${m || 'filing method'} files to the store (${a.site})` } : { kind: 'not', how: v.type === '#ns' ? `the module ${v.file}` : `${v.type} (${siteOf(v)})` }; }
    if (v.type === 'CallExpression') { const nm = nameAt(v); const h = handleOf(nm); return h ? { kind: 'store', by: 'handle', how: `the handle «${nm}» (set to the store at ${h.site})` } : { kind: 'open', how: `${siteOf(v)} «${srcOf(v).slice(0, 40)}»` }; }
    if (v.type === 'Literal' || v.type === 'TemplateLiteral' || v.type === 'ArrayExpression' || isFn(v) || /^(Binary|Unary|Update)Expression$/.test(v.type)) return { kind: 'not', how: v.type };
    return { kind: 'open', how: `${siteOf(v)} «${v.type}»` };
  }
  function placeExprs(es, m) {
    const ps = [];
    for (const e of es) {
      if (!e) continue;
      if (PLACING.has(e)) { ps.push({ kind: 'open', how: `${siteOf(e)} (a cycle)` }); continue; }
      PLACING.add(e);
      try { const vs = values(e); if (!vs.length) ps.push({ kind: 'open', how: `${siteOf(e)} «${srcOf(e).slice(0, 40)}» holds nothing the reader sees` }); for (const v of vs) ps.push(classify(v, m)); } finally { PLACING.delete(e); }
    }
    const st = ps.find((x) => x.kind === 'store');
    if (!st && es.some((e) => FLOW.has(e))) return { kind: 'store', by: 'flow', how: `the store's own flow reaches it from new ${STORE && STORE.id ? STORE.id.name : 'the store'} (${FLOW_FROM})` };
    return st || ps.find((x) => x.kind === 'open') || ps[0] || { kind: 'open', how: 'nothing' };
  }
  function placeOf(e, m) { return placeExprs([e], m); }
  // does a call's item carry words (text / detail / i18n)? 'no' only when every value it can hold is read and carries none
  const carries = (arg) => { const vs = values(arg); if (!vs.length) return 'unread'; let r = 'no'; for (const v of vs) { if (v.type === 'ObjectExpression') { if (v.properties.some((q) => q.type === 'SpreadElement' || ['text', 'detail', 'i18n'].includes(nameOf(q.key)))) return 'yes'; } else if (!(v.type === 'Literal' || v.type === 'TemplateLiteral' || v.type === 'ArrayExpression' || isFn(v))) r = 'unread'; } return r; };
  // a pass-through: the item is a parameter of an adapter's own filing method (`forYou: { add(…, item) }`) — its callers are
  // filings of their own (placed at the store through the adapter)
  const passThrough = (x) => { if (x.type !== 'Identifier') return false; const b = bindingOf(x); const fn = b && b.kind === 'param' ? b.fn : null; const p = fn && fn.parent; return !!(p && (p.type === 'Property' || p.type === 'MethodDefinition') && FILING.includes(nameOf(p.key))); };
  // THE STORE'S HANDLE NAMES, read FORWARD from the store's own object — every `new <the store's class>(…)` — along the code's own
  // flow: bindings, `||` / `?:` / `await`, assignments, returns (a function that returns the store is a getter: it counts as the
  // store), a getter's calls, a function's parameter it is handed to, a DEPS OBJECT's property into the callee's parameter (`{ k }`
  // destructured, `opts.k` read), a constructor's options, `this.k = …` into the class's `this.k`. Where the store lands in an
  // object's property, a member or a field, that NAME is a handle (printed); only a receiver whose road ends where the reader
  // cannot see (a plugin's host handle, a caller outside the files) is placed by it
  {
    const STORE_NAME = STORE && STORE.id ? STORE.id.name : null;
    const seen = FLOW, work = [];
    const push = (e) => { if (e && !seen.has(e)) { seen.add(e); work.push(e); } };
    const addName = (k, n) => { if (k && !HANDLES.has(k)) HANDLES.set(k, siteOf(n)); };
    const isRef = (x) => { const p = x.parent; if (!p) return false; if (p.type === 'MemberExpression' && p.property === x && !p.computed) return false; if ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key === x && p.value !== x && !p.computed) return false; return true; };
    const RF = new Map();
    const refsOf = (b) => { if (!b || !b.id) return []; if (RF.has(b.id)) return RF.get(b.id); const R = parse(b.id.file); const out = R ? (R.ids.get(b.id.name) || []).filter((x) => x !== b.id && isRef(x) && bindingOf(x) === b) : []; RF.set(b.id, out); return out; };
    const toBinding = (id) => { for (const r of refsOf(bindingOf(id))) push(r); };
    // a parameter handed the store (k = null) or an object holding it under k: what the function body reads of it
    const intoParam = (q, k) => {
      if (!q) return;
      if (q.type === 'AssignmentPattern') q = q.left;
      if (k == null) { if (q.type === 'Identifier') toBinding(q); return; }
      if (q.type === 'ObjectPattern') { for (const x of q.properties) if (x.type === 'Property' && !x.computed && nameOf(x.key) === k) for (const y of patNames(x.value)) if (!y.path.length) toBinding(y.id); return; }
      if (q.type === 'Identifier') for (const r of refsOf(bindingOf(q))) { const m = r.parent; if (m.type === 'MemberExpression' && m.object === r && !m.computed && nameOf(m.property) === k) push(m); else if (m.type === 'VariableDeclarator' && m.init === r && m.id.type === 'ObjectPattern') intoParam(m.id, k); }
    };
    const calleesOf = (c) => (c.type === 'NewExpression' ? values(c.callee).filter((C) => /^Class/.test(C.type)).map((C) => (C.body.body.find((m) => m.kind === 'constructor') || {}).value).filter(Boolean) : values(calleeOf(c)).filter(isFn));
    // the call an object literal is handed to (through parentheses / `||`), with its argument index
    const argOf = (o) => { let e = o; while (e.parent && (e.parent.type === 'ParenthesizedExpression' || e.parent.type === 'LogicalExpression')) e = e.parent; const c = e.parent; if (c && (c.type === 'CallExpression' || c.type === 'NewExpression') && c.callee !== e) { const i = c.arguments.indexOf(e); if (i >= 0) return [c, i]; } return null; };
    if (STORE_NAME) for (const [f, src] of FILES) { if (!src.includes(STORE_NAME)) continue; const R = parse(f); if (R) for (const n of R.byNew.get(STORE_NAME) || []) if (values(n.callee).includes(STORE)) { push(n); FLOW_FROM = FLOW_FROM || siteOf(n); } }
    const climb = (e) => {
      if (e.type === 'FunctionDeclaration') { if (e.id) toBinding(e.id); return; }
      const p = e.parent; if (!p) return;
      switch (p.type) {
        case 'ParenthesizedExpression': case 'ChainExpression': case 'AwaitExpression': case 'LogicalExpression': push(p); return;
        case 'ConditionalExpression': if (p.test !== e) push(p); return;
        case 'SequenceExpression': if (p.expressions[p.expressions.length - 1] === e) push(p); return;
        case 'VariableDeclarator': if (p.init === e && p.id.type === 'Identifier') toBinding(p.id); return;
        case 'AssignmentExpression': if (p.right === e && p.operator === '=') {
          if (p.left.type === 'Identifier') toBinding(p.left);
          else if (p.left.type === 'MemberExpression' && !p.left.computed) { const k = nameOf(p.left.property); addName(k, p); if (p.left.object.type === 'ThisExpression') { const C = thisOf(p.left.object); const R = C && parse(C.file); if (R) for (const x of R.ids.get(k) || []) { const m = x.parent; if (m.type === 'MemberExpression' && m.property === x && !m.computed && m.object.type === 'ThisExpression' && thisOf(m.object) === C && !(m.parent.type === 'AssignmentExpression' && m.parent.left === m)) push(m); } } }
          push(p);
        } return;
        case 'Property': if (p.value === e && p.parent.type === 'ObjectExpression' && !p.computed) { const k = nameOf(p.key); addName(k, p); const a = argOf(p.parent); if (a) for (const fn of calleesOf(a[0])) intoParam(fn.params[a[1]], k); } return;
        case 'PropertyDefinition': case 'MethodDefinition': if (p.value === e && !p.computed) addName(nameOf(p.key), p); return;
        case 'ReturnStatement': { let F = p.parent; while (F && !isFn(F)) F = F.parent; if (F) push(F); return; }
        case 'ArrowFunctionExpression': if (p.body === e) push(p); return;
        case 'CallExpression': case 'NewExpression': {
          if (p.callee === e) { push(p); return; }   // a getter called: the store
          const i = p.arguments.indexOf(e); if (i >= 0) for (const fn of calleesOf(p)) intoParam(fn.params[i], null);
          return;
        }
        default: return;
      }
    };
    for (let guard = 0; work.length && guard < 100000; guard++) climb(work.pop());
  }
  HANDLES_READ = true;
  let sig = null, converged = false, filings = [];
  for (PASS = 1; PASS <= 12; PASS++) {
    ADAPT.clear();
    for (const c of cands) if (!c.unparsed) c.place = placeOf(c.recvNode, c.method);
    filings = cands.filter((c) => c.place.kind === 'store');
    let size = 0;
    for (const fl of filings) {
      if (fl.unparsed) continue;
      const out = new Set(); out.open = []; out.loose = []; out.refused = [];
      for (const r of all(pick(values(fl.arg), 'i18n'))) { if (r.type === 'Literal' && r.value == null) continue; if (r.type === '#open') { if (!r.soft) out.open.push(r.node); continue; } i18nWords(r, out); }
      fl.words = out; fl.open = [...new Set(out.open)].filter((x) => !passThrough(x)); fl.pass = out.open.some(passThrough); fl.loose = [...new Set(out.loose)]; fl.refused = [...new Set(out.refused)];
      size += out.size;
    }
    let tz = 0; for (const m of VM.values()) if (m.tainted) tz += m.r.length;
    const now = size + ':' + tz + ':' + cands.map((c) => c.place.kind[0]).join('');
    if (now === sig) { converged = true; break; }
    sig = now;
  }
  const unplaced = cands.filter((c) => !c.unparsed && c.place.kind === 'open').map((c) => Object.assign(c, { carries: carries(c.arg) })).filter((c) => c.carries !== 'no');
  const notStore = cands.filter((c) => !c.unparsed && c.place.kind === 'not');
  const handles = [...HANDLES].map(([name, where]) => ({ name, site: where }));
  const words = new Map();
  for (const fl of filings) for (const w of fl.words) { if (!words.has(w)) words.set(w, []); words.get(w).push(`${fl.f}:${fl.line}`); }
  return { filings, cands, unplaced, notStore, handles, store: STORE ? `${STORE_FILE} ${STORE.id ? STORE.id.name : '(a class)'}` : null, filing: FILING, words, parsed, passes: PASS, converged, exhausted: BUDGET > 400000, where: (n) => (n && n.file ? `${n.file} ${srcOf(n).slice(0, 60)}` : String(n && n.type)) };
}
console.log('⑩ THE VERIFIER\'S LIST FOR PICKS 3–6 (stored words — the census since closure 3 —, the overage door, the lapsed chip\'s act)');
{
  const { pathToFileURL } = await import('node:url');
  const imp = (f) => import(pathToFileURL(path.join(REPO, f)).href);
  // #0 STORED WORDS — THE CENSUS (closure 3: a hand list of five missed a sixth). A For-you item keeps the i18n its hub FILED and the
  // page says it with t(key) at any later time, so every sentence the LAST RELEASE stored is drawn after the update: it keeps its zh /
  // ja rows, and when no producer files it any more it is a NAMED legacy row (src/foryou-actions.js STORED_WORDS_LEGACY, its release
  // and its producer). The stored sentences are READ from the tree (storedWordsReader above) — this tree's, and the last release's
  // (the newest «2.N.N: …» commit below HEAD, read with git cat-file; a depth-1 clone holds none: a named SKIP)
  const FA = require(path.join(REPO, 'src/foryou-actions.js'));
  const LEG = FA.STORED_WORDS_LEGACY || {};
  const ZH = (await imp('src/lib/i18n-zh.js')).default, JA = (await imp('src/lib/i18n-ja.js')).default;
  const UTL = await imp('src/lib/user-todos-layout.js');
  const has = (d, k) => Object.prototype.hasOwnProperty.call(d, k);
  const tOf = (dict) => (k, p) => String(has(dict, k) ? dict[k] : k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const sentence = /\b[A-Za-z]{2,}(?: [A-Za-z]{2,}){3,}\b/;   // four English words in a row = an English sentence on a zh / ja page
  const acornS = require(path.join(REPO, 'node_modules/acorn'));
  const SHARED = { recs: new Map(), idx: new Map(), scopes: new WeakMap(), binds: new WeakMap(), rets: new WeakMap() };
  const NOW = new Map([...sources].filter(([f]) => !f.startsWith('src/lib/')));
  NOW.set('server.js', fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'));   // closure 4: where the hub builds the store and hands it on
  const SWN = storedWordsReader({ files: NOW, acorn: acornS, shared: SHARED });
  const storedNow = new Set(SWN.words.keys());
  const producers = new Set(SWN.filings.map((x) => x.f));
  console.log(`  · the stored-words census: ${SWN.filings.length} filings in ${producers.size} producer files store ${storedNow.size} sentences (${[...storedNow].filter((x) => has(ZH, x)).length} with a zh row); ${SWN.filings.filter((x) => x.pass).length} pass-through adapters; ${SWN.passes} passes`);
  const byHow = {}; for (const x of SWN.filings) byHow[x.place.by || 'unparsed'] = (byHow[x.place.by || 'unparsed'] || 0) + 1;
  console.log(`  · the store: ${SWN.store} (filing methods ${SWN.filing.join(', ')}); ${SWN.cands.length} filing calls — ${Object.entries(byHow).map(([k, n]) => `${n} placed by ${k}`).join(', ')}; ${SWN.notStore.length} not the store; ${SWN.unplaced.length} unplaced. Its handle names (read forward from the store): ${SWN.handles.map((h) => `${h.name} (${h.site})`).join(', ')}`);
  ok(SWN.filings.length >= 60 && !SWN.exhausted && SWN.converged && SWN.filings.every((x) => !x.unparsed && !x.open.length),
    'stored words (closure 3): the census reads every For-you filing in src/ — each store\'s add / redrawItem parsed, its i18n followed to the keys its lines store (no OPEN line), within its budget, to a fixpoint',
    { n: SWN.filings.length, exhausted: SWN.exhausted, converged: SWN.converged, open: SWN.filings.filter((x) => x.unparsed || x.open.length).map((x) => `${x.f}:${x.line} ${(x.open || []).map(SWN.where).join(' | ')}`.slice(0, 160)).slice(0, 6) });
  ok(SWN.filings.some((x) => x.pass) && SWN.filings.some((x) => x.recv === 'forYou' && x.words.size > 0),
    'stored words: a pass-through adapter (`forYou: { add(…, item) }`) stores what its callers hand in — and its callers (forYou.add) are filings the census reads', SWN.filings.filter((x) => x.pass).map((x) => `${x.f}:${x.line}`));
  // CLOSURE 4 (item 1): THE CENSUS FOLLOWS A HANDLE TO ITS STORE — the store and its filing methods read from the tree; every call of
  // them carrying words placed; an unplaced receiver RED by its file and line
  ok(SWN.store === 'src/user-todos.js UserTodoManager' && ['add', 'redrawItem'].every((m) => SWN.filing.includes(m)),
    'stored words (closure 4): the store is read from the tree — src/user-todos.js\'s class; its filing methods are the ones that take an item\'s i18n (add, redrawItem)', { store: SWN.store, filing: SWN.filing });
  for (const c of SWN.unplaced) ok(false, `stored words (closure 4): ${c.f}:${c.line} ${c.recv}.${c.method}(…) files words on a receiver the census cannot place — ${c.place.how}`, { carries: c.carries });
  ok(SWN.unplaced.length === 0 && SWN.filings.length >= 100,
    `stored words (closure 4): every call of the store's filing methods that carries words is PLACED — at the store (its own object, an adapter, a handle the tree sets to it) or known not to be the store (${SWN.cands.length} calls: ${SWN.filings.length} at the store, ${SWN.notStore.length} not, ${SWN.unplaced.length} unplaced)`, SWN.unplaced.map((c) => `${c.f}:${c.line} ${c.recv}`));
  const ALIASED = ['src/server/oat-identity.js', 'src/server/engine-distribution.js', 'src/plugins/frp.js', 'src/server/browser-dialogs.js', 'src/user-todos.js'];
  ok(ALIASED.every((f) => SWN.filings.some((x) => x.f === f && x.words.size > 0)),
    'stored words (closure 4): the producers that file through a handle spelled otherwise are filings, with their words — oat-identity (`t = T()`), engine-distribution (`ut = T()`), the frp plugin (`ut = forYou()`, its words from relay-token.js), browser-dialogs (`forYou.add?.(`), the store\'s own notice (`this.add`)',
    ALIASED.filter((f) => !SWN.filings.some((x) => x.f === f && x.words.size > 0)));
  // A FILING THE STORE REFUSES (its i18n.detail not an array of lines: add() throws, the item is never filed) is NAMED — the known
  // one is a debt (the sign-in ask, browser-dialogs promptAsk); another is red, and a fix of it removes its row
  const REFUSED_DEBT = ['src/server/browser-dialogs.js «A page in the agent browser asks you to sign in ({host})»'];
  const refusedNow = SWN.filings.filter((x) => x.refused && x.refused.length).map((x) => `${x.f} «${[...x.words][0] || '?'}»`).sort();
  if (refusedNow.length) console.log(`  · ${refusedNow.length} filing(s) the store refuses (i18n.detail not an array of lines — never filed): ${refusedNow.join(', ')}`);
  ok(JSON.stringify(refusedNow) === JSON.stringify(REFUSED_DEBT),
    'stored words (closure 4): a filing the store REFUSES (i18n.detail not an array of lines — add() throws, the item is never filed) is named: the known one (REFUSED_DEBT, the sign-in ask) and no other', refusedNow);
  // CONTROLS: a planted producer that files its words through a model (a constant, a WORDS param, a helper handed to .map BY NAME),
  // beside a live route answer in the same model — the census finds the three stored keys and never the answer
  const PLANT_STORE = ['src/user-todos.js', "'use strict';\nclass UserTodoManager { add(key, { text, i18n } = {}) { return key; } redrawItem(pred, { i18n } = {}) { return pred; } }\nmodule.exports = { UserTodoManager };\n"];
  const PLANT = new Map([
    PLANT_STORE,
    ['server.js', "'use strict';\nconst { UserTodoManager } = require('./src/user-todos.js');\nconst userTodos = new UserTodoManager();\nrequire('./src/server/zz-plant.js').create({ userTodos });\n"],
    ['src/zz-plant-model.js', "'use strict';\nconst i18nKey = (s) => s;\nconst A = i18nKey('Planted stored sentence {n}.');\nconst B = Object.freeze({ gone: 'Planted detail line.' });\nfunction strip(l) { return { key: l.key, ...(l.params ? { params: l.params } : {}) }; }\nfunction words(n) { const lines = [{ key: B.gone }]; return { text: 'x', i18n: { text: { key: A, params: { n, what: { key: 'Planted words param.' } } }, detail: lines.map(strip) } }; }\nfunction answer(res) { res.json({ error: { key: i18nKey('Planted live answer.') } }); }\nmodule.exports = { words, answer };\n"],
    ['src/server/zz-plant.js', "'use strict';\nconst M = require('../zz-plant-model.js');\nfunction create({ userTodos }) { const file = (n) => { const w = M.words(n); userTodos.add('k', { origin: 'server', text: w.text, i18n: w.i18n }); }; return { file }; }\nmodule.exports = { create };\n"],
  ]);
  const SWP = storedWordsReader({ files: PLANT, acorn: acornS });
  // CONTROLS (closure 4): a handle spelled otherwise (a `todos` getter, called through a local `T()`), a plugin's host handle `h`
  // whose road the reader cannot see (placed by the handle name the wiring sets: forYou), a receiver it cannot place (RED by its
  // file and line), a class's own add (not the store)
  const PLANT2 = new Map([
    PLANT_STORE,
    ['server.js', "'use strict';\nconst { UserTodoManager } = require('./src/user-todos.js');\nconst userTodos = new UserTodoManager();\nrequire('./src/server/zz-aliased.js').create({ todos: () => userTodos });\nclass Plugins { constructor(opts) { this.opts = opts; } }\nnew Plugins({ forYou: () => userTodos });\n"],
    ['src/server/zz-aliased.js', "'use strict';\nfunction create({ todos = () => null } = {}) { const T = () => { try { return typeof todos === 'function' ? todos() : todos; } catch { return null; } }; return { file() { const t = T(); if (t) t.add('k', { origin: 'server', text: 'x', i18n: { text: { key: 'Planted aliased sentence.' } } }); } }; }\nmodule.exports = { create };\n"],
    ['src/plugins/zz-plugin.js', "'use strict';\nmodule.exports = { id: 'zz', create(h) { const fy = () => (h.opts && typeof h.opts.forYou === 'function' ? h.opts.forYou() : null); return { file() { const u = fy(); if (u) u.add('p', { origin: 'plugin', i18n: { text: { key: 'Planted plugin sentence.' } } }); } }; } };\n"],
    ['src/server/zz-unplaced.js', "'use strict';\nfunction relay(out) { out.add('k', { origin: 'server', text: 'x', i18n: { text: { key: 'Planted unplaced sentence.' } } }); }\nmodule.exports = { relay };\n"],
    ['src/server/zz-box.js', "'use strict';\nclass Box { add(k, v) { return [k, v]; } }\nconst bx = new Box();\nbx.add('k', { text: 'not a For-you item' });\nmodule.exports = {};\n"],
  ]);
  const SW2 = storedWordsReader({ files: PLANT2, acorn: acornS });
  const w2 = [...SW2.words.keys()].sort();
  ok(JSON.stringify(w2) === JSON.stringify(['Planted aliased sentence.', 'Planted plugin sentence.']) && SW2.unplaced.length === 1 && SW2.unplaced[0].f === 'src/server/zz-unplaced.js' && SW2.unplaced[0].line === 2
    && SW2.notStore.length === 1 && SW2.notStore[0].f === 'src/server/zz-box.js' && ['todos', 'forYou'].every((n) => SW2.handles.some((h) => h.name === n)),
    'CONTROL (closure 4): the census follows a handle spelled otherwise to the store (`t = T()` over a `todos` getter; a plugin\'s `h.opts.forYou()` by the handle name the wiring sets), names an unplaced receiver by its file and line, and a class\'s own add is not the store',
    { words: w2, how: SW2.cands.map((c) => `${c.f}:${c.line} ${c.place.kind} ${c.place.how}`.slice(0, 140)), handles: SW2.handles.map((h) => h.name) });
  const plantWords = [...SWP.words.keys()].sort();
  ok(JSON.stringify(plantWords) === JSON.stringify(['Planted detail line.', 'Planted stored sentence {n}.', 'Planted words param.']) && SWP.filings.length === 1 && !SWP.filings[0].open.length,
    'CONTROL: the census follows a planted producer into its model — the text\'s key, a WORDS param, a detail line built by a helper handed to .map by name — and never counts the model\'s live route answer', plantWords);
  // THE LAW, one function: a sentence the release stored (with its rows there) keeps its zh and ja rows now, and is filed by a
  // producer now or NAMED in STORED_WORDS_LEGACY
  const lawOf = (relStored, nowStored, zh, ja, leg) => { const named = new Set(Object.values(leg).map((e) => e.key)); return [...relStored].flatMap((x) => { const rows = has(zh, x) && has(ja, x), ok1 = nowStored.has(x) || named.has(x); return rows && ok1 ? [] : [{ s: x, rows, named: named.has(x), filedNow: nowStored.has(x) }]; }); };
  const PS = 'Planted stored sentence {n}.';
  const lawRed = lawOf(new Set([PS]), new Set(), {}, {}, {}), lawGreen = lawOf(new Set([PS]), new Set(), { [PS]: '种下' }, { [PS]: '植えた' }, { p: { key: PS } });
  ok(lawRed.length === 1 && lawRed[0].s === PS && !lawRed[0].rows && lawGreen.length === 0, 'CONTROL: a planted stored sentence reworded since its release is RED by its words (no rows, no legacy row); its rows kept and its legacy row named, it is green', { lawRed, lawGreen });
  // THE RELEASE (closure 4, item 2 — by ANCESTRY, never by a subject's words): the newest commit at or below HEAD that changed
  // package.json's "version" line (git log -G) and whose version differs from its parent's (the content, read with git cat-file) — the
  // release this tree was cut from (a lane never bumps the version); a HEAD that is such a commit (a release commit) is checked against
  // the release before it. A commit the clone holds without its parent (the edge of a shallow clone) is no release: a named SKIP
  const { spawnSync } = await import('node:child_process');
  const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).trim(); } catch { return null; } };
  const versionOf = (txt) => { try { return JSON.parse(txt).version || null; } catch { return null; } };
  const pkgsAt = (specs) => {   // spec → package.json's text (null: the clone does not hold it); null when cat-file itself fails
    const pc = spawnSync('git', ['-C', REPO, 'cat-file', '--batch'], { input: specs.join('\n') + '\n', maxBuffer: 1 << 24 });
    if (pc.status !== 0 || !pc.stdout) return null;
    const out = new Map();
    for (let off = 0, i = 0; off < pc.stdout.length && i < specs.length; i++) { const nl = pc.stdout.indexOf(10, off); const h1 = pc.stdout.slice(off, nl).toString().split(' '); if (h1[1] !== 'blob') { out.set(specs[i], null); off = nl + 1; continue; } const size = Number(h1[2]); out.set(specs[i], pc.stdout.slice(nl + 1, nl + 1 + size).toString('utf8')); off = nl + 1 + size + 1; }
    return out;
  };
  const headSha = git('log', '-1', '--format=%H', 'HEAD');
  const bumps = (git('log', '--format=%H %P', '-G"version":', '-n', '12', 'HEAD', '--', 'package.json') || '').split('\n').filter(Boolean).map((l) => l.split(' '));
  let relSha = null, relVer = null, edge = null;
  for (const [sha, parent] of bumps) {
    if (sha === headSha) continue;   // HEAD a release commit: checked against the release before it
    if (!parent) { edge = sha; break; }   // the clone's edge (or the first commit): nothing to compare its version with
    const pk = pkgsAt([`${sha}:package.json`, `${parent}:package.json`]);
    const v = pk && versionOf(pk.get(`${sha}:package.json`)), pv = pk && versionOf(pk.get(`${parent}:package.json`));
    if (v && pv && v !== pv) { relSha = sha; relVer = v; break; }
  }
  let relStored = null;
  if (!relSha) {
    const shallow = git('rev-parse', '--is-shallow-repository') === 'true', depth = Number(git('rev-list', '--count', 'HEAD')) || 0;
    const why = shallow ? (depth === 1 ? 'a depth-1 clone' : `a shallow clone of ${depth} commits`) : edge ? 'the history holds no version change with its parent' : 'no commit at or below HEAD changed the version';
    SKIPS.push(`the release comparison (${why})`);
    console.log(`  ~ SKIP: stored words against the release this tree was cut from — ${why}: no commit at or below HEAD that changed package.json's version is here with its parent; the census of this tree, its legacy rows and its controls stand`);
  } else {
    console.log(`  · the release this tree was cut from (by ancestry: the newest commit at or below HEAD that changed package.json's version): ${relSha.slice(0, 9)} (${relVer})`);
    const list = [...(git('ls-tree', '-r', '--name-only', relSha, '--', 'src') || '').split('\n').filter((f) => f.endsWith('.js') && (/^src\/lib\/i18n-(zh|ja)\.js$/.test(f) || (!f.startsWith('src/lib/') && !/^i18n/.test(path.posix.basename(f))))), 'server.js'];
    const changed = new Set((git('diff', '--name-only', '--no-renames', relSha, '--', 'src', 'server.js') || '').split('\n'));
    const want = list.filter((f) => f.startsWith('src/lib/') || !NOW.has(f) || changed.has(f));
    const blobs = new Map();
    const cat = spawnSync('git', ['-C', REPO, 'cat-file', '--batch'], { input: want.map((f) => `${relSha}:${f}`).join('\n') + '\n', maxBuffer: 1 << 28 });
    if (cat.status !== 0) console.log(`  ~ SKIP: the release's blobs could not be read (git cat-file answered ${cat.status}) — its stored-words legs below go red by name`);
    for (let off = 0, i = 0; cat.status === 0 && cat.stdout && off < cat.stdout.length && i < want.length; i++) { const nl = cat.stdout.indexOf(10, off); const head1 = cat.stdout.slice(off, nl).toString().split(' '); if (head1[1] !== 'blob') { off = nl + 1; continue; } const size = Number(head1[2]); blobs.set(want[i], cat.stdout.slice(nl + 1, nl + 1 + size).toString('utf8')); off = nl + 1 + size + 1; }
    const REL = new Map(list.filter((f) => !f.startsWith('src/lib/')).map((f) => [f, blobs.has(f) ? blobs.get(f) : NOW.get(f)]));
    const keysOf = (txt) => new Set([...String(txt || '').matchAll(/^  ("(?:[^"\\]|\\.)*"): /gm)].map((m) => { try { return JSON.parse(m[1]); } catch { return JSON.parse(m[1].replace(/\\'/g, "'")); } }));
    const relZh = keysOf(blobs.get('src/lib/i18n-zh.js'));
    const SWR = storedWordsReader({ files: REL, acorn: acornS, shared: SHARED });
    relStored = new Set([...SWR.words.keys()].filter((x) => relZh.has(x)));
    const lost = [...relStored].filter((x) => !storedNow.has(x));
    const gone = [...relZh].filter((k) => !has(ZH, k));
    console.log(`  · the release ${relSha.slice(0, 9)} (${relVer}): ${SWR.filings.length} filings stored ${relStored.size} sentences with a zh row; ${lost.length} are filed by no producer now; ${gone.length} of its zh rows are gone now — ${gone.filter((k) => SWR.words.has(k)).length} of them stored (the census decides, not a judgment)`);
    ok(relZh.size > 5000 && SWR.filings.length >= 60 && !SWR.exhausted && SWR.converged && SWR.filings.every((x) => !x.unparsed && !x.open.length),
      `stored words: the release ${relVer} is read the same way (its dictionaries and every filing of its producers)`, { zh: relZh.size, n: SWR.filings.length, open: SWR.filings.filter((x) => x.unparsed || x.open.length).map((x) => `${x.f}:${x.line}`).slice(0, 6) });
    const red = lawOf(relStored, storedNow, ZH, JA, LEG);
    for (const x of red) ok(false, `stored words (closure 3): «${x.s.slice(0, 110)}…» — a ${relVer} hub stored it (${(SWR.words.get(x.s) || []).slice(0, 2).join(', ')}); an item it filed is drawn after the update, so it keeps its zh and ja rows and, filed by no producer now, is a NAMED legacy row`, { rows: x.rows, named: x.named, filedNow: x.filedNow });
    ok(red.length === 0, `stored words (closure 3): each of the ${relStored.size} sentences the release ${relVer} stored keeps its zh and ja rows now; the ${lost.length} no producer files any more are named legacy rows`, red.map((x) => x.s.slice(0, 90)));
    ok(Object.values(LEG).every((e) => e.left !== relVer || relStored.has(e.key)), `stored words: every legacy row left in ${relVer} is a sentence that release STORED (read from it, never picked)`, Object.entries(LEG).filter(([, e]) => e.left === relVer && !relStored.has(e.key)).map(([k]) => k));
  }
  // EACH LEGACY ROW: its release, its producer, its two rows, filed by no producer now — and an item stored with it says it in zh / ja
  for (const [name, e] of Object.entries(LEG)) {
    const params = Object.fromEntries([...String(e.key).matchAll(/\{(\w+)\}/g)].map((m) => [m[1], m[1] === 'account' ? 'UCI Max' : m[1] === 'since' ? '10/8/26, 1:30 PM' : 3]));
    const item = { id: 'ut-1', text: 'x', i18n: { text: { key: e.key, params }, detail: [{ key: e.key, params }] } };
    const say = (dict) => { const said = (l) => UTL.saidLine(l, tOf(dict)); return `${UTL.itemTextOf(item, said)} ${UTL.itemDetailLinesOf(item, said).join(' ')}`; };
    const zh = say(ZH), ja = say(JA);
    const d = { named: /^2\.\d+\.\d+$/.test(String(e.left)) && typeof e.filedBy === 'string' && fs.existsSync(path.join(REPO, e.filedBy)), rows: has(ZH, e.key) && has(JA, e.key), filedNow: words.has(e.key) || storedNow.has(e.key), english: sentence.test(zh) || sentence.test(ja) };
    ok(d.named && d.rows && !d.filedNow && !d.english, `stored words: legacy «${name}» (left in ${e.left}, filed by ${e.filedBy}) — its key keeps its zh and ja rows, no producer files it now, and an item stored with it says it in zh / ja, not English`, { ...d, zh: zh.slice(0, 90), ja: ja.slice(0, 90) });
  }
  // #4 the overage refusal is a need with its door (a rewording had taken it out of the net): the row, present, its door beside the chip
  const UI = TABLES.find((x) => x.scope === 'ui').T;
  const ov = UI.NEEDS.find((r) => r.id === 'overage-turns');
  const ovSentence = 'Automatic turns are refused on this account while it bills paid overage (a Spending setting can allow them).';
  const UM = fs.readFileSync(path.join(REPO, 'src/lib/usage-meter.js'), 'utf8');
  ok(!!ov && !!ov.door.present && UI.needOf(ovSentence) === ov && UI.inNet(ovSentence) && (ov.door.via || {})['src/lib/usage-source.js'] === 'src/lib/usage-meter.js'
    && /ovc\.kind === 'inUse' && !turnsAllowed \? ` <button type="button" class="mounts-btn need-door usage-spend-door" data-door="settings:spend\.allowOverageTurns">\$\{escHtml\(t\('Allow automatic turns…'\)\)\}<\/button>`/.test(UM)
    && /const sp = e\.target\.closest\('\.usage-spend-door'\);[^\n]*\n\s*if \(sp\) \{ e\.stopPropagation\(\); const d = settingsDoor\(this, 'spend\.allowOverageTurns'/.test(UM),
    'overage (verifier #4, picks 3–6): «Automatic turns are refused … (a Spending setting can allow them)» is a present row again — «Allow automatic turns…» beside the Credits chip in the usage popup opens the Spending row that allows them', ov && ov.door);
  // closure 3 (item 4): the door names an act STILL TO DO — drawn only while spend.allowOverageTurns is off (the popup's chip line,
  // evaluated with the setting off and on)
  // closure 4 (item 4): the chip's TIP is worded by the same setting (the popup hands it to overageChip) — the three lines, evaluated
  // with the real overageChip (src/lib/usage-source.js) and the setting off and on
  const US = await imp('src/lib/usage-source.js');
  const ovLine = (UM.match(/^[ \t]*const turnsAllowed = [^\n]*\n[ \t]*const ovc = overageChip\([^\n]*\n[ \t]*if \(ovc\) parts\.push\([^\n]*\n/m) || [''])[0];
  const drawOv = (allowed) => { const parts = []; try { new Function('parts', 'snap', 'overageChip', 'overageState', 'creditsChipHtml', 'escHtml', 't', 'UI_ICONS', ovLine).call({ settings: { get: (k) => (k === 'spend.allowOverageTurns' ? allowed : undefined) } }, parts, {}, US.overageChip, () => ({ inUse: 'yes' }), (c) => `<chip tip="${c.tip}">`, (x) => String(x), (x) => x, { money: '' }); } catch (e) { return 'THREW ' + e.message; } return parts.join(''); };
  const ovOff = drawOv(false), ovOn = drawOv(true);
  ok(/^<chip tip="[^"]*"> <button [^>]*usage-spend-door/.test(ovOff) && /^<chip tip="[^"]*">$/.test(ovOn), 'overage (closure 3, item 4): «Allow automatic turns…» is drawn beside the in-use Credits chip only while spend.allowOverageTurns is OFF — with it on, the chip alone', { off: ovOff.slice(0, 220), on: ovOn.slice(0, 220) });
  const RUN = 'Automatic turns still run on this account while it bills paid overage (its Spending setting allows them).';
  ok(ovOff.includes(ovSentence) && !ovOff.includes(RUN) && ovOn.includes(RUN) && !/refused/.test(ovOn)
    && US.overageChip({ inUse: 'yes' }).tip.includes(ovSentence) && US.overageChip({ inUse: 'yes' }, { turnsAllowed: true }).tip.includes(RUN),
    'overage (closure 4, item 4): the Credits chip\'s tip says what the Spending setting does NOW — «Automatic turns are refused …» while spend.allowOverageTurns is off, «Automatic turns still run …» once it allows them (the popup hands the setting to overageChip)', { off: ovOff.slice(0, 260), on: ovOn.slice(0, 260) });
  ok(ZH['Allow automatic turns…'] === '允许自动回合…' && /自动回合/.test(ZH[RUN] || '') && /自動ターン/.test(JA[RUN] || '') && JA['Allow automatic turns…'] === '自動ターンを許可…',
    'overage (closure 4, item 4): the door and the new tip say «automatic turns» in each dictionary\'s own term — zh 自动回合 («允许自动回合…»), ja 自動ターン', { zh: [ZH['Allow automatic turns…'], ZH[RUN]], ja: [JA['Allow automatic turns…'], JA[RUN]] });
  // #5 the lapsed chip under refresh 'off' is the setting's door — its VISIBLE words say the act (never only its title)
  const MA = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
  const cs = MA.indexOf('export function serveLapsedChipHtml('), ce = MA.indexOf('\n}\n', cs);
  let chipOff = '';
  try {
    const chipFn = new Function('t', 'escHtml', 'loginWhenText', 'ROSTER_ICONS', MA.slice(cs, ce + 2).replace(/^export /, '') + '\nreturn serveLapsedChipHtml;')((k, p) => k.replace(/\{(\w+)\}/g, (_, x) => (p && p[x] != null ? p[x] : '')), (x) => String(x), () => '10/8/26, 1:30 PM', { CLOCK: '' });
    chipOff = chipFn({ id: 'sub-1', serve: { state: 'lapsed', since: 1, why: 'x' } }, { mode: 'off' });
  } catch (e) { chipOff = 'THREW ' + e.message; }
  const visible = chipOff.replace(/ title="[^"]*"/g, '').replace(/<[^>]+>/g, '').trim();
  ok(/role="button"/.test(chipOff) && /data-serve-setting="accounts\.onDemandQuotaRefresh"/.test(chipOff) && /· Turn on usage refresh…$/.test(visible) && /^subscription inactive since /.test(visible),
    'lapsed chip (verifier #5, picks 3–6): under usage refresh «off» the chip is the setting\'s door and its visible words say that act («… · Turn on usage refresh…»), as the other chip says «· Re-check»', visible);
  // closure 3 (item 5): the chip's two visible verbs go into its HTML through escHtml (a translation is text, never markup)
  let escOff = '', escMan = '';
  try {
    const chipE = new Function('t', 'escHtml', 'loginWhenText', 'ROSTER_ICONS', MA.slice(cs, ce + 2).replace(/^export /, '') + '\nreturn serveLapsedChipHtml;')((k, p) => (k === 'Turn on usage refresh…' || k === 'Re-check' ? `<b>${k}</b>` : k.replace(/\{(\w+)\}/g, (_, x) => (p && p[x] != null ? p[x] : ''))), (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), () => '10/8/26, 1:30 PM', { CLOCK: '' });
    escOff = chipE({ id: 'sub-1', serve: { state: 'lapsed', since: 1, why: 'x' } }, { mode: 'off' }); escMan = chipE({ id: 'sub-1', serve: { state: 'lapsed', since: 1, why: 'x' } }, { mode: 'manual' });
  } catch (e) { escOff = 'THREW ' + e.message; }
  ok(/ · &lt;b&gt;Turn on usage refresh…&lt;\/b&gt;<\/span>$/.test(escOff) && / · &lt;b&gt;Re-check&lt;\/b&gt;<\/span>$/.test(escMan), 'lapsed chip (closure 3, item 5): «· Turn on usage refresh…» and «· Re-check» go into the chip\'s HTML through escHtml', { off: escOff.slice(-80), manual: escMan.slice(-80) });
}

{ // pick 6, the 390 px picture: a touch row folds to its sentence + ONE trailing door — a pointer's declared door is that door
  const UTR = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-row.js'), 'utf8');
  ok(/const rowDoor = doorOf\(i\);/.test(UTR) && /\(notice \|\| entry\.band\) && rowDoor \? `<button type="button" class="ut-go ut-go-door"[^`]*data-label="\$\{escHtml\(t\(rowDoor\.verb\)\)\}"/.test(UTR),
    'pick 6: on a touch row the trailing door of a pointer with a declared door says ITS verb («Open the Outbox»), not «Chat»');
}
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* a FIFO left by a hung read */ }
const skipped = SKIPS.length ? ` · ${SKIPS.length} skipped by name: ${SKIPS.join('; ')}` : '';
console.log(fail ? `\n${fail} FAILED (${pass} passed)${skipped}` : `\nALL PASS (${pass})${skipped}`);
process.exit(fail ? 1 : 0);
