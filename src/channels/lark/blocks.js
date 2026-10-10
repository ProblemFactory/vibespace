'use strict';
/**
 * LARK'S RENDER RUNGS (design §25; lane dc-channels-blocks, 2026-10-05 — moved
 * out of the shared tree module: a vendor's message-shape reader lives with
 * the vendor, as Slack's does in slack-text.js). PURE, CJS — the Lark adapter
 * requires it at ingest and declares `blocksOf: larkStoredBlocks`; it builds
 * on the generic tree's rungs and kit (../../channel-blocks.js) and the record
 * schema, and imports nothing else.
 *
 *  · `larkToBlocks(item, mentions, opts)` — Lark's vendor item: a `post`'s
 *    rich text kept (text/a/at/img/media/emotion/code_block/md), a `text`
 *    message through the generic rung with its mentions as chips, an image as
 *    the picture (NO "[image]" text — `text` keeps it for agents), a card as a
 *    card, the rest as a system line.
 *  · `larkStoredBlocks(record)` — the same for a Lark record stored BEFORE
 *    this layer (only its flattened `text` survives): the placeholder lines
 *    become the pictures, the resolved `@name`s become chips.
 *
 * EVERY RUNG ENDS IN `finish` (the schema's verdict) — on a refusal it answers
 * ONE plain paragraph of the text, never an invalid tree.
 */
const R = require('../../channel-record.js');
const { BLOCK_LIMITS, MAX_DEPTH, QUOTED, safeHref, linkText, inlineRuns, inlineCtx, textToBlocks, blocksToPlain, splitLines, blank, stripQuote, bounded, guarded, finish } = require('../../channel-blocks.js');

/** Lark's placeholder tokens (the adapter writes them into `text`). */
const LARK_IMAGE_TOKEN = '[image]';
const LARK_VIDEO_TOKEN = '[video]';

function parseJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch { return null; }
}
/** A post's body: `{title, content}` at the top (the `im/v1` list answer) or
 *  under a locale key (`zh_cn` / `en_us` / `ja_jp` — the event and some older
 *  answers). THE ONE reader (src/channels/lark.js's text + attachments read it
 *  too — R3: two readers used to disagree about the wrapper). */
function larkPostBody(c) {
  if (c && Array.isArray(c.content)) return c;
  for (const k of ['zh_cn', 'en_us', 'ja_jp']) if (c && c[k] && Array.isArray(c[k].content)) return c[k];
  return { title: (c && c.title) || '', content: [] };
}

/** A Lark `post` → blocks: lines of runs; an img / media / code block ends the paragraph. */
function larkPostBlocks(c, mentions, { names = null, depth = 0 } = {}) {
  const body = larkPostBody(c);
  const out = [];
  if (body.title) out.push({ k: 'p', runs: [{ k: 'b', text: String(body.title) }] });
  let runs = [];
  const nameOf = (id) => (names && typeof names.get === 'function' && names.get(id)) || ((mentions || []).find((m) => m && m.id === id) || {}).name || '';
  const ictx = inlineCtx({ ordinals: mentions });   // compiled once for the whole post (a post is thousands of elements)
  const flush = () => {
    while (runs.length && runs[runs.length - 1].k === 't' && !runs[runs.length - 1].text.trim()) runs.pop();
    if (runs.some((r) => r.k !== 't' || r.text.trim())) out.push({ k: 'p', runs });
    runs = [];
  };
  const text = (x) => { const last = runs[runs.length - 1]; if (last && last.k === 't') last.text += x; else runs.push({ k: 't', text: x }); };
  for (const line of body.content) {
    if (!Array.isArray(line)) continue;
    const live = line.filter((el) => el && typeof el === 'object');
    const empty = !live.length || live.every((el) => (el.tag === 'text' || !el.tag) && !String(el.text || '').trim());
    if (empty) { flush(); continue; }
    if (runs.length) text('\n');
    for (const el of live) {
      switch (el.tag) {
        case 'text': {
          // bounded (security verify r2, 2026-09-28): a post element's text is peer bytes like any other body
          const t = bounded(String(el.text || ''));
          const st = Array.isArray(el.style) ? el.style : [];
          // lane channel-rich: a text element that carries MARKUP goes through the markup reader (never printed)
          const rs = carriesTag(t) ? markupRead(t, { ictx, nameOf, mode: 'inline' }) : (st.includes('bold') || st.includes('italic')) && t.trim() ? [{ k: 't', text: t }] : inlineRuns(t, ictx);
          const style = st.includes('bold') ? 'b' : st.includes('italic') ? 'i' : null;
          for (const r of rs) { if (r.k === 't' && style && r.text.trim()) runs.push({ k: style, text: r.text }); else if (r.k === 't') text(r.text); else runs.push(r); }
          break;
        }
        case 'md': {
          // lane channel-rich: Lark MARKDOWN — headings, lists, rules, quotes, fences, emphasis and its inline tags
          const bl = larkMdBlocks(String(el.text || ''), { ictx, nameOf, depth });
          if (bl.length === 1 && bl[0].k === 'p') { for (const r of bl[0].runs) { if (r.k === 't') text(r.text); else runs.push(r); } }
          else if (bl.length) { flush(); out.push(...bl); }
          break;
        }
        case 'a': {
          const href = safeHref(String(el.href || ''));
          const label = markupPlainLine(String(el.text || ''));   // lane channel-rich: a label's markup is read, never printed
          if (href) runs.push({ k: 'a', href, text: linkText({ href, text: label || href }) });
          else text(label ? `${label}${el.href ? ` (${el.href})` : ''}` : String(el.href || ''));
          break;
        }
        case 'at': {
          const id = String(el.user_id || el.open_id || '').slice(0, 256);
          // the NAME the message's own mentions / the chat's roster give this id
          // wins over the element's `user_name` (the sender's claim — a post
          // could chip "@Admin" over any id); the claim is only the fallback
          const nm = (id === 'all' ? 'all' : nameOf(id)) || markupPlainLine(String(el.user_name || '')).slice(0, 200) || id;
          runs.push({ k: 'at', id, name: nm });
          break;
        }
        case 'img': if (el.image_key) { flush(); out.push({ k: 'img', attachmentId: String(el.image_key) }); } break;
        case 'media': if (el.file_key) { flush(); out.push({ k: 'file', attachmentId: String(el.file_key) }); } break;
        case 'emotion': text(`[${String(el.emoji_type || 'emoji').slice(0, 40)}]`); break;
        case 'code_block': { flush(); const o = { k: 'code', text: String(el.text || '') }; if (el.language) o.lang = String(el.language).slice(0, 30); out.push(o); break; }
        case 'hr': flush(); break;
        default: if (el.text) { const t = String(el.text); if (carriesTag(t)) { for (const r of markupRead(t, { ictx, nameOf, mode: 'inline' })) { if (r.k === 't') text(r.text); else runs.push(r); } } else text(t); }
      }
    }
  }
  flush();
  return out;
}

