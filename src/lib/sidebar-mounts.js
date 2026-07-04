// Sidebar "Mounts" tab — rclone S3 mounts + share minting (collaboration P1).
// Third tab next to Folders | Groups: my-storage card (env-provisioned),
// mount list with live status, share-a-folder minting, import-a-link.
import { showToast, showConfirmDialog, copyText, escHtml } from './utils.js';

// 16x16 stroke icons (project convention — no emoji in chrome)
const MI = {
  folder: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h4l2 2h6v8H2V3z"/></svg>',
  eject: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l5-5 5 5H3z"/><path d="M3 12h10"/></svg>',
  plug: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v7M4.5 6l3.5 3.5L11.5 6"/><path d="M3 13h10"/></svg>',
  cross: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  importL: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M5 7l3 3 3-3M3 10v3h10v-3"/></svg>',
  link: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5l3-3M5 8L3.5 9.5a2.5 2.5 0 003.5 3.5L8.5 11.5M8 5l1.5-1.5a2.5 2.5 0 013.5 3.5L11.5 8.5"/></svg>',
  plus: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
};

// fetch wrapper that THROWS on HTTP/{error} responses (utils fetchJson swallows)
async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.error) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
}

export function installSidebarMounts(Sidebar) {
  Object.assign(Sidebar.prototype, {

    _initMountsSync() {
      if (this._mountsSyncInit) return;
      this._mountsSyncInit = true;
      this.app.ws.onGlobal((msg) => {
        if (msg.type === 'mounts-updated' && this._activeTab === 'mounts') this._renderMounts();
      });
    },

    async _renderMounts() {
      this._initMountsSync();
      this.listEl.innerHTML = '<div class="mounts-loading">Loading…</div>';
      let d;
      try { d = await api('/api/mounts'); }
      catch { this.listEl.innerHTML = '<div class="mounts-loading">Failed to load mounts</div>'; return; }
      if (this._activeTab !== 'mounts') return; // user switched away mid-fetch
      this._mountsData = d;
      this.listEl.innerHTML = '';
      const root = document.createElement('div');
      root.className = 'mounts-panel';

      // My storage (env-provisioned company bucket)
      if (d.env) {
        const card = document.createElement('div');
        card.className = 'mounts-env-card';
        card.innerHTML = `<div class="mounts-env-head"><b>My storage</b><span>${escHtml(d.env.bucket)}${d.env.prefix ? '/' + escHtml(d.env.prefix) : ''}</span></div>`;
        if (!d.env.configured) {
          const btn = document.createElement('button');
          btn.className = 'mounts-btn mounts-btn-primary';
          btn.textContent = 'Add & mount';
          btn.onclick = async () => {
            btn.disabled = true;
            try {
              const r = await api('/api/mounts/my-storage', { method: 'POST' });
              await fetch(`/api/mounts/${r.id}/mount`, { method: 'POST' });
            } catch (e) { showToast(e.message || 'Failed', { type: 'error' }); }
            this._renderMounts();
          };
          card.appendChild(btn);
        }
        root.appendChild(card);
      }

      // Mounts list
      if (d.mounts.length) {
        const head = document.createElement('div');
        head.className = 'mounts-sec-head';
        head.textContent = 'Mounts';
        root.appendChild(head);
      }
      const list = document.createElement('div');
      list.className = 'mounts-list';
      if (!d.mounts.length) {
        list.innerHTML = `<div class="mounts-empty">No mounts yet.${d.env ? '' : ' Set VIBESPACE_S3_* to enable company storage, or import a share link.'}</div>`;
      }
      for (const m of d.mounts) list.appendChild(this._buildMountRow(m));
      root.appendChild(list);

      // Shares I minted
      if (d.shares.length) {
        const sh = document.createElement('div');
        sh.className = 'mounts-shares';
        sh.innerHTML = '<div class="mounts-sec-head">Shares I created</div>';
        for (const s of d.shares) {
          const row = document.createElement('div');
          row.className = 'mounts-share-row';
          const exp = s.expiresAt ? ` · expires ${new Date(s.expiresAt).toLocaleDateString()}` : '';
          row.innerHTML = `<span class="mounts-share-text"><b>${escHtml(s.name)}</b><span>${escHtml(s.prefix || s.bucket)} · ${s.mode.toUpperCase()} · ${s.method === 'sts' ? 'temporary' : 'revocable'}${exp}</span></span>`;
          const rm = document.createElement('button');
          rm.className = 'mounts-btn mounts-btn-danger';
          rm.textContent = 'Revoke';
          rm.onclick = async () => {
            const ok = await showConfirmDialog({ title: 'Revoke share?', message: `Everyone who imported "${s.name}" loses access immediately.`, confirmText: 'Revoke', danger: true });
            if (!ok) return;
            try { await api(`/api/mounts/shares/${s.id}`, { method: 'DELETE' }); showToast('Share revoked'); }
            catch (e) { showToast(e.message || 'Failed', { type: 'error' }); }
            this._renderMounts();
          };
          row.appendChild(rm);
          sh.appendChild(row);
        }
        root.appendChild(sh);
      }

      // Footer actions — stacked, icon + label, equal width
      const foot = document.createElement('div');
      foot.className = 'mounts-foot';
      const action = (svg, label, fn, opts = {}) => {
        const b = document.createElement('button');
        b.className = 'mounts-action';
        b.innerHTML = `<span class="mounts-action-icon">${svg}</span><span>${escHtml(label)}</span>`;
        b.disabled = !!opts.disabled;
        if (opts.title) b.title = opts.title;
        b.onclick = fn;
        return b;
      };
      foot.append(
        action(MI.importL, 'Import share link', () => this._showImportShareDialog()),
        action(MI.link, 'Share a folder', () => this._showMintShareDialog(d), {
          disabled: !d.env,
          title: d.env ? 'Mint a down-scoped credential for a folder under your prefix' : 'Requires company storage (VIBESPACE_S3_*)',
        }),
        action(MI.plus, 'Add S3 mount', () => this._showAddMountDialog()),
      );
      root.appendChild(foot);
      const note = document.createElement('div');
      note.className = 'mounts-note';
      note.textContent = d.mcAvailable
        ? `Mounts live under ${d.mountBase}. Shares are permanent service accounts (revocable).`
        : `Mounts live under ${d.mountBase}. Shares are temporary STS credentials (max 7 days) — install mc for permanent ones.`;
      root.appendChild(note);
      this.listEl.appendChild(root);
    },

    _buildMountRow(m) {
      const row = document.createElement('div');
      row.className = 'mounts-row';
      const dot = m.mounted ? 'ok' : (m.error ? 'err' : 'off');
      const expired = m.expiresAt && Date.now() > m.expiresAt;
      const top = document.createElement('div');
      top.className = 'mounts-row-top';
      top.innerHTML = `
        <span class="mounts-dot mounts-dot-${dot}" title="${m.mounted ? 'Mounted' : escHtml(m.error || 'Not mounted')}"></span>
        <b class="mounts-name" title="${escHtml(m.name)}">${escHtml(m.name)}</b>
        ${m.mode === 'ro' ? '<span class="mounts-badge">RO</span>' : ''}
        ${expired ? '<span class="mounts-badge mounts-badge-red">EXPIRED</span>' : ''}`;
      const actions = document.createElement('span');
      actions.className = 'mounts-row-actions';
      const ibtn = (svg, title, fn, cls = '') => {
        const b = document.createElement('button');
        b.className = 'mounts-icon-btn ' + cls;
        b.innerHTML = svg;
        b.title = title;
        b.onclick = async (e) => {
          e.stopPropagation(); b.disabled = true;
          try { await fn(); } catch (err) { showToast(err.message || 'Failed', { type: 'error' }); }
          this._renderMounts();
        };
        return b;
      };
      if (m.mounted) {
        actions.append(
          ibtn(MI.folder, 'Browse in file explorer', () => { this.app.openFileExplorer(m.path); }),
          ibtn(MI.eject, 'Unmount', () => api(`/api/mounts/${m.id}/unmount`, { method: 'POST' })),
        );
      } else {
        actions.append(ibtn(MI.plug, 'Mount', async () => {
          const r = await api(`/api/mounts/${m.id}/mount`, { method: 'POST' });
          if (!r.success) throw new Error('Mount failed — hover the status dot for details');
        }, 'mounts-icon-accent'));
      }
      actions.append(ibtn(MI.cross, 'Remove mount (nothing is deleted remotely)', async () => {
        const ok = await showConfirmDialog({ title: `Remove "${m.name}"?`, message: 'The mount record and local mountpoint go away. Nothing is deleted remotely.', confirmText: 'Remove', danger: true });
        if (ok) await api(`/api/mounts/${m.id}`, { method: 'DELETE' });
      }, 'mounts-icon-danger'));
      top.appendChild(actions);
      const pathEl = document.createElement('div');
      pathEl.className = 'mounts-path';
      pathEl.title = `${m.endpoint}/${m.bucket}${m.prefix ? '/' + m.prefix : ''} → ${m.path}`;
      pathEl.textContent = m.path;
      row.append(top, pathEl);
      if (m.error) {
        const err = document.createElement('div');
        err.className = 'mounts-errline';
        err.textContent = m.error.slice(0, 110);
        row.appendChild(err);
      }
      return row;
    },

    _mountsDialog(title, fields, submitLabel, onSubmit) {
      document.getElementById('mounts-dialog-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'mounts-dialog-overlay';
      overlay.className = 'dialog-overlay';
      overlay.style.zIndex = '99998';
      const dialog = document.createElement('div');
      dialog.className = 'dialog';
      dialog.innerHTML = `<div class="dialog-header"><h3>${escHtml(title)}</h3><button class="dialog-close">✕</button></div>`;
      const body = document.createElement('div');
      body.className = 'dialog-body';
      const inputs = {};
      for (const f of fields) {
        const label = document.createElement('label');
        label.textContent = f.label;
        let el;
        if (f.type === 'select') {
          el = document.createElement('select');
          for (const [v, l] of f.options) { const o = document.createElement('option'); o.value = v; o.textContent = l; el.appendChild(o); }
          if (f.value) el.value = f.value;
        } else {
          el = document.createElement('input');
          el.type = f.type || 'text';
          el.placeholder = f.placeholder || '';
          if (f.value) el.value = f.value;
        }
        inputs[f.key] = el;
        body.append(label, el);
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
      dialog.appendChild(body);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      dialog.querySelector('.dialog-close').onclick = close;
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
      submit.onclick = async () => {
        err.textContent = '';
        submit.disabled = true;
        try {
          const vals = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value.trim()]));
          await onSubmit(vals, { close, body, err });
        } catch (e) { err.textContent = e.message || 'Failed'; submit.disabled = false; }
      };
      return { close };
    },

    _showImportShareDialog() {
      this._mountsDialog('Import share link', [
        { key: 'link', label: 'Share link', placeholder: 'vibespace-share:v1:…' },
        { key: 'name', label: 'Mount name (optional)', placeholder: 'team-dataset' },
      ], 'Import & mount', async (v, { close }) => {
        if (!v.link) throw new Error('Paste the share link');
        const r = await api('/api/mounts/import', { method: 'POST', body: JSON.stringify({ link: v.link, name: v.name || undefined }), headers: { 'Content-Type': 'application/json' } });
        await fetch(`/api/mounts/${r.id}/mount`, { method: 'POST' });
        close(); showToast('Share imported'); this._renderMounts();
      });
    },

    _showAddMountDialog() {
      this._mountsDialog('Add S3 mount', [
        { key: 'name', label: 'Name', placeholder: 'my-bucket' },
        { key: 'endpoint', label: 'Endpoint', placeholder: 'https://s3.company.internal' },
        { key: 'bucket', label: 'Bucket', placeholder: 'company-workspace' },
        { key: 'prefix', label: 'Prefix (optional)', placeholder: 'users/alice' },
        { key: 'accessKey', label: 'Access key' },
        { key: 'secretKey', label: 'Secret key', type: 'password' },
        { key: 'mode', label: 'Mode', type: 'select', options: [['rw', 'Read-write'], ['ro', 'Read-only']] },
        { key: 'customPath', label: 'Custom mount path (optional, absolute)', placeholder: '' },
      ], 'Add & mount', async (v, { close }) => {
        const r = await api('/api/mounts', { method: 'POST', body: JSON.stringify(v), headers: { 'Content-Type': 'application/json' } });
        await fetch(`/api/mounts/${r.id}/mount`, { method: 'POST' });
        close(); showToast('Mount added'); this._renderMounts();
      });
    },

    _showMintShareDialog(d) {
      this._mountsDialog('Share a folder', [
        { key: 'name', label: 'Share name', placeholder: 'dataset-v2' },
        { key: 'folder', label: `Folder under ${d.env.bucket}/${d.env.prefix || ''} (empty = whole prefix)`, placeholder: 'datasets/v2' },
        { key: 'mode', label: 'Access', type: 'select', options: [['ro', 'Read-only'], ['rw', 'Read-write']] },
        ...(d.mcAvailable ? [] : [{ key: 'expiryDays', label: 'Expiry (days, max 7 — STS mode)', value: '7' }]),
      ], 'Mint share link', async (v, { close, body, err }) => {
        const r = await api('/api/mounts/share', { method: 'POST', body: JSON.stringify(v), headers: { 'Content-Type': 'application/json' } });
        // show the link with a copy button (it embeds the credential — a secret)
        body.innerHTML = `<label>Share link — treat it like a key; send over company chat only</label>
          <textarea readonly style="min-height:84px;font-size:11px">${escHtml(r.link)}</textarea>`;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-create';
        copyBtn.textContent = 'Copy link';
        copyBtn.onclick = () => { copyText(r.link); showToast('Link copied'); close(); this._renderMounts(); };
        const actions = document.createElement('div');
        actions.className = 'dialog-actions';
        actions.appendChild(copyBtn);
        body.appendChild(actions);
      });
    },
  });
}
