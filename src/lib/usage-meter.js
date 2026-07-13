// Taskbar quota pies + usage popup + on-demand quota refresh (mixin split from app.js, 2.82.0 audit seam).
import { createBackendIconHtml } from './agent-meta.js';
import { t, tc } from './i18n.js';
import { anchorFixedPopup, escHtml, fetchJson, showConfirmDialog, showToast } from './utils.js';

export function installUsageMeter(App, ctx = {}) {
  Object.assign(App.prototype, {
  _setupUsage() {
    this._usageData = new Map(); // sessionId → usage
    this._codexRateLimit = null;
    // Which account the pies/popup show: 'auto' (follow the default account),
    // '__global__' (the machine's own CLI login) or a named claude-subscription
    // id. A VIEW preference, so per-device (localStorage), not a synced setting.
    try { this._usageAcctSel = localStorage.getItem('vibespace.usageAccount') || 'auto'; } catch { this._usageAcctSel = 'auto'; }
    try { this._usageAcctSelCodex = localStorage.getItem('vibespace.usageAccountCodex') || 'auto'; } catch { this._usageAcctSelCodex = 'auto'; }
    const usageEl = document.getElementById('taskbar-usage');
    const popup = document.getElementById('usage-popup');

    const togglePopup = (anchorEl) => {
      popup.classList.toggle('hidden');
      // Anchor to the button's CURRENT position — customize mode can move it
      // to any bar, so the old fixed bottom-right CSS pointed nowhere.
      if (!popup.classList.contains('hidden')) {
        anchorFixedPopup(popup, anchorEl);
        this._maybeAutoRefreshQuota();
      }
    };
    usageEl.onclick = () => togglePopup(usageEl);
    // Phone entry point: the taskbar is hidden ≤768px, so the mobile nav's
    // quota chip is the only way to reach the popup (incl. account switching).
    const mChip = document.getElementById('mobile-nav-usage');
    if (mChip) mChip.onclick = () => togglePopup(mChip);
    document.addEventListener('mousedown', (e) => {
      if (!popup.contains(e.target) && !usageEl.contains(e.target) && !(mChip && mChip.contains(e.target))) popup.classList.add('hidden');
    });
    // Account switcher chips (popup re-renders every poll → delegate)
    popup.addEventListener('click', (e) => {
      const hbtn = e.target.closest('.usage-host-refresh');
      if (hbtn) {
        e.stopPropagation();
        hbtn.classList.add('usage-refresh-spin');
        fetchJson('/api/usage/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: hbtn.dataset.host }) })
          .then(async (r) => {
            if (r?.error) showToast(r.error, { type: 'error' });
            const data = await fetchJson('/api/usage');
            if (data) { this._applyUsage(data); this._renderUsage(); }
          });
        return;
      }
      const rbtn = e.target.closest('.usage-refresh-btn');
      if (rbtn) { e.stopPropagation(); this._refreshQuotaOnDemand(rbtn); return; }
      const chip = e.target.closest('.usage-acct-chip');
      if (!chip) return;
      e.stopPropagation();
      if (chip.dataset.be === 'codex') {
        this._usageAcctSelCodex = chip.dataset.key || 'auto';
        try { localStorage.setItem('vibespace.usageAccountCodex', this._usageAcctSelCodex); } catch {}
      } else {
        this._usageAcctSel = chip.dataset.key || 'auto';
        try { localStorage.setItem('vibespace.usageAccount', this._usageAcctSel); } catch {}
        this._maybeAutoRefreshQuota();
      }
      this._renderUsage();
    });

    // Poll usage for active sessions
    this._pollUsage();
  },

  _applyUsage(data) {
    if (data?.rateLimit) this._rateLimit = data.rateLimit;
    else if (this._rateLimit === undefined) this._rateLimit = null;
    if (data?.codexRateLimit) this._codexRateLimit = data.codexRateLimit;
    else if (this._codexRateLimit === undefined) this._codexRateLimit = null;
    this._subSignedOut = !!data?.subscriptionSignedOut;
    this._accountUsage = data?.accounts || {}; // per-subscription usage (Manage Agents rows)
    this._usageGlobal = data?.globalLogin || null; // CLI-login identity (+ linked named account)
    this._usageCodexGlobal = data?.codexGlobalLogin || null;
    this._codexAccountUsage = data?.codexAccounts || {}; // per-account codex quota buckets
    this._hostUsage = data?.hosts || {}; // remote hosts' own-login quota (on-demand ⟳ only)
  },

  // Resolve the Claude account the pies/popup currently DISPLAY (same rules as
  // _renderUsage) + the refresh `target` key for /api/usage/refresh. Target
  // prefers '__global__' when the selection IS the machine's CLI login (its
  // token is the freshest — the CLI keeps it alive), and follows the default
  // account under 'auto' only when that default is a subscription.
  _claudeSelResolved() {
    const claudeSubs = (this._accounts?.accounts || []).filter(a => (a.backend || 'claude') !== 'codex' && a.type === 'subscription');
    const gl = this._usageGlobal || {};
    const claudeDefId = this._accounts?.defaultAccountId;
    let sel = this._usageAcctSel || 'auto';
    if (sel === '__global__' && gl.accountId) sel = gl.accountId;
    if (sel !== 'auto' && sel !== '__global__' && !claudeSubs.some(a => a.id === sel)) sel = 'auto';
    let rl;
    if (sel === 'auto') rl = (claudeDefId && this._accountUsage?.[claudeDefId]) ? this._accountUsage[claudeDefId] : this._rateLimit;
    else if (sel === '__global__') rl = this._rateLimit;
    else rl = this._accountUsage?.[sel] || null;
    let target = sel === 'auto'
      ? (claudeDefId && claudeSubs.some(a => a.id === claudeDefId) ? claudeDefId : '__global__')
      : sel;
    if (target !== '__global__' && gl.accountId === target) target = '__global__';
    return { sel, rl, target };
  },

  // User-initiated quota refresh (⟳ / popup open) — the only way to get the
  // model-scoped weekly buckets (Fable), which the passive statusline feed
  // never carries. Server enforces ≥60s per account + the 429 backoff.
  // Gated by accounts.onDemandQuotaRefresh (manual/auto/off) + a one-time
  // first-use warning so the user knows an off-CLI call happens.
  async _refreshQuotaOnDemand(btn, { silent } = {}) {
    if ((this.settings.get('accounts.onDemandQuotaRefresh') || 'manual') === 'off') return;
    if (!silent) {
      let acked = false;
      try { acked = localStorage.getItem('vibespace.quotaRefreshAck') === '1'; } catch {}
      if (!acked) {
        const ok = await showConfirmDialog({
          title: t('Fetch quota from Anthropic?'),
          message: t('This makes ONE non-billable request to Anthropic’s usage endpoint with this account’s own login token — the same call the CLI makes when you run /usage. It only ever fires when you ask (never on a timer) and is throttled to ≥60s per account. Configure or disable it in Settings → “On-demand quota refresh”. This notice is shown once.'),
          confirmText: t('Fetch'),
        });
        if (!ok) return;
        try { localStorage.setItem('vibespace.quotaRefreshAck', '1'); } catch {}
      }
    }
    const { target } = this._claudeSelResolved();
    if (btn) btn.classList.add('usage-refresh-spin');
    const r = await fetchJson('/api/usage/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: target }) });
    if (r?.error && !silent) showToast(r.error, { type: 'error' });
    const data = await fetchJson('/api/usage');
    if (data) { this._applyUsage(data); this._renderUsage(); }
  },

  // Popup open / chip switch: silently refresh the displayed account when its
  // scoped data is stale (>30 min) — paced per target so this stays at CLI
  // /usage-command frequency, never a background cadence.
  _maybeAutoRefreshQuota() {
    if ((this.settings.get('accounts.onDemandQuotaRefresh') || 'manual') !== 'auto') return;
    const { rl, target } = this._claudeSelResolved();
    this._quotaAutoPace = this._quotaAutoPace || {};
    if (Date.now() - (this._quotaAutoPace[target] || 0) < 60000) return;
    if (rl && Date.now() - (rl.scopedFetchedAt || 0) < 30 * 60 * 1000) return;
    this._quotaAutoPace[target] = Date.now();
    this._refreshQuotaOnDemand(null, { silent: true });
  },

  async _pollUsage() {
    const data = await fetchJson('/api/usage');
    this._applyUsage(data);
    this._renderUsage();
    // 8s: /api/usage is now a cheap LOCAL read (server just returns the passively
    // captured cache) — decoupled from any Anthropic call — so a snappy refresh
    // is free. Pause while the tab is hidden (no point polling a background tab).
    const next = document.hidden ? 30000 : 8000;
    setTimeout(() => this._pollUsage(), next);
  },

  _renderUsage() {
    const usageEl = document.getElementById('taskbar-usage');
    const popup = document.getElementById('usage-popup');
    // Which Claude account the pies show: by default ('auto') they follow the
    // DEFAULT account — that's what new sessions actually bill to — falling
    // back to the machine's own global login. The popup's switcher chips let
    // you view any named subscription (or the CLI login) instead. When the CLI
    // login IS one of the named accounts (email match — the server merges their
    // caches newest-wins), '__global__' resolves to that account so there is
    // one entry, not a duplicate pair.
    const claudeSubs = (this._accounts?.accounts || []).filter(a => (a.backend || 'claude') !== 'codex' && a.type === 'subscription');
    const gl = this._usageGlobal || {};
    const claudeDefId = this._accounts?.defaultAccountId;
    let sel = this._usageAcctSel || 'auto';
    if (sel === '__global__' && gl.accountId) sel = gl.accountId;
    if (sel !== 'auto' && sel !== '__global__' && !claudeSubs.some(a => a.id === sel)) sel = 'auto'; // account removed
    let rl, claudeUsageLabel, usageNote = '';
    if (sel === 'auto') {
      const defAcct = claudeDefId ? claudeSubs.find(a => a.id === claudeDefId) : null;
      rl = (claudeDefId && this._accountUsage?.[claudeDefId]) ? this._accountUsage[claudeDefId] : this._rateLimit;
      claudeUsageLabel = defAcct ? defAcct.name : 'Claude';
      if (defAcct) usageNote = t('Default account · refreshes when you run it in a terminal session');
    } else if (sel === '__global__') {
      rl = this._rateLimit;
      // Prefer the token-derived identity (actualEmail, captured by ⟳) over
      // ~/.claude.json's oauthAccount, which goes stale after a /login switch.
      claudeUsageLabel = t('CLI login') + ((gl.actualEmail || gl.email) ? ` · ${gl.actualEmail || gl.email}` : '');
    } else {
      const a = claudeSubs.find(x => x.id === sel);
      rl = this._accountUsage?.[sel] || null;
      claudeUsageLabel = a?.name || sel;
      usageNote = t('Refreshes passively when you run this account in a terminal session');
    }
    // Codex mirrors the Claude selection model: per-account quota buckets from
    // /api/usage codexAccounts (key = cxs id / '__global_codex__'), the machine
    // login linked to a named ChatGPT account by email, 'auto' = default account.
    const codexSubs = (this._accounts?.accounts || []).filter(a => a.backend === 'codex');
    const cgl = this._usageCodexGlobal || {};
    const cBuckets = this._codexAccountUsage || {};
    const codexDefId = this._accounts?.defaultCodexAccountId;
    let cSel = this._usageAcctSelCodex || 'auto';
    if (cSel === '__global_codex__' && cgl.accountId) cSel = cgl.accountId;
    if (cSel !== 'auto' && cSel !== '__global_codex__' && !codexSubs.some(a => a.id === cSel)) cSel = 'auto';
    let codex, codexLabel = 'Codex', codexNote = '';
    if (cSel === 'auto') {
      const defAcct = codexDefId ? codexSubs.find(a => a.id === codexDefId) : null;
      codex = (codexDefId && cBuckets[codexDefId]) ? cBuckets[codexDefId] : this._codexRateLimit;
      codexLabel = defAcct ? defAcct.name : 'Codex';
      if (defAcct) codexNote = t('Default account · refreshes as its sessions run');
    } else if (cSel === '__global_codex__') {
      codex = cBuckets['__global_codex__'] || null;
      codexLabel = t('Codex CLI login') + (cgl.email ? ` · ${cgl.email}` : '');
    } else {
      codex = cBuckets[cSel] || null;
      codexLabel = codexSubs.find(a => a.id === cSel)?.name || cSel;
      codexNote = t('Refreshes as this account’s sessions run');
    }
    const hasSwitch = claudeSubs.length > 0;
    const codexHasSwitch = codexSubs.length > 0;

    // A login WITHOUT captured data still renders gray "no data yet" donuts —
    // chat-mode sessions never produce the passive statusline feed, so fresh
    // instances looked like the meters had vanished despite showUsage being
    // on (real report from the k8s instances). Only a machine with no logins
    // and no accounts at all hides the meters.
    const glKnown = !!(gl.loggedIn || gl.email);
    const cglKnown = !!(cgl.loggedIn || cgl.email);
    if (!rl && !codex && !hasSwitch && !codexHasSwitch && !glKnown && !cglKnown) {
      usageEl.innerHTML = '';
      popup.innerHTML = `<div class="empty-hint">${t('No usage data')}</div>`;
      return;
    }

    const usageColor = (pct) => (pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--yellow)' : 'var(--green)');
    // Donut with the window label in the hole — 5h vs 7d distinguishable at a
    // glance instead of two identical pies
    const renderPie = (label, pct, noData) => {
      const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
      const color = usageColor(clamped);
      const deg = noData ? 0 : Math.round(clamped * 3.6);
      const tip = noData ? `${label}: ${t('no data yet')}` : `${label}: ${clamped}%`;
      return `<div class="usage-pie usage-donut" title="${tip}" style="background:conic-gradient(${color} ${deg}deg, var(--bg-input) ${deg}deg)"><span class="usage-donut-label">${label}</span></div>`;
    };
    const renderRow = (backend, primaryLabel, primaryPct, secondaryLabel, secondaryPct, noData) => (
      `<div class="taskbar-usage-row">
        ${createBackendIconHtml(backend, { className: 'taskbar-usage-backend', title: backend === 'codex' ? 'Codex' : 'Claude' })}
        <div class="taskbar-usage-pair">
          ${renderPie(primaryLabel, primaryPct, noData)}
          ${renderPie(secondaryLabel, secondaryPct, noData)}
        </div>
      </div>`
    );
    const renderSectionTitle = (backend, label, extra = '') => (
      `<div class="usage-section-title">${createBackendIconHtml(backend, { className: 'usage-section-backend', title: label })}<span>${label}</span>${extra}</div>`
    );

    const rows = [];
    const sections = [];
    let chipWorst = -1; // worst utilization across all shown buckets — feeds the mobile nav chip
    const agoText = (ts) => {
      if (!ts) return '—';
      const m = Math.round((Date.now() - ts) / 60000);
      return m < 1 ? t('just now') : t('{m}min ago', { m });
    };
    const fmtReset = (ts) => {
      if (!ts) return '?';
      const d = new Date(ts * 1000), now = new Date();
      const time = d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
      if (d.toDateString() === now.toDateString()) return t('Today {time}', { time });
      const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
      if (d.toDateString() === tmr.toDateString()) return t('Tomorrow {time}', { time });
      return d.toLocaleDateString([], {month:'short',day:'numeric'}) + ' ' + time;
    };

    if (rl || hasSwitch || glKnown) {
      const noData = !rl;
      const pct5h = Math.round((rl?.fiveHour?.utilization || 0) * 100);
      const color = usageColor(pct5h);
      const pct7d = Math.round((rl?.sevenDay?.utilization || 0) * 100);
      const color7d = usageColor(pct7d);
      rows.push(renderRow('claude', '5h', pct5h, '7d', pct7d, noData));
      if (!noData) chipWorst = Math.max(chipWorst, pct5h, pct7d);
      // Account switcher — one chip per viewable identity. When the CLI login
      // is a named account (gl.accountId), NO separate CLI-login chip renders:
      // that account's chip covers both (tooltip says so). ★ marks the default.
      const activeKey = (this._usageAcctSel || 'auto') === 'auto' ? 'auto' : sel;
      const entries = [{ key: 'auto', label: t('Auto'), tip: t('Follow the default account (what new sessions bill to)') }];
      if (!gl.accountId) entries.push({ key: '__global__', label: t('CLI login'), tip: gl.email || t("The machine's own CLI login") });
      for (const a of claudeSubs) entries.push({
        key: a.id, label: (claudeDefId === a.id ? '★ ' : '') + a.name,
        tip: (a.email || '') + (gl.accountId === a.id ? (a.email ? ' · ' : '') + t('also the CLI login on this machine') : ''),
      });
      const switcher = hasSwitch ? `<div class="usage-acct-switch">${entries.map(en =>
        `<button class="usage-acct-chip${en.key === activeKey ? ' active' : ''}" data-key="${escHtml(en.key)}" title="${escHtml(en.tip || '')}">${escHtml(en.label)}</button>`).join('')}</div>` : '';
      const scopedSections = [];
      for (const sc of rl?.scopedWeekly || []) {
        const pctSc = Math.round((sc.utilization || 0) * 100);
        const colorSc = usageColor(pctSc);
        // Scoped buckets only arrive via on-demand refresh (⟳) — show THEIR
        // age, which can lag the passively-updated 5h/7d above.
        const scAge = rl.scopedFetchedAt ? `<span class="usage-stat" title="${escHtml(t('Model-scoped data comes from the ⟳ refresh, not the passive feed'))}">${escHtml(t('as of {ago}', { ago: agoText(rl.scopedFetchedAt) }))}</span>` : '';
        scopedSections.push(`
      <div class="usage-session">
        <div class="usage-session-name">${t('{name} weekly limit', { name: escHtml(sc.name) })}</div>
        <div class="usage-bar" style="width:100%;margin:4px 0"><div class="usage-bar-fill" style="width:${pctSc}%;background:${colorSc}"></div></div>
        <div class="usage-session-stats">
          <span class="usage-stat">${t('{pct}% used', { pct: pctSc })}</span>
          <span class="usage-stat"><span class="usage-stat-label">${t('Resets')}</span> ${fmtReset(sc.resetsAt)}</span>
          ${scAge}
        </div>
      </div>`);
      }
      if (!scopedSections.length && !noData) {
        const odOff = (this.settings.get('accounts.onDemandQuotaRefresh') || 'manual') === 'off';
        scopedSections.push(`<div class="usage-note">${odOff
          ? t('Model-scoped weekly limits (e.g. Fable) aren’t in the passive feed — on-demand refresh is disabled in Settings')
          : t('Model-scoped weekly limits (e.g. Fable) aren’t in the passive feed — ⟳ fetches them on demand')}</div>`);
      }
      // The signed-out warning concerns the GLOBAL login's data — only shown
      // when that's what's displayed (directly or via the linked account).
      const showingGlobal = sel === '__global__' || (gl.accountId && sel === gl.accountId) || (sel === 'auto' && rl === this._rateLimit);
      const body = noData
        ? `<div class="usage-note">${t('No usage captured yet — quota data arrives passively from terminal sessions (chat sessions don’t report it), or use ⟳ to fetch it on demand.')}</div>`
        : `<div class="usage-session">
        <div class="usage-session-name">${t('5-hour limit')}</div>
        <div class="usage-bar" style="width:100%;margin:4px 0"><div class="usage-bar-fill" style="width:${pct5h}%;background:${color}"></div></div>
        <div class="usage-session-stats">
          <span class="usage-stat">${t('{pct}% used', { pct: pct5h })}</span>
          <span class="usage-stat"><span class="usage-stat-label">${t('Resets')}</span> ${fmtReset(rl.fiveHour?.resetsAt)}</span>
        </div>
      </div>
      <div class="usage-session">
        <div class="usage-session-name">${t('7-day limit')}</div>
        <div class="usage-bar" style="width:100%;margin:4px 0"><div class="usage-bar-fill" style="width:${pct7d}%;background:${color7d}"></div></div>
        <div class="usage-session-stats">
          <span class="usage-stat">${t('{pct}% used', { pct: pct7d })}</span>
          <span class="usage-stat"><span class="usage-stat-label">${t('Resets')}</span> ${fmtReset(rl.sevenDay?.resetsAt)}</span>
        </div>
      </div>${scopedSections.join('')}
      ${this._subSignedOut && showingGlobal ? `<div class="usage-warn">${t('⚠ Subscription signed out (a Console login replaced it) — pies show its last-known quota. API-billed sessions never appear here.')}</div>` : ''}
      ${gl.identityMismatch && showingGlobal ? `<div class="usage-warn">${t('⚠ The CLI config file says {cfg}, but the login token actually belongs to {actual} — quotas shown are {actual}’s. Run /login in a terminal to refresh the recorded identity.', { cfg: gl.email || '?', actual: gl.actualEmail || '?' })}</div>` : ''}
      <div class="usage-updated">${t('Updated {ago}', { ago: agoText(rl.fetchedAt) })}</div>`;
      const odMode = this.settings.get('accounts.onDemandQuotaRefresh') || 'manual';
      const refreshBtn = odMode === 'off' ? '' : `<button class="usage-refresh-btn" title="${escHtml(t('Refresh from Anthropic now (also fetches model-scoped limits like Fable) — user-initiated, min 60s apart'))}">⟳</button>`;
      sections.push(`${renderSectionTitle('claude', escHtml(claudeUsageLabel), refreshBtn)}${switcher}
      ${usageNote ? `<div class="usage-note">${usageNote}</div>` : ''}
      ${body}`);
    }

    if (codex?.fiveHour || codex?.sevenDay || codexHasSwitch || cglKnown) {
      const cNoData = !(codex?.fiveHour || codex?.sevenDay);
      const pct5h = Math.round(codex?.fiveHour?.usedPercent || ((codex?.fiveHour?.utilization || 0) * 100));
      const pct7d = Math.round(codex?.sevenDay?.usedPercent || ((codex?.sevenDay?.utilization || 0) * 100));
      const color5h = usageColor(pct5h);
      const color7d = usageColor(pct7d);
      rows.push(renderRow('codex', '5h', pct5h, '7d', pct7d, cNoData));
      if (!cNoData) chipWorst = Math.max(chipWorst, pct5h, pct7d);
      // Account switcher — same model as Claude's: merged chip when the machine
      // login IS a named account, ★ marks the default; data-be routes the click.
      let cSwitcher = '';
      if (codexHasSwitch) {
        const cActive = (this._usageAcctSelCodex || 'auto') === 'auto' ? 'auto' : cSel;
        const cEntries = [{ key: 'auto', label: t('Auto'), tip: t('Follow the default account (what new sessions bill to)') }];
        if (!cgl.accountId) cEntries.push({ key: '__global_codex__', label: t('CLI login'), tip: cgl.email || t("The machine's own CLI login") });
        for (const a of codexSubs) cEntries.push({
          key: a.id, label: (codexDefId === a.id ? '★ ' : '') + a.name,
          tip: (a.email || '') + (cgl.accountId === a.id ? (a.email ? ' · ' : '') + t('also the CLI login on this machine') : ''),
        });
        cSwitcher = `<div class="usage-acct-switch">${cEntries.map(en =>
          `<button class="usage-acct-chip${en.key === cActive ? ' active' : ''}" data-key="${escHtml(en.key)}" data-be="codex" title="${escHtml(en.tip || '')}">${escHtml(en.label)}</button>`).join('')}</div>`;
      }
      const cBody = cNoData
        ? `<div class="usage-note">${t('No usage captured yet for this account — run a session on it.')}</div>`
        : `<div class="usage-session">
        <div class="usage-session-name">${t('5-hour limit')}</div>
        <div class="usage-bar" style="width:100%;margin:4px 0"><div class="usage-bar-fill" style="width:${pct5h}%;background:${color5h}"></div></div>
        <div class="usage-session-stats">
          <span class="usage-stat">${t('{pct}% used', { pct: pct5h })}</span>
          <span class="usage-stat"><span class="usage-stat-label">${t('Resets')}</span> ${fmtReset(codex.fiveHour?.resetsAt)}</span>
        </div>
      </div>
      <div class="usage-session">
        <div class="usage-session-name">${t('7-day limit')}</div>
        <div class="usage-bar" style="width:100%;margin:4px 0"><div class="usage-bar-fill" style="width:${pct7d}%;background:${color7d}"></div></div>
        <div class="usage-session-stats">
          <span class="usage-stat">${t('{pct}% used', { pct: pct7d })}</span>
          <span class="usage-stat"><span class="usage-stat-label">${t('Resets')}</span> ${fmtReset(codex.sevenDay?.resetsAt)}</span>
          ${codex.planType ? `<span class="usage-stat"><span class="usage-stat-label">${tc('billing', 'Plan')}</span> ${escHtml(codex.planType)}</span>` : ''}
        </div>
      </div>
      <div class="usage-updated">${t('Updated {ago}', { ago: agoText(codex.fetchedAt) })}</div>`;
      sections.push(`${renderSectionTitle('codex', escHtml(codexLabel))}${cSwitcher}
      ${codexNote ? `<div class="usage-note">${codexNote}</div>` : ''}
      ${cBody}`);
    }

    // ── Remote hosts (2.127.0): each configured host's OWN login quota.
    // Data arrives ONLY via the per-host ⟳ (read-only remote token, single
    // human-gated call — §ban-safety: no scheduler anywhere near this).
    {
      const hostEntries = Object.entries(this._hostUsage || {});
      if (hostEntries.length) {
        const odOffH = (this.settings.get('accounts.onDemandQuotaRefresh') || 'manual') === 'off';
        const parts = [];
        for (const [hid, hu] of hostEntries) {
          const has = hu?.fiveHour || hu?.sevenDay;
          const p5 = Math.round((hu?.fiveHour?.utilization || 0) * 100);
          const p7 = Math.round((hu?.sevenDay?.utilization || 0) * 100);
          const rbtn = odOffH ? '' : `<button class="usage-refresh-btn usage-host-refresh" data-host="${escHtml(hid)}" title="${escHtml(t('Fetch this host’s quota (reads its own login token over ssh — one on-demand request)'))}">⟳</button>`;
          parts.push(`<div class="usage-session">
        <div class="usage-session-name">${escHtml(hu?.name || hid)} ${rbtn}${hu?.actualEmail || hu?.orgEmail ? `<span class="usage-stat-label"> ${escHtml(hu.actualEmail || hu.orgEmail)}</span>` : ''}</div>
        ${has ? `
        <div class="usage-bar" style="width:100%;margin:4px 0"><div class="usage-bar-fill" style="width:${p5}%;background:${usageColor(p5)}"></div></div>
        <div class="usage-session-stats"><span class="usage-stat">${t('5-hour limit')}: ${t('{pct}% used', { pct: p5 })}</span><span class="usage-stat">${t('Resets')} ${fmtReset(hu.fiveHour?.resetsAt)}</span></div>
        <div class="usage-bar" style="width:100%;margin:4px 0"><div class="usage-bar-fill" style="width:${p7}%;background:${usageColor(p7)}"></div></div>
        <div class="usage-session-stats"><span class="usage-stat">${t('7-day limit')}: ${t('{pct}% used', { pct: p7 })}</span><span class="usage-stat">${t('Resets')} ${fmtReset(hu.sevenDay?.resetsAt)}</span><span class="usage-stat">${t('Updated {ago}', { ago: agoText(hu.fetchedAt) })}</span></div>`
        : `<div class="usage-note">${t('No data yet — ⟳ reads the host’s own login quota on demand')}</div>`}
      </div>`);
        }
        sections.push(`${renderSectionTitle('claude', escHtml(t('Remote hosts')))}${parts.join('')}`);
      }
    }

    // Change-guard: this runs every 8s poll; unchanged HTML must not churn
    // the taskbar pie DOM / popup subtree (constant layout + GC pressure).
    const rowsHtml = rows.join('');
    if (rowsHtml !== this._usageRowsHtml) { this._usageRowsHtml = rowsHtml; usageEl.innerHTML = rowsHtml; }
    // Per-SECTION freshness: claude and codex poll independently — a stalled
    // claude poll (e.g. signed out) must not make codex's data look stale too.
    const secHtml = sections.join('');
    if (secHtml !== this._usageSecHtml) { this._usageSecHtml = secHtml; popup.innerHTML = secHtml; }
    // Mobile nav quota chip: one worst-of donut (there's no room for the full
    // per-backend pie rows in the nav bar). Same change-guard discipline.
    const mChip = document.getElementById('mobile-nav-usage');
    if (mChip) {
      const deg = Math.round(Math.max(0, Math.min(100, chipWorst)) * 3.6);
      const chipHtml = chipWorst < 0 ? '' :
        `<div class="usage-pie usage-donut" style="background:conic-gradient(${usageColor(chipWorst)} ${deg}deg, var(--bg-input) ${deg}deg)"><span class="usage-donut-label">${Math.round(chipWorst)}</span></div>`;
      if (chipHtml !== this._usageChipHtml) {
        this._usageChipHtml = chipHtml;
        mChip.innerHTML = chipHtml;
        mChip.classList.toggle('hidden', !chipHtml);
      }
    }
  },
  });
}
