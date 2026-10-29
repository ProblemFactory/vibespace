'use strict';
// THE APP PAGE'S CONTENT-SECURITY-POLICY (design q-043 D6, lane app-page-csp — §5 row P0-d; the owner 2026-10-20 ③). The
// page the second password is typed into had no policy: one stored-XSS slip (an innerHTML the law missed, a same-origin
// plugin's UI) was a keylogger on the unlock modal. The policy is REPORT-ONLY first: a browser reports what it WOULD block
// and blocks nothing; the enforce switch is a later half-day lane, once a week of reports is empty.
//   · THE POLICY is derived from what the bundle needs — each source MEASURED (the lane's report: the strict start, the
//     reports the chrome set and a window walk produced, the source each one added):
//       script-src 'self'            — the bundle is one <script src>; doc-editor / novnc are imported from this origin;
//                                      no eval, no new Worker, no inline handler in the page. + 'report-sample' (lane
//                                      chrome-156-drift): it allows NOTHING — a report then carries the first 40
//                                      characters of the handler / script it names, so a chrome suite's teardown
//                                      prints WHAT was reported, never only «line 1 column 101»
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
//     dropped, a field is bounded. The ONE exception is asked for by name: `reportsOf(text, { sample: true })` keeps a
//     script-src report's sample (≤ 40 characters, the browser's own cut) — only a chrome suite's scratch hub asks
//     (src/server/csp-reports.js, a sink handed the suite's file), so a hub's own data/ never holds one.
//   · DEDUPE: a line per (directive, blocked, source, line) — `lineKey`; a For-you notice per (directive, blocked) —
//     `pairKey`; `noticeWords` are its words. A report from a FRAME THE PAGE MADE (document about / blob / data: a srcdoc
//     mail or design frame, a blob: page — it inherits the app policy) is a line and NO notice (`noticeWorthy`): a mail's
//     tracker pixels and the frames' own scripts are the frame-host lane's work, never an item the owner can act on.
//   · THE SANITIZER'S PARSE IS NOT A GAP (lane chrome-156-followups): since Chrome 156 an inline handler is reported when
//     its attribute is SET, in an inert document too — and DOMPurify's parse of somebody else's HTML (src/lib/safe-html.js:
//     an agent's markdown, a peer's .md file) is a DOMParser document, so a handler it then drops is a report, filed as the
//     app page. Nothing ran. `reportOf(r, { site: true })` keeps WHERE a candidate was set — a script-src-attr inline
//     report carrying a handler's sample, set by this page's own /bundle.js (the build in its `?v=`) — and the sink names
//     it `sanitizer-parse` (KIND_SANITIZER) when the bundle's code AT that line and column is DOMPurify's parse
//     (`purifyParseSites`: the call on two variables, then DOMPurify's own `createDocument(…, "template", null)` fallback —
//     test-csp-report pins the sites on the bundle's symbol map, scripts/symbolicate.mjs, for the release build and the
//     chrome suites' build; never a column alone). Such a line is counted apart (Diagnostics: «Sanitizer dropped an inline
//     handler: N»), never a notice, never in the app page's count nor a chrome suite's zero-report teardown; every other
//     report — the same attribute set by our own code anywhere else — keeps its notice.
//   · EVERY SANITIZER THE APP SHIPS (lane csp-mermaid-sites): the bundle is not the only script with a DOMPurify — the
//     diagram library (public/mermaid.js, src/lib/mermaid-render.js imports it lazily, stamped `?v=` like the bundle)
//     bundles its OWN, which parses a diagram's labels the same inert way; on Chrome 156 a hostile label was reported at
//     mermaid.js's parse and filed a For-you notice for a diagram sanitized correctly. `PARSE_SCRIPTS` is the ONE table
//     of the served scripts that embed a DOMPurify; each script's sites are computed from ITS OWN file the build its own
//     `?v=` names (purifyParseSites — never a hand-written line:column: a rebuild moves it), never another script's.
//     test-csp-report builds every esbuild step of package.json and pins the table = the scripts whose build carries a
//     DOMPurify (a row cut, or a new script with one, is red by name).
// PURE: imports nothing (scripts/test-architecture.mjs PURE set). The sink is src/server/csp-reports.js.

