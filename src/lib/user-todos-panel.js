// Global user TODO inbox ("For you") — the merged view of every session's
// agent-filed items that need the USER (decisions, missing input, reviews).
// Taskbar button with an open-count badge; the popover groups items by owning
// session (each session's own list is just its group here) and jumps to that
// session to handle them. Items arrive via `vibespace-ask` (agent CLI) and are
// resolved/dismissed here (or by the agent once the user answers in chat).
import { t } from './i18n.js';
import { anchorFixedPopup, escHtml, fetchJson, getToastHistory, showToast } from './utils.js';

const URG_RANK = { low: 0, normal: 1, high: 2, urgent: 3 };

export function installUserTodos(app) {
  const btn = document.getElementById('taskbar-user-todos');
  const popup = document.getElementById('user-todos-popup');
  if (!btn || !popup) return;
  let todos = { open: [], resolved: [] };
  let knownIds = null; // null until the first load — no toast storm at boot
  let tab = 'inbox'; // 'inbox' (default) | 'history' — resets to inbox on open

  // Match items to sidebar sessions with the sidebar's OWN canonical key
  // derivation (same one the status chips use) — an ad-hoc reimplementation
  // here would drift from it. webui:<serverId> covers items filed before the
  // backend id existed.
  const sessionFor = (key) => (app.sidebar?._allSessions || []).find((s) => {
    if (s.webuiId && `webui:${s.webuiId}` === key) return true;
    try { return app.sidebar._getSessionStateKey(s) === key; }
    catch { return `${s.backend || 'claude'}:${s.sessionId}` === key; }
  });
  const displayName = (s) => {
    try { return app.sidebar?.getCustomName?.(s) || s.name; } catch { return s.name; }
  };
  const nameFor = (key, items) => {
    const s = sessionFor(key);
    return (s && displayName(s)) || items.find((i) => i.sessionName)?.sessionName
      || (key.includes(':') ? key.split(':')[1].slice(0, 8) : key);
  };
  const jump = (key) => {
    const s = sessionFor(key);
    if (!s) { showToast(t('Session not found in the list yet — try from the sidebar'), { type: 'error' }); return; }
    popup.classList.add('hidden');
    if (s.webuiId) {
      // goToWindow only works when a window is OPEN for it — a live session
      // whose window was closed needs a re-attach instead of a silent no-op.
      const hasWindow = [...app.sessions.values()].some((term) => term.sessionId === s.webuiId);
      if (hasWindow) app.goToWindow(s.webuiId);
      else app.attachSession(s.webuiId, s.webuiName || displayName(s), s.cwd, { mode: s.webuiMode });
    } else if (s.status === 'tmux') app.attachTmuxSession(s.tmuxTarget, displayName(s), s.cwd);
    else if (s.status === 'stopped') app.resumeSession(s.sessionId, s.cwd, displayName(s), { backend: s.backend, hostId: s.hostId || s.host || undefined });
    else showToast(t('This session is running outside VibeSpace'), { type: 'error' });
  };
  const setStatus = async (id, status) => {
    // fetchJson never throws (returns null / the parsed {error} body) — check
    // the success flag or the failure is a silent no-op.
    const r = await fetchJson(`/api/user-todos/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!r || !r.success) showToast(t('Could not update the item') + (r?.error ? `: ${r.error}` : ''), { type: 'error' });
  };

  const agoText = (ts) => {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return t('just now');
    if (m < 60) return t('{m}min ago', { m });
    const h = Math.round(m / 60);
    return h < 24 ? t('{h}h ago', { h }) : new Date(ts).toLocaleDateString();
  };

  const renderBtn = () => {
    const n = todos.open.length;
    const worst = todos.open.reduce((w, i) => Math.max(w, URG_RANK[i.urgency || 'normal'] || 1), 0);
    btn.classList.toggle('ut-has-items', n > 0);
    btn.dataset.urgency = n ? (Object.keys(URG_RANK).find((k) => URG_RANK[k] === worst) || 'normal') : '';
    btn.innerHTML = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9.5h3l1 1.8h4l1-1.8h3"/><path d="M3.5 3.5h9l1.5 6v3.5a1 1 0 01-1 1H3a1 1 0 01-1-1V9.5z"/></svg>${n ? `<span class="ut-count">${n}</span>` : ''}`;
    btn.title = n ? t('{n} items waiting on you', { n }) : t('Nothing waiting on you');
  };

  const renderPanel = () => {
    if (popup.classList.contains('hidden')) return;
    // Two pages (user request): the real inbox (default) and the recent
    // notification-popup history — messages only, newest first.
    const tabsHtml = `<div class="ut-tabs">
      <button class="ut-tab${tab === 'inbox' ? ' on' : ''}" data-tab="inbox">${t('Inbox')}</button>
      <button class="ut-tab${tab === 'history' ? ' on' : ''}" data-tab="history">${t('Notifications')}</button>
    </div>`;
    if (tab === 'history') {
      const h = getToastHistory();
      popup.innerHTML = tabsHtml + (h.length
        ? h.map((e) => `<div class="ut-hist-item${e.type === 'error' ? ' ut-hist-err' : ''}">
            <div class="ut-hist-msg">${escHtml(e.m)}</div>
            <div class="ut-meta">${agoText(e.ts)}</div>
          </div>`).join('')
        : `<div class="empty-hint">${t('No notifications yet.')}</div>`);
      return;
    }
    const groups = new Map();
    for (const i of todos.open) (groups.get(i.sessionKey) || groups.set(i.sessionKey, []).get(i.sessionKey)).push(i);
    const gs = [...groups.entries()].sort((a, b) => {
      const w = (items) => Math.max(...items.map((i) => URG_RANK[i.urgency || 'normal'] || 1));
      return (w(b[1]) - w(a[1])) || (Math.max(...b[1].map(i => i.createdAt)) - Math.max(...a[1].map(i => i.createdAt)));
    });
    // Detail rides behind a collapsed expander (open items ship up to 2000
    // chars of agent context — inline it would swamp the list).
    const detailHtml = (i) => (i.detail ? `<details class="ut-detail-exp"><summary>${escHtml(t('detail'))}</summary><div class="ut-detail">${escHtml(i.detail)}</div></details>` : '');
    const itemHtml = (i) => `
      <div class="ut-item" data-id="${escHtml(i.id)}">
        <span class="ut-dot" data-urgency="${escHtml(i.urgency || 'normal')}" title="${escHtml(i.urgency || 'normal')}"></span>
        <div class="ut-body">
          <div class="ut-text">${escHtml(i.text)}</div>
          ${detailHtml(i)}
          <div class="ut-meta">${agoText(i.createdAt)}</div>
        </div>
        <span class="ut-actions">
          <button class="ut-act ut-done" title="${t('Handled — mark done')}">✓</button>
          <button class="ut-act ut-dismiss" title="${t('Dismiss (not going to act on this)')}">✕</button>
        </span>
      </div>`;
    const resolvedHtml = todos.resolved.length ? `
      <div class="ut-resolved-head">${t('Recently resolved')}</div>
      ${todos.resolved.slice(0, 6).map((i) => `
        <div class="ut-item ut-item-resolved" data-id="${escHtml(i.id)}">
          <span class="ut-dot" data-urgency=""></span>
          <div class="ut-body"><div class="ut-text">${escHtml(i.text)}</div>
          ${detailHtml(i)}
          <div class="ut-meta"><span class="ut-sess" title="${t('Go to this session')}">${escHtml(nameFor(i.sessionKey, [i]))}</span> · ${i.status === 'dismissed' ? t('dismissed') : t('done')}${i.resolvedBy === 'agent' ? ' · ' + t('by the agent') : ''} · ${agoText(i.resolvedAt || i.createdAt)}</div></div>
          <span class="ut-actions"><button class="ut-act ut-reopen" title="${t('Reopen')}">↺</button></span>
        </div>`).join('')}` : '';
    popup.innerHTML = tabsHtml + `
      <div class="usage-section-title">${t('For you')}<span class="ut-head-sub">${todos.open.length ? t('{n} open', { n: todos.open.length }) : t('all clear')}</span></div>
      ${gs.length ? gs.map(([key, items]) => `
        <div class="ut-group">
          <button class="ut-group-head" data-key="${escHtml(key)}" title="${t('Go to this session')}">${escHtml(nameFor(key, items))}<span class="ut-group-n">${items.length}</span><span class="ut-group-go">→</span></button>
          ${items.map(itemHtml).join('')}
        </div>`).join('')
      : `<div class="empty-hint">${t('Nothing needs you right now. Agents file items here with vibespace-ask when they need a decision or input.')}</div>`}
      ${resolvedHtml}`;
  };

  btn.onclick = () => {
    popup.classList.toggle('hidden');
    tab = 'inbox'; // default page on every open (user spec)
    renderPanel();
    // Anchor to the button's CURRENT position — customize mode can move it to
    // any bar, so the old fixed bottom-right CSS pointed nowhere.
    if (!popup.classList.contains('hidden')) anchorFixedPopup(popup, btn);
  };
  document.addEventListener('mousedown', (e) => {
    if (!popup.contains(e.target) && !btn.contains(e.target)) popup.classList.add('hidden');
  });
  popup.addEventListener('click', (e) => {
    const tb = e.target.closest('.ut-tab');
    if (tb) { tab = tb.dataset.tab; renderPanel(); return; }
    const head = e.target.closest('.ut-group-head');
    if (head) { jump(head.dataset.key); return; }
    // A click on the detail expander is a toggle, not a jump — without this
    // guard opening the detail would bubble into the row's jump-and-close.
    if (e.target.closest('.ut-detail-exp')) return;
    const item = e.target.closest('.ut-item');
    if (!item) return;
    const id = item.dataset.id;
    if (e.target.closest('.ut-done')) setStatus(id, 'done');
    else if (e.target.closest('.ut-dismiss')) setStatus(id, 'dismissed');
    else if (e.target.closest('.ut-reopen')) setStatus(id, 'open');
    else {
      const rec = todos.open.find((i) => i.id === id) || todos.resolved.find((i) => i.id === id);
      if (rec) jump(rec.sessionKey);
    }
  });

  const apply = (next) => {
    const prevKnown = knownIds;
    todos = next || { open: [], resolved: [] };
    // Toast genuinely NEW items — click one to jump. Known ids include the
    // resolved tail, so a user reopening an item doesn't get toasted for their
    // own action. The knownIds closure survives reconnects, so a resync after
    // an offline gap toasts exactly the items that arrived meanwhile (the
    // toast stack self-caps at 4).
    if (prevKnown) {
      for (const i of todos.open) {
        if (prevKnown.has(i.id)) continue;
        const el = showToast(`${t('For you')} · ${nameFor(i.sessionKey, [i])}: ${i.text}`);
        if (el) { el.style.cursor = 'pointer'; el.onclick = () => jump(i.sessionKey); }
        btn.classList.remove('ut-blink'); void btn.offsetWidth; btn.classList.add('ut-blink');
      }
    }
    knownIds = new Set([...todos.open, ...todos.resolved].map((i) => i.id));
    renderBtn(); renderPanel();
  };

  let liveSeen = false; // a broadcast beat the initial fetch — don't clobber it with the older snapshot
  app.ws.onGlobal((msg) => { if (msg.type === 'user-todos-updated' && msg.todos) { liveSeen = true; apply(msg.todos); } });
  // Resync on reconnect — items filed while offline would otherwise stay
  // invisible until the next unrelated change re-broadcasts.
  app.ws.onStateChange?.((connected) => {
    if (connected) fetchJson('/api/user-todos').then((d) => { if (d?.todos) apply(d.todos); });
  });
  fetchJson('/api/user-todos').then((d) => { if (d?.todos && !liveSeen) apply(d.todos); });
  // A toast fired while the history page is open → live-refresh it
  window.addEventListener('vs-toast', () => { if (tab === 'history' && !popup.classList.contains('hidden')) renderPanel(); });
  renderBtn();
}
