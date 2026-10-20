'use strict';
// THE VAULT'S DOORS (lane vault-e2e-password — docs/kb-api.md «Vault»). A PERSON sets the second password up, unlocks,
// changes it, sets the idle lock — from this instance's own page, behind its sign-in; an agent may read the state and LOCK
// (`vibespace-vault status|lock`), never unlock. Every password arrives in a request body and goes straight to the engine
// (src/server/vault-engine.js) — it is never logged, echoed, or kept on the request. The engine paces wrong passwords
// (5 ⇒ the next minute refused, `paced`) and audits every failure with the caller's address. TWO-STEP CODES (design q-047
// L1, lane vault-totp — src/server/vault-totp.js): a person adds, views the code of, deletes and grants an entry; an agent
// gets a granted entry's CURRENT CODE (never the seed) — a seed arrives in a request body and is taken off it like a password.
const { ownOriginOf, pageVerdict } = require('../write-origin.js');   // THE origin rule (its strict form: a person on this page)
const { sameToken } = require('../pairing-token.js');
const VB = require('../vault-blocked.js');   // PURE: THE words toward an agent on a LOCKED refusal (lane vault-locked-refusal-notice)
const { runOfToken } = require('../server/vault-totp.js');

const STATUS = Object.freeze({
  wrong_password: 403, corrupt: 500, paced: 429, vault_not_set_up: 409, already_set_up: 409, busy: 409, migration_failed: 500,
  password_too_short: 400, password_too_long: 400, password_not_text: 400, same_as_sign_in: 400, same_password: 400, bad_hours: 400,
  human_only: 403, cross_site: 403, unauthorized: 401, vault_locked: 423, no_link: 404,
  reveal_needs_password: 403, not_found: 404, unreadable: 500, // lane vault-contents-window
  not_revealable: 403, // int317: a machine's link token / a sealed file's key — never shown
  // design q-047 L1 (lane vault-totp): the two-step doors
  exists: 409, bad_seed: 400, seed_too_short: 400, bad_uri: 400, hotp_unsupported: 400, bad_digits: 400, bad_period: 400, bad_algorithm: 400, bad_text: 400, bad_name: 400,
  bad_args: 400, not_granted: 403, not_running: 409, failed: 500,
});
const WORDS = Object.freeze({
  wrong_password: 'that is not the second password',
  corrupt: 'the vault record (data/vault.json) is damaged — nothing can be opened; restore it from a backup',
  paced: 'too many wrong passwords — wait a minute, then try again',
  vault_not_set_up: 'the vault is not set up yet — set the second password first',
  already_set_up: 'the vault is already set up',
  busy: 'the vault is being set up — try again in a moment',
  migration_failed: 'the key files could not be moved into the vault — nothing changed',
  password_too_short: 'the second password needs at least 8 characters',
  password_too_long: 'the second password is too long',
  password_not_text: 'type the second password',
  same_as_sign_in: 'the second password must not be the sign-in password',
  same_password: 'the new second password is the old one',
  bad_hours: 'the idle lock is a whole number of hours (0 = never)',
  human_only: 'only a person unlocks, sets up or changes the vault — an agent may read its state and lock it',
  cross_site: 'the vault answers this instance\'s own page only',
  vault_locked: VB.agentWords('a person unlocks it on this instance\'s page'),   // lane vault-locked-refusal-notice: the owner was told — the agent never asks
  no_link: 'this session runs on no paired machine — it has no link token',
  reveal_needs_password: 'enter the second password again to see stored values (they stay visible for 5 minutes)',
  not_found: 'that stored value is not there any more',
  unreadable: 'that stored value could not be opened',
  not_revealable: 'that stored value is never shown — VibeSpace uses it itself (a machine\'s link token runs commands on that machine)',
  exists: 'a two-step code of that name is in the vault already — delete it first, or pick another name',
  bad_seed: 'that is not a two-step seed (base32: the letters A–Z and the digits 2–7)',
  seed_too_short: 'that seed is too short to be a two-step seed',
  bad_uri: 'that is not an otpauth://totp/ link',
  hotp_unsupported: 'a counter-based (HOTP) code is not supported — only time-based two-step codes',
  bad_digits: 'a two-step code is 6 to 8 digits',
  bad_period: 'a two-step code changes every 15 to 120 seconds',
  bad_algorithm: 'the algorithm is SHA1, SHA256 or SHA512',
  bad_text: 'the issuer or the account is too long or holds a control character',
  bad_name: 'a name is 1–120 letters, digits, ".", "_" or "-"',
  bad_args: 'name a running conversation or a task group',
  not_granted: 'this conversation may not use that two-step code — the owner grants it in the Vault window (用于…); never ask for the seed',
  not_running: 'that conversation is not running — a code is granted to a running conversation',
  failed: 'the two-step door failed — nothing changed',
});
const isAnyBearer = (req) => /^Bearer\s+\S/i.test(String((req.headers && req.headers.authorization) || '')) || typeof (req.body && req.body.token) === 'string';
const ipOf = (req) => String(req.ip || (req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, '') || null;

/** A PERSON on THIS instance's own page — no agent token, and a browser that says it is on this page: the auth middleware
 *  lets a browser-less write through (no Origin and no Sec-Fetch-Site: a local `curl` on an instance nobody signs in to);
 *  the vault's doors are the page's only. → { ok } | { ok: false, code: 'human_only' | 'cross_site' }. */
function personVerdict(req) {
  if (isAnyBearer(req)) return { ok: false, code: 'human_only' };
  const v = pageVerdict(req.headers || {}, ownOriginOf(req.headers || {}, { encrypted: !!(req.socket && req.socket.encrypted) }));
  return v.ok ? { ok: true } : { ok: false, code: 'cross_site' };
}

function registerVaultRoutes(app, { vault, activeSessions = new Map(), getJobs = () => null, contents = null, who = () => null, linkTokenFor = null, onVaultWait = () => {}, auditLink = () => {},
  totp = null, callerOf = () => null, runOf = () => null, grantLive = () => true, subjects = () => ({ sessions: [], groups: [] }) }) {
  const answer = (res, r) => {
    if (r && r.ok) return res.json({ ...r, ...vault.facts() });
    const code = (r && r.code) || 'error';
    res.status(STATUS[code] || 400).json({ ...vault.facts(), ...r, ok: false, code, error: WORDS[code] || code });
  };
  /** The request's password field(s), taken OFF the request (no later reader sees them). */
  const take = (req, ...names) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const out = names.map((n) => b[n]);
    for (const n of names) delete b[n];
    return out;
  };
  const person = (fn) => async (req, res) => {
    const v = personVerdict(req);
    if (!v.ok) { take(req, 'password', 'old', 'new', 'seed', 'uri'); return answer(res, v); }
    try { answer(res, await fn(req)); } catch (e) { take(req, 'password', 'old', 'new', 'seed', 'uri'); res.status(500).json({ ok: false, code: 'error', error: 'the vault door failed — nothing changed' }); }
  };
  /** An AGENT (vsst_ session / jbt_ job token) — it may read the state and lock, nothing else. */
  const agentOk = (req) => {
    const token = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
    if (token.startsWith('jbt_')) { const jm = getJobs && getJobs(); return !!(jm && jm.ready !== false && typeof jm.jobByToken === 'function' && jm.jobByToken(token)); }
    if (!token.startsWith('vsst_')) return false;
    for (const s of activeSessions.values()) if (s && sameToken(token, s.agentToken)) return true;
    return false;
  };
  const agentFacts = () => { const f = vault.facts(); return { state: f.state, setUpAt: f.setUpAt, lockedSince: f.lockedSince, keys: f.keys }; };

  // ── people ──
  app.get('/api/vault/state', (req, res) => res.json(vault.facts()));
  app.post('/api/vault/setup', person((req) => { const [pw] = take(req, 'password'); return vault.setup(pw, { ip: ipOf(req) }); }));
  app.post('/api/vault/unlock', person((req) => { const [pw] = take(req, 'password'); return vault.unlock(pw, { ip: ipOf(req) }); }));
  app.post('/api/vault/change', person((req) => { const [o, n] = take(req, 'old', 'new'); return vault.change(o, n, { ip: ipOf(req) }); }));
  app.post('/api/vault/lock', person((req) => vault.lock('door', { ip: ipOf(req) })));
  app.post('/api/vault/idle', person((req) => vault.setIdleLock(req.body && req.body.hours)));
  app.post('/api/vault/active', person(() => { vault.touch(); return { ok: true }; }));   // a person's keyboard / pointer on a page (the idle lock's clock)
  // ── THE VAULT'S CONTENTS (lane vault-contents-window — src/server/vault-contents.js): PEOPLE ONLY, every one (an agent
  // token ⇒ human_only; another site ⇒ cross_site). The list is masked; a value is ONE per reveal, inside the 5-minute
  // window the second password opened for THIS PAGE of this sign-in (`who` = the sign-in cookie's handle, never the
  // cookie; `page` = the secret reveal-session answered, which the page sends back — in the body, or X-Vault-Page) ──
  if (contents) {
    const whoOf = (req) => { try { return who(req) || 'sign-in-off'; } catch { return 'sign-in-off'; } };
    app.get('/api/vault/contents', person((req) => ({ ...contents.list(), reveal: contents.windowFacts(whoOf(req), pageHeader(req)) })));
    app.post('/api/vault/reveal-session', person((req) => { const [pw] = take(req, 'password'); return contents.startReveal(whoOf(req), pw, { ip: ipOf(req) }); }));
    app.post('/api/vault/reveal', person((req) => { const [page] = take(req, 'page'); return contents.reveal(whoOf(req), page, req.body && req.body.id, { ip: ipOf(req) }); }));
    app.post('/api/vault/reveal-end', person((req) => { const [page] = take(req, 'page'); return contents.endReveal(whoOf(req), page); }));
  }
  // ── TWO-STEP CODES (design q-047 L1, lane vault-totp — src/server/vault-totp.js over PURE src/totp.js). PEOPLE: the list
  //    (names + grants), 添加 (an otpauth:// link or the seed — taken off the body; `preview` = the code it makes, nothing
  //    stored), 看码 (the CURRENT code — no 「验证是你」, audited, paced), 删除, 用于… (grant / take back). The seed itself
  //    shows only through /api/vault/reveal (the window above). Never cached by a proxy. ──
  if (totp) {
    const whoT = (req) => { try { return who(req) || 'sign-in-off'; } catch { return 'sign-in-off'; } };
    const noStore = (fn) => (req, res) => { res.set('Cache-Control', 'no-store'); return fn(req, res); };
    const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
    app.get('/api/vault/totp', noStore(person(() => ({ ...totp.list({ live: grantLive }), subjects: subjects() }))));
    app.post('/api/vault/totp', noStore(person((req) => {
      const [uri, seed] = take(req, 'uri', 'seed');
      const b = body(req);
      return totp.addEntry({ uri, seed, name: b.name, issuer: b.issuer, account: b.account, digits: b.digits, period: b.period, algorithm: b.algorithm }, { who: whoT(req), ip: ipOf(req), preview: b.preview === true });
    })));
    app.get('/api/vault/totp/:name', noStore(person((req) => totp.view(whoT(req), req.params.name, { ip: ipOf(req) }))));
    app.delete('/api/vault/totp/:name', noStore(person((req) => totp.drop(req.params.name, { who: whoT(req), ip: ipOf(req) }))));
    app.post('/api/vault/totp/:name/grants', noStore(person((req) => totp.grant(req.params.name, body(req).subjects, { who: whoT(req), ip: ipOf(req), by: `user:${whoT(req).slice(0, 24)}`, runOf }))));
    app.delete('/api/vault/totp/grants/:id', noStore(person((req) => totp.ungrant(req.params.id, { who: whoT(req), ip: ipOf(req) }))));
    // AGENTS: a granted entry's CURRENT code + the seconds left — never the seed, never a setting. The caller = the vsst_'s
    // conversation (its run = the token's digest); a job token, an unknown token ⇒ 401; every answer audited (vault-totp-use)
    app.get('/api/agent/vault/totp/:name', (req, res) => {
      res.set('Cache-Control', 'no-store');
      const token = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
      let caller = null;
      try { caller = token.startsWith('vsst_') ? callerOf(token) : null; } catch { caller = null; }
      if (!caller) return answer(res, { ok: false, code: 'unauthorized' });
      const r = totp.use({ conversationId: caller.conversationId, groups: caller.groups, live: caller.live, run: runOfToken(token) }, req.params.name, { ip: ipOf(req) });
      return r.ok ? res.json({ ok: true, name: r.name, code: r.code, secondsLeft: r.secondsLeft, period: r.period }) : answer(res, r);
    });
  }
  // ── agents: the state and the lock — never unlock ──
  app.get('/api/agent/vault/state', (req, res) => (agentOk(req) ? res.json(agentFacts()) : answer(res, { ok: false, code: 'unauthorized' })));
  app.post('/api/agent/vault/lock', (req, res) => {
    if (!agentOk(req)) return answer(res, { ok: false, code: 'unauthorized' });
    const r = vault.lock('agent', { ip: ipOf(req) });
    return r.ok ? res.json({ ...r, ...agentFacts() }) : answer(res, r);
  });
  // ── THE LINK TOKEN (lane vault-e2e-password-fix-r2) — THE ONE ROAD a device token reaches a session: a remote session's
  //    attach child (src/agentd/attach-cli.js) asks here at every (re)start, its own session token naming the session, and
  //    holds the answer in memory; no attach config, argv or env carries it. A local session, a job token, an unknown
  //    token ⇒ refused; LOCKED ⇒ 423 `vault_locked` (the attach says so and its wrapper retries until a person unlocks).
  //    Never logged, never cached by a proxy. ──
  app.get('/api/agent/vault/link-token', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const token = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
    let s = null, sid = null;
    if (token.startsWith('vsst_')) for (const [k, x] of activeSessions) if (x && sameToken(token, x.agentToken)) { s = x; sid = k; break; }
    const hostKey = s ? (s._dialDeviceId ? 'dial-' + s._dialDeviceId : s.host) : null;
    // RED-3 (int317): ONE audit row per answer (the session + host key, the status; never the token); a repeat 423 is not
    const answerLink = (status, body, { again = false } = {}) => { if (!again) { try { auditLink({ sid, hostKey, status }); } catch { } } return res.status(status).json(body); };
    if (!s || typeof linkTokenFor !== 'function') return answerLink(401, { ok: false, code: 'unauthorized' });
    if (!s._agentdSession || !hostKey) return answerLink(STATUS.no_link, { ok: false, code: 'no_link', error: WORDS.no_link });
    // verify RED-2: a 423 makes the session WAIT (its attach parks, the wrapper never gives up) — the session row says
    // 「等待保险库解锁」 (`_vaultWait`, a STATE, never an error); the first answer that is not the lock ends the wait
    const waiting = (on) => { if (!!s._vaultWait === on) return; if (on) s._vaultWait = Date.now(); else delete s._vaultWait; try { onVaultWait(s); } catch { } };
    // lane vault-locked-refusal-notice: a LOCKED refusal notes THIS conversation by name (the owner's For-you item names it)
    try { const token = linkTokenFor(hostKey, { actor: s.name || s.webuiName || null }); waiting(false); return answerLink(200, { ok: true, token }); }
    catch (e) {
      const code = e && e.code === 'vault_locked' ? 'vault_locked' : 'error';
      const again = code === 'vault_locked' && !!s._vaultWait;
      waiting(code === 'vault_locked');
      return answerLink(code === 'vault_locked' ? STATUS.vault_locked : 500, { ok: false, code, error: (e && e.message) || WORDS.vault_locked }, { again });
    }
  });
}