const HEADER = 'Content-Security-Policy-Report-Only';
/** The ENFORCING header's name — nothing sends it in this release (test-csp-report pins it absent); the later lane's switch. */
const ENFORCE_HEADER = 'Content-Security-Policy';
const REPORT_PATH = '/api/csp-report';

/** THE APP PAGE'S POLICY — one row per directive, its sources in the order they are written. */
const APP_POLICY = Object.freeze([
  ['default-src', ["'self'"]],
  ['script-src', ["'self'", "'report-sample'"]],
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

/** The kind of a line whose handler the sanitizer's inert parse set (and dropped) — see THE SANITIZER'S PARSE above. */
const KIND_SANITIZER = 'sanitizer-parse';
/** THE SERVED SCRIPTS THAT EMBED A DOMPURIFY (lane csp-mermaid-sites — EVERY SANITIZER THE APP SHIPS, above): the app
 *  page's one script (public/index.html) and the diagram library mermaid bundles with its own (public/mermaid.js) — each
 *  same origin as the page, stamped `?v=<mtime>` by the index route. Paths only: a script's parse sites are computed from
 *  its file (the sink, purifyParseSites), never written here. */
const PARSE_SCRIPTS = Object.freeze(['/bundle.js', '/mermaid.js']);

/** WHERE a sanitizer-parse CANDIDATE was set, or null: a script-src-attr `inline` report whose sample is a handler's code,
 *  set by one of the page's own PARSE_SCRIPTS (same origin as the document) at a line and column → { script, v, line,
 *  column } (`script` = its served path, `v` = the build its address names, its `?v=`, or null — Chrome 156 posts no
 *  query). Numbers and a table row only — the sink reads THAT script there; never stored. */
function siteOf(r, directive, blocked) {
  if (directive !== 'script-src-attr' || blocked !== 'inline' || !clean(r['script-sample'] ?? r.sample)) return null;
  const line = numOf(r['line-number'] ?? r.lineNumber), column = numOf(r['column-number'] ?? r.columnNumber);
  if (!line || !column) return null;
  let s, d;
  try { s = new URL(clean(r['source-file'] ?? r.sourceFile, 2048)); d = new URL(clean(r['document-uri'] ?? r.documentURL ?? r.documentUri, 2048)); } catch { return null; }
  if (!/^https?:$/.test(s.protocol) || s.origin !== d.origin || !PARSE_SCRIPTS.includes(s.pathname)) return null;
  const v = s.searchParams.get('v');
  return { script: s.pathname, v: v && /^\d{1,16}$/.test(v) ? v : null, line, column };
}

// DOMPurify's inert parse as a bundle spells it, read at the browser's position (the `parseFromString` it names): the
// call on two VARIABLES (the payload, the parser's type), then — within a few statements — DOMPurify's own fallback
// `.createDocument(<namespace>, "template", null)`. The release build (minified), the chrome suites' build and mermaid's
// own copy (public/mermaid.js, minified) all read so; the docx viewer's and the chart library's parses (a string literal
// type, no template fallback) never do. A DOMPurify that spells it otherwise matches nothing — its reports keep their
// notice — and test-csp-report goes red.
const PURIFY_PARSE = /^parseFromString\(\s*[\w$]+\s*,\s*[\w$]+\s*\)[^]{0,240}?\.createDocument\(\s*[\w$]+\s*,\s*(["'])template\1\s*,\s*null\s*\)/;
const PURIFY_WINDOW = 400;

/** The positions in a bundle's text where its code is DOMPurify's inert parse: [[line, column]] (1-based, as V8 reports
 *  them: its line terminators — \n, \r, \r\n, U+2028, U+2029 — and a column in UTF-16 units, a JS string's own index). */
const LINE_END = /\r\n?|[\n\u2028\u2029]/g;
function purifyParseSites(text) {
  const s = String(text || ''), out = [];
  let line = 1, start = 0;
  for (let at = s.indexOf('.parseFromString(', 0); at >= 0; at = s.indexOf('.parseFromString(', at + 1)) {
    const p = at + 1;
    if (!PURIFY_PARSE.test(s.slice(p, p + PURIFY_WINDOW))) continue;
    LINE_END.lastIndex = start;
    for (let m = LINE_END.exec(s); m && m.index < p; m = LINE_END.exec(s)) { line++; start = m.index + m[0].length; }
    out.push([line, p - start + 1]);
  }
  return out;
}

/** One browser report body → the line's fields, or null (not a report we understand). `r` = the inner object of a
 *  report-uri post (`{"csp-report": r}`) or a Reporting-API entry's `body`. `sample` (a chrome suite's hub only): a
 *  script-src* report keeps the browser's sample of the code it names — the handler's text, ≤ 40 characters. `site`
 *  (the sink): a sanitizer-parse candidate also carries `site` (siteOf) — the sink reads it, names the kind, drops it. */
const SAMPLE_MAX = 40;
function reportOf(r, { sample = false, site = false } = {}) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const directive = directiveOf(r);
  if (!directive) return null;
  const disposition = clean(r.disposition, 16) === 'enforce' ? 'enforce' : 'report';
  const blocked = uriOf(r['blocked-uri'] ?? r.blockedURL ?? r.blockedUri) || 'other';
  const at = site ? siteOf(r, directive, blocked) : null;
  return {
    directive,
    blocked,
    source: uriOf(r['source-file'] ?? r.sourceFile) || '',
    line: numOf(r['line-number'] ?? r.lineNumber),
    column: numOf(r['column-number'] ?? r.columnNumber),
    document: uriOf(r['document-uri'] ?? r.documentURL ?? r.documentUri) || '',
    disposition,
    ...(sample && /^script-src/.test(directive) ? { sample: clean(r['script-sample'] ?? r.sample, SAMPLE_MAX) } : {}),
    ...(at ? { site: at } : {}),
  };
}

/** A POST body → its reports (≤ 20): the report-uri shape `{"csp-report": {…}}` (application/csp-report) or the
 *  Reporting API's `[{type: 'csp-violation', body: {…}}, …]` (application/reports+json). Never throws. `opts.sample`:
 *  see reportOf (a chrome suite's hub only). */
function reportsOf(text, opts = {}) {
  let j;
  try { j = JSON.parse(String(text || '')); } catch { return []; }
  const raw = Array.isArray(j) ? j.filter((e) => e && e.type === 'csp-violation').map((e) => e.body) : [j && j['csp-report']];
  return raw.slice(0, 20).map((r) => reportOf(r, opts)).filter(Boolean);
}

/** The content types a browser posts a report with. A page on another site cannot send these without a CORS preflight,
 *  which this server never answers — so a forged report comes only from a non-browser caller (the pace bounds it). */
const REPORT_TYPES = Object.freeze(['application/csp-report', 'application/reports+json', 'application/json']);
const isReportType = (ct) => REPORT_TYPES.includes(String(ct || '').split(';')[0].trim().toLowerCase());

/** The documents that are a frame the page made (they inherit the app page's policy) — a line, never a notice. */
const FRAME_DOCUMENTS = new Set(['about', 'blob', 'data']);
/** A notice for the owner: the app page's own report — never a frame's, never the sanitizer's parse. */
const noticeWorthy = (r) => !!r && !FRAME_DOCUMENTS.has(r.document) && r.kind !== KIND_SANITIZER;
/** The count a line belongs to: 'sanitizer' (the sanitizer's parse) · 'app' (the app page — the policy's gaps) · 'frames'. */
const sideOf = (r) => (r && r.kind === KIND_SANITIZER ? 'sanitizer' : noticeWorthy(r) ? 'app' : 'frames');
// a suite's line also differs by its sample (two controls' handlers on line 1 of two evaluated scripts are two lines); a
// hub's own lines carry none, so their key is what it always was
const lineKey = (r) => `${r.directive}\u0000${r.blocked}\u0000${r.source}\u0000${r.line == null ? '' : r.line}${r.sample ? `\u0000${r.sample}` : ''}`;
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
  DIRECTIVES, KEYWORDS, TOKEN_SEGMENT, SAMPLE_MAX, uriOf, reportOf, reportsOf, REPORT_TYPES, isReportType, FRAME_DOCUMENTS, noticeWorthy, lineKey, pairKey,
  KIND_SANITIZER, PARSE_SCRIPTS, siteOf, purifyParseSites, sideOf,
  NOTICE_TEXT, NOTICE_DETAIL, noticeWords,
};
