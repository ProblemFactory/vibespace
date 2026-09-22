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
    this._trace?.('seek:sentinel', { kids: this._messageList.childElementCount, ws: this._windowStart, tp: this._teleported ? 1 : 0 });
    return el;
  },

    _setStableHeights(stable, { recenter = true, why = '' } = {}) {
    if (this._readOnly) return; // read-only views run without c-v permanently
    const has = this._container.classList.contains('chat-no-content-visibility');
    if (stable === has) return;
    if (stable) { this._container.classList.add('chat-no-content-visibility'); this._trace?.('stableHeights', { on: 1, why }); return; }
    this._container.classList.remove('chat-no-content-visibility');
    // `recenter:false` — the caller is mid-gesture (a gap slab dropped by the
    // top trim on the way back to the tail): no jump-target re-centering here
    if (!recenter) { this._trace?.('stableHeights', { on: 0, replay: 'none', why, st: Math.round(this._messageList.scrollTop), sh: this._messageList.scrollHeight }); return; }
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
    // Search reveals target a RANGE inside a (possibly very tall) message —
    // replay that if it's the most recent positioning; else re-center the
    // jump target element.
    const replay = userScrolled ? 'userScrolled' : (revealAt > jumpAt && this._search?._lastRevealRun) ? 'reveal' : (target && target.isConnected) ? 'target' : 'none';
    this._trace?.('stableHeights', { on: 0, replay, st: Math.round(this._messageList.scrollTop), sh: this._messageList.scrollHeight });
    if (userScrolled) return;
    if (replay === 'reveal') this._search._lastRevealRun();
    else if (replay === 'target') this._scrollElStable(target);
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
      const base = this._gapQueryBase();
      if (!base) return;
      this._trace?.('gapDown:req', { cursor: this._gapCursorDown });
      const r = await this._gapFetch(`/api/session-history-gap?${base}&startLine=${this._gapCursorDown}&count=2000&whole=1`);
      if (this._disposed || !this._teleported) return;
      if (!r.ok) {
        this._trace?.('gapDown:fail', { cursor: this._gapCursorDown });
        // A FAILED fetch is not "reached the end of the file": leave the
        // down-cursor where it is, back off, and say so — reading the failure
        // as end-of-file silently froze downward browsing at the blip.
        this._gapDownIdleUntil = Date.now() + 5000;
        this._showHistoryStatus(t('Couldn\'t load newer messages'), {
          kind: 'error', autoHideMs: 6000,
          retry: () => { this._gapDownIdleUntil = 0; this._loadLaterGap(); },
        });
        return;
      }
      const data = r.data;
      const msgs = data?.messages || [];
      if (Number.isFinite(data?.totalLines) && this._gapBounds) this._gapBounds.totalLines = data.totalLines;
      if (!msgs.length) { this._gapDownIdleUntil = Date.now() + 3000; this._trace?.('gapDown:end', { cursor: this._gapCursorDown }); return; } // reached file end (for now)
      const appended = [];
      for (const msg of msgs) {
        const el = this._renderGapMsg(msg);
        if (el) { this._messageList.appendChild(el); appended.push(el); } // below viewport — no compensation
      }
      this._reserveFreshHeights?.(appended);   // measured heights (see _loadEarlierGap)
      this._applyWheelCarry?.('down', 'gapDown:carry');
      this._gapCursorDown = Number.isFinite(data.toLine) ? data.toLine : this._gapCursorDown;
      if (this._gapBounds && this._gapCursorDown >= this._gapBounds.totalLines) this._gapDownIdleUntil = Date.now() + 3000;
      this._trimGapDom('top');
      this._trace?.('gapDown:done', { n: msgs.length, cursor: this._gapCursorDown, st: Math.round(this._messageList.scrollTop), sh: this._messageList.scrollHeight });
      this._reportVisibleTsRange();
      metric('gap-slab-load-ms', performance.now() - _t0);
    } finally {
      this._gapDownLoading = false;
    }
  },

    _trimGapDom(side, cap = 3400, keep = 2400) {
    const list = this._messageList;
    const els = list.querySelectorAll(':scope > .chat-gap-msg');
    if (els.length <= cap) return;
    // THE KEEP ZONE (inc-mubvu3a4-x8sb): like the window trims, a gap trim never
    // removes a card within a viewport of the viewport — by count from the far
    // side, stopping at the zone's edge (the cursor rewind below needs the
    // dropped set contiguous from that side, which stopping early keeps).
    const zone = this._keepZone();
    const pos = this._cardPositions(els);
    let n = 0;
    const want = els.length - keep;
    if (side === 'bottom') { for (let i = els.length - 1; i >= 0 && n < want; i--) { if (pos[i].top < zone.bottom) break; n++; } }
    else { for (let i = 0; i < els.length && n < want; i++) { if (pos[i].bottom > zone.top) break; n++; } }
    if (!n) { this._trace?.('trimGap', { side, removed: 0, why: 'zone', left: els.length, st: Math.round(list.scrollTop), sh: list.scrollHeight }); return; }
    if (side === 'bottom') {
      // dropping BELOW the viewport — no scroll shift; rewind the down-cursor
      let firstDroppedLine = null;
      for (let i = els.length - n; i < els.length; i++) {
        const l = Number(els[i].dataset.line);
        if (firstDroppedLine == null && Number.isFinite(l)) firstDroppedLine = l;
        els[i].remove();
      }
      if (Number.isFinite(firstDroppedLine)) { this._gapCursorDown = firstDroppedLine; this._gapDownIdleUntil = 0; }
      this._trace?.('trimGap', { side: 'bottom', removed: n, left: els.length - n, st: Math.round(list.scrollTop), sh: list.scrollHeight, cursorDown: this._gapCursorDown });
    } else {
      // dropping ABOVE the viewport — element-anchored (see _withViewportAnchor)
      const before = list.scrollHeight;
      const stBefore = list.scrollTop;
      let lastKeptFirstLine = null;
      const ok = this._withViewportAnchor(() => {
        for (let i = 0; i < n; i++) els[i].remove();
      });
      const first = list.querySelector('.chat-gap-msg[data-line]');
      if (first) lastKeptFirstLine = Number(first.dataset.line);
      if (!ok) { this._traceExpect?.('trimGap:delta'); list.scrollTop -= (before - list.scrollHeight); }
      const marker = this._seekSentinel;
      if (marker && Number.isFinite(lastKeptFirstLine)) {
        marker._gapCursor = lastKeptFirstLine;
        marker._gapAnchor = first;
      }
      this._trace?.('trimGap', { side: 'top', removed: n, left: els.length - n, anchored: ok, from: Math.round(stBefore), to: Math.round(list.scrollTop), shBefore: before, sh: list.scrollHeight, cursor: lastKeptFirstLine });
    }
  },

    _maybeSeekEarlier() {
    if (!this._gapMinimapActive) return;
    const s = this._seekSentinel;
    // _gapRetryAt: a failed slab keeps the sentinel (so history stays
    // reachable) — without a backoff the scroll handler would re-fire the same
    // doomed request every frame while the user sits at the top.
    if (s && s.isConnected && !s._gapLoading && Date.now() >= (s._gapRetryAt || 0)
        && (s._gapCursor == null || s._gapCursor > 0)) {
      this._loadEarlierGap(s, null);   // AUTOMATIC: gated inside (_autoPagingBlocked)
    }
  },

    _resetGapAfterJump() {
    this._trace?.('gapReset', { wasTeleported: this._teleported ? 1 : 0 });
    this._clearWheelCarry?.('gapReset');   // a carried notch is stale after a full-window jump (verifier r1)
    this._teleported = false;   // a full-window jump exits teleport mode
    this._gapCursorDown = null;
    clearTimeout(this._cvRestoreTimer);
    // Restore content-visibility for the live tail (we forced it off to stabilize
    // a jumped-to slab's scroll — the tail can be long, so it wants the culling).
    this._setStableHeights(false);
    if (!this._gapMinimapActive) return;
    const s = this._installSeekSentinel();   // re-create if a prior seek removed it
    if (s) { s._gapCursor = null; s._gapAnchor = null; s._gapLoading = false; s._gapRetryAt = 0; }
  },

    async _loadEarlierGap(markerEl, btn, { auto = true, via = 'seek' } = {}) {
      const _t0 = performance.now();
    if (!markerEl || markerEl._gapLoading) return;
    // AUTOMATIC callers (the sentinel's IntersectionObserver and the
    // scroll/wheel-driven _maybeSeekEarlier) obey the same laws as the scroll
    // handler — suspended / just-resumed / pinned / settling / no recent user
    // input all mean "this is displacement, not intent" (inc-mtq5bpjt-0o0n:
    // this function was the ONE upward-paging entry point with no gate at all,
    // and a desktop resume drove it straight through the tail branch below).
    // The guard lives HERE, on the path that is alive in the failure state —
    // an explicit user gesture (retry click) passes auto:false and bypasses it.
    if (auto) {
      const why = this._autoPagingBlocked();
      if (why) { this._trace?.('gapSkip', { why, via }); return; }
    }
    // Tail mode: load the registered tail to completion first — the sentinel
    // loads history BELOW line tailStartLine, which must sit above a fully
    // rendered tail. Teleport mode has no registered tail, so skip this.
    if (!this._teleported && this._windowStart > 0) this._trace?.('gapUp:tail', { via, ws: this._windowStart });
    if (!this._teleported && this._windowStart > 0) { await this._extendTop(); return; }
    markerEl._gapLoading = true;
    const origLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = t('Loading…'); }
    const endLoad = this._beginHistoryLoad(t('Loading earlier messages…'));
    // Retry backoff for the sentinel's scroll-driven auto-load: without it a
    // persistent failure (host down, transcript unreadable) would re-fire on
    // every scroll frame.
    const failed = (retryable = true) => {
      if (retryable) markerEl._gapRetryAt = Date.now() + 5000;
      this._showHistoryStatus(t('Couldn\'t load earlier messages'), {
        kind: 'error',
        // an explicit retry CLICK is intent — never gated by _autoPagingBlocked
        retry: () => { markerEl._gapRetryAt = 0; this._loadEarlierGap(markerEl, btn, { auto: false }); },
      });
    };
    try {
      const base = this._gapQueryBase();
      if (!base) return;
      // First fire: discover the boundary; cursor starts at the tail edge.
      if (markerEl._gapCursor == null) {
        const b = this._gapBounds;
        let tailStartLine = b?.tailStartLine;
        if (!Number.isFinite(tailStartLine)) {
          const info = await this._gapFetch(`/api/session-history-gap?${base}&info=1`);
          // Failure here used to look identical to "this session has no gap":
          // the button was REMOVED and earlier history became unreachable.
          if (!info.ok) { failed(); return; }
          tailStartLine = info.data?.gap?.tailStartLine;
        }
        if (!Number.isFinite(tailStartLine)) { if (btn) btn.remove(); return; }
        markerEl._gapCursor = tailStartLine;
        this._trace?.('gapUp:first', { tailStartLine, kids: this._messageList.childElementCount });
        // Insert new (older) slabs before this. NEVER anchor on a run-fold
        // header — _updateRuns destroys and rebuilds every header on each
        // pass, and a dead anchor used to fall back to insertBefore(null)
        // = APPEND, landing an older slab BELOW the live tail (review
        // finding). Members (.chat-msg) only ever get class-toggled — stable.
        let gapA = markerEl.nextElementSibling;
        while (gapA && (gapA.classList?.contains('chat-run-header') || gapA.classList?.contains('chat-run-footer'))) gapA = gapA.nextElementSibling;
        markerEl._gapAnchor = gapA;
      }
      if (markerEl._gapCursor <= 0) { this._finishSeek(markerEl, btn); return; }
      // Teleport mode reads across the whole file (whole=1); tail mode stops at
      // tailStartLine (the registered tail lives below).
      const whole = this._teleported ? '&whole=1' : '';
      // the slab lands on the sentinel EPOCH it was asked on: a `_dropGapSlab`
      // (the window left message 0 while this fetch was in flight) bumps it,
      // and a slab from the old epoch would re-create the stale gap above a
      // tail that no longer starts at 0 (verifier r1)
      const epoch = markerEl._gapEpoch || 0;
      this._trace?.('gapUp:req', { cursor: markerEl._gapCursor, via, whole: whole ? 1 : 0 });
      const r = await this._gapFetch(`/api/session-history-gap?${base}&endLine=${markerEl._gapCursor}&count=2000${whole}`);
      if ((markerEl._gapEpoch || 0) !== epoch) { this._trace?.('gapUp:stale', { epoch, now: markerEl._gapEpoch }); return; }
      // THE incident this whole function was hardened for: `.catch(()=>null)`
      // made a transient failure (server restart mid-scroll, remote slab
      // timing out) indistinguishable from a real reply, the cursor fell to 0
      // and _finishSeek REMOVED the sentinel — earlier history became
      // permanently unreachable for the window's lifetime and the conversation
      // appeared to begin at the blip, with no error at all. A failure now
      // leaves the cursor untouched and never reaches _finishSeek.
      if (!r.ok) { this._trace?.('gapUp:fail', { why: 'fetch' }); failed(); return; }
      const data = r.data;
      const msgs = data?.messages || [];
      const scrollHeightBefore = this._messageList.scrollHeight;
      const scrollTopBefore = this._messageList.scrollTop;
      // Element-anchored viewport preservation (same estimate-vs-real
      // content-visibility flaw as _extendTop — see _withViewportAnchor).
      let firstInserted = null;
      const inserted = [];
      const anchoredOk = this._withViewportAnchor(() => {
        // A TAIL-MODE GAP SLAB RUNS WITH STABLE HEIGHTS (verifier r1, measured
        // in headless chrome on the §1c fixture): with content-visibility on,
        // the slab's visible cards flipped between their 80 px placeholder and
        // their real size on ALTERNATE FRAMES during a wheel (sh 4173 ↔ 18723,
        // 2,205 resize events in six frames, no write of ours) and native
        // scroll anchoring cancelled the wheel against the flips — a 2,800 px
        // fling moved the reader's card under 110 px, both directions; the
        // measured-heights reserve did not stop it, content-visibility OFF did
        // (0 resizes, the wheel delivered exactly). Folded members are
        // display:none, so the cost is the slab's visible cards. Turned on
        // INSIDE the anchored section so the restore covers the re-layout;
        // `_dropGapSlab` turns it off when the window leaves message 0, the
        // jumps through `_resetGapAfterJump`. Teleport keeps its own regime.
        if (!this._teleported) this._setStableHeights(true, { why: 'gapSlab' });
        // Dead anchor (removed by a runs pass / trim) → insert right after the
        // sentinel, i.e. at the TOP of history — never null (= list end, which
        // corrupted ordering by appending older records below the live tail).
        const insRef = markerEl._gapAnchor && markerEl._gapAnchor.parentNode === this._messageList
          ? markerEl._gapAnchor : markerEl.nextSibling;
        for (const msg of msgs) {
          const el = this._renderGapMsg(msg);
          if (!el) continue;
          this._messageList.insertBefore(el, insRef);
          inserted.push(el);
          if (!firstInserted) firstInserted = el;
        }
        // MEASURED heights for the slab, like a window slab (verifier r1): with
        // content-visibility on, a gap slab's 80 px placeholders flipped to
        // their real size under the reader, and native scroll anchoring
        // answered every flip inside the frame — a 2,800 px fling moved the
        // reader's card under 110 px, in both directions, with an empty ring.
        this._reserveFreshHeights?.(inserted);
      });
      // Next (older) slab inserts above the one we just added
      if (firstInserted) markerEl._gapAnchor = firstInserted;
      if (Number.isFinite(data?.fromLine)) {
        markerEl._gapCursor = data.fromLine;
        markerEl._gapRetryAt = 0;
      } else {
        // 200 OK but no fromLine = `{gap:null}` — the server could not resolve
        // the transcript at all (remote cache still empty / file gone). That is
        // NOT "we reached line 0", so keep the cursor and let the user retry
        // instead of ending paging (the ?host= fix makes the remote case
        // resolvable, this is the belt).
        this._trace?.('gapUp:fail', { why: 'nofrom' });
        failed();
        return;
      }
      metric('gap-slab-load-ms', performance.now() - _t0);
      if (!anchoredOk) {
        // fallback: old delta math (no usable anchor)
        this._traceExpect?.('gapUp:delta');
        this._messageList.scrollTop = scrollTopBefore + (this._messageList.scrollHeight - scrollHeightBefore);
      }
      // THE LANDING (inc-mubvu3a4-x8sb): every slab names its size, where the
      // cursor moved to, whether the anchor held, and the geometry it left —
      // the seek path shipped no evidence at all before this.
      // the carried wheel-up notch lands here too (the seek path used to eat it)
      this._applyWheelCarry?.('up', 'gapUp:carry');
      this._trace?.('gapUp:done', { n: msgs.length, from: data.fromLine, anchored: anchoredOk, st: Math.round(this._messageList.scrollTop), sh: this._messageList.scrollHeight, dsh: this._messageList.scrollHeight - scrollHeightBefore, kids: this._messageList.childElementCount });
      if (this._teleported) this._trimGapDom('bottom');
      if (markerEl._gapCursor <= 0) this._finishSeek(markerEl, btn);
    } catch (e) {
      // Anything thrown between the fetch and the insert (a renderer blowing up
      // on one record) used to leave the sentinel silently stuck.
      this._trace?.('gapUp:fail', { why: 'throw' });
      failed();
    } finally {
      endLoad();
      markerEl._gapLoading = false;
      if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = origLabel; }
    }
  },

    _finishSeek(markerEl, btn) {
    this._trace?.('seek:finish', { st: Math.round(this._messageList.scrollTop), sh: this._messageList.scrollHeight });
    if (btn) btn.remove();
    this._gapObserver?.unobserve(markerEl);
    if (markerEl._isSeekSentinel) markerEl.remove();
  },

  /** The FOURTH path that builds an element for a message (round 3): a seek
   *  slab's records. Its elements deliberately never enter `this._elements`
   *  (they are outside the virtual window's accounting), which is exactly why
   *  the round-2 hook — keyed to `_elements.set` — missed it, and a retraction
   *  reached through a gap slab rendered as ordinary live history. That is the
   *  §2.10 failure itself: past 34MB (JSONL_HEAD_BYTES + JSONL_TAIL_BYTES) the
   *  seek path is the ONLY way to read that history, the server's `gapSlab`
   *  normalizes the slab through the same message manager, and codex carries
   *  `thread_rolled_back` in the ROLLOUT — so `msg.rewound` genuinely arrives
   *  here. Marks are re-derived from view state like everywhere else. */
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
    this._applyElementMarks(el, msg);
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
    this._noteUserNav('jumpToFileTime');   // minimap time landing: a reader act, not a re-measure
    // Already rendered in the live view? Just scroll (tight tolerance — beyond
    // ±2s the actual turn isn't rendered and we teleport instead).
    if (!this._teleported && this._scrollToNearestTs(ts, 2000)) { this._trace?.('jumpTime', { line, path: 'near' }); return null; }
    let el = this._gapElForLine(line);
    this._trace?.('jumpTime', { line, path: el ? 'loaded' : 'teleport' });
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
    this._trace?.('landStable', { st: Math.round(list.scrollTop), sh: list.scrollHeight });
    const center = () => {
      if (!el.isConnected) return;
      const lr = list.getBoundingClientRect();
      const rc = el.getBoundingClientRect();
      this._traceExpect?.('landStable');
      list.scrollTop += rc.top - lr.top - lr.height / 2;
    };
    let n = 0;
    const step = () => { center(); if (++n < 12) requestAnimationFrame(step); };
    step();
    // content-visibility keeps computing off-screen heights for ~1s after the
    // jump, shifting the target after rAF convergence ends — re-center a few
    // more times on a timer to stay locked on.
    for (const d of [180, 400, 750]) setTimeout(() => { center(); if (d === 750) this._trace?.('landStable:end', { st: Math.round(list.scrollTop), sh: list.scrollHeight, connected: el.isConnected ? 1 : 0 }); }, d);
  },

    async _seekTeleport(line) {
    const base = this._gapQueryBase();
    if (!base) return null;
    // Small slab (~600 lines) centered on the target: fewer messages render far
    // faster and — critically — settle their real heights almost instantly, so
    // the scroll lands in one shot. Scrolling up seek-loads more on demand.
    const start = Math.max(0, line - 300);
    this._trace?.('teleport:req', { line, start });
    const endLoad = this._beginHistoryLoad(t('Jumping to that point in the conversation…'));
    const r = await this._gapFetch(`/api/session-history-gap?${base}&startLine=${start}&count=600&whole=1`);
    endLoad();
    if (this._disposed) return null;
    if (!r.ok) {
      this._trace?.('teleport:fail', { line, why: 'fetch' });
      // A minimap click / search jump that silently did nothing (the whole
      // teleport is the one jump primitive, so this is the entire "go there"
      // gesture) — say it failed instead of leaving the user clicking.
      this._showHistoryStatus(t('Couldn\'t jump there — the conversation history could not be read'), {
        kind: 'error', autoHideMs: 8000, retry: () => this._seekTeleport(line),
      });
      return null;
    }
    const data = r.data;
    const msgs = data?.messages || [];
    if (!msgs.length) { this._trace?.('teleport:fail', { line, why: 'empty' }); return null; }
    // Replace the entire rendered view with this slab; keep + reset the sentinel.
    this._clearWheelCarry?.('teleport');   // the reader chose a destination — no carried notch rides into it
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
    marker._gapRetryAt = 0;
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
      this._traceExpect?.('teleport');
      this._messageList.scrollTop += rc.top - lr.top - lr.height / 2;
    }
    this._trace?.('teleport:done', { n: msgs.length, from: data.fromLine, to: data.toLine, st: Math.round(this._messageList.scrollTop), sh: this._messageList.scrollHeight, target: target ? 1 : 0 });
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
        this._trace?.('jumpMatch', { line, path: 'near' });
        this._scrollElStable(near);
        this._reportVisibleTsRange();
        return near;
      }
    }
    let el = this._gapElForLine(line);          // fast path: already in the loaded slab
    this._trace?.('jumpMatch', { line, path: el ? 'loaded' : 'teleport' });
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
      this._traceExpect?.('nearTs');
      this._trace?.('nearTs', { diff: Math.round(bestDiff) });
      best.scrollIntoView({ block: 'center' });
      setTimeout(() => { this._programmaticScroll = false; }, 60);
      this._reportVisibleTsRange();
      return true;
    }
    return false;
  },
  });
}
