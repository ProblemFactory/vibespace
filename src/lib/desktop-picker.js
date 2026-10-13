// DESKTOP v2 P0 — THE DESKTOP PICKER (lane desktop-v2-entry, design q-030 D1; owner 2026-10-12 "桌面不再直接打开一个本地桌面，
// 而是选择本地或者remote"). The Desktop button opens THIS popover (not a modal), three groups:
//   最近  the last choice (host + display) — first, Enter opens it
//   本机  the VibeSpace virtual desktop (the persisted singleton window, as before); a Wayland seat says why this host's own
//         screen is not offered (D4: no physical-desktop rung in P0)
//   远程  each paired Windows / macOS machine: 就绪 / 先设置 / 离线 + the displays its window learned last ("1 Built-in · 2 DELL")
// Rows by the PURE src/desktop-screens.js pickerRows. A machine's window stays NOT persisted (design 014 D1: the sign-in is
// asked each time); only the choice is remembered, in this browser.
import { t } from './i18n.js';
import { fetchJson } from './utils.js';
import { pickerRows, recentChoice } from '../desktop-screens.js';
import { openMachineDesktop, showMachineDesktopDialog } from './machine-desktop.js';

const RECENT_KEY = 'vibespace.desktopRecent';     // { hostId, display } — this browser's last Desktop choice
const DISPLAYS_KEY = 'vibespace.desktopDisplays'; // { [hostId]: [{ key, n, name }] } — what each machine's window mapped last
const readJson = (k) => { try { const o = JSON.parse(localStorage.getItem(k) || 'null'); return o && typeof o === 'object' ? o : null; } catch { return null; } };

export function readRecent() { const o = readJson(RECENT_KEY); return o && o.hostId ? o : null; }
/** Remember the Desktop choice (host + display key | null = the whole screen). */
export function rememberDesktop(hostId, display = null) { const c = recentChoice(hostId, display); if (!c) return; try { localStorage.setItem(RECENT_KEY, JSON.stringify({ hostId: c.hostId, display: c.display })); } catch { /* storage refused: nothing remembered */ } }
/** Remember what a machine's displays were (the picker's chips). */
export function rememberDisplays(hostId, displays) {
  const o = readJson(DISPLAYS_KEY) || {};
  o[hostId] = (Array.isArray(displays) ? displays : []).slice(0, 8).map((d) => ({ key: String(d.key), n: d.n, name: String(d.name || '').slice(0, 40) }));
  try { localStorage.setItem(DISPLAYS_KEY, JSON.stringify(o)); } catch { /* storage refused: nothing remembered */ }
}
export function knownDisplays(hostId) { const o = readJson(DISPLAYS_KEY); return o && Array.isArray(o[hostId]) ? o[hostId] : []; }

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const nameOf = (m) => String((m && (m.label || m.hostId)) || ''); // peer-controlled text: textContent only
const STATE_WORDS = { ready: () => t('Ready'), setup: () => t('Set up first'), offline: () => t('Offline') };
const displayWord = (d) => (d.name ? `${d.n} ${d.name}` : String(d.n));

let open = null; // the one popover

/** The row's own act: the local desktop, a machine's desktop (on a display), or its setup words. */
function openRow(app, row) {
  if (row.kind === 'local') { rememberDesktop('local'); app.openDesktop(); return; }
  const m = row.machine;
  if (row.state === 'setup') { showMachineDesktopDialog(app, m, { recheck: async (id) => { const r = await fetchJson('/api/desktop/machines'); return r && Array.isArray(r.machines) ? r.machines.find((x) => x.hostId === id) || null : null; } }); return; }
  rememberDesktop(m.hostId, row.display);
  openMachineDesktop(app, m, { display: row.display });
}

/**
 * THE POPOVER. `anchor` = the button it hangs from (else the top of the page; a phone gets a bottom sheet); `focusHost` = the
 * row to focus first (the Apps dialog's "Open its desktop → Desktop"). → { el, close, rows() }
 */
