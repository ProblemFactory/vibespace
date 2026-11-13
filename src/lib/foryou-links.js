// THE FOR-YOU LINKS (lane foryou-attachments, owner 2026-10-09 "经常 agent 会让我 review 一个产物/文件/网页，我却没法轻易从
// inbox 里打开") — PURE (imports ../path-linkify.js + the cut rule): what an item's words point at, and what an ask's attachment
// opens. The words stay EXACTLY as written; a link is a span AROUND the words, every segment escaped (linkedHtml) — the
// item is agent-written and syncs to every client, so raw text is never markup. ONE grammar with the chat: where a path
// ends = pathRe / cleanPath, a relative reference = looksRelPath (the chat's code-span rule), where it may live =
// relCandidates (the chat's click) — this file adds only the prose spans the chat leaves to markdown (http(s) / mailto /
// a mail address / a /p/<id> page) and one prose rule: a relative path with a slash and a file tail (`docs/plan.md`,
// `out/`) links outside a code span too; a bare filename links only inside one (the chat's rule).
// Resolution is for OPENING only: a target is {open, …} the client probes on ITS host (the asker's) at click time.
// A MASKED LINK (lane mask-value-shape, the owner 2026-11-07): a URL a belt masked INSIDE (`?token=«redacted»`, a
// `[vault:<entry>]`) points at a mangled target — it is WORDS with a note (maskedLinkNote), never a link that looks whole.
// The marks are the belt's own (src/secret-shapes.js maskedLink); every surface that draws an agent's words asks here.
import { pathRe, cleanPath, looksRelPath, relCandidates } from '../path-linkify.js';
import { CJK_PUNCT, SEG, isTrailing } from '../path-linkify.js'; // lane mask-value-shape r4: THE token grammar's classes (one definition — the path rule's own)
import { maskedLink } from '../secret-shapes.js'; // PURE: THE belt's marks — «redacted» / [vault:<entry>], raw or in an href
import { cutRuns } from '../inbox-reply-text.js'; // PURE: the tokens a cut went through (lane artifacts-by-intent r7)

export const ASK_ARTIFACT_KINDS = Object.freeze(['file', 'design', 'page']);
// r5 (M1): THE full-width pairs a URL token may hold BALANCED (a CJK page title: `…/wiki/東京（都）`, `…/「東京」`) — as cleanPath's ASCII
// rule never could (it sheds every trailing `)`); one level, the pair's content the token's own class. An UNPAIRED one is CJK punctuation
// and ends the token (r4: `…/x，然后点` stops at the comma). Every road's URL run reads these (chat-renderers URL_RUN_RE too)
export const FW_PAIRS = Object.freeze(['（）', '「」', '『』', '【】', '〈〉', '《》']);
/** A URL run's alternatives for the balanced pairs, their content `inner` (a regex source: the run's own character class). */
export function fwGroupsSrc(inner) { return FW_PAIRS.map((p) => p[0] + '(?:' + inner + ')*' + p[1]).join('|'); }
const FW_OPEN_AT = new Map(FW_PAIRS.map((p, i) => [p.charCodeAt(0), i])), FW_CLOSE_AT = new Map(FW_PAIRS.map((p, i) => [p.charCodeAt(1), i]));
const FW_OPEN_RE = new RegExp('[' + FW_PAIRS.map((p) => p[0]).join('') + ']');
/** r5 (M1): where a token's backward tail walk must stop — just past its LAST full-width closer whose opener stands before it (a balanced
 *  pair is part of the token; an unpaired closer is punctuation, shed). One forward read, and only when the token holds an opener. */
export function fwFloor(tok) {
  if (!FW_OPEN_RE.test(tok)) return 0;
  const open = new Array(FW_PAIRS.length).fill(0); let floor = 0;
  for (let i = 0; i < tok.length; i++) {
    const c = tok.charCodeAt(i), o = FW_OPEN_AT.get(c);
    if (o !== undefined) { open[o]++; continue; }
    const k = FW_CLOSE_AT.get(c); if (k !== undefined && open[k] > 0) { open[k]--; floor = i + 1; }
  }
  return floor;
}

