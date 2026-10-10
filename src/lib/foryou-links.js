// THE FOR-YOU LINKS (lane foryou-attachments, owner 2026-10-09 "经常 agent 会让我 review 一个产物/文件/网页，我却没法轻易从
// inbox 里打开") — PURE (imports only ../path-linkify.js): what an item's words point at, and what an ask's attachment
// opens. The words stay EXACTLY as written; a link is a span AROUND the words, every segment escaped (linkedHtml) — the
// item is agent-written and syncs to every client, so raw text is never markup. ONE grammar with the chat: where a path
// ends = pathRe / cleanPath, a relative reference = looksRelPath (the chat's code-span rule), where it may live =
// relCandidates (the chat's click) — this file adds only the prose spans the chat leaves to markdown (http(s) / mailto /
// a mail address / a /p/<id> page) and one prose rule: a relative path with a slash and a file tail (`docs/plan.md`,
// `out/`) links outside a code span too; a bare filename links only inside one (the chat's rule).
// Resolution is for OPENING only: a target is {open, …} the client probes on ITS host (the asker's) at click time.
import { pathRe, cleanPath, looksRelPath, relCandidates } from '../path-linkify.js';

export const ASK_ARTIFACT_KINDS = Object.freeze(['file', 'design', 'page']);

const URL_RE = /\b(?:https?:\/\/|mailto:)[^\s<>"'`]+/g;
const MAIL_RE = /(?<![\w.+-])[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const PAGE_RE = /(?<![="'\w/])\/p\/pg[a-z0-9]{10}(?![A-Za-z0-9_-])/g;
const CODE_RE = /`([^`\n]+)`/g;
const LEAD = /^[([{"'“‘「『（]+/;
const FILE_TAIL = /\.[A-Za-z0-9]{1,8}$/;
const RANK = { url: 0, mail: 1, page: 2, path: 3 };
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** Prose spans: [{start, end, kind, ref}] — the earliest wins; one starting inside an earlier one is dropped. */
function proseHits(s) {
  const hits = [];
  for (const m of s.matchAll(URL_RE)) { const ref = cleanPath(m[0]); if (ref.length > 8) hits.push({ start: m.index, end: m.index + ref.length, kind: ref.startsWith('mailto:') ? 'mail' : 'url', ref }); }
  for (const m of s.matchAll(MAIL_RE)) { const ref = cleanPath(m[0]); hits.push({ start: m.index, end: m.index + ref.length, kind: 'mail', ref: 'mailto:' + ref }); }
  for (const m of s.matchAll(PAGE_RE)) hits.push({ start: m.index, end: m.index + m[0].length, kind: 'page', ref: m[0] });
  for (const m of s.matchAll(pathRe())) { const ref = cleanPath(m[1]); if (ref.length >= 4) hits.push({ start: m.index, end: m.index + ref.length, kind: 'path', ref }); }
  hits.sort((a, b) => a.start - b.start || RANK[a.kind] - RANK[b.kind] || b.end - a.end);
  const out = [];
  for (const h of hits) if (!out.length || h.start >= out[out.length - 1].end) out.push(h);
  return out;
}
/** A gap's relative paths (prose): a token with a slash and a file tail (or a trailing slash) that the chat's rule passes. */
function relHits(s, base) {
  const out = [];
  let at = 0;
  for (const tok of s.split(/(\s+)/)) {
    const lead = (LEAD.exec(tok) || [''])[0];
    const core = cleanPath(tok.slice(lead.length));
    const tail = core.replace(/\/+$/, '').split('/').pop();
    if (core.includes('/') && !core.startsWith('/') && !core.startsWith('~') && (core.endsWith('/') || FILE_TAIL.test(tail)) && looksRelPath(core)) {
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
    segs.push({ t: 'link', s: s.slice(h.start, h.end), kind: h.kind, ref: h.ref });
    at = h.end;
  }
  if (at < s.length) segs.push({ t: 'text', s: s.slice(at) });
}
/** THE SEGMENTER: text → [{t:'text', s} | {t:'link', s, kind: url|mail|page|path|rel, ref}]; the `s` of every segment
 *  joined IS the text (nothing added, nothing dropped). A `code span` holds a relative path or a bare filename. */
export function segmentText(text) {
  const src = typeof text === 'string' ? text : '';
  const segs = [];
  let at = 0;
  for (const m of src.matchAll(CODE_RE)) {
    if (m.index > at) proseSegments(src.slice(at, m.index), segs);
    const inner = m[1];
    const before = segs.length;
    segs.push({ t: 'text', s: '`' });
    proseSegments(inner, segs);
    if (!segs.slice(before + 1).some((x) => x.t === 'link') && looksRelPath(inner.trim())) {
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
/** The words as HTML: every segment ESCAPED; a link = a span around its own words carrying its kind + ref (escaped). */
export function linkedHtml(text, { escape = esc } = {}) {
  return segmentText(text).map((g) => (g.t === 'link'
    ? `<span class="fy-link" role="link" tabindex="0" data-fy="${escape(g.kind)}" data-ref="${escape(g.ref)}">${escape(g.s)}</span>`
    : escape(g.s))).join('');
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
