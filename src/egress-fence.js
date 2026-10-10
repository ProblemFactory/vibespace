'use strict';
/**
 * THE EGRESS FENCE — SHARED (node builtins only: dns / http / https; lane webhook-l1-server, docs/design-webhook.zh.md
 * §7 / §10 fence 5). The ONE client of a request to an address the OWNER configured (a webhook caller's reply URL): the
 * host is no vendor row's, so it is judged by the address it resolves to, never by its name.
 *
 *   · `addressVerdict(ip)` — THE RESOLVED ADDRESS VERDICT (lifted here from src/app-manifest.js; src/app-serve.js reads it
 *     from here): null = a public address; else the reason. Every private / loopback / link-local / shared /
 *     documentation / multicast / reserved range of IPv4 and IPv6, an IPv4-mapped or NAT64 address judged as its IPv4.
 *   · `urlVerdict(url, {allowPrivate})` — https only (http only beside `allowPrivate`), no credentials in the URL.
 *   · `fenceFetch(url, opts)` — the name is resolved ONCE, EVERY answer judged, and the socket connects to exactly the
 *     address judged (a rebinding name cannot move it); a 3xx is an answer, never followed; one deadline (10 s); the
 *     response body is read to `maxBytes` (64 KiB) and no further. `sent` says whether the request left: a timeout or a
 *     reset AFTER it did is `lost` (the receiver may have acted — the caller's outcome is unknown), BEFORE it a refusal.
 */
const dns = require('dns');
const http = require('http');
const https = require('https');

