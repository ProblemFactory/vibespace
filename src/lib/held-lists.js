// THE FAMILY's ONE NOTICE — its page half (B-f276 family unit B, 主开发 r3032, lane bl-phone-ui; the hub half src/server/held-lists.js).
// KNOW: while any list of VibeSpace's cannot be read, ONE chip «Lists unreadable · N» stands in the vault chip's own slots (beside For you
// in the taskbar's tray; beside For you in the phone's nav), live from live state (the first read at boot, then the hub's `held-lists`
// broadcast), gone by itself when the last one reads. Its press OPENS the system panel's section — never a second place for the act.
// OPERATE: the system panel's section «Lists that could not be read» (sidebar-rail.js _renderSystemPanel → paintHeldLists): each by its
// plain name, since when, the next try; ONE labelled «Read again now» (a person's press; the hub paces it and refuses an agent's token).
import { t } from './i18n.js';
import { fetchJson, showToast } from './utils.js';
import { stampAt } from './page-time.js';
import { slotBeside } from './customize-mode.js';
import { openRailPanel } from './sidebar-rail.js';
import { heldChipWords, heldChipTitle, heldSectionTitle, heldSectionNote, heldPressLabel, heldRowWords, heldPressWords } from './held-lists-words.js';

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
    const slot = slotBeside(besideId, document.getElementById(hostId));
    if (!slot) continue;
    if (!chip) {
      chip = document.createElement('button');
      chip.className = 'vault-chip held-chip';
      chip.id = id; chip.type = 'button';
      chip.onclick = () => openHeldSection();
    }
    chip.textContent = heldChipWords(n, t);
    chip.title = heldChipTitle(t);
    if (chip.parentNode !== slot.parent || chip.nextSibling !== slot.before) slot.parent.insertBefore(chip, slot.before);
  }
}
/** the hub's list (the first read, a broadcast, a press's answer) → the chip and every open section */
export function applyHeldLists(next) {
  lists = Array.isArray(next) ? next.filter((r) => r && typeof r === 'object') : [];
  drawChip();
  for (const fn of [...listeners]) { try { fn(lists); } catch { /* one section's error never stops another */ } }
}
export async function refreshHeldLists() { const r = await fetchJson('/api/held-lists'); if (r && Array.isArray(r.lists)) applyHeldLists(r.lists); return lists; }
/** re-seat the chip beside For you (app.js, after every arrangement — as the vault's) */
export const placeHeldChip = () => drawChip();
export function initHeldLists(app) { appRef = app; refreshHeldLists().catch(() => { }); }
/** the chip's press: the system panel, its section in view */
export function openHeldSection(app = appRef) {
  if (!app) return;
  openRailPanel(app, 'system');
  setTimeout(() => { try { document.querySelector('.sys-held')?.scrollIntoView?.({ block: 'nearest' }); } catch { /* none */ } }, 300);
}
let pressing = false;
/** «Read again now» — ONE press reads every held list again (the hub paces it; a press while one runs is said, never greyed) */
export async function readHeldAgain() {
  if (pressing) { showToast(heldPressWords({ ok: false, code: 'held_read_running' }, t).text); return null; }
  pressing = true;
  try {
    const r = await fetchJson('/api/held-lists/read-again', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (r && Array.isArray(r.lists)) applyHeldLists(r.lists);
    const w = heldPressWords(r, t);
    showToast(w.text, { type: w.tone === 'error' ? 'error' : w.tone === 'warn' ? 'warn' : undefined, duration: 6000 });
    return r;
  } finally { pressing = false; }
}
/** THE SYSTEM PANEL's SECTION: drawn while any list is held, nothing otherwise; follows the live list until the panel closes */
export function paintHeldLists(el) {
  if (!el) return () => { };
  let off = () => { };
  const draw = () => {
    if (!el.isConnected) { off(); return; }   // the panel closed or re-drew: this section leaves the list's listeners
    if (!lists.length) { el.hidden = true; el.replaceChildren(); return; }
    el.hidden = false;
    const title = document.createElement('div'); title.className = 'usage-section-title'; title.textContent = heldSectionTitle(t);
    const rows = lists.map((r) => { const d = document.createElement('div'); d.className = 'sys-held-row'; d.textContent = heldRowWords(r, t, { since: r.since ? stampAt(r.since) : '', next: r.next ? stampAt(r.next) : '' }); return d; });
    const note = document.createElement('div'); note.className = 'empty-hint empty-hint-inline sys-held-note'; note.textContent = heldSectionNote(t);
    const press = document.createElement('button'); press.type = 'button'; press.className = 'mounts-btn sys-held-again'; press.textContent = heldPressLabel(t);
    press.onclick = () => { readHeldAgain().catch(() => { }); };
    el.replaceChildren(title, ...rows, note, press);
  };
  off = onHeldLists(draw);
  draw();
  refreshHeldLists().catch(() => { });
  return () => off();
}
