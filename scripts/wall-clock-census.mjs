#!/usr/bin/env node
// WALL-CLOCK BOUNDS IN FAST SUITES (lane mirror-flake-hardening, 2.369.270). rel269's mirror (run 38549333465) went RED
// on test-enter-census's `the census runs fast (< 3 s over all of src/lib)` — 4335 ms on ubuntu-latest — and ci.mjs
// stopped the whole fast tier on it. A fixed wall-clock bound on a suite's own run judges the MACHINE, never the code:
// a cost tripwire is a CENSUS over what is scanned (files, bytes, AST nodes) or a bound RELATIVE to a control measured
// in the same run; a wait is the mechanism's own constant × a stated slack, or the evidence it ended for its reason.
// This census reads every FAST suite with acorn and classifies each comparison of a measured wall-clock SPAN:
//   span     `<clock> - x` / `x - <mark>` (Date.now(), performance.now(), process.hrtime[.bigint](), new Date()), a
//            variable or an object field (`{ ms: Date.now() - t0 }`, `r.ms = …`) assigned one — data flow inside the
//            suite file by name (a duration the PRODUCT measures and returns: THE PRODUCT'S CLOCK, below);
//            through a coercion (`+ms.toFixed(1)`, `-ms`, `~~ms`, `ms | 0`), a sum (`a + ms`, `total += ms`), a
//            destructured field (`const { ms } = r`), `process.hrtime(t0)`'s [s, ns] tuple, and an ARRAY of spans
//            (`gaps.push(t - last)` across a loop, then `Math.max(...gaps)`, `gaps[i]`, `gaps.at(-1)`, `r.gaps` of a
//            helper's returned object) — lane oat-loop-gap-bound: test-oat-materialize F13's `r13.maxGap < 50` (59.4 ms
//            on ubuntu-latest, .270's candidate) escaped because the helper returned `maxGap: +maxGap.toFixed(1)`;
//   guard    a conjunct of an if-test's failure condition (`if (t > 10 && ratio > 2.5) bad(…)`): when a check applies;
//   wait     the comparison is a loop's deadline (`while (Date.now() - t0 < 5000 …)`, `if (span > N) break|return|throw`
//            inside a loop) — waiting, not judging;
//   lower    the span must be LONG (`span >= N`) — a slower runner only lengthens it;
//   control  the bound reads something that is not a literal: the mechanism's constant (`DP.DUP_PROBE_MS`, a const the
//            suite also hands the product), another span measured in the same run (a control), a ratio;
//   LITERAL  an upper bound made of numbers alone (`< 3000`, `<= 2 * 200 + 400`, a const used only as a bound) — RED
//            under 1 s always; at ≥ 1 s held by the per-suite ratchet in scripts/fixtures/wall-clock-baseline.json,
//            which only FALLS: a suite with more is RED (a new literal bound), a suite with fewer is RED until the
//            baseline is lowered in the same commit (`node scripts/wall-clock-census.mjs --lower`).
// Lane wall-clock-ratchet-down (2.369.271) read what this header used to call BLIND: a span inside a TUPLE
// (`fns.map((fn) => [fn.name, msOf(fn)])`, then `([, ms]) => ms > B`, `for (const [n, ms] of rows)`), a span handed to
// a helper's PARAMETER (`fast(Date.now() - t0)` ⇒ `(ms) => ok(ms < 500)`), a Map / Set of spans (`m.set(k, span)` ⇒
// `m.get(k)`, `s.add(span)` ⇒ `Math.max(...s)`), a for-of over an array of spans, a CLOCK FUNCTION (`const now = () =>
// Date.now()`), and a duration the PRODUCT measured and returned or a CHILD printed (see THE PRODUCT'S CLOCK below:
// test-fs-canary's `r.fsMs < 100`, test-tls-pass's `t.ms < 5000`, test-app-display-secrets' `r.store.ms < 3000`).
// THE RATCHET IS AT 0 since that lane: the baseline is empty, so any literal bound is a NEW one.
// STILL UNREADABLE (each said; none compared in the tier today): a PRODUCT duration whose field is not named in ms
// (`took`, `elapsed` — the house names a duration by its unit, and a string built from a span is no duration), one
// renamed on the way through a module the suite does not load (`{ lagMs: r.fsMs }`), one measured deeper than the
// modules the suite LOADS and the siblings they name (the whole require graph would put most of src/ through acorn on
// every run — measured ~2 s more), and a shell child's clock (`date +%s%N`).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const acorn = require('acorn');
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE = path.join(REPO, 'scripts', 'fixtures', 'wall-clock-baseline.json');
export const LITERAL_FLOOR_MS = 1000;   // a literal upper bound under this is RED whatever the baseline says

