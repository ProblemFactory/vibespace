#!/usr/bin/env node
// THE GUARD OF EVERY INLINE ASSERTION HELPER (B-1747 part 2, lane bl-scratch, 2026-11-21). A TOOL the integrator runs on a
// train tip as a generated commit, never a pick (主开发 r1166: a change of ~1050 files would meet every lane's unit in flight);
// the whole fast tier in both zones at the applied tip, and the heavy tier, are its run-time proof. The census
// (scripts/lib/check.mjs helperDefs, read by test-ci-gate-tiers §7b) judges every script's own assertion helper by the
// parameter its body tests; about a thousand of them do not refuse a condition that is not a boolean, so a swapped call —
// ok('the leg', cond) against ok(cond, name) — passes on a truthy string. For each helper the census JUDGES and finds
// UNGUARDED, this tool:
//   1. TELLS CODE FROM TEXT. The parser's own tokens (acorn, the tree's dependency): a helper the census reads inside a
//      string, a template's text, a regex or a comment — a census suite's plants — is a PLANT, said and never edited; every
//      definition, call and use is then read from the parse tree, scope by scope (a call reaches a helper only through its
//      binding: a parameter or an inner binding of the same name is another function).
//   2. GUARDS it — the census's own guard shape, one statement, ON THE OPENING LINE (no line moves: no printed name, no
//      stack line, no line another suite pins):
//        if (typeof <cond> !== 'boolean') throw new TypeError(`<name>: its condition is a ${typeof <cond>}, not a boolean — …`);
//      right after the body's `{`; an ARROW WITH AN EXPRESSION BODY gets a block made of it, on the same lines:
//      `=> { <guard> return (<the expression, the parser's own range>); }`.
//   3. WRAPS each call whose condition is not a boolean BY ITS OPERATOR (true / false, `!`, a comparison, instanceof / in,
//      and && / || / ?: made of those) in place — an && operand that is not the last (a GATE: its truthiness only decides
//      whether the chain goes on) through the shared checker's gateOf (r3179), every other one — through THE GUARDED COERCION
//      of the shared checker (scripts/lib/check.mjs
//      verdictOf, imported on the file's last code line: no line moves) around each operand of an && / || chain (each branch
//      of a ?:) that is not one, so a comparison never stands under a call. NEVER A PLAIN `!!( … )` (the coordinator's r1347:
//      it would make every vacuous leg of the tree invisible for good): a PROMISE or a FUNCTION handed as a verdict now FAILS,
//      red by name, so the applied tree's first run LISTS the vacuous legs it held; any other value coerces as !! would (a
//      match, a length, a string: coerced, not audited). Only a helper whose body asks its condition TRUE OR FALSE (an
//      if / ?: test, a `!`, an && / || in a test or a statement) is guarded — there the call passes exactly when it passed
//      before, and the guard never throws on a call that was there. A condition shaped as a STRING (a literal, a template, a
//      `+` with one) is never wrapped: that is the swap the guard exists for, and its helper is left, by name, for the call
//      to be cured first. Every edit is an insertion, so a call inside another call's condition composes.
//   4. PROVES ITSELF over every file it would write (selfCheck): the line count is unchanged; the text written is the plan
//      applied, and only inserts; the edited file parses; no edit point lies inside a string, a template's text, a regex or
//      a comment; every wrapped call reads back from the NEW file's parse with its condition as planned and a boolean by its
//      operator, and its NAME argument byte-identical with no edit inside it; the census reads every guarded helper as
//      guarded with its order unchanged (or, said by name, no longer reads the order of one whose body opens with its
//      test), and no helper more or less; the wall-clock census reads a file with a `<` / `>` in a wrapped condition the
//      same, with the product's span fields as the gate's ratchet reads it; a wrapped file imports the coercion. If any file
//      fails, or a SECOND RUN over the texts it would write plans anything, NOTHING is written, the failures are said by
//      name, and the run exits 1. ON DISK too: every file is written to a temp first and renamed only when all stand (a
//      failed rename says its one restore step: `git checkout -- scripts`).
//   5. LOWERS the one-way list scripts/fixtures/unguarded-helpers.json to what the census reads after it (a row only falls;
//      a row is never added or raised — a rise is §7b's red).
// NOT BY RULE (each said by name and line; the guard could throw, or a wrap change what it sees, where the tool cannot
// tell): a condition parameter that is destructured, defaulted or a rest; an exported helper (its calls live in other
// files); a helper handed on as a value (passed, stored, reassigned, exported by name); a named function expression; a name
// declared twice in one scope; a file with a direct eval or a with statement; a body that uses its condition as more than
// true or false (c === true, typeof c, c printed, stored or passed on, c ?? x, or a function helper's own `arguments`); a
// file that already names another verdictOf; one that hands its condition back where a
// call reads the value; a call with no condition argument, or by spread; a call that hands it a string where the condition
// goes, or holds a condition in its name slot (a swap: cure the call first); a call of it inside another call's name
// argument; a file the parser cannot read. scripts/lib/check.mjs (the census and the one guarded checker) is not a target.
// THE LIMITS, said (the coordinator's r1385): the first list of vacuous legs is not the whole class.
//   · a promise wrapped by a `Boolean(…)` call stays unseen (Boolean(x) is a boolean by its call; the old `!!` hid it the same);
//   · a promise in the TEST of a ?: inside a condition is never wrapped (only the branches are);
//   · ANY object whose `then` is a function counts as a promise (a query builder, a catch-all mock) — red by name;
//   · an existence leg that hands a function («the module exports it») turns red: its hint is «compare typeof x === 'function'»;
//   · a `then` that cannot be read (a throwing getter, a revoked Proxy) coerces as !! did; a boxed Boolean(false) stays true;
//   · a helper inside a function serialised into a page is left by rule (PAGE_CALLS) — one serialised some other way
//     (`String(fn)`, `fn.toString()`) is not seen: the applied tip's whole tier is where it would show, loudly (a ReferenceError).
// These will be most of the first list; each is cured or named before the apply is taken.
// RUN TWICE = RUN ONCE: a guarded helper is never a target again and its calls are never re-read, so at an applied tip the
// run finds nothing and says so; at any later tip it guards only a helper that is new, and wraps only that helper's calls.
//   node scripts/guard-inline-helpers.mjs [<repo>]                              the DRY RUN: counts, the self-check, writes nothing
//   node scripts/guard-inline-helpers.mjs --list [<repo>]                       … and each guard, wrap, plant and helper left, one line each
//   node scripts/guard-inline-helpers.mjs --apply --coordinator-word [<repo>]   writes (the integrator, on the coordinator's word —
//        a word the integrator types, not a second check), ON THE BLOCK'S ASSEMBLED TIP as its last line; the apply's proof
//        (it prints it): the dry run says NOTHING TO DO after it, the stale-pin scan over the APPLIED diff, the whole fast tier in
//        both zones, every heavy suite it edited, and the vacuous legs the first run lists, each cured or named
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PARSE_OPTS = Object.freeze({ ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowImportExportEverywhere: true, preserveParens: true });
// a text's line of a point (the newline offsets once per text, then a binary search)
export function lineIndex(src) {
  const nl = []; for (let k = src.indexOf('\n'); k !== -1; k = src.indexOf('\n', k + 1)) nl.push(k);
  return (i) => { let lo = 0, hi = nl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (nl[m] < i) lo = m + 1; else hi = m; } return lo + 1; };
}

