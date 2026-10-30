'use strict';
/**
 * THE VAULT (lane vault-e2e-password, the owner 2026-10-19 after a leaked-credential incident: "第一时间实现 e2e 加密的 vault
 * 功能，直接使用 secondary password 而不是自动解锁，vibespace 重启后的第一次登陆必须输入 secondary password 解锁 vault，解锁状态
 * 暂存在内存里"). Before it, every store's key sat in a file beside the data it opened (src/key-file.js: `.accounts-key`
 * next to accounts.json …) — whoever held the disk held every secret. Now ONE random 32-byte DEK opens every store key,
 * and only the owner's SECOND password unwraps the DEK. Nothing on disk opens anything without that password.
 *
 * The record — data/vault.json (0600):
 *   { v: 1,
 *     kdf: { name: 'scrypt', N, r, p, keyLen: 32, salt },          KEK = scrypt(password, salt) — measured ≥ 250 ms (KDF_FLOOR_MS)
 *     check: HMAC-SHA256(KEK, CHECK_TEXT)                          a wrong password, told apart BEFORE the unwrap (constant time)
 *     wrapped: { iv, tag, ct }                                     AES-256-GCM(DEK) under the KEK
 *     verifier: HMAC-SHA256(DEK, VERIFY_TEXT)                      the unwrapped DEK is THE DEK — a damaged record ⇒ `corrupt`
 *     entries: { <name>: { iv, tag, ct } }                         AES-256-GCM(store key | small secret) under the DEK, AAD = name
 *     createdAt, rotatedAt, idleLockHours, sealing? }              sealing = the migration's pending shreds (resumed at unlock)
 *
 * SHARED tier, NO fs and NO state: the record's verdicts only (node:crypto is the one import — test-architecture's PURE tier
 * forbids even a builtin, so this file is SHARED with zero I/O; src/server/vault-engine.js holds the DEK and the file).
 * Passwords and keys travel as Buffers and are zeroed after use where node lets us (a JS string — the request body's
 * password — cannot be: the engine turns it into a Buffer at the door and drops the string). Never a password, a key or a
 * plaintext in an error message, a log line or a return value but the DEK `unlock` hands its one caller.
 */
const crypto = require('crypto');

const VAULT_V = 1;
const VAULT_FILE = 'vault.json';
// N 2^17 · r 8 · p 2 = 128 MiB, measured 393–472 ms on the hub (32 cores, load 16; p 1 measured 223–235 ms — under the floor)
const KDF = Object.freeze({ name: 'scrypt', N: 1 << 17, r: 8, p: 2, keyLen: 32 });
const KDF_FLOOR_MS = 250;
const CHECK_TEXT = 'vibespace-vault-kek-check-v1';
const VERIFY_TEXT = 'vibespace-vault-dek-verifier-v1';
const STATES = Object.freeze(['not_set_up', 'locked', 'unlocked']);
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 1024;
/** The codes a vault door answers by name (src/lib/vault-unlock.js words each). */
const CODES = Object.freeze(['vault_locked', 'vault_not_set_up', 'already_set_up', 'wrong_password', 'corrupt', 'paced', 'password_too_short',
  'password_too_long', 'password_not_text', 'same_as_sign_in', 'same_password', 'migration_failed', 'human_only', 'cross_site']);

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const isBox = (b) => !!b && typeof b === 'object' && [b.iv, b.tag, b.ct].every((s) => typeof s === 'string' && B64.test(s));

/** Fill a Buffer with zeros (a no-op on anything else). */
function zero(...bufs) { for (const b of bufs) if (Buffer.isBuffer(b)) b.fill(0); }

/** A password from a request body → `{ ok, pw: Buffer }` | `{ ok: false, code }`. */
function passwordOf(v) {
  if (typeof v !== 'string') return { ok: false, code: 'password_not_text' };
  if ([...v].length < PASSWORD_MIN) return { ok: false, code: 'password_too_short' };
  if (v.length > PASSWORD_MAX) return { ok: false, code: 'password_too_long' };
  return { ok: true, pw: Buffer.from(v, 'utf8') };
}

