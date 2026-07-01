/**
 * ChatMinimap — semantic scrollbar showing conversation structure.
 * User message markers (blue), compact markers (red), drag-to-jump with floating label.
 */

export class ChatMinimap {
  /**
   * @param {HTMLElement} container - parent container for positioning
   * @param {HTMLElement} messageList - the message list element to sync with
   * @param {function(number):void} jumpToIndex - callback to jump to a message index
   */
  constructor(container, messageList, jumpToIndex, jumpToTime) {
    this._container = container;
    this._messageList = messageList;
    this._jumpToIndex = jumpToIndex;
    this._jumpToTime = jumpToTime; // (ts, line) => void — used in full-extent (time-coordinate) mode
    this._total = 0;
    this._windowStart = 0;
    this._windowEnd = 0;
    this._turnMap = [];
    // Full-extent mode: whole-conversation markers in TIME coordinates, for
    // huge sessions whose middle isn't loaded. Set via renderFullExtent().
    this._fullExtent = null; // { fullTurns, firstTs, lastTs }
    this._thumbTsRange = null; // { topTs, botTs } — visible region in time

    // Create DOM elements
    this._minimap = document.createElement('div');
    this._minimap.className = 'chat-minimap hidden';
    container.appendChild(this._minimap);

    this._thumb = document.createElement('div');
    this._thumb.className = 'chat-minimap-thumb';
    this._minimap.appendChild(this._thumb);

    this._label = document.createElement('div');
    this._label.className = 'chat-minimap-label hidden';
    container.appendChild(this._label);

    // Sync bounds on message list resize
    this._ro = new ResizeObserver(() => this.syncBounds());
    this._ro.observe(messageList);

    this._setupDrag();
  }

  /** Update total message count and window position */
  setViewport(windowStart, windowEnd, total) {
    const totalChanged = total !== this._total;
    this._windowStart = windowStart;
    this._windowEnd = windowEnd;
    this._total = total;
    // Markers are positioned as startIdx/total — when total grows (live
    // messages), their true positions shift up; without this they stayed at
    // their first-render percentages and drifted ever further off
    if (totalChanged && !this._fullExtent && !this._minimap.classList.contains('hidden')) {
      this._repositionMarkers();
    }
    this.updateThumb();
  }

  /**
   * Switch to whole-conversation view: markers span the entire file in TIME
   * coordinates (the only axis shared by loaded messages and the elided
   * middle). Called once when a history gap is detected.
   * @param {{fullTurns: Array, firstTs: number, lastTs: number}} ext
   */
  renderFullExtent(ext) {
    if (!ext?.fullTurns?.length) return;
    this._fullExtent = ext;
    this._minimap.classList.remove('hidden');
    this._messageList.classList.add('chat-minimap-active');
    this.syncBounds();
    for (const el of [...this._minimap.children]) { if (el !== this._thumb) el.remove(); }
    const span = Math.max(1, ext.lastTs - ext.firstTs);
    for (const turn of ext.fullTurns) {
      const top = Math.max(0, Math.min(100, ((turn.ts - ext.firstTs) / span) * 100));
      const marker = document.createElement('div');
      marker.className = 'chat-minimap-marker ' + (turn.isCompact ? 'chat-minimap-compact' : 'chat-minimap-user-mark');
      marker.style.top = top + '%';
      this._minimap.appendChild(marker);
    }
    this.updateThumb();
  }

  /** Report the visible viewport's time span (full-extent thumb positioning) */
  setVisibleTsRange(topTs, botTs) {
    this._thumbTsRange = (topTs && botTs) ? { topTs, botTs } : null;
    this.updateThumb();
  }

  /** Render turn map markers */
  render(turnMap) {
    if (this._fullExtent) return; // full-extent markers take over once a gap exists
    if (!turnMap?.length || turnMap.length < 3) {
      this._minimap.classList.add('hidden');
      return;
    }
    this._turnMap = turnMap;
    this._minimap.classList.remove('hidden');
    this._messageList.classList.add('chat-minimap-active');
    this.syncBounds();

    // Remove old markers (keep thumb)
    for (const el of [...this._minimap.children]) {
      if (el !== this._thumb) el.remove();
    }

    const total = this._total || turnMap[turnMap.length - 1].startIdx + 1;
    for (const turn of turnMap) {
      if (turn.role !== 'user') continue;
      const top = (turn.startIdx / total) * 100;
      const marker = document.createElement('div');
      marker.className = 'chat-minimap-marker';
      marker.style.top = top + '%';
      if (turn.isCompact) {
        marker.classList.add('chat-minimap-compact');
      } else {
        marker.classList.add('chat-minimap-user-mark');
      }
      this._minimap.appendChild(marker);
    }
  }