// ── 1. the parse, and the spans of text that are not code (the parser's own string, regex and template-text tokens, and
// its comments) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// A point i is INSIDE a span when an insertion at i would land in its text: strictly inside a string, a regex or a block
// comment; from just after `//` to the end of the line for a line comment; anywhere between a template text's delimiters.
export function readCode(src, acorn, { spans: want = true } = {}) {
  const spans = [];
  let ast;
  try {
    ast = acorn.parse(src, { ...PARSE_OPTS, onComment: want ? (block, text, s, e) => spans.push(block ? [s, e] : [s, e + 1]) : undefined });
  } catch (e) { return { ok: false, why: `the parser stopped at line ${e.loc ? e.loc.line : '?'} (${String(e.message).replace(/\s*\(\d+:\d+\)$/, '').slice(0, 80)})` }; }
  if (want) {
    const visit = (n) => {
      if (n.type === 'Literal') { if (typeof n.value === 'string' || n.regex) spans.push([n.start, n.end]); return; }
      if (n.type === 'TemplateElement') { spans.push([n.start - 1, n.end + 1]); return; }
      eachKid(n, visit);
    };
    visit(ast);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const inside = (i) => { let lo = 0, hi = spans.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (spans[m][1] <= i) lo = m + 1; else if (spans[m][0] >= i) hi = m - 1; else return true; } return false; };
  return { ok: true, ast, spans, inside };
}

// ── 2. bindings, calls and uses of the helper names, scope by scope ─────────────────────────────────────────────────────────
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
function eachKid(n, fn) {
  for (const k in n) {
    const v = n[k];
    if (!v || typeof v !== 'object' || k === 'loc') continue;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const x = v[i]; if (x && typeof x.type === 'string') fn(x); } } else if (typeof v.type === 'string') fn(v);
  }
}
function patternIds(p, out = []) {
  if (!p) return out;
  if (p.type === 'Identifier') out.push(p);
  else if (p.type === 'ObjectPattern') for (const pr of p.properties) patternIds(pr.type === 'RestElement' ? pr.argument : pr.value, out);
  else if (p.type === 'ArrayPattern') for (const e of p.elements) patternIds(e, out);
  else if (p.type === 'RestElement') patternIds(p.argument, out);
  else if (p.type === 'AssignmentPattern') patternIds(p.left, out);
  else if (p.type === 'ParenthesizedExpression') patternIds(p.expression, out);
  return out;
}
const unparen = (n) => { while (n && n.type === 'ParenthesizedExpression') n = n.expression; return n; };
// → { at: Map(identifier start → { id, fn, exported, expr, twice }), calls: [{ node, bind }], uses: [{ id, bind, how }],
//     dynamic: null | 'a direct eval' | 'a with statement' } for `names` only
// a function handed to one of these is SERIALISED INTO A PAGE (its text runs in the browser): a helper defined inside it would
// call a verdictOf the page does not have — left by rule (the coordinator's r1385)
export const PAGE_CALLS = new Set(['evaluate', 'evaluateHandle', '$eval', '$$eval', 'addInitScript', 'evaluateOnNewDocument', 'waitForFunction']);
export function bindingsOf(ast, names) {
  const at = new Map(), calls = [], uses = [], stack = [];
  let dynamic = null, pageDepth = 0;
  const open = () => { const S = new Map(); stack.push(S); return S; };
  const resolve = (name) => { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].has(name)) return stack[k].get(name); return null; };
  const def = (S, id, fn = null, exported = false, expr = false) => {
    const was = S.get(id.name);
    if (!was) S.set(id.name, id);
    if (!names.has(id.name)) return;
    const twice = !!was && was !== id;
    if (twice && at.has(was.start)) at.get(was.start).twice = true;
    at.set(id.start, { id, fn: fn && FN.has(fn.type) ? fn : null, exported: exported || !!(at.get(id.start) || {}).exported, expr, twice: twice || !!(at.get(id.start) || {}).twice, inPage: pageDepth > 0 || !!(at.get(id.start) || {}).inPage });
  };
  const use = (id, how) => { if (names.has(id.name)) uses.push({ id, bind: resolve(id.name), how }); };
  function hoistVars(n, S) {
    if (n.type === 'VariableDeclaration' && n.kind === 'var') for (const d of n.declarations) for (const id of patternIds(d.id)) def(S, id, unparen(d.init));
    eachKid(n, (c) => { if (!FN.has(c.type) && c.type !== 'ClassBody') hoistVars(c, S); });
  }
  function scanBlock(stmts, S) {
    for (const s0 of stmts) {
      const exported = s0.type === 'ExportNamedDeclaration' || s0.type === 'ExportDefaultDeclaration';
      const s = exported ? s0.declaration : s0;
      if (!s) continue;
      if (s.type === 'VariableDeclaration') { for (const d of s.declarations) for (const id of patternIds(d.id)) def(S, id, unparen(d.init), exported); }
      else if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id) def(S, s.id, s.type === 'FunctionDeclaration' ? s : null, exported);
      else if (s.type === 'ImportDeclaration') for (const sp of s.specifiers) def(S, sp.local);
    }
  }
  function pattern(p) {
    if (!p) return;
    if (p.type === 'AssignmentPattern') { pattern(p.left); walk(p.right); }
    else if (p.type === 'ObjectPattern') { for (const pr of p.properties) { if (pr.type === 'RestElement') pattern(pr.argument); else { if (pr.computed) walk(pr.key); pattern(pr.value); } } }
    else if (p.type === 'ArrayPattern') { for (const e of p.elements) pattern(e); }
    else if (p.type === 'RestElement') pattern(p.argument);
    else if (p.type === 'ParenthesizedExpression') pattern(p.expression);
    else if (p.type === 'MemberExpression') walk(p);
  }
  function walk(n) {
    const t = n.type;
    if (t === 'Program') { const S = open(); hoistVars(n, S); scanBlock(n.body, S); for (const c of n.body) walk(c); stack.pop(); return; }
    if (FN.has(t)) {
      const S = open();
      if (t === 'FunctionExpression' && n.id) def(S, n.id, n, false, true);
      for (const p of n.params) for (const id of patternIds(p)) def(S, id);
      for (const p of n.params) pattern(p);
      if (n.body.type === 'BlockStatement') { hoistVars(n.body, S); scanBlock(n.body.body, S); for (const c of n.body.body) walk(c); } else walk(n.body);
      stack.pop(); return;
    }
    if (t === 'BlockStatement' || t === 'StaticBlock') { const S = open(); if (t === 'StaticBlock') hoistVars(n, S); scanBlock(n.body, S); for (const c of n.body) walk(c); stack.pop(); return; }
    if (t === 'ForStatement' || t === 'ForInStatement' || t === 'ForOfStatement') {
      const S = open(), d = t === 'ForStatement' ? n.init : n.left;
      if (d && d.type === 'VariableDeclaration' && d.kind !== 'var') for (const x of d.declarations) for (const id of patternIds(x.id)) def(S, id, unparen(x.init));
      eachKid(n, walk);
      stack.pop(); return;
    }
    if (t === 'CatchClause') { const S = open(); if (n.param) { for (const id of patternIds(n.param)) def(S, id); pattern(n.param); } walk(n.body); stack.pop(); return; }
    if (t === 'SwitchStatement') { walk(n.discriminant); const S = open(); for (const c of n.cases) scanBlock(c.consequent, S); for (const c of n.cases) walk(c); stack.pop(); return; }
    if (t === 'ClassExpression' && n.id) { const S = open(); def(S, n.id); if (n.superClass) walk(n.superClass); walk(n.body); stack.pop(); return; }
    if (t === 'ClassDeclaration') { if (n.superClass) walk(n.superClass); walk(n.body); return; }
    if (t === 'VariableDeclaration') { for (const d of n.declarations) { pattern(d.id); if (d.init) walk(d.init); } return; }
    if (t === 'WithStatement') dynamic = dynamic || 'a with statement';
    if (t === 'CallExpression') {
      if (n.callee.type === 'Identifier') {
        if (n.callee.name === 'eval') dynamic = dynamic || 'a direct eval';
        if (names.has(n.callee.name)) calls.push({ node: n, bind: resolve(n.callee.name) });
      } else walk(n.callee);
      const page = n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.type === 'Identifier' && PAGE_CALLS.has(n.callee.property.name);
      for (const a of n.arguments) { if (page && FN.has(a.type)) { pageDepth++; walk(a); pageDepth--; } else walk(a); }
      return;
    }
    if (t === 'MemberExpression') { walk(n.object); if (n.computed) walk(n.property); return; }
    if (t === 'Property' || t === 'PropertyDefinition' || t === 'MethodDefinition') { if (n.computed) walk(n.key); if (n.value) walk(n.value); return; }
    if (t === 'AssignmentExpression') {
      if (n.left.type === 'Identifier') use(n.left, 'reassigned');
      else if (n.left.type === 'ObjectPattern' || n.left.type === 'ArrayPattern') { for (const id of patternIds(n.left)) use(id, 'reassigned'); pattern(n.left); } else walk(n.left);
      walk(n.right); return;
    }
    if (t === 'ExportNamedDeclaration') { if (n.declaration) walk(n.declaration); if (!n.source) for (const s of n.specifiers || []) if (s.local.type === 'Identifier') use(s.local, 'exported'); return; }
    if (t === 'ExportDefaultDeclaration') { if (n.declaration.type === 'Identifier') use(n.declaration, 'exported'); else walk(n.declaration); return; }
    if (t === 'LabeledStatement') { walk(n.body); return; }
    if (t === 'Identifier') { use(n, 'a value'); return; }
    if (t === 'ImportDeclaration' || t === 'ExportAllDeclaration' || t === 'BreakStatement' || t === 'ContinueStatement' || t === 'MetaProperty' || t === 'Literal' || t === 'TemplateElement' || t === 'PrivateIdentifier' || t === 'Super' || t === 'ThisExpression') return;
    eachKid(n, walk);
  }
  walk(ast);
  return { at, calls, uses, dynamic };
}

