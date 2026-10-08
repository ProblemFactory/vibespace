// THE ARTIFACTS WINDOW (lane artifacts-list-scale; design 021 direction B behind the popover's ⤢ — owner 2026-10-07
// "A思路可以，可以加上个按钮可以打开B"; the desk's "不做" reversed by the owner). Window type `artifacts`:
//   · openSpec `{action:'openArtifacts', sessionId, name}`; ONE window per conversation per client (`revealWindow`);
//     title "Artifacts — <conversation name>".
//   · a left RAIL (all · the kinds with counts · the helpers with counts · recent) + a TABLE (name · kind · helper · edits
//     · last change (relative; the absolute date on hover) · path tail · ⋯), sortable by a column head, the popover's
//     filter box on top. The rail's click = the group filter. EVERY row decision is the PURE model the popover draws
//     (src/lib/artifacts-list-model.js: railRows → filterRows → sortRows) — the window is A at full size, never a
//     second model; rows KEYED and PATCHED IN PLACE (the popover's rule).
//   · LIVE: the conversation's chat views hand every Artifacts refresh to `onArtifacts` (src/lib/artifact-card.js — the
//     chip's path: a card's birth / patch, an attach), so a new file / a service stopping lands here as it happens.
//   · phone: the normal phone window; the rail folds into a row of chips above the table (chat.css).
import { t } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { UI_ICONS } from './icons.js';
import { showContextMenu } from './utils.js';
import { rowsOfView, filterRows, sortRows, railOf, railRows, countLine } from './artifacts-list-model.js';
import { artifactRowIcon, artifactRowWords, setArtifactName, artifactRowMenu, artifactHeadWords, onArtifacts } from './artifact-card.js';

const div = (cls) => { const n = document.createElement('div'); n.className = cls; return n; };
const span = (cls) => { const n = document.createElement('span'); n.className = cls; return n; };
const COLS = [['name', 'Name'], ['kind', 'Kind'], ['helper', 'Helper'], ['edits', 'Edits'], ['changed', 'Last change'], ['path', 'Path']];
const tail = (p) => String(p || '').replace(/\/+$/, '').split('/').filter(Boolean).slice(-2).join('/');
const stamp = (ts) => { try { return ts ? new Date(ts).toLocaleString() : ''; } catch { return ''; } };

/** The rows the table draws: the rail's choice → the filter → the column sort — ALL through the shared model. */
export function windowRows(v, { rail = 'all', q = '', col = 'changed', dir = '' } = {}) {
  const f = filterRows(railRows(rowsOfView(v), rail), q);
  return { rows: sortRows(f.rows, { col, dir }), filtered: f.q ? f : null };
}
/** A row opens through the conversation's chat view when this client shows it (its one door), else by its kind. */
function openFrom(app, sessionId, b) {
  const cv = [...(app.sessions?.values?.() || [])].find((x) => x && x.sessionId === sessionId && typeof x._openArtifact === 'function');
  if (cv) return cv._openArtifact(b);
  if (b.kind === 'service') { if (app.openBrowser && b.url) app.openBrowser(b.url); return; }
  if (b.kind === 'design') { app.openDesign?.({ host: b.host || '', dir: b.path, sessionId }); return; }
  if (b.path) app.openFile?.(b.path, b.name || b.path.split('/').pop(), { host: b.host || undefined });
}

