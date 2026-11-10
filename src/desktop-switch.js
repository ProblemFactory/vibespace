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
//   · desktopDoors — THE DESKTOP DOORS (lane desktop-doors-table, 2026-10-26 — the audit: the doors were five hand-written
//     lists, and the phone sheet's long press offered Rename + Delete only, so a phone — it has no drag — could not reorder
//     its desktops at all): ONE row per door a desktop has, with the rule that opens it and the words a shut one says.
//     `tier` says only how a door is DRAWN, never whether it exists. doorItems = a desktop's doors menu (what the manager's
//     _deskItems hangs its handlers on, both tiers); sheetItems = the phone sheet's rows (its DOM is drawn from them).
//     Round 2 (主开发's acceptance): a desktop no longer there draws every door greyed WITH the why that names it, on every
//     tier (a desk menu leaves a shut door out only while its desktop is here — never an empty menu); the why names the
//     NAME the row showed, never the id; the Rename door's dialog words are its row's. Round 3: they include what the dialog
//     says when another screen renamed the desktop while it was open (`meanwhile` — the typed name lands, the one it
//     replaces is said).
//   · followDesktops — an OPEN list (the compact list, the sheet, the window switcher's tabs) redrawn on a remote change: the
//     live desktops in the live order, a drawn one deleted elsewhere kept at its place, greyed with its why.
//   · windowWaits — THE WAITING FACT (lane phone-take-photo, the owner 2026-11-10: «在手机上那个闪烁功能不能 reflect 到 desktop 跟
//     对话的那个下拉选单里»): the ONE reader of «this window waits for the person» for every surface that lists windows (the
//     taskbar's tiles and lists, the phone's title switcher, its Desktops sheet, its closed doors); desktopRows rolls it up per
//     desktop (`waiting` = how many, their titles named first) and waitingElsewhere counts what the closed doors say.
// The sheet (src/lib/desktop-switch-sheet.js), the nav's door and window switcher (src/lib/mobile-nav.js), the taskbar's
// previews and compact list (src/lib/desktop-manager.js) and the ⧉ list (src/lib/taskbar.js) ask it;
// scripts/test-desktop-switch.mjs pins it (⑧ the table, ⑨ the census of every surface that draws it, ⑩ the open lists' follow).
// PURE: imports nothing.

/** The titles a row shows (the rest is a count). */
const TITLES_MAX = 3;

const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? p[k] : m));
const byZ = (a, b) => (Number(b.z) || 0) - (Number(a.z) || 0);
const titleOf = (w) => String(w.title || '').trim();

/** `desktops` = [{ id, name, gone? }] (the manager's order; `gone` = an open list's row whose desktop was deleted elsewhere —
 *  followDesktops); `windowsByDesktop` = { [id]: [{ title, z }] } the windows this page BUILT there; `heldByDesktop` =
 *  { [id]: [{ title, z }] | n } the entries its held record lists that the page has not built.
 *  → [{ id, name, active, windows, titles, held, gone? }] */
