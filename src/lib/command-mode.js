/**
 * Command Mode — Ctrl+\ prefix key (tmux-style).
 * Yellow [CMD] indicator in taskbar, 2s auto-exit.
 * Single keystrokes: arrows=snap, m=maximize, w=close, Tab=cycle, f/g/n/s/b/e=global.
 */

import { showInputDialog } from './utils.js';

export class CommandMode {
  /**
   * @param {object} app - App instance for dispatching commands
   * @param {object} settings - SettingsManager
   */
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this._cmdMode = false;
    this._cmdTimer = null;
    this._cmdDigits = '';
    this._cmdDigitTimer = null;
    this._cmdIndicator = document.getElementById('cmd-indicator');
    this._setup();
  }

  _setup() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Alt+Left/Right: switch virtual desktops
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.ctrlKey && e.altKey && !e.metaKey) {
        const dm = this.app.desktopManager;
        const stage = this.app.stage;
        // Stage sits LEFT of the strip: Left from the leftmost desktop enters
        // it; Right from the stage leaves to the first desktop.
        if (stage?.isActive) {
          if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); stage.leave(dm.desktops[0]?.id); }
          return;
        }
        if (dm) {
          const idx = dm.desktops.findIndex(d => d.id === dm.activeDesktopId);
          if (e.key === 'ArrowLeft' && idx === 0 && stage?.enabled) {
            e.preventDefault(); e.stopPropagation(); stage.enter(); return;
          }
          if (dm.desktops.length > 1) {
            e.preventDefault(); e.stopPropagation();
            const next = e.key === 'ArrowRight' ? (idx + 1) % dm.desktops.length : (idx - 1 + dm.desktops.length) % dm.desktops.length;
            dm.switchTo(dm.desktops[next].id);
          }
        }
        return;
      }

      // Ctrl+\ toggles command mode (if enabled in settings)
      if (e.key === '\\' && e.ctrlKey && !e.altKey && !e.metaKey && (this.settings.get('toolbar.showCommandMode') ?? true)) {
        e.preventDefault();
        e.stopPropagation();
        if (this._cmdMode) this.exit();
        else this.enter();
        return;
      }

      if (!this._cmdMode) return;
      this._resetTimer();
      const key = e.key;

      if (key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.exit(); return; }

      // Digit accumulation for cell snap
      if (key >= '0' && key <= '9') {
        e.preventDefault(); e.stopPropagation();
        this._cmdDigits += key;
        clearTimeout(this._cmdDigitTimer);
        this._cmdDigitTimer = setTimeout(() => this._executeCellSnap(), 500);
        return;
      }

      if (this._cmdDigits) {
        clearTimeout(this._cmdDigitTimer);
        this._executeCellSnap();
        if (!this._cmdMode) return;
      }

      e.preventDefault(); e.stopPropagation();
      const app = this.app;
      const wm = app.wm;
      const activeWin = wm.windows.get(wm.activeWindowId);

      switch (key) {
        case 'ArrowLeft': if (activeWin) wm.snapToHalf(wm.activeWindowId, 'left'); this.exit(); break;
        case 'ArrowRight': if (activeWin) wm.snapToHalf(wm.activeWindowId, 'right'); this.exit(); break;
        case 'ArrowUp': if (activeWin) wm.snapToHalf(wm.activeWindowId, 'top'); this.exit(); break;
        case 'ArrowDown': if (activeWin) wm.snapToHalf(wm.activeWindowId, 'bottom'); this.exit(); break;
        case 'm': if (activeWin) wm.toggleMaximize(wm.activeWindowId); this.exit(); break;
        case 'w': if (activeWin) wm.closeWindow(wm.activeWindowId); this.exit(); break;
        case 'Tab': {
          // Cycle only windows on the active desktop (and skip tab guests) —
          // focusing a _hiddenByDesktop window sent keyboard focus into an
          // invisible window with no desktop switch
          const cycleIds = [...wm.windows.entries()]
            .filter(([, w]) => !w._hiddenByDesktop && !(w._tabChain && w._tabChain.tabs[0] !== w.id))
            .map(([id]) => id);
          if (cycleIds.length > 0) {
            const curIdx = cycleIds.indexOf(wm.activeWindowId);
            const nextId = cycleIds[(curIdx + 1) % cycleIds.length];
            const nextWin = wm.windows.get(nextId);
            if (nextWin && nextWin.isMinimized) wm.restore(nextId);
            else wm.focusWindow(nextId);
            const session = app.sessions.get(nextId);
            if (session) session.focus();
          }
          break; // Stay in command mode for Tab
        }
        case 'f': wm.applyLayout('freeform'); this.exit(); break;
        case 'g': {
          this.exit();
          showInputDialog({ title: 'Custom Grid', label: 'Grid (e.g. 3x3)', placeholder: '3x3', confirmText: 'Apply' }).then((input) => {
            if (!input) return;
            const match = input.match(/(\d+)\s*[x×X]\s*(\d+)/);
            if (match) wm.setGrid(parseInt(match[1]), parseInt(match[2]));
          });
          break;
        }
        case 'n': this.exit(); app.showNewSessionDialog(); break;
        case 's': app.sidebar.toggle(); this.exit(); break;
        case 'b': app.openBrowser(); this.exit(); break;
        case 'e': app.openFileExplorer(); this.exit(); break;
        case 'd': case 'D': {
          // d = switch to next desktop, D (shift+d) = switch to previous
          const dm = app.desktopManager;
          if (dm && dm.desktops.length > 1) {
            const idx = dm.desktops.findIndex(d => d.id === dm.activeDesktopId);
            const next = key === 'd' ? (idx + 1) % dm.desktops.length : (idx - 1 + dm.desktops.length) % dm.desktops.length;
            dm.switchTo(dm.desktops[next].id);
          }
          this.exit(); break;
        }
        case '[': case ']': {
          // [ = move active window to prev desktop, ] = next desktop
          const dm = app.desktopManager;
          if (dm && dm.desktops.length > 1 && activeWin) {
            const idx = dm.desktops.findIndex(d => d.id === dm.activeDesktopId);
            const next = key === ']' ? (idx + 1) % dm.desktops.length : (idx - 1 + dm.desktops.length) % dm.desktops.length;
            dm.moveWindowToDesktop(wm.activeWindowId, dm.desktops[next].id);
          }
          this.exit(); break;
        }
        default: this.exit(); break;
      }
    }, true); // capture phase
  }

  enter() {
    this._cmdMode = true;
    this._cmdDigits = '';
    clearTimeout(this._cmdDigitTimer);
    this._cmdIndicator.classList.add('active');
    // Show the available keys while armed — command mode was undiscoverable
    this._cmdIndicator.textContent = '[CMD] \u2190\u2191\u2193\u2192 snap \u00B7 m max \u00B7 w close \u00B7 Tab cycle \u00B7 f free \u00B7 g grid \u00B7 n new \u00B7 s sidebar';
    this._resetTimer();
  }

  exit() {
    this._cmdMode = false;
    this._cmdDigits = '';
    clearTimeout(this._cmdTimer);
    clearTimeout(this._cmdDigitTimer);
    this._cmdIndicator.classList.remove('active');
    this._cmdIndicator.textContent = '[CMD]';
  }

  _resetTimer() {
    clearTimeout(this._cmdTimer);
    this._cmdTimer = setTimeout(() => this.exit(), 2000);
  }

  _executeCellSnap() {
    const cellIdx = parseInt(this._cmdDigits, 10) - 1;
    this._cmdDigits = '';
    if (cellIdx >= 0) this.app.wm.snapActiveToCell(cellIdx);
    this.exit();
  }
}
