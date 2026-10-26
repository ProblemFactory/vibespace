'use strict';
/**
 * THE RELEASE SIGNATURE OF THE DEVICE AGENT (lane device-bundle-signing, design q-042 §3 D2 / §5 P0-a).
 *
 * Before: a hub whose bundle version differed from a device's streamed its own data/bin/vibespace-agentd.js and the
 * device landed it, repointed `current` and re-exec'd — no signature, no second source. A compromised hub replaced the
 * code of every paired machine within seconds of their next hello.
 *
 * Now a device lands a bundle only when it carries a valid ed25519 signature by a RELEASE KEY it trusts. The private
 * key lives on the release machine only (never CI, never a hub — scripts/sign-agentd.mjs refuses both); the public keys
 * are baked into every bundle (src/agentd/release-keys.js) and pinned on the device at its first start
 * (<root>/state/trusted-keys.json). A key rotation ships as a CHAIN of links, each successor signed by its predecessor,
 * inside every release manifest — a device that pinned an older key follows the chain, never anything else.
 *
 *   the signed message   'vibespace-agentd-bundle/v1' ‖ version ‖ sha256(bundle) ‖ keyId   (newline-separated)
 *                        [‖ 'keys <keyId>:<publicKey> …'] [‖ 'allow-downgrade-to <version>']  (fix r2: present iff the
 *                        record carries them — a record without them signs the v1 message unchanged)
 *                        [‖ 'helper <version> <sha256> <kind> <teamId|-> <identifier|->']  (lane apple-signing: the release's
 *                        prebuilt Mac screen helper — src/mac-helper-identity.js helperRow; present iff the record carries it)
 *   a chain link         'vibespace-agentd-key-link/v1' ‖ by ‖ keyId ‖ publicKey, signed by `by`
 *   a retirement         'vibespace-agentd-key-retire/v1' ‖ keyId, signed by THAT key (its holder retires it)
 *   keyId                the first 16 hex of sha256(the raw 32-byte public key)
 *   the record (= release/agentd/manifest.json = the upgrade control line's `sig`)
 *                        { v: 1, version, sha256, keyId, sig, keys: [{ keyId, publicKey }], allowDowngradeTo?,
 *                          chain: [{ keyId, publicKey, by, sig } | { retire, sig }], helper?: { version, sha256, identity: { kind, teamId, identifier } } }
 *
 * verify → { ok: true, keyId, sha256, viaChain, tofu, rollback, floor, trustAfter } | { ok: false, code, why } — codes:
 * 'malformed' | 'version-mismatch' | 'unknown-key' | 'bad-signature' | 'downgrade'. The digest is ALWAYS computed here
 * over the bytes handed in; the record's own `sha256` is never trusted (a hub-side identity check only — manifestMatches).
 *
 * Fix r2 (verify-r1 of lane device-bundle-signing):
 *   THE FLOOR (RED-1)   `opts.floor` = the newest version the device ever ran: a validly signed OLDER release is refused
 *                       `downgrade` unless the record SIGNS `allowDowngradeTo` = its own version (the owner's rollback,
 *                       sign-agentd --allow-downgrade-to) — honoured ONCE per bundle (`opts.honoured` = the digests the
 *                       device already let down). Never an env, never a hub-side flag: only the release key says it.
 *   TOFU (RED-2)        `opts.tofu` = this device trusts NO key at all (installed from a build that carried none): the
 *                       record's own SIGNED key set is trusted when it is self-consistent (every row is its key's id, the
 *                       signer is one of them) ⇒ `tofu: true`, `trustAfter` = that set. A device with ANY trusted key
 *                       never takes this branch.
 *   THE CHAIN (low ④)   a successor ADDS to the pin (the siblings stay); a key leaves only by a signed retirement.
 *
 * PURE: imports nothing — node's crypto is handed in (`opts.crypto`), as in webhook-auth.js.
 */

