// Three-zone workbench rendering for the Folders tab (2026-07 redesign).
// The old flat folder grouping drowned ~8 live sessions in thousands of
// stopped ones. Zones:
//   ACTIVE  — every running session, two-line cards (name+badges / dim path)
//             with a per-project colored strip; adjacent by project.
//   RECENT  — stopped sessions with activity in the last 7 days, grouped by
//             project (the realistic resume targets).
//   HISTORY — everything older; collapsed and SEARCH-FIRST (typing in the
//             main filter searches it; expanding renders capped pages).
// Starred sessions float to the top of their zone.
import { escHtml, showConfirmDialog, showToast } from './utils.js';

const RECENT_MS = 7 * 86400e3;
const HISTORY_PAGE = 60;

// Stable project color: hash cwd → hue (used for the ACTIVE strip)
function projectHue(cwd) {
  let h = 0;
  for (const c of cwd || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

function abbrevPath(cwd) {
  if (!cwd) return '';
  const p = cwd.replace(/^\/home\/[^/]+/, '~');
  const parts = p.split('/');
  return parts.length > 3 ? '…/' + parts.slice(-2).join('/') : p;
}

export function installSidebarWorkbench(Sidebar) {
  Object.assign(Sidebar.prototype, {

    _toggleManageMark(key, kind) {
      const marks = this._manageMarks = this._manageMarks || new Map();
      const cur = marks.get(key) || {};
      cur[kind] = !cur[kind];
      if (!cur.terminate && !cur.archive) marks.delete(key); else marks.set(key, cur);
      this._render();
    },

    _buildManageBar() {
      const marks = this._manageMarks || new Map();
      let nTerm = 0, nArch = 0;
      for (const m of marks.values()) { if (m.terminate) nTerm++; if (m.archive) nArch++; }
      const bar = document.createElement('div');
      bar.className = 'wb-manage-bar';
      const label = document.createElement('div');
      label.className = 'wb-manage-label';
      if (!marks.size) {
        label.innerHTML = '<span class="wb-manage-hint">Tap cards to mark</span>';
      } else {
        // icon + number chips — compact, fixed footprint (no text wrap)
        const TERM = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
        const ARCH = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M3 4v8a1 1 0 001 1h8a1 1 0 001-1V4"/><path d="M6.5 8h3"/></svg>';
        label.innerHTML = `<span class="wb-mark-chip wb-mark-term" title="${nTerm} to terminate"${nTerm ? '' : ' style="display:none"'}>${TERM}<b>${nTerm}</b></span>`
          + `<span class="wb-mark-chip wb-mark-arch" title="${nArch} to archive"${nArch ? '' : ' style="display:none"'}>${ARCH}<b>${nArch}</b></span>`;
      }
      const actions = document.createElement('div');
      actions.className = 'wb-manage-actions';
      const applyBtn = document.createElement('button');
      applyBtn.className = 'wb-manage-apply';
      applyBtn.textContent = 'Apply';
      // hidden (not just disabled) when nothing's marked — frees the row so
      // the empty-state hint shows in full
      applyBtn.style.display = marks.size ? '' : 'none';
      applyBtn.onclick = () => this._applyManageMarks();
      const clearBtn = document.createElement('button');
      clearBtn.className = 'wb-manage-clear';
      clearBtn.textContent = marks.size ? 'Clear' : 'Done';
      clearBtn.onclick = () => {
        if (marks.size) { this._manageMarks = new Map(); this._render(); }
        else { this._manageMode = false; this.el.classList.remove('manage-mode'); document.getElementById('manage-toggle')?.classList.remove('active'); this._render(); }
      };
      actions.append(applyBtn, clearBtn);
      bar.append(label, actions);
      return bar;
    },

    async _applyManageMarks() {
      const marks = this._manageMarks || new Map();
      if (!marks.size) return;
      const byKey = new Map();
      for (const s of this._allSessions || []) {
        const k = this._getSessionStateKey(s) || s.sessionId;
        if (marks.has(k) && !byKey.has(k)) byKey.set(k, s);
      }
      const termList = [], archList = [];
      for (const [k, m] of marks) {
        const s = byKey.get(k);
        if (!s) continue;
        if (m.terminate) termList.push(s);
        if (m.archive) archList.push(s);
      }
      const parts = [];
      if (termList.length) parts.push(`terminate ${termList.length}`);
      if (archList.length) parts.push(`archive ${archList.length}`);
      const ok = await showConfirmDialog({
        title: 'Apply batch actions',
        message: `About to ${parts.join(' and ')} session${marks.size === 1 ? '' : 's'}. Terminating kills the running agent process.`,
        confirmText: 'Apply', danger: true,
      });
      if (!ok) return;
      // terminate first (kills), then archive the rest
      for (const s of termList) {
        if (s.webuiId) this.app.killSession(s.webuiId);
        else if (s.pid) this.app.killPid(s.pid);
      }
      // archive as a batch — toggle the set directly, single state push + render
      for (const s of archList) {
        const sk = this._getSessionStateKey(s);
        if (!sk) continue;
        if (this._stateSetHas(this._archivedIds, s)) {
          this._archivedIds.delete(sk);
          const legacy = this._getLegacySessionId(s);
          if (legacy) this._archivedIds.delete(legacy);
        } else {
          this._archivedIds.add(sk);
        }
      }
      if (archList.length) { this._pushUserState(); this.app.updateTaskbar(); }
      this._manageMarks = new Map();
      showToast(parts.join(', ') + ' applied');
      this._render();
    },

    _renderWorkbench(sessions) {
      this.listEl.innerHTML = '';
      // Manage mode batch bar — both the "you're in batch management" marker
      // and the apply/clear controls. Marks are collected on the cards; this
      // bar commits them all at once so the list never reshuffles mid-select.
      if (this._manageMode) this.listEl.appendChild(this._buildManageBar());
      const now = Date.now();
      const isLive = (s) => s.status === 'live' || s.status === 'tmux' || s.status === 'external' || s.status === 'remote-running';
      const live = sessions.filter(isLive);
      const stopped = sessions.filter(s => !isLive(s));
      const recent = stopped.filter(s => now - (s.startedAt || 0) < RECENT_MS);
      const history = stopped.filter(s => now - (s.startedAt || 0) >= RECENT_MS);

      const byStarThenProject = (a, b) =>
        (this.isStarred(b) - this.isStarred(a))
        || String(a.cwd || '').localeCompare(String(b.cwd || ''))
        || (b.startedAt || 0) - (a.startedAt || 0);
      live.sort(byStarThenProject);
      recent.sort((a, b) => (this.isStarred(b) - this.isStarred(a)) || (b.startedAt || 0) - (a.startedAt || 0));
      history.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

      const zoneHead = (label, count) => {
        const h = document.createElement('div');
        h.className = 'wb-zone-head';
        h.innerHTML = `<span>${label}</span><span class="wb-zone-count">${count}</span>`;
        return h;
      };

      // ── ACTIVE ──
      this.listEl.appendChild(zoneHead('Active', live.length));
      if (!live.length) {
        const e = document.createElement('div');
        e.className = 'wb-empty';
        e.textContent = 'No running sessions';
        this.listEl.appendChild(e);
      }
      for (const s of live) {
        const card = this._buildSessionCard(s);
        card.classList.add('wb-active-card');
        // Same per-project color strip as the Recent zone — a running session
        // and its Recent siblings share a color so you can tie them to one
        // project at a glance (the Recent header's colored dot names it).
        card.style.setProperty('--wb-strip', `hsl(${projectHue(s.cwd)} 55% 52%)`);
        // second line: dim abbreviated path — the context that keeps
        // similarly-named sessions distinguishable (user-raised concern)
        const pathEl = document.createElement('div');
        pathEl.className = 'wb-card-path';
        pathEl.title = s.cwd || '';
        pathEl.textContent = abbrevPath(s.cwd);
        const row = card.querySelector('.session-card-row');
        row?.after(pathEl);
        this.listEl.appendChild(card);
      }

      // ── RECENT (last 7 days, grouped by project) ──
      this.listEl.appendChild(zoneHead('Recent', recent.length));
      const byProj = new Map();
      for (const s of recent) {
        const k = s.cwd || '(unknown)';
        if (!byProj.has(k)) byProj.set(k, []);
        byProj.get(k).push(s);
      }
      for (const [cwd, list] of byProj) {
        // Per-project color, applied at PROJECT level (header + its cards) so
        // the color↔project mapping is unambiguous — a colored dot on the
        // header names the color, the cards share the left strip.
        const hue = projectHue(cwd);
        const color = `hsl(${hue} 55% 52%)`;
        const head = document.createElement('div');
        head.className = 'wb-proj-head';
        head.title = cwd;
        head.style.setProperty('--wb-proj-color', color);
        head.innerHTML = `<span class="wb-proj-dot"></span><span class="wb-proj-name">${escHtml(abbrevPath(cwd))}</span><span class="wb-zone-count">${list.length}</span>`;
        // Archive the WHOLE project in one click — the fast path for folders
        // full of throwaway sessions (observer swarms etc.).
        const archAll = document.createElement('button');
        archAll.className = 'wb-proj-archive';
        archAll.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M3 4v8a1 1 0 001 1h8a1 1 0 001-1V4"/><path d="M6.5 8h3"/></svg>';
        archAll.title = `Archive all ${list.length} session${list.length === 1 ? '' : 's'} in this project`;
        archAll.onclick = async (e) => {
          e.stopPropagation();
          const ok = await showConfirmDialog({ title: 'Archive project', message: `Archive all ${list.length} session${list.length === 1 ? '' : 's'} under ${abbrevPath(cwd)}? They move to the Archived filter (nothing is deleted).`, confirmText: 'Archive all', danger: false });
          if (ok) this.archiveSessions(list);
        };
        head.appendChild(archAll);
        // one-click new session in this project (kept from the old folder header)
        const plus = document.createElement('button');
        plus.className = 'wb-proj-plus';
        plus.textContent = '+';
        plus.title = 'New session here';
        plus.onclick = (e) => { e.stopPropagation(); this.app.showNewSessionDialog({ cwd: cwd.includes(': ') ? cwd.split(': ').pop() : cwd }); };
        head.appendChild(plus);
        this.listEl.appendChild(head);
        // cap per project — auto-generated session floods (observer swarms)
        // otherwise render thousands of "recent" cards
        const expanded = this._wbProjExpanded?.has(cwd);
        const shown = expanded ? list : list.slice(0, 5);
        for (const s of shown) {
          const card = this._buildSessionCard(s);
          card.classList.add('wb-proj-card');
          card.style.setProperty('--wb-strip', color);
          this.listEl.appendChild(card);
        }
        if (list.length > shown.length) {
          const more = document.createElement('button');
          more.className = 'wb-more';
          more.textContent = `${list.length - shown.length} more…`;
          more.onclick = () => {
            (this._wbProjExpanded = this._wbProjExpanded || new Set()).add(cwd);
            this._render();
          };
          this.listEl.appendChild(more);
        }
      }
      if (!recent.length) {
        const e = document.createElement('div');
        e.className = 'wb-empty';
        e.textContent = 'Nothing stopped in the last 7 days';
        this.listEl.appendChild(e);
      }

      // ── HISTORY (collapsed, search-first, paged) ──
      const hHead = document.createElement('div');
      hHead.className = 'wb-zone-head wb-history-head';
      const filterActive = !!(document.getElementById('session-filter')?.value || '').trim();
      const open = this._wbHistoryOpen || filterActive; // searching implies looking at history
      hHead.innerHTML = `<span class="wb-hist-arrow">${open ? '▾' : '▸'}</span><span>History</span><span class="wb-zone-count">${history.length}</span>`;
      hHead.onclick = () => { this._wbHistoryOpen = !this._wbHistoryOpen; this._render(); };
      this.listEl.appendChild(hHead);
      if (open) {
        const cap = this._wbHistoryCap || HISTORY_PAGE;
        for (const s of history.slice(0, cap)) this.listEl.appendChild(this._buildSessionCard(s));
        if (history.length > cap) {
          const more = document.createElement('button');
          more.className = 'wb-more';
          more.textContent = `Show more (${history.length - cap} left)`;
          more.onclick = () => { this._wbHistoryCap = cap + HISTORY_PAGE * 4; this._render(); };
          this.listEl.appendChild(more);
        }
      } else if (history.length) {
        const hint = document.createElement('div');
        hint.className = 'wb-empty';
        hint.textContent = 'Type in the filter box to search, or click to expand';
        this.listEl.appendChild(hint);
      }
    },
  });
}
