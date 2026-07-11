// Session lifecycle: create/attach/resume/fork/view/kill + billing switcher + openSpec replay (mixin split from app.js, 2.82.0 audit seam).
import { ChatView } from './chat-view.js';
import { track, metric } from './telemetry-client.js';
import { t } from './i18n.js';
import { TerminalSession } from './terminal.js';
import { showConfirmDialog, showContextMenu, showToast } from './utils.js';

export function installSessionLifecycle(App, ctx = {}) {
  Object.assign(App.prototype, {
  // management. Optional initialCommand is typed for the user once the shell
  // is up (e.g. the in-product "Log in to Claude" helper).
  openShellTerminal(cwd, { initialCommand, hostId } = {}) {
    this.createSession({
      backend: 'shell', mode: 'terminal', cwd: cwd || undefined, hostId,
      name: initialCommand ? initialCommand.split(' ')[0] : 'Terminal',
      model: null, permission: null, effort: null, extraArgs: '',
      initialCommand,
    });
  },

  createSession({ cwd, name, model, permission, extraArgs, resumeId, mode, syncId, effort, fork, hostId, backend = 'claude', backendSessionId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId, initialMessage, initialCommand, forkAtUuid, forkTitle, taskId, accountId, ephemeral = false, winBounds }) {
    try { track('event', `session-create:${backend || 'claude'}:${mode || 'default'}`); } catch {}
    this._hideWelcome();
    const defaults = this._getBackendSessionDefaults(backend);
    const sessionMode = mode || this.settings.get('session.defaultMode') || 'chat';
    const sessionModel = model !== undefined ? model : defaults.model;
    const sessionPermission = permission !== undefined ? permission : defaults.permission;
    const sessionEffort = effort !== undefined ? effort : defaults.effort;
    const sessionExtraArgs = extraArgs !== undefined ? extraArgs : defaults.extraArgs;
    const sessionName = name || (resumeId ? t('Resume {id}', { id: resumeId.substring(0,8) }) : t('Session {n}', { n: this.wm.windowCounter+1 }));
    const sessionKey = backendSessionId || resumeId ? `${backend}:${backendSessionId || resumeId}` : '';
    const winType = sessionMode === 'chat' ? 'chat' : 'terminal';
    const titleMeta = this._buildTitleMeta({ backend, agentKind, agentRole, agentNickname, sourceKind, parentThreadId });
    const winInfo = this.wm.createWindow({ title: sessionName, type: winType, syncId, titleMeta });
    // Geometry carried over from a window this session replaces (billing
    // switch kill+resume, resume of a terminated read-only window) — without
    // it the conversation "moves" into a default-sized centered window.
    if (winBounds) {
      if (winBounds.gridBounds) { winInfo.gridBounds = { ...winBounds.gridBounds }; this.wm._applyGridBounds(winInfo); }
      if (winBounds.preSnapBounds) winInfo.preSnapBounds = { ...winBounds.preSnapBounds };
      if (winBounds.isMaximized) this.wm.toggleMaximize(winInfo.id);
    }
    // Correlation id: concurrent creates (e.g. group resume-all) must each
    // match their OWN 'created' reply — an untagged match binds the ChatView
    // to whichever session the server happens to answer first.
    const reqId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const _createT0 = performance.now();

    this.ws.send({
      type:'create', backend, hostId: hostId||undefined, mode: sessionMode, cwd: cwd||undefined, sessionName: name||undefined, model: sessionModel||undefined,
      permissionMode: sessionPermission||undefined, effort: sessionEffort||undefined, extraArgs: sessionExtraArgs||undefined,
      tuiRenderer: (backend === 'claude' && sessionMode === 'terminal' ? this.settings.get('claude.tuiRenderer') : '') || undefined,
      agentKind: agentKind || undefined, agentRole: agentRole || undefined, agentNickname: agentNickname || undefined,
      sourceKind: sourceKind || undefined, parentThreadId: parentThreadId || undefined,
      resume: !!resumeId, resumeId: resumeId||undefined, fork: fork||undefined, cols:120, rows:30, reqId,
      taskId: taskId || undefined, // spawns VIBESPACE_TASK_ID into the agent env
      accountId: accountId || undefined, // billing identity: undefined=server default, 'subscription', or acct-… key id
    });

    const handler = (msg) => {
      // Window closed before the server answered — clean up the handler so it
      // doesn't hold winInfo forever (and can't bind a session to a dead window)
      if (!this.wm.windows.has(winInfo.id)) { this.ws.offGlobal(handler); return; }
      if (msg.type === 'created' && msg.reqId === reqId) {
        metric('session-create-roundtrip-ms', performance.now() - _createT0);
        // Set openSpec now that we have the server session ID (for cross-client sync)
        winInfo._openSpec = {
          action: 'attachSession',
          serverId: msg.sessionId,
          backend,
          backendSessionId: backendSessionId || resumeId || null,
          sessionKey,
          agentKind: agentKind || 'primary',
          agentRole: agentRole || '',
          agentNickname: agentNickname || '',
          sourceKind: sourceKind || '',
          parentThreadId: parentThreadId || null,
          name: sessionName,
          cwd: msg.cwd || cwd || '',
          mode: sessionMode,
        };
        this.layoutManager.scheduleAutoSave(); // re-broadcast with openSpec
        // Persist a fork's chosen title as a custom name once the fork's NEW
        // backend id is adopted (after its first turn). Keyed by webui id; the
        // parent id is remembered so we don't rename the parent before divergence.
        if (forkTitle && resumeId) {
          (this._pendingForkTitles ??= new Map()).set(msg.sessionId, { name: forkTitle, parentId: backendSessionId || resumeId });
        }
        // Same for a USER-TYPED name on a brand-new session (New Session dialog):
        // the window title carried it, but the sidebar names sessions from the
        // first user message unless a CUSTOM NAME exists — so the typed name
        // silently lost to the first message once the transcript appeared.
        // Persist it as the custom name when the backend id is adopted.
        else if (name && name.trim() && !resumeId && backend !== 'shell' && !ephemeral) {
          (this._pendingCreateNames ??= new Map()).set(msg.sessionId, name.trim());
        }
        // Session created "in" a task — bind once the backend session id shows
        // up in active-sessions (unknown at creation for claude; folder
        // auto-include already covers tasks with linked folders, this makes
        // the explicit tag stick for folder-less tasks too).
        if (taskId) this.sidebar?._registerPendingTaskBind?.(msg.sessionId, taskId);
        if (msg.mode === 'chat' || sessionMode === 'chat') {
          const chatView = new ChatView(winInfo, this.ws, msg.sessionId, this);
          this.sessions.set(winInfo.id, chatView);
          // Commanded-at-spawn effort (the CLI never reports effort back, so
          // the commanded value is the display source — same as the server's
          // attach-time merge)
          if (sessionEffort) chatView.applyStatus({ effort: sessionEffort });
          winInfo.onClose = () => {
            const shouldKill = (this.settings.get('window.closeBehavior') ?? 'terminate') === 'terminate';
            if (shouldKill) this.ws.send({ type: 'kill', sessionId: msg.sessionId });
            // pending name/fork-title entries otherwise only clear on identity
            // adoption — a window closed before that leaked them forever
            this._pendingForkTitles?.delete(msg.sessionId);
            this._pendingCreateNames?.delete(msg.sessionId);
            chatView.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome();
          };
          winInfo._notifyChanged = () => this.updateTaskbar();
          // Load JSONL history for resumed sessions (truncated at the fork
          // point when forking from a specific message, so the displayed history
          // matches the fork's actual --resume-session-at boundary).
          if (resumeId) {
            fetch(`/api/session-messages?backend=${encodeURIComponent(backend)}&backendSessionId=${encodeURIComponent(backendSessionId || resumeId)}&cwd=${encodeURIComponent(cwd||'')}&withStatus=1${forkAtUuid ? `&untilUuid=${encodeURIComponent(forkAtUuid)}` : ''}`)
              .then(r => r.json())
              .then(data => {
                if (data.messages?.length) chatView.loadHistory(data.messages, data.total);
                if (data.chatStatus) chatView.applyStatus(data.chatStatus);
              })
              .catch(() => {})
              // Send the fork's first message AFTER history renders, so the
              // echoed user message appends instead of being wiped by loadHistory.
              // This first turn is also what makes the fork diverge (claude mints
              // the fork's new id on first input).
              .finally(() => { if (initialMessage) this._sendChatMessage(msg.sessionId, initialMessage); });
          } else if (initialMessage) {
            this._sendChatMessage(msg.sessionId, initialMessage);
          }
          chatView.focus();
        } else {
          const term = new TerminalSession(winInfo, this.ws, msg.sessionId, this.themeManager, (filePath, signalPath) => {
            this._openExternalEditor(filePath, signalPath);
          }, {}, this.settings);
          this.sessions.set(winInfo.id, term);
          // Automation-command terminals (Log in / Update helpers) are
          // throwaway — closing the window should terminate them directly,
          // never leave a detached login shell lingering, regardless of the
          // global close-behavior setting.
          this._wireTerminalWindow(winInfo, term, msg.sessionId, { ephemeral: ephemeral || !!initialCommand });
          // Type a starter command for the user (shell terminals: login helpers
          // etc.) once the shell has had a beat to print its prompt
          if (initialCommand) {
            setTimeout(() => this.ws.send({ type: 'input', sessionId: msg.sessionId, data: initialCommand + '\r' }), 1200);
          }
          term.focus();
        }
        this.wm.setTitle(winInfo.id, `${sessionName} — ${msg.cwd||cwd||'~'}`);
        this.ws.offGlobal(handler);
      }
    };
    this.ws.onGlobal(handler);
  },

  _wireTerminalWindow(winInfo, term, sessionId, { killOnClose = true, ephemeral = false } = {}) {
    winInfo._ephemeral = ephemeral;
    winInfo.onClose = () => {
      // ephemeral (automation helper) terminals always terminate on close;
      // otherwise honor the global close-behavior (terminate vs detach)
      const shouldKill = ephemeral || (killOnClose && (this.settings.get('window.closeBehavior') ?? 'terminate') === 'terminate');
      if (shouldKill) this.ws.send({ type: 'kill', sessionId });
      term.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome();
    };
    winInfo._notifyChanged = () => this.updateTaskbar();
  },

  killSession(webuiId) {
    this.ws.send({ type: 'kill', sessionId: webuiId });
  },

  async killPid(pid) {
    await fetch('/api/kill-pid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid }) });
  },

  // Find existing window for a server session ID and focus it
  _focusExistingSession(serverId) {
    for (const [winId, term] of this.sessions) {
      if (term.sessionId === serverId) {
        this.wm.focusWindow(winId);
        if (this.wm.windows.get(winId)?.isMinimized) this.wm.restore(winId);
        term.focus();
        return true;
      }
    }
    return false;
  },

  _closeSidebarOnMobile() {
    if (window.innerWidth <= 768 && this.sidebar.isOpen) this.sidebar.toggle(false);
  },

  attachSession(serverId, name, cwd, { mode, syncId, backend = 'claude', backendSessionId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId } = {}) {
    this._closeSidebarOnMobile();
    // If we already have a window for this session, just focus it
    if (this._focusExistingSession(serverId)) return null;

    this._hideWelcome();
    const isChat = mode === 'chat';
    const openSpec = {
      action: 'attachSession',
      serverId,
      name,
      cwd,
      mode,
      backend,
      backendSessionId: backendSessionId || null,
      sessionKey: backendSessionId ? `${backend}:${backendSessionId}` : '',
      agentKind: agentKind || 'primary',
      agentRole: agentRole || '',
      agentNickname: agentNickname || '',
      sourceKind: sourceKind || '',
      parentThreadId: parentThreadId || null,
    };
    const winInfo = this.wm.createWindow({
      title: `${name} — ${cwd}`,
      type: isChat ? 'chat' : 'terminal',
      syncId,
      openSpec,
      titleMeta: this._buildTitleMeta(openSpec),
    });

    this.ws.send({ type: 'attach', sessionId: serverId });

    const handler = (msg) => {
      // Window closed before the server answered (esp. slow huge-JSONL attaches):
      // drop the handler so it can't build a ChatView into a dead winInfo and
      // leave a phantom sessions entry that makes the session un-reopenable.
      if (!this.wm.windows.has(winInfo.id)) { this.ws.offGlobal(handler); return; }
      if ((msg.type === 'error') && msg.sessionId === serverId) { this.ws.offGlobal(handler); return; }
      if (msg.type === 'attached' && msg.sessionId === serverId) {
        if (msg.mode === 'chat' || isChat) {
          const chatView = new ChatView(winInfo, this.ws, serverId, this);
          this.sessions.set(winInfo.id, chatView);
          if (msg.messages?.length) {
            chatView.loadHistory(msg.messages, msg.totalCount, msg.isStreaming, { chatStatus: msg.chatStatus, taskState: msg.taskState, turnMap: msg.turnMap, pendingPermissions: msg.pendingPermissions, streamingLabel: msg.streamingLabel, goal: msg.goal, goalElapsed: msg.goalElapsed, goalStatus: msg.goalStatus, normEpoch: msg.normEpoch });
          }
          if (msg.viewOnly) chatView._setReadOnly();
          winInfo.onClose = () => {
            const shouldKill = !msg.viewOnly && (this.settings.get('window.closeBehavior') ?? 'terminate') === 'terminate';
            if (shouldKill) this.ws.send({ type: 'kill', sessionId: serverId });
            chatView.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome();
          };
          winInfo._notifyChanged = () => this.updateTaskbar();
          chatView.focus();
        } else {
          // Terminal mode (existing)
          const term = new TerminalSession(winInfo, this.ws, serverId, this.themeManager, (fp, sp) => this._openExternalEditor(fp, sp), {}, this.settings);
          this.sessions.set(winInfo.id, term);
          if (msg.buffer) {
            const buf = msg.buffer;
            term._suppressWaiting = true;
            // _replaying: suppress xterm's auto-answers to query sequences
            // stored in the buffer (they were answered live long ago — the
            // re-answers echo as ^[]11;rgb:… junk; see terminal.js onData).
            term._replaying = true;
            setTimeout(() => { term.terminal.write(buf, () => { term._suppressWaiting = false; term._replaying = false; term.terminal.scrollToBottom(); term.fit(); }); }, 300);
          }
          this._wireTerminalWindow(winInfo, term, serverId);
          term.focus();
        }
        this.ws.offGlobal(handler);
      }
    };
    this.ws.onGlobal(handler);
    return winInfo;
  },

  attachTmuxSession(tmuxTarget, name, cwd) {
    this._closeSidebarOnMobile();
    // Check if already viewing this tmux target
    for (const [winId, term] of this.sessions) {
      if (term._tmuxTarget === tmuxTarget) {
        this.wm.focusWindow(winId);
        if (this.wm.windows.get(winId)?.isMinimized) this.wm.restore(winId);
        term.focus(); return;
      }
    }

    this._hideWelcome();
    // openSpec from creation: without it, another client's layout-sync diff
    // sees an unknown window and closes it (tmux views were killed on the
    // first remote broadcast)
    const winInfo = this.wm.createWindow({ title: `[tmux] ${name}`, type: 'terminal', openSpec: { action: 'attachTmuxSession', tmuxTarget, name, cwd } });
    const reqId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    this.ws.send({ type: 'tmux-attach', tmuxTarget, name, cwd, cols: 120, rows: 30, reqId });

    const handler = (msg) => {
      if (!this.wm.windows.has(winInfo.id)) { this.ws.offGlobal(handler); return; }
      if (msg.type === 'created' && msg.isTmuxView && msg.reqId === reqId) {
        const term = new TerminalSession(winInfo, this.ws, msg.sessionId, this.themeManager, null, {}, this.settings);
        term._tmuxTarget = tmuxTarget;
        this.sessions.set(winInfo.id, term);
        // Closing window only detaches the tmux view — does NOT kill the session
        this._wireTerminalWindow(winInfo, term, msg.sessionId, { killOnClose: false });
        term.focus();
        this.ws.offGlobal(handler);
      }
    };
    this.ws.onGlobal(handler);
  },

  resumeSession(sessionId, cwd, sessionName, { mode, model, effort, permission, accountId, syncId, backend = 'claude', backendSessionId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId, hostId, winBounds } = {}) {
    this._closeSidebarOnMobile();
    const targetBackendId = backendSessionId || sessionId;
    // If this session is already open in a LIVE window, focus it
    for (const [winId, term] of this.sessions) {
      if (term.sessionId) {
        const sidebar = this.sidebar;
        const match = (sidebar._allSessions || []).find(s => (s.backendSessionId || s.sessionId) === targetBackendId && (s.backend || 'claude') === backend && s.webuiId);
        if (match && term.sessionId === match.webuiId) {
          this._focusExistingSession(match.webuiId);
          return;
        }
      }
    }
    // Close any TERMINATED/read-only windows for the same backend session
    // (otherwise we'd end up with two windows pointing at the same conversation)
    for (const [winId, term] of [...this.sessions]) {
      const win = this.wm.windows.get(winId);
      const spec = win?._openSpec;
      if (spec?.backend === backend && spec?.backendSessionId === targetBackendId) {
        // The resumed conversation should stay where the old window was.
        if (!winBounds) winBounds = this._snapshotWinBounds(win);
        this.wm.closeWindow(winId);
      }
    }

    const sessionMode = mode || (this.settings.get('session.defaultMode') ?? 'chat');
    // Apply persisted per-session config (gear popover) for any param the caller
    // didn't specify — covers card click, resume-all, chat resume bar, etc.
    const savedCfg = this.sidebar?.getSessionConfig?.({ backend, sessionId, backendSessionId: targetBackendId }) || {};
    // Context task rides across resumes: the first task this session is
    // explicitly tagged with becomes VIBESPACE_TASK_ID again, so the
    // SessionStart hook re-injects task context on every resume.
    const contextTask = this.sidebar?._getSessionTasks?.({ backend, backendSessionId: targetBackendId })?.[0];
    this.createSession({
      cwd,
      name: sessionName,
      resumeId: sessionId,
      mode: sessionMode,
      model: model !== undefined ? model : savedCfg.model,
      permission: permission !== undefined ? permission : savedCfg.permission,
      effort: effort !== undefined ? effort : savedCfg.effort,
      accountId: accountId !== undefined ? accountId : savedCfg.account,
      syncId,
      backend,
      backendSessionId: backendSessionId || sessionId,
      hostId, // remote session resumes ON its host
      agentKind,
      agentRole,
      agentNickname,
      sourceKind,
      parentThreadId,
      taskId: contextTask?.id,
      winBounds,
    });
  },

  _snapshotWinBounds(win) {
    if (!win) return undefined;
    return {
      gridBounds: win.gridBounds ? { ...win.gridBounds } : null,
      preSnapBounds: win.preSnapBounds ? { ...win.preSnapBounds } : null,
      isMaximized: !!win.isMaximized,
    };
  },

  // "Hot-switch" a session's billing account (title-bar badge click). A true
  // in-process swap is impossible — the account rides the spawn env
  // (ANTHROPIC_API_KEY / CLAUDE_SECURESTORAGE_CONFIG_DIR / CODEX_HOME), fixed
  // for the CLI's lifetime — so this is the honest next best thing: persist
  // the choice (sessionConfigs.account), kill the CLI, resume the SAME
  // conversation on the new account. Also works on already-terminated
  // (read-only) windows, where it just resumes on the picked account.
  showBillingSwitcher(winId, anchor) {
    // Two call shapes: (windowId, anchorElement) from the title-bar identity
    // badge, or (sessionObject, {x,y}) from the sidebar card context menu —
    // the card path has no window (and phones have no title-bar badges).
    let win = null, spec = {}, live = null;
    if (winId && typeof winId === 'object') {
      live = winId;
    } else {
      const term = this.sessions.get(winId);
      win = this.wm.windows.get(winId);
      if (!win) return;
      spec = win._openSpec || {};
      const allSess = this.sidebar?._allSessions || [];
      live = term ? allSess.find(s => s.webuiId === term.sessionId) : null;
    }
    const backend = live?.backend || spec.backend || 'claude';
    if (backend !== 'claude' && backend !== 'codex') return;
    const backendSessionId = live?.backendSessionId || spec.backendSessionId || live?.sessionId || null;
    const isCodex = backend === 'codex';
    const accts = (this._accounts?.accounts || []).filter(a => ((a.backend || 'claude') === 'codex') === isCodex);
    // A stopped session has no live accountId — its saved on-resume account
    // config is the honest "current" (that's what the next resume bills to).
    const savedAcct = !live?.webuiId
      ? this.sidebar?.getSessionConfig?.(`${backend}:${backendSessionId}`)?.account : null;
    const currentId = live?.accountId || (savedAcct && savedAcct !== 'subscription' ? savedAcct : null) || null;
    const doSwitch = async (acctVal, label) => {
      if (!backendSessionId) {
        showToast(t('Nothing to resume yet — send a message first, or pick the account in the New Session dialog'), { type: 'error' });
        return;
      }
      const ok = await showConfirmDialog({
        title: t('Switch billing to “{name}”?', { name: label }),
        message: t('The account is fixed when the CLI starts, so the session restarts and the conversation continues via resume.'),
        confirmText: t('Switch & restart'),
      });
      if (!ok) return;
      const key = spec.sessionKey || `${backend}:${backendSessionId}`;
      this.sidebar?.setSessionConfig?.(key, { ...(this.sidebar?.getSessionConfig?.(key) || {}), account: acctVal });
      const name = this.sidebar?.getCustomName?.({ backend, backendSessionId }) || live?.name || spec.name || win?.title || t('Session');
      const cwd = live?.cwd || spec.cwd || '';
      const mode = live?.webuiMode || (win ? (win.type === 'terminal' ? 'terminal' : 'chat') : (this.settings.get('session.defaultMode') || 'chat'));
      const hostId = live?.host || undefined;
      const winBounds = win ? this._snapshotWinBounds(this.wm.windows.get(winId)) : undefined;
      const finish = () => this.resumeSession(backendSessionId, cwd, name, { mode, backend, backendSessionId, accountId: acctVal, hostId, winBounds });
      if (live?.webuiId) {
        this.ws.send({ type: 'kill', sessionId: live.webuiId });
        setTimeout(finish, 900); // let the CLI flush its transcript before --resume
      } else finish();
    };
    const items = [];
    // 'subscription' = accounts.resolveForSpawn's force-the-CLI's-own-login
    // sentinel (a bare '' would fall through to the default account).
    items.push({ label: (currentId === null ? '✓ ' : '') + t('CLI login'), action: () => { if (currentId !== null) doSwitch('subscription', t('CLI login')); } });
    for (const a of accts) {
      const cur = currentId === a.id;
      const suffix = (!isCodex && (a.type || 'api') !== 'subscription') ? ' · API' : '';
      items.push({ label: (cur ? '✓ ' : '') + a.name + suffix, action: () => { if (!cur) doSwitch(a.id, a.name); } });
    }
    if (anchor && typeof anchor.getBoundingClientRect === 'function') {
      const r = anchor.getBoundingClientRect();
      showContextMenu(r.left, r.bottom + 4, items);
    } else {
      showContextMenu(anchor?.x || 40, anchor?.y || 40, items);
    }
  },

  // Clicking Fork opens a popup for the first message. The fork only diverges
  // into its own session once that message is sent (the backend mints the
  // fork's new id on first input), so prompting up front gives the user an
  // immediately-distinct session instead of a window indistinguishable from a
  // resume. Terminal-mode forks have no chat input, so they fork directly.
  forkSession(sessionInfo) {
    const mode = sessionInfo.webuiMode || this.settings.get('session.defaultMode') || 'chat';
    if (mode !== 'chat') { this._doForkSession(sessionInfo, ''); return; }
    this._openForkDialog(sessionInfo, null);
  },

  // Fork from a specific assistant message (chat fork button). Passes the
  // message uuid as the truncation point (--resume-session-at) so the branch
  // contains the conversation only up to that message.
  forkFromMessage(sessionInfo, messageUuid) {
    this._openForkDialog(sessionInfo, messageUuid || null);
  },

  _openForkDialog(sessionInfo, forkAtUuid) {
    this._pendingFork = sessionInfo;
    this._pendingForkAt = forkAtUuid;
    if (this.isMobile) this.sidebar.toggle(false);
    this._showDialog('dialog-fork');
    // Swap the hint depending on whole-session vs from-a-point fork
    const genHint = document.getElementById('fork-hint-general');
    const atHint = document.getElementById('fork-hint-at');
    if (genHint) genHint.classList.toggle('hidden', !!forkAtUuid);
    if (atHint) atHint.classList.toggle('hidden', !forkAtUuid);
    const titleInput = document.getElementById('fork-title');
    if (titleInput) titleInput.value = this._defaultForkName(sessionInfo); // editable default
    const ta = document.getElementById('fork-first-message');
    const btn = document.getElementById('btn-fork-send');
    if (ta) { ta.value = ''; }
    if (btn) { btn.disabled = true; }
    if (ta) setTimeout(() => ta.focus(), 0);
  },

  // Programmatically send a chat message to a live chat session (used for the
  // fork first-message popup). The server echoes it back via the normalizer, so
  // the ChatView renders it without any local preview.
  _sendChatMessage(sessionId, text) {
    const t = (text || '').trim();
    if (!t) return;
    this.ws.send({ type: 'chat-input', sessionId, text: t, msgId: Date.now() + '-' + Math.random().toString(36).slice(2, 8) });
  },

  // Default fork title: "<base> (forked)" with a numeric suffix to stay unique.
  _defaultForkName(sessionInfo) {
    const baseName = sessionInfo.webuiName || sessionInfo.name || 'Session';
    const allNames = (this.sidebar._allSessions || []).map(s => s.webuiName || s.name || '');
    let forkName = `${baseName} (forked)`;
    let n = 2;
    while (allNames.includes(forkName)) { forkName = `${baseName} (forked ${n++})`; }
    return forkName;
  },

  _doForkSession(sessionInfo, initialMessage = '', resumeAt = null, customName = '') {
    const backend = sessionInfo.backend || 'claude';
    const resumeId = sessionInfo.backendSessionId || sessionInfo.sessionId;
    const forkName = (customName && customName.trim()) || this._defaultForkName(sessionInfo);

    const mode = sessionInfo.webuiMode || this.settings.get('session.defaultMode') || 'chat';
    // --resume-session-at <uuid> truncates the fork to up-to-and-including that
    // assistant message (claude-only). uuid has no spaces, so it tokenizes
    // cleanly inside the extraArgs string.
    const forkArgs = backend === 'claude'
      ? ('--fork-session' + (resumeAt ? ` --resume-session-at ${resumeAt}` : ''))
      : '';
    this.createSession({
      cwd: sessionInfo.cwd,
      name: forkName,
      resumeId,
      mode,
      backend,
      backendSessionId: resumeId,
      fork: true,
      extraArgs: forkArgs,
      initialMessage,
      forkAtUuid: resumeAt || undefined,
      forkTitle: forkName,
    });
  },

  // Open a stopped session as view-only (load JSONL, no claude --resume)
  viewSession(sessionId, cwd, sessionName, { syncId, backend = 'claude', backendSessionId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId, hostId } = {}) {
    this._closeSidebarOnMobile();
    this._hideWelcome();
    const resolvedSessionId = backendSessionId || sessionId;
    const viewId = backend === 'claude' ? `view-${resolvedSessionId}` : `view-${backend}-${resolvedSessionId}`;
    const openSpec = {
      action: 'viewSession',
      sessionId,
      backend,
      backendSessionId: resolvedSessionId,
      sessionKey: `${backend}:${resolvedSessionId}`,
      agentKind: agentKind || 'primary',
      agentRole: agentRole || '',
      agentNickname: agentNickname || '',
      sourceKind: sourceKind || '',
      parentThreadId: parentThreadId || null,
      hostId: hostId || undefined,
      cwd,
      name: sessionName,
    };
    const winInfo = this.wm.createWindow({
      title: `${sessionName || t('History')} — ${cwd}`,
      type: 'chat',
      syncId,
      openSpec,
      titleMeta: this._buildTitleMeta(openSpec),
    });
    const chatView = new ChatView(winInfo, this.ws, viewId, this, { readOnly: true });
    this.sessions.set(winInfo.id, chatView);

    // Request view-only attach — server loads JSONL without spawning claude
    this.ws.send({
      type: 'attach',
      sessionId: viewId,
      viewOnly: true,
      backend,
      backendSessionId: resolvedSessionId,
      claudeSessionId: backend === 'claude' ? resolvedSessionId : undefined,
      host: hostId || undefined, // remote session: server pulls the transcript over ssh first
      cwd,
      name: sessionName,
    });

    const handler = (msg) => {
      // Window closed (or the server replied error) before 'attached' — drop the
      // handler so a stale fire can't call loadHistory on a disposed ChatView
      // (which throws mid-dispatch and swallows every later handler's message).
      if (!this.wm.windows.has(winInfo.id)) { this.ws.offGlobal(handler); return; }
      if (msg.type === 'error' && msg.sessionId === viewId) { this.ws.offGlobal(handler); return; }
      if (msg.type === 'attached' && msg.sessionId === viewId) {
        this.ws.offGlobal(handler);
        if (msg.messages?.length) {
          chatView.loadHistory(msg.messages, msg.totalCount, false, { chatStatus: msg.chatStatus });
        }
      }
    };
    this.ws.onGlobal(handler);
    winInfo.onClose = () => { this.ws.offGlobal(handler); chatView.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome(); };
    winInfo._notifyChanged = () => this.updateTaskbar();
    return winInfo;
  },

  // Replay a serialized openSpec to recreate a window (for cross-client sync)
  replayOpenSpec(spec, syncId) {
    switch (spec.action) {
      case 'attachSession': {
        // The saved serverId/name may be STALE — the dtach instance dies and
        // gets resumed under a new server id while the spec persists in the
        // autosave (and the name was captured at window creation, before any
        // rename). Re-resolve against the live session list like restoreState
        // does; a spec replayed verbatim attaches to a nonexistent session and
        // leaves a blank window that re-persists the stale spec forever.
        const backend = spec.backend || 'claude';
        const bsid = spec.backendSessionId || null;
        const live = this.sidebar?._webuiSessions || [];
        let serverId = spec.serverId;
        let name = spec.name;
        let cwd = spec.cwd;
        if (bsid && !live.some(s => s.id === serverId)) {
          const alive = live.find(s => (s.backend || 'claude') === backend
            && (s.backendSessionId || s.claudeSessionId) === bsid);
          if (alive) {
            serverId = alive.id;
            name = alive.name || name;
            cwd = alive.cwd || cwd;
          } else if (live.length) {
            // Session is dead — open read-only history with a Resume bar
            // instead of a blank window stuck on a failed attach
            this.viewSession(bsid, cwd, this.sidebar?.getCustomName(spec.sessionKey || bsid) || name, {
              syncId, backend, backendSessionId: bsid,
              agentKind: spec.agentKind, agentRole: spec.agentRole,
              agentNickname: spec.agentNickname, sourceKind: spec.sourceKind,
              parentThreadId: spec.parentThreadId,
            });
            break;
          }
        }
        if (bsid) name = this.sidebar?.getCustomName(spec.sessionKey || bsid) || name;
        this.attachSession(serverId, name, cwd, {
          mode: spec.mode,
          syncId,
          backend,
          backendSessionId: bsid,
          agentKind: spec.agentKind,
          agentRole: spec.agentRole,
          agentNickname: spec.agentNickname,
          sourceKind: spec.sourceKind,
          parentThreadId: spec.parentThreadId,
        });
        break;
      }
      case 'openFileExplorer':
        this.openFileExplorer(spec.path, { syncId, host: spec.host });
        break;
      case 'openFile':
        this.openFile(spec.path, spec.name, { syncId });
        break;
      case 'openEditor':
        this.openEditor(spec.path, spec.name, { syncId });
        break;
      case 'openBrowser':
        this.openBrowser(spec.url, { syncId });
        break;
      case 'openDesktop':
        this.openDesktop({ syncId });
        break;
      case 'openTaskDetail':
        this.openTaskDetail(spec.taskId, { syncId });
        break;
      case 'openTaskLog':
        this.openTaskLog(spec.taskId, { tab: spec.tab, syncId });
        break;
      case 'openUsage':
        this.openUsage({ syncId });
        break;
      case 'openSessionProps':
        this.openSessionProps(spec.sessionKey, { syncId });
        break;
      case 'openWorkflowDetail':
        this.openWorkflowDetail(spec.runId, { syncId, claudeSessionId: spec.claudeSessionId, cwd: spec.cwd, name: spec.name });
        break;
      case 'attachTmuxSession':
        this.attachTmuxSession(spec.tmuxTarget, spec.name, spec.cwd);
        break;
      case 'viewSession':
        this.viewSession(spec.sessionId, spec.cwd, spec.name, {
          hostId: spec.hostId,
          syncId,
          backend: spec.backend || 'claude',
          backendSessionId: spec.backendSessionId || spec.sessionId,
          agentKind: spec.agentKind,
          agentRole: spec.agentRole,
          agentNickname: spec.agentNickname,
          sourceKind: spec.sourceKind,
          parentThreadId: spec.parentThreadId,
        });
        break;
      case 'viewSubagent': {
        const title = t('Agent: {desc}', { desc: spec.description || t('Subagent') });
        const winInfo = this.wm.createWindow({
          title,
          type: 'chat',
          syncId,
          openSpec: spec,
          titleMeta: this._buildTitleMeta({
            backend: spec.backend || 'claude',
            agentKind: spec.agentKind || 'subagent',
            agentRole: spec.agentRole,
            agentNickname: spec.agentNickname,
            sourceKind: spec.sourceKind,
            parentThreadId: spec.parentThreadId,
          }),
        });
        const view = new ChatView(winInfo, this.ws, spec.virtualId, this, { readOnly: true });
        this.sessions.set(winInfo.id, view);
        this.ws.send({
          type: 'attach',
          sessionId: spec.virtualId,
          parentSessionId: spec.parentSessionId,
          backend: spec.backend || 'claude',
          backendSessionId: spec.backendSessionId || spec.claudeSessionId,
          claudeSessionId: spec.claudeSessionId,
          cwd: spec.cwd,
        });
        const handler = (msg) => {
          if (!this.wm.windows.has(winInfo.id)) { this.ws.offGlobal(handler); return; }
          if (msg.type === 'error' && msg.sessionId === spec.virtualId) { this.ws.offGlobal(handler); return; }
          if (msg.type === 'attached' && msg.sessionId === spec.virtualId) {
            this.ws.offGlobal(handler);
            if (msg.messages?.length) view.loadHistory(msg.messages, msg.totalCount, msg.isStreaming);
          }
        };
        this.ws.onGlobal(handler);
        winInfo.onClose = () => { this.ws.offGlobal(handler); view.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome(); };
        break;
      }
    }
  },
  });
}
