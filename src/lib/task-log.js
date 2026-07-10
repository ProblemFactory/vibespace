import { escHtml, showToast } from './utils.js';
import { t } from './i18n.js';

/**
 * Task Group log viewer — a full-window browser for the two lists that
 * outgrow the task-detail editor: the Checklist (backlog) and the Activity
 * log (up to 500 entries). Entry points: the ⧉ buttons on those sections in
 * task-detail + the board header context menu.
 *
 * Both tabs carry SESSION ATTRIBUTION: activity entries show which session
 * filed them; checklist items show who queued them and who ticked them
 * (addedBy/addedAt/doneAt recorded since 2.85.0 — older items simply have no
 * chips). Clicking a session chip filters the view to that session.
 */

export function openTaskLog(app, taskId, { tab, syncId } = {}) {
  const sidebar = app.sidebar;
  const existing = [...app.wm.windows.values()].find(w => w._taskLogId === taskId);
  if (existing) {
    app.wm.focusWindow(existing.id);
    if (tab && existing._taskLogSetTab) existing._taskLogSetTab(tab);
    return existing;
  }

  let task = sidebar._taskById(taskId);
  if (!task && sidebar._tasksLoaded) { showToast(t('Task Group not found'), { type: 'error' }); return null; }

  const openSpec = { action: 'openTaskLog', taskId, tab: tab || 'activity' };
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
    tab: tab === 'checklist' ? 'checklist' : 'activity',
    search: '',
    session: null,      // session-key filter (null = all)
    doneFilter: 'all',  // checklist: all | open | done
    openDays: null,     // activity: Set of expanded day keys (null = default = all)
  };
  winInfo._taskLogSetTab = (tb) => { state.tab = tb === 'checklist' ? 'checklist' : 'activity'; openSpec.tab = state.tab; render(); };

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
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const fmtDay = (ts) => new Date(ts).toLocaleDateString();
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
    const plan = task.plan || [];
    const prog = task.progress || [];
    for (const [key, label, count] of [
      ['checklist', t('Checklist'), `${plan.filter(p => !p.done).length}/${plan.length}`],
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
    search.placeholder = t('Search...');
    search.value = state.search;
    search.oninput = () => { state.search = search.value; renderBody(); };
    head.appendChild(search);

    // Session filter dropdown — distinct attributed sessions in the CURRENT tab.
    const keys = new Map(); // key → count
    if (state.tab === 'activity') for (const p of prog) { if (p.session) keys.set(p.session, (keys.get(p.session) || 0) + 1); }
    else for (const it of plan) { for (const k of [it.addedBy, it.by]) if (k) keys.set(k, (keys.get(k) || 0) + 1); }
    if (keys.size) {
      const sel = document.createElement('select');
      sel.className = 'task-log-sessfilter';
      sel.innerHTML = `<option value="">${escHtml(t('All sessions'))}</option>`
        + [...keys.entries()].sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `<option value="${escHtml(k)}"${state.session === k ? ' selected' : ''}>${escHtml(sessionLabel(k))} (${n})</option>`).join('');
      sel.onchange = () => { state.session = sel.value || null; renderBody(); };
      head.appendChild(sel);
    } else if (state.session) state.session = null;

    if (state.tab === 'checklist') {
      const df = document.createElement('select');
      df.className = 'task-log-sessfilter';
      df.innerHTML = [['all', t('All')], ['open', t('Open')], ['done', t('Done')]]
        .map(([v, l]) => `<option value="${v}"${state.doneFilter === v ? ' selected' : ''}>${escHtml(l)}</option>`).join('');
      df.onchange = () => { state.doneFilter = df.value; renderBody(); };
      head.appendChild(df);
    }

    const copyBtn = document.createElement('button');
    copyBtn.className = 'task-detail-btn';
    copyBtn.textContent = t('Copy as Markdown');
    copyBtn.title = t('Copy the current (filtered) view as a markdown list');
    copyBtn.onclick = () => { copyMarkdown(); };
    head.appendChild(copyBtn);
    root.appendChild(head);

    const body = document.createElement('div');
    body.className = 'task-log-body';
    root.appendChild(body);

    const renderBody = () => {
      body.innerHTML = '';
      if (state.tab === 'activity') renderActivity(body);
      else renderChecklist(body);
    };
    renderBody();

    if (hadFocus) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
    const newScrollEl = root.querySelector('.task-log-body');
    if (newScrollEl) newScrollEl.scrollTop = scrollTop;
  };

  // ── Activity tab: newest first, grouped by day ──
  const renderActivity = (body) => {
    const entries = (task.progress || [])
      .map((p, i) => ({ ...p, _i: i }))
      .filter((p) => (!state.session || p.session === state.session) && (matches(p.note) || matches(p.detail)))
      .reverse();
    if (!entries.length) { body.innerHTML = `<div class="empty-hint">${escHtml(t('No matching entries'))}</div>`; return; }

    let lastDay = null;
    let dayWrap = null;
    for (const p of entries) {
      const day = fmtDay(p.at);
      if (day !== lastDay) {
        lastDay = day;
        const h = document.createElement('div');
        h.className = 'task-log-day';
        const dayCount = entries.filter((e) => fmtDay(e.at) === day).length;
        h.innerHTML = `<span>${escHtml(day)}</span><span class="task-log-day-n">${dayCount}</span>`;
        body.appendChild(h);
        dayWrap = document.createElement('div');
        dayWrap.className = 'task-log-daywrap';
        body.appendChild(dayWrap);
      }
      const meta = `<span class="task-log-time">${escHtml(fmtTime(p.at))}</span>${sessionChip(p.session)}`;
      if (p.detail) {
        const row = document.createElement('details');
        row.className = 'task-log-row task-log-exp';
        row.innerHTML = `<summary>${meta}<span class="task-log-note">${escHtml(p.note)}</span><span class="task-log-dagger">†</span></summary>`
          + `<div class="task-log-detail">${escHtml(p.detail)}</div>`;
        dayWrap.appendChild(row);
      } else {
        const row = document.createElement('div');
        row.className = 'task-log-row';
        row.innerHTML = `${meta}<span class="task-log-note">${escHtml(p.note)}</span>`;
        dayWrap.appendChild(row);
      }
    }
    wireChips(body);
  };

  // ── Checklist tab: open first, then done; attribution chips + timestamps ──
  const renderChecklist = (body) => {
    const plan = (task.plan || []).map((p, i) => ({ ...p, _i: i }));
    const visible = plan.filter((it) =>
      (state.doneFilter === 'all' || (state.doneFilter === 'done') === !!it.done)
      && (!state.session || it.addedBy === state.session || it.by === state.session)
      && matches(it.text));
    if (!visible.length && !plan.length) { body.innerHTML = `<div class="empty-hint">${escHtml(t('No checklist items yet'))}</div>`; return; }

    const addItemRow = (it) => {
      const row = document.createElement('div');
      row.className = 'task-log-row task-log-plan' + (it.done ? ' done' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !!it.done;
      cb.onchange = () => {
        const next = task.plan.map((p, j) => {
          if (j !== it._i) return p;
          const np = { ...p, done: cb.checked };
          if (cb.checked) { np.by = 'user'; np.doneAt = Date.now(); }
          else { delete np.by; delete np.doneAt; }
          return np;
        });
        sidebar._taskUpdate(taskId, { plan: next });
      };
      row.appendChild(cb);
      const txt = document.createElement('span');
      txt.className = 'task-log-note';
      txt.textContent = it.text;
      row.appendChild(txt);
      const chips = document.createElement('span');
      chips.className = 'task-log-attr';
      let html = '';
      if (it.addedBy || it.addedAt) {
        html += `<span class="task-log-attr-part" title="${escHtml(t('Queued by'))}">+ ${sessionChip(it.addedBy)}${it.addedAt ? ` <span class="task-log-time">${escHtml(fmtDay(it.addedAt))}</span>` : ''}</span>`;
      }
      if (it.done && (it.by || it.doneAt)) {
        html += `<span class="task-log-attr-part" title="${escHtml(t('Ticked by'))}">✓ ${sessionChip(it.by)}${it.doneAt ? ` <span class="task-log-time">${escHtml(fmtDay(it.doneAt))}</span>` : ''}</span>`;
      }
      chips.innerHTML = html;
      row.appendChild(chips);
      const del = document.createElement('button');
      del.className = 'task-detail-x'; del.textContent = '×'; del.title = t('Remove step');
      del.onclick = () => sidebar._taskUpdate(taskId, { plan: task.plan.filter((_, j) => j !== it._i) });
      row.appendChild(del);
      return row;
    };

    const open = visible.filter((i) => !i.done);
    const done = visible.filter((i) => i.done);
    if (open.length) {
      const h = document.createElement('div'); h.className = 'task-log-day';
      h.innerHTML = `<span>${escHtml(t('Open'))}</span><span class="task-log-day-n">${open.length}</span>`;
      body.appendChild(h);
      for (const it of open) body.appendChild(addItemRow(it));
    }
    if (done.length) {
      const h = document.createElement('div'); h.className = 'task-log-day';
      h.innerHTML = `<span>${escHtml(t('Done'))}</span><span class="task-log-day-n">${done.length}</span>`;
      body.appendChild(h);
      for (const it of done) body.appendChild(addItemRow(it));
    }

    // Add-item input at the bottom (records UI attribution).
    const add = document.createElement('input');
    add.className = 'task-detail-input task-log-add';
    add.placeholder = t('+ Add checklist step (Enter)');
    add.onkeydown = (e) => {
      if (e.key === 'Enter' && add.value.trim()) {
        sidebar._taskUpdate(taskId, { plan: [...(task.plan || []), { text: add.value.trim(), done: false, addedBy: 'user', addedAt: Date.now() }] });
        add.value = '';
      }
    };
    body.appendChild(add);
    wireChips(body);
  };

  // Session chips filter the view on click.
  const wireChips = (body) => {
    body.querySelectorAll('.task-log-chip.clickable').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation(); e.preventDefault();
        const k = el.dataset.skey;
        state.session = state.session === k ? null : k;
        render();
      };
    });
  };

  const copyMarkdown = () => {
    let md = '';
    if (state.tab === 'activity') {
      const entries = (task.progress || [])
        .filter((p) => (!state.session || p.session === state.session) && (matches(p.note) || matches(p.detail)));
      md = entries.map((p) => {
        const who = p.session ? ` _(${sessionLabel(p.session)})_` : '';
        const detail = p.detail ? '\n' + p.detail.split('\n').map((l) => '  > ' + l).join('\n') : '';
        return `- ${new Date(p.at).toISOString().slice(0, 16).replace('T', ' ')} ${p.note}${who}${detail}`;
      }).join('\n');
    } else {
      md = (task.plan || [])
        .filter((it) => (state.doneFilter === 'all' || (state.doneFilter === 'done') === !!it.done) && matches(it.text))
        .map((it) => `- [${it.done ? 'x' : ' '}] ${it.text}${it.by ? ` _(${sessionLabel(it.by)})_` : ''}`).join('\n');
    }
    import('./utils.js').then(({ copyText }) => copyText(md).then(() => showToast(t('Copied'))));
  };

  render();

  const onTasksMsg = (msg) => { if (msg.type === 'tasks-updated') render(); };
  app.ws.onGlobal(onTasksMsg);
  const prevClose = winInfo.onClose;
  winInfo.onClose = () => { app.ws.offGlobal(onTasksMsg); prevClose?.(); };

  return winInfo;
}
