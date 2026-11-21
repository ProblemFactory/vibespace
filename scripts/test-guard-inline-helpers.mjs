#!/usr/bin/env node
// THE TOOL THAT GUARDS EVERY INLINE ASSERTION HELPER, ON FIXTURES (B-1747 part 2, lane bl-scratch, 2026-11-21).
// scripts/guard-inline-helpers.mjs is applied by the integrator on a train tip as a generated commit (主开发 r1166), so its
// guarantees are proven here, on texts of every helper shape and every call kind, each with a RED CONTROL (a mutant of the
// tool built through scripts/scratch.mjs anchored(): a moved anchor fails by name):
//   ① the edit applied: the census's own guard on the opening line, `!!( … )` around a condition that is not a boolean by
//     its operator, a boolean one untouched — for an arrow block, a function (name-first, called above its hoisted
//     definition), the arrow EXPRESSION helpers (a block made of them, its value still returned) and a helper whose name a
//     parameter or an inner block binds to another function (scope by scope)
//   ② NO LINE MOVES                     RED: a guard written on its own line
//   ③ A NAME ARGUMENT IS BYTE-IDENTICAL  RED: the wrap put on the name slot
//   ④ A WHOLE STRING IS NEVER WRAPPED    RED: the string-shaped condition's refusal taken out
//   ⑤ CODE IS TOLD FROM TEXT: a helper spelled in a string, a template's text or a comment is a PLANT (said, never edited);
//     an edit point inside a string is refused by the self-check      REDS: the tokenizer filter out; the self-check's span test out
//   ⑥ RUN TWICE = RUN ONCE, and a later tip guards only what is new   REDS: a guard the census cannot read; targets that ignore «guarded»
//   ⑦ IT PASSES EXACTLY WHEN IT PASSED BEFORE (each fixture run before and after; a swap the guard now throws on)
//                                                                     REDS: `!(` for `!!(`; an expression block without its return
//   ⑧ LEFT BY RULE, said: handed on as a value, exported, a call by spread, a string where the condition goes (whole or
//     joined), a defaulted condition parameter                        REDS: the handed-on rule out; calls read by name, not binding
//   ⑨ THE RUN OVER A TREE (a scratch repo): the dry run writes nothing; the apply writes the files and LOWERS the one-way list
//     (never adds, never raises); a second run says NOTHING TO DO      RED: the census-unreadable guard (the apply is refused)
//   ⑩ the CLI's refusal: --apply without --coordinator-word, an unknown flag
// Fixture helpers are spelled in pieces (K + ' ok = …') so the census (test-ci-gate-tiers §7b) reads none in this file.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as C from './lib/check.mjs';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import * as G0 from './guard-inline-helpers.mjs';
import * as W from './wall-clock-census.mjs';

const { ok, report } = C.checker();
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const acorn = createRequire(path.join(REPO, 'package.json'))('acorn');
const TOOL_REL = 'scripts/guard-inline-helpers.mjs', TOOL = fs.readFileSync(path.join(REPO, TOOL_REL), 'utf8');
const MC = mutantCopies('guard-inline', REPO);
// a mutant of the tool: one or more anchored edits (each anchor must stand once, or the control fails by name)
const mutant = (name, ...edits) => import(pathToFileURL(MC.write(TOOL_REL, edits.reduce((t, [a, to]) => anchored(t, a, to, name), TOOL), name)).href);
const VALUE_RULE_OUT = ['if (u.value) { out.set(t,', 'if (false) { out.set(t,'];   // the body rule reads a guard's own `typeof c` as a value use

