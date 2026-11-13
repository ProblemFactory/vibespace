'use strict';
// THE INSTALLED CLAUDE CODE'S OWN SUBSCRIPTION VALUES, READ AS DATA (lane oat-add-door, 2.369.399 — the owner, 2026-11-13:
// a person adding an account by its long-lived token may pick the subscription type, and «订阅在改名» — the names a person
// reads change; the values the CLI reads do not). PURE: no I/O; the hub's reader (src/server/cli-model-catalog.js, the same
// streamed scan that finds the model catalog) hands in the text of each chunk. What is read, measured on 2.1.321:
//   · the TYPES: the CLI's own map from the vendor's organization type to its `subscriptionType` —
//     `new Map([["claude_max","max"],["claude_pro","pro"],["claude_enterprise","enterprise"],["claude_team","team"]])`;
//     the second word of each pair is a value the CLI itself writes and compares (`switch(subscriptionType){case"max":…}`);
//   · the TIERS: every `default_claude_<name>` string the CLI carries (`default_claude_max_20x`, `default_claude_max_5x`,
//     `default_claude_zero`) — `default_claude_zero` takes the CLI off the subscription road and is never offered (it is
//     returned in `withheld`, never in `tiers`).
// A value is never re-typed here: a binary whose map cannot be read yields `types: []`, and the door then offers only «sign in
// once» (src/plan-names.js planChoices). The binary is DATA FROM OUTSIDE: only the literal shapes below are matched, each value
// bounded to [a-z0-9_]{1,40}, at most MAX_VALUES of each kind.
const MAP_ANCHOR = /new Map\(\[(\["claude_[a-z0-9_]{1,40}","[a-z0-9_]{1,40}"\](?:,\["claude_[a-z0-9_]{1,40}","[a-z0-9_]{1,40}"\]){1,15})\]\)/;
const PAIR = /\["claude_([a-z0-9_]{1,40})","([a-z0-9_]{1,40})"\]/g;
const TIER = /\bdefault_claude_[a-z0-9_]{1,40}\b/g;
const WITHHELD_TIERS = Object.freeze(['default_claude_zero']);
const MAX_VALUES = 16;
// a maxed-out match window: the map sits inside one chunk's text, but a chunk boundary may cut it — the scanner keeps the
// tail of the previous chunk (CARRY characters) in front of the next one
const CARRY = 512;

/** A scanner over a binary's text, chunk by chunk: `feed(text)` for each chunk, `result()` at the end →
 *  { types: [...] (the CLI's subscriptionType values, map order), orgTypes: {value: orgType}, tiers: [...] (sorted, the
 *  withheld ones out), withheld: [...], anchor: true|false }; `found()` = the map was read (the reader stops scanning for it). */
function createPlanScanner() {
  let tail = '', mapText = null;
  const tiers = new Set();
  return {
    feed(text) {
      const s = tail + String(text || '');
      if (mapText == null) { const m = MAP_ANCHOR.exec(s); if (m) mapText = m[1]; }
      let t; TIER.lastIndex = 0;
      while ((t = TIER.exec(s)) && tiers.size < MAX_VALUES * 2) tiers.add(t[0]);
      tail = s.slice(-CARRY);
    },
    found() { return mapText != null; },
    result() { return planCatalogOf(mapText, [...tiers]); },
  };
}
/** PURE: the catalog from the map's pair list and the tier strings seen. */
function planCatalogOf(mapText, tierStrings = []) {
  const types = [], orgTypes = {};
  if (typeof mapText === 'string') {
    let p; PAIR.lastIndex = 0;
    while ((p = PAIR.exec(mapText)) && types.length < MAX_VALUES) {
      const org = p[1], value = p[2];
      if (!types.includes(value)) { types.push(value); orgTypes[value] = 'claude_' + org; }
    }
  }
  const all = [...new Set((Array.isArray(tierStrings) ? tierStrings : []).filter((x) => typeof x === 'string' && /^default_claude_[a-z0-9_]{1,40}$/.test(x)))].sort();
  return { anchor: types.length > 0, types, orgTypes, tiers: all.filter((x) => !WITHHELD_TIERS.includes(x)).slice(0, MAX_VALUES), withheld: all.filter((x) => WITHHELD_TIERS.includes(x)) };
}

module.exports = { createPlanScanner, planCatalogOf, MAP_ANCHOR, WITHHELD_TIERS, CARRY };
