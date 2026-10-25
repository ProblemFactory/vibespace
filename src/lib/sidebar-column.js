// THE LIST COLUMN of the regular class (lane duo-build-1 slice 2 — SPEC-v3 rev 3.3 §2.3; the iPhone Duo's inner display):
// the Folders tab as ONE stream of rows, the phone's list beside the conversation — never the desktop's three zones.
//   · the order: the conversations that need the person first (the attention list's band — PURE attention-model via the
//     sidebar's own `_sortSessions`), then the other running ones, then the stopped ones newest first, then the older
//     history; no zone heads, no per-project groups, no «N more»;
//   · one scroll (the search row scrolls with it): the stopped rows arrive PAGE by page as the list's end nears (an
//     IntersectionObserver a screen ahead — the owner, 2026-10-03: 「不要添加'显示更多'按钮，都做成动态加载之类的无缝方案」);
//   · a row = the session card the whole sidebar builds (`_buildSessionCard`: its tap, long-press menu, state chip,
//     highlight) + its folder as the second line; the stylesheet gives it the phone's shape there (style.css, the
//     regular class's block).
// A search, a manage pass or a remote host picked in the history switcher keeps the full workbench (sidebar-workbench.js):
// its cross-host matches and batch bar are its own.
import { t as tr } from './i18n.js';

const PAGE = 40;
const RECENT_MS = 7 * 86400e3;

/** The second line of a row: the folder (a remote one prefixed by its machine, the home as ~) — the workbench's own
 *  shape (a host span that never truncates + `.wb-card-path-text`, which ellipsizes the HEAD and keeps the folder's
 *  tail: «…/duo-demo/cwd/contracts», never «/var/tmp/…/cwd/contra» — the real Duo's slice-2 shots). */
function pathLine(s) {
  const el = document.createElement('div');
  el.className = 'wb-card-path col-card-path';
  let raw = s.cwd || '';
  if (s.hostName && raw.startsWith(s.hostName + ': ')) raw = raw.slice(s.hostName.length + 2);
  if (s.hostName) { const h = document.createElement('span'); h.className = 'wb-card-path-host'; h.textContent = s.hostName + ':'; el.appendChild(h); }
  const t = document.createElement('span'); t.className = 'wb-card-path-text'; t.textContent = raw.replace(/^\/home\/[^/]+/, '~');
  el.appendChild(t);
  el.title = (s.hostName ? s.hostName + ': ' : '') + (s.cwd || '');
  return el;
}

export function installSidebarColumn(Sidebar) {
  Object.assign(Sidebar.prototype, {
    /** Is this render the column's? The regular class's Folders tab, unless a search / manage pass / remote history wants the workbench. */
    _columnListWanted() {
      if (!this._regularMode || this._manageMode) return false;
      if ((document.getElementById('session-filter')?.value || '').trim()) return false;
      return !this._wbHistoryHost && !this._wbRecentHost;
    },

    _renderColumnList(sessions) {
      this._columnObserver?.disconnect?.(); this._columnObserver = null;
      this.listEl.innerHTML = '';
      this._appendKindHint?.();
      this._renderServiceHintRows?.(sessions);
      const isLive = (s) => s.status === 'live' || s.status === 'tmux' || s.status === 'external' || s.status === 'remote-running';
      const live = sessions.filter(isLive);
      this._sortSessions?.(live); // the attention list's band first, then urgency, star, newest
      const stopped = sessions.filter((s) => !isLive(s)).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
      const list = document.createElement('div');
      list.className = 'col-list';
      this.listEl.appendChild(list);
      const row = (s) => {
        const card = this._buildSessionCard(s);
        card.classList.add('col-card');
        card.appendChild(pathLine(s));
        // its open questions, answerable here (SPEC-v3 §2.3 — the For-you panel's own rows: user-todos-panel.js app.sessionAsks)
        if (this.app.sessionAsks) { const box = document.createElement('div'); box.className = 'col-asks'; card.appendChild(box); this.app.sessionAsks.render(box, s); }
        return card;
      };
      // the conversations with an open question come first (the attention list's rule: what needs the person leads)
      const asks = new Map(live.map((s) => [s, this.app.sessionAsks?.count?.(s) || 0]));
      live.sort((a, b) => (asks.get(b) > 0) - (asks.get(a) > 0));
      for (const s of live) list.appendChild(row(s));
      if (!live.length && !stopped.length) {
        const e = document.createElement('div'); e.className = 'wb-empty col-empty'; e.textContent = tr('No sessions');
        list.appendChild(e);
        return;
      }
      // the stopped rows: the last seven days at once (a bounded first page), the rest as the list's end nears
      let at = 0;
      const recentN = stopped.filter((s) => Date.now() - (s.startedAt || 0) < RECENT_MS).length;
      const more = () => {
        const n = at === 0 ? Math.max(PAGE, Math.min(recentN, PAGE * 2)) : PAGE;
        for (const s of stopped.slice(at, at + n)) list.appendChild(row(s));
        at += n;
        if (at >= stopped.length) { this._columnObserver?.disconnect?.(); sentinel.remove(); return; }
        list.appendChild(sentinel); // stays the last row
      };
      const sentinel = document.createElement('div');
      sentinel.className = 'col-sentinel';
      sentinel.setAttribute('aria-hidden', 'true');
      more();
      if (at < stopped.length && typeof IntersectionObserver === 'function') {
        const root = this.listEl.closest('.sidebar-section') || null;
        this._columnObserver = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) more(); }, { root, rootMargin: '0px 0px 100% 0px' });
        this._columnObserver.observe(sentinel);
      }
    },
  });
}