// ── THE FIXTURES: one text per shape and call kind; each runnable one ends with its own tally ─────────────────────────────
const K = 'const', F = 'function', V = 'var', lines = (...ls) => ls.join('\n');
const HEAD = 'let pass = 0, fail = 0; const extra = [];';
const FIX = {
  arrowBlock: lines(
    HEAD,
    K + ' ok = (c, n) => { if (c) pass++; else fail++; };',
    "const v = { a: 1, list: [1, 2], s: 'x', none: null, z: 0 };",
    "ok(v.a === 1, 'a comparison');",
    "ok(!v.none, 'a negation');",
    "ok(v.a > 0 && v.list.length === 2, 'an and of comparisons');",
    "ok(v.z instanceof Object || 'q' in v, 'instanceof or in (fails)');",
    "ok(true, `a template name ${v.a}`);",
    "ok(v.list.includes(2), 'a predicate call');",
    "ok(v.a, 'a property');",
    "ok(v.z, 'a zero (fails)');",
    "ok(v.list.length, 'a length');",
    "ok(v.s && v.a, 'an and of values');",
    "ok(v.none ?? v.z, 'a nullish (fails)');",
    "ok(v.a ? v.s : 0, 'a ternary of values');",
    'ok(v.list',
    '  .map((x) => x * 2)',
    "  .find((x) => x > 3), 'a call over three lines');",
    "ok(v.a, 'a name' + ' in two pieces');",
    "// ok(v.a, 'a call in a comment')",
    "const q = \"ok(v.a, 'a call in a string')\";",
    'extra.push(q.length);',
  ),
  functionNameFirst: lines(
    HEAD,
    "check('a call above its hoisted definition', pass === 0);",
    F + ' check(n, c) { if (!c) { fail++; return; } pass++; }',
    "check('a value', [1].length);",
    "check('a regex test', /a/.test('a'));",
    "check('a value that fails', null);",
    "for (const x of [1, 0]) check('a loop value ' + x, x);",
  ),
  arrowExpression: lines(
    HEAD,
    K + ' ck = (c, n) => c ? pass++ : fail++;',
    K + ' leg = (n, c) => (c ? (pass++, true) : (fail++, false));',
    "extra.push(leg('returns its verdict', 1 === 1));",
    "extra.push(leg('a value', 2));",
    "ck(extra[0], 'the verdict came back');",
    'ck(extra.length,',
    "  'a call over two lines');",
  ),
  scope: lines(
    HEAD,
    K + ' ok = (c, n) => { if (c) pass++; else fail++; };',
    F + " inner(ok) { return ok(5, 'not ours: a parameter'); }",
    'extra.push(inner((x, y) => x + y.length));',
    '{ ' + K + ' ok = (a, b) => a * b; extra.push(ok(6, 7)); }',
    "ok(pass + 1, 'ours');",
  ),
  plants: lines(
    HEAD,
    "const s1 = '" + K + " ok = (c, n) => { if (c) pass++; };';",
    'const s2 = `' + K + ' check = (c, n) => { if (!c) fail++; }`;',
    '// ' + K + ' ck = (c, n) => { if (c) pass++; };',
    '/* ' + F + ' assert(c, n) { if (!c) fail++; } */',
    'extra.push(s1.length + s2.length);',
  ),
  twoHelpers: lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; };', F + ' check(n, c) { if (!c) { fail++; return; } pass++; }', "ok(check('in', 1) && 2, 'out');", "ok(extra, 'a value');"),
  handsBack: lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; return c; };', "ok(extra.length, 'a statement');", "if (!ok(pass, 'a test')) extra.push('failed');", "ok(1, 'chained') && extra.push('chained');"),
  nestedHands: lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; };', K + ' ck = (c, n) => { if (c) pass++; else fail++; return c; };', "ok(ck(1, 'in') && 2, 'out');"),
  clock: lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; };', 'const t0 = performance.now(); const r = { done: true };', "ok(r.done && performance.now() - t0 >= 0, 'a lower bound in a chain');"),
  vacuous: lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; };', "ok(Promise.resolve(false), 'a promise handed as a verdict');", "ok(() => false, 'a function handed as a verdict');", "ok(/a/.exec('a'), 'a match object');", "ok('ab'.length, 'a length');"),
  opensWithTest: lines(HEAD, K + ' ok = (c, n) => {c ? pass++ : fail++;};', "ok(extra.length, 'a value');", "ok(pass === 0, 'a comparison');"),
};
const LEFT = {
  handed: [lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; };', "[true, 'x'].forEach(ok);", "ok(pass, 'a call');"), /^handed on as a value/],
  exported: [lines('export ' + K + ' ok = (c, n) => { if (c) pass++; };', "ok(1, 'a call');"), /^exported/],
  spread: [lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; };', "ok(...[true, 'by spread']);"), /^a call with no condition argument, or by spread/],
  swapWhole: [lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; };', "ok('a whole name where the condition goes', extra);"), /^a call hands it a string where the condition goes/],
  swapJoined: [lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; };', "ok('a name' + ' where the condition goes', extra);"), /^a call hands it a string where the condition goes/],
  defaulted: [lines(HEAD, K + ' ok = (n, c = false) => { if (c) pass++; else fail++; };', "ok('a call', 1);"), /^its condition parameter is destructured, defaulted or a rest/],
  valueUse: [lines(HEAD, K + ' ok = (c, n) => { if (c === true) pass++; else fail++; };', "ok(1, 'a one is no true');"), /^it uses its condition as more than true or false/],
  handsRead: [lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; return c; };', "extra.push(ok(3, 'its value is read'));"), /^it hands its condition back, and a call reads the value/],
  namedExpr: [lines(HEAD, K + ' ok = ' + F + ' ok(c, n) { if (c) pass++; else fail++; };', "ok(5, 'through the outer binding');"), /^a named function expression/],
  twice: [lines(HEAD, V + ' ok = (c, n) => { if (c) pass++; else fail++; };', '{ ' + V + " ok = (n, c) => { if (c) pass++; else fail++; }; }", "ok('x', 1);"), /^its name is declared twice in one scope/],
  evalFile: [lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; };', 'eval("ok(1, \'x\')");'), /^the file holds a direct eval/],
  nameCond: [lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; };', "const label = 'x';", 'ok(label, 1 === 1);'), /^a call holds a condition in its NAME slot/],
  argumentsUse: [lines(HEAD, F + ' check(n, c) { if (!c) fail++; else pass++; extra.push(arguments[1]); }', "check('a value', 3);"), /^it uses its condition as more than true or false/],
  collision: [lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; };', 'const verdictOf = (x) => x;', "ok(verdictOf(1), 'its own');", "ok(2, 'a value');"), /^the file already names another verdictOf/],
  nestedInName: [lines(HEAD, K + ' ok = (c, n) => { if (c) pass++; else fail++; };', "ok(1, 'outer ' + ok(2, 'inner'));"), /^a call of it stands inside another call's NAME argument/],
};
const RUNNABLE = ['arrowBlock', 'functionNameFirst', 'arrowExpression', 'scope', 'plants', 'opensWithTest', 'twoHelpers', 'handsBack', 'nestedHands', 'clock'];
const NAME_SLOT = { ok: 1, check: 0, ck: 1, leg: 0 };
const LATER = (applied) => applied + '\n' + lines(K + ' check = (c, n) => { if (!c) fail++; else pass++; };', "check(pass, 'a new helper at a later tip');");
// a fixture run: its tally (or why it threw) — the fixtures are this file's own texts
const IMPORT_RE = /[ ;]import \{ verdictOf \} from '\.\/(?:lib\/)?check\.mjs';/;
const run = (text) => {
  const t = text.replace(IMPORT_RE, ''), own = /\b(?:const|let|var|function) verdictOf\b/.test(t);   // a fixture with its own verdictOf keeps it
  try { return JSON.stringify(new Function(...(own ? [] : ['verdictOf']), t + '\nreturn { pass, fail, extra };')(...(own ? [] : [C.verdictOf]))); } catch (e) { return 'THREW ' + String((e && e.message) || e).slice(0, 140); }
};
const nl = (s) => s.split('\n').length;
const callsOf = (text) => { const out = [], ast = acorn.parse(text, G0.PARSE_OPTS); const v = (n) => { if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name in NAME_SLOT) out.push(n); for (const k in n) { const x = n[k]; if (x && typeof x === 'object' && k !== 'loc') (Array.isArray(x) ? x : [x]).forEach((y) => y && typeof y.type === 'string' && v(y)); } }; v(ast); return out.sort((a, b) => a.start - b.start); };

