#!/usr/bin/env node
// Published pages (2.364.0, "接管artifact"): instance-hosted shareable HTML.
// Real HTTP round trips through the REAL module + express: publish → serve
// (CSP sandbox header is LOAD-BEARING — without it this feature is stored XSS
// on the app origin) → per-page auth gate both ways → upsert keeps the share
// URL → delete. Wiring pins hold auth.js's /p/ exemption, server.js's
// registration, the explorer dialog, and the Background Work sender-click fix.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
// (sections 8–9 added in 2.366.0: content publish + design-flow wiring)
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const express = require(path.join(REPO, 'node_modules/express'));

let pass = 0, fail = 0;
const okc = (c, n, e) => ok(n, c, e); // condition-first twin for sections 8–9 (review-caught: the first version passed (cond, name) into ok(name, cond) — every assert was vacuous)
const ok = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}${e ? ' — ' + e : ''}`); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pages-'));
const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pages-src-'));
const srcFile = path.join(srcDir, 'canvas.html');
fs.writeFileSync(srcFile, '<!doctype html><title>v1</title><script>window.x=1</script>');

let authed = false; // toggled per-case: simulates cookie auth presence
const pages = require(path.join(REPO, 'src/server/published-pages.js')).create({
  dataDir: dir, requestAuthed: () => authed, publicUrl: () => 'https://inst.example',
});
const app = express();
app.use(express.json());
pages.registerRoutes(app);
const srv = app.listen(0);
await new Promise((r) => srv.on('listening', r));
const base = `http://127.0.0.1:${srv.address().port}`;

// 1. publish → record + stable URL
const r1 = pages.publish({ srcPath: srcFile, name: 'Canvas' });
ok('publish returns a page with /p/ URL', r1.page && /^https:\/\/inst\.example\/p\/pg[a-z0-9]{10}$/.test(r1.page.url), JSON.stringify(r1));
const id = r1.page.id;

