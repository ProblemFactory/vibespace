'use strict';
/**
 * THE PASSKEY SIGNER — PURE (imports nothing; node's crypto is HANDED IN `{ crypto }`, as in agentd-signature.js). Lane
 * passkey-sink, 2026-10-25 (P2 of the custom browser kernel — docs/design-custom-browser-plugin.zh.md §3): on a kernel whose
 * `features` list `webauthn` the ceremony comes to VibeSpace as `VibeSpace.webauthnRequest`; the kernel only TRANSPORTS it
 * (no OS / GPM authenticator, no CDP virtual authenticator) and VibeSpace IS the authenticator — it signs here, with the key
 * the passkey store keeps sealed (src/browser-passkey-store.js `keySealed`: a PKCS#8 P-256 key, the shape the virtual
 * authenticator handed us — a row registered on standard Chrome signs here unchanged).
 *
 *   authenticatorData   rpIdHash (32) ‖ flags (1) ‖ signCount (4, big-endian) [‖ aaguid (16) ‖ idLength (2) ‖ credentialId ‖
 *                       the COSE public key] — WebAuthn L3 §6.1; the flag bits are the CALLER's (`up` · `uv` · `be` · `bs` ·
 *                       `at`): this module never decides user verification (the watch does — the owner's answer, never auto)
 *   assertion           ES256 over authenticatorData ‖ clientDataHash → the DER signature the page hands the relying party
 *   makeCredential      a fresh P-256 pair, credentialId = 32 random bytes, the COSE key, attestationObject with fmt 'none'
 *                       (an empty attStmt: nothing is signed at registration, so the challenge is not an input — it rides
 *                       the clientDataJSON the kernel hashes)
 *   cbor                the minimal encoder those need — uint / negative int / bytes / text / array / map, maps in the
 *                       canonical order (shorter key first, then bytewise: CTAP2 §6 / RFC 7049 §3.9); anything else throws
 *   requestVerdict      VibeSpace re-checks the request itself, never trusting the kernel: the rpId may be used by the
 *                       origin (`rpMatches` is injected — browser-passkey-store's), the clientDataJSON (when the kernel hands
 *                       it) hashes to the clientDataHash it asks us to sign and names THIS ceremony (type, origin,
 *                       challenge); a registration offers ES256 (−7) → null | 'webauthn_rp_mismatch' | 'webauthn_alg_unsupported'
 *
 * Every binary input is a Buffer / Uint8Array or base64(url) text; every output a Buffer (the watch b64url-encodes them).
 * scripts/test-webauthn-sign.mjs pins the bytes (and verifies every assertion with node's crypto.verify).
 */

const ES256 = -7;
const FLAG_BITS = Object.freeze({ up: 0x01, uv: 0x04, be: 0x08, bs: 0x10, at: 0x40 });
const AAGUID_NONE = Object.freeze(new Array(16).fill(0));
const ID_BYTES = 32;
const ID_MIN = 16;
const ID_MAX = 1023;
const COUNT_MAX = 0xffffffff;
const CLIENT_DATA_MAX = 8192;

const need = (crypto) => { if (!crypto || typeof crypto.createHash !== 'function' || typeof crypto.sign !== 'function') throw new Error('webauthn-sign: hand in node crypto ({ crypto })'); return crypto; };
/** A binary input: bytes as they are, or base64 / base64url text (Buffer.from reads both). `len` = the exact length wanted. */
function bytes(v, len = 0, what = 'a value') {
  let b;
  if (Buffer.isBuffer(v)) b = v;
  else if (v instanceof Uint8Array) b = Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  else if (typeof v === 'string' && /^[A-Za-z0-9+/_-]*={0,2}$/.test(v)) b = Buffer.from(v, 'base64');
  else throw new TypeError(`webauthn-sign: ${what} is not bytes or base64 text`);
  if (len && b.length !== len) throw new RangeError(`webauthn-sign: ${what} is ${b.length} bytes, not ${len}`);
  return b;
}
const b64u = (b) => Buffer.from(b).toString('base64url');

// ── the CBOR encoder (RFC 8949: major types 0–5 only) ──
function head(major, n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('webauthn-sign: a CBOR length / integer out of range');
  const m = major << 5;
  if (n < 24) return Buffer.from([m | n]);
  if (n < 0x100) return Buffer.from([m | 24, n]);
  if (n < 0x10000) { const b = Buffer.alloc(3); b[0] = m | 25; b.writeUInt16BE(n, 1); return b; }
  if (n <= 0xffffffff) { const b = Buffer.alloc(5); b[0] = m | 26; b.writeUInt32BE(n, 1); return b; }
  const b = Buffer.alloc(9); b[0] = m | 27; b.writeUInt32BE(Math.floor(n / 0x100000000), 1); b.writeUInt32BE(n % 0x100000000, 5); return b;
}
/** cbor(value) → Buffer: a safe integer (≥ 0 major 0, < 0 major 1), bytes (major 2), a string (major 3, UTF-8), an Array
 *  (major 4), a Map or a plain object (major 5 — keys in canonical order, a duplicate throws). Nothing else. */
