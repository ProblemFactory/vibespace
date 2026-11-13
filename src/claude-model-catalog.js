'use strict';
// THE INSTALLED CLAUDE CODE'S OWN MODEL CATALOG, READ AS DATA (lane cli-update-needs-nothing, 2.369.390 — the owner's founding
// requirement, 2026-03-22 item 7: an ordinary Claude Code update needs no update of this project). PURE: no I/O; the hub's
// reader (src/server/cli-model-catalog.js) hands in the bytes. Every Claude Code build carries ONE baked catalog literal
// (measured on 2.1.312 / .314 / .319 / .321: `var X={"//":"Hand-maintained baked-in model catalog …",schema_version:1,
// pricing_tiers:{…},models:[…],aliases:{…},defaults:{},best:"…",latest_per_family:{…},alias_migration:{}}`, ~20 KB) and,
// beside its other constants, `VERSION:"2.1.321",…,BUILD_TIME:"2026-11-09T15:53:28Z"`. The binary is DATA FROM OUTSIDE:
// the literal is parsed by a strict grammar (objects, arrays, strings, numbers, !0/!1, null, void 0 — anything else is
// refused by name; nothing is ever evaluated), and every field is validated by the provider record's own validators
// (src/model-providers.js) — a value out of bounds is refused by name, never clamped, and its id keeps the shipped row.
const MP = require('./model-providers.js');

// 2 (lane oat-add-door, 2.369.399): the same streamed read also reads the CLI's own subscription values (src/claude-plan-catalog.js)
// — a binary read by 1 is read once more
const READER_VERSION = 2;
const ANCHOR = 'schema_version:1,pricing_tiers:{';
const LITERAL_MAX = 512 * 1024;
const BACK_MAX = 4096;          // how far before the anchor the literal's `{` may sit (the `"//"` comment is ~250 B)
const DEPTH_MAX = 12, ARRAY_MAX = 2000, STRING_MAX = 4096;
// THE LOOP LAW (acceptance r1, law D): one read's synchronous work is bounded whatever the file — at most START_TRIES
// candidate starts, and PARSE_BUDGET characters parsed across all of them (a crafted file with nested openings before
// the anchor held the loop 339–364 ms with 64 full tries; the real catalog parses in ~2 ms from its first start)
const START_TRIES = 8, PARSE_BUDGET = LITERAL_MAX; // one window's worth in all (the real catalog, ~22 KB, parses from its first start)
// a family / an alias / a key that is a built-in property name is refused by name (r1: `constructor`, `toString`, …)
const RESERVED = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype', '__proto__']);
const RATE_MAX = 1000;          // $ per million tokens: Opus 3 was $75 output, the preview tiers $125 — 1000 is far above any
const OUTPUT_MAX = 10000000;
const FAMILY = /^[a-z][a-z0-9]{0,23}$/;
const ALIAS = /^[a-z][a-z0-9-]{0,23}$/;
const TIER_NAME = /^[A-Za-z0-9_]{1,64}$/;
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// The ids 2.1.321's catalog names (the newest this release read). An id OUTSIDE this list is what the maintainers want to
// hear about first (the `cli-unknown-model` event); it changes NO behaviour — every reader takes the catalog as it is.
const KNOWN_CATALOG_IDS = Object.freeze(['claude-3-5-haiku', 'claude-haiku-4-5', 'claude-haiku-5-5', 'claude-3-5-sonnet', 'claude-3-7-sonnet',
  'claude-sonnet-4-0', 'claude-sonnet-4-5', 'claude-sonnet-4-6', 'claude-sonnet-5', 'claude-sonnet-5-5', 'claude-opus-4-0', 'claude-opus-4-1',
  'claude-opus-4-5', 'claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8', 'claude-opus-5', 'claude-opus-5-5', 'claude-fable-5', 'claude-fable-5-1',
  'claude-fable-5-2', 'claude-mythos-5', 'claude-mythos-5-1', 'claude-mythos-5-2']);

