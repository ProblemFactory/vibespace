// THE ONE ASSERTION HELPER (B-1747, lane bl-tests-e, 2026-11-17). Found 2026-11-10 in lane fable-52-cli-321 r5: thirteen
// new legs of test-status-bar-chips called ok(name, condition) against a helper defined ok(condition, name) — a non-empty
// string is truthy, so the suite read ALL PASS (67) and four census plants stayed green. Both orders live in the tree
// (about 700 condition-first helpers, about 300 name-first), each suite with its own copy, none refusing the swap. On the
// release this lane started from the sweep below found EIGHT such legs in four suites (test-record-shape, test-queue-steer,
// test-voice-follow-chrome, test-path-field-chrome) — a throwing browser leg among them that passed.
//
//   checker()            → { ok, report, counts } — ok(cond, name, detail): the condition FIRST, a BOOLEAN (a value is
//                          written !!x or x === y); the name a non-empty string. Anything else THROWS: a swap is a crash
//                          with a stack, never a green leg. Prints «  ✓ name» / «  ✗ name — detail» (the lines the gate's
//                          red-names-its-legs rule reads); report() prints «ALL PASS (n)» or «n FAILED (m passed)» and exits.
//   helperDefs(src)      → every inline helper of HELPER_NAMES a file defines: its parameter order (which parameter the body
//                          tests) and whether it guards the swap (typeof of its condition ≠ 'boolean' or of its name ≠
//                          'string' throws).
//   swappedCalls(src)    → every call of a file's own helper whose CONDITION slot is one whole string literal while its name
//                          slot is not — the vacuous leg, read by the order of the nearest definition above the call (a
//                          block-scoped twin of another order is not told apart: no file has one; a call quoted in a
//                          whole-line comment is skipped).
//   verdictOf(value)     → the GUARDED COERCION the guard tool (scripts/guard-inline-helpers.mjs) wraps an existing call's
//                          condition in: a thenable or a function is no verdict — the leg fails, red by name (a line on
//                          stderr names the suite and the kind); any other value coerces as !!value.
//   gateOf(value)        → THE && GATE (r3179): the tool wraps an && operand that is not the last in it — true / false by
//                          truthiness, never a red (a present function there is an existence check); a promise is counted
//                          and noted once per call site, at the moment, on stderr («NOTE … a promise handed as an && gate at
//                          <file:line>»), never a ✗ — never after the suite's closing line.
// test-ci-gate-tiers §7b runs both over every script: no swapped call anywhere, and the inline helpers without the guard
// only ever fall (a new suite imports this file). PURE: no I/O beyond the console in checker(), verdictOf() and gateOf().

export function checker({ log = (l) => console.log(l), err = (l) => console.error(l), exit = (c) => process.exit(c), whole = false } = {}) {
  const counts = { pass: 0, fail: 0, failed: [] };
  const ok = (cond, name, detail) => {
    if (typeof name !== 'string' || name.length === 0) throw new TypeError(`ok(cond, name): the name is ${name === '' ? 'empty' : 'a ' + typeof name} (${String(name).slice(0, 80)}) — the arguments are swapped, or the leg has no name`);
    if (typeof cond !== 'boolean') throw new TypeError(`ok(cond, name): the condition of «${name.slice(0, 120)}» is a ${cond === null ? 'null' : typeof cond}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs (write !!x or x === y)`);
    if (cond) { counts.pass++; log('  ✓ ' + name); }
    else {
      counts.fail++; counts.failed.push(name);
      const d = detail === undefined ? '' : whole ? wholeDetail(detail) : ' — ' + (typeof detail === 'string' ? detail : safeJson(detail)).slice(0, 800);
      err('  ✗ ' + name + d);
    }
    return cond;
  };
  const report = () => { log(counts.fail ? `\n${counts.fail} FAILED (${counts.pass} passed)` : `\nALL PASS (${counts.pass})`); return exit(counts.fail ? 1 : 0); };
  return { ok, report, counts };
}
const safeJson = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };
/** A FAILING LINE's LIST IS PRINTED WHOLE (主开发 r3928, the law of r3874 (2)): a reader of a red counts its items. A list detail is
 *  printed as its count, then ONE ITEM A LINE under the ✗ line, uncut; any other detail whole (no cut). A census opts in with
 *  checker({ whole: true }), or its own ok appends this. The default checker() keeps its one-line 800-character form. → the text
 *  that follows the ✗ line's name */