/** The window's content over `root`; returns {draw, update(v), state}. `fetchView()` → the server's view(rows). */
export function mountArtifactsWindow(root, { app = null, sessionId = '', signal = null, fetchView = null } = {}) {
  const st = { v: null, rail: 'all', q: '', col: 'changed', dir: '' };
  const rail = div('af-win-rail'); rail.setAttribute('role', 'listbox'); rail.setAttribute('aria-label', t('Group by'));
  const main = div('af-win-main');
  const top = div('af-top');
  const search = div('af-search');
  const sic = span('af-search-ic'); sic.setAttribute('aria-hidden', 'true'); sic.innerHTML = UI_ICONS.search || '';
  const input = document.createElement('input'); input.type = 'search'; input.className = 'af-filter'; input.placeholder = t('Filter: name / path / helper…'); input.setAttribute('aria-label', t('Filter: name / path / helper…')); input.maxLength = 80; input.spellcheck = false;
  const count = span('af-count chat-status-dim');
  search.append(sic, input);
  top.append(search, count);
  const table = div('af-table'); table.setAttribute('role', 'table');
  const thead = div('af-thead'); thead.setAttribute('role', 'row');
  const tbody = div('af-tbody'); tbody.setAttribute('role', 'rowgroup');
  const empty = div('chat-status-dropdown-note af-empty'); empty.textContent = t('No matching artifacts');
  for (const [col, word] of COLS) {
    const h = document.createElement('button'); h.type = 'button'; h.className = 'af-th af-c-' + col; h.dataset.col = col; h.setAttribute('role', 'columnheader');
    h.append(span('af-th-word'), span('af-th-dir'));
    h.querySelector('.af-th-word').textContent = t(word);
    h.addEventListener('click', () => { if (st.col === col) st.dir = (st.dir || (col === 'edits' || col === 'changed' ? 'desc' : 'asc')) === 'asc' ? 'desc' : 'asc'; else { st.col = col; st.dir = ''; } draw(); });
    thead.appendChild(h);
  }
  thead.appendChild(span('af-th af-c-more'));
  table.append(thead, tbody);
  main.append(top, table);
  root.append(rail, main);
  const railEls = new Map(), rowEls = new Map();
  const railItem = (key, words, n, cls = '') => {
    let it = railEls.get(key);
    if (!it) {
      it = div('af-rail-item' + (cls ? ' ' + cls : '')); it.dataset.rail = key; it.setAttribute('role', 'option'); it.tabIndex = 0;
      it.append(span('af-rail-word'), span('af-rail-n'));
      it.addEventListener('click', () => { st.rail = key; draw(); });
      it.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.rail = key; draw(); } });
      railEls.set(key, it);
    }
    const w = it.querySelector('.af-rail-word'); if (w.textContent !== words) w.textContent = words;
    const c = it.querySelector('.af-rail-n'), ns = n == null ? '' : String(n); if (c.textContent !== ns) c.textContent = ns;
    const on = st.rail === key; if (it.classList.contains('active') !== on) { it.classList.toggle('active', on); it.setAttribute('aria-selected', String(on)); }
    return it;
  };
  const railHead = (key, words) => { let h = railEls.get(key); if (!h) { h = div('af-rail-head chat-status-dim'); railEls.set(key, h); } if (h.textContent !== words) h.textContent = words; return h; };
  const rowEl = (b) => {
    let r = rowEls.get(b.key);
    if (!r) {
      r = div('af-trow'); r.setAttribute('role', 'row'); r.tabIndex = -1;
      const name = div('af-td af-c-name'); const ic = span('chat-artifact-ic'); ic.setAttribute('aria-hidden', 'true'); name.append(ic, span('chat-artifact-name'));
      const more = document.createElement('button'); more.type = 'button'; more.className = 'chat-artifact-more'; more.innerHTML = UI_ICONS.more || ''; more.title = t('More'); more.setAttribute('aria-label', t('More'));
      more.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const q = e.currentTarget.getBoundingClientRect(); showContextMenu(q.left, q.bottom, artifactRowMenu(r._afRow, { app, onOpen: (x) => openFrom(app, sessionId, x) })); });
      const cell = div('af-td af-c-more'); cell.appendChild(more);
      r.append(name, div('af-td af-c-kind'), div('af-td af-c-helper'), div('af-td af-c-edits'), div('af-td af-c-changed'), div('af-td af-c-path'), cell);
      r.addEventListener('click', () => { if (app) openFrom(app, sessionId, r._afRow); });
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); r.click(); } });
      rowEls.set(b.key, r);
    }
    r._afRow = b;
    r.dataset.key = b.key; r.dataset.kind = b.kind;
    if (b.kind === 'service') r.dataset.state = b.state || 'running'; else if (r.dataset.state) delete r.dataset.state;
    const ic = r.querySelector('.chat-artifact-ic'); if (ic.dataset.name !== b.name) { ic.innerHTML = artifactRowIcon(b); ic.dataset.name = b.name || ''; }
    setArtifactName(r.querySelector('.chat-artifact-name'), b.name || '', st.q);
    const w = artifactRowWords(b);
    const set = (sel, v, title) => { const n = r.querySelector(sel); if (n.textContent !== v) n.textContent = v; if (title != null && n.title !== title) n.title = title; };
    set('.af-c-kind', b.kind === 'service' ? `${w.kind} · ${w.edits}` : w.kind);
    set('.af-c-helper', w.helper || '—', w.helper);
    set('.af-c-edits', b.kind === 'service' ? '—' : String(Math.max(0, (b.writes || 0) - 1) + (b.edits || 0) || '—'));
    set('.af-c-changed', w.ago, stamp(b.kind === 'service' ? (b.since || b.lastAt) : b.lastAt));
    set('.af-c-path', b.kind === 'service' ? (b.url || '') : '\u200e' + tail(b.path), b.path || '');
    return r;
  };
  const reconcile = (box, want) => {
    let cur = box.firstChild;
    for (const n of want) { if (n === cur) { cur = cur.nextSibling; continue; } box.insertBefore(n, cur); }
    while (cur) { const nx = cur.nextSibling; cur.remove(); cur = nx; }
  };
  function draw() {
    const all = rowsOfView(st.v);
    const R = railOf(all);
    if (!['all', 'recent', ...R.kinds.map((k) => k.key), ...R.helpers.map((h) => h.key)].includes(st.rail)) st.rail = 'all'; // a choice whose rows are gone falls back to all
    const wantRail = [railItem('all', t('All'), R.total)];
    for (const k of R.kinds) wantRail.push(railItem(k.key, artifactHeadWords({ group: 'kind', label: k.label }), k.count));
    if (R.helpers.length) { wantRail.push(railHead('helpers-head', t('Helpers'))); for (const h of R.helpers) wantRail.push(railItem(h.key, h.label, h.count, 'af-rail-helper')); }
    wantRail.push(railItem('recent', t('Recent'), null, 'af-rail-recent'));
    reconcile(rail, wantRail);
    const { rows, filtered } = windowRows(st.v, st);
    const want = rows.map(rowEl);
    if (filtered && !rows.length) want.push(empty);
    reconcile(tbody, want);
    const items = Array.isArray(st.v && st.v.items) ? st.v.items.length : 0, code = Array.isArray(st.v && st.v.code) ? st.v.code.length : 0;
    const c = countLine({ items, code, filtered }, t); if (count.textContent !== c) count.textContent = c;
    for (const h of thead.querySelectorAll('.af-th[data-col]')) {
      const on = h.dataset.col === st.col, dir = on ? (st.dir || (st.col === 'edits' || st.col === 'changed' ? 'desc' : 'asc')) : '';
      if (h.dataset.dir !== dir) { h.dataset.dir = dir; h.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'); h.querySelector('.af-th-dir').innerHTML = dir ? (dir === 'asc' ? UI_ICONS.chevronUp : UI_ICONS.chevronDown) || '' : ''; }
    }
  }
  input.addEventListener('input', () => { st.q = input.value; draw(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.isComposing && input.value) { e.stopPropagation(); input.value = ''; st.q = ''; draw(); } });
  root.addEventListener('keydown', (e) => { if (e.key === '/' && e.target !== input) { e.preventDefault(); input.focus(); } });
  const update = (v) => { st.v = v && v.ok !== false ? v : st.v; const live = new Set(rowsOfView(st.v).map((b) => b.key)); for (const [k, el] of rowEls) if (!live.has(k)) { rowEls.delete(k); el.remove(); } draw(); };
  const off = sessionId ? onArtifacts(sessionId, update) : null;
  if (signal && off) signal.addEventListener('abort', off, { once: true });
  draw();
  if (fetchView) Promise.resolve().then(fetchView).then(update).catch(() => { });
  return { draw, update, state: st, input, rail, tbody };
}

