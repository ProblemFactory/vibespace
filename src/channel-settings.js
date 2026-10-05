'use strict';
// CHANNEL SETTINGS — THE DECLARED PER-VENDOR TABLES (B-df40 part 3, 2026-10-03 —
// the design desk's settings-cleanup §2 P3). The harness precedent
// (src/harness-settings.js, docs/design-harness-settings.zh.md §2) applied to
// channel adapters. PURE: imports nothing, so the SAME file is bundled into the
// browser (settings-schema.js derives the Channels "Per vendor" rows from it),
// required by the adapters (lark.js / gmail.js spread budgetOf / paceOf into
// their caps — the table BY IDENTITY), by the registry (validateCaps refuses a
// settingKey its vendor's table does not declare) and by the engine
// (SETTING_BOUNDS derives the vendor bounds and defaults from it).
//
// ONE table per vendor: `{ vendor, vendorName, rows }`; `vendor` is the
// adapter's `kind` (the `when: { channel }` slug, the linked-accounts fact). A
// ROW is pure data — `{ key, role, type, default, min, max, step, label,
// description }` — and its persisted settings path is `channels.<key>`:
// TODAY's spelling, byte for byte, so data/settings.json and the registry's
// `^channels\.[A-Za-z0-9]+$` are untouched (zero migration). `role` is a
// CLOSED set (ROLES), one row per role at most:
//   budget  the account's per-minute budget in the vendor's unit —
//           caps.budget = { unit, metered, ...budgetOf(table) }  → { default, settingKey }
//   pace    the per-second pace (drain rule 18) —
//           caps.pace = { ...paceOf(table), cost }              → { unitsPerSec, settingKey }
// A NEW integration = one entry here + its adapter's caps spreading budgetOf /
// paceOf. Nothing else: the schema row, the engine's bound and default, the
// registry's acceptance all follow. A contributed (plugin) adapter would
// register its table over the wire like a contributed harness — not built
// (design S6: no plugin adapter exists).
//
// lane dc-channels-manifest: the tables are DECLARED in each vendor's manifest
// (src/channels/<vendor>/manifest.js) and only derived here; a table may also
// carry `options` — OPTION rows (OPTION_ROLES: a person's name form, a relay
// page) the schema derives in place and the adapter / engine read by role.
const VendorList = require('./channels/registry-list.js');   // lane dc-channels-manifest: PURE — the vendors' manifests

const PREFIX = 'channels';
const ROLES = Object.freeze(['budget', 'pace']);
const ROW_TYPES = Object.freeze(['number']);
const OPTION_ROLES = Object.freeze(['nameField', 'relayUrl']);   // lane dc-channels-manifest (rv C4 / F8): the option rows' closed roles
const OPTION_TYPES = Object.freeze(['enum', 'string']);
const KEY_RE = /^[A-Za-z0-9]+$/;            // the registry's `channels.<key>` shape, minus the prefix
const VENDOR_RE = /^[a-z][a-z0-9-]*$/;      // a `when: { channel }` slug (test-architecture 44e)

const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };

// lane dc-channels-manifest: DERIVED — each vendor's table is its manifest's `settings`
// (src/channels/<vendor>/manifest.js), in the vendor list's order (src/channels/registry-list.js).
const CHANNEL_SETTINGS = deepFreeze(VendorList.settingsTables());

