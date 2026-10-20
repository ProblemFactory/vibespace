'use strict';
// THE AUTOMATION DOORS (design q-046 L1, lane automation-keys-core — docs/kb-api.md «Automation keys»).
//   · A PERSON (this instance's own page, its sign-in; every bearer refused `human_only`): the keys and their grants
//     (GET /api/automation/keys — never a value, never a digest), 铸造 (POST /api/automation/keys {name, scopes}), 撤销
//     (POST …/keys/:id/revoke), 授权给 (POST …/keys/:id/grants {subjects}), take a grant back (DELETE
//     /api/automation/grants/:grantId), and the answer to a first-use card (POST /api/automation/asks/:askId {answer}).
//     Lane automation-open-limits (the q-048 verify's M2): 铸造 carries the key's LIMITS ({…, limits}), 边界… sets them
//     (POST …/keys/:id/limits {limits}), 审计… reads one key's audit lines (GET …/keys/:id/audit); the list carries the
//     pickers' choices (`limitChoices`: the accounts, the harness tables' permission modes and models).
//   · AN AGENT (its own conversation's vsst_ — a job's jbt_ is refused `session_only`: L1 grants conversations and
//     Task Groups only): POST /api/agent/automation/:verb (the body = the verb's arguments; `?key=` names a key), GET
//     /api/agent/automation/keys (the keys THIS conversation may use: names + scopes), GET /api/agent/automation/audit
//     (THIS conversation's lines). The caller is the TOKEN's conversation, never anything the body says.
// Every answer carries a CODE (src/automation-keys.js CODES); the vault locked ⇒ 423 `vault_locked`, every door.
const A = require('../automation-keys.js');
const { personVerdict } = require('./vault.js');
const VB = require('../vault-blocked.js');   // PURE: THE words toward an agent on a LOCKED refusal (lane vault-locked-refusal-notice)

const WORDS = Object.freeze({
  not_granted: 'no grant lets this conversation use that key — the owner grants it in the Vault window (or answers the For-you card)',
  key_revoked: 'that key was revoked',
  verb_not_in_scope: 'that key does not hold this verb',
  vault_locked: VB.agentWords('every automation waits until a person unlocks it on this instance\'s page'),   // lane vault-locked-refusal-notice: the owner was told (For you names this conversation) — the agent never asks
  vault_not_set_up: 'the vault is not set up — automation keys live in it',
  subject_ended: 'this conversation is not running any more',
  once_spent: 'the one use the owner allowed was spent — the next call asks again',
  key_ambiguous: 'several keys hold this verb — name one with --key',
  unknown_verb: 'no such verb',
  verb_not_wired: 'that verb is in the table but not wired yet',
  bad_args: 'the arguments were refused',
  ask_denied: 'the owner refused it',
  ask_expired: 'nobody answered in 60 s — refused',
  ask_quiet: 'the owner refused this key for this conversation a moment ago',
  ask_unfiled: 'the question could not be filed in For you — refused',
  caller_gone: 'the call went away while its card waited — nothing ran',
  // lane automation-open-limits: the open asks for what its key's limits do not allow (the answer names them: `limits`)
  cwd_outside_roots: 'that folder is outside this key\'s folders', account_not_allowed: 'that account is not one of this key\'s',
  permission_not_allowed: 'that permission mode is not one of this key\'s', model_not_allowed: 'that model is not one of this key\'s',
  mode_not_allowed: 'that mode is not one of this key\'s',
  ask_unknown: 'that question is gone', ask_settled: 'already answered',
  write_failed: 'the change could not be written on the server — nothing changed; try again in a minute',   // lane feedback-handled-verb
  session_only: 'only a conversation uses automation keys (a job does not, yet)',
  human_only: 'only a person mints, grants, revokes or answers — an agent never writes a grant',
  cross_site: 'these doors answer this instance\'s own page only',
  unauthorized: 'missing or unknown session token', not_found: 'not found', not_ready: 'the server is still starting — try again in a moment', failed: 'it failed',
});
const STATUS = Object.freeze({ ...A.CODES, vault_not_set_up: 409, ask_unknown: 404, ask_settled: 409, human_only: 403, cross_site: 403, not_ready: 503 });

/**
 * @param {object} o
 * @param {object} o.engine      src/server/automation-engine.js
 * @param {(token: string) => object|null} o.callerOf  a vsst_ → its conversation ({conversationId, sessionKey, name, live, groups})
 * @param {() => {sessions: object[], groups: object[]}} [o.subjects]  the grant picker's choices (live conversations + Task Groups)
 * @param {() => {accounts: object[], permissionModes: object[], models: object[]}} [o.limitChoices]  the limit pickers' choices
 * @param {(cwd: string|null) => Promise<object|null>} [o.permissionNow]  q-049 M2: the CLI's own permission mode resolved for a folder (null = the hub's own folder)
 * @param {(req) => string|null} [o.who]  the sign-in handle (the `by` of a person's act)
 */
