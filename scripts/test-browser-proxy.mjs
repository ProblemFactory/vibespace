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
//      that resolves the name locally first
//   ④ THE ONE READER (src/server/browser-proxy-logins.js over a stand-in vault): save (locked refused), read (a use NOTED: door
//      browser-proxy, by the launch's actor), locked ⇒ the vault's own word, a name the vault holds nothing under ⇒ its word
//   ⑤ THE REAL KEEPER over the fake agent-browser: the switch on the driver's config is the forwarder's loopback port, the forwarder
//      carries the profile's proxy with its login, the login is NOWHERE in the launch / the calls / the store; a locked vault ⇒ the
//      launch refused by name, nothing launched; a password saved in the address ⇒ refused, and «Move the password to the vault»
//      moves it in one act. REDs: a keeper that never stamps the switch; a keeper that starts despite the locked vault
//   ⑥ THE PERSON'S DOORS: the routes sit behind person() (no bearer reaches a proxy login); an agent's token never sets the proxy or its
//      login; the vault kind's row reads «no agent door»
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, deadPort } from './scratch.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
const DEAD_CDP = await deadPort();
const require = createRequire(import.meta.url);
const Module = require('node:module');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : ''}`); } };
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }
/** an in-memory copy of a src module with `from` replaced — its own requires resolve beside the original */
function mutant(rel, from, to) {
  const file = path.join(REPO, rel), src = read(rel);
  if (!src.includes(from)) throw new Error(`mutant: ${rel} no longer holds ${JSON.stringify(from.slice(0, 70))}`);
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src.split(from).join(to), file);
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
  ok(!inl.ok && inl.code === 'bad_proxy_inline_credential' && /vault/.test(inl.error) && !inl.error.includes(PASS) && !s4.ok && /socks4/.test(s4.error) && !port0.ok && !junk.ok,
    '…refused: a login inside the address (bad_proxy_inline_credential — «the credential goes in the vault», the value never echoed), socks4, a port of 0, any other scheme', [inl.code, s4.error, port0.error]);
  const name = B.proxyLoginName('socks5://Sx.Example.Test:1080', USER);
  ok(name === `proxy-login:socks5://sx.example.test:1080#${USER}` && B.parseProxyLoginName(name).origin === 'socks5://sx.example.test:1080' && B.proxyLoginName('socks5://sx.example.test:1080', 'a b') === null && B.proxyLoginName(`http://${USER}:x@h:1`, USER) === null,
    'the vault entry: proxy-login:<scheme>://<host>:<port>#<user> — a user with a space or #, or an address carrying a login, makes none', name);
  const cOk = B.normalizeProxyCredential(name, 'socks5://sx.example.test:1080'), cOther = B.normalizeProxyCredential(name, 'http://evil.example.test:8080'), cJunk = B.normalizeProxyCredential('secret:abc', 'socks5://sx.example.test:1080');
  ok(cOk.ok && cOk.value === name && !cOther.ok && cOther.code === 'bad_proxy_credential' && /never sent to another proxy/.test(cOther.error) && !cJunk.ok,
    'a profile\'s login must be the entry saved for ITS proxy — one saved for another host is refused (a login is never sent elsewhere); no other kind of entry', cOther.error);
  const V = (p) => B.proxyLaunchVerdict({ label: 'Work', ...p });
  const vNone = V({}), vOk = V({ proxy: 'socks5://sx.example.test:1080', proxyCredential: name }), vInl = V({ proxy: withLogin('http', 'proxy.example.test:3128') }), vS4 = V({ proxy: 'socks4://proxy.example.test:1080' }), vHost = V({ proxy: 'http://proxy.example.test:3128', host: 'm-1' }), vX = V({ proxy: 'http://evil.example.test:8080', proxyCredential: name });
  ok(vNone.ok && vNone.proxy === null && vOk.ok && vOk.proxy.scheme === 'socks5' && vOk.proxy.port === 1080 && vOk.proxy.credential === name,
    'the launch verdict: no proxy ⇒ nothing to do; a proxy with its login ⇒ the forwarder\'s upstream (scheme, host, port, the entry\'s NAME)');
  ok(vInl.code === 'proxy_password_in_profile' && /Move the password to the vault/.test(vInl.error) && !vInl.error.includes(PASS) && vS4.code === 'proxy_scheme_unsupported' && vHost.code === 'proxy_off_machine' && /this machine only, for now/.test(vHost.error) && vX.code === 'bad_proxy_credential',
    '…refused BY NAME: a password still in the address (its sentence names «Move the password to the vault»), socks4, a paired machine («…works for browsers on this machine only, for now»), a login saved for another proxy', [vInl.code, vS4.code, vHost.code, vX.code]);
  const pv = B.publicProfileView({ id: 'p1', label: 'Work', proxy: withLogin('http', 'proxy.example.test:3128') }), pv2 = B.publicProfileView({ id: 'p2', label: 'X', proxy: 'http://proxy.example.test:3128', proxyCredential: name });
  ok(!JSON.stringify(pv).includes(PASS) && pv.proxyPasswordInProfile === true && !('proxyPasswordInProfile' in pv2) && pv2.proxyCredential === name,
    'the public view never carries the password — an address saved with it is drawn without it and flagged (the card\'s «Move the password to the vault»); the entry\'s NAME is no secret', pv.proxy);
  const ctl = (prov) => ({ ok: true, row: B.providerRow ? B.providerRow(prov) : { leaseKind: 'profile', starts: true } });
  const vc = B.validateProfileInput({ label: 'Remote', provider: 'chromium', proxy: 'http://proxy.example.test:3128', host: 'm-1' }, { existing: [], control: ctl, mediation: false });
  const vl = B.validateProfileInput({ label: 'Local', provider: 'chromium', proxy: 'http://proxy.example.test:3128' }, { existing: [], control: ctl, mediation: false });
  ok(!vc.ok && vc.code === 'proxy_off_machine' && /this machine only, for now/.test(vc.error) && vl.ok && vl.value.proxy === 'http://proxy.example.test:3128' && vl.value.proxyCredential === null, 'a NEW profile on a paired machine with a proxy is refused at its creation too; on this machine it is kept, the address alone', [vc.code, vl.ok]);
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
  ok(/B\.proxyRoadOf\(\{ profileProxy: !!\(p && p\.proxy\), userConfigProxy: userConfigProxy\(\), envProxy: [^}]+, tailnet: true \}\)\.explicit/.test(KS) && !/const explicit = !!\(p && p\.proxy\) \|\|/.test(KS),
    'the keeper keeps no second ranking: the tailnet road\'s «explicit» IS proxyRoadOf\'s');
}

