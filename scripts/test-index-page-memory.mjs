#!/usr/bin/env node
// THE PAGE'S SHELL FROM MEMORY (unit interface-trial, phase 1 (g) G1): GET / answers the versioned index.html with NO disk
// call on the request path (src/server/index-page.js); the base read index.html and stated every js / css asset per load.
//   ① the copy is the page's own: every local js / css asset versioned `?v=<mtime>`, a missing asset left plain
//   ② THE COUNT: 60 loads after the first make 0 synchronous fs calls
//   ③ A STALL PLACED UNDER THE READS (the storage answers in 100 ms): a 20 ms timer set before a load fires on time while
//     the module answers from memory and refreshes in the background; the RED CONTROL — the base's handler, verbatim,
//     over the same storage (its reads synchronous) — holds that timer ≥ 90 ms
//   ④ a rebuilt asset shows on the load after the one that found the copy older than REFRESH_MS — never later
//   ⑤ a build that fails keeps the last good copy; with none, the route passes on (null)
//   ⑥ server.js's route: indexPage.get(), and no readFileSync / statSync left in it
//   The cure round (主开发 2026-11-16 23:09Z):
//   ⑦ A1 — A PAGE OPEN MAKES NO SYNCHRONOUS FILE CALL: server.js's own lines (the page builder, the route, the static
//     layer) under express, GET / and then every stamped file the page names (the bundle and the diagram script carry a
//     `?v=` the static layer checks): 0 synchronous fs calls; the RED CONTROL — the base's handler and the base's stamp
//     check under the same counter — makes them
//   ⑧ A2 — a throw while answering falls to the static files (the unstamped page), as the base's one try did; MUTANT (the
//     try cut from server.js's route) ⇒ the request gets no answer
//   ⑨ A3 — a build that never answers is given up at the deadline: the last good copy serves, a later load tries again,
//     a page with no copy answers null (the static file) instead of waiting for ever; a failed build is said ONCE per
//     change of state (failing, then good again), never per load
// PURE + in-process; a scratch public dir under os.tmpdir().
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const IP = require(path.join(REPO, 'src/server/index-page.js'));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const block = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);   // a synchronous storage that takes `ms`

const PUB = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-index-page-'));
process.on('exit', () => { try { fs.rmSync(PUB, { recursive: true, force: true }); } catch { } });
fs.writeFileSync(path.join(PUB, 'index.html'), '<html><head><link rel="stylesheet" href="/style.css"><script src="/bundle.js"></script><script src="/gone.js"></script><img src="/logo.png"></head></html>');
fs.writeFileSync(path.join(PUB, 'bundle.js'), '1'); fs.writeFileSync(path.join(PUB, 'style.css'), 'a{}');
const mt = (f) => Math.floor(fs.statSync(path.join(PUB, f)).mtimeMs);
const mt2 = (f) => Math.floor(fs.statSync(path.join(ROOT, 'public', f)).mtimeMs);

/** THE BASE'S HANDLER, VERBATIM (d7f42cc21 server.js:166-177) — the RED control's body, its fs handed in. */
function baseHandler(fsSync, pub) {
  let html = fsSync.readFileSync(path.join(pub, 'index.html'), 'utf-8');
  html = html.replace(/(href|src)="\/([^"?]+\.(?:js|css))"/g, (m, attr, file) => {
    try { return `${attr}="/${file}?v=${Math.floor(fsSync.statSync(path.join(pub, file)).mtimeMs)}"`; }
    catch { return m; }
  });
  return html;
}
/** the 20 ms timer's lateness while `load()` runs: set first, then the load, then wait for the timer */
async function lateness(load) {
  const t0 = performance.now();
  const fired = new Promise((r) => setTimeout(() => r(performance.now() - t0 - 20), 20));
  await load();
  return fired;
}

console.log('— ① the copy is the page\'s own');
{
  const p = IP.create({ pubDir: PUB });
  const html = await p.get();
  ok(html.includes(`href="/style.css?v=${mt('style.css')}"`) && html.includes(`src="/bundle.js?v=${mt('bundle.js')}"`), 'every local js / css asset versioned by its mtime', html);
  ok(html.includes('src="/gone.js"') && html.includes('src="/logo.png"'), 'a missing asset and a non-js/css one stay as written');
  ok(html === baseHandler(fs, PUB), 'byte for byte the base handler\'s page');
}

console.log('— ② THE COUNT: no synchronous fs call on the request path');
{
  const p = IP.create({ pubDir: PUB });
  await p.get();
  let n = 0; const saved = {};
  for (const k of Object.keys(fs)) if (/Sync$/.test(k) && typeof fs[k] === 'function') { saved[k] = fs[k]; fs[k] = (...a) => { n++; return saved[k](...a); }; }
  try { for (let i = 0; i < 60; i++) await p.get(); } finally { Object.assign(fs, saved); }
  ok(n === 0, `60 loads after the first: ${n} synchronous fs calls`);
}

