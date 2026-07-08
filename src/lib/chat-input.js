import { escHtml, saveDraft, loadDraft, clearDraft, getStateSync, showContextMenu, showToast, uploadFilesBatched } from './utils.js';
import { UI_ICONS } from './icons.js';
import { t } from './i18n.js';

/**
 * ChatInput — input area for chat mode sessions.
 * Manages textarea, attachments, slash commands, expand/collapse,
 * draft persistence, streaming status indicator, and todo display.
 */
export class ChatInput {
  /**
   * @param {object} ws - WsManager instance
   * @param {string} sessionId - session identifier
   * @param {object} opts
   * @param {function} opts.onSend - called after send with (text, attachments)
   * @param {function} opts.getStateSync - returns StateSync instance
   * @param {function} opts.onInterrupt - called when user clicks Stop
   */
  constructor(ws, sessionId, { onSend, onInterrupt, getCwd }) {
    this._ws = ws;
    this._sessionId = sessionId;
    this._onSend = onSend;
    this._onInterrupt = onInterrupt;
    this._getCwd = getCwd || (() => null);

    // Attachment state
    this._attachments = [];

    // Slash commands (populated from system.init)
    this._slashCommands = [];

    // Streaming state
    this._isStreaming = false;

    // Todos
    this._todos = [];

    // Expanded editor state
    this._expanded = false;

    // ── Build DOM ──

    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';
    this._element = inputArea;

    // Textarea
    this._textarea = document.createElement('textarea');
    this._textarea.className = 'chat-input';
    this._textarea.placeholder = t('Type a message...');
    this._textarea.rows = 1;

    // Attachment area (above input row)
    this._attachArea = document.createElement('div');
    this._attachArea.className = 'chat-attach-area hidden';

    // Image paste — add as attachment, don't send immediately
    this._textarea.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) this._addImageAttachment(file);
          return;
        }
      }
    });

    // Restore draft from sessionStorage
    const draft = loadDraft('chat', sessionId);
    if (draft) {
      this._textarea.value = draft;
      setTimeout(() => { this._textarea.style.height = 'auto'; this._textarea.style.height = Math.min(this._textarea.scrollHeight, 200) + 'px'; }, 0);
    }

    // Auto-grow textarea (skip in expanded mode)
    this._draftTimer = null;
    this._textarea.addEventListener('input', () => {
      if (!this._expanded) {
        this._textarea.style.height = 'auto';
        this._textarea.style.height = Math.min(this._textarea.scrollHeight, 200) + 'px';
      }
      // Debounced draft save
      clearTimeout(this._draftTimer);
      this._draftTimer = setTimeout(() => saveDraft('chat', this._sessionId, this._textarea.value), 300);
    });

    // Sync draft from other clients via StateSync
    this._draftSyncHandler = (value) => {
      this._textarea.value = value || '';
      this._textarea.style.height = 'auto';
      this._textarea.style.height = Math.min(this._textarea.scrollHeight, 200) + 'px';
    };
    const sync = getStateSync();
    if (sync) sync.on('drafts', 'chat:' + this._sessionId, this._draftSyncHandler);

    // Slash command dropdown
    this._slashDropdown = document.createElement('div');
    this._slashDropdown.className = 'chat-slash-dropdown hidden';

    // Send: Enter in normal mode, Ctrl+Enter in expanded mode
    // Tab to accept slash autocomplete
    this._textarea.addEventListener('keydown', (e) => {
      if (!this._slashDropdown.classList.contains('hidden')) {
        if (e.key === 'Tab' || e.key === 'Enter') {
          const active = this._slashDropdown.querySelector('.active');
          if (active) { e.preventDefault(); this._textarea.value = active.dataset.cmd + ' '; this._slashDropdown.classList.add('hidden'); return; }
        }
        if (e.key === 'Escape') { this._slashDropdown.classList.add('hidden'); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = [...this._slashDropdown.querySelectorAll('.chat-slash-item')];
          const cur = items.findIndex(i => i.classList.contains('active'));
          items[cur]?.classList.remove('active');
          const next = e.key === 'ArrowDown' ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length;
          items[next]?.classList.add('active');
          return;
        }
      }
      if (e.isComposing || e.keyCode === 229) return; // IME composing
      // Input history: ArrowUp on empty textarea recalls previous sent message
      if (e.key === 'ArrowUp' && !this._textarea.value.trim() && this._sentHistory?.length) {
        e.preventDefault();
        if (this._historyIdx == null) this._historyIdx = this._sentHistory.length;
        if (this._historyIdx > 0) {
          this._historyIdx--;
          this._textarea.value = this._sentHistory[this._historyIdx];
          this._textarea.style.height = 'auto';
          this._textarea.style.height = Math.min(this._textarea.scrollHeight, 200) + 'px';
        }
        return;
      }
      if (e.key === 'ArrowDown' && this._historyIdx != null) {
        e.preventDefault();
        this._historyIdx++;
        if (this._historyIdx >= this._sentHistory.length) {
          this._historyIdx = null;
          this._textarea.value = '';
        } else {
          this._textarea.value = this._sentHistory[this._historyIdx];
        }
        this._textarea.style.height = 'auto';
        this._textarea.style.height = Math.min(this._textarea.scrollHeight, 200) + 'px';
        return;
      }
      if (this._historyIdx != null && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') this._historyIdx = null;
      if (this._expanded) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._send(); }
      } else {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
      }
    });

    // Slash command autocomplete on input
    this._textarea.addEventListener('input', () => {
      const val = this._textarea.value;
      if (val.startsWith('/') && !val.includes(' ') && this._slashCommands.length) {
        const q = val.toLowerCase();
        const matches = val === '/' ? this._slashCommands : this._slashCommands.filter(c => c.toLowerCase().startsWith(q));
        if (matches.length > 0) {
          this._slashDropdown.innerHTML = matches.slice(0, 10).map((c, i) =>
            `<div class="chat-slash-item${i === 0 ? ' active' : ''}" data-cmd="${escHtml(c)}">${escHtml(c)}</div>`
          ).join('');
          this._slashDropdown.classList.remove('hidden');
        } else {
          this._slashDropdown.classList.add('hidden');
        }
      } else {
        this._slashDropdown.classList.add('hidden');
      }
    });

    // Input wrapper (for floating expand button inside textarea)
    const inputWrap = document.createElement('div');
    inputWrap.className = 'chat-input-wrap';

    const expandBtn = document.createElement('button');
    expandBtn.className = 'chat-expand-btn';
    expandBtn.textContent = '\u2922';
    expandBtn.title = t('Expand editor');
    expandBtn.onclick = () => {
      this._expanded = !this._expanded;
      if (this._expanded) {
        this._textarea.style.height = '200px';
        this._textarea.style.minHeight = '200px';
        this._textarea.classList.add('chat-input-expanded');
        expandBtn.textContent = '\u2923';
        expandBtn.title = t('Collapse editor');
        this._shortcutHint.textContent = 'Ctrl+\u23CE';
      } else {
        this._textarea.classList.remove('chat-input-expanded');
        this._textarea.style.minHeight = '';
        this._textarea.style.height = '';
        expandBtn.textContent = '\u2922';
        expandBtn.title = t('Expand editor');
        this._shortcutHint.textContent = '\u23CE';
      }
      this._textarea.focus();
    };

    this._slashDropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.chat-slash-item');
      if (item) { this._textarea.value = item.dataset.cmd + ' '; this._slashDropdown.classList.add('hidden'); this._textarea.focus(); }
    });
    // Image upload button (visible on mobile, hidden on desktop where paste works)
    const attachBtn = document.createElement('button');
    attachBtn.className = 'chat-attach-btn';
    attachBtn.title = t('Attach image');
    attachBtn.innerHTML = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="1.5"/><circle cx="5.5" cy="5.5" r="1.5"/><path d="M14 10.5l-3-3-4 4-2-2-3 3"/></svg>';
    const attachInput = document.createElement('input');
    attachInput.type = 'file';
    attachInput.accept = 'image/*';
    attachInput.multiple = true;
    attachInput.style.display = 'none';
    attachBtn.onclick = () => attachInput.click();
    attachInput.onchange = () => {
      for (const file of attachInput.files) this._addImageAttachment(file);
      attachInput.value = '';
    };

    // Upload file/folder to the session's working directory, then insert its
    // path into the input. Click → menu (also the mobile entry point); desktop
    // also supports drag-and-drop (wired by ChatView onto the whole chat view).
    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'chat-attach-btn';
    uploadBtn.title = t('Upload file/folder to working directory');
    uploadBtn.innerHTML = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 4L5 8.5a2.5 2.5 0 003.5 3.5L13 7.5a4 4 0 00-5.7-5.7L3 6.2"/></svg>';
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.multiple = true; fileInput.style.display = 'none';
    const dirInput = document.createElement('input');
    dirInput.type = 'file'; dirInput.setAttribute('webkitdirectory', ''); dirInput.style.display = 'none';
    fileInput.onchange = () => { if (fileInput.files.length) this.uploadFiles([...fileInput.files]); fileInput.value = ''; };
    dirInput.onchange = () => { if (dirInput.files.length) this.uploadFiles([...dirInput.files]); dirInput.value = ''; };
    uploadBtn.onclick = (e) => {
      e.preventDefault();
      const r = uploadBtn.getBoundingClientRect();
      showContextMenu(r.left, r.bottom + 4, [
        { label: t('Upload file(s)'), action: () => fileInput.click() },
        { label: t('Upload folder'), action: () => dirInput.click() },
      ]);
    };

    inputWrap.append(attachBtn, attachInput, uploadBtn, fileInput, dirInput, this._textarea, expandBtn, this._slashDropdown);

    const sendCol = document.createElement('div');
    sendCol.className = 'chat-send-col';
    const sendBtn = document.createElement('button');
    sendBtn.className = 'chat-send-btn';
    sendBtn.textContent = '\u25B6';
    sendBtn.title = t('Send');
    sendBtn.onclick = () => this._send();
    this._shortcutHint = document.createElement('div');
    this._shortcutHint.className = 'chat-shortcut-hint';
    this._shortcutHint.textContent = '\u23CE';

    sendCol.append(sendBtn, this._shortcutHint);

    // TODO display (above streaming status)
    this._todoDisplay = document.createElement('div');
    this._todoDisplay.className = 'chat-todo-display hidden';
    this._todoContainer = null; // set externally for popup positioning

    // Streaming status indicator (above input)
    this._streamStatus = document.createElement('div');
    this._streamStatus.className = 'chat-stream-status hidden';

    inputArea.append(this._attachArea, this._todoDisplay, this._streamStatus, inputWrap, sendCol);
  }

  /** The .chat-input-area wrapper element */
  get element() { return this._element; }

  /** The streaming status element (for readOnly mode, shared reference) */
  get statusElement() { return this._streamStatus; }

  // ── Upload files/folders to the session cwd, then insert their path(s) ──
  // Called by the upload button, the folder picker, and ChatView's drag-drop.
  // Each File may carry `_relPath` (drag-dropped folder) or `webkitRelativePath`
  // (folder picker); preservePaths is inferred so the folder tree is recreated
  // under cwd. After upload, the top-level path(s) are inserted at the cursor.
  async uploadFiles(files) {
    files = (files || []).filter(Boolean);
    if (!files.length) return;
    const cwd = this._getCwd();
    if (!cwd) { this._uploadToast(t('No working directory for this session'), true); return; }
    this._uploadToast(files.length > 1 ? t('Uploading {n} items…', { n: files.length }) : t('Uploading {n} item…', { n: files.length }));
    try {
      // Chunked + per-file fallback: a folder with one unreadable file (the
      // usual net::ERR_ACCESS_DENIED cause) no longer fails the whole upload.
      const { uploaded, failed } = await uploadFilesBatched(files, {
        destDir: cwd,
        onProgress: (d, total) => this._uploadToast(t('Uploading {d}/{total}…', { d, total })),
      });
      if (uploaded.length) this._insertUploadedPaths(cwd, uploaded);
      if (failed.length) {
        this._uploadToast(t("Uploaded {n}, {failed} couldn't be read (e.g. {name})", { n: uploaded.length, failed: failed.length, name: failed[0].name }), true);
      } else if (!uploaded.length) {
        this._uploadToast(t('Upload failed — no files could be read'), true);
      } else {
        this._uploadToast(null);
      }
    } catch (e) {
      this._uploadToast(t('Upload failed: {msg}', { msg: e.message }), true);
    }
  }

  _insertUploadedPaths(cwd, uploaded) {
    const base = cwd.replace(/\/+$/, '');
    // One entry per top-level item: a file → its own path; a folder → the folder
    // root (deduped across all its uploaded files).
    const tops = new Set();
    for (const f of uploaded) { const first = (f.name || '').split('/')[0]; if (first) tops.add(first); }
    if (!tops.size) return;
    const quote = (p) => /[\s'"$`\\()]/.test(p) ? `'${p.replace(/'/g, "'\\''")}'` : p;
    const text = [...tops].map((t) => quote(base + '/' + t)).join(' ');
    const ta = this._textarea;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const sep = (before && !/\s$/.test(before)) ? ' ' : '';
    const inserted = sep + text + ' ';
    ta.value = before + inserted + after;
    const pos = (before + inserted).length;
    ta.focus();
    try { ta.setSelectionRange(pos, pos); } catch {}
    ta.dispatchEvent(new Event('input', { bubbles: true })); // resize + draft save
  }

  _uploadToast(msg, isError) {
    if (!this._uploadToastEl) {
      this._uploadToastEl = document.createElement('div');
      this._uploadToastEl.className = 'chat-upload-toast hidden';
      this._element.appendChild(this._uploadToastEl);
    }
    const el = this._uploadToastEl;
    if (this._uploadToastTimer) { clearTimeout(this._uploadToastTimer); this._uploadToastTimer = null; }
    if (!msg) { el.classList.add('hidden'); return; }
    el.textContent = msg;
    el.classList.toggle('chat-upload-toast-error', !!isError);
    el.classList.remove('hidden');
    if (isError || !/…$/.test(msg)) this._uploadToastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
  }

  /** The todo display element */
  get todoElement() { return this._todoDisplay; }

  /** Whether currently streaming */
  get isStreaming() { return this._isStreaming; }

  /** Set the container element for popup positioning (the .chat-view) */
  set popupContainer(el) { this._todoContainer = el; }

  // ── Public API ──

  showTyping(label = t('thinking...')) {
    if (!this._streamStatus) return;
    this._streamStatus.innerHTML = `<span class="chat-spinner"></span> ${escHtml(label)}<button class="chat-interrupt-btn" title="${escHtml(t('Interrupt'))}">\u25A0 ${escHtml(t('Stop'))}</button>`;
    this._streamStatus.querySelector('.chat-interrupt-btn').onclick = () => this._onInterrupt();
    this._streamStatus.classList.remove('hidden');
    this._isStreaming = true;
  }

  hideTyping() {
    if (!this._streamStatus) return;
    this._streamStatus.classList.add('hidden');
    this._streamStatus.innerHTML = '';
    this._isStreaming = false;
  }

  updateTodos(todos) {
    this._todos = todos;
    this._updateTodoDisplay();
  }

  setSlashCommands(cmds) {
    this._slashCommands = cmds;
  }

  setReadOnly() {
    if (this._textarea) {
      this._textarea.disabled = true;
      this._textarea.placeholder = t('Session ended');
    }
    this._element.style.display = 'none';
  }

  setDisconnected(disconnected) {
    // Keep the textarea fully editable — the user must be able to select/copy
    // (a disabled textarea blocks selection) and keep drafting; only SENDING
    // is blocked (guarded in _send). Drafts queue via ws.pending and sync on
    // reconnect.
    this._disconnected = disconnected;
    this._element.classList.toggle('chat-input-disconnected', disconnected);
  }

  focus() {
    if (this._textarea) this._textarea.focus();
  }

  dispose() {
    if (this._draftSyncHandler) {
      const sync = getStateSync();
      if (sync) sync.off('drafts', 'chat:' + this._sessionId, this._draftSyncHandler);
    }
  }

  // ── Private ──

  _send() {
    const text = this._textarea.value.trim();
    const hasAttachments = this._attachments.length > 0;
    if (!text && !hasAttachments) return;
    if (this._disconnected) {
      showToast(t('Disconnected — reconnecting… your draft is kept'), { type: 'error' });
      return;
    }

    // Intercept /goal command — handled by wrapper, not sent as chat message
    const goalMatch = text.match(/^\/goal(?:\s+(.*))?$/s);
    if (goalMatch) {
      const goalArg = (goalMatch[1] || '').trim();
      if (!goalArg) {
        this._ws.send({ type: 'set-goal', sessionId: this._sessionId, action: 'status' });
      } else if (goalArg === 'clear') {
        this._ws.send({ type: 'set-goal', sessionId: this._sessionId, goal: null });
      } else if (goalArg === 'resume') {
        this._ws.send({ type: 'set-goal', sessionId: this._sessionId, action: 'resume' });
      } else {
        this._ws.send({ type: 'set-goal', sessionId: this._sessionId, goal: goalArg });
      }
      this._textarea.value = '';
      this._textarea.style.height = '';
      clearDraft('chat', this._sessionId);
      return;
    }

    const msgId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    // Save to input history (ring buffer, max 50)
    if (text) {
      if (!this._sentHistory) this._sentHistory = [];
      this._sentHistory.push(text);
      if (this._sentHistory.length > 50) this._sentHistory.shift();
      this._historyIdx = null;
    }

    this._textarea.value = '';
    this._textarea.style.height = '';
    this._textarea.style.minHeight = '';
    clearDraft('chat', this._sessionId);
    if (this._expanded) {
      this._expanded = false;
      this._textarea.classList.remove('chat-input-expanded');
      const eb = this._textarea.parentElement?.querySelector('.chat-expand-btn');
      if (eb) { eb.textContent = '\u2922'; eb.title = t('Expand editor'); }
      this._shortcutHint.textContent = '\u23CE';
    }

    if (hasAttachments) {
      const content = [];
      for (const a of this._attachments) {
        content.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.base64 } });
      }
      if (text) content.push({ type: 'text', text });
      const msg = JSON.stringify({ type: 'user', message: { role: 'user', content } });
      this._ws.send({ type: 'chat-input', sessionId: this._sessionId, text: msg, msgId });
      this._attachments = [];
      this._renderAttachments();
    } else {
      this._ws.send({ type: 'chat-input', sessionId: this._sessionId, text, msgId });
    }

    // Notify parent to handle scroll/pin
    this._onSend();
    this.showTyping(t('thinking...'));
  }

  _addImageAttachment(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      const mediaType = file.type || 'image/png';
      const attachment = { base64, mediaType, dataUrl, name: file.name || 'image' };
      this._attachments.push(attachment);
      this._renderAttachments();
      this._textarea.focus();
    };
    reader.readAsDataURL(file);
  }

  _renderAttachments() {
    this._attachArea.innerHTML = '';
    if (!this._attachments.length) { this._attachArea.classList.add('hidden'); return; }
    this._attachArea.classList.remove('hidden');
    for (let i = 0; i < this._attachments.length; i++) {
      const a = this._attachments[i];
      const item = document.createElement('div');
      item.className = 'chat-attach-item';
      item.innerHTML = `<img src="${a.dataUrl}" alt="${escHtml(a.name)}"><span class="chat-attach-name">${escHtml(a.name)}</span>`;
      const removeBtn = document.createElement('button');
      removeBtn.className = 'chat-attach-remove';
      removeBtn.textContent = '\u2715';
      removeBtn.title = t('Remove');
      removeBtn.onclick = (e) => { e.stopPropagation(); this._attachments.splice(i, 1); this._renderAttachments(); };
      item.appendChild(removeBtn);
      this._attachArea.appendChild(item);
    }
  }

  _updateTodoDisplay() {
    if (!this._todoDisplay) return;
    if (!this._todos?.length) { this._todoDisplay.classList.add('hidden'); return; }
    const inProgress = this._todos.find(t => t.status === 'in_progress');
    const completed = this._todos.filter(t => t.status === 'completed').length;
    const total = this._todos.length;
    if (!inProgress && completed === total) { this._todoDisplay.classList.add('hidden'); return; }
    const label = inProgress ? inProgress.activeForm || inProgress.content : t('{completed}/{total} done', { completed, total });
    const icon = inProgress ? UI_ICONS.hourglass : UI_ICONS.check;
    this._todoDisplay.innerHTML = `<span class="chat-todo-current">${icon} ${escHtml(label)} <span class="chat-status-dim">(${completed}/${total})</span></span>`;
    this._todoDisplay.classList.remove('hidden');
    this._todoDisplay.onclick = (e) => {
      e.stopPropagation();
      const container = this._todoContainer || this._element.parentElement;
      const existing = container.querySelector('.chat-todo-popup');
      if (existing) { existing.remove(); return; }
      const popup = document.createElement('div');
      popup.className = 'chat-todo-popup';
      for (const t of this._todos) {
        const icon = t.status === 'completed' ? UI_ICONS.check : t.status === 'in_progress' ? UI_ICONS.hourglass : UI_ICONS.circle;
        const item = document.createElement('div');
        item.className = `chat-todo-item chat-todo-${t.status}`;
        item.innerHTML = `${icon} <span>${escHtml(t.content)}</span>`;
        popup.appendChild(item);
      }
      const rect = this._todoDisplay.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      popup.style.position = 'absolute';
      popup.style.bottom = (containerRect.bottom - rect.top + 4) + 'px';
      popup.style.left = '12px';
      popup.style.right = '12px';
      container.appendChild(popup);
      const close = (ev) => { if (!popup.contains(ev.target) && !this._todoDisplay.contains(ev.target)) { popup.remove(); document.removeEventListener('mousedown', close); } };
      setTimeout(() => document.addEventListener('mousedown', close), 0);
    };
  }
}
