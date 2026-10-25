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
import { runningWhereText } from './desktop-app-words.js'; // lane app-launch-singleton: where it runs / who started it (a leaf)
import { RUNNING_STATES, userStoppedHeld } from '../desktop-fit.js';
import { probeAge } from '../desktop-machines-cache.js'; // lane desktop-picker-instant: a row's 技术细节 (PURE)

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
const STATE_WORDS = { ready: () => t('Ready'), setup: () => t('Set up first'), offline: () => t('Offline'), checking: () => t('Checking…') };
const displayWord = (d) => (d.name ? `${d.n} ${d.name}` : String(d.n));

let open = null; // the one popover

// ── lane desktop-picker-instant (owner 2026-10-19 「这个界面的加载时间怎么越来越长了」): the machine rows answer AT ONCE from the hub's
// last known state; a probe that lands later is BROADCAST (`desktop-machines-updated`) and patches its row in place ──
/**
 * Watch the machine rows for an open dialog: `onRows(rows)` with GET /api/desktop/machines' answer (at once), then with every
 * `desktop-machines-updated` broadcast; when the answer says probes are in flight, ONE follow-up (`?wait=1`) brings their rows
 * too (a broadcast missed while the socket reconnects). A row never goes back to an older probe than the one drawn (the socket
 * and the follow-up may arrive in either order). `onError(answer|null)` = no rows came. → stop()
 */
export function watchMachines(app, onRows, onError = null) {
  let alive = true;
  const latest = new Map(); // hostId → the newest row drawn (by the hub's probedAt)
  const take = (rows) => {
    if (!alive) return;
    const next = rows.map((r) => { const cur = r && latest.get(r.hostId); return cur && (cur.probedAt || 0) > ((r && r.probedAt) || 0) ? cur : r; });
    for (const r of next) if (r && r.hostId) latest.set(r.hostId, r);
    onRows(next);
  };
  const off = app && app.ws && typeof app.ws.onGlobal === 'function' ? app.ws.onGlobal((m) => { if (m && m.type === 'desktop-machines-updated' && Array.isArray(m.machines)) take(m.machines); }) : null;
  fetchJson('/api/desktop/machines').then((r) => {
    if (!alive) return null;
    if (!r || !Array.isArray(r.machines)) { if (onError) onError(r); return null; }
    take(r.machines);
    return Array.isArray(r.refreshing) && r.refreshing.length ? fetchJson('/api/desktop/machines?wait=1').then((w) => { if (w && Array.isArray(w.machines)) take(w.machines); }) : null;
  });
  return () => { alive = false; try { off?.(); } catch { /* gone */ } };
}
/** Check again: probe `hostId` NOW and wait for it. → every row | null */
export async function recheckMachines(hostId) {
  const r = await fetchJson(`/api/desktop/machines?fresh=1&host=${encodeURIComponent(hostId)}`);
  return r && Array.isArray(r.machines) ? r.machines : null;
}
/** A machine row's 技术细节 (its title): 「上次检查 N 秒前 · 探测 M ms」 — '' for a row never probed (a row still checking says so). */
export function machineProbeText(m) {
  const a = probeAge(m);
  if (!a) return m && m.code === 'checking' ? t('Checking…') : '';
  const ago = a.s < 120 ? t('Checked {n} s ago', { n: a.s }) : t('Checked {n} min ago', { n: Math.round(a.s / 60) });
  return a.ms == null ? ago : `${ago} · ${t('probe {ms} ms', { ms: a.ms })}`;
}
/** Put `kids` in `parent` in order, moving only what is out of place: a node already where it belongs (the focused row) is
 *  never detached, so a patched row keeps the focus. */
function syncChildren(parent, kids) {
  kids.forEach((k, i) => { if (parent.children[i] !== k) parent.insertBefore(k, parent.children[i] || null); });
  while (parent.children.length > kids.length) parent.lastElementChild.remove();
}

