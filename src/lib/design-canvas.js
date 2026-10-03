// THE DESIGN CANVAS — the DOM core (lane design-window L2, 2026-10-02; SharedContext/vibespace-design-window-design.md
// §3.5). Pan / zoom / fit / pages / frames / notes over one viewport, with NO App dependency (no utils.js, no i18n.js,
// no ws): the Design window (src/lib/design-window.js) and the published page's standalone runtime
// (src/design-viewer-entry.js → public/design-viewer.js) both draw through it. Every decision is a PURE rule in
// ./design-canvas-model.js (gate: scripts/test-design-canvas.mjs).
//
//   · THE VIEWPORT sits at NET zoom 1 (the caller hands `counterZoom` — the window passes utils.js COUNTER_ZOOM; the
//     published page has no body zoom): the pointer is read in viewport px and the world is a transform
//     `translate(x, y) scale(z)` of one layer, so a frame is drawn at exactly its artboard size × z.
//   · ONE FRAME PER ARTBOARD: an `<iframe sandbox="allow-scripts" srcdoc>` — never allow-same-origin (an artboard is
//     agent-written HTML rendered inside the owner's logged-in page; the frame is an opaque origin with no cookies and
//     no same-origin reach). `updateFrame` swaps ONE srcdoc in place (the element, the view and every other frame
//     untouched); a frame the read refused draws a NAMED card, never a blank box.
//   · NAVIGATING vs USING: on the canvas a transparent SHIELD lies over every frame, so wheel / drag / pinch move the
//     canvas wherever the pointer is; the focused view (one artboard, fit-width) and the pick mode lift the shields —
//     the artboard is then live (its own scroll, its own clicks, the picker's outline).
//   · THE PICK CHANNEL: one `message` listener per canvas (bound to the caller's AbortSignal) believes a message only
//     from one of ITS frames (`routeMessage`: event.source IS the frame's window), a kind in the closed set, every
//     field bounded (`pickFence`); the canvas says to its frames only what `frameSay` lets out (`design-mode`, and the
//     changes strip's `design-style` / `design-undo` and the Tweaks panel's `design-tweak` through `tell`). A `design-edit` (lane design-changes) goes to the
//     `listen` subscribers — a TEXT edit only from the frame the user was typing in (`EDIT_GRACE_MS`), rate-gated.
//   · PRESENT (lane design-present, design 003 §2.6): the page's artboards in READING order, one at a time, whole and
//     fitted to the screen; ← → Space / a click / a swipe step, Esc or × ends and the view comes back. The viewport asks
//     for fullscreen on the user's press (a refusal leaves it filling its pane); the frames stay SHIELDED meanwhile.
//   · Lifecycle: every listener on the caller's signal; `dispose()` aborts them and drops the DOM.
import {
  zoomStep, zoomAt, panBy, pinchView, fitView, focusView, boundsOf, normView, toScreen, toWorld,
  pagesOf, pageOf, notesOn, launchOf, NOTE_COLOR_VARS, routeMessage, frameSrcdoc, clampZoom, frameKeyGate, frameSay,
  EDIT_GRACE_MS, presentOrder, presentView, presentKey, presentGesture, presentStep,
} from './design-canvas-model.js';

/** THE CANVAS'S OWN STYLESHEET — one copy for the window and the published page (injected once per document by
 *  `ensureCanvasStyle`). Theme tokens only (a literal only as a var() fallback): VibeSpace's themes resolve them in the
 *  window; the published page's runtime defines them on its root. Font sizes on the world are divided back by the zoom
 *  (`--dc-inv`) where words must stay readable (names, refusals). */
