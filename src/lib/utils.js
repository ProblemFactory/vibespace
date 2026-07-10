import { t } from './i18n.js';

export function formatSize(b) { if(b<1024) return b+' B'; if(b<1048576) return (b/1024).toFixed(1)+' KB'; return (b/1048576).toFixed(1)+' MB'; }

// ── Shared modal shell (dynamic overlay dialogs) ──
// ONE implementation of the hand-rolled overlay pattern (dialog-overlay +
// .dialog + header/✕ + body) that used to be copy-pasted across app.js,
// manage-agents.js, sidebar-mounts.js and file-explorer.js. Deliberately NOT
// [data-popover]: the global Escape handler blind-.remove()s popovers, which
// would skip onClose side effects (e.g. the bootstrap dialog's ws-handler
// unregistration) — Escape support is opt-in and self-contained instead.
//   const { overlay, dialog, body, close } = createModalShell({ title, id });
// id: singleton dedup — an existing overlay with the same id is removed first.
// escapeToClose: focuses the overlay and closes on Escape (stopPropagation so
// the global #dialog-overlay handler doesn't also fire).
export function createModalShell({ id, title = '', dialogClass = '', bodyClass = '', minWidth = null, closeOnBackdrop = true, escapeToClose = false, onClose = null } = {}) {
  if (id) document.getElementById(id)?.remove();
  const overlay = document.createElement('div');
  if (id) overlay.id = id;
  overlay.className = 'dialog-overlay';
  overlay.style.zIndex = '99998';
  const dialog = document.createElement('div');
  dialog.className = 'dialog' + (dialogClass ? ' ' + dialogClass : '');
  if (minWidth) dialog.style.minWidth = minWidth;
  const header = document.createElement('div');
  header.className = 'dialog-header';
  const h3 = document.createElement('h3'); h3.textContent = title;
  const closeBtn = document.createElement('button'); closeBtn.className = 'dialog-close'; closeBtn.textContent = '✕';
  header.append(h3, closeBtn);
  const body = document.createElement('div');
  body.className = 'dialog-body' + (bodyClass ? ' ' + bodyClass : '');
  dialog.append(header, body);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); onClose?.(); };
  closeBtn.onclick = close;
  if (closeOnBackdrop) overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  if (escapeToClose) {
    overlay.tabIndex = -1;
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    setTimeout(() => overlay.focus(), 0);
  }
  return { overlay, dialog, body, closeBtn, close };
}

// ── In-app modal dialogs (replace native prompt/confirm/alert) ──
// Native dialogs block the event loop, ignore the theme, and are awkward on
// mobile. These reuse the existing .dialog CSS. Promise-based:
//   const name = await showInputDialog({ title: 'Rename', value: old });  // null on cancel
//   if (await showConfirmDialog({ title: 'Delete?', message: '...', danger: true })) …
// closeOnBackdrop off: the callers wire backdrop mousedown themselves so the
// Promise resolves (a bare overlay.remove() would leave the await hanging).
function _modalShell(title) {
  const { overlay, dialog, body, closeBtn } = createModalShell({ title, closeOnBackdrop: false });
  const footer = document.createElement('div'); footer.className = 'dialog-footer';
  const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn-cancel'; cancelBtn.textContent = t('Cancel');
  const okBtn = document.createElement('button'); okBtn.className = 'btn-create';
  footer.append(cancelBtn, okBtn);
  dialog.appendChild(footer);
  return { overlay, body, okBtn, cancelBtn, closeBtn };
}

export function showInputDialog({ title = t('Input'), label = '', value = '', placeholder = '', confirmText = t('OK'), multiline = false } = {}) {
  return new Promise((resolve) => {
    const { overlay, body, okBtn, cancelBtn, closeBtn } = _modalShell(title);
    okBtn.textContent = confirmText;
    const wrap = document.createElement('label');
    if (label) wrap.appendChild(document.createTextNode(label));
    const input = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    else input.rows = 4;
    input.value = value;
    input.placeholder = placeholder;
    wrap.appendChild(input);
    body.appendChild(wrap);
    const done = (result) => { overlay.remove(); resolve(result); };
    okBtn.onclick = () => done(input.value);
    cancelBtn.onclick = closeBtn.onclick = () => done(null);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(null); });
    input.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !multiline) { e.preventDefault(); done(input.value); }
      if (e.key === 'Enter' && multiline && (e.ctrlKey || e.metaKey)) { e.preventDefault(); done(input.value); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
    });
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

