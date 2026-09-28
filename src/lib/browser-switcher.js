// THE BROWSER-SWITCH DIALOG — the DOM half (rebuilt 2026-09-27; the owner's zh
// screenshot of the old one: design words, version numbers, a "tier", a
// disabled Install with a paragraph of measurement notes, buttons stacked one
// glyph per line). Nothing is decided and nothing is worded here: the server's
// `GET /api/browser/switcher` view carries each row's closed STATE
// (src/browser-switch.js rowState) and its facts, and the PURE model
// (src/lib/browser-switcher-model.js) turns them into the now line, at most one
// card per in-place target (its sentences + ONE control that works), a notice,
// an empty line or an error — this file draws that model and runs the acts.
//
//   · keyed in-place patch (reconcileKeyed): a broadcast never rebuilds a button
//     the pointer is on, never closes an opened Details fold, never moves focus;
//   · `st.gen`: a slower fetch never paints over a newer one; `st.pending`: the
//     click's own overlay (switching / installing) until the POST answers — no
//     control is ever shown disabled;
//   · the two confirmations (a downgrade nobody can judge; a download) are the
//     house showConfirmDialog — separate overlays, untouched by a patch;
//   · every answer is worded by the model (switchOutcomeWords / installOutcome-
//     Words / dismissOutcomeWords / viewErrorWords); the raw `error` sentence is
//     the agent's and the CLI's — it goes to the console with its code, never
//     into the DOM;
//   · worded buttons are the house `mounts-btn` (btn()) and the footer's Close
//     the house `btn-cancel` — never the 24 px icon class;
//   · an act that sends the user elsewhere (the key's card, Settings, the
//     Agent browser panel) closes the dialog first — the modal overlay would
//     otherwise cover the window it just opened; the driven card's "Hand it
//     back to your agent" is the act itself, done here (the dialog stays open
//     and re-draws on the broadcast the handback causes).
// Multi-client: re-rendered from the `browser-profiles-updated` broadcast (a
// 100 ms trailing debounce); the handler is removed BY NAME on close. XSS: every
// server string goes through textContent; the one innerHTML is the icon
// library's own static SVG.
import { t, tc } from './i18n.js';
import { fetchJson, showToast, createModalShell, showConfirmDialog } from './utils.js';
import { btn, el } from './channel-chrome.js';
import { UI_ICONS } from './icons.js';
import { reconcileKeyed } from './user-todos-row.js';
import { track } from './telemetry-client.js';
import * as R from '../integration-registry.js';
import { switcherModel, switchOutcomeWords, installOutcomeWords, dismissOutcomeWords, viewErrorWords, chipWords, choicesOf, backendFactOf } from './browser-switcher-model.js';

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const TOAST_TYPE = { ok: 'info', warn: 'warn', error: 'error' };
const toast = (w) => { if (w && w.text) showToast(w.text, { type: TOAST_TYPE[w.tone] || 'info', duration: w.tone === 'ok' ? 6000 : 9000 }); };

/** Open the dialog for ONE profile. `preselect` = the backend a caller came for (a stale banner's one click); it
 *  only earns a notice when that row has no card here. */
