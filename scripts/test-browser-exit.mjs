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
import tls from 'node:tls';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const Module = require('node:module');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();   // B-1747 (the release's §7b): the ONE guarded helper — a condition is a boolean, a swap throws
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
  ok(!!(u('').ok && u('').value === '' && u(CHECK_URL).ok && !u('http://check.example.test/').ok && !u('https://u:p@check.example.test/').ok && !u('https://10.0.0.1/').ok && !u('https://127.0.0.1/').ok && !u('https://[::1]/').ok && !u('https://localhost/').ok && !u('not a url').ok),
    'the check address: https only, no user name or password, never this machine or a private network; empty = none (no built-in address)');
  const rd = (body, ct = 'application/json', status = 200) => X.readExitAnswer({ status, contentType: ct, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const a = rd({ ip: '203.0.113.5', country_code: 'JP', timezone: 'Asia/Tokyo' }), b = rd({ query: '203.0.113.6', location: { country: 'DE', time_zone: 'Europe/Berlin' } }), c = rd({ origin: '203.0.113.7, 10.0.0.2', geo: { countryCode: 'US' }, timezone: { id: 'America/New_York' } });
  ok(!!(a.ok && a.read.publicIp === '203.0.113.5' && a.read.country === 'JP' && a.read.timezone === 'Asia/Tokyo' && b.ok && b.read.country === 'DE' && b.read.timezone === 'Europe/Berlin' && c.ok && c.read.publicIp === '203.0.113.7' && c.read.country === 'US' && c.read.timezone === 'America/New_York'),
    'the tolerant read — three shapes: flat keys; ONE nested `location`; `geo` + a zone answered as {id} (and the first of a comma list) — by the short stated list', [a, b, c]);
  const h = rd('<html><body>hi</body></html>', 'text/html'), tx = rd('203.0.113.8', 'text/plain'), nk = rd({ hello: 'world' }), rdr = rd('', 'text/html', 302);
  ok(!!(!h.ok && h.kind === 'html' && !tx.ok && tx.kind === 'text' && !nk.ok && nk.kind === 'json' && /without an address, a country or a time zone/.test(nk.said) && !rdr.ok && rdr.kind === 'redirect' && /never followed/.test(rdr.said)),
    'an answer that cannot be read is said for WHAT came back: a web page, plain text, JSON without the facts, a redirect (never followed)', [h.kind, tx.kind, nk.kind, rdr.kind]);
  const z = (v) => X.zoneVerdict(v);
  const good = ['Asia/Shanghai', 'Europe/Berlin', 'America/New_York'].every((v) => z(v).ok && z(v).value === v), abbr = z('EST'), off = z('+05:00'), off2 = z('UTC+8');
  ok(!!(good && !abbr.ok && /abbreviation/.test(abbr.error) && !off.ok && /offset/.test(off.error) && !off2.ok && [abbr, off].every((r) => /like Asia\/Shanghai/.test(r.error)) && !z('Mars/Olympus').ok),
    'the zone — judged by the runtime\'s own formatter: three good zones kept; an abbreviation and an offset refused at the field, each with one example (Asia/Shanghai)', [abbr.error, off.error]);
  const k = X.egressRecordOf({ publicIp: '203.0.113.5', country: ' JP ', timezone: 'Asia/Tokyo', source: 'measured' }, { now: 42 });
  ok(!!(k.ok && JSON.stringify(Object.keys(k.value)) === '["publicIp","country","timezone","checkedAt","source"]' && k.value.country === 'JP' && k.value.checkedAt === 42 && k.value.source === 'measured' && !X.egressRecordOf({}).ok),
    'what is kept: the hand-over\'s own names {publicIp, country, timezone, checkedAt, source} — no mapping; an empty one refused', k);
}

// ── the stand-ins: the profile's proxy (an HTTP CONNECT stand-in that maps the check host to the check server) and the check server ──
const seen = { connects: [], requests: [] };
const checkSrv = http.createServer((q, s) => { seen.requests.push({ url: q.url, raw: q.rawHeaders.slice() }); s.setHeader('Content-Type', 'application/json'); s.end(JSON.stringify({ ip: '203.0.113.9', country_code: 'JP', timezone: 'Asia/Tokyo' })); });
await new Promise((r) => checkSrv.listen(0, '127.0.0.1', r));
const upstream = net.createServer((c) => { c.on('error', () => { }); let b = ''; c.on('data', function f(d) { b += d.toString('latin1'); const i = b.indexOf('\r\n\r\n'); if (i < 0) return; c.removeListener('data', f); const line = b.split('\r\n')[0]; seen.connects.push(line); if (!line.startsWith(`CONNECT ${CHECK_HOST}:443 `)) { c.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); return; } const t = net.connect(checkSrv.address().port, '127.0.0.1', () => { c.write('HTTP/1.1 200 OK\r\n\r\n'); c.pipe(t); t.pipe(c); }); t.on('error', () => c.destroy()); }); });
await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
const UP = upstream.address().port;

