'use strict';
/**
 * THE RENDER LAYER'S RUNGS: raw → blocks (docs/design-communication-panel.zh.md
 * §25, 2026-09-27). PURE, CJS — the adapters require it at ingest, the engine
 * at read time for a record stored before this layer existed, and the browser
 * bundle for the generic fallback; imports ONLY src/channel-record.js (the
 * block SCHEMA + `inertFrames` live there, beside the record they belong to).
 *
 * The owner (2026-09-27): "架构层面你可能需要设计一个不同 connector 的 raw
 * message to HTML 的接口，比如邮件展示的时候就需要自动折叠 quote 内容，lark
 * 展示的时候需要自动把 markdown 格式的一些链接之类的变成链接。"
 *
 * THE INTERFACE IS A TYPED TREE, NEVER HTML. An adapter turns its vendor
 * payload into a CLOSED block model (`BLOCK_KINDS` / `RUN_KINDS` in
 * channel-record.js) and ONE client renderer (src/lib/channel-blocks-view.js)
 * turns that into DOM with createElement/textContent. So no vendor string ever
 * reaches innerHTML, a link is built from a VALIDATED href (http(s):/mailto:
 * only — checked here and again at render time), and a picture is an
 * attachment ID the window loads through our own route.
 *
 * THE RUNGS:
 *  · `textToBlocks(text, opts)` — the GENERIC rung every adapter gets for free
 *    (and the fallback for a record stored before this layer): paragraphs,
 *    bare-URL / `www.` / e-mail linkify, markdown `[text](url)` links, `<url>`,
 *    `>`-quote folding, a `-- ` signature, ``` fenced code, `**bold**`,
 *    `` `code` ``, `@_user_N` ordinals against the message's own mentions,
 *    an attachment's declared placeholder ("[image]") as the picture itself.
 *  · `emailToBlocks(text, opts)` — the generic rung + the mail heuristics:
 *    the quoted history (EMAIL_QUOTE_RULES — "On … wrote:", "在 … 写道：",
 *    Outlook's From/Sent/To/Subject block, "-----Original Message-----",
 *    "---------- Forwarded message ---------") folded WITH its attribution,
 *    ticket banners ("Please reply above this line", `======` rules), and
 *    signatures ("-- ", "Sent from my iPhone").
 *  · `larkToBlocks(item, mentions, opts)` — Lark's vendor item: a `post`'s
 *    rich text kept (text/a/at/img/media/emotion/code_block/md), a `text`
 *    message through the generic rung with its mentions as chips, an image as
 *    the picture (NO "[image]" text — `text` keeps it for agents), a card as a
 *    card, the rest as a system line.
 *  · `larkStoredBlocks(record)` — the same for a Lark record stored BEFORE
 *    this layer (only its flattened `text` survives): the placeholder lines
 *    become the pictures, the resolved `@name`s become chips.
 *  · `cleanSubject(subject)` — a mail thread's TITLE without the ticket
 *    banner / `======` rules / a chain of `Re: RE: Fwd:` (the record's
 *    `raw.subject` stays verbatim).
 *  · `previewOf(blocks)` — the one-line preview a list row shows (a banner, a
 *    quote and a signature are not the message).
 *
 * EVERY RUNG ENDS IN `validateBlocks` — a rung never returns an invalid tree:
 * on a refusal (a bound passed) it answers ONE plain paragraph of the text.
 * `text` stays the agent-facing string on every path: agents are handed
 * `text`, never blocks.
 */
const R = require('./channel-record.js');

// the schema, re-exported under its own names (plain identifiers, so an ESM
// importer — the browser bundle, a node suite — sees every named export)
const { validateBlocks, safeHref, BLOCK_LIMITS, BLOCK_KINDS, RUN_KINDS, SYS_WHATS, LINK_SCHEMES } = R;

/** A quote / signature of fewer lines than this is shown, never folded — a
 *  one-line chat quote behind a toggle is harder to read, not easier. */
const FOLD_MIN_LINES = 3;
/** A `-- ` line is a signature delimiter only when what follows is short. */
const SIG_MAX_LINES = 15;
/** The quote depth a rung builds to (the schema's bound is one deeper). */
const MAX_DEPTH = BLOCK_LIMITS.depth - 1;
/** Lark's placeholder tokens (src/channels/lark.js writes them into `text`). */
const LARK_IMAGE_TOKEN = '[image]';
const LARK_VIDEO_TOKEN = '[video]';