  /** Add a single turn incrementally (for live messages) */
  addTurn(turn, total) {
    if (this._fullExtent) return; // full-extent markers own the minimap once a gap exists
    if (!turn || turn.role !== 'user') return;
    this._turnMap.push(turn);
    this._total = total || this._total;
    // Show minimap if we now have enough turns
    if (this._turnMap.length >= 3 && this._minimap.classList.contains('hidden')) {
      this._minimap.classList.remove('hidden');
      this._messageList.classList.add('chat-minimap-active');
      this.syncBounds();
      // Full re-render for first display
      this.render(this._turnMap);
      return;
    }
    if (this._minimap.classList.contains('hidden')) return;
    const t = this._total || this._turnMap[this._turnMap.length - 1].startIdx + 1;
    const top = (turn.startIdx / t) * 100;
    const marker = document.createElement('div');
    marker.className = 'chat-minimap-marker';
    marker.style.top = top + '%';
    if (turn.isCompact) marker.classList.add('chat-minimap-compact');
    else marker.classList.add('chat-minimap-user-mark');
    this._minimap.appendChild(marker);
    // Reposition existing markers since total changed
    this._repositionMarkers();
  }

  /** Reposition all markers after total count changes */
  _repositionMarkers() {
    const t = this._total || 1;
    const userTurns = this._turnMap.filter(tt => tt.role === 'user');
    let i = 0;
    // Markers are appended in turn order — walk both lists once (the old
    // indexOf-inside-loop version was O(n²) and ran per new user turn)
    for (const el of this._minimap.children) {
      if (el === this._thumb) continue;
      if (i < userTurns.length) el.style.top = (userTurns[i].startIdx / t) * 100 + '%';
      i++;
    }
  }

  /**
   * Full-extent mode: register a NEW live turn and re-render. Without this the
   * timeline froze at init time — new messages have ts beyond lastTs, so the
   * thumb pinned to 100% and marker positions compressed ever more wrongly as
   * the live session grew.
   */
  appendFullTurn(turn) {
    if (!this._fullExtent || !turn?.ts) return;
    this._fullExtent.fullTurns.push({ ts: turn.ts, preview: turn.preview, isCompact: turn.isCompact, line: turn.line });
    if (turn.ts > this._fullExtent.lastTs) this._fullExtent.lastTs = turn.ts;
    this.renderFullExtent(this._fullExtent);
  }

  /** Sync minimap position/height to match message list within the container */
  syncBounds() {
    if (!this._minimap || !this._messageList) return;
    const listRect = this._messageList.getBoundingClientRect();
    const containerRect = this._container.getBoundingClientRect();
    this._minimap.style.top = (listRect.top - containerRect.top) + 'px';
    this._minimap.style.height = listRect.height + 'px';
  }

  updateThumb() {
    if (!this._thumb || this._minimap.classList.contains('hidden')) return;
    if (this._fullExtent) {
      // Time-coordinate thumb: where the visible messages sit on the timeline.
      // Live messages can be NEWER than the lastTs captured at init (assistant/
      // tool growth doesn't add user turns) — clamping against the stale span
      // pushed the thumb to top:100% (overflowing below the track). Use the
      // visible bottom as the effective end of the timeline instead.
      const { firstTs, lastTs } = this._fullExtent;
      const r = this._thumbTsRange;
      if (!r) { this._thumb.style.height = '0'; return; }
      const effLast = Math.max(lastTs, r.botTs);
      const span = Math.max(1, effLast - firstTs);
      const top = Math.max(0, Math.min(100, ((r.topTs - firstTs) / span) * 100));
      const bot = Math.max(0, Math.min(100, ((r.botTs - firstTs) / span) * 100));
      const h = Math.max(2, bot - top);
      this._thumb.style.top = Math.min(top, 100 - h) + '%';
      this._thumb.style.height = h + '%';
      return;
    }
    if (!this._total) return;
    const top = (this._windowStart / this._total) * 100;
    const height = Math.max(5, ((this._windowEnd - this._windowStart) / this._total) * 100);
    this._thumb.style.top = top + '%';
    this._thumb.style.height = height + '%';
  }

