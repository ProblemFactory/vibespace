// THE MOUNTS DIALOG COMPONENT — one field renderer, one consent block, one
// cross-browser link row, shared by the storage dialogs (sidebar-mounts.js)
// and the channel account dialogs (docs/design-integrations-per-account.zh.md
// §8.1 #12, D1: "two dialogs = one component"). Moved VERBATIM out of
// src/lib/sidebar-mounts.js (2.369.165, integrations chunk 1); the storage
// side renders pixel-identically to 2.369.160 —
// scripts/test-mounts-dialog-extract.mjs compares the two in headless chrome
// against the byte-for-byte baseline in scripts/fixtures/mounts-dialog-baseline/,
// and scripts/test-oauth-field-parity.mjs keeps it ONE (no second renderer,
// the shared spellings pinned on both sides). A deliberate change to what
// this module draws updates that baseline in the same commit and says so.
//
// The ONE parameter the move added: `wireOAuthConnect`'s `endpoints`
// (start / status / callback), defaulting to the storage routes the block
// always called, so a second feature can run the same block against its own
// consent routes. The Sidebar keeps `_mountsDialog` / `_wireOAuthConnect` as
// thin delegates (and `_lastMountsDialog`, which only its callers read).
//
// Chunk 3 (the channel account card + dialogs) GREW the component without
// changing a pixel of what the storage side draws (the extract suite gained
// the storage re-authorize scenario and stays at 0 differing pixels):
//  · `renderFields` — the field loop of `mountsDialog`, factored out so the
//    re-authorize dialog renders its OAuth-client select through the SAME
//    renderer; three additive field shapes the storage dialogs never use:
//    `type:'note'` (a fact line, `.mounts-note`), `type:'copy'` (a read-only
//    value + Copy — the cross-browser link row's line, without its hint),
//    `readonly`, and a `hint` ARRAY (one `.mounts-field-hint` line each);
//  · `wireOAuthConnect` — an endpoint may be a FUNCTION (a consent bound to an
//    existing record: the channel Duplicate dialog), plus `extra` (body
//    fields beside the client id/secret — the preset key), `provider` (the
//    sign-in page's name), `pastePlaceholder` and `finishText`;
//  · `reauthDialog` — `_showDriveReauthDialog`'s shape moved here verbatim
//    (who reported the death, Sign in with {provider}, the status line, the
//    cross-browser link row, paste-back) with its three calls as parameters,
//    plus optional `fields` rendered between the hint and the button (the
//    channel side's OAuth-client select: switching the client IS a
//    re-authorization).
import { createModalShell, showToast, copyText, escHtml } from './utils.js';
import { setupDirAutocomplete } from './autocomplete.js';
import { t as tr } from './i18n.js';

// the storage consent routes (rclone authorize over the server) — the default
export const MOUNT_OAUTH_ENDPOINTS = Object.freeze({
  start: '/api/mounts/gdrive-auth/start',
  status: '/api/mounts/gdrive-auth/status',
  callback: '/api/mounts/gdrive-auth/callback',
});

// fetch wrapper that THROWS on HTTP/{error} responses (utils fetchJson swallows)
export async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const d = await res.json().catch(() => ({}));
  // carry the server's machine-readable `code` (the key-import flow maps it to
  // localized text — a bare message string can't be translated)
  if (!res.ok || d.error) { const e = new Error(d.error || `HTTP ${res.status}`); e.code = d.code; e.body = d; throw e; } // verify-r5 A1: + the whole answer (a 409's facts)
  return d;
}

// OAuth cross-browser affordance (2.226.2, real report: the target Google
// account lived in ANOTHER browser and the flow force-opened the consent page
// in THIS one with the URL never shown). Always render the auth URL as a
// copyable row — ANY browser can complete the consent, and the paste-back
// relay doesn't care where the 127.0.0.1 redirect failed.
/** THE ONE NARROWING RETRY's row (owner ruling 2026-09-28). A vendor refuses a WHOLE consent that names a scope its
 *  app has not enabled — Lark's error 20027, shown on its own page and never redirected, so VibeSpace never hears it.
 *  `narrow` = `{scopes, run}` (the consent's optional scopes; `run()` → the SAME sign-in's consent URL without them,
 *  once). The person presses it after seeing that page; the account then names what was dropped — never a silent
 *  narrower consent. `onUrl(url)` opens and shows the new URL. */