// ── the stand-in upstreams (loopback): an HTTP CONNECT proxy and a SOCKS5 proxy with a user name and password ──
const seen = [];
const httpUp = net.createServer((c) => { c.on('error', () => { }); let b = ''; c.on('data', function f(d) { b += d.toString('latin1'); const i = b.indexOf('\r\n\r\n'); if (i < 0) return; c.removeListener('data', f); const auth = (/proxy-authorization: basic (\S+)/i.exec(b) || [])[1]; seen.push({ kind: 'http', line: b.split('\r\n')[0], login: auth ? Buffer.from(auth, 'base64').toString() : null }); c.write('HTTP/1.1 200 OK\r\n\r\n'); c.on('data', (x) => c.write(x)); }); });
const socksUp = net.createServer((c) => { c.on('error', () => { }); let st = 0, b = Buffer.alloc(0); c.on('data', (d) => { b = Buffer.concat([b, d]);
  for (;;) {
    if (st === 0 && b.length >= 2 && b.length >= 2 + b[1]) { const ms = [...b.subarray(2, 2 + b[1])]; b = b.subarray(2 + b[1]); c.write(Buffer.from([5, ms.includes(2) ? 2 : 0xff])); st = 1; continue; }
    if (st === 1 && b.length >= 2 && b.length >= 3 + b[1] && b.length >= 3 + b[1] + b[2 + b[1]]) { const ul = b[1], u = b.subarray(2, 2 + ul).toString(), pl = b[2 + ul], p = b.subarray(3 + ul, 3 + ul + pl).toString(); b = b.subarray(3 + ul + pl); seen.push({ kind: 'socks-auth', login: `${u}:${p}` }); c.write(Buffer.from([1, u === USER && p === PASS ? 0 : 1])); st = 2; continue; }
    if (st === 2 && b.length >= 5) { const at = b[3], need = at === 3 ? 5 + b[4] + 2 : at === 1 ? 10 : 22; if (b.length < need) break; seen.push({ kind: 'socks-connect', atyp: at, name: at === 3 ? b.subarray(5, 5 + b[4]).toString() : null, port: b.readUInt16BE(need - 2) }); b = b.subarray(need); c.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0])); st = 3; continue; }
    if (st === 3 && b.length) { c.write(b); b = Buffer.alloc(0); }
    break;
  } }); });