/** THE STRICT LITERAL GRAMMAR. → { ok:true, value, end } or { ok:false, code, at } (at = offset from `start`). */
function parseLiteral(s, start) {
  let i = start, depth = 0;
  const fail = (code) => { const e = new Error(code); e.code = code; e.at = i - start; throw e; };
  const ws = () => { while (i < s.length && (s[i] === ' ' || s[i] === '\n' || s[i] === '\t' || s[i] === '\r')) i++; };
  const str = () => {
    const q = s[i++]; let out = '';
    while (i < s.length && s[i] !== q) {
      if (s[i] === '\\') {
        const c = s[i + 1]; i += 2;
        if (c === 'u') { const h = s.slice(i, i + 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) fail('bad-escape'); out += String.fromCharCode(parseInt(h, 16)); i += 4; }
        else if (c === 'n') out += '\n'; else if (c === 't') out += '\t'; else if (c === '"' || c === "'" || c === '\\' || c === '/') out += c;
        else fail('bad-escape');
      } else { if (s[i] === '\n') fail('newline-in-string'); out += s[i++]; }
      if (out.length > STRING_MAX) fail('string-long');
    }
    if (s[i] !== q) fail('unterminated-string');
    i++; return out;
  };
  const num = () => { const m = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i, i + 40)); if (!m) fail('bad-number'); i += m[0].length; return Number(m[0]); };
  const key = () => {
    ws();
    if (s[i] === '"') return str();
    const m = /^[A-Za-z_$][\w$]*/.exec(s.slice(i, i + 80));
    if (m) { i += m[0].length; return m[0]; }
    if (/[0-9]/.test(s[i] || '')) return String(num());
    return fail('bad-key');
  };
  const val = () => {
    ws();
    const c = s[i];
    if (c === '{') {
      if (++depth > DEPTH_MAX) fail('too-deep');
      i++; const o = Object.create(null); ws();
      if (s[i] === '}') { i++; depth--; return o; }
      for (;;) {
        const k = key(); ws();
        if (s[i] !== ':') fail('expected-colon');
        i++;
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') fail('forbidden-key');
        o[k] = val(); ws();
        if (s[i] === ',') { i++; ws(); if (s[i] === '}') { i++; break; } continue; }
        if (s[i] === '}') { i++; break; }
        fail('expected-comma');
      }
      depth--; return o;
    }
    if (c === '[') {
      if (++depth > DEPTH_MAX) fail('too-deep');
      i++; const a = []; ws();
      if (s[i] === ']') { i++; depth--; return a; }
      for (;;) {
        a.push(val()); if (a.length > ARRAY_MAX) fail('array-long'); ws();
        if (s[i] === ',') { i++; ws(); if (s[i] === ']') { i++; break; } continue; }
        if (s[i] === ']') { i++; break; }
        fail('expected-comma');
      }
      depth--; return a;
    }
    if (c === '"') return str();
    if (s.startsWith('!0', i)) { i += 2; return true; }
    if (s.startsWith('!1', i)) { i += 2; return false; }
    if (s.startsWith('void 0', i)) { i += 6; return undefined; }
    for (const [w, v] of [['null', null], ['true', true], ['false', false]]) if (s.startsWith(w, i) && !/[\w$]/.test(s[i + w.length] || '')) { i += w.length; return v; }
    if (c === '-' || (c >= '0' && c <= '9') || (c === '.' && s[i + 1] >= '0' && s[i + 1] <= '9')) return num(); // `...x` (a spread) is no number
    return fail('not-a-literal');
  };
  try {
    const value = val();
    if (i - start > LITERAL_MAX) return { ok: false, code: 'literal-long', at: i - start };
    return { ok: true, value, end: i };
  } catch (e) { return { ok: false, code: e.code || 'parse', at: Number.isFinite(e.at) ? e.at : 0 }; }
}

/** The catalog literal in a text window that holds the anchor at `anchorAt`: the `{` that opens it is the nearest `={`
 *  before the anchor; failing that, every `{` stepping back (≤ BACK_MAX) until one parses into an object holding both
 *  `models` and `pricing_tiers`. → { ok:true, raw, start, bytes } or { ok:false, code, at }. */
function catalogIn(text, anchorAt) {
  const lo = Math.max(0, anchorAt - BACK_MAX);
  const tries = [];
  const eq = text.lastIndexOf('={', anchorAt);
  if (eq >= lo) tries.push(eq + 1);
  for (let j = anchorAt; j >= lo && tries.length < START_TRIES; j--) if (text[j] === '{' && !tries.includes(j)) tries.push(j);
  let first = null; // the refusal said is the PRIMARY candidate's (the `={` one): later tries only probe a different start
  let spent = 0, parsed = 0; // the work census (law D): starts parsed and characters parsed, returned with every answer
  for (const at of tries) {
    if (spent > PARSE_BUDGET) return { ...(first || { ok: false, code: 'parse-budget', at: 0 }), spent, parsed, candidates: tries.length };
    let r = parseLiteral(text, at);
    parsed++; spent += r.ok ? r.end - at : r.at + 1;
    // small r2 (1): a parse that ran into the window's END is a literal larger than the bound — named for what it is
    if (!r.ok && at + r.at >= text.length - 1) r = { ok: false, code: 'literal-long', at: r.at };
    if (!r.ok) { if (!first) first = r; continue; }
    const v = r.value;
    if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.models) && v.pricing_tiers && typeof v.pricing_tiers === 'object' && r.end > anchorAt) return { ok: true, raw: v, start: at, bytes: r.end - at, spent, parsed, candidates: tries.length };
  }
  return { ...(first || { ok: false, code: 'no-literal', at: 0 }), spent, parsed, candidates: tries.length };
}