export const CANVAS_CSS = `
.dc-viewport{position:absolute;inset:0;overflow:hidden;touch-action:none;outline:none;cursor:grab;background:var(--bg-workspace,#111122);-webkit-user-select:none;user-select:none}
.dc-viewport.dc-dragging{cursor:grabbing}
.dc-world{position:absolute;left:0;top:0;transform-origin:0 0}
.dc-frame{position:absolute;background:var(--paper,#fff);box-shadow:var(--shadow-window,0 8px 32px rgba(0,0,0,.4))}
.dc-frame-doc{display:block;width:100%;height:100%;border:0;background:var(--paper,#fff)}
.dc-frame-shield{position:absolute;inset:0}
.dc-frame-label{position:absolute;left:0;bottom:100%;transform:scale(var(--dc-inv,1));transform-origin:0 100%;max-width:calc(100% / var(--dc-inv,1));padding:0 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 12px/1.3 system-ui,sans-serif;color:var(--text-secondary,#94a3b8)}
.dc-frame-refused{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font:500 calc(14px * var(--dc-inv,1))/1.4 system-ui,sans-serif;color:var(--red,#e55);background:color-mix(in srgb,var(--red,#e55) 6%,var(--paper,#fff));border:2px dashed color-mix(in srgb,var(--red,#e55) 55%,transparent);overflow:hidden;word-break:break-word}
.dc-frame-dup{outline:2px solid var(--yellow,#e5c07b)}
.dc-note{position:absolute;padding:10px 12px;border-radius:var(--radius,8px);background:color-mix(in srgb,var(--dc-note,var(--text-dim,#8890a8)) 22%,var(--bg-dialog,#1a1a30));border:1px solid color-mix(in srgb,var(--dc-note,var(--text-dim,#8890a8)) 60%,transparent);color:var(--text,#e2e8f0);font:13px/1.45 system-ui,sans-serif;white-space:pre-wrap;word-break:break-word}
.dc-focused .dc-frame-label{display:none}
.dc-pick .dc-frame{outline:1px dashed color-mix(in srgb,var(--accent,#2dd4bf) 70%,transparent);outline-offset:2px}
.dc-present{cursor:pointer;background:var(--dc-present-bg,#000)}
.dc-present.dc-present-idle{cursor:none}
.dc-present .dc-frame{box-shadow:none}
.dc-present .dc-frame-label{display:none}
.dc-present-bar{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:2;display:flex;align-items:center;gap:2px;max-width:calc(100% - 24px);padding:4px;border-radius:999px;background:color-mix(in srgb,var(--bg-dialog,#1a1a30) 90%,transparent);border:1px solid var(--border,rgba(255,255,255,.08));color:var(--text,#e2e8f0);font:500 13px/1 system-ui,sans-serif;cursor:default;transition:opacity .3s}
.dc-present-idle .dc-present-bar{opacity:0}
.dc-present-bar button{flex:none;min-width:36px;height:36px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:20px;line-height:1;cursor:pointer}
.dc-present-bar button:hover,.dc-present-bar button:focus-visible{background:color-mix(in srgb,var(--text,#e2e8f0) 14%,transparent);outline:none}
.dc-present-count{flex:none;padding:0 6px;font-variant-numeric:tabular-nums;white-space:nowrap}
.dc-present-title{min-width:0;max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary,#94a3b8)}
@media (hover:none),(max-width:768px){.dc-present-bar button{min-width:44px;height:44px}}
`;
/** Inject the canvas stylesheet into `doc` once. */
export function ensureCanvasStyle(doc = document) {
  if (!doc || doc.getElementById('dc-canvas-style')) return;
  const st = doc.createElement('style');
  st.id = 'dc-canvas-style';
  st.textContent = CANVAS_CSS;
  (doc.head || doc.documentElement).appendChild(st);
}

const mk = (doc, tag, cls) => { const e = doc.createElement(tag); if (cls) e.className = cls; return e; };
const DRAG_SLOP_PX = 4;
const WHEEL_ZOOM_RATE = 0.0015;

/**
 * createDesignCanvas(host, opts) → the canvas API.
 *   opts.signal        — the caller's AbortSignal (a window's `_listenerCtl.signal`)
 *   opts.counterZoom   — CSS `zoom` for the viewport (net zoom 1 under the body's DPI zoom), or null
 *   opts.pickerSrc     — the picker script injected into every frame's head ('' = no picker: the published page)
 *   opts.words         — { refused(code, why) → string, missing → string, untitled → string }
 *   opts.onPick(msg, frame) / opts.onKey(msg, frame) — a fenced frame message
 *   opts.onActivate(file, how) — a frame's dblclick ('dblclick') or a touch tap on its shield ('tap')
 *   opts.onChange(state)      — view / page / focus / pick / present changed ({view, page, focused, pick, present})
 */
