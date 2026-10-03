// THE SETTINGS VIEW MODEL (B-df40 part 2, 2026-10-03 — the design desk's
// settings-cleanup §2 P2). PURE: no DOM, no imports — the Settings window and
// scripts/test-settings-view.mjs call the same functions, and `t` is passed in.
//
// Two OPTIONAL row fields, both pure data (a derived harness row and a plugin's
// row survive a JSON round trip with them):
//
//   tier: 'advanced'            absent = everyday. An advanced row draws only
//                               while the header's "Show advanced settings"
//                               switch is on; off, each category ends with
//                               "N advanced settings hidden · Show".
//   when: <clause> | [<clause>, …]   the row matters only while EVERY clause
//                               holds; otherwise it is HIDDEN (never greyed —
//                               charter rule 7), and a search still finds it,
//                               with a chip that says why in words.
//
// A clause carries exactly ONE tag of the CLOSED set WHEN_KINDS:
//   { setting: 'chat.compactMode', is: true }     another row's value equals
//   { setting: 'channels.offHoursTz', isNot: '' } …or differs from a value
//   { setting: 'x' }                              …or is truthy
//   { fact: 'vnc' | 'desktopApps' }               a machine fact the client holds
//   { harness: 'codex' }                          that CLI is installed here
//   { channel: 'lark' }                           an account of that vendor is linked
// A clause the client cannot decide (the fact is not known yet, the read
// failed, an unknown tag, a key without a row) HOLDS: ignorance hides nothing.
// test-architecture 44e refuses at build time a tag outside WHEN_KINDS, a
// `setting` naming a key without a row, a `fact` outside WHEN_FACTS and a
// `tier` outside TIERS — so the runtime leniency only ever meets a contributed
// table. Lane channel-declared-settings derives `when: { channel }` rows on
// top of this set; a new tag is a new WHEN_KINDS entry + its words below.

export const WHEN_KINDS = Object.freeze(['setting', 'fact', 'harness', 'channel']);
export const WHEN_FACTS = Object.freeze(['vnc', 'desktopApps']);
export const TIERS = Object.freeze(['advanced']);
/** localStorage key of the header switch (per device, beside the nav folds). */
export const SHOW_ADVANCED_KEY = 'vibespace.settingsAdvanced';

/** The clauses of a `when` (an object or an array of them; absent = none). */
export function whenClauses(when) {
  if (when == null) return [];
  return Array.isArray(when) ? when : [when];
}

/** The ONE WHEN_KINDS tag a clause carries; null for none or more than one. */
export function clauseKind(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const kinds = WHEN_KINDS.filter((k) => Object.prototype.hasOwnProperty.call(c, k));
  return kinds.length === 1 ? kinds[0] : null;
}

const same = (a, b) => a === b || (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));
const hasSet = (s) => !!s && typeof s.has === 'function';

/** true / false, or null when this client cannot decide (⇒ the clause holds). */
function clauseHolds(c, ctx) {
  const facts = (ctx && ctx.facts) || {};
  switch (clauseKind(c)) {
    case 'setting': {
      const v = ctx && typeof ctx.get === 'function' ? ctx.get(c.setting) : undefined;
      if (v === undefined) return null;
      if ('is' in c) return same(v, c.is);
      if ('isNot' in c) return !same(v, c.isNot);
      return !!v;
    }
    case 'fact': return typeof facts[c.fact] === 'boolean' ? facts[c.fact] : null;
    case 'harness': return hasSet(facts.harnesses) ? facts.harnesses.has(c.harness) : null;
    case 'channel': return hasSet(facts.channels) ? facts.channels.has(c.channel) : null;
    default: return null;
  }
}

/** The first clause of the row's `when` that is known to be false; null when the row is relevant. */
export function failingClause(row, ctx) {
  for (const c of whenClauses(row && row.when)) if (clauseHolds(c, ctx) === false) return c;
  return null;
}

/** Does this row matter here? `ctx = { get(key), facts: { vnc, desktopApps, harnesses: Set, channels: Set }, nameOf? }`. */
export function rowRelevant(row, ctx) { return failingClause(row, ctx) === null; }

/** WHY a row is not in use here, in words ('' when it is). `ctx.nameOf(kind, id)` names a row / harness / vendor. */
export function whyHidden(row, ctx, t = (s) => s) {
  const c = failingClause(row, ctx);
  return c ? clauseWords(c, ctx, t) : '';
}

