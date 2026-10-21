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
 *   · REACH (lane conversations-archive-verb, the owner 2026-10-20 「这些不用 archive 吗」): a verb that names ANOTHER conversation
 *     is judged by ONE rule, `reachVerdict` — the key OPENED it (the store's `opened` rows), a grant of the key names it (the
 *     conversation or one of its Task Groups), or it is the caller itself. The opener's lifecycle (rename / bind / end /
 *     archive / status) covers what it opened, across a hub restart — the fact is persisted, never a Map in memory.
 *   · THE GRANT'S REACH (lane key-instance-scope — the owner 2026-10-20 23:2xZ 「key 应该可以被授权在整个 vibe space 上工作」): a grant
 *     row carries `reach` — 'opened' (the default and the NARROWEST: what the key opened, what a grant names, the caller),
 *     {taskGroups: [ids]} (every conversation of those Task Groups too) or 'instance' (EVERY conversation of this instance,
 *     present and later — the owner's choice, red-tinted wherever it is offered). ONE more row of reachVerdict's table; the
 *     verbs' own refusals (subject_busy / asks_open / already_archived) stay whatever the reach. A missing field reads
 *     'opened'; a damaged one is NO grant at all (fail closed — a bad value never widens a key).
 *   · LIMITS (lane automation-open-limits — the q-048 verify's M2, q-046 §2 「key 的 limits」): WHAT a key's
 *     conversations.open may ask for — `{cwdRoots, accounts, permissionModes, models, modes}`, picked by the owner when
 *     the key is minted, edited in the Vault window (边界…). `openLimitsVerdict` judges the EFFECTIVE open (the folder's
 *     real path, the account / model / permission mode the spawn would use) on the hub, after the grant and BEFORE the
 *     spend authorizer and the spawn. A key minted before limits existed (or a damaged `limits`) reads as a FRESH key —
 *     no folders — so it REFUSES every open until the owner sets its bounds (q-049 M1: fail closed, never unbounded).
 *   · FEEDBACK (lane feedback-handled-verb — the owner 2026-10-20: 「你处理过的 agent 反馈你怎么不进行标记呢？」): the
 *     maintainer conversation the owner granted marks an agent's feedback report handled — the OWNER's own act (PATCH
 *     /api/feedback/:id), through the same store call — naming the release that shipped the fix (`feedback.handled`), and
 *     reads the open reports it acts on (`feedback.list`, a READ). Their doors: src/server/feedback-store.js automationVerbs.
 *   · EDITED AFTER MINTING (lane key-folder-picker-all — the owner 2026-10-21: 「我之前授权给你的 key 似乎没法改变"能做什么"」):
 *     a key's verbs and limits change through `editPlan` — the SAME scope rules as `mintPlan` (`scopesPlan`: ⊆ the table, at
 *     least one) and the same `limitsPlan`; its value and its grants never change. A verb added rides the grants the key
 *     already has (a grant is per key × conversation, not per verb); a verb removed is refused from the next call
 *     (`verb_not_in_scope` — `pickKey` says it by name when the caller's granted keys lack the verb). A folder root covers
 *     its subfolders; `/` (ALL_PATHS) is 「所有路径」 — any folder on this instance, the words say so (`limitsWords`).
 */

const KEY_ID_RE = /^ak-[0-9a-f]{12}$/;
const VALUE_PREFIX = 'vsak_';
const VALUE_RE = /^vsak_[A-Za-z0-9_-]{43}$/;
const ENTRY_PREFIX = 'apikey:';
const NAME_MAX = 60;
const ARG_TEXT_MAX = 120;
const ID_RE = /^[\w.:-]{1,200}$/;          // a conversation / session / task id as the routes name them
const FEEDBACK_ID_RE = /^fb-[0-9a-f]{10}$/;  // a feedback report's id (src/server/feedback-store.js mints them)
const RELEASE_RE = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/;   // a release (2.369.330) — the one that shipped a fix
const NOTE_MAX = 200;                       // feedback.handled's note
const SUBJECT_RE = /^(?:session:[\w.:-]{1,200}|group:[\w.:-]{1,120}|external)$/;
const MODES = Object.freeze(['always', 'once']);
const REACHES = Object.freeze(['opened', 'groups', 'instance']);   // lane key-instance-scope: the KINDS of a grant's reach, narrowest first
const GROUP_ID_RE = /^[\w.:-]{1,120}$/;                            // a Task Group id as the subjects name it (group:<id>)
const REACH_GROUPS_MAX = 50;
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
/** A value that must match ONE shape (an id the store minted, a release number) — refused by name, never trimmed to fit. */
const shapeArg = (v, what, re, words) => {
  if (v == null || v === '') return bad(`${what} is required`);
  const s = str(v).trim();
  return re.test(s) ? { ok: true, value: s } : bad(`${what} must be ${words}`);
};
/** A yes/no argument: true / 'true' / 'yes' / '1' / 'on' ⇒ true; absent / false / 'no' / '0' / 'off' ⇒ none (the verb's default). */
const boolArg = (v, what) => {
  if (v == null || v === '' || v === false) return { ok: true, value: null };
  if (v === true) return { ok: true, value: true };
  const t = str(v).trim().toLowerCase();
  if (['true', 'yes', '1', 'on'].includes(t)) return { ok: true, value: true };
  if (['false', 'no', '0', 'off'].includes(t)) return { ok: true, value: null };
  return bad(`${what} is yes or no`);
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
  // lane conversations-archive-verb (the owner 2026-10-20 「这些不用 archive 吗」): the opener's lifecycle ENDS with the sidebar's
  // 归档 — ends the conversation if it is still live, then archives it exactly as the sidebar does (the ONE user-state write);
  // a running turn ⇒ subject_busy unless `force`; open For-you asks of the target ⇒ asks_open (their ids) unless `resolveAsks`
  Object.freeze({ verb: 'conversations.archive', layer: 'act', billed: false, label: 'Archive a conversation',
    args: (a) => argsOf(a, { target: (v) => idArg(v, 'target'), force: (v) => boolArg(v, 'force'), resolveAsks: (v) => boolArg(v, 'resolveAsks') }) }),
  // lane feedback-handled-verb: the owner's «Mark handled» on an agent's feedback report, naming the release that shipped
  // the fix (+ a note); and the OPEN reports with their ids — a READ (another agent's words: belted at the hub)
  Object.freeze({ verb: 'feedback.handled', layer: 'act', billed: false, label: "Mark an agent's feedback handled",
    args: (a) => argsOf(a, { id: (v) => shapeArg(v, 'id', FEEDBACK_ID_RE, 'a feedback report id (fb- and 10 hex digits — feedback.list names them)'),
      version: (v) => shapeArg(v, 'version', RELEASE_RE, 'the release that shipped the fix (like 2.369.330)'), note: (v) => textArg(v, 'note', { optional: true, max: NOTE_MAX }) }) }),
  Object.freeze({ verb: 'feedback.list', layer: 'read', billed: false, label: "Read the agents' open feedback",
    args: (a) => argsOf(a, {}) }),
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
  // lane automation-open-limits (q-048 verify M2): the open asks for what its key's limits do not allow (one code per field)
  cwd_outside_roots: 403, account_not_allowed: 403, permission_not_allowed: 403, model_not_allowed: 403, mode_not_allowed: 403,
  // lane feedback-handled-verb: the feedback store could not write the change (data/feedback.json) — nothing changed
  write_failed: 503,
  // lane conversations-archive-verb: the target's turn is running (`force` ends it anyway) · the target has open For-you asks
  // (the answer lists their ids; `resolveAsks` closes them first) · the target is already in the sidebar's archived list
  subject_busy: 409, asks_open: 409, already_archived: 409,
});

/** A key record off disk → its shape (null = not a record). Copies NAMED fields only — never a spread. */
function keyOf(raw) {
  if (!raw || typeof raw !== 'object' || !KEY_ID_RE.test(str(raw.id))) return null;
  const num = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : null);
  return {
    id: raw.id, name: clean(raw.name, NAME_MAX) || raw.id, scopes: (Array.isArray(raw.scopes) ? raw.scopes : []).filter((v, i, a) => VERBS.includes(v) && a.indexOf(v) === i),
    createdAt: num(raw.createdAt), createdBy: clean(raw.createdBy, 60) || null, revokedAt: num(raw.revokedAt), lastUsedAt: num(raw.lastUsedAt),
    digest: /^[0-9a-f]{64}$/.test(str(raw.digest)) ? raw.digest : null,
    // lane automation-open-limits + q-049 M1: absent / null / malformed ⇒ a FRESH key's limits (no folders ⇒ every open
    // refused until the owner sets them). A missing field never WIDENS a key — fail closed, like a damaged value.
    limits: limitsOf(raw.limits) || limitsOf(DEFAULT_LIMITS),
  };
}
/** What a page or an agent may see of a key: everything but the digest (never a value — the record holds none). */
function publicKey(k) {
  const r = keyOf(k);
  return r ? { id: r.id, name: r.name, scopes: r.scopes.slice(), createdAt: r.createdAt, createdBy: r.createdBy, revokedAt: r.revokedAt, lastUsedAt: r.lastUsedAt, limits: r.limits } : null;
}
/** A grant's REACH (lane key-instance-scope) → 'opened' | 'instance' | { taskGroups: [ids] } | null (not a reach). Absent /
 *  null ⇒ 'opened', the narrowest (a missing field never widens a grant — q-049 M1's law); anything else unknown ⇒ null. */
