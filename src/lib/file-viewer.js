import { marked } from 'marked';
import { HexViewer } from './hex-viewer.js';
import { CodeEditor } from './code-editor.js';
import { formatSize, escHtml, showConfirmDialog, showInputDialog, showToast } from './utils.js';
import { hasDedicatedViewer, getViewerType, getFileIcon } from './file-types.js';
import { FILE_ICONS } from './icons.js';
import { renderAsync as renderDocx } from 'docx-preview';
import { init as initPptx } from 'pptx-preview';
import { t } from './i18n.js';

class FileViewer {
  static async open(app, filePath, fileName, opts = {}) {
    const ext = fileName.split('.').pop().toLowerCase();
    const host = opts.host || '';
    const hq = host ? '&host=' + encodeURIComponent(host) : '';

    // Check file info first (size, binary detection)
    let fileInfo = { size: 0, isBinary: false };
    try {
      const res = await fetch(`/api/file/info?path=${encodeURIComponent(filePath)}${hq}`);
      fileInfo = await res.json();
    } catch {}

    // Restoration provenance (stage workspaces / layout replay): a window
    // opened from a DERIVED temp file (archive entry) records the recipe so a
    // replay can re-derive it when the temp file is gone (docs/design-
    // dynamic-desktop.md §4b — the zip-PDF case).
    const openSpec = { action: 'openFile', path: filePath, name: fileName, ...(host ? { host } : {}), ...(opts.via ? { via: opts.via } : {}) };

    // Force hex mode
    if (opts.hex) {
      const winInfo = app.wm.createWindow({ title: t('Hex: {name}', { name: fileName }), type: 'hex-viewer', syncId: opts.syncId, openSpec });
      winInfo._filePath = filePath; winInfo._fileName = fileName;
      new HexViewer(winInfo, filePath, fileInfo, host);
      return;
    }

    // Binary file without a dedicated viewer → hex viewer
    if (fileInfo.isBinary && !hasDedicatedViewer(ext)) {
      const winInfo = app.wm.createWindow({ title: t('Hex: {name}', { name: fileName }), type: 'hex-viewer', syncId: opts.syncId, openSpec });
      winInfo._filePath = filePath; winInfo._fileName = fileName;
      new HexViewer(winInfo, filePath, fileInfo, host);
      return;
    }

    const viewerType = getViewerType(ext);

    // Large file warning (only for text files opened in editor)
    if (!hasDedicatedViewer(ext) && fileInfo.size > 1024 * 1024) {
      const ok = await showConfirmDialog({ title: t('Large File'), message: t('This file is {size}. Opening may slow down the UI. Continue?', { size: formatSize(fileInfo.size) }), confirmText: t('Open') });
      if (!ok) return;
    }

    // HTML: open in CodeEditor with preview toggle (same as markdown)
    if (viewerType === 'html-editor') {
      const winInfo = app.wm.createWindow({ title: fileName, type: 'editor', syncId: opts.syncId, openSpec });
      winInfo._filePath = filePath; winInfo._fileName = fileName;
      new CodeEditor(winInfo, filePath, fileName, app, { host });
      return;
    }

    const winInfo = app.wm.createWindow({ title: fileName, type: 'viewer', syncId: opts.syncId, openSpec });
    winInfo._filePath = filePath; winInfo._fileName = fileName;
    const container = document.createElement('div'); container.className = 'file-viewer';
    winInfo.content.appendChild(container);
    winInfo.onClose = () => { try { container._viewerCtl?.abort(); } catch {} };
    const rendered = await FileViewer.renderInto(container, filePath, fileName, app, host);
    if (!rendered) {
      // No dedicated viewer — open in code editor
      app.openEditor(filePath, fileName, opts);
      app.wm.closeWindow(winInfo.id);
    }
  }

