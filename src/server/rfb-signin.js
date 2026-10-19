'use strict';
/**
 * THE HUB SIGNS IN (lane desktop-vnc-remember, owner 2026-10-19 「现在远程桌面密码能保留了吧 就存到 vault 里？」).
 *
 * A paired Windows / macOS machine's desktop sign-in — the Mac user's name + password (Apple Remote Desktop, RFB security
 * type 30) or the VNC password (type 2, or TightVNC's type 16 with its VNC sub-auth) — can be REMEMBERED per machine: the sealed integration row `desktop-signin/<hostId>` (src/integration-registry.js; the
 * store's key is the vault's). The page is never handed it back. The ONE picture bridge's RFB relay
 * (src/server/stream-relay-rfb.js) runs THIS gate on the upstream socket of a window's connection before a byte reaches the
 * browser: it answers the machine's handshake with the remembered sign-in and, once the machine took it, shows the browser a
 * server that asks nothing (security type None) and steps out of the way — every later byte is the plain relay's. A refused
 * or unusable sign-in shows the browser NOTHING: the relay drops that connection and relays a fresh one plain, so the
 * person signs in exactly as before (the dialog says the remembered one was refused — src/lib/machine-desktop.js).
 *
 * The crypto is byte-for-byte noVNC 1.7's (core/rfb.js — scripts/test-desktop-signin.mjs checks it against noVNC's own DES):
 *   · VNC auth: DES over the 16-byte challenge, the key = the password's first 8 characters (their low bytes, zero-padded)
 *     with each byte's bits REVERSED (the RFB quirk noVNC's DES spells inside its key schedule). OpenSSL 3's default
 *     provider has no single DES, so DES-EDE3 with K‖K‖K — which IS single DES.
 *   · ARD: Diffie-Hellman over the machine's own generator + prime (BigInt — no OpenSSL parameter checks), MD5(the shared
 *     secret, left-padded to the key length) = an AES-128-ECB key over 128 bytes: the name at 0, the password at 64, each
 *     UTF-8, at most 63 bytes, NUL-terminated, the rest random; then the client's public key.
 * A sign-in that asks for a name + password some other way (UltraVNC's MSLogonII 113, VeNCrypt 19 — its Plain subtype is a
 * u32 inside VeNCrypt, never a top-level type, and its usual subtypes ride TLS) is NOT spoken here: nothing is offered there.
 * Never a password in an error, a log line or a verdict: the gate's verdicts carry a code and the machine's own reason.
 */
const crypto = require('crypto');
const D = require('../desktop-display.js');

/** The kinds a remembered row is (its `auth` field). */
const AUTHS = Object.freeze(['ard', 'vnc']);
/** The RFB security types the HUB speaks for a row of each kind, in its order of preference. */
const HUB_TYPES = Object.freeze({ ard: Object.freeze([30]), vnc: Object.freeze([2, 16]) });
/** The row kind for the security type the viewer signed in with (the probe's `type` — the first one noVNC speaks in the
 *  machine's order). null = a type the hub cannot speak itself (MSLogonII, VeNCrypt, RA2ne, XVP, None): nothing is offered. */
function rowAuthOf(type) { return type === 30 ? 'ard' : type === 2 || type === 16 ? 'vnc' : null; }
/** Does a row of kind `auth` carry a user name (ARD) — a VNC password has none? */
const NAMES_USER = Object.freeze({ ard: true, vnc: false });
const namesUser = (auth) => Object.hasOwn(NAMES_USER, auth) && NAMES_USER[auth] === true;
/** The type the hub answers a machine offering `types` with, for a row of kind `auth` — null = none it speaks. */
function pickType(auth, types) {
  const want = Object.hasOwn(HUB_TYPES, auth) ? HUB_TYPES[auth] : [];
  const have = Array.isArray(types) ? types : [];
  const t = want.find((x) => have.includes(x));
  return t === undefined ? null : t;
}

const REV = Buffer.from(Array.from({ length: 256 }, (_, b) => { let r = 0; for (let i = 0; i < 8; i++) if (b & (1 << i)) r |= 0x80 >> i; return r; }));
/** VNC auth: the 16-byte answer to the machine's 16-byte challenge. */
function vncResponse(password, challenge) {
  const s = String(password), k = Buffer.alloc(8);
  for (let i = 0; i < 8 && i < s.length; i++) k[i] = REV[s.charCodeAt(i) & 0xff];
  const key = Buffer.concat([k, k, k]);
  try {
    const c = crypto.createCipheriv('des-ede3-ecb', key, null);
    c.setAutoPadding(false);
    return Buffer.concat([c.update(Buffer.from(challenge).subarray(0, 16)), c.final()]);
  } finally { k.fill(0); key.fill(0); }
}

