#!/usr/bin/env node
// THE BELT — a URL nobody we trust chose is fetched gzip-or-nothing (lane runtime-floor, 2026-10-22; the Node.js security
// releases of 2026-10-21 fixed an out-of-bounds write in the Brotli DECODER, CVE-2026-111497).
//   ① WHY (measured here): the built-in fetch asks gzip, deflate — yet DECODES a `content-encoding: br` answer it never
//     asked for: the server picks the decoder
//   ② src/safe-fetch.js over loopback servers: it asks `accept-encoding: gzip` (a caller's value replaced); gzip unpacked,
//     identity passed; br / deflate / a list REFUSED by name before any decoder; the bounds (bytes), redirects (followed
//     ≤ 5, 303 → GET, authorization dropped across origins, 'error' refuses one), an abort
//   ③ THE CENSUS of every fetch() site in src/server: each file a row {count, class} — vendor-fixed / own (this
//     instance's API) / operator (the instance's own settings) / client (text a browser runs) — and the UNTRUSTED ones
//     (a URL a person or a plugin manifest names) call safeFetch and never fetch(); an unlisted site is RED — RED: a raw
//     fetch planted in plugin-install
// Run: node scripts/test-fetch-encoding.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { safeFetch } = require(path.join(REPO, 'src/safe-fetch.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new Error('ok(cond, name, extra?)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };

// ── one loopback server, one route per shape; `seen` = what each request carried
const seen = [];
const srv = http.createServer((req, res) => {
  seen.push({ url: req.url, ae: req.headers['accept-encoding'] || null, auth: req.headers.authorization || null, method: req.method });
  const body = Buffer.from(`hello ${req.url}`);
  if (req.url === '/br') { res.setHeader('content-encoding', 'br'); return res.end(zlib.brotliCompressSync(body)); }
  if (req.url === '/gzip') { res.setHeader('content-encoding', 'gzip'); return res.end(zlib.gzipSync(body)); }
  if (req.url === '/deflate') { res.setHeader('content-encoding', 'deflate'); return res.end(zlib.deflateSync(body)); }
  if (req.url === '/list') { res.setHeader('content-encoding', 'gzip, br'); return res.end(zlib.brotliCompressSync(zlib.gzipSync(body))); }
  if (req.url === '/big') { res.setHeader('content-encoding', 'gzip'); return res.end(zlib.gzipSync(Buffer.alloc(4 * 1024 * 1024, 65))); }
  if (req.url === '/json') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ a: 1 })); }
  if (req.url === '/hop') { res.statusCode = 302; res.setHeader('location', '/json'); return res.end(); }
  if (req.url === '/away') { res.statusCode = 307; res.setHeader('location', `http://localhost:${srv.address().port}/json`); return res.end(); }
  if (req.url === '/see-other') { res.statusCode = 303; res.setHeader('location', '/json'); return res.end(); }
  if (req.url === '/loop') { res.statusCode = 302; res.setHeader('location', '/loop'); return res.end(); }
  if (req.url === '/hang') return res.write('x');
  res.end(body);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const B = `http://127.0.0.1:${srv.address().port}`;