/** The persisted settings path of a row — TODAY's spelling (`channels.budgetLarkPerMin`). */
function settingPath(key) { return `${PREFIX}.${key}`; }
/** The row of `table` whose role is `role`, or null. */
function rowOfRole(table, role) {
  if (!table || !Array.isArray(table.rows)) return null;
  return table.rows.find((r) => r && r.role === role) || (table.options || []).find((r) => r && r.role === role) || null;
}
function roleRow(table, role) {
  const r = rowOfRole(table, role);
  if (!r) throw new Error(`channel settings table ${JSON.stringify(table && table.vendor)} declares no ${role} row`);
  return r;
}
/** The adapter's `caps.budget` half the table owns: `{ default, settingKey }`. */
function budgetOf(table) { const r = roleRow(table, 'budget'); return { default: r.default, settingKey: settingPath(r.key) }; }
/** The adapter's `caps.pace` half the table owns: `{ unitsPerSec, settingKey }`. */
function paceOf(table) { const r = roleRow(table, 'pace'); return { unitsPerSec: r.default, settingKey: settingPath(r.key) }; }
/** The engine's bounds of every declared row: `{ 'channels.<key>': { dflt, min, max } }` — the row's own default. */
function boundsOf(tables) {
  const out = {};
  for (const tbl of Object.values(tables || {})) for (const r of (tbl && tbl.rows) || []) out[settingPath(r.key)] = { dflt: r.default, min: r.min, max: r.max };
  return out;
}
/** The settings path the vendor `kind` declares for `role`, or null (no table, or no row of that role). */
function declaredKey(kind, role, tables = CHANNEL_SETTINGS) {
  const tbl = Object.prototype.hasOwnProperty.call(tables, kind) ? tables[kind] : null;
  const r = rowOfRole(tbl, role);
  return r ? settingPath(r.key) : null;
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
function hasFunctionDeep(v, depth = 0) {
  if (typeof v === 'function') return true;
  if (!v || typeof v !== 'object' || depth > 6) return false;
  return Object.values(v).some((x) => hasFunctionDeep(x, depth + 1));
}
/** The table's problems in words ([] = valid): a vendor slug, a vendor name, closed roles (one row each), number
 *  rows with min ≤ default ≤ max and a positive step, the registry's key shape, words to show, pure data only. */
function checkChannelTable(table) {
  const errs = [];
  if (!isPlainObject(table)) return ['channel settings table must be an object'];
  if (typeof table.vendor !== 'string' || !VENDOR_RE.test(table.vendor)) errs.push(`vendor must be a lowercase slug (got ${JSON.stringify(table.vendor)})`);
  if (typeof table.vendorName !== 'string' || !table.vendorName.trim()) errs.push('vendorName must be a non-empty string');
  if (!Array.isArray(table.rows) || !table.rows.length) { errs.push('rows must be a non-empty array'); return errs; }
  if (hasFunctionDeep(table)) errs.push('a table is pure data — no functions (it must survive a JSON round trip)');
  const keys = new Set(), roles = new Set();
  table.rows.forEach((r, i) => {
    const at = `rows[${i}]${r && r.key ? ` (${r.key})` : ''}`;
    if (!isPlainObject(r)) { errs.push(`${at} must be an object`); return; }
    if (typeof r.key !== 'string' || !KEY_RE.test(r.key)) errs.push(`${at}: key must match ${KEY_RE} (the registry's channels.* shape)`);
    else if (keys.has(r.key)) errs.push(`${at}: duplicate key`);
    else keys.add(r.key);
    if (!ROLES.includes(r.role)) errs.push(`${at}: role must be one of ${ROLES.join('|')} (got ${JSON.stringify(r.role)})`);
    else if (roles.has(r.role)) errs.push(`${at}: a second ${r.role} row (one per role)`);
    else roles.add(r.role);
    if (!ROW_TYPES.includes(r.type)) errs.push(`${at}: type must be ${ROW_TYPES.join('|')}`);
    if (!isNum(r.default) || !isNum(r.min) || !isNum(r.max)) errs.push(`${at}: default, min and max must be finite numbers`);
    else if (!(r.min <= r.default && r.default <= r.max)) errs.push(`${at}: needs min ≤ default ≤ max (got ${r.min} / ${r.default} / ${r.max})`);
    else if (!(r.default > 0)) errs.push(`${at}: default must be positive (a budget or a pace of 0 never sends)`);
    if (r.step !== undefined && !(isNum(r.step) && r.step > 0)) errs.push(`${at}: step must be a positive number`);
    for (const f of ['label', 'description']) if (typeof r[f] !== 'string' || !r[f].trim()) errs.push(`${at}: ${f} must be a non-empty string`);
  });
  if (table.options !== undefined) {
    if (!Array.isArray(table.options)) errs.push('options must be an array');
    else table.options.forEach((r, i) => {
      const at = `options[${i}]${r && r.key ? ` (${r.key})` : ''}`;
      if (!isPlainObject(r)) { errs.push(`${at} must be an object`); return; }
      if (typeof r.key !== 'string' || !KEY_RE.test(r.key)) errs.push(`${at}: key must match ${KEY_RE} (the registry's channels.* shape)`);
      else if (keys.has(r.key)) errs.push(`${at}: duplicate key`);
      else keys.add(r.key);
      if (!OPTION_ROLES.includes(r.role)) errs.push(`${at}: role must be one of ${OPTION_ROLES.join('|')} (got ${JSON.stringify(r.role)})`);
      else if (roles.has(r.role)) errs.push(`${at}: a second ${r.role} row (one per role)`);
      else roles.add(r.role);
      if (!OPTION_TYPES.includes(r.type)) errs.push(`${at}: type must be ${OPTION_TYPES.join('|')}`);
      else if (r.type === 'enum' && !(Array.isArray(r.options) && r.options.length && r.options.every((o) => isPlainObject(o) && typeof o.value === 'string' && typeof o.label === 'string' && o.label.trim()) && r.options.some((o) => o.value === r.default))) errs.push(`${at}: an enum row needs options [{value, label}] holding its default`);
      else if (r.type === 'string' && typeof r.default !== 'string') errs.push(`${at}: a string row needs a string default`);
      if (r.tier !== undefined && r.tier !== 'advanced') errs.push(`${at}: tier is 'advanced' or absent`);
      for (const f of ['label', 'description']) if (typeof r[f] !== 'string' || !r[f].trim()) errs.push(`${at}: ${f} must be a non-empty string`);
    });
  }
  return errs;
}
/** Every table checked, plus what only the set can tell: the entry name IS its vendor, keys unique across vendors. */
function checkChannelTables(tables) {
  const errs = [];
  const seen = new Map();
  for (const [name, tbl] of Object.entries(tables || {})) {
    for (const e of checkChannelTable(tbl)) errs.push(`${name}: ${e}`);
    if (isPlainObject(tbl) && tbl.vendor !== name) errs.push(`${name}: vendor ${JSON.stringify(tbl.vendor)} is not its entry name`);
    for (const r of (isPlainObject(tbl) && Array.isArray(tbl.rows) ? [...tbl.rows, ...(Array.isArray(tbl.options) ? tbl.options : [])] : [])) {
      if (!r || typeof r.key !== 'string') continue;
      if (seen.has(r.key) && seen.get(r.key) !== name) errs.push(`${name}: key ${r.key} is also ${seen.get(r.key)}'s`);
      seen.set(r.key, name);
    }
  }
  return errs;
}

module.exports = {
  CHANNEL_SETTINGS, PREFIX, ROLES, ROW_TYPES, OPTION_ROLES, OPTION_TYPES, KEY_RE, VENDOR_RE,
  settingPath, rowOfRole, budgetOf, paceOf, boundsOf, declaredKey, checkChannelTable, checkChannelTables,
};