/** KEK = scrypt(password, salt) — async (the libuv pool: the hub's event loop never waits on it). */
function deriveKek(pw, kdf) {
  return new Promise((resolve, reject) => {
    const salt = Buffer.from(String(kdf.salt || ''), 'base64');
    const maxmem = 256 * kdf.N * kdf.r + 64 * 1024 * 1024;
    crypto.scrypt(pw, salt, kdf.keyLen || 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem }, (e, k) => (e ? reject(e) : resolve(k)));
  });
}

const hmac = (key, text) => crypto.createHmac('sha256', key).update(text).digest();
/** Constant-time compare of a computed digest with the base64 one the record holds. */
function sameDigest(got, b64) {
  const want = Buffer.from(String(b64 || ''), 'base64');
  return want.length === got.length && crypto.timingSafeEqual(got, want);
}

function seal(key, plain, aad) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) c.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}
/** → the plaintext Buffer, or null (a wrong key, a damaged box, another entry's box under this name). */
function open(key, box, aad) {
  if (!isBox(box)) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
    if (aad) d.setAAD(Buffer.from(aad, 'utf8'));
    d.setAuthTag(Buffer.from(box.tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(box.ct, 'base64')), d.final()]);
  } catch { return null; }
}

/** Is this a record this build reads? (shape only — no secret is opened) */
function recordShapeOk(rec) {
  if (!rec || typeof rec !== 'object' || rec.v !== VAULT_V) return false;
  const k = rec.kdf;
  if (!k || k.name !== 'scrypt' || ![k.N, k.r, k.p].every((n) => Number.isInteger(n) && n > 0) || (k.N & (k.N - 1)) !== 0) return false;
  if (typeof k.salt !== 'string' || !B64.test(k.salt)) return false;
  if (typeof rec.check !== 'string' || typeof rec.verifier !== 'string' || !isBox(rec.wrapped)) return false;
  if (!rec.entries || typeof rec.entries !== 'object' || Array.isArray(rec.entries)) return false;
  return Object.values(rec.entries).every(isBox);
}

/** A fresh vault → `{ record, dek }` (the DEK is the caller's to hold — and to zero). `pw` is a Buffer. */
async function setup(pw, { kdf = KDF, now = Date.now() } = {}) {
  const dek = crypto.randomBytes(32);
  const params = { name: 'scrypt', N: kdf.N, r: kdf.r, p: kdf.p, keyLen: 32, salt: crypto.randomBytes(16).toString('base64') };
  const kek = await deriveKek(pw, params);
  try {
    const record = {
      v: VAULT_V, kdf: params,
      check: hmac(kek, CHECK_TEXT).toString('base64'),
      wrapped: seal(kek, dek, 'dek'),
      verifier: hmac(dek, VERIFY_TEXT).toString('base64'),
      entries: {}, createdAt: now, rotatedAt: null, idleLockHours: 0,
    };
    return { record, dek };
  } finally { zero(kek); }
}

/** → `{ ok: true, dek }` | `{ ok: false, code: 'not_set_up' | 'corrupt' | 'wrong_password' }`. `pw` is a Buffer. */
async function unlock(record, pw) {
  if (!record) return { ok: false, code: 'not_set_up' };
  if (!recordShapeOk(record)) return { ok: false, code: 'corrupt' };
  let kek = null;
  try { kek = await deriveKek(pw, record.kdf); } catch { return { ok: false, code: 'corrupt' }; }
  try {
    if (!sameDigest(hmac(kek, CHECK_TEXT), record.check)) return { ok: false, code: 'wrong_password' };
    const dek = open(kek, record.wrapped, 'dek');
    if (!dek || dek.length !== 32) { zero(dek); return { ok: false, code: 'corrupt' }; }   // the password was right: the wrap is damaged
    if (!sameDigest(hmac(dek, VERIFY_TEXT), record.verifier)) { zero(dek); return { ok: false, code: 'corrupt' }; }
    return { ok: true, dek };
  } finally { zero(kek); }
}