function reachOf(raw) {
  if (raw === undefined || raw === null) return 'opened';
  if (raw === 'opened' || raw === 'instance') return raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.taskGroups) && Object.keys(raw).length === 1) {
    const ids = [...new Set(raw.taskGroups.map(str))];
    if (ids.length && ids.length <= REACH_GROUPS_MAX && ids.every((g) => GROUP_ID_RE.test(g))) return { taskGroups: ids };
  }
  return null;
}
/** The KIND of a reach ('opened' | 'groups' | 'instance'); anything unknown reads as the narrowest. */
const reachKind = (r) => (r === 'instance' ? 'instance' : r && typeof r === 'object' && Array.isArray(r.taskGroups) ? 'groups' : 'opened');
/** The WIDEST of several reaches (a caller holding a key by two roads acts by the wider): instance › groups (their union) › opened. */
function widestReach(list) {
  const rs = (Array.isArray(list) ? list : []).map(reachOf).filter(Boolean);
  if (rs.some((r) => r === 'instance')) return 'instance';
  const groups = rs.filter((r) => reachKind(r) === 'groups').flatMap((r) => r.taskGroups).filter((g, i, a) => a.indexOf(g) === i);
  return groups.length ? { taskGroups: groups } : 'opened';
}
/** A grant record → its shape (null = not one). Its `reach` (lane key-instance-scope): absent ⇒ 'opened'; unknown ⇒ NO grant. */
function grantOf(raw) {
  if (!raw || typeof raw !== 'object' || !KEY_ID_RE.test(str(raw.keyId)) || !SUBJECT_RE.test(str(raw.subject)) || !MODES.includes(raw.mode)) return null;
  const reach = reachOf(raw.reach);
  if (reach === null) return null;   // a damaged reach is refused whole — never read as wider (nor quietly as narrower)
  const num = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : null);
  return { id: /^ag-[0-9a-f]{12}$/.test(str(raw.id)) ? raw.id : null, keyId: raw.keyId, subject: raw.subject, mode: raw.mode, at: num(raw.at), by: clean(raw.by, 60) || null, spentAt: num(raw.spentAt), reach };
}
const isSubject = (s) => SUBJECT_RE.test(str(s));
/** The subjects a CALLER is: its own conversation and each Task Group it belongs to. */
const callerSubjects = (conversationId, groupIds = []) => [`session:${conversationId}`, ...(Array.isArray(groupIds) ? groupIds : []).filter(Boolean).map((g) => `group:${g}`)];

