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
const { replaceShredding } = require('../secret-file.js');

const VB = require('../vault-blocked.js');   // PURE: who a refusal stopped (lane vault-locked-refusal-notice)
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
  /** the migration window (no vault set up): the 0600 file beside the data, read or minted — byte for byte the pre-vault code */
  function legacy(hostId) {
    ensureDir();
    const f = fileOf(hostId);
    try { return fs.readFileSync(f, 'utf-8').trim(); } catch { }
    const tok = mint();
    fs.writeFileSync(f, tok, { mode: 0o600 });
    return tok;
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
   *  processes on a first boot never pin two different keys) → the key that is on disk now */
  function writeIdentity(pem, { replace = false } = {}) {
    const st = stateOf();
    if (st === 'not_set_up') {
      ensureDir(); const f = identityFile(), tmp = f + '.' + process.pid + '.tmp';
      fs.writeFileSync(tmp, pem, { mode: 0o600 });
      if (replace) { fs.renameSync(tmp, f); return pem; }
      try { fs.linkSync(tmp, f); } catch (e) { if (!e || e.code !== 'EEXIST') { try { fs.unlinkSync(tmp); } catch { } throw e; } }
      try { fs.unlinkSync(tmp); } catch { }
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
    return out;
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