function walk(n, p, f) {
  if (!n || typeof n.type !== 'string') return;
  n._p = p; f(n);
  for (const k of Object.keys(n)) {
    if (k === '_p') continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, n, f); }
    else if (v && typeof v.type === 'string') walk(v, n, f);
  }
}
const un = (n) => (n && (n.type === 'ChainExpression' || n.type === 'ParenthesizedExpression') ? un(n.expression) : n);
const dotted = (n) => { n = un(n); if (!n) return ''; if (n.type === 'Identifier') return n.name; if (n.type === 'MemberExpression' && !n.computed) { const o = dotted(n.object); return o ? o + '.' + n.property.name : ''; } return ''; };
const CLOCKS = /^(?:Date\.now|performance\.now|process\.hrtime|process\.hrtime\.bigint|hrtime\.bigint)$/;
/** a read of the wall clock: Date.now(), performance.now(), process.hrtime(.bigint)(), new Date() (no argument) */
function isClockRead(n) {
  n = un(n);
  if (!n) return false;
  if (n.type === 'CallExpression') return CLOCKS.test(dotted(n.callee));
  if (n.type === 'NewExpression') return dotted(n.callee) === 'Date' && n.arguments.length === 0;
  if (n.type === 'UnaryExpression' && n.operator === '+') return isClockRead(n.argument);
  return false;
}
// the suite's own timers (a watchdog, a sleep): a const handed to one is still the suite's literal, not the product's
const TIMERS = /^(?:setTimeout|setInterval|sleep|delay|wait\w*|tick|timers\.\w+)$/;
// a read-only visit (walk() re-parents what it visits — a predicate over a subtree must not cut it from its parents)
function visit(n, f) {
  if (!n || typeof n.type !== 'string') return;
  f(n);
  for (const k of Object.keys(n)) {
    if (k === '_p') continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') visit(c, f); }
    else if (v && typeof v.type === 'string') visit(v, f);
  }
}
const CLOCK_TEXT = /\b(?:Date\.now|performance\.now|hrtime)\b|new\s+Date\s*\(\s*\)/;
const CLOCK_FN_TEXT = /\btime\.(?:monotonic|time|perf_counter)(?:_ns)?\(\)/;   // a child's clock (python) in the suite's text
const anyNode = (n, pred) => { let hit = false; visit(n, (m) => { if (!hit && pred(m)) hit = true; }); return hit; };

const parse = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true, allowAwaitOutsideFunction: true });
const fnOf = (n) => !!n && /Function/.test(n.type);

/** the data flow of one source — a suite, or a product module it loads — to a fixed point: marks, spans, span fields,
 *  helpers that return a span, arrays / tuples / Maps of spans. `seed` = field names already known to carry a span
 *  (a product's `{ ms }`, a child's JSON `ms`); `injected` = clock parameters the suite hands the product (a module's
 *  `now = () => Date.now()` default is no clock when the suite passes its own `now`). Throws on a parse error. */
