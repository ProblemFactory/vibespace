#!/usr/bin/env node
// A BROWSER PROFILE'S PROXY REACHES ITS BROWSER (B-8b87, lane cli-update-needs-nothing — THE LAW: a field the form validates reaches
// the process it names, or the form does not show it). Stand-ins only: loopback stand-in proxies (HTTP CONNECT, SOCKS5), a stand-in
// vault, the fake agent-browser fixture under the REAL keeper — no real browser, no real site, no name ever resolved.
//   ① THE SHAPE (src/browser-profiles.js): normalizeProxy (http / https / socks5 `scheme://host:port`; a login in the address and socks4
//      refused by name), the vault entry's name and its rule (a login saved for ANOTHER proxy refused), the launch's verdict (a password
//      still in the profile, socks4, a paired machine — each by name), the public view (never the password; the move door's flag)
//   ② THE ONE RANKING (proxyRoadOf): every combination of profile / the person's config / the env / the tailnet. RED: a copy that ranks
//      the tailnet above the profile
//   ③ THE FORWARDER (src/server/egress-proxy.js upstream): a name the local resolver cannot resolve reaches the stand-in upstream AS THE
//      NAME (CONNECT host:port; SOCKS5 address type 3), with the login; a refusal is the 502 page with the vault's sentence. RED: a copy
//      that resolves the name locally first (a SPY stands in for the resolver — the box's is never asked). A plain http:// page through
//      each upstream: the origin's body arrives (RED: the socks road before the cure); an upstream's 407 is the forwarder's own page;
//      the SOCKS5 refusals by code; an IPv6 literal with an IPv4 tail refused, never mis-encoded
//   ④ THE ONE READER (src/server/browser-proxy-logins.js over a stand-in vault): save (locked refused), read (a use NOTED: door
//      browser-proxy, by the launch's actor), locked ⇒ the vault's own word, a name the vault holds nothing under ⇒ its word
//   ⑤ THE REAL KEEPER over the fake agent-browser: the switch on the driver's config is the forwarder's loopback port, the forwarder
//      carries the profile's proxy with its login, the login is NOWHERE in the launch / the calls / the store; a locked vault ⇒ the
//      launch refused by name, nothing launched; a password saved in the address ⇒ refused, and «Move the password to the vault»
//      moves it in one act (locked ⇒ nothing changed; a store that cannot be written ⇒ not_written, the vault entry kept). REDs: a keeper
//      that never stamps the switch; a keeper that starts despite the locked vault; a move that says done unwritten. A HUB RESTART adopts
//      the browser and re-binds its forwarder on the same port (the vault locked: re-bound, every request the locked page) — RED: the
//      line that ended it; the driver road FAIL-CLOSED (no config to carry the switch ⇒ refused by name, nothing launched — RED: the
//      call run without it); the person's own proxy switches out by the tree's one rule (RED: the four-switch filter); a cloud browser's
//      proxy refused at the creation and the edit
//   ⑥ THE PERSON'S DOORS: the routes sit behind person() (no bearer reaches a proxy login); an agent MAY give the address when it creates
//      a profile, never edits an existing profile's proxy and never names a login (the refusal names the card's Proxy… door); the vault
//      kind's row reads «no agent door»
//   ROUND 3: a teardown is never blocked (the config broken under a running browser ⇒ Stop still stops it — RED: the stop before; an
//      adoption keeps its record); a vault never set up is said as itself at the save and the move (server-driven into ⑦); the edit's
//      route answers 400; a switch onto a cloud browser refused at the press; the running road read from the keeper's own list
//   ⑦ THE PAGE'S WORDS (src/lib/browser-proxy-model.js): every refusal a person sees by its code in the page's words (never the server's
//      English), the locked one per act with its Unlock… press, a vault never set up its own; a login the vault no longer lists shown as
//      itself; the card's «from its next start»; New profile busy before the login is saved
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import tls from 'node:tls';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
// lane lg-store-writes (U5b, met at its gate): browser-profiles.json is the store writer's — a read of the FILE lands what the process owes
// first, LOUDLY (a write left owed would make the disk check prove nothing)
const landReg = () => { const r = require('../src/store-writer.js').storeWriter().flushSync(); if (r.deferred || (r.left && r.left.length)) throw new Error(`the store writer left owed writes: ${JSON.stringify(r.deferred ? 'deferred' : r.left).slice(0, 300)}`); };
const Module = require('node:module');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();   // B-1747 (the release's §7b): the ONE guarded helper — a condition is a boolean, a swap throws
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }
/** an in-memory copy of a src module with `from` replaced — its own requires resolve beside the original */
function mutant(rel, from, to) {
  const file = path.join(REPO, rel);
  let src = read(rel);
  for (const [a, b] of Array.isArray(from) ? from : [[from, to]]) {
    const at = src.split(a).length - 1;
    if (at !== 1) throw new Error(`mutant: ${rel} holds ${JSON.stringify(a.slice(0, 70))} ${at} times (exactly once wanted)`);
    src = src.split(a).join(b);
  }
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src, file);
  return m.exports;
}
const B = require('../src/browser-profiles.js');
const EP = require('../src/server/egress-proxy.js');
const PL = require('../src/server/browser-proxy-logins.js');
const USER = 'standin-user', PASS = ['standin', 'pw', String(process.pid)].join('-');   // built, never a literal secret
const NAME = 'shop.no-such-tld.invalid';
const withLogin = (scheme, hostPort) => scheme + '://' + [USER, PASS].join(':') + '@' + hostPort;   // an address saved WITH its login (before the law) — joined at run time   // a name no resolver answers (RFC 6761) — it must reach the upstream as itself

console.log('① THE SHAPE — the address alone; its login a vault entry saved for THAT proxy; each stored value a launch refuses, by name');
{
  const n = (v) => B.normalizeProxy(v);
  ok(n('http://proxy.example.test:3128').value === 'http://proxy.example.test:3128' && n('https://P.Example.TEST').value === 'https://p.example.test:443' && n('socks5h://10.0.0.5:1080').value === 'socks5://10.0.0.5:1080' && n('socks5://sx.example.test').value === 'socks5://sx.example.test:1080' && n('').value === null,
    'normalizeProxy: http / https / socks5 → `scheme://host:port` (the default port filled, the host lower-cased; socks5h reads as socks5); empty = none', [n('https://P.Example.TEST'), n('socks5h://10.0.0.5:1080')]);
  const inl = n(withLogin('http', 'proxy.example.test:3128')), s4 = n('socks4://proxy.example.test:1080'), port0 = n('http://proxy.example.test:0'), junk = n('ftp://x');
  ok(!!(!inl.ok && inl.code === 'bad_proxy_inline_credential' && /vault/.test(inl.error) && !inl.error.includes(PASS) && !s4.ok && /socks4/.test(s4.error) && !port0.ok && !junk.ok),
    '…refused: a login inside the address (bad_proxy_inline_credential — «the credential goes in the vault», the value never echoed), socks4, a port of 0, any other scheme', [inl.code, s4.error, port0.error]);
  const name = B.proxyLoginName('socks5://Sx.Example.Test:1080', USER);
  ok(name === `proxy-login:socks5://sx.example.test:1080#${USER}` && B.parseProxyLoginName(name).origin === 'socks5://sx.example.test:1080' && B.proxyLoginName('socks5://sx.example.test:1080', 'a b') === null && B.proxyLoginName(`http://${USER}:x@h:1`, USER) === null,
    'the vault entry: proxy-login:<scheme>://<host>:<port>#<user> — a user with a space or #, or an address carrying a login, makes none', name);
  const cOk = B.normalizeProxyCredential(name, 'socks5://sx.example.test:1080'), cOther = B.normalizeProxyCredential(name, 'http://evil.example.test:8080'), cJunk = B.normalizeProxyCredential('secret:abc', 'socks5://sx.example.test:1080');
  ok(!!(cOk.ok && cOk.value === name && !cOther.ok && cOther.code === 'bad_proxy_credential' && /never sent to another proxy/.test(cOther.error) && !cJunk.ok),
    'a profile\'s login must be the entry saved for ITS proxy — one saved for another host is refused (a login is never sent elsewhere); no other kind of entry', cOther.error);
  const V = (p) => B.proxyLaunchVerdict({ label: 'Work', ...p });
  const vNone = V({}), vOk = V({ proxy: 'socks5://sx.example.test:1080', proxyCredential: name }), vInl = V({ proxy: withLogin('http', 'proxy.example.test:3128') }), vS4 = V({ proxy: 'socks4://proxy.example.test:1080' }), vHost = V({ proxy: 'http://proxy.example.test:3128', host: 'm-1' }), vX = V({ proxy: 'http://evil.example.test:8080', proxyCredential: name });
  ok(!!(vNone.ok && vNone.proxy === null && vOk.ok && vOk.proxy.scheme === 'socks5' && vOk.proxy.port === 1080 && vOk.proxy.credential === name),
    'the launch verdict: no proxy ⇒ nothing to do; a proxy with its login ⇒ the forwarder\'s upstream (scheme, host, port, the entry\'s NAME)');
  ok(!!(vInl.code === 'proxy_password_in_profile' && /Move the password to the vault/.test(vInl.error) && !vInl.error.includes(PASS) && vS4.code === 'proxy_scheme_unsupported' && vHost.code === 'proxy_off_machine' && /this machine only, for now/.test(vHost.error) && vX.code === 'bad_proxy_credential'),
    '…refused BY NAME: a password still in the address (its sentence names «Move the password to the vault»), socks4, a paired machine («…works for browsers on this machine only, for now»), a login saved for another proxy', [vInl.code, vS4.code, vHost.code, vX.code]);
  const pv = B.publicProfileView({ id: 'p1', label: 'Work', proxy: withLogin('http', 'proxy.example.test:3128') }), pv2 = B.publicProfileView({ id: 'p2', label: 'X', proxy: 'http://proxy.example.test:3128', proxyCredential: name });
  ok(!JSON.stringify(pv).includes(PASS) && pv.proxyPasswordInProfile === true && !('proxyPasswordInProfile' in pv2) && pv2.proxyCredential === name,
    'the public view never carries the password — an address saved with it is drawn without it and flagged (the card\'s «Move the password to the vault»); the entry\'s NAME is no secret', pv.proxy);
  const ctl = (prov) => ({ ok: true, row: B.providerRow ? B.providerRow(prov) : { leaseKind: 'profile', starts: true } });
  const vc = B.validateProfileInput({ label: 'Remote', provider: 'chromium', proxy: 'http://proxy.example.test:3128', host: 'm-1' }, { existing: [], control: ctl, mediation: false });
  const vl = B.validateProfileInput({ label: 'Local', provider: 'chromium', proxy: 'http://proxy.example.test:3128' }, { existing: [], control: ctl, mediation: false });
  ok(!!(!vc.ok && vc.code === 'proxy_off_machine' && /this machine only, for now/.test(vc.error) && vl.ok && vl.value.proxy === 'http://proxy.example.test:3128' && vl.value.proxyCredential === null), 'a NEW profile on a paired machine with a proxy is refused at its creation too; on this machine it is kept, the address alone', [vc.code, vl.ok]);
}

