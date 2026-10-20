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
  { what: 'the two-step (TOTP) seeds and their settings (design q-047)', where: 'the vault record only — data/vault-grants.json holds who may have the CODE, never a seed', entry: 'totp:<name>' },
  { what: 'the login tokens', where: 'data/auth.json tokens', holds: 'sha256 digests only' },
  { what: 'the pairing / agentd / mount tokens', where: 'data/hosts.json dialTokenHash · agentd-tokens.json · mount-tokens.json', holds: 'sha256 digests only' },
  { what: 'the TLS private key', where: 'data/tls/*.key', exception: 'the sign-in door needs it before any unlock' },
  { what: 'the vendor CLIs\' own credentials', where: 'data/subs/*/.credentials.json · data/codex-subs/*/auth.json', exception: 'the vendor CLI reads its own file (q-040)' },
  { what: 'the ssh private keys', where: 'data/ssh/*.key · a host\'s keyPath', exception: 'ssh(1) reads the file — a hub-owned ssh-agent is design q-042 D6' },
  { what: 'the session agent tokens (vsst_)', where: 'data/session-meta/*.json agentToken', exception: 'the running agent\'s own credential (in its env for its life) — sealing the meta is design q-042 D1\'s next step' },
  { what: 'the device side of a pairing', where: 'a device\'s state/token + state/dial.json · the hub\'s own ~/.vibespace/agentd/state/token', exception: 'the device holds its own key (design q-042 D3 retires it)' },
  { what: 'the frpc admin password', where: '~/.vibespace/plugins/frp/admin.pw', exception: 'a loopback-only password for the hub\'s own frpc child' },
  { what: 'the OTLP ingest token', where: 'data/usage-history/otel-token', exception: 'opens only the hub\'s own loopback telemetry door; the surviving sessions\' exporters hold it (a per-boot one would 403 them)' },
  { what: 'an ssh install\'s staged token', where: '$TMPDIR/vs-agentd-stage-* (removed after the tar)', exception: 'transient: the tar that carries it rides ssh stdin, the stage is removed in the same call' },
]);

module.exports = {
  SECRETS_AT_REST,
  VAULT_V, VAULT_FILE, KDF, KDF_FLOOR_MS, STATES, CODES, PASSWORD_MIN, PASSWORD_MAX, CHECK_TEXT, VERIFY_TEXT,
  zero, passwordOf, deriveKek, recordShapeOk, setup, unlock, changePassword, wrapEntry, unwrapEntry, stateOf, keyVerdict,
};
