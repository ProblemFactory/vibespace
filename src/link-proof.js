'use strict';
// THE LINK'S PROOF (the separation, M1 — lane B; 主开发 r1060 + r1087): A PARTY'S START VALUE NEVER CROSSES A LINK. The interface
// opens every link with a fresh challenge; a party answers with a proof made from the DIGEST the interface was admitted with
// (the sha256 of the party's start value, which the supervisor writes as the admit line) over that challenge and its own name.
// The party derives the same digest from its start value by itself, so the start value is on no frame of any link, at the
// first join or any later one (a re-join after the interface's death proves again, never sends).
// DECLARED, not built against (the owner's principle: a guard against mistakes, not against a deliberate process of the same
// account): (a) the digest is now what proves a party, so the interface never logs it and never sends it back (a census leg
// reads its log and reply sites); (b) a process at the link's path that relays a real challenge and its proof is the same
// undefended same-account case.
// SHARED (node's crypto, nothing else of the tree): no store, no clock, no I/O — a PURE module may import nothing at all.
const crypto = require('crypto');

const HEX64 = /^[0-9a-f]{64}$/;
const PROOF_LABEL = 'vibespace-link-proof/2';   // the proof's own context: it can be mistaken for no other HMAC of the same key
/** the digest a start value is admitted by (the supervisor's admit line carries it) */
const digestOf = (startValue) => crypto.createHash('sha256').update(String(startValue)).digest('hex');
/** the proof for ONE challenge and ONE party name, keyed by the admitted digest */
const proofOf = (digest, nonce, party) => crypto.createHmac('sha256', Buffer.from(digest, 'hex')).update(`${PROOF_LABEL}\n${nonce}\n${party}`).digest('hex');
/** a fresh challenge: 32 random bytes, hex */
const challenge = () => crypto.randomBytes(32).toString('hex');
/** does `proof` answer `nonce` for `party` under `digest`? — in constant time, never `===` */
function proofMatches(proof, digest, nonce, party) {
  if (typeof proof !== 'string' || !HEX64.test(proof) || typeof digest !== 'string' || !HEX64.test(digest) || typeof nonce !== 'string' || !HEX64.test(nonce)) return false;
  return crypto.timingSafeEqual(Buffer.from(proof, 'hex'), Buffer.from(proofOf(digest, nonce, String(party)), 'hex'));
}

module.exports = { digestOf, proofOf, proofMatches, challenge, PROOF_LABEL };