export function showConfirmDialog({ title = t('Confirm'), message = '', confirmText = t('OK'), danger = false } = {}) {
  return new Promise((resolve) => {
    const { overlay, body, okBtn, cancelBtn, closeBtn } = _modalShell(title);
    okBtn.textContent = confirmText;
    if (danger) okBtn.classList.add('danger'); // red fill+border+hover as a set (inline bg kept the accent border)
    const p = document.createElement('p');
    p.className = 'dialog-hint';
    p.style.fontSize = '12px';
    p.textContent = message;
    body.appendChild(p);
    const done = (result) => { overlay.remove(); resolve(result); };
    okBtn.onclick = () => done(true);
    cancelBtn.onclick = closeBtn.onclick = () => done(false);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(false); });
    overlay.tabIndex = -1;
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
    });
    setTimeout(() => okBtn.focus(), 0);
  });
}

// ── Global toast notifications ──
// One shared bottom-center stack for transient feedback. Replaces the ad-hoc
// mix of alert()s, per-component toasts, and silent .catch(() => {}) failures.
// showToast('Saved');  showToast('Rename failed: ' + e.message, { type: 'error' })
export function showToast(message, { type = 'info', duration } = {}) {
  let stack = document.getElementById('global-toasts');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'global-toasts';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = `global-toast global-toast-${type}`;
  el.textContent = message;
  stack.appendChild(el);
  // Cap the stack so a burst of errors doesn't fill the screen
  while (stack.children.length > 4) stack.firstChild.remove();
  const ttl = duration ?? (type === 'error' ? 6000 : 3000);
  setTimeout(() => {
    el.classList.add('global-toast-out');
    setTimeout(() => { el.remove(); if (!stack.children.length) stack.remove(); }, 250);
  }, ttl);
  return el;
}

const _uploadName = (f) => f._relPath || f.webkitRelativePath || f.name;

// Resilient multipart upload to /api/upload. A folder upload used to go up as
// ONE giant request, so a single file the browser can't read (permission /
// special file / dead symlink — common in macOS project dirs) failed the WHOLE
// thing with net::ERR_ACCESS_DENIED. This chunks the files and, when a chunk
// fails, retries it FILE-BY-FILE so the readable files still land and only the
// bad ones are reported. Returns { uploaded:[{name,path,size}], failed:[{name,error}] }.
export async function uploadFilesBatched(files, { destDir, preservePaths, onProgress } = {}) {
  const list = (files || []).filter(Boolean);
  const CHUNK_FILES = 40, CHUNK_BYTES = 64 * 1024 * 1024;
  const chunks = [];
  let cur = [], curBytes = 0;
  for (const f of list) {
    if (cur.length && (cur.length >= CHUNK_FILES || curBytes + (f.size || 0) > CHUNK_BYTES)) { chunks.push(cur); cur = []; curBytes = 0; }
    cur.push(f); curBytes += f.size || 0;
  }
  if (cur.length) chunks.push(cur);

  const postChunk = async (chunkFiles) => {
    const fd = new FormData();
    const names = [];
    for (const f of chunkFiles) { fd.append('files', f); names.push(_uploadName(f)); }
    fd.append('destDir', destDir);
    fd.append('fileNames', JSON.stringify(names));
    if (preservePaths || names.some((n) => n.includes('/'))) fd.append('preservePaths', '1');
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data.files || [];
  };

  const uploaded = [], failed = [];
  let done = 0;
  for (const chunk of chunks) {
    try {
      uploaded.push(...await postChunk(chunk));
    } catch (e) {
      if (chunk.length === 1) {
        failed.push({ name: _uploadName(chunk[0]), error: e.message });
      } else {
        // Isolate the unreadable file(s): retry each on its own.
        for (const f of chunk) {
          try { uploaded.push(...await postChunk([f])); }
          catch (e2) { failed.push({ name: _uploadName(f), error: e2.message }); }
        }
      }
    }
    done += chunk.length;
    onProgress?.(done, list.length);
  }
  return { uploaded, failed };
}
// Front-truncate a path-like string: keep the END (the meaningful filename),
// drop the front with a leading ellipsis. Used for window/taskbar titles so a
// CSS end-ellipsis doesn't hide the filename. e.g. "…/deep/dir/file.js".
export function frontTruncate(str, maxLen = 40) {
  const s = String(str ?? '');
  return s.length > maxLen ? '…' + s.slice(-(maxLen - 1)) : s;
}
// Escapes quotes too — safe in BOTH text and attribute contexts (the old
// textContent/innerHTML round-trip left " and ' unescaped, allowing attribute
// breakout in `attr="${escHtml(x)}"` template patterns).
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]); }

