// THE COMMUNICATION PANEL'S SHARED CHROME HELPERS (a4 of the polish,
// 2026-09-18; docs/design-communication-panel-ui.md §4.7). Three DOM
// primitives every channel surface builds with, so the panel, the window,
// the card, the editors and the Integrations window draw the SAME glyph the
// same way: `icon()` = one SVG from src/lib/icons.js sized by font-size (the
// only innerHTML this feature writes, and it is the library's own static
// string — never a string from the wire), `el()` = a textContent element,
// `btn()` = a house `mounts-btn` (`mounts-btn-primary` = the ONE primary).
// channel-polish (2026-09-27): `avatar()` = the author's / conversation's
// circle (initials on a theme hue — src/lib/channel-avatar.js decides the
// text and the hue; the element is PAINT, aria-hidden, its name is in the
// row's text) and `fileIcon()` = the file-type glyph for a name (the file
// registry's own static SVG — the name only picks the key).
import { UI_ICONS } from './icons.js';
import { getFileIcon } from './file-types.js';
import { avatarOf } from './channel-avatar.js';

/** An icon from the library, sized in px (the SVG is 1em). */
export function icon(name, px = 13, cls = '') {
  const s = document.createElement('span');
  s.className = 'chan-ic' + (cls ? ' ' + cls : '');
  s.style.fontSize = px + 'px';
  s.innerHTML = UI_ICONS[name] || '';
  return s;
}

/** The file-type glyph for a file NAME (pdf / sheet / archive / … — the
 *  registry's static SVG, never a string from the wire), sized in px. */
export function fileIcon(fileName, px = 16, cls = '') {
  const s = document.createElement('span');
  s.className = 'chan-ic' + (cls ? ' ' + cls : '');
  s.style.fontSize = px + 'px';
  s.innerHTML = getFileIcon(String(fileName || '')) || UI_ICONS.attachment || '';
  return s;
}

/** AN AVATAR (paint — aria-hidden; the name it abbreviates is in the row's
 *  own text): the initials of `name` on the hue of `key` (the accent for
 *  `self`), or a library `glyph` on that hue (a mail thread, an agent group,
 *  an account's kind). `px` = the diameter. `badge` (B-5fe1, channel-avatar.js
 *  accountBadges) = the ACCOUNT's vendor glyph on the account's hue at the corner. */
export function avatar({ name = '', key = '', self = false, glyph = null, badge = null } = {}, px = null, cls = '') {
  const a = avatarOf({ name, key, self });
  const s = document.createElement('span');
  s.className = 'chan-av' + (a.self ? ' chan-av-self' : '') + (glyph ? ' chan-av-glyph' : '') + (cls ? ' ' + cls : '');
  if (a.hue !== null) s.dataset.hue = String(a.hue);
  s.setAttribute('aria-hidden', 'true');
  // the diameter: a fixed `px`, else the stylesheet's (`--av-size` by surface and width)
  if (px) s.style.setProperty('--av-size', px + 'px');
  if (glyph) { const g = icon(glyph, 13); g.style.fontSize = ''; s.appendChild(g); }
  else s.textContent = a.text;
  if (badge && Number.isInteger(badge.hue)) {
    s.classList.add('chan-av-badged');
    const b = document.createElement('span');
    b.className = 'chan-av-badge';
    b.dataset.hue = String(badge.hue);
    const g = icon(UI_ICONS[badge.glyph] ? badge.glyph : 'chat', 8);
    g.style.fontSize = '';
    b.appendChild(g);
    s.appendChild(b);
  }
  return s;
}

/** A CONVERSATION's avatar (the window's bar, the panel's first-screen row):
 *  an agent group wears the people glyph, a mail thread / mailbox the mail
 *  glyph, anything else the title's initials — on the hue of the key. */
export function convAvatar({ key = '', title = '', kind = '', group = false, badge = null } = {}, px = null, cls = '') {
  const glyph = group ? 'users' : (kind === 'thread' || kind === 'mailbox') ? 'mail' : null;
  return avatar({ name: title, key, glyph, badge }, px, cls);
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

/** A note line; a warning carries the alert glyph before its sentence (§4.7). Re-word it with noteText(). */
export function noteLine(cls, text, { warn = false } = {}) {
  const line = document.createElement('div');
  line.className = cls + (warn ? ' chan-warn' : '');
  if (warn) line.appendChild(icon('alert', 11));
  const s = document.createElement('span');
  s.className = 'chan-note-text';
  s.textContent = text;
  line.appendChild(s);
  return line;
}
/** Change what a noteLine() says: its OWN text span, never the glyph's (a warning's first span is the icon's
 *  line-height:0 box — a sentence written there is a 0 px line; the naive-user verifier, 2026-09-28). */
export function noteText(line, text) {
  const s = line && line.querySelector(':scope > .chan-note-text');
  if (s && s.textContent !== String(text)) s.textContent = String(text);
  return line;
}