// ── every guarantee as a verdict over a tool module (the real one, then each mutant) ──────────────────────────────────────
function verdicts(G, only = null) {
  const V = {}, say = {}, plan = (t) => G.planFile(t, { C, acorn }), edit = (t) => { const p = plan(t); return { p, o: G.applyEdits(t, p.edits) }; };
  const judge = (key, fn) => { if (only && only !== key) return; try { const r = fn(); V[key] = r === true; if (typeof r === 'string') say[key] = r; } catch (e) { V[key] = false; say[key] = 'THREW ' + String(e.message).slice(0, 160); } };
  const R = {}; for (const k of Object.keys(FIX)) R[k] = edit(FIX[k]);
  const at = (k, n) => R[k].o.split('\n')[n - 1].replace(IMPORT_RE, '');   // a line as read, the coercion's import aside (its own leg)
  judge('applied', () => {
    const want = [
      [at('arrowBlock', 2), K + " ok = (c, n) => { " + G0.guardText('ok', 'c') + ' if (c) pass++; else fail++; };'],
      [at('arrowBlock', 4), "ok(v.a === 1, 'a comparison');"], [at('arrowBlock', 5), "ok(!v.none, 'a negation');"],
      [at('arrowBlock', 8), "ok(true, `a template name ${v.a}`);"], [at('arrowBlock', 10), "ok(verdictOf(v.a), 'a property');"],
      [at('arrowBlock', 13), "ok(verdictOf(v.s) && verdictOf(v.a), 'an and of values');"], [at('arrowBlock', 14), "ok(verdictOf(v.none ?? v.z), 'a nullish (fails)');"], [at('arrowBlock', 15), "ok(v.a ? verdictOf(v.s) : verdictOf(0), 'a ternary of values');"], [at('arrowBlock', 16), 'ok(verdictOf(v.list'], [at('arrowBlock', 18), "  .find((x) => x > 3)), 'a call over three lines');"],
      [at('functionNameFirst', 3), F + ' check(n, c) { ' + G0.guardText('check', 'c') + ' if (!c) { fail++; return; } pass++; }'],
      [at('functionNameFirst', 5), "check('a regex test', verdictOf(/a/.test('a')));"], [at('functionNameFirst', 7), "for (const x of [1, 0]) check('a loop value ' + x, verdictOf(x));"],
      [at('arrowExpression', 2), K + ' ck = (c, n) => { ' + G0.guardText('ck', 'c') + ' return (c ? pass++ : fail++); };'],
      [at('arrowExpression', 3), K + ' leg = (n, c) => { ' + G0.guardText('leg', 'c') + ' return ((c ? (pass++, true) : (fail++, false))); };'],
      [at('twoHelpers', 4), "ok(verdictOf(check('in', verdictOf(1))) && verdictOf(2), 'out');"], [at('clock', 4), "ok(verdictOf(r.done) && performance.now() - t0 >= 0, 'a lower bound in a chain');"],
      [at('handsBack', 4), "if (!ok(verdictOf(pass), 'a test')) extra.push('failed');"],
      [at('scope', 3), F + " inner(ok) { return ok(5, 'not ours: a parameter'); }"], [at('scope', 5), '{ ' + K + ' ok = (a, b) => a * b; extra.push(ok(6, 7)); }'], [at('scope', 6), "ok(verdictOf(pass + 1), 'ours');"],
    ];
    // the coercion's import: once, on the LAST line of every fixture with a wrap (no line moves); none where nothing is wrapped
    const imp = Object.keys(R).filter((k) => R[k].p.edits.some((e) => e.kind === 'wrap-open')), noWrap = Object.keys(R).filter((k) => !imp.includes(k));
    const lastOk = imp.every((k) => { const ls = R[k].o.split('\n'); return (R[k].o.match(new RegExp(IMPORT_RE.source, 'g')) || []).length === 1 && IMPORT_RE.test(ls[ls.length - 1]); }) && noWrap.every((k) => !IMPORT_RE.test(R[k].o));
    want.push([String(lastOk), 'true']);
    want.push([R.functionNameFirst.o.split('\n')[6].slice(-50), "x, verdictOf(x)); import { verdictOf } from './lib/check.mjs';".slice(-50)]);
    const bad = want.filter(([got, w]) => got !== w);
    const shapes = JSON.stringify([R.arrowBlock.p, R.functionNameFirst.p, R.arrowExpression.p, R.scope.p].map((p) => [p.guards.map((g) => g.shape).join('+'), p.calls.wrapped, p.calls.boolean]));
    say.applied = `the edited lines read as written, ${want.length} of them; [shape, wrapped, boolean] by fixture ${shapes}${bad.length ? ' — OFF: ' + bad.map(([g, w]) => `«${String(g).slice(0, 90)}» ≠ «${w.slice(0, 90)}»`).join(' | ') : ''}`;
    return !bad.length && shapes === JSON.stringify([['arrow-block', 9, 5], ['function', 4, 1], ['arrow-expression+arrow-expression', 3, 1], ['arrow-block', 1, 0]]);
  });
  judge('lines', () => { const moved = Object.keys(R).filter((k) => nl(R[k].o) !== nl(FIX[k])); say.lines = `every fixture keeps its line count${moved.length ? ' — MOVED: ' + moved.map((k) => `${k} ${nl(FIX[k])} → ${nl(R[k].o)}`).join(', ') : ''}`; return moved.length === 0 && R.arrowBlock.p.edits.length > 0; });
  judge('names', () => {
    const off = [];
    for (const k of RUNNABLE) {
      const a = callsOf(FIX[k]), b = callsOf(R[k].o);
      if (a.length !== b.length) { off.push(`${k}: ${a.length} calls → ${b.length}`); continue; }
      a.forEach((c, i) => { const s = NAME_SLOT[c.callee.name], x = c.arguments[s], y = b[i].arguments[s]; const tx = x ? FIX[k].slice(x.start, x.end) : null, ty = y ? R[k].o.slice(y.start, y.end) : null; if (tx !== ty) off.push(`${k}: «${tx}» → «${ty}»`); });
    }
    say.names = `every call's NAME argument reads back byte-identical from the new text's own parse${off.length ? ' — CHANGED: ' + off.slice(0, 3).join(' | ') : ''}`;
    return off.length === 0;
  });
  judge('literal', () => {
    const lit = Object.keys(R).filter((k) => /verdictOf\(\s*['"`]/.test(R[k].o));
    const swaps = ['swapWhole', 'swapJoined'].map((k) => { const p = plan(LEFT[k][0]); return p.edits.length === 0 && p.left.length === 1 && LEFT[k][1].test(p.left[0].why); });
    say.literal = `no condition shaped as a string is wrapped; a whole and a joined string where the condition goes leave their helper by name (${swaps.join(', ')})${lit.length ? ' — WRAPPED in ' + lit.join(', ') : ''}`;
    return lit.length === 0 && swaps.every(Boolean);
  });
  judge('plants', () => {
    const p = R.plants.p, kept = [20, 21].every((n) => at('arrowBlock', n) === FIX.arrowBlock.split('\n')[n - 1]);
    say.plants = `the census reads ${C.helperDefs(FIX.plants).length} helpers in the plants' text; the tool: ${p.plants.length} plants (${p.plants.map((x) => x.name).join(', ')}), ${p.left.length} left, ${p.edits.length} edits; a call in a comment and in a string kept: ${kept}`;
    return p.plants.length === 4 && p.left.length === 0 && p.edits.length === 0 && R.plants.o === FIX.plants && kept;
  });
  judge('inside', () => {
    const src = FIX.arrowBlock, i = src.indexOf('a call in a string') + 2;
    const chk = G.selfCheck(src, src.slice(0, i) + 'x' + src.slice(i), { edits: [{ at: i, len: 0, text: 'x', kind: 'guard' }], guards: [], checks: [], code: G0.readCode(src, acorn) }, { C, acorn });
    say.inside = `an edit planted inside a string is refused by the self-check: ${chk.ok ? 'PASSED IT' : chk.why.join('; ').slice(0, 140)}`;
    return !chk.ok && chk.why.some((w) => /inside a string/.test(w));
  });
  judge('selfCheck', () => {
    const r = Object.keys(R).map((k) => [k, G.selfCheck(FIX[k], R[k].o, R[k].p, { C, acorn, W })]), bad = r.filter(([, c]) => !c.ok);
    const notes = r.filter(([, c]) => c.notes && c.notes.length).map(([k, c]) => `${k}: ${c.notes.join('; ')}`);
    const src = FIX.arrowBlock, s0 = src.indexOf("'a name' + ' in two pieces'"), s1 = s0 + "'a name'".length, p = R.arrowBlock.p;
    const lied = { ...p, edits: [...p.edits, { at: s0, len: 0, text: '!!(', kind: 'wrap-open', pair: s1 }, { at: s1, len: 0, text: ')', kind: 'wrap-close', pair: s0 }] };
    const named = G.selfCheck(src, G.applyEdits(src, lied.edits), lied, { C, acorn, W });
    say.selfCheck = `the self-check passes every fixture it may write; it refuses a wrap planted in a NAME argument (${named.ok ? 'PASSED IT' : named.why.filter((w) => /NAME/.test(w)).join('; ').slice(0, 90)}); a guarded helper whose order the census no longer reads is said: ${notes.join(' | ').slice(0, 160) || 'NOT SAID'}${bad.length ? ' — OFF: ' + bad.map(([k, c]) => `${k}: ${c.why.join('; ').slice(0, 100)}`).join(' | ') : ''}`;
    return bad.length === 0 && !named.ok && named.why.some((w) => /an edit inside a NAME argument/.test(w)) && notes.length === 1 && /^opensWithTest: the census no longer reads the order of ok at line 2/.test(notes[0]) && C.helperDefs(R.opensWithTest.o)[0].order === 'unknown';
  });
  judge('twice', () => {
    const again = [...Object.keys(R).map((k) => [k, R[k].o]), ...Object.entries(LEFT).map(([k, [t]]) => [k, G.applyEdits(t, plan(t).edits)])].map(([k, t]) => [k, plan(t)]).filter(([, p]) => p.edits.length);
    say.twice = `a second run over every edited text plans nothing${again.length ? ' — AGAIN: ' + again.map(([k, p]) => `${k} ${p.guards.length} guards ${p.wraps.length} wraps`).join(', ') : ''}`;
    return again.length === 0;
  });
  judge('later', () => {
    const p = plan(LATER(R.arrowBlock.o));
    say.later = `at a later tip (the applied text + one new helper) it guards ${p.guards.map((g) => g.name).join(', ') || 'nothing'} and wraps ${p.wraps.map((w) => w.name + '(' + w.cond + ')').join(', ') || 'nothing'}`;
    return p.guards.length === 1 && p.guards[0].name === 'check' && p.wraps.length === 1 && p.wraps[0].cond === 'pass';
  });
  judge('behaviour', () => {
    const off = RUNNABLE.filter((k) => run(FIX[k]) !== run(R[k].o) || /^THREW/.test(run(R[k].o)));   // (the vacuous fixture: its own leg)
    const swapped = '\nok(\'a swapped name\', v.a);', before = run(FIX.arrowBlock + swapped), after = run(R.arrowBlock.o + swapped);
    say.behaviour = `each fixture's tally is the same before and after (${run(R.arrowBlock.o)} · ${run(R.arrowExpression.o)} · ${run(R.scope.o)}); a swapped call passed before (${before.slice(0, 40)}) and THROWS after (${after.slice(0, 90)})${off.length ? ' — DIFFERS: ' + off.map((k) => `${k} ${run(FIX[k])} → ${run(R[k].o)}`).join(' | ') : ''}`;
    return off.length === 0 && /"pass":/.test(before) && /^THREW ok: its condition is a string, not a boolean/.test(after);
  });
  judge('left', () => {
    const r = Object.entries(LEFT).map(([k, [t, why]]) => { const p = plan(t); return [k, p.edits.length === 0 && p.left.length >= 1 && p.left.every((x) => why.test(x.why)), p.left.length ? p.left.map((x) => x.why).join(' / ') : 'NOT LEFT']; });
    const asBefore = ['handed', 'valueUse', 'handsRead', 'namedExpr', 'nameCond', 'nestedInName', 'argumentsUse', 'collision'].filter((k) => run(LEFT[k][0]) !== run(G.applyEdits(LEFT[k][0], plan(LEFT[k][0]).edits)));
    say.left = `each helper the guard could make throw, or a wrap change, is LEFT by name: ${r.map(([k, y, w]) => `${k} ${y ? '✓' : '✗ ' + w.slice(0, 70)}`).join(' · ')}; they run as before${asBefore.length ? ' — NOT: ' + asBefore.join(', ') : ''}`;
    return r.every(([, y]) => y) && asBefore.length === 0;
  });
  judge('scope', () => {
    const p = R.scope.p, same = run(FIX.scope) === run(R.scope.o);
    say.scope = `a parameter and an inner block named like the helper bind other functions: ${p.wraps.length} wrap (${p.wraps.map((w) => w.cond).join(', ')}), the run the same: ${run(R.scope.o)}`;
    return p.wraps.length === 1 && p.wraps[0].cond === 'pass + 1' && same && run(R.scope.o).includes('[26,42]');
  });
  judge('vacuous', () => {
    // THE ROW'S OWN CLASS STAYS VISIBLE (r1347): a promise or a function handed as a verdict passed before; once wrapped it FAILS,
    // red by name (a line naming the kind), while a match object and a length pass as before
    const said = [], err0 = console.error;
    console.error = (...a) => { said.push(a.join(' ')); };
    let was, now;
    try { was = run(FIX.vacuous); now = run(R.vacuous.o); } finally { console.error = err0; }
    const kinds = ['a promise handed as a verdict', 'a function handed as a verdict'].map((k) => said.some((l) => l.includes(k)));
    say.vacuous = `before ${was} → after ${now}; said: ${said.map((l) => l.trim().slice(0, 90)).join(' | ') || 'NOTHING'}`;
    return was === JSON.stringify({ pass: 4, fail: 0, extra: [] }) && now === JSON.stringify({ pass: 2, fail: 2, extra: [] }) && kinds.every(Boolean);
  });
  judge('clock', () => {
    const read = (t) => JSON.stringify(W.wallClockFindings(t, { fields: W.productSpanFields(t) }).map((f) => [f.line, f.kind, f.boundMs]));
    const was = read(FIX.clock), now = read(R.clock.o), chk = G.selfCheck(FIX.clock, R.clock.o, R.clock.p, { C, acorn, W });
    say.clock = `the wall-clock census reads the bound in a wrapped && chain the same before and after: ${was} → ${now}; the self-check with it: ${chk.ok ? 'green' : chk.why.join('; ').slice(0, 120)}`;
    return was !== '[]' && was === now && chk.ok;
  });
  return { V, say };
}

// ⑨ the run over a scratch repo
const TREE_FILES = { 'scripts/a.mjs': FIX.arrowBlock, 'scripts/b.mjs': LEFT.handed[0], 'scripts/c.mjs': FIX.plants, 'scripts/e.mjs': LEFT.spread[0], 'scripts/lib/d.mjs': FIX.arrowExpression };
const TREE_LISTED = { 'a.mjs': 1, 'b.mjs': 1, 'c.mjs': 4, 'gone.mjs': 1, 'lib/d.mjs': 2 };
function scratchRepo(name) {
  const dir = scratch(name), w = (rel, t) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), t); };
  w('scripts/lib/check.mjs', fs.readFileSync(path.join(REPO, 'scripts', 'lib', 'check.mjs'), 'utf8'));
  w('package.json', '{ "name": "guard-inline-fixture", "private": true }\n');
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));
  for (const [rel, t] of Object.entries(TREE_FILES)) w(rel, t);
  w('scripts/fixtures/unguarded-helpers.json', JSON.stringify({ '//': 'a fixture list', files: TREE_LISTED }, null, 1) + '\n');
  return { dir, read: (rel) => fs.readFileSync(path.join(dir, rel), 'utf8') };
}
// a temp write that fails at the second file: NOTHING may change (every file as it was, no temp left, the list as it was)
async function treeFault(G, name) {
  const { dir, read } = scratchRepo(name), logs = [];
  let n = 0;
  const io = { writeFile: (p, t) => { if (/\.guard-tmp$/.test(p) && ++n === 2) throw Object.assign(new Error('ENOSPC: a planted full disk'), { code: 'ENOSPC' }); fs.writeFileSync(p, t); }, rename: (a, b) => fs.renameSync(a, b), unlink: (p) => fs.unlinkSync(p) };
  const T = await G.runTree(dir, { apply: true, log: (l) => logs.push(l), io });
  const same = Object.entries(TREE_FILES).every(([rel, t]) => read(rel) === t) && JSON.stringify(JSON.parse(read('scripts/fixtures/unguarded-helpers.json')).files) === JSON.stringify(TREE_LISTED);
  const temps = [];
  const walkDir = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules') continue; const q = path.join(d, e.name); if (e.isDirectory()) walkDir(q); else if (/\.guard-tmp$/.test(e.name)) temps.push(e.name); } };
  walkDir(path.join(dir, 'scripts'));
  const said = logs.find((l) => /APPLY/.test(l)) || '';
  return { verdict: same && temps.length === 0 && /APPLY FAILED: a temp could not be written \(ENOSPC\)[^]*NOTHING CHANGED/.test(said) && T.written === false, say: `${said.slice(0, 160)} · every file as it was: ${same} · temps left: ${temps.length}` };
}
async function treeRun(G, name) {
  const { dir, read } = scratchRepo(name), files = TREE_FILES, listed = TREE_LISTED, logs = [[], [], []];
  const dry = await G.runTree(dir, { log: (l) => logs[0].push(l) });
  const dryKept = Object.entries(files).every(([rel, t]) => read(rel) === t) && JSON.parse(read('scripts/fixtures/unguarded-helpers.json')).files['a.mjs'] === 1;
  const applied = await G.runTree(dir, { apply: true, log: (l) => logs[1].push(l) });
  const wrote = read('scripts/a.mjs') !== files['scripts/a.mjs'] && read('scripts/lib/d.mjs') !== files['scripts/lib/d.mjs'] && read('scripts/b.mjs') === files['scripts/b.mjs'];
  const list = JSON.parse(read('scripts/fixtures/unguarded-helpers.json'));
  const again = await G.runTree(dir, { log: (l) => logs[2].push(l) });
  const want = { 'b.mjs': 1, 'c.mjs': 4 };
  const verdict = dry.guards === 3 && dryKept && applied.guards === 3 && wrote && JSON.stringify(list.files) === JSON.stringify(want) && list['//'] === 'a fixture list'
    && again.edited === 0 && logs[2].some((l) => /NOTHING TO DO/.test(l)) && logs[2].some((l) => /no row falls/.test(l));
  return { verdict, say: `dry run: ${dry.guards} guards, nothing written (${dryKept}) · apply: ${applied.guards} guards, written (${wrote}), the list ${JSON.stringify(listed)} → ${JSON.stringify(list.files)} (gone and guarded rows fall; e.mjs's unlisted helper is not added) · again: ${again.edited} files — «${(logs[2].find((l) => /NOTHING|guards \d/.test(l)) || '').trim().slice(0, 70)}»`, logs };
}

