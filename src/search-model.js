'use strict';
// GLOBAL SEARCH — THE PURE RULES (lane global-search, .221). Imports nothing:
// the index worker (src/search-index-worker.js), the owner (src/server/
// search-index.js) and the fixture tables of scripts/test-global-search.mjs
// share every rule here.
//
// THE TOKEN RULE (measured on the owner's box, 2026-10-05): FTS5's trigram
// tokenizer cannot answer a 2-character Chinese query ("限额" → 0 rows) and its
// index was 862 % of the text. unicode61 + OUR OWN CJK bigrams answers it with
// an index of 381 %: a run of CJK characters (Han, kana, Hangul) becomes its
// overlapping bigrams ("限额刷新" → "限额 额刷 刷新"), a run of ONE is kept as
// itself, everything else is left to unicode61 (Latin words, digits,
// punctuation). The SAME segment() runs at index time and at query time.

const MAX_ROW_BYTES = 64 * 1024;          // one message's indexed text
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024; // one file's bytes read for the index
const SNIPPET_SIDE = 60;                  // chars kept each side of the first hit
const HITS_SHOWN = 3;                     // per conversation, before "+N more"

// Han (+ ext A, compatibility, ext B–F via surrogate pairs), Hiragana,
// Katakana (+ phonetic ext, half-width), Hangul syllables + jamo.
const CJK = /[㐀-䶿一-鿿豈-﫿぀-ゟ゠-ヿㇰ-ㇿｦ-ﾟ가-힯ᄀ-ᇿ㄰-㆏]|[\uD840-\uD87E][\uDC00-\uDFFF]/;
const CJK_RUN = new RegExp(`(?:${CJK.source})+`, 'g');
const isCjk = (s) => CJK.test(s);
const chars = (s) => Array.from(s); // code points (a surrogate pair is one character)

/** CJK runs → their bigrams, space-separated; the rest of the text untouched. */
function segment(text) {
  return String(text == null ? '' : text).replace(CJK_RUN, (run) => {
    const c = chars(run);
    if (c.length === 1) return ' ' + run + ' ';
    const out = [];
    for (let i = 0; i + 1 < c.length; i++) out.push(c[i] + c[i + 1]);
    return ' ' + out.join(' ') + ' ';
  });
}

/** The user's query → its terms: a quoted part is ONE phrase term, every other
 *  whitespace-separated word one term. Returns [{text, quoted}]. */
function termsOf(q) {
  const s = String(q == null ? '' : q).slice(0, 500);
  const out = [];
  const re = /"([^"]*)"?|(\S+)/g;
  let m;
  while ((m = re.exec(s))) {
    const quoted = m[1] !== undefined;
    const text = (quoted ? m[1] : m[2]).trim();
    if (text && /[\p{L}\p{N}]/u.test(text)) out.push({ text, quoted });
  }
  return out.slice(0, 16);
}

/** One term → the words unicode61 will see (lowercased, punctuation dropped). */
const wordsOf = (text) => segment(text).toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);

/** The FTS5 MATCH string: each term a "phrase" over its own segmentation,
 *  AND between terms; the LAST unquoted term gets a prefix `*` when it is a
 *  Latin word of ≥ 2 characters or a single CJK character. Every phrase is
 *  rebuilt from letters / digits only, so no operator, quote, column filter or
 *  paren of the user's ever reaches the FTS5 parser. '' = nothing to search. */
function queryFor(q) {
  const terms = termsOf(q);
  const parts = [];
  terms.forEach((t, i) => {
    const words = wordsOf(t.text);
    if (!words.length) return;
    let p = '"' + words.join(' ') + '"';
    const last = i === terms.length - 1;
    if (last && !t.quoted) {
      const c = chars(t.text);
      if ((!isCjk(t.text) && words.length === 1 && chars(words[0]).length >= 2) || (isCjk(t.text) && c.length === 1)) p += ' *';
    }
    parts.push(p);
  });
  return parts.join(' AND ');
}

/** The strings a snippet highlights: each term as typed (lowercased). */
const highlightTerms = (q) => termsOf(q).map((t) => t.text.toLowerCase()).filter(Boolean);

/** A UTF-8 cut at `max` bytes that never splits a character. */
function capUtf8(s, max) {
  let bytes = 0, i = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + n > max) return s.slice(0, i);
    bytes += n; i += ch.length;
  }
  return s;
}

/** A NORMALIZED message (any harness's normalizer card) → its searchable text:
 *  role user | assistant, `text` blocks only — tool calls, tool results and
 *  thinking are never indexed. '' = not indexed. */
function textOf(msg) {
  if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) return '';
  const blocks = Array.isArray(msg.content) ? msg.content : typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : [];
  const text = blocks.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n').trim();
  return text ? capUtf8(text, MAX_ROW_BYTES) : '';
}

/** The kind a file is indexed as, by its name — null = not indexed (and why). */
const TEXT_EXT = /\.(md|markdown|txt|text|log|csv|tsv|json|jsonl|ya?ml|toml|ini|cfg|conf|xml|svg|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cc|cpp|hpp|cs|swift|php|sh|bash|zsh|sql|css|scss|less|vue|svelte|lua|r|pl|tex|rst|org|env)$/i;
function kindOf(p) {
  const s = String(p || '').toLowerCase();
  if (/\.html?$/.test(s)) return { kind: 'html' };
  if (/\.docx$/.test(s)) return { kind: 'docx' };
  if (TEXT_EXT.test(s)) return { kind: 'text' };
  return { kind: null, skipped: 'not a text, html or docx file' };
}