// ── how a helper's own body uses its condition (the body as found, before any guard) ───────────────────────────────────────
// A wrap keeps what a call passes only for a body that asks its condition TRUE OR FALSE: an if / while / for / ?: test, a
// `!`, an && / || in a test or a statement, Boolean(c). → { value: the first use that sees more (c === true, typeof c, c passed
// on, printed, stored, `c ?? x`), or null; hands: it hands its condition back (`return c`, an expression body that is c) }.
// A nested function that binds the same name is another variable; one that reads it is judged the same way (a return there is
// a value).
const isStmt = (c) => /(?:Statement|Declaration)$/.test(c.type) || c.type === 'StaticBlock';
export function condUse(fn, name, wrapped = null, coerce = VERDICT) {
  let value = null, hands = false, ownArgs = fn.type !== 'ArrowFunctionExpression';   // a function's own `arguments` reads its condition unseen
  const seen = (n, pos) => { if (pos === 'return') hands = true; else if (pos === 'value' && !value) value = n; };
  function expr(n, pos, nested) {
    if (!n) return;
    switch (n.type) {
      case 'Identifier': if (n.name === name) seen(n, pos === 'return' && nested ? 'value' : pos); else if (n.name === 'arguments' && ownArgs) seen(n, 'value'); return;
      case 'ParenthesizedExpression': return expr(n.expression, pos, nested);
      case 'UnaryExpression': return expr(n.argument, n.operator === '!' ? 'test' : n.operator === 'void' ? 'discard' : 'value', nested);
      case 'LogicalExpression': expr(n.left, n.operator !== '??' && (pos === 'test' || pos === 'discard') ? 'test' : 'value', nested); return expr(n.right, pos, nested);
      case 'ConditionalExpression': expr(n.test, 'test', nested); expr(n.consequent, pos, nested); return expr(n.alternate, pos, nested);
      case 'SequenceExpression': n.expressions.forEach((x, i) => expr(x, i === n.expressions.length - 1 ? pos : 'discard', nested)); return;
      case 'CallExpression':
        if (isCoercion(n, coerce)) return expr(n.arguments[0], 'test', nested);
        // the condition of a call the tool guards is read as true or false once wrapped (the same reading a second run makes)
        if (wrapped && n.arguments.some((a) => wrapped(n, a))) { expr(n.callee, 'value', nested); for (const a of n.arguments) expr(a, wrapped(n, a) ? 'test' : 'value', nested); return; }
        break;
      case 'FunctionExpression': case 'ArrowFunctionExpression': return fnBody(n, true);
      // a property's or a member's NAME is no use of a variable (`{ pass: !!pass }`, `x.pass`)
      case 'MemberExpression': expr(n.object, 'value', nested); if (n.computed) expr(n.property, 'value', nested); return;
      case 'Property': case 'PropertyDefinition': case 'MethodDefinition': if (n.computed) expr(n.key, 'value', nested); if (n.value) expr(n.value, 'value', nested); return;
      case 'MetaProperty': case 'PrivateIdentifier': return;
    }
    eachKid(n, (c) => (isStmt(c) ? stmt(c, nested) : expr(c, 'value', nested)));
  }
  function stmt(s, nested) {
    if (!s) return;
    switch (s.type) {
      case 'ExpressionStatement': return expr(s.expression, 'discard', nested);
      case 'IfStatement': expr(s.test, 'test', nested); stmt(s.consequent, nested); return stmt(s.alternate, nested);
      case 'WhileStatement': case 'DoWhileStatement': expr(s.test, 'test', nested); return stmt(s.body, nested);
      case 'ForStatement': if (s.init) { if (isStmt(s.init)) stmt(s.init, nested); else expr(s.init, 'discard', nested); } expr(s.test, 'test', nested); expr(s.update, 'discard', nested); return stmt(s.body, nested);
      case 'ReturnStatement': return expr(s.argument, nested ? 'value' : 'return', nested);
      case 'FunctionDeclaration': return fnBody(s, true);
      case 'LabeledStatement': return stmt(s.body, nested);
      case 'BreakStatement': case 'ContinueStatement': return;
    }
    eachKid(s, (c) => (isStmt(c) ? stmt(c, nested) : expr(c, 'value', nested)));
  }
  function fnBody(f, nested) {
    if (nested && (f.id && f.id.name === name || f.params.some((p) => patternIds(p).some((id) => id.name === name)))) return;
    const had = ownArgs;
    if (nested && f.type !== 'ArrowFunctionExpression') ownArgs = false;   // an inner function's `arguments` is its own
    for (const p of f.params) if (p.type === 'AssignmentPattern') expr(p.right, 'value', nested);
    if (f.body.type === 'BlockStatement') for (const s of f.body.body) stmt(s, nested); else expr(f.body, nested ? 'value' : 'return', nested);
    ownArgs = had;
  }
  fnBody(fn, false);
  return { value, hands };
}
// where a call's value goes: 'discard' (a statement), 'test' (read as true or false — under a `!`, an if, or as the condition
// of a call the tool guards: `wrapped`) or 'value'
export function parentsOf(ast) { const p = new Map(); const v = (n) => eachKid(n, (c) => { p.set(c, n); v(c); }); v(ast); return p; }
export function callPos(node, parent, wrapped = null, coerce = VERDICT) {
  let n = node;
  for (;;) {
    const p = parent.get(n);
    if (!p) return 'value';
    switch (p.type) {
      case 'ParenthesizedExpression': case 'AwaitExpression': n = p; continue;
      case 'ExpressionStatement': return 'discard';
      case 'UnaryExpression': return p.operator === '!' ? 'test' : p.operator === 'void' ? 'discard' : 'value';
      case 'IfStatement': case 'WhileStatement': case 'DoWhileStatement': return p.test === n ? 'test' : 'value';
      case 'ForStatement': return p.test === n ? 'test' : p.update === n || p.init === n ? 'discard' : 'value';
      case 'ConditionalExpression': if (p.test === n) return 'test'; n = p; continue;
      case 'SequenceExpression': if (p.expressions[p.expressions.length - 1] !== n) return 'discard'; n = p; continue;
      case 'LogicalExpression': { if (p.operator === '??') return 'value'; const up = callPos(p, parent, wrapped, coerce); return up === 'test' ? 'test' : up === 'discard' ? (p.left === n ? 'test' : 'discard') : 'value'; }
      case 'CallExpression': return isCoercion(p, coerce) || (wrapped && wrapped(p, n)) ? 'test' : 'value';
      default: return 'value';
    }
  }
}

