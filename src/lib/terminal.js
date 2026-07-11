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

// Terminal QUERY-RESPONSE sequences xterm.js auto-emits when an app queries the
// terminal: CPR/DECXCPR (\e[n;mR), DA1/DA2 (\e[?…c / \e[>…c), DSR-ok (\e[0n),
// DECRPM (\e[?n;m$y), OSC 4/10/11/12 color reports, DCS replies (XTVERSION/
// XTGETTCAP/DECRQSS/DA3). Used to drop re-answers during buffer replay — keep
// in sync with TERM_QUERY_RESP_RE in ws-handler.js (server-side arbitration).
const TERM_QUERY_RESP_RE = /\x1b\[\??\d+(?:;\d+){0,2}R|\x1b\[[?>][\d;]*c|\x1b\[0n|\x1b\[\?\d+;\d+\$y|\x1b\](?:4|1[0-2]);[^\x07\x1b]*(?:\x07|\x1b\\)|\x1bP[^\x1b]*\x1b\\/g;

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
    // FOUT fix (real report: "ugly font until I switch fonts a few times"): the
    // web fonts (Fira Code etc.) can finish loading AFTER the terminal's first
    // render, which already cached the FALLBACK glyph in the WebGL texture atlas
    // — and nothing rebuilds it until a manual font change. Once the configured
    // family is actually loaded, clear the atlas + refit so it repaints in the
    // real font. Explicit load() + fonts.ready both, then a couple of settle
    // refits (atlas rebuild is async).
    this._refreshOnFontReady(effectiveFont, effectiveFontSize);
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
      let filtered = data.replace(/\x1b\[I|\x1b\[O/g, '');
      // While restored buffer content REPLAYS (attach), xterm.js re-ANSWERS
      // every query sequence stored in it (\e[6n cursor pos, \e]11;? bg color,
      // DA…) — those queries were answered live long ago; the re-answers just
      // echo as literal "^[]11;rgb:…^[[3;1R" junk at the prompt (real report).
      // Server-side ws-handler has the matching multi-client arbitration.
      if (this._replaying) filtered = filtered.replace(TERM_QUERY_RESP_RE, '');
      // While the Ctrl+G split editor is open, the CLI is blocked on the editor
      // subprocess with the tty back in COOKED+ECHO mode — but it left mouse
      // tracking enabled, so xterm keeps emitting SGR reports which the tty
      // ECHOES as literal "^[[<55;26;14M" junk (and buffers them as input for
      // the CLI to choke on later). Drop mouse reports for the duration.
      if (this.winInfo?._editorState) {
        filtered = filtered.replace(/\x1b\[<\d+;\d+;\d+[Mm]/g, '').replace(/\x1b\[M[\s\S]{3}/g, '');
      }
      if (!filtered) return;
      // Sticky Ctrl (mobile key row): the next typed letter becomes a control
      // byte — soft keyboards have no Ctrl, this is the standard workaround.
      if (this._ctrlSticky && filtered.length === 1) {
        const c = filtered.toLowerCase().charCodeAt(0);
        if (c >= 97 && c <= 122) filtered = String.fromCharCode(c - 96);
        this._setCtrlSticky(false);
      }
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
          this._uploadImageBlob(blob).finally(() => {
            this.terminal.focus();
            setTimeout(() => { _pasteInFlight = false; }, 1000);
          });
          return;
        }
      }

      // No image — let xterm handle the text paste so it respects the app's
      // bracketed-paste MODE. Wrapping EVERY paste in \x1b[200~…\x1b[201~ broke
      // plain (non-TUI) stdin prompts like `claude auth login`'s "Paste code
      // here": the markers landed in the input as literal bytes AND there's no
      // submit newline, so the paste looked dead and then failed the code
      // exchange. terminal.paste() emits bracketed markers ONLY when the app set
      // \x1b[?2004h (TUIs do; plain prompts don't) → correct in both cases.
      const text = e.clipboardData.getData('text/plain');
      e.preventDefault();
      if (text) this.terminal.paste(text);
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
          // Queue output while user is scrolled up — write all at once when re-pinned.
          // CAP the queue (audit 2.81.0): scrollback is 10k lines, so anything
          // beyond a few MB is discarded by xterm at repin anyway — but a busy
          // agent left unpinned for hours grew this string toward hundreds of
          // MB (one giant string, multi-second repin stall).
          this._pendingOutput = (this._pendingOutput || '') + msg.data;
          if (this._pendingOutput.length > 4_000_000) {
            this._pendingOutput = '\r\n\x1b[90m[… older output dropped while scrolled up …]\x1b[0m\r\n' + this._pendingOutput.slice(-2_000_000);
          }
        } else {
          this.terminal.write(msg.data, () => this.terminal.scrollToBottom());
        }
      } else if (msg.type === 'exited') {
        this.terminal.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
        winInfo.exited = true; if (winInfo._notifyChanged) winInfo._notifyChanged();
      } else if (msg.type === 'effective-size') {
        // Multi-device: PTY is sized to min of all clients — unless one client
        // took over via size-override, in which case the PTY is ITS size.
        this._effectiveSize = { cols: msg.cols, rows: msg.rows };
        this._effectiveClients = msg.clients || 0;
        this._effOverride = !!msg.override;
        // Blocked (a larger client took over): keep the local grid at its own
        // size — resizing xterm beyond the container would overflow; the content
        // is hidden behind the takeover overlay anyway.
        let d = null; try { d = this.fitAddon.proposeDimensions(); } catch {}
        const blocked = this._effOverride && d && (msg.cols > d.cols || msg.rows > d.rows);
        if (!blocked) this.terminal.resize(msg.cols, msg.rows);
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

    // Mobile: special key toolbar (hidden on desktop via CSS). Horizontally
    // scrollable; sticky Ctrl turns the next typed letter into a control byte;
    // arrows repeat on hold; 📋 pastes (incl. images) via _mobilePaste.
    const mobileKeys = document.createElement('div');
    mobileKeys.className = 'mobile-term-keys';
    const sendKey = (data) => { this.ws.send({ type: 'input', sessionId, data }); };
    const keys = [
      { label: 'Esc', data: '\x1b' },
      { label: 'Tab', data: '\t' },
      { label: '⇧Tab', data: '\x1b[Z', title: 'Shift+Tab — cycle permission modes' },
      { label: 'Ctrl', sticky: true, title: 'Sticky Ctrl: next letter becomes Ctrl+letter' },
      { label: '←', data: '\x1b[D', repeat: true },
      { label: '↓', data: '\x1b[B', repeat: true },
      { label: '↑', data: '\x1b[A', repeat: true },
      { label: '→', data: '\x1b[C', repeat: true },
      { label: '📋', paste: true, title: 'Paste (text or image)' },
      { label: '^C', data: '\x03', title: 'Ctrl+C — interrupt' },
      { label: '^G', data: '\x07', title: 'Ctrl+G — open editor' },
      { label: '^R', data: '\x12', title: 'Ctrl+R — history search' },
      { label: '^Z', data: '\x1a' },
      { label: '^D', data: '\x04' },
      { label: '^\\', data: '\x1c', title: 'Ctrl+\\ — command mode' },
    ];
    for (const k of keys) {
      const btn = document.createElement('button');
      btn.className = 'mobile-term-key';
      btn.textContent = k.label;
      if (k.title) btn.title = k.title;
      if (k.sticky) {
        this._ctrlKeyBtn = btn;
        btn.onclick = (e) => { e.preventDefault(); this._setCtrlSticky(!this._ctrlSticky); this.terminal.focus(); };
      } else if (k.paste) {
        btn.onclick = (e) => { e.preventDefault(); this._mobilePaste(); };
      } else if (k.repeat) {
        // Hold-to-repeat: 350ms delay then every 140ms
        let holdT = null, repT = null;
        const stop = () => { clearTimeout(holdT); clearInterval(repT); holdT = repT = null; };
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          sendKey(k.data);
          holdT = setTimeout(() => { repT = setInterval(() => sendKey(k.data), 140); }, 350);
        });
        for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, stop);
        btn.onclick = (e) => e.preventDefault();
      } else {
        btn.onclick = (e) => { e.preventDefault(); sendKey(k.data); this.terminal.focus(); };
      }
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

  // Upload an image blob to the server (sets the X clipboard) then send Ctrl+V
  // so the CLI reads it — shared by desktop Ctrl+V paste and the mobile 📋 flow.
  _uploadImageBlob(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await fetch('/api/paste-image', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: reader.result }),
          });
          const data = await res.json();
          if (data.ready) this.ws.send({ type: 'input', sessionId: this.sessionId, data: '\x16' });
        } catch {}
        resolve();
      };
      reader.onerror = () => resolve();
      reader.readAsDataURL(blob);
    });
  }

  _setCtrlSticky(on) {
    this._ctrlSticky = on;
    if (this._ctrlKeyBtn) this._ctrlKeyBtn.classList.toggle('active', on);
  }

  // Mobile paste: prefer the async Clipboard API (HTTPS — reads images
  // directly); over HTTP fall back to a visible paste pad the user long-presses
  // → Paste into, which feeds the SAME paste-event pipeline as desktop Ctrl+V.
  async _mobilePaste() {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const imgType = it.types.find(t => t.startsWith('image/'));
          if (imgType) { const blob = await it.getType(imgType); await this._uploadImageBlob(blob); this.terminal.focus(); return; }
        }
        const text = await navigator.clipboard.readText();
        if (text) { this.terminal.paste(text); this.terminal.focus(); return; } // paste() respects the app's bracketed-paste mode
      }
    } catch {} // permission denied / HTTP — fall through to the paste pad
    this._showPastePad();
  }

  _showPastePad() {
    if (this._pastePad?.isConnected) { this._pastePad.focus(); return; }
    const pad = document.createElement('div');
    pad.className = 'term-paste-pad';
    pad.contentEditable = 'true';
    pad.dataset.hint = 'Long-press here and tap Paste';
    const hide = () => { pad.remove(); this._pastePad = null; };
    pad.addEventListener('paste', (e) => {
      // Route through the SAME pipeline as desktop: image → upload+Ctrl+V,
      // text → bracketed paste
      const items = e.clipboardData?.items || [];
      e.preventDefault();
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          this._uploadImageBlob(blob).finally(() => this.terminal.focus());
          hide();
          return;
        }
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text) this.terminal.paste(text); // respects the app's bracketed-paste mode
      hide();
      this.terminal.focus();
    });
    pad.addEventListener('blur', () => setTimeout(() => { if (this._pastePad === pad) hide(); }, 8000));
    this.winInfo.content.appendChild(pad);
    this._pastePad = pad;
    pad.focus();
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
    // MUST be positioned — without position:fixed the top/right below are inert
    // (static flow dumps the popover at the bottom of <body>, off-screen).
    pop.style.position = 'fixed';
    pop.style.zIndex = '99999';
    pop.dataset.popover = '1';
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

  // Rebuild the glyph atlas once the configured web font is actually loaded (see
  // the FOUT note at construction). No-ops gracefully where the Font Loading API
  // is absent. The family string may be a fallback list ("Fira Code", monospace)
  // — load() wants a single family, so try the first token.
  _refreshOnFontReady(family, size) {
    if (!family || typeof document === 'undefined' || !document.fonts?.ready) return;
    const first = String(family).split(',')[0].trim().replace(/^["']|["']$/g, '');
    const repaint = () => {
      if (this._disposed || !this.terminal) return;
      try { this.terminal.clearTextureAtlas(); } catch {}
      this.fit();
    };
    const spec = `${size || 14}px "${first}"`;
    const done = () => { repaint(); setTimeout(repaint, 250); };
    try {
      // Explicit load (a canvas-used font isn't guaranteed to trigger a fetch),
      // then the global ready as a backstop.
      if (first && first.toLowerCase() !== 'monospace') document.fonts.load(spec).then(done, () => {});
      document.fonts.ready.then(done);
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

  // Multi-client size UI. Three states:
  // - CAPPED: a smaller client bounds the PTY below what this window fits →
  //   tmux-style hatched boundary + badge + "Use my size" takeover button.
  // - BLOCKED: a larger client took over (size-override) and the PTY exceeds
  //   this window → content hidden behind an overlay with "Resume here".
  // - OWNER: this client's override is active and fits exactly → subtle badge
  //   with a "Release" button back to the min-of-all-clients policy.
  _updateCapIndicator() {
    const container = this.terminal.element?.parentElement;
    if (!container) return;
    const removeCap = () => { if (this._capEls) { for (const el of this._capEls) el.remove(); this._capEls = null; } };
    const removeBlock = () => { if (this._blockEl) { this._blockEl.remove(); this._blockEl = null; } };
    let d = null;
    try { d = this.fitAddon.proposeDimensions(); } catch {}
    const eff = this._effectiveSize;
    if (!eff || !d) { removeCap(); removeBlock(); return; }
    const override = !!this._effOverride;

    // ── BLOCKED: PTY larger than this window (only possible under override) ──
    if (override && (eff.cols > d.cols || eff.rows > d.rows)) {
      removeCap();
      if (!this._blockEl) {
        const ov = document.createElement('div');
        ov.className = 'term-blocked-overlay';
        const msg = document.createElement('div');
        msg.className = 'term-blocked-msg';
        const btn = document.createElement('button');
        btn.className = 'term-blocked-btn';
        btn.textContent = 'Resume here';
        btn.onclick = () => this.ws.send({ type: 'size-override', sessionId: this.sessionId });
        ov.append(msg, btn);
        container.appendChild(ov);
        this._blockEl = ov;
      }
      this._blockEl.querySelector('.term-blocked-msg').textContent =
        `Taken over by a larger client (${eff.cols}×${eff.rows} — this window fits ${d.cols}×${d.rows})`;
      return;
    }
    removeBlock();

    // ── CAPPED: PTY smaller than this window ──
    const capped = ((this._effectiveClients || 0) > 1 || override)
      && (eff.cols < d.cols || eff.rows < d.rows)
      && this.terminal.cols <= eff.cols && this.terminal.rows <= eff.rows;
    // ── OWNER: override active at exactly this window's size ──
    const owner = override && !capped;
    if (!capped && !owner) { removeCap(); return; }
    const screen = this.terminal.element?.querySelector('.xterm-screen');
    if (!screen) { removeCap(); return; }
    if (!this._capEls) {
      const mk = (cls) => { const el = document.createElement('div'); el.className = cls; container.appendChild(el); return el; };
      const badge = mk('term-cap-badge');
      badge.appendChild(document.createElement('span'));
      const btn = document.createElement('button');
      btn.className = 'term-cap-btn';
      badge.appendChild(btn);
      this._capEls = [mk('term-cap-strip'), mk('term-cap-strip'), badge];
    }
    const [right, bottom, badge] = this._capEls;
    const set = (el, l, t, w, h) => {
      const show = w > 5 && h > 5;
      el.style.display = show ? 'block' : 'none';
      if (show) { el.style.left = l + 'px'; el.style.top = t + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px'; }
    };
    const label = badge.querySelector('span');
    const btn = badge.querySelector('.term-cap-btn');
    badge.style.display = 'flex';
    if (capped) {
      const cRect = container.getBoundingClientRect();
      const sRect = screen.getBoundingClientRect();
      set(right, sRect.right - cRect.left, sRect.top - cRect.top, cRect.right - sRect.right, sRect.height);
      set(bottom, sRect.left - cRect.left, sRect.bottom - cRect.top, cRect.width - (sRect.left - cRect.left), cRect.bottom - sRect.bottom);
      label.textContent = `${eff.cols}×${eff.rows} — limited by a smaller client`;
      badge.title = `Another attached client's window fits only ${eff.cols}×${eff.rows}; this window fits ${d.cols}×${d.rows}. "Use my size" resizes the terminal to this window (the smaller client's view gets blocked with a Resume button).`;
      btn.textContent = 'Use my size';
      btn.onclick = () => this.ws.send({ type: 'size-override', sessionId: this.sessionId });
    } else {
      // owner: no strips (nothing is cut off here), just the release affordance
      right.style.display = 'none';
      bottom.style.display = 'none';
      label.textContent = `Size override active (${eff.cols}×${eff.rows})`;
      badge.title = 'This window\'s size overrides the min-of-all-clients policy; smaller clients are blocked. Release to return to automatic sizing.';
      btn.textContent = 'Release';
      btn.onclick = () => this.ws.send({ type: 'size-override', sessionId: this.sessionId, release: true });
    }
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
    if (this._fitTimer) { clearTimeout(this._fitTimer); this._fitTimer = null; }
    if (this._pastePad) { try { this._pastePad.remove(); } catch {} this._pastePad = null; }
    if (this._dprCleanup) this._dprCleanup();
    if (this._webgl) { try { this._webgl.dispose(); } catch {} this._webgl = null; }
    if (this._capEls) { for (const el of this._capEls) el.remove(); this._capEls = null; }
    if (this._blockEl) { this._blockEl.remove(); this._blockEl = null; }
    this._ro.disconnect(); this.terminal.dispose(); this.ws.off(this.sessionId);
    if (this._pasteTarget) this._pasteTarget.remove();
  }
}

export { TerminalSession, getAvailableFonts };
