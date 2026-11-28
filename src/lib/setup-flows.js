import { escHtml, showToast, showConfirmDialog, fetchJson, createModalShell, storeRestoreUnsavedWords, storeUnsavedWords } from './utils.js';
import { storesUnsaved } from './store-held.js'; // B-225b's remainder: the rollback points' failed save, named at the dialog's head
import { maybeNagVault } from './vault-unlock.js'; // lane vault-e2e-password: the tour ends ⇒ the second password (while not set up)
import { TerminalSession } from './terminal.js';
import { t, tc } from './i18n.js';
import { stampAt as when, clockOf, span } from './page-time.js'; // lane ui-language: the ONE formatter of a time / number a person reads
import { settingsDoor } from './need-line.js'; // lane ui-needs-a-button pick 5: a refusal toast's door
import { reportRefusal, fleetRefusal } from './diagnostics-answer.js'; // B-360d r887: a report's answer that is no report is said, never drawn
import { techFoldHtml } from './plain-words.js'; // lane ui-plain-words: the report's instance and data folder fold
import { sessionDisplayName } from '../session-name.js'; // THE name ladder — a drift-ledger row names its conversation (lane record-oracle-2-1-296)
import * as chanCaps from '../channel-caps.js'; // lane channel-row-notices: a parked push lane's whole sentence (the row says one line)
import { attendedSection } from './attended-tally-words.js'; // B-64c1: the turns a person pressed (not counted) — counts only
import { diagnosticsSection } from './cli-registration-words.js'; // lane cli-2-1-308-records: a claude build this release has no record table for
import { SIGN_IN, tourSteps, folderChips, firstFilesFolder } from '../day-one.js'; // lane door-day-one-landing: the tour's steps, its folder chips; a sign-in terminal is not a session row
import { pathField } from './path-field.js'; // lane path-field: the first chat's folder is THE path field too
import { loadHomeFolders, recentLocalCwds, paintFolderChips } from './folder-chips.js'; // lane door-day-one-landing: the folder chips' painter (the New Session dialog's too)
import { SignInCard } from './signin-card.js'; // lane door-signin-card: the humane sign-in card inline in the tour's connect step
import { capsOf } from '../backend-caps.js'; // PURE (lane signin-card-real-screen): the harness whose subscriptions the card signs in — its declared oauthUsage row, never an id
/** a set-password refusal in a person's words: a HELD sign-in file (B-dc3f) says why and the way out (the server's own words, in
 *  the asked language) — never its bare code; any other refusal is the server's error, as before */
