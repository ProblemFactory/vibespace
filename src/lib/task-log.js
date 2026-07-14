import { escHtml, showToast } from './utils.js';
import { t } from './i18n.js';

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
    app.wm.focusWindow(existing.id);
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
    search.placeholder = t('Search...');
    search.value = state.search;
    search.oninput = () => { state.search = search.value; renderBody(); };
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
      else renderBacklog(body);
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

  // ── Backlog tab: open first, then resolved; expandable detail + inline edit ──
  const STATUS_META = () => ({
    open: { icon: '○', label: t('Open') },
    done: { icon: '✓', label: t('Done') },
    dropped: { icon: '⊘', label: t('Dropped') },
  });
  const renderBacklog = (body) => {
    const items = (task.backlog || []).map((b, i) => ({ ...b, _i: i }));
    const visible = items.filter((it) =>
      (state.statusFilter === 'all' || it.status === state.statusFilter)
      && (!state.session || it.addedBy === state.session || it.resolvedBy === state.session)
      && (matches(it.text) || matches(it.detail)));
    if (!visible.length && !items.length) { body.innerHTML = `<div class="empty-hint">${escHtml(t('Nothing parked — backlog holds non-immediate items: deferred decisions, future work'))}</div>`; }

    const patchItem = (idx, fn) => {
      const next = task.backlog.map((b, j) => (j === idx ? fn({ ...b }) : b));
      sidebar._taskUpdate(taskId, { backlog: next.filter(Boolean) });
    };

    const attrHtml = (it) => {
      let html = '';
      const claims = it.claimedBy || [];
      // parker == claimant is the common case (parking auto-claims) — collapse it
      // into ONE part instead of repeating the same session as two loud chips
      const selfClaim = !!it.addedBy && claims.includes(it.addedBy);
      const claimX = (k) => `<button class="task-log-claim-x" data-unclaim="${escHtml(k)}" data-bidx="${it._i}" title="${escHtml(t('Remove this claim'))}">×</button>`;
      if (it.addedBy || it.addedAt) {
        html += `<span class="task-log-attr-part" title="${escHtml(t('Parked by') + (it.addedAt ? ' · ' + new Date(it.addedAt).toLocaleString() : ''))}">+ ${sessionChip(it.addedBy)}${it.addedAt ? ` <span class="task-log-time">${escHtml(fmtDay(it.addedAt))}</span>` : ''}${selfClaim ? `<span class="task-log-selfclaim" title="${escHtml(t('Claimed by {n} session(s)', { n: claims.length }))}">⚑</span>${claimX(it.addedBy)}` : ''}</span>`;
      }
      const foreign = claims.filter((k) => k !== it.addedBy);
      if (foreign.length) {
        html += `<span class="task-log-attr-part" title="${escHtml(t('Claimed by {n} session(s)', { n: claims.length }))}">⚑ ${foreign.map((k) => `${sessionChip(k)}${claimX(k)}`).join('')}</span>`;
      } else if (!claims.length && it.status === 'open') {
        html += `<span class="task-log-attr-part task-log-unclaimed" title="${escHtml(t('No session has claimed this item'))}">${escHtml(t('unclaimed'))}</span>`;
      }
      if (it.status !== 'open' && (it.resolvedBy || it.resolvedAt)) {
        html += `<span class="task-log-attr-part" title="${escHtml((it.status === 'done' ? t('Resolved by') : t('Dropped by')) + (it.resolvedAt ? ' · ' + new Date(it.resolvedAt).toLocaleString() : ''))}">${it.status === 'done' ? '✓' : '⊘'} ${sessionChip(it.resolvedBy)}${it.resolvedAt ? ` <span class="task-log-time">${escHtml(fmtDay(it.resolvedAt))}</span>` : ''}</span>`;
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
      const btns = document.createElement('div');
      btns.className = 'task-log-edit-btns';
      const save = document.createElement('button');
      save.className = 'btn-create'; save.textContent = t('Save');
      save.onclick = () => {
        const text = ti.value.trim();
        if (!text) return;
        patchItem(it._i, (b) => { b.text = text; if (ta.value.trim()) b.detail = ta.value.trim(); else delete b.detail; return b; });
      };
      const cancel = document.createElement('button');
      cancel.className = 'task-detail-btn'; cancel.textContent = t('Cancel');
      cancel.onclick = () => render();
      btns.append(save, cancel);
      form.append(ti, ta, btns);
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
      const entries = (task.progress || [])
        .filter((p) => (!state.session || p.session === state.session) && (matches(p.note) || matches(p.detail)));
      md = entries.map((p) => {
        const who = p.session ? ` _(${sessionLabel(p.session)})_` : '';
        const detail = p.detail ? '\n' + p.detail.split('\n').map((l) => '  > ' + l).join('\n') : '';
        return `- ${new Date(p.at).toISOString().slice(0, 16).replace('T', ' ')} ${p.note}${who}${detail}`;
      }).join('\n');
    } else {
      md = (task.backlog || [])
        .filter((it) => (state.statusFilter === 'all' || it.status === state.statusFilter) && (matches(it.text) || matches(it.detail)))
        .map((it) => `- [${it.status === 'done' ? 'x' : it.status === 'dropped' ? '-' : ' '}] ${it.text}${it.resolvedBy ? ` _(${sessionLabel(it.resolvedBy)})_` : ''}${it.detail ? '\n' + it.detail.split('\n').map((l) => '  > ' + l).join('\n') : ''}`).join('\n');
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
