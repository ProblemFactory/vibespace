// THE DESIGN WINDOW'S HOME + THE SYSTEMS SELECT (lane design-systems-home — design 003 §2 S5 + S6).
//
//   · THE HOME = the Design window opened with NO folder (⚙ Tools ▸ Designs…, the chat chip's "All designs…"; its
//     openSpec is the Design window's own `{action:'openDesign', dir:''}`, so layout restore and the phone replay it):
//     every registered design and design system as KEYED rows — its name (the user's once renamed), the
//     conversation's NAME, the folder, last opened, its published link — a find box over those words, and per row
//     Open · Rename · Show in Files · Copy published link · Remove from the list. Rename and Remove touch the
//     registry row only (POST /api/design/rename|unlist): the folder and its files stay as they are.
//   · Live: `designs-updated` re-reads GET /api/designs (every row). Every string a row carries — a title, a folder, a
//     conversation name — is the agent's or the folder's words: drawn with textContent, never markup.
//   · systemSelect(): the chat chip's "Design system" select — GET /api/design/systems, the instance default
//     (`design.defaultSystem`) preselected, "No design system" first.
import { fetchJson, showToast, showContextMenu, showConfirmDialog, copyText, absUrl } from './utils.js';
import { t } from './i18n.js';
import { registerMenuItem } from './contributions.js';
import { UI_ICONS } from './icons.js';
import { nameHelpers } from './browser-who-dialog.js';

