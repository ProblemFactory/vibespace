// separation-ratchets.mjs — THE SEPARATION'S COUNTERS AND THEIR REPORT (P0, lane hub-loop-stalls, 2026-11-17; the design «The
// separation of the interface from the work — the design for lanes», THE PROGRAMME, P0 (3); reshaped by 主开发 06:00Z: no ceiling
// on master — the NAMES OF THE NEW SITES each time master is merged into the separation branch).
//   node scripts/separation-ratchets.mjs --report [--day0 <file>]   ← THE REPORT, for the tree it runs in: each counter's total
//     against day 0 (scripts/separation-day0.json — 2.369.406) and, for every file that grew, its NEW sites by file and line. The
//     integrator runs it at every merge of master into the separation branch and sends each separation lane its rows.
// Counts only, over the tree's own files, comments out by acorn's own tokenizer (a «/*» or «//» inside a string, a template
// literal or a regex is never a comment).
//   HUB FILES = server.js + src/**/*.js, less src/lib/ (the page) and src/agentd/ (the device agent).
//   THE FIVE COUNTERS — each count(sets) → { total, files: Map file → [ { line, text } ] }:
//     session-map         readers of the shared session map: `activeSessions`, and the map under its injected accessors — a
//                         call of `sessions()` (bare or as a member, no argument) or `getActiveSessions()`
//     broadcast-to-all    a send to every page socket — a CALL (never a definition: a `function` or a shorthand method
//                         `name(…) {`) of bcastAll / broadcastAll / broadcastActiveSessions / bcast / an injected or wrapped
//                         broadcast (src/server/browser-stream.js's own `broadcast` is per relay — not counted), and every
//                         `wss.clients` fan-out
//     routes              route registrations: app / router / r . get|post|put|patch|delete|use|all ( with a path literal
//     message-cases       the page protocol's message types: the `case '<type>':` labels at the top level of
//                         src/ws-handler.js's `switch (data.type)` — read by TOKENS (a brace in a string is not a brace)
//     session-field-writes  writes to a session's fields outside the session layer (session-*.js), read on acorn's TREE: a
//                         receiver spelled session / sess / ses, or a name whose binding IN ITS OWN SCOPE was made from the
//                         map's get (`const s = activeSessions.get(…)`, also through sessions() / getActiveSessions()) —
//                         `.field =` / += / -= / ||= / ??= / &&=, and Object.assign(<such a receiver>, …). The get is seen
//                         through an or / a nullish-or / an and / a ternary arm; a for-of over the map binds its VALUE as a
//                         session (`for (const [id, s] of map)`, `of map.entries()`, `of map.values()`). The same name bound to
//                         something else in another scope is not a session. A file the parser fails on is NAMED (`unread`).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const acorn = createRequire(import.meta.url)('acorn');

const tokOpts = (rel) => ({ ecmaVersion: 'latest', sourceType: /\.mjs$/.test(rel) ? 'module' : 'script', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
/** comments out, line structure kept — the comments acorn's tokenizer finds; a file it cannot read is counted as it is (`unread`) */
export const unread = [];
export function strip(t, rel = '') {
  const text = String(t), ranges = [];
  const run = (o) => { ranges.length = 0; for (const tok of acorn.tokenizer(text, { ...o, onComment: (b, _t, s, e) => ranges.push([s, e]) })) { if (tok.type === acorn.tokTypes.eof) break; } };
  try { run(tokOpts(rel)); } catch { try { run({ ...tokOpts(rel), sourceType: 'module' }); } catch { if (rel) unread.push(rel); return text; } }
  let out = '', at = 0;
  for (const [s, e] of ranges) { out += text.slice(at, s) + text.slice(s, e).replace(/[^\n]/g, ''); at = e; }
  return out + text.slice(at);
}
function walkDir(dir, out, rel) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walkDir(p, out, r); else if (e.isFile() && e.name.endsWith('.js')) out.push(r);
  }
  return out;
}
/** the hub's files, read: Map rel → text (comments out) */
export function hubFiles(root) {
  const rels = ['server.js', ...walkDir(path.join(root, 'src'), [], 'src')].filter((r) => !r.startsWith('src/lib/') && !r.startsWith('src/agentd/'));
  const m = new Map(); for (const r of rels.sort()) { try { m.set(r, strip(fs.readFileSync(path.join(root, r), 'utf8'), r)); } catch { } }
  return m;
}

const lineAt = (text) => { const starts = [0]; for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1); return (off) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; } return lo + 1; }; };
const lineText = (text, line) => text.split('\n')[line - 1] || '';
const sitesByRe = (re) => (text) => { const at = lineAt(text), out = []; for (const m of text.matchAll(re)) { const line = at(m.index); out.push({ line }); } return out; };

