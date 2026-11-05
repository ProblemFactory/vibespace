#!/usr/bin/env node
// A TAILNET HOST IS REACHED FROM A BROWSER BY NAME WHEN THE TAILSCALE PLUGIN IS UP (lane tailnet-names, 2026-11-05 — userW:
// «装了 Tailscale 插件，https://<host>:8006/ 无法解析»). PURE src/tailnet-reach.js over a MINTED table (no real tailnet).
// ROUND 2: THE ROAD IS ADDED, NEVER A GATE — only a CURRENT DEVICE (a peer or Self) goes through Tailscale:
//   ① tailnetKind: a device (a peer or Self — by bare name, FQDN, address), a known device (the last table, the road down),
//      a *.ts.net name no table lists, a 100.64/10 address no table lists, not a tailnet host;
//   ② routeFor: a device ⇒ userspace socks (a profile's Chrome) / http-proxy (the in-page /proxy), kernel resolve:<the
//      table's address> (an address ⇒ direct); EVERY other host ⇒ direct in every plugin state — the acceptance's four cases
//      (no plugin: a Funnel name, a CGNAT address; the plugin stopped: a LAN short name; kernel + the row off: a 100.x address)
//      and a non-device *.ts.net name while up; downWhy by name; never an off:<why>;
//   ③ launchFor (an explicit proxy wins — the profile's, the config's, the ENV's: envProxyOf);
//   ④ THE PAC, EVALUATED: the current devices' names (+ Self; + their addresses in userspace) ⇒ the road, EVERYTHING else
//      DIRECT (a Funnel name, an unlisted *.<suffix> name, a CGNAT non-device, a public host); the road down ⇒ no names; a
//      stale table says «names as of»; a hostile name cannot break out; the switch is comma-free;
//   ⑤ LAW 2's words — ONLY after a failure, by its CAUSE: a certificate («answered … a certificate this browser does not
//      trust»), a refused port («refused the connection on port 8006»), no answer, a tunnel error (its code), a device newer
//      than the browser's PAC, the person's own device while the road is down (plugin off / signed out / the row off), a
//      *.ts.net / bare name nobody resolved (not a device); the device list for the OWNER only, never an agent; silent for a
//      public host, a non-network failure (a dialog), a system tailscaled; en / zh / ja with the same placeholders;
//   ROUND 3: ROUTING READS THE WHOLE TABLE (a 250-device tailnet: dev237 routed, in the PAC; the owner's list bounded, «… and N
//      more»); vetAddress — a door's target is never loopback / unspecified / link-local / a metadata address / Tailscale's own
//      100.100.100.100 / this hub's own address, a device only at a tailnet address; roadOn; the PAC's token path; a launch
//      while not signed in carries NO PAC and its stamp's words name it (signed out, the row off, the door); a bare label (a
//      compose service) and a CDP timeout say nothing of Tailscale; the certificate words true for each browser (Chrome: the
//      warning to accept in the live view; the in-page browser: cannot open it from here), no literal backticks;
//   ROUND 4: a device opened while the row is off names the row — «…turn on «Reach tailnet hosts from browsers»…» (never «is
//      that device online»); stampView — a launch stamp in a view is {on, mode, why}, never its arg (the token);
//   ROUND 5: those words are the person's, no jargon — «reaching Tailscale devices from browsers is off: turn on «Reach
//      tailnet hosts from browsers» in ⚙ → Plugins → Tailscale» (zh / ja: the same, the row's own label);
//   ⑥ MUTANTS (copies outside the tree): every host through SOCKS · the system resolver for a kernel name · «cannot resolve»
//      words · THE r1 GATE (an off:<why> before trying) · the blanket *.ts.net PAC rule · the Self-less table · every failure
//      «offline» · the device list in an agent's answer · the env proxy not explicit · r3: the 200 cap (reach / PAC) · an open
//      vet · a launch blind to sign-in · one stamp word for every reason · the bare-label hint · one certificate sentence · r4:
//      the arg kept in a view · the row-off words blaming the device · r5: r4's jargon («the road») — each turns its leg RED.
// Run: node scripts/test-tailnet-reach.mjs   (PURE: no network, no process)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1200) : ''}`); } return !!cond; };
const SRC = 'src/tailnet-reach.js';
let TR0 = null;
try { TR0 = require(path.join(REPO, SRC)); } catch (e) { TR0 = null; }
if (!TR0) { ok(`${SRC} exists (the ONE pure rule of a tailnet host's road)`, false, 'missing — a browser cannot reach a tailnet host by name'); console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }
const V = require(path.join(REPO, 'src/browser-verbs.js'));

// a MINTED table (no real tailnet's names or addresses): two peers + Self (this machine)
const SUF = 'tail-mint.ts.net';
const PEERS = [{ name: `peer-alpha.${SUF}`, short: 'peer-alpha', ips: ['100.101.1.2', 'fd7a:115c:a1e0::12'] }, { name: `peer-beta.${SUF}`, short: 'peer-beta', ips: ['fd7a:115c:a1e0::13'] }];
const SELF = { name: `hub.${SUF}`, short: 'hub', ips: ['100.101.1.1'] };
const UP = { up: true, mode: 'userspace', state: 'Running', loggedIn: true, browsers: true, peers: PEERS, self: SELF, suffix: SUF, known: [...PEERS, SELF], at: 1, stale: false, ports: { socks: 1055, http: 1056 } };
const KERNEL = { ...UP, mode: 'kernel' };
const STOPPED = { ...UP, up: false, mode: null, loggedIn: false, peers: [], self: null };
const FUNNEL = 'https://app.tail9999.ts.net/';
const TOKEN = ['a1b2c3d4', 'e5f60718', '293a4b5c', '6d7e8f90'].join(''); // a PAC token's shape, built at runtime (the secret-scan law)
// a 250-device tailnet (node-key order — nothing to do with names): dev237 sits past any 200 cap
const BIG = Array.from({ length: 250 }, (_, i) => ({ name: `dev${i}.${SUF}`, short: `dev${i}`, ips: [`100.102.${i >> 8}.${i & 255}`] }));