// ── inline runs ─────────────────────────────────────────────────────────
const URL_CH = "A-Za-z0-9\\-._~:/?#\\[\\]@!$&'()*+,;=%";
const INLINE_SRC = [
  // 1 markdown link [label](url) — one level of parens inside the url
  '\\[([^\\[\\]\\n]{0,500})\\]\\(\\s*<?([^\\s()<>]*(?:\\([^\\s()<>]*\\)[^\\s()<>]*)*)>?\\s*\\)',
  // 3 an autolink <https://…> / <mailto:…>
  '<((?:https?:\\/\\/|mailto:)[^\\s<>]+)>',
  // 4,5 Lark's <at user_id="…">Name</at>
  '<at\\s+(?:user_id|open_id|id)\\s*=\\s*["\']?([^"\'>\\s]*)["\']?\\s*>([^<]{0,200})<\\/at>',
  // 6 an ordinal @_user_N / @_all
  '@_(user_\\d+|all)\\b',
  // 7 a bare URL (not the tail of a word: "awww.example" is no link)
  `(?<![A-Za-z0-9@./])((?:https?:\\/\\/|www\\.)[${URL_CH}]+)`,
  // 8 a bare mailto:
  '(mailto:[^\\s<>]+)',
  // 9 an e-mail address — EVERY part BOUNDED (RFC 5321 lengths): an unbounded
  // local part made the engine backtrack over a whole 64 KiB word at every
  // position (O(n²): 2.3 s per 64 KiB, minutes for a 1 MiB mail body)
  '([A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\\.[A-Za-z0-9-]{1,63}){0,8}\\.[A-Za-z]{2,24})',
  // 10 inline code
  '`([^`\\n]{1,300})`',
  // 11 bold
  '\\*\\*([^*\\n]{1,300})\\*\\*',
];
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The mention names a rung resolves in the text (`opts.mentionNames`), longest first. */
function namesOf(opts) {
  return (Array.isArray(opts && opts.mentionNames) ? opts.mentionNames : [])
    .filter((m) => m && typeof m.name === 'string' && m.name.trim()).map((m) => ({ id: String(m.id || ''), name: m.name }))
    .sort((a, b) => b.name.length - a.name.length);
}
/**
 * THE INLINE REGEX OF ONE RUNG CALL — COMPILED ONCE (verify round 2, 2026-09-27).
 * `inlineRuns` used to build it per call, and a rung calls it per PARAGRAPH: with
 * the message's own mention names in the alternation (≤ 256 names of ≤ 200
 * characters — a 50 KiB source) a 64 KiB body of 21 000 one-line paragraphs cost
 * 1.6 s on the event loop (37 ms without the names) — at READ time for every
 * stored Lark record, on every page and every broadcast patch, and again in every
 * client. `mkCtx` compiles it once and every paragraph of the call shares it.
 */
function inlineRe(names) {
  const src = names.length ? [...INLINE_SRC, `@(${names.map((m) => escRe(m.name)).join('|')})`] : INLINE_SRC;
  return new RegExp(src.map((x) => `(?:${x})`).join('|'), 'g');
}
/** What `inlineRuns` needs compiled, carried on the options of the whole call. */
function inlineCtx(opts = {}) {
  const names = namesOf(opts);
  return { ordinals: opts.ordinals || null, mentionNames: opts.mentionNames || null, inlineNames: names, inlineRe: inlineRe(names) };
}
const countCh = (s, ch) => { let n = 0; for (const c of s) if (c === ch) n++; return n; };

