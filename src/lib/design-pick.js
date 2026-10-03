// THE ELEMENT PICKER — injected FIRST into every artboard frame's head (lane design-window L2, 2026-10-02;
// SharedContext/vibespace-design-window-design.md §3.5). The Design window's Comment mode: the pointer's element gets
// an outline, a click names it to the canvas — `postMessage({kind:'design-pick', path, tag, text, rect})` — and the
// canvas opens the composer with its quote line (`Main.html › header > nav > a.cta ("Get started")`).
//
//   · RUNS INSIDE THE ARTBOARD (a `sandbox="allow-scripts"` srcdoc frame — an opaque origin): `designPicker` is a
//     SELF-CONTAINED function (no closure over this module — its source text is what is injected, `pickerSource()`),
//     plain ES5 so any artboard's page runs it.
//   · It listens only to its PARENT (`e.source === parent`) and only to `design-mode` (the canvas's ONE word to its
//     frames); it says only the closed set the canvas fences (`design-pick`, `design-key` = Escape) — and every string
//     it sends is already bounded here (path = the hub's elementPath grammar: tag, #id or ≤ 2 classes, the last six
//     steps; text ≤ 120). The canvas re-fences everything anyway (design-canvas-model.js pickFence / routeMessage):
//     the artboard's own scripts share this window and can post whatever they like.
//   · While picking, the click (and the press around it) is the picker's: capture-phase listeners registered BEFORE
//     the artboard's scripts stop it from reaching the page (a link does not navigate, a form does not submit); the
//     outline is a fixed overlay with no pointer events, coloured with the theme accent the canvas hands over.
//   · Nothing here reads cookies, storage or the network — an opaque origin has none of the owner's anyway.
export const PICK_KIND = 'design-pick';
export const KEY_KIND = 'design-key';
export const MODE_KIND = 'design-mode';

/* eslint-disable no-var */
export function designPicker() {
  var on = false, box = null, color = '#2dd4bf';
  var MAX_STEPS = 6, MAX_PATH = 200, MAX_TEXT = 120;
  var IDENT = /^[A-Za-z_][A-Za-z0-9_-]{0,39}$/;
  function cut(s, n) {
    s = String(s == null ? '' : s).slice(0, 4000).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function step(el) {
    var tag = String(el.tagName || '').toLowerCase();
    if (el.id && IDENT.test(el.id)) return tag + '#' + el.id;
    var cls = [], list = el.classList || [];
    for (var i = 0; i < list.length && cls.length < 2; i++) if (IDENT.test(list[i])) cls.push(list[i]);
    return tag + (cls.length ? '.' + cls.join('.') : '');
  }
  function pathOf(el) {
    var parts = [], n = el, guard = 0;
    while (n && n.nodeType === 1 && guard++ < 64) {
      var tag = String(n.tagName || '').toLowerCase();
      if (tag === 'html' || tag === 'body') break;
      parts.unshift(step(n));
      n = n.parentElement;
    }
    var s = (parts.length > MAX_STEPS ? '… > ' : '') + parts.slice(-MAX_STEPS).join(' > ');
    return cut(s, MAX_PATH);
  }
  function textOf(el) {
    var t = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title'));
    if (!t) t = el.innerText || el.textContent || (el.getAttribute && el.getAttribute('placeholder')) || '';
    return cut(t, MAX_TEXT);
  }
  function outline(el) {
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('aria-hidden', 'true');
      box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;border-radius:2px;display:none';
    }
    if (!box.isConnected) (document.body || document.documentElement).appendChild(box);
    if (!el || !el.getBoundingClientRect) { box.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    box.style.border = '2px solid ' + color;
    box.style.background = 'color-mix(in srgb, ' + color + ' 12%, transparent)';
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    box.style.display = 'block';
  }
  function target(e) {
    var t = e.target;
    while (t && t.nodeType !== 1) t = t.parentNode;
    if (!t || t === box || t === document.documentElement || t === document.body) return null;
    return t;
  }
  function post(msg) { try { parent.postMessage(msg, '*'); } catch (err) { /* the canvas is gone */ } }
  function swallow(e) { if (!on) return; e.stopImmediatePropagation(); e.stopPropagation(); if (e.type !== 'pointerdown' && e.type !== 'touchstart') e.preventDefault(); }
  addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || d.kind !== 'design-mode') return;
    on = d.pick === true;
    if (typeof d.color === 'string' && /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9., %]{5,40}\))$/.test(d.color.trim())) color = d.color.trim();
    if (!on) outline(null);
  });
  addEventListener('pointermove', function (e) { if (on) outline(target(e)); }, true);
  addEventListener('pointerover', function (e) { if (on) outline(target(e)); }, true);
  addEventListener('pointerdown', function (e) { if (on) { outline(target(e)); swallow(e); } }, true);
  ['mousedown', 'mouseup', 'pointerup', 'dblclick', 'auxclick', 'contextmenu', 'submit'].forEach(function (type) { addEventListener(type, swallow, true); });
  addEventListener('click', function (e) {
    if (!on) return;
    swallow(e);
    var el = target(e);
    if (!el) return;
    var r = el.getBoundingClientRect();
    post({ kind: 'design-pick', path: pathOf(el), tag: String(el.tagName || '').toLowerCase().slice(0, 32), text: textOf(el), rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
  }, true);
  addEventListener('keydown', function (e) { if (e.key === 'Escape') post({ kind: 'design-key', key: 'Escape' }); }, true);
}
/* eslint-enable no-var */

/** The injected script's text: the function above, called — never a closure, never an argument from the artboard. */
export function pickerSource() { return '(' + designPicker.toString() + ')();'; }
