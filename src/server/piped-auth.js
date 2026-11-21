'use strict';
// THE PIPED HUB'S SIGN-IN (the separation, M1 — lane B, piece B3b-1; 主开发 r1060 «the interface's ONE store», r1517 (A)). In the
// PIPED form the interface holds the sign-in table (src/interface/signin.js): it is the table's ONE reader and writer, it answers
// the sign-in road and the held state itself, and it stamps every other head it relays with ONE fact — 'off' (no sign-in),
// { alive: <a login's sha256 digest> } (its cookie names a live login) or null (none). THIS HUB OPENS NO FILE: no data/auth.json,
// no table, no password; its gate (src/auth.js middleware, run unchanged — the held state, the door class, the cookie's pages)
// reads each head's fact through the two seams below, and its process-wide «is sign-in on» from the interface's state line
// ({op:'signin-state'} after the join — FAIL CLOSED: «on» until told).
//   checkToken — a head's login, THE HONOUR CHECK (piece B3b-2, law 4): the fact says alive AND the digest this hub recomputes
//     from the cookie of the head it parsed itself is the fact's, compared in constant time — a mismatch is refused by name
//     (counted, said at most five times a minute). While a vault lock's revoke is said and not yet answered by the interface
//     (src/server/hub-port.js signinRevokeAll — held across a re-join), NO login is honoured.
//   enabled — per head, the fact ('off' ⇒ the door class's open instance); with no head, the state line.
// What the plain form's table does that this hub cannot, DECLARED (piece B3b-1): the slide's cookie is the interface's (it appends
// it to the answer); config transfer carries no password record (export: none; import: refused by name); the vault's «not the
// sign-in password» check answers false; a vault lock's count is the interface's (revokeAllTokens says the order on the link and
// answers 0; the interface's answer names the count in this hub's journal).
const { AsyncLocalStorage } = require('node:async_hooks');
const { Auth } = require('../auth.js');
const { signinFactOf } = require('./interface-party.js');
const { onSigninState, signinRevokeAll, revokePending } = require('./hub-port.js');
const { tokenDigest, hashMatches } = require('../signin-table.js');

const IN_INTERFACE = 'signin-in-interface';
const inInterface = (what) => Object.assign(new Error(`${what}: the interface holds the sign-in table (the piped form) — this hub keeps none`), { code: IN_INTERFACE });
const ROAD = [['get', '/login'], ['post', '/api/login'], ['post', '/api/clerk-login'], ['post', '/api/logout'], ['post', '/api/auth/set-password']];

class PipedAuth extends Auth {
  // ITS OWN STATE IS PRIVATE (#): the head a gate call judges, and the interface's last state line — never an underscore field a
  // census could take for a session's (test-session-schema reads every such write under src/server/, comments included)
  #head = new AsyncLocalStorage();   // the head a gate call judges (its socket carries the interface's fact)
  #told = null;                      // the interface's last {op:'signin-state'}
  #say; #revoke; #pending;           // B3b-2: the journal, the revoke line and its hold (hub-port's, or a suite's)
  #mis = { at: 0, n: 0, muted: 0, total: 0 };   // the mismatches said, at most five a minute
  constructor(dataDir, opts = {}) {
    super(dataDir, opts);   // its _load (below) opens nothing
    this.#say = opts.log || console;
    this.#revoke = typeof opts.revoke === 'function' ? opts.revoke : signinRevokeAll;              // the revoke line (a suite hands its own)
    this.#pending = typeof opts.revokePending === 'function' ? opts.revokePending : revokePending;
    (typeof opts.subscribe === 'function' ? opts.subscribe : onSigninState)((m) => {   // the interface's state line (a suite hands its own hook)
      if (m && m.op === 'signin-state') this.#told = m;
      else if (m && m.op === 'signin-revoke-all-ack') { try { this.#say.log?.(`[auth] the interface signed ${Number(m.revoked) || 0} login(s) out (a vault lock's revoke, answered)`); } catch { } }
    });
  }
  /** THE INTERFACE HOLDS THE TABLE: nothing is opened, nothing is held here */
  _load() { }   // (the parent's constructor already holds no table: `_state` null, nothing held)
  _save() { }   // never writes: the file is the interface's
  /** the fact the interface stamped on the head being judged — undefined with no head (or a socket that carries none) */
  _fact() { const req = this.#head.getStore(); return req ? signinFactOf(req.socket) : undefined; }
  get held() { return null; }
  get shut() { return false; }
  upgradeHeld() { return false; }   // the interface refuses every upgrade itself while held
  get passwordEnabled() { return this.#told ? !!this.#told.password : true; }   // FAIL CLOSED: «on» until told
  get enabled() {
    const f = this._fact();
    if (f === 'off') return false;
    if (f !== undefined) return true;   // a live login or none: the interface's table is on for this head
    return this.#told ? !!this.#told.enabled : true;
  }
  get ssoEnabled() { return this.#told ? !!this.#told.sso : !!this._clerk?.enabled; }
  bootLine() { return '  Password auth: in the interface (the piped form) — it holds the sign-in table; this hub opens no file'; }
  /** a head's login: the interface's fact, HONOURED only when the digest recomputed here from `token` (the head's own cookie) is
   *  the fact's (B3b-2, law 4) — and never while a revoke waits for its answer */
  checkToken(token) {
    const f = this._fact();
    if (f === 'off') return true;
    if (this.#pending()) return false;   // a vault lock's revoke said, not yet answered: no login is honoured
    if (!token || !f || typeof f.alive !== 'string') return false;
    if (!hashMatches(tokenDigest(token), f.alive)) { this._mismatch(); return false; }   // THE HONOUR CHECK
    return true;
  }
  /** a fact that names another login than the head's cookie: refused BY NAME — counted, said at most five times a minute */
  _mismatch() {
    const now = Date.now(), w = this.#mis; w.total++;
    if (now - w.at > 60e3) { if (w.muted) { try { this.#say.warn?.(`[auth] ${w.muted} more sign-in facts that named another login were refused in the last minute`); } catch { } } w.at = now; w.n = 0; w.muted = 0; }
    if (++w.n > 5) { w.muted++; return; }
    try { this.#say.warn?.('[auth] refused a head whose sign-in fact names another login than the cookie it carries — the interface\'s word is recomputed here (law 4)'); } catch { }
  }
  _slideCookie() { }   // the interface appends the slide's cookie to the answer
  middleware() {
    const gate = super.middleware();
    return (req, res, next) => this.#head.run(req, () => gate(req, res, next));
  }
  requestAuthed(req) { return this.#head.run(req, () => super.requestAuthed(req)); }
  /** the road is the interface's: a head of it never reaches this hub — if one did, it is refused by name */
  registerRoutes(app) {
    for (const [m, p] of ROAD) app[m](p, (req, res) => res.status(503).json({ error: IN_INTERFACE, why: 'the interface answers the sign-in road' }));
  }
  ensurePassword() { return {}; }
  verifyPassword() { return false; }
  exportPasswordRecord() { return null; }
  importPasswordRecord() { throw inInterface('a password record cannot be imported here'); }
  setPassword() { throw inInterface('the password cannot be set here'); }
  removePassword() { throw inInterface('the password cannot be removed here'); }
  issueToken() { throw inInterface('a login cannot be issued here'); }
  /** a vault lock: the order goes on the link (held until the interface answers it, across a re-join) → 0 (the count is the
   *  interface's, said in this hub's journal when it answers) */
  revokeAllTokens() { this.#revoke('the vault was locked'); return 0; }
  revokeToken() { }
}

module.exports = { PipedAuth, IN_INTERFACE };
