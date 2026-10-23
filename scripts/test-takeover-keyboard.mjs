#!/usr/bin/env node
// YOUR OWN PRESS GETS THE KEYBOARD WHILE YOU DRIVE (lane takeover-keyboard, userW inc-mum339id-1zsb, 2026-09-28) — the
// CLIENT MODEL (fast, a DOM-mini, no browser). userW: the chat and its agent's live view side by side in ONE split tab
// group, Take over, three presses on the chat composer — the typing landed in the view's hidden sink, i.e. in the PAGE,
// then Hand back. Lane J r2's focus reclaim (the password guard: a SCRIPT moving the caret into the composer while the
// person types a password into the page) bound the user's own press too, silently.
// This suite runs the REAL src/lib/keyboard-yield.js + src/lib/keyboard-owner.js + PURE src/browser-takeover.js under a
// DOM-mini with the browser's real event order (capture → target → bubble; pointerdown → mousedown → the default focus
// → blur/focusout → focus/focusin; a preventDefault'ed pointerdown suppresses the mousedown and its focus) and the view's
// three document capture listeners wired the way src/lib/browser-live-window.js wires them (pinned in §3):
//   §1 the scenarios: userW's press → the keys go to the composer, the takeover continues, the line says so · a SCRIPT's
//      focus → reclaimed, the keys go to the page (lane J r2) · a press on the picture takes the keys back · a press on the
//      bar takes them back (after the button's own focus) · a terminal (xterm's screen → its helper textarea) · a
//      synthetic press · a press on the picture then a script focus · a press elsewhere then a script focus · a stale
//      press · a touch tap (the focus at its END) · two views driving (the yield per claim; the pressed view re-claims) ·
//      a handback while yielded · the words follow a new text box. Lane dialog-keys (the owner's "ok", 2026-09-30): APP MODALS
//      built and ANNOUNCED as utils.js builds them (createModalShell + the confirm / input dialogs, the static overlay) — a
//      dialog the user's own act opened TAKES the keys (Enter answers it, the page gets nothing, its close returns them to the
//      page / the composer / the older dialog; nested, two views, a chain, a focusless one, a <select>, a script's close); one
//      that opens by itself (no press, a synthetic or stale press, a press on the picture) is taken back and said once.
//   §2 PATCHED-COPY CONTROLS (scripts/mutant-copy.mjs): the yield ignoring the press (userW's bug), a same-input check
//      that matches anything (the password guard gone), the touch re-stamp removed, the trust check removed — each turns
//      exactly its scenarios red.
//   §3 WIRING PINS: the live view's registrations and acts, the composer's line, the i18n rows.
//   §4 THE CLASSES' PROOF — the INPUT-SURFACE CENSUS itself (every key-taking construct under src/lib/** + index.html, one
//      classed row each, its planted-surface control and its own controls) is scripts/test-takeover-census.mjs, FAST since lane
//      takeover-census-fast (B-aacd: this heavy suite is desktop-hosted by the word xpra in its strings, so the Actions mirror
//      never ran the census and its red hid from .313 to .323, then again on the .329 base). This suite imports the classes and
//      proves each one: its DOM-mini legs green on the real keyboard-yield.js, reddened by the §2 copy that removes its rule.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { SURFACE_CLASSES, CENSUS } from './test-takeover-census.mjs'; // the census's classes + rows (checks nothing when imported)
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const T = require('../src/browser-takeover.js');
const KO = await import(pathToFileURL(path.join(REPO, 'src/lib/keyboard-owner.js')).href);
const KYreal = await import(pathToFileURL(path.join(REPO, 'src/lib/keyboard-yield.js')).href);

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const t0 = Date.now();
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };

// ═══ THE DOM-MINI ═══════════════════════════════════════════════════════════
function makeDom() {
  const addL = (node, type, fn, opts) => {
    const capture = opts === true || !!(opts && opts.capture);
    const signal = opts && typeof opts === 'object' ? opts.signal : null;
    if (signal && signal.aborted) return;
    const rec = { type, fn, capture };
    node.listeners.push(rec);
    if (signal) signal.addEventListener('abort', () => { const i = node.listeners.indexOf(rec); if (i >= 0) node.listeners.splice(i, 1); });
  };
  // lane dialog-keys: a MutationObserver as the view uses it — childList on a node (an overlay appended / removed) and a
  // node's own attributes (the static overlay's `hidden` class); the callback runs as a microtask, once per checkpoint
  const observers = [];
  class MO {
    constructor(cb) { this.cb = cb; this.targets = []; this.pending = false; }
    observe(node, opts = {}) { this.targets.push({ node, opts }); if (!observers.includes(this)) observers.push(this); }
    disconnect() { this.targets = []; const i = observers.indexOf(this); if (i >= 0) observers.splice(i, 1); }
  }
  const notify = (node, kind) => { for (const m of observers.slice()) if (!m.pending && m.targets.some((t) => t.node === node && !!t.opts[kind])) { m.pending = true; queueMicrotask(() => { m.pending = false; if (observers.includes(m)) m.cb([]); }); } };
  class El {
    constructor(tag, { cls = '', type, ce = false, tabindex = null } = {}) {
      this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.className = cls; this.type = type; this._ce = ce;
      this.tabIndex = tabindex; this.readOnly = false; this.disabled = false; this.value = ''; this.parent = null; this.children = []; this.listeners = []; this.style = {};
    }
    get isContentEditable() { let n = this; while (n && n.nodeType === 1) { if (n._ce) return true; n = n.parent; } return false; }
    append(...cs) { for (const c of cs) { c.parent = this; this.children.push(c); } notify(this, 'childList'); return this; }
    /** lane dialog-keys: Chrome's removal — the focused element inside goes with it and the focus falls to <body> WITHOUT a blur */
    remove() { const p = this.parent; if (!p) return; const i = p.children.indexOf(this); if (i >= 0) p.children.splice(i, 1); this.parent = null; if (doc.activeElement && this.contains(doc.activeElement)) doc.activeElement = body; notify(p, 'childList'); }
    get classList() { const self = this; const list = () => String(self.className || '').split(/\s+/).filter(Boolean); return { contains: (c) => list().includes(c), add: (c) => { if (!list().includes(c)) { self.className = [...list(), c].join(' '); notify(self, 'attributes'); } }, remove: (c) => { if (list().includes(c)) { self.className = list().filter((x) => x !== c).join(' '); notify(self, 'attributes'); } } }; }
    contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parent; } return false; }
    closest(sel) { const wants = String(sel).split(',').map((x) => x.trim()); let n = this; while (n && n.nodeType === 1) { const cls = String(n.className).split(/\s+/); if (wants.some((w) => (w.startsWith('.') ? cls.includes(w.slice(1)) : n.tagName === w.toUpperCase()))) return n; n = n.parent; } return null; } // a list of classes (verify r2: INPUT_HOSTS) or tags (verify r4: `label`)
    addEventListener(type, fn, opts) { addL(this, type, fn, opts); }
    get focusable() { return ['TEXTAREA', 'INPUT', 'BUTTON', 'SELECT', 'IFRAME', 'SUMMARY'].includes(this.tagName) || this._ce || this.tabIndex != null; } // verify r3: a <select> and a frame take the focus of a press too; verify r4: a <summary>
    get isConnected() { let n = this; while (n) { if (n === doc) return true; n = n.parent; } return false; }
    checkVisibility() { let n = this; while (n && n.nodeType === 1) { if (n._hidden) return false; n = n.parent; } return true; } // verify r2: a hider (another desktop) on an ancestor
    focus() { doc.focus(this); } // a PROGRAMMATIC focus (a script's .focus())
  }
  const doc = { nodeType: 9, parent: null, listeners: [], activeElement: null, addEventListener(type, fn, opts) { addL(doc, type, fn, opts); } };
  const body = new El('body'); body.parent = doc; doc.body = body; doc.activeElement = body;
  function dispatch(target, type, init = {}) {
    const ev = { type, target, isTrusted: init.isTrusted === true, pointerType: init.pointerType || 'mouse', detail: init.detail, key: init.key, defaultPrevented: false, stopped: false, immediate: false, // (lane dialog-keys: a CustomEvent's detail, a keydown's key)
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; this.immediate = true; } };
    const chain = []; for (let n = target; n; n = n.parent) chain.push(n);
    const fire = (node, phase) => { for (const l of node.listeners.slice()) { if (l.type !== type || (phase !== null && l.capture !== phase)) continue; l.fn.call(node, ev); if (ev.immediate) break; } };
    for (let i = chain.length - 1; i >= 1 && !ev.stopped; i--) fire(chain[i], true);   // capture: the document first
    if (!ev.stopped) fire(target, null);                                              // at target: registration order
    if (!['focus', 'blur'].includes(type)) for (let i = 1; i < chain.length && !ev.stopped; i++) fire(chain[i], false); // bubble
    return ev;
  }
  doc.focus = (el) => {
    if (!el || doc.activeElement === el) return;
    const old = doc.activeElement;
    if (old && old !== body) { dispatch(old, 'blur'); dispatch(old, 'focusout'); }
    doc.activeElement = el;
    if (el !== body) { dispatch(el, 'focus'); dispatch(el, 'focusin'); }
  };
  /** The browser's default focus for a press: the nearest focusable ancestor-or-self, else the body (the old one blurs). */
  const defaultFocus = (el) => { let n = el; while (n && n.nodeType === 1) { if (n.focusable && n !== body) return n; n = n.parent; } return body; };
  /** A USER's press (trusted by default): pointerdown → (unless cancelled) mousedown → (unless cancelled) the default
   *  focus → pointerup. A touch tap focuses at its END: `holdMs` passes between the down and the up. */
  async function press(el, { trusted = true, pointerType = 'mouse', holdMs = 60, clock = null } = {}) {
    const pd = dispatch(el, 'pointerdown', { isTrusted: trusted, pointerType });
    if (pointerType === 'mouse') {
      if (!pd.defaultPrevented) { const md = dispatch(el, 'mousedown', { isTrusted: trusted }); if (!md.defaultPrevented) doc.focus(defaultFocus(el)); }
      if (clock) clock.advance(holdMs);
      dispatch(el, 'pointerup', { isTrusted: trusted, pointerType });
    } else {
      if (clock) clock.advance(holdMs);
      dispatch(el, 'pointerup', { isTrusted: trusted, pointerType });
      if (!pd.defaultPrevented) doc.focus(defaultFocus(el)); // a tap's focus lands with its click, after the release
    }
    await flush();
  }
  return { El, doc, body, dispatch, press, MO };
}

