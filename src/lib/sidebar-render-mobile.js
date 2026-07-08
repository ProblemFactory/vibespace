/**
 * Sidebar mobile rendering mixin — two-level folder/group navigation.
 *
 * Level 1: folder or group list (tap to drill in)
 * Level 2: session cards inside one folder/group (back button to return)
 *
 * Installed on Sidebar.prototype via installSidebarRenderMobile(Sidebar).
 * Only active when app.isMobile is true.
 */
import { escHtml, copyText, showContextMenu } from './utils.js';
import { t as tr } from './i18n.js';

const MOBILE_ICON_FOLDER = '<svg style="width:18px;height:18px;flex-shrink:0;vertical-align:-3px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h4l2 2h6v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/></svg>';

export function installSidebarRenderMobile(SidebarClass) {
  const proto = SidebarClass.prototype;

  proto._renderMobileFolderList = function(sessions) {
    const groups = new Map();
    for (const s of sessions) {
      const key = s.cwd || '/unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    let entries = [...groups.entries()];
    entries.sort((a, b) => {
      const aStarred = a[1].some(s => this._stateSetHas(this._starredIds, s)) ? 1 : 0;
      const bStarred = b[1].some(s => this._stateSetHas(this._starredIds, s)) ? 1 : 0;
      if (aStarred !== bStarred) return bStarred - aStarred;
      const aMax = Math.max(...a[1].map(s => s.startedAt || 0));
      const bMax = Math.max(...b[1].map(s => s.startedAt || 0));
      return bMax - aMax;
    });
    for (const [cwd, items] of entries) {
      const cwdShort = cwd.replace(/^\/home\/[^/]+/, '~');
      const liveCount = items.filter(s => s.status === 'live' || s.status === 'tmux').length;
      const card = document.createElement('div'); card.className = 'mobile-folder-card';
      const lastSlash = cwdShort.lastIndexOf('/');
      const pathHead = lastSlash > 0 ? cwdShort.slice(0, lastSlash + 1) : '';
      const pathTail = lastSlash > 0 ? cwdShort.slice(lastSlash + 1) : cwdShort;
      card.innerHTML = MOBILE_ICON_FOLDER
        + `<span class="mobile-folder-path"><span class="mobile-folder-path-head">${escHtml(pathHead)}</span><span class="mobile-folder-path-tail">${escHtml(pathTail)}</span></span>`
        + `<span class="mobile-folder-meta">${tr('{n} sessions', { n: items.length })}${liveCount ? ' · ' + tr('{n} live', { n: liveCount }) : ''}</span>`
        + `<span class="mobile-folder-arrow">\u203A</span>`;
      if (liveCount) card.classList.add('has-live');
      card.onclick = () => { this._mobileDrilldown = { type: 'folder', key: cwd, label: cwdShort }; this._renderMobileFolderDetail(cwd, cwdShort, items, sessions); };
      // Long-press (synthesized contextmenu on touch) — folder quick actions
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, [
          { label: tr('New session here'), action: () => this.app.showNewSessionDialog({ cwd }) },
          { label: tr('Copy path'), action: () => copyText(cwd) },
        ]);
      });
      this.listEl.appendChild(card);
    }
  };

  proto._renderMobileFolderDetail = function(cwd, cwdShort, items, allSessions) {
    this.listEl.innerHTML = '';
    const back = document.createElement('div'); back.className = 'mobile-folder-back';
    back.innerHTML = `<span class="mobile-folder-back-arrow">\u2039</span> <span>${tr('All Folders')}</span>`;
    back.onclick = () => { this._mobileDrilldown = null; this.listEl.innerHTML = ''; this._renderMobileFolderList(allSessions); };
    this.listEl.appendChild(back);
    const titleRow = document.createElement('div'); titleRow.className = 'mobile-folder-title';
    titleRow.innerHTML = `<span>${escHtml(cwdShort)}</span>`;
    const addBtn = document.createElement('button'); addBtn.className = 'folder-add-btn'; addBtn.textContent = '+';
    addBtn.onclick = (e) => { e.stopPropagation(); this.app.showNewSessionDialog({ cwd }); };
    titleRow.appendChild(addBtn);
    this.listEl.appendChild(titleRow);
    this._sortSessions(items);
    for (const s of items) this.listEl.appendChild(this._buildSessionCard(s));
  };

}
