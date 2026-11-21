'use strict';
// THE ADMISSION (the separation, M1 — lane B, piece B2b; lane readings' contract v1, /var/tmp/vibespace-lanes/scf/cs/contract-A.md
// §2–§3). A party is admitted to the interface's link by the start secret the supervisor minted for THIS start. The
// interface never sees the secret: its start pipe carries `{op:'admit', party, digest}` (the sha256 hex of that party's
// secret), written BEFORE that party is started. A later admit for the same name REPLACES the earlier one, so a
// previous generation's secret is refused from that line on (ruling 3: the start secret IS the generation proof).
// THE GREETING, VERSION 2 (主开发 r1060 + r1087 — the start value never crosses a link): the interface opens every link with
// `{op:'challenge', protoVersion:2, nonce}`; the party answers `{op:'hello', protoVersion:2, party, proof}`, its proof made
// from the digest it was admitted by over that nonce and its name (src/link-proof.js), checked here in constant time. A
// version-1 hello CARRIES the start value, so it is refused by name ('v1-start-value') — it is never compared. What the
// check is for: it prevents accidents — a stray or old process naming itself. It does not stop a process under the same
// account that reads another's memory, or relays a real challenge (DECLARED, src/link-proof.js).
// PURE but for the compare; no disk, no clock.
const { proofMatches } = require('../link-proof.js');

const PROTO_VERSION = 2;
/** the parties M1 admits (today's hub joins as ONE party); the reserved names are never admitted before their milestone */
const PARTIES = new Set(['hub']);
const RESERVED = new Set(['vault', 'channels', 'money', 'workspace', 'machines']);
const DIGEST_RE = /^[0-9a-f]{64}$/;

/** → { admit(line) → boolean, check(hello, nonce) → { ok: true, party } | { ok: false, why }, admitted() → [party] } */
function create() {
  const digests = new Map();   // party → the digest of its CURRENT start's secret
  function admit(line = {}) {
    const party = line && line.party, digest = line && line.digest;
    if (!PARTIES.has(party) || typeof digest !== 'string' || !DIGEST_RE.test(digest)) return false;
    digests.set(party, digest);   // replaces: the previous generation's secret no longer matches
    return true;
  }
  function check(hello, nonce) {
    if (!hello || hello.op !== 'hello') return { ok: false, why: 'not-a-hello' };
    if (hello.protoVersion === 1 || 'secret' in hello) return { ok: false, why: 'v1-start-value' };   // it sent its start value: refused, never compared
    if (hello.protoVersion !== PROTO_VERSION) return { ok: false, why: 'proto-version' };
    const party = hello.party;
    if (RESERVED.has(party) || !PARTIES.has(party)) return { ok: false, why: 'unknown-party' };
    const digest = digests.get(party);
    if (!digest) return { ok: false, why: 'not-admitted' };
    if (!proofMatches(hello.proof, digest, nonce, party)) return { ok: false, why: 'proof' };   // a wrong proof: another start value, or a previous generation's
    return { ok: true, party };
  }
  return { admit, check, admitted: () => [...digests.keys()] };
}

module.exports = { create, PROTO_VERSION, PARTIES, RESERVED };