// ── 3. the condition's shape, by its operator (never by a name or a method: those are wrapped) ─────────────────────────────
// THE WRAP (the coordinator's r1347): scripts/lib/check.mjs verdictOf — the GUARDED coercion, never a plain `!!( … )`: a
// thenable or a function handed as a verdict fails red by name, any other value coerces as !!value. Its import goes on the
// file's last code line (an import is hoisted: no line moves); `Boolean(x)` and `verdictOf(x)` are booleans by their call.
// A file that binds its own `verdictOf` imports it as VERDICT_ALIAS; only the name a file imports from the shared checker (or
// `Boolean`) is a coercion there — never a person's own function of that name.
export const VERDICT = 'verdictOf', VERDICT_ALIAS = 'verdictOfGuard';
// THE GATE (the coordinator's r3179): an && operand that is NOT the last only decides whether the chain goes on — a present function
// there is an existence check (`f && f(1) === 1`), never the verdict — so it is coerced by check.mjs gateOf (true / false by
// truthiness, never a red; a promise there is COUNTED and said once per call site, at the moment, on stderr), not by verdictOf.
// Its name is chosen free on its own (planFile, r3293 (3)): gateOf, else gateOfGuard — whatever the verdict's is.
export const GATE = 'gateOf', GATE_ALIAS = 'gateOfGuard';
export const gateName = (name = VERDICT) => (name === VERDICT_ALIAS ? GATE_ALIAS : GATE);   // (the string form's twin only: planFile picks each name free, r3293)
// r3293 (2): a coercion is known by the FILE's own pair of names — { v, g }, the local names its import from the shared checker
// binds (or this run will bind) — never by a spelling alone: a file's own function named gateOf is no coercion
const coercionNames = (name) => (name && typeof name === 'object' ? [name.v, name.g] : [name, gateName(name)]).filter(Boolean);
const isCoercion = (n, name = VERDICT) => !!n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && (n.callee.name === 'Boolean' || coercionNames(name).includes(n.callee.name)) && n.arguments.length === 1 && n.arguments[0].type !== 'SpreadElement';
// the import of exactly the names a file's wraps use (a verdict, a gate, or both)
export const importText = (file = '', after = '', name = VERDICT, { verdict = true, gate = false } = {}) => {
  const v = name && typeof name === 'object' ? name.v : name, g = name && typeof name === 'object' ? name.g : gateName(name);
  const spec = [...(verdict ? [v === VERDICT ? VERDICT : `${VERDICT} as ${v}`] : []), ...(gate ? [g === GATE ? GATE : `${GATE} as ${g}`] : [])];
  return `${after === ';' ? ' ' : ';'}import { ${spec.join(', ')} } from '${String(file).startsWith('lib/') ? './check.mjs' : './lib/check.mjs'}';`;
};
// every name the file BINDS anywhere (declarations, parameters, imports, catch parameters, class / function names), with HOW
// MANY TIMES (r3293 (3), the reader's find): an import and a nested `const gateOf = …` are two bindings — the name is not the
// import's alone, so a wrap written in that block would call the block's function
export function declaredCounts(ast) {
  const out = new Map(), add = (name) => out.set(name, (out.get(name) || 0) + 1);
  const visit = (n) => {
    const t = n.type;
    if (t === 'VariableDeclarator') for (const id of patternIds(n.id)) add(id.name);
    else if (FN.has(t)) { if (n.id) add(n.id.name); for (const p of n.params) for (const id of patternIds(p)) add(id.name); }
    else if ((t === 'ClassDeclaration' || t === 'ClassExpression') && n.id) add(n.id.name);
    else if (t === 'CatchClause' && n.param) for (const id of patternIds(n.param)) add(id.name);
    else if (t === 'ImportSpecifier' || t === 'ImportDefaultSpecifier' || t === 'ImportNamespaceSpecifier') add(n.local.name);
    eachKid(n, visit);
  };
  visit(ast);
  return out;
}
export const declaredNames = (ast) => new Set(declaredCounts(ast).keys());
// the shared checker's coercion this file imports already (an earlier run's), as { local } — or null
export function ourImport(ast) {
  let local = null, gate = null;
  for (const n of ast.body) if (n.type === 'ImportDeclaration' && /(?:^|\/)check\.mjs$/.test(String(n.source.value))) for (const x of n.specifiers) if (x.type === 'ImportSpecifier') { if (x.imported.name === VERDICT && !local) local = x.local.name; if (x.imported.name === GATE && !gate) gate = x.local.name; }
  return local || gate ? { local, gate } : null;
}
const CMP = new Set(['==', '!=', '===', '!==', '<', '<=', '>', '>=', 'instanceof', 'in']);
export function boolByNode(n, name = VERDICT) {
  switch (n && n.type) {
    case 'Literal': return typeof n.value === 'boolean';
    case 'UnaryExpression': return n.operator === '!' || n.operator === 'delete';
    case 'BinaryExpression': return CMP.has(n.operator);
    case 'LogicalExpression': return n.operator !== '??' && boolByNode(n.left, name) && boolByNode(n.right, name);
    case 'ConditionalExpression': return boolByNode(n.consequent, name) && boolByNode(n.alternate, name);
    case 'ParenthesizedExpression': return boolByNode(n.expression, name);
    case 'SequenceExpression': return boolByNode(n.expressions[n.expressions.length - 1], name);
    case 'CallExpression': return isCoercion(n, name);
    default: return false;
  }
}
// a condition shaped as a string: a name where the condition goes
export function stringByNode(n) {
  switch (n && n.type) {
    case 'Literal': return typeof n.value === 'string';
    case 'TemplateLiteral': return true;
    case 'BinaryExpression': return n.operator === '+' && (stringByNode(n.left) || stringByNode(n.right));
    case 'ConditionalExpression': return stringByNode(n.consequent) && stringByNode(n.alternate);
    case 'ParenthesizedExpression': return stringByNode(n.expression);
    default: return false;
  }
}
// where the coercion goes so that a condition is a boolean by its operator, as true or as false as it was: around each operand of
// an && / || chain and each branch of a ?: that is not one — so a comparison never stands under a call (the wall-clock census reads
// a bound through it, the anchor census a check of its anchor), and the wrap is the smallest. EACH WRAP HAS A ROLE (r3179): an
// operand that can BECOME the verdict — the last of an && chain, every operand of an ||, each branch of a ?: — is a 'verdict'
// (verdictOf: a function or a promise there FAILS); an && operand that is not the last is a 'gate' (gateOf: by truthiness only),
// and so is every operand inside it. → [[start, end, role]]
export function wrapsOf(n, name = VERDICT, role = 'verdict') {
  if (boolByNode(n, name)) return [];
  // a comma expression is wrapped WITH its parentheses: `verdictOf(a, b)` would be two arguments
  if (n.type === 'ParenthesizedExpression') return n.expression.type === 'SequenceExpression' ? [[n.start, n.end, role]] : wrapsOf(n.expression, name, role);
  if (n.type === 'LogicalExpression' && n.operator === '&&') return [...wrapsOf(n.left, name, 'gate'), ...wrapsOf(n.right, name, role)];
  if (n.type === 'LogicalExpression' && n.operator === '||') return [...wrapsOf(n.left, name, role), ...wrapsOf(n.right, name, role)];
  if (n.type === 'ConditionalExpression') return [...wrapsOf(n.consequent, name, role), ...wrapsOf(n.alternate, name, role)];
  return [[n.start, n.end, role]];
}
export function guardText(name, condP) {
  return `if (typeof ${condP} !== 'boolean') throw new TypeError(\`${name}: its condition is a \${typeof ${condP}}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs\`);`;
}