/** the top-level `case '<type>':` labels of ws-handler's `switch (data.type)`, read by acorn's TOKENS → [{ type, line }] */
export function messageCases(text) {
  let toks; try { toks = [...acorn.tokenizer(text, { ...tokOpts('x.js'), locations: true })]; } catch { return []; }
  const T = acorn.tokTypes, v = (t) => t.value;
  for (let i = 0; i + 6 < toks.length; i++) {
    if (toks[i].type !== T._switch || toks[i + 1].type !== T.parenL || v(toks[i + 2]) !== 'data' || toks[i + 3].type !== T.dot || v(toks[i + 4]) !== 'type' || toks[i + 5].type !== T.parenR || toks[i + 6].type !== T.braceL) continue;
    const cases = []; let depth = 0;
    for (let j = i + 6; j < toks.length; j++) {
      const t = toks[j];
      if (t.type === T.braceL || t.type === T.dollarBraceL) depth++;
      else if (t.type === T.braceR) { depth--; if (depth === 0) return cases; }
      else if (depth === 1 && t.type === T._case && toks[j + 1] && toks[j + 1].type === T.string && toks[j + 2] && toks[j + 2].type === T.colon) cases.push({ type: toks[j + 1].value, line: t.loc.start.line });
    }
    return cases;
  }
  return [];
}

// ── session-field writes on acorn's TREE, per scope ──
const SESSION_NAMES = new Set(['session', 'sess', 'ses']);
const WRITE_OPS = new Set(['=', '+=', '-=', '||=', '??=', '&&=']);
const isMapExpr = (n) => !!n && ((n.type === 'Identifier' && n.name === 'activeSessions')
  || (n.type === 'CallExpression' && n.arguments.length === 0 && ((n.callee.type === 'Identifier' && (n.callee.name === 'sessions' || n.callee.name === 'getActiveSessions')) || (n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'sessions'))));