await new Promise((r) => httpUp.listen(0, '127.0.0.1', r)); await new Promise((r) => socksUp.listen(0, '127.0.0.1', r));
const HTTP_UP = httpUp.address().port, SOCKS_UP = socksUp.address().port;
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
  ok(/200 Connection Established \| echoed/.test(r1) && h && h.line === `CONNECT ${NAME}:443 HTTP/1.1` && h.login === `${USER}:${PASS}`,
    `through an HTTP proxy: the stand-in upstream sees «CONNECT ${NAME}:443» — the NAME, which no resolver answers — with the profile's login (Basic)`, [r1, h && h.line]);
  ok(/200 Connection Established \| echoed/.test(r2) && sa && sa.login === `${USER}:${PASS}` && sc && sc.atyp === 3 && sc.name === NAME && sc.port === 443,
    '…through a SOCKS5 proxy: the login (RFC 1929), then the destination as the domain-name address type (3) — the NAME, never an address resolved here', [r2, sc]);
  const f3 = mk(() => ({ refused: { code: 'proxy_credential_unreadable', sentence: PL.LOCKED } }));
  const r3 = await tunnel(await f3.listen());
  ok(/^HTTP\/1\.1 502/.test(r3) && r3.includes("a person unlocks it on this instance's page") && seen.length === 3,
    'a refusal (the vault locked) is the 502 page that says where to unlock — and no upstream, no direct dial was made', r3);
  const EPx = mutant('src/server/egress-proxy.js', 'async function dialVia(up, host, port, { timeoutMs = 10000 } = {}) {', 'async function dialVia(up, host, port, { timeoutMs = 10000 } = {}) {\n  await require(\'dns\').promises.lookup(host);   // RED: resolved here first');
  const fx = mk(() => ({ scheme: 'http', host: '127.0.0.1', port: HTTP_UP }), EPx);
  seen.length = 0;
  const rx = await tunnel(await fx.listen());
  ok(!/echoed/.test(rx) && seen.length === 0, 'RED: a copy that resolves the name locally first — the tunnel fails and the upstream never sees the name', rx);
  for (const f of [f1, f2, f3, fx]) await f.close({ cut: true });
}