function flow(src, { seed = [], injected = new Set(), ast = null } = {}) {
  ast = ast || parse(src);
  const all = [];
  walk(ast, null, (n) => all.push(n));
  // each function's own `return` arguments, once (a body is never re-walked inside the fixed point)
  const returnsOf = new Map();
  for (const n of all) if (n.type === 'ReturnStatement' && n.argument) { let o = n._p; while (o && !fnOf(o)) o = o._p; if (o) returnsOf.set(o, [...(returnsOf.get(o) || []), n.argument]); }
  // a PRODUCT field (seeded) is a span only on what the code got back from a call — `(await TLS.runChild(…)).ms`,
  // `JSON.parse(line).ms` — never on an object the file built itself (a fake timer's `{ fn, ms }`)
  const productFields = new Set(seed), callBound = new Set();
  const ARRAY_OPS = /^(?:find|findLast|filter|at|pop|shift|slice|map|flatMap|reduce|sort|toSorted|concat|reverse|get|values|entries|keys)$/;
  const isCallResult = (n) => { n = un(n); if (n && n.type === 'AwaitExpression') n = un(n.argument); return !!n && n.type === 'CallExpression' && !(un(n.callee).type === 'MemberExpression' && !un(n.callee).computed && ARRAY_OPS.test(un(n.callee).property.name)); };
  // (by name, as the rest of the flow — but a callback's own parameter `(c) => c.ms` shadows a `const c = await …`)
  const binds = (p, name) => !!p && (p.type === 'Identifier' ? p.name === name : p.type === 'AssignmentPattern' ? binds(p.left, name) : p.type === 'RestElement' ? binds(p.argument, name)
    : p.type === 'ArrayPattern' ? p.elements.some((e) => binds(e, name)) : p.type === 'ObjectPattern' ? p.properties.some((q) => binds(q.type === 'RestElement' ? q : q.value, name)) : false);
  const isParam = (n) => { for (let q = n._p; q; q = q._p) if (fnOf(q) && q.params.some((p) => binds(p, n.name))) return true; return false; };
  const fromCall = (n) => { n = un(n); if (!n) return false; if (n.type === 'Identifier') return callBound.has(n.name) && !isParam(n); if (n.type === 'MemberExpression') return fromCall(n.object); return isCallResult(n); };
  const marks = new Set(), spans = new Set(), spanFields = new Set(), spanFns = new Set(), spanArrays = new Set(), spanArrayFields = new Set();
  const clockFns = new Set(), spanMaps = new Set(), tupleArrays = new Map();
  // a CLOCK FUNCTION — `const now = () => Date.now()`, a product's injectable default `{ now = () => Date.now() }`,
  // `function now() { return Date.now(); }`: its calls read the wall clock
  const isClock = (n) => { n = un(n); return isClockRead(n) || (!!n && n.type === 'CallExpression' && un(n.callee).type === 'Identifier' && clockFns.has(un(n.callee).name)); };
  const returnsClock = (f) => (f.expression ? isClock(f.body) : f.body.body.length === 1 && f.body.body[0].type === 'ReturnStatement' && isClock(f.body.body[0].argument));
  const isMark = (n) => { n = un(n); return isClock(n) || (!!n && n.type === 'Identifier' && marks.has(n.name)); };
  // `anyNode(left, isClock)` per `-`, memoized while the clock functions stand still
  const clockIn = new Map();
  const hasClock = (n) => { const c = clockIn.get(n); if (c && c[0] === clockFns.size) return c[1]; const v = anyNode(n, isClock); clockIn.set(n, [clockFns.size, v]); return v; };
  const isSpanExpr = (n) => {
    n = un(n);
    if (!n) return false;
    if (n.type === 'BinaryExpression' && n.operator === '-') return isMark(n.left) || hasClock(n.left) || (un(n.right).type === 'Identifier' && marks.has(un(n.right).name));
    // a SUM of spans (a mark + a number is a deadline, not a span), a span truncated (`ms | 0`), coerced or negated
    // (`+ms.toFixed(1)` — F13's helper returned `maxGap: +maxGap.toFixed(1)`, and its `< 50` went unseen)
    if (n.type === 'BinaryExpression' && (n.operator === '+' || n.operator === '|')) return (isSpan(n.left) || isSpan(n.right)) && !isMark(n.left) && !isMark(n.right);
    if (n.type === 'UnaryExpression' && ['+', '-', '~'].includes(n.operator)) return isSpan(n.argument);
    // one element (or a fold) of an array of spans: `gaps[i]`, `gaps.at(-1)`, `gaps.reduce(…)`, `gaps.pop()`
    if (n.type === 'MemberExpression' && n.computed) return isSpanArray(n.object);
    if (n.type === 'CallExpression' && un(n.callee).type === 'MemberExpression' && !un(n.callee).computed && /^(?:at|reduce|pop|shift)$/.test(un(n.callee).property.name)) return isSpanArray(un(n.callee).object);
    // `m.get(k)` of a Map of spans (`m.set(k, span)`)
    if (n.type === 'CallExpression' && un(n.callee).type === 'MemberExpression' && !un(n.callee).computed && un(n.callee).property.name === 'get' && un(un(n.callee).object).type === 'Identifier') return spanMaps.has(un(un(n.callee).object).name);
    // span ÷ a number is a span; span ÷ span is a RATIO (dimensionless — relative to a control by construction)
    if (n.type === 'BinaryExpression' && n.operator === '/') return isSpan(n.left) && !isSpan(n.right);
    if (n.type === 'BinaryExpression' && n.operator === '*') return isSpan(n.left) || isSpan(n.right);
    // `Math.max(...gaps)`: an array of spans spread into the call
    if (n.type === 'CallExpression' && /^(?:Number|Math\.\w+|parseFloat)$/.test(dotted(n.callee))) return n.arguments.some((a) => (a.type === 'SpreadElement' ? isSpanArray(a.argument) : isSpan(a)));
    if (n.type === 'CallExpression' && un(n.callee).type === 'MemberExpression' && un(n.callee).property.name === 'toFixed') return isSpan(un(n.callee).object);
    return false;
  };
  const isSpan = (n) => {
    n = un(n);
    if (!n) return false;
    if (isSpanExpr(n)) return true;
    if (n.type === 'Identifier') return spans.has(n.name);
    if (n.type === 'MemberExpression' && !n.computed) return spanFields.has(n.property.name) || (productFields.has(n.property.name) && fromCall(n.object));
    if ((n.type === 'CallExpression' || n.type === 'AwaitExpression') && n.type === 'AwaitExpression') return isSpan(n.argument);
    if (n.type === 'CallExpression' && un(n.callee).type === 'Identifier') return spanFns.has(un(n.callee).name);
    return false;
  };
  // a helper that RETURNS a span (`const timeIt = (fn) => { …; return best; }`, `msOf`) makes its calls spans
  const returnsSpan = (f) => (f.expression ? isSpan(f.body) : (returnsOf.get(f) || []).some((a) => isSpan(a)));
  // the data flow, to a fixed point: marks (t0 = Date.now()), spans (ms = Date.now() - t0), span fields ({ ms: … })
  // an ARRAY of spans (`[span, …]`, `xs.map((x) => span)`): its .filter / .some / .every / .find / .forEach callbacks'
  // first parameter is a span (`times.filter((ms) => ms > 800)`)
  const isSpanArray = (n) => {
    n = un(n);
    if (!n) return false;
    if (n.type === 'Identifier') return spanArrays.has(n.name);
    if (n.type === 'MemberExpression' && !n.computed) return spanArrayFields.has(n.property.name);
    if (n.type === 'ArrayExpression') return n.elements.length > 0 && n.elements.every((e) => e && (e.type === 'SpreadElement' ? isSpanArray(e.argument) : isSpan(e)));
    // process.hrtime(t0) is the [s, ns] SINCE t0
    if (n.type === 'CallExpression' && /^(?:process\.)?hrtime$/.test(dotted(n.callee)) && n.arguments.length > 0) return true;
    // a copy, a sort, a slice of one is one
    if (n.type === 'CallExpression' && un(n.callee).type === 'MemberExpression' && !un(n.callee).computed && /^(?:sort|toSorted|slice|filter|concat|reverse|toReversed)$/.test(un(n.callee).property.name)) return isSpanArray(un(n.callee).object);
    if (n.type === 'CallExpression' && un(n.callee).type === 'MemberExpression' && un(n.callee).property.name === 'map') { const cb = n.arguments[0]; return !!cb && /Function/.test(cb.type) && returnsSpan(cb); }
    // a Map's values (`[...m.values()]`)
    if (n.type === 'CallExpression' && un(n.callee).type === 'MemberExpression' && !un(n.callee).computed && un(n.callee).property.name === 'values' && un(un(n.callee).object).type === 'Identifier') return spanMaps.has(un(un(n.callee).object).name);
    return false;
  };
  // a TUPLE that carries a span (`[n, msOf(fn)]`) and an array of them (`xs.map((x) => [x, span])`): the index set of
  // the span elements — a destructured element there is a span (`.filter(([, ms]) => ms > B)`, `for (const [n, ms] of rows)`)
  const tupleIdx = (n) => { n = un(n); const s = new Set(); if (n && n.type === 'ArrayExpression') n.elements.forEach((e, i) => { if (e && e.type !== 'SpreadElement' && isSpan(e)) s.add(i); }); return s; };
  const returnedTuples = (f) => {
    if (f.expression) return tupleIdx(f.body);
    const s = new Set();
    for (const a of returnsOf.get(f) || []) for (const i of tupleIdx(a)) s.add(i);
    return s;
  };
  const tupleArrayIdx = (n) => {
    n = un(n);
    const s = new Set();
    if (!n) return s;
    if (n.type === 'Identifier') return tupleArrays.get(n.name) || s;
    if (n.type === 'ArrayExpression') { for (const e of n.elements) if (e && e.type !== 'SpreadElement') for (const i of tupleIdx(e)) s.add(i); return s; }
    if (n.type === 'CallExpression' && un(n.callee).type === 'MemberExpression' && !un(n.callee).computed) {
      const m = un(n.callee).property.name;
      if (/^(?:map|flatMap)$/.test(m) && fnOf(n.arguments[0])) return returnedTuples(n.arguments[0]);
      if (/^(?:sort|toSorted|slice|filter|concat|reverse|toReversed)$/.test(m)) return tupleArrayIdx(un(n.callee).object);
    }
    return s;
  };
  const addTuples = (name, idx) => { if (!idx.size) return; const t = tupleArrays.get(name) || new Set(); for (const i of idx) t.add(i); tupleArrays.set(name, t); };
  const spanAt = (pat, idx) => { if (pat && pat.type === 'ArrayPattern') pat.elements.forEach((e, i) => { const v = e && e.type === 'AssignmentPattern' ? e.left : e; if (v && v.type === 'Identifier' && idx.has(i)) spans.add(v.name); }); };
  // the helpers by name — a span handed to one makes its parameter at that position a span
  const fnDefs = new Map();
  for (const n of all) {
    if (n.type === 'FunctionDeclaration' && n.id) fnDefs.set(n.id.name, [...(fnDefs.get(n.id.name) || []), n]);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && fnOf(n.init)) fnDefs.set(n.id.name, [...(fnDefs.get(n.id.name) || []), n.init]);
  }
  const sizeOf = () => marks.size + spans.size + spanFields.size + spanFns.size + spanArrays.size + spanArrayFields.size + clockFns.size + spanMaps.size + [...tupleArrays.values()].reduce((a, t) => a + t.size, 0);
  for (let size = -1; size !== sizeOf();) {
    size = sizeOf();
    for (const n of all) {
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && fnOf(n.init) && returnsClock(n.init)) clockFns.add(n.id.name);
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && isCallResult(n.init)) callBound.add(n.id.name);
      if (n.type === 'AssignmentExpression' && n.operator === '=' && un(n.left).type === 'Identifier' && isCallResult(n.right)) callBound.add(un(n.left).name);
      if (n.type === 'FunctionDeclaration' && n.id && returnsClock(n)) clockFns.add(n.id.name);
      if (n.type === 'AssignmentPattern' && n.left.type === 'Identifier' && fnOf(n.right) && returnsClock(n.right) && !injected.has(n.left.name)) clockFns.add(n.left.name);
      // `m.set(k, span)`: a Map of spans; `s.add(span)`: a Set of them (an array, spread)
      if (n.type === 'CallExpression' && un(n.callee).type === 'MemberExpression' && !un(n.callee).computed && un(un(n.callee).object).type === 'Identifier') {
        const m = un(n.callee).property.name, o = un(un(n.callee).object).name;
        if (m === 'set' && n.arguments.length === 2 && isSpan(n.arguments[1])) spanMaps.add(o);
        if (m === 'add' && n.arguments.length === 1 && isSpan(n.arguments[0])) spanArrays.add(o);
      }
      // tuples: `const rows = xs.map((x) => [x, span])`, then their destructured span elements
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) addTuples(n.id.name, tupleArrayIdx(n.init));
      if (n.type === 'AssignmentExpression' && n.operator === '=' && un(n.left).type === 'Identifier') addTuples(un(n.left).name, tupleArrayIdx(n.right));
      if (n.type === 'VariableDeclarator' && n.id.type === 'ArrayPattern' && n.init) spanAt(n.id, un(n.init).type === 'MemberExpression' && un(n.init).computed ? tupleArrayIdx(un(n.init).object) : tupleIdx(n.init));
      if (n.type === 'CallExpression' && un(n.callee).type === 'MemberExpression' && !un(n.callee).computed && /^(?:filter|some|every|find|findIndex|findLast|forEach|map|flatMap)$/.test(un(n.callee).property.name) && fnOf(n.arguments[0])) spanAt(n.arguments[0].params[0], tupleArrayIdx(un(n.callee).object));
      if (n.type === 'ForOfStatement' && n.left.type === 'VariableDeclaration' && n.left.declarations[0]) {
        const id = n.left.declarations[0].id;
        if (id.type === 'ArrayPattern') spanAt(id, tupleArrayIdx(n.right));
        else if (id.type === 'Identifier' && isSpanArray(n.right)) spans.add(id.name);
      }
      // a span handed to a helper by name: `check(Date.now() - t0, 'x')` ⇒ check's parameter 0 is a span
      if (n.type === 'CallExpression' && un(n.callee).type === 'Identifier' && fnDefs.has(un(n.callee).name)) {
        n.arguments.forEach((a, i) => {
          if (a.type === 'SpreadElement' || !isSpan(a)) return;
          for (const f of fnDefs.get(un(n.callee).name)) { const p = f.params[i]; const v = p && p.type === 'AssignmentPattern' ? p.left : p; if (v && v.type === 'Identifier') spans.add(v.name); }
        });
      }
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && isSpanArray(n.init)) spanArrays.add(n.id.name);
      if (n.type === 'AssignmentExpression' && n.operator === '=' && un(n.left).type === 'Identifier' && isSpanArray(n.right)) spanArrays.add(un(n.left).name);
      // `const [s, ns] = process.hrtime(t0)`, `const [worst] = gaps.sort(…)`: each element of an array of spans
      if (n.type === 'VariableDeclarator' && n.id.type === 'ArrayPattern' && n.init && isSpanArray(n.init)) for (const e of n.id.elements) if (e && e.type === 'Identifier') spans.add(e.name);
      // ACROSS A LOOP: `gaps.push(t - last)` makes `gaps` an array of spans (`r.gaps.push(…)` a field of one)
      if (n.type === 'CallExpression' && un(n.callee).type === 'MemberExpression' && !un(n.callee).computed && /^(?:push|unshift)$/.test(un(n.callee).property.name) && n.arguments.some((a) => (a.type === 'SpreadElement' ? isSpanArray(a.argument) : isSpan(a)))) {
        const o = un(un(n.callee).object);
        if (o.type === 'Identifier') spanArrays.add(o.name);
        else if (o.type === 'MemberExpression' && !o.computed) spanArrayFields.add(o.property.name);
      }
      // `total += performance.now() - t`: a sum of spans across a loop
      if (n.type === 'AssignmentExpression' && n.operator === '+=' && isSpan(n.right)) {
        if (n.left.type === 'Identifier') spans.add(n.left.name);
        else if (n.left.type === 'MemberExpression' && !n.left.computed) spanFields.add(n.left.property.name);
      }
      // `const { maxGap } = await f13()`, `({ ms }) => ms < 50`: a destructured span field (or array-of-spans field)
      if (n.type === 'Property' && !n.computed && n.key && n._p && n._p.type === 'ObjectPattern') {
        const k = n.key.type === 'Identifier' ? n.key.name : n.key.value;
        const v = n.value && n.value.type === 'AssignmentPattern' ? n.value.left : n.value;
        if (typeof k === 'string' && v && v.type === 'Identifier') {
          if (spanFields.has(k)) spans.add(v.name);
          if (spanArrayFields.has(k)) spanArrays.add(v.name);
          // `const { ms } = await probe()`: a product field off a call result
          const decl = n._p._p;
          if (productFields.has(k) && decl && decl.type === 'VariableDeclarator' && decl.id === n._p && isCallResult(decl.init)) spans.add(v.name);
        }
      }
      if (n.type === 'CallExpression' && un(n.callee).type === 'MemberExpression' && /^(?:filter|some|every|find|findIndex|findLast|forEach)$/.test(un(n.callee).property.name) && isSpanArray(un(n.callee).object)) {
        const cb = n.arguments[0];
        if (cb && /Function/.test(cb.type) && cb.params[0] && cb.params[0].type === 'Identifier') spans.add(cb.params[0].name);
      }
      if (n.type === 'FunctionDeclaration' && n.id && returnsSpan(n)) spanFns.add(n.id.name);
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && /Function/.test(n.init.type) && returnsSpan(n.init)) spanFns.add(n.id.name);
      const bind = (id, v) => {
        if (!v || !id || id.type !== 'Identifier') return;
        if (isClock(v) || (un(v).type === 'Identifier' && marks.has(un(v).name))) marks.add(id.name);
        if (isSpan(v)) spans.add(id.name);
      };
      if (n.type === 'VariableDeclarator') bind(n.id, n.init);
      if (n.type === 'AssignmentExpression' && n.operator === '=') {
        bind(n.left, n.right);
        if (n.left.type === 'MemberExpression' && !n.left.computed && isSpan(n.right)) spanFields.add(n.left.property.name);
      }
      if (n.type === 'Property' && !n.computed && n.key && n.value && n.value.type !== 'AssignmentPattern') {
        const k = n.key.type === 'Identifier' ? n.key.name : n.key.value;
        if (typeof k === 'string' && n._p && n._p.type === 'ObjectExpression' && isSpan(n.value)) spanFields.add(k);
        if (typeof k === 'string' && n._p && n._p.type === 'ObjectExpression' && isSpanArray(n.value)) spanArrayFields.add(k);
      }
    }
  }
  return { all, isSpan, spanFields };
}

