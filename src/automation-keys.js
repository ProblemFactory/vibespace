'use strict';
/**
 * VIBESPACE'S OWN AUTOMATION KEYS — PURE (imports nothing; CJS so the hub's engine, the routes, the Vault window and the
 * suites share ONE set of rules). Design q-046 (the owner, 2026-10-19 22:1xZ: "给 vibespace 本身开发个 API … 相关可以用作自动
 * 化的 API 都提供专门的 key 授权，存在 vault 里，内部 agent 可以被单项授权这个 key，全程不需要我看到 key"), lane L1
 * automation-keys-core.
 *
 *   · A KEY is a record `{id, name, scopes[], createdAt, createdBy, revokedAt, lastUsedAt, digest}` (data/automation-keys.json,
 *     0600) — its VALUE (`vsak_<base64url of 32 random bytes>`) is a vault entry `apikey:<id>` and nothing else; the record
 *     keeps its sha256 `digest` only (the external door, L3, finds a key by it — like a login token). The owner never sees a
 *     value unless he reveals one in the Vault window to hand to an outside party.
 *   · SCOPES is a CLOSED table: one row per verb {verb, layer, billed, args}; a new verb is a row + its consumer (decision
 *     25's discipline) — there is no "every API" key.
 *   · A GRANT `{id, keyId, subject, mode, at, by, spentAt}` lets a SUBJECT use a key: `session:<conversation id>` (one
 *     conversation), `group:<task id>` (every conversation of that Task Group), `external` (an outside caller with the
 *     value — L3). Grants are written by a PERSON only: the Vault window's 授权给… and the first-use card's answer.
 *   · `useVerdict` is THE judgment of one use, made on the hub: the caller's own session token names the subject, the
 *     grant table says whether that subject may use the key, the key's scopes whether the verb is in it, the vault's state
 *     whether anything may happen at all — an agent never holds a value (q-043's 「用而不见」 holds by construction).
 *   · `identityOf(keyId)` = `automation:<keyId>` — the spend identity a billed verb (conversations.open, L2) is charged to.
 */

const KEY_ID_RE = /^ak-[0-9a-f]{12}$/;
const VALUE_PREFIX = 'vsak_';
const VALUE_RE = /^vsak_[A-Za-z0-9_-]{43}$/;
const ENTRY_PREFIX = 'apikey:';
const NAME_MAX = 60;
const ARG_TEXT_MAX = 120;
const ID_RE = /^[\w.:-]{1,200}$/;          // a conversation / session / task id as the routes name them
const SUBJECT_RE = /^(?:session:[\w.:-]{1,200}|group:[\w.:-]{1,120}|external)$/;
const MODES = Object.freeze(['always', 'once']);
const ASK_TTL_MS = 60e3;                    // the first-use card: 60 s, then refused (hub-act-ask's discipline)
const ASK_QUIET_MS = 10 * 60e3;             // a refusal silences that (key, subject) pair for 10 minutes
const AUDIT_FILE = 'automation-audit.jsonl';
const STORE_FILE = 'automation-keys.json';

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const clean = (v, n) => str(v).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').trim().slice(0, n);
const bad = (why) => ({ ok: false, code: 'bad_args', why });
const idArg = (v, what, { optional = false } = {}) => {
  if (v == null || v === '') return optional ? { ok: true, value: null } : bad(`${what} is required`);
  const s = str(v).trim();
  return ID_RE.test(s) ? { ok: true, value: s } : bad(`${what} must be an id (letters, digits, . _ : -; ≤ 200)`);
};
const textArg = (v, what, { optional = false, max = ARG_TEXT_MAX } = {}) => {
  if (v == null || v === '') return optional ? { ok: true, value: null } : bad(`${what} is required`);
  if (typeof v !== 'string') return bad(`${what} must be text`);
  const s = clean(v, max + 1);
  if (!s) return optional ? { ok: true, value: null } : bad(`${what} is required`);
  return s.length > max ? bad(`${what} is at most ${max} characters`) : { ok: true, value: s };
};
/** Validate an args object against named fields: `spec` = { field: (v) => {ok, value} }; unknown fields are refused by name. */
function argsOf(raw, spec) {
  const a = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!a) return bad('the arguments are a JSON object');
  for (const k of Object.keys(a)) if (!Object.prototype.hasOwnProperty.call(spec, k)) return bad(`unknown argument "${clean(k, 40)}"`);
  const out = {};
  for (const [k, fn] of Object.entries(spec)) { const r = fn(a[k]); if (!r.ok) return r; if (r.value != null) out[k] = r.value; }
  return { ok: true, args: out };
}