const DOMAIN_BUNDLE = 'vibespace-agentd-bundle/v1';
const DOMAIN_LINK = 'vibespace-agentd-key-link/v1';
const DOMAIN_RETIRE = 'vibespace-agentd-key-retire/v1';
const VERSION_RE = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
const KEYID_RE = /^[0-9a-f]{16}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const B64_RE = /^[A-Za-z0-9+/]{1,200}={0,2}$/;
const MAX_CHAIN = 16;
const MAX_KEYS = 16;
// lane apple-signing: the helper row's shape (the same rules as src/mac-helper-identity.js helperRowShape — this file imports nothing)
const HELPER_KINDS = Object.freeze(['developer-id', 'adhoc', 'other', 'unsigned']);
const HELPER_VERSION_RE = /^[A-Za-z0-9._-]{1,40}$/;
const TEAM_RE = /^[A-Z0-9]{10}$/;
const IDENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
// the DER prefix of an ed25519 SubjectPublicKeyInfo — the raw 32-byte key follows it (RFC 8410)
const SPKI_ED25519 = '302a300506032b6570032100';
/** Every refusal a device may answer an upgrade with (the hub reads them as a signature refusal: never retried). */
const REFUSALS = Object.freeze(['malformed', 'version-mismatch', 'unknown-key', 'bad-signature', 'unsigned', 'downgrade']);

const need = (o) => { if (!o || !o.crypto || typeof o.crypto.verify !== 'function') throw new Error('agentd-signature: hand in node crypto ({ crypto })'); return o.crypto; };
const b64 = (s, len) => { if (typeof s !== 'string' || !B64_RE.test(s)) return null; const b = Buffer.from(s, 'base64'); return b.length === len ? b : null; };
const fail = (code, why, extra = null) => ({ ok: false, code, why, ...(extra || {}) });
/** Version order (x.y.z, numeric) — < 0 when a is older than b. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/** The id of a public key (base64 of the raw 32 bytes) — null when the text is no ed25519 public key. */
function keyIdOf(publicKey, opts) {
  const raw = b64(publicKey, 32);
  return raw ? need(opts).createHash('sha256').update(raw).digest('hex').slice(0, 16) : null;
}
function publicKeyObject(publicKey, crypto) {
  return crypto.createPublicKey({ key: Buffer.concat([Buffer.from(SPKI_ED25519, 'hex'), b64(publicKey, 32)]), format: 'der', type: 'spki' });
}
/** The raw public half of a private key (PEM text or a KeyObject) as base64. */
function publicKeyOf(privateKey, opts) {
  const crypto = need(opts);
  const pub = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  if (pub.length !== 44 || pub.subarray(0, 12).toString('hex') !== SPKI_ED25519) throw new Error('agentd-signature: the release key must be ed25519');
  return pub.subarray(12).toString('base64');
}

/** The helper row's shape — null when well-formed, else why. */
function helperShape(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return 'the helper row is not an object';
  if (typeof row.version !== 'string' || !HELPER_VERSION_RE.test(row.version)) return 'the helper row names no version';
  if (typeof row.sha256 !== 'string' || !SHA_RE.test(row.sha256)) return 'the helper row names no sha256';
  const id = row.identity;
  if (!id || typeof id !== 'object' || Array.isArray(id)) return 'the helper row names no identity';
  if (!HELPER_KINDS.includes(id.kind)) return 'the helper row\'s identity kind is unknown';
  if (id.teamId != null && !TEAM_RE.test(String(id.teamId))) return 'the helper row\'s Team ID is not a Team ID';
  if (id.identifier != null && !IDENT_RE.test(String(id.identifier))) return 'the helper row\'s identifier is not an identifier';
  if (id.kind === 'developer-id' && (!id.teamId || !id.identifier)) return 'a Developer ID row needs its Team ID and identifier';
  return null;
}
/** The helper row's line inside the signed message (≡ src/mac-helper-identity.js helperRowLine — pinned equal by its suite). */
const helperLine = (row) => `helper ${row.version} ${row.sha256} ${row.identity.kind} ${row.identity.teamId || '-'} ${row.identity.identifier || '-'}`;
const bundleMessage = (version, sha256, keyId, extra = {}) => Buffer.from(`${DOMAIN_BUNDLE}\n${version}\n${sha256}\n${keyId}\n`
  + (Array.isArray(extra.keys) ? `keys ${extra.keys.map((k) => `${k.keyId}:${k.publicKey}`).join(' ')}\n` : '')
  + (extra.allowDowngradeTo != null ? `allow-downgrade-to ${extra.allowDowngradeTo}\n` : '')
  + (extra.helper != null ? `${helperLine(extra.helper)}\n` : ''), 'utf8');
