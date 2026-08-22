// Sidebar Activity Rail (vscode-style) — docs/design-sidebar-rail.md.
// A ~44px vertical icon strip on the sidebar's edge replaces the 3-tab bar:
// content panels (Folders / Task Groups / Remote / Ports) + management panels
// (Agents / Plugins) + pinned launchers (Diagnostics / Settings). The panels
// render into the SAME list area the tabs used; Agents/Plugins reuse their
// modal renderers via the { container } option (one source of truth).
// Setting `sidebar.activityRail` (default ON) restores the classic tab bar +
// modal dialogs when off. Mobile keeps its own nav — the rail never renders.
import { t as tr } from './i18n.js';
import { openJobsWindow } from './jobs-panel.js';
import { copyText, escHtml, showToast, fetchJson, showContextMenu, showConfirmDialog, showInputDialog, absUrl } from './utils.js';
import { track } from './telemetry-client.js';
import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from 'chart.js';
// Self-contained registration (idempotent) — the rail must not depend on the
// usage-dashboard module having run its own Chart.register first.
Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

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
  jobs: R('<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M6.5 7h.01M6.5 17h.01"/><path d="M14 6l3 1.5-3 1.5z" fill="currentColor"/>'),
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
  path: A('<path d="M4 6h16M4 12h10M4 18h6"/><path d="M17 15l3 3-3 3"/>'),
  pathOff: A('<path d="M4 6h16M4 12h10M4 18h6"/><path d="M15 15l6 6M21 15l-6 6"/>'),
  lock: A('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  unlock: A('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-1.9"/>'),
};

const PANEL_TABS = ['ports', 'agents', 'plugins', 'jobs', 'system'];

