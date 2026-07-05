import { escHtml } from './utils.js';
import { stripAnsi } from './highlight.js';
import { ChatMinimap } from './chat-minimap.js';
import { ChatSearch } from './chat-search.js';
import { ChatRenderers } from './chat-renderers.js';
import { ChatInput } from './chat-input.js';
import { ChatStatusBar } from './chat-status-bar.js';
import { UI_ICONS } from './icons.js';

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
    });
    // Initial render: a brand-new session has no chatStatus yet — show the
    // honest unknown badges (model: ? / effort: ?) instead of an empty bar.
    this._statusBar.render();
    this._statusBar.popupContainer = container;
    this._syncReviewAvailability();

    // Message list
    this._messageList = document.createElement('div');
    this._messageList.className = 'chat-message-list';

    // Renderers (extracted rendering methods)
    this._renderers = new ChatRenderers({
      ws: wsManager,
      sessionId,
      app,
      backend: winInfo.backend || winInfo.titleMeta?.backend || 'claude',
      compact: this._compact,
      messageList: this._messageList,
      onPermissionResolve: () => this._hideTyping(),
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
    this._scrollBtn.title = 'Scroll to bottom';
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
          this._renderers.appendSystem('Not logged in — please log in to continue.');
          this._setReadOnly();
          this._showLoginBar();
        } else {
          this._renderers.appendSystem('Session ended.');
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
        this._renderers.appendSystem(msg.message || 'Session not found.');
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
        this._renderers.appendSystem('Disconnected from server');
      } else if (this._hasConnected) {
        this._renderers.appendSystem('Reconnected');
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
              if (msg && !msg.permission) {
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
      const { backend, backendSessionId, cwd } = this._getSessionIds();
      if (backendSessionId) {
        fetch(`/api/session-messages?backend=${encodeURIComponent(backend)}&backendSessionId=${encodeURIComponent(backendSessionId)}&cwd=${encodeURIComponent(cwd)}&turnmap=1`)
          .then(r => r.json()).then(d => { if (d.turns?.length) this._chatMinimap.render(d.turns); }).catch(() => {});
      }
    }
    // Huge (elided) session? Switch the minimap to whole-conversation view up
    // front, so the scrollbar reflects the full timeline without waiting for
    // the user to scroll up to the seam marker. (info probe is free for normal
    // sessions — jsonlGapInfo returns null without building an index.)
    if (this._total > 50) this._initGapMinimap();

    if (isStreaming) this._showTyping(meta?.streamingLabel || 'thinking...');
    this._scrollToBottom();
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
  _getSessionIds() {
    const allSess = this.app.sidebar?._allSessions || [];
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
        return { backend, backendSessionId, claudeId: backend === 'claude' ? backendSessionId : null, cwd: match?.cwd || '' };
      }
      const rawId = this.sessionId.slice('view-'.length);
      const sep = rawId.indexOf('-');
      if (sep > 0) {
        const backend = rawId.slice(0, sep);
        const backendSessionId = rawId.slice(sep + 1);
        if (backend && backendSessionId) {
          return {
            backend,
            backendSessionId,
            claudeId: backend === 'claude' ? backendSessionId : null,
            cwd: this.winInfo?._openSpec?.cwd || '',
          };
        }
      }
      return {
        backend: 'claude',
        backendSessionId: rawId,
        claudeId: rawId,
        cwd: this.winInfo?._openSpec?.cwd || '',
      };
    }
    const match = allSess.find(s => s.webuiId === this.sessionId);
    const backend = match?.backend || 'claude';
    const backendSessionId = match?.backendSessionId || match?.sessionId || null;
    return { backend, backendSessionId, claudeId: backend === 'claude' ? backendSessionId : null, cwd: match?.cwd || '' };
  }

  // Fetch a range of messages from server
  async _fetchMessages(offset, limit) {
    const data = await this._fetchMessagePage(offset, limit);
    return data.messages || [];
  }

  async _fetchMessagePage(offset, limit, { withStatus = false } = {}) {
    const { backend, backendSessionId, cwd } = this._getSessionIds();
    if (!backendSessionId) return { messages: [], total: 0 };
    const query = new URLSearchParams({
      backend: backend || 'claude',
      backendSessionId,
      cwd: cwd || '',
      offset: String(offset),
      limit: String(limit),
    });
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
      const firstEl = this._messageList.querySelector('.chat-msg');
      this._loadingHistory = true;
      for (const msg of msgs) {
        const el = this._renderDetached(msg);
        if (el && firstEl) this._messageList.insertBefore(el, firstEl);
      }
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
  _installSeekSentinel() {
    if (this._seekSentinel && this._seekSentinel.isConnected) return this._seekSentinel;
    const el = document.createElement('div');
    el.className = 'chat-gap-sentinel';
    el._isSeekSentinel = true;
    this._messageList.insertBefore(el, this._messageList.firstChild);
    this._seekSentinel = el;
    this._observeHistoryGap(el);
    return el;
  }

  // Toggle the content-visibility escape hatch. Turning it back ON (off=stable)
  // makes never-c-v-rendered elements collapse to the 80px estimate, which would
  // visibly shift the viewport — so re-enabling anchors on the topmost visible
  // message and compensates scrollTop to keep the view still.
  _setStableHeights(stable) {
    if (this._readOnly) return; // read-only views run without c-v permanently
    const has = this._container.classList.contains('chat-no-content-visibility');
    if (stable === has) return;
    if (stable) { this._container.classList.add('chat-no-content-visibility'); return; }
    this._container.classList.remove('chat-no-content-visibility');
    // Re-enabling content-visibility collapses never-c-v-rendered elements to
    // their 80px estimate ASYNCHRONOUSLY over the next frames — scrollHeight
    // shrinks massively and scrollTop clamps, so any delta-arithmetic
    // compensation fights the browser's own scroll anchoring and loses
    // (observed: viewport yanked ~1.5s after a minimap landing). Instead:
    // re-run the proven multi-frame centering on the JUMP TARGET itself —
    // idempotent per frame, converges after the collapse settles. Skipped if
    // the user already scrolled away from the landing (don't yank them back).
    const target = this._lastJumpTargetEl;
    const jumpAt = this._lastJumpAt || 0;
    const revealAt = this._search?._lastRevealAt || 0;
    const userScrolled = (this._lastUserScrollAt || 0) > Math.max(jumpAt, revealAt);
    if (userScrolled) return;
    // Search reveals target a RANGE inside a (possibly very tall) message —
    // replay that if it's the most recent positioning; else re-center the
    // jump target element.
    if (revealAt > jumpAt && this._search?._lastRevealRun) this._search._lastRevealRun();
    else if (target && target.isConnected) this._scrollElStable(target);
  }

  // Downward counterpart of _maybeSeekEarlier: while teleported, scrolling near
  // the bottom seek-loads the next NEWER slab so browsing continues past the
  // jumped-to point (until the end of the file / "return to latest").
  _maybeSeekLater() {
    if (!this._teleported || this._gapDownLoading) return;
    if (!Number.isFinite(this._gapCursorDown)) return;
    if (Date.now() < (this._gapDownIdleUntil || 0)) return; // at file end; back off
    this._loadLaterGap();
  }

  async _loadLaterGap() {
    this._gapDownLoading = true;
    try {
      const { backend, backendSessionId, cwd } = this._getSessionIds();
      if (!backendSessionId) return;
      const base = `backend=${encodeURIComponent(backend || 'claude')}&backendSessionId=${encodeURIComponent(backendSessionId)}&cwd=${encodeURIComponent(cwd || '')}`;
      const data = await fetch(`/api/session-history-gap?${base}&startLine=${this._gapCursorDown}&count=2000&whole=1`).then(r => r.json()).catch(() => null);
      if (this._disposed || !this._teleported) return;
      const msgs = data?.messages || [];
      if (Number.isFinite(data?.totalLines) && this._gapBounds) this._gapBounds.totalLines = data.totalLines;
      if (!msgs.length) { this._gapDownIdleUntil = Date.now() + 3000; return; } // reached file end (for now)
      for (const msg of msgs) {
        const el = this._renderGapMsg(msg);
        if (el) this._messageList.appendChild(el); // below viewport — no compensation
      }
      this._gapCursorDown = Number.isFinite(data.toLine) ? data.toLine : this._gapCursorDown;
      if (this._gapBounds && this._gapCursorDown >= this._gapBounds.totalLines) this._gapDownIdleUntil = Date.now() + 3000;
      this._trimGapDom('top');
      this._reportVisibleTsRange();
    } finally {
      this._gapDownLoading = false;
    }
  }

  // Cap the teleport-browse DOM: each slab adds hundreds of elements and gap
  // messages are exempt from the virtual-scroll trim, so a long browse would
  // otherwise grow without bound. Drop from the far side, keeping the seek
  // cursors consistent so scrolling back re-loads what was dropped. The cap must
  // comfortably hold the teleport slab + a full 2000-line slab (~1200 msgs) in
  // EACH direction — a tighter cap thrashes: an up-load trims away what a
  // down-load just added (and vice versa).
  _trimGapDom(side, cap = 3400, keep = 2400) {
    const els = this._messageList.querySelectorAll('.chat-gap-msg');
    if (els.length <= cap) return;
    const n = els.length - keep;
    const list = this._messageList;
    if (side === 'bottom') {
      // dropping BELOW the viewport — no scroll shift; rewind the down-cursor
      let firstDroppedLine = null;
      for (let i = els.length - n; i < els.length; i++) {
        const l = Number(els[i].dataset.line);
        if (firstDroppedLine == null && Number.isFinite(l)) firstDroppedLine = l;
        els[i].remove();
      }
      if (Number.isFinite(firstDroppedLine)) { this._gapCursorDown = firstDroppedLine; this._gapDownIdleUntil = 0; }
    } else {
      // dropping ABOVE the viewport — compensate scrollTop; advance the up-cursor
      const before = list.scrollHeight;
      let lastKeptFirstLine = null;
      for (let i = 0; i < n; i++) els[i].remove();
      const first = list.querySelector('.chat-gap-msg[data-line]');
      if (first) lastKeptFirstLine = Number(first.dataset.line);
      list.scrollTop -= (before - list.scrollHeight);
      const marker = this._seekSentinel;
      if (marker && Number.isFinite(lastKeptFirstLine)) {
        marker._gapCursor = lastKeptFirstLine;
        marker._gapAnchor = first;
      }
    }
  }

  // Scroll-driven trigger for continuous gap loading once the registered tail is
  // fully rendered — complements the IntersectionObserver (which only fires on
  // intersection CHANGES, and scroll compensation can pin the sentinel in place).
  _maybeSeekEarlier() {
    if (!this._gapMinimapActive) return;
    const s = this._seekSentinel;
    if (s && s.isConnected && !s._gapLoading && (s._gapCursor == null || s._gapCursor > 0)) {
      this._loadEarlierGap(s, null);
    }
  }

  // A full-window jump (jumpToIndex/jumpToBottom) cleared the gap content; the
  // sentinel survives (it's not a .chat-msg) but its cursor now points at a stale
  // line. Reset it so the next scroll-up re-seeks from the tail edge (line
  // tailStartLine) instead of skipping the [cursor, tailStartLine) span.
  _resetGapAfterJump() {
    this._teleported = false;   // a full-window jump exits teleport mode
    this._gapCursorDown = null;
    clearTimeout(this._cvRestoreTimer);
    // Restore content-visibility for the live tail (we forced it off to stabilize
    // a jumped-to slab's scroll — the tail can be long, so it wants the culling).
    this._setStableHeights(false);
    if (!this._gapMinimapActive) return;
    const s = this._installSeekSentinel();   // re-create if a prior seek removed it
    if (s) { s._gapCursor = null; s._gapAnchor = null; s._gapLoading = false; }
  }

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
  async _loadEarlierGap(markerEl, btn) {
    if (!markerEl || markerEl._gapLoading) return;
    // Tail mode: load the registered tail to completion first — the sentinel
    // loads history BELOW line tailStartLine, which must sit above a fully
    // rendered tail. Teleport mode has no registered tail, so skip this.
    if (!this._teleported && this._windowStart > 0) { await this._extendTop(); return; }
    markerEl._gapLoading = true;
    const origLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    try {
      const { backend, backendSessionId, cwd } = this._getSessionIds();
      if (!backendSessionId) return;
      const base = `backend=${encodeURIComponent(backend || 'claude')}&backendSessionId=${encodeURIComponent(backendSessionId)}&cwd=${encodeURIComponent(cwd || '')}`;
      // First fire: discover the boundary; cursor starts at the tail edge.
      if (markerEl._gapCursor == null) {
        const b = this._gapBounds;
        const tailStartLine = b?.tailStartLine
          ?? (await fetch(`/api/session-history-gap?${base}&info=1`).then(r => r.json()).catch(() => null))?.gap?.tailStartLine;
        if (!Number.isFinite(tailStartLine)) { if (btn) btn.remove(); return; }
        markerEl._gapCursor = tailStartLine;
        markerEl._gapAnchor = markerEl.nextElementSibling; // insert new (older) slabs before this
      }
      if (markerEl._gapCursor <= 0) { this._finishSeek(markerEl, btn); return; }
      // Teleport mode reads across the whole file (whole=1); tail mode stops at
      // tailStartLine (the registered tail lives below).
      const whole = this._teleported ? '&whole=1' : '';
      const data = await fetch(`/api/session-history-gap?${base}&endLine=${markerEl._gapCursor}&count=2000${whole}`).then(r => r.json()).catch(() => null);
      const msgs = data?.messages || [];
      const scrollHeightBefore = this._messageList.scrollHeight;
      const scrollTopBefore = this._messageList.scrollTop;
      const anchor = markerEl._gapAnchor && markerEl._gapAnchor.parentNode === this._messageList
        ? markerEl._gapAnchor : null;
      let firstInserted = null;
      for (const msg of msgs) {
        const el = this._renderGapMsg(msg);
        if (!el) continue;
        this._messageList.insertBefore(el, anchor);
        if (!firstInserted) firstInserted = el;
      }
      // Next (older) slab inserts above the one we just added
      if (firstInserted) markerEl._gapAnchor = firstInserted;
      markerEl._gapCursor = (data && Number.isFinite(data.fromLine)) ? data.fromLine : 0;
      // Keep the viewport stable: we inserted content below the sentinel
      this._messageList.scrollTop = scrollTopBefore + (this._messageList.scrollHeight - scrollHeightBefore);
      if (this._teleported) this._trimGapDom('bottom');
      if (markerEl._gapCursor <= 0) this._finishSeek(markerEl, btn);
    } finally {
      markerEl._gapLoading = false;
      if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = origLabel; }
    }
  }

  // Reached line 0 — the whole conversation is now loaded. Stop observing; the
  // invisible sentinel can just go away (a visible "Load earlier" button, if any
  // legacy marker is in use, is removed too).
  _finishSeek(markerEl, btn) {
    if (btn) btn.remove();
    this._gapObserver?.unobserve(markerEl);
    if (markerEl._isSeekSentinel) markerEl.remove();
  }

  // Render a gap message to a standalone element WITHOUT registering it in the
  // virtual-scroll window (_messages/_elements/_windowStart). Static + read-only.
  _renderGapMsg(msg) {
    let el;
    switch (msg.role) {
      case 'user': el = this._renderers.renderUserMsg(msg); break;
      case 'assistant': el = this._renderers.renderAssistantMsg(msg); break;
      case 'tool': el = this._renderers.renderToolMsg(msg); break;
      case 'system': { const r = this._renderers.renderSystemMsg(msg); el = r?.el || null; break; }
      default: return null;
    }
    if (!el) return null;
    el.classList.add('chat-gap-msg');
    if (Number.isFinite(msg.srcLine)) el.dataset.line = msg.srcLine;
    if (msg.ts) el.dataset.ts = msg.ts;
    this._renderers.addWrapToggles(el);
    this._renderers.addOpenInEditorBtn(el);
    return el;
  }

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
  _reportVisibleTsRange() {
    if (!this._gapMinimapActive) return;
    const list = this._messageList;
    const lr = list.getBoundingClientRect();
    // Teleport = browsing history, so every visible message is historical: any ts
    // past the conversation's last real turn is a Date.now() fallback the
    // normalizer stamped on slab records that lacked a timestamp (orphan tool
    // results). Ignore those or they'd stretch the thumb to the recent end.
    const ceil = this._teleported && this._convoLastTs ? this._convoLastTs + 1000 : Infinity;
    let minTs = null, maxTs = null;
    for (const el of list.querySelectorAll('.chat-msg')) {
      const rc = el.getBoundingClientRect();
      if (rc.bottom < lr.top || rc.top > lr.bottom) continue; // not actually visible
      const ts = Number(el.dataset.ts) || this._tsOfRenderedEl(el);
      if (!ts || ts > ceil) continue;
      if (minTs == null || ts < minTs) minTs = ts;
      if (maxTs == null || ts > maxTs) maxTs = ts;
    }
    if (minTs != null) this._chatMinimap.setVisibleTsRange(minTs, maxTs);
  }

  _tsOfRenderedEl(el) {
    const id = el.dataset.msgId;
    if (!id) return 0;
    const m = this._messages.find(mm => mm.id === id);
    return m?.ts || 0;
  }

  // Minimap click/drag in time mode: jump to a turn at file `line`. Teleports
  // to a seek-loaded slab around that absolute line, then scrolls to nearest ts.
  async _jumpToFileTime(ts, line) {
    // Already rendered in the live view? Just scroll (tight tolerance — beyond
    // ±2s the actual turn isn't rendered and we teleport instead).
    if (!this._teleported && this._scrollToNearestTs(ts, 2000)) return null;
    let el = this._gapElForLine(line);
    if (!el) el = await this._seekTeleport(line);
    const target = this._nearestElByTs(ts) || el;
    if (target) {
      this._scrollElStable(target);
      this._reportVisibleTsRange();
    }
    return target;
  }

  // Center an element with iterative convergence: after a teleport loads a big
  // slab, content-visibility computes real heights over several frames and a
  // single scrollTop set drifts. Re-center over ~12 frames until stable. Holds
  // the programmatic-scroll guard so auto-load doesn't fire mid-scroll.
  _scrollElStable(el) {
    if (!el || !el.isConnected) return;
    this._lastJumpTargetEl = el;
    this._lastJumpAt = Date.now();
    this._programmaticScroll = true;
    clearTimeout(this._jumpGuardTimer);
    this._jumpGuardTimer = setTimeout(() => { this._programmaticScroll = false; }, 1100);
    const list = this._messageList;
    const center = () => {
      if (!el.isConnected) return;
      const lr = list.getBoundingClientRect();
      const rc = el.getBoundingClientRect();
      list.scrollTop += rc.top - lr.top - lr.height / 2;
    };
    let n = 0;
    const step = () => { center(); if (++n < 12) requestAnimationFrame(step); };
    step();
    // content-visibility keeps computing off-screen heights for ~1s after the
    // jump, shifting the target after rAF convergence ends — re-center a few
    // more times on a timer to stay locked on.
    for (const d of [180, 400, 750]) setTimeout(center, d);
  }

  // Teleport: replace the whole view with a read-only slab seek-loaded around an
  // ABSOLUTE file line (whole=1, so it works in the tail region too and is immune
  // to the live tail sliding). Scrolling up continues seeking older by line; the
  // scroll-to-bottom button returns to the live/registered tail. This is the one
  // jump primitive — search + minimap both go through it, so there is no
  // normalized-index drift regardless of session size or live growth.
  async _seekTeleport(line) {
    const { backend, backendSessionId, cwd } = this._getSessionIds();
    if (!backendSessionId) return null;
    const base = `backend=${encodeURIComponent(backend || 'claude')}&backendSessionId=${encodeURIComponent(backendSessionId)}&cwd=${encodeURIComponent(cwd || '')}`;
    // Small slab (~600 lines) centered on the target: fewer messages render far
    // faster and — critically — settle their real heights almost instantly, so
    // the scroll lands in one shot. Scrolling up seek-loads more on demand.
    const start = Math.max(0, line - 300);
    const data = await fetch(`/api/session-history-gap?${base}&startLine=${start}&count=600&whole=1`).then(r => r.json()).catch(() => null);
    if (this._disposed) return null;
    const msgs = data?.messages || [];
    if (!msgs.length) return null;
    // Replace the entire rendered view with this slab; keep + reset the sentinel.
    this._teleported = true;
    this._gapCursorDown = Number.isFinite(data.toLine) ? data.toLine : null; // next NEWER slab starts here
    this._gapDownIdleUntil = 0;
    if (Number.isFinite(data.totalLines) && this._gapBounds) this._gapBounds.totalLines = data.totalLines;
    // Force stable heights while the jump lands: content-visibility's 80px
    // estimate is wildly off for code/tool cards, so with it ON the scroll chases
    // a target that keeps moving as real heights compute. Re-enabled (with scroll
    // compensation) once landed, so long browsing doesn't pile up thousands of
    // fully-laid-out elements.
    this._setStableHeights(true);
    clearTimeout(this._cvRestoreTimer);
    this._cvRestoreTimer = setTimeout(() => this._setStableHeights(false), 1600);
    this._messageList.querySelectorAll('.chat-msg, .chat-msg-system').forEach(el => el.remove());
    this._elements.clear();
    this._renderedMsgIds.clear();
    this._messages = [];
    const marker = this._installSeekSentinel();
    marker._gapCursor = Number.isFinite(data.fromLine) ? data.fromLine : start;
    marker._gapLoading = false;
    let firstInserted = null;
    for (const msg of msgs) {
      const el = this._renderGapMsg(msg);
      if (!el) continue;
      this._messageList.appendChild(el);      // sentinel stays first, slab follows
      if (!firstInserted) firstInserted = el;
    }
    marker._gapAnchor = firstInserted;         // older slabs insert above this
    this._pinned = false;
    this._scrollBtn.classList.remove('hidden'); // "return to latest" affordance
    const target = this._gapElForLine(line) || firstInserted;
    // Scroll to the target SYNCHRONOUSLY (before the browser paints) so the jump
    // doesn't flash the top of the slab then visibly scroll down. Heights are
    // stable (content-visibility forced off above), so this lands correctly.
    if (target) {
      const lr = this._messageList.getBoundingClientRect();
      const rc = target.getBoundingClientRect();
      this._messageList.scrollTop += rc.top - lr.top - lr.height / 2;
    }
    return target;
  }

  // ── Full-file search support (huge sessions) ──
  // Jump to a search match given file-line + ts. Teleports to a slab around the
  // absolute line, then returns the DOM element nearest the match (by ts) so the
  // caller can expand + highlight it.
  async jumpToFileMatch(match) {
    const line = match.line;
    const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    // Hold the programmatic-scroll guard across the jump + the caller's reveal so
    // scroll-driven auto-load can't yank a slab in under the target mid-reveal.
    this._programmaticScroll = true;
    clearTimeout(this._jumpGuardTimer);
    this._jumpGuardTimer = setTimeout(() => { this._programmaticScroll = false; }, 700);
    // Fast path: the match is already RENDERED in the live view (recent tail) —
    // just scroll to it. Replacing the live view with a read-only teleport slab
    // for something on screen was jarring. Tight ts tolerance: a rendered
    // element further off than ±2s means the actual record isn't rendered.
    if (!this._teleported) {
      const near = this._nearestElByTs(match.ts);
      const nts = near ? (Number(near.dataset.ts) || this._tsOfRenderedEl(near)) : 0;
      if (near && Math.abs(nts - match.ts) < 2000) {
        this._scrollElStable(near);
        this._reportVisibleTsRange();
        return near;
      }
    }
    let el = this._gapElForLine(line);          // fast path: already in the loaded slab
    if (!el) { await this._seekTeleport(line); await settle(); }
    const target = this._nearestElByTs(match.ts) || this._gapElForLine(line);
    if (target) { this._scrollElStable(target); this._reportVisibleTsRange(); }
    return target;
  }

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
  _scrollToNearestTs(ts, tolMs = Infinity) {
    let best = null, bestDiff = Infinity;
    for (const el of this._messageList.querySelectorAll('.chat-msg')) {
      const ets = Number(el.dataset.ts) || this._tsOfRenderedEl(el);
      if (!ets) continue;
      const d = Math.abs(ets - ts);
      if (d < bestDiff) { bestDiff = d; best = el; }
    }
    if (best && bestDiff <= tolMs) {
      this._programmaticScroll = true;
      best.scrollIntoView({ block: 'center' });
      setTimeout(() => { this._programmaticScroll = false; }, 60);
      this._reportVisibleTsRange();
      return true;
    }
    return false;
  }

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
        return `running ${msg.toolName || 'tool'}...`;
      }
      if (msg.status !== 'streaming') continue;
      const block = msg.content?.[0];
      if (msg.role === 'tool') return `running ${msg.toolName || block?.toolName || 'tool'}...`;
      if (block?.type === 'thinking') return 'thinking...';
      if (block?.type === 'text') return 'responding...';
      return 'thinking...';
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
        this.app.viewSession(reviewThreadId, cwd, 'Review', {
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
    if (this._pinned) this._scrollToBottom();
  }

  // Edit an existing message → re-render in place
  _onEditMessage(id, fields) {
    // Update stored message
    const msgIdx = this._messages.findIndex(m => m.id === id);
    if (msgIdx < 0) return;
    const msg = this._messages[msgIdx];
    Object.assign(msg, fields);
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
      if (summaryEl) summaryEl.textContent = 'Thinking';
      if (preEl) preEl.textContent = stripAnsi(msg.content[0].text || '');
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
        this._renderers.appendSystem(`Goal met: ${gs.condition}`);
      } else if (gs?.condition) {
        this._statusBar.setGoal(gs.condition);
        if (gs.sentinel) this._renderers.appendSystem(`Goal set: ${gs.condition}`);
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
  _showTyping(label = 'thinking...') {
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
      let statusEl = pending.querySelector('.chat-agent-live-status');
      if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'chat-agent-live-status';
        const outputPending = pending.querySelector('.chat-tool-output-pending');
        if (outputPending) outputPending.before(statusEl);
        else pending.appendChild(statusEl);
      }
      const count = this._subagentCounts.get(parentToolUseId);
      // Detect activity from raw subagent message
      let activity = '';
      const c = msg.message?.content || msg.content;
      if (Array.isArray(c)) {
        const last = c[c.length - 1];
        if (last?.type === 'tool_use' || last?.type === 'tool_call') activity = `running ${last.name || last.toolName || 'tool'}`;
        else if (last?.type === 'thinking') activity = 'thinking';
        else if (last?.type === 'text') activity = 'responding';
      }
      // Find description from stored messages
      const toolMsg = this._messages.find(m => m.toolCallId === parentToolUseId);
      const desc = toolMsg?.content?.[0]?.input?.description || '';
      const threadId = toolMsg?.taskInfo?.receiverThreadIds?.[0] || '';
      const threadAttr = threadId ? ` data-thread-id="${escHtml(threadId)}"` : ` data-parent-tool-id="${escHtml(parentToolUseId)}"`;
      statusEl.innerHTML = `<span class="chat-agent-live-count">${count} messages${activity ? ' \u2022 ' + escHtml(activity) : ''}</span> <button class="chat-agent-view-btn"${threadAttr} data-desc="${escHtml(desc)}">View Log</button>`;
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

    const title = `Agent: ${description || 'Subagent'}`;
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

    // One-time handler for attach response
    const handler = (msg) => {
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
    const label = inProgress ? inProgress.activeForm || inProgress.content : `${completed}/${total} done`;
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
    overlay.innerHTML = '<div class="chat-drop-hint">Drop to upload to the working directory</div>';
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
      if (msg.isStreaming) this._showTyping(msg.streamingLabel || 'thinking...');
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
    btn.innerHTML = `${UI_ICONS.refresh} <span>Resume this session</span>`;
    btn.title = 'Resume the session and continue chatting';
    btn.onclick = () => this._resumeAndClose();

    const note = document.createElement('div');
    note.className = 'chat-resume-note';
    note.textContent = 'Session is read-only.';

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
    note.textContent = 'Claude CLI is not logged in. Open a terminal to run /login, then retry.';

    const loginBtn = document.createElement('button');
    loginBtn.className = 'chat-resume-btn';
    loginBtn.innerHTML = `${UI_ICONS.wrench} <span>Open Login Terminal</span>`;
    loginBtn.onclick = () => {
      // Open a terminal window running claude (user can /login there)
      const ids = this._getSessionIds();
      const cwd = ids.cwd || this.winInfo?._openSpec?.cwd || '';
      this.app.createSession({ cwd, mode: 'terminal', backend: ids.backend || 'claude' });
    };

    const retryBtn = document.createElement('button');
    retryBtn.className = 'chat-resume-btn';
    retryBtn.innerHTML = `${UI_ICONS.refresh} <span>Retry</span>`;
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

  dispose() {
    this._disposed = true;
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