/** the DURATION fields one product module fills with a wall-clock span — memoized per file, the seeded fields it
 *  READS (`.fsMs`) and the injected clocks it defaults; one parse per file */
const fieldMemo = new Map(), modMemo = new Map();
function moduleSpanFields(file, src, seed, injected) {
  if (!modMemo.has(file)) {
    let ast = null;
    try { ast = parse(src); } catch { /* unparseable: no fields */ }
    modMemo.set(file, { ast, reads: new Set([...src.matchAll(/\.(\w+)\b/g)].map((m) => m[1]).filter((f) => DURATION_NAME.test(f))), defaults: [...src.matchAll(/\b(\w+)\s*=\s*\(\)\s*=>/g)].map((m) => m[1]) });
  }
  const m = modMemo.get(file);
  if (!m.ast) return new Set();
  const use = [...seed].filter((f) => m.reads.has(f)).sort(), inj = m.defaults.filter((n) => injected.has(n)).sort();
  const key = `${file}\0${use.join(',')}\0${inj.join(',')}`;
  if (!fieldMemo.has(key)) fieldMemo.set(key, new Set([...flow(src, { seed: use, injected: new Set(inj), ast: m.ast }).spanFields].filter((f) => DURATION_NAME.test(f))));
  return fieldMemo.get(key);
}

