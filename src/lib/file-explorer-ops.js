import { showToast, showInputDialog, showConfirmDialog, copyText, formatSize, createModalShell, attachPopoverClose } from './utils.js';
import { t } from './i18n.js';

/**
 * FileExplorer ops mixin — context/background menus, clipboard (copy/cut/
 * paste), rename/delete/duplicate, archive compress/extract, properties,
 * new file/folder. Extracted from file-explorer.js (2.92.0 split).
 */
export function installExplorerOps(FileExplorer) {
  Object.assign(FileExplorer.prototype, {
    async createFile() {
    const n = await showInputDialog({ title: t('New File'), label: t('File name'), confirmText: t('Create') });
    if (!n || !n.trim()) return;
    const r = await fetch('/api/file/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this._hb({ path: this.currentPath + '/' + n.trim(), content: '' })) }).catch(() => null);
    if (!r?.ok) {
      // Show WHY (the server appends e.g. a read-only-mount hint) — the bare
      // "failed" toast hid the actual cause (real report).
      const d = await r?.json().catch(() => null);
      showToast(t('Create file failed') + (d?.error ? `: ${d.error}` : ''), { type: 'error' });
    }
    this.refresh();
  },

    async createDir() {
    const n = await showInputDialog({ title: t('New Folder'), label: t('Folder name'), confirmText: t('Create') });
    if (!n || !n.trim()) return;
    const r = await fetch('/api/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this._hb({ path: this.currentPath + '/' + n.trim() })) }).catch(() => null);
    if (!r?.ok) {
      const d = await r?.json().catch(() => null);
      showToast(t('Create folder failed') + (d?.error ? `: ${d.error}` : ''), { type: 'error' });
    }
    this.refresh();
  },

    _showContextMenu(x, y, dataset) {
    // Right-clicking an item outside the selection selects just it
    if (!this._selection.has(dataset.name)) {
      this._selection = new Set([dataset.name]);
      this._selAnchor = dataset.name;
      this._applySelectionClasses();
    }
    const sel = [...this._selection];
    const multi = sel.length > 1;
    const fullPath = this.currentPath + '/' + dataset.name;
    const isDir = dataset.isDir === 'true';
    const isArchive = /\.(zip|tar|tgz|tbz2|txz|gz|bz2|xz)$/i.test(dataset.name);
    const items = [];

    if (multi) {
      items.push({ label: t('Compress {n} items\u2026', { n: sel.length }), action: () => this._compressSelection(sel) });
      items.push({ label: t('Copy ({n})', { n: sel.length }), action: () => this._clipboardSet('copy') });
      items.push({ label: t('Cut ({n})', { n: sel.length }), action: () => this._clipboardSet('cut') });
      items.push({ sep: true });
      items.push({ label: t('Delete {n} items', { n: sel.length }), action: () => this._deleteSelection() });
      return this._buildMenu(x, y, items);
    }

    if (isDir) {
      items.push({ label: t('Open'), action: () => this.navigate(fullPath) });
      items.push({ label: t('Open in new window'), action: () => this.app.openFileExplorer(fullPath) });
    } else {
      items.push({ label: t('Open'), action: () => this.app.openFile(fullPath, dataset.name) });
      items.push({ label: t('Edit'), action: () => this.app.openEditor(fullPath, dataset.name) });
      items.push({ label: t('Open as Hex'), action: () => this.app.openFile(fullPath, dataset.name, { hex: true }) });
    }
    if (isArchive && !isDir) {
      items.push({ sep: true });
      items.push({ label: t('Extract Here'), action: () => this._extractArchive(dataset.name, true) });
      items.push({ label: t('Extract to Folder\u2026'), action: () => this._extractArchive(dataset.name, false) });
    }
    items.push({ sep: true });
    items.push({ label: t('Copy'), action: () => this._clipboardSet('copy') });
    items.push({ label: t('Cut'), action: () => this._clipboardSet('cut') });
    items.push({ label: t('Duplicate'), action: () => this._duplicate(dataset.name) });
    items.push({ label: t('Compress to Archive\u2026'), action: () => this._compressSelection([dataset.name]) });
    if (isDir) items.push({ label: t('Download as Zip'), action: () => { window.open(`/api/download-zip?path=${encodeURIComponent(fullPath)}${this._hp()}`); } });
    else items.push({ label: t('Download'), action: () => { window.open(`/api/download?path=${encodeURIComponent(fullPath)}${this._hp()}`); } });
    items.push({ label: t('Copy Path'), action: () => copyText(fullPath) });

    if (isDir) {
      items.push({ sep: true });
      const isBookmarked = this._bookmarks.some(b => b.path === fullPath);
      items.push({ label: isBookmarked ? t('\u2605 Bookmarked') : t('\u2606 Add to bookmarks'), action: () => {
        if (!isBookmarked) {
          const label = dataset.name || fullPath.split('/').pop();
          this._bookmarks.push({ label, path: fullPath });
          this._saveBookmarks(); this._renderBookmarks();
        }
      }});
      items.push({ label: t('Open Terminal Here'), action: () => this.app.openShellTerminal(fullPath, { hostId: this._host || undefined }) });
      if (!this._host) items.push({ label: t('Share this folder…'), submenu: () => this._shareFolderSubmenu(fullPath) });
      items.push({ label: t('Sessions'), submenu: () => {
        const sub = [];
        sub.push({ label: t('+ New session'), action: () => this.app.showNewSessionDialog({ cwd: fullPath }) });
        const sessionsHere = (this.app.sidebar?._allSessions || []).filter(s => s.cwd === fullPath);
        for (const s of sessionsHere) {
          const customName = this.app.sidebar?.getCustomName(s);
          const dispName = customName || s.name || s.sessionId.substring(0, 12) + '...';
          const badge = s.status === 'live' ? '\u25CF ' : s.status === 'tmux' ? '\u25C6 ' : '';
          const agentOpts = {
            backend: s.backend || 'claude',
            backendSessionId: s.backendSessionId || s.sessionId,
            agentKind: s.agentKind || 'primary',
            agentRole: s.agentRole || '',
            agentNickname: s.agentNickname || '',
            sourceKind: s.sourceKind || '',
            parentThreadId: s.parentThreadId || null,
          };
          sub.push({ label: `${badge}${dispName}`, action: () => {
            if (s.status === 'stopped') this.app.resumeSession(s.sessionId, s.cwd, customName || s.name, agentOpts);
            else if (s.status === 'live' && s.webuiId) this.app.attachSession(s.webuiId, s.webuiName || dispName, s.cwd, { mode: s.webuiMode, ...agentOpts });
            else if (s.status === 'tmux') this.app.attachTmuxSession(s.tmuxTarget, dispName, s.cwd);
          }});
        }
        return sub;
      }});
      const tasks = this.app.sidebar?._tasks || [];
      if (tasks.length > 0) {
        items.push({ label: t('Add to task'), submenu: () => {
          return tasks.map(t => ({ label: t.title, action: () => this.app.sidebar?._taskAddFolder(t.id, fullPath) }));
        }});
      }
    }
    items.push({ sep: true });
    items.push({ label: t('Rename'), action: () => this._rename(dataset.name) });
    items.push({ label: t('Properties'), action: () => this._showProperties(dataset.name) });
    items.push({ label: t('Delete'), action: () => this._delete(dataset.name, isDir) });
    this._buildMenu(x, y, items);
  },

    _showBackgroundMenu(x, y) {
    const clip = this.app._fileClipboard;
    const items = [];
    if (clip?.paths?.length) items.push({ label: t('Paste {n} items', { n: clip.paths.length }), action: () => this._paste() });
    items.push({ label: t('New File'), action: () => this.createFile() });
    items.push({ label: t('Open Terminal Here'), action: () => this.app.openShellTerminal(this.currentPath, { hostId: this._host || undefined }) });
    items.push({ label: t('New Folder'), action: () => this.createDir() });
    items.push({ sep: true });
    items.push({ label: t('Select All'), action: () => { this._selection = new Set(this._renderOrder); this._applySelectionClasses(); } });
    items.push({ label: t('Refresh'), action: () => this.refresh() });
    items.push({ label: t('Copy Path'), action: () => copyText(this.currentPath) });
    if (!this._host) items.push({ label: t('Share this folder…'), submenu: () => this._shareFolderSubmenu(this.currentPath) });
    items.push({ label: t('Properties'), action: () => this._showProperties(null) });
    this._buildMenu(x, y, items);
  },

  // Submenu for a folder's "Share this folder…": create a share LINK, or mount
  // this folder onto a remote machine (a flattened "Mount to <host>" per cached
  // machine + a picker that fetches fresh).
  _shareFolderSubmenu(fullPath) {
    const sub = [{ label: t('Create share link'), action: () => this.app.sidebar?._showBridgeShareDialog?.(fullPath) }];
    const hosts = this.app.sidebar?._hostsData?.hosts || [];
    for (const h of hosts) sub.push({ label: t('Mount to {name}', { name: h.name }), action: () => this.app.sidebar?._showHostMountDialog?.(h, fullPath) });
    sub.push({ label: hosts.length ? t('Mount to another machine…') : t('Mount to a remote machine…'), action: () => this.app.sidebar?._showHostMountPicker?.(fullPath) });
    return sub;
  },

    _buildMenu(x, y, items) {
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
    const menu = document.createElement('div'); menu.className = 'context-menu';
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    for (const item of items) {
      if (item.sep) { const d = document.createElement('div'); d.className = 'context-menu-sep'; menu.appendChild(d); continue; }
      const el = document.createElement('div'); el.className = 'context-menu-item'; el.textContent = item.label;
      if (item.submenu) {
        el.classList.add('has-submenu');
        el.onmouseenter = () => {
          menu.querySelectorAll('.context-submenu').forEach(sx => sx.remove());
          const subItems = item.submenu();
          const sub = document.createElement('div'); sub.className = 'context-menu context-submenu';
          sub.style.left = menu.offsetWidth + 'px'; sub.style.top = (el.offsetTop - menu.scrollTop) + 'px';
          for (const si of subItems) {
            const se = document.createElement('div'); se.className = 'context-menu-item'; se.textContent = si.label;
            se.onclick = () => { menu.remove(); si.action(); };
            sub.appendChild(se);
          }
          menu.appendChild(sub);
        };
      } else {
        // hovering a plain item must dismiss a sibling's open submenu —
        // without this the submenu stuck around until another submenu opened
        el.onmouseenter = () => menu.querySelectorAll('.context-submenu').forEach(sx => sx.remove());
        el.onclick = () => { menu.remove(); item.action(); };
      }
      menu.appendChild(el);
    }
    document.body.appendChild(menu);
    attachPopoverClose(menu);
  },

    _clipboardSet(op) {
    const paths = [...this._selection].map(n => this.currentPath + '/' + n);
    if (!paths.length) return;
    this.app._fileClipboard = { op, paths, host: this._host || '' };
    showToast(op === 'cut' ? t('Cut {n} items', { n: paths.length }) : t('Copied {n} items', { n: paths.length }));
    this._applySelectionClasses();
  },

    _uniqueName(base) {
    const dot = base.startsWith('.') ? -1 : base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    let cand = `${stem} (copy)${ext}`, n = 2;
    const names = new Set(this.items.map(i => i.name));
    while (names.has(cand)) cand = `${stem} (copy ${n++})${ext}`;
    return this.currentPath + '/' + cand;
  },

    async _paste() {
    const clip = this.app._fileClipboard;
    if (!clip || !clip.paths.length) return;
    const api = clip.op === 'cut' ? '/api/file/move' : '/api/file/copy';
    // Cross-host aware: clipboard remembers its SOURCE host; posting with
    // srcHost/destHost routes same-host ops to cp/mv and cross-host (or
    // host↔local) ops through the server relay.
    const srcHost = clip.host || '', destHost = this._host || '';
    const sameHost = srcHost === destHost;
    let overwriteAll = null, done = 0, failed = 0;
    const post = (src, dest, overwrite) => {
      const body = sameHost ? this._hb({ src, dest, overwrite }) : { src, dest, overwrite, srcHost, destHost };
      return fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    };
    for (const src of clip.paths) {
      const base = src.split('/').pop();
      let dest = this.currentPath + '/' + base;
      if (dest === src && sameHost) {             // same path only counts on the same host
        if (clip.op === 'cut') continue;          // move onto itself: no-op
        dest = this._uniqueName(base);            // copy into same dir: duplicate
      }
      let r = await post(src, dest, false);
      if (r && r.status === 409) {
        if (overwriteAll === null) {
          overwriteAll = await showConfirmDialog({ title: t('Overwrite?'), message: t('"{name}" already exists here. Overwrite existing item(s)?', { name: base }), confirmText: t('Overwrite'), danger: true });
        }
        if (!overwriteAll) { failed++; continue; }
        r = await post(src, dest, true);
      }
      if (r?.ok) done++; else failed++;
    }
    if (clip.op === 'cut' && done) this.app._fileClipboard = null;
    showToast(failed ? t('Pasted {done}, failed {failed}', { done, failed }) : t('Pasted {n} items', { n: done }), failed ? { type: 'error' } : {});
    this.refresh();
  },

    async _duplicate(name) {
    const r = await fetch('/api/file/copy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this._hb({ src: this.currentPath + '/' + name, dest: this._uniqueName(name) })) }).catch(() => null);
    if (!r?.ok) showToast(t('Duplicate failed'), { type: 'error' });
    this.refresh();
  },

    async _compressSelection(names) {
    if (!names.length) return;
    const def = (names.length === 1 ? names[0] : (this.currentPath.split('/').pop() || 'archive')) + '.zip';
    const out = await showInputDialog({ title: t('Compress {n} items', { n: names.length }), label: t('Archive name (.zip / .tar.gz / .tar / .tar.xz)'), value: def, confirmText: t('Compress') });
    if (!out || !out.trim()) return;
    const dest = this.currentPath + '/' + out.trim();
    const paths = names.map(n => this.currentPath + '/' + n);
    const post = (overwrite) => fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this._hb({ paths, dest, overwrite })) }).catch(() => null);
    showToast(t('Compressing\u2026'));
    let r = await post(false);
    if (r && r.status === 409) {
      const ok = await showConfirmDialog({ title: t('Overwrite'), message: t('"{name}" already exists. Overwrite?', { name: out.trim() }), confirmText: t('Overwrite'), danger: true });
      if (!ok) return;
      r = await post(true);
    }
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) showToast(t('Compress failed: {msg}', { msg: d?.error || t('unknown error') }), { type: 'error' });
    else showToast(t('Created {name} ({size})', { name: out.trim(), size: formatSize(d.size || 0) }));
    this.refresh();
  },

    async _extractArchive(name, here) {
    const src = this.currentPath + '/' + name;
    let dest = this.currentPath;
    if (!here) {
      const defFolder = name.replace(/\.(zip|tar\.gz|tar\.bz2|tar\.xz|tar|tgz|tbz2|txz|gz|bz2|xz)$/i, '');
      const d = await showInputDialog({ title: t('Extract to Folder'), label: t('Destination folder (under current directory)'), value: defFolder, confirmText: t('Extract') });
      if (!d || !d.trim()) return;
      dest = this.currentPath + '/' + d.trim();
    }
    // overwrite:false = skip files that already exist (never destructive).
    // Local extraction runs as a server-side op with a PERSISTENT progress row
    // (reuses the upload rows + button ring — a big archive used to look
    // frozen for minutes); remote hosts keep the plain synchronous call.
    const wantProgress = !this._host;
    const r = await fetch('/api/archive/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this._hb({ path: src, dest, overwrite: false, progress: wantProgress ? 1 : 0 })) }).catch(() => null);
    const dd = await r?.json().catch(() => ({}));
    if (!r?.ok) { showToast(t('Extract failed: {msg}', { msg: dd?.error || t('unknown error') }), { type: 'error' }); return; }
    if (wantProgress && dd.opId) { this._trackExtractOp(dd.opId, name, dest); return; }
    showToast(here ? t('Extracted here') : t('Extracted to {name}', { name: dest.split('/').pop() }));
    this.refresh();
  },

  // Poll a server-side extraction op and surface it as a persistent inline
  // progress row (same machinery as uploads: list row + button ring + popover).
  _trackExtractOp(opId, name, dest) {
    const label = t('Extracting {name}\u2026', { name });
    const upload = {
      xhr: { abort: () => fetch('/api/archive/extract-status?id=' + encodeURIComponent(opId), { method: 'DELETE' }).catch(() => {}) },
      files: [], destDir: dest, displayNames: [label], isFolder: false,
      pct: 0, status: 'uploading', domRefs: new Map(),
    };
    const key = 'extract-' + opId;
    this._activeUploads.set(key, upload);
    this._updateUploadRing();
    if (this.currentPath === dest) this._renderItems();
    const finish = (ok, st) => {
      upload.status = ok ? 'done' : 'error';
      upload.pct = 100;
      for (const ref of upload.domRefs.values()) {
        ref.row.classList.add(ok ? 'file-upload-done' : 'file-upload-error');
        ref.fill.style.width = '100%';
        ref.pctLabel.textContent = ok ? '100%' : t('Failed');
      }
      if (ok) showToast(t('Extracted to {name}', { name: (st?.dest || dest).split('/').pop() }));
      else if (st?.status !== 'cancelled') showToast(t('Extract failed: {msg}', { msg: st?.error || t('unknown error') }), { type: 'error' });
      setTimeout(() => { this._activeUploads.delete(key); this._updateUploadRing(); this.refresh(); }, ok ? 1200 : 4000);
    };
    const poll = setInterval(async () => {
      let st = null;
      try { const rr = await fetch('/api/archive/extract-status?id=' + encodeURIComponent(opId)); st = rr.ok ? await rr.json() : null; } catch {}
      if (!st) { clearInterval(poll); finish(false, null); return; }
      if (st.status === 'listing' || st.status === 'running') {
        const pct = st.total ? Math.min(99, Math.round(st.done / st.total * 100)) : 0;
        upload.pct = pct;
        for (const ref of upload.domRefs.values()) {
          ref.fill.style.width = pct + '%';
          ref.pctLabel.textContent = st.total ? pct + '%' : t('{n} files', { n: st.done });
        }
        return;
      }
      clearInterval(poll);
      finish(st.status === 'done', st);
    }, 700);
  },

    async _deleteSelection() {
    const names = [...this._selection];
    if (!names.length) return;
    const ok = await showConfirmDialog({ title: t('Delete'), message: names.length === 1 ? t('Delete "{name}"?', { name: names[0] }) : t('Delete {n} items? Folders are removed with all contents.', { n: names.length }), confirmText: t('Delete'), danger: true });
    if (!ok) return;
    let failed = 0;
    for (const n of names) {
      const r = await fetch(`/api/file?path=${encodeURIComponent(this.currentPath + '/' + n)}${this._hp()}`, { method: 'DELETE' }).catch(() => null);
      if (!r?.ok) failed++;
    }
    if (failed) showToast(t('Delete failed for {n} item(s)', { n: failed }), { type: 'error' });
    this._selection.clear();
    this.refresh();
  },

    async _showProperties(name) {
    const fp = name ? this.currentPath + '/' + name : this.currentPath;
    // Open INSTANTLY with placeholders; a recursive-size du on a big tree can
    // take many seconds and a click with no response reads as broken.
    const { overlay, body, close: done } = createModalShell({ title: t('Properties'), escapeToClose: true });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(); } });
    const rows = [
      ['Name', fp.split('/').pop() || '/'],
      ['Path', fp],
      ['Type', '…'], ['Size', '…'], ['Modified', '…'], ['Created', '…'], ['Permissions', '…'],
    ];
    // Display labels — `cells` stays keyed by the English ids in `rows`
    const rowLabels = { Name: t('Name'), Path: t('Path'), Type: t('Type'), Size: t('Size'), Modified: t('Modified'), Created: t('Created'), Permissions: t('Permissions') };
    const table = document.createElement('div');
    table.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:12px;';
    const cells = {};
    for (const [k, v] of rows) {
      const kEl = document.createElement('div'); kEl.textContent = rowLabels[k] || k; kEl.style.color = 'var(--text-dim)';
      const vEl = document.createElement('div'); vEl.textContent = v; vEl.style.cssText = 'word-break:break-all;user-select:text;';
      cells[k] = vEl;
      table.append(kEl, vEl);
    }
    body.appendChild(table);
    // fast stat (no recursive size) fills everything visible immediately…
    fetch(`/api/file/stat?path=${encodeURIComponent(fp)}${this._hp()}`).then(r => r.json()).then((d) => {
      if (!d || d.error) { cells.Type.textContent = t('Could not read properties'); return; }
      cells.Type.textContent = d.isDirectory ? t('Folder ({n} items)', { n: d.entryCount ?? '?' }) : t('File');
      cells.Size.textContent = d.isDirectory ? t('calculating…') : formatSize(d.size);
      cells.Modified.textContent = d.modified ? new Date(d.modified).toLocaleString() : '-';
      cells.Created.textContent = d.created ? new Date(d.created).toLocaleString() : '-';
      cells.Permissions.textContent = d.mode || '-';
      // …then the slow recursive size streams in for folders when it's done
      if (d.isDirectory) {
        fetch(`/api/file/stat?path=${encodeURIComponent(fp)}&du=1${this._hp()}`).then(r => r.json()).then((d2) => {
          if (!overlay.isConnected) return; // dialog closed meanwhile
          cells.Size.textContent = d2?.duSize != null ? t('{size} (recursive)', { size: formatSize(d2.duSize) }) : t('unknown');
        }).catch(() => { if (overlay.isConnected) cells.Size.textContent = t('unknown'); });
      }
    }).catch(() => { cells.Type.textContent = t('Could not read properties'); });
  },

    async _rename(oldName) {
    const n = await showInputDialog({ title: t('Rename'), label: t('New name'), value: oldName, confirmText: t('Rename') });
    if (!n || n === oldName) return;
    const r = await fetch('/api/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this._hb({ oldPath: this.currentPath + '/' + oldName, newPath: this.currentPath + '/' + n })) }).catch(() => null);
    if (!r?.ok) showToast(t('Rename failed'), { type: 'error' });
    this.refresh();
  },

    async _delete(name, isDir) {
    const ok = await showConfirmDialog({ title: isDir ? t('Delete Folder') : t('Delete File'), message: t('Delete "{name}"?', { name }) + (isDir ? t(' All contents will be removed.') : ''), confirmText: t('Delete'), danger: true });
    if (!ok) return;
    const r = await fetch(`/api/file?path=${encodeURIComponent(this.currentPath + '/' + name)}${this._hp()}`, { method: 'DELETE' }).catch(() => null);
    if (!r?.ok) showToast(t('Delete failed'), { type: 'error' });
    this.refresh();
  },
  });
}
