// Sidebar "Mounts" tab — rclone S3 mounts + share minting (collaboration P1).
// Third tab next to Folders | Groups: my-storage card (env-provisioned),
// mount list with live status, share-a-folder minting, import-a-link.
import { createModalShell, showToast, showConfirmDialog, showContextMenu, copyText, escHtml, hostStateChip, getInstanceUrl } from './utils.js';
import { protoChip } from './sidebar-rail.js'; // http/https/tcp chip (override menu = this._portProtoMenu, same prototype)
import { t as tr, deviceLocale } from './i18n.js'; // sidebar cluster convention: local `t` is pervasively a task var (verify-r5 A1: + the device's locale for a time)
import { api, oauthLinkRow, mountsDialog, wireOAuthConnect, reauthDialog } from './mounts-dialog.js'; // D1: the ONE dialog component (storage + channel accounts)
import { classifyPrivateKey } from '../ssh-key-format.js'; // shared with the server (CJS pulled into the bundle, like task-color-seq.js)
import { dialRowState, pairNameVerdict, pairNameShown, deviceIdOf, commandOsOf } from '../dial-facts.js'; // lane-pairing ③: THE one dial state of a machine row (PURE, bundled); verify-r4 F6: the name rule + its collision verdict
import { dialAddressPicker, dialStateText, generateConsequenceText } from './dial-address-picker.js'; // lane-pairing ①③: the address choice + the state's words
import { openExitAccessDialog, exitSummaryText, lastRunText } from './exit-access-dialog.js'; // lane-pairing ⑥: "Who can use it" 
import { platformLabel } from '../exit-shell.js'; // lane-exit-run-output E1: the device's stated platform on its row (its shell follows it: Windows ⇒ cmd.exe)


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
  // port forwarding: a plug/connector (two prongs + body + cord) — NOT the
  // power symbol (real report: the old MI.plug read as an on/off switch).
  // Matches the rail Ports-panel connector shape for cross-surface consistency.
  ports: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5V2M10 5V2"/><rect x="4" y="5" width="8" height="5" rx="1.5"/><path d="M8 10v4"/></svg>',
  cross: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  importL: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M5 7l3 3 3-3M3 10v3h10v-3"/></svg>',
  link: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5l3-3M5 8L3.5 9.5a2.5 2.5 0 003.5 3.5L8.5 11.5M8 5l1.5-1.5a2.5 2.5 0 013.5 3.5L11.5 8.5"/></svg>',
  plus: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
  pencil: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3z"/></svg>',
  server: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2.5" width="12" height="4.5" rx="1"/><rect x="2" y="9" width="12" height="4.5" rx="1"/><path d="M4.5 4.75h.01M4.5 11.25h.01"/></svg>',
  bolt: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 1.5L3.5 9h3l-1 5.5L10.5 7h-3l1-5.5z"/></svg>',
  // on-demand exit / egress: a box (the agent) with an arrow leaving it
  exit: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2H3v12h6"/><path d="M7 8h7M11 5l3 3-3 3"/></svg>',
  wrench: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5a3.5 3.5 0 00-3.3 4.6L2.5 10.8a1.4 1.4 0 002 2l3.7-3.7a3.5 3.5 0 004.5-4.4L10.5 7 9 5.5l2.3-2.2a3.5 3.5 0 00-1.8-.8z"/></svg>',
  termNew: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4 6l2.5 2L4 10M8.5 10.5h3.5"/></svg>',
  key: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="8" r="3"/><path d="M8 8h6M11.5 8v2.5M14 8v2"/></svg>',
};

// Private-key import errors: the SERVER sends a stable code, the CLIENT renders
// the localized prose (server strings are for logs / non-browser callers).
const KEY_ERR = {
  'key-encrypted': () => tr('This key needs a passphrase.'),
  'key-bad-passphrase': () => tr('Wrong passphrase — the key could not be unlocked.'),
  'key-not-a-key': () => tr('This does not look like a private key — check that you copied the whole file, including the BEGIN and END lines.'),
  'key-ppk': () => tr('PuTTY .ppk keys cannot be used by OpenSSH. Convert it first: puttygen key.ppk -O private-openssh-new -o key.pem'),
  'key-unsupported': () => tr('This key format is not supported — export it in OpenSSH format.'),
  'key-no-ssh-keygen': () => tr('ssh-keygen is not available on this server, so a passphrase-protected key cannot be unlocked here. Remove its passphrase on your own machine first: ssh-keygen -p -N "" -f <keyfile>'),
  'key-unlock-unavailable': () => tr('Could not unlock the key on this server. Remove its passphrase on your own machine first: ssh-keygen -p -N "" -f <keyfile>'),
};
// every code that should re-open the key dialog instead of failing the add
const KEY_ERR_CODES = new Set([...Object.keys(KEY_ERR), 'key-unlock-failed', 'key-too-large']);
// …and the subset that means "we need a (different) passphrase"
const NEEDS_PASS = new Set(['key-encrypted', 'key-bad-passphrase']);