{ // B-8b87 cure: a cloud browser runs at its vendor — refused at the start's verdict and at the creation (the edit: ⑤)
  const PX = 'socks5://p.example.test:1080', cv = B.proxyLaunchVerdict({ label: 'C', provider: 'cloud:browserbase', proxy: PX }), ci = B.validateProfileInput({ label: 'C', provider: 'cloud:browserbase', proxy: PX });
  ok(!!(!cv.ok && cv.code === 'proxy_cloud_browser' && !ci.ok && ci.code === 'proxy_cloud_browser' && B.proxyLaunchVerdict({ label: 'L', provider: 'chromium', proxy: PX }).ok),
    'a cloud browser (cloud:<vendor>) with a proxy: refused by name at the start\'s verdict and at the creation — a local browser\'s is not', [cv.code, ci.code]);
}
console.log('② THE ONE RANKING — profile > the person\'s browser config > the launch\'s env > the tailnet PAC > direct');
{
  const ROW = (R) => [0, 1].flatMap((a) => [0, 1].flatMap((b) => [0, 1].flatMap((c) => [0, 1].map((d) => R.proxyRoadOf({ profileProxy: !!a, userConfigProxy: !!b, envProxy: !!c, tailnet: !!d }).road)))).join(',');
  const want = (a, b, c, d) => (a ? 'profile' : b ? 'user-config' : c ? 'env' : d ? 'tailnet' : 'direct');
  const exp = [0, 1].flatMap((a) => [0, 1].flatMap((b) => [0, 1].flatMap((c) => [0, 1].map((d) => want(a, b, c, d))))).join(',');
  ok(ROW(B) === exp && B.proxyRoadOf({ profileProxy: true, tailnet: true }).explicit === true && B.proxyRoadOf({ tailnet: true }).explicit === false,
    'all 16 combinations rank as the kb paragraph says — and «explicit» (the tailnet PAC stays off) is every road but the tailnet\'s and direct', ROW(B));
  const BT = mutant('src/browser-profiles.js', "  if (profileProxy) return { road: 'profile', explicit: true, why: 'the profile\\'s own proxy' };", "  if (tailnet) return { road: 'tailnet', explicit: false, why: 'the tailnet PAC' };\n  if (profileProxy) return { road: 'profile', explicit: true, why: 'the profile\\'s own proxy' };");
  ok(ROW(BT) !== exp && BT.proxyRoadOf({ profileProxy: true, tailnet: true }).road === 'tailnet', 'RED: a copy that ranks the tailnet above the profile — the table above goes red on it');
  const KS = read('src/server/browser-keeper.js');
  ok(!!(/B\.proxyRoadOf\(\{ profileProxy: !!\(p && p\.proxy\), userConfigProxy: userConfigProxy\(\), envProxy: [^}]+, tailnet: true \}\)\.explicit/.test(KS) && !/const explicit = !!\(p && p\.proxy\) \|\|/.test(KS)),
    'the keeper keeps no second ranking: the tailnet road\'s «explicit» IS proxyRoadOf\'s');
}

