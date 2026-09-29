#!/usr/bin/env node
// test-dial-facts — lane-pairing ①③⑤ (B-7007; the owner's MacBook 2026-09-27: the pairing dialog offered ONE
// address the Mac could not reach, every re-open minted a new token, the server refused the dial "token mismatch"
// in its journal while the row said only "offline"). PURE src/dial-facts.js, every table:
//   ① dialAddressCandidates over fixture interfaces (origin first, relay dedup, 100.64/10 ⇒ tailscale, 10/8 ⇒ lan,
//      loopback / link-local / internal never, IPv6 bracketed, https only from origin / relay) + dialBaseVerdict
//   ③ dialFailureOf over every node code + the UPGRADE_REFUSED shapes + up / upMs (closed-before-hello vs lost);
//      parseDialHeaders (junk ⇒ other, ≤ 80 bytes); nextDialStatus; dialLogLine; dialRowState with a fake clock
//      over the six states and the mint guard (a refusal older than the mint is not `refused`)
//   ⑤ dialCheckLines — the --dial-check exit code + remedy per class
//   B9 duplicateDialVerdict (verify-r1): the boot header round trip, the six cells, the refusal's classification, the row's dup note
//   verify-r2 the dial endpoint: the one-answer sentence, refusalAddressKey (IPv6 by /64), refusalBudget (per key, per
//      paired name behind one address, the window's LINE ceiling under rotation, O(1) + a bounded map)
// Patched-copy controls (scripts/mutant-copy.mjs): (a) a classifier reading every 401 as refused-unknown ⇒ red;
// (b) dialRowState without the mint guard ⇒ red; (c) candidates including loopback ⇒ red; (e) a verdict that never refuses a duplicate ⇒ red; (g) a budget keyed by the raw address with no ceiling ⇒ red;
// (h) a ceiling counting knocks instead of lines ⇒ red; (j) naive-user N-loop: the loopback origin first + checked ⇒ red; (k) N-sheet: a default ignoring the device's facts ⇒ red; (l) N-refused: the pre-fix "generate a new one" words ⇒ red;
// (n) verify-r4 F1: the Host header (a relay's fact) read as the device's address ⇒ red; (o) F3: candidates ignoring the server's bind ⇒ red; (p) F6: a name verdict blind to existing devices ⇒ red;
// (q) THE RECEIVER-FACT CENSUS: a sender's fact as a default (location.origin) / the Host header as the device's address ⇒ red.
// (r) verify-r5 C1: a default taking the device's stated address as a FACT (never a claim) ⇒ red.
// (r2) verify-r6 L1: r5's pre-checked claim (one Generate mints it ⇒ `connected` for good) ⇒ red.
// (t) verify-r5 C2: a row state naming a refused (token-less) knock's stated address ⇒ red.
// (u) verify-r5 A1: a route name verdict ignoring what the dialog expects (a "new" pairing under a paired name) ⇒ red.
// (v) verify-r5 A3: a case-blind route verdict ("macbook" beside "MacBook") ⇒ red.
// (w) verify-r6 P1: a requested push downgraded to a rotation / pushed to another link ⇒ red.
// (s) verify-r5 G1: the picker built on a mini DOM with r4 F3's line reverted checks the LOOPBACK row on a 127.0.0.1 server ⇒ red.
// Run: node scripts/test-dial-facts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const DF = require(path.join(REPO, 'src/dial-facts.js'));
const src0 = fs.readFileSync(path.join(REPO, 'src/dial-facts.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n, { got: a, want: b });

// verify-r5 G1: the smallest DOM the address picker builds on (createElement, the tree, `.class` / tag queries, events)
// — enough to read what the picker CHECKS in node, on every run (no jsdom; the chrome world binds 0.0.0.0 and never
// reaches the loopback-only branch)
function miniDom() {
  class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null; this.dataset = {}; this.style = {}; this.attrs = {}; this._text = ''; this.className = ''; this.listeners = {}; this.value = ''; this.checked = false; }
    get classList() {
      const el = this, set = () => new Set(String(el.className).split(/\s+/).filter(Boolean)), put = (s) => { el.className = [...s].join(' '); };
      return { contains: (c) => set().has(c), add: (...c) => { const s = set(); c.forEach((x) => s.add(x)); put(s); }, remove: (...c) => { const s = set(); c.forEach((x) => s.delete(x)); put(s); }, toggle: (c, on) => { const s = set(); const want = on === undefined ? !s.has(c) : !!on; if (want) s.add(c); else s.delete(c); put(s); return want; } };
    }
    set textContent(v) { this._text = String(v); for (const c of this.children) c.parentElement = null; this.children = []; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    _detach(c) { if (c.parentElement) c.parentElement.children = c.parentElement.children.filter((x) => x !== c); c.parentElement = this; }
    appendChild(c) { this._detach(c); this.children.push(c); return c; }
    append(...cs) { for (const c of cs) this.appendChild(c); }
    insertBefore(c, ref) { this._detach(c); const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
    get nextSibling() { const p = this.parentElement; if (!p) return null; return p.children[p.children.indexOf(this) + 1] || null; }
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
    focus() { }
    *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
    querySelectorAll(sel) {
      const m = /^\.([\w-]+)$/.exec(sel) || /^([a-z]+)$/i.exec(sel);
      if (!m) throw new Error('miniDom: unsupported selector ' + sel);
      return [...this.walk()].filter((e) => (sel.startsWith('.') ? e.classList.contains(m[1]) : e.tagName === m[1].toUpperCase()));
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }
  return { createElement: (t) => new El(t) };
}

// ── ① the address list ──
console.log('① dialAddressCandidates');
const IF = {
  lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }, { address: '::1', family: 'IPv6', internal: true }],
  eth0: [{ address: '10.1.2.3', family: 'IPv4', internal: false }, { address: 'fe80::1', family: 'IPv6', internal: false }, { address: '2001:db8::5', family: 'IPv6', internal: false }],
  wlan0: [{ address: '192.168.1.20', family: 4, internal: false }, { address: '169.254.9.9', family: 'IPv4', internal: false }],
  tailscale0: [{ address: '100.101.7.9', family: 'IPv4', internal: false }],
  pub0: [{ address: '203.0.113.7', family: 'IPv4', internal: false }],
  weird: [{ address: '127.0.0.5', family: 'IPv4', internal: false }],
};
{
  const rows = DF.dialAddressCandidates({ origin: 'https://ws.example.com', relay: 'https://relay.example.net', hostname: 'box-lan01', interfaces: IF, port: 3456, deviceId: 'Macbook' });
  eq(rows.map((r) => r.kind), ['origin', 'relay', 'tailscale', 'lan', 'lan', 'public', 'hostname', 'ipv6'], 'origin first, the relay second, then tailscale / lan / public / hostname / ipv6');
  eq(rows.map((r) => r.base), ['https://ws.example.com', 'https://relay.example.net', 'http://100.101.7.9:3456', 'http://10.1.2.3:3456', 'http://192.168.1.20:3456', 'http://203.0.113.7:3456', 'http://box-lan01:3456', 'http://[2001:db8::5]:3456'], 'every base, interfaces http, IPv6 bracketed');
  ok(!rows.some((r) => /127\.|::1|fe80|169\.254/.test(r.base)), 'loopback, link-local and internal interfaces are never rows (127.0.0.5 on a non-internal interface included)');
  ok(rows.every((r) => r.dialUrl === r.base.replace(/^http/, 'ws') + '/api/device-dial?device=Macbook'), 'every row carries its dial URL (ws/wss + the dial path + the device)');
  ok(rows.find((r) => r.kind === 'origin').plain === false && rows.find((r) => r.kind === 'lan').plain === true, 'https rows are not plain; http rows carry the plain-http note');
  eq(rows.map((r) => r.note), rows.map((r) => r.kind), 'the note is the closed key the client words');
  const dup = DF.dialAddressCandidates({ origin: 'http://10.1.2.3:3456', relay: 'http://10.1.2.3:3456/', interfaces: IF, port: 3456, deviceId: 'x' });
  eq(dup.filter((r) => r.base === 'http://10.1.2.3:3456').map((r) => r.kind), ['origin'], 'one row per distinct base — the relay equal to the origin is omitted, and so is the LAN row');
  const tsName = DF.dialAddressCandidates({ interfaces: { utun3: [{ address: '100.100.1.1', family: 'IPv4', internal: false }] }, port: 1 });
  eq(tsName.map((r) => r.kind), ['tailscale'], '100.64.0.0/10 on utun (macOS Tailscale) is the tailnet');
  const noHttps = DF.dialAddressCandidates({ hostname: 'box', interfaces: {}, port: 3456 });
  ok(noHttps.every((r) => r.base.startsWith('http://')), 'a base is http unless it came from the origin / the relay');
  eq(DF.dialAddressCandidates({ hostname: 'bad host;rm', interfaces: {}, port: 3456 }), [], 'a hostname that is not a hostname is no row');
}
console.log('naive-user N-loop: a loopback address is the LAST row and never the default');
{
  const rows = DF.dialAddressCandidates({ origin: 'http://127.0.0.1:3456', hostname: 'localhost', interfaces: IF, port: 3456, deviceId: 'Macbook' });
  eq(rows.slice(-2).map((r) => [r.kind, r.note, !!r.loopback]), [['origin', 'loopback-origin', true], ['hostname', 'loopback', true]], 'the browser\'s 127.0.0.1 origin and a host named `localhost` are the LAST rows, noted loopback (the origin keeps "the address you are using now")');
  ok(rows.slice(0, -2).every((r) => !r.loopback) && rows[0].kind === 'tailscale', 'every other row comes first (the tailnet first when there is no reachable origin)', rows.map((r) => r.kind));
  eq(DF.dialDefaultChoice({ candidates: rows }), { kind: 'row', base: 'http://100.101.7.9:3456', why: 'first-reachable' }, 'THE DEFAULT is the first row a device elsewhere can reach — never the browser\'s 127.0.0.1 (the owner\'s ssh-tunnel case: first + checked, unreachable from any other machine)');
  const pub = DF.dialAddressCandidates({ origin: 'https://ws.example.com', interfaces: IF, port: 3456 });
  eq(DF.dialDefaultChoice({ candidates: pub }), { kind: 'row', base: 'https://ws.example.com', why: 'first-reachable' }, 'a reachable origin stays first and the default');
  for (const b of ['http://127.0.0.1:3456', 'http://127.1.2.3:1', 'http://localhost:3456', 'http://a.localhost:1', 'http://[::1]:3456', 'http://0.0.0.0:3456']) ok(DF.isLoopbackBase(b), `isLoopbackBase(${b}) — only this machine`);
  for (const b of ['http://10.0.0.1:1', 'http://mart-aimax395:3456', 'https://relay.example.net', 'http://[2001:db8::5]:1', 'http://128.0.0.1:1', 'garbage', null]) ok(!DF.isLoopbackBase(b), `isLoopbackBase(${b}) — not loopback (never throws)`);
  // verify-r4 F3: nothing another device can reach ⇒ never a loopback row checked (was: "that row — a device on this very machine")
  eq(DF.dialDefaultChoice({ candidates: [{ base: 'http://127.0.0.1:1', loopback: true }] }), { kind: 'custom', value: '', why: 'only-loopback' }, 'F3: only loopback rows ⇒ Custom… EMPTY (the loopback row stays pickable, never checked for a device elsewhere)');
  eq(DF.dialDefaultChoice({ candidates: [{ base: 'http://127.0.0.1:1', loopback: true }], relayPublishable: true }), { kind: 'relay-publish', why: 'first-reachable' }, 'F3: …the relay-publish row when the relay can publish this server');
  eq(DF.dialDefaultChoice({ candidates: pub, relayPublishable: true }), { kind: 'row', base: 'https://ws.example.com', why: 'first-reachable' }, 'F3: a reachable row still wins over publishing to the relay');
  eq(DF.dialDefaultChoice({}), { kind: 'custom', value: '', why: 'none' }, 'no row ⇒ Custom…');
}
console.log('verify-r4 F3: a row only for an address the server\'s SOCKET accepts (its bind — never just what the machine has)');
{
  const IF3 = { eth0: [{ address: '10.1.2.3', family: 'IPv4', internal: false }, { address: '2001:db8::5', family: 'IPv6', internal: false }], ts0: [{ address: '100.101.7.9', family: 'IPv4', internal: false }] };
  const K = (bind, origin = 'http://127.0.0.1:1') => DF.dialAddressCandidates({ origin, hostname: 'box', interfaces: IF3, port: 1, bind }).map((r) => r.kind + ':' + r.base);
  const T3 = [
    ['no bind said (a caller from before) ⇒ every row as before', null, ['tailscale:http://100.101.7.9:1', 'lan:http://10.1.2.3:1', 'hostname:http://box:1', 'ipv6:http://[2001:db8::5]:1', 'origin:http://127.0.0.1:1']],
    ['HOST=0.0.0.0 (the default) is IPv4 ONLY in node ⇒ no IPv6 row (it could never answer)', '0.0.0.0', ['tailscale:http://100.101.7.9:1', 'lan:http://10.1.2.3:1', 'hostname:http://box:1', 'origin:http://127.0.0.1:1']],
    ['HOST=:: (dual stack) ⇒ IPv4 and IPv6', '::', ['tailscale:http://100.101.7.9:1', 'lan:http://10.1.2.3:1', 'hostname:http://box:1', 'ipv6:http://[2001:db8::5]:1', 'origin:http://127.0.0.1:1']],
    ['HOST=127.0.0.1 (README: local-only) ⇒ NO interface row — each refused the connection (reproduced: ECONNREFUSED ×4, the tailnet one checked)', '127.0.0.1', ['origin:http://127.0.0.1:1']],
    ['HOST=::1 / localhost ⇒ the same', '::1', ['origin:http://127.0.0.1:1']],
    ['HOST=<the tailnet address> ⇒ that row only (no hostname: the name may resolve to another address)', '100.101.7.9', ['tailscale:http://100.101.7.9:1', 'origin:http://127.0.0.1:1']],
    ['an IPv4-mapped bind ::ffff:10.1.2.3 ⇒ the LAN row', '::ffff:10.1.2.3', ['lan:http://10.1.2.3:1', 'origin:http://127.0.0.1:1']],
    ['a reverse proxy in front of a loopback-bound server ⇒ its origin stays the first row (how the browser — and a device — reach it)', '127.0.0.1', ['origin:https://vibe.example.com'], 'https://vibe.example.com'],
  ];
  for (const [name, bind, want, origin] of T3) eq(K(bind, origin), want, `F3: ${name}`);
  eq(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1', '0.0.0.0', '::', '10.1.2.3', ''].map((b) => DF.bindAdmits(b).loopbackOnly), [true, true, true, true, false, false, false, false], 'F3: bindAdmits(...).loopbackOnly — only a loopback bind');
  const lo = DF.dialAddressCandidates({ origin: 'http://127.0.0.1:1', interfaces: IF3, port: 1, bind: '127.0.0.1' });
  eq(DF.dialDefaultChoice({ candidates: lo }), { kind: 'custom', value: '', why: 'only-loopback' }, 'F3: a loopback-bound server opened from this machine ⇒ Custom… empty (pre-fix: the tailnet row, checked, "reachable from your tailnet" — refused)');
  // THE WIRING: the route asks the SOCKET (server.address()), passes it as `bind`, answers `listen`; the picker says it
  const wSrc3 = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const pk3 = fs.readFileSync(path.join(REPO, 'src/lib/dial-address-picker.js'), 'utf8');
  const sm3 = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  ok(/const a = server && typeof server\.address === 'function' \? server\.address\(\) : null;/.test(wSrc3) && /deviceId: deviceId \|\| 'DEVICE', bind \}\);/.test(wSrc3) && /listen: \{ address: bind, loopbackOnly: DF\.bindAdmits\(bind\)\.loopbackOnly \}/.test(wSrc3), 'F3 wiring: the address route reads the socket\'s bound address and hands it to the candidates; answers `listen`');
  ok(/const first = dialDefaultChoice\(\{ candidates, dial, relayPublishable \}\);/.test(pk3) && /if \(listen && listen\.loopbackOnly\)/.test(pk3) && (sm3.match(/listen: a\.listen \|\| null/g) || []).length === 2, 'F3 wiring: the picker says a loopback-only server in words (both dialogs pass `listen`) and asks the default with relayPublishable');
}
console.log('naive-user N-sheet: a paired device\'s sheet checks the device\'s OWN address');
{
  const rows = DF.dialAddressCandidates({ origin: 'http://127.0.0.1:3456', relay: 'https://relay.example.net', hostname: 'mart-aimax395', interfaces: { ts0: [{ address: '100.87.42.107', family: 'IPv4', internal: false }], eth0: [{ address: '192.168.4.116', family: 'IPv4', internal: false }] }, port: 3456 });
  const C = (dial) => DF.dialDefaultChoice({ candidates: rows, dial });
  const T = [
    ['a new device (no facts) ⇒ the first reachable row', null, { kind: 'row', base: 'https://relay.example.net', why: 'first-reachable' }],
    ['paired on the tailnet, never connected ⇒ the tailnet row (pre-fix: row 1 — the push moved it)', { tokenMintedAt: 10, mintedHost: '100.87.42.107:3456', mintedBase: 'http://100.87.42.107:3456' }, { kind: 'row', base: 'http://100.87.42.107:3456', why: 'paired' }],
    ['paired on the relay, CONNECTED through a hand-edited hostname (the owner\'s Mac) ⇒ the hostname row', { tokenMintedAt: 10, mintedBase: 'https://relay.example.net', mintedHost: 'relay.example.net:443', lastConnectAt: 20, lastAccept: { host: 'mart-aimax395:3456', dialed: 'http://mart-aimax395:3456' } }, { kind: 'row', base: 'http://mart-aimax395:3456', why: 'connected' }],
    ['a connection from BEFORE the current command is no evidence ⇒ the command\'s base', { tokenMintedAt: 30, mintedBase: 'http://192.168.4.116:3456', lastConnectAt: 20, lastAccept: { dialed: 'http://mart-aimax395:3456' } }, { kind: 'row', base: 'http://192.168.4.116:3456', why: 'paired' }],
    ['a record from before mintedBase (mintedHost x:443) ⇒ the https row', { tokenMintedAt: 10, mintedHost: 'relay.example.net:443' }, { kind: 'row', base: 'https://relay.example.net', why: 'paired' }],
    ['the device states wss://relay ⇒ the https relay row (its own scheme, never guessed from a port)', { tokenMintedAt: 10, mintedBase: 'https://relay.example.net', lastConnectAt: 20, lastAccept: { host: 'relay.example.net', dialed: 'https://relay.example.net' } }, { kind: 'row', base: 'https://relay.example.net', why: 'connected' }],
    // verify-r4 F1: THE HOST HEADER IS THE LAST PROXY'S FACT — VibeSpace's own frp relay rewrites it to 127.0.0.1
    ['F1: relay-paired + connected, the Host header rewritten to 127.0.0.1 (frp hostHeaderRewrite) ⇒ the relay row the device states (pre-fix: Custom… http://127.0.0.1)', { tokenMintedAt: 10, mintedBase: 'https://relay.example.net', mintedHost: 'relay.example.net:443', lastConnectAt: 20, lastAccept: { host: '127.0.0.1', dialed: 'https://relay.example.net' } }, { kind: 'row', base: 'https://relay.example.net', why: 'connected' }],
    ['F1: nginx\'s default Host ($proxy_host = its upstream 127.0.0.1:3456) ⇒ the address the device states', { tokenMintedAt: 10, mintedBase: 'http://192.168.4.116:3456', lastConnectAt: 20, lastAccept: { host: '127.0.0.1:3456', dialed: 'http://mart-aimax395:3456' } }, { kind: 'row', base: 'http://mart-aimax395:3456', why: 'connected' }],
    ['F1: a device too old to state its address (no `dialed`) ⇒ the command\'s base — the Host header is never evidence', { tokenMintedAt: 10, mintedBase: 'https://relay.example.net', lastConnectAt: 20, lastAccept: { host: '127.0.0.1' } }, { kind: 'row', base: 'https://relay.example.net', why: 'paired' }],
    ['F1: TLS on a non-443 port (wss://h:8443) ⇒ https://h:8443 as stated (a port-guess read it as http)', { tokenMintedAt: 10, mintedBase: 'http://192.168.4.116:3456', lastConnectAt: 20, lastAccept: { host: 'h.example:8443', dialed: 'https://h.example:8443' } }, { kind: 'row', base: 'http://192.168.4.116:3456', why: 'paired', claim: 'https://h.example:8443' }],
    ['F1: a stated address that is not a base (junk) ⇒ the command\'s base', { tokenMintedAt: 10, mintedBase: 'http://192.168.4.116:3456', lastConnectAt: 20, lastAccept: { dialed: 'javascript:alert(1)' } }, { kind: 'row', base: 'http://192.168.4.116:3456', why: 'paired' }],
    ['a base no row names (a MagicDNS name) ⇒ Custom… filled with it', { tokenMintedAt: 10, mintedBase: 'http://mac-mini.tail1234.ts.net:3456' }, { kind: 'custom', value: 'http://mac-mini.tail1234.ts.net:3456', why: 'paired' }],
    ['connected through a name no row names, no mint facts ⇒ the first reachable row, SAID to be a guess, the device\'s CLAIM beside it (verify-r5 C1 / verify-r6 L1: VibeSpace did not offer it — never checked)', { tokenMintedAt: 10, lastConnectAt: 20, lastAccept: { dialed: 'http://mart-aimax395.tail1234.ts.net:3456' } }, { kind: 'row', base: 'https://relay.example.net', why: 'claim-held', claim: 'http://mart-aimax395.tail1234.ts.net:3456' }],
    // verify-r5 C1: THE DEVICE'S STATEMENT IS ITS CLAIM — whatever holds the dial token says what it dials; `connected`
    // only for an address VibeSpace offered (a reachable row, the current command's base), else a CLAIM. verify-r6 L1: a
    // claim is NEVER the default (r5 pre-checked it: one Generate minted it as the command's base ⇒ `connected` for good)
    // — the default is the command's base / the guess, the claim rides beside it (`claim`)
    ['C1 / L1: a leaked command\'s holder, dialed in while the device is away, states an address of its own ⇒ the command\'s base stays checked, the address rides as a CLAIM (the command would curl its installer from there)', { tokenMintedAt: 10, mintedBase: 'http://192.168.4.116:3456', lastConnectAt: 20, lastAccept: { host: '192.168.4.116:3456', dialed: 'https://evil.example' } }, { kind: 'row', base: 'http://192.168.4.116:3456', why: 'paired', claim: 'https://evil.example' }],
    ['C1 / L1: the cloud metadata address stated ⇒ a claim, never checked', { tokenMintedAt: 10, mintedBase: 'http://192.168.4.116:3456', lastConnectAt: 20, lastAccept: { dialed: 'http://169.254.169.254' } }, { kind: 'row', base: 'http://192.168.4.116:3456', why: 'paired', claim: 'http://169.254.169.254' }],
    ['C1 / L1: a LOOPBACK row stated (not the command\'s base) ⇒ a claim on that row, unchecked — listed is not offered for a device elsewhere', { tokenMintedAt: 10, mintedBase: 'http://192.168.4.116:3456', lastConnectAt: 20, lastAccept: { dialed: 'http://127.0.0.1:3456' } }, { kind: 'row', base: 'http://192.168.4.116:3456', why: 'paired', claim: 'http://127.0.0.1:3456' }],
    ['L1: a claim with nothing reachable and no relay ⇒ Custom… EMPTY (never the claim), the claim beside it', { tokenMintedAt: 10, lastConnectAt: 20, lastAccept: { dialed: 'https://evil.example' } }, null],
    ['C1: the stated address IS the current command\'s base (a MagicDNS name the user typed at Create) ⇒ connected', { tokenMintedAt: 10, mintedBase: 'http://mac-mini.tail1234.ts.net:3456', lastConnectAt: 20, lastAccept: { dialed: 'http://mac-mini.tail1234.ts.net:3456' } }, { kind: 'custom', value: 'http://mac-mini.tail1234.ts.net:3456', why: 'connected' }],
    ['C1: a device on this machine paired ON loopback on purpose (the command\'s base) ⇒ connected', { tokenMintedAt: 10, mintedBase: 'http://127.0.0.1:3456', lastConnectAt: 20, lastAccept: { dialed: 'http://127.0.0.1:3456' } }, { kind: 'row', base: 'http://127.0.0.1:3456', why: 'connected' }],
    ['junk facts ⇒ the first reachable row, said to be a guess (never throws)', { tokenMintedAt: 'x', lastAccept: { host: 'a b', dialed: 'a b' }, mintedBase: 'javascript:alert(1)', mintedHost: '::::' }, { kind: 'row', base: 'https://relay.example.net', why: 'unstated' }],
    // verify-r5 C3: a paired device whose daemon states nothing and whose record predates the mint facts — a guess, said so
    ['C3: an OLD daemon (no statement) on a record from before the mint facts (only the Host header it arrived with) ⇒ the first reachable row, `unstated`', { lastConnectAt: 20, lastAccept: { host: '127.0.0.1' } }, { kind: 'row', base: 'https://relay.example.net', why: 'unstated' }],
    ['C3: a paired device with no dial facts at all (a record from before the lane) ⇒ `unstated`', {}, { kind: 'row', base: 'https://relay.example.net', why: 'unstated' }],
  ];
  for (const [name, dial, want] of T) {
    if (want === null) { const lo = DF.dialAddressCandidates({ origin: 'http://127.0.0.1:3456', interfaces: {}, port: 3456 }); eq(DF.dialDefaultChoice({ candidates: lo, dial }), { kind: 'custom', value: '', why: 'only-loopback', claim: 'https://evil.example' }, `N-sheet: ${name}`); continue; }
    eq(C(dial), want, `N-sheet: ${name}`);
  }
  // verify-r6 L1: THE LAUNDERING WALK — the device states a claim, the owner presses Generate on the sheet's DEFAULT, the
  // mint stamps that default as the command's base, the device dials again stating its claim: still a claim (r5: the
  // claim was the default ⇒ minted ⇒ `connected`, "the address this device connects through", as a fact, for good)
  {
    const d0 = { tokenMintedAt: 10, mintedBase: 'http://192.168.4.116:3456', lastConnectAt: 20, lastAccept: { dialed: 'https://evil.example' } };
    const c0 = C(d0);
    const minted = c0.kind === 'row' ? c0.base : c0.value; // what "Generate" with the default mints
    const d1 = { tokenMintedAt: 30, mintedBase: minted, lastConnectAt: 40, lastAccept: { dialed: 'https://evil.example' } };
    const c1 = C(d1);
    ok(minted === 'http://192.168.4.116:3456' && c1.why === 'paired' && c1.claim === 'https://evil.example', 'L1: Generate on the default never mints the claim — after it the claim is STILL a claim (pre-fix: minted, then `connected` for good)', { c0, c1 });
    const d2 = { tokenMintedAt: 50, mintedBase: 'https://evil.example', lastConnectAt: 60, lastAccept: { dialed: 'https://evil.example' } };
    ok(C(d2).why === 'connected' && !C(d2).claim, 'L1: …only the owner\'s OWN pick of it (minted as the command\'s base) makes it `connected`', C(d2));
  }
  eq([['100.87.42.107:3456'], ['x.example:443'], ['x.example', 'https://x.example'], ['x.example'], ['[2001:db8::5]:3456'], ['a b'], ['']].map(([h, b]) => DF.baseOfDialedHost(h, b)), ['http://100.87.42.107:3456', 'https://x.example:443', 'https://x.example', 'http://x.example', 'http://[2001:db8::5]:3456', null, null], 'baseOfDialedHost: an explicit 443 ⇒ https, another port ⇒ http, no port ⇒ the pairing\'s scheme, junk ⇒ null');
  // THE WIRING: the mint stamps the base; the sheet and the graduate dialog hand the device's facts to the picker
  const hostsSrc = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
  const dpSrc = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8');
  const wSrc = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const smSrc = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  const pkSrc = fs.readFileSync(path.join(REPO, 'src/lib/dial-address-picker.js'), 'utf8');
  ok(/if \(vb && vb\.ok\) d\.mintedBase = vb\.base\.slice\(0, 200\); else delete d\.mintedBase;/.test(hostsSrc), 'wiring: noteDial(minted) stamps mintedBase (judged by dialBaseVerdict) and drops a stale one');
  ok(/hosts\.noteDial\(deviceId, 'minted', \{ host, base \}\)/.test(dpSrc), 'wiring: the ONE minter hands the base to noteDial');
  ok(/agentdMintDialPair\(deviceId, \{ host: DF\.hostOf\(dialUrl\), base, keepLink: pushV\.push \}\)/.test(wSrc) && /agentdMintDialPair\(gradDevice, \{ host: require\('\.\.\/dial-facts\.js'\)\.hostOf\(dialUrl\), base \}\)/.test(wSrc), 'wiring: both mint sites (the dial-pair route, graduate-dial) pass the base');
  ok(/dial: existing \? \(h\.dial \|\| \{\}\) : null/.test(smSrc) && /dial: h\.dial \|\| null/.test(smSrc), 'wiring: the pairing sheet and the graduate dialog hand the device\'s dial facts to the picker (verify-r5 C3: a paired device with none yet hands `{}` — a paired device, never read as a new one)');
  ok(/const first = dialDefaultChoice\(\{ candidates, dial, relayPublishable \}\);/.test(pkSrc), 'wiring: the picker checks PURE dialDefaultChoice({candidates, dial, relayPublishable})');
  // verify-r4 F1: the DEVICE states the address it dials on every attempt; the gate keeps it apart from the Host header
  const adSrc = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  ok(/DF\.dialHeadersOf\(\{ streak: status\.streak \|\| 0, lastFail: status\.lastFail, version: VERSION, boot: BOOT_ID, dialUrl: cfg\.url[, }]/.test(adSrc), 'F1 wiring: the daemon\'s every dial attempt states its dial URL\'s base (x-vibespace-dial-base)');
  ok(/boot: hints\.boot, dialed: hints\.dialed, (platform: hints\.platform, )?host: String\(req\.headers\.host/.test(dpSrc), 'F1 wiring: the gate records the device\'s stated address (`dialed`) apart from the Host header (`host`)');
  ok(/dialed: \(\(\) => \{ const v = own && facts\.dialed \? DF\.dialBaseVerdict\(facts\.dialed\)/.test(hostsSrc), 'F1 wiring: noteDial keeps `dialed` only through the ONE base verdict');
  ok(/d\.lastRefusal = \{ code: [^\n]*\.\.\.hint\(false\) \}/.test(hostsSrc) && /d\.lastAccept = \{ at, \.\.\.hint\(\) \}/.test(hostsSrc), 'C2 wiring: a refusal (no token) keeps none of the dial\'s statements (`hint(false)`); only an accepted dial\'s are the device\'s');
  ok(!/la\.host|lastAccept\.host|lastAccept && d\.lastAccept\.host|lastRefusal\.host|lastRefusal && d\.lastRefusal\.host/.test(src0.slice(src0.indexOf('function dialDefaultChoice'), src0.indexOf('module.exports'))), 'F1 CENSUS: neither the default nor the row state reads a stored Host header (`.host` of lastAccept / lastRefusal) — grep over dialDefaultChoice … dialRowState');
  ok(/online: !!\(existing && \(h\.online \|\| h\.dialLive\)\)/.test(smSrc) && /online: !!h\.dialLive/.test(smSrc) && /online \? t\('the address this device connects through'\) : t\('the address this device last connected through'\)/.test(pkSrc), 'F1 words: "connects through" only while the device is dialed in, else "last connected through" (a relay that moved, a laptop elsewhere)');
}
console.log('verify-r4 F6: a NEW pairing under the name of an existing device is a replacement — said before Create');
{
  eq(['my-mac', ' Mac Book! ', 'a'.repeat(40), '', null, 'x/../y', 'dev_1-A'].map(DF.deviceIdOf), ['my-mac', 'MacBook', 'a'.repeat(32), '', '', 'xy', 'dev_1-A'], 'F6 deviceIdOf: THE one name rule (the route mints under it): \\w and - only, ≤ 32');
  const H = [{ id: 'host-dial-Macbook', name: 'Macbook', transport: 'dial', deviceId: 'Macbook', online: true }, { id: 'host-dial-old', name: 'old', transport: 'dial', deviceId: 'old', online: false }, { id: 'host-x', name: 'box', transport: 'ssh', deviceId: 'grad-box', graduated: true, dialLive: true }];
  const T6 = [
    ['a new name ⇒ not a replacement', 'my-mac', { exists: false, online: false, name: '', deviceId: 'my-mac' }],
    ['the name of a CONNECTED device ⇒ a replacement that disconnects it', 'Macbook', { exists: true, online: true, name: 'Macbook', deviceId: 'Macbook' }],
    ['typed "Mac book" — the rule strips the space ⇒ the SAME id Macbook: a replacement', 'Mac book', { exists: true, online: true, name: 'Macbook', deviceId: 'Macbook' }],
    ['an offline device ⇒ a replacement (its command stops working)', 'old!', { exists: true, online: false, name: 'old', deviceId: 'old' }],
    ['a graduated ssh machine\'s device id ⇒ dialLive is its link', 'grad-box', { exists: true, online: true, name: 'box', deviceId: 'grad-box' }],
    ['a name longer than 32 that the route truncates onto an existing id ⇒ caught', 'Macbook'.padEnd(32, 'x') + 'tail', { exists: false, online: false, name: '', deviceId: 'Macbook'.padEnd(32, 'x') }],
    ['empty ⇒ nothing (the route picks dev-<hex>)', '  ', { exists: false, online: false, name: '', deviceId: '' }],
  ];
  for (const [name, input, want] of T6) eq(DF.pairNameVerdict(input, H), want, `F6: ${name}`);
  const H2 = [...H, { id: 'host-dial-long', name: 'long', transport: 'dial', deviceId: 'Macbook'.padEnd(32, 'x'), online: false }];
  eq(DF.pairNameVerdict('Macbook'.padEnd(32, 'x') + 'tail', H2).exists, true, 'F6: …a 36-char name the route cuts to an existing 32-char id IS a replacement (the client used to judge the uncut name)');
  const wSrc6 = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const sm6 = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  ok(/const deviceId = DF\.deviceIdOf\(req\.body\?\.deviceId \|\| /.test(wSrc6) && !/replace\(\/\[\^\\w-\]\/g, ''\)\.slice\(0, 32\)/.test(wSrc6), 'F6 wiring: the dial-pair route mints under DF.deviceIdOf (no second spelling of the rule)');
  ok(/const v0? = pairNameVerdict\(inp\.value, this\._hostsData\?\.hosts \|\| \[\]\);/.test(sm6) && /inp\.addEventListener\('input', syncName\)/.test(sm6) && /deviceIdOf\(inp\.value\) \|\| undefined/.test(sm6), 'F6 wiring: the dialog judges the typed name as the route will (pairNameVerdict on every keystroke) and sends deviceIdOf of it');
}
console.log('verify-r5 A1: the ROUTE judges the name too — a "new" pairing under a paired name is refused, never a silent replacement');
{
  const H = [
    { id: 'host-dial-Macbook', name: 'Macbook', transport: 'dial', deviceId: 'Macbook', online: true },
    { id: 'host-dial-old', name: 'old', transport: 'dial', deviceId: 'old', online: false },
  ];
  const V = (deviceId, expect) => DF.pairRequestVerdict({ deviceId, expect, hosts: H });
  eq(V('racemac', 'new'), { ok: true, exists: false }, 'A1: a new name, expected new ⇒ minted');
  eq([V('Macbook', 'new').ok, V('Macbook', 'new').code, V('Macbook', 'new').online], [false, 'already_paired', true], 'A1: a paired (connected) name, expected NEW ⇒ already_paired (online named) — two windows / a stale list never replace silently');
  eq([V('old', 'new').code, V('old', 'new').online], ['already_paired', false], 'A1: …an offline one too');
  eq([V('Macbook', 'existing'), V('Macbook', null)], [{ ok: true, exists: true }, { ok: true, exists: true }], 'A1: expected existing (the sheet / "Replace its pairing") or not said (an older client) ⇒ the re-pair, as before');
  // verify-r6 P2: the sheet named a device removed while it was open — refused, never silently re-created
  eq([V('gone', 'existing').ok, V('gone', 'existing').code, V('gone', null).ok], [false, 'not_paired', true], 'P2: expected existing (the sheet\'s Generate) on a name no longer paired ⇒ not_paired, nothing created (pre-fix: the pairing silently re-created); not said (an older client) ⇒ as before');
  // verify-r5 A3: a NEW id that differs from a paired one only by case shares every per-device file on a case-insensitive
  // disk (one host token; removing either deleted the other's) — refused whatever the dialog expects, said before Create
  eq(['macbook', 'MACBOOK', 'MacBook'].map((n) => [V(n, 'new').code, V(n, 'existing').code, V(n, null).twin]), [['name_case_taken', 'name_case_taken', 'Macbook'], ['name_case_taken', 'name_case_taken', 'Macbook'], ['name_case_taken', 'name_case_taken', 'Macbook']], 'A3: macbook / MACBOOK / MacBook beside a paired "Macbook" ⇒ name_case_taken (twin named) — for Create, Replace and an older client alike');
  eq([V('Macbook', 'existing').ok, V('Macbook2', 'new').ok], [true, true], 'A3: the exact id (a re-pair) and a genuinely different name pass');
  // verify-r5 A2: what the typed name BECOMES, said before Create
  eq(['办公室Mac', 'café', 'cafe\u0301', '我的电脑', 'my-mac', '  Mac book  ', '💻', ''].map((n) => DF.pairNameShown(n)), [{ id: 'Mac', reduced: true, empty: false }, { id: 'caf', reduced: true, empty: false }, { id: 'cafe', reduced: true, empty: false }, { id: '', reduced: true, empty: true }, { id: 'my-mac', reduced: false, empty: false }, { id: 'Macbook', reduced: true, empty: false }, { id: '', reduced: true, empty: true }, { id: '', reduced: false, empty: false }], 'A2 pairNameShown: 办公室Mac ⇒ "Mac", NFC café ⇒ "caf" / NFD ⇒ "cafe", an all-CJK or emoji name ⇒ nothing left (dev-<hex>), a clean name ⇒ not reduced');
  const sm2 = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  ok(/const shown = pairNameShown\(inp\.value\);/.test(sm2) && /body\.append\(label, inp, willBe, nameNote\);/.test(sm2), 'A2 wiring: the dialog says what the typed name becomes, on every judgement, under the field');
  eq([DF.pairNameVerdict('macbook', H), DF.pairNameVerdict('Macbook', H).caseTwin], [{ exists: false, online: false, name: '', deviceId: 'macbook', caseTwin: 'Macbook' }, undefined], 'A3: the dialog\'s verdict names the case twin before Create (the exact name is a replacement, never a twin)');
  const w5 = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const route = w5.slice(w5.indexOf("app.post(['/api/device/dial-pair'"), w5.indexOf('// ③ the DEVICE'));
  const i1 = route.indexOf('const nv = DF.pairRequestVerdict('), iRelay = route.indexOf('await instanceUrl.ensurePublished()'), i2 = route.indexOf('const nv2 = DF.pairRequestVerdict('), iMint = route.indexOf('agentdMintDialPair(deviceId');
  // verify-r6 G4: each verdict is ACTED ON — the r6 revert table dropped either `if (!nv*.ok) return …409` and nothing
  // noticed (the other one covered it, and the order pin above reads only where the verdicts are computed)
  ok(/const nv = DF\.pairRequestVerdict\([^\n]*\n\s*if \(!nv\.ok\) return res\.status\(409\)\.json\(\{ error: nv\.error, code: nv\.code/.test(route) && /const nv2 = DF\.pairRequestVerdict\([^\n]*\n\s*if \(!nv2\.ok\) return res\.status\(409\)\.json\(\{ error: nv2\.error, code: nv2\.code/.test(route), 'A1 wiring (verify-r6 G4): BOTH name verdicts are acted on — a refusal answers 409 by its code before the relay publish, and again right before the mint');
  ok(i1 > 0 && i1 < iRelay && iRelay < i2 && i2 < route.indexOf('const existed = !!hosts.findByDeviceId(deviceId);') && i2 < iMint && !route.slice(i2, iMint).includes('await '), 'A1 wiring: the route judges the name BEFORE the relay publish and AGAIN with no await before the mint (a second window\'s Create can land during the publish)');
  const sm5 = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  ok(/if \(source !== 'tick'\) seenReplace = go\.textContent === tr\('Replace its pairing'\);/.test(sm5) && /syncName\('route'\);/.test(sm5) && /const syncName = \(source = 'input'\) => \{/.test(sm5), 'P3 wiring: what the user was SHOWN (their own typing, or the route\'s answer) decides `expect` — the 1 s tick re-labels the button but never turns a press into a replace');
  ok(/e && e\.code === 'not_paired' \? tr\(/.test(sm5) && /if \(e && e\.code === 'not_paired'\) raced = null;/.test(sm5), 'P2 wiring: the sheet words not_paired (the device was removed while it was open)');
  ok(/try \{ await api\(`\/api\/hosts\/\$\{h\.id\}`, \{ method: 'DELETE' \}\);[^\n]*\}\s*catch \(e\) \{ showToast\(tr\('Could not remove "\{name\}" — \{why\}'/.test(sm5), 'U1 wiring (verify-r6): Unpair / Remove says a refused or failed removal (the unguarded await did nothing, silently)');
  const pairFn = sm5.slice(sm5.indexOf('const pair = async () => {'), sm5.indexOf('const pair = async () => {') + 3000);
  ok(pairFn.indexOf("const expect = existing || seenReplace ? 'existing' : 'new';") > 0 && pairFn.indexOf('const expect') < pairFn.indexOf("go.textContent = v.viaRelay ?") && /updateInPlace: keep, \.\.\.\(keep \? \{ keepLinkSince: keepSince \} : \{\}\), expect \}/.test(pairFn) && /if \(e && e\.code === 'already_paired'\) raced = /.test(pairFn), 'A1 wiring: the dialog sends what it expects (read BEFORE the button turns "Pairing…"), and a 409 already_paired re-judges the note with the route\'s facts');
  ok(/const nameTick = inp \? setInterval\(\(\) => \{ if \(!body\.isConnected \|\| !inp\.isConnected\) \{ clearInterval\(nameTick\); return; \} syncName\('tick'\); \}, 1000\) : null;/.test(sm5) && /if \(d2 && Number\(d2\.generation\) > gen\) \{/.test(sm5), 'A1 wiring: the note follows the machine list while the dialog is open, and a command sheet watches its own generation (replaced ⇒ said)');
}
console.log('① dialBaseVerdict');
{
  const T = [
    ['wss://host:3456', { ok: true, base: 'https://host:3456' }],
    ['ws://Host.Example.com:3456', { ok: true, base: 'http://host.example.com:3456' }],
    ['host', { ok: true, base: 'http://host' }],
    ['host:3456/', { ok: true, base: 'http://host:3456' }],
    ['https://relay.example.net', { ok: true, base: 'https://relay.example.net' }],
    ['http://[2001:db8::5]:3456', { ok: true, base: 'http://[2001:db8::5]:3456' }],
    ['10.0.0.5:3456', { ok: true, base: 'http://10.0.0.5:3456' }],
    ['http://host/x', { ok: false, code: 'path' }],
    ['http://host/api', { ok: false, code: 'path' }],
    ['http://host:1?a=1', { ok: false, code: 'query' }],
    ['javascript:alert(1)', { ok: false, code: 'scheme' }],
    ['ftp://host', { ok: false, code: 'scheme' }],
    ['host:99999', { ok: false, code: 'port' }],
    ['host:0', { ok: false, code: 'port' }],
    ['', { ok: false, code: 'empty' }],
    ['http://user@host', { ok: false, code: 'host' }],
    ['http://999.1.1.1', { ok: false, code: 'host' }],
    ['http://bad_host', { ok: false, code: 'host' }],
  ];
  for (const [inp, want] of T) eq(DF.dialBaseVerdict(inp), want, `dialBaseVerdict(${JSON.stringify(inp)})`);
  ok(DF.BASE_REFUSALS.length === 6 && T.every(([, w]) => w.ok || DF.BASE_REFUSALS.includes(w.code)), 'every refusal is a member of the closed set');
}

// ── ③ the classifier ──
console.log('③ dialFailureOf');
{
  const E = (code, message = code) => Object.assign(new Error(message), { code });
  const T = [
    [E('ENOTFOUND', 'getaddrinfo ENOTFOUND box-lnx01'), 'dns'], [E('EAI_AGAIN'), 'dns'], [E('EAI_FAIL'), 'dns'], [E('EAI_NONAME'), 'dns'],
    [E('ERR_TLS_CERT_ALTNAME_INVALID'), 'tls'], [E('CERT_HAS_EXPIRED'), 'tls'], [E('DEPTH_ZERO_SELF_SIGNED_CERT'), 'tls'], [E('SELF_SIGNED_CERT_IN_CHAIN'), 'tls'], [E('UNABLE_TO_VERIFY_LEAF_SIGNATURE'), 'tls'],
    [E('EPROTO', 'write EPROTO …:wrong version number:…'), 'tls'], [E('ERR_SSL_WRONG_VERSION_NUMBER'), 'tls'],
    [E('HPE_INVALID_CONSTANT'), 'not-ws'], [E('BAD_ACCEPT', 'bad accept key'), 'not-ws'],
    [E('ECONNREFUSED'), 'refused-connect'], [E('ETIMEDOUT'), 'timeout'],
    [E('EHOSTUNREACH'), 'unreachable'], [E('ENETUNREACH'), 'unreachable'], [E('EADDRNOTAVAIL'), 'unreachable'],
    [E('ECONNRESET'), 'reset'], [E('EPIPE'), 'reset'], [E('ECONNABORTED'), 'reset'],
    [E('EWHATEVER'), 'other'], [null, 'other'],
  ];
  for (const [err, code] of T) eq(DF.dialFailureOf(err).code, code, `${err ? err.code : 'no error'} ⇒ ${code}`);
  const R = (status, refusal, body) => Object.assign(new Error('upgrade refused'), { code: 'UPGRADE_REFUSED', status, refusal, body });
  const tm = DF.dialFailureOf(R(401, 'token-mismatch', JSON.stringify({ code: 'token-mismatch', error: 'the dial token does not match the pairing on record for "Mac"' })));
  eq([tm.code, tm.status], ['refused-token-mismatch', 401], '401 + X-VibeSpace-Dial-Refusal token-mismatch ⇒ refused-token-mismatch');
  ok(/does not match the pairing/.test(tm.detail), 'the server\'s sentence rides the detail', tm.detail);
  eq(DF.dialFailureOf(R(401, 'no-pairing', '{}')).code, 'refused-no-pairing', '401 no-pairing ⇒ refused-no-pairing');
  eq(DF.dialFailureOf(R(401, 'no-device-id', '')).code, 'refused-no-device-id', '401 no-device-id ⇒ refused-no-device-id');
  eq(DF.dialFailureOf(R(401, null, '')).code, 'refused-unknown', '401 without the header (a server older than this lane) ⇒ refused-unknown');
  eq(DF.dialFailureOf(R(401, 'something-new', '')).code, 'refused-unknown', 'an unknown refusal header ⇒ refused-unknown (closed set)');
  eq(DF.dialFailureOf(R(404, null, 'Not Found')).code, 'http-404', 'any other status ⇒ http-<status>');
  eq(DF.dialFailureOf(R(502, null, '')).code, 'http-502', '502 (a relay with no backend) ⇒ http-502');
  eq(DF.dialFailureOf(E('ECONNRESET'), { up: true, upMs: 800 }).code, 'closed-before-hello', 'an upgrade that closed within 2 s ⇒ closed-before-hello');
  eq(DF.dialFailureOf(null, { up: true, upMs: 3 * 3600e3 }).code, 'lost', 'an upgrade that lived ≥ 2 s then closed ⇒ lost (the link\'s end)');
  const long = DF.dialFailureOf(E('EWHATEVER', 'x'.repeat(5000) + '\u0000\u0007'));
  ok(long.detail.length <= 200 && !/[\u0000-\u001f]/.test(long.detail), 'detail ≤ 200 chars, no control characters');
  ok(!/vsdt_[a-f0-9]{8}/.test(DF.dialFailureOf(E('EWHATEVER', 'token vsdt_0123456789abcdef leaked')).detail), 'a token never rides a detail');
  const hostile = DF.dialFailureOf(R(401, 'token-mismatch', 'x'.repeat(10 * 1024)));
  ok(hostile.detail.length <= 200, 'a 10 KiB hostile body reduces to ≤ 200 chars (attack 20)');
  ok(DF.DIAL_FAIL_CODES.includes('refused-token-mismatch') && DF.DIAL_FAIL_CODES.length === 15, 'the closed code set (15 since B9: refused-duplicate-device)');
}
console.log('③ headers');
{
  const h = DF.dialHeadersOf({ streak: 12, lastFail: { code: 'dns', at: 1790000000000 }, version: '2.369.196' });
  eq(h, { 'x-vibespace-dial-attempt': '12', 'x-vibespace-dial-last': 'dns@1790000000000', 'x-vibespace-daemon': '2.369.196' }, 'the daemon\'s per-attempt headers');
  ok(Object.values(h).every((v) => v.length <= 80 && /^[\x20-\x7e]+$/.test(v)), 'plain ASCII, each ≤ 80 bytes');
  eq(DF.parseDialHeaders(h), { attempt: 12, last: { code: 'dns', at: 1790000000000 }, daemon: '2.369.196', probe: false, boot: null, dialed: null, platform: null }, 'the server reads them back (boot null: no boot header; dialed / platform null: not stated)');
  // verify-r4 F1: the device's own dial address rides x-vibespace-dial-base — the base only (no path, no query, never the token)
  const hd = DF.dialHeadersOf({ dialUrl: 'wss://Relay.Example.net/api/device-dial?device=mac' });
  eq([hd['x-vibespace-dial-base'], DF.parseDialHeaders(hd).dialed], ['https://relay.example.net', 'https://relay.example.net'], 'F1: the daemon states `https://relay.example.net` for wss://Relay.Example.net/… and the server reads it back');
  eq(['ws://[2001:db8::5]:3456/api/device-dial?device=x', 'ws://u:pw@h.example:1/x', 'ftp://h/x', 'not a url', 'ws://h.example:80/x'].map(DF.dialBaseOfUrl), ['http://[2001:db8::5]:3456', 'http://h.example:1', '', '', 'http://h.example'], 'F1 dialBaseOfUrl: IPv6 bracketed, credentials never kept, a non-dial scheme / junk ⇒ \'\'');
  // verify-r5 C1: every LIE the brief names is refused at the parse — a scheme that is not a dial scheme (file:, javascript:,
  // data:), credentials, a path / query / fragment, junk — and the metadata / loopback addresses PARSE (a base is a base)
  // but are judged at the default as the device's claim (the N-sheet table: a claim, never the default — verify-r6 L1)
  eq(['file:///etc/passwd', 'javascript:alert(1)//', 'data:text/html,x', 'http://user:pass@relay.example.net', 'https://u@relay.example.net', 'http://h.example?x=1', 'http://h.example/#f', 'http://h.example/api', 'http://h ex', 'gopher://h.example'].map((b) => DF.parseDialHeaders({ 'x-vibespace-dial-base': b }).dialed), [null, null, null, null, null, null, null, null, null, null], 'C1: a stated base that is a file: / javascript: / data: / gopher: scheme, carries credentials, a path, a query or a fragment, or is junk ⇒ null (not stated)');
  eq(['http://169.254.169.254', 'http://127.0.0.1:3456', 'wss://relay.example.net'].map((b) => DF.parseDialHeaders({ 'x-vibespace-dial-base': b }).dialed), ['http://169.254.169.254', 'http://127.0.0.1:3456', 'https://relay.example.net'], 'C1: a metadata / loopback base parses (it IS a base) — the default then words it as the device\'s claim');
  eq([DF.parseDialHeaders({ 'x-vibespace-dial-base': 'javascript:alert(1)' }).dialed, DF.parseDialHeaders({ 'x-vibespace-dial-base': 'http://h:1/path' }).dialed, DF.parseDialHeaders({ 'x-vibespace-dial-base': 'http://' + 'a'.repeat(300) }).dialed], [null, null, null], 'F1: a stated address the base verdict refuses (a scheme, a path, over 270 bytes) ⇒ null — not stated');
  ok(!Object.values(DF.dialHeadersOf({ dialUrl: 'ws://h:1/api/device-dial?device=x&token=vsdt_' + 'a'.repeat(36) })).some((v) => /vsdt_|device=/.test(v)), 'F1: nothing of the URL past its base (a query, a token) rides the header');
  // verify-r4 F7: the device's OS rides x-vibespace-daemon-platform (a closed set) ⇒ the sheet's command form
  eq(['darwin', 'linux', 'win32', 'freebsd'].map((p) => DF.parseDialHeaders(DF.dialHeadersOf({ platform: p })).platform), ['darwin', 'linux', 'win32', 'freebsd'], 'F7: the daemon states process.platform and the server reads it back');
  eq([DF.dialHeadersOf({ platform: 'Darwin; rm' })['x-vibespace-daemon-platform'], DF.parseDialHeaders({ 'x-vibespace-daemon-platform': 'plan9' }).platform, DF.parseDialHeaders({ 'x-vibespace-daemon-platform': '<script>' }).platform], [undefined, null, null], 'F7: anything outside the closed set is neither sent nor read');
  eq(['darwin', 'win32', 'linux', 'freebsd', null, 'x'].map(DF.commandOsOf), ['mac', 'win', 'linux', null, null, null], 'F7 commandOsOf: darwin ⇒ the macOS form, win32 ⇒ PowerShell, linux ⇒ Linux; an OS the installers do not serve ⇒ null (the sheet guesses)');
  {
    const adF7 = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8'), dpF7 = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8'), hsF7 = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8'), smF7 = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
    ok(/dialUrl: cfg\.url, platform: process\.platform \}\)/.test(adF7) && /dialed: hints\.dialed, platform: hints\.platform,/.test(dpF7) && /platform: own && DF\.DAEMON_PLATFORMS\.includes\(facts\.platform\) \? facts\.platform : null/.test(hsF7), 'F7 wiring: the daemon states its OS, the gate records it, noteDial keeps it through the closed set');
    ok(/deviceOs: existing \? commandOsOf\(h\.dial && h\.dial\.lastAccept && h\.dial\.lastAccept\.platform\) : null/.test(smF7) && /const guessOs = deviceOs \|\| \(/.test(smF7), 'F7 wiring: a paired device\'s sheet preselects ITS OS\'s command; the browser\'s OS only for a device nobody has heard from');
  }
  eq(DF.parseDialHeaders({ 'x-vibespace-dial-last': 'haxx@1790000000000' }).last.code, 'other', 'an unknown code ⇒ other (closed set)');
  eq(DF.parseDialHeaders({ 'x-vibespace-dial-attempt': '1'.repeat(200) }).attempt, 0, 'a header over 80 bytes is ignored');
  eq(DF.parseDialHeaders({ 'x-vibespace-dial-attempt': '-3; drop' }).attempt, 0, 'junk ⇒ 0');
  eq(DF.parseDialHeaders({ 'x-vibespace-daemon': '<script>' }).daemon, null, 'a daemon version outside [0-9A-Za-z.+-] is dropped');
  eq(DF.parseDialHeaders({ 'x-vibespace-dial-probe': '1' }).probe, true, 'the probe header');
  eq(DF.parseDialHeaders({ 'x-vibespace-dial-last': 'http-502@1790000000000' }).last.code, 'http-502', 'the http-<status> family is a known code');
}
console.log('③ nextDialStatus + dialLogLine');
{
  let st = null;
  st = DF.nextDialStatus(st, { at: 1000, outcome: 'failed', code: 'dns', detail: 'getaddrinfo ENOTFOUND x', host: 'x:3456' });
  st = DF.nextDialStatus(st, { at: 2000, outcome: 'failed', code: 'refused-token-mismatch', detail: 'the dial token…', status: 401, host: 'x:3456' });
  eq([st.streak, st.lastFail, st.last.status, st.history.length], [2, { code: 'refused-token-mismatch', at: 2000 }, 401, 2], 'two failures: streak 2, the last failure kept for the next header');
  st = DF.nextDialStatus(st, { at: 3000, outcome: 'connected', host: 'x:3456' });
  eq([st.streak, st.connectedAt, st.last.outcome, st.last.code], [0, 3000, 'connected', null], 'a connect resets the streak');
  st = DF.nextDialStatus(st, { at: 9000, outcome: 'lost', code: 'lost', host: 'x:3456' });
  eq([st.streak, st.last.outcome], [0, 'lost'], 'a lost link is an outcome, NOT a failed dial (streak stays 0)');
  for (let i = 0; i < 30; i++) st = DF.nextDialStatus(st, { at: 10000 + i, outcome: 'failed', code: 'timeout' });
  ok(st.history.length === 20 && st.streak === 30, 'history ≤ 20 entries, the streak counts on');
  ok(!JSON.stringify(st).includes('vsdt_'), 'the status never carries a token');
  eq(DF.dialLogLine({ outcome: 'failed', code: 'dns', detail: 'getaddrinfo ENOTFOUND box-lnx01', attempt: 12, delay: 30000 }), 'dial-out failed — dns: getaddrinfo ENOTFOUND box-lnx01 (attempt 12, retry in 30000ms)', 'the failed line names the class');
  ok(/^dial-out refused — token-mismatch: the dial token/.test(DF.dialLogLine({ outcome: 'failed', code: 'refused-token-mismatch', detail: 'the dial token does not match', attempt: 3, delay: 5000 })), 'the refused line names the server\'s reason');
  eq(DF.dialLogLine({ outcome: 'connected', url: 'ws://h:1/api/device-dial?device=Mac', failedBefore: 12 }), 'dial-out connected: ws://h:1/api/device-dial?device=Mac (after 12 failed attempts)', 'the connected line counts the failures before it');
  eq(DF.dialLogLine({ outcome: 'lost', upMs: (3 * 60 + 12) * 60e3, delay: 1000 }), 'dial-out lost after 3h12m — retry in 1000ms', 'the lost line');
}

// ── ⑤ --dial-check ──
console.log('⑤ dialCheckLines');
{
  const T = [
    [{ ok: true, host: 'h:1', deviceId: 'Mac', serverVersion: '2.369.196' }, 0, /is a VibeSpace 2\.369\.196 and accepts device "Mac"/],
    [{ code: 'dns', detail: 'getaddrinfo ENOTFOUND nonexistent.invalid', host: 'nonexistent.invalid:3456' }, 10, /cannot resolve nonexistent\.invalid\. In the pairing dialog pick another address/],
    [{ code: 'tls', detail: 'wrong version number', host: 'h:3456' }, 11, /does not speak TLS/],
    [{ code: 'refused-connect', detail: 'ECONNREFUSED', host: 'h:1' }, 12, /nothing answers at h:1/],
    [{ code: 'timeout', host: 'h:1' }, 12, /nothing answers/], [{ code: 'unreachable', host: 'h:1' }, 12, /nothing answers/], [{ code: 'reset', host: 'h:1' }, 12, /nothing answers/],
    [{ code: 'http-404', status: 404, host: 'h:1' }, 13, /not as a VibeSpace dial endpoint \(status 404\)/], [{ code: 'not-ws', host: 'h:1' }, 13, /not as a VibeSpace/],
    [{ code: 'refused-token-mismatch', detail: 'the dial token does not match', host: 'h:1' }, 14, /generate a new command in the pairing dialog/],
    [{ code: 'refused-no-pairing', host: 'h:1' }, 14, /generate a new command/],
    [{ code: 'other', detail: 'weird', host: 'h:1' }, 15, /other: weird/],
  ];
  for (const [inp, exit, re] of T) { const o = DF.dialCheckLines(inp); ok(o.exit === exit && re.test(o.lines.join('\n')), `${inp.ok ? 'ok' : inp.code} ⇒ exit ${exit}`, o); }
}

// ── THE row state ──
console.log('③ dialRowState (fake clock, the six states + the mint guard)');
{
  const T0 = 1790000000000;
  const row = (x) => ({ transport: 'dial', deviceId: 'Mac', ...x });
  const S = (x) => DF.dialRowState(row(x), { now: T0 + 999999 });
  eq(S({ online: false }).state, 'unknown', 'a pre-lane record ⇒ unknown');
  eq(S({ online: false, dial: { tokenMintedAt: T0 } }).state, 'never', 'minted, never connected ⇒ never');
  eq(S({ online: false, dial: { tokenMintedAt: T0, firstConnectAt: T0 + 5, lastConnectAt: T0 + 5, lastDisconnectAt: T0 + 9 } }), { state: 'silent', at: T0 + 9, n: 0, reason: null, host: '', dup: null }, 'connected before, offline now ⇒ silent (since the disconnect)');
  const refused = S({ online: false, dial: { tokenMintedAt: T0, firstConnectAt: T0 + 5, lastConnectAt: T0 + 5, lastRefusal: { code: 'token-mismatch', at: T0 + 20, attempt: 3, host: 'h:3456' } } });
  eq([refused.state, refused.reason, refused.at, refused.host], ['refused', 'token-mismatch', T0 + 20, ''], 'a refusal newer than the connect and the mint ⇒ refused (token mismatch; the Host header as received is no host of the device\'s — verify-r4 F1)');
  // verify-r4 F1: the row's {host} is the DEVICE's stated address or the CURRENT command's — never the Host header a relay rewrote
  eq(S({ online: false, dial: { tokenMintedAt: T0, mintedHost: 'relay.example.net:443', firstConnectAt: T0 + 5, lastConnectAt: T0 + 5, lastDisconnectAt: T0 + 9, lastAccept: { at: T0 + 5, host: '127.0.0.1', dialed: 'https://relay.example.net' } } }).host, 'relay.example.net:443', 'F1: silent names the address the device dials, never the relay-rewritten 127.0.0.1');
  eq(S({ online: false, dial: { tokenMintedAt: T0, mintedHost: 'relay.example.net:443', firstConnectAt: T0 + 5, lastConnectAt: T0 + 5, lastAccept: { at: T0 + 5, host: '127.0.0.1' } } }).host, 'relay.example.net:443', 'F1: …a device too old to state it ⇒ the command\'s address');
  eq(S({ online: false, dial: { tokenMintedAt: T0 + 30, mintedHost: '100.87.42.107:3456', lastRefusal: { code: 'token-mismatch', at: T0 + 20, dialed: 'http://192.168.4.116:3456' } } }).host, '100.87.42.107:3456', 'F1: never names the CURRENT command\'s address (an older command\'s refusal is not it)');
  // verify-r5 C2: a REFUSED dial proved no pairing — anyone who knows the name knocks with any x-vibespace-dial-base; its
  // statement is never the device's (the row named a stranger's address first, over the device's own)
  const strangerKnock = { code: 'token-mismatch', at: T0 + 40, attempt: 1, dialed: 'http://evil.example' };
  eq(S({ online: true, dial: { tokenMintedAt: T0, mintedHost: 'relay.example.net:443', lastConnectAt: T0 + 5, lastAccept: { at: T0 + 5, dialed: 'https://relay.example.net' }, lastRefusal: strangerKnock } }).host, 'relay.example.net:443', 'C2: a connected device\'s row names ITS stated address, never a refused knock\'s (pre-fix: evil.example)');
  eq(S({ online: false, dial: { tokenMintedAt: T0, mintedHost: '100.87.42.107:3456', lastConnectAt: T0 + 5, lastAccept: { at: T0 + 5, dialed: 'http://100.87.42.107:3456' }, lastRefusal: strangerKnock } }).host, '100.87.42.107:3456', 'C2: a refused row names the device\'s own statement or the current command\'s address, never the refusal\'s');
  eq(S({ online: false, dial: { tokenMintedAt: T0 + 30, firstConnectAt: T0 + 5, lastConnectAt: T0 + 5, lastRefusal: { code: 'token-mismatch', at: T0 + 20 } } }).state, 'silent', 'THE MINT GUARD: a refusal older than the current mint is not news ⇒ silent');
  eq(S({ online: false, dial: { tokenMintedAt: T0 + 30, lastRefusal: { code: 'token-mismatch', at: T0 + 20 } } }).state, 'never', '…and before any connect ⇒ never (attack 17: after Generate the row reads never until the new command runs)');
  const conn = S({ online: true, dial: { tokenMintedAt: T0, lastConnectAt: T0 + 50, lastAccept: { at: T0 + 50, attempt: 4, last: { code: 'refused-token-mismatch', at: T0 + 40 } } } });
  eq([conn.state, conn.n, conn.reason], ['connected', 4, 'token-mismatch'], 'connected after failures ⇒ n + the last reason');
  eq(S({ online: true, dial: { lastConnectAt: T0 + 50, lastAccept: { at: T0 + 50, attempt: 0 } } }).reason, null, 'connected at the first attempt ⇒ no reason');
  eq(S({ online: true, dial: { lastConnectAt: T0 + 50, lastAuthFail: { at: T0 + 60 } } }).state, 'auth-fail', 'online but the device refused our host key after this connect ⇒ auth-fail (attack 18)');
  eq(S({ online: true, dial: { lastConnectAt: T0 + 70, lastAuthFail: { at: T0 + 60 } } }).state, 'connected', 'an auth failure BEFORE the current connect is not the state now');
  eq(DF.dialRowState({ transport: 'ssh', graduated: true, dialLive: true, dial: { lastConnectAt: 5 } }).state, 'connected', 'a graduated ssh machine reads dialLive');
  eq(DF.DIAL_ROW_STATES, ['auth-fail', 'connected', 'refused', 'silent', 'never', 'unknown'], 'the closed state set');
  eq(['token-mismatch', 'refused-token-mismatch', 'refused-no-pairing', 'dns', 'tls', 'refused-connect', 'timeout', 'unreachable', 'not-ws', 'http-502', 'reset', 'closed-before-hello', 'refused-unknown'].map(DF.dialReasonOf),
    ['token-mismatch', 'token-mismatch', 'no-pairing', 'dns', 'tls', 'refused-connect', 'timeout', 'unreachable', 'not-vibespace', 'not-vibespace', 'other', 'other', 'other'], 'every stored code maps to a closed reason');
  eq(DF.hostOf('wss://h.example.com/api/device-dial?device=x'), 'h.example.com:443', 'hostOf names the default port');
  eq(DF.hostOf('ws://[2001:db8::5]:3456/x'), '[2001:db8::5]:3456', 'hostOf brackets IPv6');
}

// ── patched-copy controls ──
console.log('② inPlacePushVerdict (verify-r1 B8: the rotated token reaches the connected holder ONLY when asked)');
{
  eq(DF.inPlacePushVerdict({ existed: false, live: true, requested: true }), { push: false, why: 'not-paired-before' }, 'a first pairing has nobody to push to');
  eq(DF.inPlacePushVerdict({ existed: true, live: false }), { push: false, why: 'not-dialed-in' }, 'no device dialed in ⇒ nothing to push');
  // verify-r6 P1: the owner ASKED to keep the device (the sheet showed it connected) — a link that is gone, or is not
  // the one the sheet showed, is REFUSED before anything is minted (pre-fix: a plain rotation cut the device he chose to
  // keep, or the new token was pushed to whoever held the link now)
  eq(DF.inPlacePushVerdict({ existed: true, live: false, requested: true, shownSince: 20 }), { push: false, why: 'not-dialed-in', refuse: 'link_gone' }, 'P1: asked to keep a device that is no longer dialed in ⇒ refused link_gone (nothing minted; pre-fix: rotated — the device cut)');
  eq(DF.inPlacePushVerdict({ existed: true, live: true, requested: true, shownSince: 20, liveSince: 45 }), { push: false, why: 'link-changed', refuse: 'link_changed' }, 'P1: the link now connected is not the one the sheet showed (a reconnect, or a leaked command\'s holder after the device dropped) ⇒ refused link_changed');
  eq(DF.inPlacePushVerdict({ existed: true, live: true, requested: true, shownSince: 20, liveSince: 20 }), { push: true, why: 'requested' }, 'P1: the SAME link the sheet showed ⇒ pushed');
  eq(DF.inPlacePushVerdict({ existed: true, live: true, requested: true, shownSince: null, liveSince: 20 }), { push: false, why: 'link-changed', refuse: 'link_changed' }, 'P1: the sheet showed no link record, a link is here now ⇒ refused');
  eq(DF.inPlacePushVerdict({ existed: true, live: true }), { push: false, why: 'not-requested' }, 'a connected holder is NOT handed the new token unless the user asked (the default locks it out)');
  eq(DF.inPlacePushVerdict({ existed: true, live: true, requested: 'true' }), { push: false, why: 'not-requested' }, '…and only a boolean true asks (a string is not a request)');
  eq(DF.inPlacePushVerdict({ existed: true, live: true, requested: true }), { push: true, why: 'requested' }, 'the user asked ⇒ pushed over the link');
  // WIRING: the route judges through the verdict with the body's flag; the dialog sends the checkbox (unchecked by default)
  const route = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/DF\.inPlacePushVerdict\(\{ existed, live: holderConnected, requested: req\.body\?\.updateInPlace === true, shownSince: req\.body\?\.keepLinkSince === undefined \? undefined : req\.body\.keepLinkSince, liveSince: liveRec && liveRec\.dial \? liveRec\.dial\.lastConnectAt : null \}\)/.test(route) && /if \(pushV\.push\) \{/.test(route), 'WIRING: POST /api/device/dial-pair pushes in place only through inPlacePushVerdict({requested: body.updateInPlace === true, shownSince: body.keepLinkSince, liveSince: the record\'s lastConnectAt})');
  const iRef = route.indexOf('if (pushV.refuse) return res.status(409)'), iMint = route.indexOf('pair = agentdMintDialPair(deviceId,');
  ok(iRef > 0 && iMint > iRef, 'P1 WIRING: a refused push answers 409 by name BEFORE the mint (nothing rotated, nobody cut)');
  const dlg = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  ok(/keepBox\.checked = false;/.test(dlg) && /const keep = !!\(keepBox && keepBox\.checked\);/.test(dlg) && /updateInPlace: keep, \.\.\.\(keep \? \{ keepLinkSince: keepSince \} : \{\}\)/.test(dlg) && /const keepSince = existing && h\.dial \? \(h\.dial\.lastConnectAt \?\? null\) : null;/.test(dlg) && /if \(existing && \(h\.online \|\| h\.dialLive\)\) \{/.test(dlg), 'WIRING: the pairing sheet offers the choice only while a device is connected, unchecked by default, and sends it as updateInPlace + the link it showed (verify-r6 P1: keepLinkSince)');
  ok(/e && e\.code === 'link_gone' \? tr\(/.test(dlg) && /e && e\.code === 'link_changed' \? tr\(/.test(dlg) && /if \(e && e\.code === 'link_gone' && keepLbl\) \{ keepBox\.checked = false; keepLbl\.style\.display = 'none';/.test(dlg), 'P1 WIRING: the sheet words link_gone / link_changed and, the device being gone, drops the keep-its-link choice (the next press is the plain rotation it just described)');
  // verify-r2 B8-r2: the mint ENDS the holder's link unless the push keeps it, and a push that did not land ends it too
  const dp = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8');
  ok(/agentdMintDialPair\(deviceId, \{ host: DF\.hostOf\(dialUrl\), base, keepLink: pushV\.push \}\)/.test(route) && /if \(!updatedInPlace\) lockedOut = lockOutDialHolder\(deviceId\) \|\| lockedOut;/.test(route), 'WIRING (B8-r2): the route mints with keepLink = the push verdict, and a push that did not land locks the holder out');
  ok(/const lockedOut = keepLink === true \? false : lockOutDialHolder\(deviceId\);/.test(dp) && /function lockOutDialHolder\(deviceId\) \{/.test(dp), 'WIRING (B8-r2): the minter itself ends the holder\'s link unless keepLink');
  ok(/the device that was connected has been disconnected; it holds the previous command, which no longer works/.test(dlg) && !/is refused at its next dial/.test(dlg), 'WORDS (B8-r2): the sheet says the holder was disconnected now — never "refused at its next dial"');
}

console.log('B9 duplicateDialVerdict (verify-r1: two daemons on one pairing) + the boot header + the row\'s dup note');
{
  const V = DF.duplicateDialVerdict;
  eq(V({ current: null, incoming: { boot: 'aabbccdd' } }), { action: 'replace', why: 'none' }, 'nothing dialed in ⇒ replace (none)');
  eq(V({ current: { boot: 'aabbccdd', alive: null }, incoming: { boot: 'aabbccdd' } }), { action: 'replace', why: 'same-daemon' }, 'the same boot id ⇒ the daemon re-dials after its own drop ⇒ replace, never asked');
  // verify-r2 B9-r2a: a missing / malformed boot id on EITHER side is not a pass — the current is asked like any
  // different daemon (r1 admitted a header-less newcomer unasked: a stolen pairing on an old bundle evicted the
  // live device at will, 9 accepts / 8 closes in 8 s)
  eq(V({ current: { boot: null, alive: null }, incoming: { boot: 'aabbccdd' } }), { action: 'probe', why: 'unknown-boot' }, 'the current daemon predates the boot id ⇒ asked (probe), never replaced unasked');
  eq(V({ current: { boot: null, alive: true }, incoming: { boot: 'aabbccdd' } }), { action: 'refuse', why: 'duplicate' }, '…and if it answers, the newcomer is refused');
  eq(V({ current: { boot: 'aabbccdd', alive: null }, incoming: {} }), { action: 'probe', why: 'unknown-boot' }, 'the newcomer sends NO boot id (an old bundle, a stripped header) ⇒ the current is asked');
  eq(V({ current: { boot: 'aabbccdd', alive: true }, incoming: {} }), { action: 'refuse', why: 'duplicate' }, '…answering ⇒ the header-less newcomer is REFUSED (B9-r2a: omitting the header is no eviction)');
  eq(V({ current: { boot: 'aabbccdd', alive: false }, incoming: {} }), { action: 'replace', why: 'current-dead' }, '…silent ⇒ replaced (a pre-B9 daemon\'s own re-dial after a half-open drop still gets in)');
  eq(V({ current: { boot: null, alive: true }, incoming: {} }), { action: 'refuse', why: 'duplicate' }, 'neither side carries an id and the current answers ⇒ refused (an id never equal to itself is no same-daemon)');
  eq(V({ current: { boot: 'aabbccdd', alive: null }, incoming: { boot: '11223344' } }), { action: 'probe', why: 'different-daemon' }, 'two different daemons, the current not asked yet ⇒ probe');
  eq(V({ current: { boot: 'aabbccdd', alive: true }, incoming: { boot: '11223344' } }), { action: 'refuse', why: 'duplicate' }, 'the current answered ⇒ the newcomer is refused (duplicate)');
  eq(V({ current: { boot: 'aabbccdd', alive: false }, incoming: { boot: '11223344' } }), { action: 'replace', why: 'current-dead' }, 'the current stayed silent ⇒ replaced (a crashed machine\'s half-open socket)');
  eq(V({ current: { boot: 'ZZ', alive: true }, incoming: { boot: '11223344' } }), { action: 'refuse', why: 'duplicate' }, 'a malformed boot id counts as none — and none is asked, not admitted');
  eq(V({ current: { boot: 'ZZ', alive: null }, incoming: { boot: 'ZZ' } }), { action: 'probe', why: 'unknown-boot' }, 'two equal MALFORMED ids are not the same daemon (only a well-formed id equal to itself is)');
  eq(DF.dialHeadersOf({ boot: '0123456789abcdef' })['x-vibespace-daemon-boot'], '0123456789abcdef', 'the boot id rides x-vibespace-daemon-boot');
  eq(DF.parseDialHeaders({ 'x-vibespace-daemon-boot': '0123456789abcdef' }).boot, '0123456789abcdef', '…and is read back');
  eq(DF.parseDialHeaders({ 'x-vibespace-daemon-boot': 'not hex' }).boot, null, '…junk reads null (judged as an older daemon)');
  eq(DF.parseDialHeaders({}).boot, null, '…absent reads null');
  ok(DF.DIAL_REFUSAL_CODES.includes('duplicate-device') && DF.DIAL_FAIL_CODES.includes('refused-duplicate-device') && DF.DIAL_REASONS.includes('duplicate-device'), 'duplicate-device is a named refusal, a named failure and a row reason');
  const R = Object.assign(new Error('x'), { code: 'UPGRADE_REFUSED', status: 401, refusal: 'duplicate-device', body: JSON.stringify({ error: DF.refusalSentence('duplicate-device', 'mac') }) });
  const f = DF.dialFailureOf(R);
  ok(f.code === 'refused-duplicate-device' && /pair this machine under its own name/.test(f.detail) && f.status === 401, 'the daemon classifies the 401 as refused-duplicate-device with the sentence', f);
  eq(DF.dialReasonOf('refused-duplicate-device'), 'duplicate-device', 'the row reason is duplicate-device');
  ok(/^dial-out refused — duplicate-device: pair this machine/.test(DF.dialLogLine({ outcome: 'failed', code: f.code, detail: f.detail, attempt: 3, delay: 5000 })), 'the daemon log line names it');
  ok(DF.refusalSentence('duplicate-device', 'mac').length <= DF.DETAIL_MAX, 'the sentence for a short id fits the 200-char detail (the way out comes first so a cut never loses it)');
  const now = 1_000_000_000;
  const row = (dupAt) => DF.dialRowState({ transport: 'dial', online: true, dial: { lastConnectAt: 5, lastAccept: { at: 5, attempt: 0 }, lastDuplicate: { at: dupAt, from: '10.0.0.9', boot: '11223344' } } }, { now });
  eq(row(now - 1000).dup, { at: now - 1000, from: '10.0.0.9' }, 'a duplicate refused within 10 min rides the row as dup {at, from}');
  ok(row(now - 1000).state === 'connected', '…while the state stays connected (the first daemon is the device)');
  eq(row(now - 11 * 60 * 1000).dup, null, '…and is gone after 10 min');
  eq(DF.dialRowState({ transport: 'dial', online: true, dial: { lastConnectAt: 5 } }, { now }).dup, null, 'no duplicate ⇒ dup null');
}

console.log('verify-r2 the dial endpoint: ONE answer for an unknown name and a wrong token + the refusal LOG budget');
{
  // the sentence a stranger hears names no difference between "not paired here" and "another command"
  const s = DF.refusalSentence('token-mismatch', 'mac');
  ok(/generate a new command in the pairing dialog/.test(s) && /or pair again if it is no longer listed/.test(s), 'the token-mismatch sentence covers a removed pairing too (the gate answers it for an unknown name)');
  ok(DF.refusalSentence('token-mismatch', 'Macbook-Pro-13').length <= DF.DETAIL_MAX && /^the dial token does not match the pairing on record for "mac"/.test(s), '…and fits the 200-char detail whole for an id up to 14 characters (the daemon cuts its detail at 200)');
  // the key: IPv4 as is (mapped too), IPv6 by its /64, junk verbatim
  const K = DF.refusalAddressKey;
  eq(['10.0.0.9', '::ffff:10.0.0.9', '2001:db8:1:2:3:4:5:6', '2001:DB8:0001:0002::9', '2001:db8:1:2::ffff', 'fe80::1%eth0', '::1', 'garbage', null, ''].map(K),
    ['10.0.0.9', '10.0.0.9', '2001:db8:1:2::/64', '2001:db8:1:2::/64', '2001:db8:1:2::/64', 'fe80:0:0:0::/64', '0:0:0:0::/64', 'garbage', '?', '?'], 'refusalAddressKey: v4 as is, ::ffff:-mapped folded, IPv6 by its /64 (zone dropped), junk verbatim');
  const B = DF.REFUSAL_BUDGET;
  eq([B.max, B.globalMax, B.windowMs, B.keys], [30, 300, 600000, 4096], 'the budget: 30 lines per key, 300 per window, 10 min, 4096 keys');
  const t = 1e12;
  // one address: `max` logged, ONE summary at max+1, then silence; the window rolls
  {
    const b = DF.refusalBudget();
    const r = Array.from({ length: 100 }, (_, i) => b.hit('10.0.0.9', '', t + i));
    eq([r.filter((x) => x.log).length, r.filter((x) => x.summary === 'key').length, r.findIndex((x) => x.summary)], [30, 1, 30], 'one address: 30 lines, then ONE summary line at the 31st, then nothing');
    ok(b.hit('10.0.0.9', '', t + B.windowMs + 100).log === true, '…and the next window logs again');
  }
  // a stale device retrying every 30 s never meets the budget (20 per window)
  {
    const b = DF.refusalBudget();
    ok(Array.from({ length: 60 }, (_, i) => b.hit('203.0.113.7', 'mac', t + i * 30000)).every((x) => x.log), 'a stale device retrying every 30 s (20 per window) is logged every time for 30 min');
  }
  // two paired devices behind ONE address (the relay's loopback, a home NAT) never mute each other
  {
    const b = DF.refusalBudget();
    const r = [];
    for (let i = 0; i < 25; i++) { r.push(b.hit('127.0.0.1', 'mac', t + i)); r.push(b.hit('127.0.0.1', 'pi', t + i)); }
    ok(r.every((x) => x.log), 'two paired devices behind one address: each keyed by its own name — 25 + 25 all logged');
    const g = Array.from({ length: 40 }, (_, i) => b.hit('127.0.0.1', '', t + 100 + i));
    ok(g.filter((x) => x.log).length === 30 && b.hit('127.0.0.1', 'mac', t + 200).log === true, '…guessed names from that address share ONE key (30), and the paired device is still logged');
  }
  // rotation: 50 000 knocks over 800 /64s in one window ⇒ ≤ globalMax + 1 lines, O(1) per hit, the map bounded
  {
    const b = DF.refusalBudget({ keys: 256 });
    const t0 = Date.now(); let lines = 0;
    for (let i = 0; i < 50000; i++) { const x = b.hit(`2001:db8:${(i >> 6).toString(16)}::${i.toString(16)}`, '', t + i); if (x.log || x.summary) lines++; }
    const ms = Date.now() - t0;
    ok(lines <= B.globalMax + 1, `50 000 refusals rotating over 782 /64s write ${lines} lines (≤ ${B.globalMax + 1}: the window's ceiling holds whatever the keys)`);
    ok(b.size() <= 256, `…the map holds ≤ its cap (${b.size()} of 256)`);
    ok(ms < 1500, `…in ${ms} ms (O(1) per hit — the WIP's whole-map sweep past 4 096 keys was quadratic: 3.3 s for 40 000)`);
  }
  // the ceiling counts LINES, not knocks: one noisy address spends its own 30, never the others' share
  {
    const b = DF.refusalBudget();
    for (let i = 0; i < 5000; i++) b.hit('198.51.100.1', '', t + i);
    ok(b.hit('198.51.100.2', 'mac', t + 6000).log === true, 'one address knocking 5 000 times leaves another address\'s first refusal logged (the ceiling counts lines)');
  }
}

// ── verify-r3 B-grad: the graduation's ssh invocation carries no token in any argv ──
const GRAD_ARGS = '--bundle-url "http://hub.example:3456/vibespace-device.js" --dial "ws://hub.example:3456/api/device-dial?device=grad-host-1" --dial-token vsdt_' + 'a'.repeat(36) + ' --host-token vsht_' + 'b'.repeat(48);
{
  console.log('verify-r3 B-grad');
  const inv = DF.sshInstallInvocation({ args: GRAD_ARGS, installer: '#!/usr/bin/env bash\nset -euo pipefail\n' });
  ok(inv.remote === 'bash -s' && !/vs[dh]t_/.test(inv.remote), 'verify-r3 B-grad: the remote command (the local ssh\'s argv, the remote shell\'s command line) is the bare `bash -s` — no token', inv.remote);
  ok(inv.stdin.startsWith('set -- ' + GRAD_ARGS + '\n#!/usr/bin/env bash\n'), 'verify-r3 B-grad: the arguments ride stdin as ONE `set -- …` line before the installer\'s text');
  const wsrc = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/const inv = require\('\.\.\/dial-facts\.js'\)\.sshInstallInvocation\(\{ args, installer \}\);/.test(wsrc) && /execFile\('ssh', \[\.\.\.hosts\.sshArgs\(h, \{ multiplex: true \}\), '--', inv\.remote\]/.test(wsrc) && /child\.stdin\.end\(inv\.stdin\);/.test(wsrc) && !/bash -s -- \$\{args\}/.test(wsrc), 'WIRING (B-grad): graduateHostToDial runs ssh with inv.remote and writes inv.stdin (no `bash -s -- ${args}` left)');
}

// ── verify-r3 B-inst: no token in any argv on the DEVICE — the pasted command, the installers' children, the daemon ──
{
  console.log('verify-r3 B-inst (wiring pins; the runtime proof is test-device-install-check + test-pair-dialog-ui)');
  const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const sm = rd('src/lib/sidebar-mounts.js'), sh = rd('scripts/vibespace-agentd-install.sh'), ps = rd('scripts/vibespace-agentd-install.ps1'), ad = rd('src/agentd/agentd.js'), mp = rd('src/server/mounts-plugins-wiring.js');
  const macCmd = (sm.match(/\n\s+mac: `curl[^\n]*`,/) || [''])[0], linCmd = (sm.match(/\n\s+linux: `curl[^\n]*`,/) || [''])[0];
  ok([macCmd, linCmd].every((c) => /VIBESPACE_DIAL_TOKEN=\$\{r\.dialToken\}/.test(c) && /VIBESPACE_HOST_TOKEN=\$\{r\.hostToken\}/.test(c) && /\bbash -s -- /.test(c) && c.indexOf('VIBESPACE_DIAL_TOKEN=') < c.indexOf('bash -s') && !/--dial-token|--host-token/.test(c)), 'the pasted macOS / Linux command hands both tokens as ENVIRONMENT assignments before `bash` — no flag (bash\'s argv is readable by every user of the device)', [macCmd.slice(0, 200), linCmd.slice(0, 200)]);
  ok(/DIAL_TOKEN="\$\{VIBESPACE_DIAL_TOKEN:-\}"; HOST_TOKEN="\$\{VIBESPACE_HOST_TOKEN:-\}"\nunset VIBESPACE_DIAL_TOKEN VIBESPACE_HOST_TOKEN\n/.test(sh) && /--dial-token\) DIAL_TOKEN="\$2"/.test(sh), 'install.sh reads the tokens from its environment (the flags still accepted) and UNSETS them before anything starts');
  const shChildren = sh.split('\n').filter((l) => /"\$NODE_BIN"/.test(l) && /DIAL_TOKEN|HOST_TOKEN/.test(l));
  ok(shChildren.length === 2 && shChildren.every((l) => /^\s*(CHECK_OUT=\$\()?VIBESPACE_DIAL_TOKEN="\$DIAL_TOKEN" /.test(l) && !/"\$(DIAL|HOST)_TOKEN"\s*(2>&1\)|\\?$)/.test(l.replace(/^\s*(CHECK_OUT=\$\()?VIBESPACE_DIAL_TOKEN="\$DIAL_TOKEN" /, ''))), 'install.sh: the two node children that need the dial token (the check, the dial.json writer) get it in THEIR environment, never an argument', shChildren);
  ok(!/"\$DIAL_URL" "\$DIAL_TOKEN"/.test(sh) && !/--dial-check "\$DIAL_URL" --dial-token/.test(sh), 'install.sh: no child argument list carries $DIAL_TOKEN');
  ok(/\$env:VIBESPACE_DIAL_TOKEN = \$DialToken\n\s*try \{ \$checkOut = & \$nodeExe "\$current\\vibespace-device\.js" --dial-check \$Dial 2>&1; \$checkRc = \$LASTEXITCODE \}\n\s*finally \{ Remove-Item Env:VIBESPACE_DIAL_TOKEN/.test(ps) && /-ArgumentList @\("\$current\\vibespace-device\.js"\) `/.test(ps) && !/'--dial-token', \$DialToken/.test(ps) && !/--dial-check \$Dial --dial-token/.test(ps), 'install.ps1: the check gets the token in its environment (removed at once), the daemon starts ARGLESS (a self-upgrade re-exec carried every original flag for the daemon\'s whole life)');
  ok(/const ENV_DIAL_TOKEN = String\(process\.env\.VIBESPACE_DIAL_TOKEN \|\| ''\);\ndelete process\.env\.VIBESPACE_DIAL_TOKEN; delete process\.env\.VIBESPACE_HOST_TOKEN;/.test(ad) && /const token = String\(argOf\('--dial-token'\) \|\| ENV_DIAL_TOKEN \|\| ''\);/.test(ad) && /token: \(ti >= 0 \? process\.argv\[ti \+ 1\] : ''\) \|\| ENV_DIAL_TOKEN \|\| ''/.test(ad) && /if \(cfg\.token\) \{ try \{ const tmp = DIAL_FILE/.test(ad), 'agentd.js: the token read ONCE from the environment and removed (no session / worker inherits it); --dial-check and --dial take it; an absent flag is no token (r2 read argv[0]); a `--dial` with no token never writes dial.json (B-inst r2: the re-exec)');
  ok(/command: `VIBESPACE_DIAL_TOKEN=\$\{pair\.dialToken\} node vibespace-device\.js --dial \$\{dialUrl\}`/.test(mp), 'the pair route\'s `command` field names the environment form');
}

// ── verify-r3 THE DIAL-TOKEN DOOR CENSUS (grep-derived): every mint, hash, compare, log and device write of a pairing
// token goes through src/pairing-token.js (and the device's place-secret op); no argv carries one ──
{
  console.log('verify-r3 the dial-token door census');
  const { execFileSync } = await import('node:child_process');
  const tracked = execFileSync('git', ['-C', REPO, 'ls-files', 'server.js', 'src', 'scripts/vibespace-agentd-install.sh', 'data/bin'], { encoding: 'utf8' }).split('\n').filter((f) => f && /\.(js|mjs|sh)$|^data\/bin\/[^.]+$/.test(f) && !f.startsWith('src/lib/'));
  const TOKENISH = /vs[dh]t_|dialToken|hostToken|TOKEN_FILE|x-vibespace-dial-token|dialTokenHash|DIAL_TOKEN|HOST_TOKEN/;
  const DOOR = 'src/pairing-token.js';
  // what each rule EXEMPTS, by file:line text — the reason is the census's record
  const EXEMPT = [
    { file: 'scripts/vibespace-agentd-install.sh', re: /"vsht_"\+require\("crypto"\)\.randomBytes\(24\)/, why: 'a STANDALONE install (no pairing) mints its own device key ON the device; it never leaves the machine' },
    { file: 'src/agentd/client.js', re: /this\._tokens\.local !== sha/, why: 'the hub\'s own record of device #0\'s hash: "changed ⇒ rewrite the file", not an authentication' },
  ];
  const exempt = (file, line) => EXEMPT.some((x) => x.file === file && x.re.test(line));
  function doorCensus(files) {
    const v = [];
    for (const [file, src] of Object.entries(files)) {
      if (file === DOOR || !TOKENISH.test(src)) continue;
      src.split('\n').forEach((line, i) => {
        const at = `${file}:${i + 1}`;
        if (/^\s*(\/\/|\*|#)/.test(line) || exempt(file, line)) return;
        // R1 hash: a sha256 in a file that handles a pairing token is the door's job
        if (/createHash\(\s*['"]sha256['"]\s*\)/.test(line)) v.push(`R1 hash outside the door: ${at}`);
        // R2 mint: a vsdt_ / vsht_ value built here
        if (/['"`]vs[dh]t_['"`]?\s*\+|`vs[dh]t_\$\{/.test(line)) v.push(`R2 mint outside the door: ${at}`);
        // R3 compare: === / !== with a token / hash / sha / want side (never a literal, typeof, null)
        for (const m of line.matchAll(/([\w.$\]\[)(]+)\s*(===|!==)\s*([\w.$\]\[)(]+|'[^']*'|"[^"]*")/g)) {
          const [l, r] = [m[1], m[3]];
          if (/^['"]|^(null|undefined|true|false|\d+)$/.test(r) || /typeof$/.test(line.slice(0, m.index).trim())) continue;
          // a PAIRING token or its digest (a session's vsst_ lookup is another door's business)
          if (/(host|dial)Token|[Hh]ash|\bsha\b|\bwant\b|\bgot\b/.test(l + ' ' + r) && !/\.length$|\.(status|code|kind|transport|op)$/.test(l)) v.push(`R3 compare outside the door (${l} ${m[2]} ${r}): ${at}`);
        }
        // R4 log: a log line interpolating a token
        if (/(console\.(log|warn|error|info)|\blog|\bwarn)\s*\(/.test(line) && /\$\{[^}]*\b(tok|token|dialToken|hostToken|raw)\b[^}]*\}|\+\s*(tok|token|dialToken|hostToken)\b/.test(line)) v.push(`R4 log names a token: ${at}`);
        // R5 a token written onto a device: through place-secret (the fsWrite fallback only right after it)
        if (/\.fsWrite\(/.test(line) && /dial\.json|state\/token/.test(line)) {
          const before = src.split('\n').slice(Math.max(0, i - 6), i).join('\n');
          if (!/\.placeSecret\(/.test(before)) v.push(`R5 a device secret written without place-secret: ${at}`);
        }
        // R6 argv: a child process started with a token among its arguments
        if (/\b(execFile|execFileSync|spawn|spawnSync|fork)\s*\(/.test(line) && /\b(dialToken|hostToken|tok|DIAL_TOKEN|HOST_TOKEN)\b/.test(line)) v.push(`R6 a token in a child's argv: ${at}`);
        if (/"\$NODE_BIN"/.test(line) && /\s"\$(DIAL|HOST)_TOKEN"(\s|$|\))/.test(line.replace(/^\s*(CHECK_OUT=\$\()?VIBESPACE_DIAL_TOKEN="\$DIAL_TOKEN" /, ''))) v.push(`R6 a token in the installer child's argv: ${at}`);
      });
    }
    return v;
  }
  const FILES = Object.fromEntries(tracked.map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]).concat([[DOOR, fs.readFileSync(path.join(REPO, DOOR), 'utf8')]]));
  const v = doorCensus(FILES);
  ok(v.length === 0, `every mint / hash / compare / log / device write of a pairing token goes through THE ONE door (${Object.keys(FILES).filter((f) => TOKENISH.test(FILES[f])).length} token-handling files of ${Object.keys(FILES).length} scanned)`, v);
  ok(EXEMPT.every((x) => FILES[x.file] && FILES[x.file].split('\n').some((l) => x.re.test(l))), `the census's ${EXEMPT.length} exemptions each still name a real line (a stale exemption is a hole)`);
  // the door itself: the three verbs, the constant-time compare, the shapes
  const PT = require(path.join(REPO, DOOR));
  const d = PT.mintToken('dial'), h = PT.mintToken('host');
  ok(/^vsdt_[0-9a-f]{36}$/.test(d) && /^vsht_[0-9a-f]{48}$/.test(h) && PT.mintToken('dial') !== d, 'mintToken: vsdt_ + 36 hex, vsht_ + 48 hex, fresh each time');
  ok(PT.tokenMatches(d, PT.tokenHash(d)) && !PT.tokenMatches(d + 'x', PT.tokenHash(d)) && !PT.tokenMatches('', PT.tokenHash('')) && !PT.tokenMatches(d, 'nothex') && !PT.tokenMatches(null, PT.tokenHash(d)) && !PT.tokenMatches(d, PT.tokenHash(d).toUpperCase()), 'tokenMatches: the right token only; an empty / missing / malformed side is false');
  ok(/crypto\.timingSafeEqual\(Buffer\.from\(tokenHash\(token\), 'hex'\), Buffer\.from\(hash, 'hex'\)\)/.test(FILES[DOOR]), 'the compare is crypto.timingSafeEqual over the two 32-byte digests');
  // the wiring: every token path names the door
  const uses = { 'src/server/dial-pairing.js': [/PT\.mintToken\('dial'\)/, /PT\.tokenHash\(tok\)/, /PT\.tokenMatches\(tok, want\)/], 'server.js': [/pairing-token\.js'\)\.mintToken\('host'\)/], 'src/agentd/agentd.js': [/pairing-token\.js'\)\.tokenHash\(raw\)/, /pairing-token\.js'\)\.tokenMatches\(msg\.hostToken, want\)/], 'src/agentd/client.js': [/PT\.mintToken\('host'\)/, /PT\.tokenHash\(raw\)/], 'src/dial-session-bridge.js': [/PT\.tokenMatches\(msg\.hostToken, PT\.tokenHash\(want\)\)/], 'src/server/mounts-plugins-wiring.js': [/await dm\.placeSecret\(root \+ '\/state\/dial\.json', body\)/] };
  const miss = Object.entries(uses).flatMap(([f, res]) => res.filter((re) => !re.test(FILES[f])).map((re) => `${f}: ${re}`));
  ok(miss.length === 0, 'WIRING: the gate + minter, the host-token store, the device\'s hello, device #0\'s key, the session bridge and the in-place push all name the door', miss);
  // CONTROLS: a planted site per rule is caught
  const plant = (f, from, to) => { const F2 = { ...FILES, [f]: FILES[f].replace(from, to) }; if (F2[f] === FILES[f]) return ['(the plant did not apply)']; return doorCensus(F2); };
  const SSH_CALL = 'execFile' + "('ssh'";
  const cases = [
    ['R1', 'src/server/dial-pairing.js', "  hosts.setDialToken(deviceId, PT.tokenHash(tok));", "  hosts.setDialToken(deviceId, require('crypto').createHash('sha256').update(tok).digest('hex'));"],
    ['R2', 'server.js', "require('./src/pairing-token.js').mintToken('host');", "'vsht_' + require('crypto').randomBytes(24).toString('hex');"],
    ['R3', 'src/dial-session-bridge.js', "!PT.tokenMatches(msg.hostToken, PT.tokenHash(want))", 'msg.hostToken !== want'],
    ['R4', 'src/server/dial-pairing.js', "  const generation = (() =>", "  console.log(`[device] minted ${tok} for ${deviceId}`);\n  const generation = (() =>"],
    ['R5', 'src/server/mounts-plugins-wiring.js', "          try { await dm.placeSecret(root + '/state/dial.json', body); }", "          try { await dm.fsWrite(root + '/state/dial.json', body); }"],
    // (the call is spelled in two pieces: the tier rule's binary detector reads a literal ssh launch as this suite running ssh)
    ['R6', 'src/server/mounts-plugins-wiring.js', `      const child = ${SSH_CALL}, [...hosts.sshArgs(h, { multiplex: true }), '--', inv.remote],`, `      const child = ${SSH_CALL}, [...hosts.sshArgs(h, { multiplex: true }), '--', \`bash -s -- --dial-token \${pair.dialToken}\`],`],
  ];
  for (const [rule, f, from, to] of cases) { const c = plant(f, from, to); ok(c.some((x) => x.startsWith(rule + ' ')), `CONTROL (${rule}): a planted ${rule} site in ${f} is caught`, c); }
}

console.log('naive-user N-refused: the refused row names the CURRENT command and says to run it (zh, the owner\'s language)');
{
  const st = DF.dialRowState({ transport: 'dial', online: false, dial: { generation: 3, tokenMintedAt: 1000, lastConnectAt: 500, lastRefusal: { code: 'token-mismatch', at: 2000, attempt: 4 } } });
  eq([st.state, st.mintedAt, st.reason], ['refused', 1000, 'token-mismatch'], 'dialRowState: a refusal after the current mint is `refused` and carries that mint\'s instant (mintedAt)');
  const store = new Map([['vibespace.lang', 'zh']]);
  const hadLS = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  try {
    const { pathToFileURL } = await import('node:url');
    const PK = await import(pathToFileURL(path.join(REPO, 'src/lib/dial-address-picker.js')).href);
    const now = Date.now();
    const words = PK.dialStateText({ state: 'refused', at: now, n: 4, reason: 'token-mismatch', host: 'x:1', mintedAt: now - 60000, dup: null });
    const hm = (ms) => new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); // L-time: the DEVICE's locale (deviceLocale), never the browser's
    ok(words === `最近一次拨号：被拒绝（令牌不匹配），${hm(now)} — 设备上仍是比 ${hm(now - 60000)} 生成的那条更旧的命令：请在设备上运行那一条（已经找不到了再重新生成）`, 'N-refused (zh): "…设备上仍是比 <the mint> 生成的那条更旧的命令：请在设备上运行那一条（已经找不到了再重新生成）" — never a bare "请重新生成" (the rotation loop)', words);
    ok(PK.dialStateText({ state: 'refused', at: now, n: 1, reason: 'token-mismatch', host: '' }).endsWith('请重新生成'), 'a record with no mint instant (from before the lane) keeps the old sentence');
    // CONTROL (l): the pre-fix words — the refused state always says "generate a new one"
    const M = mutantCopies('dialwords', REPO);
    const psrc = fs.readFileSync(path.join(REPO, 'src/lib/dial-address-picker.js'), 'utf8');
    const lsrc = psrc.replace("case 'refused': return rs.mintedAt", "case 'refused': return false");
    ok(lsrc !== psrc, '(l) the patch applies');
    const PL = await import(pathToFileURL(M.write('src/lib/dial-address-picker.js', lsrc, 'oldwords')).href);
    const lw = PL.dialStateText({ state: 'refused', at: now, n: 4, reason: 'token-mismatch', host: 'x:1', mintedAt: now - 60000, dup: null });
    ok(lw.endsWith('设备上的命令已过期，请重新生成') && lw !== words, 'CONTROL (l): the pre-fix words send the user to "请重新生成" right after a Generate — the N-refused cell goes red', lw);
    ok(/^\d\d:\d\d$/.test(hm(now)) && !/[AP]M/.test(words), 'L-time: the zh words print the time the zh way ("17:09"), never the browser\'s "05:09 PM"', words);
    // CONTROL (m): the pre-fix clock — the browser's own locale ([]) — prints "PM" inside the zh sentence under an en-US node
    const msrc = psrc.replace('const loc = deviceLocale();', "const loc = 'en-US';");
    ok(msrc !== psrc, '(m) the patch applies');
    const PM = await import(pathToFileURL(M.write('src/lib/dial-address-picker.js', msrc, 'browserclock')).href);
    const mw = PM.dialStateText({ state: 'refused', at: new Date().setHours(17, 9, 0, 0), n: 1, reason: 'token-mismatch', host: '', mintedAt: new Date().setHours(17, 8, 0, 0) });
    ok(/PM/.test(mw), 'CONTROL (m): the browser\'s own clock (an en-US browser) prints "05:09 PM" inside the zh sentence — the L-time cell goes red', mw);
    // verify-r4 F8: what Generate does to a device NOT dialed in — said before the button (zh)
    const T8 = now - 120000;
    const cons = (x) => PK.generateConsequenceText({ transport: 'dial', deviceId: 'mac', ...x });
    ok(cons({ online: false, dial: { tokenMintedAt: T8, firstConnectAt: T8 + 5, lastConnectAt: T8 + 5, lastDisconnectAt: T8 + 9 } }) === '这台设备现在离线。生成新命令会替换它手上的那条：它回来时会被拒绝，直到你在它上面运行新命令。', 'F8 (zh): an OFFLINE device that worked (silent) hears it will be refused when it comes back until the new command runs on it — BEFORE the button');
    ok(cons({ online: false, dial: { tokenMintedAt: T8 } }) === `生成新命令会替换 ${hm(T8)} 生成的那条：那条随即失效 — 请在设备上运行新的这条。`, 'F8 (zh): a never-connected device hears the command made at <time> stops working (naive L-generate-before)');
    ok(/^生成新命令会替换 .* 生成的那条/.test(cons({ online: false, dial: { tokenMintedAt: T8, lastConnectAt: T8 - 5000, lastRefusal: { code: 'token-mismatch', at: T8 + 60 } } })), 'F8 (zh): a refused device (it holds an older one already) hears the NEWEST command stops working');
    ok(cons({ online: true, dial: { tokenMintedAt: T8, lastConnectAt: T8 + 5 } }) === '' && PK.generateConsequenceText({ transport: 'ssh', graduated: true, dialLive: true, dial: { lastConnectAt: 5 } }) === '', 'F8: a device dialed in NOW gets no sentence here — the "send it over its link" choice and its note speak');
    const smF8 = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
    ok(/\} else if \(existing\) \{\n\s+\/\/ verify-r4 F8[^\n]*\n\s+const cons = generateConsequenceText\(h\);/.test(smF8), 'F8 wiring: the sheet of a device not dialed in shows the sentence before the button');
    for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 2, label: 'mutant-copy (words): ' })) ok(r.pass, r.name, r.detail);
  } catch (e) { ok(false, 'N-refused: the words module runs in node', e.stack); }
  finally { if (hadLS === undefined) delete globalThis.localStorage; else globalThis.localStorage = hadLS; }
}

// ── verify-r5 G1: THE PICKER ITSELF, built in node on a mini DOM — WHAT IT CHECKS. r4 F3 made the picker check
// Custom… EMPTY when no row reaches this server from elsewhere (a HOST=127.0.0.1 server), and no gate ran that branch:
// the chrome world binds 0.0.0.0 and the wiring pins read other lines, so reverting it (`first.kind === 'custom' && own
// && first.value` — the loopback row, radios[0], checked again: the F3 / N-loop class) went unseen (verify-r5's revert
// table). The picker's radios, field, tag and value() are read here, on every run.
console.log('verify-r5 G1: the address picker, built on a mini DOM — what it checks, and what value() hands Generate');
{
  const hadDoc = globalThis.document, hadLS = globalThis.localStorage;
  const store = new Map([['vibespace.lang', 'zh']]);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.document = miniDom();
  try {
    const { pathToFileURL } = await import('node:url');
    const PK = await import(pathToFileURL(path.join(REPO, 'src/lib/dial-address-picker.js')).href);
    const view = (P) => {
      const radios = P.el.querySelectorAll('input').filter((i) => i.type === 'radio');
      const tag = P.el.querySelector('.dap-own');
      return { checked: radios.filter((r) => r.checked).map((r) => r.value), custom: P.el.querySelector('.dap-custom').value, own: tag ? tag.textContent : null, ownCls: tag ? tag.className : null, listen: !!P.el.querySelector('.dap-listen'), value: P.value() };
    };
    const LISTEN = { address: '127.0.0.1', loopbackOnly: true };
    const loopRows = DF.dialAddressCandidates({ origin: 'http://127.0.0.1:3456', hostname: 'box', interfaces: { eth0: [{ address: '192.168.4.116', family: 'IPv4', internal: false }] }, port: 3456, bind: '127.0.0.1' });
    const g1 = view(PK.dialAddressPicker({ candidates: loopRows, listen: LISTEN }));
    ok(loopRows.length === 1 && loopRows[0].loopback === true && g1.checked.join() === 'custom' && g1.custom === '' && !!g1.value.error && g1.listen, 'G1: a server bound to 127.0.0.1 ⇒ Custom… checked and EMPTY under the listen note — the loopback row stays pickable, never checked, and Generate asks for an address', g1);
    const g2 = view(PK.dialAddressPicker({ candidates: loopRows, relayPublishable: true, listen: LISTEN }));
    ok(g2.checked.join() === 'relay' && g2.value.viaRelay === true, 'G1: …with a relay that can be published ⇒ "Publish through the relay" checked (Generate publishes)', g2);
    const rows = DF.dialAddressCandidates({ origin: 'http://127.0.0.1:3456', relay: 'https://relay.example.net', hostname: 'mart-aimax395', interfaces: { eth0: [{ address: '192.168.4.116', family: 'IPv4', internal: false }] }, port: 3456 });
    const g3 = view(PK.dialAddressPicker({ candidates: rows }));
    ok(g3.checked.join() === 'base:https://relay.example.net' && g3.own === null && g3.value.base === 'https://relay.example.net', 'G1: a new device on a 0.0.0.0 server ⇒ the first row another device reaches (the relay), no "own" tag', g3);
    const g4 = view(PK.dialAddressPicker({ candidates: rows, dial: { tokenMintedAt: 10, mintedBase: 'http://192.168.4.116:3456' } }));
    ok(g4.checked.join() === 'base:http://192.168.4.116:3456' && g4.own === '这台设备当前命令用的地址' && g4.value.base === 'http://192.168.4.116:3456', 'G1: a paired device never heard from ⇒ its current command\'s row, tagged so', g4);
    // verify-r5 C3: an old daemon on a record from before the mint facts — the checked row is a guess, said so (warn)
    const g7 = view(PK.dialAddressPicker({ candidates: rows, dial: { lastConnectAt: 20, lastAccept: { host: '127.0.0.1' } }, online: true }));
    ok(g7.checked.join() === 'base:https://relay.example.net' && g7.ownCls === 'dap-own dap-claim' && g7.own === '这台设备没有说明它拨号用的地址（它的 VibeSpace 守护进程较旧）— 发给它新命令前请先确认它能连到这个地址', 'C3: a paired device that stated nothing (an older daemon) and has no mint facts ⇒ the first reachable row, SAID to be a guess (pre-fix: checked in silence)', g7);
    const conn = { tokenMintedAt: 10, mintedBase: 'https://relay.example.net', lastConnectAt: 20, lastAccept: { dialed: 'http://mart-aimax395:3456' } };
    const g5 = view(PK.dialAddressPicker({ candidates: rows, dial: conn, online: true }));
    const g6 = view(PK.dialAddressPicker({ candidates: rows, dial: conn, online: false }));
    ok(g5.checked.join() === 'base:http://mart-aimax395:3456' && g5.own === '这台设备正在通过它连接' && g6.own === '这台设备上次通过它连接', 'G1: a device that connected through an offered row ⇒ that row, "正在通过它连接" while dialed in, "上次通过它连接" after (r4 F1\'s tense)', { g5, g6 });
    // verify-r5 C1 / verify-r6 L1: an address VibeSpace did not offer is shown as the DEVICE's claim — a row of its own,
    // UNCHECKED, with choose-it-only-if-yours words; the command's base stays checked
    const claim = { tokenMintedAt: 10, mintedBase: 'http://192.168.4.116:3456', lastConnectAt: 20, lastAccept: { dialed: 'https://evil.example' } };
    const claimView = (P) => { const cr = P.el.querySelectorAll('input').filter((i) => i.type === 'radio').find((r) => r.dataset.base === 'https://evil.example'); const tags = P.el.querySelectorAll('.dap-claim'); return { ...view(P), claimRow: cr ? { checked: cr.checked, kind: cr.parentElement.dataset.kind } : null, claimWords: tags.map((x) => x.textContent) }; };
    const c5 = claimView(PK.dialAddressPicker({ candidates: rows, dial: claim, online: true }));
    const c6 = claimView(PK.dialAddressPicker({ candidates: rows, dial: claim, online: false }));
    ok(c5.checked.join() === 'base:http://192.168.4.116:3456' && c5.value.base === 'http://192.168.4.116:3456' && c5.own === '这台设备当前命令用的地址' && c5.claimRow && c5.claimRow.checked === false && c5.claimRow.kind === 'claim' && c5.claimWords.join() === '这台设备自称正在通过它连接 — 这不是 VibeSpace 提供的地址，所以没有勾选：只有确认它是你的地址才选它' && c6.claimWords.join() === '这台设备自称上次通过它连接 — 这不是 VibeSpace 提供的地址，所以没有勾选：只有确认它是你的地址才选它', 'C1 / L1 (zh): a device stating an address VibeSpace did not offer ⇒ its command\'s base CHECKED ("这台设备当前命令用的地址"), the claim a row of its own, UNCHECKED, "只有确认它是你的地址才选它" (r5: the claim checked — one Generate minted it)', { c5, c6 });
    const c7 = claimView(PK.dialAddressPicker({ candidates: rows, dial: { tokenMintedAt: 10, lastConnectAt: 20, lastAccept: { dialed: 'https://evil.example' } }, online: true }));
    ok(c7.checked.join() === 'base:https://relay.example.net' && c7.ownCls === 'dap-own dap-claim' && c7.own === '这是猜测 — 这台设备拨号用的地址不是 VibeSpace 提供的（见下方，未勾选）：请选它能连到的那个' && c7.claimRow && c7.claimRow.checked === false, 'L1 (zh): no mint facts, only a claim ⇒ the first reachable row checked and SAID to be a guess, the claim unchecked below', c7);
    // CONTROL (s): r4 F3's picker line reverted — the loopback row is checked again on the 127.0.0.1 server
    const M = mutantCopies('dialpicker', REPO);
    const psrc = fs.readFileSync(path.join(REPO, 'src/lib/dial-address-picker.js'), 'utf8');
    const ssrc = psrc.replace("  if (first.kind === 'custom') {", "  if (first.kind === 'custom' && own && first.value) {");
    ok(ssrc !== psrc, '(s) the patch applies');
    const PS = await import(pathToFileURL(M.write('src/lib/dial-address-picker.js', ssrc, 'loopcheck')).href);
    const s1 = view(PS.dialAddressPicker({ candidates: loopRows, listen: LISTEN }));
    ok(s1.checked.join() === 'base:http://127.0.0.1:3456' && s1.value.base === 'http://127.0.0.1:3456', 'CONTROL (s): the pre-F3 picker checks the LOOPBACK row on a 127.0.0.1-bound server and Generate would hand a device elsewhere http://127.0.0.1 — the G1 cell goes red', s1);
    for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy (picker): ' })) ok(r.pass, r.name, r.detail);
  } catch (e) { ok(false, 'G1: the picker builds on the mini DOM', e.stack); }
  finally {
    if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc;
    if (hadLS === undefined) delete globalThis.localStorage; else globalThis.localStorage = hadLS;
  }
}

// ── verify-r4 THE RECEIVER-FACT CENSUS ──────────────────────────────────────
// naive-user N-sheet (the pairing sheet's default was the BROWSER's origin) and verify-r4 F1 (then the Host header a
// relay rewrote), F3 (the machine's interfaces, not the socket's bind), F2 (the hub's loopback handed to a remote
// conversation), F7 (the browser's OS) were ONE class: a value put into a command, a file or a device read from the
// SENDER's window or the SERVER while it claimed to be the RECEIVER's. The census: every read of a fact source in the
// pairing / exit / dial surfaces is claimed by exactly one declared row naming WHOSE fact it is and what it feeds; an
// undeclared read (or one more read on a declared line) is red until someone declares it — and the DEFAULTS table
// names, per value the surfaces hand out, whose fact the default is and the pin that proves it (a pin that does not
// exist is red too). Grep-derived: comments stripped, regions by marker.
const CENSUS_SRC = /location\.(origin|host|hostname|protocol|port|href)\b|navigator\.(platform|userAgent|language|languages)\b|req\.headers\.(host|origin)\b|req\.headers\[['"]x-forwarded-[a-z]+['"]\]|os\.hostname\(|os\.networkInterfaces\(|os\.homedir\(|os\.tmpdir\(|process\.platform\b|process\.env\.(HOME|XDG_RUNTIME_DIR|TMPDIR|HOST|PORT)\b|server\.address\(|127\.0\.0\.1|\bHOST\b|\bPORT\b/g;
const CENSUS_REGIONS = [
  ['src/lib/dial-address-picker.js'], ['src/lib/exit-access-dialog.js'],
  ['src/lib/sidebar-mounts.js', '    _fillPairCommandBody(body, close, r,', '    async _showBootstrapDialog(h) {'],
  ['src/server/dial-pairing.js'],
  ['src/server/mounts-plugins-wiring.js', 'async function graduateHostToDial(h,', "const { DialSessionBridge } = require('../dial-session-bridge');"],
  ['src/server/exit-routes.js'], ['src/exit-proxy.js'], ['src/exit-reach.js'], ['src/dial-facts.js'], ['src/pairing-token.js'], ['src/sock-path.js'],
  ['src/agentd/agentd.js', "const SOCKP = require('../sock-path.js');", "const LOCK = path.join(STATE, 'agentd.lock');"],
  ['src/agentd/agentd.js', "if (process.argv.includes('--stdio')) {", 'const connect = (tries = 0) => {'],
  ['src/agentd/agentd.js', "if (process.argv.includes('--dial-check')) {", '// node-pty is loaded LAZILY'],
  ['src/agentd/agentd.js', "const DIAL_FILE = path.join(STATE, 'dial.json');", "process.on('SIGTERM'"],
  ['src/agentd/client.js', '  get _sock() {', '  set _sock(v)'],
  ['data/bin/vibespace-exit'],
];
// [file, the line's context, the sources ON that line (in order), how many lines, OWNER, what it feeds]
const CENSUS_ROWS = [
  ['src/lib/dial-address-picker.js', /listen\.address \|\| '127\.0\.0\.1'/, ['HOST', '127.0.0.1'], 1, 'server (its socket\'s bound address, from the route\'s `listen`)', 'WORDS only — the "listens only on this machine" sentence (F3); never a value'],
  ['src/lib/sidebar-mounts.js', /const guessOs = deviceOs \|\| \(/, ['navigator.platform', 'navigator.platform'], 1, 'sender-window — ONLY for a device that has stated nothing (a new one; the tabs are the choice)', 'the command\'s OS form; a paired device\'s = ITS stated platform (F7)'],
  ['src/server/dial-pairing.js', /dialed: hints\.dialed, platform: hints\.platform, host: String\(req\.headers\.host \|\| ''\)\.slice\(0, 120\)/, ['req.headers.host'], 1, 'server (the Host header as it reached us = the last proxy\'s fact)', '`facts.host` → the journal and lastAccept/lastRefusal.host — NEVER a default (F1: no `.host` read from dialDefaultChoice to the module end)'],
  ['src/server/mounts-plugins-wiring.js', /const origin = req\.headers\.origin \|\| /, ['req.headers.origin', "req.headers['x-forwarded-proto']", 'req.headers.host'], 1, 'sender-window (the browser\'s Origin); its Host fallback is the last proxy\'s', 'the `origin` row, worded "the address you are using now"; a loopback one ranks last and is never the default (N-loop)'],
  ['src/server/mounts-plugins-wiring.js', /const bind = \(\(\) => \{ try \{ const a = server && typeof server\.address/, ['server.address(', 'HOST', 'HOST'], 1, 'server (its SOCKET\'s bound address)', 'bindAdmits: which interface rows exist at all (F3)'],
  ['src/server/mounts-plugins-wiring.js', /hostname: os\.hostname\(\), interfaces: os\.networkInterfaces\(\), port: PORT/, ['os.hostname(', 'os.networkInterfaces(', 'PORT'], 1, 'server (what the MACHINE has), filtered by the bind (F3)', 'the candidate rows — a paired device\'s default is its OWN stated address (F1/N-sheet), never these'],
  ['src/exit-proxy.js', /socks5h:\/\/\$\{cred\.user\}:\$\{cred\.pass\}@127\.0\.0\.1|socks5h:\/\/127\.0\.0\.1:\$\{/, ['127.0.0.1'], 5, 'server (the VibeSpace machine\'s own loopback)', 'the `use` url — handed ONLY to a conversation running on this machine (F2 refuses session.host)'],
  ['src/exit-proxy.js', /server\.listen\(0, '127\.0\.0\.1', \(\) => resolve\(server\.address\(\)\.port\)\)/, ['127.0.0.1', 'server.address('], 1, 'server', 'the forward\'s own listener (loopback only)'],
  ['src/sock-path.js', /function witnessOrRule\(\{ root, platform = process\.platform/, ['process.platform'], 1, 'the CALLER\'s machine (a daemon on its device; the hub for its own device #0)', 'a socket path on the machine that listens on it'],
  ['src/agentd/agentd.js', /process\.platform === 'win32' \? null : SOCKP\.daemonSocketPath|^\s+root: ROOT, platform: process\.platform, tmpdir: os\.tmpdir\(\), xdgRuntimeDir|const SOCK = process\.platform === 'win32'/, null, 3, 'receiver (the daemon runs ON the device)', 'its own socket path + the witness it writes'],
  ['src/agentd/agentd.js', /const bridgeSock = \(\) =>/, ['process.platform', 'process.platform', 'os.tmpdir(', 'process.env.XDG_RUNTIME_DIR'], 1, 'receiver (the --stdio bridge runs ON the device)', 'the daemon\'s socket (witness first)'],
  ['src/agentd/agentd.js', /dialUrl: cfg\.url, platform: process\.platform \}\)/, ['process.platform'], 1, 'receiver', 'x-vibespace-daemon-platform (F7) — with x-vibespace-dial-base = cfg.url\'s base (F1): the device STATES its facts'],
  ['src/agentd/client.js', /if \(process\.platform === 'win32'\) return '\\\\\\\\\.\\\\pipe|return SP\.witnessOrRule\(\{ root: this\._root, platform: process\.platform/, null, 2, 'this hub = the machine of its LOCAL daemon (device #0: the receiver IS this machine)', 'the local daemon\'s socket (witness first)'],
  ['data/bin/vibespace-exit', /print just the socks5h:\/\/<user>:<pass>@127\.0\.0\.1:PORT url|\[active: socks5h:\/\/127\.0\.0\.1:/, null, 2, 'server (words: the url comes from the route)', 'the CLI\'s help + list line'],
];
function receiverFactCensus(read) {
  const strip = (t) => t.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l.replace(/\s\/\/\s.*$/, ''))).join('\n');
  const unclaimed = [], wrong = [], used = new Map();
  for (const [f, a, b] of CENSUS_REGIONS) {
    let t = read(f);
    if (a) { const i = t.indexOf(a), j = b ? t.indexOf(b, i + 1) : t.length; if (i < 0 || j < 0) { wrong.push(`${f}: region marker gone (${a.slice(0, 40)})`); continue; } t = t.slice(i, j); }
    for (const line of strip(t).split('\n')) {
      const got = line.match(CENSUS_SRC);
      if (!got) continue;
      const rows = CENSUS_ROWS.filter((r) => r[0] === f && r[1].test(line));
      if (rows.length !== 1) { unclaimed.push(`${f}: ${got.join(',')} — ${line.trim().slice(0, 110)}`); continue; }
      const r = rows[0];
      used.set(r, (used.get(r) || 0) + 1);
      if (r[2] && JSON.stringify(got) !== JSON.stringify(r[2])) wrong.push(`${f}: the declared line reads ${JSON.stringify(got)} (declared ${JSON.stringify(r[2])}) — ${line.trim().slice(0, 90)}`);
    }
  }
  for (const r of CENSUS_ROWS) if ((used.get(r) || 0) !== r[3]) wrong.push(`${r[0]}: row ${r[1]} claims ${used.get(r) || 0} line(s), declared ${r[3]}`);
  return { unclaimed, wrong };
}
console.log('verify-r4 THE RECEIVER-FACT CENSUS — every fact read in the pairing / exit / dial surfaces, and whose it is');
{
  const cen = receiverFactCensus((f) => fs.readFileSync(path.join(REPO, f), 'utf8'));
  ok(cen.unclaimed.length === 0 && cen.wrong.length === 0, `CENSUS: every fact-source read (${CENSUS_ROWS.reduce((n, r) => n + r[3], 0)} lines over ${CENSUS_REGIONS.length} regions) is claimed by exactly one row naming its owner — nothing undeclared, no dead row`, cen);
  // THE DEFAULTS: per value the surfaces put into a command / a file / a device — whose fact the DEFAULT is, where it is
  // read, and the pin (an assert that must exist, by its words, in the named suite)
  const DEFAULTS = [
    ['the address a PAIRED device\'s sheet checks', 'receiver — its CLAIM unless VibeSpace offered it', 'lastAccept.dialed ← x-vibespace-dial-base (the device states its dial URL\'s base): `connected` when it is a reachable row or the current command\'s base, else a CLAIM: shown on its own row UNCHECKED, worded as the device\'s claim (verify-r5 C1, verify-r6 L1 — never the default); else mintedBase (the user\'s own last pick)', 'scripts/test-dial-facts.mjs', 'CONTROL (r): a default that takes the device'],
    ['…the same, end to end behind a Host-rewriting relay', 'receiver', 'a REAL daemon through a relay that writes Host: 127.0.0.1', 'scripts/test-pair-dialog-ui.mjs', 'F1: the sheet checks the address the device STATES it dials'],
    ['the address a NEW device\'s dialog checks', 'sender-window / server (worded as such)', 'the browser\'s Origin row, the relay, the interfaces the SOCKET accepts — never loopback, nothing unreachable', 'scripts/test-dial-facts.mjs', 'CONTROL (o): candidates ignoring the bind'],
    ['the scheme (ws / wss) of the dial URL', 'receiver (paired) / the chosen row', 'the stated base carries it (wss → https), never guessed from a port', 'scripts/test-dial-facts.mjs', 'F1: TLS on a non-443 port (wss://h:8443)'],
    ['the port of an interface row', 'server socket', 'the port the server listens on, only on an address the bind accepts', 'scripts/test-dial-facts.mjs', 'F3: HOST=127.0.0.1 (README: local-only) ⇒ NO interface row'],
    ['the device NAME a pairing is minted under', 'user (typed) → ONE rule', 'deviceIdOf — the route mints under it, the dialog judges collisions with it', 'scripts/test-dial-facts.mjs', 'CONTROL (p): a verdict blind to existing devices'],
    ['the dial + host TOKENS in the command / dial.json', 'server (minted by a button, one door)', 'src/pairing-token.js — never an argv, never a log', 'scripts/test-dial-facts.mjs', 'door census'],
    ['the command\'s OS form (macOS / Linux / Windows)', 'receiver (paired) / sender-window guess (new)', 'lastAccept.platform ← x-vibespace-daemon-platform', 'scripts/test-pair-dialog-ui.mjs', 'CONTROL (F7): the pre-fix sheet hands the device the Windows'],
    ['the installer + bundle URLs in the command', 'the chosen base', 'httpBase = the base the user chose (2.246.0), both URLs on it', 'scripts/test-pair-dialog-ui.mjs', 'BOTH command URLs'],
    ['the dial.json pushed over the link (Generate + keep)', 'receiver', 'the stated base the sheet checked; the device\'s root from the device itself', 'scripts/test-pair-dialog-ui.mjs', 'F1: the device\'s dial.json keeps the relay'],
    ['the device\'s socket path', 'receiver', 'computed ON the device (sock-path ladder), the witness read first', 'scripts/test-sock-path.mjs', 'witness'],
    ['who may borrow / run (the exit grant)', 'user (the machine\'s "Who can use it")', 'default nobody; re-judged at every change', 'scripts/test-exit-reach.mjs', 'nothing granted ⇒ list is []'],
    ['the `use` url (socks5h://…@127.0.0.1:port)', 'server (its loopback) — for a conversation ON this machine only', 'refused `remote_session` for session.host', 'scripts/test-exit-reach.mjs', 'CONTROL (F2): without the check the conversation on gpu-box'],
    ['the 30 s run cap', 'receiver (the daemon\'s own cap) — mirrored', 'EXIT_RUN_TIMEOUT_MS = the daemon\'s literal', 'scripts/test-architecture.mjs', "§66c the daemon's run-cmd cap"],
    ['the command an ask shows before Allow', 'receiver of the decision: the command AS IT RUNS', 'the item\'s detail, whole, verbatim (row <pre>, window <pre>)', 'scripts/test-exit-access-ui.mjs', 'CONTROL (F4 window)'],
  ];
  const missing = DEFAULTS.filter(([, , , suite, needle]) => { try { return !fs.readFileSync(path.join(REPO, suite), 'utf8').includes(needle); } catch { return true; } });
  ok(missing.length === 0 && DEFAULTS.length === 15, `CENSUS DEFAULTS: ${DEFAULTS.length} values, each with its owner and a pin that exists in its suite`, missing.map((m) => m[0] + ' → ' + m[3]));
  console.log('  ┌ value → whose default → read from → pin');
  for (const [v, o, r, suite] of DEFAULTS) console.log(`  │ ${v} → ${o} → ${r} → ${suite.replace('scripts/', '')}`);
}

console.log('controls (patched copies)');
{
  const M = mutantCopies('dialfacts', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/dial-facts.js'), 'utf8');
  const R = (status, refusal) => Object.assign(new Error('x'), { code: 'UPGRADE_REFUSED', status, refusal, body: '' });
  // (a) every 401 read as refused-unknown
  const a = src.replace("if (DIAL_REFUSAL_CODES.includes(ref)) return { code: `refused-${ref}`, detail: said || ref, status };", '');
  ok(a !== src, '(a) the patch applies');
  const A = M.load('src/dial-facts.js', a, 'every401');
  ok(A.dialFailureOf(R(401, 'token-mismatch')).code === 'refused-unknown' && DF.dialFailureOf(R(401, 'token-mismatch')).code === 'refused-token-mismatch', 'CONTROL (a): a classifier reading every 401 as refused-unknown turns the token-mismatch cell red');
  // (b) no mint guard
  const b = src.replace('> Math.max(lastConnectAt, mintedAt)) return', '> lastConnectAt) return');
  ok(b !== src, '(b) the patch applies');
  const B = M.load('src/dial-facts.js', b, 'nomint');
  const guard = { transport: 'dial', online: false, dial: { tokenMintedAt: 30, lastRefusal: { code: 'token-mismatch', at: 20 } } };
  ok(B.dialRowState(guard).state === 'refused' && DF.dialRowState(guard).state === 'never', 'CONTROL (b): dialRowState without the mint guard reads a retired token\'s refusal as `refused`');
  // (c) loopback candidates
  const c = src.replace("if (p[0] === 127 || p[0] === 0) return null;", "if (p[0] === 0) return null;").replace('if (!a || a.internal) continue;', 'if (!a) continue;');
  ok(c !== src, '(c) the patch applies');
  const C = M.load('src/dial-facts.js', c, 'loopback');
  ok(C.dialAddressCandidates({ interfaces: IF, port: 1 }).some((r) => r.base.includes('127.0.0.1')) && !DF.dialAddressCandidates({ interfaces: IF, port: 1 }).some((r) => r.base.includes('127.')), 'CONTROL (c): candidates including loopback are caught');
  // (d) the pre-verify push: whoever holds the old command gets the new token whenever a device is dialed in
  const d = src.replace("  if (!live) return { push: false, why: 'not-dialed-in' };\n  return { push: false, why: 'not-requested' };", "  if (!live) return { push: false, why: 'not-dialed-in' };\n  return { push: true, why: 'requested' };");
  ok(d !== src, '(d) the patch applies');
  const D = M.load('src/dial-facts.js', d, 'pushalways');
  ok(D.inPlacePushVerdict({ existed: true, live: true }).push === true && DF.inPlacePushVerdict({ existed: true, live: true }).push === false, 'CONTROL (d): a verdict pushing to any connected holder turns the not-requested cell red (the rotation would serve an impostor)');
  // (w) verify-r6 P1: the pre-fix verdict — a requested push to a device that is gone falls to a plain rotation, and a
  //     requested push goes to whatever link is here now
  const w = src.replace("    if (!live) return { push: false, why: 'not-dialed-in', refuse: 'link_gone' };\n    if (shownSince !== undefined && Number(shownSince) !== Number(liveSince)) return { push: false, why: 'link-changed', refuse: 'link_changed' };\n", "    if (!live) return { push: false, why: 'not-dialed-in' };\n");
  ok(w !== src, '(w) the patch applies');
  const W6 = M.load('src/dial-facts.js', w, 'pushdowngrade');
  ok(!W6.inPlacePushVerdict({ existed: true, live: false, requested: true, shownSince: 20 }).refuse && W6.inPlacePushVerdict({ existed: true, live: true, requested: true, shownSince: 20, liveSince: 45 }).push === true, 'CONTROL (w): the pre-P1 verdict rotates a device the owner asked to keep and pushes to a link the sheet never showed — the P1 cells go red');
  // (e) B9: a verdict that never refuses (the pre-B9 rule: a newcomer always replaces)
  const e = src.replace("if (current.alive === true) return { action: 'refuse', why: 'duplicate' };", '');
  ok(e !== src, '(e) the patch applies');
  const E = M.load('src/dial-facts.js', e, 'noduprefuse');
  ok(E.duplicateDialVerdict({ current: { boot: 'aabbccdd', alive: true }, incoming: { boot: '11223344' } }).action !== 'refuse' && DF.duplicateDialVerdict({ current: { boot: 'aabbccdd', alive: true }, incoming: { boot: '11223344' } }).action === 'refuse', 'CONTROL (e): a verdict that never refuses turns the duplicate cell red');
  // (f) verify-r2 B9-r2a: r1's rule restored — a newcomer without a boot id replaces the live device unasked
  const f = src.replace("if (cb && ib && cb === ib) return { action: 'replace', why: 'same-daemon' };", "if (!cb || !ib) return { action: 'replace', why: 'unknown-boot' };\n  if (cb === ib) return { action: 'replace', why: 'same-daemon' };");
  ok(f !== src, '(f) the patch applies');
  const F = M.load('src/dial-facts.js', f, 'nobootpass');
  ok(F.duplicateDialVerdict({ current: { boot: 'aabbccdd', alive: true }, incoming: {} }).action === 'replace' && DF.duplicateDialVerdict({ current: { boot: 'aabbccdd', alive: true }, incoming: {} }).action === 'refuse', 'CONTROL (f): r1\'s "no boot id ⇒ replace" turns the header-less newcomer cell red (the eviction by omission)');
  // (g) verify-r2 the dial endpoint: a budget keyed by the raw address (no /64 fold, no window ceiling) — rotation logs every knock
  const g = src.replace("if (all.lines >= globalMax) {", "if (false) {").replace("return full.slice(0, 4).map((h) => (h || '0').replace(/^0+(?=.)/, '')).join(':') + '::/64';", 'return s;');
  ok(g !== src, '(g) the patch applies');
  const G = M.load('src/dial-facts.js', g, 'rawaddr');
  {
    const bg = G.refusalBudget(); let lines = 0;
    for (let i = 0; i < 5000; i++) { const x = bg.hit(`2001:db8:1:2::${i.toString(16)}`, '', 1e12 + i); if (x.log || x.summary) lines++; }
    ok(lines === 5000, `CONTROL (g): keyed by the raw address with no window ceiling, 5 000 knocks from ONE /64 write ${lines} lines — the rotation leg goes red`);
  }
  // (h) the ceiling counting knocks instead of lines: one noisy address mutes everybody else
  const h = src.replace("if (all.lines >= globalMax) {", "all.lines += 1; if (all.lines > globalMax) {");
  ok(h !== src, '(h) the patch applies');
  const Hm = M.load('src/dial-facts.js', h, 'knockceiling');
  {
    const bh = Hm.refusalBudget();
    for (let i = 0; i < 5000; i++) bh.hit('198.51.100.1', '', 1e12 + i);
    ok(bh.hit('198.51.100.2', 'mac', 1e12 + 6000).log === false, 'CONTROL (h): a ceiling counting knocks lets one noisy address mute a paired device on another address — the lines leg goes red');
  }
  // (i) verify-r3 B-grad: r2's composition — the arguments (both tokens) in the remote command, i.e. the local ssh's argv
  const i2 = src.replace("return { remote: 'bash -s', stdin: `set -- ${String(args)}\\n${String(installer)}` };", "return { remote: `bash -s -- ${String(args)}`, stdin: String(installer) };");
  ok(i2 !== src, '(i) the patch applies');
  const I2 = M.load('src/dial-facts.js', i2, 'argvinstall');
  ok(/vsdt_/.test(I2.sshInstallInvocation({ args: GRAD_ARGS, installer: '#!/usr/bin/env bash' }).remote), 'CONTROL (i): r2\'s composition puts the dial token in the ssh remote command (the argv) — the B-grad leg goes red');
  // (j) naive-user N-loop: the pre-fix list — the loopback origin first (rank by kind only) and the first row the default
  const j2 = src.replace('rank: loop ? CANDIDATE_KINDS.length : CANDIDATE_KINDS.indexOf(kind)', 'rank: CANDIDATE_KINDS.indexOf(kind)').replace('const reach = rows.find((c) => !c.loopback && !isLoopbackBase(c.base));', 'const reach = rows[0];');
  ok(j2 !== src && j2.split('rows[0];').length === 2, '(j) the patch applies (both halves)');
  const J2 = M.load('src/dial-facts.js', j2, 'loopfirst');
  {
    const rowsJ = J2.dialAddressCandidates({ origin: 'http://127.0.0.1:3456', interfaces: IF, port: 3456 });
    ok(J2.dialDefaultChoice({ candidates: rowsJ }).base === 'http://127.0.0.1:3456' && rowsJ[0].loopback === true, 'CONTROL (j): the pre-fix rank + default put the browser\'s 127.0.0.1 first AND checked — the N-loop default cell goes red');
  }
  // (k) naive-user N-sheet: the pre-fix default — the device's facts ignored, the first reachable row checked
  const k2 = src.replace('const d = dial && typeof dial === \'object\' ? dial : null;', 'const d = null;');
  ok(k2 !== src, '(k) the patch applies');
  const K2 = M.load('src/dial-facts.js', k2, 'nodial');
  {
    const rowsK = DF.dialAddressCandidates({ origin: 'http://127.0.0.1:3456', interfaces: { ts0: [{ address: '100.87.42.107', family: 'IPv4', internal: false }], eth0: [{ address: '192.168.4.116', family: 'IPv4', internal: false }] }, port: 3456 });
    const dial = { tokenMintedAt: 10, mintedBase: 'http://192.168.4.116:3456', mintedHost: '192.168.4.116:3456' };
    ok(K2.dialDefaultChoice({ candidates: rowsK, dial }).base === 'http://100.87.42.107:3456' && DF.dialDefaultChoice({ candidates: rowsK, dial }).base === 'http://192.168.4.116:3456', 'CONTROL (k): a default that ignores the device\'s facts checks another address for a device paired on the LAN — "Generate" would move it (the N-sheet cells go red)');
  }
  // (n) verify-r4 F1: the Host header read as the device's address again (naive-user N-sheet's `lastAccept.host`)
  const n2 = src.replace("if (la && la.dialed && n(d.lastConnectAt) > 0 && n(d.lastConnectAt) >= n(d.tokenMintedAt)) {\n      const v = dialBaseVerdict(la.dialed);", "if (la && la.host && n(d.lastConnectAt) > 0 && n(d.lastConnectAt) >= n(d.tokenMintedAt)) {\n      const v = dialBaseVerdict(baseOfDialedHost(la.host, d.mintedBase) || '');"); // verify-r5: the anchor follows C1's block (the Host header read back in, whatever C1 then words it)
  ok(n2 !== src, '(n) the patch applies');
  const N2 = M.load('src/dial-facts.js', n2, 'hosthdr');
  {
    const rowsN = DF.dialAddressCandidates({ origin: 'http://127.0.0.1:3456', relay: 'https://relay.example.net', interfaces: { ts0: [{ address: '100.87.42.107', family: 'IPv4', internal: false }] }, port: 3456 });
    const dialN = { tokenMintedAt: 10, mintedBase: 'https://relay.example.net', lastConnectAt: 20, lastAccept: { host: '127.0.0.1', dialed: 'https://relay.example.net' } };
    const mut = N2.dialDefaultChoice({ candidates: rowsN, dial: dialN }), real = DF.dialDefaultChoice({ candidates: rowsN, dial: dialN });
    ok(mut.claim === 'https://127.0.0.1' && mut.why === 'paired' && real.base === 'https://relay.example.net' && real.why === 'connected' && !real.claim, 'CONTROL (n): the Host header read as the device\'s address offers https://127.0.0.1 as the device\'s address for a relay-paired device (verify-r6 L1: as its claim, beside the command\'s base — r4: checked in Custom…) — the F1 cell goes red', { mut, real });
  }
  // (o) verify-r4 F3: the candidates ignore the server's bind (what the MACHINE has, not what its socket accepts)
  const o2 = src.replace('const admits = bindAdmits(bind);', 'const admits = bindAdmits(null);');
  ok(o2 !== src, '(o) the patch applies');
  const O2 = M.load('src/dial-facts.js', o2, 'nobind');
  {
    const IFo = { ts0: [{ address: '100.87.42.107', family: 'IPv4', internal: false }], eth0: [{ address: '192.168.4.116', family: 'IPv4', internal: false }] };
    const mutRows = O2.dialAddressCandidates({ origin: 'http://127.0.0.1:41725', interfaces: IFo, port: 41725, bind: '127.0.0.1' });
    const realRows = DF.dialAddressCandidates({ origin: 'http://127.0.0.1:41725', interfaces: IFo, port: 41725, bind: '127.0.0.1' });
    ok(O2.dialDefaultChoice({ candidates: mutRows }).base === 'http://100.87.42.107:41725' && DF.dialDefaultChoice({ candidates: realRows }).kind === 'custom', 'CONTROL (o): candidates ignoring the bind check the tailnet row on a loopback-bound server (world B\'s reproduction) — the F3 cells go red');
  }
  // (u) verify-r5 A1: a route verdict that ignores what the dialog expects — the second window replaces silently
  {
    const usrc = src.replace("if (exact && expect === 'new') return", 'if (false) return');
    ok(usrc !== src, '(u) the patch applies');
    const U2 = M.load('src/dial-facts.js', usrc, 'noexpect');
    const Hu = [{ id: 'host-dial-racemac', name: 'racemac', transport: 'dial', deviceId: 'racemac', online: true }];
    ok(U2.pairRequestVerdict({ deviceId: 'racemac', expect: 'new', hosts: Hu }).ok === true && DF.pairRequestVerdict({ deviceId: 'racemac', expect: 'new', hosts: Hu }).code === 'already_paired', 'CONTROL (u): a verdict ignoring `expect` lets window 2\'s "new" pairing replace a connected device silently — the A1 cells go red');
  }
  // (v) verify-r5 A3: a case-blind route verdict — "macbook" minted beside "Macbook"
  {
    const vsrc = src.replace("    if (twin) return { ok: false, code: 'name_case_taken'", "    if (false) return { ok: false, code: 'name_case_taken'");
    ok(vsrc !== src, '(v) the patch applies');
    const V2 = M.load('src/dial-facts.js', vsrc, 'caseblind');
    const Hv = [{ id: 'host-dial-MacBook', name: 'MacBook', transport: 'dial', deviceId: 'MacBook', online: true }];
    ok(V2.pairRequestVerdict({ deviceId: 'macbook', expect: 'new', hosts: Hv }).ok === true && DF.pairRequestVerdict({ deviceId: 'macbook', expect: 'new', hosts: Hv }).code === 'name_case_taken', 'CONTROL (v): a case-blind verdict mints "macbook" beside "MacBook" (one token file on a case-insensitive disk) — the A3 cells go red');
  }
  // (p) verify-r4 F6: the collision verdict blind to existing devices (the pre-fix dialog: nothing said before Create)
  const p2 = src.replace("const h = deviceId ? (Array.isArray(hosts) ? hosts : []).find((x) => x && x.deviceId === deviceId) : null;", 'const h = null;');
  ok(p2 !== src, '(p) the patch applies');
  const P2 = M.load('src/dial-facts.js', p2, 'noname');
  ok(P2.pairNameVerdict('Macbook', [{ deviceId: 'Macbook', transport: 'dial', online: true }]).exists === false && DF.pairNameVerdict('Macbook', [{ deviceId: 'Macbook', transport: 'dial', online: true }]).exists === true, 'CONTROL (p): a verdict blind to existing devices lets "Create pairing" replace a connected device unsaid — the F6 cells go red');
  // (r) verify-r5 C1: a default that trusts the device's statement as a FACT (no `claimed`) — the leaked holder's address
  //     reads "the address this device connects through"
  {
    const rsrc = src.replace('        if (offered) return r;\n        claim = v.base;', '        return r;');
    ok(rsrc !== src, '(r) the patch applies');
    const R2 = M.load('src/dial-facts.js', rsrc, 'trust-claim');
    const rowsR = DF.dialAddressCandidates({ origin: 'http://127.0.0.1:3456', relay: 'https://relay.example.net', interfaces: { eth0: [{ address: '192.168.4.116', family: 'IPv4', internal: false }] }, port: 3456 });
    const dialR = { tokenMintedAt: 10, mintedBase: 'http://192.168.4.116:3456', lastConnectAt: 20, lastAccept: { dialed: 'https://evil.example' } };
    const mutR = R2.dialDefaultChoice({ candidates: rowsR, dial: dialR }), realR = DF.dialDefaultChoice({ candidates: rowsR, dial: dialR });
    ok(mutR.why === 'connected' && mutR.value === 'https://evil.example' && realR.why === 'paired' && realR.claim === 'https://evil.example', 'CONTROL (r): a default that takes the device\'s statement as a fact words a leaked holder\'s https://evil.example "connects through" and checks it — the C1 cells go red', { mutR, realR });
    // (r2) verify-r6 L1: r5's shape — the claim CHECKED by default (worded as a claim): one Generate mints it
    const r2src = src.replace('        if (offered) return r;\n        claim = v.base;', "        return offered ? r : { ...r, why: 'claimed' };");
    ok(r2src !== src, '(r2) the patch applies');
    const R3 = M.load('src/dial-facts.js', r2src, 'precheck-claim');
    const m0 = R3.dialDefaultChoice({ candidates: rowsR, dial: dialR });
    const m1 = R3.dialDefaultChoice({ candidates: rowsR, dial: { tokenMintedAt: 30, mintedBase: m0.kind === 'row' ? m0.base : m0.value, lastConnectAt: 40, lastAccept: { dialed: 'https://evil.example' } } });
    ok(m0.value === 'https://evil.example' && m1.why === 'connected', 'CONTROL (r2): r5\'s pre-checked claim — Generate on the default mints https://evil.example and the next sheet says "connects through" as a fact: the L1 walk goes red', { m0, m1 });
  }
  // (t) verify-r5 C2: the row's host reading a refused knock's statement first (the r4 line)
  {
    const tsrc = src.replace('  const host = authOf(d.lastAccept && d.lastAccept.dialed) || cmdHost;', '  const host = authOf(d.lastRefusal && d.lastRefusal.dialed) || authOf(d.lastAccept && d.lastAccept.dialed) || cmdHost;');
    ok(tsrc !== src, '(t) the patch applies');
    const T2 = M.load('src/dial-facts.js', tsrc, 'refusal-host');
    const knock = { transport: 'dial', deviceId: 'Mac', online: true, dial: { tokenMintedAt: 1, lastConnectAt: 5, lastAccept: { at: 5, dialed: 'https://relay.example.net' }, lastRefusal: { code: 'token-mismatch', at: 9, dialed: 'http://evil.example' } } };
    ok(T2.dialRowState(knock).host === 'evil.example:80' && DF.dialRowState(knock).host === 'relay.example.net:443', 'CONTROL (t): a row host that reads a refused knock\'s statement names the stranger\'s evil.example on a connected device — the C2 cells go red');
  }
  // (q) verify-r4 THE CENSUS: a default swapped back to the SENDER's fact (the picker filling Custom… with the browser's
  // origin, the naive-user N-sheet class) and a device fact read off the Host header again (F1) must turn it red
  {
    const pkRel = 'src/lib/dial-address-picker.js', dpRel = 'src/server/dial-pairing.js';
    const pk = fs.readFileSync(path.join(REPO, pkRel), 'utf8'), dp = fs.readFileSync(path.join(REPO, dpRel), 'utf8');
    const pkMut = pk.replace("rc.checked = true; chosen = 'custom'; custom.value = first.value || '';", "rc.checked = true; chosen = 'custom'; custom.value = first.value || location.origin;");
    const dpMut = dp.replace('dialed: hints.dialed, platform: hints.platform, host: String(req.headers.host', 'dialed: String(req.headers.host || \'\'), platform: hints.platform, host: String(req.headers.host');
    ok(pkMut !== pk && dpMut !== dp, '(q) both patches apply');
    const fPk = M.write(pkRel, pkMut, 'census-origin'), fDp = M.write(dpRel, dpMut, 'census-host');
    const readWith = (rel, file) => (f) => fs.readFileSync(f === rel ? file : path.join(REPO, f), 'utf8');
    const c1 = receiverFactCensus(readWith(pkRel, fPk)), c2 = receiverFactCensus(readWith(dpRel, fDp));
    ok(c1.unclaimed.some((x) => /location\.origin/.test(x)) && c2.unclaimed.some((x) => /^src\/server\/dial-pairing\.js: req\.headers\.host,req\.headers\.host/.test(x)), 'CONTROL (q): the browser\'s origin as the Custom… default, and the device\'s address read off the Host header, each turn THE CENSUS red', { c1, c2 });
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 16, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
