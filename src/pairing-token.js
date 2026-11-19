'use strict';
/**
 * SHARED (node `crypto` only; the device bundle carries it) — THE ONE DOOR OF A PAIRING TOKEN (lane-pairing
 * verify-r3, the dial-token door census, 2026-09-28).
 *
 * A pairing is two secrets:
 *   · the DIAL token (`vsdt_` + 36 hex) — the hub keeps only its HASH on the device's record (hosts.json
 *     `dialTokenHash`); whoever holds the token dials in AS the device;
 *   · the HOST token (`vsht_` + 48 hex) — the hub keeps it in data/agentd/host-<id>.token (0600) and presents it in
 *     every mux hello; the device keeps it in state/token and compares the hello against it.
 * Every MINT, ROTATION and COMPARE of either goes through here: `mintToken(kind)`, `tokenHash(token)` (what a record
 * stores), `tokenMatches(token, hash)` (a compare in constant time over the two digests — never `!==`, which stops
 * at the first differing character). scripts/test-dial-facts.mjs holds the grep-derived census: no other sha256 over
 * a token in the tree, no other mint of a `vsdt_` / `vsht_` value, no `!==` / `===` against a token hash, no log
 * line interpolating a token, no hub-side write of a device's dial.json / token but through the device's
 * `place-secret` op (0600 at open, atomic) — and scripts/test-dial-token-sinks.mjs looks for the minted tokens in
 * every sink at runtime.
 */
const crypto = require('crypto');

// lane webhook-l1-server: `webhook` — a webhook CALLER's token (`vswh_` + 48 hex; docs/design-webhook.zh.md §9): a Bearer
// caller's record keeps only tokenHash, an HMAC caller's the secret-box ciphertext; shown ONCE in the register / rotate answer
const KINDS = Object.freeze({ dial: { prefix: 'vsdt_', bytes: 18 }, host: { prefix: 'vsht_', bytes: 24 }, webhook: { prefix: 'vswh_', bytes: 24 } });
const HASH_RE = /^[0-9a-f]{64}$/;

/** A fresh token of `kind` ('dial' | 'host' | 'webhook'). */
function mintToken(kind) {
  const k = KINDS[kind];
  if (!k) throw new Error(`pairing-token: unknown kind ${kind}`);
  return k.prefix + crypto.randomBytes(k.bytes).toString('hex');
}
/** What a record stores: the sha256 of the token, hex. */
function tokenHash(token) { return crypto.createHash('sha256').update(String(token == null ? '' : token)).digest('hex'); }
/** Does `token` hash to `hash`? Constant time over the two 32-byte digests; a missing / malformed side is `false`. */
function tokenMatches(token, hash) {
  if (typeof token !== 'string' || !token || typeof hash !== 'string' || !HASH_RE.test(hash)) return false;
  return crypto.timingSafeEqual(Buffer.from(tokenHash(token), 'hex'), Buffer.from(hash, 'hex'));
}

/**
 * Is `presented` (what a request carries) the very `secret` a record holds RAW — a session's `vsst_` token
 * (`s.agentToken`), the OTel exporter's per-boot header (B-8dda, 2026-10-02: eight lookups compared them with `===`)?
 * The same constant-time compare: the secret's digest through tokenMatches, so neither its length nor the first
 * differing character shows; a missing / empty side is `false`. scripts/test-architecture.mjs §68 holds the census.
 */
function sameToken(presented, secret) {
  if (typeof secret !== 'string' || !secret) return false;
  return tokenMatches(presented, tokenHash(secret));
}

/** B-4d71: THE RETIRE PROOF — a hub that held a device's pairing answers that device's dial (its exact, now unpaired DIAL token)
 *  with an HMAC keyed by the hash of the device's HOST token (vsht_), over a message that NAMES ITS PURPOSE (主开发's round
 *  wz421di05: a proof's format is fixed at its first release — hubs and signed agents agree on it for ever):
 *      RETIRE_PURPOSE \0 <the device's id> \0 <the hash of the dial token that matched the tombstone> \0 <the dial's nonce>
 *  (\0 never occurs in any part — a part holding one, or an empty part, makes no proof). The host token never rides a dial (the
 *  device sends only its dial token there); it rides the live link's hello and the install command the hub minted for this
 *  device. So a proof can be made by the hub (its tombstone keeps the host token's hash) and by whoever holds that install
 *  command — who can already speak the hub's hello to the device — and by nobody who merely receives a dial (a lapsed name, a
 *  leased address, a relay). The device checks the same message from what it holds. */
const RETIRE_PURPOSE = 'vibespace-retire-v1';
function retireMessage({ deviceId, dialTokenHash, nonce } = {}) {
  const parts = [RETIRE_PURPOSE, deviceId, dialTokenHash, nonce].map((x) => (typeof x === 'string' ? x : ''));
  return parts.some((x) => !x || x.includes('\0')) ? null : parts.join('\0');
}
function retireProof(hostTokenHashHex, facts) {
  const m = retireMessage(facts);
  if (!m || typeof hostTokenHashHex !== 'string' || !hostTokenHashHex) return '';
  return crypto.createHmac('sha256', hostTokenHashHex).update(m).digest('hex');
}
function retireProofMatches(hostToken, { deviceId, dialToken, nonce } = {}, proof) {
  if (typeof hostToken !== 'string' || !hostToken || typeof dialToken !== 'string' || !dialToken) return false;   // no token: no proof can hold
  const w = retireProof(tokenHash(hostToken), { deviceId, dialTokenHash: tokenHash(dialToken), nonce });
  if (!w) return false;
  const want = Buffer.from(w, 'hex'), got = Buffer.from(String(proof || ''), 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
module.exports = { KINDS, mintToken, tokenHash, tokenMatches, sameToken, RETIRE_PURPOSE, retireMessage, retireProof, retireProofMatches };