export function attachPopoverClose(popover, ...excludeEls) {
  setTimeout(() => {
    const close = (e) => {
      if (popover.contains(e.target)) return;
      for (const el of excludeEls) { if (el?.contains(e.target)) return; }
      // A popover spawned FROM this one (context menu on a list row, submenu)
      // is a child interaction — clicking it must not dismiss this popover.
      // Opening a popover from regular UI still closes this one (that
      // mousedown lands outside any [data-popover]).
      if (e.target.closest?.('[data-popover]')) return;
      popover.remove();
      document.removeEventListener('mousedown', close);
    };
    document.addEventListener('mousedown', close);
  }, 0);
}

/**
 * Create a positioned popover, removing any existing one with the same class.
 * Returns the popover element for caller to populate.
 * @param {HTMLElement} anchor - element to position below
 * @param {string} className - CSS class (also used to remove duplicates)
 * @param {object} [opts] - { parent, position: 'below'|'cursor', x, y }
 */
export function createPopover(anchor, className, opts = {}) {
  document.querySelectorAll('.' + className.split(' ')[0]).forEach(p => p.remove());
  const pop = document.createElement('div');
  pop.className = className;
  pop.dataset.popover = '1'; // global Escape handler closes anything tagged
  pop.style.position = 'fixed';
  pop.style.zIndex = '99999';
  // Initial placement (off-screen to measure)
  pop.style.visibility = 'hidden';
  if (opts.position === 'cursor') {
    pop.style.left = (opts.x || 0) + 'px';
    pop.style.top = (opts.y || 0) + 'px';
  } else {
    const rect = anchor.getBoundingClientRect();
    pop.style.left = rect.left + 'px';
    pop.style.top = (rect.bottom + 2) + 'px';
  }
  (opts.parent || document.body).appendChild(pop);
  // Clamp to viewport after render so content is measured
  requestAnimationFrame(() => {
    const pr = pop.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (pr.right > vw) pop.style.left = Math.max(0, vw - pr.width - 4) + 'px';
    if (pr.bottom > vh) pop.style.top = Math.max(0, vh - pr.height - 4) + 'px';
    if (pr.left < 0) pop.style.left = '4px';
    if (pr.top < 0) pop.style.top = '4px';
    pop.style.visibility = '';
  });
  attachPopoverClose(pop, anchor);
  return pop;
}

/**
 * Show a context menu at cursor position.
 * @param {number} x
 * @param {number} y
 * @param {Array<{label: string, action: function, style?: string}>} items
 * @param {string} [className='context-menu']
 */
