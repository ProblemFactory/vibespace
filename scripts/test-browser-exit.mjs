#!/usr/bin/env node
// THE EXIT CHECK (lane cli-update-needs-nothing; the owner 2026-11-17 «A就行»): a person checks a browser profile's proxy EXIT only by a
// press, THROUGH that profile's proxy, at ONE check address the owner sets — nothing kept until the person confirms; never a timer,
// never at a launch. Stand-ins only: a loopback stand-in proxy (the profile's upstream), a loopback stand-in check server (plain — the
// TLS seam; the production road verifies the host's name), the fake agent-browser under the REAL keeper. No real check address.
//   ① THE RULES (src/browser-exit.js): the address (https only, no login, no private literal), the tolerant read (three shapes and the
//      unreadable kinds), the zone (three good, an abbreviation and an offset refused — one example in the refusal), the kept names
//   ② THE ONE REQUEST (src/server/browser-exit-check.js): through the forwarder to the set address — the stand-in upstream sees the
//      CONNECT for the check host, the check server ONE GET with exactly the fixed header list. RED: a copy that dials the address directly
//   ③ THE REAL KEEPER: no address / no proxy / a locked vault ⇒ refused by name and NO request; a press reads the three facts and keeps
//      NOTHING; the confirm keeps them under the hand-over's names (checkedAt, source); a bad zone refused at the field
//   ④ THE PERSON'S DOORS: the setting's write is a person's (an agent's refused with the recipe — who sets it and where); a person's bad
//      address refused by its rule; both routes refuse an agent's token; the agent views never carry the kept exit
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
const require = createRequire(import.meta.url);
const Module = require('node:module');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : ''}`); } };
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }
function mutant(rel, from, to) {
  const file = path.join(REPO, rel), s = read(rel);
  if (!s.includes(from)) throw new Error(`mutant: ${rel} no longer holds ${JSON.stringify(from.slice(0, 70))}`);
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(s.split(from).join(to), file);
  return m.exports;
}
const X = require('../src/browser-exit.js');
const EC = require('../src/server/browser-exit-check.js');
const EP = require('../src/server/egress-proxy.js');
const B = require('../src/browser-profiles.js');
const CHECK_HOST = 'check.example.test', CHECK_URL = `https://${CHECK_HOST}/json?fields=3`;   // a reserved name no resolver answers
const PLAIN = (o) => o.socket;   // THE TLS SEAM's stand-in: the check server speaks plain HTTP inside the tunnel

