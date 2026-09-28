// THE ONE RENDERER: blocks → DOM (docs/design-communication-panel.zh.md §25,
// 2026-09-27 — the owner: "当作 IM 用还是有必要把界面好好优化下至少保证人能看
// 清楚必要的信息").
//
// A message body is a TYPED TREE (src/channel-record.js's schema, the rungs in
// src/channel-blocks.js) and THIS is the only place it becomes DOM. It is
// DOM-free in the sense that matters for a test: every node comes from
// `ctx.doc.createElement` / `createTextNode` and every string is assigned as
// `textContent` or a text node — there is NO innerHTML on any path (the
// channel chrome's `icon()` is the feature's only one, and it writes the icon
// library's own static SVG, never a string from the wire). So:
//
//  · A LINK is built from a validated field: the tree was validated at ingest
//    (http(s):/mailto: only) and is validated AGAIN here (`validateBlocks`
//    demotes an unsafe href to text), and `safeHref` is asked once more at
//    the very assignment — belt and braces. It opens in a new tab with
//    `rel="noopener noreferrer"`, carries its real target as its title, and a
//    label that is a URL on ANOTHER host shows the target instead
//    (`linkText`) — a link never says it goes somewhere it does not.
//  · A PICTURE is an attachment ID — `ctx.attachment(id, kind)` hands back the
//    window's own thumbnail (our route, `img.src`, the R3 refusal chip).
//  · QUOTED HISTORY AND SIGNATURES FOLD: a `quote` / `sig` of FOLD_MIN_LINES
//    or more lines is folded behind "Show quoted text (N lines)" — unless it
//    is the ONLY thing the message says (a bare forward is its content). The
//    state is per record in `ctx.folds` (the window's memory), so a repaint
//    re-applies it; a toggle patches its own block in place.
import * as CB from '../channel-blocks.js';
import { icon as chromeIcon } from './channel-chrome.js';

export const FOLD_MIN_LINES = CB.FOLD_MIN_LINES;

const fmt = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : String(s));

/** Does a list of blocks say anything BESIDES quote / sig / banner? */
function hasContent(blocks) {
  return (blocks || []).some((b) => b && b.k !== 'quote' && b.k !== 'sig' && b.k !== 'banner');
}

/** A system line in the device's words (`what` is a closed vocabulary; the
 *  block's own text — the vendor's sentence — is the fallback). */
export function sysWords(b, t = fmt) {
  switch (b && b.what) {
    case 'sticker': return t('Sticker');
    case 'share-chat': return t('Shared a chat');
    case 'share-user': return t('Shared a contact');
    case 'forward': return t('Forwarded messages');
    case 'deleted': return t('Message deleted');
    case 'call': return t('Video call');
    case 'calendar': return t('Calendar event');
    case 'todo': return t('Shared a task');
    case 'card': return t('Message card');
    default: return (b && b.text) || '';
  }
}

/** The fold toggle's words. */
export function foldLabel(b, open, t = fmt) {
  const n = Number(b && b.lines) || 0;
  if (b && b.k === 'sig') return open ? t('Hide signature') : t('Show signature ({n} lines)', { n });
  if (b && b.forwarded) return open ? t('Hide forwarded message') : t('Show forwarded message ({n} lines)', { n });
  return open ? t('Hide quoted text') : t('Show quoted text ({n} lines)', { n });
}

/** Is this quote / sig folded right now? (the window's memory, else the rule) */
export function isFolded(b, key, siblingsHaveContent, folds) {
  if (folds && typeof folds.get === 'function' && folds.has(key)) return !folds.get(key);
  return (Number(b && b.lines) || 0) >= FOLD_MIN_LINES && !!siblingsHaveContent;
}

function runsInto(el, runs, ctx) {
  const doc = ctx.doc;
  for (const r of runs || []) {
    if (!r) continue;
    if (r.k === 'a') {
      const href = CB.safeHref(r.href);
      if (!href) { el.appendChild(doc.createTextNode(r.text || '')); continue; }
      const a = doc.createElement('a');
      a.className = 'chanblk-a';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = href;
      a.textContent = CB.linkText({ href, text: r.text });
      el.appendChild(a);
    } else if (r.k === 'at') {
      const s = doc.createElement('span');
      s.className = 'chanblk-at';
      if (r.id) s.dataset.mention = r.id;
      s.textContent = '@' + (r.name || r.id || '');
      el.appendChild(s);
    } else if (r.k === 'code') {
      const c = doc.createElement('code');
      c.className = 'chanblk-code';
      c.textContent = r.text || '';
      el.appendChild(c);
    } else if (r.k === 'b') {
      const b = doc.createElement('strong');
      b.textContent = r.text || '';
      el.appendChild(b);
    } else el.appendChild(doc.createTextNode(r.text || ''));
  }
  return el;
}