// ── one file: what the tool would do (PURE over its text; C = scripts/lib/check.mjs, acorn injected) ──────────────────────
// Every edit is an INSERTION ({ at, len: 0, text, kind, pair }): a guard, an expression block's two ends, a wrap's two ends —
// so a wrap inside another call's condition composes, and nothing is ever replaced.
// → { skipped, code, edits, guards: [{ name, at, line, order, shape, condP }], plants: [{ name, line }], left: [{ name, line, kind, why }],
//     calls: { all, wrapped, boolean }, wraps: [{ line, name, cond, pieces }], checks: [the read-back of each wrapped call] }
export function planFile(src, { C, acorn, file = '' }) {
  const res = { skipped: null, code: null, edits: [], guards: [], plants: [], left: [], calls: { all: 0, wrapped: 0, boolean: 0 }, wraps: [], checks: [] };
  const judged = C.helperDefs(src).filter((d) => d.order !== 'unknown' && !d.guarded);
  if (!judged.length) return res;
  const code = readCode(src, acorn);
  if (!code.ok) { res.skipped = code.why; return res; }
  res.code = code;
  const inCode = [];
  for (const d of judged) if (code.inside(d.at)) res.plants.push({ name: d.name, line: d.line }); else inCode.push(d);
  if (!inCode.length) return res;
  let B;
  try { B = bindingsOf(code.ast, new Set(inCode.map((d) => d.name))); } catch (e) { res.skipped = `the scope walk stopped (${String(e.message).slice(0, 60)})`; return res; }
  const text = (n) => src.slice(n.start, n.end), lineAt = lineIndex(src), left = new Map();
  // THE FILE'S COERCION NAME: the one an earlier run imported, else verdictOf, else (the file binds its own) the alias
  const ours = ourImport(code.ast), counts = declaredCounts(code.ast);
  // r3293 (3): EACH name by the free-name rule — free when the file binds it not at all, or ONLY by its own import of THAT very
  // function from the shared checker (an earlier run's): one binding in the whole file, and it is that import. A name the file
  // imports as the OTHER function (`import { gateOf as verdictOf }`), or binds again in any scope (a block's own `const gateOf`),
  // is not free. The verdict's: verdictOf else verdictOfGuard; the gate's: gateOf else gateOfGuard — so a later run never
  // imports a name over a function of the file's own; an earlier import whose name is bound again leaves the helpers by name
  const free = (n, own) => (counts.get(n) || 0) === (n === own ? 1 : 0);
  const pick = (own, plain, alias) => (own ? (free(own, own) ? own : null) : free(plain) ? plain : free(alias) ? alias : null);
  const coerce = pick(ours && ours.local, VERDICT, VERDICT_ALIAS);
  const gate = pick(ours && ours.gate, GATE, GATE_ALIAS);
  const NM = { v: coerce, g: gate };
  res.coerce = coerce; res.gate = gate;
  let parent = null;
  const parents = () => parent || (parent = parentsOf(code.ast));
  let targets = [];
  for (const d of inCode) {
    const b = B.at.get(d.at), slot = d.order === 'cond-first' ? 0 : 1, nameSlot = 1 - slot;
    const leave = (kind, where = '') => left.set(d, [kind, where]);
    if (B.dynamic) { leave(`the file holds ${B.dynamic}: a call can reach the helper unseen`); continue; }
    if (!coerce) { leave(ours && ours.local ? `the file binds ${ours.local} again beside its import of the shared checker's ${VERDICT}: a wrap there could call another function` : `the file binds both ${VERDICT} and ${VERDICT_ALIAS}: no name is free for the coercion`); continue; }
    if (!gate) { leave(ours && ours.gate ? `the file binds ${ours.gate} again beside its import of the shared checker's ${GATE}: a wrap there could call another function` : `the file binds both ${GATE} and ${GATE_ALIAS}: no name is free for the gate`); continue; }
    if (!b || !b.fn) { leave('the census reads a helper where the parser binds no function'); continue; }
    if (b.expr) { leave('a named function expression: its calls go through another binding'); continue; }
    if (b.twice) { leave('its name is declared twice in one scope'); continue; }
    if (b.inPage) { leave('its body is inside a function serialised into a page (page.evaluate and the like): the page has no verdictOf'); continue; }
    const p = b.fn.params[slot];
    if (!p || p.type !== 'Identifier' || p.name !== d.params[slot]) { leave('its condition parameter is destructured, defaulted or a rest'); continue; }
    if (b.exported) { leave('exported: its calls live in other files'); continue; }
    const handed = B.uses.find((u) => u.bind === b.id);
    if (handed) { leave('handed on as a value — passed, stored, reassigned or exported by name; its calls happen where the tool does not wrap', ` (${handed.how}, line ${lineAt(handed.id.start)})`); continue; }
    const mine = B.calls.filter((c) => c.bind === b.id);
    const bad = mine.find((c) => c.node.arguments.length <= slot || c.node.arguments.some((a) => a.type === 'SpreadElement'));
    if (bad) { leave('a call with no condition argument, or by spread', ` (line ${lineAt(bad.node.start)})`); continue; }
    const swap = mine.find((c) => stringByNode(c.node.arguments[slot]));
    if (swap) { leave('a call hands it a string where the condition goes — the swap the guard exists for: cure the call first', ` (line ${lineAt(swap.node.start)})`); continue; }
    const named = mine.find((c) => c.node.arguments[nameSlot] && boolByNode(c.node.arguments[nameSlot], NM) && !boolByNode(c.node.arguments[slot], NM));
    if (named) { leave('a call holds a condition in its NAME slot — a swap: cure the call first', ` (line ${lineAt(named.node.start)})`); continue; }
    targets.push({ d, b, slot, nameSlot, p, mine });
  }
  // THE BODY RULES, against the set the tool guards (a fixpoint: leaving one helper can only leave more). A body must ask its
  // condition true or false, and a helper that hands its condition back may be called only where the value is read as true
  // or false. The condition of a call the tool guards counts as read so, since its wrap makes it so: a second run then reads
  // exactly what this run decided (run twice = run once).
  const callBind = new Map(B.calls.map((c) => [c.node, c.bind]));
  for (let round = 0; round < 64 && targets.length; round++) {
    const slots = new Map(targets.map((t) => [t.b.id, t.slot]));
    const wrapped = (call, arg) => { const s = slots.get(callBind.get(call)); return s !== undefined && call.arguments[s] === arg; };
    const out = new Map();
    for (const t of targets) {
      const u = condUse(t.b.fn, t.p.name, wrapped, NM);
      if (u.value) { out.set(t, ['it uses its condition as more than true or false — a wrap would change what it sees', ` (line ${lineAt(u.value.start)})`]); continue; }
      if (u.hands) { const read = t.mine.find((c) => callPos(c.node, parents(), wrapped, NM) === 'value'); if (read) out.set(t, ['it hands its condition back, and a call reads the value', ` (line ${lineAt(read.node.start)})`]); }
    }
    // a wrap may not land in a NAME argument (a call of a guarded helper inside another call's name): both helpers are left
    if (!out.size) {
      const names = [];
      for (const t of targets) for (const c of t.mine) { const a = c.node.arguments[t.nameSlot]; if (a) names.push([a.start, a.end, t, c]); }
      if (names.length) {
        const depth = new Int32Array(src.length + 1);
        for (const [s, e] of names) { depth[s]++; depth[e]--; }
        for (let k = 1; k <= src.length; k++) depth[k] += depth[k - 1];
        for (const t of targets) for (const c of t.mine) for (const [s] of wrapsOf(c.node.arguments[t.slot], NM)) if (depth[s] > 0) {
          const outer = names.find(([ns, ne]) => s >= ns && s < ne), why = ["a call of it stands inside another call's NAME argument, or holds one there", ''];
          if (!out.has(t)) out.set(t, [why[0], ` (line ${lineAt(c.node.start)})`]);
          if (outer && !out.has(outer[2])) out.set(outer[2], [why[0], ` (line ${lineAt(outer[3].node.start)})`]);
        }
      }
    }
    if (!out.size) break;
    for (const [t, w] of out) left.set(t.d, w);
    targets = targets.filter((t) => !out.has(t));
  }
  for (const t of targets) {
    const { d, b, p, slot, nameSlot } = t, guard = guardText(d.name, p.name), body = b.fn.body;
    let shape;
    if (body.type === 'BlockStatement') {
      if (src[body.start] !== '{') { left.set(d, ['its body does not open where the parser says', '']); continue; }
      shape = b.fn.type === 'ArrowFunctionExpression' ? 'arrow-block' : 'function';
      res.edits.push({ at: body.start + 1, len: 0, text: ` ${guard}`, kind: 'guard' });
    } else {
      shape = 'arrow-expression';
      res.edits.push({ at: body.start, len: 0, text: `{ ${guard} return (`, kind: 'block-open', pair: body.end });
      res.edits.push({ at: body.end, len: 0, text: '); }', kind: 'block-close', pair: body.start });
    }
    res.guards.push({ name: d.name, at: d.at, line: d.line, order: d.order, shape, condP: p.name });
    for (const c of t.mine) {
      res.calls.all++;
      const a = c.node.arguments, cond = a[slot], ws = wrapsOf(cond, NM);
      if (!ws.length) { res.calls.boolean++; continue; }
      for (const [s, e, role] of ws) { res.edits.push({ at: s, len: 0, text: `${role === 'gate' ? gate : coerce}(`, kind: 'wrap-open', pair: e, role }); res.edits.push({ at: e, len: 0, text: ')', kind: 'wrap-close', pair: s, role }); }
      const nameArg = a[nameSlot] || null;
      res.checks.push({ callee: c.node.callee.start, slot, nameSlot, condStart: cond.start, condEnd: cond.end, cond: text(cond), name: nameArg ? text(nameArg) : null, nameStart: nameArg ? nameArg.start : -1, nameEnd: nameArg ? nameArg.end : -1 });
      res.calls.wrapped++;
      res.wraps.push({ line: lineAt(c.node.start), name: d.name, cond: text(cond).replace(/\s+/g, ' ').slice(0, 80), pieces: ws.length, gates: ws.filter((w) => w[2] === 'gate').length });
    }
  }
  // the coercion's import, once, on the file's last code line (hoisted: no line moves) — or the one an earlier run put there
  // (r3179: exactly the names its wraps use — a verdict, a gate, or both — and only the ones an earlier run did not import)
  const needV = res.edits.some((e) => e.kind === 'wrap-open' && e.role !== 'gate') && !(ours && ours.local);
  const needG = res.edits.some((e) => e.kind === 'wrap-open' && e.role === 'gate') && !(ours && ours.gate);
  if ((needV || needG) && code.ast.body.length) {
    const end = code.ast.body[code.ast.body.length - 1].end;
    res.edits.push({ at: end, len: 0, text: importText(file, src[end - 1], NM, { verdict: needV, gate: needG }), kind: 'import' });
    res.imported = { verdict: needV ? coerce : null, gate: needG ? gate : null };   // what THIS run imports, under which names
  }
  for (const [d, [kind, where]] of left) res.left.push({ name: d.name, line: d.line, kind, why: kind + where });
  res.left.sort((x, y) => x.line - y.line);
  return res;
}

