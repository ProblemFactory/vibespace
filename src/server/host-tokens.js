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
 */
function create({ dataDir, agentdDir = path.join(dataDir, 'agentd'), mint = () => require('../pairing-token.js').mintToken('host'), log = console } = {}) {
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
  /** THE token of a machine (`host-<hex>` for an ssh machine, `dial-<deviceId>` for a dialed one) — throws `vault_locked`. */
  function tokenFor(hostId) {
    const v = SB.vaultForDir(dataDir);
    const st = stateOf();
    if (st === 'not_set_up') return legacy(hostId);
    if (st !== 'unlocked' || !v) throw lockedError(hostId);
    const name = entryOf(hostId);
    let r = v.secretGet(name);
    if (r.ok && !r.value && fs.existsSync(fileOf(hostId))) r = v.secretAdopt(name, fileOf(hostId));
    if (!r.ok) {
      if (r.code === KF.VAULT_LOCKED) throw lockedError(hostId);
      throw Object.assign(new Error(`the link token of ${hostId} could not be read from the vault (${r.code})`), { code: r.code });
    }
    if (r.value) { const t = r.value.toString('utf8'); r.value.fill(0); return t; }
    const tok = mint();
    const put = v.secretPut(name, tok);
    if (!put.ok) throw put.code === KF.VAULT_LOCKED ? lockedError(hostId) : Object.assign(new Error(`a link token for ${hostId} could not be sealed into the vault (${put.code})`), { code: put.code });
    return tok;
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
  return { tokenFor, lockedWhy, drop, adoptAll, stripCopies, stateOf, fileOf, entryOf };
}

module.exports = { create, lockedError, entryOf };