const isMapGetCall = (n) => !!n && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'get' && isMapExpr(n.callee.object);
/** the map's get, seen through an or / a nullish-or / an and and either arm of a ternary around it (`map.get(id) || null`, `c ? map.get(id) : null`) */
const isMapGet = (n) => !!n && (isMapGetCall(n) || (n.type === 'LogicalExpression' && (isMapGet(n.left) || isMapGet(n.right))) || (n.type === 'ConditionalExpression' && (isMapGet(n.consequent) || isMapGet(n.alternate))));
/** a for-of over the map: its VALUE is a session — `for (const [id, s] of map)` / `of map.entries()` (the pair's second) or `of map.values()` (the name) */
const forOfSession = (n) => {
  if (!n || n.type !== 'ForOfStatement' || !n.left || n.left.type !== 'VariableDeclaration') return null;
  const id = n.left.declarations[0] && n.left.declarations[0].id, r = n.right;
  const call = (name) => r && r.type === 'CallExpression' && r.arguments.length === 0 && r.callee.type === 'MemberExpression' && !r.callee.computed && r.callee.property.name === name && isMapExpr(r.callee.object);
  if ((isMapExpr(r) || call('entries')) && id && id.type === 'ArrayPattern' && id.elements[1] && id.elements[1].type === 'Identifier') return id.elements[1].name;
  if (call('values') && id && id.type === 'Identifier') return id.name;
  return null;
};
const SCOPE_NODES = new Set(['Program', 'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'BlockStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'CatchClause', 'StaticBlock', 'SwitchStatement']);
const isFn = (n) => n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';
const patternNames = (p, out = []) => { if (!p) return out; if (p.type === 'Identifier') out.push(p.name); else if (p.type === 'ObjectPattern') for (const q of p.properties) patternNames(q.type === 'RestElement' ? q.argument : q.value, out); else if (p.type === 'ArrayPattern') for (const q of p.elements) patternNames(q, out); else if (p.type === 'AssignmentPattern') patternNames(p.left, out); else if (p.type === 'RestElement') patternNames(p.argument, out); return out; };
const kids = (n) => { const out = []; for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') out.push(x); } else if (v && typeof v.type === 'string') out.push(v); } return out; };
/** the declarations a scope node makes: Map name → bound-from-the-map's-get (true / false) */
function declsOf(node) {
  const d = new Map(), add = (names, mapped) => { for (const n of names) d.set(n, !!mapped); };
  const varsIn = (n, top) => { // `var` hoists to the function; let / const / class / function to their block
    if (!n || typeof n.type !== 'string') return;
    if (n !== top && isFn(n)) { if (n.type === 'FunctionDeclaration' && n.id) add([n.id.name], false); return; }
    if (n.type === 'VariableDeclaration' && n.kind === 'var') for (const x of n.declarations) add(patternNames(x.id), isMapGet(x.init) && x.id.type === 'Identifier');
    if (n.type === 'ForOfStatement' && n.left && n.left.type === 'VariableDeclaration' && n.left.kind === 'var') { const sv = forOfSession(n); if (sv) add([sv], true); }
    if (n !== top && SCOPE_NODES.has(n.type) && n.type !== 'BlockStatement' && n.type !== 'SwitchStatement' && !n.type.startsWith('For')) return;
    for (const k of kids(n)) varsIn(k, top);
  };
  const lexIn = (stmts) => { for (const s of stmts || []) { if (s.type === 'VariableDeclaration' && s.kind !== 'var') for (const x of s.declarations) add(patternNames(x.id), isMapGet(x.init) && x.id.type === 'Identifier'); else if (s.type === 'ClassDeclaration' && s.id) add([s.id.name], false); else if (s.type === 'FunctionDeclaration' && s.id) add([s.id.name], false); } };
  if (isFn(node)) { for (const p of node.params) add(patternNames(p), false); if (node.body.type === 'BlockStatement') { varsIn(node.body, node.body); lexIn(node.body.body); } }
  else if (node.type === 'Program') { varsIn(node, node); lexIn(node.body); }
  else if (node.type === 'BlockStatement' || node.type === 'StaticBlock') lexIn(node.body);
  else if (node.type === 'SwitchStatement') for (const c of node.cases) lexIn(c.consequent);
  else if (node.type === 'CatchClause') add(patternNames(node.param), false);
  else if (node.type.startsWith('For')) { const i = node.init || node.left; const sv = forOfSession(node); if (i && i.type === 'VariableDeclaration' && i.kind !== 'var') for (const x of i.declarations) for (const nm of patternNames(x.id)) d.set(nm, nm === sv); }
  return d;
}
/** session-field writes in one file's text (comments out): [{ line }] */
export function sessionWrites(text, rel = 'x.js') {
  let ast;
  try { ast = acorn.parse(text, { ...tokOpts(rel), locations: true }); } catch { try { ast = acorn.parse(text, { ...tokOpts(rel), sourceType: 'module', locations: true }); } catch { if (!unread.includes(rel)) unread.push(rel); return null; } }   // a file the parser fails on is NAMED, never a silent zero
  const out = [];
  const visit = (n, chain) => {
    const scoped = SCOPE_NODES.has(n.type) && !(n.type === 'BlockStatement' && chain.fnBody === n);
    let ch = chain;
    if (scoped) { ch = { vars: declsOf(n), up: chain, fnBody: isFn(n) && n.body.type === 'BlockStatement' ? n.body : null }; }
    const mapped = (name) => { for (let s = ch; s; s = s.up) if (s.vars && s.vars.has(name)) return s.vars.get(name); return false; };
    const recv = (o) => o && o.type === 'Identifier' && (SESSION_NAMES.has(o.name) || mapped(o.name));
    if (n.type === 'AssignmentExpression' && WRITE_OPS.has(n.operator) && n.left.type === 'MemberExpression' && !n.left.computed && recv(n.left.object)) out.push({ line: n.loc.start.line });
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.object.type === 'Identifier' && n.callee.object.name === 'Object' && n.callee.property.name === 'assign' && recv(n.arguments[0])) out.push({ line: n.loc.start.line });
    for (const k of kids(n)) visit(k, ch);
  };
  visit(ast, null);
  return out;
}