console.log('— ③ A STALL PLACED UNDER THE READS (the storage answers in 100 ms)');
{
  const slowAsync = { readFile: async (...a) => { await sleep(100); return fs.promises.readFile(...a); }, stat: async (...a) => { await sleep(100); return fs.promises.stat(...a); } };
  let t = 0;
  const p = IP.create({ pubDir: PUB, fsp: slowAsync, refreshMs: 100, now: () => t });
  await p.get();             // the first copy (built over the slow storage)
  t += 1000;                 // older than REFRESH_MS: this load starts a background refresh over the slow storage
  const late = await lateness(() => p.get());
  ok(late < 50, `a load while the copy refreshes over a 100 ms storage: the 20 ms timer is ${Math.round(late)} ms late (< 50)`);
  const slowSync = { readFileSync: (...a) => { block(100); return fs.readFileSync(...a); }, statSync: (...a) => { block(100); return fs.statSync(...a); } };
  const lateBase = await lateness(async () => baseHandler(slowSync, PUB));
  ok(lateBase >= 90, `RED CONTROL — the base's handler over the same storage holds the timer ${Math.round(lateBase)} ms (≥ 90: read + stats on the loop)`);
}

console.log('— ④ a rebuilt asset shows on the load after the one that noticed');
{
  let t = 0;
  const p = IP.create({ pubDir: PUB, refreshMs: 5000, now: () => t });
  const first = await p.get();
  const was = mt('bundle.js');
  fs.utimesSync(path.join(PUB, 'bundle.js'), new Date(), new Date(Date.now() + 60000));
  const now1 = mt('bundle.js');
  t += 1000; ok((await p.get()) === first, 'inside REFRESH_MS: the same copy (no refresh asked)');
  t += 5000; const noticed = await p.get(); await p.refresh();
  ok(noticed === first && (await p.get()).includes(`bundle.js?v=${now1}`) && now1 !== was, `the load that noticed answers the old copy; the next carries the new mtime (${was} → ${now1})`);
}

console.log('— ⑤ a failed build');
{
  let bad = false;
  const flaky = { readFile: async (...a) => { if (bad) throw new Error('EIO'); return fs.promises.readFile(...a); }, stat: (...a) => fs.promises.stat(...a) };
  let t = 0;
  const p = IP.create({ pubDir: PUB, fsp: flaky, refreshMs: 10, now: () => t, log: { log() { }, warn() { } } });
  const good = await p.get(); bad = true; t += 100; await p.get(); await p.refresh();
  ok((await p.get()) === good, 'a refresh that fails keeps the last good copy');
  const none = IP.create({ pubDir: path.join(PUB, 'nope'), log: { log() { }, warn() { } } });
  ok((await none.get()) === null, 'no copy at all ⇒ null (the route passes on to the static files, as the base\'s catch did)');
}

