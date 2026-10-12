#!/usr/bin/env node
// THE MAC'S SIGN-IN ON AN INSECURE ORIGIN (lane mac-ard-signin, owner 2026-10-12): src/lib/aes-fallback.js is the PURE
// AES noVNC's ARD sign-in uses when the page has no WebCrypto (http://<hostname>:3456 is not a secure context). Its bytes
// are judged against FIPS-197 (C.1 AES-128, C.3 AES-256), SP 800-38A (CBC chaining) and node's own WebCrypto / OpenSSL
// for random keys, ivs and lengths (PKCS#7 padding included); noVNC's own AESECBCipher (the class the ARD path calls)
// answers the same over the fallback as over WebCrypto; the fallback is installed ONLY where `crypto.subtle` is absent
// and answers exactly the two calls (importKey raw AES-CBC / AES-ECB, encrypt) — nothing else.
// RED control: a copy whose S-box is tampered (the affine constant) fails the vectors and the WebCrypto comparison.
// Run: node scripts/test-aes-fallback.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const hex = (b) => Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString('hex');
const un = (h) => Uint8Array.from(Buffer.from(h.replace(/\s+/g, ''), 'hex'));
const refuses = async (fn) => { try { await fn(); return false; } catch { return true; } };

const SRC = 'src/lib/aes-fallback.js';
const A = await import(path.join(repo, SRC));
const webcrypto = crypto.webcrypto.subtle;

async function vectors(M) {
  const c1 = hex(M.encryptBlock(M.expandKey(un('000102030405060708090a0b0c0d0e0f')), un('00112233445566778899aabbccddeeff')));
  const c3 = hex(M.encryptBlock(M.expandKey(un('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')), un('00112233445566778899aabbccddeeff')));
  const cbc = hex(M.cbcEncrypt(M.expandKey(un('2b7e151628aed2a6abf7158809cf4f3c')), un('000102030405060708090a0b0c0d0e0f'), un('6bc1bee22e409f96e93d7e117393172a ae2d8a571e03ac9c9eb76fac45af8e51')));
  return { c1, c3, cbc };
}
async function againstWebCrypto(M, n) {
  const misses = [];
  for (let i = 0; i < n; i++) {
    const key = crypto.randomBytes(i % 2 ? 32 : 16), iv = crypto.randomBytes(16), data = crypto.randomBytes((i * 7) % 97); // 0..96 bytes: empty, partial and whole blocks
    const wk = await webcrypto.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt']);
    const want = hex(await webcrypto.encrypt({ name: 'AES-CBC', iv }, wk, data));
    const fk = await M.SUBTLE_FALLBACK.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt']);
    const got = hex(await M.SUBTLE_FALLBACK.encrypt({ name: 'AES-CBC', iv }, fk, data));
    if (got !== want) misses.push({ bits: key.length * 8, len: data.length, want: want.slice(0, 32), got: got.slice(0, 32) });
  }
  return misses;
}

console.log('§1 FIPS-197 + SP 800-38A vectors');
{
  const v = await vectors(A);
  ok(v.c1 === '69c4e0d86a7b0430d8cdb78070b4c55a', 'FIPS-197 C.1 (AES-128): 00112233… under 000102…0f ⇒ 69c4e0d8…', v.c1);
  ok(v.c3 === '8ea2b7ca516745bfeafc49904b496089', 'FIPS-197 C.3 (AES-256): 00112233… under 000102…1f ⇒ 8ea2b7ca…', v.c3);
  ok(v.cbc.slice(0, 64) === '7649abac8119b246cee98e9b12e9197d5086cb9b507219ee95db113a917678b2' && v.cbc.length === 96, 'SP 800-38A F.2.1 CBC-AES128: two chained blocks ⇒ 7649abac… 5086cb9b…, then ONE padding block (WebCrypto\'s length)', v.cbc);
  ok(await refuses(() => A.expandKey(new Uint8Array(24))) && await refuses(() => A.expandKey(new Uint8Array(15))), 'a 192-bit or odd key is refused (Chrome\'s WebCrypto takes 128 / 256 only)');
}

console.log('§2 byte for byte against node\'s WebCrypto (AES-CBC) and OpenSSL (AES-ECB)');
{
  const misses = await againstWebCrypto(A, 120);
  ok(misses.length === 0, '120 random keys (128 + 256) × ivs × lengths 0..96: the fallback\'s AES-CBC answer = WebCrypto\'s, padding included', misses.slice(0, 3));
  let ecbMiss = 0;
  for (let i = 0; i < 40; i++) {
    const key = crypto.randomBytes(i % 2 ? 32 : 16), data = crypto.randomBytes(16 * (1 + (i % 8)));
    const c = crypto.createCipheriv(key.length === 16 ? 'aes-128-ecb' : 'aes-256-ecb', key, null); c.setAutoPadding(false);
    const want = Buffer.concat([c.update(data), c.final()]).toString('hex');
    const fk = await A.SUBTLE_FALLBACK.importKey('raw', key, 'AES-ECB', false, ['encrypt']);
    if (hex(await A.SUBTLE_FALLBACK.encrypt({ name: 'AES-ECB' }, fk, data)) !== want) ecbMiss++;
  }
  ok(ecbMiss === 0, '40 random keys × 1..8 whole blocks: the fallback\'s AES-ECB = OpenSSL aes-*-ecb (no padding)', ecbMiss);
}

