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
ok('shell carries NO user content (only the frame)', !shell.includes('v1'));
ok('shell is NOT sandboxed (real origin — that is the whole point)', !/sandbox/.test(shellCsp), shellCsp);
ok('shell CSP allows only its own frame', /frame-src 'self'/.test(shellCsp) && /default-src 'none'/.test(shellCsp), shellCsp);
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
ok('deleted page 404s', res.status === 404);
ok('deleted page 404s on /raw too', (await fetch(`${base}/p/${id}/raw`)).status === 404);
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
  okc(sv.includes('getPublishedPages: () => publishedPages, getDesignKit: () => designKit'), 'server.js hands publishedPages + designKit to the agent routes as LAZY getters (created later in the file — TDZ at boot otherwise; caught by the design-flow E2E)');
  const ar = read2('src/agent-routes.js');
  okc(ar.includes("'/api/agent/pages/publish'") && ar.includes("express.raw({ type: () => true, limit: '25mb' })"), 'agent publish route takes the raw HTML body (remote hosts upload content)');
  okc(ar.includes("token.startsWith('jbt_')") && ar.includes('const pageAuth'), 'agent publish accepts session (vsst_) and job (jbt_) tokens');
  okc(ar.includes('job.owner && job.owner.conversation && job.owner.conversation.id'), 'job tokens attribute to the job\'s OWNER conversation (the jobs.js field shape — review-caught)');
  okc(ar.includes("if (!a.sessionId && !a.conversationId) return res.json({ pages: [] })"), 'a scope-less caller lists nothing (no all-pages oracle — review-caught)');
  okc(ar.includes("(q.public === undefined || q.public === '') ? undefined"), 'republish without an explicit public flag keeps the user\'s visibility choice (review-caught)');
  const cli = read2('data/bin/vibespace-page');
  okc(!cli.includes('host: os.hostname()') && cli.includes("if (has('--public')) q.set('public', '1')"), 'CLI sends public only when asked and no host param (the session\'s host is authoritative)');
  okc(ar.includes("pages: 'pages-manual.md'") && fs.existsSync(path.join(REPO, 'docs/agent/pages-manual.md')), 'vibespace-docs pages manual registered');
  okc(ar.includes('vibespace-page kit') && ar.includes('vibespace-docs pages'), 'tools intro teaches vibespace-page');
  const sb = read2('src/lib/chat-status-bar.js');
  okc(sb.includes('chat-status-design') && sb.includes('_renderDesignPopover') && sb.includes('onDesignRequest'), 'status bar: design chip + popover');
  okc(sb.includes("fetchJson('/api/design-kit/status')"), 'popover shows the kit status (failures are visible, not silent)');
  const cv = read2('src/lib/chat-view.js');
  okc(cv.includes('[VibeSpace design request]') && cv.includes('vibespace-page kit') && cv.includes('vibespace-page publish'), 'chat-view composes a VISIBLE design request routed through vibespace-page');
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
ok('dialog joins relative URLs with the browser origin (Copy link always shareable)', fe.includes('location.origin'));
const cr = read('src/lib/chat-renderers.js');
ok('Background Work sender-click opens the jobs panel (not a session lookup)', cr.includes("^Background Work · ") && cr.includes('openJobs'));

srv.close();
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(srcDir, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