const v4n = (s) => { const p = String(s).split('.').map(Number); return p.length === 4 && p.every((x) => Number.isInteger(x) && x >= 0 && x <= 255) ? ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3] : null; };
const V4_PRIVATE = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]];
/** IPv6 text → 8 groups, or null. */
function v6groups(s) {
  let t = String(s).toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const m4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(t);
  if (m4) { const n = v4n(m4[1]); if (n == null) return null; t = t.slice(0, -m4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`; }
  const parts = t.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [], tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const fill = parts.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (parts.length === 1 && head.length !== 8)) return null;
  const g = [...head, ...Array(fill).fill('0'), ...tail].map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN));
  return g.length === 8 && g.every((x) => Number.isInteger(x)) ? g : null;
}
/**
 * THE RESOLVED ADDRESS VERDICT (PURE): null = a public address; else the reason. Every private / loopback / link-local
 * / shared / documentation / multicast / reserved range of IPv4 and IPv6, an IPv4-mapped or NAT64 address judged as
 * its IPv4 — and (verify r1 #15, int248 r2) the four other families that embed one: SIIT ::ffff:0:a.b.c.d, 6to4
 * 2002:AABB:CCDD::/48 (its IPv4), Teredo 2001:0::/32 (its server AND its de-obfuscated client IPv4) and the local-use
 * NAT64 prefix 64:ff9b:1::/48 (RFC 8215 — no public destination lives there: refused whole). The fetch connects to exactly the address judged (no second lookup — a rebinding name cannot move it).
 */
function addressVerdict(ip) {
  const s = String(ip || '');
  const n = v4n(s);
  if (n != null) { for (const [b, bits] of V4_PRIVATE) { const m = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; if (((n & m) >>> 0) === ((v4n(b) & m) >>> 0)) return `${s} is a private or reserved address`; } return null; }
  const g = v6groups(s);
  if (!g) return `${s.slice(0, 60)} is not an address`;
  const embedded = (hi, lo) => `${hi >>> 8}.${hi & 255}.${lo >>> 8}.${lo & 255}`;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return addressVerdict(embedded(g[6], g[7])); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return addressVerdict(embedded(g[6], g[7])); // NAT64
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return `${s} is a local-use NAT64 address`;                         // RFC 8215 64:ff9b:1::/48
  if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) return addressVerdict(embedded(g[6], g[7])); // SIIT ::ffff:0:0:0/96
  if (g[0] === 0x2002) return addressVerdict(embedded(g[1], g[2]));                                                      // 6to4 2002::/16
  if (g[0] === 0x2001 && g[1] === 0) return addressVerdict(embedded(g[2], g[3])) || addressVerdict(embedded(~g[6] & 0xffff, ~g[7] & 0xffff));   // Teredo
  if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return `${s} is a loopback or unspecified address`;
  if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00 || (g[0] === 0x2001 && g[1] === 0x0db8) || (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) || g.slice(0, 6).every((x) => x === 0)) return `${s} is a private or reserved address`;
  return null;
}

const FENCE_TIMEOUT_MS = 10 * 1000;
const FENCE_MAX_BYTES = 64 * 1024;
const FENCE_BODY_MAX = 256 * 1024;

/** `{ok:true, url}` | `{ok:false, code, error}` — the address shape before anything resolves. */
function urlVerdict(raw, { allowPrivate = false } = {}) {
  let u;
  try { u = new URL(String(raw || '')); } catch { return { ok: false, code: 'bad-url', error: 'not an absolute address' }; }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && allowPrivate)) return { ok: false, code: 'bad-url', error: allowPrivate ? 'only an http(s) address' : 'only an https address (http needs the private-address switch)' };
  if (u.username || u.password) return { ok: false, code: 'bad-url', error: 'an address may not carry a user or a password' };
  if (!u.hostname) return { ok: false, code: 'bad-url', error: 'the address names no host' };
  return { ok: true, url: u };
}
const bareHost = (h) => String(h || '').replace(/^\[|\]$/g, '');
const isLiteral = (h) => v4n(h) != null || v6groups(h) != null;

/** Resolve ONCE → `{ok:true, address, family}` (every answer judged) | `{ok:false, code, error}`. */
async function resolveOnce(host, { allowPrivate = false, lookup = null } = {}) {
  const h = bareHost(host);
  let all;
  if (isLiteral(h)) all = [{ address: h, family: v4n(h) != null ? 4 : 6 }];
  else {
    try { all = await (lookup || ((n, o) => dns.promises.lookup(n, o)))(h, { all: true, verbatim: true }); } catch (e) { return { ok: false, code: 'resolve-failed', error: `${h.slice(0, 120)} does not resolve (${(e && e.code) || 'error'})` }; }
    all = (Array.isArray(all) ? all : [all]).filter((a) => a && typeof a.address === 'string');
  }
  if (!all.length) return { ok: false, code: 'resolve-failed', error: `${h.slice(0, 120)} does not resolve` };
  if (!allowPrivate) for (const a of all) { const why = addressVerdict(a.address); if (why) return { ok: false, code: 'private-address', error: `${h.slice(0, 120)} points at a private address (${why}) — refused` }; }
  const a = all[0];
  return { ok: true, address: a.address, family: Number(a.family) === 6 || (a.address.includes(':') && Number(a.family) !== 4) ? 6 : 4 };
}

/**
 * ONE request through the fence → `{ok, status, body, cut, sent, address}` (ok = a 2xx) | `{ok:false, code, error, sent}`.
 * `opts`: `{method='POST', headers, body, allowPrivate, timeoutMs, maxBytes, lookup}` — `lookup` is the suites' resolver
 * seam (a rebinding resolver proves it is asked once). Codes: bad-url · resolve-failed · private-address · too-large ·
 * refused (nothing left) · lost (it left; the answer did not come) · redirect (a 3xx, not followed).
 */
async function fenceFetch(raw, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const uv = urlVerdict(raw, { allowPrivate: o.allowPrivate === true });
  if (!uv.ok) return { ...uv, sent: false };
  const u = uv.url;
  const body = o.body === undefined || o.body === null ? null : Buffer.from(String(o.body), 'utf-8');
  if (body && body.length > FENCE_BODY_MAX) return { ok: false, code: 'too-large', error: `a request body over ${FENCE_BODY_MAX} bytes`, sent: false };
  const rv = await resolveOnce(u.hostname, { allowPrivate: o.allowPrivate === true, lookup: typeof o.lookup === 'function' ? o.lookup : null });
  if (!rv.ok) return { ...rv, sent: false };
  const max = Number.isInteger(o.maxBytes) && o.maxBytes > 0 ? Math.min(o.maxBytes, FENCE_MAX_BYTES) : FENCE_MAX_BYTES;
  const ms = Number(o.timeoutMs) > 0 ? Math.min(Number(o.timeoutMs), FENCE_TIMEOUT_MS) : FENCE_TIMEOUT_MS;
  const mod = u.protocol === 'https:' ? https : http;
  const pinned = (h, lo, cb) => (lo && lo.all ? cb(null, [{ address: rv.address, family: rv.family }]) : cb(null, rv.address, rv.family));
  return new Promise((resolve) => {
    let sent = false, done = false;
    const fin = (x) => { if (done) return; done = true; clearTimeout(timer); resolve({ ...x, sent, address: rv.address }); };
    const headers = { ...(o.headers && typeof o.headers === 'object' ? o.headers : {}), ...(body ? { 'Content-Length': String(body.length) } : {}) };
    const req = mod.request({ protocol: u.protocol, hostname: bareHost(u.hostname), port: u.port || undefined, path: `${u.pathname}${u.search}`, method: String(o.method || 'POST'), headers, lookup: pinned, agent: false, ...(o.ca ? { ca: o.ca } : {}) }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400) { res.resume(); return fin({ ok: false, code: 'redirect', status, error: `the address answered HTTP ${status} — a redirect is never followed` }); }
      const chunks = []; let n = 0, cut = false;
      res.on('data', (d) => { if (cut) return; const room = max - n; if (d.length > room) { chunks.push(d.subarray(0, room)); n = max; cut = true; fin({ ok: status >= 200 && status < 300, status, body: Buffer.concat(chunks).toString('utf-8'), cut: true }); res.destroy(); return; } chunks.push(d); n += d.length; });
      res.on('end', () => fin({ ok: status >= 200 && status < 300, status, body: Buffer.concat(chunks).toString('utf-8'), cut }));
      res.on('error', () => fin({ ok: false, code: 'lost', error: 'the answer broke off' }));
      res.on('aborted', () => fin({ ok: false, code: 'lost', error: 'the answer broke off' }));
    });
    const timer = setTimeout(() => { req.destroy(); fin({ ok: false, code: sent ? 'lost' : 'refused', error: `no answer within ${Math.round(ms / 1000)} s` }); }, ms);
    req.on('finish', () => { sent = true; });
    req.on('error', (e) => fin({ ok: false, code: sent ? 'lost' : 'refused', error: `the address could not be reached (${(e && e.code) || 'error'})` }));
    if (body) req.end(body); else req.end();
  });
}

module.exports = { addressVerdict, urlVerdict, resolveOnce, fenceFetch, FENCE_TIMEOUT_MS, FENCE_MAX_BYTES, FENCE_BODY_MAX };