function foldable(b, path, ctx, siblingsHaveContent, depth) {
  const doc = ctx.doc, t = ctx.t;
  const key = `${ctx.foldKey || ''}#${path}`;
  const folded = isFolded(b, key, siblingsHaveContent, ctx.folds);
  const box = doc.createElement('div');
  box.className = `chanblk-${b.k}` + (b.forwarded ? ' chanblk-forwarded' : '') + (folded ? ' chanblk-folded' : '');
  box.dataset.fold = key;
  const collapsible = (Number(b.lines) || 0) >= FOLD_MIN_LINES || (ctx.folds && ctx.folds.has(key));
  if (collapsible) {
    const head = doc.createElement('div');
    head.className = 'chanblk-fold-row';
    const tog = doc.createElement('button');
    tog.type = 'button';
    tog.className = 'chanblk-fold';
    tog.setAttribute('aria-expanded', folded ? 'false' : 'true');
    const ic = ctx.icon ? ctx.icon(folded ? 'chevronRight' : 'chevronDown', 10) : null;
    if (ic) tog.appendChild(ic);
    const lab = doc.createElement('span');
    lab.textContent = foldLabel(b, !folded, t);
    tog.appendChild(lab);
    tog.addEventListener('click', (ev) => {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (ctx.folds && typeof ctx.folds.set === 'function') ctx.folds.set(key, folded);   // open ⇔ it was folded
      const next = foldable(b, path, ctx, siblingsHaveContent, depth);
      if (box.replaceWith) box.replaceWith(next);
      if (ctx.onToggle) ctx.onToggle(key, folded);
    });
    head.appendChild(tog);
    if (b.attribution) {
      const at = doc.createElement('span');
      at.className = 'chanblk-attribution';
      at.textContent = b.forwarded ? `${t('Forwarded message')} · ${b.attribution}` : b.attribution;
      at.title = b.attribution;
      head.appendChild(at);
    }
    box.appendChild(head);
  } else if (b.attribution) {
    const at = doc.createElement('div');
    at.className = 'chanblk-attribution';
    at.textContent = b.forwarded ? `${t('Forwarded message')} · ${b.attribution}` : b.attribution;
    box.appendChild(at);
  }
  if (!folded) {
    const inner = doc.createElement('div');
    inner.className = 'chanblk-inner';
    const kids = b.blocks || [];
    const has = hasContent(kids);
    kids.forEach((k, i) => { const n = blockEl(k, `${path}.${i}`, ctx, has, depth + 1); if (n) inner.appendChild(n); });
    box.appendChild(inner);
  }
  return box;
}

function blockEl(b, path, ctx, siblingsHaveContent, depth) {
  const doc = ctx.doc;
  switch (b && b.k) {
    case 'p': { const p = doc.createElement('div'); p.className = 'chanblk-p'; return runsInto(p, b.runs, ctx); }
    case 'quote': case 'sig': return foldable(b, path, ctx, siblingsHaveContent, depth);
    case 'banner': { const d = doc.createElement('div'); d.className = 'chanblk-banner'; d.textContent = b.text || ''; return d; }
    case 'code': { const pre = doc.createElement('pre'); pre.className = 'chanblk-pre'; pre.textContent = b.text || ''; return pre; }
    case 'img': case 'file': {
      const n = typeof ctx.attachment === 'function' ? ctx.attachment(b.attachmentId, b.k) : null;
      if (!n) return null;
      const d = doc.createElement('div');
      d.className = 'chanblk-att';
      d.appendChild(n);
      return d;
    }
    case 'card': {
      const d = doc.createElement('div');
      d.className = 'chanblk-card';
      if (b.title) { const h = doc.createElement('div'); h.className = 'chanblk-card-title'; h.textContent = b.title; d.appendChild(h); }
      for (const line of b.lines || []) { const l = doc.createElement('div'); l.className = 'chanblk-card-line'; runsInto(l, CB.inlineRuns(line), ctx); d.appendChild(l); }
      return d;
    }
    case 'sys': { const d = doc.createElement('div'); d.className = 'chanblk-sys'; d.textContent = sysWords(b, ctx.t); return d; }
    default: return null;
  }
}

/**
 * ONE message body. `blocks` = the record's tree (else the caller hands the
 * generic rung's); `ctx` = { doc, t, icon, attachment(id, kind) → Node|null,
 * folds: Map, foldKey: the record's key, fallbackText, onToggle }.
 * Returns `div.chanmsg-body.chanblk` (`chanmsg-body-empty` when it drew nothing).
 */
export function renderBlocks(blocks, ctx = {}) {
  const c = { ...ctx, doc: ctx.doc || document, t: ctx.t || fmt };
  if (c.icon === undefined) c.icon = (name, px) => chromeIcon(name, px);
  const v = CB.validateBlocks(Array.isArray(blocks) ? blocks : []);
  const tree = v.ok ? v.blocks : CB.textToBlocks(String(ctx.fallbackText || ''));
  const root = c.doc.createElement('div');
  root.className = 'chanmsg-body chanblk';
  const has = hasContent(tree);
  tree.forEach((b, i) => { const n = blockEl(b, String(i), c, has, 1); if (n) root.appendChild(n); });
  if (!root.firstChild) root.classList.add('chanmsg-body-empty');
  return root;
}

/** The attachment ids a tree draws IN PLACE (the window draws the rest below). */
export function placedAttachments(blocks, out = new Set()) {
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b) continue;
    if ((b.k === 'img' || b.k === 'file') && b.attachmentId) out.add(b.attachmentId);
    if (Array.isArray(b.blocks)) placedAttachments(b.blocks, out);
  }
  return out;
}

/** THE BODY PATH (the window's only one): the record's own tree, else the
 *  generic rung over its text (a record stored before this layer, an adapter
 *  that declares nothing more). */
export function blocksOfRecord(rec) {
  if (rec && Array.isArray(rec.blocks) && rec.blocks.length) return rec.blocks;
  return CB.textToBlocks(String((rec && rec.text) || ''), { attachments: rec && rec.attachments, mentionNames: rec && rec.mentions });
}
