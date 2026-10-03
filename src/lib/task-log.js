import { escHtml, showToast, showContextMenu } from './utils.js';
import { t, tc, deviceLocale } from './i18n.js';
import { registerOpenAction } from './window-types.js';
// the ONE backlog order every reader shares (PURE CJS, esbuild interop like
// backend-caps): open by priority high → normal → low, newest first within one
import { PRIORITIES, normalizePriority, priorityMarker, sortBacklog } from '../backlog-select.js';
// "Clear content…" (2026-09-28): the ONE confirm dialog + request path, and the cleared sentence's words
import { clearRecords, isCleared, clearedText } from './record-clear-ui.js';
import { matchSnippet } from '../record-clear.js'; // PURE: why a Find matched a row whose note does not say it (the dialog's line)

/**
 * Task Group log viewer — a full-window browser for the two lists that
 * outgrow the task-detail editor: the Backlog (2.122.0 — the group's parking
 * lot for NON-immediate items: deferred decisions, "later" work; NOT the
 * removed 2.121.0 checklist of agent work items) and the Activity log (up to
 * 500 entries). Entry points: the ⧉ buttons on those sections in task-detail
 * + the board header context menu.
 *
 * Both tabs carry SESSION ATTRIBUTION: activity entries show which session
 * filed them; backlog items show who parked them and who resolved them.
 * Clicking a session chip filters the view to that session.
 */

