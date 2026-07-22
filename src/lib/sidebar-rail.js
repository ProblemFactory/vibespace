// Sidebar Activity Rail (vscode-style) — docs/design-sidebar-rail.md.
// A ~44px vertical icon strip on the sidebar's edge replaces the 3-tab bar:
// content panels (Folders / Task Groups / Remote / Ports) + management panels
// (Agents / Plugins) + pinned launchers (Diagnostics / Settings). The panels
// render into the SAME list area the tabs used; Agents/Plugins reuse their
// modal renderers via the { container } option (one source of truth).
// Setting `sidebar.activityRail` (default ON) restores the classic tab bar +
// modal dialogs when off. Mobile keeps its own nav — the rail never renders.
import { t as tr } from './i18n.js';
import { copyText, escHtml, showToast, fetchJson, showContextMenu } from './utils.js';

// Protocol chip: what a port speaks (http/https/tcp) → how it can be shared.
// `over` = user override active (shown filled/accented). Clicking opens the
// override menu (Auto / HTTP / HTTPS / TCP).
export const PROTO_LABEL = { http: 'HTTP', https: 'HTTPS', tcp: 'TCP' };
export function protoChip(proto, { over = false } = {}) {
  if (!proto) return '';
  return `<span class="ports-proto ports-proto-${proto}${over ? ' ports-proto-over' : ''}" data-tip="${over ? escHtml(tr('Protocol forced to {p} (click to change)', { p: PROTO_LABEL[proto] })) : escHtml(tr('Detected {p} (click to override)', { p: PROTO_LABEL[proto] }))}">${PROTO_LABEL[proto]}${over ? '*' : ''}</span>`;
}

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
  system: R('<path d="M12 12l3.5-3.5"/><path d="M5 19a9 9 0 1 1 14 0"/>'),
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
  copy: A('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
};

const PANEL_TABS = ['ports', 'agents', 'plugins', 'system'];

