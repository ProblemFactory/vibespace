// Sidebar "Mounts" tab — rclone S3 mounts + share minting (collaboration P1).
// Third tab next to Folders | Groups: my-storage card (env-provisioned),
// mount list with live status, share-a-folder minting, import-a-link.
import { createModalShell, showToast, showConfirmDialog, copyText, escHtml } from './utils.js';
import { setupDirAutocomplete } from './autocomplete.js';
import { t as tr } from './i18n.js'; // sidebar cluster convention: local `t` is pervasively a task var

// 16x16 stroke icons (project convention — no emoji in chrome)
const MI = {
  folder: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h4l2 2h6v8H2V3z"/></svg>',
  eject: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l5-5 5 5H3z"/><path d="M3 12h10"/></svg>',
  plug: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v7M4.5 6l3.5 3.5L11.5 6"/><path d="M3 13h10"/></svg>',
  cross: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  importL: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M5 7l3 3 3-3M3 10v3h10v-3"/></svg>',
  link: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5l3-3M5 8L3.5 9.5a2.5 2.5 0 003.5 3.5L8.5 11.5M8 5l1.5-1.5a2.5 2.5 0 013.5 3.5L11.5 8.5"/></svg>',
  plus: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
  pencil: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3z"/></svg>',
  copy: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 5.5v-2a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h2"/></svg>',
  server: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2.5" width="12" height="4.5" rx="1"/><rect x="2" y="9" width="12" height="4.5" rx="1"/><path d="M4.5 4.75h.01M4.5 11.25h.01"/></svg>',
  bolt: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 1.5L3.5 9h3l-1 5.5L10.5 7h-3l1-5.5z"/></svg>',
  wrench: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5a3.5 3.5 0 00-3.3 4.6L2.5 10.8a1.4 1.4 0 002 2l3.7-3.7a3.5 3.5 0 004.5-4.4L10.5 7 9 5.5l2.3-2.2a3.5 3.5 0 00-1.8-.8z"/></svg>',
  termNew: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4 6l2.5 2L4 10M8.5 10.5h3.5"/></svg>',
  key: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="8" r="3"/><path d="M8 8h6M11.5 8v2.5M14 8v2"/></svg>',
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
      // Only blank to "Loading…" on the FIRST paint — on refreshes we keep the
      // existing panel up and swap in the new one when ready (no flicker).
      if (!this.listEl.querySelector('.mounts-panel')) {
        this.listEl.innerHTML = '<div class="mounts-loading">Loading…</div>';
      }
      let d, hd;
      let mt;
      try { [d, hd, mt] = await Promise.all([api('/api/mounts'), api('/api/hosts'), api('/api/mount-tokens').catch(() => ({ tokens: [] }))]); }
      catch { this.listEl.innerHTML = '<div class="mounts-loading">Failed to load</div>'; return; }
      if (this._activeTab !== 'mounts') return; // user switched away mid-fetch
      d.mountTokens = mt?.tokens || [];
      this._mountsData = d;
      this._hostsData = hd;
      this.listEl.innerHTML = '';
      const root = document.createElement('div');
      root.className = 'mounts-panel';

      // ── Hosts section (remote machines over ssh) ──
      const hHead = document.createElement('div');
      hHead.className = 'mounts-sec-head';
      hHead.innerHTML = `${escHtml(tr('Remote hosts'))}<span class="mounts-sec-sub">${escHtml(tr('Run agent sessions on other computers'))}</span>`;
      root.appendChild(hHead);
      if (!hd.hosts.length) {
        const empty = document.createElement('div');
        empty.className = 'mounts-empty';
        empty.textContent = tr('No remote hosts added yet. Add one to run agent sessions on another computer.');
        root.appendChild(empty);
      } else {
        const hlist = document.createElement('div');
        hlist.className = 'mounts-list';
        for (const h of hd.hosts) hlist.appendChild(this._buildHostRow(h));
        root.appendChild(hlist);
        this._autoTestHosts(hd.hosts, hlist);
      }
      const addHost = document.createElement('button');
      addHost.className = 'mounts-action';
      addHost.innerHTML = `<span class="mounts-action-icon">${MI.server}</span><span>Add machine</span>`;
      addHost.onclick = () => this._showAddHostDialog(hd);
      root.appendChild(addHost);

      const sHead = document.createElement('div');
      sHead.className = 'mounts-sec-head';
      sHead.innerHTML = `${escHtml(tr('Storage'))}<span class="mounts-sec-sub">${escHtml(tr('Connect cloud folders and shared datasets'))}</span>`;
      root.appendChild(sHead);

      // rclone powers every mount type — offer a one-click install when absent
      if (d.rcloneAvailable === false) {
        const warn = document.createElement('div');
        warn.className = 'mounts-env-card mounts-rclone-warn';
        warn.innerHTML = '<div class="mounts-env-head"><b>One-time setup needed</b><span>Connecting storage needs a small helper tool. Install it here — no terminal required.</span></div>';
        const ib = document.createElement('button');
        ib.className = 'mounts-btn mounts-btn-primary';
        ib.textContent = 'Install rclone';
        ib.onclick = async () => {
          ib.disabled = true; ib.textContent = 'Downloading…';
          try {
            const r = await api('/api/mounts/rclone/install', { method: 'POST' });
            showToast(`rclone ${r.version} installed`);
          } catch (e) { showToast(e.message || 'Install failed', { type: 'error' }); }
          this._renderMounts();
        };
        warn.appendChild(ib);
        root.appendChild(warn);
      }

      // ONE flat list of connections (no special "My storage" slot). Each row
      // is a connected place — S3, Drive, WebDAV, SFTP, a shared folder, etc.
      const list = document.createElement('div');
      list.className = 'mounts-list';
      if (!d.mounts.length) {
        list.innerHTML = `<div class="mounts-empty">Nothing connected yet. Click “Connect storage” below to add a cloud folder (S3, Google Drive, Nextcloud, SFTP…), or “Import share link” to open a folder someone shared with you.</div>`;
      }
      // Credentials render as parent rows with their mount points nested under
      // them; standalone mounts render flat as before.
      const byParent = new Map();
      for (const m of d.mounts) {
        if (!m.parentId) continue;
        if (!byParent.has(m.parentId)) byParent.set(m.parentId, []);
        byParent.get(m.parentId).push(m);
      }
      for (const m of d.mounts) {
        if (m.parentId && d.mounts.some(r => r.id === m.parentId)) continue; // rendered under parent
        list.appendChild(this._buildMountRow(m));
        for (const c of byParent.get(m.id) || []) list.appendChild(this._buildMountRow(c));
      }
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
          row.innerHTML = `<span class="mounts-share-text"><b>${escHtml(s.name)}</b><span>${escHtml(s.prefix || s.bucket)} · ${s.mode === 'ro' ? 'Read-only' : 'Read-write'} · ${s.method === 'sts' ? 'expires in 7 days' : 'no expiry'}${exp}</span></span>`;
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
        action(MI.plus, 'Connect storage', () => this._showAddMountDialog()),
        action(MI.importL, 'Import share link', () => this._showImportShareDialog()),
        action(MI.importL, 'Import rclone config', () => this._showRcloneConfDialog()),
        action(MI.server, 'Share a local folder', () => this._showBridgeShareDialog(), {
          title: 'Create a link that lets another VibeSpace open a folder from this computer.',
        }),
      );
      root.appendChild(foot);
      // Bridge tokens I minted (revocable)
      if ((d.mountTokens || []).length) {
        const bt = document.createElement('div');
        bt.className = 'mounts-shares';
        bt.innerHTML = '<div class="mounts-sec-head">Bridge tokens</div>';
        for (const t of d.mountTokens) {
          const row = document.createElement('div');
          row.className = 'mounts-share-row';
          row.innerHTML = `<span class="mounts-share-text"><b>${escHtml(t.name)}</b><span>${escHtml(t.root)} · ${t.mode === 'ro' ? 'Read-only' : 'Read-write'}</span></span>`;
          const rm = document.createElement('button');
          rm.className = 'mounts-btn mounts-btn-danger';
          rm.textContent = 'Revoke';
          rm.onclick = async () => {
            const ok = await showConfirmDialog({ title: 'Revoke bridge token?', message: `Anyone mounting "${t.name}" loses access immediately.`, confirmText: 'Revoke', danger: true });
            if (!ok) return;
            try { await api(`/api/mount-tokens/${t.id}`, { method: 'DELETE' }); showToast('Token revoked'); }
            catch (e) { showToast(e.message || 'Failed', { type: 'error' }); }
            this._renderMounts();
          };
          row.appendChild(rm);
          bt.appendChild(row);
        }
        root.appendChild(bt);
      }
      const note = document.createElement('div');
      note.className = 'mounts-note';
      note.textContent = d.mcAvailable
        ? `Connected folders live under ${d.mountBase}. Shared links stay valid until you revoke them.`
        : `Connected folders live under ${d.mountBase}. Shared links currently expire after 7 days; to create links that never expire, an admin can install the “mc” tool on the server.`;
      root.appendChild(note);
      this.listEl.appendChild(root);
    },

    _buildMountRow(m) {
      const isCred = m.kind === 'credential';
      const row = document.createElement('div');
      row.className = 'mounts-row' + (isCred ? ' mounts-row-cred' : '') + (m.parentId ? ' mounts-row-child' : '');
      const dot = m.mounted ? 'ok' : (m.error ? 'err' : 'off');
      const expired = m.expiresAt && Date.now() > m.expiresAt;
      const top = document.createElement('div');
      top.className = 'mounts-row-top';
      // Credential-only records (bucket-scoped token, root not mountable):
      // ICON-ONLY marker in place of the status dot (user directive — no text
      // label, no Connect action; its submounts carry the mount state).
      top.innerHTML = `
        ${isCred
          ? `<span class="mounts-cred-key" title="${escHtml(tr('Credential only — this token can’t open the storage root; add submounts (specific buckets/paths) under it.'))}">${MI.key}</span>`
          : `<span class="mounts-dot mounts-dot-${dot}" title="${m.mounted ? 'Mounted' : escHtml(m.error || 'Not mounted')}"></span>`}
        ${m.parentId ? '<span class="mounts-child-arrow">↳</span>' : ''}
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
      // Credential-only records get NO Connect — their root is known
      // unmountable; submounts carry the mount state.
      if (m.mounted) {
        actions.append(
          ibtn(MI.folder, 'Browse in file explorer', () => { this.app.openFileExplorer(m.path); }),
          ibtn(MI.eject, 'Disconnect', () => api(`/api/mounts/${m.id}/unmount`, { method: 'POST' })),
        );
      } else if (!isCred) {
        actions.append(ibtn(MI.plug, 'Connect', async () => {
          const r = await api(`/api/mounts/${m.id}/mount`, { method: 'POST' });
          if (!r.success) throw new Error('Couldn’t connect — hover the status dot for details');
        }, 'mounts-icon-accent'));
      }
      // Share a folder FROM this connection — only S3 with full owner creds.
      // Doesn't hit the network here, so it's fine to offer while unmounted.
      if (m.canShare) {
        const shareBtn = document.createElement('button');
        shareBtn.className = 'mounts-icon-btn';
        shareBtn.innerHTML = MI.link;
        shareBtn.title = 'Share a folder from this storage (creates a link)';
        shareBtn.onclick = (e) => { e.stopPropagation(); this._showMintShareDialog(m); };
        actions.append(shareBtn);
      }
      // EVERY top-level storage can act as a credential (user directive):
      // ＋ adds a submount (remote:path) under it, for types with a path notion.
      if (!m.parentId && ['s3', 'rclone', 'drive', 'sftp'].includes(m.type || 's3')) {
        actions.append(ibtn(MI.plus, tr('Add a submount (a specific bucket/path of this storage)'), () => { this._showAddChildDialog(m); }, isCred ? 'mounts-icon-accent' : ''));
      }
      actions.append(ibtn(MI.pencil, 'Edit connection (path, credentials, name)', () => { this._showEditMountDialog(m); }));
      if (!isCred && !m.parentId) {
        actions.append(ibtn(MI.copy, 'New mount from this connection (same credentials, different bucket/path)', () => { this._showDuplicateMountDialog(m); }));
      }
      // Env-provisioned personal storage is deployment-managed: no delete
      // (a changed provisioning re-imports it) — edit/rename/unmount only.
      if (m.origin !== 'my-storage') {
        actions.append(ibtn(MI.cross, 'Remove mount (nothing is deleted remotely)', async () => {
          const ok = await showConfirmDialog({ title: `Remove "${m.name}"?`, message: 'The mount record and local mountpoint go away. Nothing is deleted remotely.', confirmText: 'Remove', danger: true });
          if (ok) {
            const r = await api(`/api/mounts/${m.id}`, { method: 'DELETE' });
            if (r?.error) throw new Error(r.error);
          }
        }, 'mounts-icon-danger'));
      }
      top.appendChild(actions);
      const pathEl = document.createElement('div');
      pathEl.className = 'mounts-path';
      // A credential-only row never mounts — its local path is meaningless;
      // show the remote source instead.
      pathEl.title = isCred ? (m.source || '') : `${m.source || ''} → ${m.path}`;
      pathEl.textContent = isCred ? (m.source || '') : m.path;
      if (m.type && m.type !== 's3') {
        const tag = document.createElement('span');
        tag.className = 'mounts-typetag';
        tag.textContent = { drive: 'Drive', webdav: 'WebDAV', sftp: 'SFTP', vibespace: 'VibeSpace', rclone: (m.source || 'rclone').split(':')[0] }[m.type] || m.type;
        top.querySelector('.mounts-name')?.after(tag);
      }
      row.append(top, pathEl);
      if (m.error) {
        const err = document.createElement('div');
        err.className = 'mounts-errline';
        err.textContent = 'Couldn’t connect: ' + m.error.slice(0, 100);
        // Dead Google OAuth token (invalid_grant: revoked/expired) — offer the
        // guided re-authorization right where the failure is visible.
        if (this._isDriveBacked(m) && /invalid_grant|token expired|couldn.t fetch token/i.test(m.error)) {
          const fix = document.createElement('button');
          fix.className = 'mounts-btn mounts-btn-primary mounts-reauth-btn';
          fix.textContent = tr('Re-authorize Google Drive…');
          fix.onclick = (e) => { e.stopPropagation(); this._showDriveReauthDialog(m); };
          err.appendChild(fix);
        }
        row.appendChild(err);
      }
      return row;
    },

    _isDriveBacked(m) { return m.type === 'drive' || (m.type === 'rclone' && m.rcloneType === 'drive'); },

    // Re-authorize an EXISTING Drive mount/credential whose token died. Same
    // guided flow as adding one (server runs `rclone authorize drive` with the
    // mount's own OAuth client), but the minted token writes back into the
    // record (+ its children) instead of a form field.
    _showDriveReauthDialog(m) {
      const { body, close } = createModalShell({ id: 'mount-reauth-dialog', title: tr('Re-authorize "{name}"', { name: m.name }), bodyClass: 'mounts-dialog-body', escapeToClose: true });
      const hint = document.createElement('div');
      hint.className = 'mounts-field-hint';
      hint.textContent = tr('Google reported the saved sign-in as expired or revoked. Sign in again to mint a fresh token — nothing else about the mount changes.');
      const btn = document.createElement('button');
      btn.className = 'mounts-btn mounts-btn-primary';
      btn.textContent = tr('Sign in with Google');
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
          showToast(tr('Google Drive re-authorized'));
          close(); this._renderMounts();
        } catch (e) { status.textContent = e.message || 'Failed'; btn.disabled = false; }
      };
      btn.onclick = async () => {
        btn.disabled = true;
        status.textContent = tr('Preparing authorization…');
        try {
          const r = await api('/api/mounts/gdrive-auth/start', { method: 'POST', body: JSON.stringify({ mountId: m.id }) });
          if (r.error) throw new Error(r.error);
          window.open(r.url, '_blank');
          status.textContent = tr('A Google sign-in page opened. Approve access, then come back here.');
          if (!pasteBox) {
            pasteBox = document.createElement('div');
            pasteBox.innerHTML = `<div class="mounts-field-hint">${escHtml(tr("If this VibeSpace runs on ANOTHER machine, the final page won't load (address starts with 127.0.0.1) — copy that address and paste it here:"))}</div>`;
            const inp = document.createElement('input');
            inp.placeholder = 'http://127.0.0.1:53682/?state=…&code=…';
            inp.onchange = async () => {
              try {
                status.textContent = tr('Completing…');
                const fr = await api('/api/mounts/gdrive-auth/callback', { method: 'POST', body: JSON.stringify({ url: inp.value }) });
                finish(fr.token);
              } catch (e) { status.textContent = e.message || 'Failed'; }
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
          status.textContent = e.message || 'Failed to start authorization';
          btn.disabled = false;
        }
      };
    },

    // Add a submount under any storage — the rclone remote:path model:
    // the parent connection is the part before the colon, this adds the path.
    _showAddChildDialog(cred) {
      const type = cred.type || 's3';
      const pathField = type === 's3' ? { key: 'bucket', label: tr('Bucket'), placeholder: 'bucket-name' }
        : type === 'rclone' ? { key: 'remotePath', label: tr('Remote path (bucket[/prefix])'), placeholder: 'bucket-name/optional/prefix' }
        : type === 'drive' ? { key: 'driveFolder', label: tr('Folder path'), placeholder: 'My Folder/sub' }
        : type === 'sftp' ? { key: 'sshPath', label: tr('Remote path'), placeholder: '/data' }
        : null;
      if (!pathField) { showToast(tr('This storage type doesn’t support submounts'), { type: 'error' }); return; }
      this._mountsDialog(tr('New submount under "{name}"', { name: cred.name }), [
        { key: 'name', label: tr('Name'), value: `${cred.name}-`, placeholder: 'datasets' },
        { key: pathField.key, label: pathField.label, placeholder: pathField.placeholder },
        ...(type === 's3' ? [{ key: 'prefix', label: tr('Prefix (optional)'), placeholder: 'sub/path' }] : []),
        { key: 'customPath', label: tr('Mount point (blank = default)'), placeholder: '/absolute/path' },
        { key: 'mode', label: tr('Access'), type: 'select', options: [['rw', 'Read-write'], ['ro', 'Read-only']] },
      ], tr('Create & connect'), async (v, { close }) => {
        const r = await api(`/api/mounts/${cred.id}/children`, { method: 'POST', body: JSON.stringify(v) });
        try { await api(`/api/mounts/${r.id}/mount`, { method: 'POST' }); }
        catch (e) { showToast(e.message || tr('Created, but connecting failed — check the path'), { type: 'error' }); }
        close(); this._renderMounts();
      });
    },

    // Auto-probe connectivity so the dots are meaningful without clicking:
    // test any host with no status or one older than 2 minutes, in parallel,
    // and swap JUST that row in place (no full re-render → no flicker).
    _autoTestHosts(hosts, hlist) {
      const now = Date.now();
      this._hostStatus = this._hostStatus || {};
      for (const h of hosts) {
        const st = this._hostStatus[h.id];
        if (st && now - (st.at || 0) < 120000) continue;
        if (this._hostTesting?.has(h.id)) continue;
        (this._hostTesting = this._hostTesting || new Set()).add(h.id);
        api(`/api/hosts/${h.id}/test`, { method: 'POST' })
          .then((r) => { this._hostStatus[h.id] = { ...r, at: Date.now() }; })
          .catch((e) => { this._hostStatus[h.id] = { error: e.message, at: Date.now() }; })
          .finally(() => {
            this._hostTesting.delete(h.id);
            if (!hlist.isConnected) return; // panel re-rendered meanwhile
            const old = [...hlist.children].find(el => el._hostId === h.id);
            if (old) hlist.replaceChild(this._buildHostRow(h), old);
          });
      }
    },

    _buildHostRow(h) {
      const row = document.createElement('div');
      row.className = 'mounts-row';
      row._hostId = h.id; // in-place replacement key (_autoTestHosts)
      const st = this._hostStatus?.[h.id]; // {ok, latencyMs, tools} | {error} | undefined
      const dot = st ? (st.ok ? 'ok' : 'err') : 'off';
      const top = document.createElement('div');
      top.className = 'mounts-row-top';
      top.innerHTML = `
        <span class="mounts-dot mounts-dot-${dot}" title="${st ? (st.ok ? `${st.latencyMs}ms` : escHtml(st.error || 'unreachable')) : 'Not tested yet'}"></span>
        <b class="mounts-name" title="${escHtml(h.user)}@${escHtml(h.host)}:${h.port}">${escHtml(h.name)}</b>
        ${st?.ok && st.tools ? `<span class="mounts-badge${st.tools.claude && st.tools.dtach ? '' : ' mounts-badge-red'}" title="Ready to run sessions — dtach ${st.tools.dtach ? '✓' : '✗ (missing)'}, Node ${st.tools.node ? '✓' : '✗ (missing)'}, Claude ${st.tools.claude ? '✓' : '✗ (missing)'}. Click Set up to install what’s missing.">${st.tools.claude && st.tools.dtach ? 'READY' : 'NEEDS SETUP'}</span>` : ''}`;
      const actions = document.createElement('span');
      actions.className = 'mounts-row-actions';
      const ibtn = (svg, title, fn, cls = '') => {
        const b = document.createElement('button');
        b.className = 'mounts-icon-btn ' + cls;
        b.innerHTML = svg; b.title = title;
        b.onclick = async (e) => {
          e.stopPropagation(); b.disabled = true;
          try { await fn(); } catch (err) { showToast(err.message || 'Failed', { type: 'error' }); }
          this._renderMounts();
        };
        return b;
      };
      actions.append(
        ibtn(MI.bolt, 'Test connection', async () => {
          this._hostStatus = this._hostStatus || {};
          try {
            const r = await api(`/api/hosts/${h.id}/test`, { method: 'POST' });
            this._hostStatus[h.id] = r;
            const t = r.tools || {};
            const tools = ['dtach', 'node', 'claude', 'codex'].filter(k => t[k]);
            showToast(`${h.name} reachable · ${r.latencyMs}ms · ${tools.length ? tools.join(', ') : 'not set up yet — click Set up'}`);
          } catch (e) { this._hostStatus[h.id] = { ok: false, error: e.message }; throw e; }
        }),
        ibtn(MI.wrench, 'Set up (install the tools needed to run agents)', () => { this._showBootstrapDialog(h); }),
        ibtn(MI.termNew, 'New session on this host', () => { this.app.showNewSessionDialog?.({ hostId: h.id, hostName: h.name }); }),
        ibtn(MI.cross, 'Remove host', async () => {
          const ok = await showConfirmDialog({ title: `Remove "${h.name}"?`, message: 'Only the registry entry goes away — nothing on the remote machine is touched.', confirmText: 'Remove', danger: true });
          if (ok) await api(`/api/hosts/${h.id}`, { method: 'DELETE' });
        }, 'mounts-icon-danger'),
      );
      top.appendChild(actions);
      const sub = document.createElement('div');
      sub.className = 'mounts-path';
      sub.style.direction = 'ltr';
      sub.textContent = `${h.user}@${h.host}${h.port !== 22 ? ':' + h.port : ''}${h.keyPath ? ' · using VibeSpace key' : ''}`;
      row.append(top, sub);
      return row;
    },

    _showAddHostDialog(hd) {
      this._mountsDialog('Add remote machine', [
        { key: 'name', label: 'Name', placeholder: 'gpu-01', hint: 'Any label you like — how this machine shows in your lists.' },
        { key: 'user', label: 'Username on that machine', placeholder: 'ubuntu' },
        { key: 'host', label: 'Address', placeholder: '10.0.0.5 or gpu01.example.com', hint: 'The machine’s IP address or hostname.' },
        { key: 'port', label: 'Port', value: '22', hint: 'Usually 22 — leave as-is unless told otherwise.' },
        { key: 'keyChoice', label: 'How to log in', type: 'select', options: [
          ['default', 'The SSH keys already on this server'],
          ['app', hd.key.exists ? 'VibeSpace’s own key (recommended)' : 'Create a key for VibeSpace (recommended)'],
          ['paste', 'Paste or upload my own key…'],
        ], hint: 'An SSH key lets VibeSpace log in without a password. If unsure, pick the VibeSpace key — we’ll show you a line to add on the other machine.' },
      ], 'Add machine', async (v, { close }) => {
        let keyPath = null;
        let privateKey = null;
        if (v.keyChoice === 'paste') {
          privateKey = await new Promise((resolve) => {
            this._mountsDialog('Private key', [], 'Use this key', async (_, ctx) => {
              const val = document.getElementById('mounts-key-paste')?.value || '';
              if (!val.trim()) throw new Error('Paste or upload the key first');
              ctx.close(); resolve(val);
            });
            const ov = document.getElementById('mounts-dialog-overlay');
            const body = ov.querySelector('.dialog-body');
            const note = document.createElement('p');
            note.className = 'agents-note';
            note.textContent = 'Stored securely on the server. The key must not have a passphrase — VibeSpace logs in automatically.';
            const ta = document.createElement('textarea');
            ta.id = 'mounts-key-paste';
            ta.placeholder = '-----BEGIN OPENSSH PRIVATE KEY-----';
            ta.style.cssText = 'min-height:130px;font-size:10px;font-family:monospace';
            const up = document.createElement('input');
            up.type = 'file';
            up.onchange = () => {
              const f = up.files[0];
              if (f) { const r = new FileReader(); r.onload = () => { ta.value = r.result; }; r.readAsText(f); }
            };
            body.prepend(note, ta, up);
          });
        }
        if (v.keyChoice === 'app') {
          let k = hd.key;
          if (!k.exists) {
            const r = await api('/api/hosts/key', { method: 'POST' });
            k = r.key;
            // surface the public key so the user can install it on the target
            await new Promise((done) => {
              this._mountsDialog('Public key generated', [], 'Done', async (_, ctx) => { ctx.close(); done(); });
              const ov = document.getElementById('mounts-dialog-overlay');
              const body = ov.querySelector('.dialog-body');
              const ta = document.createElement('textarea');
              ta.readOnly = true; ta.value = k.publicKey; ta.style.minHeight = '64px'; ta.style.fontSize = '11px';
              const note = document.createElement('p');
              note.className = 'agents-note';
              note.textContent = 'This lets VibeSpace log in to that machine. Add this line to the user’s ~/.ssh/authorized_keys on the target machine (or ask whoever manages it to), then press Done.';
              const copy = document.createElement('button');
              copy.className = 'btn-cancel';
              copy.textContent = 'Copy';
              copy.onclick = () => { copyText(k.publicKey); showToast('Public key copied'); };
              body.prepend(note, ta, copy);
            });
          }
          keyPath = k.path;
        }
        const r = await api('/api/hosts', { method: 'POST', body: JSON.stringify({ name: v.name, user: v.user, host: v.host, port: v.port, keyPath, privateKey }) });
        close();
        // immediate connectivity test so the row shows a real status
        this._hostStatus = this._hostStatus || {};
        try { this._hostStatus[r.id] = await api(`/api/hosts/${r.id}/test`, { method: 'POST' }); showToast('Host reachable'); }
        catch (e) { this._hostStatus[r.id] = { ok: false, error: e.message }; showToast('Added, but unreachable: ' + e.message, { type: 'error' }); }
        this._renderMounts();
      });
    },

    // Bootstrap: dedicated step-progress UI with an expandable live log
    // (user-specified design — not a bare terminal window).
    async _showBootstrapDialog(h) {
      let off = null; // assigned after the handler registers — close() can run first (TDZ trap)
      // No backdrop close: a stray click mid-bootstrap must not dismiss the progress view.
      const { overlay, body } = createModalShell({
        id: 'mounts-dialog-overlay', title: `Set up ${h.name}`, minWidth: '400px',
        closeOnBackdrop: false, onClose: () => off?.(),
      });
      body.innerHTML = `<div class="bs-steps"></div>
        <details class="bs-log-wrap"><summary>Log</summary><pre class="bs-log"></pre></details>
        <div class="dialog-actions"><button class="btn-create bs-start">Start</button></div>`;
      const stepsEl = overlay.querySelector('.bs-steps');
      const logEl = overlay.querySelector('.bs-log');
      const { steps } = await api('/api/hosts/bootstrap-steps');
      const state = {};
      const paint = () => {
        stepsEl.innerHTML = steps.map(s => {
          const st = state[s.key] || 'pending';
          const icon = st === 'ok' ? '<span class="bs-ic bs-ok">✓</span>'
            : st === 'fail' ? '<span class="bs-ic bs-fail">✗</span>'
            : st === 'running' ? '<span class="bs-ic bs-spin"></span>'
            : '<span class="bs-ic bs-pend"></span>';
          return `<div class="bs-step">${icon}<span>${escHtml(s.label)}</span></div>`;
        }).join('');
      };
      paint();
      const appendLog = (line) => { logEl.textContent += line + '\n'; logEl.scrollTop = logEl.scrollHeight; };
      const handler = (msg) => {
        // Overlay can be removed by paths that never call close() (another
        // dialog's dedup overlay.remove()) — self-unregister on first message.
        if (!overlay.isConnected) { this.app.ws.offGlobal(handler); return; }
        if (msg.type !== 'host-bootstrap' || msg.hostId !== h.id) return;
        if (msg.kind === 'step' && msg.key) { state[msg.key] = msg.status; paint(); }
        else if (msg.kind === 'log' && msg.line) appendLog(msg.line);
        else if (msg.kind === 'done' && msg.steps) { Object.assign(state, msg.steps); paint(); }
      };
      this.app.ws.onGlobal(handler);
      off = () => this.app.ws.offGlobal(handler);
      const startBtn = overlay.querySelector('.bs-start');
      startBtn.onclick = async () => {
        startBtn.disabled = true; startBtn.textContent = 'Running…';
        overlay.querySelector('.bs-log-wrap').open = true; // show the log live
        appendLog(`$ connecting to ${h.user}@${h.host}…`);
        try {
          const r = await api(`/api/hosts/${h.id}/bootstrap`, { method: 'POST' });
          Object.assign(state, r.steps); paint();
          startBtn.textContent = r.success ? 'All done' : 'Finished with failures';
          this._hostStatus = this._hostStatus || {};
          try { this._hostStatus[h.id] = await api(`/api/hosts/${h.id}/test`, { method: 'POST' }); } catch {}
          this._renderMounts();
        } catch (e) { startBtn.textContent = 'Failed'; showToast(e.message, { type: 'error' }); }
      };
    },

    _mountsDialog(title, fields, submitLabel, onSubmit) {
      const { body, close } = createModalShell({ id: 'mounts-dialog-overlay', title });
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

    _showRcloneConfDialog() {
      const { body, close } = createModalShell({ id: 'mounts-dialog-overlay', title: 'Import rclone config' });
      const hint = document.createElement('div');
      hint.className = 'mounts-field-hint';
      hint.textContent = 'Paste the contents of your rclone.conf (from `rclone config file` — usually ~/.config/rclone/rclone.conf). Every remote inside it becomes a mount you can pick.';
      const ta = document.createElement('textarea');
      ta.placeholder = '[gdrive]\ntype = drive\ntoken = {…}\n\n[b2]\ntype = b2\naccount = …\nkey = …';
      ta.style.minHeight = '120px'; ta.style.fontSize = '11px'; ta.style.fontFamily = 'monospace';
      const parseBtn = document.createElement('button');
      parseBtn.className = 'btn-create';
      parseBtn.textContent = 'Find storage in this config';
      const list = document.createElement('div');
      list.className = 'mounts-conf-list';
      const err = document.createElement('div');
      err.className = 'cfg-err';
      body.append(hint, ta, parseBtn, list, err);

      let confText = '';
      parseBtn.onclick = async () => {
        err.textContent = ''; list.innerHTML = '';
        confText = ta.value;
        let d;
        try { d = await api('/api/mounts/rclone-conf/parse', { method: 'POST', body: JSON.stringify({ text: confText }), headers: { 'Content-Type': 'application/json' } }); }
        catch (e) { err.textContent = e.message || 'Parse failed'; return; }
        if (!d.remotes?.length) { err.textContent = 'No remotes found in that config.'; return; }
        const checks = [];
        for (const r of d.remotes) {
          const row = document.createElement('label');
          row.className = 'mounts-conf-row';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = !r.wraps;
          cb.disabled = r.wraps;
          cb.dataset.name = r.name;
          checks.push(cb);
          const txt = document.createElement('span');
          txt.innerHTML = `<b>${escHtml(r.name)}</b> <span class="mounts-typetag">${escHtml(r.type)}</span>` +
            (r.wraps ? ' <span class="mounts-field-hint" style="display:inline">references another remote — not supported</span>' : '');
          row.append(cb, txt);
          list.appendChild(row);
        }
        // mode + import button
        const modeWrap = document.createElement('div');
        modeWrap.className = 'mounts-conf-mode';
        modeWrap.innerHTML = '<label>Mount as</label>';
        const modeSel = document.createElement('select');
        for (const [v, l] of [['rw', 'Read-write'], ['ro', 'Read-only']]) { const o = document.createElement('option'); o.value = v; o.textContent = l; modeSel.appendChild(o); }
        modeWrap.appendChild(modeSel);
        const importBtn = document.createElement('button');
        importBtn.className = 'btn-create';
        importBtn.textContent = 'Import & connect selected';
        importBtn.onclick = async () => {
          const names = checks.filter(c => c.checked).map(c => c.dataset.name);
          if (!names.length) { err.textContent = 'Pick at least one remote.'; return; }
          importBtn.disabled = true; importBtn.textContent = 'Importing…';
          try {
            const r = await api('/api/mounts/rclone-conf/import', { method: 'POST', body: JSON.stringify({ text: confText, names, mode: modeSel.value }), headers: { 'Content-Type': 'application/json' } });
            close(); showToast(`Imported ${r.added.length} remote${r.added.length === 1 ? '' : 's'}`); this._renderMounts();
          } catch (e) { err.textContent = e.message || 'Import failed'; importBtn.disabled = false; importBtn.textContent = 'Import & connect selected'; }
        };
        list.append(modeWrap, importBtn);
      };
    },

    _showImportShareDialog() {
      this._mountsDialog('Import share link', [
        { key: 'link', label: 'Share link', placeholder: 'vibespace-share:v1:…' },
        { key: 'name', label: 'Display name (optional)', placeholder: 'team-dataset', hint: 'What to call this folder in your file list.' },
      ], 'Import & connect', async (v, { close }) => {
        if (!v.link) throw new Error('Paste the share link');
        const r = await api('/api/mounts/import', { method: 'POST', body: JSON.stringify({ link: v.link, name: v.name || undefined }), headers: { 'Content-Type': 'application/json' } });
        await fetch(`/api/mounts/${r.id}/mount`, { method: 'POST' });
        close(); showToast('Share imported'); this._renderMounts();
      });
    },

    _showAddMountDialog() {
      const is = (t) => (v) => v.type === t;
      this._mountsDialog('Connect storage', [
        { key: 'type', label: 'Source type', type: 'select', options: [
          ['s3', 'Cloud storage (S3 / MinIO)'], ['drive', 'Google Drive'], ['webdav', 'Nextcloud / WebDAV'],
          ['sftp', 'A server over SSH (SFTP)'], ['vibespace', 'Another VibeSpace'], ['rclone', 'Custom / advanced (rclone)'],
        ] },
        { key: 'name', label: 'Name', placeholder: 'my-mount' },
        // S3
        { key: 'endpoint', label: 'Server address (endpoint)', placeholder: 'https://s3.amazonaws.com  or  https://s3.mycompany.com', when: is('s3'), hint: 'The address your storage provider gave you. For Amazon S3 use https://s3.amazonaws.com; for MinIO/other providers use the link from their console.' },
        { key: 'bucket', label: 'Bucket (storage container)', placeholder: 'company-workspace', when: is('s3'), hint: 'The container name from your provider’s console — like a top-level drive.' },
        { key: 'prefix', label: 'Subfolder (optional)', placeholder: 'users/alice', when: is('s3'), hint: 'Limit this connection to one folder inside the bucket. Leave blank for the whole bucket.' },
        { key: 'accessKey', label: 'Access key', when: is('s3'), hint: 'From your provider’s “Access Keys” / API credentials page.' },
        { key: 'secretKey', label: 'Secret key', type: 'password', when: is('s3'), hint: 'The secret half of the access key — treat it like a password.' },
        // Google Drive
        { key: 'token', label: 'Google Drive access', type: 'textarea', placeholder: 'click "Connect Google Drive" below — no terminal needed', when: is('drive'), hint: 'Advanced: you can also paste the JSON from `rclone authorize "drive"` run elsewhere.' },
        { key: 'driveFolder', label: 'Folder (optional, blank = whole Drive)', placeholder: 'Projects/Data', when: is('drive') },
        { key: 'clientId', label: 'Custom OAuth client ID (optional)', placeholder: 'leave blank to use the built-in client', when: is('drive'), hint: 'Advanced: your own Google Cloud OAuth client — avoids rclone\'s shared quota. Used by Connect too.' },
        { key: 'clientSecret', label: 'Custom OAuth client secret (optional)', type: 'password', when: is('drive') },
        // WebDAV / Nextcloud
        { key: 'url', label: 'WebDAV URL', placeholder: 'https://cloud.example.com/remote.php/dav/files/me', when: is('webdav'), hint: 'Nextcloud: Settings → Files shows this address. Use an app password if you have 2FA.' },
        { key: 'vendor', label: 'Vendor', type: 'select', options: [['other', 'Generic WebDAV'], ['nextcloud', 'Nextcloud']], when: is('webdav') },
        { key: 'user', label: 'Username', when: is('webdav') },
        { key: 'pass', label: 'Password / app token', type: 'password', when: is('webdav') },
        // SFTP
        { key: 'fromHost', label: 'From registered host (optional)', type: 'select', when: is('sftp'),
          options: [['', '— pick to prefill —'], ...((this._hostsData?.hosts || []).map(h => [h.id, h.name]))] },
        { key: 'sshHost', label: 'SSH host', placeholder: 'box.example.com', when: is('sftp') },
        { key: 'sshUser', label: 'SSH user', placeholder: 'ubuntu', when: is('sftp') },
        { key: 'sshPort', label: 'Port', placeholder: '22', when: is('sftp') },
        { key: 'sshPath', label: 'Remote path (optional)', placeholder: '/home/ubuntu/data', when: is('sftp'), autocomplete: (inputs) => inputs.fromHost?.value ? `/api/hosts/${inputs.fromHost.value}/dir-complete` : '/api/hosts/none/dir-complete' },
        { key: 'keyPath', label: 'Private key path (absolute) — or use password', placeholder: '~/.ssh/id_ed25519', when: is('sftp'), autocomplete: 'local' },
        { key: 'pass', label: 'Password (if no key)', type: 'password', when: is('sftp') },
        // Another VibeSpace
        { key: 'url', label: 'VibeSpace URL', placeholder: 'https://vibespace.example.com', when: is('vibespace') },
        { key: 'bearerToken', label: 'Mount token (vsmt_…)', type: 'password', when: is('vibespace'), hint: 'Ask the other VibeSpace to create one under Storage → “Share a local folder”.' },
        // Custom rclone backend
        { key: 'rcloneType', label: 'rclone backend', placeholder: 'dropbox / b2 / azureblob / mega / …', when: is('rclone'), hint: 'Any backend rclone supports — see rclone.org/docs. Params below map to that backend\'s config keys.' },
        { key: 'params', label: 'Parameters (one key = value per line)', type: 'textarea', placeholder: 'token = {"access_token":…}\naccount = my-account\nkey = …', when: is('rclone'), hint: 'e.g. b2 wants account + key; dropbox wants token. All values encrypted at rest.' },
        { key: 'remotePath', label: 'Path within the remote (optional)', placeholder: 'folder/subfolder', when: is('rclone') },
        // common
        { key: 'extraParams', label: 'Extra options (key = value per line)', type: 'textarea', placeholder: 'e.g.  chunk_size = 64M', hint: 'Passed to the underlying transfer engine (rclone) — custom API keys, tuning, provider quirks. See rclone.org/docs.', advanced: true },
        { key: 'mode', label: 'Mode', type: 'select', options: [['rw', 'Read-write'], ['ro', 'Read-only']] },
        { key: 'customPath', label: 'Where to put it on this computer (optional)', placeholder: 'leave blank — we choose automatically', hint: 'Advanced: an absolute path if you need it in a specific place.', advanced: true, autocomplete: 'local' },
      ], 'Connect', async (v, { close }) => {
        delete v.fromHost; // UI-only prefill helper
        const parseKV = (text) => {
          const o = {};
          for (const line of String(text || '').split('\n')) {
            const i = line.indexOf('=');
            if (i < 0) continue;
            const k = line.slice(0, i).trim(); if (!k) continue;
            o[k] = line.slice(i + 1).trim();
          }
          return o;
        };
        if (v.type === 'rclone') v.params = parseKV(v.params);
        if (v.extraParams) v.extraParams = parseKV(v.extraParams);
        const r = await api('/api/mounts', { method: 'POST', body: JSON.stringify(v), headers: { 'Content-Type': 'application/json' } });
        await fetch(`/api/mounts/${r.id}/mount`, { method: 'POST' });
        close(); showToast('Storage connected'); this._renderMounts();
      });
      const ctx = this._lastMountsDialog;
      if (!ctx) return;
      // SFTP: picking a registered host prefills connection fields (key incl.)
      ctx.inputs.fromHost?.addEventListener('change', () => {
        const h = (this._hostsData?.hosts || []).find(x => x.id === ctx.inputs.fromHost.value);
        if (!h) return;
        ctx.inputs.sshHost.value = h.host;
        ctx.inputs.sshUser.value = h.user;
        ctx.inputs.sshPort.value = String(h.port || 22);
        if (h.keyPath) ctx.inputs.keyPath.value = h.keyPath;
        if (!ctx.inputs.name.value) ctx.inputs.name.value = h.name.toLowerCase().replace(/[^\w-]+/g, '-') + '-files';
      });
      // Google Drive: guided OAuth — no terminal needed
      this._wireDriveConnect(ctx);
    },

    // Inject a "Connect Google Drive" button + guided flow into the add-mount
    // dialog. Server runs rclone authorize; same-machine browsers complete
    // hands-free, remote ones paste the redirect URL back (we forward it).
    _wireDriveConnect(ctx) {
      const tokenInput = ctx.inputs.token;
      if (!tokenInput) return;
      const wrap = document.createElement('div');
      wrap.className = 'mounts-drive-connect';
      const btn = document.createElement('button');
      btn.className = 'mounts-btn mounts-btn-primary';
      btn.textContent = 'Connect Google Drive';
      const status = document.createElement('div');
      status.className = 'mounts-field-hint';
      wrap.append(btn, status);
      tokenInput.before(wrap);
      // show/hide with the drive fields
      const sync = () => { wrap.style.display = tokenInput.style.display; };
      new MutationObserver(sync).observe(tokenInput, { attributes: true, attributeFilter: ['style'] });
      sync();
      let pasteBox = null, poll = null;
      const stopPoll = () => { clearInterval(poll); poll = null; };
      const finish = (token) => {
        stopPoll();
        tokenInput.value = token;
        status.textContent = '✓ Connected — finish with the “Connect” button below.';
        btn.textContent = 'Reconnect';
        btn.disabled = false;
        pasteBox?.remove(); pasteBox = null;
      };
      btn.onclick = async () => {
        btn.disabled = true;
        status.textContent = 'Preparing authorization…';
        try {
          const r = await api('/api/mounts/gdrive-auth/start', {
            method: 'POST',
            body: JSON.stringify({ clientId: ctx.inputs.clientId?.value || undefined, clientSecret: ctx.inputs.clientSecret?.value || undefined }),
            headers: { 'Content-Type': 'application/json' },
          });
          if (r.error) throw new Error(r.error);
          window.open(r.url, '_blank');
          status.textContent = 'A Google sign-in page opened. Approve access, then come back here.';
          if (!pasteBox) {
            pasteBox = document.createElement('div');
            pasteBox.innerHTML = `<div class="mounts-field-hint">If this VibeSpace runs on ANOTHER machine, the final page won't load (address starts with 127.0.0.1) — copy that address and paste it here:</div>`;
            const inp = document.createElement('input');
            inp.placeholder = 'http://127.0.0.1:53682/?state=…&code=…';
            inp.onchange = async () => {
              try {
                status.textContent = 'Completing…';
                const fr = await api('/api/mounts/gdrive-auth/callback', { method: 'POST', body: JSON.stringify({ url: inp.value }), headers: { 'Content-Type': 'application/json' } });
                finish(fr.token);
              } catch (e) { status.textContent = e.message || 'Failed'; }
            };
            pasteBox.appendChild(inp);
            wrap.appendChild(pasteBox);
          }
          // same-machine flow completes on its own — poll for the token
          poll = setInterval(async () => {
            // Dialog gone (closed or replaced) → stop polling the token
            // endpoint (used to keep firing for the full 10 minutes).
            if (!status.isConnected) { stopPoll(); return; }
            try {
              const st = await api('/api/mounts/gdrive-auth/status');
              if (st.token) finish(st.token);
            } catch {}
          }, 1500);
          setTimeout(stopPoll, 10 * 60 * 1000);
        } catch (e) {
          status.textContent = e.message || 'Failed to start authorization';
          btn.disabled = false;
        }
      };
    },

    // Mint a scoped WebDAV mount token so another VibeSpace can mount a folder
    // of THIS instance (the "VibeSpace互挂" bridge).
    _showBridgeShareDialog(prefillRoot) {
      this._mountsDialog('Share a local folder', [
        { key: 'name', label: 'Label', placeholder: 'shared-with-bob' },
        { key: 'root', label: 'Folder to share (absolute path on this machine)', placeholder: '/home/me/project', autocomplete: 'local', value: prefillRoot || '' },
        { key: 'mode', label: 'Access', type: 'select', options: [['ro', 'Read-only'], ['rw', 'Read-write']] },
      ], 'Create link', async (v, { close, body }) => {
        const r = await api('/api/mount-tokens', { method: 'POST', body: JSON.stringify(v), headers: { 'Content-Type': 'application/json' } });
        body.innerHTML = `<label>Bridge link — embeds a scoped token; treat it like a key</label>
          <textarea readonly style="min-height:84px;font-size:11px">${escHtml(r.link)}</textarea>
          <div class="mounts-note">The other side pastes this into “Import share link” (or Connect storage → Another VibeSpace). Revoke any time under Bridge tokens.</div>`;
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

    // Mint an S3 share link FROM a specific mount (uses that mount's own creds).
    // ── Edit / derive (2.107.0, user request: FishR2-class mounts needed a
    // bucket/path fix with no edit UI; one credential → many mounts) ──
    // Secret-typed keys: blank input = keep the stored value (never prefilled —
    // secret VALUES never leave the server).
    _SECRET_KEYS: ['secretKey', 'accessKey', 'sessionToken', 'pass', 'bearerToken', 'token', 'clientSecret'],

    _mountEditFields(m) {
      // [key, label, placeholder, prefillValue] per type; secret fields blank = keep
      // Env-provisioned storage: connection is deployment-owned — only the
      // mount point (and name, added by the caller) are editable.
      if (m.origin === 'my-storage') return [
        ['customPath', tr('Mount point (blank = default)'), '/absolute/path', m.customPath || ''],
      ];
      const type = m.type || 's3';
      // A mount point under a credential owns ONLY its path — connection
      // params are edited on the credential itself.
      if (m.parentId) {
        if (type === 's3') return [
          ['bucket', tr('Bucket'), 'bucket-name', m.bucket || ''],
          ['prefix', tr('Prefix (optional)'), 'sub/path', m.prefix || ''],
        ];
        if (type === 'rclone') return [['remotePath', tr('Remote path (bucket[/prefix])'), 'bucket-name/optional/prefix', m.remotePath || '']];
        if (type === 'drive') return [['driveFolder', tr('Folder path (optional)'), 'My Folder/sub', m.driveFolder || '']];
        if (type === 'sftp') return [['sshPath', tr('Remote path'), '/data', m.sshPath || '']];
        return [];
      }
      if (type === 's3') return [
        ['endpoint', 'Endpoint', 'https://…', m.endpoint || ''],
        ['bucket', 'Bucket', 'bucket-name', m.bucket || ''],
        ['prefix', 'Prefix (optional)', 'sub/path', m.prefix || ''],
        ['accessKey', 'Access key', m.accessKeyTail ? `…${m.accessKeyTail} (keep)` : '', ''],
        ['secretKey', 'Secret key (blank = keep)', '••••••••', ''],
      ];
      if (type === 'rclone') return [
        ['remotePath', tr('Remote path (bucket[/prefix])'), 'bucket-name/optional/prefix', m.remotePath || ''],
        // every stored parameter is replaceable: blank = keep, "-" = remove
        ...(m.paramKeys || []).map((k) => [`param:${k}`, k, tr('(blank = keep, "-" = remove)'), '']),
        ['newParamKey', tr('Add parameter — name'), 'e.g. region', ''],
        ['newParamValue', tr('Add parameter — value'), '', ''],
      ];
      if (type === 'drive') return [
        ['driveFolder', tr('Folder path (optional)'), 'My Folder/sub', m.driveFolder || ''],
        ['token', tr('OAuth token (blank = keep)'), '{"access_token":…}', ''],
        ['clientId', tr('OAuth client id (optional)'), '', m.clientId || ''],
        ['clientSecret', tr('OAuth client secret (blank = keep)'), '••••••••', ''],
      ];
      if (type === 'webdav' || type === 'vibespace') return [
        ['url', 'URL', 'https://…', m.url || ''],
        ...(type === 'webdav' ? [['user', tr('User'), '', m.user || ''], ['pass', tr('Password (blank = keep)'), '••••••••', '']] : []),
        ['bearerToken', tr('Bearer token (blank = keep)'), '••••••••', ''],
      ];
      if (type === 'sftp') return [
        ['sshHost', tr('Host'), 'example.com', m.sshHost || ''],
        ['sshUser', tr('User'), '', m.sshUser || ''],
        ['sshPort', tr('Port'), '22', m.sshPort ? String(m.sshPort) : ''],
        ['sshPath', tr('Remote path (optional)'), '/data', m.sshPath || ''],
        ['keyPath', tr('Private key path (absolute, optional)'), '/home/me/.ssh/id_ed25519', m.keyPath || ''],
        ['pass', tr('Password (blank = keep)'), '••••••••', ''],
      ];
      return [];
    },

    _showEditMountDialog(m) {
      const { body, close } = createModalShell({ id: 'mount-edit-dialog', title: `${tr('Edit')} "${m.name}"`, bodyClass: 'mounts-dialog-body', escapeToClose: true });
      const form = document.createElement('form');
      form.className = 'mounts-form';
      const fields = [['name', tr('Name'), '', m.name], ...this._mountEditFields(m)];
      if (m.origin !== 'my-storage') fields.push(['customPath', tr('Mount point (blank = default)'), '/absolute/path', m.customPath || '']);
      form.innerHTML = fields.map(([k, label, ph, val]) =>
        `<label>${escHtml(label)}<input name="${k}" value="${escHtml(val)}" placeholder="${escHtml(ph)}" autocomplete="off"></label>`).join('')
        + `<div class="mounts-note">${tr('Applied on save — a connected mount reconnects with the new settings.')}</div>
           <div class="cfg-err"></div>
           <div class="dialog-actions"><button type="submit" class="btn-create">${tr('Save')}</button></div>`;
      body.appendChild(form);
      // Drive-backed records get the guided re-auth right in the edit dialog
      // (the error-line button only shows once a mount has FAILED).
      if (this._isDriveBacked(m) && m.origin !== 'my-storage' && !m.parentId) {
        const rb = document.createElement('button');
        rb.type = 'button';
        rb.className = 'mounts-btn';
        rb.textContent = tr('Re-authorize Google Drive…');
        rb.onclick = () => { close(); this._showDriveReauthDialog(m); };
        form.querySelector('.dialog-actions').prepend(rb);
      }
      const err = form.querySelector('.cfg-err');
      form.onsubmit = async (e) => {
        e.preventDefault(); err.textContent = '';
        const patch = {};
        const params = {};
        let newKey = '', newVal = '';
        for (const [k, , , orig] of fields) {
          const v = form.querySelector(`[name="${k}"]`).value;
          if (k.startsWith('param:')) {
            // blank = keep; "-" = remove (server deletes on empty value)
            if (v === '-') params[k.slice(6)] = '';
            else if (v) params[k.slice(6)] = v;
          }
          else if (k === 'newParamKey') newKey = v.trim();
          else if (k === 'newParamValue') newVal = v;
          else if (this._SECRET_KEYS.includes(k)) { if (v) patch[k] = v; }
          else if (v !== orig) patch[k] = v;
        }
        if (newKey && newVal) params[newKey] = newVal;
        if (Object.keys(params).length) patch.params = params;
        if (!Object.keys(patch).length) { close(); return; }
        try { await api(`/api/mounts/${m.id}`, { method: 'PATCH', body: JSON.stringify(patch), headers: { 'Content-Type': 'application/json' } }); }
        catch (e2) { err.textContent = e2.message || 'Failed'; return; }
        close(); this._renderMounts();
      };
    },

    _showDuplicateMountDialog(m) {
      const { body, close } = createModalShell({ id: 'mount-dup-dialog', title: tr('New mount from "{name}"', { name: m.name }), bodyClass: 'mounts-dialog-body', escapeToClose: true });
      const form = document.createElement('form');
      form.className = 'mounts-form';
      const type = m.type || 's3';
      const pathField = type === 's3' ? ['bucket', tr('Bucket'), m.bucket || '']
        : type === 'rclone' ? ['remotePath', tr('Remote path (bucket[/prefix])'), m.remotePath || '']
        : type === 'drive' ? ['driveFolder', tr('Folder path'), m.driveFolder || '']
        : null;
      form.innerHTML = `
        <label>${tr('Name')}<input name="name" value="${escHtml(m.name)}-2" autocomplete="off"></label>
        ${pathField ? `<label>${escHtml(pathField[1])}<input name="${pathField[0]}" value="${escHtml(pathField[2])}" autocomplete="off"></label>` : ''}
        ${type === 's3' ? `<label>${tr('Prefix (optional)')}<input name="prefix" value="${escHtml(m.prefix || '')}" autocomplete="off"></label>` : ''}
        <div class="mounts-note">${tr('Same credentials, different location — one connection can back any number of mounts.')}</div>
        <div class="cfg-err"></div>
        <div class="dialog-actions"><button type="submit" class="btn-create">${tr('Create & connect')}</button></div>`;
      body.appendChild(form);
      const err = form.querySelector('.cfg-err');
      form.onsubmit = async (e) => {
        e.preventDefault(); err.textContent = '';
        const payload = { name: form.querySelector('[name="name"]').value.trim() };
        for (const el of form.querySelectorAll('input:not([name="name"])')) payload[el.name] = el.value;
        let r;
        try { r = await api(`/api/mounts/${m.id}/duplicate`, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } }); }
        catch (e2) { err.textContent = e2.message || 'Failed'; return; }
        if (r?.id) await api(`/api/mounts/${r.id}/mount`, { method: 'POST' }).catch(() => {});
        close(); this._renderMounts();
      };
    },

    _showMintShareDialog(m) {
      const under = `${m.bucket}${m.prefix ? '/' + m.prefix : ''}`;
      const mc = this._mountsData?.mcAvailable;
      this._mountsDialog(`Share a folder from “${m.name}”`, [
        { key: 'name', label: 'Share name', placeholder: 'dataset-v2', value: m.name + '-share' },
        { key: 'folder', label: `Folder under ${under} (empty = share everything)`, placeholder: 'datasets/v2' },
        { key: 'mode', label: 'Access', type: 'select', options: [['ro', 'Read-only'], ['rw', 'Read-write']] },
        ...(mc ? [] : [{ key: 'expiryDays', label: 'Link expires after (days, max 7)', value: '7' }]),
      ], 'Create link', async (v, { close, body, err }) => {
        const r = await api(`/api/mounts/${m.id}/share`, { method: 'POST', body: JSON.stringify(v), headers: { 'Content-Type': 'application/json' } });
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