{ // 主开发 17:04Z (9): the zone kept in its CANONICAL spelling; the public address an address literal or empty — at the read and the keep
  const rd = X.readExitAnswer({ status: 200, contentType: 'application/json', body: JSON.stringify({ ip: 'not-an-address', country: 'JP', timezone: 'asia/tokyo' }) });
  const k1 = X.egressRecordOf({ publicIp: '2001:db8::1', timezone: 'asia/tokyo' }, { now: 1 }), k2 = X.egressRecordOf({ publicIp: 'proxy.example.test', country: 'JP' }), k3 = X.egressRecordOf({});
  ok(!!(rd.ok && rd.read.publicIp === '' && rd.read.timezone === 'Asia/Tokyo' && k1.ok && k1.value.timezone === 'Asia/Tokyo' && k1.value.publicIp === '2001:db8::1' && !k2.ok && k2.code === 'exit_ip_invalid' && !k3.ok && /public address, the country or the time zone/.test(k3.error)
     && X.ipLiteral('203.0.113.7') && !X.ipLiteral('203.0.113.256') && X.ipLiteral('::ffff:198.51.100.1') && !X.ipLiteral('1.2.3') && !X.ipLiteral('proxy.example.test')),
    'the zone kept canonical (asia/tokyo ⇒ Asia/Tokyo) at the read and the keep; the public address a literal (v4 or v6) or empty — a name read as empty, typed refused; the empty refusal names what is accepted', { read: rd.read, k2: k2.code });
}
console.log('② THE ONE REQUEST — through the forwarder to the set address, the fixed header list, never direct');
{
  const fw = EP.create({ allow: () => ({ allow: true }), upstream: () => ({ scheme: 'http', host: '127.0.0.1', port: UP }), log: { log() { } } });
  const port = await fw.listen();
  seen.connects.length = 0; seen.requests.length = 0;
  const r = await EC.requestThrough({ url: CHECK_URL, forwarder: `http://127.0.0.1:${port}`, tlsConnect: PLAIN });
  const names = seen.requests[0] ? seen.requests[0].raw.filter((_, i) => i % 2 === 0) : [];
  ok(!!(r.ok && r.status === 200 && X.readExitAnswer(r).read.timezone === 'Asia/Tokyo' && seen.connects.length === 1 && seen.connects[0] === `CONNECT ${CHECK_HOST}:443 HTTP/1.1` && seen.requests.length === 1 && seen.requests[0].url === '/json?fields=3'),
    'ONE request: the profile\'s proxy sees «CONNECT check.example.test:443» (the NAME — resolved by the proxy, never here), the check server ONE GET of the set path', { connects: seen.connects, n: seen.requests.length });
  ok(JSON.stringify(names) === '["Host","Accept","User-Agent","Connection"]' && seen.requests[0].raw[5] === 'exit-check' && !names.some((n) => /cookie|authorization/i.test(n)),
    'the request carries exactly the fixed short header list — Host, Accept, a generic client name, Connection: nothing naming the instance, the person, the profile or a version; no cookie, no login', seen.requests[0] && seen.requests[0].raw);
  const ECd = mutant('src/server/browser-exit-check.js', 'sock = net.connect({ host: fw.hostname, port: Number(fw.port) });', 'sock = net.connect({ host, port });   // RED: dialled directly');
  seen.connects.length = 0; seen.requests.length = 0;
  const rd = await ECd.requestThrough({ url: CHECK_URL, forwarder: `http://127.0.0.1:${port}`, tlsConnect: PLAIN, deadlineMs: 3000 });
  ok(!rd.ok && seen.connects.length === 0 && seen.requests.length === 0, 'RED: a copy that dials the check address directly — it never reaches the profile\'s proxy (and the name is never the hub\'s to resolve: it fails)', rd);
  await fw.close({ cut: true });
  const src = read('src/server/browser-exit-check.js');
  // 主开发 17:04Z (7, 12): the request's bounds and the TRUE reason, each by a stall PLACED in a loopback stand-in (never by load)
  const standin = async (onConn) => { const s = net.createServer((c) => { c.on('error', () => { }); onConn(c); }); await new Promise((r) => s.listen(0, '127.0.0.1', r)); return s; };
  const afterConnect = (c, then) => { let b = ''; c.on('data', function f(d) { b += d.toString('latin1'); if (!b.includes('\r\n\r\n')) return; c.removeListener('data', f); c.write('HTTP/1.1 200 Connection Established\r\n\r\n'); then(c); }); };
  const onGet = (c, then) => { let b = ''; c.on('data', function f(d) { b += d.toString('latin1'); if (!b.includes('\r\n\r\n')) return; c.removeListener('data', f); then(c); }); };
  const silentProxy = await standin(() => { });                                   // accepts, never answers the CONNECT
  const hangUp = await standin((c) => c.once('data', () => c.destroy()));         // hangs up at the CONNECT
  const silentHost = await standin((c) => afterConnect(c, () => { }));            // the way opens; the check address never answers
  const drips = []; const drip = await standin((c) => afterConnect(c, (cc) => onGet(cc, (g) => { g.write('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 200\r\n\r\n{'); const iv = setInterval(() => { try { g.write(' '); } catch { clearInterval(iv); } }, 50); drips.push(iv); })));
  const big = await standin((c) => afterConnect(c, (cc) => onGet(cc, (g) => { const body = JSON.stringify({ ip: '203.0.113.9', pad: 'x'.repeat(4096) }); g.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`); })));
  const via = (s, o = {}) => EC.requestThrough({ url: CHECK_URL, forwarder: `http://127.0.0.1:${s.address().port}`, tlsConnect: PLAIN, deadlineMs: 400, ...o });
  const [b1, b2, b3, b4, b5] = await Promise.all([via(silentProxy), via(hangUp), via(silentHost), via(drip), via(big, { capBytes: 1024, deadlineMs: 3000 })]);   // the cap leg has its OWN longer deadline — it is not a deadline leg   // independent stand-ins: side by side
  for (const iv of drips) clearInterval(iv);
  ok(b1.code === 'exit_proxy_timeout' && b2.code === 'exit_proxy_hung_up' && b3.code === 'exit_check_timeout' && b4.code === 'exit_check_timeout' && b5.code === 'exit_check_too_big',
    'the bounds and the TRUE reason: silence before the tunnel ⇒ the profile\'s proxy did not open the way; a hang-up there ⇒ its own name; silence after it ⇒ the check address; a body that DRIPS past the deadline ⇒ the deadline holds over everything; a body over the cap ⇒ stopped as it arrives', [b1.code, b2.code, b3.code, b4.code, b5.code]);
  const ECo = mutant('src/server/browser-exit-check.js', "finish(tunneled ? { ok: false, code: 'exit_check_timeout'", "finish(true ? { ok: false, code: 'exit_check_timeout'");
  ok((await ECo.requestThrough({ url: CHECK_URL, forwarder: `http://127.0.0.1:${silentProxy.address().port}`, tlsConnect: PLAIN, deadlineMs: 300 })).code === 'exit_check_timeout', 'RED: the reason before the cure — a silent PROXY blamed on the check address');
  // (8) a LITERAL check address is verified as ITSELF — a real TLS stand-in for 127.0.0.1 behind a stand-in tunnel
  const TLSD = scratch('bexit-tls'); fs.mkdirSync(TLSD, { recursive: true });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(TLSD, 'k.pem'), '-out', path.join(TLSD, 'c.pem'), '-days', '2', '-subj', '/CN=standin', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const CERT = fs.readFileSync(path.join(TLSD, 'c.pem'));
  const tlsSrv = tls.createServer({ key: fs.readFileSync(path.join(TLSD, 'k.pem')), cert: CERT }, (c) => { c.on('error', () => { }); onGet(c, (g) => { const body = JSON.stringify({ ip: '203.0.113.9' }); g.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`); }); });
  fs.rmSync(TLSD, { recursive: true, force: true });
  await new Promise((r) => tlsSrv.listen(0, '127.0.0.1', r));
  const tunnelTo = await standin((c) => afterConnect(c, (cc) => { const up = net.connect(tlsSrv.address().port, '127.0.0.1'); up.on('error', () => { }); cc.pipe(up); up.pipe(cc); }));
  const CA = (o) => tls.connect({ ...o, ca: CERT });
  const lit = await EC.requestThrough({ url: `https://127.0.0.1:${tlsSrv.address().port}/json`, forwarder: `http://127.0.0.1:${tunnelTo.address().port}`, tlsConnect: CA, deadlineMs: 3000 });
  const ECl = mutant('src/server/browser-exit-check.js', 'tlsConnect({ socket: sock, host, servername:', 'tlsConnect({ socket: sock, servername:');
  const litR = await ECl.requestThrough({ url: `https://127.0.0.1:${tlsSrv.address().port}/json`, forwarder: `http://127.0.0.1:${tunnelTo.address().port}`, tlsConnect: CA, deadlineMs: 3000 });
  ok(!!(lit.ok && X.readExitAnswer(lit).read.publicIp === '203.0.113.9' && !litR.ok), 'a LITERAL check address verifies as itself (its certificate names the address) — RED: the identity checked against the forwarder\'s loopback name, it can never pass', [lit.ok, litR.code]);
  for (const s of [silentProxy, hangUp, silentHost, drip, big, tunnelTo, tlsSrv]) { try { s.close(); } catch { } }
  ok(!!(/tlsConnect = \(o\) => tls\.connect\(o\)/.test(src) && /servername: net\.isIP\(host\) \? undefined : host/.test(src) && !/rejectUnauthorized/.test(src) && /createConnection: \(\) => t \}\)/.test(src) && !/agent: false/.test(src)),
    'the production road: TLS to the check host VERIFIED AS ITSELF (its name as the servername, the runtime\'s trust store — never rejectUnauthorized), the request on the tunnel (no agent that would look the name up)');
}

console.log('③ THE REAL KEEPER — refused by name with no request; a press reads and keeps nothing; the confirm keeps the names');
const ROOT = scratch('bexit');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, 'home'), { recursive: true });
const fake = writeFakeAgentBrowser(path.join(ROOT, 'bin'), path.join(ROOT, 'ab-state'));
process.on('exit', () => { fake.reap(); for (const s of [checkSrv, upstream, cdpSrv]) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const K = require('../src/server/browser-keeper.js');
// lane lg-store-writes (B-0248 U5b, met at the census cure's gate): the registry is the store writer's — a read of the STORE file
// lands what the writer still owes first, LOUDLY (a landing that left a write throws)
const landed = () => { const r = require('../src/store-writer.js').storeWriter().flushSync(); if (r.left && r.left.length) throw new Error(`the store writer left owed writes: ${JSON.stringify(r.left)}`); };
const PL = require('../src/server/browser-proxy-logins.js');
const settings = {};
const vault = { locked: false, entries: new Map(), state() { return this.locked ? 'locked' : 'unlocked'; }, secretPut(n, v) { if (this.locked) return { ok: false, code: 'key-unreadable:vault_locked' }; this.entries.set(n, Buffer.from(v)); return { ok: true }; }, secretGet(n) { return this.locked ? { ok: false, code: 'key-unreadable:vault_locked' } : { ok: true, value: this.entries.has(n) ? Buffer.from(this.entries.get(n)) : null }; }, secretDrop(n) { this.entries.delete(n); return { ok: true }; }, secretNames() { return [...this.entries.keys()].map((name) => ({ name })); }, noteUse() { return { receipt: null }; } };
const pl = PL.create({ vault, log: { log() { }, warn() { } } });
const PATH_ENV = `${path.join(ROOT, 'bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
const cdpSrv = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'application/json' }); s.end(JSON.stringify({ Browser: 'Chrome/149.0.1.1' })); });
const CDP_PORT = await new Promise((r) => cdpSrv.listen(0, '127.0.0.1', () => r(cdpSrv.address().port)));
const mkK = (mod = K) => mod.create({ dataDir: path.join(ROOT, 'data'), homeDir: path.join(ROOT, 'home'), env: () => ({ PATH: PATH_ENV, HOME: path.join(ROOT, 'home'), FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: (x) => settings[x], liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: { add: () => ({ id: 'u1' }) }, proxyLogins: pl });
const k = mkK();
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
  ok(!!(!rN.ok && rN.code === 'exit_no_proxy' && /another road/.test(rN.error) && /by hand/.test(rN.error) && seen.connects.length === 0), 'a profile with NO proxy of its own ⇒ refused by name — its browser may leave by another road, a direct check could state an exit it does not use; the hand entry named; no request', rN);
  reset();
  const r1 = await k.exitCheck(pP.id, { tlsConnect: PLAIN });
  const after1 = JSON.parse((landed(), fs).readFileSync(path.join(ROOT, 'data', 'browser-profiles.json'), 'utf8')).profiles.find((x) => x.id === pP.id);   // the STORE, not a view
  ok(!!(r1.ok && r1.read.publicIp === '203.0.113.9' && r1.read.country === 'JP' && r1.read.timezone === 'Asia/Tokyo' && seen.connects.length === 1 && seen.requests.length === 1 && after1 && !('egress' in after1)),
    'a person\'s press ⇒ ONE request through the profile\'s own proxy, the three facts read — and NOTHING kept until the confirm', { r1, egress: after1.egress });
  const kp = await k.keepEgress(pP.id, { ...r1.read, source: 'measured' });
  const bad = await k.keepEgress(pP.id, { country: 'JP', timezone: 'JST', source: 'typed' });
  const after2 = JSON.parse((landed(), fs).readFileSync(path.join(ROOT, 'data', 'browser-profiles.json'), 'utf8')).profiles.find((x) => x.id === pP.id);
  ok(!!(kp.ok && after2.egress && after2.egress.publicIp === '203.0.113.9' && after2.egress.timezone === 'Asia/Tokyo' && after2.egress.source === 'measured' && after2.egress.checkedAt > 0 && !bad.ok && bad.code === 'exit_timezone_invalid' && after2.egress.timezone === 'Asia/Tokyo'),
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
  ok(!!((KS.match(/EXC\.requestThrough\(/g) || []).length === 1 && /async function exitCheck\(/.test(KS) && !/setInterval\([^)]*exitCheck|setTimeout\([^)]*exitCheck/.test(KS)),
    'never a timer, never at a launch: the one request module has ONE call site — the keeper\'s exitCheck, which only the person\'s route calls');
  // (12) THE LAW, not one file: in the whole product exactly ONE caller of requestThrough — the keeper's press road
  const callers = execFileSync('git', ['-C', REPO, 'grep', '-l', 'requestThrough(', '--', 'src'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort();
  ok(JSON.stringify(callers) === JSON.stringify(['src/server/browser-exit-check.js', 'src/server/browser-keeper.js']), 'the product holds exactly ONE caller of the request (src/server/browser-keeper.js — the press road) besides its own module', callers);
  // 主开发 17:04Z M1 — A KEPT EXIT BELONGS TO THE ROAD IT WAS KEPT FOR: every change of the proxy forgets it, said in the answer
  const store = (id) => JSON.parse((landed(), fs).readFileSync(path.join(ROOT, 'data', 'browser-profiles.json'), 'utf8')).profiles.find((x) => x.id === id);
  const keepTyped = (id) => k.keepEgress(id, { country: 'JP', timezone: 'Asia/Tokyo', source: 'typed' });
  const pF = k.createProfile({ label: 'Forget', proxy: proxyUrl });
  keepTyped(pF.id); const same = k.updateProfile(pF.id, { proxy: proxyUrl });
  const keptSame = !!store(pF.id).egress && !(same.changed && same.changed.exitForgotten);
  const step = (patch) => { keepTyped(pF.id); const r = k.updateProfile(pF.id, patch); return !!(r.changed && r.changed.exitForgotten) && !store(pF.id).egress; };
  const login = step({ proxyCredential: ref }), addr = step({ proxy: `http://127.0.0.1:${UP + 1 > 65535 ? UP - 1 : UP + 1}` }), removed = step({ proxy: '' });
  const pA = k.createProfile({ label: 'Adding' }); keepTyped(pA.id); const add = k.updateProfile(pA.id, { proxy: proxyUrl });
  const added = !!(add.changed && add.changed.exitForgotten) && !store(pA.id).egress;
  ok(!!(keptSame && login && addr && removed && added), 'a kept exit belongs to its road: a save that changes nothing KEEPS it; its LOGIN changed, its ADDRESS changed, the proxy REMOVED, a proxy ADDED — each FORGETS it (measured or typed), said in the change\'s answer (changed.exitForgotten)', { keptSame, login, addr, removed, added });
  const KF = mutant('src/server/browser-keeper.js', "      if ((np.value !== (p.proxy || null) || nc.value !== (p.proxyCredential || null)) && p.egress) { delete p.egress; changed.exitForgotten = true; }\n", '');
  const kF = KF.create({ dataDir: path.join(ROOT, 'data-forget-red'), homeDir: path.join(ROOT, 'home'), env: () => ({ PATH: PATH_ENV, HOME: path.join(ROOT, 'home') }), serverSetting: (x) => settings[x], liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: { add: () => ({ id: 'u1' }) }, proxyLogins: pl });
  const pR = kF.createProfile({ label: 'Red', proxy: proxyUrl }); kF.keepEgress(pR.id, { country: 'JP', source: 'typed' }); kF.updateProfile(pR.id, { proxy: '' });
  ok(!!JSON.parse((landed(), fs).readFileSync(path.join(ROOT, 'data-forget-red', 'browser-profiles.json'), 'utf8')).profiles.find((x) => x.id === pR.id).egress, 'RED: a keeper without the forget — the old exit outlives the proxy it was kept for (the leg above goes red on it)');
  kF.shutdown?.();
  // M2 — A RUNNING BROWSER IS MEASURED ONLY THROUGH THE ROAD IT RUNS ON (its own forwarder = this proxy WITH this login)
  const pS = k.createProfile({ label: 'Running', proxy: proxyUrl });
  await k.start(pS.id, { why: 'user' });
  reset();
  const fwdBefore = k.egressFor(pS.id);
  const ok1 = await k.exitCheck(pS.id, { tlsConnect: PLAIN });
  const both = await Promise.all([k.exitCheck(pS.id, { tlsConnect: PLAIN }), k.exitCheck(pS.id, { tlsConnect: PLAIN })]);
  const fwdAfter = k.egressFor(pS.id);
  ok(!!(ok1.ok && both.every((x) => x.ok) && fwdBefore.url && fwdAfter.url === fwdBefore.url && fwdAfter.stats.allowed === fwdBefore.stats.allowed && !JSON.stringify(fwdAfter).includes(CHECK_HOST)),
    'a running browser on THIS proxy with THIS login: measured (through the check\'s OWN forwarder — the browser\'s records no check host); two presses at once both answer; the browser\'s forwarder still stands after', { ok1: ok1.code, before: fwdBefore, after: fwdAfter });
  k.updateProfile(pS.id, { proxyCredential: ref }); reset();
  const rLogin = await k.exitCheck(pS.id, { tlsConnect: PLAIN });
  const pB = k.createProfile({ label: 'Before' }); await k.start(pB.id, { why: 'user' }); k.updateProfile(pB.id, { proxy: proxyUrl }); reset();
  const rBefore = await k.exitCheck(pB.id, { tlsConnect: PLAIN });
  ok(rLogin.code === 'exit_restart_first' && rBefore.code === 'exit_restart_first' && seen.connects.length === 0,
    'a running browser whose LOGIN changed since its start, and one started BEFORE the profile had a proxy ⇒ restart-first by name — never measured through a road it does not use; no request', [rLogin.code, rBefore.code]);
  const KM = mutant('src/server/browser-keeper.js', " || String(hp.credential || '') !== String(px0.credential || '')) return { ok: false, code: 'exit_restart_first'", ") return { ok: false, code: 'exit_restart_first'");
  const kM = KM.create({ dataDir: path.join(ROOT, 'data-road-red'), homeDir: path.join(ROOT, 'home'), env: () => ({ PATH: PATH_ENV, HOME: path.join(ROOT, 'home'), FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: (x) => settings[x], liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: { add: () => ({ id: 'u1' }) }, proxyLogins: pl });
  const pMr = kM.createProfile({ label: 'Red road', proxy: proxyUrl }); await kM.start(pMr.id, { why: 'user' }); kM.updateProfile(pMr.id, { proxyCredential: ref });
  const rRed = await kM.exitCheck(pMr.id, { tlsConnect: PLAIN });
  ok(rRed.code !== 'exit_restart_first', 'RED: the comparison without the login — the old login\'s road is measured for the new one', rRed.code);
  for (const [kk, id] of [[k, pS.id], [k, pB.id], [kM, pMr.id]]) { try { await kk.stop(id, { why: 'user' }); } catch { } }
  kM.shutdown?.();
  // a profile whose browser the hub does NOT start: refused like no proxy (its browser leaves by its own settings)
  let rX = null;
  try { const pX = k.createProfile({ label: 'Attached', provider: 'cdp', cdpPort: 9 }); k.updateProfile(pX.id, { proxy: proxyUrl }); rX = await k.exitCheck(pX.id, { tlsConnect: PLAIN }); } catch (e) { rX = { code: 'setup:' + (e.code || e.message) }; }
  ok(!!(rX && rX.code === 'exit_external_browser'), 'a profile whose browser VibeSpace does not start (cdp) ⇒ refused by name like no proxy — that browser leaves by its own settings', rX);
  // 主开发 17:56Z (2) — THE CLOSE ITSELF: the check's own forwarder no longer listens after an answer, an unreadable answer and a time-out
  const fwds = []; const origReq = EC.requestThrough;
  const conn = (port, line) => new Promise((res) => { const s = net.connect(port, '127.0.0.1'); let b = ''; s.on('connect', () => { if (line) s.write(line); else { s.destroy(); res('open'); } }); s.on('data', (d) => { b += d; if (b.includes('\r\n\r\n')) { s.destroy(); res(b.split('\r\n')[0]); } }); s.on('error', (e) => res(e.code || 'error')); setTimeout(() => { s.destroy(); res('timeout'); }, 2000); });
  EC.requestThrough = async (o) => { const port = Number(new URL(o.forwarder).port); fwds.push({ port, other: await conn(port, 'CONNECT other.example.test:443 HTTP/1.1\r\nHost: other.example.test:443\r\n\r\n') }); return origReq(o); };
  const html = net.createServer((c) => { c.on('error', () => { }); let b = ''; c.on('data', function f(d) { b += d.toString('latin1'); if (!b.includes('\r\n\r\n')) return; c.removeListener('data', f); c.write('HTTP/1.1 200 OK\r\n\r\n'); let g = ''; c.on('data', function h(x) { g += x.toString('latin1'); if (!g.includes('\r\n\r\n')) return; c.removeListener('data', h); c.end('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 13\r\n\r\n<html></html>'); }); }); });
  const quiet = net.createServer((c) => { c.on('error', () => { }); c.once('data', () => c.write('HTTP/1.1 200 OK\r\n\r\n')); });
  for (const s of [html, quiet]) await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const closes = async (kk) => {
    const out = [];
    for (const [label, proxy, o] of [['an answer', proxyUrl, {}], ['an unreadable answer', `http://127.0.0.1:${html.address().port}`, {}], ['a time-out', `http://127.0.0.1:${quiet.address().port}`, { deadlineMs: 300 }]]) {
      const pp = kk.createProfile({ label: `Close ${label} ${out.length}`, proxy }); fwds.length = 0;
      const r = await kk.exitCheck(pp.id, { tlsConnect: PLAIN, ...o });
      out.push({ label, code: r.ok ? 'ok' : r.code, other: fwds[0] && fwds[0].other, after: fwds[0] ? await conn(fwds[0].port) : 'no forwarder' });
    }
    return out;
  };
  const cl = await closes(k);
  ok(!!(cl[0].code === 'ok' && cl[1].code === 'exit_answer_unreadable' && cl[2].code === 'exit_check_timeout' && cl.every((x) => x.after === 'ECONNREFUSED') && cl.every((x) => /^HTTP\/1\.1 403/.test(String(x.other)))),
    'the check\'s OWN forwarder is CLOSED after an answer, an unreadable answer and a time-out (its port refuses a connection); while it stood it admitted its ONE host only (another name ⇒ 403)', cl);
  const KC = mutant('src/server/browser-keeper.js', '    finally { auth = null; await px.close({ cut: true }).catch(() => { }); }', '    finally { auth = null; }');
  const kC = KC.create({ dataDir: path.join(ROOT, 'data-close-red'), homeDir: path.join(ROOT, 'home'), env: () => ({ PATH: PATH_ENV, HOME: path.join(ROOT, 'home') }), serverSetting: (x) => settings[x], liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: { add: () => ({ id: 'u1' }) }, proxyLogins: pl });
  const clR = await closes(kC);
  ok(!!(clR.every((x) => x.after === 'open')), 'RED: a check without its close — its forwarder still listens after each of the three (the leg above goes red on it)', clR.map((x) => x.after));
  kC.shutdown?.();
  EC.requestThrough = origReq;
  for (const s of [html, quiet]) { try { s.close(); } catch { } }
  // 主开发 17:56Z (1) — THE LOGIN THE CHECK READS IS THE CHECK'S OWN: never the forwarders' entry, gone with the check
  const pO = k.createProfile({ label: 'Own login', proxy: proxyUrl, proxyCredential: ref });
  const rO = await k.exitCheck(pO.id, { tlsConnect: PLAIN });
  ok(!!(rO.ok && k._proxyCredHeld(pO.id) === false), '(a) a check with no browser running reads the login for itself — after it, the forwarders\' login entry holds NOTHING for the profile (no user name, no secret left in memory)', { ok: rO.ok, held: k._proxyCredHeld(pO.id) });
  const pW = k.createProfile({ label: 'Running login', proxy: proxyUrl, proxyCredential: ref });
  await k.start(pW.id, { why: 'user' });
  const bfw = Number(new URL(k.egressFor(pW.id).url).port);
  vault.locked = true;
  const rW = await k.exitCheck(pW.id, { tlsConnect: PLAIN });
  const road = await conn(bfw, `CONNECT ${CHECK_HOST}:443 HTTP/1.1\r\nHost: ${CHECK_HOST}:443\r\n\r\n`);
  vault.locked = false;
  ok(!!(rW.code === 'proxy_credential_unreadable' && /^HTTP\/1\.1 200/.test(road)), '(b) the vault locked, a press on a RUNNING browser: refused by name — and the running browser\'s road still carries its login (not the locked page)', [rW.code, road]);
  const reads = { n: 0 }; const origRead = pl.read; pl.read = (...x) => { reads.n++; return origRead.apply(pl, x); };
  k.updateProfile(pW.id, { proxyCredential: '' }); vault.locked = true;
  const rWs = await k.exitCheck(pW.id, { tlsConnect: PLAIN });
  vault.locked = false; pl.read = origRead;
  ok(rWs.code === 'exit_restart_first' && reads.n === 0, 'the comparison with the running browser\'s road comes BEFORE any vault read: its login changed + the vault locked ⇒ restart-first, the vault not asked', [rWs.code, reads.n]);
  try { await k.stop(pW.id, { why: 'user' }); } catch { }
  const KO = mutant('src/server/browser-keeper.js', '      auth = { user: r.user, pass: r.pass };\n', '      auth = { user: r.user, pass: r.pass }; proxyCreds.set(k0, { ref: px0.credential, user: r.user, pass: r.pass });\n');
  const KL = mutant('src/server/browser-keeper.js', "      if (!r.ok) return { ok: false, code: 'proxy_credential_unreadable', error: `\"${p.label}\"'s exit was not checked — ${r.error}`, word: r.word || null };", "      if (!r.ok) { proxyCreds.set(k0, { ref: px0.credential, refused: { code: 'proxy_credential_unreadable', sentence: r.error, word: r.word || null }, at: now() }); return { ok: false, code: 'proxy_credential_unreadable', error: r.error }; }");
  const mk2 = (mod, dir) => mod.create({ dataDir: path.join(ROOT, dir), homeDir: path.join(ROOT, 'home'), env: () => ({ PATH: PATH_ENV, HOME: path.join(ROOT, 'home'), FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: (x) => settings[x], liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: { add: () => ({ id: 'u1' }) }, proxyLogins: pl });
  const kO = mk2(KO, 'data-own-red'), pOr = kO.createProfile({ label: 'Own red', proxy: proxyUrl, proxyCredential: ref }); await kO.exitCheck(pOr.id, { tlsConnect: PLAIN });
  const kL = mk2(KL, 'data-locked-red'), pLr = kL.createProfile({ label: 'Locked red', proxy: proxyUrl, proxyCredential: ref }); await kL.start(pLr.id, { why: 'user' });
  const bfwR = Number(new URL(kL.egressFor(pLr.id).url).port); vault.locked = true; await kL.exitCheck(pLr.id, { tlsConnect: PLAIN });
  const roadR = await conn(bfwR, `CONNECT ${CHECK_HOST}:443 HTTP/1.1\r\nHost: ${CHECK_HOST}:443\r\n\r\n`); vault.locked = false;
  ok(!!(kO._proxyCredHeld(pOr.id) === true && /^HTTP\/1\.1 502/.test(roadR)), 'REDs: a check that reads into the forwarders\' entry leaves the login in memory; one that writes its locked refusal there turns the RUNNING browser\'s road into the locked page', [kO._proxyCredHeld(pOr.id), roadR]);
  try { await kL.stop(pLr.id, { why: 'user' }); } catch { }
  kO.shutdown?.(); kL.shutdown?.();
  // a profile whose browser the hub does not start is refused BEFORE it is asked for an address; the three new codes' statuses
  const saved = settings[X.EXIT_URL_KEY]; delete settings[X.EXIT_URL_KEY];
  let rX0 = null; try { const pX0 = k.createProfile({ label: 'Attached first', provider: 'cdp', cdpPort: 9 }); k.updateProfile(pX0.id, { proxy: proxyUrl }); rX0 = await k.exitCheck(pX0.id, { tlsConnect: PLAIN }); } catch (e) { rX0 = { code: 'setup:' + (e.code || e.message) }; }
  settings[X.EXIT_URL_KEY] = saved;
  ok(!!(rX0 && rX0.code === 'exit_external_browser' && /exit_check_timeout: 504, exit_proxy_timeout: 504, exit_proxy_hung_up: 502, exit_external_browser: 409,/.test(read('src/routes/browser.js'))),
    'a browser the hub does not start is refused BEFORE the address is asked (no check address set — still exit_external_browser); the three new codes have their statuses in the route\'s table', rX0);
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
  ok(!!(ag.code === 403 && ag.out.code === 'exit_url_owner_only' && /set by a person/.test(ag.out.error) && /Check the exit…/.test(ag.out.error) && /Settings › Agent browser/.test(ag.out.error) && badUrl.code === 200 && badUrl.out.refused && badUrl.out.refused[X.EXIT_URL_KEY].code === 'exit_url_invalid' && okUrl.code === 200 && P.router.readSettings()[X.EXIT_URL_KEY] === CHECK_URL),
    'the setting\'s write is a person\'s: an agent\'s token refused with the RECIPE (a person sets it — in «Check the exit…» or in Settings › Agent browser); a person\'s http address SET ASIDE by its rule and said (refused, by key); a good one kept', [ag.code, ag.out && ag.out.code, badUrl.code, okUrl.code]);
  // 主开发 17:04Z M3 — a person's refused address is SAID and NEVER HOLDS OTHER SETTINGS: the WHOLE-FILE save (what the Settings
  // window sends) with one refused row lands every other row, keeps the stored address and names the refused one
  const whole = { ...P.router.readSettings(), 'browser.idleTimeoutMs': 123457, [X.EXIT_URL_KEY]: 'http://check.example.test/' };
  const ws = call('post', whole), after = P.router.readSettings();
  ok(!!(ws.code === 200 && after['browser.idleTimeoutMs'] === 123457 && after[X.EXIT_URL_KEY] === CHECK_URL && ws.out.refused && ws.out.refused[X.EXIT_URL_KEY].code === 'exit_url_invalid' && Object.keys(ws.out.refused).length === 1),
    'the WHOLE-FILE save with one refused row: every other row lands, the stored address is kept, and the answer names the refused row and its reason — one refused row never blocks another', { code: ws.code, refused: ws.out && ws.out.refused });
  const PR = mutant('src/routes/persistence.js', '    const refused = setAsideExitUrl(req, data); // the exit check: a person\'s refused address set aside, said — the rest lands\n', '    const refused = null;\n');
  PR.setup({ dataDir: path.join(ROOT, 'persist-red'), wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
  fs.mkdirSync(path.join(ROOT, 'persist-red'), { recursive: true });
  const routeR = PR.router.stack.find((x) => x.route && x.route.path === '/api/settings' && x.route.methods.post).route.stack[0].handle;
  let codeR = 200; const resR = { headersSent: false, status(c) { codeR = c; return resR; }, json() { return resR; } };
  routeR({ headers: {}, body: { 'browser.idleTimeoutMs': 99, [X.EXIT_URL_KEY]: 'http://check.example.test/' }, query: {} }, resR);
  ok(codeR === 400 && (PR.router.readSettings() || {})['browser.idleTimeoutMs'] !== 99, 'RED: the save before the cure — one refused row refuses the whole save: the other row is lost silently', codeR);
  // …and the ROW says why, in the page's language (the store's «refused» state, the row that may be refused draws its mark)
  const SV = await import(new URL('../src/lib/settings-view.js', import.meta.url).href);
  const words = SV.saveMarkWords('refused', (s) => s, { refused: { code: 'exit_url_invalid' } });
  const SS = read('src/lib/settings.js'), SU = read('src/lib/settings-ui.js'), SCH = read('src/lib/settings-schema.js');
  ok(!!(/must be a public https address/.test(words) && /stored one is kept/.test(words) && /if \(this\._refused\.has\(path\)\) return 'refused';/.test(SS) && /this\._refused\.set\(p, \{ code:/.test(SS) && /\|\| schema\.serverVerdict\) controlWrap\.appendChild\(this\._saveMark\(path\)\)/.test(SU) && /'browser\.exitCheckUrl': \{[\s\S]{0,900}?serverVerdict: true/.test(SCH)),
    'the Settings row says the reason AT THE ROW (its own words, by code) — the store keeps a refused path as its own state until the next edit, and the row the server may refuse draws its mark', words);
  // (10) the fold row's age MOVES — its words ride the row's signature; (11) an unreadable answer opens the address field
  const TV = read('src/lib/browser-trace-view.js'), DLG = read('src/lib/browser-exit-dialog.js');
  ok(!!(/rowWhyText\(r\), r && r\.egress && r\.egress\.checkedAt \? agoText\(Date\.now\(\) - Number\(r\.egress\.checkedAt\)\) : null,/.test(TV) && /res\.code === 'exit_answer_unreadable'\) \{ if \(!urlIn\.value\) urlIn\.value = current; urlRow\.style\.display = ''; \}/.test(DLG) && /const forget = btn\(t\('Forget'\), \(\) => doForget\(\), 'bexit-forget'\);/.test(DLG) && /\{ clear: true \}/.test(DLG)),
    'the card\'s fold age moves (the age\'s words ride the row\'s signature); an unreadable answer opens the address field — the door to change it; the dialog\'s Forget press sends the keeper\'s clear');
  ok(!!(/const stale = \[\.\.\.this\._refused\.keys\(\)\]\.filter\(\(p\) => JSON\.stringify\(\(data \|\| \{\}\)\[p\]\) !== JSON\.stringify\(\(this\._server \|\| \{\}\)\[p\]\)\);/.test(SS) && /for \(const p of stale\) this\._refused\.delete\(p\);/.test(SS) && /typeof S\.serverValue === 'function' \? S\.serverValue\(KEY\)/.test(DLG)),
    'the row\'s refused mark drops once the STORED value changes from another page; the dialog\'s address in use is the stored one, never a value this page typed and the server set aside');
  const RB = read('src/routes/browser.js');
  ok(!!(/router\.post\('\/api\/browser\/profiles\/:id\/exit-check', async \(req, res\) => \{\n  if \(refuseHost\(req, res\)\) return;\n  if \(refuseAgentBearer\(req, res, EXIT_IS_USERS\)\) return;/.test(RB) && /router\.post\('\/api\/browser\/profiles\/:id\/egress', async \(req, res\) => \{\n  if \(refuseHost\(req, res\)\) return;\n  if \(refuseAgentBearer\(req, res, EXIT_IS_USERS\)\) return;/.test(RB)),
    'both routes (the press, the confirm) refuse an agent\'s token before anything — a person\'s cookie door only, no CLI verb, no automation verb');
  const withExit = { id: 'bp-000000aa', label: 'X', egress: { publicIp: '203.0.113.9', country: 'JP', timezone: 'Asia/Tokyo', checkedAt: 1, source: 'measured' } };
  ok(!!(B.publicProfileView(withExit).egress && !('egress' in B.agentProfileView(withExit))), 'the person\'s view carries the kept exit; the agent\'s view never does');
}
console.log('⑤ THE PAGE\'S WORDS — every sentence in the dialog the page\'s, by code or kind; the far side\'s words only as data after it');
{
  const W = await import(new URL('../src/lib/browser-exit-words.js', import.meta.url).href);
  const used = new Set(), T = (k, v) => { used.add(k); return String(k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] !== undefined ? String(v[n]) : `{${n}}`)); };
  // EVERY code the two routes can answer: their status table, the route's own refusals, and every code the keeper's press / keep, the
  // request, the pure rules and the launch's verdict can return — read from the files themselves (a new code without a row goes red)
  const RB = read('src/routes/browser.js'), KS = read('src/server/browser-keeper.js');
  const table = (/const EXIT_STATUS = Object\.freeze\(\{([^}]*)\}\)/.exec(RB) || [])[1] || '';
  const codesIn = (txt) => [...txt.matchAll(/code: '([a-z_-]+)'/g)].map((m) => m[1]);
  const fnOf = (src, head, end = '\n  }\n') => { const i = src.indexOf(head); if (i < 0) return ''; const j = src.indexOf(end, i); return src.slice(i, j < 0 ? i + 6000 : j); };   // a keeper method ends at two spaces, a top-level function at none
  const codes = new Set([
    ...[...table.matchAll(/'?([a-z_-]+)'?: \d{3}/g)].map((m) => m[1]),
    'agent_forbidden', 'unsupported-host', 'bad-request', 'unavailable', 'error',
    ...codesIn(read('src/server/browser-exit-check.js')), ...codesIn(read('src/browser-exit.js')),
    ...codesIn(fnOf(KS, '  async function exitCheck(')), ...codesIn(fnOf(KS, '  function keepEgress(')),
    ...codesIn(fnOf(read('src/browser-profiles.js'), 'function proxyLaunchVerdict(', '\n}\n')),
  ]);
  const SERVER = 'the server\'s own English words';
  const rows = [...codes].map((c) => ({ c, w: W.exitWords(c, T, { kind: 'html', status: 418, detail: SERVER }) }));
  const missing = rows.filter((r) => !r.w.known).map((r) => r.c), leaked = rows.filter((r) => r.w.text.includes(SERVER)).map((r) => r.c);
  ok(codes.size >= 25 && missing.length === 0 && leaked.length === 0, `every one of the ${codes.size} codes the routes can answer has the PAGE's sentence (none falls to «named by its code»), and no server words in any sentence`, { missing, leaked });
  const kindsInRules = [...new Set([...read('src/browser-exit.js').matchAll(/kind: (?:html \? 'html' : 'text'|'([a-z]+)')/g)].flatMap((m) => (m[1] ? [m[1]] : ['html', 'text'])))].sort();
  const kindTexts = W.EXIT_KINDS.map((k) => W.exitKindWords(k, T));
  ok(JSON.stringify(kindsInRules) === JSON.stringify([...W.EXIT_KINDS].sort()) && new Set(kindTexts).size === W.EXIT_KINDS.length && !kindTexts.includes(W.exitKindWords('?', T)),
    'every KIND of an unreadable answer the rules can give has its OWN page sentence (the six, read from src/browser-exit.js)', { kindsInRules });
  const refused = W.exitSay('exit_check_refused', T, { detail: '407 — Proxy Authentication Required' }), st = W.exitSay('exit_answer_unreadable', T, { kind: 'status', status: 503 });
  ok(!!(/^The profile's proxy did not open the way to the check address\. \(407 — Proxy Authentication Required\)$/.test(refused) && /error status\..*\(503\)$/.test(st)),
    'what the far side said rides AFTER the page\'s sentence as data — a proxy\'s own line, a status number — never as the sentence', [refused, st]);
  // the owner's look (主开发 19:53Z): no space after a CJK full stop between two of the page's sentences — one after a Latin one
  const ZHT = (k) => ({ 'The check address answered a web page, not JSON.': '检查地址回应的是一个网页，不是 JSON。', 'Type the exit by hand, or give another check address in the field above and press Check.': '请手动填写出口，或在上面的输入框里换一个检查地址，再按「检查」。' }[k] || k);
  const zhU = W.exitWords('exit_answer_unreadable', ZHT, { kind: 'html' }).text, enU = W.exitWords('exit_answer_unreadable', T, { kind: 'html' }).text;
  ok(!!(zhU === '检查地址回应的是一个网页，不是 JSON。请手动填写出口，或在上面的输入框里换一个检查地址，再按「检查」。' && /JSON\. Type the exit/.test(enU) && W.joinSentences('a。', 'b') === 'a。b' && W.joinSentences('a.', 'b') === 'a. b'),
    'two of the page\'s sentences join with NO space after a CJK full stop (zh, ja) and one space after a Latin one', [zhU, enU]);
  const DLG = read('src/lib/browser-exit-dialog.js'), PD = read('src/lib/browser-proxy-dialog.js'), CSS = read('public/style.css');
  ok(!!(!/say\([^;]*\.error/.test(DLG) && !/String\(error\)/.test(DLG) && /exitSay\(code, t, extra\)/.test(DLG)),
    'the dialog says nothing from a server\'s `error` — every sentence through the page\'s words');
  ok(!!(W.exitAgeText(3 * 3600e3, T) === '3 h ago' && /\(\{how\}, checked \{age\}\)/.test(DLG) && /exitAgeText\(Date\.now\(\) - Number\(kept\.checkedAt\), t\)/.test(DLG)),
    'the KEPT line says its age (measured or typed, and when it was checked) in the card\'s own words — where the Check press is');
  ok(!!(/const movePress = btn\(t\('Move the password to the vault'\), \(\) => doMove\(\), 'bproxy-move'\);/.test(PD) && /fetchJson\('\/api\/vault\/proxy-logins\/move'/.test(PD) && /The press below moves that password into the vault in one step/.test(PD)
     && /\.bwho-lose, \.bwho-refusal, \.bproxy-legacy \{ display: flex; align-items: flex-start; gap: 4px;/.test(CSS)),
    'the legacy note is answerable where it appears — the move\'s press IN the note (its sentence says what the press does; the menu item stays); ONE rule spaces every dialog note\'s mark');
  const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js'), miss = [...used].filter((k) => !ZH.includes(JSON.stringify(k) + ':') || !JA.includes(JSON.stringify(k) + ':'));
  ok(miss.length === 0, `every one of those ${used.size} sentences is in the zh and ja dictionaries`, miss);
}

report();