/** Re-wrap the DEK under a new password (a new salt, a new KEK) — the entries stay as they are. → `{ ok, record }` | `{ ok: false, code }`. */
async function changePassword(record, oldPw, newPw, { now = Date.now() } = {}) {
  const u = await unlock(record, oldPw);
  if (!u.ok) return u;
  try {
    const params = { ...record.kdf, salt: crypto.randomBytes(16).toString('base64') };
    const kek = await deriveKek(newPw, params);
    try {
      return { ok: true, record: { ...record, kdf: params, check: hmac(kek, CHECK_TEXT).toString('base64'), wrapped: seal(kek, u.dek, 'dek'), rotatedAt: now } };
    } finally { zero(kek); }
  } finally { zero(u.dek); }
}

/** A store key (or a small secret) into an entry — AAD = its name, so an entry copied under another name never opens. */
function wrapEntry(dek, name, plain) { return seal(dek, plain, 'entry:' + name); }
/** → the Buffer, or null (damaged / not this name's). */
function unwrapEntry(dek, name, box) { return open(dek, box, 'entry:' + name); }

/** THE STATE MACHINE: no record ⇒ not_set_up; a record and no DEK in memory ⇒ locked; both ⇒ unlocked. */
function stateOf({ record, dek }) { return !record ? 'not_set_up' : (Buffer.isBuffer(dek) && dek.length === 32 ? 'unlocked' : 'locked'); }

/**
 * THE STATE TABLE — what a store's key read answers in each state (the engine's keyFor runs it; test-vault pins every row):
 *   not_set_up                        → 'legacy'        the key-file law over the file (the migration window: the files are
 *                                                       read — and a store's first key minted — exactly as before)
 *   locked                            → 'vault_locked'  nothing is read, nothing is minted; the row says unlock first
 *   unlocked, an entry                → 'entry'
 *   unlocked, no entry, a key file    → 'adopt'         a file the migration did not see (a restored backup): sealed in now
 *   unlocked, no entry, no file       → 'mint' | 'key-missing'  (the key-file law's own question: does the store hold ciphertext?)
 */
function keyVerdict({ state, hasEntry = false, legacyFile = false, holdsCiphertext = true }) {
  if (state === 'not_set_up') return 'legacy';
  if (state !== 'unlocked') return 'vault_locked';
  if (hasEntry) return 'entry';
  if (legacyFile) return 'adopt';
  return holdsCiphertext ? 'key-missing' : 'mint';
}

// ── AGENT-OWNED SECRETS (design q-043 §9, lane vault-mint-put): an agent mints or stores a secret under ITS OWN namespace
//    `agent:<scope>/<name>` (the scope = this conversation or group) — the SCOPE is the authenticated session's (never the
//    `<name>` is the agent's short label and holds NO `/` and NO `:`, so a name can never carry a scope of its own (a
//    namespace escape is refused before any entry is touched). `mint` = the HUB makes the random value and seals it; the
//    agent is handed only the entry name + its `vault://` reference, never the value. `put` = the agent hands a value it
//    already has (a vendor key). Both land as engine secret entries (src/server/vault-engine.js secretGet/-Put). ──
const AGENT_SCOPE_RE = /^[A-Za-z0-9._:-]{1,128}$/;   // a conversation / group id (the shape desktop-handover's `agent:<id>` uses)
const AGENT_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;      // the agent's short label — NO `/`, NO `:`
const AGENT_NS_RE = /^agent:[A-Za-z0-9._:-]{1,128}\/[A-Za-z0-9._-]{1,64}$/;   // the full entry name
/** Build `agent:<scope>/<name>` from a SERVER-DERIVED scope + the agent's short name.
 *  → { ok, name } | { ok:false, code:'bad_scope'|'bad_name' }. */
function agentEntryName(scope, name) {
  if (!AGENT_SCOPE_RE.test(String(scope == null ? '' : scope))) return { ok: false, code: 'bad_scope' };
  if (!AGENT_NAME_RE.test(String(name == null ? '' : name))) return { ok: false, code: 'bad_name' };
  return { ok: true, name: `agent:${scope}/${name}` };
}
/** The `vault://` reference the agent is handed (it never sees the value — this only names where it lives). */
const vaultRefOf = (name) => `vault://${name}`;