export function narrowRow({ provider, narrow, onUrl }) {
  const row = document.createElement('div');
  row.className = 'mounts-field-hint mounts-oauth-narrow';
  // lane slack-scopes-lark-reauth: a big group (Lark's every-usable-scope group) is said by its count, the list in the title
  const list = narrow.scopes || [];
  const scopes = list.length > 3 ? tr('the {n} extra permissions', { n: list.length }) : list.join(' + ');
  if (list.length > 3) row.title = list.join(' ');
  // lane lark-search-poll (owner decision 5): ONE optional scope per press, least valuable first — a later press says
  // it drops this one TOO (the earlier ones stay dropped)
  const again = Array.isArray(narrow.dropped) && narrow.dropped.length > 0;
  row.appendChild(document.createTextNode((again ? tr('If {provider} still refuses the sign-in (error 20027):', { provider }) : tr('If {provider} refuses the sign-in because the app has not enabled {scopes} (error 20027):', { provider, scopes })) + ' '));
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'mounts-btn';
  b.textContent = again ? tr('Sign in without {scopes} too', { scopes }) : tr('Sign in without {scopes}', { scopes });
  b.onclick = async () => {
    b.disabled = true;
    try { const r = await narrow.run(); const url = typeof r === 'string' ? r : r && r.url; row.remove(); onUrl(url, r && typeof r === 'object' ? r.next || null : null); }
    catch (e) { b.disabled = false; row.textContent = (e && e.message) || tr('Failed'); }
  };
  row.appendChild(b);
  return row;
}
/** The link row + (when the consent has optional scopes) the narrowing row, after `status` — shared by both
 *  sign-in blocks so a narrowed URL replaces the link the same way everywhere. */
function drawConsentLinks(status, r, provider) {
  const scope = status.parentElement;
  scope?.querySelectorAll('.mounts-oauth-link, .mounts-oauth-narrow').forEach((e) => e.remove());
  const link = oauthLinkRow(r.url);
  status.after(link);
  // the narrowing chain (lane lark-search-poll): each press opens the SAME sign-in without one more optional scope and
  // offers the next press under the new link, until nothing optional is left
  const addNarrow = (after, narrow) => {
    if (!(narrow && Array.isArray(narrow.scopes) && narrow.scopes.length && typeof narrow.run === 'function')) return;
    after.after(narrowRow({ provider, narrow, onUrl: (url, next) => {
      scope?.querySelectorAll('.mounts-oauth-link, .mounts-oauth-narrow').forEach((e) => e.remove());
      const l2 = oauthLinkRow(url);
      status.after(l2);
      const w = window.open(url, '_blank');
      const all = [...(narrow.dropped || []), ...narrow.scopes];
      status.textContent = w ? tr('A {provider} sign-in page opened without {scopes}. Approve access, then come back here.', { provider, scopes: all.join(' + ') }) : tr('Popup blocked — copy the link below and open it in a browser yourself.');
      addNarrow(l2, next);
    } }));
  };
  addNarrow(link, r.narrow);
}
export function oauthLinkRow(url) {
  const row = document.createElement('div');
  row.className = 'mounts-oauth-link';
  const hint = document.createElement('div');
  hint.className = 'mounts-field-hint';
  hint.textContent = tr('Account signed in on ANOTHER browser? Copy this link and open it there:');
  row.append(hint, copyLine(url));
  return row;
}