const linkMessage = (l) => Buffer.from(`${DOMAIN_LINK}\n${l.by}\n${l.keyId}\n${l.publicKey}\n`, 'utf8');
const retireMessage = (keyId) => Buffer.from(`${DOMAIN_RETIRE}\n${keyId}\n`, 'utf8');

/** A key list → Map keyId → publicKey. A row whose keyId is not its key's id is dropped (never "trusted by name"). */
function keyMap(list, crypto) {
  const m = new Map();
  for (const k of (Array.isArray(list) ? list : []).slice(0, MAX_KEYS)) {
    if (!k || typeof k !== 'object') continue;
    const id = keyIdOf(k.publicKey, { crypto });
    if (id && id === k.keyId) m.set(id, k.publicKey);
  }
  return m;
}

/** The record's SHAPE (nothing cryptographic) — null when it is well-formed, else the reason. */
function shapeOf(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return 'no signature record';
  if (rec.v !== 1) return 'unknown record version';
  if (typeof rec.version !== 'string' || !VERSION_RE.test(rec.version)) return 'the signed version is not a version';
  if (typeof rec.keyId !== 'string' || !KEYID_RE.test(rec.keyId)) return 'the key id is not a key id';
  if (!b64(rec.sig, 64)) return 'the signature is not 64 base64 bytes';
  if (rec.chain != null && (!Array.isArray(rec.chain) || rec.chain.length > MAX_CHAIN)) return 'the key chain is not a list of ≤ 16 links';
  for (const l of rec.chain || []) {
    if (l && typeof l === 'object' && l.retire != null) { if (typeof l.retire !== 'string' || !KEYID_RE.test(l.retire) || !b64(l.sig, 64)) return 'a key-chain retirement is malformed'; continue; }
    if (!l || typeof l !== 'object' || typeof l.by !== 'string' || !KEYID_RE.test(l.by) || typeof l.keyId !== 'string' || !KEYID_RE.test(l.keyId) || !b64(l.publicKey, 32) || !b64(l.sig, 64)) return 'a key-chain link is malformed';
  }
  if (rec.keys != null) {
    if (!Array.isArray(rec.keys) || !rec.keys.length || rec.keys.length > MAX_KEYS) return 'the key set is not a list of 1–16 keys';
    for (const k of rec.keys) if (!k || typeof k !== 'object' || typeof k.keyId !== 'string' || !KEYID_RE.test(k.keyId) || !b64(k.publicKey, 32)) return 'a key-set row is malformed';
  }
  if (rec.allowDowngradeTo != null && rec.allowDowngradeTo !== rec.version) return 'allowDowngradeTo names another version than the record signs';
  if (rec.helper != null) { const bad = helperShape(rec.helper); if (bad) return bad; }
  return null;
}

/**
 * THE VERDICT a device lands a bundle on.
 * @param publicKeys  the keys this device trusts [{ keyId, publicKey }] (its pinned set)
 * @param bundleBytes the bytes that will run (read back from disk after the last byte landed)
 * @param version     the version the upgrade CLAIMS (the directory it lands in, the version it will report)
 * @param record      the signature record (the control line's `sig`)
 * @param opts        { crypto, tofu?: this device trusts no key at all, floor?: the newest version it ran,
 *                      honoured?: the digests of signed rollbacks it already let down }
 */