// 2. PRIVATE by default: unauthed 401, authed 200 + CSP sandbox
authed = false;
let res = await fetch(`${base}/p/${id}`);
ok('private page refuses unauthenticated viewers (401)', res.status === 401);
authed = true;
// 2a. THE SHELL (2.366.1): real origin, no user content, frames the raw route.
//     Before this split the published HTML was the top-level document and the
//     sandbox CSP made ITS origin opaque — the canvas editor's localStorage
//     reads threw on every boot and extensions died on targetOrigin 'null'
//     (owner: "打开后无法加载"). Isolation must be unchanged: the CONTENT is
//     still sandboxed, only the frame around it is ours.
res = await fetch(`${base}/p/${id}`);
const shell = await res.text();
const shellCsp = res.headers.get('content-security-policy') || '';
ok('authed viewer gets the shell', res.status === 200 && /<iframe[^>]+src="\/p\/pg[a-z0-9]{10}\/raw"/.test(shell), shell.slice(0, 200));
ok('shell carries NO user content (only the frame)', !shell.includes('window.x=1') && !shell.includes('<title>v1<')); // 'v1' alone false-positives on the SW cache name vibespace-pages-v1
ok('shell is NOT sandboxed (real origin — that is the whole point)', !/sandbox/.test(shellCsp), shellCsp);
ok('shell CSP allows only its own frame', /frame-src 'self'/.test(shellCsp) && /default-src 'none'/.test(shellCsp), shellCsp);
// geo/storage bridge (B-74de, 2.369.7): the shell carries the nonce'd bridge
// script — OUR content, not the page's; the sandbox stays untouched
ok('shell ships the geo/storage bridge under a per-request script nonce', /script-src 'nonce-/.test(shellCsp) && /vibeBridge/.test(shell) && /vp_pg[a-z0-9]{10}_/.test(shell));
ok('…and the bridge verifies the message SOURCE and namespaces storage keys', /e\.source!==f\.contentWindow/.test(shell) && /localStorage\.setItem\(PFX\+String/.test(shell));
ok('…nonce differs per request (no static nonce)', await (async () => { const r2 = await fetch(`${base}/p/${id}`); await r2.text(); const nonceOf = (csp) => csp.match(/'nonce-([^']+)'/)?.[1]; const n1 = nonceOf(shellCsp); const n2 = nonceOf(r2.headers.get('content-security-policy') || ''); return !!n1 && !!n2 && n1 !== n2; })());
// offline support (2.369.11): scope-limited SW + vibeBlob IDB lane
res = await fetch(`${base}/p/sw.js`);
const swBody = await res.text();
ok('/p/sw.js serves the offline worker (scope-limited by location — can never touch the app)', res.status === 200 && /vibespace-pages-v1/.test(swBody) && /pg\[a-z0-9\]\{10\}/.test(swBody.replace(/\\/g, '\\')));
ok('…network-first with a 4s cache fallback (online keeps auth + freshness; offline serves the last good copy)', /Promise\.race/.test(swBody) && /cache\.match\(e\.request\)/.test(swBody));
ok('the shell registers the worker and serves vibeBlob (IndexedDB, on-demand get) alongside vibeStore', /serviceWorker' in navigator/.test(shell) && /vibeBlob/.test(shell) && /indexedDB\.open\('vibespace-pages'/.test(shell));
ok('iframe sandbox attribute grants scripts but NEVER same-origin', /sandbox="[^"]*allow-scripts/.test(shell) && !/allow-same-origin/.test(shell), shell.slice(0, 400));
res = await fetch(`${base}/p/${id}/raw`);
const rawBody = await res.text();
const csp = res.headers.get('content-security-policy') || '';
ok('authed viewer gets the page content on /raw', res.status === 200 && rawBody.includes('v1'));
ok('CSP sandbox header present on the CONTENT (opaque origin — the XSS guard)', /sandbox/.test(csp) && /allow-scripts/.test(csp), csp);
ok('sandbox does NOT grant allow-same-origin (cookie isolation)', !/allow-same-origin/.test(csp), csp);
ok('compat prelude injected BEFORE the page\'s own content', rawBody.includes('function mk()') && rawBody.indexOf('function mk()') < rawBody.indexOf('v1'), rawBody.slice(0, 160));
// THE 2.366.1 FIX: crypto.randomUUID exists only in a SECURE CONTEXT, so over
// plain http on a hostname/LAN IP it is undefined and the canvas editor hangs
// every artboard forever. Measured on a real LAN origin: without the polyfill
// 5/5 artboards stuck, with it 0/5. Loopback hid it (127.0.0.1 is trustworthy).
ok('prelude polyfills crypto.randomUUID (insecure origins have none — the artboards hang without it)', rawBody.includes('randomUUID') && rawBody.includes('getRandomValues'), 'missing randomUUID polyfill');
{
  const { COMPAT_PRELUDE } = require(path.join(REPO, 'src/server/published-pages.js'));
  const vm = require('vm');
  const ctx = { Object, Uint8Array, window: { crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) % 256; return a; } } } };
  ctx.crypto = ctx.window.crypto; ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(COMPAT_PRELUDE.replace(/^<script>|<\/script>$/g, ''), ctx);
  ok('the polyfill yields a REAL v4 uuid (getRandomValues, not Math.random)', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(ctx.crypto.randomUUID()), ctx.crypto.randomUUID());
  // and it must NOT replace a browser that already has one (https / loopback)
  const ctx2 = { Object, Uint8Array, window: { crypto: { getRandomValues: () => { }, randomUUID: () => 'native-uuid' } } };
  ctx2.crypto = ctx2.window.crypto; ctx2.window.window = ctx2.window;
  vm.createContext(ctx2); vm.runInContext(COMPAT_PRELUDE.replace(/^<script>|<\/script>$/g, ''), ctx2);
  ok('NEGATIVE: a browser that already has randomUUID keeps its own', ctx2.crypto.randomUUID() === 'native-uuid');
}
{ // and it lands inside <head> when there is one
  const withHead = require(path.join(REPO, 'src/server/published-pages.js')).injectShim(Buffer.from('<!doctype html><html><head><title>t</title></head><body>b</body></html>')).toString();
  ok('shim lands right after <head…> when the document has one', /<head[^>]*><script>\(function\(\)\{function mk\(\)/.test(withHead) && withHead.includes('<body>b</body>'), withHead.slice(0, 120));
}

// 2b. review-caught belts: browser viewers get the login redirect, private = no-store
authed = false;
res = await fetch(`${base}/p/${id}`, { headers: { accept: 'text/html' }, redirect: 'manual' });
ok('logged-out BROWSER viewer of a private page → /login redirect (no dead-end 401)', res.status === 302 && (res.headers.get('location') || '').includes('/login'), String(res.status));
res = await fetch(`${base}/p/${id}/raw`, { headers: { accept: 'text/html' }, redirect: 'manual' });
ok('the RAW route is gated identically (framing is not the protection)', res.status === 302 && (res.headers.get('location') || '').includes('/login'), String(res.status));
authed = true;
res = await fetch(`${base}/p/${id}`);
ok('private page is no-store (never cached for shared machines)', (res.headers.get('cache-control') || '') === 'no-store');

// 3. public toggle → unauthed 200
pages.setFlags(id, { makePublic: true });
authed = false;
res = await fetch(`${base}/p/${id}`);
ok('public page serves without login', res.status === 200);
{ // the page NAME reaches the shell's <title> — it is agent-chosen, so it must be escaped
  const r = pages.setFlags(id, { name: '</title><script>alert(1)</script>' });
  const s2 = await (await fetch(`${base}/p/${id}`)).text();
  ok('shell escapes the page name (agent-chosen string in our own HTML)', !s2.includes('<script>alert(1)') && s2.includes('&lt;/title&gt;'), s2.slice(0, 240));
  pages.setFlags(id, { name: r.page ? 'Canvas' : 'Canvas' });
}

// 4. upsert: republishing the same source keeps the id + serves new content
fs.writeFileSync(srcFile, '<!doctype html><title>v2</title>');
const r2 = pages.publish({ srcPath: srcFile });
ok('re-publish upserts the SAME id (stable share URL)', r2.page.id === id, `${r2.page?.id} vs ${id}`);
res = await fetch(`${base}/p/${id}/raw`);
ok('re-publish serves the NEW snapshot', (await res.text()).includes('v2'));

// 5. refusals: non-html, missing file, malformed id (traversal shape)
ok('non-html refused', !!pages.publish({ srcPath: path.join(REPO, 'package.json') }).error);
ok('missing file refused', !!pages.publish({ srcPath: '/nonexistent/x.html' }).error);
res = await fetch(`${base}/p/..%2F..%2Fetc%2Fpasswd`);
ok('malformed id 404s (ID regex, no traversal)', res.status === 404);

// 6. delete → gone
pages.remove(id);
res = await fetch(`${base}/p/${id}`);
// B-f694: a page that WAS published answers 410 with a named line (the link is gone, and says so); an id never
// published stays 404
ok('deleted page answers 410 "unpublished"', res.status === 410 && /unpublished/.test(await res.text()));
ok('deleted page answers 410 on /raw too', (await fetch(`${base}/p/${id}/raw`)).status === 410);
ok('store empty after delete', pages.list().length === 0);

// 7. store round-trips across instances (restart survival)
pages.publish({ srcPath: srcFile, name: 'again' });
const pages2 = require(path.join(REPO, 'src/server/published-pages.js')).create({ dataDir: dir, requestAuthed: () => true, publicUrl: () => null });
ok('a fresh instance reloads the persisted store', pages2.list().length === 1 && pages2.list()[0].name === 'again');

// 8. content publish (the agent CLI / remote-host path, 2.366.0): upsert by
//    srcKey (host:path), session attribution, the ONE notify hook, the
//    browser-origin heuristic for absolute share URLs, HTTP filter by session
{
  const notes = [];
  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pages3-'));
  const pg = require(path.join(REPO, 'src/server/published-pages.js')).create({ dataDir: dir3, requestAuthed: () => true, publicUrl: () => null, onPublished: (p, x) => notes.push({ p, x }) });
  const r1 = pg.publishContent({ html: '<!doctype html><title>c1</title>', name: 'Canvas One', srcKey: 'host-a:/home/u/canvas.html', sessionId: 'sess-1-1', conversationId: 'conv-1' });
  okc(r1.page && /^pg/.test(r1.page.id) && r1.page.sessionId === 'sess-1-1' && r1.page.replaced === false, 'content publish creates a page attributed to the publishing session', JSON.stringify(r1));
  okc(r1.page.url === '/p/' + r1.page.id && r1.page.path === '/p/' + r1.page.id, 'no public URL and no browser origin yet → honest relative /p/<id> (client joins its origin)');
  const r2 = pg.publishContent({ html: '<!doctype html><title>c2</title>', srcKey: 'host-a:/home/u/canvas.html', sessionId: 'sess-1-1' });
  okc(r2.page.id === r1.page.id && r2.page.replaced === true && r2.page.name === 'Canvas One', 'same srcKey → same id (stable share URL), snapshot replaced, name kept when omitted');
  okc(fs.readFileSync(path.join(dir3, 'published-pages', r1.page.id + '.html'), 'utf8').includes('c2'), 'the snapshot on disk is the new content');
  const r3 = pg.publishContent({ html: '<!doctype html><title>other</title>', srcKey: 'host-b:/home/u/canvas.html', sessionId: 'sess-2-2' });
  okc(r3.page.id !== r1.page.id, 'the same path on ANOTHER host is a different page (host is part of the identity)');
  okc(pg.list({ sessionId: 'sess-1-1' }).length === 1 && pg.list({ sessionId: 'sess-2-2' }).length === 1 && pg.list().length === 2, 'list filters by sessionId');
  okc(notes.length === 3 && notes[0].x.replaced === false && notes[1].x.replaced === true && notes[0].p.id === r1.page.id, 'onPublished fires for every publish with the replaced flag (the ONE notify point)');
  // visibility / rename / unpublish notify too (multi-client law) — review-caught
  const n0 = notes.length;
  pg.setFlags(r1.page.id, { makePublic: true });
  okc(notes.length === n0 + 1 && notes[n0].x.changed === 'flags' && notes[n0].p.public === true, 'setFlags notifies with the new visibility');
  okc(pg.bySrcPath('/home/u/canvas.html') === null, 'bySrcPath matches LOCAL pages only — a remote host\'s page for the same absolute path is not it (review-caught)');
  const rl = pg.publish({ srcPath: srcFile, name: 'local twin' });
  okc(pg.bySrcPath(srcFile)?.id === rl.page.id && rl.page.replaced === false, 'a hub-local file publish is found by path and is NOT a replace on first publish');
  okc(pg.publish({ srcPath: srcFile }).page.replaced === true, 'second file publish of the same path reports replaced=true (was always false — review-caught)');
  const n1 = notes.length;
  pg.remove(r3.page.id);
  okc(notes.length === n1 + 1 && notes[n1].x.removed === true && notes[n1].p.removed === true && notes[n1].p.id === r3.page.id, 'remove notifies with removed:true so every client drops the row');
  okc(pg.list().length === 2, 'removed page gone from the store');
  // hostile Host headers never become share-link origins

  okc(!!pg.publishContent({ html: '', srcKey: 'x:y' }).error && !!pg.publishContent({ html: '<p>x</p>', srcKey: '' }).error, 'empty body / missing srcKey refused');
  okc(!!pg.publishContent({ html: Buffer.alloc(26 * 1024 * 1024, 65), srcKey: 'x:big' }).error, 'oversized body refused');
  // URLs are built from the ASKING request only — never a remembered origin
  // (owner: "你怎么知道我用啥地址能访问你？是不是存在反代？"). A stored origin is
  // a guess about someone else's device; 2.366.0 handed an agent this box's own
  // hostname and the owner got a dead link.
  const askedFrom = (headers, protocol) => pg.list({ req: { headers, protocol } })[0].url;
  okc(askedFrom({ host: 'vibe.example:3456' }, 'https') === 'https://vibe.example:3456/p/' + pg.list()[0].id, 'the URL is absolute on the origin of the request that asked');
  okc(askedFrom({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'pub.example', host: '10.0.0.1:3456' }, 'http').startsWith('https://pub.example/p/'), 'x-forwarded-* wins over the socket-level host (reverse proxies)');
  okc(askedFrom({ host: 'evil.example/phish?x=' }, 'https').startsWith('/p/'), 'a Host header that is not a plain host[:port] yields the RELATIVE path, never junk');
  okc(pg.list()[0].url === '/p/' + pg.list()[0].id, 'NO request and no publicUrl ⇒ relative path (the honest answer; the browser joins location.origin)');
  okc(!JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir3, 'published-pages.json'), 'utf8'))).includes('hintOrigin'), 'NEGATIVE: no remembered origin is persisted at all');
  const app3 = express(); app3.use(express.json()); pg.registerRoutes(app3);
  const srv3 = app3.listen(0); await new Promise((r) => srv3.on('listening', r));
  const base3 = `http://127.0.0.1:${srv3.address().port}`;
  let res3 = await fetch(`${base3}/p/${r1.page.id}/raw`);
  okc(res3.status === 200 && /sandbox/.test(res3.headers.get('content-security-policy') || ''), 'content-published pages serve under the same CSP sandbox');
  res3 = await fetch(`${base3}/api/pages?sessionId=sess-1-1`);
  const lst = await res3.json();
  okc(lst.pages[0].url.startsWith('http://127.0.0.1:'), 'over HTTP the URL is absolute on the requesting browser\'s own origin');
  okc(lst.pages.length === 1 && lst.pages[0].id === r1.page.id, 'GET /api/pages?sessionId= filters (the status-bar chip list)');
  const lst2 = await (await fetch(`${base3}/api/pages?sessionId=sess-9-9&conversationId=conv-1`)).json();
  okc(lst2.pages.length === 1 && lst2.pages[0].id === r1.page.id, 'a resumed window (new session id) still finds the page by conversationId (review-caught)');
  srv3.close();
  fs.rmSync(dir3, { recursive: true, force: true });
}

