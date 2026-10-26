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
 *   · THE SECRETS (lane vault-e2e-password-fix-r2): beside the store keys the record holds small VALUES under their own entry
 *     names — a device's link token (`host:<id>`), the frp relay token (`frp:token`): `secretGet` / `secretPut` /
 *     `secretDrop`, and `secretAdopt` seals a plaintext file written before the vault (wrapped, the record READ BACK, the file
 *     overwritten then unlinked). `onOpen(fn)` runs after a setup and after every unlock (the sweeps that seal what the vault
 *     does not hold yet); `onLock(fn)` after a person's / an agent's / the idle lock (never the shutdown's: a restart is not a
 *     lock act — the hub's wiring signs every login out on one).
 *   · A REFUSAL IS THE SIGNAL (lane vault-locked-refusal-notice — the owner 2026-10-20: "为啥老是有 agent 和我说需要解锁 vault"):
 *     `blocked(actor, verb)` is the ONE helper every door calls when it refuses `vault_locked` — WHO it stopped (a name a
 *     person reads) and WHAT — into the lock epoch's list (src/vault-blocked.js, PURE; ≤ 50 actors, the rest a count; the
 *     unlock clears it). The store-key road notes itself (`keyFor` / `secretGet` / `secretPut` refused while locked ⇒ actor
 *     «VibeSpace», the store as the verb). A note that changes what the owner reads re-announces the facts (`blocked` = the
 *     count the lock strip shows) and runs `onBlocked(fn)` (the wiring refreshes its ONE For-you item). Nothing here reads a
 *     key or unlocks: the lock law is unchanged.
 *   · THE USE LAW (lane vault-use-law — design q-043 D1 「用途，不给值」, D2, D7): `noteUse(entry, use, o)` is the ONE writer
 *     of a use — keyFor (a store's own read: by system, door `store`), a door that uses an entry for a caller, the Vault
 *     window's reveal, a bearer refused at a person's door — in ONE shape (src/vault-use.js `useOf`: at, by, door, conv; the
 *     window's «last used» reads it). A BEARER's use (agent / job / automation key) is ONE `vault-use` audit line (`useLine`:
 *     entry, purpose, actor, door, outcome, receipt — a closed key set, never a value); a failure that is the actor's own is
 *     counted per actor × entry and the 20th in a day runs `onFailing(fn)` ONCE (the wiring files the owner's card). A wrong
 *     second password counts the same way, its address the actor (design §2 T7). Nothing here hands a value to anyone.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const V = require('../vault.js');
const SB = require('../secret-box.js');
const KF = require('../key-file.js');
const { runMigrations } = require('../migration-runner.js');
const VB = require('../vault-blocked.js');   // PURE: who a refusal stopped, this lock epoch (lane vault-locked-refusal-notice)
const VU = require('../vault-use.js');   // PURE: the use's ONE shape, its audit line, the daily failure count (lane vault-use-law)

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
const USES_TAIL = 512 * 1024;   // lane vault-manual-and-lock: `vibespace-vault uses` reads the audit file's last 512 KiB, never more
const PACE_AFTER = 5;
const PACE_MS = 60e3;
const IDLE_MAX_HOURS = 720;
/** A SECRET's entry name (r2): `host:<host id>` (a device's link token) · `frp:token` · `file:<name>` (a sealed JSON file's
 *  key — src/server/sealed-json.js) · `apikey:<key id>` (design q-046: VibeSpace's own automation key — its value, minted by
 *  src/server/automation-engine.js; the store keeps its digest only) · `totp:<name>` (design q-047 L1, lane vault-totp: a
 *  two-step code's seed + its settings, one JSON line — src/totp.js, src/server/vault-totp.js) · `secret:<id>` (lane
 *  vault-paste-request: a FREE entry — a password, an API key, any secret the registry does not list — pasted by the owner
 *  into For you at an agent's request, or added in the Vault window; the hub picks the id, its label / kind / note ride
 *  beside the box: src/vault-paste.js) · `web-login:<origin>#<user>` (lane browser-login, P3 of the custom browser kernel: a
 *  website's login — the sealed JSON record of PURE src/browser-login.js, whose NAME_RE spells this same shape; written by ONE
 *  writer, src/server/browser-logins.js) — never a key file's name (STORE_KEYS names start with `.` or `browser-`). */
const SECRET_RE = /^(?:host|frp|file|apikey|totp|secret):[\w.-]{1,160}$|^web-login:https?:\/\/(?:[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,20}|\[[0-9a-f:.]{2,45}\])(?::\d{1,5})?#[^\s#\u0000-\u001f\u007f]{1,160}$/;
const isSecretName = (name) => { const s = String(name || ''); return SECRET_RE.test(s) || V.AGENT_NS_RE.test(s); };   // lane vault-mint-put: `agent:<scope>/<name>` too

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
  if (fs.lstatSync(file).isSymbolicLink()) throw Object.assign(new Error(`${path.basename(file)} is a symbolic link — never shredded through it`), { code: 'ELOOP' });   // verify r2: the overwrite would reach the link's TARGET
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
  let unlockedSince = null;   // lane vault-one-door: the Vault window's header says since when
  const startedAt = now();    // lane vault-relock-door (owner 2026-10-20): the engine's construction = the server's boot (ms); the open tab tells a RESTART (a NEW startedAt) from a lock act (the SAME one)
  let failedTries = 0, pacedUntil = 0, busy = false, lastActivity = now(), inFlight = 0;   // inFlight: derives running now count toward the pace BEFORE they land (verify r1 A1: 40 concurrent wrong passwords landed 40 derives)
  const unlockHooks = [];   // what a locked start left undone and the unlock must retry (the wiring: mounts' restore)
  const uses = new Map();   // lane vault-contents-window: entry name → its last use (memory only; the Vault window's «last used») — lane vault-use-law: VU.useOf's ONE shape { at, by, door, conv }, written by noteUse only
  const keyNameOf = (store) => { const k = STORE_KEYS.find((x) => x.store === store); return k ? k.name : null; };   // a store id (src/vault-inventory.js STORES) → its key's entry name
  const openHooks = [];     // r2: after a setup AND every unlock — seal what the vault does not hold yet (host token files, the frp field)
  const lockHooks = [];     // r2: after a lock act (door / agent / idle) — the wiring signs every login out
  const blockedList = VB.createBlocked();   // lane vault-locked-refusal-notice: who a refusal stopped this lock epoch (memory only)
  const blockedHooks = [];  // … and who is told: the wiring's one For-you item

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
  // lane door-day-one-landing (the naive-user studies: «Set a second password … there is no recovery» met seven testers at
  // their first chat and again at every sign-in, before anything was stored): A SECRET IS WAITING — a store's key file or a
  // device's link token beside the data (a not-set-up vault's migration window), found at boot or minted now, or a store
  // the vault refused for want of one. The page asks for the second password only then (src/day-one.js vaultSetupAsk);
  // the moment it turns true is announced (the first secret's store asks at once). Names only — never a key's bytes.
  let secretWaiting = false;   // this boot: a store's first key minted, or a store refused
  let clearAt = -Infinity, clearSeen = false;
  /** the key files / device link tokens beside the data — read at most every 5 s (a device paired since is seen at the next
   *  facts read: the token file road is host-tokens', which tells nobody) */
  const clearFiles = () => {
    if (clearSeen) return true;
    if (now() - clearAt < 5000) return false;
    clearAt = now();
    try { clearSeen = STORE_KEYS.some((k) => fs.existsSync(path.join(dataDir, k.name))) || fs.readdirSync(path.join(dataDir, 'agentd')).some((n) => /^host-[\w.-]+\.token$/.test(n)); } catch { /* no agentd dir: the key files decided */ }
    return clearSeen;
  };
  const waiting = () => !setUp() && (secretWaiting || clearFiles());
  const noteSecret = () => { if (secretWaiting || setUp()) return false; secretWaiting = true; announce(); return true; };
  const audit = (event, extra = {}) => {
    const line = { at: new Date(now()).toISOString(), event, ...extra };
    try { fs.appendFileSync(path.join(dataDir, AUDIT_FILE), JSON.stringify(line) + '\n', { mode: 0o600 }); } catch { /* the log line below still says it */ }
    try { log.log?.(`[vault] ${event}${extra.ip ? ' from ' + extra.ip : ''}${extra.code ? ' (' + extra.code + ')' : ''}${extra.why ? ' — ' + extra.why : ''}`); } catch { }
  };
  function facts() {
    const st = state(), t = now();
    return {
      state: st,
      startedAt,   // lane vault-relock-door: the boot this facts() comes from — unchanged by lock/unlock, a new value only a new process
      setUpAt: record ? record.createdAt || null : null,
      rotatedAt: record ? record.rotatedAt || null : null,
      lockedSince: st === 'locked' ? lockedSince : null,
      unlockedSince: st === 'unlocked' ? unlockedSince : null,
      failedTries,
      pacedForMs: pacedUntil > t ? pacedUntil - t : 0,
      idleLockHours: record ? Number(record.idleLockHours) || 0 : 0,
      corrupt: !!recordBad,
      keys: record ? Object.keys(record.entries).filter((n) => !isSecretName(n)).length : 0,
      secrets: record ? Object.keys(record.entries).filter(isSecretName).length : 0,   // r2: the device link tokens + the frp token
      blocked: st === 'locked' ? blockedList.count() : 0,   // lane vault-locked-refusal-notice: how many callers the lock stopped (the strip's count)
      secretWaiting: st === 'not_set_up' && waiting(),   // lane door-day-one-landing: a secret is stored with no vault — the setup ask's one fact
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
  /** lane vault-contents-window: every key read that opened is a USE of that store key (`by` = who the read is for: a
   *  reveal from the Vault window says 'human'; a store's own read carries no subject — 'system'). lane vault-use-law: the
   *  use carries its `door` (a store's own read: `store`) and `conv` (the conversation it is for, when a door knows one),
   *  written by THE ONE WRITER below. */
  function keyFor(name, opts = {}) {
    const r = keyRead(name, opts);
    if (r && r.ok) noteUse(name, { by: opts.by, door: opts.door || 'store', conv: opts.conv });
    else if (r && r.code === KF.VAULT_LOCKED) blocked(VB.HUB, storeVerb(name));   // lane vault-locked-refusal-notice: the store-key road notes itself
    return r;
  }
  function keyRead(name, { keyFile, raw = false, hasCiphertext = () => true, legacy } = {}) {
    const st = state();
    if (st === 'not_set_up') {
      if (typeof legacy !== 'function') return { ok: false, code: KF.VAULT_LOCKED };
      const r = legacy();
      if (r && r.ok && r.minted) noteSecret();   // lane door-day-one-landing: a store's FIRST secret minted its key — the setup ask's moment
      return r;
    }
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

  // ── THE SECRETS (r2): a small value under its own entry name — a device's link token, the frp token ──
  const lockedCode = () => (state() === 'locked' ? KF.VAULT_LOCKED : 'vault_not_set_up');
  /** → `{ ok: true, value: Buffer | null }` (null = no such entry; the Buffer is the caller's copy to zero) |
   *  `{ ok: false, code: 'key-unreadable:vault_locked' | 'vault_not_set_up' | 'key-malformed' }`. Never reads a file. */
  function secretGet(name) {
    if (!isSecretName(name)) return { ok: false, code: 'bad-name' };
    if (state() !== 'unlocked') { blocked(VB.HUB, secretVerb(name)); return { ok: false, code: lockedCode() }; }
    const box = record.entries[name];
    if (!box) return { ok: true, value: null };
    const v = V.unwrapEntry(dek, name, box);
    return v ? { ok: true, value: v } : { ok: false, code: 'key-malformed' };
  }
  /** Seal `value` under `name` (unlocked only — locked ⇒ refused by name, nothing written). */
  function secretPut(name, value, { prov = null, actor = null, label = null, note = null, kind = null, owner = null, forHost = null } = {}) {
    if (!isSecretName(name)) return { ok: false, code: 'bad-name' };
    if (state() !== 'unlocked') { blocked(VB.HUB, secretVerb(name)); noteSecret(); return { ok: false, code: lockedCode() }; }   // noteSecret: a not-set-up vault refused a store (lane door-day-one-landing)
    const plain = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value == null ? '' : value), 'utf8');
    try {
      const box = { ...V.wrapEntry(dek, name, plain), at: now() };   // int317: `at` = when it was sealed (the Vault window's «saved»)
      if (prov) box.prov = prov;        // lane vault-mint-put: 'minted' | 'stored' — the Vault window's provenance chip (never a value)
      if (actor) box.actor = String(actor).slice(0, 128);   // which conversation / group owns it (a name/id, never a value)
      if (label) box.label = String(label).slice(0, 80);    // lane vault-paste-request: a free entry's label, kind and note (words a person wrote — never a value)
      if (note) box.note = String(note).slice(0, 400);
      if (kind) box.kind = String(kind).slice(0, 16);
      if (owner) box.owner = String(owner).slice(0, 128);       // lane vault-agent-own: the conversation that stored it (its durable id — an id, never a value): its own to use
      if (forHost) box.forHost = String(forHost).slice(0, 200); // lane vault-agent-own: a mint's `--for <host/service>` — the host it may go to without asking
      const next = { ...record, entries: { ...record.entries, [name]: box } };
      writeRecord(next); record = next;
      return { ok: true };
    } catch (e) { return { ok: false, code: `key-unreadable:${KF.errnoOf(e)}` }; } finally { V.zero(plain); }
  }
  // ── AGENT-OWNED SECRETS (design q-043 §9, lane vault-mint-put): mint / put under the caller's own `agent:<scope>/<name>`.
  //    The ROUTE builds the name from the SESSION's scope (src/routes/vault.js); the engine seals and NEVER returns a value.
  /** MINT: the HUB makes the random value (V.randomSecret) and seals it — the caller is handed the entry name + its
   *  `vault://` reference, never the value. → { ok, name, ref } | { ok:false, code } (a bad length/charset, or a locked
   *  vault refused by name). */
  function agentMint(name, { length, charset, actor = null, forHost = null } = {}) {
    if (!V.AGENT_NS_RE.test(String(name || ''))) return { ok: false, code: 'bad-name' };
    if (state() !== 'unlocked') { blocked(VB.HUB, secretVerb(name)); noteSecret(); return { ok: false, code: lockedCode() }; }
    const mv = V.mintVerdict({ length, charset });
    if (!mv.ok) return mv;
    const value = V.randomSecret(mv.length, mv.charset);
    try {
      const r = secretPut(name, value, { prov: 'minted', actor, forHost });
      if (!r.ok) return r;
      audit('vault-agent-mint', { why: name, actor: actor ? String(actor).slice(0, 128) : null, by: 'agent' });   // the name + who — NEVER the value
      return { ok: true, name, ref: V.vaultRefOf(name) };
    } finally { V.zero(value); }
  }
  /** PUT: the caller hands a value it already has (a vendor key) — sealed, provenance 'stored'. Same shape; no value back. */
  function agentPut(name, value, { actor = null } = {}) {
    if (!V.AGENT_NS_RE.test(String(name || ''))) return { ok: false, code: 'bad-name' };
    if (value == null || String(value) === '') return { ok: false, code: 'value_required' };
    if (state() !== 'unlocked') { blocked(VB.HUB, secretVerb(name)); noteSecret(); return { ok: false, code: lockedCode() }; }
    const r = secretPut(name, value, { prov: 'stored', actor });
    if (!r.ok) return r;
    audit('vault-agent-put', { why: name, actor: actor ? String(actor).slice(0, 128) : null, by: 'agent' });
    return { ok: true, name, ref: V.vaultRefOf(name) };
  }
  /** int317 + lane vault-mint-put: the secret entries' NAMES, their seal instants, and (agent entries) `prov`/`actor` —
   *  never a box, never a value; the Vault window's «Hub secrets» rows (src/server/vault-contents.js secretSource). */
  const secretNames = () => (record ? Object.keys(record.entries).filter(isSecretName).sort().map((name) => { const b = record.entries[name] || {}; return { name, at: Number(b.at) || null, prov: b.prov || null, actor: b.actor || null, ...(b.label ? { label: b.label, note: b.note || '', kind: b.kind || null } : b.kind ? { kind: b.kind } : {}), ...(b.owner ? { owner: b.owner } : {}), ...(b.forHost ? { forHost: b.forHost } : {}) }; }) : []);   // lane vault-paste-request: a free entry's label / note / kind — lane browser-login: a web login's provenance word (`kind` = its source), never a value
  /** Forget an entry (an unpaired device, a cleared relay token) — needs no DEK, so a locked vault forgets too. */
  function secretDrop(name) {
    if (!isSecretName(name)) return { ok: false, code: 'bad-name' };
    if (!record || !record.entries[name]) return { ok: true, already: true };
    const { [name]: gone, ...rest } = record.entries;
    try { const next = { ...record, entries: rest }; writeRecord(next); record = next; } catch (e) { return { ok: false, code: `key-unreadable:${KF.errnoOf(e)}` }; }
    return { ok: true };
  }
  /** Seal a plaintext secret FILE (written before the vault was set up, or restored from a backup) into `name`: wrapped, the
   *  record written and READ BACK (the entry opens to the very bytes), only then the file overwritten and unlinked. A file
   *  that differs from the entry already held is KEPT and audited (a value we cannot prove redundant is never destroyed);
   *  one that equals it is shredded. → secretGet's shape (the value the vault now holds). */
  function secretAdopt(name, file) {
    if (state() !== 'unlocked') return secretGet(name);
    try { if (fs.lstatSync(file).isSymbolicLink()) { audit('vault-adopt-unsealed', { why: `${name}: ${path.basename(file)} is a symbolic link — never followed (its target is neither read nor shredded)` }); return { ok: false, code: 'key-unreadable:ELOOP' }; } } catch { /* absent: the read below says so */ }   // verify r2
    let text;
    try { text = fs.readFileSync(file, 'utf8').trim(); } catch (e) { return e && e.code === 'ENOENT' ? secretGet(name) : { ok: false, code: `key-unreadable:${KF.errnoOf(e)}` }; }
    if (!text) return { ok: false, code: 'key-malformed' };   // an emptied file is not a value — kept, never sealed
    const want = Buffer.from(text, 'utf8');
    const held = secretGet(name);
    if (held.ok && held.value) {
      const same = held.value.length === want.length && crypto.timingSafeEqual(held.value, want);
      if (same) { try { shred(file); audit('vault-adopted', { why: name }); } catch (e) { audit('vault-adopt-unsealed', { why: `${name}: ${KF.errnoOf(e)}` }); } }
      else audit('vault-seal-conflict', { why: `${name}: the file and the vault entry differ — the file is kept` });
      V.zero(want);
      return held;
    }
    const put = secretPut(name, want);
    if (!put.ok) { V.zero(want); audit('vault-adopt-unsealed', { why: `${name}: the record could not be written (${put.code}) — the file is kept` }); return put; }   // verify r2 low: said, not silent
    let back = null; try { back = readRecordFile(); } catch { back = null; }
    const got = back && back.entries ? V.unwrapEntry(dek, name, back.entries[name]) : null;
    const proven = !!got && got.equals(want); V.zero(got);
    if (!proven) audit('vault-adopt-unsealed', { why: `${name}: the record read back did not open to the file's value — the file is kept` });
    else { try { shred(file); audit('vault-adopted', { why: name }); } catch (e) { audit('vault-adopt-unsealed', { why: `${name}: ${KF.errnoOf(e)}` }); } }
    return { ok: true, value: want };
  }
  // ── A REFUSAL IS THE SIGNAL (lane vault-locked-refusal-notice) ──
  const storeVerb = (name) => { const k = STORE_KEYS.find((x) => x.name === name); return k ? `the ${k.store} store` : name; };
  const secretVerb = (name) => { const n = String(name), kind = n.split(':')[0]; return kind === 'host' ? 'a device link token' : kind === 'apikey' ? 'an automation key' : kind === 'file' ? `the sealed file ${n.slice(5)}` : kind === 'agent' ? 'an agent secret' : kind === 'secret' ? 'a stored password or key' : kind === 'web-login' ? 'a website login' : `the stored secret ${n}`; };   // a machine's / a key's id (and an agent entry's scope) is never the words
  /** THE ONE HELPER a door calls when it refuses `vault_locked`: `actor` = WHO it stopped (a NAME a person reads — the door
   *  passes the conversation's / the machine's / the account's name, never an id), `verb` = WHAT. Only while LOCKED (a
   *  not-set-up vault refuses nothing by this code). A note that changes what the owner reads re-announces the facts and
   *  runs the onBlocked hooks with the epoch's summary. → whether it was such a note. Never throws, never reads a key. */
  function blocked(actor, verb) {
    if (state() !== 'locked') return false;
    let r;
    try { r = blockedList.note({ actor, verb, at: now(), epoch }); } catch { return false; }
    if (!r.fresh) return false;
    announce();
    runHooks(blockedHooks, 'a refusal', blockedList.summary());
    return true;
  }
  const runHooks = (list, what, ...args) => { for (const fn of list) { try { const r = fn(...args); if (r && typeof r.catch === 'function') r.catch((e) => log.warn?.(`[vault] ${what} hook failed: ${(e && e.message) || e}`)); } catch (e) { log.warn?.(`[vault] ${what} hook failed: ${(e && e.message) || e}`); } } };

  // ── THE USE LAW (lane vault-use-law — design q-043 D1 / D2 / D7) ──
  const failures = VU.createFailures();   // failed uses per actor × entry, a rolling day (memory only: a restart starts afresh)
  const failingHooks = [];                // … and who is told: the wiring's card per actor × entry (src/server/vault-hooks.js)
  /** THE ONE WRITER of a use of an entry. `entry` = an entry name, or a store id (the Vault window passes its store: the use
   *  is of that store's key); `use` = { by, door, conv } (VU.useOf — a bare `by` string too); `o` = { outcome ('ok' or the
   *  refusal's code), purpose, actor (a NAME a person reads), key (the counted actor when there is no conversation: a
   *  person's address), ip }. A use that opened is the entry's «last used»; a BEARER's use, allowed or refused, is ONE
   *  `vault-use` audit line (VU.useLine — a closed key set: whatever else `o` holds never reaches the file); a failure that
   *  is the actor's own (VU.counts) is counted and the 20th in a day runs the onFailing hooks once. → { receipt }.
   *  lane vault-manual-and-lock: `o.receipt` (VU.RECEIPT_RE) = ONE receipt a door already gave its caller (a run naming three
   *  entries answers one receipt and writes three lines carrying it); `o.store` = the store an entry lives in (its «last used»). */
  function noteUse(entry, use = {}, o = {}) {
    const name = keyNameOf(entry) || String(entry || '');
    const u = VU.useOf(use, now());
    const outcome = VU.outcomeOf(o.outcome);
    if (outcome === 'ok' || o.used === true) { uses.set(name, u); const sn = o.store ? keyNameOf(o.store) : null; if (sn) uses.set(sn, u); }   // o.used: a run's child had the value, whatever ended it
    if (u.by === 'system') return { receipt: null };   // the hub's own read: its «last used» only (a line per store read would drown the file)
    const receipt = VU.RECEIPT_RE.test(String(o.receipt || '')) ? String(o.receipt) : `vr-${crypto.randomBytes(6).toString('hex')}`;
    if (VU.BEARERS.includes(u.by)) audit('vault-use', VU.useLine({ at: u.at, entry: name, purpose: o.purpose, use: u, actor: o.actor, outcome, receipt, ip: o.ip }));
    if (VU.counts(outcome)) {
      const f = failures.note({ key: `${u.by}:${u.conv || o.key || o.actor || '-'}`, actor: o.actor, by: u.by, entry: name, door: u.door, outcome, at: u.at });
      if (f.fire) runHooks(failingHooks, 'a failing actor', f.card);
    }
    return { receipt };
  }
  /** D7 (design §2 T7): a wrong SECOND PASSWORD is a failed use of the vault by whoever typed it — its address names them
   *  (the door's own line is the audit; this is the count). */
  /** lane vault-manual-and-lock (design D4 — `vibespace-vault uses`): ONE conversation's own `vault-use` lines, newest first —
   *  the audit file's tail read BOUNDED (its last USES_TAIL bytes: a long file is never read whole; a FIFO never stalls), each
   *  line's closed fields re-checked (VU.usesOf) — never a value (a line holds none), never another conversation's. */
  function usesOf(conv, { limit = VU.USES_MAX } = {}) {
    let text = '';
    let fd = null;
    try {
      fd = fs.openSync(path.join(dataDir, AUDIT_FILE), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
      const st = fs.fstatSync(fd);
      if (st.isFile()) {
        const n = Math.min(st.size, USES_TAIL), buf = Buffer.alloc(n);
        let got = 0;
        while (got < n) { const r = fs.readSync(fd, buf, got, n - got, st.size - n + got); if (!r) break; got += r; }
        text = buf.subarray(0, got).toString('utf8');
        if (st.size > n) text = text.slice(text.indexOf('\n') + 1);   // the first line was cut — it is skipped whole
      }
    } catch { text = ''; } finally { if (fd != null) { try { fs.closeSync(fd); } catch { } } }
    return VU.usesOf(text, conv, limit);
  }
  const wrongPassword = (door, ip) => noteUse(VU.VAULT_ENTRY, { by: 'human', door }, { outcome: 'wrong_password', actor: ip ? `someone at ${ip}` : 'someone on this instance', key: ip || '-', ip });

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
      dek = made.dek; made = null; epoch++; blockedList.clear(); failedTries = 0; pacedUntil = 0; lastActivity = now(); unlockedSince = now();
      for (const it of items) keys.set(it.name, it.key);
      items = [];
      audit('vault-set-up', { ip, why: `${Object.keys(record.entries).length} key(s) sealed` });
      runHooks(openHooks, 'an open');   // r2: the host token files, the frp field — sealed in the same act
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
      if (r.code === 'wrong_password') wrongPassword('unlock', ip);
      announce();
      return { ok: false, code: r.code, failedTries, ...(pacedUntil > now() ? { retryInMs: pacedUntil - now() } : {}) };
    }
    if (dek) { V.zero(r.dek); return { ok: true, already: true }; }   // a racing unlock landed first
    dek = r.dek; epoch++; blockedList.clear(); failedTries = 0; pacedUntil = 0; lastActivity = now(); unlockedSince = now();   // the unlock clears who the lock stopped
    resumeSeal();
    audit('vault-unlocked', { ip });
    announce();
    runHooks(openHooks, 'an open');
    runHooks(unlockHooks, 'an unlock');
    return { ok: true };
  }

  /** lane vault-contents-window: THE SECOND PASSWORD AGAIN (the Vault window's 「验证是你」) — checked against the record,
   *  nothing unlocked, nothing changed: the derived DEK is zeroed at once. The unlock's pace and counters (a wrong one here
   *  is a wrong one there); every failure is an audit line with the caller's address. → { ok } | { ok: false, code }. */
  async function confirm(password, { ip = null, who = null } = {}) {
    if (!setUp()) return { ok: false, code: 'vault_not_set_up' };
    if (!dek) return { ok: false, code: 'vault_locked' };
    const t = now();
    if (pacedUntil > t || failedTries % PACE_AFTER + inFlight >= PACE_AFTER) return { ok: false, code: 'paced', retryInMs: Math.max(pacedUntil - t, 0) || PACE_MS, failedTries };
    if (typeof password !== 'string' || !password) return { ok: false, code: 'password_not_text' };
    if (recordBad) return { ok: false, code: 'corrupt' };
    const pw = Buffer.from(password, 'utf8');
    let r;
    inFlight++;
    try { r = await V.unlock(record, pw); } finally { V.zero(pw); inFlight--; }
    if (r.ok) V.zero(r.dek);
    if (!r.ok) {
      if (r.code === 'wrong_password') { failedTries++; if (failedTries % PACE_AFTER === 0) pacedUntil = now() + PACE_MS; }
      audit('vault-reveal-refused', { ip, who, code: r.code, tries: failedTries });
      if (r.code === 'wrong_password') wrongPassword('confirm', ip);
      announce();
      return { ok: false, code: r.code, failedTries, ...(pacedUntil > now() ? { retryInMs: pacedUntil - now() } : {}) };
    }
    if (!dek) return { ok: false, code: 'vault_locked' };   // locked while the derive ran
    failedTries = 0; pacedUntil = 0;
    return { ok: true };
  }

  function lock(why = 'door', { ip = null, quiet = false } = {}) {
    if (!setUp()) return { ok: false, code: 'vault_not_set_up' };
    if (!dek) return { ok: true, already: true };
    V.zero(dek); dek = null;
    for (const k of keys.values()) V.zero(k);
    keys.clear();
    epoch++; lockedSince = now(); blockedList.clear();   // a new lock epoch: nobody stopped yet
    if (!quiet) { audit('vault-locked', { ip, why }); announce(); runHooks(lockHooks, 'a lock', why); }
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
      if (r.code === 'wrong_password') wrongPassword('change', ip);
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
  /** lane vault-run-door: A MARK the vault vouches for — HMAC-SHA256 of `text` under a key DERIVED from the DEK for `label`
   *  (never the DEK itself; a derived key is zeroed at once). A store the vault does not hold but whose INTEGRITY it answers
   *  for (the run door's switches and remembered «always» shapes, data/vault-run.json): an agent shares the hub's uid and can
   *  write that file, never a mark that verifies. → hex | null (not unlocked: nothing to mark with). */
  function macOf(label, text) {
    if (!dek) return null;
    const k = crypto.createHmac('sha256', dek).update('vibespace-vault-mark:' + String(label)).digest();
    try { return crypto.createHmac('sha256', k).update(String(text)).digest('hex'); } finally { k.fill(0); }
  }
  const touch = () => { lastActivity = now(); };
  function idleTick() {
    const h = record ? Number(record.idleLockHours) || 0 : 0;
    if (dek && h > 0 && now() - lastActivity >= h * 3600e3) lock('idle');
  }
  let timer = null;
  if (idleTimer) { timer = setInterval(idleTick, 60e3); timer.unref?.(); }

  const provider = { keyFor, peek, hasEntry, state, epoch: () => epoch, secretGet, secretPut, secretDrop, secretAdopt, secretNames, blocked };   // secretNames: the agent-output belt (src/agent-output-belt.js) enumerates the maskable entries from a data dir   // `blocked`: a door that holds only the data dir reaches the ONE helper (SB.vaultForDir)
  const unregister = register ? SB.registerVault(dataDir, provider) : () => {};
  const engine = {
    dataDir, file: FILE, state, facts, setup, unlock, lock, change, setIdleLock, touch, idleTick, keyFor, peek, hasEntry,
    // lane vault-contents-window: the Vault window's doors (src/server/vault-contents.js) — the second password again, a
    // store key's last use, a use by a person, and the vault's audit file (one line per reveal — never a value)
    confirm, lastUse: (store) => { const n = keyNameOf(store); return n && uses.has(n) ? { ...uses.get(n) } : null; }, noteUse, audit,
    usesOf,   // lane vault-manual-and-lock: ONE conversation's own vault-use lines (vibespace-vault uses) — names, codes, receipts   // lane vault-use-law: noteUse = THE ONE WRITER of a use (the window's reveal, a door's use, a refusal)
    /** `fn()` after every successful unlock (a boot step that ran while locked — mounts' restore — runs again). */
    onUnlock(fn) { if (typeof fn === 'function') unlockHooks.push(fn); },
    /** r2: `fn()` after a setup and after every unlock (seal what the vault does not hold yet). */
    onOpen(fn) { if (typeof fn === 'function') openHooks.push(fn); },
    /** r2: `fn(why)` after a lock act — the door, an agent, the idle lock; never the shutdown's quiet lock. */
    onLock(fn) { if (typeof fn === 'function') lockHooks.push(fn); },
    /** lane vault-locked-refusal-notice: THE ONE HELPER (above) + the epoch's list + `fn(summary)` after a note that changed it. */
    blocked, blockedSummary: () => blockedList.summary(),
    onBlocked(fn) { if (typeof fn === 'function') blockedHooks.push(fn); },
    /** lane vault-use-law (design q-043 D7): `fn(card)` once when an actor's failed uses of one entry reach 20 in a day —
     *  card = { actor, by, key, entry, door, outcome, n, since, at } (names and codes; never a value). */
    onFailing(fn) { if (typeof fn === 'function') failingHooks.push(fn); },
    secretGet, secretPut, secretDrop, secretAdopt, secretNames, agentMint, agentPut,   // lane vault-mint-put
    macOf,   // lane vault-run-door: a mark under a DEK-derived key (the run door's store) — null unless unlocked
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

module.exports = { create, STORE_KEYS, SEALED_SUFFIX, AUDIT_FILE, PACE_AFTER, PACE_MS, IDLE_MAX_HOURS, shred, isSecretName };
