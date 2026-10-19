'use strict';
/**
 * THE RELEASE KEYS a device agent trusts (lane device-bundle-signing, design q-042 D2) — PUBLIC halves only.
 *
 * Baked into every agent bundle; a device pins this list at its first start (<root>/state/trusted-keys.json, a
 * (re-)pair resets it) and from then on lands an upgrade only when it is signed by a pinned key or by a successor the
 * KEY_CHAIN reaches (src/agentd-signature.js). The private key lives on the release machine only
 * (~/.vibespace-release/agentd-ed25519.pem — never in this repository, never in CI, never on a hub).
 *
 *   a new key        node scripts/gen-release-key.mjs --encrypt  → paste the printed row into RELEASE_KEYS
 *   a rotation       node scripts/gen-release-key.mjs --rotate-from <old pem> --out <new pem> --encrypt
 *                    → the new row is ADDED beside the old one in RELEASE_KEYS; the printed link is APPENDED to KEY_CHAIN
 *                      (never removed: a device that slept through a release still follows it, and ADDS the successor
 *                      to its pin — sibling keys stay trusted)
 *   a retirement     node scripts/gen-release-key.mjs --retire <old pem>
 *                    → the printed { retire, sig } entry (signed by the retiring key) is APPENDED to KEY_CHAIN and the
 *                      old row REMOVED from RELEASE_KEYS; a device drops that key at the next release
 * Every signed record also signs this RELEASE_KEYS set: a device installed from a build whose set was EMPTY trusts it on
 * first use (the first validly signed release it is offered — an urgent For-you item names the fingerprint).
 *
 * Empty = no release has been signed yet: every hub reads its build as `unsigned-local-build` and pushes no upgrade to
 * a paired machine (the hub's own local daemon still updates — src/agentd/client.js). docs/kb-design-lessons.md (the
 * release discipline) has the first-release steps.
 */
const RELEASE_KEYS = [
  { keyId: '634fa9b38a807bd4', publicKey: 'tl0ocmuXhUBBnMK8j4ggQZ1xk3wLt9PQyTv57OorD74=' },
];
const KEY_CHAIN = [
];
module.exports = { RELEASE_KEYS, KEY_CHAIN };
