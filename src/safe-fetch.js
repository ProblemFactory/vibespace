'use strict';
/**
 * THE BELT for a URL the product fetches from a NON-vendor source (lane runtime-floor, 2026-10-22 — the Node.js
 * security releases of 2026-10-21 fixed an out-of-bounds write in the Brotli DECODER, CVE-2026-111497). MEASURED on
 * node v24.12.0: the built-in fetch asks `accept-encoding: gzip, deflate` but DECODES a `content-encoding: br` answer
 * anyway — a server we do not control picks the decoder. safeFetch is that request over node's http / https (which
 * decode nothing): it asks `accept-encoding: gzip`, unpacks gzip itself, and REFUSES any other content-encoding before
 * one byte reaches a decoder (br, deflate, zstd, a list) — independent of the runtime's version. Bounded (the body ≤
 * maxBytes, decoded and raw), redirects followed ≤ 5 (303 → GET; authorization dropped across origins, as fetch does),
 * an AbortSignal honoured. The answer is the subset of a Response the callers read: ok / status / url / headers (a
 * Headers) / arrayBuffer() / text() / json(). The census of every fetch() site in src/server (vendor-fixed / own /
 * untrusted) is scripts/test-fetch-encoding.mjs. SHARED: node builtins only.
 */
const http = require('http');
const https = require('https');
const zlib = require('zlib');

const MAX_BYTES = 200 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const refusal = (code, message) => Object.assign(new Error(message), { code });

function once(url, { method, headers, body, signal, maxBytes }) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { reject(refusal('bad-url', `not a URL: ${url}`)); return; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') { reject(refusal('bad-url', `not an http(s) URL: ${u.protocol}`)); return; }
    const lib = u.protocol === 'https:' ? https : http;
    const h = {};
    for (const [k, v] of Object.entries(headers || {})) if (v != null && k.toLowerCase() !== 'accept-encoding') h[k] = String(v);
    h['accept-encoding'] = 'gzip';
    if (body != null && h['content-length'] == null && h['Content-Length'] == null) h['content-length'] = String(Buffer.byteLength(body));
    const req = lib.request(u, { method, headers: h, signal: signal || undefined }, (res) => {
      const enc = String(res.headers['content-encoding'] || '').trim().toLowerCase();
      if (enc && enc !== 'identity' && enc !== 'gzip' && enc !== 'x-gzip') {
        res.destroy(); req.destroy();
        reject(refusal('encoding', `${u.origin} answered content-encoding "${enc}" — refused (this request takes gzip only; nothing was decoded)`));
        return;
      }
      const loc = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc) { res.resume(); resolve({ redirect: new URL(loc, u).href, status: res.statusCode }); return; }
      const chunks = [];
      let raw = 0, got = 0, failed = false;
      const fail = (e) => { if (failed) return; failed = true; res.destroy(); reject(e); };
      res.on('data', (c) => { raw += c.length; if (raw > maxBytes) fail(refusal('too-big', `${u.origin}: the answer is larger than ${maxBytes} bytes`)); });
      const out = enc === 'gzip' || enc === 'x-gzip' ? res.pipe(zlib.createGunzip()) : res;
      out.on('data', (c) => { got += c.length; if (got > maxBytes) fail(refusal('too-big', `${u.origin}: the answer is larger than ${maxBytes} bytes`)); else chunks.push(c); });
      out.on('error', (e) => fail(refusal('body', `${u.origin}: ${e.message}`)));
      res.on('error', (e) => fail(refusal('body', `${u.origin}: ${e.message}`)));
      out.on('end', () => { if (!failed) resolve({ status: res.statusCode, statusText: res.statusMessage || '', headers: res.headers, buf: Buffer.concat(chunks) }); });
    });
    req.on('error', (e) => reject(e && e.name === 'AbortError' ? e : Object.assign(refusal('network', `${u.origin}: ${e && e.message}`), { cause: e })));
    if (body != null) req.end(body); else req.end();
  });
}

/** fetch() for a URL nobody we trust chose: gzip or nothing. → Promise<{ok, status, statusText, url, headers, redirected,
 *  arrayBuffer(), text(), json()}>; throws (code: bad-url / encoding / too-big / network / body / redirect) — and an
 *  AbortError when `signal` aborts. `redirect`: 'follow' (default) | 'error' | 'manual' (the 3xx itself, no body). */
async function safeFetch(url, { method = 'GET', headers = {}, body = null, signal = null, maxBytes = MAX_BYTES, redirect = 'follow' } = {}) {
  let at = String(url), m = String(method || 'GET').toUpperCase(), b = body, hs = { ...(headers || {}) };
  for (let hop = 0; ; hop++) {
    const r = await once(at, { method: m, headers: hs, body: b, signal, maxBytes });
    if (r.redirect) {
      if (redirect === 'error') throw refusal('redirect', `${new URL(at).origin} redirected (${r.status}) and this request takes none`);
      if (redirect === 'manual') return answer(at, { status: r.status, statusText: '', headers: { location: r.redirect }, buf: Buffer.alloc(0) }, hop > 0);
      if (hop >= MAX_REDIRECTS) throw refusal('redirect', `more than ${MAX_REDIRECTS} redirects from ${url}`);
      if (r.status === 303 || ((r.status === 301 || r.status === 302) && m === 'POST')) { m = 'GET'; b = null; hs = Object.fromEntries(Object.entries(hs).filter(([k]) => !/^content-(length|type)$/i.test(k))); }
      if (new URL(r.redirect).origin !== new URL(at).origin) hs = Object.fromEntries(Object.entries(hs).filter(([k]) => k.toLowerCase() !== 'authorization' && k.toLowerCase() !== 'cookie'));
      at = r.redirect;
      continue;
    }
    return answer(at, r, hop > 0);
  }
}
function answer(url, r, redirected) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(r.headers || {})) { if (Array.isArray(v)) v.forEach((x) => headers.append(k, x)); else if (v != null) headers.set(k, String(v)); }
  const buf = r.buf;
  return {
    ok: r.status >= 200 && r.status < 300, status: r.status, statusText: r.statusText, url, redirected, headers,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    text: async () => buf.toString('utf8'),
    json: async () => JSON.parse(buf.toString('utf8')),
  };
}

module.exports = { safeFetch, MAX_BYTES, MAX_REDIRECTS };
