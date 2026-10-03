'use strict';
/**
 * PRESET LAYERS — PURE (CJS; imports only the PURE integration registry, for
 * a row's label in the words). lane cluster-presets (B-53fe, 2026-10-01).
 *
 * A COMPANY PRESET (a Google OAuth client, a Lark app, a browser key the
 * cluster provides) reaches an instance from up to THREE places, lowest first:
 *
 *   1. the CLUSTER layer — ONE Secret every user's pod mounts
 *      (`<presets dir>/integrations.json`, `<presets dir>/gdrive-clients.json`);
 *   2. the RELEASE layer — the per-user override (`<presets dir>/override/…`,
 *      projected from the release's own Secret);
 *   3. the user's own key — never a preset: data/integrations.json or an
 *      account's own client, which `resolvePrecedence` / `pickPreset` already
 *      rank above every preset (this module never sees it).
 *
 * The merge is PER KEY: a release entry REPLACES the cluster entry with the
 * same identity (integrations: row id + preset key; Google clients: the
 * preset key) and adds the rest — so a user's override of ONE client never
 * hides the company's other clients. The environment (the integration store's and
 * MountManager's own env readers) is the FALLBACK rung they keep: a kind
 * the presets directory says nothing about (neither file present) falls back
 * to it, a present file — even `[]` — is the answer.
 *
 * The two parsers ARE the rules the env readers always applied (moved here
 * verbatim so the file and the env can never parse one block two ways).
 * Nothing here ever prints a value: `diffEntries` compares values to say
 * ROTATED, and names keys only.
 */
const R = require('./integration-registry.js');

const KINDS = Object.freeze(['integrations', 'gdrive']);
const LAYERS = Object.freeze(['cluster', 'release']);   // low → high

/** `[{id, key?, label?, values}]` → `[{id, key, label, values}]` — the rule
 *  the integrations env JSON has always been read with (an entry without an id
 *  or a values object is skipped; a missing key is 'default'). Throws on a
 *  value that is not an array. */
function parseIntegrations(arr) {
  if (!Array.isArray(arr)) throw new TypeError('not an array');
  const out = [];
  for (const e of arr) {
    if (!e || typeof e !== 'object' || !e.id || !e.values || typeof e.values !== 'object') continue;
    out.push({ id: String(e.id), key: e.key ? String(e.key) : 'default', label: e.label ? String(e.label) : null, values: Object.fromEntries(Object.entries(e.values).map(([k, v]) => [k, String(v)])) });
  }
  return out;
}
/** `[{key, label?, clientId, clientSecret}]` → the same, strings — the rule
 *  `VIBESPACE_GDRIVE_CLIENTS` has always been read with (an entry missing one
 *  of key / clientId / clientSecret is skipped). Throws on a non-array. */
function parseDriveClients(arr) {
  if (!Array.isArray(arr)) throw new TypeError('not an array');
  const out = [];
  for (const c of arr) {
    if (c && c.key && c.clientId && c.clientSecret) out.push({ key: String(c.key), label: String(c.label || c.key), clientId: String(c.clientId), clientSecret: String(c.clientSecret) });
  }
  return out;
}
const PARSERS = Object.freeze({ integrations: parseIntegrations, gdrive: parseDriveClients });

/** An entry's identity inside its kind (what an override replaces). */
const identityOf = (kind, e) => (kind === 'integrations' ? `${e.id}\u0000${e.key}` : String(e.key));
/** A short, value-free name for the journal / the summary (`lark/jarvis`, `org1`). */
const nameOf = (kind, e) => (kind === 'integrations' ? `${e.id}/${e.key}` : String(e.key));
/** The value part of an entry, compared to say "rotated" — never printed. */
const valueOf = (kind, e) => (kind === 'integrations' ? JSON.stringify(Object.keys(e.values).sort().map((k) => [k, e.values[k]])) : JSON.stringify([e.clientId, e.clientSecret]));

/** THE MERGE, per key. `layers` = `{cluster, release}`, each an entry array or
 *  `null` (that layer's file is absent). Answers `null` when BOTH are absent —
 *  the presets directory says nothing about this kind and the caller falls
 *  back to the environment — else `{entries, layerOf}` (`layerOf[identity]` =
 *  the layer the entry in effect came from). Within one layer the FIRST entry
 *  of an identity wins (what `find` over the env list always answered). */
function mergeLayers(kind, layers = {}) {
  if (!PARSERS[kind]) throw new Error(`mergeLayers: unknown kind '${kind}'`);
  const present = LAYERS.filter((l) => Array.isArray(layers[l]));
  if (!present.length) return null;
  const entries = []; const at = new Map(); const layerOf = {};
  for (const layer of LAYERS) {
    const list = layers[layer];
    if (!Array.isArray(list)) continue;
    const seen = new Set();
    for (const e of list) {
      const id = identityOf(kind, e);
      if (seen.has(id)) continue;
      seen.add(id);
      if (at.has(id)) entries[at.get(id)] = e;
      else { at.set(id, entries.length); entries.push(e); }
      layerOf[id] = layer;
    }
  }
  return { entries, layerOf };
}

/** What changed between two entry lists of one kind, by NAME only:
 *  `{added, removed, rotated, relabeled}` (arrays of `nameOf`). `null` lists
 *  read as empty. Equal lists answer four empty arrays. */
