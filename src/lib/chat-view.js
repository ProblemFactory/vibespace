import { copyText, escHtml, showToast } from './utils.js';
import { installChatSeek } from './chat-view-seek.js';
import { metric } from './telemetry-client.js';
import { stripAnsi } from './highlight.js';
import { ChatMinimap } from './chat-minimap.js';
import { ChatSearch } from './chat-search.js';
import { ChatRenderers } from './chat-renderers.js';
import { ChatInput } from './chat-input.js';
import { ChatStatusBar } from './chat-status-bar.js';
import { UI_ICONS } from './icons.js';
import { t } from './i18n.js';

/**
 * ChatView — renders a chat interface for stream-json mode sessions.
 * Displays structured messages from Claude Code's --output-format stream-json.
 * Input goes to the same PTY session via WebSocket.
 */
class ChatView {
  constructor(winInfo, wsManager, sessionId, app, { readOnly = false } = {}) {
    this.winInfo = winInfo;
    this.ws = wsManager;
    this.sessionId = sessionId;
    this.app = app;
    this._readOnly = readOnly;
    // Subagent viewers (sub-*) can't paginate; view-only history (view-*) and normal sessions can
    this._canPaginate = !sessionId.startsWith('sub-');
    this._messages = []; // normalized message objects
    this._elements = new Map(); // msg.id → DOM element
    this._pinned = true; // auto-scroll to bottom
    this._renderedMsgIds = new Set(); // dedup by msgId

    // Build DOM
    const container = document.createElement('div');
    container.className = 'chat-view';
    this._container = container;

    // Settings listeners are tracked and removed in dispose() — the
    // SettingsManager keeps them in a permanent Set, so untracked listeners
    // leak the whole view DOM per closed chat window.
    this._settingsListeners = [];
    const onSetting = (key, fn) => { app.settings?.on(key, fn); this._settingsListeners.push([key, fn]); };

    // Apply compact mode
    this._compact = app.settings?.get('chat.compactMode') ?? true;
    if (this._compact) container.classList.add('chat-compact');
    onSetting('chat.compactMode', (v) => {
      this._compact = v;
      container.classList.toggle('chat-compact', v);
      if (this._renderers) this._renderers._compact = v;
    });

    // Apply font size from global settings (scale message list relative to base 14px)
    const BASE_FONT = 14;
    const fontSize = parseInt(localStorage.getItem('termFontSize')) || BASE_FONT;
    this._chatScale = fontSize / BASE_FONT;
    this._applyFontSize = (size) => {
      this._chatScale = size / BASE_FONT;
      this._messageList.style.zoom = this._chatScale;
    };

    // Role indicator style
    const roleStyle = app.settings?.get('chat.roleIndicator') ?? 'border';
    container.dataset.roleIndicator = roleStyle;
    onSetting('chat.roleIndicator', (v) => {
      container.dataset.roleIndicator = v;
    });

    // Status bar
    this._statusBar = new ChatStatusBar(wsManager, sessionId, {
      backend: winInfo.backend || winInfo.titleMeta?.backend || 'claude',
      allowReview: !readOnly,
      getToolMsg: (toolCallId) => this._messages.find(m => m.toolCallId === toolCallId),
      openSubagentViewer: (opts) => this._openSubagentViewer(opts),
      openInTempEditor: (text) => this._renderers.openInTempEditor(text),
      startReview: (opts) => this._startReview(opts),
      // Mid-session model/effort picks persist as this session's per-session
      // config (same store as the Resume gear popover) so the next resume
      // starts with the same choice.
      onConfigChange: (patch) => this._persistSessionConfig(patch),
      // Running-workflow chips: click → live detail window; poll needs ids
      onOpenWorkflow: (runId, name) => {
        const ids = this._getSessionIds();
        this.app.openWorkflowDetail(runId, { claudeSessionId: ids.claudeId, cwd: ids.cwd, name });
      },
      getWorkflowIds: () => { const ids = this._getSessionIds(); return { claudeId: ids.claudeId, cwd: ids.cwd }; },
    });
    // Initial render: a brand-new session has no chatStatus yet — show the
    // honest unknown badges (model: ? / effort: ?) instead of an empty bar.
    this._statusBar.render();
    this._statusBar.popupContainer = container;
    this._syncReviewAvailability();

    // Message list
    this._messageList = document.createElement('div');
    this._messageList.className = 'chat-message-list';
    // Consecutive thinking/Bash run collapse (chat.collapseRuns, default ON —
    // TUI-style): a MutationObserver keeps the decoration current across live
    // appends, edits, virtual-scroll trims and jumps without touching any of
    // those paths. _runsMutating guards against self-triggering (the pass
    // itself inserts/removes headers).
    this._runsTimer = null;
    this._runsMutating = false;
    this._runsObserver = new MutationObserver(() => {
      if (this._runsMutating) return;
      clearTimeout(this._runsTimer);
      this._runsTimer = setTimeout(() => this._updateRuns(), 180);
    });
    this._runsObserver.observe(this._messageList, { childList: true });
    this._runExpanded = new WeakSet(); // first member of runs the user opened
    // Search open/close changes no list children — watch the bar's class so
    // runs expand while searching (reveal must reach hidden members) and
    // re-collapse after.
    queueMicrotask(() => {
      if (this._disposed || !this._search?._bar) return;
      this._searchBarObserver = new MutationObserver(() => this._updateRuns());
      this._searchBarObserver.observe(this._search._bar, { attributes: true, attributeFilter: ['class'] });
    });

    // Renderers (extracted rendering methods)
    this._renderers = new ChatRenderers({
      ws: wsManager,
      sessionId,
      app,
      backend: winInfo.backend || winInfo.titleMeta?.backend || 'claude',
      compact: this._compact,
      messageList: this._messageList,
      onPermissionResolve: () => { this._hideTyping(); this._updateRuns(); },
      onFork: (uuid, msg) => this._forkFromMessage(uuid, msg),
    });

    // Position indicator (shows when not at bottom, e.g. "120-170 / 3000")
    this._posIndicator = document.createElement('div');
    this._posIndicator.className = 'chat-pos-indicator hidden';
    if (this._chatScale !== 1) this._messageList.style.zoom = this._chatScale;
    container.appendChild(this._messageList);
    container.appendChild(this._posIndicator);

    // Scroll minimap — semantic scrollbar showing turns
    this._chatMinimap = new ChatMinimap(container, this._messageList, (idx) => this.jumpToIndex(idx), (ts, line) => this._jumpToFileTime(ts, line));
    // Sync minimap bounds on resize
    // Minimap ResizeObserver is handled by ChatMinimap internally

    // Scroll-to-bottom / pin button (shown when unpinned, with new message count)
    this._newMsgCount = 0;
    this._scrollBtn = document.createElement('button');
    this._scrollBtn.className = 'chat-scroll-btn hidden';
    this._scrollBtn.innerHTML = '\u2193';
    this._scrollBtn.title = t('Scroll to bottom');
    this._scrollBtn.onclick = () => {
      if (this._teleported) { this.jumpToBottom(); return; }   // return to latest
      if (this._readOnly || !this.sessionId) {
        // Read-only or no session: just scroll, don't fetch
        this._pinned = true;
        this._newMsgCount = 0;
        this._scrollBtn.classList.add('hidden');
        this._forceScrollToBottom();
      } else {
        this.jumpToBottom();
      }
    };
    // Wrap scroll button in a zero-height container between message list and input
    this._scrollBtnWrap = document.createElement('div');
    this._scrollBtnWrap.className = 'chat-scroll-btn-wrap';
    this._scrollBtnWrap.appendChild(this._scrollBtn);
    container.appendChild(this._scrollBtnWrap);

    // Wheel at top edge: scroll event won't fire when already at scrollTop=0,
    // so use wheel to detect upward scroll intent and trigger pagination
    // Right-click on a message's LEFT INDICATOR STRIP (the role color bar) →
    // per-message metadata popup (model / token usage / request id / uuid).
    // Restricted to the strip so normal right-click (copy text…) keeps the
    // native menu everywhere else; long-press synthesizes contextmenu on touch.
    this._messageList.addEventListener('contextmenu', (e) => {
      const msgEl = e.target.closest('.chat-msg');
      if (!msgEl || !msgEl.dataset.msgId) return;
      if (e.clientX - msgEl.getBoundingClientRect().left > 18) return; // strip only
      const id = isNaN(+msgEl.dataset.msgId) ? msgEl.dataset.msgId : +msgEl.dataset.msgId;
      const msg = this._messages.find(m => m.id === id || String(m.id) === String(msgEl.dataset.msgId));
      if (!msg) return;
      e.preventDefault();
      this._showMsgMeta(msg, e.clientX, e.clientY);
    });
    this._messageList.addEventListener('wheel', () => { this._lastUserScrollAt = Date.now(); }, { passive: true });
    this._messageList.addEventListener('touchmove', () => { this._lastUserScrollAt = Date.now(); }, { passive: true });
    this._messageList.addEventListener('wheel', (e) => {
      if (this._loading || !this._canPaginate) return;
      const list = this._messageList;
      if (e.deltaY < 0 && list.scrollTop < 10) {
        if (this._teleported) this._maybeSeekEarlier();        // teleported: seek older by line
        else if (this._windowStart > 0) this._extendTop();
        else this._maybeSeekEarlier();                         // registered tail exhausted → seek gap
      } else if (e.deltaY > 0 && this._teleported
          && list.scrollHeight - list.scrollTop - list.clientHeight < 10) {
        this._maybeSeekLater();                                // teleported: seek newer by line
      }
    }, { passive: true });

    // Scroll detection: pin-to-bottom + auto-load earlier messages (throttled)
    let scrollTick = false;
    this._messageList.addEventListener('scroll', () => {
      if (scrollTick) return;
      scrollTick = true;
      requestAnimationFrame(() => {
        scrollTick = false;
        if (this._programmaticScroll) return; // don't interfere with programmatic scrolls
        const { scrollTop, scrollHeight, clientHeight } = this._messageList;
        const atBottom = scrollHeight - scrollTop - clientHeight < 50;
        if (atBottom && !this._pinned) {
          this._pinned = true;
          this._newMsgCount = 0;
          this._scrollBtn.classList.add('hidden');
        } else if (!atBottom) {
          this._pinned = false;
          this._scrollBtn.classList.remove('hidden');
        }
        if (scrollTop < 100 && !this._loading && this._canPaginate) {
          if (this._teleported) this._maybeSeekEarlier();       // teleported: seek older by line
          else if (this._windowStart > 0) this._extendTop();
          else this._maybeSeekEarlier();                        // registered tail exhausted → seek gap
        }
        // Extend bottom when scrolling near end of rendered window. Teleport
        // mode seeks NEWER slabs by file line instead, so browsing continues
        // downward from a jump just like it does upward.
        if (scrollHeight - scrollTop - clientHeight < 300 && !this._loading && this._canPaginate) {
          if (this._teleported) this._maybeSeekLater();
          else if (this._windowEnd < this._total) this._extendBottom();
        }
        this._updatePosIndicator();
        this._chatMinimap.setViewport(this._windowStart, this._windowEnd, this._total);
        if (this._gapMinimapActive) this._reportVisibleTsRange();
      });
    }, { passive: true });

    // Read-only viewers: status displays but no input
    if (this._readOnly) {
      container.classList.add('chat-no-content-visibility');

      // Minimal TODO + streaming status (no full ChatInput)
      this._todoDisplay = document.createElement('div');
      this._todoDisplay.className = 'chat-todo-display hidden';
      this._streamStatus = document.createElement('div');
      this._streamStatus.className = 'chat-stream-status hidden';

      const statusArea = document.createElement('div');
      statusArea.className = 'chat-input-area';
      statusArea.style.padding = '4px 16px';
      statusArea.append(this._todoDisplay, this._streamStatus);
      container.append(statusArea, this._statusBar.element);
      container.tabIndex = -1;
      winInfo.content.appendChild(container);

      this._messageList.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG' && e.target.classList.contains('chat-img')) {
          const overlay = document.createElement('div');
          overlay.className = 'chat-img-overlay';
          // Build the <img> via property assignment (NOT innerHTML): e.target.src
          // is the browser-DECODED url, and a hostile data: mediaType can smuggle
          // a literal `" onerror=` through it — property assignment is unescapable.
          const zoomImg = document.createElement('img'); zoomImg.src = e.target.src; zoomImg.alt = 'image';
          overlay.appendChild(zoomImg);
          overlay.onclick = () => overlay.remove();
          document.body.appendChild(overlay);
        }
        if (e.target.classList.contains('chat-agent-view-btn')) {
          e.stopPropagation();
          this._openSubagentViewer({
            threadId: e.target.dataset.threadId,
            agentId: e.target.dataset.agentId,
            parentToolUseId: e.target.dataset.parentToolId,
            description: e.target.dataset.desc,
          });
        }
      });
      this._handler = (msg) => {
        if (msg.type === 'msg' && msg.sessionId === sessionId) {
          this._onOp(msg);
        }
      };
      this.ws.onGlobal(this._handler);
      this._stateHandler = () => {};
      this._startReadOnlyPolling();
      // Show Resume button for view-only history (skip subagent viewers)
      this._showResumeBar();
      return;
    }

    // Chat input area
    this._chatInput = new ChatInput(wsManager, sessionId, {
      onSend: () => {
        if (this._windowEnd < this._total) {
          this.jumpToBottom();
        } else {
          this._pinned = true;
          this._newMsgCount = 0;
          this._scrollBtn.classList.add('hidden');
          this._scrollToBottom();
        }
      },
      onInterrupt: () => this.ws.send({ type: 'interrupt', sessionId: this.sessionId }),
      getCwd: () => this._getSessionIds().cwd,
    });
    this._chatInput.popupContainer = container;
    this._setupChatDrop(container);

    // Search (extracted to ChatSearch)
    this._search = new ChatSearch(this._messageList, {
      getSessionIds: () => this._getSessionIds(),
      getSessionId: () => this.sessionId,
      jumpToIndex: (idx) => this.jumpToIndex(idx),
      getWindowBounds: () => ({ windowStart: this._windowStart, windowEnd: this._windowEnd }),
      // Huge (elided) sessions: search the WHOLE file in {line, ts} coordinates
      getGapActive: () => !!this._gapMinimapActive,
      jumpToFileMatch: (m) => this.jumpToFileMatch(m),
    });
    container.insertBefore(this._search.element, this._messageList);

    // Ctrl+F to search
    container.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        this._search.open();
      }
    });
    container.tabIndex = -1;
    winInfo.content.appendChild(container);

    container.appendChild(this._chatInput.element);
    container.appendChild(this._statusBar.element);

    // Clear waiting blink on focus/click
    winInfo.element.addEventListener('mousedown', () => this._clearWaiting());

    // Image zoom + Agent View Log click handler
    this._messageList.addEventListener('click', (e) => {
      if (e.target.tagName === 'IMG' && e.target.classList.contains('chat-img')) {
        const overlay = document.createElement('div');
        overlay.className = 'chat-img-overlay';
        // Property assignment, not innerHTML — a hostile data: mediaType can
        // smuggle a literal `" onerror=` through the decoded e.target.src.
        const zoomImg = document.createElement('img'); zoomImg.src = e.target.src; zoomImg.alt = 'image';
        overlay.appendChild(zoomImg);
        overlay.onclick = () => overlay.remove();
        document.body.appendChild(overlay);
      }
      // Agent View Log button
      if (e.target.classList.contains('chat-agent-view-btn')) {
        e.stopPropagation();
        this._openSubagentViewer({
          threadId: e.target.dataset.threadId,
          agentId: e.target.dataset.agentId,
          parentToolUseId: e.target.dataset.parentToolId,
          description: e.target.dataset.desc,
        });
      }
      // View Workflow button (dynamic-workflow post-hoc detail)
      if (e.target.classList.contains('chat-workflow-view-btn')) {
        e.stopPropagation();
        const { claudeId, cwd } = this._getSessionIds();
        this.app.openWorkflowDetail(e.target.dataset.wfRun, {
          name: e.target.dataset.wfName,
          claudeSessionId: claudeId,
          cwd,
        });
      }
    });

    // Listen for normalized message ops from server
    this._handler = (msg) => {
      if (msg.type === 'msg' && msg.sessionId === sessionId) {
        this._onOp(msg);
      } else if (msg.type === 'streaming-label' && msg.sessionId === sessionId) {
        if (msg.label) this._showTyping(msg.label);
        else this._hideTyping();
      } else if (msg.type === 'goal-updated' && msg.sessionId === sessionId) {
        this._onGoalUpdated(msg.goal, msg.goalElapsed);
        if (msg.goalStatus) this._statusBar.setGoalStatus(msg.goalStatus);
        if (msg.statusMsg) this._renderers.appendSystem(msg.statusMsg);
      } else if (msg.type === 'subagent-message' && msg.sessionId === sessionId) {
        this._onSubagentMessage(msg.parentToolUseId, msg.message);
      } else if (msg.type === 'exited' && msg.sessionId === sessionId) {
        this._hideTyping();
        if (msg.reason === 'not_logged_in') {
          this._renderers.appendSystem(t('Not logged in — please log in to continue.'));
          this._setReadOnly();
          this._showLoginBar();
        } else {
          this._renderers.appendSystem(t('Session ended.'));
          this._setReadOnly();
        }
      } else if (msg.type === 'attached' && msg.sessionId === sessionId) {
        // Track the server normalizer epoch from EVERY attach path (create,
        // attach, reattach) — _reattach compares against it to detect a
        // server restart (ID-space reset).
        if (msg.normEpoch) this._normEpoch = msg.normEpoch;
      } else if (msg.type === 'error' && msg.sessionId === sessionId) {
        // Attach failed (e.g. stale serverId replayed from a saved layout) —
        // surface it instead of waiting forever on a blank window
        this._hideTyping();
        this._renderers.appendSystem(msg.message || t('Session not found.'));
        this._setReadOnly();
      }
    };
    this.ws.onGlobal(this._handler);

    // Connection state: freeze on disconnect, re-attach + sync on reconnect
    this._disconnected = false;
    this._hasConnected = false; // track first connect vs reconnect
    this._stateHandler = (connected) => {
      this._disconnected = !connected;
      container.classList.toggle('chat-disconnected', !connected);
      if (this._chatInput) this._chatInput.setDisconnected(!connected);
      if (!connected) {
        this._hideTyping();
        this._renderers.appendSystem(t('Disconnected from server'));
      } else if (this._hasConnected) {
        this._renderers.appendSystem(t('Reconnected'));
        this._reattach(true);
      }
      this._hasConnected = true;
    };
    this.ws.onStateChange(this._stateHandler);
  }

  // ── View Manager: sliding window over server message list ──

  // Load initial messages from attach response
  // Load normalized messages from attach response
  loadHistory(messages, totalCount, isStreaming, meta) {
    const _t0 = performance.now();
    if (meta?.normEpoch) this._normEpoch = meta.normEpoch;
    this._total = totalCount || messages.length;
    this._windowStart = this._total - messages.length;
    this._windowEnd = this._total;
    this._loading = false;

    this._loadingHistory = true;
    for (const msg of messages) this._onCreateMessage(msg);
    this._loadingHistory = false;

    // Apply metadata (chatStatus, taskState, pendingPermissions)
    if (meta) {
      if (meta.chatStatus) this.applyStatus(meta.chatStatus);
      if (meta.taskState) this._applyTaskState(meta.taskState);
      if (meta.goal != null) { this._onGoalUpdated(meta.goal, meta.goalElapsed); if (meta.goalStatus) this._statusBar.setGoalStatus(meta.goalStatus); }
      // Restore pending permission overlays from server (survived in buffer).
      // Usually redundant — MessageManager attaches `permission` onto the
      // normalized tool message — but covers control_requests the normalizer
      // didn't see (e.g. buffered before a server restart).
      if (meta.pendingPermissions) {
        for (const [toolUseId, cr] of Object.entries(meta.pendingPermissions)) {
          // Find the message with this tool call and inject the permission
          for (const [id, el] of this._elements) {
            if (el.dataset?.toolId === toolUseId || el.querySelector(`[data-tool-id="${toolUseId}"]`)) {
              const msg = this._messages.find(m => m.id === id);
              // Skip completed/errored tools — a tool_result means the
              // permission was answered; injecting an unresolved overlay
              // here resurrects an already-answered prompt (defense against
              // a stale server-side pending list).
              if (msg && !msg.permission && msg.status !== 'complete' && msg.status !== 'error') {
                msg.permission = { requestId: cr.request_id, toolName: cr.request?.tool_name, input: cr.request?.input || {}, suggestions: cr.request?.permission_suggestions || [], resolved: null };
                this._renderers.renderPermissionOverlay(el, msg);
              }
              break;
            }
          }
        }
      }
    }
    this._syncReviewAvailability();
    // Set viewport BEFORE rendering markers — render() positions markers
    // against _total, which is stale (0) until setViewport runs, stretching
    // first-render markers toward 100%
    this._chatMinimap.setViewport(this._windowStart, this._windowEnd, this._total);
    // Render minimap from turn data (attach payload or async fetch fallback)
    if (meta?.turnMap?.length) {
      this._chatMinimap.render(meta.turnMap);
    } else if (this._total > 50) {
      // Fallback: fetch turn map via API
      const { backend, backendSessionId, cwd, host } = this._getSessionIds();
      if (backendSessionId) {
        fetch(`/api/session-messages?backend=${encodeURIComponent(backend)}&backendSessionId=${encodeURIComponent(backendSessionId)}&cwd=${encodeURIComponent(cwd)}&turnmap=1${host ? `&host=${encodeURIComponent(host)}` : ''}`)
          .then(r => r.json()).then(d => { if (d.turns?.length) this._chatMinimap.render(d.turns); }).catch(() => {});
      }
    }
    // Huge (elided) session? Switch the minimap to whole-conversation view up
    // front, so the scrollbar reflects the full timeline without waiting for
    // the user to scroll up to the seam marker. (info probe is free for normal
    // sessions — jsonlGapInfo returns null without building an index.)
    if (this._total > 50) this._initGapMinimap();

    if (isStreaming) this._showTyping(meta?.streamingLabel || t('thinking...'));
    this._scrollToBottom();
    metric('history-render-ms', performance.now() - _t0);
    // Auto-load more if content doesn't fill viewport (no scrollbar to trigger scroll event)
    setTimeout(() => {
      if (this._windowStart > 0 && this._messageList.scrollHeight <= this._messageList.clientHeight) {
        this._extendTop();
      }
    }, 100);
  }

  // Fork a new session from a specific assistant message (the chat fork button).
  // Resolves this view's session, then hands off to app.forkFromMessage which
  // adds --resume-session-at <uuid> so the branch is truncated at this point.
  _forkFromMessage(uuid, msg) {
    const { backend, backendSessionId, cwd } = this._getSessionIds();
    if (backend !== 'claude' || !backendSessionId || !uuid) return;
    const allSess = this.app.sidebar?._allSessions || [];
    const match = allSess.find(s => s.webuiId === this.sessionId)
      || allSess.find(s => (s.backendSessionId || s.sessionId) === backendSessionId);
    const webuiName = match?.webuiName || match?.name || this.winInfo?._openSpec?.name || 'Session';
    this.app.forkFromMessage({ backend, backendSessionId, cwd, webuiName, webuiMode: 'chat' }, uuid);
  }

  // Get session identifiers for API calls
  // Per-message metadata popup (left-strip right-click): everything the
  // normalizer knows about the record — serving model, token usage, request
  // identity, transcript position — plus a Copy-JSON escape hatch.
  _showMsgMeta(msg, x, y) {
    document.querySelectorAll('.msg-meta-pop').forEach(p => p.remove());
    const meta = msg.meta || {};
    const u = meta.usage || {};
    const cc = u.cache_creation || {};
    const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : null);
    const rows = [];
    const add = (label, val, copyable) => { if (val != null && val !== '') rows.push({ label, val: String(val), copyable }); };
    add(t('Role'), msg.role === 'assistant' ? 'assistant' : msg.role === 'user' ? 'user' : msg.role === 'tool' ? `tool (${msg.toolName || '?'})` : msg.role);
    add(t('Time'), msg.ts ? new Date(msg.ts).toLocaleString() : null);
    add(t('Model'), meta.model);
    if (u.input_tokens != null || u.output_tokens != null) {
      add(t('Input tokens'), fmt(u.input_tokens));
      add(t('Cache read'), fmt(u.cache_read_input_tokens));
      const cw = (cc.ephemeral_5m_input_tokens || 0) + (cc.ephemeral_1h_input_tokens || 0);
      add(t('Cache write'), cw ? fmt(cw) : null);
      add(t('Output tokens'), fmt(u.output_tokens));
      if (u.service_tier) add(t('Service tier'), u.service_tier);
    }
    add(t('Stop reason'), meta.stopReason);
    add(t('Request ID'), meta.requestId, true);
    add(t('Message ID'), meta.msgId, true);
    add(t('uuid'), msg.uuid, true);
    if (msg.srcLine != null) add(t('Transcript line'), msg.srcLine + 1);
    const pop = document.createElement('div');
    pop.className = 'msg-meta-pop';
    pop.dataset.popover = '1';
    pop.innerHTML = `<div class="msg-meta-title">${t('Message metadata')}</div>` + rows.map(r =>
      `<div class="msg-meta-row"><span class="msg-meta-label">${escHtml(r.label)}</span><span class="msg-meta-val${r.copyable ? ' copyable' : ''}" title="${r.copyable ? t('Click to copy') : ''}">${escHtml(r.val)}</span></div>`).join('')
      + `<button class="msg-meta-copy">${t('Copy as JSON')}</button>`;
    document.body.appendChild(pop);
    pop.style.position = 'fixed'; pop.style.zIndex = '99999';
    pop.style.left = Math.min(x, window.innerWidth - pop.offsetWidth - 8) + 'px';
    pop.style.top = Math.min(y, window.innerHeight - pop.offsetHeight - 8) + 'px';
    pop.addEventListener('click', (e) => {
      if (e.target.classList.contains('copyable')) { copyText(e.target.textContent); showToast(t('Copied')); }
      else if (e.target.classList.contains('msg-meta-copy')) {
        copyText(JSON.stringify({ role: msg.role, ts: msg.ts, uuid: msg.uuid, srcLine: msg.srcLine, toolName: msg.toolName, ...meta }, null, 2));
        showToast(t('Copied')); pop.remove();
      }
    });
    const close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', close, true); } };
    document.addEventListener('mousedown', close, true);
  }

  _getSessionIds() {
    const allSess = this.app.sidebar?._allSessions || [];
    // Remote sessions: every history consumer (initial load, pagination,
    // turnmap, search) must carry the host so /api/session-messages can pull
    // the transcript into the local cache — a REMOTE session that was never
    // started/viewed through this instance has a COLD cache, and a host-less
    // fetch silently returns nothing (real report: externally-started server
    // sessions opened blank in chat mode).
    const specHost = this.winInfo?._openSpec?.hostId || null;
    // View-only sessions: accept both legacy `view-<claudeId>` and backend-aware `view-<backend>-<backendSessionId>`
    if (this.sessionId.startsWith('view-')) {
      const match = allSess.find((s) => {
        const backend = s.backend || 'claude';
        const backendSessionId = s.backendSessionId || s.sessionId;
        const legacyViewId = `view-${s.sessionId}`;
        const backendViewId = backend === 'claude' ? legacyViewId : `view-${backend}-${backendSessionId}`;
        return this.sessionId === legacyViewId || this.sessionId === backendViewId;
      });
      if (match) {
        const backend = match.backend || 'claude';
        const backendSessionId = match.backendSessionId || match.sessionId;
        return { backend, backendSessionId, claudeId: backend === 'claude' ? backendSessionId : null, cwd: match?.cwd || '', host: match.host || specHost };
      }
      const rawId = this.sessionId.slice('view-'.length);
      const sep = rawId.indexOf('-');
      // `view-<backend>-<id>` only when the prefix is a KNOWN backend name —
      // a claude view id is `view-<uuid>` and the first UUID segment used to
      // be misread as a backend here, breaking pagination/search for any view
      // window whose session isn't in the local list (remote sessions never are).
      if (sep > 0 && /^(codex|claude|shell)$/.test(rawId.slice(0, sep))) {
        const backend = rawId.slice(0, sep);
        const backendSessionId = rawId.slice(sep + 1);
        if (backend && backendSessionId) {
          return {
            backend,
            backendSessionId,
            claudeId: backend === 'claude' ? backendSessionId : null,
            cwd: this.winInfo?._openSpec?.cwd || '',
            host: specHost,
          };
        }
      }
      return {
        backend: 'claude',
        backendSessionId: rawId,
        claudeId: rawId,
        cwd: this.winInfo?._openSpec?.cwd || '',
        host: specHost,
      };
    }
    const match = allSess.find(s => s.webuiId === this.sessionId);
    // A terminated window's server session is GONE from the live list
    // (discovery re-lists it as STOPPED with no webuiId) — fall back to the
    // identity captured in the openSpec while it was live, else the Resume
    // bar's click silently no-ops (real user report).
    const spec = this.winInfo?._openSpec || {};
    const backend = match?.backend || spec.backend || 'claude';
    const backendSessionId = match?.backendSessionId || match?.sessionId || spec.backendSessionId || null;
    return { backend, backendSessionId, claudeId: backend === 'claude' ? backendSessionId : null, cwd: match?.cwd || spec.cwd || '', host: match?.host || specHost };
  }

  // Fetch a range of messages from server
  async _fetchMessages(offset, limit) {
    const data = await this._fetchMessagePage(offset, limit);
    return data.messages || [];
  }

  async _fetchMessagePage(offset, limit, { withStatus = false } = {}) {
    const { backend, backendSessionId, cwd, host } = this._getSessionIds();
    if (!backendSessionId) return { messages: [], total: 0 };
    const query = new URLSearchParams({
      backend: backend || 'claude',
      backendSessionId,
      cwd: cwd || '',
      offset: String(offset),
      limit: String(limit),
    });
    if (host) query.set('host', host); // remote transcript: refresh local cache server-side
    if (withStatus) query.set('withStatus', '1');
    const res = await fetch(`/api/session-messages?${query.toString()}`);
    const data = await res.json();
    if (typeof data.total === 'number') this._total = data.total;
    return data;
  }

  // Extend the window upward (scroll up)
  async _extendTop(count = 50) {
    if (this._loading || this._windowStart <= 0) return;
    this._loading = true;
    try {
      const newStart = Math.max(0, this._windowStart - count);
      const fetchCount = this._windowStart - newStart;
      // A failed fetch (server restart mid-scroll) must NOT leave _loading stuck
      // true forever — that permanently blocks all pagination. The finally resets it.
      const msgs = await this._fetchMessages(newStart, fetchCount);

      const scrollHeightBefore = this._messageList.scrollHeight;
      // :scope > — a bare '.chat-msg' can match a NESTED element (inside a
      // card), whose parent isn't the list → insertBefore throws NotFoundError
      // (telemetry-captured real user error). Fragment + one validated insert.
      const firstEl = this._messageList.querySelector(':scope > .chat-msg');
      this._loadingHistory = true;
      const frag = document.createDocumentFragment();
      for (const msg of msgs) {
        const el = this._renderDetached(msg);
        if (el) frag.appendChild(el);
      }
      const ref = (firstEl && firstEl.parentNode === this._messageList) ? firstEl : this._messageList.firstChild;
      this._messageList.insertBefore(frag, ref);
      this._loadingHistory = false;
      this._windowStart = newStart;

      // Trim bottom if DOM window too large (keep max ~150 rendered messages)
      this._trimBottom();

      // Preserve scroll position
      this._messageList.scrollTop += (this._messageList.scrollHeight - scrollHeightBefore);
      if (this._search?.hasHighlight) this._search.applyHighlightLayer();
    } finally {
      setTimeout(() => { this._loading = false; }, 300);
    }
  }

  // Install an invisible sentinel at the very top of the message list. It plays
  // the role the old seam marker did (holds the gap-load cursor + anchor) but is
  // 0-height and unstyled, so scrolling up seek-loads earlier history with no
  // visible "truncated" notice — a continuous virtual scroll to line 0.
  

  // Toggle the content-visibility escape hatch. Turning it back ON (off=stable)
  // makes never-c-v-rendered elements collapse to the 80px estimate, which would
  // visibly shift the viewport — so re-enabling anchors on the topmost visible
  // message and compensates scrollTop to keep the view still.
  

  // Downward counterpart of _maybeSeekEarlier: while teleported, scrolling near
  // the bottom seek-loads the next NEWER slab so browsing continues past the
  // jumped-to point (until the end of the file / "return to latest").
  

  

  // Cap the teleport-browse DOM: each slab adds hundreds of elements and gap
  // messages are exempt from the virtual-scroll trim, so a long browse would
  // otherwise grow without bound. Drop from the far side, keeping the seek
  // cursors consistent so scrolling back re-loads what was dropped. The cap must
  // comfortably hold the teleport slab + a full 2000-line slab (~1200 msgs) in
  // EACH direction — a tighter cap thrashes: an up-load trims away what a
  // down-load just added (and vice versa).
  

  // Scroll-driven trigger for continuous gap loading once the registered tail is
  // fully rendered — complements the IntersectionObserver (which only fires on
  // intersection CHANGES, and scroll compensation can pin the sentinel in place).
  

  // A full-window jump (jumpToIndex/jumpToBottom) cleared the gap content; the
  // sentinel survives (it's not a .chat-msg) but its cursor now points at a stale
  // line. Reset it so the next scroll-up re-seeks from the tail edge (line
  // tailStartLine) instead of skipping the [cursor, tailStartLine) span.
  

  // Auto-load earlier history as the top sentinel scrolls into view — like a
  // virtual list's infinite scroll. The sentinel sits at the top; each loaded
  // slab inserts just below it (with scroll compensation), pushing the sentinel
  // out of the trigger zone until the user scrolls up again.
  _observeHistoryGap(markerEl) {
    if (markerEl._gapObserved) return;
    markerEl._gapObserved = true;
    if (!this._gapObserver) {
      this._gapObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) this._loadEarlierGap(entry.target, null);
        }
      }, { root: this._messageList, rootMargin: '300px 0px 0px 0px' });
    }
    this._gapObserver.observe(markerEl);
  }

  // Lazily seek-load a slab of earlier history (server reads by byte offset).
  // Fired automatically by the IntersectionObserver as the sentinel nears the
  // viewport. Each call walks one slab older, filling from the tail edge down to
  // line 0 — the whole file as one continuous scroll. Gap messages render
  // read-only and are excluded from virtual-scroll trimming + window accounting.
  

  // Reached line 0 — the whole conversation is now loaded. Stop observing; the
  // invisible sentinel can just go away (a visible "Load earlier" button, if any
  // legacy marker is in use, is removed too).
  

  // Render a gap message to a standalone element WITHOUT registering it in the
  // virtual-scroll window (_messages/_elements/_windowStart). Static + read-only.
  

  // ── Whole-conversation minimap for gapped (huge) sessions ──
  // Fetch the full-file user-turn map (TIME coordinates) and switch the
  // minimap to full-extent mode so the scrollbar reflects the entire session,
  // not just the loaded head+tail window.
  async _initGapMinimap() {
    if (this._gapMinimapActive || this._gapMinimapLoading) return;
    this._gapMinimapLoading = true;
    try {
      const { backend, backendSessionId, cwd } = this._getSessionIds();
      if (!backendSessionId) return;
      const base = `backend=${encodeURIComponent(backend || 'claude')}&backendSessionId=${encodeURIComponent(backendSessionId)}&cwd=${encodeURIComponent(cwd || '')}`;
      const data = await fetch(`/api/session-history-gap?${base}&fullturnmap=1`).then(r => r.json()).catch(() => null);
      if (this._disposed || !data?.fullTurns?.length) return;
      this._gapMinimapActive = true;
      this._gapBounds = { tailStartLine: data.tailStartLine, totalLines: data.totalLines };
      this._convoLastTs = data.lastTs; // newest real turn ts — anything past it in a
                                       // seek-loaded slab is a Date.now() fallback
      this._chatMinimap.renderFullExtent({ fullTurns: data.fullTurns, firstTs: data.firstTs, lastTs: data.lastTs });
      // Huge session: the server sent tail-ONLY (no head, no seam marker). Install
      // an invisible sentinel above the tail so scrolling up seek-loads the whole
      // earlier history as one continuous virtual list (down to line 0).
      this._installSeekSentinel();
      this._reportVisibleTsRange();
    } finally {
      this._gapMinimapLoading = false;
    }
  }

  // Report the visible viewport's time span to the minimap thumb. Uses
  // getBoundingClientRect for ACCURATE on-screen detection — offsetTop is
  // content-visibility-estimated for off-screen elements, so a far-below live
  // message could read as "visible" and yank the thumb to the recent end. Takes
  // min/max ts (not DOM-first/last) so a stray element can't invert the range.
  // The whole loop forces just ONE reflow (first rect read), then cheap reads.
  

  

  // Minimap click/drag in time mode: jump to a turn at file `line`. Teleports
  // to a seek-loaded slab around that absolute line, then scrolls to nearest ts.
  

  // Center an element with iterative convergence: after a teleport loads a big
  // slab, content-visibility computes real heights over several frames and a
  // single scrollTop set drifts. Re-center over ~12 frames until stable. Holds
  // the programmatic-scroll guard so auto-load doesn't fire mid-scroll.
  

  // Teleport: replace the whole view with a read-only slab seek-loaded around an
  // ABSOLUTE file line (whole=1, so it works in the tail region too and is immune
  // to the live tail sliding). Scrolling up continues seeking older by line; the
  // scroll-to-bottom button returns to the live/registered tail. This is the one
  // jump primitive — search + minimap both go through it, so there is no
  // normalized-index drift regardless of session size or live growth.
  

  // ── Full-file search support (huge sessions) ──
  // Jump to a search match given file-line + ts. Teleports to a slab around the
  // absolute line, then returns the DOM element nearest the match (by ts) so the
  // caller can expand + highlight it.
  

  // Find the loaded gap-slab element at (or nearest before) a file line.
  // Only accepts a hit when the line actually falls inside the loaded span —
  // otherwise the nearest-below element could be a whole slab away.
  _gapElForLine(line) {
    let best = null, bestLine = -1, maxLine = -1;
    for (const el of this._messageList.querySelectorAll('.chat-gap-msg[data-line]')) {
      const l = Number(el.dataset.line);
      if (!Number.isFinite(l)) continue;
      if (l > maxLine) maxLine = l;
      if (l <= line && l > bestLine) { best = el; bestLine = l; }
    }
    if (!best) return null;
    // In-span: either something at/after the target exists, or the gap between
    // the best match and the target is small (non-rendering records only)
    if (maxLine >= line || line - bestLine <= 50) return best;
    return null;
  }

  _nearestElByTs(ts) {
    let best = null, bestDiff = Infinity;
    for (const el of this._messageList.querySelectorAll('.chat-msg')) {
      const ets = Number(el.dataset.ts) || this._tsOfRenderedEl(el);
      if (!ets) continue;
      const d = Math.abs(ets - ts);
      if (d < bestDiff) { bestDiff = d; best = el; }
    }
    return best;
  }

  // Scroll to the rendered message nearest `ts`. Returns true if a match within
  // `tolMs` was found (Infinity = always scroll to the closest rendered).
  

  // Load messages at the bottom (when scrolling back down after trimming)
  async _extendBottom(count = 50) {
    if (this._loading || this._windowEnd >= this._total) return;
    this._loading = true;
    try {
      const end = Math.min(this._total, this._windowEnd + count);
      // finally resets _loading even if the fetch rejects — else pagination locks.
      const msgs = await this._fetchMessages(this._windowEnd, end - this._windowEnd);

      this._loadingHistory = true;
      for (const msg of msgs) this._onCreateMessage(msg);
      this._loadingHistory = false;
      this._windowEnd = end;

      // Trim top if DOM window too large
      this._trimTop();

      // Newly rendered messages need the search highlight re-applied
      if (this._search?.hasHighlight) this._search.applyHighlightLayer();
    } finally {
      setTimeout(() => { this._loading = false; }, 300);
    }
  }

  // Keep DOM under ~150 messages by removing from bottom
  _trimBottom(maxRendered = 150) {
    const els = this._messageList.querySelectorAll('.chat-msg:not(.chat-gap-msg)');
    if (els.length <= maxRendered) return;
    const toRemove = els.length - maxRendered;
    const removedIds = new Set();
    for (let i = els.length - 1; i >= els.length - toRemove; i--) {
      const id = els[i].dataset.msgId;
      if (id) { this._elements.delete(id); this._renderedMsgIds.delete(id); removedIds.add(id); }
      els[i].remove();
    }
    if (removedIds.size) this._messages = this._messages.filter(m => !removedIds.has(m.id));
    this._windowEnd -= toRemove;
    this._pinned = false; // we trimmed the bottom, can't be pinned
  }

  // Keep DOM under ~150 messages by removing from top
  _trimTop(maxRendered = 150) {
    // Exclude lazily-loaded gap messages: they aren't part of the server
    // window (_windowStart/_windowEnd accounting), so trimming them would
    // corrupt the offsets and silently delete explicitly-requested history
    const els = this._messageList.querySelectorAll('.chat-msg:not(.chat-gap-msg)');
    if (els.length <= maxRendered) return;
    const scrollHeightBefore = this._messageList.scrollHeight;
    const toRemove = els.length - maxRendered;
    const removedIds = new Set();
    for (let i = 0; i < toRemove; i++) {
      const id = els[i].dataset.msgId;
      if (id) { this._elements.delete(id); this._renderedMsgIds.delete(id); removedIds.add(id); }
      els[i].remove();
    }
    if (removedIds.size) this._messages = this._messages.filter(m => !removedIds.has(m.id));
    this._windowStart += toRemove;
    // Preserve scroll position after removing from top
    this._messageList.scrollTop -= (scrollHeightBefore - this._messageList.scrollHeight);
  }

  // Jump to a specific message index: replace window entirely
  async jumpToIndex(targetIdx) {
    const windowSize = 50;
    const start = Math.max(0, targetIdx - 20);
    const end = Math.min(this._total, start + windowSize);
    const msgs = await this._fetchMessages(start, end - start);

    // Clear and rebuild DOM
    this._messageList.querySelectorAll('.chat-msg, .chat-msg-system').forEach(el => el.remove());
    this._resetGapAfterJump();
    this._elements.clear();
    this._renderedMsgIds.clear();
    this._messages = [];
    this._windowStart = start;
    this._windowEnd = end;
    this._pinned = false;

    this._loadingHistory = true;
    for (const msg of msgs) this._onCreateMessage(msg);
    this._loadingHistory = false;

    // Scroll to the target message (gap-loaded elements are outside the
    // window index space — exclude them so relIdx maps to the right element)
    const relIdx = targetIdx - start;
    const allMsgs = this._messageList.querySelectorAll('.chat-msg:not(.chat-gap-msg)');
    if (relIdx >= 0 && relIdx < allMsgs.length) {
      const targetEl = allMsgs[relIdx];
      for (const d of targetEl.querySelectorAll('details:not([open])')) d.open = true;
      targetEl.style.contentVisibility = 'visible';
      requestAnimationFrame(() => targetEl.scrollIntoView({ block: 'center' }));
    }
    if (this._search?.hasHighlight) this._search.applyHighlightLayer();
  }

  // Jump to the bottom of the conversation
  async jumpToBottom() {
    const windowSize = 50;
    const start = Math.max(0, this._total - windowSize);
    const msgs = await this._fetchMessages(start, this._total - start);

    this._messageList.querySelectorAll('.chat-msg, .chat-msg-system').forEach(el => el.remove());
    this._resetGapAfterJump();
    this._elements.clear();
    this._renderedMsgIds.clear();
    this._messages = [];
    this._windowStart = start;
    this._windowEnd = this._total;

    this._loadingHistory = true;
    for (const msg of msgs) this._onCreateMessage(msg);
    this._loadingHistory = false;
    this._pinned = true;
    this._newMsgCount = 0;
    this._scrollBtn.classList.add('hidden');
    if (this._search?.hasHighlight) this._search.applyHighlightLayer();

    // Temporarily disable content-visibility so the browser computes real heights
    // for all elements, then scroll to bottom, then re-enable
    this._forceScrollToBottom();
  }

  _forceScrollToBottom() {
    this._programmaticScroll = true;
    const list = this._messageList;
    let n = 0;
    const step = () => {
      list.scrollTop = list.scrollHeight;
      // Each frame scrolling reveals off-screen elements, browser computes
      // their real heights (replacing content-visibility estimates), scrollHeight
      // grows — repeat until converged or max 10 frames (~166ms)
      if (++n < 10) requestAnimationFrame(step);
      else this._programmaticScroll = false;
    };
    requestAnimationFrame(step);
  }

  // Render a message into elements (append to list, then detach for insertion elsewhere)
  // Render a normalized message and detach from DOM (for insertBefore operations)
  _renderDetached(msg) {
    this._onCreateMessage(msg);
    const el = this._elements.get(msg.id);
    if (el) { el.remove(); return el; }
    return null;
  }

  // Handle normalized message ops from server (create/edit/meta)
  _onOp(op) {
    if (op.op === 'create') {
      this._onCreateMessage(op.message);
    } else if (op.op === 'edit') {
      this._onEditMessage(op.id, op.fields);
    } else if (op.op === 'meta') {
      this._onMeta(op);
    }
  }

  _deriveTypingLabel() {
    for (let i = this._messages.length - 1; i >= 0; i--) {
      const msg = this._messages[i];
      if (!msg) continue;
      // Stop at user messages — streaming never crosses turn boundaries.
      // This prevents stale streaming messages from earlier turns from
      // showing a permanent 'responding...' indicator.
      if (msg.role === 'user') return '';
      if (msg.role === 'tool' && msg.status === 'pending') {
        return t('running {tool}...', { tool: msg.toolName || t('tool') });
      }
      if (msg.status !== 'streaming') continue;
      const block = msg.content?.[0];
      if (msg.role === 'tool') return t('running {tool}...', { tool: msg.toolName || block?.toolName || t('tool') });
      if (block?.type === 'thinking') return t('thinking...');
      if (block?.type === 'text') return t('responding...');
      return t('thinking...');
    }
    return '';
  }

  _syncTypingIndicator(fallbackLabel = '') {
    const label = this._deriveTypingLabel() || fallbackLabel || '';
    if (label) this._showTyping(label);
    else this._hideTyping();
  }

  // Create a new normalized message → render and append to DOM
  _onCreateMessage(msg) {
    if (this._renderedMsgIds.has(msg.id)) return;
    // set_model confirmation: the CLI echoes "Set model to X (resolved-id)" as a
    // user record — the RESOLVED id is the authoritative model for the status
    // bar (the control_response reports success even for bogus names). Parsed
    // before the defer check so it applies even while viewing history.
    if (msg.role === 'user' && this._statusBar) {
      const txt = (msg.content || []).map(b => b.text || '').join('');
      const m = txt.match(/^<local-command-stdout>Set model to (\S+?)(?: \(([^)]+)\))?<\/local-command-stdout>/);
      if (m) this._statusBar.setModel(m[2] || m[1]);
    }
    if (!this._loadingHistory && msg.backendMeta?.reviewThreadId && msg.backendMeta?.delivery === 'detached') {
      if (!this._openedDetachedReviews) this._openedDetachedReviews = new Set();
      const reviewThreadId = msg.backendMeta.reviewThreadId;
      if (reviewThreadId && !this._openedDetachedReviews.has(reviewThreadId)) {
        this._openedDetachedReviews.add(reviewThreadId);
        const { backend, backendSessionId, cwd } = this._getSessionIds();
        this.app.viewSession(reviewThreadId, cwd, t('Review'), {
          backend: backend || 'codex',
          backendSessionId: reviewThreadId,
          agentKind: 'review',
          sourceKind: 'review',
          parentThreadId: backendSessionId || null,
        });
      }
    }

    // Live message while viewing history: don't render, just track count.
    // Teleport mode is always "viewing history" \u2014 its window accounting is
    // stale, so gate on the flag directly (else live messages leak into the
    // teleported slab and corrupt the minimap's visible-ts thumb).
    if (!this._loadingHistory && (this._teleported || (!this._pinned && this._windowEnd < this._total))) {
      this._total++;
      this._newMsgCount++;
      this._scrollBtn.innerHTML = `\u2193 <span class="chat-scroll-badge">${this._newMsgCount}</span>`;
      this._scrollBtn.classList.remove('hidden');
      return;
    }

    this._renderedMsgIds.add(msg.id);
    // Upsert: trims clear _renderedMsgIds, so re-extending the window would
    // otherwise push duplicate copies — and _onEditMessage's findIndex would
    // then mutate the stale first copy instead of the rendered one.
    const existIdx = this._messages.findIndex(m => m.id === msg.id);
    if (existIdx >= 0) this._messages[existIdx] = msg; else this._messages.push(msg);
    this._syncReviewAvailability();

    // Streaming indicator driven by server's streaming-label broadcast (no client-side derivation)

    let el;
    switch (msg.role) {
      case 'user': el = this._renderers.renderUserMsg(msg); break;
      case 'assistant': el = this._renderers.renderAssistantMsg(msg); break;
      case 'tool': el = this._renderers.renderToolMsg(msg); break;
      case 'system': {
        const result = this._renderers.renderSystemMsg(msg);
        if (result?.sideEffect) {
          const se = result.sideEffect;
          if (se.model) this._statusBar.setModel(se.model);
          if (se.permMode) this._statusBar.setPermMode(se.permMode);
          if (se.slashCommands && this._chatInput) this._chatInput.setSlashCommands(se.slashCommands);
          this._statusBar.render();
        }
        el = result?.el || null;
        break;
      }
      default: return;
    }

    if (!el) return;
    el.dataset.msgId = msg.id;
    if (msg.ts) el.dataset.ts = msg.ts; // for time-coordinate minimap positioning
    this._elements.set(msg.id, el);
    this._messageList.appendChild(el);
    this._renderers.addWrapToggles(el);
    this._renderers.addOpenInEditorBtn(el);
    // Update window bounds for live messages (not history batch)
    if (!this._loadingHistory) {
      this._total++;
      this._windowEnd = this._total;
      // Update minimap with new user turns
      if (msg.role === 'user') {
        const preview = (msg.content || []).map(b => b.text || '').join('').trim();
        const turn = { turnIndex: msg.turnIndex, startIdx: this._total - 1, ts: msg.ts, role: 'user' };
        if (preview) {
          if (preview.startsWith('This session is being continued from a previous conversation')) {
            turn.isCompact = true; turn.preview = 'Context compacted';
          } else {
            turn.preview = preview.length > 60 ? preview.substring(0, preview.lastIndexOf(' ', 60) > 30 ? preview.lastIndexOf(' ', 60) : 60) + '…' : preview;
          }
        }
        this._chatMinimap.addTurn(turn, this._total);
        // Huge-session (time-coordinate) minimap: extend the timeline too —
        // addTurn is a no-op in full-extent mode, and without this the map
        // froze at init time while the live session kept growing
        if (this._gapMinimapActive) this._chatMinimap.appendFullTurn(turn);
      }
      this._chatMinimap.setViewport(this._windowStart, this._windowEnd, this._total);
    }
    if (this._pinned) {
      // Live path trim (audit-confirmed): _trimTop was only ever called from
      // pagination, so a pinned chat streaming for DAYS grew the DOM without
      // bound. While pinned the user is at the bottom — dropping the oldest
      // rendered rows is invisible; scrolling up re-loads them via _extendTop.
      this._trimTop();
      this._scrollToBottom();
    }
  }

  // Edit an existing message → re-render in place
  _onEditMessage(id, fields) {
    // Update stored message
    const msgIdx = this._messages.findIndex(m => m.id === id);
    if (msgIdx < 0) return;
    const msg = this._messages[msgIdx];
    Object.assign(msg, fields);
    // A Workflow launch ack just landed → status-bar chip for the running run
    if (msg.toolName === 'Workflow' && fields.content && !this._loadingHistory) {
      const out = msg.content?.[0]?.output || '';
      const runId = out.match(/Run ID:\s*(wf_[\w-]+)/)?.[1];
      if (runId) this._statusBar.trackWorkflow(runId, out.match(/Workflow ["“]([^"”]+)["”]/)?.[1] || msg.content?.[0]?.input?.name || null);
    }
    this._syncReviewAvailability();

    // Status transitions
    if (fields.status === 'complete' || fields.status === 'error' || fields.status === 'interrupted') {
      // Re-render completed messages in case content changed while pending/local.
      const oldEl = this._elements.get(id);
      if (oldEl) {
        let newEl;
        switch (msg.role) {
          case 'user': newEl = this._renderers.renderUserMsg(msg); break;
          case 'tool': newEl = this._renderers.renderToolMsg(msg); break;
          case 'assistant': newEl = this._renderers.renderAssistantMsg(msg); break;
          default: {
            const result = this._renderers.renderSystemMsg(msg);
            newEl = result?.el || null;
            break;
          }
        }
        if (newEl) {
          newEl.dataset.msgId = id;
          if (msg.ts) newEl.dataset.ts = msg.ts; // keep time-coordinate minimap data on re-render
          oldEl.replaceWith(newEl);
          this._elements.set(id, newEl);
          this._renderers.addWrapToggles(newEl);
          this._renderers.addOpenInEditorBtn(newEl);
        }
      }
    }

    // Streaming text update → coalesce to one re-render per frame: each delta
    // re-parses the FULL accumulated markdown + linkify passes, so per-delta
    // rendering is O(n²) over a long response and churns the DOM subtree
    if (fields.content && msg.status === 'streaming') {
      if (!this._streamRenderPending) this._streamRenderPending = new Set();
      this._streamRenderPending.add(id);
      if (!this._streamRenderRaf) {
        this._streamRenderRaf = requestAnimationFrame(() => {
          this._streamRenderRaf = null;
          const ids = this._streamRenderPending; this._streamRenderPending = new Set();
          for (const mid of ids) this._renderStreamingText(mid);
        });
      }
    }

    // Streaming label driven by server broadcast — no client-side sync needed here

    if (this._pinned) this._scrollToBottom();

    // Permission update
    if (fields.permission) {
      const el = this._elements.get(id);
      if (el) this._renderers.renderPermissionOverlay(el, msg);
      // The overlay mutates the card IN PLACE — no childList change, so the
      // runs observer never fires. Re-evaluate directly: an unresolved
      // permission must pop its card out of a collapsed run (and a resolve
      // lets it fold back in).
      this._updateRuns();
    }

    // Task info update — delegate to status bar
    if (fields.taskInfo) {
      this._statusBar.updateTask(fields.taskInfo, msg.toolCallId, msg.content);
    }
  }

  // Render the latest streaming text for a message (called once per rAF batch)
  _renderStreamingText(id) {
    if (this._disposed) return;
    const msg = this._messages.find(m => m.id === id);
    const oldEl = this._elements.get(id);
    if (!msg || !oldEl || msg.status !== 'streaming') return;
    const textDiv = oldEl.querySelector('.chat-text');
    if (textDiv && msg.content[0]?.type === 'text') {
      textDiv.innerHTML = this._renderers.renderMarkdown(stripAnsi(msg.content[0].text));
    } else if (msg.content[0]?.type === 'thinking') {
      const summaryEl = oldEl.querySelector('.chat-thinking summary');
      const preEl = oldEl.querySelector('.chat-thinking pre');
      const detailsEl = oldEl.querySelector('.chat-thinking');
      if (detailsEl) detailsEl.open = true;
      if (summaryEl) summaryEl.textContent = t('Thinking');
      if (preEl) preEl.textContent = stripAnsi(msg.content[0].text || '');
      // A streaming thinking card can start empty (tagged hidden at create)
      // and fill in — untag the moment real text lands so it becomes visible.
      if ((msg.content[0].text || '').trim()) oldEl.classList.remove('chat-empty-thinking');
    }
    if (this._pinned) this._scrollToBottom();
  }

  // Handle meta ops (usage, cost, turn_complete)
  _persistSessionConfig(patch) {
    try {
      const sb = this.app?.sidebar;
      if (!sb?.setSessionConfig) return;
      const match = (sb._allSessions || []).find(x => x.webuiId === this.sessionId);
      const spec = this.winInfo?._openSpec;
      const target = match || (spec?.backendSessionId ? { backend: spec.backend || 'claude', backendSessionId: spec.backendSessionId } : null);
      if (!target) return; // brand-new session with no backend id yet — nothing durable to key on
      const cur = sb.getSessionConfig?.(target) || {};
      sb.setSessionConfig(target, { ...cur, ...patch });
    } catch { /* config persistence is best-effort */ }
  }

  _onMeta(op) {
    if (op.subtype === 'served-model') {
      this._statusBar.setServedModel(op.data?.model || null);
      return;
    }
    if (op.subtype === 'usage') {
      this._statusBar.updateUsage(op.data);
    } else if (op.subtype === 'todos') {
      if (this._chatInput) {
        this._chatInput.updateTodos(op.data);
      } else {
        // readOnly mode: update local todos + display
        this._todos = op.data;
        this._updateTodoDisplay();
      }
    } else if (op.subtype === 'goal_status') {
      const gs = op.data;
      if (gs?.met) {
        this._statusBar.setGoal(null);
        this._renderers.appendSystem(t('Goal met: {condition}', { condition: gs.condition }));
      } else if (gs?.condition) {
        this._statusBar.setGoal(gs.condition);
        if (gs.sentinel) this._renderers.appendSystem(t('Goal set: {condition}', { condition: gs.condition }));
      }
    } else if (op.subtype === 'turn_complete') {
      this._hideTyping();
      this._statusBar.addCost(op.data?.cost, op.data?.modelUsage);
      // Blink window
      if (!this.winInfo.element.classList.contains('window-active')) {
        this.winInfo.element.classList.add('window-waiting');
        if (this.winInfo._notifyChanged) this.winInfo._notifyChanged();
      }
    }
  }

  // _showTyping / _hideTyping delegate to ChatInput (normal) or readOnly _streamStatus
  _showTyping(label = t('thinking...')) {
    if (this._chatInput) { this._chatInput.showTyping(label); return; }
    // readOnly fallback
    if (!this._streamStatus) return;
    this._streamStatus.innerHTML = `<span class="chat-spinner"></span> ${escHtml(label)}`;
    this._streamStatus.classList.remove('hidden');
  }

  _hideTyping() {
    if (this._chatInput) { this._chatInput.hideTyping(); return; }
    // readOnly fallback
    if (!this._streamStatus) return;
    this._streamStatus.classList.add('hidden');
    this._streamStatus.innerHTML = '';
  }

  _onGoalUpdated(goal, elapsed) {
    this._statusBar.setGoal(goal, elapsed);
  }

  _onSubagentMessage(parentToolUseId, msg) {
    if (!parentToolUseId) return;
    // Track message count for tool card status
    if (!this._subagentCounts) this._subagentCounts = new Map();
    this._subagentCounts.set(parentToolUseId, (this._subagentCounts.get(parentToolUseId) || 0) + 1);

    // Update pending Agent card status
    const pending = this._messageList.querySelector(`[data-tool-id="${parentToolUseId}"]`);
    if (pending) {
      // [data-tool-id] is the .chat-msg WRAPPER — the visual card is the inner
      // .chat-tool-use. Background agents complete the tool call instantly (no
      // .chat-tool-output-pending), so appending to the wrapper drew the status
      // line OUTSIDE the card. Always anchor inside the card.
      const card = pending.querySelector('.chat-tool-use') || pending;
      let statusEl = card.querySelector('.chat-agent-live-status');
      if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'chat-agent-live-status';
        const outputPending = card.querySelector('.chat-tool-output-pending');
        if (outputPending) outputPending.before(statusEl);
        else card.appendChild(statusEl);
      }
      const count = this._subagentCounts.get(parentToolUseId);
      // Upgrade the header model chip to the model ACTUALLY serving this agent
      // (subagent assistant messages carry message.model) — the render-time chip
      // only knows the declared tool-input model, which may be absent/an alias.
      const servedModel = msg.message?.model;
      if (servedModel && !servedModel.startsWith('<')) {
        let chip = card.querySelector('.chat-tool-label .chat-agent-model');
        if (!chip) {
          const lbl = card.querySelector('.chat-tool-label');
          if (lbl) {
            chip = document.createElement('span');
            chip.className = 'chat-agent-model';
            const btn = lbl.querySelector('.chat-agent-view-btn');
            if (btn) btn.before(chip); else lbl.appendChild(chip);
          }
        }
        if (chip && chip.textContent !== servedModel) chip.textContent = servedModel;
      }
      // Detect activity from raw subagent message
      let activity = '';
      const c = msg.message?.content || msg.content;
      if (Array.isArray(c)) {
        const last = c[c.length - 1];
        if (last?.type === 'tool_use' || last?.type === 'tool_call') activity = t('running {tool}', { tool: last.name || last.toolName || t('tool') });
        else if (last?.type === 'thinking') activity = t('thinking');
        else if (last?.type === 'text') activity = t('responding');
      }
      // Find description from stored messages
      const toolMsg = this._messages.find(m => m.toolCallId === parentToolUseId);
      const desc = toolMsg?.content?.[0]?.input?.description || '';
      const threadId = toolMsg?.taskInfo?.receiverThreadIds?.[0] || '';
      const threadAttr = threadId ? ` data-thread-id="${escHtml(threadId)}"` : ` data-parent-tool-id="${escHtml(parentToolUseId)}"`;
      // A completed Agent card already has a View Log button in its header \u2014
      // the live status line only adds one when the card has none (pending).
      const hasHeaderBtn = !!card.querySelector('.chat-tool-label .chat-agent-view-btn');
      const btnHtml = hasHeaderBtn ? '' : ` <button class="chat-agent-view-btn"${threadAttr} data-desc="${escHtml(desc)}">${t('View Log')}</button>`;
      statusEl.innerHTML = `<span class="chat-agent-live-count">${t('{n} messages', { n: count })}${activity ? ' \u2022 ' + escHtml(activity) : ''}</span>${btnHtml}`;
    }
  }

  // Unified subagent viewer: works for both live (parentToolUseId) and completed (agentId)
  _openSubagentViewer({ parentToolUseId, threadId, agentId, description, agentRole = '', agentNickname = '' }) {
    const { backend, backendSessionId, claudeId, cwd } = this._getSessionIds();
    if (backend === 'codex' && threadId) {
      const viewId = `view-${backend}-${threadId}`;
      if (!this._subagentViewers) this._subagentViewers = new Map();
      const existingWinId = this._subagentViewers.get(viewId);
      if (existingWinId && this.app.wm.windows.has(existingWinId)) {
        this.app.wm.focusWindow(existingWinId);
        return;
      }
      const winInfo = this.app.viewSession(threadId, cwd, description || agentNickname || agentRole || 'Agent', {
        backend,
        backendSessionId: threadId,
        agentKind: 'subagent',
        agentRole,
        agentNickname,
        sourceKind: 'subagent',
        parentThreadId: backendSessionId || null,
      });
      if (winInfo?.id) {
        this._subagentViewers.set(viewId, winInfo.id);
        const prevOnClose = winInfo.onClose;
        winInfo.onClose = () => {
          this._subagentViewers.delete(viewId);
          prevOnClose?.();
        };
      }
      return;
    }

    // Virtual session ID for subscribing to messages
    const virtualId = agentId ? `sub-agent-${agentId}` : `sub-${parentToolUseId}`;

    // Reuse existing viewer window if still open
    if (!this._subagentViewers) this._subagentViewers = new Map();
    const existingWinId = this._subagentViewers.get(virtualId);
    if (existingWinId && this.app.wm.windows.has(existingWinId)) {
      this.app.wm.focusWindow(existingWinId);
      return;
    }

    const title = `Agent: ${description || t('Subagent')}`;
    const openSpec = {
      action: 'viewSubagent',
      virtualId,
      parentSessionId: this.sessionId,
      backend,
      backendSessionId,
      claudeSessionId: claudeId,
      agentKind: 'subagent',
      agentRole,
      agentNickname,
      sourceKind: 'subagent',
      parentThreadId: backendSessionId || null,
      cwd,
      description,
    };
    const winInfo = this.app.wm.createWindow({
      title,
      type: 'chat',
      openSpec,
      titleMeta: { backend, agentKind: 'subagent', agentRole, agentNickname, sourceKind: 'subagent', parentThreadId: backendSessionId || null },
    });
    this._subagentViewers.set(virtualId, winInfo.id);
    const view = new ChatView(winInfo, this.ws, virtualId, this.app, { readOnly: true });

    // Attach to virtual session — server returns history + sets up live forwarding
    this.ws.send({
      type: 'attach',
      sessionId: virtualId,
      parentSessionId: this.sessionId,
      backend,
      backendSessionId,
      claudeSessionId: claudeId,
      cwd,
    });

    // One-time handler for attach response — MUST self-guard (documented
    // invariant: closing the window mid-attach otherwise leaks the handler
    // and leaves a phantom viewer entry; same fix as app.js attachSession)
    const handler = (msg) => {
      if (!this.app.wm.windows.has(winInfo.id)) { this.ws.offGlobal(handler); return; }
      if (msg.type === 'error' && msg.sessionId === virtualId) { this.ws.offGlobal(handler); return; }
      if (msg.type === 'attached' && msg.sessionId === virtualId) {
        this.ws.offGlobal(handler);
        if (msg.messages?.length) {
          view.loadHistory(msg.messages, msg.totalCount, msg.isStreaming);
        }
      }
    };
    this.ws.onGlobal(handler);

    winInfo.onClose = () => { this._subagentViewers.delete(virtualId); view.dispose(); this.app._checkWelcome(); };
  }

  _startReview({ target, delivery }) {
    if (!target || this._readOnly) return;
    this.ws.send({
      type: 'review-start',
      sessionId: this.sessionId,
      target,
      delivery: delivery || 'inline',
    });
  }

  _syncReviewAvailability() {
    const { backend } = this._getSessionIds();
    if (backend !== 'codex') return;
    const ready = this._messages.some((msg) => msg.role === 'assistant' && msg.status === 'complete');
    this._statusBar.setReviewEnabled(ready);
  }

  _startReadOnlyPolling() {
    if (!this._readOnly || !this.sessionId.startsWith('view-') || this._readOnlyPollTimer) return;
    const { backend } = this._getSessionIds();
    if (backend !== 'codex') return;
    const tick = async () => {
      if (this._disposed) return;
      // Hidden tab: 2s polling of a read-only view is pure waste — heartbeat
      // at 30s and catch up when visible again (sidebar poll pattern).
      if (document.hidden) { this._readOnlyPollTimer = setTimeout(tick, 30000); return; }
      try {
        const nextOffset = this._windowEnd || 0;
        const page = await this._fetchMessagePage(nextOffset, 200, { withStatus: true });
        const msgs = page.messages || [];
        if (page.chatStatus) this.applyStatus(page.chatStatus);
        if (page.taskState) this._applyTaskState(page.taskState);
        if (msgs.length) {
          this._loadingHistory = true;
          for (const msg of msgs) this._onCreateMessage(msg);
          this._loadingHistory = false;
          this._windowEnd = Math.min(this._total || (nextOffset + msgs.length), nextOffset + msgs.length);
          if (this._pinned) this._scrollToBottom();
        }
      } catch {}
      if (this._disposed) return;
      this._readOnlyPollTimer = setTimeout(tick, 2000);
    };
    this._readOnlyPollTimer = setTimeout(tick, 2000);
  }

  _applyTaskState(taskState) {
    const tasks = taskState?.tasks || {};
    this._statusBar.setTasks(tasks);
    // Re-arm running-workflow chips after attach/refresh: any Workflow result
    // in the loaded tail gets probed once — /api/workflow drops non-running
    // ones on the first poll, so finished runs never chip.
    for (const m of this._messages.slice(-60)) {
      if (m.toolName !== 'Workflow') continue;
      const out = m.content?.[0]?.output || '';
      const runId = out.match(/Run ID:\s*(wf_[\w-]+)/)?.[1];
      if (runId) this._statusBar.trackWorkflow(runId, m.content?.[0]?.input?.name || null);
    }

    const todos = Array.isArray(taskState?.todos) ? taskState.todos : [];
    if (this._chatInput) {
      this._chatInput.updateTodos(todos);
    } else {
      this._todos = todos;
      this._updateTodoDisplay();
    }

    this._statusBar.render();
  }


  // readOnly-only _updateTodoDisplay (for readOnly mode which doesn't have ChatInput)
  _updateTodoDisplay() {
    if (!this._todoDisplay) return;
    if (!this._todos?.length) { this._todoDisplay.classList.add('hidden'); return; }
    const inProgress = this._todos.find(t => t.status === 'in_progress');
    const completed = this._todos.filter(t => t.status === 'completed').length;
    const total = this._todos.length;
    if (!inProgress && completed === total) { this._todoDisplay.classList.add('hidden'); return; }
    const label = inProgress ? inProgress.activeForm || inProgress.content : t('{done}/{total} done', { done: completed, total });
    const icon = inProgress ? UI_ICONS.hourglass : UI_ICONS.check;
    this._todoDisplay.innerHTML = `<span class="chat-todo-current">${icon} ${escHtml(label)} <span class="chat-status-dim">(${completed}/${total})</span></span>`;
    this._todoDisplay.classList.remove('hidden');
  }

  applyStatus(status) {
    if (!status) return;
    this._statusBar.applyStatus(status);
    if (status.slashCommands && this._chatInput) {
      this._chatInput.setSlashCommands(status.slashCommands.map(c => c.startsWith('/') ? c : '/' + c));
    }
  }

  _scrollToBottom() {
    this._forceScrollToBottom();
  }

  // Drag-and-drop file/folder upload onto the chat → saved into the session's
  // working directory, with the path inserted into the input. (Editable views
  // only; the input button handles the mobile/click path.)
  _setupChatDrop(container) {
    const overlay = document.createElement('div');
    overlay.className = 'chat-drop-overlay hidden';
    overlay.innerHTML = `<div class="chat-drop-hint">${t('Drop to upload to the working directory')}</div>`;
    container.appendChild(overlay);
    this._dropOverlay = overlay;
    const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
    // Robust across browsers (incl. Safari, and OS/Finder file drags that never
    // fire dragend): `dragover` fires continuously while the cursor hovers, so
    // each one shows the overlay and pushes back a short hide timer. When
    // dragover STOPS firing — cursor left, drag cancelled, or it ended — the
    // timer hides it. This avoids `dragleave`/`relatedTarget` (unreliable in
    // Safari) and the dragenter/leave depth counter (unbalanced in Chrome,
    // which left the overlay stuck).
    this._dropHideTimer = null;
    const hide = () => { if (this._dropHideTimer) { clearTimeout(this._dropHideTimer); this._dropHideTimer = null; } overlay.classList.add('hidden'); };
    container.addEventListener('dragenter', (e) => { if (isFileDrag(e)) e.preventDefault(); });
    container.addEventListener('dragover', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      overlay.classList.remove('hidden');
      if (this._dropHideTimer) clearTimeout(this._dropHideTimer);
      this._dropHideTimer = setTimeout(hide, 150);
    });
    container.addEventListener('drop', async (e) => {
      hide();
      if (!isFileDrag(e)) return;
      e.preventDefault();
      const files = await this._collectDroppedFiles(e.dataTransfer);
      if (files.length && this._chatInput) this._chatInput.uploadFiles(files);
    });
  }

  // Collect dropped files, recursing into directories (DataTransferItem entries
  // must be read synchronously before the first await), tagging each File with
  // its relative path so folder trees are recreated under the cwd.
  async _collectDroppedFiles(dt) {
    const entries = Array.from(dt.items || []).map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return Array.from(dt.files || []);
    const out = [];
    const walk = async (entry, prefix) => {
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        try { file._relPath = prefix + entry.name; } catch {}
        out.push(file);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readBatch = () => new Promise((res, rej) => reader.readEntries(res, rej));
        let batch;
        do { batch = await readBatch(); for (const e of batch) await walk(e, prefix + entry.name + '/'); } while (batch.length);
      }
    };
    for (const entry of entries) await walk(entry, '');
    return out;
  }

  // Re-attach to session after reconnect: re-register with server + sync missed messages
  _reattach(keepDisabled = false) {
    // Keep input disabled until server confirms re-attach — prevents
    // sending messages before the WS is registered in session.clients
    if (keepDisabled && this._chatInput) this._chatInput.setDisconnected(true);

    // Snapshot the epoch BEFORE re-attaching: the permanent handler stores the
    // fresh epoch as soon as 'attached' arrives, so comparing against
    // this._normEpoch inside the temp handler would always match.
    const epochBefore = this._normEpoch;

    // Re-attach so server adds this WS to session.clients again
    this.ws.send({ type: 'attach', sessionId: this.sessionId });

    // Wait for attached response before re-enabling input
    const handler = (msg) => {
      if (msg.type !== 'attached' || msg.sessionId !== this.sessionId) return;
      this.ws.offGlobal(handler);
      if (this._chatInput) this._chatInput.setDisconnected(false);
      // Server normalizer was REBUILT (server restart): message IDs are a
      // plain per-normalizer counter, so the new numbering collides with what
      // we've already rendered — incremental catch-up would silently DROP new
      // messages (false dedup in _renderedMsgIds) and corrupt indices. The
      // only safe move is a full view reload from the attach payload.
      const epochChanged = msg.normEpoch && epochBefore && msg.normEpoch !== epochBefore;
      if (msg.normEpoch) this._normEpoch = msg.normEpoch;
      if (epochChanged) { this._fullViewReset(msg); return; }
      // Sync streaming label from server
      if (msg.isStreaming) this._showTyping(msg.streamingLabel || t('thinking...'));
      else this._hideTyping();
      this._reattachCatchUp();
    };
    this.ws.onGlobal(handler);
    // Safety: re-enable after 5s even if attached never arrives
    setTimeout(() => {
      this.ws.offGlobal(handler);
      if (this._chatInput) this._chatInput.setDisconnected(false);
    }, 5000);
  }

  // Same-epoch reconnect: fetch just the messages we missed while offline
  _reattachCatchUp() {
    const missedStart = this._windowEnd;
    this._fetchMessages(missedStart, 200).then(msgs => {
      if (!msgs.length) return;
      this._loadingHistory = true;
      for (const msg of msgs) this._onCreateMessage(msg);
      this._loadingHistory = false;
      // Keep the window accounting in sync: _fetchMessages silently updated
      // _total from the server, but _windowEnd previously stayed stale — the
      // rendered window then held more messages than [start,end) claimed, so
      // the minimap thumb, position indicator, and every index-based jump
      // (search + minimap) were off by the missed count after a reconnect.
      this._windowEnd = missedStart + msgs.length;
      // Server totals can move across a restart (e.g. dedup changes) — clamp so
      // the window accounting never overshoots (_windowEnd > _total broke the
      // at-bottom checks and the pos indicator).
      if (this._total && this._windowEnd > this._total) this._windowEnd = this._total;
      this._total = Math.max(this._total, this._windowEnd);
      this._chatMinimap.setViewport(this._windowStart, this._windowEnd, this._total);
      this._updatePosIndicator();
      // Missed user turns also belong on the minimap
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (m.role === 'user') this._chatMinimap.addTurn({ turnIndex: m.turnIndex, startIdx: missedStart + i, ts: m.ts, role: 'user' }, this._total);
      }
      if (this._search?.hasHighlight) this._search.applyHighlightLayer();
      if (this._pinned) this._scrollToBottom();
    }).catch(() => {});
  }

  // Server-restart reload: rebuild the whole view from the fresh attach
  // payload (new ID space, new totals). Position resets to the live tail —
  // predictable, and beats silently frozen messages.
  _fullViewReset(msg) {
    this._messageList.querySelectorAll('.chat-msg, .chat-msg-system').forEach(el => el.remove());
    this._resetGapAfterJump();
    this._elements.clear();
    this._renderedMsgIds.clear();
    this._messages = [];
    this._newMsgCount = 0;
    this.loadHistory(msg.messages || [], msg.totalCount || 0, msg.isStreaming, {
      chatStatus: msg.chatStatus, taskState: msg.taskState, turnMap: msg.turnMap,
      pendingPermissions: msg.pendingPermissions, streamingLabel: msg.streamingLabel,
      goal: msg.goal, goalElapsed: msg.goalElapsed, goalStatus: msg.goalStatus,
      normEpoch: msg.normEpoch,
    });
  }

  _clearWaiting() {
    if (this.winInfo.element.classList.contains('window-waiting')) {
      this.winInfo.element.classList.remove('window-waiting');
      if (this.winInfo._notifyChanged) this.winInfo._notifyChanged();
    }
  }

  focus() {
    if (this._chatInput) this._chatInput.focus();
    this._clearWaiting();
  }

  // Minimap extracted to ChatMinimap class (src/lib/chat-minimap.js)

  _updatePosIndicator() {
    if (!this._posIndicator || !this._total) return;
    // Teleport mode browses by file position; the window-index numbers are stale
    // and misleading — the minimap thumb communicates position instead.
    if (this._teleported || (this._pinned && this._windowEnd >= this._total)) {
      this._posIndicator.classList.add('hidden');
      return;
    }
    this._posIndicator.textContent = `${this._windowStart + 1}\u2013${this._windowEnd} / ${this._total}`;
    this._posIndicator.classList.remove('hidden');
  }

  // Convert to read-only mode (after session terminate/exit)
  _setReadOnly() {
    this._readOnly = true;
    if (this._chatInput) this._chatInput.setReadOnly();
    this._showResumeBar();
  }

  // Insert a Resume bar in place of the input area for stopped/view-only/terminated
  // chat windows. Subagent viewers (sub-*) can't be resumed, so they're skipped.
  _showResumeBar() {
    if (this._resumeBar || this.sessionId.startsWith('sub-')) return;
    const container = this._container;
    if (!container) return;

    const bar = document.createElement('div');
    bar.className = 'chat-resume-bar';
    const btn = document.createElement('button');
    btn.className = 'chat-resume-btn';
    btn.innerHTML = `${UI_ICONS.refresh} <span>${t('Resume this session')}</span>`;
    btn.title = t('Resume the session and continue chatting');
    btn.onclick = () => this._resumeAndClose();

    const note = document.createElement('div');
    note.className = 'chat-resume-note';
    note.textContent = t('Session is read-only.');

    bar.append(note, btn);
    // Insert before status bar (which is the last child)
    if (this._statusBar?.element && this._statusBar.element.parentNode === container) {
      container.insertBefore(bar, this._statusBar.element);
    } else {
      container.appendChild(bar);
    }
    this._resumeBar = bar;
  }

  // Show login bar when session exits due to expired/missing OAuth token
  _showLoginBar() {
    if (this._resumeBar) this._resumeBar.remove();
    this._resumeBar = null;
    const container = this._container;
    if (!container) return;

    const bar = document.createElement('div');
    bar.className = 'chat-resume-bar chat-login-bar';

    const note = document.createElement('div');
    note.className = 'chat-resume-note';
    note.textContent = t('Claude CLI is not logged in. Open a terminal to run /login, then retry.');

    const loginBtn = document.createElement('button');
    loginBtn.className = 'chat-resume-btn';
    loginBtn.innerHTML = `${UI_ICONS.wrench} <span>${t('Open Login Terminal')}</span>`;
    loginBtn.onclick = () => {
      // Open a terminal window running claude (user can /login there)
      const ids = this._getSessionIds();
      const cwd = ids.cwd || this.winInfo?._openSpec?.cwd || '';
      this.app.createSession({ cwd, mode: 'terminal', backend: ids.backend || 'claude' });
    };

    const retryBtn = document.createElement('button');
    retryBtn.className = 'chat-resume-btn';
    retryBtn.innerHTML = `${UI_ICONS.refresh} <span>${t('Retry')}</span>`;
    retryBtn.onclick = () => this._resumeAndClose();

    bar.append(note, loginBtn, retryBtn);
    if (this._statusBar?.element && this._statusBar.element.parentNode === container) {
      container.insertBefore(bar, this._statusBar.element);
    } else {
      container.appendChild(bar);
    }
    this._resumeBar = bar;
  }

  _resumeAndClose() {
    const ids = this._getSessionIds();
    const backend = ids.backend || 'claude';
    const backendSessionId = ids.backendSessionId || this.winInfo?.backendSessionId || null;
    const cwd = ids.cwd || this.winInfo?._openSpec?.cwd || this.winInfo?.cwd || '';
    if (!backendSessionId || !cwd) {
      // Can't resume without these — fall back to focusing sidebar
      this.app.sidebar?.refresh?.();
      return;
    }
    const customName = this.app.sidebar?.getCustomName?.(backendSessionId);
    const name = customName || this.winInfo?.name || this.winInfo?.titleMeta?.name || 'Session';
    const winId = this.winInfo?.id;
    this.app.resumeSession(backendSessionId, cwd, name, {
      mode: 'chat',
      backend,
      backendSessionId,
      agentKind: this.winInfo?.titleMeta?.agentKind,
      agentRole: this.winInfo?.titleMeta?.agentRole,
      agentNickname: this.winInfo?.titleMeta?.agentNickname,
      sourceKind: this.winInfo?.titleMeta?.sourceKind,
    });
    // Close the read-only window — the resumed session opens in a new window
    if (winId) this.app.wm?.closeWindow?.(winId);
  }

  // Billing identity chip in the status bar (fed by app.syncSessionIdentity,
  // mobile only — desktop shows the same identity in the window title bar).
  setBillingIdentity(auth, onSwitch) {
    this._statusBar?.setBilling?.(auth, onSwitch);
  }

  // ── Consecutive thinking/Bash run collapse (chat.collapseRuns) ──
  // Decoration-only pass: adjacent thinking/Bash cards get a "N × …" header
  // and the members hide behind it (any Bash folds immediately, pure-thinking
  // needs ≥2). Nothing is reparented and headers don't match .chat-msg, so
  // virtual-scroll trims, index→element mapping and gap-seek are untouched.
  // HIDDEN cards (empty thinking under chat.hideEmptyThinking, hook cards
  // under chat.showHookCards=false) are TRANSPARENT: they neither count
  // toward the threshold nor break adjacency of the visible cards around
  // them — without this, invisible empty-thinking stubs wedged between real
  // cards silently broke every run. An open search bar expands everything
  // (search reveal must be able to scroll to any member).
  _updateRuns() {
    const list = this._messageList;
    if (!list || this._disposed) return;
    const enabled = this.app?.settings?.get('chat.collapseRuns') !== false;
    const searchOpen = this._search?._bar && !this._search._bar.classList.contains('hidden');
    this._runsMutating = true;
    try {
      list.querySelectorAll(':scope > .chat-run-header').forEach((h) => h.remove());
      list.querySelectorAll(':scope > .chat-run-collapsed').forEach((el) => el.classList.remove('chat-run-collapsed'));
      if (!enabled || searchOpen) return;
      // thinking and Bash count as ONE collapsible kind — the TUI folds the
      // interleaved think→run→think noise as a single group (user directive;
      // same-kind-only grouping never reached its threshold in real turns).
      const hideEmptyThink = this.app?.settings?.get('chat.hideEmptyThinking') !== false;
      const hooksHidden = document.body.classList.contains('hide-hook-cards');
      const kindOf = (el) => {
        if (!el.classList?.contains('chat-msg') || el.classList.contains('chat-gap-msg')) return null;
        // display:none'd cards are invisible glue — 'skip' (never break a run)
        if (hideEmptyThink && el.classList.contains('chat-empty-thinking')) return 'skip';
        if (hooksHidden && el.classList.contains('chat-msg-hook')) return 'skip';
        const m = el._rawMsg;
        if (!m) return null;
        // A card waiting for the user's Allow/Deny (or an AskUserQuestion
        // answer) must stay visible — folding it hides the approval buttons
        // and the turn stalls unnoticed (real report). Returning null also
        // BREAKS the run so the surrounding fold can't swallow it.
        if (m.permission && !m.permission.resolved) return null;
        if (el.classList.contains('chat-msg-tool-result')) {
          const b = m.content?.[0];
          // pending/running Bash collapses too (user directive — the bottom
          // streaming indicator already shows live activity)
          return b?.toolName === 'Bash' ? 'noise' : null;
        }
        if (m.role === 'assistant' && Array.isArray(m.content) && m.content.length
            && m.content.every((b) => b.type === 'thinking')) return 'noise';
        return null;
      };
      const kids = [...list.children];
      let run = [];
      let runKind = null;
      const flush = () => {
        // the newest message stays visible — live activity must not vanish
        const members = run; // the newest message collapses too (user directive)
        // A run containing ANY Bash collapses immediately — even a single one
        // (user directive: "看到 bash 直接开始折叠, 无论多少条"). Pure-thinking
        // runs still need ≥2 so a lone thought stays inline.
        const hasBash = members.some((el) => el.classList.contains('chat-msg-tool-result'));
        if (members.length >= (hasBash ? 1 : 2)) {
          const header = document.createElement('div');
          header.className = 'chat-run-header';
          const nBash = members.filter((el) => el.classList.contains('chat-msg-tool-result')).length;
          const nThink = members.length - nBash;
          let label = nThink === 0 ? t('{n} Bash commands', { n: nBash })
            : nBash === 0 ? t('{n} thinking steps', { n: nThink })
            : t('{t} thinking · {b} Bash', { t: nThink, b: nBash });
          // live state on the fold: a running member shows through the header
          if (members.some((el) => el._rawMsg?.status === 'pending' || el._rawMsg?.status === 'streaming')) {
            label += ' · ' + t('running…');
          }
          header.innerHTML = `<span class="chat-run-arrow">▸</span><span>${label}</span>`;
          // Rebuilds happen on every list mutation — remember runs the user
          // opened (keyed by first member) so a new message doesn't re-collapse
          // what they're reading.
          const wasOpen = this._runExpanded.has(members[0]);
          header.onclick = () => {
            const open = header.classList.toggle('open');
            if (open) this._runExpanded.add(members[0]); else this._runExpanded.delete(members[0]);
            for (const el of members) el.classList.toggle('chat-run-collapsed', !open);
          };
          list.insertBefore(header, members[0]);
          if (wasOpen) header.classList.add('open');
          else for (const el of members) el.classList.add('chat-run-collapsed');
        }
        run = []; runKind = null;
      };
      for (const el of kids) {
        const k = kindOf(el);
        if (k === 'skip') continue; // hidden card — transparent to the run
        if (k && k === runKind) { run.push(el); continue; }
        flush();
        if (k) { run = [el]; runKind = k; }
      }
      flush();
    } finally {
      this._runsMutating = false;
    }
  }

  dispose() {
    this._statusBar?.dispose?.();
    this._disposed = true;
    if (this._runsObserver) { this._runsObserver.disconnect(); this._runsObserver = null; }
    if (this._searchBarObserver) { this._searchBarObserver.disconnect(); this._searchBarObserver = null; }
    if (this._runsTimer) { clearTimeout(this._runsTimer); this._runsTimer = null; }
    if (this._readOnlyPollTimer) clearTimeout(this._readOnlyPollTimer);
    this.ws.offGlobal(this._handler);
    this.ws.offStateChange(this._stateHandler);
    for (const [key, fn] of this._settingsListeners || []) this.app.settings?.off(key, fn);
    this._settingsListeners = [];
    if (this._chatInput) this._chatInput.dispose();
    if (this._chatMinimap) this._chatMinimap.dispose();
    if (this._search) this._search.dispose();
    if (this._gapObserver) { this._gapObserver.disconnect(); this._gapObserver = null; }
    if (this._dropHideTimer) { clearTimeout(this._dropHideTimer); this._dropHideTimer = null; }
  }
}

export { ChatView };

// Gap-seek (huge-JSONL continuous scroll) methods live in their own module.
installChatSeek(ChatView);
