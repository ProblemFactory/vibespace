// THE MAIL FRAME'S DOM HALF (lane channel-rich, D2 — 2026-09-28; the rules
// are PURE in src/mail-frame.js). The owner: "gmail 这种富文本 html 内容似乎
// 完全没有按照 html 渲染".
//
// A message whose record names a formatted BODY (`role: 'body'`, a mail's
// text/html part) gets ONE slot under its row: a small bar — Formatted |
// Plain text, and "Show pictures" while a remote picture is blocked — over the
// frame. THIS FILE IS THE CHANNEL SURFACE'S ONE srcdoc (test-channel-record
// ⑧ pins it by name: exactly one `.srcdoc =` in the channel files, here, fed
// by `sanitizeMailHtml` → DOMPurify → `composeSrcdoc`, on an iframe whose
// `sandbox` is `allow-scripts` and nothing else — NEVER allow-same-origin).
// Everything else in this file is textContent, like the rest of the window.
//
//  · THE BYTES come through OUR attachment route (the engine kept them at
//    ingest — zero vendor units; a body it never kept is fetched on demand
//    through the R3 verdict ladder like any attachment). `cid:` pictures are
//    the message's own parts, fetched the same way by the PARENT (the frame
//    is an opaque origin: it has no cookie) and handed in as data: pictures.
//  · LAZY: a frame is live only while its row is inside the list's viewport
//    + the keep zone, nearest first, at most LIVE_FRAME_CAP (PURE
//    `liveFrames`); a dropped frame leaves a placeholder of its measured
//    height, so the list never jumps.
//  · THE PARENT TRUSTS ONE NUMBER: a height, clamped, from THAT frame's own
//    window carrying THAT frame's token (PURE `frameMessageVerdict`). A link
//    clicked inside the frame is opened here, http(s) / mailto only, in a new
//    tab with no opener.
//  · SHOW PICTURES: per message, remembered for the SENDER for this page
//    session (never stored, never global).
//  · A FAILURE IS SAID: a body the route refuses, a body over the size bound
//    — the row shows the plain text with ONE line naming why (+ Retry).
import DOMPurify from 'dompurify';
import * as MF from '../mail-frame.js';
import { t } from './i18n.js';
import { el, icon } from './channel-chrome.js';
import { attachmentReasonText } from './channel-words.js';
import { track } from './telemetry-client.js';
import { readBounded } from './bounded-read.js';

/** SHOW PICTURES, for this page session (every window shares it — "this sender, this session"). */
const PICTURES = MF.picturesState();

const rnd = () => {
  const a = new Uint8Array(18);
  (globalThis.crypto || window.crypto).getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};
/** A blob → a data: URL (a cid: picture handed to the frame). */
const dataUrlOf = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => res(''); r.readAsDataURL(blob); });

/**
 * ONE WINDOW's mail frames. `list` = the scrolling list (the observer's root),
 * `base` = the conversation's route prefix, `signal` = the window's listener
 * controller, `modes` = the window's memory (vendorId → 'plain' | 'formatted',
 * kept across a full redraw).
 */
