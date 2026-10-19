'use strict';
/**
 * THE VAULT ENGINE (lane vault-e2e-password) — the ONE holder of the vault's DEK, IN MEMORY ONLY, and THE provider of every
 * store key under its data dir (src/secret-box.js `lawfulKey` asks it first: `registerVault`). The record and its verdicts
 * are src/vault.js; this file is the file, the clock, the doors' logic, the audit and the broadcast.
 *
 *   · DEFAULT = LOCKED after every start: nothing here ever unlocks but `unlock(password)` from a person's door (the request
 *     body of POST /api/vault/unlock). No env var, no file, no cluster preset, no sign-in session opens it — there is no
 *     such path, and scripts/test-vault-law.mjs is RED on one (a password reaching `unlock` from anywhere else).
 *   · LOCKED ⇒ every store's key read answers `key-unreadable:vault_locked` (the key-file law's own transient refusal: the
 *     stores already say "could not be read — nothing written, read again next time"); NOTHING is read, NOTHING is minted.
 *   · `lock()` zeroes the DEK and every unwrapped store key (the door, SIGTERM / SIGINT, the opt-in idle timer).
 *   · NOT SET UP = the migration window: the key files beside the data are read (and a store's first key minted) exactly as
 *     before, and the app asks for the second password at every load until it is set. `setup(password)` moves every key file
 *     into the vault — read, wrap, write the record, READ IT BACK and open every entry, then a `.sealed` marker replaces each
 *     file (overwritten, then unlinked) — through src/migration-runner.js (ledger `vault-seal-<createdAt>`); a failure at any
 *     step puts every file back byte for byte and removes the record (never lose data).
 *   · 5 wrong passwords in a row ⇒ the next minute refuses `paced` (the whole vault, every caller: an address that changes
 *     does not get five more); every failure is an audit line with the caller's address — never the password.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const V = require('../vault.js');
const SB = require('../secret-box.js');
const KF = require('../key-file.js');
const { runMigrations } = require('../migration-runner.js');

/** THE STORE KEYS the vault holds — the key files the key-file law used to keep beside their data (name = the base name under
 *  data/; `raw` = the file holds the 32 bytes, else 64 hex characters). scripts/test-vault-law.mjs: every key file a src/
 *  store names is a row here. */
const STORE_KEYS = Object.freeze([
  { name: '.accounts-key', store: 'accounts' },
  { name: '.mounts-key', store: 'mounts' },
  { name: '.integrations-key', store: 'integrations' },
  { name: '.channels-key', store: 'channels' },
  { name: '.app-secrets-key', store: 'app-secrets' },
  { name: 'browser-passkeys.key', store: 'passkeys', raw: true },
]);
const SEALED_SUFFIX = '.sealed';
const AUDIT_FILE = 'vault-audit.jsonl';
const PACE_AFTER = 5;
const PACE_MS = 60e3;
const IDLE_MAX_HOURS = 720;

let SIGNALS_ARMED = false;
const LIVE = new Set();   // every engine of this process — a signal locks them all

function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeSync(fd, text); try { fs.fsyncSync(fd); } catch { /* best effort */ } } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
  try { const d = fs.openSync(path.dirname(file), 'r'); try { fs.fsyncSync(d); } finally { fs.closeSync(d); } } catch { /* a dir fsync is best effort */ }
}

/** Overwrite a file's bytes in place (random, same length, fsync) and unlink it — the plaintext key never lingers in a free block we could reach. */
function shred(file) {
  const st = fs.statSync(file);
  const fd = fs.openSync(file, 'r+');
  try { if (st.size > 0) fs.writeSync(fd, crypto.randomBytes(st.size), 0, st.size, 0); try { fs.fsyncSync(fd); } catch { } } finally { fs.closeSync(fd); }
  fs.unlinkSync(file);
}

/**
 * @param {object} o
 * @param {string} o.dataDir  the data dir whose key files this vault holds (registered with secret-box: every `lawfulKey` under it asks here)
 * @param {(pw:string)=>boolean} [o.signInPassword]  is this the instance's SIGN-IN password? (refused as the second password)
 * @param {(msg:object)=>void} [o.bcast]  the WS broadcast (`vault-state`, every client — the multi-client law)
 * @param {object} [o.kdf]  scrypt params for a NEW record (suites pass a cheap one; the record carries what it was made with)
 * @param {(step:string, name:string)=>void} [o.faultAt]  suites only: throws at a named migration step (the rollback legs)
 */