console.log('\n①–⑧ the guarantees, on the fixtures (the real tool)');
const real = verdicts(G0);
const LEG_NAMES = {
  applied: '① the edit applied: guard on the opening line, !!( … ) where the condition is not a boolean by its operator',
  lines: '② no line moves', names: '③ a name argument is byte-identical', literal: '④ a whole string is never wrapped',
  plants: '⑤ a helper spelled in a string, a template or a comment is a plant — told apart, never edited', inside: '⑤ an edit point inside a string is refused by the self-check',
  selfCheck: '⑤ the self-check: green on what it may write, red on a call nested in a name', twice: '⑥ run twice = run once', later: '⑥ a later tip: only what is new',
  behaviour: '⑦ it passes exactly when it passed before; a swap now throws', left: '⑧ left by rule, by name', scope: '⑧ scope by scope: a parameter or an inner binding is another function',
  clock: '⑦ a comparison stays outside every wrap: the wall-clock census reads a bound the same (with the product\'s span fields)',
  vacuous: '⑦ THE ROW\'S CLASS STAYS VISIBLE: a promise or a function handed as a verdict now fails, red by name; a match and a length pass as before',
};
for (const [k, label] of Object.entries(LEG_NAMES)) ok(real.V[k] === true, label, real.say[k] || '');
for (const k of ['applied', 'behaviour', 'later', 'plants', 'vacuous']) console.log(`    ${k}: ${String(real.say[k]).slice(0, 400)}`);