console.log('— ⑥ server.js\'s route');
{
  const src = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8');
  const i = src.indexOf("app.get(['/', '/index.html']"), j = src.indexOf('\n});', i);
  const route = i >= 0 && j > i ? src.slice(i, j) : '';
  ok(/indexPage\.get\(\)/.test(route) && !/readFileSync|statSync/.test(route) && /require\('\.\/src\/server\/index-page\.js'\)\.create/.test(src), 'GET / answers indexPage.get(); no readFileSync / statSync in the route', route.slice(0, 300));
  ok(/res\.set\(\.\.\.cspReports\.header\(\)\)/.test(route) && /Cache-Control', 'no-cache'/.test(route), 'its headers as before (no-cache, the CSP report-only header)');
  ok(/try \{[^\n]*\n\s*res\.set\('Cache-Control'/.test(route) && /\} catch \{ next\(\); \}/.test(route), 'the answer inside one try that falls to next() (A2)');
}

const quiet = { log() { }, warn() { } };
/** server.js's OWN lines, verbatim: the page builder (2), the index route, the static layer — under express, over `root/public` */
const SRV = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8');
const pageLines = SRV.split('\n').filter((l) => l.startsWith("const indexPage = require('./src/server/index-page.js')") || l === 'indexPage.refresh();').join('\n');
const r0 = SRV.indexOf("app.get(['/', '/index.html'], (req, res, next) => {"), r1 = SRV.indexOf('\n});\n', r0) + 5;
const ROUTE = r0 >= 0 ? SRV.slice(r0, r1) : '';
const STATIC = SRV.split('\n').find((l) => l.startsWith("app.use(require('./src/server/static-public.js').create(")) || '';
const express = require(path.join(REPO, 'node_modules', 'express'));
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-index-open-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
fs.mkdirSync(path.join(ROOT, 'public'));
fs.writeFileSync(path.join(ROOT, 'public', 'index.html'), '<html><head><link rel="stylesheet" href="/style.css"><link rel="vs-lazy-bundle" href="/mermaid.js"></head><body><script src="/bundle.js"></script></body></html>');
for (const [f, b] of [['style.css', 'a{}'], ['bundle.js', 'var x=1;'], ['mermaid.js', 'export default 1;']]) fs.writeFileSync(path.join(ROOT, 'public', f), b);
const reqOf = (m) => require(m.startsWith('./') ? path.join(REPO, m) : m);
async function listen(app) { const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); }); return { port: srv.address().port, close: () => new Promise((c) => { srv.closeAllConnections?.(); srv.close(c); }) }; }
const GET = (port, p, ms = 3000) => new Promise((resolve) => {
  const q = http.get({ host: '127.0.0.1', port, path: p, headers: { accept: 'text/html' } }, (x) => { let d = ''; x.on('data', (c) => { d += c; }); x.on('end', () => resolve({ status: x.statusCode, location: x.headers.location, text: d })); });
  q.setTimeout(ms, () => { q.destroy(); resolve({ status: 0, text: '', timedOut: true }); }); q.on('error', () => resolve({ status: 0, text: '' }));
});
/** the hub's own lines over ROOT → {port, close, ip} (`route` = the route text, server.js's unless a mutant's) */
async function hubLines({ route = ROUTE, header = () => ['X-Probe', '1'] } = {}) {
  const app = express();
  const ip = new Function('app', 'require', 'path', 'fs', '__dirname', 'cspReports', `${pageLines}\n${route}\n${STATIC}\nreturn indexPage;`)(app, reqOf, path, fs, ROOT, { header });
  await ip.refresh();   // the boot's warm-up (server.js's own `indexPage.refresh()`), done
  return { ...(await listen(app)), ip };
}
/** THE BASE (70efb5e10), verbatim: its index route's body (baseHandler) and its static layer's stamp check (statSync) */
function baseApp() {
  const app = express(), pub = path.join(ROOT, 'public');
  app.get(['/', '/index.html'], (req, res, next) => { try { res.set('Cache-Control', 'no-cache'); res.type('html').send(baseHandler(fs, pub)); } catch { next(); } });
  const stampOf = (file) => { try { return String(Math.floor(fs.statSync(file).mtimeMs)); } catch { return null; } };
  const files = express.static(pub, { etag: true, lastModified: true, maxAge: 0 });
  app.use((req, res, next) => {
    const v = req.query && req.query.v;
    if ((req.method === 'GET' || req.method === 'HEAD') && ['/bundle.js', '/mermaid.js'].includes(req.path) && typeof v === 'string') {
      const own = stampOf(path.join(pub, req.path.slice(1)));
      if (own && own !== v) { res.set('Cache-Control', 'no-store'); return res.redirect(302, `${req.path}?v=${own}`); }
    }
    return files(req, res, next);
  });
  return app;
}
/** A PAGE OPEN under the counter: GET /, then every stamped file it names → {n, asked, statuses} */
async function pageOpen(port) {
  let n = 0; const saved = {}, asked = [], statuses = [];
  for (const k of Object.keys(fs)) if (/Sync$/.test(k) && typeof fs[k] === 'function') { saved[k] = fs[k]; fs[k] = (...a) => { n++; return saved[k](...a); }; }
  try {
    const page = await GET(port, '/'); statuses.push(page.status);
    for (const m of page.text.matchAll(/(?:href|src)="(\/[^"?]+\?v=\d+)"/g)) { asked.push(m[1]); statuses.push((await GET(port, m[1])).status); }
  } finally { Object.assign(fs, saved); }
  return { n, asked, statuses };
}

console.log('— ⑦ A1: A PAGE OPEN MAKES NO SYNCHRONOUS FILE CALL (server.js\'s own lines under express)');
{
  ok(pageLines.split('\n').length === 2 && /indexPage\.get\(\)/.test(ROUTE) && /\{ stampOf: indexPage\.stampOf \}/.test(STATIC), 'server.js\'s page builder (2 lines), its route on indexPage.get() and its static layer asking the copy\'s stamps — read verbatim', STATIC.slice(0, 160));
  const H = await hubLines();
  const open = await pageOpen(H.port);
  ok(open.n === 0 && open.asked.some((a) => a.startsWith('/bundle.js?v=')) && open.asked.some((a) => a.startsWith('/mermaid.js?v=')) && open.statuses.every((x) => x === 200), `a page open — GET / then ${open.asked.join(' · ')}: ${open.n} synchronous fs calls, every answer 200`, open);
  const stale = await GET(H.port, '/bundle.js?v=1');
  ok(stale.status === 302 && stale.location === `/bundle.js?v=${mt2('bundle.js')}`, `a script asked under ANOTHER build's ?v= still goes to its own stamp (the copy's — ${stale.location})`, stale);
  await H.close();
  const B = await listen(baseApp());
  const base = await pageOpen(B.port);
  ok(base.n > 0 && base.statuses.every((x) => x === 200), `RED CONTROL — the base's handler and stamp check under the same counter: ${base.n} synchronous fs calls on the same page open`, base);
  await B.close();
}