/** A conversation a key OPENED (the store's `opened` rows — src/server/automation-engine.js writes one per successful
 *  conversations.open: the webui id at once, the conversation id when the CLI has reported it). null = not a row. */
function openedOf(raw) {
  if (!raw || typeof raw !== 'object' || !KEY_ID_RE.test(str(raw.keyId))) return null;
  const webuiId = ID_RE.test(str(raw.webuiId)) ? raw.webuiId : null;
  const conversationId = ID_RE.test(str(raw.conversationId)) ? raw.conversationId : null;
  if (!webuiId && !conversationId) return null;
  const at = Number(raw.at);
  return { keyId: raw.keyId, webuiId, conversationId, at: Number.isFinite(at) ? at : null };
}
/**
 * THE REACH OF ONE VERB (lane conversations-archive-verb) — may a use of `keyId` by `caller` (a conversation id) touch
 * `target`? ONE rule for rename / bind / end / archive / status / invite (design q-046: a grant is key × conversation, and
 * the OPENER is the natural holder of the lifecycle of what it opened): the target is within reach when
 *   (a) THE KEY OPENED IT — an `opened` row of this key names its webui id or its conversation id, or
 *   (b) a grant of this key names it — the target conversation itself, or one of its Task Groups, or
 *   (c) the target IS the caller, or
 *   (d) THE GRANT'S REACH says so (lane key-instance-scope): `reach` = the reach of the grant this use rides — 'instance'
 *       reaches EVERY conversation; {taskGroups} reaches one in those Task Groups; 'opened' (the default) adds nothing.
 * `target` = { conversationId, webuiId?, groups? }. → { ok: true, by: 'self' | 'opener' | 'grant' | 'instance' | 'groups' }
 * | { ok: false, code, why, reach? } (the refusal names the reach the grant has, and the door that widens it).
 */
function reachVerdict({ keyId = '', caller = '', target = {}, grants = [], opened = [], reach = 'opened' } = {}) {
  const t = target && typeof target === 'object' ? target : {};
  const cid = str(t.conversationId) || null, wid = str(t.webuiId) || null;
  if (!cid && !wid) return { ok: false, code: 'not_found', why: 'no conversation named' };
  if (cid && caller && cid === str(caller)) return { ok: true, by: 'self' };
  const rows = (Array.isArray(opened) ? opened : []).map(openedOf).filter((o) => o && o.keyId === keyId);
  if (rows.some((o) => (cid && o.conversationId && o.conversationId === cid) || (wid && o.webuiId && o.webuiId === wid))) return { ok: true, by: 'opener' };
  const groups = (Array.isArray(t.groups) ? t.groups : []).filter(Boolean).map(String);
  const subjects = new Set([...(cid ? [`session:${cid}`] : []), ...groups.map((g) => `group:${g}`)]);
  if ((Array.isArray(grants) ? grants : []).map(grantOf).some((g) => g && g.keyId === keyId && subjects.has(g.subject))) return { ok: true, by: 'grant' };
  const r = reachOf(reach) || 'opened';   // an unknown reach reads as the narrowest
  if (r === 'instance') return { ok: true, by: 'instance' };
  if (reachKind(r) === 'groups' && groups.some((g) => r.taskGroups.includes(g))) return { ok: true, by: 'groups' };
  const kind = reachKind(r);
  return { ok: false, code: 'not_granted', reach: kind, why: kind === 'groups'
    ? `that conversation is not in the Task Groups this grant reaches (${r.taskGroups.join(', ')}), the key did not open it and is not granted to it — widen the grant's reach on the key's row in the Vault window (整个 VibeSpace), or grant the key to that conversation`
    : 'the key did not open that conversation and is not granted to it (nor to one of its Task Groups) — this grant reaches only what the key opened; widen its reach on the key\'s row in the Vault window (这些岗位的会话 / 整个 VibeSpace), or grant the key to that conversation' };
}