// 9. design-flow wiring pins (2.366.0)
{
  const read2 = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const sv = read2('server.js');
  okc(sv.includes("onPublished: (page) =>") && sv.includes("type: 'page-published'"), 'server.js: onPublished broadcasts page-published to the publishing session (ONE notify point)');
  okc(sv.includes('getPublishedPages: () => publishedPages, ') && !/designKit|design-kit\.js/.test(sv), 'server.js hands publishedPages to the agent routes as a LAZY getter (created later in the file — TDZ at boot otherwise; caught by the design-flow E2E); the Claude CLI kit is no longer created or handed over (lane design-docs)');
  const ar = read2('src/agent-routes.js');
  okc(ar.includes("'/api/agent/pages/publish'") && ar.includes("express.raw({ type: () => true, limit: '25mb' })"), 'agent publish route takes the raw HTML body (remote hosts upload content)');
  okc(ar.includes("token.startsWith('jbt_')") && ar.includes('const pageAuth'), 'agent publish accepts session (vsst_) and job (jbt_) tokens');
  okc(ar.includes('job.owner && job.owner.conversation && job.owner.conversation.id'), 'job tokens attribute to the job\'s OWNER conversation (the jobs.js field shape — review-caught)');
  okc(ar.includes("if (!a.sessionId && !a.conversationId) return res.json({ pages: [] })"), 'a scope-less caller lists nothing (no all-pages oracle — review-caught)');
  okc(ar.includes("(q.public === undefined || q.public === '') ? undefined"), 'republish without an explicit public flag keeps the user\'s visibility choice (review-caught)');
  const cli = read2('data/bin/vibespace-page');
  okc(!cli.includes('host: os.hostname()') && cli.includes("if (has('--public')) q.set('public', '1')"), 'CLI sends public only when asked and no host param (the session\'s host is authoritative)');
  okc(ar.includes("pages: 'pages-manual.md'") && fs.existsSync(path.join(REPO, 'docs/agent/pages-manual.md')), 'vibespace-docs pages manual registered');
  okc(ar.includes('Other self-contained HTML: `vibespace-page publish` (vibespace-docs pages)') && ar.includes('`vibespace-design new <slug>`') && !ar.includes('vibespace-page kit') && !ar.includes('/api/agent/design-kit'), 'tools intro teaches vibespace-design for designs and vibespace-page for any other HTML; no kit verb, no kit route (lane design-docs)');
  const sb = read2('src/lib/chat-status-bar.js');
  okc(sb.includes('chat-status-design') && sb.includes('_renderDesignPopover') && sb.includes('onDesignRequest'), 'status bar: design chip + popover');
  // lane design-window (2026-10-02): the Claude CLI kit is gone from the chip — no kit status line, no Retry, and
  // Create is never disabled (there is no kit to wait for); the popover lists this session's designs (GET
  // /api/designs) — Open = the Design window, Publish… = its dialog — above the published pages
  okc(!sb.includes('/api/design-kit/') && !sb.includes('chat-design-kit') && !/\bgo\.disabled\b/.test(sb), 'popover: no design-kit status line, no Retry, Create never disabled');
  okc(sb.includes("designs.className = 'chat-design-designs'") && sb.includes('_designRow(d)') && sb.includes('this._onOpenDesign?.(d)') && sb.includes('this._onPublishDesign?.(d)') && sb.includes('setDesigns(designs)'), 'popover lists this session\'s designs (Open · Publish…) above the pages');
  okc(sb.indexOf('box.appendChild(designs)') > 0 && sb.indexOf('box.appendChild(designs)') < sb.indexOf('box.appendChild(list)'), 'the designs come before the pages list');
  const cv = read2('src/lib/chat-view.js');
  okc(cv.includes('`[VibeSpace design request] ${b} — Make it with vibespace-design (manual: vibespace-docs design): new → write plain-HTML artboards under the printed dir → add → check; say the directory.${pub ? \' [--public requested]\' : \'\'}`'), 'chat-view composes a VISIBLE design request in the contract\'s words (vibespace-design, its manual named in the text, [--public requested] only when asked)');
  okc(!cv.includes('vibespace-page kit') && !cv.includes('SKILL.md'), 'the request no longer routes through the Claude CLI kit');
  okc(cv.includes("fetchJson('/api/designs?sessionId=' + encodeURIComponent(this.sessionId)") && cv.includes("msg.type === 'designs-updated'") && cv.includes('this.app.openDesign({ host: d.host || \'\', dir: d.dir, sessionId: this.sessionId })'), 'chat-view: the designs list (initial + designs-updated) and Open = the Design window on THIS live session');
  okc(cv.includes("msg.type === 'page-published'") && cv.includes('_loadPages()'), 'chat-view: live page-published + initial list');
  okc(read2('public/chat.css').includes('.chat-status-design'), 'chip styled');
  okc(read2('src/lib/i18n-zh.js').includes("'Create design'") && read2('src/lib/i18n-ja.js').includes("'Create design'"), 'dictionaries carry the popover strings');
}