function create({ dataDir, signInPassword = () => false, bcast = () => {}, log = console, now = () => Date.now(), kdf = V.KDF, register = true, signals = false, idleTimer = true, faultAt = null } = {}) {
  if (!dataDir) throw new TypeError('vault-engine: dataDir is required');
  const FILE = path.join(dataDir, V.VAULT_FILE);
  let record = null;          // the parsed record | null (not set up)
  let recordBad = null;       // a vault.json that is there but not readable / not a record: LOCKED for good (never the legacy files beside it)
  let dek = null;             // THE DEK — in memory only, zeroed by lock()
  const keys = new Map();     // name → unwrapped store key (zeroed by lock())
  let epoch = 0;              // bumped at every unlock / lock — a cache of a key (the passkey cipher) is good for one epoch
  let lockedSince = now();
  let failedTries = 0, pacedUntil = 0, busy = false, lastActivity = now(), inFlight = 0;   // inFlight: derives running now count toward the pace BEFORE they land (verify r1 A1: 40 concurrent wrong passwords landed 40 derives)
  const unlockHooks = [];   // what a locked start left undone and the unlock must retry (the wiring: mounts' restore)

  function load() {
    let text;
    try { text = fs.readFileSync(FILE, 'utf8'); } catch (e) {
      if (e && e.code === 'ENOENT') { record = null; recordBad = null; return; }
      record = null; recordBad = `unreadable:${KF.errnoOf(e)}`; return;
    }
    let rec = null;
    try { rec = JSON.parse(text); } catch { rec = null; }
    if (rec && V.recordShapeOk(rec)) { record = rec; recordBad = null; } else { record = null; recordBad = 'not-a-record'; }
  }
  load();

  const setUp = () => !!record || !!recordBad;
  const state = () => (setUp() ? (dek ? 'unlocked' : 'locked') : 'not_set_up');
  const audit = (event, extra = {}) => {
    const line = { at: new Date(now()).toISOString(), event, ...extra };
    try { fs.appendFileSync(path.join(dataDir, AUDIT_FILE), JSON.stringify(line) + '\n', { mode: 0o600 }); } catch { /* the log line below still says it */ }
    try { log.log?.(`[vault] ${event}${extra.ip ? ' from ' + extra.ip : ''}${extra.code ? ' (' + extra.code + ')' : ''}${extra.why ? ' — ' + extra.why : ''}`); } catch { }
  };
  function facts() {
    const st = state(), t = now();
    return {
      state: st,
      setUpAt: record ? record.createdAt || null : null,
      rotatedAt: record ? record.rotatedAt || null : null,
      lockedSince: st === 'locked' ? lockedSince : null,
      failedTries,
      pacedForMs: pacedUntil > t ? pacedUntil - t : 0,
      idleLockHours: record ? Number(record.idleLockHours) || 0 : 0,
      corrupt: !!recordBad,
      keys: record ? Object.keys(record.entries).length : 0,
    };
  }
  const announce = () => { try { bcast({ type: 'vault-state', ...facts() }); } catch { } };

  function writeRecord(rec) {
    if (faultAt) faultAt('write-record', '');
    writeAtomic(FILE, JSON.stringify(rec, null, 2) + '\n');
  }
  function readRecordFile() { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }

  // ── the key files beside the data (the migration window's readers — ONLY here and in secret-box's legacy branch) ──
  /** → { ok, key, bytes } | { ok:false, code } | null (absent). Never mints. */
  function readLegacy(file, raw) {
    let bytes;
    try { bytes = fs.readFileSync(file); } catch (e) { return e && e.code === 'ENOENT' ? null : { ok: false, code: `key-unreadable:${KF.errnoOf(e)}` }; }
    const key = raw ? KF.parseRawKey(Buffer.from(bytes)) : KF.parseHexKey(bytes.toString('utf8'));
    return key ? { ok: true, key: Buffer.from(key), bytes } : { ok: false, code: 'key-malformed' };
  }
  function sealOne(it, at) {
    if (faultAt) faultAt('marker', it.name);
    fs.writeFileSync(it.file + SEALED_SUFFIX, JSON.stringify({ sealed: true, entry: it.name, vault: V.VAULT_FILE, at }) + '\n', { mode: 0o600 });
    if (faultAt) faultAt('shred', it.name);
    shred(it.file);
  }
  /** Put every planned file back byte for byte and drop its marker (the rollback of a failed seal). */
  function restore(plan) {
    const lost = [];   // → the names NOT put back (verify r1 B3: the record is the only copy of those — it is never unlinked then)
    for (const it of plan) {
      try { if (!fs.existsSync(it.file)) fs.writeFileSync(it.file, it.bytes, { mode: 0o600, flag: 'wx' }); } catch (e) { lost.push(it.name); audit('vault-restore-failed', { why: `${it.name}: ${KF.errnoOf(e)}` }); }
      try { fs.unlinkSync(it.file + SEALED_SUFFIX); } catch { }
    }
    return lost;
  }

  /** The unwrapped key for an entry (cached until lock), or null when the entry does not open. */
  function entryKey(name) {
    if (keys.has(name)) return keys.get(name);
    const box = record && record.entries[name];
    const k = box ? V.unwrapEntry(dek, name, box) : null;
    if (!k || k.length !== 32) { V.zero(k); return null; }
    keys.set(name, k);
    return k;
  }

  /** Seal ONE key file the migration did not see (a restored backup, a file written by an older process) into the vault. */
  function adopt(name, file, raw) {
    const got = readLegacy(file, raw);
    if (!got) return null;
    if (!got.ok) return got;
    const at = now();
    const next = { ...record, entries: { ...record.entries, [name]: V.wrapEntry(dek, name, got.key) }, sealing: { files: [name], at } };
    try { writeRecord(next); } catch (e) { V.zero(got.key); return { ok: false, code: `key-unreadable:${KF.errnoOf(e)}` }; }
    record = next;
    try { sealOne({ name, file, bytes: got.bytes }, at); } catch (e) { restore([{ name, file, bytes: got.bytes }]); audit('vault-adopt-unsealed', { why: `${name}: ${KF.errnoOf(e)}` }); }
    const { sealing, ...rest } = record;
    try { writeRecord(rest); record = rest; } catch { /* resumed at the next unlock */ }
    keys.set(name, got.key);
    audit('vault-adopted', { why: name });
    return { ok: true, key: Buffer.from(got.key) };
  }

  // ── THE PROVIDER secret-box asks (sync: every store reads its key synchronously) ──
  function keyFor(name, { keyFile, raw = false, hasCiphertext = () => true, legacy } = {}) {
    const st = state();
    if (st === 'not_set_up') return typeof legacy === 'function' ? legacy() : { ok: false, code: KF.VAULT_LOCKED };
    if (st === 'locked') return { ok: false, code: KF.VAULT_LOCKED };
    const file = keyFile || path.join(dataDir, name);
    const verdict = V.keyVerdict({ state: st, hasEntry: !!record.entries[name], legacyFile: !record.entries[name] && fs.existsSync(file), holdsCiphertext: (() => { if (record.entries[name] || fs.existsSync(file)) return true; try { return !!hasCiphertext(); } catch { return true; } })() });
    if (verdict === 'entry') { const k = entryKey(name); return k ? { ok: true, key: Buffer.from(k) } : { ok: false, code: 'key-malformed' }; }
    if (verdict === 'adopt') { const r = adopt(name, file, raw); if (r) return r; }
    if (verdict === 'key-missing') return { ok: false, code: 'key-missing' };
    // mint INTO the vault — never a file
    const k = crypto.randomBytes(32);
    const next = { ...record, entries: { ...record.entries, [name]: V.wrapEntry(dek, name, k) } };
    try { writeRecord(next); } catch (e) { V.zero(k); return { ok: false, code: `key-unreadable:${KF.errnoOf(e)}` }; }
    record = next; keys.set(name, k);
    return { ok: true, key: Buffer.from(k), minted: true };
  }
  /** The row fact (never mints, never adopts): null = readable (or made on first use), else the refusal code. */
  function peek(name, { keyFile, hasCiphertext = () => true } = {}) {
    const st = state();
    if (st === 'not_set_up') return undefined;
    if (st === 'locked') return KF.VAULT_LOCKED;
    if (record.entries[name]) return entryKey(name) ? null : 'key-malformed';
    if (fs.existsSync(keyFile || path.join(dataDir, name))) return null;
    try { return hasCiphertext() ? 'key-missing' : null; } catch { return 'key-missing'; }
  }
  const hasEntry = (name) => !!(record && record.entries[name]);

  // ── the migration ──
  /** The key files present now → the plan, or `{ error: { file, code } }` (an unreadable / damaged one stops the setup: it
   *  could never be shredded safely, and the owner must see it). */
  function plan() {
    const out = [];
    for (const k of STORE_KEYS) {
      const file = path.join(dataDir, k.name);
      const got = readLegacy(file, !!k.raw);
      if (!got) continue;
      if (!got.ok) { for (const it of out) V.zero(it.key); return { error: { file: k.name, code: got.code } }; }
      out.push({ name: k.name, file, key: got.key, bytes: got.bytes });
    }
    return out;
  }
  /** An interrupted seal (the process died between the record and the last shred): every listed file that still holds the
   *  very key its entry holds is sealed now; one that differs is left where it is (a key we cannot prove redundant is never
   *  destroyed) and said. */
  function resumeSeal() {
    if (!record || !record.sealing) return;
    const left = [];
    for (const name of record.sealing.files || []) {
      const row = STORE_KEYS.find((k) => k.name === name) || { name };
      const file = path.join(dataDir, name);
      const got = readLegacy(file, !!row.raw);
      if (!got) continue;
      const k = entryKey(name);
      if (got.ok && k && got.key.equals(k)) { try { sealOne({ name, file, bytes: got.bytes }, now()); } catch (e) { left.push(name); audit('vault-seal-resume-failed', { why: `${name}: ${KF.errnoOf(e)}` }); } }
      else { left.push(name); audit('vault-seal-conflict', { why: `${name}: the file and the vault entry differ — the file is kept` }); }
      if (got.ok) V.zero(got.key);
    }
    const { sealing, ...rest } = record;
    try { writeRecord(rest); record = rest; } catch { /* next unlock */ }
    if (left.length) log.warn?.(`[vault] ${left.length} key file(s) left beside the data: ${left.join(', ')}`);
  }

  // ── THE DOORS' LOGIC (src/routes/vault.js is the HTTP; every password arrives here from a request body) ──
  async function setup(password, { ip = null } = {}) {
    if (setUp()) return { ok: false, code: 'already_set_up' };
    const p = V.passwordOf(password);
    if (!p.ok) return p;
    let same = false; try { same = !!signInPassword(password); } catch { }
    if (same) { V.zero(p.pw); return { ok: false, code: 'same_as_sign_in' }; }
    if (busy) { V.zero(p.pw); return { ok: false, code: 'busy' }; }
    busy = true;
    let made = null, items = [];
    try {
      made = await V.setup(p.pw, { kdf, now: now() });
      if (setUp()) { V.zero(made.dek); return { ok: false, code: 'already_set_up' }; }
      const pl = plan();
      if (pl.error) { V.zero(made.dek); audit('vault-setup-refused', { ip, code: pl.error.code, why: pl.error.file }); return { ok: false, code: 'migration_failed', file: pl.error.file, why: pl.error.code }; }
      items = pl;
      const rec = made.record;
      for (const it of items) rec.entries[it.name] = V.wrapEntry(made.dek, it.name, it.key);
      if (items.length) rec.sealing = { files: items.map((it) => it.name), at: rec.createdAt };
      try { writeRecord(rec); } catch (e) { V.zero(made.dek); try { fs.unlinkSync(FILE); } catch { } return { ok: false, code: 'migration_failed', why: `the vault record could not be written (${KF.errnoOf(e)})` }; }
      // READ IT BACK: the record on disk opens every key we are about to shred, or nothing is shredded
      let back = null;
      if (faultAt) faultAt('read-back', '');
      try { back = readRecordFile(); } catch { back = null; }
      const proven = back && V.recordShapeOk(back) && items.every((it) => { const k = V.unwrapEntry(made.dek, it.name, back.entries[it.name]); const same2 = !!k && k.equals(it.key); V.zero(k); return same2; });
      if (!proven) { V.zero(made.dek); try { fs.unlinkSync(FILE); } catch { } audit('vault-setup-refused', { ip, code: 'migration_failed', why: 'read-back' }); return { ok: false, code: 'migration_failed', why: 'the record read back from disk did not open every key — nothing was moved' }; }
      // seal the files — a ledger-keyed one-shot (src/migration-runner.js): a throw is logged, not recorded, and rolled back here
      const [res] = runMigrations({
        ledgerPath: path.join(dataDir, 'migrations.json'), log: (m) => log.log?.(m), warn: (m) => log.warn?.(m),
        migrations: [{ id: `vault-seal-${rec.createdAt}`, note: `${items.length} key file(s) sealed into the vault`, run: () => { for (const it of items) sealOne(it, rec.createdAt); return { keys: items.length }; } }],
      });
      if (!res || res.status !== 'ran') {
        const lost = restore(items); V.zero(made.dek);
        if (lost.length) load(); else try { fs.unlinkSync(FILE); } catch { }   // a file NOT put back lives in the record alone (read back, every key proven): the vault stays set up, LOCKED — the next unlock resumes its seal
        audit('vault-setup-refused', { ip, code: 'migration_failed', why: (res && res.error) || 'seal', ...(lost.length ? { kept: lost } : {}) });
        return { ok: false, code: 'migration_failed', why: lost.length ? `a key file could not be sealed and ${lost.join(', ')} could not be put back — the vault record holds every key: unlock it to finish the seal` : 'a key file could not be sealed — every file was put back, nothing changed' };
      }
      const { sealing, ...done } = back;
      try { writeRecord(done); record = done; } catch { record = back; /* the sealing list is resumed at the next unlock */ }
      dek = made.dek; made = null; epoch++; failedTries = 0; pacedUntil = 0; lastActivity = now();
      for (const it of items) keys.set(it.name, it.key);
      items = [];
      audit('vault-set-up', { ip, why: `${Object.keys(record.entries).length} key(s) sealed` });
      announce();
      return { ok: true, sealed: Object.keys(record.entries) };
    } finally {
      busy = false; V.zero(p.pw);
      for (const it of items) V.zero(it.key);
    }
  }

  async function unlock(password, { ip = null } = {}) {
    if (!setUp()) load();
    if (!setUp()) return { ok: false, code: 'vault_not_set_up' };
    if (dek) return { ok: true, already: true };
    const t = now();
    if (pacedUntil > t || failedTries % PACE_AFTER + inFlight >= PACE_AFTER) return { ok: false, code: 'paced', retryInMs: Math.max(pacedUntil - t, 0) || PACE_MS, failedTries };
    if (typeof password !== 'string' || !password) return { ok: false, code: 'password_not_text' };
    if (recordBad) { audit('vault-unlock-failed', { ip, code: 'corrupt' }); return { ok: false, code: 'corrupt' }; }
    const pw = Buffer.from(password, 'utf8');
    let r;
    inFlight++;
    try { r = await V.unlock(record, pw); } finally { V.zero(pw); inFlight--; }
    if (!r.ok) {
      if (r.code === 'wrong_password') {
        failedTries++;
        if (failedTries % PACE_AFTER === 0) pacedUntil = now() + PACE_MS;
      }
      audit('vault-unlock-failed', { ip, code: r.code, tries: failedTries });
      announce();
      return { ok: false, code: r.code, failedTries, ...(pacedUntil > now() ? { retryInMs: pacedUntil - now() } : {}) };
    }
    if (dek) { V.zero(r.dek); return { ok: true, already: true }; }   // a racing unlock landed first
    dek = r.dek; epoch++; failedTries = 0; pacedUntil = 0; lastActivity = now();
    resumeSeal();
    audit('vault-unlocked', { ip });
    announce();
    for (const fn of unlockHooks) { try { const r = fn(); if (r && typeof r.catch === 'function') r.catch((e) => log.warn?.(`[vault] an unlock hook failed: ${(e && e.message) || e}`)); } catch (e) { log.warn?.(`[vault] an unlock hook failed: ${(e && e.message) || e}`); } }
    return { ok: true };
  }

  function lock(why = 'door', { ip = null, quiet = false } = {}) {
    if (!setUp()) return { ok: false, code: 'vault_not_set_up' };
    if (!dek) return { ok: true, already: true };
    V.zero(dek); dek = null;
    for (const k of keys.values()) V.zero(k);
    keys.clear();
    epoch++; lockedSince = now();
    if (!quiet) { audit('vault-locked', { ip, why }); announce(); }
    return { ok: true };
  }

  async function change(oldPassword, newPassword, { ip = null } = {}) {
    if (!setUp()) return { ok: false, code: 'vault_not_set_up' };
    if (recordBad) return { ok: false, code: 'corrupt' };
    const t = now();
    if (pacedUntil > t || failedTries % PACE_AFTER + inFlight >= PACE_AFTER) return { ok: false, code: 'paced', retryInMs: Math.max(pacedUntil - t, 0) || PACE_MS, failedTries };
    if (typeof oldPassword !== 'string' || !oldPassword) return { ok: false, code: 'password_not_text' };
    const p = V.passwordOf(newPassword);
    if (!p.ok) return p;
    if (newPassword === oldPassword) { V.zero(p.pw); return { ok: false, code: 'same_password' }; }
    let same = false; try { same = !!signInPassword(newPassword); } catch { }
    if (same) { V.zero(p.pw); return { ok: false, code: 'same_as_sign_in' }; }
    const oldPw = Buffer.from(oldPassword, 'utf8');
    let r;
    inFlight++;
    try { r = await V.changePassword(record, oldPw, p.pw, { now: now() }); } finally { V.zero(oldPw, p.pw); inFlight--; }
    if (!r.ok) {
      if (r.code === 'wrong_password') { failedTries++; if (failedTries % PACE_AFTER === 0) pacedUntil = now() + PACE_MS; }
      audit('vault-change-failed', { ip, code: r.code, tries: failedTries });
      announce();
      return { ok: false, code: r.code, failedTries };
    }
    const next = { ...record, kdf: r.record.kdf, check: r.record.check, wrapped: r.record.wrapped, rotatedAt: r.record.rotatedAt };   // onto the record as it is NOW (the DEK is the same): an entry minted / adopted or an idle lock set while the derives ran is kept (verify r1 B4: writing r.record dropped them — a store's key lost)
    try { writeRecord(next); } catch (e) { return { ok: false, code: 'migration_failed', why: `the vault record could not be written (${KF.errnoOf(e)})` }; }
    record = next; failedTries = 0; pacedUntil = 0;
    audit('vault-second-password-changed', { ip });
    announce();
    return { ok: true };
  }

  /** The idle lock (a SETTING, default off — the owner asked for a memory-resident unlock): lock after `hours` with no
   *  write from a person's page. 0 = never. */
  function setIdleLock(hours) {
    if (!setUp() || recordBad) return { ok: false, code: 'vault_not_set_up' };
    const h = Number(hours);
    if (!Number.isInteger(h) || h < 0 || h > IDLE_MAX_HOURS) return { ok: false, code: 'bad_hours' };
    const next = { ...record, idleLockHours: h };
    try { writeRecord(next); } catch (e) { return { ok: false, code: 'migration_failed', why: KF.errnoOf(e) }; }
    record = next; announce();
    return { ok: true, idleLockHours: h };
  }
  const touch = () => { lastActivity = now(); };
  function idleTick() {
    const h = record ? Number(record.idleLockHours) || 0 : 0;
    if (dek && h > 0 && now() - lastActivity >= h * 3600e3) lock('idle');
  }
  let timer = null;
  if (idleTimer) { timer = setInterval(idleTick, 60e3); timer.unref?.(); }

  const provider = { keyFor, peek, hasEntry, state, epoch: () => epoch };
  const unregister = register ? SB.registerVault(dataDir, provider) : () => {};
  const engine = {
    dataDir, file: FILE, state, facts, setup, unlock, lock, change, setIdleLock, touch, idleTick, keyFor, peek, hasEntry,
    /** `fn()` after every successful unlock (a boot step that ran while locked — mounts' restore — runs again). */
    onUnlock(fn) { if (typeof fn === 'function') unlockHooks.push(fn); },
    epoch: () => epoch, resumeSeal,
    close() { if (timer) clearInterval(timer); lock('close', { quiet: true }); unregister(); LIVE.delete(engine); },
  };
  LIVE.add(engine);
  if (signals && !SIGNALS_ARMED) {
    SIGNALS_ARMED = true;
    // the shutdown's FIRST act: zero the DEK before the graceful work (prepend — the hub's own handler still exits)
    const lockAll = (why) => () => { for (const e of LIVE) { try { e.lock(why, { quiet: true }); } catch { } } };
    process.prependListener('SIGTERM', lockAll('sigterm'));
    process.prependListener('SIGINT', lockAll('sigint'));
    process.once('exit', lockAll('exit'));
  }
  return engine;
}

module.exports = { create, STORE_KEYS, SEALED_SUFFIX, AUDIT_FILE, PACE_AFTER, PACE_MS, IDLE_MAX_HOURS, shred };