// ═══ THE WORLD: two live views (the second only when asked), a chat composer, a terminal, a sidebar ═══════════
async function scenarios(KY) {
  const out = {};
  /** One fresh world per scenario (the owner registry is module-level: every claim is released at the end). */
  async function world(fn, { views = 1 } = {}) {
    const D = makeDom(); const { El, doc, body } = D;
    let NOW = 100000; const clock = { now: () => NOW, advance: (ms) => { NOW += ms; } };
    // the chat composer (ChatInput: focus() stands down while keyboardOwned(); the line above it)
    const chatArea = new El('div', { cls: 'chat-input-area' }); const wrap = new El('div', { cls: 'chat-input-wrap' }); const ta = new El('textarea', { cls: 'chat-input' });
    const sendBtn = new El('button', { cls: 'chat-send-btn' });
    chatArea.append(wrap.append(ta), sendBtn);
    const line = { hidden: true };
    const renderLine = () => { line.hidden = !(KO.keyboardYielded() && doc.activeElement === ta); };
    const offLine = KO.onKeyboardChange(renderLine); ta.addEventListener('focus', renderLine); ta.addEventListener('blur', renderLine);
    const chatFocus = () => { if (KO.keyboardOwned()) return; doc.focus(ta); };
    // a terminal (xterm 5.5: its mousedown handler preventDefault()s and focuses its helper textarea)
    const xterm = new El('div', { cls: 'xterm' }); const screen = new El('div', { cls: 'xterm-screen' }); const cvs = new El('canvas'); const helper = new El('textarea', { cls: 'xterm-helper-textarea' });
    xterm.append(screen.append(cvs), helper);
    xterm.addEventListener('mousedown', (e) => { e.preventDefault(); doc.focus(helper); });
    const sidebar = new El('div', { cls: 'sidebar' });
    // verify r2 (N1): a desktop app's picture (src/lib/xpra-view.js: the PANE's own pointerdown focuses its IME textarea and
    // cancels the press) and the Desktop's (noVNC: its canvas, tabindex -1, focused by its own mousedown) — both inside a
    // src/lib/picture-shell.js shell
    const xShell = new El('div', { cls: 'picture-shell' }); const xPane = new El('div', { cls: 'xpra-pane' }); const xStage = new El('div', { cls: 'xpra-stage' }); const xCanvas = new El('canvas'); const xIme = new El('textarea', { cls: 'xpra-ime' });
    xShell.append(xPane.append(xStage.append(xCanvas), xIme));
    xPane.addEventListener('pointerdown', (e) => { doc.focus(xIme); e.preventDefault(); });
    const vShell = new El('div', { cls: 'picture-shell' }); const vMount = new El('div', { cls: 'vnc-mount' }); const vCanvas = new El('canvas', { tabindex: -1 });
    vShell.append(vMount.append(vCanvas));
    vCanvas.addEventListener('mousedown', () => { doc.focus(vCanvas); });
    // the .299 integration: src/lib/stream-view.js's <video> (tabIndex 0 — a focusable element, the browser focuses it on the press)
    const sVideo = new El('video', { cls: 'stream-video', tabindex: 0 }); sVideo.addEventListener('mousedown', () => { doc.focus(sVideo); });
    body.append(chatArea, xterm, sidebar, xShell, vShell, sVideo);
    // the live views, wired as browser-live-window.js wires them
    const V = [];
    for (let i = 0; i < views; i++) {
      const id = 'win-live-' + i;
      const root = new El('div', { cls: 'browser-live', tabindex: 0 }); const bar = new El('div', { cls: 'browser-live-bar' }); const takeBtn = new El('button', { cls: 'browser-live-handback' });
      const canvas = new El('div', { cls: 'browser-live-canvas' }); const img = new El('img', { cls: 'browser-live-img' }); const kbd = new El('textarea', { cls: 'browser-live-kbd', tabindex: -1 });
      root.append(bar.append(takeBtn), canvas.append(img, kbd)); body.append(root);
      // verify r1 (K3): the view's TAB in a strip — outside its root; the WM's tab handlers cancel the press's default focus
      const tab = new El('div', { cls: 'tab-item' }); const tabLabel = new El('span', { cls: 'tab-label' }); tab.append(tabLabel); body.append(tab);
      tab.addEventListener('mousedown', (e) => e.preventDefault());
      const st = { mode: 'watch', mine: false, connected: true, displayed: true, claimed: false, closed: false, reclaims: 0, yields: 0, page: '', caretMoves: 0, strayKeys: 0, redraws: 0, held: new Set(), released: [], cues: 0, frameCues: 0, dialogCues: 0, dialogTakes: 0, dialogReturns: 0 };
      /** the view's releaseHeld (r1 K4 / r2 H3): a keyup to the page for every key still held there */
      const releaseHeld = () => { st.released.push(...[...st.held].reverse()); st.held.clear(); };
      const facts = () => ({ mode: st.mode, mine: st.mine, connected: st.connected, displayed: st.displayed, closed: st.closed });
      const ky = KY.createKeyboardYield({ root, sink: kbd, drives: () => st.claimed && T.keyboardOwnership(facts()).owns, mine: () => st.claimed && !st.closed, now: clock.now, ownChrome: (el) => tab.contains(el), picture: canvas }); // lane dialog-keys: the picture (a press there is the page's)
      const ownsKeyboard = () => T.keyboardOwnership({ ...facts(), yielded: ky.yielded, dialog: !!ky.dialogHolds }).owns; // lane dialog-keys: …nor while a dialog the user opened holds the keys
      const yieldedKeyboard = () => !!ky.yielded && st.claimed && !st.closed;
      const claimRec = () => ({ id, owns: ownsKeyboard, yielded: yieldedKeyboard });
      const iOwn = () => { const o = KO.keyboardOwner(); return !!o && o.id === id; };
      const focusSink = () => { if (doc.activeElement !== kbd) doc.focus(kbd); };
      // verify r2 (H1): the view's syncKeyboard — every transition judged at once (the redraw is counted; a caret outside
      // moves to the sink when the keys move to the page); the view runs it on its hiders' mutations, the stream's state and
      // every keyboard-owner signal (another view's claim)
      let syncing = false;
      const sync = () => {
        if (syncing || typeof ky.sync !== 'function') return;
        syncing = true;
        try {
          if (st.claimed && typeof ky.settle === 'function' && ky.settle({ drives: st.claimed && T.keyboardOwnership(facts()).owns, active: doc.activeElement }) === 'end') { KO.claimKeyboard(claimRec()); st.homeless = (st.homeless || 0) + 1; st.caretMoves++; focusSink(); } // verify r2 (H1b'): the view's settle
          const r = ky.sync({ owns: st.claimed && iOwn(), yielded: st.claimed && yieldedKeyboard(), dialog: st.claimed && !!ky.dialogHolds, active: doc.activeElement }); if (!r.changed) return; if (r.moveCaret) { st.caretMoves++; focusSink(); } if (r.release) releaseHeld(); st.redraws++; KO.keyboardChanged(); } finally { syncing = false; }
      };
      const offSync = KO.onKeyboardChange(sync);
      const ctl = new AbortController();
      const cap = { capture: true, signal: ctl.signal };
      doc.addEventListener('pointerdown', (e) => {
        const r = ky.onPointerDown(e);
        if (r === 'noted') { if (st.claimed && ky.onPressFocused(doc.activeElement) === 'yield') { st.yields++; KO.keyboardChanged(); } return; }
        if (r !== 'resumed' && r !== 'press-view') return;
        KO.claimKeyboard(claimRec());
        if (r === 'resumed') KO.keyboardChanged();
        setTimeout(() => { const a = doc.activeElement; if (!st.closed && iOwn() && a !== kbd && !(KY.isEditable(a) && root.contains(a))) focusSink(); }, 0);
      }, { capture: true, passive: true, signal: ctl.signal });
      doc.addEventListener('pointerup', (e) => { ky.onPointerUp(e); }, { capture: true, passive: true, signal: ctl.signal });
      doc.addEventListener('focusin', (e) => {
        if (!st.claimed) return;
        const v = ky.onFocusIn(e);
        if (v === 'yield') { st.yields++; releaseHeld(); KO.keyboardChanged(); return; }
        if (v !== 'reclaim' || !iOwn()) return;
        st.reclaims++;
        const taken = e.target; // verify r2 (Q1) / r3 (F2): the view's toast, judged when the reclaim runs
        queueMicrotask(() => { const say = typeof ky.takeCue === 'function' && ky.takeCue(taken); focusSink(); if (say) { st.cues++; st.cuedFor = taken; } }); // (verify r4: WHICH box the cue was for)
      }, cap);
      // verify r3: THE SINK'S BLUR (browser-live-window.js): 0 ms after the sink lost the focus while the view owns, the sink
      // takes it back unless PURE sinkBlurVerdict keeps it (a text box — the focusin rule's; a choice control, F1); a frame is
      // taken back and said (verify r2 H5)
      kbd.addEventListener('blur', () => {
        if (!iOwn()) return;
        setTimeout(() => {
          if (st.closed || !iOwn()) return;
          const bv = typeof KY.sinkBlurVerdict === 'function' ? KY.sinkBlurVerdict(doc.activeElement, { sink: kbd, root, body }) : 'take-back';
          if (bv === 'keep') return;
          focusSink();
          if (bv === 'frame') st.frameCues++; // (verify r3 F4's cue here: retired by lane dialog-keys — a dialog is judged at its OPEN)
        }, 0);
      }, { signal: ctl.signal });
      // lane dialog-keys: THE MODAL ANNOUNCEMENT and the dialogs' watch, as browser-live-window.js wires them (pinned in §3)
      const dialogMo = new D.MO(() => settleDialogs());
      const watchDialogs = () => { dialogMo.disconnect(); if (st.closed || !ky.dialogHolds) return; dialogMo.observe(body, { childList: true }); for (const ov of ky.dialogOverlays()) dialogMo.observe(ov, { attributes: true }); };
      const focusDialog = (ov) => { const tgt = KY.dialogFocusTarget(ov); if (tgt === ov && ov.tabIndex == null) ov.tabIndex = -1; tgt.focus(); }; // (verify r1: ONE door — the take's tick and the 'older' return)
      const settleDialogs = () => {
        const r = ky.settleDialogs({ active: doc.activeElement });
        if (!r) return;
        watchDialogs(); st.dialogReturns++;
        if (r.to === 'sink') { if (iOwn()) focusSink(); }
        else if (r.to === 'older' && r.el) focusDialog(r.el);
        else if ((r.to === 'back' || r.to === 'yield') && r.el) r.el.focus();
        sync();
      };
      doc.addEventListener('vs-modal-open', (e) => {
        if (!st.claimed || st.closed) return;
        settleDialogs();
        const ov = e.detail ? e.detail.overlay : null;
        const v = ky.onDialogOpen(ov, { active: doc.activeElement });
        if (v === 'take') {
          st.dialogTakes++; watchDialogs(); sync();
          setTimeout(() => { if (st.closed || !ky.dialogHolds || !ky.dialogOverlays().includes(ov)) return; const a = doc.activeElement; if (a && a !== body && ov.contains(a)) return; focusDialog(ov); }, 0);
          return;
        }
        if (v === 'reclaim' && iOwn() && ky.dialogCue(v)) st.dialogCues++;
      }, { signal: ctl.signal });
      // the picture's own pointerdown while driving: preventDefault (no mouse events, no default focus) + the sink
      img.addEventListener('pointerdown', (e) => { if (!(st.mode === 'takeover' && st.mine)) return; e.preventDefault(); focusSink(); });
      const v = {
        id, root, img, takeBtn, kbd, tab, tabLabel, st, ky,
        takeover() { st.mode = 'takeover'; st.mine = true; if (!st.claimed) { st.claimed = true; ky.reset('claim'); KO.claimKeyboard(claimRec()); watchDialogs(); } if (!ky.yielded && !ky.dialogHolds) focusSink(); KO.keyboardChanged(); }, // (lane dialog-keys: a mode record re-applied never pulls the keys out of a dialog the user opened)
        handback() { st.mode = 'watch'; st.mine = false; if (st.claimed) { st.claimed = false; ky.reset('release'); KO.releaseKeyboard(id); watchDialogs(); if (doc.activeElement === kbd) doc.focus(body); } KO.keyboardChanged(); },
        dispose() { ctl.abort(); offSync(); KO.releaseKeyboard(id); },
        /** verify r2 (H1): a HIDER (minimize, a desktop, a tab) / the STREAM — the view's own signals for a transition */
        show(on) { st.displayed = !!on; sync(); },
        /** a key pressed in the page (its keydown went there) and still held; the bar's Hand back button (H3: let go first) */
        hold(key) { if (iOwn()) st.held.add(key); },
        handbackPress() { if (st.claimed) releaseHeld(); this.handback(); },
        stream(on) { st.connected = !!on; sync(); },
        /** verify r4: the view's `ws.onclose` — the stream down (a transition), then the takeover ended locally as the server
         *  ends it (viewer-left): `st.mine` ⇒ mode watch + renderMode, which releases the claim (and the yield with it) */
        close() { st.connected = false; sync(); if (st.mine) { st.mode = 'watch'; st.mine = false; this.handback(); } },
      };
      V.push(v);
    }
    /** Typing, as the views' document capture keydown routes it: the OWNING view's page gets the key; nobody owns ⇒ a keydown
     *  to the focused element (lane dialog-keys: the dialog's own Enter / Escape handlers run) and, unless one cancelled it,
     *  the text box gets the character. A key while a dialog holds is the user's act on the app (the view's onDocKey stamps it). */
    const KEYS = { '\n': 'Enter', '\x1b': 'Escape', '\t': 'Tab' };
    const type = (text) => { for (const ch of text) { for (const w of V) if (w.ky.dialogHolds) w.ky.onAppKey({ isTrusted: true }); const o = KO.keyboardOwner(); const v = o && V.find((x) => x.id === o.id); if (v) { if (typeof v.ky.caretOutside === 'function' && v.ky.caretOutside(doc.activeElement)) { v.st.strayKeys++; doc.focus(v.kbd); KO.keyboardChanged(); continue; } v.st.page += ch; if (doc.activeElement !== v.kbd) doc.focus(v.kbd); } else { const a = doc.activeElement; const ev = D.dispatch(a || body, 'keydown', { isTrusted: true, key: KEYS[ch] || ch }); if (!ev.defaultPrevented && doc.activeElement === a && KY.isEditable(a) && ch !== '\x1b') a.value += ch; } } }; // verify r2 (H1): the view's BELT — the owner's key while a text box outside holds the caret goes nowhere, the caret moves; verify r4: onDocKey ends with focusSink() — after a key the sink holds the caret (a <select> that kept the focus of a press loses it at the first key: measured, the closing key's keyup)
    const at = () => { const a = doc.activeElement; if (a === ta) return 'composer'; if (a === helper) return 'terminal'; for (const v of V) if (a === v.kbd) return 'sink' + (V.length > 1 ? v.id.slice(-1) : ''); if (a === xIme) return 'xpra-ime'; if (a === vCanvas) return 'vnc-canvas'; if (a === sVideo) return 'stream-video'; return a === body ? 'body' : String(a && (a.className || a.tagName)); };
    /** lane dialog-keys: THE APP'S MODAL, built as src/lib/utils.js builds it — createModalShell (an overlay appended to <body>,
     *  then ANNOUNCED in the same task: announceModal), showConfirmDialog (Enter ⇒ true, Escape ⇒ false on the overlay, OK
     *  focused a tick later) and showInputDialog (its box focused a tick later; Enter ⇒ the value, Escape ⇒ null on the box);
     *  a press on OK / Cancel answers it (the mini's click = the release). `focusOwn: false` = a createModalShell dialog that
     *  focuses nothing itself; `select` = a <select> in it; `m.open` / `m.answer` = the promise's fate. */
    const modal = ({ input = false, focusOwn = true, select = false } = {}) => {
      const ov = new El('div', { cls: 'dialog-overlay' }); const dlg = new El('div', { cls: 'dialog' });
      const box = input ? new El('input', { cls: 'dialog-input', type: 'text' }) : null; const sel = select ? new El('select', { cls: 'dialog-select' }) : null;
      const cancel = new El('button', { cls: 'btn-cancel' }); const okb = new El('button', { cls: 'btn-create' });
      dlg.append(...[box, sel].filter(Boolean), cancel, okb); ov.append(dlg); body.append(ov);
      D.dispatch(doc, 'vs-modal-open', { detail: { overlay: ov } }); // createModalShell: announceModal(overlay), right after the append
      const m = { ov, dlg, box, sel, okb, cancel, open: true, answer: undefined };
      const done = (v) => { if (!m.open) return; m.open = false; m.answer = v; ov.remove(); };
      okb.addEventListener('pointerup', () => done(input ? box.value : true)); cancel.addEventListener('pointerup', () => done(input ? null : false));
      if (input) {
        box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(box.value); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } });
        if (focusOwn) setTimeout(() => box.focus(), 0);
      } else {
        ov.tabIndex = -1;
        ov.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } });
        if (focusOwn) setTimeout(() => okb.focus(), 0);
      }
      return m;
    };
    const ctx = { D, doc, ta, helper, cvs, sidebar, sendBtn, line, chatFocus, V, clock, type, at, xCanvas, xIme, vCanvas, sVideo, modal, press: (el, o = {}) => D.press(el, { clock, ...o }) };
    try { return await fn(ctx); } finally { for (const v of V) v.dispose(); offLine(); }
  }

  // 1. userW: Take over, a press on the composer, typing — the keys go to the composer, the takeover continues
  out.userW = await world(async ({ V: [A], ta, line, press, type, at }) => {
    A.takeover(); await flush();
    await press(ta); const focus = at();
    type('hello agent');
    const r = { focus, composer: ta.value, page: A.st.page, yielded: A.ky.yielded, kind: A.ky.kind, owned: KO.keyboardOwned(), yieldedFact: KO.keyboardYielded(), line: !line.hidden, mode: A.st.mode, mine: A.st.mine, reclaims: A.st.reclaims };
    r.ok = r.focus === 'composer' && r.composer === 'hello agent' && r.page === '' && r.yielded && r.kind === 'chat' && !r.owned && r.yieldedFact && r.line && r.mode === 'takeover' && r.mine && r.reclaims === 0;
    return r;
  });
  // 2. the PASSWORD GUARD (lane J r2): a SCRIPT puts the caret in the composer while the user types into the page
  out.script = await world(async ({ V: [A], ta, line, chatFocus, type, at }) => {
    A.takeover(); await flush();
    type('tom');
    chatFocus(); const afterAttach = at();   // the attach path: ChatView.focus → ChatInput.focus stands down
    ta.focus(); await flush(); const afterRaw = at(); // a raw .focus() (the ~70 other sites): reclaimed
    type('smith');
    const r = { afterAttach, afterRaw, composer: ta.value, page: A.st.page, reclaims: A.st.reclaims, yielded: A.ky.yielded, line: !line.hidden };
    r.ok = r.afterAttach === 'sink' && r.afterRaw === 'sink' && r.composer === '' && r.page === 'tomsmith' && r.reclaims === 1 && !r.yielded && !r.line;
    return r;
  });
  // 3. a press on the PICTURE takes the keys back (the picture's own handler focuses the sink)
  out.picture = await world(async ({ V: [A], ta, line, press, type, at }) => {
    A.takeover(); await flush();
    await press(ta); type('hi');
    await press(A.img); const focus = at();
    type('xyz');
    const r = { focus, composer: ta.value, page: A.st.page, yielded: A.ky.yielded, owned: KO.keyboardOwned(), line: !line.hidden };
    r.ok = r.focus === 'sink' && r.composer === 'hi' && r.page === 'xyz' && !r.yielded && r.owned && !r.line;
    return r;
  });
  // 4. a press on the view's BAR takes them back too (the button's own default focus first, then the sink)
  out.bar = await world(async ({ V: [A], ta, press, type, at }) => {
    A.takeover(); await flush();
    await press(ta); type('a');
    await press(A.takeBtn); const focus = at();
    type('b');
    const r = { focus, composer: ta.value, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.focus === 'sink' && r.composer === 'a' && r.page === 'b' && !r.yielded;
    return r;
  });
  // 5. a TERMINAL: a press on xterm's screen focuses its helper textarea (xterm's own mousedown handler) — one input
  out.terminal = await world(async ({ V: [A], helper, cvs, press, type, at }) => {
    A.takeover(); await flush();
    await press(cvs); const focus = at();
    type('ls');
    const r = { focus, term: helper.value, page: A.st.page, yielded: A.ky.yielded, kind: A.ky.kind };
    r.ok = r.focus === 'terminal' && r.term === 'ls' && r.page === '' && r.yielded && r.kind === 'terminal';
    return r;
  });
  // 6. a SYNTHETIC press (a script's dispatched pointerdown, isTrusted false) then its focus — never the user's
  out.synthetic = await world(async ({ V: [A], ta, press, type, at }) => {
    A.takeover(); await flush();
    await press(ta, { trusted: false }); const focus = at();
    type('pw');
    const r = { focus, composer: ta.value, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.focus === 'sink' && r.composer === '' && r.page === 'pw' && !r.yielded;
    return r;
  });
  // 7. a press on the PICTURE, then (within the window) a script focuses the composer — the press was not on the composer
  out.pictureThenScript = await world(async ({ V: [A], ta, press, type, at, clock }) => {
    A.takeover(); await flush();
    await press(A.img); clock.advance(20); ta.focus(); await flush(); const focus = at();
    type('pw');
    const r = { focus, composer: ta.value, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.focus === 'sink' && r.composer === '' && r.page === 'pw' && !r.yielded;
    return r;
  });
  // 8. a press ELSEWHERE (the sidebar / a taskbar button), then a script focuses the composer 30 ms later
  out.elsewhereThenScript = await world(async ({ V: [A], ta, sidebar, sendBtn, press, type, at, clock }) => {
    A.takeover(); await flush();
    await press(sidebar); clock.advance(30); ta.focus(); await flush(); const f1 = at();
    await press(sendBtn); clock.advance(30); ta.focus(); await flush(); const f2 = at();
    type('pw');
    const r = { f1, f2, composer: ta.value, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.f1 === 'sink' && r.f2 === 'sink' && r.composer === '' && r.page === 'pw' && !r.yielded;
    return r;
  });
  // 9. a STALE press: the user pressed the composer (a synthetic cancel kept its focus away), 400 ms later a script focuses it
  out.stale = await world(async ({ V: [A], ta, D, type, at, clock }) => {
    A.takeover(); await flush();
    const pd = D.dispatch(ta, 'pointerdown', { isTrusted: true }); // the press lands, its default focus never happens (cancelled)
    clock.advance(T.USER_PRESS_MS + 150); ta.focus(); await flush(); const focus = at();
    type('pw');
    const r = { focus, pdCancelled: pd.defaultPrevented, composer: ta.value, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.focus === 'sink' && r.composer === '' && r.page === 'pw' && !r.yielded;
    return r;
  });
  // 10. a TOUCH tap held 400 ms: the focus lands at the tap's END — the release re-stamps the press
  out.touch = await world(async ({ V: [A], ta, press, type, at }) => {
    A.takeover(); await flush();
    await press(ta, { pointerType: 'touch', holdMs: 400 }); const focus = at();
    type('ok');
    const r = { focus, composer: ta.value, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.focus === 'composer' && r.composer === 'ok' && r.page === '' && r.yielded;
    return r;
  });
  // 11. TWO views driving: one press yields BOTH (per claim); a press on A's picture gives the keys to A (it re-claims)
  out.twoViews = await world(async ({ V: [A, B], ta, press, type, at }) => {
    A.takeover(); B.takeover(); await flush();
    const owner0 = KO.keyboardOwner() && KO.keyboardOwner().id;
    await press(ta); const f1 = at(); type('hi');
    const both = A.ky.yielded && B.ky.yielded;
    await press(A.img); const f2 = at(); type('a');
    const owner1 = KO.keyboardOwner() && KO.keyboardOwner().id;
    await press(B.img); const f3 = at(); type('b');
    const owner2 = KO.keyboardOwner() && KO.keyboardOwner().id;
    const r = { owner0, f1, both, f2, owner1, f3, owner2, composer: ta.value, pageA: A.st.page, pageB: B.st.page };
    r.ok = r.owner0 === B.id && r.f1 === 'composer' && r.both && r.f2 === 'sink0' && r.owner1 === A.id && r.f3 === 'sink1' && r.owner2 === B.id && r.composer === 'hi' && r.pageA === 'a' && r.pageB === 'b';
    return r;
  }, { views: 2 });
  // 12. a HANDBACK while yielded: the yield ends with the claim, the line goes; the next takeover starts un-yielded
  out.handback = await world(async ({ V: [A], ta, line, press, at }) => {
    A.takeover(); await flush();
    await press(ta); const lineOn = !line.hidden;
    A.handback(); const lineAfter = !line.hidden; const yieldedAfter = A.ky.yielded;
    A.takeover(); await flush(); const focus = at();
    const r = { lineOn, lineAfter, yieldedAfter, focus, owned: KO.keyboardOwned() };
    r.ok = r.lineOn && !r.lineAfter && !r.yieldedAfter && r.focus === 'sink' && r.owned;
    return r;
  });
  // 13. while yielded the words FOLLOW the user: composer → terminal re-kinds; a script focus while yielded is the user's to allow
  out.follow = await world(async ({ V: [A], ta, cvs, helper, press, at }) => {
    A.takeover(); await flush();
    await press(ta); const k1 = A.ky.kind;
    await press(cvs); const k2 = A.ky.kind; const f2 = at();
    ta.focus(); await flush(); const f3 = at();
    const r = { k1, k2, f2, f3, reclaims: A.st.reclaims, helperFocusedOnce: !!helper };
    r.ok = r.k1 === 'chat' && r.k2 === 'terminal' && r.f2 === 'terminal' && r.f3 === 'composer' && r.reclaims === 0;
    return r;
  });
  // 14. verify r1 (K3): yielded, then a press on the view's OWN TAB (outside its root; the tab keeps the caret where it was)
  //     — the keys go back to the page; before, the caret stayed in the composer and "pw" meant for the page went there
  out.ownTab = await world(async ({ V: [A], ta, line, press, type, at }) => {
    A.takeover(); await flush();
    await press(ta); type('hi');
    await press(A.tabLabel); const focus = at();
    type('pw');
    const r = { focus, composer: ta.value, page: A.st.page, yielded: A.ky.yielded, owned: KO.keyboardOwned(), line: !line.hidden };
    r.ok = r.focus === 'sink' && r.composer === 'hi' && r.page === 'pw' && !r.yielded && r.owned && !r.line;
    return r;
  });
  // 15. verify r1 (K3): yielded, the view goes OFF SCREEN (a desktop switch / its tab hidden), the user presses its tab —
  //     the yield ends even though the view did not drive at that press; back on screen it owns the keys again
  out.hiddenTab = await world(async ({ V: [A], ta, press, type }) => {
    A.takeover(); await flush();
    await press(ta); type('hi');
    A.st.displayed = false; await press(A.tabLabel); const yieldedHidden = A.ky.yielded;
    A.st.displayed = true; KO.keyboardChanged();
    type('pw');
    const r = { yieldedHidden, composer: ta.value, page: A.st.page, owned: KO.keyboardOwned() };
    r.ok = !r.yieldedHidden && r.composer === 'hi' && r.page === 'pw' && r.owned;
    return r;
  });
  // 16. verify r1: the caret ALREADY in the composer when the view owns again: a press on the composer makes no focusin —
  //     it must still yield. Measured on cf24cf01: no yield, "c3" typed after the press went to the PAGE. (verify r2: since
  //     H1 a press while hidden yields and a SIGNALLED return moves a script's caret to the sink, so the state is built
  //     here the one way left — a script's caret and a return NO signal reported; the press is then judged at the press.)
  out.alreadyFocused = await world(async ({ V: [A], ta, line, press, type, at }) => {
    A.takeover(); await flush();
    A.st.displayed = false; ta.focus(); await flush(); const whileHidden = at(); type('c1');
    A.st.displayed = true; const ownsAgain = KO.keyboardOwned();
    await press(ta); const focus = at();
    type('hi');
    const r = { whileHidden, ownsAgain, focus, composer: ta.value, page: A.st.page, yielded: A.ky.yielded, kind: A.ky.kind, owned: KO.keyboardOwned(), line: !line.hidden, reclaims: A.st.reclaims };
    r.ok = r.whileHidden === 'composer' && r.ownsAgain && r.focus === 'composer' && r.composer === 'c1hi' && r.page === '' && r.yielded && r.kind === 'chat' && !r.owned && r.line && r.reclaims === 0;
    return r;
  });
  // 17. …and the same press judged at the press stays the PASSWORD GUARD: a SYNTHETIC press on the focused composer, or a
  //     real press on something else while a script left the caret there, never yields
  out.alreadyFocusedGuard = await world(async ({ V: [A], ta, sidebar, press, type, at }) => {
    A.takeover(); await flush();
    A.st.displayed = false; ta.focus(); await flush(); A.st.displayed = true; // (the unsignalled return, as in 16)
    await press(ta, { trusted: false }); const y1 = A.ky.yielded;
    await press(sidebar); const y2 = A.ky.yielded;
    type('pw');
    const r = { y1, y2, composer: ta.value, page: A.st.page };
    r.ok = !r.y1 && !r.y2 && r.composer === '' && r.page === 'pw';
    return r;
  });
  // ── verify r2 (H1): the reverse direction — the view starts owning again while the caret sits outside it ──
  // 18. userW one state later: the live view MINIMIZED, a real press on the composer, typing, the view RESTORED — the
  //     press yielded (the takeover is his even while the view is off screen): back on screen the keys stay in the
  //     composer, and the view says so at once (redrawn at the restore, no key needed)
  out.h1PressHidden = await world(async ({ V: [A], ta, line, press, type, at }) => {
    A.takeover(); await flush();
    A.show(false); await press(ta); const hiddenFocus = at(); type('c1');
    const redraws0 = A.st.redraws; A.show(true);
    const atRestore = { focus: at(), yielded: A.ky.yielded, owned: KO.keyboardOwned(), yieldedFact: KO.keyboardYielded(), line: !line.hidden, redrawn: A.st.redraws >= redraws0 };
    type('c2');
    const r = { hiddenFocus, atRestore, composer: ta.value, page: A.st.page, kind: A.ky.kind, strayKeys: A.st.strayKeys };
    r.ok = r.hiddenFocus === 'composer' && r.atRestore.focus === 'composer' && r.atRestore.yielded && !r.atRestore.owned && r.atRestore.yieldedFact && r.atRestore.line && r.composer === 'c1c2' && r.page === '' && r.kind === 'chat' && r.strayKeys === 0;
    return r;
  });
  // 19. …the PASSWORD GUARD across the same return: a SCRIPT put the caret in the composer while the view was off screen
  //     (no press) — the return moves the CARET to the sink at once (explicitly, before any key) and the keys go to the page
  out.h1ScriptHidden = await world(async ({ V: [A], ta, line, type, at }) => {
    A.takeover(); await flush();
    A.show(false); ta.focus(); await flush(); const hiddenFocus = at(); type('d1');
    const redraws0 = A.st.redraws; A.show(true);
    const atRestore = { focus: at(), owned: KO.keyboardOwned(), caretMoves: A.st.caretMoves, redrawn: A.st.redraws > redraws0, line: !line.hidden };
    type('d2');
    const r = { hiddenFocus, atRestore, composer: ta.value, page: A.st.page, yielded: A.ky.yielded, strayKeys: A.st.strayKeys };
    r.ok = r.hiddenFocus === 'composer' && r.atRestore.focus === 'sink' && r.atRestore.owned && r.atRestore.caretMoves === 1 && r.atRestore.redrawn && !r.atRestore.line && r.composer === 'd1' && r.page === 'd2' && !r.yielded && r.strayKeys === 0;
    return r;
  });
  // 20. the STREAM reconnecting (the view on screen, its upstream down): a press on the composer yields; the stream back
  //     keeps the keys in the composer
  out.h1Reconnect = await world(async ({ V: [A], ta, press, type, at }) => {
    A.takeover(); await flush();
    A.stream(false); await press(ta); type('e1');
    A.stream(true); const focus = at(); type('e2');
    const r = { focus, composer: ta.value, page: A.st.page, yielded: A.ky.yielded, owned: KO.keyboardOwned() };
    r.ok = r.focus === 'composer' && r.composer === 'e1e2' && r.page === '' && r.yielded && !r.owned;
    return r;
  });
  // 21. a FRAME held the focus when the view came back (a Web view / plugin page focused itself while the view was off
  //     screen): its document takes every key the view never sees — the return moves the caret to the sink as for a text box
  out.h1Frame = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const frame = new D.El('iframe', { tabindex: 0 }); D.body.append(frame);
    A.show(false); frame.focus(); await flush(); const hiddenFocus = at();
    A.show(true); const focus = at(); type('f');
    const r = { hiddenFocus, focus, page: A.st.page, caretMoves: A.st.caretMoves };
    r.ok = r.hiddenFocus === 'IFRAME' && r.focus === 'sink' && r.page === 'f' && r.caretMoves === 1;
    return r;
  });
  // 22. THE BELT: a return NO signal reported (the view owns, a script's caret still in the composer) — the first key goes
  //     neither to the composer nor to the page; the caret moves to the sink; the next key is the page's
  out.belt = await world(async ({ V: [A], ta, type, at }) => {
    A.takeover(); await flush();
    A.st.displayed = false; ta.focus(); await flush(); A.st.displayed = true; // no signal
    type('xy'); const focus = at();
    const r = { focus, composer: ta.value, page: A.st.page, strayKeys: A.st.strayKeys };
    r.ok = r.focus === 'sink' && r.composer === '' && r.page === 'y' && r.strayKeys === 1;
    return r;
  });
  // ── verify r2 (H1b'): a yield made while the view was off screen whose HOME is gone when the view comes back ──
  // the chat on ANOTHER desktop: pressed there (yield), back on the view's desktop the chat box is hidden — measured in
  // chrome: the focus fell to <body>, "k2" went nowhere and the chip said "Keyboard is in the chat box"
  out.homeGone = await world(async ({ V: [A], D, ta, press, type, at }) => {
    A.takeover(); await flush();
    A.show(false); await press(ta); type('k1'); const yieldedHidden = A.ky.yielded;
    ta.parent._hidden = true; D.doc.focus(D.body); // the chat's desktop hidden: the browser's focus fixup moves the caret to <body>
    A.show(true); const focus = at(); type('k2');
    const r = { yieldedHidden, focus, yielded: A.ky.yielded, owned: KO.keyboardOwned(), composer: ta.value, page: A.st.page, homeless: A.st.homeless || 0 };
    r.ok = r.yieldedHidden && r.focus === 'sink' && !r.yielded && r.owned && r.composer === 'k1' && r.page === 'k2' && r.homeless === 1;
    return r;
  });
  // …and a browser that KEEPS the focus on the hidden box: the home is not visible either — the caret moves to the sink
  out.homeHidden = await world(async ({ V: [A], ta, press, type, at }) => {
    A.takeover(); await flush();
    A.show(false); await press(ta); type('k1');
    ta.parent._hidden = true; // hidden, still focused
    A.show(true); const focus = at(); type('k2');
    const r = { focus, yielded: A.ky.yielded, composer: ta.value, page: A.st.page };
    r.ok = r.focus === 'sink' && !r.yielded && r.composer === 'k1' && r.page === 'k2';
    return r;
  });
  // ── verify r2 (Q1): a BUTTON of the user's that focuses a box (the composer's expand button) — reclaimed, SAID once ──
  out.q1Cue = await world(async ({ V: [A], D, ta, sidebar, press, type, at, clock }) => {
    A.takeover(); await flush();
    const expand = new D.El('button', { cls: 'chat-expand-btn' }); ta.parent.append(expand);
    expand.addEventListener('mousedown', () => { queueMicrotask(() => ta.focus()); }); // its handler focuses the box
    await press(expand); await flush(); const f1 = at(); const c1 = A.st.cues;
    clock.advance(1000); await press(expand); await flush(); const c2 = A.st.cues; // inside the rate limit
    clock.advance(T.RECLAIM_CUE_MS); ta.focus(); await flush(); const c3 = A.st.cues; // a SCRIPT's focus: never said
    await press(sidebar); clock.advance(T.USER_PRESS_MS + 50); ta.focus(); await flush(); const c4 = A.st.cues; // stale: not his
    clock.advance(T.RECLAIM_CUE_MS); await press(expand); await flush(); const c5 = A.st.cues; // past the limit: said again
    await press(ta); const f2 = at(); type('ok'); // the advice works: a press on the box itself yields
    const r = { f1, cues: [c1, c2, c3, c4, c5], f2, composer: ta.value, page: A.st.page, reclaims: A.st.reclaims };
    r.ok = r.f1 === 'sink' && JSON.stringify(r.cues) === '[1,1,1,1,2]' && r.f2 === 'composer' && r.composer === 'ok' && r.page === '' && r.reclaims === 5;
    return r;
  });
  // ── verify r2 (N1): a DESKTOP APP / the DESKTOP — the user's press on the picture yields to what takes its keys ──
  out.n1Xpra = await world(async ({ V: [A], xCanvas, xIme, press, type, at }) => {
    A.takeover(); await flush();
    await press(xCanvas); const focus = at(); type('ls');
    const r = { focus, app: xIme.value, page: A.st.page, yielded: A.ky.yielded, owned: KO.keyboardOwned(), reclaims: A.st.reclaims };
    r.ok = r.focus === 'xpra-ime' && r.app === 'ls' && r.page === '' && r.yielded && !r.owned && r.reclaims === 0;
    return r;
  });
  out.n1Vnc = await world(async ({ V: [A], vCanvas, press, type, at }) => {
    A.takeover(); await flush();
    await press(vCanvas); const focus = at(); type('vn');
    const r = { focus, page: A.st.page, yielded: A.ky.yielded, owned: KO.keyboardOwned(), reclaims: A.st.reclaims };
    r.ok = r.focus === 'vnc-canvas' && r.page === '' && r.yielded && !r.owned && r.reclaims === 0;
    return r;
  });
  // the .299 integration (the census's base red on .298): the paired machine's WebRTC stream — its <video> takes the keys itself
  out.n1Stream = await world(async ({ V: [A], sVideo, press, type, at }) => {
    A.takeover(); await flush();
    await press(sVideo); const focus = at(); type('st');
    const r = { focus, page: A.st.page, yielded: A.ky.yielded, owned: KO.keyboardOwned(), reclaims: A.st.reclaims };
    r.ok = r.focus === 'stream-video' && r.page === '' && r.yielded && !r.owned && r.reclaims === 0;
    return r;
  });
  // …and the password guard holds on both: the app's own focus() (a connect, a lease applied) is a script's — reclaimed
  out.n1Script = await world(async ({ V: [A], xIme, vCanvas, type, at }) => {
    A.takeover(); await flush();
    vCanvas.focus(); await flush(); const f1 = at();
    xIme.focus(); await flush(); const f2 = at();
    type('pw');
    const r = { f1, f2, page: A.st.page, app: xIme.value, yielded: A.ky.yielded, reclaims: A.st.reclaims };
    r.ok = r.f1 === 'sink' && r.f2 === 'sink' && r.page === 'pw' && r.app === '' && !r.yielded && r.reclaims === 2;
    return r;
  });
  // ── verify r2 (H3): a key HELD in the page when the keys leave it is let go there (its keyup would reach nothing) ──
  out.h3Hide = await world(async ({ V: [A] }) => {
    A.takeover(); await flush();
    A.hold('Shift'); A.hold('x'); A.show(false); const released = A.st.released.slice();
    A.show(true); const after = A.st.released.slice();
    const r = { released, after };
    r.ok = JSON.stringify(r.released) === '["x","Shift"]' && JSON.stringify(r.after) === JSON.stringify(r.released);
    return r;
  });
  out.h3Stream = await world(async ({ V: [A] }) => {
    A.takeover(); await flush();
    A.hold('Alt'); A.stream(false);
    const r = { released: A.st.released.slice() };
    r.ok = JSON.stringify(r.released) === '["Alt"]';
    return r;
  });
  out.h3Handback = await world(async ({ V: [A] }) => {
    A.takeover(); await flush();
    A.hold('Shift'); A.handbackPress();
    const r = { released: A.st.released.slice(), mode: A.st.mode };
    r.ok = JSON.stringify(r.released) === '["Shift"]' && r.mode === 'watch';
    return r;
  });
  // ── verify r3: THE SINK'S BLUR — what a press on something that is not a text box leaves the focus on ──
  // F1: a <select> — the user's press opens its list and the pointer picks: the sink never takes the focus from it (measured
  // on 46462c3d: the code editor's language select neither focused nor open 100 ms after a real press — every dropdown of
  // the app dead while driving); its keys stay the page's
  out.choiceSelect = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const sel = new D.El('select', { cls: 'toolbar-select' }); D.body.append(sel);
    await press(sel); await flush(); const focus = at();
    type('pw');
    const r = { focus, page: A.st.page, yielded: A.ky.yielded, owned: KO.keyboardOwned() };
    r.ok = r.focus === 'toolbar-select' && r.page === 'pw' && !r.yielded && r.owned;
    return r;
  });
  // a FRAME (a Web view / plugin page) — a press into it is the frame document's: taken back, said (verify r2 H5)
  out.frameSink = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const fr = new D.El('iframe', { cls: 'wv-frame' }); D.body.append(fr);
    await press(fr); await flush(); const focus = at();
    type('wv');
    const r = { focus, page: A.st.page, frameCues: A.st.frameCues, yielded: A.ky.yielded };
    r.ok = r.focus === 'sink' && r.page === 'wv' && r.frameCues === 1 && !r.yielded;
    return r;
  });
  // a CONTROL (a checkbox, a range, a role=button chip): the pointer works, the sink takes the focus back, its keys stay the page's
  out.controlCheckbox = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const cb = new D.El('input', { cls: 'cb', type: 'checkbox' }); D.body.append(cb);
    await press(cb); await flush(); const focus = at();
    type('pw');
    const r = { focus, page: A.st.page, yielded: A.ky.yielded, frameCues: A.st.frameCues };
    r.ok = r.focus === 'sink' && r.page === 'pw' && !r.yielded && r.frameCues === 0;
    return r;
  });
  // F2: a COPY FALLBACK (plain http: utils.js copyText) — the user's press on "Copy Path" appends a scratch textarea, selects
  // (focuses) it, copies and removes it in one task: taken back, never announced (there is no box to click)
  out.helperCopy = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const item = new D.El('div', { cls: 'context-menu-item' }); D.body.append(item);
    item.addEventListener('pointerup', () => { const ta = new D.El('textarea'); D.body.append(ta); ta.focus(); D.body.children.splice(D.body.children.indexOf(ta), 1); ta.parent = null; if (D.doc.activeElement === ta) D.doc.activeElement = D.body; });
    await press(item); await flush(); const focus = at();
    type('pw');
    const r = { focus, page: A.st.page, reclaims: A.st.reclaims, cues: A.st.cues };
    r.ok = r.focus === 'sink' && r.page === 'pw' && r.reclaims === 1 && r.cues === 0;
    return r;
  });
  // a WIDGET (a keyboard-navigable list: the file explorer's, the inbox's): not a place that takes typing — declared: a
  // press leaves the keys where they were (the page, the view owning)
  out.widgetList = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const list = new D.El('div', { cls: 'file-list', tabindex: -1 }); const row = new D.El('div', { cls: 'file-item' }); list.append(row); D.body.append(list);
    await press(row); await flush(); const focus = at();
    type('pw');
    const r = { focus, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.focus === 'sink' && r.page === 'pw' && !r.yielded;
    return r;
  });
  // ── verify r3: THE INPUT-SURFACE CENSUS's class representatives not covered above ──
  // a SEARCH box (the palette, the principal picker, the channels panel): <input type=search> — a text box
  out.textSearch = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const box = new D.El('input', { cls: 'palette-input', type: 'search' }); D.body.append(box);
    await press(box); const focus = at(); type('ab');
    const r = { focus, val: box.value, page: A.st.page, yielded: A.ky.yielded, kind: A.ky.kind };
    r.ok = r.focus === 'palette-input' && r.val === 'ab' && r.page === '' && r.yielded && r.kind === 'other';
    return r;
  });
  // the CODE EDITOR (CodeMirror 6: its own mousedown on the contenteditable .cm-content cancels the press and focuses the
  // content): a press on a LINE yields to .cm-content; a press on its GUTTER focuses the scroller (tabindex -1 — no typing,
  // as without a takeover: measured on 46462c3d, the gutter press left the focus on .cm-scroller) and the sink takes it back
  out.textCm = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const ed = new D.El('div', { cls: 'cm-editor' }); const sc = new D.El('div', { cls: 'cm-scroller', tabindex: -1 }); const gut = new D.El('div', { cls: 'cm-gutters' }); const content = new D.El('div', { cls: 'cm-content', ce: true }); const line = new D.El('div', { cls: 'cm-line' });
    ed.append(sc.append(gut, content.append(line))); D.body.append(ed);
    content.addEventListener('mousedown', (e) => { e.preventDefault(); D.doc.focus(content); }); // handlers.mousedown → focusPreventScroll(view.contentDOM)
    await press(gut); await flush(); const fGutter = at(); type('g');
    await press(line); const fLine = at(); type('zz');
    const r = { fGutter, fLine, doc: content.value, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.fGutter === 'sink' && r.fLine === 'cm-content' && r.doc === 'zz' && r.page === 'g' && r.yielded;
    return r;
  });
  // a CANVAS that takes no keys (a chart, a measuring context): a press on it is a press on nothing that types — the keys
  // stay the page's (only a picture shell's canvas is a keyboard surface)
  out.noneCanvas = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const box = new D.El('div', { cls: 'sys-chart-box' }); const cv = new D.El('canvas', { cls: 'sys-hist-chart' }); D.body.append(box.append(cv));
    await press(cv); await flush(); const focus = at(); type('pw');
    const r = { focus, page: A.st.page, yielded: A.ky.yielded, surface: KY.isKeyboardSurface(cv) };
    r.ok = r.focus === 'sink' && r.page === 'pw' && !r.yielded && !r.surface;
    return r;
  });
  // lane takeover-surface-census (the .323 base red — eleven surfaces of the .313–.323 lanes unclassified): the class
  // representatives those rows brought that no leg above proved. A PASSWORD box (the vault's second password: the unlock /
  // setup / change modals, 「验证是你」): <input type=password> is a text box — the user's own press yields, "s3" lands in it
  out.textPassword = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const box = new D.El('input', { cls: 'vault-pw', type: 'password' }); D.body.append(box);
    await press(box); const focus = at(); type('s3');
    const r = { focus, val: box.value, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.focus === 'vault-pw' && r.val === 's3' && r.page === '' && r.yielded;
    return r;
  });
  // a READ-ONLY field (the Vault window's shown value, `.vw-plain`; its Copy button copies): it takes no typing — the sink takes
  // the focus back, the keys stay the page's, the value is untouched, nothing said
  out.controlReadonly = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const f = new D.El('input', { cls: 'vw-plain', type: 'text' }); f.readOnly = true; f.value = 'v4lue'; D.body.append(f);
    await press(f); await flush(); const focus = at(); type('pw');
    const r = { focus, val: f.value, page: A.st.page, yielded: A.ky.yielded, cues: A.st.cues };
    r.ok = r.focus === 'sink' && r.val === 'v4lue' && r.page === 'pw' && !r.yielded && r.cues === 0;
    return r;
  });
  // a role=button CHIP (tabindex 0 — one window's stream stats chip, a scale chip): the press works it (its click), the sink takes
  // the focus back, its Enter stays the page's
  out.controlChip = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    let clicks = 0, keys = 0;
    const chip = new D.El('span', { cls: 'machine-window-chip', tabindex: 0 }); D.body.append(chip);
    chip.addEventListener('pointerup', () => { clicks++; }); // (the mini's click = the release)
    chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); keys++; } });
    await press(chip); await flush(); const focus = at(); type('\n');
    const r = { focus, clicks, keys, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.focus === 'sink' && r.clicks === 1 && r.keys === 0 && r.page === '\n' && !r.yielded;
    return r;
  });
  // verify r3 (r2's held): YIELDED, then a press on something that takes no keys (the chat's message list focuses its
  // container, tabindex -1) — the yield stays (a press on the chat never sends keys to the page) and the chip says where the
  // keys are NOW: nowhere ("not in a text box"); a press back on the composer says "chat" again
  out.widgetYielded = await world(async ({ V: [A], D, ta, press, type, at }) => {
    A.takeover(); await flush();
    const chatView = new D.El('div', { cls: 'chat-view', tabindex: -1 }); const msgs = new D.El('div', { cls: 'chat-message-list' }); chatView.append(msgs); D.body.append(chatView);
    await press(ta); type('l1'); const w1 = A.ky.whereNow(D.doc.activeElement);
    await press(msgs); await flush(); const focus = at(); const w2 = A.ky.whereNow(D.doc.activeElement);
    type('nn');
    await press(ta); const w3 = A.ky.whereNow(D.doc.activeElement);
    const r = { w1, focus, w2, w3, composer: ta.value, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.w1 === 'chat' && r.focus === 'chat-view' && r.w2 === 'none' && r.w3 === 'chat' && r.composer === 'l1' && r.page === '' && r.yielded;
    return r;
  });
  // ── lane dialog-keys (the owner's "ok", 2026-09-30, on takeover-keyboard r4's proposal): A DIALOG YOUR OWN ACT OPENED TAKES
  // THE KEYS; one that opens by itself never does. Before (verify r3 F4): EVERY app modal was taken back — Delete → the confirm
  // → Enter went to the PAGE (its textarea got a line break, the file was kept), said once. Every dialog below is built and
  // ANNOUNCED as src/lib/utils.js builds it (the world's `modal`: createModalShell + showConfirmDialog / showInputDialog).
  const menuItem = (D, open) => { const item = new D.El('div', { cls: 'context-menu-item' }); D.body.append(item); item.addEventListener('pointerup', open); return item; }; // (a menu row: its action runs at the release, like the click)
  // (1) THE RULE: Take over, "p1" to the page, Shift held there; a real press on a menu's Delete opens the confirm — it TAKES the
  // keys: its own focus stays (OK), the chip says "in the dialog", nobody owns, the Shift held in the page is let go; Enter
  // ANSWERS it (true) and the page gets NOTHING; its close gives the keys back to the page: the sink holds the caret, the view
  // owns again, "x" reaches the page; nothing said; the takeover went on
  out.dialogUserPress = await world(async ({ V: [A], D, press, type, at, modal }) => {
    A.takeover(); await flush(); type('p1'); A.hold('Shift');
    let m = null; const item = menuItem(D, () => { m = modal(); });
    await press(item); await flush();
    const open = { focus: at(), where: A.ky.whereNow(D.doc.activeElement), owned: KO.keyboardOwned(), held: A.ky.dialogHolds, released: [...A.st.released], takes: A.st.dialogTakes, why: A.ky.dialogWhy };
    type('\n'); await flush();
    const closed = { answer: m && m.answer, open: m && m.open, focus: at(), owner: KO.keyboardOwner() && KO.keyboardOwner().id, held: A.ky.dialogHolds, returns: A.st.dialogReturns };
    type('x');
    const r = { open, closed, page: A.st.page, cues: A.st.dialogCues, mode: A.st.mode, mine: A.st.mine };
    r.ok = r.open.focus === 'btn-create' && r.open.where === 'dialog' && !r.open.owned && r.open.held && JSON.stringify(r.open.released) === '["Shift"]' && r.open.takes === 1 && r.open.why === 'pressed'
      && r.closed.answer === true && r.closed.open === false && r.closed.focus === 'sink' && r.closed.owner === A.id && !r.closed.held && r.closed.returns === 1
      && r.page === 'p1x' && r.cues === 0 && r.mode === 'takeover' && r.mine;
    return r;
  });
  // (2) THE PASSWORD GUARD: a confirm that opens BY ITSELF (a broadcast, a timer — nothing pressed) while "pw" is typed into the
  // page is TAKEN BACK (the caret stays in the sink, its Enter is the page's, it stays open) and SAID once; an input dialog
  // opening by itself a second later gets none of the typing and is not said again (one rate limit)
  out.dialogScript = await world(async ({ V: [A], type, at, clock, modal }) => {
    A.takeover(); await flush(); type('pw');
    const m1 = modal(); await flush(); await flush();
    const f1 = at(); const c1 = A.st.dialogCues; const why = A.ky.dialogWhy; type('\n');
    clock.advance(1000); const m2 = modal({ input: true }); await flush(); await flush();
    const f2 = at(); const c2 = A.st.dialogCues; type('ab');
    const r = { f1, c1, why, f2, c2, page: A.st.page, open: [m1.open, m2.open], box: m2.box.value, held: A.ky.dialogHolds, owned: KO.keyboardOwned(), takes: A.st.dialogTakes };
    r.ok = r.f1 === 'sink' && r.c1 === 1 && r.why === 'no press' && r.f2 === 'sink' && r.c2 === 1 && r.page === 'pw\nab' && JSON.stringify(r.open) === '[true,true]' && r.box === '' && !r.held && r.owned && r.takes === 0;
    return r;
  });
  // (3) A SCRIPT CANNOT FAKE THE OPENER: a SYNTHETIC press (isTrusted false) on the menu row opens the confirm — not his act:
  // taken back and said; its Enter is the page's
  out.dialogSynthetic = await world(async ({ V: [A], D, press, type, at, modal }) => {
    A.takeover(); await flush();
    let m = null; const item = menuItem(D, () => { m = modal(); });
    await press(item, { trusted: false }); await flush(); await flush();
    const f = at(); type('\n');
    const r = { f, page: A.st.page, cues: A.st.dialogCues, open: m && m.open, held: A.ky.dialogHolds, why: A.ky.dialogWhy };
    r.ok = r.f === 'sink' && r.page === '\n' && r.cues === 1 && r.open && !r.held && r.why === 'synthetic press';
    return r;
  });
  // (4) a press on the PICTURE went to the PAGE — a confirm opening by itself 50 ms later is not his: taken back and said
  out.dialogPicture = await world(async ({ V: [A], press, type, at, clock, modal }) => {
    A.takeover(); await flush();
    await press(A.img); clock.advance(50); const m = modal(); await flush(); await flush();
    const f = at(); type('\n');
    const r = { f, page: A.st.page, cues: A.st.dialogCues, open: m.open, held: A.ky.dialogHolds, why: A.ky.dialogWhy };
    r.ok = r.f === 'sink' && r.page === '\n' && r.cues === 1 && r.open && !r.held && r.why === 'pressed the page';
    return r;
  });
  // (5) a STALE press: the sidebar pressed, the confirm opens 400 ms after the release (a slow fetch, a broadcast) — judged as
  // opening by itself (declared: a dialog opened after an await past USER_PRESS_MS is taken back and said)
  out.dialogStale = await world(async ({ V: [A], sidebar, press, type, at, clock, modal }) => {
    A.takeover(); await flush();
    await press(sidebar); clock.advance(T.USER_PRESS_MS + 150); const m = modal(); await flush(); await flush();
    const f = at(); type('\n');
    const r = { f, page: A.st.page, cues: A.st.dialogCues, open: m.open, held: A.ky.dialogHolds, why: A.ky.dialogWhy };
    r.ok = r.f === 'sink' && r.page === '\n' && r.cues === 1 && r.open && !r.held && r.why === 'stale press';
    return r;
  });
  // (5b) lane takeover-surface-census: THE VAULT'S 「验证是你」 (src/lib/vault-reveal.js — a password box in a createModalShell
  // dialog) from a menu row while you drive. Opened in the press's own task (the Vault window's 「显示」; Manage Agents' Show key…
  // since this lane) it is his act: it TAKES the keys — the second password lands in its box, the page gets nothing. Opened a hub
  // round trip late (Show key… before: the key asked for first, refused, THEN the ask) it is a stale press — taken back and said,
  // and the typing is the agent's PAGE's. Hence revealAccountKey asks FIRST while this page holds no window (pinned in §3)
  const passwordAsk = (late) => world(async ({ V: [A], D, press, type, at, clock, modal }) => {
    A.takeover(); await flush();
    let m = null; const ask = () => { m = modal({ input: true }); m.box.type = 'password'; };
    const item = menuItem(D, () => { if (!late) ask(); });
    await press(item);
    if (late) { clock.advance(T.USER_PRESS_MS + 150); ask(); }
    await flush(); await flush();
    const focus = at(); type('s3cret');
    return { focus, box: m.box.value, page: A.st.page, cues: A.st.dialogCues, why: A.ky.dialogWhy, held: A.ky.dialogHolds };
  });
  { const fresh = await passwordAsk(false), late = await passwordAsk(true);
    out.dialogPassword = { fresh, late,
      ok: fresh.focus === 'dialog-input' && fresh.box === 's3cret' && fresh.page === '' && fresh.cues === 0 && fresh.why === 'pressed' && fresh.held
        && late.focus === 'sink' && late.box === '' && late.page === 's3cret' && late.cues === 1 && late.why === 'stale press' && !late.held }; }
  // (6) YIELDED to the chat composer ("hi"), a press on a chat button opens an INPUT dialog — his act: it takes the keys ("nm" +
  // Enter answer it), and its close gives them back to the COMPOSER (the yield's home — not the button he pressed): "!" lands
  // there, the line above the composer is on, the chip says the chat again; the page gets nothing
  out.dialogYielded = await world(async ({ V: [A], D, ta, press, type, at, modal, line }) => {
    A.takeover(); await flush();
    await press(ta); type('hi');
    const btn = new D.El('button', { cls: 'chat-title-btn' }); D.body.append(btn);
    let m = null; btn.addEventListener('pointerup', () => { m = modal({ input: true }); });
    await press(btn); await flush();
    const open = { focus: at(), where: A.ky.whereNow(D.doc.activeElement), held: A.ky.dialogHolds };
    type('nm\n'); await flush();
    const closed = { answer: m && m.answer, focus: at(), yielded: A.ky.yielded, where: A.ky.whereNow(D.doc.activeElement), held: A.ky.dialogHolds };
    type('!');
    const r = { open, closed, composer: ta.value, page: A.st.page, line: !line.hidden };
    r.ok = r.open.focus === 'dialog-input' && r.open.where === 'dialog' && r.open.held && r.closed.answer === 'nm' && r.closed.focus === 'composer' && r.closed.yielded && r.closed.where === 'chat' && !r.closed.held && r.composer === 'hi!' && r.page === '' && r.line;
    return r;
  });
  // (7) TWO DIALOGS — a confirm over an input dialog: the newest holds; its close returns to the older (to what held the caret
  // when it opened: the older's button he pressed); the older's close returns to the page
  out.dialogNested = await world(async ({ V: [A], D, press, type, at, modal }) => {
    A.takeover(); await flush();
    let mA = null; const item = menuItem(D, () => { mA = modal({ input: true }); });
    await press(item); await flush(); type('ab');
    const more = new D.El('button', { cls: 'dialog-more' }); mA.dlg.append(more);
    let mB = null; more.addEventListener('pointerup', () => { mB = modal(); });
    await press(more); await flush();
    const inB = { focus: at(), owned: KO.keyboardOwned() };
    type('\n'); await flush();
    const backA = { answerB: mB && mB.answer, focus: at(), held: A.ky.dialogHolds, owned: KO.keyboardOwned() };
    await press(mA.box); type('c\x1b'); await flush();
    const out = { answerA: mA.answer, boxA: mA.box.value, focus: at(), owned: KO.keyboardOwned() };
    type('z');
    const r = { inB, backA, out, page: A.st.page };
    r.ok = r.inB.focus === 'btn-create' && !r.inB.owned && r.backA.answerB === true && r.backA.focus === 'dialog-more' && r.backA.held && !r.backA.owned
      && r.out.answerA === null && r.out.boxA === 'abc' && r.out.focus === 'sink' && r.out.owned && r.page === 'z';
    return r;
  });
  // (8) NO ORPHAN HOLD: a dialog he opened, then REMOVED by a script (no answer) — the keys go back to the page ("q"); a nested
  // pair whose OLDER one a script removes — the newest still holds; its close returns to the page ("r"), the older's field gone
  out.dialogScriptClose = await world(async ({ V: [A], D, press, type, at, modal }) => {
    A.takeover(); await flush();
    let m = null; const item = menuItem(D, () => { m = modal(); });
    await press(item); await flush();
    const held0 = A.ky.dialogHolds; m.ov.remove(); await flush();
    const a1 = { held0, focus: at(), owner: KO.keyboardOwner() && KO.keyboardOwner().id, held: A.ky.dialogHolds };
    type('q');
    let mA = null; const item2 = menuItem(D, () => { mA = modal({ input: true }); });
    await press(item2); await flush();
    const more = new D.El('button', { cls: 'dialog-more' }); mA.dlg.append(more);
    let mB = null; more.addEventListener('pointerup', () => { mB = modal(); });
    await press(more); await flush();
    mA.ov.remove(); await flush();
    const a2 = { held: A.ky.dialogHolds, owned: KO.keyboardOwned(), focus: at() };
    type('\n'); await flush();
    const a3 = { answerB: mB && mB.answer, focus: at(), owned: KO.keyboardOwned(), held: A.ky.dialogHolds };
    type('r');
    const r = { a1, a2, a3, page: A.st.page };
    r.ok = r.a1.held0 && r.a1.focus === 'sink' && r.a1.owner === A.id && !r.a1.held && r.a2.held && !r.a2.owned && r.a2.focus === 'btn-create'
      && r.a3.answerB === true && r.a3.focus === 'sink' && r.a3.owned && !r.a3.held && r.page === 'qr';
    return r;
  });
  // (9) TWO VIEWS driving (the last claim owns): one press opens the confirm — BOTH views give it the keys (nobody owns); its
  // close gives them back as they were: B owns, B's sink, "b" to B's page
  out.dialogTwoViews = await world(async ({ V: [A, B], D, press, type, at, modal }) => {
    A.takeover(); B.takeover(); await flush();
    let m = null; const item = menuItem(D, () => { m = modal(); });
    await press(item); await flush();
    const open = { owner: KO.keyboardOwner(), a: A.ky.dialogHolds, b: B.ky.dialogHolds, focus: at() };
    type('\n'); await flush();
    const closed = { answer: m && m.answer, owner: KO.keyboardOwner() && KO.keyboardOwner().id, focus: at(), a: A.ky.dialogHolds, b: B.ky.dialogHolds };
    type('b');
    const r = { open, closed, pageA: A.st.page, pageB: B.st.page };
    r.ok = r.open.owner === null && r.open.a && r.open.b && r.open.focus === 'btn-create' && r.closed.answer === true && r.closed.owner === B.id && r.closed.focus === 'sink1' && !r.closed.a && !r.closed.b && r.pageB === 'b' && r.pageA === '';
    return r;
  }, { views: 2 });
  // (10) A KEY THE APP TOOK — command mode (Ctrl+\ then a key: the app's route, the view's onDocKey stamps it) opens an input
  // dialog: his act, it takes the keys ("3x3" + Enter); a SYNTHETIC key is not his (the next dialog is taken back, said)
  out.dialogAppKey = await world(async ({ V: [A], type, at, clock, modal }) => {
    A.takeover(); await flush();
    A.ky.onAppKey({ isTrusted: true }); const m = modal({ input: true }); await flush();
    const f1 = at(); type('3x3\n'); await flush();
    const a1 = { answer: m.answer, focus: at() };
    clock.advance(T.USER_PRESS_MS + 50); A.ky.onAppKey({ isTrusted: false }); const m2 = modal(); await flush(); await flush();
    const r = { f1, a1, f2: at(), cues: A.st.dialogCues, open2: m2.open, page: A.st.page };
    r.ok = r.f1 === 'dialog-input' && r.a1.answer === '3x3' && r.a1.focus === 'sink' && r.f2 === 'sink' && r.cues === 1 && r.open2 && r.page === '';
    return r;
  });
  // (11) A CHAIN: Enter answers a dialog he opened and its answer opens the next one (an "Overwrite?" after a rename) — the Enter
  // typed into his dialog is his act on the app: the next one takes the keys too ("ok" + Enter answer it); the page gets nothing
  out.dialogChain = await world(async ({ V: [A], D, press, type, at, modal }) => {
    A.takeover(); await flush();
    let m1 = null, m2 = null; const item = menuItem(D, () => { m1 = modal(); m1.ov.addEventListener('keydown', (e) => { if (e.key === 'Enter') Promise.resolve().then(() => { m2 = modal({ input: true }); }); }); });
    await press(item); await flush();
    type('\n'); await flush();
    const f2 = at(); type('ok\n'); await flush();
    const r = { a1: m1 && m1.answer, f2, a2: m2 && m2.answer, focus: at(), page: A.st.page, cues: A.st.dialogCues, takes: A.st.dialogTakes };
    r.ok = r.a1 === true && r.f2 === 'dialog-input' && r.a2 === 'ok' && r.focus === 'sink' && r.page === '' && r.cues === 0 && r.takes === 2;
    return r;
  });
  // (12) A DIALOG THAT FOCUSES NOTHING ITSELF (a createModalShell form): a tick later its first text box gets the keys; a confirm
  // with none gets them on its overlay (never a button he did not choose) — Enter answers it
  out.dialogFocusless = await world(async ({ V: [A], D, press, type, at, modal }) => {
    A.takeover(); await flush();
    let m = null; const item = menuItem(D, () => { m = modal({ input: true, focusOwn: false }); });
    await press(item); await flush();
    const f1 = at(); type('k\n'); await flush();
    let m2 = null; const item2 = menuItem(D, () => { m2 = modal({ focusOwn: false }); });
    await press(item2); await flush();
    const f2 = at(); type('\n'); await flush();
    const r = { f1, a1: m && m.answer, f2, a2: m2 && m2.answer, focus: at(), page: A.st.page };
    r.ok = r.f1 === 'dialog-input' && r.a1 === 'k' && r.f2 === 'dialog-overlay' && r.a2 === true && r.focus === 'sink' && r.page === '';
    return r;
  });
  // (13) a CHOICE control inside a dialog he opened: its <select> keeps the focus of his press (nothing takes it back while the
  // dialog holds), a key is the select's, never the page's; a press on OK answers it and the keys go back to the page
  out.dialogSelect = await world(async ({ V: [A], D, press, type, at, modal }) => {
    A.takeover(); await flush();
    let m = null; const item = menuItem(D, () => { m = modal({ select: true }); });
    await press(item); await flush(); const f1 = at();
    await press(m.sel); await flush(); const f2 = at(); type('k'); await flush(); const f2k = at();
    await press(m.okb); await flush(); const f3 = at();
    const r = { f1, f2, f2k, f3, answer: m.answer, page: A.st.page, cues: A.st.dialogCues, yielded: A.ky.yielded };
    r.ok = r.f1 === 'btn-create' && r.f2 === 'dialog-select' && r.f2k === 'dialog-select' && r.f3 === 'sink' && r.answer === true && r.page === '' && r.cues === 0 && !r.yielded;
    return r;
  });
  // (14) THE STATIC OVERLAY (index.html's #dialog-overlay: app._showDialog shows it by its class and announces; hideDialogs closes
  // it by the class): the New-session press opens it — its box takes "/w"; hidden, the keys go back to the page ("z")
  out.dialogStatic = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const sov = new D.El('div', { cls: 'dialog-overlay hidden' }); const sd = new D.El('div', { cls: 'dialog' }); const cwd = new D.El('input', { cls: 'ns-cwd', type: 'text' }); sov.append(sd.append(cwd)); D.body.append(sov);
    const newBtn = new D.El('button', { cls: 'toolbar-new' }); D.body.append(newBtn);
    newBtn.addEventListener('pointerup', () => { sov.classList.remove('hidden'); D.dispatch(D.doc, 'vs-modal-open', { detail: { overlay: sov } }); cwd.focus(); });
    await press(newBtn); await flush(); const f1 = at(); type('/w');
    sov.classList.add('hidden'); await flush();
    const f2 = at(); const owned = KO.keyboardOwned(); type('z');
    const r = { f1, cwd: cwd.value, f2, owned, page: A.st.page, held: A.ky.dialogHolds };
    r.ok = r.f1 === 'ns-cwd' && r.cwd === '/w' && r.f2 === 'sink' && r.owned && r.page === 'z' && !r.held;
    return r;
  });
  // (15) the agent's PAGE dialog (the live view's own Accept / Dismiss bar, lane browser-stuck) is no app modal: announced or not,
  // it is never taken — the view keeps the keys
  out.dialogPageBar = await world(async ({ V: [A], D, type }) => {
    A.takeover(); await flush();
    const bar = new D.El('div', { cls: 'browser-live-dialog' }); A.root.append(bar);
    D.dispatch(D.doc, 'vs-modal-open', { detail: { overlay: bar } }); await flush();
    type('pg');
    const r = { verdict: A.ky.onDialogOpen(bar, {}), held: A.ky.dialogHolds, owned: KO.keyboardOwned(), page: A.st.page };
    r.ok = r.verdict === null && !r.held && r.owned && r.page === 'pg';
    return r;
  });
  // ── lane dialog-keys verify r1 (the keyboard-authority class): THE KEYS NEVER FALL TO NOWHERE WHILE A DIALOG HOLDS ──
  // (16) a confirm B over an input dialog A, opened from A's button; the button is REPLACED (a keyed re-render of A's body)
  // while B is up; Enter answers B — its return element is gone: A's OWN field gets the keys ("cd" lands in A's box), never
  // <body> (before: 'stay' — the focus fell to <body> with B's removal, the typing went nowhere, the chip said "in the dialog")
  out.dialogBackGone = await world(async ({ V: [A], D, press, type, at, modal }) => {
    A.takeover(); await flush(); type('pg');
    let mA = null; const item = menuItem(D, () => { mA = modal({ input: true }); });
    await press(item); await flush(); type('ab');
    const more = new D.El('button', { cls: 'dialog-more' }); mA.dlg.append(more);
    let mB = null; more.addEventListener('pointerup', () => { mB = modal(); });
    await press(more); await flush();
    more.remove(); mA.dlg.append(new D.El('button', { cls: 'dialog-more' })); await flush();
    const inB = { focus: at(), held: A.ky.dialogHolds, n: A.ky.dialogOverlays().length };
    type('\n'); await flush(); await flush();
    const backA = { answerB: mB && mB.answer, focus: at(), held: A.ky.dialogHolds, n: A.ky.dialogOverlays().length, owned: KO.keyboardOwned(), where: A.ky.whereNow(D.doc.activeElement) };
    type('cd'); await flush();
    const r = { inB, backA, boxA: mA.box.value, page: A.st.page };
    r.ok = r.inB.focus === 'btn-create' && r.inB.held && r.inB.n === 2 && r.backA.answerB === true && r.backA.focus === 'dialog-input' && r.backA.held && r.backA.n === 1 && !r.backA.owned && r.backA.where === 'dialog' && r.boxA === 'abcd' && r.page === 'pg';
    return r;
  });
  // (17) a dialog he opened HOLDS ("ab" typed into its box); a modal opens BY ITSELF over it (a broadcast, 2 s later — not
  // his: 'allow', never held, nothing said) and focuses its own OK; Enter answers THAT one and the focus falls to <body> with
  // its removal — the held dialog gets the keys back ("cd" lands in its box); the page gets nothing throughout
  out.dialogSelfOverHeld = await world(async ({ V: [A], D, press, type, at, clock, modal }) => {
    A.takeover(); await flush(); type('pg');
    let m1 = null; const item = menuItem(D, () => { m1 = modal({ input: true }); });
    await press(item); await flush(); type('ab');
    clock.advance(2000); const m2 = modal(); await flush(); await flush();
    const over = { focus: at(), why: A.ky.dialogWhy, n: A.ky.dialogOverlays().length, cues: A.st.dialogCues, owned: KO.keyboardOwned() };
    type('\n'); await flush(); await flush();
    const back = { answer2: m2.answer, open1: m1.open, focus: at(), held: A.ky.dialogHolds, where: A.ky.whereNow(D.doc.activeElement) };
    type('cd'); await flush();
    const r = { over, back, box1: m1.box.value, page: A.st.page };
    r.ok = r.over.focus === 'btn-create' && r.over.why === 'stale press' && r.over.n === 1 && r.over.cues === 0 && !r.over.owned && r.back.answer2 === true && r.back.open1 && r.back.focus === 'dialog-input' && r.back.held && r.back.where === 'dialog' && r.box1 === 'abcd' && r.page === 'pg';
    return r;
  });
  // (18) THREE dialogs he opened, A < B < C; a script removes B (the middle one): C still holds (the focus stays on its OK —
  // never pulled down to A under it); Enter answers C — its return element was inside B, gone: A's own field gets the keys ("z")
  out.dialogThreeMiddleGone = await world(async ({ V: [A], D, press, type, at, modal }) => {
    A.takeover(); await flush();
    let mA = null; const item = menuItem(D, () => { mA = modal({ input: true }); });
    await press(item); await flush(); type('a');
    const moreA = new D.El('button', { cls: 'more-a' }); mA.dlg.append(moreA);
    let mB = null; moreA.addEventListener('pointerup', () => { mB = modal({ input: true }); });
    await press(moreA); await flush(); type('b');
    const moreB = new D.El('button', { cls: 'more-b' }); mB.dlg.append(moreB);
    let mC = null; moreB.addEventListener('pointerup', () => { mC = modal(); });
    await press(moreB); await flush();
    const s0 = { focus: at(), n: A.ky.dialogOverlays().length };
    mB.ov.remove(); await flush(); await flush();
    const s1 = { focus: at(), n: A.ky.dialogOverlays().length, held: A.ky.dialogHolds };
    type('\n'); await flush(); await flush();
    const s2 = { answerC: mC && mC.answer, focus: at(), n: A.ky.dialogOverlays().length, held: A.ky.dialogHolds };
    type('z');
    const r = { s0, s1, s2, boxA: mA.box.value, boxB: mB.box.value, page: A.st.page };
    r.ok = r.s0.focus === 'btn-create' && r.s0.n === 3 && r.s1.focus === 'btn-create' && r.s1.n === 2 && r.s1.held && r.s2.answerC === true && r.s2.focus === 'dialog-input' && r.s2.n === 1 && r.s2.held && r.boxA === 'az' && r.boxB === 'b' && r.page === '';
    return r;
  });
  // ── lane dialog-keys verify r1 K6: three product parts no scenario reddened (the revert table) — each gets its scenario ──
  // (19) a TOUCH tap HELD 400 ms on a menu row that opens the confirm at its release: the pointerup re-stamps the opener (a
  // click opens at the release) — his act, the dialog takes the keys; without the re-stamp the 400 ms-old pointerdown is stale
  out.dialogTouchHeld = await world(async ({ V: [A], D, press, type, at, modal }) => {
    A.takeover(); await flush(); type('pg');
    let m = null; const item = menuItem(D, () => { m = modal(); });
    await press(item, { pointerType: 'touch', holdMs: 400 }); await flush();
    const f = at(); const why = A.ky.dialogWhy; const held = A.ky.dialogHolds; type('\n'); await flush();
    const r = { f, why, held, answer: m && m.answer, page: A.st.page, cues: A.st.dialogCues };
    r.ok = r.f === 'btn-create' && r.why === 'pressed' && r.held && r.answer === true && r.page === 'pg' && r.cues === 0;
    return r;
  });
  // (20) YIELDED to the composer, a chat button opens a CONFIRM (no text box: its OK holds the focus); the view is hidden and
  // shown (a desktop switch) while it holds — the yield's home rule keeps out (the caret is in the dialog, not homeless): no
  // sink steal, Enter answers it, the keys go back to the composer
  out.dialogConfirmOverYieldHidden = await world(async ({ V: [A], D, ta, press, type, at, modal }) => {
    A.takeover(); await flush(); await press(ta); type('hi');
    const btn = new D.El('button', { cls: 'chat-title-btn' }); D.body.append(btn);
    let m = null; btn.addEventListener('pointerup', () => { m = modal(); });
    await press(btn); await flush();
    A.show(false); await flush(); A.show(true); await flush();
    const s1 = { focus: at(), held: A.ky.dialogHolds, yielded: A.ky.yielded, homeless: A.st.homeless || 0, owned: KO.keyboardOwned(), caretMoves: A.st.caretMoves };
    type('\n'); await flush(); await flush();
    const s2 = { answer: m && m.answer, focus: at(), yielded: A.ky.yielded, where: A.ky.whereNow(D.doc.activeElement) };
    type('!');
    const r = { s1, s2, composer: ta.value, page: A.st.page };
    r.ok = r.s1.focus === 'btn-create' && r.s1.held && r.s1.yielded && r.s1.homeless === 0 && !r.s1.owned && r.s1.caretMoves === 0 && r.s2.answer === true && r.s2.focus === 'composer' && r.s2.yielded && r.s2.where === 'chat' && r.composer === 'hi!' && r.page === '';
    return r;
  });
  // (21) ONE ACT, ONE DIALOG: his press opens A (the opener is spent); a modal opening BY ITSELF 50 ms later — still inside the
  // press's 250 ms — is not his: not held (A alone holds), nothing said (the keys are not the page's); A's Enter answers A
  // (the self-opened one, never held, is left as it is), the keys go back to the page
  out.dialogOneActOneDialog = await world(async ({ V: [A], D, press, type, at, clock, modal }) => {
    A.takeover(); await flush(); type('pg');
    let mA = null; const item = menuItem(D, () => { mA = modal({ input: true }); });
    await press(item); await flush();
    clock.advance(50); const mB = modal({ focusOwn: false }); await flush(); await flush();
    const s1 = { n: A.ky.dialogOverlays().length, why: A.ky.dialogWhy, focus: at(), cues: A.st.dialogCues, takes: A.st.dialogTakes };
    type('k\n'); await flush(); await flush();
    const s2 = { answerA: mA && mA.answer, openB: mB.open, held: A.ky.dialogHolds, focus: at(), owned: KO.keyboardOwned() };
    type('z');
    const r = { s1, s2, page: A.st.page };
    r.ok = r.s1.n === 1 && r.s1.why === 'no press' && r.s1.focus === 'dialog-input' && r.s1.cues === 0 && r.s1.takes === 1 && r.s2.answerA === 'k' && r.s2.openB && !r.s2.held && r.s2.focus === 'sink' && r.s2.owned && r.page === 'pgz';
    return r;
  });
  // ── verify r4: ATTACKS ON r3's RULES ──
  // (attack 2) a box focused, REPLACED and focused again in ONE task (a keyed patch of the For-you row under a broadcast, the
  // box re-created with its key): two reclaims; the gone box is never said (F2) and the box that STAYED is said once. Before
  // (41312584): the first reader consumed the one flag the second needed — reclaimed twice, said never
  out.cueRecreated = await world(async ({ V: [A], D, press, at }) => {
    A.takeover(); await flush();
    const row = new D.El('div', { cls: 'ut-row' }); const btn = new D.El('button', { cls: 'ut-reply-btn' }); row.append(btn); D.body.append(row);
    let b = null;
    btn.addEventListener('mousedown', () => { queueMicrotask(() => { const a = new D.El('textarea', { cls: 'ut-reply-input' }); row.append(a); a.focus(); row.children.splice(row.children.indexOf(a), 1); a.parent = null; b = new D.El('textarea', { cls: 'ut-reply-input' }); row.append(b); b.focus(); }); });
    await press(btn); await flush(); await flush();
    const r = { focus: at(), cues: A.st.cues, forStayed: A.st.cuedFor === b, reclaims: A.st.reclaims };
    r.ok = r.focus === 'sink' && r.cues === 1 && r.forStayed && r.reclaims === 2;
    return r;
  });
  // (attack 2) the user's press ON the box whose focus lands only after USER_PRESS_MS (a render blocked ≥ 250 ms between the
  // press and its focus): 'stale press' — reclaimed and NOT said (the cue is for a press elsewhere). Declared: a mouse press
  // focuses in its own task, a tap re-stamps at its release; the miss needs a blocked main thread
  out.cueStaleSame = await world(async ({ V: [A], ta, D, type, at, clock }) => {
    A.takeover(); await flush();
    D.dispatch(ta, 'pointerdown', { isTrusted: true }); clock.advance(T.USER_PRESS_MS + 100); ta.focus(); await flush(); await flush();
    const r = { focus: at(), cues: A.st.cues, reclaims: A.st.reclaims }; type('pw'); r.page = A.st.page;
    r.ok = r.focus === 'sink' && r.cues === 0 && r.reclaims === 1 && r.page === 'pw';
    return r;
  });
  // (attack 2, the label) a press on the box's LABEL — `<label for>` (its `control`) or a label wrapping the box ("Page name",
  // a passphrase row): the browser focuses the box at the click; that is a press on the box — it YIELDS. Before, 'pressed
  // elsewhere': reclaimed and told to click the box itself
  out.labelPress = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const lab = new D.El('label', { cls: 'field-label' }); const box = new D.El('input', { cls: 'field-box', type: 'text' }); D.body.append(lab, box); lab.control = box;
    lab.addEventListener('pointerup', () => { D.doc.focus(box); }); // the label's activation: its click focuses its control
    const wrap = new D.El('label', { cls: 'wrap-label' }); const txt = new D.El('span', { cls: 'wrap-text' }); const box2 = new D.El('input', { cls: 'wrap-box', type: 'text' }); wrap.append(txt, box2); D.body.append(wrap);
    wrap.addEventListener('pointerup', () => { D.doc.focus(box2); });
    await press(lab); const f1 = at(); type('ab');
    await press(A.img); await press(txt); const f2 = at(); type('cd');
    const r = { f1, v1: box.value, f2, v2: box2.value, page: A.st.page, cues: A.st.cues, reclaims: A.st.reclaims };
    r.ok = r.f1 === 'field-box' && r.v1 === 'ab' && r.f2 === 'wrap-box' && r.v2 === 'cd' && r.page === '' && r.cues === 0 && r.reclaims === 0;
    return r;
  });
  // (attack 3) a FOCUS STORM while yielded — 500 focus moves over rows (a roving list, a drag): the view never moves the focus
  // (no reclaim, no caret move, no loop), whereNow follows every one, the yield stays
  out.focusStorm = await world(async ({ V: [A], D, ta, press, at }) => {
    A.takeover(); await flush();
    await press(ta);
    const rows = []; for (let i = 0; i < 500; i++) { const r = new D.El('div', { cls: 'file-item', tabindex: -1 }); D.body.append(r); rows.push(r); }
    const wheres = new Set(); for (const r of rows) { r.focus(); wheres.add(A.ky.whereNow(D.doc.activeElement)); } await flush();
    const r = { focus: at(), wheres: [...wheres], reclaims: A.st.reclaims, caretMoves: A.st.caretMoves, yielded: A.ky.yielded, owned: KO.keyboardOwned() };
    r.ok = r.focus === 'file-item' && JSON.stringify(r.wheres) === '["none"]' && r.reclaims === 0 && r.caretMoves === 0 && r.yielded && !r.owned;
    return r;
  });
  // (attack 7) TWO views yielded to one press; ONE hands back — the other's yield and the composer's line stay (true for it);
  // the second handback ends everything: no claim is left, the composer focuses as always
  out.twoViewsEnd = await world(async ({ V: [A, B], D, ta, line, press, chatFocus, at }) => {
    A.takeover(); B.takeover(); await flush();
    await press(ta); const both = A.ky.yielded && B.ky.yielded && !line.hidden;
    B.handbackPress(); const afterB = { a: A.ky.yielded, b: B.ky.yielded, line: !line.hidden, yieldedFact: KO.keyboardYielded(), owner: KO.keyboardOwner() };
    A.handbackPress(); const afterA = { a: A.ky.yielded, line: !line.hidden, yieldedFact: KO.keyboardYielded(), owner: KO.keyboardOwner() };
    D.doc.focus(D.body); chatFocus(); const focus = at();
    const r = { both, afterB, afterA, focus };
    r.ok = r.both && r.afterB.a && !r.afterB.b && r.afterB.line && r.afterB.yieldedFact && r.afterB.owner === null && !r.afterA.a && !r.afterA.line && !r.afterA.yieldedFact && r.afterA.owner === null && r.focus === 'composer';
    return r;
  }, { views: 2 });
  // (attack 7) the SOCKET closes while yielded: the view ends the takeover as the server does (viewer-left ⇒ a handback) — the
  // yield ends with the claim, the caret stays where the user put it, the line goes, no claim is left
  out.socketWhileYielded = await world(async ({ V: [A], ta, line, press, at }) => {
    A.takeover(); await flush();
    await press(ta); const before = { yielded: A.ky.yielded, line: !line.hidden };
    A.close();
    const after = { yielded: A.ky.yielded, line: !line.hidden, focus: at(), owner: KO.keyboardOwner(), yieldedFact: KO.keyboardYielded(), mode: A.st.mode };
    const r = { before, after };
    r.ok = r.before.yielded && r.before.line && !r.after.yielded && !r.after.line && r.after.focus === 'composer' && r.after.owner === null && !r.after.yieldedFact && r.after.mode === 'watch';
    return r;
  });
  // (attack 8, the security class) while yielded NOTHING the stream carries moves the caret: a `mode` record re-applied to a
  // view already claimed (renderMode: `if (!ky.yielded) focusSink()`), a hello, a frame — the page has no other way in
  out.streamWhileYielded = await world(async ({ V: [A], ta, press, type, at }) => {
    A.takeover(); await flush();
    await press(ta); type('s1');
    A.takeover(); await flush(); const focus = at(); type('s2'); // the mode record again (still claimed: no reset, no focus)
    const r = { focus, composer: ta.value, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.focus === 'composer' && r.composer === 's1s2' && r.page === '' && r.yielded;
    return r;
  });
  // (the census's control row, verify r4) a <summary>: the press toggles it, the sink takes the focus back, Enter stays the page's
  out.controlSummary = await world(async ({ V: [A], D, press, type, at }) => {
    A.takeover(); await flush();
    const det = new D.El('details', { cls: 'ut-detail-exp' }); const sum = new D.El('summary', { cls: 'ut-sum' }); det.append(sum); D.body.append(det); det.open = false;
    sum.addEventListener('pointerup', () => { det.open = !det.open; });
    await press(sum); await flush(); const focus = at(); type('\n');
    const r = { focus, open: det.open, page: A.st.page, yielded: A.ky.yielded };
    r.ok = r.focus === 'sink' && r.open === true && r.page === '\n' && !r.yielded;
    return r;
  });
  return out;
}