/** PURE: every comparison of a measured wall-clock span in one suite's source, classified (see the header).
 *  `fields` = the field names the product (or a child) fills with a span — productSpanFields() of the suite. */
export function wallClockFindings(src, { fields = [], ast = null } = {}) {
  // every span starts at a clock read IN THIS FILE or in a field the product / a child fills from its clock, so a
  // source with neither has no finding — exact, and it spares the parse of most of the tier
  if (!CLOCK_TEXT.test(src) && !CLOCK_FN_TEXT.test(src) && ![...fields].some((f) => new RegExp(`\\b${f}\\b`).test(src))) return [];
  let all, isSpan;
  try { ({ all, isSpan } = flow(src, { seed: fields, ast })); }
  catch (e) { return [{ line: 0, kind: 'PARSE', text: e.message, boundMs: null }]; }
  const text = (n) => src.slice(n.start, n.end).replace(/\s+/g, ' ');
  // a literal const = declared once with a numbers-only init; a MECHANISM const = one the suite also uses outside
  // a wall-clock bound and outside a message (a template literal) — it reaches the product or a fake
  const decl = new Map();
  for (const n of all) if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) decl.set(n.id.name, decl.has(n.id.name) ? null : n);
  const comparisons = all.filter((n) => n.type === 'BinaryExpression' && ['<', '<=', '>', '>='].includes(n.operator) && (isSpan(n.left) || isSpan(n.right)));
  const boundSides = comparisons.map((n) => (isSpan(n.left) ? n.right : n.left));
  const inside = (n, outer) => { for (let q = n; q; q = q._p) if (q === outer) return true; return false; };
  const usedElsewhere = (name, d) => all.some((m) => m.type === 'Identifier' && m.name === name && m !== d.id
    && !boundSides.some((b) => inside(m, b)) && !(() => { for (let q = m._p; q; q = q._p) if (q.type === 'TemplateLiteral') return true; return false; })()
    && !(m._p && m._p.type === 'MemberExpression' && m._p.property === m && !m._p.computed)
    && !(m._p && m._p.type === 'CallExpression' && m._p.arguments.includes(m) && TIMERS.test(dotted(m._p.callee)))
    && !(m._p && m._p.type === 'BinaryExpression' && m._p._p && m._p._p.type === 'CallExpression' && TIMERS.test(dotted(m._p._p.callee)))
    && !(m._p && m._p.type === 'Property' && m._p.key === m && !m._p.computed && !m._p.shorthand));
  const numbersOnly = (n, seen = new Set()) => !anyNode(n, (m) => {
    if (m.type === 'Identifier') {
      if (m._p && m._p.type === 'MemberExpression' && m._p.property === m) return false;
      const d = decl.get(m.name);
      if (!d || seen.has(m.name)) return true;
      if (usedElsewhere(m.name, d)) return true;           // a mechanism constant
      return !numbersOnly(d.init, new Set([...seen, m.name]));
    }
    return m.type === 'MemberExpression' || m.type === 'CallExpression' || m.type === 'ThisExpression' || m.type === 'NewExpression';
  });
  const evalNumbers = (n, seen = new Set()) => {
    const v = un(n);
    if (v.type === 'Literal') return typeof v.value === 'number' ? v.value : typeof v.value === 'bigint' ? Number(v.value) : NaN;
    if (v.type === 'Identifier') { const d = decl.get(v.name); return d && !seen.has(v.name) ? evalNumbers(d.init, new Set([...seen, v.name])) : NaN; }
    if (v.type === 'UnaryExpression' && v.operator === '-') return -evalNumbers(v.argument, seen);
    if (v.type === 'BinaryExpression') { const a = evalNumbers(v.left, seen), b = evalNumbers(v.right, seen); return ({ '+': a + b, '-': a - b, '*': a * b, '/': a / b })[v.operator] ?? NaN; }
    if (v.type === 'TemplateLiteral' && !v.expressions.length) return Number(v.quasis[0].value.cooked);
    return NaN;
  };
  const out = [];
  for (const n of comparisons) {
    const spanLeft = isSpan(n.left);
    const bound = spanLeft ? n.right : n.left;
    // `span < N` (or `N > span`) says the span must be SHORT; polarity flips under `!` and in an if-test (the
    // consequent is the failure: `if (ms > 1500) bad.push(…)`)
    let short = spanLeft ? n.operator[0] === '<' : n.operator[0] === '>';
    let q = n, kind = null, negated = false, conjunct = false;
    while (q._p && (q._p.type === 'LogicalExpression' || (q._p.type === 'UnaryExpression' && q._p.operator === '!') || q._p.type === 'ParenthesizedExpression')) {
      if (q._p.type === 'UnaryExpression') negated = true;
      if (q._p.type === 'LogicalExpression' && q._p.operator === '&&') conjunct = true;
      q = q._p;
    }
    // `!(span < N)` is a flag either way round (`over: !(ms < B)` is the violation) — judged as a short bound
    if (negated) short = true;
    // the body of a .filter / .some / .find callback names the VIOLATORS (`times.filter(([, ms]) => ms > BOUND)`)
    const cb = q._p && /Function/.test(q._p.type) && q._p.body === q ? q._p : null;
    if (cb && cb._p && cb._p.type === 'CallExpression' && cb._p.arguments.includes(cb) && /^(?:filter|some|find|findIndex|findLast)$/.test(un(cb._p.callee).type === 'MemberExpression' ? un(cb._p.callee).property.name : '')) short = !short;
    const sink = q._p;
    let inLoop = false;
    let r = n._p;
    for (; r && !/Function/.test(r.type); r = r._p) if (/^(?:While|DoWhile|For|ForOf|ForIn)Statement$/.test(r.type)) inLoop = true;
    // a poll: the enclosing function is a callback handed to setInterval / setTimeout
    if (r && r._p && r._p.type === 'CallExpression' && r._p.arguments.includes(r) && TIMERS.test(dotted(r._p.callee))) inLoop = true;
    if (sink && /^(?:While|DoWhile|For)Statement$/.test(sink.type) && sink.test === q) kind = 'wait';
    else if (sink && sink.type === 'IfStatement' && sink.test === q) {
      const c = sink.consequent, body = c.type === 'BlockStatement' ? c.body : [c];
      const exits = body.length && body.every((s) => /^(?:Break|Continue|Return|Throw)Statement$/.test(s.type) || (s.type === 'ExpressionStatement' && un(s.expression).type === 'CallExpression' && /^(?:reject|clearInterval|clearTimeout|resolve|done)$/.test(dotted(un(s.expression).callee))));
      if (inLoop && exits) kind = 'wait';
      // `if (t64 > 10 && ratio > 2.5) bad.push(…)`: a conjunct of a failure condition says WHEN the check applies (a
      // noise floor), it is not itself judged — only a lone comparison (or a disjunct) is the asserted bound
      else if (conjunct) kind = 'guard';
      else short = !short;
    }
    let boundMs = null;
    if (!kind) {
      if (!short) kind = 'lower';
      else if (!numbersOnly(bound)) kind = 'control';
      else {
        kind = 'LITERAL';
        // the span's unit: a `/ 1000` or `/ 1e9` in the span itself means seconds
        const sp = spanLeft ? n.left : n.right;
        const secs = anyNode(sp, (m) => m.type === 'BinaryExpression' && m.operator === '/' && [1000, 1e3].includes(evalNumbers(m.right)));
        boundMs = evalNumbers(bound) * (secs ? 1000 : 1);
      }
    }
    out.push({ line: n.loc.start.line, kind, boundMs, text: text(n).slice(0, 140) });
  }
  return out;
}

