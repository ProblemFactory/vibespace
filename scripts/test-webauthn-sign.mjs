#!/usr/bin/env node
// LANE PASSKEY-SINK (2026-10-25, P2 of the custom browser kernel — docs/design-custom-browser-plugin.zh.md §3): THE PASSKEY
// SIGNER, PURE (src/webauthn-sign.js imports nothing; node crypto handed in). On a kernel with `webauthn` VibeSpace IS the
// authenticator: these are the bytes a relying party checks. Fast tier, in-process:
//   ① CBOR: RFC 8949 Appendix A's vectors (uint / negative / bytes / text / array / map), the canonical map order, what throws
//   ② authenticatorData: rpIdHash = sha256(rpId) (the well-known example.com vector), every flag bit, signCount big-endian,
//      the attested block (AAGUID, length, id, COSE key); the shapes that throw
//   ③ assertion: ES256 / DER, verified with node's crypto.verify against the public half; one flipped byte, another hash,
//      another key ⇒ it does not verify; a key that is not P-256 throws
//   ④ makeCredential: attestation 'none' BYTES PINNED (a pinned key + id), decoded by THIS suite's own CBOR reader field by
//      field; the COSE key = the key's public half; a fresh credential = 32 random bytes, a new key each time
//   ⑤ the sign count over the store's own rules (bump → reconcile): every signature's count strictly above the last
//   ⑥ the re-check (never trusting the kernel): algSupported, clientDataVerdict, requestVerdict — one example per row
//   ⑦ PURE: the module imports nothing
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SRC = new URL('../src/webauthn-sign.js', import.meta.url).pathname;
const WA = require(SRC);
const PS = require('../src/browser-passkey-store.js');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const hex = (b) => Buffer.from(b).toString('hex');

// a pinned P-256 test key (synthetic — made for this suite, never a person's) and its id
const KEY = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgIgCfp5g8T9s2txaqiZkkTkErZfGUXrp0ebug2II626ChRANCAATVgrF8L8h3ztJrDvaWN8VtYLPiXERmAbZItChsYV6YHDQyMmCmesQnwt4HakUKpsBau/53dZld6BB/RZyr0Lh1';
const ID = Buffer.from([...Array(32).keys()]);
const RPHASH = 'a379a6f6eeafb9a55e378c118034e2751e682fab9f2d30ab13d2125586ce1947'; // sha256('example.com') — the WebAuthn spec's examples
const COSE = 'a5010203262001215820d582b17c2fc877ced26b0ef69637c56d60b3e25c446601b648b4286c615e981c22582034323260a67ac427c2de076a450aa6c05abbfe7775995de8107f459cabd0b875';
const ATTESTATION = 'a363666d74646e6f6e656761747453746d74a068617574684461746158a4' + RPHASH + '45' + '00000000' + '00'.repeat(16) + '0020' + hex(ID) + COSE;

/** THIS suite's own CBOR reader (major types 0–5) — the module's encoder is never used to check itself. */
function decode(buf) {
  let i = 0;
  const arg = (ai) => { if (ai < 24) return ai; const n = { 24: 1, 25: 2, 26: 4, 27: 8 }[ai]; if (!n) throw new Error('ai ' + ai); let v = 0; for (let k = 0; k < n; k++) v = v * 256 + buf[i++]; return v; };
  const item = () => {
    const b = buf[i++], major = b >> 5, n = arg(b & 31);
    if (major === 0) return n;
    if (major === 1) return -1 - n;
    if (major === 2) { const v = buf.subarray(i, i + n); i += n; return Buffer.from(v); }
    if (major === 3) { const v = buf.subarray(i, i + n).toString('utf8'); i += n; return v; }
    if (major === 4) return Array.from({ length: n }, item);
    if (major === 5) { const m = new Map(); for (let k = 0; k < n; k++) { const key = item(); m.set(key, item()); } return m; }
    throw new Error('major ' + major);
  };
  const v = item();
  if (i !== buf.length) throw new Error('trailing bytes');
  return v;
}