export function openDesktopPicker(app, { anchor = null, focusHost = null } = {}) {
  if (open) open.close();
  const box = el('div', 'desktop-picker');
  box.setAttribute('role', 'menu'); box.tabIndex = -1;
  const phone = typeof innerWidth === 'number' && innerWidth < 600;
  if (phone) box.classList.add('desktop-picker-sheet');
  document.body.append(box);
  let machines = null, loading = true, rows = [], moved = false; // `moved`: the person moved the focus (arrows / a press) — keep it
  const local = { available: app._vncAvailable !== false, seat: app._vncSeat || null };
  const draw = () => {
    rows = pickerRows({ local, machines: machines || [], recent: readRecent() });
    const kids = [];
    let group = null;
    for (const r of rows) {
      if (r.group !== group) { group = r.group; kids.push(el('div', 'desktop-picker-group', group === 'recent' ? t('Recent') : group === 'local' ? t('Local') : t('Remote'))); }
      const b = el('button', 'desktop-picker-row'); b.type = 'button'; b.setAttribute('role', 'menuitem');
      b.dataset.group = r.group; b.dataset.host = r.hostId; b.dataset.state = r.state;
      const name = r.kind === 'local' ? t('VibeSpace virtual desktop') : nameOf(r.machine);
      const ds = r.kind === 'machine' ? knownDisplays(r.hostId) : [];
      const onDisplay = r.display != null ? ds.find((d) => d.key === r.display) : null;
      b.append(el('span', 'desktop-picker-name', r.display != null ? `${name} · ${onDisplay ? displayWord(onDisplay) : t('Display {n}', { n: r.display })}` : name), el('span', 'desktop-picker-state', STATE_WORDS[r.state]()));
      if (r.kind === 'local' && r.seat === 'wayland') b.append(el('span', 'desktop-picker-note', t('This host’s own screen is a Wayland session — it cannot be shown yet; the virtual desktop can')));
      if (r.kind === 'machine' && r.group === 'remote' && ds.length > 1) b.append(el('span', 'desktop-picker-chips', ds.map(displayWord).join(' · ')));
      b.disabled = !r.enabled;
      b.onclick = () => { close(); openRow(app, r); };
      kids.push(b);
    }
    if (loading) kids.push(el('div', 'desktop-picker-note', t('Checking machines…')));
    else if (!rows.some((r) => r.group === 'remote')) kids.push(el('div', 'desktop-picker-note', t('No paired Windows or Mac machine yet')));
    const had = moved && box.contains(document.activeElement) ? document.activeElement.dataset.host + '|' + document.activeElement.dataset.group : null; // else the first row again (the recent one arrives with the machines)
    box.replaceChildren(...kids);
    const want = had ? [...box.querySelectorAll('.desktop-picker-row')].find((b) => b.dataset.host + '|' + b.dataset.group === had) : focusHost ? box.querySelector(`.desktop-picker-row[data-group="remote"][data-host="${CSS.escape(focusHost)}"]`) : null;
    (want || box.querySelector('.desktop-picker-row:not([disabled])') || box).focus();
  };
  const place = () => {
    if (phone) return;
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    const w = box.offsetWidth || 320;
    box.style.left = Math.max(8, Math.min(innerWidth - w - 8, r ? r.left : (innerWidth - w) / 2)) + 'px';
    box.style.top = (r ? r.bottom + 4 : 48) + 'px';
  };
  const onDown = (e) => { if (!box.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target))) close(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Enter') { const b = document.activeElement; if (b && b.classList.contains('desktop-picker-row') && !b.disabled) { e.preventDefault(); b.click(); } return; } // D1: Enter opens the focused row (the recent one first)
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const bs = [...box.querySelectorAll('.desktop-picker-row:not([disabled])')];
    const i = bs.indexOf(document.activeElement);
    e.preventDefault(); moved = true; (bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length] || box).focus();
  };
  function close() { if (open !== api) return; open = null; box.remove(); document.removeEventListener('pointerdown', onDown, true); box.removeEventListener('keydown', onKey); }
  document.addEventListener('pointerdown', onDown, true);
  box.addEventListener('keydown', onKey);
  const api = { el: box, close, rows: () => rows };
  open = api;
  draw(); place();
  fetchJson('/api/desktop/machines').then((r) => { if (open !== api) return; loading = false; machines = r && Array.isArray(r.machines) ? r.machines : []; draw(); place(); }).catch(() => { if (open !== api) return; loading = false; draw(); });
  return api;
}