  /**
   * Render a file into a container element. Used by both the file viewer window
   * and the file explorer preview panel. Returns true if rendered, false if
   * no dedicated viewer exists for this file type.
   */
  static async renderInto(container, filePath, fileName, app = null, host = '') {
    // Per-render lifecycle: document-level listeners (image pan, PPTX keyboard
    // nav) and observers register against this signal. Re-rendering into the
    // same container (explorer preview panel) aborts the previous render's
    // listeners; window close aborts the last one (openFile onClose). Without
    // this, every image/PPTX ever viewed left permanent document listeners.
    if (container._viewerCtl) { try { container._viewerCtl.abort(); } catch {} }
    container._viewerCtl = new AbortController();
    const ext = (fileName || filePath.split('/').pop()).split('.').pop().toLowerCase();
    const viewerType = getViewerType(ext);
    const hq = host ? '&host=' + encodeURIComponent(host) : '';
    const rawUrl = `/api/file/raw?path=${encodeURIComponent(filePath)}${hq}`;

    try {
      if (viewerType === 'archive') {
        await FileViewer._renderArchive(container, filePath, app, host);
      } else if (viewerType === 'image') {
        FileViewer._renderImage(container, filePath, host);
      } else if (viewerType === 'video') {
        FileViewer._renderVideo(container, filePath, host);
      } else if (viewerType === 'audio') {
        FileViewer._renderAudio(container, filePath, fileName, host);
      } else if (viewerType === 'pdf') {
        FileViewer._renderPdf(container, filePath, host);
      } else if (viewerType === 'eml') {
        await FileViewer._renderEml(container, filePath, host);
      } else if (viewerType === 'csv') {
        FileViewer._renderCsv(container, filePath, ext, host);
      } else if (viewerType === 'xlsx') {
        const res = await fetch(`/api/file/excel?path=${encodeURIComponent(filePath)}${hq}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        // Sheet tabs + table viewer
        const viewer = document.createElement('div'); viewer.className = 'sheet-viewer';
        const tableWrap = document.createElement('div'); tableWrap.className = 'sheet-table-wrap';
        const renderSheet = (sheet) => {
          tableWrap.innerHTML = '';
          const table = document.createElement('table'); table.className = 'file-viewer-table';
          const tbody = document.createElement('tbody');
          (sheet.data || []).slice(0, 5000).forEach((row, ri) => {
            const tr = document.createElement('tr');
            (row || []).forEach(c => { const td = document.createElement(ri === 0 ? 'th' : 'td'); td.textContent = c ?? ''; tr.appendChild(td); });
            tbody.appendChild(tr);
          });
          table.appendChild(tbody); tableWrap.appendChild(table);
        };
        if (data.sheets.length > 1) {
          const tabs = document.createElement('div');
          tabs.className = 'sheet-tabs';
          data.sheets.forEach((sheet, i) => {
            const tab = document.createElement('div');
            tab.className = 'sheet-tab';
            tab.textContent = sheet.name;
            tab.onclick = () => {
              tabs.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
              tab.classList.add('active');
              renderSheet(sheet);
            };
            if (i === 0) tab.classList.add('active');
            tabs.appendChild(tab);
          });
          viewer.append(tableWrap, tabs);
        } else {
          viewer.appendChild(tableWrap);
        }
        renderSheet(data.sheets[0]);
        container.appendChild(viewer);
      } else if (viewerType === 'docx') {
        const res = await fetch(rawUrl);
        const blob = await res.blob();
        const wrapper = document.createElement('div'); wrapper.className = 'docx-preview';
        container.appendChild(wrapper);
        await renderDocx(blob, wrapper, wrapper, { inWrapper: true, ignoreWidth: false, ignoreHeight: false, renderHeaders: true, renderFooters: true, renderFootnotes: true });
      } else if (viewerType === 'pptx') {
        FileViewer._renderPptx(container, filePath, rawUrl);
      } else {
        return false; // no dedicated viewer
      }
      return true;
    } catch (err) {
      container.innerHTML = `<div class="empty-hint" style="color:var(--red)">${escHtml(t('Error: {msg}', { msg: err.message }))}</div>`;
      return true; // error shown, don't fall through to editor
    }
  }

  // ── Image viewer with zoom controls ──
  // Archive contents viewer: entry list + filter + Extract All. Clicking a file
  // entry extracts just that entry to a temp file and opens it through the
  // normal viewer pipeline (editor / image / pdf / ...).
  static async _renderArchive(container, filePath, app, host = '') {
    const hq = host ? '&host=' + encodeURIComponent(host) : '';
    const res = await fetch(`/api/archive/list?path=${encodeURIComponent(filePath)}${hq}`);
    const data = await res.json().catch(() => ({}));
    container.innerHTML = '';
    const root = document.createElement('div'); root.className = 'archive-viewer';
    if (!res.ok || data.error) {
      const err = document.createElement('div'); err.className = 'archive-empty';
      err.textContent = t('Cannot read archive: {msg}', { msg: data.error || t('unknown error') });
      root.appendChild(err);
      container.appendChild(root);
      return;
    }
    const entries = data.entries || [];
    const files = entries.filter(e => !e.isDirectory);
    const totalSize = files.reduce((a, e) => a + (e.size || 0), 0);

    const toolbar = document.createElement('div'); toolbar.className = 'archive-toolbar';
    const summary = document.createElement('span');
    let summaryText = t('{n} files', { n: files.length });
    if (entries.length > files.length) summaryText += t(', {n} folders', { n: entries.length - files.length });
    summaryText += ' \u00b7 ' + t('{size} uncompressed', { size: formatSize(totalSize) });
    if (data.truncated) summaryText += ' \u00b7 ' + t('list truncated');
    summary.textContent = summaryText;
    const filter = document.createElement('input');
    filter.placeholder = t('Filter\u2026'); filter.type = 'text';
    const extractBtn = document.createElement('button'); extractBtn.className = 'archive-extract-btn'; extractBtn.textContent = t('Extract All\u2026');
    toolbar.append(summary, filter, extractBtn);

    const list = document.createElement('div'); list.className = 'archive-list';
    const renderList = (q) => {
      list.innerHTML = '';
      const needle = (q || '').toLowerCase();
      let shown = 0;
      for (const e of entries) {
        if (needle && !e.name.toLowerCase().includes(needle)) continue;
        if (++shown > 3000) break;
        const row = document.createElement('div');
        row.className = 'archive-entry' + (e.isDirectory ? '' : ' is-file');
        const depth = (e.name.replace(/\/$/, '').match(/\//g) || []).length;
        row.style.paddingLeft = (12 + depth * 16) + 'px';
        const icon = document.createElement('span'); icon.className = 'ae-icon';
        icon.innerHTML = e.isDirectory ? FILE_ICONS.folder : getFileIcon(e.name);
        const name = document.createElement('span'); name.className = 'ae-name';
        name.textContent = e.name.replace(/\/$/, '').split('/').pop();
        name.title = e.name;
        const size = document.createElement('span'); size.className = 'ae-size';
        size.textContent = e.isDirectory ? '' : formatSize(e.size);
        row.append(icon, name, size);
        if (!e.isDirectory && app) {
          row.onclick = async () => {
            row.style.opacity = '0.5';
            try {
              const r = await fetch('/api/archive/extract-entry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: filePath, entry: e.name, ...(host ? { host } : {}) }) });
              const d = await r.json().catch(() => ({}));
              if (!r.ok) { showToast(t('Open failed: {msg}', { msg: d.error || '' }), { type: 'error' }); return; }
              app.openFile(d.path, e.name.split('/').pop(), { via: { kind: 'archive-entry', archive: filePath, entry: e.name }, ...(host ? { host } : {}) });
            } finally { row.style.opacity = ''; }
          };
        }
        list.appendChild(row);
      }
      if (!shown) {
        const empty = document.createElement('div'); empty.className = 'archive-empty';
        empty.textContent = needle ? t('No matching entries') : t('Empty archive');
        list.appendChild(empty);
      }
    };
    renderList('');
    filter.addEventListener('input', () => renderList(filter.value));

    extractBtn.onclick = async () => {
      const base = filePath.split('/').pop().replace(/\.(zip|tar\.gz|tar\.bz2|tar\.xz|tar|tgz|tbz2|txz|gz|bz2|xz)$/i, '');
      const parent = filePath.substring(0, filePath.lastIndexOf('/'));
      const d = await showInputDialog({ title: t('Extract All'), label: t('Destination folder'), value: parent + '/' + base, confirmText: t('Extract') });
      if (!d || !d.trim()) return;
      showToast(t('Extracting\u2026'));
      const r = await fetch('/api/archive/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: filePath, dest: d.trim(), overwrite: false, ...(host ? { host } : {}) }) }).catch(() => null);
      const dd = await r?.json().catch(() => ({}));
      if (!r?.ok) showToast(t('Extract failed: {msg}', { msg: dd?.error || '' }), { type: 'error' });
      else showToast(t('Extracted to {name}', { name: d.trim() }));
    };

    root.append(toolbar, list);
    container.appendChild(root);
  }

  static _renderImage(container, filePath, host = '') {
    const hq = host ? '&host=' + encodeURIComponent(host) : '';
    const mediaViewer = document.createElement('div');
    mediaViewer.className = 'media-viewer';

    // Toolbar with zoom controls
    const toolbar = document.createElement('div');
    toolbar.className = 'media-toolbar';

    let zoom = 100;
    const zoomLabel = document.createElement('span');
    zoomLabel.className = 'media-zoom-label';
    zoomLabel.textContent = '100%';

    const btnFit = FileViewer._mediaBtn(t('Fit'));
    const btnZoomOut = FileViewer._mediaBtn('-');
    const btnZoomIn = FileViewer._mediaBtn('+');
    const btnActual = FileViewer._mediaBtn('1:1');

    const imgWrap = document.createElement('div');
    imgWrap.className = 'media-content';

    const img = document.createElement('img');
    img.src = `/api/file/raw?path=${encodeURIComponent(filePath)}${hq}`;
    img.className = 'media-image';
    img.draggable = false;

    const applyZoom = () => {
      zoomLabel.textContent = zoom + '%';
      img.style.transform = `scale(${zoom / 100})`;
      img.style.transformOrigin = 'center center';
    };

    btnZoomIn.onclick = () => { zoom = Math.min(500, zoom + 25); applyZoom(); };
    btnZoomOut.onclick = () => { zoom = Math.max(10, zoom - 25); applyZoom(); };
    btnActual.onclick = () => { zoom = 100; img.style.maxWidth = 'none'; img.style.maxHeight = 'none'; applyZoom(); };
    btnFit.onclick = () => { zoom = 100; img.style.maxWidth = '100%'; img.style.maxHeight = '100%'; applyZoom(); };

    // Mouse wheel zoom
    imgWrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 25 : -25;
      zoom = Math.max(10, Math.min(500, zoom + delta));
      applyZoom();
    }, { passive: false });

    // Drag to pan
    let panX = 0, panY = 0, dragging = false, startX, startY;
    imgWrap.style.overflow = 'hidden';
    const applyPan = () => { img.style.translate = `${panX}px ${panY}px`; };
    imgWrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true; startX = e.clientX - panX; startY = e.clientY - panY;
      imgWrap.style.cursor = 'grabbing';
      e.preventDefault();
    });
    const panSignal = container?._viewerCtl?.signal;
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panX = e.clientX - startX; panY = e.clientY - startY;
      applyPan();
    }, panSignal ? { signal: panSignal } : undefined);
    document.addEventListener('mouseup', () => { dragging = false; imgWrap.style.cursor = 'grab'; }, panSignal ? { signal: panSignal } : undefined);
    imgWrap.style.cursor = 'grab';

    // Reset pan on fit
    const origFit = btnFit.onclick;
    btnFit.onclick = () => { panX = 0; panY = 0; applyPan(); origFit(); };

    toolbar.append(btnFit, btnZoomOut, zoomLabel, btnZoomIn, btnActual);
    imgWrap.appendChild(img);
    mediaViewer.append(toolbar, imgWrap);
    container.appendChild(mediaViewer);
  }

  // ── Video viewer with native controls ──
  static _renderVideo(container, filePath, host = '') {
    const hq = host ? '&host=' + encodeURIComponent(host) : '';
    const mediaViewer = document.createElement('div');
    mediaViewer.className = 'media-viewer';

    const videoWrap = document.createElement('div');
    videoWrap.className = 'media-content';

    const video = document.createElement('video');
    video.src = `/api/file/raw?path=${encodeURIComponent(filePath)}${hq}`;
    video.controls = true;
    video.className = 'media-video';
    video.preload = 'metadata';

    videoWrap.appendChild(video);
    mediaViewer.appendChild(videoWrap);
    container.appendChild(mediaViewer);
  }

  // ── Audio viewer with native controls ──
  static _renderAudio(container, filePath, fileName, host = '') {
    const hq = host ? '&host=' + encodeURIComponent(host) : '';
    const mediaViewer = document.createElement('div');
    mediaViewer.className = 'media-viewer media-viewer-audio';

    const label = document.createElement('div');
    label.className = 'media-audio-label';
    label.textContent = fileName;

    const audio = document.createElement('audio');
    audio.src = `/api/file/raw?path=${encodeURIComponent(filePath)}${hq}`;
    audio.controls = true;
    audio.className = 'media-audio';
    audio.preload = 'metadata';

    mediaViewer.append(label, audio);
    container.appendChild(mediaViewer);
  }

  // ── PDF viewer via iframe/embed ──
  // ── .eml email viewer (2.134.0, Gmail mounts) — dependency-free MIME parse
  // (src/lib/eml.js) → header card + text/html toggle + attachment downloads.
  // The HTML part renders in a FULLY sandboxed iframe (sandbox="" — no
  // scripts, no same-origin, no navigation) via srcdoc.
  static async _renderEml(container, filePath, host = '') {
    const hq = host ? '&host=' + encodeURIComponent(host) : '';
    const { parseEml } = await import('./eml.js');
    const res = await fetch(`/api/file/raw?path=${encodeURIComponent(filePath)}${hq}`);
    if (!res.ok) throw new Error('failed to read file');
    const mail = parseEml(new Uint8Array(await res.arrayBuffer()));
    const wrap = document.createElement('div');
    wrap.className = 'eml-viewer';
    const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const h = mail.headers;
    wrap.innerHTML = `
      <div class="eml-head">
        <div class="eml-subject">${esc(h.subject) || '(no subject)'}</div>
        <div class="eml-meta">
          ${h.from ? `<div><span class="eml-k">From</span>${esc(h.from)}</div>` : ''}
          ${h.to ? `<div><span class="eml-k">To</span>${esc(h.to)}</div>` : ''}
          ${h.cc ? `<div><span class="eml-k">Cc</span>${esc(h.cc)}</div>` : ''}
          ${h.date ? `<div><span class="eml-k">Date</span>${esc(h.date)}</div>` : ''}
        </div>
      </div>
      <div class="eml-tools"></div>
      <div class="eml-body"></div>
      <div class="eml-atts"></div>`;
    const body = wrap.querySelector('.eml-body');
    const tools = wrap.querySelector('.eml-tools');
    const showHtml = () => {
      body.innerHTML = '';
      const frame = document.createElement('iframe');
      frame.className = 'eml-html-frame';
      frame.setAttribute('sandbox', ''); // no scripts, no same-origin, no nav
      frame.srcdoc = mail.htmlBody;
      body.appendChild(frame);
    };
    const showText = () => {
      body.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'eml-text';
      pre.textContent = mail.textBody || '(empty body)';
      body.appendChild(pre);
    };
    if (mail.htmlBody && mail.textBody) {
      const btn = document.createElement('button');
      btn.className = 'tv-tool-btn';
      let mode = 'html';
      btn.textContent = 'Text';
      btn.onclick = () => {
        mode = mode === 'html' ? 'text' : 'html';
        btn.textContent = mode === 'html' ? 'Text' : 'HTML';
        (mode === 'html' ? showHtml : showText)();
      };
      tools.appendChild(btn);
    }
    if (mail.htmlBody) showHtml(); else showText();
    const atts = wrap.querySelector('.eml-atts');
    for (const a of mail.attachments || []) {
      const row = document.createElement('a');
      row.className = 'eml-att';
      row.textContent = `📎 ${a.filename || 'attachment'} (${(a.size / 1024).toFixed(1)} KB)`;
      row.href = '#';
      row.onclick = (e) => {
        e.preventDefault();
        const blob = new Blob([a.content], { type: a.mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const dl = document.createElement('a');
        dl.href = url; dl.download = a.filename || 'attachment.bin';
        dl.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      };
      atts.appendChild(row);
    }
    container.innerHTML = '';
    container.appendChild(wrap);
  }

  static _renderPdf(container, filePath, host = '') {
    const hq = host ? '&host=' + encodeURIComponent(host) : '';
    const mediaViewer = document.createElement('div');
    mediaViewer.className = 'media-viewer';

    const embed = document.createElement('iframe');
    embed.src = `/api/file/raw?path=${encodeURIComponent(filePath)}${hq}`;
    embed.className = 'media-pdf';

    mediaViewer.appendChild(embed);
    container.appendChild(mediaViewer);
  }

  // ── Helper: create a styled button for media toolbars ──
  // ── PPTX viewer: thumbnail sidebar + main slide + responsive ──
  static async _renderPptx(container, filePath, rawUrl) {
    const res = await fetch(rawUrl);
    const buf = await res.arrayBuffer();

    const viewer = document.createElement('div');
    viewer.className = 'pptx-viewer';

    const sidebar = document.createElement('div');
    sidebar.className = 'pptx-sidebar';

    // Sidebar resize handle (hover highlight via CSS :hover; width stays inline — user-dragged)
    const sidebarHandle = document.createElement('div');
    sidebarHandle.className = 'pptx-sidebar-handle';
    sidebarHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX = e.clientX, startW = sidebar.offsetWidth;
      const onMove = (ev) => { sidebar.style.width = Math.max(120, Math.min(400, startW + ev.clientX - startX)) + 'px'; if (viewer._resizeThumbs) viewer._resizeThumbs(); };
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    const main = document.createElement('div');
    main.className = 'pptx-main';

    const slideContainer = document.createElement('div');
    slideContainer.className = 'pptx-slide';
    main.appendChild(slideContainer);

    viewer.append(sidebar, sidebarHandle, main);
    container.appendChild(viewer);

    // Load once for main view — this previewer is reused for slide switching
    const mainPreviewer = initPptx(slideContainer, { width: 800, height: 450, mode: 'slide' });
    await mainPreviewer.preview(buf);
    const count = mainPreviewer.slideCount;

    let activeIdx = 0;
    const thumbEls = [];

    // Render main slide — switching slides reuses previewer, resize recreates it
    let currentPreviewer = mainPreviewer;
    let lastW = 0, lastH = 0;

    const renderMain = (idx, forceResize = false) => {
      activeIdx = idx;
      const rect = main.getBoundingClientRect();
      const w = Math.max(300, rect.width - 40);
      const h = Math.max(170, rect.height - 40);
      const aspect = 16 / 9;
      let slideW, slideH;
      if (w / h > aspect) { slideH = h; slideW = h * aspect; }
      else { slideW = w; slideH = w / aspect; }
      slideW = Math.round(slideW); slideH = Math.round(slideH);

      if (forceResize || Math.abs(slideW - lastW) > 5 || Math.abs(slideH - lastH) > 5) {
        // Size changed — need to recreate previewer with new dimensions
        lastW = slideW; lastH = slideH;
        slideContainer.innerHTML = '';
        currentPreviewer = initPptx(slideContainer, { width: slideW, height: slideH, mode: 'slide' });
        // Re-load from already-fetched buffer (re-parses but no network request)
        currentPreviewer.load(buf).then(() => currentPreviewer.renderSingleSlide(idx));
      } else {
        // Same size — just switch slide
        currentPreviewer.removeCurrentSlide();
        currentPreviewer.renderSingleSlide(idx);
      }

      thumbEls.forEach((t, i) => t.classList.toggle('active', i === idx));
    };

    // Build thumbnails: render at high resolution, CSS scale to fit sidebar
    const THUMB_RENDER_W = 800;
    const THUMB_RENDER_H = 450;
    const thumbHidden = document.createElement('div');
    thumbHidden.className = 'pptx-thumb-offscreen';
    document.body.appendChild(thumbHidden);
    const thumbPreviewer = initPptx(thumbHidden, { width: THUMB_RENDER_W, height: THUMB_RENDER_H, mode: 'list' });
    await thumbPreviewer.preview(buf);

    // Extract rendered slides from list container
    const thumbWrapper = thumbHidden.querySelector('div') || thumbHidden;
    const thumbSource = [...thumbWrapper.children];

    const thumbContents = []; // store references for resize
    for (let i = 0; i < count; i++) {
      const thumb = document.createElement('div');
      thumb.className = 'pptx-thumb';

      const label = document.createElement('div');
      label.className = 'pptx-thumb-num';
      label.textContent = i + 1;

      const thumbContent = document.createElement('div');
      thumbContent.className = 'pptx-thumb-content';
      if (thumbSource[i]) {
        // Clone styles stay INLINE: this is foreign DOM from pptx-preview (own
        // classes/inline styles) and the width/height/scale are tied to the
        // THUMB_RENDER_* constants + dynamic sidebar width.
        const clone = thumbSource[i].cloneNode(true);
        clone.style.transformOrigin = 'top left';
        clone.style.width = THUMB_RENDER_W + 'px';
        clone.style.height = THUMB_RENDER_H + 'px';
        clone.style.position = 'absolute';
        clone.style.top = '0'; clone.style.left = '0';
        thumbContent.appendChild(clone);
      }
      thumbContents.push(thumbContent);

      thumb.append(label, thumbContent);
      thumb.onclick = () => { renderMain(i); thumb.scrollIntoView({ block: 'nearest' }); };
      thumbEls.push(thumb);
      sidebar.appendChild(thumb);
    }
    thumbHidden.remove();

    // Scale thumbnails to fit sidebar width — called on init and sidebar resize
    const resizeThumbs = () => {
      const displayW = sidebar.clientWidth - 16;
      const scale = displayW / THUMB_RENDER_W;
      const displayH = Math.round(THUMB_RENDER_H * scale);
      for (const tc of thumbContents) {
        tc.style.width = displayW + 'px';
        tc.style.height = displayH + 'px';
        const clone = tc.firstChild;
        if (clone) clone.style.transform = `scale(${scale})`;
      }
    };
    resizeThumbs();
    viewer._resizeThumbs = resizeThumbs;

    // Initial render at correct size
    renderMain(0, true);

    // Keyboard navigation
    const onKey = (e) => {
      if (!container.closest('.window-active')) return;
      if (e.target.closest('textarea, input, [contenteditable]')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); if (activeIdx < count - 1) renderMain(activeIdx + 1); thumbEls[activeIdx]?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); if (activeIdx > 0) renderMain(activeIdx - 1); thumbEls[activeIdx]?.scrollIntoView({ block: 'nearest' }); }
    };
    const pptxSignal = container?._viewerCtl?.signal;
    document.addEventListener('keydown', onKey, pptxSignal ? { signal: pptxSignal } : undefined);

    // Responsive resize
    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => renderMain(activeIdx, true), 200);
    });
    ro.observe(main);
  }

  static _mediaBtn(text) {
    const b = document.createElement('button');
    b.className = 'file-tool-btn media-btn';
    b.textContent = text;
    return b;
  }

  // ── CSV/TSV viewer with virtual scroll (streaming from server) ──
  static async _renderCsv(container, filePath, ext, host = '') {
    const hq = host ? '&host=' + encodeURIComponent(host) : '';
    const sep = ext === 'tsv' ? '\t' : ',';
    const ROW_HEIGHT = 24;
    const PAGE_SIZE = 200;
    const cache = new Map(); // offset → rows array
    const inflight = new Map(); // offset → Promise (dedupe concurrent fetches during fast scroll)
    let header = null, total = 0;
    let onTotalChanged = null; // set after the spacer/status exist

    // Fetch a page of rows
    const fetchPage = (offset) => {
      if (cache.has(offset)) return Promise.resolve();
      if (inflight.has(offset)) return inflight.get(offset);
      const p = (async () => {
        const res = await fetch(`/api/file/csv?path=${encodeURIComponent(filePath)}&offset=${offset}&limit=${PAGE_SIZE}&sep=${encodeURIComponent(sep)}${hq}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (!header && data.header) header = data.header;
        if (data.total && data.total > total) {
          total = data.total;
          // Later pages refine the row estimate — without this the spacer and
          // status stayed at the first page's value, so big files could only
          // be scrolled to ~10k rows
          onTotalChanged?.();
        }
        cache.set(offset, data.rows);
      })().finally(() => inflight.delete(offset));
      inflight.set(offset, p);
      return p;
    };

    // Initial fetch
    await fetchPage(0);
    if (!header) { container.innerHTML = `<div class="empty-hint">${escHtml(t('Empty file'))}</div>`; return; }

    // Build viewer
    const viewer = document.createElement('div');
    viewer.className = 'csv-viewer';

    // Status bar
    const status = document.createElement('div');
    status.className = 'csv-status';
    status.textContent = t('{rows} rows × {cols} columns', { rows: total.toLocaleString(), cols: header.length });

    // Header
    const thead = document.createElement('div');
    thead.className = 'csv-header';
    // Row number header
    const rnH = document.createElement('div');
    rnH.className = 'csv-th-num';
    rnH.textContent = '#';
    thead.appendChild(rnH);
    for (const col of header) {
      const th = document.createElement('div');
      th.className = 'csv-th';
      th.textContent = col;
      th.title = col;
      thead.appendChild(th);
    }

    // Virtual scroll area (spacer height = row estimate — stays inline, dynamic)
    const scrollArea = document.createElement('div');
    scrollArea.className = 'csv-scroll';
    const spacer = document.createElement('div');
    spacer.className = 'csv-spacer';
    spacer.style.height = ((total - 1) * ROW_HEIGHT) + 'px';
    scrollArea.appendChild(spacer);

    onTotalChanged = () => {
      spacer.style.height = ((total - 1) * ROW_HEIGHT) + 'px';
      status.textContent = t('{rows} rows × {cols} columns', { rows: total.toLocaleString(), cols: header.length });
    };

    const renderRows = () => {
      const scrollTop = scrollArea.scrollTop;
      const viewH = scrollArea.clientHeight;
      const startRow = Math.floor(scrollTop / ROW_HEIGHT);
      const visibleCount = Math.ceil(viewH / ROW_HEIGHT) + 2;

      // Determine which page(s) we need
      const pageStart = Math.floor(startRow / PAGE_SIZE) * PAGE_SIZE;
      if (!cache.has(pageStart)) fetchPage(pageStart).then(renderRows);
      if (!cache.has(pageStart + PAGE_SIZE) && startRow + visibleCount > pageStart + PAGE_SIZE) {
        fetchPage(pageStart + PAGE_SIZE).then(renderRows);
      }

      // Clear and render visible rows
      spacer.querySelectorAll('.csv-row').forEach(r => r.remove());
      for (let i = 0; i < visibleCount; i++) {
        const rowIdx = startRow + i;
        if (rowIdx >= total - 1) break;
        const page = Math.floor(rowIdx / PAGE_SIZE) * PAGE_SIZE;
        const rows = cache.get(page);
        if (!rows) continue;
        const row = rows[rowIdx - page];
        if (!row) continue;

        const rowEl = document.createElement('div');
        rowEl.className = 'csv-row' + (rowIdx % 2 ? ' csv-row-alt' : '');
        // Virtual-scroll offset + row height (tied to the ROW_HEIGHT constant) stay inline
        rowEl.style.top = (rowIdx * ROW_HEIGHT) + 'px';
        rowEl.style.height = ROW_HEIGHT + 'px';

        // Row number
        const rn = document.createElement('div');
        rn.className = 'csv-td-num';
        rn.textContent = rowIdx + 1;
        rowEl.appendChild(rn);

        for (const cell of row) {
          const td = document.createElement('div');
          td.className = 'csv-td';
          td.textContent = cell;
          td.title = cell;
          rowEl.appendChild(td);
        }
        spacer.appendChild(rowEl);
      }
    };

    scrollArea.addEventListener('scroll', renderRows);
    viewer.append(status, thead, scrollArea);
    container.appendChild(viewer);
    requestAnimationFrame(renderRows);
  }
}

export { FileViewer };
