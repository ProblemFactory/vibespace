#!/usr/bin/env node
// test-egress-fence — THE SHARED EGRESS FENCE (lane webhook-l1-server, src/egress-fence.js; docs/design-webhook.zh.md
// §10 fence 5): every address class judged (IPv4 / IPv6 private, loopback, link-local + the metadata address, shared,
// documentation, multicast, IPv4-mapped, NAT64), https only unless private addresses are allowed, the name resolved ONCE
// and the socket pinned to the judged address (a REBINDING resolver is asked once — its second answer never used), every
// answer judged (one private answer refuses the lot), a 3xx answered but never followed, `lost` (sent, no answer) vs
// `refused` (nothing left), the response cut at 64 KiB. Loopback stub servers only — no outbound network.
// Run: node scripts/test-egress-fence.mjs
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const EF = require('../src/egress-fence.js');
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + JSON.stringify(d).slice(0, 500) : '')); } };

console.log('§1 the address verdict — every class');
const PUBLIC = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '2a00:1450:4001::1'];
const PRIVATE = ['0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.4', '192.0.0.8', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.7', '203.0.113.9', '224.0.0.1', '240.0.0.1', '255.255.255.255',
  '::', '::1', 'fc00::1', 'fd12::3', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a9fe:a9fe', '64:ff9b::7f00:1'];
ok(PUBLIC.every((a) => EF.addressVerdict(a) === null), 'a public IPv4 / IPv6 address passes (control)', PUBLIC.filter((a) => EF.addressVerdict(a) !== null));
ok(PRIVATE.every((a) => typeof EF.addressVerdict(a) === 'string'), `every private / loopback / link-local (the metadata 169.254.169.254) / shared / documentation / multicast / reserved address is refused — IPv4-mapped and NAT64 judged as their IPv4 (${PRIVATE.length})`, PRIVATE.filter((a) => EF.addressVerdict(a) === null));
ok(EF.addressVerdict('not-an-ip') !== null, 'a name is not an address (refused)');
console.log('§2 the URL');
ok(EF.urlVerdict('http://example.com/x').code === 'bad-url' && EF.urlVerdict('http://example.com/x', { allowPrivate: true }).ok && EF.urlVerdict('https://example.com/x').ok, 'https only — http only beside the private-address switch');
ok(EF.urlVerdict('https://u:p@example.com/').code === 'bad-url' && EF.urlVerdict('ftp://example.com/').code === 'bad-url' && EF.urlVerdict('file:///etc/passwd').code === 'bad-url' && EF.urlVerdict('/relative').code === 'bad-url', 'no credentials in the address; no ftp / file / relative address');

console.log('§3 the fetch (loopback stubs, allowPrivate where they need it)');
const hits = [];
const mk = (handler) => new Promise((r) => { const s = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { hits.push({ port: s.address().port, url: req.url, body: b }); handler(req, res, b); }); }); s.listen(0, '127.0.0.1', () => r(s)); });
const okSrv = await mk((req, res) => res.end('fine'));
const second = await mk((req, res) => res.end('second'));
const redir = await mk((req, res) => { res.writeHead(302, { Location: `http://127.0.0.1:${second.address().port}/x` }); res.end(); });
const silent = await mk(() => { /* never answers */ });
const huge = await mk((req, res) => res.end('z'.repeat(200 * 1024)));
const notFound = await mk((req, res) => { res.writeHead(404); res.end('no'); });
const P = (s) => s.address().port;
try {
  let asked = 0;
  const rebind = (name, o) => { asked++; return Promise.resolve(asked === 1 ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '10.255.255.1', family: 4 }]); };
  const r1 = await EF.fenceFetch(`http://rebind.test:${P(okSrv)}/a`, { allowPrivate: true, lookup: rebind, body: '{}' });
  ok(r1.ok && r1.body === 'fine' && r1.address === '127.0.0.1' && asked === 1, `a REBINDING resolver is asked ONCE and the socket connects to the address judged (${asked} lookup, ${r1.address})`, r1);
  let asked2 = 0;
  const mixed = () => { asked2++; return Promise.resolve([{ address: '93.184.216.34', family: 4 }, { address: '169.254.169.254', family: 4 }]); };
  const before = hits.length;
  const r2 = await EF.fenceFetch(`https://mixed.test:${P(okSrv)}/a`, { lookup: mixed });
  ok(!r2.ok && r2.code === 'private-address' && r2.sent === false && hits.length === before && asked2 === 1, 'EVERY answer is judged — one private answer (the metadata address) refuses the lot before anything connects');
  const r3 = await EF.fenceFetch(`https://localhost:${P(okSrv)}/`, { lookup: () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]) });
  ok(!r3.ok && r3.code === 'private-address', 'without the switch a name that resolves to loopback is refused (the switch is `webhook.allowPrivateReplyUrl`)');
  const r4 = await EF.fenceFetch(`http://127.0.0.1:${P(redir)}/go`, { allowPrivate: true });
  await new Promise((r) => setTimeout(r, 100));
  ok(!r4.ok && r4.code === 'redirect' && r4.status === 302 && !hits.some((h) => h.port === P(second)), 'a 3xx is answered as `redirect` and NEVER followed (the second server got nothing)', r4);
  const t0 = Date.now();
  const r5 = await EF.fenceFetch(`http://127.0.0.1:${P(silent)}/`, { allowPrivate: true, timeoutMs: 400, body: 'x' });
  ok(!r5.ok && r5.code === 'lost' && r5.sent === true && Date.now() - t0 < 3000, 'a request that LEFT and got no answer is `lost` (sent: true — the receiver may have acted: the outbox says unknown)', r5);
  const dead = http.createServer(); await new Promise((r) => dead.listen(0, '127.0.0.1', r)); const dp = P(dead); await new Promise((r) => dead.close(r));
  const r6 = await EF.fenceFetch(`http://127.0.0.1:${dp}/`, { allowPrivate: true, body: 'x' });
  ok(!r6.ok && r6.code === 'refused' && r6.sent === false, 'a connection refused is `refused` (sent: false — nothing left: the outbox says failed)', r6);
  const r7 = await EF.fenceFetch(`http://127.0.0.1:${P(huge)}/`, { allowPrivate: true });
  ok(r7.ok && r7.cut === true && Buffer.byteLength(r7.body) === EF.FENCE_MAX_BYTES, 'the response is read to 64 KiB and no further (cut: true)', { cut: r7.cut, len: r7.body && r7.body.length });
  const r8 = await EF.fenceFetch(`http://127.0.0.1:${P(notFound)}/`, { allowPrivate: true });
  ok(!r8.ok && r8.status === 404 && r8.sent === true, 'a 4xx is an answer, not ok (the reply is `failed`)');
  ok(EF.FENCE_TIMEOUT_MS === 10000, 'one deadline: 10 s');
  const r9 = await EF.fenceFetch(`http://127.0.0.1:${P(okSrv)}/`, { allowPrivate: true, body: 'x'.repeat(EF.FENCE_BODY_MAX + 1) });
  ok(!r9.ok && r9.code === 'too-large' && r9.sent === false, 'a request body over the bound never leaves');
} catch (e) { fail++; console.error('  ✗ threw:', e.stack || e.message); }
finally { for (const s of [okSrv, second, redir, silent, huge, notFound]) { try { s.closeAllConnections && s.closeAllConnections(); s.close(); } catch { } } }
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