/** The row's own act: the local desktop, a machine's desktop (on a display), or its setup words. */
function openRow(app, row) {
  if (row.kind === 'local') { rememberDesktop('local'); app.openDesktop(); return; }
  const m = row.machine;
  if (row.state === 'setup') { showMachineDesktopDialog(app, m, { recheck: async (id) => { const ms = await recheckMachines(id); return ms ? ms.find((x) => x.hostId === id) || null : null; } }); return; }
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
  let apps = []; // lane app-launch-singleton: every live desktop app (an agent-started one too) — GET /api/desktop/apps?records=1, then the broadcast
  const local = { available: app._vncAvailable !== false, seat: app._vncSeat || null };
  // lane desktop-picker-instant: every node is KEYED and re-used — a late probe patches its row in place (the focused row is never
  // rebuilt or detached); `keep` = key → node, `seen` = the keys this draw used
  const keep = new Map();
  let seen = new Set();
  const node = (key, make) => { let n = keep.get(key); if (!n) { n = make(); keep.set(key, n); } seen.add(key); return n; };
  const note = (key, words) => { const n = node(key, () => el('div', 'desktop-picker-note')); n.textContent = words; return n; };
  const draw = () => {
    rows = pickerRows({ local, machines: machines || [], recent: readRecent() });
    seen = new Set();
    const kids = [];
    let group = null;
    for (const r of rows) {
      if (r.group !== group) { group = r.group; const g = node('g|' + group, () => el('div', 'desktop-picker-group')); g.textContent = group === 'recent' ? t('Recent') : group === 'local' ? t('Local') : t('Remote'); kids.push(g); }
      const b = node(`r|${r.group}|${r.hostId}`, () => { const x = el('button', 'desktop-picker-row'); x.type = 'button'; x.setAttribute('role', 'menuitem'); return x; });
      b.dataset.group = r.group; b.dataset.host = r.hostId; b.dataset.state = r.state;
      const name = r.kind === 'local' ? t('VibeSpace virtual desktop') : nameOf(r.machine);
      const ds = r.kind === 'machine' ? knownDisplays(r.hostId) : [];
      const onDisplay = r.display != null ? ds.find((d) => d.key === r.display) : null;
      const parts = [el('span', 'desktop-picker-name', r.display != null ? `${name} · ${onDisplay ? displayWord(onDisplay) : t('Display {n}', { n: r.display })}` : name), el('span', 'desktop-picker-state', STATE_WORDS[r.state]())];
      if (r.kind === 'local' && r.seat === 'wayland') parts.push(el('span', 'desktop-picker-note', t('This host’s own screen is a Wayland session — it cannot be shown yet; the virtual desktop can')));
      if (r.kind === 'machine' && r.group === 'remote' && ds.length > 1) parts.push(el('span', 'desktop-picker-chips', ds.map(displayWord).join(' · ')));
      b.replaceChildren(...parts);
      b.title = r.kind === 'machine' ? machineProbeText(r.machine) : ''; // 「上次检查 N 秒前 · 探测 M ms」
      b.disabled = !r.enabled;
      b.onclick = () => { close(); openRow(app, r); };
      kids.push(b);
    }
    if (loading) kids.push(note('n|loading', t('Checking machines…')));
    else if (!rows.some((r) => r.group === 'remote')) kids.push(note('n|none', t('No paired Windows or Mac machine yet')));
    // lane app-launch-singleton (the reporter: 「那个 agent 说启动了 Chrome，我本来也找不到它启动的 Chrome 到底在哪儿」): EVERY running app
    // window, whoever started it — where, who, Open (its window), Close
    const live = apps.filter((a) => a && RUNNING_STATES.includes(a.state) && !a.replacedBy);
    const stoppedHeld = apps.filter(userStoppedHeld); // lane browser-display-holders: a browser display the person stopped while conversations hold it
    if (live.length || stoppedHeld.length) { const g = node('g|apps', () => el('div', 'desktop-picker-group')); g.textContent = t('Running apps'); kids.push(g); }
    for (const a of live) {
      const line = node('a|' + a.id, () => {
        const l = el('div', 'desktop-picker-app');
        const b = el('button', 'desktop-picker-row desktop-picker-app-open'); b.type = 'button'; b.setAttribute('role', 'menuitem');
        const o = el('button', 'desktop-picker-app-btn desktop-picker-app-go'); o.type = 'button';
        const st = el('button', 'desktop-picker-app-btn desktop-picker-app-stop'); st.type = 'button';
        l.append(b, o, st);
        return l;
      });
      const [b, o, s] = line.children;
      b.dataset.group = 'apps'; b.dataset.host = a.id; b.dataset.state = a.state;
      b.replaceChildren(el('span', 'desktop-picker-name', String(a.appTitle || a.label || a.exec || a.id)), el('span', 'desktop-picker-state', runningWhereText(a)));
      b.title = t('Open');
      b.onclick = () => { close(); app.openDesktopApp(a.id); };
      o.textContent = t('Open');
      o.onclick = (e) => { e.stopPropagation(); close(); app.openDesktopApp(a.id); };
      s.textContent = t('Close');
      s.title = t('Close {app}', { app: String(a.label || a.exec || a.id) });
      // the ONE stop (LibreOffice asked first) — loaded when pressed: the launcher is the whole Apps dialog, this popover is not
      s.onclick = async (e) => { e.stopPropagation(); s.disabled = true; const { stopDesktopApp } = await import('./desktop-app-launcher.js'); await stopDesktopApp(a.id, { name: a.label || a.exec }); };
      kids.push(line);
    }
    // lane browser-display-holders: nothing runs (no Open, no Close) — the row says who starts it again
    for (const a of stoppedHeld) {
      const line = node('s|' + a.id, () => { const l = el('div', 'desktop-picker-app desktop-picker-app-stopped'); const b = el('button', 'desktop-picker-row desktop-picker-app-open'); b.type = 'button'; b.disabled = true; l.append(b); return l; });
      const b = line.firstChild;
      b.dataset.group = 'apps'; b.dataset.host = a.id; b.dataset.state = 'user-stopped';
      const n = Number(a.holders) || 0;
      b.replaceChildren(el('span', 'desktop-picker-name', String(a.appTitle || a.label || a.id)), el('span', 'desktop-picker-state', n === 1 ? t('You stopped it · 1 conversation starts it again when it next uses it') : t('You stopped it · {n} conversations start it again when they next use it', { n })));
      kids.push(line);
    }
    for (const k of [...keep.keys()]) if (!seen.has(k)) keep.delete(k);
    const was = document.activeElement;
    const had = moved && was && was !== box && box.contains(was) ? was : null; // the person moved the focus: it stays on THEIR row
    syncChildren(box, kids);
    if (had && box.contains(had)) { if (document.activeElement !== had) had.focus(); return; }
    // else the first row again (the recent one arrives with the machines) — focus() on the row that has it moves nothing
    const want = focusHost ? box.querySelector(`.desktop-picker-row[data-group="remote"][data-host="${CSS.escape(focusHost)}"]`) : null;
    const target = want || box.querySelector('.desktop-picker-row:not([disabled])') || box;
    if (document.activeElement !== target) target.focus();
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
  const offApps = app.ws && typeof app.ws.onGlobal === 'function' ? app.ws.onGlobal((m) => { if (m.type === 'desktop-apps-updated' && open === api && Array.isArray(m.apps)) { apps = m.apps; draw(); place(); } }) : null;
  // lane desktop-picker-instant: the rows at once, a landed probe patches its row (no 「正在查看机器…」 over a slow machine)
  const offMachines = watchMachines(app, (ms) => { if (open !== api) return; loading = false; machines = ms; draw(); place(); }, () => { if (open !== api) return; loading = false; draw(); });
  function close() { if (open !== api) return; open = null; box.remove(); document.removeEventListener('pointerdown', onDown, true); box.removeEventListener('keydown', onKey); try { offApps?.(); } catch { /* gone */ } try { offMachines(); } catch { /* gone */ } }
  document.addEventListener('pointerdown', onDown, true);
  box.addEventListener('keydown', onKey);
  const api = { el: box, close, rows: () => rows };
  open = api;
  draw(); place();
  fetchJson('/api/desktop/apps?records=1').then((r) => { if (open !== api || !r || !Array.isArray(r.apps)) return; apps = r.apps; draw(); place(); }).catch(() => { /* the list says nothing then */ });
  return api;
}