console.log('\n②–⑧ RED CONTROLS: each guarantee\'s leg goes red on a tool that breaks it');
const REDS = [
  ['lines', 'a guard on its own line', "text: ` ${guard}`, kind: 'guard'", "text: `\\n${guard}`, kind: 'guard'"],
  ['names', 'the wrap on the name slot', 'const a = c.node.arguments, cond = a[slot], ws = wrapsOf(cond);', 'const a = c.node.arguments, cond = a[nameSlot], ws = wrapsOf(cond);'],
  ['literal', 'the string-shaped refusal out', 'if (swap) { leave(', 'if (false) { leave('],
  ['plants', 'the tokenizer filter out', 'for (const d of judged) if (code.inside(d.at)) res.plants.push(', 'for (const d of judged) if (false) res.plants.push('],
  ['inside', "the self-check's span test out", 'if (code.ok) for (const e of es) if (code.inside(e.at))', 'if (false) for (const e of es) if (code.inside(e.at))'],
  ['twice', 'a guard the census cannot read (the value-use rule out too: it would leave such a helper, not guard it again)', "${condP} !== 'boolean') throw new TypeError(", "${condP} !== 'boolean') console.error(", VALUE_RULE_OUT],
  ['later', 'targets that ignore «guarded» (the value-use rule out too: the guard\'s own typeof would leave the old helper)', "const judged = C.helperDefs(src).filter((d) => d.order !== 'unknown' && !d.guarded);", "const judged = C.helperDefs(src).filter((d) => d.order !== 'unknown');", VALUE_RULE_OUT],
  ['behaviour', '`!(` for the coercion', "text: `${VERDICT}(`, kind: 'wrap-open'", "text: '!(', kind: 'wrap-open'"],
  ['vacuous', 'a plain `!!(` for the coercion (every vacuous leg invisible)', "text: `${VERDICT}(`, kind: 'wrap-open'", "text: '!!(', kind: 'wrap-open'"],
  ['left', 'the arguments rule out', "else if (n.name === 'arguments' && ownArgs) seen(n, 'value');", ''],
  ['behaviour', 'an expression block without its return', 'text: `{ ${guard} return (`', 'text: `{ ${guard} (`'],
  ['left', 'the handed-on rule out', 'if (handed) { leave(', 'if (false) { leave('],
  ['scope', 'calls read by name, not by binding', 'const mine = B.calls.filter((c) => c.bind === b.id);', 'const mine = B.calls.filter((c) => c.node.callee.name === d.name);'],
  ['left', 'the value-use rule out', 'if (u.value) { out.set(t,', 'if (false) { out.set(t,'],
  ['left', 'the hands-back rule out', 'if (u.hands) { const read =', 'if (false) { const read ='],
  ['twice', 'the guarded set left out of the body rules', "callPos(c.node, parents(), wrapped) === 'value'", "callPos(c.node, parents(), null) === 'value'"],
  ['clock', 'the whole && chain wrapped', "if (n.type === 'LogicalExpression' && n.operator !== '??') return [...wrapsOf(n.left), ...wrapsOf(n.right)];", 'if (false) return [];'],
];
const mutants = {};
for (const [key, what, anchor, to, more] of REDS) {
  const tag = `red-${key}-${Object.keys(mutants).length}`, M = mutants[tag] = await mutant(tag, [anchor, to], ...(more ? [more] : [])), r = verdicts(M, key);
  ok(r.V[key] === false, `RED «${what}»: the leg «${LEG_NAMES[key]}» goes red`, r.say[key] || '');
  console.log(`    ${what}: ${String(r.say[key]).slice(0, 220)}`);
}

