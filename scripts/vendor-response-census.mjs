// THE VENDOR-RESPONSE CENSUS (lane lark-threads verify r3, 2026-10-01) — the 429 class closed by construction.
//
// r1 F1 and r2 F1 were the SAME class twice: a vendor's RATE refusal (429 / Lark 99991400·99991403 / Google's
// rateLimitExceeded 403) answered somewhere the account's rate ladder never saw — caught in the adapter, the pass
// resolved ok, and the next call went out into the vendor's stop. A third hunt by example is not a closure. This
// census reads the adapter FILES (src/channels/lark.js, gmail.js, live/lark.js, live/gmail.js) and judges, per
// file:
//   RAW SENDS — every `fetchFn(` / `f(` outside the ONE judge (`callJson` → `typedFailure`) must hand its answer to
//     `typedFailure(` within the next lines (the resource bytes), or be a live lane's own status judge (`err.status`
//     + `permanent` — the pull ladder). A raw send whose answer no judge reads is RED.
//   CATCHES — every `catch` whose try (transitively, over the file's own call graph) reaches a vendor send is one of:
//     `rethrows-rate`  — names 'rate-limited' in a throw (`if (… e.code === 'rate-limited' …) throw e`);
//     `ends-throw`     — its last statement re-throws the caught error (`throw e` / `throw err` / `throw map(e)`)
//                        and every `return` before it follows a POSITIVE typed-code test on a code that is not
//                        rate-limited (`e.code === 'not-found'`, `vc === 230071`, …) — a code-gated return cannot
//                        swallow a 429;
//     `raw-fetch`      — its try holds only the raw send (a network error; the answer is judged after) and it throws;
//     `rate-ok: <id>`  — a marker on the catch line with a row in the module's exported `RATE_OK` {id, why}: the
//                        swallow is deliberate AND bounded (a human's one press, the push path's ack budget, a lane's
//                        own ladder) — the row says why;
//     anything else is RED: a catch that can swallow a vendor's rate refusal.
//   A catch whose try never reaches a send is `no-vendor` (listed, never judged).
// Both shape suites run it on the real file and on three planted copies (a bare send, a swallowing catch, a judge
// that maps 429 to ok — the third through the behavioural judge table), so a new escape is red the day it lands.
// Strings and comments are blanked before any rule reads the code — a comment is not a call.

/** The source with every comment and string/template CONTENT blanked to spaces (same length, newlines kept). */
export function blank(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  const tmpl = [];   // template nesting: depth of `${` inside a template
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out[i] = ' '; i++; } continue; }
    if (c === '/' && d === '*') { out[i] = ' '; out[i + 1] = ' '; i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] !== '\n') out[i] = ' '; i++; } if (i < n) { out[i] = ' '; out[i + 1] = ' '; i += 2; } continue; }
    if (c === '\'' || c === '"') { const q = c; i++; while (i < n && src[i] !== q) { if (src[i] === '\\') { out[i] = ' '; i++; } if (i < n && src[i] !== '\n') out[i] = ' '; i++; } i++; continue; }
    if (c === '`') { i++; let depth = 0; while (i < n) { if (src[i] === '\\') { out[i] = ' '; out[i + 1] = ' '; i += 2; continue; } if (src[i] === '`' && depth === 0) break; if (src[i] === '$' && src[i + 1] === '{') { depth++; i += 2; continue; } if (depth > 0) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; i++; continue; } i++; continue; } if (src[i] !== '\n') out[i] = ' '; i++; } i++; continue; }
    // a regex literal: after `(`, `,`, `=`, `:`, `[`, `!`, `&`, `|`, `?`, `{`, `}`, `;`, `return` — blanked like a string
    if (c === '/' ) { let j = i - 1; while (j >= 0 && /\s/.test(src[j])) j--; const before = src.slice(Math.max(0, j - 6), j + 1); if (j < 0 || /[(,=:[!&|?{};]$/.test(src[j]) || /\breturn$|\btypeof$/.test(before)) { i++; let cls = false; while (i < n && src[i] !== '\n') { if (src[i] === '\\') { out[i] = ' '; i++; out[i] = ' '; i++; continue; } if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; else if (src[i] === '/' && !cls) break; out[i] = ' '; i++; } i++; continue; } }
    i++;
  }
  return out.join('');
}