export function openTaskLog(app, taskId, { tab, syncId } = {}) {
  const sidebar = app.sidebar;
  const existing = [...app.wm.windows.values()].find(w => w._taskLogId === taskId);
  if (existing) {
    app.wm.revealWindow(existing.id, { replay: !!syncId });
    if (tab && existing._taskLogSetTab) existing._taskLogSetTab(tab);
    return existing;
  }

  let task = sidebar._taskById(taskId);
  if (!task && sidebar._tasksLoaded) { showToast(t('Task Group not found'), { type: 'error' }); return null; }

  const openSpec = { action: 'openTaskLog', taskId, tab: tab === 'backlog' ? 'backlog' : 'activity' };
  const winInfo = app.wm.createWindow({
    title: (task?.title || t('Task Group')) + ' — ' + t('Log'),
    type: 'task', syncId, openSpec, width: 640, height: 620,
  });
  winInfo._taskLogId = taskId;

  const root = document.createElement('div');
  root.className = 'task-log';
  winInfo.content.appendChild(root);

  // View state survives re-renders (tasks-updated fires on every group edit).
  const state = {
    tab: tab === 'backlog' ? 'backlog' : 'activity',
    search: '',
    session: null,        // session-key filter (null = all)
    statusFilter: 'all',  // backlog: all | open | done | dropped
    // ACTIVITY SELECTION ("Clear selected", 2026-09-28): keyed by the entry's id, never its index (the 500-entry
    // cap shifts indices); only entries SHOWN under the current Find text / session filter are acted on
    select: false,
    picked: new Set(),
    openIds: new Set(),   // entries whose detail the user expanded — kept across live repaints
    // an entry whose DETAIL alone matches the Find text opens by itself (the row shows only the note —
    // verify r2: an entry was selected with no visible reason); one the user closed stays closed
    // until the Find text changes
    userClosed: new Set(),
  };
  winInfo._taskLogSetTab = (tb) => { state.tab = tb === 'backlog' ? 'backlog' : 'activity'; openSpec.tab = state.tab; render(); };

  // ── Session attribution helpers ──
  // Keys are session-status keys (backend:backendSessionId) or 'user'.
  const sessionLabel = (key) => {
    if (!key) return null;
    if (key === 'user') return t('you');
    const all = sidebar._allSessions || [];
    for (const s of all) {
      if (sidebar._getSessionStateKey(s) === key) return sidebar.getCustomName(s) || s.name || key;
    }
    return key.replace(/^(\w+):(.{8}).*/, '$1:$2…'); // session gone from discovery — short key
  };
  const sessionChip = (key, { clickable = true } = {}) => {
    if (!key) return '';
    const label = sessionLabel(key);
    const cls = 'task-log-chip' + (key === 'user' ? ' user' : '') + (clickable ? ' clickable' : '') + (state.session === key ? ' active' : '');
    return `<span class="${cls}" data-skey="${escHtml(key)}" title="${escHtml(key === 'user' ? t('Added from the UI') : key)}">${escHtml(label)}</span>`;
  };
  const fmtTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(deviceLocale(), { hour: '2-digit', minute: '2-digit' });
  };
  // the DEVICE's language, never the browser's (verify r2: 9/28/2026 · 01:25 AM on a zh page, beside a
  // confirm dialog that said 2026年9月28日) — the one Intl tag every surface prints dates with
  const fmtDay = (ts) => new Date(ts).toLocaleDateString(deviceLocale());
  const matches = (text) => !state.search || String(text || '').toLowerCase().includes(state.search.toLowerCase());

  const render = () => {
    task = sidebar._taskById(taskId);
    if (!task) {
      if (!sidebar._tasksLoaded) { root.innerHTML = `<div class="empty-hint">${escHtml(t('Loading task…'))}</div>`; return; }
      app.wm.closeWindow(winInfo.id);
      return;
    }
    app.wm.setTitle(winInfo.id, task.title + ' — ' + t('Log'));

    // Preserve focus/scroll across live re-renders (same guard as task-detail:
    // never clobber a field mid-typing — but here search text lives in state,
    // so we re-render and restore instead of skipping).
    const hadFocus = root.contains(document.activeElement) && document.activeElement.classList.contains('task-log-search');
    const scrollEl = root.querySelector('.task-log-body');
    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    root.innerHTML = '';

    // ── Header: tabs + search + session filter ──
    const head = document.createElement('div');
    head.className = 'task-log-head';
    const tabs = document.createElement('div');
    tabs.className = 'sidebar-subtabs task-log-tabs';
    const backlog = task.backlog || [];
    const prog = task.progress || [];
    for (const [key, label, count] of [
      ['backlog', t('Backlog'), `${backlog.filter(b => b.status === 'open').length}/${backlog.length}`],
      ['activity', t('Activity log'), String(prog.length)],
    ]) {
      const b = document.createElement('button');
      b.className = 'sidebar-subtab' + (state.tab === key ? ' active' : '');
      b.innerHTML = `${escHtml(label)} <span class="task-log-count">${escHtml(count)}</span>`;
      b.onclick = () => { state.tab = key; openSpec.tab = key; render(); };
      tabs.appendChild(b);
    }
    head.appendChild(tabs);

    const search = document.createElement('input');
    search.className = 'task-log-search';
    search.placeholder = state.tab === 'activity' ? t('Find…') : t('Search...'); // Activity: THE Find box — what it matches, "Select all shown" picks
    search.value = state.search;
    search.oninput = () => { state.search = search.value; state.userClosed.clear(); renderBody(); };
    head.appendChild(search);

    // Session filter dropdown — distinct attributed sessions in the CURRENT tab.
    const keys = new Map(); // key → count
    if (state.tab === 'activity') for (const p of prog) { if (p.session) keys.set(p.session, (keys.get(p.session) || 0) + 1); }
    else for (const it of backlog) { for (const k of [it.addedBy, it.resolvedBy]) if (k) keys.set(k, (keys.get(k) || 0) + 1); }
    if (keys.size) {
      const sel = document.createElement('select');
      sel.className = 'task-log-sessfilter';
      sel.innerHTML = `<option value="">${escHtml(t('All sessions'))}</option>`
        + [...keys.entries()].sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `<option value="${escHtml(k)}"${state.session === k ? ' selected' : ''}>${escHtml(sessionLabel(k))} (${n})</option>`).join('');
      sel.onchange = () => { state.session = sel.value || null; renderBody(); };
      head.appendChild(sel);
    } else if (state.session) state.session = null;

    if (state.tab === 'backlog') {
      const df = document.createElement('select');
      df.className = 'task-log-sessfilter';
      df.innerHTML = [['all', t('All')], ['open', t('Open')], ['done', t('Done')], ['dropped', t('Dropped')]]
        .map(([v, l]) => `<option value="${v}"${state.statusFilter === v ? ' selected' : ''}>${escHtml(l)}</option>`).join('');
      df.onchange = () => { state.statusFilter = df.value; renderBody(); };
      head.appendChild(df);
    }

    if (state.tab === 'activity') {
      // Select… ⇄ Done: checkboxes on every row + the bar below ("Select all shown", "Clear selected (N)")
      const selBtn = document.createElement('button');
      selBtn.className = 'task-detail-btn task-log-selbtn' + (state.select ? ' active' : '');
      selBtn.textContent = state.select ? tc('select', 'Done') : t('Select…'); // tc: "Done" here ends a selection (the plain key is the status word)
      selBtn.title = t('Pick several entries — for example every one Find matches — and clear their content at once');
      selBtn.onclick = () => { state.select = !state.select; if (!state.select) state.picked.clear(); render(); };
      head.appendChild(selBtn);
    }

    const copyBtn = document.createElement('button');
    copyBtn.className = 'task-detail-btn';
    copyBtn.textContent = t('Copy as Markdown');
    copyBtn.title = t('Copy the current (filtered) view as a markdown list');
    copyBtn.onclick = () => { copyMarkdown(); };
    head.appendChild(copyBtn);
    root.appendChild(head);

    // the selection bar (Activity, Select mode): patched in place by paintSelBar on every repaint
    const selBar = document.createElement('div');
    selBar.className = 'task-log-selbar';
    selBar.style.display = state.tab === 'activity' && state.select ? '' : 'none';
    root.appendChild(selBar);

    const body = document.createElement('div');
    body.className = 'task-log-body';
    root.appendChild(body);

    const renderBody = () => {
      if (state.tab === 'activity') { paintActivity(body, selBar); return; } // KEYED: rows patched in place, never rebuilt
      body.innerHTML = '';
      renderBacklog(body);
    };
    renderBody();

    root.dataset.sessKeys = [...new Set((task.progress || []).map((p) => p.session).filter(Boolean))].sort().join('\u0000');
    if (hadFocus) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
    const newScrollEl = root.querySelector('.task-log-body');
    if (newScrollEl) newScrollEl.scrollTop = scrollTop;
  };

  // ── Activity tab: newest first, grouped by day — KEYED ROWS (2026-09-28) ──
  // A row is keyed by the entry's stable P- id (`data-pid`), a day header by its
  // day; a repaint (the Find box, a filter, every tasks-updated broadcast)
  // PATCHES the rows it keeps, creates the new ones, removes the gone ones and
  // moves a node only when it is out of place — so an expanded detail, a ticked
  // checkbox and the Find box in use survive another client's clear. A cleared
  // entry keeps its place and time and reads the cleared sentence, dimmed.
  const keyOf = (p) => p.id || ('at-' + p.at);
  // ── OLDER ENTRIES (2.369.204, the owner 2026-10-03): the live list holds the newest 500; older ones are read
  // page by page from the archive (GET /api/tasks/:id/progress?before=) as the reader nears the END of the list
  // (newest first: older = further down) — a sentinel row one screen ahead becomes a skeleton row while a page is
  // read, and its rows join the same keyed paint (Find, Select…, Clear selected act on them too). No button. ──
  const older = { list: [], done: false, busy: false, gen: 0, pending: 0, clearedAt: (task && task.archiveClearedAt) || 0 };
  const allEntries = () => older.list.concat(task.progress || []);
  const moreEl = document.createElement('div');
  moreEl.className = 'task-log-older';
  moreEl.setAttribute('aria-hidden', 'true');
  const checkMore = () => {
    const body = root.querySelector('.task-log-body');
    if (!body || state.tab !== 'activity' || !moreEl.isConnected || older.busy || older.done) return;
    if (moreEl.getBoundingClientRect().top - body.getBoundingClientRect().bottom < body.clientHeight) loadOlder();
  };
  /** the next page below the list — or, with `want`, the archive rows already held re-read (a clear reached them) */
  const loadOlder = async (want = 0) => {
    if (older.busy) { if (want) older.pending = Math.max(older.pending, want); return; }
    if (older.done && !want) return;
    older.busy = true;
    moreEl.classList.add('task-log-skel');
    const g0 = older.gen;
    const got = [];
    let more = true, before = want ? ((task.progress || [])[0] || {}).at || '' : (allEntries()[0] || {}).at || '';
    try {
      do {
        const r = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/progress?before=${encodeURIComponent(before)}&limit=100`).then((x) => (x.ok ? x.json() : null));
        if (g0 !== older.gen) return;
        if (!r || !Array.isArray(r.entries)) return;
        got.push(...r.entries);
        more = !!r.more;
        if (r.entries.length) before = r.entries[r.entries.length - 1].at;
      } while (want && more && got.length < want);
      const have = new Set((want ? (task.progress || []) : allEntries()).map(keyOf));
      const fresh = got.filter((p) => p && !have.has(keyOf(p)) && have.add(keyOf(p))).reverse();
      older.list = want ? fresh : fresh.concat(older.list);
      older.done = !more;
    } catch { /* offline: the next scroll asks again */ } finally {
      older.busy = false;
      moreEl.classList.remove('task-log-skel');
      if (older.pending) { const n = older.pending; older.pending = 0; setTimeout(() => loadOlder(n), 0); }
    }
    repaintActivity();
    requestAnimationFrame(checkMore);
  };
  root.addEventListener('scroll', checkMore, true);
  const shownEntries = () => allEntries()
    .filter((p) => (!state.session || p.session === state.session) && (isCleared(p) ? matches(clearedText()) : (matches(p.note) || matches(p.detail))))
    .slice().reverse();
  /** the Find text matches this entry's DETAIL but not its note: the row alone would not say why it is shown */
  const detailOnlyMatch = (p) => !!state.search && !isCleared(p) && !!p.detail && !matches(p.note) && matches(p.detail);
  /** open / close a row's detail FOR the user's view (the toggle listener knows it was not their click) */
  const setOpen = (row, v) => { if (row.open === v) return; row._paintOpen = v; row.open = v; };
  const actSig = (p) => [keyOf(p), p.at, p.note, p.detail || '', p.session || '', p.clearedAt || 0, state.select ? (state.picked.has(keyOf(p)) ? 2 : 1) : 0, state.session === p.session ? 1 : 0, p.session ? sessionLabel(p.session) : ''].join('\u0000');
  const buildActRow = (p) => {
    const k = keyOf(p);
    const exp = !!p.detail && !isCleared(p);
    const row = document.createElement(exp ? 'details' : 'div');
    row.className = 'task-log-row task-log-act' + (exp ? ' task-log-exp' : '') + (isCleared(p) ? ' task-log-cleared' : '');
    row.dataset.pid = k;
    const line = exp ? document.createElement('summary') : row;
    if (state.select && isCleared(p)) {
      // a CLEARED entry is not selectable (nothing left to clear — verify r2: its box ticked but never
      // counted); an empty slot the checkbox's width keeps the rows' columns aligned
      const sp = document.createElement('span');
      sp.className = 'task-log-pick-sp';
      sp.setAttribute('aria-hidden', 'true');
      line.appendChild(sp);
    } else if (state.select) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'task-log-pick';
      cb.checked = state.picked.has(k);
      cb.setAttribute('aria-label', t('Select this entry'));
      line.appendChild(cb);
    }
    const time = document.createElement('span');
    time.className = 'task-log-time';
    time.textContent = fmtTime(p.at);
    line.appendChild(time);
    if (p.session) line.insertAdjacentHTML('beforeend', sessionChip(p.session)); // sessionChip escapes every string it interpolates
    const note = document.createElement('span');
    note.className = 'task-log-note' + (isCleared(p) ? ' rc-cleared' : '');
    note.textContent = isCleared(p) ? clearedText() : p.note; // TEXT — an agent's words
    line.appendChild(note);
    if (exp) { const dg = document.createElement('span'); dg.className = 'task-log-dagger'; dg.textContent = '†'; line.appendChild(dg); }
    if (menuItemsFor(p).length) { // a row with nothing on its menu offers no ⋯ (a cleared row while selecting)
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'task-detail-x task-log-more';
      more.textContent = '⋯';
      more.title = t('More actions');
      more.setAttribute('aria-label', t('More actions'));
      line.appendChild(more);
    }
    if (exp) {
      row.appendChild(line);
      const d = document.createElement('div');
      d.className = 'task-log-detail';
      d.textContent = p.detail;
      row.appendChild(d);
      // the USER's open / close is remembered; an open or close the paint made (setOpen) is not theirs
      row.addEventListener('toggle', () => {
        if (row._paintOpen !== undefined) { const v = row._paintOpen; row._paintOpen = undefined; if (v === row.open) return; }
        if (row.open) { state.openIds.add(k); state.userClosed.delete(k); } else { state.openIds.delete(k); state.userClosed.add(k); }
      });
    }
    row.dataset.sig = actSig(p);
    return row;
  };
  const patchActRow = (row, p) => {
    if (row.dataset.sig === actSig(p)) return row;
    const fresh = buildActRow(p);
    row.replaceWith(fresh);
    return fresh;
  };
  const paintSelBar = (selBar, entries) => {
    if (!selBar) return;
    const on = state.tab === 'activity' && state.select;
    selBar.style.display = on ? '' : 'none';
    if (!on) return;
    // the picks that still exist; the ones SHOWN are the ones a clear acts on
    const live = new Set(allEntries().map(keyOf));
    for (const k of [...state.picked]) if (!live.has(k)) state.picked.delete(k);
    const clearable = entries.filter((p) => !isCleared(p));
    const shownPicked = entries.filter((p) => state.picked.has(keyOf(p)) && !isCleared(p));
    const allOn = clearable.length > 0 && clearable.every((p) => state.picked.has(keyOf(p)));
    const sig = [clearable.length, shownPicked.length, allOn ? 1 : 0].join('/');
    if (selBar.dataset.sig === sig) return;
    selBar.dataset.sig = sig;
    selBar.textContent = '';
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'task-detail-btn task-log-pickall';
    all.textContent = allOn ? t('Select none') : t('Select all shown ({n})', { n: clearable.length });
    all.disabled = !clearable.length;
    all.onclick = () => {
      const now = shownEntries().filter((p) => !isCleared(p));
      const every = now.length > 0 && now.every((p) => state.picked.has(keyOf(p)));
      for (const p of now) { if (every) state.picked.delete(keyOf(p)); else state.picked.add(keyOf(p)); }
      repaintActivity();
    };
    const n = document.createElement('span');
    n.className = 'task-log-picked';
    n.textContent = t('{n} selected', { n: shownPicked.length });
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'task-detail-btn task-log-clearsel';
    go.textContent = t('Clear selected ({n})', { n: shownPicked.length });
    go.disabled = !shownPicked.length;
    go.onclick = () => {
      const rows = shownEntries().filter((p) => state.picked.has(keyOf(p)) && !isCleared(p) && p.id)
        .map((p) => ({ kind: 'activity', groupId: taskId, id: p.id, at: p.at, words: p.note, ...(detailOnlyMatch(p) ? { match: matchSnippet(p.detail, state.search, 90) } : {}) }));
      // a batch that went through ENDS the selection (verify r2: the window stayed in Select mode with
      // everything unticked) — the same as pressing Done; a partial refusal was already said by a toast
      clearRecords(rows).then((r) => { if (r && r.ok) { state.picked.clear(); state.select = false; render(); } });
    };
    selBar.append(all, n, go);
  };
  const paintActivity = (body, selBar) => {
    const entries = shownEntries();
    paintSelBar(selBar, entries);
    const existing = new Map();
    for (const c of [...body.children]) {
      if (c.dataset && c.dataset.pid) existing.set('p:' + c.dataset.pid, c);
      else if (c.dataset && c.dataset.day) existing.set('d:' + c.dataset.day, c);
      else if (c !== moreEl) c.remove(); // the empty hint (or a stray node from another tab)
    }
    if (!entries.length) {
      for (const n of existing.values()) n.remove();
      const e = document.createElement('div');
      e.className = 'empty-hint';
      e.textContent = t('No matching entries');
      body.appendChild(e);
      placeMore(body);
      return;
    }
    const perDay = new Map();
    for (const p of entries) { const d = fmtDay(p.at); perDay.set(d, (perDay.get(d) || 0) + 1); }
    const want = [];
    let lastDay = null;
    for (const p of entries) {
      const day = fmtDay(p.at);
      if (day !== lastDay) {
        lastDay = day;
        let h = existing.get('d:' + day);
        if (h) existing.delete('d:' + day);
        else { h = document.createElement('div'); h.className = 'task-log-day'; h.dataset.day = day; h.append(document.createElement('span'), Object.assign(document.createElement('span'), { className: 'task-log-day-n' })); }
        if (h.firstChild.textContent !== day) h.firstChild.textContent = day;
        const cnt = String(perDay.get(day));
        if (h.lastChild.textContent !== cnt) h.lastChild.textContent = cnt;
        want.push(h);
      }
      const k = 'p:' + keyOf(p);
      let row = existing.get(k);
      if (row) { existing.delete(k); row = patchActRow(row, p); } else row = buildActRow(p);
      if (row.tagName === 'DETAILS') setOpen(row, state.openIds.has(keyOf(p)) || (detailOnlyMatch(p) && !state.userClosed.has(keyOf(p))));
      want.push(row);
    }
    for (const n of existing.values()) n.remove();
    let prev = null;
    for (const n of want) {
      const slot = prev ? prev.nextElementSibling : body.firstElementChild;
      if (n !== slot) body.insertBefore(n, slot);
      prev = n;
    }
    placeMore(body);
  };
  /** the sentinel stays the list's last row until the archive is read to its start */
  const placeMore = (body) => {
    if (older.done) { moreEl.remove(); return; }
    if (body.lastElementChild !== moreEl) body.appendChild(moreEl);
    requestAnimationFrame(checkMore);
  };
  const repaintActivity = () => {
    const body = root.querySelector('.task-log-body');
    if (body && state.tab === 'activity') paintActivity(body, root.querySelector('.task-log-selbar'));
  };
  /** The row's menu (⋯ and right-click / long-press): Clear content… (and Select, into the batch).
   *  A CLEARED entry has nothing to clear and cannot be picked: outside Select mode its menu only
   *  starts a selection (of the others); in Select mode it has no menu. */
  function menuItemsFor(p) {
    const k = keyOf(p);
    if (isCleared(p)) return state.select ? [] : [{ label: t('Select…'), action: () => { state.select = true; render(); } }];
    const items = [];
    if (p.id) items.push({ label: t('Clear content…'), action: () => clearRecords([{ kind: 'activity', groupId: taskId, id: p.id, at: p.at, words: p.note }]) });
    items.push({ label: state.select ? (state.picked.has(k) ? t('Unselect') : t('Select')) : t('Select…'), action: () => {
      if (!state.select) { state.select = true; state.picked.add(k); render(); return; }
      if (state.picked.has(k)) state.picked.delete(k); else state.picked.add(k);
      repaintActivity();
    } });
    return items;
  }
  const activityMenu = (p, x, y) => { const items = menuItemsFor(p); if (items.length) showContextMenu(x, y, items); };
  const entryOf = (el) => {
    const row = el && el.closest && el.closest('.task-log-act');
    const k = row && row.dataset.pid;
    return k ? allEntries().find((p) => keyOf(p) === k) || null : null;
  };
  // ONE delegated set of listeners on the window's root (rows come and go; the root stays)
  root.addEventListener('click', (e) => {
    if (state.tab !== 'activity') return;
    const more = e.target.closest('.task-log-more');
    if (more) {
      e.preventDefault(); e.stopPropagation();
      const p = entryOf(more);
      if (p) { const r = more.getBoundingClientRect(); activityMenu(p, r.left, r.bottom + 2); }
      return;
    }
    const chip = e.target.closest('.task-log-act .task-log-chip.clickable');
    if (chip) { e.preventDefault(); e.stopPropagation(); const k = chip.dataset.skey; state.session = state.session === k ? null : k; render(); return; }
    const cb = e.target.closest('.task-log-pick');
    if (cb) {
      e.stopPropagation(); // a checkbox in a <summary> must not toggle the detail
      const p = entryOf(cb);
      if (!p) return;
      if (cb.checked) state.picked.add(keyOf(p)); else state.picked.delete(keyOf(p));
      repaintActivity();
    }
  }, { signal: winInfo._listenerCtl?.signal });
  root.addEventListener('contextmenu', (e) => {
    if (state.tab !== 'activity') return;
    const p = entryOf(e.target);
    if (!p || !menuItemsFor(p).length) return;
    e.preventDefault(); e.stopPropagation();
    activityMenu(p, e.clientX, e.clientY);
  }, { signal: winInfo._listenerCtl?.signal });

  // ── Backlog tab: open first (by priority, newest first — sortBacklog), then
  //    resolved; expandable detail + inline edit; a priority chip per row ──
  const STATUS_META = () => ({
    open: { icon: '○', label: t('Open') },
    done: { icon: '✓', label: t('Done') },
    dropped: { icon: '⊘', label: t('Dropped') },
  });
  const renderBacklog = (body) => {
    const items = (task.backlog || []).map((b, i) => ({ ...b, _i: i }));
    const visible = sortBacklog(items).filter((it) =>
      (state.statusFilter === 'all' || it.status === state.statusFilter)
      && (!state.session || it.addedBy === state.session || it.resolvedBy === state.session)
      && (matches(it.text) || matches(it.detail)));
    if (!visible.length && !items.length) { body.innerHTML = `<div class="empty-hint">${escHtml(t('Nothing parked — backlog holds non-immediate items: deferred decisions, future work'))}</div>`; }

    const patchItem = (idx, fn) => {
      const next = task.backlog.map((b, j) => (j === idx ? fn({ ...b }) : b));
      sidebar._taskUpdate(taskId, { backlog: next.filter(Boolean) });
    };
    // Priority: ONE whole-backlog write through the same persistence path; the
    // store's tasks-updated broadcast repaints (never a local mutation).
    const PRIO_LABEL = () => ({ high: t('High'), normal: t('Normal'), low: t('Low') });
    const setPriority = (it, p) => {
      if (normalizePriority(it.priority) === p) return;
      patchItem(it._i, (b) => ({ ...b, priority: p }));
    };
    const prioChip = (p) => {
      const n = normalizePriority(p);
      if (n === 'normal') return null;
      const c = document.createElement('span');
      c.className = 'bl-prio bl-prio-' + n;
      c.textContent = PRIO_LABEL()[n];
      c.title = n === 'high' ? t('High priority') : t('Low priority');
      return c;
    };

    const attrHtml = (it) => {
      let html = '';
      const claims = it.claimedBy || [];
      // parker == claimant is the common case (parking auto-claims) — collapse it
      // into ONE part instead of repeating the same session as two loud chips
      const selfClaim = !!it.addedBy && claims.includes(it.addedBy);
      const claimX = (k) => `<button class="task-log-claim-x" data-unclaim="${escHtml(k)}" data-bidx="${it._i}" title="${escHtml(t('Remove this claim'))}">×</button>`;
      if (it.addedBy || it.addedAt) {
        html += `<span class="task-log-attr-part" title="${escHtml(t('Parked by') + (it.addedAt ? ' · ' + new Date(it.addedAt).toLocaleString(deviceLocale()) : ''))}">+ ${sessionChip(it.addedBy)}${it.addedAt ? ` <span class="task-log-time">${escHtml(fmtDay(it.addedAt))}</span>` : ''}${selfClaim ? `<span class="task-log-selfclaim" title="${escHtml(t('Claimed by {n} session(s)', { n: claims.length }))}">⚑</span>${claimX(it.addedBy)}` : ''}</span>`;
      }
      const foreign = claims.filter((k) => k !== it.addedBy);
      if (foreign.length) {
        html += `<span class="task-log-attr-part" title="${escHtml(t('Claimed by {n} session(s)', { n: claims.length }))}">⚑ ${foreign.map((k) => `${sessionChip(k)}${claimX(k)}`).join('')}</span>`;
      } else if (!claims.length && it.status === 'open') {
        html += `<span class="task-log-attr-part task-log-unclaimed" title="${escHtml(t('No session has claimed this item'))}">${escHtml(t('unclaimed'))}</span>`;
      }
      if (it.status !== 'open' && (it.resolvedBy || it.resolvedAt)) {
        html += `<span class="task-log-attr-part" title="${escHtml((it.status === 'done' ? t('Resolved by') : t('Dropped by')) + (it.resolvedAt ? ' · ' + new Date(it.resolvedAt).toLocaleString(deviceLocale()) : ''))}">${it.status === 'done' ? '✓' : '⊘'} ${sessionChip(it.resolvedBy)}${it.resolvedAt ? ` <span class="task-log-time">${escHtml(fmtDay(it.resolvedAt))}</span>` : ''}</span>`;
      }
      return html;
    };

    // Inline editor: text input + detail textarea in place of the row.
    const editForm = (it, replaceEl) => {
      const form = document.createElement('div');
      form.className = 'task-log-edit';
      const ti = document.createElement('input');
      ti.className = 'task-detail-input'; ti.value = it.text;
      const ta = document.createElement('textarea');
      ta.className = 'task-log-edit-detail'; ta.rows = 5;
      ta.placeholder = t('Detail — context, options discussed, why it was deferred (optional)');
      ta.value = it.detail || '';
      const prioWrap = document.createElement('label');
      prioWrap.className = 'task-log-edit-prio';
      const prioLbl = document.createElement('span');
      prioLbl.textContent = t('Priority');
      const ps = document.createElement('select');
      ps.className = 'task-log-sessfilter';
      for (const p of PRIORITIES) {
        const o = document.createElement('option');
        o.value = p; o.textContent = PRIO_LABEL()[p];
        if (normalizePriority(it.priority) === p) o.selected = true;
        ps.appendChild(o);
      }
      prioWrap.append(prioLbl, ps);
      const btns = document.createElement('div');
      btns.className = 'task-log-edit-btns';
      const save = document.createElement('button');
      save.className = 'btn-create'; save.textContent = t('Save');
      save.onclick = () => {
        const text = ti.value.trim();
        if (!text) return;
        patchItem(it._i, (b) => { b.text = text; b.priority = ps.value; if (ta.value.trim()) b.detail = ta.value.trim(); else delete b.detail; return b; });
      };
      const cancel = document.createElement('button');
      cancel.className = 'task-detail-btn'; cancel.textContent = t('Cancel');
      cancel.onclick = () => render();
      btns.append(save, cancel);
      form.append(ti, prioWrap, ta, btns);
      replaceEl.replaceWith(form);
      ti.focus();
    };

    const addItemRow = (it) => {
      const isExp = !!it.detail;
      const meta = STATUS_META()[it.status] || STATUS_META().open;
      const row = document.createElement(isExp ? 'details' : 'div');
      row.className = 'task-log-row task-log-bl' + (it.status !== 'open' ? ' resolved' : '') + (isExp ? ' task-log-exp' : '');
      const line = document.createElement(isExp ? 'summary' : 'div');
      line.className = 'task-log-blline';
      // TWO-ROW layout: top = status+id+text(+†)+actions; bottom = attribution
      // chips (parked/claimed/resolved). Cramming attribution into the same
      // flex row squeezed the text to a one-char column (real report).
      const top = document.createElement('div');
      top.className = 'task-log-bltop';
      line.appendChild(top);

      const st = document.createElement('span');
      st.className = 'task-log-bl-status';
      st.textContent = meta.icon;
      st.title = meta.label;
      top.appendChild(st);
      if (it.id) {
        // the stable id — click to copy, so the user can hand it to ANY agent
        // ("look at backlog B-xxxx"), which can then view/claim it
        const idc = document.createElement('code');
        idc.className = 'task-log-blid';
        idc.textContent = it.id;
        idc.title = t('Click to copy — paste it to any agent of this group ("look at backlog {id}")', { id: it.id });
        idc.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          import('./utils.js').then(({ copyText }) => copyText(it.id).then(() => showToast(t('Copied {id}', { id: it.id }))));
        };
        top.appendChild(idc);
      }
      const chip = prioChip(it.priority);
      if (chip) top.appendChild(chip);
      const txt = document.createElement('span');
      txt.className = 'task-log-note';
      txt.textContent = it.text;
      top.appendChild(txt);
      if (isExp) {
        const dg = document.createElement('span');
        dg.className = 'task-log-dagger'; dg.textContent = '†';
        top.appendChild(dg);
      }
      const acts = document.createElement('span');
      acts.className = 'task-log-blacts';
      top.appendChild(acts);
      const btn = (txt2, title, onClick) => {
        const b = document.createElement('button');
        b.className = 'task-detail-x task-log-blbtn'; b.textContent = txt2; b.title = title;
        b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(); };
        acts.appendChild(b);
      };
      btn('✎', t('Edit text and detail'), () => editForm(it, row));
      if (it.status === 'open') {
        btn('✓', t('Mark decided/finished'), () => patchItem(it._i, (b) => ({ ...b, status: 'done', resolvedBy: 'user', resolvedAt: Date.now() })));
        btn('⊘', t('Drop as obsolete'), () => patchItem(it._i, (b) => ({ ...b, status: 'dropped', resolvedBy: 'user', resolvedAt: Date.now() })));
      } else {
        btn('↺', t('Reopen'), () => patchItem(it._i, (b) => { const nb = { ...b, status: 'open' }; delete nb.resolvedBy; delete nb.resolvedAt; return nb; }));
      }
      btn('×', t('Delete item'), () => patchItem(it._i, () => null));
      const metaRow = document.createElement('div');
      metaRow.className = 'task-log-blmeta';
      metaRow.innerHTML = attrHtml(it);
      line.appendChild(metaRow);

      // right-click / long-press: the row's menu — a Priority submenu (three
      // choices, the current one ticked) beside the verbs the buttons carry
      line.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        const cur = normalizePriority(it.priority);
        showContextMenu(e.clientX, e.clientY, [
          { label: t('Priority'), children: PRIORITIES.map((p) => ({ label: (p === cur ? '✓ ' : '\u2003') + PRIO_LABEL()[p], action: () => setPriority(it, p) })) },
          { separator: true },
          { label: t('Edit text and detail'), action: () => editForm(it, row) },
        ]);
      });
      row.appendChild(line);
      if (isExp) {
        const d = document.createElement('div');
        d.className = 'task-log-detail';
        d.textContent = it.detail;
        row.appendChild(d);
      }
      return row;
    };

    const open = visible.filter((i) => i.status === 'open');
    const resolved = visible.filter((i) => i.status !== 'open');
    if (open.length) {
      const h = document.createElement('div'); h.className = 'task-log-day';
      h.innerHTML = `<span>${escHtml(t('Open'))}</span><span class="task-log-day-n">${open.length}</span>`;
      body.appendChild(h);
      for (const it of open) body.appendChild(addItemRow(it));
    }
    if (resolved.length) {
      const h = document.createElement('div'); h.className = 'task-log-day';
      h.innerHTML = `<span>${escHtml(t('Resolved'))}</span><span class="task-log-day-n">${resolved.length}</span>`;
      body.appendChild(h);
      for (const it of resolved) body.appendChild(addItemRow(it));
    }

    // Add-item row (records UI attribution) — the † toggle reveals an optional
    // detail textarea so a parked item can carry its full context.
    const addWrap = document.createElement('div');
    addWrap.className = 'task-log-addwrap';
    const addLine = document.createElement('div');
    addLine.className = 'task-log-blline';
    const add = document.createElement('input');
    add.className = 'task-detail-input task-log-add';
    add.placeholder = t('+ Park an item (Enter)');
    const addDetail = document.createElement('textarea');
    addDetail.className = 'task-log-edit-detail hidden';
    addDetail.rows = 4;
    addDetail.placeholder = t('Detail — context, options discussed, why it was deferred (optional)');
    const dToggle = document.createElement('button');
    dToggle.className = 'task-detail-btn';
    dToggle.textContent = '† ' + t('detail');
    dToggle.title = t('Attach full context to the new item');
    dToggle.onclick = () => addDetail.classList.toggle('hidden');
    const commit = () => {
      if (!add.value.trim()) return;
      const item = { text: add.value.trim(), status: 'open', addedBy: 'user', addedAt: Date.now() };
      if (addDetail.value.trim()) item.detail = addDetail.value.trim();
      sidebar._taskUpdate(taskId, { backlog: [...(task.backlog || []), item] });
      add.value = ''; addDetail.value = '';
    };
    add.onkeydown = (e) => { if (e.key === 'Enter') commit(); };
    addLine.append(add, dToggle);
    addWrap.append(addLine, addDetail);
    body.appendChild(addWrap);
    wireChips(body);
  };

  // Session chips filter the view on click; claim × buttons strip a claim.
  const wireChips = (body) => {
    body.querySelectorAll('.task-log-chip.clickable').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation(); e.preventDefault();
        const k = el.dataset.skey;
        state.session = state.session === k ? null : k;
        render();
      };
    });
    body.querySelectorAll('.task-log-claim-x').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation(); e.preventDefault();
        const idx = Number(el.dataset.bidx);
        const key = el.dataset.unclaim;
        const next = (task.backlog || []).map((b, j) => (j === idx ? { ...b, claimedBy: (b.claimedBy || []).filter((k) => k !== key) } : b));
        sidebar._taskUpdate(taskId, { backlog: next });
      };
    });
  };

  const copyMarkdown = () => {
    let md = '';
    if (state.tab === 'activity') {
      const entries = allEntries()
        .filter((p) => (!state.session || p.session === state.session) && (matches(p.note) || matches(p.detail)));
      md = entries.map((p) => {
        const who = p.session ? ` _(${sessionLabel(p.session)})_` : '';
        const detail = p.detail ? '\n' + p.detail.split('\n').map((l) => '  > ' + l).join('\n') : '';
        return `- ${new Date(p.at).toISOString().slice(0, 16).replace('T', ' ')} ${isCleared(p) ? clearedText() : p.note}${who}${detail}`;
      }).join('\n');
    } else {
      // the view's own order (sortBacklog) and TASK.md's markers (`!` high · `↓` low)
      md = sortBacklog(task.backlog || [])
        .filter((it) => (state.statusFilter === 'all' || it.status === state.statusFilter) && (matches(it.text) || matches(it.detail)))
        .map((it) => `- [${it.status === 'done' ? 'x' : it.status === 'dropped' ? '-' : ' '}] ${priorityMarker(it.priority) ? priorityMarker(it.priority) + ' ' : ''}${it.text}${it.resolvedBy ? ` _(${sessionLabel(it.resolvedBy)})_` : ''}${it.detail ? '\n' + it.detail.split('\n').map((l) => '  > ' + l).join('\n') : ''}`).join('\n');
    }
    import('./utils.js').then(({ copyText }) => copyText(md).then(() => showToast(t('Copied'))));
  };

  render();

  // A BROADCAST IS A PATCH on the Activity tab (2026-09-28): the tab counts and the rows are
  // brought up to date in place — the Find box, a ticked selection, an expanded detail and the
  // scroll position are never rebuilt under the user (another client's clear lands mid-selection).
  // A change of the session set behind the filter, or the Backlog tab, still re-renders whole.
  const refresh = () => {
    const prevLive = (task && task.progress) || [];
    task = sidebar._taskById(taskId);
    if (task) {
      // entries that left the live list were MOVED to the archive: they stay where the reader saw them
      const now = new Set((task.progress || []).map(keyOf)), held = new Set(older.list.map(keyOf)), first = (task.progress || [])[0];
      const moved = prevLive.filter((p) => !now.has(keyOf(p)) && !held.has(keyOf(p)) && (!first || p.at <= first.at));
      if (moved.length) older.list = older.list.concat(moved);
      // a clear reached the archive: the archive rows this window holds are read again (patched in place by key)
      if ((task.archiveClearedAt || 0) !== older.clearedAt) { older.clearedAt = task.archiveClearedAt || 0; older.gen++; if (older.list.length) loadOlder(older.list.length); }
    }
    const body = root.querySelector('.task-log-body');
    if (!task || state.tab !== 'activity' || !body) { render(); return; }
    const sessKeys = [...new Set((task.progress || []).map((p) => p.session).filter(Boolean))].sort().join('\u0000');
    if (root.dataset.sessKeys !== undefined && root.dataset.sessKeys !== sessKeys && document.activeElement?.classList?.contains('task-log-sessfilter') !== true) { render(); return; }
    app.wm.setTitle(winInfo.id, task.title + ' — ' + t('Log'));
    const counts = root.querySelectorAll('.task-log-tabs .task-log-count');
    const bl = task.backlog || [];
    const want = [`${bl.filter((b) => b.status === 'open').length}/${bl.length}`, String((task.progress || []).length)];
    counts.forEach((c, i) => { if (want[i] !== undefined && c.textContent !== want[i]) c.textContent = want[i]; });
    paintActivity(body, root.querySelector('.task-log-selbar'));
  };
  const onTasksMsg = (msg) => { if (msg.type === 'tasks-updated') refresh(); };
  app.ws.onGlobal(onTasksMsg);
  const prevClose = winInfo.onClose;
  winInfo.onClose = () => { app.ws.offGlobal(onTasksMsg); prevClose?.(); };

  return winInfo;
}

// ── openSpec ACTION REGISTRATION (Plugin Ph1) ── opens a 'task'-kind window (kind owned by task-detail.js)
registerOpenAction({ action: 'openTaskLog', type: 'task', replay: (app, spec, { syncId } = {}) => app.openTaskLog(spec.taskId, { tab: spec.tab, syncId }) });