console.log('① CBOR (RFC 8949 Appendix A)');
{
  const V = [[0, '00'], [1, '01'], [10, '0a'], [23, '17'], [24, '1818'], [25, '1819'], [100, '1864'], [1000, '1903e8'], [1000000, '1a000f4240'], [1000000000000, '1b000000e8d4a51000'],
    [-1, '20'], [-10, '29'], [-100, '3863'], [-1000, '3903e7'], [Buffer.alloc(0), '40'], [Buffer.from([1, 2, 3, 4]), '4401020304'], ['', '60'], ['a', '6161'], ['IETF', '6449455446'],
    ['ü', '62c3bc'], ['水', '63e6b0b4'], [[], '80'], [[1, 2, 3], '83010203'], [[1, [2, 3], [4, 5]], '8301820203820405'], [new Map(), 'a0'], [new Map([[1, 2], [3, 4]]), 'a201020304'],
    [{ a: 1, b: [2, 3] }, 'a26161016162820203'], [['a', { b: 'c' }], '826161a161626163'], [new Uint8Array([9]), '4109']];
  const bad = V.filter(([v, h]) => hex(WA.cbor(v)) !== h).map(([v, h]) => `${JSON.stringify(v)} ⇒ ${hex(WA.cbor(v))} (want ${h})`);
  ok(bad.length === 0, `${V.length} RFC 8949 vectors byte for byte (uint 0 … 10^12, negative, bytes, text incl. UTF-8, arrays, maps)`, bad);
  ok(hex(WA.cbor(new Map([[3, 4], [1, 2]]))) === 'a201020304' && hex(WA.cbor(new Map([['bb', 1], ['a', 2]]))) === 'a2616102626262' + '01' && hex(WA.cbor(new Map([[-1, 0], [1, 0]]))) === 'a2010020' + '00',
    'maps are written in the CANONICAL order whatever the insertion order (shorter key first, then bytewise — CTAP2 §6)', [hex(WA.cbor(new Map([[3, 4], [1, 2]]))), hex(WA.cbor(new Map([['bb', 1], ['a', 2]])))]);
  ok([null, true, 1.5, undefined, NaN, Number.MAX_SAFE_INTEGER + 2, () => 1].every((x) => throws(() => WA.cbor(x))) && throws(() => WA.cbor(new Map([[Buffer.from('k'), 1], [Buffer.from('k'), 2]]))) && throws(() => WA.cbor(new Date())),
    'anything else throws (null, booleans, floats, unsafe integers, functions, objects that are not plain, a duplicate key)');
  ok(decode(WA.cbor({ a: [1, -7, Buffer.from('xy')] })).get('a')[2].toString() === 'xy', 'this suite\'s reader reads the encoder\'s output back');
}