console.log('— ⑧ A2: a throw while answering falls to the static files');
{
  const caught = []; const onRej = (e) => caught.push(String(e && e.message)); process.on('unhandledRejection', onRej);
  const H = await hubLines({ header: () => { throw new Error('the header threw'); } });
  const r = await GET(H.port, '/', 200);
  await sleep(20);
  ok(r.status === 200 && /src="\/bundle\.js"/.test(r.text) && !/\?v=/.test(r.text) && caught.length === 0, 'the CSP header throws ⇒ GET / is answered by the static file (the unstamped page), as the base\'s try did — no unhandled rejection', { status: r.status, text: r.text.slice(0, 120), caught });
  await H.close(); caught.length = 0;
  const cut = ROUTE.replace(/try \{[^\n]*\n/, '').replace(/\n\s*\} catch \{ next\(\); \}/, '');
  const M = await hubLines({ route: cut, header: () => { throw new Error('the header threw'); } });
  const m = await GET(M.port, '/', 200);
  await sleep(20); process.off('unhandledRejection', onRej);
  ok(cut !== ROUTE && m.timedOut === true && caught.length === 1, `MUTANT (the try cut from server.js's route) ⇒ no answer in 200 ms (${caught.length} unhandled rejection)`, { timedOut: m.timedOut, caught });
  await M.close();
}

console.log('— ⑨ A3: a build is bounded; a failure is said once per change');
{
  let hang = false, reads = 0;
  const never = new Promise(() => { });
  const hanging = { readFile: (...a) => { reads++; return hang ? never : fs.promises.readFile(...a); }, stat: (...a) => (hang ? never : fs.promises.stat(...a)) };
  const DL = 40, SLACK = 5;   // the build's deadline in this leg; «for ever» = past the deadline × SLACK
  const keep = setInterval(() => { }, 1000);   // the deadline's timer is unref'd (it never holds a hub's exit): this suite keeps its loop up
  // THE CONTROL measured in this run: a page with NO copy over the same storage waits the deadline, then gets null (the static file)
  const none = IP.create({ pubDir: PUB, fsp: { readFile: () => never, stat: () => never }, deadlineMs: DL, log: quiet });
  const w0 = performance.now(); const got = await Promise.race([none.get(), sleep(DL * SLACK).then(() => 'still waiting')]); const waited = performance.now() - w0;
  ok(got === null, `no copy yet and a storage that never answers: GET / gets null (the static file) once the deadline passes (${Math.round(waited)} ms) — never a wait for ever (${got === null ? 'answered' : got} before ${DL * SLACK} ms)`);
  let t = 0;
  const p = IP.create({ pubDir: PUB, fsp: hanging, refreshMs: 100, deadlineMs: DL, now: () => t, log: quiet });
  const good = await p.get(); hang = true; t += 1000;
  const t0 = performance.now(); const during = await p.get(); const took = performance.now() - t0;
  await sleep(DL + 20); t += 1000; await p.get(); await sleep(5); clearInterval(keep);
  ok(during === good && took * 4 < waited && reads === 3, `the storage stops answering: a load WITH a copy answers the last good copy at once (${took.toFixed(1)} ms — the no-copy control waited ${Math.round(waited)} ms); past the deadline a later load tries again (${reads} reads started: the first, the hung one, the retry)`);
  const lines = []; const log = { log: (l) => lines.push(['good', l]), warn: (l) => lines.push(['bad', l]) };
  let bad = false; let u = 0;
  const flaky = { readFile: async (...a) => { if (bad) throw new Error('EIO'); return fs.promises.readFile(...a); }, stat: (...a) => fs.promises.stat(...a) };
  const q = IP.create({ pubDir: PUB, fsp: flaky, refreshMs: 10, now: () => u, log });
  await q.get(); bad = true;
  for (let i = 0; i < 4; i++) { u += 100; await q.refresh(); }
  const afterFail = lines.length; bad = false; u += 100; await q.refresh(); u += 100; await q.refresh();
  const afterGood = lines.length; bad = true; u += 100; await q.refresh(); u += 100; await q.refresh();
  ok(afterFail === 1 && lines[0][0] === 'bad' && /could not be built \(EIO\)/.test(lines[0][1]) && afterGood === 2 && lines[1][0] === 'good' && lines.length === 3 && lines[2][0] === 'bad', `four failed builds ⇒ ONE line; good again ⇒ ONE line; failing again ⇒ one more (${lines.map((x) => x[0]).join(', ')})`, lines);
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