// ── the stand-in upstreams (loopback): an HTTP CONNECT proxy and a SOCKS5 proxy with a user name and password ──
const seen = [];
const answer = (c, body) => c.end(`HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);   // the ORIGIN's page, served by the stand-in upstream
const httpProxyConn = (c) => { c.on('error', () => { }); let b = ''; c.on('data', function f(d) { b += d.toString('latin1'); const i = b.indexOf('\r\n\r\n'); if (i < 0) return; c.removeListener('data', f); const auth = (/proxy-authorization: basic (\S+)/i.exec(b) || [])[1], first = b.split('\r\n')[0], login = auth ? Buffer.from(auth, 'base64').toString() : null; if (/^GET http:\/\//.test(first)) { seen.push({ kind: 'http-get', line: first, login }); return answer(c, 'origin-body ' + first.split(' ')[1]); } seen.push({ kind: 'http', line: first, login }); c.write('HTTP/1.1 200 OK\r\n\r\n'); c.on('data', (x) => c.write(x)); }); };
const httpUp = net.createServer(httpProxyConn);
const socksUp = net.createServer((c) => { c.on('error', () => { }); let st = 0, b = Buffer.alloc(0); c.on('data', (d) => { b = Buffer.concat([b, d]);
  for (;;) {
    if (st === 0 && b.length >= 2 && b.length >= 2 + b[1]) { const ms = [...b.subarray(2, 2 + b[1])]; b = b.subarray(2 + b[1]); c.write(Buffer.from([5, ms.includes(2) ? 2 : 0xff])); st = 1; continue; }
    if (st === 1 && b.length >= 2 && b.length >= 3 + b[1] && b.length >= 3 + b[1] + b[2 + b[1]]) { const ul = b[1], u = b.subarray(2, 2 + ul).toString(), pl = b[2 + ul], p = b.subarray(3 + ul, 3 + ul + pl).toString(); b = b.subarray(3 + ul + pl); seen.push({ kind: 'socks-auth', login: `${u}:${p}` }); c.write(Buffer.from([1, u === USER && p === PASS ? 0 : 1])); st = 2; continue; }
    if (st === 2 && b.length >= 5) { const at = b[3], need = at === 3 ? 5 + b[4] + 2 : at === 1 ? 10 : 22; if (b.length < need) break; seen.push({ kind: 'socks-connect', atyp: at, name: at === 3 ? b.subarray(5, 5 + b[4]).toString() : null, port: b.readUInt16BE(need - 2) }); b = b.subarray(need); c.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0])); st = 3; continue; }
    if (st === 3 && b.length) { const s0 = b.toString('latin1'); if (/^GET \//.test(s0)) { if (!s0.includes('\r\n\r\n')) break; seen.push({ kind: 'socks-get', line: s0.split('\r\n')[0] }); b = Buffer.alloc(0); answer(c, 'origin-body ' + s0.split(' ')[1]); break; } c.write(b); b = Buffer.alloc(0); }
    break;
  } }); });
// an http proxy that answers 407 to every request; a SOCKS5 proxy that refuses by `badMode` (no acceptable method · reply 5 · address type 9)
const up407 = net.createServer((c) => { c.on('error', () => { }); c.once('data', () => c.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="standin"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')); });
let badMode = 'noauth';
const socksBad = net.createServer((c) => { c.on('error', () => { }); let st = 0; c.on('data', (d) => {
  if (st === 0) { st = 1; return c.write(Buffer.from([5, badMode === 'noauth' ? 0xff : 0])); }
  if (st === 1) { st = 2; return c.write(Buffer.from(badMode === 'reply5' ? [5, 5, 0, 1, 0, 0, 0, 0, 0, 0] : [5, 0, 0, 9, 0, 0, 0, 0, 0, 0])); }
}); });
// an HTTPS proxy: the same stand-in behind TLS — a throwaway self-signed certificate for 127.0.0.1 (openssl, as the tree's
// connection-notice suite makes its TLS stand-in), trusted only through the forwarder's tlsConnect seam (its CA)
const TLS_DIR = scratch('bproxy-tls');
fs.mkdirSync(TLS_DIR, { recursive: true });
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(TLS_DIR, 'k.pem'), '-out', path.join(TLS_DIR, 'c.pem'), '-days', '2', '-subj', '/CN=standin', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
const TLS_CERT = fs.readFileSync(path.join(TLS_DIR, 'c.pem'));
const httpsUp = tls.createServer({ key: fs.readFileSync(path.join(TLS_DIR, 'k.pem')), cert: TLS_CERT }, httpProxyConn);
fs.rmSync(TLS_DIR, { recursive: true, force: true });
const tlsConnect = (o) => tls.connect({ ...o, ca: TLS_CERT });
for (const s of [httpUp, socksUp, up407, socksBad, httpsUp]) await new Promise((r) => s.listen(0, '127.0.0.1', r));
const HTTP_UP = httpUp.address().port, SOCKS_UP = socksUp.address().port, UP407 = up407.address().port, BAD_UP = socksBad.address().port, HTTPS_UP = httpsUp.address().port;
/** a plain http:// GET through the forwarder on `port` → the whole answer ('timeout' after `waitMs`) */
const plain = (port, host = NAME, p = '/page', waitMs = 6000) => new Promise((res) => {
  const s = net.connect(port, '127.0.0.1', () => s.write(`GET http://${host}${p} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`));
  let b = ''; const t = setTimeout(() => { s.destroy(); res('timeout ' + b); }, waitMs);
  s.on('data', (d) => { b += d.toString(); }); s.on('end', () => { clearTimeout(t); res(b); }); s.on('error', (e) => { clearTimeout(t); res('ERR ' + e.message + ' ' + b); });
});
/** a CONNECT to NAME:443 through the forwarder on `port` → '<status line> | echoed' or the answer's body */
const tunnel = (port, host = NAME) => new Promise((res) => {
  const s = net.connect(port, '127.0.0.1', () => s.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`));
  let b = ''; const t = setTimeout(() => { s.destroy(); res('timeout'); }, 5000);
  s.on('data', (d) => { b += d.toString(); if (!b.includes('\r\n\r\n')) return; if (b.startsWith('HTTP/1.1 200') && !b.includes('ping')) { s.write('ping'); return; } clearTimeout(t); s.destroy(); res(b.startsWith('HTTP/1.1 200') ? `${b.split('\r\n')[0]} | echoed` : `${b.split('\r\n')[0]} | ${(b.split('\r\n\r\n')[1] || '').trim()}`); });
  s.on('error', (e) => { clearTimeout(t); res('ERR ' + e.message); });
});

console.log('③ THE FORWARDER — the destination\'s NAME goes upstream, with the login; never resolved here, never direct');
{
  const mk = (upstream, mod = EP) => mod.create({ allow: () => ({ allow: true }), upstream, log: { log() { }, warn() { } } });
  const f1 = mk(() => ({ scheme: 'http', host: '127.0.0.1', port: HTTP_UP, auth: { user: USER, pass: PASS } }));
  const f2 = mk(() => ({ scheme: 'socks5', host: '127.0.0.1', port: SOCKS_UP, auth: { user: USER, pass: PASS } }));
  seen.length = 0;
  const r1 = await tunnel(await f1.listen()), r2 = await tunnel(await f2.listen());
  const h = seen.find((x) => x.kind === 'http'), sa = seen.find((x) => x.kind === 'socks-auth'), sc = seen.find((x) => x.kind === 'socks-connect');
  ok(!!(/200 Connection Established \| echoed/.test(r1) && h && h.line === `CONNECT ${NAME}:443 HTTP/1.1` && h.login === `${USER}:${PASS}`),
    `through an HTTP proxy: the stand-in upstream sees «CONNECT ${NAME}:443» — the NAME, which no resolver answers — with the profile's login (Basic)`, [r1, h && h.line]);
  ok(!!(/200 Connection Established \| echoed/.test(r2) && sa && sa.login === `${USER}:${PASS}` && sc && sc.atyp === 3 && sc.name === NAME && sc.port === 443),
    '…through a SOCKS5 proxy: the login (RFC 1929), then the destination as the domain-name address type (3) — the NAME, never an address resolved here', [r2, sc]);
  const f3 = mk(() => ({ refused: { code: 'proxy_credential_unreadable', sentence: PL.LOCKED } }));
  const r3 = await tunnel(await f3.listen());
  ok(!!(/^HTTP\/1\.1 502/.test(r3) && r3.includes("a person unlocks it on this instance's page") && seen.length === 3),
    'a refusal (the vault locked) is the 502 page that says where to unlock — and no upstream, no direct dial was made', r3);
  const EPx = mutant('src/server/egress-proxy.js', 'async function dialVia(up, host, port, { timeoutMs = 10000, tlsConnect = tls.connect } = {}) {', 'async function dialVia(up, host, port, { timeoutMs = 10000, tlsConnect = tls.connect } = {}) {\n  await require(\'dns\').promises.lookup(host);   // RED: resolved here first');
  const fx = mk(() => ({ scheme: 'http', host: '127.0.0.1', port: HTTP_UP }), EPx);
  seen.length = 0;
  // a SPY stands in for the resolver (the box's is never asked): it notes the name and answers as no resolver would
  const dns = require('node:dns'), realLookup = dns.promises.lookup, asked = [];
  dns.promises.lookup = async (h) => { asked.push(h); throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${h}`), { code: 'ENOTFOUND' }); };
  let rx;
  try { rx = await tunnel(await fx.listen()); } finally { dns.promises.lookup = realLookup; }
  ok(!/echoed/.test(rx) && seen.length === 0 && asked.length === 1 && asked[0] === NAME, 'RED: a copy that resolves the name locally first (the spy heard it ask) — the tunnel fails and the upstream never sees the name', [rx, asked]);
  // B-8b87 cure — a plain http:// page through each upstream: the origin's body arrives
  const fg1 = mk(() => ({ scheme: 'http', host: '127.0.0.1', port: HTTP_UP, auth: { user: USER, pass: PASS } }));
  const fg2 = mk(() => ({ scheme: 'socks5', host: '127.0.0.1', port: SOCKS_UP, auth: { user: USER, pass: PASS } }));
  seen.length = 0;
  const g1 = await plain(await fg1.listen()), g2 = await plain(await fg2.listen());
  const hg = seen.find((x) => x.kind === 'http-get'), sg = seen.find((x) => x.kind === 'socks-get'), sc2 = seen.find((x) => x.kind === 'socks-connect');
  ok(!!(/^HTTP\/1\.1 200/.test(g1) && g1.includes(`origin-body http://${NAME}/page`) && hg && hg.line === `GET http://${NAME}/page HTTP/1.1` && hg.login === `${USER}:${PASS}`),
    'a plain http:// page through an HTTP proxy: the absolute form goes upstream with the login, and the origin\'s body arrives', [g1.slice(0, 160), hg]);
  ok(!!(/^HTTP\/1\.1 200/.test(g2) && g2.includes('origin-body /page') && sc2 && sc2.atyp === 3 && sc2.name === NAME && sc2.port === 80 && sg && sg.line === 'GET /page HTTP/1.1'),
    '…through a SOCKS5 proxy: a tunnel to the NAME on port 80, the request inside it, and the origin\'s body arrives (not the ten-second bound)', [g2.slice(0, 160), sc2]);
  const EPr = mutant('src/server/egress-proxy.js', 'createConnection: () => { setImmediate(() => { try { t.resume(); } catch { /* gone */ } }); return t; }', 'createConnection: () => t');
  const fr = EPr.create({ allow: () => ({ allow: true }), upstream: () => ({ scheme: 'socks5', host: '127.0.0.1', port: SOCKS_UP, auth: { user: USER, pass: PASS } }), connectTimeoutMs: 1500, log: { log() { }, warn() { } } });
  // it asserts only that NO body arrives: 1 s is a hundred times the green pages above (about 10 ms each on the box)
  const gr = await plain(await fr.listen(), NAME, '/page', 1000);
  ok(!gr.includes('origin-body'), 'RED: the socks road before the cure (the reader\'s paused socket handed to the http client, never resumed) — the body never arrives', gr.slice(0, 160));
  const f407 = mk(() => ({ scheme: 'http', host: '127.0.0.1', port: UP407, auth: { user: USER, pass: PASS } }));
  const g4 = await plain(await f407.listen());
  ok(!!(/^HTTP\/1\.1 502/.test(g4) && g4.includes('refused its user name and password (407)') && g4.includes('(proxy_auth_refused)') && !/proxy-authenticate/i.test(g4)),
    'an upstream\'s 407 on a plain page is the forwarder\'s own named page (502) — never passed on (no Proxy-Authenticate: the browser raises no login prompt for the proxy)', g4.slice(0, 260));
  // the SOCKS5 refusals by code — each the forwarder's 502, never a hang
  const said = {};
  for (const mode of ['noauth', 'reply5', 'atyp9']) { badMode = mode; const fb = mk(() => ({ scheme: 'socks5', host: '127.0.0.1', port: BAD_UP, auth: { user: USER, pass: PASS } })); said[mode] = await tunnel(await fb.listen()); await fb.close({ cut: true }); }
  const fw = mk(() => ({ scheme: 'socks5', host: '127.0.0.1', port: SOCKS_UP, auth: { user: USER, pass: 'not-' + PASS } }));
  said.wrong = await tunnel(await fw.listen());
  ok(!!(/^HTTP\/1\.1 502/.test(said.noauth) && said.noauth.includes('(proxy_auth_refused)') && said.wrong.includes('(proxy_auth_refused)') && said.reply5.includes('SOCKS5 reply 5') && said.reply5.includes('(proxy_refused)') && said.atyp9.includes('an address type SOCKS5 does not define (9)') && said.atyp9.includes('(proxy_refused)')),
    'the SOCKS5 refusals by code: no acceptable method or a wrong login ⇒ proxy_auth_refused; the proxy\'s own reply 5 and an undefined address type ⇒ proxy_refused — each the 502 page, at once', said);
  seen.length = 0;
  const fm = mk(() => ({ scheme: 'socks5', host: '127.0.0.1', port: SOCKS_UP, auth: { user: USER, pass: PASS } }));
  const rm = await tunnel(await fm.listen(), '[::ffff:192.0.2.1]');
  ok(!!(/^HTTP\/1\.1 502/.test(rm) && rm.includes('IPv4 tail') && !seen.some((x) => x.kind === 'socks-connect')),
    'an IPv6 address written with an IPv4 tail (::ffff:a.b.c.d) is refused by name — never encoded as another address', rm.slice(0, 200));
  // an HTTPS proxy: TLS to the proxy itself, then the same CONNECT / absolute form inside it
  const fh = EP.create({ allow: () => ({ allow: true }), upstream: () => ({ scheme: 'https', host: '127.0.0.1', port: HTTPS_UP, auth: { user: USER, pass: PASS } }), tlsConnect, log: { log() { }, warn() { } } });
  seen.length = 0;
  const ph = await fh.listen(), th = await tunnel(ph), gh = await plain(ph);
  const hh = seen.find((x) => x.kind === 'http'), hgh = seen.find((x) => x.kind === 'http-get');
  ok(!!(/echoed/.test(th) && hh && hh.line === `CONNECT ${NAME}:443 HTTP/1.1` && hh.login === `${USER}:${PASS}` && gh.includes(`origin-body http://${NAME}/page`) && hgh && hgh.login === `${USER}:${PASS}`),
    'through an HTTPS proxy (TLS to the proxy, its certificate checked): the tunnel to the NAME with the login, and a plain page\'s body', [th, gh.slice(0, 120)]);
  for (const f of [f1, f2, f3, fx, fg1, fg2, fr, f407, fw, fm, fh]) await f.close({ cut: true });
}

// ── a stand-in vault: the engine's verbs the proxy-login module uses (state / secretPut / secretGet / secretDrop / secretNames / noteUse) ──
function standinVault({ setUp = true } = {}) {
  const v = { locked: false, entries: new Map(), uses: [] };
  return Object.assign(v, {
    state: () => (!setUp ? 'not_set_up' : v.locked ? 'locked' : 'unlocked'),   // = the vault engine's three states
    secretPut: (name, value) => { if (!setUp) return { ok: false, code: 'vault_not_set_up' }; if (v.locked) return { ok: false, code: 'key-unreadable:vault_locked' }; v.entries.set(name, Buffer.from(value)); return { ok: true }; },
    secretGet: (name) => (v.locked ? { ok: false, code: 'key-unreadable:vault_locked' } : { ok: true, value: v.entries.has(name) ? Buffer.from(v.entries.get(name)) : null }),
    secretDrop: (name) => { v.entries.delete(name); return { ok: true }; },
    secretNames: () => [...v.entries.keys()].map((name) => ({ name, at: 1 })),
    noteUse: (entry, use, o) => { v.uses.push({ entry, ...use, outcome: o.outcome }); return { receipt: null }; },
  });
}

console.log('④ THE ONE READER — save a person\'s, read the forwarder\'s with its use noted; locked and absent said by the vault\'s own word');
{
  const vault = standinVault(), pl = PL.create({ vault, log: { log() { }, warn() { } } });
  vault.locked = true;
  const s0 = pl.save({ proxy: 'socks5://sx.example.test:1080', user: USER, password: PASS });
  const lockedWrote = vault.entries.size;
  vault.locked = false;
  const s1 = pl.save({ proxy: 'socks5://sx.example.test:1080', user: USER, password: PASS });
  ok(!!(!s0.ok && s0.code === 'vault_locked' && lockedWrote === 0 && s1.ok && s1.name === `proxy-login:socks5://sx.example.test:1080#${USER}` && vault.entries.get(s1.name).toString() === PASS && pl.names().length === 1 && !JSON.stringify(pl.names()).includes(PASS)),
    'save: locked ⇒ refused, nothing written; unlocked ⇒ ONE entry, the password its value (the user in its name); names() lists names only', [s0.code, s1.name]);
  const r = pl.read(s1.name, { by: 'agent', conv: 'bk-0000a0a1', actor: 'a conversation' });
  ok(!!(r.ok && r.user === USER && r.pass === PASS && vault.uses.length === 1 && vault.uses[0].door === 'browser-proxy' && vault.uses[0].by === 'agent' && vault.uses[0].conv === 'bk-0000a0a1' && vault.uses[0].outcome === 'ok'),
    'read: the login, and the reading NOTED on the entry — door browser-proxy, by the launch\'s actor (an agent\'s launch ⇒ an audit line in the real engine)', vault.uses[0]);
  vault.locked = true;
  const rl = pl.read(s1.name);
  vault.locked = false;
  const ra = pl.read(`proxy-login:socks5://sx.example.test:1080#nobody`);
  ok(!!(!rl.ok && rl.code === 'proxy_credential_unreadable' && rl.word === 'key-unreadable:vault_locked' && /a person unlocks it on this instance's page \(Unlock…\)/.test(rl.error) && !ra.ok && ra.word === 'proxy_login_no_entry' && vault.uses.length === 3 && vault.uses[1].outcome === 'vault_locked'),
    'locked ⇒ the vault\'s own word (key-unreadable:vault_locked) and a sentence naming where to unlock; a name the vault holds nothing under ⇒ proxy_login_no_entry; each refusal NOTED too', [rl.word, ra.word]);
}

console.log('⑤ THE REAL KEEPER — the switch, the forwarder\'s upstream, the login nowhere; refused by name when locked; the move in one act');
const ROOT = scratch('bproxy');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const HOME = path.join(ROOT, 'home');
fs.mkdirSync(HOME, { recursive: true });
const fake = writeFakeAgentBrowser(path.join(ROOT, 'bin'), path.join(ROOT, 'ab-state'));
const cdpSrv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: 'Chrome/149.0.1.1' })); });
const CDP_PORT = await new Promise((r) => cdpSrv.listen(0, '127.0.0.1', () => r(cdpSrv.address().port)));
const PATH_ENV = `${path.join(ROOT, 'bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
process.on('exit', () => { fake.reap(); for (const s of [cdpSrv, httpUp, socksUp, up407, socksBad, httpsUp]) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
const K = require('../src/server/browser-keeper.js');
const mkKeeper = (dataDir, extra = {}, mod = K) => { fs.mkdirSync(dataDir, { recursive: true }); return mod.create({ dataDir, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: { add: () => ({ id: 'u1' }) }, ...extra }); };
const thr = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
let NOT_SET_UP = null;   // round 3: the server's own answers for a vault never set up (⑤) — the page's words read THEM (⑦)
{
  const vault = standinVault(), pl = PL.create({ vault, log: { log() { }, warn() { } } });
  const proxyUrl = `http://127.0.0.1:${HTTP_UP}`;
  const ref = pl.save({ proxy: proxyUrl, user: USER, password: PASS }).name;
  const D1 = path.join(ROOT, 'data-1'), k = mkKeeper(D1, { proxyLogins: pl });
  const p = k.createProfile({ label: 'Proxied', proxy: proxyUrl, proxyCredential: ref });
  vault.uses.length = 0;
  const n0 = fake.launches().length;
  await k.start(p.id, { why: 'user' });
  const L = fake.launches().at(-1) || {};
  const args = (L.config && Array.isArray(L.config.args) ? L.config.args : String((L.config && L.config.args) || '').split(/\s*[,\n]\s*/)).filter(Boolean);
  const sw = args.find((a) => /^--proxy-server=/.test(a)) || '';
  const port = Number((/^--proxy-server=http:\/\/127\.0\.0\.1:(\d+)$/.exec(sw) || [])[1] || 0);
  const store = (landReg(), fs.readFileSync(path.join(D1, 'browser-profiles.json'), 'utf8'));
  const recEg = (JSON.parse(store).browsers || {})[p.id]?.egress || null;
  ok(!!(args.includes(require('../src/browser-engines.js').PROXY_UDP_ARG)), 'the driver\'s road: the launch\'s config also carries the WebRTC policy (UDP only through a proxy) beside the switch', args.filter((a) => /proxy|webrtc/.test(a)));
  ok(!!(fake.launches().length === n0 + 1 && port > 0 && recEg && recEg.port === port && recEg.proxy && recEg.proxy.credential === ref),
    'the driver\'s road: the launch\'s config carries ONE --proxy-server=http://127.0.0.1:<port> — the forwarder\'s, whose port the record keeps (the boot re-binds THAT port) with the profile\'s proxy and the entry\'s NAME', { sw, recEg });
  seen.length = 0;
  const rt = port ? await tunnel(port) : 'no port';
  const h = seen.find((x) => x.kind === 'http');
  ok(!!(/echoed/.test(rt) && h && h.line === `CONNECT ${NAME}:443 HTTP/1.1` && h.login === `${USER}:${PASS}`),
    'the forwarder on that port carries the profile\'s proxy as its upstream: the stand-in sees the NAME and the login from the vault', [rt, h]);
  const callsText = JSON.stringify(fake.calls()) + JSON.stringify(fake.launches());
  ok(!store.includes(PASS) && !callsText.includes(PASS) && !callsText.includes(USER) && !JSON.stringify(args).includes(PASS),
    'the login is NOWHERE in the launch (its config, its argv prefix, every call the CLI got) nor in the profiles store — the forwarder alone holds it');
  ok(vault.uses.length === 1 && vault.uses[0].door === 'browser-proxy' && vault.uses[0].by === 'human' && vault.uses[0].outcome === 'ok',
    'the start read it ONCE through the one reader, a use noted with the launch\'s actor (the person\'s start ⇒ by human)', vault.uses);
  await k.stop(p.id, { why: 'user' });
  // the vault locked ⇒ refused by name, nothing launched
  vault.locked = true;
  const n1 = fake.launches().length;
  const eL = await thr(() => k.start(p.id, { why: 'user' }));
  ok(!!(eL && eL.code === 'proxy_credential_unreadable' && /a person unlocks it on this instance's page \(Unlock…\)/.test(eL.message) && fake.launches().length === n1),
    'the vault locked ⇒ the launch is REFUSED by name (proxy_credential_unreadable, the vault\'s sentence) — nothing launched, never a direct connection', eL && [eL.code, eL.message]);
  const KD = mutant('src/server/browser-keeper.js', "      if (c.refused) throw namedError('proxy_credential_unreadable',", "      if (false) throw namedError('proxy_credential_unreadable',");
  const kd = mkKeeper(path.join(ROOT, 'data-red-1'), { proxyLogins: pl }, KD);
  const pd = kd.createProfile({ label: 'Red one', proxy: proxyUrl, proxyCredential: ref });
  const n2 = fake.launches().length;
  const eD = await thr(() => kd.start(pd.id, { why: 'user' }));
  ok(!eD && fake.launches().length === n2 + 1, 'RED: a keeper that starts despite the locked vault — it launched (the leg above goes red on it)', eD && eD.code);
  try { await kd.stop(pd.id, { why: 'user' }); } catch { }
  vault.locked = false;
  const KS = mutant('src/server/browser-keeper.js', "      rec.proxyRoad = pproxy && !buildEnv.engine ?", "      rec.proxyRoad = false && pproxy && !buildEnv.engine ?");
  const ks = mkKeeper(path.join(ROOT, 'data-red-2'), { proxyLogins: pl }, KS);
  const ps = ks.createProfile({ label: 'Red two', proxy: proxyUrl, proxyCredential: ref });
  await ks.start(ps.id, { why: 'user' });
  const Ls = fake.launches().at(-1) || {};
  ok(!JSON.stringify(Ls.config || {}).includes('--proxy-server='), 'RED: a keeper that never stamps the switch — the launch carries no --proxy-server (the driver-road leg goes red on it)');
  try { await ks.stop(ps.id, { why: 'user' }); } catch { }
  // a password saved in the address before the law ⇒ refused by name; «Move the password to the vault» in one act
  const D2 = path.join(ROOT, 'data-2');
  const k2a = mkKeeper(D2, { proxyLogins: pl });
  const pm = k2a.createProfile({ label: 'Legacy', proxy: proxyUrl });
  const doc = JSON.parse((landReg(), fs.readFileSync(path.join(D2, 'browser-profiles.json'), 'utf8')));
  doc.profiles.find((x) => x.id === pm.id).proxy = withLogin('http', `127.0.0.1:${HTTP_UP}`);
  fs.writeFileSync(path.join(D2, 'browser-profiles.json'), JSON.stringify(doc));
  const k2 = mkKeeper(D2, { proxyLogins: pl });
  const view = JSON.stringify(k2.list().profiles.find((x) => x.id === pm.id) || null);
  const n3 = fake.launches().length;
  const eP = await thr(() => k2.start(pm.id, { why: 'user' }));
  ok(!!(eP && eP.code === 'proxy_password_in_profile' && /Move the password to the vault/.test(eP.message) && !eP.message.includes(PASS) && fake.launches().length === n3 && !view.includes(PASS)),
    'a password saved IN the address before this law ⇒ never used: the launch refused by name, its sentence naming «Move the password to the vault» — nothing launched', eP && eP.code);
  ok(!!(view.includes('"proxyPasswordInProfile":true') && !view.includes(PASS)), 'the keeper\'s list masks it: the card\'s row flags the password in the address and never carries it', view.slice(0, 200));
  const storeL0 = (landReg(), fs.readFileSync(path.join(D2, 'browser-profiles.json'), 'utf8')), entriesL0 = vault.entries.size;
  vault.locked = true;
  const mL = await k2.moveProxyPassword(pm.id);
  vault.locked = false;
  ok(!!(!mL.ok && mL.code === 'vault_locked' && fs.readFileSync(path.join(D2, 'browser-profiles.json'), 'utf8') === storeL0 && vault.entries.size === entriesL0 && JSON.stringify(k2.list().profiles.find((x) => x.id === pm.id)).includes('"proxyPasswordInProfile":true')),
    '«Move the password to the vault» with the vault locked ⇒ NOTHING changed: the profiles store byte for byte, the vault\'s entries, the card\'s flag', mL.code);
  const before = vault.entries.size;
  const mv = await k2.moveProxyPassword(pm.id);
  const store2 = (landReg(), fs.readFileSync(path.join(D2, 'browser-profiles.json'), 'utf8'));
  const row = JSON.parse(store2).profiles.find((x) => x.id === pm.id);
  ok(!!(!mL.ok && mL.code === 'vault_locked' && store2.length > 0 && mv.ok && mv.credential === `proxy-login:http://127.0.0.1:${HTTP_UP}#${USER}` && vault.entries.get(mv.credential).toString() === PASS && vault.entries.size <= before + 1
     && row.proxy === `http://127.0.0.1:${HTTP_UP}` && row.proxyCredential === mv.credential && !store2.includes(PASS) && !JSON.stringify(mv).includes(PASS)),
    '«Move the password to the vault» — locked ⇒ nothing changes; unlocked ⇒ ONE press: the vault entry made, the row rewritten to the address + that entry, the password GONE from the profiles store', [mL.code, mv.credential, row.proxy]);
  await k2.start(pm.id, { why: 'user' });
  ok(!!(JSON.stringify((fake.launches().at(-1) || {}).config || {}).includes('--proxy-server=http://127.0.0.1:')), '…and its next start goes through its proxy, the login read from the vault');
  try { await k2.stop(pm.id, { why: 'user' }); } catch { }
  try { await k.stop(p.id, { why: 'user' }); } catch { }
  // B-8b87 cure — a store that cannot be written ⇒ not_written: the vault entry kept, the file and the card as they were
  const legacyIn = (dir, label) => { const kk = mkKeeper(dir, { proxyLogins: pl }); const pp = kk.createProfile({ label, proxy: proxyUrl }); const d0 = JSON.parse((landReg(), fs.readFileSync(path.join(dir, 'browser-profiles.json'), 'utf8'))); d0.profiles.find((x) => x.id === pp.id).proxy = withLogin('http', `127.0.0.1:${HTTP_UP}`); fs.writeFileSync(path.join(dir, 'browser-profiles.json'), JSON.stringify(d0)); return pp.id; };
  const moveUnwritten = async (dir, mod) => { const id = legacyIn(dir, 'Unwritten'); const kk = mkKeeper(dir, { proxyLogins: pl }, mod); kk.list(); const f0 = (landReg(), fs.readFileSync(path.join(dir, 'browser-profiles.json'), 'utf8')); fs.chmodSync(dir, 0o500); let m; try { m = await kk.moveProxyPassword(id); } finally { fs.chmodSync(dir, 0o700); } return { m, same: fs.readFileSync(path.join(dir, 'browser-profiles.json'), 'utf8') === f0, card: JSON.stringify(kk.list().profiles.find((x) => x.id === id)) }; };
  const u4 = await moveUnwritten(path.join(ROOT, 'data-4'));
  ok(!!(u4.m && !u4.m.ok && u4.m.code === 'not_written' && u4.same && vault.entries.has(u4.m.credential) && u4.card.includes('"proxyPasswordInProfile":true')),
    '«Move the password to the vault» with a profiles store that cannot be written ⇒ not_written: the vault entry kept, the file and the card still say the password is in the profile (never «done»)', u4.m);
  const u4r = await moveUnwritten(path.join(ROOT, 'data-4r'), mutant('src/server/browser-keeper.js', '      if (failed) { p.proxy = was.proxy;', '      if (false) { p.proxy = was.proxy;')   /* the deferred-save census: the guard is the landed write's failure now */);
  ok(!!(u4r.m && u4r.m.ok === true && u4r.same), 'RED: a move that does not ask its write — «done» while the file still holds the password (the leg above goes red on it)', u4r.m && u4r.m.ok);
  // B-8b87 cure — A HUB RESTART: the browser of a profile with a proxy is ADOPTED, its forwarder re-bound on the SAME port
  const D3 = path.join(ROOT, 'data-3'), k3 = mkKeeper(D3, { proxyLogins: pl });
  const p3 = k3.createProfile({ label: 'Survivor', proxy: proxyUrl, proxyCredential: ref });
  await k3.start(p3.id, { why: 'user' });
  const port3 = (k3._reg().browsers[p3.id].egress || {}).port, pid3 = k3._reg().browsers[p3.id].pid;
  k3.shutdown?.(); await k3._forwardersClose();
  const k3b = mkKeeper(D3, { proxyLogins: pl });
  await k3b.adoptAll();
  const r3 = k3b._reg().browsers[p3.id];
  seen.length = 0;
  const t3 = port3 ? await tunnel(port3) : 'no port';
  ok(!!(r3.state === 'ready' && r3.adoptedAt && r3.pid === pid3 && (r3.egress || {}).port === port3 && /echoed/.test(t3) && seen.some((x) => x.kind === 'http' && x.line === `CONNECT ${NAME}:443 HTTP/1.1` && x.login === `${USER}:${PASS}`)),
    'a hub restart: a new keeper over the same store ADOPTS the profile\'s browser and re-binds its forwarder on the SAME port — the proxy and its login carried again', { state: r3.state, lastError: r3.lastError, port3, t3 });
  k3b.shutdown?.(); await k3b._forwardersClose();
  vault.locked = true;
  const k3c = mkKeeper(D3, { proxyLogins: pl });
  await k3c.adoptAll();
  const r3c = k3c._reg().browsers[p3.id];
  seen.length = 0;
  const t3c = port3 ? await tunnel(port3) : 'no port';
  vault.locked = false;
  ok(!!(r3c.state === 'ready' && /^HTTP\/1\.1 502/.test(t3c) && t3c.includes("a person unlocks it on this instance's page") && seen.length === 0),
    '…the vault locked at that restart: still adopted and re-bound, every request answered with the locked page — no upstream dial, never direct', { state: r3c.state, t3c });
  k3c.shutdown?.(); await k3c._forwardersClose();
  const k3r = mkKeeper(D3, { proxyLogins: pl }, mutant('src/server/browser-keeper.js', " && !(typeof e.engine === 'string' && e.engine) && !proxyOfRecord(e.proxy)) return", " && !(typeof e.engine === 'string' && e.engine)) return"));
  await k3r.adoptAll();
  const r3r = k3r._reg().browsers[p3.id];
  ok(!!(r3r.state !== 'ready' && /no engine names it/.test(String(r3r.lastError || (r3r.endAtBoot && r3r.endAtBoot.why) || ''))), 'RED: the line before the cure — the restart ENDS that browser («no engine names it»; the adoption leg goes red on it)', { state: r3r.state, lastError: r3r.lastError });
  k3r.shutdown?.(); await k3r._forwardersClose();
  // B-8b87 cure — THE DRIVER ROAD FAILS CLOSED: no config file to carry the switch ⇒ the start refused by name, nothing launched
  const HOME2 = path.join(ROOT, 'home-2');
  fs.mkdirSync(path.dirname(path.join(HOME2, B.USER_CONFIG_REL)), { recursive: true });
  fs.writeFileSync(path.join(HOME2, B.USER_CONFIG_REL), '{ not json');
  const noConfig = async (dir, mod) => { const kk = mkKeeper(dir, { proxyLogins: pl, homeDir: HOME2 }, mod); const pp = kk.createProfile({ label: 'No config', proxy: proxyUrl, proxyCredential: ref }); const n = fake.launches().length; const e = await thr(() => kk.start(pp.id, { why: 'user' })); const launched = fake.launches().length - n; try { await kk.stop(pp.id, { why: 'user' }); } catch { } kk.shutdown?.(); await kk._forwardersClose(); return { e, launched, last: launched ? fake.launches().at(-1) : null }; };
  const nc = await noConfig(path.join(ROOT, 'data-5'));
  ok(!!(nc.e && nc.e.code === 'egress_proxy_missing' && nc.launched === 0), 'a browser that rides its profile\'s proxy with NO config file to carry the switch (the person\'s config unreadable) ⇒ the start refused by name (egress_proxy_missing) — nothing launched, never direct', nc.e && [nc.e.code, nc.e.message]);
  const ncr = await noConfig(path.join(ROOT, 'data-5r'), mutant('src/server/browser-keeper.js', '      if (r0 && r0.proxyRoad && r0.proxyRoad.arg && !NO_PAGE_CALLS.has(m)) throw namedError(', '      if (false) throw namedError('));
  ok(!ncr.e && ncr.launched === 1 && !JSON.stringify((ncr.last || {}).config || {}).includes('--proxy-server='), 'RED: a keeper that runs the call without a config — it launched DIRECT, no switch (the leg above goes red on it)', ncr.e && ncr.e.code);
  const DC = require('../src/server/browser-display-config.js');
  const mkDc = (name, mod = DC) => { const d = path.join(ROOT, name); fs.mkdirSync(d, { recursive: true }); return mod.create({ dir: d, writeJson: (file, o) => fs.writeFileSync(file, JSON.stringify(o, null, 2)), log: { log() { }, warn() { } } }); };
  const ARG = `--proxy-server=http://127.0.0.1:${HTTP_UP}`, base = path.join(ROOT, 'base.json');
  fs.writeFileSync(base, JSON.stringify({ args: ['--lang=en', '--proxy-auto-detect', '--winhttp-proxy-resolver', '--proxy-server=http://other.example.test:1', '--force-webrtc-ip-handling-policy=default'] }));
  const ENGP = require('../src/browser-engines.js'), UDP = ENGP.PROXY_UDP_ARG;
  const argsOf = (file) => { const c = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(c.args) ? c.args : String(c.args || '').split(','); };
  const out1 = argsOf(mkDc('dc-1').proxyFileFor(base, { arg: ARG }));
  ok(!!(out1.includes('--lang=en') && out1.at(-2) === ARG && !out1.some((a) => /auto-detect|winhttp|other\.example/.test(a))), 'the person\'s own proxy switches leave by the tree\'s ONE rule (src/browser-engines.js PROXY_ARG_RE — auto-detect and the resolver switch too): the forwarder\'s switch is the only one', out1);
  // 主开发 14:25Z — the UDP road: the WebRTC policy that lets UDP out only through a proxy rides beside the switch; the person's own
  // setting of it replaced; a launch with no proxy stamp names the base file untouched
  ok(out1.at(-1) === UDP && out1.filter((a) => /webrtc-ip-handling/.test(a)).length === 1 && mkDc('dc-0').proxyFileFor(base, { arg: '' }) === base,
    'a profile WITH a proxy: the derived config carries --force-webrtc-ip-handling-policy=disable_non_proxied_udp right after the forwarder\'s switch (the person\'s own «=default» replaced); with no proxy the base file is untouched', out1);
  const DCu = mutant('src/server/browser-display-config.js', ', arg, ENG.PROXY_UDP_ARG] };', ', arg] };');
  ok(!argsOf(mkDc('dc-u', DCu).proxyFileFor(base, { arg: ARG })).includes(UDP), 'RED: a derived config without the policy — the leg above goes red on it');
  // 14:28Z — THE THIRD ROAD: an engine's egress pair (a profile's proxy, or the allowlist alone) carries the policy; an engine's own copy is
  // dropped, so the kernel gets exactly one, the core's; no forwarder ⇒ nothing added
  {
    const V = require('../src/browser-verbs.js'), FW = 'http://127.0.0.1:' + HTTP_UP, OWN = '--force-webrtc-ip-handling-policy=default_public_interface_only';
    const pair = ENGP.egressArgs(FW), one = ENGP.engineArgs({ args: ['--lang=en', OWN], egress: FW }), none = ENGP.engineArgs({ args: ['--lang=en', OWN] });
    const count = (l) => l.filter((x) => /webrtc-ip-handling/.test(x)).length;
    ok(pair.at(-1) === UDP && pair[0] === `--proxy-server=${FW}` && ENGP.egressArgs(null).length === 0 && count(one) === 1 && one.at(-1) === UDP && count(none) === 0 && !ENGP.wrappedOwnArgs(['--lang=en', OWN]).args.includes(OWN),
      'the engine\'s egress pair carries the policy after its bypass; an engine answer that names the switch yields exactly ONE, the core\'s; with no forwarder nothing is added; the person\'s own on a wrapped launch is dropped', { pair, one, none });
    const ENGr = mutant('src/browser-engines.js', "'--proxy-bypass-list=<-loopback>', PROXY_UDP_ARG] : []; }", "'--proxy-bypass-list=<-loopback>'] : []; }");
    const Vr = mutant('src/browser-verbs.js', '|proxy-auto-detect|force-webrtc-ip-handling-policy)$/;', '|proxy-auto-detect)$/;');
    ok(!ENGr.egressArgs(FW).includes(UDP) && count([...Vr.splitLaunchArgs([], ['--lang=en', OWN]).engine, ...ENGP.egressArgs(FW)]) === 2 && count([...V.splitLaunchArgs([], ['--lang=en', OWN]).engine, ...ENGP.egressArgs(FW)]) === 1,
      'REDs: an egress pair without the policy (the pair leg goes red); the reserved names without the switch — the engine\'s copy and the core\'s both reach the kernel (two)');
  }
  const DCr = mutant('src/server/browser-display-config.js', 'ENG.withoutProxyArgs(V.driverArgsList(base.args))', "V.driverArgsList(base.args).filter((a) => !/^--?(?:proxy-server|proxy-pac-url|proxy-bypass-list|no-proxy-server)(?:=|$)/.test(a))");
  ok(!!(argsOf(mkDc('dc-r', DCr).proxyFileFor(base, { arg: ARG })).includes('--proxy-auto-detect')), 'RED: the four-switch filter before the cure — auto-detect survives beside the forwarder\'s switch');
  const nulCfg = path.join(ROOT, 'nul.json'); fs.writeFileSync(nulCfg, JSON.stringify({ args: ['--lang=en', '--x=a\u0000b'] }));   // a NUL inside a switch: the driver's one line cannot carry it
  const tryFile = (dc, file) => { try { return { file: dc.proxyFileFor(file, { arg: ARG }) }; } catch (e) { return { e }; } };
  const dc2 = mkDc('dc-2'), eU = tryFile(dc2, path.join(ROOT, 'no-such.json')).e, eC = tryFile(dc2, nulCfg).e, eN = tryFile(dc2, null).e;
  ok(!!([eU, eC, eN].every((e) => e && e.code === 'egress_proxy_missing')), 'a config that cannot be read, one whose switches the driver\'s line cannot carry, or none named ⇒ THROWN by name (egress_proxy_missing) — never the base file without the switch', [eU, eC, eN].map((e) => e && e.message));
  const DCo = mutant('src/server/browser-display-config.js', 'throw proxyMissing(`${baseFile} could not be read`); }', 'return baseFile; }');
  const rO = tryFile(mkDc('dc-o', DCo), path.join(ROOT, 'no-such.json'));
  ok(!rO.e && rO.file === path.join(ROOT, 'no-such.json'), 'RED: the read before the cure — the call keeps the base file, which carries no switch (the leg above goes red on it)', rO);
  // B-8b87 cure — A CLOUD BROWSER runs at its vendor: its proxy refused at the creation and at the edit (the start: ① above)
  const eCc = await thr(() => k.createProfile({ label: 'Cloud', provider: 'cloud:browserbase', proxy: proxyUrl }));
  let eCe = null;
  try { const pc = k.createProfile({ label: 'Cloud two', provider: 'cloud:browserbase' }); eCe = await thr(() => k.updateProfile(pc.id, { proxy: proxyUrl })); } catch (e) { eCe = { code: 'create-refused:' + e.code }; }
  ok(!!(eCc && eCc.code === 'proxy_cloud_browser' && eCe && eCe.code === 'proxy_cloud_browser'), 'a cloud browser\'s proxy is refused by name at the creation and at the edit (proxy_cloud_browser) — its pages would never pass the hub\'s forwarder', [eCc && eCc.code, eCe && eCe.code]);
  // round 3 — the EDIT's route answers a proxy refusal with its status (never a 500): a PATCH on a cloud profile ⇒ 400
  {
    const express = require('express'), RT = require('../src/routes/browser-trace.js');
    const app = express(); app.use(express.json()); RT.setup({ keeper: k }); app.use(RT.router);
    const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const pc2 = k.createProfile({ label: 'Cloud three', provider: 'cloud:browserbase' });
    const resp = await fetch(`http://127.0.0.1:${srv.address().port}/api/browser/profiles/${pc2.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proxy: proxyUrl }) });
    const body = await resp.json().catch(() => ({}));
    srv.close();
    ok(!!(resp.status === 400 && body.code === 'proxy_cloud_browser' && ['proxy_cloud_browser', 'proxy_off_machine', 'bad_proxy', 'bad_proxy_credential', 'bad_proxy_inline_credential'].every((c) => RT.STATUS[c] === 400)),
      'the edit\'s route (PATCH /api/browser/profiles/:id): a proxy on a cloud profile answers 400 proxy_cloud_browser — and its table holds every proxy refusal the edit can give, never a 500', [resp.status, body.code]);
  }
  // round 3 — a switch of the browser kind ONTO a cloud one with a stored proxy: refused at the press, nothing stopped
  {
    const pw = k.createProfile({ label: 'Switch to cloud', proxy: proxyUrl, proxyCredential: ref });
    await k.start(pw.id, { why: 'user' });
    const pid = k._reg().browsers[pw.id].pid;
    const eS = await thr(() => k.switchBackend({ profileId: pw.id, target: 'cloud:browserbase', by: { kind: 'user' } }));
    const after = k._reg().browsers[pw.id];
    ok(!!(eS && eS.code === 'switch_export_only' && after.state === 'ready' && after.pid === pid && k.list().profiles.find((x) => x.id === pw.id).provider === 'chromium'),
      'a switch of a running profile with a proxy ONTO a cloud browser is refused AT THE PRESS by the switch\'s own verdict (switch_export_only: no cloud row takes an in-place switch) — its browser not stopped, nothing rolled back', eS && [eS.code, after.state]);
    await k.stop(pw.id, { why: 'user' });
  }
  // round 3 — the running road on the keeper's OWN list: the address alone (no user, no password), and the login's name
  {
    const pr = k.createProfile({ label: 'Running road', proxy: proxyUrl, proxyCredential: ref });
    await k.start(pr.id, { why: 'user' });
    const row = k.list().profiles.find((x) => x.id === pr.id) || {};
    const rowText = JSON.stringify(row);
    ok(row.proxyLive === proxyUrl && row.proxyLiveLogin === ref && !rowText.includes(PASS) && !rowText.includes(`${USER}:`),
      'the keeper\'s own list: a running browser\'s road (proxyLive) is the proxy\'s address alone, and the login it was launched with by its vault NAME — never a user:password, never the password', { proxyLive: row.proxyLive, proxyLiveLogin: row.proxyLiveLogin });
    await k.stop(pr.id, { why: 'user' });
  }
  // round 3 — A TEARDOWN NEVER GOES DIRECT AND IS NEVER BLOCKED: the config that carries the switch broken under a running browser ⇒
  // the Stop still stops it (the close-all keeps the base file — it opens no page — and the identity-checked ladder runs)
  const breakConfig = (dir) => { const d = path.join(dir, 'browser-env', 'display'); for (const n of fs.readdirSync(d)) if (/-proxy-/.test(n)) fs.rmSync(path.join(d, n)); fs.chmodSync(d, 0o500); return () => fs.chmodSync(d, 0o700); };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const stopBroken = async (dir, mod) => {
    const kk = mkKeeper(dir, { proxyLogins: pl }, mod); const pp = kk.createProfile({ label: 'Broken config', proxy: proxyUrl, proxyCredential: ref });
    await kk.start(pp.id, { why: 'user' });
    const pid = kk._reg().browsers[pp.id].pid, mend = breakConfig(dir);
    let e = null; try { e = await thr(() => kk.stop(pp.id, { why: 'user' })); } finally { mend(); }
    const out = { e, state: kk._reg().browsers[pp.id].state, alive: alive(pid) };
    if (out.alive) { try { await kk.stop(pp.id, { why: 'user' }); } catch { } }
    kk.shutdown?.(); await kk._forwardersClose();
    return out;
  };
  const sb = await stopBroken(path.join(ROOT, 'data-6'));
  ok(!sb.e && sb.state === 'stopped' && !sb.alive, 'the config that carries the switch broken under a running browser ⇒ the person\'s Stop STILL stops it: the close-all keeps the base file (a teardown opens no page), the ladder runs — never a browser left running', sb.e ? [sb.e.code, sb.e.message] : sb);
  const sbr = await stopBroken(path.join(ROOT, 'data-6r'), mutant('src/server/browser-keeper.js', [["const NO_PAGE_CALLS = new Set(['closeAll', 'info']);", 'const NO_PAGE_CALLS = new Set([]);'], ["      else { try { await rt.closeAll(rec.ns, { dir: p ? p.dir : null, extraEnv: rec.launchEnv || { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0' } }); } catch (e) {", "      else { try { await rt.closeAll(rec.ns, { dir: p ? p.dir : null, extraEnv: rec.launchEnv || { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0' } }); } catch (e) { throw e;"]]));
  ok(!!(sbr.e && sbr.e.code === 'egress_proxy_missing' && sbr.alive), 'RED: the stop of the cure before (the close-all\'s refusal aborts the stop) — the Stop answers egress_proxy_missing and the browser keeps running', sbr.e ? [sbr.e.code, sbr.alive] : sbr);
  // …and an ADOPTION with that config broken keeps the record while its browser lives (the session info is a read: base file)
  {
    const D7 = path.join(ROOT, 'data-7'), k7 = mkKeeper(D7, { proxyLogins: pl });
    const p7 = k7.createProfile({ label: 'Adopted broken', proxy: proxyUrl, proxyCredential: ref });
    await k7.start(p7.id, { why: 'user' });
    k7.shutdown?.(); await k7._forwardersClose();
    const mend = breakConfig(D7);
    let r7;
    try { const k7b = mkKeeper(D7, { proxyLogins: pl }); await k7b.adoptAll(); r7 = { ...k7b._reg().browsers[p7.id] }; mend(); await k7b.stop(p7.id, { why: 'user' }); k7b.shutdown?.(); await k7b._forwardersClose(); } finally { try { mend(); } catch { } }
    ok(!!(r7 && r7.state === 'ready' && r7.adoptedAt), 'a restart with that config broken: the browser is still ADOPTED (its session info keeps the base file — a read opens no page), never dropped while it lives', r7 && { state: r7.state, lastError: r7.lastError });
  }
  // round 3 — A VAULT NEVER SET UP is said as itself (never «locked»: there is no second password to ask for) — the save and the move
  {
    const vN = standinVault({ setUp: false }), plN = PL.create({ vault: vN, log: { log() { }, warn() { } } });
    const sN = plN.save({ proxy: proxyUrl, user: USER, password: PASS });
    const DN = path.join(ROOT, 'data-n'), idN = (() => { const kk = mkKeeper(DN, { proxyLogins: plN }); const pp = kk.createProfile({ label: 'Never set up', proxy: proxyUrl }); const d0 = JSON.parse((landReg(), fs.readFileSync(path.join(DN, 'browser-profiles.json'), 'utf8'))); d0.profiles.find((x) => x.id === pp.id).proxy = withLogin('http', `127.0.0.1:${HTTP_UP}`); fs.writeFileSync(path.join(DN, 'browser-profiles.json'), JSON.stringify(d0)); return pp.id; })();
    const mN = await mkKeeper(DN, { proxyLogins: plN }).moveProxyPassword(idN);
    NOT_SET_UP = { save: sN, move: mN };
    ok(!!(!sN.ok && sN.code === 'vault_not_set_up' && /not set up/.test(sN.error) && !mN.ok && mN.code === 'vault_not_set_up' && vN.entries.size === 0),
      'a vault never set up: the login\'s save and «Move the password to the vault» answer vault_not_set_up (the vault\'s real state) — never «locked», nothing written', [sN.code, mN.code]);
  }
  // the move: a user name the vault entry cannot carry ⇒ its own code (the page has the sentence)
  {
    const DU = path.join(ROOT, 'data-u'), kk = mkKeeper(DU, { proxyLogins: pl }), pp = kk.createProfile({ label: 'Odd user', proxy: proxyUrl });
    const d0 = JSON.parse((landReg(), fs.readFileSync(path.join(DU, 'browser-profiles.json'), 'utf8'))); d0.profiles.find((x) => x.id === pp.id).proxy = 'http://' + ['a%20b', PASS].join(':') + `@127.0.0.1:${HTTP_UP}`; fs.writeFileSync(path.join(DU, 'browser-profiles.json'), JSON.stringify(d0));
    const mU = await mkKeeper(DU, { proxyLogins: pl }).moveProxyPassword(pp.id);
    ok(!mU.ok && mU.code === 'proxy_user_unusable', 'a move whose user name a vault entry cannot carry (a space) ⇒ proxy_user_unusable — the page\'s user-name sentence, not «could not be used (bad-request)»', mU.code);
  }
}

console.log('⑥ THE PERSON\'S DOORS — no bearer reaches a proxy login; an agent\'s token never sets the proxy or names its login');
{
  const RV = read('src/routes/vault.js'), RB = read('src/routes/browser.js'), RT = read('src/routes/browser-trace.js');
  const routes = ["app.get('/api/vault/proxy-logins', noStoreP(person(", "app.post('/api/vault/proxy-logins', noStoreP(person(", "app.delete('/api/vault/proxy-logins/:name', noStoreP(person(", "app.post('/api/vault/proxy-logins/move', noStoreP(person("];
  ok(!!(routes.every((r) => RV.includes(r)) && RV.includes("const [pw] = take(req, 'proxyPassword');") && /take\(req, 'password', 'old', 'new', 'seed', 'uri', 'value', 'loginPassword', 'proxyPassword'(?:, '\w+')*\); refusedBearer/.test(RV)),   // lane lg-vault-file: later body fields (the file's bytes, its passphrase) follow it in the list
    'the four routes sit behind person() — every bearer (agent, job, automation key) and a cross-site request refused; the password taken from the body at once, also on a refusal');
  ok(!!(/patch\.proxy !== undefined \|\| patch\.proxyCredential !== undefined\) && isAgentBearer\(req\)\) return res\.status\(403\)/.test(RT) && /input\.proxyCredential != null && input\.proxyCredential !== '' && refuseAgentBearer\(req, res,/.test(RB)),
    'an agent\'s token never changes a profile\'s proxy or its login (PATCH), and never names a vault entry at a creation');
  // an AGENT's view of a profile (the record's, and a keeper row's): the proxy's ADDRESS at most — never the login's name (it holds the
  // user name), never the running road
  const recA = B.newProfileRecord({ id: 'bp-0000abcd', label: 'Agent view', dir: '/x', provider: 'chromium', proxy: 'socks5://proxy.example.test:1080', proxyCredential: `proxy-login:socks5://proxy.example.test:1080#${USER}`, now: 1 });
  const views = [B.agentProfileView(recA), B.agentProfileView({ ...recA, proxyLive: 'socks5://proxy.example.test:1080', proxyLiveLogin: recA.proxyCredential }, {}, { proxyCredential: recA.proxyCredential, proxyLive: 'x', proxyLiveLogin: 'y' })];
  ok(!!(views.every((v) => v.proxy === 'socks5://proxy.example.test:1080' && !('proxyCredential' in v) && !('proxyLive' in v) && !('proxyLiveLogin' in v) && !JSON.stringify(v).includes(USER))),
    'an agent\'s view of a profile carries its proxy\'s ADDRESS at most — never the login\'s name (the user name), never the running browser\'s road', views.map((v) => Object.keys(v).filter((k) => /proxy/i.test(k))));
  const VK = require('../src/vault-kinds.js'), row = VK.FAMILIES.find((f) => f.id === 'proxy-login');
  ok(!!(row && row.surfaces.cli && row.surfaces.cli.none && row.surfaces.use && row.surfaces.use.system && row.surfaces.request && row.surfaces.request.none && row.surfaces.reveal === true),
    'the vault kind «proxy-login»: no agent verb, no agent request, its use VibeSpace\'s own (the forwarder), revealable to the person (so the output belt masks it)', row && row.surfaces);
}

console.log('⑦ THE PAGE\'S WORDS — every proxy refusal in the page\'s language with the vault\'s press; a missing login as itself; «from its next start»');
{
  const PM = await import(pathToFileURL(path.join(REPO, 'src/lib/browser-proxy-model.js')).href);
  const PNL = await import(pathToFileURL(path.join(REPO, 'src/lib/browser-panel-model.js')).href);
  const used = new Set(), T = (k, v) => { used.add(k); return String(k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] !== undefined ? String(v[n]) : `{${n}}`)); };
  const SERVER = 'the server\'s own English sentence';
  const each = PM.PROXY_REFUSALS.map((code) => [code, PM.proxyWords(code, T, SERVER, { act: 'start' })]);
  ok(!!(each.every(([, w]) => !w.includes(SERVER) && !/could not be used/.test(w)) && PM.proxyWords('something_new', T, SERVER).includes('(something_new)') && !PM.proxyWords('something_new', T, SERVER).includes(SERVER)),
    'every proxy refusal a person sees has its OWN words by its code (the start\'s, the edit\'s, the creation\'s); a code with none is named by its code — never the server\'s English sentence', each.filter(([, w]) => w.includes(SERVER) || /could not be used/.test(w)));
  const lockedSave = PM.proxyWords('vault_locked', T), lockedMove = PM.proxyWords('vault_locked', T, '', { act: 'move' }), lockedStart = PM.proxyWords('proxy_credential_unreadable', T, '', { act: 'start', word: 'key-unreadable:vault_locked' });
  ok(!!(/Unlock…/.test(lockedSave) && /save/.test(lockedSave) && /Unlock…/.test(lockedMove) && !/save/.test(lockedMove) && /move the password/.test(lockedMove) && /start the browser/.test(lockedStart)
     && PM.proxyDoor('vault_locked') === 'unlock' && PM.proxyDoor('proxy_credential_unreadable', 'key-unreadable:vault_locked') === 'unlock' && PM.proxyDoor('proxy_cloud_browser') === null
     && /no longer in the vault/.test(PM.proxyWords('proxy_credential_unreadable', T, '', { act: 'start', word: 'proxy_login_no_entry' })) && /again/.test(PM.proxyWords('not_written', T, '', { act: 'move' }))),
    'the locked vault in words that fit the act (Save: «then save» · the move: «then move the password again» · a start: «then start the browser again»), each with the Unlock… press; a vault never set up has its own sentence and press; a login gone from the vault, and a move unwritten, said', [lockedSave, lockedMove, lockedStart]);
  // round 3: the vault never set up — the SERVER's own answers (⑤) through the page's words: Set up the vault…, never Unlock…
  const nsSave = PM.proxyWords(NOT_SET_UP.save.code, T, NOT_SET_UP.save.error, { act: 'save', word: NOT_SET_UP.save.word }), nsMove = PM.proxyWords(NOT_SET_UP.move.code, T, NOT_SET_UP.move.error, { act: 'move', word: NOT_SET_UP.move.word });
  ok(!!(PM.proxyDoor(NOT_SET_UP.save.code, NOT_SET_UP.save.word) === 'setup' && PM.proxyDoor(NOT_SET_UP.move.code, NOT_SET_UP.move.word) === 'setup' && /Set up the vault…/.test(nsSave) && /Set up the vault…/.test(nsMove) && !/Unlock/.test(nsSave + nsMove)
     && /user name cannot hold a space/.test(PM.proxyWords('proxy_user_unusable', T, '', { act: 'move' }))),
    'a vault never set up, as the SERVER answers it at the save and the move: the page says «Set up the vault…» with that press — never «press Unlock…» (there is no second password)', [nsSave, nsMove]);
  const parts = PM.loginNameParts(`proxy-login:socks5://proxy.example.test:1080#${USER}`);
  ok(!!(parts && parts.origin === 'socks5://proxy.example.test:1080' && parts.user === USER && PM.loginNameParts('web-login:x') === null && PM.userNameFits(USER) && !PM.userNameFits('a b') && !PM.userNameFits('a#b') && !PM.userNameFits('x'.repeat(129))),
    'a saved login\'s name read back to its address and user (the field shows a login the vault no longer lists AS ITSELF); a user name the entry cannot carry is refused at the field', parts);
  const FIELD = read('src/lib/browser-proxy-field.js'), NEWP = read('src/lib/browser-new-profile.js');
  ok(!!(/loaded !== null && loginRow\.style\.display !== 'none'/.test(FIELD) && FIELD.includes("no longer in the vault") && FIELD.includes("the vault\\'s list could not be read") && /if \(!userNameFits\(u\)\) return \{ ok: false, code: 'proxy_user_unusable'/.test(FIELD)
     && NEWP.indexOf('st.busy = true; create.disabled = true;\n') > 0 && NEWP.indexOf('st.busy = true; create.disabled = true;\n') < NEWP.indexOf('await proxyField.read()')
     && /say\(proxyWords\(pv\.code, t, pv\.error, \{ act: 'save', word: pv\.word \}\), proxyDoor\(pv\.code, pv\.word\)\)/.test(NEWP) && /pw \? proxyDoor\(r\.code, r\.word\) : null/.test(NEWP) && /'bproxy-door'/.test(NEWP)),
    'the field counts the login as changed only once the vault\'s list answered, keeps a missing login as its own option, refuses an unusable user name before sending; New profile is BUSY before the login is saved (a double press sends one create), and its refusal line carries the vault\'s press (Unlock… / Set up the vault…) like the Proxy… dialog and the toasts');
  const chip = (r) => (PNL.nameChips({ provider: 'chromium', ...r }, { w: { t: T } }).find((c) => c.key === 'proxy') || {}).text || '';
  ok(chip({ proxy: 'socks5://b.example.test:1080', proxyLive: 'socks5://a.example.test:1080' }) === 'proxy from its next start' && chip({ proxy: 'socks5://a.example.test:1080', proxyLive: 'socks5://a.example.test:1080' }) === 'proxy'
     && chip({ proxy: 'socks5://a.example.test:1080' }) === 'proxy' && chip({ proxy: 'socks5://a.example.test:1080', proxyCredential: 'proxy-login:socks5://a.example.test:1080#u2', proxyLive: 'socks5://a.example.test:1080', proxyLiveLogin: 'proxy-login:socks5://a.example.test:1080#u1' }) === 'proxy from its next start' && chip({ proxy: null, proxyLive: 'socks5://a.example.test:1080' }) === 'no proxy from its next start' && chip({ proxy: 'socks5://a.example.test:1080', proxyLive: null }) === 'proxy from its next start' && chip({ proxy: null, proxyLive: null }) === '',
    'the card says «from its next start» while the RUNNING browser\'s road differs from the profile\'s (an edit, or a browser started before) — and the plain chip once they agree', [chip({ proxy: 'socks5://b.example.test:1080', proxyLive: 'socks5://a.example.test:1080' })]);
  const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js'), missing = [...used].filter((k) => !ZH.includes(JSON.stringify(k) + ':') || !JA.includes(JSON.stringify(k) + ':'));
  ok(used.size > 20 && missing.length === 0, `every one of those ${used.size} sentences is in the zh and ja dictionaries — the page's language`, missing);
}

report();
