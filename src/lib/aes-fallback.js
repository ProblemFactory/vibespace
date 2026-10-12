// THE MAC'S SIGN-IN ON AN INSECURE ORIGIN (lane mac-ard-signin, owner 2026-10-12 "连mac似乎不太成功"): a Mac's Screen
// Sharing offers ARD first (security type 30 — DH + AES-128 over the Mac user's name + password) and noVNC 1.7 encrypts
// those credentials with WebCrypto (node_modules/@novnc/novnc/core/crypto/aes.js: `subtle.importKey('raw', …, 'AES-CBC')`
// then `subtle.encrypt({ name: 'AES-CBC', iv }, …)` block by block). The owner's page is http://<hostname>:3456 — NOT a
// secure context — and there `window.crypto.subtle` does not exist: noVNC's async auth threw, nothing reached the Mac,
// and the status said 连接中… for 268 s.
//
// PURE: an encrypt-only AES (FIPS-197, 128- and 256-bit keys) and the TWO SubtleCrypto calls noVNC's ARD path makes —
// importKey('raw', key, 'AES-CBC' | 'AES-ECB', …) and encrypt({ name, iv }, key, data) — nothing else. AES-CBC answers
// byte for byte what WebCrypto answers (PKCS#7 padding included: noVNC's EAX CMAC reads the block BEFORE the padding
// block); AES-ECB is the plain block-by-block form (whole blocks only). `installSubtleFallback()` defines it as an OWN
// `subtle` property of the page's crypto object ONLY when there is none (the prototype getter is what is absent on
// http) — a secure context never sees it. scripts/test-aes-fallback.mjs checks it against FIPS-197 and node's WebCrypto.

const xtime = (b) => ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 0xff;
const rotl8 = (x, s) => ((x << s) | (x >>> (8 - s))) & 0xff;

/** The S-box, generated (FIPS-197 §5.1.1: the multiplicative inverse in GF(2^8), then the affine map + 0x63). */
export const SBOX = (() => {
  const s = new Uint8Array(256);
  let p = 1, q = 1;
  do {
    p ^= xtime(p); // p × 3
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09; // q ÷ 3
    s[p] = q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63;
  } while (p !== 1);
  s[0] = 0x63;
  return s;
})();

/** The key schedule (FIPS-197 §5.2) → { w: (Nr+1)×16 round-key bytes, nr }. 16- or 32-byte keys only (what Chrome's WebCrypto takes). */
export function expandKey(key) {
  const k = toBytes(key);
  if (k.length !== 16 && k.length !== 32) throw new Error(`AES key must be 128 or 256 bits (got ${k.length * 8})`);
  const nk = k.length / 4, nr = nk + 6;
  const w = new Uint8Array(16 * (nr + 1));
  w.set(k);
  let rcon = 1;
  for (let i = nk; i < 4 * (nr + 1); i++) {
    let t0 = w[4 * i - 4], t1 = w[4 * i - 3], t2 = w[4 * i - 2], t3 = w[4 * i - 1];
    if (i % nk === 0) { const u = t0; t0 = SBOX[t1] ^ rcon; t1 = SBOX[t2]; t2 = SBOX[t3]; t3 = SBOX[u]; rcon = xtime(rcon); }
    else if (nk > 6 && i % nk === 4) { t0 = SBOX[t0]; t1 = SBOX[t1]; t2 = SBOX[t2]; t3 = SBOX[t3]; }
    const j = 4 * (i - nk);
    w[4 * i] = w[j] ^ t0; w[4 * i + 1] = w[j + 1] ^ t1; w[4 * i + 2] = w[j + 2] ^ t2; w[4 * i + 3] = w[j + 3] ^ t3;
  }
  return { w, nr };
}