export function createDesignCanvas(host, { signal = null, counterZoom = null, pickerSrc = '', words = {}, onPick = null, onKey = null, onActivate = null, onChange = null } = {}) {
  const doc = host.ownerDocument || document;
  const win = doc.defaultView || window;
  const ctl = new AbortController();
  const sig = ctl.signal;
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', () => ctl.abort(), { once: true }); }
  const L = { signal: sig };
  const W = {
    refused: (code, why) => `artboard refused: ${why || code}`,
    missing: 'artboard refused: listed in design.json but not in the folder',
    ...words,
  };

  ensureCanvasStyle(doc);
  const vp = mk(doc, 'div', 'dc-viewport');
  vp.tabIndex = 0;
  vp.setAttribute('role', 'application');
  if (counterZoom) vp.style.zoom = counterZoom;
  const world = mk(doc, 'div', 'dc-world');
  vp.appendChild(world);
  host.appendChild(vp);

  const st = {
    view: { x: 0, y: 0, z: 1 }, frames: [], notes: [], manifest: {}, pages: [{ id: '', name: '' }], page: '',
    focused: null, prevView: null, pick: false, pickColor: '', viewSet: false,
    present: null, // presenting: { order: [file], i, fs, back: {view, page, focused, prevView} }
  };
  const els = new Map(); // file → { wrap, label, iframe|null, card|null, shield, srcdoc, html }
  let swapFn = null; // lane design-tweaks: judges "only the user's layer moved" (design-user-layer.js tweakSwap, handed in by setSwap)
  const noteEls = [];

  const paneSize = () => { const r = vp.getBoundingClientRect(); return { w: r.width, h: r.height }; };
  const subs = new Set(); // `listen` subscribers (a seam module of the window): ({type:'change', state} | {type:'edit', msg, frame})
  const tellSubs = (ev) => { for (const fn of subs) { try { fn(ev); } catch { /* observer */ } } };
  const emit = () => {
    const state = { view: { ...st.view }, page: st.page, focused: st.focused, pick: st.pick, present: presenting() };
    try { onChange?.(state); } catch { /* observer */ }
    if (subs.size) tellSubs({ type: 'change', state });
  };
  function applyView() {
    const v = normView(st.view);
    st.view = v;
    world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
    world.style.setProperty('--dc-inv', String(1 / v.z));
    emit();
  }
  const setView = (v) => { st.view = normView(v); applyView(); };

  // ── frames ──
  function frameMode(rec) {
    const live = !st.present && (st.pick || st.focused === rec.file);
    rec.shield.style.display = live ? 'none' : '';
    if (rec.iframe) rec.iframe.tabIndex = live ? 0 : -1;
  }
  /** THE ONE door to a frame: only what the outgoing fence lets out. */
  function say(rec, msg) {
    const m = frameSay(msg);
    const w = rec && rec.iframe && rec.iframe.contentWindow;
    if (!m || !w) return false;
    try { w.postMessage(m, '*'); return true; } catch { return false; } // a frame mid-navigation
  }
  function sayMode(rec) { say(rec, { kind: 'design-mode', pick: st.pick, color: st.pickColor }); }
  function drawBody(rec, f) {
    if (f.html != null && !f.refused) {
      const srcdoc = frameSrcdoc(f.html, pickerSrc);
      if (rec.card) { rec.card.remove(); rec.card = null; }
      if (!rec.iframe) {
        const ifr = mk(doc, 'iframe', 'dc-frame-doc');
        ifr.setAttribute('sandbox', 'allow-scripts'); // NEVER allow-same-origin — test-design-canvas pins it
        ifr.setAttribute('referrerpolicy', 'no-referrer');
        ifr.title = f.title;
        ifr.addEventListener('load', () => { rec.live = true; sayMode(rec); }, L);
        rec.wrap.insertBefore(ifr, rec.shield);
        rec.iframe = ifr;
      }
      if (rec.srcdoc !== srcdoc) {
        // lane design-tweaks: only the user's layer moved (a Tweaks write) — the LIVE frame restyles in place, no reload
        const swap = swapFn && rec.live && rec.html != null ? swapFn(rec.html, f.html) : null;
        rec.srcdoc = srcdoc;
        if (swap) { for (const m of swap) say(rec, m); } else { rec.live = false; rec.iframe.srcdoc = srcdoc; }
      }
      rec.html = f.html;
    } else {
      if (rec.iframe) { rec.iframe.remove(); rec.iframe = null; rec.srcdoc = null; }
      if (!rec.card) { rec.card = mk(doc, 'div', 'dc-frame-refused'); rec.wrap.insertBefore(rec.card, rec.shield); }
      const r = f.refused || { code: 'empty', why: '' };
      rec.card.textContent = r.code === 'missing' && !r.why ? W.missing : W.refused(r.code, r.why);
      rec.html = null;
    }
    frameMode(rec);
  }
  function placeFrame(rec, f) {
    const s = rec.wrap.style;
    s.left = f.x + 'px'; s.top = f.y + 'px'; s.width = f.w + 'px';
    s.height = (st.focused === f.file && rec.focusH ? rec.focusH : f.h) + 'px';
    rec.label.textContent = f.title;
    rec.label.title = `${f.file} · ${f.w}×${f.h}`;
    rec.wrap.dataset.file = f.file;
    rec.wrap.classList.toggle('dc-frame-dup', !!f.dup);
  }
  function makeFrame(f) {
    const wrap = mk(doc, 'div', 'dc-frame');
    const label = mk(doc, 'div', 'dc-frame-label');
    const shield = mk(doc, 'div', 'dc-frame-shield');
    wrap.append(label, shield);
    world.appendChild(wrap);
    const rec = { wrap, label, shield, iframe: null, card: null, srcdoc: null, html: null, file: f.file, focusH: 0 };
    shield._dcFile = f.file;
    return rec;
  }
  function drawNotes() {
    for (const n of noteEls.splice(0)) n.remove();
    if (st.focused || st.present) return;
    for (const n of notesOn(st.manifest, st.page, st.pages)) {
      const el = mk(doc, 'div', 'dc-note');
      el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; el.style.width = n.w + 'px';
      el.style.setProperty('--dc-note', NOTE_COLOR_VARS[n.color]);
      el.dataset.color = n.color;
      el.textContent = n.text; // agent-written — text, never markup
      world.appendChild(el);
      noteEls.push(el);
    }
  }
  function showPage() {
    for (const [file, rec] of els) {
      const f = st.frames.find((x) => x.file === file);
      const on = !!f && f.page === st.page && (!st.focused || st.focused === file) && (!st.present || st.present.order[st.present.i] === file);
      rec.wrap.style.display = on ? '' : 'none';
    }
    drawNotes();
  }
  const pageFrames = () => st.frames.filter((f) => f.page === st.page);

  /** Lay out a whole read ({title, manifest, frames}). `keepView` keeps pan / zoom / page / focus (a reload, a
   *  manifest change); a frame whose document did not change is not reloaded. */
  function setFrames(input, { keepView = false } = {}) {
    const frames = Array.isArray(input && input.frames) ? input.frames : [];
    st.manifest = (input && input.manifest) || {};
    st.pages = pagesOf(st.manifest);
    st.frames = frames.map((f) => ({ ...f, page: pageOf(f, st.pages) }));
    const keep = new Set(st.frames.map((f) => f.file));
    for (const [file, rec] of els) if (!keep.has(file)) { rec.wrap.remove(); els.delete(file); keyGates.delete(file); }
    for (const f of st.frames) {
      let rec = els.get(f.file);
      if (!rec) { rec = makeFrame(f); els.set(f.file, rec); }
      placeFrame(rec, f);
      drawBody(rec, f);
    }
    if (st.focused && !keep.has(st.focused)) { st.focused = null; vp.classList.remove('dc-focused'); }
    if (!keepView || !st.viewSet) {
      // the first read (or a fresh layout): the manifest's launch — a page fitted, or one artboard focused
      st.viewSet = true;
      if (st.present) endPresent();
      if (st.focused) unfocus(false);
      const l = launchOf(st.manifest, st.frames, st.pages);
      const lf = l.view === 'focused' ? st.frames.find((x) => x.file === l.file) : null;
      st.page = lf ? lf.page : l.page;
      showPage();
      fit();
      if (lf) focus(lf.file);
      return;
    }
    if (!st.pages.some((p) => p.id === st.page)) st.page = st.pages[0].id;
    if (st.present) { presentReorder(); return; }
    showPage();
    if (st.focused) refocus(); else applyView();
  }

  /** Swap ONE artboard's document in place (`html` null + `refused` = it is refused now). false = no such frame. */
  function updateFrame(file, html, refused = null) {
    const rec = els.get(file);
    const f = st.frames.find((x) => x.file === file);
    if (!rec || !f) return false;
    f.html = html; f.refused = refused;
    drawBody(rec, f);
    return true;
  }

  // ── view verbs ──
  function fit() {
    if (st.focused) { refocus(); return; }
    const b = boundsOf([...pageFrames(), ...notesOn(st.manifest, st.page, st.pages).map((n) => ({ x: n.x, y: n.y, w: n.w, h: 80 }))]);
    setView(fitView(b, paneSize()));
  }
  function zoomBy(dir, anchor = null) {
    const p = paneSize();
    setView(zoomAt(st.view, zoomStep(st.view.z, dir), anchor || { x: p.w / 2, y: p.h / 2 }));
  }
  function zoomTo(z, anchor = null) { const p = paneSize(); setView(zoomAt(st.view, z, anchor || { x: p.w / 2, y: p.h / 2 })); }
  function setPage(id) {
    if (!st.pages.some((p) => p.id === id)) return false;
    if (st.present) endPresent();
    if (st.focused) unfocus(false);
    st.page = id;
    showPage();
    fit();
    return true;
  }
  function refocus() {
    const f = st.frames.find((x) => x.file === st.focused);
    const rec = f && els.get(f.file);
    if (!f || !rec) return;
    const fv = focusView(f, paneSize());
    rec.focusH = fv.frameH;
    placeFrame(rec, f);
    setView(fv.view);
  }
  /** THE FOCUSED VIEW: one artboard at fit-width, live (shield lifted), the others hidden. null = back to the canvas. */
  function focus(file) {
    if (!file) { unfocus(); return true; }
    const f = st.frames.find((x) => x.file === file);
    if (!f) return false;
    if (st.present) endPresent();
    if (!st.focused) st.prevView = { ...st.view, page: st.page };
    if (st.focused && st.focused !== file) { const old = els.get(st.focused); if (old) { old.focusH = 0; const of = st.frames.find((x) => x.file === st.focused); if (of) placeFrame(old, of); frameMode(old); } }
    st.page = f.page;
    st.focused = file;
    vp.classList.add('dc-focused');
    showPage();
    for (const rec of els.values()) frameMode(rec);
    refocus();
    return true;
  }
  function unfocus(restore = true) {
    if (!st.focused) return;
    const rec = els.get(st.focused);
    const f = st.frames.find((x) => x.file === st.focused);
    st.focused = null;
    vp.classList.remove('dc-focused');
    if (rec) { rec.focusH = 0; if (f) placeFrame(rec, f); }
    for (const r of els.values()) frameMode(r);
    const prev = st.prevView;
    st.prevView = null;
    if (restore && prev && st.pages.some((p) => p.id === prev.page)) { st.page = prev.page; showPage(); setView(prev); }
    else { showPage(); fit(); }
  }
  /** Pick mode: every frame live, the picker told (`color` = the outline, the theme's accent). */
  let pickOffAt = 0; // a text edit committed by the pick mode ending (the frame commits on design-mode off) still counts
  function setPick(on, color = '') {
    if (st.pick && !on) pickOffAt = Date.now();
    if (on && st.present) endPresent();
    st.pick = !!on;
    st.pickColor = String(color || '').slice(0, 40);
    vp.classList.toggle('dc-pick', st.pick);
    for (const rec of els.values()) { frameMode(rec); sayMode(rec); }
    emit();
  }

  // ── PRESENT (lane design-present): the page's artboards in reading order (presentOrder), one at a time, whole and
  //    fitted to the screen (presentView); a key, a click or a swipe steps (presentKey / presentGesture / presentStep).
  //    Fullscreen is asked for on the user's press — a refusal (a page framed without the permission, a phone) leaves
  //    the viewport filling its pane. The chrome (‹ n / N title › ×) is text; it fades after PRESENT_IDLE_MS of quiet.
  const PRESENT_IDLE_MS = 2500;
  let pbar = null, pcount = null, ptitle = null, pprev = null, pnext = null, pexit = null, idleTimer = 0;
  function presenting() { const p = st.present; return p ? { i: p.i, n: p.order.length, file: p.order[p.i] } : null; }
  function wake() {
    if (!st.present) return;
    vp.classList.remove('dc-present-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (st.present) vp.classList.add('dc-present-idle'); }, PRESENT_IDLE_MS);
  }
  function presentChrome(words) {
    const w = { prev: 'Previous artboard', next: 'Next artboard', exit: 'End the presentation', bar: 'Presentation', ...(words || {}) };
    if (!pbar) {
      const button = (cls, glyph, step) => {
        const b = mk(doc, 'button', cls);
        b.type = 'button';
        b.textContent = glyph;
        b.addEventListener('click', (e) => { e.stopPropagation(); presentGo(step); try { vp.focus({ preventScroll: true }); } catch { /* gone */ } }, L);
        return b;
      };
      pbar = mk(doc, 'div', 'dc-present-bar');
      pbar.setAttribute('role', 'toolbar');
      pprev = button('dc-present-prev', '\u2039', 'prev');
      pcount = mk(doc, 'span', 'dc-present-count');
      ptitle = mk(doc, 'span', 'dc-present-title');
      pnext = button('dc-present-next', '\u203a', 'next');
      pexit = button('dc-present-exit', '\u00d7', 'exit');
      pbar.append(pprev, pcount, ptitle, pnext, pexit);
      vp.appendChild(pbar);
    }
    pbar.setAttribute('aria-label', String(w.bar));
    for (const [b, label] of [[pprev, w.prev], [pnext, w.next], [pexit, w.exit]]) { b.title = String(label); b.setAttribute('aria-label', String(label)); }
    pbar.style.display = '';
  }
  function presentShow() {
    const p = st.present;
    if (!p) return;
    const f = st.frames.find((x) => x.file === p.order[p.i]);
    showPage();
    if (f) setView(presentView(f, paneSize()));
    pcount.textContent = `${p.i + 1} / ${p.order.length}`;
    ptitle.textContent = f ? f.title : ''; // agent-written — text
    pprev.style.visibility = p.i > 0 ? '' : 'hidden';
    pnext.style.visibility = p.i < p.order.length - 1 ? '' : 'hidden';
  }
  /** Start (on) or end presenting. `words` = the chrome's labels {prev, next, exit, bar}; `fullscreen` = ask for it
   *  (only on a user's press — the browser refuses it otherwise). → false when the page has nothing to present. */
  function present(on, { words = null, fullscreen = true } = {}) {
    if (!on) { endPresent(); return true; }
    const order = presentOrder(st.frames, st.page);
    if (!order.length) return false;
    if (st.present) return true;
    if (st.pick) setPick(false);
    const from = st.focused && order.includes(st.focused) ? order.indexOf(st.focused) : 0;
    st.present = { order, i: from, fs: false, back: { view: { ...st.view }, page: st.page, focused: st.focused, prevView: st.prevView ? { ...st.prevView } : null } };
    if (st.focused) unfocus(false);
    vp.classList.add('dc-present');
    presentChrome(words);
    for (const r of els.values()) frameMode(r);
    presentShow();
    wake();
    try { vp.focus({ preventScroll: true }); } catch { /* not focusable yet */ }
    if (fullscreen && doc.fullscreenEnabled && !doc.fullscreenElement && typeof vp.requestFullscreen === 'function') {
      st.present.fs = true;
      try { Promise.resolve(vp.requestFullscreen()).catch(() => { if (st.present) st.present.fs = false; }); } catch { st.present.fs = false; }
    }
    emit();
    return true;
  }
  function endPresent() {
    const p = st.present;
    if (!p) return;
    st.present = null;
    clearTimeout(idleTimer);
    vp.classList.remove('dc-present', 'dc-present-idle');
    if (pbar) pbar.style.display = 'none';
    if (doc.fullscreenElement === vp) { try { Promise.resolve(doc.exitFullscreen()).catch(() => {}); } catch { /* left already */ } }
    for (const r of els.values()) frameMode(r);
    const b = p.back;
    if (st.pages.some((x) => x.id === b.page)) st.page = b.page;
    showPage();
    if (b.focused && st.frames.some((x) => x.file === b.focused)) { if (b.prevView) setView(b.prevView); focus(b.focused); }
    else setView(b.view);
    emit();
  }
  /** One step: 'next' | 'prev' | 'first' | 'last' | 'exit'. → whether the presentation moved (or ended). */
  function presentGo(step) {
    const p = st.present;
    if (!p) return false;
    if (step === 'exit') { endPresent(); return true; }
    wake();
    const n = presentStep(p.i, p.order.length, step);
    if (n < 0 || n === p.i) return false;
    p.i = n;
    presentShow();
    return true;
  }
  /** A re-read while presenting: the same artboard stays on screen when it is still there (the order may change). */
  function presentReorder() {
    const p = st.present;
    const order = presentOrder(st.frames, st.page);
    if (!order.length) { endPresent(); return; }
    const k = order.indexOf(p.order[p.i]);
    p.order = order;
    p.i = k >= 0 ? k : Math.min(p.i, order.length - 1);
    for (const r of els.values()) frameMode(r);
    presentShow();
  }
  // the browser's own way out of fullscreen (its Esc, F11) ends the presentation with it
  doc.addEventListener('fullscreenchange', () => {
    const p = st.present;
    if (!p) return;
    if (doc.fullscreenElement === vp) { p.fs = true; return; }
    if (p.fs) endPresent();
  }, L);

  // ── the pick channel ──
  // A KEY is the user's only from the frame that HAS the keyboard (its iframe is the document's active element — the
  // picker's keydown can only fire there), and at a human rate: a script's flood from any frame is muted
  // (design-canvas-model.js frameKeyGate). A pick needs neither: the composer the user sees is the fence's own text.
  const keyGates = new Map(); // file → the frame-key gate record
  const editGates = new Map(); // file → the same gate, for text edits
  // THE KEYBOARD'S FRAME (lane design-changes): a TEXT edit is believed only from the frame the user is typing in, or left
  // less than EDIT_GRACE_MS ago (a click away commits the edit). Chrome fires NO blur on the iframe ELEMENT when focus
  // leaves a frame (measured: test-design-window A⑧) — this page's window blurs when a frame takes the keyboard and gets
  // focus back when it leaves; a move straight to another frame is seen at the next report.
  let kbFile = null;
  const frameOf = (el) => { for (const [f, r] of els) if (r.iframe && r.iframe === el) return f; return null; };
  win.addEventListener('blur', () => { kbFile = frameOf(doc.activeElement) || kbFile; }, L);
  win.addEventListener('focus', () => { const r = kbFile && els.get(kbFile); if (r) r.leftAt = Date.now(); kbFile = null; }, L);
  function typedIn(file) {
    const cur = frameOf(doc.activeElement);
    if (kbFile && kbFile !== cur) { const r = els.get(kbFile); if (r) r.leftAt = Date.now(); }
    kbFile = cur;
    const r = els.get(file);
    return !!r && !!r.iframe && (cur === file || Date.now() - (r.leftAt || 0) < EDIT_GRACE_MS);
  }
  win.addEventListener('message', (ev) => {
    const frames = [];
    for (const [file, rec] of els) {
      const f = st.frames.find((x) => x.file === file);
      if (rec.iframe && f) frames.push({ win: rec.iframe.contentWindow, file, w: f.w, h: f.h });
    }
    const hit = routeMessage(ev, frames);
    if (!hit) return;
    if (hit.msg.kind === 'design-pick') { if (st.pick) onPick?.(hit.msg, hit.frame); return; }
    if (hit.msg.kind === 'design-edit') {
      // a style report is matched by the subscriber against the nudge IT asked for; a text edit is the user's only
      // from the frame that has (or just had) the keyboard, while picking, at a human rate
      if (hit.msg.edit === 'text') {
        if ((!st.pick && !(Date.now() - pickOffAt < EDIT_GRACE_MS)) || !typedIn(hit.frame.file)) return;
        const g = frameKeyGate(editGates.get(hit.frame.file), Date.now());
        editGates.set(hit.frame.file, g.gate);
        if (!g.allow) return;
      }
      if (subs.size) tellSubs({ type: 'edit', msg: hit.msg, frame: hit.frame });
      return;
    }
    const rec = els.get(hit.frame.file);
    if (!rec || !rec.iframe || doc.activeElement !== rec.iframe) return;
    const g = frameKeyGate(keyGates.get(hit.frame.file), Date.now());
    keyGates.set(hit.frame.file, g.gate);
    if (g.allow) onKey?.(hit.msg, hit.frame);
  }, L);

  // ── input: wheel (pan; ctrl / ⌘ = zoom at the pointer), drag (pan), two touches (pinch) ──
  const local = (e) => { const r = vp.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (st.present) return; // the presented view is ours
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? paneSize().h : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) setView(zoomAt(st.view, st.view.z * Math.exp(-dy * WHEEL_ZOOM_RATE), local(e)));
    else if (e.shiftKey && !dx) setView(panBy(st.view, -dy, 0));
    else setView(panBy(st.view, -dx, -dy));
  }, { passive: false, signal: sig });
  const ptrs = new Map(); // pointerId → {x, y, x0, y0, type, target}
  let drag = null, pinch = null;
  vp.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // a live artboard takes its own pointer; the canvas gutter and the shields are ours
    const t = e.target;
    if (!(t === vp || t === world || t.classList?.contains('dc-frame-shield') || t.classList?.contains('dc-note') || t.classList?.contains('dc-frame-label') || t.classList?.contains('dc-frame-refused'))) return;
    const p = local(e);
    ptrs.set(e.pointerId, { x: p.x, y: p.y, x0: p.x, y0: p.y, type: e.pointerType, target: t, idle: vp.classList.contains('dc-present-idle') });
    try { vp.setPointerCapture(e.pointerId); } catch { /* the pointer already left */ }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { start: { ...st.view }, a0: { x: a.x, y: a.y }, b0: { x: b.x, y: b.y } };
      drag = null;
    } else if (ptrs.size === 1) drag = { start: { ...st.view }, x0: p.x, y0: p.y, moved: false };
    vp.focus({ preventScroll: true });
  }, L);
  vp.addEventListener('pointermove', (e) => {
    if (st.present) wake();
    const rec = ptrs.get(e.pointerId);
    if (!rec) return;
    const p = local(e);
    rec.x = p.x; rec.y = p.y;
    if (st.present) return; // a drag while presenting is a swipe, read at the release
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      setView(pinchView(pinch.start, pinch.a0, pinch.b0, { x: a.x, y: a.y }, { x: b.x, y: b.y }));
    } else if (drag) {
      const dx = p.x - drag.x0, dy = p.y - drag.y0;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
      drag.moved = true;
      vp.classList.add('dc-dragging');
      setView(panBy(drag.start, dx, dy));
    }
  }, L);
  const end = (e) => {
    const rec = ptrs.get(e.pointerId);
    if (!rec) return;
    ptrs.delete(e.pointerId);
    try { vp.releasePointerCapture(e.pointerId); } catch { /* released */ }
    if (st.present) {
      if (ptrs.size === 0) { drag = null; pinch = null; vp.classList.remove('dc-dragging'); }
      const g = e.type === 'pointerup' && ptrs.size === 0 ? presentGesture(rec.x - rec.x0, rec.y - rec.y0, DRAG_SLOP_PX) : null;
      const still = Math.hypot(rec.x - rec.x0, rec.y - rec.y0) < DRAG_SLOP_PX;
      if (g && still && rec.type !== 'mouse' && rec.idle) wake(); // a touch on a quiet presentation shows its chrome first
      else if (g) presentGo(g);
      return;
    }
    const tap = drag && !drag.moved && !pinch && e.type === 'pointerup';
    if (tap && rec.type !== 'mouse' && rec.target?.classList?.contains('dc-frame-shield')) onActivate?.(rec.target._dcFile, 'tap');
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) { drag = null; vp.classList.remove('dc-dragging'); }
    else if (ptrs.size === 1) { const [o] = [...ptrs.values()]; drag = { start: { ...st.view }, x0: o.x, y0: o.y, moved: true }; }
  };
  vp.addEventListener('pointerup', end, L);
  // a dblclick lands on the VIEWPORT (the drag's pointer capture retargets the click pair) — the frame is found by the
  // world point under it, on the page shown (the topmost: the last drawn)
  vp.addEventListener('dblclick', (e) => {
    if (st.focused || st.present) return;
    const w = toWorld(st.view, local(e));
    const hit = pageFrames().filter((f) => w.x >= f.x && w.x <= f.x + f.w && w.y >= f.y && w.y <= f.y + f.h).pop();
    if (hit) { e.preventDefault(); onActivate?.(hit.file, 'dblclick'); }
  }, L);
  vp.addEventListener('pointercancel', end, L);
  vp.addEventListener('lostpointercapture', end, L);
  vp.addEventListener('keydown', (e) => {
    if (st.present) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target !== vp && (e.key === 'Enter' || e.key === ' ')) return; // a focused chrome button's own press
      const step = presentKey(e.key);
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();
      presentGo(step);
      return;
    }
    if (e.target !== vp || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(+1); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(-1); }
    else if (e.key === '0') { e.preventDefault(); fit(); }
  }, L);
  // the pane changed size: a fitted / focused view follows only while the user has not moved it since
  let lastPane = paneSize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    const p = paneSize();
    if (!(p.w > 0 && p.h > 0)) return;
    const was = lastPane;
    lastPane = p;
    if (st.present) { presentShow(); return; } // fullscreen in / out, a rotated phone: the artboard is fitted again
    if (!(was.w > 0 && was.h > 0)) { if (st.focused) refocus(); else fit(); return; } // laid out for the first time (a hidden desktop / tab)
    if (st.focused) refocus();
  }) : null;
  ro?.observe(vp);
  sig.addEventListener('abort', () => { ro?.disconnect(); clearTimeout(idleTimer); vp.remove(); els.clear(); }, { once: true });

  return {
    el: vp, world,
    setFrames, updateFrame, fit, zoomBy, zoomTo, setPage, focus, setPick, setView,
    /** PRESENT (lane design-present): start / end, one step, and where it stands ({i, n, file} | null). */
    present, presentGo, presenting,
    /** A seam module's subscription (view / page / pick changes, a frame's fenced `design-edit`) → unsubscribe. */
    listen(fn) { if (typeof fn !== 'function') return () => {}; subs.add(fn); return () => subs.delete(fn); },
    /** Say one fenced message (`frameSay`) to the frame of `file` → whether it went. */
    tell(file, msg) { return say(els.get(file), msg); },
    /** lane design-tweaks: (before, after) → the messages that restyle a live frame in place, or null (reload it). */
    setSwap(fn) { swapFn = typeof fn === 'function' ? fn : null; },
    view: () => ({ ...st.view }), page: () => st.page, pages: () => st.pages.slice(), focused: () => st.focused, pick: () => st.pick,
    frames: () => st.frames.map((f) => ({ file: f.file, x: f.x, y: f.y, w: f.w, h: f.h, title: f.title, page: f.page, print: f.print, html: f.html, refused: f.refused })),
    /** A frame's box in viewport px (for anchoring a composer at its edge). */
    frameScreenRect(file) {
      const f = st.frames.find((x) => x.file === file);
      if (!f) return null;
      const rec = els.get(file);
      const h = st.focused === file && rec && rec.focusH ? rec.focusH : f.h;
      const a = toScreen(st.view, { x: f.x, y: f.y });
      return { x: a.x, y: a.y, w: f.w * st.view.z, h: h * st.view.z, z: st.view.z };
    },
    zoom: () => clampZoom(st.view.z),
    dispose: () => ctl.abort(),
  };
}