console.log('① THE RULES — the address, the tolerant read, the zone, the kept names');
{
  const u = X.checkUrlVerdict;
  ok(u('').ok && u('').value === '' && u(CHECK_URL).ok && !u('http://check.example.test/').ok && !u('https://u:p@check.example.test/').ok && !u('https://10.0.0.1/').ok && !u('https://127.0.0.1/').ok && !u('https://[::1]/').ok && !u('https://localhost/').ok && !u('not a url').ok,
    'the check address: https only, no user name or password, never this machine or a private network; empty = none (no built-in address)');
  const rd = (body, ct = 'application/json', status = 200) => X.readExitAnswer({ status, contentType: ct, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const a = rd({ ip: '203.0.113.5', country_code: 'JP', timezone: 'Asia/Tokyo' }), b = rd({ query: '203.0.113.6', location: { country: 'DE', time_zone: 'Europe/Berlin' } }), c = rd({ origin: '203.0.113.7, 10.0.0.2', geo: { countryCode: 'US' }, timezone: { id: 'America/New_York' } });
  ok(a.ok && a.read.publicIp === '203.0.113.5' && a.read.country === 'JP' && a.read.timezone === 'Asia/Tokyo' && b.ok && b.read.country === 'DE' && b.read.timezone === 'Europe/Berlin' && c.ok && c.read.publicIp === '203.0.113.7' && c.read.country === 'US' && c.read.timezone === 'America/New_York',
    'the tolerant read — three shapes: flat keys; ONE nested `location`; `geo` + a zone answered as {id} (and the first of a comma list) — by the short stated list', [a, b, c]);
  const h = rd('<html><body>hi</body></html>', 'text/html'), tx = rd('203.0.113.8', 'text/plain'), nk = rd({ hello: 'world' }), rdr = rd('', 'text/html', 302);
  ok(!h.ok && h.kind === 'html' && !tx.ok && tx.kind === 'text' && !nk.ok && nk.kind === 'json' && /without an address, a country or a time zone/.test(nk.said) && !rdr.ok && rdr.kind === 'redirect' && /never followed/.test(rdr.said),
    'an answer that cannot be read is said for WHAT came back: a web page, plain text, JSON without the facts, a redirect (never followed)', [h.kind, tx.kind, nk.kind, rdr.kind]);
  const z = (v) => X.zoneVerdict(v);
  const good = ['Asia/Shanghai', 'Europe/Berlin', 'America/New_York'].every((v) => z(v).ok && z(v).value === v), abbr = z('EST'), off = z('+05:00'), off2 = z('UTC+8');
  ok(good && !abbr.ok && /abbreviation/.test(abbr.error) && !off.ok && /offset/.test(off.error) && !off2.ok && [abbr, off].every((r) => /like Asia\/Shanghai/.test(r.error)) && !z('Mars/Olympus').ok,
    'the zone — judged by the runtime\'s own formatter: three good zones kept; an abbreviation and an offset refused at the field, each with one example (Asia/Shanghai)', [abbr.error, off.error]);
  const k = X.egressRecordOf({ publicIp: '203.0.113.5', country: ' JP ', timezone: 'Asia/Tokyo', source: 'measured' }, { now: 42 });
  ok(k.ok && JSON.stringify(Object.keys(k.value)) === '["publicIp","country","timezone","checkedAt","source"]' && k.value.country === 'JP' && k.value.checkedAt === 42 && k.value.source === 'measured' && !X.egressRecordOf({}).ok,
    'what is kept: the hand-over\'s own names {publicIp, country, timezone, checkedAt, source} — no mapping; an empty one refused', k);
}

// ── the stand-ins: the profile's proxy (an HTTP CONNECT stand-in that maps the check host to the check server) and the check server ──
const seen = { connects: [], requests: [] };
const checkSrv = http.createServer((q, s) => { seen.requests.push({ url: q.url, raw: q.rawHeaders.slice() }); s.setHeader('Content-Type', 'application/json'); s.end(JSON.stringify({ ip: '203.0.113.9', country_code: 'JP', timezone: 'Asia/Tokyo' })); });
await new Promise((r) => checkSrv.listen(0, '127.0.0.1', r));
const upstream = net.createServer((c) => { c.on('error', () => { }); let b = ''; c.on('data', function f(d) { b += d.toString('latin1'); const i = b.indexOf('\r\n\r\n'); if (i < 0) return; c.removeListener('data', f); const line = b.split('\r\n')[0]; seen.connects.push(line); if (!line.startsWith(`CONNECT ${CHECK_HOST}:443 `)) { c.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); return; } const t = net.connect(checkSrv.address().port, '127.0.0.1', () => { c.write('HTTP/1.1 200 OK\r\n\r\n'); c.pipe(t); t.pipe(c); }); t.on('error', () => c.destroy()); }); });
await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
const UP = upstream.address().port;

console.log('② THE ONE REQUEST — through the forwarder to the set address, the fixed header list, never direct');
{
  const fw = EP.create({ allow: () => ({ allow: true }), upstream: () => ({ scheme: 'http', host: '127.0.0.1', port: UP }), log: { log() { } } });
  const port = await fw.listen();
  seen.connects.length = 0; seen.requests.length = 0;
  const r = await EC.requestThrough({ url: CHECK_URL, forwarder: `http://127.0.0.1:${port}`, tlsConnect: PLAIN });
  const names = seen.requests[0] ? seen.requests[0].raw.filter((_, i) => i % 2 === 0) : [];
  ok(r.ok && r.status === 200 && X.readExitAnswer(r).read.timezone === 'Asia/Tokyo' && seen.connects.length === 1 && seen.connects[0] === `CONNECT ${CHECK_HOST}:443 HTTP/1.1` && seen.requests.length === 1 && seen.requests[0].url === '/json?fields=3',
    'ONE request: the profile\'s proxy sees «CONNECT check.example.test:443» (the NAME — resolved by the proxy, never here), the check server ONE GET of the set path', { connects: seen.connects, n: seen.requests.length });
  ok(JSON.stringify(names) === '["Host","Accept","User-Agent","Connection"]' && seen.requests[0].raw[5] === 'exit-check' && !names.some((n) => /cookie|authorization/i.test(n)),
    'the request carries exactly the fixed short header list — Host, Accept, a generic client name, Connection: nothing naming the instance, the person, the profile or a version; no cookie, no login', seen.requests[0] && seen.requests[0].raw);
  const ECd = mutant('src/server/browser-exit-check.js', 'sock = net.connect({ host: fw.hostname, port: Number(fw.port) });', 'sock = net.connect({ host, port });   // RED: dialled directly');
  seen.connects.length = 0; seen.requests.length = 0;
  const rd = await ECd.requestThrough({ url: CHECK_URL, forwarder: `http://127.0.0.1:${port}`, tlsConnect: PLAIN, deadlineMs: 3000 });
  ok(!rd.ok && seen.connects.length === 0 && seen.requests.length === 0, 'RED: a copy that dials the check address directly — it never reaches the profile\'s proxy (and the name is never the hub\'s to resolve: it fails)', rd);
  await fw.close({ cut: true });
  const src = read('src/server/browser-exit-check.js');
  ok(/tlsConnect = \(o\) => tls\.connect\(o\)/.test(src) && /servername: net\.isIP\(host\) \? undefined : host/.test(src) && !/rejectUnauthorized/.test(src) && /createConnection: \(\) => t \}\)/.test(src) && !/agent: false/.test(src),
    'the production road: TLS to the check host VERIFIED AS ITSELF (its name as the servername, the runtime\'s trust store — never rejectUnauthorized), the request on the tunnel (no agent that would look the name up)');
}