/** Every string a card carries, in reading order (the list answer's
 *  post-like `elements: [[…]]` AND the card JSON's `elements: [{…}]`). */
function cardLines(elements, out = [], depth = 0) {
  if (!Array.isArray(elements) || depth > 6 || out.length >= BLOCK_LIMITS.cardLines) return out;
  for (const e of elements) {
    if (out.length >= BLOCK_LIMITS.cardLines) break;
    if (Array.isArray(e)) {
      const line = e.map((x) => (x && typeof x === 'object' ? (x.tag === 'at' ? `@${x.user_name || x.user_id || ''}` : String(x.text || x.content || '')) : '')).join('').trim();
      if (line) out.push(line.slice(0, 2000));
      continue;
    }
    if (!e || typeof e !== 'object') continue;
    const own = (e.text && typeof e.text === 'object' ? e.text.content : null) || (typeof e.content === 'string' ? e.content : null) || (typeof e.text === 'string' ? e.text : null);
    if (own && String(own).trim()) for (const l of String(own).split('\n')) if (l.trim() && out.length < BLOCK_LIMITS.cardLines) out.push(l.trim().slice(0, 2000));
    if (Array.isArray(e.fields)) for (const f of e.fields) { const c = f && f.text && f.text.content; if (c && out.length < BLOCK_LIMITS.cardLines) out.push(String(c).trim().slice(0, 2000)); }
    if (Array.isArray(e.actions)) { const b = e.actions.map((a) => a && a.text && a.text.content).filter(Boolean).join(' · '); if (b && out.length < BLOCK_LIMITS.cardLines) out.push(b.slice(0, 2000)); }
    if (Array.isArray(e.elements)) cardLines(e.elements, out, depth + 1);
    if (Array.isArray(e.columns)) for (const col of e.columns) cardLines(col && col.elements, out, depth + 1);
  }
  return out;
}

/** A system record's sentence: its template with the named parts filled. */
function larkSystemSentence(c, fallback) {
  if (!c || typeof c !== 'object') return fallback || '';
  // bounded: the template to a sentence's length, every filled part to a name's
  // (an unbounded `{a}` × 100 000 over a 64 KiB part threw RangeError out of ingest)
  const tpl = (typeof c.template === 'string' ? c.template : (typeof c.text === 'string' ? c.text : '')).slice(0, 2000);
  if (!tpl) return fallback || '';
  const part = (x) => String(x == null ? '' : x).slice(0, 200);
  return tpl.replace(/\{([a-z_]+)\}/gi, (whole, k) => {
    const v = Object.prototype.hasOwnProperty.call(c, k) ? c[k] : undefined;
    if (Array.isArray(v)) return v.slice(0, 50).map((x) => (x && typeof x === 'object' ? part(x.name || x.text || '') : part(x))).filter(Boolean).join(', ') || whole;
    if (typeof v === 'string' || typeof v === 'number') return part(v);
    return whole;
  });
}

// ── LARK MARKUP (lane channel-rich, 2026-09-28) ─────────────────────────
// The owner: "lark 有些消息里混入了 <p> 这种 raw tag". A Lark body can carry
// MARKUP in several places — a `text` message an integration posted as HTML
// (`<p>…</p>`, measured: 85 records in one conversation), a post's `text` /
// `md` element, a card's `lark_md` / `markdown` element, Lark's own inline
// tags (`<at …>`, `<font …>`, `<text_tag …>`). THIS is the one reader that
// turns it into BLOCKS: `<p>`/`<div>`/`<br>` are paragraph and line breaks,
// `<b>`/`<strong>` bold runs, `<i>`/`<em>` italic runs, `<a href>` a link
// through `safeHref`, `<at>` a mention chip, `<pre>` a code block, headings
// bold, list items bulleted, script/style/iframe/… dropped WITH their
// contents, the closed `MK_STRIP` list stripped to its text.
//
// THE VOCABULARY IS CLOSED (owner 2026-10-09: "我们现在处理 lark 的 html tag 的
// 时候会静默丢弃不认识的 tag，但其实有些 tag 并不是 lark 加上的而是用户自己要发的"):
// a tag the reader does NOT know is CONTENT — a speech-control tag a person
// typed (`<emphasis>Hello</emphasis>`, `<break time="500ms"/>`) stays in its
// text run AS WRITTEN: in the blocks, `rec.text`, an agent's text and the
// window (text runs are textContent — shown, never parsed as HTML).
//
// THE WALL IS THE FENCE (`sealTags` / `quoteTags`): a `<…>` left in a text run
// becomes `‹…›` ONLY when its name is one of OUR frame names — channel-record's
// `FRAME_TAG_RE`, the belt's own pattern, never a second spelling (a frame the
// reader ASSEMBLED out of the pieces around a tag it read is caught here);
// every other `<…>` is content. `TAG_LIKE_RE` / `carriesTag` only route a body
// to the reader (inline code and code blocks are code: shown as written).
/** A `<…>` that reads as a tag: `<`, an optional `/`, a letter, no angle bracket, `>`. */
const TAG_LIKE_RE = /<\/?[A-Za-z][^<>]*>/;
/** Does this string carry a tag-shaped `<…>`? */
function carriesTag(s) { return typeof s === 'string' && s.indexOf('<') >= 0 && TAG_LIKE_RE.test(s); }
/** The fence: a `<…>` whose name is one of OUR frame names becomes `‹…›`; any other `<…>` is content, as written.
 *  To the belt's FIXED POINT — channel-record's `foldFrames` (≤ 4 passes, a deeper nest withheld), never a second loop. */