export function openArtifacts(app, { sessionId = '', name = '', syncId, intoChain } = {}) {
  const sid = String(sessionId || '');
  if (!sid) return null;
  for (const w of app.wm.windows.values()) {
    if (w.type !== 'artifacts' || w._afSession !== sid) continue;
    app.wm.revealWindow(w.id, { replay: !!syncId });
    return w;
  }
  app._hideWelcome?.();
  const nm = String(name || '').slice(0, 120);
  const openSpec = { action: 'openArtifacts', sessionId: sid, name: nm };
  const winInfo = app.wm.createWindow({ title: t('Artifacts — {name}', { name: nm || sid.slice(0, 8) }), type: 'artifacts', syncId, openSpec, intoChain, width: 980, height: 620 });
  winInfo._afSession = sid;
  const root = div('af-window');
  winInfo.content.appendChild(root);
  mountArtifactsWindow(root, { app, sessionId: sid, signal: winInfo._listenerCtl?.signal || null, fetchView: () => fetch(`/api/artifacts?sessionId=${encodeURIComponent(sid)}`).then((r) => r.json()) });
  winInfo.onClose = () => { app._checkWelcome?.(); };
  return winInfo;
}

registerWindowType({
  type: 'artifacts', label: 'Artifacts',
  icon: svgIcon16('<path d="M3.5 1.5h6L12.5 4.5v10h-9z"/><path d="M5.5 7.5h5M5.5 10h5M5.5 12.5h3"/>'),
  action: 'openArtifacts', replay: (app, spec, { syncId } = {}) => app.openArtifacts({ sessionId: spec.sessionId, name: spec.name || '', syncId }),
});