// ═══ §1 THE REAL MODULES ═════════════════════════════════════════════════════
console.log('§1 the real keyboard-yield.js + keyboard-owner.js under the browser\'s event order');
const R = await scenarios(KYreal);
const J = (x) => JSON.stringify(x);
ok(R.userW.ok, 'userW\'s sequence: Take over, a real press on the chat composer, typing — the caret STAYS in the composer, "hello agent" lands there and nothing reaches the page; the takeover continues (mode takeover, mine); keyboardOwned() false, keyboardYielded() true; the line above the composer is on', J(R.userW));
ok(R.script.ok, 'THE PASSWORD GUARD (lane J r2): the attach\'s ChatView.focus stands down and a raw composer.focus() is RECLAIMED — "tomsmith" reaches the PAGE, the composer stays empty, no yield, no line', J(R.script));
ok(R.picture.ok, 'a press on the PICTURE takes the keys back: focus in the sink, "xyz" to the page, the composer keeps what was typed to it, the line goes', J(R.picture));
ok(R.bar.ok, 'a press on the view\'s BAR takes them back too (the button takes its default focus, then the sink)', J(R.bar));
ok(R.terminal.ok, 'a TERMINAL: a press on xterm\'s screen focuses its helper textarea (xterm\'s own mousedown) — the same input, so it yields ("terminal"), "ls" reaches the shell', J(R.terminal));
ok(R.synthetic.ok, 'a SYNTHETIC press (isTrusted false) followed by its focus is not the user\'s — reclaimed', J(R.synthetic));
ok(R.pictureThenScript.ok, 'a press on the PICTURE, then a script focuses the composer 20 ms later — reclaimed (the press was not on the composer)', J(R.pictureThenScript));
ok(R.elsewhereThenScript.ok, 'a press on the sidebar / the send button, then a script focuses the composer 30 ms later — reclaimed', J(R.elsewhereThenScript));
ok(R.stale.ok, `a STALE press (the composer pressed, its focus ${T.USER_PRESS_MS + 150} ms later by script) — reclaimed`, J(R.stale));
ok(R.touch.ok, 'a TOUCH tap held 400 ms: its focus lands at the tap\'s END — the release re-stamps the press, it yields', J(R.touch));
ok(R.twoViews.ok, 'TWO views driving: the last claim owns; one press on the composer yields BOTH (per claim); a press on A\'s picture gives the keys to A (it re-claims), then B\'s to B', J(R.twoViews));
ok(R.handback.ok, 'a HANDBACK while yielded ends the yield with the claim (the line goes); the next takeover owns the keys from its first moment', J(R.handback));
ok(R.follow.ok, 'while yielded the words follow the user (chat → terminal) and a focus the user\'s keys moved is never reclaimed', J(R.follow));
ok(R.ownTab.ok, 'verify r1 (K3): yielded, a press on the view\'s OWN TAB (outside its root, the caret left in the composer) takes the keys back — the sink takes the caret, "pw" reaches the page, the composer keeps only "hi"', J(R.ownTab));
ok(R.alreadyFocused.ok, 'verify r1: the caret ALREADY in the composer when the view owns again (minimized, the composer pressed, restored) — a real press on the composer makes no focusin and still YIELDS: "hi" lands in the composer, nothing in the page, the line says so', J(R.alreadyFocused));
ok(R.alreadyFocusedGuard.ok, 'verify r1: …judged at the press it stays the password guard — a synthetic press on the focused composer, or a real press elsewhere, never yields ("pw" to the page)', J(R.alreadyFocusedGuard));
ok(R.hiddenTab.ok, 'verify r1 (K3): a press on the view\'s tab while it is OFF SCREEN still ends the yield — back on screen it owns the keys ("pw" to the page)', J(R.hiddenTab));
ok(R.h1PressHidden.ok, 'verify r2 (H1): the view MINIMIZED, a real press on the composer, typing, the view RESTORED — the press yielded (the takeover is his while the view is off screen): at the restore, before any key, the caret is still the composer\'s, keyboardYielded() and the line say so; "c2" lands in the composer, nothing in the page', J(R.h1PressHidden));
ok(R.h1ScriptHidden.ok, 'verify r2 (H1): …a SCRIPT\'s caret in the composer while off screen (no press) — the restore moves the CARET to the sink at once (before any key, one move, redrawn), "d2" reaches the page, the composer keeps "d1"', J(R.h1ScriptHidden));
ok(R.h1Reconnect.ok, 'verify r2 (H1): the view\'s STREAM down, a press on the composer yields; the stream back keeps the keys in the composer ("e1e2")', J(R.h1Reconnect));
ok(R.h1Frame.ok, 'verify r2 (H1/H5): a FRAME holding the focus when the view comes back — the caret moves to the sink as for a text box (a frame\'s document takes keys the view never sees)', J(R.h1Frame));
ok(R.belt.ok, 'verify r2 (H1) THE BELT: a return no signal reported — the owner\'s first key reaches neither the composer nor the page, the caret moves to the sink, the next key is the page\'s', J(R.belt));