try {
  console.log('— ① WHY: the built-in fetch decodes a Brotli answer it never asked for');
  seen.length = 0;
  const raw = await fetch(B + '/br');
  const rawText = await raw.text();
  ok(seen[0].ae === 'gzip, deflate' && rawText === 'hello /br', `node ${process.version}'s fetch asked "${seen[0].ae}" and still DECODED br ("${rawText}") — the answering server chose the decoder`);

  console.log('— ② safeFetch: gzip or nothing');
  seen.length = 0;
  const g = await safeFetch(B + '/gzip', { headers: { 'Accept-Encoding': 'br, gzip' } });
  ok(g.ok && (await g.text()) === 'hello /gzip' && seen[0].ae === 'gzip', 'it asks accept-encoding: gzip (a caller\'s "br, gzip" replaced) and unpacks gzip itself', seen[0]);
  const plain = await safeFetch(B + '/json');
  ok(plain.status === 200 && (await plain.json()).a === 1 && plain.headers.get('content-type') === 'application/json', 'identity passes: status, headers (a Headers), json()');
  const refused = await Promise.all(['/br', '/deflate', '/list'].map((p) => err(safeFetch(B + p))));
  ok(refused.every((e) => e && e.code === 'encoding' && /refused/.test(e.message) && !/hello/.test(e.message)), 'br / deflate / "gzip, br" ⇒ REFUSED by name (code encoding) before any decoder ran', refused.map((e) => e && e.message));
  const big = await err(safeFetch(B + '/big', { maxBytes: 1024 * 1024 }));
  ok(big && big.code === 'too-big', 'a gzip bomb past maxBytes (4 MiB unpacked > 1 MiB) ⇒ too-big', big && big.message);

  console.log('— ② redirects, an abort');
  seen.length = 0;
  const hop = await safeFetch(B + '/hop', { headers: { authorization: 'Bearer same-origin' } });
  ok(hop.ok && hop.redirected && hop.url === B + '/json' && seen.map((s) => s.auth).join() === 'Bearer same-origin,Bearer same-origin', 'a same-origin 302 is followed (redirected, the final url) — authorization kept on its origin');
  seen.length = 0;
  const away = await safeFetch(B + '/away', { headers: { authorization: 'Bearer secret' } });
  ok(away.ok && seen.length === 2 && seen[0].auth === 'Bearer secret' && seen[1].auth === null, 'a redirect to ANOTHER origin drops authorization (as fetch does)', seen);
  seen.length = 0;
  const so = await safeFetch(B + '/see-other', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  ok(so.ok && seen.map((s) => s.method).join() === 'POST,GET', 'a 303 after a POST is followed with a GET (no body)');
  const noRedirect = await err(safeFetch(B + '/hop', { redirect: 'error' })), loop = await err(safeFetch(B + '/loop'));
  ok(noRedirect && noRedirect.code === 'redirect' && loop && loop.code === 'redirect' && /more than 5/.test(loop.message), "redirect: 'error' refuses one; a loop stops after 5 hops");
  const ab = await err(safeFetch(B + '/hang', { signal: AbortSignal.timeout(300) }));
  ok(ab && (ab.name === 'AbortError' || ab.name === 'TimeoutError' || ab.code === 'ABORT_ERR'), 'an AbortSignal ends a hung answer', ab && [ab.name, ab.code]);
  const bad = await err(safeFetch('file:///etc/passwd'));
  ok(bad && bad.code === 'bad-url', 'not http(s) ⇒ refused');
} finally { srv.close(); }

console.log('— ③ THE CENSUS: every fetch() site in src/server');
// [file, raw fetch( sites, class, why] — a NEW site is RED until it is a row; class `untrusted` = safeFetch only
const ROWS = [
  ['src/server/agent-tool-generators.js', 2, 'own', 'the hook / tool scripts it writes call THIS instance\'s /api/agent/* (loopback, the session token) — lane cli-call-timeouts: 3 → 2, vibespace-status calls through THE ONE CALL (src/cli-call.js)'],
  ['src/server/browser-builds-keeper.js', 1, 'vendor-fixed', 'Chrome for Testing: every hop judged by egressVerdict over the record\'s two hosts before the request, https only'],
  ['src/server/decision-engine.js', 1, 'vendor-fixed', 'DECISION_ENDPOINT (OpenAI / OpenRouter), behind the budget verdict + the key (test-vendor-whitelist)'],
  ['src/server/dropline-client.js', 6, 'vendor-fixed', 'api.dropline.fish.audio — the one vendor module (test-vendor-whitelist)'],
  ['src/server/feedback-forward.js', 2, 'operator', 'the feedback forward URL from THIS instance\'s settings / presets — the operator\'s own hub'],
  ['src/server/ops-routes.js', 1, 'vendor-fixed', 'raw.githubusercontent.com/<this project>/master — the changelog (CANONICAL_RAW)'],
  ['src/server/plugin-loader.js', 1, 'own', 'a plugin tool shim\'s text: it calls THIS instance\'s /api/agent/plugin-tool'],
  ['src/server/published-pages.js', 1, 'client', 'a published page\'s service-worker text — runs in the viewer\'s browser, never here'],
  ['src/server/text-model-client.js', 1, 'vendor-fixed', 'TEXT_ENDPOINT (OpenRouter), behind the budget verdict + the key (test-vendor-whitelist)'],
  ['src/server/plugin-install.js', 0, 'untrusted', 'a plugin a person names: the GitHub release lookup + the asset it lists, wherever that redirects ⇒ safeFetch'],
  ['src/server/provider-models.js', 0, 'untrusted', 'a model provider\'s base URL a person typed (its /models) ⇒ safeFetch'],
];
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const sitesOf = (t) => (strip(t).match(/(^|[^.\w])fetch\(/g) || []).length;
const census = (read) => {
  const red = [];
  const files = fs.readdirSync(path.join(REPO, 'src/server')).filter((f) => f.endsWith('.js')).map((f) => 'src/server/' + f);
  for (const f of files) {
    const t = read(f), n = sitesOf(t), row = ROWS.find((r) => r[0] === f);
    if (n && !row) red.push(`${f}: ${n} fetch() site(s), no row — classify it (vendor-fixed / own / operator / client), or call safeFetch`);
    else if (row && n !== row[1]) red.push(`${f}: ${n} fetch() site(s), the row says ${row[1]}`);
    if (row && row[2] === 'untrusted' && !/\bsafeFetch\(/.test(strip(t))) red.push(`${f}: an untrusted row that never calls safeFetch`);
  }
  for (const [f] of ROWS) if (!files.includes(f)) red.push(`${f}: a row for no file`);
  return red;
};
const real = census((f) => fs.readFileSync(path.join(REPO, f), 'utf8'));
const by = (c) => ROWS.filter((r) => r[2] === c).length;
ok(real.length === 0, `every fetch() site in src/server is a row: ${by('vendor-fixed')} vendor-fixed, ${by('own')} own, ${by('operator')} operator, ${by('client')} client — and the ${by('untrusted')} untrusted ones call safeFetch only`, real);
const pi = fs.readFileSync(path.join(REPO, 'src/server/plugin-install.js'), 'utf8');
const planted = pi.replace('try { return await safeFetch(url, {', 'try { return await fetch(url, {');
const red = census((f) => (f === 'src/server/plugin-install.js' ? planted : fs.readFileSync(path.join(REPO, f), 'utf8')));
ok(planted !== pi && red.some((l) => /plugin-install\.js: 1 fetch\(\) site/.test(l)) && red.some((l) => /never calls safeFetch/.test(l)), 'RED: plugin-install back on the raw fetch ⇒ the census names it (a site its row does not allow, no safeFetch)', red);
// B-9dd0 (lane bl-scratch, 2026-11-17): THE UPDATE CHECK NEVER REACHES GITHUB UNDER VS_NO_REAL_CLI — the REAL route, a fetch that
// records instead of dialling; RED control: the flag unset, the same route asks raw.githubusercontent.com once
{
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-fetchenc-ops-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  const routes = {}, app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; } };
  const prev = { fetch: globalThis.fetch, flag: process.env.VS_NO_REAL_CLI, fix: process.env.VIBESPACE_CHANGELOG_FIXTURE_DIR };
  const asked = [];
  try {
    delete process.env.VIBESPACE_CHANGELOG_FIXTURE_DIR;
    globalThis.fetch = async (u) => { asked.push(String(u)); return { ok: true, status: 200, text: async () => JSON.stringify({ version: '9.9.9' }) }; };
    const OPS = require(path.join(REPO, 'src/server/ops-routes.js'));
    const ops = OPS.create({ app, rootDir: root, wss: { clients: new Set() }, WS_OPEN: 1, tmpRoots: [] });   // the flag alone decides here
    ops.versionInfo.commit = '';   // the scratch root is no checkout: no git asked
    const version = async () => { let out = null; await routes['GET /api/version']({ query: { fresh: '1' } }, { json: (o) => { out = o; } }); return out; };
    process.env.VS_NO_REAL_CLI = '1';
    const off = await version();
    const offAsked = asked.length;
    delete process.env.VS_NO_REAL_CLI; ops.versionInfo.fetchedAt = 0;
    const on = await version();
    ok(offAsked === 0 && off && off.version === '1.0.0' && off.latest === null, `B-9dd0: under VS_NO_REAL_CLI=1 the update check answers offline and asks nothing (${offAsked} request(s), latest ${off && off.latest})`);
    ok(asked.length === 1 && /^https:\/\/raw\.githubusercontent\.com\//.test(asked[0]) && on && on.latest === '9.9.9', `CONTROL B-9dd0: the flag unset, the same route asks the canonical repo once (red without the guard): ${JSON.stringify(asked)}`);
    // …and a hub whose ROOT lies under a temp root (every suite's scratch hub, the flag set or not) asks nothing either
    const routes2 = {}; const app2 = { get: (p, h) => { routes2['GET ' + p] = h; }, post: () => {} };
    const ops2 = OPS.create({ app: app2, rootDir: root, wss: { clients: new Set() }, WS_OPEN: 1, tmpRoots: [path.dirname(root)] });
    ops2.versionInfo.commit = '';
    const before = asked.length; let out2 = null;
    await routes2['GET /api/version']({ query: { fresh: '1' } }, { json: (o) => { out2 = o; } });
    ok(asked.length === before && out2 && out2.latest === null, `B-9dd0: a hub rooted under a temp root answers offline without the flag (${asked.length - before} request(s))`);
    // B-9dd0 cure (the readers, 08:54Z): the root is judged as rule 3's real caller judges it — REALPATH'd — so a root reached
    // through a LINK into a temp root is one too (red without the cure: its literal path lies outside that root); the first
    // offline answer says why in ONE journal line
    const T = path.join(root, 'troot'), L = path.join(root, 'link');   // inside this leg's own root (removed below)
    fs.mkdirSync(path.join(T, 'hub'), { recursive: true }); fs.mkdirSync(L); fs.writeFileSync(path.join(T, 'hub', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    fs.symlinkSync(path.join(T, 'hub'), path.join(L, 'hub'));
    const routes3 = {}; const app3 = { get: (p, h) => { routes3['GET ' + p] = h; }, post: () => {} };
    const ops3 = OPS.create({ app: app3, rootDir: path.join(L, 'hub'), wss: { clients: new Set() }, WS_OPEN: 1, tmpRoots: [T] });
    ops3.versionInfo.commit = '';
    const said = [], log0 = console.log, before3 = asked.length; let out3 = null, out3b = null;
    console.log = (...a) => { said.push(a.join(' ')); };
    try {
      await routes3['GET /api/version']({ query: { fresh: '1' } }, { json: (o) => { out3 = o; } });
      ops3.versionInfo.fetchedAt = 0;
      await routes3['GET /api/version']({ query: { fresh: '1' } }, { json: (o) => { out3b = o; } });
    } finally { console.log = log0; }
    const lines3 = said.filter((l) => l.startsWith('[version]'));
    ok(asked.length === before3 && out3 && out3.latest === null && out3b && out3b.latest === null, `B-9dd0 cure: a root reached through a LINK into a temp root is judged by its real path and asks nothing (${asked.length - before3} request(s); its literal path lies outside ${T})`);
    ok(lines3.length === 1 && lines3[0].includes(T) && /rule 3/.test(lines3[0]), `B-9dd0 cure: the first offline answer says why in ONE journal line, the second says nothing (${JSON.stringify(lines3)})`);
  } finally {
    globalThis.fetch = prev.fetch;
    if (prev.flag === undefined) delete process.env.VS_NO_REAL_CLI; else process.env.VS_NO_REAL_CLI = prev.flag;
    if (prev.fix !== undefined) process.env.VIBESPACE_CHANGELOG_FIXTURE_DIR = prev.fix;
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const NR = fs.readFileSync(path.join(REPO, 'src/node-runtime.js'), 'utf8');
ok(/'accept-encoding': 'identity'/.test(NR) && /content-encoding/.test(NR), 'the node release download (src/node-runtime.js, a fixed mirror — nodejs.org by default) asks identity and refuses an encoded answer; its archive is sha256-checked before anything unpacks it');

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