/** A bounded, linear HTML → text (one look per `<`; script / style dropped). */
function htmlText(html) {
  const s = String(html || '');
  let out = '', i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { out += s.slice(i); break; }
    out += s.slice(i, lt);
    if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); i = e < 0 ? s.length : e + 3; out += ' '; continue; }
    const gt = s.indexOf('>', lt + 1);
    if (gt < 0) { out += s.slice(lt); break; }
    const name = (/^([A-Za-z][A-Za-z0-9-]*)/.exec(s.slice(lt + 1, gt)) || [])[1];
    if (name && /^(script|style|template|noscript)$/i.test(name)) {
      const close = s.toLowerCase().indexOf('</' + name.toLowerCase(), gt + 1);
      const end = close < 0 ? -1 : s.indexOf('>', close);
      i = end < 0 ? s.length : end + 1; out += ' '; continue;
    }
    i = gt + 1; out += ' ';
  }
  return out.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ');
}

/** An artifact's indexed text: {path, bytes(Buffer|Uint8Array|string), text?}
 *  → {kind, text} | {kind, skipped}. A docx arrives already converted (`text`,
 *  the worker's mammoth.extractRawText). Bytes past MAX_ARTIFACT_BYTES are cut. */
function artifactTextOf({ path, bytes, text } = {}) {
  const k = kindOf(path);
  if (!k.kind) return k;
  if (k.kind === 'docx') return typeof text === 'string' ? { kind: 'docx', text: capUtf8(text, MAX_ARTIFACT_BYTES) } : { kind: 'docx', skipped: 'the docx could not be read' };
  let s = typeof bytes === 'string' ? bytes : bytes ? new TextDecoder('utf-8').decode(bytes.length > MAX_ARTIFACT_BYTES ? bytes.subarray(0, MAX_ARTIFACT_BYTES) : bytes) : '';
  if (/\u0000/.test(s.slice(0, 8192))) return { kind: k.kind, skipped: 'binary content' };
  if (k.kind === 'html') s = htmlText(s);
  return { kind: k.kind, text: capUtf8(s, MAX_ARTIFACT_BYTES) };
}

/** ±SNIPPET_SIDE characters around the first hit of any term; `ranges` are
 *  [start, end) offsets INTO `text` (the client builds <mark> from them with
 *  textContent — never HTML). Whitespace runs read as one space. */
function snippetOf(body, terms) {
  const src = String(body || '').replace(/\s+/g, ' ');
  const low = src.toLowerCase();
  const ts = (terms || []).filter(Boolean);
  let first = -1, firstLen = 0;
  for (const t of ts) { const i = low.indexOf(t); if (i >= 0 && (first < 0 || i < first)) { first = i; firstLen = t.length; } }
  const at = first < 0 ? 0 : first;
  let a = Math.max(0, at - SNIPPET_SIDE), b = Math.min(src.length, at + firstLen + SNIPPET_SIDE);
  if (a > 0 && /[\uDC00-\uDFFF]/.test(src[a])) a--;
  if (b < src.length && /[\uDC00-\uDFFF]/.test(src[b])) b++;
  const text = src.slice(a, b);
  const tl = text.toLowerCase();
  const ranges = [];
  for (const t of ts) { let i = tl.indexOf(t); while (i >= 0) { ranges.push([i, i + t.length]); i = tl.indexOf(t, i + t.length); } }
  ranges.sort((x, y) => x[0] - y[0] || y[1] - x[1]);
  const merged = [];
  for (const r of ranges) { const l = merged[merged.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else merged.push(r.slice()); }
  return { text, ranges: merged, head: a > 0, tail: b < src.length };
}

/** Rows (each {kind, sid|sessionId, host, score (bm25: lower = better), ts|mtime})
 *  → conversations: [{key, sid, host, best, hits, more}] — groups by their best
 *  row's score, a tie by recency; ≤ HITS_SHOWN hits shown each, the rest `more`. */
function rankRows(rows, { shown = HITS_SHOWN } = {}) {
  const groups = new Map();
  const tsOf = (r) => Number(r.ts || r.mtime || 0);
  const sorted = [...(rows || [])].sort((x, y) => (x.score - y.score) || (tsOf(y) - tsOf(x)));
  for (const r of sorted) {
    const sid = r.kind === 'artifact' ? r.sessionId : r.sid;
    const key = (r.host || '') + '|' + (sid || '');
    let g = groups.get(key);
    if (!g) { g = { key, sid: sid || null, host: r.host || '', best: r.score, bestTs: tsOf(r), hits: [], all: 0 }; groups.set(key, g); }
    g.all++;
    if (g.hits.length < shown) g.hits.push(r);
  }
  return [...groups.values()].map((g) => ({ key: g.key, sid: g.sid, host: g.host, best: g.best, hits: g.hits, more: g.all - g.hits.length }));
}

module.exports = { MAX_ROW_BYTES, MAX_ARTIFACT_BYTES, SNIPPET_SIDE, HITS_SHOWN, segment, termsOf, queryFor, highlightTerms, capUtf8, textOf, kindOf, htmlText, artifactTextOf, snippetOf, rankRows, isCjk };
