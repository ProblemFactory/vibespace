'use strict';
/**
 * THE DEVICE LINK TOKENS (lane vault-e2e-password-fix-r2; design q-042 D1). The hub authenticates TO a paired machine's
 * daemon with that machine's host token (vsht_, the mux `hello`). Before r2 each one sat in plaintext in
 * data/agentd/host-<id>.token AND was copied into every remote session's attach config (data/agentd/session-<sid>.json):
 * whoever held the disk held a remote-code-execution credential for every paired machine.
 *
 *   · THE VAULT SET UP ⇒ the token is the entry `host:<id>`: unlocked ⇒ read (or minted INTO the vault — never a file);
 *     LOCKED ⇒ refused by name (`vault_locked`): no link hello, no spawn, no attach until a person unlocks. A file left
 *     from before the vault is sealed at the next open (setup / unlock: `adoptAll`) or at its first read — wrapped, the
 *     record read back, then the file overwritten and unlinked (the engine's `secretAdopt`).
 *   · NOT SET UP ⇒ the file, exactly as before (the migration window — the vault's own rule for every store key).
 *   · no engine in this process over a dir whose vault is set up ⇒ LOCKED (never the file).
 *   · THE ONE ROAD to a session: a remote session's attach child (src/agentd/attach-cli.js) carries NO token — not in its
 *     config file, its argv or its env. At every (re)start it asks the hub over loopback with its own session token
 *     (GET /api/agent/vault/link-token, src/routes/vault.js) and holds the answer in memory. `stripCopies()` takes the
 *     token out of every attach config an older build wrote (each start, whatever the vault's state; the old bytes
 *     overwritten in place).
 */
const fs = require('fs');
const path = require('path');
const SB = require('../secret-box.js');
const KF = require('../key-file.js');
const { replaceShredding, shredFile } = require('../secret-file.js');
const FC = require('../fd-close.js');   // B-574d (lane nl-paired): the first mint's temp synced before its link

const VB = require('../vault-blocked.js');   // PURE: who a refusal stopped (lane vault-locked-refusal-notice)
const SR = require('../store-read.js');            // B-f276 (r4721): the store-read law — the legacy token file's read has three answers
const HOLD = require('../store-read-hold.js');     // … and its HOLD when the read fails or its bytes are torn (never a token minted over it)
const TOKEN_PARSE = (t) => String(t).trim();
const TOKEN_SHAPE = (v) => typeof v === 'string' && /^[\x21-\x7e]{16,512}$/.test(v);   // one printable word (a minted token: its prefix + hex)
const FILE_RE = /^host-([\w.-]+)\.token$/;
// B-574d (lane nl-paired, 主开发 r4982 + its own read's must): A FIRST MINT THAT CANNOT LAND is said ONCE and remembered for the life of
// the hub PROCESS, by its key file — the hub builds TWO HostTokens over one data folder (server.js's, for the dial road, and
// mounts-plugins-wiring's, for the ssh road and the renew), so the memory is the module's, never an instance's: no hello and no read of
// either tries it again. Only a renew that LANDS ends it; a restart starts afresh (the vault's road: also a lock and an unlock — its epoch).
// r5047 (主开发, the pinned road's hole): A REFUSED READ OF THE KEY FILE (any code but «no such file»: EACCES after a restore that changed
// its owner, EIO, a stalled storage) is HELD by its own code — said once, thrown as hub_identity_unreadable (no renew is offered for it:
// the key may be whole), read again only at its next rung (30 s doubling to 5 min), never at every hello. By the key file, the module's.
const READ_HELD = new Map();   // path.resolve(<the key file>) → { error, tries, nextAt }
const MINT_FAILED = new Map();   // '<road>:' + path.resolve(<the key file>) → the error of its first mint that could not land (road: the file before the vault, or the vault)
const CFG_RE = /^session-.+\.json$/;
const entryOf = (hostId) => 'host:' + hostId;

/** The refusal every caller words as is: the device and the act it stops, and the door. */
function lockedError(hostId) {
  return Object.assign(new Error(`the vault is locked — the link token of ${hostId} opens after the owner unlocks the vault with the second password (no link, no session on that machine until then)`), { code: 'vault_locked' });
}

