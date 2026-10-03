// THE PRINCIPAL PICKER (2026-09-27, lane channel-polish — the owner: "如果
// session 特别多的话，你现在的那个选择 session/group 的 dropdown 交互会很不
// 友好"). ONE control for every place a person picks an agent session or a
// Task Group: Grant access… / Notify… / Reach & policy (channel-filter-editor,
// channel-reach-editor), New group / Invite… (channel-group-dialogs), a
// desktop-app window's Share with agents / Ask an agent (window-share). The
// arithmetic is PURE (src/lib/principal-picker-model.js); this is its DOM:
//
//  · a SEARCH BOX that filters as you type (name, folder, Task Group,
//    backend, id prefix — accent / case-insensitive, CJK by substring), a
//    LIST under it: "Recent" (this device's last picks), "Task Groups", then
//    the sessions under their Task Group, then "Other"; a session row =
//    backend icon · name · folder tail · live dot · its Task Group chip;
//  · MULTI (chips above the box, each with ✕) or SINGLE (one chip);
//    `compact` = a single pick behind a trigger button (the box + list in a
//    popover), for a row inside a form;
//  · keyboard: ↑ / ↓ / Enter — Enter picks the highlighted row, else the first
//    row ONLY while it is the one the person's own act put there (a roster
//    patch that moved another row to the top disarms it — verify round 3; a
//    refused Enter then HIGHLIGHTS the first row instead of doing nothing, so
//    the next Enter's pick is on the screen first — verify round 4; a HELD
//    Enter's repeats pick nothing — verify round 5);
//    Esc clears the query first (then the dialog's own Esc); Backspace on an
//    empty box removes the last chip;
//  · KEYED rows patched in place — a roster re-read (`active-sessions` /
//    `tasks-updated`) never re-creates the box or a row the person is on, and
//    touches only the nodes that MOVED (a detached row loses the click in
//    flight on it — verify round 4);
//  · every name is peer-controlled text ⇒ textContent only;
//  · ALL AGENTS (lane everyone-principal, 2026-10-02): `everyone: {key, name?, hint?}` puts THE row "All agents —
//    every conversation, now and later" FIRST (above Recent, its own section, a search never hides it, its chip first,
//    never a recent pick, never Enter's first-row fallback — a click, or ↑ / ↓ then Enter; the first ↓ lands on the
//    first named row); `everyone: 'roster'` = the caller's rows carry a row of kind `everyone` themselves (Notify…:
//    only while All holds access; window share: checked from the record), drawn the same way. Every permission
//    surface passes it (scripts/test-everyone-principal.mjs is the census) — the caller maps the row to its own
//    model's spelling.
import { t } from './i18n.js';
import { createPopover } from './utils.js';
import { icon, el, avatar } from './channel-chrome.js';
import { createBackendIcon } from './agent-meta.js';
import * as PM from './principal-picker-model.js';

const RECENT_KEY = 'vibespace.principalPicker.recent';
let seq = 0;

/** This device's recent picks (identities `agent:<id>` / `group:<id>`, newest first). */
export function readRecent() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
function remember(row) {
  if (PM.isEveryone(row)) return;   // All agents is always first — it never takes a recent slot
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(PM.pushRecent(readRecent(), PM.identityOf(row)))); } catch {}
}

/**
 * The live roster as picker rows: every live agent session with a
 * conversation id (the agent principal's id) and every Task Group, each
 * session carrying its Task Groups (the sidebar's own membership rule).
 * `key` = `agent:<cid>` / `group:<id>` — callers map their own values.
 */
export function rosterFromApp(app, { agents = true, groups = true } = {}) {
  const sb = (app && app.sidebar) || {};
  const tasks = (sb._tasks || []).filter((g) => g && g.id && !g.archived);
  const title = (g) => g.title || g.name || g.id;
  const out = [];
  if (groups) for (const g of tasks) out.push({ key: `group:${g.id}`, kind: 'group', id: g.id, name: title(g), groupIds: [], groupNames: [] });
  if (agents) for (const s of sb._webuiSessions || []) {
    const cid = s && (s.backendSessionId || s.claudeSessionId);
    if (!cid) continue;
    let tgs = [];
    try { tgs = typeof sb._getSessionTaskGroups === 'function' ? sb._getSessionTaskGroups(s) || [] : []; } catch { tgs = []; }
    out.push({ key: `agent:${cid}`, kind: 'agent', id: cid, name: s.name || String(cid).slice(0, 8), folder: PM.folderTail(s.cwd), backend: s.backend || 'claude', live: true, groupIds: tgs.map((g) => g.id), groupNames: tgs.map(title), webuiId: s.id });
  }
  return out;
}