function registerAutomationRoutes(app, { engine, callerOf, subjects = () => ({ sessions: [], groups: [] }), limitChoices = () => ({ accounts: [], permissionModes: [], models: [] }), permissionNow = null, who = () => null }) {
  const answer = (res, r) => {
    if (r && r.ok) return res.json(r);
    const code = (r && r.code) || 'failed';
    res.status(STATUS[code] || 400).json({ ...r, ok: false, code, error: r && r.why ? `${WORDS[code] || code}: ${r.why}` : WORDS[code] || code });
  };
  const byOf = (req) => { try { const h = who(req); return h ? `user:${String(h).slice(0, 24)}` : 'user'; } catch { return 'user'; } };
  const person = (fn) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const v = personVerdict(req);
    if (!v.ok) return answer(res, v);
    try { answer(res, await fn(req)); } catch (e) { res.status(500).json({ ok: false, code: 'failed', error: 'the automation door failed — nothing changed' }); }
  };
  const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

  // ── people ──
  // lane automation-open-permission-resolve (q-049 M2): what a key's `default` IS right now — the CLI's own permission mode
  // resolved for the key's first folder (the hub's own folder for the mint dialog), so the picker's row can say
  // 「CLI 自己的设置（现在是 X）」; null when the hub cannot say (no resolver, another harness) — the row then says no more than before
  const nowOf = async (cwd) => { if (typeof permissionNow !== 'function') return null; try { const r = await permissionNow(cwd || null); return r && r.ok ? { mode: String(r.mode || 'default'), layer: r.layer ? { short: r.layer.short, file: r.layer.file } : null, disabledBy: r.disabledBy ? { short: r.disabledBy.short, file: r.disabledBy.file } : null, cwd: r.cwd || cwd || null } : null; } catch { return null; } };
  app.get('/api/automation/keys', person(async () => {
    const l = engine.list();
    for (const k of l.keys) if (k.scopes.includes('conversations.open')) k.permissionNow = await nowOf(k.limits && Array.isArray(k.limits.cwdRoots) ? k.limits.cwdRoots[0] : null);
    return { ...l, verbs: A.SCOPES.map((s) => ({ verb: s.verb, label: s.label, billed: s.billed })), subjects: subjects(), limitChoices: { ...limitChoices(), permissionNow: await nowOf(null) } };
  }));
  app.post('/api/automation/keys', person((req) => engine.mint({ name: body(req).name, scopes: body(req).scopes, limits: body(req).limits, by: byOf(req) })));
  app.post('/api/automation/keys/:id/limits', person((req) => engine.setLimits(String(req.params.id), body(req).limits, { by: byOf(req) })));
  app.get('/api/automation/keys/:id/audit', person((req) => engine.auditOfKey(String(req.params.id), { limit: req.query && req.query.limit })));
  app.post('/api/automation/keys/:id/revoke', person((req) => engine.revoke(String(req.params.id), { by: byOf(req) })));
  app.post('/api/automation/keys/:id/grants', person((req) => engine.grant(String(req.params.id), body(req).subjects, { by: byOf(req) })));
  app.delete('/api/automation/grants/:grantId', person((req) => engine.ungrant(String(req.params.grantId), { by: byOf(req) })));
  app.post('/api/automation/asks/:askId', person((req) => engine.answer(String(req.params.askId), { answer: body(req).answer, answeredBy: byOf(req) })));

  // ── agents: THEIR conversation's token names the caller ──
  const callerFrom = (req, res) => {
    const token = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
    if (token.startsWith('jbt_')) { answer(res, { ok: false, code: 'session_only' }); return null; }
    const c = token.startsWith('vsst_') ? callerOf(token) : null;
    if (!c) { answer(res, { ok: false, code: 'unauthorized' }); return null; }
    return c;
  };
  app.post('/api/agent/automation/:verb', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const caller = callerFrom(req, res);
    if (!caller) return;
    // q-048 verify M1: the caller's request closing before its answer (the CLI killed, the turn stopped) withdraws it from its
    // card — an answer then runs nothing (`res` close, not `req`: a request's own close fires once its body is read)
    const gone = new AbortController();
    res.on('close', () => { if (!res.writableFinished) gone.abort(); });
    try { answer(res, await engine.use({ caller, verb: String(req.params.verb), args: body(req), want: req.query && req.query.key ? String(req.query.key) : null, signal: gone.signal })); }
    catch (e) { res.status(500).json({ ok: false, code: 'failed', error: 'the automation door failed — nothing ran' }); }
  });
  app.get('/api/agent/automation/keys', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const caller = callerFrom(req, res);
    if (caller) res.json({ ok: true, keys: engine.keysFor(caller), verbs: A.SCOPES.map((s) => ({ verb: s.verb, billed: s.billed })) });
  });
  app.get('/api/agent/automation/audit', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const caller = callerFrom(req, res);
    const q = req.query || {};
    if (caller) res.json({ ok: true, lines: engine.auditFor(caller, { key: q.key ? String(q.key) : null, since: q.since ? String(q.since) : null, limit: q.limit }) });
  });
}

module.exports = { registerAutomationRoutes, STATUS, WORDS };