function diffEntries(kind, prev, next) {
  const index = (list) => new Map((list || []).map((e) => [identityOf(kind, e), e]));
  const a = index(prev); const b = index(next);
  const out = { added: [], removed: [], rotated: [], relabeled: [] };
  for (const [id, e] of b) {
    const old = a.get(id);
    if (!old) { out.added.push(nameOf(kind, e)); continue; }
    if (valueOf(kind, old) !== valueOf(kind, e)) out.rotated.push(nameOf(kind, e));
    else if ((old.label || null) !== (e.label || null)) out.relabeled.push(nameOf(kind, e));
  }
  for (const [id, e] of a) if (!b.has(id)) out.removed.push(nameOf(kind, e));
  return out;
}
const diffEmpty = (d) => !d.added.length && !d.removed.length && !d.rotated.length && !d.relabeled.length;
/** The journal's words for one kind's diff (English, value-free), '' when nothing changed. */
function diffWords(kind, d) {
  if (diffEmpty(d)) return '';
  const bits = [];
  if (d.added.length) bits.push(`added ${d.added.join(', ')}`);
  if (d.removed.length) bits.push(`removed ${d.removed.join(', ')}`);
  if (d.rotated.length) bits.push(`rotated ${d.rotated.join(', ')}`);
  if (d.relabeled.length) bits.push(`relabeled ${d.relabeled.join(', ')}`);
  return `${kind === 'gdrive' ? 'Google clients' : 'integrations'}: ${bits.join('; ')}`;
}

// ── THE SUMMARY the Integrations window draws (P3) ────────────────────────
/** Compose the wire summary. `items` = `[{kind, source, n}]` where `kind` is
 *  `'gdrive'` or an integration row id and `source` ∈ cluster | release | env
 *  (0-counts dropped); `updatedAt` = when the presets directory last changed
 *  (ms) or null; `errors` = `[{layer, file, code, kept}]` (never a value; `kept` =
 *  the file's previous presets are still in effect). Groups
 *  keep the source order cluster → release → env and the items' order. */
const SOURCES = Object.freeze(['cluster', 'release', 'env']);
function summarize({ dir = null, items = [], updatedAt = null, loadedAt = null, errors = [] } = {}) {
  const groups = [];
  for (const source of SOURCES) {
    const its = items.filter((i) => i && i.source === source && Number(i.n) > 0).map((i) => ({ kind: String(i.kind), n: Number(i.n) }));
    if (its.length) groups.push({ source, items: its });
  }
  return { dir: dir || null, groups, updatedAt: Number.isFinite(updatedAt) ? updatedAt : null, loadedAt: Number.isFinite(loadedAt) ? loadedAt : null, errors: (errors || []).map((e) => ({ layer: String(e.layer), file: String(e.file), code: String(e.code), kept: !!e.kept })) };
}
/** Count `{kind, source, n}` items from entries tagged by layer. */
function countItems(kind, merged, source = null) {
  if (!merged) return [];
  const by = new Map();
  for (const e of merged.entries) {
    const k = kind === 'gdrive' ? 'gdrive' : e.id;
    const s = source || merged.layerOf[identityOf(kind, e)];
    const key = `${k}\u0000${s}`;
    by.set(key, { kind: k, source: s, n: ((by.get(key) && by.get(key).n) || 0) + 1 });
  }
  return [...by.values()];
}

/** One item in the device's words: "3 Google clients", "1 Lark app",
 *  "CloakBrowser key". `t` is the caller's translator. */
function itemWords(it, { t = (s, p) => fill(s, p) } = {}) {
  const n = Number(it.n) || 0;
  if (it.kind === 'gdrive') return n === 1 ? t('1 Google client') : t('{n} Google clients', { n });
  if (it.kind === 'lark') return n === 1 ? t('1 Lark app') : t('{n} Lark apps', { n });
  const row = R.rowById(it.kind);
  const label = row ? t(row.label) : it.kind;
  return n === 1 ? t('{label} key', { label }) : t('{n} {label} keys', { n, label });
}
function fill(s, p) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m)); }
/** THE LINE (P3): where this instance's company presets come from, and how
 *  fresh. `ago(ms)` words an age (the caller's). Answers
 *  `{text, none, errors:[sentence]}`. */
function presetsLine(summary, { t = (s, p) => fill(s, p), ago = null, now = Date.now() } = {}) {
  const s = summary || {};
  const groups = Array.isArray(s.groups) ? s.groups : [];
  const errors = (s.errors || []).map((e) => {
    const p = { file: e.layer === 'release' ? `override/${e.file}` : e.file, code: e.code };
    return e.kept ? t('The company presets file {file} could not be read ({code}) — the previous presets are kept.', p) : t('The company presets file {file} could not be read ({code}) — it offers no presets until it is fixed.', p);
  });
  if (!groups.length) return { text: t('Company presets: none — ask your admin.'), none: true, errors };
  const age = s.updatedAt && typeof ago === 'function' ? ago(now - s.updatedAt) : null;
  const parts = groups.map((g) => {
    const list = g.items.map((it) => itemWords(it, { t })).join(', ');
    if (g.source === 'env') return t('{list} — from the environment (a restart is needed to change them)', { list });
    const from = g.source === 'cluster' ? t('{list} — from the cluster', { list }) : t('{list} — from this release’s own values', { list });
    return age ? t('{from}, updated {ago}', { from, ago: age }) : from;
  });
  return { text: t('Company presets: {parts}', { parts: parts.join('; ') }), none: false, errors };
}

module.exports = {
  KINDS, LAYERS, SOURCES, PARSERS,
  parseIntegrations, parseDriveClients,
  identityOf, nameOf, mergeLayers, diffEntries, diffEmpty, diffWords,
  summarize, countItems, itemWords, presetsLine,
};
