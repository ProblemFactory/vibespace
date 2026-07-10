import { t } from './i18n.js';
import { metric } from './telemetry-client.js';

/**
 * ChatView gap-seek mixin — the huge-JSONL continuous-scroll machinery
 * (sentinel, bidirectional slab loading, teleport jumps, stable-height
 * landings, visible-range reporting). Extracted from chat-view.js (2.92.0)
 * purely mechanically — see CLAUDE.md "huge sessions" for the design.
 * Installed on ChatView.prototype at chat-view.js module tail.
 */
export function installChatSeek(ChatView) {
  Object.assign(ChatView.prototype, {
    _installSeekSentinel() {
    if (this._seekSentinel && this._seekSentinel.isConnected) return this._seekSentinel;
    const el = document.createElement('div');
    el.className = 'chat-gap-sentinel';
    el._isSeekSentinel = true;
    this._messageList.insertBefore(el, this._messageList.firstChild);
    this._seekSentinel = el;
    this._observeHistoryGap(el);
    return el;
  },

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
  },

    _maybeSeekLater() {
    if (!this._teleported || this._gapDownLoading) return;
    if (!Number.isFinite(this._gapCursorDown)) return;
    if (Date.now() < (this._gapDownIdleUntil || 0)) return; // at file end; back off
    this._loadLaterGap();
  },

    async _loadLaterGap() {
      const _t0 = performance.now();
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
      metric('gap-slab-load-ms', performance.now() - _t0);
    } finally {
      this._gapDownLoading = false;
    }
  },

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
  },

    _maybeSeekEarlier() {
    if (!this._gapMinimapActive) return;
    const s = this._seekSentinel;
    if (s && s.isConnected && !s._gapLoading && (s._gapCursor == null || s._gapCursor > 0)) {
      this._loadEarlierGap(s, null);
    }
  },

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
  },

    async _loadEarlierGap(markerEl, btn) {
      const _t0 = performance.now();
    if (!markerEl || markerEl._gapLoading) return;
    // Tail mode: load the registered tail to completion first — the sentinel
    // loads history BELOW line tailStartLine, which must sit above a fully
    // rendered tail. Teleport mode has no registered tail, so skip this.
    if (!this._teleported && this._windowStart > 0) { await this._extendTop(); return; }
    markerEl._gapLoading = true;
    const origLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = t('Loading…'); }
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
      metric('gap-slab-load-ms', performance.now() - _t0);
      // Keep the viewport stable: we inserted content below the sentinel
      this._messageList.scrollTop = scrollTopBefore + (this._messageList.scrollHeight - scrollHeightBefore);
      if (this._teleported) this._trimGapDom('bottom');
      if (markerEl._gapCursor <= 0) this._finishSeek(markerEl, btn);
    } finally {
      markerEl._gapLoading = false;
      if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = origLabel; }
    }
  },

    _finishSeek(markerEl, btn) {
    if (btn) btn.remove();
    this._gapObserver?.unobserve(markerEl);
    if (markerEl._isSeekSentinel) markerEl.remove();
  },

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
  },

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
    // Document order lets us skip both tails: resume near the last frame's
    // first-visible index instead of rect-measuring the whole above-viewport
    // prefix, and break at the first element below the viewport — this ran
    // getBoundingClientRect on EVERY rendered message per scroll frame
    // (thousands in a teleport slab; audit round-3).
    const els = list.querySelectorAll('.chat-msg');
    let start = Math.min(this._visStartIdx || 0, Math.max(0, els.length - 1));
    // The remembered index may now be past the viewport (scrolled up) — walk
    // back while the element at start is still below the viewport top.
    while (start > 0 && els[start].getBoundingClientRect().bottom >= lr.top) start--;
    let firstVisible = -1;
    for (let i = start; i < els.length; i++) {
      const el = els[i];
      const rc = el.getBoundingClientRect();
      if (rc.top > lr.bottom) break; // document order: everything after is below the viewport
      if (rc.bottom < lr.top) continue; // above the viewport
      if (firstVisible < 0) firstVisible = i;
      const ts = Number(el.dataset.ts) || this._tsOfRenderedEl(el);
      if (!ts || ts > ceil) continue;
      if (minTs == null || ts < minTs) minTs = ts;
      if (maxTs == null || ts > maxTs) maxTs = ts;
    }
    this._visStartIdx = firstVisible >= 0 ? firstVisible : 0;
    if (minTs != null) this._chatMinimap.setVisibleTsRange(minTs, maxTs);
  },

    _tsOfRenderedEl(el) {
    const id = el.dataset.msgId;
    if (!id) return 0;
    const m = this._messages.find(mm => mm.id === id);
    return m?.ts || 0;
  },

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
  },

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
  },

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
  },

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
  },

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
  },
  });
}
