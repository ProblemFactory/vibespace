'use strict';
// A CUSTOM THEME'S VALUES A DERIVATION SUPERSEDED — PURE (CJS, imports nothing): the ONE rule the store's ONE writer
// (src/routes/persistence.js writeCustomThemes — the POST save, the delete, the config import) and the one-shot boot migration
// over what was already on disk (src/server/migrations.js 2026-11-warmth-ramp-derived) both apply.
// q-059 r5 (lane cache-warmth-ramp): the .374 theme editor seeded each «Cache warmth» row with its `derived` string and a save
// stored it in the custom theme — data/custom-themes.json is ROWS `{ <name>: { css: { '--key': 'value' }, terminal } }` — whose
// injected `[data-theme="custom-…"]` rule outranks style.css, so the theme kept the «two greens» after the derivation moved to
// the raw hues. A value byte-equal to ITS superseded string is dropped (the derivation applies); any other value is the
// person's and stays.
//   SUPERSEDED_WARMTH           the five .374 strings by key (the only ones ever shipped — d4352c86f), byte-exact
//   normalizeCustomThemes(doc)  → { doc, changed, themes, dropped, kept, skipped }
//     `doc` is never mutated: changed ⇒ a NEW store, else the one that came in. dropped = { <theme>: [keys] }; kept = the
//     warmth values the person chose; skipped = the names whose theme or css is not an object (kept as they are). Every
//     by-name map is PROTOTYPE-LESS (r3, the acceptance of 3ba074455: an Object accumulator threw on a theme named
//     `constructor` and an assignment to `__proto__` set a prototype instead of keeping the theme) — a theme named
//     `constructor`, `toString` or `__proto__` is a theme like any other.
const SUPERSEDED_WARMTH = Object.freeze({
  '--warmth-fresh': 'var(--ok-text)',
  '--warmth-mid': 'var(--accent)',
  '--warmth-late': 'var(--warn-text)',
  '--warmth-critical': 'var(--bad-text)',
  '--warmth-expired': 'var(--border)',
});
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

function normalizeCustomThemes(doc) {
  const dropped = Object.create(null), skipped = [];
  let themes = 0, kept = 0;
  if (!isObj(doc)) return { doc, changed: false, themes, dropped, kept, skipped };
  const out = Object.create(null);
  for (const name of Object.keys(doc)) {
    const theme = doc[name];
    themes++;
    if (!isObj(theme) || !isObj(theme.css)) { skipped.push(name); out[name] = theme; continue; }
    const css = Object.create(null);
    let gone = null;
    for (const k of Object.keys(theme.css)) {
      const v = theme.css[k];
      if (own(SUPERSEDED_WARMTH, k)) {
        if (v === SUPERSEDED_WARMTH[k]) { (gone = gone || []).push(k); continue; }
        kept++;
      }
      css[k] = v;
    }
    if (!gone) { out[name] = theme; continue; }
    dropped[name] = gone;
    const next = Object.create(null);   // the theme's fields in their order, its css the kept rows
    for (const f of Object.keys(theme)) next[f] = f === 'css' ? css : theme[f];
    out[name] = next;
  }
  const changed = Object.keys(dropped).length > 0;
  return { doc: changed ? out : doc, changed, themes, dropped, kept, skipped };
}

module.exports = { SUPERSEDED_WARMTH, normalizeCustomThemes };