export function wholeDetail(detail) {
  if (Array.isArray(detail)) return ` — ${detail.length} item(s):` + detail.map((x, k) => `\n      ${k + 1}. ${typeof x === 'string' ? x : safeJson(x)}`).join('');
  return ' — ' + (typeof detail === 'string' ? detail : safeJson(detail));
}

// THE GUARDED COERCION (B-1747 part 2, the coordinator's r1347): scripts/guard-inline-helpers.mjs wraps an EXISTING call's
// condition in it wherever that condition is no boolean by its operator — never a plain `!!( … )`, which would make a vacuous
// leg invisible for good. A THENABLE or a FUNCTION handed as a verdict proves nothing (an un-awaited promise is always
// truthy): the leg FAILS, red by name — this line names the suite and the kind, the helper's own ✗ line names the leg — so
// the first run of the applied tree lists every vacuous leg it held. Any other value coerces exactly as !!value does (a match,
// a length, a string).
// THE FINDS ARE COUNTED (the coordinator's r1385): a vacuous operand can sit beside a real one (`ok(p || x === 1, …)`) and the
// leg still passes, so a list made from red suites would miss it — every find prints its own line AND the process prints its
// total at exit («N vacuous verdict(s)»): the apply's proof reads those lines, never exit codes. A `then` that cannot be read (a
// throwing getter, a revoked Proxy) is no promise: the value coerces as !! did. Any OTHER object whose `then` is a function
// counts as a promise (a query builder, a catch-all mock) — said in the tool's limits.
let vacuousFinds = 0, exitSaid = false;
const VACUOUS_HINT = { 'a promise': 'await it, and compare what it gives', 'a function': 'if the leg asks that it exists, compare typeof x === \'function\'; else call it and compare what it gives' };
export function verdictOf(value) {
  let kind = typeof value === 'function' ? 'a function' : null;
  if (!kind && value !== null && typeof value === 'object') { try { if (typeof value.then === 'function') kind = 'a promise'; } catch { /* an unreadable then: no promise */ } }
  if (!kind) return !!value;
  if (!vacuousFinds++ && !exitSaid) { exitSaid = true; process.once('exit', () => { if (vacuousFinds) console.error(`  ✗ ${suiteName()}: ${vacuousFinds} vacuous verdict(s) — a promise or a function handed as a verdict (B-1747: each counts as false)`); }); }
  console.error(`  ✗ ${suiteName()}: ${kind} handed as a verdict — it counts as false (${VACUOUS_HINT[kind]})`);
  return false;
}
const suiteName = () => String(process.argv[1] || '').split('/').pop();
/** The finds counted so far, and the count cleared — for a suite that plants vacuous verdicts on purpose and reads them. */
export function takeVacuousFinds() { const n = vacuousFinds; vacuousFinds = 0; return n; }
// AN && GATE (B-1747 part 2's apply, the coordinator's r3179): the tool wraps an operand that can BECOME the verdict in verdictOf —
// the last of an && chain, every operand of an ||, each branch of a ?: — and an && operand that is NOT the last in gateOf. A gate's
// truthiness only decides whether the chain goes on (`f && f(1) === 1`: a present function is an existence check, never the
// verdict; a falsy gate makes the verdict false), so gateOf answers true / false by truthiness and is never a red. A PROMISE handed
// as a gate may be a missing await that judges nothing (it is truthy whatever it holds): it is COUNTED, and a NOTE is said ONCE per
// call site, at the moment, on STDERR (r3293 (1): the runner reads a suite's LAST stdout line — its closing count, or a whole-suite
// «SKIP: …» — so a note may never stand after it) — a NOTE, never a ✗; the apply's rehearsal reads those lines.
let promiseGates = 0;
const gateSites = new Set();
const callerOf = (stack) => { const l = String(stack || '').split('\n')[2] || ''; const m = /([^\s(/\\]+):(\d+):\d+\)?\s*$/.exec(l); return m ? `${m[1]}:${m[2]}` : 'an unknown place'; };
export function gateOf(value) {
  if (value !== null && typeof value === 'object') {
    let thenable = false;
    try { thenable = typeof value.then === 'function'; } catch { /* an unreadable then: no promise */ }
    if (thenable) {
      promiseGates++;
      const at = callerOf(new Error().stack);
      if (!gateSites.has(at)) { gateSites.add(at); console.error(`  NOTE ${suiteName()}: a promise handed as an && gate at ${at} — truthy whatever it holds; a missing await there judges nothing (B-1747, never a red)`); }
    }
  }
  return !!value;
}
/** The promise gates counted so far, and the count cleared — for a suite that plants them on purpose and reads them. */
export function takePromiseGates() { const n = promiseGates; promiseGates = 0; return n; }