/** One 16-byte block through the cipher (FIPS-197 §5.1); `out` may be `block`. */
export function encryptBlock({ w, nr }, block, out = new Uint8Array(16)) {
  const s = new Uint8Array(16), t = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = block[i] ^ w[i];
  for (let r = 1; r <= nr; r++) {
    for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) t[row + 4 * c] = SBOX[s[row + 4 * ((c + row) % 4)]]; // SubBytes + ShiftRows
    if (r < nr) {
      for (let c = 0; c < 4; c++) { // MixColumns
        const a0 = t[4 * c], a1 = t[4 * c + 1], a2 = t[4 * c + 2], a3 = t[4 * c + 3], x = a0 ^ a1 ^ a2 ^ a3;
        t[4 * c] = a0 ^ x ^ xtime(a0 ^ a1); t[4 * c + 1] = a1 ^ x ^ xtime(a1 ^ a2); t[4 * c + 2] = a2 ^ x ^ xtime(a2 ^ a3); t[4 * c + 3] = a3 ^ x ^ xtime(a3 ^ a0);
      }
    }
    for (let i = 0; i < 16; i++) s[i] = t[i] ^ w[16 * r + i]; // AddRoundKey
  }
  out.set(s);
  return out;
}

/** AES-CBC with PKCS#7 padding — the bytes WebCrypto's encrypt({ name: 'AES-CBC', iv }) answers (always one more block when the input is whole blocks). */
export function cbcEncrypt(schedule, iv, data) {
  const d = toBytes(data), v = toBytes(iv);
  if (v.length !== 16) throw new Error('AES-CBC needs a 16-byte iv');
  const pad = 16 - (d.length % 16);
  const out = new Uint8Array(d.length + pad);
  out.set(d); out.fill(pad, d.length);
  let prev = v;
  for (let o = 0; o < out.length; o += 16) {
    const b = out.subarray(o, o + 16);
    for (let i = 0; i < 16; i++) b[i] ^= prev[i];
    encryptBlock(schedule, b, b);
    prev = b;
  }
  return out;
}

/** AES-ECB: each whole block on its own, no padding. */
export function ecbEncrypt(schedule, data) {
  const out = Uint8Array.from(toBytes(data));
  if (out.length % 16) throw new Error('AES-ECB takes whole 16-byte blocks');
  for (let o = 0; o < out.length; o += 16) encryptBlock(schedule, out.subarray(o, o + 16), out.subarray(o, o + 16));
  return out;
}

function toBytes(d) {
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  if (Array.isArray(d)) return Uint8Array.from(d);
  throw new TypeError('expected an ArrayBuffer or a typed array');
}

const NAMES = ['AES-CBC', 'AES-ECB'];
const schedules = new WeakMap(); // key object → its round keys (the raw key is never readable off the object)
const nameOf = (a) => String((a && typeof a === 'object' ? a.name : a) || '').toUpperCase();

/** The two SubtleCrypto calls noVNC's ARD sign-in makes, with WebCrypto's shapes (promises, an opaque key, ArrayBuffer answers). */
export const SUBTLE_FALLBACK = Object.freeze({
  async importKey(format, keyData, algorithm, extractable, usages) {
    const name = nameOf(algorithm);
    if (format !== 'raw') throw new Error(`importKey: only the raw format (got ${format})`);
    if (!NAMES.includes(name)) throw new Error(`importKey: only ${NAMES.join(' / ')} (got ${name || 'nothing'})`);
    const schedule = expandKey(keyData);
    const key = Object.freeze({ type: 'secret', extractable: false, algorithm: Object.freeze({ name, length: (schedule.nr - 6) * 32 }), usages: Object.freeze([...(usages || [])]) });
    schedules.set(key, schedule);
    return key;
  },
  async encrypt(algorithm, key, data) {
    const name = nameOf(algorithm), schedule = schedules.get(key);
    if (!schedule) throw new Error('encrypt: not a key this fallback imported');
    if (name !== key.algorithm.name) throw new Error(`encrypt: the key is ${key.algorithm.name}, not ${name}`);
    const out = name === 'AES-CBC' ? cbcEncrypt(schedule, algorithm.iv, data) : ecbEncrypt(schedule, data);
    return out.buffer;
  },
});

/** Define SUBTLE_FALLBACK as `crypto.subtle` when the page has none (an insecure origin). → true when installed. */
export function installSubtleFallback(c = globalThis.crypto) {
  if (!c || c.subtle) return false;
  Object.defineProperty(c, 'subtle', { value: SUBTLE_FALLBACK, configurable: true });
  return true;
}
