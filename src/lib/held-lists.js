// THE FAMILY's ONE NOTICE — its page half (B-f276 family unit B, 主开发 r3032, lane bl-phone-ui; the hub half src/server/held-lists.js).
// KNOW: while any list of VibeSpace's cannot be read, ONE chip «Lists unreadable · N» stands in the vault chip's own slots (beside For you
// in the taskbar's tray; beside For you in the phone's nav), live from live state (the first read at boot, then the hub's `held-lists`
// broadcast), gone by itself when the last one reads. Its press OPENS the system panel's section — never a second place for the act.
// OPERATE: the system panel's section «Lists that could not be read» (sidebar-rail.js _renderSystemPanel → paintHeldLists): each by its
// plain name, since when, the next try; ONE labelled «Read again now» (a person's press; the hub paces it and refuses an agent's token).
import { t } from './i18n.js';
import { fetchJson, showToast } from './utils.js';
import { stampAt } from './page-time.js';
import { slotBeside, seatBeside } from './customize-mode.js';
import { openRailPanel } from './sidebar-rail.js';
import { heldChipWords, heldChipTitle, heldSectionTitle, heldSectionNote, heldPressLabel, heldRowWords, heldPressWords, heldSoonWord } from './held-lists-words.js';

let lists = [];
let appRef = null;
const listeners = new Set();
const CHIP_SLOTS = [['taskbar-tray', 'taskbar-user-todos', 'taskbar-held'], ['mobile-nav', 'mobile-nav-todos', 'mobile-nav-held']];
export function onHeldLists(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function drawChip() {
  if (typeof document === 'undefined') return;
  const n = lists.length;
  for (const [hostId, besideId, id] of CHIP_SLOTS) {
    let chip = document.getElementById(id);
    if (!n) { chip?.remove(); continue; }
    if (!slotBeside(besideId, document.getElementById(hostId))) continue;
    if (!chip) {
      chip = document.createElement('button');
      chip.className = 'vault-chip held-chip';
      chip.id = id; chip.type = 'button';
      chip.onclick = () => openHeldSection();
    }
    chip.textContent = heldChipWords(n, t);
    chip.title = heldChipTitle(t);
    // r3284: ONE order for every chip beside For you (customize-mode.js BESIDE_ORDER: the cache warmth, this chip, the vault's lock) — none
    // trades places with another at a redraw, whichever draws first
    seatBeside(chip, besideId, document.getElementById(hostId));
  }
}
// r3284: THE HUB's MARK of the list the page holds ({ epoch: the hub's start, seq: its broadcasts so far }) — an answer the hub made
// BEFORE the last broadcast the page took (a read sent at a reconnect, answered after a newer broadcast) is older: it is dropped, never
// put back over the newer list. Another hub (a restart: another epoch) is always taken.
let mark = null;
const olderThanHeld = (m) => !!(m && mark && String(m.epoch) === mark.epoch && Number(m.seq) < mark.seq);
/** the hub's list (the first read, a broadcast, a press's answer) with its mark → the chip and every open section; false = older, dropped */
export function applyHeldLists(next, m = null) {
  if (olderThanHeld(m)) return false;
  if (m && m.epoch) mark = { epoch: String(m.epoch), seq: Number(m.seq) || 0 };
  lists = Array.isArray(next) ? next.filter((r) => r && typeof r === 'object') : [];
  drawChip();
  for (const fn of [...listeners]) { try { fn(lists); } catch { /* one section's error never stops another */ } }
  return true;
}
export async function refreshHeldLists() { const r = await fetchJson('/api/held-lists'); if (r && Array.isArray(r.lists)) applyHeldLists(r.lists, r); return lists; }
/** re-seat the chip beside For you (app.js, after every arrangement — as the vault's) */
export const placeHeldChip = () => drawChip();
export function initHeldLists(app) { appRef = app; refreshHeldLists().catch(() => { }); }
/** the chip's press: the system panel, its section in view */
let scrollWanted = false;   // r3212: the chip opened the panel — the section scrolls into view at its FIRST draw (the panel may build it later)
export function openHeldSection(app = appRef) {
  if (!app) return;
  scrollWanted = true;
  openRailPanel(app, 'system');
  // r3284: the panel already open as a window is only brought forward (openRailPanel paints nothing again): its section is in the page —
  // scrolled at once, so the flag never waits for a later draw (a reconnect's) to scroll the panel with no press
  const sec = scrollWanted && typeof document !== 'undefined' ? document.querySelector('.sys-held') : null;
  if (sec && sec.isConnected && !sec.hidden && sec.getClientRects?.().length) { scrollWanted = false; try { sec.scrollIntoView?.({ block: 'nearest' }); } catch { /* none */ } }
}
let pressing = false;
const NEXT_TRY_REPAINT_MAX_MS = 3_600_000;   // r3284: the section's own timer waits at most an hour (a next try further away is worded again then)
/** «Read again now» — ONE press reads every held list again (the hub paces it; a press while one runs is said, never greyed) */
export async function readHeldAgain() {
  if (pressing) { showToast(heldPressWords({ ok: false, code: 'held_read_running' }, t).text); return null; }
  pressing = true;
  try {
    const r = await fetchJson('/api/held-lists/read-again', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (r && Array.isArray(r.lists)) applyHeldLists(r.lists, r);
    const w = heldPressWords(r, t);
    showToast(w.text, { type: w.tone === 'error' ? 'error' : w.tone === 'warn' ? 'warn' : undefined, duration: 6000 });
    return r;
  } finally { pressing = false; }
}
/** THE SYSTEM PANEL's SECTION: drawn while any list is held, nothing otherwise; follows the live list until the panel closes */
export function paintHeldLists(el) {
  if (!el) return () => { };
  let off = () => { }, timer = null;
  const leave = () => { if (timer) { clearTimeout(timer); timer = null; } off(); };
  const draw = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!el.isConnected) { leave(); return; }   // the panel closed or re-drew: this section leaves the list's listeners (and its timer)
    if (!lists.length) { el.hidden = true; el.replaceChildren(); scrollWanted = false; return; }
    el.hidden = false;
    const title = document.createElement('div'); title.className = 'usage-section-title'; title.textContent = heldSectionTitle(t);
    const at = Date.now();   // r3212: a next try that has passed is worded at paint («soon»), never a time in the past
    const rows = lists.map((r) => { const d = document.createElement('div'); d.className = 'sys-held-row'; d.textContent = heldRowWords(r, t, { since: r.since ? stampAt(r.since) : '', next: r.next ? (r.next > at ? stampAt(r.next) : heldSoonWord(t)) : '' }); return d; });
    const note = document.createElement('div'); note.className = 'empty-hint empty-hint-inline sys-held-note'; note.textContent = heldSectionNote(t);
    const press = document.createElement('button'); press.type = 'button'; press.className = 'mounts-btn sys-held-again'; press.textContent = heldPressLabel(t);
    press.onclick = () => { readHeldAgain().catch(() => { }); };
    el.replaceChildren(title, ...rows, note, ...(lists.some((r) => r.readAgain !== false) ? [press] : []));   // r5213's should: no idle press — drawn only when a listed row can be read again by it
    if (scrollWanted) { scrollWanted = false; try { el.scrollIntoView?.({ block: 'nearest' }); } catch { /* none */ } }
    // r3284: a next try that passes while the section stays open is worded again when it passes («in a moment»), by the section's own timer
    const due = lists.map((r) => Number(r.next) || 0).filter((n) => n > at);
    if (due.length) timer = setTimeout(draw, Math.min(Math.min(...due) - at + 250, NEXT_TRY_REPAINT_MAX_MS));
  };
  off = onHeldLists(draw);
  draw();
  refreshHeldLists().catch(() => { });
  return () => leave();
}