/** THE CLOSED TABLE — the verbs a key may carry (the first five = what the dispatcher needs, design q-046 §2). `label` is an
 *  English t() key (the window words it); `args` validates a call's arguments → {ok, args} | {ok:false, code:'bad_args', why}. */
const SCOPES = Object.freeze([
  Object.freeze({ verb: 'conversations.open', layer: 'act', billed: true, label: 'Open a conversation',
    args: (a) => argsOf(a, { backend: (v) => idArg(v, 'backend', { optional: true }), mode: (v) => idArg(v, 'mode', { optional: true }), cwd: (v) => textArg(v, 'cwd', { max: 400 }), name: (v) => textArg(v, 'name', { optional: true }),
      model: (v) => idArg(v, 'model', { optional: true }), effort: (v) => idArg(v, 'effort', { optional: true }), permission: (v) => idArg(v, 'permission', { optional: true }),
      task: (v) => idArg(v, 'task', { optional: true }), pool: (v) => idArg(v, 'pool', { optional: true }) }) }),
  Object.freeze({ verb: 'conversations.rename', layer: 'act', billed: false, label: 'Rename a conversation',
    args: (a) => argsOf(a, { name: (v) => textArg(v, 'name'), target: (v) => idArg(v, 'target', { optional: true }) }) }),
  Object.freeze({ verb: 'conversations.bind', layer: 'act', billed: false, label: 'Put a conversation in a task group',
    args: (a) => argsOf(a, { target: (v) => idArg(v, 'target'), task: (v) => idArg(v, 'task') }) }),
  Object.freeze({ verb: 'conversations.end', layer: 'act', billed: false, label: 'End a conversation',
    args: (a) => argsOf(a, { target: (v) => idArg(v, 'target') }) }),
  Object.freeze({ verb: 'groups.invite', layer: 'act', billed: false, label: 'Invite a conversation into a group',
    args: (a) => argsOf(a, { group: (v) => idArg(v, 'group'), target: (v) => idArg(v, 'target') }) }),
  // lane automation-verbs (L2): the ids a just-opened conversation reports a moment later (`pending` until its CLI said its
  // conversation id) — a READ, nothing acts; a key holds it like any verb
  Object.freeze({ verb: 'conversations.status', layer: 'read', billed: false, label: "Look up a conversation's ids",
    args: (a) => argsOf(a, { target: (v) => idArg(v, 'target') }) }),
]);
const VERBS = Object.freeze(SCOPES.map((s) => s.verb));
const scopeOf = (verb) => SCOPES.find((s) => s.verb === verb) || null;

/** THE CODES a use answers, and their HTTP status (the door's table — src/routes/automation.js). */
const CODES = Object.freeze({
  not_granted: 403, key_revoked: 403, verb_not_in_scope: 403, vault_locked: 423, vault_not_set_up: 409, subject_ended: 403, once_spent: 403,
  key_ambiguous: 409, unknown_verb: 404, verb_not_wired: 501, bad_args: 400, ask_denied: 403, ask_expired: 403, ask_quiet: 403,
  ask_unfiled: 503, session_only: 403, unauthorized: 401, not_found: 404, failed: 500,
  // lane automation-verbs (L2): the spend ceiling refused a billed verb (its bucket named) · the conversation has not
  // reported its id yet (poll conversations.status)
  spend_refused: 429, pending: 409,
  // q-048 verify M1: the caller went away while its first-use card waited (withdrawn; nothing ran — the audit line is the record)
  caller_gone: 410,
});

