// Sidebar "Mounts" tab — rclone S3 mounts + share minting (collaboration P1).
// Third tab next to Folders | Groups: my-storage card (env-provisioned),
// mount list with live status, share-a-folder minting, import-a-link.
import { createModalShell, showToast, showConfirmDialog, showContextMenu, copyText, escHtml } from './utils.js';
import { setupDirAutocomplete } from './autocomplete.js';
import { t as tr } from './i18n.js'; // sidebar cluster convention: local `t` is pervasively a task var

// 16x16 stroke icons (project convention — no emoji in chrome)
const MI = {
  // Directional folder icons (user feedback: one 📁 carried THREE meanings).
  // folderPush = send OUR folder TO the machine (arrow leaving the folder up),
  // folderPull = bring the DEVICE's folder HERE (arrow coming down into it),
  // folderOpen = just open it in Files.
  folderPush: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h4l2 2h6v3M2 3v10h5"/><path d="M11.5 14v-4M9.5 12l2-2 2 2"/></svg>',
  folderPull: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h4l2 2h6v3M2 3v10h5"/><path d="M11.5 8v4M9.5 10l2 2 2-2"/></svg>',
  retry: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2v3h-3"/></svg>',
  folder: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h4l2 2h6v8H2V3z"/></svg>',
  eject: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l5-5 5 5H3z"/><path d="M3 12h10"/></svg>',
  plug: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v6"/><path d="M4.7 4.6a4.9 4.9 0 1 0 6.6 0"/></svg>',
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
        if ((msg.type === 'mounts-updated' || msg.type === 'machine-mounts-updated' || msg.type === 'hosts-updated') && this._activeTab === 'mounts') this._renderMounts();
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
      let mt, mm;
      try { [d, hd, mt, mm] = await Promise.all([api('/api/mounts'), api('/api/hosts'), api('/api/mount-tokens').catch(() => ({ tokens: [] })), api('/api/machine-mounts').catch(() => ({ mounts: [] }))]); }
      catch { this.listEl.innerHTML = '<div class="mounts-loading">Failed to load</div>'; return; }
      if (this._activeTab !== 'mounts') return; // user switched away mid-fetch
      d.mountTokens = mt?.tokens || [];
      this._machineMountsData = mm?.mounts || []; // push AND pull mounts, keyed by hostId (B-f3e8)
      this._mountsData = d;
      this._hostsData = hd;
      this.listEl.innerHTML = '';
      const root = document.createElement('div');
      root.className = 'mounts-panel';

      // ── Machines section (B-f3e8 one machine model: local + ssh + dial) ──
      const hHead = document.createElement('div');
      hHead.className = 'mounts-sec-head';
      hHead.innerHTML = `${escHtml(tr('Machines'))}<span class="mounts-sec-sub">${escHtml(tr('Run agent sessions on this or other computers'))}</span>`;
      root.appendChild(hHead);
      {
        const hlist = document.createElement('div');
        hlist.className = 'mounts-list';
        hlist.appendChild(this._buildLocalMachineRow());
        // ONE machine model (B-f3e8): every machine — ssh host or dial-out
        // device — is a host record rendered by the SAME builder; its mounts
        // (both directions) are children keyed by hostId.
        for (const h of hd.hosts) {
          hlist.appendChild(this._buildHostRow(h));
          for (const m of this._machineMountsData.filter((m) => m.hostId === h.id)) {
            hlist.appendChild(this._buildMachineMountRow(h, m));
          }
        }
        root.appendChild(hlist);
        this._autoTestHosts(hd.hosts.filter((h) => h.transport !== 'dial'), hlist);
      }
      // Orphan mounts: mounts whose machine was removed (or none listed).
      // Without this they'd be invisible AND unmanageable (review finding).
      const liveHostIds = new Set(hd.hosts.map((h) => h.id));
      const orphans = this._machineMountsData.filter((m) => !liveHostIds.has(m.hostId));
      if (orphans.length) {
        const olist = document.createElement('div');
        olist.className = 'mounts-list';
        olist.appendChild(Object.assign(document.createElement('div'), { className: 'empty-hint empty-hint-inline', textContent: tr('Mounts on removed machines — unmount to clean up') }));
        for (const m of orphans) olist.appendChild(this._buildMachineMountRow({ id: m.hostId, name: tr('(removed machine)') }, m));
        root.appendChild(olist);
      }
      const addHost = document.createElement('button');
      addHost.className = 'mounts-action';
      addHost.innerHTML = `<span class="mounts-action-icon">${MI.server}</span><span>${escHtml(tr('Add machine'))}</span>`;
      addHost.onclick = () => this._showAddHostDialog(hd);
      root.appendChild(addHost);
      // Dial-out DEVICE pairing (B-e5e7): the no-ssh path — laptops/Macs
      // behind NAT dial OUT to this instance (docs/device-agent.md).
      const pairDev = document.createElement('button');
      pairDev.className = 'mounts-action';
      pairDev.innerHTML = `<span class="mounts-action-icon">${MI.plus}</span><span>${escHtml(tr('Pair a device (no ssh — it dials out)'))}</span>`;
      pairDev.onclick = () => this._showDevicePairDialog();
      root.appendChild(pairDev);

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
        list.innerHTML = `<div class="mounts-empty">${escHtml(tr('Nothing connected yet. Click “Connect storage” below to add a cloud folder (S3, Google Drive, Nextcloud, SFTP…), or “Import share link” to open a folder someone shared with you.'))}</div>`;
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
        sh.innerHTML = `<div class="mounts-sec-head">${escHtml(tr('Shares I created'))}</div>`;
        for (const s of d.shares) {
          const row = document.createElement('div');
          row.className = 'mounts-share-row';
          const exp = s.expiresAt ? ` · expires ${new Date(s.expiresAt).toLocaleDateString()}` : '';
          const sub = s.kind === 'cephmount'
            ? `${escHtml(s.path || '')} · ${s.mode === 'ro' ? tr('Read-only') : tr('Read-write')} · ${escHtml(tr('direct CephFS'))}`
            : `${escHtml(s.prefix || s.bucket || '')} · ${s.mode === 'ro' ? tr('Read-only') : tr('Read-write')} · ${s.method === 'sts' ? tr('expires in 7 days') : tr('no expiry')}${exp}`;
          row.innerHTML = `<span class="mounts-share-text"><b>${escHtml(s.name)}</b><span>${sub}</span></span>`;
          const rm = document.createElement('button');
          rm.className = 'mounts-btn mounts-btn-danger';
          rm.textContent = tr('Revoke');
          rm.onclick = async () => {
            const ok = await showConfirmDialog({ title: tr('Revoke share?'), message: tr('Everyone who imported "{name}" loses access immediately.', { name: s.name }), confirmText: tr('Revoke'), danger: true });
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
        action(MI.plus, tr('Connect storage'), () => this._showAddMountDialog()),
        action(MI.importL, tr('Import share link'), () => this._showImportShareDialog()),
        action(MI.importL, tr('Import rclone config'), () => this._showRcloneConfDialog()),
        action(MI.server, tr('Share a local folder'), () => this._showBridgeShareDialog(), {
          title: 'Create a link that lets another VibeSpace open a folder from this computer.',
        }),
      );
      root.appendChild(foot);
      // Bridge tokens I minted (revocable)
      if ((d.mountTokens || []).length) {
        const bt = document.createElement('div');
        bt.className = 'mounts-shares';
        bt.innerHTML = `<div class="mounts-sec-head">${escHtml(tr('Bridge tokens'))}</div>`;
        for (const t of d.mountTokens) {
          const row = document.createElement('div');
          row.className = 'mounts-share-row';
          // classify by the STRUCTURED kind/owner (2.162.2), not a name hack
          const isReverse = t.kind === 'reverse-mount';
          const hostRec = isReverse && t.owner && (hd.hosts || []).find((x) => x.id === t.owner);
          const title = hostRec ? tr('Reverse-mount token — "{name}" accesses {root}', { name: hostRec.name, root: t.root })
            : isReverse ? tr('Reverse-mount token (machine removed) — {root}', { root: t.root })
            : t.name;
          const subNote = isReverse
            ? tr('{mode} · revoking breaks that machine’s mount', { mode: t.mode === 'ro' ? tr('Read-only') : tr('Read-write') })
            : `${t.root} · ${t.mode === 'ro' ? tr('Read-only') : tr('Read-write')}`;
          row.innerHTML = `<span class="mounts-share-text"><b>${escHtml(title)}</b><span>${escHtml(subNote)}</span></span>`;
          const rm = document.createElement('button');
          rm.className = 'mounts-btn mounts-btn-danger';
          rm.textContent = tr('Revoke');
          rm.onclick = async () => {
            const ok = await showConfirmDialog({ title: tr('Revoke bridge token?'), message: tr('Anyone mounting "{name}" loses access immediately.', { name: t.name }), confirmText: tr('Revoke'), danger: true })
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
        ? tr('Connected folders live under {base}. Shared links stay valid until you revoke them.', { base: d.mountBase })
        : tr('Connected folders live under {base}. Shared links currently expire after 7 days; to create links that never expire, an admin can install the “mc” tool on the server.', { base: d.mountBase });
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
          ibtn(MI.eject, m.type === 'gmail' ? tr('Stop syncing (synced emails stay)') : 'Disconnect', () => api(`/api/mounts/${m.id}/unmount`, { method: 'POST' })),
        );
      } else if (!isCred) {
        // Power icon (⏻) in the same icon-button family — the old glyph read
        // as a "download" button and a text chip among icons read worse
        // (user feedback, twice). The ROW itself is also click-to-connect.
        actions.append(ibtn(MI.plug, tr('Connect'), async () => {
          const r = await api(`/api/mounts/${m.id}/mount`, { method: 'POST' });
          if (!r.success) throw new Error('Couldn’t connect — hover the status dot for details');
        }, 'mounts-icon-accent'));
      }
      // Share a folder FROM this connection — S3 (STS/service-account link) or
      // CephFS My storage (direct kernel-mount link, minted path-scoped key).
      if (m.canShare || m.canCephShare) {
        const shareBtn = document.createElement('button');
        shareBtn.className = 'mounts-icon-btn';
        shareBtn.innerHTML = MI.link;
        shareBtn.title = tr('Share a folder from this storage (creates a link)');
        shareBtn.onclick = (e) => { e.stopPropagation(); if (m.canCephShare) this._showCephShareDialog(m); else this._showMintShareDialog(m); };
        actions.append(shareBtn);
      }
      // EVERY top-level storage can act as a credential (user directive):
      // ＋ adds a submount (remote:path) under it, for types with a path notion.
      if (!m.parentId && ['s3', 'rclone', 'drive', 'onedrive', 'sftp', 'cloud'].includes(m.type || 's3')) {
        actions.append(ibtn(MI.plus, tr('Add a submount (a specific bucket/path of this storage)'), () => { this._showAddChildDialog(m); }, isCred ? 'mounts-icon-accent' : ''));
      }
      actions.append(ibtn(MI.pencil, 'Edit connection (path, credentials, name)', () => { this._showEditMountDialog(m); }));
      // Duplicate + Remove used to live here as row icons — duplicate is
      // superseded by submounts, and Remove moved into the Edit dialog
      // (user directive: fewer per-row icons).
      top.appendChild(actions);
      // Detail line: [TYPE] → /mount/path — the type tag rides HERE instead
      // of the name row (user directive: keep the first line lean). Shown for
      // every type incl. s3; a credential-only row shows its remote source.
      const pathEl = document.createElement('div');
      pathEl.className = 'mounts-path';
      pathEl.title = isCred ? (m.source || '') : `${m.source || ''} → ${m.path}`;
      const tag = document.createElement('span');
      tag.className = 'mounts-typetag';
      tag.textContent = { s3: 'S3', drive: 'Drive', onedrive: 'OneDrive', gmail: 'Gmail', cloud: (m.source || 'Cloud').split(':')[0], webdav: 'WebDAV', sftp: 'SFTP', vibespace: 'VibeSpace', cephfs: 'CephFS', rclone: (m.source || 'rclone').split(':')[0] }[m.type || 's3'] || m.type;
      // The path keeps its rtl left-truncation trick in its OWN span — the
      // chip must stay outside the rtl context or bidi reorders it to the end.
      const pt = document.createElement('span');
      pt.className = 'mounts-path-text';
      pt.textContent = isCred ? (m.source || '') : m.path;
      pathEl.append(tag, pt);
      row.append(top, pathEl);
      // Gmail rows: this is a SYNC, not a filesystem — say so, with a live
      // progress bar while a pass is fetching (server broadcasts throttled
      // mounts-updated during the pass, so this re-renders as it moves).
      if (m.type === 'gmail' && !m.parentId) {
        const sync = document.createElement('div');
        sync.className = 'mounts-syncline';
        const prog = m.gmailProgress;
        if (m.mounted && prog && prog.total > 0) {
          const pct = Math.min(100, Math.round((prog.done / prog.total) * 100));
          sync.innerHTML = `<span class="mounts-sync-label">${escHtml(tr('Syncing {done}/{total}…', { done: prog.done, total: prog.total }))}</span>
            <span class="mounts-syncbar"><i style="width:${pct}%"></i></span>`;
        } else if (m.mounted && m.gmailState === 'syncing') {
          sync.innerHTML = `<span class="mounts-sync-label">${escHtml(tr('Checking for new mail…'))}</span>
            <span class="mounts-syncbar mounts-syncbar-ind"><i></i></span>`;
        } else if (m.mounted) {
          const when = m.lastSyncAt ? new Date(m.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          sync.textContent = tr('Synced — {n} emails', { n: m.gmailCount ?? 0 }) + (when ? ` · ${when}` : '') + (m.email ? ` · ${m.email}` : '');
        } else {
          sync.textContent = tr('Sync paused — emails stay in the folder; connect to resume');
        }
        row.appendChild(sync);
      }
      // Row body = the primary action users try anyway: a disconnected row
      // CONNECTS on click, a mounted row opens its folder. Buttons/expanders
      // inside keep their own handlers.
      if (!isCred) {
        row.classList.add('mounts-row-clickable');
        row.setAttribute('data-tip', m.mounted ? tr('Open in file explorer') : tr('Click to connect'));
        row.onclick = async (e) => {
          if (e.target.closest('button, a, input, details, .mounts-row-actions')) return;
          if (m.mounted) { this.app.openFileExplorer(m.path); return; }
          row.style.opacity = '0.6';
          try {
            const r = await api(`/api/mounts/${m.id}/mount`, { method: 'POST' });
            if (!r.success) throw new Error('Couldn’t connect — hover the status dot for details');
          } catch (err2) { showToast(err2.message || 'Failed', { type: 'error' }); }
          this._renderMounts();
        };
      }
      if (m.error) {
        const err = document.createElement('div');
        err.className = 'mounts-errline';
        // no aggressive truncation — our own messages are meaningful to the
        // END (user report: "…disconnected to protect the s" cut mid-word);
        // 300 caps only pathological rclone log tails, full text in title
        err.textContent = tr('Couldn’t connect:') + ' ' + m.error.slice(0, 300);
        err.title = m.error;
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

    _isDriveBacked(m) { return m.type === 'drive' || m.type === 'onedrive' || m.type === 'cloud' || (m.type === 'rclone' && m.rcloneType === 'drive'); },

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

    // Add a submount under any storage — the rclone remote:path model:
    // the parent connection is the part before the colon, this adds the path.
    _showAddChildDialog(cred) {
      const type = cred.type || 's3';
      const pathField = type === 's3' ? { key: 'bucket', label: tr('Bucket'), placeholder: 'bucket-name' }
        : type === 'rclone' ? { key: 'remotePath', label: tr('Remote path (bucket[/prefix])'), placeholder: 'bucket-name/optional/prefix' }
        : type === 'drive' ? { key: 'driveFolder', label: tr('Folder path'), placeholder: 'My Folder/sub' }
        : type === 'onedrive' ? { key: 'remotePath', label: tr('Folder path'), placeholder: 'Documents/sub' }
        : type === 'sftp' ? { key: 'sshPath', label: tr('Remote path'), placeholder: '/data' }
        : null;
      if (!pathField) { showToast(tr('This storage type doesn’t support submounts'), { type: 'error' }); return; }
      this._mountsDialog(tr('New submount under "{name}"', { name: cred.name }), [
        { key: 'name', label: tr('Name'), value: `${cred.name}-`, placeholder: 'datasets' },
        { key: pathField.key, label: pathField.label, placeholder: pathField.placeholder },
        ...(type === 's3' ? [{ key: 'prefix', label: tr('Prefix (optional)'), placeholder: 'sub/path' }] : []),
        ...(type === 'drive' ? [
          // Submounts are the natural home for cloud-side scopes (user
          // insight): ONE authorized credential, N children each pointing at
          // My Drive / a Shared drive / shared-with-me — no re-auth ever
          // (each child runs its own rclone daemon+env over the parent creds).
          { key: 'driveMode', label: tr('Cloud-side scope'), type: 'select',
            options: [['mydrive', 'My Drive'], ['shared-with-me', tr('Shared with me')], ['shared-drive', tr('Shared drive (team)')]] },
          { key: 'teamDriveId', label: tr('Shared drive'), placeholder: tr('click “List shared drives” or paste an id'), when: (v) => v.driveMode === 'shared-drive' },
          { key: 'rootFolderId', label: tr('Folder ID (advanced — mount ONE shared folder)'), placeholder: '1AbC…',
            hint: tr('From the folder’s Drive URL. Mounts just that folder — the way to mount a single folder someone shared with you (keep scope = My Drive).'),
            when: (v) => v.driveMode !== 'shared-drive' },
        ] : []),
        { key: 'customPath', label: tr('Mount point (blank = default)'), placeholder: '/absolute/path' },
        { key: 'mode', label: tr('Access'), type: 'select', options: [['rw', 'Read-write'], ['ro', 'Read-only']] },
      ], tr('Create & connect'), async (v, { close }) => {
        const r = await api(`/api/mounts/${cred.id}/children`, { method: 'POST', body: JSON.stringify(v) });
        try { await api(`/api/mounts/${r.id}/mount`, { method: 'POST' }); }
        catch (e) { showToast(e.message || tr('Created, but connecting failed — check the path'), { type: 'error' }); }
        close(); this._renderMounts();
      });
      // Shared-drive picker over the PARENT's stored credentials (id-based)
      if (type === 'drive') this._wireSharedDrivePicker(this._lastMountsDialog, cred.id);
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

    // This machine as machine #0 (B-f3e8 ⑤): the local device is the same
    // architecture as every other machine (its sessions run in the local
    // daemon since the CS graduation) — the list says so. Presentation-level;
    // sessions/files paths keep their local fast paths.
    _buildLocalMachineRow() {
      const row = document.createElement('div');
      row.className = 'mounts-row';
      const top = document.createElement('div');
      top.className = 'mounts-row-top';
      top.innerHTML = `
        <span class="mounts-dot mounts-dot-ok" title="${escHtml(tr('This VibeSpace instance'))}"></span>
        <b class="mounts-name">${escHtml(tr('This machine'))}</b>
        <span class="mounts-badge" title="${escHtml(tr('The machine VibeSpace itself runs on — sessions and files here need no transport'))}">${escHtml(tr('LOCAL'))}</span>`;
      const actions = document.createElement('span');
      actions.className = 'mounts-row-actions';
      const nb = document.createElement('button');
      nb.className = 'mounts-icon-btn';
      nb.innerHTML = MI.termNew; nb.title = tr('New session on this machine');
      nb.onclick = (e) => { e.stopPropagation(); this.app.showNewSessionDialog?.({}); };
      actions.append(nb);
      top.appendChild(actions);
      const sub = document.createElement('div');
      sub.className = 'mounts-path';
      sub.style.direction = 'ltr';
      sub.textContent = tr('local · runs this VibeSpace');
      row.append(top, sub);
      return row;
    },

    // ONE row builder for every machine (B-f3e8): transport ssh (default) or
    // dial. Status source differs (ssh = probe result, dial = live dialed-in
    // link), actions differ only where a capability genuinely differs (dial
    // has no Set-up — the pair command installs everything).
    _buildHostRow(h) {
      const isDial = h.transport === 'dial';
      const row = document.createElement('div');
      row.className = 'mounts-row';
      row._hostId = h.id; // in-place replacement key (_autoTestHosts)
      const st = this._hostStatus?.[h.id]; // {ok, latencyMs, tools} | {error} | undefined
      const dot = isDial ? (h.online ? 'ok' : 'off') : (st ? (st.ok ? 'ok' : 'err') : 'off');
      const dotTip = isDial
        ? (h.online ? tr('Dialed in — reachable now') : tr('Offline — the device’s daemon is not dialed in (start it with the install command)'))
        : (st ? (st.ok ? `${st.latencyMs}ms` : (st.error || 'unreachable')) : 'Not tested yet');
      const nameTip = isDial ? tr('Dial-out device — it connects TO this instance over a websocket (no ssh)') : `${h.user}@${h.host}:${h.port}`;
      const badge = isDial
        ? `<span class="mounts-badge${h.online ? '' : ' mounts-badge-red'}" title="${escHtml(tr('Dial-out device — it connects TO this instance over a websocket (no ssh)'))}">${h.online ? escHtml(tr('DEVICE')) : escHtml(tr('OFFLINE'))}</span>`
        : (st?.ok && st.tools ? `<span class="mounts-badge${st.tools.claude && st.tools.dtach ? '' : ' mounts-badge-red'}" title="Ready to run sessions — dtach ${st.tools.dtach ? '✓' : '✗ (missing)'}, Node ${st.tools.node ? '✓' : '✗ (missing)'}, Claude ${st.tools.claude ? '✓' : '✗ (missing)'}. Click Set up to install what’s missing.">${st.tools.claude && st.tools.dtach ? 'READY' : 'NEEDS SETUP'}</span>` : '');
      const top = document.createElement('div');
      top.className = 'mounts-row-top';
      top.innerHTML = `
        <span class="mounts-dot mounts-dot-${dot}" title="${escHtml(dotTip)}"></span>
        <b class="mounts-name" title="${escHtml(nameTip)}">${escHtml(h.name)}</b>
        ${badge}`;
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
            if (r.dial) {
              const i = r.info || {};
              showToast(tr('{id} reachable — agent {v} on {plat}', { id: h.name, v: i.daemonVersion || '?', plat: [i.platform, i.arch].filter(Boolean).join('/') || '?' }));
            } else {
              const t = r.tools || {};
              const tools = ['dtach', 'node', 'claude', 'codex'].filter(k => t[k]);
              showToast(`${h.name} reachable · ${r.latencyMs}ms · ${tools.length ? tools.join(', ') : 'not set up yet — click Set up'}`);
            }
          } catch (e) { this._hostStatus[h.id] = { ok: false, error: e.message }; throw e; }
        }),
      );
      if (!isDial) actions.append(ibtn(MI.wrench, 'Set up (install the tools needed to run agents)', () => { this._showBootstrapDialog(h); }));
      actions.append(
        ibtn(MI.folderPush, tr('Mount a folder from this VibeSpace onto "{name}"', { name: h.name }), () => { this._showHostMountDialog(h); }),
        ibtn(MI.folderPull, tr('Mount a folder from "{name}" into this VibeSpace', { name: h.name }), () => { this._showMachinePullDialog(h); }),
        ibtn(MI.plug, tr('Forward a port from "{name}" (open its dev servers here)', { name: h.name }), () => { this._showPortsDialog(h); }),
        ibtn(MI.termNew, isDial ? tr('New session on this device') : 'New session on this host', () => { this.app.showNewSessionDialog?.({ hostId: h.id, hostName: h.name }); }),
        ibtn(MI.cross, isDial ? tr('Unpair (the device can no longer dial in)') : 'Remove host', async () => {
          const ok = await showConfirmDialog(isDial
            ? { title: tr('Unpair "{id}"?', { id: h.name }), message: tr('Its dial token is revoked; re-pairing mints a new one. Its mounted folders here are unmounted.'), confirmText: tr('Unpair'), danger: true }
            : { title: `Remove "${h.name}"?`, message: 'Only the registry entry goes away — nothing on the remote machine is touched.', confirmText: 'Remove', danger: true });
          if (ok) { await api(`/api/hosts/${h.id}`, { method: 'DELETE' }); if (isDial) showToast(tr('Unpaired')); }
        }, 'mounts-icon-danger'),
      );
      top.appendChild(actions);
      const sub = document.createElement('div');
      sub.className = 'mounts-path';
      sub.style.direction = 'ltr';
      if (isDial) {
        sub.textContent = h.online ? tr('dial-out device · connected') : tr('dial-out device · offline — run the install command on it');
      } else {
        const keyLabel = h.keySource === 'imported' ? tr('using imported key')
          : h.keySource === 'app' ? tr('using VibeSpace key')
          : h.keySource === 'default' ? tr('using system ssh keys')
          : (h.keyPath ? tr('using stored key') : ''); // pre-2.153.4 records: provenance unknown
        sub.textContent = `${h.user}@${h.host}${h.port !== 22 ? ':' + h.port : ''}${keyLabel ? ' · ' + keyLabel : ''}`;
      }
      row.append(top, sub);
      return row;
    },

    // A machine-mount child row (B-f3e8 — BOTH directions, one builder):
    //   push (dir:'push'): one of THIS instance's folders mounted on the
    //     machine — badge shows the transport (tunnel/address), eject unmounts.
    //   pull (dir:'pull'): the machine's folder mounted into THIS workspace —
    //     3-state dot (live / machine-online / offline), remount ↻ when down,
    //     open-in-Files, unmount.
    _buildMachineMountRow(h, m) {
      const row = document.createElement('div');
      row.className = 'mounts-row mounts-row-child';
      const top = document.createElement('div');
      top.className = 'mounts-row-top';
      const actions = document.createElement('span');
      actions.className = 'mounts-row-actions';
      if (m.dir === 'pull') {
        const state = m.live ? 'ok' : (m.online ? 'off' : 'err');
        top.innerHTML = `
          <span class="mounts-dot mounts-dot-${state}" title="${m.live ? escHtml(tr('Mounted')) : escHtml(tr('Pending — remounts when the machine is reachable'))}"></span>
          <b class="mounts-name" title="${escHtml(h.name || m.hostId)}:${escHtml(m.remotePath)} → ${escHtml(m.mountpoint)}">${escHtml(m.remotePath.split('/').pop() || m.remotePath)}</b>
          <span class="mounts-badge" title="${escHtml(tr('Mounted at {mp} (read-only, over the device link)', { mp: m.mountpoint }))}">${escHtml(tr('from machine'))}</span>`;
        if (!m.live) {
          const re = document.createElement('button');
          re.className = 'mounts-icon-btn';
          re.innerHTML = MI.retry; re.title = m.online ? tr('Remount now') : tr('Remount (machine is offline — start its daemon first)');
          re.onclick = async (e) => {
            e.stopPropagation(); re.disabled = true;
            try { await api(`/api/machine-mounts/${encodeURIComponent(m.id)}/remount`, { method: 'POST' }); showToast(tr('Mounted')); }
            catch (err) { showToast(err.message, { type: 'error' }); }
            this._renderMounts();
          };
          actions.append(re);
        }
        const open = document.createElement('button');
        open.className = 'mounts-icon-btn';
        open.innerHTML = MI.folder; open.title = tr('Open in Files');
        open.onclick = () => this.app.openFileExplorer?.(m.mountpoint);
        actions.append(open);
      } else {
        const viaLabel = m.via === 'tunnel' ? tr('via tunnel') : tr('via address');
        const viaTip = m.via === 'tunnel'
          ? tr('Rides the device agent link — no public address or VPN needed')
          : tr('Reached over the instance public address (no device agent on this host)');
        // the push dot was hardcoded 'ok' and kept glowing green while the
        // machine was OFFLINE (real report: 薛定谔的连接) — for dial machines
        // the tunnel dies with the link, so the dot follows h.online
        const pushDown = h.transport === 'dial' && !h.online;
        const pushDotTip = pushDown
          ? tr('Machine is offline — the tunnel is down; the mount heals when its daemon reconnects')
          : (m.mode === 'rw' ? tr('Read-write') : tr('Read-only'));
        top.innerHTML = `
          <span class="mounts-dot mounts-dot-${pushDown ? 'err' : 'ok'}" title="${escHtml(pushDotTip)}"></span>
          <b class="mounts-name" title="${escHtml(m.folder)}">${escHtml(m.folder.split('/').pop() || m.folder)}</b>
          <span class="mounts-badge" title="${escHtml(viaTip)}">${escHtml(tr('on machine'))} · ${escHtml(viaLabel)}</span>`;
      }
      const un = document.createElement('button');
      un.className = 'mounts-icon-btn mounts-icon-danger';
      un.innerHTML = m.dir === 'pull' ? MI.cross : MI.eject;
      un.title = m.dir === 'pull' ? tr('Unmount') : tr('Unmount from this machine');
      un.onclick = async (e) => {
        e.stopPropagation(); un.disabled = true;
        try { await api(`/api/machine-mounts/${encodeURIComponent(m.id)}`, { method: 'DELETE' }); showToast(tr('Unmounted')); }
        catch (err) { showToast(err.message || 'Failed', { type: 'error' }); }
        this._renderMounts();
      };
      actions.append(un);
      top.appendChild(actions);
      const sub = document.createElement('div');
      sub.className = 'mounts-path';
      sub.style.direction = 'ltr';
      sub.textContent = `→ ${m.mountpoint}`;
      row.append(top, sub);
      return row;
    },

    // Mount one of THIS instance's folders onto a remote host (reverse mount).
    // Primary transport = the device tunnel (NAT-proof, no public address);
    // falls back to the instance public address only for hosts without the device agent.
    // Pick a machine to mount a folder onto (from the folder right-click, where
    // no host is chosen yet). One machine → straight to the mount dialog.
    async _showHostMountPicker(folder) {
      let hosts = [];
      try { hosts = (await api('/api/hosts')).hosts || []; } catch {}
      if (!hosts.length) { showToast(tr('No remote machines yet — add one in the Remote tab'), { type: 'error' }); return; }
      if (hosts.length === 1) return this._showHostMountDialog(hosts[0], folder);
      this._mountsDialog(tr('Mount this folder onto a machine'), [
        { key: 'hostId', label: tr('Machine'), type: 'select', options: hosts.map((h) => [h.id, h.name]) },
        { key: 'folder', label: tr('Folder on THIS instance to mount'), value: folder || '', autocomplete: 'local' },
        { key: 'mode', label: tr('Access'), type: 'select', options: [['ro', tr('Read-only')], ['rw', tr('Read-write')]] },
      ], tr('Mount'), async (v, { close }) => {
        if (!v.folder) throw new Error(tr('Choose a folder to share'));
        const h = hosts.find((x) => x.id === v.hostId) || { id: v.hostId, name: v.hostId };
        const r = await api(`/api/machine-mounts/${v.hostId}`, { method: 'POST', body: JSON.stringify({ dir: 'push', folder: v.folder, mode: v.mode }) });
        close();
        const via = r.via === 'tunnel' ? tr('over the device tunnel') : tr('over the public address');
        showToast(tr('Mounted at {mp} on {name} ({via})', { mp: r.mountpoint, name: h.name, via }));
        this._renderMounts?.();
      });
    },

    _showHostMountDialog(h, prefillFolder) {
      this._mountsDialog(tr('Share a folder onto "{name}"', { name: h.name }), [
        { key: 'folder', label: tr('Folder on THIS instance to mount on the machine'), placeholder: '/home/me/project', autocomplete: 'local', value: prefillFolder || '' },
        { key: 'mode', label: tr('Access'), type: 'select', options: [['ro', tr('Read-only')], ['rw', tr('Read-write')]] },
        { key: 'mountpoint', label: tr('Mount point on the machine (optional)'), placeholder: tr('default: ~/vibespace-remote/<folder>') },
      ], tr('Mount'), async (v, { close }) => {
        if (!v.folder) throw new Error(tr('Choose a folder to share'));
        const r = await api(`/api/machine-mounts/${h.id}`, { method: 'POST', body: JSON.stringify({ dir: 'push', folder: v.folder, mode: v.mode, mountpoint: v.mountpoint || undefined }) });
        close();
        const via = r.via === 'tunnel' ? tr('over the device tunnel') : tr('over the public address');
        showToast(tr('Mounted at {mp} on {name} ({via})', { mp: r.mountpoint, name: h.name, via }));
        this._renderMounts();
      });
    },

    // The PULL direction on any machine row (B-f3e8 — ONE dialog for ssh and
    // dial): the machine's folder mounted into this workspace over the device
    // link (read-only). Path autocompletes against the MACHINE's own
    // filesystem (real report: it completed LOCAL folders). ssh machines keep
    // a read-write escape hatch — an SFTP storage mount (dial has no ssh).
    _showMachinePullDialog(h) {
      const isDial = h.transport === 'dial';
      const fields = [
        { key: 'remotePath', label: tr('Folder on the machine (absolute path)'), placeholder: isDial ? '/Users/me/Documents' : `/home/${h.user || 'me'}`, autocomplete: () => `/api/hosts/${h.id}/dir-complete` },
        { key: 'mountpoint', label: tr('Mount point here (optional)'), placeholder: tr('default: ~/vibespace-machines/<machine>-<folder>') },
      ];
      if (!isDial) fields.push({ key: 'access', label: tr('Access'), type: 'select', options: [['ro', tr('Read-only (device link)')], ['rw', tr('Read-write (SFTP over ssh)')]] });
      this._mountsDialog(tr('Mount a folder from "{name}" into this VibeSpace', { name: h.name }), fields, tr('Mount'), async (v, { close }) => {
        if (!v.remotePath) throw new Error(tr('Enter the folder path on the machine'));
        if (!isDial && v.access === 'rw') {
          // read-write wanted → the SFTP storage-mount path (ssh only)
          const base = v.remotePath.split('/').filter(Boolean).pop() || 'files';
          const r = await api('/api/mounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            type: 'sftp', name: `${h.name}: ${base}`,
            sshHost: h.host, sshUser: h.user, sshPort: h.port || 22,
            keyPath: h.keyPath || undefined, sshPath: v.remotePath,
          }) });
          await fetch(`/api/mounts/${r.id}/mount`, { method: 'POST' });
          close(); showToast(tr('Storage connected')); this._renderMounts();
          return;
        }
        const r = await api(`/api/machine-mounts/${h.id}`, { method: 'POST', body: JSON.stringify({ dir: 'pull', remotePath: v.remotePath, mountpoint: v.mountpoint || undefined }) });
        close();
        showToast(tr('Mounted at {mp} (read-only, over the device link)', { mp: r.mountpoint }));
        this._renderMounts();
      });
    },

    // Port forwarding (B-0b60 tunnel path): expose a machine's loopback dev
    // server here over the device link. Detected ports + a manual box; each
    // becomes http://127.0.0.1:<localPort> opened in the embedded browser.
    async _showPortsDialog(h) {
      const { body, close } = createModalShell({ id: 'ports-dialog', title: tr('Forward a port from "{name}"', { name: h.name }), bodyClass: 'mounts-dialog-body', escapeToClose: true });
      // The forward binds on THIS SERVER's loopback (the browser can't reach
      // it directly), so "Open" routes through the embedded browser's proxy
      // (node-unblocker on the server → the server's loopback → the tunnel).
      const openForward = (url) => { if (url) { this.app.openBrowser?.(url, { proxy: true }); close(); } };
      // is the frp relay (public URLs) available on this instance?
      let frpOk = false;
      try { frpOk = ((await api('/api/plugins')).plugins || []).some((p) => p.id === 'frp' && p.configured); } catch {}
      const render = async () => {
        body.innerHTML = `<p class="empty-hint" style="margin:0 0 8px">${escHtml(tr('A service listening on this machine’s 127.0.0.1 becomes reachable here (opened through the app’s proxy). Runs over the device link — no public exposure.'))}</p>`;
        // active forwards for this machine
        let active = [];
        try { active = ((await api('/api/port-forwards')).forwards || []).filter((f) => f.hostId === h.id); } catch {}
        if (active.length) {
          const sec = document.createElement('div'); sec.style.marginBottom = '10px';
          sec.innerHTML = `<div class="usage-section-title">${escHtml(tr('Active'))}</div>`;
          for (const f of active) {
            const r = document.createElement('div'); r.className = 'mounts-row'; r.style.padding = '4px 0'; r.style.flexWrap = 'wrap';
            const info = document.createElement('span'); info.style.flex = '1'; info.style.minWidth = '160px';
            info.innerHTML = `<b>:${f.remotePort}</b> → <span class="mounts-name" style="color:var(--accent)">127.0.0.1:${f.localPort || '?'}</span>${f.error ? ` <span style="color:var(--red,#e55)">(${escHtml(f.error)})</span>` : ''}`;
            const open = document.createElement('button'); open.className = 'btn-create'; open.textContent = tr('Open'); open.disabled = !f.url;
            open.onclick = () => openForward(f.url);
            const stop = document.createElement('button'); stop.className = 'mounts-btn'; stop.textContent = tr('Stop');
            stop.onclick = async () => { try { await api(`/api/port-forward/${encodeURIComponent(f.id)}`, { method: 'DELETE' }); render(); } catch (e) { showToast(e.message, { type: 'error' }); } };
            const acts = document.createElement('span'); acts.style.display = 'flex'; acts.style.gap = '6px'; acts.append(open, stop);
            // public exposure (frp relay) — a shareable internet URL
            if (frpOk) {
              const pub = document.createElement('button'); pub.className = 'mounts-btn';
              pub.textContent = f.published ? tr('Stop public') : tr('Publish public');
              pub.title = f.published ? tr('Stop sharing publicly') : tr('Make a public internet URL via the relay (shareable preview link)');
              pub.onclick = async () => {
                pub.disabled = true;
                try {
                  if (f.published) { await api(`/api/port-forward/${encodeURIComponent(f.id)}/publish`, { method: 'DELETE' }); showToast(tr('Public URL removed')); }
                  else { const r2 = await api(`/api/port-forward/${encodeURIComponent(f.id)}/publish`, { method: 'POST' }); showToast(tr('Public URL: {u}', { u: r2.publicUrl })); }
                  render();
                } catch (e) { showToast(e.message, { type: 'error' }); pub.disabled = false; }
              };
              acts.append(pub);
            }
            r.append(info, acts);
            if (f.publicUrl) {
              const pubRow = document.createElement('div'); pubRow.style.cssText = 'flex-basis:100%;display:flex;gap:6px;align-items:center;padding:2px 0 0';
              const link = document.createElement('a'); link.href = '#'; link.textContent = '🌐 ' + f.publicUrl; link.style.cssText = 'color:var(--accent);font-size:11px;text-decoration:none;word-break:break-all';
              link.onclick = (e) => { e.preventDefault(); this.app.openBrowser?.(f.publicUrl); close(); };
              const copy = document.createElement('button'); copy.className = 'mounts-btn'; copy.textContent = tr('Copy'); copy.style.padding = '0 6px';
              copy.onclick = () => { copyText(f.publicUrl); showToast(tr('Copied')); };
              pubRow.append(link, copy); r.append(pubRow);
            }
            sec.append(r);
          }
          body.append(sec);
        }
        // detect + manual
        const manual = document.createElement('div'); manual.style.display = 'flex'; manual.style.gap = '6px'; manual.style.margin = '4px 0 10px';
        const inp = document.createElement('input'); inp.type = 'number'; inp.placeholder = tr('port, e.g. 5173'); inp.className = 'settings-input-text'; inp.style.flex = '1';
        const fwd = document.createElement('button'); fwd.className = 'btn-create'; fwd.textContent = tr('Forward');
        const doForward = async (port) => {
          if (!port) return;
          fwd.disabled = true;
          try { const r = await api(`/api/hosts/${h.id}/port-forward`, { method: 'POST', body: JSON.stringify({ port: Number(port) }) });
            if (r.url) { showToast(tr('Forwarded :{p} → {u}', { p: port, u: r.url })); openForward(r.url); } else render();
          } catch (e) { showToast(e.message, { type: 'error' }); fwd.disabled = false; }
        };
        fwd.onclick = () => doForward(inp.value);
        inp.onkeydown = (e) => { if (e.key === 'Enter') doForward(inp.value); };
        manual.append(inp, fwd); body.append(manual);

        const listWrap = document.createElement('div');
        listWrap.innerHTML = `<div class="usage-section-title">${escHtml(tr('Detected listening ports'))}</div><div class="empty-hint">${escHtml(tr('scanning…'))}</div>`;
        body.append(listWrap);
        try {
          const ports = (await api(`/api/hosts/${h.id}/ports`)).ports || [];
          const forwarded = new Set(active.map((f) => f.remotePort));
          listWrap.innerHTML = `<div class="usage-section-title">${escHtml(tr('Detected listening ports'))}</div>`;
          if (!ports.length) { listWrap.innerHTML += `<div class="empty-hint">${escHtml(tr('no listening TCP ports found'))}</div>`; }
          for (const p of ports) {
            const r = document.createElement('div'); r.className = 'mounts-row'; r.style.padding = '3px 0';
            const lbl = document.createElement('span'); lbl.style.flex = '1'; lbl.innerHTML = `<b>:${p.port}</b>${p.proc ? ` <span class="empty-hint">${escHtml(p.proc)}</span>` : ''}`;
            const b = document.createElement('button'); b.className = 'mounts-btn';
            b.textContent = forwarded.has(p.port) ? tr('forwarded') : tr('Forward'); b.disabled = forwarded.has(p.port);
            b.onclick = () => doForward(p.port);
            r.append(lbl, b); listWrap.append(r);
          }
        } catch (e) {
          listWrap.innerHTML = `<div class="usage-section-title">${escHtml(tr('Detected listening ports'))}</div><div class="empty-hint" style="color:var(--red,#e55)">${escHtml(e.message)}</div>`;
        }
      };
      render();
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

    // Pair a NAT'd machine as a dial-out DEVICE (B-e5e7, docs/device-agent.md):
    // mint a device id + dial token (POST /api/device/dial-pair) and hand the
    // user the exact one-line installer command. Machines you can ssh into
    // never need this — Add machine installs the agent over ssh at first use.
    _showDevicePairDialog() {
      const { body, close } = createModalShell({ id: 'device-pair-dialog', title: tr('Pair a device'), escapeToClose: true });
      const note = document.createElement('p');
      note.className = 'agents-note';
      note.textContent = tr('For machines you can’t ssh into (a laptop, a Mac at home): the device dials OUT to this instance over a websocket, so it works behind NAT with nothing to expose. Needs Node 18+ on the device.');
      const note2 = document.createElement('p');
      note2.className = 'agents-note';
      note2.textContent = tr('Re-running the command on the device REPLACES its pairing with this instance. Pairing the same device with several VibeSpace instances is fine — each instance gets its own daemon on the device.');
      const label = document.createElement('label');
      label.textContent = tr('Device name');
      const inp = document.createElement('input');
      inp.type = 'text'; inp.placeholder = 'my-mac'; inp.maxLength = 32;
      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
      const cancel = document.createElement('button');
      cancel.className = 'btn-cancel'; cancel.textContent = tr('Cancel'); cancel.onclick = () => close();
      const go = document.createElement('button');
      go.className = 'btn-create'; go.textContent = tr('Create pairing');
      actions.append(cancel, go);
      body.append(note, note2, label, inp, actions);
      setTimeout(() => inp.focus(), 50);
      const pair = async () => {
        const name = (inp.value || '').trim().replace(/[^\w-]/g, '') || undefined;
        go.disabled = true; go.textContent = tr('Pairing…');
        try {
          const r = await api('/api/device/dial-pair', { method: 'POST', body: JSON.stringify({ deviceId: name, serverUrl: location.origin }) });
          const wsBase = location.origin.replace(/^http/, 'ws');
          const dialUrl = `${wsBase}/api/device-dial?device=${r.deviceId}`;
          // The full installer line: bundle + dial URL + BOTH tokens — the
          // hostToken is what the daemon verifies OUR mux hello against; an
          // install without it can dial in but rejects every server command.
          // Per-OS commands (user request): macOS/Linux share the bash
          // installer; Windows gets the PowerShell one (EXPERIMENTAL).
          const CMDS = {
            mac: `curl -fsSL ${location.origin}/vibespace-device-install.sh | bash -s -- \\\n  --bundle-url ${location.origin}/vibespace-device.js \\\n  --dial '${dialUrl}' \\\n  --dial-token ${r.dialToken} \\\n  --host-token ${r.hostToken}`,
            linux: `curl -fsSL ${location.origin}/vibespace-device-install.sh | bash -s -- \\\n  --bundle-url ${location.origin}/vibespace-device.js \\\n  --dial '${dialUrl}' \\\n  --dial-token ${r.dialToken} \\\n  --host-token ${r.hostToken}`,
            win: `& ([scriptblock]::Create((iwr -UseBasicParsing ${location.origin}/vibespace-device-install.ps1).Content)) \`\n  -BundleUrl ${location.origin}/vibespace-device.js \`\n  -Dial '${dialUrl}' \`\n  -DialToken ${r.dialToken} -HostToken ${r.hostToken}`,
          };
          const NOTES = {
            mac: tr('macOS: needs Node 18+ (brew install node). No ssh, no FUSE required.'),
            linux: tr('Linux: needs Node 18+ and curl.'),
            win: tr('Windows (EXPERIMENTAL, PowerShell): needs Node 18+ (winget install OpenJS.NodeJS.LTS).'),
          };
          body.innerHTML = '';
          const done = document.createElement('p');
          done.className = 'agents-note';
          done.textContent = tr('Paired as "{id}". Pick the device’s OS and run the command on it — it starts the agent and dials in; the device then appears as a machine row above (green dot = connected):', { id: r.deviceId });
          const seg = document.createElement('div');
          seg.style.cssText = 'display:flex;gap:6px;margin:6px 0;';
          const ta = document.createElement('textarea');
          ta.readOnly = true; ta.style.minHeight = '110px'; ta.style.fontSize = '11px'; ta.spellcheck = false;
          const note = document.createElement('p');
          note.className = 'agents-note';
          const guessOs = /Mac/i.test(navigator.platform || '') ? 'mac' : /Win/i.test(navigator.platform || '') ? 'win' : 'linux';
          let osSel = guessOs;
          const chips = {};
          const setOs = (k) => {
            osSel = k; ta.value = CMDS[k]; note.textContent = NOTES[k];
            for (const [ck, el] of Object.entries(chips)) el.className = ck === k ? 'btn-create' : 'btn-cancel';
          };
          for (const [k, label] of [['mac', 'macOS'], ['linux', 'Linux'], ['win', 'Windows']]) {
            const b = document.createElement('button');
            b.textContent = label; b.onclick = () => setOs(k);
            chips[k] = b; seg.appendChild(b);
          }
          const tail = document.createElement('p');
          tail.className = 'agents-note';
          tail.textContent = tr('The installer registers the daemon with launchd (macOS) / systemd (Linux): it starts on boot and auto-restarts if it crashes. One machine can pair to several VibeSpace instances — each install keeps its own state, keyed by this instance’s address. Pairing the same name again replaces its token.');
          const act2 = document.createElement('div');
          act2.className = 'dialog-actions';
          const copy = document.createElement('button');
          copy.className = 'btn-create'; copy.textContent = tr('Copy command');
          copy.onclick = () => { copyText(ta.value); showToast(tr('Command copied')); };
          const closeBtn = document.createElement('button');
          closeBtn.className = 'btn-cancel'; closeBtn.textContent = tr('Close'); closeBtn.onclick = () => close();
          act2.append(closeBtn, copy);
          body.append(done, seg, ta, note, tail, act2);
          setOs(guessOs);
          ta.onclick = () => ta.select();
        } catch (e) {
          go.disabled = false; go.textContent = tr('Create pairing');
          showToast((e && e.message) || 'pairing failed', { type: 'error' });
        }
      };
      go.onclick = pair;
      inp.onkeydown = (e) => { if (e.key === 'Enter') pair(); };
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
      const { body, close } = createModalShell({ id: 'mounts-dialog-overlay', title: tr('Import rclone config') });
      const hint = document.createElement('div');
      hint.className = 'mounts-field-hint';
      hint.textContent = tr('Paste the contents of your rclone.conf (from `rclone config file` — usually ~/.config/rclone/rclone.conf). Every remote inside it becomes a mount you can pick.');
      const ta = document.createElement('textarea');
      ta.placeholder = '[gdrive]\ntype = drive\ntoken = {…}\n\n[b2]\ntype = b2\naccount = …\nkey = …';
      ta.style.minHeight = '120px'; ta.style.fontSize = '11px'; ta.style.fontFamily = 'monospace';
      const parseBtn = document.createElement('button');
      parseBtn.className = 'btn-create';
      parseBtn.textContent = tr('Find storage in this config');
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
        catch (e) { err.textContent = e.message || tr('Parse failed'); return; }
        if (!d.remotes?.length) { err.textContent = tr('No remotes found in that config.'); return; }
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
            (r.wraps ? ` <span class="mounts-field-hint" style="display:inline">${escHtml(tr('references another remote — not supported'))}</span>` : '');
          row.append(cb, txt);
          list.appendChild(row);
        }
        // mode + import button
        const modeWrap = document.createElement('div');
        modeWrap.className = 'mounts-conf-mode';
        modeWrap.innerHTML = `<label>${escHtml(tr('Mount as'))}</label>`;
        const modeSel = document.createElement('select');
        for (const [v, l] of [['rw', tr('Read-write')], ['ro', tr('Read-only')]]) { const o = document.createElement('option'); o.value = v; o.textContent = l; modeSel.appendChild(o); }
        modeWrap.appendChild(modeSel);
        const importBtn = document.createElement('button');
        importBtn.className = 'btn-create';
        importBtn.textContent = tr('Import & connect selected');
        importBtn.onclick = async () => {
          const names = checks.filter(c => c.checked).map(c => c.dataset.name);
          if (!names.length) { err.textContent = tr('Pick at least one remote.'); return; }
          importBtn.disabled = true; importBtn.textContent = tr('Importing…');
          try {
            const r = await api('/api/mounts/rclone-conf/import', { method: 'POST', body: JSON.stringify({ text: confText, names, mode: modeSel.value }), headers: { 'Content-Type': 'application/json' } });
            close(); showToast(tr('Imported {n} remotes', { n: r.added.length })); this._renderMounts();
          } catch (e) { err.textContent = e.message || tr('Import failed'); importBtn.disabled = false; importBtn.textContent = tr('Import & connect selected'); }
        };
        list.append(modeWrap, importBtn);
      };
    },

    _showImportShareDialog() {
      this._mountsDialog(tr('Import share link'), [
        { key: 'link', label: tr('Share link'), placeholder: 'vibespace-share:v1:…' },
        { key: 'name', label: tr('Display name (optional)'), placeholder: 'team-dataset', hint: tr('What to call this folder in your file list.') },
      ], tr('Import & connect'), async (v, { close }) => {
        if (!v.link) throw new Error(tr('Paste the share link'));
        const r = await api('/api/mounts/import', { method: 'POST', body: JSON.stringify({ link: v.link, name: v.name || undefined }), headers: { 'Content-Type': 'application/json' } });
        await fetch(`/api/mounts/${r.id}/mount`, { method: 'POST' });
        close(); showToast(tr('Share imported')); this._renderMounts();
      });
    },

    async _showAddMountDialog() {
      const is = (t) => (v) => v.type === t;
      // Instance-preset Google clients (admin-injected; keys+labels only)
      let presets = [];
      try { presets = (await api('/api/mounts/drive-defaults')).presets || []; } catch {}
      const clientOpts = [
        ...presets.map((p) => [p.key, tr('Preset: {name}', { name: p.label })]),
        ['', tr('Built-in client (rclone shared — being retired by Google)')],
        ['custom', tr('Custom (own client id/secret)')],
      ];
      const isDriveCustom = (v) => v.type === 'drive' && v.clientChoice === 'custom';
      this._mountsDialog(tr('Connect storage'), [
        { key: 'type', label: tr('Source type'), type: 'select', options: [
          ['s3', tr('Cloud storage (S3 / MinIO)')], ['drive', 'Google Drive'], ['onedrive', 'OneDrive'], ['gmail', 'Gmail'], ['cloud', tr('Other cloud (Dropbox / Box / pCloud …)')], ['webdav', 'Nextcloud / WebDAV'],
          ['sftp', tr('A server over SSH (SFTP)')], ['vibespace', tr('Another VibeSpace')], ['rclone', tr('Custom / advanced (rclone)')],
        ] },
        { key: 'name', label: tr('Name'), placeholder: 'my-mount' },
        // S3
        { key: 'endpoint', label: tr('Server address (endpoint)'), placeholder: 'https://s3.amazonaws.com  or  https://s3.mycompany.com', when: is('s3'), hint: tr('The address your storage provider gave you. For Amazon S3 use https://s3.amazonaws.com; for MinIO/other providers use the link from their console.') },
        { key: 'bucket', label: tr('Bucket (storage container)'), placeholder: 'company-workspace', when: is('s3'), hint: tr('The container name from your provider’s console — like a top-level drive.') },
        { key: 'prefix', label: tr('Subfolder (optional)'), placeholder: 'users/alice', when: is('s3'), hint: tr('Limit this connection to one folder inside the bucket. Leave blank for the whole bucket.') },
        { key: 'accessKey', label: tr('Access key'), when: is('s3'), hint: tr('From your provider’s “Access Keys” / API credentials page.') },
        { key: 'secretKey', label: tr('Secret key'), type: 'password', when: is('s3'), hint: tr('The secret half of the access key — treat it like a password.') },
        // Google Drive
        { key: 'token', label: tr('Google Drive access'), type: 'textarea', placeholder: tr('click "Connect Google Drive" below — no terminal needed'), when: is('drive'), hint: tr('Advanced: you can also paste the JSON from `rclone authorize "drive"` run elsewhere.') },
        { key: 'driveFolder', label: tr('Folder (optional, blank = whole Drive)'), placeholder: 'Projects/Data', when: is('drive') },
        { key: 'clientChoice', label: tr('OAuth client'), type: 'select', options: clientOpts, value: presets[0]?.key || '', when: is('drive'),
          hint: presets.length ? tr('Pick the preset matching your Google account\'s organization; external accounts may see a one-time "unverified app" warning.') : tr("Advanced: your own Google Cloud OAuth client avoids rclone's shared quota.") },
        { key: 'clientId', label: tr('Custom OAuth client ID'), placeholder: '….apps.googleusercontent.com', when: isDriveCustom },
        { key: 'clientSecret', label: tr('Custom OAuth client secret'), type: 'password', when: isDriveCustom },
        { key: 'driveMode', label: tr('Cloud-side scope'), type: 'select', when: is('drive'),
          options: [['mydrive', 'My Drive'], ['shared-with-me', tr('Shared with me')], ['shared-drive', tr('Shared drive (team)')]],
          hint: tr('“Shared with me” and Shared drives are separate spaces in Google Drive — this picks which one the mount shows; the folder path above is inside it.') },
        { key: 'teamDriveId', label: tr('Shared drive'), placeholder: tr('click “List shared drives” (needs access above) or paste an id'), when: is('drive') },
        { key: 'rootFolderId', label: tr('Folder ID (advanced — mount ONE shared folder)'), placeholder: '1AbC…', when: is('drive'), advanced: true,
          hint: tr('From the folder’s Drive URL. Mounts just that folder — the way to mount a single folder someone shared with you (keep scope = My Drive).') },
        // Gmail (emails sync into the mount folder as .eml files, read-only)
        { key: 'gmailClientChoice', label: tr('OAuth client'), type: 'select', options: clientOpts.filter(([v]) => v !== ''), value: presets[0]?.key || 'custom', when: is('gmail'),
          hint: tr('Gmail has no built-in fallback client — pick a preset or provide your own. The client needs the gmail.readonly scope.') },
        { key: 'gmailClientId', label: tr('Custom OAuth client ID'), placeholder: '….apps.googleusercontent.com', when: (v) => v.type === 'gmail' && v.gmailClientChoice === 'custom' },
        { key: 'gmailClientSecret', label: tr('Custom OAuth client secret'), type: 'password', when: (v) => v.type === 'gmail' && v.gmailClientChoice === 'custom' },
        { key: 'gmailToken', label: tr('Gmail access'), type: 'textarea', placeholder: tr('click "Connect Gmail" below — no terminal needed'), when: is('gmail'),
          hint: tr('This is a SYNC, not a live mount: emails download into the folder as .eml files (read-only archive) and keep syncing while connected.') },
        { key: 'syncCount', label: tr('Messages to sync (newest N; 0 = everything)'), placeholder: '200', when: is('gmail'),
          hint: tr('0 syncs the ENTIRE mailbox — archived and spam/trash included when no label filter is set. Large mailboxes take a while (quota-paced); the card shows live progress.') },
        { key: 'groupBy', label: tr('Organize into folders'), type: 'select', when: is('gmail'),
          options: [['label-month', tr('By label, then month (Inbox/2026-07)')], ['label-day', tr('By label, then day')], ['month', tr('By month (YYYY-MM)')], ['day', tr('By day (YYYY-MM-DD)')], ['none', tr('No grouping (flat)')]],
          hint: tr('Label layout files each mail under Inbox / Archive / Sent / Spam / Trash / Drafts (Gmail precedence; "archived" = not in the inbox), with a date folder inside.') },
        { key: 'labelIds', label: tr('Labels filter (blank = whole mailbox)'), placeholder: tr('blank = everything — or e.g. INBOX, SENT, STARRED'), when: is('gmail'), advanced: true,
          hint: tr('Comma list of Gmail label ids — use “List labels” after connecting to pick from your real labels.') },
        { key: 'query', label: tr('Search filter (Gmail query, optional)'), placeholder: 'from:boss@example.com newer_than:30d', when: is('gmail'), advanced: true },
        // OneDrive (native — guided OAuth, first-class fields)
        { key: 'onedriveToken', label: tr('OneDrive access'), type: 'textarea', placeholder: tr('click "Connect OneDrive" below — no terminal needed'), when: is('onedrive') },
        { key: 'driveType', label: tr('Account type'), type: 'select', when: is('onedrive'),
          options: [['personal', tr('Personal')], ['business', tr('Work / School (OneDrive for Business)')], ['documentLibrary', tr('SharePoint document library')]] },
        { key: 'remotePath', label: tr('Folder (optional, blank = whole drive)'), placeholder: 'Documents/Projects', when: is('onedrive') },
        { key: 'driveId', label: tr('Drive ID (advanced — a specific/shared drive)'), placeholder: 'b!… (blank = your main drive)', when: is('onedrive'), advanced: true },
        { key: 'onedriveClientId', label: tr('Custom OAuth client ID (optional — own Azure app)'), placeholder: tr('leave blank to use the built-in client'), when: is('onedrive'), advanced: true },
        { key: 'onedriveClientSecret', label: tr('Custom OAuth client secret (optional)'), type: 'password', when: is('onedrive'), advanced: true },

        { key: 'cloudBackend', label: tr('Provider'), type: 'select', when: is('cloud'), options: [
          ['dropbox', 'Dropbox'], ['box', 'Box'], ['pcloud', 'pCloud'], ['yandex', 'Yandex Disk'], ['jottacloud', 'Jottacloud'], ['hidrive', 'HiDrive']] },
        { key: 'cloudToken', label: tr('Access'), type: 'textarea', placeholder: tr('click "Connect" below — no terminal needed'), when: is('cloud'),
          hint: tr('Advanced: you can also paste the JSON from `rclone authorize "<provider>"` run elsewhere.') },
        { key: 'cloudPath', label: tr('Folder (optional, blank = whole drive)'), placeholder: 'Projects/Data', when: is('cloud') },
        { key: 'cloudClientId', label: tr('Custom OAuth client ID (optional — your own app)'), when: is('cloud'), advanced: true,
          hint: tr('Most providers work with the built-in client — leave blank.') },
        { key: 'cloudClientSecret', label: tr('Custom OAuth client secret (optional)'), type: 'password', when: is('cloud'), advanced: true },
        // WebDAV / Nextcloud
        { key: 'url', label: tr('WebDAV URL'), placeholder: 'https://cloud.example.com/remote.php/dav/files/me', when: is('webdav'), hint: tr('Nextcloud: Settings → Files shows this address. Use an app password if you have 2FA.') },
        { key: 'vendor', label: tr('Vendor'), type: 'select', options: [['other', tr('Generic WebDAV')], ['nextcloud', 'Nextcloud']], when: is('webdav') },
        { key: 'user', label: tr('Username'), when: is('webdav') },
        { key: 'pass', label: tr('Password / app token'), type: 'password', when: is('webdav') },
        // SFTP
        { key: 'fromHost', label: tr('From registered host (optional)'), type: 'select', when: is('sftp'),
          options: [['', tr('— pick to prefill —')], ...((this._hostsData?.hosts || []).map(h => [h.id, h.name]))] },
        { key: 'sshHost', label: tr('SSH host'), placeholder: 'box.example.com', when: is('sftp') },
        { key: 'sshUser', label: tr('SSH user'), placeholder: 'ubuntu', when: is('sftp') },
        { key: 'sshPort', label: tr('Port'), placeholder: '22', when: is('sftp') },
        { key: 'sshPath', label: tr('Remote path (optional)'), placeholder: '/home/ubuntu/data', when: is('sftp'), autocomplete: (inputs) => inputs.fromHost?.value ? `/api/hosts/${inputs.fromHost.value}/dir-complete` : '/api/hosts/none/dir-complete' },
        { key: 'keyPath', label: tr('Private key path (absolute) — or use password'), placeholder: '~/.ssh/id_ed25519', when: is('sftp'), autocomplete: 'local' },
        { key: 'pass', label: tr('Password (if no key)'), type: 'password', when: is('sftp') },
        // Another VibeSpace
        { key: 'url', label: tr('VibeSpace URL'), placeholder: 'https://vibespace.example.com', when: is('vibespace') },
        { key: 'bearerToken', label: tr('Mount token (vsmt_…)'), type: 'password', when: is('vibespace'), hint: tr('Ask the other VibeSpace to create one under Storage → “Share a local folder”.') },
        // Custom rclone backend
        { key: 'rcloneType', label: tr('rclone backend'), placeholder: 'dropbox / b2 / azureblob / mega / …', when: is('rclone'), hint: tr("Any backend rclone supports — see rclone.org/docs. Params below map to that backend's config keys.") },
        { key: 'params', label: tr('Parameters (one key = value per line)'), type: 'textarea', placeholder: 'token = {"access_token":…}\naccount = my-account\nkey = …', when: is('rclone'), hint: tr('e.g. b2 wants account + key; dropbox wants token. All values encrypted at rest.') },
        { key: 'remotePath', label: tr('Path within the remote (optional)'), placeholder: 'folder/subfolder', when: is('rclone') },
        // common
        { key: 'extraParams', label: tr('Extra options (key = value per line)'), type: 'textarea', placeholder: 'e.g.  chunk_size = 64M', hint: tr('Passed to the underlying transfer engine (rclone) — custom API keys, tuning, provider quirks. See rclone.org/docs.'), advanced: true },
        { key: 'mode', label: tr('Mode'), type: 'select', options: [['rw', tr('Read-write')], ['ro', tr('Read-only')]] },
        { key: 'customPath', label: tr('Where to put it on this computer (optional)'), placeholder: tr('leave blank — we choose automatically'), hint: tr('Advanced: an absolute path if you need it in a specific place.'), advanced: true, autocomplete: 'local' },
      ], tr('Connect'), async (v, { close }) => {
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
        if (v.type === 'drive') {
          if (v.clientChoice === 'custom') v.clientPreset = null;
          else { v.clientPreset = v.clientChoice || null; v.clientId = ''; v.clientSecret = ''; }
        }
        delete v.clientChoice;
        if (v.type === 'gmail') {
          v.token = v.gmailToken;
          v.mode = 'ro';
          if (v.gmailClientChoice === 'custom') { v.clientId = v.gmailClientId; v.clientSecret = v.gmailClientSecret; v.clientPreset = null; }
          else v.clientPreset = v.gmailClientChoice || null;
        }
        delete v.gmailToken; delete v.gmailClientChoice; delete v.gmailClientId; delete v.gmailClientSecret;
        if (v.type === 'onedrive') {
          v.token = v.onedriveToken;
          v.clientId = v.onedriveClientId || null;
          v.clientSecret = v.onedriveClientSecret || undefined;
        }
        delete v.onedriveToken; delete v.onedriveClientId; delete v.onedriveClientSecret;
        if (v.type === 'cloud') {
          v.backend = v.cloudBackend;
          v.token = v.cloudToken;
          v.remotePath = v.cloudPath;
          v.clientId = v.cloudClientId || null;
          v.clientSecret = v.cloudClientSecret || undefined;
        }
        delete v.cloudBackend; delete v.cloudToken; delete v.cloudPath; delete v.cloudClientId; delete v.cloudClientSecret;
        const r = await api('/api/mounts', { method: 'POST', body: JSON.stringify(v), headers: { 'Content-Type': 'application/json' } });
        await fetch(`/api/mounts/${r.id}/mount`, { method: 'POST' });
        close(); showToast(tr('Storage connected')); this._renderMounts();
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
      this._wireSharedDrivePicker(ctx);
      this._wireGmailConnect(ctx);
      this._wireGmailLabelsPicker(ctx);
      this._wireOAuthConnect(ctx, { tokenKey: 'onedriveToken', backend: 'onedrive', label: tr('Connect OneDrive') });
      this._wireOAuthConnect(ctx, { tokenKey: 'cloudToken', backend: () => ctx.inputs.cloudBackend?.value || 'dropbox',
        label: tr('Connect'), clientIdKey: 'cloudClientId', clientSecretKey: 'cloudClientSecret' });
    },

    // Generic guided OAuth (rclone authorize <backend>) for a native record —
    // reused by OneDrive and (via edit) any OAuth rclone backend. Mirrors the
    // Drive connect flow: same-machine completes hands-free, remote pastes the
    // 127.0.0.1 redirect back.
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
          window.open(r.url, '_blank');
          status.textContent = tr('A {provider} sign-in page opened. Approve access, then come back here.', { provider: PROVIDER_LABELS[body.backend] || body.backend });
          if (!pasteBox) {
            pasteBox = document.createElement('div');
            pasteBox.innerHTML = `<div class="mounts-field-hint">${escHtml(tr("If this VibeSpace runs on ANOTHER machine, the final page won't load (address starts with 127.0.0.1) — copy that address and paste it here:"))}</div>`;
            const inp = document.createElement('input'); inp.placeholder = 'http://127.0.0.1:53682/?state=…&code=…';
            inp.onchange = async () => { try { status.textContent = tr('Completing…'); const fr = await api('/api/mounts/gdrive-auth/callback', { method: 'POST', body: JSON.stringify({ url: inp.value }), headers: { 'Content-Type': 'application/json' } }); if (fr.error) throw new Error(fr.error); if (fr.token) finish(fr.token); } catch (e) { status.textContent = e.message || tr('Failed'); } };
            pasteBox.appendChild(inp); wrap.appendChild(pasteBox);
          }
          poll = setInterval(async () => { try { const st = await api('/api/mounts/gdrive-auth/status'); if (st.token) finish(st.token); else if (st.error) { stopPoll(); status.textContent = st.error; btn.disabled = false; } else if (!st.running) { stopPoll(); btn.disabled = false; } } catch {} }, 1500);
        } catch (e) { status.textContent = e.message || tr('Failed to start authorization'); btn.disabled = false; }
      };
    },

    // "List labels" next to the Gmail labels filter: real labels from the
    // account (labels.list, 1 quota unit). Clicking a label APPENDS it to the
    // comma list (click several to build a multi-label filter); by record id
    // when editing, by the pasted/connected token in the add dialog.
    _wireGmailLabelsPicker(ctx, recordId) {
      const inp = ctx.inputs.labelIds;
      if (!inp) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mounts-btn';
      btn.textContent = tr('List labels');
      btn.style.marginTop = '4px';
      inp.after(btn);
      const sync = () => { btn.style.display = inp.style.display; };
      new MutationObserver(sync).observe(inp, { attributes: true, attributeFilter: ['style'] });
      sync();
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          const choice = ctx.inputs.gmailClientChoice?.value;
          const body = recordId ? { id: recordId } : {
            token: ctx.inputs.gmailToken?.value || '',
            clientId: (choice === 'custom' && ctx.inputs.gmailClientId?.value) || '',
            clientSecret: (choice === 'custom' && ctx.inputs.gmailClientSecret?.value) || '',
            clientPreset: (choice && choice !== 'custom' && choice) || '',
          };
          if (!recordId && !String(body.token).trim()) throw new Error(tr('Connect Gmail first (the token field must be filled)'));
          const r = await api('/api/mounts/gmail-labels', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
          const labels = r.labels || [];
          if (!labels.length) { showToast(tr('No labels found')); return; }
          const rect = btn.getBoundingClientRect();
          showContextMenu(rect.left, rect.bottom + 4, labels.map((l) => ({
            label: l.name + (l.type === 'user' ? ' •' : ''),
            action: () => {
              const cur = inp.value.split(',').map((x) => x.trim()).filter(Boolean);
              if (!cur.includes(l.id)) cur.push(l.id);
              inp.value = cur.join(', ');
            },
          })));
        } catch (e) { showToast(e.message || tr('Failed'), { type: 'error' }); }
        finally { btn.disabled = false; }
      };
    },

    // "Connect Gmail" guided OAuth — same pattern as the Drive flow but over
    // the gmail-auth endpoints (our own loopback exchange; rclone authorize
    // is drive-only). Same-machine completes hands-free; remote pastes the
    // 127.0.0.1 redirect back.
    _wireGmailConnect(ctx) {
      const tokenInput = ctx.inputs.gmailToken;
      if (!tokenInput) return;
      const wrap = document.createElement('div');
      wrap.className = 'mounts-drive-connect';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mounts-btn mounts-btn-primary';
      btn.textContent = tr('Connect Gmail');
      const status = document.createElement('div');
      status.className = 'mounts-field-hint';
      wrap.append(btn, status);
      tokenInput.before(wrap);
      const sync = () => { wrap.style.display = tokenInput.style.display; };
      new MutationObserver(sync).observe(tokenInput, { attributes: true, attributeFilter: ['style'] });
      sync();
      let pasteBox = null, poll = null;
      const stopPoll = () => { clearInterval(poll); poll = null; };
      const finish = (token) => {
        stopPoll();
        tokenInput.value = token;
        status.textContent = tr('✓ Connected — finish with the “Connect” button below.');
        btn.textContent = tr('Reconnect');
        btn.disabled = false;
        pasteBox?.remove(); pasteBox = null;
      };
      btn.onclick = async () => {
        btn.disabled = true;
        status.textContent = tr('Preparing authorization…');
        try {
          const choice = ctx.inputs.gmailClientChoice?.value;
          const r = await api('/api/mounts/gmail-auth/start', {
            method: 'POST',
            body: JSON.stringify({
              clientId: (choice === 'custom' && ctx.inputs.gmailClientId?.value) || undefined,
              clientSecret: (choice === 'custom' && ctx.inputs.gmailClientSecret?.value) || undefined,
              clientPreset: (choice && choice !== 'custom' && choice) || undefined,
            }),
            headers: { 'Content-Type': 'application/json' },
          });
          if (r.error) throw new Error(r.error);
          window.open(r.url, '_blank');
          status.textContent = tr('A Google sign-in page opened. Approve access, then come back here.');
          if (!pasteBox) {
            pasteBox = document.createElement('div');
            pasteBox.innerHTML = `<div class="mounts-field-hint">${escHtml(tr("If this VibeSpace runs on ANOTHER machine, the final page won't load (address starts with 127.0.0.1) — copy that address and paste it here:"))}</div>`;
            const inp = document.createElement('input');
            inp.placeholder = 'http://127.0.0.1:…/?state=…&code=…';
            inp.onchange = async () => {
              try {
                status.textContent = tr('Completing…');
                const fr = await api('/api/mounts/gmail-auth/callback', { method: 'POST', body: JSON.stringify({ url: inp.value }), headers: { 'Content-Type': 'application/json' } });
                if (fr.error) throw new Error(fr.error);
                if (fr.token) finish(fr.token);
              } catch (e) { status.textContent = e.message || tr('Failed'); }
            };
            pasteBox.appendChild(inp);
            wrap.appendChild(pasteBox);
          }
          poll = setInterval(async () => {
            try {
              const st = await api('/api/mounts/gmail-auth/status');
              if (st.token) finish(st.token);
              else if (st.error) { stopPoll(); status.textContent = st.error; btn.disabled = false; }
              else if (!st.running) { stopPoll(); btn.disabled = false; }
            } catch { }
          }, 1500);
        } catch (e) {
          status.textContent = e.message || tr('Failed to start authorization');
          btn.disabled = false;
        }
      };
    },

    // "List shared drives" button next to the teamDriveId input: uses the
    // token already in the dialog (pasted or from the guided flow) to run
    // `rclone backend drives` server-side and pick from a menu.
    _wireSharedDrivePicker(ctx, credId) {
      const inp = ctx.inputs.teamDriveId;
      if (!inp) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mounts-btn';
      btn.textContent = tr('List shared drives');
      btn.style.marginTop = '4px';
      inp.after(btn);
      const sync = () => { btn.style.display = inp.style.display; };
      new MutationObserver(sync).observe(inp, { attributes: true, attributeFilter: ['style'] });
      sync();
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          const choice = ctx.inputs.clientChoice?.value;
          const body = credId ? { id: credId } : { token: ctx.inputs.token?.value || '',
            clientId: (choice === 'custom' && ctx.inputs.clientId?.value) || '',
            clientSecret: (choice === 'custom' && ctx.inputs.clientSecret?.value) || '',
            clientPreset: (choice && choice !== 'custom' && choice) || '' };
          if (!credId && !body.token.trim()) throw new Error(tr('Connect Google Drive first (the token field must be filled)'));
          const r = await api('/api/mounts/shared-drives', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
          const drives = r.drives || [];
          if (!drives.length) { showToast(tr('No shared drives visible to this account')); return; }
          const rect = btn.getBoundingClientRect();
          showContextMenu(rect.left, rect.bottom + 4, drives.map((d) => ({
            label: d.name, action: () => {
              inp.value = d.id;
              const dm = ctx.inputs.driveMode; if (dm) dm.value = 'shared-drive';
              dm?.dispatchEvent(new Event('change', { bubbles: true })); // conditional rows re-evaluate
            },
          })));
        } catch (e) { showToast(e.message || tr('Failed'), { type: 'error' }); }
        finally { btn.disabled = false; }
      };
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
      btn.textContent = tr('Connect Google Drive');
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
        status.textContent = tr('✓ Connected — finish with the “Connect” button below.');
        btn.textContent = tr('Reconnect');
        btn.disabled = false;
        pasteBox?.remove(); pasteBox = null;
      };
      btn.onclick = async () => {
        btn.disabled = true;
        status.textContent = tr('Preparing authorization…');
        try {
          const r = await api('/api/mounts/gdrive-auth/start', {
            method: 'POST',
            body: JSON.stringify({
              clientId: (ctx.inputs.clientChoice?.value === 'custom' && ctx.inputs.clientId?.value) || undefined,
              clientSecret: (ctx.inputs.clientChoice?.value === 'custom' && ctx.inputs.clientSecret?.value) || undefined,
              clientPreset: (ctx.inputs.clientChoice && ctx.inputs.clientChoice.value !== 'custom' && ctx.inputs.clientChoice.value) || undefined,
            }),
            headers: { 'Content-Type': 'application/json' },
          });
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
                const fr = await api('/api/mounts/gdrive-auth/callback', { method: 'POST', body: JSON.stringify({ url: inp.value }), headers: { 'Content-Type': 'application/json' } });
                finish(fr.token);
              } catch (e) { status.textContent = e.message || tr('Failed'); }
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
          status.textContent = e.message || tr('Failed to start authorization');
          btn.disabled = false;
        }
      };
    },

    // Mint a scoped WebDAV mount token so another VibeSpace can mount a folder
    // of THIS instance (the "VibeSpace互挂" bridge).
    _showBridgeShareDialog(prefillRoot) {
      this._mountsDialog(tr('Share a local folder'), [
        { key: 'name', label: tr('Label'), placeholder: 'shared-with-bob' },
        { key: 'root', label: tr('Folder to share (absolute path on this machine)'), placeholder: '/home/me/project', autocomplete: 'local', value: prefillRoot || '' },
        { key: 'mode', label: tr('Access'), type: 'select', options: [['ro', tr('Read-only')], ['rw', tr('Read-write')]] },
      ], tr('Create link'), async (v, { close, body }) => {
        const r = await api('/api/mount-tokens', { method: 'POST', body: JSON.stringify(v), headers: { 'Content-Type': 'application/json' } });
        body.innerHTML = `<label>${escHtml(tr('Bridge link — embeds a scoped token; treat it like a key'))}</label>
          <textarea readonly style="min-height:84px;font-size:11px">${escHtml(r.link)}</textarea>
          <div class="mounts-note">${escHtml(tr('The other side pastes this into “Import share link” (or Connect storage → Another VibeSpace). Revoke any time under Bridge tokens.'))}</div>`
          + (r.token ? `<label style="margin-top:10px">${escHtml(tr('Mount on a Mac / Windows (Finder / Explorer)'))}</label>
          <div class="mounts-note">${escHtml(tr('Finder: Cmd+K → enter the server address; any username, password = the token below. Windows: map network drive to the same address.'))}</div>
          <div class="mounts-note" style="user-select:all">${escHtml(r.davUrl || '')}</div>
          <textarea readonly style="min-height:40px;font-size:11px">${escHtml(r.token)}</textarea>
          <label style="margin-top:10px">${escHtml(tr('Or paste into your rclone config (~/.config/rclone/rclone.conf)'))}</label>
          <textarea readonly style="min-height:96px;font-size:11px">${escHtml(`[${(v.name || 'vibespace-share').replace(/[^\w-]+/g, '-')}]\ntype = webdav\nurl = ${r.davUrl || ''}\nvendor = other\nbearer_token = ${r.token}`)}</textarea>
          <div class="mounts-note">${escHtml(tr('Then: rclone mount {name}: /path/to/local/folder', { name: (v.name || 'vibespace-share').replace(/[^\w-]+/g, '-') }))}</div>` : '');
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-create';
        copyBtn.textContent = tr('Copy link');
        copyBtn.onclick = () => { copyText(r.link); showToast(tr('Link copied')); close(); this._renderMounts(); };
        const actions = document.createElement('div');
        actions.className = 'dialog-actions';
        actions.appendChild(copyBtn);
        body.appendChild(actions);
      });
    },

    // Mint an S3 share link FROM a specific mount (uses that mount's own creds).
    // ── Edit / derive (2.107.0, user request: FishR2-class mounts needed a
    // bucket/path fix with no edit UI; one credential → many mounts) ──
    // Fields are PREFILLED with the real current connection settings — secrets
    // (access/secret keys, OAuth tokens, passwords, bearer tokens, rclone
    // params) included — fetched decrypted from GET /api/mounts/:id/config, so
    // the user reads and edits every value directly (single-user instance).

    _mountEditFields(cfg, presets = []) {
      // [key, label, placeholder, currentValue] per type. `cfg` is the DECRYPTED
      // config from /api/mounts/:id/config, so every value below is the real,
      // current setting (prefilled), secrets included.
      // Env-provisioned storage: connection is deployment-owned — only the
      // mount point (and name) are editable, both added by the caller.
      if (cfg.envLocked || cfg.origin === 'my-storage') return [];
      const type = cfg.type || 's3';
      // A mount point under a credential owns ONLY its path — connection
      // params are edited on the credential itself.
      if (cfg.parentId) {
        if (type === 's3') return [
          ['bucket', tr('Bucket'), 'bucket-name', cfg.bucket || ''],
          ['prefix', tr('Prefix (optional)'), 'sub/path', cfg.prefix || ''],
        ];
        if (type === 'rclone') return [['remotePath', tr('Remote path (bucket[/prefix])'), 'bucket-name/optional/prefix', cfg.remotePath || '']];
        if (type === 'cloud') return [
        ['remotePath', tr('Folder (optional)'), 'Projects/Data', cfg.remotePath || ''],
        ['clientId', tr('Custom OAuth client id (optional)'), '', cfg.clientId || ''],
        ['clientSecret', tr('Custom OAuth client secret'), '', cfg.clientSecret || ''],
        ['token', tr('OAuth token (re-run Connect to replace)'), '', cfg.token || '', { type: 'textarea' }],
      ];
      if (type === 'onedrive') return [['remotePath', tr('Folder path'), 'Documents/sub', cfg.remotePath || '']];
        if (type === 'cloud') return [['remotePath', tr('Folder path'), 'Projects/sub', cfg.remotePath || '']];
        if (type === 'drive') return [
          ['driveFolder', tr('Folder path (optional)'), 'My Folder/sub', cfg.driveFolder || ''],
          ['driveMode', tr('Cloud-side scope'), '', cfg.driveMode || 'mydrive', { type: 'select', options: [['mydrive', 'My Drive'], ['shared-with-me', tr('Shared with me')], ['shared-drive', tr('Shared drive (team)')]] }],
          ['teamDriveId', tr('Shared drive id'), '0AbC…', cfg.teamDriveId || ''],
          ['rootFolderId', tr('Folder ID (advanced)'), '1AbC…', cfg.rootFolderId || ''],
        ];
        if (type === 'sftp') return [['sshPath', tr('Remote path'), '/data', cfg.sshPath || '']];
        return [];
      }
      if (type === 's3') return [
        ['endpoint', tr('Endpoint'), 'https://…', cfg.endpoint || ''],
        ['bucket', tr('Bucket'), 'bucket-name', cfg.bucket || ''],
        ['prefix', tr('Prefix (optional)'), 'sub/path', cfg.prefix || ''],
        ['accessKey', tr('Access key'), '', cfg.accessKey || ''],
        ['secretKey', tr('Secret key'), '', cfg.secretKey || ''],
      ];
      if (type === 'rclone') return [
        ['remotePath', tr('Remote path (bucket[/prefix])'), 'bucket-name/optional/prefix', cfg.remotePath || ''],
        // each stored parameter is prefilled; clearing its value removes it
        ...Object.entries(cfg.params || {}).map(([k, v]) => [`param:${k}`, k, '', v == null ? '' : String(v)]),
        ['newParamKey', tr('Add parameter — name'), 'e.g. region', ''],
        ['newParamValue', tr('Add parameter — value'), '', ''],
      ];
      if (type === 'drive') return [
        ['driveFolder', tr('Folder path (optional)'), 'My Folder/sub', cfg.driveFolder || ''],
        ['driveMode', tr('Cloud-side scope'), '', cfg.driveMode || 'mydrive', { type: 'select', options: [['mydrive', 'My Drive'], ['shared-with-me', tr('Shared with me')], ['shared-drive', tr('Shared drive (team)')]] }],
        ['teamDriveId', tr('Shared drive id'), '0AbC…', cfg.teamDriveId || ''],
        ['rootFolderId', tr('Folder ID (advanced)'), '1AbC…', cfg.rootFolderId || ''],
        ['clientPreset', tr('OAuth client'), '', cfg.clientPreset || '', { type: 'select', options: [['', tr('(custom / built-in client)')], ...presets.map((c) => [c.key, tr('Preset: {name}', { name: c.label })])] }],
        ['token', tr('OAuth token'), '{"access_token":…}', cfg.token || '', { type: 'textarea' }],
        ['clientId', tr('Custom OAuth client id (when no preset)'), '', cfg.clientId || ''],
        ['clientSecret', tr('Custom OAuth client secret'), '', cfg.clientSecret || ''],
      ];
      if (type === 'gmail') return [
        ['syncCount', tr('Messages to sync (newest N; 0 = everything)'), '200', cfg.syncCount != null ? String(cfg.syncCount) : ''],
        ['groupBy', tr('Organize into folders'), '', cfg.groupBy || 'none',
          { type: 'select', options: [['none', tr('No grouping (flat)')], ['month', tr('By month (YYYY-MM)')], ['day', tr('By day (YYYY-MM-DD)')], ['label-month', tr('By label, then month (Inbox/2026-07)')], ['label-day', tr('By label, then day')]] }],
        ['labelIds', tr('Labels (comma list)'), 'INBOX', cfg.labelIds || ''],
        ['query', tr('Search filter (Gmail query)'), '', cfg.query || ''],
        ['clientPreset', tr('OAuth client'), '', cfg.clientPreset || '', { type: 'select', options: [['', tr('(custom / built-in client)')], ...presets.map((c) => [c.key, tr('Preset: {name}', { name: c.label })])] }],
        ['token', tr('OAuth token (JSON — re-run Connect Gmail to replace)'), '', cfg.token || '', { type: 'textarea' }],
      ];
      if (type === 'onedrive') return [
        ['remotePath', tr('Folder (optional)'), 'Documents/Projects', cfg.remotePath || ''],
        ['driveType', tr('Account type'), '', cfg.driveType || 'personal', { type: 'select', options: [['personal', tr('Personal')], ['business', tr('Work / School')], ['documentLibrary', tr('SharePoint library')]] }],
        ['driveId', tr('Drive ID (advanced)'), 'b!…', cfg.driveId || ''],
        ['clientId', tr('Custom OAuth client id (optional)'), '', cfg.clientId || ''],
        ['clientSecret', tr('Custom OAuth client secret'), '', cfg.clientSecret || ''],
        ['token', tr('OAuth token (re-run Connect OneDrive to replace)'), '', cfg.token || '', { type: 'textarea' }],
      ];
      if (type === 'webdav' || type === 'vibespace') return [
        ['url', 'URL', 'https://…', cfg.url || ''],
        ...(type === 'webdav' ? [
          ['vendor', tr('Vendor'), '', cfg.vendor || 'other', { type: 'select', options: [['other', tr('Generic WebDAV')], ['nextcloud', 'Nextcloud']] }],
          ['user', tr('User'), '', cfg.user || ''],
          ['pass', tr('Password'), '', cfg.pass || ''],
        ] : []),
        ['bearerToken', tr('Bearer token'), '', cfg.bearerToken || ''],
      ];
      if (type === 'sftp') return [
        ['sshHost', tr('Host'), 'example.com', cfg.sshHost || ''],
        ['sshUser', tr('User'), '', cfg.sshUser || ''],
        ['sshPort', tr('Port'), '22', cfg.sshPort ? String(cfg.sshPort) : ''],
        ['sshPath', tr('Remote path (optional)'), '/data', cfg.sshPath || ''],
        ['keyPath', tr('Private key path (absolute, optional)'), '/home/me/.ssh/id_ed25519', cfg.keyPath || ''],
        ['pass', tr('Password'), '', cfg.pass || ''],
      ];
      return [];
    },

    async _showEditMountDialog(m) {
      // Fetch the fully DECRYPTED connection first so every field (secrets
      // included) can be prefilled with its real current value.
      let cfg;
      try { cfg = await api(`/api/mounts/${m.id}/config`); }
      catch (e) { showToast(e.message || tr('Failed to load connection'), { type: 'error' }); return; }
      const name = cfg.name || m.name;
      const { body, close } = createModalShell({ id: 'mount-edit-dialog', title: `${tr('Edit')} "${name}"`, bodyClass: 'mounts-dialog-body', escapeToClose: true });
      const form = document.createElement('form');
      form.className = 'mounts-form';
      let editPresets = [];
      if (['drive', 'gmail'].includes(cfg.type || 's3')) {
        try { editPresets = (await api('/api/mounts/drive-defaults')).presets || []; } catch {}
      }
      const fields = [['name', tr('Name'), '', name], ...this._mountEditFields(cfg, editPresets)];
      // Mount point: empty = default location — m.path shows the current/default
      // spot as a placeholder (prefilling the computed default would freeze it).
      fields.push(['customPath', tr('Mount point'), m.path || '/absolute/path', cfg.customPath || '']);
      const isRclone = (cfg.type || 's3') === 'rclone' && !cfg.parentId && !cfg.envLocked && cfg.origin !== 'my-storage';
      form.innerHTML = fields.map(([k, label, ph, val, opts]) => {
        if (opts?.type === 'select') {
          return `<label>${escHtml(label)}<select name="${k}">${(opts.options || []).map(([v, l]) =>
            `<option value="${escHtml(v)}"${v === val ? ' selected' : ''}>${escHtml(l)}</option>`).join('')}</select></label>`;
        }
        if (opts?.type === 'textarea') {
          return `<label>${escHtml(label)}<textarea name="${k}" placeholder="${escHtml(ph)}" style="min-height:60px;font-size:11px">${escHtml(val)}</textarea></label>`;
        }
        return `<label>${escHtml(label)}<input name="${k}" value="${escHtml(val)}" placeholder="${escHtml(ph)}" autocomplete="off"></label>`;
      }).join('')
        + `<div class="mounts-note">${tr('Applied on save — a connected mount reconnects with the new settings.')}</div>`
        + (isRclone ? `<div class="mounts-note">${tr("Clear a parameter's value to remove it.")}</div>` : '')
        + `<div class="cfg-err"></div>
           <div class="dialog-actions"><button type="submit" class="btn-create">${tr('Save')}</button></div>`;
      body.appendChild(form);
      // Drive records: driveMode is a real SELECT (the raw text input demanded
      // magic strings — user report "can't change shared drive params"), and
      // teamDriveId gets the same "List shared drives" picker as the add
      // dialog (id-based: the record's stored credentials resolve server-side,
      // children through their parent).
      if ((cfg.type || 's3') === 'drive') {
        const tdInput = form.querySelector('[name="teamDriveId"]');
        if (tdInput) {
          const pick = document.createElement('button');
          pick.type = 'button';
          pick.className = 'mounts-btn';
          pick.textContent = tr('List shared drives');
          pick.style.margin = '4px 0';
          pick.onclick = async () => {
            pick.disabled = true;
            try {
              const r = await api('/api/mounts/shared-drives', { method: 'POST', body: JSON.stringify({ id: m.id }), headers: { 'Content-Type': 'application/json' } });
              const drives = r.drives || [];
              if (!drives.length) { showToast(tr('No shared drives visible to this account')); return; }
              const rect = pick.getBoundingClientRect();
              showContextMenu(rect.left, rect.bottom + 4, drives.map((d) => ({
                label: d.name, action: () => {
                  tdInput.value = d.id;
                  const sel2 = form.querySelector('select[name="driveMode"]'); if (sel2) sel2.value = 'shared-drive';
                },
              })));
            } catch (e2) { showToast(e2.message || tr('Failed'), { type: 'error' }); }
            finally { pick.disabled = false; }
          };
          tdInput.after(pick);
        }
      }
      // Gmail records: labels picker over the record's stored credentials
      if ((cfg.type || 's3') === 'gmail') {
        const li = form.querySelector('[name="labelIds"]');
        if (li) this._wireGmailLabelsPicker({ inputs: { labelIds: li } }, m.id);
      }
      // Drive-backed records get the guided re-auth right in the edit dialog
      // (the error-line button only shows once a mount has FAILED).
      if (this._isDriveBacked(cfg) && !cfg.envLocked && cfg.origin !== 'my-storage' && !cfg.parentId) {
        const rb = document.createElement('button');
        rb.type = 'button';
        rb.className = 'mounts-btn';
        rb.textContent = tr('Re-authorize Google Drive…');
        rb.onclick = () => { close(); this._showDriveReauthDialog(m); };
        form.querySelector('.dialog-actions').prepend(rb);
      }
      // Remove lives HERE, not as a per-row icon (user directive). Env-
      // provisioned personal storage stays deployment-managed: no delete.
      if (m.origin !== 'my-storage') {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'mounts-btn mounts-btn-danger';
        del.textContent = tr('Remove…');
        del.title = tr('Remove this connection (nothing is deleted remotely)');
        del.onclick = async () => {
          const ok = await showConfirmDialog({ title: tr('Remove "{name}"?', { name }), message: tr('The mount record and local mountpoint go away. Nothing is deleted remotely.'), confirmText: tr('Remove'), danger: true });
          if (!ok) return;
          try {
            const r = await api(`/api/mounts/${m.id}`, { method: 'DELETE' });
            if (r?.error) throw new Error(r.error);
            close(); this._renderMounts();
          } catch (e2) { form.querySelector('.cfg-err').textContent = e2.message || 'Failed'; }
        };
        form.querySelector('.dialog-actions').prepend(del);
      }
      const err = form.querySelector('.cfg-err');
      form.onsubmit = async (e) => {
        e.preventDefault(); err.textContent = '';
        // Fields are prefilled with their real values, so send only what CHANGED
        // (an unchanged secret isn't re-encrypted; a cleared field is a change).
        const patch = {};
        const params = {};
        let newKey = '', newVal = '';
        for (const [k, , , orig] of fields) {
          const v = form.querySelector(`[name="${k}"]`).value;
          if (k.startsWith('param:')) {
            // prefilled with the current value; clearing it removes the
            // parameter (server deletes on empty), any other change updates it.
            if (v !== orig) params[k.slice(6)] = v;
          }
          else if (k === 'newParamKey') newKey = v.trim();
          else if (k === 'newParamValue') newVal = v;
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

    _showMintShareDialog(m) {
      const under = `${m.bucket}${m.prefix ? '/' + m.prefix : ''}`;
      const mc = this._mountsData?.mcAvailable;
      this._mountsDialog(tr('Share a folder from “{name}”', { name: m.name }), [
        { key: 'name', label: tr('Share name'), placeholder: 'dataset-v2', value: m.name + '-share' },
        { key: 'folder', label: tr('Folder under {path} (empty = share everything)', { path: under }), placeholder: 'datasets/v2' },
        { key: 'mode', label: tr('Access'), type: 'select', options: [['ro', tr('Read-only')], ['rw', tr('Read-write')]] },
        ...(mc ? [] : [{ key: 'expiryDays', label: tr('Link expires after (days, max 7)'), value: '7' }]),
      ], tr('Create link'), async (v, { close, body, err }) => {
        const r = await api(`/api/mounts/${m.id}/share`, { method: 'POST', body: JSON.stringify(v), headers: { 'Content-Type': 'application/json' } });
        // show the link with a copy button (it embeds the credential — a secret)
        body.innerHTML = `<label>${escHtml(tr('Share link — treat it like a key; send over company chat only'))}</label>
          <textarea readonly style="min-height:84px;font-size:11px">${escHtml(r.link)}</textarea>`;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-create';
        copyBtn.textContent = tr('Copy link');
        copyBtn.onclick = () => { copyText(r.link); showToast(tr('Link copied')); close(); this._renderMounts(); };
        const actions = document.createElement('div');
        actions.className = 'dialog-actions';
        actions.appendChild(copyBtn);
        body.appendChild(actions);
      });
    },

    // Direct CephFS subtree share (My storage): mints a path-scoped cephx key
    // cluster-side; the receiver kernel-mounts the subtree (no WebDAV proxy).
    _showCephShareDialog(m) {
      this._mountsDialog(tr('Share a folder from “{name}” (direct)', { name: m.name }), [
        { key: 'name', label: tr('Share name'), placeholder: 'dataset-v2', value: m.name + '-share' },
        { key: 'subpath', label: tr('Folder under this storage (empty = share everything)'), placeholder: 'datasets/v2' },
        { key: 'mode', label: tr('Access'), type: 'select', options: [['ro', tr('Read-only')], ['rw', tr('Read-write')]] },
      ], tr('Create link'), async (v, { close, body }) => {
        const r = await api(`/api/mounts/${m.id}/ceph-share`, { method: 'POST', body: JSON.stringify(v), headers: { 'Content-Type': 'application/json' } });
        if (r?.error) throw new Error(r.error);
        body.innerHTML = `<label>${escHtml(tr('Direct CephFS link — embeds a scoped key; only works inside this cluster. Send over company chat only; Revoke under Bridge tokens.'))}</label>
          <textarea readonly style="min-height:84px;font-size:11px">${escHtml(r.link)}</textarea>`;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-create';
        copyBtn.textContent = tr('Copy link');
        copyBtn.onclick = () => { copyText(r.link); showToast(tr('Link copied')); close(); this._renderMounts(); };
        const actions = document.createElement('div');
        actions.className = 'dialog-actions';
        actions.appendChild(copyBtn);
        body.appendChild(actions);
      });
    },
  });
}
