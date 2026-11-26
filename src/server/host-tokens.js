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
  let mintFailSaid = false;   // B-574d (lane nl-paired): a first mint that could not be written, said once a run
  /** B-574d (lane nl-paired, the early round's should): a linked name on disk too — its folder synced, BEST EFFORT (not every platform
   *  opens or syncs a folder); the descriptor closed once through the tree's one close and forgotten in that statement */
  function syncFolderOf(file) {
    let d = null;
    try { d = fs.openSync(path.dirname(file), 'r'); fs.fsyncSync(d); } catch (e) { void e; /* best effort: the key's bytes are already on disk */ }
    if (d !== null) d = FC.closeWritten(d, "this hub key's folder", null);
  }
  const identityFile = () => path.join(agentdDir, 'hub-identity.pem');
  const identityLocked = () => Object.assign(new Error('the vault is locked — this hub\'s own key opens after the owner unlocks the vault (no machine link until then)'), { code: 'vault_locked' });
  function readIdentity() {
    const st = stateOf();
    if (st === 'not_set_up') { try { return fs.readFileSync(identityFile(), 'utf8'); } catch { return null; } }
    const v = SB.vaultForDir(dataDir);
    if (st !== 'unlocked' || !v) throw identityLocked();
    let r = v.secretGet(IDENTITY_ENTRY);
    if (r.ok && !r.value && fs.existsSync(identityFile())) r = v.secretAdopt(IDENTITY_ENTRY, identityFile());
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
   *  or close that FAILS is a failed write thrown to the caller (the old key stands, the temp removed), and a first mint's failure is said
   *  once a run (its callers go on without a key). ONLY a file system that does no sync at all (src/fd-close.js SYNC_UNSUPPORTED) lands,
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
      try { FC.renameSynced(tmp + '.w', tmp, pem, { mode: 0o600, where: "this hub's key (its first mint)", say }); }
      catch (e) { if (!mintFailSaid) { mintFailSaid = true; say(`this hub's own key could not be written (${(e && e.code) || 'error'}) — no machine can pin it until it is; it is tried again at the next link`); } throw e; }
      try { fs.linkSync(tmp, f); } catch (e) { if (!e || e.code !== 'EEXIST') { try { fs.unlinkSync(tmp); } catch { } throw e; } }
      try { fs.unlinkSync(tmp); } catch { }
      syncFolderOf(f);
      return fs.readFileSync(f, 'utf8');
    }
    const v = SB.vaultForDir(dataDir);
    if (st !== 'unlocked' || !v) throw identityLocked();
    const put = v.secretPut(IDENTITY_ENTRY, pem);
    if (!put.ok) throw put.code === KF.VAULT_LOCKED ? identityLocked() : Object.assign(new Error(`this hub's own key could not be sealed into the vault (${put.code})`), { code: put.code });
    return pem;
  }
  const asIdentity = (pem) => ({ privateKeyPem: pem, publicKey: require('../mutual-auth.js').publicKeyOf(pem, { crypto: require('crypto') }) });
  /** → { privateKeyPem, publicKey } — throws vault_locked / hub_identity_lost by name */
  function identity() {
    const pem = readIdentity();
    if (pem) return asIdentity(pem);
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
    writeIdentity(fresh, { replace: true });
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
