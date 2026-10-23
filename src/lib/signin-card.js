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

// THE REAL SCREEN (lane signin-card-real-screen, 2.369.345): on every fleet pod the card sat at «starting» with no
// link — the reader knew only the setup-token screen. Now: a LIVE run never offers a pressable «Sign in» (each press
// used to make a row; a press now joins the run), the card says it is starting, and when the reader has not placed
// the screen RAW_AFTER_MS after the CLI's first output (or it ends on a line it cannot place) the card flips to the
// RAW SCREEN — the CLI's own output in a small read-only xterm, the code box below it. 「切换原始画面」 is always there;
// a state the reader recognises later flips the parsed view back. On connected, the card says when its account
// became the default (a VibeSpace with no default and no machine login — accounts' firstSigninDefault).

export class SignInCard {
  // rawFirst (lane signin-card-real-screen): the tour's «Advanced → terminal» road — the SAME run (joined, never a
  // second helper) shown as its raw screen from the start, kept there until the person toggles
  constructor({ ws, hasWaiting = () => false, onResend = null, onConnected = () => { }, onAdvanced = null, rawFirst = false } = {}) {
    this.ws = ws;
    this.hasWaiting = hasWaiting;
    this.onResend = onResend;
    this.onConnected = onConnected;
    this.onAdvanced = onAdvanced;
    this._el = null; this._off = null;
    this._accountId = null; this._signin = null; this._busy = false;
    this._finalizing = false; this._finalized = null; this._finalizeTries = 0;
    this._codeErr = null; this._resent = false; this._destroyed = false;
    this._raw = null; this._rawHost = null; this._rawOverride = rawFirst ? true : null; this._lastHint = null;
    this._rawSticky = !!rawFirst; this._joined = false; this._autoStart = !!rawFirst;
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
    if (this._autoStart) this._begin();
    return this;
  }

  // closing the card ends its sign-in NOW (the PTY, the URL), never at the TTL
  destroy() {
    this._destroyed = true;
    try { this._off?.(); } catch { } this._off = null;
    try { this.ws?.offStateChange?.(this._onState); } catch { }
    try { if (typeof window !== 'undefined') window.removeEventListener('pagehide', this._onPageHide); } catch { }
    this._cancelLive();
    try { this._raw?.destroy(); } catch { } this._raw = null; this._rawHost = null;
  }