export const COUNTERS = Object.freeze([
  { id: 'session-map', words: 'readers of the shared session map', source: String.raw`\bactiveSessions\b | (?<![\w$])(?:[\w$]+\.)?sessions\s*\(\s*\) | \bgetActiveSessions\s*\(\s*\)`,
    sites: sitesByRe(/\bactiveSessions\b|(?<![\w$])(?:[\w$]+\.)?sessions\s*\(\s*\)|\bgetActiveSessions\s*\(\s*\)/g) },
  { id: 'broadcast-to-all', words: 'sends to every page socket', skip: (f) => f === 'src/server/browser-stream.js',
    source: String.raw`(?<!function\s{1,4})\b(?:bcastAll|broadcastAll|broadcastActiveSessions|bcast|broadcast)\s*\((?![^()]*\)\s*\{) | \bwss\.clients\b`,
    sites: sitesByRe(/(?<!function\s{1,4})\b(?:bcastAll|broadcastAll|broadcastActiveSessions|bcast|broadcast)\s*\((?![^()]*\)\s*\{)|\bwss\.clients\b/g) },
  { id: 'routes', words: 'route registrations', source: String.raw`\b(?:app|router|r)\.(?:get|post|put|patch|delete|use|all)\s*\(\s*['"\x60/]`,
    sites: sitesByRe(/\b(?:app|router|r)\.(?:get|post|put|patch|delete|use|all)\s*\(\s*['"`/]/g) },
  { id: 'message-cases', words: 'the page protocol\'s message types (ws-handler\'s switch, by tokens)', only: 'src/ws-handler.js', source: String.raw`switch (data.type) { … case '<type>': (top level, by acorn's tokens)`,
    sites: (text) => messageCases(text).map((c) => ({ line: c.line })) },
  { id: 'session-field-writes', words: 'writes to a session\'s fields outside the session layer', skip: (f) => /(^|\/)session-[\w-]+\.js$/.test(f),
    source: 'acorn tree: <receiver>.field = | += | -= | ||= | ??= | &&= and Object.assign(<receiver>, …) — <receiver> = session | sess | ses, or a name whose binding in its own scope is <the map>.get(…)',
    sites: (text, rel) => sessionWrites(text, rel) || [] },
].map((c) => Object.freeze(c)));

const MEMO = new Map();
/** count one counter over the hub files: { total, files: Map rel → [ { line, text } ] } (a file's sites kept while its text is the same string) */
export function count(c, hub) {
  const files = new Map(); let total = 0;
  for (const [f, t] of hub) {
    if (c.only && f !== c.only) continue;
    if (c.skip && c.skip(f)) continue;
    const key = `${c.id}\0${f}`, hit = MEMO.get(key);
    let s;
    if (hit && hit.t === t) s = hit.s; else { s = c.sites(t, f).map((x) => ({ line: x.line, text: lineText(t, x.line).trim().slice(0, 200) })); MEMO.set(key, { t, s }); }
    if (s.length) { files.set(f, s); total += s.length; }
  }
  return { total, files };
}
export function countAll(root, hub = hubFiles(root)) { return Object.fromEntries(COUNTERS.map((c) => [c.id, count(c, hub)])); }

/** a site's fingerprint: its line's text (trimmed), hashed — the day-0 snapshot keeps these per file */
export const fp = (text) => crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 10);
/** the day-0 snapshot of a count: { total, files: { file: [fp …] } } */
export function snapshotOf(counts) { return Object.fromEntries(Object.entries(counts).map(([id, v]) => [id, { total: v.total, files: Object.fromEntries([...v.files].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([f, s]) => [f, s.map((x) => fp(x.text))])) }])); }
/** THE REPORT: per counter, now against day 0 and, for every file that grew, its NEW sites (those whose line fingerprints exceed
 *  day 0's — by file and line). → { counters: [ { id, now, day0, grew: [ { file, was, now, sites: [ { line, text } ] } ], shrank } ] } */
export function report(counts, day0) {
  const out = [];
  for (const c of COUNTERS) {
    const now = counts[c.id], was = (day0 && day0[c.id]) || { total: 0, files: {} };
    const grew = []; let shrank = 0;
    for (const [f, sites] of now.files) {
      const old = was.files[f] || [];
      if (sites.length < old.length) shrank++;
      const left = new Map(); for (const h of old) left.set(h, (left.get(h) || 0) + 1);
      const fresh = []; for (const s of sites) { const h = fp(s.text), n = left.get(h) || 0; if (n > 0) left.set(h, n - 1); else fresh.push({ line: s.line, text: s.text }); }
      if (fresh.length) grew.push({ file: f, was: old.length, now: sites.length, sites: fresh });
    }
    for (const f of Object.keys(was.files)) if (!now.files.has(f)) shrank++;
    out.push({ id: c.id, words: c.words, now: now.total, day0: was.total, grew, shrank });
  }
  return { counters: out, unread: unread.slice() };
}
export function printReport(r, day0Name) {
  const L = [`THE SEPARATION'S COUNTERS — this tree against day 0 (${day0Name})`, '(a site is its line\'s text: an EDITED line reads as a new site; removed sites are not listed — a file that shrank is only counted)'];
  if (r.unread && r.unread.length) L.push(`NOT READ by the parser — counted as nothing, named here: ${r.unread.join(', ')}`);
  for (const c of r.counters) {
    const d = c.now - c.day0;
    L.push(`${c.id} — ${c.words}: ${c.now} (day 0 ${c.day0}, ${d >= 0 ? '+' : ''}${d})${c.shrank ? ` · ${c.shrank} file(s) fewer` : ''}`);
    for (const g of c.grew) { L.push(`  ${g.file}: ${g.was} → ${g.now}`); for (const s of g.sites) L.push(`    ${g.file}:${s.line}  ${s.text}`); }
  }
  return L.join('\n');
}

const MAIN = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (MAIN) {
  const args = process.argv.slice(2), root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const di = args.indexOf('--day0'), d0 = di >= 0 ? args[di + 1] : path.join(root, 'scripts/separation-day0.json');
  if (!args.includes('--report')) { console.error('usage: node scripts/separation-ratchets.mjs --report [--day0 <file>]'); process.exit(2); }
  const day0 = JSON.parse(fs.readFileSync(d0, 'utf8'));
  console.log(printReport(report(countAll(root), day0.counters), `${day0.release}`));
}