// ═══ §2 PATCHED-COPY CONTROLS ════════════════════════════════════════════════
console.log('§2 patched-copy controls: each rule removed turns exactly its scenarios red');
const M = mutantCopies('tkbd', REPO);
const KYSRC = fs.readFileSync(path.join(REPO, 'src/lib/keyboard-yield.js'), 'utf8');
const CONTROLS = [
  { tag: 'no-press', why: 'the yield ignores the press (every focus reclaimed — userW\'s bug)', from: 'const u = userPressFocus({ press: p, sameInput: !!p && sameInput(p.target, el), focusAt: now() }), byUserPress = u.byUserPress;', to: 'const u = userPressFocus({ press: p, sameInput: !!p && sameInput(p.target, el), focusAt: now() }), byUserPress = false;', red: ['userW', 'picture', 'bar', 'terminal', 'touch', 'twoViews', 'handback', 'follow', 'ownTab', 'hiddenTab', 'h1PressHidden', 'h1Reconnect', 'n1Xpra', 'n1Vnc', 'n1Stream', 'q1Cue', 'homeGone', 'widgetYielded', 'textSearch', 'textCm', 'labelPress', 'focusStorm', 'twoViewsEnd', 'socketWhileYielded', 'streamWhileYielded', 'dialogYielded', 'dialogConfirmOverYieldHidden', 'textPassword'] }, // (verify r4: every scenario that needs the yield; lane dialog-keys: a dialog opened FROM a yield)
  { tag: 'any-input', why: 'a same-input check that matches anything (the password guard gone)', from: 'export function sameInput(pressed, focused) {\n  if (!pressed || !focused) return false;', to: 'export function sameInput(pressed, focused) {\n  return true;', red: ['elsewhereThenScript', 'alreadyFocusedGuard', 'q1Cue', 'helperCopy', 'cueRecreated'] }, // (verify r3: the copy fallback's scratch box would take the keys too; lane dialog-keys: a dialog is judged at its OPEN by the opener, never by the same-input rule — no dialog leg here) (a press INSIDE the view is never remembered — pictureThenScript stays green by that rule, not this one)
  { tag: 'no-restamp', why: 'the touch tap\'s release does not re-stamp the press', from: '      if (s.press && e.target === s.press.target && e.isTrusted === true) s.press.at = now();\n', to: '', red: ['touch'] },
  { tag: 'trust-any', why: 'a synthetic press counts as the user\'s', from: 's.press = { target: e.target, at: now(), trusted: e.isTrusted === true };', to: 's.press = { target: e.target, at: now(), trusted: true };', red: ['synthetic', 'alreadyFocusedGuard'] },
  { tag: 'no-chrome', why: 'verify r1 K3 pre-fix: only the view\'s root counts (its tab is "elsewhere")', from: 'const namesView = (el) => { if (inView(el)) return true; try { return !!el && !!ownChrome(el); } catch { return false; } };', to: 'const namesView = (el) => inView(el);', red: ['hiddenTab', 'ownTab'] },
  { tag: 'no-press-focused', why: 'verify r1 pre-fix: a press on the text box that already holds the caret is never judged', from: '    onPressFocused(active) {\n', to: '    onPressFocused(active) { return null;\n', red: ['alreadyFocused'] },
  { tag: 'hidden-keeps', why: 'verify r1 K3 pre-fix: a press while the view is off screen is ignored', from: '      if (s.yielded && namesView(e.target)) {', to: '      if (s.yielded && namesView(e.target) && driving()) {', red: ['hiddenTab'] },
  // verify r2 (H1)
  { tag: 'h1-no-mine', why: 'verify r2 H1 pre-fix: a press while the takeover is mine but the view does not drive is not judged', from: '      if (!driving() && !isMine()) { s.press = null; return null; }', to: '      if (!driving()) { s.press = null; return null; }', red: ['h1PressHidden', 'h1Reconnect', 'homeGone'] },
  { tag: 'h1-no-move', why: 'verify r2 H1 pre-fix: a transition to the page leaves the caret where it was (the keys merely routed)', from: 'const r = keyboardTransition({ was: s.last, now: { owns, yielded, dialog }, caretOutside: caretOutside(active) });', to: 'const r = keyboardTransition({ was: s.last, now: { owns, yielded, dialog }, caretOutside: false });', red: ['h1ScriptHidden', 'h1Frame', 'hiddenTab'] },
  { tag: 'h1-frame-blind', why: 'verify r2 H1/H5: a frame holding the focus is not a caret outside', from: 'const caretOutside = (el) => !!el && el !== sink && !inView(el) && (takesKeys(el) || isFrame(el));', to: 'const caretOutside = (el) => !!el && el !== sink && !inView(el) && takesKeys(el);', red: ['h1Frame'] },
  { tag: 'h1-belt-blind', why: 'verify r2 H1: the belt never sees the caret outside', from: '    caretOutside,\n', to: '    caretOutside: () => false,\n', red: ['belt'] },
  // verify r2 (N1)
  { tag: 'home-kept', why: 'verify r2 H1b\' pre-fix: a yield outlives its home', from: '      const v = yieldHomeVerdict({ yielded: s.yielded, drivesNow: !!drives, drovePrev, homeVisible });', to: "      const v = 'keep';", red: ['homeGone', 'homeHidden'] },
  { tag: 'q1-no-cue', why: 'verify r2 Q1 pre-fix: a reclaim is never said', from: '    takeCue(el) { const c = !!el && s.cue === el && el.isConnected !== false; if (s.cue === el) s.cue = null; if (c) s.lastCueAt = now(); return c; },', to: '    takeCue() { return false; },', red: ['q1Cue', 'cueRecreated'] },
  { tag: 'cue-gone-said', why: 'verify r3 F2 pre-fix: a box already gone at the reclaim is announced', from: '    takeCue(el) { const c = !!el && s.cue === el && el.isConnected !== false; if (s.cue === el) s.cue = null; if (c) s.lastCueAt = now(); return c; },', to: '    takeCue(el) { const c = !!s.cue; s.cue = null; if (c) s.lastCueAt = now(); return c; },', red: ['helperCopy', 'cueRecreated'] }, // (verify r4: the bare flag also says the gone box and drops the one that stayed — two cues where one is due, in the wrong place)
  // verify r4
  { tag: 'cue-flag', why: 'verify r4 pre-fix: the cue is one flag any reader consumes (a replaced box\'s reader eats the staying box\'s cue)', from: '    takeCue(el) { const c = !!el && s.cue === el && el.isConnected !== false; if (s.cue === el) s.cue = null; if (c) s.lastCueAt = now(); return c; },', to: '    takeCue(el) { const c = !!s.cue && !(el && el.isConnected === false); s.cue = null; if (c) s.lastCueAt = now(); return c; },', red: ['cueRecreated'] },
  { tag: 'no-label', why: 'verify r4 pre-fix: a press on the box\'s label is a press elsewhere', from: "  try { const lab = typeof pressed.closest === 'function' ? pressed.closest('label') : null; if (lab && (lab.control === focused || (typeof lab.contains === 'function' && lab.contains(focused)))) return true; } catch { /* detached */ }\n", to: '', red: ['labelPress'] },
  { tag: 'n1-no-host', why: 'verify r2 N1 pre-fix: only xterm\'s screen is one input with its text box', from: "const INPUT_HOSTS = '.xterm, .picture-shell';", to: "const INPUT_HOSTS = '.xterm';", red: ['n1Xpra'] },
  // verify r3 (the input-surface census: a text box's own rules)
  { tag: 'no-xterm-host', why: 'verify r3: a terminal\'s screen is not one input with its helper textarea', from: "const INPUT_HOSTS = '.xterm, .picture-shell';", to: "const INPUT_HOSTS = '.picture-shell';", red: ['terminal'] },
  { tag: 'no-contenteditable', why: 'verify r3: a contenteditable (CodeMirror) is not a text box', from: '  if (el.isContentEditable) return true;\n', to: '', red: ['textCm'] },
  { tag: 'no-search-type', why: 'verify r3: an <input type=search> is not a text box', from: "const TEXT_INPUT_TYPES = new Set(['', 'text', 'search',", to: "const TEXT_INPUT_TYPES = new Set(['', 'text',", red: ['textSearch'] },
  // lane takeover-surface-census (the vault's surfaces)
  { tag: 'no-password-type', why: 'lane takeover-surface-census: an <input type=password> is not a text box (the vault\'s second password)', from: "'tel', 'password', 'number'", to: "'tel', 'number'", red: ['textPassword', 'dialogPassword'] },
  { tag: 'no-readonly', why: 'lane takeover-surface-census: a read-only field counts as a text box (a press yields to a box that takes no typing)', from: "TEXT_INPUT_TYPES.has(String(el.type || '').toLowerCase()) && !el.readOnly && !el.disabled;", to: "TEXT_INPUT_TYPES.has(String(el.type || '').toLowerCase()) && !el.disabled;", red: ['controlReadonly'] },
  // verify r3 (the sink's blur)
  { tag: 'where-kind', why: 'verify r3 (r2\'s held) pre-fix: the chip names the text box the keys were given to, wherever the focus went', from: "      if (active && active !== sink && !inView(active)) { if (takesKeys(active)) return yieldKindOf(active); if (isFrame(active)) return 'other'; }\n      return 'none';", to: '      return s.kind;', red: ['widgetYielded', 'focusStorm'] },
  { tag: 'no-choice', why: 'verify r3 F1 pre-fix: a <select> is taken back like any other focus (its list closes)', from: "export function isChoiceControl(el) { try { return !!el && el.nodeType === 1 && el.tagName === 'SELECT' && !el.disabled; } catch { return false; } }", to: 'export function isChoiceControl(el) { return false; }', red: ['choiceSelect'] }, // (lane dialog-keys: a <select> in a dialog he opened is the dialog's — no choice rule there)
  { tag: 'blur-frame-blind', why: 'verify r3: a frame is taken back like any other focus (never said)', from: "  try { if (isFrame(a) && !(root && root.contains(a))) return 'frame'; } catch { /* detached */ }", to: '', red: ['frameSink'] },
  { tag: 'blur-keeps-all', why: 'verify r3: the sink never takes a focus back (a press on a control / list / frame keeps it)', from: "  if (isEditable(a) || isChoiceControl(a)) return 'keep';", to: "  return 'keep';", red: ['frameSink', 'controlCheckbox', 'widgetList', 'textCm', 'controlSummary', 'dialogScript', 'dialogSynthetic', 'dialogPicture', 'dialogStale', 'dialogAppKey', 'controlReadonly', 'controlChip'] }, // (textCm: the gutter's scroller would keep the focus; lane dialog-keys: a dialog that opened BY ITSELF keeps its OK button's focus — its Enter would answer it)
  { tag: 'n1-no-video', why: 'the .299 integration pre-fix: the stream\'s <video> is not a place keys go', from: 'export function isKeyboardSurface(el) { return isPictureCanvas(el) || isStreamVideo(el); }', to: 'export function isKeyboardSurface(el) { return isPictureCanvas(el); }', red: ['n1Stream'] },
  { tag: 'n1-no-surface', why: 'verify r2 N1 pre-fix: noVNC\'s canvas is not a place keys go', from: "  try { return !!el && el.nodeType === 1 && el.tagName === 'CANVAS' && typeof el.closest === 'function' && !!el.closest('.picture-shell'); } catch { return false; }", to: '  return false;', red: ['n1Vnc', 'n1Script'] },
  // lane dialog-keys: a dialog the user's own act opened takes the keys; one that opens by itself never does
  { tag: 'dialog-no-rule', why: 'lane dialog-keys pre-fix: every modal judged as opening by itself (taken back, said) — Enter reaches the page', from: 'const v = dialogVerdict({ owns: driving(), yielded: s.yielded, held, byUserPress: o.byUserPress, opener: \'app\' });', to: 'const v = dialogVerdict({ owns: driving(), yielded: s.yielded, held, byUserPress: false, opener: \'app\' });', red: ['dialogUserPress', 'dialogYielded', 'dialogNested', 'dialogScriptClose', 'dialogTwoViews', 'dialogAppKey', 'dialogChain', 'dialogFocusless', 'dialogSelect', 'dialogStatic', 'dialogBackGone', 'dialogSelfOverHeld', 'dialogThreeMiddleGone', 'dialogTouchHeld', 'dialogConfirmOverYieldHidden', 'dialogOneActOneDialog', 'dialogPassword'] },
  { tag: 'dialog-trust-any', why: 'lane dialog-keys: a synthetic press counts as the opener (the isTrusted check gone)', from: 's.opener = { at: now(), trusted: e.isTrusted === true, picture: onPicture(e.target) };', to: 's.opener = { at: now(), trusted: true, picture: onPicture(e.target) };', red: ['dialogSynthetic'] },
  { tag: 'dialog-app-key-any', why: 'lane dialog-keys: a synthetic key counts as the app\'s', from: '    onAppKey(e) { if (e && e.isTrusted === true)', to: '    onAppKey(e) { if (e)', red: ['dialogAppKey'] },
  { tag: 'dialog-no-picture', why: 'lane dialog-keys: a press on the picture (the page\'s) counts as the opener', from: 'const onPicture = (el) => { try { return !!el && !!picture && (el === picture || picture.contains(el)); } catch { return false; } };', to: 'const onPicture = () => false;', red: ['dialogPicture'] },
  { tag: 'dialog-orphan', why: 'lane dialog-keys: a closed dialog never leaves the stack (an orphan hold — the keys never come back)', from: '      const open = heldOpen();\n', to: '      const open = s.holds;\n', red: ['dialogUserPress', 'dialogYielded', 'dialogNested', 'dialogScriptClose', 'dialogTwoViews', 'dialogAppKey', 'dialogChain', 'dialogFocusless', 'dialogSelect', 'dialogStatic', 'dialogBackGone', 'dialogThreeMiddleGone', 'dialogConfirmOverYieldHidden', 'dialogOneActOneDialog'] }, // (verify r1: dialogSelfOverHeld stays green — the self-opened modal was never held, the nowhere rule alone answers it)
  { tag: 'dialog-back-base', why: 'lane dialog-keys: the newest\'s close skips the older dialog (nothing returns to it)', from: '      const back = all.filter((h) => !open.includes(h)).reverse().map((h) => h.back).find(inOpen) || null;', to: '      const back = null;', red: ['dialogNested'] },
  { tag: 'dialog-home-active', why: 'lane dialog-keys: a dialog opened from a yield returns to whatever held the focus (the button pressed), not the yield\'s text box', from: 'el: active && active !== sink && !inView(active) && takesKeys(active) ? active : s.home }', to: 'el: active }', red: ['dialogYielded', 'dialogConfirmOverYieldHidden'] },
  { tag: 'dialog-no-cue', why: 'lane dialog-keys: a modal that opened by itself is taken back silently', from: '      if (!dialogReclaimCue({ verdict, at: now(), lastCueAt: s.lastCueAt })) return false;\n', to: '      return false;\n', red: ['dialogScript', 'dialogSynthetic', 'dialogPicture', 'dialogStale', 'dialogAppKey', 'dialogPassword'] },
  // lane dialog-keys verify r1: the keys never fall to nowhere while a dialog holds
  { tag: 'dialog-nowhere-stays', why: 'verify r1 pre-fix: a settle that closed nothing moves nothing — the focus fallen to <body> (a self-opened modal answered over the held one) stays there, the typing goes nowhere', from: "      if (open.length === all.length) return nowhere(active) ? { to: 'older', el: top.overlay } : null;", to: '      if (open.length === all.length) return null;', red: ['dialogSelfOverHeld'] },
  // verify r1 K6: the three parts the revert table found no scenario for
  { tag: 'dialog-no-up-restamp', why: 'verify r1 K6: the opener is not re-stamped at the release — a touch tap held past 250 ms opens a dialog judged stale', from: "      if (e.isTrusted === true) s.opener = { at: now(), trusted: true, picture: onPicture(e.target) };", to: '', red: ['dialogTouchHeld'] },
  { tag: 'dialog-settle-no-keep', why: 'verify r1 K6: settle ignores a held dialog — a confirm over a yield, the view hidden and shown, is judged homeless and the sink steals the keys', from: "      if (s.holds.length) return 'keep'; // lane dialog-keys", to: "      if (false) return 'keep'; // lane dialog-keys", red: ['dialogConfirmOverYieldHidden'] },
  { tag: 'dialog-opener-unspent', why: 'verify r1 K6: the opener is not spent at a take — a modal opening by itself inside the same 250 ms is held too (two dialogs for one act)', from: "      s.holds.push({ overlay: ov, back: held ? active : null });\n      s.opener = null;", to: "      s.holds.push({ overlay: ov, back: held ? active : null });", red: ['dialogOneActOneDialog'] },
];
for (const c of CONTROLS) {
  const found = KYSRC.split(c.from).length === 2;
  let red = null;
  if (found) {
    const f = M.write('src/lib/keyboard-yield.js', KYSRC.replace(c.from, c.to), c.tag, { esm: true });
    const Rm = await scenarios(await import(pathToFileURL(f).href));
    red = Object.keys(Rm).filter((k) => !Rm[k].ok).sort();
  }
  ok(found && J(red) === J([...c.red].sort()), `NEGATIVE CONTROL (${c.tag} — ${c.why}): exactly ${c.red.join(', ')} go red`, J({ found, red }));
}
// the real module under the same harness is all green (the controls judge the rule, not the harness)
ok(R.h3Hide.ok, 'verify r2 (H3): Shift + x HELD in the page when the view goes off screen — both let go there at the transition (the last pressed first), nothing more at the return', J(R.h3Hide));
ok(R.h3Stream.ok, 'verify r2 (H3): a key held when the stream goes down — let go at the transition', J(R.h3Stream));
ok(R.h3Handback.ok, 'verify r2 (H3): a key held when the user presses Hand back — let go BEFORE the handback (after it this viewer\'s input is refused)', J(R.h3Handback));
ok(R.n1Xpra.ok, 'verify r2 (N1): a real press on a DESKTOP APP\'s picture (the xpra pane focuses its IME textarea) yields — "ls" reaches the app, nothing the page', J(R.n1Xpra));
ok(R.n1Vnc.ok, 'verify r2 (N1): a real press on the DESKTOP\'s picture (noVNC focuses its canvas) yields — nothing reaches the page', J(R.n1Vnc));
ok(R.n1Stream.ok, 'the .299 integration (N1 for the stream): a real press on the paired machine\'s STREAM (<video class="stream-video">) yields — nothing reaches the page', J(R.n1Stream));
ok(R.n1Script.ok, 'verify r2 (N1): the password guard on both — a script\'s focus on the noVNC canvas or the xpra IME is reclaimed, "pw" reaches the page', J(R.n1Script));
ok(R.q1Cue.ok, 'verify r2 (Q1): a BUTTON of the user\'s that focuses the composer (the expand button) is still reclaimed — and SAID, once per RECLAIM_CUE_MS; a script\'s focus and a stale press never; the advice works (a press on the box itself yields, "ok" lands there)', J(R.q1Cue));
ok(R.homeGone.ok, 'verify r2 (H1b\'): pressed on ANOTHER desktop while the view was off screen, back on the view\'s desktop the chat box is hidden and the caret fell to <body> — the yield ENDS (its home is gone): the caret to the sink, "k2" to the page, the chat box keeps "k1"', J(R.homeGone));
ok(R.homeHidden.ok, 'verify r2 (H1b\'): …a hidden chat box still holding the focus is no home either — the caret moves to the sink, "k2" to the page', J(R.homeHidden));
ok(R.choiceSelect.ok, 'verify r3 (F1): a press on a <select> while you drive — its list is the pointer\'s: the sink never takes the focus from it (the list stays open), its keys stay the page\'s ("pw" to the page)', J(R.choiceSelect));
ok(R.frameSink.ok, 'verify r3 (the census\'s frame row): a press into a FRAME is the frame document\'s — the sink takes the focus back and says so once; "wv" reaches the page', J(R.frameSink));
ok(R.controlCheckbox.ok, 'verify r3 (the census\'s control row): a press on a checkbox — the pointer works, the sink takes the focus back, the keys stay the page\'s, nothing said', J(R.controlCheckbox));
ok(R.widgetList.ok, 'verify r3 (the census\'s widget row, declared): a press on a keyboard-navigable list takes no keys while you drive — the sink takes the focus back, "pw" reaches the page', J(R.widgetList));
ok(R.helperCopy.ok, 'verify r3 (F2): "Copy Path" on plain http — the copy fallback\'s scratch textarea (appended, selected, copied, removed in one task) is taken back and NEVER announced (no box to click); the Q1 cue for a box that stays is unchanged', J(R.helperCopy));
ok(R.widgetYielded.ok, 'verify r3 (r2\'s held): yielded, a press on the chat\'s message list (its container takes the focus, no keys) — the yield stays, whereNow says "none" (the chip: not in a text box), "nn" goes nowhere; a press back on the composer says "chat"', J(R.widgetYielded));
ok(R.textSearch.ok, 'verify r3 (the census\'s text row): a SEARCH box (<input type=search> — the palette, the pickers) yields to the user\'s own press; "ab" lands in it', J(R.textSearch));
ok(R.textCm.ok, 'verify r3 (the census\'s text row): the CODE EDITOR — a press on a line yields to CodeMirror\'s .cm-content ("zz" in the doc); a press on its gutter focuses the scroller, the sink takes it back ("g" to the page — without a takeover the gutter takes no typing either)', J(R.textCm));
ok(R.noneCanvas.ok, 'verify r3 (the census\'s none row): a chart\'s canvas takes no keys — a press on it leaves them the page\'s; only a picture shell\'s canvas is a keyboard surface', J(R.noneCanvas));
ok(R.textPassword.ok, 'lane takeover-surface-census (the census\'s text row): a PASSWORD box (the vault\'s second password) yields to the user\'s own press; "s3" lands in it, the page gets nothing', J(R.textPassword));
ok(R.controlReadonly.ok, 'lane takeover-surface-census (the census\'s control row): a READ-ONLY field (the Vault window\'s shown value) takes no typing — the sink takes the focus back, the keys stay the page\'s, nothing said', J(R.controlReadonly));
ok(R.controlChip.ok, 'lane takeover-surface-census (the census\'s control row): a role=button CHIP (tabindex 0 — the stream stats chip) works by the press, the sink takes the focus back, its Enter stays the page\'s', J(R.controlChip));
// ── verify r4: attacks on r3's rules ──
ok(R.cueRecreated.ok, 'verify r4 (attack 2): a box focused, REPLACED and focused again in one task (a keyed patch) — the gone box never said, the box that stayed said ONCE (before: reclaimed twice, said never — the one flag consumed by the wrong reader)', J(R.cueRecreated));
ok(R.cueStaleSame.ok, 'verify r4 (attack 2, declared): a press ON the box whose focus lands after USER_PRESS_MS (a blocked render) is reclaimed and not said — the cue is for a press elsewhere', J(R.cueStaleSame));
ok(R.labelPress.ok, 'verify r4 (attack 2): a press on the box\'s LABEL (<label for>, or a label wrapping it) is a press on the box — it YIELDS ("ab" / "cd" land there), nothing said (before: reclaimed, "click the text box itself")', J(R.labelPress));
ok(R.focusStorm.ok, 'verify r4 (attack 3): 500 focus moves over a list while yielded — the view moves no focus (0 reclaims, 0 caret moves, no loop), whereNow follows, the yield stays', J(R.focusStorm));
ok(R.twoViewsEnd.ok, 'verify r4 (attack 7): two views yielded to one press; one hands back — the other\'s yield and the composer\'s line stay (true for it); the second handback leaves no claim, the composer focuses as always', J(R.twoViewsEnd));
ok(R.socketWhileYielded.ok, 'verify r4 (attack 7): the socket closes while yielded — the takeover ends as the server ends it, the yield with it, the caret stays in the composer, the line goes, no claim is left', J(R.socketWhileYielded));
ok(R.streamWhileYielded.ok, 'verify r4 (attack 8): a mode record re-applied while yielded moves no caret — the stream has no way to the keys (renderMode keeps its hands off while yielded)', J(R.streamWhileYielded));
ok(R.controlSummary.ok, 'verify r4 (the census\'s control row): a <summary> toggles by the press, the sink takes the focus back, Enter stays the page\'s', J(R.controlSummary));
// ── lane dialog-keys: a dialog your own act opened takes the keys; one that opens by itself never does ──
ok(R.dialogUserPress.ok, 'lane dialog-keys (THE RULE): Take over, a real press on a menu\'s Delete opens the confirm — it TAKES the keys (its own focus on OK stays, the chip says "in the dialog", nobody owns, Shift held in the page let go); Enter ANSWERS it and the page gets nothing; its close gives the keys back to the page ("x"), nothing said, the takeover went on', J(R.dialogUserPress));
ok(R.dialogScript.ok, 'lane dialog-keys (THE PASSWORD GUARD): a confirm that opens BY ITSELF while "pw" is typed into the page is TAKEN BACK (its Enter is the page\'s, it stays open) and SAID once; an input dialog opening by itself a second later gets none of the typing, not said again', J(R.dialogScript));
ok(R.dialogSynthetic.ok, 'lane dialog-keys (a script cannot fake the opener): a SYNTHETIC press (isTrusted false) that opens the confirm is not the user\'s — taken back and said, its Enter the page\'s', J(R.dialogSynthetic));
ok(R.dialogPicture.ok, 'lane dialog-keys: a press on the PICTURE went to the page — a confirm opening by itself 50 ms later is not his: taken back and said', J(R.dialogPicture));
ok(R.dialogStale.ok, `lane dialog-keys (declared): a confirm opening ${T.USER_PRESS_MS + 150} ms after the user\'s release (a slow fetch) is judged as opening by itself — taken back and said`, J(R.dialogStale));
ok(R.dialogPassword.ok, `lane takeover-surface-census: 「验证是你」 opened in the press's own task TAKES the keys (the second password in its box, the page nothing); opened ${T.USER_PRESS_MS + 150} ms late (a hub round trip) it is a stale press — taken back, said, the typing the PAGE's: why Show key… asks first`, J(R.dialogPassword));
ok(R.dialogYielded.ok, 'lane dialog-keys: YIELDED to the composer, a press on a chat button opens an input dialog — it takes the keys ("nm" + Enter answer it), its close gives them back to the COMPOSER (the yield\'s home): "!" lands there, the line is on, the chip says the chat; the page gets nothing', J(R.dialogYielded));
ok(R.dialogNested.ok, 'lane dialog-keys: a confirm OVER an input dialog — the newest holds; its close returns to the older (what held the caret when it opened); the older\'s close returns to the page ("z")', J(R.dialogNested));
ok(R.dialogScriptClose.ok, 'lane dialog-keys (no orphan hold): a dialog he opened REMOVED by a script returns the keys to the page ("q"); the OLDER of two removed by a script — the newest still holds, its close returns to the page ("r")', J(R.dialogScriptClose));
ok(R.dialogTwoViews.ok, 'lane dialog-keys: two views driving — one press opens the confirm, BOTH give it the keys (nobody owns); its close gives them back as they were (B owns, B\'s sink, "b" to B\'s page)', J(R.dialogTwoViews));
ok(R.dialogAppKey.ok, 'lane dialog-keys: a key the APP took (command mode) opens an input dialog — his act, it takes the keys ("3x3" + Enter); a SYNTHETIC key is not his (the next dialog taken back, said)', J(R.dialogAppKey));
ok(R.dialogChain.ok, 'lane dialog-keys: Enter answers his dialog and its answer opens the next ("Overwrite?") — the Enter typed into his dialog is his act: the next one takes the keys too ("ok" + Enter), the page gets nothing', J(R.dialogChain));
ok(R.dialogFocusless.ok, 'lane dialog-keys: a dialog he opened that focuses nothing itself gets the keys a tick later — its first text box ("k" + Enter), else its overlay (never a button he did not choose: Enter answers it)', J(R.dialogFocusless));
ok(R.dialogSelect.ok, 'lane dialog-keys: a <select> in a dialog he opened keeps the focus of his press (nothing takes it back while the dialog holds), its key never reaches the page; a press on OK answers it and the keys go back to the page', J(R.dialogSelect));
ok(R.dialogStatic.ok, 'lane dialog-keys: the STATIC overlay (#dialog-overlay: shown by its class and announced, closed by the class) — its box takes "/w", hidden it gives the keys back to the page ("z")', J(R.dialogStatic));
ok(R.dialogPageBar.ok, 'lane dialog-keys: the agent\'s PAGE dialog on the live view\'s own bar is no app modal — announced or not, never taken; the view keeps the keys', J(R.dialogPageBar));
ok(Object.values(R).every((r) => r.ok) && Object.keys(R).length === 74, `…and the real module passes all ${Object.keys(R).length} scenarios under the same harness`);
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: CONTROLS.length, label: '§2 ' })) ok(r.pass, r.name, r.detail);

