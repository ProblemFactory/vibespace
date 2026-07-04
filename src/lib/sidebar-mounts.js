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
  server: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2.5" width="12" height="4.5" rx="1"/><rect x="2" y="9" width="12" height="4.5" rx="1"/><path d="M4.5 4.75h.01M4.5 11.25h.01"/></svg>',
  bolt: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 1.5L3.5 9h3l-1 5.5L10.5 7h-3l1-5.5z"/></svg>',
  wrench: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5a3.5 3.5 0 00-3.3 4.6L2.5 10.8a1.4 1.4 0 002 2l3.7-3.7a3.5 3.5 0 004.5-4.4L10.5 7 9 5.5l2.3-2.2a3.5 3.5 0 00-1.8-.8z"/></svg>',
  termNew: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4 6l2.5 2L4 10M8.5 10.5h3.5"/></svg>',
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
      let d, hd;
      try { [d, hd] = await Promise.all([api('/api/mounts'), api('/api/hosts')]); }
      catch { this.listEl.innerHTML = '<div class="mounts-loading">Failed to load</div>'; return; }
      if (this._activeTab !== 'mounts') return; // user switched away mid-fetch
      this._mountsData = d;
      this._hostsData = hd;
      this.listEl.innerHTML = '';
      const root = document.createElement('div');
      root.className = 'mounts-panel';

      // ── Hosts section (remote machines over ssh) ──
      const hHead = document.createElement('div');
      hHead.className = 'mounts-sec-head';
      hHead.textContent = 'Hosts';
      root.appendChild(hHead);
      if (!hd.hosts.length) {
        const empty = document.createElement('div');
        empty.className = 'mounts-empty';
        empty.textContent = 'No remote hosts yet. Add one to run agent sessions on other machines over ssh.';
        root.appendChild(empty);
      } else {
        const hlist = document.createElement('div');
        hlist.className = 'mounts-list';
        for (const h of hd.hosts) hlist.appendChild(this._buildHostRow(h));
        root.appendChild(hlist);
      }
      const addHost = document.createElement('button');
      addHost.className = 'mounts-action';
      addHost.innerHTML = `<span class="mounts-action-icon">${MI.server}</span><span>Add host</span>`;
      addHost.onclick = () => this._showAddHostDialog(hd);
      root.appendChild(addHost);

      const sHead = document.createElement('div');
      sHead.className = 'mounts-sec-head';
      sHead.textContent = 'Storage';
      root.appendChild(sHead);

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

    _buildHostRow(h) {
      const row = document.createElement('div');
      row.className = 'mounts-row';
      const st = this._hostStatus?.[h.id]; // {ok, latencyMs, tools} | {error} | undefined
      const dot = st ? (st.ok ? 'ok' : 'err') : 'off';
      const top = document.createElement('div');
      top.className = 'mounts-row-top';
      top.innerHTML = `
        <span class="mounts-dot mounts-dot-${dot}" title="${st ? (st.ok ? `${st.latencyMs}ms` : escHtml(st.error || 'unreachable')) : 'Not tested yet'}"></span>
        <b class="mounts-name" title="${escHtml(h.user)}@${escHtml(h.host)}:${h.port}">${escHtml(h.name)}</b>
        ${st?.ok && st.tools ? `<span class="mounts-badge${st.tools.claude && st.tools.dtach ? '' : ' mounts-badge-red'}" title="dtach:${st.tools.dtach ? '✓' : '✗'} node:${st.tools.node ? '✓' : '✗'} claude:${st.tools.claude ? '✓' : '✗'}">${st.tools.claude && st.tools.dtach ? 'READY' : 'NEEDS SETUP'}</span>` : ''}`;
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
          try { this._hostStatus[h.id] = await api(`/api/hosts/${h.id}/test`, { method: 'POST' }); }
          catch (e) { this._hostStatus[h.id] = { ok: false, error: e.message }; throw e; }
        }),
        ibtn(MI.wrench, 'Bootstrap (install dtach / node / claude)', () => { this._showBootstrapDialog(h); }),
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
      sub.textContent = `${h.user}@${h.host}${h.port !== 22 ? ':' + h.port : ''}${h.keyPath ? ' · app key' : ''}`;
      row.append(top, sub);
      return row;
    },

    _showAddHostDialog(hd) {
      this._mountsDialog('Add remote host', [
        { key: 'name', label: 'Name', placeholder: 'gpu-01' },
        { key: 'user', label: 'SSH user', placeholder: 'ubuntu' },
        { key: 'host', label: 'Host', placeholder: '10.0.0.5 or gpu01.internal' },
        { key: 'port', label: 'Port', value: '22' },
        { key: 'keyChoice', label: 'SSH key', type: 'select', options: [
          ['default', 'My ~/.ssh keys (default)'],
          ['app', hd.key.exists ? 'VibeSpace key (data/ssh)' : 'VibeSpace key — generate now'],
          ['paste', 'Paste / upload a private key…'],
        ] },
      ], 'Add host', async (v, { close }) => {
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
            note.textContent = 'Stored server-side with 0600 permissions (data/ssh/). Must be passphrase-free — ssh runs non-interactively.';
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
              note.textContent = 'Append this line to ~/.ssh/authorized_keys on the target machine, then press Done.';
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
      document.getElementById('mounts-dialog-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'mounts-dialog-overlay';
      overlay.className = 'dialog-overlay';
      overlay.style.zIndex = '99998';
      overlay.innerHTML = `<div class="dialog" style="min-width:400px">
        <div class="dialog-header"><h3>Bootstrap ${escHtml(h.name)}</h3><button class="dialog-close">✕</button></div>
        <div class="dialog-body">
          <div class="bs-steps"></div>
          <details class="bs-log-wrap"><summary>Log</summary><pre class="bs-log"></pre></details>
          <div class="dialog-actions"><button class="btn-create bs-start">Start</button></div>
        </div></div>`;
      document.body.appendChild(overlay);
      const close = () => { overlay.remove(); off?.(); };
      overlay.querySelector('.dialog-close').onclick = close;
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
      const handler = (msg) => {
        if (msg.type !== 'host-bootstrap' || msg.hostId !== h.id) return;
        if (msg.type === 'host-bootstrap' && msg.key) { state[msg.key] = msg.status; paint(); }
        if (msg.line) { logEl.textContent += msg.line + '\n'; logEl.scrollTop = logEl.scrollHeight; }
        if (msg.steps) { Object.assign(state, msg.steps); paint(); }
      };
      this.app.ws.onGlobal(handler);
      const off = () => { const i = this.app.ws.globalHandlers.indexOf(handler); if (i >= 0) this.app.ws.globalHandlers.splice(i, 1); };
      const startBtn = overlay.querySelector('.bs-start');
      startBtn.onclick = async () => {
        startBtn.disabled = true; startBtn.textContent = 'Running…';
        try {
          const r = await api(`/api/hosts/${h.id}/bootstrap`, { method: 'POST' });
          Object.assign(state, r.steps); paint();
          startBtn.textContent = r.success ? 'All done' : 'Finished with failures';
          if (!r.success) overlay.querySelector('.bs-log-wrap').open = true;
          this._hostStatus = this._hostStatus || {};
          try { this._hostStatus[h.id] = await api(`/api/hosts/${h.id}/test`, { method: 'POST' }); } catch {}
          this._renderMounts();
        } catch (e) { startBtn.textContent = 'Failed'; showToast(e.message, { type: 'error' }); }
      };
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