/**
 * Build a picker. `items` = rows, or a function returning them (re-read on
 * the roster's broadcasts when `app` is given). Returns
 * `{el, selected(), setSelected(keys), refresh(), focus(), close()}`.
 */
export function principalPicker({ items = [], app = null, multi = false, compact = false, selected = [], placeholder = '', label = '', emptyText = '', autofocus = false, onChange = null, cls = '', everyone = null } = {}) {
  const id = `pp-${++seq}`;
  const raw = typeof items === 'function' ? items : () => items;
  // THE ALL-AGENTS ROW (the caller's key and words; the device's words by default) — first, unless the roster
  // already carries an `everyone` row of its own (`everyone: 'roster'`)
  const allRow = everyone && typeof everyone === 'object' ? PM.everyoneRow({ key: everyone.key || 'everyone:*', name: everyone.name || t('All agents'), hint: everyone.hint != null ? everyone.hint : t('every conversation, now and later') }) : null;
  const source = () => { const r = raw() || []; return allRow && !r.some((x) => x && PM.isEveryone(x)) ? [allRow, ...r] : r; };
  let rows = source() || [];
  let sel = (selected || []).map(String);
  let query = '';
  let active = null;
  // the recent picks as they were when the list OPENED — a pick made now is remembered for the next time,
  // it never moves a row under the person's pointer while they pick
  let recentAtOpen = readRecent();
  const root = el('div', 'pp' + (multi ? ' pp-multi' : ' pp-single') + (compact ? ' pp-compact' : '') + (cls ? ' ' + cls : ''));
  root.dataset.principalPicker = multi ? 'multi' : 'single';
  const chips = el('div', 'pp-chips');
  const box = document.createElement('input');
  box.type = 'search'; box.className = 'pp-input'; box.spellcheck = false; box.autocomplete = 'off';
  box.placeholder = placeholder || t('Search sessions and groups…');
  box.setAttribute('role', 'combobox'); box.setAttribute('aria-autocomplete', 'list'); box.setAttribute('aria-expanded', 'true');
  box.setAttribute('aria-controls', `${id}-list`); box.setAttribute('aria-label', label || box.placeholder);
  const list = el('div', 'pp-list');
  list.id = `${id}-list`; list.setAttribute('role', 'listbox');
  if (multi) list.setAttribute('aria-multiselectable', 'true');
  const nodes = new Map();   // key → row node (KEYED: patched in place)
  const heads = new Map();   // section key → head node
  let trigger = null, pop = null;

  const byKey = () => new Map(rows.map((r) => [String(r.key), r]));
  /** Every row this picker has SEEN, by key — a picked session that died keeps its name on the chip and the
   *  dialog's row (it read as the raw `agent:<id>` key before, verify round 3). */
  const known = new Map();
  const noteRows = () => { for (const r of rows) if (r && r.key != null) known.set(String(r.key), r); };
  noteRows();
  const nameOf = (k) => { const r = byKey().get(k) || known.get(k); return r ? r.name : k; };
  const fire = (picked) => { if (onChange) { try { onChange(sel.slice(), picked || null); } catch (e) { console.warn('[principal-picker] onChange', e); } } };

  const everyoneKeys = () => rows.filter((r) => PM.isEveryone(r)).map((r) => String(r.key));
  const glyphOf = (r) => (PM.isEveryone(r) ? 'everyone' : r.kind === 'group' ? 'users' : null);
  function chipOf(r) {
    const c = el('span', 'pp-chip' + (PM.isEveryone(r) ? ' pp-chip-everyone' : ''));
    c.dataset.key = String(r.key);
    c.appendChild(avatar({ name: r.name, key: PM.identityOf(r), glyph: glyphOf(r) }, 18, 'pp-chip-av'));
    c.appendChild(el('span', 'pp-chip-name', r.name));
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'pp-chip-x';
    x.title = t('Remove {name}', { name: r.name }); x.setAttribute('aria-label', x.title);
    x.appendChild(icon('close', 10));
    x.onclick = (ev) => { ev.stopPropagation(); unpick(String(r.key)); box.focus(); };
    c.appendChild(x);
    return c;
  }
  /** MOVE ONLY WHAT MOVED (verify round 4, 2026-09-27): `replaceChildren` detached EVERY row on every roster broadcast
   *  (`active-sessions` = every turn-state change, every second on a busy fleet), and Chrome drops a click whose
   *  mousedown node was detached — a trusted click across a broadcast that changed NOTHING was lost (reproduced 2/2).
   *  Nodes already at their place are never touched; only a node that moved, appeared or vanished is. */
  function reconcile(parent, out) {
    const kids = parent.childNodes;
    for (let i = 0; i < out.length; i++) if (kids[i] !== out[i]) parent.insertBefore(out[i], kids[i] || null);
    while (kids.length > out.length) parent.removeChild(kids[kids.length - 1]);
  }
  const chipNodes = new Map();   // key → chip node (KEYED, like the rows: a press on a chip's ✕ survives a patch)
  function drawChips() {
    const m = byKey();
    const out = [];
    for (const k of PM.chipOrder(sel, everyoneKeys())) {   // the All-agents chip first
      const r = m.get(k) || known.get(k) || { key: k, kind: k.startsWith('group:') ? 'group' : 'agent', name: k };
      let c = chipNodes.get(k);
      if (!c || c.dataset.name !== r.name) { c = chipOf(r); c.dataset.name = r.name; chipNodes.set(k, c); }
      out.push(c);
    }
    for (const k of [...chipNodes.keys()]) if (!sel.includes(k)) chipNodes.delete(k);
    reconcile(chips, out);
    chips.style.display = sel.length ? '' : 'none';
    if (trigger) {
      trigger.textContent = '';
      const r = m.get(sel[0]);
      trigger.appendChild(el('span', 'pp-trigger-name', r ? r.name : (placeholder || t('Search sessions and groups…'))));
      trigger.classList.toggle('pp-trigger-empty', !r);
      trigger.appendChild(icon('chevronDown', 10));
    }
  }
  function rowNode(r) {
    let n = nodes.get(String(r.key));
    if (!n) {
      n = el('div', 'pp-row');
      n.dataset.key = String(r.key);
      n.id = `${id}-o-${nodes.size}`;
      n.setAttribute('role', 'option');
      n.addEventListener('mousedown', (ev) => ev.preventDefault());   // the box keeps the focus
      n.addEventListener('click', () => { const cur = byKey().get(n.dataset.key); if (cur && !cur.disabled) pick(cur); });
      nodes.set(String(r.key), n);
    }
    // PATCH in place: the parts are rebuilt only when what they say changed
    const sig = JSON.stringify([r.kind, r.name, r.folder, r.backend, r.live, r.groupNames, r.hint, r.disabled]);
    if (n.dataset.sig !== sig) {
      n.dataset.sig = sig;
      n.textContent = '';
      n.appendChild(el('span', 'pp-check'));
      n.classList.toggle('pp-row-everyone', PM.isEveryone(r));
      if (r.kind === 'group' || PM.isEveryone(r)) n.appendChild(avatar({ name: r.name, key: PM.identityOf(r), glyph: glyphOf(r) }, 20, 'pp-av'));
      else { const bi = createBackendIcon(r.backend || 'claude', { className: 'pp-backend' }); bi.setAttribute('aria-hidden', 'true'); n.appendChild(bi); }
      n.appendChild(el('span', 'pp-name', r.name));
      if (r.folder) n.appendChild(el('span', 'pp-folder', r.folder));
      if (r.kind === 'agent' && r.live) { const d = el('span', 'pp-live'); d.title = t('live'); n.appendChild(d); }
      if (r.kind === 'agent' && r.groupNames && r.groupNames[0]) n.appendChild(el('span', 'pp-tg', r.groupNames[0]));
      if (r.hint) n.appendChild(el('span', 'pp-hint', r.hint));
      n.title = [r.name, r.folder, (r.groupNames || []).join(', '), r.hint].filter(Boolean).join(' · ');
    }
    const on = sel.includes(String(r.key));
    n.setAttribute('aria-selected', on ? 'true' : 'false');
    n.classList.toggle('pp-on', on);
    n.classList.toggle('pp-disabled', !!r.disabled);
    if (r.disabled) n.setAttribute('aria-disabled', 'true'); else n.removeAttribute('aria-disabled');
    n.classList.toggle('pp-active', active === String(r.key));
    return n;
  }
  function headNode(key, text) {
    let h = heads.get(key);
    if (!h) { h = el('div', 'pp-sec'); h.setAttribute('role', 'presentation'); heads.set(key, h); }
    if (h.textContent !== text) h.textContent = text;
    return h;
  }
  let visibleKeys = [];
  /** The first row the PERSON was last shown — Enter's fallback while it is still first (PURE `enterTarget`). */
  let armedFirst = null;
  /** `byPerson` = this redraw is the person's own act (typing, a key, a pick) and arms the first row; a roster
   *  patch is not — it keeps the highlight by KEY and never arms a row the person has not seen. */
  function drawList({ byPerson = true } = {}) {
    const shown = PM.filterPrincipals(rows, query);
    const { recent, rest } = PM.rankRecent(shown, recentAtOpen.map((idn) => { const r = rows.find((x) => PM.identityOf(x) === idn); return r ? r.key : null; }).filter((k) => k != null));
    const out = [];
    visibleKeys = [];
    const add = (r) => { out.push(rowNode(r)); if (!r.disabled) visibleKeys.push(String(r.key)); };
    const secs = PM.groupPrincipals(rest);
    // ALL AGENTS first — above Recent, whatever the query
    for (const s of secs) if (s.kind === 'everyone') s.rows.forEach(add);
    if (recent.length) { out.push(headNode('recent', t('Recent'))); recent.forEach(add); }
    let sessionsHead = false;
    for (const s of secs) {
      if (s.kind === 'everyone') continue;
      if (s.kind === 'groups') { out.push(headNode('groups', t('Task Groups'))); s.rows.forEach(add); continue; }
      if (!sessionsHead) { out.push(headNode('sessions', t('Sessions'))); sessionsHead = true; }
      out.push(headNode(s.key, s.kind === 'sessions-other' ? t('Other') : s.title));
      heads.get(s.key).classList.add('pp-sub');
      if (s.kind === 'sessions-group') heads.get(s.key).classList.add('pp-tghead');   // a Task Group's own title (data)
      s.rows.forEach(add);
    }
    if (!shown.some((r) => !PM.isEveryone(r))) {
      const e = headNode('empty', query.trim() ? t('No session or group matches “{q}”', { q: query.trim() }) : (emptyText || t('No live session or Task Group to pick')));
      e.classList.add('pp-empty');
      out.push(e);
    }
    const gone = !!(active && !visibleKeys.includes(active));
    if (gone) active = null;
    if (byPerson) armedFirst = PM.armableFirst(visibleKeys, everyoneKeys());   // never the All-agents row
    else if (gone) armedFirst = null;   // the row the person had highlighted vanished under a patch: Enter picks nothing
    for (const k of visibleKeys) { const n = nodes.get(k); n.classList.toggle('pp-active', k === active); }
    reconcile(list, out);   // the same nodes; only the ones that MOVED are touched (round 4) — never re-created
    if (active) box.setAttribute('aria-activedescendant', nodes.get(active).id); else box.removeAttribute('aria-activedescendant');
  }
  function pick(r) {
    const k = String(r.key);
    if (multi) { if (sel.includes(k)) sel = sel.filter((x) => x !== k); else { sel = [...sel, k]; remember(r); } }
    else { sel = [k]; remember(r); }
    query = ''; box.value = '';
    drawChips(); drawList(); fire(r);
    if (compact) closePop();
  }
  function unpick(k) { sel = sel.filter((x) => x !== k); drawChips(); drawList(); fire(null); }
  box.addEventListener('input', () => { query = box.value; active = null; drawList(); });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = PM.moveActive(visibleKeys, active, e.key === 'ArrowUp' ? -1 : 1, { skip: everyoneKeys() });   // the first ↓ lands on a named row; All is one ↑ above
      drawList();
      const n = active && nodes.get(active);
      if (n && n.scrollIntoView) n.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      // A HELD ENTER IS ONE ENTER (verify round 5): the OS repeats the key at ~30 Hz after its delay, and each repeat
      // toggled the first row of a multi picker on and off — the final pick was the parity of how long the finger
      // stayed down. A repeat picks nothing; a new press does.
      if (e.repeat) return;
      // the highlighted row, else the first row ONLY while it is the one the person was shown (verify round 3)
      const k = PM.enterTarget({ active, visibleKeys, armedFirst, skip: everyoneKeys() });
      const r = k && byKey().get(k);
      if (r && !r.disabled) pick(r);
      else if (!k && !active && visibleKeys.length) {
        // A REFUSED ENTER IS SHOWN, NOT SWALLOWED (verify round 4): after a patch moved another row to the top, Enter
        // picked nothing — silently, for ever, until the person typed. Now it HIGHLIGHTS the first row (the rule for a
        // highlighted row is unchanged: the next Enter takes it by key, a patch that removes it disarms), so what a
        // further Enter would take is on the screen first.
        // (lane everyone-principal) never the All-agents row: a second Enter must not grant "every conversation"
        active = PM.armableFirst(visibleKeys, everyoneKeys());
        if (!active) return;
        drawList({ byPerson: false });
        const n = nodes.get(active);
        if (n && n.scrollIntoView) n.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Escape') {
      if (box.value) { e.preventDefault(); e.stopPropagation(); box.value = ''; query = ''; drawList(); }
    } else if (e.key === 'Backspace' && !box.value && multi && sel.length) {
      e.preventDefault(); unpick(sel[sel.length - 1]);
    }
  });

  function closePop() {
    if (pop) { pop.remove(); pop = null; }
    if (trigger) { trigger.setAttribute('aria-expanded', 'false'); try { trigger.focus({ preventScroll: true }); } catch {} }
  }
  if (compact) {
    trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'pp-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', label || placeholder || t('Search sessions and groups…'));
    trigger.onclick = (ev) => {
      ev.stopPropagation();
      if (pop && pop.isConnected) { closePop(); return; }
      // the house popover: it closes itself on an outside press and on Esc (the data-popover protocol)
      pop = createPopover(trigger, 'pp-pop');
      pop.append(box, list);
      trigger.setAttribute('aria-expanded', 'true');
      query = ''; box.value = ''; active = null; recentAtOpen = readRecent(); drawList();
      setTimeout(() => { try { box.focus({ preventScroll: true }); } catch {} }, 0);
    };
    root.append(trigger);
  } else {
    root.append(chips, box, list);
  }
  drawChips(); drawList();

  // the ROSTER's broadcasts: re-read and patch in place (never while the root is gone)
  let off = null;
  if (app && app.ws && typeof app.ws.onGlobal === 'function' && typeof items === 'function') {
    const onMsg = (m) => {
      if (!root.isConnected && !pop) { try { app.ws.offGlobal(onMsg); } catch {} return; }
      if (m && (m.type === 'active-sessions' || m.type === 'tasks-updated')) setTimeout(() => api.refresh(), 0);   // after the sidebar applied it
    };
    app.ws.onGlobal(onMsg);
    off = () => { try { app.ws.offGlobal(onMsg); } catch {} };
  }
  const api = {
    el: root,
    selected: () => sel.slice(),
    selectedRows: () => { const m = byKey(); return sel.map((k) => m.get(k)).filter(Boolean); },
    setSelected: (keys) => { sel = (keys || []).map(String); drawChips(); drawList({ byPerson: false }); },
    // the roster's broadcast: rows patched in place, the highlight kept by KEY (gone ⇒ nothing highlighted)
    refresh: () => { rows = source() || []; noteRows(); drawChips(); drawList({ byPerson: false }); },
    focus: () => { try { (trigger || box).focus({ preventScroll: true }); } catch {} },
    /** A write in flight: the box and every row stop taking input (the caller repaints after). */
    setBusy: (b) => { root.classList.toggle('pp-busy', !!b); box.disabled = !!b; if (trigger) trigger.disabled = !!b; for (const x of chips.querySelectorAll('button')) x.disabled = !!b; },
    /** The END of the picker: its popover closed, its roster listener removed — the dialog's `onClose` calls it
     *  (left alone the listener removes itself at the next broadcast it hears with the root gone). */
    close: () => { closePop(); if (off) { off(); off = null; } },
    nameOf,
  };
  if (autofocus) setTimeout(() => api.focus(), 0);
  return api;
}
