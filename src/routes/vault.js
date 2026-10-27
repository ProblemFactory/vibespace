'use strict';
// THE VAULT'S DOORS (lane vault-e2e-password — docs/kb-api.md «Vault»). A PERSON sets the second password up, unlocks,
// changes it, sets the idle lock — from this instance's own page, behind its sign-in; an agent may read the state and LOCK
// (`vibespace-vault status|lock`), never unlock. Every password arrives in a request body and goes straight to the engine
// (src/server/vault-engine.js) — it is never logged, echoed, or kept on the request. The engine paces wrong passwords
// (5 ⇒ the next minute refused, `paced`) and audits every failure with the caller's address. TWO-STEP CODES (design q-047
// L1, lane vault-totp — src/server/vault-totp.js): a person adds, views the code of, deletes and grants an entry; an agent
// gets a granted entry's CURRENT CODE (never the seed) — a seed arrives in a request body and is taken off it like a password.
// lane vault-run-door (design q-043 §8, P0-f): `vibespace-vault run` — POST /api/agent/vault/run (a conversation's own vsst_
// bearer; a job token is refused job_no_use, a cookie unauthorized) hands the CLI's words to the HUB's run door
// (src/server/vault-run-door.js), which spawns the child with the values injected and answers its output SCRUBBED — never a
// value; GET /api/agent/vault/runnable = the entries a run may reference (names, never a value). A PERSON opens an entry for
// runs (POST /api/vault/runnable) and answers the run card (POST /api/vault/run/asks/:askId — 允许一次 / 此形状总是 / 拒绝);
// switching ON and «always» need this page's 验证是你 window (the second password again, in the press's own task).
// THE USE LAW (lane vault-use-law, design q-043 D1): no door here answers an entry's bytes to a BEARER — the agent doors
// answer facts and receipts; the ONE named exception is the link-token door (a conversation's attach child gets ITS
// machine's link token — scripts/test-vault-law.mjs ⑧ pins it as the only one). A bearer refused at a person's door, and
// every answer of the link-token door, is a USE noted through the engine's ONE writer (`vault.noteUse`: its `vault-use`
// line, its count — the 20th failure in a day files the owner's card naming the actor and the entry).
const { ownOriginOf, pageVerdict } = require('../write-origin.js');   // THE origin rule (its strict form: a person on this page)
const VU = require('../vault-use.js');   // PURE: the use's shape and the entry words (lane vault-use-law)
const { sameToken } = require('../pairing-token.js');
const CN = require('../foryou-actions.js'); // PURE (lane chat-needs-you-card): THE For-you action registry — the agent's ONE line after a filing (the card in its chat + the tray)
const OF = require('../server/owner-facts.js'); // lane agent-context-owner-facts (B-7960): the agent's state answer carries the lock time + the tray in the hub's words
const VB = require('../vault-blocked.js');   // PURE: THE words toward an agent on a LOCKED refusal (lane vault-locked-refusal-notice)
const { runOfToken } = require('../server/vault-totp.js');
const V = require('../vault.js');   // PURE: the agent-secret namespace builder + mint verdict (lane vault-mint-put)

