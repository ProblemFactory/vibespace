// THE HUMANE CLAUDE SIGN-IN CARD (lane door-signin-card) — ONE card for every
// wall a person meets the sign-in wall at: the chat's «Not logged in» card, the
// tour's «Connect your agents» step, and Manage agents. It says, in plain words,
// «Sign in with Claude — your company uses a Claude subscription» + a button
// that opens the OAuth link in a NEW TAB; the product drives the CLI's login
// flow itself (POST /api/accounts/:id/signin → the hub-owned PTY of
// src/server/claude-signin.js), shows a paste-the-code box, feeds the code back,
// and FINALISES through the SAME /subscription/:id/finalize route the old
// terminal Add flow used (so the identity merge is unchanged — signing in again
// folds into the existing account by e-mail). The person never sees a terminal,
// a theme picker or a trust prompt. The card's render model is the PURE
// src/signin-model.js signinCardView (its five states).
//
// On the chat wall, once the sign-in lands the card offers «Send my message
// again» — ONE press resumes the conversation with the waiting message as its
// initialMessage (no retyping). Elsewhere it just says «Connected».
//
// THE VERIFY ROUND (lane door-signin-fixes): a run dies with the card that
// started it — destroy() (the chat window closed, the modal closed, the tour
// step left) and the page going away send DELETE …/signin (keepalive), and
// the card HOLDS its run over its socket (`claude-signin-hold`, again after
// every reconnect) so the hub cancels a run whose page is gone. «Try again»
// reuses the card's own never-signed-in account (POST …/subscription
// {signin:true} reuses an idle one too) — a failed attempt adds no row. The
// re-send is pressed once: after it the button is gone.
import { escHtml, fetchJson, showToast, copyText } from './utils.js';
import { t } from './i18n.js';
import { UI_ICONS } from './icons.js';
import { signinCardView, signinShowVerdict, SIGNIN_DONE } from '../signin-model.js';
import { enterSubmits } from './chat-enter-keys.js'; // lane door-signin-card: the IME-safe Enter guard (test-enter-census §2)

export class SignInCard {
  constructor({ ws, hasWaiting = () => false, onResend = null, onConnected = () => { }, onAdvanced = null } = {}) {
    this.ws = ws;
    this.hasWaiting = hasWaiting;
    this.onResend = onResend;
    this.onConnected = onConnected;
    this.onAdvanced = onAdvanced;
    this._el = null; this._off = null;
    this._accountId = null; this._signin = null; this._busy = false;
    this._finalizing = false; this._finalized = null; this._finalizeTries = 0;
    this._codeErr = null; this._resent = false; this._destroyed = false;
    this._onState = (connected) => { if (connected) this._rehold(); };
    this._onPageHide = () => this._cancelLive();
  }

  mount(container) {
    this._el = container;
    this._el.classList.add('signin-card');
    this._off = this.ws?.onGlobal?.((m) => {
      if (m?.type === 'claude-signin' && m.signin && this._accountId && m.signin.accountId === this._accountId) this._apply(m.signin);
    });
    try { this.ws?.onStateChange?.(this._onState); } catch { }
    try { if (typeof window !== 'undefined') window.addEventListener('pagehide', this._onPageHide); } catch { }
    this._render();
    return this;
  }

  // closing the card ends its sign-in NOW (the PTY, the URL), never at the TTL
  destroy() {
    this._destroyed = true;
    try { this._off?.(); } catch { } this._off = null;
    try { this.ws?.offStateChange?.(this._onState); } catch { }
    try { if (typeof window !== 'undefined') window.removeEventListener('pagehide', this._onPageHide); } catch { }
    this._cancelLive();
  }

  _live() { return !!(this._accountId && this._signin && this._signin.id && !SIGNIN_DONE.includes(this._signin.phase)); }
  _cancelLive() {
    if (!this._live()) return;
    try { fetchJson(`/api/accounts/${this._accountId}/signin`, { method: 'DELETE', keepalive: true }); } catch { }
  }
  _hold() { if (this._live()) { try { this.ws?.send?.({ type: 'claude-signin-hold', accountId: this._accountId, id: this._signin.id }); } catch { } } }
  // a reconnected socket holds the run again — and learns what it missed while it was away
  async _rehold() {
    if (!this._live() || this._destroyed) return;
    this._hold();
    const r = await fetchJson(`/api/accounts/${this._accountId}/signin`);
    if (r && r.signin && !this._destroyed) this._apply(r.signin);
  }

