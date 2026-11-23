// PURE (B-f276 family unit B, 主开发 r3032, lane bl-phone-ui): THE ONE NOTICE's words — a held list's PLAIN name by what the hub names
// it (a store's file base name, an older hold's key — never shown), the chip's words, a row's line, the section's sentence, a press's
// answer. `t` is the page's; times come in already worded (page-time). Nothing here names a file, a path or a value.
const i18nKey = (s) => s;   // a declared visible template (scripts/i18n-extract)
const NAMES = Object.freeze({
  'mounts.json': i18nKey('the storage list'), 'mount-tokens.json': i18nKey('the folder links'), 'plugins.json': i18nKey('the plugins’ settings'),
  'user-todos': i18nKey('For you'), 'task-groups': i18nKey('the Task Groups'), hosts: i18nKey('the paired machines'),
});
/** the names this module knows (a lane whose store joins adds its name here — the census reds a held store with none) */
export const HELD_NAMED = Object.freeze(Object.keys(NAMES));
export function heldListName(what, t) { const k = NAMES[String(what || '')]; return k ? t(k) : t(i18nKey('a saved list')); }
export function heldChipWords(n, t) { return t(i18nKey('Lists unreadable · {n}'), { n }); }
export function heldChipTitle(t) { return t(i18nKey('Some of VibeSpace’s lists cannot be read right now — the system panel names them')); }
export function heldSectionTitle(t) { return t(i18nKey('Lists that could not be read')); }
export function heldSectionNote(t) { return t(i18nKey('Nothing is written over these lists, and changes to them wait until they read. VibeSpace reads them again by itself.')); }
export function heldPressLabel(t) { return t(i18nKey('Read again now')); }
/** a next try whose time has passed (r3212): worded, never a time in the past */
export function heldSoonWord(t) { return t(i18nKey('in a moment')); }
/** one row: its plain name, since when, the next try (each worded by the caller; '' = not known) */
export function heldRowWords(row, t, { since = '', next = '' } = {}) {
  const name = heldListName(row && row.what, t);
  if (since && next) return t(i18nKey('{name} — since {since}, next try {next}'), { name, since, next });
  if (since) return t(i18nKey('{name} — since {since}'), { name, since });
  return name;
}
/** the press's answer → its toast { text, tone } */
export function heldPressWords(r, t) {
  if (!r) return { text: t(i18nKey('Could not reach the server')), tone: 'error' };
  if (r.code === 'held_read_too_soon') return { text: t(i18nKey('They were just read again — try again in a few seconds.')), tone: 'warn' };
  if (r.code === 'held_read_running') return { text: t(i18nKey('They are being read again right now.')), tone: 'info' };
  if (r.error || r.ok === false) return { text: t(i18nKey('Could not read them again — try again in a moment.')), tone: 'error' };   // never the hub's English
  const n = Array.isArray(r.lists) ? r.lists.length : 0;
  return n ? { text: t(i18nKey('{n} still could not be read — VibeSpace keeps reading them again by itself.'), { n }), tone: 'warn' } : { text: t(i18nKey('Every list reads again.')), tone: 'ok' };
}
