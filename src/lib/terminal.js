import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { THEMES } from './themes.js';
import { attachPopoverClose } from './utils.js';

// Web fonts loaded via Google Fonts (always available)
const WEB_FONTS = [
  'Fira Code', 'JetBrains Mono', 'Source Code Pro', 'IBM Plex Mono', 'Inconsolata',
];

// Detect monospace via canvas: in a monospace font, 'i' and 'M' have equal width
const _monoCtx = document.createElement('canvas').getContext('2d');
function _isMonospace(family) {
  _monoCtx.font = `72px "${family}", serif`;
  return Math.abs(_monoCtx.measureText('i').width - _monoCtx.measureText('M').width) < 1;
}

// Build font list: client local fonts (queryLocalFonts) → server fallback → web fonts
let _fontList = null;
const _fontListReady = _buildFontList();

async function _buildFontList() {
  const webSet = new Set(WEB_FONTS.map(f => f.toLowerCase()));
  let localMonoFonts = [];

  // Try client-side Local Font Access API (Chrome 103+)
  if (typeof queryLocalFonts === 'function') {
    try {
      const fonts = await queryLocalFonts();
      const families = [...new Set(fonts.map(f => f.family))];
      localMonoFonts = families.filter(f => !webSet.has(f.toLowerCase()) && _isMonospace(f)).sort();
    } catch {}
  }

  // Fallback to server-side fc-list (useful when client = server)
  if (!localMonoFonts.length) {
    try {
      const res = await fetch('/api/fonts');
      const data = await res.json();
      localMonoFonts = (data.fonts || []).filter(f => !webSet.has(f.toLowerCase()));
    } catch {}
  }

  // CJK monospace fallback chain for Chinese/Japanese/Korean characters
  const CJK_FALLBACK = '"Noto Sans Mono CJK SC","Noto Sans Mono CJK TC","Microsoft YaHei Mono","PingFang SC","Hiragino Sans",monospace';
  const list = [];
  for (const f of WEB_FONTS) list.push({ label: f, value: `"${f}",${CJK_FALLBACK}` });
  if (localMonoFonts.length) {
    list.push({ label: '──────────', value: '_sep', disabled: true });
    for (const f of localMonoFonts) list.push({ label: f, value: `"${f}",${CJK_FALLBACK}` });
  }
  list.push({ label: 'System Default', value: CJK_FALLBACK });
  _fontList = list;
  return list;
}

function getAvailableFonts() { return _fontList || [{ label: 'System Default', value: 'monospace' }]; }