export function openBrowserSwitcher(app, { profileId, sessionId = null, preselect = null } = {}) {
  if (!profileId) { showToast(t("This is a temporary browser, not a saved profile, so it can't be switched."), { type: 'warn' }); return null; }
  const st = { view: null, error: null, gen: 0, closed: false, pending: null, timer: null, entries: new Map(), warned: new Set() };
  const onGlobal = (m) => { if (m && m.type === 'browser-profiles-updated' && !st.closed) schedule(); };
  const shell = createModalShell({ id: 'browser-switcher-dialog', title: t('Browser'), dialogClass: 'browser-switcher', bodyClass: 'brsw-body', escapeToClose: true,
    onClose: () => { st.closed = true; if (st.timer) clearTimeout(st.timer); try { app.ws?.offGlobal?.(onGlobal); } catch { /* optional */ } } });
  const { dialog, body, close } = shell;
  const h3 = dialog.querySelector('.dialog-header h3');
  const footer = document.createElement('div'); footer.className = 'dialog-footer';
  const closeBtn = document.createElement('button'); closeBtn.className = 'btn-cancel'; closeBtn.type = 'button'; closeBtn.textContent = t('Close'); closeBtn.onclick = () => close();
  footer.appendChild(closeBtn);
  dialog.appendChild(footer);
  try { app.ws?.onGlobal?.(onGlobal); } catch { /* optional */ }

  const sessionOf = (browserKey) => { try { const s = (app.sidebar?._allSessions || []).find((x) => x && x.browserKey === browserKey); return s ? s.webuiId || null : null; } catch { return null; } };
  const hostNameOf = (id) => { try { const h = (app.sidebar?._hostsData?.hosts || []).find((x) => x && x.id === id); return h && h.name ? String(h.name) : id; } catch { return id; } };
  function schedule() { if (st.timer) clearTimeout(st.timer); st.timer = setTimeout(() => { st.timer = null; refresh(); }, 100); }
  async function refresh() {
    const gen = ++st.gen;
    const v = await fetchJson(`/api/browser/switcher?profile=${encodeURIComponent(profileId)}`);
    if (gen !== st.gen || st.closed) return;
    if (!v || v.error) { if (v && v.error) console.warn('[browser-switcher] view refused', v.code, v.error); st.error = viewErrorWords(v, t); st.view = null; }
    else { st.error = null; st.view = v; }
    render();
  }

  // ── the keyed rows ──
  const setText = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
  /** A child by class, created (and placed after `after`, else appended) when `want`; removed when not. */
  function part(row, cls, want, text, after = null) {
    let n = row.querySelector(':scope > .' + cls);
    if (!want) { if (n) n.remove(); return null; }
    if (!n) { n = el('div', cls); if (after && after.parentNode === row) after.after(n); else row.appendChild(n); }
    setText(n, text);
    return n;
  }
  function stateLines(box, sentences) {
    const sig = JSON.stringify(sentences);
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.replaceChildren(...sentences.map((s) => {
      if (!s.warn) return el('div', 'brsw-line', s.text);
      const line = el('div', 'brsw-line brsw-warn');
      line.innerHTML = UI_ICONS.alert; // the library's own static SVG — never a string from the wire
      line.appendChild(el('span', null, s.text));
      return line;
    }));
  }
  function targetActions(box, key, action) {
    box.replaceChildren();
    if (!action) return;
    box.appendChild(btn(action.label, () => runAction(key), action.primary ? 'mounts-btn-primary' : ''));
  }
  function claimActions(box, key, hasDetail) {
    box.replaceChildren();
    if (hasDetail) {
      const d = btn(t('Details'), () => {
        const det = box.parentNode && box.parentNode.querySelector(':scope > .brsw-claim-detail');
        if (!det) return;
        det.hidden = !det.hidden;
        d.textContent = det.hidden ? t('Details') : t('Hide details');
      });
      d.classList.add('brsw-details');
      box.appendChild(d);
    }
    box.appendChild(btn(tc('browser', 'Dismiss'), () => dismissClaim(key)));
  }
  function makeClaim(e) {
    const row = el('div', 'brsw-claim'); row.dataset.key = e.key;
    row.appendChild(el('div', 'brsw-claim-text', e.text));
    if (e.detail) { const det = el('div', 'brsw-claim-detail', e.detail); det.hidden = true; row.appendChild(det); }
    const acts = el('div', 'brsw-actions'); row.appendChild(acts);
    claimActions(acts, e.key, !!e.detail);
    row.dataset.hasDetail = e.detail ? '1' : '';
    return row;
  }
  function patchClaim(row, e) {
    setText(row.querySelector(':scope > .brsw-claim-text'), e.text);
    let det = row.querySelector(':scope > .brsw-claim-detail');
    if (e.detail) {
      if (!det) { det = el('div', 'brsw-claim-detail', e.detail); det.hidden = true; row.querySelector(':scope > .brsw-claim-text').after(det); }
      else setText(det, e.detail); // the fold's `hidden` is the user's — never touched by a patch
    } else if (det) det.remove();
    if ((row.dataset.hasDetail || '') !== (e.detail ? '1' : '')) { claimActions(row.querySelector(':scope > .brsw-actions'), e.key, !!e.detail); row.dataset.hasDetail = e.detail ? '1' : ''; }
  }
  function create(e) {
    const row = el('div', 'brsw-' + e.kind); row.dataset.key = e.key;
    if (e.kind === 'claims') { patch(row, e); return row; }
    if (e.kind === 'now') { row.appendChild(el('div', 'brsw-now-text', e.text)); if (e.blurb) row.appendChild(el('div', 'brsw-blurb', e.blurb)); return row; }
    if (e.kind === 'target') {
      row.dataset.state = e.state;
      const name = el('div', 'brsw-target-name', e.name); row.appendChild(name);
      if (e.blurb) row.appendChild(el('div', 'brsw-blurb', e.blurb));
      const box = el('div', 'brsw-state'); row.appendChild(box); stateLines(box, e.sentences);
      const acts = el('div', 'brsw-actions'); row.appendChild(acts); targetActions(acts, e.key, e.action);
      row.dataset.actionSig = e.action ? e.action.kind + '|' + e.action.label : '';
      return row;
    }
    row.textContent = e.text; // notice / empty / error: one sentence
    return row;
  }
  function patch(row, e) {
    if (e.kind === 'claims') {
      reconcileKeyed(row, e.claims, { isRow: (c) => !!c.dataset.key, keyOf: (c) => c.dataset.key, idOf: (c) => c.key, create: makeClaim, patch: patchClaim });
      return;
    }
    if (e.kind === 'now') {
      setText(row.querySelector(':scope > .brsw-now-text'), e.text);
      part(row, 'brsw-blurb', !!e.blurb, e.blurb || '', row.querySelector(':scope > .brsw-now-text'));
      return;
    }
    if (e.kind === 'target') {
      const name = row.querySelector(':scope > .brsw-target-name');
      setText(name, e.name);
      part(row, 'brsw-blurb', !!e.blurb, e.blurb || '', name);
      stateLines(row.querySelector(':scope > .brsw-state'), e.sentences);
      const sig = e.action ? e.action.kind + '|' + e.action.label : '';
      if (row.dataset.state !== e.state || row.dataset.actionSig !== sig) { targetActions(row.querySelector(':scope > .brsw-actions'), e.key, e.action); row.dataset.actionSig = sig; }
      row.dataset.state = e.state;
      return;
    }
    setText(row, e.text);
  }
  function render() {
    if (st.closed) return;
    for (const n of body.querySelectorAll(':scope > .brsw-loading')) n.remove();
    const entries = [];
    st.entries.clear();
    if (st.error || !st.view) {
      setText(h3, t('Browser'));
      entries.push({ key: 'error', kind: 'error', text: st.error || viewErrorWords(null, t) });
    } else {
      const m = switcherModel(st.view, { t, preselect, pending: st.pending, sessionOf, hostNameOf, credentialWhy: R.credentialWhyText });
      setText(h3, m.title);
      if (m.claims.length) entries.push({ key: 'claims', kind: 'claims', claims: m.claims });
      entries.push({ kind: 'now', ...m.now });
      if (m.notice) entries.push({ kind: 'notice', ...m.notice });
      for (const tg of m.targets) {
        entries.push({ kind: 'target', ...tg });
        // a refusal the model has no words for is worded "can't be used right now" — and SEEN, never shown in English
        if (tg.state === 'unavailable' && !st.warned.has(tg.key + '|' + tg.code)) { st.warned.add(tg.key + '|' + tg.code); console.warn('[browser-switcher] unworded state', tg.code); try { track('event', 'browser-switcher-unworded', { code: tg.code || null }); } catch { /* optional */ } }
      }
      if (m.empty) entries.push({ kind: 'empty', ...m.empty });
      for (const c of m.claims) st.entries.set(c.key, c);
    }
    for (const e of entries) st.entries.set(e.key, e);
    reconcileKeyed(body, entries, { isRow: (c) => !!c.dataset.key, keyOf: (c) => c.dataset.key, idOf: (e) => e.key, create, patch });
  }

  // ── the acts (each reads the CURRENT entry: a kept button may outlive the entry it was made for) ──
  async function runAction(key) {
    const e = st.entries.get(key);
    const a = e && e.action;
    if (!a || st.pending) return;
    if (a.kind === 'switch') return doSwitch(e, false);
    if (a.kind === 'switch-confirm') { if (await showConfirmDialog(a.confirm)) return doSwitch(e, true); return; }
    if (a.kind === 'install') { if (await showConfirmDialog(a.confirm)) return doInstall(e); return; }
    if (a.kind === 'handback') return doHandback(a);
    // an act that SENDS the user somewhere closes the dialog first: the modal overlay would sit over the very window it
    // opened (the button says where it goes — Settings, the key's card, the Agent browser panel)
    if (a.kind === 'integration') { close(); app.openIntegration?.(a.integrationId || e.integrationId); return; }
    if (a.kind === 'settings') { close(); app._settingsUI?.open({ search: 'CloakBrowser' }); return; }
    if (a.kind === 'profiles') { close(); app.openBrowserProfiles?.(); return; }
  }
  async function doSwitch(e, confirmDowngrade) {
    const from = st.view?.profile?.provider || 'chromium';
    const label = st.view?.profile?.label || '';
    st.pending = { state: 'switching', to: e.id };
    render();
    const r = await fetchJson('/api/browser/switch', json('POST', { profile: profileId, provider: e.id, sessionId: sessionId || undefined, confirmDowngrade: !!confirmDowngrade }));
    st.pending = null;
    if (r && r.error) console.warn('[browser-switcher] switch answered', r.code, r.error);
    toast(switchOutcomeWords(r, { t, from, to: e.id, label })); // the toast reaches the user even when the window was closed
    if (!st.closed) { render(); refresh(); }
  }
  async function doInstall(e) {
    st.pending = { id: e.id, state: 'installing' };
    render();
    const r = await fetchJson('/api/browser/install', { method: 'POST' });
    st.pending = null;
    if (r && r.error) console.warn('[browser-switcher] install answered', r.code, r.error);
    toast(installOutcomeWords(r, { t, name: e.name }));
    if (!st.closed) { render(); refresh(); }
  }
  /** "Hand it back to your agent" (the driven card): the act itself, here — the dialog stays open and the broadcast the
   *  handback causes re-draws the card as a switch (the naive-user verifier, 2026-09-28: the sentence promised an update
   *  the modal hid, because the hand-back button sat behind it). */
  async function doHandback(a) {
    st.pending = { state: 'handing-back' };
    const r = await fetchJson('/api/browser/handback', json('POST', { sessionId: a.sessionId, profile: profileId }));
    st.pending = null;
    if (!r || r.error) {
      if (r && r.error) console.warn('[browser-switcher] handback answered', r.code, r.error);
      toast({ tone: 'error', text: r ? t("Couldn't hand the browser back to your agent.") : t('Could not reach the server') });
    } else toast({ tone: 'ok', text: t('Control handed back to the agent') });
    if (!st.closed) refresh();
  }
  async function dismissClaim(key) {
    const c = st.entries.get(key);
    if (!c) return;
    const r = await fetchJson(`/api/browser/blocked/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
    if (r && r.error) console.warn('[browser-switcher] dismiss answered', r.code, r.error);
    const w = dismissOutcomeWords(r, t);
    toast(w);
    if (!st.closed && (!w || w.refresh)) refresh();
  }

  body.appendChild(el('div', 'brsw-loading', t('Loading…')));
  refresh();
  return { ...shell, refresh, state: () => ({ view: st.view, error: st.error, pending: st.pending, gen: st.gen, closed: st.closed }) };
}

export function installBrowserSwitcher(App) {
  /** THE dialog, one per profile: `{profileId, sessionId?, preselect?}`. */
  App.prototype.openBrowserSwitcher = function (opts) { return openBrowserSwitcher(this, opts || {}); };
  /** The digest's backend FACT for a profile (`{id, major, plan, choices}`), or null. */
  App.prototype.browserBackendFor = function (profileId) { return backendFactOf(this._browserProfiles, profileId); };
  /** The backends a switch dialog would draw a card for; [] ⇒ no entry point offers the dialog. */
  App.prototype.browserChoicesFor = function (profileId) { return choicesOf(this._browserProfiles, profileId); };
  /** The chip's WORDS for a profile (`Chromium` / `CloakBrowser` / …) — an older server's raw chip when it sends no facts. */
  App.prototype.browserChipFor = function (profileId) {
    const d = this._browserProfiles;
    if (!d || !profileId) return null;
    return chipWords(backendFactOf(d, profileId), t) ?? (d.chips && d.chips[profileId]) ?? null;
  };
  /** The agent's blocked claims about a profile or a session, from the digest. */
  App.prototype.browserBlockedFor = function ({ profileId = null, sessionId = null } = {}) {
    const d = this._browserProfiles;
    if (!d || !Array.isArray(d.blocked)) return [];
    return d.blocked.filter((b) => (profileId && b.profileId === profileId) || (sessionId && b.sessionId === sessionId));
  };
}
