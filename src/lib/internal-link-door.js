// THE DOOR A RENDERER ASKS for a link of the scheme (lane login-request-card piece 1): the page registers it at boot (app.js
// registerInternalLinks — targetOf / press / menu, src/lib/internal-link-ui.js); a renderer (the chat, For-you) never imports the page.
// AND THE ONE DRAWING of a conversation or a desktop link: the product's link with its SVG icon; the target's real name follows in muted
// text when the label does not contain it (a stale or misleading label is visible); a target this page does not have is a chip that
// cannot be pressed — «unknown conversation» / «unknown desktop». Nothing here acts: a press is the registered door's.
import { t } from './i18n.js';
import { escHtml } from './utils.js';
import { UI_ICONS } from './icons.js';
import { linkOf } from '../internal-link.js'; // PURE (CJS): the link as the list prints it — a BARE link is one whose words are that address

let door = null;
/** The page's door: { targetOf(kind, ref) → {state, name}, press(kind, ref, at) → plan, menu(kind, ref, at, flash) }. */
export function registerInternalLinks(d) { door = d || null; }
/** What the page knows of a target (the drawing's question) — `unsure` when no door answers. */
export function linkTargetOf(kind, ref) {
  try { const r = door && door.targetOf ? door.targetOf(kind, ref) : null; return r && r.state ? r : { state: 'unsure', name: '' }; } catch { return { state: 'unsure', name: '' }; }
}
export function pressInternalLink(kind, ref, at = {}) { try { return door && door.press ? door.press(kind, ref, at) : null; } catch (e) { console.warn('[internal-link] press failed:', e); return null; } }
export function internalLinkMenu(kind, ref, at = {}, flash = null) { try { if (door && door.menu) door.menu(kind, ref, at, flash); } catch (e) { console.warn('[internal-link] menu failed:', e); } }

const ICON = { conversation: () => UI_ICONS.chat, desktop: () => UI_ICONS.monitor };
const TITLE = { conversation: () => t('Go to this conversation'), desktop: () => t('Go to this desktop') };
const UNKNOWN = { conversation: () => t('unknown conversation'), desktop: () => t('unknown desktop') };
const WHAT = { conversation: () => t('conversation'), desktop: () => t('Desktop') };   // a bare link to a target the page has not read yet: what it is, never its address
const textOf = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** THE DRAWING of a conversation / desktop link. `innerHtml` = the label as the surface already escaped it; `cls` + `attrs` = the
 *  surface's own pressable span (the chat's `.chat-link.chat-vs-link`, For-you's `.fy-link`); `target` = linkTargetOf's answer.
 *  A PERSON NEVER READS AN ADDRESS (主开发's look, 2026-11-17): a BARE link (its words are the address itself — bare text or an autolink)
 *  is drawn as the target's real name with its icon (what it is — «对话» / «桌面» — while the page has not read its list); the address
 *  stays in «Copy link». Only an UNKNOWN target shows what was written, with its chip. */
export function vsLinkHtml(kind, ref, innerHtml, { cls, attrs = '', target = linkTargetOf(kind, ref) } = {}) {
  if (!ICON[kind]) return innerHtml;
  const icon = `<span class="vs-link-icon" aria-hidden="true">${ICON[kind]()}</span>`;
  if (target.state === 'unknown') return `<span class="vs-link-unknown">${icon}${innerHtml} <span class="vs-link-chip">${escHtml(UNKNOWN[kind]())}</span></span>`;
  const name = String(target.name || '').trim();
  if (textOf(innerHtml).trim().toLowerCase() === linkOf(kind, ref).toLowerCase()) return `<span class="${cls}"${attrs} title="${escHtml(TITLE[kind]())}">${icon}${escHtml(name || WHAT[kind]())}</span>`;
  const named = name && !textOf(innerHtml).toLowerCase().includes(name.toLowerCase()) ? `<span class="vs-link-name">${escHtml(name)}</span>` : '';
  return `<span class="${cls}"${attrs} title="${escHtml(TITLE[kind]())}">${icon}${innerHtml}${named}</span>`;
}

/** A right-click / long-press on a For-you link of the scheme (`.fy-link[data-fy=conversation|desktop|setting]`) → «Go» · «Copy link»;
 *  true = handled (the row's own menu steps aside). */
export function fyLinkMenu(e) {
  const fy = e && e.target && typeof e.target.closest === 'function' ? e.target.closest('.fy-link[data-ref]') : null;
  const kind = fy && fy.dataset ? fy.dataset.fy : '';
  if (kind !== 'conversation' && kind !== 'desktop' && kind !== 'setting') return false;
  e.preventDefault(); e.stopPropagation();
  internalLinkMenu(kind, fy.dataset.ref, { x: e.clientX, y: e.clientY });
  return true;
}
