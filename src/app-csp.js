'use strict';
// THE APP PAGE'S CONTENT-SECURITY-POLICY (design q-043 D6, lane app-page-csp — §5 row P0-d; the owner 2026-10-20 ③). The
// page the second password is typed into had no policy: one stored-XSS slip (an innerHTML the law missed, a same-origin
// plugin's UI) was a keylogger on the unlock modal. The policy is REPORT-ONLY first: a browser reports what it WOULD block
// and blocks nothing; the enforce switch is a later half-day lane, once a week of reports is empty.
//   · THE POLICY is derived from what the bundle needs — each source MEASURED (the lane's report: the strict start, the
//     reports the chrome set and a window walk produced, the source each one added):
//       script-src 'self'            — the bundle is one <script src>; doc-editor / novnc are imported from this origin;
//                                      no eval, no new Worker, no inline handler in the page
//       style-src + 'unsafe-inline'  — index.html's own style attributes + its <style>, the <style> elements the bundle adds
//       img-src + data: blob: https: — the favicon (data:); a file's bytes shown as a picture (blob:); a markdown file's
//                                      remote pictures (https:)
//       connect-src + blob:          — the page reads back the blob: files it made (a download's bytes)
//       media-src + blob:            — a remote file's audio / video
//       frame-src + blob: http: https: — a PDF's bytes (blob:); the Web view frames any site, and a page the app made
//       font-src + blob:             — the self-hosted fonts (public/fonts); a Word document's EMBEDDED fonts, registered
//                                      from blob: URLs of their bytes (lane frame-host-preview: test-docx-viewer ⑦
//                                      reported them — the measured policy had missed the viewer)
//       worker-src 'self'            — no worker
//     and no <object>/<embed>; <base> and form targets this origin; framed only by this origin.
//   · `report-uri` and NOT `report-to` (measured, Chrome 2026-10-20): report-uri posts each violation within ~0.4 s;
//     with report-to present Chrome ignores report-uri and its Reporting API sent nothing in 70 s — a chrome suite's
//     teardown could never count on it.
//   · A REPORT is untrusted input (no cookie, no Origin rule — a sandboxed frame posts `Origin: null`): `reportsOf` reads
//     only the fields a person needs and NEVER a value — no script sample, no query, no fragment, a URL cut to its origin +
//     3 path segments (a path can carry a user's file path; a query a token) — a directive outside the CSP vocabulary is
//     dropped, a field is bounded.
//   · DEDUPE: a line per (directive, blocked, source, line) — `lineKey`; a For-you notice per (directive, blocked) —
//     `pairKey`; `noticeWords` are its words. A report from a FRAME THE PAGE MADE (document about / blob / data: a srcdoc
//     mail or design frame, a blob: page — it inherits the app policy) is a line and NO notice (`noticeWorthy`): a mail's
//     tracker pixels and the frames' own scripts are the frame-host lane's work, never an item the owner can act on.
// PURE: imports nothing (scripts/test-architecture.mjs PURE set). The sink is src/server/csp-reports.js.

const HEADER = 'Content-Security-Policy-Report-Only';
/** The ENFORCING header's name — nothing sends it in this release (test-csp-report pins it absent); the later lane's switch. */
const ENFORCE_HEADER = 'Content-Security-Policy';
const REPORT_PATH = '/api/csp-report';

/** THE APP PAGE'S POLICY — one row per directive, its sources in the order they are written. */
const APP_POLICY = Object.freeze([
  ['default-src', ["'self'"]],
  ['script-src', ["'self'"]],
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
  ['font-src', ["'self'", 'blob:']],
  ['connect-src', ["'self'", 'blob:']],
  ['media-src', ["'self'", 'blob:']],
  ['worker-src', ["'self'"]],
  ['frame-src', ["'self'", 'blob:', 'http:', 'https:']],
  ['object-src', ["'none'"]],
  ['base-uri', ["'self'"]],
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'self'"]],
].map(([d, s]) => Object.freeze([d, Object.freeze(s)])));

