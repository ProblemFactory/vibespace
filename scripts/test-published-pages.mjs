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
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const express = require(path.join(REPO, 'node_modules/express'));

let pass = 0, fail = 0;
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
res = await fetch(`${base}/p/${id}`);
const csp = res.headers.get('content-security-policy') || '';
ok('authed viewer gets the page', res.status === 200 && (await res.text()).includes('v1'));
ok('CSP sandbox header present (opaque origin — the XSS guard)', /sandbox/.test(csp) && /allow-scripts/.test(csp), csp);
ok('sandbox does NOT grant allow-same-origin (cookie isolation)', !/allow-same-origin/.test(csp), csp);

// 2b. review-caught belts: browser viewers get the login redirect, private = no-store
res = await fetch(`${base}/p/${id}`, { headers: { accept: 'text/html' }, redirect: 'manual' });
authed = false;
res = await fetch(`${base}/p/${id}`, { headers: { accept: 'text/html' }, redirect: 'manual' });
ok('logged-out BROWSER viewer of a private page → /login redirect (no dead-end 401)', res.status === 302 && (res.headers.get('location') || '').includes('/login'), String(res.status));
authed = true;
res = await fetch(`${base}/p/${id}`);
ok('private page is no-store (never cached for shared machines)', (res.headers.get('cache-control') || '') === 'no-store');

// 3. public toggle → unauthed 200
pages.setFlags(id, { makePublic: true });
authed = false;
res = await fetch(`${base}/p/${id}`);
ok('public page serves without login', res.status === 200);

// 4. upsert: republishing the same source keeps the id + serves new content
fs.writeFileSync(srcFile, '<!doctype html><title>v2</title>');
const r2 = pages.publish({ srcPath: srcFile });
ok('re-publish upserts the SAME id (stable share URL)', r2.page.id === id, `${r2.page?.id} vs ${id}`);
res = await fetch(`${base}/p/${id}`);
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
ok('store empty after delete', pages.list().length === 0);

// 7. store round-trips across instances (restart survival)
pages.publish({ srcPath: srcFile, name: 'again' });
const pages2 = require(path.join(REPO, 'src/server/published-pages.js')).create({ dataDir: dir, requestAuthed: () => true, publicUrl: () => null });
ok('a fresh instance reloads the persisted store', pages2.list().length === 1 && pages2.list()[0].name === 'again');

// 8. wiring pins (the unstaged-wiring class)
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