// The link row's LINE — a read-only value + Copy. oauthLinkRow draws it under
// its cross-browser hint; a `type:'copy'` field draws it alone (the value a
// user must paste into a vendor console: a custom Lark app's callback URL).
function copyLine(value) {
  const line = document.createElement('div');
  line.style.cssText = 'display:flex;gap:4px;align-items:center;margin:2px 0;';
  const inp = document.createElement('input');
  inp.readOnly = true; inp.value = value; inp.style.flex = '1'; inp.style.minWidth = '0';
  inp.onfocus = () => inp.select();
  const cp = document.createElement('button');
  cp.type = 'button'; cp.className = 'mounts-btn'; cp.textContent = tr('Copy');
  cp.onclick = () => copyText(value).then(() => showToast(tr('Copied')));
  line.append(inp, cp);
  return line;
}

// opts.onClose: fires on X / backdrop dismissal — REQUIRED by any caller
// that awaits a Promise from this dialog, or cancelling it hangs the
// awaiting flow forever. Callers must make their resolve idempotent
// (close() runs on the submit path too).
export function mountsDialog(title, fields, submitLabel, onSubmit, opts = {}) {
  const { body, close } = createModalShell({ id: 'mounts-dialog-overlay', title, onClose: opts.onClose });
  const { inputs, applyConds, hasWhen } = renderFields(body, fields);
  const err = document.createElement('div');
  err.className = 'cfg-err';
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  const submit = document.createElement('button');
  submit.className = 'btn-create';
  submit.textContent = submitLabel;
  actions.appendChild(submit);
  body.append(err, actions);
  submit.onclick = async () => {
    err.textContent = '';
    submit.disabled = true;
    try {
      const vals = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value.trim()]));
      await onSubmit(vals, { close, body, err });
    } catch (e) { err.textContent = e.message || 'Failed'; submit.disabled = false; }
  };
  const ctx = { close, inputs, body, applyConds: hasWhen ? applyConds : () => {} };
  return ctx;
}