function quoteTags(s) {
  return R.foldFrames(String(s == null ? '' : s), (m) => '‹' + m.slice(1, -1) + '›');
}
/** Seal every TEXT string of a tree (runs t/b/i/a/at, attribution, banner, card title/lines, sys);
 *  code runs and code blocks are code — shown as written. Returns the same (mutated) tree. */
function sealTags(blocks) {
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b || typeof b !== 'object') continue;
    for (const k of ['attribution', 'title']) if (typeof b[k] === 'string') b[k] = quoteTags(b[k]);
    if ((b.k === 'banner' || b.k === 'sys') && typeof b.text === 'string') b.text = quoteTags(b.text);
    if (Array.isArray(b.lines)) b.lines = b.lines.map((l) => (typeof l === 'string' ? quoteTags(l) : l));
    for (const r of Array.isArray(b.runs) ? b.runs : []) {
      if (!r || r.k === 'code') continue;
      if (typeof r.text === 'string') r.text = quoteTags(r.text);
      if (r.k === 'at' && typeof r.name === 'string') r.name = quoteTags(r.name);
    }
    if (Array.isArray(b.blocks)) sealTags(b.blocks);
  }
  return blocks;
}

/** The entities a markup body decodes (numeric + the common named ones); anything else stays as written. */
const NAMED_ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', middot: '·', bull: '•', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×', deg: '°', yen: '¥', euro: '€', emsp: ' ', ensp: ' ', thinsp: ' ', zwj: '\u200d', zwnj: '\u200c' });
function decodeEntities(s) {
  return String(s).replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return m;
      try { return String.fromCodePoint(n); } catch { return m; }
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, e.toLowerCase()) ? NAMED_ENTITIES[e.toLowerCase()] : m;
  });
}

/** How the reader treats each tag it KNOWS — the CLOSED vocabulary. Every other tag is CONTENT: text, as written. */
const MK_BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption', 'address', 'center', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'caption', 'dl', 'dt', 'dd', 'ul', 'ol', 'form', 'fieldset', 'details', 'summary', 'html', 'body']);
const MK_HEAD = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const MK_BOLD = new Set(['b', 'strong']);
const MK_ITALIC = new Set(['i', 'em', 'cite', 'var', 'dfn']);
const MK_CELL = new Set(['td', 'th']);
/** Dropped WITH their contents (a script's words are not the message). */
const MK_DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'textarea', 'title', 'head', 'svg', 'math', 'select', 'option', 'applet', 'noembed', 'noframes', 'xmp', 'video', 'audio', 'canvas']);
/** STRIPPED to their text (a void one to nothing): HTML's inline / void tags and Lark's own (`font`, `text_tag`, `link`, `emotion`, …). */
const MK_STRIP = new Set(['span', 'font', 'u', 'ins', 's', 'del', 'strike', 'small', 'big', 'sub', 'sup', 'mark', 'abbr', 'q', 'tt', 'kbd', 'samp', 'time', 'label', 'text_tag', 'link', 'emotion', 'local_datetime', 'number_tag', 'bdi', 'bdo', 'wbr', 'nobr', 'button', 'legend', 'meta', 'base', 'input', 'img', 'source', 'track', 'param', 'col', 'colgroup', 'area', 'map', 'picture', 'frame', 'frameset']);
/** READ into structure: a break, a rule, a list item, a quote, code, a link, a mention. */
const MK_READ = new Set(['hr', 'br', 'li', 'blockquote', 'pre', 'code', 'a', 'at', 'person']);
const knownTag = (n) => MK_BLOCK.has(n) || MK_HEAD.has(n) || MK_BOLD.has(n) || MK_ITALIC.has(n) || MK_CELL.has(n) || MK_DROP.has(n) || MK_STRIP.has(n) || MK_READ.has(n);
/** A tag: `<` `/`? name attrs? `/`? `>`; a comment; a declaration.
 *  LINEAR (security verify, 2026-09-28): the attribute run is ONE greedy `[^<>]*` — the earlier lazy run followed
 *  by `\s*` backtracked quadratically over a long whitespace run (`<a` + 64 KB of spaces = 1.7 s of the server's
 *  event loop per record, at ingest AND at every read through `recordView`). A trailing `/` in the run is the
 *  self-closing mark (`markupTokens` peels it). */