/** A bare URL without the punctuation that ends the sentence around it. */
function trimUrl(u) {
  // the bracket census ONCE, decremented as the tail is trimmed (a count per
  // trimmed character was O(n²): 11 s on a URL followed by 60 000 ")")
  let open = countCh(u, '('), close = countCh(u, ')'), sqOpen = countCh(u, '['), sqClose = countCh(u, ']');
  let end = u.length;
  while (end > 0) {
    const last = u[end - 1];
    if (/[.,;:!?'"*]/.test(last)) { end--; continue; }
    if (last === ')' && open < close) { end--; close--; continue; }
    if (last === ']' && sqOpen < sqClose) { end--; sqClose--; continue; }
    break;
  }
  return end === u.length ? u : u.slice(0, end);
}

/**
 * THE WORDS A LINK SHOWS: its own label — unless the label is itself a URL on
 * ANOTHER host than the target (`[https://bank.example](https://evil.example)`),
 * then the TARGET, so a link never says it goes somewhere it does not. Used by
 * the rung and again by the renderer.
 */
/** A label that READS AS A SITE without a scheme — `paypal.com`, `bank.co.uk/login` — on a short list of
 *  endings a person recognises as one (never `package.json` or `v2.0`). */
const SITE_LABEL_RE = /^(?:[a-z0-9-]+\.)+(?:com|org|net|io|ai|co|cn|jp|dev|app|edu|gov|me|info|xyz|cc|tv|us|uk|de|fr|ru|in|br|kr|tw|hk|sg|au|ca|eu|ch|nl|se|no|es|it)(?:[/?#][^\s]*)?$/i;
function linkText(run) {
  const href = run && run.href ? String(run.href) : '';
  const txt = run && run.text ? String(run.text) : '';
  if (!txt) return href;
  const raw = txt.trim();
  // a label that reads as a site (www., a bare domain) is held to its host (verify round 3: `[paypal.com](https://evil…)`
  // read "paypal.com" — the promise is that a link never says it goes somewhere it does not)
  const shown = safeHref(/^www\./i.test(raw) || SITE_LABEL_RE.test(raw) ? `https://${raw}` : raw);
  if (!shown || !/^https?:/i.test(shown)) return txt;
  try { if (new URL(shown).hostname.toLowerCase() !== new URL(href).hostname.toLowerCase()) return href; } catch { return href; }
  return txt;
}

/**
 * Inline runs of ONE string. `opts.ordinals` = the message's own mentions
 * (positional: `@_user_1` is ordinals[0]; an ordinal with nothing behind it
 * is left VERBATIM — channel-record rule 2); `opts.mentionNames` = mentions
 * whose `@name` is already resolved in the text (a stored record).
 */
function inlineRuns(text, opts = {}) {
  const s = typeof text === 'string' ? text : String(text == null ? '' : text);
  const out = [];
  const pushT = (x) => { if (!x) return; const last = out[out.length - 1]; if (last && last.k === 't') last.text += x; else out.push({ k: 't', text: x }); };
  if (!s) return out;
  // the call's own compiled regex (`inlineCtx` / `mkCtx`), else compiled here (a lone call: a card line, a suite)
  const shared = opts && opts.inlineRe instanceof RegExp && Array.isArray(opts.inlineNames);
  const names = shared ? opts.inlineNames : namesOf(opts);
  const re = shared ? opts.inlineRe : inlineRe(names);
  re.lastIndex = 0;   // a shared /g regex: every call starts at the start
  const ordinals = Array.isArray(opts.ordinals) ? opts.ordinals : [];
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    pushT(s.slice(last, m.index));
    let consumed = m[0].length;
    if (m[1] !== undefined) {
      // markdown link — the WHOLE literal stays text when the target is not a safe one
      const href = safeHref(/^www\./i.test(m[2] || '') ? `https://${m[2]}` : (m[2] || ''));
      if (href) out.push({ k: 'a', href, text: linkText({ href, text: (m[1] || '').trim() || m[2] }) });
      else pushT(m[0]);
    } else if (m[3] !== undefined) {
      const href = safeHref(m[3]);
      if (href) out.push({ k: 'a', href, text: m[3] }); else pushT(m[0]);
    } else if (m[4] !== undefined) {
      const id = m[4], nm = (m[5] || '').trim();
      out.push({ k: 'at', id: id === 'all' ? 'all' : id, name: nm || (id === 'all' ? 'all' : id) });
    } else if (m[6] !== undefined) {
      if (m[6] === 'all') out.push({ k: 'at', id: 'all', name: 'all' });
      else {
        const x = ordinals[Number(m[6].slice(5)) - 1];
        if (x && x.name) out.push({ k: 'at', id: String(x.id || ''), name: String(x.name) }); else pushT(m[0]);
      }
    } else if (m[7] !== undefined) {
      const u = trimUrl(m[7]);
      consumed = u.length;
      const href = safeHref(/^www\./i.test(u) ? `https://${u}` : u);
      if (href && u.length > 4 && !/^www\.?$/i.test(u)) out.push({ k: 'a', href, text: u }); else pushT(u);
    } else if (m[8] !== undefined) {
      const u = trimUrl(m[8]);
      consumed = u.length;
      const href = safeHref(u);
      if (href) out.push({ k: 'a', href, text: u.slice(7) }); else pushT(u);
    } else if (m[9] !== undefined) {
      const href = safeHref(`mailto:${m[9]}`);
      if (href) out.push({ k: 'a', href, text: m[9] }); else pushT(m[9]);
    } else if (m[10] !== undefined) out.push({ k: 'code', text: m[10] });
    else if (m[11] !== undefined) out.push({ k: 'b', text: m[11] });
    else if (m[12] !== undefined) {
      const hit = names.find((x) => x.name === m[12]);
      out.push({ k: 'at', id: hit ? hit.id : '', name: m[12] });
    } else pushT(m[0]);
    last = m.index + consumed;
    re.lastIndex = last;
  }
  pushT(s.slice(last));
  return out;
}

// ── lines → blocks (the generic rung) ───────────────────────────────────
const splitLines = (text) => String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
const blank = (l) => !String(l).trim();
const nonBlankCount = (lines) => lines.reduce((n, l) => n + (blank(l) ? 0 : 1), 0);
/** Non-blank lines of `lines` from `from`, counted only up to `cap` (a
 *  signature test must not walk the whole rest of a 64 KiB body per line). */
const nonBlankUpTo = (lines, from, cap) => { let n = 0; for (let i = from; i < lines.length && n <= cap; i++) if (!blank(lines[i])) n++; return n; };
/** A quoted line: "> x" / ">> x" / ">" — never ">_<" (a chat emoticon);
 *  the mail rung also takes ">x" (old clients quote without the space). */
const QUOTED = /^\s*>(?:\s|>|$)/;
const QUOTED_LOOSE = /^\s*>/;
const isQuoted = (l, ctx) => (ctx && ctx.looseQuotes ? QUOTED_LOOSE : QUOTED).test(l);
const stripQuote = (l) => String(l).replace(/^\s*> ?/, '');
const SIG_DELIM = /^-- ?$/;

/** The per-call state a rung threads through: the attachment placeholders
 *  still unconsumed, the mention tables, which heuristics are on. */
function mkCtx(opts = {}) {
  const ph = new Map();   // token -> [{id, kind}] in record order
  const add = (tok, a) => { if (!tok) return; if (!ph.has(tok)) ph.set(tok, []); ph.get(tok).push({ id: String(a.id), kind: /^image\//i.test(String(a.mime || '')) ? 'img' : 'file' }); };
  for (const a of Array.isArray(opts.attachments) ? opts.attachments : []) {
    if (!a || !a.id) continue;
    if (a.placeholder) add(String(a.placeholder), a);
    else if (opts.legacyPlaceholders) {
      // a record stored before attachments declared their token (R3): the
      // adapter names its tokens per mime family
      const mime = String(a.mime || '');
      const tok = /^image\//i.test(mime) ? opts.legacyPlaceholders.image : /^video\//i.test(mime) ? opts.legacyPlaceholders.video : null;
      if (tok) add(tok, a);
    }
  }
  return { ph, ...inlineCtx(opts), quotes: opts.quotes !== false, signature: opts.signature !== false, looseQuotes: opts.looseQuotes === true };
}

/** ONE paragraph — split around any placeholder token that still has its
 *  attachment, so "[image]" IS the picture (never the words). */
function pushPara(out, s, ctx) {
  const toks = [...ctx.ph.keys()].filter((k) => ctx.ph.get(k).length && s.includes(k));
  if (!toks.length) { const runs = inlineRuns(s, ctx); if (runs.length) out.push({ k: 'p', runs }); return; }
  const re = new RegExp(toks.map(escRe).join('|'), 'g');
  let last = 0, m;
  const text = (x) => { const t = x.replace(/^\n+|\n+$/g, ''); if (t.trim()) { const runs = inlineRuns(t, ctx); if (runs.length) out.push({ k: 'p', runs }); } };
  while ((m = re.exec(s))) {
    const q = ctx.ph.get(m[0]);
    if (!q || !q.length) continue;   // no attachment left behind this token: the words stay
    text(s.slice(last, m.index));
    const a = q.shift();
    out.push({ k: a.kind, attachmentId: a.id });
    last = m.index + m[0].length;
  }
  text(s.slice(last));
}

function linesToBlocks(lines, ctx, depth) {
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { pushPara(out, para.join('\n'), ctx); para = []; } };
  // THE FENCE WALK IS ONE WALK (verify round 4, 2026-09-27): an opener with no closer walked to the end of the
  // text, fell through to a paragraph line, and the NEXT opener walked to the end again — 13 000 lines of
  // "```x" (an info string is an opener, never a closer) cost 0.9 s per record, quadratic, at ingest, at every
  // read of a record stored before this layer and in every client. A walk that found no closer proves there is
  // none after it: every later opener is a plain line.
  let noCloserFrom = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = i < noCloserFrom ? /^\s*```\s*([A-Za-z0-9_+-]{0,30})\s*$/.exec(line) : null;
    if (fence) {
      let j = i + 1;
      while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) j++;
      if (j < lines.length) {
        flush();
        const o = { k: 'code', text: lines.slice(i + 1, j).join('\n') };
        if (fence[1]) o.lang = fence[1];
        out.push(o);
        i = j;
        continue;
      }
      noCloserFrom = i;
    }
    if (ctx.quotes && isQuoted(line, ctx)) {
      flush();
      let j = i;
      while (j < lines.length && isQuoted(lines[j], ctx)) j++;
      const inner = lines.slice(i, j).map(stripQuote);
      out.push(quoteOf(inner, ctx, depth, null));
      i = j - 1;
      continue;
    }
    if (ctx.signature && SIG_DELIM.test(line)) {
      const n = nonBlankUpTo(lines, i + 1, SIG_MAX_LINES);
      if (n > 0 && n <= SIG_MAX_LINES) {
        flush();
        const rest = lines.slice(i + 1);
        out.push({ k: 'sig', blocks: linesToBlocks(rest, { ...ctx, signature: false }, depth + 1), lines: n });
        break;
      }
    }
    if (blank(line)) { flush(); continue; }
    para.push(line);
  }
  flush();
  return out;
}

/** A quote block of `inner` lines; past the depth bound the rest stays text. */
function quoteOf(inner, ctx, depth, attribution, { forwarded = false, email = false } = {}) {
  const deeper = depth < MAX_DEPTH;
  const sub = deeper ? { ...ctx } : { ...ctx, quotes: false };
  const blocks = email && deeper ? emailLines(inner, sub, depth + 1) : linesToBlocks(inner, sub, depth + 1);
  const o = { k: 'quote', blocks, lines: nonBlankCount(inner) };
  if (attribution) o.attribution = attribution;
  if (forwarded) o.forwarded = true;
  return o;
}

/** A rung's FIRST step: the input bounded to the record's own text bound
 *  (`MAX_TEXT` — the adapters hand the rung the RAW vendor body, and a 1 MiB
 *  mail was walked whole before the record's own 64 KiB cut). A tree of more
 *  text than that is refused by the schema anyway. */
const bounded = (text) => { const s = typeof text === 'string' ? text : String(text == null ? '' : text); return s.length > BLOCK_LIMITS.text ? s.slice(0, BLOCK_LIMITS.text) : s; };
/** A rung NEVER THROWS: a defect in a heuristic (or a vendor shape nobody
 *  imagined) answers the plain paragraph — never a failed ingest page
 *  (Lark's history() maps every item through toRecord with no per-item catch:
 *  one poison message would have parked the whole account). */
function guarded(text, fn) {
  try { return fn(); } catch { return plainOf(text); }
}
/** ONE plain paragraph of the text (the answer of every refusal). */
function plainOf(text) {
  const t = String(text == null ? '' : text).slice(0, BLOCK_LIMITS.text);
  const f = validateBlocks(t ? [{ k: 'p', runs: [{ k: 't', text: t }] }] : []);
  return f.ok ? f.blocks : [];
}
/** A rung's LAST step: the schema's verdict, else ONE plain paragraph. */
function finish(blocks, text) {
  const v = validateBlocks(blocks);
  return v.ok ? v.blocks : plainOf(text);
}

/** THE GENERIC RUNG. */
function textToBlocks(text, opts = {}) {
  const s = bounded(text);
  return guarded(s, () => finish(linesToBlocks(splitLines(s), mkCtx(opts), 1), s));
}

// ── the mail rung ───────────────────────────────────────────────────────
/** A ticket system's banner line (Zendesk, Freshdesk, Jira SD, …). */
const BANNER_RE = /(please\s+)?(reply|write|type(\s+your\s+(reply|response))?|respond)\s+above\s+this\s+line|do\s+not\s+(write|reply|type)\s+below\s+this\s+line|请在此行(以上|上方)回复|請在此行(以上|上方)回覆|この行より上に(返信|記入)/i;
/** A line that is only a rule: `======`, `-----`, `_____`, `*****`, `#####`. */
const RULE_RE = /^\s*(?:[=]{4,}|[-]{4,}|[_]{4,}|[*]{4,}|[#]{4,}|[~]{4,})\s*$/;
/** A one-line mobile signature at the end of a mail. */
const MOBILE_SIG_RE = /^\s*(sent from my \S+( \S+)?|sent from (outlook|mail) for \S+|get outlook for (ios|android)|发自我的\s*\S+|从我的\s*\S+\s*发送|iPhoneから送信)\s*$/i;

const HEADER_KEY = '(From|Sent|Date|To|Cc|Subject|Reply-To|发件人|寄件人|发送时间|日期|收件人|抄送|主题|送信日時|差出人|宛先|件名)';
const HEADER_RE = new RegExp(`^\\s*\\*?${HEADER_KEY}\\s*\\*?\\s*[:：]`, 'i');
const FROM_RE = /^\s*\*?(From|发件人|寄件人|差出人)\s*\*?\s*[:：]/i;

/**
 * THE MAIL QUOTE MARKERS, in the order a line is tested (the design's table —
 * design §25.3). Each names how the quote's ATTRIBUTION is read. A line
 * longer than 400 characters is never a marker.
 */
const EMAIL_QUOTE_RULES = Object.freeze([
  { id: 'en-wrote', re: /^\s*On\s.{3,}\swrote\s*:\s*$/i, two: /^\s*On\s/i, end: /\swrote\s*:\s*$/i, attribution: 'the line' },
  { id: 'zh-wrote', re: /写道\s*[:：]\s*$/, two: /^\s*(在|于|On\s)/, end: /写道\s*[:：]\s*$/, attribution: 'the line' },
  { id: 'ja-wrote', re: /(書きました|書き込みました)\s*[:：]\s*$/, two: /^\s*\d{4}/, end: /(書きました|書き込みました)\s*[:：]\s*$/, attribution: 'the line' },
  { id: 'original', re: /^\s*-{2,}\s*(Original Message|原始邮件|原始郵件|元のメッセージ)\s*-{2,}\s*$/i, attribution: 'the header block after it' },
  { id: 'forwarded', re: /^\s*(-{2,}\s*(Forwarded message|转发的邮件|轉寄的郵件|転送されたメッセージ)\s*-{2,}|Begin forwarded message\s*:)\s*$/i, forwarded: true, attribution: 'the header block after it' },
  { id: 'outlook', header: true, attribution: 'the From / Sent lines of the header block' },
]);

/** The header block starting at `i` (From/Sent/To/Subject…): its lines, where the body starts. */
function headerBlockAt(lines, i) {
  const hdr = [];
  let j = i;
  while (j < lines.length && hdr.length < 10) {
    const l = lines[j];
    if (HEADER_RE.test(l)) { hdr.push(l); j++; continue; }
    // a wrapped header value (Outlook wraps long To: lines) — indented, or no colon at all right after a header
    if (hdr.length && !blank(l) && /^\s+\S/.test(l) && !QUOTED_LOOSE.test(l)) { hdr[hdr.length - 1] += ' ' + l.trim(); j++; continue; }
    break;
  }
  while (j < lines.length && blank(lines[j])) j++;
  return { hdr, bodyFrom: j };
}
const cleanHdr = (l) => String(l).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
function headerSummary(hdr) {
  const pick = (re) => hdr.find((l) => re.test(l));
  const from = pick(FROM_RE);
  const date = pick(/^\s*\*?(Sent|Date|发送时间|日期|送信日時)\s*\*?\s*[:：]/i);
  const parts = [from, date].filter(Boolean).map(cleanHdr);
  return (parts.length ? parts : hdr.slice(0, 2).map(cleanHdr)).join(' · ').slice(0, 400);
}

/** Where the quoted history starts, or null: `{start, bodyFrom, attribution, forwarded, rule}`. */
function findQuoteStart(lines) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (blank(l) || l.length > 400) continue;
    for (const r of EMAIL_QUOTE_RULES) {
      if (r.header) {
        if (!FROM_RE.test(l)) continue;
        const { hdr, bodyFrom } = headerBlockAt(lines, i);
        if (hdr.length >= 3 || (hdr.length >= 2 && hdr.slice(1).some((x) => /^\s*\*?(Sent|Date|Subject|发送时间|日期|主题|送信日時|件名)\s*\*?\s*[:：]/i.test(x)))) {
          return { start: i, bodyFrom, attribution: headerSummary(hdr), forwarded: false, rule: r.id };
        }
        continue;
      }
      if (r.re.test(l)) {
        if (r.forwarded || r.id === 'original') {
          let k = i + 1;
          while (k < lines.length && blank(lines[k])) k++;
          const { hdr, bodyFrom } = headerBlockAt(lines, k);
          return { start: i, bodyFrom: hdr.length ? bodyFrom : i + 1, attribution: hdr.length ? headerSummary(hdr) : '', forwarded: !!r.forwarded, rule: r.id };
        }
        return { start: i, bodyFrom: i + 1, attribution: l.replace(/\s+/g, ' ').trim(), forwarded: false, rule: r.id };
      }
      // the same marker WRAPPED over two lines (Gmail breaks "… <\naddr> wrote:")
      if (r.two && r.two.test(l) && i + 1 < lines.length && r.end.test(lines[i + 1]) && !r.end.test(l) && (l.length + lines[i + 1].length) <= 400) {
        return { start: i, bodyFrom: i + 2, attribution: `${l.trim()} ${lines[i + 1].trim()}`.replace(/\s+/g, ' ').replace(/<\s+/g, '<'), forwarded: false, rule: r.id };
      }
    }
  }
  return null;
}

/** The part ABOVE the quoted history: banners, rules, the signature, then the generic rung. */
function headBlocks(lines, ctx, depth) {
  const head = lines.slice();
  while (head.length && (blank(head[head.length - 1]) || RULE_RE.test(head[head.length - 1]))) head.pop();
  // the signature: a `-- ` delimiter with a short tail, else a one-line mobile signature at the end
  let sig = null;
  for (let i = 0; i < head.length; i++) {
    if (SIG_DELIM.test(head[i])) { const n = nonBlankUpTo(head, i + 1, SIG_MAX_LINES); if (n > 0 && n <= SIG_MAX_LINES) { sig = { lines: head.slice(i + 1), n }; head.length = i; } break; }
  }
  if (!sig && head.length && MOBILE_SIG_RE.test(head[head.length - 1])) { sig = { lines: [head.pop()], n: 1 }; }
  const out = [];
  let chunk = [];
  const flush = () => { if (chunk.length) { out.push(...linesToBlocks(chunk, { ...ctx, signature: false }, depth)); chunk = []; } };
  for (const l of head) {
    if (BANNER_RE.test(l) && l.length <= 200) {
      flush();
      const words = l.replace(/[=#\-_*~<>]{2,}/g, ' ').replace(/\s+/g, ' ').trim();
      if (words) out.push({ k: 'banner', text: words });
      continue;
    }
    if (RULE_RE.test(l)) { flush(); continue; }
    chunk.push(l);
  }
  flush();
  if (sig) out.push({ k: 'sig', blocks: linesToBlocks(sig.lines, { ...ctx, signature: false }, depth + 1), lines: sig.n });
  return out;
}

/** A mail's lines → blocks (recursive for the history inside a quote). */
function emailLines(lines, ctx, depth) {
  const q = findQuoteStart(lines);
  if (!q) return headBlocks(lines, ctx, depth);
  const out = headBlocks(lines.slice(0, q.start), ctx, depth);
  let body = lines.slice(q.bodyFrom);
  while (body.length && blank(body[body.length - 1])) body.pop();
  const nb = body.filter((l) => !blank(l));
  if (nb.length && nb.every((l) => QUOTED_LOOSE.test(l))) body = body.map((l) => (blank(l) ? l : stripQuote(l)));
  if (body.length || q.attribution) out.push(quoteOf(body, ctx, depth, q.attribution, { forwarded: q.forwarded, email: true }));
  return out;
}

/** THE MAIL RUNG. `opts.subject` marks a quote FORWARDED when the subject
 *  says so and the marker could not (a bare "From:" block under "Fwd:"). */
function emailToBlocks(text, opts = {}) {
  const s = bounded(text);
  return guarded(s, () => {
    const ctx = mkCtx({ ...opts, looseQuotes: true });
    const blocks = emailLines(splitLines(s), ctx, 1);
    if (/^\s*(fwd?|fw|转发|轉寄|転送)\s*[:：]/i.test(String(opts.subject || '').slice(0, 400))) {
      const q = blocks[blocks.length - 1];
      if (q && q.k === 'quote' && !q.forwarded) q.forwarded = true;
    }
    return finish(blocks, s);
  });
}

/** The longest subject `cleanSubject` reads (a conversation title is bounded to 300, a mail's subject to 400). */
const SUBJECT_MAX = 1024;
/** A reply prefix: Re / RE / Fwd / Fw / AW / WG / SV / VS / 回复 / 答复 / 转发 … with an optional counter. */
const REPLY_PREFIX = /^\s*((?:re|fwd?|fw|aw|wg|sv|vs|tr|回复|答复|回覆|转发|轉寄|転送)\s*(?:\[\d+\]|\(\d+\))?\s*[:：])\s*/i;
/**
 * A mail thread's TITLE for the eye (the window, the row): the ticket banner
 * and `======` rules gone, a chain of reply prefixes collapsed to its first,
 * whitespace folded. '' when nothing is left (the caller keeps the original).
 */
function cleanSubject(subject) {
  // BOUNDED HERE, not only by its callers (verify round 2): the rule patterns below backtrack over a run of
  // `=` / `-` (quadratic — 5.6 s on 64 KiB); a title is ≤ 300 and a subject ≤ 400 today, and the next caller
  // that hands this the raw header must not be the one that finds out
  let x = String(subject == null ? '' : subject).slice(0, SUBJECT_MAX).replace(/[\r\n\t]+/g, ' ');
  x = x.replace(/[=#\-_*~]{3,}\s*(?:please\s+)?(?:reply|write|type(?:\s+your\s+(?:reply|response))?|respond)\s+above\s+this\s+line\s*[=#\-_*~]{3,}/gi, ' ');
  x = x.replace(/(?:please\s+)?(?:reply|write|type(?:\s+your\s+(?:reply|response))?|respond)\s+above\s+this\s+line/gi, ' ');
  x = x.replace(/(?:请在此行(?:以上|上方)回复|請在此行(?:以上|上方)回覆)/g, ' ');
  x = x.replace(/[=#_~]{3,}|-{4,}|\*{3,}/g, ' ');
  x = x.replace(/\s+/g, ' ').trim();
  const m = REPLY_PREFIX.exec(x);
  if (m) {
    let rest = x.slice(m[0].length);
    for (let n; (n = REPLY_PREFIX.exec(rest));) rest = rest.slice(n[0].length);
    const pre = m[1].replace(/\s+/g, '');
    x = rest ? (/：$/.test(pre) ? `${pre}${rest}` : `${pre} ${rest}`) : pre;
  }
  return x.trim();
}

// ── Lark ────────────────────────────────────────────────────────────────
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
function larkPostBlocks(c, mentions, { names = null } = {}) {
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
          const t = String(el.text || '');
          const st = Array.isArray(el.style) ? el.style : [];
          if (st.includes('bold') && t.trim()) runs.push({ k: 'b', text: t });
          else for (const r of inlineRuns(t, ictx)) { if (r.k === 't') text(r.text); else runs.push(r); }
          break;
        }
        case 'md': for (const r of inlineRuns(String(el.text || ''), ictx)) { if (r.k === 't') text(r.text); else runs.push(r); } break;
        case 'a': {
          const href = safeHref(String(el.href || ''));
          const label = String(el.text || '');
          if (href) runs.push({ k: 'a', href, text: linkText({ href, text: label || href }) });
          else text(label ? `${label}${el.href ? ` (${el.href})` : ''}` : String(el.href || ''));
          break;
        }
        case 'at': {
          const id = String(el.user_id || el.open_id || '').slice(0, 256);
          // the NAME the message's own mentions / the chat's roster give this id
          // wins over the element's `user_name` (the sender's claim — a post
          // could chip "@Admin" over any id); the claim is only the fallback
          const nm = (id === 'all' ? 'all' : nameOf(id)) || String(el.user_name || '').slice(0, 200) || id;
          runs.push({ k: 'at', id, name: nm });
          break;
        }
        case 'img': if (el.image_key) { flush(); out.push({ k: 'img', attachmentId: String(el.image_key) }); } break;
        case 'media': if (el.file_key) { flush(); out.push({ k: 'file', attachmentId: String(el.file_key) }); } break;
        case 'emotion': text(`[${String(el.emoji_type || 'emoji').slice(0, 40)}]`); break;
        case 'code_block': { flush(); const o = { k: 'code', text: String(el.text || '') }; if (el.language) o.lang = String(el.language).slice(0, 30); out.push(o); break; }
        case 'hr': flush(); break;
        default: if (el.text) text(String(el.text));
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
  switch (type) {
    case 'text': return textToBlocks(bounded(String((c && c.text) || '')), { ordinals: mentions });
    case 'post': return finish(larkPostBlocks(c, mentions, opts), fallback);
    case 'image': return finish(c && c.image_key ? [{ k: 'img', attachmentId: String(c.image_key) }] : [{ k: 'sys', what: 'unknown', text: fallback }], fallback);
    case 'file': case 'folder': case 'media': case 'audio':
      return finish(c && c.file_key ? [{ k: 'file', attachmentId: String(c.file_key) }] : [{ k: 'sys', what: 'unknown', text: fallback }], fallback);
    case 'interactive': {
      const title = String((c && (c.title || (c.header && c.header.title && c.header.title.content))) || '').trim();
      const lines = cardLines(c && c.elements);
      if (!title && !lines.length) return finish([{ k: 'sys', what: 'card', text: fallback || '[card]' }], fallback);
      return finish([{ k: 'card', title, lines }], fallback);
    }
    case 'system': return finish([{ k: 'sys', what: 'system', text: larkSystemSentence(c, fallback) || fallback }], fallback);
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
    case 'text': case 'post': case '':
      return textToBlocks(text, { attachments: atts, legacyPlaceholders: legacy, mentionNames: r.mentions });
    case 'image': return finish(atts.length ? atts.map((a) => ({ k: 'img', attachmentId: String(a.id) })) : [{ k: 'sys', what: 'unknown', text }], text);
    case 'file': case 'folder': case 'media': case 'audio':
      return finish(atts.length ? atts.map((a) => ({ k: /^image\//i.test(String(a.mime || '')) ? 'img' : 'file', attachmentId: String(a.id) })) : [{ k: 'sys', what: 'unknown', text }], text);
    case 'interactive': {
      const title = text.replace(/^\[card\]\s*/, '').trim();
      return finish(title && title !== '[card]' ? [{ k: 'card', title, lines: [] }] : [{ k: 'sys', what: 'card', text }], text);
    }
    default: return finish([{ k: 'sys', what: LARK_SYS[type] || 'unknown', text }], text);
  }
}

// ── reading a tree ──────────────────────────────────────────────────────
/** The message's words for a one-line preview (a list row): the paragraphs,
 *  cards and system lines — never a banner, the quoted history or a
 *  signature. '' when the tree holds nothing to say (a picture alone). */
function previewOf(blocks, max = 200) {
  const parts = [];
  const runText = (r) => (r.k === 'at' ? `@${r.name}` : r.k === 'a' ? linkText(r) : r.text || '');
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b) continue;
    if (b.k === 'p') parts.push((b.runs || []).map(runText).join(''));
    else if (b.k === 'card') parts.push([b.title, ...(b.lines || [])].filter(Boolean).join(' '));
    else if (b.k === 'sys' || b.k === 'code') parts.push(b.text || '');
    if (parts.join(' ').length > max) break;
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Every string a tree carries (the frame census walks this). */
function blockStrings(blocks, out = []) {
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b) continue;
    for (const k of ['text', 'attribution', 'title', 'attachmentId', 'lang']) if (typeof b[k] === 'string') out.push(b[k]);
    for (const l of Array.isArray(b.lines) ? b.lines : []) if (typeof l === 'string') out.push(l);
    for (const r of Array.isArray(b.runs) ? b.runs : []) for (const k of ['text', 'href', 'id', 'name']) if (typeof r[k] === 'string') out.push(r[k]);
    if (Array.isArray(b.blocks)) blockStrings(b.blocks, out);
  }
  return out;
}

module.exports = {
  FOLD_MIN_LINES, SIG_MAX_LINES, SUBJECT_MAX, EMAIL_QUOTE_RULES, LARK_SYS, LARK_IMAGE_TOKEN, LARK_VIDEO_TOKEN,
  // the schema, re-exported (it lives in channel-record.js)
  BLOCK_KINDS, RUN_KINDS, SYS_WHATS, BLOCK_LIMITS, LINK_SCHEMES,
  validateBlocks, safeHref, linkText, inlineRuns,
  textToBlocks, emailToBlocks, cleanSubject, findQuoteStart,
  larkToBlocks, larkStoredBlocks, larkPostBody, larkSystemSentence, cardLines,
  previewOf, blockStrings,
};
