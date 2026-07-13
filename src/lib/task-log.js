import { escHtml, showToast } from './utils.js';
import { t } from './i18n.js';

/**
 * Task Group log viewer — a full-window browser for the Activity log (up to
 * 500 entries), which outgrows the task-detail editor. Entry points: the ⧉
 * button on the Activity section in task-detail + the board header context
 * menu. (The Checklist tab was removed in 2.121.0 along with the group-level
 * checklist feature — work items live on each session's own todo list.)
 *
 * Entries carry SESSION ATTRIBUTION: each shows which session filed it;
 * clicking a session chip filters the view to that session.
 */

export function openTaskLog(app, taskId, { syncId } = {}) {
  const sidebar = app.sidebar;
  const existing = [...app.wm.windows.values()].find(w => w._taskLogId === taskId);
  if (existing) {
    app.wm.focusWindow(existing.id);
    return existing;
  }

  let task = sidebar._taskById(taskId);
  if (!task && sidebar._tasksLoaded) { showToast(t('Task Group not found'), { type: 'error' }); return null; }

  const openSpec = { action: 'openTaskLog', taskId };
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
    search: '',
    session: null,      // session-key filter (null = all)
  };

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

    // ── Header: title + search + session filter ──
    const head = document.createElement('div');
    head.className = 'task-log-head';
    const prog = task.progress || [];
    const label = document.createElement('div');
    label.className = 'sidebar-subtabs task-log-tabs';
    label.innerHTML = `<span class="sidebar-subtab active">${escHtml(t('Activity log'))} <span class="task-log-count">${escHtml(String(prog.length))}</span></span>`;
    head.appendChild(label);

    const search = document.createElement('input');
    search.className = 'task-log-search';
    search.placeholder = t('Search...');
    search.value = state.search;
    search.oninput = () => { state.search = search.value; renderBody(); };
    head.appendChild(search);

    // Session filter dropdown — distinct attributed sessions.
    const keys = new Map(); // key → count
    for (const p of prog) { if (p.session) keys.set(p.session, (keys.get(p.session) || 0) + 1); }
    if (keys.size) {
      const sel = document.createElement('select');
      sel.className = 'task-log-sessfilter';
      sel.innerHTML = `<option value="">${escHtml(t('All sessions'))}</option>`
        + [...keys.entries()].sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `<option value="${escHtml(k)}"${state.session === k ? ' selected' : ''}>${escHtml(sessionLabel(k))} (${n})</option>`).join('');
      sel.onchange = () => { state.session = sel.value || null; renderBody(); };
      head.appendChild(sel);
    } else if (state.session) state.session = null;

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
      renderActivity(body);
    };
    renderBody();

    if (hadFocus) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
    const newScrollEl = root.querySelector('.task-log-body');
    if (newScrollEl) newScrollEl.scrollTop = scrollTop;
  };

  // ── Activity: newest first, grouped by day ──
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
    const entries = (task.progress || [])
      .filter((p) => (!state.session || p.session === state.session) && (matches(p.note) || matches(p.detail)));
    const md = entries.map((p) => {
      const who = p.session ? ` _(${sessionLabel(p.session)})_` : '';
      const detail = p.detail ? '\n' + p.detail.split('\n').map((l) => '  > ' + l).join('\n') : '';
      return `- ${new Date(p.at).toISOString().slice(0, 16).replace('T', ' ')} ${p.note}${who}${detail}`;
    }).join('\n');
    import('./utils.js').then(({ copyText }) => copyText(md).then(() => showToast(t('Copied'))));
  };

  render();

  const onTasksMsg = (msg) => { if (msg.type === 'tasks-updated') render(); };
  app.ws.onGlobal(onTasksMsg);
  const prevClose = winInfo.onClose;
  winInfo.onClose = () => { app.ws.offGlobal(onTasksMsg); prevClose?.(); };

  return winInfo;
}