/** The build's own identity strings: `VERSION:"x.y.z"` … `BUILD_TIME:"…Z"` (the same constants object). */
function identityIn(text) {
  const m = /VERSION:"(\d{1,4}\.\d{1,4}\.\d{1,6})"[^{}]{0,600}?BUILD_TIME:"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)"/.exec(text);
  return m ? { version: m[1], builtAt: m[2] } : null;
}

const isRate = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= RATE_MAX;
/** A catalog tier → the price row's shape ({input, output, cacheWrite5m, cacheWrite1h, cacheRead, long?}), or the refusal. */
function priceRowOf(tier) {
  if (!tier || typeof tier !== 'object') return { refused: 'price-missing' };
  const pick = (t) => ({ input: t.input, output: t.output, cacheWrite5m: t.cache_write_5m, cacheWrite1h: t.cache_write_1h, cacheRead: t.cache_read });
  const row = pick(tier);
  for (const [f, v] of Object.entries(row)) if (!isRate(v)) return { refused: 'price-range', field: f };
  if (!(row.input > 0 && row.output > 0)) return { refused: 'price-range', field: row.input > 0 ? 'output' : 'input' };
  const lp = tier.long_prompt;
  if (lp !== undefined && lp !== null) {
    const above = lp.above_prompt_tokens;
    if (!(Number.isInteger(above) && above >= 1 && above <= MP.CONTEXT_MAX)) return { refused: 'price-range', field: 'long.above' };
    const long = { above, ...pick(lp) };
    for (const f of ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead']) if (!isRate(long[f])) return { refused: 'price-range', field: 'long.' + f };
    row.long = long;
  }
  return { row };
}

/** THE VALIDATION: the raw literal → the ledger's view { models, aliases, latestPerFamily, best, refused[] }. */
function validateCatalog(raw) {
  const refused = [];
  const models = [];
  const ids = new Set();
  const no = (id, field, code) => { if (refused.length < 200) refused.push({ id: String(id || '').slice(0, MP.ID_MAX), field, code }); };
  const list = raw && Array.isArray(raw.models) ? raw.models : [];
  const tiers = raw && raw.pricing_tiers && typeof raw.pricing_tiers === 'object' ? raw.pricing_tiers : {};
  for (const m of list.slice(0, MP.MODELS_MAX)) {
    const id = m && typeof m.id === 'string' ? m.id : '';
    if (!id || id.length > MP.ID_MAX || !MP.ID_PATTERNS.anthropic.test(id)) { no(id, 'id', 'id-pattern'); continue; }
    if (ids.has(id)) { no(id, 'id', 'id-duplicate'); continue; }
    const family = typeof m.family === 'string' && FAMILY.test(m.family) ? m.family : null;
    if (!family) { no(id, 'family', 'family-pattern'); continue; }
    if (RESERVED.has(family)) { no(id, 'family', 'reserved-name'); continue; }
    ids.add(id);
    let label = typeof m.display_name === 'string' ? m.display_name.trim() : '';
    if (label && label.length > MP.LABEL_MAX) { no(id, 'display_name', 'label-long'); label = ''; }
    else if (label && /[\u0000-\u001f\u007f<>]/.test(label)) { no(id, 'display_name', 'label-chars'); label = ''; } // a control char or markup: refused for what it is
    const fp = m.provider_ids && typeof m.provider_ids.first_party === 'string' ? m.provider_ids.first_party : null;
    const firstParty = fp && fp.length <= MP.ID_MAX && MP.ID_PATTERNS.anthropic.test(fp) ? fp : null;
    if (fp && !firstParty) no(id, 'provider_ids.first_party', 'id-pattern');
    const ctx = m.context && typeof m.context === 'object' ? m.context : null;
    let window = null;
    if (ctx && ctx.window !== undefined) {
      if (Number.isInteger(ctx.window) && ctx.window >= 1 && ctx.window <= MP.CONTEXT_MAX) window = ctx.window; else no(id, 'context.window', 'context-range');
    }
    // a real 1M form: native, or the 1M beta (`maximum_window`); `supports_1m_suffix` alone only means the CLI accepts the spelling
    const oneM = ctx ? (ctx.native_1m === true ? 'native' : ctx.supports_1m_beta === true ? 'beta' : null) : null;
    const mo = m.max_output_tokens && typeof m.max_output_tokens === 'object' ? m.max_output_tokens : null;
    let maxOutput = null;
    if (mo && mo.default !== undefined) { if (Number.isInteger(mo.default) && mo.default >= 1 && mo.default <= OUTPUT_MAX) maxOutput = mo.default; else no(id, 'max_output_tokens.default', 'output-range'); }
    let price = null, tier = null;
    if (typeof m.pricing === 'string' && TIER_NAME.test(m.pricing)) {
      tier = m.pricing;
      const p = priceRowOf(Object.prototype.hasOwnProperty.call(tiers, tier) ? tiers[tier] : null);
      if (p.row) price = p.row; else no(id, 'price' + (p.field ? '.' + p.field : ''), p.refused);
    } else if (m.pricing !== undefined) no(id, 'pricing', 'tier-name');
    const caps = Array.isArray(m.capabilities) ? m.capabilities.filter((c) => typeof c === 'string') : [];
    models.push({
      id, family, label: label || id, firstParty, window, oneM, maxOutput, tier, price,
      defaultEffort: EFFORTS.includes(m.default_effort) ? m.default_effort : null, fast: caps.includes('fast_mode'),
      fallback: typeof m.fallback_3p === 'string' && MP.ID_PATTERNS.anthropic.test(m.fallback_3p) ? m.fallback_3p : null,
    });
  }
  if (list.length > MP.MODELS_MAX) no('', 'models', 'models-many');
  const aliases = {};
  for (const [name, a] of Object.entries(raw && raw.aliases && typeof raw.aliases === 'object' ? raw.aliases : {})) {
    const to = a && typeof a.default === 'string' ? a.default : null;
    if (!ALIAS.test(name)) { no(name, 'aliases', 'alias-name'); continue; }
    if (RESERVED.has(name)) { no(name, 'aliases', 'reserved-name'); continue; }
    if (!to || !ids.has(to)) { no(name, 'aliases.' + name, 'alias-target'); continue; }
    aliases[name] = to;
  }
  const latestPerFamily = {};
  for (const [fam, to] of Object.entries(raw && raw.latest_per_family && typeof raw.latest_per_family === 'object' ? raw.latest_per_family : {})) {
    if (RESERVED.has(fam)) { no(fam, 'latest_per_family', 'reserved-name'); continue; }
    if (FAMILY.test(fam) && typeof to === 'string' && ids.has(to)) latestPerFamily[fam] = to; else no(fam, 'latest_per_family', 'alias-target');
  }
  const best = raw && typeof raw.best === 'string' && Object.prototype.hasOwnProperty.call(aliases, raw.best) ? raw.best : null;
  return { ok: models.length > 0, models, aliases, latestPerFamily, best, refused };
}

const oneMForm = (id) => id + '[1m]';
const fmtWindow = (n) => (n >= 1000000 && n % 100000 === 0 ? `${n / 1000000}M` : n >= 1000 && n % 1000 === 0 ? `${n / 1000}k` : String(n));
const core = (id) => String(id || '').toLowerCase().replace(/^claude-/, '').replace(/\[1m\]$/i, '');

/** THE PICKER's rows for the installed CLI (ruling R4/R5): the seed aliases (and the catalog's own alias names), each labelled
 *  by what it means ON THIS CLI («fable · Fable 5.2 · 1M»); then per family the catalog's latest id + every id the shipped
 *  list names, each with its [1m] form when the CLI says it has one; rows carry the catalog's window as `context`. Any other
 *  catalog id stays reachable by typing it (the harness-listed provider is open). `view` null ⇒ the shipped rows as they are. */
function menuRows(view, seedAliases, seedKnown) {
  const seedA = Array.isArray(seedAliases) ? seedAliases : [], seedK = Array.isArray(seedKnown) ? seedKnown : [];
  if (!view || !Array.isArray(view.models) || !view.models.length) return [...seedA, ...seedK];
  const byId = new Map(view.models.map((m) => [m.id, m]));
  const byCore = new Map();
  for (const m of view.models) { byCore.set(core(m.id), m); if (m.firstParty) byCore.set(core(m.firstParty), m); }
  const sizeOf = (m, oneM) => (oneM ? 1000000 : m.window);
  const aliasRow = (name) => {
    const bare = name.replace(/\[1m\]$/i, ''), oneM = bare !== name;
    const to = view.aliases && view.aliases[bare] ? byId.get(view.aliases[bare]) : null;
    if (!to) return null;
    const n = sizeOf(to, oneM);
    return { id: name, label: `${name} · ${to.label}${n ? ' · ' + fmtWindow(n) : ''}`, context: n || null, resolves: to.id };
  };
  const rows = [], seen = new Set();
  const push = (r) => { if (r && !seen.has(r.id)) { seen.add(r.id); rows.push(r); } };
  for (const a of seedA) push(a && a.id ? (aliasRow(a.id) || a) : a);
  for (const name of Object.keys(view.aliases || {})) {
    push(aliasRow(name));
    const to = byId.get(view.aliases[name]);
    if (to && to.oneM) push(aliasRow(name + '[1m]'));
  }
  const full = (m, id) => {
    push({ id, label: m.label, context: m.window || null });
    if (m.oneM && !/\[1m\]$/i.test(id)) push({ id: oneMForm(id), label: `${m.label} [1m]`, context: 1000000 });
  };
  for (const k of seedK) {
    const m = k && k.id ? byCore.get(core(k.id)) : null;
    if (!m) { push(k); continue; }
    if (/\[1m\]$/i.test(k.id)) push({ id: k.id, label: `${m.label} [1m]`, context: 1000000 });
    else full(m, k.id);
  }
  for (const fam of Object.keys(view.latestPerFamily || {})) { const m = byId.get(view.latestPerFamily[fam]); if (m) full(m, m.id); }
  const seedIds = new Set([...seedA, ...seedK].map((r) => r && r.id));
  return rows.map((r) => (r && seedIds.has(r.id) ? { ...r, seed: true } : r)); // `seed`: a row the shipped lists name (remoteRows keeps only those)
}

/** The catalog's family PER MODEL (acceptance r2, law C final): an exact map, the id's core (no `claude-`, no `[1m]`) and its
 *  first-party (dated) id's core → the family. model-family reads it by id, never as a word; its quota LANE is decided per
 *  account's reading (a reading that carries a bucket of the family's whole name) — src/model-family.js. */
function familiesOf(view) {
  const map = {};
  for (const m of (view && Array.isArray(view.models) ? view.models : [])) { map[core(m.id)] = m.family; if (m.firstParty) map[core(m.firstParty)] = m.family; }
  return map;
}
/** small r2 (6): EVERY door that lists models for ANOTHER machine (the New Session menu, a running conversation's menu)
 *  answers through ONE parameter: the rows the shipped lists name, aliases plain (label = the alias), no size claimed —
 *  nothing this hub's catalog alone knows. Reading that machine's own catalog is a later lane. */
function remoteRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const anySeed = list.some((r) => r && r.seed);
  return list.filter((r) => r && (r.id === '' || r.seed || !anySeed)).map((r) => (r.id === '' ? { id: '', label: r.label } : /^claude-/.test(r.id) ? { id: r.id, label: r.label } : { id: r.id, label: r.id }));
}