export function showContextMenu(x, y, items, className = 'context-menu') {
  // Remove existing menus of same class
  document.querySelectorAll('.' + className.split(' ')[0]).forEach(p => p.remove());
  const pop = document.createElement('div');
  pop.className = className;
  pop.dataset.popover = '1'; // global Escape handler closes anything tagged
  pop.style.position = 'fixed';
  pop.style.zIndex = '99999';
  pop.style.visibility = 'hidden';
  pop.style.left = x + 'px';
  pop.style.top = y + 'px';
  document.body.appendChild(pop);
  attachPopoverClose(pop); // no anchor exclusion — any outside click closes
  for (const item of items) {
    if (item.separator) { const sep = document.createElement('div'); sep.className = className + '-separator'; pop.appendChild(sep); continue; }
    const el = document.createElement('div');
    el.className = className + '-item' + (item.disabled ? ' disabled' : '');
    if (item.style) el.style.cssText = item.style;
    if (item.children?.length) {
      // Submenu item: hover to expand
      el.textContent = item.label + ' \u25B8';
      el.style.position = 'relative';
      const sub = document.createElement('div');
      sub.className = className;
      sub.style.cssText = 'position:absolute;left:100%;top:-4px;display:none;z-index:99999';
      for (const child of item.children) {
        const ce = document.createElement('div');
        ce.className = className + '-item';
        ce.textContent = child.label;
        if (child.style) ce.style.cssText = child.style;
        ce.onclick = (e) => { e.stopPropagation(); pop.remove(); child.action(); };
        sub.appendChild(ce);
      }
      el.appendChild(sub);
      el.addEventListener('mouseenter', () => { sub.style.display = ''; });
      el.addEventListener('mouseleave', () => { sub.style.display = 'none'; });
      // Touch: no hover exists — tap the parent row to open the submenu.
      // Only opens (never toggles closed): emulated mouseenter on tap may have
      // already shown it, and a toggle would immediately re-hide it.
      el.addEventListener('click', (e) => {
        if (e.target !== el) return; // child item clicks handle themselves
        e.stopPropagation();
        sub.style.display = '';
        requestAnimationFrame(() => {
          const r = sub.getBoundingClientRect();
          if (r.right > window.innerWidth && !sub.style.right) { sub.style.left = 'auto'; sub.style.right = '100%'; }
          const overflowY = r.bottom - window.innerHeight;
          if (overflowY > 0) sub.style.top = `${-4 - overflowY - 4}px`; // top is relative to the parent row (initial -4px)
        });
      });
    } else {
      el.textContent = item.label;
      if (item.disabled) { el.style.opacity = '0.4'; el.style.cursor = 'default'; }
      else el.onclick = () => { pop.remove(); item.action(); };
    }
    pop.appendChild(el);
  }
  // Keep menu on screen
  const mr = pop.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  if (mr.right > vw) pop.style.left = Math.max(0, vw - mr.width - 4) + 'px';
  if (mr.bottom > vh) pop.style.top = Math.max(0, vh - mr.height - 4) + 'px';
  if (mr.left < 0) pop.style.left = '4px';
  if (mr.top < 0) pop.style.top = '4px';
  pop.style.visibility = '';
  return pop;
}

/**
 * Long-press → contextmenu for touch devices.
 *
 * iOS Safari never fires `contextmenu` on long-press, so every right-click
 * menu (file explorer, group headers, …) is unreachable there. Synthesize a
 * bubbling contextmenu event after a 500ms still press. Android Chrome fires
 * the native event itself — a trusted contextmenu cancels the pending timer
 * so menus don't double-fire.
 */
export function installLongPressContextMenu() {
  let timer = null, sx = 0, sy = 0, fired = false;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  document.addEventListener('touchstart', (e) => {
    cancel(); fired = false;
    if (e.touches.length !== 1) return;
    const target = e.target;
    // Native long-press matters on these (paste menu, text selection, terminal)
    if (target.closest?.('textarea, input, select, [contenteditable], .xterm')) return;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY;
    timer = setTimeout(() => {
      timer = null; fired = true;
      try { navigator.vibrate?.(10); } catch {}
      target.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, view: window, clientX: sx, clientY: sy,
      }));
    }, 500);
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', (e) => {
    if (!timer) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) cancel();
  }, { passive: true, capture: true });
  // Non-passive: preventDefault after a fired long-press suppresses the
  // emulated click that would otherwise also activate the pressed element
  document.addEventListener('touchend', (e) => {
    cancel();
    if (fired) { fired = false; e.preventDefault(); }
  }, { capture: true });
  document.addEventListener('touchcancel', () => { cancel(); fired = false; }, { capture: true });
  document.addEventListener('contextmenu', (e) => { if (e.isTrusted) cancel(); }, { capture: true });
}