function verify(publicKeys, bundleBytes, version, record, opts) {
  const crypto = need(opts);
  if (typeof version !== 'string' || !VERSION_RE.test(version)) return fail('malformed', 'the upgrade names no version');
  if (record == null) return fail('unsigned', 'the upgrade carries no release signature');
  const bad = shapeOf(record);
  if (bad) return fail('malformed', bad);
  if (record.version !== version) return fail('version-mismatch', `signed for ${record.version}, offered as ${version}`);
  const start = keyMap(publicKeys, crypto);
  // TOFU (fix r2, verify-r1 RED-2): a device that trusts NO key — never one that trusts any — takes the record's own
  // SIGNED key set, only when it is self-consistent (a row whose id is not its key's, or a signer outside the set: refused)
  let tofu = false;
  if (!start.size && opts.tofu === true) {
    if (!Array.isArray(record.keys)) return fail('unknown-key', `key ${record.keyId}: this device trusts no release key yet and the record names no key set to trust`);
    const own = keyMap(record.keys, crypto);
    if (own.size !== record.keys.length || !own.has(record.keyId)) return fail('malformed', 'the record\'s key set is not self-consistent (a row is not its key\'s id, or the signer is not one of them)');
    for (const [id, pub] of own) start.set(id, pub);
    tofu = true;
  }
  const reach = new Map(start);
  const trustedIds = new Set(reach.keys());
  // the chain: a link counts only when its signer is ALREADY reachable; a link signed by a reachable key that does not
  // check is a forgery (refused outright, never skipped); a fixed point so the links' order is not load-bearing
  for (let pass = 0, grew = true; grew && pass <= MAX_CHAIN; pass++) {
    grew = false;
    for (const l of record.chain || []) {
      if (reach.has(l.keyId) || !reach.has(l.by)) continue;
      if (keyIdOf(l.publicKey, { crypto }) !== l.keyId) return fail('malformed', `the key-chain link ${l.keyId} names another key`);
      let good = false;
      try { good = crypto.verify(null, linkMessage(l), publicKeyObject(reach.get(l.by), crypto), b64(l.sig, 64)); } catch { good = false; }
      if (!good) return fail('bad-signature', `the key-chain link ${l.by} → ${l.keyId} does not check`);
      reach.set(l.keyId, l.publicKey); grew = true;
    }
  }
  // a retirement counts only for a key this device can reach, and only signed by THAT key; one that does not check is a
  // forgery (refused, never skipped)
  const retired = new Set();
  for (const e of record.chain || []) {
    if (e.retire == null || !reach.has(e.retire)) continue;
    let good = false;
    try { good = crypto.verify(null, retireMessage(e.retire), publicKeyObject(reach.get(e.retire), crypto), b64(e.sig, 64)); } catch { good = false; }
    if (!good) return fail('bad-signature', `the key-chain retirement of ${e.retire} does not check`);
    retired.add(e.retire);
  }
  if (retired.has(record.keyId)) return fail('unknown-key', `key ${record.keyId} is retired (a signed retirement in the key chain)`);
  const pub = reach.get(record.keyId);
  if (!pub) return fail('unknown-key', `key ${record.keyId} is not trusted here and no chain from a trusted key reaches it`);
  const sha256 = crypto.createHash('sha256').update(bundleBytes).digest('hex');
  let good = false;
  try { good = crypto.verify(null, bundleMessage(version, sha256, record.keyId, record), publicKeyObject(pub, crypto), b64(record.sig, 64)); } catch { good = false; }
  if (!good) return fail('bad-signature', `the signature by ${record.keyId} does not match these ${bundleBytes.length} bytes`);
  // THE FLOOR (fix r2, verify-r1 RED-1): a validly signed release OLDER than the newest one this device ran is a replay
  // unless the release key SIGNED the rollback — and that statement is honoured once per bundle
  const floor = typeof opts.floor === 'string' && VERSION_RE.test(opts.floor) ? opts.floor : null;
  let rollback = false;
  if (floor && compareVersions(version, floor) < 0) {
    if (record.allowDowngradeTo !== version) return fail('downgrade', `${version} is older than ${floor}, the newest version this device ran — an older release lands only as a signed rollback (allowDowngradeTo)`, { floor });
    if (Array.isArray(opts.honoured) && opts.honoured.includes(sha256)) return fail('downgrade', `the signed rollback to ${version} was honoured once already (sha256 ${sha256.slice(0, 12)}…) — a second time is a replay`, { floor });
    rollback = true;
  }
  const viaChain = !trustedIds.has(record.keyId);
  // the pin after (fix r2, low ④): every key still trusted — the pinned set plus every successor the chain reached
  // (a successor ADDS; the siblings stay), minus a signed retirement; the signer first (a 16-key cap never drops it)
  const after = [[record.keyId, pub], ...[...reach].filter(([id]) => id !== record.keyId)].filter(([id]) => !retired.has(id)).slice(0, MAX_KEYS).map(([keyId, publicKey]) => ({ keyId, publicKey }));
  const was = keyMap(publicKeys, crypto);
  const changed = tofu || after.length !== was.size || after.some((k) => !was.has(k.keyId));
  return { ok: true, keyId: record.keyId, sha256, viaChain, tofu, rollback, floor, trustAfter: changed ? after : null };
}