const hostKey = (h) => (!h || h === 'local' ? '' : String(h));
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const words = (v, max = 300) => String(v == null ? '' : v).slice(0, max);
const rowKey = (d) => JSON.stringify([hostKey(d.host), d.dir]);
const postJson = (url, body) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** The registry rows as read off the wire (bounded; a row without a folder is dropped). */
export function readDesignRows(list) {
  return (Array.isArray(list) ? list : []).filter((d) => d && typeof d.dir === 'string' && d.dir).slice(0, 1000).map((d) => ({
    id: words(d.id, 40), host: hostKey(d.host), dir: words(d.dir, 1024), title: words(d.title, 120), kind: d.kind === 'system' ? 'system' : 'design',
    sessionId: words(d.sessionId, 80), conversationId: words(d.conversationId, 200), openedAt: Number(d.openedAt) || Number(d.createdAt) || 0,
    page: d.page && typeof d.page.path === 'string' && d.page.path.startsWith('/') ? { path: words(d.page.path, 300), public: !!d.page.public } : null,
    via: d.via && typeof d.via === 'object' && d.via.cid ? { cid: words(d.via.cid, 64), name: words(d.via.name, 120) } : null, // lane artifacts-handover: handed over by a helper conversation
  }));
}
/** The find box: every word of the query must appear in the row's name, folder, machine or conversation name. */
export function homeMatches(row, query, convName = '') {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return true;
  const hay = [row.title, row.dir, row.host, convName, row.kind === 'system' ? t('Design system') : ''].join(' ').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
/** Last opened, in words a person reads ("3 min ago", a date past a week). */
export function openedWords(ms, now = Date.now()) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return t('just now');
  if (s < 3600) return t('{n} min ago', { n: Math.floor(s / 60) });
  if (s < 86400) return t('{n} h ago', { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return t('{n} d ago', { n: Math.floor(s / 86400) });
  return new Date(ms).toLocaleDateString();
}
const folderTail = (dir) => { const p = String(dir).split('/').filter(Boolean); return p.length > 3 ? '…/' + p.slice(-3).join('/') : String(dir); };

/** The Design window with no folder: the home. One per client (an open one comes to the front). */
export function openDesignHome(app, { syncId } = {}) {
  const existing = [...app.wm.windows.values()].find((w) => w._designHome);
  if (existing) { app.wm.revealWindow(existing.id, { replay: !!syncId }); return existing; }
  const openSpec = { action: 'openDesign', host: '', dir: '', sessionId: '' };
  const winInfo = app.wm.createWindow({ title: t('Designs'), type: 'design', syncId, openSpec, width: 820, height: 600 });
  winInfo._designHome = true;
  const signal = winInfo._listenerCtl.signal;
  const phone = !!app.isMobile;
  const names = nameHelpers(app);
  const convName = (d) => names.nameOfConversation(d.conversationId) || (d.sessionId ? names.nameOfLive({ id: d.sessionId }) : '') || '';

  const root = mk('div', 'design-window design-home' + (phone ? ' design-phone' : ''));
  const bar = mk('div', 'design-bar design-home-bar');
  const find = mk('input', 'design-home-find');
  find.type = 'search';
  find.placeholder = t('Find a design, a folder or a conversation…');
  find.setAttribute('aria-label', t('Find a design'));
  const count = mk('span', 'design-stamp design-home-count');
  bar.append(find, count);
  const list = mk('div', 'design-home-list');
  list.setAttribute('role', 'list');
  const status = mk('div', 'design-home-empty empty-hint', t('Loading designs…'));
  root.append(bar, list);
  list.appendChild(status);
  winInfo.content.appendChild(root);

  let rows = [];
  const els = new Map();   // rowKey → the row element (keyed: a re-read updates in place, focus and scroll stay)
  const heads = { system: mk('div', 'design-home-head', t('Design systems')), design: mk('div', 'design-home-head', t('Designs')) };

  function rowEl(d) {
    let el = els.get(rowKey(d));
    if (!el) {
      el = mk('div', 'design-home-row');
      el.setAttribute('role', 'listitem');
      el.tabIndex = 0;
      el.dataset.key = rowKey(d);
      const main = mk('div', 'design-home-main');
      const top = mk('div', 'design-home-top');
      const name = mk('span', 'design-home-name');
      const badge = mk('span', 'design-home-badge', t('Design system'));
      top.append(name, badge);
      const meta = mk('div', 'design-home-meta');
      main.append(top, meta);
      const open = mk('button', 'design-home-open', t('Open'));
      open.type = 'button';
      const more = mk('button', 'design-home-more');
      more.type = 'button';
      more.innerHTML = UI_ICONS.more || '⋯';
      more.title = t('More');
      more.setAttribute('aria-label', t('More'));
      el.append(main, open, more);
      el._f = { name, badge, meta };
      open.addEventListener('click', (e) => { e.stopPropagation(); openRow(el._d); }, { signal });
      more.addEventListener('click', (e) => { e.stopPropagation(); const r = more.getBoundingClientRect(); menu(el._d, r.left, r.bottom); }, { signal });
      el.addEventListener('dblclick', () => openRow(el._d), { signal });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) openRow(el._d); }, { signal });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(el._d, e.clientX, e.clientY); }, { signal });
      els.set(rowKey(d), el);
    }
    el._d = d;
    const f = el._f;
    if (!f.editing) f.name.textContent = d.title || folderTail(d.dir);
    f.name.title = d.title || d.dir;
    f.badge.style.display = d.kind === 'system' ? '' : 'none';
    f.meta.textContent = '';
    const bits = [convName(d), d.via ? t('via {name}', { name: d.via.name || d.via.cid }) : '', (d.host ? d.host + ':' : '') + folderTail(d.dir), openedWords(d.openedAt)].filter(Boolean); // lane artifacts-handover: "via <helper>"
    const full = (d.host ? d.host + ':' : '') + d.dir;
    for (const [i, b] of bits.entries()) {
      if (i) f.meta.appendChild(mk('span', 'design-home-dot', '·'));
      const sp = mk('span', b === bits[bits.length - 1] && d.openedAt ? 'design-home-when' : '', b);
      if (b.endsWith(folderTail(d.dir))) { sp.className = 'design-home-dir'; sp.title = full; }
      f.meta.appendChild(sp);
    }
    if (d.page) {
      f.meta.appendChild(mk('span', 'design-home-dot', '·'));
      const a = mk('a', 'design-home-link', d.page.public ? t('Published (public)') : t('Published'));
      a.href = absUrl(d.page.path);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', (e) => e.stopPropagation(), { signal });
      f.meta.appendChild(a);
    }
    return el;
  }

  function render() {
    const q = find.value;
    const shown = rows.filter((d) => homeMatches(d, q, convName(d)));
    const want = [];
    for (const kind of ['system', 'design']) {
      const part = shown.filter((d) => d.kind === kind).sort((a, b) => b.openedAt - a.openedAt);
      if (!part.length) continue;
      want.push(heads[kind], ...part.map(rowEl));
    }
    const live = new Set(rows.map(rowKey));
    for (const k of [...els.keys()]) if (!live.has(k)) els.delete(k);
    if (!want.length) { status.textContent = rows.length ? t('No design matches') : t('No designs yet — ask for one with the design chip in a chat'); want.push(status); }
    // in place: only nodes that moved are touched (a row being renamed keeps its input and its focus)
    let at = list.firstChild;
    for (const n of want) { if (n === at) { at = at.nextSibling; continue; } list.insertBefore(n, at); }
    while (at) { const next = at.nextSibling; at.remove(); at = next; }
    count.textContent = q ? t('{n} of {total}', { n: shown.length, total: rows.length }) : t('{n} design(s)', { n: rows.length });
  }

  async function load() {
    const r = await fetchJson('/api/designs');
    if (signal.aborted) return;
    if (!r || !Array.isArray(r.designs)) { status.textContent = t('Could not read the designs — the server did not answer'); if (!rows.length) render(); return; }
    rows = readDesignRows(r.designs);
    render();
  }

  function openRow(d) { if (d) app.openDesign({ host: d.host, dir: d.dir, sessionId: d.sessionId || '' }); }
  function rename(d) {
    const el = els.get(rowKey(d));
    if (!el) return;
    const f = el._f;
    if (f.editing) return;
    f.editing = true;
    const input = mk('input', 'design-home-rename');
    input.value = d.title || '';
    input.maxLength = 120;
    input.setAttribute('aria-label', t('Rename'));
    f.name.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      input.replaceWith(f.name);
      f.editing = false;
      if (!save || !v || v === d.title) { rowEl(d); return; }
      f.name.textContent = v;
      const r = await postJson('/api/design/rename', { host: d.host, dir: d.dir, title: v });
      if (!r || !r.ok) { showToast(t('Not renamed: {why}', { why: words((r && r.error) || t('the server did not answer'), 200) }), { type: 'error' }); f.name.textContent = d.title || folderTail(d.dir); }
      else load();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } }, { signal });
    input.addEventListener('blur', () => finish(true), { signal });
  }
  async function unlist(d) {
    const ok = await showConfirmDialog({ title: t('Remove from the list?'), message: t('"{name}" leaves this list and the chat\'s design chip. The folder and its files stay as they are: {dir}', { name: d.title || folderTail(d.dir), dir: (d.host ? d.host + ':' : '') + d.dir }), confirmText: t('Remove from the list') });
    if (!ok) return;
    const r = await postJson('/api/design/unlist', { host: d.host, dir: d.dir });
    if (!r || !r.ok) { showToast(t('Not removed: {why}', { why: words((r && r.error) || t('the server did not answer'), 200) }), { type: 'error' }); return; }
    showToast(t('Removed from the list — the folder stays'));
    load();
  }
  function menu(d, x, y) {
    if (!d) return;
    const items = [
      { label: t('Open'), action: () => openRow(d) },
      { label: t('Rename'), action: () => rename(d) },
      { label: t('Show in Files'), action: () => app.openFileExplorer(d.dir, { host: d.host || undefined }) },
      ...(d.page ? [{ label: t('Copy published link'), action: () => { copyText(absUrl(d.page.path)); showToast(t('Link copied')); } }] : []),
      { separator: true },
      { label: t('Remove from the list'), action: () => unlist(d) },
    ];
    showContextMenu(x, y, items);
  }

  find.addEventListener('input', render, { signal });
  find.addEventListener('keydown', (e) => { if (e.key === 'Escape' && find.value) { e.stopPropagation(); find.value = ''; render(); } }, { signal });
  const off = app.ws?.onGlobal?.((m) => { if (m && m.type === 'designs-updated') load(); });
  if (typeof off === 'function') signal.addEventListener('abort', off, { once: true });
  load();
  if (!phone) setTimeout(() => find.focus(), 0);
  return winInfo;
}

