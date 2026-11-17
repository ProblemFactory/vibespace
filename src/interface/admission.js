'use strict';
// THE ADMISSION (the separation, M1 — lane B, piece B2b; lane readings' contract v1, /var/tmp/vibespace-lanes/scf/cs/contract-A.md
// §2–§3). A party is admitted to the interface's link by the start secret the supervisor minted for THIS start. The
// interface never sees the secret: its start pipe carries `{op:'admit', party, digest}` (the sha256 hex of that party's
// secret), written BEFORE that party is started. A later admit for the same name REPLACES the earlier one, so a
// previous generation's secret is refused from that line on (ruling 3: the start secret IS the generation proof).
// The party's hello `{op:'hello', protoVersion:1, party, secret}` is checked in constant time (src/pairing-token.js
// tokenMatches — never `!==`). What the check is for: it prevents accidents — a stray or old process naming itself. It
// does not stop a process under the same account that reads another's memory.
// PURE but for the compare; no disk, no clock.
const { tokenMatches } = require('../pairing-token.js');

const PROTO_VERSION = 1;
/** the parties M1 admits (today's hub joins as ONE party); the reserved names are never admitted before their milestone */
const PARTIES = new Set(['hub']);
const RESERVED = new Set(['vault', 'channels', 'money', 'workspace', 'machines']);
const DIGEST_RE = /^[0-9a-f]{64}$/;

/** → { admit(line) → boolean, check(hello) → { ok: true, party } | { ok: false, why }, admitted() → [party] } */
function create() {
  const digests = new Map();   // party → the digest of its CURRENT start's secret
  function admit(line = {}) {
    const party = line && line.party, digest = line && line.digest;
    if (!PARTIES.has(party) || typeof digest !== 'string' || !DIGEST_RE.test(digest)) return false;
    digests.set(party, digest);   // replaces: the previous generation's secret no longer matches
    return true;
  }
  function check(hello) {
    if (!hello || hello.op !== 'hello') return { ok: false, why: 'not-a-hello' };
    if (hello.protoVersion !== PROTO_VERSION) return { ok: false, why: 'proto-version' };
    const party = hello.party;
    if (RESERVED.has(party) || !PARTIES.has(party)) return { ok: false, why: 'unknown-party' };
    const digest = digests.get(party);
    if (!digest) return { ok: false, why: 'not-admitted' };
    if (!tokenMatches(hello.secret, digest)) return { ok: false, why: 'secret' };   // a wrong secret, or a previous generation's
    return { ok: true, party };
  }
  return { admit, check, admitted: () => [...digests.keys()] };
}

module.exports = { create, PROTO_VERSION, PARTIES, RESERVED };
