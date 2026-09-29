'use strict';
/**
 * THE MAIL FRAME'S DECISIONS (lane channel-rich, D2 — 2026-09-28). PURE, CJS,
 * imports NOTHING: the browser bundle (src/lib/channel-mail-frame.js, the ONE
 * DOM half) and a node suite (scripts/test-mail-frame.mjs) take the same
 * rules.
 *
 * The owner: "gmail 这种富文本 html 内容似乎完全没有按照 html 渲染". A mail
 * whose MIME tree has a text/html part is shown FORMATTED — inside a FULLY
 * SANDBOXED iframe (`sandbox="allow-scripts"` ONLY: an opaque origin, no
 * same-origin, no forms, no popups, no top navigation; NEVER
 * `allow-same-origin`), its `srcdoc` built here in THIS order:
 *
 *   1. `sanitizeMailHtml()` — OUR allowlist re-serializer: the mail is
 *      TOKENIZED and written out AGAIN from the tokens, so nothing reaches the
 *      output that is not a tag / attribute on the lists below (every text
 *      escaped, every attribute value re-quoted, every URL judged after its
 *      entities are decoded). Scripts, event handlers, forms, object / embed
 *      / iframe, svg / math, meta / base / link, `javascript:` / `data:` (but
 *      a data: PICTURE) and every scheme but http(s) / mailto / cid are gone;
 *      CSS keeps no `url()` but a data: picture, no `@import`, no
 *      `expression()`, no `image-set()`, no backslash escape, no `<`.
 *   2. DOMPurify with `DOMPURIFY_CONFIG` (the same lists) — the browser's OWN
 *      parse of what step 1 wrote, a second, independent wall (the DOM half).
 *   3. `composeSrcdoc()` — the Content-Security-Policy `<meta>` FIRST (it
 *      governs only what follows it): `default-src 'none'; img-src data:
 *      [https:]; style-src 'unsafe-inline'; font-src data:; script-src
 *      'nonce-…'` — then OUR resizer (the only script, carrying the nonce),
 *      then the sanitized body.
 *
 * REMOTE PICTURES ARE BLOCKED until the person presses "Show pictures" on THAT
 * message (a mail client's rule — a tracking pixel is a read receipt); the
 * press is remembered for the SENDER for the rest of the page session, never
 * globally (`picturesShown` / `showPictures`). Blocked twice: the src is not
 * written (step 1) AND the CSP has no `https:` (step 3). `cid:` pictures are
 * the message's own parts — the DOM half fetches them through OUR attachment
 * route (the parent's cookie; an opaque-origin frame has none) and hands them
 * in as data: pictures (`opts.cid`).
 *
 * THE PARENT TRUSTS ONE NUMBER from the frame: its content height, CLAMPED
 * (`frameMessageVerdict`: the event's `source` must be THAT frame's window and
 * the message must carry THAT frame's token — an opaque origin is `'null'`
 * for every mail frame, so the origin proves nothing). A link click inside the
 * frame is posted as `{open: href}` and the PARENT opens it only if it is
 * http(s) / mailto (`safeOpenHref`), in a new tab with no opener.
 *
 * FRAMES ARE LAZY (`liveFrames`): every row inside the viewport is live (a
 * visible mail is never a blank box); the KEEP zone around it is pre-warmed,
 * nearest first, while the total is under LIVE_FRAME_CAP — a thread of 30 HTML
 * mails never holds 30 documents.
 *
 * Agents never receive HTML: the frame is the person's view only; `text` and
 * the text blocks stay every preview, search, the attention list and every
 * agent read.
 */

/** Bounds. A mail body is peer-controlled; the frame is one per row. */
const MAX_HTML_BYTES = 2 * 1024 * 1024;       // over ⇒ refused by name (`too-large`): the plain text is shown
const MAX_IMAGES = 200;                         // more pictures than this ⇒ the rest dropped, counted
const MAX_DATA_URL = 3 * 1024 * 1024;           // one inline picture (a cid: part as data:)
const MAX_CID_FETCH = 20;                       // cid: pictures the DOM half fetches per mail
const MAX_CID_BYTES = 5 * 1024 * 1024;          // …each
const HEIGHT_MIN = 24;
const HEIGHT_MAX = 20000;
const LIVE_FRAME_CAP = 6;
const KEEP_ZONE_PX = 1200;
const PLACEHOLDER_PX = 140;