/** the PAC evaluated the way Chrome's PAC engine calls it (the builtins are there; this PAC needs none) */
function evalPac(text) {
  const ip4 = (s) => s.split('.').map(Number);
  const dnsDomainIs = (h, d) => String(h).toLowerCase().endsWith(String(d).toLowerCase());
  const isInNet = (h, net, mask) => { if (!/^\d+\.\d+\.\d+\.\d+$/.test(h)) throw new Error('isInNet asked to resolve a NAME: ' + h); const a = ip4(h), n = ip4(net), m = ip4(mask); return a.every((x, i) => (x & m[i]) === (n[i] & m[i])); };
  try { return new Function('dnsDomainIs', 'isInNet', `${text}\nreturn FindProxyForURL;`)(dnsDomainIs, isInNet); } catch (e) { return () => `BROKEN ${e.message}`; }
}
const pacHost = (u) => { try { return new URL(u).hostname.replace(/^\[|\]$/g, ''); } catch { return u; } };

function suite(TR0, tag = '') {
  const t = (s) => (tag ? `[${tag}] ` : '') + s;
  const r = {};
  // an older tree (the base, r2) lacks r3's verbs: each is a named ✗ there, never a crash
  const TR = new Proxy(TR0, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' && /^[a-z]/.test(k) ? () => { throw new Error(`TR.${k} — missing in this tree`); } : undefined) });
  const ok0 = ok;
  const okT = (name, fn, detail) => { let v = false, d = detail; try { v = fn(); } catch (e) { d = e.message; } return ok0(name, v, typeof d === 'function' ? (() => { try { return d(); } catch (e) { return e.message; } })() : d); };
  // ① the host
  const K = (u, reach = UP) => TR.tailnetKind(u, reach);
  r.kinds = ok(t('① kinds: a peer (bare / FQDN any case + trailing dot / its address) and SELF = device · the last table\'s device while stopped = known · an unlisted *.ts.net name = name · an unlisted 100.64/10 = address · public / loopback / 100.128.x / 10.x / a LAN label = none'),
    K('https://peer-alpha:8006/') === 'device' && K(`http://PEER-ALPHA.${SUF.toUpperCase()}./x`) === 'device' && K('http://[fd7a:115c:a1e0::13]:80/') === 'device' && K('http://100.101.1.2/') === 'device' && K(`https://hub.${SUF}:3000/`) === 'device' && K('hub') === 'device'
      && K('http://nas:5000/', { ...STOPPED, known: [{ name: `nas.${SUF}`, short: 'nas', ips: ['100.101.1.9'] }] }) === 'known' && K(FUNNEL) === 'name' && K(`https://ghost.${SUF}/`) === 'name' && K('http://100.70.1.2:8080/') === 'address'
      && TR.isTailnetHost('peer-alpha:8006', UP) === true && TR.isTailnetHost('example.com', UP) === false && K('https://example.com/') === null && K('http://127.0.0.1:3000/') === null && K('http://localhost:8080/') === null && K('http://100.128.0.1/') === null && K('http://10.0.0.5/') === null && K('intranet') === null && K('http://nas:5000/', null) === null,
    ['peer-alpha', 'hub', FUNNEL, '100.70.1.2', 'example.com', 'nas'].map((h) => [h, K(h)]));
  // ② the road
  const R = (u, reach, via) => TR.routeFor(u, reach, { via });
  r.userspace = ok(t('② userspace: a device by name, FQDN or address — Self too — ⇒ socks (a profile\'s Chrome) / http-proxy (the in-page browser)'),
    R('https://peer-alpha:8006/', UP, 'browser') === 'socks' && R(`http://peer-alpha.${SUF}/`, UP, 'browser') === 'socks' && R('http://100.101.1.2/', UP, 'browser') === 'socks' && R(`https://hub.${SUF}:3000/`, UP, 'browser') === 'socks'
      && R('https://peer-alpha:8006/', UP, 'embedded') === 'http-proxy' && R('http://100.101.1.2/', UP, 'embedded') === 'http-proxy');
  r.kernel = ok(t('② kernel: a device NAME ⇒ resolve:<the table\'s IPv4 first> (never the system resolver; Self ⇒ its own tailnet address); an IPv6-only peer ⇒ its address; a device address ⇒ direct (the tunnel routes it)'),
    R('https://peer-alpha:8006/', KERNEL, 'browser') === 'resolve:100.101.1.2' && R(`https://peer-alpha.${SUF}:8006/`, KERNEL, 'embedded') === 'resolve:100.101.1.2' && R('http://peer-beta/', KERNEL) === 'resolve:fd7a:115c:a1e0::13'
      && R(`https://hub.${SUF}/`, KERNEL) === 'resolve:100.101.1.1' && R('http://100.101.1.2/', KERNEL) === 'direct',
    [R('https://peer-alpha:8006/', KERNEL, 'browser'), R(`https://hub.${SUF}/`, KERNEL)]);
  const roads = [[FUNNEL, null], ['http://100.70.1.2/', null], ['http://nas:5000/', { ...STOPPED, known: [{ name: `nas.${SUF}`, short: 'nas', ips: ['100.101.1.9'] }] }], ['https://100.70.1.2:8006/', { ...KERNEL, browsers: false }],
    [FUNNEL, UP], [FUNNEL, KERNEL], [`https://ghost.${SUF}/`, UP], ['http://100.70.1.2/', UP], ['https://peer-alpha/', { ...UP, loggedIn: false, state: 'NeedsLogin' }], ['https://peer-alpha/', { ...UP, browsers: false }], ['https://example.com/', UP]];
  r.noGate = ok(t('② N1 — THE ROAD IS ADDED, NEVER A GATE: every host that is NOT a current device takes the ordinary road (direct) in every state — the acceptance\'s four (no plugin: a Funnel name, 100.70.1.2; the plugin stopped: a LAN short name; kernel + the row off: a 100.x address), a non-device *.ts.net name while up, the road down; never an off:<why>'),
    roads.every(([u, re]) => R(u, re, 'embedded') === 'direct' && R(u, re, 'browser') === 'direct'), roads.map(([u, re]) => [u, R(u, re, 'embedded')]));
  r.down = ok(t('② downWhy by name: no plugin · a system tailscaled · the plugin off · the row off · signed out (NeedsLogin) · «not yet read / starting» (never «signed out») · up ⇒ null'),
    TR.downWhy(null) === 'no-plugin' && TR.downWhy({ ...UP, up: false, mode: 'system' }) === 'system' && TR.downWhy(STOPPED) === 'plugin-off' && TR.downWhy({ ...UP, browsers: false }) === 'setting'
      && TR.downWhy({ ...UP, loggedIn: false, state: 'NeedsLogin' }) === 'signed-out' && TR.downWhy({ ...UP, loggedIn: false, state: null }) === 'starting' && TR.downWhy({ ...UP, loggedIn: false, state: 'Starting' }) === 'starting' && TR.downWhy(UP) === null);
  // ③ the launch
  const L = (reach, o) => TR.launchFor(reach, o);
  r.launch = ok(t('③ launchFor: up ⇒ on with its mode; an EXPLICIT proxy wins; an engine\'s / another machine\'s browser, no plugin, the plugin off, a system tailscaled, the row off ⇒ off by name'),
    L(UP).on === true && L(UP).mode === 'userspace' && L(KERNEL).mode === 'kernel' && L(UP, { explicit: true }).why === 'explicit-proxy' && L(UP, { explicit: true }).on === false
      && L(UP, { engine: true }).why === 'engine' && L(UP, { remote: true }).why === 'remote' && L(null).why === 'no-plugin' && L(STOPPED).why === 'plugin-off'
      && L({ ...UP, up: false, mode: 'system' }).why === 'system' && L({ ...UP, browsers: false }).why === 'setting',
    [L(UP), L(UP, { explicit: true })]);
  r.launchSignIn = ok(t('③ N3 (r3) — a launch while Tailscale is NOT signed in carries NO PAC (Chrome would keep an empty one): signed out ⇒ off:signed-out, starting / not yet read ⇒ off:starting; its own proxy still wins'),
    L({ ...UP, loggedIn: false, state: 'NeedsLogin' }).on === false && L({ ...UP, loggedIn: false, state: 'NeedsLogin' }).why === 'signed-out' && L({ ...UP, loggedIn: false, state: 'Starting' }).why === 'starting' && L({ ...UP, loggedIn: false, state: null }).why === 'starting'
      && L({ ...UP, loggedIn: false, state: 'NeedsLogin' }, { explicit: true }).why === 'explicit-proxy',
    [L({ ...UP, loggedIn: false, state: 'NeedsLogin' }), L({ ...UP, loggedIn: false, state: 'Starting' })]);
  r.roadOn = okT(t('③ roadOn (r3: the door listens only while the road is on): our plugin up + the row on — signed in or not; off for no plugin, a system tailscaled, the plugin off, the row off'),
    () => TR.roadOn(UP) === true && TR.roadOn(KERNEL) === true && TR.roadOn({ ...UP, loggedIn: false, state: 'NeedsLogin' }) === true && TR.roadOn(null) === false && TR.roadOn({ ...UP, up: false, mode: 'system' }) === false && TR.roadOn(STOPPED) === false && TR.roadOn({ ...UP, browsers: false }) === false);
  const VA = (a, o) => TR.vetAddress(a, o);
  r.vet = okT(t('③ vetAddress (r3 N2 — never a way back into the hub): loopback (127/8, ::1, ::ffff:127.x) · unspecified (0.0.0.0, ::) · link-local (169.254/16, fe80::) · the metadata address (169.254.169.254, fd00:ec2::254) · Tailscale\'s own 100.100.100.100 · this hub\'s own address ⇒ refused by name; a public address passes; a DEVICE only at a tailnet address (Self\'s own included)'),
    () => VA('127.0.0.1') === 'loopback' && VA('127.9.9.9') === 'loopback' && VA('::1') === 'loopback' && VA('::ffff:127.0.0.1') === 'loopback' && VA('0.0.0.0') === 'unspecified' && VA('::') === 'unspecified' && VA('169.254.10.1') === 'link-local' && VA('fe80::1') === 'link-local'
      && VA('169.254.169.254') === 'metadata' && VA('fd00:ec2::254') === 'metadata' && VA('100.100.100.100') === 'tailscale-service' && VA('10.1.2.3', { own: ['10.1.2.3'] }) === 'this-hub' && VA('203.0.113.7', { own: ['10.1.2.3'] }) === null && VA('2001:db8::5') === null
      && VA('100.101.1.1', { device: true, own: ['100.101.1.1'] }) === null && VA('fd7a:115c:a1e0::12', { device: true }) === null && VA('10.0.0.5', { device: true }) === 'not-tailnet' && VA('127.0.0.1', { device: true }) === 'loopback' && VA('nas') === 'not-an-address' && VA('300.1.1.1') === 'not-an-address',
    () => ['127.0.0.1', '0.0.0.0', '169.254.169.254', '100.100.100.100', '203.0.113.7'].map((a) => [a, VA(a)]));
  r.envProxy = ok(t('③ envProxyOf (N6 j): HTTPS_PROXY / http_proxy / ALL_PROXY in a launch env is an EXPLICIT proxy (Chrome on Linux honours it); none / empty ⇒ null'),
    TR.envProxyOf({ HTTPS_PROXY: 'http://127.0.0.1:9' }) === 'HTTPS_PROXY' && TR.envProxyOf({ http_proxy: 'http://p:1' }) === 'http_proxy' && TR.envProxyOf({ ALL_PROXY: 'socks5://p:1' }) === 'ALL_PROXY'
      && TR.envProxyOf({ HTTPS_PROXY: ' ' }) === null && TR.envProxyOf({ PATH: '/bin' }) === null && TR.envProxyOf(null) === null);
  // ④ the PAC
  const US = evalPac(TR.pacFor(TR.pacDevices(UP), TR.pacTarget(UP, 0), { addresses: true }));
  const KP = evalPac(TR.pacFor(TR.pacDevices(KERNEL), TR.pacTarget(KERNEL, 40123)));
  const P = (fn, u) => fn(u, pacHost(u));
  r.pacDevices = ok(t('④ the PAC (userspace): SOCKS5 127.0.0.1:1055 for a peer\'s bare name, its FQDN, its addresses, and SELF (this machine is a device)'),
    P(US, 'https://peer-alpha:8006/') === 'SOCKS5 127.0.0.1:1055' && P(US, `http://peer-beta.${SUF}/`) === 'SOCKS5 127.0.0.1:1055' && P(US, 'http://100.101.1.2:81/') === 'SOCKS5 127.0.0.1:1055' && P(US, 'http://[fd7a:115c:a1e0::13]/') === 'SOCKS5 127.0.0.1:1055'
      && P(US, `https://hub.${SUF}:3000/`) === 'SOCKS5 127.0.0.1:1055' && P(US, 'http://hub/') === 'SOCKS5 127.0.0.1:1055');
  r.pacDirect = ok(t('④ N2 — everything the table does not list goes DIRECT: a Funnel / other-tailnet name, an unlisted *.<suffix> name, a CGNAT non-device, a public host, a loopback, a LAN name — never a blanket *.ts.net rule'),
    P(US, FUNNEL) === 'DIRECT' && P(US, `https://ghost.${SUF}/`) === 'DIRECT' && P(US, 'http://100.70.1.2/') === 'DIRECT' && P(US, 'https://example.com/') === 'DIRECT' && P(US, 'http://127.0.0.1:3000/') === 'DIRECT' && P(US, 'http://intranet/') === 'DIRECT' && P(KP, FUNNEL) === 'DIRECT' && P(KP, `https://ghost.${SUF}/`) === 'DIRECT',
    [P(US, FUNNEL), P(KP, FUNNEL), P(US, 'http://100.70.1.2/')]);
  r.pacKernel = ok(t('④ the PAC (kernel): the devices\' NAMES (Self too) ⇒ PROXY 127.0.0.1:<the door>; their addresses ⇒ DIRECT (the tunnel routes them)'),
    P(KP, 'https://peer-alpha:8006/') === 'PROXY 127.0.0.1:40123' && P(KP, `https://peer-alpha.${SUF}/`) === 'PROXY 127.0.0.1:40123' && P(KP, `https://hub.${SUF}/`) === 'PROXY 127.0.0.1:40123' && P(KP, 'http://100.101.1.2/') === 'DIRECT');
  const BIGR = { ...UP, peers: BIG, known: [...BIG, SELF] }, BP = evalPac(TR.pacFor(TR.pacDevices(BIGR), TR.pacTarget(BIGR, 0), { addresses: true }));
  r.whole = ok(t('④ N1 (r3) — ROUTING READS THE WHOLE TABLE: a 250-device tailnet ⇒ dev237 (past any 200 cap) is a device, routed (socks / resolve:<its address>), in the PAC by name and address; the last device too'),
    TR.reachOf(BIGR).devices.length === 251 && R('https://dev237:8006/', BIGR, 'browser') === 'socks' && R(`https://dev237.${SUF}/`, { ...BIGR, mode: 'kernel' }) === 'resolve:100.102.0.237' && P(BP, 'https://dev237:8006/') === 'SOCKS5 127.0.0.1:1055' && P(BP, 'http://100.102.0.237/') === 'SOCKS5 127.0.0.1:1055' && P(BP, `https://dev249.${SUF}/`) === 'SOCKS5 127.0.0.1:1055',
    [TR.reachOf(BIGR).devices.length, R('https://dev237:8006/', BIGR, 'browser'), P(BP, 'https://dev237:8006/')]);
  const STALE = evalPac(TR.pacFor(TR.pacDevices(UP), 'DIRECT', { asOf: Date.UTC(2026, 10, 5, 9, 30) }));
  r.pacDown = ok(t('④ the road down ⇒ the PAC lists nothing (DIRECT for all); a stale table\'s PAC says «names as of <when>»'),
    TR.pacDevices(STOPPED).length === 0 && TR.pacDevices({ ...UP, browsers: false }).length === 0 && TR.pacTarget(null, 1) === 'DIRECT' && TR.pacTarget(STOPPED, 1) === 'DIRECT'
      && /\/\/ names as of 2026-11-05T09:30:00\.000Z/.test(TR.pacFor(TR.pacDevices(UP), 'DIRECT', { asOf: Date.UTC(2026, 10, 5, 9, 30) })) && P(STALE, 'http://peer-alpha/') === 'DIRECT');
  const hostile = evalPac(TR.pacFor([{ name: "x'); return 'PROXY evil:1'; ('.ts.net", short: "x'", ips: ['100.64.0.1'] }], "SOCKS5 127.0.0.1:1055'; return 'PROXY evil:2"));
  r.pacSafe = ok(t('④ a hostile device name or target cannot break out of the PAC text (names ride JSON, the target is a closed alphabet)'), P(hostile, 'https://example.com/') === 'DIRECT');
  const arg = TR.pacArg(40123, TOKEN), txt = V.driverArgsText([arg]);
  r.arg = okT(t('④ the ONE switch: --proxy-pac-url=http://127.0.0.1:<door>/tailnet-<token>.pac (r3: the door\'s random token — never a guessable URL) — comma-free, the driver\'s line reads it back whole; no token / a bad one / no port ⇒ none'),
    () => arg === `--proxy-pac-url=http://127.0.0.1:40123/tailnet-${TOKEN}.pac` && txt.ok && V.driverArgsList(txt.args).length === 1 && V.driverArgsList(txt.args)[0] === arg && TR.pacArg(40123) === null && TR.pacArg(40123, 'a/b') === null && TR.pacArg(0, TOKEN) === null && TR.pacArg(70000, TOKEN) === null && TR.pacPath(TOKEN) === `/tailnet-${TOKEN}.pac`, [arg, txt]);
  // ⑤ the words
  const M = (u, reach, o = {}) => TR.missFor(u, reach, { failed: true, ...o });
  const PAC = { arg: '--proxy-pac-url=x', mode: 'userspace', why: null };
  r.noFailNoWords = ok(t('⑤ N1 — no failure, no words: the r1 refusals (the plugin off, signed out, the row off, not a device) say NOTHING before a request was tried'),
    [['https://peer-alpha/', STOPPED], [`https://ghost.${SUF}/`, UP], ['https://peer-alpha/', { ...UP, browsers: false }], [FUNNEL, null]].every(([u, re]) => TR.missFor(u, re, {}) === null && TR.missFor(u, re, { failed: false, cause: 'ENOTFOUND' }) === null));
  const causes = [
    ['untrusted-cert', M('https://peer-alpha:8006/', UP, { cause: 'DEPTH_ZERO_SELF_SIGNED_CERT', via: 'embedded' }), 'peer-alpha answered through Tailscale, but with a certificate the in-page browser does not trust (self-signed?) — it cannot open it from here: give the device a trusted certificate (tailscale cert)'],
    ['cert-warning', M('https://peer-alpha:8006/', UP, { cause: 'net::ERR_CERT_AUTHORITY_INVALID', launched: PAC }), 'peer-alpha answered through Tailscale, but with a certificate Chrome does not trust (self-signed?) — Chrome shows a certificate warning: accept it in the live view, or give the device a trusted certificate (tailscale cert)'],
    ['refused', M('https://peer-alpha:8006/', KERNEL, { cause: 'ECONNREFUSED', via: 'embedded' }), 'peer-alpha answered through Tailscale, but refused the connection on port 8006'],
    ['no-answer', M('https://peer-alpha:8006/', UP, { cause: 'ETIMEDOUT', via: 'embedded' }), 'peer-alpha is on your tailnet but did not answer through Tailscale — is that device online?'],
    ['unreachable', M('https://peer-alpha:8006/', UP, { cause: 'ERR_SOCKS_CONNECTION_FAILED', launched: PAC }), 'peer-alpha is on your tailnet, but the connection through Tailscale failed (ERR_SOCKS_CONNECTION_FAILED)'],
    ['new-device', M('https://peer-alpha:8006/', UP, { cause: 'ERR_NAME_NOT_RESOLVED', launched: PAC }), 'peer-alpha joined your tailnet after this browser started'],
  ];
  r.causes = ok(t('⑤ N5 — the words FOLLOW THE CAUSE on a device\'s Tailscale road: a certificate (r3: the in-page browser «cannot open it from here»; Chrome «shows a certificate warning: accept it in the live view») · a refused port (8006) · a timeout («did not answer») · a tunnel error (its code) · a name the browser\'s PAC predates'),
    causes.every(([why, m, head]) => m && m.why === why && m.text.startsWith(head)), causes.map(([w, m]) => [w, m && m.why, m && m.text]));
  const KNOWN_NAS = { ...STOPPED, known: [{ name: `nas.${SUF}`, short: 'nas', ips: ['100.101.1.9'] }] };
  const own = [
    ['plugin-off', M('https://nas:8006/', KNOWN_NAS, { cause: 'ENOTFOUND', via: 'embedded' }), 'nas is a Tailscale name — the Tailscale plugin is off: start it in ⚙ → Plugins → Tailscale'],
    ['signed-out', M('https://peer-alpha/', { ...UP, loggedIn: false, state: 'NeedsLogin' }, { cause: 'ENOTFOUND', via: 'embedded' }), 'peer-alpha is a Tailscale name — Tailscale is not signed in yet'],
    ['setting', M('https://peer-alpha/', { ...UP, browsers: false }, { cause: 'ERR_NAME_NOT_RESOLVED', launched: { arg: null, why: 'setting' } }), 'peer-alpha is a Tailscale name — reaching Tailscale devices from browsers is off: turn on «Reach tailnet hosts from browsers» in ⚙ → Plugins → Tailscale'],
    ['untrusted-cert', M('https://nas:8006/', KNOWN_NAS, { cause: 'DEPTH_ZERO_SELF_SIGNED_CERT', via: 'embedded' }), 'nas answered, but with a certificate'],
    ['started-before', M('https://peer-alpha/', UP, { cause: 'ERR_NAME_NOT_RESOLVED', launched: null }), 'peer-alpha is on your tailnet, but this browser started before Tailscale was up'],
    ['explicit-proxy', M('https://peer-alpha/', UP, { cause: 'ERR_TUNNEL_CONNECTION_FAILED', launched: { arg: null, why: 'explicit-proxy' } }), 'peer-alpha is a Tailscale name — this browser has its own proxy'],
    ['not-a-peer', M(`https://ghost.${SUF}/`, UP, { cause: 'ENOTFOUND', via: 'embedded' }), `ghost.${SUF} is not a device on your tailnet`],
    ['no-plugin', M(`https://ghost.${SUF}/`, null, { cause: 'ENOTFOUND', via: 'embedded' }), `ghost.${SUF} is a Tailscale name — this instance has no Tailscale running`],
  ];
  r.own = ok(t('⑤ after the ordinary road failed: the person\'s OWN device while the road is down (plugin off / signed out / the row off — said with the door; a certificate on the LAN said plainly) · the browser\'s stamp (started before, its own proxy) · a *.ts.net name nobody resolved (not a device — the hint)'),
    own.every(([why, m, head]) => m && m.why === why && m.text.startsWith(head)), own.map(([w, m]) => [w, m && m.why, m && m.text]));
  const stamped = [
    ['started-signed-out', M('https://peer-alpha/', UP, { cause: 'ERR_NAME_NOT_RESOLVED', launched: { arg: null, why: 'signed-out' } }), 'peer-alpha is on your tailnet, but this browser started while Tailscale was signed out — stop it and open the page again'],
    ['started-setting-off', M('https://peer-alpha/', UP, { cause: 'ERR_NAME_NOT_RESOLVED', launched: { arg: null, why: 'setting' } }), 'peer-alpha is on your tailnet, but this browser started while «Reach tailnet hosts from browsers» was off'],
    ['door-failed', M('https://peer-alpha/', UP, { cause: 'ERR_NAME_NOT_RESOLVED', launched: { arg: null, why: 'door' } }), 'peer-alpha is on your tailnet, but VibeSpace could not open its tailnet door when this browser started (the hub log says why)'],
    ['started-before', M('https://peer-alpha/', UP, { cause: 'ERR_NAME_NOT_RESOLVED', launched: { arg: null, why: 'starting' } }), 'peer-alpha is on your tailnet, but this browser started before Tailscale was up'],
  ];
  r.stampWords = ok(t('⑤ N3 (r3) — the stamp\'s OWN reason names the words: started while signed out · while the row was off · the door could not listen · while Tailscale was starting (before it was up)'),
    stamped.every(([why, m, head]) => m && m.why === why && m.text.startsWith(head)), stamped.map(([w, m]) => [w, m && m.why, m && m.text]));
  const big = M(`https://ghost.${SUF}/`, { ...UP, peers: BIG }, { cause: 'ENOTFOUND', audience: 'owner' });
  r.display = ok(t('⑤ N1 (r3) — a cap only on a DISPLAY: the owner\'s «known: …» list shows 8 and says «… and 243 more» (zh / ja too)'),
    !!big && big.text.endsWith('(known: dev0, dev1, dev2, dev3, dev4, dev5, dev6, dev7 and 243 more)') && /以及另外 243 台）$/.test(M(`https://ghost.${SUF}/`, { ...UP, peers: BIG }, { cause: 'ENOTFOUND', audience: 'owner', lang: 'zh' }).text) && /ほか 243 台）$/.test(M(`https://ghost.${SUF}/`, { ...UP, peers: BIG }, { cause: 'ENOTFOUND', audience: 'owner', lang: 'ja' }).text), big && big.text);
  const agentSaid = M(`https://ghost.${SUF}/`, UP, { cause: 'ENOTFOUND' }), ownerSaw = M(`https://ghost.${SUF}/`, UP, { cause: 'ENOTFOUND', audience: 'owner' });
  r.privacy = ok(t('⑤ N6 g — the device list only for the OWNER\'s eyes: an agent\'s answer (the default audience) says «… is not a device on your tailnet» with NO list; the owner\'s page lists them (Self too)'),
    !!agentSaid && agentSaid.text === `ghost.${SUF} is not a device on your tailnet` && !/peer-alpha|peer-beta|hub/.test(agentSaid.text) && !!ownerSaw && ownerSaw.text === `ghost.${SUF} is not a device on your tailnet (known: peer-alpha, peer-beta, hub)`,
    [agentSaid && agentSaid.text, ownerSaw && ownerSaw.text]);
  r.quiet = ok(t('⑤ …and silent where nothing is Tailscale\'s: a public host\'s failure (the base\'s own error stands), a loopback, a non-network failure (a dialog: no cause), an engine\'s / another machine\'s browser, a system tailscaled, «starting», a bare label while the road is down, a CGNAT non-device that timed out'),
    M('https://example.com/', UP, { cause: 'ENOTFOUND' }) === null && M('https://example.com/', UP, { cause: 'ECONNREFUSED' }) === null && M('http://127.0.0.1:1/', UP, { cause: 'ECONNREFUSED' }) === null && M('https://peer-alpha/', UP, { cause: null }) === null
      && M('https://peer-alpha/', UP, { launched: { arg: null, why: 'engine' }, cause: 'ERR_NAME_NOT_RESOLVED' }) === null && M('https://peer-alpha/', { ...UP, up: false, mode: 'system' }, { cause: 'ENOTFOUND' }) === null
      && M('https://peer-alpha/', { ...UP, loggedIn: false, state: null }, { cause: 'ENOTFOUND' }) === null && M('http://intranet/', STOPPED, { cause: 'ENOTFOUND' }) === null && M('http://100.70.1.2/', null, { cause: 'ETIMEDOUT' }) === null);
  r.bare = ok(t('⑤ N4 (r3) — TAILSCALE WORDS ONLY WHERE TAILSCALE IS INVOLVED: a bare label that is no device (a compose service myapp, a LAN intranet) keeps the base\'s error while the road is UP, in either browser; a CDP timeout (TIMEOUT — a hung tab, no network cause) on a device says nothing'),
    M('http://myapp:3000/', UP, { cause: 'ERR_NAME_NOT_RESOLVED', launched: PAC }) === null && M('http://intranet:8080/', UP, { cause: 'ENOTFOUND', via: 'embedded', audience: 'owner' }) === null && M('http://intranet/', KERNEL, { cause: 'ENOTFOUND' }) === null
      && M('https://peer-alpha:8006/', UP, { cause: 'TIMEOUT', launched: PAC }) === null && TR.causeOf('TIMEOUT') === null && !!M('https://peer-alpha:8006/', UP, { cause: 'ERR_TIMED_OUT', launched: PAC }),
    [M('http://myapp:3000/', UP, { cause: 'ERR_NAME_NOT_RESOLVED', launched: PAC }), M('https://peer-alpha:8006/', UP, { cause: 'TIMEOUT', launched: PAC })]);
  // r4 N1: the row off while a browser launched WITH the PAC opens a device (the door closed with the road: Chrome says
  // ERR_PROXY_CONNECTION_FAILED) ⇒ the row's words — never «is that device online»
  const rowOff = ['en', 'zh', 'ja'].map((lang) => M('https://peer-alpha:8006/', { ...UP, mode: 'kernel', browsers: false }, { cause: 'ERR_PROXY_CONNECTION_FAILED', launched: { ...PAC, mode: 'kernel' }, lang }));
  r.rowOff = okT(t('⑤ r4 N1 + r5 m4 — a device opened while «Reach tailnet hosts from browsers» is off (a browser launched with the PAC, the door closed with the road): «reaching Tailscale devices from browsers is off: turn on «Reach tailnet hosts from browsers» in ⚙ → Plugins → Tailscale» (zh / ja: the same, the row\'s own label) — the person\'s words (no «road» / 路 / 経路), never «is that device online»'),
    () => rowOff.every((m) => m && m.why === 'setting' && !/online|在线|オンライン|road|的路|経路/.test(m.text)) && rowOff[0].text === 'peer-alpha is a Tailscale name — reaching Tailscale devices from browsers is off: turn on «Reach tailnet hosts from browsers» in ⚙ → Plugins → Tailscale'
      && rowOff[1].text === 'peer-alpha 是 Tailscale 里的名字 — 从浏览器访问 Tailscale 设备已关闭：在 ⚙ → 插件 → Tailscale 打开「从浏览器访问 tailnet 里的机器」'
      && rowOff[2].text === 'peer-alpha は Tailscale の名前です — ブラウザーから Tailscale のデバイスへの接続がオフです：⚙ → プラグイン → Tailscale で「ブラウザーから tailnet のマシンに接続」をオンにしてください', () => rowOff.map((m) => m && m.text));
  // r4 N4: a browser's launch stamp as ANY view carries it — {on, mode, why}, never the arg (its PAC url holds the door's token)
  const stampArg = TR.pacArg(40123, TOKEN);
  r.stamp = okT(t('⑤ r4 N4 — THE TOKEN NEVER IN AN ANSWER: stampView({arg, mode, why}) ⇒ {on, mode, why} — the arg (the PAC url, its token) gone; a stamp without a PAC ⇒ on:false + its why; null / undefined as they are'),
    () => JSON.stringify(TR.stampView({ arg: stampArg, mode: 'kernel', why: null })) === JSON.stringify({ on: true, mode: 'kernel', why: null }) && !JSON.stringify(TR.stampView({ arg: stampArg, mode: 'kernel', why: null })).includes(TOKEN)
      && JSON.stringify(TR.stampView({ arg: null, mode: 'userspace', why: 'signed-out' })) === JSON.stringify({ on: false, mode: 'userspace', why: 'signed-out' }) && TR.stampView(null) === null && TR.stampView(undefined) === undefined,
    () => TR.stampView({ arg: stampArg, mode: 'kernel', why: null }));
  const asOf = M('https://peer-alpha:8006/', { ...UP, stale: true, at: Date.UTC(2026, 10, 5, 9, 30) }, { cause: 'ETIMEDOUT', via: 'embedded' });
  r.asOf = ok(t('⑤ N3 — a stale table (Tailscale\'s status did not answer in time) says so: «… (names as of 2026-11-05 09:30 UTC)»'), !!asOf && asOf.text.endsWith('(names as of 2026-11-05 09:30 UTC)'), asOf && asOf.text);
  const langs = TR.LANGS, keys = Object.keys(TR.WORDS.en).filter((k) => typeof TR.WORDS.en[k] === 'string');
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
  const NO = /cannot resolve|could not be resolved|can't be resolved|无法解析|解析失败|解決できません|名前解決/i;
  r.langs = ok(t('⑤ zh + ja: every reason in every language with the SAME placeholders; no sentence says «cannot resolve» (any language); no literal backticks (r3: the words are a person\'s)'),
    langs.join() === 'en,zh,ja' && langs.every((l) => keys.every((k) => typeof TR.WORDS[l][k] === 'string' && ph(TR.WORDS[l][k]) === ph(TR.WORDS.en[k]) && !NO.test(TR.WORDS[l][k]) && !TR.WORDS[l][k].includes('`')))
      && /Tailscale 插件没有开/.test(M('https://nas/', KNOWN_NAS, { cause: 'ENOTFOUND', lang: 'zh' }).text) && /Tailscale プラグインがオフ/.test(M('https://nas/', KNOWN_NAS, { cause: 'ENOTFOUND', lang: 'ja' }).text)
      && /拒绝了端口 8006 上的连接/.test(M('https://peer-alpha:8006/', UP, { cause: 'ECONNREFUSED', lang: 'zh' }).text) && M('https://nas/', KNOWN_NAS, { cause: 'ENOTFOUND', lang: 'xx' }).lang === 'en',
    langs.flatMap((l) => keys.filter((k) => typeof TR.WORDS[l][k] !== 'string' || ph(TR.WORDS[l][k]) !== ph(TR.WORDS.en[k]) || NO.test(TR.WORDS[l][k]) || TR.WORDS[l][k].includes('`')).map((k) => l + ':' + k)));
  return r;
}

console.log('① – ⑤ PURE src/tailnet-reach.js over a minted table (two peers + Self)');
const real = suite(TR0);

console.log('⑥ MUTANTS (copies outside the tree) — each must turn its leg RED');
const MC = mutantCopies('tailnet-reach', REPO);
const src = fs.readFileSync(path.join(REPO, SRC), 'utf8');
/** a copy with every [from, to] pair applied (null — and a named ✗ — when an anchor is gone) */
const mutant = (pairs, tag) => { let s = src; for (const [from, to] of pairs) { if (!s.includes(from)) { ok(`mutant ${tag}: its anchor is in ${SRC}`, false, from); return null; } s = s.replace(from, to); } return MC.load(SRC, s, tag); };
const quiet = (fn) => { const l = console.log; const out = []; console.log = (s) => out.push(s); try { return fn(); } finally { console.log = l; pass -= out.filter((s) => /^\s+✓/.test(s)).length; fail -= out.filter((s) => /^\s+✗/.test(s)).length; } };
const M = [
  ['all-socks', [["    \"  return 'DIRECT';\",", "    \"  return '${t}';\","]], (x) => x.pacDirect === false && x.pacDevices === true, 'every host through SOCKS (the PAC\'s DIRECT gone) ⇒ ④\'s DIRECT leg RED (the devices\' leg stays green)'],
  ['system-resolver', [["if (r.mode === 'kernel') return isAddress(hostOf(url)) ? 'direct' : `resolve:${d.ip}`;", "if (r.mode === 'kernel') return 'direct';"]], (x) => x.kernel === false && x.userspace === true, 'a kernel-mode name left to the system resolver ⇒ ②\'s resolve leg RED'],
  ['cannot-resolve', [["'not-a-peer': '{host} is not a device on your tailnet',", "'not-a-peer': 'cannot resolve {host}',"]], (x) => x.own === false && x.langs === false, '«cannot resolve» words ⇒ ⑤ RED (the words leg and the language census)'],
  ['r1-gate', [["  if (downWhy(r) !== null) return 'direct';", "  if (downWhy(r) !== null) return tailnetKind(url, r) ? 'off:' + downWhy(r) : 'direct';"], ["  if (!d || !d.ip) return 'direct'; // NOT a current device", "  if (!d || !d.ip) return tailnetKind(url, r) ? 'off:not-a-peer' : 'direct'; // NOT a current device"]], (x) => x.noGate === false && x.userspace === true, 'N1: THE r1 GATE (an off:<why> for a tailnet-looking non-device, the road down) ⇒ ②\'s no-gate leg RED'],
  ['blanket-pac', [["  if (Object.prototype.hasOwnProperty.call(names, h)) return '${t}';", "  if (Object.prototype.hasOwnProperty.call(names, h) || dnsDomainIs(h, '.ts.net')) return '${t}';"]], (x) => x.pacDirect === false && x.pacDevices === true, 'N2: the blanket dnsDomainIs(\'.ts.net\') PAC rule ⇒ ④\'s Funnel-DIRECT leg RED'],
  ['self-less', [["devices: self ? [...peers, self] : peers,", 'devices: peers,']], (x) => x.kernel === false && x.pacDevices === false, 'N2: the Self-less table (this machine not a device) ⇒ ②\'s kernel leg + ④\'s devices leg RED'],
  ['all-offline', [["  const byCause = () => ({ cert: via === 'embedded' ? 'untrusted-cert' : 'cert-warning', refused: 'refused', timeout: 'no-answer' }[cls] || 'unreachable');", "  const byCause = () => 'no-answer';"]], (x) => x.causes === false, 'N5: every failure «did not answer — is that device online?» ⇒ ⑤\'s cause leg RED'],
  ['list-to-agents', [["const known = audience === 'owner' && r ?", 'const known = r ?']], (x) => x.privacy === false, 'N6 g: the device list in an agent\'s answer ⇒ ⑤\'s privacy leg RED'],
  ['env-not-explicit', [['return PROXY_ENV.find(', 'return null && PROXY_ENV.find(']], (x) => x.envProxy === false, 'N6 j: an env proxy not explicit ⇒ ③\'s env leg RED'],
  ['reach-cap', [['  const peers = list(r.peers).filter((p) => p.self !== true);', '  const peers = list(r.peers).filter((p) => p.self !== true).slice(0, 200);']], (x) => x.whole === false && x.pacDevices === true, 'r3 N1: the 200 cap back on the table (reachOf) ⇒ ④\'s whole-table leg RED (dev237 direct)'],
  ['pac-cap', [['  for (const p of list(devices)) {', '  for (const p of list(devices).slice(0, 201)) {']], (x) => x.whole === false && x.pacDevices === true, 'r3 N1: the 200 cap on the PAC ⇒ ④\'s whole-table leg RED (dev237 not in the PAC)'],
  ['open-vet', [["  if (v4 ? +v4[1] === 127 : a === '::1') return 'loopback';", ''], ["  if (METADATA.includes(a)) return 'metadata';", '']], (x) => x.vet === false, 'r3 N2: a vet that passes loopback and the metadata address ⇒ ③\'s vet leg RED'],
  ['launch-blind', [["  if (!r.loggedIn) return off(downWhy(r));", '']], (x) => x.launchSignIn === false && x.launch === true, 'r3 N3: a launch blind to sign-in (the PAC while signed out) ⇒ ③\'s sign-in leg RED'],
  ['one-stamp-word', [["return say({ 'explicit-proxy': 'explicit-proxy', 'signed-out': 'started-signed-out', setting: 'started-setting-off', door: 'door-failed' }[w] || 'started-before');", "return say(w === 'explicit-proxy' ? 'explicit-proxy' : 'started-before');"]], (x) => x.stampWords === false && x.own === true, 'r3 N3: one «started before» for every stamp reason ⇒ ⑤\'s stamp-words leg RED'],
  ['bare-label-hint', [["  if ((kind === 'name' || kind === 'address') && (cls === 'cert' || cls === 'refused')) return say(byCause());", "  if (cls === 'name' && !kind && down === null && !isAddress(h) && !h.includes('.')) return say('not-a-peer');\n  if ((kind === 'name' || kind === 'address') && (cls === 'cert' || cls === 'refused')) return say(byCause());"]], (x) => x.bare === false, 'r3 N4: the r2 bare-label hint («myapp is not a device on your tailnet») ⇒ ⑤\'s bare-label leg RED'],
  ['stamp-arg', [['? { on: !!stamp.arg, mode: stamp.mode || null, why: stamp.why || null } : stamp;', '? { ...stamp, on: !!stamp.arg } : stamp;']], (x) => x.stamp === false && x.own === true, 'r4 N4: a view that keeps the stamp\'s arg (the PAC url with the door\'s token) ⇒ ⑤\'s token-in-a-view leg RED'],
  ['row-off-online', [["setting: '{host} is a Tailscale {what} — reaching Tailscale devices from browsers is off: turn on «Reach tailnet hosts from browsers» in ⚙ → Plugins → Tailscale',", "setting: '{host} is on your tailnet, but the connection through Tailscale failed — is that device online?',"]], (x) => x.rowOff === false, 'r4 N1: the row-off words blaming the device («is that device online») ⇒ ⑤\'s row-off leg RED'],
  ['road-jargon', [["setting: '{host} 是 Tailscale 里的{what} — 从浏览器访问 Tailscale 设备已关闭：", "setting: '{host} 是 Tailscale 里的{what} — 通往 tailnet 的路已关闭："]], (x) => x.rowOff === false, 'r5 m4: r4\'s jargon («通往 tailnet 的路已关闭» — the lane\'s word, not the person\'s) ⇒ ⑤\'s row-off leg RED'],
  ['one-cert-sentence', [["cert: via === 'embedded' ? 'untrusted-cert' : 'cert-warning',", "cert: 'untrusted-cert',"]], (x) => x.causes === false, 'r3 N6: one certificate sentence for both browsers (Chrome told it cannot open the page) ⇒ ⑤\'s cause leg RED'],
];
for (const [tag, pairs, red, words] of M) { const m = mutant(pairs, tag); const r = m && quiet(() => suite(m, tag)); ok(`⑥ MUTANT ${words}`, !!r && red(r), r); }
ok('⑥ the copies live outside the tree (mutant-copy.mjs)', MC.files.length === M.length && MC.files.every((f) => !f.startsWith(path.join(REPO, 'src'))), MC.files);
ok('the real module: every leg green above', Object.values(real).every(Boolean), real);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