const refusalText = (d) => (d && d.error === 'signin-held' && d.why ? [d.why, d.fix].filter(Boolean).join(' ') : (d && d.error) || t('Failed'));

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
     * closes itself — the caller resumes (the tour steps aside while it
     * is up — a form is a window under the tour's overlay — and returns).
     * Returns true when checkDone passed, false on cancel.
     */
    runGuidedCli({ title, cmd, hint, checkDone }) {
      let own = null;
      const outcome = new Promise((resolve) => {
        // lane dialog-yield r3: the flow is its COMMAND — the same sign-in asked again is the running one (raised; this call
        // answers with ITS outcome, never a false while it runs on); another flow opens beside it — a sign-in running in its
        // terminal is never closed by a neighbour's open
        const { body, close, raised, overlay } = createModalShell({ id: 'guided-cli-dialog', key: cmd, undismissable: true, title, dialogClass: 'guided-cli-dialog', bodyClass: 'guided-cli-body', escapeToClose: false, kind: 'form' });
        if (raised) { (overlay._guided || Promise.resolve(false)).then(resolve); return; }
        own = overlay; // (no Escape: the sign-in runs in its terminal — Escape is the terminal's key)
        body.innerHTML = `
          <div class="guided-cli-status"><span class="upload-active-spinner" aria-hidden="true"></span><span class="gc-msg">${escHtml(t('Follow the prompts in the terminal below — this closes automatically when done.'))}</span></div>
          ${hint ? `<div class="mounts-field-hint">${escHtml(hint)}</div>` : ''}
          <div class="guided-cli-term"></div>`;
        const statusEl = body.querySelector('.guided-cli-status');
        const termBox = body.querySelector('.guided-cli-term');
        let term = null, sid = null, poll = null, settled = false;
        // A RECONNECT RE-ATTACHES THE MODAL'S TERMINAL (lane signin-card-real-screen, naive41 2.369.344: the guided
        // «Log in to Claude Code» terminal went DEAD — keys never echoed — while its HTTP done-poll kept working and
        // flipped it to ✓ by itself). app.js re-attaches every terminal in `this.sessions` on a socket's reconnect;
        // this one lives in a modal, not there, so after the first reconnect (a tab in the background while the person
        // signs in in another one) its socket was attached to nothing. It re-attaches itself now.
        const onState = (connected) => { if (!connected || !sid || !term || settled) return; try { this.ws.send({ type: 'attach', sessionId: sid }); } catch {} requestAnimationFrame(() => { try { term?.fit(); } catch {} }); };
        try { this.ws.onStateChange(onState); } catch {}
        const cleanup = (killSession) => {
          clearInterval(poll);
          try { this.ws.offStateChange?.(onState); } catch {}
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
        this.ws.send({ type: 'create', backend: 'shell', mode: 'terminal', name: cmd.split(' ')[0], reqId, ephemeral: true, purpose: SIGN_IN });
      });
      if (own) own._guided = outcome;   // what a re-open of this flow answers with
      // THE GUIDE YIELDS WHILE ITS WINDOW IS UP (lane ui-phone-and-fit #4 — the walk: after «安装» the tour's card stayed on
      // top and the install window opened BEHIND it, as if nothing happened). Since lane dialog-yield a form is a window of
      // the window manager, which the tour's #welcome overlay covers — so while a guided window opened from the tour is
      // up, the tour steps aside (hidden, its step kept), and comes back when that window closes, whatever ended it
      const welcome = own && document.getElementById('welcome');
      if (welcome && welcome.classList.contains('onboarding')) {
        welcome.classList.add('ob-yield');
        outcome.finally(() => welcome.classList.remove('ob-yield'));
      }
      return outcome;
    },

    _modal(title, { wide = false } = {}) {
    const { overlay, body, close, raised } = createModalShell({
      id: 'cfg-dialog-overlay', key: title, title, bodyClass: 'cfg-dialog-body',   // (each settings flow is its title's: Backup & migrate, the password)
      minWidth: wide ? '440px' : null, escapeToClose: true, kind: 'form',
    });
    return { overlay, body, close, raised };
  },

    _showTransferDialog(initialTab = 'export', presetFile = null) {
    const { body: shell, close, raised } = this._modal(t('Backup & migrate'), { wide: true });
    if (raised) return;   // raised: the open Backup & migrate, as it was
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
    const { body, close, raised } = this._modal(enabled ? t('Change password') : t('Set a password'));
    if (raised) return;   // raised: the password form being filled, as it was
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
        if (!res.ok) { err.textContent = refusalText(d); return; }
        this._authEnabled = true;
        this._settingsUI?.redrawOpen?.();   // lane setting-doors f1: the open Settings redraws — its sign-in line is true again
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
        if (!res.ok) { err.textContent = refusalText(d); return; }
        this._authEnabled = false;
        this._settingsUI?.redrawOpen?.();   // lane setting-doors f1: the open Settings redraws — its sign-in line is true again
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
    let step = startStep, drawnPlan = ''; // B-7959: the step plan the screen was last drawn with
    const STEP_OF = { welcome: 0, connect: 1, protect: 2, start: 3 };
    const dotsOf = (plan) => plan.map((name) => `<span class="ob-dot${STEP_OF[name] === step ? ' active' : ''}"></span>`).join('');
    const teardown = () => {
      this._obKeyHandler?.abort?.(); this._obKeyHandler = null;
      this._obRedraw = null; // B-7959
      welcome.classList.remove('onboarding');
      welcome.classList.add('hidden'); // _checkWelcome re-shows it only on an empty desktop
      content.innerHTML = content.dataset.saved;
      // re-wire the plain welcome buttons (innerHTML replace dropped listeners)
      content.querySelector('#welcome-new')?.addEventListener('click', () => this.showNewSessionDialog());
      content.querySelector('#welcome-files')?.addEventListener('click', () => this.openFileExplorer(undefined, { attended: true }));   // B-23e5 (a): pressed
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
      // lane door-day-one-landing: the steps this workspace needs (src/day-one.js tourSteps) — a workspace the admin already
      // protects (SSO, a sign-in password) skips «Protect this workspace» and its SSO sentence: the person just signed in
      const plan = tourSteps({ ssoEnabled: !!this._ssoEnabled, authEnabled: !!this._authEnabled });
      drawnPlan = plan.join();
      if (step === 2 && !plan.includes('protect')) step = 3;
      const dots = dotsOf(plan);
      if (this._obSignInCard) { try { this._obSignInCard.destroy(); } catch { } this._obSignInCard = null; } // lane door-signin-card
      if (step === 0) {
        // lane door-day-one-landing (the naive-user studies: a pitch to coding agents, a promise of a terminal UI and 6
        // themes × 4 languages on screen one — "is this even for me?"): ONE sentence of what it is for, in plain words, and
        // three things a person could ask. Theme and language wait in ⚙ (the gear menu keeps both).
        content.innerHTML = `
          <h1>${t('Welcome to VibeSpace')}</h1>
          <p class="ob-sub">${escHtml(t('An assistant that works on your files — ask it in plain words.'))}</p>
          <div class="ob-asks">
            <div class="ob-asks-head">${escHtml(t('For example:'))}</div>
            <div class="ob-ask">${escHtml(t('Read the contracts in my folder and list when each one renews.'))}</div>
            <div class="ob-ask">${escHtml(t('Check the numbers in this report against the spreadsheet and fix what is wrong.'))}</div>
            <div class="ob-ask">${escHtml(t('Turn my notes into a one-page summary I can send.'))}</div>
          </div>
          <div class="welcome-actions">
            <button class="welcome-btn" id="ob-next">${t('Get started')}</button>
            <button class="welcome-btn welcome-btn-secondary" id="ob-skip">${t('Skip tour')}</button>
          </div>
          <div class="ob-dots">${dots}</div>`;
        content.querySelector('#ob-next').onclick = () => { step = 1; render(); };
        content.querySelector('#ob-skip').onclick = done;
      } else if (step === 1) {
        content.innerHTML = `
          <h1>${t('Connect your agents')}</h1>
          <p class="ob-sub">${t('Sign in to your Claude account to start a conversation.')}</p>
          <div id="ob-signin"></div>
          <div class="ob-warn" id="ob-signin-warn" hidden>${t('You are not signed in yet — you won’t be able to start a chat. Continue anyway?')}</div>
          <details class="ob-advanced"><summary>${t('Advanced: sign in from a terminal, or add Codex')}</summary>
          <div class="ob-backends" id="ob-backends"><div class="ob-loading">${t('Checking…')}</div></div></details>
          <div class="welcome-actions">
            <button class="welcome-btn" id="ob-next">${t('Continue')}</button>
            <button class="welcome-btn welcome-btn-secondary" id="ob-back">${t('Back')}</button>
          </div>
          <div class="ob-dots">${dots}</div>`;
        // lane door-signin-card: the humane sign-in card inline; the connect step cannot be
        // skipped SILENTLY — Continue, when nothing is signed in, warns once and relabels first.
        this._obSignInCard = new SignInCard({ ws: this.ws, hasWaiting: () => false,
          onConnected: () => { this._obSignedIn = true; const w = content.querySelector('#ob-signin-warn'); if (w) w.hidden = true; try { refresh(); } catch { } } });
        this._obSignInCard.mount(content.querySelector('#ob-signin'));
        const obNext = content.querySelector('#ob-next');
        obNext.onclick = () => {
          if (!this._obSignedIn && !this._obReady && !this._obWarnedOnce) {
            this._obWarnedOnce = true;
            const w = content.querySelector('#ob-signin-warn'); if (w) w.hidden = false;
            obNext.textContent = t('Continue anyway');
            return;
          }
          step = 2; render();
        };
        content.querySelector('#ob-back').onclick = () => { step = 0; render(); };
        const refresh = async () => {
          let st = {};
          try { st = await fetchJson('/api/backend-status'); } catch {}
          // lane door-signin-card: readiness gates the tour's Continue warning (a terminal login via the
          // Advanced road, or a named account/pool, also counts as signed in)
          const obReady = (k) => { const b = st[k] || {}; return !!(b.loggedIn || (b.namedLoggedIn || 0) > 0); };
          this._obReady = obReady('claude') || obReady('codex');
          // a sign-in still being read is asked ONCE more after the file door's deadline (it ends read or named unreadable)
          if (!this._obReread && Object.values(st).some((b) => b && (b.namedUnread || 0) > 0)) { this._obReread = true; setTimeout(() => { if (content.isConnected) refresh(); }, 6000); }
          if (this._obReady) { const w = content.querySelector('#ob-signin-warn'); if (w) w.hidden = true; }
          const card = (key, label, loginCmd, installCmd) => {
            const b = st[key] || {};
            // Named/pooled accounts count as READY (2.267.4, user request:
            // onboarding must not force the machine-wide login — accounts
            // added per-directory or as a pool work without it).
            // …for EVERY backend (2.369.21): the 2.267.4 fix was claude-only, so
            // codex named accounts / pools never satisfied onboarding
            const named = b.namedLoggedIn || 0;
            // B-360d: a named account whose sign-in is not read yet (or could not be read) is said so — never «not logged in»
            const unread = b.namedUnread || 0, unreadable = b.namedUnreadable || 0;
            const state = !b.installed ? `<span class="ob-bad">${t('not installed')}</span>`
              : b.loggedIn ? `<span class="ob-ok">✓ ${t('ready')}</span>`
              : named > 0 ? `<span class="ob-ok">✓ ${t('{n} named account(s) in use', { n: named })}</span>`
              : unread > 0 ? `<span class="ob-warn">${t('reading {n} account sign-in(s)…', { n: unread })}</span>`
              : unreadable > 0 ? `<span class="ob-warn">${t('{n} account sign-in(s) could not be read', { n: unreadable })}</span>`
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
              // lane signin-card-real-screen (the naive41 dead modal): Claude's terminal road is the card's OWN login
              // run shown as its raw screen — one run per account (a live one is joined), never a second TUI beside it
              if (capsOf(key).oauthUsage === true && !isInstall && typeof this._openSignInCard === 'function') { this._openSignInCard({ rawFirst: true, onClose: () => refresh() }); return; }
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
        // reached only where nothing protects the workspace yet (tourSteps) — an SSO / password workspace never shows this
        // step, nor the SSO sentence it carried (lane door-day-one-landing: it followed a password sign-in on every pod)
        const protectedAlready = !!this._authEnabled;
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
            if (!res.ok) { errEl.textContent = refusalText(d); return; }
            this._authEnabled = true;
            this._settingsUI?.redrawOpen?.();   // lane setting-doors f1: the open Settings redraws — its sign-in line is true again
            step = 3; render();
          } catch { errEl.textContent = t('Failed'); }
        });
      } else {
        // lane door-day-one-landing (the naive-user studies: a grey /home/<user> placeholder, «project folder», Chat vs
        // Terminal side by side — every tester typed `…/work` by guessing): the home's folders as chips, the one holding the
        // most files CHOSEN (src/day-one.js folderChips / firstFilesFolder), ONE primary button — a chat on their files
        content.innerHTML = `
          <h1>${escHtml(t('Start your first chat'))}</h1>
          <p class="ob-sub">${escHtml(t('Pick the folder with your files — the assistant works inside it'))}</p>
          <div class="cwd-recent ob-chips" id="ob-chips"></div>
          <input type="text" id="ob-cwd" class="ob-cwd" placeholder="${escHtml(t('or type a folder…'))}" autocomplete="off">
          <div class="welcome-actions">
            <button class="welcome-btn" id="ob-chat">${escHtml(t('Start the chat'))}</button>
          </div>
          <div class="ob-alt"><a href="#" id="ob-term">${escHtml(t('or a terminal'))}</a> · <a href="#" id="ob-files">${t('or browse files first')}</a> · <a href="#" id="ob-finish">${t('finish tour')}</a></div>
          <div class="ob-dots">${dots}</div>`;
        const cwdInput = content.querySelector('#ob-cwd');
        const chipsEl = content.querySelector('#ob-chips');
        const cwdPf = pathField(cwdInput, { kind: 'folder', id: 'first-chat-cwd', createWhen: t('Create this folder when the chat starts') });
        cwdInput.addEventListener('input', () => { for (const x of chipsEl.querySelectorAll('.cwd-recent-chip.selected')) x.classList.remove('selected'); });
        loadHomeFolders().then((folders) => {
          if (!chipsEl.isConnected) return;
          const chips = folderChips({ folders, recent: recentLocalCwds(this) });
          const first = cwdInput.value.trim() ? null : firstFilesFolder(chips);
          if (first) cwdPf.set(first, { commit: false });
          paintFolderChips(chipsEl, chips, { selected: first, onPick: (c) => { cwdPf.set(c.path, { commit: false, by: 'person' }); } });
        });
        const go = async (mode) => {
          const openAt = this._openStartNow?.();   // B-c87d r871: the start is this press, read before the folder's commit and ensure
          // lane path-field: the field's resolution (a relative one / a few letters) — one that does not take stays here and says why
          const v = cwdInput.value.trim() ? await cwdPf.commit() : null;
          if (cwdInput.value.trim() && (!v || !(await cwdPf.ensure()))) return;
          const cwd = v ? v.path : undefined;
          done();
          this.createSession({ cwd, mode, backend: 'claude', openAt });
        };
        content.querySelector('#ob-chat').onclick = () => go('chat');
        content.querySelector('#ob-term').onclick = (e) => { e.preventDefault(); go('terminal'); };
        content.querySelector('#ob-files').onclick = (e) => { e.preventDefault(); done(); this.openFileExplorer(undefined, { attended: true }); };   // B-23e5 (a): pressed
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
    // B-7959: the open tour's DOTS, drawn again with the facts it has NOW (app.js _maybeShowOnboarding: a hub whose /api/home
    // answered after the bounded wait) — only the dots, never the step (r2, the unit's adversarial read: a whole render
    // destroyed a sign-in card mid-sign-in, refilled a typed folder, moved a step); the next press reads the plan anyway
    this._obRedraw = () => {
      if (!welcome.classList.contains('onboarding')) return;
      const plan = tourSteps({ ssoEnabled: !!this._ssoEnabled, authEnabled: !!this._authEnabled });
      if (plan.join() === drawnPlan) return;
      drawnPlan = plan.join();
      const box = content.querySelector('.ob-dots'); if (box) box.innerHTML = dotsOf(plan);
    };
    render();
  },

  // Layout rollback (2.296.0). Sessions survive almost everything, but WHERE
  // they lived does not: a bug that rewrites window→desktop placement used to
  // be unrecoverable (hand-editing layouts.json was the only path, and if the
  // damage emptied a desktop the pre-damage mapping was simply gone). The
  // server writes a rollback point before every layout SHAPE change; this is
  // the one click that uses them.
  // A TILE'S DOOR (lane layout-stopped-window r3): `slot` = {desktopId, entry, name} of a «Session unavailable» window — the server
  // answers the newest point that still names a conversation for it (`pick`), and the dialog opens with that desktop selected.
  async _showLayoutHistory(slot = null) {
    const e0 = slot && slot.desktopId && slot.entry && typeof slot.entry === 'object' ? slot.entry : null;
    // THE SUBJECT IS THE SLOT (r4): a tile's door draws ITS pick — a second tile's door (or ⚙ → System's bare list, key null)
    // replaces the open one through its door; the same slot's door raises it as it was
    const key = e0 ? `slot:${slot.desktopId}:${e0.winId || e0.id || ''}` : null;
    const { body, close, raised, ready, live } = createModalShell({ id: 'layout-history-dialog', key, title: t('Restore a previous layout'), minWidth: '460px', escapeToClose: true, kind: 'form' });
    if (raised) return null;   // raised: the same subject's form, as it was
    if (!(await ready)) return null;   // queued behind the open one's door — null: the person kept that one
    // lane phone-dock-restore (the owner 2026-11-02: «恢复之前的布局…加载速度有点慢，然后也没有任何提示»): A DOOR THAT WAITS SAYS IT WAITS —
    // the shell paints at once with what it reads; a read that failed is said here, never «no rollback points yet»
    body.innerHTML = `<div class="empty-hint" role="status">${escHtml(t('Reading the layout history…'))}</div>`;
    const q = e0 ? '?' + new URLSearchParams({ desktop: String(slot.desktopId), win: String(e0.winId || e0.id || ''), type: e0.type === 'terminal' ? 'terminal' : 'chat', title: String(e0.title || ''), cwd: String(e0.cwd || e0.openSpec?.cwd || ''), name: typeof e0.openSpec?.name === 'string' ? e0.openSpec.name : '' }).toString() : '';
    const r = await fetchJson('/api/layout-history' + q).catch(() => null);
    if (!live()) return null;   // another slot's door replaced it meanwhile
    if (!r || r.error || !Array.isArray(r.entries)) {
      body.innerHTML = `<div class="usage-note lh-error" role="alert">${escHtml(t('Could not read the layout history: {error}', { error: (r && r.error) || t('no answer') }))}</div>`;
      return;
    }
    const entries = r.entries;
    const pick = e0 && r?.pick && typeof r.pick === 'object' ? r.pick : null;
    if (!entries.length) {
      body.innerHTML = `<div class="usage-note">${escHtml(t('No rollback points yet — one is written whenever your window layout changes shape.'))}</div>`;
      return;
    }
    const slotName = String((slot && slot.name) || '');
    // B-225b's remainder: while the rollback points' save is refused, the dialog says so at its head (the newest point is older than it seems)
    const unsavedNow = storesUnsaved();
    const pointsUnsaved = Array.isArray(unsavedNow) ? unsavedNow.find((u) => u && u.file === 'layout-history') : null;
    const pointsNote = pointsUnsaved ? `<div class="usage-note lh-unsaved" role="status">${escHtml(storeUnsavedWords(pointsUnsaved))}</div>` : '';
    const slotNote = e0 ? `<div class="usage-note lh-slot">${escHtml(pick ? t('Selected: the newest point that still names the conversation of “{name}” — press it to restore that desktop as it was then.', { name: slotName }) : t('No rollback point names the conversation of “{name}”.', { name: slotName }))}</div>` : '';
    body.innerHTML = `${pointsNote}${slotNote}
      <div class="usage-note">${escHtml(t('Each entry is the layout as it was BEFORE a change. Restoring reloads the page; your sessions are not touched.'))} ${escHtml(t('Press a desktop to restore it alone — your other desktops stay as they are now.'))}</div>
      <div class="lh-list">${entries.map((e) => {
        const per = Object.entries(e.summary || {}).map(([n, c]) => `${escHtml(n)} ${c}`).join(' · ');
        // ONE PRESS RESTORES ONE DESKTOP (lane layout-stopped-window — the owner's 个人 lost seven windows while 工作 / 研究 had
        // moved on): each desktop of the point is its own door (its summary key; the legacy top-level record has none)
        // B-225b's remainder P5: a point that cannot be read is LISTED with its reason and NEVER offered (no door to restore it)
        if (e.unread) return `<div class="lh-row lh-unread"><div class="lh-main"><b>${escHtml(when(e.at))}</b>
            <div class="lh-sub lh-unread-why">${escHtml(t('This rollback point cannot be read ({code}) — it is not offered.', { code: String(e.unread) }))}</div></div></div>`;
        const desks = Object.entries(e.summary || {}).filter(([n]) => n).map(([n, c]) => `<button class="lh-desk" data-id="${escHtml(e.id)}" data-desk="${escHtml(n)}" title="${escHtml(t('Restore only “{desktop}”', { desktop: n }))}">${escHtml(n)} ${escHtml(t('{n} windows', { n: c }))}</button>`).join('');
        // what changed right after this point ("HR 3 → 1") — the row a loss FOLLOWS is the one to restore (userW
        // inc-mun7qjmw-iksh); a point from before the field existed has none
        const change = Array.isArray(e.change) && e.change.length
          ? e.change.map(([n, a, b]) => t('{desktop} went from {a} to {b} windows', { desktop: n || t('Desktop'), a, b })).join(' · ') : ''; // lane ui-plain-words gear-and-system-15: «个人 1 → 0» said in words
        // the point the hub's restart found (B-b05e — pinned: no burst after the restart pushes it out) says so
        return `<div class="lh-row"><div class="lh-main"><b>${escHtml(when(e.at))}</b>${e.restart ? `
            <div class="lh-sub lh-restart">${escHtml(t('As it was before the server restarted'))}</div>` : ''}
            <div class="lh-sub">${escHtml(t('{n} windows', { n: e.totalWindows || 0 }))}${per ? ' — ' + escHtml('') + per : ''}</div>${change ? `
            <div class="lh-sub lh-change">${escHtml(t('Then: {changes}', { changes: change }))}</div>` : ''}${desks ? `
            <div class="lh-desks">${desks}</div>` : ''}</div>
          <button class="agent-btn lh-restore" data-id="${escHtml(e.id)}">${escHtml(tc('layout', 'Restore'))}</button></div>`;
      }).join('')}</div>`;
    // THE PRESS SAYS IT RUNS (lane phone-dock-restore — measured: from the confirm's OK to the toast the dialog stood as it was,
    // the hub's whole restore long): the pressed button's busy words at once, the list held (one restore at a time); a refusal
    // gives both back. THIS page's own restore is no «other device»: the hub's broadcast reaches the page that asked too —
    // r2 (P4): the press names it (`rid`, sent with the POST, echoed in the broadcast); app.js 'layout-restored' knows it by
    // THIS rid only — another restore during it is another device's. Round 3 (Q1 — a lost answer left «正在恢复…» for ever: the
    // POST has no timeout): the broadcast naming this rid IS the hub's word that the restore landed (it broadcasts on success
    // only) — app.js calls `own.landed`; whichever word comes first says it and reloads, once
    const [list] = body.querySelectorAll('.lh-list');
    const busy = (b, done) => {
      const was = b.textContent, own = { rid: 'r' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36), over: false };
      b.textContent = t('Restoring…'); b.setAttribute('aria-busy', 'true'); if (list) list.inert = true; this._layoutRestoring = own;
      const end = (res) => {
        if (own.over) return true;
        // B-225b's second half: the restore stands in the hub's memory but its write was refused (`store_unsaved`) — said BY NAME, never
        // «restored»; the page reloads to show what memory holds (the strip says it is not being saved)
        if (res?.code === 'store_unsaved') { own.over = true; if (this.layoutManager) this.layoutManager._restoreReload = true; close(); showToast(res.error || storeRestoreUnsavedWords(), { type: 'error', duration: 12000 }); setTimeout(() => location.reload(), 4000); return true; }
        if (res?.success) { own.over = true; if (this.layoutManager) this.layoutManager._restoreReload = true; close(); showToast(done); setTimeout(() => location.reload(), 800); return true; } // the restore armed the reload: nothing of this page's leaves (layout.js _restoreArmed)
        b.textContent = was; b.removeAttribute('aria-busy'); if (list) list.inert = false; this._layoutRestoring = null;
        showToast(res?.error || t('Restore failed'), { type: 'error' });
        return false;
      };
      own.landed = () => end({ success: true });
      own.unsaved = (u) => end({ code: 'store_unsaved', error: storeRestoreUnsavedWords(u && u.code) });
      end.rid = own.rid;
      return end;
    };
    body.querySelectorAll('.lh-restore').forEach((b) => {
      b.onclick = async () => {
        // showConfirmDialog takes an OPTIONS OBJECT (utils.js:91) — a bare
        // string destructures to undefined for every field, rendering a
        // generic "Confirm"/empty body on an action that replaces the whole
        // layout and reloads the page.
        if (!(await showConfirmDialog({
          title: t('Restore a previous layout'),
          message: t('Restore this layout? Your current one becomes a rollback point too, so this is undoable.'),
          confirmText: tc('layout', 'Restore'), // the dialog's own verb, «恢复» like its title (lane ui-plain-words gear-and-system-15)
        }))) return;
        const end = busy(b, t('Layout restored — reloading…'));
        const res = await fetchJson('/api/layout-history/' + encodeURIComponent(b.dataset.id) + '/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rid: end.rid }) }).catch(() => null);
        end(res);
      };
    });
    body.querySelectorAll('.lh-desk').forEach((b) => {
      b.onclick = async () => {
        const desk = b.dataset.desk;
        if (!(await showConfirmDialog({
          title: t('Restore a previous layout'),
          message: t('Restore only “{desktop}” as it was then? Your other desktops stay as they are now; the current layout becomes a rollback point too, so this is undoable.', { desktop: desk }),
          confirmText: t('Restore only “{desktop}”', { desktop: desk }),
        }))) return;
        const end = busy(b, t('“{desktop}” restored — reloading…', { desktop: desk }));
        const res = await fetchJson('/api/layout-history/' + encodeURIComponent(b.dataset.id) + '/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desktop: desk, rid: end.rid }) }).catch(() => null);
        end(res);
      };
    });
    const picked = pick ? [...body.querySelectorAll('.lh-desk')].find((b) => b.dataset.id === pick.id && b.dataset.desk === pick.desk) : null;
    if (picked) { picked.classList.add('is-picked'); picked.setAttribute('aria-current', 'true'); picked.closest('.lh-row')?.classList.add('is-picked'); picked.scrollIntoView?.({ block: 'nearest' }); picked.focus?.(); }
  },

  /** lane hub-loop-stalls (law L): ONE profile of the server's main thread — one sample a second for ten minutes, then it
   *  stops by itself; the result is shown in the Diagnostics report (and carried in an incident bundle). */
  async _profileServer() {
    const r = await fetchJson('/api/loop-holds/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    // lane hub-loop-stalls: a refusal is answered AT THE PRESS, by name (never a success toast and «did not run» ten minutes later)
    const why = { heap_near_limit: t('The profile did not start: the server’s memory is near its limit, and sampling it now could run it out of memory.'),
      sampling_off: t('The profile did not start: “Name the code that holds the server” is off.'),
      debugger_attached: t('The profile did not start: a debugger is attached to the server.'),
      setting_unknown: t('The profile did not start: the server has not read its settings yet — try again in a moment.'),
      no_watchdog: t('The profile did not start: the server’s watchdog thread is not running.'),
      no_inspector: t('The profile did not start: this server’s Node has no inspector.') }[r && r.error];
    if (why) { showToast(why, { type: 'error', ...(r.error === 'sampling_off' ? { action: settingsDoor(this, 'telemetry.loopHoldSampling', { label: t('Turn on…') }) || undefined } : {}) }); return; }
    if (!r || r.error || !r.ok) { showToast(t('Could not start the profile: {why}', { why: (r && r.error) || t('no answer') }), { type: 'error' }); return; }
    showToast(t('Profiling the server until {time} — then open ⚙ System → Diagnostics report…', { time: clockOf(r.until) }));
  },

  /** lane hub-loop-stalls commit 3: ONE 20 s CPU capture of the server's main thread (POST /api/loop-holds/capture answers
   *  its table when it ends); a refusal is said AT THE PRESS by name; then the Diagnostics report opens with it in «Main
   *  loop held». The switch «Name the code that holds the server» turns only the automatic capture off — this door works. */
  async _captureCpuProfile() {
    showToast(t('Capturing a CPU profile of the server for 20 s…'));
    const r = await fetchJson('/api/loop-holds/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const why = { debugger_attached: t('The CPU profile did not run: a debugger is attached to the server.'),
      heap_near_limit: t('The CPU profile did not run: the server’s memory is near its limit, and sampling it now could run it out of memory.'),
      no_watchdog: t('The CPU profile did not run: the server’s watchdog thread is not running.'),
      no_inspector: t('The CPU profile did not run: this server’s Node has no inspector.'),
      capture_running: t('A CPU profile is already running — its table is in the Diagnostics report when it ends.') }[r && r.error];
    if (why) { showToast(why, { type: 'error' }); return; }
    if (!r || !r.ok || !r.capture) { showToast(t('Could not capture the CPU profile: {why}', { why: (r && r.error) || t('no answer') }), { type: 'error' }); return; }
    this._openDiagnostics();
  },

    async _openDiagnostics() {
    const [d, c, ci, bt, csp, rt, reg, ch, lh] = await Promise.all([
      fetchJson('/api/telemetry/summary?days=14&drift=1'),
      fetchJson('/api/telemetry/central-summary?days=14'),
      fetchJson('/api/ci-heavy'),
      fetchJson('/api/boot-trace'),
      fetchJson('/api/csp-reports'), // lane app-page-csp: the page security policy's count (the chip below the title)
      fetchJson('/api/runtime'), // lane runtime-floor: the node this server runs against THE floor table (src/runtime-floor.js)
      fetchJson('/api/cli-registration'), // lane cli-2-1-308-records: the claude builds seen with no record table in this release
      fetchJson('/api/channels?scope=accounts'), // lane channel-row-notices: the accounts whose push lane is parked or demoted
      fetchJson('/api/loop-holds'), // lane hub-loop-stalls: what held the main loop since start (src/server/loop-holds.js)
    ]);
    // B-360d r887 (THE MUST): an answer that is no report — nothing came back, or the route's refusal (its files did not answer in
    // time) — is SAID with what to do, never drawn as a clean report (src/lib/diagnostics-answer.js)
    const refused = reportRefusal(d);
    if (refused) { showToast(`${refused.why ? t('The Diagnostics report could not be read just now.') : t('Could not load diagnostics')} ${t('Wait a moment and open it again.')}${refused.why ? ` (${refused.why})` : ''}`, { type: 'error' }); return; }
    const esc = escHtml;
    const kv = (obj) => Object.entries(obj || {}).map(([k, v]) =>
      `<tr><td>${esc(k)}</td><td class="n">${v}</td></tr>`).join('') || `<tr><td colspan="2" class="dim">${esc(t('No data'))}</td></tr>`;
    const errs = (d.errors || []).map((e) =>
      `<details><summary><b>${esc(e.name || '?')}</b> ×${e.count} <span class="dim">— ${when(e.lastTs)}${e.version ? ' · v' + esc(e.version) : ''}</span></summary><pre>${esc(e.stack || e.detail || t('(no stack)'))}</pre></details>`).join('')
      || `<p class="dim">${esc(t('No errors recorded — nothing crashed in this window.'))}</p>`;
    const days = Object.entries(d.byDay || {}).sort();
    const maxDay = Math.max(1, ...days.map(([, v]) => v));
    const bars = days.map(([day, v]) =>
      `<div class="bar" title="${esc(day)}: ${v}"><i style="height:${Math.max(2, Math.round(v / maxDay * 60))}px"></i><s>${esc(day.slice(5))}</s></div>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>${esc(t('VibeSpace diagnostics'))}</title><style>
      body{font:13px/1.5 system-ui;max-width:880px;margin:24px auto;padding:0 16px;color:#24292f}
      h2{margin:18px 0 6px} table{border-collapse:collapse;min-width:320px} td{border-bottom:1px solid #eee;padding:3px 10px 3px 0} td.n{text-align:right;font-variant-numeric:tabular-nums}
      .dim{color:#888} .faint{opacity:.6} pre{background:#f6f8fa;padding:8px;border-radius:6px;white-space:pre-wrap;font-size:12px}
      details{margin:4px 0;border:1px solid #eee;border-radius:6px;padding:4px 8px} summary{cursor:pointer}
      .chart{display:flex;align-items:flex-end;gap:3px;height:84px;margin:8px 0}
      .chip{display:inline-block;padding:1px 10px;border:1px solid #d0d7de;border-radius:12px;background:#f6f8fa;font-size:12px}
      .bar{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%} .bar i{display:block;width:16px;background:#54aeff;border-radius:2px 2px 0 0} .bar s{text-decoration:none;font-size:9px;color:#888;margin-top:2px}
    </style><body>
    <h1>${esc(t('VibeSpace diagnostics'))} <span class="dim" style="font-size:13px">— ${esc(t('last {n} days', { n: d.days }))}</span></h1>
    <p class="dim">${esc(t('This data stays on this machine. Total events: {n}.', { n: d.total }))}</p>
    ${techFoldHtml([`${t('instance')} ${d.instance || '?'}`, 'data/telemetry/'], { mono: true })}
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
    ${(() => {
      // lane channel-row-notices: a channel account's parked / demoted push lane said WHOLE — the cause, the install command,
      // the console steps the Channels row no longer carries (its ⓘ points here and to the setup card)
      const accts = ch && !ch.error && Array.isArray(ch.adapters) ? ch.adapters : [];
      const kinds = ch && !ch.error && Array.isArray(ch.kinds) ? ch.kinds : [];
      const rows = accts.filter((a) => a && a.push && chanCaps.pushLaneNotice(a.push, a.lane, { t, now: Date.now() }));
      if (!rows.length) return '';
      return `<h2>${esc(t('Channels — real-time push'))}</h2>` + rows.map((a) => {
        const k = kinds.find((x) => x && x.kind === a.kind);
        const steps = k && k.pushSetup && Array.isArray(k.pushSetup.steps) ? `<ol>${k.pushSetup.steps.map((s) => `<li>${esc(t(s.words))}${s.code ? ` <code>${esc(s.code)}</code>` : ''}</li>`).join('')}</ol>` : '';
        return `<p data-diag-push="${esc(a.id)}"><b>${esc(a.label || a.id)}</b> — ${esc(chanCaps.pushLaneText(a.push, a.lane, { t, now: Date.now() }))}</p>${steps}`;
      }).join('');
    })()}
    <h2>${esc(t('Errors'))}</h2>${errs}
    <h2>${esc(t('Performance metrics'))}</h2>${(() => {
      const m = d.metrics || {};
      const names = Object.keys(m).sort();
      if (!names.length) return `<p class="dim">${esc(t('No metrics yet — they accumulate as the app runs.'))}</p>`;
      const row = (n) => `<tr><td>${esc(n)}</td><td class="n">${m[n].count}</td><td class="n">${m[n].p50}</td><td class="n">${m[n].p95}</td><td class="n">${m[n].max}</td><td class="n"><b>${m[n].last}</b></td></tr>`;
      return `<table><tr><td class="dim">${esc(t('metric'))}</td><td class="n dim">${esc(tc('diagnostics', 'count'))}</td><td class="n dim">${esc(tc('diagnostics', 'median'))}</td><td class="n dim">p95</td><td class="n dim">${esc(tc('diagnostics', 'max'))}</td><td class="n dim">${esc(t('latest'))}</td></tr>${names.map(row).join('')}</table>`;
    })()}
    ${(() => {
      // THE BOOT HOLDS (B-1319): this server's start — the longest times its main loop was held (pages, paired
      // devices, the keeper and every timer waited), each named by the boot step it ran in; the top 5. Loading the
      // code is said apart (the port is not open yet, nothing waits). Absent on a server older than the route.
      // B-92a4: below them, a span's note (restore-probes: N unanswered …) and the boot's notes (the restore's re-probe).
      // Lane ledger-dedup-law r15: a hold's `faint` sites (what the tracer saw in it, too little to name it) greyed under its
      // named ones — r14 moved them out of `sites` and this table read `sites` only: they vanished.
      if (!bt || !Array.isArray(bt.holds)) return '';
      const said = [...(bt.spans || []).filter((s) => s.note).map((s) => `${s.name}: ${s.note}`), ...(Array.isArray(bt.notes) ? bt.notes : []).map((n) => `${n.at} ms · ${n.text}`)];
      const rows = bt.holds.slice(0, 5).map((h) => `<tr><td class="n">${h.at} ms</td><td class="n"><b>${h.ms} ms</b></td><td>${esc(h.name || '?')}${(h.sites || []).map((x) => `<div class="dim">${x.ms} ms · ${esc(x.what)}</div>`).join('')}${(h.faint || []).map((x) => `<div class="dim faint">${x.ms} ms · ${esc(x.what)}</div>`).join('')}</td></tr>`).join('');
      const greyed = bt.holds.slice(0, 5).some((h) => Array.isArray(h.faint) && h.faint.length);
      return `<h2>${esc(t('Server start — the longest holds'))}</h2>
      <p class="dim">${esc(t('How long the server\'s main loop was held while it started — pages, paired devices and timers waited that long. Start it with VIBESPACE_BOOT_TRACE=1 to name the file read or command behind each.'))}</p>
      <p>${esc(t('Code loaded in {ms} ms; longest hold since: {max} ms.', { ms: bt.mainMs ?? '?', max: bt.maxHoldMs ?? 0 }))}</p>
      ${rows ? `<table><tr><td class="n dim">${esc(t('after start'))}</td><td class="n dim">${esc(t('duration'))}</td><td class="dim">${esc(t('detail'))}</td></tr>${rows}</table>` : `<p class="dim">${esc(t('No hold of 100 ms or more since this server started.'))}</p>`}
      ${greyed ? `<p class="dim faint">${esc(t('Greyed lines: what the trace saw in that hold — too little of it to name the hold.'))}</p>` : ''}
      ${said.length ? `<ul class="dim">${said.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}`;
    })()}
    ${(() => {
      // lane hub-loop-stalls: WHAT HELD THE MAIN LOOP since this server started — the loop's utilization, the heap, the
      // since-start table by (verdict, top frame of VibeSpace's own code) and the newest hold lines (the journal's own
      // words, formatted by src/loop-hold.js — code locations only). Absent on a server older than the route.
      if (!lh || !lh.elu) return '';
      const p = (x) => (x == null ? '?' : Math.round(x * 100));
      const g = (b) => (b == null ? '?' : (b / 1073741824).toFixed(1));
      const s = (ms) => (ms / 1000).toFixed(1);
      const rows = (lh.table || []).slice(0, 15).map((r) => `<tr><td class="n"><b>${esc(s(r.totalMs))} s</b></td><td class="n">${esc(String(r.count))}</td><td class="n">${esc(s(r.worstMs))} s</td><td>${esc(r.verdict)} <span class="dim">· ${esc(r.frame)}</span></td></tr>`).join('');
      const state = lh.sampling && lh.sampling.on === false ? t('Sampling is off in Settings — the holds are still measured.') : lh.sampling && lh.sampling.debugger ? t('A debugger is attached — the sampler stands down while it is.') : '';
      return `<h2>${esc(t('Main loop held'))}</h2>
      <p class="dim">${esc(t('When the server stops answering for a second or more, its watchdog says what held it: running JavaScript (with the functions of VibeSpace’s own code that ran), native code or garbage collection, the system, or a wait for a processor.'))}</p>
      <p>${esc(t('The loop was busy {a} % of the last 10 s, {b} % of the last minute, {c} % since start.', { a: p(lh.elu.last10s), b: p(lh.elu.lastMinute), c: p(lh.elu.sinceStart) }))}${lh.heap ? ' ' + esc(t('Heap {used} of {limit} GB, external {ext} GB.', { used: g(lh.heap.heapUsed), limit: g(lh.heap.heapLimit), ext: g(lh.heap.external) })) : ''}</p>
      ${state ? `<p class="dim">${esc(state)}</p>` : ''}
      ${rows ? `<table><tr><td class="n dim">${esc(t('total held'))}</td><td class="n dim">${esc(t('times'))}</td><td class="n dim">${esc(t('worst'))}</td><td class="dim">${esc(t('what held it'))}</td></tr>${rows}</table>` : `<p class="dim">${esc(t('No hold of a second or more since this server started.'))}</p>`}
      ${(lh.holds || []).length ? `<details><summary>${esc(t('The latest holds ({n})', { n: lh.holds.length }))}</summary><pre>${(lh.holds || []).slice(0, 20).map((h) => esc(when(h.at, { seconds: true }) + ' · ' + h.line)).join('\n')}</pre></details>` : ''}
      ${heldDaysTable(d.loopHeld, { t, esc })}
      ${hourlyTable(lh.hourly, { t, esc })}
      ${(() => {
        const pf = lh.profile || {};
        if (pf.running) return `<p><b>${esc(t('A profile is running until {time}.', { time: clockOf(pf.running.until) }))}</b></p>`;
        const l = pf.last;
        if (!l) return `<p class="dim">${esc(t('⚙ System → Profile the server for 10 minutes: where the main thread’s time goes, by function.'))}</p>`;
        if (l.refused) return `<p class="dim">${esc(t(l.refusedWords || 'The last profile did not run.'))}</p>`;   // round 4: the table's sentence, never the raw token
        // lane hub-loop-stalls round 3: why it stopped and why samples were not taken are the server's ONE table of words
        // (src/loop-hold.js PROFILE_STOPPED / PROFILE_UNSAMPLED — the journal line says the same; zh / ja by i18n-check's key
        // tables); a cause the server did not word draws the neutral sentence, never another cause's
        const top = (l.top || []).map((x) => `<tr><td class="n"><b>${esc(String(x.pct))} %</b></td><td>${esc(x.frame)}</td></tr>`).join('');
        return `<h3>${esc(t('Profile — {n} samples, {time}', { n: l.samples, time: when(l.endedAt, { words: true }) }))}</h3>
        <p>${esc(t('Idle {idle} %, between JavaScript frames (promise jobs) {between} %, no JavaScript frame {nojs} %, not sampled {ns} %, JavaScript {js} %.', { idle: l.idlePct, between: l.betweenPct ?? 0, nojs: l.noJsPct, ns: l.notSampledPct ?? 0, js: l.jsPct }))}</p>
        ${l.notSampledPct ? `<p class="dim">${esc(t(l.notSampledWords || 'Some samples were not taken: the sampler stood down.'))}</p>` : ''}
        ${l.stopped ? `<p class="dim">${esc(t(l.stoppedWords || 'It stopped early.'))}</p>` : ''}
        ${l.tooLarge ? `<p class="dim">${esc(t('Its frames could not be kept (too large); the shares above are complete.'))}</p>` : ''}
        ${top ? `<table>${top}</table>` : ''}
        <p class="dim">${esc(t('One sample a second; a sample that does not answer within 50 ms counts as «no JavaScript frame» (native work or a system call).'))}</p>`;
      })()}
      ${(() => {
        // lane hub-loop-stalls commit 3: THE NEWEST CPU CAPTURE — the server's own table (src/cpu-capture.js: self time by
        // function, every share of the whole window, idle never work), its split, the collector from its record, and the
        // kept .cpuprofile files (the owner's cookie downloads them). Code names and paths are shown as they are.
        const cp = lh.capture || {};
        const files = Array.isArray(cp.files) ? cp.files : [];
        const dl = files.length ? `<p class="dim">${esc(t('Kept profiles (open them in a browser’s developer tools):'))} ${files.map((f) => `<a href="/api/loop-holds/cpu-profiles/${encodeURIComponent(f)}" download="${esc(f)}">${esc(f)}</a>`).join(' · ')}</p>` : '';
        if (cp.running) return `<p><b>${esc(t('A CPU profile is running until {time}.', { time: clockOf(cp.running.until) }))}</b></p>${dl}`;
        const l = cp.last;
        if (!l) return `<p class="dim">${esc(t('⚙ System → Capture a CPU profile (20 s): which of VibeSpace’s own code is using the processor. One is also taken by itself when the server is slow.'))}</p>${dl}`;
        const sp = l.split || {};
        const rows = (l.rows || []).map((x) => `<tr><td class="n"><b>${esc(String(x.pct))} %</b></td><td>${esc(x.fn)} <span class="dim">· ${esc(x.loc || '')}${x.via ? ` — ${esc(t('{pct} % through {fn}', { pct: x.viaPct, fn: x.via }))}` : ''}</span></td></tr>`).join('');
        return `<h3>${esc(t('CPU profile — {n} samples over {s} s, {time}', { n: l.samples, s: (l.windowMs / 1000).toFixed(1), time: when(l.endedAt, { words: true }) }))}</h3>
        <p class="dim">${esc(l.auto ? t('Taken by itself: the server was slow.') : t('Taken on request.'))}</p>
        <p>${esc(t('JavaScript {js} %, on the processor outside JavaScript {native} %, idle {idle} %.', { js: sp.js ?? 0, native: sp.native ?? 0, idle: sp.idle ?? 0 }))} ${l.gc && l.gc.pct != null ? esc(t('Garbage collection {gc} % of the window.', { gc: l.gc.pct })) : esc(t('Garbage collection not split.'))}</p>
        ${l.stopped ? `<p class="dim">${esc(t('It stopped early.'))}</p>` : ''}
        ${rows ? `<table>${rows}</table>` : `<p class="dim">${esc(t('No function used 3 % of the time or more.'))}</p>`}
        <p class="dim">${esc(t('Self time by function: time inside native calls is counted on the JavaScript caller; functions under 3 % are not listed.'))}</p>
        ${l.file ? `<p><a href="/api/loop-holds/cpu-profiles/${encodeURIComponent(l.file)}" download="${esc(l.file)}">${esc(t('Download this profile (.cpuprofile)'))}</a></p>` : ''}${dl}`;
      })()}`;
    })()}
    <h2>${esc(t('Events per day'))}</h2><div class="chart">${bars || `<span class="dim">${esc(t('No data'))}</span>`}</div>
    ${(() => {
      // lane mask-value-shape (the strip's step two, page §1 — the cure of 644a67ec2): A TOOL THAT DID NOT START, its ⚙ Diagnostics
      // home — each open conversation's start facts (its status bar holds them; absent ≠ clean: a conversation not open says nothing)
      const rows = [...(this.sessions?.values?.() || [])].map((v) => ({ v, items: (v && v._statusBar && v._statusBar.initHealthWords?.()) || [] })).filter((x) => x.items.length);
      if (!rows.length) return '';
      return `<h2>${esc(t('Tools that did not start'))}</h2><table class="start-tools">${rows.map((x) => x.items.map((h) => `<tr><td>${esc(String((x.v.winInfo && x.v.winInfo.title) || x.v.sessionId || ''))}</td><td title="${esc(h.row)}">${esc(h.words)}</td></tr>`).join('')).join('')}</table>`;
    })()}
    ${diagnosticsSection(reg, { t, esc, when })}
    ${(() => {
      // HARNESS DRIFT (design-unknown-records §3): unknown record types and
      // known types that grew a field, one row per (breadcrumb, detail) with
      // first/last seen and the VibeSpace versions that reported it — the CLI
      // build rides the detail (`· cli 2.1.274`). Absent when nothing drifted.
      const rows = Array.isArray(d.drift) ? d.drift : [];
      if (!rows.length) return '';
      const tr = rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.detail || '')}</td><td class="n">${r.count}</td><td class="dim">${when(r.firstTs)}</td><td class="dim">${when(r.lastTs)}</td><td class="dim">${esc((r.versions || []).join(', '))}</td></tr>`).join('');
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
      <p class="dim">${esc(t('Records VibeSpace knows that arrived carrying fields it does not declare. Handling is unchanged; the conversation\'s status bar shows one quiet chip counting these kinds — the sign that the CLI may have updated. Each row is one kind of record in one conversation, since this server started.'))}</p>
      <table class="drift-ledger"><tr><td class="dim">${esc(t('conversation'))}</td><td class="dim">${esc(t('harness record'))}</td><td class="dim">${esc(t('new fields'))}</td><td class="dim">${esc(t('CLI version'))}</td><td class="n dim">n</td></tr>${tr}</table>`;
    })()}
    <h2>${esc(t('By event'))}</h2><table>${kv(d.byName)}</table>
    <h2>${esc(t('By version'))}</h2><table>${kv(d.byVersion)}</table>
    ${attendedSection(d.attended, { t, esc })}
    ${(() => {
      // Heavy release-gate tier (2026-09-07): `npm run ci` gates the push with
      // the fast tier and the pre-push hook launches the heavy tier DETACHED,
      // so its verdict lands minutes later with nobody watching. This is where
      // a human finds it without knowing data/ci-heavy/ exists. Absent on a
      // deployment that never pushes — no runs, no section.
      const runs = (ci && ci.runs) || [], running = (ci && ci.running) || [];
      if (!runs.length && !running.length) return '';
      const dur = (ms) => span(ms);
      const rows = [
        // GREEN / RED / RUNNING stay untranslated: they are the gate's own
        // vocabulary (the marker files are literally <sha>.green / .red) and
        // `npm run ci:status` prints the same words at the terminal.
        ...running.map((r) => `<tr><td>${esc(r.sha.slice(0, 8))}</td><td>RUNNING</td><td class="n">—</td><td class="dim">${when(r.startedAt)}</td><td class="dim">pid ${r.pid}</td></tr>`),
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
        ...runs.map((r) => `<tr><td>${esc(r.sha.slice(0, 8))}</td><td><b>${r.result === 'green' ? (r.placed ? `PLACED (${Number(r.placed)})` : 'GREEN') : r.result === 'skipped' ? 'SKIP' : 'RED'}</b></td><td class="n">${esc(dur(r.ms))}</td><td class="dim">${when(r.endedAt)}</td><td class="dim">${r.result === 'skipped' ? esc(t('no verdict')) + (r.reason ? ' — ' + esc(r.reason) : '') : r.result === 'green' ? esc(t('{n} suites', { n: r.suites })) : esc(r.failed.join(', '))}${r.absent ? ` <span class="dim">· ${esc(t('{n} not present at that commit', { n: r.absent }))}</span>` : ''}${(r.flaky || []).length ? ` <span class="dim">· ${esc(t('flaky'))}: ${esc(r.flaky.join(', '))}</span>` : ''}${r.unlocked ? ` <span class="dim">· ${esc(t('ran without the machine lock'))}</span>` : ''}${r.scope === 'affected' ? ` <span class="dim">· ${esc(t('affected scope: {n} suites selected by that push', { n: r.selected }))}</span>` : ''}</td></tr>`),
      ].join('');
      return `<h2>${esc(t('Release gate — heavy tier'))}</h2>
      <p class="dim">${esc(t('Suites too slow for the pre-push gate (headless chrome, real servers, real CLIs). A RED run blocks the next push until a newer green run clears it — run npm run ci:status for the ancestry verdict.'))}</p>
      <table><tr><td class="dim">${esc(t('commit'))}</td><td class="dim">${esc(t('result'))}</td><td class="n dim">${esc(t('duration'))}</td><td class="dim">${esc(t('finished'))}</td><td class="dim">${esc(t('detail'))}</td></tr>${rows}</table>`;
    })()}
    ${(() => {
      // Fleet section: only on a collector instance that has received batches. B-360d r887: a fleet read that failed says so in ONE
      // line — never a block gone without a word (src/lib/diagnostics-answer.js)
      const fr = fleetRefusal(c);
      if (fr) return fr.say ? `<h2>${esc(t('Fleet (central collector)'))}</h2><p class="dim">${esc(t('The fleet\'s telemetry could not be read just now — open the report again in a moment.'))}${fr.why ? ` <span class="faint">(${esc(fr.why)})</span>` : ''}</p>` : '';
      if (!c.collector || !Object.keys(c.instances || {}).length) return '';
      const rows = Object.entries(c.instances).map(([id, g]) =>
        `<tr><td>${esc(id)}</td><td class="n">${g.total}</td><td class="n">${g.errors}</td><td>${esc(Object.keys(g.versions || {}).join(', '))}</td><td class="dim">${when(g.lastTs)}</td></tr>`).join('');
      const ferrs = (c.errors || []).map((e) =>
        `<details><summary><b>${esc(e.name || '?')}</b> ×${e.count} <span class="dim">— ${esc(Object.keys(e.instances || {}).join(', '))} · ${when(e.lastTs)}${e.version ? ' · v' + esc(e.version) : ''}</span></summary><pre>${esc(e.stack || e.detail || t('(no stack)'))}</pre></details>`).join('')
        || `<p class="dim">${esc(t('No errors recorded — nothing crashed in this window.'))}</p>`;
      return `<h2>${esc(t('Fleet (central collector)'))}</h2>
      <p class="dim">${esc(t('Batches forwarded by other instances. Total events: {n}.', { n: c.total }))}</p>
      <table><tr><td class="dim">${esc(t('instance'))}</td><td class="n dim">${esc(t('events'))}</td><td class="n dim">${esc(t('errors'))}</td><td class="dim">${esc(t('versions'))}</td><td class="dim">${esc(t('last seen'))}</td></tr>${rows}</table>
      <h2>${esc(t('Fleet errors'))}</h2>${ferrs}`;
    })()}
    </body>`;
    this.openBrowser(URL.createObjectURL(new Blob([html], { type: 'text/html' })), { title: t('VibeSpace diagnostics report') }); // a blob: page has no host to name it
  },
  });
}

/** lane hub-loop-stalls («the number», the owner's hub 2026-11-16): ⚙ Diagnostics «Main loop held» — THE HELD SECONDS PER
 *  DAY BY CAUSE, the telemetry summary's `loopHeld` (src/telemetry.js Telemetry.heldDays over the srv-loop-hold-ms rows,
 *  the cause = the hold's verdict): one row per cause (the seven days' larger first), today / yesterday / the seven days,
 *  then «all causes»; each cell the seconds and, in brackets, the holds. The days are the SERVER's UTC dates — nothing here
 *  reads a clock or a zone. A server older than the field ⇒ nothing. */
function heldDaysTable(held, { t, esc }) {
  const ps = held && held.today && held.yesterday && held.week ? [held.today, held.yesterday, held.week] : null;
  if (!ps) return '';
  const head = `<h3>${esc(t('Held per day, by cause'))}</h3><p class="dim">${esc(t('Seconds the main loop was held, and in brackets how many holds — from the telemetry this server keeps. The days are UTC days; today is {day}.', { day: held.today.from }))}</p>`;
  if (!held.week.count) return head + `<p class="dim">${esc(t('No hold of a second or more in the last seven days.'))}</p>`;
  const cell = (c) => `<td class="n">${c && c.count ? `<b>${esc((c.ms / 1000).toFixed(1))} s</b> <span class="dim">(${esc(String(c.count))})</span>` : '—'}</td>`;
  const row = (label, of) => `<tr><td>${label}</td>${ps.map((p) => cell(of(p))).join('')}</tr>`;
  const rows = (held.week.causes || []).map((c) => row(esc(c.cause), (p) => (p.causes || []).find((x) => x.cause === c.cause))).join('');
  const boot = ps.some((p) => p.boot && p.boot.count) ? row(`<span class="dim">${esc(t('the boot (apart — not in all causes)'))}</span>`, (p) => p.boot) : '';   // loop-day-report R5
  return head + `<table><tr><td class="dim">${esc(t('cause'))}</td><td class="n dim">${esc(t('today'))}</td><td class="n dim">${esc(t('yesterday'))}</td><td class="n dim">${esc(t('7 days'))}</td></tr>${rows}${row(`<b>${esc(t('all causes'))}</b>`, (p) => p)}${boot}</table>${boot ? `<p class="dim">${esc(t('A boot’s own holds are apart from 2.369.407 on; rows written before carry no mark and count among the causes.'))}</p>` : ''}`;
}
// end heldDaysTable
/** lane hub-loop-stalls «loop-day-report»: THE MAIN LOOP, BY HOUR — the hours the server keeps (GET /api/loop-holds `hourly`,
 *  src/server/loop-day-report.js: the last 24, newest first, until it restarts), each the same numbers as its [loop-hour]
 *  journal line: held seconds and holds, the busy share, the top cause, the engines' shares of the busy time, memory (the
 *  server's own, its processes by kind) and the sizes; the raw lines in a fold. A server older than the field ⇒ nothing. */
function hourlyTable(hourly, { t, esc }) {
  if (!hourly || !Array.isArray(hourly.hours)) return '';
  const head = `<h3>${esc(t('The main loop, by hour'))}</h3><p class="dim">${esc(t('What the server writes to its journal once an hour, newest first — the last 24 hours, kept until it restarts. Engines are each future owner’s share of the busy time OUTSIDE holds (a file that holds two owners’ work today is a bucket of its own, marked «*») — the held time is named by the holds, under «total held»; each share is rounded on its own, so they add to 100 % only up to rounding. The busy share is the runtime’s own measure and the busy ticks are the census’s: two instruments, which need not agree. Memory is the server’s own, then its processes by kind; an idle conversation’s age is read from its output file, so it survives a restart — a read that ran out of time shows «?» with how many it read.'))}</p>`;
  if (!hourly.hours.length) return head + `<p class="dim">${esc(t('No hour has ended since the server started.'))}</p>`;
  const sec = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : '—');
  const pc = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)} %` : '—');
  const mbOf = (b) => (Number.isFinite(b) ? `${Math.round(b / 1048576)} MB` : '?');
  const row = (h) => {
    const top = (h.top || [])[0];
    const sh = h.engines && Array.isArray(h.engines.shares) ? h.engines.shares : null;
    const extra = (k) => (h.engines && h.engines[k] && Number.isFinite(h.engines[k].share) ? [{ family: k, share: h.engines[k].share }] : []);
    const eng = sh ? [...sh, ...extra('native'), ...extra('outside')].filter((e) => e.share > 0).sort((a, b) => b.share - a.share).slice(0, 3).map((e) => `${String(e.family).startsWith('split:') ? `${String(e.family).slice(6)}*` : e.family} ${(e.share * 100).toFixed(0)} %`).join(', ') : '?';   // a split file's own bucket by its short name, marked «*»
    const ticks = h.engines && h.engines.held && h.engines.idle ? t('busy {b} · held {h} · idle {i} ticks', { b: Number.isFinite(h.engines.busyTicks) ? h.engines.busyTicks : '?', h: h.engines.held.ticks, i: h.engines.idle.ticks }) : '';
    const k = (h.mem && h.mem.kids) || null, z = h.sizes || {};
    const kids = k ? ['cli', 'wrapper', 'browser', 'agentd', 'other'].filter((n) => k[n] && k[n].n).map((n) => `${n} ${k[n].n}·${mbOf(k[n].rss)}`).join(', ') : '?';
    const held = h.watched === false ? `<span class="dim">${esc(t('not watched'))}</span>` : `<b>${esc(sec(h.heldMs))}</b> <span class="dim">(${esc(String(h.holds))})</span>${h.boot && h.boot.holds ? `<br><span class="dim">${esc(t('the boot {s}', { s: sec(h.boot.heldMs) }))}</span>` : ''}`;
    const tu = h.turns || null, nOr = (v) => (Number.isFinite(v) ? String(v) : '?');
    const ar = h.agesRead && Number.isFinite(h.agesRead.read) && Number.isFinite(h.agesRead.total) && h.agesRead.read < h.agesRead.total ? ` (${t('read {r} of {n}', { r: h.agesRead.read, n: h.agesRead.total })})` : '';   // cure r3 (T2): a pass that ran out of time says how many it read
    const ages = tu ? ['turn-running', 'turn-waiting', 'idle-under-1h', 'idle-1-2h', 'idle-2-4h', 'idle-over-4h', 'turn-unknown'].map((a) => nOr(tu[a])).join(' · ') + ar : '?';
    const br = h.browsers ? `${h.browsers.ready} / ${h.browsers.idle1h}` : '?';
    const paid = h.engines && h.engines.cost && Number.isFinite(h.engines.cost.paidMs) ? t('{n} asks — the census paid {s} s', { n: h.engines.cost.asks, s: (h.engines.cost.paidMs / 1000).toFixed(2) }) : '';
    return `<tr><td>${esc(new Date(h.from).toISOString().slice(0, 13))}Z</td><td class="n">${held}</td><td class="n">${esc(pc(h.busy))}</td>`
      + `<td>${esc(h.watched === false ? '?' : top ? `${top.cause} ${sec(top.ms)}` : '—')}</td><td>${esc(eng || '—')}${ticks ? `<br><span class="dim">${esc(ticks)}</span>` : ''}${paid ? `<br><span class="dim">${esc(paid)}</span>` : ''}</td>`
      + `<td>${esc(`${mbOf(h.mem && h.mem.rss)}${kids ? ` · ${kids}` : ''}`)}</td>`
      + `<td>${esc([z.conversations, z.pageSockets, z.wsIn, z.wsOut].map((v) => (Number.isFinite(v) ? String(v) : '?')).join(' / '))}</td><td>${esc(ages)}</td><td>${esc(br)}</td></tr>`;
  };
  return head + `<table><tr><td class="dim">${esc(t('hour (UTC)'))}</td><td class="n dim">${esc(t('total held'))}</td><td class="n dim">${esc(t('busy share'))}</td><td class="dim">${esc(t('top cause'))}</td><td class="dim">${esc(t('engines'))}</td><td class="dim">${esc(t('memory in use'))}</td><td class="dim">${esc(t('conversations / pages / messages in / out'))}</td><td class="dim">${esc(t('conversations: running · waiting · idle under 1 h · 1–2 h · 2–4 h · over 4 h · unknown'))}</td><td class="dim">${esc(t('browsers ready / idle over 1 h'))}</td></tr>${hourly.hours.map(row).join('')}</table>`
    + (hourly.day && Number.isFinite(hourly.day.hours) && hourly.day.hours > 0 ? `<p class="dim">${esc(t('The hours above: {held} held in {holds} holds; {u} of {n} hours not watched, left out of these sums.', { held: sec(hourly.day.heldMs), holds: hourly.day.holds, u: hourly.day.unwatched || 0, n: hourly.day.hours }))}</p>` : '')   // cure r3: the day's unwatched hours drawn
    + `<details><summary>${esc(t('The journal lines'))}</summary><pre>${hourly.hours.map((h) => esc(h.line || '')).join('\n')}</pre></details>`;
}
// end hourlyTable
