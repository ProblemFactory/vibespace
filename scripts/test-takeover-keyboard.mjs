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
//      a handback while yielded · the words follow a new text box.
//   §2 PATCHED-COPY CONTROLS (scripts/mutant-copy.mjs): the yield ignoring the press (userW's bug), a same-input check
//      that matches anything (the password guard gone), the touch re-stamp removed, the trust check removed — each turns
//      exactly its scenarios red.
//   §3 WIRING PINS: the live view's registrations and acts, the composer's line, the i18n rows.
//   §4 THE INPUT-SURFACE CENSUS (verify r3): every construct under src/lib/** that makes an element take keys — grep-derived,
//      one row per (file, construct), each classified (yields on the user's own press / taken back / declared, with where the
//      focus lands); every class proven by its legs above and reddened by the §2 copy that removes its rule; the census's own
//      controls (a row dropped, a construct added, a construct gone, an unknown class, a surface named only in a comment).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
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
  class El {
    constructor(tag, { cls = '', type, ce = false, tabindex = null } = {}) {
      this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.className = cls; this.type = type; this._ce = ce;
      this.tabIndex = tabindex; this.readOnly = false; this.disabled = false; this.value = ''; this.parent = null; this.children = []; this.listeners = [];
    }
    get isContentEditable() { let n = this; while (n && n.nodeType === 1) { if (n._ce) return true; n = n.parent; } return false; }
    append(...cs) { for (const c of cs) { c.parent = this; this.children.push(c); } return this; }
    contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parent; } return false; }
    closest(sel) { const wants = String(sel).split(',').map((x) => x.trim().replace(/^\./, '')); let n = this; while (n && n.nodeType === 1) { const cls = String(n.className).split(/\s+/); if (wants.some((w) => cls.includes(w))) return n; n = n.parent; } return null; } // a list of classes (verify r2: INPUT_HOSTS)
    addEventListener(type, fn, opts) { addL(this, type, fn, opts); }
    get focusable() { return ['TEXTAREA', 'INPUT', 'BUTTON', 'SELECT', 'IFRAME'].includes(this.tagName) || this._ce || this.tabIndex != null; } // verify r3: a <select> and a frame take the focus of a press too
    get isConnected() { let n = this; while (n) { if (n === doc) return true; n = n.parent; } return false; }
    checkVisibility() { let n = this; while (n && n.nodeType === 1) { if (n._hidden) return false; n = n.parent; } return true; } // verify r2: a hider (another desktop) on an ancestor
    focus() { doc.focus(this); } // a PROGRAMMATIC focus (a script's .focus())
  }
  const doc = { nodeType: 9, parent: null, listeners: [], activeElement: null, addEventListener(type, fn, opts) { addL(doc, type, fn, opts); } };
  const body = new El('body'); body.parent = doc; doc.body = body; doc.activeElement = body;
  function dispatch(target, type, init = {}) {
    const ev = { type, target, isTrusted: init.isTrusted === true, pointerType: init.pointerType || 'mouse', defaultPrevented: false, stopped: false, immediate: false,
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
  return { El, doc, body, dispatch, press };
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
    body.append(chatArea, xterm, sidebar, xShell, vShell);
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
      const st = { mode: 'watch', mine: false, connected: true, displayed: true, claimed: false, closed: false, reclaims: 0, yields: 0, page: '', caretMoves: 0, strayKeys: 0, redraws: 0, held: new Set(), released: [], cues: 0, frameCues: 0, dialogCues: 0 };
      /** the view's releaseHeld (r1 K4 / r2 H3): a keyup to the page for every key still held there */
      const releaseHeld = () => { st.released.push(...[...st.held].reverse()); st.held.clear(); };
      const facts = () => ({ mode: st.mode, mine: st.mine, connected: st.connected, displayed: st.displayed, closed: st.closed });
      const ky = KY.createKeyboardYield({ root, sink: kbd, drives: () => st.claimed && T.keyboardOwnership(facts()).owns, mine: () => st.claimed && !st.closed, now: clock.now, ownChrome: (el) => tab.contains(el) });
      const ownsKeyboard = () => T.keyboardOwnership({ ...facts(), yielded: ky.yielded }).owns;
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
          const r = ky.sync({ owns: st.claimed && iOwn(), yielded: st.claimed && yieldedKeyboard(), active: doc.activeElement }); if (!r.changed) return; if (r.moveCaret) { st.caretMoves++; focusSink(); } if (r.release) releaseHeld(); st.redraws++; KO.keyboardChanged(); } finally { syncing = false; }
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
        queueMicrotask(() => { const say = typeof ky.takeCue === 'function' && ky.takeCue(taken); focusSink(); if (say) st.cues++; });
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
          const a = doc.activeElement;
          focusSink();
          if (bv === 'frame') st.frameCues++;
          else if (typeof ky.dialogCue === 'function' && ky.dialogCue(a)) st.dialogCues++; // verify r3 (F4)
        }, 0);
      }, { signal: ctl.signal });
      // the picture's own pointerdown while driving: preventDefault (no mouse events, no default focus) + the sink
      img.addEventListener('pointerdown', (e) => { if (!(st.mode === 'takeover' && st.mine)) return; e.preventDefault(); focusSink(); });
      const v = {
        id, root, img, takeBtn, kbd, tab, tabLabel, st, ky,
        takeover() { st.mode = 'takeover'; st.mine = true; if (!st.claimed) { st.claimed = true; ky.reset('claim'); KO.claimKeyboard(claimRec()); } if (!ky.yielded) focusSink(); KO.keyboardChanged(); },
        handback() { st.mode = 'watch'; st.mine = false; if (st.claimed) { st.claimed = false; ky.reset('release'); KO.releaseKeyboard(id); if (doc.activeElement === kbd) doc.focus(body); } KO.keyboardChanged(); },
        dispose() { ctl.abort(); offSync(); KO.releaseKeyboard(id); },
        /** verify r2 (H1): a HIDER (minimize, a desktop, a tab) / the STREAM — the view's own signals for a transition */
        show(on) { st.displayed = !!on; sync(); },
        /** a key pressed in the page (its keydown went there) and still held; the bar's Hand back button (H3: let go first) */
        hold(key) { if (iOwn()) st.held.add(key); },
        handbackPress() { if (st.claimed) releaseHeld(); this.handback(); },
        stream(on) { st.connected = !!on; sync(); },
      };
      V.push(v);
    }
    /** Typing, as the views' document capture keydown routes it: the OWNING view's page gets the key; nobody owns ⇒
     *  the focused text box does. */
    const type = (text) => { for (const ch of text) { const o = KO.keyboardOwner(); const v = o && V.find((x) => x.id === o.id); if (v) { if (typeof v.ky.caretOutside === 'function' && v.ky.caretOutside(doc.activeElement)) { v.st.strayKeys++; doc.focus(v.kbd); KO.keyboardChanged(); continue; } v.st.page += ch; } else if (KY.isEditable(doc.activeElement)) doc.activeElement.value += ch; } }; // verify r2 (H1): the view's BELT — the owner's key while a text box outside holds the caret goes nowhere, the caret moves
    const at = () => { const a = doc.activeElement; if (a === ta) return 'composer'; if (a === helper) return 'terminal'; for (const v of V) if (a === v.kbd) return 'sink' + (V.length > 1 ? v.id.slice(-1) : ''); if (a === xIme) return 'xpra-ime'; if (a === vCanvas) return 'vnc-canvas'; return a === body ? 'body' : String(a && (a.className || a.tagName)); };
    const ctx = { D, doc, ta, helper, cvs, sidebar, sendBtn, line, chatFocus, V, clock, type, at, xCanvas, xIme, vCanvas, press: (el, o = {}) => D.press(el, { clock, ...o }) };
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
  // verify r3 (F4): a DIALOG the user's own press opened (the explorer's Delete → the confirm dialog, which focuses its default
  // button a tick later) — taken back (its Enter goes to the page: a dialog that opens by itself must never get the keys) and
  // SAID once; a press ON its button answers it by the pointer, silently; a dialog opening by itself is never said
  out.dialogConfirm = await world(async ({ V: [A], D, press, type, at, clock }) => {
    A.takeover(); await flush();
    const item = new D.El('div', { cls: 'context-menu-item' }); D.body.append(item);
    const open = () => { const ov = new D.El('div', { cls: 'dialog-overlay', tabindex: -1 }); const dlg = new D.El('div', { cls: 'dialog' }); const okb = new D.El('button', { cls: 'btn-ok' }); ov.append(dlg.append(okb)); D.body.append(ov); setTimeout(() => ov.focus(), 0); setTimeout(() => okb.focus(), 0); return okb; };
    let okb = null; item.addEventListener('pointerup', () => { okb = open(); });
    await press(item); await flush(); await flush(); const focus = at(); const c1 = A.st.dialogCues;
    type('\n'); // the Enter meant for the dialog
    await press(okb); await flush(); await flush(); const c2 = A.st.dialogCues;
    clock.advance(T.RECLAIM_CUE_MS + 10); open(); await flush(); await flush(); const c3 = A.st.dialogCues; // a dialog opening by itself
    const r = { focus, page: A.st.page, cues: [c1, c2, c3] };
    r.ok = r.focus === 'sink' && r.page === '\n' && JSON.stringify(r.cues) === '[1,1,1]';
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
  { tag: 'no-press', why: 'the yield ignores the press (every focus reclaimed — userW\'s bug)', from: 'const u = userPressFocus({ press: p, sameInput: !!p && sameInput(p.target, el), focusAt: now() }), byUserPress = u.byUserPress;', to: 'const u = userPressFocus({ press: p, sameInput: !!p && sameInput(p.target, el), focusAt: now() }), byUserPress = false;', red: ['userW', 'picture', 'bar', 'terminal', 'touch', 'twoViews', 'handback', 'follow', 'ownTab', 'hiddenTab', 'h1PressHidden', 'h1Reconnect', 'n1Xpra', 'n1Vnc', 'q1Cue', 'homeGone', 'widgetYielded', 'textSearch', 'textCm'] },
  { tag: 'any-input', why: 'a same-input check that matches anything (the password guard gone)', from: 'export function sameInput(pressed, focused) {\n  if (!pressed || !focused) return false;', to: 'export function sameInput(pressed, focused) {\n  return true;', red: ['elsewhereThenScript', 'alreadyFocusedGuard', 'q1Cue', 'helperCopy', 'dialogConfirm'] }, // (verify r3: the copy fallback's scratch box would take the keys too; a dialog's own focus reads as pressed) (a press INSIDE the view is never remembered — pictureThenScript stays green by that rule, not this one)
  { tag: 'no-restamp', why: 'the touch tap\'s release does not re-stamp the press', from: '    onPointerUp(e) { if (s.press && e.target === s.press.target && e.isTrusted === true) s.press.at = now(); },', to: '    onPointerUp(e) { },', red: ['touch'] },
  { tag: 'trust-any', why: 'a synthetic press counts as the user\'s', from: 's.press = { target: e.target, at: now(), trusted: e.isTrusted === true };', to: 's.press = { target: e.target, at: now(), trusted: true };', red: ['synthetic', 'alreadyFocusedGuard'] },
  { tag: 'no-chrome', why: 'verify r1 K3 pre-fix: only the view\'s root counts (its tab is "elsewhere")', from: 'const namesView = (el) => { if (inView(el)) return true; try { return !!el && !!ownChrome(el); } catch { return false; } };', to: 'const namesView = (el) => inView(el);', red: ['hiddenTab', 'ownTab'] },
  { tag: 'no-press-focused', why: 'verify r1 pre-fix: a press on the text box that already holds the caret is never judged', from: '    onPressFocused(active) {\n', to: '    onPressFocused(active) { return null;\n', red: ['alreadyFocused'] },
  { tag: 'hidden-keeps', why: 'verify r1 K3 pre-fix: a press while the view is off screen is ignored', from: '      if (s.yielded && namesView(e.target)) {', to: '      if (s.yielded && namesView(e.target) && driving()) {', red: ['hiddenTab'] },
  // verify r2 (H1)
  { tag: 'h1-no-mine', why: 'verify r2 H1 pre-fix: a press while the takeover is mine but the view does not drive is not judged', from: '      if (!driving() && !isMine()) { s.press = null; return null; }', to: '      if (!driving()) { s.press = null; return null; }', red: ['h1PressHidden', 'h1Reconnect', 'homeGone'] },
  { tag: 'h1-no-move', why: 'verify r2 H1 pre-fix: a transition to the page leaves the caret where it was (the keys merely routed)', from: 'const r = keyboardTransition({ was: s.last, now: { owns, yielded }, caretOutside: caretOutside(active) });', to: 'const r = keyboardTransition({ was: s.last, now: { owns, yielded }, caretOutside: false });', red: ['h1ScriptHidden', 'h1Frame', 'hiddenTab'] },
  { tag: 'h1-frame-blind', why: 'verify r2 H1/H5: a frame holding the focus is not a caret outside', from: 'const caretOutside = (el) => !!el && el !== sink && !inView(el) && (takesKeys(el) || isFrame(el));', to: 'const caretOutside = (el) => !!el && el !== sink && !inView(el) && takesKeys(el);', red: ['h1Frame'] },
  { tag: 'h1-belt-blind', why: 'verify r2 H1: the belt never sees the caret outside', from: '    caretOutside,\n', to: '    caretOutside: () => false,\n', red: ['belt'] },
  // verify r2 (N1)
  { tag: 'home-kept', why: 'verify r2 H1b\' pre-fix: a yield outlives its home', from: '      const v = yieldHomeVerdict({ yielded: s.yielded, drivesNow: !!drives, drovePrev, homeVisible });', to: "      const v = 'keep';", red: ['homeGone', 'homeHidden'] },
  { tag: 'q1-no-cue', why: 'verify r2 Q1 pre-fix: a reclaim is never said', from: '    takeCue(el) { const c = !!s.cue && !(el && el.isConnected === false); s.cue = false; if (c) s.lastCueAt = now(); return c; },', to: '    takeCue() { return false; },', red: ['q1Cue'] },
  { tag: 'cue-gone-said', why: 'verify r3 F2 pre-fix: a box already gone at the reclaim is announced', from: '    takeCue(el) { const c = !!s.cue && !(el && el.isConnected === false); s.cue = false; if (c) s.lastCueAt = now(); return c; },', to: '    takeCue() { const c = !!s.cue; s.cue = false; if (c) s.lastCueAt = now(); return c; },', red: ['helperCopy'] },
  { tag: 'n1-no-host', why: 'verify r2 N1 pre-fix: only xterm\'s screen is one input with its text box', from: "const INPUT_HOSTS = '.xterm, .picture-shell';", to: "const INPUT_HOSTS = '.xterm';", red: ['n1Xpra'] },
  // verify r3 (the input-surface census: a text box's own rules)
  { tag: 'no-xterm-host', why: 'verify r3: a terminal\'s screen is not one input with its helper textarea', from: "const INPUT_HOSTS = '.xterm, .picture-shell';", to: "const INPUT_HOSTS = '.picture-shell';", red: ['terminal'] },
  { tag: 'no-contenteditable', why: 'verify r3: a contenteditable (CodeMirror) is not a text box', from: '  if (el.isContentEditable) return true;\n', to: '', red: ['textCm'] },
  { tag: 'no-search-type', why: 'verify r3: an <input type=search> is not a text box', from: "const TEXT_INPUT_TYPES = new Set(['', 'text', 'search',", to: "const TEXT_INPUT_TYPES = new Set(['', 'text',", red: ['textSearch'] },
  // verify r3 (the sink's blur)
  { tag: 'no-dialog-cue', why: 'verify r3 F4 pre-fix: a dialog the user opened is taken back silently', from: '    dialogCue(a) {\n', to: '    dialogCue(a) { return false;\n', red: ['dialogConfirm'] },
  { tag: 'where-kind', why: 'verify r3 (r2\'s held) pre-fix: the chip names the text box the keys were given to, wherever the focus went', from: "      if (active && active !== sink && !inView(active)) { if (takesKeys(active)) return yieldKindOf(active); if (isFrame(active)) return 'other'; }\n      return 'none';", to: '      return s.kind;', red: ['widgetYielded'] },
  { tag: 'no-choice', why: 'verify r3 F1 pre-fix: a <select> is taken back like any other focus (its list closes)', from: "export function isChoiceControl(el) { try { return !!el && el.nodeType === 1 && el.tagName === 'SELECT' && !el.disabled; } catch { return false; } }", to: 'export function isChoiceControl(el) { return false; }', red: ['choiceSelect'] },
  { tag: 'blur-frame-blind', why: 'verify r3: a frame is taken back like any other focus (never said)', from: "  try { if (isFrame(a) && !(root && root.contains(a))) return 'frame'; } catch { /* detached */ }", to: '', red: ['frameSink'] },
  { tag: 'blur-keeps-all', why: 'verify r3: the sink never takes a focus back (a press on a control / list / frame keeps it)', from: "  if (isEditable(a) || isChoiceControl(a)) return 'keep';", to: "  return 'keep';", red: ['frameSink', 'controlCheckbox', 'widgetList', 'dialogConfirm', 'textCm'] }, // (textCm: the gutter's scroller would keep the focus)
  { tag: 'n1-no-surface', why: 'verify r2 N1 pre-fix: noVNC\'s canvas is not a place keys go', from: "  try { return !!el && el.nodeType === 1 && el.tagName === 'CANVAS' && typeof el.closest === 'function' && !!el.closest('.picture-shell'); } catch { return false; }", to: '  return false;', red: ['n1Vnc', 'n1Script'] },
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
ok(R.dialogConfirm.ok, 'verify r3 (F4): a DIALOG the user\'s own press opened (Delete → the confirm dialog focusing its default button) is taken back — its Enter still reaches the page — and SAID once; a press on its button answers it silently; a dialog opening by itself is never said', J(R.dialogConfirm));
ok(R.textSearch.ok, 'verify r3 (the census\'s text row): a SEARCH box (<input type=search> — the palette, the pickers) yields to the user\'s own press; "ab" lands in it', J(R.textSearch));
ok(R.textCm.ok, 'verify r3 (the census\'s text row): the CODE EDITOR — a press on a line yields to CodeMirror\'s .cm-content ("zz" in the doc); a press on its gutter focuses the scroller, the sink takes it back ("g" to the page — without a takeover the gutter takes no typing either)', J(R.textCm));
ok(R.noneCanvas.ok, 'verify r3 (the census\'s none row): a chart\'s canvas takes no keys — a press on it leaves them the page\'s; only a picture shell\'s canvas is a keyboard surface', J(R.noneCanvas));
ok(Object.values(R).every((r) => r.ok) && Object.keys(R).length === 41, `…and the real module passes all ${Object.keys(R).length} scenarios under the same harness`);
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: CONTROLS.length, label: '§2 ' })) ok(r.pass, r.name, r.detail);