// ── applying, and the tool's own proof ──────────────────────────────────────────────────────────────────────────────────────
// the order of insertions at one point: what closes there first (the inner first), then what opens (the outer first), and
// the coercion's import last of all (after a statement that ends with an expression body's own close)
const OPENS = new Set(['guard', 'block-open', 'wrap-open']), FAR = 1e15;
const rank = (e) => (e.kind === 'import' ? 2 : OPENS.has(e.kind) ? 1 : 0);
export const insertionOrder = (a, b) => a.at - b.at || rank(a) - rank(b) || (b.pair ?? FAR) - (a.pair ?? FAR);
export function applyEdits(src, edits) {
  const es = [...edits].sort(insertionOrder), parts = [];
  let k = 0;
  for (const e of es) { parts.push(src.slice(k, e.at), e.text); k = Math.max(k, e.at + (e.len || 0)); }
  parts.push(src.slice(k));
  return parts.join('');
}
// → { ok, why: [], notes: [] } over the text as WRITTEN (a plan that lies is caught here, not trusted). W = the wall-clock
// census (scripts/wall-clock-census.mjs), when the tree has it: a file whose wrapped conditions hold a `<` / `>` must read the
// same to it after the edit (its in-file clock spans; the product's span fields are not handed here).
export function selfCheck(src, out, plan, { C, acorn, W = null }) {
  const why = [], notes = [], es = [...plan.edits].sort(insertionOrder), L = lineIndex(src);
  const nl = (s) => s.split('\n').length;
  if (nl(out) !== nl(src)) why.push(`the line count moved (${nl(src)} → ${nl(out)})`);
  if (es.some((e) => e.len)) why.push('an edit replaces text: the tool only inserts');
  if (applyEdits(src, es) !== out) why.push('the text written is not the plan applied');
  const code = plan.code || readCode(src, acorn);
  if (code.ok) for (const e of es) if (code.inside(e.at)) why.push(`an edit inside a string, a template's text, a regex or a comment at line ${L(e.at)}`);
  const back = readCode(out, acorn, { spans: false });
  if (!back.ok) { why.push(`the edited file does not parse: ${back.why}`); return { ok: false, why, notes }; }
  // a node's start in `out`: every insertion before it and AT it stands before it
  const ats = es.map((e) => e.at), grow = [0];
  for (const e of es) grow.push(grow[grow.length - 1] + e.text.length);
  const upTo = (i) => { let lo = 0, hi = ats.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ats[m] <= i) lo = m + 1; else hi = m; } return lo; };
  const from = (i) => { let lo = 0, hi = ats.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ats[m] < i) lo = m + 1; else hi = m; } return lo; };
  const mapStart = (i) => i + grow[upTo(i)];
  // a source range as it reads after the insertions that belong to it (its own wraps, an inner call's wraps)
  const within = (s, e) => { const mine = es.slice(from(s), upTo(e)).filter((x) => (x.pair === undefined ? x.at > s && x.at < e : x.pair >= s && x.pair <= e)); return applyEdits(src.slice(s, e), mine.map((x) => ({ ...x, at: x.at - s, pair: x.pair === undefined ? undefined : x.pair - s }))); };
  const calls = new Map();
  const visit = (n) => { if (n.type === 'CallExpression' && n.callee.type === 'Identifier') calls.set(n.callee.start, n); eachKid(n, visit); };
  visit(back.ast);
  for (const k of plan.checks || []) {
    if (C.wholeLiteral(k.cond)) why.push(`a whole string literal was wrapped at line ${L(k.condStart)}: ${k.cond.slice(0, 60)}`);
    const c = calls.get(mapStart(k.callee)), a = c ? c.arguments : [];
    if (!c) { why.push(`a wrapped call does not read back at line ${L(k.callee)}`); continue; }
    const got = (j) => (j < a.length ? out.slice(a[j].start, a[j].end) : null);
    if (got(k.slot) !== within(k.condStart, k.condEnd)) why.push(`a condition did not read back as planned at line ${L(k.condStart)}: ${String(got(k.slot)).slice(0, 60)}`);
    else if (!boolByNode(a[k.slot], { v: plan.coerce || VERDICT, g: plan.gate || GATE })) why.push(`a condition is still no boolean by its operator at line ${L(k.condStart)}`);
    if (k.nameStart >= 0 && upTo(k.nameEnd) > from(k.nameStart)) why.push(`an edit inside a NAME argument at line ${L(k.nameStart)}`);
    if (got(k.nameSlot) !== k.name) why.push(`a NAME argument changed at line ${L(k.callee)}: «${String(k.name).slice(0, 50)}» → «${String(got(k.nameSlot)).slice(0, 50)}»`);
  }
  // the census after it: every guarded helper read as guarded with its order — or, said by name, a guarded helper whose order
  // the census no longer reads (a body that opens `c ? …`: the guard now stands between `{` and its test; its calls are the
  // runtime guard's to judge, and the census counts it neither way); every other helper read as before
  const before = C.helperDefs(src), after = C.helperDefs(out), guarded = new Set(plan.guards.map((g) => g.at));
  if (after.length !== before.length) why.push(`the census reads ${after.length} helpers, ${before.length} before`);
  else before.forEach((d, k) => {
    const x = after[k];
    if (x.name !== d.name) why.push(`the census reads ${d.name} at line ${d.line} as ${x.name}`);
    else if (guarded.has(d.at) && x.order === 'unknown' && /typeof\s+\w+\s*!==\s*'boolean'\)\s*throw new TypeError/.test(out.slice(mapStart(d.at), mapStart(d.at) + 400))) notes.push(`the census no longer reads the order of ${d.name} at line ${d.line} once guarded (its body opens with its test): its runtime guard judges every call`);
    else if (x.order !== d.order) why.push(`the census reads ${d.name} at line ${d.line} as ${x.order}, ${d.order} before`);
    else if (guarded.has(d.at) ? !x.guarded : x.guarded !== d.guarded) why.push(`the census reads ${d.name} at line ${d.line} as ${x.guarded ? '' : 'un'}guarded`);
  });
  if (C.swappedCalls(out, after).length > C.swappedCalls(src, before).length) why.push('the census reads a swapped call the file did not hold');
  if (es.some((e) => e.kind === 'wrap-open' && e.role === 'gate') && ((ourImport(back.ast) || {}).gate || null) !== (plan.gate || GATE)) why.push(`a gated file does not import the shared checker's ${GATE}${(plan.gate || GATE) !== GATE ? ' as ' + plan.gate : ''}`);
  if (es.some((e) => e.kind === 'wrap-open' && e.role !== 'gate') && ((ourImport(back.ast) || {}).local || null) !== (plan.coerce || VERDICT)) why.push(`a wrapped file does not import the shared checker's ${VERDICT}${plan.coerce && plan.coerce !== VERDICT ? ' as ' + plan.coerce : ''}`);
  // (only where a wrap holds a comparison: a top-level one stays outside every wrap by wrapsOf)
  const cmp = (t) => /[<>]/.test(t.replace(/=>/g, ''));
  if (W && es.some((e) => e.kind === 'wrap-open' && cmp(src.slice(e.at, e.pair)))) {
    const read = (t) => JSON.stringify(W.wallClockFindings(t, { fields: W.productSpanFields ? W.productSpanFields(t) : [] }).map((f) => [f.line, f.kind, f.boundMs]));   // the gate's own ratchet reads with the product's span fields
    const was = read(src), now = read(out);
    if (was !== now) why.push(`the wall-clock census reads it otherwise after the edit (${was.slice(0, 60)} → ${now.slice(0, 60)})`);
  }
  return { ok: why.length === 0, why, notes };
}