function cbor(v) {
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) throw new TypeError('webauthn-sign: CBOR here takes integers only');
    return v >= 0 ? head(0, v) : head(1, -1 - v);
  }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) { const b = bytes(v); return Buffer.concat([head(2, b.length), b]); }
  if (typeof v === 'string') { const b = Buffer.from(v, 'utf8'); return Buffer.concat([head(3, b.length), b]); }
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
  const entries = v instanceof Map ? [...v.entries()] : v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype ? Object.entries(v) : null;
  if (!entries) throw new TypeError(`webauthn-sign: CBOR cannot encode ${v === null ? 'null' : typeof v}`);
  const pairs = entries.map(([k, x]) => [cbor(k), cbor(x)]).sort(([a], [b]) => a.length - b.length || Buffer.compare(a, b));
  for (let i = 1; i < pairs.length; i++) if (pairs[i][0].equals(pairs[i - 1][0])) throw new Error('webauthn-sign: a CBOR map with a duplicate key');
  return Buffer.concat([head(5, pairs.length), ...pairs.flat()]);
}

// ── the key ──
/** The PKCS#8 private key as a KeyObject — P-256 only (the store's every row; anything else is not ours to sign with). */
function privateKeyOf(crypto, pkcs8) {
  const k = crypto.createPrivateKey({ key: bytes(pkcs8, 0, 'the private key'), format: 'der', type: 'pkcs8' });
  if (k.asymmetricKeyType !== 'ec' || !k.asymmetricKeyDetails || k.asymmetricKeyDetails.namedCurve !== 'prime256v1') throw new Error('webauthn-sign: the key is not a P-256 key');
  return k;
}
/** The COSE_Key of a P-256 public key (RFC 9053: kty 2 EC2, alg −7 ES256, crv 1 P-256, x, y). */
function coseKeyOf(publicKey) {
  const j = publicKey.export({ format: 'jwk' });
  return cbor(new Map([[1, 2], [3, ES256], [-1, 1], [-2, Buffer.from(j.x, 'base64url')], [-3, Buffer.from(j.y, 'base64url')]]));
}
/** The public half of a stored key, as COSE (what the relying party was handed at registration) and as a KeyObject. */
function publicKeyOf({ crypto, privateKeyPkcs8 } = {}) {
  const c = need(crypto);
  const pub = c.createPublicKey(privateKeyOf(c, privateKeyPkcs8));
  return { publicKey: pub, publicKeyCose: coseKeyOf(pub) };
}

// ── the authenticator ──
/** authenticatorData → Buffer. `flags` = { up, uv, be, bs, at } (booleans — the caller's); `at` iff `attested`
 *  ({ credentialId, publicKeyCose, aaguid? — 16 zero bytes when absent }); BS never without BE; signCount a uint32. */
function authenticatorData({ crypto, rpId, flags = {}, signCount = 0, attested = null } = {}) {
  const c = need(crypto);
  const rp = typeof rpId === 'string' ? rpId : '';
  if (!rp || rp.length > 253) throw new TypeError('webauthn-sign: an rpId is required');
  if (!!flags.at !== !!attested) throw new Error('webauthn-sign: the AT flag and the attested credential data go together');
  if (flags.bs && !flags.be) throw new Error('webauthn-sign: BS (backed up) without BE (backup eligible)');
  const n = Number(signCount);
  if (!Number.isInteger(n) || n < 0 || n > COUNT_MAX) throw new RangeError('webauthn-sign: signCount is a uint32');
  let bits = 0;
  for (const [k, bit] of Object.entries(FLAG_BITS)) if (flags[k]) bits |= bit;
  const fixed = Buffer.alloc(37);
  c.createHash('sha256').update(rp, 'utf8').digest().copy(fixed, 0);
  fixed[32] = bits;
  fixed.writeUInt32BE(n, 33);
  if (!attested) return fixed;
  const aaguid = attested.aaguid ? bytes(attested.aaguid, 16, 'the AAGUID') : Buffer.from(AAGUID_NONE);
  const id = bytes(attested.credentialId, 0, 'the credential id');
  if (id.length < ID_MIN || id.length > ID_MAX) throw new RangeError('webauthn-sign: a credential id is 16–1023 bytes');
  const len = Buffer.alloc(2); len.writeUInt16BE(id.length, 0);
  return Buffer.concat([fixed, aaguid, len, id, bytes(attested.publicKeyCose, 0, 'the COSE key')]);
}
/** A sign-in: ES256 over authenticatorData ‖ clientDataHash with the stored key → { signature } (DER, as WebAuthn wants). */
function assertion({ crypto, privateKeyPkcs8, clientDataHash, authenticatorData: ad } = {}) {
  const c = need(crypto);
  const data = bytes(ad, 0, 'the authenticator data');
  if (data.length < 37) throw new RangeError('webauthn-sign: the authenticator data is shorter than 37 bytes');
  const msg = Buffer.concat([data, bytes(clientDataHash, 32, 'the clientDataHash')]);
  return { signature: c.sign('sha256', msg, { key: privateKeyOf(c, privateKeyPkcs8), dsaEncoding: 'der' }) };
}
/** A registration: the new key pair (or `privateKeyPkcs8` — the suites pin bytes with one), credentialId (32 random bytes
 *  unless handed in), the COSE key, signCount 0, attestationObject {fmt:'none', attStmt:{}, authData}. `flags` are the
 *  caller's (`at` is set here). → { credentialId, privateKeyPkcs8 (DER — the caller seals it), publicKeyCose,
 *  authenticatorData, attestationObject, userHandle (user.id's bytes, or null) }. */
