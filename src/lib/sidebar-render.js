/**
 * Sidebar rendering mixin — folder-grouped and user-grouped session lists,
 * group context menus, folder linking, drag-drop.
 *
 * Installed on Sidebar.prototype via installSidebarRender(Sidebar).
 */
import { escHtml, createPopover, showContextMenu, copyText, showToast, showInputDialog, showConfirmDialog } from './utils.js';
import { t as tr } from './i18n.js';
import { createBackendIcon, getBackendMeta, getSessionKey } from './agent-meta.js';
import { renderSessionCard } from './session-card.js';

export function installSidebarRender(SidebarClass) {
  const proto = SidebarClass.prototype;

  // Lazy render/unload folder contents based on viewport visibility.
  // Each folder group starts empty; IntersectionObserver triggers render
  // when the group enters viewport, and replaces with a height placeholder
  // when it scrolls far away — keeping DOM node count low.
  proto._setupLazyFolders = function() {
    if (this._folderObserver) this._folderObserver.disconnect();
    const scrollRoot = this.listEl.closest('.sidebar-section');
    this._folderObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const group = entry.target;
        const sessionsDiv = group.querySelector('.folder-sessions');
        if (!sessionsDiv) continue;
        if (entry.isIntersecting) {
          // Entering viewport — render cards if pending or placeholder
          if (sessionsDiv.dataset.lazy === 'pending' || sessionsDiv.dataset.lazy === 'placeholder') {
            const items = sessionsDiv._lazyItems;
            if (items) {
              sessionsDiv.innerHTML = '';
              sessionsDiv.style.minHeight = '';
              for (const s of items) sessionsDiv.appendChild(this._buildSessionCard(s, sessionsDiv._lazyOpts || {}));
              sessionsDiv.dataset.lazy = 'rendered';
            }
          }
        } else {
          // Leaving viewport — replace cards with height placeholder
          if (sessionsDiv.dataset.lazy === 'rendered' && sessionsDiv.children.length > 0) {
            const h = sessionsDiv.offsetHeight;
            sessionsDiv.innerHTML = '';
            sessionsDiv.style.minHeight = h + 'px';
            sessionsDiv.dataset.lazy = 'placeholder';
          }
        }
      }
    }, { root: scrollRoot, rootMargin: '200px 0px' });
  };

  proto._observeFolder = function(group, sessionsDiv, items, opts = {}) {
    // Store items + per-card options (e.g. showCwd for the task board) for lazy re-render
    sessionsDiv._lazyItems = items;
    sessionsDiv._lazyOpts = opts;
    sessionsDiv.dataset.lazy = 'pending';
    if (this._folderObserver) this._folderObserver.observe(group);
  };

  proto._renderGrouped = function(sessions) {
    // Must create the observer BEFORE the loop: _observeFolder registers on
    // this._folderObserver, and _setupLazyFolders() disconnects + replaces it.
    // (Calling it after the loop made every observe() land on the observer
    // that was about to be disconnected — lazy rendering never fired.)
    this._setupLazyFolders();
    const groups = new Map();
    for (const s of sessions) {
      const key = s.cwd || '/unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }

    let groupEntries = [...groups.entries()];
    if (this._sortMode === 'folder') {
      groupEntries.sort((a, b) => a[0].localeCompare(b[0]));
    } else {
      groupEntries.sort((a, b) => {
        const aStarred = a[1].some(s => this._stateSetHas(this._starredIds, s)) ? 1 : 0;
        const bStarred = b[1].some(s => this._stateSetHas(this._starredIds, s)) ? 1 : 0;
        if (aStarred !== bStarred) return bStarred - aStarred;
        const aMax = Math.max(...a[1].map(s => s.startedAt || 0));
        const bMax = Math.max(...b[1].map(s => s.startedAt || 0));
        return bMax - aMax;
      });
    }

    for (const [cwd, items] of groupEntries) {
      const group = document.createElement('div'); group.className = 'folder-group';
      group._collapseKey = cwd; // for highlightSession to expand on jump

      const cwdShort = cwd.replace(/^\/home\/[^/]+/, '~');
      const hasLive = items.some(s => s.status === 'live' || s.status === 'tmux');

      // Huge all-stopped folders (auto-generated session dumps) start collapsed
      // so they don't dominate the sidebar; explicit expansion is remembered.
      const autoCollapse = items.length > 100 && !hasLive && !this._expandedFolders.has(cwd);
      if (this._collapsedFolders.has(cwd) || autoCollapse) group.classList.add('collapsed');

      const header = document.createElement('div'); header.className = 'folder-header';
      header.innerHTML = `<span class="folder-chevron">\u25BC</span><span class="folder-path">${escHtml(cwdShort)}</span><span class="folder-count">${items.length}</span>`;
      if (hasLive) {
        const dot = document.createElement('span');
        dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0';
        header.insertBefore(dot, header.children[2]);
      }

      const addBtn = document.createElement('button'); addBtn.className = 'folder-add-btn';
      addBtn.textContent = '+'; addBtn.title = tr('New session in {dir}', { dir: cwdShort });
      addBtn.onclick = (e) => { e.stopPropagation(); this.app.showNewSessionDialog({ cwd }); };
      header.appendChild(addBtn);

      const linkBtn = document.createElement('button'); linkBtn.className = 'folder-add-btn';
      linkBtn.innerHTML = '<svg style="width:10px;height:10px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 9l2-2M6 12l-1.5 1.5a2 2 0 01-3-3L4 8M10 4l1.5-1.5a2 2 0 013 3L12 8"/></svg>'; linkBtn.title = tr('Link folder to a task');
      linkBtn.style.fontSize = '10px';
      linkBtn.onclick = (e) => {
        e.stopPropagation();
        this._showTaskBindPopover(linkBtn,
          (task) => this._folderPaths(task).includes(cwd),
          (task, checked, pop) => { if (checked) this._taskAddFolder(task.id, cwd); else this._taskRemoveFolder(task.id, cwd); pop.remove(); });
      };
      header.appendChild(linkBtn);

      header.onclick = (e) => {
        if (e.target.closest('.folder-add-btn')) return;
        this._toggleCollapse(group, cwd);
      };

      // Folder-level bulk operations (right-click / long-press). Without this,
      // taming a noisy folder (e.g. thousands of auto-generated observer
      // sessions) meant archiving cards one at a time.
      header.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        const stopped = items.filter(s => s.status === 'stopped' && !this.isArchived(s));
        showContextMenu(e.clientX, e.clientY, [
          { label: tr('Archive {n} stopped sessions', { n: stopped.length }), disabled: !stopped.length, action: () => this.archiveSessions(stopped) },
          { label: tr('New session here'), action: () => this.app.showNewSessionDialog({ cwd }) },
          { label: tr('Copy path'), action: () => copyText(cwd) },
        ]);
      });

      const sessionsDiv = document.createElement('div'); sessionsDiv.className = 'folder-sessions';
      this._sortSessions(items);

      group.append(header, sessionsDiv);
      this.listEl.appendChild(group);
      // Defer card rendering to IntersectionObserver
      this._observeFolder(group, sessionsDiv, items);
    }
    // Trigger initial check for folders already in viewport
    requestAnimationFrame(() => {
      if (!this._folderObserver) return;
      for (const group of this.listEl.querySelectorAll('.folder-group')) {
        const sessionsDiv = group.querySelector('.folder-sessions');
        if (sessionsDiv?.dataset.lazy === 'pending') {
          const rect = group.getBoundingClientRect();
          const scrollRoot = this.listEl.closest('.sidebar-section');
          const rootRect = scrollRoot?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };
          if (rect.top < rootRect.bottom + 200 && rect.bottom > rootRect.top - 200) {
            const items = sessionsDiv._lazyItems;
            if (items) {
              for (const s of items) sessionsDiv.appendChild(this._buildSessionCard(s, sessionsDiv._lazyOpts || {}));
              sessionsDiv.dataset.lazy = 'rendered';
            }
          }
        }
      }
    });
  };


  proto._buildSessionCard = function(s, opts = {}) {
    return renderSessionCard(s, {
      state: this, app: this.app, settings: this.app.settings,
      expandedCardId: this._expandedCardId,
      onExpandToggle: (id) => { this._expandedCardId = id; this._render(); },
      onRename: (session, originalName) => this.renameSession(session, originalName),
      showCwd: !!opts.showCwd, // task board: show each session's cwd on row 2
    });
  };

}