/**
 * @param {object} o
 * @param {string} o.dataDir   the hub's data dir (its vault is looked up through src/secret-box.js `vaultForDir`)
 * @param {string} [o.agentdDir]  data/agentd — the legacy token files + the attach configs
 * @param {() => string} [o.mint]  THE ONE DOOR of a pairing token (src/pairing-token.js)
 * @param {(hostId: string) => string|null} [o.nameOf]  a machine's NAME (lane vault-locked-refusal-notice: a refusal is noted by
 *   it — the vault's `blocked`, never the id); `tokenFor(hostId, {actor})` = the conversation whose link the lock stops
 */
function create({ dataDir, agentdDir = path.join(dataDir, 'agentd'), mint = () => require('../pairing-token.js').mintToken('host'), nameOf = () => null, log = console, anyHubPin = () => false } = {}) {
  if (!dataDir) throw new TypeError('host-tokens: dataDir is required');
  const fileOf = (hostId) => path.join(agentdDir, 'host-' + hostId + '.token');
  const ensureDir = () => { if (!fs.existsSync(agentdDir)) fs.mkdirSync(agentdDir, { recursive: true }); };
  /** the migration window (no vault set up): the 0600 file beside the data, read or minted.
   *  B-f276 (r4721, lane lg-vault-stages): ITS READ UNDER THE STORE-READ LAW. Not there ⇒ the first pairing (minted, written 0600, as
   *  before). A read that FAILED, or torn bytes ⇒ HELD (src/store-read-hold.js): the link is refused BY NAME (`link_token_unread`, the
   *  machine named), nothing is written over the file, and it is read again off the loop; its token back ⇒ the next link reads it.
   *  Torn bytes (not a token's shape) are kept aside ONCE (0600, beside the file) and a FRESH token is written over them off the loop
   *  (refused by name until it is on disk; r4721's round): the machine is paired again —
   *  the torn bytes were no token, said by name. Their copies are SHREDDED at an unpair and at the vault's open sweep. The value is never in a log, an error, a held row or a
   *  copy's name. (A token the machine already has is never minted over: that refused every hello until a person paired it again.) */
  const holds = new Map();   // hostId → its hold (from its first failed or torn read)
  const renewing = new Map();   // hostId → a fresh token being written over torn bytes: REFUSED until it is on disk (r4721's round: a
                                // token handed out before then could be lost to a restart, and the machine paired again against it)
  const COPY_RE = /^host-[\w.-]+\.token\.corrupt-\d+(?:-\d+)?$/;   // a torn token's copy beside it (the helper's set-aside name)
  const machineOf = (hostId) => { let n = null; try { n = nameOf(hostId); } catch { n = null; } return VB.actorName(n, 'a paired machine'); };
  function legacy(hostId) {
    ensureDir();
    const f = fileOf(hostId);
    if (renewing.has(hostId)) throw Object.assign(new Error(`the link to ${machineOf(hostId)}: its new link token is being written (its torn bytes kept aside) — it answers once it is on disk`), { code: 'link_token_unread', status: 503 });
    const h = holds.get(hostId);
    if (h && h.held()) throw h.refusal(`the link to ${machineOf(hostId)}`);
    let read;
    try { read = { text: fs.readFileSync(f, 'utf-8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { parse: TOKEN_PARSE, valid: TOKEN_SHAPE });
    if (a.state === 'data') return a.value;
    if (a.state === 'missing') {   // the first pairing
      const tok = mint();
      fs.writeFileSync(f, tok, { mode: 0o600 });
      return tok;
    }
    const hold = h || HOLD.create({
      file: f, parse: TOKEN_PARSE, valid: TOKEN_SHAPE, aside: (m) => `${f}.corrupt-${m}`, code: 'link_token_unread', log: (l) => log.warn?.(`[host-tokens] ${l}`),
      words: (x) => `the link token of this machine could not be read${x && x.code ? ` (${x.code})` : ''} — nothing is written over it, and it is read again by itself; no link to the machine until it reads`,
      onLift: (value, facts) => { if (facts && facts.setAside) renew(hostId, f, facts.setAside); },
    });
    holds.set(hostId, hold);
    hold.start(a);
    throw hold.refusal(`the link to ${machineOf(hostId)}`);
  }
  /** torn bytes kept aside (their copy named): a FRESH token, written over the torn file off the loop (0600) — the machine is paired again */
  function renew(hostId, f, copyName) {
    const tok = mint();
    renewing.set(hostId, tok);
    log.warn?.(`[host-tokens] the link token of ${machineOf(hostId)} was torn — its bytes are kept aside as ${copyName}; a new one is written: pair the machine again`);
    try {   // THE STORE WRITER's thread writes it (whole, synced, then put in place) — never the hub's loop
      require('../store-writer.js').storeWriter().dirty(f, { name: 'host-token.write', rank: 0, mode: 0o600, makeDir: true, produce: () => (renewing.get(hostId) === tok ? tok : null),   // unpaired meanwhile: nothing written
        onWritten: (ok, e) => {
          if (renewing.get(hostId) !== tok) { if (ok) shredLanded(hostId, f, tok).catch(() => false); return; }   // r5353: unpaired while its write was in flight
          if (ok) renewing.delete(hostId); else log.warn?.(`[host-tokens] the new link token of ${machineOf(hostId)} could not be written (${(e && e.code) || 'error'}) — its link stays refused, the writer tries again`);
        } });
    } catch (e) { renewing.delete(hostId); log.warn?.(`[host-tokens] the new link token of ${machineOf(hostId)} could not be handed to the store writer (${(e && e.code) || 'error'}) — its torn file is read again at the next link`); }
  }
  /** → 'not_set_up' | 'locked' | 'unlocked' — as THIS process sees the dir (no engine over a sealed dir = locked) */
  function stateOf() {
    const v = SB.vaultForDir(dataDir);
    if (!v) return SB.sealedDir(dataDir) ? 'locked' : 'not_set_up';
    return v.state();
  }
  /** lane vault-locked-refusal-notice: the refusal, NOTED (the vault's ONE helper): the machine by name — `device link` — or
   *  the conversation `who.actor` whose link to it waits. → the error to throw. */
  function refused(hostId, who) {
    let named = null; try { named = nameOf(hostId); } catch { named = null; }
    const machine = VB.actorName(named, 'a paired machine');
    const v = SB.vaultForDir(dataDir);
    try { if (v && typeof v.blocked === 'function') { if (who && who.actor) v.blocked(VB.actorName(who.actor, 'a conversation'), `its link to ${machine}`); else v.blocked(machine, 'device link'); } } catch { }
    return lockedError(hostId);
  }
  /** THE token of a machine (`host-<hex>` for an ssh machine, `dial-<deviceId>` for a dialed one) — throws `vault_locked`.
   *  `who` = { actor } — the conversation asking (the link-token door), else the machine's own link. */
  function tokenFor(hostId, who = null) {
    const v = SB.vaultForDir(dataDir);
    const st = stateOf();
    if (st === 'not_set_up') return legacy(hostId);
    if (st !== 'unlocked' || !v) throw refused(hostId, who);
    const name = entryOf(hostId);
    let r = v.secretGet(name);
    if (r.ok && !r.value && fs.existsSync(fileOf(hostId))) r = v.secretAdopt(name, fileOf(hostId));
    if (!r.ok) {
      if (r.code === KF.VAULT_LOCKED) throw refused(hostId, who);
      throw Object.assign(new Error(`the link token of ${hostId} could not be read from the vault (${r.code})`), { code: r.code });
    }
    if (r.value) { const t = r.value.toString('utf8'); r.value.fill(0); return t; }
    const tok = mint();
    const put = v.secretPut(name, tok);
    if (!put.ok) throw put.code === KF.VAULT_LOCKED ? refused(hostId, who) : Object.assign(new Error(`a link token for ${hostId} could not be sealed into the vault (${put.code})`), { code: put.code });
    return tok;
  }
  // ── THIS HUB'S IDENTITY (lane lg-remote-hardening, B-7f0b — design q-042 D3 half b; 主开发's ruling 2026-11-18, law 3) ──
  // An ed25519 key: the vault's entry `hub-identity` once the vault is set up (unlocked: read, or minted INTO it; LOCKED ⇒
  // vault_locked by name); before that the 0600 file data/agentd/hub-identity.pem (temp + rename), sealed into the vault at
  // its first read once one exists. A key that is GONE while a paired machine pins this hub (`anyHubPin`) is NEVER minted
  // anew in silence (every such machine would then refuse it): `hub_identity_lost`, by name, until the person's act
  // (renewIdentity) — after which each machine pairs again. Its bytes are never logged, sent or shown.
  // a LAWFUL vault name (the engine's SECRET_RE): the `host:` family is the device links' own — `host:hub-identity` can be no
  // machine's id (those are host-<hex> / dial-<device>)
  const IDENTITY_ENTRY = 'host:hub-identity';
  // r4982: the memory of a first mint that could not land is the MODULE's (MINT_FAILED), by this key file — every hello would otherwise pay
  // the key file's sync (and its folder's) on the hub's loop at the reconnect cadence
  // the vault's road is keyed by the vault's EPOCH (it moves at every lock and every unlock): the person's unlock tries the vault's mint once more
  const vaultEpoch = () => { try { const v = SB.vaultForDir(dataDir); return v && typeof v.epoch === 'function' ? v.epoch() : 0; } catch { return 0; } };
  const mintKey = (st) => (st === 'not_set_up' ? 'file:' : `vault@${vaultEpoch()}:`) + path.resolve(identityFile());   // its read's should: the VAULT's mint is remembered too
  /** B-574d (lane nl-paired, the early round's should): a linked name on disk too — its folder synced, BEST EFFORT (not every platform
   *  opens or syncs a folder); the descriptor closed once through the tree's one close and forgotten in that statement */
  function syncFolderOf(file) {
    let d = null;
    try { d = fs.openSync(path.dirname(file), 'r'); fs.fsyncSync(d); } catch (e) { void e; /* best effort: the key's bytes are already on disk */ }
    if (d !== null) d = FC.closeWritten(d, "this hub key's folder", null);
  }
  const identityFile = () => path.join(agentdDir, 'hub-identity.pem');
  const identityLocked = () => Object.assign(new Error('the vault is locked — this hub\'s own key opens after the owner unlocks the vault (no machine link until then)'), { code: 'vault_locked' });
  /** the hold's rungs: 30 s doubling to 5 min (store-read's ladder) */
  const rungMs = (tries) => Math.min(30000 * 2 ** (tries - 1), 300000);
  /** r5047: a refused read of the key file (or its adopt into the vault — `what`) → the held error (said once; its next rung armed) */
  function keyUnreadable(e, what = 'could not be read') {
    const k = path.resolve(identityFile()), h = READ_HELD.get(k), cause = String((e && (e.code || e.name)) || 'unreadable').slice(0, 40), tries = h ? h.tries + 1 : 1;
    const err = Object.assign(new Error(`this hub's own key file ${what} (${cause}) — nothing is made or written over it; check the file's owner, its permissions and the storage it is on; it is read again at the next greeting after its wait`), { code: 'hub_identity_unreadable', cause });
    READ_HELD.set(k, { error: err, tries, nextAt: Date.now() + rungMs(tries) });
    if (!h) log.warn?.(`[hub-key] ${err.message}`);
    return err;
  }
  /** r5047: a «no such file» right after a held read is read ONCE more at the next rung (a storage coming back answers ENOENT first —
   *  the family's rule) → true when it re-armed the hold (the caller throws the held error) */
  function onceMore(k, h) {
    if (!h || h.missingOnce) return false;
    READ_HELD.set(k, { ...h, missingOnce: true, nextAt: Date.now() + rungMs(h.tries) });
    return true;
  }
  /** r5047: THE KEY FILE's READ before the vault — only «no such file» is no file (null); any other refusal is HELD (keyUnreadable). A
   *  «no such file» right after a held read is read ONCE more at the next rung (a storage coming back answers ENOENT first — the family's rule) */
  function readKeyFile() {
    const k = path.resolve(identityFile()), h = READ_HELD.get(k);
    if (h && Date.now() < h.nextAt) throw h.error;   // HELD: no read until its next rung
    try { const t = fs.readFileSync(identityFile(), 'utf8'); READ_HELD.delete(k); return t; }
    catch (e) {
      if (e && e.code === 'ENOENT') {
        if (onceMore(k, h)) throw h.error;
        READ_HELD.delete(k); return null;
      }
      throw keyUnreadable(e);
    }
  }
  /** r5047 (its read's must): is there a key file left from before the vault? — only «no such file» is none; any other refusal of the look is HELD */
  function keyFileThere() {
    const k = path.resolve(identityFile()), h = READ_HELD.get(k);
    try { fs.lstatSync(identityFile()); return true; }
    catch (e) { if (e && e.code === 'ENOENT') { if (onceMore(k, h)) throw h.error; READ_HELD.delete(k); return false; } throw keyUnreadable(e); }
  }
  function readIdentity() {
    const st = stateOf();
    if (st === 'not_set_up') return readKeyFile();
    const v = SB.vaultForDir(dataDir);
    if (st !== 'unlocked' || !v) throw identityLocked();
    let r = v.secretGet(IDENTITY_ENTRY), adopted = false;
    if (r.ok && !r.value) {
      const held = READ_HELD.get(path.resolve(identityFile()));
      if (held && Date.now() < held.nextAt) throw held.error;   // r5047: a key file whose read was refused — no look, no adopt until its next rung
      if (keyFileThere()) { r = v.secretAdopt(IDENTITY_ENTRY, identityFile()); adopted = true; }
    }
    if (!r.ok && adopted && /^key-unreadable:/.test(String(r.code)) && r.code !== 'key-unreadable:vault_locked') throw keyUnreadable({ code: String(r.code).slice('key-unreadable:'.length) }, 'could not be taken into the vault');   // r5047: the adopt refused (its read, or its record's write) — HELD as the door's
    if (r.ok && adopted && !r.value) { const kk = path.resolve(identityFile()), hh = READ_HELD.get(kk); if (onceMore(kk, hh)) throw hh.error; }   // the name gone inside the adopt: once more after a held read
    if (r.ok && adopted) READ_HELD.delete(path.resolve(identityFile()));
    if (!r.ok && adopted && r.code === 'key-malformed') return null;   // r4982's read: an EMPTY key file left from before the vault is no key — the vault mints one, once (its entry answers from then on)
    if (!r.ok) { if (r.code === KF.VAULT_LOCKED) throw identityLocked(); throw Object.assign(new Error(`this hub's own key could not be read from the vault (${r.code})`), { code: r.code }); }
    if (!r.value) return null;
    const pem = r.value.toString('utf8'); r.value.fill(0); return pem;
  }
  /** `replace` = the person's renew (overwrite); a FIRST mint publishes exclusively (link, never over an existing key: two hub
   *  processes on a first boot never pin two different keys) → the key that is on disk now.
   *  B-574d (lane nl-paired, 主开发 r4752): THE KEY'S BYTES ARE ON DISK BEFORE ITS NAME. Before, both roads wrote an unsynced temp: a
   *  power loss after the rename (or the link) could leave the name on an empty key — read as no key, so with a machine pinning this
   *  hub every link refused `hub_identity_lost` until each machine paired again. The renew is the SECRET FAMILY's replace
   *  (src/secret-file.js replaceShredding: the temp synced, renamed, its folder synced, the RETIRED key's bytes overwritten in place;
   *  never through a link); the first mint's temp is written through the tree's one synced replace (src/fd-close.js renameSynced, into
   *  the temp's own name) BEFORE it is linked in. Both stay synchronous: a person's act or the first pairing, read back at once. A sync
   *  or close that FAILS is a failed write thrown to the caller (the old key stands, the temp removed); a first mint's failure is said ONCE
   *  and remembered for the life of the process (r4982: no hello and no read tries it again; its callers go on without a key), and a
   *  failed renew answers that this hub's key was not changed. A key file that is NO KEY (empty, or bytes that are no key) with no machine
   *  pinning it is healed by ONE mint (r4982); before the vault is set up through the door, after it into the vault. ONLY a file system that does no sync at all (src/fd-close.js SYNC_UNSUPPORTED) lands,
   *  said: the first mint through the door; the renew, which the secret family's replace refuses there, through the door too (the renew
   *  is the ONE way out of hub_identity_lost — it must land; there the retired key's bytes are not overwritten, as at the release).
   *  The first mint's NAME (its link) is synced too: its folder, best effort, as the secret family's replace syncs its own (the early
   *  round's should, 主开发 r4797) — a folder that cannot be opened or synced is no failed write: the key's bytes are already on disk. */
  function writeIdentity(pem, { replace = false } = {}) {
    const st = stateOf();
    if (st === 'not_set_up') {
      ensureDir(); const f = identityFile(), tmp = f + '.' + process.pid + '.tmp';
      const say = (l) => log.warn?.(`[hub-key] ${l}`);
      if (replace) {
        try { replaceShredding(f, pem); } catch (e) { if (!FC.SYNC_UNSUPPORTED.has(e && e.code)) throw e; FC.renameSynced(tmp, f, pem, { mode: 0o600, where: "this hub's key (its renew)", say }); }
        return pem;
      }
      const prior = MINT_FAILED.get(mintKey(st)); if (prior) throw prior;   // r4982: never tried again in this process
      try {
        FC.renameSynced(tmp + '.w', tmp, pem, { mode: 0o600, where: "this hub's key (its first mint)", say });
        let linked = false;
        try { fs.linkSync(tmp, f); linked = true; } catch (e) { if (!e || e.code !== 'EEXIST') { try { fs.unlinkSync(tmp); } catch { } throw e; } }
        try { fs.unlinkSync(tmp); } catch { }
        if (linked) { syncFolderOf(f); return pem; }
        let onDisk; try { onDisk = fs.readFileSync(f, 'utf8'); } catch (e) { if (!e || e.code !== 'ENOENT') throw keyUnreadable(e); onDisk = ''; }   // r5047: a refused read is HELD as a read — never taken for an empty file (no heal over it); a name gone since the link is no file
        if (usable(onDisk)) return onDisk;   // another hub process's key (two on one first boot): the one on disk is kept
        // r4982: A KEY FILE THAT IS NO KEY — empty, or bytes that are no key (zero bytes, NULs, a cut PEM) — and, identity() counted the pins
        // first, no machine pins it: HEALED by ONE mint through the SECRET FAMILY's replace (its read's should: a cut PEM can hold a private
        // key's bytes — the retired inode is overwritten; the temp synced, renamed, its folder synced); on a file system with no sync at all
        // through the door, said; said once. KNOWN LIMIT: two hub processes healing the same file at once — the last rename wins
        try { replaceShredding(f, pem); } catch (e2) { if (!FC.SYNC_UNSUPPORTED.has(e2 && e2.code)) throw e2; FC.renameSynced(tmp, f, pem, { mode: 0o600, where: "this hub's key (a key file that is no key, healed)", say }); }
        say('this hub\'s own key file was empty or not a key and no machine pins it — a new key was written over it once');
        return pem;
      } catch (e) {
        if (e && e.code === 'hub_identity_unreadable') throw e;   // a refused READ is held as a read (its own words), never remembered as a failed write
        const k = mintKey(st);
        if (!MINT_FAILED.has(k)) { MINT_FAILED.set(k, e); say(`this hub's own key could not be written (${(e && e.code) || 'error'}) — no machine can pin it until it is; it is not tried again until the hub starts again`); }
        throw e;
      }
    }
    const v = SB.vaultForDir(dataDir);
    if (st !== 'unlocked' || !v) throw identityLocked();
    // its read's should: THE VAULT's FIRST MINT that cannot land is remembered as the door's is — said once, never tried again by a hello
    // (each try would rewrite the vault's record); the renew and a locked vault are not remembered
    const vk = mintKey(st);
    if (!replace) { const prior = MINT_FAILED.get(vk); if (prior) throw prior; }
    const put = v.secretPut(IDENTITY_ENTRY, pem);
    if (!put.ok) {
      if (put.code === KF.VAULT_LOCKED) throw identityLocked();
      const e = Object.assign(new Error(`this hub's own key could not be sealed into the vault (${put.code})`), { code: put.code });
      if (!replace && !MINT_FAILED.has(vk)) { for (const old of [...MINT_FAILED.keys()]) if (old !== vk && old.startsWith('vault@') && old.endsWith(':' + path.resolve(identityFile()))) MINT_FAILED.delete(old); MINT_FAILED.set(vk, e); log.warn?.(`[hub-key] this hub's own key could not be sealed into the vault (${put.code}) — no machine can pin it until it is; it is not tried again until the vault is locked and unlocked, or the hub starts again`); }
      throw e;
    }
    return pem;
  }
  const asIdentity = (pem) => ({ privateKeyPem: pem, publicKey: require('../mutual-auth.js').publicKeyOf(pem, { crypto: require('crypto') }) });
  /** r4982 (its read): a key file's text → its identity, or null when it is NO KEY — empty, or bytes that do not parse as this hub's key */
  const usable = (pem) => { if (typeof pem !== 'string' || !pem.trim()) return null; try { const id = asIdentity(pem); return require('../mutual-auth.js').isPub(id.publicKey) ? id : null; } catch { return null; } };
  /** → { privateKeyPem, publicKey } — throws vault_locked / hub_identity_lost by name */
  function identity() {
    const st = MINT_FAILED.size ? stateOf() : null, failed = st && st !== 'locked' ? MINT_FAILED.get(mintKey(st)) : null;   // (its own look only while a failure is remembered)
    if (failed) throw failed;   // r4982: a first mint that could not land — no read, no write again
    const id = usable(readIdentity());
    if (id) return id;   // r4982: a key file that is NO KEY (empty, or not a key) is no key — with a pin: lost, by name; with none: healed once
    // every pin that exists is counted (must B): `anyHubPin` answers the pinning machines' names (or a boolean, for an older caller)
    let pins = []; try { const v = anyHubPin(); pins = Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : v ? [''] : []; } catch { pins = ['']; }
    if (pins.length) {
      const named = pins.filter(Boolean), list = named.length ? 'these machines: ' + named.join(', ') : 'every machine that pinned it';
      throw Object.assign(new Error(`this hub lost its own key while ${named.length ? 'these machines pin it: ' + named.join(', ') : 'a paired machine pins it'} — it is never made again in silence. Make a new hub key (Remote → a machine → Host key… → Make a new hub key), then re-pair ${named.length ? 'them' : list} (an ssh machine is cleared over ssh by that act; a dialed one runs its pairing command)`), { code: 'hub_identity_lost', machines: named });
    }
    const fresh = require('../mutual-auth.js').generateKeyPair({ crypto: require('crypto') }).privateKeyPem;
    const kept = writeIdentity(fresh);
    if (kept === fresh) log.log?.('[hub-key] this hub minted its own key (the machines pin it at their next hello)');
    return asIdentity(kept);
  }
  /** THE SIGNING DOOR'S ONE ACT (laws 1 + 2): this hub's signature over THE ONE SHAPE for `record` — only when `devPub` is the
   *  device key that record pins (a conversation of machine A gets nothing for machine B), the nonce re-judged; the message is
   *  built here, never handed in. → { sigH } | throws not_this_machine / bad_request / vault_locked / hub_identity_lost */
  function signForMachine(record, devPub, nonceD) {
    const MA = require('../mutual-auth.js');
    if (!record || !record.deviceKey || typeof devPub !== 'string' || record.deviceKey.pub !== devPub) throw Object.assign(new Error('that device key is not the one this conversation\'s machine pins — the hub signs only for its own conversation\'s machine'), { code: 'not_this_machine' });
    const sigH = MA.hubProof(identity(), devPub, nonceD, { crypto: require('crypto') });
    if (!sigH) throw Object.assign(new Error('no device nonce to sign'), { code: 'bad_request' });
    return { sigH };
  }
  /** THE PERSON'S ACT (law 3): a new hub key — every machine that pinned the old one refuses this hub until it pairs again. */
  function renewIdentity() {
    const fresh = require('../mutual-auth.js').generateKeyPair({ crypto: require('crypto') }).privateKeyPem;
    // r4982: a renew that cannot land answers that THIS HUB'S KEY WAS NOT CHANGED (the old one, or its loss, stands as it was: the temp is
    // removed before any rename) — by its code, the page's own words (src/lib/sidebar-mounts.js); a locked vault keeps its own refusal
    try { writeIdentity(fresh, { replace: true }); }
    catch (e) { if (e && e.code === 'vault_locked') throw e; throw Object.assign(new Error(`a new hub key could not be written (${(e && e.code) || 'error'}) — this hub's key was not changed; the renew can be tried again`), { code: 'hub_key_renew_failed', cause: (e && e.code) || null }); }
    MINT_FAILED.delete(mintKey('not_set_up')); MINT_FAILED.delete(mintKey('unlocked')); READ_HELD.delete(path.resolve(identityFile()));   // the person's new key landed: a remembered failed first mint (either road) ends with it
    log.log?.('[hub-key] a new hub key was made by the person — every machine pairs again');
    return asIdentity(fresh);
  }
  /** null when a token is readable now (or would be minted), else the refusal's words — the spawn's pre-check */
  function lockedWhy(hostId) { return stateOf() === 'locked' ? lockedError(hostId).message : null; }
  /** An unpaired machine: its file (if any) and its entry, gone. */
  function drop(hostId) {
    const h = holds.get(hostId); if (h) { h.stop(); holds.delete(hostId); } renewing.delete(hostId);   // B-f276 (r4721): an unpaired machine's hold ends with it
    shredCopies((n) => n.startsWith(`host-${hostId}.token.corrupt-`)).catch(() => 0);   // (r4721's round) and its torn token's copies, overwritten before the unlink
    try { fs.unlinkSync(fileOf(hostId)); } catch { }
    const v = SB.vaultForDir(dataDir);
    if (v && v.state() !== 'not_set_up') { const r = v.secretDrop(entryOf(hostId)); if (!r.ok) log.warn?.(`[vault] the link token of ${hostId} was not dropped (${r.code})`); }
  }
  /** THE OPEN SWEEP (after a setup and every unlock): every host-<id>.token file left beside the data sealed into the
   *  vault, then shredded. → the ids sealed now. */
  function adoptAll() {
    const v = SB.vaultForDir(dataDir);
    if (!v || v.state() !== 'unlocked') return [];
    let names = [];
    try { names = fs.readdirSync(agentdDir); } catch { return []; }
    const out = [];
    for (const n of names) {
      const m = FILE_RE.exec(n);
      if (!m) continue;
      const r = v.secretAdopt(entryOf(m[1]), path.join(agentdDir, n));
      if (r.ok && r.value) { r.value.fill(0); if (!fs.existsSync(path.join(agentdDir, n))) out.push(m[1]); }
    }
    if (out.length) log.log?.(`[vault] ${out.length} device link token file(s) sealed into the vault`);
    shredCopies(() => true).catch(() => 0);   // B-f276 (r4721's round): a torn token's copy is no token beside the vault — overwritten, then unlinked
    return out;
  }
  /** 主开发 r5353 — THE VAULT's LAW: no plain copy of a sign-in outlives the moment its live file is removed. A renewal's write still in
   *  flight when its machine is unpaired LANDS after the unpair removed the rest: that file is SHREDDED (off the loop) — when it still
   *  holds that renewal's token (a pairing made since keeps its own). Said once, by the machine's name, never the token. */
  async function shredLanded(hostId, f, tok) {
    let now = null;
    try { now = String(await fs.promises.readFile(f, 'utf8')).trim(); } catch { return false; }
    if (now !== tok) return false;
    const gone = await shredFile(f).catch(() => false);
    log.warn?.(`[host-tokens] the new link token of ${machineOf(hostId)} landed after its unpair — ${gone ? 'shredded' : 'it could not be shredded'}`);
    return gone;
  }
  /** the torn tokens' copies in data/agentd (the helper's `.corrupt-` names) that `which(name)` picks — SHREDDED off the loop (their bytes
   *  overwritten before the unlink: secret material); said once as a count, never a name's value */
  async function shredCopies(which) {   // the folder listed OFF the loop (nothing synchronous added on the hub's loop)
    let names = [];
    try { names = (await fs.promises.readdir(agentdDir)).filter((n) => COPY_RE.test(n) && which(n)); } catch { names = []; }
    if (!names.length) return 0;
    const r = await Promise.all(names.map((n) => shredFile(path.join(agentdDir, n)).catch(() => false)));
    const n = r.filter(Boolean).length; if (n) log.log?.(`[vault] ${n} torn link token copie(s) shredded`); return n;
  }
  /** Every attach config an older build wrote carries the token: take it out (the attach child asks the hub now). → n. */
  function stripCopies() {
    let names = [];
    try { names = fs.readdirSync(agentdDir); } catch { return 0; }
    let n = 0;
    for (const f of names) {
      if (!CFG_RE.test(f)) continue;
      const file = path.join(agentdDir, f);
      let cfg;
      try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
      if (!cfg || typeof cfg !== 'object' || !('hostToken' in cfg)) continue;
      delete cfg.hostToken;
      try { replaceShredding(file, JSON.stringify(cfg)); n++; } catch (e) { log.warn?.(`[vault] ${f}: the link token copy could not be removed (${(e && e.code) || e})`); }
    }
    if (n) log.log?.(`[vault] the link token removed from ${n} attach config(s) — the attach asks the hub now`);
    return n;
  }
  return { tokenFor, lockedWhy, drop, adoptAll, stripCopies, stateOf, fileOf, entryOf, identity, renewIdentity, signForMachine };
}

module.exports = { create, lockedError, entryOf };
