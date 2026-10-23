// THE RAW SCREEN (lane signin-card-real-screen, owner 2026-10-23 04:2x:
// 「其实你应该提供兜底的，如果解析不出来还能切换成旧模式查看」) — the fallback that
// always works. A driven CLI login (the Claude sign-in card's `claude auth
// login`, the long-lived token's `claude setup-token`) is read off its screen;
// when the reader cannot place the screen, the person reads it THEMSELVES: the
// PTY's own output, drawn read-only in a small xterm inside the card, with the
// card's code box still below it. ONE component, two roads — the hub keeps the
// bytes in the run's memory and answers them to this page's poll only
// (GET …/signin/screen or …/oat/mint/:mid/screen ?from=<offset>): never
// broadcast to other pages, never logged, never written. Links open through
// the one opener (terminal-links.js) — no native «dangerous link» confirm.
// (loaded LAZILY by its two hosts — import('./raw-screen.js') the first time the raw screen shows: xterm's UMD reads
// `self` when it loads, and chat-view (→ signin-card) is imported by node suites that never draw a terminal)
import { Terminal } from '@xterm/xterm';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { fetchJson, COUNTER_ZOOM } from './utils.js';
import { openTerminalLink, TERMINAL_LINK_HANDLER } from './terminal-links.js';

const POLL_MS = 400;

export class RawScreen {
  // screenUrl: () => the route of the run shown now (null: nothing to read yet)
  constructor({ screenUrl, cols = 80, rows = 14 } = {}) {
    this._screenUrl = screenUrl;
    this._cols = cols; this._rows = rows;
    this._el = null; this._term = null; this._timer = null;
    this._to = 0; this._id = null; this._busy = false; this._stopped = true;
  }

  mount(container) {
    const box = document.createElement('div');
    box.className = 'raw-screen';
    box.style.zoom = COUNTER_ZOOM; // body-zoom-proof hit-testing (the terminal.js rule)
    container.appendChild(box);
    this._el = box;
    return this;
  }

  // the xterm opens only once its box is in the page (opened on a detached element its renderer has no dimensions and
  // its viewport sync throws later); nothing is read before then (the offset waits)
  _open() {
    if (this._term || !this._el || !this._el.isConnected) return !!this._term;
    this._term = new Terminal({ disableStdin: true, cursorBlink: false, cursorInactiveStyle: 'none', cols: this._cols, rows: this._rows,
      fontSize: 11, scrollback: 1000, linkHandler: TERMINAL_LINK_HANDLER, allowProposedApi: true });
    this._term.loadAddon(new WebLinksAddon((event, uri) => openTerminalLink(uri)));
    this._term.open(this._el);
    return true;
  }

  // read what the run printed, then keep reading while the run lives
  start() { this._stopped = false; this._tick(); }
  stop() { this._stopped = true; clearTimeout(this._timer); this._timer = null; }
  async _tick() {
    clearTimeout(this._timer); this._timer = null;
    if (this._stopped || !this._el) return;
    const url = this._screenUrl && this._screenUrl();
    if (url && !this._busy && this._open()) {
      this._busy = true;
      try {
        const r = await fetchJson(url + (url.includes('?') ? '&' : '?') + 'from=' + encodeURIComponent(String(this._to)));
        const s = r && r.screen;
        if (s && this._term) {
          if (s.id !== this._id || s.reset) { this._term.reset(); this._id = s.id; }
          if (s.data) this._term.write(s.data);
          this._to = Number(s.to) || 0;
        }
      } catch { }
      this._busy = false;
    }
    if (!this._stopped) this._timer = setTimeout(() => this._tick(), POLL_MS);
  }

  destroy() {
    this.stop();
    try { this._term?.dispose(); } catch { }
    this._term = null;
    try { this._el?.remove(); } catch { }
    this._el = null;
  }
}