console.log('② authenticatorData');
{
  const ad = (o) => WA.authenticatorData({ crypto, rpId: 'example.com', flags: { up: true }, ...o });
  ok(hex(ad({ signCount: 0x01020304 })) === RPHASH + '01' + '01020304' && ad().length === 37, 'rpIdHash (sha256 of example.com — the spec\'s vector) ‖ flags ‖ signCount big-endian = 37 bytes');
  const F = [[{}, 0x00], [{ up: true }, 0x01], [{ up: true, uv: true }, 0x05], [{ up: true, be: true }, 0x09], [{ up: true, uv: true, be: true, bs: true }, 0x1d]];
  const fb = F.filter(([f, b]) => ad({ flags: f })[32] !== b).map(([f, b]) => `${JSON.stringify(f)} ⇒ ${ad({ flags: f })[32]} (want ${b})`);
  ok(fb.length === 0 && WA.FLAG_BITS.up === 1 && WA.FLAG_BITS.uv === 4 && WA.FLAG_BITS.be === 8 && WA.FLAG_BITS.bs === 16 && WA.FLAG_BITS.at === 64, 'every flag bit at its place (UP 0x01 · UV 0x04 · BE 0x08 · BS 0x10 · AT 0x40) — the caller\'s, never decided here', fb);
  const att = WA.authenticatorData({ crypto, rpId: 'example.com', flags: { up: true, at: true }, signCount: 0, attested: { credentialId: ID, publicKeyCose: Buffer.from(COSE, 'hex') } });
  ok(hex(att) === RPHASH + '41' + '00000000' + '00'.repeat(16) + '0020' + hex(ID) + COSE, 'the attested block: AAGUID (16 zero bytes) ‖ id length (2, big-endian) ‖ id ‖ the COSE key; AT set');
  ok(hex(WA.authenticatorData({ crypto, rpId: 'example.com', flags: { up: true, at: true }, attested: { credentialId: ID, publicKeyCose: Buffer.from(COSE, 'hex'), aaguid: Buffer.alloc(16, 0xab) } })).slice(74, 106) === 'ab'.repeat(16), 'an AAGUID handed in is written as given');
  ok(throws(() => ad({ flags: { at: true } })) && throws(() => WA.authenticatorData({ crypto, rpId: 'example.com', flags: { up: true }, attested: { credentialId: ID, publicKeyCose: Buffer.from(COSE, 'hex') } }))
    && throws(() => ad({ flags: { up: true, bs: true } })) && throws(() => ad({ signCount: -1 })) && throws(() => ad({ signCount: 2 ** 32 })) && throws(() => ad({ signCount: 1.5 }))
    && throws(() => WA.authenticatorData({ crypto, rpId: '', flags: {} })) && throws(() => WA.authenticatorData({ rpId: 'example.com' }))
    && throws(() => WA.authenticatorData({ crypto, rpId: 'example.com', flags: { at: true }, attested: { credentialId: Buffer.alloc(8), publicKeyCose: Buffer.from(COSE, 'hex') } })),
    'what throws: AT without the attested block (and the other way), BS without BE, a count outside uint32, no rpId, no crypto handed in, an id under 16 bytes');
}

console.log('③ assertion (ES256)');
{
  const pub = WA.publicKeyOf({ crypto, privateKeyPkcs8: KEY }).publicKey;
  const ad = WA.authenticatorData({ crypto, rpId: 'example.com', flags: { up: true, uv: true }, signCount: 7 });
  const cdh = crypto.createHash('sha256').update('{"type":"webauthn.get","challenge":"AAAA","origin":"https://example.com"}').digest();
  const { signature } = WA.assertion({ crypto, privateKeyPkcs8: KEY, clientDataHash: cdh, authenticatorData: ad });
  const verify = (sig, a = ad, h = cdh, key = pub) => crypto.verify('sha256', Buffer.concat([a, h]), key, sig);
  ok(signature[0] === 0x30 && verify(signature), 'the signature is DER and VERIFIES (node crypto.verify, the key\'s public half) over authenticatorData ‖ clientDataHash');
  ok(verify(WA.assertion({ crypto, privateKeyPkcs8: Buffer.from(KEY, 'base64'), clientDataHash: cdh.toString('base64url'), authenticatorData: ad.toString('base64url') }).signature), 'bytes and base64(url) text are the same inputs');
  const flipped = Buffer.from(ad); flipped[36] ^= 1;
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey;
  ok(!verify(signature, flipped) && !verify(signature, ad, crypto.randomBytes(32)) && !verify(signature, ad, cdh, other), 'one flipped byte, another clientDataHash, another key ⇒ it does not verify');
  const p384 = crypto.generateKeyPairSync('ec', { namedCurve: 'P-384' }).privateKey.export({ format: 'der', type: 'pkcs8' });
  const ed = crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' });
  ok(throws(() => WA.assertion({ crypto, privateKeyPkcs8: p384, clientDataHash: cdh, authenticatorData: ad })) && throws(() => WA.assertion({ crypto, privateKeyPkcs8: ed, clientDataHash: cdh, authenticatorData: ad }))
    && throws(() => WA.assertion({ crypto, privateKeyPkcs8: KEY, clientDataHash: Buffer.alloc(31), authenticatorData: ad })) && throws(() => WA.assertion({ crypto, privateKeyPkcs8: KEY, clientDataHash: cdh, authenticatorData: Buffer.alloc(36) })),
    'a key that is not P-256 (P-384, Ed25519), a hash that is not 32 bytes, authenticator data under 37 bytes ⇒ throws');
}