/** THE ALIAS GUARD (census rows M10/M11): the lock's modelsMatch and the chip's sameModel hold an alias family-wide by its WORD
 *  (`fable` ~ `claude-fable-5-2`). True for every alias of 2.1.312–.321; → the aliases whose target does NOT start with the
 *  alias word (a catalog that breaks the rule — the hub says it once in Diagnostics). */
function aliasGuard(view) {
  const out = [];
  for (const [name, to] of Object.entries((view && view.aliases) || {})) if (!core(to).startsWith(name)) out.push({ alias: name, to });
  return out;
}

/** The price layer for the price table (src/catalog-pricing.js merges it): the union of every catalog read, the newest build
 *  winning per id. Keys = the id without `claude-` (the longest-substring rule of usage-history _tier). Install an OLDER
 *  claude and the model LIST is the installed one's, while a price a newer build knew stays (it is the newest statement). */
function priceLayerOf(entries) {
  const rows = {};
  const sorted = (Array.isArray(entries) ? entries : []).filter((e) => e && e.state === 'read' && Array.isArray(e.models)).sort((a, b) => String(a.builtAt || '').localeCompare(String(b.builtAt || '')));
  for (const e of sorted) for (const m of e.models) {
    if (!m.price) continue;
    rows[core(m.id)] = { id: m.id, firstParty: m.firstParty || null, label: m.label, row: m.price, cli: e.cli || null, builtAt: e.builtAt || null };
  }
  return Object.keys(rows).length ? { rows } : null;
}

module.exports = {
  READER_VERSION, ANCHOR, LITERAL_MAX, RATE_MAX, KNOWN_CATALOG_IDS, START_TRIES, PARSE_BUDGET,
  parseLiteral, catalogIn, identityIn, priceRowOf, validateCatalog, menuRows, familiesOf, remoteRows, aliasGuard, priceLayerOf, fmtWindow, core,
};