// ── MINT = the hub's own randomness (design q-043 §9). The charset + length an agent picks for the target site; the value
//    is chars drawn UNIFORMLY from the alphabet (rejection sampling — never a modulo bias). ──
const MINT_CHARSETS = Object.freeze({
  'ascii-printable': '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~',
  alnum: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  digits: '0123456789',
});
const MINT_LEN_MIN = 8, MINT_LEN_MAX = 256, MINT_LEN_DEFAULT = 24, MINT_CHARSET_DEFAULT = 'ascii-printable';
/** → { ok, length, charset } | { ok:false, code:'bad_length'|'bad_charset' }. */
function mintVerdict({ length, charset } = {}) {
  const len = length == null || length === '' ? MINT_LEN_DEFAULT : Number(length);
  if (!Number.isInteger(len) || len < MINT_LEN_MIN || len > MINT_LEN_MAX) return { ok: false, code: 'bad_length' };
  const cs = charset == null || charset === '' ? MINT_CHARSET_DEFAULT : String(charset);
  if (!MINT_CHARSETS[cs]) return { ok: false, code: 'bad_charset' };
  return { ok: true, length: len, charset: cs };
}
/** A random secret of `length` chars from `charset`'s alphabet → a Buffer (the caller's to seal, then zero). Uniform: a
 *  byte ≥ floor(256/A)*A is rejected (no modulo bias), so the A symbols are equiprobable. `rand(n)` ⇒ n random bytes. */
function randomSecret(length, charset, rand = (n) => crypto.randomBytes(n)) {
  const alpha = MINT_CHARSETS[charset];
  if (!alpha || !Number.isInteger(length) || length <= 0) throw new TypeError('randomSecret: bad length or charset');
  const A = alpha.length, limit = Math.floor(256 / A) * A, out = Buffer.alloc(length);
  let i = 0;
  while (i < length) {
    const bytes = rand(Math.max(16, (length - i) * 2));
    for (let j = 0; j < bytes.length && i < length; j++) { const b = bytes[j]; if (b < limit) out[i++] = alpha.charCodeAt(b % A); }
  }
  return out;
}

/**
 * THE VAULT LAW, EXTENDED (lane vault-e2e-password-fix-r2 — docs/kb-design-lessons.md): EVERY SECRET AT REST NAMES ITS VAULT
 * ENTRY — or a hash stands in its place, or it is an EXCEPTION named here with its reason. A new secret written to disk is
 * a row in this table before it ships (scripts/test-vault-secrets.mjs ⑧ plants every sealed row's value in the clear,
 * boots a hub's data dir through the migration and finds none in any file).
 */