/** A key record off disk → its shape (null = not a record). Copies NAMED fields only — never a spread. */
function keyOf(raw) {
  if (!raw || typeof raw !== 'object' || !KEY_ID_RE.test(str(raw.id))) return null;
  const num = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : null);
  return {
    id: raw.id, name: clean(raw.name, NAME_MAX) || raw.id, scopes: (Array.isArray(raw.scopes) ? raw.scopes : []).filter((v, i, a) => VERBS.includes(v) && a.indexOf(v) === i),
    createdAt: num(raw.createdAt), createdBy: clean(raw.createdBy, 60) || null, revokedAt: num(raw.revokedAt), lastUsedAt: num(raw.lastUsedAt),
    digest: /^[0-9a-f]{64}$/.test(str(raw.digest)) ? raw.digest : null,
  };
}
/** What a page or an agent may see of a key: everything but the digest (never a value — the record holds none). */
function publicKey(k) {
  const r = keyOf(k);
  return r ? { id: r.id, name: r.name, scopes: r.scopes.slice(), createdAt: r.createdAt, createdBy: r.createdBy, revokedAt: r.revokedAt, lastUsedAt: r.lastUsedAt } : null;
}
/** A grant record → its shape (null = not one). */
function grantOf(raw) {
  if (!raw || typeof raw !== 'object' || !KEY_ID_RE.test(str(raw.keyId)) || !SUBJECT_RE.test(str(raw.subject)) || !MODES.includes(raw.mode)) return null;
  const num = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : null);
  return { id: /^ag-[0-9a-f]{12}$/.test(str(raw.id)) ? raw.id : null, keyId: raw.keyId, subject: raw.subject, mode: raw.mode, at: num(raw.at), by: clean(raw.by, 60) || null, spentAt: num(raw.spentAt) };
}
const isSubject = (s) => SUBJECT_RE.test(str(s));
/** The subjects a CALLER is: its own conversation and each Task Group it belongs to. */
const callerSubjects = (conversationId, groupIds = []) => [`session:${conversationId}`, ...(Array.isArray(groupIds) ? groupIds : []).filter(Boolean).map((g) => `group:${g}`)];

/**
 * THE JUDGMENT OF ONE USE (on the hub, before anything runs). `key` = the key named / chosen (null = none), `grants` =
 * every grant of the store, `subject` = the caller (`session:<id>` or `external`), `subjectGroups` = the Task Group ids the
 * caller belongs to (a session), `subjectLive` = the caller's conversation still runs, `vaultState` = the vault's state.
 * → { ok: true, grant, spend } (`spend` = a once-grant this use consumes) | { ok: false, code } — in this order: the vault
 * (everything stops while it is locked), the key, its scope, the caller, the grant.
 */
function useVerdict({ key = null, grants = [], subject = '', subjectGroups = [], subjectLive = true, verb = '', vaultState = 'locked' } = {}) {
  if (vaultState !== 'unlocked') return { ok: false, code: 'vault_locked' };
  const k = keyOf(key);
  if (!k) return { ok: false, code: 'not_granted' };
  if (k.revokedAt) return { ok: false, code: 'key_revoked' };
  if (!scopeOf(verb) || !k.scopes.includes(verb)) return { ok: false, code: 'verb_not_in_scope' };
  const external = subject === 'external';
  if (!external && (!/^session:/.test(str(subject)) || !isSubject(subject))) return { ok: false, code: 'not_granted' };
  if (!external && !subjectLive) return { ok: false, code: 'subject_ended' };
  // an outside caller is judged by `external` grants ONLY; a conversation by its own and its groups' — never the other's
  const mine = external ? ['external'] : callerSubjects(str(subject).slice('session:'.length), subjectGroups);
  const cands = (Array.isArray(grants) ? grants : []).map(grantOf).filter((g) => g && g.keyId === k.id && mine.includes(g.subject));
  if (!cands.length) return { ok: false, code: 'not_granted' };
  const always = cands.find((g) => g.mode === 'always');
  if (always) return { ok: true, grant: always, spend: false };
  const once = cands.find((g) => g.mode === 'once' && !g.spentAt);
  if (once) return { ok: true, grant: once, spend: true };
  return { ok: false, code: 'once_spent' };
}

/**
 * WHICH KEY a use names: `want` = the caller's `--key` (an id or a name; null = let the hub choose). → { ok: true, key, ask }
 * (`ask` = no grant covers the caller yet — the first-use card may ask for this key) | { ok: false, code }.
 * Without `want`: a key that already lets this caller use the verb wins (an `always` grant first, then the oldest key);
 * else the ONE live key whose scope holds the verb is asked for; none ⇒ not_granted; several ⇒ key_ambiguous (`names`).
 */
function pickKey({ keys = [], grants = [], want = null, subject = '', subjectGroups = [], verb = '' } = {}) {
  const all = (Array.isArray(keys) ? keys : []).map(keyOf).filter(Boolean);
  const live = all.filter((k) => !k.revokedAt && k.scopes.includes(verb));
  if (want != null && want !== '') {
    const w = str(want).trim();
    const k = all.find((x) => x.id === w) || all.filter((x) => x.name === w).sort((a, b) => (a.revokedAt ? 1 : 0) - (b.revokedAt ? 1 : 0))[0] || null;
    return k ? { ok: true, key: k, ask: false } : { ok: false, code: 'not_found' };
  }
  const v = (k) => useVerdict({ key: k, grants, subject, subjectGroups, verb, vaultState: 'unlocked' });
  const granted = live.filter((k) => v(k).ok);
  if (granted.length) {
    const always = granted.filter((k) => v(k).grant.mode === 'always');
    const pick = (always.length ? always : granted).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
    return { ok: true, key: pick, ask: false };
  }
  if (live.length === 1) return { ok: true, key: live[0], ask: true };
  if (!live.length) return { ok: false, code: 'not_granted' };
  return { ok: false, code: 'key_ambiguous', names: live.map((k) => k.name).slice(0, 20) };
}

