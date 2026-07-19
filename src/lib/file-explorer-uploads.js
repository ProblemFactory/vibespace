import { escHtml, createPopover, formatSize, uploadFilesBatched, getStateSync } from './utils.js';
import { getFileIcon } from './file-types.js';
import { FILE_ICONS, UI_ICONS } from './icons.js';
import { t } from './i18n.js';

/**
 * FileExplorer uploads mixin — the upload popover, batched multipart uploads
 * with inline progress + ring, and the synced upload history. Extracted from
 * file-explorer.js (2.92.0 split), installed on the prototype at module tail.
 */
export function installExplorerUploads(FileExplorer) {
  Object.assign(FileExplorer.prototype, {
    _triggerUpload(anchor) {
    const pop = createPopover(anchor, 'upload-popover');
    // Upload Files
    const fileBtn = document.createElement('div'); fileBtn.className = 'upload-menu-item';
    fileBtn.innerHTML = `${UI_ICONS.upload} ${escHtml(t('Upload Files'))}`;
    fileBtn.onclick = () => { pop.remove(); this.uploadInput.click(); };
    // Upload Folder
    const folderBtn = document.createElement('div'); folderBtn.className = 'upload-menu-item';
    folderBtn.innerHTML = `${FILE_ICONS.folder} ${escHtml(t('Upload Folder'))}`;
    folderBtn.onclick = () => { pop.remove(); this._folderInput.click(); };
    pop.append(fileBtn, folderBtn);

    // Active uploads section
    if (this._activeUploads.size > 0) {
      const divider = document.createElement('div'); divider.className = 'upload-menu-divider';
      pop.appendChild(divider);
      const activeLabel = document.createElement('div'); activeLabel.className = 'upload-menu-label'; activeLabel.textContent = t('Uploading');
      pop.appendChild(activeLabel);
      for (const [id, upload] of this._activeUploads) {
        const item = document.createElement('div'); item.className = 'upload-active-item';
        // Row 1: spinner + name + cancel
        const row1 = document.createElement('div'); row1.className = 'upload-active-row1';
        const spinner = document.createElement('span'); spinner.className = 'upload-active-spinner';
        const nameList = upload.displayNames || [];
        const label = nameList.length > 1 ? t('{n} files', { n: nameList.length }) : (nameList[0] || t('uploading...'));
        const name = document.createElement('span'); name.className = 'upload-active-name'; name.textContent = label;
        const cancelBtn = document.createElement('span'); cancelBtn.className = 'upload-active-cancel'; cancelBtn.textContent = '\u2715';
        cancelBtn.onclick = (e) => { e.stopPropagation(); upload.xhr.abort(); pop.remove(); };
        row1.append(spinner, name, cancelBtn);
        // Row 2: progress bar + size
        const row2 = document.createElement('div'); row2.className = 'upload-active-row2';
        const track = document.createElement('span'); track.className = 'upload-active-track';
        const fill = document.createElement('span'); fill.className = 'upload-active-fill';
        fill.style.width = (upload.pct || 0) + '%';
        track.appendChild(fill);
        const totalSize = upload.files.reduce((s, f) => s + f.size, 0);
        const sizeLabel = document.createElement('span'); sizeLabel.className = 'upload-active-size';
        sizeLabel.textContent = formatSize(totalSize);
        row2.append(track, sizeLabel);
        item.append(row1, row2);
        pop.appendChild(item);
      }
    }

    // History section
    const sync = getStateSync();
    const historyData = sync ? this._getUploadHistory(sync) : [];
    if (historyData.length > 0) {
      const divider = document.createElement('div'); divider.className = 'upload-menu-divider';
      pop.appendChild(divider);
      const histLabel = document.createElement('div'); histLabel.className = 'upload-menu-label'; histLabel.textContent = t('Recent Uploads');
      pop.appendChild(histLabel);
      for (const entry of historyData.slice(0, 10)) {
        const item = document.createElement('div'); item.className = 'upload-history-item';
        // Row 1: icon + name + status
        const row1 = document.createElement('div'); row1.className = 'upload-hist-row1';
        const icon = document.createElement('span'); icon.innerHTML = getFileIcon(entry.name);
        const name = document.createElement('span'); name.className = 'upload-hist-name'; name.textContent = entry.name;
        const statusIcon = document.createElement('span'); statusIcon.className = 'upload-hist-status';
        statusIcon.textContent = entry.status === 'ok' ? '\u2713' : entry.status === 'fail' ? '\u2717' : '\u2026';
        row1.append(icon, name, statusIcon);
        // Row 2: size + date
        const row2 = document.createElement('div'); row2.className = 'upload-hist-row2';
        row2.textContent = `${formatSize(entry.size)} · ${this._formatDate(entry.date)}`;
        item.append(row1, row2);
        item.onclick = () => { pop.remove(); if (entry.path) this.app.openFile(entry.path, entry.name); };
        pop.appendChild(item);
      }
      if (historyData.length > 0) {
        const clearBtn = document.createElement('div'); clearBtn.className = 'upload-menu-item upload-menu-clear';
        clearBtn.textContent = t('Clear History');
        clearBtn.onclick = () => { pop.remove(); this._clearUploadHistory(); };
        pop.appendChild(clearBtn);
      }
    }
  },

    _getUploadHistory(sync) {
    const all = [];
    const data = sync.getAll('uploads');
    for (const [key, val] of Object.entries(data)) {
      if (key.startsWith('upload:') && val) {
        try { all.push(typeof val === 'string' ? JSON.parse(val) : val); } catch {}
      }
    }
    all.sort((a, b) => (b.date || 0) - (a.date || 0));
    return all;
  },

    _clearUploadHistory() {
    const sync = getStateSync();
    if (!sync) return;
    const data = sync.getAll('uploads');
    for (const key of Object.keys(data)) {
      if (key.startsWith('upload:')) sync.set('uploads', key, '');
    }
  },

    _saveUploadHistory(files, status) {
    const sync = getStateSync();
    if (!sync) return;
    const now = Date.now();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const key = `upload:${now}-${i}`;
      sync.set('uploads', key, {
        name: f.name, path: f.destPath || '', size: f.size || 0,
        date: now, status,
      });
    }
    // Prune: upload history grew forever (every entry synced to every client
    // on every load — audit 2.81.0). Keep the newest 100.
    try {
      const all = Object.keys(sync.getAll('uploads') || {}).filter((k) => k.startsWith('upload:')).sort();
      for (const k of all.slice(0, Math.max(0, all.length - 100))) sync.set('uploads', k, '');
    } catch {}
  },

    _uploadFiles(fileList, isFolder = false) {
    const files = [...fileList];
    if (!files.length) return;
    const uploadId = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const destDir = this.currentPath;

    // Build FormData
    const fd = new FormData(); fd.append('destDir', destDir); if (this._host) fd.append('host', this._host);
    const names = [];
    for (const f of files) {
      fd.append('files', f);
      const rel = isFolder ? (f._relPath || f.webkitRelativePath || f.name) : f.name;
      names.push(rel);
    }
    fd.append('fileNames', JSON.stringify(names));
    if (isFolder) fd.append('preservePaths', '1');

    // Display names for the file list (folder uploads show one entry per top-level dir)
    const displayNames = isFolder
      ? [...new Set(names.map(r => r.split('/')[0]))]
      : [...names];

    // Store upload metadata — _renderItems reads this to show progress rows
    const upload = {
      xhr: null, files, names, destDir, displayNames, isFolder,
      pct: 0, status: 'uploading', // status: uploading | done | error
      domRefs: new Map(), // displayName → {fill, pctLabel} — populated by _renderItems
    };
    this._activeUploads.set(uploadId, upload);

    // Render upload rows in current view (if we're viewing destDir)
    this._renderItems();

    const xhr = new XMLHttpRequest();
    upload.xhr = xhr;

    // Show ring on upload button
    this._uploadRingSvg.classList.remove('hidden');

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      upload.pct = Math.round(e.loaded / e.total * 100);
      // Update DOM refs directly (fast path, no re-render)
      for (const ref of upload.domRefs.values()) {
        ref.fill.style.width = upload.pct + '%';
        ref.pctLabel.textContent = upload.pct + '%';
      }
      // Update ring
      const offset = this._ringCircumference * (1 - upload.pct / 100);
      this._uploadRing.setAttribute('stroke-dashoffset', offset);
    };

    xhr.onload = () => {
      // onload fires for ANY completed response — a 4xx/5xx (disk full,
      // permission denied) used to record 'ok' and play the done animation
      if (xhr.status < 200 || xhr.status >= 300) { xhr.onerror(); return; }
      let resultFiles = files.map((f, i) => ({ name: names[i], size: f.size, destPath: destDir + '/' + names[i] }));
      try {
        const resp = JSON.parse(xhr.responseText);
        if (resp.files) resultFiles = resp.files.map(f => ({ name: f.name, size: f.size, destPath: f.path }));
      } catch {}
      this._saveUploadHistory(resultFiles, 'ok');
      upload.status = 'done'; upload.pct = 100;
      for (const ref of upload.domRefs.values()) {
        ref.fill.style.width = '100%'; ref.pctLabel.textContent = '100%';
        ref.row.classList.add('file-upload-done');
      }
      setTimeout(() => {
        this._activeUploads.delete(uploadId);
        this._updateUploadRing();
        this.refresh();
      }, 800);
    };

    xhr.onerror = async () => {
      // The single multipart request failed (e.g. net::ERR_ACCESS_DENIED when a
      // file in the folder is unreadable). Salvage by retrying resiliently
      // (chunked + per-file) so the readable files still land; only the
      // unreadable ones are reported as failed.
      for (const ref of upload.domRefs.values()) ref.pctLabel.textContent = t('Retrying…');
      const { uploaded, failed } = await uploadFilesBatched(files, {
        // host MUST survive the retry — dropping it sent the salvaged files to
        // the LOCAL server at the remote path (silent wrong-machine landing)
        destDir, preservePaths: isFolder, host: this._host || undefined,
        onProgress: (d, total) => {
          const p = Math.round(d / total * 100);
          for (const ref of upload.domRefs.values()) { ref.fill.style.width = p + '%'; ref.pctLabel.textContent = p + '%'; }
        },
      });
      if (uploaded.length) {
        this._saveUploadHistory(uploaded.map(f => ({ name: f.name, size: f.size })), failed.length ? 'fail' : 'ok');
        upload.status = failed.length ? 'error' : 'done'; upload.pct = 100;
        for (const ref of upload.domRefs.values()) {
          ref.fill.style.width = '100%';
          ref.pctLabel.textContent = failed.length ? t('{n} failed', { n: failed.length }) : '100%';
          ref.row.classList.add(failed.length ? 'file-upload-error' : 'file-upload-done');
        }
        setTimeout(() => { this._activeUploads.delete(uploadId); this._updateUploadRing(); this.refresh(); }, failed.length ? 3000 : 800);
      } else {
        this._saveUploadHistory(files.map((f, i) => ({ name: names[i], size: f.size })), 'fail');
        upload.status = 'error';
        for (const ref of upload.domRefs.values()) { ref.row.classList.add('file-upload-error'); ref.pctLabel.textContent = t('Failed'); }
        setTimeout(() => { this._activeUploads.delete(uploadId); this._updateUploadRing(); if (this.currentPath === destDir) this._renderItems(); }, 3000);
      }
    };

    xhr.onabort = () => {
      this._activeUploads.delete(uploadId);
      this._updateUploadRing();
      if (this.currentPath === destDir) this._renderItems();
    };

    xhr.open('POST', '/api/upload');
    xhr.send(fd);
  },

    _renderUploadRows() {
    for (const [uploadId, upload] of this._activeUploads) {
      if (upload.destDir !== this.currentPath) continue;
      for (const displayName of upload.displayNames) {
        // Skip if a real file with this name already exists in the listing
        const existing = this.listEl.querySelector(`.file-item:not(.file-uploading) [data-name="${CSS.escape(displayName)}"]`);
        // Build upload row
        const row = document.createElement('div'); row.className = 'file-item file-uploading';
        if (upload.status === 'done') row.classList.add('file-upload-done');
        if (upload.status === 'error') row.classList.add('file-upload-error');
        const iconEl = document.createElement('span'); iconEl.className = 'file-icon';
        iconEl.innerHTML = upload.isFolder && upload.displayNames.length === 1 ? FILE_ICONS.folder : getFileIcon(displayName);
        const nameEl = document.createElement('span'); nameEl.className = 'file-name'; nameEl.textContent = displayName;
        const progressWrap = document.createElement('span'); progressWrap.className = 'file-upload-progress';
        const progressTrack = document.createElement('span'); progressTrack.className = 'file-upload-track';
        const progressFill = document.createElement('span'); progressFill.className = 'file-upload-fill';
        progressFill.style.width = upload.pct + '%';
        progressTrack.appendChild(progressFill);
        const pctLabel = document.createElement('span'); pctLabel.className = 'file-upload-pct';
        pctLabel.textContent = upload.status === 'error' ? t('Failed') : upload.pct + '%';
        const cancelBtn = document.createElement('button'); cancelBtn.className = 'file-upload-cancel'; cancelBtn.textContent = '\u2715';
        cancelBtn.title = t('Cancel upload');
        cancelBtn.onclick = () => upload.xhr?.abort();
        progressWrap.append(progressTrack, pctLabel, cancelBtn);
        row.append(iconEl, nameEl, progressWrap);
        // Insert at top
        if (this.listEl.firstChild) this.listEl.insertBefore(row, this.listEl.firstChild);
        else this.listEl.appendChild(row);
        // Store DOM refs so onprogress can update directly without re-render
        upload.domRefs.set(displayName, { row, fill: progressFill, pctLabel });
      }
    }
  },

    _updateUploadRing() {
    if (this._activeUploads.size === 0) {
      this._uploadRingSvg.classList.add('hidden');
      this._uploadRing.setAttribute('stroke-dashoffset', this._ringCircumference);
    }
  },
  });
}
