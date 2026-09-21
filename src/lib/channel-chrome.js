// THE COMMUNICATION PANEL'S SHARED CHROME HELPERS (a4 of the polish,
// 2026-09-18; docs/design-communication-panel-ui.md §4.7). Three DOM
// primitives every channel surface builds with, so the panel, the window,
// the card, the editors and the Integrations window draw the SAME glyph the
// same way: `icon()` = one SVG from src/lib/icons.js sized by font-size (the
// only innerHTML this feature writes, and it is the library's own static
// string — never a string from the wire), `el()` = a textContent element,
// `btn()` = a house `mounts-btn` (`mounts-btn-primary` = the ONE primary).
import { UI_ICONS } from './icons.js';

/** An icon from the library, sized in px (the SVG is 1em). */
export function icon(name, px = 13, cls = '') {
  const s = document.createElement('span');
  s.className = 'chan-ic' + (cls ? ' ' + cls : '');
  s.style.fontSize = px + 'px';
  s.innerHTML = UI_ICONS[name] || '';
  return s;
}

/** A textContent element (XSS law: every string on these surfaces is vendor-
 *  or peer-controlled and syncs to every client). */
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

/** A house button. `cls` adds `mounts-btn-primary` / `mounts-btn-danger`. */
export function btn(label, onClick, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mounts-btn' + (cls ? ' ' + cls : '');
  b.textContent = label;
  if (onClick) b.onclick = (ev) => { ev.stopPropagation(); onClick(ev); };
  return b;
}

/** A note line; a warning carries the alert glyph before its sentence (§4.7). */
export function noteLine(cls, text, { warn = false } = {}) {
  const line = document.createElement('div');
  line.className = cls + (warn ? ' chan-warn' : '');
  if (warn) line.appendChild(icon('alert', 11));
  const s = document.createElement('span');
  s.textContent = text;
  line.appendChild(s);
  return line;
}
