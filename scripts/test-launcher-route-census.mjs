#!/usr/bin/env node
// test-launcher-route-census — rel254-verify-fixes (2026-10-11, verify-rel254-register F1: the launcher called THREE routes
// its sibling lane never built — GET /api/desktop/apps/adopt-prefill, POST …/:id/remove, POST …/:id/forget — and the UI
// suite answered them from its own stub server, so Remove… / Forget never worked in .254). THE INVARIANT: a contract
// between two lanes is a CENSUS, never a stub. GREP-DERIVED: every `/api/desktop/…` and `/api/agent/…` path literal the
// client tree (src/lib/**/*.js) fetches — fetchJson / fetch / EventSource / streamUrl, template paths normalised to `:id`,
// a `${c ? 'a' : 'b'}` segment expanded to both words — must match a route registered in src/routes/*.js (method + path
// pattern; a client `:id` matches only a route parameter). The census is printed; a path no router serves is RED.
// Controls: the pre-fix router (the three owner routes commented out) is RED by name; a route registered AFTER `:id`
// that `:id` swallows (adopt-prefill below GET …/apps/:id) is RED too. PURE text, in-process, ~100 ms.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : ''}`); } };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
const read = (files) => files.map((f) => ({ file: path.relative(ROOT, f), text: fs.readFileSync(f, 'utf8') }));
const PREFIX_RE = /^\/api\/(desktop|agent)\//;

/** A string / template literal starting at text[i] (a quote) → { body, end } — `${…}` kept balanced (nested literals too). */
function literalAt(text, i) {
  const q = text[i];
  let j = i + 1, body = '';
  while (j < text.length && text[j] !== q) {
    if (text[j] === '\\') { body += text.slice(j, j + 2); j += 2; continue; }
    if (q === '`' && text[j] === '$' && text[j + 1] === '{') {
      let depth = 1, k = j + 2;
      while (k < text.length && depth) { const c = text[k]; if (c === '{') depth++; else if (c === '}') depth--; else if (c === '`' || c === "'" || c === '"') { k = literalAt(text, k).end; continue; } k++; }
      body += text.slice(j, k); j = k; continue;
    }
    if (q !== '`' && text[j] === '\n') break;
    body += text[j]; j++;
  }
  return { body, end: j + 1 };
}
/** A literal's path → its alternatives, normalised: `${…}` alone in a segment = `:id` (a ternary of two words = both words);
 *  `${…}` glued after a segment (a query builder) and anything from `?` are dropped. */