function makeCredential({ crypto, rpId, user = null, flags = {}, privateKeyPkcs8 = null, credentialId = null, aaguid = null } = {}) {
  const c = need(crypto);
  const key = privateKeyPkcs8 ? privateKeyOf(c, privateKeyPkcs8) : c.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  const id = credentialId ? bytes(credentialId, 0, 'the credential id') : c.randomBytes(ID_BYTES);
  const publicKeyCose = coseKeyOf(c.createPublicKey(key));
  const authData = authenticatorData({ crypto: c, rpId, flags: { ...flags, at: true }, signCount: 0, attested: { credentialId: id, publicKeyCose, aaguid } });
  const attestationObject = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
  const userHandle = user && user.id ? bytes(user.id, 0, 'the user handle') : null;
  if (userHandle && (!userHandle.length || userHandle.length > 64)) throw new RangeError('webauthn-sign: a user handle is 1–64 bytes');
  return { credentialId: id, privateKeyPkcs8: key.export({ format: 'der', type: 'pkcs8' }), publicKeyCose, authenticatorData: authData, attestationObject, userHandle };
}

// ── the request, re-checked ──
/** May VibeSpace make a key the page will accept? An empty / absent list = the platform defaults (ES256 among them). */
function algSupported(params) {
  const list = Array.isArray(params) ? params : [];
  return !list.length || list.some((p) => p && (p.type === undefined || p.type === 'public-key') && Number(p.alg) === ES256);
}
/** The clientDataJSON the kernel hashed, when it hands it: the hash recomputed, and the JSON names THIS ceremony.
 *  → null (consistent, or nothing to check) | the first mismatch: 'hash' · 'json' · 'type' · 'origin' · 'challenge'. */
function clientDataVerdict({ crypto, clientDataJSON = null, clientDataHash, origin, op, challenge = null } = {}) {
  if (clientDataJSON === null || clientDataJSON === undefined || clientDataJSON === '') return null;
  const c = need(crypto);
  let json, hash;
  try { json = bytes(clientDataJSON, 0, 'the clientDataJSON'); hash = bytes(clientDataHash, 32, 'the clientDataHash'); } catch { return 'hash'; }
  if (json.length > CLIENT_DATA_MAX || !c.createHash('sha256').update(json).digest().equals(hash)) return 'hash';
  let o = null; try { o = JSON.parse(json.toString('utf8')); } catch { return 'json'; }
  if (!o || typeof o !== 'object') return 'json';
  if (o.type !== (op === 'create' ? 'webauthn.create' : 'webauthn.get')) return 'type';
  if (String(o.origin) !== String(origin)) return 'origin';
  if (challenge && String(o.challenge) !== String(challenge)) return 'challenge';
  return null;
}
/** THE RE-CHECK before any gate: the request is the page's own (never trusting the kernel) and signable by us.
 *  `req` = browser-passkey's kernelEvent shape; `rpMatches(origin, rpId)` is injected (browser-passkey-store's rule).
 *  → null | 'webauthn_rp_mismatch' | 'webauthn_alg_unsupported'. */
function requestVerdict({ crypto, req, rpMatches } = {}) {
  if (typeof rpMatches !== 'function') throw new TypeError('webauthn-sign: requestVerdict needs the rpMatches rule handed in');
  if (!req || !rpMatches(req.origin, req.rpId)) return 'webauthn_rp_mismatch';
  if (clientDataVerdict({ crypto, clientDataJSON: req.clientDataJSON, clientDataHash: req.clientDataHash, origin: req.origin, op: req.op, challenge: req.challenge })) return 'webauthn_rp_mismatch';
  if (req.op === 'create' && !algSupported(req.pubKeyCredParams)) return 'webauthn_alg_unsupported';
  return null;
}

module.exports = { ES256, FLAG_BITS, ID_BYTES, cbor, bytes, b64u, authenticatorData, assertion, makeCredential, publicKeyOf, algSupported, clientDataVerdict, requestVerdict };