/**
 * THE JUDGMENT OF ONE USE (on the hub, before anything runs). `key` = the key named / chosen (null = none), `grants` =
 * every grant of the store, `subject` = the caller (`session:<id>` or `external`), `subjectGroups` = the Task Group ids the
 * caller belongs to (a session), `subjectLive` = the caller's conversation still runs, `vaultState` = the vault's state.
 * → { ok: true, grant, spend, reach } (`spend` = a once-grant this use consumes; `reach` = the reach this use rides — the
 * widest of the caller's always-grants, else the once-grant's — lane key-instance-scope) | { ok: false, code } — in this
 * order: the vault (everything stops while it is locked), the key, its scope, the caller, the grant.
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
  const always = cands.filter((g) => g.mode === 'always');
  if (always.length) return { ok: true, grant: always[0], spend: false, reach: widestReach(always.map((g) => g.reach)) };
  const once = cands.find((g) => g.mode === 'once' && !g.spentAt);
  if (once) return { ok: true, grant: once, spend: true, reach: once.reach };
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
  if (!live.length) {
    // lane key-folder-picker-all: a verb the owner took off the keys THIS caller holds is refused by name (verb_not_in_scope,
    // the keys named) — never a not_granted that reads as «ask for a grant»
    const held = all.filter((k) => !k.revokedAt && useVerdict({ key: k, grants, subject, subjectGroups, verb: k.scopes[0], vaultState: 'unlocked' }).ok);
    return held.length ? { ok: false, code: 'verb_not_in_scope', names: held.map((k) => k.name).slice(0, 20) } : { ok: false, code: 'not_granted' };
  }
  return { ok: false, code: 'key_ambiguous', names: live.map((k) => k.name).slice(0, 20) };
}

/**
 * A NEW KEY's plan (the engine seals `value` as the vault entry `entry`, writes `record` — which keeps only the digest —
 * and forgets the value). `randomBytes(n)` / `sha256(text)` are injected (this module imports nothing: the browser bundle
 * reads it too). → { ok, record, value, entry } | { ok: false, code: 'bad_args', why }.
 */
function mintPlan({ name, scopes, limits, by = 'user', now = 0, randomBytes, sha256 } = {}) {
  if (typeof randomBytes !== 'function' || typeof sha256 !== 'function') throw new TypeError('mintPlan: randomBytes and sha256 are injected');
  const n = clean(name, NAME_MAX + 1);
  if (!n) return bad('a key needs a name');
  if (n.length > NAME_MAX) return bad(`a key's name is at most ${NAME_MAX} characters`);
  const sc = scopesPlan(scopes);
  if (!sc.ok) return sc;
  const lim = limitsPlan(limits === undefined ? {} : limits, sc.scopes);   // a fresh key: the owner picks (no folder, no account until he does)
  if (!lim.ok) return lim;
  const id = 'ak-' + Buffer.from(randomBytes(6)).toString('hex');
  const value = VALUE_PREFIX + Buffer.from(randomBytes(32)).toString('base64url');
  const digest = str(sha256(value));
  return { ok: true, value, entry: entryOf(id), record: { id, name: n, scopes: sc.scopes, createdAt: Number(now) || 0, createdBy: clean(by, 60) || 'user', revokedAt: null, lastUsedAt: null, digest, limits: lim.limits } };
}
/** THE SCOPE RULE of a mint AND an edit: the verbs a key holds are ⊆ the closed table, at least one, each once → { ok,
 *  scopes } in the table's order | bad_args naming the verb (never dropped — what is stored is what the owner picked). */
function scopesPlan(scopes) {
  const sc = (Array.isArray(scopes) ? scopes : []).filter((v, i, a) => a.indexOf(v) === i);
  if (!sc.length) return bad('a key needs at least one verb');
  const unknown = sc.find((v) => !VERBS.includes(v));
  if (unknown) return bad(`no such verb "${clean(unknown, 60)}" (one of: ${VERBS.join(', ')})`);
  return { ok: true, scopes: VERBS.filter((v) => sc.includes(v)) };
}
/**
 * 编辑… — A KEY EDITED AFTER MINTING (lane key-folder-picker-all): `scopes` / `limits` undefined = the key's own. The SAME
 * rules as the mint (scopesPlan + limitsPlan over the new scopes: a key that now opens conversations names its folders);
 * the value, the digest and the grants are not the plan's to touch. → { ok, scopes, limits, added, removed } (added /
 * removed in the table's order) | bad_args.
 */
function editPlan(key, { scopes, limits } = {}) {
  const k = keyOf(key);
  if (!k) return bad('not a key');
  const sc = scopes === undefined ? { ok: true, scopes: k.scopes } : scopesPlan(scopes);
  if (!sc.ok) return sc;
  const lim = limitsPlan(limits === undefined ? k.limits : limits, sc.scopes);
  if (!lim.ok) return lim;
  return { ok: true, scopes: sc.scopes, limits: lim.limits, added: sc.scopes.filter((v) => !k.scopes.includes(v)), removed: k.scopes.filter((v) => !sc.scopes.includes(v)) };
}
/** The audit line's words for an edit of the verbs: «scopes changed by the owner: +feedback.handled +feedback.list -x». */
const scopesChangeWords = ({ added = [], removed = [] } = {}) => `scopes changed by the owner: ${[...added.map((v) => `+${v}`), ...removed.map((v) => `-${v}`)].join(' ')}`.trim();
const entryOf = (keyId) => `${ENTRY_PREFIX}${keyId}`;
const keyIdOfEntry = (entry) => { const s = str(entry); return s.startsWith(ENTRY_PREFIX) && KEY_ID_RE.test(s.slice(ENTRY_PREFIX.length)) ? s.slice(ENTRY_PREFIX.length) : null; };
/** The spend identity of a key (a billed verb is charged to it — src/server/spend-guard.js, L2). */
const identityOf = (keyId) => `automation:${keyId}`;