/** The release machine's half: sign a bundle (privateKey = PEM text or a KeyObject). `opts.keys` = the release's key set
 *  (src/agentd/release-keys.js RELEASE_KEYS — signed into the record; default: the signer alone; null: none);
 *  `opts.allowDowngradeTo` = this version, when the release is a deliberate rollback below devices' floors; `opts.helper` = the
 *  release's prebuilt Mac screen helper row { version, sha256, identity } (lane apple-signing), signed into the message. */
function sign(privateKey, bundleBytes, version, opts) {
  const crypto = need(opts);
  if (typeof version !== 'string' || !VERSION_RE.test(version)) throw new Error('agentd-signature: not a version: ' + version);
  const publicKey = publicKeyOf(privateKey, opts);
  const keyId = keyIdOf(publicKey, opts);
  const keys = opts.keys === null ? null : (Array.isArray(opts.keys) ? opts.keys : [{ keyId, publicKey }]).map((k) => ({ keyId: k.keyId, publicKey: k.publicKey }));
  if (keys && !keys.some((k) => k.keyId === keyId && k.publicKey === publicKey)) throw new Error('agentd-signature: the signing key is not in the key set it signs');
  if (opts.allowDowngradeTo != null && opts.allowDowngradeTo !== version) throw new Error(`agentd-signature: allowDowngradeTo ${opts.allowDowngradeTo} is not this release's version ${version}`);
  let helper = null;
  if (opts.helper != null) { const bad = helperShape(opts.helper); if (bad) throw new Error('agentd-signature: ' + bad); const h = opts.helper; helper = { version: h.version, sha256: h.sha256, identity: { kind: h.identity.kind, teamId: h.identity.teamId || null, identifier: h.identity.identifier || null } }; }
  const extra = { ...(keys ? { keys } : {}), ...(opts.allowDowngradeTo != null ? { allowDowngradeTo: version } : {}), ...(helper ? { helper } : {}) };
  const sha256 = crypto.createHash('sha256').update(bundleBytes).digest('hex');
  const sig = crypto.sign(null, bundleMessage(version, sha256, keyId, extra), privateKey).toString('base64');
  const chain = Array.isArray(opts.chain) ? opts.chain.map((l) => (l.retire != null ? { retire: l.retire, sig: l.sig } : { keyId: l.keyId, publicKey: l.publicKey, by: l.by, sig: l.sig })) : [];
  return { v: 1, version, sha256, keyId, sig, chain, ...extra };
}

/** A rotation: the PREDECESSOR's private key signs the successor's public key — the link every manifest carries after. */
function signLink(predecessorPrivateKey, successorPublicKey, opts) {
  const crypto = need(opts);
  const by = keyIdOf(publicKeyOf(predecessorPrivateKey, opts), opts);
  const keyId = keyIdOf(successorPublicKey, opts);
  if (!keyId) throw new Error('agentd-signature: the successor is not an ed25519 public key');
  const l = { keyId, publicKey: successorPublicKey, by };
  return { ...l, sig: crypto.sign(null, linkMessage(l), predecessorPrivateKey).toString('base64') };
}