// ── a stand-in vault: the engine's verbs the proxy-login module uses (state / secretPut / secretGet / secretDrop / secretNames / noteUse) ──
function standinVault() {
  const v = { locked: false, entries: new Map(), uses: [] };
  return Object.assign(v, {
    state: () => (v.locked ? 'locked' : 'unlocked'),
    secretPut: (name, value) => { if (v.locked) return { ok: false, code: 'key-unreadable:vault_locked' }; v.entries.set(name, Buffer.from(value)); return { ok: true }; },
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
  ok(!s0.ok && s0.code === 'vault_locked' && lockedWrote === 0 && s1.ok && s1.name === `proxy-login:socks5://sx.example.test:1080#${USER}` && vault.entries.get(s1.name).toString() === PASS && pl.names().length === 1 && !JSON.stringify(pl.names()).includes(PASS),
    'save: locked ⇒ refused, nothing written; unlocked ⇒ ONE entry, the password its value (the user in its name); names() lists names only', [s0.code, s1.name]);
  const r = pl.read(s1.name, { by: 'agent', conv: 'bk-0000a0a1', actor: 'a conversation' });
  ok(r.ok && r.user === USER && r.pass === PASS && vault.uses.length === 1 && vault.uses[0].door === 'browser-proxy' && vault.uses[0].by === 'agent' && vault.uses[0].conv === 'bk-0000a0a1' && vault.uses[0].outcome === 'ok',
    'read: the login, and the reading NOTED on the entry — door browser-proxy, by the launch\'s actor (an agent\'s launch ⇒ an audit line in the real engine)', vault.uses[0]);
  vault.locked = true;
  const rl = pl.read(s1.name);
  vault.locked = false;
  const ra = pl.read(`proxy-login:socks5://sx.example.test:1080#nobody`);
  ok(!rl.ok && rl.code === 'proxy_credential_unreadable' && rl.word === 'key-unreadable:vault_locked' && /a person unlocks it on this instance's page \(Unlock…\)/.test(rl.error) && !ra.ok && ra.word === 'proxy_login_no_entry' && vault.uses.length === 3 && vault.uses[1].outcome === 'vault_locked',
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
process.on('exit', () => { fake.reap(); for (const s of [cdpSrv, httpUp, socksUp]) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
const K = require('../src/server/browser-keeper.js');
const mkKeeper = (dataDir, extra = {}, mod = K) => { fs.mkdirSync(dataDir, { recursive: true }); return mod.create({ dataDir, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: { add: () => ({ id: 'u1' }) }, ...extra }); };
const thr = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
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
  const store = fs.readFileSync(path.join(D1, 'browser-profiles.json'), 'utf8');
  const recEg = (JSON.parse(store).browsers || {})[p.id]?.egress || null;
  ok(fake.launches().length === n0 + 1 && port > 0 && recEg && recEg.port === port && recEg.proxy && recEg.proxy.credential === ref,
    'the driver\'s road: the launch\'s config carries ONE --proxy-server=http://127.0.0.1:<port> — the forwarder\'s, whose port the record keeps (the boot re-binds THAT port) with the profile\'s proxy and the entry\'s NAME', { sw, recEg });
  seen.length = 0;
  const rt = port ? await tunnel(port) : 'no port';
  const h = seen.find((x) => x.kind === 'http');
  ok(/echoed/.test(rt) && h && h.line === `CONNECT ${NAME}:443 HTTP/1.1` && h.login === `${USER}:${PASS}`,
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
  ok(eL && eL.code === 'proxy_credential_unreadable' && /a person unlocks it on this instance's page \(Unlock…\)/.test(eL.message) && fake.launches().length === n1,
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
  const doc = JSON.parse(fs.readFileSync(path.join(D2, 'browser-profiles.json'), 'utf8'));
  doc.profiles.find((x) => x.id === pm.id).proxy = withLogin('http', `127.0.0.1:${HTTP_UP}`);
  fs.writeFileSync(path.join(D2, 'browser-profiles.json'), JSON.stringify(doc));
  const k2 = mkKeeper(D2, { proxyLogins: pl });
  const view = k2.profile ? JSON.stringify(k2.listProfiles ? k2.listProfiles() : []) : '';
  const n3 = fake.launches().length;
  const eP = await thr(() => k2.start(pm.id, { why: 'user' }));
  ok(eP && eP.code === 'proxy_password_in_profile' && /Move the password to the vault/.test(eP.message) && !eP.message.includes(PASS) && fake.launches().length === n3 && !view.includes(PASS),
    'a password saved IN the address before this law ⇒ never used: the launch refused by name, its sentence naming «Move the password to the vault» — nothing launched', eP && eP.code);
  vault.locked = true;
  const mL = await k2.moveProxyPassword(pm.id);
  vault.locked = false;
  const before = vault.entries.size;
  const mv = await k2.moveProxyPassword(pm.id);
  const store2 = fs.readFileSync(path.join(D2, 'browser-profiles.json'), 'utf8');
  const row = JSON.parse(store2).profiles.find((x) => x.id === pm.id);
  ok(!mL.ok && mL.code === 'vault_locked' && store2.length > 0 && mv.ok && mv.credential === `proxy-login:http://127.0.0.1:${HTTP_UP}#${USER}` && vault.entries.get(mv.credential).toString() === PASS && vault.entries.size <= before + 1
     && row.proxy === `http://127.0.0.1:${HTTP_UP}` && row.proxyCredential === mv.credential && !store2.includes(PASS) && !JSON.stringify(mv).includes(PASS),
    '«Move the password to the vault» — locked ⇒ nothing changes; unlocked ⇒ ONE press: the vault entry made, the row rewritten to the address + that entry, the password GONE from the profiles store', [mL.code, mv.credential, row.proxy]);
  await k2.start(pm.id, { why: 'user' });
  ok(JSON.stringify((fake.launches().at(-1) || {}).config || {}).includes('--proxy-server=http://127.0.0.1:'), '…and its next start goes through its proxy, the login read from the vault');
  try { await k2.stop(pm.id, { why: 'user' }); } catch { }
  try { await k.stop(p.id, { why: 'user' }); } catch { }
}

console.log('⑥ THE PERSON\'S DOORS — no bearer reaches a proxy login; an agent\'s token never sets the proxy or names its login');
{
  const RV = read('src/routes/vault.js'), RB = read('src/routes/browser.js'), RT = read('src/routes/browser-trace.js');
  const routes = ["app.get('/api/vault/proxy-logins', noStoreP(person(", "app.post('/api/vault/proxy-logins', noStoreP(person(", "app.delete('/api/vault/proxy-logins/:name', noStoreP(person(", "app.post('/api/vault/proxy-logins/move', noStoreP(person("];
  ok(routes.every((r) => RV.includes(r)) && RV.includes("const [pw] = take(req, 'proxyPassword');") && /take\(req, 'password', 'old', 'new', 'seed', 'uri', 'value', 'loginPassword', 'proxyPassword'\); refusedBearer/.test(RV),
    'the four routes sit behind person() — every bearer (agent, job, automation key) and a cross-site request refused; the password taken from the body at once, also on a refusal');
  ok(/patch\.proxy !== undefined \|\| patch\.proxyCredential !== undefined\) && isAgentBearer\(req\)\) return res\.status\(403\)/.test(RT) && /input\.proxyCredential != null && input\.proxyCredential !== '' && refuseAgentBearer\(req, res,/.test(RB),
    'an agent\'s token never changes a profile\'s proxy or its login (PATCH), and never names a vault entry at a creation');
  const VK = require('../src/vault-kinds.js'), row = VK.FAMILIES.find((f) => f.id === 'proxy-login');
  ok(row && row.surfaces.cli && row.surfaces.cli.none && row.surfaces.use && row.surfaces.use.system && row.surfaces.request && row.surfaces.request.none && row.surfaces.reveal === true,
    'the vault kind «proxy-login»: no agent verb, no agent request, its use VibeSpace\'s own (the forwarder), revealable to the person (so the output belt masks it)', row && row.surfaces);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