const big = (b) => { const h = Buffer.from(b).toString('hex'); return h ? BigInt('0x' + h) : 0n; };
function bytesOf(n, len) {
  let h = n.toString(16); if (h.length % 2) h = '0' + h;
  const b = Buffer.from(h, 'hex');
  return b.length >= len ? b.subarray(b.length - len) : Buffer.concat([Buffer.alloc(len - b.length), b]);
}
function modPow(base, exp, mod) { let r = 1n, b = base % mod, e = exp; while (e > 0n) { if (e & 1n) r = (r * b) % mod; e >>= 1n; b = (b * b) % mod; } return r; }
/** ARD: `{ generator, prime, serverKey }` (the machine's Buffers) → the 128 encrypted credential bytes + the client's public key. */
function ardResponse({ generator, prime, serverKey }, username, password) {
  const len = prime.length, p = big(prime), g = big(generator);
  if (p < 5n) throw Object.assign(new Error('the machine sent no usable Diffie-Hellman prime'), { code: 'unusable' });
  const x = (big(crypto.randomBytes(len)) % (p - 3n)) + 2n;
  const pub = bytesOf(modPow(g, x, p), len);
  const shared = bytesOf(modPow(big(serverKey), x, p), len);
  const key = crypto.createHash('md5').update(shared).digest();
  const creds = crypto.randomBytes(128);
  const u = Buffer.from(String(username || ''), 'utf8').subarray(0, 63), pw = Buffer.from(String(password), 'utf8');
  const pwCut = pw.subarray(0, 63);
  u.copy(creds, 0); creds[u.length] = 0; pwCut.copy(creds, 64); creds[64 + pwCut.length] = 0;
  try {
    const c = crypto.createCipheriv('aes-128-ecb', key, null);
    c.setAutoPadding(false);
    return Buffer.concat([c.update(creds), c.final(), pub]);
  } finally { creds.fill(0); key.fill(0); shared.fill(0); pw.fill(0); }
}
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const printable = (b) => Buffer.from(b).subarray(0, 200).toString('latin1').replace(/[^ -~]/g, '?');

/**
 * THE GATE over ONE upstream connection. `creds` = { auth, username?, password } — the sealed row, opened for this one
 * connection (the gate drops its reference at its verdict). `toServer(buf)` / `toBrowser(buf)` write; `onEnd(verdict)` is
 * called ONCE: `{ ok: true, type }` — the machine took the sign-in (the browser is being shown a server that asks nothing;
 * `done` turns true once the browser answered it, and from then on every byte is the relay's) | `{ ok: false, code, why }`
 * — `refused` (the machine said no: the password changed there) or `unusable` (an RFB 3.3 server, a refusal before any
 * sign-in, no type the row speaks, a protocol surprise, silence past `boundMs`, the connection closed) — the browser has
 * seen nothing. → { fromServer(buf), fromBrowser(buf), abort(why), get done(), get ended() }
 */