export function createMailFrames({ list, base, signal = null, modes = new Map() } = {}) {
  const slots = new Map();         // vendorId -> slot
  const cache = new Map();         // vendorId -> {html} (a handful — a re-entered row reuses its bytes)
  const CACHE_MAX = 12;
  let io = null;
  const near = new Set();          // slots whose box intersects the viewport + keep zone

  function reconcile() {
    const listRect = list.getBoundingClientRect();
    const rows = [];
    for (const s of near) {
      if (!s.box.isConnected || s.mode !== 'formatted') continue;
      const r = s.box.getBoundingClientRect();
      rows.push({ id: s.vid, top: r.top, bottom: r.bottom });
    }
    const live = new Set(MF.liveFrames(rows, { top: listRect.top, bottom: listRect.bottom }));
    for (const s of slots.values()) {
      if (!s.box.isConnected) { drop(s); slots.delete(s.vid); continue; }
      if (live.has(s.vid)) goLive(s); else drop(s);
    }
  }
  let raf = 0;
  const later = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; reconcile(); }); };
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) { const s = e.target.__mailSlot; if (!s) continue; if (e.isIntersecting) near.add(s); else near.delete(s); }
      later();
    }, { root: list, rootMargin: `${MF.KEEP_ZONE_PX}px 0px ${MF.KEEP_ZONE_PX}px 0px` });
  }
  list.addEventListener('scroll', later, { passive: true, signal: signal || undefined });

  // THE ONE LISTENER: a frame's height / a link it was asked to open — judged by the PURE verdict
  window.addEventListener('message', (e) => {
    for (const s of slots.values()) {
      if (!s.frame) continue;
      const v = MF.frameMessageVerdict({ source: e.source, frameWindow: s.frame.contentWindow, token: s.token, data: e.data });
      if (v.act === 'ignore') continue;
      if (v.act === 'height') applyHeight(s, v.h);
      else if (v.act === 'open') { try { window.open(v.href, '_blank', 'noopener,noreferrer'); } catch {} }
      return;
    }
  }, { signal: signal || undefined });
  /** ONE height through THE HEIGHT BUDGET (security verify r2): settle freely, then one change per 250 ms, a pulse
   *  freezes the row — and a height held for the gap lands at the gap's end (the trailing edge: the frame never
   *  posts it again, so a dropped hold was the mail's last line cut for good). */
  function applyHeight(s, h) {
    const hv = MF.heightVerdict(s.budget, h, Date.now());
    if (hv.act !== 'apply') {
      if (hv.act === 'frozen' && !s.frozenSaid) { s.frozenSaid = true; s.box.dataset.frozen = '1'; }
      if (hv.act === 'hold' && hv.retryAt !== undefined && !s.trail) {
        const b = s.budget;
        s.trail = setTimeout(() => { s.trail = 0; const p = MF.heightPending(b); if (p !== null && s.frame && s.budget === b) applyHeight(s, p); }, Math.max(0, hv.retryAt - Date.now()) + 5);
      }
      return;
    }
    // the reader at the newest message stays there while a frame above grows (the list's own tail rule)
    const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    s.h = hv.h; s.frame.style.height = hv.h + 'px'; s.box.dataset.h = String(hv.h);
    if (stick) list.scrollTop = list.scrollHeight;
  }
  if (signal) signal.addEventListener('abort', () => { if (io) io.disconnect(); for (const s of slots.values()) drop(s); slots.clear(); });

  function placeholder(s) {
    const ph = el('div', 'chanmail-ph');
    ph.style.height = (s.h || MF.PLACEHOLDER_PX) + 'px';
    return ph;
  }
  function drop(s) {
    if (!s.frame && !s.loading) return;
    s.gen++;
    s.loading = false;
    if (s.trail) { clearTimeout(s.trail); s.trail = 0; }
    if (s.frame) { s.frame.remove(); s.frame = null; }
    if (s.box.isConnected) s.box.replaceChildren(placeholder(s));
  }
  function note(s, text, retry) {
    s.note.textContent = '';
    if (!text) { s.note.hidden = true; return; }
    s.note.hidden = false;
    s.note.appendChild(icon('alert', 11));
    s.note.appendChild(el('span', '', text));
    if (retry) {
      const b = el('button', 'chanmail-retry', t('Retry'));
      b.type = 'button';
      b.onclick = (ev) => { ev.stopPropagation(); note(s, null); setMode(s, 'formatted', { user: false }); };
      s.note.appendChild(b);
    }
  }
  /** A formatted view that cannot be shown: the plain text, the reason said once (never a silent fallback). */
  function fallBack(s, why, { retry = true } = {}) {
    s.failed = true;
    applyMode(s, 'plain');
    note(s, why, retry);
    try { track('event', 'chan-mail-frame-failed', { why: String(why).slice(0, 60) }); } catch {}
  }
  async function load(s) {
    const hit = cache.get(s.vid);
    if (hit) return hit;
    const url = `${base}/attachment/${encodeURIComponent(s.att.id)}?msg=${encodeURIComponent(s.vid)}`;
    let res;
    try { res = await fetch(url, { headers: { Accept: 'text/html, application/octet-stream' } }); } catch { return { error: attachmentReasonText('unreachable') }; }
    if (!res.ok) { let j = {}; try { j = await res.json(); } catch {} return { error: attachmentReasonText(j.code || 'vendor-error'), code: j.code || null }; }
    // BOUNDED AT THE BYTES (security verify r2, 2026-09-28): round 1 judged `Content-Length` before the download —
    // and the route answered chunked, with no length, so the whole body (up to 100 MB) was pulled into memory
    // before it was judged. The read STOPS at the bound and cancels the stream; a length over it is refused first.
    const got = await readBounded(res, MF.MAX_HTML_BYTES);
    if (got.over) return { error: t('This message is too large to show formatted — showing plain text'), code: 'too-large', noRetry: true };
    const html = new TextDecoder('utf-8').decode(got.buf);
    // the message's OWN pictures (cid:), through our route by the parent — data: for the frame
    const cid = {};
    const inlined = [];
    for (const id of MF.cidRefs(html)) {
      const a = s.rec.attachments.find((x) => x && x.cid === id && /^image\//i.test(String(x.mime || '')));
      if (!a) continue;
      try {
        const r = await fetch(`${base}/attachment/${encodeURIComponent(a.id)}?msg=${encodeURIComponent(s.vid)}&inline=1`);
        if (!r.ok) continue;
        const blob = await r.blob();
        if (blob.size > MF.MAX_CID_BYTES || !/^image\/(png|jpeg|gif|webp|bmp)$/i.test(blob.type)) continue;
        const d = await dataUrlOf(blob);
        if (MF.DATA_IMAGE_RE.test(d)) { cid[id] = d; inlined.push(a.id); }
      } catch {}
    }
    const out = { html, cid, inlined };
    cache.set(s.vid, out);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return out;
  }
  async function goLive(s) {
    if (s.frame || s.loading || s.mode !== 'formatted') return;
    s.loading = true;
    const gen = ++s.gen;
    if (!s.box.firstChild) s.box.appendChild(placeholder(s));
    const got = await load(s);
    if (gen !== s.gen || !s.box.isConnected || s.mode !== 'formatted') return;
    s.loading = false;
    if (got.error) { fallBack(s, t('Formatted view unavailable: {why} — showing plain text', { why: got.error }), { retry: !got.noRetry }); return; }
    const pictures = MF.picturesShown(PICTURES, { vendorId: s.vid, sender: s.sender });
    const pure = MF.sanitizeMailHtml(got.html, { pictures, cid: got.cid });
    if (!pure.ok) { fallBack(s, t('This message is too large to show formatted — showing plain text'), { retry: false }); return; }
    // STEP 2: the browser's own parse of what step 1 wrote, through DOMPurify (an independent wall)
    const clean = DOMPurify.sanitize(pure.html, { ...MF.DOMPURIFY_CONFIG, ALLOWED_TAGS: MF.DOMPURIFY_CONFIG.ALLOWED_TAGS.slice(), ALLOWED_ATTR: MF.DOMPURIFY_CONFIG.ALLOWED_ATTR.slice(), FORBID_TAGS: MF.DOMPURIFY_CONFIG.FORBID_TAGS.slice(), FORBID_ATTR: MF.DOMPURIFY_CONFIG.FORBID_ATTR.slice(), ADD_URI_SAFE_ATTR: MF.DOMPURIFY_CONFIG.ADD_URI_SAFE_ATTR.slice() });
    s.token = rnd();
    s.budget = MF.heightBudget(Date.now()); s.frozenSaid = false; delete s.box.dataset.frozen;
    // the quoted history's toggle inside the frame speaks the device's language (naive-user verify: a thread's
    // replies opened on walls of quoted mail — the plain view folds its quotes, the frame folds them too)
    const doc = MF.composeSrcdoc({ body: clean, nonce: rnd(), token: s.token, pictures, quoteShow: t('Show quoted text'), quoteHide: t('Hide quoted text') });
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.className = 'chanmail-frame';
    f.title = t('Formatted message');
    f.style.height = (s.h || MF.PLACEHOLDER_PX) + 'px';
    f.srcdoc = doc;
    s.frame = f;
    s.box.replaceChildren(f);
    // the pictures bar: "Show pictures" while a remote one is blocked (this message, this sender)
    s.pics.hidden = !(pure.blockedImages > 0) || pictures;
    if (!s.pics.hidden) s.pics.lastChild.textContent = t('Show pictures ({n})', { n: pure.blockedImages });
    // the message's cid: pictures drawn IN the mail are not drawn again under it (formatted view only)
    for (const id of got.inlined) s.row.querySelectorAll('.chanmsg-atts [data-channel-image]').forEach((n) => { if (n.dataset.channelImage === id) (n.closest('.chanmsg-pic') || n).classList.add('chanmail-inlined'); });
  }
  function applyMode(s, mode) {
    s.mode = mode;
    s.row.classList.toggle('chanmail-formatted', mode === 'formatted');
    s.fmt.setAttribute('aria-pressed', mode === 'formatted' ? 'true' : 'false');
    s.plain.setAttribute('aria-pressed', mode === 'plain' ? 'true' : 'false');
    s.box.hidden = mode !== 'formatted';
    if (mode !== 'formatted') { drop(s); s.pics.hidden = true; }
  }
  function setMode(s, mode, { user = true } = {}) {
    if (user) modes.set(s.vid, mode);
    s.failed = false;
    note(s, null);
    applyMode(s, mode);
    if (mode === 'formatted') later();
  }

  /** THE SLOT for one record, or null (no formatted body). Hangs under the row's body. */
  function slotFor(rec, row) {
    const att = MF.bodyAttachmentOf(rec);
    if (!att || !base || !rec.vendorId) return null;
    const prev = slots.get(rec.vendorId);
    if (prev) { drop(prev); if (io) io.unobserve(prev.box); near.delete(prev); }
    const root = el('div', 'chanmail');
    root.dataset.vid = rec.vendorId;
    const bar = el('div', 'chanmail-bar');
    const seg = el('div', 'chanmail-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', t('How this mail is shown'));
    const fmt = el('button', 'chanmail-mode', t('Formatted'));
    fmt.type = 'button'; fmt.dataset.mode = 'formatted';
    const plain = el('button', 'chanmail-mode', t('Plain text'));
    plain.type = 'button'; plain.dataset.mode = 'plain';
    seg.append(fmt, plain);
    const pics = el('button', 'chanmail-pictures');
    pics.type = 'button';
    pics.hidden = true;
    pics.appendChild(icon('image', 11));
    pics.appendChild(el('span', '', t('Show pictures')));
    pics.title = t('Remote pictures are blocked — loading them can tell the sender you read this');
    bar.append(seg, pics);
    const noteEl = el('div', 'chanmail-note');
    noteEl.hidden = true;
    const box = el('div', 'chanmail-box');
    root.append(bar, noteEl, box);
    const s = { vid: rec.vendorId, rec, row, att, sender: (rec.author && rec.author.id) || '', root, box, fmt, plain, pics, note: noteEl, frame: null, loading: false, gen: 0, h: null, token: null, mode: 'formatted', failed: false };
    box.__mailSlot = s;
    fmt.onclick = (ev) => { ev.stopPropagation(); setMode(s, 'formatted'); };
    plain.onclick = (ev) => { ev.stopPropagation(); setMode(s, 'plain'); };
    pics.onclick = (ev) => {
      ev.stopPropagation();
      MF.showPictures(PICTURES, { vendorId: s.vid, sender: s.sender });
      // every live frame of THIS sender redraws with pictures (the press is remembered for the sender)
      for (const o of slots.values()) if (o.vid === s.vid || (s.sender && o.sender === s.sender)) { drop(o); o.pics.hidden = true; }
      later();
    };
    slots.set(rec.vendorId, s);
    applyMode(s, modes.get(rec.vendorId) === 'plain' ? 'plain' : 'formatted');
    if (s.mode === 'formatted') box.appendChild(placeholder(s));   // the first layout already holds the frame's room
    if (io) io.observe(box); else near.add(s);
    later();
    return root;
  }
  return { slotFor, reconcile, liveCount: () => [...slots.values()].filter((s) => s.frame).length, slots };
}