console.log('④ makeCredential (attestation none)');
{
  const m = WA.makeCredential({ crypto, rpId: 'example.com', flags: { up: true, uv: true }, privateKeyPkcs8: KEY, credentialId: ID, user: { id: Buffer.from('user-1') } });
  ok(hex(m.attestationObject) === ATTESTATION, 'the attestationObject BYTES (pinned key + id, UP|UV|AT): {fmt:"none", attStmt:{}, authData} in canonical order', hex(m.attestationObject));
  const o = decode(m.attestationObject), authData = o.get('authData');
  ok([...o.keys()].join() === 'fmt,attStmt,authData' && o.get('fmt') === 'none' && o.get('attStmt') instanceof Map && o.get('attStmt').size === 0, 'read back by this suite\'s own reader: fmt none, an EMPTY attStmt');
  const cose = decode(authData.subarray(37 + 16 + 2 + 32)), jwk = WA.publicKeyOf({ crypto, privateKeyPkcs8: KEY }).publicKey.export({ format: 'jwk' });
  ok(hex(authData.subarray(0, 32)) === RPHASH && authData[32] === 0x45 && authData.readUInt32BE(33) === 0 && authData.readUInt16BE(53) === 32 && authData.subarray(55, 87).equals(ID), 'authData: rpIdHash, flags UP|UV|AT (0x45), signCount 0, id length 32, the id');
  ok(cose.get(1) === 2 && cose.get(3) === -7 && cose.get(-1) === 1 && cose.get(-2).toString('base64url') === jwk.x && cose.get(-3).toString('base64url') === jwk.y && hex(m.publicKeyCose) === COSE, 'the COSE key = the key\'s PUBLIC half (kty EC2, alg ES256, crv P-256, x, y)');
  ok(m.userHandle.toString() === 'user-1' && crypto.createPrivateKey({ key: m.privateKeyPkcs8, format: 'der', type: 'pkcs8' }).asymmetricKeyDetails.namedCurve === 'prime256v1', 'the user handle\'s bytes and the PKCS#8 private key (P-256) come back for the caller to seal');
  const a = WA.makeCredential({ crypto, rpId: 'example.com', flags: { up: true } }), b = WA.makeCredential({ crypto, rpId: 'example.com', flags: { up: true } });
  ok(a.credentialId.length === WA.ID_BYTES && WA.ID_BYTES === 32 && !a.credentialId.equals(b.credentialId) && !a.publicKeyCose.equals(b.publicKeyCose) && a.userHandle === null, 'a fresh credential: 32 random bytes, a new key every time');
  const s = WA.assertion({ crypto, privateKeyPkcs8: a.privateKeyPkcs8, clientDataHash: Buffer.alloc(32, 1), authenticatorData: WA.authenticatorData({ crypto, rpId: 'example.com', flags: { up: true }, signCount: 1 }) });
  const pa = decode(a.publicKeyCose), pubA = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pa.get(-2).toString('base64url'), y: pa.get(-3).toString('base64url') }, format: 'jwk' });
  ok(crypto.verify('sha256', Buffer.concat([WA.authenticatorData({ crypto, rpId: 'example.com', flags: { up: true }, signCount: 1 }), Buffer.alloc(32, 1)]), pubA, s.signature), 'a sign-in with the new key verifies against the COSE key the relying party was handed at registration');
  ok(throws(() => WA.makeCredential({ crypto, rpId: 'example.com', user: { id: Buffer.alloc(65) } })) && throws(() => WA.makeCredential({ rpId: 'example.com' })), 'a user handle over 64 bytes, no crypto ⇒ throws');
}

console.log('⑤ the sign count (the store\'s bump → reconcile)');
{
  let row = { signCount: 4, uses: 0, lastUsedAt: 0 };
  const seen = [];
  for (let i = 0; i < 5; i++) { const used = PS.reconcile(PS.bumpSignCount(row).row, 0, 1000 + i); seen.push(WA.authenticatorData({ crypto, rpId: 'example.com', flags: { up: true }, signCount: used.signCount }).readUInt32BE(33)); row = used; }
  ok(seen.join() === '5,6,7,8,9' && row.signCount === 9 && row.uses === 5, 'each signature\'s count is strictly above the last, and the row written carries exactly the count signed', seen);
}