// ── the one-way list after the run: a row only falls (never added, never raised) ────────────────────────────────────────────
export function lowerList(listed, counts) {
  const files = {};
  for (const [f, n] of Object.entries(listed)) { const now = Math.min(n, counts[f] || 0); if (now > 0) files[f] = now; }
  return files;
}

// ── the run over a tree ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const LIST_FILE = path.join('scripts', 'fixtures', 'unguarded-helpers.json');
// THE WRITES ARE ALL OR NOTHING ON DISK TOO (the round's should): every file is first written whole to a temp beside it; only
// when every temp stands are they renamed into place, the list last. A failed temp write removes every temp: nothing changed.
// A failed rename (after the first) is said with the one restore step: `git checkout -- scripts` (the tree is a git checkout).
// `io` is the test's seam (a planted failure); the tool itself uses fs.
// THE TREE MUST BE CLEAN (the coordinator's r1385): --apply refuses by name while scripts/ holds an uncommitted change (git status
// --porcelain -- scripts; a tree git cannot read refuses too), so a restore never touches another edit.
export function gitDirty(repo) {
  try { return execFileSync('git', ['-C', repo, 'status', '--porcelain', '--', 'scripts'], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').filter(Boolean).map((l) => l.slice(3)); }
  catch (e) { return [`(git cannot read this tree: ${String(e.message).split('\n')[0].slice(0, 80)})`]; }
}
export async function runTree(repo, { apply = false, list = false, log = (l) => console.log(l), io = {} } = {}) {
  io = { writeFile: (p, t) => fs.writeFileSync(p, t), rename: (a, b) => fs.renameSync(a, b), unlink: (p) => fs.unlinkSync(p), dirty: gitDirty, ...io };
  const C = await import(pathToFileURL(path.join(repo, 'scripts', 'lib', 'check.mjs')).href);
  const acorn = createRequire(path.join(repo, 'package.json'))('acorn');
  const wcc = path.join(repo, 'scripts', 'wall-clock-census.mjs'), W = fs.existsSync(wcc) ? await import(pathToFileURL(wcc).href) : null;
  const dir = path.join(repo, 'scripts');
  // the file set §7b reads (scripts/*.mjs and scripts/lib/*.mjs) — scripts/lib/check.mjs read and counted, never a target
  const files = [...fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')), ...fs.readdirSync(path.join(dir, 'lib')).filter((f) => f.endsWith('.mjs')).map((f) => 'lib/' + f)].sort();
  const T = { files: files.length, edited: 0, guards: 0, unread: [], pieces: 0, gates: 0, aliased: [], gateAliased: [], byShape: {}, left: {}, plants: 0, plantFiles: 0, calls: { all: 0, wrapped: 0, boolean: 0 }, skipped: [], failed: [], writes: [], before: 0, after: 0, second: { guards: 0, wraps: 0, files: [] } };
  const counts = {}, unguarded = (s) => C.helperDefs(s).filter((d) => d.order !== 'unknown' && !d.guarded).length;
  for (const f of files) {
    const p = path.join(dir, f), src = fs.readFileSync(p, 'utf8');
    const plan = f === 'lib/check.mjs' ? planFile('', { C, acorn }) : planFile(src, { C, acorn, file: f });
    let now = src;
    if (f !== 'test-ci-gate-tiers.mjs') T.before += unguarded(src);
    if (plan.skipped) T.skipped.push(`${f}: ${plan.skipped}`);
    if (plan.plants.length) { T.plants += plan.plants.length; T.plantFiles++; if (list) for (const x of plan.plants) log(`    plant  ${f} line ${x.line} ${x.name} — in a string, a template's text, a regex or a comment: not code`); }
    for (const x of plan.left) { T.left[x.kind] = (T.left[x.kind] || 0) + 1; if (list) log(`    LEFT   ${f} line ${x.line} ${x.name} — ${x.why}`); }
    if (plan.edits.length) {
      const out = applyEdits(src, plan.edits), chk = selfCheck(src, out, plan, { C, acorn, W });
      if (!chk.ok) T.failed.push(`${f}: ${chk.why.slice(0, 3).join('; ')}`);
      else {
        T.edited++; T.guards += plan.guards.length;
        for (const x of chk.notes) { T.unread.push(`${f}: ${x}`); if (list) log(`    UNREAD ${f} — ${x}`); }
        for (const g of plan.guards) T.byShape[g.shape] = (T.byShape[g.shape] || 0) + 1;
        for (const k of Object.keys(T.calls)) T.calls[k] += plan.calls[k];
        for (const w of plan.wraps) { T.pieces += w.pieces; T.gates += w.gates || 0; }
        if (plan.imported && plan.imported.verdict && plan.imported.verdict !== VERDICT) T.aliased.push(f);
        if (plan.imported && plan.imported.gate && plan.imported.gate !== GATE) T.gateAliased.push(f);
        if (list) { for (const g of plan.guards) log(`    guard  ${f} line ${g.line} ${g.name} (${g.order}, ${g.shape})`); for (const w of plan.wraps) log(`    wrap   ${f} line ${w.line} ${w.name}(${w.cond} …) — ${VERDICT}( … ) around ${w.pieces} operand(s)`); }
        if (apply) T.writes.push([p, out, src]);
        now = out;
        // RUN TWICE = RUN ONCE, over the very text it would write: a second run plans nothing
        const again = planFile(out, { C, acorn, file: f });
        if (again.guards.length || again.wraps.length) { T.second.guards += again.guards.length; T.second.wraps += again.wraps.length; T.second.files.push(f); }
      }
    }
    if (f !== 'test-ci-gate-tiers.mjs') { const n = unguarded(now); T.after += n; if (n) counts[f] = n; }
  }
  const listPath = path.join(repo, LIST_FILE), listJson = JSON.parse(fs.readFileSync(listPath, 'utf8')), listed = listJson.files || {};
  const lowered = lowerList(listed, counts), sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const listMoves = JSON.stringify(lowered) !== JSON.stringify(listed);
  let writes = apply && !T.failed.length && !T.second.files.length, ioFault = null, dirty = [];
  if (writes) { dirty = io.dirty(repo); if (dirty.length) writes = false; }
  if (writes) {
    // every file whole to a temp first (the originals held in memory); only when every temp stands are they renamed in
    const all = [...T.writes, ...(listMoves ? [[listPath, JSON.stringify({ ...listJson, files: lowered }, null, 1) + '\n', fs.readFileSync(listPath, 'utf8')]] : [])], made = [];
    try { for (const [p, out] of all) { io.writeFile(p + '.guard-tmp', out); made.push(p); } } catch (e) {
      for (const p of [...made, (all[made.length] || [])[0]].filter(Boolean)) { try { io.unlink(p + '.guard-tmp'); } catch { } }   // the failing file's partial temp too
      writes = false; ioFault = `a temp could not be written (${e.code || e.message}) at ${path.relative(repo, (all[made.length] || [''])[0])}: every temp removed, NOTHING CHANGED`;
    }
    if (writes) {
      let k = 0;
      try { for (; k < made.length; k++) io.rename(made[k] + '.guard-tmp', made[k]); } catch (e) {
        writes = false;
        // the tool holds every original: it puts back the k files it renamed itself, then removes the temps left
        const back = [], stuck = [];
        for (let j = 0; j < k; j++) { try { io.writeFile(made[j], all[j][2]); back.push(made[j]); } catch { stuck.push(path.relative(repo, made[j])); } }
        for (let j = k; j < made.length; j++) { try { io.unlink(made[j] + '.guard-tmp'); } catch { } }
        ioFault = `a rename failed (${e.code || e.message}) after ${k} of ${made.length} files: ${back.length} put back from the originals it held, every temp removed${stuck.length ? ` — NOT put back: ${stuck.join(' ')} (restore them with: git checkout -- ${stuck.join(' ')})` : ' — NOTHING CHANGED'}`;
      }
    }
  }
  const n = (o) => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'none';
  log(`guard-inline-helpers — ${apply ? (writes ? 'APPLIED' : ioFault ? `APPLY FAILED: ${ioFault}` : dirty.length ? `APPLY REFUSED: scripts/ holds uncommitted changes (${dirty.slice(0, 6).join(' ')}${dirty.length > 6 ? ' …' : ''}) — commit them or set them aside first; nothing written` : 'APPLY REFUSED (a self-check or the second run failed; nothing written)') : 'DRY RUN (nothing written)'} over ${T.files} scripts of ${repo}`);
  log(T.edited ? `  it guards ${T.guards} helpers in ${T.edited} files — by shape: ${n(T.byShape)}` : '  NOTHING TO DO: every helper the census judges in code is guarded or left by rule (an applied tip, or nothing new since)');
  log(`  the census (test-ci-gate-tiers §7b, that file aside) reads ${T.before} unguarded helpers before, ${T.after} after`);
  log(`  guarded, but its order no longer read by the census (counted neither way): ${T.unread.length}${T.unread.length ? ' — ' + T.unread.slice(0, 4).map((x) => x.replace(/ once guarded.*$/, '')).join(' | ') : ''}`);
  log(`  their calls: ${T.calls.all} — wrapped ${VERDICT}( … ) in place ${T.calls.wrapped} (around ${T.pieces} operands: ${T.pieces - T.gates} that can become the verdict through ${VERDICT} — a promise or a function there now FAILS, red by name; any other value as !! would — and ${T.gates} && gates through ${GATE}, by truthiness, a promise there noted) · a boolean by its operator, untouched ${T.calls.boolean}`);
  log(`  imported by this run as ${VERDICT_ALIAS} (the file binds ${VERDICT} otherwise): ${T.aliased.length}${T.aliased.length ? ' — ' + T.aliased.slice(0, 8).join(', ') : ''}`);
  log(`  imported by this run as ${GATE_ALIAS} (the file binds ${GATE} otherwise): ${T.gateAliased.length}${T.gateAliased.length ? ' — ' + T.gateAliased.slice(0, 8).join(', ') : ''}`);
  log(`  LEFT BY RULE: ${n(T.left)}`);
  log(`  PLANTS (the census reads a helper in a string, a template's text, a regex or a comment — not code, never edited): ${T.plants} in ${T.plantFiles} files`);
  log(`  files the parser could not read: ${T.skipped.length}${T.skipped.length ? ' — ' + T.skipped.slice(0, 6).join(' | ') : ''}`);
  log(`  SELF-CHECK (lines, parse, text spans, read-back of every condition and name, the census) failed in: ${T.failed.length}${T.failed.length ? ' — ' + T.failed.slice(0, 6).join(' | ') : ''}`);
  log(`  A SECOND RUN over the texts it writes: ${T.second.files.length ? `${T.second.guards} guards and ${T.second.wraps} wraps more in ${T.second.files.join(', ')} — NOT IDEMPOTENT` : 'nothing to do (run twice = run once)'}`);
  log(`  the one-way list ${LIST_FILE}: ${Object.keys(listed).length} rows / ${sum(listed)} → ${Object.keys(lowered).length} rows / ${sum(lowered)}${listMoves ? '' : ' (no row falls)'}`);
  if (writes) log('  NEXT (the apply\'s proof; the integrator runs each, the tool runs none): this dry run again says NOTHING TO DO · the stale-pin scan over the applied diff · the whole fast tier in both zones · every heavy suite it edited · THE VACUOUS LEGS, read from the checker\'s own lines («handed as a verdict» and each suite\'s «N vacuous verdict(s)» total — never from exit codes: a vacuous operand beside a real one still passes), each cured or named');
  return { ...T, listBefore: listed, listAfter: lowered, written: writes, ioFault };
}

// the CLI's one refusal (PURE): a write without the coordinator's word, or a flag it does not know
export function cliRefusal(args) {
  const known = new Set(['--apply', '--coordinator-word', '--list']), odd = args.filter((a) => a.startsWith('--') && !known.has(a));
  if (odd.length) return `guard-inline-helpers: unknown flag ${odd.join(' ')} — refused, nothing written`;
  if (args.includes('--apply') && !args.includes('--coordinator-word')) return "guard-inline-helpers: --apply runs on the coordinator's word only (add --coordinator-word) — refused, nothing written";
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2), refused = cliRefusal(args);
  if (refused) { console.error(refused); process.exit(2); }
  const repo = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const T = await runTree(repo, { apply: args.includes('--apply'), list: args.includes('--list') });
  process.exit(T.failed.length || T.second.files.length ? 1 : 0);
}