const lineOf = (src, pos) => src.slice(0, pos).split('\n').length;
/** The index of the brace that closes the one at `open` (code already blanked). */
function closeOf(code, open) { let d = 0; for (let i = open; i < code.length; i++) { if (code[i] === '{') d++; else if (code[i] === '}') { d--; if (d === 0) return i; } } return -1; }
function closeParen(code, open) { let d = 0; for (let i = open; i < code.length; i++) { if (code[i] === '(') d++; else if (code[i] === ')') { d--; if (d === 0) return i; } } return -1; }
/** The index of the `(` that opens the group closing at `close`. */
function openParenOf(code, close) { let d = 0; for (let i = close; i >= 0; i--) { if (code[i] === ')') d++; else if (code[i] === '(') { d--; if (d === 0) return i; } } return -1; }
function openBraceOf(code, close) { let d = 0; for (let i = close; i >= 0; i--) { if (code[i] === '}') d++; else if (code[i] === '{') { d--; if (d === 0) return i; } } return -1; }

/** Every named function/method/arrow of the file with its body span (in the blanked code). */
export function functionSpans(code) {
  const out = [];
  const seen = new Set();
  const add = (name, bodyOpen) => { if (bodyOpen < 0) return; const end = closeOf(code, bodyOpen); if (end < 0) return; out.push({ name, start: bodyOpen, end }); };
  // function NAME(…) {   |   async function NAME(…) {   |   async NAME(…) {  (a method)   |   NAME(…) {  (a method, no async)
  for (const m of code.matchAll(/\b(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    if (['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'await', 'typeof', 'new', 'async'].includes(name)) continue;
    const pOpen = m.index + m[0].length - 1;
    const pClose = closeParen(code, pOpen);
    if (pClose < 0) continue;
    let j = pClose + 1; while (j < code.length && /\s/.test(code[j])) j++;
    if (code[j] !== '{') continue;
    // a CALL followed by a block (`if (x) {`-like) is excluded above by the keyword list; `foo(...) {` is a method or a declaration
    const key = `${name}@${j}`; if (seen.has(key)) continue; seen.add(key);
    add(name, j);
  }
  // const NAME = async (…) => {   |   NAME = (…) => {   |   const NAME = async x => {
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^()]*(?:\([^()]*\)[^()]*)*)\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g)) {
    const bodyOpen = m.index + m[0].length - 1;
    const key = `${m[1]}@${bodyOpen}`; if (seen.has(key)) continue; seen.add(key);
    add(m[1], bodyOpen);
  }
  return out;
}

/** The names of this file's functions that reach a vendor send (a fixpoint over the file's own calls). */
export function vendorTouching(code, spans, direct) {
  const touching = new Set();
  const bodyOf = (s) => code.slice(s.start, s.end + 1);
  for (const s of spans) if (direct.test(bodyOf(s))) touching.add(s.name);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of spans) {
      if (touching.has(s.name)) continue;
      const b = bodyOf(s);
      for (const nm of touching) { if (nm !== s.name && new RegExp(`(?<![\\w$.])${nm.replace(/\$/g, '\\$')}\\s*\\(`).test(b) || new RegExp(`\\.${nm.replace(/\$/g, '\\$')}\\s*\\(`).test(b)) { touching.add(s.name); grew = true; break; } }
    }
  }
  return touching;
}

