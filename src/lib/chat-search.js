/**
 * ChatSearch — extracted search functionality for ChatView.
 * Handles search bar DOM, server-side search, highlight layer, and navigation.
 */
class ChatSearch {
  /**
   * @param {HTMLElement} messageList - the .chat-message-list element to search within
   * @param {Object} callbacks
   * @param {() => {claudeId: string, cwd: string}} callbacks.getSessionIds
   * @param {() => string} callbacks.getSessionId - returns the webui session ID
   * @param {(idx: number) => Promise<void>} callbacks.jumpToIndex
   * @param {() => {windowStart: number, windowEnd: number}} callbacks.getWindowBounds
   */
  constructor(messageList, { getSessionIds, getSessionId, jumpToIndex, getWindowBounds, getGapActive, jumpToFileMatch }) {
    this._messageList = messageList;
    this._getSessionIds = getSessionIds;
    this._getSessionId = getSessionId;
    this._jumpToIndex = jumpToIndex;
    this._getWindowBounds = getWindowBounds;
    this._getGapActive = getGapActive || (() => false);
    this._jumpToFileMatch = jumpToFileMatch || null;
    this._fullFileMode = false;
    this._truncated = false;

    // Search state
    this._searchQuery = '';
    this._highlightQuery = '';
    this._highlightRanges = [];
    this._serverSearchResults = [];
    this._searchResultIdx = -1;
    this._searchTimer = null;

    // Build search bar DOM
    this._bar = document.createElement('div');
    this._bar.className = 'chat-search-bar hidden';

    this._input = document.createElement('input');
    this._input.className = 'chat-search-input';
    this._input.placeholder = 'Search messages...';
    this._input.type = 'text';

    this._searchStatus = document.createElement('span');
    this._searchStatus.className = 'chat-search-status';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'chat-search-nav';
    prevBtn.textContent = '\u25B2';
    prevBtn.title = 'Previous';
    prevBtn.onclick = () => this._searchNav(-1);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'chat-search-nav';
    nextBtn.textContent = '\u25BC';
    nextBtn.title = 'Next';
    nextBtn.onclick = () => this._searchNav(1);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'chat-search-close';
    closeBtn.textContent = '\u2715';
    closeBtn.onclick = () => { this._bar.classList.add('hidden'); this._input.value = ''; this._clearSearch(); };

    this._bar.append(this._input, this._searchStatus, prevBtn, nextBtn, closeBtn);

    this._input.addEventListener('input', () => this._doSearch(this._input.value));
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._searchNav(e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') { closeBtn.click(); }
    });
  }

  /** The search bar DOM element for ChatView to insert */
  get element() { return this._bar; }

  /** Whether there is an active highlight query */
  get hasHighlight() { return !!this._highlightQuery; }

  /** Show the search bar and focus the input */
  open() {
    this._bar.classList.remove('hidden');
    this._input.focus();
    this._input.select();
  }

  // ── Search dispatch ──

  _doSearch(query) {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this._executeSearch(query), 250);
  }

  async _executeSearch(query) {
    this._clearSearch();
    const q = query.trim().toLowerCase();
    if (!q) { this._searchStatus.textContent = ''; return; }

    // Request token: a slow earlier search resolving after a newer one must
    // not overwrite the newer results / jump the view to stale matches
    const token = (this._searchToken = (this._searchToken || 0) + 1);
    const stale = () => this._searchToken !== token;

    this._searchStatus.textContent = 'Searching...';
    this._searchQuery = q;
    this._highlightQuery = q;
    this.applyHighlightLayer(); // highlight current view immediately

    // Server-side search — find backend session ID for this webui session
    let { backend, backendSessionId, cwd, claudeId } = this._getSessionIds();
    // Fallback: check active sessions API directly
    if (!backendSessionId) {
      try {
        const r = await fetch('/api/active');
        const d = await r.json();
        const sessions = d.sessions || d;
        const sessionId = this._getSessionId();
        const s = Array.isArray(sessions) ? sessions.find(s => s.id === sessionId) : null;
        if (s) {
          backend = s.backend || 'claude';
          backendSessionId = s.backendSessionId || s.claudeSessionId;
          claudeId = s.claudeSessionId || null;
          cwd = s.cwd || '';
        }
      } catch {}
    }

    this._fullFileMode = false;
    this._truncated = false;
    this._searching = false;
    if (!backendSessionId) { if (!stale()) this._searchStatus.textContent = 'No results'; return; }

    // Huge session: stream-search the ENTIRE file server-side. Results arrive
    // progressively (less-style) so the count updates live ("N… searching") and
    // the first match is jumped to as soon as it's found. Otherwise a single
    // request against the loaded window.
    if (this._getGapActive() && this._jumpToFileMatch) {
      this._fullFileMode = true;
      await this._streamFullFileSearch(backend, backendSessionId, cwd, q, token, stale);
      return;
    }

    let matches = [];
    try {
      const res = await fetch(`/api/session-messages?backend=${encodeURIComponent(backend || 'claude')}&backendSessionId=${encodeURIComponent(backendSessionId)}&cwd=${encodeURIComponent(cwd)}&search=${encodeURIComponent(q)}`);
      const data = await res.json();
      matches = data.matches || [];
    } catch {}
    if (stale()) return; // a newer search superseded this one
    this._serverSearchResults = matches;
    if (!this._serverSearchResults.length) { this._searchStatus.textContent = 'No results'; return; }
    this._searchResultIdx = 0;
    this._updateSearchStatus();
    this._jumpToSearchResult(0);
  }

  // Read the NDJSON match stream: jump to the first hit immediately, then keep
  // updating the live count until the server signals `done`.
  async _streamFullFileSearch(backend, backendSessionId, cwd, q, token, stale) {
    this._searchAbort?.abort();
    const ac = (this._searchAbort = new AbortController());
    this._searching = true;
    this._serverSearchResults = [];
    this._searchResultIdx = -1;
    this._updateSearchStatus();
    let jumped = false;
    try {
      const url = `/api/session-history-gap?backend=${encodeURIComponent(backend || 'claude')}&backendSessionId=${encodeURIComponent(backendSessionId)}&cwd=${encodeURIComponent(cwd)}&search=${encodeURIComponent(q)}&stream=1`;
      const res = await fetch(url, { signal: ac.signal });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (stale()) { ac.abort(); return; }
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const ln of lines) {
          if (!ln) continue;
          let obj; try { obj = JSON.parse(ln); } catch { continue; }
          if (obj.done) { this._searching = false; this._truncated = !!obj.truncated; continue; }
          if (typeof obj.line !== 'number') continue; // gap-info preamble line
          this._serverSearchResults.push(obj);
          if (!jumped) { jumped = true; this._searchResultIdx = 0; this._jumpToSearchResult(0); }
          this._updateSearchStatus();
        }
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    } finally {
      this._searching = false;
    }
    if (stale()) return;
    if (!this._serverSearchResults.length) this._searchStatus.textContent = 'No results';
    else this._updateSearchStatus();
  }

  _updateSearchStatus() {
    const n = this._serverSearchResults.length;
    const idx = this._searchResultIdx >= 0 ? this._searchResultIdx + 1 : 0;
    if (this._searching) {
      // less-style: keep counting while the scan is still running
      this._searchStatus.textContent = n ? `${idx}/${n}… searching` : 'Searching…';
    } else {
      this._searchStatus.textContent = `${idx}/${n}${this._truncated ? '+' : ''}`;
    }
  }

  /** Expand collapsed content inside an element so highlights can paint */
  _expandEl(el) {
    if (!el) return;
    el.style.contentVisibility = 'visible';
    for (const d of el.querySelectorAll('details:not([open])')) d.open = true;
  }

  /** Highlight + scroll to the first match inside `el` (fallback: center el) */
  _revealInEl(el) {
    this.applyHighlightLayer();
    if (el && this._highlightRanges?.length > 0) {
      const matchIdx = this._highlightRanges.findIndex(r => el.contains(r.startContainer));
      if (matchIdx >= 0) {
        this._setCurrentHighlight(matchIdx);
        const rect = this._highlightRanges[matchIdx].getBoundingClientRect();
        const listRect = this._messageList.getBoundingClientRect();
        this._messageList.scrollTop += rect.top - listRect.top - listRect.height / 2;
        return;
      }
    }
    if (el) el.scrollIntoView({ block: 'center' });
  }

  /**
   * Full-file jumps land in the right WINDOW but the anchor element may be a
   * message or two off the actual match (server's bounded-index normalization
   * drifts a few positions from the paginated one). So instead of searching
   * only inside the anchor, pick the highlight range physically NEAREST the
   * anchor and scroll to it — the real match is loaded and highlighted, just
   * not necessarily in `el`.
   */
  _revealNearest(el) {
    this.applyHighlightLayer();
    const ranges = this._highlightRanges;
    if (!ranges || !ranges.length) { if (el) el.scrollIntoView({ block: 'center' }); return; }
    const listRect = this._messageList.getBoundingClientRect();
    let anchorY = listRect.top + listRect.height / 2;
    if (el) { const r = el.getBoundingClientRect(); anchorY = r.top + r.height / 2; }
    let best = 0, bestD = Infinity;
    for (let i = 0; i < ranges.length; i++) {
      const rr = ranges[i].getBoundingClientRect();
      const d = Math.abs((rr.top + rr.height / 2) - anchorY);
      if (d < bestD) { bestD = d; best = i; }
    }
    this._setCurrentHighlight(best);
    const range = ranges[best];
    // Iterative scroll convergence: after seek-loading a big slab, content-
    // visibility computes real element heights over several frames (and keeps
    // going for ~1s), shifting the target after a single scrollTop set. Re-center
    // over ~12 frames, then a few more times on a timer, to stay locked on.
    const list = this._messageList;
    const center = () => {
      const lr = list.getBoundingClientRect();
      const rc = range.getBoundingClientRect();
      list.scrollTop += rc.top - lr.top - lr.height / 2;
    };
    let n = 0;
    const step = () => { center(); if (++n < 12) requestAnimationFrame(step); };
    step();
    for (const d of [180, 400, 750]) setTimeout(center, d);
  }

  async _jumpToSearchResult(idx) {
    const results = this._serverSearchResults;
    if (!results || idx < 0 || idx >= results.length) return;

    // Full-file mode (huge sessions): matches carry {line, ts} instead of a
    // window index — delegate the seek/scroll to ChatView, then reveal the
    // nearest highlight (the anchor may be a couple messages off the match).
    if (this._fullFileMode) {
      const el = await this._jumpToFileMatch(results[idx]);
      // Expand the anchor and its neighbours so a match in an adjacent
      // (collapsed) tool card can still be highlighted + scrolled to.
      this._expandEl(el);
      if (el) {
        let sib = el.previousElementSibling, n = 0;
        while (sib && n < 3) { this._expandEl(sib); sib = sib.previousElementSibling; n++; }
        sib = el.nextElementSibling; n = 0;
        while (sib && n < 3) { this._expandEl(sib); sib = sib.nextElementSibling; n++; }
      }
      this._revealNearest(el);
      return;
    }

    const msgIndex = results[idx].index;
    const { windowStart, windowEnd } = this._getWindowBounds();

    // Jump window if target is outside
    if (msgIndex < windowStart || msgIndex >= windowEnd) {
      await this._jumpToIndex(msgIndex);
    }

    // Expand collapsed content in target, then refresh highlight layer.
    // Gap-loaded messages (.chat-gap-msg) are IN the DOM but NOT in the
    // window index space — including them here shifted relIdx onto the wrong
    // element whenever the user had loaded part of the elided middle.
    const { windowStart: newStart } = this._getWindowBounds();
    const relIdx = msgIndex - newStart;
    const allMsgs = this._messageList.querySelectorAll('.chat-msg:not(.chat-gap-msg)');
    const targetEl = (relIdx >= 0 && relIdx < allMsgs.length) ? allMsgs[relIdx] : null;
    this._expandEl(targetEl);
    this._revealInEl(targetEl);
  }

  // ── Highlight Layer: non-destructive search highlighting ──

  /** Apply highlight layer to current DOM content based on _highlightQuery */
  applyHighlightLayer() {
    if (!CSS.highlights) return; // fallback: no highlight API
    CSS.highlights.delete('chat-search');
    CSS.highlights.delete('chat-search-current');
    if (!this._highlightQuery) return;

    const q = this._highlightQuery;
    const ranges = [];
    const walker = document.createTreeWalker(this._messageList, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent.toLowerCase();
      let idx = 0;
      while ((idx = text.indexOf(q, idx)) !== -1) {
        const range = new Range();
        range.setStart(node, idx);
        range.setEnd(node, idx + q.length);
        ranges.push(range);
        idx += q.length;
      }
    }
    if (ranges.length > 0) {
      CSS.highlights.set('chat-search', new Highlight(...ranges));
    }
    this._highlightRanges = ranges;
    // Re-assert the "current" highlight. applyHighlightLayer is re-run by
    // scroll-driven paths (_extendBottom, _reportVisibleTsRange, jumpToIndex)
    // AFTER a jump set the current match — without this the current highlight
    // silently vanishes whenever a jump happens to land near a load boundary.
    if (this._currentAnchor) {
      const { node, offset } = this._currentAnchor;
      const match = ranges.find(r => r.startContainer === node && r.startOffset === offset);
      if (match) CSS.highlights.set('chat-search-current', new Highlight(match));
    }
  }

  /** Highlight a specific range as "current" (for search navigation) */
  _setCurrentHighlight(rangeIdx) {
    if (!CSS.highlights || !this._highlightRanges) return;
    CSS.highlights.delete('chat-search-current');
    if (rangeIdx >= 0 && rangeIdx < this._highlightRanges.length) {
      const range = this._highlightRanges[rangeIdx];
      CSS.highlights.set('chat-search-current', new Highlight(range));
      // Anchor to the underlying DOM node+offset so applyHighlightLayer can
      // recover the current highlight after it rebuilds the range list.
      this._currentAnchor = { node: range.startContainer, offset: range.startOffset };
    }
  }

  _clearHighlightLayer() {
    this._highlightQuery = '';
    this._highlightRanges = [];
    this._currentAnchor = null;
    if (CSS.highlights) {
      CSS.highlights.delete('chat-search');
      CSS.highlights.delete('chat-search-current');
    }
  }

  _searchNav(dir) {
    const results = this._serverSearchResults;
    if (!results || !results.length) return;
    this._searchResultIdx = (this._searchResultIdx + dir + results.length) % results.length;
    this._updateSearchStatus();
    this._jumpToSearchResult(this._searchResultIdx);
  }

  _clearSearch() {
    this._searchAbort?.abort();          // stop any in-flight streaming search
    this._searching = false;
    this._clearHighlightLayer();
    this._serverSearchResults = [];
    this._searchResultIdx = -1;
    this._searchQuery = '';
    if (this._searchStatus) this._searchStatus.textContent = '';
  }

  /** Clean up timers */
  dispose() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchAbort?.abort();
    this._clearHighlightLayer();
  }
}

export { ChatSearch };
