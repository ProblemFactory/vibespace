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
// contents, and every other tag STRIPPED to its text — never printed.
//
// THE WALL (`sealTags`): a tag-shaped `<…>` that is still left in a text run
// after the reader — a lone `<country>` placeholder a person typed, a
// `Vec<String>` — becomes `‹country›` (its words kept, its angle brackets the
// typographic ones), so NO `<…>` literal survives into a Lark block or
// `rec.text` (inline code and code blocks are code: shown as written).
// `TAG_LIKE_RE` is the census's own predicate (test-channel-record ⑦).
/** A `<…>` that reads as a tag: `<`, an optional `/`, a letter, no angle bracket, `>`. */
const TAG_LIKE_RE = /<\/?[A-Za-z][^<>]*>/;
const TAG_LIKE_G = /<\/?[A-Za-z][^<>]*>/g;
/** Does this string carry a tag-shaped `<…>`? */
function carriesTag(s) { return typeof s === 'string' && s.indexOf('<') >= 0 && TAG_LIKE_RE.test(s); }
/** The wall: every tag-shaped `<…>` left in a string becomes `‹…›`. */
function quoteTags(s) {
  let x = String(s == null ? '' : s);
  for (let i = 0; i < 4 && carriesTag(x); i++) x = x.replace(TAG_LIKE_G, (m) => '‹' + m.slice(1, -1) + '›');
  return x;
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

/** How the reader treats each tag it KNOWS. Everything else is unknown: stripped to its text. */
const MK_BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption', 'address', 'center', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'caption', 'dl', 'dt', 'dd', 'ul', 'ol', 'form', 'fieldset', 'details', 'summary', 'html', 'body']);
const MK_HEAD = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const MK_BOLD = new Set(['b', 'strong']);
const MK_ITALIC = new Set(['i', 'em', 'cite', 'var', 'dfn']);
const MK_CELL = new Set(['td', 'th']);
/** Dropped WITH their contents (a script's words are not the message). */
const MK_DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'textarea', 'title', 'head', 'svg', 'math', 'select', 'option', 'applet', 'noembed', 'noframes', 'xmp', 'video', 'audio', 'canvas']);
/** Void / inline tags the reader knows and passes through (their text kept). */
const MK_INLINE = new Set(['span', 'font', 'u', 'ins', 's', 'del', 'strike', 'small', 'big', 'sub', 'sup', 'mark', 'abbr', 'q', 'tt', 'kbd', 'samp', 'time', 'label', 'text_tag', 'link', 'bdi', 'bdo', 'wbr', 'nobr', 'button', 'legend', 'meta', 'base', 'input', 'img', 'source', 'track', 'param', 'col', 'colgroup', 'area', 'map', 'picture', 'frame', 'frameset', 'hr', 'br', 'li', 'blockquote', 'pre', 'code', 'a', 'at', 'person']);
const knownTag = (n) => MK_BLOCK.has(n) || MK_HEAD.has(n) || MK_BOLD.has(n) || MK_ITALIC.has(n) || MK_CELL.has(n) || MK_DROP.has(n) || MK_INLINE.has(n);
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
  // an UNKNOWN tag is markup when it is paired, carries attributes or closes itself — else it is a lone
  // `<word>` a person typed (a placeholder, a generic): kept as TEXT (the wall words it ‹word›)
  const opened = new Set(), closed = new Set();
  for (const k of toks) { if (k.t === 'open') opened.add(k.name); else if (k.t === 'close') closed.add(k.name); }
  for (const k of toks) {
    if (k.t !== 'open' && k.t !== 'close') continue;
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
    if (knownTag(k.name)) continue;
    const paired = opened.has(k.name) && closed.has(k.name);
    if (!paired && !k.attrs.trim()) { k.t = 'text'; k.v = k.raw; k.lone = true; }
  }
  return toks;
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
    // img / meta / input / font / span / every unknown paired tag: stripped to its text (nothing)
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
/** A tree's words, one paragraph per line (the plain text of a rich body). */
function blocksToPlain(blocks, prefix = '') {
  const lines = [];
  const runText = (r) => (r.k === 'at' ? `@${r.name}` : r.k === 'a' ? (r.text && r.text !== r.href ? `${r.text} (${r.href})` : r.href) : r.k === 'code' ? `\`${r.text}\`` : r.text || '');
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b) continue;
    switch (b.k) {
      case 'p': lines.push(...(b.runs || []).map(runText).join('').split('\n').map((l) => prefix + l)); break;
      case 'quote': case 'sig': lines.push(blocksToPlain(b.blocks, prefix + '> ')); break;
      case 'code': lines.push(...String(b.text || '').split('\n').map((l) => prefix + l)); break;
      case 'banner': case 'sys': lines.push(prefix + (b.text || '')); break;
      case 'card': lines.push(...[b.title, ...(b.lines || [])].filter(Boolean).map((l) => prefix + l)); if (Array.isArray(b.blocks)) lines.push(blocksToPlain(b.blocks, prefix)); break;
      case 'hr': lines.push(prefix + '—'); break;
      case 'img': lines.push(prefix + LARK_IMAGE_TOKEN); break;
      case 'file': lines.push(prefix + '[file]'); break;
      default: break;
    }
  }
  return lines.filter((l) => l !== undefined).join('\n');
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
    else if (b.k === 'card') parts.push([b.title, ...(b.lines || []), Array.isArray(b.blocks) ? previewOf(b.blocks, max) : ''].filter(Boolean).join(' '));
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
  // lane channel-rich (D1): THE LARK MARKUP READER + the wall
  TAG_LIKE_RE, carriesTag, quoteTags, sealTags, decodeEntities, markupTokens, markupRead, larkMdBlocks, larkPlainText, blocksToPlain, larkCardBlocks, cardTitleOf, markupPlainLine,
  previewOf, blockStrings,
};