// THE FIELD RENDERER — the spec array (`{key, label, type, options, value,
// placeholder, when, hint, advanced, autocomplete, readonly}`) → label /
// control / hint line(s), the Advanced fold, and the `when:` re-evaluation.
// `mountsDialog` and `reauthDialog` both render through it; nothing else in
// src/lib may (scripts/test-oauth-field-parity.mjs §3). `note` / `copy`
// fields carry no value (they are never in `inputs`).
export function renderFields(body, fields) {
  const inputs = {};
  const rows = []; // {field, label, el} for conditional visibility
  let advBody = null;
  const readValues = () => Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
  for (const f of fields) {
    const label = document.createElement('label');
    label.textContent = f.label;
    let el;
    const valueless = f.type === 'note' || f.type === 'copy';
    if (f.type === 'select') {
      el = document.createElement('select');
      for (const [v, l] of f.options) { const o = document.createElement('option'); o.value = v; o.textContent = l; el.appendChild(o); }
      if (f.value) el.value = f.value;
    } else if (f.type === 'textarea') {
      el = document.createElement('textarea');
      el.placeholder = f.placeholder || '';
      el.style.minHeight = '72px'; el.style.fontSize = '12px';
      if (f.value) el.value = f.value;
    } else if (f.type === 'note') {
      el = document.createElement('div');
      el.className = 'mounts-note';
      el.dataset.field = f.key;
      el.textContent = f.value || '';
    } else if (f.type === 'copy') {
      el = document.createElement('div');
      el.className = 'mounts-oauth-link';
      el.dataset.field = f.key;
      el.appendChild(copyLine(f.value || ''));
    } else {
      el = document.createElement('input');
      el.type = f.type || 'text';
      el.placeholder = f.placeholder || '';
      if (f.value) el.value = f.value;
    }
    if (f.readonly && !valueless) el.readOnly = true;
    if (!valueless) inputs[f.key] = el;
    const rowRec = { field: f, label, el };
    rows.push(rowRec);
    // Path autocomplete (Tab / type-ahead) — 'local' completes against this
    // server's filesystem; a function returns a per-keystroke endpoint URL.
    if (f.autocomplete && el.tagName === 'INPUT') {
      const wrap = document.createElement('div');
      wrap.style.position = 'relative';
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      const dd = document.createElement('div');
      dd.className = 'path-autocomplete hidden';
      wrap.append(el, dd);
      rowRec.el = wrap; // visibility toggling targets the wrapper
      inputs[f.key] = el;
      setupDirAutocomplete(el, dd, {
        endpoint: typeof f.autocomplete === 'function' ? () => f.autocomplete(inputs) : undefined,
      });
      el._acWrap = wrap;
    }
    // Advanced fields collect into a collapsed <details> at the end so the
    // common case isn't cluttered with tuning knobs most users never touch.
    if (f.advanced && !advBody) { advBody = document.createElement('div'); advBody.className = 'mounts-adv-body'; }
    const dest = f.advanced ? advBody : body;
    // a label-less note / copy row draws no empty <label> (the body's flex gap would double)
    if (valueless && !f.label) dest.append(rowRec.el); else dest.append(label, rowRec.el);
    if (Array.isArray(f.hint)) {
      // a hint ARRAY = one hint line per fact (a vendor console's prerequisites)
      rowRec.hintEls = f.hint.filter(Boolean).map((text) => {
        const h = document.createElement('div');
        h.className = 'mounts-field-hint';
        h.textContent = text;
        dest.appendChild(h);
        return h;
      });
    } else if (f.hint) {
      const h = document.createElement('div');
      h.className = 'mounts-field-hint';
      h.textContent = f.hint;
      rowRec.hintEl = h;
      dest.appendChild(h);
    }
  }
  if (advBody) {
    const det = document.createElement('details');
    det.className = 'mounts-advanced';
    const sum = document.createElement('summary');
    sum.textContent = 'Advanced options';
    det.append(sum, advBody);
    body.appendChild(det);
  }
  // conditional fields: re-evaluate `when(values)` whenever any input changes
  const applyConds = () => {
    const vals = readValues();
    for (const { field, label, el, hintEl, hintEls } of rows) {
      const show = !field.when || field.when(vals);
      label.style.display = show ? '' : 'none';
      el.style.display = show ? '' : 'none';
      if (hintEl) hintEl.style.display = show ? '' : 'none';
      for (const h of hintEls || []) h.style.display = show ? '' : 'none';
    }
  };
  const hasWhen = fields.some(f => f.when);
  if (hasWhen) {
    for (const { el } of rows) { el.addEventListener('change', applyConds); el.addEventListener('input', applyConds); }
    applyConds();
  }
  return { inputs, rows, applyConds, hasWhen, readValues };
}

