'use strict';
// THE PRICE TABLE'S THREE SOURCES (lane cli-update-needs-nothing, ruling R3). PURE. The effective table usage-history prices
// with = the table on disk (data/usage-history/pricing.json: the shipped rows + what a PERSON typed) ⊕ the installed Claude
// Code's own catalog (src/claude-model-catalog.js priceLayerOf). The rule, in order:
//   1. THE PERSON FIRST, PER MODEL (acceptance r1, law B) — a row on disk that equals no shipped row is the person's
//      (setPricing writes every merged row, so equality is the only witness on disk). If the row a model falls on WITHOUT
//      the catalog is the person's — its own key, a FAMILY row they edited, a custom key they added — the catalog adds
//      nothing under it for that model (said once: the person's row is the one in force). An ACCOUNT's override shields
//      THAT account only: usage-history `_rateFor` applies it to the model's catalog row too (fileTierOf below), and every
//      other account gets the catalog's price.
//   2. An id with its OWN shipped row (its key = the id without `claude-`) that disagrees with the catalog: the NEWER source
//      wins — the catalog only if the CLI was BUILT after the day the shipped table was checked (`checked`, a YYYY-MM-DD); a
//      tie goes to the shipped row (the control).
//   3. An id whose shipped answer is a FAMILY row or `_default` yields to the catalog, which names the id itself.
// Every disagreement is returned (the hub says each ONCE in Diagnostics); an agreeing catalog adds no key at all.
const RATE_FIELDS = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'];
const sameLong = (x, y) => (!x && !y) || (!!x && !!y && x.above === y.above && RATE_FIELDS.every((f) => x[f] === y[f]));
const sameRates = (a, b) => !!a && !!b && RATE_FIELDS.every((f) => a[f] === b[f]) && sameLong(a.long, b.long) && !a.earlier && !b.earlier;
const sameRow = (a, b) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } };
const keysOf = (tiers) => Object.keys(tiers).filter((k) => k !== '_default').sort((a, b) => b.length - a.length);
const tierIn = (keys, model) => { const m = String(model || '').toLowerCase(); for (const k of keys) if (m.includes(k)) return k; return '_default'; };

/** → { pricing: { version, tiers, accounts, sources }, disagreements: [...] }. `file` is never mutated. */
function mergePricing(file, layer, { shipped = {}, checked = null } = {}) {
  const base = file && typeof file === 'object' ? file : { version: 2, tiers: {}, accounts: {} };
  const tiers = { ...(base.tiers || {}) };
  const sources = {};
  for (const k of Object.keys(tiers)) sources[k] = { from: Object.prototype.hasOwnProperty.call(shipped, k) && sameRow(tiers[k], shipped[k]) ? 'shipped' : 'you' };
  const disagreements = new Map();
  const rows = layer && layer.rows && typeof layer.rows === 'object' ? layer.rows : null;
  if (rows) {
    const checkedEnd = checked ? Date.parse(checked + 'T23:59:59.999Z') : NaN;
    // shorter keys first: a family member's own key (longer) is decided after the key it contains
    const order = Object.keys(rows).sort((a, b) => a.length - b.length || a.localeCompare(b));
    const decided = new Set();
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const k of order) {
        if (decided.has(k)) continue;
        const c = rows[k];
        const keys = keysOf(tiers);
        const probes = [c.id, c.firstParty].filter(Boolean);
        const at = probes.map((id) => tierIn(keys, id));
        const cur = at.map((key) => tiers[key] || tiers._default);
        if (cur.every((r) => sameRates(r, c.row))) continue; // the table already prices it as the CLI does
        const own = at[0] === k;
        const say = (used, fellOn, row) => disagreements.set(c.id, { id: c.id, label: c.label, key: k, fellOn, ours: row || null, catalog: c.row, used, cli: c.cli, builtAt: c.builtAt });
        if (own) {
          decided.add(k);
          if (sources[k] && sources[k].from === 'you') { say('you', k, tiers[k]); continue; }
          const newer = Number.isFinite(checkedEnd) && Date.parse(c.builtAt || '') > checkedEnd;
          say(newer ? 'catalog' : 'shipped', k, tiers[k]);
          if (newer) { tiers[k] = c.row; sources[k] = { from: 'catalog', cli: c.cli, builtAt: c.builtAt, id: c.id }; moved = true; }
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(tiers, k)) { decided.add(k); continue; } // a longer key holds the id: leave it
        const fellOn = at[0];
        if (sources[fellOn] && sources[fellOn].from === 'you') { decided.add(k); say('you', fellOn, tiers[fellOn]); continue; } // the person's family row / custom key stands for this model
        say('catalog', fellOn, tiers[fellOn] || tiers._default);
        tiers[k] = c.row; sources[k] = { from: 'catalog', cli: c.cli, builtAt: c.builtAt, id: c.id };
        decided.add(k); moved = true;
      }
      if (!moved) break;
    }
  }
  // fileKeys = the keys of the table WITHOUT the catalog (shipped + the person's): what a model falls on without it (law B1)
  return { pricing: { ...base, tiers, sources, fileKeys: Object.keys(base.tiers || {}) }, disagreements: [...disagreements.values()] };
}

/** setPricing's guard: a patched row equal to the CATALOG row of a key the disk does not hold stays the catalog's (never
 *  written to pricing.json — the person did not type anything new). → the patch's tiers that are really the person's. */
function personTiers(patchTiers, effective, file, patchSources = null) {
  const out = {};
  for (const [k, r] of Object.entries(patchTiers || {})) {
    // B3: an import never makes a person's row out of a row the EXPORTER knew as the catalog's (its own `sources` said so)
    const ps = patchSources && typeof patchSources === 'object' ? patchSources[k] : null;
    if (ps && ps.from === 'catalog') continue;
    const s = effective && effective.sources && effective.sources[k];
    if (s && s.from === 'catalog' && !(file && file.tiers && Object.prototype.hasOwnProperty.call(file.tiers, k)) && sameRow(r, effective.tiers[k])) continue;
    out[k] = r;
  }
  return out;
}

/** The key a model falls on in the table WITHOUT the catalog's keys (law B: an account override of that row shields that
 *  account's model even where the catalog added a longer key). `pricing` = the effective table (its `sources`). */
function fileTierOf(pricing, model) {
  // B1 (acceptance r2): read from the table as it is WITHOUT the catalog — never the merged table filtered by a source word
  // (a newer catalog that replaced a model's OWN shipped row says `catalog` on that key, yet the model never fell elsewhere)
  const src = (pricing && pricing.sources) || {};
  const base = Array.isArray(pricing && pricing.fileKeys) ? pricing.fileKeys : Object.keys((pricing && pricing.tiers) || {}).filter((k) => !(src[k] && src[k].from === 'catalog'));
  const keys = base.filter((k) => k !== '_default').sort((a, b) => b.length - a.length);
  return tierIn(keys, model);
}
/** The patched rows the EXPORTER's own `sources` called the catalog's — skipped by personTiers, and SAID to the importer by
 *  key (tidy, acceptance r3: an import never drops a typed row in silence; the person types it in the editor to keep it). */
function catalogSkips(patchTiers, patchSources) {
  const src = patchSources && typeof patchSources === 'object' ? patchSources : {};
  return Object.keys(patchTiers || {}).filter((k) => src[k] && src[k].from === 'catalog').sort();
}
module.exports = { mergePricing, personTiers, catalogSkips, sameRates, fileTierOf, RATE_FIELDS };