const SECRETS_AT_REST = Object.freeze([
  { what: 'the store keys', where: 'data/.accounts-key · .mounts-key · .integrations-key · .channels-key · .app-secrets-key · browser-passkeys.key', entry: '<the key file\'s name>' },
  { what: 'the device link tokens (vsht_)', where: 'data/agentd/host-<id>.token', entry: 'host:<host id>' },
  { what: 'the attach configs', where: 'data/agentd/session-<id>.json', holds: 'no token — the attach child asks GET /api/agent/vault/link-token at every (re)start' },
  { what: 'the frp relay\'s SHARED token (the owner\'s override — the knock frps asks during the relay\'s grace only)', where: 'data/plugins.json frp.config', entry: 'frp:token', retires: 'dropped once the instance\'s own relay token published and a frpc started without the shared one logged in (frp.js RETIRE_ID 2026-10-relay-token-per-instance)' },
  { what: 'the relay token (per instance, vsrt_)', where: 'data/relay-token.json', exception: 'the owner\'s decision (design q-051, 2026-10-20): not in the vault — a restart re-publishes the instance\'s public mirrors without the second password; a stolen token reaches that one instance\'s public names only (the relay\'s login plugin binds them to its id), never the hub; revocable (Plugins › Public URLs › Revoke + relay-admin revoke)' },
  { what: 'the voice sign-in pair', where: 'data/dropline-oauth.json', entry: 'file:dropline-oauth.json (the sealed file\'s key)' },
  { what: 'VibeSpace\'s own automation keys (vsak_, design q-046)', where: 'data/automation-keys.json holds each key\'s sha256 digest + its grants', entry: 'apikey:<key id>' },
  { what: 'the maintainer key (vsmk_, lane fleet-feedback-marks)', where: 'NOT on the instance — env VIBESPACE_MAINTAINER_KEY_SHA (the chart\'s maintainerKeySha)', holds: 'its sha256 only — the value is the maintainers\' (their triage job\'s 0600 file); it opens feedback.list / feedback.handled here and nothing else' },
  { what: 'the two-step (TOTP) seeds and their settings (design q-047)', where: 'the vault record only — data/vault-grants.json holds who may have the CODE, never a seed', entry: 'totp:<name>' },
  { what: 'the login tokens', where: 'data/auth.json tokens', holds: 'sha256 digests only' },
  { what: 'the pairing / agentd / mount tokens', where: 'data/hosts.json dialTokenHash · agentd-tokens.json · mount-tokens.json', holds: 'sha256 digests only' },
  { what: 'the TLS private key', where: 'data/tls/*.key', exception: 'the sign-in door needs it before any unlock' },
  { what: 'the vendor CLIs\' own credentials', where: 'data/subs/*/.credentials.json · data/codex-subs/*/auth.json', exception: 'the vendor CLI reads its own file (q-040)' },
  { what: 'an Antigravity account\'s Google login', where: 'data/agy-subs/<id>/.gemini/antigravity-cli/antigravity-oauth-token (a 0700 HOME root)', exception: 'agy reads its own file (the keyring is off for a named account, so the login is this file — measured); VibeSpace only stat()s it, never reads it' },
  { what: 'the ssh private keys', where: 'data/ssh/*.key · a host\'s keyPath', exception: 'ssh(1) reads the file — a hub-owned ssh-agent is design q-042 D6' },
  { what: 'the session agent tokens (vsst_)', where: 'data/session-meta/*.json agentToken', exception: 'the running agent\'s own credential (in its env for its life) — sealing the meta is design q-042 D1\'s next step' },
  { what: 'the device side of a pairing', where: 'a device\'s state/token + state/dial.json · the hub\'s own ~/.vibespace/agentd/state/token', exception: 'the device holds its own key (design q-042 D3 retires it)' },
  { what: 'the frpc admin password', where: '~/.vibespace/plugins/frp/admin.pw', exception: 'a loopback-only password for the hub\'s own frpc child' },
  { what: 'the OTLP ingest token', where: 'data/usage-history/otel-token', exception: 'opens only the hub\'s own loopback telemetry door; the surviving sessions\' exporters hold it (a per-boot one would 403 them)' },
  { what: 'the feedback origin key (fk_, lane feedback-forward)', where: 'data/feedback-outbox.json key (0600)', exception: 'it names THIS instance to the maintainer hub (the fleet shares ONE forward token) and opens only the marks on the reports this instance forwarded (ids, a release, a note); the forward and its boot pull run before any unlock — the hub keeps its sha256 only' },
  { what: 'an ssh install\'s staged token', where: '$TMPDIR/vs-agentd-stage-* (removed after the tar)', exception: 'transient: the tar that carries it rides ssh stdin, the stage is removed in the same call' },
  { what: 'a background job\'s retired plain secrets (lane job-secrets-retire)', where: 'data/job-secrets.retired.json (0600)', exception: 'the OWNER\'s bytes, kept until they delete them: the one-shot 2026-10-job-secrets-retired renamed data/job-secrets.json (a store no client wrote — the old POST /api/jobs-secrets, gone with it) here and filed ONE For-you notice naming the file, its names (never a value; a name the secret-shapes belt flags — a value pasted as a name — is counted, never shown) and the recipe — each into the vault as a secret entry, then delete the file; nothing in VibeSpace reads it' },
]);

module.exports = {
  SECRETS_AT_REST,
  VAULT_V, VAULT_FILE, KDF, KDF_FLOOR_MS, STATES, CODES, PASSWORD_MIN, PASSWORD_MAX, CHECK_TEXT, VERIFY_TEXT,
  zero, passwordOf, deriveKek, recordShapeOk, setup, unlock, changePassword, wrapEntry, unwrapEntry, stateOf, keyVerdict,
  AGENT_SCOPE_RE, AGENT_NAME_RE, AGENT_NS_RE, agentEntryName, vaultRefOf,
  MINT_CHARSETS, MINT_LEN_MIN, MINT_LEN_MAX, MINT_LEN_DEFAULT, MINT_CHARSET_DEFAULT, mintVerdict, randomSecret,
};
