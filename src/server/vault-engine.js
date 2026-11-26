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
const SR = require('../store-read.js');
const HOLD = require('../store-read-hold.js');   // r3002 (b): the vault record's failed read under the store-read law
const { runMigrations, ledgerFileOf } = require('../migration-runner.js');
const VB = require('../vault-blocked.js');   // PURE: who a refusal stopped, this lock epoch (lane vault-locked-refusal-notice)
const VU = require('../vault-use.js');   // PURE: the use's ONE shape, its audit line, the daily failure count (lane vault-use-law)
const VF = require('../vault-file.js');   // PURE: a FILE entry's verdicts — its name, its cap, its kind (lane lg-vault-file, B-0830)
const VFS = require('./vault-files.js');  // the file entries' sealed bytes, data/vault-files/<id>.vfile (lane lg-vault-file)

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
 *  writer, src/server/browser-logins.js) · `provider:<record id>` (lane lg-providers, B-d578: a third-party model provider's
 *  key — its record in data/providers.json names it, src/server/provider-store.js is its one writer; the spawn road and the
 *  provider Test read it) · `keyfile:<10 hex>` (lane lg-vault-file, B-0830 — design q-058: a FILE the owner put in, its bytes
 *  sealed beside the record in data/vault-files/; the value is its file key — src/vault-file.js) — never a key file's name
 *  (STORE_KEYS names start with `.` or `browser-`). */
const SECRET_RE = /^(?:host|frp|file|apikey|totp|secret|provider|keyfile):[\w.-]{1,160}$|^web-login:https?:\/\/(?:[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,20}|\[[0-9a-f:.]{2,45}\])(?::\d{1,5})?#[^\s#\u0000-\u001f\u007f]{1,160}$|^proxy-login:(?:https?|socks5):\/\/(?:[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,20}|\[[0-9a-f:.]{2,45}\]):\d{1,5}#[^\s#\u0000-\u001f\u007f]{1,128}$/;   // B-8b87: a browser proxy's login (src/server/browser-proxy-logins.js)
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