// Sidebar header title per rail item (the tab bar is hidden, so the header is
// the only label saying which panel is showing).
const RAIL_TITLES = {
  folders: 'Sessions', tasks: 'Task Groups', mounts: 'Remote',
  ports: 'Ports', agents: 'Agents', plugins: 'Plugins', jobs: 'Background Work', system: 'System',
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
        item('jobs', tr('Background Work'), () => this._railGo('jobs')),
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
        if (msg.type === 'jobs-updated') {
          this._railRefreshBadges();
          if (this._activeTab === 'jobs') { this.listEl.querySelector('.rail-panel-jobs')?.remove(); this._renderRailPanel(); }
        }
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
        const jb = await fetchJson('/api/jobs').catch(() => null);
        if (jb?.jobs) {
          const bad = jb.jobs.filter((j) => ['failed', 'missed', 'unverified'].includes(j.state)).length;
          const ask = jb.jobs.filter((j) => j.state === 'awaiting-user').length;
          const live = jb.jobs.filter((j) => ['up', 'starting'].includes(j.state)).length;
          this._railSetBadge('jobs', bad ? bad + '!' : ask ? ask + '?' : live || '');
          const b = this._railEl.querySelector('.rail-item[data-rail="jobs"]');
          if (b) { b.classList.toggle('rail-danger', bad > 0); b.classList.toggle('rail-warn', !bad && ask > 0); }
        }
      } catch { }
    },

    _removeRail() {
      if (!this._railEl) return;
      try { this._panelDispose?.(); } catch (e) { try { track('event', 'rail-dispose-failed'); } catch {} console.warn('[rail] panel dispose failed:', e); }
      this._panelDispose = null;
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
      try { this._panelDispose?.(); } catch (e) { try { track('event', 'rail-dispose-failed'); } catch {} console.warn('[rail] panel dispose failed:', e); }
      this._panelDispose = null;
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
      try { this._panelDispose?.(); } catch (e) { try { track('event', 'rail-dispose-failed'); } catch {} console.warn('[rail] panel dispose failed:', e); }
      this._panelDispose = null;
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
      else if (this._activeTab === 'jobs') this._renderJobsRailPanel(c);
      else if (this._activeTab === 'system') this._renderSystemPanel(c);
      this._railSync();
    },

    /** Background Work rail panel — THE primary surface since 2.357.0 (the
     *  window is the mobile/rail-off fallback): full list, inline expand,
     *  inline interaction forms. Renders-once guard + jobs-updated rebuild
     *  come from _renderRailPanel. All strings textContent (XSS law). */
    _renderJobsRailPanel(c) {
      openJobsWindow.renderRail?.(this.app, c);
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

    /** CPU/memory history area charts for the System panel — hand-drawn
     *  canvas over the self-sampled rings (/api/sysinfo/history). Memory
     *  scales to the container limit; CPU to the observed peak (cpu count as
     *  the reference line when known). */
    _destroyRailSysCharts() {
      for (const ch of this._railSysCharts || []) { try { ch.destroy(); } catch {} }
      this._railSysCharts = [];
    },

    // History charts (2.226.3 REBUILD — the 2.223.1 commit shipped a partial
    // state: a draw function with no DOM builder and a dispose calling a
    // helper that never existed, so charts were invisible and LEAVING the
    // panel threw + bricked the rail. This is the intended interactive
    // Chart.js version; local instance only — the sampler runs in this
    // server, so the machine switcher hides history for remote machines.)
    async _renderRailResourceCharts(hist, range) {
      if (!hist.isConnected) return;
      if (!hist.querySelector('.sys-hist-wrap')) {
        hist.innerHTML = `
          <div class="usage-section-title">${escHtml(tr('History'))}<span class="sys-range">${['1h', '24h', '7d'].map((rr) => `<span class="sys-range-chip${rr === range ? ' on' : ''}" data-r="${rr}">${rr}</span>`).join('')}</span></div>
          <div class="sys-hist-wrap">
            <div class="sys-chart-label"><span>${escHtml(tr('Memory'))}</span><b class="sys-chart-cur" data-ch="mem"></b></div>
            <div class="sys-chart-box"><canvas class="sys-hist-chart" data-ch="mem"></canvas></div>
            <div class="sys-chart-label"><span>CPU</span><b class="sys-chart-cur" data-ch="cpu"></b></div>
            <div class="sys-chart-box"><canvas class="sys-hist-chart" data-ch="cpu"></canvas></div>
            <div class="sys-chart-label"><span>${escHtml(tr('Loop lag'))}</span><b class="sys-chart-cur" data-ch="lag"></b></div>
            <div class="sys-chart-box"><canvas class="sys-hist-chart" data-ch="lag"></canvas></div>
            <div class="sys-hist-note"></div>
          </div>`;
        hist.querySelectorAll('.sys-range-chip').forEach((chip) => chip.addEventListener('click', () => {
          this._railSysRange = chip.dataset.r;
          hist.querySelectorAll('.sys-range-chip').forEach((c2) => c2.classList.toggle('on', c2 === chip));
          this._renderRailResourceCharts(hist, this._railSysRange).catch(() => {});
        }));
      }
      let d = null;
      try { d = await fetchJson(`/api/sysinfo/history?range=${encodeURIComponent(range)}`); } catch {}
      if (!hist.isConnected) return;
      const note = hist.querySelector('.sys-hist-note');
      const pts = d?.points || [];
      this._destroyRailSysCharts();
      if (pts.length < 2) {
        if (note) note.innerHTML = `<div class="empty-hint empty-hint-inline">${escHtml(tr('Collecting samples — history appears after a few minutes.'))}</div>`;
        return;
      }
      if (note) note.innerHTML = '';
      const cs = getComputedStyle(document.documentElement);
      const col = (v, fb) => (cs.getPropertyValue(v) || fb).trim() || fb;
      const tint = (c3) => /^#[0-9a-f]{6}$/i.test(c3) ? c3 + '20' : 'transparent';
      const fmtG = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(1) + 'G' : Math.round(b / 1048576) + 'M';
      // Decimate for tooltip/render perf — the fine ring is ~1900 points at 24h.
      const step = Math.max(1, Math.ceil(pts.length / 400));
      const p = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
      const labels = p.map((x) => new Date(x.t).toISOString().slice(range === '7d' ? 5 : 11, range === '7d' ? 10 : 16));
      const lim = Math.max(...pts.map((x) => x.l || 0), 1);
      const mk = (ch, data, color, yMax, fmtV) => {
        const canvas = hist.querySelector(`.sys-hist-chart[data-ch="${ch}"]`);
        if (!canvas) return;
        const inst = new Chart(canvas, {
          type: 'line',
          data: { labels, datasets: [{ data, borderColor: color, backgroundColor: tint(color), fill: true, pointRadius: 0, borderWidth: 1.4, tension: 0.25, xAxisID: 'x', yAxisID: 'y' }] },
          options: {
            animation: false, responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c2) => fmtV(c2.parsed.y) } } },
            scales: {
              x: { ticks: { maxTicksLimit: 4, color: col('--text-dim', '#888'), font: { size: 9 } }, grid: { display: false } },
              y: { beginAtZero: true, max: yMax || undefined, ticks: { maxTicksLimit: 3, color: col('--text-dim', '#888'), font: { size: 9 }, callback: (v) => fmtV(v) }, grid: { color: tint(col('--text-dim', '#888')) } },
            },
          },
        });
        this._railSysCharts = this._railSysCharts || [];
        this._railSysCharts.push(inst);
      };
      // AUTO-SCALE the memory axis to the data, not the machine limit (owner
      // report: 20G of use on a 122G machine drew as a flat line at the
      // bottom) — peak ×1.2 headroom, capped at the limit; the "cur / limit"
      // label above the chart keeps the absolute context.
      const peakM = Math.max(...pts.map((x) => x.m || 0), 1);
      mk('mem', p.map((x) => x.m), col('--blue', '#61afef'), Math.min(lim, peakM * 1.2), fmtG);
      const peakC = Math.max(...pts.map((x) => x.c ?? 0), 0.1);
      const cpuMax = d.cpus && d.cpus >= peakC ? Math.min(d.cpus, Math.max(1, Math.ceil(peakC))) : Math.ceil(peakC);
      mk('cpu', p.map((x) => x.c), col('--red', '#e06c75'), cpuMax, (v) => (typeof v === 'number' ? v.toFixed(v < 10 ? 2 : 0) : v));
      // Event-loop lag (B-bb68, the metric that cracked the userN freeze
      // case): fine points carry `e` per sample; coarse (7d) points carry the
      // window max since 2.243.0 — older coarse samples lack it, so hide the
      // row when the range has no lag data at all.
      const fmtMs = (v) => (typeof v !== 'number' ? v : v >= 1000 ? (v / 1000).toFixed(1) + 's' : Math.round(v) + 'ms');
      const hasLag = pts.some((x) => x.e != null);
      const lagRow = hist.querySelector('.sys-chart-cur[data-ch="lag"]')?.parentElement;
      const lagBox = hist.querySelector('.sys-hist-chart[data-ch="lag"]')?.parentElement;
      if (lagRow) lagRow.style.display = hasLag ? '' : 'none';
      if (lagBox) lagBox.style.display = hasLag ? '' : 'none';
      if (hasLag) mk('lag', p.map((x) => x.e ?? null), col('--yellow', '#e5c07b'), undefined, fmtMs);
      const last = pts[pts.length - 1];
      const curMem = hist.querySelector('.sys-chart-cur[data-ch="mem"]'); if (curMem) curMem.textContent = fmtG(last.m) + ' / ' + fmtG(lim);
      const curCpu = hist.querySelector('.sys-chart-cur[data-ch="cpu"]'); if (curCpu && last.c != null) curCpu.textContent = last.c.toFixed(2);
      const curLag = hist.querySelector('.sys-chart-cur[data-ch="lag"]'); if (curLag && last.e != null) curLag.textContent = fmtMs(last.e);
    },

    // ── System panel: container memory / disk / load / top processes ──
    // Machine switcher (2.226.3, user request): the same panel can inspect any
    // configured machine — live snapshot over the shared read-only probe
    // channel (ssh AND dial); history stays local (the sampler runs here).
    async _renderSystemPanel(c) {
      c.innerHTML = `<div class="empty-hint">${escHtml(tr('Loading…'))}</div>`;
      const fmt = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : Math.round(b / 1048576) + ' MB';
      const bar = (pct, label) => {
        const color = pct >= 92 ? 'var(--red, #e55)' : pct >= 80 ? 'var(--yellow, #e5c07b)' : 'var(--green, #3fb950)';
        return `<div class="sys-bar" title="${escHtml(label)}"><div class="sys-bar-fill" style="width:${Math.min(100, pct)}%;background:${color}"></div><span class="sys-bar-label">${escHtml(label)}</span></div>`;
      };
      let hostsList = [];
      try { hostsList = (await fetchJson('/api/hosts'))?.hosts || []; } catch {}
      if (!c.isConnected) return;
      // zone order: bars → history charts → process table LAST (owner
      // report: the long table pushed the charts out of sight)
      c.innerHTML = '<div class="sys-host-row"></div><div class="sys-live"></div><div class="sys-hist"></div><div class="sys-procs"></div>';
      const hostRow = c.querySelector('.sys-host-row');
      const live = c.querySelector('.sys-live');
      const procsEl = c.querySelector('.sys-procs');
      const hist = c.querySelector('.sys-hist');
      const render = async () => {
        if (!c.isConnected) return;
        const hostId = this._railSysHost || '';
        let d = null;
        try { d = await fetchJson('/api/sysinfo' + (hostId ? `?host=${encodeURIComponent(hostId)}` : '')); } catch {}
        if (!c.isConnected || hostId !== (this._railSysHost || '')) return; // stale response after a switch
        if (!d || d.error) { live.innerHTML = `<div class="empty-hint">${escHtml(d?.error || tr('Machine unreachable'))}</div>`; return; }
        if (!hostId) this._railSysBadge(d.mem?.pct || 0); // the taskbar badge tracks THIS instance only
        const parts = [];
        if (d.mem) {
          parts.push(`<div class="usage-section-title">${escHtml(tr('Memory'))}</div>`);
          parts.push(bar(d.mem.pct, `${fmt(d.mem.used)} / ${fmt(d.mem.limit)} · ${d.mem.pct}%`));
          // The cgroup's own total counts reclaimable page cache; a
          // file-heavy pod sits at 100% of it forever while nothing is wrong.
          // We show the working set (kubectl-top definition) and name the
          // difference, so this panel and any other tool can be reconciled.
          if (d.mem.raw > d.mem.used * 1.15 && d.mem.cache > 0) {
            parts.push(`<div class="empty-hint empty-hint-inline">${escHtml(tr('cgroup total {raw} incl. {cache} file cache (reclaimable, not counted above)', { raw: fmt(d.mem.raw), cache: fmt(d.mem.cache) }))}</div>`);
          }
          if (!hostId && d.mem.pct >= 80) parts.push(`<div class="usage-warn">${escHtml(tr('Close to the container limit — the kernel may OOM-kill the whole instance (all sessions die). Stop the top consumers below.'))}</div>`);
        }
        if (d.disk) {
          parts.push(`<div class="usage-section-title">${escHtml(tr('Disk (workspace)'))}</div>`);
          parts.push(bar(d.disk.pct, `${fmt(d.disk.used)} / ${fmt(d.disk.total)} · ${d.disk.pct}%`));
        }
        if (d.load) {
          parts.push(`<div class="usage-section-title">${escHtml(tr('Load'))}</div>`);
          parts.push(`<div class="sys-load">${d.load.join(' · ')}${d.cpus ? ` <span class="sys-load-cpus">/ ${d.cpus} CPU</span>` : ''}</div>`);
        }
        live.innerHTML = parts.join('');
      };
      this._buildProcManager(procsEl, () => this._railSysHost || '');
      const renderHist = () => this._renderRailResourceCharts(hist, this._railSysRange || '24h').catch(() => {});
      const syncHist = () => {
        if (this._railSysHost) {
          this._destroyRailSysCharts();
          hist.innerHTML = `<div class="empty-hint empty-hint-inline">${escHtml(tr('History charts cover this instance only (sampling runs here).'))}</div>`;
        } else { hist.innerHTML = ''; renderHist(); }
      };
      if (hostsList.length) {
        const sel = document.createElement('select');
        sel.className = 'sys-host-sel';
        sel.innerHTML = `<option value="">${escHtml(tr('This machine'))}</option>` + hostsList.map((h) => `<option value="${escHtml(h.id)}"${h.id === this._railSysHost ? ' selected' : ''}>${escHtml(h.name || h.host || h.id)}</option>`).join('');
        sel.onchange = () => {
          this._railSysHost = sel.value;
          live.innerHTML = `<div class="empty-hint">${escHtml(tr('Loading…'))}</div>`;
          syncHist();
          render();
          this._prcRefresh?.(true); // immediate table swap to the new machine
        };
        hostRow.appendChild(sel);
      } else if (this._railSysHost) this._railSysHost = ''; // hosts removed since last open
      // Two lifecycles: the LIVE zone refreshes every 5s (remote: ~10s — each
      // refresh is a real probe round trip); the HISTORY zone rebuilds only on
      // range change + a slow 60s tick — a 5s innerHTML swap under the cursor
      // killed all interactivity.
      let lastRemote = 0;
      await render();
      syncHist();
      const t = setInterval(() => {
        if (!c.isConnected) { clearInterval(t); return; }
        if (this._railSysHost) { if (Date.now() - lastRemote < 9500) return; lastRemote = Date.now(); }
        render();
        if (!this._prcPaused) this._prcRefresh?.();
      }, 5000);
      const th = setInterval(() => { if (!c.isConnected) { clearInterval(th); return; } if (!this._railSysHost) renderHist(); }, 60000);
      this._panelDispose = () => { clearInterval(t); clearInterval(th); this._destroyRailSysCharts(); };
    },

    // ── Process manager (2.354.0, the btop analogue): full table, live CPU%,
    // sort / search / tree, per-row signals. Controls build ONCE (an input
    // inside the 5s-swapped zone would lose focus every tick); only the table
    // re-renders. Expansions keyed by pid survive refreshes. ──
    _buildProcManager(root, getHostId) {
      this._prcSort = this._prcSort || 'cpu';
      this._prcExpanded = this._prcExpanded || new Set();
      let query = '';
      let data = null; // last /api/sysinfo/procs response
      let showAll = false;
      root.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'usage-section-title prc-head';
      head.innerHTML = `<span>${escHtml(tr('Processes'))}</span><span class="prc-head-right"><span class="prc-count"></span></span>`;
      // auto-refresh pause (owner request: a row you're reading must not be
      // refreshed out from under you). Paused = the 5s tick skips this table
      // only; sort/filter/expand keep working on the frozen snapshot, and a
      // host switch or a kill outcome still refreshes explicitly.
      this._prcPaused = false;
      const pauseBtn = document.createElement('button');
      pauseBtn.className = 'mounts-icon-btn prc-pause';
      const drawPause = () => {
        pauseBtn.innerHTML = this._prcPaused
          ? R('<polygon points="6 4 20 12 6 20" fill="currentColor" stroke="none"/>')
          : R('<line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/>');
        pauseBtn.dataset.tip = this._prcPaused ? tr('Auto-refresh paused — click to resume') : tr('Pause auto-refresh');
        pauseBtn.classList.toggle('on', this._prcPaused);
        head.querySelector('.prc-count').classList.toggle('prc-count-paused', this._prcPaused);
      };
      pauseBtn.onclick = () => { this._prcPaused = !this._prcPaused; drawPause(); if (!this._prcPaused) refresh(false); };
      head.querySelector('.prc-head-right').prepend(pauseBtn);
      drawPause();
      const ctl = document.createElement('div');
      ctl.className = 'prc-ctl';
      const search = document.createElement('input');
      search.type = 'text'; search.className = 'prc-search';
      search.placeholder = tr('Filter by name / user / pid…');
      const sorts = document.createElement('div');
      sorts.className = 'sys-range prc-sorts';
      const SORTS = [['cpu', tr('CPU')], ['mem', tr('MEM')], ['pid', tr('PID')], ['name', tr('Name')], ['tree', tr('Tree')]];
      const table = document.createElement('div');
      table.className = 'prc-table';
      const drawSorts = () => {
        sorts.innerHTML = SORTS.map(([k, label]) => `<span class="sys-range-chip${this._prcSort === k ? ' on' : ''}" data-sort="${k}">${escHtml(label)}</span>`).join('');
        sorts.querySelectorAll('[data-sort]').forEach((el) => { el.onclick = () => { this._prcSort = el.dataset.sort; drawSorts(); drawTable(); }; });
      };
      const cpuOf = (p) => (p.pcpuNow != null ? p.pcpuNow : p.pcpu) || 0;
      const nameOf = (p) => {
        const first = String(p.cmd || '').split(' ')[0];
        if (first.startsWith('[')) return first; // kernel thread
        return first.replace(/:$/, '').split('/').pop() || first;
      };
      const fmtB = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(1) + 'G' : b >= 1048576 ? Math.round(b / 1048576) + 'M' : Math.round(b / 1024) + 'K';
      const fmtCpu = (p) => cpuOf(p).toFixed(cpuOf(p) >= 100 ? 0 : 1) + '%';
      // expansion keys are host-scoped (pid 1234 here and pid 1234 on another
      // machine are different processes); pid/ppid are Number-coerced before
      // any innerHTML — rows come from REMOTE machines and a compromised
      // daemon reply carrying string pids must never reach the DOM raw
      const expKey = (pid) => getHostId() + ':' + pid;
      const rowHtml = (p, depth, serverPid) => {
        const pid = String(Math.floor(Number(p.pid)) || 0);
        const ppidN = Math.floor(Number(p.ppid)) || 0;
        const exp = this._prcExpanded.has(expKey(pid));
        const cv = Math.min(100, cpuOf(p));
        const hot = cv >= 50;
        const isSrv = !getHostId() && p.pid === serverPid;
        const stateChar = String(p.state || '')[0] || '';
        // subtle btop-style CPU fill behind the row (theme-agnostic mix)
        const bg = cv >= 1 ? ` style="background:linear-gradient(90deg,color-mix(in srgb,var(--${hot ? 'red' : 'accent'}) ${hot ? 18 : 12}%,transparent) ${cv}%,transparent ${cv}%)"` : '';
        let h = `<div class="prc-row${exp ? ' expanded' : ''}${stateChar === 'T' ? ' prc-stopped' : ''}" data-pid="${pid}"${bg}>`
          + `<span class="prc-pid">${pid}</span>`
          + `<span class="prc-name" ${depth ? `style="padding-left:${Math.min(depth, 8) * 10}px"` : ''} title="${escHtml(p.cmd)}"><span class="prc-nm">${escHtml(nameOf(p))}</span>${isSrv ? `<span class="prc-chip">${escHtml(tr('server'))}</span>` : ''}${stateChar === 'T' ? `<span class="prc-chip prc-chip-warn">${escHtml(tr('paused'))}</span>` : ''}${stateChar === 'Z' ? `<span class="prc-chip prc-chip-warn">${escHtml(tr('zombie'))}</span>` : ''}</span>`
          + `<span class="prc-cpu${hot ? ' hot' : ''}">${fmtCpu(p)}</span>`
          + `<span class="prc-mem">${fmtB(p.rss)}</span></div>`;
        if (exp) {
          h += `<div class="prc-detail" data-pid="${pid}">`
            + `<div class="prc-cmdline">${escHtml(p.cmd)}</div>`
            + `<div class="prc-meta">pid ${pid} · ppid ${ppidN} · ${escHtml(p.user || '?')} · ${escHtml(p.state || '?')} · ${escHtml(tr('up {t}', { t: p.etime || '?' }))} · mem ${(Number(p.pmem) || 0).toFixed(1)}%</div>`
            + `<div class="prc-actions">`
            + (isSrv
              ? `<span class="empty-hint empty-hint-inline">${escHtml(tr('This is the VibeSpace server — restart it via Update, not a kill'))}</span>`
              : `<button class="mounts-btn prc-act" data-sig="TERM">${escHtml(tr('Terminate'))}</button>`
              + `<button class="mounts-btn prc-act prc-danger" data-sig="KILL">${escHtml(tr('Force kill'))}</button>`
              + (stateChar === 'T'
                ? `<button class="mounts-btn prc-act" data-sig="CONT">${escHtml(tr('Resume'))}</button>`
                : `<button class="mounts-btn prc-act" data-sig="STOP">${escHtml(tr('Pause'))}</button>`))
            + `<button class="mounts-btn prc-act" data-copy="1">${escHtml(tr('Copy cmd'))}</button>`
            + `</div></div>`;
        }
        return h;
      };
      const drawTable = () => {
        if (!data) { table.innerHTML = `<div class="empty-hint empty-hint-inline">${escHtml(tr('Loading…'))}</div>`; return; }
        if (data.error) { table.innerHTML = `<div class="empty-hint empty-hint-inline">${escHtml(data.error)}</div>`; return; }
        let list = data.procs || [];
        const q = query.trim().toLowerCase();
        if (q) list = list.filter((p) => String(p.pid) === q || (p.cmd || '').toLowerCase().includes(q) || (p.user || '').toLowerCase().includes(q));
        const total = data.total || list.length;
        head.querySelector('.prc-count').textContent = q ? `${list.length}` : (total > list.length ? tr('{shown} of {total}', { shown: list.length, total }) : `${total}`);
        const parts = [];
        const CAP = showAll || q ? Infinity : 120;
        if (this._prcSort === 'tree') {
          // partial-forest tree: missing parents (capped table) become roots
          const byPid = new Map(list.map((p) => [p.pid, p]));
          const kids = new Map();
          const roots = [];
          for (const p of list) {
            if (p.ppid && byPid.has(p.ppid) && p.ppid !== p.pid) {
              if (!kids.has(p.ppid)) kids.set(p.ppid, []);
              kids.get(p.ppid).push(p);
            } else roots.push(p);
          }
          const byCpu = (a, b) => cpuOf(b) - cpuOf(a) || b.rss - a.rss;
          roots.sort(byCpu);
          let n = 0;
          const walk = (p, depth) => {
            if (n >= CAP) return;
            n++;
            parts.push(rowHtml(p, depth, data.serverPid));
            for (const k of (kids.get(p.pid) || []).sort(byCpu)) walk(k, depth + 1);
          };
          for (const r of roots) walk(r, 0);
        } else {
          const sorters = {
            cpu: (a, b) => cpuOf(b) - cpuOf(a) || b.rss - a.rss,
            mem: (a, b) => b.rss - a.rss,
            pid: (a, b) => a.pid - b.pid,
            name: (a, b) => nameOf(a).localeCompare(nameOf(b)) || a.pid - b.pid,
          };
          list = [...list].sort(sorters[this._prcSort] || sorters.cpu);
          for (const p of list.slice(0, CAP === Infinity ? list.length : CAP)) parts.push(rowHtml(p, 0, data.serverPid));
        }
        // a truncated table cannot prove absence — say so instead of a
        // definitive "no match" (review-confirmed false negative)
        const truncated = (data.total || 0) > (data.procs || []).length;
        if (!parts.length) parts.push(`<div class="empty-hint empty-hint-inline">${escHtml(q ? (truncated ? tr('No match among the {n} transported rows (of {total} on the machine)', { n: (data.procs || []).length, total: data.total }) : tr('No process matches the filter')) : tr('No processes'))}</div>`);
        else if (q && truncated) parts.push(`<div class="empty-hint empty-hint-inline">${escHtml(tr('Searched the {n} transported rows (of {total} on the machine)', { n: (data.procs || []).length, total: data.total }))}</div>`);
        else if (CAP !== Infinity && (data.procs || []).length > CAP && !q) parts.push(`<button class="ports-sys-expander prc-more">${escHtml(tr('+ show all {n}', { n: list.length }))}</button>`);
        if (data.sampled === false && (data.procs || []).length) parts.push(`<div class="empty-hint empty-hint-inline">${escHtml(tr('CPU% is a lifetime average on this machine (no live sampling)'))}</div>`);
        table.innerHTML = parts.join('');
        table.querySelector('.prc-more')?.addEventListener('click', () => { showAll = true; drawTable(); });
        table.querySelectorAll('.prc-row').forEach((row) => row.addEventListener('click', () => {
          const k = expKey(row.dataset.pid);
          if (this._prcExpanded.has(k)) this._prcExpanded.delete(k); else this._prcExpanded.add(k);
          drawTable();
        }));
        table.querySelectorAll('.prc-detail').forEach((det) => {
          const p = (data.procs || []).find((x) => String(x.pid) === det.dataset.pid);
          if (!p) return;
          det.querySelectorAll('.prc-act').forEach((btn) => btn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            if (btn.dataset.copy) { copyText(p.cmd); showToast(tr('Copied')); return; }
            const sig = btn.dataset.sig;
            if (sig === 'TERM' || sig === 'KILL') {
              const okGo = await showConfirmDialog({
                title: sig === 'KILL' ? tr('Force kill process?') : tr('Terminate process?'),
                message: tr('"{name}" (pid {pid}) will receive SIG{sig}.', { name: nameOf(p), pid: p.pid, sig }),
                confirmText: sig === 'KILL' ? tr('Force kill') : tr('Terminate'),
                danger: true,
              });
              if (!okGo) return;
            }
            const r = await fetchJson('/api/sysinfo/signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: getHostId(), pid: p.pid, sig }) });
            // fetchJson returns null on network/parse failure — an unguarded
            // r.gone here crashed the handler silently AND let STOP/CONT show
            // a false success toast (review-confirmed no-silent-failures hit)
            if (!r || r.error) { showToast((r && r.error) || tr('Machine unreachable'), { type: 'error' }); return; }
            if (sig === 'STOP') showToast(tr('Process paused (SIGSTOP)'));
            else if (sig === 'CONT') showToast(tr('Process resumed'));
            else if (r.gone) showToast(tr('Process terminated'));
            else showToast(tr('Signal sent — the process is still running (try Force kill)'), { type: 'error' });
            refresh(false);
          }));
        });
      };
      let seq = 0;
      const refresh = async (loading) => {
        const my = ++seq;
        const hostId = getHostId();
        if (loading) { data = null; drawTable(); }
        const r = await fetchJson('/api/sysinfo/procs' + (hostId ? `?host=${encodeURIComponent(hostId)}` : ''));
        if (my !== seq || !root.isConnected) return; // stale response after a switch
        data = r || { error: tr('Machine unreachable') };
        // don't yank a text selection out from under a copy-in-progress in
        // the detail zone — data is fresh, the next tick redraws
        const sel = document.getSelection();
        if (!loading && sel && !sel.isCollapsed && table.contains(sel.anchorNode)) return;
        drawTable();
      };
      this._prcRefresh = refresh;
      let qT = null;
      search.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { query = search.value; drawTable(); }, 150); });
      ctl.append(search, sorts);
      root.append(head, ctl, table);
      drawSorts();
      refresh(true);
    },

    // ── Ports panel (the vscode PORTS analogue) ──
    /** "This VibeSpace" — map the whole instance through the frp relay
     *  (2.367.0, owner request). Publishing makes that URL the address every
     *  "this instance's URL" consumer uses (reverse mounts, remote agent
     *  installs, published-page links); unpublishing falls straight back to
     *  whatever Settings → agentd.publicUrl said, because publishing never
     *  writes that setting — it only layers over it. */
    async _renderInstanceUrlRow(c, api, rerender) {
      let st = null;
      try { st = await api('/api/instance-url'); } catch { }
      if (!st || st.error) return;
      const sec = document.createElement('div');
      sec.innerHTML = `<div class="usage-section-title">${escHtml(tr('This VibeSpace'))}</div>`;
      const row = document.createElement('div');
      row.className = 'ports-row';
      const label = document.createElement('span');
      label.className = 'ports-row-label';
      label.textContent = st.published ? st.url : tr('Not mapped to a public URL');
      label.title = st.published ? st.url : '';
      const acts = document.createElement('span');
      acts.className = 'ports-row-acts';
      const btn = (icon, tip, fn) => { const b = document.createElement('button'); b.className = 'mounts-icon-btn'; b.innerHTML = icon; b.dataset.tip = tip; b.onclick = fn; return b; };
      const FRP_MSG = tr('Public URLs need the frp relay — not configured on this instance');
      if (st.published) {
        acts.append(btn(PORT_ICONS.open, tr('Open'), () => this.app.openBrowser?.(st.url)));
        acts.append(btn(PORT_ICONS.copy, tr('Copy'), () => { copyText(st.url); showToast(tr('Copied')); }));
      }
      const toggle = btn(st.published ? PORT_ICONS.globeOff : PORT_ICONS.globe,
        st.published ? tr('Unmap — this instance goes back to its configured address')
          : !st.frpConfigured ? FRP_MSG
            : !st.authEnabled ? tr('Turn on a password or SSO first — mapping would expose this instance with no login')
              : tr('Map this whole VibeSpace to a public URL'),
        async () => {
          if (st.published) {
            const r = await api('/api/instance-url/publish', { method: 'DELETE' });
            if (r?.error) { showToast(r.error, { type: 'error' }); return; }
            showToast(tr('Unmapped — back to the configured address'));
            rerender();
            return;
          }
          if (!st.frpConfigured) { showToast(FRP_MSG, { type: 'error' }); return; }
          if (!st.authEnabled) { showToast(tr('Turn on a password or SSO first — mapping would expose this instance with no login'), { type: 'error' }); return; }
          const sub = await showInputDialog({
            title: tr('Map this VibeSpace to a public URL'),
            label: st.subDomainHost ? tr('Subdomain (blank = keep/assign one) — <name>.{host}', { host: st.subDomainHost }) : tr('Subdomain (blank = keep/assign one)'),
            value: st.sub || '', placeholder: 'vibespace', confirmText: tr('Map'),
          });
          if (sub === null) return;
          const r = await api('/api/instance-url/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: String(sub || '').trim() || undefined }) });
          if (r?.error) { showToast(r.error, { type: 'error' }); return; }
          showToast(tr('Mapped: {url}', { url: r.url }));
          rerender();
        });
      if (!st.published && (!st.frpConfigured || !st.authEnabled)) toggle.classList.add('ports-btn-off');
      acts.append(toggle);
      row.append(label, acts);
      sec.appendChild(row);
      // say WHICH address is in effect and what falls back — the whole point
      // of the feature is that the setting survives underneath
      const note = document.createElement('div');
      note.className = 'ports-instance-note';
      if (st.published && st.desired) {
        note.textContent = st.settingUrl
          ? tr('Used as this instance\'s address everywhere; the configured {url} is kept and restored when you unmap', { url: st.settingUrl })
          : tr('Used as this instance\'s address everywhere (reverse mounts, agent installs, page links)');
      } else if (st.published && st.auto) {
        note.textContent = tr('Published automatically for a remote agent install — not used as this instance\'s address');
      } else if (st.settingUrl) {
        note.textContent = tr('Currently using the configured address: {url}', { url: st.settingUrl });
      } else {
        note.textContent = tr('No public address configured — links fall back to the address each browser is using');
      }
      sec.appendChild(note);
      if (st.error) {
        const err = document.createElement('div');
        err.className = 'ports-instance-note ports-instance-err';
        err.textContent = tr('Last attempt failed: {err}', { err: st.error });
        sec.appendChild(err);
      }
      c.appendChild(sec);
    },

    async _renderPortsPanel(c) {
      c.innerHTML = `<div class="empty-hint">${escHtml(tr('Loading…'))}</div>`;
      const api = (u, opts) => fetchJson(u, opts);
      this._portScanCache = this._portScanCache || new Map(); // hostId → last scan results (survives re-renders + panel reopen)
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
        await this._renderInstanceUrlRow(c, api, render);
        // active forwards
        const sec = document.createElement('div');
        sec.innerHTML = `<div class="usage-section-title">${escHtml(tr('Active forwards'))}</div>`;
        if (!fwds.length) sec.innerHTML += `<div class="empty-hint empty-hint-inline">${escHtml(tr('No forwards yet — scan a machine below'))}</div>`;
        for (const f of fwds) {
          const row = document.createElement('div');
          row.className = 'ports-row';
          const label = `${escHtml(nameOf(f.hostId))}${f.targetHost ? '→' + escHtml(f.targetHost) : ''}:${f.remotePort}`;
          // service tag rides the forward's own label (owner report: it only
          // showed on scan rows) — forwards created by a Background Work
          // service carry label "service: <name>"
          const svcM = /^service:\s*(.+)$/.exec(f.label || '');
          row.innerHTML = `<span class="ports-row-label" title="${label}">${label}${svcM ? ` <span class="ports-svc">${escHtml(svcM[1])}</span>` : ''} ${protoChip(f.proto, { over: !!f.protoOverride })}${f.publicUrl ? ` <span class="ports-pub" title="${escHtml(f.publicUrl)}">${PORT_ICONS.globe}</span>` : ''}</span>`;
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
              let body = '{}';
              if (!f.publicUrl && f.proto !== 'tcp' && f.proto !== 'https') {
                // fixed-subdomain choice (2.358.0, owner request): blank keeps
                // the prior/random one; only HTTP backends ride subdomains
                const { showInputDialog } = await import('./utils.js');
                const sub = await showInputDialog({ title: tr('Publish to the internet'), label: tr('Subdomain (optional — blank = keep previous or random)'), value: f.publicSub || '', placeholder: 'myapp' });
                if (sub === null) return; // cancelled
                body = JSON.stringify({ sub: sub.trim() });
              }
              // fetchJson never throws — a 4xx comes back as {error}; surface it
              const r = await api(`/api/port-forward/${encodeURIComponent(f.id)}/publish`, { method: f.publicUrl ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: f.publicUrl ? undefined : body });
              if (r?.error) showToast(r.error, { type: 'error' });
              else if (r?.publicUrl) showToast(tr('Published: {url}', { url: r.publicUrl }));
              render();
            });
          if (!frpOk && !f.publicUrl) pubBtn.classList.add('ports-btn-off');
          acts.append(pubBtn);
          // main-domain path mount (2.358.0): /svc/<name>/ behind VibeSpace
          // auth — no relay, no random subdomain, works for remote machines
          acts.append(btn(f.pathMount ? PORT_ICONS.pathOff : PORT_ICONS.path,
            f.pathMount ? tr('Unmount from /svc/{name}/', { name: f.pathMount }) : tr('Mount under this domain at /svc/<name>/ (login-protected)'),
            async () => {
              if (f.pathMount) {
                const r = await api(`/api/port-forward/${encodeURIComponent(f.id)}/path`, { method: 'DELETE' });
                if (r?.error) showToast(r.error, { type: 'error' });
              } else {
                const { showInputDialog } = await import('./utils.js');
                const name = await showInputDialog({ title: tr('Mount under this domain'), label: tr('Path name → /svc/<name>/ (apps must tolerate a URL prefix — vite base, jupyter base_url, code-server do)'), value: (svcM?.[1] || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, ''), placeholder: 'myapp' });
                if (name === null || !name.trim()) return;
                const r = await api(`/api/port-forward/${encodeURIComponent(f.id)}/path`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
                if (r?.error) showToast(r.error, { type: 'error' });
                else showToast(tr('Mounted at {url}', { url: r.url || `/svc/${name.trim()}/` }));
              }
              render();
            }));
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
          // path mount address row — a NORMAL same-origin link (the login
          // cookie rides along; no proxy hop needed). Lock toggle = per-mount
          // public/private (2.359.0): public shares WITHOUT login; making
          // something public is an explicit confirmed act, never a default.
          if (f.pathMount) {
            const ur = document.createElement('div');
            ur.className = 'ports-url-row';
            const a = document.createElement('a');
            const rel = `/svc/${f.pathMount}/`;
            a.href = absUrl(rel); a.target = '_blank'; a.rel = 'noopener'; a.textContent = rel; a.title = absUrl(rel); // shareable address, not this box's hostname
            if (f.pathPublic) { const pubChip = document.createElement('span'); pubChip.className = 'ports-svc ports-svc-pub'; pubChip.textContent = tr('public'); ur.appendChild(pubChip); }
            const lock = document.createElement('button');
            lock.className = 'mounts-icon-btn';
            lock.innerHTML = f.pathPublic ? PORT_ICONS.unlock : PORT_ICONS.lock;
            lock.dataset.tip = f.pathPublic ? tr('PUBLIC — anyone with the link, no login. Click to require login') : tr('Login required. Click to make PUBLIC (share with anyone)');
            lock.onclick = async () => {
              if (!f.pathPublic) {
                const { showConfirmDialog } = await import('./utils.js');
                const okGo = await showConfirmDialog({ title: tr('Make this service public?'), message: tr('Anyone with the link {url} will reach it WITHOUT logging in.', { url: absUrl(rel) }), confirmText: tr('Make public'), danger: true });
                if (!okGo) return;
              }
              const r = await api(`/api/port-forward/${encodeURIComponent(f.id)}/path`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.pathMount, public: !f.pathPublic }) });
              if (r?.error) showToast(r.error, { type: 'error' });
              render();
            };
            const cp = document.createElement('button');
            cp.className = 'mounts-icon-btn'; cp.dataset.tip = tr('Copy URL');
            cp.innerHTML = PORT_ICONS.copy;
            cp.onclick = () => { copyText(absUrl(rel)); showToast(tr('Copied')); };
            ur.append(a, lock, cp);
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
          // scan results are CACHED per machine (owner report: every
          // broadcast-driven re-render — e.g. the watch announcing a new
          // port — wiped the freshly scanned list back to blank). A rebuild
          // replays the cache with fresh forward state; Scan re-probes.
          const renderList = (all) => {
              list.innerHTML = '';
              // vscode-style: known non-web system listeners (sshd, dns, cups…)
              // fold behind an expander instead of burying the dev servers
              const vis = all.filter((p) => !p.hidden).slice(0, 40);
              const hid = all.filter((p) => p.hidden);
              const portRow = (p) => {
                const pr = document.createElement('div');
                pr.className = 'ports-row' + (p.hidden ? ' ports-row-sys' : '');
                // already-forwarded state (owner report: 8390 sat in Active
                // forwards above while its scan row looked untouched) — show
                // the state and drop the redundant forward arrow
                // field is remotePort (verified against the LIVE data/port-forwards.json
                // — the first f.port guess was the fixture-shape class again)
                const fwd = fwds.find((f) => f.hostId === m.id && Number(f.remotePort) === Number(p.port));
                pr.innerHTML = `<span class="ports-row-label">${p.port}${p.service ? ' <span class="ports-svc">' + escHtml(p.service) + '</span>' : ''}${p.proc ? ' <span class="ports-proc">' + escHtml(p.proc) + '</span>' : ''} ${protoChip(p.proto)}${fwd ? ` <span class="ports-svc" title="${escHtml(fwd.publicUrl || tr('Managed under Active forwards above'))}">${escHtml(fwd.publicUrl ? tr('published') : tr('forwarded'))}</span>` : ''}${p.orphan ? ` <span class="ports-orphan" title="${escHtml(tr('This process is listening from a DELETED working directory — a removed worktree left its dev server running'))}">${escHtml(tr('orphan'))}</span>` : ''}</span>`;
                if (fwd) return pr; // its controls live on the Active forwards row
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
          };
          scan.onclick = async () => {
            scan.disabled = true; scan.textContent = tr('Scanning…');
            try {
              const r = await api(`/api/hosts/${encodeURIComponent(m.id)}/ports`);
              if (r?.error) throw new Error(r.error);
              this._portScanCache.set(m.id, r?.ports || []);
              renderList(r?.ports || []);
            } catch (e) { list.innerHTML = `<div class="empty-hint empty-hint-inline">${escHtml(e.message || 'scan failed')}</div>`; }
            scan.disabled = false; scan.textContent = tr('Scan ports');
          };
          if (this._portScanCache.has(m.id)) renderList(this._portScanCache.get(m.id));
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
        if (msg.type === 'machine-ports-new' && Array.isArray(msg.ports) && this._portScanCache.has(msg.hostId)) {
          // merge the announced ports into the cached scan so the replayed
          // list actually SHOWS what the toast talked about
          const cached = this._portScanCache.get(msg.hostId);
          for (const p of msg.ports) if (!cached.some((q) => q.port === p.port)) cached.push(p);
        }
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