// ═══ §3 WIRING PINS ═══════════════════════════════════════════════════════════
console.log('§3 wiring: the live view registers the three listeners and acts as this harness does; the composer\'s line; the words');
const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const LW = src('src/lib/browser-live-window.js');
ok(/import \{ createKeyboardYield, isEditable, sinkBlurVerdict \} from '\.\/keyboard-yield\.js';/.test(LW) && !/\nfunction isEditable\(/.test(LW) && /const ky = createKeyboardYield\(\{ root, sink: kbd, drives: \(\) => drivesKeyboard\(\), mine: \(\) => !!st\.claimed && !st\.closed, ownChrome: namesThisView, picture: canvas \}\);/.test(LW),
  'the live view builds its yield from keyboard-yield.js over its root + sink + picture (ONE isEditable — the view\'s own copy is gone; lane dialog-keys: a press on the picture is the page\'s)');
/** one registration's text: from `document.addEventListener('<ev>', (e) => {` to the end of its call (`\n  }, …);` or a one-liner's `);`) */
const reg = (ev) => { const i = LW.indexOf(`document.addEventListener('${ev}', (e) => {`); if (i < 0) return ''; const nl = LW.indexOf('\n', i); const one = LW.slice(i, nl); if (/\);( \/\/.*)?$/.test(one) && !/\{\s*$/.test(one)) return one; const j = LW.indexOf('\n  }, ', i); const e = j < 0 ? -1 : LW.indexOf('\n', j + 1); return LW.slice(i, e < 0 ? i + 1200 : e); };
const pd = reg('pointerdown'), pu = reg('pointerup'), fi = reg('focusin');
ok(/const r = ky\.onPointerDown\(e\);\n    \/\/ verify r1: a press on the text box that ALREADY holds the caret \(no focusin follows\) yields right here\n    if \(r === 'noted'\) \{ if \(st\.claimed && !st\.copying && ky\.onPressFocused\(document\.activeElement\) === 'yield'\) \{ releaseHeld\(\); renderKbd\(\); keyboardChanged\(\); \} return; \}\n    if \(r !== 'resumed' && r !== 'press-view'\) return;\n    claimKeyboard\(claimRec\(\)\);\n    if \(r === 'resumed'\) \{ renderKbd\(\); keyboardChanged\(\); \}/.test(pd) && /const a = document\.activeElement; if \(!st\.closed && !st\.copying && iOwn\(\) && a !== kbd && !\(isEditable\(a\) && root\.contains\(a\)\)\) focusSink\(\); \}, 0\);/.test(pd) && /\{ capture: true, passive: true, signal: winInfo\._listenerCtl\?\.signal \}\)/.test(pd),
  'pointerdown (document, capture, passive, the window\'s signal): the press to the yield; inside the view ⇒ re-claim, a resumed yield re-said, the sink after the press\'s own default', pd.slice(0, 600));