const STATUS = Object.freeze({
  wrong_password: 403, corrupt: 500, paced: 429, vault_not_set_up: 409, already_set_up: 409, busy: 409, migration_failed: 500,
  password_too_short: 400, password_too_long: 400, password_not_text: 400, same_as_sign_in: 400, same_password: 400, bad_hours: 400,
  human_only: 403, cross_site: 403, unauthorized: 401, vault_locked: 423, no_link: 404,
  reveal_needs_password: 403, not_found: 404, unreadable: 500, // lane vault-contents-window
  not_revealable: 403, // int317: a machine's link token / a sealed file's key — never shown
  // design q-047 L1 (lane vault-totp): the two-step doors
  exists: 409, bad_seed: 400, seed_too_short: 400, bad_uri: 400, hotp_unsupported: 400, bad_digits: 400, bad_period: 400, bad_algorithm: 400, bad_text: 400, bad_name: 400,
  bad_args: 400, not_granted: 403, not_running: 409, failed: 500,
  // lane vault-run-door: the switch and the run card's answer (people's doors)
  entry_has_its_own_door: 403, entry_unknown: 404, ask_settled: 409, ask_unknown: 404, ask_expired: 410, ask_changed: 409, bad_answer: 400,
  always_not_offered: 400, conversation_gone: 410,
  hosts_required: 400, too_many_hosts: 400, bad_principal: 400, bad_resource: 400, bad_except: 400, except_conflicts: 400, too_many: 400, bad_row: 400, unknown_shape: 409, not_written: 500, store_unreadable: 503, no_use_grants: 404,   // lane vault-use-grants: «谁可以用…»
  bad_scope: 400, bad_length: 400, bad_charset: 400, value_required: 400, value_in_argv: 400, // lane vault-mint-put
  bad_grant_answer: 400, // lane vault-manual-and-lock: the answer to an agent's request
  // lane vault-paste-request: a paste request's answer / a free entry (src/server/vault-paste-door.js)
  invalid_value: 400, store_failed: 500, value_too_long: 400, unfiled: 503, request_quiet: 429, too_many_requests: 429, value_in_request: 400, job_no_use: 403,
  name_required: 400, name_too_long: 400, note_too_long: 400, bad_kind: 400, hidden_chars: 400, entry_unknown_id: 404,
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
  entry_has_its_own_door: 'that stored value is never used by an agent\'s run — it has its own door',
  entry_unknown: 'that stored value is not there any more',
  ask_settled: 'already answered', ask_unknown: 'that request is gone', ask_expired: 'too late — it was refused after 60 s',
  ask_changed: 'the request changed after it was shown — nothing ran', bad_answer: 'the answer is once, always or deny (always: 8h, 30d or forever)',
  always_not_offered: '«always» is not offered for this command', conversation_gone: 'the conversation that asked has ended — nothing to run it for',
  failed: 'the vault door failed — nothing changed',
  bad_scope: 'this session has no conversation to own a vault entry',
  bad_length: 'the length is a whole number from 8 to 256',
  bad_charset: 'the charset is ascii-printable, alnum or digits',
  value_required: 'put needs a value — pass --from-file or --stdin (the value rides the request body, never the command line)',
  value_in_argv: 'the value must not ride the URL (it is logged like a command line) — put it in the request body via --from-file or --stdin',
  bad_grant_answer: 'the answer is once, 8h or deny',
  // lane vault-paste-request
  invalid_value: 'that value is not accepted by the field — nothing was saved',
  store_failed: 'the value could not be saved — nothing changed',
  value_too_long: 'that value is too long (at most 8192 characters)',
  unfiled: 'the request could not be filed in the user\'s tray — nothing was asked',
  request_quiet: 'the user refused that a moment ago — do not ask again for 10 minutes; carry on without it',
  too_many_requests: 'too many paste requests are waiting on the user — wait for their answers',
  value_in_request: 'a paste request never carries a value — the user pastes it into the box in their tray',
  job_no_use: 'a Background Work job cannot ask the user for a secret — the conversation that owns the job asks',
  name_required: 'give it a name', name_too_long: 'the name is at most 80 characters', note_too_long: 'the note is at most 400 characters',
  bad_kind: 'the kind is API key, password or secret', hidden_chars: 'the words hold a hidden or direction character',
  entry_unknown_id: 'that stored value is not there any more',
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

/** lane vault-slow-load (inc-mvk5jyv3 «保险库操作好像加载时间有点长» — the server console had no vault line at all): a vault door
 *  that took longer than this names itself in the log, ONE line — the method, the ROUTE'S PATTERN (`/api/vault/totp/:name`,
 *  never a parameter, a query or a body), the milliseconds. */
const VAULT_SLOW_MS = 250;
function slowLineOf(req, ms) {
  const route = req.route && typeof req.route.path === 'string' && req.route.path.startsWith('/api/') ? req.route.path : String(req.originalUrl || req.url || '').split('?')[0].split('/').slice(0, 4).join('/');
  return `[vault] ${req.method} ${route} answered in ${Math.round(ms)} ms`;
}

function registerVaultRoutes(app, { vault, activeSessions = new Map(), getJobs = () => null, contents = null, who = () => null, linkTokenFor = null, onVaultWait = () => {}, auditLink = () => {}, run = null, paste = null,
  totp = null, callerOf = () => null, runOf = () => null, grantLive = () => true, subjects = () => ({ sessions: [], groups: [] }), logins = null, log = (line) => console.log(line), slowMs = VAULT_SLOW_MS }) {
  app.use(['/api/vault', '/api/agent/vault'], (req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.once('finish', () => { const ms = Number(process.hrtime.bigint() - t0) / 1e6; if (ms > slowMs) { try { log(slowLineOf(req, ms)); } catch { /* the answer went out */ } } });
    next();
  });
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
  /** lane vault-use-law: the BEARER behind a request — { by: 'agent', conv, name } for a live session's vsst_, { by: 'job',
   *  conv: 'job-<id>', name } for a live job's jbt_ — else null (none, or a token nobody holds: it names no actor). */
  const bearerOf = (req) => {
    const token = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '') || String((req.body && req.body.token) || '');
    if (token.startsWith('jbt_')) { const jm = getJobs && getJobs(); const j = jm && jm.ready !== false && typeof jm.jobByToken === 'function' ? jm.jobByToken(token) : null; return j ? { by: 'job', conv: `job-${j.id}`, name: j.name || null } : null; }
    if (!token.startsWith('vsst_')) return null;
    for (const [k, s] of activeSessions) if (s && sameToken(token, s.agentToken)) return { by: 'agent', conv: String(s._webuiId || k), name: s.name || s.webuiName || null };
    return null;
  };
  /** A person's door a BEARER knocked on: the entry it would have opened and what for (the door's name is the path's tail). */
  const PERSON_USES = Object.freeze({
    setup: [VU.VAULT_ENTRY, 'set the vault up'], unlock: [VU.VAULT_ENTRY, 'unlock the vault'], change: [VU.VAULT_ENTRY, 'change the second password'],
    'reveal-session': [VU.VAULT_ENTRY, 'open the window that shows stored values'], contents: [VU.CONTENTS_ENTRY, 'list the stored values'], reveal: [VU.CONTENTS_ENTRY, 'show a stored value'],
  });
  const refusedBearer = (req, code) => {
    const door = String(req.path || '').replace(/^\/api\/vault\//, ''), use = code === 'human_only' ? PERSON_USES[door] : null;
    const b = use ? bearerOf(req) : null;
    if (!b || typeof vault.noteUse !== 'function') return;
    try { vault.noteUse(use[0], { by: b.by, door, conv: b.conv }, { outcome: code, purpose: use[1], actor: VB.actorName(b.name, b.by === 'job' ? 'a job' : 'a conversation'), ip: ipOf(req) }); } catch { /* the refusal still answers */ }
  };
  const person = (fn) => async (req, res) => {
    const v = personVerdict(req);
    if (!v.ok) { take(req, 'password', 'old', 'new', 'seed', 'uri', 'value', 'loginPassword'); refusedBearer(req, v.code); return answer(res, v); }   // lane vault-paste-request: a pasted `value` too — lane browser-login: a typed `loginPassword`
    try { answer(res, await fn(req)); } catch (e) { take(req, 'password', 'old', 'new', 'seed', 'uri', 'value', 'loginPassword'); res.status(500).json({ ok: false, code: 'error', error: 'the vault door failed — nothing changed' }); }
  };
  /** An AGENT (vsst_ session / jbt_ job token) — it may read the state and lock, nothing else. */
  const agentOk = (req) => {
    const token = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
    if (token.startsWith('jbt_')) { const jm = getJobs && getJobs(); return !!(jm && jm.ready !== false && typeof jm.jobByToken === 'function' && jm.jobByToken(token)); }
    if (!token.startsWith('vsst_')) return false;
    for (const s of activeSessions.values()) if (s && sameToken(token, s.agentToken)) return true;
    return false;
  };
  const agentFacts = () => { const f = vault.facts(); return { state: f.state, setUpAt: f.setUpAt, lockedSince: f.lockedSince, keys: f.keys, ...(f.lockedSince ? { when: { lockedSince: OF.when(f.lockedSince) } } : {}), ...(f.state === 'locked' ? { tray: OF.tray().name } : {}) }; };   // B-7960: vibespace-vault prints these words, never a time or a tray of its own

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
  // ── WEB LOGINS (lane browser-login — src/server/browser-logins.js over PURE src/browser-login.js). PEOPLE only: the list (names,
  //    provenance, the grants that reach each — never a password), 添加 (the owner's own login: origin, user name, the password
  //    taken off the body, an optional paired two-step entry), 删除 (its own grant row with it), 用于… (grant / take back: this
  //    account, any account on this site, any site). The password itself shows only through /api/vault/reveal. An agent has NO
  //    door here: its own is `vibespace-browser login` (the kernel fills; it never sees a value). Never cached by a proxy. ──
  if (logins) {
    const whoL = (req) => { try { return who(req) || 'sign-in-off'; } catch { return 'sign-in-off'; } };
    const noStoreL = (fn) => (req, res) => { res.set('Cache-Control', 'no-store'); return fn(req, res); };
    const bodyL = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
    app.get('/api/vault/web-logins', noStoreL(person(() => ({ ...logins.list(), subjects: subjects() }))));
    app.post('/api/vault/web-logins', noStoreL(person((req) => {
      const [pw] = take(req, 'loginPassword');
      const b = bodyL(req);
      return logins.addOwn({ origin: b.origin, username: b.username, password: typeof pw === 'string' ? pw : '', totpName: b.totpName || null }, { who: whoL(req) });
    })));
    app.delete('/api/vault/web-logins/:name', noStoreL(person((req) => logins.drop(String(req.params.name || ''), { who: whoL(req) }))));
    app.post('/api/vault/web-logins/grants', noStoreL(person((req) => { const b = bodyL(req); return logins.grant(String(b.name || ''), String(b.scope || ''), String(b.subject || ''), { by: `user:${whoL(req).slice(0, 24)}` }); })));
    app.post('/api/vault/web-logins/ungrant', noStoreL(person((req) => { const b = bodyL(req); return logins.ungrant(String(b.resource || ''), String(b.principal || ''), { by: `user:${whoL(req).slice(0, 24)}` }); })));
  }
  // ── agents: the state and the lock — never unlock ──
  app.get('/api/agent/vault/state', (req, res) => (agentOk(req) ? res.json(agentFacts()) : answer(res, { ok: false, code: 'unauthorized' })));
  app.post('/api/agent/vault/lock', (req, res) => {
    if (!agentOk(req)) return answer(res, { ok: false, code: 'unauthorized' });
    const r = vault.lock('agent', { ip: ipOf(req) });
    return r.ok ? res.json({ ...r, ...agentFacts() }) : answer(res, r);
  });
  // ── agents: MINT / PUT a secret in THEIR OWN namespace (design q-043 §9, lane vault-mint-put). The SCOPE is the
  //    authenticated principal's conversation / job (never the agent's to choose); the engine seals and NEVER returns a
  //    value. A bearer may only CREATE here — it can never READ one back (there is no agent reveal door; the owner reveals
  //    in the Vault window behind 「验证是你」). An agent error says only the code + its words (never the vault's facts). ──
  const agentErr = (res, r) => { const code = (r && r.code) || 'error'; res.status(STATUS[code] || 400).json({ ok: false, code, error: WORDS[code] || code }); };
  const norm = (r) => { if (!r || r.ok) return r; let code = r.code; if (typeof code === 'string') { if (code.indexOf('vault_locked') >= 0) code = 'vault_locked'; else if (code === 'bad-name') code = 'bad_name'; } return { ...r, code }; };
  /** The calling principal → { scope, actor } | null. A vsst_ session: its conversation id; a live jbt_ job: `job-<id>`. */
  function agentPrincipal(req) {
    const token = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
    if (token.startsWith('jbt_')) { const jm = getJobs && getJobs(); const j = jm && jm.ready !== false && typeof jm.jobByToken === 'function' ? jm.jobByToken(token) : null; return j ? { scope: `job-${j.id}`, actor: j.name || `job ${j.id}` } : null; }
    if (!token.startsWith('vsst_')) return null;
    for (const [k, s] of activeSessions) if (s && sameToken(token, s.agentToken)) return { scope: String(s._webuiId || k), actor: s.name || s.webuiName || String(s._webuiId || k) };
    return null;
  }
  app.post('/api/agent/vault/mint', (req, res) => {
    const p = agentPrincipal(req);
    if (!p) return agentErr(res, { code: 'unauthorized' });
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const en = V.agentEntryName(p.scope, b.name);
    if (!en.ok) return agentErr(res, en);
    const r = vault.agentMint(en.name, { length: b.length, charset: b.charset, actor: p.actor });
    if (!r.ok) return agentErr(res, norm(r));
    if (typeof vault.noteUse === 'function') { try { vault.noteUse(r.name, { by: 'agent', door: 'mint', conv: p.scope }, { outcome: 'ok', purpose: typeof b.for === 'string' ? b.for.slice(0, 200) : 'mint a secret it never sees', actor: p.actor }); } catch { /* the mint still answered — the use law seam (int331): mint is a USE so `uses` reads it back */ } }
    res.json({ ok: true, name: r.name, ref: r.ref, provenance: 'agent minted · never shown to the agent', for: typeof b.for === 'string' ? b.for.slice(0, 200) : null });
  });
  app.post('/api/agent/vault/put', (req, res) => {
    const p = agentPrincipal(req);
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const value = b.value; if (b && typeof b === 'object') delete b.value;   // taken OFF the request — no later reader sees it
    if (!p) return agentErr(res, { code: 'unauthorized' });
    if (req.query && typeof req.query.value !== 'undefined') return agentErr(res, { code: 'value_in_argv' });   // never the URL (argv-readable)
    const en = V.agentEntryName(p.scope, b.name);
    if (!en.ok) return agentErr(res, en);
    if (typeof value !== 'string' || value === '') return agentErr(res, { code: 'value_required' });
    const r = vault.agentPut(en.name, value, { actor: p.actor });
    if (!r.ok) return agentErr(res, norm(r));
    if (typeof vault.noteUse === 'function') { try { vault.noteUse(r.name, { by: 'agent', door: 'put', conv: p.scope }, { outcome: 'ok', purpose: 'store a value it was given', actor: p.actor }); } catch { /* the put still answered — the use law seam (int331): put is a USE so `uses` reads it back */ } }
    res.json({ ok: true, name: r.name, ref: r.ref, provenance: 'agent stored · the agent saw the plaintext', hint: 'the transcript\'s copy is not protected — rotate this value when you can' });
  });
  // lane vault-use-law: every answer of the link-token door (the device audit's row, below) is also a USE of that machine's
  // link token by the conversation that asked — the ONE writer's line (door link-token, conv, outcome) and, for a refusal
  // that is the asker's own (a session on no machine asking), its count; a token nobody holds names nobody
  const LINK_OUTCOMES = Object.freeze({ 200: 'ok', 404: 'no_link', 423: 'vault_locked' });   // a known session's 401 = a hub with no link road: not the asker's (uncounted `error`)
  const linkUse = ({ sid, hostKey, status }) => {
    const s = sid != null ? activeSessions.get(sid) : null;
    if (!s || typeof vault.noteUse !== 'function') return;
    try { vault.noteUse(hostKey ? linkEntryOf(hostKey) : 'host:*', { by: 'agent', door: 'link-token', conv: String(s._webuiId || sid) }, { outcome: LINK_OUTCOMES[status] || 'error', purpose: 'attach this conversation to its own machine', actor: VB.actorName(s.name || s.webuiName, 'a conversation') }); } catch { }
  };
  const deviceAuditRow = auditLink;
  auditLink = (row) => { try { deviceAuditRow(row); } finally { linkUse(row); } };
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
  if (run) registerRunRoutes(app, { run, activeSessions, getJobs, contents, who, person, take, paste });
  if (paste) registerPasteRoutes(app, { paste, activeSessions, person, take });
}

/**
 * lane vault-paste-request (the owner 2026-10-23: 「应该允许你给我弹一个保险库输入框让我直接 paste 进去」) — src/server/vault-paste-door.js
 * over PURE src/vault-paste.js. AN AGENT: POST /api/agent/vault/secret-request {words, purpose, into? | kind?, name?} with its
 * conversation's own vsst_ bearer (a job token ⇒ job_no_use, read by its prefix; none ⇒ unauthorized) files ONE For-you
 * item with a masked paste box → {requestId, target} — never a value (a `value` on the request is refused and dropped).
 * A PERSON (this page — any bearer human_only, another site cross_site): POST /api/vault/secret-requests/:id/answer {answer: store
 * | deny, value} — the value taken OFF the body at once, straight to the one writer of its place (a registry field: the
 * integration store; a free entry: the vault's `secret:<id>`); POST /api/vault/secrets {label, kind, note, value} — the
 * Vault window's 「其他密钥或密码…」 (a free entry the owner adds); DELETE /api/vault/secrets/:id — its delete door.
 */
function registerPasteRoutes(app, { paste, activeSessions, person, take }) {
  const { addressableId } = require('../claude-lock-capture.js');
  const tokenOf = (req) => String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
  /** The vsst_'s conversation as the paste door reads a caller — { job } for a job token (by its prefix), else null. */
  function pasteCallerOf(req) {
    const token = tokenOf(req);
    if (token.startsWith('jbt_')) return { job: true };
    if (!token.startsWith('vsst_')) return null;
    for (const [k, s] of activeSessions) {
      if (!s || !sameToken(token, s.agentToken)) continue;
      const cid = addressableId(s);
      return { conversationId: cid, sessionKey: cid ? `${s.backend || 'claude'}:${cid}` : null, scope: String(s._webuiId || k), name: s.name || s.webuiName || null };
    }
    return null;
  }
  const refusal = (res, r) => res.status(paste.statusOf(r.code)).json({ ok: false, code: r.code, error: r.words || paste.words(r.code), ...Object.fromEntries(['until', 'fields'].filter((k) => r[k] != null).map((k) => [k, r[k]])) });
  const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  app.post('/api/agent/vault/secret-request', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const b = bodyOf(req);
    const carried = Object.prototype.hasOwnProperty.call(b, 'value') || !!(req.query && Object.prototype.hasOwnProperty.call(req.query, 'value'));
    delete b.value;   // taken OFF the request — a paste request carries no value
    const caller = pasteCallerOf(req);
    if (!caller) return refusal(res, { code: 'unauthorized' });
    if (carried) return refusal(res, { code: 'value_in_request', words: 'a paste request never carries a value — the user pastes it into the box in their tray' });
    let r;
    try { r = paste.request({ caller, words: b.words, purpose: b.purpose, into: b.into, kind: b.kind, name: b.name, hosts: b.hosts }); }   // hosts: lane vault-use-grants (`--host`)
    catch (e) { return refusal(res, { code: 'unfiled' }); }
    if (!r || !r.ok) return refusal(res, r || { code: 'unfiled' });
    return res.json({ ok: true, requestId: r.requestId, target: r.target, ...(r.already ? { already: r.already } : { filed: CN.filedLine('secret-request', r.requestId, OF.tray()) }), tray: OF.tray() });
  });
  app.post('/api/vault/secret-requests/:id/answer', person((req) => { const [value] = take(req, 'value'); const b = req.body || {}; return paste.answer(String(req.params.id), { answer: b.answer, value, by: 'user' }); }));
  app.post('/api/vault/secrets', person((req) => { const [value] = take(req, 'value'); const b = req.body || {}; return paste.addEntry({ label: b.label, note: b.note, kind: b.kind, value, by: 'user' }); }));
  app.delete('/api/vault/secrets/:id', person((req) => paste.dropEntry(String(req.params.id), { by: 'user' })));
}

/**
 * lane vault-run-door — `vibespace-vault run` (design q-043 §8 P0-f). AN AGENT: POST /api/agent/vault/run {args, cwd} with
 * its conversation's own vsst_ bearer — the door judges, may hold the call on the owner's card (≤ 60 s), spawns the child on
 * the hub and answers {exit, stdout, stderr, …} SCRUBBED (each value, in every spelling of vault-run.js's FORMS, is its placeholder); a job token ⇒
 * 403 job_no_use; no bearer (a cookie) ⇒ 401. GET /api/agent/vault/runnable → {entries: [{ref, store, label, kind, field}]}.
 * A PERSON (this page — any bearer human_only): POST /api/vault/runnable {id, on, page} (ON needs this page's 验证是你 window) ·
 * POST /api/vault/run/asks/:askId {answer: once | always | deny, ttl, page} («always» needs the window too).
 * lane vault-manual-and-lock (design q-043 D4): POST /api/agent/vault/request {entry, purpose} — a conversation's own bearer
 * asks the owner for an entry with its purpose (ONE For-you ask; a second for the same entry while one is open ⇒
 * request_pending) · GET /api/agent/vault/uses → {grants, requests, uses} — THIS conversation's grants, open requests and
 * own use lines (references, purposes, times, outcomes, receipts — never a value) · a PERSON answers a request: POST
 * /api/vault/request/asks/:askId {answer: once | 8h | deny, page} → the grant row the run door honours (memory only; a lock
 * ends it) — once / 8h need this page's 验证是你 window like the switch (a grant opens an entry), deny is a click.
 * lane vault-use-grants: A PERSON edits who may use an entry with NO card — POST /api/vault/use-grants {id, to, except, page}
 * (the whole vault-use row: each `to` member its `hosts` and optional `until`; a widening needs this page's 验证是你 window,
 * reveal_needs_password otherwise) · POST /api/vault/use-grants/revoke {id, principal} (one member out — a click).
 * THE THREE HOLES this door does NOT close (design §8.6 — said here, in the door's own header and on the manual): ① the child
 * runs under the agent's uid — /proc/<child>/environ and the 0600 file are readable to it while the child lives (hygiene and
 * audit, not isolation; q-040 closes it); ② a tool can send the value elsewhere — the card shows the hosts and the whole
 * command, the egress fence is P1; ③ THE SCRUBBER IS A SIEVE — it reads stdout and stderr only: a value WRITTEN TO A FILE
 * and then `cat`-ed by the agent's own shell never meets it (write-then-cat is accepted and audited, not closed).
 */
function registerRunRoutes(app, { run, activeSessions, getJobs, contents, who, person, take, paste = null }) {
  const DOOR = require('../server/vault-run-door.js');
  const tokenOf = (req) => String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');   // lane vault-manual-and-lock seam (int331): renamed from bearerOf so test-record-clear-census keeps use-law's bearerOf (the person doors' jobs-stash reads)
  /** The vsst_'s conversation, as the door reads a caller — or { job } / null. */
  function runCallerOf(req) {
    const token = tokenOf(req);
    if (token.startsWith('jbt_')) { const jm = getJobs && getJobs(); const j = jm && jm.ready !== false && typeof jm.jobByToken === 'function' ? jm.jobByToken(token) : null; return j ? { job: true, name: j.name || null } : null; }
    if (!token.startsWith('vsst_')) return null;
    for (const [k, s] of activeSessions) {
      if (!s || !sameToken(token, s.agentToken)) continue;
      const cid = s.backendSessionId || s.claudeSessionId || null;
      return { conversationId: cid, sessionKey: cid ? `${s.backend || 'claude'}:${cid}` : null, name: s.name || s.webuiName || null, cwd: typeof s.cwd === 'string' ? s.cwd : null,
        remote: !!(s._dialDeviceId || (s.host && s.host !== 'local')), live: !s.isTmuxView,
        scope: String(s._webuiId || k) };   // lane vault-manual-and-lock: THIS conversation as the use law and a mint spell it (its vault-use `conv`, an agent entry's scope)
    }
    return null;
  }
  const refusal = (res, r) => res.status(DOOR.statusOf(r.code)).json({ ok: false, code: r.code, error: r.words || r.code, ...Object.fromEntries(['ref', 'door', 'tool', 'template', 'name', 'flag', 'why', 'killed'].filter((k) => r[k] != null).map((k) => [k, r[k]])) });
  app.post('/api/agent/vault/run', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const caller = runCallerOf(req);
    if (!caller) return refusal(res, { code: 'unauthorized', words: DOOR.MORE_WORDS.unauthorized });
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const args = Array.isArray(b.args) && b.args.length <= 512 && b.args.every((x) => typeof x === 'string') ? b.args : null;
    if (!args) return refusal(res, { code: 'bad_flag', words: require('../vault-run.js').WORDS.bad_flag });
    // the CLI's call gave up (its own timeout, Ctrl-C, the conversation stopped): a card waiting settles, a child running stops
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    let r;
    try { r = await run.run({ caller, args, cwd: typeof b.cwd === 'string' ? b.cwd : null, signal: ac.signal }); }
    catch (e) { return refusal(res, { code: 'failed', words: DOOR.MORE_WORDS.failed }); }
    if (!r || !r.ok) return refusal(res, r || { code: 'failed' });
    return res.json(r);
  });
  app.get('/api/agent/vault/runnable', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const caller = runCallerOf(req);
    if (!caller || caller.job) return refusal(res, caller ? { code: 'job_no_use', words: require('../vault-run.js').WORDS.job_no_use } : { code: 'unauthorized', words: DOOR.MORE_WORDS.unauthorized });
    const r = run.runnableFor(caller);
    return r.ok ? res.json(r) : refusal(res, r);
  });
  // lane vault-manual-and-lock: an agent ASKS for an entry with its purpose (one For-you ask — nothing waits on it), and reads
  // its own grants, open requests and use lines back
  app.post('/api/agent/vault/request', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const caller = runCallerOf(req);
    if (!caller) return refusal(res, { code: 'unauthorized', words: DOOR.MORE_WORDS.unauthorized });
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    let r;
    try { r = run.request({ caller, entry: typeof b.entry === 'string' ? b.entry : '', purpose: typeof b.purpose === 'string' ? b.purpose : '' }); }
    catch (e) { return refusal(res, { code: 'failed', words: DOOR.MORE_WORDS.failed }); }
    return r && r.ok ? res.json({ ...r, ...(r.todoId ? { filed: CN.filedLine('vault-grant-ask', r.todoId, OF.tray()) } : {}) }) : refusal(res, r || { code: 'failed' });
  });
  app.get('/api/agent/vault/uses', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const caller = runCallerOf(req);
    if (!caller) return refusal(res, { code: 'unauthorized', words: DOOR.MORE_WORDS.unauthorized });
    const r = run.usesFor(caller);
    if (r && r.ok && paste && typeof paste.openFor === 'function') { try { r.pastes = paste.openFor(caller.scope); } catch { r.pastes = []; } }   // lane vault-paste-request: its paste boxes still waiting (words, places — never a value)
    return r && r.ok ? res.json(r) : refusal(res, r || { code: 'failed' });
  });
  // ── people: the switch and the card's answer — ON / «always» need THIS page's 验证是你 window (the page secret, the body or X-Vault-Page) ──
  const whoOf = (req) => { try { return who(req) || 'sign-in-off'; } catch { return 'sign-in-off'; } };
  const reauthedOf = (req, page) => !!(contents && contents.windowFacts(whoOf(req), typeof page === 'string' ? page : pageHeader(req)).open);
  app.post('/api/vault/runnable', person((req) => { const [page] = take(req, 'page'); const b = req.body || {}; return run.setRunnable({ id: b.id, on: b.on === true, reauthed: b.on === true && reauthedOf(req, page), by: 'user' }); }));
  app.post('/api/vault/run/asks/:askId', person((req) => { const [page] = take(req, 'page'); const b = req.body || {}; if (b.answer === 'once' && whoOf(req) === 'sign-in-off' && !reauthedOf(req, page)) return { ok: false, code: 'reveal_needs_password' }; return run.answer(String(req.params.askId), { answer: b.answer, ttl: b.ttl || undefined, reauthed: b.answer === 'always' && reauthedOf(req, page), by: 'user' }); }));
  // lane vault-use-grants: «谁可以用…» — the entry's vault-use row (给谁 / 除了, each member its hosts and its end): a save that WIDENS
  // (a new member, a new host, a later end, an exception taken away) needs THIS page's 验证是你 window; a narrowing and ✕ are clicks
  app.post('/api/vault/use-grants', person((req) => { const [page] = take(req, 'page'); const b = req.body || {}; const ug = run.useGrants; if (!ug) return { ok: false, code: 'no_use_grants' }; return ug.setRow(String(b.id || ''), { to: Array.isArray(b.to) ? b.to : [], except: Array.isArray(b.except) ? b.except : [] }, { by: 'user', reauthed: reauthedOf(req, page) }); }));
  app.post('/api/vault/use-grants/revoke', person((req) => { const b = req.body || {}; const ug = run.useGrants; if (!ug) return { ok: false, code: 'no_use_grants' }; return ug.revoke(String(b.id || ''), String(b.principal || ''), { by: 'user' }); }));
  app.post('/api/vault/request/asks/:askId', person((req) => { const [page] = take(req, 'page'); const b = req.body || {}; return run.answerRequest(String(req.params.askId), { answer: b.answer, reauthed: b.answer !== 'deny' && reauthedOf(req, page), by: 'user' }); }));   // lane vault-manual-and-lock: once | 8h need this page's 验证是你 (a grant opens the entry as the switch does); deny is a click
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

/** A machine's link-token entry name (src/server/host-tokens.js `entryOf`) — read at the call (the routes load first). */
const linkEntryOf = (hostKey) => require('../server/host-tokens.js').entryOf(hostKey);

module.exports = { registerVaultRoutes, personVerdict, vaultGate, STATUS, WORDS, VAULT_SLOW_MS, slowLineOf };