/**
 * Anchor a persistent position:fixed popup next to its trigger element.
 * The trigger can live ANYWHERE (customize mode moves chrome elements between
 * bars), so hardcoded bottom/right CSS is wrong the moment it's dragged — this
 * flips above/below by the trigger's screen half, right/left-aligns to it, and
 * clamps into the viewport. Growth-direction friendly: anchored-above popups
 * pin `bottom` (grow upward), anchored-below pin `top` — so live re-renders
 * that change the height stay glued to the trigger without re-measuring.
 */
export function anchorFixedPopup(popup, anchor, { gap = 6 } = {}) {
  if (!popup || !anchor) return;
  const r = anchor.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const openUp = r.top + r.height / 2 > vh / 2;
  if (openUp) {
    popup.style.bottom = `${Math.max(8, vh - r.top + gap)}px`;
    popup.style.top = 'auto';
    popup.style.maxHeight = `${Math.max(120, r.top - gap - 16)}px`;
  } else {
    popup.style.top = `${Math.min(vh - 40, r.bottom + gap)}px`;
    popup.style.bottom = 'auto';
    popup.style.maxHeight = `${Math.max(120, vh - r.bottom - gap - 16)}px`;
  }
  if (r.left + r.width / 2 > vw / 2) {
    popup.style.right = `${Math.max(8, vw - r.right)}px`;
    popup.style.left = 'auto';
  } else {
    popup.style.left = `${Math.max(8, r.left)}px`;
    popup.style.right = 'auto';
  }
  // width clamp needs the rendered size — nudge back inside if overflowing
  const pr = popup.getBoundingClientRect();
  if (pr.right > vw - 8) { popup.style.left = `${Math.max(8, vw - 8 - pr.width)}px`; popup.style.right = 'auto'; }
  else if (pr.left < 8) { popup.style.left = '8px'; popup.style.right = 'auto'; }
}

/** Fetch JSON with silent error handling. Returns null on failure. */
export async function fetchJson(url, opts) {
  try {
    const res = await fetch(url, opts);
    return await res.json();
  } catch { return null; }
}

/** Clipboard copy with execCommand fallback for non-HTTPS */
export function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => _fallbackCopy(text));
  }
  _fallbackCopy(text);
  return Promise.resolve();
}
function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

// ── StateSync: unified versioned state sync with diff broadcast ──
// Each store tracks a version. On reconnect, requests missed ops from server.
// Components listen via events: stateSync.on('drafts', 'chat:sess-1', handler)
class StateSync {
  constructor(wsManager) {
    this.ws = wsManager;
    this.stores = {};    // name → { version, data, listeners }
    this._globalHandler = (msg) => {
      if (msg.type === 'state-sync') this._applyOp(msg.store, msg);
      else if (msg.type === 'state-snapshot') this._applySnapshot(msg.store, msg.data, msg.version);
    };
    wsManager.onGlobal(this._globalHandler);
    // On reconnect, request missed ops for all stores
    this._stateHandler = (connected) => {
      if (!connected) return;
      const versions = {};
      for (const [name, s] of Object.entries(this.stores)) versions[name] = s.version;
      if (Object.keys(versions).length) this.ws.send({ type: 'state-resync', versions });
    };
    wsManager.onStateChange(this._stateHandler);
  }

  // Load initial snapshot from server
  async init(storeName) {
    if (this.stores[storeName]) return;
    this.stores[storeName] = { version: 0, data: {}, listeners: new Map() };
    try {
      const res = await fetch(`/api/sync/${storeName}`);
      const snap = await res.json();
      this.stores[storeName].data = snap.data || {};
      this.stores[storeName].version = snap.version || 0;
    } catch {}
  }