ok(/function namesThisView\(el\) \{\n    try \{\n      const named = /.test(LW) && /el\.closest\('\.tab-item\[data-win-id\], \.taskbar-item\[data-win-id\]'\)/.test(LW) && /if \(named\) return named\.dataset\.winId === winInfo\.id;/.test(LW) && /const alone = !ch \|\| !Array\.isArray\(ch\.tabs\) \|\| ch\.tabs\.length < 2;\n      return alone && !!winInfo\.titleBar && winInfo\.titleBar\.contains\(el\);/.test(LW),
  'verify r1 (K3): what NAMES the view outside its root — its own tab / taskbar button (by window id, never another window\'s), its title bar only while it stands alone (a group\'s title bar is shared)');
ok(/ky\.onPointerUp\(e\);/.test(pu) && /\{ capture: true, passive: true, signal: winInfo\._listenerCtl\?\.signal \}\)/.test(pu), 'pointerup (document, capture): the touch tap\'s re-stamp', pu.slice(0, 300));
ok(/if \(!st\.claimed \|\| st\.copying \|\| \(H && e\.target === addrInput\)\) return;/.test(fi) && /const v = ky\.onFocusIn\(e\);\n    if \(v === 'yield'\) \{ releaseHeld\(\); renderKbd\(\); keyboardChanged\(\); return; \}\n    if \(v !== 'reclaim' \|\| !iOwn\(\)\) \{ if \(ky\.yielded\) renderKbd\(\); return; \}[^\n]*\n    st\.reclaims\+\+;\n/.test(fi) && /\}, capture\);/.test(fi) && (fi.match(/showToast/g) || []).length === 1 && /const taken = e\.target;\n    queueMicrotask\(\(\) => \{ const say = ky\.takeCue\(taken\); focusSink\(\); if \(say\) \{ st\.cues\+\+; showToast\(t\('Typing still goes to the browser — click the text box itself to type there'\), \{ duration: 3500 \}\); \} \}\);/.test(fi),
  'focusin (document, capture): every driving view yields to the user\'s press; ONLY the owner reclaims a focus nobody pressed for — silently (the lane-J toast told the user to Hand back, which is no longer true); verify r2 (Q1): the ONE toast is the cue after a reclaim the user\'s own press elsewhere caused', fi.slice(0, 900));
