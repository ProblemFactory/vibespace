import { escHtml, showToast, showConfirmDialog, fetchJson, createModalShell } from './utils.js';
import { maybeNagVault } from './vault-unlock.js'; // lane vault-e2e-password: the tour ends ⇒ the second password (while not set up)
import { TerminalSession } from './terminal.js';
import { t, setLang, getLangPref } from './i18n.js';
import { THEMES, BUILTIN_THEMES } from './themes.js';
import { sessionDisplayName } from '../session-name.js'; // THE name ladder — a drift-ledger row names its conversation (lane record-oracle-2-1-296)
import { diagnosticsSection } from './cli-registration-words.js'; // lane cli-2-1-308-records: a claude build this release has no record table for

/**
 * App setup/config flows mixin — the onboarding wizard, Backup & migrate
 * (config export/import), password management dialogs, and the diagnostics
 * report. Extracted from app.js (2.93.0 split), installed on App.prototype at
 * the app.js module tail like the other prototype mixins.
 */
export function installSetupFlows(App) {
  Object.assign(App.prototype, {

    /**
     * Guided CLI action in a MODAL with an EMBEDDED terminal (user directive:
     * fixed flows must not dump people into a detached terminal window that
     * never comes back). The ephemeral shell session runs INSIDE the dialog;
     * `checkDone` is polled every 3s and on success the modal shows ✓ and
     * closes itself — the caller resumes (onboarding stays on screen the
     * whole time; the modal z-index sits above the wizard overlay).
     * Returns true when checkDone passed, false on cancel.
     */
    runGuidedCli({ title, cmd, hint, checkDone }) {
      return new Promise((resolve) => {
        const { body, close } = createModalShell({ id: 'guided-cli-dialog', title, dialogClass: 'guided-cli-dialog', bodyClass: 'guided-cli-body' });
        body.innerHTML = `
          <div class="guided-cli-status"><span class="upload-active-spinner" aria-hidden="true"></span><span class="gc-msg">${escHtml(t('Follow the prompts in the terminal below — this closes automatically when done.'))}</span></div>
          ${hint ? `<div class="mounts-field-hint">${escHtml(hint)}</div>` : ''}
          <div class="guided-cli-term"></div>`;
        const statusEl = body.querySelector('.guided-cli-status');
        const termBox = body.querySelector('.guided-cli-term');
        let term = null, sid = null, poll = null, settled = false;
        const cleanup = (killSession) => {
          clearInterval(poll);
          try { term?.dispose(); } catch {}
          if (sid && killSession) { try { this.killSession(sid); } catch {} }
        };
        const finish = (ok) => {
          if (settled) return; settled = true;
          if (ok) {
            statusEl.innerHTML = `<span class="ob-ok">✓ ${escHtml(t('Done'))}</span>`;
            setTimeout(() => { cleanup(true); close(); resolve(true); }, 1000);
          } else { cleanup(true); close(); resolve(false); }
        };
        // Modal close (✕ / Esc) = cancel — make sure the helper session dies.
        const obs = new MutationObserver(() => {
          if (!body.isConnected) { obs.disconnect(); if (!settled) { settled = true; cleanup(true); resolve(false); } }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        // Ephemeral shell session, attached to the in-dialog container via a
        // synthetic winInfo (TerminalSession only touches content/element/
        // titleSpan/onResize on it).
        const reqId = 'gc-' + Date.now().toString(36);
        const onCreated = (msg) => {
          if (msg.type === 'error' && msg.reqId === reqId) { this.ws.offGlobal(onCreated); statusEl.innerHTML = `<span class="ob-bad">${escHtml(msg.error || t('Failed'))}</span>`; return; }
          if (msg.type !== 'created' || msg.reqId !== reqId) return;
          this.ws.offGlobal(onCreated);
          if (!body.isConnected) { try { this.killSession(msg.sessionId); } catch {} return; }
          sid = msg.sessionId;
          const fakeWin = { id: 'guided-' + reqId, content: termBox, element: termBox, titleSpan: document.createElement('span') };
          term = new TerminalSession(fakeWin, this.ws, sid, this.themeManager, () => {}, {}, this.settings);
          setTimeout(() => { try { this.ws.send({ type: 'input', sessionId: sid, data: cmd + '\r' }); } catch {} }, 1200);
          poll = setInterval(async () => {
            try { if (await checkDone()) finish(true); } catch {}
          }, 3000);
        };
        this.ws.onGlobal(onCreated);
        this.ws.send({ type: 'create', backend: 'shell', mode: 'terminal', name: cmd.split(' ')[0], reqId, ephemeral: true });
      });
    },

    _modal(title, { wide = false } = {}) {
    const { overlay, body, close } = createModalShell({
      id: 'cfg-dialog-overlay', title, bodyClass: 'cfg-dialog-body',
      minWidth: wide ? '440px' : null, escapeToClose: true,
    });
    return { overlay, body, close };
  },

    _showTransferDialog(initialTab = 'export', presetFile = null) {
    const { body: shell, close } = this._modal(t('Backup & migrate'), { wide: true });
    const tabs = document.createElement('div');
    tabs.className = 'cfg-tabs';
    const body = document.createElement('div');
    body.className = 'cfg-tab-body';
    shell.append(tabs, body);
    const mk = (id, label) => {
      const b = document.createElement('button');
      b.className = 'cfg-tab';
      b.dataset.tab = id;
      b.textContent = label;
      b.onclick = () => show(id);
      tabs.appendChild(b);
      return b;
    };
    mk('export', t('Export to file'));
    mk('import', t('Import from file'));
    const show = (id) => {
      for (const t of tabs.children) t.classList.toggle('active', t.dataset.tab === id);
      body.innerHTML = '';
      if (id === 'export') this._buildExportBody(body, close);
      else this._buildImportBody(body, close, presetFile);
    };
    show(initialTab);
  },

    _showPasswordDialog() {
    const enabled = !!this._authEnabled;
    const { body, close } = this._modal(enabled ? t('Change password') : t('Set a password'));
    const form = document.createElement('form');
    form.className = 'cfg-pass-form';
    form.innerHTML = `
      ${enabled ? `<label>${t('Current password')}<input type="password" id="pw-cur" autocomplete="current-password"></label>` : ''}
      <label>${t('New password')}<input type="password" id="pw-new" autocomplete="new-password" placeholder="${t('min 4 chars')}"></label>
      <label>${t('Confirm')}<input type="password" id="pw-conf" autocomplete="new-password"></label>
      <p class="agents-note">${enabled ? t('Changing the password logs out every other device.') : t('Everything (pages, APIs, terminals) will require login afterwards. Other open devices are logged out.')}</p>
      <div class="cfg-err"></div>
      <div class="dialog-actions">
        ${enabled ? `<button type="button" class="btn-cancel cfg-danger" id="pw-remove">${t('Remove password…')}</button>` : ''}
        <button type="submit" class="btn-create">${enabled ? t('Change') : t('Set password')}</button>
      </div>`;
    body.appendChild(form);
    const err = form.querySelector('.cfg-err');
    form.onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = '';
      const nw = form.querySelector('#pw-new').value;
      if (nw.length < 4) { err.textContent = t('At least 4 characters'); return; }
      if (nw !== form.querySelector('#pw-conf').value) { err.textContent = t('Passwords don’t match'); return; }
      try {
        const res = await fetch('/api/auth/set-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current: form.querySelector('#pw-cur')?.value, newPassword: nw }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { err.textContent = d.error || t('Failed'); return; }
        this._authEnabled = true;
        close();
        showToast(enabled ? t('Password changed — other devices were logged out') : t('Password set — other devices were logged out'));
      } catch { err.textContent = t('Failed'); }
    };
    form.querySelector('#pw-remove')?.addEventListener('click', async () => {
      err.textContent = '';
      const cur = form.querySelector('#pw-cur')?.value || '';
      if (!cur) { err.textContent = t('Enter the current password first'); return; }
      const ok = await showConfirmDialog({ title: t('Remove password?'), message: t('Auth will be disabled — anyone who can reach this server gets full access.'), confirmText: t('Remove'), danger: true });
      if (!ok) return;
      try {
        const res = await fetch('/api/auth/set-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current: cur, remove: true }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { err.textContent = d.error || t('Failed'); return; }
        this._authEnabled = false;
        close();
        showToast(t('Password removed — auth disabled'));
      } catch { err.textContent = t('Failed'); }
    });
  },

    _showOnboarding(force = false, startStep = 0) {
    const welcome = document.getElementById('welcome');
    if (!welcome) return;
    welcome.classList.remove('hidden');
    welcome.classList.add('onboarding');
    const content = welcome.querySelector('.welcome-content');
    content.dataset.saved = content.dataset.saved || content.innerHTML; // restore target on finish
    let step = startStep;
    const teardown = () => {
      this._obKeyHandler?.abort?.(); this._obKeyHandler = null;
      welcome.classList.remove('onboarding');
      welcome.classList.add('hidden'); // _checkWelcome re-shows it only on an empty desktop
      content.innerHTML = content.dataset.saved;
      // re-wire the plain welcome buttons (innerHTML replace dropped listeners)
      content.querySelector('#welcome-new')?.addEventListener('click', () => this.showNewSessionDialog());
      content.querySelector('#welcome-files')?.addEventListener('click', () => this.openFileExplorer());
    };
    const done = () => {
      // release the capture-phase keydown regardless of HOW the tour ended
      // (finishing via the last step used to leave it attached forever)
      document.getElementById('ob-return-pill')?.remove();
      localStorage.setItem('vs-onboarded', '1');
      teardown();
      this._checkWelcome();
      maybeNagVault(); // the mandatory step of a new instance: the vault's second password
    };
    // PAUSE (not finish): a wizard action that needs the workspace — Log in /
    // Install open a terminal the user must interact with — used to just hide
    // the whole wizard, which read as "clicking Log in skips onboarding"
    // (real report). Hide it WITHOUT marking onboarded and leave a floating
    // "Back to setup" pill that re-enters at the same step.
    const pauseFor = (action) => {
      const returnStep = step;
      teardown();
      document.getElementById('ob-return-pill')?.remove();
      const pill = document.createElement('button');
      pill.id = 'ob-return-pill';
      pill.innerHTML = `↩ ${t('Back to setup')}`;
      pill.onclick = () => { pill.remove(); this._showOnboarding(true, returnStep); };
      document.body.appendChild(pill);
      action();
    };

    const render = () => {
      const dots = [0, 1, 2, 3].map(i => `<span class="ob-dot${i === step ? ' active' : ''}"></span>`).join('');
      if (step === 0) {
        // Language chips: setLang() reloads the page; vs-onboarded isn't set
        // yet, so the wizard re-enters in the picked language automatically.
        const lang = getLangPref();
        const langChip = (code, label) =>
          `<button class="ob-lang${lang === code ? ' active' : ''}" data-lang="${code}">${label}</button>`;
        // Theme chips: applied LIVE (themeManager.apply persists per-device),
        // no reload — the wizard itself recolors as immediate feedback.
        const curTheme = this.themeManager?.current || 'dark';
        const themeChip = (name) => {
          const term = THEMES[name]?.terminal || {};
          const label = name.charAt(0).toUpperCase() + name.slice(1); // brand-ish names, untranslated
          return `<button class="ob-lang ob-theme${curTheme === name ? ' active' : ''}" data-theme-name="${name}">
            <i style="background:${term.background || '#222'}"></i>${label}</button>`;
        };
        content.innerHTML = `
          <h1>${t('Welcome to VibeSpace')}</h1>
          <p class="ob-sub">${t('Your workspace for coding agents')}</p>
          <div class="ob-langs">${langChip('auto', t('Auto'))}${langChip('en', 'English')}${langChip('zh', '中文')}${langChip('ja', '日本語')}</div>
          <div class="ob-langs ob-themes">${[...BUILTIN_THEMES].map(themeChip).join('')}</div>
          <div class="ob-points">
            <div class="ob-point"><b>${t('Sessions that never die')}</b><span>${t('Agents keep running through restarts, refreshes, and network drops — reattach from any device.')}</span></div>
            <div class="ob-point"><b>${t('A real window manager')}</b><span>${t('Tile agent chats, terminals, files and editors across virtual desktops.')}</span></div>
            <div class="ob-point"><b>${t('Chat or terminal, your choice')}</b><span>${t('Every session can run as a structured chat or a raw terminal TUI.')}</span></div>
          </div>
          <div class="welcome-actions">
            <button class="welcome-btn" id="ob-next">${t('Get started')}</button>
            <button class="welcome-btn welcome-btn-secondary" id="ob-skip">${t('Skip tour')}</button>
          </div>
          <div class="ob-dots">${dots}</div>`;
        content.querySelector('#ob-next').onclick = () => { step = 1; render(); };
        content.querySelector('#ob-skip').onclick = done;
        content.querySelectorAll('.ob-lang:not(.ob-theme)').forEach((b) => {
          b.onclick = () => { if (b.dataset.lang !== getLangPref()) setLang(b.dataset.lang); };
        });
        content.querySelectorAll('.ob-theme').forEach((b) => {
          b.onclick = () => { this.themeManager?.apply(b.dataset.themeName); render(); };
        });
      } else if (step === 1) {
        content.innerHTML = `
          <h1>${t('Connect your agents')}</h1>
          <p class="ob-sub">${t('VibeSpace drives the official CLIs — log in once, credentials persist')}</p>
          <div class="ob-backends" id="ob-backends"><div class="ob-loading">${t('Checking…')}</div></div>
          <div class="welcome-actions">
            <button class="welcome-btn" id="ob-next">${t('Continue')}</button>
            <button class="welcome-btn welcome-btn-secondary" id="ob-back">${t('Back')}</button>
          </div>
          <div class="ob-dots">${dots}</div>`;
        content.querySelector('#ob-next').onclick = () => { step = 2; render(); };
        content.querySelector('#ob-back').onclick = () => { step = 0; render(); };
        const refresh = async () => {
          let st = {};
          try { st = await fetchJson('/api/backend-status'); } catch {}
          const card = (key, label, loginCmd, installCmd) => {
            const b = st[key] || {};
            // Named/pooled accounts count as READY (2.267.4, user request:
            // onboarding must not force the machine-wide login — accounts
            // added per-directory or as a pool work without it).
            // …for EVERY backend (2.369.21): the 2.267.4 fix was claude-only, so
            // codex named accounts / pools never satisfied onboarding
            const named = b.namedLoggedIn || 0;
            const state = !b.installed ? `<span class="ob-bad">${t('not installed')}</span>`
              : b.loggedIn ? `<span class="ob-ok">✓ ${t('ready')}</span>`
              : named > 0 ? `<span class="ob-ok">✓ ${t('{n} named account(s) in use', { n: named })}</span>`
              : `<span class="ob-warn">${t('installed, not logged in')}</span>`;
            // Not installed → one-click install; installed but logged out →
            // log in. Both just run the command in a visible shell terminal.
            const btn = !b.installed ? `<button class="welcome-btn ob-login" data-key="${key}" data-kind="install" data-label="${escHtml(label)}" data-cmd="${escHtml(installCmd)}" title="${escHtml(installCmd)}">${t('Install')}</button>`
              : b.loggedIn ? '' : `<button class="welcome-btn${named > 0 ? ' welcome-btn-secondary' : ''} ob-login" data-key="${key}" data-kind="login" data-label="${escHtml(label)}" data-cmd="${escHtml(loginCmd)}">${t('Log in')}</button>`;
            // Direct door to named accounts / the account pool — no machine
            // login required (Manage Agents opens above the wizard)
            const acctBtn = b.installed
              ? ` <button class="welcome-btn welcome-btn-secondary ob-accounts">${t('Accounts & pool…')}</button>` : '';
            return `<div class="ob-backend"><div><b>${label}</b> ${b.version ? `<span class="ob-ver">${escHtml(b.version)}</span>` : ''}</div><div>${state} ${btn}${acctBtn}</div></div>`;
          };
          const el = content.querySelector('#ob-backends');
          if (!el) return;
          el.innerHTML = card('claude', 'Claude Code', 'claude', 'curl -fsSL https://claude.ai/install.sh | bash')
            + card('codex', 'Codex', 'codex login --device-auth', 'npm install -g @openai/codex@latest')
            + `<div class="ob-sub" style="margin-top:6px">${t('Tip: named accounts and account pools work without the machine-wide login — add them via “Accounts & pool…”.')}</div>`
            + `<button class="welcome-btn welcome-btn-secondary ob-recheck">${t('Re-check')}</button>`;
          el.querySelector('.ob-accounts')?.addEventListener('click', () => {
            // Manage Agents as a MODAL above the wizard (z 99998 > wizard
            // 9600; forceModal skips the rail-panel redirect, which would
            // open BEHIND the wizard). Cards refresh on close so a fresh
            // named account flips this step to ✓ without a manual re-check.
            try { this._showAgentsDialog?.({ forceModal: true, onClose: () => refresh() }); } catch {}
          });
          el.querySelectorAll('.ob-login').forEach(btn => {
            // Embedded guided modal (stays ON the wizard; auto-detects
            // completion via /api/backend-status and refreshes the cards) —
            // replaced the old pause-the-wizard + detached-terminal flow.
            btn.onclick = async () => {
              const key = btn.dataset.key, isInstall = btn.dataset.kind === 'install', label = btn.dataset.label;
              await this.runGuidedCli({
                title: isInstall ? t('Install {name}', { name: label }) : t('Log in to {name}', { name: label }),
                cmd: btn.dataset.cmd,
                checkDone: async () => {
                  const st2 = await fetchJson('/api/backend-status?t=' + Date.now());
                  const bb = st2?.[key] || {};
                  return isInstall ? !!bb.installed : !!bb.loggedIn;
                },
              });
              refresh();
            };
          });
          el.querySelector('.ob-recheck').onclick = refresh;
        };
        refresh();
      } else if (step === 2) {
        const protectedAlready = !!this._authEnabled;
        // SSO configured → login is handled by the identity provider; a local
        // password is redundant, so skip the whole password step (show why).
        if (this._ssoEnabled) {
          content.innerHTML = `
            <h1>${t('Protect this workspace')}</h1>
            <p class="ob-sub">${t('Single sign-on (SSO) is already configured ✓ — login is handled by your identity provider, so no password is needed.')}</p>
            <div class="welcome-actions">
              <button class="welcome-btn" id="ob-next">${t('Continue')}</button>
              <button class="welcome-btn welcome-btn-secondary" id="ob-back">${t('Back')}</button>
            </div>
            <div class="ob-dots">${dots}</div>`;
          content.querySelector('#ob-next').onclick = () => { step = 3; render(); };
          content.querySelector('#ob-back').onclick = () => { step = 1; render(); };
          return;
        }
        content.innerHTML = `
          <h1>${t('Protect this workspace')}</h1>
          <p class="ob-sub">${protectedAlready ? t('Password auth is already enabled ✓') : t('Optional — anyone who can reach this server gets full shell access. A password gates pages, APIs, and terminals.')}</p>
          ${protectedAlready ? '' : `
          <div class="ob-pass">
            <input type="password" id="ob-pw" placeholder="${t('Password (min 4 chars)')}" autocomplete="new-password">
            <button class="welcome-btn welcome-btn-secondary" id="ob-gen" title="${t('Generate a random password')}">${t('Generate')}</button>
          </div>
          <div class="cfg-err" id="ob-pw-err"></div>`}
          <div class="welcome-actions">
            ${protectedAlready ? '' : `<button class="welcome-btn" id="ob-setpw">${t('Set password')}</button>`}
            <button class="welcome-btn ${protectedAlready ? '' : 'welcome-btn-secondary'}" id="ob-next">${protectedAlready ? t('Continue') : t('Skip')}</button>
            ${protectedAlready ? `<button class="welcome-btn welcome-btn-secondary" id="ob-chpw">${t('Change password…')}</button>` : ''}
            <button class="welcome-btn welcome-btn-secondary" id="ob-back">${t('Back')}</button>
          </div>
          <div class="ob-alt"><a href="#" id="ob-import">${t('Import a config file from another VibeSpace…')}</a></div>
          <div class="ob-dots">${dots}</div>`;
        content.querySelector('#ob-next').onclick = () => { step = 3; render(); };
        content.querySelector('#ob-back').onclick = () => { step = 1; render(); };
        // Managed deployments arrive with a preset password (env) — the wizard
        // is where a new user should be able to change it to their own.
        content.querySelector('#ob-chpw')?.addEventListener('click', () => this._showPasswordDialog());
        content.querySelector('#ob-import').onclick = (e) => { e.preventDefault(); this._showTransferDialog('import'); };
        const pwInput = content.querySelector('#ob-pw');
        content.querySelector('#ob-gen')?.addEventListener('click', () => {
          const bytes = new Uint8Array(9);
          crypto.getRandomValues(bytes);
          pwInput.value = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          pwInput.type = 'text'; // show the generated one so the user can save it
        });
        content.querySelector('#ob-setpw')?.addEventListener('click', async () => {
          const errEl = content.querySelector('#ob-pw-err');
          errEl.textContent = '';
          const pw = pwInput.value;
          if (pw.length < 4) { errEl.textContent = t('At least 4 characters'); return; }
          try {
            const res = await fetch('/api/auth/set-password', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newPassword: pw }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { errEl.textContent = d.error || t('Failed'); return; }
            this._authEnabled = true;
            step = 3; render();
          } catch { errEl.textContent = t('Failed'); }
        });
      } else {
        content.innerHTML = `
          <h1>${t('Start your first session')}</h1>
          <p class="ob-sub">${t('Pick a project folder — the agent works inside it')}</p>
          <input type="text" id="ob-cwd" class="ob-cwd" placeholder="~/projects/my-app" autocomplete="off">
          <div class="welcome-actions">
            <button class="welcome-btn" id="ob-chat">${t('Start Chat Session')}</button>
            <button class="welcome-btn welcome-btn-secondary" id="ob-term">${t('Start Terminal Session')}</button>
          </div>
          <div class="ob-alt"><a href="#" id="ob-files">${t('or browse files first')}</a> · <a href="#" id="ob-finish">${t('finish tour')}</a></div>
          <div class="ob-dots">${dots}</div>`;
        const cwdInput = content.querySelector('#ob-cwd');
        fetchJson('/api/home').then(d => { cwdInput.placeholder = d.home; }).catch(() => {});
        const go = (mode) => {
          const cwd = cwdInput.value.trim() || undefined;
          done();
          this.createSession({ cwd, mode, backend: 'claude' });
        };
        content.querySelector('#ob-chat').onclick = () => go('chat');
        content.querySelector('#ob-term').onclick = () => go('terminal');
        content.querySelector('#ob-files').onclick = (e) => { e.preventDefault(); done(); this.openFileExplorer(); };
        content.querySelector('#ob-finish').onclick = (e) => { e.preventDefault(); done(); };
      }
      // ✕ close on every step (Escape works too)
      const close = document.createElement('button');
      close.className = 'ob-close';
      close.innerHTML = '\u2715';
      close.title = t('Close tour');
      close.onclick = done;
      content.appendChild(close);
    };
    this._obKeyHandler?.abort?.();
    this._obKeyHandler = new AbortController();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && welcome.classList.contains('onboarding')) { e.stopPropagation(); done(); this._obKeyHandler.abort(); }
    }, { capture: true, signal: this._obKeyHandler.signal });
    render();
  },

  // Layout rollback (2.296.0). Sessions survive almost everything, but WHERE
  // they lived does not: a bug that rewrites window→desktop placement used to
  // be unrecoverable (hand-editing layouts.json was the only path, and if the
  // damage emptied a desktop the pre-damage mapping was simply gone). The
  // server writes a rollback point before every layout SHAPE change; this is
  // the one click that uses them.
  async _showLayoutHistory() {
    const { body, close } = createModalShell({ id: 'layout-history-dialog', title: t('Restore a previous layout'), minWidth: '460px', escapeToClose: true });
    body.innerHTML = `<div class="empty-hint">${escHtml(t('Loading…'))}</div>`;
    const r = await fetchJson('/api/layout-history').catch(() => null);
    const entries = r?.entries || [];
    if (!entries.length) {
      body.innerHTML = `<div class="usage-note">${escHtml(t('No rollback points yet — one is written whenever your window layout changes shape.'))}</div>`;
      return;
    }
    body.innerHTML = `
      <div class="usage-note">${escHtml(t('Each entry is the layout as it was BEFORE a change. Restoring reloads the page; your sessions are not touched.'))}</div>
      <div class="lh-list">${entries.map((e) => {
        const per = Object.entries(e.summary || {}).map(([n, c]) => `${escHtml(n)} ${c}`).join(' · ');
        // what changed right after this point ("HR 3 → 1") — the row a loss FOLLOWS is the one to restore (userW
        // inc-mun7qjmw-iksh); a point from before the field existed has none
        const change = Array.isArray(e.change) && e.change.length
          ? e.change.map(([n, a, b]) => `${n || t('Desktop')} ${a} → ${b}`).join(' · ') : '';
        return `<div class="lh-row"><div class="lh-main"><b>${escHtml(new Date(e.at).toLocaleString())}</b>
            <div class="lh-sub">${escHtml(t('{n} windows', { n: e.totalWindows || 0 }))}${per ? ' — ' + escHtml('') + per : ''}</div>${change ? `
            <div class="lh-sub lh-change">${escHtml(t('Then: {changes}', { changes: change }))}</div>` : ''}</div>
          <button class="agent-btn lh-restore" data-id="${escHtml(e.id)}">${escHtml(t('Restore'))}</button></div>`;
      }).join('')}</div>`;
    body.querySelectorAll('.lh-restore').forEach((b) => {
      b.onclick = async () => {
        // showConfirmDialog takes an OPTIONS OBJECT (utils.js:91) — a bare
        // string destructures to undefined for every field, rendering a
        // generic "Confirm"/empty body on an action that replaces the whole
        // layout and reloads the page.
        if (!(await showConfirmDialog({
          title: t('Restore a previous layout'),
          message: t('Restore this layout? Your current one becomes a rollback point too, so this is undoable.'),
          confirmText: t('Restore'),
        }))) return;
        const res = await fetchJson('/api/layout-history/' + encodeURIComponent(b.dataset.id) + '/restore', { method: 'POST' }).catch(() => null);
        if (!res?.success) { showToast(res?.error || t('Restore failed'), { type: 'error' }); return; }
        close();
        showToast(t('Layout restored — reloading…'));
        setTimeout(() => location.reload(), 800);
      };
    });
  },

    async _openDiagnostics() {
    const [d, c, ci, bt, csp, rt, reg] = await Promise.all([
      fetchJson('/api/telemetry/summary?days=14&drift=1'),
      fetchJson('/api/telemetry/central-summary?days=14'),
      fetchJson('/api/ci-heavy'),
      fetchJson('/api/boot-trace'),
      fetchJson('/api/csp-reports'), // lane app-page-csp: the page security policy's count (the chip below the title)
      fetchJson('/api/runtime'), // lane runtime-floor: the node this server runs against THE floor table (src/runtime-floor.js)
      fetchJson('/api/cli-registration'), // lane cli-2-1-308-records: the claude builds seen with no record table in this release
    ]);
    if (!d) { showToast(t('Could not load diagnostics'), { type: 'error' }); return; }
    const esc = escHtml;
    const kv = (obj) => Object.entries(obj || {}).map(([k, v]) =>
      `<tr><td>${esc(k)}</td><td class="n">${v}</td></tr>`).join('') || `<tr><td colspan="2" class="dim">${esc(t('No data'))}</td></tr>`;
    const errs = (d.errors || []).map((e) =>
      `<details><summary><b>${esc(e.name || '?')}</b> ×${e.count} <span class="dim">— ${new Date(e.lastTs).toLocaleString()}${e.version ? ' · v' + esc(e.version) : ''}</span></summary><pre>${esc(e.stack || e.detail || t('(no stack)'))}</pre></details>`).join('')
      || `<p class="dim">${esc(t('No errors recorded — nothing crashed in this window.'))}</p>`;
    const days = Object.entries(d.byDay || {}).sort();
    const maxDay = Math.max(1, ...days.map(([, v]) => v));
    const bars = days.map(([day, v]) =>
      `<div class="bar" title="${esc(day)}: ${v}"><i style="height:${Math.max(2, Math.round(v / maxDay * 60))}px"></i><s>${esc(day.slice(5))}</s></div>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>${esc(t('VibeSpace diagnostics'))}</title><style>
      body{font:13px/1.5 system-ui;max-width:880px;margin:24px auto;padding:0 16px;color:#24292f}
      h2{margin:18px 0 6px} table{border-collapse:collapse;min-width:320px} td{border-bottom:1px solid #eee;padding:3px 10px 3px 0} td.n{text-align:right;font-variant-numeric:tabular-nums}
      .dim{color:#888} pre{background:#f6f8fa;padding:8px;border-radius:6px;white-space:pre-wrap;font-size:12px}
      details{margin:4px 0;border:1px solid #eee;border-radius:6px;padding:4px 8px} summary{cursor:pointer}
      .chart{display:flex;align-items:flex-end;gap:3px;height:84px;margin:8px 0}
      .chip{display:inline-block;padding:1px 10px;border:1px solid #d0d7de;border-radius:12px;background:#f6f8fa;font-size:12px}
      .bar{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%} .bar i{display:block;width:16px;background:#54aeff;border-radius:2px 2px 0 0} .bar s{text-decoration:none;font-size:9px;color:#888;margin-top:2px}
    </style><body>
    <h1>${esc(t('VibeSpace diagnostics'))} <span class="dim" style="font-size:13px">— ${esc(t('last {n} days', { n: d.days }))} · ${esc(t('instance'))} ${esc(d.instance || '?')}</span></h1>
    <p class="dim">${esc(t('Local-only data from data/telemetry/. Total events: {n}.', { n: d.total }))}</p>
    ${csp && csp.app ? `<p><span class="chip" title="${esc(t('Lines in data/csp-reports.jsonl. A report from the app page also files a For-you notice; one from a frame the page made (a mail, a design) never does.'))}">${esc(t('Page security policy (reports only): {app} on the app page · {frames} from frames the page made', { app: csp.app.lines, frames: csp.frames.lines }))}</span>${csp.sanitizer && csp.sanitizer.lines ? ` <span class="chip" title="${esc(t('Lines of the sanitizer\'s parse in data/csp-reports.jsonl: somebody else\'s HTML (an agent\'s markdown, a .md file) carried an inline event handler, which the sanitizer dropped before anything ran. Chrome 156 reports that parse to the page security policy — it is not a gap in the policy and files no For-you notice.'))}">${esc(t('Sanitizer dropped an inline handler: {n}', { n: csp.sanitizer.lines }))}</span>` : ''}</p>` : ''}
    ${(() => {
      // lane runtime-floor: which Node runs and whether it is below the release that fixes the latest advisory; the
      // instance's own runtime (data/runtime/current) and the boot check's outcome. Absent on a server older than the route.
      if (!rt || !rt.verdict) return '';
      const v = rt.verdict, a = rt.advisory || {};
      const state = v.state === 'below-floor' ? t('Below {floor}, the release that fixes the Node.js security advisory of {date} — the next update installs it for this instance and restarts on it.', { floor: v.floor, date: a.date || '?' })
        : v.state === 'ok' ? t('At or above {floor}, the release that fixes the Node.js security advisory of {date}.', { floor: v.floor, date: a.date || '?' })
        : t('The floor table names no fixed release for Node {major}.', { major: v.major ?? '?' });
      const more = [];
      if (rt.base) more.push(t('Switched at start from {base} to this instance’s own runtime.', { base: rt.base }));
      else if (rt.own) more.push(t('This instance’s own runtime: {version} (data/runtime/current).', { version: rt.own.version }));
      if (rt.check && rt.check.state === 'running') more.push(t('The boot check is downloading {version}…', { version: rt.check.wanted }));
      else if (rt.check && rt.check.ok) more.push(t('The boot check provisioned {version} — the next restart runs on it.', { version: rt.check.version }));
      else if (rt.check) more.push(t('The boot check did not provision {version} ({code}).', { version: rt.check.wanted, code: rt.check.code }));
      return `<h2>${esc(t('Node runtime'))}</h2><p><b>${esc(t('This server runs Node {node}.', { node: rt.node }))}</b> ${esc(state)}</p>${more.map((l) => `<p class="dim">${esc(l)}</p>`).join('')}`;
    })()}
    <h2>${esc(t('Errors'))}</h2>${errs}
    <h2>${esc(t('Performance metrics'))}</h2>${(() => {
      const m = d.metrics || {};
      const names = Object.keys(m).sort();
      if (!names.length) return `<p class="dim">${esc(t('No metrics yet — they accumulate as the app runs.'))}</p>`;
      const row = (n) => `<tr><td>${esc(n)}</td><td class="n">${m[n].count}</td><td class="n">${m[n].p50}</td><td class="n">${m[n].p95}</td><td class="n">${m[n].max}</td><td class="n"><b>${m[n].last}</b></td></tr>`;
      return `<table><tr><td class="dim">${esc(t('metric'))}</td><td class="n dim">n</td><td class="n dim">p50</td><td class="n dim">p95</td><td class="n dim">max</td><td class="n dim">${esc(t('latest'))}</td></tr>${names.map(row).join('')}</table>`;
    })()}
    ${(() => {
      // THE BOOT HOLDS (B-1319): this server's start — the longest times its main loop was held (pages, paired
      // devices, the keeper and every timer waited), each named by the boot step it ran in; the top 5. Loading the
      // code is said apart (the port is not open yet, nothing waits). Absent on a server older than the route.
      // B-92a4: below them, a span's note (restore-probes: N unanswered …) and the boot's notes (the restore's re-probe).
      if (!bt || !Array.isArray(bt.holds)) return '';
      const said = [...(bt.spans || []).filter((s) => s.note).map((s) => `${s.name}: ${s.note}`), ...(Array.isArray(bt.notes) ? bt.notes : []).map((n) => `${n.at} ms · ${n.text}`)];
      const rows = bt.holds.slice(0, 5).map((h) => `<tr><td class="n">${h.at} ms</td><td class="n"><b>${h.ms} ms</b></td><td>${esc(h.name || '?')}${(h.sites || []).map((x) => `<div class="dim">${x.ms} ms · ${esc(x.what)}</div>`).join('')}</td></tr>`).join('');
      return `<h2>${esc(t('Server start — the longest holds'))}</h2>
      <p class="dim">${esc(t('How long the server\'s main loop was held while it started — pages, paired devices and timers waited that long. Start it with VIBESPACE_BOOT_TRACE=1 to name the file read or command behind each.'))}</p>
      <p>${esc(t('Code loaded in {ms} ms; longest hold since: {max} ms.', { ms: bt.mainMs ?? '?', max: bt.maxHoldMs ?? 0 }))}</p>
      ${rows ? `<table><tr><td class="n dim">${esc(t('after start'))}</td><td class="n dim">${esc(t('duration'))}</td><td class="dim">${esc(t('detail'))}</td></tr>${rows}</table>` : `<p class="dim">${esc(t('No hold of 100 ms or more since this server started.'))}</p>`}
      ${said.length ? `<ul class="dim">${said.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}`;
    })()}
    <h2>${esc(t('Events per day'))}</h2><div class="chart">${bars || `<span class="dim">${esc(t('No data'))}</span>`}</div>
    ${diagnosticsSection(reg, { t, esc })}
    ${(() => {
      // HARNESS DRIFT (design-unknown-records §3): unknown record types and
      // known types that grew a field, one row per (breadcrumb, detail) with
      // first/last seen and the VibeSpace versions that reported it — the CLI
      // build rides the detail (`· cli 2.1.274`). Absent when nothing drifted.
      const rows = Array.isArray(d.drift) ? d.drift : [];
      if (!rows.length) return '';
      const tr = rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.detail || '')}</td><td class="n">${r.count}</td><td class="dim">${new Date(r.firstTs).toLocaleString()}</td><td class="dim">${new Date(r.lastTs).toLocaleString()}</td><td class="dim">${esc((r.versions || []).join(', '))}</td></tr>`).join('');
      return `<h2>${esc(t('Harness drift'))}</h2>
      <p class="dim">${esc(t('Records a harness emitted that VibeSpace does not recognize, and known records carrying fields it does not declare. Each row is one breadcrumb; the CLI build that started it rides the detail.'))}</p>
      <table><tr><td class="dim">${esc(t('breadcrumb'))}</td><td class="dim">${esc(t('detail'))}</td><td class="n dim">n</td><td class="dim">${esc(t('first seen'))}</td><td class="dim">${esc(t('last seen'))}</td><td class="dim">${esc(t('versions'))}</td></tr>${tr}</table>`;
    })()}
    ${(() => {
      // THE DRIFT LEDGER (lane record-oracle-2-1-296; beside the chat card since lane drift-card-restore, owner 2026-10-15): a known
      // record that grew a field is listed HERE, one row per conversation + record shape: the new fields, the CLI build,
      // how many records carried them, the latest (redacted) sample behind 技术细节. The server's memory since it started (bounded).
      const rows = Array.isArray(d.driftLedger) ? d.driftLedger : [];
      if (!rows.length) return '';
      const nameOf = (cid) => { const s = (this.sidebar?._allSessions || []).find((x) => (x.backendSessionId || x.claudeSessionId || x.sessionId) === cid); return (s && sessionDisplayName(s, this.sidebar.getCustomName?.(s) || '')) || cid; };
      const tr = rows.map((r) => `<tr><td>${esc(nameOf(r.conversation))}</td><td>${esc(r.harness || '')} · ${esc(r.shape || '')}</td><td>+{${esc((r.fields || []).join(', '))}}</td><td class="dim">${esc(r.cli || '?')}</td><td class="n">${r.count}</td></tr>`
        + (r.sample ? `<tr><td colspan="5"><details><summary>${esc(t('Technical details'))}</summary><pre>${esc(r.sample)}</pre></details></td></tr>` : '')).join('');
      return `<h2>${esc(t('Records that grew a field'))}</h2>
      <p class="dim">${esc(t('Records VibeSpace knows that arrived carrying fields it does not declare. Handling is unchanged; the conversation also shows one red card per kind of record — the sign that the CLI may have updated. Each row is one kind of record in one conversation, since this server started.'))}</p>
      <table class="drift-ledger"><tr><td class="dim">${esc(t('conversation'))}</td><td class="dim">${esc(t('harness record'))}</td><td class="dim">${esc(t('new fields'))}</td><td class="dim">${esc(t('CLI version'))}</td><td class="n dim">n</td></tr>${tr}</table>`;
    })()}
    <h2>${esc(t('By event'))}</h2><table>${kv(d.byName)}</table>
    <h2>${esc(t('By version'))}</h2><table>${kv(d.byVersion)}</table>
    ${(() => {
      // Heavy release-gate tier (2026-09-07): `npm run ci` gates the push with
      // the fast tier and the pre-push hook launches the heavy tier DETACHED,
      // so its verdict lands minutes later with nobody watching. This is where
      // a human finds it without knowing data/ci-heavy/ exists. Absent on a
      // deployment that never pushes — no runs, no section.
      const runs = (ci && ci.runs) || [], running = (ci && ci.running) || [];
      if (!runs.length && !running.length) return '';
      const dur = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s` : `${Math.round(ms / 1000)}s`);
      const rows = [
        // GREEN / RED / RUNNING stay untranslated: they are the gate's own
        // vocabulary (the marker files are literally <sha>.green / .red) and
        // `npm run ci:status` prints the same words at the terminal.
        ...running.map((r) => `<tr><td>${esc(r.sha.slice(0, 8))}</td><td>RUNNING</td><td class="n">—</td><td class="dim">${new Date(r.startedAt).toLocaleString()}</td><td class="dim">pid ${r.pid}</td></tr>`),
        // A suite that failed and passed on the retry does not block a push,
        // but it DID fail — the row says so rather than laundering it green.
        // SKIP is neither: the tier never ran (it never got the machine lock),
        // so the row states the absence rather than leaving the commit looking
        // like one nobody pushed. Like GREEN/RED it is the gate's own
        // vocabulary, and the reason is the record's own words.
        // A run is ISOLATED at a sha, and this gate's table can name suites that
        // sha never contained (round 6) — those were not run and not judged, so
        // the green row says how many of its `suites` they were instead of
        // printing a total the record itself contradicts.
        ...runs.map((r) => `<tr><td>${esc(r.sha.slice(0, 8))}</td><td><b>${r.result === 'green' ? 'GREEN' : r.result === 'skipped' ? 'SKIP' : 'RED'}</b></td><td class="n">${esc(dur(r.ms))}</td><td class="dim">${new Date(r.endedAt).toLocaleString()}</td><td class="dim">${r.result === 'skipped' ? esc(t('no verdict')) + (r.reason ? ' — ' + esc(r.reason) : '') : r.result === 'green' ? esc(t('{n} suites', { n: r.suites })) : esc(r.failed.join(', '))}${r.absent ? ` <span class="dim">· ${esc(t('{n} not present at that commit', { n: r.absent }))}</span>` : ''}${(r.flaky || []).length ? ` <span class="dim">· ${esc(t('flaky'))}: ${esc(r.flaky.join(', '))}</span>` : ''}${r.unlocked ? ` <span class="dim">· ${esc(t('ran without the machine lock'))}</span>` : ''}${r.scope === 'affected' ? ` <span class="dim">· ${esc(t('affected scope: {n} suites selected by that push', { n: r.selected }))}</span>` : ''}</td></tr>`),
      ].join('');
      return `<h2>${esc(t('Release gate — heavy tier'))}</h2>
      <p class="dim">${esc(t('Suites too slow for the pre-push gate (headless chrome, real servers, real CLIs). A RED run blocks the next push until a newer green run clears it — run npm run ci:status for the ancestry verdict.'))}</p>
      <table><tr><td class="dim">${esc(t('commit'))}</td><td class="dim">${esc(t('result'))}</td><td class="n dim">${esc(t('duration'))}</td><td class="dim">${esc(t('finished'))}</td><td class="dim">${esc(t('detail'))}</td></tr>${rows}</table>`;
    })()}
    ${(() => {
      // Fleet section: only on a collector instance that has received batches.
      if (!c || !c.collector || !Object.keys(c.instances || {}).length) return '';
      const rows = Object.entries(c.instances).map(([id, g]) =>
        `<tr><td>${esc(id)}</td><td class="n">${g.total}</td><td class="n">${g.errors}</td><td>${esc(Object.keys(g.versions || {}).join(', '))}</td><td class="dim">${new Date(g.lastTs).toLocaleString()}</td></tr>`).join('');
      const ferrs = (c.errors || []).map((e) =>
        `<details><summary><b>${esc(e.name || '?')}</b> ×${e.count} <span class="dim">— ${esc(Object.keys(e.instances || {}).join(', '))} · ${new Date(e.lastTs).toLocaleString()}${e.version ? ' · v' + esc(e.version) : ''}</span></summary><pre>${esc(e.stack || e.detail || t('(no stack)'))}</pre></details>`).join('')
        || `<p class="dim">${esc(t('No errors recorded — nothing crashed in this window.'))}</p>`;
      return `<h2>${esc(t('Fleet (central collector)'))}</h2>
      <p class="dim">${esc(t('Batches forwarded by other instances. Total events: {n}.', { n: c.total }))}</p>
      <table><tr><td class="dim">${esc(t('instance'))}</td><td class="n dim">${esc(t('events'))}</td><td class="n dim">${esc(t('errors'))}</td><td class="dim">${esc(t('versions'))}</td><td class="dim">${esc(t('last seen'))}</td></tr>${rows}</table>
      <h2>${esc(t('Fleet errors'))}</h2>${ferrs}`;
    })()}
    </body>`;
    this.openBrowser(URL.createObjectURL(new Blob([html], { type: 'text/html' })));
  },
  });
}
