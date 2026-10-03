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
//   · EDIT IN PLACE (lane design-changes, design 003 §2.2): while picking, a double-click on a TEXT (its words, inline
//     markup at most) makes it editable; Enter or a click away reports `design-edit {edit:'text', ref, path, tag, from,
//     to}` and the typed words stay as a PREVIEW; Esc puts them back. A pick on a text waits DBL_MS for that second
//     click. The canvas's `design-style {ref, prop, value}` previews one nudge inline (`!important`) and is reported
//     the same way (`edit:'style'`, from = the computed value before); `design-undo` drops a preview. A pick carries
//     the element's `ref` and a `css` snapshot (colour, background, font size, padding) for the popover's controls.
//   · TWEAKS (lane design-tweaks, design 003 §2 S4): `design-tweak {var|attr, value}` sets ONE custom property on the
//     root (inline, `!important` — it wins over the layer the document was loaded with) or ONE root data attribute; the
//     canvas fenced it (frameSay), the grammar is re-judged here. Nothing is reported back.
export const PICK_KIND = 'design-pick';
export const KEY_KIND = 'design-key';
export const MODE_KIND = 'design-mode';
export const EDIT_KIND = 'design-edit';

/* eslint-disable no-var */
export function designPicker() {
  var on = false, box = null, color = '#2dd4bf';
  var MAX_STEPS = 6, MAX_PATH = 200, MAX_TEXT = 120, MAX_EDIT = 500, MAX_CSS = 60, MAX_RECS = 200, DBL_MS = 280;
  var IDENT = /^[A-Za-z_][A-Za-z0-9_-]{0,39}$/;
  // lane design-changes: the elements this frame has named (a pick, an edit) — `ref` = this frame's seed + a counter, so
  // a ref from an older document of the same artboard never names an element of this one
  var seed = Math.random().toString(36).slice(2, 8) || 'f', count = 0, recs = [], editing = null, later = 0;
  var PROPS = { 'color': 1, 'background-color': 1, 'font-size': 1, 'padding': 1 };
  var NO_EDIT = /^(input|textarea|select|option|img|svg|video|audio|canvas|iframe|object|embed|picture|html|body|script|style)$/;
  var PHRASING = /^(a|abbr|b|bdi|bdo|br|cite|code|data|dfn|em|i|kbd|label|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)$/;
  var TW_VAR = /^--[A-Za-z_][A-Za-z0-9_-]{0,39}$/, TW_ATTR = /^data-[a-z][a-z0-9-]{0,39}$/, TW_BAD = /[<>{};\\`!]|\/\*|\*\//;
  function cut(s, n) {
    s = String(s == null ? '' : s).slice(0, 4000).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function tagOf(el) { return String(el.tagName || '').toLowerCase().slice(0, 32); }
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
  function plain(el) { return cut(el.innerText || el.textContent || '', MAX_EDIT); }
  function recOf(el) {
    for (var i = 0; i < recs.length; i++) if (recs[i].el === el) return recs[i];
    if (recs.length >= MAX_RECS) recs.shift();
    var r = { el: el, ref: seed + '-' + (++count), html: null, styles: {} };
    recs.push(r);
    return r;
  }
  function byRef(ref) { for (var i = 0; i < recs.length; i++) if (recs[i].ref === ref) return recs[i]; return null; }
  function cssOf(el) {
    try { var c = getComputedStyle(el); return { color: cut(c.color, MAX_CSS), background: cut(c.backgroundColor, MAX_CSS), size: cut(c.fontSize, MAX_CSS), pad: cut(c.padding, MAX_CSS) }; }
    catch (err) { return null; }
  }
  /** A text the user may edit in place: its words only, inline markup at most (never a form control or a container). */
  function canEdit(el) {
    if (!el || NO_EDIT.test(tagOf(el))) return false;
    var t = el.textContent || '';
    if (!/\S/.test(t) || t.length > 4000) return false;
    var all = el.getElementsByTagName ? el.getElementsByTagName('*') : [];
    if (all.length > 40) return false;
    for (var i = 0; i < all.length; i++) if (!PHRASING.test(tagOf(all[i]))) return false;
    return true;
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
  function inEdit(e) { return !!editing && !!e.target && (e.target === editing.el || (editing.el.contains && editing.el.contains(e.target))); }
  function post(msg) { try { parent.postMessage(msg, '*'); } catch (err) { /* the canvas is gone */ } }
  function swallow(e) { if (!on || inEdit(e)) return; e.stopImmediatePropagation(); e.stopPropagation(); if (e.type !== 'pointerdown' && e.type !== 'touchstart') e.preventDefault(); }
  // ── edit in place (a double-click on a text while picking): the element becomes editable; Enter / a click away keeps
  //    the words as a PREVIEW and reports old → new; Esc puts this edit's words back. Nothing here writes a file.
  function endEdit(ed) {
    if (ed.ce == null) ed.el.removeAttribute('contenteditable'); else ed.el.setAttribute('contenteditable', ed.ce);
  }
  function startEdit(el) {
    var rec = recOf(el);
    if (rec.html == null) rec.html = el.innerHTML; // the undo base: the element as the page drew it
    editing = { el: el, rec: rec, from: plain(el), start: el.innerHTML, ce: el.getAttribute('contenteditable') };
    el.setAttribute('contenteditable', 'plaintext-only');
    if (el.isContentEditable === false) el.setAttribute('contenteditable', 'true');
    outline(el);
    try { el.focus(); var sel = getSelection(); if (sel) sel.selectAllChildren(el); } catch (err) { /* no selection API */ }
  }
  function commit() {
    var ed = editing;
    if (!ed) return;
    editing = null;
    endEdit(ed);
    var to = plain(ed.el);
    if (to !== ed.from) post({ kind: 'design-edit', edit: 'text', ref: ed.rec.ref, path: pathOf(ed.el), tag: tagOf(ed.el), from: ed.from, to: to });
  }
  function cancelEdit() {
    var ed = editing;
    if (!ed) return;
    editing = null;
    endEdit(ed);
    ed.el.innerHTML = ed.start;
  }
  function nudge(d) {
    var rec = byRef(d.ref), prop = String(d.prop || ''), v = String(d.value == null ? '' : d.value);
    if (!rec || !rec.el.isConnected || !PROPS[prop]) return;
    if (!(prop === 'color' || prop === 'background-color' ? /^#[0-9a-fA-F]{6}$/.test(v) : /^[0-9]{1,3}px$/.test(v))) return;
    if (!rec.styles[prop]) {
      var was = '';
      try { was = cut(getComputedStyle(rec.el).getPropertyValue(prop), MAX_CSS); } catch (err) { /* none */ }
      rec.styles[prop] = [rec.el.style.getPropertyValue(prop), rec.el.style.getPropertyPriority(prop), was];
    }
    rec.el.style.setProperty(prop, v, 'important');
    post({ kind: 'design-edit', edit: 'style', ref: rec.ref, path: pathOf(rec.el), tag: tagOf(rec.el), prop: prop, from: rec.styles[prop][2], to: v });
  }
  function undo(d) {
    var rec = byRef(d.ref);
    if (!rec) return;
    if (d.edit === 'text') {
      if (editing && editing.rec === rec) { endEdit(editing); editing = null; }
      if (rec.html != null) { rec.el.innerHTML = rec.html; rec.html = null; }
    } else if (d.edit === 'style' && PROPS[d.prop] && rec.styles[d.prop]) {
      var s = rec.styles[d.prop];
      if (s[0]) rec.el.style.setProperty(d.prop, s[0], s[1]); else rec.el.style.removeProperty(d.prop);
      delete rec.styles[d.prop];
    }
  }
  function tweak(d) {
    var v = d.value, root = document.documentElement;
    if (typeof v !== 'string' || !v || v.length > 80 || TW_BAD.test(v) || !root) return;
    if (typeof d.attr === 'string' && TW_ATTR.test(d.attr) && d.attr.indexOf('data-vibespace') !== 0) root.setAttribute(d.attr, v);
    else if (typeof d.var === 'string' && TW_VAR.test(d.var)) root.style.setProperty(d.var, v, 'important');
  }
  addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.kind === 'design-tweak') { tweak(d); return; }
    if (d.kind === 'design-style') { nudge(d); return; }
    if (d.kind === 'design-undo') { undo(d); return; }
    if (d.kind !== 'design-mode') return;
    on = d.pick === true;
    if (typeof d.color === 'string' && /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9., %]{5,40}\))$/.test(d.color.trim())) color = d.color.trim();
    if (!on) { commit(); outline(null); }
  });
  addEventListener('pointermove', function (e) { if (on && !editing) outline(target(e)); }, true);
  addEventListener('pointerover', function (e) { if (on && !editing) outline(target(e)); }, true);
  addEventListener('pointerdown', function (e) { if (on && !inEdit(e)) { if (editing) commit(); outline(target(e)); swallow(e); } }, true);
  ['mousedown', 'mouseup', 'pointerup', 'dblclick', 'auxclick', 'contextmenu', 'submit'].forEach(function (type) { addEventListener(type, swallow, true); });
  addEventListener('click', function (e) {
    if (!on || inEdit(e)) return;
    swallow(e);
    var el = target(e);
    if (!el) return;
    if (later) { clearTimeout(later); later = 0; }
    if (e.detail >= 2 && canEdit(el)) { startEdit(el); return; }
    var r = el.getBoundingClientRect();
    var msg = { kind: 'design-pick', path: pathOf(el), tag: tagOf(el), text: textOf(el), rect: { x: r.left, y: r.top, w: r.width, h: r.height }, ref: recOf(el).ref, css: cssOf(el) };
    // a text's pick waits out a double-click (which edits it in place instead); anything else is named at once
    if (canEdit(el)) later = setTimeout(function () { later = 0; post(msg); }, DBL_MS);
    else post(msg);
  }, true);
  addEventListener('focusout', function (e) { if (editing && e.target === editing.el) commit(); }, true);
  addEventListener('blur', function () { if (editing) commit(); }); // the keyboard left the frame (the element may get no focusout)
  addEventListener('keydown', function (e) {
    if (editing) {
      e.stopImmediatePropagation(); // the words being typed are the user's, never the page's shortcuts
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
      return;
    }
    if (e.key === 'Escape') post({ kind: 'design-key', key: 'Escape' });
  }, true);
  ['keypress', 'keyup', 'beforeinput', 'input'].forEach(function (type) { addEventListener(type, function (e) { if (editing) e.stopImmediatePropagation(); }, true); });
}
/* eslint-enable no-var */

/** The injected script's text: the function above, called — never a closure, never an argument from the artboard. */
export function pickerSource() { return '(' + designPicker.toString() + ')();'; }