export function installSidebarMounts(Sidebar) {
  Object.assign(Sidebar.prototype, {

    _initMountsSync() {
      if (this._mountsSyncInit) return;
      this._mountsSyncInit = true;
      this.app.ws.onGlobal((msg) => {
        if ((msg.type === 'mounts-updated' || msg.type === 'machine-mounts-updated' || msg.type === 'hosts-updated') && this._activeTab === 'mounts') this._renderMounts();
        // vscode-style port discovery: a machine started listening on a new
        // port — offer it (the 🔌 dialog on its row forwards/publishes it)
        if (msg.type === 'machine-ports-new' && Array.isArray(msg.ports) && msg.ports.length) {
          const head = msg.ports.slice(0, 3).map((p) => `${p.port}${p.proc ? ' (' + p.proc + ')' : ''}`).join(', ');
          const extra = msg.ports.length > 3 ? ` +${msg.ports.length - 3}` : '';
          showToast(tr('New port on "{name}": {ports} — 🔌 on its machine row forwards it', { name: msg.hostId === '__local__' ? tr('This machine') : (msg.hostName || msg.hostId), ports: head + extra }));
          this._portsDialogRefresh?.(msg.hostId);
        }
        // B-16d9: a listener running from a DELETED working directory — a
        // removed worktree left its dev server behind, silently eating memory
        if (msg.type === 'machine-ports-orphan' && Array.isArray(msg.ports) && msg.ports.length) {
          const head = msg.ports.slice(0, 3).map((p) => `${p.port}${p.proc ? ' (' + p.proc + ')' : ''}`).join(', ');
          showToast(tr('Orphaned dev server: {ports} — its working directory was deleted; the Ports panel can kill it', { ports: head }), { type: 'error', duration: 8000 });
          this._portsDialogRefresh?.(msg.hostId);
        }
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
          : `<span class="mounts-dot mounts-dot-${dot}" title="${m.mounted ? 'Mounted' : escHtml(m.connecting ? tr('Connecting…') : (m.error || 'Not mounted'))}"></span>`}
        ${m.parentId ? '<span class="mounts-child-arrow">↳</span>' : ''}
        <b class="mounts-name" title="${escHtml(m.name)}">${escHtml(m.name)}</b>
        ${m.mode === 'ro' ? '<span class="mounts-badge">RO</span>' : ''}
        ${expired ? '<span class="mounts-badge mounts-badge-red">EXPIRED</span>' : ''}`;
      // A connect legitimately takes 10-25s (server-side _connecting window).
      // Without this chip the row said "Not mounted" the whole time on every
      // client, and the initiating client's row-dimming was wiped by any
      // mounts-updated broadcast that re-rendered the panel mid-connect.
      if (m.connecting && !m.mounted) top.appendChild(hostStateChip('pending', { text: tr('Connecting…'), title: tr('Opening the connection — this can take a few seconds') }));
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
        actions.append(ibtn(MI.plug, m.connecting ? tr('Connecting…') : tr('Connect'), async () => {
          // a connect is already in flight — a second POST is refused server-
          // side (success:false) and would report a bogus connect FAILURE
          if (m.connecting) { showToast(tr('Already connecting…')); return; }
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
          if (m.connecting) { showToast(tr('Already connecting…')); return; } // see the Connect button
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
        // "sign-in has expired…re-authorize" = the server's OAuth-death health
        // message (2.368.6: a dead OneDrive token EIO'd every read while the
        // mount looked healthy and NO string here matched it — the button is
        // the fix path, so it must appear for every auth-death phrasing).
        if (this._isDriveBacked(m) && /invalid_grant|token expired|couldn.t fetch token|unauthenticated|re-authorize/i.test(m.error)) {
          const fix = document.createElement('button');
          fix.className = 'mounts-btn mounts-btn-primary mounts-reauth-btn';
          fix.textContent = tr('Re-authorize {provider}…', { provider: this._oauthProviderNames(m).product });
          fix.onclick = (e) => { e.stopPropagation(); this._showDriveReauthDialog(m); };
          err.appendChild(fix);
        }
        row.appendChild(err);
      }
      return row;
    },

    _isDriveBacked(m) { return m.type === 'drive' || m.type === 'onedrive' || m.type === 'cloud' || (m.type === 'rclone' && m.rcloneType === 'drive'); },

    // Product + sign-in-provider names for the re-auth surfaces — the flow is
    // shared across every OAuth-backed type, so the wording must follow the
    // record's actual provider (a OneDrive mount offered "Re-authorize Google
    // Drive…" was a real report). Brand names stay untranslated.
    _oauthProviderNames(m) {
      const ty = m?.type;
      if (ty === 'onedrive') return { product: 'OneDrive', signin: 'Microsoft' };
      if (ty === 'cloud') {
        const label = { dropbox: 'Dropbox', box: 'Box', pcloud: 'pCloud', yandex: 'Yandex Disk', premiumizeme: 'Premiumize.me', sharefile: 'ShareFile', hidrive: 'HiDrive', jottacloud: 'Jottacloud' }[m.backend]
          || (m.source || '').split(':')[0] || 'Cloud';
        return { product: label, signin: label };
      }
      return { product: 'Google Drive', signin: 'Google' };
    },

    // Re-authorize an EXISTING Drive mount/credential whose token died. Same
    // guided flow as adding one (server runs `rclone authorize drive` with the
    // mount's own OAuth client), but the minted token writes back into the
    // record (+ its children) instead of a form field.
    _showDriveReauthDialog(m) {
      // the dialog's shape lives in the shared component (chunk 3 of the
      // integrations lane: the channel accounts' re-authorize is the SAME
      // dialog); the three storage calls are its parameters
      const prov = this._oauthProviderNames(m);
      return reauthDialog({
        title: tr('Re-authorize "{name}"', { name: m.name }),
        hint: tr('{provider} reported the saved sign-in as expired or revoked. Sign in again to mint a fresh token — nothing else about the mount changes.', { provider: prov.signin }),
        signinLabel: tr('Sign in with {provider}', { provider: prov.signin }),
        provider: prov.signin,
        start: () => api('/api/mounts/gdrive-auth/start', { method: 'POST', body: JSON.stringify({ mountId: m.id }) }),
        status: () => api('/api/mounts/gdrive-auth/status'),
        callback: (url) => api('/api/mounts/gdrive-auth/callback', { method: 'POST', body: JSON.stringify({ url }) }),
        finish: async (token, { close }) => {
          await api(`/api/mounts/${m.id}/drive-token`, { method: 'POST', body: JSON.stringify({ token }) });
          showToast(tr('{provider} re-authorized', { provider: prov.product }));
          close(); this._renderMounts();
        },
      });
    },

    // D2 (docs/design-integrations-per-account.zh.md §6 — the storage side
    // adopts the channel accounts' rule: switching the client IS a
    // re-authorization). The client a Drive / Gmail record RESOLVES to, the
    // way the server resolves it (MountManager._driveClient / gmail-sync
    // _client): a custom id wins (Gmail: id + secret), else the preset key,
    // else the resolver's own fallback (the only preset, else `default`, else
    // rclone's built-in). The SECRET is not the identity — a rotated secret of
    // the same client keeps its tokens and saves directly. Returns null when
    // the Save does not switch the client, else what the consent starts with
    // (`start`) and what lands with the token (`client`).
    _mountClientSwitch(cfg, cur, presets = []) {
      const type = cfg.type || 's3';
      if (!['drive', 'gmail'].includes(type) || cfg.parentId || cfg.envLocked || cfg.origin === 'my-storage') return null;
      const fallback = presets.length === 1 ? presets[0].key : (presets.find((p) => p.key === 'default')?.key || '');
      const of = (r) => {
        const custom = type === 'drive' ? (r.clientId || '') : (r.clientId && r.clientSecret ? r.clientId : '');
        return custom ? `custom:${custom}` : `preset:${r.clientPreset || fallback}`;
      };
      const next = { ...cfg, ...cur };
      if (of(cfg) === of(next)) return null;
      if (type === 'drive' && next.clientId) {
        const client = { clientId: next.clientId, clientSecret: next.clientSecret || '' };
        return { type, start: client, client };
      }
      return { type, start: { clientPreset: next.clientPreset || undefined }, client: { clientPreset: next.clientPreset || '' } };
    },

    // The storage Re-authorize dialog under a SWITCHED client (D2): the same
    // shared dialog as _showDriveReauthDialog (hint, Sign in with {provider},
    // status, the cross-browser link row, paste-back), but the consent starts
    // with the NEW client and the minted token lands WITH it — Drive through
    // drive-token {token, client}, Gmail through one PATCH {clientPreset,
    // token}. Abandoned, the record keeps its current client and sign-in.
    _showClientSwitchReauthDialog(m, cfg, sw, presets = []) {
      const gmail = sw.type === 'gmail';
      const prov = gmail ? { product: 'Gmail', signin: 'Google' } : this._oauthProviderNames(cfg);
      const preset = presets.find((p) => p.key === sw.client.clientPreset);
      const clientName = sw.client.clientId || (preset ? tr('Preset: {name}', { name: preset.label }) : tr('(custom / built-in client)'));
      const base = gmail ? '/api/mounts/gmail-auth' : '/api/mounts/gdrive-auth';
      return reauthDialog({
        title: tr('Re-authorize "{name}"', { name: m.name }),
        hint: tr('The OAuth client changed to {client}. A token only works with the client that minted it — sign in with {provider} again to finish the switch. Until then the connection keeps its current client and sign-in.', { client: clientName, provider: prov.signin }),
        signinLabel: tr('Sign in with {provider}', { provider: prov.signin }),
        provider: prov.signin,
        start: () => api(`${base}/start`, { method: 'POST', body: JSON.stringify(sw.start) }),
        // Gmail's status names a failure `error` (the storage block reads `fail`)
        status: gmail ? async () => { const st = await api(`${base}/status`); return { token: st.token, fail: st.error }; } : () => api(`${base}/status`),
        callback: async (url) => {
          const r = await api(`${base}/callback`, { method: 'POST', body: JSON.stringify({ url }) });
          if (!r.token) throw new Error(r.error || tr('Failed'));
          return r;
        },
        ...(gmail ? { pastePlaceholder: 'http://127.0.0.1:…/?state=…&code=…' } : {}),
        finish: async (token, { close }) => {
          if (gmail) await api(`/api/mounts/${m.id}`, { method: 'PATCH', body: JSON.stringify({ clientPreset: sw.client.clientPreset, token }) });
          else await api(`/api/mounts/${m.id}/drive-token`, { method: 'POST', body: JSON.stringify({ token, client: sw.client }) });
          showToast(tr('{provider} re-authorized', { provider: prov.product }));
          close(); this._renderMounts();
        },
      });
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
        // The row was painted BEFORE the probe started — repaint it now so the
        // probe window (up to 10s on a fresh-ssh probe) reads as "checking"
        // instead of the grey never-tested dot, which looked like a dead machine.
        this._swapHostRow(h, hlist);
        api(`/api/hosts/${h.id}/test`, { method: 'POST' })
          .then((r) => { this._hostStatus[h.id] = { ...r, at: Date.now() }; })
          .catch((e) => { this._hostStatus[h.id] = { error: e.message, at: Date.now() }; })
          .finally(() => {
            this._hostTesting.delete(h.id);
            this._swapHostRow(h, hlist);
          });
      }
    },

    // Rebuild ONE machine row in place (no full re-render → no flicker).
    _swapHostRow(h, hlist) {
      if (!hlist.isConnected) return; // panel re-rendered meanwhile
      const old = [...hlist.children].find(el => el._hostId === h.id);
      if (old) hlist.replaceChild(this._buildHostRow(h), old);
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
      const pb = document.createElement('button');
      pb.className = 'mounts-icon-btn';
      pb.innerHTML = MI.ports; pb.title = tr('Ports on this instance (open via the app, publish to the internet)');
      pb.onclick = (e) => { e.stopPropagation(); this._showPortsDialog({ id: '__local__', name: tr('This machine'), transport: 'local' }); };
      const nb = document.createElement('button');
      nb.className = 'mounts-icon-btn';
      nb.innerHTML = MI.termNew; nb.title = tr('New session on this machine');
      nb.onclick = (e) => { e.stopPropagation(); this.app.showNewSessionDialog?.({}); };
      actions.append(pb, nb);
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
      const testing = !isDial && this._hostTesting?.has(h.id);
      // lane-pairing ③: a dial row's dot, badge, sub-line and tooltip all read THE one state (PURE dialRowState) —
      // never `online` alone (a refused dial read "offline" while the server had refused it by name)
      const rs = isDial ? dialRowState(h) : null;
      const dialWords = rs ? dialStateText(rs) : '';
      const dot = isDial ? (rs.state === 'connected' ? 'ok' : (rs.state === 'auth-fail' || rs.state === 'refused') ? 'err' : 'off') : (st ? (st.ok ? 'ok' : 'err') : 'off');
      const dotTip = isDial
        ? dialWords + (rs.state === 'refused' && h.dial?.lastRefusal?.from ? ` · ${tr('from {addr}', { addr: h.dial.lastRefusal.from })}` : '')
        : (testing ? tr('Checking the connection…') : (st ? (st.ok ? `${st.latencyMs}ms` : (st.error || 'unreachable')) : 'Not tested yet'));
      const nameTip = isDial ? tr('Dial-out device — it connects TO this instance over a websocket (no ssh)') : `${h.user}@${h.host}:${h.port}`;
      const badge = isDial
        ? `<span class="mounts-badge${rs.state === 'connected' ? '' : ' mounts-badge-red'}" title="${escHtml(tr('Dial-out device — it connects TO this instance over a websocket (no ssh)'))}">${escHtml(rs.state === 'connected' ? tr('DEVICE') : rs.state === 'auth-fail' ? tr('KEY REFUSED') : rs.state === 'refused' ? tr('REFUSED') : tr('OFFLINE'))}</span>`
        : (st?.ok && st.tools ? `<span class="mounts-badge${st.tools.claude && st.tools.dtach ? '' : ' mounts-badge-red'}" title="Ready to run sessions — dtach ${st.tools.dtach ? '✓' : '✗ (missing)'}, Node ${st.tools.node ? '✓' : '✗ (missing)'}, Claude ${st.tools.claude ? '✓' : '✗ (missing)'}. Click Set up to install what’s missing.">${st.tools.claude && st.tools.dtach ? 'READY' : 'NEEDS SETUP'}</span>` : '');
      const top = document.createElement('div');
      top.className = 'mounts-row-top mounts-host-top'; // naive-user N-row: wraps its 8 actions under the name (style.css)
      top.innerHTML = `
        <span class="mounts-dot mounts-dot-${dot}" title="${escHtml(dotTip)}"></span>
        <b class="mounts-name" title="${escHtml(nameTip)}">${escHtml(h.name)}</b>
        ${badge}`;
      // The auto-probe can take up to 10s (fresh ssh) — during it the grey dot
      // was indistinguishable from "never tested / dead machine". Say checking.
      if (testing) top.appendChild(hostStateChip('pending', { text: tr('testing…'), title: tr('Checking the connection…') }));
      else if (!isDial && st && !st.ok) top.appendChild(hostStateChip('error', { text: tr('unreachable'), title: st.error || '' }));
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
      // B-6640: graduate an ssh machine to dial-out (installs the daemon as a
      // persistent service so it dials back over ws — banner-hang/ControlMaster/
      // per-op-child taxes gone; ssh stays as the rescue channel). h.graduated
      // + h.dialLive come from hosts.list().
      if (!isDial) actions.append(ibtn(MI.bolt, h.graduated
        ? tr('Dial-out: {state} — click to manage (ssh stays as rescue)', { state: h.dialLive ? tr('LIVE') : tr('installed, not dialed in') })
        : tr('Upgrade "{name}" to dial-out (faster + self-healing over a flaky link; ssh kept as rescue)', { name: h.name }),
        () => { this._showGraduateDialog(h); }, h.graduated ? (h.dialLive ? 'mounts-icon-accent' : '') : ''));
      // lane-pairing ②: the pairing SHEET — opening it mints nothing; its head says whether the old command ever
      // worked, and only "Generate a new command" rotates the token (saying the old one stops working)
      if (isDial) actions.append(ibtn(MI.retry, tr('Pairing command — see the dial state, pick an address, generate a new command (keeps the row)'), async () => {
        this._showDevicePairDialog(h);
      }));
      actions.append(
        ibtn(MI.folderPush, tr('Mount a folder from this VibeSpace onto "{name}"', { name: h.name }), () => { this._showHostMountDialog(h); }),
        ibtn(MI.folderPull, tr('Mount a folder from "{name}" into this VibeSpace', { name: h.name }), () => { this._showMachinePullDialog(h); }),
        ibtn(MI.ports, tr('Forward a port from "{name}" (open its dev servers here)', { name: h.name }), () => { this._showPortsDialog(h); }),
        // lane-pairing ⑥: the exit icon OPENS "Who can use it" (two lists — borrow the network / run commands);
        // accent while either grant is not nobody
        ibtn(MI.exit, tr('Who can use "{name}" as an exit…', { name: h.name }),
          async () => { openExitAccessDialog(this.app, { hostId: h.id, name: h.name }); },
          (h.exit && ((h.exit.use && h.exit.use.mode && h.exit.use.mode !== 'nobody') || (h.exit.run && h.exit.run.mode && h.exit.run.mode !== 'nobody'))) ? 'mounts-icon-accent' : ''),
        ibtn(MI.termNew, isDial ? tr('New session on this device') : 'New session on this host', () => { this.app.showNewSessionDialog?.({ hostId: h.id, hostName: h.name }); }),
        ibtn(MI.cross, isDial ? tr('Unpair (the device can no longer dial in)') : 'Remove host', async () => {
          const ok = await showConfirmDialog(isDial
            ? { title: tr('Unpair "{id}"?', { id: h.name }), message: tr('Its dial token is revoked; re-pairing mints a new one. Its mounted folders here are unmounted.'), confirmText: tr('Unpair'), danger: true }
            : { title: `Remove "${h.name}"?`, message: 'Only the registry entry goes away — nothing on the remote machine is touched.', confirmText: 'Remove', danger: true });
          // verify-r6 U1: a refused / failed removal is SAID (the api() throw was unguarded — the click did nothing, silently)
          if (ok) {
            try { await api(`/api/hosts/${h.id}`, { method: 'DELETE' }); if (isDial) showToast(tr('Unpaired')); }
            catch (e) { showToast(tr('Could not remove "{name}" — {why}', { name: h.name, why: (e && e.message) || tr('server unreachable') }), { type: 'error' }); }
          }
        }, 'mounts-icon-danger'),
      );
      top.appendChild(actions);
      const sub = document.createElement('div');
      sub.className = 'mounts-path';
      sub.style.direction = 'ltr';
      if (isDial) {
        // lane-exit-run-output E1: the device's STATED platform (the hub keeps it from its dial headers) — a Windows
        // machine runs an agent's command under cmd.exe, so the row says what it is
        const plat = platformLabel(h.dial && h.dial.lastAccept && h.dial.lastAccept.platform);
        sub.textContent = (rs.state === 'connected' ? `${tr('dial-out device')} · ${dialWords}` : dialWords) + (plat ? ` · ${plat}` : '');
        sub.title = dotTip;
        sub.classList.add('mounts-dial-state');
        sub.dataset.dialState = rs.state;
      } else {
        const keyLabel = h.keySource === 'imported' ? tr('using imported key')
          : h.keySource === 'app' ? tr('using VibeSpace key')
          : h.keySource === 'default' ? tr('using system ssh keys')
          : (h.keyPath ? tr('using stored key') : ''); // pre-2.153.4 records: provenance unknown
        sub.textContent = `${h.user}@${h.host}${h.port !== 22 ? ':' + h.port : ''}${keyLabel ? ' · ' + keyLabel : ''}`;
      }
      row.append(top, sub);
      // lane-pairing ⑥: the exit lists' summary (every machine — a record with no `exit` reads nobody / nobody through
      // the ONE reader) + the last command run on the machine (who / when / exit code)
      {
        const ex = document.createElement('div');
        ex.className = 'mounts-path mounts-exit-line';
        ex.textContent = exitSummaryText(h.exit);
        row.appendChild(ex);
        if (h.exit && h.exit.lastRun) {
          const lr = document.createElement('div');
          lr.className = 'mounts-path mounts-exit-line mounts-exit-last';
          lr.textContent = lastRunText(h.exit.lastRun);
          lr.title = h.exit.lastRun.cmd || '';
          row.appendChild(lr);
        }
      }
      // Surface a FAILED probe in the row itself (real report: red dot with
      // no visible reason — the error lived only in the dot's hover tooltip,
      // invisible on touch and undiscoverable on a 6px target). Same errline
      // pattern as storage rows; full text in title.
      if (!isDial && st && !st.ok) {
        const err = document.createElement('div');
        err.className = 'mounts-errline';
        err.textContent = tr('Couldn’t connect:') + ' ' + String(st.error || 'unreachable').slice(0, 300);
        err.title = String(st.error || '');
        row.appendChild(err);
      }
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
          <span class="mounts-badge" title="${escHtml(tr('Mounted at {mp} (read-only, over the device link)', { mp: m.mountpoint }))}">⬇ ${escHtml(tr('from machine'))}</span>`;
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
        // the machine's own mount table says the mount is GONE (real report:
        // the user umounted it ON the Mac; the row stayed green with no way
        // to re-mount) — amber + a ↻
        const pushGone = !pushDown && m.remoteMounted === false;
        const pushDotTip = pushDown
          ? tr('Machine is offline — the tunnel is down; the mount heals when its daemon reconnects')
          : pushGone
            ? tr('Not mounted on the machine anymore (unmounted there?) — ↻ re-mounts it')
            : (m.mode === 'rw' ? tr('Read-write') : tr('Read-only'));
        top.innerHTML = `
          <span class="mounts-dot mounts-dot-${pushDown ? 'err' : pushGone ? 'off' : 'ok'}" title="${escHtml(pushDotTip)}"></span>
          <b class="mounts-name" title="${escHtml(m.folder)}">${escHtml(m.folder.split('/').pop() || m.folder)}</b>
          <span class="mounts-badge" title="${escHtml(viaTip)}">⬆ ${escHtml(pushGone ? tr('gone on machine') : tr('on machine'))} · ${escHtml(viaLabel)}</span>`;
        if (pushGone) {
          const re = document.createElement('button');
          re.className = 'mounts-icon-btn';
          re.innerHTML = MI.retry; re.title = tr('Re-mount on the machine');
          re.onclick = async (e) => {
            e.stopPropagation(); re.disabled = true;
            try { await api(`/api/machine-mounts/${encodeURIComponent(m.id)}/remount`, { method: 'POST' }); showToast(tr('Mounted')); }
            catch (err) { showToast(err.message, { type: 'error' }); }
            this._renderMounts();
          };
          actions.append(re);
        }
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
      // full journey, each side labeled — two sibling rows with bare '→ path'
      // were indistinguishable in a bidirectional pair (real report)
      sub.textContent = m.dir === 'pull'
        ? `${h.name}:${m.remotePath} → ${tr('here')}:${m.mountpoint}`
        : `${tr('here')}:${m.folder} → ${h.name}:${m.mountpoint}`;
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
        { key: 'mountpoint', label: tr('Mount point on the machine (optional)'), placeholder: tr('default: ~/vibespace-remote/<folder>'), autocomplete: () => `/api/hosts/${h.id}/dir-complete` },
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
        { key: 'mountpoint', label: tr('Mount point here (optional)'), placeholder: tr('default: ~/vibespace-machines/<machine>-<folder>'), autocomplete: 'local' },
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
          if (!await this._connectNewMount(r.id, close)) return;
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
        // live refresh hook: the machine-ports-new broadcast re-renders an
        // OPEN dialog for this machine; self-clears once the dialog is gone
        this._portsDialogRefresh = (hid) => {
          if (!body.isConnected) { this._portsDialogRefresh = null; return; }
          if (hid === h.id) render().catch(() => {});
        };
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
            info.innerHTML = `<b>${f.targetHost ? escHtml(f.targetHost) + ':' : ':'}${f.remotePort}</b> → <span class="mounts-name" style="color:var(--accent)">127.0.0.1:${f.localPort || '?'}</span> ${protoChip(f.proto, { over: !!f.protoOverride })}${f.error ? ` <span style="color:var(--red,#e55)">(${escHtml(f.error)})</span>` : ''}`;
            const chip = info.querySelector('.ports-proto');
            if (chip) chip.onclick = (ev) => this._portProtoMenu(ev, f, render);
            const open = document.createElement('button'); open.className = 'btn-create'; open.textContent = tr('Open'); open.disabled = !f.url;
            open.onclick = () => openForward(f.url);
            const stop = document.createElement('button'); stop.className = 'mounts-btn'; stop.textContent = tr('Stop');
            stop.onclick = async () => { try { await api(`/api/port-forward/${encodeURIComponent(f.id)}`, { method: 'DELETE' }); render(); } catch (e) { showToast(e.message, { type: 'error' }); } };
            const acts = document.createElement('span'); acts.style.display = 'flex'; acts.style.gap = '6px'; acts.append(open, stop);
            // public exposure (frp relay) — a shareable internet URL
            if (frpOk) {
              const pub = document.createElement('button'); pub.className = 'mounts-btn';
              pub.textContent = f.published ? tr('Stop public') : tr('Publish public');
              pub.title = f.published ? tr('Stop sharing publicly')
                : f.proto === 'tcp' ? tr('Publish (raw TCP → tcp://host:port)')
                : f.proto === 'https' ? tr('Publish (HTTPS backend → https://host:port passthrough)')
                : f.proto === 'http' ? tr('Publish (HTTP → trusted https:// link)')
                : tr('Make a public internet URL via the relay (shareable preview link)');
              pub.onclick = async () => {
                pub.disabled = true;
                try {
                  // fetchJson never throws — a 4xx comes back as {error}
                  const r2 = await api(`/api/port-forward/${encodeURIComponent(f.id)}/publish`, { method: f.published ? 'DELETE' : 'POST' });
                  if (r2?.error) throw new Error(r2.error);
                  showToast(f.published ? tr('Public URL removed') : tr('Public URL: {u}', { u: r2?.publicUrl || '?' }));
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
        // detect + manual. Accepts a bare port (a service on THIS machine) OR
        // ip:port / host:port to reach ANOTHER machine on this machine's LAN —
        // the machine becomes a jump host into its internal network.
        const manual = document.createElement('div'); manual.style.display = 'flex'; manual.style.gap = '6px'; manual.style.margin = '4px 0 10px';
        const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = tr('port or ip:port (e.g. 5173, or 10.0.0.5:8080 for a LAN machine)'); inp.className = 'settings-input-text'; inp.style.flex = '1';
        const fwd = document.createElement('button'); fwd.className = 'btn-create'; fwd.textContent = tr('Forward');
        const parseTarget = (v) => {
          v = String(v || '').trim();
          const m = v.match(/^(?:(\[[0-9a-fA-F:]+\]|[A-Za-z0-9._-]+):)?(\d{1,5})$/); // [host:]port
          if (!m) return null;
          const port = Number(m[2]); if (port < 1 || port > 65535) return null;
          return { port, targetHost: (m[1] || '').replace(/^\[|\]$/g, '') };
        };
        const doForward = async (raw) => {
          const t = parseTarget(raw);
          if (!t) { showToast(tr('Enter a port (5173) or ip:port (10.0.0.5:8080)'), { type: 'error' }); return; }
          fwd.disabled = true;
          try { const r = await api(`/api/hosts/${h.id}/port-forward`, { method: 'POST', body: JSON.stringify({ port: t.port, targetHost: t.targetHost }) });
            if (r?.error) throw new Error(r.error);
            const label = t.targetHost ? `${t.targetHost}:${t.port}` : `:${t.port}`;
            if (r.url) { showToast(tr('Forwarded {p} → {u}', { p: label, u: r.url })); openForward(r.url); } else render();
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
          const portRow = (p) => {
            const r = document.createElement('div'); r.className = 'mounts-row'; r.style.padding = '3px 0';
            if (p.hidden) r.style.opacity = '0.55';
            const lbl = document.createElement('span'); lbl.style.flex = '1'; lbl.innerHTML = `<b>:${p.port}</b>${p.proc ? ` <span class="empty-hint">${escHtml(p.proc)}</span>` : ''} ${protoChip(p.proto)}${p.orphan ? ` <span class="ports-orphan" title="${escHtml(tr('This process is listening from a DELETED working directory — a removed worktree left its dev server running'))}">${escHtml(tr('orphan'))}</span>` : ''}`;
            // orphan (deleted cwd) + local: offer Kill instead of Forward
            if (p.orphan && p.pid && h.id === '__local__') {
              const kb = document.createElement('button'); kb.className = 'mounts-btn'; kb.textContent = tr('Kill');
              kb.title = tr('Kill this orphaned process');
              kb.onclick = async () => {
                try {
                  const kr = await api('/api/ports/kill-orphan', { method: 'POST', body: JSON.stringify({ pid: p.pid }) });
                  if (kr?.error) throw new Error(kr.error);
                  showToast(tr('Orphaned process killed')); render();
                } catch (e) { showToast(e.message, { type: 'error' }); }
              };
              r.append(lbl, kb); return r;
            }
            const b = document.createElement('button'); b.className = 'mounts-btn';
            b.textContent = forwarded.has(p.port) ? tr('forwarded') : tr('Forward'); b.disabled = forwarded.has(p.port);
            b.onclick = () => doForward(p.port);
            r.append(lbl, b); return r;
          };
          // vscode-style: known non-web system listeners fold behind an expander
          const hid = ports.filter((p) => p.hidden);
          for (const p of ports.filter((p) => !p.hidden)) listWrap.append(portRow(p));
          if (hid.length) {
            const ex = document.createElement('button'); ex.className = 'ports-sys-expander';
            ex.textContent = tr('+ {n} system listeners', { n: hid.length });
            ex.onclick = () => { ex.replaceWith(...hid.map(portRow)); };
            listWrap.append(ex);
          }
        } catch (e) {
          listWrap.innerHTML = `<div class="usage-section-title">${escHtml(tr('Detected listening ports'))}</div><div class="empty-hint" style="color:var(--red,#e55)">${escHtml(e.message)}</div>`;
        }
      };
      render();
    },

    /**
     * The "Private key" sub-dialog. Resolves {privateKey, keyPassphrase} or
     * null if dismissed. Re-openable PREFILLED so a wrong passphrase doesn't
     * make the user paste the key again.
     *
     * Detection here is an AFFORDANCE ONLY — it reveals the passphrase row, it
     * NEVER blocks submit (the server is authoritative, and a format we
     * misjudge must not become a wall). The "Key has a passphrase?" toggle is
     * always reachable for exactly that case.
     */
    _askPrivateKey({ text = '', error = '', showPass = false } = {}) {
      return new Promise((resolve) => {
        let settled = false;
        const done = (v) => { if (!settled) { settled = true; resolve(v); } };
        this._mountsDialog(tr('Private key'), [], tr('Use this key'), async (_, ctx) => {
          const val = ta.value || '';
          if (!val.trim()) throw new Error(tr('Paste or upload the key first'));
          // RAW values — a passphrase may legitimately have leading/trailing
          // whitespace (verified: ssh-keygen accepts 'p@ss w/ spaces '), so
          // this deliberately bypasses _mountsDialog's trimming field reader.
          // ORDER IS LOAD-BEARING: settle BEFORE close(). createModalShell's
          // close() invokes onClose on EVERY path including this one, so a
          // close-then-resolve would let the onClose fire done(null) first and
          // "Use this key" would behave exactly like Cancel (caught by the
          // headless dialog test — idempotency alone does not save you, the
          // FIRST settle wins).
          done({ privateKey: val, keyPassphrase: passIn.value || '' });
          ctx.close();
        }, { onClose: () => done(null) });

        const ov = document.getElementById('mounts-dialog-overlay');
        const body = ov.querySelector('.dialog-body');

        const note = document.createElement('p');
        note.className = 'agents-note';
        note.textContent = tr('Stored securely on the server. If the key is passphrase-protected, enter the passphrase below — it unlocks the key once and is never saved.');

        const ta = document.createElement('textarea');
        ta.id = 'mounts-key-paste';
        ta.placeholder = '-----BEGIN OPENSSH PRIVATE KEY-----';
        ta.style.cssText = 'min-height:130px;font-size:10px;font-family:monospace';
        ta.value = text;

        const up = document.createElement('input');
        up.type = 'file';
        up.onchange = () => {
          const f = up.files[0];
          if (f) { const r = new FileReader(); r.onload = () => { ta.value = r.result; detect(); }; r.readAsText(f); }
        };

        // status line for detection verdicts (never a blocker)
        const status = document.createElement('div');
        status.className = 'mounts-field-hint';

        const passToggle = document.createElement('button');
        passToggle.type = 'button';
        passToggle.className = 'mounts-btn';
        passToggle.style.marginTop = '6px';
        passToggle.textContent = tr('Key has a passphrase?');
        passToggle.onclick = () => { revealPass(true); passIn.focus(); };

        const passWrap = document.createElement('div');
        // NOTE: display:none, NOT a `hidden` class — this project has no global
        // `.hidden {display:none}` rule (that exact trap already bit the
        // minimap label and the chat drop overlay).
        passWrap.style.display = 'none';
        const passLabel = document.createElement('label');
        passLabel.textContent = tr('Passphrase');
        const passIn = document.createElement('input');
        passIn.type = 'password';
        passIn.autocomplete = 'off';
        const passHint = document.createElement('div');
        passHint.className = 'mounts-field-hint';
        passHint.textContent = tr('Used once to unlock the key, then discarded — VibeSpace never stores it.');
        passWrap.append(passLabel, passIn, passHint);

        const revealPass = (on) => {
          // once revealed it STAYS revealed — auto-hiding would yank a field
          // the user is typing into
          if (on) { passWrap.style.display = ''; passToggle.style.display = 'none'; }
        };

        const detect = () => {
          const v = ta.value || '';
          if (!v.trim()) { status.textContent = ''; status.style.color = ''; status.title = ''; return; }
          const info = classifyPrivateKey(v);
          status.title = info.cipher || '';
          if (info.format === 'ppk') {
            status.style.color = 'var(--red, #e55)';
            status.textContent = KEY_ERR['key-ppk']();
          } else if (info.format === 'ssh2') {
            status.style.color = 'var(--red, #e55)';
            status.textContent = KEY_ERR['key-unsupported']();
          } else if (info.format === 'unknown' || info.malformed) {
            status.style.color = 'var(--yellow, #e5c07b)';
            status.textContent = KEY_ERR['key-not-a-key']();
          } else if (info.encrypted) {
            status.style.color = '';
            status.textContent = tr('This key is passphrase-protected — enter its passphrase below.');
            revealPass(!passIn.value); // don't steal focus from a passphrase already being typed
          } else {
            status.style.color = '';
            status.textContent = '';
          }
        };
        ta.addEventListener('input', detect);

        body.prepend(note, ta, up, status, passToggle, passWrap);
        if (error) {
          const errEl = ov.querySelector('.cfg-err');
          if (errEl) errEl.textContent = error;
        }
        if (showPass) revealPass(true);
        detect();
        if (showPass) passIn.focus(); else ta.focus();
      });
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
      ], 'Add machine', async (v, { close, err }) => {
       // A sub-dialog (key paste / generated public key) reuses the SAME
       // overlay id, and createModalShell REMOVES the existing one — so from
       // here on THIS dialog may be detached and _mountsDialog's inline error
       // element would render into nothing. Anything thrown past that point is
       // surfaced as a toast instead of failing silently.
       try {
        let keyPath = null;
        let privateKey = null;
        let keyPassphrase = '';
        if (v.keyChoice === 'paste') {
          const k = await this._askPrivateKey();
          if (!k) throw new Error(tr('Key import cancelled'));
          ({ privateKey, keyPassphrase } = k);
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
        // Key errors RETRY in place: re-open the key sub-dialog prefilled with
        // what was pasted (+ the localized reason) instead of dead-ending the
        // whole Add-machine flow. The passphrase is only ever sent with the
        // attempt that needs it — never stored client-side beyond this loop.
        let r;
        for (;;) {
          try {
            r = await api('/api/hosts', {
              method: 'POST',
              body: JSON.stringify({ name: v.name, user: v.user, host: v.host, port: v.port, keyPath, privateKey, keyPassphrase: keyPassphrase || undefined }),
            });
            break;
          } catch (e) {
            if (!privateKey || !KEY_ERR_CODES.has(e.code)) throw e;
            const again = await this._askPrivateKey({
              text: privateKey,
              error: (KEY_ERR[e.code] || (() => e.message))(),
              showPass: NEEDS_PASS.has(e.code),
            });
            if (!again) throw new Error(tr('Key import cancelled'));
            ({ privateKey, keyPassphrase } = again);
          }
        }
        close();
        if (r.key && r.key.fingerprint) {
          showToast(tr('Imported {type} key {fp}', { type: r.key.type || '', fp: r.key.fingerprint }));
        }
        // immediate connectivity test so the row shows a real status
        this._hostStatus = this._hostStatus || {};
        try { this._hostStatus[r.id] = await api(`/api/hosts/${r.id}/test`, { method: 'POST' }); showToast('Host reachable'); }
        catch (e) { this._hostStatus[r.id] = { ok: false, error: e.message }; showToast('Added, but unreachable: ' + e.message, { type: 'error' }); }
        this._renderMounts();
       } catch (e) {
         if (!err.isConnected) { showToast(e.message || tr('Failed'), { type: 'error' }); return; }
         throw e; // dialog still on screen — let it render the error inline
       }
      });
    },


    // Shared by "Pair a device" and the machine row's pairing sheet: fill a modal body with the per-OS installer
    // command for a mint result. lane-pairing ①: BOTH urls of every command are the address the user CHOSE
    // (`r.httpBase` + the bundle / installer paths, and `r.dialUrl`) — never location.origin, never a guess.
    _fillPairCommandBody(body, close, r, { regenerated = false, deviceOs = null } = {}) {
      const httpBase = String(r.httpBase || '').replace(/\/$/, '');
      const dialUrl = String(r.dialUrl || '');
      // The full installer line: bundle + dial URL + BOTH tokens — the hostToken is what the daemon verifies OUR
      // mux hello against; an install without it can dial in but rejects every server command. Per-OS commands:
      // macOS/Linux share the bash installer; Windows gets the PowerShell one (EXPERIMENTAL). The installer
      // CHECKS the dial address before it writes anything (--dial-check) and stops with the reason.
      const CMDS = {
        // verify-r3 B-inst: the tokens in the ENVIRONMENT of the installer's shell — a flag sat in `bash`'s command line,
        // readable by every user of the device (ps / /proc) for the whole install
        mac: `curl -fsSL ${httpBase}/vibespace-device-install.sh | \\\n  VIBESPACE_DIAL_TOKEN=${r.dialToken} \\\n  VIBESPACE_HOST_TOKEN=${r.hostToken} \\\n  bash -s -- \\\n  --bundle-url ${httpBase}/vibespace-device.js \\\n  --dial '${dialUrl}'`,
        linux: `curl -fsSL ${httpBase}/vibespace-device-install.sh | \\\n  VIBESPACE_DIAL_TOKEN=${r.dialToken} \\\n  VIBESPACE_HOST_TOKEN=${r.hostToken} \\\n  bash -s -- \\\n  --bundle-url ${httpBase}/vibespace-device.js \\\n  --dial '${dialUrl}'`,
        win: `& ([scriptblock]::Create((iwr -UseBasicParsing ${httpBase}/vibespace-device-install.ps1).Content)) \`\n  -BundleUrl ${httpBase}/vibespace-device.js \`\n  -Dial '${dialUrl}' \`\n  -DialToken ${r.dialToken} -HostToken ${r.hostToken}`,
      };
      const NOTES = {
        mac: tr('macOS: nothing to install first — the command brings its own Node if needed. No ssh, no FUSE.'),
        linux: tr('Linux: needs curl (or wget) — Node is installed automatically if the machine has none.'),
        win: tr('Windows (EXPERIMENTAL, PowerShell): Node is downloaded automatically if missing.'),
      };
      body.innerHTML = '';
      const done = document.createElement('p');
      done.className = 'agents-note device-pair-head';
      done.textContent = r.updatedInPlace
        ? tr('Re-paired "{id}" — the connected device was updated in place; the new pairing takes effect within ~30s. Run the command below only if the dot doesn’t come back:', { id: r.deviceId })
        : (regenerated || r.repair)
          ? (r.holderConnected
            // verify-r2 B8-r2: the holder is DISCONNECTED at the mint (its link was what the retired command kept), never left connected "until its next dial"
            ? tr('A new command for "{id}" — the device that was connected has been disconnected; it holds the previous command, which no longer works. Run this on the device:', { id: r.deviceId })
            : regenerated
              ? tr('A new command for "{id}" — the one you generated before stops working now. Run this on the device:', { id: r.deviceId })
              // verify-r5 A1: "Replace its pairing" from "Pair a device" — the command it replaced was made elsewhere
              : tr('Replaced the pairing of "{id}" — the command it held stops working now. Run this on the device:', { id: r.deviceId }))
          : tr('Paired as "{id}". Pick the device’s OS and run the command on it — it starts the agent and dials in; the device then appears as a machine row above (green dot = connected):', { id: r.deviceId });
      const seg = document.createElement('div');
      seg.className = 'device-pair-os';
      const ta = document.createElement('textarea');
      ta.readOnly = true; ta.className = 'device-pair-cmd'; ta.spellcheck = false;
      const note = document.createElement('p');
      note.className = 'agents-note';
      // verify-r4 F7: a paired device's command in ITS OS's form (the OS its daemon states on every dial — the receiver's
      // fact); only a device nobody has heard from yet gets the browser's OS as a guess (the tabs are the choice). The owner
      // opens VibeSpace on Windows: a paired Mac's "new command" was the PowerShell form
      const guessOs = deviceOs || (/Mac/i.test(navigator.platform || '') ? 'mac' : /Win/i.test(navigator.platform || '') ? 'win' : 'linux');
      const chips = {};
      const setOs = (k) => {
        ta.value = CMDS[k]; note.textContent = NOTES[k];
        for (const [ck, el] of Object.entries(chips)) el.className = ck === k ? 'btn-create' : 'btn-cancel';
      };
      for (const [k, label] of [['mac', 'macOS'], ['linux', 'Linux'], ['win', 'Windows']]) {
        const b = document.createElement('button');
        b.textContent = label; b.onclick = () => setOs(k);
        chips[k] = b; seg.appendChild(b);
      }
      const tail = document.createElement('p');
      tail.className = 'agents-note';
      tail.textContent = tr('The installer registers the daemon with launchd (macOS) / systemd (Linux): it starts on boot and auto-restarts if it crashes. One machine can pair to several VibeSpace instances — each install keeps its own state, keyed by this instance’s address. Pairing the same name again replaces its token. Everything it installs — including a private Node if the machine had none — lives under ~/.vibespace on the device; removing that folder removes it all.');
      const act2 = document.createElement('div');
      act2.className = 'dialog-actions device-pair-actions';
      const copy = document.createElement('button');
      copy.className = 'btn-create device-pair-copy'; copy.textContent = tr('Copy command');
      copy.onclick = () => { copyText(ta.value); showToast(tr('Command copied')); };
      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn-cancel'; closeBtn.textContent = tr('Close'); closeBtn.onclick = () => close();
      act2.append(closeBtn, copy);
      body.append(done, seg, ta, note, tail, act2);
      // verify-r5 A1: THIS command can be replaced while it is on screen (another window pressed Generate / Replace, or
      // another user) — the device row's generation moves past the one minted here: said on this sheet, once
      const gen = Number(r.generation) || 0;
      if (gen && r.deviceId) {
        const gone = document.createElement('p');
        gone.className = 'agents-note device-pair-replaced'; gone.style.display = 'none';
        body.insertBefore(gone, seg);
        const genTick = setInterval(() => {
          if (!body.isConnected) { clearInterval(genTick); return; }
          const h2 = (this._hostsData?.hosts || []).find((x) => x && x.deviceId === r.deviceId);
          const d2 = h2 && h2.dial;
          if (d2 && Number(d2.generation) > gen) {
            gone.textContent = tr('This command no longer works — a newer one was generated for "{id}" at {time} (another window, or another user). Use the newest command.', { id: r.deviceId, time: new Date(Number(d2.tokenMintedAt) || Date.now()).toLocaleTimeString(deviceLocale(), { hour: '2-digit', minute: '2-digit' }) });
            gone.style.display = ''; clearInterval(genTick);
          }
        }, 1000);
      }
      setOs(guessOs);
      ta.onclick = () => ta.select();
    },

    // Pair a NAT'd machine as a dial-out DEVICE (B-e5e7, docs/device-agent.md) — and, with `h`, the machine row's
    // PAIRING SHEET for an existing device (lane-pairing ①②): the ADDRESS the device dials is CHOSEN from what the
    // server can name for itself (GET /api/device/dial-addresses), and the token is minted ONLY by the button
    // ("Create pairing" / "Generate a new command") — opening this never rotates anything (the owner's Mac: every
    // re-open minted a new token and the device kept dialing with the old one). Machines you can ssh into never
    // need this — Add machine installs the agent over ssh at first use.
    async _showDevicePairDialog(h = null) {
      const existing = !!(h && h.deviceId);
      const { body, close } = createModalShell({ id: 'device-pair-dialog', title: existing ? tr('Pairing command — "{name}"', { name: h.name }) : tr('Pair a device'), bodyClass: 'device-pair-body', escapeToClose: true });
      if (existing) {
        // the sheet's head: the device's dial state, so the user sees whether the OLD command ever worked
        const stp = document.createElement('p');
        const rs = dialRowState(h);
        stp.className = 'agents-note device-pair-state';
        stp.dataset.dialState = rs.state;
        stp.textContent = dialStateText(rs);
        body.appendChild(stp);
      } else {
        const note = document.createElement('p');
        note.className = 'agents-note';
        note.textContent = tr('For machines you can’t ssh into (a laptop, a Mac at home): the device dials OUT to this instance over a websocket, so it works behind NAT with nothing to expose. Nothing to install first — the installer brings its own Node when the machine has none.');
        const note2 = document.createElement('p');
        note2.className = 'agents-note';
        note2.textContent = tr('Re-running the command on the device REPLACES its pairing with this instance. Pairing the same device with several VibeSpace instances is fine — each instance gets its own daemon on the device.');
        body.append(note, note2);
      }
      // verify-r1 B8: while a device is dialed in, the user CHOOSES whether the new command is handed to it over its
      // link (a device they trust: a new address) or whether whoever holds the previous command is locked out (the
      // default — a rotation is also how a leaked command is retired)
      let keepBox = null, keepLbl = null, keepNote = null;
      const keepSince = existing && h.dial ? (h.dial.lastConnectAt ?? null) : null; // verify-r6 P1: the link this sheet shows
      if (existing && (h.online || h.dialLive)) {
        keepLbl = document.createElement('label');
        keepLbl.className = 'device-pair-keep';
        keepBox = document.createElement('input'); keepBox.type = 'checkbox'; keepBox.checked = false;
        const keepTxt = document.createElement('span');
        keepTxt.textContent = tr('Send the new command to the connected device over its link (it keeps working without running anything)');
        keepLbl.append(keepBox, keepTxt);
        keepNote = document.createElement('p');
        keepNote.className = 'agents-note';
        keepNote.textContent = tr('Unchecked: the connected device is disconnected now and its command stops working — run the new command on the device yourself.');
        body.append(keepLbl, keepNote);
      } else if (existing) {
        // verify-r4 F8: a device NOT dialed in hears what Generate does to it before the button, not after
        const cons = generateConsequenceText(h);
        if (cons) { const cn = document.createElement('p'); cn.className = 'agents-note device-pair-consequence'; cn.textContent = cons; body.append(cn); }
      }
      let inp = null, nameNote = null, willBe = null;
      if (!existing) {
        const label = document.createElement('label');
        label.textContent = tr('Device name');
        inp = document.createElement('input');
        inp.type = 'text'; inp.placeholder = 'my-mac'; inp.maxLength = 32; inp.className = 'device-pair-name';
        // verify-r4 F6: a name that is ALREADY paired is a replacement, said BEFORE the button (the route re-pairs it: the
        // token rotates, the device on the old command is disconnected, its record + lists go to whatever runs the new one)
        nameNote = document.createElement('p');
        nameNote.className = 'agents-note device-pair-exists';
        nameNote.style.display = 'none';
        // verify-r5 A2: what the typed name BECOMES (the rule keeps letters, digits, - and _): "办公室Mac" is paired as "Mac"
        willBe = document.createElement('p');
        willBe.className = 'agents-note device-pair-willbe';
        willBe.style.display = 'none';
        body.append(label, inp, willBe, nameNote);
      }
      const pickHost = document.createElement('div');
      pickHost.className = 'device-pair-addr';
      pickHost.textContent = tr('Loading addresses…');
      const hint = document.createElement('p');
      hint.className = 'agents-note device-pair-hint';
      hint.textContent = tr('The device checks the chosen address before it installs anything and stops with the reason if it cannot reach it — pick the one its network can see.');
      const err = document.createElement('div');
      err.className = 'device-pair-err';
      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
      const cancel = document.createElement('button');
      cancel.className = 'btn-cancel'; cancel.textContent = tr('Cancel'); cancel.onclick = () => close();
      const go = document.createElement('button');
      go.className = 'btn-create device-pair-go';
      const goWord = existing ? tr('Generate a new command') : tr('Create pairing');
      go.textContent = goWord; go.disabled = true;
      actions.append(cancel, go);
      // verify-r5 A1: what the ROUTE said about this name (a 409 already_paired: the list here lagged — another window or
      // user paired it a moment ago) counts until the name is edited
      let raced = null;
      // verify-r6 P3: what the USER was shown when they last acted — the label their own typing (or the route's own
      // answer) produced. The 1 s tick below also re-labels the button (another window paired this name meanwhile),
      // and a press landing right after that flip read "Replace its pairing" off the live label — a click aimed at
      // "Create pairing" replaced another window's fresh pairing. The tick never upgrades a press to a replace: a
      // press it has not been shown is sent as `new`, and the route's 409 already_paired then says so
      let seenReplace = false;
      const syncName = (source = 'input') => {
        if (!inp || !nameNote) return;
        const shown = pairNameShown(inp.value);
        if (willBe) {
          willBe.textContent = shown.empty ? tr('This name has no letters, digits, - or _ — it will be paired under a random name (dev-…).')
            : shown.reduced ? tr('It will be paired as "{id}" — a device name keeps only letters, digits, - and _.', { id: shown.id }) : '';
          willBe.style.display = willBe.textContent ? '' : 'none';
        }
        const v0 = pairNameVerdict(inp.value, this._hostsData?.hosts || []);
        const v = !v0.exists && raced && raced.deviceId === v0.deviceId ? { ...v0, exists: true, online: raced.online, name: raced.deviceId } : v0;
        // verify-r5 A3: a name that differs from a paired one only by case is refused by the route — said here first
        nameNote.style.display = v.exists || v.caseTwin ? '' : 'none';
        nameNote.textContent = v.caseTwin && !v.exists ? tr('"{name}" differs from the paired device "{twin}" only in upper / lower case — VibeSpace treats them as one name. Pick another name, or give "{twin}" a new command from the pairing icon on its row.', { name: v.deviceId, twin: v.caseTwin })
          : !v.exists ? '' : v.online
          ? tr('"{name}" is already paired and connected. Creating replaces its pairing: that device is disconnected now and its command stops working. To give it a new command instead, use the pairing icon on its row.', { name: v.name })
          : tr('"{name}" is already paired. Creating replaces its pairing: the command it holds stops working. To give it a new command instead, use the pairing icon on its row.', { name: v.name });
        if (go.textContent === goWord || go.textContent === tr('Replace its pairing')) go.textContent = v.exists ? tr('Replace its pairing') : goWord;
        if (source !== 'tick') seenReplace = go.textContent === tr('Replace its pairing');
      };
      if (inp) inp.addEventListener('input', syncName);
      // verify-r5 A1: the note follows the machine list while the dialog is open — a second window pairing this name, or
      // the device coming online, changes what Create does (the note was judged once, at the keystroke)
      const nameTick = inp ? setInterval(() => { if (!body.isConnected || !inp.isConnected) { clearInterval(nameTick); return; } syncName('tick'); }, 1000) : null;
      body.append(pickHost, hint, err, actions);
      if (inp) setTimeout(() => inp.focus(), 50);
      let picker = null;
      try {
        const a = await api(`/api/device/dial-addresses?device=${encodeURIComponent(existing ? h.deviceId : 'DEVICE')}`);
        picker = dialAddressPicker({ candidates: a.candidates || [], relayPublishable: !!a.relayPublishable, listen: a.listen || null, deviceId: existing ? h.deviceId : 'DEVICE', dial: existing ? (h.dial || {}) : null, online: !!(existing && (h.online || h.dialLive)), onChange: () => { err.textContent = ''; } }); // naive-user N-sheet: the device's own address checked (verify-r4 F1: as the device states it; the tense = the link's)
        pickHost.textContent = '';
        pickHost.appendChild(picker.el);
        go.disabled = false;
      } catch (e) {
        pickHost.textContent = tr('Could not list this server’s addresses: {why}', { why: e.message || '' });
        showToast(tr('Could not list this server’s addresses: {why}', { why: e.message || '' }), { type: 'error' });
      }
      const pair = async () => {
        if (!picker || go.disabled) return;
        const v = picker.value();
        if (v.error) { err.textContent = v.error; return; }
        const name = existing ? h.deviceId : (deviceIdOf(inp.value) || undefined); // THE one name rule (the route's)
        // verify-r5 A1: the dialog says what it EXPECTS (read before the button's label changes) — the route refuses a
        // "new" pairing under a name that is paired NOW (409 already_paired) instead of silently replacing it
        const expect = existing || seenReplace ? 'existing' : 'new'; // verify-r6 P3: what the user was SHOWN, never the tick's flip
        go.disabled = true; go.textContent = v.viaRelay ? tr('Publishing to relay…') : tr('Pairing…');
        try {
          // verify-r6 P1: a requested push names the link this sheet showed (its lastConnectAt) — a link that is gone or is
          // another one is refused by name, nothing minted
          const keep = !!(keepBox && keepBox.checked);
          const r = await api('/api/device/dial-pair', { method: 'POST', body: JSON.stringify({ deviceId: name, base: v.base, viaRelay: !!v.viaRelay, updateInPlace: keep, ...(keep ? { keepLinkSince: keepSince } : {}), expect }) });
          if (nameTick) clearInterval(nameTick);
          this._fillPairCommandBody(body, close, r, { regenerated: existing, deviceOs: existing ? commandOsOf(h.dial && h.dial.lastAccept && h.dial.lastAccept.platform) : null });
        } catch (e) {
          go.disabled = false; go.textContent = goWord;
          if (e && e.code === 'already_paired') raced = { deviceId: name, online: !!(e.body && e.body.online) };
          if (e && e.code === 'not_paired') raced = null;
          // verify-r6 P1: the device is gone — the keep-its-link choice no longer exists on this sheet (the next press is
          // the plain rotation the message just described)
          if (e && e.code === 'link_gone' && keepLbl) { keepBox.checked = false; keepLbl.style.display = 'none'; if (keepNote) keepNote.style.display = 'none'; }
          syncName('route'); // the route's answer is SHOWN to the user (the message below) — it counts as seen
          const msg = e && e.code === 'bad_base' ? tr('That is not an address VibeSpace can dial')
            : e && e.code === 'already_paired' ? tr('"{name}" was paired a moment ago — in another window, or by another user. Nothing was created. To replace that pairing, press "Replace its pairing".', { name })
            : e && e.code === 'name_case_taken' ? tr('"{name}" differs from the paired device "{twin}" only in upper / lower case — VibeSpace treats them as one name. Pick another name, or give "{twin}" a new command from the pairing icon on its row.', { name, twin: (e.body && e.body.twin) || '' })
            // verify-r6 P1: the link the owner asked to keep is gone / is another one — nothing was minted
            // verify-r6 P2: the device this sheet was for was removed while it was open — nothing re-created
            : e && e.code === 'not_paired' ? tr('"{name}" is no longer paired (it was removed — in another window, or by another user). Nothing was created. To pair a device under this name, use "Pair a device".', { name })
            : e && e.code === 'link_gone' ? tr('"{name}" is no longer connected, so its new command cannot be sent over its link — nothing was changed. Press the button again to make a new command you run on the device yourself (the one it holds stops working).', { name })
            : e && e.code === 'link_changed' ? tr('"{name}" reconnected after this sheet opened (or another device dialed in under its name) — nothing was changed. Close this sheet and open it again to see what is connected now.', { name })
            : ((e && e.message) || tr('pairing failed'));
          err.textContent = msg;
          showToast(msg, { type: 'error' });
        }
      };
      go.onclick = pair;
      if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') pair(); };
    },

    // B-6640: upgrade an ssh machine to a dial-out device (or roll it back).
    async _showGraduateDialog(h) {
      const { body, close } = createModalShell({ id: 'mounts-dialog-overlay', title: h.graduated ? tr('Dial-out — "{name}"', { name: h.name }) : tr('Upgrade "{name}" to dial-out', { name: h.name }), bodyClass: 'mounts-dialog-body', escapeToClose: true });
      if (h.graduated) {
        const st = document.createElement('div'); st.className = 'tiny'; st.style.marginBottom = '10px';
        st.innerHTML = h.dialLive
          ? tr('The daemon on this machine is <b>dialing in</b> — data-plane ops (files, discovery, transcripts) ride that ws link instead of ssh. ssh stays as the rescue channel.')
          : tr('The daemon is installed but <b>not currently dialed in</b> — ops fall back to ssh until it reconnects (it retries from the machine side).');
        body.appendChild(st);
        const rm = document.createElement('button'); rm.className = 'btn-create danger'; rm.textContent = tr('Remove dial-out (keep the ssh machine)');
        rm.onclick = async () => {
          rm.disabled = true; rm.textContent = tr('Removing…');
          try { const r = await api(`/api/hosts/${h.id}/graduate-dial`, { method: 'POST', body: JSON.stringify({ remove: true }) });
            if (r?.error) throw new Error(r.error);
            showToast(tr('Dial-out removed — "{name}" is a plain ssh machine again', { name: h.name })); close(); this._refresh?.();
          } catch (e) { rm.disabled = false; rm.textContent = tr('Remove dial-out (keep the ssh machine)'); showToast(e.message, { type: 'error' }); }
        };
        body.appendChild(rm);
        return;
      }
      const info = document.createElement('div'); info.className = 'tiny'; info.style.marginBottom = '10px';
      info.innerHTML = tr('Installs the VibeSpace daemon as a persistent service on the machine so it <b>dials back to this instance over a WebSocket</b>. Every file/discovery/transcript op then uses that link — no ssh banner-hang, ControlMaster staleness, or per-op child processes. <b>ssh is kept</b> as the bootstrap + rescue channel, and you can remove this anytime.');
      body.appendChild(info);
      // lane-pairing ①: the SAME address list as the pairing dialog (the machine dials the address chosen here; the
      // server's ssh-side curl precheck stays — it is this path's twin of the device's --dial-check)
      const pickHost = document.createElement('div'); pickHost.className = 'device-pair-addr'; pickHost.textContent = tr('Loading addresses…');
      body.appendChild(pickHost);
      let picker = null;
      api(`/api/device/dial-addresses?device=${encodeURIComponent(h.deviceId || ('grad-' + h.id))}`).then((a) => {
        picker = dialAddressPicker({ candidates: a.candidates || [], relayPublishable: !!a.relayPublishable, listen: a.listen || null, deviceId: h.deviceId || ('grad-' + h.id), dial: h.dial || null, online: !!h.dialLive });
        pickHost.textContent = ''; pickHost.appendChild(picker.el);
      }).catch((e) => { pickHost.textContent = tr('Could not list this server’s addresses: {why}', { why: e.message || '' }); });
      const err = document.createElement('div'); err.className = 'tiny device-pair-err'; err.style.margin = '6px 0'; body.appendChild(err);
      const go = document.createElement('button'); go.className = 'btn-create'; go.textContent = tr('Upgrade to dial-out');
      go.onclick = async () => {
        const v = picker ? picker.value() : { error: tr('Loading addresses…') };
        if (v.error) { err.textContent = v.error; return; }
        err.textContent = ''; go.disabled = true; go.textContent = tr('Installing on the machine…');
        try {
          const viaRelay = !!v.viaRelay;
          const r = await api(`/api/hosts/${h.id}/graduate-dial`, { method: 'POST', body: JSON.stringify({ base: v.base, viaRelay }) });
          if (r?.error) throw new Error(r.error);
          showToast(r.dialedIn ? tr('"{name}" upgraded — dial link is live', { name: h.name }) : tr('"{name}" installed — waiting for it to dial in', { name: h.name })); close(); this._refresh?.();
        } catch (e) { go.disabled = false; go.textContent = tr('Upgrade to dial-out'); if (!err.isConnected) showToast(e.message, { type: 'error' }); else err.textContent = e.message; }
      };
      body.appendChild(go);
    },

    // Bootstrap: dedicated step-progress UI with an expandable live log
    // (user-specified design — not a bare terminal window).
    async _showBootstrapDialog(h) {
      let off = null; // assigned after the handler registers — close() can run first (TDZ trap)
      // No backdrop close: a stray click mid-bootstrap must not dismiss the progress view.
      const { overlay, body, close } = createModalShell({
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
          // the button was disabled for the run — a terminal label on a still-
          // disabled button read as a dead "All done" (real report: clicking
          // did nothing). Completion turns it into a real close button.
          startBtn.textContent = r.success ? 'All done' : 'Finished with failures — close';
          startBtn.disabled = false;
          startBtn.onclick = () => close();
          this._hostStatus = this._hostStatus || {};
          try { this._hostStatus[h.id] = await api(`/api/hosts/${h.id}/test`, { method: 'POST' }); } catch {}
          this._renderMounts();
        } catch (e) { startBtn.textContent = 'Retry'; startBtn.disabled = false; showToast(e.message, { type: 'error' }); }
      };
    },

    // The connect step of "add a storage / import a share": the record was
    // already created, only the fuse mount can still fail — and it is exactly
    // the failure-prone half (unreachable/denied/slow backend). It used to be
    // a BARE fetch with the response unchecked, so a failed connect toasted
    // "Storage connected" and the truth only showed if the user later noticed
    // the row's error state. Returns false when the caller must NOT claim
    // success. The dialog is CLOSED on failure rather than re-thrown into it:
    // the record exists, so a retried submit would add a duplicate — the row
    // (+ this toast) carries the reason.
    async _connectNewMount(id, close) {
      try {
        const r = await api(`/api/mounts/${id}/mount`, { method: 'POST' });
        if (!r.success) throw new Error(tr('the connection did not come up — hover the row’s status dot for details'));
        return true;
      } catch (e) {
        close();
        showToast(tr('Storage added, but connecting failed: {msg}', { msg: e.message || tr('unknown error') }), { type: 'error' });
        this._renderMounts();
        return false;
      }
    },

    // opts.onClose: fires on X / backdrop dismissal — REQUIRED by any caller
    // that awaits a Promise from this dialog, or cancelling it hangs the
    // awaiting flow forever. Callers must make their resolve idempotent
    // (close() runs on the submit path too).
    // The renderer lives in ./mounts-dialog.js since D1 (one component for the
    // storage AND the channel account dialogs); `_lastMountsDialog` stays here
    // because only this mixin's callers read it.
    _mountsDialog(title, fields, submitLabel, onSubmit, opts = {}) {
      const ctx = mountsDialog(title, fields, submitLabel, onSubmit, opts);
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
        if (!await this._connectNewMount(r.id, close)) return;
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
          // lane cluster-presets (P3): no company client is SAID, never just an absent option
          hint: presets.length ? tr('Pick the preset matching your Google account\'s organization; external accounts may see a one-time "unverified app" warning.') : tr("No company OAuth client on this instance — ask your admin. Meanwhile the built-in client works, and your own avoids rclone's shared quota.") },
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
          hint: presets.length ? tr('Gmail has no built-in fallback client — pick a preset or provide your own. The client needs the gmail.readonly scope.') : tr('No company OAuth client on this instance — ask your admin, or provide your own (it needs the gmail.readonly scope).') },
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
        if (!await this._connectNewMount(r.id, close)) return;
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
    // (the block itself lives in ./mounts-dialog.js since D1 — shared with the
    // channel account dialogs; this delegate keeps every storage caller as is)
    _wireOAuthConnect(ctx, opts) {
      return wireOAuthConnect(ctx, opts);
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
          const _w = window.open(r.url, '_blank');
          status.parentElement?.querySelectorAll('.mounts-oauth-link').forEach((e) => e.remove());
          status.after(oauthLinkRow(r.url));
          status.textContent = tr('A Google sign-in page opened. Approve access, then come back here.');
          if (!_w) status.textContent = tr('Popup blocked — copy the link below and open it in a browser yourself.');
          if (!pasteBox) {
            pasteBox = document.createElement('div');
            pasteBox.innerHTML = `<div class="mounts-field-hint">${escHtml(tr("If the final page fails to load (address starts with 127.0.0.1 — VibeSpace runs on another machine, or you authorized in a different browser), copy that address and paste it here:"))}</div>`;
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
          const _w = window.open(r.url, '_blank');
          status.parentElement?.querySelectorAll('.mounts-oauth-link').forEach((e) => e.remove());
          status.after(oauthLinkRow(r.url));
          status.textContent = tr('A Google sign-in page opened. Approve access, then come back here.');
          if (!_w) status.textContent = tr('Popup blocked — copy the link below and open it in a browser yourself.');
          if (!pasteBox) {
            pasteBox = document.createElement('div');
            pasteBox.innerHTML = `<div class="mounts-field-hint">${escHtml(tr("If the final page fails to load (address starts with 127.0.0.1 — VibeSpace runs on another machine, or you authorized in a different browser), copy that address and paste it here:"))}</div>`;
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
        rb.textContent = tr('Re-authorize {provider}…', { provider: this._oauthProviderNames(cfg).product });
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
        // D2 (design-integrations-per-account §6): switching a Drive / Gmail
        // record's OAuth client IS a re-authorization — a token only works
        // with the client that minted it, so saving the new client beside the
        // old token ended in `invalid_client` at the next refresh. Save stores
        // every OTHER field, then Re-authorize opens under the NEW client and
        // the token minted there lands together with it. A token pasted into
        // the dialog by hand is the user bringing their own: a plain save.
        const cur = {};
        for (const k of ['clientPreset', 'clientId', 'clientSecret']) { const el = form.querySelector(`[name="${k}"]`); if (el) cur[k] = el.value; }
        const sw = patch.token === undefined ? this._mountClientSwitch(cfg, cur, editPresets) : null;
        if (sw) {
          if (sw.client.clientId && !sw.client.clientSecret) { err.textContent = tr('A custom OAuth client needs its client secret too'); return; }
          for (const k of ['clientPreset', 'clientId', 'clientSecret']) delete patch[k];
          if (Object.keys(patch).length) {
            try { await api(`/api/mounts/${m.id}`, { method: 'PATCH', body: JSON.stringify(patch), headers: { 'Content-Type': 'application/json' } }); }
            catch (e2) { err.textContent = e2.message || 'Failed'; return; }
          }
          close(); this._renderMounts();
          this._showClientSwitchReauthDialog({ ...m, name: patch.name || name }, cfg, sw, editPresets);
          return;
        }
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