/** A policy's header value: `d s s; d s; …; report-uri /api/csp-report`. */
function policyString(rows, { reportUri = REPORT_PATH } = {}) {
  const parts = rows.map(([d, s]) => `${d} ${s.join(' ')}`);
  if (reportUri) parts.push(`report-uri ${reportUri}`);
  return parts.join('; ');
}
const appPolicy = () => policyString(APP_POLICY);

/** THE SIGN-IN PAGE'S POLICY (src/auth.js loginHtml): its one inline <script> carries this response's nonce; the SSO
 *  button loads ClerkJS from the instance's own Clerk frontend host, which also answers its fetches and draws its
 *  pictures. `clerkHost` = that host or '' (password only). */
function loginPolicy({ nonce = '', clerkHost = '' } = {}) {
  const n = String(nonce).replace(/[^A-Za-z0-9+/=_-]/g, '');
  const h = /^[A-Za-z0-9.-]{1,253}$/.test(String(clerkHost)) ? `https://${clerkHost}` : '';
  const plus = (s) => (h ? [...s, h] : s);
  return policyString(APP_POLICY.map(([d, s]) => {
    if (d === 'script-src') return [d, plus([...s, `'nonce-${n}'`])];
    if (d === 'connect-src' || d === 'img-src' || d === 'frame-src') return [d, plus(s)];
    return [d, s];
  }));
}

/** The CSP vocabulary a report may name (CSP3 + the -elem / -attr splits Chrome reports); anything else is dropped. */
const DIRECTIVES = new Set(['default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem',
  'style-src-attr', 'img-src', 'font-src', 'connect-src', 'media-src', 'object-src', 'frame-src', 'child-src', 'worker-src',
  'manifest-src', 'prefetch-src', 'fenced-frame-src', 'base-uri', 'form-action', 'frame-ancestors', 'navigate-to', 'sandbox',
  'require-trusted-types-for', 'trusted-types', 'webrtc', 'upgrade-insecure-requests']);
/** The words a browser reports instead of a URL (CSP3 §5.3 + Chrome's). */
const KEYWORDS = new Set(['inline', 'eval', 'wasm-eval', 'trusted-types-policy', 'trusted-types-sink', 'self', 'about', 'blob', 'data']);
const FIELD_MAX = 200;
const SEGMENTS = 3;
// B-a35f (q-043 verify L4): a kept segment that LOOKS LIKE A TOKEN — ≥ 16 characters of [A-Za-z0-9_-], any segment of ≥ 32, or
// one of the hub's own token prefixes — is cut to `<token>`: a third-party `/share/<token>/x` never reaches the report line
// (data/csp-reports.jsonl) nor the For-you notice that prints it
const TOKEN_SEGMENT = /^(?:[A-Za-z0-9_-]{16,}|[^]{32,}|(?:vsst_|jbt_|vsrt_|vi-)[^]*)$/;
const clean = (s, max = FIELD_MAX) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);

/** A URL as a report line keeps it: a keyword as is; http(s)/ws(s) ⇒ origin + the first 3 path segments (no query, no
 *  fragment, no user:pass; a segment that looks like a token is `<token>`); an extension ⇒ scheme://id; any other scheme ⇒
 *  the scheme alone (a data: URL is its bytes). */
function uriOf(u) {
  const s = clean(u, 2048);
  if (!s) return '';
  const low = s.toLowerCase();
  if (KEYWORDS.has(low)) return low;
  const m = /^([a-z][a-z0-9+.-]{0,30}):/.exec(low);
  if (!m) return 'other';
  const scheme = m[1];
  if (/^(https?|wss?)$/.test(scheme)) {
    try {
      const x = new URL(s);
      const segs = x.pathname.split('/').filter(Boolean);
      return clean(`${x.protocol}//${x.host}/${segs.slice(0, SEGMENTS).map((g) => (TOKEN_SEGMENT.test(g) ? '<token>' : g)).join('/')}${segs.length > SEGMENTS ? '/…' : ''}`);
    } catch { return scheme; }
  }
  if (/-extension$/.test(scheme)) { const id = /^[a-z-]+:\/\/([a-z0-9]{1,64})/.exec(low); return id ? `${scheme}://${id[1]}` : scheme; }
  return scheme;
}
const directiveOf = (r) => {
  const d = clean(r['effective-directive'] || r.effectiveDirective || r['violated-directive'] || r.violatedDirective, 64).split(/\s+/)[0].toLowerCase();
  return DIRECTIVES.has(d) ? d : null;
};
const numOf = (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < 1e9 ? Number(v) : null);