console.log('⑥ the re-check — never trusting the kernel');
{
  const cdj = (o) => Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: 'Q2hhbGxlbmdl', origin: 'https://example.com', crossOrigin: false, ...o })).toString('base64url');
  const h = (j) => crypto.createHash('sha256').update(Buffer.from(j, 'base64url')).digest('base64url');
  const req = (o = {}) => { const j = o.clientDataJSON === undefined ? cdj(o.cd || {}) : o.clientDataJSON; return { op: 'get', rpId: 'example.com', origin: 'https://example.com', challenge: 'Q2hhbGxlbmdl', clientDataJSON: j, clientDataHash: o.hash || (j ? h(j) : crypto.randomBytes(32).toString('base64url')), pubKeyCredParams: [], ...o.req }; };
  const RV = (r) => WA.requestVerdict({ crypto, req: r, rpMatches: PS.rpMatches });
  const T = [
    ['the page\'s own request (the JSON hashes to the hash, names this ceremony)', req(), null],
    ['no clientDataJSON handed (a kernel that keeps it) — the hash alone, the origin / rpId rule still asked', req({ clientDataJSON: null }), null],
    ['an rpId the origin may not use', req({ req: { rpId: 'other.com' } }), 'webauthn_rp_mismatch'],
    ['a public suffix as the rpId', req({ req: { rpId: 'co.uk', origin: 'https://a.co.uk' } }), 'webauthn_rp_mismatch'],
    ['the JSON names ANOTHER origin than the request (the kernel lied or erred)', req({ cd: { origin: 'https://evil.test' } }), 'webauthn_rp_mismatch'],
    ['the JSON does not hash to the clientDataHash we are asked to sign', req({ hash: crypto.randomBytes(32).toString('base64url') }), 'webauthn_rp_mismatch'],
    ['the JSON is a create\'s while the request is a get', req({ cd: { type: 'webauthn.create' } }), 'webauthn_rp_mismatch'],
    ['the JSON carries another challenge', req({ cd: { challenge: 'b3RoZXI' } }), 'webauthn_rp_mismatch'],
    ['a registration offering ES256 (−7) among others', req({ cd: { type: 'webauthn.create' }, req: { op: 'create', pubKeyCredParams: [{ type: 'public-key', alg: -257 }, { type: 'public-key', alg: -7 }] } }), null],
    ['a registration offering no ES256 (RS256 only)', req({ cd: { type: 'webauthn.create' }, req: { op: 'create', pubKeyCredParams: [{ type: 'public-key', alg: -257 }] } }), 'webauthn_alg_unsupported'],
    ['a registration with no list (the platform defaults hold ES256)', req({ cd: { type: 'webauthn.create' }, req: { op: 'create', pubKeyCredParams: [] } }), null],
  ];
  for (const [name, r, want] of T) ok(RV(r) === want, `requestVerdict: ${name} ⇒ ${want || 'null'}`, RV(r));
  ok(WA.clientDataVerdict({ crypto, clientDataJSON: Buffer.from('not json').toString('base64url'), clientDataHash: h(Buffer.from('not json').toString('base64url')), origin: 'https://example.com', op: 'get' }) === 'json' && WA.clientDataVerdict({ crypto, clientDataJSON: '', clientDataHash: 'x' }) === null, 'clientDataVerdict names the mismatch (json · hash · type · origin · challenge); nothing handed ⇒ nothing to check');
  ok(throws(() => WA.requestVerdict({ crypto, req: req() })), 'requestVerdict without the rpMatches rule handed in throws (the rule is browser-passkey-store\'s — injected, never a copy)');
  ok(WA.algSupported(undefined) && WA.algSupported([{ alg: -7 }]) && !WA.algSupported([{ type: 'password', alg: -7 }]) && WA.ES256 === -7, 'algSupported: absent / empty = the defaults; −7 of type public-key');
}

console.log('⑦ PURE');
{
  const src = fs.readFileSync(SRC, 'utf8');
  ok(!/\brequire\s*\(|^\s*import\b/m.test(src), 'src/webauthn-sign.js imports nothing (node crypto is handed in)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