// ── the census (PURE over a file's text) ──────────────────────────────────────────────────────────────────────────────
// A helper definition = a const / let / var binding of the name to an arrow function of two or more parameters, or a
// function declaration of it. Only the names a suite uses for its pass/fail counter — a richer name (okCli, okBase) is a
// wrapper with its own contract. HELPER_NAMES: ok and check (2.369.408), and since B-1747's remainder (2.369.412) the names
// a shape survey of every script found (a two-parameter helper that tests a parameter as its condition and counts a fail,
// or hands it on): ck (13 helpers, 13 files), leg (65 in 17 files: wrappers handing (c, n) to ok, row-pushers — the 7
// (name, fn) runners also spelled so test no parameter: order unknown, never judged), assert (2); and since B-1747 part 1 (bl-scratch, 2.369.415's list) the pin and failPass FAMILIES: VERDICT_FAMILIES — a
// definition of those names is JUDGED only when its body states a verdict (VERDICT_RE: a pass / fail counter, the exit code,
// a ✓ / ✗ line, or a hand-off to a helper of the census); a pin that builds a row or a failPass that keeps a simulated
// engine's backoff tests a parameter too and is read as `unknown`, never judged — «pin» is too common a word to judge by
// name alone. okc's two hand their pair on to ok, so their order cannot be read. (This comment spells no definition: the
// census reads comments too.)
export const HELPER_NAMES = Object.freeze(['ok', 'check', 'ck', 'leg', 'assert', 'pin', 'failPass']);
/** The families judged only by a verdict in the body (B-1747 part 1): their names name data and simulations as often. */
export const VERDICT_FAMILIES = Object.freeze(['pin', 'failPass']);
export const VERDICT_RE = /\b(?:pass(?:ed|es)?|fail(?:ed|s)?|bad|good)\s*\+\+|\+\+\s*(?:pass|fail)|process\.exitCode\s*=\s*1\b|['"`]\s*[✓✗]|(?<![\w$.])(?:ok|check|ck|leg|assert)\s*\(/;
const NAMES_ALT = HELPER_NAMES.join('|');
const FIND_RE = new RegExp(`\\b(?:${NAMES_ALT})\\b`, 'g'), KW_BEFORE = /(?:^|[^\w$.])(const|let|var|function)\s+$/; // the cheap scan (a keyword-led alternation over 60 MB costs 3×); DEF_RE then reads each hit in place
const DEF_RE = new RegExp(`(?:(?:const|let|var)\\s+(${NAMES_ALT})\\s*=\\s*(?:async\\s*)?\\(\\s*([A-Za-z_$][\\w$]*)\\s*,\\s*([A-Za-z_$][\\w$]*)[^)]*\\)\\s*=>|function\\s+(${NAMES_ALT})\\s*\\(\\s*([A-Za-z_$][\\w$]*)\\s*,\\s*([A-Za-z_$][\\w$]*))`, 'y');
const tests = (p, body) => new RegExp(`if\\s*\\(\\s*!?\\s*${p}\\s*[)&|]|\\(\\s*!?${p}\\s*\\?|=>\\s*\\{?\\s*!?${p}\\s*\\?|!${p}\\b|[(,=]\\s*${p}\\s*\\?\\s*['"\`(]|\\b${p}\\s*(?:===?|!==?)\\s*(?:true|false)\\b|if\\s*\\(\\s*!?\\s*${p}\\s*\\)`).test(body);
const lineOf = (src, i) => src.slice(0, i).split('\n').length;
// A definition's text: its own line, then every line indented deeper than it (a closing `}` / `)` at its own depth
// included), at most 40 lines — never the code after it (a later `!n` would read as the body's test).
function defBody(src, at) {
  const ls = src.lastIndexOf('\n', at) + 1, lines = src.slice(ls, ls + 12000).split('\n', 41), ind = (l) => l.match(/^\s*/)[0].length;
  const own = ind(lines[0]), out = [lines[0]];
  for (let k = 1; k < Math.min(lines.length, 40); k++) {
    const l = lines[k];
    if (!l.trim() || ind(l) > own) { out.push(l); continue; }
    if (ind(l) === own && /^\s*[})\]]/.test(l)) out.push(l);
    break;
  }
  return out.join('\n').slice(at - ls);
}