/** One browser report body → the line's fields, or null (not a report we understand). `r` = the inner object of a
 *  report-uri post (`{"csp-report": r}`) or a Reporting-API entry's `body`. */
function reportOf(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const directive = directiveOf(r);
  if (!directive) return null;
  const disposition = clean(r.disposition, 16) === 'enforce' ? 'enforce' : 'report';
  return {
    directive,
    blocked: uriOf(r['blocked-uri'] ?? r.blockedURL ?? r.blockedUri) || 'other',
    source: uriOf(r['source-file'] ?? r.sourceFile) || '',
    line: numOf(r['line-number'] ?? r.lineNumber),
    column: numOf(r['column-number'] ?? r.columnNumber),
    document: uriOf(r['document-uri'] ?? r.documentURL ?? r.documentUri) || '',
    disposition,
  };
}

/** A POST body → its reports (≤ 20): the report-uri shape `{"csp-report": {…}}` (application/csp-report) or the
 *  Reporting API's `[{type: 'csp-violation', body: {…}}, …]` (application/reports+json). Never throws. */
function reportsOf(text) {
  let j;
  try { j = JSON.parse(String(text || '')); } catch { return []; }
  const raw = Array.isArray(j) ? j.filter((e) => e && e.type === 'csp-violation').map((e) => e.body) : [j && j['csp-report']];
  return raw.slice(0, 20).map(reportOf).filter(Boolean);
}

/** The content types a browser posts a report with. A page on another site cannot send these without a CORS preflight,
 *  which this server never answers — so a forged report comes only from a non-browser caller (the pace bounds it). */
const REPORT_TYPES = Object.freeze(['application/csp-report', 'application/reports+json', 'application/json']);
const isReportType = (ct) => REPORT_TYPES.includes(String(ct || '').split(';')[0].trim().toLowerCase());

/** The documents that are a frame the page made (they inherit the app page's policy) — a line, never a notice. */
const FRAME_DOCUMENTS = new Set(['about', 'blob', 'data']);
const noticeWorthy = (r) => !!r && !FRAME_DOCUMENTS.has(r.document);
const lineKey = (r) => `${r.directive}\u0000${r.blocked}\u0000${r.source}\u0000${r.line == null ? '' : r.line}`;
const pairKey = (r) => `${r.directive}\u0000${r.blocked}`;

/** THE NOTICE (one per new pair): what the enforced policy would block, and where it was seen. */
const i18nKey = (s) => s; // the extraction marker (scripts/i18n-extract.mjs) — the client words the notice through t()
const NOTICE_TEXT = i18nKey('The page security policy would block {directive}: {blocked}');
const NOTICE_DETAIL = i18nKey('Seen on {document}{where}. Nothing is blocked yet — this release only reports; the policy is enforced in a later release, so tell the developers if this is something you use.');
function noticeWords(r) {
  const where = r.source ? ` (${r.source}${r.line != null ? `:${r.line}` : ''})` : '';
  const p = { directive: r.directive, blocked: r.blocked, document: r.document || 'the page', where };
  const fill = (t) => t.replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m));
  return { text: fill(NOTICE_TEXT), detail: fill(NOTICE_DETAIL), i18n: { text: { key: NOTICE_TEXT, params: p }, detail: [{ key: NOTICE_DETAIL, params: p }] } };
}

module.exports = {
  HEADER, ENFORCE_HEADER, REPORT_PATH, APP_POLICY, policyString, appPolicy, loginPolicy,
  DIRECTIVES, KEYWORDS, TOKEN_SEGMENT, uriOf, reportOf, reportsOf, REPORT_TYPES, isReportType, FRAME_DOCUMENTS, noticeWorthy, lineKey, pairKey,
  NOTICE_TEXT, NOTICE_DETAIL, noticeWords,
};
