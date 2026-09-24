// THE PRE-EXTRACTION BASELINE of the mounts dialog component (D1 of
// docs/design-integrations-per-account.zh.md §6): the four blocks that
// src/lib/mounts-dialog.js now owns (chunk 3 added a fifth: the
// storage re-authorize dialog, now `reauthDialog`), copied BYTE FOR BYTE out of
// src/lib/sidebar-mounts.js at 348aa226 (2.369.160) — each between a
// `// BEGIN verbatim <name>` / `// END verbatim <name>` pair so
// scripts/test-mounts-dialog-extract.mjs can prove the copy against the git
// object whenever the history is present (SKIP with evidence on a shallow
// clone). The suite renders the REAL mount dialogs through these blocks and
// through the shared module, and compares the two screenshots pixel-wise.
// Never imported by product code.
import { createModalShell, showToast, copyText, escHtml } from '../../../src/lib/utils.js';
import { setupDirAutocomplete } from '../../../src/lib/autocomplete.js';
import { t as tr } from '../../../src/lib/i18n.js';

// BEGIN verbatim oauthLinkRow
function oauthLinkRow(url) {
  const row = document.createElement('div');
  row.className = 'mounts-oauth-link';
  const hint = document.createElement('div');
  hint.className = 'mounts-field-hint';
  hint.textContent = tr('Account signed in on ANOTHER browser? Copy this link and open it there:');
  const line = document.createElement('div');
  line.style.cssText = 'display:flex;gap:4px;align-items:center;margin:2px 0;';
  const inp = document.createElement('input');
  inp.readOnly = true; inp.value = url; inp.style.flex = '1'; inp.style.minWidth = '0';
  inp.onfocus = () => inp.select();
  const cp = document.createElement('button');
  cp.type = 'button'; cp.className = 'mounts-btn'; cp.textContent = tr('Copy');
  cp.onclick = () => copyText(url).then(() => showToast(tr('Copied')));
  line.append(inp, cp);
  row.append(hint, line);
  return row;
}
// END verbatim oauthLinkRow

// BEGIN verbatim api
async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const d = await res.json().catch(() => ({}));
  // carry the server's machine-readable `code` (the key-import flow maps it to
  // localized text — a bare message string can't be translated)
  if (!res.ok || d.error) { const e = new Error(d.error || `HTTP ${res.status}`); e.code = d.code; throw e; }
  return d;
}
// END verbatim api