// ── LIMITS (lane automation-open-limits — the q-048 verify's M2: an open key had NO bounds — any cwd incl. `/` and an
// unnormalized `/tmp/../etc`, any account, any model, bypassPermissions, terminal — the grant was the only fence) ──
const LIMIT_FIELDS = Object.freeze(['cwdRoots', 'accounts', 'permissionModes', 'models', 'modes']);
/** One refusal code per field (403 at the door — CODES below). */
const LIMIT_CODES = Object.freeze({ cwdRoots: 'cwd_outside_roots', accounts: 'account_not_allowed', permissionModes: 'permission_not_allowed', models: 'model_not_allowed', modes: 'mode_not_allowed' });
const OPEN_MODES = Object.freeze(['chat', 'terminal']);
const HARNESS_DEFAULT = 'default';     // a permission mode / model the open did not name: the harness's own choice (no flag)
const SUBSCRIPTION = 'subscription';   // the CLI's own login — the account an open bills when it names none and no default is set
const ROOTS_MAX = 20, LIMIT_LIST_MAX = 50, PATH_MAX = 4096;
const ACCOUNT_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;            // an account / pool id (src/conversation-spec.js)
const LIMIT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:\-[\]]{0,79}$/;      // a model / permission-mode id (conversation-spec.js MODEL_RE)
const PATH_BAD_RE = /[\u0000-\u001f\u007f\u2028\u2029]/;
/** 「所有路径」 (lane key-folder-picker-all): the root `/` — any folder on this instance, the owner's home included. Not a new
 *  verdict: `/` was always a valid root (a root covers its subfolders); the window writes exactly `['/']` for it. */
const ALL_PATHS = '/';
const allPaths = (limits) => { const L = limitsOf(limits); return !!L && L.cwdRoots.includes(ALL_PATHS); };
/** A FRESH key's limits: no folder and no account until the owner picks them; the harness's own permission mode; any
 *  model; chat only. */
const DEFAULT_LIMITS = Object.freeze({ cwdRoots: Object.freeze([]), accounts: Object.freeze([]), permissionModes: Object.freeze([HARNESS_DEFAULT]), models: 'any', modes: Object.freeze(['chat']) });
/** An absolute path, lexically normalized (`.` / `..` / `//` folded — `/tmp/../etc` is `/etc`); null = not absolute. */
function normPath(p) {
  const s = str(p);
  if (!s.startsWith('/') || s.length > PATH_MAX || PATH_BAD_RE.test(s)) return null;
  const out = [];
  for (const part of s.split('/')) { if (!part || part === '.') continue; if (part === '..') out.pop(); else out.push(part); }
  return '/' + out.join('/');
}
/** `p` is `root` or below it (both normalized). */
const within = (p, root) => root === '/' || p === root || p.startsWith(root + '/');
/** A record's limits → their shape (named fields only; a malformed entry is dropped) | null (not an object). */
function limitsOf(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const ids = (v, re) => (Array.isArray(v) ? v : []).map(str).filter((x, i, a) => re.test(x) && a.indexOf(x) === i).slice(0, LIMIT_LIST_MAX);
  return {
    cwdRoots: (Array.isArray(raw.cwdRoots) ? raw.cwdRoots : []).map(normPath).filter((x, i, a) => x && a.indexOf(x) === i).slice(0, ROOTS_MAX),
    accounts: raw.accounts === 'any' ? 'any' : ids(raw.accounts, ACCOUNT_RE),
    permissionModes: ids(raw.permissionModes, LIMIT_ID_RE),
    models: raw.models === 'any' ? 'any' : ids(raw.models, LIMIT_ID_RE),
    modes: OPEN_MODES.filter((m) => Array.isArray(raw.modes) && raw.modes.includes(m)),
  };
}
/**
 * THE OWNER'S PICK (the mint and the 边界… doors) → { ok, limits } | bad_args naming the field. Strict: an unknown field or a
 * malformed entry is refused by name (never dropped — what is stored is what he picked); a field left out takes the fresh
 * key's default. A key that holds conversations.open must name at least one folder, its accounts (or any), a permission
 * mode, its models (or any) and a mode — a key that can open nothing is refused at the door, not discovered at the first call.
 */
