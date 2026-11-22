#!/usr/bin/env node
// test-idcap-census — 主开发 r2355 / r2396 (lane bl-phone-ui): A WINDOW ID CAPTURED EARLIER, READ BY A HANDLER THAT RUNS LATER. Two
// roads change a window's id in place (window.js rekeyWindow — B-1d87's two-device adoption, the stage's; layout.js's restore remap);
// a handler that kept the old id acts on no window, in silence. This suite walks the syntax tree (acorn) of every src/lib/*.js but
// the i18n tables and finds each place where a function that runs LATER reads a window id bound OUTSIDE it; every place has a
// verdict row in scripts/fixtures/idcap-verdicts.json, by name (file · later kind · binding · how it was bound — no line numbers):
// live (the window held, its id read when it acts), record (a record's id: no road re-keys a window its desktop's record lists),
// redrawn (the surface is drawn again when an id changes — the why names the line), not-a-window-id. NEVER stale: a stale capture is
// cured by the rule, not listed. RED: a place with no row (a new capture), a row no place has (shrink it), a stale verdict, a row
// with no why. The page of the first census: bl-phone-ui/idcap/page-r2355.md (357 places, 16 cured).
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(REPO, 'src/lib');
const FIXTURE = path.join(REPO, 'scripts/fixtures/idcap-verdicts.json');
const FILES = fs.readdirSync(LIB).filter((f) => f.endsWith('.js') && !f.startsWith('i18n-')).sort();
const VERDICTS = new Set(['live', 'record', 'redrawn', 'not-a-window-id']);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok(cond, name): cond is a ${typeof c}, not a boolean — the name goes second`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 6000) : '')); } };
const ID_NAME = /^(?:winId|windowId|tabWinId)$|(?:Win|Window)Id$/;   // a window's id by its name anywhere
const ID_NAME_WM = /^(?:hostId|tid|tabId|oldId|newId|activeId|paneId|focusId|focusedId|guestId|leftId|rightId|otherId|id)$/;   // …and these, only in a file that uses the window manager (bound from a window, or a loop over windows / tabs)
const ID_INIT = /(?:^|[^\w$.])(?:w|win|winInfo|wi|tl|host|guest|pane|activeWin|focusWin)\.id\b|dataset\.winId|\.winId\b|\.tabs\s*\[|activeWindowId|_chooser\.hostId/;
const ID_LOOP = /\.windows\b|\.tabs\b|winIds\b|tabIds\b/;
const ID_PROP = new Set(['id', 'winId', 'hostId', 'windowId']);
const WM_ID_METHODS = new Set('_applySnap beginDragFromPointer beginResizeFromPointer cancelPointerOp closeWindow focusWindow followIdChange _inboxBadgeEl isReachable markArrived minimize _paneFacts placeBehind rekeyWindow requestCloseGroup requestClose resizeWindowTo restore _retireWindow revealWindow setAuthBadge setFixedSize setInboxBadge setMinSize setOwnerBadge setPaneMinWidth setTitle setTitleMeta _snapToGridRange _snapToGrid snapToHalf startMoveMode toggleMaximize witnessGeometry'.split(' '));
const APP_ID_HELPERS = new Set('activateWindow showWindowContextMenu tileIds windowMenuHolds windowMenuRows windowMenuCtx'.split(' '));   // (app, id): the id is argument 1
const ID0_HELPERS = new Set(['_chooserOf', 'revealHeld']);   // the id is argument 0
const WM_FILES = new Set();   // the files that use the window manager
const WIN_OBJ = /^(?:w|win|winInfo|wi|tl|host|guest|pane|tab|activeWin|focusWin|frame)$|Win$|Window$/;
const LATER_CALL = new Set(['addEventListener', 'on', 'once', 'subscribe', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback', 'queueMicrotask', 'then', 'catch', 'finally']);
const LATER_NEW = new Set(['MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'PerformanceObserver']);
const SYNC_CALL = new Set(['forEach', 'map', 'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'some', 'every', 'reduce', 'reduceRight', 'sort', 'toSorted', 'flatMap', 'from', 'replace', 'replaceAll', 'call', 'apply']);
const isFn = (n) => !!n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration');
const nameOf = (c) => (!c ? '' : c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier' ? c.property.name : c.type === 'MemberExpression' && c.computed && c.property.type === 'Literal' ? String(c.property.value) : '');
const keyOf = (p) => (p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : '[computed]');
function patternNames(p, out = []) {
  if (!p) return out;
  if (p.type === 'Identifier') out.push(p);
  else if (p.type === 'ObjectPattern') for (const q of p.properties) patternNames(q.type === 'RestElement' ? q.argument : q.value, out);
  else if (p.type === 'ArrayPattern') for (const q of p.elements) patternNames(q, out);
  else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
  else if (p.type === 'RestElement') patternNames(p.argument, out);
  return out;
}
const CHILD_SKIP = new Set(['type', 'start', 'end', 'loc', 'range', 'raw', 'regex', 'bigint', 'sourceType']);   // NOT 'value': a Property's / MethodDefinition's value is a node (a literal's value is no node — the type check drops it)
function children(n) { const out = []; for (const k of Object.keys(n)) { if (CHILD_SKIP.has(k)) continue; const v = n[k]; if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') out.push([k, x]); } else if (v && typeof v.type === 'string') out.push([k, v]); } return out; }

function analyze(file, src = fs.readFileSync(path.join(LIB, file), 'utf8')) {
  let ast;
  try { ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, locations: true }); }
  catch (e) { return { file, error: String(e.message || e) }; }
  const lines = src.split('\n');
  const text = (n) => src.slice(n.start, n.end).replace(/\s+/g, ' ');
  const found = [], localUse = new Map();   // binding → [{ later: bool }]
  // a scope = { node, vars: Map name → binding, fn: the function (or Program) it belongs to }
  const declare = (scope, idNode, info) => { scope.vars.set(idNode.name, { name: idNode.name, pos: idNode.start, line: idNode.loc.start.line, scope, ...info }); };
  function hoistVars(body, scope) {   // var + function declarations of a function body, not crossing functions
    const walk = (n, top) => {
      if (!n || typeof n.type !== 'string') return;
      if (isFn(n) && !top) { if (n.type === 'FunctionDeclaration' && n.id) declare(scope, n.id, { init: 'function ' + n.id.name, localFn: n }); return; }
      if (n.type === 'VariableDeclaration' && n.kind === 'var') for (const d of n.declarations) for (const id of patternNames(d.id)) declare(scope, id, { init: d.init ? text(d.init).slice(0, 120) : '', localFn: isFn(d.init) ? d.init : null });
      if (n.type === 'ClassBody') return;
      for (const [, c] of children(n)) walk(c, false);
    };
    walk(body, true);
  }
  function blockDecls(stmts, scope) {
    for (const s of stmts) {
      const d = s.type === 'ExportNamedDeclaration' || s.type === 'ExportDefaultDeclaration' ? s.declaration : s;
      if (!d) continue;
      if (d.type === 'VariableDeclaration' && d.kind !== 'var') for (const v of d.declarations) for (const id of patternNames(v.id)) declare(scope, id, { init: v.init ? text(v.init).slice(0, 120) : '', localFn: isFn(v.init) ? v.init : null });
      if (d.type === 'ClassDeclaration' && d.id) declare(scope, d.id, { init: 'class' });
      if (d.type === 'FunctionDeclaration' && d.id && scope.node.type !== 'Program' && !scope.vars.has(d.id.name)) declare(scope, d.id, { init: 'function ' + d.id.name, localFn: d });
    }
  }
  const resolve = (scopes, name) => { for (let i = scopes.length - 1; i >= 0; i--) { const b = scopes[i].vars.get(name); if (b) return b; } return null; };
  const fnKind = new Map();
  const isWindowParamFn = (fnNode, parentKey) => {
    const nm = fnNode.id ? fnNode.id.name : parentKey || '';
    return WM_ID_METHODS.has(nm) || APP_ID_HELPERS.has(nm);
  };
  function visit(n, parent, pkey, ctx) {
    if (!n || typeof n.type !== 'string') return;
    // ── mark the kind of a function by where it stands
    if (n.type === 'CallExpression') {
      const nm = nameOf(n.callee);
      n.arguments.forEach((a, i) => {
        if (!isFn(a)) return;
        if (LATER_CALL.has(nm)) fnKind.set(a, nm + (nm === 'addEventListener' && n.arguments[0] && n.arguments[0].type === 'Literal' ? ':' + n.arguments[0].value : ''));
        else if (SYNC_CALL.has(nm)) fnKind.set(a, null);
        else fnKind.set(a, 'cb:' + (nm || '?'));
      });
      if (isFn(n.callee)) fnKind.set(n.callee, null);   // an IIFE runs now
    } else if (n.type === 'NewExpression') {
      const nm = nameOf(n.callee);
      for (const a of n.arguments) if (isFn(a)) fnKind.set(a, LATER_NEW.has(nm) ? 'new ' + nm : nm === 'Promise' ? null : 'cb:new ' + nm);
    } else if (n.type === 'AssignmentExpression' && isFn(n.right)) {
      fnKind.set(n.right, n.left.type === 'MemberExpression' ? (/^on/.test(nameOf(n.left)) ? 'on-prop:' : 'assign:') + nameOf(n.left) : 'local-fn:' + nameOf(n.left));
    } else if (n.type === 'Property' && isFn(n.value)) {
      fnKind.set(n.value, 'prop:' + keyOf(n));
    } else if (n.type === 'VariableDeclarator' && isFn(n.init)) {
      fnKind.set(n.init, 'local-fn:' + (n.id.type === 'Identifier' ? n.id.name : '?'));
    } else if (n.type === 'MethodDefinition') {
      fnKind.set(n.value, null);   // a class's method: its own body
    }
    // ── scopes
    let scopes = ctx.scopes, laterStack = ctx.laterStack, fnStack = ctx.fnStack;
    if (n.type === 'Program') { const s = { node: n, vars: new Map(), fn: n }; hoistVars(n, s); blockDecls(n.body, s); scopes = [s]; fnStack = [{ node: n, awaits: [] }]; }
    else if (isFn(n)) {
      const s = { node: n, vars: new Map(), fn: n };
      const winParam = isWindowParamFn(n, pkey === 'value' && parent && (parent.type === 'MethodDefinition' || parent.type === 'Property') ? keyOf(parent) : '');
      for (const p of n.params) for (const id of patternNames(p)) declare(s, id, { init: 'param of ' + (n.id ? n.id.name : (parent && (parent.type === 'MethodDefinition' || parent.type === 'Property') ? keyOf(parent) : 'an anonymous function')), winParam });
      if (n.type === 'FunctionExpression' && n.id) declare(s, n.id, { init: 'self' });
      hoistVars(n.body, s);
      if (n.body.type === 'BlockStatement') blockDecls(n.body.body, s);
      scopes = [...scopes, s];
      fnStack = [...fnStack, { node: n, awaits: [] }];
      let kind = fnKind.has(n) ? fnKind.get(n) : undefined;
      if (kind === undefined) kind = n.type === 'FunctionDeclaration' ? (fnStack.length > 2 ? 'local-fn:' + (n.id ? n.id.name : '?') : null) : (fnStack.length > 2 ? 'other-fn' : null);
      if (kind) laterStack = [...laterStack, { node: n, kind, fnLine: n.loc.start.line }];
    } else if (n.type === 'BlockStatement' && !(parent && isFn(parent))) { const s = { node: n, vars: new Map(), fn: fnStack.at(-1).node }; blockDecls(n.body, s); scopes = [...scopes, s]; }
    else if ((n.type === 'ForStatement' && n.init && n.init.type === 'VariableDeclaration' && n.init.kind !== 'var') || ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type === 'VariableDeclaration' && n.left.kind !== 'var')) {
      const s = { node: n, vars: new Map(), fn: fnStack.at(-1).node };
      const decl = n.type === 'ForStatement' ? n.init : n.left;
      for (const v of decl.declarations) for (const id of patternNames(v.id)) declare(s, id, { init: n.type === 'ForStatement' ? (v.init ? text(v.init).slice(0, 120) : '') : (n.type === 'ForOfStatement' ? 'for-of ' : 'for-in ') + text(n.right).slice(0, 100), loop: n.type !== 'ForStatement' });
      scopes = [...scopes, s];
    } else if (n.type === 'CatchClause' && n.param) { const s = { node: n, vars: new Map(), fn: fnStack.at(-1).node }; for (const id of patternNames(n.param)) declare(s, id, { init: 'catch' }); scopes = [...scopes, s]; }
    else if (n.type === 'SwitchStatement') { const s = { node: n, vars: new Map(), fn: fnStack.at(-1).node }; for (const c of n.cases) blockDecls(c.consequent, s); scopes = [...scopes, s]; }
    if (n.type === 'AwaitExpression') fnStack.at(-1).awaits.push(n.end);
    // ── a reference
    const isRef = n.type === 'Identifier' && !(parent && ((parent.type === 'MemberExpression' && pkey === 'property' && !parent.computed) || (parent.type === 'Property' && pkey === 'key' && !parent.computed && !parent.shorthand) || (parent.type === 'MethodDefinition' && pkey === 'key') || (parent.type === 'PropertyDefinition' && pkey === 'key') || (parent.type === 'VariableDeclarator' && pkey === 'id') || (isFn(parent) && (pkey === 'params' || pkey === 'id')) || parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement' || parent.type.startsWith('Import') || parent.type.startsWith('Export') || (parent.type === 'ClassDeclaration' && pkey === 'id') || (parent.type === 'CatchClause' && pkey === 'param') || ctx.inPattern));
    if (isRef) {
      const b = resolve(scopes, n.name);
      if (b && b.localFn) { const L = laterStack.at(-1); const later = !(parent && parent.type === 'CallExpression' && pkey === 'callee') || (L && !(b.pos >= L.node.start && b.pos <= L.node.end)); (localUse.get(b) || localUse.set(b, []).get(b)).push(later); }
      if (b && b.scope.node.type !== 'Program') consider(n, b, parent, pkey, laterStack, fnStack, 'ident');
    }
    if (n.type === 'MemberExpression' && !n.computed && ID_PROP.has(nameOf(n))) {
      let obj = n.object;
      if (nameOf(n) === 'winId' && obj.type === 'MemberExpression' && nameOf(obj) === 'dataset') obj = obj.object;
      if (obj.type === 'Identifier') { const b = resolve(scopes, obj.name); if (b && b.scope.node.type !== 'Program') consider(n, b, parent, pkey, laterStack, fnStack, 'member'); }
    }
    const next = { scopes, laterStack, fnStack, inPattern: false };
    for (const [k, c] of children(n)) {
      const pat = (n.type === 'VariableDeclarator' && k === 'id') || (isFn(n) && k === 'params') || (n.type === 'AssignmentExpression' && k === 'left' && n.left.type !== 'MemberExpression' && n.left.type !== 'Identifier');
      visit(c, n, k, pat ? { ...next, inPattern: true } : next);
    }
  }
  function consider(n, b, parent, pkey, laterStack, fnStack, how) {
    // the innermost LATER function that holds the use but not the binding
    let L = null;
    for (let i = laterStack.length - 1; i >= 0; i--) { const f = laterStack[i]; if (!(b.pos >= f.node.start && b.pos <= f.node.end)) { L = f; break; } if (b.pos >= f.node.start && b.pos <= f.node.end) break; }
    let kind = L ? L.kind : null, fnLine = L ? L.fnLine : null;
    if (!kind) {   // the code after an await, a binding made before the wait (same function or outside it)
      const F = fnStack.at(-1);
      const a = F.awaits.filter((e) => e <= n.start && b.pos < e);
      if (a.length) { kind = 'after-await'; fnLine = n.loc.start.line; }
    }
    if (!kind) return;
    const use = parent && parent.type === 'CallExpression' && parent.arguments.includes(n) ? 'arg of ' + (nameOf(parent.callee) || '?') + '()' : parent ? parent.type : '';
    const ai = parent && parent.type === 'CallExpression' ? parent.arguments.indexOf(n) : -1, cn = ai >= 0 ? nameOf(parent.callee) : '';
    const recv = ai >= 0 && parent.callee.type === 'MemberExpression' ? src.slice(parent.callee.object.start, parent.callee.object.end) : '';
    const wmRecv = /(?:^|\.)wm$/.test(recv) || (recv === 'this' && (file === 'window.js' || file === 'tab-group.js'));
    const sink = ai >= 0 && ((ai === 0 && WM_ID_METHODS.has(cn) && wmRecv) || (ai === 1 && APP_ID_HELPERS.has(cn)) || (ai === 0 && ID0_HELPERS.has(cn)) || (ai === 0 && ['get', 'has', 'delete'].includes(cn) && /(?:^|\.)(?:wm\.windows|sessions)$|^this\.windows$/.test(recv) && (recv !== 'this.windows' || file === 'window.js' || file === 'tab-group.js')));
    const memberWin = how === 'member' && (WIN_OBJ.test(b.name) || /dataset\.winId$/.test(src.slice(n.start, n.end)) || /\._chooser$|^state$/.test(b.name) && nameOf(n) === 'hostId');
    const windowish = memberWin || (how === 'ident' && (b.winParam || ID_NAME.test(b.name) || (WM_FILES.has(file) && ID_NAME_WM.test(b.name) && (b.winParam || ID_INIT.test(b.init || '') || (b.loop && ID_LOOP.test(b.init || '')))) || ID_INIT.test(b.init || '') || (b.loop && ID_LOOP.test(b.init || '') && /id/i.test(b.name)))) || sink;
    found.push({ file, line: n.loc.start.line, col: n.loc.start.column, how, name: how === 'member' ? text(n) : b.name, kind, fnLine, bline: b.line, binit: (b.init || '').slice(0, 90), use, sink, windowish, src: (lines[n.loc.start.line - 1] || '').trim().slice(0, 170) });
  }
  visit(ast, null, null, { scopes: [], laterStack: [], fnStack: [], inPattern: false });
  // a local function that never escapes and is only called where it stands runs NOW: its uses leave the main list
  for (const f of found) if (f.kind && f.kind.startsWith('local-fn:')) { const nm = f.kind.slice(9); const e = [...localUse.entries()].find(([b]) => b.name === nm && b.localFn); f.localLater = e ? e[1].some(Boolean) : true; }
  return { file, found };
}

for (const f of FILES) { const t = fs.readFileSync(path.join(LIB, f), 'utf8'); if (/\bwm\.windows\b|\.activeWindowId\b|\brekeyWindow\b|\bwm\.(?:revealWindow|focusWindow|requestClose)\b/.test(t)) WM_FILES.add(f); }

// ── the places: one later function × one captured binding; the key has no line number (an edit above it moves nothing)
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60);
function placesOf(found) {
  const main = found.filter((x) => x.windowish && !(x.kind.startsWith('local-fn:') && x.localLater === false));
  const by = new Map();
  for (const x of main) {
    const base = x.how === 'member' ? x.name.replace(/\?/g, '') : x.name;
    const place = `${x.file}\u0000${x.fnLine}\u0000${base}\u0000${x.bline}`;
    if (!by.has(place)) by.set(place, { key: `${x.file} · ${x.kind} · ${base} · ${norm(x.binit)}`, where: `${x.file}:${x.line}`, src: x.src.slice(0, 150) });
  }
  const keys = new Map();
  for (const p of by.values()) { const k = keys.get(p.key) || { count: 0, where: [] }; k.count++; k.where.push(p.where + ' ' + p.src); keys.set(p.key, k); }
  return keys;
}
const t0 = process.hrtime.bigint();
for (const f of FILES) { const t = fs.readFileSync(path.join(LIB, f), 'utf8'); if (/\bwm\.windows\b|\.activeWindowId\b|\brekeyWindow\b|\bwm\.(?:revealWindow|focusWindow|requestClose)\b/.test(t)) WM_FILES.add(f); }
const found = [], errors = [];
for (const f of FILES) { const r = analyze(f); if (r.error) errors.push(`${f}: ${r.error}`); else found.push(...r.found); }
const walkMs = Number(process.hrtime.bigint() - t0) / 1e6;
const keys = placesOf(found);
const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const rows = new Map((fx.rows || []).map((r) => [r.key, r]));
console.log(`test-idcap-census: ${FILES.length} files of src/lib walked in ${walkMs.toFixed(0)} ms (the i18n tables left out; ${WM_FILES.size} use the window manager) · ${[...keys.values()].reduce((a, k) => a + k.count, 0)} places by ${keys.size} names · ${rows.size} rows`);
console.log('§1 the walk itself');
ok(errors.length === 0, `every file parses (${FILES.length})`, errors);
ok(FILES.length >= 300 && WM_FILES.size >= 40 && keys.size >= 100, `the walk reaches the window code (${FILES.length} files, ${WM_FILES.size} that use the window manager, ${keys.size} names) — a walk that lost its files is no census`);
console.log('§2 every place has its verdict, by name');
const missing = [], over = [];
for (const [k, v] of keys) { const r = rows.get(k); if (!r || r.count < v.count) missing.push(`${k}  (${v.count} here, ${r ? r.count : 0} in the fixture) — ${v.where.join(' | ')}`); }
for (const [k, r] of rows) { const v = keys.get(k); if (!v || v.count < r.count) over.push(`${k}  (${r.count} in the fixture, ${v ? v.count : 0} here)`); }
ok(missing.length === 0, `every later function reading a captured window id has a verdict row (${keys.size} names) — a NEW capture is red until its row says why it is safe, or it is cured by the rule (the window held, its id read when it acts)`, `${missing.length} with no row (each below)`);
for (const m of missing) console.log('    NO ROW ' + m);
ok(over.length === 0, 'no row outlives its place (a row the code no longer has: shrink the fixture)', `${over.length} rows outlive their place (each below)`);
for (const m of over) console.log('    OUTLIVED ' + m);
const bad = [...rows.values()].filter((r) => !VERDICTS.has(r.verdict) || !r.why || typeof r.why !== 'string' || r.why.length < 12);
ok(bad.length === 0 && ![...rows.values()].some((r) => /stale/i.test(r.verdict || '')), 'every row is live, record, redrawn or not-a-window-id, with its why — NEVER stale (a stale capture is cured, not listed)', bad.map((r) => r.key));
console.log('§3 RED: a planted capture');
const PLANT = "\nexport function __plantedCapture(app, el) { for (const [id] of app.wm.windows) el.onclick = () => app.wm.revealWindow(id); }\n";
const planted = analyze('taskbar.js', fs.readFileSync(path.join(LIB, 'taskbar.js'), 'utf8') + PLANT);
const pk = planted.found ? placesOf(planted.found) : new Map(), real = placesOf(found.filter((x) => x.file === 'taskbar.js'));
const plantedKey = [...pk.keys()].find((k) => (pk.get(k).count > (real.get(k)?.count || 0)) && (!rows.has(k) || rows.get(k).count < pk.get(k).count));   // the planted place: one the real file lacks, and no row covers
ok(!!plantedKey && /taskbar\.js · on-prop:onclick · id · for-of app\.wm\.windows/.test(plantedKey), `CONTROL: a click handler planted in taskbar.js that keeps a loop's window id is a place with no row — the census names it (${plantedKey || 'none'})`);
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? ', ' + fail + ' failed' : ''}) · the walk ${walkMs.toFixed(0)} ms`);
process.exit(fail ? 1 : 0);