export function helperDefs(src) {
  const out = [];
  for (const f of src.matchAll(FIND_RE)) {
    const kw = KW_BEFORE.exec(src.slice(Math.max(0, f.index - 16), f.index));
    if (!kw) continue;
    DEF_RE.lastIndex = f.index - kw[0].length + (kw[0].length - kw[0].replace(/^[^\w$]/, '').length);
    const m = DEF_RE.exec(src);
    if (!m) continue;
    const name = m[1] || m[4], a = m[2] || m[5], b = m[3] || m[6];
    const at = m.index + m[0].indexOf(name, m[0].search(/const|let|var|function/));
    const body = defBody(src, at);
    const ta = tests(a, body), tb = tests(b, body);
    const order = VERDICT_FAMILIES.includes(name) && !VERDICT_RE.test(body) ? 'unknown' : ta && !tb ? 'cond-first' : tb && !ta ? 'name-first' : 'unknown';
    const condP = order === 'cond-first' ? a : order === 'name-first' ? b : null, nameP = order === 'cond-first' ? b : order === 'name-first' ? a : null;
    const refuses = (p, t) => new RegExp(`typeof\\s+${p}\\s*!==?\\s*['"]${t}['"][^)]*\\)\\s*\\{?\\s*(?:throw\\b|fail(?:ed)?\\s*\\+\\+|\\+\\+\\s*fail)`).test(body);
    const guarded = !!condP && (refuses(condP, 'boolean') || refuses(nameP, 'string'));
    out.push({ name, at, line: lineOf(src, at), order, guarded, params: [a, b] });
  }
  return out;
}