function limitsPlan(raw, scopes = []) {
  const a = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!a) return bad('the limits are an object {cwdRoots, accounts, permissionModes, models, modes}');
  for (const k of Object.keys(a)) if (!LIMIT_FIELDS.includes(k)) return bad(`unknown limit "${clean(k, 40)}" (one of: ${LIMIT_FIELDS.join(', ')})`);
  const v = { ...DEFAULT_LIMITS, ...Object.fromEntries(Object.entries(a).filter(([, x]) => x !== undefined)) };
  const listOf = (k, re, what, { any = false, max = LIMIT_LIST_MAX } = {}) => {
    if (any && v[k] === 'any') return null;
    if (!Array.isArray(v[k])) return bad(`${k} is a list${any ? ' or "any"' : ''}`);
    if (v[k].length > max) return bad(`${k} holds at most ${max}`);
    const badOne = v[k].find((x) => typeof x !== 'string' || !re.test(x));
    return badOne === undefined ? null : bad(`${k}: "${clean(badOne, 80)}" is not ${what}`);
  };
  const e = (() => {
    if (!Array.isArray(v.cwdRoots)) return bad('cwdRoots is a list of absolute folders');
    if (v.cwdRoots.length > ROOTS_MAX) return bad(`cwdRoots holds at most ${ROOTS_MAX}`);
    const badRoot = v.cwdRoots.find((r) => normPath(r) === null);
    if (badRoot !== undefined) return bad(`cwdRoots: "${clean(badRoot, 80)}" is not an absolute folder`);
    return listOf('accounts', ACCOUNT_RE, 'an account or pool id', { any: true })
      || listOf('permissionModes', LIMIT_ID_RE, 'a permission mode')
      || listOf('models', LIMIT_ID_RE, 'a model id', { any: true })
      || listOf('modes', /^(?:chat|terminal)$/, 'chat or terminal');
  })();
  if (e) return e;
  const lim = limitsOf(v);
  if ((Array.isArray(scopes) ? scopes : []).includes('conversations.open')) {
    if (!lim.cwdRoots.length) return bad('a key that opens conversations names at least one folder they may open in');
    if (lim.accounts !== 'any' && !lim.accounts.length) return bad('a key that opens conversations names the accounts they may use (or any)');
    if (!lim.permissionModes.length) return bad(`a key that opens conversations names at least one permission mode (${HARNESS_DEFAULT} = the harness's own)`);
    if (lim.models !== 'any' && !lim.models.length) return bad('a key that opens conversations names its models (or any)');
    if (!lim.modes.length) return bad('a key that opens conversations names chat, terminal or both');
  }
  return { ok: true, limits: lim };
}
/**
 * ONE LIMIT'S SET IN WORDS (lane vault-key-row-compact — the owner 2026-10-21 05:4xZ on the key row: 「授权很多的时候，这个界面需
 * 要优化一下」; its 权限模式 line named all eleven modes while 账号 / 模型 said 任何 for the same situation). `value` = the stored
 * pick (a list, or 'any'); `table` = every choice there is NOW (the harness tables' permission modes, the roster's
 * accounts, the tables' models; the modes are OPEN_MODES), null when the caller cannot say. → { any, names, n, count }:
 * 'any' — or a list holding every row of a table of two or more — is ANY (an unrestricted set is never enumerated); up to
 * NAMED_MAX picks are NAMED; more are COUNTED (the window's 「N 种」, the names in its title). Names only — the caller words
 * each one; `names` is the stored list (empty for a literal 'any').
 */
const NAMED_MAX = 3;
function limitSetView(value, table = null) {
  const list = Array.isArray(value) ? value.map(str).filter(Boolean) : [];
  const rows = Array.isArray(table) ? [...new Set(table.map(str).filter(Boolean))] : null;
  const any = value === 'any' || (!!rows && rows.length > 1 && rows.every((x) => list.includes(x)));   // a one-row table is NAMED (one name says more than «any»)
  return { any, names: list, n: list.length, count: !any && list.length > NAMED_MAX };
}
/** The limits in words (the CLI's refusal, the audit view): names only — an unrestricted set says «any» (lane
 *  vault-key-row-compact: `tables` = {permissionModes, accounts, models} — the choices there are now, when the caller has
 *  them; the modes' table is OPEN_MODES). An agent reads the names of a narrower set (it must stay inside them). */
function limitsWords(limits, tables = null) {
  const L = limitsOf(limits);
  if (!L) return 'no bounds set — every open is refused until you set them in the Vault window';
  const tb = tables && typeof tables === 'object' ? tables : {};
  const said = (v, table) => { const w = limitSetView(v, table); return w.any ? 'any' : w.names.join(', ') || 'none'; };
  // lane key-folder-picker-all: `/` is said as all paths, never a bare slash; a root covers its subfolders and says so
  const folders = L.cwdRoots.includes(ALL_PATHS) ? 'all paths' : L.cwdRoots.length ? `${L.cwdRoots.join(', ')} (with subfolders)` : 'none';
  return `folders ${folders} · accounts ${said(L.accounts, tb.accounts)} · permission modes ${said(L.permissionModes, tb.permissionModes)} · models ${said(L.models, tb.models)} · modes ${said(L.modes, OPEN_MODES)}`;
}
/**
 * THE JUDGMENT OF AN OPEN AGAINST ITS KEY'S LIMITS (on the hub — src/server/automation-engine.js use(): after the grant,
 * BEFORE the grant is spent, the spend authorizer runs and anything spawns). `spec` = the EFFECTIVE open the hub resolved
 * — {mode, cwd, accountId, model, permissionMode}, a value the caller did not name being the one the spawn would use (the
 * hub's default account else `subscription`, the instance's default model else `default`, the harness's own permission
 * mode `default`, chat). `realpath(p)` is INJECTED (this module imports nothing): the folder's real path, null = missing.
 * → { ok: true, cwd } (`cwd` = the REAL folder — the spawn uses it, so the judged path is the opened one)
 * | { ok: false, code, field, why } — one code per field, in the
 * order folders › accounts › permission modes › models › modes. A folder is inside a root only by its REAL path: `..`
 * and a symlink out of the roots are refused `cwd_outside_roots` like any other folder outside them.
 */