/** A retirement (fix r2): the key's OWN holder says it is no longer trusted — a KEY_CHAIN entry devices drop it on. */
function signRetire(privateKey, opts) {
  const crypto = need(opts);
  const keyId = keyIdOf(publicKeyOf(privateKey, opts), opts);
  return { retire: keyId, sig: crypto.sign(null, retireMessage(keyId), privateKey).toString('base64') };
}

/** A fresh release key pair; `passphrase` encrypts the private PEM (PKCS#8, aes-256-cbc). */
function generateKeyPair(opts) {
  const crypto = need(opts);
  const enc = opts.passphrase ? { cipher: 'aes-256-cbc', passphrase: opts.passphrase } : {};
  const { privateKey } = crypto.generateKeyPairSync('ed25519', { privateKeyEncoding: { type: 'pkcs8', format: 'pem', ...enc }, publicKeyEncoding: { type: 'spki', format: 'der' } });
  const publicKey = publicKeyOf(opts.passphrase ? crypto.createPrivateKey({ key: privateKey, passphrase: opts.passphrase }) : privateKey, opts);
  return { privateKeyPem: privateKey, publicKey, keyId: keyIdOf(publicKey, opts) };
}

/**
 * THE HUB'S IDENTITY CHECK (no crypto beyond the digest it was handed): is `manifest` the release record of the bundle
 * this hub built? → { signed: true, manifest } | { signed: false, code: 'unsigned-local-build', why }. A hub never
 * ships a bundle whose bytes are not the signed ones; the device does the cryptographic verdict.
 */
function manifestMatches(manifest, { sha256, version }) {
  const no = (why) => ({ signed: false, code: 'unsigned-local-build', why });
  if (manifest == null) return no('no release manifest (this build was never signed)');
  const bad = shapeOf(manifest);
  if (bad) return no('the release manifest is malformed: ' + bad);
  if (typeof manifest.sha256 !== 'string' || !SHA_RE.test(manifest.sha256)) return no('the release manifest names no sha256');
  if (manifest.sha256 !== sha256) return no(`this build (sha256 ${String(sha256).slice(0, 12)}…) is not the signed release (${manifest.sha256.slice(0, 12)}…)`);
  if (manifest.version !== version) return no(`the release manifest is for ${manifest.version}, this bundle is ${version}`);
  return { signed: true, manifest };
}

/** trusted-keys.json (the device's pin) — parse → the key list, or null when it is no pin. */
function parseTrust(text) {
  let j = null; try { j = JSON.parse(String(text)); } catch { return null; }
  if (!j || j.v !== 1 || !Array.isArray(j.keys)) return null;
  const keys = j.keys.filter((k) => k && typeof k.keyId === 'string' && KEYID_RE.test(k.keyId) && typeof k.publicKey === 'string' && b64(k.publicKey, 32)).slice(0, MAX_KEYS).map((k) => ({ keyId: k.keyId, publicKey: k.publicKey }));
  return keys.length ? keys : null;
}
function trustText(keys, { from, at }) {
  return JSON.stringify({ v: 1, keys: keys.map((k) => ({ keyId: k.keyId, publicKey: k.publicKey })), from, at }, null, 2) + '\n';
}
/** release-floor.json (the device's version floor, fix r2) — parse → { floor, honoured } or null. */
function parseFloor(text) {
  let j = null; try { j = JSON.parse(String(text)); } catch { return null; }
  if (!j || j.v !== 1) return null;
  return { floor: typeof j.floor === 'string' && VERSION_RE.test(j.floor) ? j.floor : null, honoured: Array.isArray(j.honoured) ? j.honoured.filter((h) => typeof h === 'string' && SHA_RE.test(h)).slice(-32) : [] };
}
function floorText({ floor, honoured = [], at }) {
  return JSON.stringify({ v: 1, floor, honoured: honoured.slice(-32), at }, null, 2) + '\n';
}

module.exports = { verify, sign, signLink, signRetire, generateKeyPair, keyIdOf, publicKeyOf, manifestMatches, parseTrust, trustText, parseFloor, floorText, compareVersions, bundleMessage, linkMessage, retireMessage, helperLine, helperShape, REFUSALS, VERSION_RE, DOMAIN_BUNDLE, DOMAIN_LINK, DOMAIN_RETIRE };