  get(storeName, key) { return this.stores[storeName]?.data[key]; }
  getAll(storeName) { return this.stores[storeName]?.data || {}; }

  set(storeName, key, value) {
    const s = this.stores[storeName];
    if (!s) return;
    if (value == null || value === '') {
      delete s.data[key];
      this.ws.send({ type: 'state-set', store: storeName, key, value: '' });
    } else {
      s.data[key] = value;
      this.ws.send({ type: 'state-set', store: storeName, key, value });
    }
  }

  // Listen for changes to a specific key (or '*' for all keys in a store)
  on(storeName, key, handler) {
    const s = this.stores[storeName];
    if (!s) return;
    if (!s.listeners.has(key)) s.listeners.set(key, []);
    s.listeners.get(key).push(handler);
  }

  off(storeName, key, handler) {
    const arr = this.stores[storeName]?.listeners.get(key);
    if (arr) { const i = arr.indexOf(handler); if (i >= 0) arr.splice(i, 1); }
  }

  _applyOp(storeName, op) {
    const s = this.stores[storeName];
    if (!s) return;
    if (op.op === 'set') s.data[op.key] = op.value;
    else if (op.op === 'delete') delete s.data[op.key];
    if (op.version) s.version = op.version;
    this._notify(s, op.key, op.op === 'delete' ? '' : op.value);
  }

  _applySnapshot(storeName, data, version) {
    const s = this.stores[storeName];
    if (!s) return;
    const oldKeys = new Set(Object.keys(s.data));
    s.data = data || {};
    s.version = version || 0;
    // Notify for all changed keys
    for (const key of new Set([...oldKeys, ...Object.keys(s.data)])) {
      const newVal = s.data[key] || '';
      this._notify(s, key, newVal);
    }
  }

  _notify(s, key, value) {
    const specific = s.listeners.get(key);
    const wildcard = s.listeners.get('*');
    if (specific) for (const h of specific) h(value, key);
    if (wildcard) for (const h of wildcard) h(value, key);
  }
}

let _stateSync = null;

export function getStateSync() { return _stateSync; }

export async function initStateSync(wsManager) {
  _stateSync = new StateSync(wsManager);
  await _stateSync.init('drafts');
  await _stateSync.init('uploads');
  return _stateSync;
}

// Convenience wrappers for drafts (most common use case)
export function saveDraft(type, id, value) {
  _stateSync?.set('drafts', type + ':' + id, value);
}

export function loadDraft(type, id) {
  return _stateSync?.get('drafts', type + ':' + id) || '';
}

export function clearDraft(type, id) {
  saveDraft(type, id, '');
}

// Instant hover tooltip (no ~1s native-title delay) for any element carrying a
// `data-tip` attribute. Self-installs on import. Used for icon-only badges
// (config gear, icon-mode status tags) so hovering shows the label immediately.
(function setupInstantTooltip() {
  if (typeof document === 'undefined') return;
  let tip = null;
  const show = (el) => {
    const text = el.getAttribute('data-tip');
    if (!text) return;
    if (!tip) { tip = document.createElement('div'); tip.className = 'instant-tooltip'; (document.body || document.documentElement).appendChild(tip); }
    tip.textContent = text;
    tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    tip.style.left = r.left + 'px';
    tip.style.top = (r.bottom + 5) + 'px';
    const tr = tip.getBoundingClientRect();
    if (tr.right > window.innerWidth - 6) tip.style.left = Math.max(6, window.innerWidth - 6 - tr.width) + 'px';
    if (tr.bottom > window.innerHeight - 6) tip.style.top = (r.top - 5 - tr.height) + 'px';
  };
  const hide = () => { if (tip) tip.style.display = 'none'; };
  document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) show(el); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('[data-tip]')) hide(); });
  document.addEventListener('mousedown', hide, true);
  window.addEventListener('scroll', hide, true);
})();
