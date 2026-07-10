import { escHtml, copyText, showConfirmDialog } from './utils.js';
import { SESSION_STATE_META, SESSION_URGENCY_META } from './sidebar-tasks.js';
import { getBackendMeta, getAgentKindMeta, getAgentRoleLabel } from './agent-meta.js';
import { t } from './i18n.js';

/**
 * Session Properties window — the FULL view of everything VibeSpace knows
 * about one session (活儿): identity, connection, billing, per-session config,
 * Task Group membership, agent TODO steps, and the status history timeline.
 * The card stays a glanceable summary; this window is the reference sheet.
 *
 * Live-synced: re-renders on active-sessions / tasks-updated /
 * session-status-updated broadcasts (read-only layout — no focus guard
 * needed except the account select, which re-applies its value).
 * openSpec `openSessionProps` replays across clients/restores.
 */
export function openSessionProps(app, sessionRef, { syncId } = {}) {
  const sidebar = app.sidebar;
  const refKey = typeof sessionRef === 'string' ? sessionRef : sidebar._getSessionStateKey(sessionRef);
  const findSession = () =>
    (sidebar._allSessions || []).find(x => sidebar._getSessionStateKey(x) === refKey)
    || (typeof sessionRef === 'object' ? sessionRef : null);
  const s0 = findSession();
  if (!s0) return null;

  const existing = [...app.wm.windows.values()].find(w => w._sessionPropsKey === refKey);
  if (existing) { app.wm.focusWindow(existing.id); return existing; }

  const openSpec = { action: 'openSessionProps', sessionKey: refKey, cwd: s0.cwd || '', name: s0.name || '' };
  const winInfo = app.wm.createWindow({
    title: (sidebar.getCustomName(s0) || s0.name || t('Session')) + t(' — Properties'),
    type: 'task', syncId, openSpec, width: 440, height: 620,
  });
  winInfo._sessionPropsKey = refKey;

  const root = document.createElement('div');
  root.className = 'task-detail session-props';
  winInfo.content.appendChild(root);

  const render = () => {
    const s = findSession();
    if (!s) { root.innerHTML = `<div class="empty-hint">${escHtml(t('Session no longer known (transcript gone from discovery).'))}</div>`; return; }
    // Don't clobber an open native select the user is interacting with
    if (root.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
    root.innerHTML = '';
    const customName = sidebar.getCustomName(s);
    const displayName = customName || s.name || s.webuiName || (s.cwd || '').split('/').pop() || s.sessionId;
    app.wm.setTitle(winInfo.id, displayName + t(' — Properties'));

    const section = (label) => {
      const el = document.createElement('div');
      el.className = 'task-detail-section';
      el.innerHTML = `<div class="task-detail-label">${escHtml(label)}</div>`;
      root.appendChild(el);
      return el;
    };
    const row = (parent, label, valueHtml, { copy } = {}) => {
      const r = document.createElement('div');
      r.className = 'session-detail-row';
      r.innerHTML = `<span class="session-detail-label">${escHtml(label)}</span>`;
      const v = document.createElement('span');
      v.className = 'session-detail-value';
      v.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      v.innerHTML = valueHtml;
      if (copy) {
        v.classList.add('session-detail-copyable');
        v.dataset.tip = t('Click to copy');
        v.onclick = () => { copyText(copy); v.dataset.tip = t('Copied!'); setTimeout(() => { v.dataset.tip = t('Click to copy'); }, 900); };
      }
      r.appendChild(v);
      parent.appendChild(r);
      return r;
    };

    // ── Identity ──
    const idSec = section(t('Identity'));
    row(idSec, t('Name'), escHtml(displayName) + (customName ? ` <span class="sp-dim-note">${escHtml(t('(custom)'))}</span>` : ''));
    row(idSec, t('ID'), escHtml(s.sessionId || ''), { copy: s.sessionId || '' });
    const bm = getBackendMeta(s.backend || 'claude');
    const agentBits = [bm.label, (s.agentKind && s.agentKind !== 'primary') ? getAgentKindMeta(s.agentKind).label : null, getAgentRoleLabel(s.agentRole), s.agentNickname || null].filter(Boolean).join(' / ');
    row(idSec, t('Agent'), escHtml(agentBits));
    row(idSec, t('Mode'), escHtml(s.webuiMode || s.mode || 'terminal'));
    if (s.hostName) row(idSec, t('Machine'), escHtml(s.hostName));
    row(idSec, t('CWD'), escHtml((s.cwd || '').replace(/^\/home\/[^/]+/, '~')), { copy: s.cwd || '' });
    if (s.startedAt) row(idSec, t('Started'), escHtml(new Date(s.startedAt).toLocaleString()));
    const connLabel = { live: t('LIVE (VibeSpace-managed)'), tmux: t('Running in tmux'), external: t('Running externally'), stopped: t('Stopped') }[s.status] || s.status;
    row(idSec, t('Connection'), escHtml(connLabel) + (s.pid ? ` <span style="color:var(--text-dim)">PID ${escHtml(String(s.pid))}</span>` : ''));

    // ── State (current + change) ──
    const stSec = section(t('State'));
    const st = sidebar.getSessionStatus?.(s);
    const meta = st?.state ? (SESSION_STATE_META[st.state] || { label: st.state, color: 'var(--text-dim)' }) : null;
    const urgMark = st?.urgency ? (SESSION_URGENCY_META[st.urgency]?.mark || '') : '';
    const stRow = document.createElement('div');
    stRow.className = 'session-detail-row';
    stRow.innerHTML = `<span class="session-detail-label">${escHtml(t('Now'))}</span>
      <span class="session-detail-value" style="flex:1">${meta
        ? `<span style="color:${meta.color};font-weight:600">${escHtml(meta.label)}${urgMark ? ' ' + urgMark : ''}</span>${st.reason ? ` <span style="color:var(--text-dim)">— ${escHtml(st.reason)}</span>` : ''} <span class="sp-dim-note">(${st.setBy === 'agent' ? escHtml(t('agent')) : escHtml(t('you'))})</span>${st.detail ? `<details class="sp-status-detail"><summary>${escHtml(t('detail'))}</summary><div>${escHtml(st.detail)}</div></details>` : ''}`
        : `<span style="color:var(--text-dim)">${escHtml(t('none declared'))}</span>`}</span>`;
    const chg = document.createElement('button');
    chg.className = 'task-detail-btn';
    chg.textContent = t('Change…');
    chg.onclick = () => sidebar._showSessionStatusPopover?.(chg, s);
    stRow.appendChild(chg);
    stSec.appendChild(stRow);
    // History timeline
    const histList = document.createElement('div');
    histList.className = 'session-history-list';
    histList.style.marginTop = '4px';
    histList.innerHTML = `<div class="empty-hint" style="padding:2px 0">${escHtml(t('Loading history…'))}</div>`;
    stSec.appendChild(histList);
    const keys = [refKey, s.webuiId ? 'webui:' + s.webuiId : null].filter(Boolean).join(',');
    fetch(`/api/session-status/history?sessionKey=${encodeURIComponent(keys)}`).then(r => r.json()).then(d => {
      if (!histList.isConnected) return;
      const hist = (d?.history || []).slice(-20).reverse();
      histList.innerHTML = hist.length ? '' : `<div class="empty-hint" style="padding:2px 0">${escHtml(t('No status changes recorded yet'))}</div>`;
      const today = new Date().toDateString();
      for (const h of hist) {
        const li = document.createElement('div');
        li.className = 'session-history-item';
        const when = new Date(h.at);
        const tm = (when.toDateString() === today ? '' : (when.getMonth() + 1) + '/' + when.getDate() + ' ') + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const m = h.state ? (SESSION_STATE_META[h.state] || { label: h.state, color: 'var(--text-dim)' }) : null;
        li.innerHTML = `<span class="session-history-time">${escHtml(tm)}</span>`
          + `<span class="session-history-dot" style="--h-color:${m ? m.color : 'var(--text-dim)'}"></span>`
          + `<span class="session-history-state">${escHtml(h.cleared ? t('cleared') : (m?.label || ''))}</span>`
          + (h.reason ? `<span class="session-history-reason" title="${escHtml(h.reason)}">${escHtml(h.reason)}</span>` : '')
          + `<span class="session-history-by">${h.setBy === 'user' ? escHtml(t('you')) : escHtml(t('agent'))}</span>`;
        histList.appendChild(li);
      }
    }).catch(() => {});

    // ── Billing ──
    const bilSec = section(t('Billing'));
    const a = s.auth;
    const authLabel = !a || a.source === 'subscription' ? (a?.guessed ? t('Subscription (estimated from login state at spawn)') : t('Subscription (Pro/Max plan)'))
      : a.source === 'api-key' ? t('API key — {name}{tail} · pay per use{est}', { name: a.name || 'key', tail: a.tail ? ' (…' + a.tail + ')' : '', est: a.guessed ? t(' (estimated)') : '' })
      : a.source === 'api-console' ? t('API — Console login · pay per use{est}', { est: a.guessed ? t(' (estimated)') : '' })
      : a.source === 'api-other' ? t('API — {detail} · pay per use', { detail: a.detail || t('other key source') })
      : t('Unknown (started before tracking)');
    row(bilSec, t('This run'), (a && a.source?.startsWith('api')) ? `<span style="color:var(--yellow,#e5c07b)">${escHtml(authLabel)}</span>` : escHtml(authLabel));
    // Account override for the NEXT resume
    const acctRow = document.createElement('div');
    acctRow.className = 'session-detail-row';
    acctRow.innerHTML = `<span class="session-detail-label">${escHtml(t('On resume'))}</span>`;
    const acctSel = document.createElement('select');
    acctSel.className = 'session-config-select';
    acctSel.style.flex = '1';
    const savedCfg = sidebar.getSessionConfig?.(s) || {};
    const sbe = s.backend || 'claude';
    const accts = (app._accounts?.accounts || []).filter(x => (x.backend || 'claude') === sbe);
    const globalLabel = sbe === 'codex' ? t('ChatGPT login') : t('Subscription');
    for (const [v, label] of [['', t('Default')], ['subscription', globalLabel], ...accts.map(x => [x.id, x.type === 'subscription' ? `${x.name} (${t('subscription')})` : `${x.name} — API …${x.tail}`])]) {
      const o = document.createElement('option'); o.value = v; o.textContent = label;
      acctSel.appendChild(o);
    }
    acctSel.value = [...acctSel.options].some(o => o.value === (savedCfg.account || '')) ? (savedCfg.account || '') : '';
    acctSel.onchange = () => sidebar.setSessionConfig?.(s, { ...(sidebar.getSessionConfig?.(s) || {}), account: acctSel.value });
    acctRow.appendChild(acctSel);
    bilSec.appendChild(acctRow);

    // ── Config overrides (summary; edit via the card ⚙) ──
    const cfg = sidebar.getSessionConfig?.(s) || {};
    const cfgBits = ['model', 'effort', 'permission'].filter(k => cfg[k]).map(k => `${k}: ${cfg[k]}`);
    if (cfgBits.length) row(section(t('Config overrides')), t('Saved'), escHtml(cfgBits.join(' · ')));

    // ── Task Groups (explicit toggles; folder-derived shown, not toggleable) ──
    const tgSec = section(t('Task Groups'));
    const explicitIds = new Set((sidebar._getSessionTasks?.(s) || []).map(t => t.id));
    const belonged = sidebar._getSessionTaskGroups?.(s) || [];
    const byId = new Map(belonged.map(t => [t.id, t]));
    for (const g of (sidebar._tasks || []).filter(x => !x.archived)) {
      const isExplicit = explicitIds.has(g.id);
      const viaFolder = !isExplicit && byId.has(g.id);
      const lbl = document.createElement('label');
      lbl.className = 'session-props-group';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isExplicit || viaFolder;
      cb.disabled = viaFolder; // dynamic membership — remove the folder link instead
      cb.onchange = () => { cb.checked ? sidebar._taskBind(g.id, s) : sidebar._taskUnbind(g.id, s); };
      const txt = document.createElement('span');
      txt.textContent = g.title + (viaFolder ? t(' (folder)') : '');
      if (g.color) { const dot = document.createElement('span'); dot.className = 'tvg-dot'; dot.style.setProperty('--g-color', g.color); lbl.append(cb, dot, txt); }
      else lbl.append(cb, txt);
      tgSec.appendChild(lbl);
    }
    if (!(sidebar._tasks || []).filter(t => !t.archived).length) tgSec.insertAdjacentHTML('beforeend', `<div class="empty-hint">${escHtml(t('No Task Groups yet'))}</div>`);

    // ── Agent steps (native TODO) ──
    const stepSec = section(t('Agent steps'));
    const stepList = document.createElement('div');
    stepList.className = 'session-steps-list';
    stepList.innerHTML = `<div class="empty-hint" style="padding:2px 0">${escHtml(t('Loading…'))}</div>`;
    stepSec.appendChild(stepList);
    const rid = s.backendSessionId || s.sessionId;
    fetch(`/api/session-todos?backend=${encodeURIComponent(s.backend || 'claude')}&backendSessionId=${encodeURIComponent(rid)}&cwd=${encodeURIComponent(s.cwd || '')}`)
      .then(r => r.json()).then(d => {
        if (!stepList.isConnected) return;
        const todos = (d?.todos || []).filter(t => (t.content || t.step || '').trim());
        stepList.innerHTML = todos.length ? '' : `<div class="empty-hint" style="padding:2px 0">${escHtml(t("The agent hasn't kept a todo list"))}</div>`;
        const mkStep = (t) => {
          const li = document.createElement('div');
          li.className = 'session-step ' + (t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'active' : '');
          li.textContent = (t.status === 'completed' ? '✓ ' : t.status === 'in_progress' ? '▸ ' : '○ ') + (t.content || t.step || '');
          return li;
        };
        // Open work first; completed collapsed to the last 2 with an
        // expandable "N more" row (long histories drowned the actionable steps).
        const open = todos.filter(t => t.status !== 'completed');
        const done = todos.filter(t => t.status === 'completed');
        for (const t of open) stepList.appendChild(mkStep(t));
        const hidden = done.slice(0, -2);
        if (hidden.length) {
          const toggle = document.createElement('div');
          toggle.className = 'session-step session-step-more';
          toggle.textContent = t('✓ {n} more completed…', { n: hidden.length });
          toggle.onclick = () => {
            const frag = document.createDocumentFragment();
            for (const t of hidden) frag.appendChild(mkStep(t));
            toggle.replaceWith(frag);
          };
          stepList.appendChild(toggle);
        }
        for (const t of done.slice(-2)) stepList.appendChild(mkStep(t));
      }).catch(() => {});
  };

  render();
  const onMsg = (msg) => {
    if (['tasks-updated', 'session-status-updated', 'active-sessions', 'accounts-updated', 'user-state-updated'].includes(msg.type)) render();
  };
  app.ws.onGlobal(onMsg);
  const prevClose = winInfo.onClose;
  winInfo.onClose = () => { app.ws.offGlobal(onMsg); prevClose?.(); };
  return winInfo;
}