/** The ELEMENTS the output may carry (everything else is unwrapped or dropped). */
const ALLOWED_TAGS = Object.freeze(['a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'big', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'q', 's', 'samp', 'section', 'small', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'tt', 'u', 'ul', 'var', 'wbr']);
/** Dropped WITH everything inside them. */
const DROP_TAGS = Object.freeze(['script', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noembed', 'noframes', 'noscript', 'svg', 'math', 'video', 'audio', 'canvas', 'textarea', 'select', 'option', 'optgroup', 'datalist', 'input', 'output', 'meter', 'progress', 'xmp', 'plaintext', 'listing', 'title', 'base', 'meta', 'link', 'param', 'source', 'track', 'portal', 'dialog', 'button', 'map', 'area', 'picture', 'slot', 'image']);
/** Their content is RAW TEXT to the browser's parser (a `<` inside is not a tag) — read to their closer. */
const RAW_TEXT = Object.freeze(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext', 'template']);
/** VOID elements (no closer). */
const VOID_TAGS = Object.freeze(['br', 'col', 'hr', 'img', 'wbr']);
/** ATTRIBUTES the output may carry (per element where it matters). */
const ALLOWED_ATTR = Object.freeze(['href', 'src', 'alt', 'title', 'width', 'height', 'align', 'valign', 'bgcolor', 'color', 'border', 'cellpadding', 'cellspacing', 'colspan', 'rowspan', 'style', 'class', 'dir', 'lang', 'face', 'size', 'span', 'start', 'type', 'summary', 'headers', 'scope', 'nowrap', 'hspace', 'vspace', 'abbr', 'datetime', 'reversed', 'open']);
const URL_ATTRS = Object.freeze({ href: ['a'], src: ['img'] });
/** The ONE scheme set a link may carry (the parent re-judges on open). */
const LINK_SCHEMES = Object.freeze(['http:', 'https:', 'mailto:']);
/** THE QUOTED-HISTORY CONTAINERS (naive-user verify, 2026-09-28): a reply's quoted mail is FOLDED in the frame
 *  behind "Show quoted text" — the plain-text view already folds its `>` quotes; the formatted view lost that
 *  fold and a 10-mail thread opened on a wall of quoted history. Only the containers the mail clients THEMSELVES
 *  write are folded (a bare <blockquote> is the author's own emphasis and stays): Gmail's `gmail_quote`,
 *  Apple Mail / Thunderbird's `blockquote type="cite"`, Yahoo's `yahoo_quoted`, Outlook's `divRplyFwdMsg`
 *  is a HEADER (its quote follows as siblings) so it is not one. The OUTERMOST container only: quotes inside a
 *  quote ride with it. */
function isQuoteContainer(name, attrs) {
  const at = (k) => { const m = attrs.find(([n]) => n === k); return m ? decodeAttr(String(m[1])).toLowerCase() : ''; };
  const cls = at('class');
  if (name === 'div' && /(^|\s)(gmail_quote|yahoo_quoted|protonmail_quote)(\s|$)/.test(cls)) return true;
  if (name === 'blockquote' && (at('type') === 'cite' || /(^|\s)gmail_quote(\s|$)/.test(cls))) return true;
  return false;
}
/** A data: picture the output may carry (a cid: part, or one inline in the mail). */
const DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|gif|webp|bmp);base64,[A-Za-z0-9+/=\s]+$/i;

/** The DOMPurify configuration (step 2) — the same lists, spelled for DOMPurify 3. */
const DOMPURIFY_CONFIG = Object.freeze({
  ALLOWED_TAGS: ALLOWED_TAGS.slice(),
  ALLOWED_ATTR: [...ALLOWED_ATTR, 'data-vs-blocked', 'data-vs-quote'],
  FORBID_TAGS: DROP_TAGS.slice(),
  FORBID_ATTR: ['srcset', 'background', 'poster', 'action', 'formaction', 'xlink:href', 'ping', 'target', 'id', 'name', 'srcdoc'],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/(?:png|jpeg|gif|webp|bmp);base64,)/i,
  // DOMPurify judges EVERY attribute value not on its URI-safe list against ALLOWED_URI_REGEXP — a strict regexp
  // there strips `width="40"` / `colspan` / `bgcolor` (measured in chrome, lane channel-rich: a table lost its
  // border, the blocked-picture marker its attribute). Every allowed attribute that is NOT a URL is URI-safe.
  ADD_URI_SAFE_ATTR: [...ALLOWED_ATTR.filter((a) => a !== 'href' && a !== 'src'), 'data-vs-blocked', 'data-vs-quote'],
  ADD_DATA_URI_TAGS: [],
  USE_PROFILES: false,
  FORCE_BODY: true,
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
  SAFE_FOR_TEMPLATES: false,
  KEEP_CONTENT: true,
});

// ── entities ─────────────────────────────────────────────────────────────
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', tab: '\t', newline: '\n', lpar: '(', rpar: ')', sol: '/', bsol: '\\', period: '.', comma: ',', semi: ';', num: '#', excl: '!', equals: '=', plus: '+', dollar: '$', percnt: '%', lowbar: '_', hyphen: '-', commat: '@', grave: '`' };
/** Decode the entities of an ATTRIBUTE value (numeric, and the names a scheme could be hidden in). Missing
 *  semicolons are honoured too (`&#106avascript:` is `javascript:` to a browser). */
function decodeAttr(v) {
  return String(v).replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,10});?/g, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return '�';
      try { return String.fromCodePoint(n); } catch { return '�'; }
    }
    const k = e.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED, k) ? NAMED[k] : m;
  });
}
const escText = (s) => String(s).replace(/&(?![A-Za-z][A-Za-z0-9]{1,31};|#[0-9]{1,7};|#[xX][0-9a-fA-F]{1,6};)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

// ── URLs ─────────────────────────────────────────────────────────────────
/** A link target the output (and the parent's open) accepts: http(s) with a host and no userinfo, or ONE
 *  mailto address — else null. Judged AFTER entities are decoded and whitespace / controls removed. */
function safeOpenHref(raw) {
  if (typeof raw !== 'string') return null;
  // a browser strips tab / newline / CR anywhere in a URL — `java\tscript:` is `javascript:`
  const s = decodeAttr(raw).replace(/[\t\n\r]/g, '').replace(CTRL, '').trim();
  if (!s || s.length > 2048) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!LINK_SCHEMES.includes(u.protocol)) return null;
  if (u.protocol === 'mailto:') return /^mailto:[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}$/i.test(s) ? s : null;
  if (!u.hostname || u.username || u.password) return null;
  return u.href;
}
/** What an <img src> becomes: {src} kept, {blocked:'remote'} (a remote picture before Show pictures),
 *  {drop:true} (anything else). `cid` = the DOM half's data: URL per Content-ID (or null). */
function imageSrcVerdict(raw, { pictures = false, cid = null } = {}) {
  const s = decodeAttr(String(raw || '')).replace(/[\t\n\r]/g, '').replace(CTRL, '').trim();
  if (!s) return { drop: true };
  if (/^cid:/i.test(s)) {
    const id = s.slice(4).replace(/^<|>$/g, '');
    const d = typeof cid === 'function' ? cid(id) : (cid && typeof cid === 'object' ? cid[id] : null);
    return d && DATA_IMAGE_RE.test(d) && d.length <= MAX_DATA_URL ? { src: d, cid: true } : { drop: true, cidMissing: id };
  }
  if (/^data:/i.test(s)) return DATA_IMAGE_RE.test(s) && s.length <= MAX_DATA_URL ? { src: s } : { drop: true };
  let u;
  try { u = new URL(s); } catch { return { drop: true }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { drop: true };
  if (!u.hostname || u.username || u.password) return { drop: true };
  // a remote picture: https only after the person's press (the CSP adds https: — an http: one never loads)
  if (!pictures) return { blocked: 'remote' };
  return u.protocol === 'https:' ? { src: u.href } : { drop: true, insecure: true };
}

// ── CSS ─────────────────────────────────────────────────────────────────
/** A QUOTED string that names a location (`//`, a scheme) is words nobody needs in a mail's style — image() /
 *  image-set() / @import read one as a URL. Scanned pair by pair (a regex crosses from one string's closing
 *  quote to the next one's opening); a data: picture is kept. */
function cssStrings(css) {
  let out = '', i = 0;
  // the next newline, found ONCE per stretch (security verify, 2026-09-28: re-scanned per quote it was quadratic —
  // a 2 MB style of paired quotes and no newline froze the tab for 15 s)
  let nlAt = -2;
  while (i < css.length) {
    const c = css[i];
    if (c !== '"' && c !== "'") { out += c; i++; continue; }
    const e = css.indexOf(c, i + 1);
    if (nlAt !== -1 && nlAt <= i) nlAt = css.indexOf('\n', i + 1);
    const nl = nlAt;
    if (e < 0 || (nl >= 0 && nl < e)) { out += '""'; i = e < 0 ? css.length : nl; continue; }   // an unterminated string: gone
    const body = css.slice(i + 1, e);
    out += (/\/\/|^\s*[a-z][a-z0-9+.-]*:/i.test(body) && !DATA_IMAGE_RE.test(body.trim())) ? '""' : c + body + c;
    i = e + 1;
  }
  return out;
}
/** Every `url(…)` → `url("<a data: picture>")` or `none`, in ONE walk (security verify, 2026-09-28: the regex
 *  `url\s*\(\s*(['"]?)([^)'"]*)\1\s*\)` re-scanned to the end for every `url(` without a `)` — 64 KB of them
 *  was 1.3 s, 2 MB minutes). The next `)` is found once and reused until passed; with none left, every later
 *  `url(` is `none(`. The words inside are the old regex's: no quote but the pair around them, no `)`. */
function cssUrls(css) {
  const re = /url\s*\(/gi;
  let out = '', last = 0, close = -2, m;
  while ((m = re.exec(css))) {
    const from = re.lastIndex;
    if (close !== -1 && close < from) close = css.indexOf(')', from);
    if (close < 0) break;
    const inner = css.slice(from, close).trim();
    const q = /^(["']?)([^'"]*)\1$/.exec(inner);
    const u = q ? q[2].trim() : '';
    out += css.slice(last, m.index) + (q && DATA_IMAGE_RE.test(u) && u.length <= MAX_DATA_URL ? `url("${u}")` : 'none');
    last = close + 1;
    re.lastIndex = last;
  }
  return out + css.slice(last);
}
/** A style attribute / a <style> body with every way to REACH something taken out: no url() but a data:
 *  picture, no @import, no image-set(), no expression() / behavior / -moz-binding, no backslash escape (the
 *  spelling `u\rl(` hides a url), no `<` (a `</style>` breakout), no comments. */
/** Every `@keyframes` / `@-webkit-keyframes` block (nested braces balanced) taken out in ONE walk — an
 *  unclosed one takes the rest (linear: the closer is looked for once per block, never re-scanned). */
function cssKeyframes(css) {
  const re = /@(?:-webkit-|-moz-|-o-)?keyframes\b/gi;
  let out = '', last = 0, m;
  while ((m = re.exec(css))) {
    if (m.index < last) { re.lastIndex = last; continue; }
    out += css.slice(last, m.index);
    let i = css.indexOf('{', m.index);
    if (i < 0) { last = css.length; break; }
    let depth = 0;
    for (; i < css.length; i++) { const c = css[i]; if (c === '{') depth++; else if (c === '}' && --depth === 0) { i++; break; } }
    last = i;
    re.lastIndex = last;
  }
  return out + css.slice(last);
}
function sanitizeCss(css) {
  let s = String(css || '').replace(CTRL, '');
  s = s.replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ');
  s = s.replace(/\\/g, '');
  s = s.replace(/[<>]/g, ' ');
  s = cssStrings(s);
  s = s.replace(/@import[^;]*;?/gi, '');
  // A MAIL DOES NOT ANIMATE (security verify r2, 2026-09-28): a `@keyframes` on the body's height made the frame
  // post a new height 60 times a second and the parent applied every one — the whole conversation jumped under
  // the reader for as long as the mail was on screen. No keyframes, no animation-*, no transition-* (a mail
  // client's rule; the parent's height budget is the belt).
  s = cssKeyframes(s);
  s = s.replace(/(?:-webkit-|-moz-|-o-)?(?:animation|transition)(?:-[a-z-]+)?\s*:[^;}]*/gi, '');
  // (an unclosed `{` takes the rest — linear: the old `\{[^}]*\}` re-scanned to the end per `@font-face{`)
  s = s.replace(/@(?:namespace|font-face|charset)[^{;]*(?:\{[^}]*\}?|;)?/gi, '');
  s = cssUrls(s);
  s = s.replace(/url\s*\((?!"data:image\/)/gi, 'none(');   // an unbalanced / nested url( that the rule above did not take
  s = s.replace(/(?:-webkit-)?image-set\s*\(/gi, 'none(');
  s = s.replace(/\b(?:image|cross-fade|element|src)\s*\(/gi, 'none(');
  s = cssStrings(s);
  s = s.replace(/expression\s*\(/gi, 'none(');
  s = s.replace(/(?:behavior|-moz-binding)\s*:[^;}]*/gi, '');
  s = s.replace(/javascript\s*:/gi, '');
  return s;
}

// ── THE TOKENIZER + RE-SERIALIZER (step 1) ──────────────────────────────
const TAG_RE = /<(\/?)([A-Za-z][A-Za-z0-9:-]{0,40})/y;
/** Attributes of one tag starting at `i` (just after the name); answers {attrs, end, self} or null (no `>`). */
function readAttrs(s, i) {
  const attrs = [];
  let j = i;
  for (;;) {
    while (j < s.length && /[\s/]/.test(s[j])) { if (s[j] === '/' && s[j + 1] === '>') return { attrs, end: j + 2, self: true }; j++; }
    if (j >= s.length) return null;
    if (s[j] === '>') return { attrs, end: j + 1, self: false };
    const nm = /[^\s/>=]{1,80}/y; nm.lastIndex = j;
    const m = nm.exec(s);
    if (!m) { j++; continue; }
    const name = m[0].toLowerCase();
    j = nm.lastIndex;
    while (j < s.length && /\s/.test(s[j])) j++;
    let value = '';
    if (s[j] === '=') {
      j++;
      while (j < s.length && /\s/.test(s[j])) j++;
      const q = s[j];
      if (q === '"' || q === "'") { const e = s.indexOf(q, j + 1); if (e < 0) return null; value = s.slice(j + 1, e); j = e + 1; }
      else { const v = /[^\s>]*/y; v.lastIndex = j; value = v.exec(s)[0]; j = v.lastIndex; }
    }
    if (attrs.length < 64) attrs.push([name, value]);
  }
}
/** The end of a raw-text element's content: the index of its `</name` closer (or the end). */
function rawEnd(s, from, name) {
  const re = new RegExp(`</${name}(?=[\\s/>])`, 'ig');
  re.lastIndex = from;
  const m = re.exec(s);
  return m ? m.index : s.length;
}

/**
 * STEP 1: the mail's HTML → a SAFE body fragment. Answers
 * `{ ok, html, remoteImages, blockedImages, droppedImages, cidMissing, links, truncated, code? }`;
 * `ok:false` with `code: 'too-large'` over MAX_HTML_BYTES (the plain text is shown — refused BY NAME).
 * `opts.pictures` = the person pressed Show pictures; `opts.cid` = Content-ID → data: picture.
 */
function sanitizeMailHtml(input, opts = {}) {
  const src = String(input == null ? '' : input);
  const bytes = byteLength(src);
  if (bytes > MAX_HTML_BYTES) return { ok: false, code: 'too-large', bytes, html: '', remoteImages: 0, blockedImages: 0, droppedImages: 0, cidMissing: [], links: 0, quotes: 0 };
  const s = src.replace(/\r\n?/g, '\n').replace(/\u0000/g, '�');
  const out = [];
  const open = [];             // the stack of elements WE wrote (closed in order, never trusted from input)
  let images = 0, remote = 0, blocked = 0, dropped = 0, links = 0, quotes = 0;
  let quoteAt = -1;            // the open-stack index of the OUTERMOST quoted-history container being written
  const cidMissing = [];
  let i = 0;
  const closeTo = (name) => {
    const at = open.lastIndexOf(name);
    if (at < 0) return;
    while (open.length > at) out.push(`</${open.pop()}>`);
    if (quoteAt >= open.length) quoteAt = -1;
  };
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { out.push(escText(s.slice(i).replace(CTRL, ''))); break; }
    if (lt > i) out.push(escText(s.slice(i, lt).replace(CTRL, '')));
    i = lt;
    // a comment, a CDATA section, a declaration, a processing instruction: dropped whole
    if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i + 4); i = e < 0 ? s.length : e + 3; continue; }
    if (s[i + 1] === '!' || s[i + 1] === '?') { const e = s.indexOf('>', i + 2); i = e < 0 ? s.length : e + 1; continue; }
    TAG_RE.lastIndex = i;
    const m = TAG_RE.exec(s);
    if (!m) { out.push('&lt;'); i++; continue; }
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const a = readAttrs(s, TAG_RE.lastIndex);
    // no `>` to the END of the mail (readAttrs walked there): the rest is TEXT, in one piece (security verify,
    // 2026-09-28: `&lt;` + one character at a time re-walked to the end from every later `<` — 64 KB of
    // `<a ` froze the tab for 15 s, the 2 MB bound for hours; a browser reads it as one unfinished tag)
    if (!a) { out.push(escText(s.slice(i).replace(CTRL, ''))); break; }
    i = a.end;
    if (closing) {
      if (ALLOWED_TAGS.includes(name) && !VOID_TAGS.includes(name)) closeTo(name);
      continue;
    }
    if (RAW_TEXT.includes(name)) {
      const e = rawEnd(s, i, name);
      const body = s.slice(i, e);
      const close = s.indexOf('>', e);
      i = e >= s.length ? s.length : (close < 0 ? s.length : close + 1);
      if (name === 'style') { const css = sanitizeCss(body); if (css.trim()) out.push(`<style>${css}</style>`); }
      continue;   // every other raw-text element is dropped with its content
    }
    if (DROP_TAGS.includes(name)) {
      if (VOID_TAGS.includes(name) || a.self || ['input', 'meta', 'base', 'link', 'param', 'source', 'track', 'image', 'area', 'embed'].includes(name)) continue;
      // skip to the matching closer (nesting counted), else to the end
      // (linear — security verify, 2026-09-28: `[^>]*>` re-walked to the end for every `<svg ` with no `>`; the
      // tag's end is the next `>`, found once and reused until passed)
      const re = new RegExp(`<(/?)${name}(?=[\\s/>])`, 'ig');
      re.lastIndex = i;
      let depth = 1, mm, gt = -2;
      while (depth > 0 && (mm = re.exec(s))) {
        if (gt !== -1 && gt < re.lastIndex) gt = s.indexOf('>', re.lastIndex);
        if (gt < 0) break;
        depth += mm[1] ? -1 : 1;
        re.lastIndex = gt + 1;
      }
      i = depth > 0 ? s.length : re.lastIndex;
      continue;
    }
    if (!ALLOWED_TAGS.includes(name)) continue;   // unknown / html / head / body / form / label…: unwrapped (its content stays)
    const keep = [];
    for (const [an, av0] of a.attrs) {
      if (!ALLOWED_ATTR.includes(an)) continue;
      const av = String(av0).replace(CTRL, '');
      if (an === 'href') {
        if (name !== 'a') continue;
        const h = safeOpenHref(av);
        if (h) { keep.push(['href', h]); links++; }
        continue;
      }
      if (an === 'src') {
        if (name !== 'img') continue;
        if (++images > MAX_IMAGES) { dropped++; continue; }
        const v = imageSrcVerdict(av, opts);
        if (v.src) { keep.push(['src', v.src]); if (!v.cid && !/^data:/i.test(v.src)) remote++; }
        else if (v.blocked) { blocked++; remote++; keep.push(['data-vs-blocked', '1']); }
        else { dropped++; if (v.cidMissing) cidMissing.push(v.cidMissing); if (v.insecure) remote++; }
        continue;
      }
      if (an === 'style') { const css = sanitizeCss(decodeAttr(av)); if (css.trim()) keep.push(['style', css]); continue; }
      keep.push([an, decodeAttr(av).slice(0, 400)]);
    }
    // the quoted history: the outermost mail-client quote container is MARKED (folded in the frame)
    const quote = quoteAt < 0 && !VOID_TAGS.includes(name) && open.length < 512 && isQuoteContainer(name, a.attrs);
    if (quote) { keep.push(['data-vs-quote', '1']); quoteAt = open.length; quotes++; }
    out.push(`<${name}${keep.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('')}>`);
    if (!VOID_TAGS.includes(name)) { if (open.length < 512) open.push(name); else out.pop(); }
  }
  while (open.length) out.push(`</${open.pop()}>`);
  return { ok: true, html: out.join(''), remoteImages: remote, blockedImages: blocked, droppedImages: dropped, cidMissing, links, quotes, bytes };
}
function byteLength(s) {
  let n = 0;
  for (let k = 0; k < s.length; k++) { const c = s.charCodeAt(k); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c <= 0xdbff) ? (k++, 4) : 3; if (n > MAX_HTML_BYTES + 8) return n; }
  return n;
}
/** The Content-IDs the raw mail names (`src="cid:…"`), bounded — which of the record's parts to fetch. */
function cidRefs(html, max = MAX_CID_FETCH) {
  const out = [];
  const re = /\bsrc\s*=\s*["']?\s*cid:([^"'\s>]{1,256})/gi;
  let m;
  const s = String(html || '').slice(0, MAX_HTML_BYTES);
  while ((m = re.exec(s)) && out.length < max) { const id = decodeAttr(m[1]).replace(/^<|>$/g, ''); if (!out.includes(id)) out.push(id); }
  return out;
}

// ── the frame's document (step 3) ────────────────────────────────────────
/** THE CSP of one mail frame. `pictures` adds `https:` to img-src (that frame only). */
function cspFor({ pictures = false, nonce = '' } = {}) {
  const n = String(nonce || '').replace(/[^A-Za-z0-9+/=_-]/g, '');
  return `default-src 'none'; img-src data:${pictures ? ' https:' : ''}; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-${n}'; base-uri 'none'; form-action 'none'; frame-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'`;
}
/** OUR resizer — the only script in the frame: posts the content height (and a clicked link's href) to the
 *  parent with the frame's TOKEN; the parent trusts only the clamped height.
 *  FIT TO WIDTH (naive-user verify, 2026-09-28: a 600 px newsletter was CUT at the phone width — the frame's
 *  overflow is hidden, so the right third of every wide mail was unreadable and unreachable): when the mail's
 *  natural width exceeds the frame's, the body is ZOOMED down to fit — a mail client's rule — re-judged only
 *  when the frame's width changes (never inside the observer's own resize, which would loop).
 *  QUOTED HISTORY: every `[data-vs-quote]` container is folded behind one button (its words from the parent)
 *  — a click toggles it; the ResizeObserver posts the new height. */
function resizerScript(token, { quoteShow = 'Show quoted text', quoteHide = 'Hide quoted text' } = {}) {
  const T = JSON.stringify(String(token || '').replace(/[^A-Za-z0-9_-]/g, ''));
  const S = JSON.stringify(String(quoteShow).slice(0, 80)).replace(/</g, '\\u003c'), H = JSON.stringify(String(quoteHide).slice(0, 80)).replace(/</g, '\\u003c');
  // MEASURED (chrome 2026-09-28): with the root's overflow hidden, documentElement.scrollWidth/scrollHeight are the
  // VIEWPORT's (a frame already taller than its content never shrank); body.scrollWidth is the natural width in
  // UNZOOMED units, body.getBoundingClientRect() the zoomed box — so the natural width is read at zoom 1 and the
  // height posted is the body's zoomed rect (or its zoomed scroll height, whichever is taller)
  return `(function(){var T=${T};var last=-1,lastW=-1;function fit(){var d=document.documentElement,b=document.body;if(!d||!b)return;var cw=d.clientWidth;if(cw===lastW)return;lastW=cw;b.style.zoom='1';var sw=b.scrollWidth;b.style.zoom=sw>cw+1?String(cw/sw):'1';}`
    + `function h(){fit();var b=document.body;if(!b)return;var z=parseFloat(b.style.zoom)||1;var v=Math.ceil(Math.max(b.getBoundingClientRect().height,b.scrollHeight*z));if(v!==last){last=v;parent.postMessage({vsMail:T,h:v},'*');}}`
    + `function q(){var S=${S},Hh=${H};var qs=document.querySelectorAll('[data-vs-quote]');for(var i=0;i<qs.length;i++){(function(el){if(el.previousSibling&&el.previousSibling.className==='vs-q')return;var b=document.createElement('button');b.type='button';b.className='vs-q';b.textContent=S;b.setAttribute('aria-expanded','false');b.onclick=function(e){e.preventDefault();e.stopPropagation();var o=el.classList.toggle('vs-open');b.textContent=o?Hh:S;b.setAttribute('aria-expanded',o?'true':'false');h();};el.parentNode.insertBefore(b,el);})(qs[i]);}}`
    + `try{var ro=new ResizeObserver(h);ro.observe(document.documentElement);ro.observe(document.body);}catch(e){}addEventListener('load',h);q();h();`
    + `document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;e.preventDefault();parent.postMessage({vsMail:T,open:String(a.getAttribute('href')||'')},'*');},true);`
    + `document.addEventListener('submit',function(e){e.preventDefault();},true);})();`;
}
/** The frame's WHOLE document: charset, the CSP meta FIRST, the base styles, the body, our nonce'd resizer. */
function composeSrcdoc({ body = '', nonce = '', token = '', pictures = false, quoteShow, quoteHide } = {}) {
  const n = String(nonce || '').replace(/[^A-Za-z0-9+/=_-]/g, '');
  return '<!doctype html><html><head><meta charset="utf-8">'
    + `<meta http-equiv="Content-Security-Policy" content="${escAttr(cspFor({ pictures, nonce: n }))}">`
    + '<meta name="referrer" content="no-referrer">'
    + '<style>html,body{margin:0;padding:0;overflow:hidden;color-scheme:light;}body{padding:8px 10px;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;word-wrap:break-word;overflow-wrap:anywhere;}img{max-width:100%;height:auto;}table{max-width:100%;}img[data-vs-blocked]{display:inline-block;min-width:16px;min-height:16px;outline:1px dashed rgba(128,128,128,.5);}pre{white-space:pre-wrap;}[data-vs-quote]:not(.vs-open){display:none;}button.vs-q{display:inline-block;margin:6px 0 2px;padding:1px 10px;border:1px solid rgba(128,128,128,.5);border-radius:999px;background:rgba(128,128,128,.12);color:#444;font:inherit;font-size:12px;line-height:18px;cursor:pointer;}</style>'
    + `</head><body>${String(body)}<script nonce="${n}">${resizerScript(token, { quoteShow, quoteHide })}</script></body></html>`;
}

// ── the parent's rules ───────────────────────────────────────────────────
/** THE HEIGHT BUDGET (security verify r2, 2026-09-28): what a frame may do to its row's height over time. While
 *  the frame SETTLES (fonts, pictures, layout — HEIGHT_SETTLE_MS after it went live) every change applies; after
 *  that at most one change per HEIGHT_MIN_GAP_MS, and a height that keeps FLIPPING direction (HEIGHT_FLIP_CAP
 *  reversals inside HEIGHT_FLIP_WINDOW_MS — a mail's pulse, not a person's toggle) FREEZES the row at its last
 *  size for the frame's life: the mail may still move inside its box, the conversation stays still. */
const HEIGHT_SETTLE_MS = 1500;
const HEIGHT_MIN_GAP_MS = 250;
const HEIGHT_FLIP_CAP = 8;
const HEIGHT_FLIP_WINDOW_MS = 10000;
function heightBudget(now = 0) { return { liveAt: Number(now) || 0, lastAt: -Infinity, lastH: null, dir: 0, flips: [], frozen: false, pending: null }; }
/** `{act: 'apply' | 'hold' | 'frozen', h, retryAt?}` — `apply` MUTATES the budget (the height is taken), `hold`
 *  takes nothing now, `frozen` = the row keeps its last height for good. `h` must be clamped.
 *  THE TRAILING EDGE (security verify r2, continued, 2026-09-28): a height held for the GAP is kept as the budget's
 *  `pending` and the answer names `retryAt` — the caller re-judges `heightPending(b)` then. The frame posts a height
 *  only when its own measure CHANGES, so a held height is never sent again: without the trailing edge the LAST
 *  height of any burst (a window narrowed by a drag, two pictures landing together) was dropped for the frame's
 *  life — measured in chrome: a 40 px narrowing posted 677 → 696, the row stayed 677, the mail's last line cut.
 *  A later message supersedes `pending`; an apply or a height equal to the applied one clears it. */
function heightVerdict(b, h, now) {
  const t = Number(now) || 0;
  if (!b || typeof b !== 'object') return { act: 'hold', h };
  if (b.frozen) { b.pending = null; return { act: 'frozen', h: b.lastH }; }
  if (b.lastH === null) { b.lastH = h; b.lastAt = t; b.pending = null; return { act: 'apply', h }; }
  if (h === b.lastH) { b.pending = null; return { act: 'hold', h }; }
  const settling = t - b.liveAt < HEIGHT_SETTLE_MS;
  if (!settling && t - b.lastAt < HEIGHT_MIN_GAP_MS) { b.pending = h; return { act: 'hold', h, retryAt: b.lastAt + HEIGHT_MIN_GAP_MS }; }
  const dir = h > b.lastH ? 1 : -1;
  if (b.dir !== 0 && dir !== b.dir) {
    b.flips = b.flips.filter((at) => t - at < HEIGHT_FLIP_WINDOW_MS);
    b.flips.push(t);
    if (b.flips.length >= HEIGHT_FLIP_CAP) { b.frozen = true; b.pending = null; return { act: 'frozen', h: b.lastH }; }
  }
  b.dir = dir; b.lastH = h; b.lastAt = t; b.pending = null;
  return { act: 'apply', h };
}
/** The height a hold is waiting to apply (the trailing edge), or null — nothing waits on a frozen budget. */
function heightPending(b) {
  return b && typeof b === 'object' && !b.frozen && typeof b.pending === 'number' ? b.pending : null;
}
/** A clamped height (the one number the parent takes from a frame), or null for anything that is not one. */
function clampHeight(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return null;
  return Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, Math.ceil(n)));
}
/**
 * A message from a window: is it THIS frame's, and what does it ask? `{act:'ignore'}` unless the event's
 * `source` IS the frame's own window AND it carries the frame's token; then `{act:'height', h}` (clamped) or
 * `{act:'open', href}` (http(s) / mailto only, else ignored).
 */
function frameMessageVerdict({ source, frameWindow, token, data } = {}) {
  if (!source || !frameWindow || source !== frameWindow) return { act: 'ignore', why: 'not-this-frame' };
  if (!data || typeof data !== 'object' || !token || data.vsMail !== token) return { act: 'ignore', why: 'no-token' };
  if (data.h !== undefined) { const h = clampHeight(data.h); return h === null ? { act: 'ignore', why: 'bad-height' } : { act: 'height', h }; }
  if (data.open !== undefined) { const href = safeOpenHref(String(data.open)); return href ? { act: 'open', href } : { act: 'ignore', why: 'bad-href' }; }
  return { act: 'ignore', why: 'unknown' };
}

/** SHOW PICTURES — per message, remembered per SENDER for the page session (never globally, never stored). */
function picturesState() { return { msgs: new Set(), senders: new Set() }; }
function picturesShown(state, { vendorId, sender } = {}) {
  if (!state) return false;
  return (!!vendorId && state.msgs.has(String(vendorId))) || (!!sender && state.senders.has(String(sender).toLowerCase()));
}
function showPictures(state, { vendorId, sender } = {}) {
  if (!state) return state;
  if (vendorId) state.msgs.add(String(vendorId));
  if (sender) state.senders.add(String(sender).toLowerCase());
  return state;
}

/**
 * THE LAZY-FRAME VERDICT. `rows` = [{id, top, bottom}] in the list's coordinates, `view` = {top, bottom}
 * (the list's visible band); a row is a CANDIDATE while it intersects the view grown by `keep` on both sides.
 * EVERY row inside the view is live; the keep zone's rows are pre-warmed nearest first while the total is
 * under `cap`. Answers the ids that should hold a live frame.
 * A VISIBLE MAIL IS NEVER A BLANK BOX (security verify r2, continued, 2026-09-28): the cap used to cut the
 * visible rows too — every row in view has distance 0, so with more than `cap` of them on screen the kept six
 * were the first six in the observer's order, and the rest stayed empty placeholders with their text hidden
 * (measured in chrome: a thread of 16 short replies, 9 on screen, the NEWEST 3 blank for good). The visible rows
 * are bounded by the view itself (a row is never shorter than HEIGHT_MIN + its header).
 */
function liveFrames(rows, view, { keep = KEEP_ZONE_PX, cap = LIVE_FRAME_CAP } = {}) {
  if (!Array.isArray(rows) || !view) return [];
  const top = Number(view.top) - keep, bottom = Number(view.bottom) + keep;
  const vTop = Number(view.top), vBottom = Number(view.bottom);
  const dist = (r) => (r.bottom < vTop ? vTop - r.bottom : r.top > vBottom ? r.top - vBottom : 0);
  const near = rows
    .filter((r) => r && Number(r.bottom) >= top && Number(r.top) <= bottom)
    .map((r) => ({ id: r.id, d: dist(r) }))
    .sort((a, b) => a.d - b.d);
  const visible = near.filter((x) => x.d === 0);
  const warm = near.filter((x) => x.d > 0).slice(0, Math.max(0, Math.max(0, cap) - visible.length));
  return [...visible, ...warm].map((x) => x.id);
}

/** Which attachment of a record is its formatted body (a text/html part, `role: 'body'`), or null. */
function bodyAttachmentOf(rec) {
  const list = Array.isArray(rec && rec.attachments) ? rec.attachments : [];
  return list.find((a) => a && a.role === 'body' && /^text\/html\b/i.test(String(a.mime || 'text/html'))) || null;
}

module.exports = {
  MAX_HTML_BYTES, MAX_IMAGES, MAX_DATA_URL, MAX_CID_FETCH, MAX_CID_BYTES, HEIGHT_MIN, HEIGHT_MAX, LIVE_FRAME_CAP, KEEP_ZONE_PX, PLACEHOLDER_PX,
  HEIGHT_SETTLE_MS, HEIGHT_MIN_GAP_MS, HEIGHT_FLIP_CAP, HEIGHT_FLIP_WINDOW_MS, heightBudget, heightVerdict, heightPending, cssKeyframes,
  ALLOWED_TAGS, DROP_TAGS, ALLOWED_ATTR, URL_ATTRS, LINK_SCHEMES, DATA_IMAGE_RE, DOMPURIFY_CONFIG,
  decodeAttr, safeOpenHref, imageSrcVerdict, sanitizeCss, sanitizeMailHtml, cidRefs, isQuoteContainer,
  cspFor, resizerScript, composeSrcdoc, clampHeight, frameMessageVerdict,
  picturesState, picturesShown, showPictures, liveFrames, bodyAttachmentOf,
};
