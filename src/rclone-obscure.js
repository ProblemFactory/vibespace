'use strict';
// RCLONE'S «OBSCURE» AS A PURE, IN-PROCESS FUNCTION (lane mount-password-off-argv, B-d752 — credential class).
//
// rclone stores a PASS-type parameter (WebDAV / SFTP / any `pass` field) in a reversible "obscured" form, NOT as
// plaintext. It is NOT encryption of record — our real at-rest protection is AES-256-GCM (src/secret-box.js); this is
// only the wire shape rclone's own config expects, and it is a PUBLIC algorithm. src/mounts.js used to produce it by
// shelling out to `rclone obscure <plain>`, which put the password on the child's ARGV — readable in
// /proc/<pid>/cmdline by every local user for that child's life — on a SYNCHRONOUS exec that blocked the hub's event
// loop (CLAUDE.md «Never block the event loop»). THE LAW: a secret never rides argv; a public algorithm is computed
// in-process.
//
// THE ALGORITHM (rclone source: fs/config/obscure/obscure.go — `cryptKey`, `crypt`, `Obscure`, `Reveal`; measured
// equivalent on rclone v1.60.1, v1.65.2 and v1.69.3, lane fence of 2026-10-20): AES-256-CTR under rclone's fixed
// 32-byte key, with a random 16-byte IV PREFIXED to the ciphertext, the whole base64url-encoded WITHOUT padding
// (Go's base64.RawURLEncoding). Reveal reverses it: decode, split off the 16-byte IV, CTR-decrypt the rest. The IV is
// random, so two obscurings of the same password differ byte-for-byte — equivalence with the binary is proven by
// REVEAL, never by comparing bytes (scripts/test-rclone-obscure.mjs).
const crypto = require('crypto');

// rclone's fixed obscure key — fs/config/obscure/obscure.go `cryptKey` (unchanged since rclone v1.39, 2017). Pinned as
// bytes; the real binary's `rclone reveal` of our output is the standing proof it is correct (test-rclone-obscure.mjs).
const CRYPT_KEY = Buffer.from([
  0x9c, 0x93, 0x5b, 0x48, 0x73, 0x0a, 0x55, 0x4d, 0x6b, 0xfd, 0x7c, 0x63, 0xc8, 0x86, 0xa9, 0x2b,
  0xd3, 0x90, 0x19, 0x8e, 0xb8, 0x12, 0x8a, 0xfb, 0xf4, 0xde, 0x16, 0x2b, 0x8b, 0x95, 0xf6, 0x38,
]);
const IV_LEN = 16; // aes.BlockSize

/** obscure(plain) → rclone's reversible obscured form of `plain` (a NEW random IV each call). */
function obscure(plain) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-ctr', CRYPT_KEY, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(String(plain), 'utf8')), cipher.final()]);
  return Buffer.concat([iv, ct]).toString('base64url');
}

/** reveal(token) → the plaintext behind an obscured token (rclone's `reveal`). Throws on a malformed / too-short token. */
function reveal(token) {
  const buf = Buffer.from(String(token), 'base64url');
  if (buf.length < IV_LEN) throw new Error('rclone-obscure: token too short to hold an IV');
  const decipher = crypto.createDecipheriv('aes-256-ctr', CRYPT_KEY, buf.subarray(0, IV_LEN));
  return Buffer.concat([decipher.update(buf.subarray(IV_LEN)), decipher.final()]).toString('utf8');
}

module.exports = { obscure, reveal, CRYPT_KEY };