/** A page's reveal secret off a GET (X-Vault-Page) — the POST doors take it off the body. */
const pageHeader = (req) => { const h = req && req.headers ? req.headers['x-vault-page'] : null; return typeof h === 'string' ? h : null; };

/**
 * THE GATE the other credential doors ask (lane vault-contents-window r2 — the roads the verify found behind the cookie
 * alone: GET /api/accounts/:id/key, GET /api/mounts/:id/config, POST /api/config/export {includeSensitive}). The wiring
 * puts it on `app.locals.vaultGate` (those routes are registered before the vault). Every verb asks personVerdict first
 * (an agent token ⇒ human_only, another site ⇒ cross_site); the window is THIS page's (X-Vault-Page).
 */
function vaultGate({ vault, contents, who = () => null }) {
  const whoOf = (req) => { try { return who(req) || 'sign-in-off'; } catch { return 'sign-in-off'; } };
  return {
    state: () => vault.state(),
    /** ONE value through the window's own door (one value, paced, audited). */
    reveal(req, id) { const v = personVerdict(req); return v.ok ? contents.reveal(whoOf(req), pageHeader(req), id, { ip: ipOf(req) }) : v; },
    /** ONE record a store hands whole (the mount edit dialog) through the same door. */
    revealRecord(req, store, entry) { const v = personVerdict(req); return v.ok ? contents.revealRecord(whoOf(req), pageHeader(req), store, entry, { ip: ipOf(req) }) : v; },
    /** The second password AT THE CALL (the sensitive export): the engine's confirm — the unlock's pace, nothing unlocked. */
    async confirm(req, password, event) {
      const v = personVerdict(req);
      if (!v.ok) return v;
      const r = await vault.confirm(password, { ip: ipOf(req), who: whoOf(req) });
      if (r && r.ok) vault.audit(event || 'vault-confirmed', { who: whoOf(req), ip: ipOf(req), by: 'human' });
      return r || { ok: false, code: 'error' };
    },
    statusOf: (code) => STATUS[code] || 400,
    refusalOf: (code) => WORDS[code] || String(code || 'error'),
  };
}

module.exports = { registerVaultRoutes, personVerdict, vaultGate, STATUS, WORDS };
