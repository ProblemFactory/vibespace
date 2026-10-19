'use strict';
// THE VAULT'S DOORS (lane vault-e2e-password — docs/kb-api.md «Vault»). A PERSON sets the second password up, unlocks,
// changes it, sets the idle lock — from this instance's own page, behind its sign-in; an agent may read the state and LOCK
// (`vibespace-vault status|lock`), never unlock. Every password arrives in a request body and goes straight to the engine
// (src/server/vault-engine.js) — it is never logged, echoed, or kept on the request. The engine paces wrong passwords
// (5 ⇒ the next minute refused, `paced`) and audits every failure with the caller's address.
const { ownOriginOf, pageVerdict } = require('../write-origin.js');   // THE origin rule (its strict form: a person on this page)
const { sameToken } = require('../pairing-token.js');

const STATUS = Object.freeze({
  wrong_password: 403, corrupt: 500, paced: 429, vault_not_set_up: 409, already_set_up: 409, busy: 409, migration_failed: 500,
  password_too_short: 400, password_too_long: 400, password_not_text: 400, same_as_sign_in: 400, same_password: 400, bad_hours: 400,
  human_only: 403, cross_site: 403, unauthorized: 401,
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

function registerVaultRoutes(app, { vault, activeSessions = new Map(), getJobs = () => null }) {
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
    if (!v.ok) { take(req, 'password', 'old', 'new'); return answer(res, v); }
    try { answer(res, await fn(req)); } catch (e) { take(req, 'password', 'old', 'new'); res.status(500).json({ ok: false, code: 'error', error: 'the vault door failed — nothing changed' }); }
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
  // ── agents: the state and the lock — never unlock ──
  app.get('/api/agent/vault/state', (req, res) => (agentOk(req) ? res.json(agentFacts()) : answer(res, { ok: false, code: 'unauthorized' })));
  app.post('/api/agent/vault/lock', (req, res) => {
    if (!agentOk(req)) return answer(res, { ok: false, code: 'unauthorized' });
    const r = vault.lock('agent', { ip: ipOf(req) });
    return r.ok ? res.json({ ...r, ...agentFacts() }) : answer(res, r);
  });
}

module.exports = { registerVaultRoutes, personVerdict, STATUS, WORDS };