// Sidebar header title per rail item (the tab bar is hidden, so the header is
// the only label saying which panel is showing).
const RAIL_TITLES = {
  folders: 'Sessions', tasks: 'Task Groups', mounts: 'Remote',
  ports: 'Ports', agents: 'Agents', plugins: 'Plugins', system: 'System',
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
        item('system', tr('System'), () => this._railGo('system')),
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
        // The renders-once panel guard (2.195.0) means the Ports panel's
        // machine roster no longer heals via incidental digest rebuilds — a
        // pair/unpair while it's open must rebuild it explicitly (its live
        // subscriptions cover forwards/scans, not the roster itself).
        if (msg.type === 'hosts-updated' && this._activeTab === 'ports') {
          this.listEl.querySelector('.rail-panel-ports')?.remove();
          this._renderRailPanel();
        }
      });
      this._railRefreshBadges();
      // diagnostics: one cheap cached probe per page load, not a poll
      fetchJson('/api/telemetry/summary?days=1').then((r) => {
        const n = (r?.errors || []).reduce((a, g) => a + (g.count || 0), 0);
        if (n) this._railSetBadge('diagnostics', n > 99 ? '99+' : n);
      }).catch(() => {});
      // system: one probe at load; live updates ride the sysinfo-alert
      // broadcast (app.js toasts it and calls _railSysBadge)
      fetchJson('/api/sysinfo').then((r) => this._railSysBadge(r?.mem?.pct)).catch(() => {});
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
      else if (this._activeTab === 'system') this._renderSystemPanel(c);
      this._railSync();
    },

    /** Memory badge on the System rail icon: shown at ≥80% (amber via CSS
     *  class), red ≥92%. Called from the load probe + sysinfo-alert pushes. */
    _railSysBadge(pct) {
      if (!this._railEl) return;
      const b = this._railEl.querySelector('.rail-item[data-rail="system"]');
      if (!b) return;
      this._railSetBadge('system', pct >= 80 ? pct + '%' : '');
      b.classList.toggle('rail-danger', pct >= 92);
      b.classList.toggle('rail-warn', pct >= 80 && pct < 92);
    },

    /** 14-day daily-cost bars for the System panel — hand-drawn canvas (no
     *  Chart.js lifecycle in the rail), ledger data from /api/usage-stats.
     *  Fetched once per panel render (the ledger scan is server-throttled;
     *  the 5s sysinfo interval must NOT hammer it — render() skips the chart
     *  when one is already drawn). */
    async _renderRailUsageChart(c) {
      const canvas = c.querySelector('.sys-usage-chart');
      if (!canvas || canvas.dataset.drawn) return;
      canvas.dataset.drawn = '1';
      const to = Date.now(), from = to - 14 * 864e5;
      let d = null;
      try { d = await fetchJson(`/api/usage-stats?from=${from}&to=${to}`); } catch { }
      const rows = d?.groups?.day || [];
      const stats = c.querySelector('.sys-usage-stats');
      if (!d || d.error || !rows.length) {
        if (stats) stats.textContent = tr('No usage recorded in the last 14 days.');
        canvas.remove();
        return;
      }
      // gap-fill the 14-day scale so quiet days render as gaps, not a squeezed axis
      const byKey = new Map(rows.map((r) => [r.key, r]));
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const dt = new Date(to - i * 864e5);
        const key = dt.toISOString().slice(0, 10);
        days.push({ key, cost: byKey.get(key)?.cost || 0, tokens: byKey.get(key)?.totalTokens || 0 });
      }
      const dpr = window.devicePixelRatio || 1;
      const wCss = canvas.clientWidth || canvas.parentElement.clientWidth || 220;
      canvas.width = wCss * dpr; canvas.height = 72 * dpr;
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
      const cs = getComputedStyle(document.documentElement);
      const accent = (cs.getPropertyValue('--accent') || '#5b8def').trim() || '#5b8def';
      const dim = (cs.getPropertyValue('--text-dim') || '#888').trim() || '#888';
      const max = Math.max(0.01, ...days.map((x) => x.cost));
      const bw = wCss / days.length;
      ctx.font = '9px sans-serif'; ctx.fillStyle = dim;
      for (let i = 0; i < days.length; i++) {
        const h = Math.max(days[i].cost > 0 ? 2 : 0, 58 * days[i].cost / max);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(i * bw + 1.5, 60 - h, Math.max(2, bw - 3), h);
      }
      ctx.globalAlpha = 1; ctx.fillStyle = dim;
      ctx.fillText(days[0].key.slice(5), 0, 70);
      const lastLbl = days[days.length - 1].key.slice(5);
      ctx.fillText(lastLbl, wCss - ctx.measureText(lastLbl).width, 70);
      const peak = '$' + max.toFixed(2);
      ctx.fillText(peak, wCss - ctx.measureText(peak).width, 8);
      canvas.title = tr('Estimated API-equivalent cost per day (subscriptions are plan-covered) — open Usage for the full breakdown');
      if (stats) {
        const totCost = days.reduce((a, b) => a + b.cost, 0);
        const totTok = days.reduce((a, b) => a + b.tokens, 0);
        const fmtT = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(n);
        stats.innerHTML = `<span class="sys-usage-stat">${escHtml(tr('est. cost'))} <b>$${totCost.toFixed(2)}</b></span> · <span class="sys-usage-stat">${escHtml(tr('tokens'))} <b>${fmtT(totTok)}</b></span>`;
      }
    },

    // ── System panel: container memory / disk / load / top processes ──
    async _renderSystemPanel(c) {
      c.innerHTML = `<div class="empty-hint">${escHtml(tr('Loading…'))}</div>`;
      const fmt = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : Math.round(b / 1048576) + ' MB';
      const bar = (pct, label) => {
        const color = pct >= 92 ? 'var(--red, #e55)' : pct >= 80 ? 'var(--yellow, #e5c07b)' : 'var(--green, #3fb950)';
        return `<div class="sys-bar" title="${escHtml(label)}"><div class="sys-bar-fill" style="width:${Math.min(100, pct)}%;background:${color}"></div><span class="sys-bar-label">${escHtml(label)}</span></div>`;
      };
      const render = async () => {
        if (!c.isConnected) return;
        let d = null;
        try { d = await fetchJson('/api/sysinfo'); } catch { }
        if (!d || !c.isConnected) return;
        this._railSysBadge(d.mem?.pct || 0);
        const parts = [];
        parts.push(`<div class="usage-section-title">${escHtml(tr('Memory'))}</div>`);
        parts.push(bar(d.mem.pct, `${fmt(d.mem.used)} / ${fmt(d.mem.limit)} · ${d.mem.pct}%`));
        if (d.mem.pct >= 80) parts.push(`<div class="usage-warn">${escHtml(tr('Close to the container limit — the kernel may OOM-kill the whole instance (all sessions die). Stop the top consumers below.'))}</div>`);
        if (d.disk) {
          parts.push(`<div class="usage-section-title">${escHtml(tr('Disk (workspace)'))}</div>`);
          parts.push(bar(d.disk.pct, `${fmt(d.disk.used)} / ${fmt(d.disk.total)} · ${d.disk.pct}%`));
        }
        parts.push(`<div class="usage-section-title">${escHtml(tr('Load'))}</div>`);
        parts.push(`<div class="sys-load">${d.load.join(' · ')} <span class="sys-load-cpus">/ ${d.cpus} CPU</span></div>`);
        parts.push(`<div class="usage-section-title">${escHtml(tr('Top processes (by memory)'))}</div>`);
        for (const p of d.procs || []) {
          parts.push(`<div class="sys-proc" title="${escHtml(p.cmd)}"><span class="sys-proc-rss">${fmt(p.rss)}</span><span class="sys-proc-cmd">${escHtml(p.cmd.slice(0, 70))}</span></div>`);
        }
        parts.push(`<div class="empty-hint empty-hint-inline">${escHtml(tr('Orphaned dev servers show in Ports with a Kill button'))}</div>`);
        // Usage history (user request): a compact 14-day daily-cost chart from
        // the permanent ledger, with a click-through to the full Usage window.
        parts.push(`<div class="usage-section-title">${escHtml(tr('Usage (14 days)'))} <span class="sys-usage-open" style="float:right;cursor:pointer;color:var(--accent);text-transform:none;letter-spacing:0">${escHtml(tr('Open Usage…'))}</span></div>`);
        parts.push(`<canvas class="sys-usage-chart" height="72"></canvas><div class="sys-usage-stats tiny"></div>`);
        c.innerHTML = parts.join('');
        c.querySelector('.sys-usage-open')?.addEventListener('click', () => this.app.openUsage?.());
        this._renderRailUsageChart(c).catch(() => { });
      };
      await render();
      const t = setInterval(() => { if (!c.isConnected) { clearInterval(t); return; } render(); }, 5000);
      this._panelDispose = () => clearInterval(t);
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
          const label = `${escHtml(nameOf(f.hostId))}${f.targetHost ? '→' + escHtml(f.targetHost) : ''}:${f.remotePort}`;
          row.innerHTML = `<span class="ports-row-label" title="${label}">${label} ${protoChip(f.proto, { over: !!f.protoOverride })}${f.publicUrl ? ` <span class="ports-pub" title="${escHtml(f.publicUrl)}">${PORT_ICONS.globe}</span>` : ''}</span>`;
          // the proto chip is the override handle
          const chip = row.querySelector('.ports-proto');
          if (chip) chip.onclick = (ev) => this._portProtoMenu(ev, f, render);
          const acts = document.createElement('span');
          acts.className = 'ports-row-actions';
          const btn = (icon, tip, fn) => { const b = document.createElement('button'); b.className = 'mounts-icon-btn'; b.innerHTML = icon; b.dataset.tip = tip; b.onclick = fn; return b; };
          if (f.url) acts.append(btn(PORT_ICONS.open, tr('Open (through the app proxy)'), () => this.app.openBrowser?.(f.publicUrl || f.url, { proxy: !f.publicUrl })));
          // publish tooltip states the OUTCOME per effective proto (a raw-TCP
          // service becomes tcp://ip:port, an http one a trusted https URL)
          const pubHint = f.publicUrl ? tr('Unpublish from the internet')
            : f.proto === 'tcp' ? tr('Publish (raw TCP → tcp://host:port)')
            : f.proto === 'https' ? tr('Publish (HTTPS backend → https://host:port passthrough)')
            : f.proto === 'http' ? tr('Publish (HTTP → trusted https:// link)')
            : tr('Publish to the internet (frp relay)');
          const pubBtn = btn(f.publicUrl ? PORT_ICONS.globeOff : PORT_ICONS.globe,
            !frpOk && !f.publicUrl ? FRP_MSG : pubHint,
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
          // published forwards show the ADDRESS itself — a tooltip-only 🌐 left
          // nothing to copy (real report); click opens, the button copies
          if (f.publicUrl) {
            const ur = document.createElement('div');
            ur.className = 'ports-url-row';
            const a = document.createElement('a');
            a.href = '#'; a.textContent = f.publicUrl;
            a.onclick = (ev) => { ev.preventDefault(); this.app.openBrowser?.(f.publicUrl); };
            const cp = document.createElement('button');
            cp.className = 'mounts-icon-btn'; cp.dataset.tip = tr('Copy URL');
            cp.innerHTML = PORT_ICONS.copy;
            cp.onclick = () => { copyText(f.publicUrl); showToast(tr('Copied')); };
            ur.append(a, cp);
            sec.appendChild(ur);
          }
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
                pr.innerHTML = `<span class="ports-row-label">${p.port}${p.proc ? ' <span class="ports-proc">' + escHtml(p.proc) + '</span>' : ''} ${protoChip(p.proto)}${p.orphan ? ` <span class="ports-orphan" title="${escHtml(tr('This process is listening from a DELETED working directory — a removed worktree left its dev server running'))}">${escHtml(tr('orphan'))}</span>` : ''}</span>`;
                // orphaned (deleted-cwd) listeners get a Kill instead of Forward
                if (p.orphan && p.pid && m.id === '__local__') {
                  const kb = document.createElement('button');
                  kb.className = 'mounts-icon-btn'; kb.innerHTML = PORT_ICONS.x; kb.dataset.tip = tr('Kill this orphaned process');
                  kb.onclick = async () => {
                    const kr = await api('/api/ports/kill-orphan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid: p.pid }) });
                    if (kr?.error) showToast(kr.error, { type: 'error' });
                    else { showToast(tr('Orphaned process killed')); scan.onclick(); }
                  };
                  pr.appendChild(kb);
                  return pr;
                }
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
          // manual forward: a bare port (a service on this machine) OR ip:port
          // to reach ANOTHER machine on this machine's LAN (jump host)
          const man = document.createElement('div');
          man.className = 'ports-manual';
          const mi = document.createElement('input');
          mi.type = 'text'; mi.className = 'ports-manual-input';
          mi.placeholder = tr('port or ip:port…');
          mi.title = tr('e.g. 5173, or 10.0.0.5:8080 to forward a machine on its LAN');
          const mb = document.createElement('button');
          mb.className = 'mounts-icon-btn'; mb.innerHTML = PORT_ICONS.fwd; mb.dataset.tip = tr('Forward');
          const doManual = async () => {
            const v = mi.value.trim();
            const pm = v.match(/^(?:(\[[0-9a-fA-F:]+\]|[A-Za-z0-9._-]+):)?(\d{1,5})$/);
            if (!pm || +pm[2] < 1 || +pm[2] > 65535) { showToast(tr('Enter a port (5173) or ip:port (10.0.0.5:8080)'), { type: 'error' }); return; }
            const body = { port: +pm[2], targetHost: (pm[1] || '').replace(/^\[|\]$/g, '') };
            const r = await api(`/api/hosts/${encodeURIComponent(m.id)}/port-forward`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (r?.error) showToast(r.error, { type: 'error' }); else { mi.value = ''; render(); }
          };
          mb.onclick = doManual;
          mi.onkeydown = (e) => { if (e.key === 'Enter') doManual(); };
          man.append(mi, mb);
          ms.append(head, list, man);
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

    // Override the detected protocol of a forward. Auto = clear the override
    // (fall back to detection). A published forward re-publishes in the new
    // mode server-side, so the public URL SHAPE updates too.
    _portProtoMenu(ev, f, refresh) {
      ev.stopPropagation();
      const cur = f.protoOverride || null;
      const mark = (v) => (v === cur ? '✓ ' : (v === null && !cur ? '✓ ' : '   '));
      const set = async (proto) => {
        const r = await fetchJson(`/api/port-forward/${encodeURIComponent(f.id)}/proto`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proto }),
        });
        if (r?.error) showToast(r.error, { type: 'error' });
        refresh?.();
      };
      showContextMenu(ev.clientX, ev.clientY, [
        { label: `${mark(null)}${tr('Auto')}${f.protoDetected ? ` (${PROTO_LABEL[f.protoDetected] || f.protoDetected})` : ''}`, action: () => set(null) },
        { label: `${mark('http')}${tr('Force HTTP')}`, action: () => set('http') },
        { label: `${mark('https')}${tr('Force HTTPS')}`, action: () => set('https') },
        { label: `${mark('tcp')}${tr('Force TCP')}`, action: () => set('tcp') },
      ]);
    },
  });
}
