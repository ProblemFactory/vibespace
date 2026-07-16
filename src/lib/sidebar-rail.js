// Sidebar Activity Rail (vscode-style) — docs/design-sidebar-rail.md.
// A ~44px vertical icon strip on the sidebar's edge replaces the 3-tab bar:
// content panels (Folders / Task Groups / Remote / Ports) + management panels
// (Agents / Plugins) + pinned launchers (Diagnostics / Settings). The panels
// render into the SAME list area the tabs used; Agents/Plugins reuse their
// modal renderers via the { container } option (one source of truth).
// Setting `sidebar.activityRail` (default ON) restores the classic tab bar +
// modal dialogs when off. Mobile keeps its own nav — the rail never renders.
import { t as tr } from './i18n.js';
import { escHtml, showToast, fetchJson } from './utils.js';

// Self-contained 18px icons (UI_ICONS lacks several shapes; MI is module-local
// to sidebar-mounts) — consistent stroke style, currentColor.
const R = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const RAIL_ICONS = {
  folders: R('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  tasks: R('<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="11" width="12" height="4" rx="1"/><rect x="3" y="18" width="15" height="3" rx="1"/>'),
  mounts: R('<rect x="2" y="3" width="20" height="7" rx="2"/><rect x="2" y="14" width="20" height="7" rx="2"/><circle cx="6.5" cy="6.5" r="0.9" fill="currentColor"/><circle cx="6.5" cy="17.5" r="0.9" fill="currentColor"/>'),
  ports: R('<path d="M9 7V3M15 7V3"/><rect x="6" y="7" width="12" height="8" rx="2"/><path d="M12 15v6"/>'),
  agents: R('<rect x="5" y="8" width="14" height="10" rx="2"/><circle cx="9.5" cy="13" r="1" fill="currentColor"/><circle cx="14.5" cy="13" r="1" fill="currentColor"/><path d="M12 8V5M8 3h8"/>'),
  plugins: R('<path d="M9 3v4M15 3v4M7 7h10v5a5 5 0 0 1-10 0zM12 17v4"/>'),
  diagnostics: R('<path d="M3 12h4l2-7 4 14 2-7h6"/>'),
  settings: R('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
};

// 13px action icons for the ports rows (emoji glyphs clash with the mono
// stroke style of the rest of the chrome — real user report on the 🌐)
const A = (d) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const PORT_ICONS = {
  open: A('<path d="M7 17L17 7M9 7h8v8"/>'),
  globe: A('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  globeOff: A('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/><path d="M4 4l16 16" stroke-width="2.6"/>'),
  x: A('<path d="M6 6l12 12M18 6L6 18"/>'),
  fwd: A('<path d="M4 12h14M12 6l6 6-6 6"/>'),
};

const PANEL_TABS = ['ports', 'agents', 'plugins'];

// Sidebar header title per rail item (the tab bar is hidden, so the header is
// the only label saying which panel is showing).
const RAIL_TITLES = {
  folders: 'Sessions', tasks: 'Task Groups', mounts: 'Remote',
  ports: 'Ports', agents: 'Agents', plugins: 'Plugins',
};

export function installSidebarRail(Sidebar) {
  Object.assign(Sidebar.prototype, {

    _railInit() {
      if (this.app.isMobile) return; // mobile keeps its own two-level nav
      const apply = () => {
        const on = this.app.settings?.get('sidebar.activityRail');
        if (on === false) this._removeRail(); else this._buildRail();
      };
      this.app.settings?.on?.('sidebar.activityRail', apply);
      this.app.settings?.on?.('sidebar.railPersistent', () => { this._railApplyCollapsed(); this._applySidebarLayoutWidth(); });
      apply();
    },

    _buildRail() {
      if (this._railEl) return;
      const sb = this.el;
      // wrap the sidebar's existing children once so the rail can sit beside them
      if (!this._railMain) {
        const main = document.createElement('div');
        main.className = 'sidebar-main';
        while (sb.firstChild) main.appendChild(sb.firstChild);
        sb.appendChild(main);
        this._railMain = main;
      }
      sb.classList.add('rail-on');
      const rail = document.createElement('div');
      rail.id = 'sidebar-rail';
      const item = (id, label, onClick) => {
        const b = document.createElement('button');
        b.className = 'rail-item';
        b.dataset.rail = id;
        b.innerHTML = RAIL_ICONS[id] || '';
        b.dataset.tip = label;
        b.onclick = onClick;
        return b;
      };
      rail.append(
        item('folders', tr('Folders'), () => this._railGo('folders')),
        item('tasks', tr('Task Groups'), () => this._railGo('tasks')),
        item('mounts', tr('Remote'), () => this._railGo('mounts')),
        item('ports', tr('Ports'), () => this._railGo('ports')),
        item('agents', tr('Agents'), () => this._railGo('agents')),
        item('plugins', tr('Plugins'), () => this._railGo('plugins')),
      );
      const spacer = document.createElement('div');
      spacer.className = 'rail-spacer';
      rail.appendChild(spacer);
      rail.append(
        item('diagnostics', tr('Diagnostics report…'), () => this.app._openDiagnostics?.()),
        item('settings', tr('Settings'), () => this.app._settingsUI?.open?.()),
      );
      sb.insertBefore(rail, sb.firstChild);
      this._railEl = rail;
      const tabs = this.el.querySelector('.sidebar-tabs');
      if (tabs) tabs.style.display = 'none';
      // restore the last panel (per device, like the old tab persistence)
      const saved = localStorage.getItem('vibespace.railItem');
      if (saved && saved !== this._activeTab && ['folders', 'tasks', 'mounts', ...PANEL_TABS].includes(saved)) {
        this._activeTab = saved;
        this._updateTabs();
        this._render();
      }
      this._railSync();
      this._railWireBadges();
      this._railApplyTitle();
      this._railApplyCollapsed();
      this._applySidebarLayoutWidth();
    },

    /** vscode behavior (sidebar.railPersistent, default ON): a collapsed
     *  sidebar keeps the rail as a 44px strip instead of hiding entirely. */
    _railApplyCollapsed() {
      const on = !!this._railEl && !this.isOpen && this.app.settings?.get('sidebar.railPersistent') !== false;
      this.el.classList.toggle('rail-collapsed', on);
    },

    _railApplyTitle() {
      const t = this.el.querySelector('.sidebar-title');
      if (t) t.textContent = tr(RAIL_TITLES[this._activeTab] || 'Sessions');
    },

    /** Small count/⚠ badge on a rail icon. val = number | string | falsy(clear). */
    _railSetBadge(id, val) {
      const b = this._railEl?.querySelector(`.rail-item[data-rail="${id}"]`);
      if (!b) return;
      let badge = b.querySelector('.rail-badge');
      if (!val) { badge?.remove(); return; }
      if (!badge) { badge = document.createElement('span'); badge.className = 'rail-badge'; b.appendChild(badge); }
      badge.textContent = String(val);
    },

    /** Badge sources (design: tasks=⚠, remote=offline machines, ports=active
     *  forwards, diagnostics=recent errors). Wired once per rail build; ws
     *  handlers self-guard on the rail element still being alive. */
    _railWireBadges() {
      if (this._railBadgesWired) { this._railRefreshBadges(); return; }
      this._railBadgesWired = true;
      this.app.ws.onGlobal((msg) => {
        if (!this._railEl) return;
        if (msg.type === 'port-forwards-updated' || msg.type === 'hosts-updated') this._railRefreshBadges();
      });
      this._railRefreshBadges();
      // diagnostics: one cheap cached probe per page load, not a poll
      fetchJson('/api/telemetry/summary?days=1').then((r) => {
        const n = (r?.errors || []).reduce((a, g) => a + (g.count || 0), 0);
        if (n) this._railSetBadge('diagnostics', n > 99 ? '99+' : n);
      }).catch(() => {});
    },

    async _railRefreshBadges() {
      if (!this._railEl) return;
      try {
        const [fw, ho] = await Promise.all([fetchJson('/api/port-forwards'), fetchJson('/api/hosts')]);
        const nf = (fw?.forwards || []).length;
        this._railSetBadge('ports', nf || '');
        const off = (ho?.hosts || []).filter((h) => h.transport === 'dial' && !h.online).length;
        this._railSetBadge('mounts', off ? off + '⏻' : '');
      } catch { }
    },

    _removeRail() {
      if (!this._railEl) return;
      this._panelDispose?.(); this._panelDispose = null;
      this._railEl.remove(); this._railEl = null;
      this.el.classList.remove('rail-on', 'rail-collapsed');
      const title = this.el.querySelector('.sidebar-title');
      if (title) title.textContent = tr('Sessions');
      this._applySidebarLayoutWidth();
      const tabs = this.el.querySelector('.sidebar-tabs');
      if (tabs) tabs.style.display = '';
      if (PANEL_TABS.includes(this._activeTab)) { this._activeTab = 'folders'; this._updateTabs(); this._render(); }
    },

    _railGo(id) {
      this._tabTouched = true;
      try { localStorage.setItem('vibespace.railItem', id); } catch { }
      if (!this.isOpen) { // collapsed strip: any click expands (never re-collapses)
        this.toggle(true);
        if (this._activeTab === id) { this._railSync(); return; }
      } else if (this._activeTab === id) { this.toggle(false); return; } // vscode: re-click = collapse
      this._panelDispose?.(); this._panelDispose = null;
      this._activeTab = id;
      this._updateTabs();
      this._railSync();
      this._railApplyTitle();
      this._render();
    },

    _railSync() {
      if (!this._railEl) return;
      this._railEl.querySelectorAll('.rail-item').forEach((b) => b.classList.toggle('active', b.dataset.rail === this._activeTab));
    },

    /** _render() delegates here for the rail-only panel tabs. Renders once —
     *  the 5s poll's re-renders must not rebuild a panel mid-interaction. */
    _renderRailPanel() {
      const cls = 'rail-panel-' + this._activeTab;
      if (this.listEl.querySelector('.' + cls)) return;
      this._panelDispose?.(); this._panelDispose = null;
      this.listEl.innerHTML = '';
      const c = document.createElement('div');
      c.className = 'rail-panel ' + cls;
      this.listEl.appendChild(c);
      if (this._activeTab === 'plugins') {
        // container mode may return a cleanup fn; anything else (promise/void) is not one
        const d = this.app.openPluginsDialog?.({ container: c });
        this._panelDispose = typeof d === 'function' ? d : null;
      }
      else if (this._activeTab === 'agents') this.app._showAgentsDialog?.({ container: c });
      else if (this._activeTab === 'ports') this._renderPortsPanel(c);
      this._railSync();
    },

    // ── Ports panel (the vscode PORTS analogue) ──
    async _renderPortsPanel(c) {
      c.innerHTML = `<div class="empty-hint">${escHtml(tr('Loading…'))}</div>`;
      const api = (u, opts) => fetchJson(u, opts);
      let hosts = [];
      try { hosts = ((await api('/api/hosts')) || {}).hosts || []; } catch { }
      // publish needs the frp relay — without it the button must SAY so, not no-op
      let frpOk = false;
      try { frpOk = (((await api('/api/plugins')) || {}).plugins || []).some((p) => p.id === 'frp' && p.configured); } catch { }
      const FRP_MSG = tr('Public URLs need the frp relay — not configured on this instance');
      const machines = [{ id: '__local__', name: tr('This machine'), online: true }, ...hosts.map((h) => ({ id: h.id, name: h.name || h.id, online: h.transport === 'dial' ? !!h.online : true }))];
      const nameOf = (hid) => (machines.find((m) => m.id === hid) || {}).name || hid;

      const render = async () => {
        if (!c.isConnected) return;
        let fwds = [];
        try { fwds = ((await api('/api/port-forwards')) || {}).forwards || []; } catch { }
        c.innerHTML = '';
        // active forwards
        const sec = document.createElement('div');
        sec.innerHTML = `<div class="usage-section-title">${escHtml(tr('Active forwards'))}</div>`;
        if (!fwds.length) sec.innerHTML += `<div class="empty-hint empty-hint-inline">${escHtml(tr('No forwards yet — scan a machine below'))}</div>`;
        for (const f of fwds) {
          const row = document.createElement('div');
          row.className = 'ports-row';
          const label = `${escHtml(nameOf(f.hostId))}:${f.remotePort}`;
          row.innerHTML = `<span class="ports-row-label" title="${label}">${label}${f.publicUrl ? ` <span class="ports-pub" title="${escHtml(f.publicUrl)}">${PORT_ICONS.globe}</span>` : ''}</span>`;
          const acts = document.createElement('span');
          acts.className = 'ports-row-actions';
          const btn = (icon, tip, fn) => { const b = document.createElement('button'); b.className = 'mounts-icon-btn'; b.innerHTML = icon; b.dataset.tip = tip; b.onclick = fn; return b; };
          if (f.url) acts.append(btn(PORT_ICONS.open, tr('Open (through the app proxy)'), () => this.app.openBrowser?.(f.publicUrl || f.url, { proxy: !f.publicUrl })));
          const pubBtn = btn(f.publicUrl ? PORT_ICONS.globeOff : PORT_ICONS.globe,
            !frpOk && !f.publicUrl ? FRP_MSG : (f.publicUrl ? tr('Unpublish from the internet') : tr('Publish to the internet (frp relay)')),
            async () => {
              if (!frpOk && !f.publicUrl) { showToast(FRP_MSG, { type: 'error' }); return; }
              // fetchJson never throws — a 4xx comes back as {error}; surface it
              const r = await api(`/api/port-forward/${encodeURIComponent(f.id)}/publish`, { method: f.publicUrl ? 'DELETE' : 'POST' });
              if (r?.error) showToast(r.error, { type: 'error' });
              else if (r?.publicUrl) showToast(tr('Published: {url}', { url: r.publicUrl }));
              render();
            });
          if (!frpOk && !f.publicUrl) pubBtn.classList.add('ports-btn-off');
          acts.append(pubBtn);
          acts.append(btn(PORT_ICONS.x, tr('Stop forwarding'), async () => {
            const r = await api(`/api/port-forward/${encodeURIComponent(f.id)}`, { method: 'DELETE' });
            if (r?.error) showToast(r.error, { type: 'error' });
            render();
          }));
          row.appendChild(acts);
          sec.appendChild(row);
        }
        c.appendChild(sec);
        // per-machine scan sections
        for (const m of machines) {
          const ms = document.createElement('div');
          ms.className = 'ports-machine';
          const head = document.createElement('div');
          head.className = 'usage-section-title ports-machine-head';
          head.innerHTML = `<span>${escHtml(m.name)}</span>`;
          const scan = document.createElement('button');
          scan.className = 'mounts-btn';
          scan.textContent = tr('Scan ports');
          scan.disabled = !m.online;
          if (!m.online) scan.dataset.tip = tr('Machine is offline');
          const list = document.createElement('div');
          scan.onclick = async () => {
            scan.disabled = true; scan.textContent = tr('Scanning…');
            try {
              const r = await api(`/api/hosts/${encodeURIComponent(m.id)}/ports`);
              if (r?.error) throw new Error(r.error);
              list.innerHTML = '';
              const all = r?.ports || [];
              // vscode-style: known non-web system listeners (sshd, dns, cups…)
              // fold behind an expander instead of burying the dev servers
              const vis = all.filter((p) => !p.hidden).slice(0, 40);
              const hid = all.filter((p) => p.hidden);
              const portRow = (p) => {
                const pr = document.createElement('div');
                pr.className = 'ports-row' + (p.hidden ? ' ports-row-sys' : '');
                pr.innerHTML = `<span class="ports-row-label">${p.port}${p.proc ? ' <span class="ports-proc">' + escHtml(p.proc) + '</span>' : ''}</span>`;
                const fb = document.createElement('button');
                fb.className = 'mounts-icon-btn'; fb.innerHTML = PORT_ICONS.fwd; fb.dataset.tip = tr('Forward this port here');
                fb.onclick = async () => {
                  const fr = await api(`/api/hosts/${encodeURIComponent(m.id)}/port-forward`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: p.port }) });
                  if (fr?.error) showToast(fr.error, { type: 'error' });
                  render();
                };
                pr.appendChild(fb);
                return pr;
              };
              for (const p of vis) list.appendChild(portRow(p));
              if (hid.length) {
                const ex = document.createElement('button');
                ex.className = 'ports-sys-expander';
                ex.textContent = tr('+ {n} system listeners', { n: hid.length });
                ex.onclick = () => { ex.replaceWith(...hid.map(portRow)); };
                list.appendChild(ex);
              }
              if (!all.length) list.innerHTML = `<div class="empty-hint empty-hint-inline">${escHtml(tr('No listening ports found'))}</div>`;
            } catch (e) { list.innerHTML = `<div class="empty-hint empty-hint-inline">${escHtml(e.message || 'scan failed')}</div>`; }
            scan.disabled = false; scan.textContent = tr('Scan ports');
          };
          head.appendChild(scan);
          ms.append(head, list);
          c.appendChild(ms);
        }
      };
      render();
      // live refresh: forwards changes + new-port announcements re-render;
      // handler self-disarms once the panel leaves the DOM
      this.app.ws.onGlobal((msg) => {
        if (!c.isConnected) return;
        if (msg.type === 'port-forwards-updated' || msg.type === 'machine-ports-new') render();
      });
    },
  });
}
