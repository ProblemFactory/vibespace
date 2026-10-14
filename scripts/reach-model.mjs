// STATIC REACH (q-036 P0, lane affected-static-reach, 2026-10-14 — the owner: 「都按推荐来吧」) — PURE: no fs, no git, no
// clock; scripts/ci.mjs affectedSuites does the reads and hands this module texts, import edges and closures.
//
// The affected heavy tier selected a suite that BOOTS the product for EVERY product change (ci.mjs IMPACT SCOPE: the
// boot prefixes server.js / src/ / public/ / data/bin/ are inputs of ~258 of 300 heavy suites), so a train of 30–80
// product files ran ~270 suites. This module narrows ONLY that boot reason: a booting suite is selected by a changed
// product file iff the suite's REACH meets the file's ATTRIBUTION —
//   · REACH (a suite) = tokens grep-derived from its closure (the suite + the scripts/ modules it loads, minus the
//     shared harness modules ≥ HARNESS_MIN heavy suites load, minus the gate's own tooling, minus the PROBE routes ≥ PROBE_MIN booting suites spell — api:home, the wait
//     every boot makes, which the sentinel smokes; a window or module that many suites drive stays reach): `win:<type>` (a registered
//     window type's open action — app.openChannels( / action: 'openChannels' — or `type: '<registered type>'`),
//     `api:<seg1>[/<seg2>]` (every '/api/…' spelling), `mod:<path>` (a src/… or data/bin/… path it spells), `bin:<name>`
//     (a data/bin program by name) and `cls:<class>` (a selector's class). A row may DECLARE `reach: [...]` or
//     `reach: 'all'` (an author's assertion); the census pins declaration ⊇ derivation (a declaration that misses a
//     non-class token grep sees is RED); undeclared = derived; derived EMPTY (no win/api/mod/bin token) = 'all'.
//   · ATTRIBUTION (a changed file) = its own tokens — `mod:` its path, the window types it registers, every '/api/…' it
//     spells (the routes it mounts or fetches), the classes it draws (a client module) — plus ONE HOP: each module that
//     imports it adds its `mod:`, the window types it registers and the routes it mounts (a composition root — server.js,
//     the bundle's entry, app.js: ≥ ROOT_MIN imports — adds nothing). A class ≥ SHARED_CLS_MIN modules draw is no key.
//     A CLIENT module (src/lib/) reaches only the suites that drive a browser (a server-only boot never runs it); a
//     shared TABLE affected-model models (the dictionaries, the settings schema, the stylesheet) is ALL-BROWSER. A HUB — a src module ≥ HUB_MIN src/lib modules import (i18n.js, utils.js, icons.js …,
//     DERIVED by count, never a hand list) — and every module a hub imports (it runs wherever the hub runs: on every
//     page) attribute to ALL-BROWSER: every suite that drives a browser. A page asset (public/…) is ALL-BROWSER too.
//   · a match: equal tokens; `api:x` (one segment) meets every `api:x/…`; `cls:` only ever meets `cls:`.
// THE RAILS: the old rule is the UPPER bound (only a 'boot' dependency narrows — a suite that loads, names or declares
// the file keeps it); server.js keeps every boot (KEPT_BOOT), package.json / ci.mjs keep their rules (ci.mjs); the
// shared-table rules (scripts/affected-model.mjs) apply FIRST and this rule intersects their picks. What grep cannot
// see (a route built at run time, an event name) is the sentinel's (scripts/test-boot-sentinel.mjs, always: a real
// boot, every GET route, every window type) and the 24 h FULL run's.

