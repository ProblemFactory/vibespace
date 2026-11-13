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
import { createModalShell, showToast, copyText } from './utils.js';
import { pathField } from './path-field.js'; // lane path-field: THE path field
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
  // lane lark-consent-chain ADDENDUM 1: the row exists because the app's own list could not be read — said, with what it answered
  const floor = narrow.from === 'floor' && !again;
  if (floor) row.dataset.from = 'floor';
  row.appendChild(document.createTextNode((again ? tr('If {provider} still refuses the sign-in (error 20027):', { provider }) : floor ? tr('The app’s list of permissions could not be read ({why}), so this sign-in asks the built-in list. If {provider} refuses it (error 20027), retry without {scopes}:', { provider, scopes, why: String(narrow.floorWhy || tr('no answer')).slice(0, 160) }) : tr('If {provider} refuses the sign-in because the app has not enabled {scopes} (error 20027):', { provider, scopes })) + ' '));
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
// lane pod-oauth-callback (study 2 B2 — nobody walked the copy-the-failed-page's-address box; one tester closed the
// dialog at it): a caller that names the box's line (`r.pasteTitle` — the channel account dialogs) makes the paste-back the
// LAST RESORT — folded under that line; unfolded: why, in a person's words, the box, and for a consent that lands on this
// instance (`public`) the address an admin adds to the vendor's app (`r.askAdmin`) and the other road (`r.otherRoad` — the
// copy-the-address way). A pasted TOKEN (Slack's per-person app: `pasteSecret`) IS the road and stays open; a caller that
// names no line (the storage dialogs — test-mounts-dialog-extract holds them to their baseline) keeps the open box.
function pasteBack({ r = {}, pasteHint = null, pastePlaceholder, pasteSecret = false, onPaste, onOtherRoad = null, onCancel = null }) {
  const hint = document.createElement('div');
  hint.className = 'mounts-field-hint';
  hint.textContent = r.pasteHint || pasteHint || tr("If the final page fails to load (address starts with 127.0.0.1 — VibeSpace runs on another machine, or you authorized in a different browser), copy that address and paste it here:");
  const inp = document.createElement('input');
  inp.placeholder = pastePlaceholder;
  if (pasteSecret) { inp.type = 'password'; inp.autocomplete = 'off'; inp.spellcheck = false; }   // design 012: a pasted TOKEN is a secret — never drawn in the clear
  inp.onchange = () => onPaste(inp.value);
  if (pasteSecret || !r.pasteTitle) { const box = document.createElement('div'); box.append(hint, inp); return box; }
  if (r.live) return liveBack({ r, hint, inp, onOtherRoad, onCancel });
  const box = document.createElement('details');
  box.className = 'mounts-oauth-paste';
  const sum = document.createElement('summary');
  sum.className = 'mounts-field-hint';
  sum.textContent = r.pasteTitle;
  box.append(sum);
  if (r.askAdmin && r.askAdmin.value) {
    const a = document.createElement('div');
    a.className = 'mounts-field-hint mounts-oauth-admin';
    a.textContent = r.askAdmin.text;
    box.append(a, copyLine(r.askAdmin.value));
    // lane oauth-setup-instructions: the vendor's own refusal words + WHERE the address goes (the setup card's same lines)
    for (const n of Array.isArray(r.askAdmin.notes) ? r.askAdmin.notes : []) {
      const d = document.createElement('div');
      d.className = 'mounts-field-hint mounts-oauth-admin-note';
      d.textContent = n;
      box.append(d);
    }
  }
  box.append(hint, inp);
  if (r.otherRoad && typeof r.otherRoad.run === 'function' && onOtherRoad) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mounts-btn mounts-oauth-other'; b.textContent = r.otherRoad.label;
    b.onclick = async () => { b.disabled = true; try { await onOtherRoad(await r.otherRoad.run()); } catch (e) { b.disabled = false; hint.textContent = (e && e.message) || tr('Failed'); } };
    box.append(b);
  }
  return box;
}
// lane gmail-connect-wall (the owner 2026-11-09: «打不开授权页然后就没法继续操作任何东西了» — after the press the dialog was a
// greyed button and a fold): THE LIVE LAYOUT of a channel account dialog's consent (`r.live`, src/lib/channel-account-dialogs.js
// routeTrouble). The box the road needs is OPEN when the road needs it (`r.pasteOpen`: a loopback from another computer — its
// last page never loads), else folded under its line; the OTHER road and Cancel are visible buttons; only the ADMIN's part
// (the address to list, the console path, what the preset does not say) sits in a fold titled for the admin.
function liveBack({ r, hint, inp, onOtherRoad, onCancel }) {
  const box = document.createElement('div');
  box.className = 'mounts-oauth-live';
  if (r.pasteOpen) {
    box.dataset.paste = 'open';
    if (r.pasteHint) box.append(hint);
    box.append(inp);
  } else {
    const fold = document.createElement('details');
    fold.className = 'mounts-oauth-paste';
    const sum = document.createElement('summary');
    sum.className = 'mounts-field-hint';
    sum.textContent = r.pasteTitle;
    fold.append(sum, hint, inp);
    box.append(fold);
  }
  const why = document.createElement('div');
  why.className = 'mounts-field-hint mounts-oauth-error';
  const actions = document.createElement('div');
  actions.className = 'mounts-oauth-actions';
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 2px;';
  if (r.otherRoad && typeof r.otherRoad.run === 'function' && onOtherRoad) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mounts-btn mounts-oauth-other'; b.textContent = r.otherRoad.label;
    b.onclick = async () => { b.disabled = true; try { await onOtherRoad(await r.otherRoad.run()); } catch (e) { b.disabled = false; why.textContent = (e && e.message) || tr('Failed'); } };
    actions.append(b);
  }
  if (typeof onCancel === 'function') {
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'mounts-btn mounts-oauth-cancel'; c.textContent = tr('Cancel the sign-in');
    c.onclick = async () => { c.disabled = true; try { await onCancel(); } catch (e) { c.disabled = false; why.textContent = (e && e.message) || tr('Failed'); } };
    actions.append(c);
  }
  if (actions.childElementCount) box.append(actions);
  if (r.otherRoad && r.otherRoad.hint) {
    const h = document.createElement('div');
    h.className = 'mounts-field-hint mounts-oauth-other-why';
    h.textContent = r.otherRoad.hint;
    box.append(h);
  }
  box.append(why);
  const admin = r.askAdmin || null;
  if (admin && (admin.value || (Array.isArray(admin.notes) && admin.notes.length))) {
    const f = document.createElement('details');
    f.className = 'mounts-oauth-admin-fold';
    const s = document.createElement('summary');
    s.className = 'mounts-field-hint';
    s.textContent = admin.title || admin.text;
    f.append(s);
    if (admin.value) {
      const a = document.createElement('div');
      a.className = 'mounts-field-hint mounts-oauth-admin';
      a.textContent = admin.text;
      f.append(a, copyLine(admin.value));
    }
    for (const n of Array.isArray(admin.notes) ? admin.notes : []) {
      const d = document.createElement('div');
      d.className = 'mounts-field-hint mounts-oauth-admin-note';
      d.textContent = n;
      f.append(d);
    }
    box.append(f);
  }
  return box;
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
// opts.id — EVERY caller names its own (lane dialog-yield r3: ~17 forms shared the default 'mounts-dialog-overlay', and opening
// Connect storage closed the running «Set up <machine>» through the shared id's door); opts.key = the subject (the machine, the
// mount, the account). The same id + key opened again is RAISED and its ctx comes back.
export function mountsDialog(title, fields, submitLabel, onSubmit, opts = {}) {
  // not the subject: fields — the caller's opts.key names them (every mountsDialog call is a census row of its own, r5)
  const shell = createModalShell({ id: opts.id, key: opts.key, title, onClose: opts.onClose, escapeToClose: true, kind: 'form' });
  if (shell.raised) return shell.overlay._mountsCtx || { body: shell.body, close: shell.close, raised: true, asked: shell.asked, ready: shell.ready, live: shell.live };
  const { body, close } = shell;
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
      for (const el of Object.values(inputs)) {
        const pf = el._pathField;
        if (!pf || !el.value.trim() || !pf.el.isConnected || pf.el.offsetParent === null) continue;   // empty / hidden: nothing to take
        const v = await pf.commit();
        if (!v || !(await pf.ensure())) { err.textContent = pf.verdict().text; submit.disabled = false; el.focus(); return; }
      }
      const vals = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value.trim()]));
      await onSubmit(vals, { close, body, err });
    } catch (e) { err.textContent = e.message || 'Failed'; submit.disabled = false; }
  };
  // the caller is TOLD like createModalShell's (lane dialog-yield r5): `asked` (queued behind the open one's ask), `ready` (→ the
  // shell when it opens, null when the person kept that one), `live()` — THE liveness predicate
  const ctx = { close, inputs, body, applyConds: hasWhen ? applyConds : () => {}, asked: shell.asked, ready: shell.ready, live: shell.live };
  shell.overlay._mountsCtx = ctx;   // what a re-open of this form hands back
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
    const valueless = f.type === 'note' || f.type === 'copy' || f.type === 'node';
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
    } else if (f.type === 'node') {
      // a live element a caller built (lane guards-door: the guard rows) — valueless, never in `inputs`
      el = f.node || document.createElement('div');
      el.dataset.field = f.key;
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
    // THE PATH FIELD (lane path-field — it replaced the Tab / type-ahead completion): 'local' = this server's folders; a
    // function returns the per-keystroke endpoint of a machine (`/api/hosts/<id>/dir-complete`) — the field asks THAT
    // machine. What takes effect is written back absolute (the dialog reads the input). A field that names a FILE says so
    // (`pathKind: 'file'` — a key file); a mount point may not exist yet (made once ticked, before the submit), every other
    // folder must; Submit commits each path field first and stops on the one that does not take (its reason under it).
    if (f.autocomplete && el.tagName === 'INPUT') {
      const hostOf = () => {
        if (typeof f.autocomplete !== 'function') return null;
        const m = /\/api\/hosts\/([^/?]+)\/dir-complete/.exec(String(f.autocomplete(inputs) || ''));
        return m ? decodeURIComponent(m[1]) : null;
      };
      const madeHere = /^(mountpoint|customPath)$/.test(f.key);
      const pf = pathField(el, { host: hostOf, kind: f.pathKind === 'file' ? 'file' : 'folder', create: madeHere ? 'ask' : 'never', createWhen: tr('Create this folder when this is saved'), id: 'mounts:' + f.key, onCommit: (info) => { if (info && info.path && el.value !== info.path) el.value = info.path; } });
      rowRec.el = pf.el; // visibility toggling targets the field
      inputs[f.key] = el;
      el._acWrap = pf.el;
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
    const prereqs = Array.isArray(f.prereqs) ? f.prereqs.filter(Boolean) : [];
    if (prereqs.length) {
      // lane ui-controls-and-bugs (the walk's channels-accounts-8: three console prerequisites as run-on sentences): a CHECKLIST
      // under one line — the Integrations window's own list (ul.integ-prereq); shown and hidden with its row
      const head = document.createElement('div');
      head.className = 'mounts-field-hint mounts-prereq-head';
      head.textContent = tr('Before you start, check:');
      const ul = document.createElement('ul');
      ul.className = 'integ-prereq';
      for (const p of prereqs) { const li = document.createElement('li'); li.textContent = p; ul.appendChild(li); }
      dest.append(head, ul);
      rowRec.hintEls = [...(rowRec.hintEls || []), head, ul];
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
// lane gmail-connect-wall: `live` (the channel account dialogs only — a storage dialog passes none and keeps its block byte for
// byte, test-mounts-dialog-extract): {again (the button's words once a sign-in runs — it opens the sign-in AGAIN, the server
// replacing the earlier one), cancel() (the visible one-press Cancel), attach() → a block for a sign-in still running when the
// dialog opens (shown, never opened again), onFlow(r) (the caller hears every block it shows)}. The button is never greyed
// beside a hint: it is busy only while its own request runs.
export function wireOAuthConnect(ctx, { tokenKey, backend, label, clientIdKey, clientSecretKey, endpoints = MOUNT_OAUTH_ENDPOINTS, extra = null, provider = null, pastePlaceholder = null, finishText = null, pasteHint = null, pasteSecret = false, signins = {}, live = null } = {}) {
  // `signins`: rclone backend → the sign-in provider's name (the storage rows' client.signins cells; a caller may name `provider`)
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
  // lane gmail-connect-wall r2 (law E2 + the phone): a live block wraps a long address inside the dialog, and on a finger device
  // its buttons and box meet the 44 px / 16 px rule (public/style.css) — a storage block gets neither class
  if (live) { wrap.classList.add('mounts-oauth-live-block'); btn.classList.add('mounts-oauth-live-btn'); }
  tokenInput.before(wrap);
  const sync = () => { wrap.style.display = tokenInput.style.display; };
  new MutationObserver(sync).observe(tokenInput, { attributes: true, attributeFilter: ['style'] });
  sync();
  let pasteBox = null, poll = null;
  // lane gmail-connect-wall r2 (law B): the live block follows ONE sign-in — every press (the button, the other road, Cancel)
  // ends the earlier watch BEFORE it starts, and an answer that belongs to an older press changes nothing on screen
  let gen = 0;
  // r3 (the acceptance: «Cancel ends what the hub is running»): the sign-in ON SCREEN (`shownId`) and the press IN FLIGHT
  // (its start not answered yet) — Cancel ends both; the dialog says «cancelled» only once neither runs
  let shownId = null, inflight = null;
  // r4 (acceptance r3, THE LAW: after any await a handler draws and keeps nothing unless it is still the latest act — and
  // closing the dialog is an act): `closed` = the dialog that holds this block closed (the caller's `close()` below)
  let closed = false;
  const stopPoll = () => { clearInterval(poll); poll = null; };
  // r4 (the smaller point): while a press or a Cancel runs, BOTH press controls (the button and the other road) are busy — one
  // act at a time; Cancel stays usable during a press (it ends what that press starts)
  const busy = (on) => { if (!live) return; btn.disabled = !!on; const o = pasteBox && pasteBox.querySelector('.mounts-oauth-other'); if (o) o.disabled = !!on; };
  // r4: a press whose answer lands when it is no longer the latest act (a newer press, Cancel) or after the close: its sign-in
  // is never shown and no page opens for it — nobody can finish it, whatever its road — so it is ended (by its id; the shown
  // one is never touched). A sign-in that needed this dialog's paste box is said once (as the close says it for a shown one).
  // R5 is about a SHOWN sign-in: one whose page is open and comes back by itself keeps running at the close.
  // r4 (the tidy's last word): what this page started of the kind and the dialog was needed for, read off the hub (its `ref`)
  const sweepLater = () => { if (live && typeof live.sweep === 'function') Promise.resolve().then(() => live.sweep()).catch(() => {}); };
  const strayEnd = (r, prov) => {
    if (!live || !r || !r.flowId || r.flowId === shownId || typeof live.cancel !== 'function') return null;
    return Promise.resolve().then(() => live.cancel(r.flowId)).then((x) => { if (closed && r.needsDialog && x && x.cancelled) showToast(tr('The {provider} sign-in was ended: it needed this dialog to finish.', { provider: prov })); return x; }).catch(() => null);
  };
  const finish = (token, user = null) => { stopPoll(); tokenInput.value = token; status.textContent = typeof finishText === 'function' ? finishText(user) : (finishText || connectedLine(user)); btn.textContent = tr('Reconnect'); btn.disabled = false; pasteBox?.remove(); pasteBox = null; if (live) delete wrap.dataset.flow; };
  // lane gmail-connect-wall (live): a sign-in that ended without landing — the block back to its first state, its line said
  const ended = (line) => { stopPoll(); status.textContent = line; btn.textContent = label; btn.disabled = false; pasteBox?.remove(); pasteBox = null; delete wrap.dataset.flow; wrap.querySelectorAll('.mounts-oauth-link, .mounts-oauth-narrow').forEach((e) => e.remove()); };
  // ONE consent shown in the block: its page opened, its links, the folded paste-back, its poll (lane pod-oauth-callback:
  // the other road re-shows the block for the consent it started)
  // r2 (law C): a press that failed says what is true — the sign-in that still runs (shown again, its watch back) or none
  const afterFail = async (e, prov, press) => {
    if (press !== gen) return;
    const why = tr('This press did not start a sign-in: {error}', { error: (e && e.message) || tr('Failed') });
    let still = null;
    try { still = typeof live.afterFail === 'function' ? await live.afterFail() : null; } catch { still = null; }
    // r4 (the tidy): closed while it read — a press whose answer was lost may have started the sign-in that runs; no page opened
    // for it and no dialog is left to finish it, so it is ended (by its id, as strayEnd ends every late one)
    if (press !== gen) { if (closed) sweepLater(); return; }
    if (still && still.token) { finish(still.token, still.user || null); return; }
    if (still) { show(still, prov, { open: false, press, failed: why }); return; }
    ended(`${why} ${tr('No sign-in is running — press the button to start again.')}`);
  };
  // r4 (the tidy, «cancelled» is said only when the hub runs nothing): an act that learns ITS sign-in is not the one running (a
  // Cancel that ended it or found it ended, the poll that hears it ended) reads what the hub runs for the kind and SHOWS that —
  // a sign-in another dialog started, with its Cancel — or, when nothing runs, says its end
  const adoptOrEnd = async (mine, prov, failedLine, endLine) => {
    let still = null;
    try { still = typeof live.afterFail === 'function' ? await live.afterFail() : null; } catch { still = null; }
    if (mine !== gen || closed) return;
    if (still && still.token) { finish(still.token, still.user || null); return; }
    if (still && still.flowId) { show(still, prov, { open: false, press: mine, failed: failedLine }); return; }
    ended(endLine);
  };
  // r2 (law B): the other road is a press too — it ends the earlier watch first and its answer is shown only if still the newest
  const pressed = (r, prov) => (!(live && r && r.otherRoad && typeof r.otherRoad.run === 'function') ? r : { ...r, otherRoad: { ...r.otherRoad, run: async () => {
    const press = ++gen; stopPoll(); busy(true);
    try {
      const promise = r.otherRoad.run(); inflight = { press, promise }; const x = await promise;
      if (press !== gen || closed) { strayEnd(x, prov); return { press: -1 }; }   // r4: not the latest act any more
      return x && typeof x === 'object' ? { ...x, press } : x;
    } catch (e) { if (closed) { sweepLater(); return { press: -1 }; } await afterFail(e, prov, press); return { press: -1 }; }
  } } });
  const show = (r, prov, { open = true, press = gen, failed = null } = {}) => {
    if (live && (press !== gen || closed)) return;   // r2 (law B): an older press's answer changes nothing (r4: nor one after the close)
    const _w = open ? window.open(r.url, '_blank') : true;
    drawConsentLinks(status, r, prov);
    status.textContent = tr('A {provider} sign-in page opened. Approve access, then come back here.', { provider: prov });
    if (!_w) status.textContent = tr('Popup blocked — copy the link below and open it in a browser yourself.');
    // lane gmail-connect-wall (live): WHICH road is in play, in the person's words, while they are at the vendor; a sign-in
    // this one replaced is said once; a reopened dialog says the sign-in is the one still running
    if (live && r.roadLine) status.textContent = [failed, r.superseded ? tr('The earlier sign-in was ended — this is a new one.') : null, open ? (_w ? tr('A {provider} sign-in page opened.', { provider: prov }) : tr('Popup blocked — copy the link below and open it in a browser yourself.')) : tr('The {provider} sign-in you started earlier is still waiting.', { provider: prov }), r.roadLine].filter(Boolean).join(' ');
    if (r.notice) status.textContent = r.notice;
    pasteBox?.remove();
    pasteBox = pasteBack({ r: pressed(r, prov), pasteHint, pastePlaceholder: pastePlaceholder || 'http://127.0.0.1:53682/?state=…&code=…', pasteSecret,
      onPaste: async (v) => { const at = gen; try { status.textContent = tr('Completing…'); const fr = await post(endpoints.callback, { url: v }); if (live && (at !== gen || closed)) return; if (fr.error) throw new Error(fr.error); if (fr.token) finish(fr.token, fr.user || null); } catch (e) { if (live && (at !== gen || closed)) return; status.textContent = e.message || tr('Failed'); } },
      onOtherRoad: (r2) => { if (r2 && r2.error) throw new Error(r2.error); if (live && r2 && r2.press !== undefined) { if (r2.press !== gen) return; show(r2, prov, { press: r2.press }); return; } show(r2, prov); },
      ...(live && typeof live.cancel === 'function' ? { onCancel: async () => {
        const pend = inflight && inflight.press === gen ? inflight.promise : null;   // r3: a press still in flight starts a sign-in too
        const mine = ++gen; stopPoll(); busy(true);
        // r4: a Cancel whose own request failed leaves the sign-in on screen running — its controls and its watch back
        let x = null;
        try { x = await live.cancel(shownId); } catch (e) { if (mine === gen && !closed) { busy(false); watchShown(prov); } throw e; }
        let ours = !!(x && x.cancelled);
        if (pend) { const r2 = await pend.catch(() => null); if (r2 && r2.flowId && r2.flowId !== shownId) { try { const y = await live.cancel(r2.flowId); if (y && y.cancelled) ours = true; } catch { /* it ended either way */ } } }
        if (mine !== gen || closed) return;   // r4 (THE LAW): a newer act draws its own state — «cancelled» is never said over it
        await adoptOrEnd(mine, prov, ours ? tr('The sign-in was cancelled.') : tr('The sign-in this dialog showed had already ended.'), tr('The sign-in was cancelled. Press the button to start again.'));
      } } : {}) });
    if (live) { shownId = r.flowId || null; wrap.dataset.flow = shownId || ''; status.after(pasteBox); btn.textContent = live.again || label; btn.disabled = false; if (typeof live.onFlow === 'function') live.onFlow(r); }
    else wrap.appendChild(pasteBox);
    watchShown(prov);
  };
  // the watch of the sign-in on screen (its 1.5 s poll), owned by the act that drew it
  function watchShown(prov) {
    stopPoll();
    const mine = gen;
    const watching = shownId;   // r3: the poll asks about the sign-in ON SCREEN, never «the latest answer's»
    poll = setInterval(async () => { try { const st = await (live && typeof endpoints.status === 'function' ? endpoints.status(watching) : get(endpoints.status)); if (live && (mine !== gen || closed)) return; if (st.token) finish(st.token, st.user || null); else if (st.error) { if (live) { stopPoll(); adoptOrEnd(mine, prov, st.error, `${st.error} ${tr('No sign-in is running — press the button to start again.')}`); } else { stopPoll(); status.textContent = st.error; btn.disabled = false; } } else if (!st.running) { stopPoll(); btn.disabled = false; } } catch {} }, 1500);
  }
  btn.onclick = async () => {
    if (live && closed) return;
    const press = live ? ++gen : gen;   // r2 (law B): this press is the one followed; the earlier watch ends now
    if (live) { stopPoll(); busy(true); }
    btn.disabled = true; status.textContent = tr('Preparing authorization…');
    let prov = provider || '';
    try {
      const body = { backend: typeof backend === 'function' ? backend() : backend };
      if (clientIdKey && ctx.inputs[clientIdKey]?.value) { body.clientId = ctx.inputs[clientIdKey].value; body.clientSecret = ctx.inputs[clientSecretKey]?.value || ''; }
      if (extra) Object.assign(body, extra() || {});
      prov = provider || signins[body.backend] || body.backend;
      const promise = post(endpoints.start, body);
      if (live) inflight = { press, promise };
      const r = await promise;
      if (live && (press !== gen || closed)) { if (r && !r.error) strayEnd(r, prov); return; }   // r4 (THE LAW): not the latest act any more
      if (r.error) throw new Error(r.error);
      show(r, prov, live ? { press } : {});
    } catch (e) {
      if (live) { if (closed) { sweepLater(); return; } await afterFail(e, prov, press); return; }   // r4: a press that failed after the close — what it may have started is swept
      status.textContent = e.message || tr('Failed to start authorization'); btn.disabled = false;
    }
  };
  // lane gmail-connect-wall (live): a sign-in that comes back by itself and is still running when the dialog opens is SHOWN
  // (state B), never started a second time; one that already landed is the connected line
  if (live && typeof live.attach === 'function') {
    const at = gen;   // r4 (THE LAW): the attach is the block's first act — a press or a close meanwhile is newer
    Promise.resolve().then(() => live.attach()).then((r) => {
      if (!r || tokenInput.value || poll || at !== gen || closed) return;
      if (r.token) { finish(r.token, r.user || null); return; }
      show(r, provider || signins[typeof backend === 'function' ? backend() : backend] || '', { open: false, press: gen });
    }).catch(() => { /* nothing to show */ });
  }
  // r4 (THE LAW: closing the dialog is an act): the caller's close hook — every later answer of this block draws nothing, opens
  // no page, registers nothing; what a press in flight started is ended by strayEnd when it lands (R5's rule for its road)
  return { close: () => { if (closed) return; closed = true; ++gen; stopPoll(); sweepLater(); } };
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
export function reauthDialog({ id = 'mount-reauth-dialog', key = null, title, hint: hintText, signinLabel, provider, fields = null, start, status: statusOf, callback, finish: apply, cancel = null, askFirst = null, onClose = null, savingText = null, live = false, pasteHint = null, pasteSecret = false, pastePlaceholder = 'http://127.0.0.1:53682/?state=…&code=…' }) {
  // lane lark-refresh-stall r2 (the dialog-yield seam): Escape on a sign-in that is RUNNING asks «Cancel the sign-in?» (the
  // caller's `askFirst` — the decision dialog) before it ends it, and cancels the consent when told yes — nothing running, or
  // no `askFirst` handed in: the shell's own door
  const escapeAsk = () => {
    if (!poll || typeof askFirst !== 'function') return true;
    (async () => {
      if (!(await askFirst({ title: tr('Cancel the sign-in?'), message: tr('The sign-in for “{name}” is still running. Cancel it?', { name: provider || title }), danger: true }))) return;
      stopPoll();
      if (typeof cancel === 'function') { try { await cancel(); } catch { /* the consent machine ends it at its own time */ } }
      close();
    })();
    return false;
  };
  // r3 (acceptance r2, the listener-lifecycle law): every close — ✕, the backdrop, Escape, the dialog's own finish — stops the
  // poll and hands the caller's `onClose` its teardown (a running sign-in's watcher listens to the socket until it is told).
  // r4 (acceptance r3, the dialog-yield seam): `poll` / `stopPoll` are declared BEFORE the shell that is handed `closed` — a
  // shell that runs it early (a raised form's end) never meets an uninitialised const
  let pasteBox = null, poll = null, shown = null;
  // lane gmail-connect-wall (live): a press that opened the sign-in again outdates the earlier press's end timer. r4
  // (acceptance r3, THE LAW: after any await a handler draws and keeps nothing unless it is still the latest act — and closing
  // the dialog is an act): `gen` is every act's number (a press, the other road, Cancel, the close), `isClosed` the close,
  // `inflight` the press whose start has not answered (Cancel ends what it starts) — declared before the shell, whose close
  // may run early
  let gen = 0, isClosed = false, inflight = null;
  const stopPoll = () => { clearInterval(poll); poll = null; };
  // lane gmail-connect-wall (live, R5): closing ends ONLY a sign-in that cannot finish without this dialog (a loopback from
  // another computer — its paste box is here), said once; a sign-in that comes back by itself keeps running. r4: by its id
  // (`cancel(flowId)`) — a later sign-in of the account is never ended by this dialog's close
  const closed = () => {
    const running = !!poll;
    stopPoll();
    if (live) { isClosed = true; ++gen; }
    if (live && running && shown && shown.needsDialog && typeof cancel === 'function') { Promise.resolve().then(() => cancel(shown.flowId)).then(() => showToast(tr('The {provider} sign-in was ended: it needed this dialog to finish.', { provider: provider || title }))).catch(() => {}); }
    if (typeof onClose === 'function') { try { onClose(); } catch { /* the dialog is gone either way */ } }
  };
  // not the subject: fields — the caller's key names them (the mount / the account its OAuth-client select belongs to)
  // not the subject: start — the caller's sign-in call; the consent link it answers is this form's work after a press (the caller's key names whom it signs in)
  const { body, close, raised, overlay } = createModalShell({ id, key, title, bodyClass: 'mounts-dialog-body', kind: 'form', onClose: closed, escapeToClose: true, onEscape: () => escapeAsk() });   // key = the mount / the account re-authorized (lane dialog-yield r3); kind 'form' + lark-refresh-stall's onClose / Escape-asks (int361: 主开发's option order)
  if (raised) return overlay._reauth || null;   // raised: this sign-in, as it was
  const hint = document.createElement('div');
  hint.className = 'mounts-field-hint';
  hint.textContent = hintText;
  const btn = document.createElement('button');
  btn.className = 'mounts-btn mounts-btn-primary';
  btn.textContent = signinLabel;
  const status = document.createElement('div');
  status.className = 'mounts-field-hint';
  if (live) { status.classList.add('mounts-oauth-live-block'); btn.classList.add('mounts-oauth-live-btn'); }   // lane gmail-connect-wall r2: wrap + the phone rule
  let form = null;
  if (fields && fields.length) { body.append(hint); form = renderFields(body, fields); body.append(btn, status); }
  else body.append(hint, btn, status);
  const finish = async (token) => {
    stopPoll();
    status.textContent = savingText || tr('Saving token & reconnecting…');
    try {
      await apply(token, { close, status });
    } catch (e) { status.textContent = e.message || 'Failed'; btn.disabled = false; }
  };
  // r4 (the smaller point): while a press or a Cancel runs, BOTH press controls are busy — one act at a time (the account's
  // sign-ins are ended by id, but one at a time keeps the account's single running sign-in the one on screen)
  const gone = () => !status.isConnected || (live && isClosed);
  const busy = (on) => { if (!live) return; btn.disabled = !!on; const o = pasteBox && pasteBox.querySelector('.mounts-oauth-other'); if (o) o.disabled = !!on; };
  // the watch of a press's sign-in: the 1.5 s poll and the ten-minute end, both belonging to that press
  const watch = (press) => {
    stopPoll();   // lane gmail-connect-wall (live): a press that opened the sign-in again keeps ONE watch
    poll = setInterval(async () => {
      if (!status.isConnected) { stopPoll(); return; } // dialog closed
      try {
        const st = await statusOf();
        if (live && (press !== gen || isClosed)) return;   // r2 (law B): an older press's answer changes nothing
        if (st.token) finish(st.token);
        else if (st.fail) { stopPoll(); status.textContent = st.fail; btn.disabled = false; if (live) { shown = null; btn.textContent = signinLabel; pasteBox?.remove(); pasteBox = null; } }
      } catch {}
    }, 1500);
    // client-from-mount verify r5: the consent machine ends a sign-in 10 min after it began and SAYS so on the record
    // (the watcher's `fail`), but this stop used to fire at the same instant and only clear the interval — the last
    // 1.5 s tick had run before the frame landed, so the dialog kept "A … sign-in page opened" and a disabled button
    // for ever. The stop now waits past the machine's own end, reads the watcher once more, and says what it found.
    setTimeout(async () => {
      if (press !== gen) return;
      stopPoll();
      if (!status.isConnected || (!btn.disabled && !live)) return;
      let st = {}; try { st = await statusOf(); } catch {}
      if (press !== gen || gone()) return;
      if (st.token) return finish(st.token);
      status.textContent = st.fail || tr('The sign-in was not finished in time — sign in again');
      btn.disabled = false;
    }, 10 * 60 * 1000 + 5000);
  };
  // r4: the other road is a press too — it ends the earlier watch, is busy like the button, and its answer is shown only while
  // it is the latest act; one that lands after the close ends the sign-in it started (no page opens for it)
  const pressedRe = (x) => (!(live && x && x.otherRoad && typeof x.otherRoad.run === 'function') ? x : { ...x, otherRoad: { ...x.otherRoad, run: async () => {
    const p = ++gen; stopPoll(); busy(true);
    try {
      const promise = x.otherRoad.run(); inflight = { press: p, promise }; const y = await promise;
      if (gone()) { if (typeof cancel === 'function' && y && y.flowId) { try { await cancel(y.flowId); } catch { /* it ends at its own time */ } } return { press: -1 }; }
      if (p !== gen) return { press: -1 };   // Cancel (the newer act) ends what this press started
      return y && typeof y === 'object' ? { ...y, press: p } : y;
    } catch (e) { if (p !== gen || gone()) return { press: -1 }; btn.disabled = false; if (shown) watch(p); throw e; }   // the sign-in on screen still runs: its watch back
  } } });
  btn.onclick = async () => {
    if (live && isClosed) return;
    const press = ++gen;
    btn.disabled = true;
    if (live) busy(true);
    status.textContent = tr('Preparing authorization…');
    try {
      const promise = start(form ? form.readValues() : {});
      if (live) inflight = { press, promise };
      const r = await promise;
      // r4 (acceptance r3): closed while «Preparing authorization…» — no consent page and no poll for a dialog that is gone; the
      // consent it started has no page to finish on, so it is cancelled (as Escape's «yes» cancels one) — by its id (live)
      if (gone()) { if (typeof cancel === 'function') { try { await cancel(live && r ? r.flowId : undefined); } catch { /* the consent machine ends it at its own time */ } } return; }
      if (live && press !== gen) return;   // r4 (THE LAW): Cancel (the newer act) ends what this press started
      if (r.error) throw new Error(r.error);
      // lane pod-oauth-callback: the other road re-shows the block for the consent it started (the folded paste-back)
      const show = (x) => {
        const _w = window.open(x.url, '_blank');
        drawConsentLinks(status, x, provider);
        status.textContent = tr('A {provider} sign-in page opened. Approve access, then come back here.', { provider });
        if (!_w) status.textContent = tr('Popup blocked — copy the link below and open it in a browser yourself.');
        // lane gmail-connect-wall (live): which road, in the person's words; the button opens the sign-in AGAIN (the account's
        // earlier one is replaced); Cancel is a visible button
        if (live && x.roadLine) status.textContent = [_w ? tr('A {provider} sign-in page opened.', { provider }) : tr('Popup blocked — copy the link below and open it in a browser yourself.'), x.roadLine].join(' ');
        if (x.notice) status.textContent = x.notice;
        pasteBox?.remove();
        pasteBox = pasteBack({ r: pressedRe(x), pasteHint, pastePlaceholder, pasteSecret,
          onPaste: async (v) => { const at = gen; try { status.textContent = tr('Completing…'); const fr = await callback(v); if (live && (at !== gen || isClosed)) return; finish(fr.token); } catch (e) { if (live && (at !== gen || isClosed)) return; status.textContent = e.message || tr('Failed'); } },
          onOtherRoad: (x2) => { if (x2 && x2.error) throw new Error(x2.error); if (live && x2 && x2.press !== undefined) { if (x2.press !== gen || gone()) return; show(x2); watch(x2.press); return; } show(x2); },
          ...(live && typeof cancel === 'function' ? { onCancel: async () => {
            // r4 (THE LAW): Cancel ends the sign-in on screen AND what a press in flight starts (each by its id), and says
            // «cancelled» only while it is still the latest act
            const pend = inflight && inflight.press === gen ? inflight.promise : null;
            const mine = ++gen; stopPoll(); busy(true);
            const sid = shown && shown.flowId;
            try { await cancel(sid); } catch (e) { if (mine === gen && !gone()) { busy(false); watch(mine); } throw e; }   // a failed Cancel: the sign-in on screen still runs
            if (pend) { const y = await pend.catch(() => null); if (y && y.flowId && y.flowId !== sid) { try { await cancel(y.flowId); } catch { /* it ended either way */ } } }
            if (mine !== gen || gone()) return;
            shown = null; pasteBox?.remove(); pasteBox = null; body.querySelectorAll('.mounts-oauth-link, .mounts-oauth-narrow').forEach((e) => e.remove()); status.textContent = tr('The sign-in was cancelled. Press the button to start again.'); btn.textContent = signinLabel; btn.disabled = false;
          } } : {}) });
        if (live) { shown = x; status.after(pasteBox); btn.textContent = tr('Open the {provider} sign-in again', { provider }); btn.disabled = false; }
        else body.appendChild(pasteBox);
      };
      show(r);
      watch(press);
    } catch (e) {
      if (live && (press !== gen || gone())) return;
      status.textContent = e.message || tr('Failed to start authorization');
      btn.disabled = false;
      if (live) busy(false);   // r4 (the tidy): every exit of a press ends its busy for every control it took (the other road too)
      if (live && shown) watch(press);   // r4: a refused press leaves the sign-in on screen running — its watch back
    }
  };
  const ctx = { close, body, inputs: form ? form.inputs : {}, button: btn, status };
  overlay._reauth = ctx;
  return ctx;
}