ok(!/press Hand back to type here/.test(LW) && !/lastReclaimHintAt|RECLAIM_HINT_EVERY_MS/.test(LW), '…the reclaim toast and its rate limiter are gone');
{ // verify r1 (K7): the retired pop-up has NO producer left anywhere that ships — a census, not one file (src/, public/, data/bin/)
  const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const shipped = [...walk('src'), ...walk('data/bin').filter((f) => !/\/(editor|vibespace-status$)/.test(f)), 'public/index.html'].filter((f) => /\.(m?js|html)$|^data\/bin\/[^.]+$/.test(f));
  const RETIRED = ['press Hand back to type here', 'ここで入力するには「戻す」を押してください', '按“交还控制”后才能在这里输入'];
  const hitsIn = (files) => files.filter((f) => { let t = ''; try { t = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { return false; } return RETIRED.some((w) => t.includes(w)); });
  const hits = hitsIn(shipped);
  const control = hitsIn(['scripts/test-takeover-keyboard.mjs']).length === 1; // the census sees the words where they ARE (this file names them)
  ok(shipped.length > 100 && hits.length === 0 && control, `verify r1 (K7): the retired "press Hand back to type here" pop-up (en / ja / zh) has no producer in ${shipped.length} shipped files (control: the census finds them in this suite)`, hits.join(' | '));
}
ok(/import \{ heldReleases \} from '\.\.\/browser-takeover\.js';/.test(LW) && /function releaseHeld\(\) \{ for \(const r of heldReleases\(\[\.\.\.st\.pressed\.values\(\)\]\)\) sendInput\(keyRecord\(r\)\); st\.pressed\.clear\(\); \}/.test(LW),
  'verify r1 (K4): a yield RELEASES in the page what is still held there (PURE heldReleases → the view\'s own input path) before it forgets the held keys');
ok(/const claimRec = \(\) => \(\{ id: winInfo\.id, owns: ownsKeyboard, yielded: yieldedKeyboard \}\);/.test(LW) && /function ownsKeyboard\(\) \{ return keyboardOwnership\(\{ \.\.\.kbFacts\(\), yielded: ky\.yielded, dialog: ky\.dialogHolds \}\)\.owns; \}/.test(LW) && /function drivesKeyboard\(\) \{ return !!st\.claimed && keyboardOwnership\(kbFacts\(\)\)\.owns; \}/.test(LW),
  'the claim: owns() answers false while yielded or while a dialog the user opened holds the keys (so ChatInput / TerminalSession behave normally), yielded() says so');
// the .197 integration: the three pins below read the MERGED lines (browse-yourself's address-row exemption and first-claim caret, lane-pairing r6's wake count)
ok(/if \(first\) \{ st\.claimed = true; st\.sent = 0; st\.pressed\.clear\(\); ky\.reset\('claim'\); claimKeyboard\(claimRec\(\)\); watchDialogs\(\); \}/.test(LW) && /else if \(!ky\.yielded && !ky\.dialogHolds && !\(H && document\.activeElement === addrInput\)\) focusSink\(\);/.test(LW) && /ky\.reset\('release'\); releaseKeyboard\(winInfo\.id\); watchDialogs\(\);/.test(LW) && /ky\.reset\('release'\); keyboardChanged\(\);/.test(LW),
  'a re-render while yielded — or while a dialog the user opened holds the keys — never pulls the focus back; a fresh claim and the release (and a closed window) clear the yield and the dialogs\' watch');
ok(/const dialogHeld = !own && !!st\.claimed && ky\.dialogHolds && !st\.closed;\n    const yielded = !own && st\.claimed && \(yieldedKeyboard\(\) \|\| dialogHeld\);/.test(LW) && /const text = yielded \? yieldChipText\(ky\.whereNow\(document\.activeElement\)\) :/.test(LW) && /if \(kind === 'dialog'\) return t\('Keyboard is in the dialog — it goes back when you answer it'\);/.test(LW) && /document\.addEventListener\('focusout', \(\) => \{ if \(st\.claimed && ky\.yielded\) setTimeout\(\(\) => \{ if \(!st\.closed\) renderKbd\(\); \}, 0\); \}, capture\);/.test(LW) && /priority: key === 'kbd' && st\.claimed && \(ky\.yielded \|\| ky\.dialogHolds\) \? LIVE_BAR_PRIORITY\.badge : LIVE_BAR_PRIORITY\[key\]/.test(LW),
  'the bar says where the keys are while yielded or while a dialog the user opened holds them (in the dialog — they go back when you answer it; the chip patched in place, at the badge\'s fold rank)');
// verify r4 (attack 3): the chip is WRITTEN only on change — a yielded view re-reads it on every focus move (focusout + focusin), and a
// same-text write is a mutation record + an accessibility event (measured: 300 focus moves ⇒ 1 200 records, the words never changing)
ok(/if \(kbdText\.textContent !== text\) kbdText\.textContent = text;\n    if \(kbdChip\.title !== title\) kbdChip\.title = title;/.test(LW), 'verify r4 (attack 3): renderKbd writes the chip\'s words and title only when they CHANGE');
// verify r4 (attack 1, measured): onDocKey ENDS with focusSink() — after any key the sink holds the caret (a <select> that kept the
// focus of a press loses it at the closing key's keyup: its list is closed by then, the next keys are the page's)
ok(/\n    focusSink\(\);\n  \};\n  document\.addEventListener\('keydown', onDocKey, capture\);\n  document\.addEventListener\('keyup', onDocKey, capture\);\n  document\.addEventListener\('keypress', onDocKey, capture\);/.test(LW), 'verify r4 (attack 1): onDocKey ends with focusSink() (keydown / keyup / keypress, capture)');
// verify r4 (attack 7): the socket closing ends the takeover as the server does (viewer-left) — renderMode releases the claim and the yield
ok(/st\.connected = false; renderKbd\(\); syncKeyboard\(\);[^\n]*\n[^\n]*\n[^\n]*\n      if \(st\.mine\) \{ st\.mode = 'watch'; st\.mine = false; st\.holder = null; renderMode\(\); \}/.test(LW), 'verify r4 (attack 7): ws.onclose — the stream down (a transition), then the takeover ended locally: mode watch + renderMode (the claim and its yield released)');
{ // verify r4 (attack 8, the security class): EVERY focusSink() site is guarded — the view owns (iOwn), or not yielded (renderMode), or a
  // transition (settle / moveCaret), or the user's own press on the picture (driving), or a copy of ours; onMessage (the stream) never
  // touches focus — the page has no way to the keys while the user gave them to a text box
  // 2.369.198 integration: the .197 BROWSE YOURSELF rows added four sites the lane's tree never had — his own address box's
  // Enter / Escape (`if (driving()) focusSink()`: his own key, and only while he drives), the touch Keyboard button and the
  // H branch of Continue here (his own click on our own button) — each read inside its OWN handler, like every other site
  const HEADS = ['\n  const onDocKey', '\n  function ', '\n  document.addEventListener(', '\n  kbd.addEventListener(', '\n  img.addEventListener(', '\n  const renderMode', '\n  addrInput.addEventListener(\'keydown\'', '\n  kbdBtn.onclick = ', '\n  takeBtn.onclick = '];
  const userAct = (ctx) => (/^\n  addrInput\.addEventListener\('keydown'/.test(ctx) && /if \(driving\(\)\) $/.test(ctx)) || /^\n  (kbdBtn|takeBtn)\.onclick = /.test(ctx);
  const sites = []; let i = -1; while ((i = LW.indexOf('focusSink();', i + 1)) >= 0) { if (/function focusSink\(\)/.test(LW.slice(i - 30, i))) continue; const head = Math.max(...HEADS.map((h) => LW.lastIndexOf(h, i))); const ctx = LW.slice(head, i); sites.push({ at: LW.slice(0, i).split('\n').length, guarded: /iOwn\(\)|!ky\.yielded|!driving\(\)|ky\.settle\(|r\.moveCaret|st\.copying = false/.test(ctx) || userAct(ctx) }); } // (the guard is read inside the site's OWN handler / function)
  const om = LW.slice(LW.indexOf('  function onMessage(m) {'), LW.indexOf('\n  }\n', LW.indexOf('  function onMessage(m) {')));
  ok(sites.length === 18 && sites.every((s) => s.guarded) && om.length > 2000 && !/focusSink\(|\.focus\(/.test(om), `verify r4 (attack 8): every focusSink() site (${sites.length}) is guarded by ownership / not-yielded / a transition / the user's press / a copy of ours; onMessage never focuses`, J(sites.filter((s) => !s.guarded)));
}
{ // verify r2 (H1): the view's transition sync — the same acts as this harness's sync, run on every signal of a transition
  const fnBody = (head) => { const i = LW.indexOf(head); return i < 0 ? '' : LW.slice(i, LW.indexOf('\n  }\n', i) + 4); };
  const sk = fnBody('  function syncKeyboard() {');
  ok(/watchHiders\(!!st\.claimed\);/.test(sk) && /if \(st\.claimed && ky\.settle\(\{ drives: drivesKeyboard\(\), active: document\.activeElement \}\) === 'end'\) \{ claimKeyboard\(claimRec\(\)\); st\.homeless\+\+; if \(!st\.copying\) \{ st\.caretMoves\+\+; focusSink\(\); \} \}\n      const r = ky\.sync/.test(sk) && /const r = ky\.sync\(\{ owns: !!\(st\.claimed && iOwn\(\)\), yielded: !!\(st\.claimed && yieldedKeyboard\(\)\), dialog: !!\(st\.claimed && ky\.dialogHolds\), active: document\.activeElement \}\);\n      if \(!r\.changed\) return;\n      if \(r\.moveCaret && !st\.copying\) \{ st\.caretMoves\+\+; focusSink\(\); \}\n      if \(r\.release\) releaseHeld\(\);[^\n]*\n      renderKbd\(\); keyboardChanged\(\);/.test(sk),
    'verify r2 (H1 / H3): syncKeyboard — ky.sync over the live facts; a change redraws the chip and signals the composers at once; keys moving to the page move the CARET to the sink; keys leaving it let go of what is held there', sk.slice(0, 700));
  ok(/handBtn\.onclick = \(\) => \{ if \(st\.claimed\) releaseHeld\(\); send\(\{ type: 'handback', \.\.\.\(Number\.isInteger\(st\.wakes\) && st\.wakes > 0 \? \{ expectWakes: st\.wakes \} : \{\}\) \}\); \};/.test(LW) && /    if \(st\.claimed\) releaseHeld\(\);[^\n]*\n    releaseKeyboard\(winInfo\.id\); st\.claimed = false;/.test(LW),
    'verify r2 (H3): Hand back lets go of the keys held in the page BEFORE the handback is sent (after it this viewer\'s input is refused); a closing window lets go before its socket closes');
  ok(/if \(on\) hiderMo\.observe\(document\.documentElement, \{ attributes: true, attributeFilter: \['style', 'class', 'hidden'\], subtree: true \}\);/.test(LW) && /if \(n === root \|\| \(n && typeof n\.contains === 'function' && n\.contains\(root\)\)\) \{ syncKeyboard\(\); return; \}/.test(LW)
    && /const offKb = onKeyboardChange\(syncKeyboard\);/.test(LW) && /winInfo\.onResize = \(\) => \{ renderBind\(\); syncKeyboard\(\); \};/.test(LW)
    && /st\.connected = false; renderKbd\(\); syncKeyboard\(\);/.test(LW) && /renderKbd\(\); syncKeyboard\(\); \}\n/.test(LW) && /m\.state === 'upstream-closed'\) \{ st\.connected = false; [^\n]*syncKeyboard\(\); \}/.test(LW) && /if \(!st\.connected\) \{ st\.connected = true; st\.reconnects = 0; st\.openAt = Date\.now\(\); syncKeyboard\(\); \}/.test(LW),
    'verify r2 (H1): every transition signal reaches syncKeyboard — any hider on the view\'s ancestor line (style / class / hidden, watched while a takeover is ours), another view\'s claim, a chain change, the socket closing, the stream up / down, the first frame');
  ok(/if \(e\.type !== 'keyup' && !st\.copying && ky\.caretOutside\(document\.activeElement\)\) \{\n      e\.preventDefault\(\); e\.stopPropagation\(\); if \(e\.stopImmediatePropagation\) e\.stopImmediatePropagation\(\);\n      st\.strayKeys\+\+; focusSink\(\); renderKbd\(\); keyboardChanged\(\); return;\n    \}/.test(LW) && LW.indexOf('ky.caretOutside(document.activeElement)') < LW.indexOf('const route = keyRoute(e, { appMode: appMode() });'),
    'verify r2 (H1) THE BELT: the owner\'s key while a text box outside holds the caret — dropped (neither box nor page), the caret to the sink, the words redrawn — BEFORE any route (compose / paste included)');
  ok(/function yieldedKeyboard\(\) \{ return !!ky\.yielded && !!st\.claimed && !st\.closed; \}/.test(LW), 'verify r2 (H1): a yield is the takeover\'s while the view is off screen too (the composer\'s line says the browser is still his)');
}
{ // verify r2 (H5): the sink's blur — a focus that LEFT the document for a frame is taken back, and said (rate-limited)
  const i = LW.indexOf("kbd.addEventListener('blur', () => {"); const bl = i < 0 ? '' : LW.slice(i, LW.indexOf('}, sig);', i));
  ok(/const v = sinkBlurVerdict\(a, \{ sink: kbd, root, body: document\.body \}\);\n      if \(v === 'keep'\) return;/.test(bl) && /const frame = v === 'frame';\n      focusSink\(\);\n      if \(frame\) \{\n        st\.frameReclaims\+\+;/.test(bl) && /now - st\.lastFrameCueAt >= RECLAIM_CUE_MS\) \{ st\.lastFrameCueAt = now; showToast\(t\('Typing still goes to the browser — to type in another page, hand back first'\), \{ duration: 3500 \}\); \}/.test(bl) && !/dialogCue/.test(bl), // lane dialog-keys: the F4 cue at the blur is retired (a dialog is judged at its OPEN)
    'verify r2 (H5): a focus that left the document for a FRAME is taken back by the sink and SAID (rate-limited, the one way that works: hand back first)', bl.slice(0, 600));
}
const CI = src('src/lib/chat-input.js');
ok(/const renderKbdLine = \(\) => \{ const on = keyboardYielded\(\) && document\.activeElement === this\._textarea; if \(this\._kbdLine\.hidden === on\) this\._kbdLine\.hidden = !on; \};/.test(CI) && /this\._offKbdLine = onKeyboardChange\(renderKbdLine\);/.test(CI) && /this\._textarea\.addEventListener\('focus', renderKbdLine\);/.test(CI) && /this\._textarea\.addEventListener\('blur', renderKbdLine\);/.test(CI) && /if \(this\._offKbdLine\) \{ this\._offKbdLine\(\); this\._offKbdLine = null; \}/.test(CI) && /this\._streamStatus, this\._kbdLine, inputWrap,/.test(CI),
  'the composer\'s line: ONE node right above the box, shown while the keys were yielded AND this box holds the focus (the same rule as this harness), unsubscribed at dispose');
ok(/if \(keyboardOwned\(\)\) return;/.test(CI.slice(CI.indexOf('  focus() {'), CI.indexOf('  focus() {') + 400)) && /focus\(\) \{ if \(!keyboardOwned\(\)\) this\.terminal\.focus\(\);/.test(src('src/lib/terminal.js')),
  'ChatInput.focus and TerminalSession.focus still stand down while a view OWNS the keys — the yield reaches them through keyboardOwned()');
const WORDS = ['Keyboard is in the chat box — click the picture to keep using the page', 'Keyboard is in the terminal — click the picture to keep using the page', 'Keyboard is outside the browser — click the picture to keep using the page',
  'You are typing to the agent (you still drive the browser)', 'You pressed a text box outside the browser, so your keys go there. You still drive the browser — the agent waits. Click the picture to type into the page again; Hand back ends the takeover.',
  'While you drive, every key goes to the page. Press a chat box or a terminal to type there instead — the browser stays yours; click the picture to come back (Ctrl+Backslash and Ctrl+Alt+Left/Right stay the app’s).',
  'Typing still goes to the browser — click the text box itself to type there', // verify r2 (Q1): the reclaim cue's census row
  'Typing still goes to the browser — to type in another page, hand back first', // verify r2 (H5): the frame cue's
  'Keyboard is not in a text box — click one to type there, or the picture to use the page', // verify r3 (r2's held): yielded, nothing that takes keys holds the focus
  'Typing still goes to the browser — click the dialog’s buttons to answer it', // verify r3 (F4); lane dialog-keys: said for a dialog that opened BY ITSELF
  'Keyboard is in the dialog — it goes back when you answer it', // lane dialog-keys: the chip while a dialog the user opened holds the keys
  'A dialog you opened has the keyboard: Enter, Escape and typing go to it. When it closes your keys go back where they were — you still drive the browser, the agent waits.'];
const zh = src('src/lib/i18n-zh.js'), ja = src('src/lib/i18n-ja.js');
const miss = WORDS.filter((w) => !(LW + CI).includes(`t('${w}')`) || !zh.includes(JSON.stringify(w) + ':') || !ja.includes(JSON.stringify(w) + ':'));
ok(miss.length === 0 && zh.includes('"键盘在对话框 — 点画面继续操作网页"') && zh.includes('"你在给 agent 打字（浏览器仍由你接管）"'), `the words (${WORDS.length}) are t() literals with zh + ja — "键盘在对话框 — 点画面继续操作网页" · "你在给 agent 打字（浏览器仍由你接管）"`, miss.join(' | '));

{ // lane dialog-keys: THE ANNOUNCEMENT + the view's dialog wiring — the same acts as this harness's world (read off the real files)
  const body = (text, head) => { const i = text.indexOf(head); return i < 0 ? '' : text.slice(i, text.indexOf('\n  }\n', i) + 4); };
  const U = src('src/lib/utils.js'), AP = src('src/lib/app.js');
  const shell = U.slice(U.indexOf('export function createModalShell('), U.indexOf('\n}\n', U.indexOf('export function createModalShell(')));
  ok(/export const MODAL_OPEN_EVENT = 'vs-modal-open';/.test(U) && /export function announceModal\(overlay\) \{\n  try \{ document\.dispatchEvent\(new CustomEvent\(MODAL_OPEN_EVENT, \{ detail: \{ overlay \} \}\)\); \}/.test(U)
    && /\n  document\.body\.appendChild\(overlay\);\n  announceModal\(overlay\);/.test(shell),
    'utils.js: createModalShell ANNOUNCES its overlay right after the append (the opening act\'s own task, before the caller focuses anything in it); the event carries the overlay only — no evidence of its own, so a forged one hands nothing the keys');
  const sd = body(AP, '  _showDialog(id) {');
  ok(/document\.getElementById\(id\)\.classList\.remove\('hidden'\);\n    announceModal\(overlay\);/.test(sd) && /hideDialogs\(\) \{ document\.getElementById\('dialog-overlay'\)\.classList\.add\('hidden'\);/.test(AP) && /import \{[^}]*\bannounceModal \} from '\.\/utils\.js';/.test(AP),
    'app.js: the static #dialog-overlay announces when _showDialog shows it; hideDialogs closes it by its class (the dialogs\' watch reads the class)', sd.slice(0, 400));
  // every app modal is announced: the one `.dialog-overlay` the client builds is createModalShell's + index.html's static one
  const walkLib = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walkLib(path.join(d, e.name)) : [path.join(d, e.name)]);
  const MAKER = /className\s*=\s*['"`][^'"`]*\bdialog-overlay\b|classList\.add\(\s*['"]dialog-overlay['"]|class=\\?["'][^"']*\bdialog-overlay\b/;
  const makersOf = (files) => files.filter(([, t]) => MAKER.test(t)).map(([f]) => f);
  const libFiles = walkLib('src/lib').filter((f) => f.endsWith('.js')).map((f) => [f, src(f)]);
  const makers = makersOf(libFiles);
  ok(JSON.stringify(makers) === '["src/lib/utils.js"]' && /<div id="dialog-overlay" class="dialog-overlay hidden">/.test(src('public/index.html')),
    'every app modal is ANNOUNCED: the one `.dialog-overlay` the client builds is createModalShell\'s (src/lib/utils.js) + index.html\'s static #dialog-overlay (app._showDialog) — a hand-rolled overlay would never be judged', makers.join(' | '));
  ok(JSON.stringify(makersOf([...libFiles, ['src/lib/x.js', "const ov = document.createElement('div'); ov.className = 'dialog-overlay my';"]])) === '["src/lib/utils.js","src/lib/x.js"]', 'NEGATIVE CONTROL (a hand-rolled overlay added): the census names its maker');
  const mo = LW.slice(LW.indexOf('  document.addEventListener(MODAL_OPEN_EVENT, (e) => {'), LW.indexOf('  }, { signal: winInfo._listenerCtl?.signal });', LW.indexOf('  document.addEventListener(MODAL_OPEN_EVENT')));
  ok(/import \{ MODAL_OPEN_EVENT \} from '\.\/utils\.js';/.test(LW) && /if \(!st\.claimed \|\| st\.closed\) return;\n    settleDialogs\(\);/.test(mo) && /const v = ky\.onDialogOpen\(ov, \{ active: document\.activeElement \}\);\n    if \(v === 'take'\) \{\n      st\.dialogTakes\+\+;\n      watchDialogs\(\);\n      syncKeyboard\(\);/.test(mo)
    && /if \(a && a !== document\.body && typeof ov\.contains === 'function' && ov\.contains\(a\)\) return;\n        focusDialog\(ov\);\n      \}, 0\);/.test(mo) && /if \(v === 'reclaim' && iOwn\(\) && ky\.dialogCue\(v\)\) \{ st\.dialogCues\+\+; showToast\(t\('Typing still goes to the browser — click the dialog’s buttons to answer it'\), \{ duration: 3500 \}\); \}/.test(mo),
    'the live view: MODAL_OPEN_EVENT (document, the window\'s signal) — settle first, then the yield\'s verdict: take ⇒ the watch armed + the transition (chip, held keys let go) + the focus tick (its first text box / its overlay, never a button); reclaim ⇒ THE owner says it once', mo.slice(0, 700));
  const fdv = body(LW, '  function focusDialog(ov) {');
  ok(/const tgt = dialogFocusTarget\(ov\);\n    try \{ if \(tgt === ov && \(typeof ov\.hasAttribute === 'function' \? !ov\.hasAttribute\('tabindex'\) : ov\.tabIndex == null\)\) ov\.tabIndex = -1; tgt\.focus\(\{ preventScroll: true \}\); \} catch \{ \/\* gone \*\/ \}/.test(fdv) && (LW.match(/dialogFocusTarget\(/g) || []).length === 1,
    'verify r1: ONE door gives a held dialog its own field (its first visible text box, else its overlay with tabIndex -1 — never a button): the take\'s focus tick and the \'older\' return both go through focusDialog', fdv.slice(0, 400));
  const sdv = body(LW, '  function settleDialogs() {');
  ok(/const r = ky\.settleDialogs\(\{ active: document\.activeElement \}\);[^\n]*\n    if \(!r\) return;\n    watchDialogs\(\);/.test(sdv) && /if \(r\.to === 'sink'\) \{ if \(iOwn\(\) && !st\.copying\) focusSink\(\); \}\n    else if \(r\.to === 'older' && r\.el\) focusDialog\(r\.el\);[^\n]*\n    else if \(\(r\.to === 'back' \|\| r\.to === 'yield'\) && r\.el\) \{ try \{ r\.el\.focus\(\{ preventScroll: true \}\); \} catch \{ \/\* gone \*\/ \} \}\n    syncKeyboard\(\);/.test(sdv)
    && /const dialogMo = typeof MutationObserver === 'function' \? new MutationObserver\(\(\) => settleDialogs\(\)\) : null;/.test(LW) && /dialogMo\.observe\(document\.body, \{ childList: true \}\);\n    for \(const ov of ky\.dialogOverlays\(\)\) dialogMo\.observe\(ov, \{ attributes: true, attributeFilter: \['class', 'hidden'\] \}\);/.test(LW)
    && /if \(dialogMo\) dialogMo\.disconnect\(\); \/\/ lane dialog-keys/.test(LW),
    'the live view: ONE MutationObserver, armed only while a dialog holds (the body\'s children + each held overlay\'s class) — any close (an answer, a backdrop press, a script\'s removal, the static overlay\'s class) settles: the sink / the older dialog\'s field / the yield\'s text box, then the transition redraws; disconnected when the window closes', sdv.slice(0, 500));
  ok(/if \(st\.claimed && e\.type === 'keydown' && \(ky\.dialogHolds \|\| keyRoute\(e, \{ appMode: appMode\(\) \}\)\.to === 'app'\)\) ky\.onAppKey\(e\);\n    if \(!iOwn\(\)\)/.test(LW),
    'onDocKey: a key the APP takes (typed into a dialog he opened, a reserved chord, command mode) stamps the opener in EVERY view BEFORE the owner test; a key the page gets never does');
  const rd = LW.slice(LW.indexOf('  const renderDialog = () => {'), LW.indexOf('  function answerDialog('));
  ok(rd.length > 400 && !/announceModal|MODAL_OPEN_EVENT|dialog-overlay/.test(rd), 'the agent\'s PAGE dialog (the view\'s own Accept / Dismiss bar) is never announced as an app modal — its handling is the view\'s, unchanged');
}

// lane takeover-surface-census: the vault's 「验证是你」 opens in the press's OWN task wherever a press asks for a stored value — Show
// key… (revealAccountKey) asks FIRST while the vault is unlocked and this page holds no window (§1 dialogPassword: asked after the
// hub's refusal it opened a round trip late, and the second password went to the agent's page); the Vault window's 「显示」
// (revealValue) asks before its request
// (lane vault-slow-load: the import line gains sayVaultWait — askRevealPassword's wait is said; the line stays pinned whole)
{ const VR = fs.readFileSync(path.join(REPO, 'src/lib/vault-reveal.js'), 'utf8');
  const fnOf = (src, head) => { const a = src.indexOf(head); return a < 0 ? '' : src.slice(a, src.indexOf('\n}\n', a)); };
  const firstLine = (fn) => fn.split('\n').slice(1).find((l) => /\S/.test(l) && !/^\s*\/\//.test(l)) || '';
  const PRE = "  if (!revealLeftMs() && vaultFacts()?.state === 'unlocked' && !(await askRevealPassword())) return null;";
  const asksFirst = (src) => { const f = fnOf(src, 'export async function revealAccountKey('); return firstLine(f) === PRE && f.indexOf(PRE) < f.indexOf('fetchJson('); };
  ok(asksFirst(VR) && /^import \{ vaultWords, vaultFacts, onVaultFacts, sayVaultWait \} from '\.\/vault-unlock\.js';$/m.test(VR), 'vault-reveal.js: Show key… (revealAccountKey) asks 验证是你 FIRST — before any request — while the vault is unlocked and this page holds no window', firstLine(fnOf(VR, 'export async function revealAccountKey(')));
  ok(!asksFirst(VR.replace(PRE + '\n', '')), 'NEGATIVE CONTROL (the pre-lane revealAccountKey: the key asked for first): the pin is red');
  const rv = fnOf(VR, 'export async function revealValue(');
  ok(/^    if \(!revealLeftMs\(\) && !\(await askRevealPassword\(\)\)\) return \{ ok: false, code: 'cancelled' \};$/m.test(rv) && rv.indexOf('askRevealPassword()') < rv.indexOf('rvPost('), 'vault-reveal.js: the Vault window\'s 「显示」 (revealValue) asks before its request while this page holds no window', rv.slice(0, 300));

  // q-050 (Fable verify) — THE SECOND LATE-ASK ROAD: on the hub's `reveal_needs_password` (a stale window — a lock→unlock an
  // agent can send, a hub restart, the 5-minute boundary) NEITHER function asks again a round trip late; it forgets the window
  // and returns the refusal, so the NEXT press asks first in its own task (the §1 dialogPassword leg shows a late ask leaks).
  const countAsk = (fn) => (fn.match(/askRevealPassword\(/g) || []).length;
  const acctFn = fnOf(VR, 'export async function revealAccountKey(');
  ok(countAsk(acctFn) === 1 && /forgetReveal\(\);\s*\n\s*return \{ code: 'reveal_needs_password'/.test(acctFn),
    'q-050: revealAccountKey asks 验证是你 ONCE; on the hub\'s refusal it forgets + returns the code — never a round-trip-late ask', acctFn.slice(-260));
  ok(countAsk(fnOf(VR.replace("    forgetReveal();\n    return { code: 'reveal_needs_password', error: revealWords", "    forgetReveal();\n    if (!(await askRevealPassword())) return null;\n    return { code: 'reveal_needs_password', error: revealWords"), 'export async function revealAccountKey(')) === 2,
    'NEGATIVE CONTROL (the pre-fix revealAccountKey asking a round trip late): askRevealPassword appears TWICE — the pin is red');
  const rvFn = fnOf(VR, 'export async function revealValue(');
  ok(/code === 'reveal_needs_password'\) \{ forgetReveal\(\); return \{ ok: false, code: 'reveal_needs_password' \}; \}/.test(rvFn) && !/\bcontinue;/.test(rvFn),
    'q-050: revealValue forgets + RETURNS on a stale window (no continue → no loop back to a late ask)', rvFn.slice(0, 360));
  ok(/\bcontinue;/.test(fnOf(VR.replace("{ forgetReveal(); return { ok: false, code: 'reveal_needs_password' }; }", "{ forgetReveal(); continue; }"), 'export async function revealValue(')),
    'NEGATIVE CONTROL (the pre-fix revealValue looping back with continue): the pin is red');
  ok(/onVaultFacts\(\(f\) => \{ if \(!f \|\| f\.state !== 'unlocked'\) forgetReveal\(\); \}\);/.test(VR),
    'q-050 belt: vault-reveal.js forgets this page\'s reveal window whenever the vault facts are not unlocked — a stale window never reaches a late ask');
  ok(!/onVaultFacts\(\(f\) =>/.test(VR.replace("onVaultFacts((f) => { if (!f || f.state !== 'unlocked') forgetReveal(); });", "")),
    'NEGATIVE CONTROL (no belt subscription): the pin is red');
}

// ═══ §4 THE CLASSES' PROOF (the census itself is scripts/test-takeover-census.mjs — FAST since lane takeover-census-fast, B-aacd) ═══
// Every class the census names (SURFACE_CLASSES, imported — the fast suite checks nothing when imported) is PROVEN here: its
// DOM-mini legs above are green on the real keyboard-yield.js, and the §2 copy that removes its rule turns those legs red. The
// census over the tree (every surface a classed row), its planted-surface control and its own controls run in the FAST tier
// — a lane's own gate reds the day it lands a surface without a row (this heavy suite, routed to the desktop runner by the
// word xpra in its strings, hid that red from 2.369.313 to .323 and again on the .329 base).
console.log('§4 every census class proven: its legs green on the real keyboard-yield.js, reddened by its §2 copy');
{ const byClass = {}; for (const r of CENSUS) for (const c of r[2].split('+')) (byClass[c] ||= []).push(r[0].replace(/\.js$/, '') + ':' + r[1]);
  const legless = Object.entries(SURFACE_CLASSES).filter(([, v]) => !v.legs.length || !v.legs.every((l) => R[l] && R[l].ok)).map(([c]) => c);
  ok(!legless.length, `every class is PROVEN on the real keyboard-yield.js by its DOM-mini legs (${Object.entries(SURFACE_CLASSES).map(([c, v]) => c + ': ' + v.legs.join('/')).join(' · ')})`, legless.join(', '));
  const tags = new Map(CONTROLS.map((c) => [c.tag, c]));
  const uncontrolled = Object.entries(SURFACE_CLASSES).filter(([c, v]) => c !== 'none' && !v.controls.some((t) => tags.has(t) && tags.get(t).red.some((l) => v.legs.includes(l)))).map(([c]) => c);
  ok(!uncontrolled.length, 'every class whose rule lives in keyboard-yield.js is reddened by a §2 patched copy that removes it (its legs in the control\'s red set); "none" has no rule to remove', uncontrolled.join(', '));
  const unknownLeg = Object.values(SURFACE_CLASSES).flatMap((v) => v.legs).filter((l) => !(l in R));
  ok(!unknownLeg.length, `every leg a class names is a scenario of this suite (${CENSUS.length} census rows over ${Object.keys(SURFACE_CLASSES).length} classes: ${Object.entries(byClass).map(([c, l]) => c + ' ' + l.length).join(' · ')})`, unknownLeg.join(', ')); }

console.log(`\n(${Date.now() - t0} ms)`);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