function signInGate(creds, { toServer, toBrowser, onEnd, boundMs = 20000 } = {}) {
  let c = creds;
  let sbuf = Buffer.alloc(0), bbuf = Buffer.alloc(0);
  let phase = 'version', minor = 8, type = null, ended = false, done = false;
  const timer = setTimeout(() => end({ ok: false, code: 'unusable', why: `the machine did not finish the sign-in within ${Math.round(boundMs / 1000)} s` }), boundMs);
  timer.unref?.();
  function end(v) {
    if (ended) return;
    ended = true; clearTimeout(timer); c = null;
    try { onEnd(v); } catch { /* the relay's own */ }
  }
  const take = (n) => { if (sbuf.length < n) return null; const b = sbuf.subarray(0, n); sbuf = sbuf.subarray(n); return b; };
  const peek = (n) => (sbuf.length < n ? null : sbuf.subarray(0, n));
  const unusable = (why) => end({ ok: false, code: 'unusable', why });
  function server() {
    for (;;) {
      if (ended || phase.startsWith('browser')) return;
      if (phase === 'version') {
        const b = take(12); if (!b) return;
        const m = /^RFB (\d{3}\.\d{3})\n$/.exec(b.toString('latin1'));
        const v = m ? D.RFB_VERSIONS[m[1]] : null;
        if (!v) return unusable(m ? `RFB ${m[1]} is not a version the viewer speaks` : 'the machine did not greet as a VNC (RFB) server');
        if (v === '003.003') return unusable('an RFB 3.3 server picks the sign-in itself — the hub does not answer one');
        minor = v === '003.007' ? 7 : 8;
        toServer(Buffer.from(`RFB ${v}\n`, 'latin1'));
        phase = 'types';
      } else if (phase === 'types') {
        const h = peek(1); if (!h) return;
        const n = h[0];
        if (n === 0) {
          const l = peek(5); if (!l) return;
          const len = l.readUInt32BE(1);
          if (sbuf.length < 5 + Math.min(len, 200)) return;
          return unusable(`the machine refused before any sign-in: ${printable(sbuf.subarray(5, 5 + Math.min(len, 200))) || 'no reason given'}`);
        }
        const b = take(1 + n); if (!b) return;
        const types = [...b.subarray(1)];
        type = pickType(c.auth, types);
        if (type === null) return unusable(`the machine no longer offers a sign-in the remembered one speaks (it offers ${types.join(', ')})`);
        toServer(Buffer.from([type]));
        phase = type === 30 ? 'ard' : type === 16 ? 'tight' : 'challenge';
      } else if (phase === 'challenge') {
        const ch = take(16); if (!ch) return;
        toServer(vncResponse(c.password, ch));
        phase = 'result';
      } else if (phase === 'ard') {
        const h = peek(4); if (!h) return;
        const keyLen = h.readUInt16BE(2);
        if (!keyLen || keyLen > 256) return unusable(`the machine's Apple Remote Desktop key length ${keyLen} is not one the hub speaks`); // ≤ 256 B (Apple's is 128): the BigInt exponentiations run on the hub's loop — a 1024-byte prime cost 0.8 s per connection (verify r1)
        const b = take(4 + 2 * keyLen); if (!b) return;
        let out;
        try { out = ardResponse({ generator: b.subarray(0, 2), prime: b.subarray(4, 4 + keyLen), serverKey: b.subarray(4 + keyLen) }, c.username, c.password); }
        catch (e) { return unusable((e && e.message) || 'the Apple Remote Desktop exchange failed'); }
        toServer(out);
        phase = 'result';
      } else if (phase === 'tight') {
        const h = peek(4); if (!h) return;
        const n = h.readUInt32BE(0);
        if (n > 64) return unusable(`TightVNC announced ${n} tunnels`);
        if (!take(4 + 16 * n)) { return; }
        if (n > 0) toServer(u32(0)); // TGHT NOTUNNEL
        phase = 'tight-auth';
      } else if (phase === 'tight-auth') {
        const h = peek(4); if (!h) return;
        const n = h.readUInt32BE(0);
        if (n > 64) return unusable(`TightVNC announced ${n} sign-in kinds`);
        const b = take(4 + 16 * n); if (!b) return;
        if (n === 0) { phase = 'result'; continue; }
        let code = null;
        for (let i = 0; i < n; i++) { const e = b.subarray(4 + 16 * i, 20 + 16 * i); if (e.subarray(4, 16).toString('latin1') === 'STDVVNCAUTH_') code = e.readUInt32BE(0); }
        if (code === null) return unusable('TightVNC offers no VNC-password sign-in');
        toServer(u32(code));
        phase = 'challenge';
      } else if (phase === 'result') {
        const h = peek(4); if (!h) return;
        const status = h.readUInt32BE(0);
        if (status === 0) { take(4); return accepted(); }
        if (minor < 8) { take(4); return end({ ok: false, code: 'refused', why: 'wrong name or password' }); }
        const l = peek(8); if (!l) return;
        const len = l.readUInt32BE(4);
        if (sbuf.length < 8 + Math.min(len, 200)) return;
        return end({ ok: false, code: 'refused', why: printable(sbuf.subarray(8, 8 + Math.min(len, 200))) || 'wrong name or password' });
      } else return;
    }
  }
  /** The machine took it: the browser now meets a server that asks nothing (RFB 3.8, one type: None, SecurityResult OK). */
  function accepted() {
    phase = 'browser-version';
    end({ ok: true, type });
    toBrowser(Buffer.from('RFB 003.008\n', 'latin1'));
    browser();
  }
  function browser() {
    for (;;) {
      if (done) return;
      if (phase === 'browser-version') {
        if (bbuf.length < 12) return;
        bbuf = bbuf.subarray(12);
        toBrowser(Buffer.from([1, 1]));
        phase = 'browser-type';
      } else if (phase === 'browser-type') {
        if (bbuf.length < 1) return;
        bbuf = bbuf.subarray(1);
        toBrowser(u32(0));
        done = true;
        const rest = bbuf; bbuf = Buffer.alloc(0);
        if (rest.length) toServer(rest);                 // the browser's ClientInit (and anything after it)
        const early = sbuf; sbuf = Buffer.alloc(0);
        if (early.length) toBrowser(early);              // nothing is expected before the ClientInit — passed on if it came
        return;
      } else return;
    }
  }
  return {
    fromServer(d) { if (done) return; sbuf = Buffer.concat([sbuf, Buffer.from(d)]); if (!ended) server(); },
    fromBrowser(d) { if (done) return; bbuf = Buffer.concat([bbuf, Buffer.from(d)]); if (phase.startsWith('browser')) browser(); },
    abort(why) { unusable(String(why || 'the sign-in was cut short')); },
    get done() { return done; },
    get ended() { return ended; },
  };
}

module.exports = { AUTHS, HUB_TYPES, rowAuthOf, pickType, namesUser, vncResponse, ardResponse, signInGate };