console.log('\n⑨ the run over a tree (a scratch repo)');
const tr = await treeRun(G0, 'guard-inline-repo');
ok(tr.verdict, '⑨ the dry run writes nothing; the apply writes and lowers the one-way list; a second run says NOTHING TO DO', tr.say);
console.log('    ' + tr.say);
const tf = await treeFault(G0, 'guard-inline-repo-fault');
ok(tf.verdict, '⑨ ALL OR NOTHING ON DISK: a temp write that fails at the second file changes nothing, leaves no temp, and is said', tf.say);
console.log('    ' + tf.say);
const tfRed = await treeFault(await mutant('red-direct-write', ["io.writeFile(p + '.guard-tmp', out); made.push(p);", "io.writeFile(p, out); made.push(p);"]), 'guard-inline-repo-fault-red');
ok(tfRed.verdict === false, 'RED «each file written in place, no temp first»: a failure at the second file leaves the first one changed', tfRed.say);
const trRed = await treeRun(mutants['red-twice-5'], 'guard-inline-repo-red');
ok(trRed.verdict === false, 'RED «a guard the census cannot read»: the tree run is refused or runs again', `${trRed.say} — ${trRed.logs[1].find((l) => /APPLY|APPLIED/.test(l)) || ''}`);
console.log('    ' + (trRed.logs[1].find((l) => /APPLY|APPLIED/.test(l)) || '').slice(0, 160));

console.log('\n⑩ the CLI');
const cli = [[['--apply'], true], [['--apply', '--coordinator-word'], false], [[], false], [['--list', '/some/repo'], false], [['--aply'], true]].map(([a, refused]) => [a.join(' ') || '(none)', !!G0.cliRefusal(a) === refused]);
ok(cli.every(([, y]) => y), '⑩ --apply refuses without --coordinator-word, and an unknown flag refuses; a dry run, --list and the word pass', cli.map(([a, y]) => `${a} ${y ? '✓' : '✗'}`).join(' · '));

report();