// The top-level arguments of a call whose `(` sits just before `i`: string, template (with ${…}), regex and comment aware —
// enough to find where argument 1 ends. Returns the first `max` argument texts (trimmed), or null when the scan runs off.
export function callArgs(src, i, max = 2) {
  const out = []; let start = i, depth = 0, prev = '(';
  const REGEX_AFTER = /[(,=:[!&|?{};+\-*%<>~^]/, KW = /(?:^|[^\w$])(?:return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await)\s*$/;
  const regexAt = (k, p) => REGEX_AFTER.test(p) || (/[a-z]/.test(p) && KW.test(src.slice(Math.max(0, k - 12), k)));
  const end = Math.min(src.length, i + 20000);
  const skipQuoted = (k, q) => { for (k++; k < end; k++) { if (src[k] === '\\') { k++; continue; } if (src[k] === q || (src[k] === '\n' && q !== '`')) return k; if (q === '`' && src[k] === '$' && src[k + 1] === '{') { k = skipExpr(k + 2); if (k < 0) return -1; } } return -1; };
  const skipRegex = (k) => { let cls = false; for (k++; k < end; k++) { const c = src[k]; if (c === '\\') { k++; continue; } if (c === '\n') return -1; if (cls) { if (c === ']') cls = false; continue; } if (c === '[') cls = true; else if (c === '/') { while (/[a-z]/i.test(src[k + 1] || '')) k++; return k; } } return -1; };
  // scans an expression up to its closing `}` (a template's ${…}); returns the index of that brace
  function skipExpr(k) { let d = 0, p = '{'; for (; k < end; k++) { const c = src[k]; if (/\s/.test(c)) continue; if (c === "'" || c === '"' || c === '`') { k = skipQuoted(k, c); if (k < 0) return -1; p = 'x'; continue; } if (c === '/' && src[k + 1] === '/') { while (k < end && src[k] !== '\n') k++; continue; } if (c === '/' && src[k + 1] === '*') { k = src.indexOf('*/', k + 2); if (k < 0) return -1; k++; continue; } if (c === '/' && regexAt(k, p)) { k = skipRegex(k); if (k < 0) return -1; p = 'x'; continue; } if (c === '{' || c === '(' || c === '[') d++; else if (c === '}' || c === ')' || c === ']') { if (d === 0 && c === '}') return k; d--; } p = c; } return -1; }
  for (let k = i; k < end; k++) {
    const c = src[k];
    if (/\s/.test(c)) continue;
    if (c === "'" || c === '"' || c === '`') { k = skipQuoted(k, c); if (k < 0) return null; prev = 'x'; continue; }
    if (c === '/' && src[k + 1] === '/') { while (k < end && src[k] !== '\n') k++; continue; }
    if (c === '/' && src[k + 1] === '*') { k = src.indexOf('*/', k + 2); if (k < 0) return null; k++; continue; }
    if (c === '/' && regexAt(k, prev)) { k = skipRegex(k); if (k < 0) return null; prev = 'x'; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) { out.push(src.slice(start, k).trim()); return out; } depth--; }
    else if (c === ',' && depth === 0) { out.push(src.slice(start, k).trim()); if (out.length >= max) return out; start = k + 1; }
    prev = c;
  }
  return null;
}

const QUOTED = /^['"`]/;
// one string or template literal and nothing else (`'a' === x`, `'k' in o` are conditions, not literals)
export function wholeLiteral(a) {
  if (!QUOTED.test(a)) return false;
  const q = a[0]; let depth = 0;
  for (let k = 1; k < a.length; k++) {
    const c = a[k];
    if (c === '\\') { k++; continue; }
    if (q === '`' && c === '$' && a[k + 1] === '{') { depth++; k++; continue; }
    if (depth) { if (c === '{') depth++; else if (c === '}') depth--; continue; }
    if (c === q) return k === a.length - 1;
  }
  return false;
}
export function swappedCalls(src, defs = helperDefs(src)) {
  const out = [];
  for (const name of new Set(defs.map((d) => d.name))) {
    const mine = defs.filter((d) => d.name === name).sort((x, y) => x.at - y.at);
    for (const c of src.matchAll(new RegExp(`(?<![\\w$.])${name}\\s*\\(`, 'g'))) {
      if (mine.some((d) => d.at === c.index)) continue;
      if (/(?:function|const|let|var)\s*$/.test(src.slice(Math.max(0, c.index - 12), c.index))) continue;
      const def = mine.filter((d) => d.at < c.index).pop() || mine[0];
      if (def.order === 'unknown') continue;
      // the cheap verdict first: a condition-first call whose first argument does not open with a quote holds no swap
      if (def.order === 'cond-first' && !QUOTED.test(src.slice(c.index + c[0].length, c.index + c[0].length + 40).trimStart())) continue;
      const ls = src.lastIndexOf('\n', c.index) + 1;
      if (/^\s*(?:\/\/|\*|\/\*)/.test(src.slice(ls, c.index))) continue;   // a call quoted in a whole-line comment
      const as = callArgs(src, c.index + c[0].length, 2);
      if (!as || as.length < 2) continue;
      const [condArg, nameArg] = def.order === 'cond-first' ? as : [as[1], as[0]];
      if (wholeLiteral(condArg) && !wholeLiteral(nameArg)) out.push({ helper: name, order: def.order, defLine: def.line, line: lineOf(src, c.index), text: src.slice(c.index, c.index + 120).replace(/\s+/g, ' ') });
    }
  }
  return out.sort((x, y) => x.line - y.line);
}