/** The chat chip's "Design system" select: "No design system" + every system, the instance default preselected.
 *  → {el, value(), hasDefault()} — value() = the chosen system's name, '' = "No design system", null = nothing to
 *  choose (hidden until the systems arrive; stays hidden while this VibeSpace has none). */
export function systemSelect() {
  const label = mk('label', 'chat-design-public chat-design-system');
  label.style.display = 'none';
  const sel = mk('select', 'chat-design-system-select');
  sel.setAttribute('aria-label', t('Design system'));
  label.append(document.createTextNode(t('Design system') + ' '), sel);
  let def = '';
  fetchJson('/api/design/systems').then((r) => {
    const list = r && Array.isArray(r.systems) ? r.systems.filter((x) => x && typeof x.name === 'string' && x.name).slice(0, 100) : [];
    if (!list.length) return;
    const none = mk('option', '', t('No design system'));
    none.value = '';
    sel.appendChild(none);
    const seen = new Set();
    for (const x of list) {
      const n = words(x.name, 120);
      if (seen.has(n.toLowerCase())) continue;
      seen.add(n.toLowerCase());
      const o = mk('option', '', n);
      o.value = n;
      sel.appendChild(o);
    }
    def = String((r && r.defaultSystem) || '').toLowerCase();
    if (def) for (const o of sel.options) if (o.value && o.value.toLowerCase() === def) { sel.value = o.value; break; }
    label.style.display = '';
  });
  return { el: label, value: () => (label.style.display === 'none' ? null : sel.value), hasDefault: () => !!def };
}

// ⚙ Tools ▸ Designs… (after Agent browser 35, before Plugins 40): the home, on every client
registerMenuItem({ menu: 'gear', parent: 'tools', order: 38, icon: UI_ICONS.design, label: () => t('Designs…'), run: (c) => c.app.openDesign({}) });