function desktopRows({ desktops = [], activeId = null, windowsByDesktop = {}, heldByDesktop = {} } = {}) {
  return list(desktops).filter((d) => d.id).map((d) => {
    const built = list(windowsByDesktop && windowsByDesktop[d.id]);
    const heldRaw = heldByDesktop && heldByDesktop[d.id];
    const held = Array.isArray(heldRaw) ? list(heldRaw) : [];
    const heldN = Array.isArray(heldRaw) ? held.length : Math.max(0, Math.floor(Number(heldRaw) || 0));
    // a conversation that waits for the person is NAMED in its desktop's row — its title first (the rest keep the stack order)
    const waiting = d.gone ? [] : built.filter((w) => w.waiting === true);
    const titles = [...[...waiting].sort(byZ), ...[...built.filter((w) => !waiting.includes(w)), ...held].sort(byZ)].map(titleOf).filter(Boolean).slice(0, TITLES_MAX);
    // r2 (主开发 ③b): ONE order — the conversation a tap lands on is the one the row NAMES first (`waitingIds`, the same sort)
    return { id: String(d.id), name: String(d.name || d.id), active: !d.gone && d.id === activeId, windows: built.length + heldN, titles, held: heldN, ...(d.gone ? { gone: true } : {}), ...(waiting.length ? { waiting: waiting.length, waitingIds: [...waiting].sort(byZ).map((w) => w.id).filter((x) => x != null).map(String) } : {}) };
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
function rowWords(row, { t = fill } = {}) {
  const n = Math.max(0, Number(row && row.windows) || 0), held = Math.max(0, Number(row && row.held) || 0);
  const titles = (row && Array.isArray(row.titles) ? row.titles : []).slice(0, TITLES_MAX);
  const more = n - titles.length;
  return {
    count: n === 1 ? t('1 window') : t('{n} windows', { n }),
    titles: titles.length ? titles.join(' · ') + (more > 0 ? ' · ' + t('+{n} more', { n: more }) : '') : '',
    held: held ? t('{n} not opened on this screen yet', { n: held }) : '',
    ...(Number(row && row.waiting) > 0 ? { waiting: t('{n} waiting for input', { n: Math.floor(Number(row.waiting)) }) } : {}),
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

/** THE DESKTOP DOORS, in the order every surface draws them. `label` = THE t() key of the door — ONE set for every surface
 *  (the desk menu's ellipsis rule holds on the phone: 『Rename…』 opens a dialog everywhere); `order` = the doors that move
 *  the desktop in the manager's order (a separator before them in a menu); `dialog` = the words of the dialog a door opens
 *  (t() keys — r2 ④: the Rename door's dialog had three bare English literals, two with no zh / ja at all). */
const DOORS = [
  { id: 'switch', label: 'Switch desktop — {name}' },
  { id: 'rename', label: 'Rename…', dialog: { title: 'Rename Desktop', label: 'Desktop name', confirm: 'Rename', meanwhile: '“{was}” was renamed to “{now}” on another screen meanwhile — your name “{name}” replaces it' } },
  { id: 'delete', label: 'Delete', danger: true },
  { id: 'move-up', label: 'Move up', order: true },
  { id: 'move-down', label: 'Move down', order: true },
  { id: 'new', label: 'New desktop' },
];
/** What a SHUT door says (t() keys) — a door is never greyed without its words. */
const DOOR_WHY = {
  gone: '“{name}” is no longer there',
  goneNameless: 'This desktop is no longer there', // no name given — a raw id is never a word in a sentence (r2 ③)
  only: 'Your only desktop — it cannot be deleted',
  first: 'Already the first desktop',
  last: 'Already the last desktop',
};

/** The doors of the desktop `desk` (its id; `name` = the name its row SHOWED) among `desktops` = [{ id, name }] in the
 *  manager's order — EVERY door, always, in DOORS' order: `enabled` by the door's rule (rename / switch: the desktop is
 *  here; delete: more than one desktop; move up: not the first; move down: not the last; new: always), `why` = the shut
 *  door's words (a t() key, '' when open), `params.name` = the desktop's name — its name now while it is here, the name
 *  its row showed once it is gone (r2 ③: never its id; no name given ⇒ the nameless why).
 *  `tier` ('desk' | 'phone') and `order` say only how each is drawn — `draw`:
 *    'row'  — the desktop's row / tile itself (a tap switches) and the list's last row (new);
 *    'item' — the desktop's doors menu (a right-click, a ⋯, a long press);
 *    'drag' — the order doors of a desk surface that reorders by dragging (the taskbar's previews: `order` false); a phone
 *             has no drag, so its order doors are always items;
 *    'off'  — a shut door in a DESK menu is left out WHILE ITS DESKTOP IS HERE (the desk menus' convention — the compact
 *             row's menu stays what it was: the first one's Move up, the only one's Delete); the PHONE draws it greyed WITH
 *             its why (a row that vanished would read «a phone cannot do this»). A desktop NO LONGER THERE draws every door
 *             greyed with the why that names it on EVERY tier (r2 ①: the desk drew an empty menu).
 *  → [{ id, label, params, enabled, why, draw, danger, dialog }] */
function desktopDoors({ desk = null, name = '', desktops = [], order = false, tier = 'desk' } = {}) {
  const ds = list(desktops).filter((d) => d.id), n = ds.length, i = desk == null ? -1 : ds.findIndex((d) => d.id === desk);
  const params = { name: i >= 0 ? String(ds[i].name || ds[i].id) : String(name || '') };
  const phone = tier === 'phone';
  const shut = (id) => {
    if (id === 'new') return '';
    if (i < 0) return params.name ? DOOR_WHY.gone : DOOR_WHY.goneNameless;
    if (id === 'delete' && n < 2) return DOOR_WHY.only;
    if (id === 'move-up' && i === 0) return DOOR_WHY.first;
    if (id === 'move-down' && i === n - 1) return DOOR_WHY.last;
    return '';
  };
  return DOORS.map((d) => {
    const why = shut(d.id), enabled = !why;
    const form = d.id === 'switch' || d.id === 'new' ? 'row' : d.order && !phone && !order ? 'drag' : 'item';
    return { id: d.id, label: d.label, params, enabled, why, draw: form === 'item' && !enabled && !phone && i >= 0 ? 'off' : form, danger: !!d.danger, dialog: d.dialog || null };
  });
}

/** A desktop's doors MENU from its rows — every 'item' door in order, the order doors after a separator; a shut one keeps
 *  its why (drawn greyed WITH the words). `t(key, params)` = the page's translator.
 *  → [{ id, label, why, enabled, danger } | { separator: true }] */
function doorItems(doors, { t = fill } = {}) {
  const out = [];
  let sep = false;
  for (const d of list(doors)) {
    if (d.draw !== 'item') continue;
    const row = DOORS.find((x) => x.id === d.id);
    if (row && row.order && !sep) { if (out.length) out.push({ separator: true }); sep = true; }
    out.push({ id: String(d.id), label: t(d.label, d.params), why: d.enabled ? '' : t(d.why, d.params), enabled: !!d.enabled, danger: !!d.danger });
  }
  return out;
}

/** THE PHONE SHEET's rows from desktopRows (its PURE builder — the sheet draws its DOM from these): one row per desktop =
 *  its switch door (the row's title = the door's label) with its words (rowWords: the count, the titles · held line), then
 *  the list's 'new' door. A gone row (r2 ①: deleted on another screen while the sheet was open) = its switch door SHUT —
 *  no count, its why (by the name it showed) on its second line and as its title.
 *  → [{ door: 'switch', id, name, active, count, sub, title, gone? } …, { door: 'new', id: null, label }] */
function sheetItems(rows, { t = fill } = {}) {
  const r = list(rows).filter((x) => x.id), desktops = r.filter((x) => !x.gone).map((x) => ({ id: x.id, name: x.name }));
  const out = r.map((row) => {
    const door = desktopDoors({ desk: row.id, name: row.name, desktops, tier: 'phone' }).find((d) => d.id === 'switch');
    if (!door.enabled) { const why = t(door.why, door.params); return { door: 'switch', id: String(row.id), name: String(row.name || ''), active: false, count: '', sub: why, title: why, gone: true }; }
    const w = rowWords(row, { t });
    return { door: 'switch', id: String(row.id), name: String(row.name || row.id), active: !!row.active, count: w.count, ...(w.waiting ? { waiting: w.waiting } : {}), sub: [w.titles, w.held].filter(Boolean).join(' — '), title: t(door.label, door.params) };
  });
  const add = desktopDoors({ desktops, tier: 'phone' }).find((d) => d.id === 'new');
  out.push({ door: 'new', id: null, label: t(add.label, add.params) });
  return out;
}

/** THE WAITING FACT (lane phone-take-photo, the owner 2026-11-10 17:10Z, phone: «在手机上那个闪烁功能不能 reflect 到 desktop 跟对话的
 *  那个下拉选单里，所以我并不能看出来现在有消息在等我»): a window WAITS for the person while it wears `window-waiting` — the blink
 *  its title bar, taskbar tile, tab and preview square draw; its own turn / ask sets it, its focus or a click ends it
 *  (winInfo._waitWhy), and the terminal honours terminal.waitingBlinkBehavior when it sets it. THE ONE reader for every
 *  surface that lists windows: the taskbar's tiles and lists and the phone's title switcher, Desktops sheet and closed
 *  doors read it here — none derives «waiting» a second way. */
function windowWaits(win) {
  const cl = win && win.element && win.element.classList;
  return !!(cl && typeof cl.contains === 'function' && cl.contains('window-waiting'));
}

/** THE FINISHED TURN'S MARK, the same on every client (lane phone-take-photo r2 (主开发 ①): «once answered — from any device —
 *  it no longer waits, on every device»). A window's waiting REASONS over the conversation's events: 'end' = a turn finished
 *  while the window was not the active one ⇒ +'turn'; 'start' = a turn that started AFTER that completion is seen (turnSeq: the
 *  person answered — here or on another device) ⇒ −'turn' on EVERY client that sees it, with no focus anywhere; 'seen' = the person reached it on THIS
 *  device (a press, the view's focus, a door that said «it waits») ⇒ every reason acknowledged here. «They LOOKED at it on another
 *  device and did not answer» moves nothing here — it still waits for them (the rule, per device). An 'ask' outlives a turn's
 *  start (it is answered on its own road). A reason outlives no blink. → { why: [...], waiting } */
function turnWaitStep({ why = [], waiting = false } = {}, ev = '', { active = false } = {}) {
  const r = new Set(waiting && Array.isArray(why) ? why.filter((x) => typeof x === 'string') : []);
  if (ev === 'end') { if (active) return { why: [...r], waiting: !!waiting }; r.add('turn'); return { why: [...r], waiting: true }; }
  if (ev === 'start') { r.delete('turn'); return { why: [...r], waiting: !!waiting && r.size > 0 }; }
  if (ev === 'seen') return { why: [], waiting: false };
  return { why: [...r], waiting: !!waiting };
}

/** THE TURN'S OWN SEQUENCE (lane phone-take-photo r3 — 主开发's tidy ①: a reconnect between the result and the idle erased
 *  the mark for good). A finished turn's mark ends only when a turn that STARTED AFTER that completion is seen. The view
 *  feeds every record it is told of — live, replayed by a held resume, caught up after a reconnect, a slab — and every
 *  completion, and the turn sequence (the normalizer's `turnIndex`, on every record) says which turn a record belongs to:
 *    turnSeq(s, { record, epoch }) → { s, starts } — `starts`: a person-side record (role 'user'; never a page-image
 *                                                     attachment) of a turn PAST the completed one, in the same epoch
 *    turnSeq(s, { done: true, epoch }) → the completion: the highest turn the view was told of IS the one that finished
 *  A restated «streaming» (an attach, a reconnect, a held resume, a background tail) carries no record of a later turn, so
 *  it starts nothing. Another normalization epoch numbers the turns afresh: there the completion's place is unknown and
 *  nothing starts (the mark stays, as on master, until a later completion or the person reaches it). → { s, starts } */
function turnSeq(s, { record = null, done = false, epoch = null } = {}) {
  const ep = epoch || null, same = !!s && s.ep === ep;
  let max = same && Number.isFinite(s.max) ? s.max : 0, doneAt = same && Number.isFinite(s.doneAt) ? s.doneAt : null;
  if (done) return { s: { ep, max, doneAt: max }, starts: false };
  const i = record && Number.isFinite(record.turnIndex) ? record.turnIndex : null;
  const starts = i != null && doneAt != null && i > doneAt && record.role === 'user' && !record.imageAttachment;
  if (i != null && i > max) max = i;
  return { s: { ep, max, doneAt: starts ? null : doneAt }, starts };
}

/** THE CLOSED DOORS' COUNT: the windows that wait for the person anywhere but ON SHOW — the conversation on show says it
 *  itself and is never shouted twice. `windows` = [{ id, waiting }], `shownId` = the window on show. → the count */
function waitingElsewhere({ windows = [], shownId = null } = {}) {
  return list(windows).filter((w) => w.waiting === true && w.id !== shownId).length;
}

/** AN OPEN LIST FOLLOWS THE DESKTOPS (r2 ①: the compact list, the phone sheet and the window switcher's tabs are popovers
 *  that outlive a remote change — a stale row's doors opened an empty menu, its acts did nothing): `drawn` = the rows the
 *  list shows now ([{ id, name, gone? }]), `desktops` = the manager's list now → the live desktops in the live order, by
 *  their names now; a drawn row whose desktop is no longer there KEEPS ITS PLACE, `gone: true` — drawn greyed with the why
 *  that names it, never vanished from under a finger or a held drag (the next row would take the tap, the drop). Only a
 *  redraw the person did not ask for keeps one: their own act, and the next open, draw the live list.
 *  → [{ id, name, gone }] */
function followDesktops({ drawn = [], desktops = [] } = {}) {
  const live = list(desktops).filter((d) => d.id), ids = new Set(live.map((d) => String(d.id)));
  const out = live.map((d) => ({ id: String(d.id), name: String(d.name || d.id), gone: false }));
  list(drawn).forEach((d, k) => { if (d.id && !ids.has(String(d.id))) out.splice(Math.min(k, out.length), 0, { id: String(d.id), name: String(d.name || ''), gone: true }); });
  return out;
}

module.exports = { windowWaits, waitingElsewhere, turnWaitStep, turnSeq, TITLES_MAX, DOORS, DOOR_WHY, desktopRows, switchVerdict, rowWords, doorState, otherDesktopWindows, desktopDoors, doorItems, sheetItems, followDesktops };