function pathsOf(body) {
  const parts = body.split(/(\$\{(?:[^{}]|\{[^{}]*\})*\})/);
  let outs = [''];
  for (const p of parts) {
    if (!p.startsWith('${')) { outs = outs.map((o) => o + p); continue; }
    const tern = /^\$\{\s*[\w.!() ]+\?\s*'([\w.-]*)'\s*:\s*'([\w.-]*)'\s*\}$/.exec(p);
    outs = outs.flatMap((o) => (o.endsWith('/') ? (tern ? [o + tern[1], o + tern[2]] : [o + ':id']) : [o + '\u0000']));
  }
  return [...new Set(outs.map((o) => o.split('?')[0].split('\u0000')[0]).filter((o) => PREFIX_RE.test(o)))];
}
/** Every client call: { file, line, method, path }. */
function clientCalls(files) {
  const out = [];
  const CALL_RE = /\b(fetchJson|fetch|EventSource|streamUrl)\s*\(\s*/g;
  for (const { file, text } of files) {
    for (let m; (m = CALL_RE.exec(text));) {
      const i = m.index + m[0].length;
      if (!['`', "'", '"'].includes(text[i])) continue;
      const lit = literalAt(text, i);
      const tail = text.slice(lit.end, text.indexOf('\n', lit.end) === -1 ? text.length : text.indexOf('\n', lit.end));
      const mm = /method:\s*'(\w+)'/.exec(tail);
      const method = m[1] === 'EventSource' ? 'GET' : mm ? mm[1].toUpperCase() : /^\s*,\s*POST_JSON\(/.test(tail) ? 'POST' : 'GET';
      for (const p of pathsOf(lit.body)) out.push({ file, line: text.slice(0, m.index).split('\n').length, method, path: p });
    }
  }
  return out;
}
/** Every router registration in src/routes/*.js: { file, line, method, path, order }. */
function routesOf(files) {
  const out = [];
  const R_RE = /\brouter\.(get|post|put|delete|patch)\(\s*(['"`])([^'"`]+)\2/g;
  for (const { file, text } of files) {
    const live = text.replace(/^\s*\/\/.*$/gm, (l) => ' '.repeat(l.length)); // a commented-out registration serves nothing
    for (let m; (m = R_RE.exec(live));) out.push({ file, line: live.slice(0, m.index).split('\n').length, method: m[1].toUpperCase(), path: m[3], order: out.length });
  }
  return out;
}
const segs = (p) => p.replace(/\/+$/, '').split('/');
// a client `:id` matches a route parameter only; a client LITERAL matches the same literal only (a literal the router
// leaves to a `:param` route is what .254 shipped: adopt-prefill fell into GET …/apps/:id ⇒ 404 "no desktop app adopt-prefill")
const matches = (c, r) => { const a = segs(c), b = segs(r); return a.length === b.length && a.every((x, i) => (x === ':id' ? b[i].startsWith(':') : x === b[i])); };
const loose = (c, r) => { const a = segs(c), b = segs(r); return a.length === b.length && a.every((x, i) => b[i].startsWith(':') || x === b[i]); };
/** Paths served OUTSIDE a router (a WebSocket upgrade) — each proved by a grep of its handler file, never assumed. */
const UPGRADES = [{ method: 'GET', path: '/api/desktop/:id/stream', file: 'src/server/desktop-stream.js', proof: /`\/api\/desktop\/\$\{id\}\/stream`/ }];
/** THE CENSUS: each client call → the route that serves it — Express order: the FIRST registered match wins. */
function census(client, routes) {
  return client.map((c) => {
    const up = UPGRADES.find((u) => u.method === c.method && u.path === c.path && u.proof.test(fs.readFileSync(path.join(ROOT, u.file), 'utf8')));
    if (up) return { ...c, servedBy: `${up.file} (WebSocket upgrade)`, why: null };
    const first = routes.find((r) => r.method === c.method && loose(c.path, r.path)); // Express: the FIRST registered match takes the request
    const exact = first && matches(c.path, first.path) ? first : routes.find((r) => r.method === c.method && matches(c.path, r.path));
    const why = !exact ? (first ? `only ${first.method} ${first.path} (${first.file}:${first.line}) would take it — a literal no router names` : 'no router serves it') : first !== exact ? `swallowed by ${first.method} ${first.path} (${first.file}:${first.line}) registered before ${exact.path}` : null;
    return { ...c, servedBy: why ? null : `${exact.file}:${exact.line} ${exact.method} ${exact.path}`, why };
  });
}

const clientFiles = read(walk(path.join(ROOT, 'src/lib')));
const routeFiles = read(fs.readdirSync(path.join(ROOT, 'src/routes')).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, 'src/routes', f)));
const client = clientCalls(clientFiles);
const routes = routesOf(routeFiles);
const rows = census(client, routes);
console.log(`the census — ${rows.length} client calls into /api/desktop/ + /api/agent/, ${routes.length} router registrations:`);
for (const r of rows) console.log(`  ${r.servedBy ? '·' : 'RED'} ${r.method} ${r.path}  ← ${r.file}:${r.line}${r.servedBy ? `  → ${r.servedBy}` : `  — ${r.why}`}`);
ok(rows.length >= 20, `the scanner reads the client tree (${rows.length} calls ≥ 20 — a parser that finds nothing proves nothing)`);
const owner = ['GET /api/desktop/apps/adopt-prefill', 'POST /api/desktop/apps/:id/remove', 'POST /api/desktop/apps/:id/forget', 'POST /api/desktop/apps/:id/stop'];
for (const k of owner) ok(rows.some((r) => `${r.method} ${r.path}` === k), `the scanner finds the launcher's ${k}`);
const red = rows.filter((r) => !r.servedBy);
ok(!red.length, `every path the client calls is served by a router (${rows.length - red.length}/${rows.length})`, red.map((r) => `${r.method} ${r.path} ← ${r.file}:${r.line} — ${r.why}`));
// CONTROL 1: the pre-fix router — the three owner routes commented out ⇒ RED by name
const mut = routeFiles.map((f) => (f.file.endsWith('desktop-apps.js') ? { ...f, text: f.text.replace(/^(router\.(get|post)\('\/api\/desktop\/apps\/(adopt-prefill|:id\/remove|:id\/forget)')/gm, '// $1') } : f));
const redMut = census(client, routesOf(mut)).filter((r) => !r.servedBy).map((r) => `${r.method} ${r.path}`);
ok(['GET /api/desktop/apps/adopt-prefill', 'POST /api/desktop/apps/:id/remove', 'POST /api/desktop/apps/:id/forget'].every((k) => redMut.includes(k)), `CONTROL: the .254 router (owner routes commented out) is RED by name (${redMut.join(', ')})`);
// CONTROL 2: adopt-prefill registered AFTER GET …/apps/:id is swallowed by it (the verify's 404 "no desktop app adopt-prefill")
const late = routesOf(routeFiles).map((r) => (r.path === '/api/desktop/apps/adopt-prefill' ? { ...r, order: 1e9 } : r)).sort((a, b) => a.order - b.order);
const sw = census(client, late).find((r) => r.path === '/api/desktop/apps/adopt-prefill');
ok(sw && !sw.servedBy && /swallowed by GET \/api\/desktop\/apps\/:id/.test(sw.why), `CONTROL: a literal route registered after \`:id\` is RED (${sw && sw.why})`);
// the normaliser itself
ok(JSON.stringify(pathsOf("/api/desktop/apps/${encodeURIComponent(row.id)}/${forget ? 'forget' : 'remove'}")) === JSON.stringify(['/api/desktop/apps/:id/forget', '/api/desktop/apps/:id/remove']) && JSON.stringify(pathsOf('/api/desktop/apps${q ? `?${q}` : \'\'}')) === JSON.stringify(['/api/desktop/apps']), 'the normaliser: a param segment = :id, a two-word ternary = both words, a query builder dropped');

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}) in ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);