  _setupDrag() {
    let dragging = false;
    let jumpTimer = null;
    let pendingJumpIdx = null;

    const getFracAtY = (e) => {
      const rect = this._minimap.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    };
    const getIdxAtY = (e) => Math.floor(getFracAtY(e) * (this._total || 1));

    const getTurnAtIdx = (idx) => {
      if (!this._turnMap.length) return null;
      let best = this._turnMap[0];
      for (const t of this._turnMap) {
        if (t.startIdx <= idx) best = t;
        else break;
      }
      return best;
    };

    // Full-extent (time) mode: map a Y fraction to the nearest full-file turn
    const tsAtFrac = (f) => this._fullExtent ? this._fullExtent.firstTs + f * Math.max(1, this._fullExtent.lastTs - this._fullExtent.firstTs) : 0;
    const getFullTurnAtY = (e) => {
      const ext = this._fullExtent; if (!ext?.fullTurns.length) return null;
      const targetTs = tsAtFrac(getFracAtY(e));
      let best = ext.fullTurns[0];
      for (const t of ext.fullTurns) { if (t.ts <= targetTs) best = t; else break; }
      return best;
    };

    const updateLabel = (e, turn) => {
      if (!turn || !this._label) return;
      const containerRect = this._container.getBoundingClientRect();
      const d = new Date(turn.ts);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const date = isToday ? '' : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ';
      const time = date + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const preview = turn.preview || '';
      this._label.textContent = preview ? `${time} · ${preview}` : time;
      this._label.classList.remove('hidden');
      this._label.style.top = (e.clientY - containerRect.top) + 'px';
    };

    const scheduleJump = (idx) => {
      pendingJumpIdx = idx;
      if (!jumpTimer) {
        jumpTimer = setTimeout(() => {
          jumpTimer = null;
          if (pendingJumpIdx != null) this._jumpToIndex(pendingJumpIdx);
          pendingJumpIdx = null;
        }, 100);
      }
    };

    const onMove = (e) => {
      if (this._fullExtent) {
        const turn = getFullTurnAtY(e);
        updateLabel(e, turn);
        if (dragging && turn) scheduleFullJump(turn);
        return;
      }
      const idx = getIdxAtY(e);
      updateLabel(e, getTurnAtIdx(idx));
      if (dragging) scheduleJump(idx);
    };

    // Debounced jump in time mode (drag): seek to the turn's file line
    let fullJumpTimer = null, pendingTurn = null;
    const scheduleFullJump = (turn) => {
      pendingTurn = turn;
      if (!fullJumpTimer) {
        fullJumpTimer = setTimeout(() => {
          fullJumpTimer = null;
          if (pendingTurn && this._jumpToTime) this._jumpToTime(pendingTurn.ts, pendingTurn.line);
          pendingTurn = null;
        }, 150);
      }
    };

    this._minimap.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      if (this._fullExtent) {
        const turn = getFullTurnAtY(e);
        if (turn && this._jumpToTime) this._jumpToTime(turn.ts, turn.line);
        updateLabel(e, turn);
      } else {
        const idx = getIdxAtY(e);
        this._jumpToIndex(idx);
        updateLabel(e, getTurnAtIdx(idx));
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', () => {
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        this._label.classList.add('hidden');
        if (jumpTimer) { clearTimeout(jumpTimer); jumpTimer = null; }
        if (fullJumpTimer) { clearTimeout(fullJumpTimer); fullJumpTimer = null; }
      }, { once: true });
    });

    this._minimap.addEventListener('mousemove', (e) => {
      if (dragging) return;
      updateLabel(e, this._fullExtent ? getFullTurnAtY(e) : getTurnAtIdx(getIdxAtY(e)));
    });

    this._minimap.addEventListener('mouseleave', () => {
      if (!dragging) this._label.classList.add('hidden');
    });
  }

  dispose() {
    if (this._ro) this._ro.disconnect();
    if (this._minimap) this._minimap.remove();
    if (this._label) this._label.remove();
  }
}