function clauseWords(c, ctx, t) {
  const kind = clauseKind(c);
  const name = (id) => (ctx && typeof ctx.nameOf === 'function' && ctx.nameOf(kind, id)) || String(id);
  if (kind === 'setting') {
    const label = name(c.setting);
    if (('is' in c && c.is === true) || (!('is' in c) && !('isNot' in c))) return t('turn on “{label}” first', { label });
    if ('is' in c && c.is === false) return t('turn off “{label}” first', { label });
    if ('isNot' in c && c.isNot === '') return t('fill in “{label}” first', { label });
    if ('is' in c) return t('only used while “{label}” is {value}', { label, value: String(c.is) });
    return t('not used while “{label}” is {value}', { label, value: String(c.isNot) });
  }
  if (kind === 'fact' && c.fact === 'vnc') return t('this machine has no shared desktop (VNC)');
  if (kind === 'fact' && c.fact === 'desktopApps') return t('this machine has no display backend');
  if (kind === 'harness') return t('the {name} CLI is not installed on this machine', { name: name(c.harness) });
  if (kind === 'channel') return t('no {name} account is linked', { name: name(c.channel) });
  return t('not used in this setup');
}

/** What SettingsUI._renderContent draws. `categories` = the census list
 *  (SETTINGS_CATEGORIES — a row whose category is not listed is not drawn,
 *  exactly as before: test-architecture §44). The rules, in order:
 *   1. a SEARCH shows every match — relevance and tier ignored — each hidden
 *      row with its chip and the reason (the switch dialog's deep link);
 *   2. a MODIFIED row (value ≠ default) always shows, with its chips;
 *   3. otherwise a row whose `when` is false is not drawn, and a category with
 *      nothing left (no row, no hidden-advanced line) is not drawn — nor its
 *      nav item;
 *   4. an advanced row draws only while `showAdvanced`; off, its category
 *      counts it in `hiddenAdvanced` (the "N advanced settings hidden · Show"
 *      line). Rows rules 1–2 drew are never counted.
 *  Returns `{ sections, byCategory, drawn, hiddenAdvanced }`; a section is
 *  `{ category, rows: [{ path, schema, chips, advanced, modified, why }], hiddenAdvanced, show }`,
 *  a chip `{ kind: 'advanced' | 'unused' | 'reload', text, title? }`. */
export function settingsViewModel(schema, { categories = [], query = '', showAdvanced = false, ctx = {}, isModified = () => false, t = (s) => s } = {}) {
  const q = String(query || '').toLowerCase();
  const byCategory = {};
  for (const cat of categories) byCategory[cat] = { category: cat, rows: [], hiddenAdvanced: 0, show: false };
  for (const [path, row] of Object.entries(schema || {})) {
    const sec = byCategory[row && row.category];
    if (!sec) continue;
    if (q && !((row.label || '') + ' ' + (row.description || '') + ' ' + path).toLowerCase().includes(q)) continue;
    const why = whyHidden(row, ctx, t);
    const advanced = row.tier === 'advanced';
    const modified = !!isModified(path);
    if (!q && !modified) {
      if (why) continue;
      if (advanced && !showAdvanced) { sec.hiddenAdvanced++; continue; }
    }
    const chips = [];
    if (advanced) chips.push({ kind: 'advanced', text: t('advanced'), title: t('An advanced setting — shown while “Show advanced settings” is on') });
    if (why) chips.push({ kind: 'unused', text: t('not in use here: {why}', { why }), title: why });
    if (!row.liveApply) chips.push({ kind: 'reload', text: t('reload'), title: t('Requires page reload to take effect') });
    sec.rows.push({ path, schema: row, chips, advanced, modified, why });
  }
  const sections = categories.map((c) => byCategory[c]);
  let drawn = 0, hiddenAdvanced = 0;
  for (const s of sections) { s.show = s.rows.length > 0 || s.hiddenAdvanced > 0; drawn += s.rows.length; hiddenAdvanced += s.hiddenAdvanced; }
  return { sections, byCategory, drawn, hiddenAdvanced };
}

/** The line that ends a category while advanced rows are folded. */
export function hiddenAdvancedText(n, t = (s) => s) {
  return n === 1 ? t('1 advanced setting hidden') : t('{n} advanced settings hidden', { n });
}