export const HARNESS_MIN = 60; // a scripts/ module ≥ 60 heavy suites load is harness (scratch, git-env, mutant-copy …)
export const PROBE_MIN = 60;   // a ROUTE ≥ 60 booting suites spell is the boot's own probe (api:home — every boot waits on it)
export const HUB_MIN = 20;     // a src module ≥ 20 src/lib modules import is a hub (on every page)
export const ROOT_MIN = 60;    // a module that imports ≥ 60 src modules is a composition root (server.js 117, app.js 70; next 44)
export const SHARED_CLS_MIN = 4; // a class ≥ 4 client modules draw is a shared look (active, hidden, btn-create), no module's own
// The gate's own tooling names every token kind and every suite: never evidence of a suite's reach.
export const TOOLING = Object.freeze(['scripts/ci.mjs', 'scripts/affected-model.mjs', 'scripts/reach-model.mjs']);
// The boot inputs whose change keeps the OLD rule (every booting suite), said in --why.
export const KEPT_BOOT = Object.freeze({
  'server.js': 'the composition root — a change there can alter any boot (no finer rule is proven)',
  'public/index.html': 'the page every browser suite loads — and its script/style tags',
});
export const KINDS = Object.freeze(['win', 'api', 'mod', 'bin', 'cls']);
// The suite every affected run carries (`always: true`): a real boot, every GET route, every window type opened once.
export const SENTINEL = 'test-boot-sentinel';
// '.json' and friends are file names, never classes a page draws
const NOT_CLASSES = new Set('js mjs cjs json jsonl png jpg jpeg gif svg webp ico txt md html htm css log sh py zip tar gz tgz pdf docx xlsx pptx odt wasm sock pid lock tmp bak key pem crt yml yaml toml ts tsx map woff woff2 ttf otf mp3 mp4 wav ogg webm csv xml ini conf desktop service exe dll so deb rpm git env local test example then catch finally'.split(' '));

/** The window registry the source declares: every `registerWindowType({ type, action | actions })` and
 *  `registerOpenAction({ action, type })` site of `files` ([[rel, text]] — the client modules). → { types: Map type →
 *  { file, actions }, actionType: Map action → type }. A plugin's runtime type (`plugin:<id>:<wid>`) has no literal. */