console.log('③ THE REAL KEEPER — refused by name with no request; a press reads and keeps nothing; the confirm keeps the names');
const ROOT = scratch('bexit');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, 'home'), { recursive: true });
const fake = writeFakeAgentBrowser(path.join(ROOT, 'bin'), path.join(ROOT, 'ab-state'));
process.on('exit', () => { fake.reap(); for (const s of [checkSrv, upstream]) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const K = require('../src/server/browser-keeper.js');
const PL = require('../src/server/browser-proxy-logins.js');
const settings = {};
const vault = { locked: false, entries: new Map(), state() { return this.locked ? 'locked' : 'unlocked'; }, secretPut(n, v) { if (this.locked) return { ok: false, code: 'key-unreadable:vault_locked' }; this.entries.set(n, Buffer.from(v)); return { ok: true }; }, secretGet(n) { return this.locked ? { ok: false, code: 'key-unreadable:vault_locked' } : { ok: true, value: this.entries.has(n) ? Buffer.from(this.entries.get(n)) : null }; }, secretDrop(n) { this.entries.delete(n); return { ok: true }; }, secretNames() { return [...this.entries.keys()].map((name) => ({ name })); }, noteUse() { return { receipt: null }; } };
const pl = PL.create({ vault, log: { log() { }, warn() { } } });
const PATH_ENV = `${path.join(ROOT, 'bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
const k = K.create({ dataDir: path.join(ROOT, 'data'), homeDir: path.join(ROOT, 'home'), env: () => ({ PATH: PATH_ENV, HOME: path.join(ROOT, 'home'), FAKE_AB_STATE: path.join(ROOT, 'ab-state') }), serverSetting: (x) => settings[x], liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: { add: () => ({ id: 'u1' }) }, proxyLogins: pl });
{
  const proxyUrl = `http://127.0.0.1:${UP}`;
  const pP = k.createProfile({ label: 'Proxied', proxy: proxyUrl }), pN = k.createProfile({ label: 'Plain' });
  const reset = () => { seen.connects.length = 0; seen.requests.length = 0; };
  reset();
  const r0 = await k.exitCheck(pP.id, { tlsConnect: PLAIN });
  ok(!r0.ok && r0.code === 'exit_url_unset' && seen.connects.length === 0 && seen.requests.length === 0, 'no check address set ⇒ refused by name (exit_url_unset — the dialog shows the field), and NO request', r0);
  settings[X.EXIT_URL_KEY] = CHECK_URL;
  reset();
  const rN = await k.exitCheck(pN.id, { tlsConnect: PLAIN });
  ok(!rN.ok && rN.code === 'exit_no_proxy' && /another road/.test(rN.error) && /by hand/.test(rN.error) && seen.connects.length === 0, 'a profile with NO proxy of its own ⇒ refused by name — its browser may leave by another road, a direct check could state an exit it does not use; the hand entry named; no request', rN);
  reset();
  const r1 = await k.exitCheck(pP.id, { tlsConnect: PLAIN });
  const after1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'browser-profiles.json'), 'utf8')).profiles.find((x) => x.id === pP.id);   // the STORE, not a view
  ok(r1.ok && r1.read.publicIp === '203.0.113.9' && r1.read.country === 'JP' && r1.read.timezone === 'Asia/Tokyo' && seen.connects.length === 1 && seen.requests.length === 1 && after1 && !('egress' in after1),
    'a person\'s press ⇒ ONE request through the profile\'s own proxy, the three facts read — and NOTHING kept until the confirm', { r1, egress: after1.egress });
  const kp = await k.keepEgress(pP.id, { ...r1.read, source: 'measured' });
  const bad = await k.keepEgress(pP.id, { country: 'JP', timezone: 'JST', source: 'typed' });
  const after2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'browser-profiles.json'), 'utf8')).profiles.find((x) => x.id === pP.id);
  ok(kp.ok && after2.egress && after2.egress.publicIp === '203.0.113.9' && after2.egress.timezone === 'Asia/Tokyo' && after2.egress.source === 'measured' && after2.egress.checkedAt > 0 && !bad.ok && bad.code === 'exit_timezone_invalid' && after2.egress.timezone === 'Asia/Tokyo',
    'the confirm keeps it on the profile under the hand-over\'s names (checkedAt, source: measured); a typed abbreviation (JST) refused at the field — the kept one unchanged', { kept: after2.egress, bad: bad.code });
  // a credentialed proxy while the vault is locked ⇒ the launch's own refusal, no request
  const ref = pl.save({ proxy: proxyUrl, user: 'standin-user', password: ['pw', String(process.pid)].join('-') }).name;
  const pC = k.createProfile({ label: 'Credentialed', proxy: proxyUrl, proxyCredential: ref });
  vault.locked = true; reset();
  const rL = await k.exitCheck(pC.id, { tlsConnect: PLAIN });
  vault.locked = false;
  ok(!rL.ok && rL.code === 'proxy_credential_unreadable' && seen.connects.length === 0, 'a credentialed proxy with the vault locked ⇒ the same refusal as a launch (proxy_credential_unreadable) — no request', rL);
  // never a timer, never a launch: the check's one request module has ONE caller (the keeper's exitCheck), and the keeper calls it nowhere else
  const KS = read('src/server/browser-keeper.js');
  ok((KS.match(/EXC\.requestThrough\(/g) || []).length === 1 && /async function exitCheck\(/.test(KS) && !/setInterval\([^)]*exitCheck|setTimeout\([^)]*exitCheck/.test(KS),
    'never a timer, never at a launch: the one request module has ONE call site — the keeper\'s exitCheck, which only the person\'s route calls');
}

console.log('④ THE PERSON\'S DOORS — the setting\'s write, the routes, the agent views');
{
  const P = require('../src/routes/persistence.js');
  const PD = path.join(ROOT, 'persist'); fs.mkdirSync(PD, { recursive: true });
  P.setup({ dataDir: PD, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
  const route = (m, p) => P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[m]).route.stack[0].handle;
  const call = (m, body, headers = {}) => { let code = 200, out = null; const res = { headersSent: false, status(c) { code = c; return res; }, json(o) { out = o; return res; } }; route(m, '/api/settings')({ headers, body, query: {} }, res); return { code, out }; };
  const ag = call('patch', { [X.EXIT_URL_KEY]: CHECK_URL }, { authorization: 'Bearer ' + 'vsst_standin' });
  const badUrl = call('patch', { [X.EXIT_URL_KEY]: 'http://check.example.test/' });
  const okUrl = call('patch', { [X.EXIT_URL_KEY]: CHECK_URL });
  ok(ag.code === 403 && ag.out.code === 'exit_url_owner_only' && /set by a person/.test(ag.out.error) && /Check the exit…/.test(ag.out.error) && /Settings › Agent browser/.test(ag.out.error) && badUrl.code === 400 && /https/.test(badUrl.out.error) && okUrl.code === 200 && P.router.readSettings()[X.EXIT_URL_KEY] === CHECK_URL,
    'the setting\'s write is a person\'s: an agent\'s token refused with the RECIPE (a person sets it — in «Check the exit…» or in Settings › Agent browser); a person\'s http address refused by its rule; a good one kept', [ag.code, ag.out && ag.out.code, badUrl.code, okUrl.code]);
  const RB = read('src/routes/browser.js');
  ok(/router\.post\('\/api\/browser\/profiles\/:id\/exit-check', async \(req, res\) => \{\n  if \(refuseHost\(req, res\)\) return;\n  if \(refuseAgentBearer\(req, res, EXIT_IS_USERS\)\) return;/.test(RB) && /router\.post\('\/api\/browser\/profiles\/:id\/egress', async \(req, res\) => \{\n  if \(refuseHost\(req, res\)\) return;\n  if \(refuseAgentBearer\(req, res, EXIT_IS_USERS\)\) return;/.test(RB),
    'both routes (the press, the confirm) refuse an agent\'s token before anything — a person\'s cookie door only, no CLI verb, no automation verb');
  const withExit = { id: 'bp-000000aa', label: 'X', egress: { publicIp: '203.0.113.9', country: 'JP', timezone: 'Asia/Tokyo', checkedAt: 1, source: 'measured' } };
  ok(B.publicProfileView(withExit).egress && !('egress' in B.agentProfileView(withExit)), 'the person\'s view carries the kept exit; the agent\'s view never does');
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