console.log('§3 noVNC\'s own ARD cipher (core/crypto/aes.js AESECBCipher) over the fallback = over WebCrypto');
{
  const N = await import(path.join(repo, 'node_modules/@novnc/novnc/core/crypto/aes.js'));
  const hadWindow = 'window' in globalThis, prev = globalThis.window;
  const key = crypto.createHash('md5').update(crypto.randomBytes(128)).digest(); // ARD: MD5 of the DH shared secret
  const creds = new Uint8Array(128); crypto.randomFillSync(creds); creds.set(Buffer.from('mart\0'), 0); creds.set(Buffer.from('Sekr3t!x\0'), 64);
  const run = async (subtle) => { globalThis.window = { crypto: { subtle } }; const c = await N.AESECBCipher.importKey(new Uint8Array(key), { name: 'AES-ECB' }, false, ['encrypt']); return hex(await c.encrypt({ name: 'AES-ECB' }, creds)); };
  let viaWeb, viaFallback;
  try { viaWeb = await run(webcrypto); viaFallback = await run(A.SUBTLE_FALLBACK); } finally { if (hadWindow) globalThis.window = prev; else delete globalThis.window; }
  ok(viaWeb && viaWeb.length === 256 && viaFallback === viaWeb, 'the 128-byte ARD credentials block encrypts to the same 128 bytes through noVNC\'s AESECBCipher either way', { viaWeb: (viaWeb || '').slice(0, 32), viaFallback: (viaFallback || '').slice(0, 32) });
  const d = crypto.createDecipheriv('aes-128-ecb', key, null); d.setAutoPadding(false);
  const back = Buffer.concat([d.update(Buffer.from(viaFallback, 'hex')), d.final()]);
  ok(back.subarray(0, 5).toString() === 'mart\0' && back.subarray(64, 73).toString() === 'Sekr3t!x\0', 'the Mac\'s side (OpenSSL AES-128-ECB with the same key) reads the name at 0 and the password at 64');
}

console.log('§4 exactly the two calls, installed only where crypto.subtle is absent');
{
  const S = A.SUBTLE_FALLBACK;
  ok(Object.isFrozen(S) && JSON.stringify(Object.keys(S).sort()) === '["encrypt","importKey"]', 'the fallback answers importKey + encrypt and nothing else (no decrypt / digest / generateKey)', Object.keys(S));
  ok(await refuses(() => S.importKey('jwk', new Uint8Array(16), 'AES-CBC', false, ['encrypt'])) && await refuses(() => S.importKey('raw', new Uint8Array(16), { name: 'AES-CTR' }, false, ['encrypt'])) && await refuses(() => S.importKey('raw', new Uint8Array(16), { name: 'AES-GCM' }, false, ['encrypt'])), 'importKey refuses any format but raw and any algorithm but AES-CBC / AES-ECB');
  const k = await S.importKey('raw', new Uint8Array(16), { name: 'aes-cbc' }, false, ['encrypt']);
  ok(k.type === 'secret' && k.algorithm.name === 'AES-CBC' && k.algorithm.length === 128 && !Object.values(k).some((v) => v instanceof Uint8Array), 'the key is opaque (WebCrypto\'s shape: secret, AES-CBC 128 — the raw bytes are not on it)', k);
  const wk = await webcrypto.importKey('raw', new Uint8Array(16), { name: 'AES-CBC' }, false, ['encrypt']);
  ok(await refuses(() => S.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, wk, new Uint8Array(16))) && await refuses(() => S.encrypt({ name: 'AES-ECB' }, k, new Uint8Array(16))) && await refuses(() => S.encrypt({ name: 'AES-CBC', iv: new Uint8Array(8) }, k, new Uint8Array(16))), 'encrypt refuses a foreign key, a name that is not the key\'s, and a short iv');
  const out = await S.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, k, new DataView(new ArrayBuffer(16)));
  ok(out instanceof ArrayBuffer && out.byteLength === 32, 'encrypt takes any BufferSource and answers an ArrayBuffer (a DataView of one block ⇒ 32 bytes)');
  const insecure = { getRandomValues: (a) => a };
  ok(A.installSubtleFallback(insecure) === true && insecure.subtle === S && Object.getOwnPropertyDescriptor(insecure, 'subtle')?.value === S, 'a crypto object WITHOUT subtle (an http page) gets the fallback as an own property');
  ok(A.installSubtleFallback(insecure) === false && insecure.subtle === S, 'a second install is a no-op');
  const secure = { subtle: webcrypto };
  ok(A.installSubtleFallback(secure) === false && secure.subtle === webcrypto, 'CONTROL: a crypto object WITH subtle (a secure context) is never touched');
  ok(A.installSubtleFallback(null) === false, 'no crypto object at all ⇒ nothing installed, nothing thrown');
  ok(globalThis.crypto.subtle === webcrypto, 'this process\'s own crypto.subtle (node: a secure context) is still WebCrypto after the suite');
}

console.log('§5 RED control: a tampered S-box');
{
  const src = fs.readFileSync(path.join(repo, SRC), 'utf8');
  const AFFINE = '^ rotl8(q, 4) ^ 0x63;';
  ok(src.split(AFFINE).length === 2, 'the S-box\'s affine constant is spelled exactly once (the mutant\'s anchor)');
  const M = mutantCopies('aesfb', repo);
  const Bad = await import(M.write(SRC, src.replace(AFFINE, '^ rotl8(q, 4) ^ 0x62;'), 'sbox'));
  const v = await vectors(Bad);
  ok(v.c1 !== '69c4e0d86a7b0430d8cdb78070b4c55a' && v.c3 !== '8ea2b7ca516745bfeafc49904b496089', 'RED: the tampered copy fails FIPS-197 C.1 and C.3', v);
  const misses = await againstWebCrypto(Bad, 10);
  ok(misses.length === 10, 'RED: … and every WebCrypto comparison', misses.length);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