// THE PRODUCT'S CLOCK (lane wall-clock-ratchet-down, 2.369.271): a duration the PRODUCT measures and returns
// (tls.js runChild's `ms: Date.now() - t0`, the fs canary's `{ fsMs, loopMs }`) or a CHILD prints (secret-probe.py's
// `out['ms'] = … time.monotonic() - t`) is a span the suite never measured itself. The census reads the src modules
// the suite names (a string `src/….js`) and the sibling files those name (`'fs-canary-worker.js'`), runs the same data
// flow over each (a module's `now = () => Date.now()` default is its clock — unless the suite hands it a `now` of its
// own), and seeds the suite's flow with the DURATION fields they fill from a clock (`ms`, `…Ms`: the house names a
// duration by its unit; a string built from a span is no duration); a child script the suite names
// (scripts/fixtures/*.py) or carries inline is read for python clock fields.
const SRC_REF = /(['"`])(?:\.\.\/)?(src\/[\w./-]+?\.c?js)\1/g;
const LOADS = /(?:\b(?:require|import)\s*\((?:\s*[\w.]+\s*\()*\s*(?:\w+\s*,\s*)?|\bfrom\s+|\.load\(\s*)$/;
const SIB_REF = /(['"`])([\w.-]+\.c?js)\1/g;
const CHILD_REF = /(['"`])(?:\.\.\/)?(scripts\/fixtures\/[\w./-]+?\.py)\1/g;
const CHILD_FIELD = /\[\s*['"](\w+)['"]\s*\]\s*=[^\n]*\btime\.(?:monotonic|time|perf_counter)(?:_ns)?\(\)\s*-|['"](\w+)['"]\s*:[^\n]*\btime\.(?:monotonic|time|perf_counter)(?:_ns)?\(\)\s*-/g;
export const DURATION_NAME = /^(?:ms|\w*Ms|\w*_ms)$/;
const childFields = (text) => [...text.matchAll(CHILD_FIELD)].map((m) => m[1] || m[2]);
const readMemo = new Map(), sibMemo = new Map();
const siblingsOf = (rel, t) => { if (!sibMemo.has(rel)) sibMemo.set(rel, [...new Set([...t.matchAll(SIB_REF)].map((x) => path.posix.join(path.posix.dirname(rel), x[2])))]); return sibMemo.get(rel); };
const readRepo = (rel) => { if (!readMemo.has(rel)) { let t = null; try { t = fs.readFileSync(path.join(REPO, rel), 'utf8'); } catch { /* none */ } readMemo.set(rel, t); } return readMemo.get(rel); };
// the duration NAMES one source compares (`r.fsMs < 100`, `({ ms }) => ms > 800`) — off the AST, so a comment or a
// message that quotes `ms < 100` names nothing
const DURATION_CMP = /(?<![=<>])[<>]=?\s*[\w.?]*\b(?:ms|\w*Ms|\w*_ms)\b|\b(?:ms|\w*Ms|\w*_ms)\s*[<>]/;   // a cheap gate before the parse
const comparedNames = (ast) => {
  const out = new Set();
  visit(ast, (n) => { if (n.type === 'BinaryExpression' && ['<', '<=', '>', '>='].includes(n.operator)) for (const x of [un(n.left), un(n.right)]) { const nm = x && (x.type === 'Identifier' ? x.name : x.type === 'MemberExpression' && !x.computed ? x.property.name : null); if (nm && DURATION_NAME.test(nm)) out.add(nm); } });
  return out;
};
/** the clock-filled DURATION fields of what one suite loads; `readFile` = repo-relative path → text (or null) */
export function productSpanFields(src, readFile = readRepo, ast = null) {
  const fields = new Set(childFields(src));
  for (const m of src.matchAll(CHILD_REF)) { const t = readFile(m[2]); if (t) for (const f of childFields(t)) fields.add(f); }
  // only a module that names a duration the suite COMPARES can fill it (`r.fsMs < 100` ⇒ the modules naming fsMs)
  let compared;
  try { compared = comparedNames(ast || parse(src)); } catch { return fields; }
  if (!compared.size) return fields;
  // the clock parameters the suite hands the product (`now: () => clock`, `{ now }`): those defaults are not its clock
  const injected = new Set([...src.matchAll(/\b(now|clock|nowMs)\s*[:,}]/g)].map((m) => m[1]));
  const mods = new Map();
  for (const m of src.matchAll(SRC_REF)) {
    if (!LOADS.test(src.slice(Math.max(0, m.index - 80), m.index))) continue;
    const rel = path.posix.normalize(m[2]);
    if (mods.has(rel)) continue;
    const t = readFile(rel);
    mods.set(rel, t);
    if (t) for (const c of siblingsOf(rel, t)) if (!mods.has(c)) { const ct = readFile(c); if (ct !== null) mods.set(c, ct); }
  }
  // …and FILLS it: `fsMs: …`, `r.fsMs = …`, `{ fsMs, loopMs }`
  const alt = [...compared].join('|');
  const fills = new RegExp(`\\b(?:${alt})\\s*:(?!:)|\\.(?:${alt})\\s*=(?!=)|[{,]\\s*(?:${alt})\\s*(?=[,}])`);
  const clocked = [...mods].filter(([, t]) => t && fills.test(t) && CLOCK_TEXT.test(t));
  // to a fixed point: a module that READS a field another fills (`r.fsMs` from the worker) is read again, seeded
  for (let size = -1; size !== fields.size;) {
    size = fields.size;
    for (const [rel, t] of clocked) for (const f of moduleSpanFields(rel, t, fields, injected)) fields.add(f);
  }
  return fields;
}

/** every FAST row's suite file → its findings; `rows` = ci.mjs SUITES (or a planted list); `readFile` reads the
 *  product modules / child scripts a suite names (repo-relative) */
export function censusOver(rows, readSource = (name) => fs.readFileSync(path.join(REPO, 'scripts', name + '.mjs'), 'utf8'), readFile = undefined) {
  const suites = [];
  for (const r of rows) {
    if (r.tier !== 'fast') continue;
    let src;
    try { src = readSource(r.name); } catch { continue; }
    // one parse per suite, shared by the product read and the flow (a suite with no clock and no duration name skips both)
    let ast = null;
    if (CLOCK_TEXT.test(src) || CLOCK_FN_TEXT.test(src) || DURATION_CMP.test(src)) { try { ast = parse(src); } catch (e) { suites.push({ name: r.name, findings: [{ line: 0, kind: 'PARSE', text: e.message, boundMs: null }] }); continue; } }
    const fields = ast ? productSpanFields(src, readFile, ast) : [];
    suites.push({ name: r.name, findings: ast ? wallClockFindings(src, { fields, ast }) : [] });
  }
  return suites;
}

/** PURE: the verdict over a census + the baseline ({ suite: count of ≥ 1 s literal bounds }) */
export function ratchetVerdict(suites, baseline) {
  const problems = [], counts = {};
  for (const s of suites) {
    const lit = s.findings.filter((f) => f.kind === 'LITERAL');
    for (const f of lit) if (!(f.boundMs >= LITERAL_FLOOR_MS)) problems.push(`${s.name}:${f.line} asserts ${f.text} — a literal wall-clock bound under ${LITERAL_FLOOR_MS} ms (a census of the work, a control measured in the run, or the mechanism's constant × a stated slack)`);
    for (const f of s.findings) if (f.kind === 'PARSE') problems.push(`${s.name}: the census could not parse it (${f.text})`);
    const held = lit.filter((f) => f.boundMs >= LITERAL_FLOOR_MS).length;
    if (held) counts[s.name] = held;
    const allowed = baseline[s.name] || 0;
    if (held > allowed) problems.push(`${s.name}: ${held} literal wall-clock bounds ≥ ${LITERAL_FLOOR_MS} ms, the baseline holds ${allowed} — a NEW one (${lit.filter((f) => f.boundMs >= LITERAL_FLOOR_MS).map((f) => `:${f.line} ${f.text}`).join(' · ')})`);
    else if (held < allowed) problems.push(`${s.name}: ${held} literal wall-clock bounds, the baseline still says ${allowed} — lower it (node scripts/wall-clock-census.mjs --lower)`);
  }
  for (const name of Object.keys(baseline)) if (!suites.some((s) => s.name === name)) problems.push(`${name}: in the baseline but not a fast suite on disk — lower it (node scripts/wall-clock-census.mjs --lower)`);
  return { problems, counts };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { SUITES } = await import('./ci.mjs');
  const suites = censusOver(SUITES);
  const by = {};
  for (const s of suites) for (const f of s.findings) by[f.kind] = (by[f.kind] || 0) + 1;
  for (const s of suites) for (const f of s.findings) if (f.kind === 'LITERAL' || process.argv.includes('--all')) console.log(`  ${f.kind.padEnd(8)} ${(s.name + ':' + f.line).padEnd(44)} ${String(f.boundMs ?? '').padEnd(7)} ${f.text}`);
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const v = ratchetVerdict(suites, baseline);
  console.log(`= ${suites.length} fast suites · ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(' · ')}`);
  if (process.argv.includes('--lower')) {
    const next = Object.fromEntries(Object.entries(baseline).filter(([k]) => v.counts[k] !== undefined).map(([k, n]) => [k, Math.min(n, v.counts[k])]).sort());
    fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
    console.log('baseline lowered (it never rises here — a new literal bound is converted, not admitted)');
  } else for (const p of v.problems) console.log('  RED ' + p);
  process.exit(v.problems.length && !process.argv.includes('--lower') ? 1 : 0);
}
