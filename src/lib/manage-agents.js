// Manage-Agents dialog + Anthropic/ChatGPT account rosters (mixin split from app.js, 2.82.0 audit seam). Methods run with the App instance as `this`.
import { t } from './i18n.js';
import { escHtml, fetchJson, showConfirmDialog, showInputDialog, showToast } from './utils.js';

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
  async _addSubscription() {
    const name = await showInputDialog({
      title: t('Add subscription'),
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
    return `<span class="acct-usage">${parts.join('')}<span class="acct-usage-age" title="${age != null ? t('Last refreshed {n} min ago', { n: age }) : ''}">${ageLabel}</span></span>`;
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
    const PENCIL = svg('<path d="M11 2.5 13.5 5 5.5 13H3v-2.5z"/>');
    const row = document.createElement('div'); row.className = 'ob-backend acct-section';
    const left = document.createElement('div'); left.style.flex = '1';
    const gDef = !accts.defaultCodexAccountId;
    const usageHtml = (u) => this._acctUsageHtml(u);
    const cgl = !selectedHost ? (this._usageCodexGlobal || {}) : {};
    const gName = selectedHost ? t('CLI login on {host}', { host: escHtml(hostLabel) }) : t('CLI login');
    let gIdent = gLoggedIn
      ? (selectedHost ? `<span class="ob-ok">${t('logged in')}</span>` : (escHtml(cgl.email || '') || t('logged in')))
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
    const keyLines = codexAccts.map(a => {
      const isDef = accts.defaultCodexAccountId === a.id;
      const blocked = subBlocked;
      let ident = a.loggedIn
        ? escHtml((a.email || '') + (a.subscriptionType ? (a.email ? ' · ' : '') + a.subscriptionType : '')) || t('logged in')
        : `<span class="ob-warn">${t('not logged in')}</span>`;
      // API-key-mode codex logins have no id_token → no email; let the user
      // declare it (enables the same-account link vs the machine login).
      if (a.loggedIn && (!a.email || a.emailDeclared)) {
        ident += ` <button class="acct-set-email" title="${escHtml(t('Declare which ChatGPT account this is — the email links it to the machine login for merged usage'))}">${a.email ? t('edit email') : t('set email…')}</button>`;
      }
      const hint = blocked ? ` <span class="acct-blocked-hint" title="${t('Runs on this machine only. For {host}, log in on the host — or enable Settings → “Ship subscription logins to remote hosts.”', { host: escHtml(hostLabel) })}">${t('· this machine only')}</span>` : '';
      const testTitle = blocked
        ? t('Subscriptions can’t run on {host} by default — log in on the host, or enable the setting', { host: escHtml(hostLabel) })
        : selectedHost
          ? t('Open a terminal session ON {host} billing through this account', { host: escHtml(hostLabel) })
          : t('Open a terminal session on this account');
      return `<div class="acct-key-row${isDef ? ' is-default' : ''}${blocked ? ' acct-row-blocked' : ''}" data-id="${escHtml(a.id)}"${blocked ? ' data-blocked="1"' : ''}>
        <span class="acct-type-icon" title="${t('ChatGPT account — runs on this machine (or a host you log into)')}">${CROWN}</span>
        <span class="acct-key-main"><span class="acct-key-name">${escHtml(a.name)}</span><span class="acct-key-tail">${ident}${hint}</span></span>
        <span class="acct-usage-cell">${a.loggedIn ? usageHtml(this._codexAccountUsage?.[a.id]) : ''}</span>
        <span class="acct-key-actions">
          <button class="acct-icon acct-def ${isDef ? 'on' : ''}" title="${isDef ? t('Default for new sessions — click to clear') : t('Set as default for new sessions')}">${isDef ? STAR_F : STAR_O}</button>
          <button class="acct-icon acct-rename" title="${t('Rename')}">${PENCIL}</button>
          <button class="agent-btn acct-test${blocked ? ' acct-test-blocked' : ''}" title="${testTitle}">${t('Test')}</button>
          <button class="acct-icon acct-del" title="${t('Remove this account from VibeSpace (deletes its stored login)')}">${svg('<path d="M4 4l8 8M12 4l-8 8"/>', 1.6)}</button>
        </span></div>`;
    }).join('');
    const note = selectedHost
      ? t("The “CLI login” row is {host}'s own login (lives on that machine). Named accounts run on THIS machine only — for {host}, use “Log in on host…”, or enable Settings → “Ship subscription logins to remote hosts.”", { host: escHtml(hostLabel) })
      : t('Each Codex session can pick its ChatGPT login (New Session dialog / card ⚙). Held in isolated logins, switchable per session; threads stay shared.');
    left.innerHTML = `<b>${t('ChatGPT / OpenAI accounts')}</b>
      <div class="acct-list">${globalRow}${keyLines}</div>
      <div class="agents-note">${note}</div>`;
    const actions = document.createElement('div'); actions.className = 'agent-actions';
    const addBtn = document.createElement('button'); addBtn.className = 'agent-btn' + (codexAccts.length ? '' : ' primary'); addBtn.textContent = t('Add ChatGPT account…');
    addBtn.title = t('Sign in another ChatGPT account — stored in VibeSpace (not on any one machine), switchable per session');
    addBtn.onclick = () => { done(); this._addCodexSubscription(); };
    actions.appendChild(addBtn);
    if (ctx.stale?.()) return; // a newer refresh took over mid-await
    row.append(left, actions);
    body.appendChild(row);
    left.onclick = async (e) => {
      const keyRow = e.target.closest?.('.acct-key-row');
      if (!keyRow) return;
      const id = keyRow.dataset.id;
      if (id === '__codex_global__') {
        if (e.target.closest('.acct-host-login')) {
          // Runs ON the selected host — lands in ITS ~/.codex, not VibeSpace.
          // --device-auth: a plain `codex login` would open localhost:1455 on
          // the host, unreachable from the user's browser.
          run('codex login --device-auth');
        } else if (e.target.closest('.acct-def')) {
          try { await fetchJson('/api/accounts/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: null, backend: 'codex' }) }); } catch {}
          refresh();
        }
        return;
      }
      const a = codexAccts.find(x => x.id === id);
      if (e.target.closest('.acct-set-email')) {
        const email = await showInputDialog({
          title: t('Account email'),
          label: t('Email of this ChatGPT account. Used to recognize when it is the same account as a machine login (their usage then shows merged).'),
          value: a?.email || '', placeholder: 'you@example.com', confirmText: t('Save'),
        });
        if (email != null) {
          try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) }); } catch {}
          refresh();
        }
      } else if (e.target.closest('.acct-test')) {
        if (!a?.loggedIn) { showToast(t('This account isn’t signed in yet — use “Add ChatGPT account…” to finish the login first.'), { type: 'error' }); return; }
        if (keyRow.dataset.blocked) {
          showToast(t('“{name}” runs on this machine only. For {host}, use “Log in on host…” on the CLI-login row, or turn on Settings → “Ship subscription logins to remote hosts.”', { name: a?.name, host: escHtml(hostLabel) }), { type: 'error', duration: 6000 });
          return;
        }
        done();
        // With a remote host selected the test runs ON that host (auth.json
        // ships to it) — proving the full remote path.
        this.createSession({ backend: 'codex', mode: 'terminal', cwd: '', accountId: id, ephemeral: true, hostId: selectedHost || undefined });
      } else if (e.target.closest('.acct-def')) {
        const isDef = accts.defaultCodexAccountId === id;
        try { await fetchJson('/api/accounts/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: isDef ? null : id, backend: 'codex' }) }); } catch {}
        refresh();
      } else if (e.target.closest('.acct-rename')) {
        const name = await showInputDialog({ title: t('Rename account'), label: t('Account name'), value: a?.name || '', confirmText: t('Save') });
        if (name && name.trim() && name.trim() !== a?.name) {
          try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) }); } catch {}
          refresh();
        }
      } else if (e.target.closest('.acct-del')) {
        if (!(await showConfirmDialog({ title: t('Remove account'), message: t('Remove "{name}" from VibeSpace? Sessions already running keep working.', { name: a?.name }) }))) return;
        try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch {}
        refresh();
      }
    };
  },

  _showAccountsWizard() {
    document.getElementById('acct-wizard-overlay')?.remove();
    if (this._acctWatch) { clearInterval(this._acctWatch); this._acctWatch = null; }
    const overlay = document.createElement('div');
    overlay.id = 'acct-wizard-overlay';
    overlay.className = 'dialog-overlay';
    overlay.style.zIndex = '99998';
    const dialog = document.createElement('div'); dialog.className = 'dialog';
    dialog.innerHTML = `<div class="dialog-header"><h3>${t('Set up both Anthropic accounts')}</h3><button class="dialog-close">✕</button></div>
      <div class="dialog-body acct-wizard-body"><div class="ob-loading">${t('Checking…')}</div></div>`;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const done = () => { overlay.remove(); if (this._acctWatch) { clearInterval(this._acctWatch); this._acctWatch = null; } };
    dialog.querySelector('.dialog-close').onclick = done;
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(); });
    const body = dialog.querySelector('.acct-wizard-body');

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

  _showAgentsDialog() {
    document.getElementById('agents-dialog-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'agents-dialog-overlay';
    overlay.className = 'dialog-overlay';
    overlay.style.zIndex = '99998';
    const dialog = document.createElement('div'); dialog.className = 'dialog agents-dialog';
    const header = document.createElement('div'); header.className = 'dialog-header';
    const h3 = document.createElement('h3'); h3.textContent = t('Agents');
    const closeBtn = document.createElement('button'); closeBtn.className = 'dialog-close'; closeBtn.textContent = '\u2715';
    header.append(h3, closeBtn);
    const body = document.createElement('div'); body.className = 'dialog-body agents-dialog-body';
    body.innerHTML = `<div class="ob-loading">${t('Checking\u2026')}</div>`;
    dialog.append(header, body);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const done = () => overlay.remove();
    closeBtn.onclick = done;
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(); });
    overlay.tabIndex = -1;
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } });
    setTimeout(() => overlay.focus(), 0);

    const BACKENDS = [
      { key: 'claude', label: 'Claude Code', loginCmd: 'claude', updateCmd: 'claude update' },
      // remoteLoginCmd: on a remote host `codex login` starts a localhost:1455
      // callback server ON THE HOST — unreachable from the user's browser.
      // --device-auth prints a URL + one-time code instead (location-agnostic).
      { key: 'codex', label: 'Codex', loginCmd: 'codex login', remoteLoginCmd: 'codex login --device-auth', updateCmd: 'npm install -g @openai/codex@latest' },
    ];
    // Host selector: agent lifecycle can target a remote machine too. Login/
    // update then run in a shell ON that host (ssh -t).
    let selectedHost = ''; // '' = local
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
      try {
        const hd = await fetchJson('/api/hosts');
        for (const h of hd?.hosts || []) {
          const o = document.createElement('option'); o.value = h.id; o.textContent = `${h.name} (${h.user}@${h.host})`;
          hostSel.appendChild(o);
        }
      } catch {}
      if (stale()) return;
      hostSel.value = selectedHost;
      hostSel.onchange = () => { selectedHost = hostSel.value; refresh(); };
      hostRow.append(hostLabel, hostSel);
      body.appendChild(hostRow);
      // Accounts render UNDER their CLI: Anthropic accounts below Claude Code,
      // OpenAI/Codex accounts below Codex. Shared context for the extracted
      // renderers (they capture the same closures the dialog builds).
      const actx = { body, selectedHost, hostSel, done, run, refresh, st, stale };
      for (const b of BACKENDS) {
        const info = st[b.key] || {};
        const row = document.createElement('div'); row.className = 'ob-backend';
        const left = document.createElement('div');
        left.innerHTML = `<b>${b.label}</b> ${info.version ? `<span class="ob-ver">${escHtml(info.version)}</span>` : ''}<div>${
          !info.installed ? `<span class="ob-bad">${t('not installed')}</span>`
          : info.loggedIn ? `<span class="ob-ok">\u2713 ${t('logged in')}</span>`
          : `<span class="ob-warn">${t('not logged in')}</span>`
        }</div>`;
        const actions = document.createElement('div'); actions.className = 'agent-actions';
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
          left.innerHTML = `<b>${t('VibeSpace integration')}</b><div>${stateOf('claude', 'Claude')} &nbsp; ${stateOf('codex', 'Codex')}</div>`
            + `<div class="agents-note">${t("Lets sessions in a Task Group automatically receive the group's context (objective, checklist, shared files).")}</div>`;
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
      // ── Custom agent instructions (injected preamble) — user-configurable
      // standing guidance placed at the TOP of every VibeSpace hook delivery
      // (task context / baseline tools intro). Applies to local AND remote
      // sessions (both read the same injection routes); delivered once per
      // session + re-delivered on change, never per turn.
      {
        const row = document.createElement('div'); row.className = 'ob-backend';
        row.style.flexDirection = 'column'; row.style.alignItems = 'stretch';
        const head = document.createElement('div');
        head.innerHTML = `<b>${t('Agent instructions')}</b>`
          + `<div class="agents-note">${t('Injected at the top of the VibeSpace context every agent session receives — customize behavior fleet-wide (e.g. reply language, reporting habits, house rules). Delivered once per session and again when you change it.')}</div>`;
        const ta = document.createElement('textarea');
        ta.className = 'settings-json';
        ta.rows = 4;
        ta.maxLength = 4000;
        ta.placeholder = t('e.g. Always reply in Chinese. File a vibespace-ask before starting anything destructive.');
        ta.value = this.settings.get('agents.injectPreamble') || '';
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;margin-top:6px;';
        const save = document.createElement('button');
        save.className = 'agent-btn'; save.textContent = t('Save');
        save.onclick = () => {
          this.settings.set('agents.injectPreamble', ta.value.trim());
          showToast(t('Saved — new/updated sessions receive it on their next turn'));
        };
        btnRow.appendChild(save);
        row.append(head, ta, btnRow);
        body.appendChild(row);
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
    refresh();
  },

  // ── Anthropic accounts roster (rendered UNDER Claude Code in Manage
  // Agents). Extracted from _showAgentsDialog so accounts sit beside their
  // CLI. ctx carries the dialog closures the block already used.
  async _renderClaudeAccounts(ctx) {
    const { body, selectedHost, hostSel, done, run, refresh } = ctx;
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
    try { const u = await fetchJson('/api/usage'); if (u) { this._accountUsage = u.accounts || {}; if (u.rateLimit) this._rateLimit = u.rateLimit; } } catch {}
    // Remote host selected → probe ITS login state for the peer row.
    let racct = null;
    const hostLabel = selectedHost ? (hostSel.options[hostSel.selectedIndex]?.textContent?.split(' (')[0] || t('remote host')) : null;
    if (selectedHost) { try { racct = await fetchJson(`/api/hosts/${encodeURIComponent(selectedHost)}/accounts-status`); } catch {} }
    const accts = await this.refreshAccounts(); // keep app cache in sync
    const claudeAccts = (accts.accounts || []).filter(x => (x.backend || 'claude') === 'claude');
    // §ban-safety: on a REMOTE host a subscription can't run unless the opt-in
    // is set (its creds would ship to the host's — likely datacenter — IP). Its
    // rows render disabled with guidance; API keys are unaffected.
    const allowSubRemote = !!this.settings?.get?.('accounts.shipSubscriptionToRemote');
    const subBlocked = !!selectedHost && !allowSubRemote;
    const row = document.createElement('div'); row.className = 'ob-backend acct-section';
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
    const PENCIL = svg('<path d="M11 2.5 13.5 5 5.5 13H3v-2.5z"/>');
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
      gIdent = racct && !racct.error
        ? (racct.subscription?.loggedIn
            ? `<span class="ob-ok">${t('logged in')}</span>`
            : `<span class="ob-warn">${racct.cliKey?.present ? t('not logged in (a Console login replaced it)') : t('not logged in')}</span>`)
        : `<span class="ob-warn">${t('unreachable')}</span>`;
      gExtraActions = `<button class="agent-btn acct-host-login" title="${t('Opens a terminal ON {host} — this login lands on that machine, not in VibeSpace', { host: escHtml(hostLabel) })}">${t('Log in on {host}…', { host: escHtml(hostLabel) })}</button>`
        + (racct?.cliKey?.present && !importedTails.has(racct.cliKey.tail)
            ? `<button class="agent-btn acct-host-import" title="${t('Copy the Console key found on {host} (…{tail}) into VibeSpace so any machine can use it', { host: escHtml(hostLabel), tail: escHtml(racct.cliKey.tail) })}">${t('Import its key')}</button>` : '');
    } else {
      gName = t('CLI login');
      gIdent = sub.loggedIn
        ? escHtml((sub.email || '') + (sub.plan ? (sub.email ? ' · ' : '') + sub.plan : '')) || t('logged in')
        : `<span class="ob-warn">${acct.cliKey?.present ? t('not logged in (a Console login replaced it)') : t('not logged in')}</span>`;
      // The machine's login may BE one of the named accounts (same email) —
      // say so, since their rows then show the same (merged) usage.
      const linkedSub = sub.loggedIn && sub.email
        ? claudeAccts.find(a => a.type === 'subscription' && a.email && a.email.toLowerCase() === String(sub.email).toLowerCase())
        : null;
      if (linkedSub) gIdent += ` <span class="acct-linked-hint" title="${escHtml(t('The machine login and this VibeSpace account are the same Anthropic account — usage is shown merged'))}">${t('= “{name}”', { name: escHtml(linkedSub.name) })}</span>`;
    }
    const globalRow = `<div class="acct-key-row${gDef ? ' is-default' : ''}" data-id="__global__">
      <span class="acct-type-icon" title="${selectedHost ? t("This machine's own login — lives on {host}, not in VibeSpace", { host: escHtml(hostLabel) }) : t('The CLI’s own global login on this machine')}">${GLOBE}</span>
      <span class="acct-key-main"><span class="acct-key-name">${gName}</span><span class="acct-key-tail">${gIdent}</span></span>
      <span class="acct-usage-cell">${!selectedHost && sub.loggedIn ? usageHtml(this._rateLimit) : ''}</span>
      <span class="acct-key-actions">
        <button class="acct-icon acct-def ${gDef ? 'on' : ''}" title="${gDef ? t('Default for new sessions — pick another to change') : t('Set as default for new sessions')}">${gDef ? STAR_F : STAR_O}</button>${gExtraActions}
      </span></div>`;
    const keyLines = claudeAccts.map(a => {
      const isDef = accts.defaultAccountId === a.id;
      const isSub = a.type === 'subscription';
      const blocked = isSub && subBlocked; // subscription on a remote host, opt-in off
      let ident = isSub
        ? (a.loggedIn ? escHtml((a.email || '') + (a.subscriptionType ? (a.email ? ' · ' : '') + a.subscriptionType : '')) || t('logged in')
                      : `<span class="ob-warn">${t('not logged in')}</span>`)
        : `API …${escHtml(a.tail || '')}`;
      // Some login flows leave the creds dir without an identity file — the
      // email is then unknowable from disk, which breaks same-account detection
      // vs the machine login (merged usage). Let the user declare/fix it.
      if (isSub && a.loggedIn && (!a.email || a.emailDeclared)) {
        ident += ` <button class="acct-set-email" title="${escHtml(t('Declare which Anthropic account this is — the email links it to the machine login for merged usage'))}">${a.email ? t('edit email') : t('set email…')}</button>`;
      }
      const hint = blocked ? ` <span class="acct-blocked-hint" title="${t('Runs on this machine only. For {host}, log in on the host — or enable Settings → “Ship subscription logins to remote hosts.”', { host: escHtml(hostLabel) })}">${t('· this machine only')}</span>` : '';
      const testTitle = blocked
        ? t('Subscriptions can’t run on {host} by default — log in on the host, or enable the setting', { host: escHtml(hostLabel) })
        : selectedHost
          ? t('Open a terminal session ON {host} billing through this account', { host: escHtml(hostLabel) })
          : (isSub ? t('Open a terminal session on this subscription') : t("Open a terminal session using this key (approve the CLI's one-time trust prompt here if it appears)"));
      const iconTitle = isSub ? t('Subscription (Pro/Max) — runs on this machine (or a host you log into)') : t('API key — stored in VibeSpace, runs on any machine');
      // Every row carries the SAME controls (peers) — the default is just a
      // star toggle whose fill differs; no row is privileged in layout.
      return `<div class="acct-key-row${isDef ? ' is-default' : ''}${blocked ? ' acct-row-blocked' : ''}" data-id="${escHtml(a.id)}" data-sub="${isSub ? '1' : ''}"${blocked ? ' data-blocked="1"' : ''}>
        <span class="acct-type-icon" title="${iconTitle}">${isSub ? CROWN : KEY}</span>
        <span class="acct-key-main"><span class="acct-key-name">${escHtml(a.name)}</span><span class="acct-key-tail">${ident}${hint}</span></span>
        <span class="acct-usage-cell">${isSub && a.loggedIn ? usageHtml(this._accountUsage?.[a.id]) : ''}</span>
        <span class="acct-key-actions">
          <button class="acct-icon acct-def ${isDef ? 'on' : ''}" title="${isDef ? t('Default for new sessions — click to clear') : t('Set as default for new sessions')}">${isDef ? STAR_F : STAR_O}</button>
          <button class="acct-icon acct-rename" title="${t('Rename')}">${PENCIL}</button>
          <button class="agent-btn acct-test${blocked ? ' acct-test-blocked' : ''}" title="${testTitle}">${t('Test')}</button>
          <button class="acct-icon acct-del" title="${isSub ? t('Remove this subscription from VibeSpace (deletes its stored login)') : t('Remove from VibeSpace (the key itself stays valid)')}">${svg('<path d="M4 4l8 8M12 4l-8 8"/>', 1.6)}</button>
        </span></div>`;
    }).join('');
    const note = selectedHost
      ? t("The “CLI login” row is {host}'s own login (lives on that machine). API-key accounts below ship to {host} per session; subscription accounts run on THIS machine only — for {host}, use “Log in on host…”, or enable Settings → “Ship subscription logins to remote hosts.”", { host: escHtml(hostLabel) })
      : t('Each session can pick its account (New Session dialog / card ⚙). Subscriptions bill your Pro/Max plan; API keys bill pay-per-use. The starred account is the default when a session doesn’t pick one.');
    left.innerHTML = `<b>${t('Anthropic accounts')}</b>
      <div class="acct-list">${globalRow}${keyLines}</div>
      <div class="agents-note">${note}</div>`;
    const actions = document.createElement('div'); actions.className = 'agent-actions';
    if (!selectedHost) {
      const needsSetup = !sub.loggedIn || !claudeAccts.length;
      const wizardBtn = document.createElement('button');
      wizardBtn.className = 'agent-btn' + (needsSetup ? ' primary' : '');
      wizardBtn.textContent = t('Set up both…');
      wizardBtn.onclick = () => { done(); this._showAccountsWizard(); };
      actions.appendChild(wizardBtn);
      if (acct.cliKey?.present && !acct.cliKey.imported) {
        const impBtn = document.createElement('button'); impBtn.className = 'agent-btn primary';
        impBtn.textContent = t('Import CLI key');
        impBtn.title = t('Save the key your Console login minted ({org} …{tail}) into VibeSpace', { org: escHtml(acct.cliKey.org || ''), tail: escHtml(acct.cliKey.tail || '') });
        impBtn.onclick = async () => {
          try { const r = await fetchJson('/api/accounts/import-cli', { method: 'POST' }); showToast(t('Imported: {name}', { name: r.account.name })); } catch (e) { showToast(t('Import failed'), { type: 'error' }); }
          refresh();
        };
        actions.appendChild(impBtn);
      }
    }
    // The Add… buttons ALWAYS add to VibeSpace's store (machine-independent) —
    // available with a remote host selected too; the login terminal runs
    // locally and the resulting account works everywhere.
    const addSubBtn = document.createElement('button'); addSubBtn.className = 'agent-btn primary'; addSubBtn.textContent = t('Add subscription…');
    addSubBtn.title = t('Sign in another Claude Pro/Max account — stored in VibeSpace (not on any one machine), switchable per session');
    addSubBtn.onclick = () => { done(); this._addSubscription(); };
    actions.appendChild(addSubBtn);
    const addConBtn = document.createElement('button'); addConBtn.className = 'agent-btn'; addConBtn.textContent = t('Add Console account…');
    addConBtn.title = t('Sign in to an Anthropic Console account — its API key is captured in an isolated login, so your subscription stays intact');
    addConBtn.onclick = () => { done(); this._addConsoleAccount(); };
    actions.appendChild(addConBtn);
    const addBtn = document.createElement('button'); addBtn.className = 'agent-btn'; addBtn.textContent = t('Add API key…');
    addBtn.title = t('Paste a raw Anthropic API key (sk-ant-…) — bills pay-per-use, separate from the console-login import');
    addBtn.onclick = async () => {
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
    actions.appendChild(addBtn);
    if (ctx.stale?.()) return; // a newer refresh took over mid-await
    row.append(left, actions);
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
          // host's own ~/.claude, NOT in VibeSpace's store.
          run('claude /login');
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
      // closest() — the click can land on an <svg>/<path> inside the button.
      if (e.target.closest('.acct-test')) {
        // A not-logged-in subscription can't spawn — the server would
        // reject the create and leave a blank window. Guard it here.
        if (a?.type === 'subscription' && !a.loggedIn) {
          showToast(t('This subscription isn’t signed in yet — use “Add subscription…” to finish the login first.'), { type: 'error' });
          return;
        }
        // §ban-safety: a subscription can't run on a remote host by default.
        // Explain instead of firing a create the server will reject.
        if (keyRow.dataset.blocked) {
          showToast(t('“{name}” runs on this machine only. For {host}, use “Log in on host…” on the CLI-login row, or turn on Settings → “Ship subscription logins to remote hosts.”', { name: a?.name, host: escHtml(hostLabel) }), { type: 'error', duration: 6000 });
          return;
        }
        done();
        // Diagnostic session — closing its window always terminates it
        // (ephemeral), never leaves a detached test session lingering.
        // With a remote host selected the test runs ON that host (the
        // account's creds ship to it), proving the full remote path.
        this.createSession({ backend: 'claude', mode: 'terminal', cwd: '', accountId: id, ephemeral: true, hostId: selectedHost || undefined });
      } else if (e.target.closest('.acct-def')) {
        const isDef = accts.defaultAccountId === id;
        try { await fetchJson('/api/accounts/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: isDef ? null : id }) }); } catch {}
        refresh();
      } else if (e.target.closest('.acct-set-email')) {
        const email = await showInputDialog({
          title: t('Account email'),
          label: t('Email of this Anthropic account. Used to recognize when it is the same account as a machine login (their usage then shows merged).'),
          value: a?.email || '', placeholder: 'you@example.com', confirmText: t('Save'),
        });
        if (email != null) {
          try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) }); } catch {}
          refresh();
        }
      } else if (e.target.closest('.acct-rename')) {
        const name = await showInputDialog({ title: t('Rename account'), label: t('Account name'), value: a?.name || '', confirmText: t('Save') });
        if (name && name.trim() && name.trim() !== a?.name) {
          try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) }); } catch {}
          refresh();
        }
      } else if (e.target.closest('.acct-del')) {
        if (!(await showConfirmDialog({ title: t('Remove account'), message: t('Remove "{name}" from VibeSpace? Sessions already running keep working; the key itself stays valid.', { name: a?.name }) }))) return;
        try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch {}
        refresh();
      }
    };
  },
  });
}
