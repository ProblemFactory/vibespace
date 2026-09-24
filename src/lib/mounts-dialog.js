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
  if (!res.ok || d.error) { const e = new Error(d.error || `HTTP ${res.status}`); e.code = d.code; throw e; }
  return d;
}

// OAuth cross-browser affordance (2.226.2, real report: the target Google
// account lived in ANOTHER browser and the flow force-opened the consent page
// in THIS one with the URL never shown). Always render the auth URL as a
// copyable row — ANY browser can complete the consent, and the paste-back
// relay doesn't care where the 127.0.0.1 redirect failed.
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
// sign-in page; `pastePlaceholder` / `finishText` replace the storage words.
export function wireOAuthConnect(ctx, { tokenKey, backend, label, clientIdKey, clientSecretKey, endpoints = MOUNT_OAUTH_ENDPOINTS, extra = null, provider = null, pastePlaceholder = null, finishText = null } = {}) {
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
  const finish = (token) => { stopPoll(); tokenInput.value = token; status.textContent = finishText || tr('✓ Connected — finish with the “Connect” button below.'); btn.textContent = tr('Reconnect'); btn.disabled = false; pasteBox?.remove(); pasteBox = null; };
  btn.onclick = async () => {
    btn.disabled = true; status.textContent = tr('Preparing authorization…');
    try {
      const body = { backend: typeof backend === 'function' ? backend() : backend };
      if (clientIdKey && ctx.inputs[clientIdKey]?.value) { body.clientId = ctx.inputs[clientIdKey].value; body.clientSecret = ctx.inputs[clientSecretKey]?.value || ''; }
      if (extra) Object.assign(body, extra() || {});
      const r = await post(endpoints.start, body);
      if (r.error) throw new Error(r.error);
      const _w = window.open(r.url, '_blank');
      status.parentElement?.querySelectorAll('.mounts-oauth-link').forEach((e) => e.remove());
      status.after(oauthLinkRow(r.url));
      status.textContent = tr('A {provider} sign-in page opened. Approve access, then come back here.', { provider: provider || PROVIDER_LABELS[body.backend] || body.backend });
      if (!_w) status.textContent = tr('Popup blocked — copy the link below and open it in a browser yourself.');
      if (r.notice) status.textContent = r.notice;
      if (!pasteBox) {
        pasteBox = document.createElement('div');
        pasteBox.innerHTML = `<div class="mounts-field-hint">${escHtml(tr("If the final page fails to load (address starts with 127.0.0.1 — VibeSpace runs on another machine, or you authorized in a different browser), copy that address and paste it here:"))}</div>`;
        const inp = document.createElement('input'); inp.placeholder = pastePlaceholder || 'http://127.0.0.1:53682/?state=…&code=…';
        inp.onchange = async () => { try { status.textContent = tr('Completing…'); const fr = await post(endpoints.callback, { url: inp.value }); if (fr.error) throw new Error(fr.error); if (fr.token) finish(fr.token); } catch (e) { status.textContent = e.message || tr('Failed'); } };
        pasteBox.appendChild(inp); wrap.appendChild(pasteBox);
      }
      poll = setInterval(async () => { try { const st = await get(endpoints.status); if (st.token) finish(st.token); else if (st.error) { stopPoll(); status.textContent = st.error; btn.disabled = false; } else if (!st.running) { stopPoll(); btn.disabled = false; } } catch {} }, 1500);
    } catch (e) { status.textContent = e.message || tr('Failed to start authorization'); btn.disabled = false; }
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
export function reauthDialog({ id = 'mount-reauth-dialog', title, hint: hintText, signinLabel, provider, fields = null, start, status: statusOf, callback, finish: apply, savingText = null, pastePlaceholder = 'http://127.0.0.1:53682/?state=…&code=…' }) {
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
      status.parentElement?.querySelectorAll('.mounts-oauth-link').forEach((e) => e.remove());
      status.after(oauthLinkRow(r.url));
      status.textContent = tr('A {provider} sign-in page opened. Approve access, then come back here.', { provider });
      if (!_w) status.textContent = tr('Popup blocked — copy the link below and open it in a browser yourself.');
      if (r.notice) status.textContent = r.notice;
      if (!pasteBox) {
        pasteBox = document.createElement('div');
        pasteBox.innerHTML = `<div class="mounts-field-hint">${escHtml(tr("If the final page fails to load (address starts with 127.0.0.1 — VibeSpace runs on another machine, or you authorized in a different browser), copy that address and paste it here:"))}</div>`;
        const inp = document.createElement('input');
        inp.placeholder = pastePlaceholder;
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
      setTimeout(stopPoll, 10 * 60 * 1000);
    } catch (e) {
      status.textContent = e.message || tr('Failed to start authorization');
      btn.disabled = false;
    }
  };
  return { close, body, inputs: form ? form.inputs : {}, button: btn, status };
}