// Installs the baseline methods over a Sidebar prototype that already
// carries the REAL mixin, so every caller (_showAddMountDialog, …) is the
// same code in both renders and only the extracted blocks differ.
export function installBaseline(Sidebar) {
  Object.assign(Sidebar.prototype, {
// BEGIN verbatim _mountsDialog
    _mountsDialog(title, fields, submitLabel, onSubmit, opts = {}) {
      const { body, close } = createModalShell({ id: 'mounts-dialog-overlay', title, onClose: opts.onClose });
      const inputs = {};
      const rows = []; // {field, label, el} for conditional visibility
      let advBody = null;
      const readValues = () => Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
      for (const f of fields) {
        const label = document.createElement('label');
        label.textContent = f.label;
        let el;
        if (f.type === 'select') {
          el = document.createElement('select');
          for (const [v, l] of f.options) { const o = document.createElement('option'); o.value = v; o.textContent = l; el.appendChild(o); }
          if (f.value) el.value = f.value;
        } else if (f.type === 'textarea') {
          el = document.createElement('textarea');
          el.placeholder = f.placeholder || '';
          el.style.minHeight = '72px'; el.style.fontSize = '12px';
          if (f.value) el.value = f.value;
        } else {
          el = document.createElement('input');
          el.type = f.type || 'text';
          el.placeholder = f.placeholder || '';
          if (f.value) el.value = f.value;
        }
        inputs[f.key] = el;
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
        dest.append(label, rowRec.el);
        if (f.hint) {
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
        for (const { field, label, el, hintEl } of rows) {
          const show = !field.when || field.when(vals);
          label.style.display = show ? '' : 'none';
          el.style.display = show ? '' : 'none';
          if (hintEl) hintEl.style.display = show ? '' : 'none';
        }
      };
      if (fields.some(f => f.when)) {
        for (const { el } of rows) { el.addEventListener('change', applyConds); el.addEventListener('input', applyConds); }
        applyConds();
      }
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
      const ctx = { close, inputs, body, applyConds: fields.some(f => f.when) ? applyConds : () => {} };
      this._lastMountsDialog = ctx;
      return ctx;
    },
// END verbatim _mountsDialog

// BEGIN verbatim _wireOAuthConnect
    _wireOAuthConnect(ctx, { tokenKey, backend, label, clientIdKey, clientSecretKey }) {
      const PROVIDER_LABELS = { onedrive: 'Microsoft', drive: 'Google', dropbox: 'Dropbox', box: 'Box', pcloud: 'pCloud', yandex: 'Yandex', jottacloud: 'Jottacloud', hidrive: 'HiDrive' };
      const tokenInput = ctx.inputs[tokenKey];
      if (!tokenInput) return;
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
      const finish = (token) => { stopPoll(); tokenInput.value = token; status.textContent = tr('✓ Connected — finish with the “Connect” button below.'); btn.textContent = tr('Reconnect'); btn.disabled = false; pasteBox?.remove(); pasteBox = null; };
      btn.onclick = async () => {
        btn.disabled = true; status.textContent = tr('Preparing authorization…');
        try {
          const body = { backend: typeof backend === 'function' ? backend() : backend };
          if (clientIdKey && ctx.inputs[clientIdKey]?.value) { body.clientId = ctx.inputs[clientIdKey].value; body.clientSecret = ctx.inputs[clientSecretKey]?.value || ''; }
          const r = await api('/api/mounts/gdrive-auth/start', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
          if (r.error) throw new Error(r.error);
          const _w = window.open(r.url, '_blank');
          status.parentElement?.querySelectorAll('.mounts-oauth-link').forEach((e) => e.remove());
          status.after(oauthLinkRow(r.url));
          status.textContent = tr('A {provider} sign-in page opened. Approve access, then come back here.', { provider: PROVIDER_LABELS[body.backend] || body.backend });
          if (!_w) status.textContent = tr('Popup blocked — copy the link below and open it in a browser yourself.');
          if (!pasteBox) {
            pasteBox = document.createElement('div');
            pasteBox.innerHTML = `<div class="mounts-field-hint">${escHtml(tr("If the final page fails to load (address starts with 127.0.0.1 — VibeSpace runs on another machine, or you authorized in a different browser), copy that address and paste it here:"))}</div>`;
            const inp = document.createElement('input'); inp.placeholder = 'http://127.0.0.1:53682/?state=…&code=…';
            inp.onchange = async () => { try { status.textContent = tr('Completing…'); const fr = await api('/api/mounts/gdrive-auth/callback', { method: 'POST', body: JSON.stringify({ url: inp.value }), headers: { 'Content-Type': 'application/json' } }); if (fr.error) throw new Error(fr.error); if (fr.token) finish(fr.token); } catch (e) { status.textContent = e.message || tr('Failed'); } };
            pasteBox.appendChild(inp); wrap.appendChild(pasteBox);
          }
          poll = setInterval(async () => { try { const st = await api('/api/mounts/gdrive-auth/status'); if (st.token) finish(st.token); else if (st.error) { stopPoll(); status.textContent = st.error; btn.disabled = false; } else if (!st.running) { stopPoll(); btn.disabled = false; } } catch {} }, 1500);
        } catch (e) { status.textContent = e.message || tr('Failed to start authorization'); btn.disabled = false; }
      };
    },
// END verbatim _wireOAuthConnect
// BEGIN verbatim _showDriveReauthDialog
    _showDriveReauthDialog(m) {
      const prov = this._oauthProviderNames(m);
      const { body, close } = createModalShell({ id: 'mount-reauth-dialog', title: tr('Re-authorize "{name}"', { name: m.name }), bodyClass: 'mounts-dialog-body', escapeToClose: true });
      const hint = document.createElement('div');
      hint.className = 'mounts-field-hint';
      hint.textContent = tr('{provider} reported the saved sign-in as expired or revoked. Sign in again to mint a fresh token — nothing else about the mount changes.', { provider: prov.signin });
      const btn = document.createElement('button');
      btn.className = 'mounts-btn mounts-btn-primary';
      btn.textContent = tr('Sign in with {provider}', { provider: prov.signin });
      const status = document.createElement('div');
      status.className = 'mounts-field-hint';
      body.append(hint, btn, status);
      let pasteBox = null, poll = null;
      const stopPoll = () => { clearInterval(poll); poll = null; };
      const finish = async (token) => {
        stopPoll();
        status.textContent = tr('Saving token & reconnecting…');
        try {
          await api(`/api/mounts/${m.id}/drive-token`, { method: 'POST', body: JSON.stringify({ token }) });
          showToast(tr('{provider} re-authorized', { provider: prov.product }));
          close(); this._renderMounts();
        } catch (e) { status.textContent = e.message || 'Failed'; btn.disabled = false; }
      };
      btn.onclick = async () => {
        btn.disabled = true;
        status.textContent = tr('Preparing authorization…');
        try {
          const r = await api('/api/mounts/gdrive-auth/start', { method: 'POST', body: JSON.stringify({ mountId: m.id }) });
          if (r.error) throw new Error(r.error);
          const _w = window.open(r.url, '_blank');
          status.parentElement?.querySelectorAll('.mounts-oauth-link').forEach((e) => e.remove());
          status.after(oauthLinkRow(r.url));
          status.textContent = tr('A {provider} sign-in page opened. Approve access, then come back here.', { provider: prov.signin });
          if (!_w) status.textContent = tr('Popup blocked — copy the link below and open it in a browser yourself.');
          if (!pasteBox) {
            pasteBox = document.createElement('div');
            pasteBox.innerHTML = `<div class="mounts-field-hint">${escHtml(tr("If the final page fails to load (address starts with 127.0.0.1 — VibeSpace runs on another machine, or you authorized in a different browser), copy that address and paste it here:"))}</div>`;
            const inp = document.createElement('input');
            inp.placeholder = 'http://127.0.0.1:53682/?state=…&code=…';
            inp.onchange = async () => {
              try {
                status.textContent = tr('Completing…');
                const fr = await api('/api/mounts/gdrive-auth/callback', { method: 'POST', body: JSON.stringify({ url: inp.value }) });
                finish(fr.token);
              } catch (e) { status.textContent = e.message || tr('Failed'); }
            };
            pasteBox.appendChild(inp);
            body.appendChild(pasteBox);
          }
          poll = setInterval(async () => {
            if (!status.isConnected) { stopPoll(); return; } // dialog closed
            try {
              const st = await api('/api/mounts/gdrive-auth/status');
              if (st.token) finish(st.token);
            } catch {}
          }, 1500);
          setTimeout(stopPoll, 10 * 60 * 1000);
        } catch (e) {
          status.textContent = e.message || tr('Failed to start authorization');
          btn.disabled = false;
        }
      };
    },
// END verbatim _showDriveReauthDialog
  });
}