// ═══ §3 WIRING PINS ═══════════════════════════════════════════════════════════
console.log('§3 wiring: the live view registers the three listeners and acts as this harness does; the composer\'s line; the words');
const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const LW = src('src/lib/browser-live-window.js');
ok(/import \{ createKeyboardYield, isEditable, sinkBlurVerdict \} from '\.\/keyboard-yield\.js';/.test(LW) && !/\nfunction isEditable\(/.test(LW) && /const ky = createKeyboardYield\(\{ root, sink: kbd, drives: \(\) => drivesKeyboard\(\), mine: \(\) => !!st\.claimed && !st\.closed, ownChrome: namesThisView \}\);/.test(LW),
  'the live view builds its yield from keyboard-yield.js over its root + sink (ONE isEditable — the view\'s own copy is gone)');
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
ok(/const claimRec = \(\) => \(\{ id: winInfo\.id, owns: ownsKeyboard, yielded: yieldedKeyboard \}\);/.test(LW) && /function ownsKeyboard\(\) \{ return keyboardOwnership\(\{ \.\.\.kbFacts\(\), yielded: ky\.yielded \}\)\.owns; \}/.test(LW) && /function drivesKeyboard\(\) \{ return !!st\.claimed && keyboardOwnership\(kbFacts\(\)\)\.owns; \}/.test(LW),
  'the claim: owns() answers false while yielded (so ChatInput / TerminalSession behave normally), yielded() says so');
// the .197 integration: the three pins below read the MERGED lines (browse-yourself's address-row exemption and first-claim caret, lane-pairing r6's wake count)
ok(/if \(first\) \{ st\.claimed = true; st\.sent = 0; st\.pressed\.clear\(\); ky\.reset\('claim'\); claimKeyboard\(claimRec\(\)\); \}/.test(LW) && /else if \(!ky\.yielded && !\(H && document\.activeElement === addrInput\)\) focusSink\(\);/.test(LW) && /ky\.reset\('release'\); releaseKeyboard\(winInfo\.id\);/.test(LW) && /ky\.reset\('release'\); keyboardChanged\(\);/.test(LW),
  'a re-render while yielded never pulls the focus back; a fresh claim and the release (and a closed window) clear the yield');
ok(/const yielded = !own && st\.claimed && yieldedKeyboard\(\);/.test(LW) && /kbdText\.textContent = yielded \? yieldChipText\(ky\.whereNow\(document\.activeElement\)\) :/.test(LW) && /document\.addEventListener\('focusout', \(\) => \{ if \(st\.claimed && ky\.yielded\) setTimeout\(\(\) => \{ if \(!st\.closed\) renderKbd\(\); \}, 0\); \}, capture\);/.test(LW) && /priority: key === 'kbd' && st\.claimed && ky\.yielded \? LIVE_BAR_PRIORITY\.badge : LIVE_BAR_PRIORITY\[key\]/.test(LW),
  'the bar says where the keys are while yielded (the chip patched in place, at the badge\'s fold rank)');
{ // verify r2 (H1): the view's transition sync — the same acts as this harness's sync, run on every signal of a transition
  const fnBody = (head) => { const i = LW.indexOf(head); return i < 0 ? '' : LW.slice(i, LW.indexOf('\n  }\n', i) + 4); };
  const sk = fnBody('  function syncKeyboard() {');
  ok(/watchHiders\(!!st\.claimed\);/.test(sk) && /if \(st\.claimed && ky\.settle\(\{ drives: drivesKeyboard\(\), active: document\.activeElement \}\) === 'end'\) \{ claimKeyboard\(claimRec\(\)\); st\.homeless\+\+; if \(!st\.copying\) \{ st\.caretMoves\+\+; focusSink\(\); \} \}\n      const r = ky\.sync/.test(sk) && /const r = ky\.sync\(\{ owns: !!\(st\.claimed && iOwn\(\)\), yielded: !!\(st\.claimed && yieldedKeyboard\(\)\), active: document\.activeElement \}\);\n      if \(!r\.changed\) return;\n      if \(r\.moveCaret && !st\.copying\) \{ st\.caretMoves\+\+; focusSink\(\); \}\n      if \(r\.release\) releaseHeld\(\);[^\n]*\n      renderKbd\(\); keyboardChanged\(\);/.test(sk),
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
  ok(/const v = sinkBlurVerdict\(a, \{ sink: kbd, root, body: document\.body \}\);\n      if \(v === 'keep'\) return;/.test(bl) && /const frame = v === 'frame';\n      focusSink\(\);\n      if \(frame\) \{\n        st\.frameReclaims\+\+;/.test(bl) && /now - st\.lastFrameCueAt >= RECLAIM_CUE_MS\) \{ st\.lastFrameCueAt = now; showToast\(t\('Typing still goes to the browser — to type in another page, hand back first'\), \{ duration: 3500 \}\); \}/.test(bl) && /\} else if \(ky\.dialogCue\(a\)\) \{ st\.dialogCues\+\+; showToast\(t\('Typing still goes to the browser — click the dialog’s buttons to answer it'\), \{ duration: 3500 \}\); \}/.test(bl),
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
  'Typing still goes to the browser — click the dialog’s buttons to answer it']; // verify r3 (F4): a dialog the user's own press opened
const zh = src('src/lib/i18n-zh.js'), ja = src('src/lib/i18n-ja.js');
const miss = WORDS.filter((w) => !(LW + CI).includes(`t('${w}')`) || !zh.includes(JSON.stringify(w) + ':') || !ja.includes(JSON.stringify(w) + ':'));
ok(miss.length === 0 && zh.includes('"键盘在对话框 — 点画面继续操作网页"') && zh.includes('"你在给 agent 打字（浏览器仍由你接管）"'), `the words (${WORDS.length}) are t() literals with zh + ja — "键盘在对话框 — 点画面继续操作网页" · "你在给 agent 打字（浏览器仍由你接管）"`, miss.join(' | '));

// ═══ §4 THE INPUT-SURFACE CENSUS (verify r3) ═══════════════════════════════════
// N1's class (a surface that takes keys for the user, unknown to the yield — userW's report in another window) closed by a
// CENSUS, not by the next example: every construct under src/lib/** that makes an element take keys (grep-derived: an
// <input> / <textarea> / <select> / <iframe> / <canvas> made or written in a template, a contentEditable, a CodeMirror
// EditorView, an xterm Terminal, a noVNC RFB, a tabindex) is ONE row per (file, construct) naming its CLASS; each class names
// what the user's own press does there, where the focus lands, and the DOM-mini legs above that PROVE it on the real
// keyboard-yield.js; each class whose rule lives in keyboard-yield.js names the §2 control that turns its legs red. A new
// surface without a row, a row whose construct left its file, a class without a green leg — red.
console.log('§4 the input-surface census: every element that takes keys, grep-derived, classified, each class proven');
const SURFACE_CLASSES = {
  text:    { press: 'YIELDS', focus: 'the box itself (CodeMirror: its .cm-content)', script: 'taken back (said once when the user\'s own press elsewhere caused it — Q1)', legs: ['userW', 'textSearch', 'textCm', 'script', 'q1Cue'], controls: ['no-press', 'no-contenteditable', 'no-search-type'] },
  host:    { press: 'YIELDS', focus: 'xterm\'s helper textarea (its screen and the textarea are one input)', script: 'taken back', legs: ['terminal'], controls: ['no-xterm-host'] },
  picture: { press: 'YIELDS', focus: 'xpra: the pane\'s IME textarea · noVNC: its canvas', script: 'taken back', legs: ['n1Xpra', 'n1Vnc', 'n1Script'], controls: ['n1-no-host', 'n1-no-surface'] },
  frame:   { press: 'DECLARED — taken back, said', focus: 'the sink (a press inside a frame is the frame document\'s: nothing tells it from the frame\'s own script — verify r2 H5)', script: 'taken back', legs: ['frameSink', 'h1Frame'], controls: ['blur-frame-blind', 'h1-frame-blind'] },
  choice:  { press: 'DECLARED — the pointer picks', focus: 'the <select> keeps it (its list open); its keys stay the page\'s (F1)', script: 'kept (a script cannot open a list)', legs: ['choiceSelect'], controls: ['no-choice'] },
  control: { press: 'DECLARED — the pointer works', focus: 'the sink takes it back (a checkbox / radio / range / colour / file / read-only field, a role=button chip: its Space / Enter / arrows stay the page\'s)', script: 'taken back', legs: ['controlCheckbox'], controls: ['blur-keeps-all'] },
  widget:  { press: 'DECLARED — not typing', focus: 'the sink takes it back while the view owns (a list\'s arrows / Enter stay the page\'s); yielded, the keys stay where they were and the chip says "not in a text box" (r2\'s held)', script: 'taken back', legs: ['widgetList', 'widgetYielded'], controls: ['blur-keeps-all', 'where-kind'] },
  dialog:  { press: 'TAKEN BACK — said', focus: 'the sink (a dialog\'s own focus / default button: its Enter / Escape stay the page\'s; said once when the user\'s own press opened it — F4; its input is a text row)', script: 'taken back, silent', legs: ['dialogConfirm'], controls: ['no-dialog-cue'] },
  helper:  { press: 'TAKEN BACK — silent', focus: 'the sink (a script-only box: a copy fallback\'s scratch textarea, the terminal\'s paste target — never announced, F2)', script: 'taken back', legs: ['helperCopy'], controls: ['cue-gone-said'] },
  view:    { press: 'THE VIEW', focus: 'its own sink (the keys go to the page)', script: '—', legs: ['picture', 'bar', 'ownTab'], controls: ['no-chrome'] },
  none:    { press: 'NOT A KEY SURFACE', focus: 'nothing (a chart, a measuring context)', script: '—', legs: ['noneCanvas'], controls: [] },
};
/** [file under src/lib, construct, classes joined by +, where] */
const CENSUS = [
  ['app.js', 'input', 'text+control', 'Backup & migrate: the passphrases; the section checkboxes; the import file picker'],
  ['appearance-panel.js', 'select', 'choice', 'theme / font'],
  ['browser-live-window.js', 'textarea', 'view', 'the live view\'s keyboard sink'],
  ['browser-live-window.js', 'input', 'text', 'BROWSE YOURSELF\'s address row (his own box: the H exemption — never a reclaim nor a yield); a page dialog\'s prompt answer (lane browser-stuck) — the .197 integration'],
  ['browser-live-window.js', 'tabindex', 'view+helper+widget', 'the view\'s root (0), its sink (-1); his Tabs pane rows (0, BROWSE YOURSELF: Enter goes to that tab)'],
  ['browser-replay-window.js', 'tabindex', 'widget', 'the replay window (← → Home End Space)'],
  ['browser-trace-view.js', 'input', 'control', 'the Agent browser panel\'s record checkbox'],
  ['browser-who-dialog.js', 'input', 'control', '"Who can use it" radios'],
  ['browser-window.js', 'input', 'text', 'the Web view\'s URL bar'],
  ['browser-window.js', 'iframe', 'frame', 'the Web view\'s page'],
  ['channel-filter-editor.js', 'input', 'text+control', 'the filter\'s fields, its radios'],
  ['channel-group-dialogs.js', 'input', 'text+control', 'a group\'s name; the wake checkbox'],
  ['channel-group-dialogs.js', 'textarea', 'text', 'the group\'s context'],
  ['channel-group-dialogs.js', 'select', 'choice', 'the group picker'],
  // the .197 integration: the other lanes' surfaces, each classed by the census's own rules
  ['channel-mail-frame.js', 'iframe', 'frame', 'a mail\'s formatted body (the sandboxed srcdoc frame, lane channel-rich)'],
  ['channel-thread-pane.js', 'tabindex', 'widget', 'the thread pane\'s reply list (-1, lane channel-threads)'],
  ['channel-thread-pane.js', 'textarea', 'text', 'THE THREAD PANE\'S COMPOSER (lane channel-threads)'],
  ['channel-window.js', 'textarea', 'text', 'THE CHANNEL COMPOSER (a conversation, an agent group)'],
  ['channel-window.js', 'tabindex', 'widget+control', 'the message list (-1, PageUp / Home); an info chip (0)'],
  ['channels-panel.js', 'input', 'text+control', 'search, account fields; the enabled checkbox'],
  ['channels-panel.js', 'select', 'choice', 'account fields'],
  ['chat-input.js', 'input', 'control', 'the attach / file / folder pickers (type=file)'],
  ['chat-input.js', 'textarea', 'text', 'THE CHAT COMPOSER'],
  ['chat-input.js', 'tabindex', 'widget', 'the queue strip\'s items'],
  ['chat-minimap.js', 'input', 'text', 'the TOC filter'],
  ['chat-renderers.js', 'input', 'text', 'AskUserQuestion\'s own answer; an inline edit'],
  ['chat-renderers.js', 'tabindex', 'control', 'role=link names (a peer, a collab agent)'],
  ['chat-search.js', 'input', 'text', 'the chat\'s search box (Ctrl+F)'],
  ['chat-status-bar.js', 'input', 'control', 'the publish checkbox'],
  ['chat-status-bar.js', 'textarea', 'text', 'the goal / note editors'],
  ['chat-view.js', 'tabindex', 'widget', 'the chat container (-1: a press on the message list focuses it)'],
  ['code-editor.js', 'select', 'choice', 'the language select'],
  ['code-editor.js', 'iframe', 'frame', 'the HTML / Markdown preview'],
  ['code-editor.js', 'codemirror', 'text', 'THE CODE EDITOR (.cm-content; its gutter takes no typing)'],
  ['customize-mode.js', 'input', 'text', 'a zone\'s value'],
  ['desktop-app-launcher.js', 'input', 'text+control', 'URL / command / arguments / cwd; keep-profile checkbox'],
  ['desktop-app-window.js', 'tabindex', 'control', 'the scale chip (role=button)'],
  ['dial-address-picker.js', 'input', 'text+control', 'the pairing sheet\'s address radios; the custom address (lane-pairing)'],
  ['docx-viewer.js', 'iframe', 'frame', 'an altChunk (sandboxed)'],
  ['exit-access-dialog.js', 'input', 'control', 'exit access "Who can use it" radios; the ask checkbox (lane-pairing)'],
  ['external-editor.js', 'codemirror', 'text', 'the Ctrl+G split-pane editor'],
  ['file-explorer-ops.js', 'input', 'text+control', 'publish: the page name; public checkbox (rename = the input dialog, utils.js)'],
  ['file-explorer.js', 'input', 'text+control', 'the path bar; the upload pickers; select-mode checkboxes'],
  ['file-explorer.js', 'select', 'choice', 'the view menu'],
  ['file-explorer.js', 'tabindex', 'widget', 'the file list (-1: arrows / Enter / Delete stay the page\'s while you drive)'],
  ['file-viewer.js', 'input', 'text', 'the CSV filter'],
  ['file-viewer.js', 'iframe', 'frame', 'PDF / HTML preview'],
  ['gear-menu.js', 'tabindex', 'widget', 'the ⚙ menu\'s rows (roving tabindex)'],
  ['hex-viewer.js', 'input', 'text', 'jump to offset'],
  ['inbox-window.js', 'tabindex', 'widget', 'the For-you list (0) and the item pane (-1)'],
  ['incident-recorder.js', 'textarea', 'text', '"What went wrong?"'],
  ['jobs-panel.js', 'input', 'text+control', 'job fields; checkboxes'],
  ['jobs-panel.js', 'select', 'choice', 'kind / schedule'],
  ['manage-agents.js', 'input', 'text+control', 'the token paste; the pool member checkboxes'],
  ['manage-agents.js', 'textarea', 'text', 'instructions'],
  ['manage-agents.js', 'tabindex', 'control', 'the re-login chip (role=button)'],
  ['mounts-dialog.js', 'input', 'text+control', 'a mount\'s fields; a read-only key / link'],
  ['mounts-dialog.js', 'textarea', 'text', 'a multi-line field'],
  ['mounts-dialog.js', 'select', 'choice', 'a choice field'],
  ['open-with.js', 'tabindex', 'widget', '"Open with" menu rows'],
  ['picture-shell.js', 'textarea', 'text+helper', 'the paste box (a real box) · copyViaSelection\'s scratch (read-only, the live view\'s own copy)'],
  ['plugin-client.js', 'iframe', 'frame', 'a plugin\'s window'],
  ['plugins-ui.js', 'input', 'text+control', 'install location, flags; checkboxes; the file picker'],
  ['plugins-ui.js', 'select', 'choice', 'the source / mode'],
  ['principal-picker.js', 'input', 'text', 'the picker\'s search box (type=search)'],
  ['reaction-picker.js', 'input', 'text', 'the reaction picker\'s search box (type=search, lane channel-threads)'],
  ['record-clear-ui.js', 'tabindex', 'dialog', 'the "Clear content…" confirm\'s overlay (-1, lane redact)'],
  ['session-card.js', 'input', 'text+control', 'the per-session config input; checkboxes'],
  ['session-card.js', 'select', 'choice', 'the per-session config select'],
  ['session-palette.js', 'input', 'text', 'the Ctrl+K palette'],
  ['session-props.js', 'input', 'control', 'Session Properties checkboxes'],
  ['session-props.js', 'select', 'choice', 'the account / cap selects'],
  ['session-props.js', 'tabindex', 'widget', 'its window (-1: a click in it gives it the key)'],
  ['settings-ui.js', 'input', 'text+control', 'SETTINGS FIELDS: the search box, text / number fields; checkboxes'],
  ['settings-ui.js', 'textarea', 'text', 'a multi-line setting'],
  ['settings-ui.js', 'select', 'choice', 'an enum setting'],
  ['setup-flows.js', 'input', 'text', 'the password dialogs, the onboarding cwd'],
  ['sidebar-mounts.js', 'input', 'text+control', 'machine / pairing fields; checkboxes'],
  ['sidebar-mounts.js', 'textarea', 'text+control', 'a key paste; read-only share links / tokens (their Copy button copies)'],
  ['sidebar-mounts.js', 'select', 'choice', 'a mode'],
  ['sidebar-rail.js', 'input', 'text', 'Ports / System search, a machine name'],
  ['sidebar-rail.js', 'select', 'choice', 'the rail\'s pickers'],
  ['sidebar-rail.js', 'canvas', 'none', 'the System charts'],
  ['sidebar-tasks.js', 'input', 'text+control', 'a reason; checkboxes'],
  ['sidebar-tasks.js', 'select', 'choice', 'the bind picker'],
  ['sidebar-workbench.js', 'select', 'choice', 'the host select'],
  ['sidebar.js', 'input', 'control', 'the filter checkboxes'],
  ['task-detail.js', 'input', 'text+control', 'title / backlog / progress / folders / context; checkboxes; the colour'],
  ['task-detail.js', 'textarea', 'text', 'the objective'],
  ['task-detail.js', 'select', 'choice', 'browser / events / caps'],
  ['task-log.js', 'input', 'text', 'search, an item\'s title, add'],
  ['task-log.js', 'textarea', 'text', 'an item\'s detail'],
  ['task-log.js', 'select', 'choice', 'status / date filters, priority'],
  ['taskbar.js', 'tabindex', 'widget', 'taskbar buttons, the group chooser\'s rows'],
  ['telemetry-client.js', 'canvas', 'none', 'the GPU probe (never in the document)'],
  ['terminal.js', 'input', 'text+control', 'the font size (number); the override checkbox'],
  ['terminal.js', 'textarea', 'helper', 'the Ctrl+C copy fallback\'s scratch'],
  ['terminal.js', 'select', 'choice', 'theme / font'],
  ['terminal.js', 'canvas', 'none', 'the monospace measure'],
  ['terminal.js', 'contenteditable', 'helper+text', 'the Ctrl+V paste target (script-only) · the phone\'s paste pad (a real box)'],
  ['terminal.js', 'xterm', 'host', 'A TERMINAL'],
  ['terminal.js', 'tabindex', 'helper', 'the paste target (-1)'],
  ['theme-editor.js', 'input', 'text+control', 'names / hex values; the colour pickers'],
  ['theme-editor.js', 'select', 'choice', '"start from"'],
  ['usage-dashboard.js', 'input', 'control', 'a checkbox'],
  ['usage-dashboard.js', 'select', 'choice', 'a range'],
  ['usage-dashboard.js', 'canvas', 'none', 'charts'],
  ['usage-window.js', 'input', 'text', 'dates, prices'],
  ['usage-window.js', 'canvas', 'none', 'charts'],
  ['user-todos-row.js', 'textarea', 'text', 'THE FOR-YOU REPLY BOX'],
  ['utils.js', 'textarea', 'text+helper', 'THE INPUT DIALOG\'s box (showInputDialog, multi-line) · copyText\'s fallback scratch'],
  ['utils.js', 'tabindex', 'dialog', 'createModalShell\'s overlay (-1), a confirm\'s own focus'],
  ['vnc-view.js', 'novnc', 'picture', 'THE DESKTOP / a VNC app (noVNC\'s canvas)'],
  ['window-share.js', 'input', 'control', 'the wake / hold checkboxes'],
  ['window-share.js', 'textarea', 'text', 'the share note'],
  ['window.js', 'canvas', 'none', 'the chip text measure'],
  ['xpra-view.js', 'textarea', 'picture', 'the xpra pane\'s IME textarea'],
  ['xpra-view.js', 'canvas', 'picture', 'the xpra pane\'s windows'],
];
const SURFACE_KINDS = {
  input: /createElement\(['"]input['"]\)|<input\b/,
  textarea: /createElement\(['"]textarea['"]\)|<textarea\b/,
  select: /createElement\(['"]select['"]\)|<select\b/,
  iframe: /createElement\(['"]iframe['"]\)|<iframe\b/,
  canvas: /createElement\(['"]canvas['"]\)|<canvas\b/,
  contenteditable: /\.contentEditable\s*=|\bcontenteditable\s*=/i,
  codemirror: /new EditorView\(/,
  xterm: /new Terminal\(/,
  novnc: /new RFB\(/,
  tabindex: /\.tabIndex\s*=\s*-?\d|\btabindex\s*=\s*\\?["']?-?\d|setAttribute\(['"]tabindex['"]/i,
};
/** comment lines and trailing `// …` comments out (a comment naming "<select>" is no surface; a URL's `://` stays) */
const codeOnly = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/(^|[\s;,)])\/\/\s.*$/, '$1')).join('\n');
function surfaceHits(files) { const out = new Set(); for (const [f, text] of files) { const code = codeOnly(text); for (const [k, re] of Object.entries(SURFACE_KINDS)) if (re.test(code)) out.add(f + ' ' + k); } return out; }
function censusVerdict(hits, rows) {
  const keys = rows.map((r) => r[0] + ' ' + r[1]);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  const unclassified = [...hits].filter((h) => !keys.includes(h)).sort();
  const dead = keys.filter((k) => !hits.has(k)).sort();
  const badClass = rows.filter((r) => !String(r[2]).split('+').every((c) => SURFACE_CLASSES[c])).map((r) => r[0] + ' ' + r[1] + ' → ' + r[2]);
  return { unclassified, dead, dup, badClass, ok: !unclassified.length && !dead.length && !dup.length && !badClass.length };
}
const LIB = (() => { const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); return walk('src/lib').filter((f) => f.endsWith('.js')).map((f) => [f.replace(/^src\/lib\//, ''), fs.readFileSync(path.join(REPO, f), 'utf8')]); })();
const HITS = surfaceHits(LIB);
const CV = censusVerdict(HITS, CENSUS);
ok(CV.ok && HITS.size === CENSUS.length && HITS.size >= 100, `the census: ${HITS.size} (file, construct) surfaces in ${LIB.length} src/lib files — every one classified, no dead row, no duplicate, every class known`, J(CV));
{ const byClass = {}; for (const r of CENSUS) for (const c of r[2].split('+')) (byClass[c] ||= []).push(r[0].replace(/\.js$/, '') + ':' + r[1]);
  const unused = Object.keys(SURFACE_CLASSES).filter((c) => !byClass[c]);
  ok(!unused.length, `every class has rows (${Object.entries(byClass).map(([c, l]) => c + ' ' + l.length).join(' · ')})`, unused.join(', '));
  const legless = Object.entries(SURFACE_CLASSES).filter(([, v]) => !v.legs.length || !v.legs.every((l) => R[l] && R[l].ok)).map(([c]) => c);
  ok(!legless.length, `every class is PROVEN on the real keyboard-yield.js by its DOM-mini legs (${Object.entries(SURFACE_CLASSES).map(([c, v]) => c + ': ' + v.legs.join('/')).join(' · ')})`, legless.join(', '));
  const tags = new Map(CONTROLS.map((c) => [c.tag, c]));
  const uncontrolled = Object.entries(SURFACE_CLASSES).filter(([c, v]) => c !== 'none' && !v.controls.some((t) => tags.has(t) && tags.get(t).red.some((l) => v.legs.includes(l)))).map(([c]) => c);
  ok(!uncontrolled.length, 'every class whose rule lives in keyboard-yield.js is reddened by a §2 patched copy that removes it (its legs in the control\'s red set); "none" has no rule to remove', uncontrolled.join(', '));
  console.log('  census by class: ' + Object.entries(SURFACE_CLASSES).map(([c, v]) => `\n    ${c.padEnd(8)} ${v.press} — ${v.focus}\n             rows: ${(byClass[c] || []).join(', ')}`).join('')); }
// the census's own controls: a row removed ⇒ its surface named unclassified; a construct added to a file ⇒ named; a row whose
// construct left its file ⇒ dead; an unknown class ⇒ named
{ const drop = CENSUS.filter((r) => !(r[0] === 'code-editor.js' && r[1] === 'codemirror'));
  const d = censusVerdict(HITS, drop);
  ok(!d.ok && J(d.unclassified) === J(['code-editor.js codemirror']), 'NEGATIVE CONTROL (the code editor\'s row removed): the census names "code-editor.js codemirror" unclassified', J(d));
  const added = surfaceHits([...LIB.map(([f, t]) => f === 'hex-viewer.js' ? [f, t + "\nconst x = document.createElement('iframe');\n"] : [f, t])]);
  const a = censusVerdict(added, CENSUS);
  ok(!a.ok && J(a.unclassified) === J(['hex-viewer.js iframe']), 'NEGATIVE CONTROL (a frame added to hex-viewer.js): the census names "hex-viewer.js iframe" unclassified', J(a));
  const gone = surfaceHits(LIB.map(([f, t]) => f === 'window.js' ? [f, t.replace(/document\.createElement\('canvas'\)/g, 'null')] : [f, t]));
  const g = censusVerdict(gone, CENSUS);
  ok(!g.ok && J(g.dead) === J(['window.js canvas']), 'NEGATIVE CONTROL (window.js\'s canvas gone): its row is named DEAD', J(g));
  const bad = censusVerdict(HITS, CENSUS.map((r) => r[0] === 'chat-input.js' && r[1] === 'textarea' ? [r[0], r[1], 'texty', r[3]] : r));
  ok(!bad.ok && bad.badClass.length === 1, 'NEGATIVE CONTROL (a row with an unknown class): named', J(bad.badClass));
  const commented = surfaceHits([['x.js', "// a <select> in a comment\n * <iframe> in a doc comment\nconst u = 'https://x'; // <textarea> trailing\n"]]);
  ok(commented.size === 0, 'the grep reads CODE: a surface named only in a comment (line, doc, trailing) is no surface; a URL\'s :// keeps its line', J([...commented])); }

console.log(`\n(${Date.now() - t0} ms)`);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