const MK_TAG_RE = /<(\/?)([A-Za-z][A-Za-z0-9_:-]{0,40})((?:\s[^<>]*)?)(\/?)>|<!--[\s\S]*?(?:-->|$)|<![^<>]{0,400}>/g;
/** One attribute's value out of an attribute string (entities decoded). */
function mkAttr(attrs, name) {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const m = re.exec(String(attrs || ''));
  return m ? decodeEntities(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]) : null;
}
/** Split out the CODE spans (``` fences, `inline`) the tag reader must not touch. */
function codeSpans(s) {
  const out = [];
  const re = /```[\s\S]*?```|`[^`\n]{1,300}`/g;
  let last = 0, m;
  while ((m = re.exec(s))) { if (m.index > last) out.push({ code: false, s: s.slice(last, m.index) }); out.push({ code: true, s: m[0] }); last = m.index + m[0].length; }
  if (last < s.length) out.push({ code: false, s: s.slice(last) });
  return out;
}
/** THE TOKENIZER: text / open / close / self tokens, code spans opaque. Bounded by the rung's `bounded()`. */
function markupTokens(src) {
  const toks = [];
  for (const seg of codeSpans(src)) {
    if (seg.code) { toks.push({ t: 'text', v: seg.s, code: true }); continue; }
    const s = seg.s;
    let last = 0, m;
    MK_TAG_RE.lastIndex = 0;
    while ((m = MK_TAG_RE.exec(s))) {
      if (m.index > last) toks.push({ t: 'text', v: s.slice(last, m.index) });
      last = m.index + m[0].length;
      if (m[2] === undefined) continue;   // a comment / a declaration: dropped
      const name = m[2].toLowerCase();
      let attrs = m[3] || '', self = !!m[4];
      if (!self && attrs && /\/\s*$/.test(attrs)) { self = true; attrs = attrs.replace(/\/\s*$/, ''); }
      toks.push({ t: m[1] ? 'close' : (self ? 'self' : 'open'), name, attrs, raw: m[0] });
    }
    if (last < s.length) toks.push({ t: 'text', v: s.slice(last) });
  }
  // A TAG THE READER DOES NOT KNOW IS CONTENT (owner 2026-10-09): paired or lone, with attributes or none, closing
  // itself or not, it is TEXT as written where it stood — never stripped, never quoted; text pieces are joined again
  const closed = new Set();
  for (const k of toks) if (k.t === 'close') closed.add(k.name);
  for (const k of toks) {
    if (k.t === 'text') continue;
    // A DROP TAG WITH NO CLOSER IS NOT A DROP (security verify r2, 2026-09-28): "please set the <title> of the
    // page", "the <select> is broken", "hello <svg> world" — an open drop tag ran to the END of the message and
    // everything after it was silently gone from the agent's text AND the window (a data loss anyone can send,
    // and a way to hide the rest of a message from an agent). A drop is a drop only when the message CLOSES it;
    // an unclosed one with no attributes is the word a person typed (the wall words it ‹title›), with
    // attributes it is that one tag alone — the words after it stay either way.
    if (k.t === 'open' && MK_DROP.has(k.name) && !closed.has(k.name)) {
      if (!k.attrs.trim()) { k.t = 'text'; k.v = k.raw; k.lone = true; } else k.t = 'self';
      continue;
    }
    if (!knownTag(k.name)) { k.t = 'text'; k.v = k.raw; }
  }
  const out = [];
  for (const k of toks) { const p = out[out.length - 1]; if (k.t === 'text' && !k.code && p && p.t === 'text' && !p.code) p.v += k.v; else out.push(k); }
  return out;
}

/** Italic `*x*` / `_x_` and `~~strike~~` of Lark markdown over a run list (bold `**x**` is `inlineRuns`'). */
function mdEmphasis(runs) {
  const out = [];
  const re = /~~([^~\n]{1,300})~~|(?<![*\w])\*(?![*\s])([^*\n]{1,300}?)(?<!\s)\*(?![*\w])|(?<![_\w])_(?![_\s])([^_\n]{1,300}?)(?<!\s)_(?![_\w])/g;
  for (const r of runs) {
    if (!r || r.k !== 't') { out.push(r); continue; }
    let last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(r.text))) {
      if (m.index > last) out.push({ k: 't', text: r.text.slice(last, m.index) });
      if (m[1] !== undefined) out.push({ k: 't', text: m[1] });
      else out.push({ k: 'i', text: m[2] !== undefined ? m[2] : m[3] });
      last = m.index + m[0].length;
    }
    if (last < r.text.length) out.push({ k: 't', text: r.text.slice(last) });
  }
  // adjacent text runs merged again
  const merged = [];
  for (const r of out) { const p = merged[merged.length - 1]; if (p && p.k === 't' && r.k === 't') p.text += r.text; else merged.push(r); }
  return merged;
}

/**
 * THE MARKUP READER: a markup string → BLOCKS (`mode: 'blocks'`) or one run
 * list with `\n` for every block boundary (`mode: 'inline'`, inside a post
 * line). `opts`: `ictx` (the rung's compiled inline context — ordinals and
 * names), `nameOf(id)` (the roster's name for a mention id), `md` (Lark
 * markdown: headings, lists, rules, quotes, fences, emphasis).
 */
function markupRead(text, opts = {}) {
  const ictx = opts.ictx || inlineCtx({});
  const mode = opts.mode === 'inline' ? 'inline' : 'blocks';
  const nameOf = typeof opts.nameOf === 'function' ? opts.nameOf : () => '';
  // our own frames go FIRST (rule 3 of channel-record: `<system-reminder>` is words, never a tag to strip)
  let src = R.inertFrames(String(text == null ? '' : text));
  const decode = carriesTag(src) || /&(#\d+|#x[0-9a-f]+|[a-z]{2,8});/i.test(src);
  const out = [];              // the blocks (a quote's inner list while inside one)
  const stack = [];            // open blockquotes: {outer, blocks}
  let runs = [];
  let bold = 0, italic = 0, drop = null, dropDepth = 0, link = null, at = null, pre = null;
  const lists = [];            // {ordered, n}
  // THE NESTING BOUND (security verify, 2026-09-28): 10 000 `<blockquote>` opens built a tree 10 000 deep — the
  // text path's `blocksToPlain` overflowed the stack and `toRecord` THREW (a poison message). A quote deeper than
  // the record's own depth limit allows (`opts.depth` = where this output lands) is a paragraph break, not a level.
  const baseDepth = Math.max(0, Math.floor(Number(opts.depth) || 0));
  let overQuote = 0;
  const cur = () => (stack.length ? stack[stack.length - 1].blocks : out);
  // THE TAIL CHARACTER IS TRACKED (security verify r2, 2026-09-28): `brk()` and a cell asked `/\n$/.test(last.text)`
  // on the run every `<li>` / `<br>` had just been APPENDED to — V8 flattens the rope for every regex, so 10 000
  // list items were 10 000 × (the text so far): 128 KB of `<li>` = 430 ms of the event loop at ingest, a
  // megabyte = half a minute. One character, kept beside the run, answers the same question in O(1).
  let tail = '';   // the last character of the last text run (or '' when the last run is not text / none)
  const pushRun = (r) => {
    if (!r) return;
    const last = runs[runs.length - 1];
    if (r.k === 't' && last && last.k === 't') { last.text += r.text; if (r.text) tail = r.text[r.text.length - 1]; return; }
    runs.push(r);
    tail = r.k === 't' && r.text ? r.text[r.text.length - 1] : '';
  };
  const flush = () => {
    tail = '';
    while (runs.length && runs[runs.length - 1].k === 't' && !runs[runs.length - 1].text.trim()) runs.pop();
    while (runs.length && runs[0].k === 't' && !runs[0].text.trim()) runs.shift();
    if (runs.length && runs[runs.length - 1].k === 't') runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
    if (runs.length && runs[0].k === 't') runs[0].text = runs[0].text.replace(/^\s+/, '');
    if (runs.some((r) => r.k !== 't' || r.text)) cur().push({ k: 'p', runs });
    runs = [];
  };
  const brk = () => {
    if (mode === 'inline') { if (runs.length && tail !== '\n') pushRun({ k: 't', text: '\n' }); return; }
    flush();
  };
  const styled = (list) => {
    for (const r of list) {
      if (r.k === 't' && (bold || italic)) pushRun({ k: bold ? 'b' : 'i', text: r.text });
      else pushRun(r);
    }
  };
  const textOut = (v, code) => {
    if (drop) return;
    if (pre) { pre.text += code ? v : decode ? decodeEntities(v) : v; return; }
    const s = code ? v : (decode ? decodeEntities(v) : v);
    if (link) { link.text += s; return; }
    if (at) { at.text += s; return; }
    if (code) { styled(inlineRuns(s, ictx)); return; }
    // a blank line is a paragraph break; a single newline stays in the run
    const parts = s.split(/\n[ \t]*\n+/);
    parts.forEach((part, i) => {
      if (i > 0) brk();
      if (!part) return;
      let rs = inlineRuns(part, ictx);
      if (opts.md) rs = mdEmphasis(rs);
      styled(rs);
    });
  };
  const toks = markupTokens(src);
  for (const k of toks) {
    if (k.t === 'text') { textOut(k.v, !!k.code); continue; }
    const n = k.name;
    if (drop) { if (n === drop) { if (k.t === 'open') dropDepth++; else if (k.t === 'close' && --dropDepth <= 0) { drop = null; dropDepth = 0; } } continue; }
    if (k.t === 'open' && MK_DROP.has(n)) { drop = n; dropDepth = 1; continue; }
    if (MK_DROP.has(n)) continue;   // a stray closer / a self-closing one
    if (pre) {
      if (n === 'pre' && k.t === 'close') { const o = { k: 'code', text: pre.text.replace(/^\n/, '').replace(/\n$/, '') }; pre = null; if (o.text.trim()) { flush(); cur().push(o); } }
      else if (n === 'br') pre.text += '\n';
      continue;   // markup inside a code block: its text only
    }
    const open = k.t === 'open', close = k.t === 'close', self = k.t === 'self';
    if (n === 'br') { if (link) link.text += ' '; else if (at) at.text += ' '; else pushRun({ k: 't', text: '\n' }); continue; }
    if (n === 'hr') { if (mode === 'inline') { brk(); pushRun({ k: 't', text: '—' }); brk(); } else { flush(); cur().push({ k: 'hr' }); } continue; }
    if (n === 'pre') { if (open) { flush(); pre = { text: '' }; } continue; }
    if (n === 'a') {
      if (open) { link = { href: mkAttr(k.attrs, 'href') || '', text: '' }; continue; }
      if (close && link) {
        const href = safeHref(link.href);
        const label = link.text.replace(/\s+/g, ' ').trim();
        link = null;
        if (href) pushRun({ k: 'a', href, text: linkText({ href, text: label || href }) });
        else if (label) styled([{ k: 't', text: label }]);
      }
      continue;
    }
    if (n === 'at' || n === 'person') {
      const id = mkAttr(k.attrs, 'user_id') || mkAttr(k.attrs, 'open_id') || mkAttr(k.attrs, 'id') || mkAttr(k.attrs, 'email') || '';
      if (open) { at = { id: String(id).slice(0, 256), text: '' }; continue; }
      const done = (who) => { const nm = R.peerName((who.id === 'all' ? 'all' : nameOf(who.id)) || who.text.replace(/\s+/g, ' ').trim() || who.id, 200); if (nm) pushRun({ k: 'at', id: who.id === 'all' ? 'all' : who.id, name: nm }); };   // the .197 integration: a mention's name through THE name door (lark-search-poll ④g)
      if (self) { done({ id: String(id).slice(0, 256), text: '' }); continue; }
      if (close && at) { const w = at; at = null; done(w); }
      continue;
    }
    if (link || at) continue;   // markup inside a link label / a mention: its text only
    if (MK_BOLD.has(n)) { if (open) bold++; else if (close && bold) bold--; continue; }
    if (MK_ITALIC.has(n)) { if (open) italic++; else if (close && italic) italic--; continue; }
    if (MK_HEAD.has(n)) { brk(); if (open) bold++; else if (close && bold) bold--; continue; }
    if (n === 'blockquote') {
      if (mode === 'inline') { brk(); continue; }
      if (open) { flush(); if (baseDepth + stack.length + 1 > MAX_DEPTH) overQuote++; else stack.push({ blocks: [] }); continue; }
      if (close && overQuote) { flush(); overQuote--; continue; }
      if (close && stack.length) { flush(); const q = stack.pop(); if (q.blocks.length) cur().push({ k: 'quote', blocks: q.blocks, lines: q.blocks.length }); }
      continue;
    }
    if (n === 'ul' || n === 'ol') { brk(); if (open) lists.push({ ordered: n === 'ol', n: 0 }); else if (close) lists.pop(); continue; }
    if (n === 'li') {
      if (!open) { brk(); continue; }
      brk();
      const l = lists[lists.length - 1];
      pushRun({ k: 't', text: l && l.ordered ? `${++l.n}. ` : '• ' });
      continue;
    }
    if (MK_CELL.has(n)) { if (open) { if (runs.length && !/\s/.test(tail)) pushRun({ k: 't', text: '  ' }); } continue; }
    if (MK_BLOCK.has(n)) { brk(); continue; }
    if (n === 'code') continue;   // an HTML <code> inline: its text (a backtick span is the code run)
    // MK_STRIP (img / meta / input / font / span / …): stripped to its text (nothing) — an unknown tag is text by now
  }
  if (link) { const l = link; link = null; styled([{ k: 't', text: l.text }]); }
  if (at) { const w = at; at = null; if (w.text) styled([{ k: 't', text: w.text }]); }
  if (pre) { flush(); if (pre.text.trim()) cur().push({ k: 'code', text: pre.text }); pre = null; }
  if (mode === 'inline') {
    while (runs.length && runs[runs.length - 1].k === 't' && !runs[runs.length - 1].text.trim()) runs.pop();
    while (stack.length) stack.pop();
    return runs;
  }
  flush();
  while (stack.length) { const q = stack.pop(); if (q.blocks.length) cur().push({ k: 'quote', blocks: q.blocks, lines: q.blocks.length }); }
  return out;
}

/**
 * LARK MARKDOWN (a post's `md` element, a card's `lark_md` / `markdown`):
 * line-level first — ``` fences, `#` headings (bold), `- ` / `* ` / `1. `
 * list items (a bullet / the number), `---` rules, `> ` quotes — then every
 * paragraph through the markup reader (HTML-ish tags, links, mentions,
 * emphasis). → blocks.
 */