  _live() { return !!(this._accountId && this._signin && this._signin.id && !SIGNIN_DONE.includes(this._signin.phase)); }
  _cancelLive() {
    if (!this._live() || this._joined) return; // a card that JOINED another's run leaves it to its starter (its hold drops with it)
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
    if (this._busy || this._live()) return; // a live run is never started twice (the button is disabled; a stray press is a no-op)
    this._busy = true; this._codeErr = null; this._signin = null; this._finalized = null; if (!this._rawSticky) this._rawOverride = null; this._render();
    // «Try again» reuses this card's own account (it never logged in) — a failed attempt adds no row; a run already
    // live on it (another card, the tour's terminal road) is JOINED (`joined`), never a second helper
    let r = this._accountId ? await fetchJson(`/api/accounts/${this._accountId}/signin`, { method: 'POST' }) : null;
    if (!r || r.code === 'unknown_account') {
      const created = await fetchJson('/api/accounts/subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signin: true }) });
      if (!created || created.error || !created.id) { this._busy = false; return this._fail(created?.error || t('Could not start the sign-in.')); }
      this._accountId = created.id;
      r = await fetchJson(`/api/accounts/${this._accountId}/signin`, { method: 'POST' });
    }
    this._busy = false;
    if (!r || r.error) return this._fail(r?.error || t('Could not start the sign-in.'));
    this._joined = r.joined === true;
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
    // the reader's verdict moved (stalled / unknown / recognised): its view takes over again from a manual toggle
    const hint = signin.rawHint || null;
    if (hint !== this._lastHint) { if (!this._rawSticky) this._rawOverride = null; this._lastHint = hint; }
    this._signin = signin;
    if (signin.phase === 'connected' && !this._finalized && !this._finalizing) this._finalize();
    else this._render();
  }

  _finalize() {
    if (!this._accountId) return;
    this._finalizing = true; this._render();
    fetchJson(`/api/accounts/subscription/${this._accountId}/finalize`, { method: 'POST' }).then((fin) => {
      if (fin && fin.loggedIn) {
        this._finalizing = false; this._finalized = { email: fin.email || null, madeDefault: fin.madeDefault === true };
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
    if (this._finalizing || (this._signin && this._signin.phase === 'connected')) return { state: 'connecting' };
    if (this._signin && this._signin.phase === 'connecting') return { state: 'connecting', submitting: true, rawHint: this._signin.rawHint || null }; // a screen it cannot place after the code: the raw view
    return signinCardView(this._signin || {}, { hasWaiting: !!this.hasWaiting() });
  }

  _render() {
    const el = this._el; if (!el) return;
    const v = this._state();
    const icon = v.state === 'connected' ? UI_ICONS.check : v.state === 'failed' ? UI_ICONS.alert : UI_ICONS.lock;
    let title = t('Sign in with Claude');
    let bodyHtml = '';
    const live = this._live();
    const raw = this._showRaw(v);
    const codeRow = (enabled) => `<div class="signin-code-row"><input class="signin-code-input" type="text" autocomplete="off" spellcheck="false" placeholder="${escHtml(t('Paste the sign-in code'))}" ${enabled ? '' : 'disabled'}><button class="mounts-btn mounts-btn-primary" data-act="code" ${enabled ? '' : 'disabled'}>${escHtml(t('Connect'))}</button></div>` +
      (this._codeErr ? `<div class="usage-warn">${escHtml(this._codeErr)}</div>` : '');
    const toggle = this._signin && this._signin.id && v.state !== 'connected'
      ? `<div class="signin-advanced"><button class="signin-link-btn" data-act="raw">${escHtml(raw ? t('Show the simple view') : t('Show the raw screen'))}</button>${this.onAdvanced ? `<button class="signin-link-btn" data-act="advanced">${escHtml(t('Use a terminal instead'))}</button>` : ''}</div>`
      : '';
    if (raw && live) {
      // THE RAW SCREEN: what the CLI printed, read-only; the person reads the link and the prompt themselves
      const why = v.rawHint === 'stalled' ? t('VibeSpace could not read the sign-in link — here is the sign-in screen itself. Open the link, sign in, then paste the code below.')
        : v.rawHint === 'unknown' ? t('The sign-in screen says something VibeSpace does not know yet — here it is. Paste the code below when it asks for one.')
          : t('The sign-in screen itself. Open the link, sign in, then paste the code below.');
      bodyHtml = `<div class="usage-note">${escHtml(why)}</div><div class="signin-raw-host"></div>` +
        (v.submitting ? `<div class="usage-note signin-spinner">${escHtml(t('Signing you in…'))}</div>` : codeRow(true)) + toggle;
    } else if (v.state === 'no-login') {
      bodyHtml =
        `<div class="signin-sub">${escHtml(t('Your company uses a Claude subscription — sign in with your own account.'))}</div>` +
        `<div class="signin-actions"><button class="mounts-btn mounts-btn-primary" data-act="begin">${escHtml(t('Sign in with Claude'))}</button></div>` +
        `<div class="usage-note">${escHtml(t('No account yet? Ask your administrator.'))}</div>`;
    } else if (v.state === 'starting') {
      // a live run: the button stays — DISABLED, saying what it waits for (never a second press, never a blank card)
      bodyHtml =
        `<div class="signin-sub">${escHtml(t('Your company uses a Claude subscription — sign in with your own account.'))}</div>` +
        `<div class="signin-actions"><button class="mounts-btn mounts-btn-primary" data-act="begin" disabled>${escHtml(t('Starting the sign-in…'))}</button></div>` + toggle;
    } else if (v.state === 'url-shown' || v.state === 'waiting-code') {
      title = t('Sign in with Claude');
      const link = v.url
        ? `<div class="signin-actions"><a class="mounts-btn mounts-btn-primary" href="${escHtml(v.url)}" target="_blank" rel="noopener" data-act="open">${UI_ICONS.external || ''}<span>${escHtml(t('Open the sign-in page'))}</span></a><button class="mounts-btn" data-act="copy">${escHtml(t('Copy link'))}</button></div>`
        : `<div class="usage-note">${escHtml(t('Starting the sign-in…'))}</div>`;
      bodyHtml = link +
        `<div class="usage-note">${escHtml(t('A new tab opens Claude. Sign in there, then paste the code it shows:'))}</div>` +
        codeRow(!!v.url) + toggle;
    } else if (v.state === 'connecting') {
      bodyHtml = `<div class="usage-note signin-spinner">${escHtml(t('Signing you in…'))}</div>`;
    } else if (v.state === 'connected') {
      const email = this._finalized?.email;
      title = t('Connected');
      bodyHtml = `<div class="signin-sub">${escHtml(email ? t('Connected as {email}', { email }) : t('You are signed in to Claude.'))}</div>` +
        (this._finalized?.madeDefault ? `<div class="usage-note signin-default-note">${escHtml(t('Set as your default account · change it in Manage agents'))}</div>` : '');
      if (this.hasWaiting() && !this._resent) bodyHtml += `<div class="signin-actions"><button class="mounts-btn mounts-btn-primary" data-act="resend">${escHtml(t('Send my message again'))}</button></div>`;
    } else if (v.state === 'failed') {
      title = t('Sign-in didn’t finish');
      bodyHtml = `<div class="usage-warn">${escHtml(v.why || t('The sign-in did not complete.'))}</div>` +
        (raw ? `<div class="signin-raw-host"></div>` : '') +
        `<div class="signin-actions"><button class="mounts-btn mounts-btn-primary" data-act="begin">${escHtml(t('Try again'))}</button>` +
        (this.onAdvanced ? `<button class="signin-link-btn" data-act="advanced">${escHtml(t('Use a terminal instead'))}</button>` : '') + `</div>` +
        (this._signin && this._signin.id ? `<div class="signin-advanced"><button class="signin-link-btn" data-act="raw">${escHtml(raw ? t('Show the simple view') : t('Show the raw screen'))}</button></div>` : '');
    }
    el.innerHTML = `<div class="signin-card-head">${icon}<span class="signin-card-title">${escHtml(title)}</span></div><div class="signin-card-body">${bodyHtml}</div>`;
    this._placeRaw(raw);
    this._wire();
  }

  // raw shown = the person's toggle, else the reader's cue (stalled / unknown)
  _showRaw(v) { return this._rawOverride != null ? this._rawOverride : !!(v && v.rawHint); }
  // ONE RawScreen per card, kept across re-renders (its xterm is re-hung into the new body), reading only while shown
  // (src/lib/raw-screen.js — the owner's fallback — loads the first time it shows: it carries xterm)
  _placeRaw(show) {
    const slot = this._el && this._el.querySelector('.signin-raw-host');
    this._rawShown = !!(show && slot && this._accountId);
    if (!this._rawShown) { this._raw?.stop(); return; }
    if (!this._rawHost) this._rawHost = document.createElement('div');
    slot.appendChild(this._rawHost);
    if (this._raw) { this._raw.start(); return; }
    if (this._rawLoading) return;
    this._rawLoading = import('./raw-screen.js').then(({ RawScreen }) => {
      if (this._destroyed || this._raw) return;
      const aid = () => this._accountId;
      this._raw = new RawScreen({ screenUrl: () => (aid() ? `/api/accounts/${aid()}/signin/screen` : null) }).mount(this._rawHost);
      if (this._rawShown) this._raw.start();
    }).catch(() => { this._rawLoading = null; });
  }

  _wire() {
    const el = this._el; if (!el) return;
    const on = (sel, ev, fn) => { const n = el.querySelector(sel); if (n) n.addEventListener(ev, fn); };
    on('[data-act="begin"]', 'click', () => this._begin());
    on('[data-act="copy"]', 'click', () => { const v = this._state(); if (v.url) { copyText(v.url); showToast(t('Copied'), { type: 'success' }); } });
    on('[data-act="advanced"]', 'click', () => { try { this.onAdvanced?.(); } catch { } });
    on('[data-act="raw"]', 'click', () => { this._rawSticky = false; this._rawOverride = !this._showRaw(this._state()); this._render(); });
    on('[data-act="resend"]', 'click', (e) => { const b = e.currentTarget; if (this._resent) return; b.disabled = true; this._resent = true; try { this.onResend?.(); } catch { b.disabled = false; this._resent = false; } });
    const code = el.querySelector('.signin-code-input');
    const submit = () => { const val = (code && code.value || '').trim(); if (val) this._sendCode(val); };
    on('[data-act="code"]', 'click', submit);
    if (code) code.addEventListener('keydown', (e) => { if (enterSubmits(e)) { e.preventDefault(); submit(); } });
  }
}