function openLimitsVerdict(limits, spec = {}, { realpath = null } = {}) {
  const s = spec && typeof spec === 'object' ? spec : {};
  // q-049 M1: null / undefined / malformed limits ⇒ a FRESH key's (no folders) — every open is refused, never unbounded
  const L = limitsOf(limits) || limitsOf(DEFAULT_LIMITS);
  const no = (field, why) => ({ ok: false, code: LIMIT_CODES[field], field, why });
  const real = (p) => {
    if (typeof realpath !== 'function') return p;
    try { const r = realpath(p); return typeof r === 'string' ? normPath(r) : null; } catch { return null; }
  };
  if (!normPath(s.cwd)) return no('cwdRoots', 'a cwd is an absolute folder');
  // the path AS ASKED goes to realpath (the kernel's own reading: a symlink before a `..` is followed first); without an
  // injected realpath (the browser bundle) the lexical fold stands in
  const cwd = typeof realpath === 'function' ? real(str(s.cwd)) : normPath(s.cwd);
  const named = (words) => (words.length ? words.join(', ') : 'none');
  if (!cwd) return no('cwdRoots', `"${clean(s.cwd, 200)}" does not exist (a folder's real path decides where it is)`);
  const roots = L.cwdRoots.map(real).filter(Boolean);
  if (!roots.some((r) => within(cwd, r))) return no('cwdRoots', `"${clean(s.cwd, 200)}"${cwd !== str(s.cwd) ? ` (really ${cwd})` : ''} is outside this key's folders (${named(L.cwdRoots)})`);
  const account = str(s.accountId) || SUBSCRIPTION;
  if (L.accounts !== 'any' && !L.accounts.includes(account)) return no('accounts', `the account ${account} is not one of this key's (${named(L.accounts)})`);
  const perm = str(s.permissionMode) || HARNESS_DEFAULT;
  if (!L.permissionModes.includes(perm)) return no('permissionModes', `the permission mode ${perm} is not one of this key's (${named(L.permissionModes)})`);
  const model = str(s.model) || HARNESS_DEFAULT;
  if (L.models !== 'any' && !L.models.includes(model)) return no('models', `the model ${model} is not one of this key's (${named(L.models)})`);
  const mode = str(s.mode) || 'chat';
  if (!L.modes.includes(mode)) return no('modes', `the mode ${mode} is not one of this key's (${named(L.modes)})`);
  return { ok: true, cwd };
}

/**
 * q-049 M2 — `default` IS NOT A CAP (lane automation-open-permission-resolve). A key listing `default` lets an open name no
 * permission mode, and the CLI's own three-layer config then decides what runs — bypassPermissions included. So the hub
 * RESOLVES it (src/server/permission-rules.js resolveDefaultMode over the REAL folder the folder judge passed — the project
 * layer follows the cwd, hence AFTER openLimitsVerdict) and judges the RESOLVED mode against the key's list. `resolved` =
 * {ok, mode, layer: {short, file} | null, disabledBy, cwd} (PURE src/permission-rules.js claudeDefaultMode); null or
 * `ok: false` = nothing resolved (no resolver wired, another harness): the harness's own `default` stands, as
 * openLimitsVerdict already judged it. → { ok: true, mode, resolved } | { ok: false, code: 'permission_not_allowed', field:
 * 'permissionModes', why, resolved } — the why names the resolved mode and the layer that set it:
 * «the CLI's own setting (project, /x/.claude/settings.json) is bypassPermissions; this key allows default, acceptEdits».
 */
function permissionResolvedVerdict(limits, resolved) {
  const L = limitsOf(limits) || limitsOf(DEFAULT_LIMITS);
  const r = resolved && typeof resolved === 'object' && resolved.ok === true ? resolved : null;
  if (!r) return { ok: true, mode: HARNESS_DEFAULT, resolved: null };
  const mode = str(r.mode).trim() || HARNESS_DEFAULT;
  if (L.permissionModes.includes(mode)) return { ok: true, mode, resolved: r };
  const layer = r.layer && typeof r.layer === 'object' ? r.layer : null;
  const where = layer ? `${clean(layer.short || layer.id, 20).toLowerCase() || 'a layer'}, ${clean(layer.file, 300) || clean(r.cwd, 300) || 'no file'}` : 'built-in';
  return { ok: false, code: LIMIT_CODES.permissionModes, field: 'permissionModes', why: `the CLI's own setting (${where}) is ${clean(mode, 40)}; this key allows ${L.permissionModes.join(', ')}`, resolved: r };
}