// 10. wiring pins (the unstaged-wiring class)
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
ok('auth.js exempts /p/ (per-page gate doctrine)', read('src/auth.js').includes("p.startsWith('/p/')"));
ok('server.js wires create + registerRoutes', read('server.js').includes("published-pages.js').create") && read('server.js').includes('publishedPages.registerRoutes(app)'));
const fe = read('src/lib/file-explorer-ops.js');
ok('explorer offers Publish page… for local html', /Publish page(…|\\u2026)/.test(fe) && fe.includes('_publishPageDialog'));
ok('explorer dialog hits the pages API', fe.includes("'/api/pages/publish'") && fe.includes('/api/pages/by-path'));
// 2.367.3: the dialog no longer joins location.origin ITSELF — utils.absUrl
// does, preferring the instance's mapped public address (test-public-links
// owns that behaviour; here we only pin that the dialog delegates).
ok('dialog delegates link building to the shared helper (mapped instance URL, else browser origin)', fe.includes('absUrlShared') && !/location\.origin\s*\+/.test(fe));
const cr = read('src/lib/chat-renderers.js');
ok('Background Work sender-click opens the jobs panel (not a session lookup)', cr.includes("^Background Work · ") && cr.includes('openJobs'));

// 11. B-f694 (2026-10-01, 生活方式助手: a public page could only be overwritten by a placeholder — taking one down
//     lived in the UI): the publishing agent unpublishes its OWN page or flips its visibility. "Own" = the list scope
//     (its session or conversation); the ref = page id, /p/ link or the published file's path. Over the REAL agent
//     routes + the REAL module, then the REAL CLI against them on a real express app.
{
  const { setupAgentRoutes } = require(path.join(REPO, 'src/agent-routes.js'));
  const dir11 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pages11-'));
  let authed11 = false;
  const pg = require(path.join(REPO, 'src/server/published-pages.js')).create({ dataDir: dir11, requestAuthed: () => authed11, publicUrl: () => null });
  const sessA = { agentToken: 'vsst_A', backend: 'claude', claudeSessionId: 'conv-A', cwd: srcDir, name: 'a' };
  const sessB = { agentToken: 'vsst_B', backend: 'claude', claudeSessionId: 'conv-B', cwd: srcDir, name: 'b' };
  const app11 = express();
  app11.use(express.json());
  pg.registerRoutes(app11);
  setupAgentRoutes({
    app: app11, activeSessions: new Map([['sA', sessA], ['sB', sessB]]), tasks: { get: () => null, groupsOfSession: () => [] },
    sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => {} },
    SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
    userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: (s, sid) => `claude:${sid}`, serverSetting: () => undefined, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null,
    getPublishedPages: () => pg,
  });
  const srv11 = app11.listen(0);
  await new Promise((r) => srv11.on('listening', r));
  const b11 = `http://127.0.0.1:${srv11.address().port}`;
  const api = (tok, p, body) => fetch(b11 + p, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));
  const pubA = await fetch(`${b11}/api/agent/pages/publish?path=${encodeURIComponent('/w/a.html')}&title=A&public=1`, { method: 'POST', headers: { Authorization: 'Bearer vsst_A', 'Content-Type': 'text/html' }, body: '<p>a</p>' }).then((r) => r.json());
  const idA = pubA.page && pubA.page.id;
  okc(!!idA && pubA.page.public === true, 'B-f694: A published a public page', JSON.stringify(pubA));
  let r = await api('vsst_B', '/api/agent/pages/unpublish', { ref: idA });
  okc(r.status === 404 && /pages this conversation published/.test(r.j.error || '') && pg.list().some((p) => p.id === idA), 'B-f694: another conversation cannot unpublish it (404, "not among yours" — no oracle) and the page stays', JSON.stringify(r));
  r = await api('vsst_B', '/api/agent/pages/visibility', { ref: idA, visibility: 'private' });
  okc(r.status === 404 && pg.list().find((p) => p.id === idA).public === true, 'B-f694: …nor flip its visibility', JSON.stringify(r));
  // verify r1: the Pages list's own routes are the USER's — another conversation's vsst_ (or a jbt_) took a page down or
  // made it public there with no ownership check and no ask (auth is off on an instance without a password)
  const ui = (tok, p, method, body) => fetch(b11 + p, { method, headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (x) => ({ status: x.status, j: await x.json().catch(() => ({})) }));
  r = await ui('vsst_B', `/api/pages/${idA}`, 'POST', { public: false });
  okc(r.status === 403 && r.j.code === 'agent_forbidden' && /vibespace-page visibility/.test(r.j.error || '') && pg.list().find((p) => p.id === idA).public === true, 'B-f694 r1: an agent token on the Pages list\'s POST /api/pages/:id is refused by name (403) — the page keeps its visibility', JSON.stringify(r));
  r = await ui('vsst_B', `/api/pages/${idA}`, 'DELETE');
  const r2 = await ui('jbt_x', `/api/pages/${idA}`, 'DELETE');
  okc(r.status === 403 && r2.status === 403 && /vibespace-page unpublish/.test(r.j.error || '') && pg.list().some((p) => p.id === idA), 'B-f694 r1: …and on its DELETE (a vsst_ and a jbt_) — the page stays', JSON.stringify([r, r2]));
  r = await ui('vsst_B', '/api/pages/publish', 'POST', { path: path.join(srcDir, 'canvas.html'), public: true });
  okc(r.status === 403 && /vibespace-page publish/.test(r.j.error || '') && !pg.list().some((p) => p.srcPath === path.join(srcDir, 'canvas.html')), 'B-f694 r1: …and on the Pages dialog\'s publish (a server file made public with no ask)', JSON.stringify(r));
  r = await ui(null, `/api/pages/${idA}`, 'POST', { public: true });
  okc(r.status === 200 && r.j.page && r.j.page.public === true, 'B-f694 r1: the user (no agent token) keeps the Pages list\'s controls', JSON.stringify(r));
  r = await api('vsst_A', '/api/agent/pages/visibility', { ref: '/w/a.html', visibility: 'private' });
  authed11 = false;
  okc(r.status === 200 && r.j.page && r.j.page.public === false && (await fetch(`${b11}/p/${idA}`)).status === 401, 'B-f694: A makes it private by the file path — an unauthenticated viewer now gets 401', JSON.stringify(r));
  const rep = await fetch(`${b11}/api/agent/pages/publish?path=${encodeURIComponent('/w/a.html')}&title=A`, { method: 'POST', headers: { Authorization: 'Bearer vsst_A', 'Content-Type': 'text/html' }, body: '<p>a2</p>' }).then((x) => x.json());
  okc(rep.page && rep.page.id === idA && rep.page.public === false, 'B-f694: a republish without --public keeps the private visibility (same URL)', JSON.stringify(rep));
  r = await api('vsst_A', '/api/agent/pages/visibility', { ref: `https://inst.example/p/${idA}`, visibility: 'public' });
  okc(r.status === 200 && r.j.page.public === true && (await fetch(`${b11}/p/${idA}`)).status === 200, 'B-f694: …and public again by its /p/ link', JSON.stringify(r));
  r = await api('vsst_A', '/api/agent/pages/visibility', { ref: idA, visibility: 'everyone' });
  okc(r.status === 400 && /public or private/.test(r.j.error || ''), 'B-f694: a visibility other than public|private is refused by name', JSON.stringify(r));
  r = await api('vsst_A', '/api/agent/pages/unpublish', { ref: idA });
  const gone = await fetch(`${b11}/p/${idA}`);
  okc(r.status === 200 && r.j.page && r.j.page.id === idA && gone.status === 410 && /unpublished/.test(await gone.text()) && !pg.list().some((p) => p.id === idA), 'B-f694: A unpublishes its page — the link answers 410 "unpublished", the list no longer has it', JSON.stringify(r));
  r = await api('vsst_A', '/api/agent/pages/unpublish', { ref: idA });
  okc(r.status === 404, 'B-f694: a second unpublish is 404 (nothing left to take down)', JSON.stringify(r));
  const pg2 = require(path.join(REPO, 'src/server/published-pages.js')).create({ dataDir: dir11, requestAuthed: () => true, publicUrl: () => null });
  const app12 = express(); pg2.registerRoutes(app12);
  const srv12 = app12.listen(0); await new Promise((x) => srv12.on('listening', x));
  okc((await fetch(`http://127.0.0.1:${srv12.address().port}/p/${idA}`)).status === 410 && (await fetch(`http://127.0.0.1:${srv12.address().port}/p/pgzzzzzzzzzz`)).status === 404, 'B-f694: the 410 survives a restart; an id never published stays 404');
  srv12.close();
  // the REAL CLI against the real routes
  const { execFile } = await import('node:child_process');
  const cli = (tok, args) => new Promise((resolve) => execFile(process.execPath, [path.join(REPO, 'data/bin/vibespace-page'), ...args], { cwd: srcDir, env: { ...process.env, VIBESPACE_API: b11, VIBESPACE_SESSION_TOKEN: tok }, timeout: 15000 }, (err, so, se) => resolve({ code: err ? (err.code ?? 1) : 0, out: String(so) + String(se) })));
  let c = await cli('vsst_A', ['publish', 'canvas.html', '--title', 'Canvas', '--public']);
  const idC = (/\/p\/(pg[a-z0-9]{10})/.exec(c.out) || [])[1];
  okc(c.code === 0 && !!idC, 'B-f694 CLI: publish (relative path) prints the /p/ path', c.out);
  c = await cli('vsst_A', ['visibility', 'canvas.html', 'private']);
  okc(c.code === 0 && /private/.test(c.out) && pg.list().find((p) => p.id === idC).public === false, 'B-f694 CLI: `visibility canvas.html private` (the same relative path) flips it', c.out);
  c = await cli('vsst_A', ['visibility', 'canvas.html', 'open']);
  okc(c.code === 2 && /public\|private/.test(c.out), 'B-f694 CLI: a visibility word other than public|private is a usage error', c.out);
  c = await cli('vsst_B', ['unpublish', idC]);
  okc(c.code === 1 && /pages this conversation published/.test(c.out) && pg.list().some((p) => p.id === idC), 'B-f694 CLI: another conversation\'s unpublish is refused with the server\'s line', c.out);
  c = await cli('vsst_A', ['unpublish', `/p/${idC}`]);
  okc(c.code === 0 && /unpublished/.test(c.out) && !pg.list().some((p) => p.id === idC), 'B-f694 CLI: `unpublish /p/<id>` takes it down', c.out);
  c = await cli('vsst_A', ['help']);
  okc(/vibespace-page unpublish/.test(c.out) && /vibespace-page visibility/.test(c.out), 'B-f694 CLI: the usage names both verbs', c.out);
  const man = fs.readFileSync(path.join(REPO, 'docs/agent/pages-manual.md'), 'utf8');
  okc(/## unpublish/.test(man) && /## visibility/.test(man) && /410/.test(man), 'B-f694: the pages manual documents unpublish (410) and visibility');
  // the Pages list in the chat status bar carries the same verb (visibility was already there)
  const sb = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
  const row = sb.slice(sb.indexOf('  _designPageRow(p) {'), sb.indexOf('  _fmtElapsed(ms) {'));
  okc(/t\('Unpublish'\)/.test(row) && /showConfirmDialog\(/.test(row) && /method: 'DELETE'/.test(row) && /notePagePublished\(\{ \.\.\.page, removed: true \}\)/.test(row) && /const page = \{ \.\.\.p \}[^\n]*\n\s*if \(!await showConfirmDialog\(/.test(row), 'B-f694 UI: the Pages row offers Unpublish behind a confirm (DELETE, the row leaves at once)');
  srv11.close();
  fs.rmSync(dir11, { recursive: true, force: true });
}

// 12. lane design-present (design 003 §2.6): a design PRESENTS from its link. The shell lets its frame go fullscreen
//     and hands it EXACTLY `#present` (a fragment never reaches a server — the raw page can only learn it from the
//     shell); the published design carries present (▶, #present, its words) inside its one file — size printed.
{
  const vm = await import('node:vm');
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  authed = true;
  const pgR = pages.publishContent({ html: '<html><body>d</body></html>', name: 'deck', srcKey: 'local:/designs/deck' });
  const sh = await (await fetch(`${base}/p/${pgR.page.id}`)).text();
  okc(/<iframe src="\/p\/pg[a-z0-9]{10}\/raw" sandbox="allow-scripts allow-popups allow-downloads allow-modals allow-forms allow-popups-to-escape-sandbox" allow="clipboard-write; fullscreen"/.test(sh), 'lane design-present: the shell lets its frame go fullscreen (a design presents full-screen from its link) — the sandbox list unchanged, never allow-same-origin');
  // the shell's own script, run with a stand-in page: which address does its frame end up loading?
  const runShell = (html, hash) => {
    const script = (/<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html) || [])[1] || '';
    const frame = { src: '/p/X/raw', getAttribute: (n) => (n === 'src' ? '/p/X/raw' : null), addEventListener() {}, contentWindow: { postMessage() {} } };
    vm.runInNewContext(script, { document: { querySelector: () => frame }, location: { hash, pathname: '/p/X' }, navigator: {}, addEventListener() {}, window: {}, setTimeout });
    return frame.src;
  };
  const HASHES = ['#present', '', '#Present', '#present?x=1', '#presentx', '#/../../api/x', '#present#present'];
  const WANT = ['/p/X/raw#present', '/p/X/raw', '/p/X/raw', '/p/X/raw', '/p/X/raw', '/p/X/raw', '/p/X/raw'];
  const table = (html) => HASHES.map((h) => runShell(html, h));
  okc(JSON.stringify(table(sh)) === JSON.stringify(WANT), 'the shell hands its frame EXACTLY #present — any other fragment stays with the shell', table(sh));
  // CONTROL: a shell that hands over any fragment
  const C = mutantCopies('pages-present', REPO);
  const PREL = 'src/server/published-pages.js';
  const psrc = fs.readFileSync(path.join(REPO, PREL), 'utf8');
  const a = `if(location.hash==='#present')f.src=f.getAttribute('src')+'#present';`;
  if (psrc.split(a).length !== 2) okc(false, 'CONTROL setup: the shell\'s #present line is in the module exactly once', a);
  else {
    const dirM = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pages-present-'));
    const PM = C.load(PREL, psrc.replace(a, `if(location.hash)f.src=f.getAttribute('src')+location.hash;`), 'any-hash');
    const pm = PM.create({ dataDir: dirM, requestAuthed: () => true, publicUrl: () => 'https://inst.example' });
    const appM = express(); pm.registerRoutes(appM);
    const srvM = appM.listen(0); await new Promise((r) => srvM.on('listening', r));
    const pg = pm.publishContent({ html: '<html><body>m</body></html>', name: 'm', srcKey: 'local:/m' });
    const shM = await (await fetch(`http://127.0.0.1:${srvM.address().port}/p/${pg.page.id}`)).text();
    okc(JSON.stringify(table(sh)) === JSON.stringify(WANT) && JSON.stringify(table(shM)) !== JSON.stringify(WANT), 'CONTROL (the shell hands over ANY fragment): the real shell passes the table, the patched copy FAILS it', table(shM));
    srvM.close();
    fs.rmSync(dirM, { recursive: true, force: true });
  }
  for (const r of copiesCensus(C.files, C.dir, REPO, { minCopies: 1, label: '12 ' })) okc(r.pass, r.name, r.detail);
  // the published design with present: the runtime built in-process exactly as npm run build builds it
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
  const js = esbuild.buildSync({ entryPoints: [path.join(REPO, 'src/design-viewer-entry.js')], bundle: true, minify: true, write: false, format: 'iife', platform: 'browser', target: 'es2020' }).outputFiles[0].text;
  const DM = require(path.join(REPO, 'src/design-model.js'));
  const deck = DM.bundleCanvas({ manifest: { title: 'Deck', artboards: [{ file: 'S1.html', x: 0, y: 0, w: 1280, h: 720 }, { file: 'S2.html', x: 1360, y: 0, w: 1280, h: 720 }] }, files: { 'S1.html': '<!doctype html><html><body>one</body></html>', 'S2.html': '<!doctype html><html><body>two</body></html>' }, runtimeJs: js });
  const bytes = Buffer.byteLength(deck, 'utf8');
  console.log(`  · a published 2-artboard design with present: ${(bytes / 1024).toFixed(1)} KB (its runtime ${(Buffer.byteLength(js, 'utf8') / 1024).toFixed(1)} KB, inlined)`);
  const esc = (w) => w.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).toLowerCase();
  const has = (w) => deck.includes(w) || deck.toLowerCase().includes(esc(w));
  okc(DM.readBundle(deck).ok && has('dv-present') && has('#present') && has('dc-present-bar') && ['Present', 'End the presentation', '演示', '结束演示', 'プレゼン', 'プレゼンを終了'].every(has), 'a published design carries present inside its ONE file (▶, #present, the canvas core\'s present chrome, the words in en / zh / ja)');
  const sv = DM.sizeVerdict(bytes);
  okc(sv.ok && !sv.warn && bytes < 100 * 1024, `…and stays small (${(bytes / 1024).toFixed(1)} KB for two artboards; the warning is at 8 MB)`);
}

srv.close();
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(srcDir, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