const CODE_TEST = /\b(?:e|err|error)\.code\s*===\s*'(?!rate-limited')[\w-]+'|\bvc\s*===\s*\d+|\bcode\s*===\s*'(?!rate-limited')[\w-]+'/;

/**
 * @param {string} src                the file's text
 * @param {object} o
 * @param {RegExp} o.direct           what a DIRECT send looks like in this file (`api(`, `callJson(`, `fetchFn(`, `f(`)
 * @param {RegExp} o.raw              the raw send primitive (`fetchFn(` / `f(`), judged by `typedFailure(` or a lane judge
 * @param {string} [o.judgeFn]        the ONE judge function name whose own body holds the raw send (callJson)
 * @param {Set<string>} o.rateOkIds   the ids the module's RATE_OK table names
 * @returns {{sites:Array, problems:string[], touching:string[]}}
 */
export function responseCensus(src, { direct, raw, judgeFn = 'callJson', rateOkIds = new Set() } = {}) {
  const code = blank(src);
  const lines = src.split('\n');
  const spans = functionSpans(code);
  const touching = vendorTouching(code, spans, direct);
  const sites = [], problems = [];
  const judge = spans.find((s) => s.name === judgeFn) || null;
  const inJudge = (pos) => !!judge && pos > judge.start && pos < judge.end;
  const usedIds = new Set();
  // ── RAW SENDS ──
  for (const m of code.matchAll(raw)) {
    const pos = m.index;
    const ln = lineOf(code, pos);
    if (inJudge(pos)) { sites.push({ line: ln, kind: 'raw', cls: 'judge' }); continue; }
    // the raw primitive's own declaration / a parameter default is not a send
    if (/\b(?:function|const|let|var)\s*$/.test(code.slice(Math.max(0, pos - 12), pos)) || /^\s*[\w$]+\s*=\s*typeof/.test(code.slice(code.lastIndexOf('\n', pos) + 1, pos))) continue;
    const after = code.slice(pos, code.indexOf('\n', pos) >= 0 ? code.split('\n').slice(0, ln + 12).join('\n').length : code.length);
    if (/\btypedFailure\s*\(/.test(after)) { sites.push({ line: ln, kind: 'raw', cls: 'judged-inline' }); continue; }
    if (/\.status\s*=\s*r\.status/.test(after) && /\.permanent\s*=/.test(after)) { sites.push({ line: ln, kind: 'raw', cls: 'lane-judge' }); continue; }
    sites.push({ line: ln, kind: 'raw', cls: 'unjudged' });
    problems.push(`line ${ln}: a raw send whose answer no judge reads: ${lines[ln - 1].trim().slice(0, 100)}`);
  }
  // ── CATCHES ──
  const catchRe = /\bcatch\s*(?:\(\s*([A-Za-z_$][\w$]*)?\s*\))?\s*\{|\.catch\s*\(\s*(?:async\s*)?(?:\(\s*([A-Za-z_$][\w$]*)?\s*\)|([A-Za-z_$][\w$]*))?\s*=>\s*\{/g;
  for (const m of code.matchAll(catchRe)) {
    const promise = m[0].startsWith('.');
    const binding = promise ? (m[2] || m[3] || '') : (m[1] || '');
    const bodyOpen = m.index + m[0].length - 1;
    const bodyClose = closeOf(code, bodyOpen);
    if (bodyClose < 0) continue;
    const ln = lineOf(code, m.index);
    const body = code.slice(bodyOpen + 1, bodyClose);
    // the TRY: `try { … }` right before, or the expression a `.catch(` hangs on
    let tryText = '';
    if (!promise) {
      let k = m.index - 1; while (k >= 0 && /\s/.test(code[k])) k--;
      if (code[k] === '}') { const o = openBraceOf(code, k); if (o >= 0) tryText = code.slice(o, k + 1); }
    } else {
      // the chain this `.catch(` hangs on, walked back over every `.then(…)` / group to its HEAD (`api('/watch', …).then(…)`,
      // an IIFE `(async () => {…})()`, a member `persisting.p`): the try text is the whole chain
      let p = m.index;   // the '.' of .catch
      let head = -1;
      for (let guard = 0; guard < 64 && head < 0; guard++) {
        let q = p - 1; while (q >= 0 && /\s/.test(code[q])) q--;
        if (code[q] === ')') {
          const o = openParenOf(code, q); if (o < 0) { head = q + 1; break; }
          let r = o - 1; while (r >= 0 && /\s/.test(code[r])) r--;
          if (r >= 0 && /[\w$]/.test(code[r])) { while (r >= 0 && /[\w$]/.test(code[r])) r--; const identStart = r + 1; while (r >= 0 && /\s/.test(code[r])) r--; if (code[r] === '.') { p = r; continue; } head = identStart; break; }
          if (r >= 0 && code[r] === ')') { p = r + 1; continue; }   // an IIFE: the group before the call is the function
          head = o; break;
        }
        let r = q; while (r >= 0 && /[\w$.]/.test(code[r])) r--; head = r + 1; break;
      }
      tryText = head >= 0 ? code.slice(head, m.index) : '';
    }
    const directHit = direct.test(tryText);
    const callsTouching = [...touching].filter((nm) => new RegExp(`(?<![\\w$])${nm.replace(/\$/g, '\\$')}\\s*\\(`).test(tryText) || new RegExp(`\\.${nm.replace(/\$/g, '\\$')}\\s*\\(`).test(tryText));
    const vendor = directHit || callsTouching.length > 0 || raw.test(tryText);
    const line = lines[ln - 1];
    const marker = /\/\/\s*rate-ok:\s*([\w-]+)/.exec(line) || /\/\/\s*rate-ok:\s*([\w-]+)/.exec(lines[ln - 2] || '');
    if (!vendor) { sites.push({ line: ln, kind: 'catch', cls: 'no-vendor' }); continue; }
    // the try holds ONLY the raw primitive (a network failure; the answer is judged after it)
    const stripped = tryText.replace(raw, 'RAW(');
    const rawOnlyTry = raw.test(tryText) && !direct.test(stripped) && !callsTouching.length;
    const ends = /(?:^|[;{}])\s*throw\s+([A-Za-z_$][\w$]*)(?:\s*\(\s*(?:e|err)\s*\))?\s*;?\s*$/.exec(body.trimEnd());
    const endsWithRethrow = !!ends && (ends[1] === binding || (/\(\s*(?:e|err)\s*\)/.test(ends[0]) && ends[1] !== 'new'));
    if (rawOnlyTry) {
      if (/\bthrow\b/.test(body)) { sites.push({ line: ln, kind: 'catch', cls: 'raw-fetch' }); continue; }
      problems.push(`line ${ln}: a raw send's catch that does not throw`); sites.push({ line: ln, kind: 'catch', cls: 'RED' }); continue;
    }
    if (marker) {
      usedIds.add(marker[1]);
      if (!rateOkIds.has(marker[1])) problems.push(`line ${ln}: rate-ok '${marker[1]}' has no RATE_OK row`);
      sites.push({ line: ln, kind: 'catch', cls: 'rate-ok', id: marker[1] }); continue;
    }
    if (/if\s*\([^{;]*rate-limited[^{;]*\)\s*(?:\{[^}]*\bthrow\b|throw\b)/.test(src.slice(bodyOpen, bodyClose))) { sites.push({ line: ln, kind: 'catch', cls: 'rethrows-rate' }); continue; }
    if (endsWithRethrow) {
      // every `return` before the final throw follows a POSITIVE typed-code test (a code-gated return never swallows a 429)
      let okReturns = true;
      const srcBody = src.slice(bodyOpen + 1, bodyClose);
      for (const r of body.matchAll(/\breturn\b/g)) { const before = srcBody.slice(0, r.index); if (!CODE_TEST.test(before)) { okReturns = false; break; } }
      if (okReturns) { sites.push({ line: ln, kind: 'catch', cls: 'ends-throw' }); continue; }
      problems.push(`line ${ln}: a catch over a vendor call returns before any typed-code test (a 429 can leave here as a value)`); sites.push({ line: ln, kind: 'catch', cls: 'RED' }); continue;
    }
    problems.push(`line ${ln}: a catch over a vendor call (${callsTouching.join('/') || 'a direct send'}) that can swallow a rate refusal: ${line.trim().slice(0, 90)}`);
    sites.push({ line: ln, kind: 'catch', cls: 'RED' });
  }
  for (const id of rateOkIds) if (!usedIds.has(id)) problems.push(`RATE_OK names '${id}' but no catch carries it`);
  return { sites, problems, touching: [...touching].sort() };
}

/** One line per class, for the suite's log. */
export function censusLine(c) {
  const by = {};
  for (const s of c.sites) { const k = `${s.kind}:${s.cls}`; (by[k] = by[k] || []).push(s.line + (s.id ? `(${s.id})` : '')); }
  return Object.entries(by).map(([k, v]) => `${k}@${v.join(',')}`).join(' ');
}