// Generic guided OAuth (rclone authorize <backend>) for a native record —
// reused by OneDrive and (via edit) any OAuth rclone backend. Mirrors the
// Drive connect flow: same-machine completes hands-free, remote pastes the
// 127.0.0.1 redirect back.
//
// An `endpoints` member may be a FUNCTION instead of a route (chunk 3: the
// channel Duplicate dialog's consent is bound to the record it creates):
// `start(body)` → `{url, notice?}`, `status()` → `{token?, error?, running}`,
// `callback({url})` → `{token?, error?}`. `extra()` adds body fields beside the
// client id/secret (the channel side's preset key); `provider` names the
// sign-in page; `pastePlaceholder` / `finishText` replace the storage words
// (`finishText` may be a function of the vendor identity). `start` may answer
// `pasteHint` for THIS flow (a design 018 `public` flow never lands on 127.0.0.1).
//
// The finish line NAMES the identity the status poll answered (`st.user`,
// 2.369.214): the consent may have landed in another browser profile, so a
// stranger's account is visible BEFORE Connect makes the record.
export const connectedLine = (user) => (user ? tr('✓ Connected as {user} — finish with the “Connect” button below.', { user: String(user).slice(0, 200) }) : tr('✓ Connected — finish with the “Connect” button below.'));
export function wireOAuthConnect(ctx, { tokenKey, backend, label, clientIdKey, clientSecretKey, endpoints = MOUNT_OAUTH_ENDPOINTS, extra = null, provider = null, pastePlaceholder = null, finishText = null, pasteHint = null, pasteSecret = false } = {}) {
  const PROVIDER_LABELS = { onedrive: 'Microsoft', drive: 'Google', dropbox: 'Dropbox', box: 'Box', pcloud: 'pCloud', yandex: 'Yandex', jottacloud: 'Jottacloud', hidrive: 'HiDrive' };
  const tokenInput = ctx.inputs[tokenKey];
  if (!tokenInput) return;
  const post = (ep, payload) => typeof ep === 'function' ? ep(payload) : api(ep, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
  const get = (ep) => typeof ep === 'function' ? ep() : api(ep);
  const wrap = document.createElement('div');
  wrap.className = 'mounts-drive-connect';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'mounts-btn mounts-btn-primary'; btn.textContent = label;
  const status = document.createElement('div'); status.className = 'mounts-field-hint';
  wrap.append(btn, status);
  tokenInput.before(wrap);
  const sync = () => { wrap.style.display = tokenInput.style.display; };
  new MutationObserver(sync).observe(tokenInput, { attributes: true, attributeFilter: ['style'] });
  sync();
  let pasteBox = null, poll = null;
  const stopPoll = () => { clearInterval(poll); poll = null; };
  const finish = (token, user = null) => { stopPoll(); tokenInput.value = token; status.textContent = typeof finishText === 'function' ? finishText(user) : (finishText || connectedLine(user)); btn.textContent = tr('Reconnect'); btn.disabled = false; pasteBox?.remove(); pasteBox = null; };
  btn.onclick = async () => {
    btn.disabled = true; status.textContent = tr('Preparing authorization…');
    try {
      const body = { backend: typeof backend === 'function' ? backend() : backend };
      if (clientIdKey && ctx.inputs[clientIdKey]?.value) { body.clientId = ctx.inputs[clientIdKey].value; body.clientSecret = ctx.inputs[clientSecretKey]?.value || ''; }
      if (extra) Object.assign(body, extra() || {});
      const r = await post(endpoints.start, body);
      if (r.error) throw new Error(r.error);
      const _w = window.open(r.url, '_blank');
      drawConsentLinks(status, r, provider || PROVIDER_LABELS[body.backend] || body.backend);
      status.textContent = tr('A {provider} sign-in page opened. Approve access, then come back here.', { provider: provider || PROVIDER_LABELS[body.backend] || body.backend });
      if (!_w) status.textContent = tr('Popup blocked — copy the link below and open it in a browser yourself.');
      if (r.notice) status.textContent = r.notice;
      if (!pasteBox) {
        pasteBox = document.createElement('div');
        pasteBox.innerHTML = `<div class="mounts-field-hint">${(r.pasteHint || pasteHint) ? escHtml(r.pasteHint || pasteHint) : escHtml(tr("If the final page fails to load (address starts with 127.0.0.1 — VibeSpace runs on another machine, or you authorized in a different browser), copy that address and paste it here:"))}</div>`;
        const inp = document.createElement('input'); inp.placeholder = pastePlaceholder || 'http://127.0.0.1:53682/?state=…&code=…';
        if (pasteSecret) { inp.type = 'password'; inp.autocomplete = 'off'; inp.spellcheck = false; }   // design 012: a pasted TOKEN is a secret — never drawn in the clear
        inp.onchange = async () => { try { status.textContent = tr('Completing…'); const fr = await post(endpoints.callback, { url: inp.value }); if (fr.error) throw new Error(fr.error); if (fr.token) finish(fr.token, fr.user || null); } catch (e) { status.textContent = e.message || tr('Failed'); } };
        pasteBox.appendChild(inp); wrap.appendChild(pasteBox);
      }
      poll = setInterval(async () => { try { const st = await get(endpoints.status); if (st.token) finish(st.token, st.user || null); else if (st.error) { stopPoll(); status.textContent = st.error; btn.disabled = false; } else if (!st.running) { stopPoll(); btn.disabled = false; } } catch {} }, 1500);
    } catch (e) { status.textContent = e.message || tr('Failed to start authorization'); btn.disabled = false; }
  };
}

// NUMBERED PASTE STEPS (design 017 — Slack's two pastes; the channel account dialogs hand in the words, the endpoints
// and the memory, this module draws). ① a one-time setup token + "Create the app" (the paste names its box `config`);
// ② the made app's install page; ③ the user token (box `user`), sent when the dialog's own Connect asks
// `connectFlow()`. A step not reached yet is FOLDED (its title only — never a greyed control); the fallback fold holds
// the share link, "Copy app setup" (the link's own JSON) and the clicks, and unfolds ③. `memory` remembers the made
// app (never a token) so a dialog closed after ① opens at ②. → `{connectFlow(), connected()}`.
export function wireStepPaste(ctx, { tokenKey, configPage, start, callback, whyText, manifestOf, memory, words: w }) {
  const tokenInput = ctx.inputs[tokenKey];
  if (!tokenInput) return null;
  let flowId = null, consentUrl = null, app = memory.recall();
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const button = (label, onClick, primary = false) => { const b = mk('button', primary ? 'mounts-btn mounts-btn-primary' : 'mounts-btn', label); b.type = 'button'; b.onclick = onClick; return b; };
  const hint = (text) => mk('div', 'mounts-field-hint', text);
  const secretBox = (ph) => { const i = mk('input', 'chan-paste-input'); i.type = 'password'; i.autocomplete = 'off'; i.spellcheck = false; i.placeholder = ph; return i; };
  const wrap = mk('div', 'chan-paste-steps');
  wrap.dataset.pasteSteps = tokenKey;
  tokenInput.before(wrap);
  const sync = () => { wrap.style.display = tokenInput.style.display; };
  new MutationObserver(sync).observe(tokenInput, { attributes: true, attributeFilter: ['style'] });
  sync();
  const step = (n, title) => {
    const s = mk('section', 'chan-paste-step');
    s.dataset.step = String(n);
    const head = mk('div', 'chan-paste-step-head');
    head.append(mk('span', 'chan-paste-step-num', String(n)), mk('span', 'chan-paste-step-title', title));
    const body = mk('div', 'chan-paste-step-body');
    s.append(head, body);
    wrap.append(s);
    return { s, body };
  };
  const fold = (x, folded) => { x.s.dataset.state = folded ? 'folded' : 'open'; x.body.hidden = !!folded; };
  async function ensureFlow() {
    if (flowId) return flowId;
    const r = await start();
    flowId = r.flowId || (r.flow && r.flow.flowId) || null;
    consentUrl = r.url || (r.flow && r.flow.consentUrl) || null;
    return flowId;
  }
  async function paste(box, value) {
    for (let i = 0; i < 2; i++) {
      await ensureFlow();
      try { return await callback({ url: value, flowId, box }); }
      catch (e) { if (e && e.code === 'no-flow' && i === 0) { flowId = null; continue; } throw new Error(whyText(e)); }   // a flow past its time: one fresh flow
    }
    throw new Error(w.failed);
  }
  // ① the setup token
  const s1 = step(1, w.step1);
  const in1 = secretBox('xoxe.xoxp-…');
  const st1 = hint('');
  st1.classList.add('chan-paste-status');
  const again = hint('');
  const make = button(w.create, async () => {
    const v = in1.value.trim();
    if (!v) { st1.textContent = w.pasteSetupFirst; return; }
    make.disabled = true; st1.textContent = w.creating;
    try {
      const r = await paste('config', v);
      in1.value = '';
      if (!r || r.step !== 'created' || !r.stepFacts) throw new Error(w.failed);
      const prev = app;
      app = memory.save(r.stepFacts);
      st1.textContent = ''; again.textContent = '';
      showMade(prev);
    } catch (e) { st1.textContent = e.message || w.failed; }
    finally { make.disabled = false; }
  }, true);
  s1.body.append(button(w.openConfig, () => window.open(configPage, '_blank', 'noopener')), hint(w.step1Hint), hint(w.vendorApp), again, in1, make, st1);
  const made = mk('div', 'chan-paste-step-done');
  s1.s.append(made);
  // ② the install page
  const s2 = step(2, w.step2);
  s2.body.append(button(w.openInstall, () => { if (app && app.installUrl) window.open(app.installUrl, '_blank', 'noopener'); }, true), hint(w.step2Hint), hint(w.approval));
  // ③ the user token — sent by the dialog's own Connect
  const s3 = step(3, w.step3);
  const in3 = secretBox('xoxp-…');
  const st3 = hint('');
  s3.body.append(hint(w.step3Hint), in3, st3);
  // the fallback: the app made on Slack's own pages
  const fb = mk('details', 'chan-paste-fallback');
  const fbErr = hint('');
  const withFlow = (fn) => async () => { try { await ensureFlow(); fbErr.textContent = ''; await fn(); } catch (e) { fbErr.textContent = e.message || w.failed; } };
  fb.append(mk('summary', null, w.fallback),
    button(w.openLink, withFlow(async () => { if (consentUrl) window.open(consentUrl, '_blank', 'noopener'); })),
    button(w.copySetup, withFlow(async () => {
      const json = manifestOf(consentUrl);
      if (!json) { fbErr.textContent = w.copyFailed; return; }
      try { await copyText(json); showToast(w.copied); }   // copyText: the clipboard API, or the textarea fallback on a plain-http instance
      catch { fbErr.textContent = w.copyFailed; }
    })),
    hint(w.clicks), fbErr);
  fb.addEventListener('toggle', () => { if (fb.open) fold(s3, false); });
  wrap.append(fb, hint(w.finePrint));
  function showMade(prev = null) {
    made.textContent = '';
    made.append(mk('div', 'mounts-field-hint chan-paste-made', w.made(app)));
    if (prev && prev.appId !== app.appId) made.append(hint(w.madeAnother(prev)));
    made.append(button(w.another, () => { fold(s1, false); again.textContent = w.makesAnother(app); }));
    made.hidden = false;
    fold(s1, true); fold(s2, false); fold(s3, false);
  }
  if (app) showMade(); else { made.hidden = true; fold(s1, false); fold(s2, true); fold(s3, true); }
  return {
    /** The dialog's Connect: ③'s token lands on the flow (box `user`) → the flow id Connect submits. */
    async connectFlow() {
      if (tokenInput.value) return tokenInput.value;
      const v = in3.value.trim();
      if (!v) { fold(s3, false); throw new Error(w.pasteUserFirst); }
      st3.textContent = w.checking;
      try {
        const r = await paste('user', v);
        if (!r || !r.token) throw new Error(w.failed);
        in3.value = ''; st3.textContent = '';
        tokenInput.value = r.token;
        return r.token;
      } catch (e) { st3.textContent = e.message || w.failed; throw e; }
    },
    connected() { memory.forget(); },
  };
}

// RE-AUTHORIZE an existing record whose sign-in died (2.369.165 chunk 3:
// moved verbatim out of sidebar-mounts.js's `_showDriveReauthDialog`, the
// storage side now a caller). The hint names who reported the death; one
// primary "Sign in with {provider}" button; the status line; the cross-browser
// link row and the paste-back box once a consent is running. The three calls
// are parameters: `start(values)` → `{url, notice?}` (`values` = the optional
// `fields`' current values), `status()` → `{token?, fail?}` (polled every
// 1.5 s for 10 min while the dialog is open; `fail` = a named failure that
// stops the poll — the storage status route never sends it), `callback(url)`
// → `{token}`, and `finish(token, {close})` applies the new sign-in. `fields`
// (optional) render through `renderFields` between the hint and the button —
// the channel accounts' OAuth-client select.
export function reauthDialog({ id = 'mount-reauth-dialog', title, hint: hintText, signinLabel, provider, fields = null, start, status: statusOf, callback, finish: apply, savingText = null, pasteHint = null, pasteSecret = false, pastePlaceholder = 'http://127.0.0.1:53682/?state=…&code=…' }) {
  const { body, close } = createModalShell({ id, title, bodyClass: 'mounts-dialog-body', escapeToClose: true });
  const hint = document.createElement('div');
  hint.className = 'mounts-field-hint';
  hint.textContent = hintText;
  const btn = document.createElement('button');
  btn.className = 'mounts-btn mounts-btn-primary';
  btn.textContent = signinLabel;
  const status = document.createElement('div');
  status.className = 'mounts-field-hint';
  let form = null;
  if (fields && fields.length) { body.append(hint); form = renderFields(body, fields); body.append(btn, status); }
  else body.append(hint, btn, status);
  let pasteBox = null, poll = null;
  const stopPoll = () => { clearInterval(poll); poll = null; };
  const finish = async (token) => {
    stopPoll();
    status.textContent = savingText || tr('Saving token & reconnecting…');
    try {
      await apply(token, { close, status });
    } catch (e) { status.textContent = e.message || 'Failed'; btn.disabled = false; }
  };
  btn.onclick = async () => {
    btn.disabled = true;
    status.textContent = tr('Preparing authorization…');
    try {
      const r = await start(form ? form.readValues() : {});
      if (r.error) throw new Error(r.error);
      const _w = window.open(r.url, '_blank');
      drawConsentLinks(status, r, provider);
      status.textContent = tr('A {provider} sign-in page opened. Approve access, then come back here.', { provider });
      if (!_w) status.textContent = tr('Popup blocked — copy the link below and open it in a browser yourself.');
      if (r.notice) status.textContent = r.notice;
      if (!pasteBox) {
        pasteBox = document.createElement('div');
        pasteBox.innerHTML = `<div class="mounts-field-hint">${(r.pasteHint || pasteHint) ? escHtml(r.pasteHint || pasteHint) : escHtml(tr("If the final page fails to load (address starts with 127.0.0.1 — VibeSpace runs on another machine, or you authorized in a different browser), copy that address and paste it here:"))}</div>`;
        const inp = document.createElement('input');
        inp.placeholder = pastePlaceholder;
        if (pasteSecret) { inp.type = 'password'; inp.autocomplete = 'off'; inp.spellcheck = false; }
        inp.onchange = async () => {
          try {
            status.textContent = tr('Completing…');
            const fr = await callback(inp.value);
            finish(fr.token);
          } catch (e) { status.textContent = e.message || tr('Failed'); }
        };
        pasteBox.appendChild(inp);
        body.appendChild(pasteBox);
      }
      poll = setInterval(async () => {
        if (!status.isConnected) { stopPoll(); return; } // dialog closed
        try {
          const st = await statusOf();
          if (st.token) finish(st.token);
          else if (st.fail) { stopPoll(); status.textContent = st.fail; btn.disabled = false; }
        } catch {}
      }, 1500);
      // client-from-mount verify r5: the consent machine ends a sign-in 10 min after it began and SAYS so on the record
      // (the watcher's `fail`), but this stop used to fire at the same instant and only clear the interval — the last
      // 1.5 s tick had run before the frame landed, so the dialog kept "A … sign-in page opened" and a disabled button
      // for ever. The stop now waits past the machine's own end, reads the watcher once more, and says what it found.
      setTimeout(async () => {
        stopPoll();
        if (!status.isConnected || !btn.disabled) return;
        let st = {}; try { st = await statusOf(); } catch {}
        if (st.token) return finish(st.token);
        status.textContent = st.fail || tr('The sign-in was not finished in time — sign in again');
        btn.disabled = false;
      }, 10 * 60 * 1000 + 5000);
    } catch (e) {
      status.textContent = e.message || tr('Failed to start authorization');
      btn.disabled = false;
    }
  };
  return { close, body, inputs: form ? form.inputs : {}, button: btn, status };
}
