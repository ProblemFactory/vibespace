import { escHtml, copyText, createPopover, showConfirmDialog, showContextMenu } from './utils.js';
import { t as tr } from './i18n.js';
import { SESSION_STATE_META, SESSION_URGENCY_META } from './sidebar-tasks.js';
import { createBackendIcon, createAgentKindIcon, createModeBackendIcon, getBackendMeta, getAgentKindMeta, getAgentRoleLabel, getAgentRoleShortLabel, getSessionKey } from './agent-meta.js';

/** Inline SVG icon helper — returns an HTML string for a 12x12 stroked icon */
const _s = (d, fill = false) => `<svg style="width:12px;height:12px;vertical-align:-2px" viewBox="0 0 16 16" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${d}</svg>`;
const ICON = {
  starOn:    _s('<path d="M8 1.5l2 4.2 4.5.6-3.3 3.1.8 4.6L8 11.5l-4 2.5.8-4.6L1.5 6.3 6 5.7z"/>', true),
  starOff:   _s('<path d="M8 1.5l2 4.2 4.5.6-3.3 3.1.8 4.6L8 11.5l-4 2.5.8-4.6L1.5 6.3 6 5.7z"/>'),
  archive:   _s('<path d="M2 4h12M3 4v8a1 1 0 001 1h8a1 1 0 001-1V4"/><path d="M6.5 8h3"/>'),
  unarchive: _s('<path d="M2 4h12M3 4v8a1 1 0 001 1h8a1 1 0 001-1V4"/><path d="M8 7v4M6 9l2-2 2 2"/>'),
  rename:    _s('<path d="M11.5 1.5l3 3L5 14H2v-3z"/>'),
  find:      _s('<circle cx="7" cy="7" r="4"/><path d="M10 10l4 4"/>'),
  chat:      _s('<path d="M2 3a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H6l-4 3V3z"/>'),
  history:   _s('<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 1.5"/>'),
  terminal:  _s('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4.5 7l2 2-2 2M8.5 11h3"/>'),
  terminate: _s('<path d="M4 4l8 8M12 4l-8 8"/>'),
  goto:      _s('<path d="M5 1l7 7-7 7"/>'),
  move:      _s('<path d="M8 1v14M1 8h14M8 1L6 3M8 1l2 2M8 15l-2-2M8 15l2-2M1 8l2-2M1 8l2 2M15 8l-2-2M15 8l-2 2"/>'),
  fork:      _s('<path d="M8 2v6M8 8c-3 0-4 2-4 4M8 8c3 0 4 2 4 4"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="13" r="1.5"/><circle cx="8" cy="2" r="1.5"/>'),
};

/**
 * Render the detail groups section inside a session card.
 * @param {HTMLElement} container - DOM container for groups
 * @param {object|string} sessionRef
 * @param {boolean} clickToCopy
 * @param {object} state - sidebar instance (for _getSessionTasks, _showTaskChecklistPopover, _taskBind, _taskUnbind)
 */
function renderDetailGroups(container, sessionRef, clickToCopy, state) {
  container.innerHTML = '';
  const explicit = state._getSessionTasks(sessionRef);
  const explicitIds = new Set(explicit.map(t => t.id));
  // Show ALL groups this session belongs to — explicit tag AND auto-include
  // folder match (folder ones marked, since they're not toggleable here).
  const allGroups = state._getSessionTaskGroups ? state._getSessionTaskGroups(sessionRef) : explicit;
  const summary = allGroups.length
    ? allGroups.map(t => explicitIds.has(t.id) ? t.title : t.title + tr(' (folder)')).join(', ')
    : tr('None');

  const row = document.createElement('div');
  row.className = 'session-detail-row';
  const lbl = document.createElement('span'); lbl.className = 'session-detail-label'; lbl.textContent = tr('Task Groups');
  const val = document.createElement('span'); val.className = 'session-detail-value';
  val.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  val.textContent = summary;
  if (clickToCopy) {
    val.classList.add('session-detail-copyable');
    val.title = tr('Click to copy');
    val.onclick = (e) => {
      e.stopPropagation();
      // copyText handles non-HTTPS contexts (navigator.clipboard is undefined
      // over HTTP — the bare property access threw synchronously here)
      copyText(summary);
      const orig = val.textContent; val.textContent = tr('Copied!');
      setTimeout(() => { val.textContent = orig; }, 800);
    };
  }
  row.append(lbl, val);
  const btn = document.createElement('button');
  btn.className = 'session-detail-btn';
  btn.textContent = '\u25be';
  btn.style.cssText = 'padding:1px 6px;font-size:10px;min-width:0';
  btn.onclick = (e) => {
    e.stopPropagation();
    const taskIds = new Set(state._getSessionTasks(sessionRef).map(t => t.id));
    state._showTaskChecklistPopover(btn,
      (task) => taskIds.has(task.id),
      (task, checked) => { if (checked) state._taskBind(task.id, sessionRef); else state._taskUnbind(task.id, sessionRef); });
  };
  row.appendChild(btn);
  container.appendChild(row);
}

/**
 * Render a session card element.
 * @param {object} s - session data object
 * @param {object} opts
 * @param {object} opts.state - sidebar instance (isStarred, isArchived, getCustomName, getSessionMode, toggleStar, toggleArchive, etc.)
 * @param {object} opts.app - App instance (attachSession, resumeSession, etc.)
 * @param {object} opts.settings - SettingsManager
 * @param {string|null} opts.expandedCardId - currently expanded card ID
 * @param {function} opts.onExpandToggle - callback(sessionId) when expand toggled
 * @param {function} opts.onRename - callback(session, originalName) for rename
 * @returns {HTMLElement}
 */