const VAULT_TMP_RE = /^vault\.json\.tmp-(\d+)-[0-9a-f]{8}$/;
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try { process.kill(pid, 0); return true; } catch (e) { return Boolean(e && e.code === 'EPERM'); }
}
function sweepStaleVaultTmp(dir, curNow = Date.now()) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return 0; }
  let swept = 0;
  for (const name of names) {
    const m = VAULT_TMP_RE.exec(name);
    if (!m) continue;
    const pid = Number(m[1]);
    if (pid === process.pid) continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.lstatSync(full); } catch { continue; }
    if (!st.isFile() || st.isSymbolicLink()) continue;
    if (pidAlive(pid) && curNow - st.mtimeMs < 60_000) continue;
    try { fs.unlinkSync(full); swept++; } catch { /* best effort */ }
  }
  return swept;
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
function create({ dataDir, signInPassword = () => false, bcast = () => {}, log = console, now = () => Date.now(), kdf = V.KDF, register = true, signals = false, idleTimer = true, faultAt = null, fileIds = null } = {}) {
  if (!dataDir) throw new TypeError('vault-engine: dataDir is required');
  const FILE = path.join(dataDir, V.VAULT_FILE);
  let record = null;          // the parsed record | null (not set up)
  let recordBad = null;       // a vault.json that is there but not readable / not a record: LOCKED for good (never the legacy files beside it)
  let dek = null;             // THE DEK — in memory only, zeroed by lock()
  let masks = null;           // lane vault-masker-once: THE output belt's compiled forms ({ forms }) — memory only, while unlocked; dropped at every record write, load and lock (maskForms)
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

  // r3002 (b) — THE RECORD's FAILED READ UNDER THE STORE-READ LAW (src/store-read-hold.js). The release LOCKED a record it could not
  // read for the whole life (a brief EIO needed a restart) and said it as DAMAGED («restore data/vault.json from a backup»). Now a
  // READ that failed is HELD: nothing is written over it, it is read again off the loop on the law's ladder (an unlock press asks one
  // read again now), and it answers its own code (record_unreadable: «could not be read», never «damaged») until a read proves
  // which. Bytes that were READ and are not a record stay DAMAGED for the life (corrupt) and never lift as «not set up». WHO REMOVES
  // BY THIS STORE's SILENCE: the setup door (a NEW record over the sealed stores) and the key-file law (a data folder with no record
  // reads its stores' legacy key files) read «not set up» — so neither a failed read nor torn bytes ever read as «not set up» (a
  // setup is refused already_set_up while either holds; the hold's re-read that meets torn bytes says them damaged, never empty)
  const recordHold = HOLD.create({
    file: FILE, valid: (v) => !!v && V.recordShapeOk(v), code: 'record_unreadable', aside: (m) => `${FILE}.corrupt-${m}`,
    words: (h) => `vault.json in VibeSpace's data folder could not be read (${h.code}); VibeSpace reads it again every few minutes. Nothing is lost and nothing is written over it — the vault stays locked until it reads`,
    log: (m) => log.warn ? log.warn('[vault] ' + m) : log.log('[vault] ' + m),
    onLift: (v, f) => {
      masks = null;
      if (v && V.recordShapeOk(v)) { record = v; recordBad = null; }
      else if (f && f.setAside) { record = null; recordBad = 'not-a-record'; }   // torn bytes met on the re-read: damaged, never «not set up»
      else { record = null; recordBad = null; }   // the file is gone (ENOENT twice): as a start that finds no record
      announce();
    },
  });
  const recordHeld = () => !!recordHold.held();
  const badCode = () => (recordHeld() ? 'record_unreadable' : 'corrupt');   // r3002 (b): «could not be read» is not «damaged»
  function load() {
    masks = null;   // lane vault-masker-once: a record read from disk is a new vault state
    let text;
    try { text = fs.readFileSync(FILE, 'utf8'); } catch (e) {
      if (e && e.code === 'ENOENT') { record = null; recordBad = null; return; }
      record = null; recordBad = `unreadable:${KF.errnoOf(e)}`;
      recordHold.start(SR.storeAnswer({ error: e }));   // r3002 (b): HELD — read again off the loop; never «not set up», never «damaged»
      return;
    }
    let rec = null;
    try { rec = JSON.parse(text); } catch { rec = null; }
    if (rec && V.recordShapeOk(rec)) { record = rec; recordBad = null; } else { record = null; recordBad = 'not-a-record'; }
  }
  sweepStaleVaultTmp(dataDir, now());
  load();
  // lane lg-vault-file (B-0830): the file entries' sealed bytes — at a start ONLY a `.vfile` the record names as DROPPED goes (and
  // the store's own stale temps); one no entry names and no list drops is KEPT and said (主开发 r4625); nothing while the record
  // cannot be read. `fileIds` (suites only): the id source the store draws from (its default: 5 random bytes)
  const files = VFS.create({ dataDir, log, ...(typeof fileIds === 'function' ? { randomId: fileIds } : {}) });   // round 7: a failed close is said in the engine's log
  // lane lg-vault-file cure (主开发 11-18: nothing of a file holds the main loop): the boot sweep runs OFF the loop — it asks the
  // record whether an id is live at the moment a file would go (puts may land meanwhile); never while the record is unreadable
  const filesInFlight = new Set();   // round 2: a put's id from its mint to its record (or its refusal) — the sweep never takes it
  const fileLive = (id) => filesInFlight.has(id) || !record || Object.values(record.entries).some((b) => b && b.file && b.file.id === id);   // the census's find: a record unread while the sweep walks keeps EVERY file (it read «none live» before)
  // 主开发 r4625 (the MUST) + r4628 + r4774 (A): THE RECORD's OWN LIST OF DROPPED FILES — a re-put and a drop add the old file's id
  // in the SAME record write that stops naming it, before its shred (a crash between the two leaves an instruction, not a guess).
  // The list holds only the instructions NOT YET CARRIED OUT: an id leaves it at the next record write after its shred is
  // CONFIRMED, or after a start found the file truly not there (the file system said so by its name) — a look that failed
  // otherwise prunes nothing. «Never minted again» is the ID's own: a file id is the record's counter (`fileSeq`, below)
  const droppedOf = (rec) => (rec && Array.isArray(rec.filesDropped) ? rec.filesDropped.filter((x) => VF.ID_RE.test(String(x))) : []);
  const withDropped = (rec, id) => ({ ...rec, filesDropped: [...new Set([...droppedOf(rec), String(id)])] });
  const fileDropped = (id) => !!record && droppedOf(record).includes(id) && !fileLive(id);   // asked at each file's own turn: a record gone mid-walk drops nothing
  const fileIdTaken = (id) => filesInFlight.has(id) || !record || droppedOf(record).includes(id) || Object.values(record.entries).some((b) => b && b.file && b.file.id === id);
  // r4774 (A): THE FILE ID IS THE RECORD's OWN COUNTER — `fileSeq` (the next id, 10 hex), raised in the SAME record write that names
  // the new file. A broken or missing counter mints from one past the highest id the record names or lists AND past every file on
  // disk the start met (and past every id this process minted); a write never goes over a file already there (file_id_taken: the
  // mint steps past it). A record restored from an older copy carries a lower counter, but every id on its list is below it and
  // every file minted after the copy and still on disk is met by the start — so an id the record in force names or lists, or a file
  // the start met, is never minted again. LEFT (named in the line, 主开发 r5114): an older copy put back, a put, then a NEWER copy put
  // back whose list names the id that put took — that start shreds the put's file (three acts of a person in a row)
  const idNum = (id) => (VF.ID_RE.test(String(id)) ? parseInt(String(id), 16) : -1);
  const idOf = (n) => n.toString(16).padStart(10, '0');
  let diskTop = -1, seqMinted = -1;
  const seqBase = () => {
    const counter = record && Number.isInteger(record.fileSeq) && record.fileSeq >= 0 ? record.fileSeq : 0;
    let n = Math.max(counter, diskTop + 1, seqMinted + 1);
    if (record) { for (const b of Object.values(record.entries)) if (b && b.file && b.file.id) n = Math.max(n, idNum(b.file.id) + 1); for (const x of droppedOf(record)) n = Math.max(n, idNum(x) + 1); }
    return n;
  };
  /** A new file id: the counter's next free one (suites may hand their own source: `fileIds`, asked through the same taken check) */
  const mintFileId = () => {
    if (typeof fileIds === 'function') return files.mintId(fileIdTaken);
    let n = seqBase();
    while (fileIdTaken(idOf(n))) n++;
    if (n >= 2 ** 40) throw Object.assign(new Error('no file id left'), { code: 'file_id_unavailable' });
    seqMinted = n;
    return idOf(n);
  };
  const withSeq = (rec, id) => ({ ...rec, fileSeq: Math.max(Number.isInteger(rec.fileSeq) && rec.fileSeq >= 0 ? rec.fileSeq : 0, idNum(id) + 1) });
  // r4774 (A) 1: the ids whose shred is CONFIRMED (or whose file a start found truly not there) — pruned from the list at the next
  // record write (writeRecord), then forgotten
  const confirmedGone = new Set();
  const pruneDropped = (rec) => {
    if (!confirmedGone.size || !rec || !Array.isArray(rec.filesDropped)) return [];
    const gone = rec.filesDropped.filter((x) => confirmedGone.has(String(x)));
    if (gone.length) rec.filesDropped = rec.filesDropped.filter((x) => !confirmedGone.has(String(x)));
    return gone;
  };
  const pendingFiles = new Set();   // the sweep and every shred in flight (filesSettled waits for them: a clean close, the suites)
  const track = (p) => { pendingFiles.add(p); p.then(() => pendingFiles.delete(p), () => pendingFiles.delete(p)); return p; };
  /** THE START's SWEEP: what the record names as dropped goes; a sealed file it says nothing of is KEPT — and SAID, one journal line
   *  with its count and its code (the page's door for such a file belongs to a later unit: it leaves only by the owner's act) */
  const sweepAtStart = async () => {
    const r = await files.sweep(fileLive, { dropped: fileDropped });
    if (r) {
      diskTop = Math.max(diskTop, Number.isInteger(r.top) ? r.top : -1);
      for (const id of r.done || []) confirmedGone.add(id);
      // a listed id whose file the walk did not meet: pruned only when the file system says by its name that it is not there
      const met = new Set(r.done || []);
      for (const id of droppedOf(record)) { if (met.has(id) || fileLive(id)) continue; try { if (await files.has(id) === 'no') confirmedGone.add(id); } catch { /* a failed look prunes nothing */ } }
    }
    const say = (m) => { try { (log.warn || log.log).call(log, m); } catch { /* a logger that throws changes nothing */ } };
    if (r && r.kept > 0) say(`[vault] ${r.kept} sealed file(s) in ${VF.FILE_DIR} that the record does not name were KEPT (files_unnamed) — a file leaves only by the owner's act`);
    if (r && r.owed > 0) say(`[vault] ${r.owed} sealed file(s) in ${VF.FILE_DIR} that the record names as dropped could not be shredded (files_drop_owed) — the next start takes them`);
    return r;
  };
  if (record) track(sweepAtStart().catch(() => null));
  const shredLater = (id) => { track(files.shred(id).then((g) => { if ((g === true || g === 'absent') && droppedOf(record).includes(String(id))) confirmedGone.add(String(id)); }, () => false)); };   // r5114: only a LISTED id is remembered (a put's own failed file is never on the list)   // a failed shred of a DROPPED file: the next start's sweep takes it (the record names it dropped); of a put's own unrecorded file: it is kept and said
  /** → a promise that resolves once the boot sweep and every shred in flight have ended. */
  const filesSettled = async () => { while (pendingFiles.size) await Promise.all([...pendingFiles]); };

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
      corrupt: !!recordBad && !recordHeld(),
      ...(recordHeld() ? { unreadable: true, unreadableWords: recordHold.words() } : {}),   // r3002 (b): «could not be read», its own words
      keys: record ? Object.keys(record.entries).filter((n) => !isSecretName(n)).length : 0,
      secrets: record ? Object.keys(record.entries).filter(isSecretName).length : 0,   // r2: the device link tokens + the frp token
      blocked: st === 'locked' ? blockedList.count() : 0,   // lane vault-locked-refusal-notice: how many callers the lock stopped (the strip's count)
      secretWaiting: st === 'not_set_up' && waiting(),   // lane door-day-one-landing: a secret is stored with no vault — the setup ask's one fact
    };
  }
  const announce = () => { try { bcast({ type: 'vault-state', ...facts() }); } catch { } };

  let batchDepth = 0, batchDirty = false;
  const batchAfterQueue = [];
  function writeRecord(rec) {
    masks = null;   // lane vault-masker-once: an entry added / edited / removed (any record write, even one that then fails) ⇒ the forms are rebuilt at the next ask
    if (faultAt) faultAt('write-record', '');
    if (batchDepth > 0) {
      batchDirty = true;
      return;
    }
    const pruned = pruneDropped(rec);   // r4774 (A) 1: the dropped list loses only the ids whose shred is CONFIRMED
    writeAtomic(FILE, JSON.stringify(rec, null, 2) + '\n');
    contentsChanged('record');
    for (const id of pruned) confirmedGone.delete(id);   // after the write (and its notice): the two lines above stay one block (test-vault-use-grants' «silent» anchor)
  }
  /** Coalesce synchronous in-memory `record` mutations into AT MOST ONE atomic `vault.json` write,
   *  rolling back `record` on failure and running `afterCommit` side effects only after that write succeeds. */
  function batchRecordWrite(fn) {
    if (typeof fn !== 'function') throw new TypeError('vault-engine: batchRecordWrite needs a function');
    const snap = record ? JSON.parse(JSON.stringify(record)) : record;
    const outerDirty = batchDirty;
    const outerQueueLen = batchAfterQueue.length;
    const afterCommit = (cb) => { if (typeof cb === 'function') batchAfterQueue.push(cb); };
    batchDepth++;
    try {
      const out = fn(afterCommit);
      if (batchDepth === 1) {
        const cbs = batchAfterQueue.splice(0, batchAfterQueue.length);
        if (batchDirty && record) {
          batchDepth = 0;
          batchDirty = false;
          try {
            writeRecord(record);
          } catch (e) {
            record = snap;
            masks = null;
            throw e;
          }
        } else {
          batchDepth = 0;
          batchDirty = false;
        }
        for (const cb of cbs) cb();
        return out;
      }
      return out;
    } catch (e) {
      if (batchDepth === 1) {
        batchDirty = false;
        batchAfterQueue.length = 0;
        record = snap;
      } else {
        record = snap;
        batchDirty = outerDirty;
        batchAfterQueue.length = outerQueueLen;
      }
      throw e;
    } finally {
      if (batchDepth > 0) batchDepth--;
    }
  }
  // lane vault-use-grants (the owner 2026-10-27 «我现在完全无法在 vault 里看到刚才建立的密码» — measured: an OPEN Vault window
  // learnt nothing until it was closed and reopened): THE ONE NOTIFY of a change to what the Vault window lists — the record's
  // writer above (every sealed entry: a paste, mint / put, a two-step code, a web login, a delete) and every other door whose
  // rows the window draws (an Integrations field pasted, a run switch, a vault-use grant, a use that opened — they call
  // `contentsChanged`; another store's own card — an account, a mount — writes its own file and is not one of them yet).
  // Coalesced to ONE `{type: 'vault-contents', v}` broadcast per turn of the loop; it carries a counter, never a name or a
  // value — every open window (this tab and every other client) re-reads the list and patches its rows in place.
  let contentsV = 0, contentsDue = null;
  function contentsChanged() {
    if (contentsDue) return;
    contentsDue = setImmediate(() => { contentsDue = null; contentsV++; try { bcast({ type: 'vault-contents', v: contentsV }); } catch { } });
    contentsDue.unref?.();
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
    if (box.file) return { ok: false, code: 'is_a_file' };   // lane lg-vault-file: a FILE entry's value is its file key — no door reads it (fileOpen is the one road to its bytes)
    const v = V.unwrapEntry(dek, name, box);
    return v ? { ok: true, value: v } : { ok: false, code: 'key-malformed' };
  }
  /** Seal `value` under `name` (unlocked only — locked ⇒ refused by name, nothing written). */
  function secretPut(name, value, { prov = null, actor = null, label = null, note = null, kind = null, hosts = null, askedBy = null, owner = null, forHost = null, noteShared = false, pending = null, rev = null, file = null } = {}) {
    if (!isSecretName(name)) return { ok: false, code: 'bad-name' };
    if (state() !== 'unlocked') { blocked(VB.HUB, secretVerb(name)); noteSecret(); return { ok: false, code: lockedCode() }; }   // noteSecret: a not-set-up vault refused a store (lane door-day-one-landing)
    if (!file && record && record.entries && record.entries[name] && record.entries[name].file) return { ok: false, code: 'is_a_file', words: VF.WORDS.is_a_file };   // lane lg-vault-file (adversarial read r1): a FILE stays a file on EVERY writer — a mint over it was a text value that later runs wrote out as the key
    const plain = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value == null ? '' : value), 'utf8');
    try {
      const prevBox = record && record.entries ? record.entries[name] : null;
      const box = { ...V.wrapEntry(dek, name, plain), at: now() };   // int317: `at` = when it was sealed (the Vault window's «saved»)
      if (prov) box.prov = prov;        // lane vault-mint-put: 'minted' | 'stored' — the Vault window's provenance chip (never a value)
      if (actor) box.actor = String(actor).slice(0, 128);   // which conversation / group owns it (a name/id, never a value)
      if (label) box.label = String(label).slice(0, 80);    // lane vault-paste-request: a free entry's label, kind and note (words a person wrote — never a value)
      if (note) box.note = String(note).slice(0, 400);
      if (noteShared === true) box.noteShared = true;   // lane vault-entry-description: words written under the rule that every agent which may use the entry reads them (a note from before had «never shown to an agent» on its box)
      if (kind) box.kind = String(kind).slice(0, 16);
      // lane vault-use-grants: a free entry the owner filled at an agent's REQUEST names the hosts the request named and the
      // conversation that asked (its id and name — words, never a value): the Vault window's search and origin, the
      // «the hosts the entry was stored for» of a vault-use grant
      if (Array.isArray(hosts) && hosts.length) box.hosts = hosts.map((h) => String(h).slice(0, 253)).slice(0, 16);
      if (askedBy && typeof askedBy === 'object' && askedBy.conv) box.askedBy = { conv: String(askedBy.conv).slice(0, 160), name: String(askedBy.name || '').slice(0, 80) };
      if (owner) box.owner = String(owner).slice(0, 128);       // lane vault-agent-own: the conversation that stored it (its durable id — an id, never a value): its own to use
      if (forHost) box.forHost = String(forHost).slice(0, 200); // lane vault-agent-own: a mint's `--for <host/service>` — the host it may go to without asking
      if (pending === 'register' || pending === 'change') box.pending = pending;
      const boxRev = Number.isInteger(rev) && rev >= 1 ? rev : (prevBox && Number.isInteger(prevBox.rev) && prevBox.rev >= 1 ? prevBox.rev : null);
      if (boxRev !== null) box.rev = boxRev;
      if (file) box.file = file;   // lane lg-vault-file: a FILE entry's facts (filePut) — a name, a size, a kind, `encrypted`; never a byte, never a digest of the bytes
      const next0 = file ? withSeq({ ...record, entries: { ...record.entries, [name]: box } }, file.id) : { ...record, entries: { ...record.entries, [name]: box } };   // r4774 (A): the counter raised in the write that names the file
      const next = prevBox && prevBox.file && file && prevBox.file.id !== file.id ? withDropped(next0, prevBox.file.id) : next0;   // r4625: the old file NAMED dropped in the write that stops naming it
      writeRecord(next); record = next;
      if (prevBox && prevBox.file && file && prevBox.file.id !== file.id) shredLater(prevBox.file.id);   // a re-put: the old sealed file goes once the record names the new one
      return { ok: true };
    } catch (e) { return { ok: false, code: `key-unreadable:${KF.errnoOf(e)}` }; } finally { V.zero(plain); }
  }
  // ── AGENT-OWNED SECRETS (design q-043 §9, lane vault-mint-put): mint / put under the caller's own `agent:<scope>/<name>`.
  //    The ROUTE builds the name from the SESSION's scope (src/routes/vault.js); the engine seals and NEVER returns a value.
  /** MINT: the HUB makes the random value (V.randomSecret) and seals it — the caller is handed the entry name + its
   *  `vault://` reference, never the value. → { ok, name, ref } | { ok:false, code } (a bad length/charset, or a locked
   *  vault refused by name). */
  function agentMint(name, { length, charset, actor = null, forHost = null, note = null } = {}) {
    if (!V.AGENT_NS_RE.test(String(name || ''))) return { ok: false, code: 'bad-name' };
    if (state() !== 'unlocked') { blocked(VB.HUB, secretVerb(name)); noteSecret(); return { ok: false, code: lockedCode() }; }
    const mv = V.mintVerdict({ length, charset });
    if (!mv.ok) return mv;
    const value = V.randomSecret(mv.length, mv.charset);
    try {
      // lane vault-entry-description r2 (MAJOR 2): a re-mint of an EXISTING name rotates the VALUE and keeps its words (name,
      // description, shared mark) — a later change of the words is `describe`, which waits for the owner; `--note` on it is refused
      const kept = wordsKept(name);
      if (kept && note && !(kept.noteShared && kept.note === note)) return { ok: false, code: 'words_later' };   // r3 (MINOR d): a re-send of the SHARED description is idempotent (never compared with a private one)
      const r = secretPut(name, value, { prov: 'minted', actor, forHost, ...(kept ? kept : { note, noteShared: !!note }) });   // note: lane vault-entry-description (`mint --note`, the route judged it)
      if (!r.ok) return r;
      audit('vault-agent-mint', { why: name, actor: actor ? String(actor).slice(0, 128) : null, by: 'agent' });   // the name + who — NEVER the value
      return { ok: true, name, ref: V.vaultRefOf(name), ...(kept ? { rotated: true } : {}) };
    } finally { V.zero(value); }
  }
  /** PUT: the caller hands a value it already has (a vendor key) — sealed, provenance 'stored'. Same shape; no value back. */
  function agentPut(name, value, { actor = null, note = null } = {}) {
    if (!V.AGENT_NS_RE.test(String(name || ''))) return { ok: false, code: 'bad-name' };
    if (value == null || String(value) === '') return { ok: false, code: 'value_required' };
    if (state() !== 'unlocked') { blocked(VB.HUB, secretVerb(name)); noteSecret(); return { ok: false, code: lockedCode() }; }
    const kept = wordsKept(name);   // lane vault-entry-description r2 (MAJOR 2): a re-put rotates the value, never the words
    if (kept && note && !(kept.noteShared && kept.note === note)) return { ok: false, code: 'words_later' };   // r3 (MINOR d)
    if (record.entries[name] && record.entries[name].file) return { ok: false, code: 'is_a_file', words: VF.WORDS.is_a_file };   // lane lg-vault-file: a file stays a file
    const r = secretPut(name, value, { prov: 'stored', actor, ...(kept ? kept : { note, noteShared: !!note }) });   // note: lane vault-entry-description (`put --note`)
    if (!r.ok) return r;
    audit('vault-agent-put', { why: name, actor: actor ? String(actor).slice(0, 128) : null, by: 'agent' });
    return { ok: true, name, ref: V.vaultRefOf(name), ...(kept ? { rotated: true } : {}) };
  }
  // ── FILE ENTRIES (lane lg-vault-file, B-0830 — design q-058, the owner's decisions of 2026-11-03): the bytes sealed in
  //    data/vault-files/<id>.vfile under a random FILE KEY that is the entry's sealed value (src/server/vault-files.js); the
  //    box carries the file's facts (`file`: id, name, size, kind, encrypted — never a digest of the bytes). ONE road opens the bytes — fileOpen (a
  //    run's injection; the owner's download) — and secretGet refuses a file entry by name (`is_a_file`): no door answers its key.
  /** → the box's file facts (src/vault-file.js factsOf) | null — names and sizes only; readable while locked (no DEK). */
  const fileOf = (name) => { const b = record && record.entries[String(name)]; return b && b.file ? VF.factsOf(b.file) : null; };
  /** Seal a FILE under `name` (a secret name the door built): the bytes judged (VF.fileVerdict), sealed in a NEW `.vfile`,
   *  then the entry written (secretPut — the old file of the same name shredded once the record names the new one; a failed
   *  record write shreds the new file). A name holding a TEXT value is refused (the owner's D5: never upgraded).
   *  The sealed file is written OFF the main loop (vault-files' fs.promises) — so the lock, the name and a text entry of the
   *  same name are asked again once it is on disk. → a promise of { ok, name, file (its public facts) } | { ok: false, code, words? }. */
  async function filePut(name, bytes, { filename = null, prov = null, actor = null, label = null, note = null, noteShared = false, owner = null, askedBy = null, hosts = null, expect = null, keepWords = false } = {}) {
    if (!isSecretName(name)) return { ok: false, code: 'bad-name' };
    const fv = VF.fileVerdict(bytes, filename);
    if (!fv.ok) return fv;
    if (state() !== 'unlocked') { blocked(VB.HUB, secretVerb(name)); noteSecret(); return { ok: false, code: lockedCode() }; }
    const prev = record.entries[name];
    if (prev && !prev.file) return { ok: false, code: 'not_a_file', words: VF.WORDS.not_a_file };
    if (keepWords && !(prev && prev.file)) return { ok: false, code: 'entry_unknown' };   // 主开发 r5048 «Replace file…»: a replace needs the file it replaces
    let id = mintFileId();
    const key = files.mintKey(), ep0 = epoch;   // r4628: never an id an entry, the dropped list or a put in flight holds   // round 3: the lock EPOCH — a lock-then-unlock during a slow write is a lock too
    filesInFlight.add(id);
    try {
    let sha256;
    try { for (let step = 0; ; step++) {   // r4774 (A) 4: an id whose file is already on disk (a kept file) — the mint steps past it
      try { sha256 = await files.write(id, key, bytes); break; } catch (e) {
        if (!(e && e.code === 'file_id_taken') || step >= 8 || typeof fileIds === 'function') throw e;
        filesInFlight.delete(id); diskTop = Math.max(diskTop, idNum(id)); id = mintFileId(); filesInFlight.add(id);
      }
    }
    } catch (e) { key.fill(0); return e && (e.code === 'files_stuck' || e.code === 'file_id_taken' || e.code === 'file_look_failed') ? { ok: false, code: 'file_not_stored', words: VF.WORDS.file_not_stored } : { ok: false, code: `key-unreadable:${KF.errnoOf(e)}` }; }   // round 4: a stuck store (vault-files' bound) is said as a put that did not happen
    if (expect && expect.sha256 != null && String(expect.sha256).toLowerCase() !== sha256) { key.fill(0); shredLater(id); return { ok: false, code: 'bytes_bad', words: VF.WORDS.bytes_bad }; }
    // the write awaited: a lock (its epoch moved — a lock then an unlock too), or a TEXT entry of this name, may have landed meanwhile
    if (state() !== 'unlocked' || epoch !== ep0) { key.fill(0); shredLater(id); blocked(VB.HUB, secretVerb(name)); noteSecret(); return { ok: false, code: state() === 'unlocked' ? KF.VAULT_LOCKED : lockedCode() }; }
    if (record.entries[name] && !record.entries[name].file) { key.fill(0); shredLater(id); return { ok: false, code: 'not_a_file', words: VF.WORDS.not_a_file }; }   // the sender's digest: what arrived is what was sent
    const file = { id, name: fv.name, size: fv.size, lines: fv.lines, kind: fv.kind, encrypted: fv.encrypted };   // the cure (RULE 5′, test-key-file-law): NO digest of the bytes is kept — vault.json is not sealed field by field, and a short token file's sha256 is a guess away; the sender's digest is checked in memory above, the seal's GCM tag (the id its AAD) proves the bytes
    let r;
    // 主开发 r5048 «Replace file…» (`keepWords`): the entry KEEPS its words — read from the box it replaces AT this write (a drop meanwhile
    // replaces nothing: the new file is shredded); only the file's facts and the sealed time change
    const was = keepWords ? record.entries[name] : null;
    if (keepWords && !(was && was.file)) { key.fill(0); shredLater(id); return { ok: false, code: 'entry_unknown' }; }
    const words = keepWords ? { prov: was.prov || null, actor: was.actor || null, label: was.label || null, note: was.note || null, noteShared: was.noteShared === true, owner: was.owner || null, askedBy: was.askedBy || null, hosts: Array.isArray(was.hosts) ? was.hosts : null } : { prov, actor, label, note, noteShared, owner, askedBy, hosts };
    try { r = secretPut(name, key, { ...words, file }); } finally { key.fill(0); }
    if (!r.ok) { shredLater(id); return r; }
    return { ok: true, name, file: VF.publicFactsOf(file) };
    } finally { filesInFlight.delete(id); }
  }
  /** THE ONE ROAD to a file entry's BYTES: unlocked only — its file key unwrapped, the `.vfile` opened (its GCM tag under the
   *  entry's own key and the box's size prove the bytes — no digest is kept), read OFF the main loop. → a promise of { ok, bytes: Buffer (the caller's copy to zero), file } |
   *  { ok: false, code }; a lock or a re-put while it read ⇒ the bytes zeroed, the lock's code / `file_moved`. Never audits:
   *  the door that uses it writes the use (a run's receipt, the owner's download). */
  async function fileOpen(name) {
    if (!isSecretName(name)) return { ok: false, code: 'bad-name' };
    if (state() !== 'unlocked') { blocked(VB.HUB, secretVerb(name)); return { ok: false, code: lockedCode() }; }
    const box = record.entries[name];
    if (!box) return { ok: false, code: 'entry_unknown' };
    const f = box.file ? VF.factsOf(box.file) : null;
    if (!f) return { ok: false, code: 'not_a_file', words: VF.WORDS.not_a_file };
    const key = V.unwrapEntry(dek, name, box), ep0 = epoch;
    if (!key || key.length !== 32) { V.zero(key); return { ok: false, code: 'key-malformed' }; }
    let bytes;
    try { bytes = await files.read(f.id, key, f); }
    catch (e) {
      // round 2 (the cure's read): a re-put or a drop while it read shreds THIS file under it — said as what happened
      const now = record && record.entries[name];
      if (!now) return { ok: false, code: 'entry_unknown' };
      if (!now.file || now.file.id !== f.id) return { ok: false, code: 'file_moved', words: VF.WORDS.file_moved };
      return { ok: false, code: e && e.code && e.code !== 'files_stuck' ? e.code : 'file_unreadable' };   // round 4: a stuck store reads as unreadable (nothing was used)
    }
    finally { V.zero(key); }
    if (state() !== 'unlocked' || epoch !== ep0) { bytes.fill(0); return { ok: false, code: state() === 'unlocked' ? KF.VAULT_LOCKED : lockedCode() }; }   // round 3: a lock-then-unlock while it read is a lock
    const now = record.entries[name];
    if (!now || !now.file || now.file.id !== f.id) { bytes.fill(0); return { ok: false, code: 'file_moved', words: VF.WORDS.file_moved }; }
    return { ok: true, bytes, file: VF.publicFactsOf(f) };
  }
  /** PUT a FILE the agent holds (`vibespace-vault put <name> --file <0600 file>`) under its own `agent:<scope>/<name>` —
   *  provenance 'stored' (the agent saw the bytes), its words kept on a re-put (as agentPut). Same answer shape + `file`. */
  async function agentFilePut(name, bytes, { filename = null, actor = null, note = null, expect = null } = {}) {
    if (!V.AGENT_NS_RE.test(String(name || ''))) return { ok: false, code: 'bad-name' };
    const kept = wordsKept(name);
    if (kept && note && !(kept.noteShared && kept.note === note)) return { ok: false, code: 'words_later' };
    const r = await filePut(name, bytes, { filename, prov: 'stored', actor, expect, ...(kept ? kept : { note, noteShared: !!note }) });
    if (!r.ok) return r;
    audit('vault-agent-put', { why: name, actor: actor ? String(actor).slice(0, 128) : null, by: 'agent', file: { size: r.file.size, kind: r.file.kind } });   // the name, the size, the kind — never a byte
    return { ok: true, name, ref: V.vaultRefOf(name), file: r.file, ...(kept ? { rotated: true } : {}) };
  }
  /** int317 + lane vault-mint-put: the secret entries' NAMES, their seal instants, and (agent entries) `prov`/`actor` —
   *  never a box, never a value; the Vault window's «Hub secrets» rows (src/server/vault-contents.js secretSource). */
  const secretNames = () => (record ? Object.keys(record.entries).filter(isSecretName).sort().map((name) => { const b = record.entries[name] || {}; return { name, at: Number(b.at) || null, prov: b.prov || null, actor: b.actor || null, ...(b.label ? { label: b.label, note: b.note || '', kind: b.kind || null } : b.kind ? { kind: b.kind } : {}), ...(!b.label && b.note ? { note: b.note } : {}), ...(b.noteShared === true ? { noteShared: true } : {}), ...(Array.isArray(b.hosts) ? { hosts: b.hosts.slice() } : {}), ...(b.askedBy ? { askedBy: { ...b.askedBy } } : {}), ...(b.owner ? { owner: b.owner } : {}), ...(b.forHost ? { forHost: b.forHost } : {}), ...(b.pending === 'register' || b.pending === 'change' ? { pending: b.pending } : {}), ...(Number.isInteger(b.rev) && b.rev >= 1 ? { rev: b.rev } : {}), ...(b.file ? { file: VF.publicFactsOf(b.file) } : {}) }; }) : []);   // lane vault-paste-request: a free entry's label / note / kind — lane browser-login: a web login's provenance word (`kind` = its source), `pending` state and `rev` counter, never a value
  /** lane vault-entry-description r2: the words an EXISTING entry carries ({ label, note, noteShared } as its box holds them) —
   *  a rotation (mint / put of the same name) writes them back unchanged; null = no such entry. Never a value. */
  const wordsKept = (name) => { const o = record && record.entries[name]; return o ? { label: o.label || null, note: o.note || null, noteShared: o.noteShared === true } : null; };
  /** lane vault-entry-description: THE ONE WRITER of an entry's WORDS after its creation — its name (the box's `label`) and its
   *  description (its `note`) — for the owner's Allow of an agent's proposal (`proposedBy` the agent, `approvedBy` the owner)
   *  and the owner's own Edit… in the Vault window (`proposedBy` the owner). Words only: the sealed box is untouched (no DEK read) — and
   *  still UNLOCKED only (a lock withdraws every ask; the window lists no row while locked). `to` = { label?, note? } judged by
   *  the caller (src/vault-paste.js wordsOf; '' clears the note); r2 (MAJOR 1): the box is marked `noteShared` ONLY when this act
   *  writes the description — a rename leaves a legacy note the owner's (its words are read by
   *  every agent that may use it). ONE audit line { entry, proposedBy, approvedBy, from, to } — words, never a value.
   *  → { ok, from, to } | { ok: false, code }. */
  function editEntryWords(name, to = {}, { proposedBy = null, approvedBy = null } = {}) {
    if (!isSecretName(name)) return { ok: false, code: 'bad-name' };
    if (state() !== 'unlocked') return { ok: false, code: lockedCode() };
    const box = record.entries[name];
    if (!box) return { ok: false, code: 'entry_unknown' };
    const from = { label: box.label || null, note: box.note || '' };
    const nb = { ...box };
    if (to.label !== undefined && to.label !== null) nb.label = String(to.label).slice(0, 80);
    if (to.note !== undefined && to.note !== null) { if (to.note) nb.note = String(to.note).slice(0, 400); else delete nb.note; nb.noteShared = true; }   // r2 (MAJOR 1): shared only by a write OF the description
    const words = { label: nb.label || null, note: nb.note || '' };
    try { const next = { ...record, entries: { ...record.entries, [name]: nb } }; writeRecord(next); record = next; } catch (e) { return { ok: false, code: `key-unreadable:${KF.errnoOf(e)}` }; }
    audit('vault-entry-words', { entry: name, proposedBy: proposedBy ? String(proposedBy).slice(0, 80) : null, approvedBy: approvedBy ? String(approvedBy).slice(0, 80) : null, from, to: words });
    return { ok: true, from, to: words };
  }
  /** Forget an entry (an unpaired device, a cleared relay token) — needs no DEK, so a locked vault forgets too. */
  function secretDrop(name) {
    if (!isSecretName(name)) return { ok: false, code: 'bad-name' };
    if (!record || !record.entries[name]) return { ok: true, already: true };
    const { [name]: gone, ...rest } = record.entries;
    const isWebLogin = /^web-login:/.test(String(name || ''));
    let sealedRev = 0;
    if (isWebLogin && dek && gone) {
      const plain = V.unwrapEntry(dek, name, gone);
      if (plain) {
        try {
          const parsed = JSON.parse(plain.toString('utf8'));
          if (parsed && Number.isInteger(parsed.rev) && parsed.rev >= 1) sealedRev = parsed.rev;
        } catch { /* non-JSON or corrupt entry */ } finally {
          V.zero(plain);
        }
      }
    }
    const nextFloor = isWebLogin
      ? Math.max(Number(record.loginRevFloor) || 0, Number(gone && gone.rev) || 0, sealedRev, 1)
      : (Number(record.loginRevFloor) || 0);
    try {
      const next0 = { ...record, ...(nextFloor > 0 ? { loginRevFloor: nextFloor } : {}), entries: rest };
      const next = gone && gone.file && gone.file.id ? withDropped(next0, gone.file.id) : next0;   // r4625: a file entry's sealed file NAMED dropped in the same write
      writeRecord(next); record = next;
    } catch (e) { return { ok: false, code: `key-unreadable:${KF.errnoOf(e)}` }; }
    if (gone && gone.file && gone.file.id) shredLater(gone.file.id);   // lane lg-vault-file: a file entry's sealed bytes go with it (overwritten, then unlinked — off the loop, after the record no longer names it)
    return { ok: true };
  }
  const loginRevFloor = () => (record && Number.isInteger(record.loginRevFloor) && record.loginRevFloor >= 0 ? record.loginRevFloor : 0);
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
  const secretVerb = (name) => { const n = String(name), kind = n.split(':')[0]; return kind === 'host' ? 'a device link token' : kind === 'apikey' ? 'an automation key' : kind === 'file' ? `the sealed file ${n.slice(5)}` : kind === 'keyfile' ? 'a stored file' : kind === 'agent' ? 'an agent secret' : kind === 'secret' ? 'a stored password or key' : kind === 'web-login' ? 'a website login' : kind === 'provider' ? 'a model provider\'s key' : `the stored secret ${n}`; };   // a machine's / a key's id (and an agent entry's scope) is never the words
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
    if (outcome === 'ok' || o.used === true) { uses.set(name, u); const sn = o.store ? keyNameOf(o.store) : null; if (sn) uses.set(sn, u); if (u.by !== 'system') contentsChanged('use'); }   // o.used: a run's child had the value, whatever ended it — lane vault-use-grants: a use moves the row's «last used» and its «used N×» (the window is told). Round 2 (claim 1): NEVER notify on the hub's own `by:system` reads — the window's own listing does such a read (app-logins → lawfulKey → noteUse), so a notify there would feed itself an endless re-read loop.
    if (u.by === 'system') return { receipt: null };   // the hub's own read: its «last used» only (a line per store read would drown the file)
    const receipt = VU.RECEIPT_RE.test(String(o.receipt || '')) ? String(o.receipt) : `vr-${crypto.randomBytes(6).toString('hex')}`;
    if (VU.BEARERS.includes(u.by)) audit('vault-use', VU.useLine({ at: u.at, entry: name, purpose: o.purpose, use: u, actor: o.actor, outcome, receipt, ip: o.ip, grant: o.grant }));   // lane vault-use-grants: `o.grant` = the vault-use grant that admitted it
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
  /** lane vault-use-grants: THE COUNTS of every entry's uses over the same bounded tail (VU.countsOf — the Vault window's «used
   *  12× by 3 conversations», per entry and per vault-use grant), read again only when the file moved (size / mtime). */
  let counted = { sig: null, counts: {} };
  function useCounts() {
    let fd = null;
    try {
      fd = fs.openSync(path.join(dataDir, AUDIT_FILE), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
      const st = fs.fstatSync(fd);
      if (!st.isFile()) return {};
      const sig = `${st.size}:${st.mtimeMs}`;
      if (counted.sig === sig) return counted.counts;
      const n = Math.min(st.size, USES_TAIL), buf = Buffer.alloc(n);
      let got = 0;
      while (got < n) { const r = fs.readSync(fd, buf, got, n - got, st.size - n + got); if (!r) break; got += r; }
      let text = buf.subarray(0, got).toString('utf8');
      if (st.size > n) text = text.slice(text.indexOf('\n') + 1);
      counted = { sig, counts: VU.countsOf(text) };
      return counted.counts;
    } catch { return {}; } finally { if (fd != null) { try { fs.closeSync(fd); } catch { } } }
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
        // r3244: a migration ledger that could not be read ran nothing — the refusal says THAT, never «a key file could not be sealed»
        if (res && res.code === 'ledger-unread' && !lost.length) return { ok: false, code: 'migration_failed', why: `${ledgerFileOf(path.join(dataDir, 'migrations.json'))} could not be read (${res.unread || 'unread'}) — no key file was sealed, every file is as it was` };   // r3288 (5): the runner's one source of its name
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
    if (recordHeld()) { try { await recordHold.again(); } catch { } }   // r3002 (b): a person's press asks ONE read again now (off the loop)
    if (!setUp()) return { ok: false, code: 'vault_not_set_up' };
    if (dek) return { ok: true, already: true };
    const t = now();
    if (pacedUntil > t || failedTries % PACE_AFTER + inFlight >= PACE_AFTER) return { ok: false, code: 'paced', retryInMs: Math.max(pacedUntil - t, 0) || PACE_MS, failedTries };
    if (typeof password !== 'string' || !password) return { ok: false, code: 'password_not_text' };
    if (recordBad) { audit('vault-unlock-failed', { ip, code: badCode() }); return { ok: false, code: badCode(), ...(recordHeld() ? { error: recordHold.words() } : {}) }; }
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
    if (recordBad) return { ok: false, code: badCode() };
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
    V.zero(dek); dek = null; masks = null;   // lane vault-masker-once: the compiled forms die with the key — every lock, the quiet ones too
    for (const k of keys.values()) V.zero(k);
    keys.clear();
    epoch++; lockedSince = now(); blockedList.clear();   // a new lock epoch: nobody stopped yet
    if (!quiet) { audit('vault-locked', { ip, why }); announce(); runHooks(lockHooks, 'a lock', why); }
    return { ok: true };
  }

  async function change(oldPassword, newPassword, { ip = null } = {}) {
    if (!setUp()) return { ok: false, code: 'vault_not_set_up' };
    if (recordBad) return { ok: false, code: badCode() };
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

  /** lane vault-masker-once — THE ONE COMPILED SET of the output belt (src/agent-output-belt.js): `build()` (the belt's — every
   *  maskable secret's forms, src/vault-run.js compileForms) runs ONCE per vault state and its result is shared by every sink; it
   *  is dropped at every record write and load (an entry added, edited or removed) and at every lock. Memory only: never written,
   *  never answered by any route. Not unlocked ⇒ null and nothing is built (the belt then masks no live value, as before).
   *  `masksHeld()` says whether a set is held (a gate's question — never a value). */
  function maskForms(build) {
    if (state() !== 'unlocked' || typeof build !== 'function') return null;
    if (masks) return masks.forms;
    const at = record;
    const forms = build();
    if (state() === 'unlocked' && record === at) masks = { forms };   // kept only for the record it was built from
    return forms;
  }
  const masksHeld = () => !!masks;
  const provider = { keyFor, peek, hasEntry, state, epoch: () => epoch, secretGet, secretPut, secretDrop, secretAdopt, secretNames, blocked, maskForms, masksHeld };   // secretNames: the agent-output belt (src/agent-output-belt.js) enumerates the maskable entries from a data dir   // `blocked`: a door that holds only the data dir reaches the ONE helper (SB.vaultForDir)
  const unregister = register ? SB.registerVault(dataDir, provider) : () => {};
  const engine = {
    dataDir, file: FILE, state, facts, setup, unlock, lock, change, setIdleLock, touch, idleTick, keyFor, peek, hasEntry,
    // lane vault-contents-window: the Vault window's doors (src/server/vault-contents.js) — the second password again, a
    // store key's last use, a use by a person, and the vault's audit file (one line per reveal — never a value)
    confirm, lastUse: (store) => { const n = keyNameOf(store); return n && uses.has(n) ? { ...uses.get(n) } : null; }, noteUse, audit,
    usesOf, useCounts, contentsChanged,   // lane vault-use-grants: the window's use counts; THE ONE NOTIFY of a listed change
    // lane vault-manual-and-lock: ONE conversation's own vault-use lines (vibespace-vault uses) — names, codes, receipts   // lane vault-use-law: noteUse = THE ONE WRITER of a use (the window's reveal, a door's use, a refusal)
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
    fileOf, filePut, fileOpen, agentFilePut, filesSettled,   // lane lg-vault-file (B-0830): a FILE entry — its facts, its put, its ONE opening road (filePut / fileOpen / agentFilePut answer promises: the bytes never touch the main loop) · the sweep's and the shreds' end
    batchRecordWrite, loginRevFloor,   // lane vault-login: single-write batchRecordWrite (afterCommit) + monotonic floor across web-login drop/re-add
    editEntryWords,   // lane vault-entry-description: THE writer of an entry's name and description after its creation
    macOf,   // lane vault-run-door: a mark under a DEK-derived key (the run door's store) — null unless unlocked
    epoch: () => epoch, resumeSeal,
    maskForms, masksHeld,   // lane vault-masker-once
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
