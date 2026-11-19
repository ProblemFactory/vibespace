'use strict';
/**
 * A BROWSER PROXY'S LOGIN IN THE VAULT (B-8b87, lane cli-update-needs-nothing). ORCH. The ONE writer and the ONE reader of the
 * vault's `proxy-login:<scheme>://<host>:<port>#<user>` entries (src/vault-kinds.js row «proxy-login»; the name's PURE rules in
 * src/browser-profiles.js proxyLoginName / parseProxyLoginName). The entry seals the PASSWORD; the user name is in its name.
 *
 * THE USE LAW: no route, CLI verb or broadcast answers these bytes to anyone — `read` has ONE caller, the browser keeper's
 * forwarder (src/server/browser-keeper.js proxyUpstreamFor → src/server/egress-proxy.js upstream), and every reading is a USE
 * NOTED on the entry (`vault.noteUse`, door `browser-proxy`): its «last used» always, and an audit line when the launch that
 * read it was an agent's, a job's or an automation key's (src/vault-use.js BEARERS). `save` and `remove` are a person's acts
 * (the routes refuse every bearer — the person guard of src/routes/vault.js); the keeper's moveProxyPassword is the profile card's «Move the password to the
 * vault» (src/server/browser-keeper.js moveProxyPassword).
 */
const B = require('../browser-profiles.js');

const DOOR = 'browser-proxy';
const LOCKED = 'the vault is locked — the owner has already been told; a person unlocks it on this instance\'s page (Unlock…), then starts the browser again';   // the vault's locked read files the owner's unlock item (vault-engine secretGet → blocked) — so «already been told» is true
const str = (v) => String(v == null ? '' : v);

function create({ vault = null, log = console } = {}) {
  const named = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
  const vstate = () => { try { return vault && typeof vault.state === 'function' ? vault.state() : 'absent'; } catch { return 'absent'; } };
  // B-8b87 round 3: the vault's REAL state — locked (a person unlocks it) or never set up (a person sets it up: there is no second
  // password to ask for)
  const notOpen = (act, st = vstate()) => (st === 'locked'
    ? named('vault_locked', act === 'remove' ? 'the vault is locked — unlock it in the Vault window, then remove' : 'the vault is locked — unlock it in the Vault window, then save')
    : named('vault_not_set_up', act === 'remove' ? 'the vault is not set up yet — set it up in the Vault window, then remove' : 'the vault is not set up yet — set it up in the Vault window, then save'));
  /** The vault's proxy-login NAMES → [{ name, origin, user, at }] — never a value. */
  function names() {
    let list = [];
    try { list = vault && typeof vault.secretNames === 'function' ? vault.secretNames() || [] : []; } catch { list = []; }
    const out = [];
    for (const s of list) { const p = s && B.parseProxyLoginName(s.name); if (p) out.push({ name: s.name, origin: p.origin, user: p.user, at: Number(s.at) || null }); }
    return out;
  }
  /** A person's save: the proxy's address + its user name and password → the entry's name. Locked ⇒ refused, nothing written. */
  function save({ proxy, user, password } = {}) {
    const name = B.proxyLoginName(proxy, user);
    if (!name) return named('bad-request', 'a proxy login needs the proxy\'s address (http, https or socks5) and a user name without spaces or #');
    const pw = Buffer.isBuffer(password) ? password : Buffer.from(str(password), 'utf8');
    if (!pw.length) return named('bad-request', 'a proxy login needs its password');
    if (vstate() !== 'unlocked') return notOpen('save');
    let r;
    try { r = vault.secretPut(name, pw, { kind: 'proxy-login' }); } catch (e) { r = { ok: false, code: str(e && e.message) }; } finally { if (!Buffer.isBuffer(password)) { try { pw.fill(0); } catch { /* */ } } }
    if (!r || !r.ok) return /vault_not_set_up/.test(str(r && r.code)) ? notOpen('save', 'not_set_up') : /vault_locked/.test(str(r && r.code)) ? notOpen('save', 'locked') : named('not_written', str(r && r.code) || 'not written');
    log.log?.(`[browser-proxy] the vault keeps a proxy login: ${name}`);
    return { ok: true, name };
  }
  /** A person's removal of one entry. */
  function remove(name) {
    if (!B.parseProxyLoginName(name)) return named('bad-request', 'not a proxy login');
    if (vstate() !== 'unlocked') return notOpen('remove');
    let r;
    try { r = vault.secretDrop(name); } catch (e) { r = { ok: false, code: str(e && e.message) }; }
    return r && r.ok !== false ? { ok: true } : named('not_removed', str(r && r.code) || 'not removed');
  }
  /**
   * THE ONE READER — the keeper's forwarder at a launch (or at the boot that adopts its browser). → { ok: true, user, pass } |
   * { ok: false, code, word, error }: `proxy_credential_unreadable` with the vault's own word (`key-unreadable:vault_locked`,
   * `vault_not_set_up`, `proxy_login_no_entry` for a name the vault holds nothing under). The use is noted either way.
   */
  function read(name, { by = 'system', conv = null, actor = null, purpose = '' } = {}) {
    const p = B.parseProxyLoginName(name);
    if (!p) return named('proxy_credential_unreadable', 'not a proxy login', { word: 'bad-name' });
    const note = (outcome) => { try { vault && typeof vault.noteUse === 'function' && vault.noteUse(name, { by, door: DOOR, conv }, { outcome, purpose: str(purpose).slice(0, 200) || `the proxy of a browser profile (${p.origin})`, actor }); } catch (e) { log.warn?.(`[browser-proxy] the use was not noted — ${e && e.message}`); } };
    let g;
    try { g = vault ? vault.secretGet(name) : { ok: false, code: 'vault_not_set_up' }; } catch (e) { g = { ok: false, code: str(e && e.message) || 'unreadable' }; }
    if (!g || !g.ok) {
      const word = str(g && g.code) || 'unreadable';
      note(/vault_locked/.test(word) ? 'vault_locked' : word === 'vault_not_set_up' ? 'vault_not_set_up' : 'error');
      return named('proxy_credential_unreadable', /vault_locked|vault_not_set_up/.test(word) ? LOCKED : `the vault could not open ${name} (${word})`, { word });
    }
    if (!g.value) { note('error'); return named('proxy_credential_unreadable', `the vault holds no login named ${name} — choose the proxy's login again in the profile`, { word: 'proxy_login_no_entry' }); }
    let pass;
    try { pass = g.value.toString('utf8'); } finally { try { g.value.fill(0); } catch { /* */ } }
    note('ok');
    return { ok: true, user: p.user, pass };
  }
  return { names, save, remove, read, DOOR, LOCKED };
}

module.exports = { create, DOOR, LOCKED };