export function renderSessionCard(s, { state, app, settings, expandedCardId, onExpandToggle, onRename, showCwd }) {
  const card = document.createElement('div'); card.className = 'session-item-card';
  card._sessionId = s.sessionId; // Store for highlight lookup
  card.draggable = true;
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-session-id', s.sessionId);
    const sessionKey = getSessionKey(s);
    if (sessionKey) e.dataTransfer.setData('application/x-session-key', sessionKey);
    e.dataTransfer.effectAllowed = 'link';
  });
  const isArchived = state.isArchived(s);
  if (isArchived) card.classList.add('archived');
  if (expandedCardId === s.sessionId) card.classList.add('expanded');
  const date = new Date(s.startedAt);
  const customName = state.getCustomName(s);
  const cwdFolder = s.cwd ? s.cwd.replace(/\/+$/, '').split('/').pop() : '';
  const originalName = s.name || s.webuiName || cwdFolder || s.sessionId.substring(0, 12) + '...';
  const displayName = customName || originalName;
  const backendMeta = getBackendMeta(s.backend || 'claude');
  const agentKindMeta = getAgentKindMeta(s.agentKind || 'primary');
  const agentRoleLabel = getAgentRoleLabel(s.agentRole);
  const agentRoleShort = getAgentRoleShortLabel(s.agentRole);
  const showAgentKind = (s.agentKind || 'primary') !== 'primary';
  const agentOpts = {
    backend: s.backend || 'claude',
    backendSessionId: s.backendSessionId || s.sessionId,
    hostId: s.host || undefined, // remote sessions resume/view ON their host
    agentKind: s.agentKind || 'primary',
    agentRole: s.agentRole || '',
    agentNickname: s.agentNickname || '',
    sourceKind: s.sourceKind || '',
    parentThreadId: s.parentThreadId || null,
  };

  const badgeMap = {
    live:     { cls: 'badge-live', text: tr('LIVE') },
    tmux:     { cls: 'badge-tmux', text: tr('TMUX') },
    external: { cls: 'badge-external', text: tr('EXTERNAL') },
    stopped:  { cls: 'badge-stopped', text: tr('STOPPED') },
  };
  const badge = badgeMap[s.status] || badgeMap.stopped;

  const starred = state.isStarred(s);
  // Compact row: star archive mode/backend icon name status expand
  // Two rows. Row 1: a connection-status DOT (LIVE/STOPPED/… as a colored dot
  // left of the name) + name + tag badges (role, config gear, host, and the
  // session-status chip — text on a wide sidebar, icon-only when narrow via a
  // container query). Row 2 (task board only, via showCwd): the session's own
  // cwd, left-truncated. Left control icons center across the rows.
  const cwdText = s.cwd ? escHtml(s.cwd.replace(/^\/home\/[^/]+/, '~')) : '';
  const connLabel = { live: tr('LIVE'), tmux: tr('TMUX'), external: tr('External'), stopped: tr('Stopped') }[s.status] || tr('Stopped');
  card.innerHTML = `<div class="session-card-row">
    <div class="session-card-lines">
      <div class="session-card-main">
        <span class="session-conn-dot" data-status="${escHtml(s.status || 'stopped')}" data-tip="${escHtml(connLabel)}"></span>
        <span class="session-card-name">${escHtml(displayName)}</span>
        ${agentRoleShort ? `<span class="session-card-badge badge-agent-role" data-tip="${escHtml(agentRoleLabel)}">${escHtml(agentRoleShort)}</span>` : ''}
        ${(() => {
          // Billing identity: EVERY API-billed session gets the amber key —
          // whether via an env key OR a console global login at spawn — so
          // sessions that keep burning API money after a subscription
          // re-login stay visible. Subscription = quiet (no badge).
          const a = s.auth;
          if (!a) return '';
          // A NAMED subscription account shows which one it bills (so you never
          // burn the wrong plan); the plain CLI global login stays quiet.
          if (a.source === 'subscription') {
            if (!a.name) return '';
            // Compact: crown SVG + just the first character of the name (full
            // name in the tooltip). No emoji.
            const CROWN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12.5h11M3 12.5L2 4.5l3.2 2.6L8 3l2.8 4.1L14 4.5l-1 8z"/></svg>';
            const first = [...String(a.name)][0] || '';
            return `<span class="session-card-badge badge-sub" data-tip="${escHtml(tr('Subscription — {name}', { name: a.name }))}">${CROWN}${escHtml(first)}</span>`;
          }
          const KEY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="8" r="3"/><path d="M8 8h6.5M12 8v2.5M14.5 8v2"/></svg>';
          if (a.source === 'api-key' || a.source === 'api-console' || a.source === 'api-other') {
            const who = a.source === 'api-console' ? tr('Console login')
              : a.name ? `${a.name}${a.tail ? ' (…' + a.tail + ')' : ''}` : (a.detail || tr('API key'));
            return `<span class="session-card-badge badge-account" data-tip="${escHtml(tr('API billing (pay per use) — {who}', { who }))}${a.guessed ? escHtml(tr(' · estimated from the login state at spawn')) : ''}">${KEY}</span>`;
          }
          if (a.source === 'unknown' && (s.status === 'live' || s.status === 'tmux')) {
            return `<span class="session-card-badge badge-account badge-account-unknown" data-tip="${tr('Billing identity unknown (started before tracking — could be subscription or API)')}">${KEY}?</span>`;
          }
          return '';
        })()}
        <span class="session-card-badge badge-config" style="display:none"></span>
        ${s.hostName ? `<span class="session-host-badge" data-tip="Remote session on ${escHtml(s.hostName)}">${escHtml(s.hostName)}</span>` : ''}
        ${s.todo && s.todo.total > 0 && s.todo.done < s.todo.total ? `<span class="session-todo-pill" data-tip="${escHtml(s.todo.current ? tr('Now: {step}', { step: s.todo.current }) : tr('Agent steps'))} ${tr('({done}/{total} done)', { done: s.todo.done, total: s.todo.total })}"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5l1.2 1.2L5.5 3.4M2 9.5l1.2 1.2 2.3-2.3M8 4.5h6M8 9.5h6M8 13h4"/></svg>${s.todo.done}/${s.todo.total}</span>` : ''}
        <span class="sess-state-chip" style="display:none"></span>
      </div>
      ${showCwd && cwdText ? `<div class="session-card-sub"><span class="session-card-cwd" data-tip="${escHtml(s.cwd)}">${cwdText}</span></div>` : ''}
    </div>
  </div>`;
  const row = card.querySelector('.session-card-row');
  // Session status chip (agent-set via vibespace-status / user-set) — state
  // color + urgency marks; click to adjust (overrides are relayed to the agent)
  const stateChip = row.querySelector('.sess-state-chip');
  {
    const st = state.getSessionStatus?.(s);
    const isLive = s.status === 'live' || s.status === 'tmux';
    const sKey = `${s.backend || 'claude'}:${s.backendSessionId || s.claudeSessionId || ''}`;
    const waiting = isLive && (state._waitingSet?.().has(sKey));
    // Synthesize a display state so EVERY live session shows working/waiting/
    // blocked at a glance: agent-declared wins; else OSC-idle ⇒ needs-input,
    // otherwise a live session reads as "working". Non-live shows nothing here
    // (the connection badge already says stopped/external).
    // STALE DECAY: a stopped session's declared working/needs-input describes a
    // process that no longer runs — drop it. Result-like states (done/review/
    // blocked) persist on stopped cards but render dashed like derived ones.
    const staleActive = !isLive && st?.state && (st.state === 'working' || st.state === 'needs-input');
    const declared = staleActive ? null : (st?.state || null);
    const dstate = declared || (isLive ? (waiting ? 'needs-input' : 'working') : null);
    const staleResult = !isLive && !!declared;
    // Urgency defaults to 'normal' once a session has ANY state — so every such
    // card carries an urgency for its background tint (#4/#5); the agent/user can
    // still raise it. data-urgency drives the card background color.
    const urg = st?.urgency || (dstate ? 'normal' : null);
    if (urg && dstate) card.dataset.urgency = urg;
    if (dstate) {
      const meta = SESSION_STATE_META[dstate] || { label: dstate || tr('status'), color: 'var(--text-dim)' };
      const mark = SESSION_URGENCY_META[st?.urgency]?.mark || '';
      const derived = !declared; // synthesized by VibeSpace, not agent/user-declared
      const label = meta.label + (mark ? ' ' + mark : '');
      stateChip.style.display = '';
      stateChip.style.setProperty('--chip-color', meta.color);
      // Icon + text: the text shows on a wide sidebar, the icon-only when narrow
      // (container query). data-tip gives the instant tooltip in icon mode.
      stateChip.innerHTML = `<span class="chip-icon">${meta.icon || ''}</span><span class="chip-text">${escHtml(label)}</span>`;
      stateChip.classList.toggle('sess-state-derived', derived || staleResult);
      stateChip.dataset.tip = derived
        ? tr('{state} — {activity} (observed by VibeSpace; the agent can set its own state with vibespace-status). Click to set manually.', { state: meta.label, activity: waiting ? tr('finished, waiting for you') : tr('active') })
        : `${tr('state: {state}', { state: meta.label })}${st.urgency ? tr(' · urgency: {urgency}', { urgency: st.urgency }) : ''}${st.reason ? ' — ' + st.reason : ''}${staleResult ? tr(' (set before the session stopped)') : ''}${tr(' (set by {who}; click to change)', { who: st.setBy === 'agent' ? tr('the agent') : tr('you') })}`;
      stateChip.classList.toggle('sess-state-urgent', st?.urgency === 'urgent');
      stateChip.onclick = (e) => { e.stopPropagation(); state._showSessionStatusPopover?.(stateChip, s); };
    }
  }
  // Custom config marker: shown when this session has persisted model/effort/permission overrides
  const cfgBadge = row.querySelector('.badge-config');
  const updateCfgBadge = () => {
    const cfg = state.getSessionConfig?.(s) || {};
    const acctLabel = cfg.account === 'subscription' ? tr('Subscription')
      : cfg.account ? ((app._accounts?.accounts || []).find(a => a.id === cfg.account)?.name || cfg.account) : null;
    const parts = ['model', 'effort', 'permission'].filter(k => cfg[k]).map(k => `${k}: ${cfg[k]}`);
    if (acctLabel) parts.push(`account: ${acctLabel}`);
    if (!parts.length) { cfgBadge.style.display = 'none'; cfgBadge.textContent = ''; return; }
    cfgBadge.style.display = '';
    // Icon-only: the details live in the tooltip (was showing the full model id,
    // which crowded the row). Hover to see model/effort/permission.
    cfgBadge.dataset.tip = tr('Custom session config — {parts} (click to change)', { parts: parts.join(' · ') });
    cfgBadge.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4l1.4-1.4M11 5l1.4-1.4"/></svg>`;
  };
  updateCfgBadge();
  // Star button (inline, always visible)
  const starBtn = document.createElement('button');
  starBtn.className = 'session-inline-btn' + (starred ? ' starred' : '');
  starBtn.innerHTML = starred ? ICON.starOn : ICON.starOff;
  starBtn.title = starred ? tr('Unstar') : tr('Star');
  starBtn.onclick = (e) => { e.stopPropagation(); state.toggleStar(s); };
  row.insertBefore(starBtn, row.firstChild);
  // Archive button (inline, always visible). In manage mode it becomes a
  // MARK toggle — same position, so entering manage mode doesn't reshuffle
  // the controls the user already knows.
  const manageKey = state._getSessionStateKey(s) || s.sessionId;
  const mark = state._manageMode ? (state._manageMarks?.get(manageKey) || {}) : null;
  const archBtn = document.createElement('button');
  if (mark) {
    archBtn.className = 'session-inline-btn session-mark-toggle' + (mark.archive ? ' mark-on' : '');
    archBtn.innerHTML = isArchived ? ICON.unarchive : ICON.archive;
    archBtn.title = isArchived ? tr('Mark to unarchive') : tr('Mark to archive');
    archBtn.onclick = (e) => { e.stopPropagation(); state._toggleManageMark(manageKey, 'archive'); };
  } else {
    archBtn.className = 'session-inline-btn' + (isArchived ? ' archived' : '');
    archBtn.innerHTML = isArchived ? ICON.unarchive : ICON.archive;
    archBtn.title = isArchived ? tr('Unarchive') : tr('Archive');
    archBtn.onclick = (e) => { e.stopPropagation(); state.toggleArchive(s); };
  }
  row.insertBefore(archBtn, row.children[1]);
  // Manage mode: a terminate-mark button right next to archive (running only)
  if (mark && s.status !== 'stopped') {
    const termMark = document.createElement('button');
    termMark.className = 'session-inline-btn session-mark-toggle session-term-mark' + (mark.terminate ? ' mark-on' : '');
    termMark.innerHTML = ICON.terminate;
    termMark.title = tr('Mark to terminate');
    termMark.onclick = (e) => { e.stopPropagation(); state._toggleManageMark(manageKey, 'terminate'); };
    row.insertBefore(termMark, row.children[2]);
  }
  if (mark && (mark.terminate || mark.archive)) card.classList.add('manage-marked');
  // Composite icon: mode shape (chat/terminal) + backend logo inside
  // For live sessions with known mode: composite icon before name
  // For stopped/external: plain backend icon before name
  if (s.webuiMode) {
    const compositeIcon = createModeBackendIcon(s.backend || 'claude', s.webuiMode, {
      className: 'session-composite-icon',
      title: `${backendMeta.label} ${s.webuiMode === 'chat' ? tr('Chat') : tr('Terminal')}`,
    });
    row.insertBefore(compositeIcon, row.querySelector('.session-card-lines'));
  } else {
    const backendIcon = createBackendIcon(s.backend || 'claude', {
      className: 'session-backend-icon',
      title: backendMeta.label,
    });
    row.insertBefore(backendIcon, row.querySelector('.session-card-lines'));
  }

  if (showAgentKind) {
    const agentKindIcon = createAgentKindIcon(s.agentKind || 'primary', {
      className: 'session-agent-kind-icon',
      title: agentKindMeta.label,
    });
    row.insertBefore(agentKindIcon, row.querySelector('.session-card-lines'));
  }

  // Expand/collapse button on the right side, after badge
  const expandBtn = document.createElement('button');
  expandBtn.className = 'session-expand-btn';
  expandBtn.textContent = expandedCardId === s.sessionId ? '\u25BE' : '\u25B8';
  expandBtn.title = tr('Show details');
  expandBtn.onclick = (e) => {
    e.stopPropagation();
    if (expandedCardId === s.sessionId) {
      onExpandToggle(null);
    } else {
      onExpandToggle(s.sessionId);
    }
  };
  card.querySelector('.session-card-main').appendChild(expandBtn);

  // Detail panel (shown when expanded)
  const detailPanel = document.createElement('div');
  detailPanel.className = 'session-card-detail';

  const visibleFields = settings?.get('sessionCard.visibleFields') ?? ['id', 'backend', 'cwd', 'started', 'status', 'groups'];
  const clickToCopy = settings?.get('sessionCard.clickToCopy') ?? false;
  const truncation = settings?.get('sessionCard.detailTruncation') ?? 'left';
  const cwdShort = (s.cwd || '').replace(/^\/home\/[^/]+/, '~').replace(/^\/Users\/[^/]+/, '~');

  const fields = [
    { key: 'id', label: tr('ID'), display: s.sessionId, copy: s.sessionId, copiable: true, midTruncate: true },
    { key: 'backend', label: tr('Agent'), display: [backendMeta.label, showAgentKind ? agentKindMeta.label : null, agentRoleLabel, s.agentNickname || null].filter(Boolean).join(' / '), copy: [backendMeta.label, showAgentKind ? agentKindMeta.label : null, agentRoleLabel, s.agentNickname || null].filter(Boolean).join(' / ') },
    { key: 'cwd', label: tr('CWD'), display: cwdShort, copy: s.cwd || '', copiable: true, leftTruncate: true },
    { key: 'started', label: tr('Started'), display: date.toLocaleString(), copy: date.toISOString() },
    { key: 'status', label: tr('Status'), display: null, badge: true, copy: `${s.status}${s.pid ? ' PID ' + s.pid : ''}` },
  ];

  for (const f of fields) {
    if (!visibleFields.includes(f.key)) continue;
    const row = document.createElement('div'); row.className = 'session-detail-row';
    row.style.position = 'relative';
    const lbl = document.createElement('span'); lbl.className = 'session-detail-label'; lbl.textContent = f.label;
    const val = document.createElement('span'); val.className = 'session-detail-value';
    if (f.badge) {
      val.innerHTML = `<span class="session-card-badge ${badge.cls}">${badge.text}</span>`;
    } else if (f.midTruncate && f.display.length > 12) {
      // Middle truncation: flexible head (ellipsis) + fixed tail
      val.classList.add('session-detail-mid-truncate');
      const head = document.createElement('span'); head.className = 'mid-truncate-head'; head.textContent = f.display.slice(0, -4);
      const tail = document.createElement('span'); tail.className = 'mid-truncate-tail'; tail.textContent = f.display.slice(-4);
      val.append(head, tail);
    } else {
      val.textContent = f.display;
      val.style.display = 'block';
      if (f.leftTruncate) { val.style.direction = 'rtl'; val.style.unicodeBidi = 'plaintext'; }
    }
    if (f.copiable || clickToCopy) {
      val.classList.add('session-detail-copyable');
      val.title = f.copy;
      val.onclick = (e) => {
        e.stopPropagation();
        copyText(f.copy).then(() => {
          const tip = document.createElement('span');
          tip.className = 'session-detail-tooltip';
          tip.textContent = tr('Copied!');
          row.appendChild(tip);
          setTimeout(() => tip.remove(), 1000);
        });
      };
    }
    row.append(lbl, val);
    detailPanel.appendChild(row);
  }

  // Session status row — view/adjust the agent-set (or your) status indicator
  {
    const row = document.createElement('div');
    row.className = 'session-detail-row';
    const lbl = document.createElement('span'); lbl.className = 'session-detail-label'; lbl.textContent = tr('Status');
    const val = document.createElement('span'); val.className = 'session-detail-value';
    val.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const st = state.getSessionStatus?.(s);
    val.textContent = st && (st.state || st.urgency)
      ? `${st.state || ''}${st.urgency ? (st.state ? ' / ' : '') + st.urgency : ''}${st.reason ? ' — ' + st.reason : ''} (${st.setBy === 'agent' ? tr('agent') : tr('you')})`
      : tr('None');
    if (st?.reason) val.title = st.reason;
    const btn = document.createElement('button');
    btn.className = 'session-detail-btn';
    btn.textContent = '\u25be';
    btn.style.cssText = 'padding:1px 6px;font-size:10px;min-width:0';
    btn.onclick = (e) => { e.stopPropagation(); state._showSessionStatusPopover?.(btn, s); };
    row.append(lbl, val, btn);
    detailPanel.appendChild(row);
  }

  // Groups section
  if (visibleFields.includes('groups')) {
    const groupsContainer = document.createElement('div'); groupsContainer.className = 'session-detail-groups';
    detailPanel.appendChild(groupsContainer);
    renderDetailGroups(groupsContainer, s, clickToCopy, state);
  }

  // Status HISTORY timeline (replaced the agent-TODO Steps replay — the raw
  // todo dump read as noise; the vibespace-status trail is the meaningful
  // "what happened here" record). Newest first, lazily fetched on expand.
  // The live todo summary stays available as the row pill.
  if (expandedCardId === s.sessionId) {
    const histWrap = document.createElement('div');
    histWrap.className = 'session-detail-steps';
    detailPanel.appendChild(histWrap);
    const keys = [state._getSessionStateKey(s), s.webuiId ? 'webui:' + s.webuiId : null].filter(Boolean).join(',');
    fetch(`/api/session-status/history?sessionKey=${encodeURIComponent(keys)}`)
      .then(r => r.json()).then(d => {
        const hist = (d?.history || []).slice(-15).reverse();
        if (!hist.length || !histWrap.isConnected) return;
        const row = document.createElement('div'); row.className = 'session-detail-row';
        row.innerHTML = `<span class="session-detail-label">${tr('History')}</span>`;
        const list = document.createElement('div'); list.className = 'session-history-list';
        const today = new Date().toDateString();
        for (const h of hist) {
          const li = document.createElement('div');
          li.className = 'session-history-item';
          const when = new Date(h.at);
          const t = (when.toDateString() === today ? '' : (when.getMonth() + 1) + '/' + when.getDate() + ' ')
            + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const meta = h.state ? (SESSION_STATE_META[h.state] || { label: h.state, color: 'var(--text-dim)' }) : null;
          li.innerHTML = `<span class="session-history-time">${escHtml(t)}</span>`
            + `<span class="session-history-dot" style="--h-color:${meta ? meta.color : 'var(--text-dim)'}"></span>`
            + `<span class="session-history-state">${escHtml(h.cleared ? tr('cleared') : (meta?.label || ''))}${h.urgency && h.urgency !== 'normal' ? ' !' + (h.urgency === 'urgent' ? '!' : '') : ''}</span>`
            + (h.reason ? `<span class="session-history-reason" title="${escHtml(h.reason)}">${escHtml(h.reason)}</span>` : '')
            + `<span class="session-history-by">${h.setBy === 'user' ? tr('you') : tr('agent')}</span>`;
          list.appendChild(li);
        }
        row.appendChild(list);
        histWrap.appendChild(row);
      }).catch(() => {});
  }

  const actionsDiv = document.createElement('div'); actionsDiv.className = 'session-detail-actions';
  detailPanel.appendChild(actionsDiv);

  // Rename button
  const detailRenameBtn = document.createElement('button');
  detailRenameBtn.className = 'session-detail-btn';
  detailRenameBtn.innerHTML = ICON.rename + ' ' + tr('Rename');
  detailRenameBtn.onclick = (e) => { e.stopPropagation(); onRename(s, originalName); };
  actionsDiv.appendChild(detailRenameBtn);

  // Find / GoTo split button
  if (s.webuiId) {
    const findWrap = document.createElement('div');
    findWrap.className = 'session-resume-split';
    const findBtn = document.createElement('button');
    findBtn.className = 'session-detail-btn';
    const findDrop = document.createElement('button');
    findDrop.className = 'session-resume-drop session-find-drop';
    const getFindMode = () => settings?.get('sessionCard.findMode') ?? 'find';
    const updateFindLabel = () => {
      const m = getFindMode();
      findBtn.innerHTML = m === 'goto' ? (ICON.goto + ' ' + tr('GoTo')) : (ICON.find + ' ' + tr('Find'));
    };
    updateFindLabel();
    findBtn.onclick = (e) => {
      e.stopPropagation();
      if (getFindMode() === 'goto') app.goToWindow(s.webuiId);
      else app.flashWindow(s.webuiId);
    };
    findDrop.textContent = '\u25BE';
    findDrop.onclick = (e) => {
      e.stopPropagation();
      settings?.set('sessionCard.findMode', getFindMode() === 'goto' ? 'find' : 'goto');
      updateFindLabel();
    };
    findWrap.append(findBtn, findDrop);
    actionsDiv.appendChild(findWrap);

    // Move: attach the window to the cursor, click to place — the recovery
    // path for a window accidentally dragged off-screen (pointer-only, so
    // desktop only)
    if (!app.isMobile) {
      const moveBtn = document.createElement('button');
      moveBtn.className = 'session-detail-btn';
      moveBtn.innerHTML = ICON.move + ' ' + tr('Move');
      moveBtn.title = tr('Move the window with the cursor (recovers off-screen windows)');
      moveBtn.onclick = (e) => { e.stopPropagation(); app.moveSessionWindow(s.webuiId); };
      actionsDiv.appendChild(moveBtn);
    }
  }

  // Resume/Attach action button
  if (s.status === 'live' && s.webuiId) {
    const detailAttachBtn = document.createElement('button');
    detailAttachBtn.className = 'session-detail-btn session-detail-btn-primary';
    detailAttachBtn.innerHTML = ICON.terminal + ' ' + tr('Attach');
    detailAttachBtn.onclick = (e) => { e.stopPropagation(); app.attachSession(s.webuiId, s.webuiName || displayName, s.cwd, { mode: s.webuiMode, ...agentOpts }); };
    actionsDiv.appendChild(detailAttachBtn);
  } else if (s.status === 'tmux') {
    const detailTmuxBtn = document.createElement('button');
    detailTmuxBtn.className = 'session-detail-btn session-detail-btn-primary';
    detailTmuxBtn.innerHTML = ICON.terminal + ' ' + tr('View');
    detailTmuxBtn.onclick = (e) => { e.stopPropagation(); app.attachTmuxSession(s.tmuxTarget, displayName, s.cwd); };
    actionsDiv.appendChild(detailTmuxBtn);
  } else if (s.status === 'stopped') {
    const savedMode = state.getSessionMode(s);
    const defaultMode = settings?.get('session.defaultMode') ?? 'terminal';
    let resumeMode = savedMode || defaultMode;

    // Per-session config (model / effort / permission) — popover
    const backend = s.backend || 'claude';
    const opts = app.getSessionOptions(backend);
    const prefix = backend === 'codex' ? 'codex' : 'claude';
    const defaults = {
      model: settings?.get(`${prefix}.defaultModel`) ?? '',
      effort: settings?.get(`${prefix}.defaultEffort`) ?? '',
      permission: settings?.get(`${prefix}.defaultPermissionMode`) ?? '',
    };
    // Overrides are persisted per-session in user state (survives sidebar re-renders
    // and applies to ALL resume paths via app.resumeSession's savedCfg lookup).
    // Empty string = no override (use global default).
    const savedCfg = state.getSessionConfig?.(s) || {};
    const overrides = { model: savedCfg.model || '', effort: savedCfg.effort || '', permission: savedCfg.permission || '', account: savedCfg.account || '' };
    const persistOverrides = () => {
      state.setSessionConfig?.(s, overrides);
      updateCfgBadge();
    };

    const resumeWrap = document.createElement('div');
    resumeWrap.className = 'session-resume-split';

    const resumeBtn = document.createElement('button');
    const dropBtn = document.createElement('button');
    const updateLabel = () => {
      const isChat = resumeMode === 'chat';
      resumeBtn.innerHTML = isChat ? (ICON.chat + ' ' + tr('Resume in Chat')) : (ICON.terminal + ' ' + tr('Resume in Terminal'));
      resumeBtn.className = 'session-detail-btn ' + (isChat ? 'session-detail-btn-chat' : 'session-detail-btn-primary');
      dropBtn.className = 'session-resume-drop ' + (isChat ? 'session-detail-btn-chat' : 'session-detail-btn-primary');
    };
    updateLabel();
    resumeBtn.onclick = (e) => {
      e.stopPropagation();
      app.resumeSession(s.sessionId, s.cwd, customName || s.name, {
        mode: resumeMode,
        model: overrides.model || undefined,
        effort: overrides.effort || undefined,
        permission: overrides.permission || undefined,
        accountId: overrides.account || undefined,
        ...agentOpts,
      });
    };

    dropBtn.textContent = '\u25BE';
    dropBtn.onclick = (e) => {
      e.stopPropagation();
      resumeMode = resumeMode === 'chat' ? 'terminal' : 'chat';
      state.setSessionMode(s, resumeMode);
      updateLabel();
    };

    // Config button (gear) — opens popover for model/effort/permission
    const configBtn = document.createElement('button');
    configBtn.className = 'session-resume-drop ' + (resumeMode === 'chat' ? 'session-detail-btn-chat' : 'session-detail-btn-primary');
    configBtn.innerHTML = '<svg style="width:10px;height:10px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9"/><path d="M6.5 1.5h3l.3 1.5.8.3 1.3-.8 2.1 2.1-.8 1.3.3.8 1.5.3v3l-1.5.3-.3.8.8 1.3-2.1 2.1-1.3-.8-.8.3-.3 1.5h-3l-.3-1.5-.8-.3-1.3.8-2.1-2.1.8-1.3-.3-.8L1.5 9.5v-3l1.5-.3.3-.8-.8-1.3 2.1-2.1 1.3.8.8-.3z"/></svg>';
    configBtn.title = tr('Session parameters');
    configBtn.style.borderLeft = '1px solid var(--border)';
    configBtn.onclick = (e) => {
      e.stopPropagation();
      _showConfigPopover(configBtn);
    };

    const _showConfigPopover = (anchor) => {
      const pop = createPopover(anchor, 'session-config-popover');

      const makeRow = (label, options, key, isModel) => {
        const curVal = overrides[key];
        const defaultVal = defaults[key];
        const isDefault = !curVal || curVal === defaultVal;
        const row = document.createElement('div'); row.className = 'session-config-row';
        const cb = document.createElement('input'); cb.type = 'checkbox';
        cb.className = 'session-config-cb'; cb.checked = !isDefault;
        cb.title = cb.checked ? tr('Uncheck to use global default') : tr('Check to override');
        const lbl = document.createElement('span'); lbl.className = 'session-config-label'; lbl.textContent = label;
        const sel = document.createElement('select'); sel.className = 'session-config-select';
        for (const opt of options) {
          const o = document.createElement('option');
          o.value = opt.value || opt.id || '';
          o.textContent = opt.label || opt.value || tr('Default');
          if (String(o.value) === String(isDefault ? defaultVal : curVal)) o.selected = true;
          sel.appendChild(o);
        }
        // All rows support Custom... for free-form input (model IDs, effort levels like xhigh, etc.)
        const customOpt = document.createElement('option'); customOpt.value = '__custom__'; customOpt.textContent = tr('Custom...');
        sel.appendChild(customOpt);
        const input = document.createElement('input'); input.type = 'text'; input.className = 'session-config-input';
        input.placeholder = isModel ? 'e.g. claude-opus-4-6' : 'e.g. xhigh';
        const known = options.map(o => o.value || o.id || '');
        const cv = isDefault ? defaultVal : curVal;
        if (cv && !known.includes(cv)) {
          sel.value = '__custom__'; input.value = cv; input.style.display = '';
        } else { input.style.display = 'none'; }
        sel.onchange = () => {
          if (sel.value === '__custom__') { input.style.display = ''; input.focus(); overrides[key] = input.value; }
          else { input.style.display = 'none'; overrides[key] = sel.value; }
          if (!cb.checked) { cb.checked = true; applyDisabled(); }
          persistOverrides();
        };
        input.onchange = () => { overrides[key] = input.value; if (!cb.checked) { cb.checked = true; applyDisabled(); } persistOverrides(); };
        const applyDisabled = () => {
          const disabled = !cb.checked;
          sel.disabled = disabled;
          if (input) input.disabled = disabled;
          row.classList.toggle('session-config-disabled', disabled);
          if (disabled) overrides[key] = ''; // revert to global default
        };
        cb.onchange = () => {
          applyDisabled();
          if (cb.checked) { overrides[key] = sel.value === '__custom__' ? (input?.value || '') : sel.value; }
          persistOverrides();
        };
        row.append(cb, lbl, sel);
        if (input) row.appendChild(input);
        applyDisabled();
        return row;
      };

      pop.appendChild(makeRow(tr('Model'), opts.models, 'model', true));
      pop.appendChild(makeRow(tr('Effort'), opts.efforts, 'effort'));
      pop.appendChild(makeRow(tr('Permission'), opts.permissions, 'permission'));
      // Account (billing identity) — local Claude sessions only. Resume with a
      // different account = the quota-escape hatch: subscription limit hit →
      // switch to an API key here and Resume, the conversation continues on
      // API billing.
      const acctList = app._accounts?.accounts || [];
      if (backend === 'claude' && acctList.length) {
        pop.appendChild(makeRow(tr('Account'), [
          { value: 'subscription', label: tr('Subscription (Pro/Max)') },
          ...acctList.map(a => ({ value: a.id, label: a.type === 'subscription' ? `${a.name} (${tr('subscription')})` : `${a.name} — API …${a.tail}` })),
        ], 'account'));
      }
    };

    resumeWrap.append(resumeBtn, dropBtn, configBtn);
    actionsDiv.appendChild(resumeWrap);

    // View History button (read-only, no resume)
    const viewBtn = document.createElement('button');
    viewBtn.className = 'session-detail-btn';
    viewBtn.innerHTML = ICON.history + ' ' + tr('View History');
    viewBtn.onclick = (e) => {
      e.stopPropagation();
      app.viewSession(s.sessionId, s.cwd, customName || s.name, {
        ...agentOpts,
      });
    };
    actionsDiv.appendChild(viewBtn);

    // Fork button
    const forkBtn = document.createElement('button');
    forkBtn.className = 'session-detail-btn';
    forkBtn.innerHTML = ICON.fork + ' ' + tr('Fork');
    forkBtn.onclick = (e) => { e.stopPropagation(); app.forkSession(s); };
    actionsDiv.appendChild(forkBtn);
  }

  // Properties — the full reference sheet for this session (identity, billing,
  // state history, groups, agent steps). Everything the card can't fit.
  const propsBtn = document.createElement('button');
  propsBtn.className = 'session-detail-btn';
  propsBtn.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4M8 4.8v.2"/></svg> ' + tr('Properties');
  propsBtn.onclick = (e) => { e.stopPropagation(); app.openSessionProps(s); };
  actionsDiv.appendChild(propsBtn);

  // Terminate button (for any running session)
  if (s.status !== 'stopped') {
    const terminateBtn = document.createElement('button');
    terminateBtn.className = 'session-detail-btn';
    terminateBtn.style.color = 'var(--red, #e55)';
    terminateBtn.innerHTML = ICON.terminate + ' ' + tr('Terminate');
    terminateBtn.onclick = async (e) => {
      e.stopPropagation();
      const ok = await showConfirmDialog({ title: tr('Terminate Session'), message: tr('Terminate session "{name}"? The running agent process will be killed.', { name: displayName }), confirmText: tr('Terminate'), danger: true });
      if (!ok) return;
      if (s.webuiId) app.killSession(s.webuiId);
      else if (s.pid) app.killPid(s.pid);
    };
    actionsDiv.appendChild(terminateBtn);
  }

  card.appendChild(detailPanel);

  // Right-click (long-press on touch): quick actions without expanding the
  // card. Everything here calls the SAME handlers as the expanded buttons.
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items = [];
    if (s.status === 'live' && s.webuiId) {
      items.push({ label: tr('Focus window'), action: () => app.attachSession(s.webuiId, s.webuiName || displayName, s.cwd, { mode: s.webuiMode, ...agentOpts }) });
    } else if (s.status === 'tmux') {
      items.push({ label: tr('View (tmux)'), action: () => app.attachTmuxSession(s.tmuxTarget, displayName, s.cwd) });
    } else if (s.status === 'stopped') {
      const cfgA = state.getSessionConfig?.(s) || {};
      const resumeWith = (mode) => app.resumeSession(s.sessionId, s.cwd, customName || s.name, { mode, accountId: cfgA.account || undefined, ...agentOpts });
      items.push({ label: tr('Resume in Chat'), action: () => resumeWith('chat') });
      items.push({ label: tr('Resume in Terminal'), action: () => resumeWith('terminal') });
    }
    items.push({ label: tr('View History'), action: () => app.viewSession(s.sessionId, s.cwd, customName || s.name, { ...agentOpts }) });
    if ((s.backend || 'claude') === 'claude' && s.status !== 'external') items.push({ label: tr('Fork…'), action: () => app.forkSession(s) });
    items.push({ separator: true });
    items.push({ label: state.isStarred(s) ? tr('Unstar') : tr('Star'), action: () => state.toggleStar(s) });
    items.push({ label: state.isArchived(s) ? tr('Unarchive') : tr('Archive'), action: () => state.toggleArchive(s) });
    items.push({ label: tr('Rename…'), action: () => onRename(s, originalName) });
    items.push({ label: tr('Set status…'), action: () => state._showSessionStatusPopover?.(card, s) });
    const groups = (state._tasks || []).filter(t => !t.archived);
    if (groups.length) {
      const explicitIds = new Set((state._getSessionTasks?.(s) || []).map(t => t.id));
      const folderIds = new Set((state._getSessionTaskGroups?.(s) || []).map(t => t.id));
      items.push({
        label: tr('Task Groups'),
        children: groups.map(t => ({
          label: (explicitIds.has(t.id) ? '✓ ' : folderIds.has(t.id) ? '◇ ' : ' ') + t.title + (!explicitIds.has(t.id) && folderIds.has(t.id) ? tr(' (folder)') : ''),
          disabled: !explicitIds.has(t.id) && folderIds.has(t.id),
          action: () => { explicitIds.has(t.id) ? state._taskUnbind(t.id, s) : state._taskBind(t.id, s); },
        })),
      });
    }
    items.push({ separator: true });
    items.push({ label: tr('Copy session ID'), action: () => copyText(s.sessionId || '') });
    items.push({ label: tr('Copy path'), action: () => copyText(s.cwd || '') });
    // Host-aware: a remote session's cwd opens in the explorer ON its host
    if (s.cwd) items.push({ label: tr('Open working directory'), action: () => app.openFileExplorer(s.cwd, { host: s.host || undefined }) });
    if (s.webuiId) {
      items.push({ label: tr('Find window'), action: () => app.flashWindow(s.webuiId) });
      items.push({ label: tr('Go to window'), action: () => app.goToWindow(s.webuiId) });
      if (!app.isMobile) items.push({ label: tr('Move window…'), action: () => app.moveSessionWindow(s.webuiId) });
    }
    items.push({ separator: true });
    items.push({ label: tr('Properties…'), action: () => app.openSessionProps(s) });
    if (s.status !== 'stopped') {
      items.push({
        label: tr('Terminate'), style: 'color: var(--red, #e55)',
        action: async () => {
          const ok = await showConfirmDialog({ title: tr('Terminate Session'), message: tr('Terminate session "{name}"? The running agent process will be killed.', { name: displayName }), confirmText: tr('Terminate'), danger: true });
          if (!ok) return;
          if (s.webuiId) app.killSession(s.webuiId);
          else if (s.pid) app.killPid(s.pid);
        },
      });
    }
    showContextMenu(e.clientX, e.clientY, items);
  });

  // Double-click name to rename (sets --name for next resume)
  const nameEl = card.querySelector('.session-card-name');
  if (nameEl) {
    if (customName) nameEl.title = tr('Custom name (--name on resume). Original: {name}', { name: originalName });
    nameEl.addEventListener('dblclick', (e) => { e.stopPropagation(); onRename(s, originalName); });
  }

  const clickBehavior = settings?.get('sessionCard.clickBehavior') ?? 'focus';
  if (s.status === 'external') {
    card.style.opacity = '0.7';
    if (clickBehavior === 'focus') card.style.cursor = 'default';
    card.title = tr('Running in unsupported terminal (PID {pid})', { pid: s.pid || '?' });
  }
  if (clickBehavior === 'expand') {
    // Click expands/collapses; use buttons inside detail to open/resume
    card.onclick = (e) => {
      if (e.target.closest('.session-detail-btn') || e.target.closest('.session-inline-btn') || e.target.closest('.session-expand-btn') || e.target.closest('.session-detail-copyable')) return;
      if (expandedCardId === s.sessionId) {
        onExpandToggle(null);
      } else {
        onExpandToggle(s.sessionId);
      }
    };
  } else if (clickBehavior === 'flash') {
    card.onclick = (e) => {
      if (e.target.closest('.session-detail-btn') || e.target.closest('.session-inline-btn') || e.target.closest('.session-expand-btn') || e.target.closest('.session-detail-copyable')) return;
      if (s.webuiId) app.flashWindow(s.webuiId);
      else if (s.status === 'tmux') app.attachTmuxSession(s.tmuxTarget, displayName, s.cwd);
      else if (s.status === 'stopped') app.resumeSession(s.sessionId, s.cwd, customName || s.name, { ...agentOpts });
    };
  } else if (clickBehavior === 'goto') {
    card.onclick = (e) => {
      if (e.target.closest('.session-detail-btn') || e.target.closest('.session-inline-btn') || e.target.closest('.session-expand-btn') || e.target.closest('.session-detail-copyable')) return;
      if (s.webuiId) app.goToWindow(s.webuiId);
      else if (s.status === 'tmux') app.attachTmuxSession(s.tmuxTarget, displayName, s.cwd);
      else if (s.status === 'stopped') app.resumeSession(s.sessionId, s.cwd, customName || s.name, { ...agentOpts });
    };
  } else {
    // Default 'focus': click opens/resumes directly
    if (s.status === 'live' && s.webuiId) {
      card.onclick = () => app.attachSession(s.webuiId, s.webuiName || displayName, s.cwd, { mode: s.webuiMode, ...agentOpts });
    } else if (s.status === 'tmux') {
      card.onclick = () => app.attachTmuxSession(s.tmuxTarget, displayName, s.cwd);
      card.title = tr("Running in tmux \u2014 click to view (closing won't kill it)");
    } else if (s.status === 'live') {
      // LIVE but no window open (e.g. layout didn't restore it) — click to attach
      card.onclick = () => app.attachSession(s.webuiId, s.webuiName || displayName, s.cwd, { mode: s.webuiMode, ...agentOpts });
    } else if (s.status === 'stopped') {
      card.onclick = () => app.resumeSession(s.sessionId, s.cwd, customName || s.name, {
        ...agentOpts,
      });
    }
  }
  // Adaptive tags (per-card, content-driven — not a fixed width threshold):
  // collapse the status chip to ICON-only when the tags (at full text width)
  // are as wide as the title's CURRENTLY DISPLAYED area — the name is flex and
  // its area shrinks as the tags grow, so we compare against `clientWidth` (the
  // shown title width), not `scrollWidth` (the full untruncated text). When the
  // tags reach the title area, they'd be out-widthing what's actually shown, so
  // switch them to icons to give the title back its room. Re-measured on any
  // width change (sidebar resize, folder expand).
  const fitTags = () => {
    const name = card.querySelector('.session-card-name');
    const main = card.querySelector('.session-card-main');
    if (!name || !main || !name.isConnected || name.offsetParent === null) return; // hidden/detached
    card.classList.remove('tags-icon'); // measure tags at full (text) width — sync reflow, no paint
    let tagsW = 0;
    for (const el of main.children) {
      if (el === name || el.classList.contains('session-conn-dot') || el.classList.contains('session-expand-btn')) continue;
      if (getComputedStyle(el).display === 'none') continue;
      tagsW += el.offsetWidth;
    }
    if (tagsW >= name.clientWidth) card.classList.add('tags-icon'); // tags reached the displayed title area
  };
  card._fitTags = fitTags;
  requestAnimationFrame(fitTags);
  try { const ro = new ResizeObserver(fitTags); ro.observe(card); card._tagsRO = ro; } catch {}

  return card;
}
