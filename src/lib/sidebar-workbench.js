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
import { escHtml } from './utils.js';

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

    _renderWorkbench(sessions) {
      this.listEl.innerHTML = '';
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
        const head = document.createElement('div');
        head.className = 'wb-proj-head';
        head.title = cwd;
        head.innerHTML = `<span class="wb-proj-name">${escHtml(abbrevPath(cwd))}</span><span class="wb-zone-count">${list.length}</span>`;
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
        for (const s of shown) this.listEl.appendChild(this._buildSessionCard(s));
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
