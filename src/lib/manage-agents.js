// Manage-Agents dialog + Anthropic/ChatGPT account rosters (mixin split from app.js, 2.82.0 audit seam). Methods run with the App instance as `this`.
import { t } from './i18n.js';
import { createModalShell, escHtml, fetchJson, showConfirmDialog, showContextMenu, showInputDialog, showToast } from './utils.js';

export function installManageAgents(App, ctx = {}) {
  Object.assign(App.prototype, {
  // ── Manage Agents dialog: install/login status + login/update actions ──
  // One place for CLI lifecycle instead of scattered menu entries. Login and
  // update both run visibly in a shell terminal window (nothing hidden).
  // Guided "both accounts" setup (subscription OAuth + a saved API key). The
  // CLI's /login is mutually exclusive, so the wizard choreographs the order:
  // Console login FIRST (its minted key gets captured into VibeSpace), then log
  // BACK into the subscription — final state: subscription owns the global
  // login, the API key lives in our store, sessions pick per-spawn. Each login
  // step opens a terminal; a background watcher detects completion and reopens
  // the wizard at the next step.
  // Add another Claude subscription: name it, allocate an isolated creds dir,
  // open a login terminal scoped to that dir (does NOT disturb the CLI's global
  // login), and watch for the OAuth login to land. Held per-account, switchable
  // per session. (Local Claude only in P1.)
  async _addSubscription(hostId, hostLabel) {
    const name = await showInputDialog({
      title: hostId ? t('Add subscription — log in on {host}', { host: hostLabel }) : t('Add subscription'),
      label: t('Name this subscription (e.g. Work Max, Personal Max)'),
      placeholder: t('e.g. Work Max'),
      confirmText: t('Continue'),
    });
    if (name === null) return; // cancelled
    let created;
    try {
      created = await fetchJson('/api/accounts/subscription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: (name || '').trim() }),
      });
    } catch { showToast(t('Could not start — server unreachable'), { type: 'error' }); return; }
    if (!created?.loginCmd) { showToast(created?.error || t('Could not start'), { type: 'error' }); return; }
    // With a MACHINE selected the login runs ON that machine, into the
    // account's per-host creds dir (2.199.0/2.200.0 — real trap: the dialog
    // said AIDev, the login terminal quietly opened LOCALLY, and the user's
    // account landed in the local store "moved to this machine"). The token
    // is minted on the host and never leaves it; the account record still
    // lives in VibeSpace (machine-independent identity).
    if (hostId) {
      const dir = `$HOME/.vibespace/subs/${created.id}`; // id shape sub-<hex>, metachar-free
      this._watchHostLogin(hostId, hostLabel);
      this.openShellTerminal(undefined, { hostId, initialCommand: `mkdir -p "${dir}" && CLAUDE_CONFIG_DIR="${dir}" CLAUDE_SECURESTORAGE_CONFIG_DIR="${dir}" claude auth login --claudeai` });
      showToast(t('A terminal opened ON {host} — sign in there. The login lives on {host} only; sessions on it can then pick this account.', { host: hostLabel }), { duration: 7000 });
      return;
    }
    // Open a login terminal with the env-scoped command. The sign-in writes THIS
    // account's creds into its own dir — your current/global login is untouched.
    this.openShellTerminal(undefined, { initialCommand: created.loginCmd });
    showToast(t('A terminal opened — sign in with the account you want to add. Your other logins are untouched; VibeSpace captures it automatically.'), { duration: 6000 });
    // Poll finalize until the creds file appears (or give up after ~5 min).
    let tries = 0;
    const iv = setInterval(async () => {
      if (++tries > 100) { clearInterval(iv); return; }
      try {
        const r = await fetchJson(`/api/accounts/subscription/${encodeURIComponent(created.id)}/finalize`, { method: 'POST' });
        if (r?.loggedIn) {
          clearInterval(iv);
          showToast(t('✓ Added {name}', { name: r.name || t('subscription') }));
        }
      } catch { /* keep polling */ }
    }, 3000);
  },

  // Add a Console account (its minted API key) without disturbing the global
  // subscription — the /login runs in an isolated dir server-side, we poll for
  // the minted key and import it.
  async _addConsoleAccount() {
    let r;
    try { r = await fetchJson('/api/accounts/console-login', { method: 'POST' }); }
    catch { showToast(t('Could not start — server unreachable'), { type: 'error' }); return; }
    if (!r?.loginCmd) { showToast(r?.error || t('Could not start'), { type: 'error' }); return; }
    this.openShellTerminal(undefined, { initialCommand: r.loginCmd });
    showToast(t('A terminal opened — pick “Anthropic Console account” and sign in. Your subscription login stays intact.'), { duration: 6000 });
    let tries = 0;
    const iv = setInterval(async () => {
      if (++tries > 100) { clearInterval(iv); return; }
      try {
        const c = await fetchJson(`/api/accounts/console-login/${encodeURIComponent(r.id)}/capture`, { method: 'POST' });
        if (c?.captured) { clearInterval(iv); showToast(t('✓ Added {name}', { name: c.account?.name || t('Console account') })); }
      } catch { /* keep polling */ }
    }, 3000);
  },

  // Add a Codex (ChatGPT) subscription — same isolation idea via CODEX_HOME.
  async _addCodexSubscription() {
    const name = await showInputDialog({
      title: t('Add ChatGPT account'),
      label: t('Name this account (e.g. Work ChatGPT, Personal)'),
      placeholder: t('e.g. Work ChatGPT'),
      confirmText: t('Continue'),
    });
    if (name === null) return; // cancelled
    let created;
    try {
      created = await fetchJson('/api/accounts/codex-subscription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: (name || '').trim() }),
      });
    } catch { showToast(t('Could not start — server unreachable'), { type: 'error' }); return; }
    if (!created?.loginCmd) { showToast(created?.error || t('Could not start'), { type: 'error' }); return; }
    // Login writes THIS account's auth.json into its own CODEX_HOME; sessions
    // stay shared (symlinked). Your other logins are untouched.
    this.openShellTerminal(undefined, { initialCommand: created.loginCmd });
    showToast(t('A terminal opened — sign in with the ChatGPT account you want to add. Your other logins are untouched; VibeSpace captures it automatically.'), { duration: 6000 });
    let tries = 0;
    const iv = setInterval(async () => {
      if (++tries > 100) { clearInterval(iv); return; }
      try {
        const r = await fetchJson(`/api/accounts/codex-subscription/${encodeURIComponent(created.id)}/finalize`, { method: 'POST' });
        if (r?.loggedIn) { clearInterval(iv); showToast(t('✓ Added {name}', { name: r.name || t('account') })); }
      } catch { /* keep polling */ }
    }, 3000);
  },

  // Watch a "Log in on <host>…" flow land (2.195.0, real report: after an
  // on-host login the dialog showed another machine + the old identity).
  // Polls the host's live login state — a read-only ssh probe, NO API calls
  // (§ban-safety) — until the credential files CHANGE vs the pre-login
  // snapshot, then brings the Agents surface back on the SAME machine.
  _watchHostLogin(hostId, hostLabel) {
    if (!hostId) return;
    if (this._hostLoginWatch) { clearInterval(this._hostLoginWatch); this._hostLoginWatch = null; }
    const sig = (r) => (r && !r.error)
      ? [r.credsMtime || 0, r.codexAuthMtime || 0, r.subscription?.loggedIn ? 1 : 0, r.subscription?.email || '', r.codex?.email || '', (r.hostSubs || []).join('+')].join('|')
      : null;
    // Baseline = the FIRST SUCCESSFUL poll (t≈6s), never a pre-click fetch:
    // (a) a transient probe failure at t0 must not make the first good poll
    // of the UNCHANGED login read as "updated" (review-confirmed); (b) the
    // login terminal's claude may refresh its own token at startup, bumping
    // credsMtime seconds in — baselining after that absorbs it, while a real
    // OAuth login takes ≥15-30s and still lands after the baseline.
    let baseSig = null;
    let tries = 0;
    this._hostLoginWatch = setInterval(async () => {
      if (++tries > 50) { clearInterval(this._hostLoginWatch); this._hostLoginWatch = null; return; }
      let cur = null;
      try { cur = await fetchJson(`/api/hosts/${encodeURIComponent(hostId)}/accounts-status`); } catch { return; }
      const s = sig(cur);
      if (s === null) return;
      if (baseSig === null) { baseSig = s; return; }
      if (s === baseSig) return;
      clearInterval(this._hostLoginWatch); this._hostLoginWatch = null;
      // Stamp for the roster's identity-freshness note — ONLY when the
      // MACHINE login itself changed (a per-account host login landing is
      // the last sig field; it must not arm the CLI-login row's amber
      // "login changed" note). Local clocks only — remote mtimes rotate on
      // normal token refresh and skew.
      const machinePart = (x) => x.split('|').slice(0, 5).join('|');
      if (machinePart(s) !== machinePart(baseSig)) (this._hostLoginSeenAt ||= {})[hostId] = Date.now();
      // Respect a machine the user explicitly switched to while waiting —
      // yanking the surface back would re-instance the jumps-machines bug.
      if (this._agentsHostPref && this._agentsHostPref !== hostId) {
        showToast(t('✓ Login on {host} updated', { host: hostLabel }), { duration: 5000 });
        return;
      }
      showToast(t('✓ Login on {host} updated — reopening Agents there', { host: hostLabel }), { duration: 5000 });
      this._agentsHostPref = hostId;
      // Refresh the open Agents surface in place (forcing it onto the login's
      // machine), else reopen it (the wizard pattern).
      if (!this._agentsRefreshHook?.(hostId)) this._showAgentsDialog();
    }, 6000);
  },

  // ── Codex/OpenAI accounts roster (rendered UNDER Codex in Manage Agents).
  // Same unified model as the Anthropic roster: the peer "CLI login" row is
  // the SELECTED machine's own codex login; the named ChatGPT accounts below
  // are stored by VibeSpace (machine-independent, ship per session). No usage
  // bars (OpenAI quota isn't polled).
  // Compact per-account usage readout (mini donuts, same visual language as
  // the taskbar quota pies) shared by the Claude and Codex rosters. Data:
  // Claude = the passive statusline cache; Codex = the per-account rate-limit
  // buckets (both ride /api/usage). Scoped weekly buckets (e.g. Fable) get
  // their own donut when present.
  _acctUsageHtml(u) {
    if (!u) return '';
    const pct = (x) => Math.min(100, Math.round(x?.usedPercent ?? ((x?.utilization || 0) * 100)));
    const donut = (label, x, tipName) => {
      const p = pct(x);
      const c = p > 95 ? 'var(--red,#e55)' : p > 80 ? 'var(--yellow,#e5c07b)' : 'var(--green,#3fb950)';
      const deg = Math.round(p * 3.6);
      return `<span class="acct-usage-donut" title="${escHtml(tipName || label)}: ${p}%" style="background:conic-gradient(${c} ${deg}deg, var(--bg-input) ${deg}deg)"><span>${escHtml(label)}</span></span>`;
    };
    const parts = [donut('5h', u.fiveHour), donut('7d', u.sevenDay)];
    for (const sc of (u.scopedWeekly || [])) parts.push(donut(String(sc.name || '?').slice(0, 2), sc, sc.name));
    const age = u.fetchedAt ? Math.round((Date.now() - u.fetchedAt) / 60000) : null;
    // The age span ALWAYS renders (empty when fresh) at a fixed min-width —
    // conditional rendering shifted the right-aligned donut group per row and
    // broke the column alignment across the roster (measured: 28px jump).
    const ageLabel = age != null && age > 5 ? (age < 100 ? t('{n}m', { n: age }) : t('{n}h', { n: Math.round(age / 60) })) : '';
    // Narrow-width companion (rail panel, 2.179.1): the donut cluster is
    // ~100px and doesn't shrink — below ~340px a container query swaps it for
    // ONE pill showing the TIGHTEST bucket (full detail in the tooltip).
    const buckets = [['5h', u.fiveHour], ['7d', u.sevenDay], ...(u.scopedWeekly || []).map((sc) => [String(sc.name || '?').slice(0, 2), sc])]
      .map(([label, x]) => [label, pct(x)]).filter(([, p]) => Number.isFinite(p));
    let mini = '';
    if (buckets.length) {
      const [wl, wp] = buckets.reduce((a, b) => (b[1] > a[1] ? b : a));
      const wc = wp > 95 ? 'var(--red,#e55)' : wp > 80 ? 'var(--yellow,#e5c07b)' : 'var(--green,#3fb950)';
      const tip = buckets.map(([l, p]) => `${l} ${p}%`).join(' · ');
      mini = `<span class="acct-usage-mini" style="color:${wc}" title="${escHtml(tip)}">${escHtml(wl)} ${wp}%</span>`;
    }
    return `<span class="acct-usage">${parts.join('')}<span class="acct-usage-age" title="${age != null ? t('Last refreshed {n} min ago', { n: age }) : ''}">${ageLabel}</span></span>${mini}`;
  },

  async _renderCodexAccounts(ctx) {
    const { body, selectedHost, hostSel, done, run, refresh, st } = ctx;
    let accts;
    try { accts = await this.refreshAccounts(); } catch { return; }
    const codexAccts = (accts.accounts || []).filter(a => a.backend === 'codex');
    // st is already machine-scoped: /api/hosts/<id>/backend-status on a host.
    const gLoggedIn = !!(st?.codex?.loggedIn);
    const hostLabel = selectedHost ? (hostSel.options[hostSel.selectedIndex]?.textContent?.split(' (')[0] || t('remote host')) : null;
    const svg = (d, sw = 1.4) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    const CROWN = svg('<path d="M2.5 12.5h11M3 12.5L2 4.5l3.2 2.6L8 3l2.8 4.1L14 4.5l-1 8z"/>');
    const GLOBE = svg('<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 2-2 10 0 12M8 2c2 2 2 10 0 12"/>');
    const STAR_F = svg('<path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .8 4.3L8 11.6 4.1 13.6l.8-4.3-3.1-3 4.3-.6z" fill="currentColor"/>');
    const STAR_O = svg('<path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .8 4.3L8 11.6 4.1 13.6l.8-4.3-3.1-3 4.3-.6z"/>');
    const row = document.createElement('div'); row.className = 'ob-backend acct-section acct-roster';
    const left = document.createElement('div'); left.style.flex = '1';
    const gDef = !accts.defaultCodexAccountId;
    const usageHtml = (u) => this._acctUsageHtml(u);
    const cgl = !selectedHost ? (this._usageCodexGlobal || {}) : {};
    const gName = selectedHost ? t('CLI login on {host}', { host: escHtml(hostLabel) }) : t('CLI login');
    // Host codex identity from its auth.json JWT (probed once in refresh —
    // the JWT email can't go stale relative to the token itself, 2.188.0)
    const rcx = selectedHost ? ctx.racct?.codex : null;
    let gIdent = gLoggedIn
      ? (selectedHost
          ? `${rcx?.email ? escHtml(rcx.email + (rcx.plan ? ' · ' + rcx.plan : '')) + ' · ' : ''}<span class="ob-ok">${t('logged in')}</span>`
          : (escHtml(cgl.email || '') || t('logged in')))
      : `<span class="ob-warn">${t('not logged in')}</span>`;
    // The machine's codex login may BE one of the named ChatGPT accounts (same
    // email) — say so; their quota buckets are then merged newest-wins.
    const linkedCx = !selectedHost && gLoggedIn && cgl.accountId ? codexAccts.find(a => a.id === cgl.accountId) : null;
    if (linkedCx) gIdent += ` <span class="acct-linked-hint" title="${escHtml(t('The machine login and this VibeSpace account are the same ChatGPT account — usage is shown merged'))}">${t('= “{name}”', { name: escHtml(linkedCx.name) })}</span>`;
    const gExtraActions = selectedHost
      ? `<button class="agent-btn acct-host-login" title="${t('Opens a terminal ON {host} — this login lands on that machine, not in VibeSpace', { host: escHtml(hostLabel) })}">${t('Log in on {host}…', { host: escHtml(hostLabel) })}</button>` : '';
    const globalRow = `<div class="acct-key-row${gDef ? ' is-default' : ''}" data-id="__codex_global__">
      <span class="acct-type-icon" title="${selectedHost ? t("This machine's own login — lives on {host}, not in VibeSpace", { host: escHtml(hostLabel) }) : t('The CLI’s own global login on this machine')}">${GLOBE}</span>
      <span class="acct-key-main"><span class="acct-key-name">${gName}</span><span class="acct-key-tail">${gIdent}</span></span>
      <span class="acct-usage-cell">${!selectedHost && gLoggedIn ? usageHtml(this._codexAccountUsage?.['__global_codex__']) : ''}</span>
      <span class="acct-key-actions">
        <button class="acct-icon acct-def ${gDef ? 'on' : ''}" title="${gDef ? t('Default for new sessions — pick another to change') : t('Set as default for new sessions')}">${gDef ? STAR_F : STAR_O}</button>${gExtraActions}
      </span></div>`;
    // §ban-safety: a ChatGPT account (isolated CODEX_HOME) can't run on a
    // remote host unless the opt-in is set — same as Claude subscriptions.
    const allowSubRemote = !!this.settings?.get?.('accounts.shipSubscriptionToRemote');
    const subBlocked = !!selectedHost && !allowSubRemote;
    // Same-account link vs the host's own codex login (see the Anthropic
    // roster note) — a linked account is usable on the host via its own login
    const cxHostEmail = selectedHost ? String(racct?.codex?.email || '').trim().toLowerCase() : '';
    const cxEmailOf = (a) => String(a.email || (String(a.name || '').includes('@') ? a.name : '')).trim().toLowerCase();
    const keyLines = codexAccts.map(a => {
      const isDef = accts.defaultCodexAccountId === a.id;
      const linked = subBlocked && !!cxHostEmail && cxEmailOf(a) === cxHostEmail;
      const blocked = subBlocked && !linked;
      let ident = a.loggedIn
        ? escHtml((a.email || '') + (a.subscriptionType ? (a.email ? ' · ' : '') + a.subscriptionType : '')) || t('logged in')
        : `<span class="ob-warn">${t('not logged in')}</span>`;
      const hint = linked
        ? ` <span class="acct-linked-hint" title="${t('Same account as {host}’s current CLI login — sessions on {host} picking it run on the host’s own login directly (nothing is shipped).', { host: escHtml(hostLabel) })}">${t('· = {host}’s own login', { host: escHtml(hostLabel) })}</span>`
        : blocked ? ` <span class="acct-blocked-hint" title="${t('Runs on this machine only. For {host}, log in on the host — or enable Settings → “Ship subscription logins to remote hosts.”', { host: escHtml(hostLabel) })}">${t('· this machine only')}</span>` : '';
      // Redesign (2.178.0): star + ⋯ menu, same as the Anthropic roster
      return `<div class="acct-key-row${isDef ? ' is-default' : ''}${blocked ? ' acct-row-blocked' : ''}" data-id="${escHtml(a.id)}"${blocked ? ' data-blocked="1"' : ''}>
        <span class="acct-type-icon" title="${t('ChatGPT account — runs on this machine (or a host you log into)')}">${CROWN}</span>
        <span class="acct-key-main"><span class="acct-key-name">${escHtml(a.name)}</span><span class="acct-key-tail">${ident}${hint}</span></span>
        <span class="acct-usage-cell">${a.loggedIn ? usageHtml(this._codexAccountUsage?.[a.id]) : ''}</span>
        <span class="acct-key-actions">
          <button class="acct-icon acct-def ${isDef ? 'on' : ''}" title="${isDef ? t('Default for new sessions — click to clear') : t('Set as default for new sessions')}">${isDef ? STAR_F : STAR_O}</button>
          <button class="acct-icon acct-menu" title="${t('More actions')}">${svg('<circle cx="3" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="13" cy="8" r="1.3" fill="currentColor" stroke="none"/>')}</button>
        </span></div>`;
    }).join('');
    const note = selectedHost
      ? t("The “CLI login” row is {host}'s own login (lives on that machine). Named accounts run on THIS machine only — for {host}, use “Log in on host…”, or enable Settings → “Ship subscription logins to remote hosts.”", { host: escHtml(hostLabel) })
      : t('Each Codex session can pick its ChatGPT login (New Session dialog / card ⚙). Held in isolated logins, switchable per session; threads stay shared.');
    left.innerHTML = `<div class="acct-list">${globalRow}${keyLines}</div>
      <div class="agents-note">${note}</div>`;
    const head = document.createElement('div'); head.className = 'acct-roster-head';
    const title = document.createElement('b'); title.textContent = t('ChatGPT / OpenAI accounts');
    const addBtn = document.createElement('button'); addBtn.className = 'agent-btn acct-add' + (codexAccts.length ? '' : ' primary'); addBtn.textContent = '+ ' + t('Add ChatGPT account…');
    addBtn.title = t('Sign in another ChatGPT account — stored in VibeSpace (not on any one machine), switchable per session');
    addBtn.onclick = () => { done(); this._addCodexSubscription(); };
    head.append(title, addBtn);
    if (ctx.stale?.()) return; // a newer refresh took over mid-await
    row.append(head, left);
    body.appendChild(row);
    left.onclick = async (e) => {
      const keyRow = e.target.closest?.('.acct-key-row');
      if (!keyRow) return;
      const id = keyRow.dataset.id;
      if (id === '__codex_global__') {
        if (e.target.closest('.acct-host-login')) {
          // Runs ON the selected host — lands in ITS ~/.codex, not VibeSpace.
          // --device-auth: a plain `codex login` would open localhost:1455 on
          // the host, unreachable from the user's browser. Confirmed first —
          // this REPLACES the machine's login (same semantics as claude).
          const okGo = await showConfirmDialog({
            title: t('Switch {host}’s own login?', { host: hostLabel }),
            message: t('This opens codex login ON {host} and REPLACES that machine’s current ChatGPT login. VibeSpace’s named accounts are untouched — to add a switchable account instead, use “+ Add ChatGPT account…”.', { host: hostLabel }),
            confirmText: t('Open login terminal'),
          });
          if (!okGo) return;
          this._watchHostLogin(selectedHost, hostLabel);
          run('codex login --device-auth');
        } else if (e.target.closest('.acct-def')) {
          try { await fetchJson('/api/accounts/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: null, backend: 'codex' }) }); } catch {}
          refresh();
        }
        return;
      }
      const a = codexAccts.find(x => x.id === id);
      const doEmail = async () => {
        const email = await showInputDialog({
          title: t('Account email'),
          label: t('Email of this ChatGPT account. Used to recognize when it is the same account as a machine login (their usage then shows merged).'),
          value: a?.email || '', placeholder: 'you@example.com', confirmText: t('Save'),
        });
        if (email != null) {
          try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) }); } catch {}
          refresh();
        }
      };
      const doTest = () => {
        if (!a?.loggedIn) { showToast(t('This account isn’t signed in yet — use “Add ChatGPT account…” to finish the login first.'), { type: 'error' }); return; }
        if (keyRow.dataset.blocked) {
          showToast(t('“{name}” runs on this machine only. For {host}, use “Log in on host…” on the CLI-login row, or turn on Settings → “Ship subscription logins to remote hosts.”', { name: a?.name, host: escHtml(hostLabel) }) + ' ' + t('Already logged in as this account ON {host}? Then pick “CLI login @ {host}” when switching the session’s billing — that uses the host’s own login.', { host: escHtml(hostLabel) }), { type: 'error', duration: 8000 });
          return;
        }
        done();
        // With a remote host selected the test runs ON that host (auth.json
        // ships to it) — proving the full remote path.
        this.createSession({ backend: 'codex', mode: 'terminal', cwd: '', accountId: id, ephemeral: true, hostId: selectedHost || undefined });
      };
      const doRename = async () => {
        const name = await showInputDialog({ title: t('Rename account'), label: t('Account name'), value: a?.name || '', confirmText: t('Save') });
        if (name && name.trim() && name.trim() !== a?.name) {
          try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) }); } catch {}
          refresh();
        }
      };
      const doDelete = async () => {
        if (!(await showConfirmDialog({ title: t('Remove account'), message: t('Remove "{name}" from VibeSpace? Sessions already running keep working.', { name: a?.name }) }))) return;
        try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch {}
        refresh();
      };
      if (e.target.closest('.acct-def')) {
        const isDef = accts.defaultCodexAccountId === id;
        // Default is GLOBAL — starring a "this machine only" row while a host
        // is selected read as "I switched the remote's account" (2.188.0)
        if (keyRow.dataset.blocked && !isDef) {
          showToast(t('The default is global, and “{name}” can’t run on {host} — new sessions there keep using its own login.', { name: a?.name, host: escHtml(hostLabel) }) + ' ' + t('Already logged in as this account ON {host}? Then pick “CLI login @ {host}” when switching the session’s billing — that uses the host’s own login.', { host: escHtml(hostLabel) }), { type: 'error', duration: 8000 });
          return;
        }
        try { await fetchJson('/api/accounts/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: isDef ? null : id, backend: 'codex' }) }); } catch {}
        refresh();
      } else if (e.target.closest('.acct-menu')) {
        const r = e.target.closest('.acct-menu').getBoundingClientRect();
        const items = [
          { label: t('Test'), action: doTest },
          { label: t('Rename account'), action: doRename },
        ];
        if (a?.loggedIn && (!a.email || a.emailDeclared)) items.push({ label: a.email ? t('edit email') : t('set email…'), action: doEmail });
        items.push({ separator: true }, { label: t('Remove account'), action: doDelete });
        showContextMenu(r.left, r.bottom + 4, items);
      }
    };
  },

  _showAccountsWizard() {
    if (this._acctWatch) { clearInterval(this._acctWatch); this._acctWatch = null; }
    const { body, close: done } = createModalShell({
      id: 'acct-wizard-overlay', title: t('Set up both Anthropic accounts'), bodyClass: 'acct-wizard-body',
      onClose: () => { if (this._acctWatch) { clearInterval(this._acctWatch); this._acctWatch = null; } },
    });
    body.innerHTML = `<div class="ob-loading">${t('Checking…')}</div>`;

    // Background watcher: poll until cond(data) is true, then act. Used while a
    // login terminal is open (the wizard closes so the terminal is usable) —
    // completion reopens the wizard at the recomputed next step.
    const watch = (cond, act) => {
      let tries = 0;
      this._acctWatch = setInterval(async () => {
        if (++tries > 100) { clearInterval(this._acctWatch); this._acctWatch = null; return; }
        let d = null;
        try { d = await fetchJson('/api/accounts'); } catch { return; }
        if (d && cond(d)) {
          clearInterval(this._acctWatch); this._acctWatch = null;
          await act(d);
        }
      }, 3000);
    };

    const render = async () => {
      let d = null;
      try { d = await fetchJson('/api/accounts'); } catch {}
      if (!d) { body.innerHTML = `<div class="ob-loading">${t('Server unreachable')}</div>`; return; }
      const sub = !!d.subscription?.loggedIn;
      const hasKey = (d.accounts || []).length > 0;
      const importable = d.cliKey?.present && !d.cliKey.imported;
      const step = (n, state, title, desc, btn) => `
        <div class="acct-step ${state}">
          <span class="acct-step-n">${state === 'done' ? '✓' : n}</span>
          <div class="acct-step-body"><b>${title}</b><div class="agents-note">${desc}</div>${btn || ''}</div>
        </div>`;
      if (sub && hasKey) {
        const nKeys = d.accounts.length;
        const savedLine = nKeys > 1
          ? t("Subscription is the global login and {n} API keys are saved. Every session can pick its account in the New Session dialog or the card's ⚙ — you'll never need /login switching again.", { n: nKeys })
          : t("Subscription is the global login and {n} API key is saved. Every session can pick its account in the New Session dialog or the card's ⚙ — you'll never need /login switching again.", { n: nKeys });
        body.innerHTML = `<div class="acct-wizard-done"><span class="ob-ok" style="font-size:15px">${t('✓ All set')}</span>
          <p class="agents-note">${savedLine}</p></div>`;
        return;
      }
      let html = '';
      // Step 1 — get an API key into VibeSpace
      if (hasKey) {
        html += step(1, 'done', t('API key saved'), `${escHtml(d.accounts[0].name)} (…${escHtml(d.accounts[0].tail)})`);
      } else if (importable) {
        html += step(1, 'active', t('Save your Console key'), t('Your current Console login already minted an API key — one click saves it into VibeSpace (encrypted).'), `<button class="agent-btn primary" id="acct-w-import">${t('Import it')}</button>`);
      } else {
        html += step(1, 'active', t('Log in to your Console account once'),
          t('A terminal will open — in the login menu pick <b>“Anthropic Console account”</b>. This temporarily replaces the subscription login; step 2 restores it right after. VibeSpace auto-captures the key the moment it appears.'),
          `<button class="agent-btn primary" id="acct-w-console">${t('Open login terminal')}</button>`
          + `<div class="agents-note">${t('Or, if you already have a key: <a href="#" id="acct-w-paste">paste an API key</a>')}</div>`);
      }
      // Step 2 — subscription owns the global login
      if (sub) {
        html += step(2, 'done', t('Subscription logged in'), escHtml(d.subscription.email || ''));
      } else {
        html += step(2, hasKey || importable ? 'active' : 'pending', t('Log back in to your subscription'),
          t('A terminal will open — pick <b>“Claude account with subscription”</b> and finish in the browser. VibeSpace detects it automatically.'),
          (hasKey || importable) ? `<button class="agent-btn primary" id="acct-w-sub">${t('Open login terminal')}</button>` : '');
      }
      body.innerHTML = html;
      body.querySelector('#acct-w-import')?.addEventListener('click', async () => {
        try { const r = await fetchJson('/api/accounts/import-cli', { method: 'POST' }); showToast(t('Imported: {name}', { name: r.account.name })); } catch { showToast(t('Import failed'), { type: 'error' }); }
        render();
      });
      body.querySelector('#acct-w-console')?.addEventListener('click', () => {
        done();
        this.openShellTerminal(undefined, { initialCommand: 'claude /login' });
        showToast(t('Complete the Console login — setup continues automatically'));
        watch((x) => x.cliKey?.present && !x.cliKey.imported, async () => {
          try { await fetchJson('/api/accounts/import-cli', { method: 'POST' }); } catch {}
          showToast(t('Console key captured ✓ — one step left'));
          this._showAccountsWizard();
        });
      });
      body.querySelector('#acct-w-paste')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const key = await showInputDialog({ title: t('Add API key'), label: t('Anthropic API key (from console.anthropic.com)'), placeholder: 'sk-ant-…', confirmText: t('Save') });
        if (key && key.trim()) {
          try { await fetchJson('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key.trim() }) }); } catch {}
        }
        render();
      });
      body.querySelector('#acct-w-sub')?.addEventListener('click', () => {
        done();
        this.openShellTerminal(undefined, { initialCommand: 'claude /login' });
        showToast(t('Complete the subscription login — setup continues automatically'));
        watch((x) => x.subscription?.loggedIn, async () => {
          showToast(t('Subscription restored ✓ — accounts setup complete'));
          this._showAccountsWizard();
        });
      });
    };
    render();
  },

  _showAgentsDialog({ container } = {}) {
    // rail mode: render into the sidebar panel instead of a modal (one source)
    if (!container && !this.isMobile && this.sidebar?._railEl) { this.sidebar.toggle?.(true); this.sidebar._railGo?.('agents'); return; }
    const shell = container ? { body: container, close: () => {} } : createModalShell({
      id: 'agents-dialog-overlay', title: t('Agents'), dialogClass: 'agents-dialog',
      bodyClass: 'agents-dialog-body', escapeToClose: true,
    });
    // rail panel: carry the SAME body class so one stylesheet (incl. the
    // container queries) serves modal and panel — the panel's narrow-width
    // crush came from modal-scoped rules never applying there
    if (container) container.classList.add('agents-dialog-body');
    const { body, close: done } = shell;
    body.innerHTML = `<div class="ob-loading">${t('Checking\u2026')}</div>`;

    const BACKENDS = [
      // installCmd: claude's official native installer is user-local
      // (~/.local/bin, no root, no npm-prefix permission trap); codex has no
      // native installer — npm -g is its official install AND update path.
      { key: 'claude', label: 'Claude Code', loginCmd: 'claude', updateCmd: 'claude update', installCmd: 'curl -fsSL https://claude.ai/install.sh | bash' },
      // codex login is ALWAYS --device-auth (user directive, 2.105.1): plain
      // `codex login` starts a localhost:1455 callback server on the machine
      // running the CLI — unreachable from the user's browser on remote hosts
      // AND on managed/container instances (the callback would land on the
      // user's own machine). Device auth prints a URL + one-time code instead
      // and works everywhere, including this dev box.
      { key: 'codex', label: 'Codex', loginCmd: 'codex login --device-auth', updateCmd: 'npm install -g @openai/codex@latest', installCmd: 'npm install -g @openai/codex@latest' },
    ];
    // Host selector: agent lifecycle can target a remote machine too. Login/
    // update then run in a shell ON that host (ssh -t).
    // The selection is an APP-LEVEL pref (2.195.0, real report): the dialog is
    // re-invoked with a fresh closure by rail-panel rebuilds and every
    // close/reopen — a closure-local '' reset the machine to local mid-flow
    // (login on Novita-H200 → dialog back on another machine). Validated
    // against the roster each refresh; falls back to local if the host is gone.
    let selectedHost = this._agentsHostPref || ''; // '' = local
    const run = (cmd) => {
      done();
      if (selectedHost) this.openShellTerminal(undefined, { hostId: selectedHost, initialCommand: cmd });
      else this.openShellTerminal(undefined, { initialCommand: cmd });
    };
    // Reentrancy guard: switching machines mid-render (host probes take
    // seconds over ssh) starts a NEW refresh whose innerHTML='' wipes the old
    // one's partial rows — but the OLD run resumes after its next await and
    // keeps appending sections scoped to the old machine (duplicate rosters,
    // handlers acting on the wrong host). Each refresh takes a generation
    // ticket; stale runs stop at every await/append point.
    let refreshGen = 0;
    // Exposed so the host-login watcher can refresh THIS surface in place
    // (returns false once the body left the document — panel rebuilt/closed).
    const refresh = async () => {
      const myGen = ++refreshGen;
      const stale = () => myGen !== refreshGen;
      let st = {};
      try { st = await fetchJson(selectedHost ? `/api/hosts/${selectedHost}/backend-status` : '/api/backend-status'); } catch {}
      if (stale()) return;
      body.innerHTML = '';
      // Host dropdown row
      const hostRow = document.createElement('div');
      hostRow.className = 'agents-host-row';
      const hostLabel = document.createElement('span'); hostLabel.textContent = t('Machine:');
      const hostSel = document.createElement('select'); hostSel.className = 'agents-host-select';
      hostSel.innerHTML = `<option value="">${t('This machine (local)')}</option>`;
      let hostTransport = null; // 'dial' for a paired device (shapes the install actions)
      try {
        const hd = await fetchJson('/api/hosts');
        for (const h of hd?.hosts || []) {
          const o = document.createElement('option'); o.value = h.id; o.textContent = h.transport === 'dial' ? `${h.name} (${t('device')})` : `${h.name} (${h.user}@${h.host})`;
          hostSel.appendChild(o);
        }
        // Restored pref no longer in the roster (host removed) → local. Only
        // when the roster actually LOADED — on a fetch failure keep the pick.
        if (selectedHost && hd?.hosts && !hd.hosts.some(h => h.id === selectedHost)) {
          selectedHost = ''; this._agentsHostPref = '';
        }
        hostTransport = (hd?.hosts || []).find(h => h.id === selectedHost)?.transport || null;
      } catch {}
      if (stale()) return;
      hostSel.value = selectedHost;
      hostSel.onchange = () => { this._agentsHostPref = selectedHost = hostSel.value; refresh(); };
      hostRow.append(hostLabel, hostSel);
      body.appendChild(hostRow);
      // Accounts render UNDER their CLI: Anthropic accounts below Claude Code,
      // OpenAI/Codex accounts below Codex. Shared context for the extracted
      // renderers (they capture the same closures the dialog builds).
      // Host login identity probed ONCE for both rosters (claude email/key
      // shapes + codex JWT email — 2.188.0).
      let racct = null;
      if (selectedHost) { try { racct = await fetchJson(`/api/hosts/${encodeURIComponent(selectedHost)}/accounts-status`); } catch {} }
      if (stale()) return;
      const actx = { body, selectedHost, hostSel, done, run, refresh, st, stale, racct };
      for (const b of BACKENDS) {
        const info = st[b.key] || {};
        const row = document.createElement('div'); row.className = 'ob-backend';
        const left = document.createElement('div');
        // one line: name \u00b7 version chip \u00b7 status \u2014 the version's own "(Claude
        // Code)" suffix just repeats the label and wrapped badly when narrow
        const ver = info.version ? String(info.version).replace(/\s*\((?:claude code|codex(?:-cli)?)\)\s*$/i, '') : '';
        left.className = 'ob-backend-id';
        // API-key-style logins (console-managed key / env var / apiKeyHelper)
        // say so \u2014 mirrors the CLI's own "API Usage Billing" statusline
        const lm = info.loginMethod;
        const lmLabel = (lm === 'console-key' || lm === 'env-key') ? t('API key') : lm === 'key-helper' ? 'apiKeyHelper' : '';
        // apiKeyHelper OUTRANKS OAuth in the CLI (2.191.0, CW-H200 incident:
        // fresh OAuth login + a leftover helper = every session bills the
        // helper key while this row said just "logged in") \u2014 warn loudly.
        const helperWarn = (info.keyHelper && lm !== 'key-helper')
          ? ` <span class="ob-warn" title="${escHtml(t('The CLI prefers a configured apiKeyHelper over the OAuth login \u2014 sessions on this machine bill via the helper key. Remove apiKeyHelper from ~/.claude/settings.json to bill the subscription.'))}">\u26a0 ${t('apiKeyHelper overrides this login')}</span>` : '';
        left.innerHTML = `<b>${b.label}</b>${ver ? ` <span class="ob-ver">${escHtml(ver)}</span>` : ''} ${
          !info.installed ? `<span class="ob-bad">${t('not installed')}</span>`
          : info.loggedIn ? `<span class="ob-ok">\u2713 ${t('logged in')}</span>${lmLabel ? ` <span class="ob-ver">${escHtml(lmLabel)}</span>` : ''}${helperWarn}`
          : `<span class="ob-warn">${t('not logged in')}</span>`
        }`;
        const actions = document.createElement('div'); actions.className = 'agent-actions';
        if (!info.installed && b.installCmd) {
          const instBtn = document.createElement('button'); instBtn.className = 'agent-btn primary'; instBtn.textContent = t('Install');
          instBtn.title = b.installCmd + (selectedHost ? ` — ${t('runs on the selected remote host')}` : '');
          instBtn.onclick = () => run(b.installCmd);
          actions.appendChild(instBtn);
        }
        if (info.installed && !info.loggedIn) {
          const loginBtn = document.createElement('button'); loginBtn.className = 'agent-btn primary'; loginBtn.textContent = t('Log in');
          loginBtn.title = selectedHost ? t('Logs in ON the selected remote host (its own login, not VibeSpace)') : '';
          loginBtn.onclick = () => run(selectedHost && b.remoteLoginCmd ? b.remoteLoginCmd : b.loginCmd);
          actions.appendChild(loginBtn);
        }
        if (info.installed) {
          const updBtn = document.createElement('button'); updBtn.className = 'agent-btn'; updBtn.textContent = t('Update');
          updBtn.title = b.updateCmd;
          updBtn.onclick = () => run(b.updateCmd);
          actions.appendChild(updBtn);
        }
        if (stale()) return;
        row.append(left, actions);
        body.appendChild(row);
        // Account roster for THIS backend, right under its status row.
        if (b.key === 'claude') { try { await this._renderClaudeAccounts(actx); } catch {} }
        else if (b.key === 'codex') { try { await this._renderCodexAccounts(actx); } catch {} }
        if (stale()) return;
      }
      // ── VibeSpace integration (task context hook) — local machine only.
      // Auto-installed at server start; this row makes the state VISIBLE and
      // repairable for non-engineers (auto-install can fail silently if e.g.
      // the CLI's settings file doesn't exist yet).
      if (!selectedHost) {
        let hs = null;
        try { hs = await fetchJson('/api/agent-hooks'); } catch {}
        if (stale()) return;
        if (hs) {
          const row = document.createElement('div'); row.className = 'ob-backend';
          const left = document.createElement('div');
          const stateOf = (k, label) => {
            const st = hs[k] || {};
            if (st.installed) return `<span class="ob-ok">✓ ${label}</span>`;
            if (st.stale) return `<span class="ob-warn">${t('{label}: needs update', { label })}</span>`;
            if (st.parseError) return `<span class="ob-bad">${t('{label}: config unreadable', { label })}</span>`;
            if (!st.fileExists) return `<span class="ob-warn">${t('{label}: run the CLI once first', { label })}</span>`;
            return `<span class="ob-warn">${t('{label}: not installed', { label })}</span>`;
          };
          const allGood = hs.claude?.installed && hs.codex?.installed;
          if (hs.integrationOff) {
            // Master switch (Settings → Integration) outranks this row — the
            // install route refuses and boot strips, so offer no buttons.
            left.innerHTML = `<b>${t('VibeSpace integration')}</b><div><span class="ob-warn">${t('Disabled — master switch is off (Settings → Integration)')}</span></div>`
              + `<div class="agents-note">${t('Sessions run the pristine CLI: no hooks, no injected context, no agent tools. Re-enable it in Settings to restore Task Group context.')}</div>`;
            row.append(left);
            body.appendChild(row);
          } else {
            left.innerHTML = `<b>${t('VibeSpace integration')}</b><div>${stateOf('claude', 'Claude')} &nbsp; ${stateOf('codex', 'Codex')}</div>`
              + `<div class="agents-note">${t("Lets sessions in a Task Group automatically receive the group's context (objective, shared files).")}</div>`;
            const actions = document.createElement('div'); actions.className = 'agent-actions';
            const installBtn = document.createElement('button');
            installBtn.className = 'agent-btn' + (allGood ? '' : ' primary');
            installBtn.textContent = allGood ? t('Reinstall') : t('Install');
            installBtn.onclick = async () => {
              installBtn.disabled = true;
              try {
                const r = await fetchJson('/api/agent-hooks/install', { method: 'POST' });
                const errs = Object.entries(r?.results || {}).filter(([, v]) => !v.ok);
                if (errs.length) showToast(errs.map(([k, v]) => `${k}: ${v.error}`).join('; '), { type: 'error' });
                else showToast(t('Task Group context hook installed'));
              } catch { showToast(t('Install failed'), { type: 'error' }); }
              refresh();
            };
            actions.appendChild(installBtn);
            if (hs.claude?.installed || hs.codex?.installed || hs.claude?.stale || hs.codex?.stale) {
              const rmBtn = document.createElement('button'); rmBtn.className = 'agent-btn'; rmBtn.textContent = t('Remove');
              rmBtn.title = t('Unregister the hook from both CLIs (sessions stop receiving Task Group context)');
              rmBtn.onclick = async () => {
                rmBtn.disabled = true;
                try { await fetchJson('/api/agent-hooks/uninstall', { method: 'POST' }); showToast(t('Hook removed')); } catch {}
                refresh();
              };
              actions.appendChild(rmBtn);
            }
            row.append(left, actions);
            body.appendChild(row);
          }
        }
      } else {
        // ── VibeSpace integration ON THE HOST (2.129.0, backlog B-34bb):
        // remote sessions drop tools + a hook + keeper files under
        // ~/.vibespace there (per-spawn, silently — a user was rightly
        // startled finding them). This row makes that footprint VISIBLE:
        // per-tool freshness vs the local copies, remote hook registration,
        // keeper session files — with explicit Install/refresh + Remove.
        let rs = null;
        try { rs = await fetchJson(`/api/hosts/${encodeURIComponent(selectedHost)}/agent-tools`); } catch {}
        if (stale()) return;
        if (rs && rs.tools) {
          const hostName = hostSel.options[hostSel.selectedIndex]?.textContent?.split(' (')[0] || t('remote host');
          const row = document.createElement('div'); row.className = 'ob-backend';
          const left = document.createElement('div');
          const names = Object.keys(rs.tools);
          const presentN = names.filter(n => rs.tools[n].present).length;
          const outdatedN = names.filter(n => rs.tools[n].present && !rs.tools[n].current).length;
          const perTool = names.map(n => `${rs.tools[n].present ? (rs.tools[n].current ? '✓' : '≠') : '✗'} ${n}`).join('\n');
          let toolsHtml;
          if (!presentN) toolsHtml = `<span class="ob-warn">${t('tools: not installed')}</span>`;
          else if (presentN < names.length || outdatedN) toolsHtml = `<span class="ob-warn">${t('tools: {n}/{total} present, {stale} outdated', { n: presentN, total: names.length, stale: outdatedN })}</span>`;
          else toolsHtml = `<span class="ob-ok">✓ ${t('{n} tools current', { n: presentN })}</span>`;
          const hookHtml = ['claude', 'codex'].map((k) => rs.hooks?.[k]
            ? `<span class="ob-ok">✓ ${k === 'claude' ? 'Claude' : 'Codex'} ${t('hook')}</span>`
            : `<span class="ob-warn">${k === 'claude' ? 'Claude' : 'Codex'} ${t('hook')}: ${t('not registered')}</span>`).join(' &nbsp; ');
          const extras = [];
          if (!rs.node) extras.push(`<span class="ob-bad">${t('node missing on the host — agent tools cannot run')}</span>`);
          if (rs.keeperSessions) extras.push(`<span>${t('{n} keeper session file(s)', { n: rs.keeperSessions })}</span>`);
          // Master switch awareness (live-synced settings store, same pattern
          // as the shipSubscriptionToRemote gate): the STATUS still renders —
          // seeing residue from earlier ON spawns is exactly what a pristine
          // verification needs — but the note tells the truth and Install is
          // withheld (the route refuses anyway); Remove stays as the cleanup.
          const masterOff = this.settings?.get?.('agents.vibespaceIntegration') === false;
          const noteHtml = masterOff
            ? `<div><span class="ob-warn">${t('Disabled — master switch is off (Settings → Integration)')}</span></div>`
              + `<div class="agents-note">${t('New remote sessions ship no tools and register no hook. Anything shown above is residue from earlier sessions — inert without the session env; Remove deletes it from the host.')}</div>`
            : `<div class="agents-note">${t('Reporting tools, the Task Group context hook, and the session keeper live under ~/.vibespace on the host. Creating a remote session re-installs them automatically.')}</div>`;
          left.innerHTML = `<b>${t('VibeSpace integration on {host}', { host: escHtml(hostName) })}</b>`
            + `<div title="${escHtml(perTool)}">${toolsHtml} &nbsp; ${hookHtml}${extras.length ? ' &nbsp; ' + extras.join(' &nbsp; ') : ''}</div>`
            + noteHtml;
          const actions = document.createElement('div'); actions.className = 'agent-actions';
          const allGood = presentN === names.length && !outdatedN;
          // Dial devices: install/uninstall ride the SESSION SPAWN channel
          // (deviceAgentSetup ships the tools per spawn) — the tar-over-ssh
          // buttons here are ssh-only, so on a device they'd just error.
          // The status above still works (probes run via the device link).
          if (hostTransport === 'dial') {
            const note = document.createElement('span'); note.className = 'ob-ver';
            note.textContent = t('managed automatically — each session spawn refreshes the tools');
            actions.appendChild(note);
            row.append(left, actions);
            body.appendChild(row);
          } else {
          if (!masterOff) {
            const installBtn = document.createElement('button');
            installBtn.className = 'agent-btn' + (allGood ? '' : ' primary');
            installBtn.textContent = presentN ? t('Reinstall') : t('Install');
            installBtn.onclick = async () => {
              installBtn.disabled = true;
              try {
                const r = await fetchJson(`/api/hosts/${encodeURIComponent(selectedHost)}/agent-tools/install`, { method: 'POST' });
                if (r?.success) showToast(t('Integration installed on {host}', { host: hostName }));
                else showToast(r?.error || t('Install failed'), { type: 'error' });
              } catch { showToast(t('Install failed'), { type: 'error' }); }
              refresh();
            };
            actions.appendChild(installBtn);
          }
          if (presentN) {
            const rmBtn = document.createElement('button'); rmBtn.className = 'agent-btn'; rmBtn.textContent = t('Remove');
            rmBtn.title = t('Unregisters the hook from the host\'s CLIs and deletes the tools. A future remote session on this host re-installs them.');
            rmBtn.onclick = async () => {
              const ok = await showConfirmDialog({
                title: t('Remove VibeSpace integration from {host}?', { host: hostName }),
                message: t("Unregisters the hook from the host's CLIs and deletes the tools under ~/.vibespace/bin. Running remote sessions lose their reporting tools; a future remote session re-installs everything."),
                confirmText: t('Remove'), danger: true,
              });
              if (!ok) return;
              rmBtn.disabled = true;
              try {
                const r = await fetchJson(`/api/hosts/${encodeURIComponent(selectedHost)}/agent-tools/uninstall`, { method: 'POST' });
                if (r?.success) showToast(t('Integration removed from {host}', { host: hostName }));
                else showToast(r?.error || t('Remove failed'), { type: 'error' });
              } catch { showToast(t('Remove failed'), { type: 'error' }); }
              refresh();
            };
            actions.appendChild(rmBtn);
          }
          row.append(left, actions);
          body.appendChild(row);
          } // end non-dial actions
        }
      }
      // ── Agent instructions — ADVANCED, collapsed by default (user request:
      // the expanded form dominated the dialog). Lives right under the
      // VibeSpace integration row it belongs with. Layout: one labelled field
      // per injection surface; each nudge condition is a full sentence with
      // the number input embedded (the two-column flex wrap read broken).
      {
        const adv = document.createElement('details');
        adv.className = 'agents-adv';
        const sum = document.createElement('summary');
        const hasAny = ['agents.injectPreamble', 'agents.perTurnExtra', 'agents.stopNudgeExtra']
          .some((k) => (this.settings.get(k) || '').trim());
        sum.innerHTML = `<b>${t('Agent instructions')}</b><span class="agents-adv-hint">${hasAny ? escHtml(t('customized')) : escHtml(t('advanced — custom text injected into every agent session'))}</span>`;
        adv.appendChild(sum);
        const body2 = document.createElement('div');
        body2.className = 'agents-adv-body';
        const note = document.createElement('div');
        note.className = 'agents-note';
        note.textContent = t('Your custom text rides at the TOP of each VibeSpace injection surface — customize behavior fleet-wide (reply language, reporting habits, house rules). Each surface has its own field and cost profile.');
        body2.appendChild(note);
        const FIELDS = [
          ['agents.injectPreamble', 4000, 4,
            t('Session context (once per session + when edited)'),
            t('e.g. Always reply in Chinese. File a vibespace-ask before starting anything destructive.')],
          ['agents.perTurnExtra', 500, 2,
            t('Per-turn reminder (EVERY prompt — keep it short, costs tokens each turn)'),
            t('e.g. Prefer minimal diffs; never commit without asking.')],
          ['agents.stopNudgeExtra', 500, 2,
            t('Stop nudge (when the end-of-turn bookkeeping reminder fires)'),
            t('e.g. Also update the shared context folder if you learned something reusable.')],
        ];
        const tas = [];
        for (const [key, cap, rows, label, ph] of FIELDS) {
          const field = document.createElement('div');
          field.className = 'agents-field';
          const lab = document.createElement('label');
          lab.className = 'agents-field-label';
          lab.textContent = label;
          const ta = document.createElement('textarea');
          ta.className = 'settings-json';
          ta.rows = rows;
          ta.maxLength = cap;
          ta.placeholder = ph;
          ta.value = this.settings.get(key) || '';
          tas.push([key, ta]);
          field.append(lab, ta);
          body2.appendChild(field);
        }
        // Stop-nudge firing conditions — one full sentence per line, the
        // number input embedded where {n} sits in the translation.
        const numInputs = [];
        const condWrap = document.createElement('div');
        condWrap.className = 'agents-field';
        const condLab = document.createElement('label');
        condLab.className = 'agents-field-label';
        condLab.textContent = t('Stop nudge conditions');
        condWrap.appendChild(condLab);
        for (const [key, label, tip] of [
          // t() WITHOUT params keeps the literal {n} — it marks where the
          // number input embeds into the translated sentence.
          ['agents.stopNudgeStaleMinutes', t('fire after {n} min without a status update'), t('The nudge only fires when the session has not updated its board status for this long.')],
          ['agents.stopNudgeCooldownMinutes', t('at most once per {n} min per session'), t('After nudging a session once, wait at least this long before nudging it again.')],
        ]) {
          const line = document.createElement('label');
          line.className = 'agents-cond';
          line.title = tip;
          const inp = document.createElement('input');
          inp.type = 'number';
          inp.className = 'settings-input-text agents-cond-num';
          const schema = { 'agents.stopNudgeStaleMinutes': [1, 240, 10], 'agents.stopNudgeCooldownMinutes': [2, 720, 30] }[key];
          inp.min = schema[0]; inp.max = schema[1];
          inp.value = this.settings.get(key) ?? schema[2];
          numInputs.push([key, inp, schema]);
          const [before, after] = label.includes('{n}') ? label.split('{n}') : [label + ' ', ''];
          line.append(document.createTextNode(before), inp, document.createTextNode(after));
          condWrap.appendChild(line);
        }
        body2.appendChild(condWrap);
        const btnRow = document.createElement('div');
        btnRow.className = 'agents-adv-actions';
        const save = document.createElement('button');
        save.className = 'agent-btn'; save.textContent = t('Save');
        save.onclick = () => {
          for (const [key, ta] of tas) this.settings.set(key, ta.value.trim());
          for (const [key, inp, [mn, mx, dft]] of numInputs) {
            const v = Math.min(mx, Math.max(mn, Number(inp.value) || dft));
            inp.value = v;
            this.settings.set(key, v);
          }
          showToast(t('Saved — new/updated sessions receive it on their next turn'));
        };
        btnRow.appendChild(save);
        body2.appendChild(btnRow);
        adv.appendChild(body2);
        body.appendChild(adv);
      }

      const foot = document.createElement('div');
      foot.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;';
      const note = document.createElement('p'); note.className = 'agents-note';
      note.textContent = t('Actions open in a terminal window so you can see exactly what runs.');
      const recheck = document.createElement('button'); recheck.className = 'agent-btn'; recheck.textContent = t('Re-check');
      recheck.onclick = refresh;
      foot.append(note, recheck);
      body.appendChild(foot);
    };
    // Latest surface wins; the watcher checks isConnected so a stale hook
    // (panel rebuilt / modal closed) reports false and triggers a reopen.
    // An explicit hostId forces the closure's machine selection — refresh()
    // renders the CLOSURE var, so pref alone would leave the surface on
    // whatever the dropdown last showed (review-confirmed).
    this._agentsRefreshHook = (hostId) => {
      if (!body.isConnected) return false;
      if (hostId !== undefined && hostId !== selectedHost) selectedHost = hostId;
      refresh();
      return true;
    };
    refresh();
  },

  // ── Anthropic accounts roster (rendered UNDER Claude Code in Manage
  // Agents). Extracted from _showAgentsDialog so accounts sit beside their
  // CLI. ctx carries the dialog closures the block already used.
  async _renderClaudeAccounts(ctx) {
    const { body, selectedHost, hostSel, done, run, refresh } = ctx;
    const ctxRacct = ctx.racct;
    // ── Anthropic accounts (billing identity) — ONE unified roster whose
    // meaning is machine-scoped ONLY on the first row: the peer "CLI login"
    // row is the SELECTED machine's own global login (pick a remote host →
    // that host's login, with a clearly-labeled "Log in on <host>…" action).
    // Every NAMED account below is stored by VibeSpace (machine-independent)
    // and ships to whichever machine a session spawns on. This split is what
    // answers "if I pick AIDev, where does a login land?" — the peer row's
    // login lands ON AIDev; the Add… buttons always land in VibeSpace.
    let acct = null;
    try { acct = await fetchJson('/api/accounts'); } catch {}
    if (!acct) return;
    // Prime per-account usage so the rows show current quota on open (the
    // 30s poll also keeps it fresh). Best-effort — rows render regardless.
    try { const u = await fetchJson('/api/usage'); if (u) { this._accountUsage = u.accounts || {}; this._hostOwnUsage = u.hosts || {}; this._usageGlobalIdent = u.globalLogin || null; if (u.rateLimit) this._rateLimit = u.rateLimit; } } catch {}
    // Remote host selected → its login state was probed once in refresh()
    // (shared with the codex roster — 2.188.0).
    const racct = ctxRacct;
    const hostLabel = selectedHost ? (hostSel.options[hostSel.selectedIndex]?.textContent?.split(' (')[0] || t('remote host')) : null;
    const accts = await this.refreshAccounts(); // keep app cache in sync
    const claudeAccts = (accts.accounts || []).filter(x => (x.backend || 'claude') === 'claude');
    // §ban-safety: on a REMOTE host a subscription can't run unless the opt-in
    // is set (its creds would ship to the host's — likely datacenter — IP). Its
    // rows render disabled with guidance; API keys are unaffected.
    const allowSubRemote = !!this.settings?.get?.('accounts.shipSubscriptionToRemote');
    const subBlocked = !!selectedHost && !allowSubRemote;
    // Roster card: header row (title + one Add menu) over the list — stacked,
    // never a side column (the side column is what crushed narrow widths)
    const row = document.createElement('div'); row.className = 'ob-backend acct-section acct-roster';
    const left = document.createElement('div');
    left.style.flex = '1';
    const sub = acct.subscription || {};
    // SVG icons (no emoji) — crown for a subscription, key for an API key,
    // star for the default toggle, pencil for rename, ✕ for remove.
    const svg = (d, sw = 1.4) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    const CROWN = svg('<path d="M2.5 12.5h11M3 12.5L2 4.5l3.2 2.6L8 3l2.8 4.1L14 4.5l-1 8z"/>');
    const GLOBE = svg('<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 2-2 10 0 12M8 2c2 2 2 10 0 12"/>');
    const KEY = svg('<circle cx="5" cy="9" r="2.6"/><path d="M7.4 8.2 14 3M11.5 5.2l1.6 1.6M13 3.7l1.6 1.6"/>', 1.5);
    const STAR_F = svg('<path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .8 4.3L8 11.6 4.1 13.6l.8-4.3-3.1-3 4.3-.6z" fill="currentColor"/>');
    const STAR_O = svg('<path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .8 4.3L8 11.6 4.1 13.6l.8-4.3-3.1-3 4.3-.6z"/>');
    // Compact per-account usage readout — shared with the Codex roster.
    const usageHtml = (u) => this._acctUsageHtml(u);
    // Peer row: the SELECTED MACHINE's own global login. It's the default
    // whenever no named account is starred (a session with no account uses
    // the login of whatever machine it runs on). Not renamable/removable.
    const gDef = !accts.defaultAccountId;
    const importedTails = new Set(claudeAccts.map(a => a.tail));
    let gName, gIdent, gExtraActions = '';
    if (selectedHost) {
      gName = t('CLI login on {host}', { host: escHtml(hostLabel) });
      // Every working auth shape reads as LOGGED IN (2.188.0 — an
      // apiKeyHelper host said "logged in (apiKeyHelper)" in the backend row
      // above and "not logged in" here, in the same dialog; a console key got
      // a warning tone for what is a working API-key auth). Email shown when
      // the host's config reports one.
      // identity preference: roles-derived orgEmail baked by the host quota ⟳
      // (live, tied to the actual token) beats the host's config-file email
      // (goes stale after a /login switch — the 2.114.1 mixup class) — BUT
      // only while the cache POSTDATES the last login the watcher saw land
      // on this host (2.195.0, real report): after an on-host /login switch
      // the cached orgEmail is a snapshot of the OLD token and kept winning
      // for hours. Anchor = the LOCAL _hostLoginSeenAt stamp, deliberately
      // NOT the creds-file mtime — the CLI rotates .credentials.json on its
      // own token refresh and remote clocks skew, so an mtime comparison
      // re-armed the warning forever on any active host (review-confirmed).
      // Trade: a login done OUTSIDE VibeSpace isn't detected — the ⟳ on the
      // row is the manual confirm for that case.
      const hu = this._hostOwnUsage?.[selectedHost];
      const loginAt = this._hostLoginSeenAt?.[selectedHost] || 0;
      const cacheFresh = hu?.orgEmail && (hu.fetchedAt || 0) > loginAt;
      const hEmailV = (cacheFresh ? hu.orgEmail : null) || racct?.subscription?.email;
      const hEmail = hEmailV ? escHtml(hEmailV) + ' · ' : '';
      const identStale = !!(hu?.orgEmail && loginAt && (hu.fetchedAt || 0) <= loginAt);
      const staleNote = identStale
        ? ` <span class="ob-warn" title="${escHtml(t('The login on this machine changed after the last identity/quota refresh — the cached account info may belong to the previous login. Press ⟳ to confirm.'))}">⚠ ${t('login changed — ⟳ to confirm')}</span>` : '';
      // NOT a preference ladder for the helper (2.191.0): the CLI prefers a
      // configured apiKeyHelper OVER OAuth, so when both exist the row must
      // show the helper as the effective billing, not hide it behind
      // "logged in" (CW-H200: fresh OAuth + leftover helper = API billing).
      const helperNote = racct?.keyHelper && racct?.subscription?.loggedIn
        ? ` <span class="ob-warn" title="${escHtml(t('The CLI prefers a configured apiKeyHelper over the OAuth login — sessions on this machine bill via the helper key. Remove apiKeyHelper from ~/.claude/settings.json to bill the subscription.'))}">⚠ ${t('apiKeyHelper overrides this login')}</span>` : '';
      gIdent = racct && !racct.error
        ? (racct.subscription?.loggedIn
            ? `${hEmail}<span class="ob-ok">${t('logged in')}</span>${helperNote}${staleNote}`
            : racct.cliKey?.present
            ? `<span class="ob-ok">${t('logged in')}</span> <span class="ob-ver">${t('API key')} …${escHtml(racct.cliKey.tail || '')}</span>`
            : racct.keyHelper
            ? `<span class="ob-ok">${t('logged in')}</span> <span class="ob-ver">apiKeyHelper</span>`
            : `<span class="ob-warn">${t('not logged in')}</span>`)
        : `<span class="ob-warn">${t('unreachable')}</span>`;
      gExtraActions = `<button class="agent-btn acct-host-refresh" title="${t('Confirm identity + quota of {host}’s own login (one on-demand read of its token — never scheduled)', { host: escHtml(hostLabel) })}">⟳</button>`
        + `<button class="agent-btn acct-host-login" title="${t('Opens a terminal ON {host} — this login lands on that machine, not in VibeSpace', { host: escHtml(hostLabel) })}">${t('Log in on {host}…', { host: escHtml(hostLabel) })}</button>`
        + (racct?.cliKey?.present && !importedTails.has(racct.cliKey.tail)
            ? `<button class="agent-btn acct-host-import" title="${t('Copy the Console key found on {host} (…{tail}) into VibeSpace so any machine can use it', { host: escHtml(hostLabel), tail: escHtml(racct.cliKey.tail) })}">${t('Import its key')}</button>` : '');
    } else {
      gName = t('CLI login');
      // Prefer the token-derived identity (actualEmail, baked by the quota ⟳
      // roles fetch) over the config-file email — the config goes STALE after
      // a /login switch (the 2.114.1 mixup; the usage popup already prefers
      // it, this dialog didn't — 2.188.0).
      const gEmail = this._usageGlobalIdent?.actualEmail || sub.email;
      gIdent = sub.loggedIn
        ? escHtml((gEmail || '') + (sub.plan ? (gEmail ? ' · ' : '') + sub.plan : '')) || t('logged in')
        : `<span class="ob-warn">${acct.cliKey?.present ? t('not logged in (a Console login replaced it)') : t('not logged in')}</span>`;
      // The machine's login may BE one of the named accounts (same email) —
      // say so, since their rows then show the same (merged) usage.
      const linkedSub = sub.loggedIn && gEmail
        ? claudeAccts.find(a => a.type === 'subscription' && a.email && a.email.toLowerCase() === String(gEmail).toLowerCase())
        : null;
      if (linkedSub) gIdent += ` <span class="acct-linked-hint" title="${escHtml(t('The machine login and this VibeSpace account are the same Anthropic account — usage is shown merged'))}">${t('= “{name}”', { name: escHtml(linkedSub.name) })}</span>`;
    }
    const globalRow = `<div class="acct-key-row${gDef ? ' is-default' : ''}" data-id="__global__">
      <span class="acct-type-icon" title="${selectedHost ? t("This machine's own login — lives on {host}, not in VibeSpace", { host: escHtml(hostLabel) }) : t('The CLI’s own global login on this machine')}">${GLOBE}</span>
      <span class="acct-key-main"><span class="acct-key-name">${gName}</span><span class="acct-key-tail">${gIdent}</span></span>
      <span class="acct-usage-cell">${!selectedHost && sub.loggedIn ? usageHtml(this._rateLimit)
        : (selectedHost && this._hostOwnUsage?.[selectedHost]?.fiveHour ? usageHtml(this._hostOwnUsage[selectedHost]) : '')}</span>
      <span class="acct-key-actions">
        <button class="acct-icon acct-def ${gDef ? 'on' : ''}" title="${gDef ? t('Default for new sessions — pick another to change') : t('Set as default for new sessions')}">${gDef ? STAR_F : STAR_O}</button>${gExtraActions}
      </span></div>`;
    // The selected host's own login identity (live probe, ⟳-cache fallback) —
    // a named subscription with the SAME email IS that login: it must not
    // read "this machine only" (real report: user logged the very account in
    // ON the machine and the roster still called it unusable). Picking a
    // linked account for a session on that host runs on the host's own login
    // (server maps it since 2.198.0 — zero creds ship).
    const hostOwnEmail = selectedHost
      ? String(racct?.subscription?.email || this._hostOwnUsage?.[selectedHost]?.orgEmail || '').trim().toLowerCase() : '';
    const acctEmailOf = (a) => String(this._accountUsage?.[a.id]?.orgEmail || a.email || (String(a.name || '').includes('@') ? a.name : '')).trim().toLowerCase();
    // Host-side per-account logins (2.199.0): ids with a live creds dir on
    // the selected host (~/.vibespace/subs/<id>) — usable there directly.
    const hostSubIds = selectedHost ? (racct?.hostSubs || []) : [];
    this._hostSubsKnown = { ...(this._hostSubsKnown || {}), ...(selectedHost ? { [selectedHost]: hostSubIds } : {}) };
    const keyLines = claudeAccts.map(a => {
      const isDef = accts.defaultAccountId === a.id;
      const isSub = a.type === 'subscription';
      const linked = isSub && subBlocked && !!hostOwnEmail && acctEmailOf(a) === hostOwnEmail;
      const hostSub = isSub && subBlocked && !linked && hostSubIds.includes(a.id);
      const blocked = isSub && subBlocked && !linked && !hostSub; // subscription on a remote host, opt-in off
      // token-derived orgEmail (per-account ⟳ roles bake) beats the creds
      // dir's config email — same staleness class as the global row (2.188.0)
      const aEmail = this._accountUsage?.[a.id]?.orgEmail || a.email;
      let ident = isSub
        ? (a.loggedIn ? escHtml((aEmail || '') + (a.subscriptionType ? (aEmail ? ' · ' : '') + a.subscriptionType : '')) || t('logged in')
                      : `<span class="ob-warn">${t('not logged in')}</span>`)
        : `API …${escHtml(a.tail || '')}`;
      // Some login flows leave the creds dir without an identity file — the
      // email is then unknowable from disk, which breaks same-account detection
      // vs the machine login (merged usage). Let the user declare/fix it.
      const hint = linked
        ? ` <span class="acct-linked-hint" title="${t('Same account as {host}’s current CLI login — sessions on {host} picking it run on the host’s own login directly (nothing is shipped).', { host: escHtml(hostLabel) })}">${t('· = {host}’s own login', { host: escHtml(hostLabel) })}</span>`
        : hostSub
        ? ` <span class="acct-linked-hint" title="${t('This account holds its own login ON {host} (minted there, never leaves it) — sessions on {host} picking it use that login.', { host: escHtml(hostLabel) })}">${t('· logged in on {host}', { host: escHtml(hostLabel) })}</span>`
        : blocked ? ` <span class="acct-blocked-hint" title="${t('Runs on this machine only. For {host}: use “Log in on {host} as this account…” in the ⋯ menu (a per-account login held on the host), or enable Settings → “Ship subscription logins to remote hosts.”', { host: escHtml(hostLabel) })}">${t('· this machine only')}</span>` : '';
      const iconTitle = isSub ? t('Subscription (Pro/Max) — runs on this machine (or a host you log into)') : t('API key — stored in VibeSpace, runs on any machine');
      // Redesign (2.178.0): rows carry ONLY the star + a ⋯ menu — Test/Rename/
      // email/Remove live in the menu (four inline buttons crushed every row,
      // modal AND panel; real screenshot report). Star stays direct: most-used.
      return `<div class="acct-key-row${isDef ? ' is-default' : ''}${blocked ? ' acct-row-blocked' : ''}" data-id="${escHtml(a.id)}" data-sub="${isSub ? '1' : ''}"${blocked ? ' data-blocked="1"' : ''}>
        <span class="acct-type-icon" title="${iconTitle}">${isSub ? CROWN : KEY}</span>
        <span class="acct-key-main"><span class="acct-key-name">${escHtml(a.name)}</span><span class="acct-key-tail">${ident}${hint}</span></span>
        <span class="acct-usage-cell">${isSub && a.loggedIn ? usageHtml(this._accountUsage?.[a.id]) : ''}</span>
        <span class="acct-key-actions">
          <button class="acct-icon acct-def ${isDef ? 'on' : ''}" title="${isDef ? t('Default for new sessions — click to clear') : t('Set as default for new sessions')}">${isDef ? STAR_F : STAR_O}</button>
          <button class="acct-icon acct-menu" title="${t('More actions')}">${svg('<circle cx="3" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="13" cy="8" r="1.3" fill="currentColor" stroke="none"/>')}</button>
        </span></div>`;
    }).join('');
    const note = selectedHost
      ? t("The “CLI login” row is {host}'s own login (lives on that machine). API-key accounts below ship to {host} per session; subscription accounts run on THIS machine only — for {host}, use “Log in on host…”, or enable Settings → “Ship subscription logins to remote hosts.”", { host: escHtml(hostLabel) })
      : t('Each session can pick its account (New Session dialog / card ⚙). Subscriptions bill your Pro/Max plan; API keys bill pay-per-use. The starred account is the default when a session doesn’t pick one.');
    left.innerHTML = `<div class="acct-list">${globalRow}${keyLines}</div>
      <div class="agents-note">${note}</div>`;
    // Redesign (2.178.0): the four Add… buttons collapse into ONE menu on the
    // roster header — they wrapped into a vertical CJK pile when narrow and
    // dominated the card even in the modal.
    const addApiKey = async () => {
      const key = await showInputDialog({ title: t('Add API key'), label: t('Anthropic API key (from console.anthropic.com)'), placeholder: 'sk-ant-…', confirmText: t('Save') });
      if (!key || !key.trim()) return;
      const name = await showInputDialog({ title: t('Name this account'), label: t('Shown in account pickers'), placeholder: t('e.g. Company API'), confirmText: t('Save') });
      try {
        const r = await fetchJson('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key.trim(), name: (name || '').trim() }) });
        if (r?.account) showToast(t('Saved: {name} — use Test once to approve the CLI’s trust prompt', { name: r.account.name }));
        else showToast(r?.error || t('Save failed'), { type: 'error' });
      } catch { showToast(t('Save failed'), { type: 'error' }); }
      refresh();
    };
    const head = document.createElement('div'); head.className = 'acct-roster-head';
    const title = document.createElement('b'); title.textContent = t('Anthropic accounts');
    const needsSetup = !selectedHost && (!sub.loggedIn || !claudeAccts.length);
    const importable = !selectedHost && acct.cliKey?.present && !acct.cliKey.imported;
    const addAcctBtn = document.createElement('button');
    addAcctBtn.className = 'agent-btn acct-add' + ((needsSetup || importable) ? ' primary' : '');
    addAcctBtn.textContent = '+ ' + t('Add account…');
    addAcctBtn.onclick = () => {
      const r = addAcctBtn.getBoundingClientRect();
      const items = [];
      if (!selectedHost) {
        items.push({ label: t('Set up both…'), action: () => { done(); this._showAccountsWizard(); } });
        if (importable) items.push({
          label: t('Import CLI key') + ` (…${acct.cliKey.tail || ''})`,
          action: async () => {
            try { const r2 = await fetchJson('/api/accounts/import-cli', { method: 'POST' }); showToast(t('Imported: {name}', { name: r2.account.name })); } catch { showToast(t('Import failed'), { type: 'error' }); }
            refresh();
          },
        });
        items.push({ separator: true });
      }
      // These add to VibeSpace's store (machine-independent). With a MACHINE
      // selected, the subscription login runs ON that machine (per-host creds
      // dir) — the old always-local terminal was a trap: the dialog said the
      // host, the login quietly landed in the local store (real report).
      items.push(
        selectedHost
          ? { label: t('Add subscription (log in on {host})…', { host: hostLabel }), action: () => { done(); this._addSubscription(selectedHost, hostLabel); } }
          : { label: t('Add subscription…'), action: () => { done(); this._addSubscription(); } },
        { label: t('Add Console account…'), action: () => { done(); this._addConsoleAccount(); } },
        { label: t('Add API key…'), action: addApiKey },
      );
      showContextMenu(r.left, r.bottom + 4, items);
    };
    head.append(title, addAcctBtn);
    if (ctx.stale?.()) return; // a newer refresh took over mid-await
    row.append(head, left);
    body.appendChild(row);
    // Per-key row actions (event delegation on the section)
    left.onclick = async (e) => {
      const keyRow = e.target.closest?.('.acct-key-row');
      if (!keyRow) return;
      const id = keyRow.dataset.id;
      // The peer CLI-login row: default star + (host) login/import actions.
      if (id === '__global__') {
        if (e.target.closest('.acct-host-login')) {
          // Runs ON the selected host (run() targets it) — lands in the
          // host's own ~/.claude, NOT in VibeSpace's store. That REPLACES
          // the machine's current login, which read too much like "add
          // account" (real report: user expected an add, got the machine
          // login swapped) — confirm with the semantics spelled out, and
          // save a not-yet-imported Console key on the host into VibeSpace
          // FIRST so the swap can't orphan it. The watcher then polls the
          // host's login state (read-only ssh probe) and brings the Agents
          // surface back on THIS machine once the login lands.
          const hasKey = racct?.cliKey?.present && !importedTails.has(racct.cliKey.tail);
          const okGo = await showConfirmDialog({
            title: t('Switch {host}’s own login?', { host: hostLabel }),
            message: t('This opens claude /login ON {host} and REPLACES that machine’s current CLI login. VibeSpace’s named accounts are untouched — to add a switchable account instead, use “+ Add account…”.', { host: hostLabel })
              + (hasKey ? ' ' + t('The Console API key currently on it (…{tail}) will be imported into VibeSpace first so it isn’t lost.', { tail: racct.cliKey.tail }) : ''),
            confirmText: t('Open login terminal'),
          });
          if (!okGo) return;
          if (hasKey) {
            try {
              const r = await fetchJson('/api/accounts/import-cli-host', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostId: selectedHost }) });
              if (r?.account) showToast(t('Imported: {name}', { name: r.account.name }));
            } catch { /* best-effort — the dialog already told the user */ }
          }
          this._watchHostLogin(selectedHost, hostLabel);
          run('claude /login');
        } else if (e.target.closest('.acct-host-refresh')) {
          const btn = e.target.closest('.acct-host-refresh');
          btn.disabled = true; btn.textContent = '…';
          try {
            const r = await fetchJson('/api/usage/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: selectedHost }) });
            if (r?.error) showToast(r.error, { type: 'error', duration: 6000 });
            else if (r?.throttled) showToast(t('Refreshed less than a minute ago — try again shortly'), { type: 'error' });
          } catch { showToast(t('Refresh failed'), { type: 'error' }); }
          refresh();
        } else if (e.target.closest('.acct-host-import')) {
          try {
            const r = await fetchJson('/api/accounts/import-cli-host', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostId: selectedHost }) });
            if (r?.account) showToast(t('Imported: {name}', { name: r.account.name })); else showToast(r?.error || t('Import failed'), { type: 'error' });
          } catch { showToast(t('Import failed'), { type: 'error' }); }
          refresh();
        } else if (e.target.closest('.acct-def')) {
          try { await fetchJson('/api/accounts/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: null }) }); } catch {}
          refresh();
        }
        return;
      }
      const a = claudeAccts.find(x => x.id === id);
      const isSub = a?.type === 'subscription';
      const doTest = () => {
        // A not-logged-in subscription can't spawn — the server would
        // reject the create and leave a blank window. Guard it here.
        if (isSub && !a.loggedIn) {
          showToast(t('This subscription isn’t signed in yet — use “Add subscription…” to finish the login first.'), { type: 'error' });
          return;
        }
        // §ban-safety: a subscription can't run on a remote host by default.
        // Explain instead of firing a create the server will reject.
        if (keyRow.dataset.blocked) {
          showToast(t('“{name}” runs on this machine only. For {host}, use “Log in on host…” on the CLI-login row, or turn on Settings → “Ship subscription logins to remote hosts.”', { name: a?.name, host: escHtml(hostLabel) }) + ' ' + t('Already logged in as this account ON {host}? Then pick “CLI login @ {host}” when switching the session’s billing — that uses the host’s own login.', { host: escHtml(hostLabel) }), { type: 'error', duration: 8000 });
          return;
        }
        done();
        // Diagnostic session — ephemeral (closing its window terminates it).
        // With a remote host selected it runs ON that host (creds ship to it).
        this.createSession({ backend: 'claude', mode: 'terminal', cwd: '', accountId: id, ephemeral: true, hostId: selectedHost || undefined });
      };
      const doEmail = async () => {
        const email = await showInputDialog({
          title: t('Account email'),
          label: t('Email of this Anthropic account. Used to recognize when it is the same account as a machine login (their usage then shows merged).'),
          value: a?.email || '', placeholder: 'you@example.com', confirmText: t('Save'),
        });
        if (email != null) {
          try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) }); } catch {}
          refresh();
        }
      };
      const doRename = async () => {
        const name = await showInputDialog({ title: t('Rename account'), label: t('Account name'), value: a?.name || '', confirmText: t('Save') });
        if (name && name.trim() && name.trim() !== a?.name) {
          try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) }); } catch {}
          refresh();
        }
      };
      const doDelete = async () => {
        if (!(await showConfirmDialog({ title: t('Remove account'), message: t('Remove "{name}" from VibeSpace? Sessions already running keep working; the key itself stays valid.', { name: a?.name }) }))) return;
        try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch {}
        refresh();
      };
      if (e.target.closest('.acct-def')) {
        const isDef = accts.defaultAccountId === id;
        // Default is GLOBAL — starring a "this machine only" subscription
        // while a host is selected read as "I switched the remote's account"
        // when it actually set a default that host can never use (2.188.0)
        if (keyRow.dataset.blocked && !isDef) {
          showToast(t('The default is global, and “{name}” can’t run on {host} — new sessions there keep using its own login.', { name: a?.name, host: escHtml(hostLabel) }) + ' ' + t('Already logged in as this account ON {host}? Then pick “CLI login @ {host}” when switching the session’s billing — that uses the host’s own login.', { host: escHtml(hostLabel) }), { type: 'error', duration: 8000 });
          return;
        }
        try { await fetchJson('/api/accounts/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: isDef ? null : id }) }); } catch {}
        refresh();
      } else if (e.target.closest('.acct-menu')) {
        // Redesign (2.178.0): Test/Rename/email/Remove live behind ⋯
        const r = e.target.closest('.acct-menu').getBoundingClientRect();
        const items = [
          { label: t('Test'), action: doTest },
          { label: t('Rename account'), action: doRename },
        ];
        // Per-account login held ON the host (2.199.0): mint this account's
        // own creds dir on the selected machine via an on-host interactive
        // login (~/.vibespace/subs/<id> — the token is born there and never
        // leaves; §ban-safety-clean, unlike shipping). Coexists with the
        // machine's global login. Once it lands, sessions on that host can
        // pick this account directly.
        if (isSub && selectedHost && keyRow.dataset.blocked) {
          items.splice(1, 0, { label: t('Log in on {host} as this account…', { host: hostLabel }), action: () => {
            const dir = `$HOME/.vibespace/subs/${id}`; // id shape sub-<hex>, metachar-free
            this._watchHostLogin(selectedHost, hostLabel);
            run(`mkdir -p "${dir}" && CLAUDE_CONFIG_DIR="${dir}" CLAUDE_SECURESTORAGE_CONFIG_DIR="${dir}" claude /login`);
            showToast(t('Sign in as “{name}” in the terminal — this login lives ON {host} only; the machine’s own login is untouched.', { name: a?.name, host: hostLabel }), { duration: 7000 });
          } });
        }
        if (isSub && a.loggedIn && (!a.email || a.emailDeclared)) items.push({ label: a.email ? t('edit email') : t('set email…'), action: doEmail });
        items.push({ separator: true }, { label: t('Remove account'), action: doDelete });
        showContextMenu(r.left, r.bottom + 4, items);
      }
    };
  },
  });
}