export function windowRegistry(files) {
  const types = new Map(), actionType = new Map();
  for (const [rel, text] of files) {
    if (!text.includes('registerWindowType(') && !text.includes('registerOpenAction(')) continue;
    for (const m of text.matchAll(/\bregister(WindowType|OpenAction)\(\s*\{/g)) {
      const seg = recordAt(text, m.index + m[0].length - 1);
      const type = /\btype:\s*['"]([a-z][\w:-]*)['"]/.exec(seg)?.[1];
      if (!type) continue;
      const acts = [];
      const one = /\baction:\s*['"]([A-Za-z]\w*)['"]/.exec(seg); if (one) acts.push(one[1]);
      const many = /\bactions:\s*\{([^}]*)\}/.exec(seg);
      if (many) for (const a of many[1].matchAll(/(?:^|[,{\s])([A-Za-z]\w*)\s*:/g)) acts.push(a[1]);
      if (m[1] === 'WindowType' && !types.has(type)) types.set(type, { file: rel, actions: [] });
      const rec = types.get(type);
      for (const a of acts) { if (!actionType.has(a)) actionType.set(a, type); if (rec && !rec.actions.includes(a)) rec.actions.push(a); }
    }
  }
  return { types, actionType };
}
// the `{ … }` record that opens at `i` (brace depth, strings skipped) — at most 4000 chars
function recordAt(text, i) {
  let depth = 0, q = null;
  const end = Math.min(text.length, i + 4000);
  for (let k = i; k < end; k++) {
    const c = text[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(i, k + 1);
  }
  return text.slice(i, end);
}

const API_RE = /\/api\/([A-Za-z0-9_.-]+)(?:\/([A-Za-z0-9_.-]+))?/g;
/** '/api/channels/send' → 'api:channels/send'; '/api/sessions/:id' (or `${id}`) → 'api:sessions'. */
export function apiToken(p) {
  API_RE.lastIndex = 0;
  const m = API_RE.exec(String(p || ''));
  return m ? `api:${m[1]}${m[2] ? '/' + m[2] : ''}` : null;
}
const apiTokens = (text, out) => { for (const m of text.matchAll(API_RE)) out.add(`api:${m[1]}${m[2] ? '/' + m[2] : ''}`); };
const MOD_RE = /\b((?:src|data\/bin)\/(?:[\w.-]+\/)*[\w.-]+)/g;
const modTokens = (text, out) => { for (const m of text.matchAll(MOD_RE)) if (m[1].startsWith('data/bin/') || /\.(?:m?js|cjs)$/.test(m[1])) out.add('mod:' + m[1]); };
// a selector's class: after a quote, whitespace or a combinator — never a member call (`.then(`) or a file extension
const SEL_CLS_RE = /(?:^|[\s'"`,>+~(])\.([A-Za-z_][\w-]*)(?![\w-]*\s*\()/gm;
const CLASSLIST_RE = /\b(?:classList\.(?:contains|add|remove|toggle|replace)|getElementsByClassName)\(\s*['"`]([A-Za-z_][\w-]*)['"`]/g;

/** The compiled token context: `types` / `actionType` = windowRegistry's; `bins` = the data/bin program names (a suite
 *  that runs `vibespace-msg` reaches data/bin/vibespace-msg). Build it once per tree. */
export function tokenContext({ types = new Map(), actionType = new Map(), bins = [] } = {}) {
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alt = (xs) => (xs.length ? new RegExp(`(?<![\\w-])(${xs.map(esc).sort((a, b) => b.length - a.length).join('|')})(?![\\w-])`, 'g') : null);
  const typeRe = alt([...types.keys()].filter((k) => k.includes('-')));
  return { types, actionType, bins, actionRe: alt([...actionType.keys()]), binRe: alt(bins), typeRe: typeRe && new RegExp(`['"\`]${typeRe.source}['"\`]`, 'g') };
}
/** A suite file's tokens (the suite or a scripts/ module of its closure) under `ctx` (tokenContext). */
export function suiteTokens(text, ctx = tokenContext()) {
  const out = new Set();
  const t = String(text || '');
  if (ctx.actionRe) for (const m of t.matchAll(ctx.actionRe)) out.add('win:' + ctx.actionType.get(m[1]));
  // a type literal names a window only when it can be nothing else: inside createWindow({ … }), or a hyphenated type
  // (browser-live) anywhere — a bare 'system' / 'chat' / 'task' is a transcript record's type far more often
  for (const m of t.matchAll(/\bcreateWindow\(\s*\{[^}]{0,200}?\btype:\s*['"`]([a-z][\w:-]*)['"`]/g)) if (ctx.types.has(m[1])) out.add('win:' + m[1]);
  if (ctx.typeRe) for (const m of t.matchAll(ctx.typeRe)) out.add('win:' + m[1]);
  apiTokens(t, out);
  modTokens(t, out);
  if (ctx.binRe) for (const m of t.matchAll(ctx.binRe)) out.add('bin:' + m[1]);
  for (const m of t.matchAll(SEL_CLS_RE)) if (!NOT_CLASSES.has(m[1].toLowerCase())) out.add('cls:' + m[1]);
  for (const m of t.matchAll(CLASSLIST_RE)) out.add('cls:' + m[1]);
  return out;
}

const ROUTE_RE = /\b(?:app|router)\.(get|post|put|patch|delete|all)\(\s*['"`](\/[^'"`]*)['"`]/g;
/** The routes a server file REGISTERS: [{ method, path }] (`app.get('/api/x', …)` / `router.post(…)` — the path as
 *  spelled, params kept). A route built at run time has no literal: the sentinel's census cannot see it either. */
export function routesOf(text) {
  return [...String(text || '').matchAll(ROUTE_RE)].map((m) => ({ method: m[1].toUpperCase(), path: m[2] }));
}

/** A file's OWN tokens: `mod:` its path, the window types it registers, every '/api/…' it spells and — a client
 *  module (src/lib/, public/) — the classes it draws. */
export function ownTokens(rel, text, { types = new Map() } = {}) {
  const out = new Set(['mod:' + rel]);
  const t = String(text || '');
  if (rel.startsWith('data/bin/')) out.add('bin:' + rel.slice('data/bin/'.length));
  for (const [ty, r] of types) if (r.file === rel) out.add('win:' + ty);
  apiTokens(t, out);
  if (rel.startsWith('src/lib/') || rel.startsWith('public/')) {
    for (const m of t.matchAll(/\bclass(?:Name)?\s*[=:]\s*['"`]([^'"`]+)['"`]/g)) for (const c of m[1].split(/\s+/)) if (/^[A-Za-z_][\w-]*$/.test(c)) out.add('cls:' + c);
    for (const m of t.matchAll(/\bclassList\.(?:add|toggle|remove|replace)\(\s*['"`]([A-Za-z_][\w-]*)['"`]/g)) out.add('cls:' + m[1]);
  }
  return out;
}
/** What ONE importer adds to a file's attribution: its `mod:`, the window types it registers, the routes it mounts. */
export function hopTokens(rel, text, { types = new Map() } = {}) {
  const out = new Set(['mod:' + rel]);
  for (const [ty, r] of types) if (r.file === rel) out.add('win:' + ty);
  for (const r of routesOf(text)) { const k = apiToken(r.path); if (k) out.add(k); }
  return out;
}

/** THE HUBS: `importers` = Map rel → Set of the src files that import it. A src module ≥ HUB_MIN src/lib modules import
 *  is a hub; every module a hub imports (transitively) runs wherever the hub runs. `imports` = Map rel → Set it
 *  imports. → Map rel → why ('<n> src/lib importers' | 'imported by the hub <rel>'). */
export function hubModules(importers, imports, { min = HUB_MIN } = {}) {
  const hubs = new Map();
  for (const [rel, by] of importers) {
    const n = [...by].filter((f) => f.startsWith('src/lib/')).length;
    if (n >= min && rel.startsWith('src/')) hubs.set(rel, `${n} src/lib importers`);
  }
  const queue = [...hubs.keys()];
  while (queue.length) {
    const h = queue.shift();
    for (const d of imports.get(h) || []) if (d.startsWith('src/') && !hubs.has(d)) { hubs.set(d, `imported by the hub ${h}`); queue.push(d); }
  }
  return hubs;
}

/** The composition roots: the boot entries (server.js, the bundle's entry) and every module that imports ≥ ROOT_MIN src
 *  modules — it imports everything, so what it registers or mounts is never the imported module's. */
export function compositionRoots(imports, { entries = [], min = ROOT_MIN } = {}) {
  const roots = new Set(entries);
  for (const [rel, s] of imports) if (s.size >= min) roots.add(rel);
  return roots;
}
/** The classes ≥ SHARED_CLS_MIN client modules draw (a shared look — never a module's own key). `draws` = Map rel →
 *  Set of the cls: tokens it draws. */
export function sharedClasses(draws, { min = SHARED_CLS_MIN } = {}) {
  const n = new Map();
  for (const ks of draws.values()) for (const k of ks) n.set(k, (n.get(k) || 0) + 1);
  return new Set([...n].filter(([, c]) => c >= min).map(([k]) => k));
}

/** The data/bin programs a server module SPAWNS (its name on a line with spawn( / execFile( / fork( / path.join( /
 *  resolve( / BIN / a bin/ path): a session wrapper, a keeper, a hook — kept on the old rule. An agent CLI no server module spawns
 *  (vibespace-msg …) reaches only the suites that run it and the routes it calls. `files` = [[rel, text]] (server
 *  files); → Map name → the first server file that spawns it. */
export function spawnedPrograms(names, files) {
  const out = new Map();
  for (const [rel, text] of files) for (const line of stripComments(text).split('\n')) {
    if (!/\bspawn(?:Sync)?\(|\bexecFile(?:Sync)?\(|\bfork\(|\bpath\.(?:join|resolve)\(|\bresolve\(|\bBIN\b|bin\//.test(line)) continue;
    for (const n of names) if (!out.has(n) && line.includes(n) && new RegExp(`(?<![\\w-])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(line)) out.set(n, rel);
  }
  return out;
}

/** A changed product file's attribution. `ctx` = { textOf(rel), importersOf(rel) → [rel], hubs (hubModules), types,
 *  roots (compositionRoots), sharedCls (sharedClasses), spawned (spawnedPrograms), tables (rel → rule: the shared
 *  tables scripts/affected-model.mjs models — the dictionaries, the settings schema, the stylesheet) }. A client module
 *  (src/lib/) answers `client: true`: only a suite that drives a browser runs it. → { all: 'ALL' | 'ALL-BROWSER' | null, tokens: Set, why }. */
export function attribution(rel, ctx) {
  if (KEPT_BOOT[rel]) return { all: 'ALL', tokens: new Set(), why: `kept: ${KEPT_BOOT[rel]}` };
  if (rel.startsWith('public/')) return { all: 'ALL-BROWSER', tokens: new Set(['mod:' + rel]), why: 'a page asset — drawn only in a browser' };
  if (rel.startsWith('data/bin/') && ctx.spawned && ctx.spawned.has(rel.slice('data/bin/'.length))) return { all: 'ALL', tokens: new Set(['mod:' + rel]), why: `a program the product spawns (${ctx.spawned.get(rel.slice('data/bin/'.length))}) — which window shows its work no grep can tell` };
  const hub = ctx.hubs && ctx.hubs.get(rel);
  if (hub) return { all: 'ALL-BROWSER', tokens: new Set(['mod:' + rel]), why: `a hub module (${hub}) — on every page` };
  if (ctx.tables && ctx.tables[rel]) return { all: 'ALL-BROWSER', tokens: new Set(['mod:' + rel]), why: `a shared table (${ctx.tables[rel]}) — read on every page` };
  const tokens = ownTokens(rel, ctx.textOf(rel), { types: ctx.types });
  if (ctx.sharedCls) for (const k of ctx.sharedCls) tokens.delete(k);
  const roots = ctx.roots || new Set(['server.js']);
  const by = (ctx.importersOf ? ctx.importersOf(rel) : []).filter((f) => !roots.has(f) && f !== rel);
  for (const f of by) for (const k of hopTokens(f, ctx.textOf(f), { types: ctx.types })) tokens.add(k);
  const client = rel.startsWith('src/lib/');
  return { all: null, client, tokens, why: `${client ? 'a client module, ' : ''}${tokens.size} token(s)${by.length ? ` (+ ${by.length} importer${by.length > 1 ? 's' : ''})` : ''}` };
}

// Comments stripped line by line (string state resets at each newline, block comments carry) — ci.mjs's own rule.
export function stripComments(src) {
  let inBlock = false;
  return String(src || '').split('\n').map((line) => {
    let out = '', quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i], n = line[i + 1];
      if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
      if (quote) { out += c; if (c === '\\') { out += n === undefined ? '' : n; i++; } else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; out += c; continue; }
      if (c === '/' && n === '/') break;
      if (c === '/' && n === '*') { inBlock = true; i++; continue; }
      out += c;
    }
    return out;
  }).join('\n');
}

/** Do two tokens meet? Equal, or `api:x` (one segment) against `api:x/…`. */
export function tokensMeet(a, b) {
  if (a === b) return true;
  if (!a.startsWith('api:') || !b.startsWith('api:')) return false;
  const A = a.slice(4), B = b.slice(4);
  return (!A.includes('/') && B.startsWith(A + '/')) || (!B.includes('/') && A.startsWith(B + '/'));
}
/** The pairs [reachToken, attributionToken] where `reach` meets `tokens` (Set) — at most `cap`. */
export function meet(reach, tokens, cap = 3) {
  const out = [];
  const seg1 = new Set([...tokens].filter((k) => k.startsWith('api:')).map((k) => k.slice(4).split('/')[0]));
  for (const r of reach) {
    if (tokens.has(r)) out.push([r, r]);
    else if (r.startsWith('api:')) {
      const [s1, s2] = r.slice(4).split('/');
      if (s2 && tokens.has('api:' + s1)) out.push([r, 'api:' + s1]);
      else if (!s2 && seg1.has(s1)) out.push([r, [...tokens].find((k) => k.startsWith(`api:${s1}/`))]);
    }
    if (out.length >= cap) break;
  }
  return out;
}

/** The derived tokens that matter for the census and for "empty": every kind but `cls:`. */
export const reachCore = (tokens) => [...tokens].filter((k) => !k.startsWith('cls:'));
/** A suite's EFFECTIVE reach: { all: bool, tokens: Set, why } from its row's `reach` (declared) and the derivation. */
export function effectiveReach(declared, derived) {
  if (declared === 'all') return { all: true, tokens: derived, why: "reach 'all' (declared)" };
  if (Array.isArray(declared)) return { all: false, tokens: new Set([...declared, ...derived]), why: 'declared' };
  if (!reachCore(derived).length) return { all: true, tokens: derived, why: "reach 'all' (undeclared, derived empty)" };
  return { all: false, tokens: derived, why: 'derived' };
}
/** THE DECLARATION CENSUS: a declared row must hold every non-class token grep derives (an author's assertion may be
 *  wider, never blind); `reach: []` only beside a `reads:` list (the row's inputs are what it loads, names or reads).
 *  → the problems (empty = the row holds). Malformed declarations name themselves. */
export function declarationFindings(declared, derived, { reads = [] } = {}) {
  if (declared === undefined || declared === 'all') return [];
  if (!Array.isArray(declared)) return [`must be 'all' or an array of tokens (got ${JSON.stringify(declared)})`];
  const bad = declared.filter((k) => typeof k !== 'string' || !KINDS.includes(k.split(':')[0]) || k.indexOf(':') < 1);
  if (bad.length) return bad.map((k) => `not a token: ${JSON.stringify(k)} (kinds: ${KINDS.join(' ')})`);
  // [] = "no product file reaches it but what it loads, names or reads" — only beside a reads: list that says what
  if (!declared.length && !(reads && reads.length)) return ["an empty reach: [] beside no reads: selects nothing for a product change — declare tokens or 'all'"];
  const have = new Set(declared);
  return reachCore(derived).filter((k) => !have.has(k) && !declared.some((d) => tokensMeet(d, k) && !d.slice(4).includes('/'))).map((k) => `derived ${k} is not declared`);
}

/** ONE booting suite against ONE changed file's attribution: { hit, why }. `suite` = { reach (effectiveReach),
 *  browser: bool }. */
export function reachVerdict(suite, file, attr) {
  if (attr.all === 'ALL') return { hit: true, why: `${file} ${attr.why}` };
  if (attr.all === 'ALL-BROWSER') return suite.browser ? { hit: true, why: `drives a browser ∩ ${file} (${attr.why})` } : { hit: false, why: `drives no browser ∌ ${file} (${attr.why})` };
  // a client module runs only in a page: a suite that drives no browser never executes it (a suite that bundles or
  // imports it in-process loads it — the old rule keeps that one before this rule is asked)
  if (attr.client && !suite.browser) return { hit: false, why: `drives no browser ∌ ${file} (a client module)` };
  if (suite.reach.all) return { hit: true, why: `${suite.reach.why} ∩ ${file}` };
  const pairs = meet(suite.reach.tokens, attr.tokens);
  if (pairs.length) return { hit: true, why: `reach ${pairs.map(([r, a]) => (r === a ? r : `${r}~${a}`)).join(', ')} ∩ ${file}` };
  return { hit: false, why: `reach {${short(reachCore(suite.reach.tokens))}} ∌ ${file} {${short(reachCore(attr.tokens))}}` };
}
const short = (xs, n = 6) => xs.slice(0, n).join(', ') + (xs.length > n ? `, … +${xs.length - n}` : '');

// ── THE SENTINEL'S GET CENSUS ──────────────────────────────────────────────────────────────────────────────────────
/** Every GET route under /api/ the server files register: [{ path, files: [rel] }] sorted by path. */
export function getRoutes(files) {
  const by = new Map();
  for (const [rel, text] of files) for (const r of routesOf(text)) {
    if (r.method !== 'GET' || !r.path.startsWith('/api/')) continue;
    if (!by.has(r.path)) by.set(r.path, []);
    if (!by.get(r.path).includes(rel)) by.get(r.path).push(rel);
  }
  return [...by.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([path, fs]) => ({ path, files: fs }));
}
/** The census of `routes` against `table` = { smoke: [path], skip: { path: reason }, query: { path: 'k={fill}' },
 *  answers: { path: { status: [5xx], why } } }: every derived GET is in exactly one of smoke / skip; a row no route
 *  answers is DEAD, and so is a query / answers row for a route that is not smoked (or an answers row with no why).
 *  → { smoke, skip, unclassified, both, dead, reasonless }. */
export function getCensus(routes, table) {
  const smoke = new Set(table.smoke || []), skip = table.skip || {};
  const paths = new Set(routes.map((r) => r.path));
  const extra = [...Object.keys(table.query || {}), ...Object.keys(table.answers || {})].filter((p) => !smoke.has(p) || !paths.has(p));
  const answersWhy = Object.entries(table.answers || {}).filter(([, a]) => !(a && Array.isArray(a.status) && a.status.length && String(a.why || '').trim())).map(([p]) => p);
  return {
    smoke: routes.filter((r) => smoke.has(r.path)).map((r) => r.path),
    skip: routes.filter((r) => Object.prototype.hasOwnProperty.call(skip, r.path)).map((r) => r.path),
    unclassified: routes.filter((r) => !smoke.has(r.path) && !Object.prototype.hasOwnProperty.call(skip, r.path)).map((r) => `${r.path} (${r.files.join(', ')})`),
    both: [...smoke].filter((p) => Object.prototype.hasOwnProperty.call(skip, p)),
    dead: [...new Set([...[...smoke, ...Object.keys(skip)].filter((p) => !paths.has(p)), ...extra])],
    reasonless: [...Object.entries(skip).filter(([, why]) => !String(why || '').trim()).map(([p]) => p), ...answersWhy],
  };
}
/** A smoke URL for a route: every `:param` filled from `fill` (by name, then `*`), the optional `?` dropped. */
export function fillRoute(p, fill = {}) {
  return p.replace(/:([A-Za-z_]\w*)(\([^)]*\))?\??/g, (_, n) => encodeURIComponent(fill[n] ?? fill['*'] ?? 'sentinel-none')).replace(/\*$/, 'sentinel-none');
}
/** One smoked GET: non-5xx (the lost-export class presents as a 500 only when the route RUNS) — `allow` = the 5xx a
 *  table row names as the route's deliberate answer on a scratch instance (503 'the jobs engine is starting') — a body
 *  the route types as JSON parses, within `budgetMs`. → { ok, status, ms, why }. */
export function getVerdict({ status, type = '', body = '', ms = 0, budgetMs = 2000, allow = [] } = {}) {
  if (!(status > 0) || (status >= 500 && !allow.includes(status))) return { ok: false, status, ms, why: `${status} — a route that throws when it runs (the lost-export class)` };
  if (/\bjson\b/i.test(type)) { try { JSON.parse(body); } catch (e) { return { ok: false, status, ms, why: `says JSON, the body does not parse (${String(e.message).slice(0, 80)})` }; } }
  if (ms > budgetMs) return { ok: false, status, ms, why: `slow: ${ms} ms > ${budgetMs} ms` };
  return { ok: true, status, ms, why: String(status) };
}
/** One window-type open: the replay did not throw, no console error, no uncaught exception, a window of that type
 *  appeared. `events` = [{ kind: 'console.error' | 'uncaught', text }]. → { ok, why }. */
export function windowVerdict({ type, threw = null, types = [], events = [] } = {}) {
  if (threw) return { ok: false, why: `the replay threw — ${threw}` };
  const errs = events.filter((e) => e.kind === 'console.error' || e.kind === 'uncaught');
  if (errs.length) return { ok: false, why: errs.map((e) => `${e.kind}: ${e.text}`).join(' | ') };
  if (!types.includes(type)) return { ok: false, why: `no ${type} window appeared (${types.length ? 'got ' + types.join(', ') : 'none'})` };
  return { ok: true, why: 'opened' };
}