// ── THE KEY ROW, BOUNDED (lane vault-key-row-compact — the owner 2026-10-21: two grants already made a wall of text; twelve
// would be a screen tall). The row's head counts (「N 个动作」 · 「授权给 N 个」), the verbs open grouped by FAMILY, the grants
// open as a bounded list (groups, then running conversations, then ended ones — each by name) with ONE cleanup door.
/** The verbs' FAMILIES — the closed table's own groups, by a verb's first word (the verbs popover's heads). */
const FAMILIES = Object.freeze([
  Object.freeze({ id: 'conversations', label: 'Conversations' }),
  Object.freeze({ id: 'groups', label: 'Agent groups' }),
  Object.freeze({ id: 'feedback', label: 'Feedback' }),
]);
const familyOf = (verb) => { const f = str(verb).split('.')[0]; return FAMILIES.some((x) => x.id === f) ? f : 'other'; };
/** A key's verbs grouped by family, in the table's order → [{ id, label, verbs: [verb…] }] (a family it holds none of is absent). */
function verbFamilies(scopes) {
  const held = SCOPES.map((s) => s.verb).filter((v) => (Array.isArray(scopes) ? scopes : []).includes(v));
  return [...FAMILIES, { id: 'other', label: 'Other' }].map((f) => ({ id: f.id, label: f.label, verbs: held.filter((v) => familyOf(v) === f.id) })).filter((f) => f.verbs.length);
}
/** A grant is ENDED when it names ONE conversation (`session:<id>`) that is not running here — `live` = the running
 *  conversations' subjects (a Set or a list). A use needs that conversation's own live session token, so the grant can
 *  never be used while the conversation is gone; a Task Group's grant never ends here. */
function grantEnded(g, live) {
  const s = str(g && g.subject);
  if (!/^session:/.test(s)) return false;
  return !(live instanceof Set ? live.has(s) : Array.isArray(live) && live.includes(s));
}
/** The grants list's ORDER: Task Groups, then running conversations, then ended ones — each by its name (the caller's
 *  words, else the subject). `rows` = [{ subject, name?, ended? }] → a new sorted list. */
function grantOrder(rows) {
  const rank = (r) => (/^group:/.test(str(r && r.subject)) ? 0 : r && r.ended ? 2 : 1);
  const nameOf = (r) => str((r && r.name) || (r && r.subject));
  return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => rank(a) - rank(b) || nameOf(a).localeCompare(nameOf(b)) || str(a.subject).localeCompare(str(b.subject)));
}
/** The audit note of 清理已结束的授权: what went, by subject — within the audit's 300 characters («+N more» past them). */
function pruneWords(subjects) {
  const list = (Array.isArray(subjects) ? subjects : []).map(str);
  const head = `took back ${list.length} grant${list.length === 1 ? '' : 's'} to ended conversations: `;
  let out = head;
  for (let i = 0; i < list.length; i++) {
    const more = list.length - i - 1;
    const next = `${i ? ', ' : ''}${list[i]}`;
    if ((out + next).length + (more ? ` +${more} more`.length : 0) > 300) return `${out} +${list.length - i} more`;
    out += next;
  }
  return out;
}

/** A call's arguments as the AUDIT keeps them: names and ids only — never a text body (a rename's new name IS a name). */
function argsSummary(verb, args) {
  const a = args && typeof args === 'object' ? args : {};
  const out = {};
  for (const k of ['target', 'task', 'group', 'backend', 'mode', 'model', 'effort', 'permission', 'pool', 'id', 'version', 'force', 'resolveAsks', 'reach']) if (a[k] != null) out[k] = clean(a[k], 200);   // a feedback note is a text body: never kept; `reach`: an owner's key.grant / key.reach line (lane key-instance-scope)
  if (a.name != null) out.name = clean(a.name, 80);
  if (verb === 'conversations.open' && a.cwd != null) out.cwd = clean(a.cwd, 200);
  return out;
}
/** ONE audit line (data/automation-audit.jsonl): {at, key, subject, verb, args, ok, code, by?, ask?, note?}. */
function auditLine({ at, keyId = null, subject = '', verb = '', args = null, ok = false, code = null, by = null, ask = null, note = null } = {}) {
  return { at: new Date(Number(at) || 0).toISOString(), key: KEY_ID_RE.test(str(keyId)) ? keyId : null, subject: isSubject(subject) ? subject : clean(subject, 80) || null,
    verb: VERBS.includes(verb) ? verb : clean(verb, 60), args: argsSummary(verb, args), ok: !!ok, code: ok ? null : clean(code, 40) || 'failed', ...(by ? { by: clean(by, 60) } : {}), ...(ask ? { ask: clean(ask, 20) } : {}), ...(note ? { note: clean(note, 300) } : {}) };   // note: an owner's edit in words (key.scopes)
}

module.exports = {
  KEY_ID_RE, VALUE_PREFIX, VALUE_RE, ENTRY_PREFIX, NAME_MAX, SUBJECT_RE, MODES, REACHES, ASK_TTL_MS, ASK_QUIET_MS, AUDIT_FILE, STORE_FILE, FEEDBACK_ID_RE, RELEASE_RE, NOTE_MAX,
  SCOPES, VERBS, scopeOf, CODES, keyOf, publicKey, grantOf, reachOf, reachKind, widestReach, isSubject, callerSubjects, openedOf, reachVerdict,
  useVerdict, pickKey, mintPlan, scopesPlan, editPlan, scopesChangeWords, entryOf, keyIdOfEntry, identityOf, argsSummary, auditLine,
  LIMIT_FIELDS, LIMIT_CODES, OPEN_MODES, HARNESS_DEFAULT, SUBSCRIPTION, DEFAULT_LIMITS, ALL_PATHS, allPaths, normPath, limitsOf, limitsPlan, limitsWords, openLimitsVerdict, permissionResolvedVerdict,
  NAMED_MAX, limitSetView, FAMILIES, familyOf, verbFamilies, grantEnded, grantOrder, pruneWords,   // lane vault-key-row-compact
};
