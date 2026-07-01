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

    let matches = [];
    this._fullFileMode = false;
    this._truncated = false;
    if (backendSessionId) {
      try {
        // Huge (elided) session: stream-search the ENTIRE file server-side —
        // covers head + unloaded middle + tail uniformly in {line, ts}
        // coordinates, so search behaves the same regardless of session size.
        if (this._getGapActive() && this._jumpToFileMatch) {
          const res = await fetch(`/api/session-history-gap?backend=${encodeURIComponent(backend || 'claude')}&backendSessionId=${encodeURIComponent(backendSessionId)}&cwd=${encodeURIComponent(cwd)}&search=${encodeURIComponent(q)}`);
          const data = await res.json();
          if (data.matches) {
            matches = data.matches;
            this._fullFileMode = true;
            this._truncated = !!data.truncated;
          }
        }
        if (!this._fullFileMode) {
          const res = await fetch(`/api/session-messages?backend=${encodeURIComponent(backend || 'claude')}&backendSessionId=${encodeURIComponent(backendSessionId)}&cwd=${encodeURIComponent(cwd)}&search=${encodeURIComponent(q)}`);
          const data = await res.json();
          matches = data.matches || [];
        }
      } catch {}
    }
    if (stale()) return; // a newer search superseded this one
    this._serverSearchResults = matches;

    if (!this._serverSearchResults.length) {
      this._searchStatus.textContent = 'No results';
      return;
    }

    this._searchResultIdx = 0;
    this._updateSearchStatus();
    this._jumpToSearchResult(0);
  }

  _updateSearchStatus() {
    const n = this._serverSearchResults.length;
    this._searchStatus.textContent = `${this._searchResultIdx + 1}/${n}${this._truncated ? '+' : ''}`;
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

  async _jumpToSearchResult(idx) {
    const results = this._serverSearchResults;
    if (!results || idx < 0 || idx >= results.length) return;

    // Full-file mode (huge sessions): matches carry {line, ts} instead of a
    // window index — delegate the seek/scroll to ChatView, then reveal.
    if (this._fullFileMode) {
      const el = await this._jumpToFileMatch(results[idx]);
      this._expandEl(el);
      this._revealInEl(el);
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
  }

  /** Highlight a specific range as "current" (for search navigation) */
  _setCurrentHighlight(rangeIdx) {
    if (!CSS.highlights || !this._highlightRanges) return;
    CSS.highlights.delete('chat-search-current');
    if (rangeIdx >= 0 && rangeIdx < this._highlightRanges.length) {
      CSS.highlights.set('chat-search-current', new Highlight(this._highlightRanges[rangeIdx]));
    }
  }

  _clearHighlightLayer() {
    this._highlightQuery = '';
    this._highlightRanges = [];
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
    this._clearHighlightLayer();
    this._serverSearchResults = [];
    this._searchResultIdx = -1;
    this._searchQuery = '';
    if (this._searchStatus) this._searchStatus.textContent = '';
  }

  /** Clean up timers */
  dispose() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._clearHighlightLayer();
  }
}

export { ChatSearch };