  // ── the flow ──
  async _begin() {
    if (this._busy) return;
    this._busy = true; this._codeErr = null; this._signin = null; this._finalized = null; this._render();
    // «Try again» reuses this card's own account (it never logged in) — a failed attempt adds no row
    let r = this._accountId ? await fetchJson(`/api/accounts/${this._accountId}/signin`, { method: 'POST' }) : null;
    if (!r || r.code === 'unknown_account' || r.code === 'signin_running') {
      const created = await fetchJson('/api/accounts/subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signin: true }) });
      if (!created || created.error || !created.id) { this._busy = false; return this._fail(created?.error || t('Could not start the sign-in.')); }
      this._accountId = created.id;
      r = await fetchJson(`/api/accounts/${this._accountId}/signin`, { method: 'POST' });
    }
    this._busy = false;
    if (!r || r.error) return this._fail(r?.error || t('Could not start the sign-in.'));
    if (r.signin) this._apply(r.signin);
    if (this._destroyed) this._cancelLive(); // closed while it was starting
    else this._hold();
  }

  async _sendCode(code) {
    if (!this._accountId || this._busy) return;
    this._busy = true; this._codeErr = null; this._render();
    const r = await fetchJson(`/api/accounts/${this._accountId}/signin/code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    this._busy = false;
    if (r && r.error && r.signin && SIGNIN_DONE.includes(r.signin.phase)) { this._apply(r.signin); return; } // the run ended meanwhile: show that (its Try again)
    if (!r || r.error) { this._codeErr = (r && r.error) || t('That code was not accepted.'); this._render(); return; }
    if (r.signin) this._apply(r.signin);
  }

  _apply(signin) {
    // lane heavy3-flake-races borrow: a late HTTP answer never repaints over a newer WS push.
    if (this._signin && signinShowVerdict(this._signin, signin) !== 'show') return;
    this._signin = signin;
    if (signin.phase === 'connected' && !this._finalized && !this._finalizing) this._finalize();
    else this._render();
  }

  _finalize() {
    if (!this._accountId) return;
    this._finalizing = true; this._render();
    fetchJson(`/api/accounts/subscription/${this._accountId}/finalize`, { method: 'POST' }).then((fin) => {
      if (fin && fin.loggedIn) {
        this._finalizing = false; this._finalized = { email: fin.email || null };
        this._render();
        try { this.onConnected(this._finalized); } catch { }
        return;
      }
      // the credential may lag the "connected" line by a beat — retry a few times
      if (this._finalizeTries++ < 4) { setTimeout(() => this._finalize(), 700); return; }
      this._finalizing = false;
      this._fail((fin && fin.error) || t('Signed in, but VibeSpace could not read the credential. Try again.'));
    }).catch(() => {
      if (this._finalizeTries++ < 4) { setTimeout(() => this._finalize(), 700); return; }
      this._finalizing = false; this._fail(t('Signed in, but VibeSpace could not finish. Try again.'));
    });
  }

  _fail(why) { this._signin = { phase: 'failed', error: why || null }; this._finalizing = false; this._render(); }

  // ── render ──
  _state() {
    if (this._finalized) return { state: 'connected' };
    if (this._finalizing || (this._signin && (this._signin.phase === 'connected' || this._signin.phase === 'connecting'))) return { state: 'connecting' };
    return signinCardView(this._signin || {}, { hasWaiting: !!this.hasWaiting() });
  }

  _render() {
    const el = this._el; if (!el) return;
    const v = this._state();
    const icon = v.state === 'connected' ? UI_ICONS.check : v.state === 'failed' ? UI_ICONS.alert : UI_ICONS.lock;
    let title = t('Sign in with Claude');
    let bodyHtml = '';
    if (v.state === 'no-login') {
      bodyHtml =
        `<div class="signin-sub">${escHtml(t('Your company uses a Claude subscription — sign in with your own account.'))}</div>` +
        `<div class="signin-actions"><button class="mounts-btn mounts-btn-primary" data-act="begin">${escHtml(t('Sign in with Claude'))}</button></div>` +
        `<div class="usage-note">${escHtml(t('No account yet? Ask your administrator.'))}</div>`;
    } else if (v.state === 'url-shown' || v.state === 'waiting-code') {
      title = t('Sign in with Claude');
      const link = v.url
        ? `<div class="signin-actions"><a class="mounts-btn mounts-btn-primary" href="${escHtml(v.url)}" target="_blank" rel="noopener" data-act="open">${UI_ICONS.external || ''}<span>${escHtml(t('Open the sign-in page'))}</span></a><button class="mounts-btn" data-act="copy">${escHtml(t('Copy link'))}</button></div>`
        : `<div class="usage-note">${escHtml(t('Starting the sign-in…'))}</div>`;
      bodyHtml = link +
        `<div class="usage-note">${escHtml(t('A new tab opens Claude. Sign in there, then paste the code it shows:'))}</div>` +
        `<div class="signin-code-row"><input class="signin-code-input" type="text" autocomplete="off" spellcheck="false" placeholder="${escHtml(t('Paste the sign-in code'))}" ${v.url ? '' : 'disabled'}><button class="mounts-btn mounts-btn-primary" data-act="code" ${v.url ? '' : 'disabled'}>${escHtml(t('Connect'))}</button></div>` +
        (this._codeErr ? `<div class="usage-warn">${escHtml(this._codeErr)}</div>` : '') +
        (this.onAdvanced ? `<div class="signin-advanced"><button class="signin-link-btn" data-act="advanced">${escHtml(t('Use a terminal instead'))}</button></div>` : '');
    } else if (v.state === 'connecting') {
      bodyHtml = `<div class="usage-note signin-spinner">${escHtml(t('Signing you in…'))}</div>`;
    } else if (v.state === 'connected') {
      const email = this._finalized?.email;
      title = t('Connected');
      bodyHtml = `<div class="signin-sub">${escHtml(email ? t('Connected as {email}', { email }) : t('You are signed in to Claude.'))}</div>`;
      if (this.hasWaiting() && !this._resent) bodyHtml += `<div class="signin-actions"><button class="mounts-btn mounts-btn-primary" data-act="resend">${escHtml(t('Send my message again'))}</button></div>`;
    } else if (v.state === 'failed') {
      title = t('Sign-in didn’t finish');
      bodyHtml = `<div class="usage-warn">${escHtml(v.why || t('The sign-in did not complete.'))}</div>` +
        `<div class="signin-actions"><button class="mounts-btn mounts-btn-primary" data-act="begin">${escHtml(t('Try again'))}</button>` +
        (this.onAdvanced ? `<button class="signin-link-btn" data-act="advanced">${escHtml(t('Use a terminal instead'))}</button>` : '') + `</div>`;
    }
    el.innerHTML = `<div class="signin-card-head">${icon}<span class="signin-card-title">${escHtml(title)}</span></div><div class="signin-card-body">${bodyHtml}</div>`;
    this._wire();
  }

  _wire() {
    const el = this._el; if (!el) return;
    const on = (sel, ev, fn) => { const n = el.querySelector(sel); if (n) n.addEventListener(ev, fn); };
    on('[data-act="begin"]', 'click', () => this._begin());
    on('[data-act="copy"]', 'click', () => { const v = this._state(); if (v.url) { copyText(v.url); showToast(t('Copied'), { type: 'success' }); } });
    on('[data-act="advanced"]', 'click', () => { try { this.onAdvanced?.(); } catch { } });
    on('[data-act="resend"]', 'click', (e) => { const b = e.currentTarget; if (this._resent) return; b.disabled = true; this._resent = true; try { this.onResend?.(); } catch { b.disabled = false; this._resent = false; } });
    const code = el.querySelector('.signin-code-input');
    const submit = () => { const val = (code && code.value || '').trim(); if (val) this._sendCode(val); };
    on('[data-act="code"]', 'click', submit);
    if (code) code.addEventListener('keydown', (e) => { if (enterSubmits(e)) { e.preventDefault(); submit(); } });
  }
}
