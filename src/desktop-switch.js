// THE DESKTOP SWITCH's model (lane desktop-switch-phone, 2026-10-25 — userW on the Duo's inner display: «如何在这个界面下切换
// 桌面？» — the virtual-desktop switcher lived only in the taskbar's corner, and neither phone class shows the taskbar).
//   · desktopRows — the sheet's rows in the manager's order: name, the active mark, the window count (the ones the page
//     built there + the ones the desktop's held record lists that the page has not built), up to three titles (top of the
//     stack first), the held count.
//   · switchVerdict — a tap on a row: the desktop on show ⇒ none; a desktop gone meanwhile ⇒ refused, by the name the row
//     showed; else switch.
//   · rowWords — a row's words (its count; its titles line; the held line), through the page's translator.
//   · doorState — the door's badge and label numbers (the active desktop's place k of n).
//   · otherDesktopWindows — the ⧉ window list's «Other desktops» group: every other desktop's windows, built or held, in
//     the manager's order, top of the stack first.
// The sheet (src/lib/desktop-switch-sheet.js), the nav's door (src/lib/mobile-nav.js) and the ⧉ list (src/lib/taskbar.js)
// ask it; scripts/test-desktop-switch.mjs pins it.
// PURE: imports nothing.

/** The titles a row shows (the rest is a count). */
const TITLES_MAX = 3;

const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const byZ = (a, b) => (Number(b.z) || 0) - (Number(a.z) || 0);
const titleOf = (w) => String(w.title || '').trim();

/** `desktops` = [{ id, name }] (the manager's order); `windowsByDesktop` = { [id]: [{ title, z }] } the windows this page
 *  BUILT there; `heldByDesktop` = { [id]: [{ title, z }] | n } the entries its held record lists that the page has not
 *  built. → [{ id, name, active, windows, titles, held }] */
function desktopRows({ desktops = [], activeId = null, windowsByDesktop = {}, heldByDesktop = {} } = {}) {
  return list(desktops).filter((d) => d.id).map((d) => {
    const built = list(windowsByDesktop && windowsByDesktop[d.id]);
    const heldRaw = heldByDesktop && heldByDesktop[d.id];
    const held = Array.isArray(heldRaw) ? list(heldRaw) : [];
    const heldN = Array.isArray(heldRaw) ? held.length : Math.max(0, Math.floor(Number(heldRaw) || 0));
    const titles = [...built, ...held].sort(byZ).map(titleOf).filter(Boolean).slice(0, TITLES_MAX);
    return { id: String(d.id), name: String(d.name || d.id), active: d.id === activeId, windows: built.length + heldN, titles, held: heldN };
  });
}

/** A tap on the row of `to` (it showed `name`), with the desktop `from` on show and the rows as they are NOW. */
function switchVerdict({ from = null, to = null, name = '', rows = [] } = {}) {
  const row = to ? list(rows).find((r) => r.id === to) : null;
  if (!row) return { act: 'refused', why: 'unknown', name: String(name || to || '') };
  if (to === from) return { act: 'none' };
  return { act: 'switch', to: row.id };
}

/** A row's words. `t(key, params)` = the page's translator (the default only fills the English template). */
function rowWords(row, { t = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? p[k] : m)) } = {}) {
  const n = Math.max(0, Number(row && row.windows) || 0), held = Math.max(0, Number(row && row.held) || 0);
  const titles = (row && Array.isArray(row.titles) ? row.titles : []).slice(0, TITLES_MAX);
  const more = n - titles.length;
  return {
    count: n === 1 ? t('1 window') : t('{n} windows', { n }),
    titles: titles.length ? titles.join(' · ') + (more > 0 ? ' · ' + t('+{n} more', { n: more }) : '') : '',
    held: held ? t('{n} not opened on this screen yet', { n: held }) : '',
  };
}

/** The door's numbers: the active desktop's place `k` (1-based; 0 = none known) of `n`, its name, the badge (only with two
 *  or more desktops — one desktop is no choice to show). */
function doorState(rows) {
  const r = list(rows), i = r.findIndex((x) => x.active);
  return { k: i + 1, n: r.length, name: i >= 0 ? r[i].name : '', badge: r.length > 1 && i >= 0 ? String(i + 1) : '' };
}

/** The ⧉ list's «Other desktops» rows: `built` = [{ id, title, desk, z }] (windows the page built), `held` = [{ id, title,
 *  desk, z }] (record entries not built) → [{ id, title, deskId, deskName, built }] — every desktop but the active one, in
 *  the manager's order, top of the stack first within one; a desktop the manager does not know is nobody's row. */
function otherDesktopWindows({ desktops = [], activeId = null, built = [], held = [] } = {}) {
  const out = [];
  for (const d of list(desktops)) {
    if (!d.id || d.id === activeId) continue;
    const mine = [...list(built).map((w) => ({ ...w, built: true })), ...list(held).map((w) => ({ ...w, built: false }))].filter((w) => w.desk === d.id && w.id).sort(byZ);
    for (const w of mine) out.push({ id: String(w.id), title: titleOf(w) || String(w.id), deskId: String(d.id), deskName: String(d.name || d.id), built: w.built });
  }
  return out;
}

module.exports = { TITLES_MAX, desktopRows, switchVerdict, rowWords, doorState, otherDesktopWindows };