// r4 (M3): a URL TOKEN ends at a CJK punctuation mark too — the token boundaries come FIRST, on every road (a clean URL then a masked one in
// one blank-free CJK run are two tokens, each judged on its own). r5 (M1): EXCEPT a BALANCED full-width pair inside it (FW_PAIRS)
// r7 (M8): THE URL token's STOPS — ONE constant every road reads (For-you's URL_RE here; the chat's URL_RUN_RE and its markdown cut,
// src/lib/chat-renderers.js). A mark ends a URL token in the MIDDLE only when it is CJK SENTENCE punctuation (、。，：；！？ — the r5
// disclosure) or an UNPAIRED full-width bracket of FW_PAIRS (a balanced pair rides inside: fwGroupsSrc). Every other member of
// path-linkify's CJK_PUNCT occurs INSIDE real URLs — the dashes – —, the curly quotes ‘’‚‛“”„‟, the ellipsis …, the wave dash 〜,
// ｛｝［］〔〕 … (`…/wiki/Mexican–American_War`) — and is at most SHED FROM THE END of a token (path-linkify's TRAILING: cleanPath's own
// rule), never a cut inside it. path-linkify's CJK_PUNCT keeps its own meaning for PATHS (SEG, TRAILING): a path still ends at any of them.
export const URL_STOP = '\\u3001\\u3002\\uFF0C\\uFF1A\\uFF1B\\uFF01\\uFF1F' + FW_PAIRS.join('');   // a regex character-class body
const URL_CH = '[^\\s<>"\'`' + URL_STOP + ']';
// r8 (a): a LETTER never leaves a URL — path-linkify's CJK_PUNCT ranges also hold letters, numbers and marks (々 U+3005, 〆 U+3006, 〇 U+3007,
// 〱–〵, 〻, 〼, the Hangzhou numerals 〡–〩 〸–〺, the combining 〪–〯): `…/wiki/人々`, `…/二〇〇〇` end in one. The shed from a URL token's END
// (tailEnd here; the chat's _urlEnd / _maskedToken / _cjkAutolink) skips them — the base's cleanPath shed them on For-you and the text road
export const URL_LETTER_RE = /[\p{L}\p{N}\p{M}]/u;
const URL_RE = new RegExp('\\b(?:https?:\\/\\/|mailto:)(?:' + URL_CH + '|' + fwGroupsSrc(URL_CH) + ')+', 'g');
const MAIL_RE = /(?<![\w.+-])[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const PAGE_RE = /(?<![="'\w/])\/p\/pg[a-z0-9]{10}(?![A-Za-z0-9_-])/g;
const CODE_RE = /`([^`\n]+)`/g;
const VAULT_RE = /\bvault:\/\/[^\s<>"'`]+/g;   // lane vault-standing-request r2: a vault reference is NEVER a link (the phone linkified «://secrets/secret:7…» out of one) — a span no other hit may start inside
const LEAD = /^[([{"'“‘「『（]+/;
const FILE_TAIL = /\.[A-Za-z0-9]{1,8}$/;
const RANK = { vault: -1, masked: 0, url: 0, mail: 1, page: 2, path: 3 };
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** Prose spans: [{start, end, kind, ref}] — the earliest wins; one starting inside an earlier one is dropped. */
function proseHits(s) {
  const hits = [];
  for (const m of s.matchAll(VAULT_RE)) hits.push({ start: m.index, end: m.index + m[0].length, kind: 'vault', ref: m[0] });
  // r3 (E): a BARE vault mark (`[vault:secrets/db/secret]`, `NAME=[vault:…]`) is words — a span no other hit may start inside (its
  // label holds `/` and may hold a URL); a mark INSIDE a URL / path token is covered by that token's earlier hit
  const marked = MARK_HINT_RE.test(s);
  if (marked) for (const at of bareMarks(s)) hits.push(at);
  for (const m of s.matchAll(URL_RE)) {
    const end = tailEnd(s, m.index, m.index + m[0].length), ref = s.slice(m.index, end); if (ref.length <= 8) continue;
    const mask = marked ? maskedLink(ref) : null;   // r3 (D) / r4 (M3): the hit IS the token — judged on its own
    hits.push(mask ? { start: m.index, end, kind: 'masked', mask } : { start: m.index, end, kind: ref.startsWith('mailto:') ? 'mail' : 'url', ref });
  }
  for (const m of s.matchAll(MAIL_RE)) { const ref = cleanPath(m[0]); hits.push({ start: m.index, end: m.index + ref.length, kind: 'mail', ref: 'mailto:' + ref }); }
  for (const m of s.matchAll(PAGE_RE)) hits.push({ start: m.index, end: m.index + m[0].length, kind: 'page', ref: m[0] });
  let scannedTo = 0;
  for (const m of s.matchAll(pathRe())) {
    const ref = cleanPath(m[1]); if (ref.length < 4) continue;   // r9: cleanPath is the linear walk itself
    // lane mask-value-shape r2 (m4) / r4: a PATH a belt masked inside is words + the note — its token read ONCE (a run starting inside a
    // token already read is that token's)
    const mk = marked && m.index >= scannedTo ? pathToken(s, m.index) : null;
    if (mk) scannedTo = mk.runEnd;
    hits.push(mk && mk.mask ? { start: m.index, end: mk.end, kind: 'masked', mask: mk.mask } : { start: m.index, end: m.index + ref.length, kind: 'path', ref });
  }
  hits.sort((a, b) => a.start - b.start || RANK[a.kind] - RANK[b.kind] || b.end - a.end);
  const out = [];
  for (const h of hits) if (!out.length || h.start >= out[out.length - 1].end) out.push(h);
  return out;
}
// r3 (D) / r4 (M4): THE TOKEN GRAMMAR — a token's run is read FORWARD by one native class run (it ends at a blank, a quote, `<>`, a backtick
// or a CJK punctuation mark; a path's run is path-linkify's own SEG class plus whole `[vault:…]` marks), its tail shed BACKWARD by a
// character walk over path-linkify's TRAILING set (a vault mark's `]` stays) — linear; never cleanPath (`[…]+$`) over a run
const MARK_HINT_RE = /«redacted»|%C2%ABredacted|\[vault:|%5Bvault/i;
const BARE_MARK_RE = /\[vault:[^\]\[\s]{1,440}\]/g;
const CJK_CH_RE = new RegExp('[' + CJK_PUNCT + ']');
// r8 (b) → r9: a path / mail / prose token's end = path-linkify cleanPath, itself the backward walk over THE trailing set (linear, one
// definition — isTrailing); a URL token's end = tailEnd below (the same set + the vault / full-width-pair floors + the letter guard)
const TOKEN_RUN_RE = new RegExp('[^\\s<>"\'`' + CJK_PUNCT + ']*', 'y');
const PATH_RUN_RE = new RegExp('(?:\\[vault:[^\\]\\[\\s<>"\']{1,440}\\]|' + SEG + ')*', 'y');
const isStop = (s, i) => { const c = s.charCodeAt(i); return c <= 32 || c === 34 || c === 39 || c === 60 || c === 62 || c === 96 || CJK_CH_RE.test(s[i]); };
/** The token [start, end)'s end once its trailing punctuation is shed — a backward walk; a vault mark's closing `]` inside it stays. */
function tailEnd(s, start, end) {
  let floor = start;
  const tok = s.slice(start, end), k = tok.lastIndexOf('[vault:');
  if (k >= 0) { const c = tok.indexOf(']', k); if (c >= 0) floor = start + c + 1; }
  floor = Math.max(floor, start + fwFloor(tok));   // r5 (M1): a balanced full-width pair's closer is the token's own
  while (end > floor && isTrailing(s[end - 1]) && !URL_LETTER_RE.test(s[end - 1])) end--;   // r8 (a): a letter (々 〆 〇) stays
  return end;
}
/** r3 (E): the BARE vault marks — no `/` before the mark in its token — as `vault` text spans; one forward pass (linear). */
function bareMarks(s) {
  const out = []; let p = 0, slash = false;
  for (const m of s.matchAll(BARE_MARK_RE)) {
    for (; p < m.index; p++) { if (isStop(s, p)) slash = false; else if (s.charCodeAt(p) === 47) slash = true; }
    if (!slash) out.push({ start: m.index, end: m.index + m[0].length, kind: 'vault', ref: m[0] });
  }
  return out;
}
/** A PATH's token from `at` (SEG characters and whole vault marks): {end, runEnd, mask|null} — read once, linear. */
function pathToken(s, at) {
  PATH_RUN_RE.lastIndex = at; const r = PATH_RUN_RE.exec(s), runEnd = at + (r ? r[0].length : 0);
  const end = tailEnd(s, at, runEnd), tok = s.slice(at, end);
  return { end, runEnd, mask: pathMask(tok) };
}
/** The URL / path TOKEN from `at` when it holds a belt's mark INSIDE a path (a `/` before the mark) → {end, mask}, else null. */
function maskedRun(s, at) {
  TOKEN_RUN_RE.lastIndex = at; const r = TOKEN_RUN_RE.exec(s), end = tailEnd(s, at, at + (r ? r[0].length : 0));
  const mask = pathMask(s.slice(at, end));
  return mask ? { end, mask } : null;
}
/** A gap's relative paths (prose): a token with a slash and a file tail (or a trailing slash) that the chat's rule passes. */
function relHits(s, base) {
  const out = [], marked = MARK_HINT_RE.test(s);
  let at = 0;
  for (const tok of s.split(/(\s+)/)) {
    const lead = (LEAD.exec(tok) || [''])[0];
    const core = cleanPath(tok.slice(lead.length));   // r9: cleanPath is the linear walk itself (a blank-free run of 16 384 dashes before `，` was quadratic)
    const tail = core.replace(/\/+$/, '').split('/').pop();
    const mk = marked && core.includes('/') ? maskedRun(s, at + lead.length) : null;   // lane mask-value-shape r2 (m4): a masked relative path
    if (mk) out.push({ start: base + at + lead.length, end: base + mk.end, kind: 'masked', mask: mk.mask });
    else if (core.includes('/') && !core.startsWith('/') && !core.startsWith('~') && (core.endsWith('/') || FILE_TAIL.test(tail)) && looksRelPath(core, { prose: true })) {
      out.push({ start: base + at + lead.length, end: base + at + lead.length + core.length, kind: 'rel', ref: core });
    }
    at += tok.length;
  }
  return out;
}
function proseSegments(s, segs) {
  const hits = [];
  let last = 0;
  for (const h of proseHits(s)) { hits.push(...relHits(s.slice(last, h.start), last), h); last = h.end; }
  hits.push(...relHits(s.slice(last), last));
  let at = 0;
  for (const h of hits) {
    if (h.start > at) segs.push({ t: 'text', s: s.slice(at, h.start) });
    segs.push(h.kind === 'vault' ? { t: 'text', s: s.slice(h.start, h.end) }
      : h.kind === 'masked' ? { t: 'masked', s: s.slice(h.start, h.end), mask: h.mask }   // words + a note, never a link
        : { t: 'link', s: s.slice(h.start, h.end), kind: h.kind, ref: h.ref });
    at = h.end;
  }
  if (at < s.length) segs.push({ t: 'text', s: s.slice(at) });
}
/** THE SEGMENTER: text → [{t:'text', s} | {t:'link', s, kind: url|mail|page|path|rel, ref} | {t:'masked', s, mask}]; the `s`
 *  of every segment joined IS the text (nothing added, nothing dropped). A `code span` holds a relative path or a bare
 *  filename. A `masked` segment is a URL a belt masked inside (mask = secret-shapes maskedLink's {shape, vault}). */
export function segmentText(text) {
  const src = typeof text === 'string' ? text : '';
  return uncutLinks(src, segmentWords(src));
}
function segmentWords(src) {
  const segs = [];
  let at = 0;
  for (const m of src.matchAll(CODE_RE)) {
    if (m.index > at) proseSegments(src.slice(at, m.index), segs);
    const inner = m[1];
    const before = segs.length;
    segs.push({ t: 'text', s: '`' });
    proseSegments(inner, segs);
    // r5 (m4): a code span holding a belt's mark is never a rel link (`a«redacted».txt`, `x[vault:k].md` — a press would open a file that does not
    // exist); with a `/` before the mark it is a masked path (words + the note), else words — the chat's code-span rule, one grammar
    if (!segs.slice(before + 1).some((x) => x.t === 'link' || x.t === 'masked') && !/^vault:\/\//.test(inner.trim()) && !maskedLink(inner) && looksRelPath(inner.trim())) {
      segs.length = before + 1;
      const lead = inner.length - inner.trimStart().length, core = inner.trim();
      if (lead) segs.push({ t: 'text', s: inner.slice(0, lead) });
      segs.push({ t: 'link', s: core, kind: 'rel', ref: core });
      if (lead + core.length < inner.length) segs.push({ t: 'text', s: inner.slice(lead + core.length) });
    }
    segs.push({ t: 'text', s: '`' });
    at = m.index + m[0].length;
  }
  if (at < src.length) proseSegments(src.slice(at), segs);
  return segs;
}
/** A CUT TOKEN IS NO LINK (lane artifacts-by-intent r7 → r8 — every reader of a cut text drops the WHOLE token the cut went
 *  through): where the store cut the words is cutRuns' (its «…» at a cap); WHICH token it went through is THIS grammar's —
 *  the words segmented again with each cut's mark continued by a digit — every link runs on across one, and a path's
 *  `:line:col` suffix ONLY across one (r9: r8's letter stopped there) — and a link of that text over a cut's place is the token (a URL or a path runs on across '.', '/', '?', '=', ':' — r7 read the page id's word run
 *  and kept «https://docs.example.…» a link to another host); so is a link of the words that runs right up to the mark
 *  («https:/…» is a link only while the mark ends it). A link of the words over such a token is drawn as its words; a
 *  whole link before it (a space, a CJK mark between) stays a link. r10: so is a link ONLY THE CUT MADE — one the continued
 *  words no longer read, with no space between it and the mark: the relative grammar never takes `:line` (path-linkify —
 *  «plan.md:42» is no link), so «docs/guide/plan.md:…» read the file while «…plan.md:0» reads nothing. r11 (the .399
 *  acceptance): the continuation also CLOSES what the cut left open in its run — a full-width pair (FW_PAIRS: a balanced
 *  pair rides inside a URL, so «…/wiki/「…» read the parent page) and a `[vault:` mark (a whole mark rides inside a path,
 *  so «/srv/app/[vault:s…» read «/srv/app/[vault») — and a MASKED segment over the cut's place is the token too: every
 *  token kind the merged grammar has runs on across the cut. Still ONE re-segmentation per cut text. */
const FW_CLOSER = new Map(FW_PAIRS.map((p) => [p[0], p[1]]));
function continuation(src, e) {
  let b = e; while (b > 0 && !/\s/.test(src[b - 1])) b--;
  const open = [];
  for (let i = b; i < e; i++) {
    if (src.startsWith('[vault:', i)) { open.push(']'); i += 6; continue; }
    const c = src[i];
    if (FW_CLOSER.has(c)) open.push(FW_CLOSER.get(c));
    else if (open.length && c === open[open.length - 1]) open.pop();
  }
  return '0' + open.reverse().join('');
}
function uncutLinks(src, segs) {
  const ends = cutRuns(src).map(([, e]) => e).filter((e) => e < src.length);
  if (!ends.length) return segs;
  const through = [], still = new Set();
  // the continued words, and where each of their offsets sits in `src` (an inserted closer sits at its cut's mark)
  let probe = '', from = 0; const map = [];
  for (const e of ends) { probe += src.slice(from, e); for (let i = from; i < e; i++) map.push(i); const c = continuation(src, e); probe += c; for (let i = 0; i < c.length; i++) map.push(e); from = e + 1; }
  probe += src.slice(from); for (let i = from; i < src.length; i++) map.push(i);
  let at = 0;
  for (const g of segmentWords(probe)) {
    const q = at; at += g.s.length;
    if (g.t !== 'link' && g.t !== 'masked') continue;
    const a = map[q], z = map[at - 1];
    if (g.t === 'link') still.add(a);
    for (const e of ends) if (a < e && z >= e) through.push([a, e]);
  }
  const cutMade = (a, z) => !still.has(a) && ends.some((e) => e >= z && !/\s/.test(src.slice(z, e))); // r10: the continued words read no link here
  at = 0;
  return segs.map((g) => { const a = at; at += g.s.length; return g.t === 'link' && (ends.includes(at) || through.some(([b, e]) => b < at && e > a) || cutMade(a, at)) ? { t: 'text', s: g.s } : g; });
}
/** The words as HTML: every segment ESCAPED; a link = a span around its own words carrying its kind + ref (escaped); a
 *  masked link = its words + the note (`note(g)` — the caller's translated words, maskedLinkNote) — no ref, no role. */
export function linkedHtml(text, { escape = esc, note = (g) => maskedLinkNote(g) } = {}) {
  return segmentText(text).map((g) => (g.t === 'link'
    ? `<span class="fy-link" role="link" tabindex="0" data-fy="${escape(g.kind)}" data-ref="${escape(g.ref)}">${escape(g.s)}</span>`
    : g.t === 'masked' ? `<span class="fy-masked">${escape(g.s)}</span> <span class="masked-link-note">${escape(note(g))}</span>`
      : escape(g.s))).join('');
}
const fillWords = (s, p = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m));
/** THE NOTE a masked link carries (lane mask-value-shape law 2): it will not open, and the owner's road to the real door —
 *  the vault's reveal when the mark names a vault entry, else «ask the agent to send the link without the secret».
 *  `t` = the caller's translator (the English words when none). */
export function maskedLinkNote(g, t = fillWords) {
  const vault = (g && g.mask && Array.isArray(g.mask.vault) ? g.mask.vault : []).filter(Boolean);
  return vault.length
    ? t('Part of this link was masked, so it will not open — it holds the vault entry {entry}: reveal it in Vault, or ask the agent to send the link without the secret.', { entry: vault.join(', ') })
    : t('Part of this link was masked, so it will not open — ask the agent to send the link without the secret.');
}
/** A text drawn as WORDS (a progress note, a status, a stash line, a group message): its masked links' note, or '' — the
 *  first masked link names the road (one note per text). */
export function maskedNoteOf(text, t = fillWords) {
  const g = segmentText(typeof text === 'string' ? text : '').find((x) => x.t === 'masked');
  return g ? maskedLinkNote(g, t) : '';
}
/** For a renderer with its own link grammar (the chat's): does this URL / href hold a belt's mark? → secret-shapes maskedLink. */
export const linkMask = (url) => maskedLink(url);
/** r3 (E): a PATH token holding a mark → its mask; a token whose mark has no `/` before it (a bare placeholder) → null (words, no note). */
export function pathMask(token) {
  const t = String(token || ''), mask = maskedLink(t); if (!mask) return null;
  const k = t.search(MARK_HINT_RE);
  return k >= 0 && t.lastIndexOf('/', k) >= 0 ? mask : null;
}
const KINDS = new Set(['url', 'mail', 'page', 'path', 'rel']);
/** What a link opens, resolved against the ASKING conversation (`cwd` + `host` the store stamped): {open:'url', href} |
 *  {open:'mail', href} | {open:'page', path} | {open:'file', cands, line, host} (probed in order on `host`), or null. */
export function linkTarget(kind, ref, { cwd = '', host = '' } = {}) {
  const r = String(ref || '');
  if (!KINDS.has(kind) || !r) return null;
  if (kind === 'url') return /^https?:\/\//i.test(r) ? { open: 'url', href: r } : null;
  if (kind === 'mail') return { open: 'mail', href: r.startsWith('mailto:') ? r : 'mailto:' + r };
  if (kind === 'page') return { open: 'page', path: r };
  const lm = r.match(/^(.+?):(\d+)(?:[:-]\d+)?$/);
  const p = lm ? lm[1] : r;
  const line = lm ? parseInt(lm[2], 10) : undefined;
  const cands = kind === 'path' ? [p] : relCandidates(p, cwd || '');
  return cands.length ? { open: 'file', cands, line, host: host || '' } : null;
}
/** An ask's attachment → the artifact ROW the one open door takes (src/lib/artifacts-window.js openArtifactRow): a file
 *  = a doc row by path on its host, a design = its folder, a page = a presented page by its /p/ link; null if malformed. */
export function askArtifactRow(a) {
  if (!a || !ASK_ARTIFACT_KINDS.includes(a.kind)) return null;
  if (a.kind === 'page') {
    const p = '/p/' + String(a.page || '');
    return a.page ? { kind: 'page', host: '', path: p, name: String(a.name || p), url: p, state: 'published', presented: true } : null;
  }
  const path = String(a.path || '');
  if (!path) return null;
  return { kind: a.kind === 'design' ? 'design' : 'doc', host: a.host || '', path, name: String(a.name || path.replace(/\/+$/, '').split('/').pop() || path) };
}
/** The open-time re-check (the owner's side): the probe that proves the row still opens — a file's info, a design's
 *  manifest, a page's own URL. */
export function askArtifactProbe(a) {
  const row = askArtifactRow(a);
  if (!row) return null;
  if (row.kind === 'page') return { url: row.url, method: 'HEAD' };
  const p = row.kind === 'design' ? row.path.replace(/\/+$/, '') + '/design.json' : row.path;
  return { url: `/api/file/info?path=${encodeURIComponent(p)}${row.host ? '&host=' + encodeURIComponent(row.host) : ''}`, method: 'GET' };
}