/**
 * A NEW KEY's plan (the engine seals `value` as the vault entry `entry`, writes `record` — which keeps only the digest —
 * and forgets the value). `randomBytes(n)` / `sha256(text)` are injected (this module imports nothing: the browser bundle
 * reads it too). → { ok, record, value, entry } | { ok: false, code: 'bad_args', why }.
 */
function mintPlan({ name, scopes, by = 'user', now = 0, randomBytes, sha256 } = {}) {
  if (typeof randomBytes !== 'function' || typeof sha256 !== 'function') throw new TypeError('mintPlan: randomBytes and sha256 are injected');
  const n = clean(name, NAME_MAX + 1);
  if (!n) return bad('a key needs a name');
  if (n.length > NAME_MAX) return bad(`a key's name is at most ${NAME_MAX} characters`);
  const sc = (Array.isArray(scopes) ? scopes : []).filter((v, i, a) => a.indexOf(v) === i);
  if (!sc.length) return bad('a key needs at least one verb');
  const unknown = sc.find((v) => !VERBS.includes(v));
  if (unknown) return bad(`no such verb "${clean(unknown, 60)}" (one of: ${VERBS.join(', ')})`);
  const id = 'ak-' + Buffer.from(randomBytes(6)).toString('hex');
  const value = VALUE_PREFIX + Buffer.from(randomBytes(32)).toString('base64url');
  const digest = str(sha256(value));
  return { ok: true, value, entry: entryOf(id), record: { id, name: n, scopes: VERBS.filter((v) => sc.includes(v)), createdAt: Number(now) || 0, createdBy: clean(by, 60) || 'user', revokedAt: null, lastUsedAt: null, digest } };
}
const entryOf = (keyId) => `${ENTRY_PREFIX}${keyId}`;
const keyIdOfEntry = (entry) => { const s = str(entry); return s.startsWith(ENTRY_PREFIX) && KEY_ID_RE.test(s.slice(ENTRY_PREFIX.length)) ? s.slice(ENTRY_PREFIX.length) : null; };
/** The spend identity of a key (a billed verb is charged to it — src/server/spend-guard.js, L2). */
const identityOf = (keyId) => `automation:${keyId}`;

/** A call's arguments as the AUDIT keeps them: names and ids only — never a text body (a rename's new name IS a name). */
function argsSummary(verb, args) {
  const a = args && typeof args === 'object' ? args : {};
  const out = {};
  for (const k of ['target', 'task', 'group', 'backend', 'mode', 'model', 'effort', 'permission', 'pool']) if (a[k] != null) out[k] = clean(a[k], 200);
  if (a.name != null) out.name = clean(a.name, 80);
  if (verb === 'conversations.open' && a.cwd != null) out.cwd = clean(a.cwd, 200);
  return out;
}
/** ONE audit line (data/automation-audit.jsonl): {at, key, subject, verb, args, ok, code, by?}. */
function auditLine({ at, keyId = null, subject = '', verb = '', args = null, ok = false, code = null, by = null, ask = null } = {}) {
  return { at: new Date(Number(at) || 0).toISOString(), key: KEY_ID_RE.test(str(keyId)) ? keyId : null, subject: isSubject(subject) ? subject : clean(subject, 80) || null,
    verb: VERBS.includes(verb) ? verb : clean(verb, 60), args: argsSummary(verb, args), ok: !!ok, code: ok ? null : clean(code, 40) || 'failed', ...(by ? { by: clean(by, 60) } : {}), ...(ask ? { ask: clean(ask, 20) } : {}) };
}

module.exports = {
  KEY_ID_RE, VALUE_PREFIX, VALUE_RE, ENTRY_PREFIX, NAME_MAX, SUBJECT_RE, MODES, ASK_TTL_MS, ASK_QUIET_MS, AUDIT_FILE, STORE_FILE,
  SCOPES, VERBS, scopeOf, CODES, keyOf, publicKey, grantOf, isSubject, callerSubjects,
  useVerdict, pickKey, mintPlan, entryOf, keyIdOfEntry, identityOf, argsSummary, auditLine,
};