class TerminalSession {
  constructor(winInfo, wsManager, sessionId, themeManager, onEditorRequest, overrides = {}, settings = null) {
    this.winInfo = winInfo; this.ws = wsManager; this.sessionId = sessionId;
    this.themeManager = themeManager; this.onEditorRequest = onEditorRequest;
    this.overrides = { theme: null, fontSize: null, fontFamily: null, ...overrides };
    this._settings = settings;

    const container = document.createElement('div'); container.className = 'terminal-container';
    winInfo.content.appendChild(container);

    const effectiveTheme = this.overrides.theme ? (THEMES[this.overrides.theme]?.terminal || themeManager.getTerminalTheme()) : themeManager.getTerminalTheme();
    const effectiveFontSize = this.overrides.fontSize || parseInt(localStorage.getItem('termFontSize')) || 14;
    const effectiveFont = this.overrides.fontFamily || localStorage.getItem('termFontFamily') || getAvailableFonts()[0]?.value || 'monospace';

    // Auto-detect light backgrounds and enforce minimum contrast if user hasn't set it
    let mcr = this._settings?.get('terminal.minimumContrastRatio') ?? 1;
    if (mcr <= 1) {
      // Check if terminal background is "light" (luminance > 0.5)
      const bg = effectiveTheme.background || '#000000';
      const hex = bg.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (L > 0.4) mcr = 4.5; // WCAG AA for light backgrounds
    }

    this.terminal = new Terminal({
      cursorBlink: false, cursorStyle: 'bar', cursorInactiveStyle: 'none',
      fontSize: effectiveFontSize, fontFamily: effectiveFont,
      lineHeight: 1.15, scrollback: 10000, allowProposedApi: true,
      theme: effectiveTheme,
      minimumContrastRatio: mcr,
    });
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());
    const unicode11 = new Unicode11Addon();
    this.terminal.loadAddon(unicode11);
    this.terminal.unicode.activeVersion = '11';
    this.terminal.open(container);
    // WebGL renderer: device-pixel-aligned cells. The default DOM renderer lays
    // rows out with browser-rounded letter spacing while fit() computes cols from
    // the UNROUNDED cell width — the accumulated fraction clipped the rightmost
    // column. WebGL removes that whole class of bugs (and repaints far faster =
    // less TUI flicker). Falls back to the DOM renderer when WebGL is unavailable.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => { try { webgl.dispose(); } catch {} this._webgl = null; });
      this.terminal.loadAddon(webgl);
      this._webgl = webgl;
    } catch { this._webgl = null; }
    // Paint the container in the terminal theme background: cols/rows are whole
    // cells, so up to one cell of remainder is unavoidable — in window-chrome
    // color it read as "the TUI is smaller than the window"; in the terminal's
    // own background it's invisible.
    container.style.background = effectiveTheme.background || '#000';
    requestAnimationFrame(() => this.fit());
    setTimeout(() => this.fit(), 500);
    // Device-pixel-ratio change (browser zoom, moving between monitors): glyph
    // atlas + measured cell size are stale — rebuild and refit.
    this._dprCleanup = null;
    const watchDpr = () => {
      const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      const onChange = () => {
        try { this.terminal.clearTextureAtlas(); } catch {}
        this.fit();
        mq.removeEventListener('change', onChange);
        watchDpr(); // re-arm for the new ratio
      };
      mq.addEventListener('change', onChange);
      this._dprCleanup = () => mq.removeEventListener('change', onChange);
    };
    watchDpr();

    // Filter out focus in/out sequences (\e[I and \e[O) that xterm.js sends
    // when the terminal element gains/loses browser focus. These cause ^[[I^[[O
    // spam when clicking between terminal and other UI elements (e.g. split-pane editor).
    this.terminal.onData((data) => {
      const filtered = data.replace(/\x1b\[I|\x1b\[O/g, '');
      if (!filtered) return;
      // Auto-repin when user types while scrolled up (skip if split-pane editor is active)
      if (!this._pinned && !this.winInfo?._editorDoSave) this._repin();
      this.ws.send({ type: 'input', sessionId, data: filtered });
    });

    // Paste image from clipboard via hidden contenteditable div
    // xterm.js v5 bypasses paste event; Clipboard API needs HTTPS.
    // Strategy: use attachCustomKeyEventHandler to intercept Ctrl+V BEFORE xterm,
    // redirect focus to a hidden contenteditable div which receives the real paste event.
    const pasteTarget = document.createElement('div');
    pasteTarget.contentEditable = 'true';
    pasteTarget.tabIndex = -1;
    pasteTarget.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;overflow:hidden';
    document.body.appendChild(pasteTarget);
    this._pasteTarget = pasteTarget;

    // xterm custom key handler — fires before xterm processes the key
    this.terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      // Ctrl+V / Cmd+V: redirect to hidden div for image paste support
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        pasteTarget.textContent = '';
        pasteTarget.focus();
        return false;
      }
      // Ctrl+G: always preventDefault to block browser "Find in page".
      // If split-pane editor is open, trigger Save & Close. Otherwise let xterm send to PTY.
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        if (this.winInfo?._editorDoSave) { this.winInfo._editorDoSave(); return false; }
      }
      // Ctrl+C / Cmd+C with selection: copy to clipboard (fallback for HTTP)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const sel = this.terminal.getSelection();
        if (sel) {
          try { navigator.clipboard.writeText(sel); } catch {
            // Fallback: use textarea + execCommand for HTTP
            const ta = document.createElement('textarea');
            ta.value = sel; ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
          }
          this.terminal.clearSelection();
          return false; // don't send SIGINT
        }
        // No selection — let it through as SIGINT
      }
      return true;
    });

    let _pasteInFlight = false;
    pasteTarget.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) { this.terminal.focus(); return; }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          if (_pasteInFlight) return; // dedupe rapid re-triggers
          _pasteInFlight = true;
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              // Upload image and wait for server to set clipboard
              const res = await fetch('/api/paste-image', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl: reader.result }),
              });
              const data = await res.json();
              if (data.ready) {
                // Trigger paste — clipboard is ready
                // Send Ctrl+V (0x16) — Claude Code's Ink input handler checks clipboard on this
                this.ws.send({ type: 'input', sessionId, data: '\x16' });
              }
            } catch {}
            this.terminal.focus();
            setTimeout(() => { _pasteInFlight = false; }, 1000);
          };
          reader.readAsDataURL(blob);
          return;
        }
      }

      // No image — forward text paste to terminal via bracketed paste
      const text = e.clipboardData.getData('text/plain');
      e.preventDefault();
      if (text) {
        this.ws.send({ type: 'input', sessionId, data: '\x1b[200~' + text + '\x1b[201~' });
      }
      this.terminal.focus();
    });

    // Pin-to-bottom: auto-scroll on new output unless user scrolled up
    this._pinned = true;
    this._claudeIdle = true; // assume idle initially — prevents false "waiting" blink on buffer replay
    const scrollBtn = document.createElement('button');
    scrollBtn.className = 'term-scroll-btn hidden';
    scrollBtn.textContent = '↓';
    scrollBtn.title = 'Scroll to bottom';
    scrollBtn.onclick = () => { this._repin(); };
    winInfo.content.appendChild(scrollBtn);

    // Detect user scroll via wheel — unpin on scroll up, re-pin on scroll to bottom.
    // Only meaningful on the NORMAL buffer: a fullscreen TUI on the alternate
    // screen (claude's flicker-free renderer, vim, htop) has no xterm scrollback —
    // the wheel is mouse-reported to the app, which scrolls its own content.
    container.addEventListener('wheel', () => {
      requestAnimationFrame(() => {
        if (this.terminal.buffer.active.type === 'alternate') return;
        const buf = this.terminal.buffer.active;
        const atBottom = buf.viewportY >= buf.baseY;
        if (atBottom && !this._pinned) this._repin();
        else if (!atBottom) { this._pinned = false; scrollBtn.classList.remove('hidden'); }
      });
    }, { passive: true });

    this.ws.on(sessionId, (msg) => {
      if (msg.type === 'output') {
        // Alternate screen: the freeze/queue machinery exists to stop main-screen
        // TUI redraws yanking the scrolled-up viewport — an alt-screen TUI owns
        // the whole viewport, so freezing its frames would just show a stale
        // screen. Always write through (and flush anything queued on the way in).
        if (this.terminal.buffer.active.type === 'alternate') {
          if (!this._pinned) { this._pendingOutput = (this._pendingOutput || '') + msg.data; this._repin(); }
          else this.terminal.write(msg.data);
        } else if (!this._pinned) {
          // Queue output while user is scrolled up — write all at once when re-pinned
          this._pendingOutput = (this._pendingOutput || '') + msg.data;
        } else {
          this.terminal.write(msg.data, () => this.terminal.scrollToBottom());
        }
      } else if (msg.type === 'exited') {
        this.terminal.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
        winInfo.exited = true; if (winInfo._notifyChanged) winInfo._notifyChanged();
      } else if (msg.type === 'effective-size') {
        // Multi-device: PTY is sized to min of all clients. Cap local terminal to match.
        this._effectiveSize = { cols: msg.cols, rows: msg.rows };
        this._effectiveClients = msg.clients || 0;
        this.terminal.resize(msg.cols, msg.rows);
        requestAnimationFrame(() => this._updateCapIndicator());
      }
    });

    // Detect Claude Code idle state via OSC 0 title updates
    // Claude uses ✳ (U+2733) as first char when idle, braille spinners (U+2800-28FF) when working
    this.terminal.parser.registerOscHandler(0, (data) => {
      const ch = data.charCodeAt(0);
      const wasIdle = this._claudeIdle;
      this._claudeIdle = (ch === 0x2733); // ✳

      const s = this._settings;
      const blinkBehavior = s?.get('terminal.waitingBlinkBehavior') ?? 'onlyUnfocused';
      if (this._claudeIdle && !wasIdle && !this._suppressWaiting) {
        if (blinkBehavior === 'always') {
          this._setWaiting(true);
        } else if (blinkBehavior === 'onlyUnfocused' && !winInfo.element.classList.contains('window-active')) {
          this._setWaiting(true);
        }
        // 'never' → don't set waiting
      } else if (!this._claudeIdle && wasIdle) {
        this._setWaiting(false);
      }

      // Update window title from Claude Code's OSC 0 title (strip status prefix)
      const preserveTitle = s?.get('terminal.preserveCustomTitle') && winInfo._hasCustomTitle;
      if (!preserveTitle) {
        const title = data.replace(/^[\u2800-\u28FF\u2733\u2734\u2735\u273B\u273C\u273D\u00B7✻✶✽] ?/, '').trim();
        if (title) { winInfo.title = title; winInfo.titleSpan.textContent = title; }
      }
      return false;
    });

    // Bell notification: show 🔔 on title when terminal bells while window is not focused
    this.terminal.onBell(() => {
      if (winInfo.element.classList.contains('window-active')) return;
      this._setBell(true);
    });
    // Clear bell + waiting on focus
    winInfo.element.addEventListener('mousedown', () => { this._setBell(false); this._setWaiting(false); });

    // Drop file from file explorer → type absolute path into terminal
    container.addEventListener('dragover', (e) => { e.preventDefault(); container.classList.add('drop-target'); });
    container.addEventListener('dragleave', () => container.classList.remove('drop-target'));
    container.addEventListener('drop', (e) => {
      e.preventDefault(); container.classList.remove('drop-target');
      const filePath = e.dataTransfer.getData('application/x-file-path') || e.dataTransfer.getData('text/plain');
      if (filePath && filePath.startsWith('/')) {
        // Shell-escape spaces and special chars, then type into terminal
        const escaped = filePath.replace(/([ '"\\$`!&(){}|;<>?*#~])/g, '\\$1');
        this.ws.send({ type: 'input', sessionId, data: escaped });
      }
    });

    winInfo.onResize = () => this.fit();
    this._ro = new ResizeObserver(() => this.fit()); this._ro.observe(container);

    // Mobile: special key toolbar (hidden on desktop via CSS)
    const mobileKeys = document.createElement('div');
    mobileKeys.className = 'mobile-term-keys';
    const keys = [
      { label: 'Ctrl+C', data: '\x03' },
      { label: 'Ctrl+G', data: '\x07' },
      { label: 'Ctrl+Z', data: '\x1a' },
      { label: 'Ctrl+D', data: '\x04' },
      { label: 'Ctrl+\\', data: '\x1c' },
      { label: 'Tab', data: '\t' },
      { label: 'Esc', data: '\x1b' },
      { label: '↑', data: '\x1b[A' },
      { label: '↓', data: '\x1b[B' },
    ];
    for (const k of keys) {
      const btn = document.createElement('button');
      btn.className = 'mobile-term-key';
      btn.textContent = k.label;
      btn.onclick = (e) => { e.preventDefault(); this.ws.send({ type: 'input', sessionId, data: k.data }); this.terminal.focus(); };
      mobileKeys.appendChild(btn);
    }
    winInfo.content.appendChild(mobileKeys);


    // Add settings gear icon to titlebar
    this._addSettingsButton(winInfo);
  }

  _repin() {
    this._pinned = true;
    this.winInfo.content.querySelector('.term-scroll-btn')?.classList.add('hidden');
    if (this._pendingOutput) {
      const pending = this._pendingOutput;
      this._pendingOutput = '';
      this.terminal.write(pending, () => this.terminal.scrollToBottom());
    } else {
      this.terminal.scrollToBottom();
    }
  }

  _getGlobalFontSize() { return parseInt(localStorage.getItem('termFontSize')) || 14; }
  _getGlobalFontFamily() { return localStorage.getItem('termFontFamily') || getAvailableFonts()[0]?.value || 'monospace'; }

  _addSettingsButton(winInfo) {
    const controls = winInfo.element.querySelector('.window-controls');
    if (!controls) return;
    const btn = document.createElement('button');
    btn.className = 'win-btn'; btn.textContent = '⚙'; btn.title = 'Terminal settings';
    btn.style.fontSize = '11px';
    controls.insertBefore(btn, controls.firstChild);
    btn.onclick = (e) => { e.stopPropagation(); this._showSettings(btn); };
  }

  _showSettings(anchor) {
    document.querySelectorAll('.term-settings-popover').forEach(p => p.remove());

    const pop = document.createElement('div'); pop.className = 'term-settings-popover';
    const rect = anchor.getBoundingClientRect();
    pop.style.top = (rect.bottom + 4) + 'px'; pop.style.right = (window.innerWidth - rect.right) + 'px';

    const opt = (v, l) => { const o = document.createElement('option'); o.value = v; o.textContent = l; return o; };

    // Theme selector (already has Global default)
    const themeLabel = document.createElement('label'); themeLabel.textContent = 'Theme';
    const themeSel = document.createElement('select');
    themeSel.appendChild(opt('', 'Default'));
    for (const name of Object.keys(THEMES)) { themeSel.appendChild(opt(name, name.charAt(0).toUpperCase() + name.slice(1))); }
    themeSel.value = this.overrides.theme || '';
    themeSel.onchange = () => { this.applyOverride('theme', themeSel.value || null); };

    // Font size with Default checkbox
    const sizeLabel = document.createElement('label'); sizeLabel.textContent = 'Font Size';
    const sizeRow = document.createElement('div'); sizeRow.className = 'popover-row';
    const sizeInput = document.createElement('input'); sizeInput.type = 'number'; sizeInput.min = 8; sizeInput.max = 28;
    const sizeDefault = document.createElement('label'); sizeDefault.className = 'settings-default-check';
    const sizeCheck = document.createElement('input'); sizeCheck.type = 'checkbox';
    sizeCheck.checked = !this.overrides.fontSize;
    sizeDefault.append(sizeCheck, document.createTextNode('Default'));

    sizeInput.value = this.overrides.fontSize || this._getGlobalFontSize();
    sizeInput.disabled = sizeCheck.checked;

    sizeCheck.onchange = () => {
      sizeInput.disabled = sizeCheck.checked;
      if (sizeCheck.checked) {
        this.applyOverride('fontSize', null);
        sizeInput.value = this._getGlobalFontSize();
      } else {
        this.applyOverride('fontSize', parseInt(sizeInput.value) || 14);
      }
    };
    sizeInput.onchange = () => {
      if (!sizeCheck.checked) this.applyOverride('fontSize', parseInt(sizeInput.value) || null);
    };
    sizeRow.append(sizeInput, sizeDefault);

    // Font family with Default option
    const fontLabel = document.createElement('label'); fontLabel.textContent = 'Font';
    const fontSel = document.createElement('select');
    fontSel.appendChild(opt('', 'Default'));
    for (const f of getAvailableFonts()) {
      const o = opt(f.value === '_sep' ? '' : f.value, f.label);
      if (f.disabled) { o.disabled = true; o.style.fontSize = '9px'; o.style.color = 'var(--text-dim)'; }
      fontSel.appendChild(o);
    }
    fontSel.value = this.overrides.fontFamily || '';
    fontSel.onchange = () => { this.applyOverride('fontFamily', fontSel.value || null); };

    pop.append(themeLabel, themeSel, sizeLabel, sizeRow, fontLabel, fontSel);
    document.body.appendChild(pop);

    attachPopoverClose(pop, anchor);
  }

  applyOverride(key, value) {
    this.overrides[key] = value;
    if (key === 'theme') {
      const t = value ? (THEMES[value]?.terminal || this.themeManager.getTerminalTheme()) : this.themeManager.getTerminalTheme();
      this.terminal.options.theme = t;
      this._syncContainerBg();
    } else if (key === 'fontSize') {
      this.terminal.options.fontSize = value || this._getGlobalFontSize();
      try { this.terminal.clearTextureAtlas(); } catch {}
      this.fit();
    } else if (key === 'fontFamily') {
      this.terminal.options.fontFamily = value || this._getGlobalFontFamily();
      try { this.terminal.clearTextureAtlas(); } catch {}
      this.fit();
    }
  }

  // Force a terminal redraw by briefly changing size (triggers SIGWINCH)
  forceRedraw() {
    try {
      const d = this.fitAddon.proposeDimensions();
      if (d?.cols > 1 && d?.rows > 0) {
        // Shrink by 1 col, then restore — two resizes = guaranteed SIGWINCH
        this.ws.send({ type: 'resize', sessionId: this.sessionId, cols: d.cols - 1, rows: d.rows });
        setTimeout(() => {
          this.ws.send({ type: 'resize', sessionId: this.sessionId, cols: d.cols, rows: d.rows });
          setTimeout(() => { if (this._pinned) this.terminal.scrollToBottom(); }, 300);
        }, 100);
      }
    } catch {}
  }

  fit() {
    if (this._fitTimer) clearTimeout(this._fitTimer);
    this._fitTimer = setTimeout(() => {
      try {
        // Skip fit when container is hidden (e.g. minimized window) — fitting a 0-sized
        // container resizes the terminal to minimum (2×1) and corrupts _effectiveSize
        const container = this.terminal.element?.parentElement;
        if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) return;

        const preserveScroll = this._settings?.get('terminal.preserveScrollOnFit');
        let bottomLine, wasAtBottom;
        if (preserveScroll) {
          const buf = this.terminal.buffer.active;
          bottomLine = buf.viewportY + this.terminal.rows;
          wasAtBottom = bottomLine >= buf.length;
        }

        this.fitAddon.fit();
        const d = this.fitAddon.proposeDimensions();
        if (d?.cols > 0 && d?.rows > 0) {
          this.ws.send({ type:'resize', sessionId:this.sessionId, cols:d.cols, rows:d.rows });
          if (this._effectiveSize) {
            const eCols = Math.min(d.cols, this._effectiveSize.cols);
            const eRows = Math.min(d.rows, this._effectiveSize.rows);
            if (eCols < d.cols || eRows < d.rows) {
              this.terminal.resize(eCols, eRows);
            }
          }
        }

        if (preserveScroll) {
          if (wasAtBottom) this.terminal.scrollToBottom();
          else this.terminal.scrollToLine(Math.max(0, bottomLine - this.terminal.rows));
        }
        requestAnimationFrame(() => this._updateCapIndicator());
      } catch {}
    }, 100);
  }

  // tmux-style boundary when another (smaller) client caps the PTY below what
  // this window could fit: hatch the unused region and show a badge explaining
  // why — otherwise the terminal just looks mysteriously small.
  _updateCapIndicator() {
    const container = this.terminal.element?.parentElement;
    if (!container) return;
    const remove = () => {
      if (this._capEls) { for (const el of this._capEls) el.remove(); this._capEls = null; }
    };
    let d = null;
    try { d = this.fitAddon.proposeDimensions(); } catch {}
    const eff = this._effectiveSize;
    // Capped = another client's size is the binding constraint. clients<=1 means
    // any mismatch is our own resize still in flight — not a real cap.
    const capped = eff && d && (this._effectiveClients || 0) > 1
      && (eff.cols < d.cols || eff.rows < d.rows)
      && this.terminal.cols <= eff.cols && this.terminal.rows <= eff.rows;
    if (!capped) { remove(); return; }
    const screen = this.terminal.element?.querySelector('.xterm-screen');
    if (!screen) { remove(); return; }
    const cRect = container.getBoundingClientRect();
    const sRect = screen.getBoundingClientRect();
    if (!this._capEls) {
      const mk = (cls) => { const el = document.createElement('div'); el.className = cls; container.appendChild(el); return el; };
      this._capEls = [mk('term-cap-strip'), mk('term-cap-strip'), mk('term-cap-badge')];
    }
    const [right, bottom, badge] = this._capEls;
    const set = (el, l, t, w, h) => {
      const show = w > 5 && h > 5;
      el.style.display = show ? 'block' : 'none';
      if (show) { el.style.left = l + 'px'; el.style.top = t + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px'; }
    };
    set(right, sRect.right - cRect.left, sRect.top - cRect.top, cRect.right - sRect.right, sRect.height);
    set(bottom, sRect.left - cRect.left, sRect.bottom - cRect.top, cRect.width - (sRect.left - cRect.left), cRect.bottom - sRect.bottom);
    badge.style.display = 'block';
    badge.textContent = `${eff.cols}×${eff.rows} — limited by a smaller client`;
    badge.title = `Another attached client's window fits only ${eff.cols}×${eff.rows}; the PTY is sized to the smallest client (this window fits ${d.cols}×${d.rows}). Close or enlarge the other client to use the full window.`;
  }

  updateTheme(theme) {
    if (!this.overrides.theme) {
      this.terminal.options.theme = theme;
      this._syncContainerBg();
      // Re-check minimum contrast for new theme background
      const mcr = this._settings?.get('terminal.minimumContrastRatio') ?? 1;
      if (mcr <= 1) {
        const bg = theme.background || '#000000';
        const hex = bg.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        this.terminal.options.minimumContrastRatio = L > 0.4 ? 4.5 : 1;
      }
    }
  }

  // Keep the container painted in the active terminal background so the
  // whole-cell remainder around the grid is invisible (not window-chrome color)
  _syncContainerBg() {
    const bg = this.terminal.options.theme?.background;
    const container = this.terminal.element?.parentElement;
    if (bg && container) container.style.background = bg;
  }

  _setBell(on) {
    const titleSpan = this.winInfo.titleSpan;
    if (!titleSpan) return;
    const existing = titleSpan.querySelector('.bell-icon');
    if (on && !existing) {
      const bell = document.createElement('span');
      bell.className = 'bell-icon';
      bell.innerHTML = '<svg style="width:12px;height:12px;vertical-align:-1px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1.5a4.5 4.5 0 00-4.5 4.5c0 2.5-1.5 4-1.5 4h12s-1.5-1.5-1.5-4A4.5 4.5 0 008 1.5z"/><path d="M6.5 14a1.5 1.5 0 003 0"/></svg>';
      titleSpan.appendChild(bell);
    } else if (!on && existing) {
      existing.remove();
    }
  }

  _setWaiting(on) {
    this.winInfo.element.classList.toggle('window-waiting', on);
    if (this.winInfo._notifyChanged) this.winInfo._notifyChanged(); // update taskbar
  }

  focus() { this.terminal.focus(); this._setBell(false); this._setWaiting(false); }
  dispose() {
    if (this._dprCleanup) this._dprCleanup();
    if (this._webgl) { try { this._webgl.dispose(); } catch {} this._webgl = null; }
    if (this._capEls) { for (const el of this._capEls) el.remove(); this._capEls = null; }
    this._ro.disconnect(); this.terminal.dispose(); this.ws.off(this.sessionId);
    if (this._pasteTarget) this._pasteTarget.remove();
  }
}

export { TerminalSession, getAvailableFonts };