function larkMdBlocks(text, opts = {}) {
  const lines = splitLines(bounded(text));
  const out = [];
  let para = [];
  const depth = Math.max(0, Math.floor(Number(opts.depth) || 0));
  const flush = () => { if (para.length) { out.push(...markupRead(para.join('\n'), { ...opts, depth, md: true, mode: 'blocks' })); para = []; } };
  // ONE fence walk (security verify, 2026-09-28 — the email rung's verify-round-4 rule, re-applied here): a walk
  // that found no closer proves there is none after it, so every later opener is a plain line (13 000 "```js"
  // lines were 0.6–1.3 s of the event loop per record, quadratic)
  let noCloserFrom = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const fence = i < noCloserFrom ? /^\s*```\s*([A-Za-z0-9_+-]{0,30})\s*$/.exec(l) : null;
    if (fence) {
      let j = i + 1;
      while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) j++;
      if (j < lines.length) { flush(); const o = { k: 'code', text: lines.slice(i + 1, j).join('\n') }; if (fence[1]) o.lang = fence[1]; out.push(o); i = j; continue; }
      noCloserFrom = i;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { flush(); out.push({ k: 'hr' }); continue; }
    if (QUOTED.test(l)) {
      flush();
      let j = i;
      while (j < lines.length && QUOTED.test(lines[j])) j++;
      // the nesting bound (security verify): a quote past the record's depth limit is its words, unquoted —
      // 20 000 `> ` on one line recursed 20 000 deep and overflowed the stack
      if (depth + 1 > MAX_DEPTH) { para.push(...lines.slice(i, j).map((x) => String(x).replace(/^(?:\s*>\s?)+/, ''))); flush(); i = j - 1; continue; }
      const inner = larkMdBlocks(lines.slice(i, j).map(stripQuote).join('\n'), { ...opts, depth: depth + 1 });
      if (inner.length) out.push({ k: 'quote', blocks: inner, lines: j - i });
      i = j - 1;
      continue;
    }
    const h = /^\s*#{1,6}\s+(.*)$/.exec(l);
    if (h) { flush(); para.push(`<b>${h[1]}</b>`); flush(); continue; }
    if (blank(l)) { flush(); continue; }
    const li = /^(\s*)(?:[-*+]|(\d{1,3})[.)])\s+(.*)$/.exec(l);
    if (li) { flush(); para.push(`${' '.repeat(Math.min(3, Math.floor(li[1].length / 2)))}${li[2] ? `${li[2]}. ` : '• '}${li[3]}`); flush(); continue; }
    para.push(l);
  }
  flush();
  return out;
}

/**
 * A markup-bearing Lark body → the words an AGENT reads (`rec.text`): the
 * same reader's blocks, flattened — paragraphs by a newline, a link as
 * "label (href)", a mention as "@name", a rule as "—", a quote's lines "> ",
 * then sealed. A string with no tag-shaped `<…>` and no entity is returned
 * AS IT IS (a plain message is never re-flowed).
 */
function larkPlainText(text, opts = {}) {
  const s = String(text == null ? '' : text);
  if (!carriesTag(s) && !/&(#\d+|#x[0-9a-f]+|[a-z]{2,8});/i.test(s)) return s;
  return quoteTags(blocksToPlain(markupRead(bounded(s), { ...opts, ictx: inlineCtx({}), mode: 'blocks' })));
}

/**
 * AN INTERACTIVE CARD's elements → blocks (D1: header title, `div` / `markdown`
 * text, `hr`, `note`, buttons as LABELS only — never a clickable vendor url).
 * Both shapes: the list answer's post-like `elements: [[…]]` and the card
 * JSON's `elements: [{tag…}]` (also card 2.0's `body.elements`, and
 * `i18n_elements` by locale). Bounded: depth 6, BLOCK_LIMITS.cardLines × 4 blocks.
 */
const CARD_LOCALES = ['zh_cn', 'en_us', 'ja_jp'];
function cardElementsOf(c) {
  if (!c || typeof c !== 'object') return [];
  if (Array.isArray(c.elements)) return c.elements;
  if (c.body && Array.isArray(c.body.elements)) return c.body.elements;
  if (c.i18n_elements && typeof c.i18n_elements === 'object') for (const k of [...CARD_LOCALES, ...Object.keys(c.i18n_elements)]) if (Array.isArray(c.i18n_elements[k])) return c.i18n_elements[k];
  return [];
}
function cardTitleOf(c) {
  if (!c || typeof c !== 'object') return '';
  const h = c.header || {};
  const t = (h.title && (h.title.content || h.title.text)) || c.title || '';
  if (t) return String(t);
  if (h.i18n_title && typeof h.i18n_title === 'object') for (const k of [...CARD_LOCALES, ...Object.keys(h.i18n_title)]) if (h.i18n_title[k]) return String(h.i18n_title[k]);
  return '';
}
function larkCardBlocks(c, mentions, opts = {}) {
  const ictx = inlineCtx({ ordinals: mentions });
  const nameOf = opts.nameOf || (() => '');
  const out = [];
  const cap = BLOCK_LIMITS.cardLines * 4;
  const textOf = (x) => (x && typeof x === 'object' ? { s: String(x.content || x.text || ''), md: x.tag === 'lark_md' || x.tag === 'markdown' } : { s: typeof x === 'string' ? x : '', md: false });
  // a card's inner blocks land one level down (`card.blocks`) — the readers' nesting bound counts it
  const para = (x, md) => { if (!x || !String(x).trim()) return; out.push(...(md ? larkMdBlocks(x, { ictx, nameOf, depth: 1 }) : markupRead(bounded(x), { ictx, nameOf, depth: 1, mode: 'blocks' }))); };
  const walk = (els, depth) => {
    if (!Array.isArray(els) || depth > 6) return;
    for (const e of els) {
      if (out.length >= cap) return;
      if (Array.isArray(e)) {
        // the list answer's post-like line
        const blocks = larkPostBlocks({ content: [e] }, mentions, { names: opts.names || null, depth: 1 });
        out.push(...blocks);
        continue;
      }
      if (!e || typeof e !== 'object') continue;
      switch (e.tag) {
        case 'hr': out.push({ k: 'hr' }); break;
        case 'markdown': case 'lark_md': para(e.content || (e.text && e.text.content) || '', true); break;
        case 'plain_text': para(e.content || '', false); break;
        case 'div': {
          if (e.text) { const t = textOf(e.text); para(t.s, t.md); }
          if (Array.isArray(e.fields)) for (const f of e.fields) { const t = textOf(f && f.text); para(t.s, t.md); }
          if (e.extra && e.extra.tag === 'button' && e.extra.text) { const t = textOf(e.extra.text); if (t.s.trim()) out.push({ k: 'p', runs: [{ k: 't', text: `[${markupPlainLine(t.s)}]` }] }); }
          break;
        }
        case 'note': {
          const words = (Array.isArray(e.elements) ? e.elements : []).map((x) => (x && (x.tag === 'plain_text' || x.tag === 'lark_md') ? markupPlainLine(String(x.content || '')) : '')).filter(Boolean).join(' ');
          if (words) out.push({ k: 'banner', text: words.slice(0, 400) });
          break;
        }
        case 'action': {
          // buttons as LABELS only — a card button's url / value is the vendor's, never a link here
          const labels = (Array.isArray(e.actions) ? e.actions : []).map((a) => markupPlainLine(String((a && a.text && (a.text.content || a.text.text)) || (a && a.placeholder && a.placeholder.content) || ''))).filter(Boolean);
          if (labels.length) out.push({ k: 'p', runs: [{ k: 't', text: labels.map((l) => `[${l}]`).join(' ') }] });
          break;
        }
        case 'button': { const l = markupPlainLine(String((e.text && (e.text.content || e.text.text)) || '')); if (l) out.push({ k: 'p', runs: [{ k: 't', text: `[${l}]` }] }); break; }
        case 'column_set': for (const col of Array.isArray(e.columns) ? e.columns : []) walk(col && col.elements, depth + 1); break;
        case 'collapsible_panel': {
          const t = e.header && e.header.title ? textOf(e.header.title) : { s: '' };
          if (t.s.trim()) out.push({ k: 'p', runs: [{ k: 'b', text: markupPlainLine(t.s) }] });
          walk(e.elements, depth + 1);
          break;
        }
        case 'img': case 'image': { const alt = e.alt ? textOf(e.alt).s : ''; if (alt.trim()) out.push({ k: 'banner', text: `[${markupPlainLine(alt).slice(0, 200)}]` }); break; }
        default: {
          if (e.text) { const t = textOf(e.text); para(t.s, t.md); } else if (typeof e.content === 'string') para(e.content, false);
          if (Array.isArray(e.elements)) walk(e.elements, depth + 1);
          if (Array.isArray(e.columns)) for (const col of e.columns) walk(col && col.elements, depth + 1);
        }
      }
    }
  };
  walk(cardElementsOf(c), 0);
  return out.slice(0, cap);
}
/** One line of markup → its plain words (a button label, a note, a title). */
function markupPlainLine(s) {
  const x = String(s == null ? '' : s);
  return carriesTag(x) || /&[#a-z0-9]{2,8};/i.test(x) ? blocksToPlain(markupRead(x.slice(0, 2000), { mode: 'blocks' })).replace(/\s+/g, ' ').trim() : x.trim();
}

/** Which `sys.what` a Lark message type is. */
const LARK_SYS = Object.freeze({ sticker: 'sticker', share_chat: 'share-chat', share_user: 'share-user', merge_forward: 'forward', location: 'location', video_chat: 'call', share_calendar_event: 'calendar', calendar: 'calendar', todo: 'todo', system: 'system' });

/**
 * THE LARK RUNG, over the VENDOR item (ingest). `mentions` = the message's
 * own mentions in ordinal order (src/channels/lark.js `mentionsOf`);
 * `opts.text` = the record's `text` (a system line's fallback words);
 * `opts.names` = open_id → display name (chat members).
 */
function larkToBlocks(item, mentions = [], opts = {}) {
  const fallback = bounded(typeof opts.text === 'string' ? opts.text : '');
  return guarded(fallback, () => larkItemBlocks(item, mentions, opts, fallback));
}
function larkItemBlocks(item, mentions, opts, fallback) {
  const it = item && typeof item === 'object' ? item : {};
  const c = parseJson(it.body && it.body.content);
  if (it.deleted === true) return finish([{ k: 'sys', what: 'deleted', text: fallback || '[deleted]' }], fallback);
  const type = String(it.msg_type || '');
  const nameOf = (id) => (opts.names && typeof opts.names.get === 'function' && opts.names.get(id)) || ((mentions || []).find((m) => m && m.id === id) || {}).name || '';
  switch (type) {
    case 'text': {
      // lane channel-rich (D1): a text body that carries MARKUP (an integration's `<p>…</p>`, Lark's own inline
      // tags) goes through the markup reader; a plain one through the generic rung as before — then the wall
      const t = bounded(String((c && c.text) || ''));
      if (!carriesTag(t)) return finish(sealTags(textToBlocks(t, { ordinals: mentions })), fallback);
      return finish(sealTags(markupRead(t, { ictx: inlineCtx({ ordinals: mentions }), nameOf, mode: 'blocks' })), fallback);
    }
    case 'post': return finish(sealTags(larkPostBlocks(c, mentions, opts)), fallback);
    case 'image': return finish(c && c.image_key ? [{ k: 'img', attachmentId: String(c.image_key) }] : [{ k: 'sys', what: 'unknown', text: fallback }], fallback);
    case 'file': case 'folder': case 'media': case 'audio':
      return finish(c && c.file_key ? [{ k: 'file', attachmentId: String(c.file_key) }] : [{ k: 'sys', what: 'unknown', text: fallback }], fallback);
    case 'interactive': {
      // lane channel-rich (D1): a card RENDERS its elements — header title, div / markdown text, hr, note,
      // buttons as labels — as inner blocks (the older `lines` stay empty on a new record)
      const title = markupPlainLine(cardTitleOf(c)).slice(0, 400);
      const blocks = larkCardBlocks(c, mentions, { ...opts, nameOf });
      if (!title && !blocks.length) return finish([{ k: 'sys', what: 'card', text: fallback || '[card]' }], fallback);
      return finish(sealTags([{ k: 'card', title, lines: [], blocks }]), fallback);
    }
    case 'system': return finish(sealTags([{ k: 'sys', what: 'system', text: markupPlainLine(larkSystemSentence(c, fallback)) || fallback }]), fallback);
    default: return finish([{ k: 'sys', what: LARK_SYS[type] || 'unknown', text: fallback || `[${type || 'message'}]` }], fallback);
  }
}

/**
 * THE LARK RUNG over a record stored BEFORE this layer — only its flattened
 * `text` (+ attachments, mentions, `raw.msg_type`) survives. The engine
 * serves it through here at READ time; the store is never rewritten.
 */
function larkStoredBlocks(record) {
  const r = record && typeof record === 'object' ? record : {};
  const text = bounded(r.text || '');
  return guarded(text, () => larkStoredRecordBlocks(r, text));
}
function larkStoredRecordBlocks(r, text) {
  const type = String((r.raw && r.raw.msg_type) || '');
  const atts = Array.isArray(r.attachments) ? r.attachments.filter((a) => a && a.id) : [];
  const legacy = { image: LARK_IMAGE_TOKEN, video: LARK_VIDEO_TOKEN };
  if (text === '[deleted]') return finish([{ k: 'sys', what: 'deleted', text }], text);
  switch (type) {
    case 'text': case 'post': case '': {
      // lane channel-rich (D1): a record stored with markup in its text (the owner's `<p>` rows) — its words
      // through the markup reader first, then the rung (the "[image]" lines are the pictures, the @names chips)
      const words = carriesTag(text) ? larkPlainText(text) : text;
      return finish(sealTags(textToBlocks(words, { attachments: atts, legacyPlaceholders: legacy, mentionNames: r.mentions })), text);
    }
    case 'image': return finish(atts.length ? atts.map((a) => ({ k: 'img', attachmentId: String(a.id) })) : [{ k: 'sys', what: 'unknown', text }], text);
    case 'file': case 'folder': case 'media': case 'audio':
      return finish(atts.length ? atts.map((a) => ({ k: /^image\//i.test(String(a.mime || '')) ? 'img' : 'file', attachmentId: String(a.id) })) : [{ k: 'sys', what: 'unknown', text }], text);
    case 'interactive': {
      // a card's first line is "[card] <title>"; a record written since lane channel-rich carries its elements' words after it
      const [first, ...rest] = text.split('\n');
      const title = first.replace(/^\[card\]\s*/, '').trim();
      const body = rest.join('\n').trim();
      const blocks = body ? textToBlocks(larkPlainText(body)) : [];
      return finish(sealTags(title && title !== '[card]' ? [{ k: 'card', title, lines: [], ...(blocks.length ? { blocks } : {}) }] : [{ k: 'sys', what: 'card', text }]), text);
    }
    default: return finish(sealTags([{ k: 'sys', what: LARK_SYS[type] || 'unknown', text }]), text);
  }
}

module.exports = {
  LARK_SYS, LARK_IMAGE_TOKEN, LARK_VIDEO_TOKEN,
  larkToBlocks, larkStoredBlocks, larkPostBody, larkSystemSentence, cardLines,
  // lane channel-rich (D1): THE LARK MARKUP READER + the wall
  TAG_LIKE_RE, carriesTag, quoteTags, sealTags, decodeEntities, markupTokens, markupRead, larkMdBlocks, larkPlainText, larkCardBlocks, cardTitleOf, markupPlainLine,
};
