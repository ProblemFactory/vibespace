'use strict';
/**
 * AGENT REACH — PURE (imports only src/msg-acl.js, PURE → PURE, for the
 * ordering discipline and the widen-only law; nothing else).
 * docs/design-communication-panel.zh.md §8, §11, decision 16.
 *
 *  level : 'hidden' < 'requestable' < 'visible'
 *  grant : { principal:{kind:'agent'|'group'|'everyone', id}, scope:{kind:'conversation'|'adapter', id},
 *            level, origin:'user'|'access'|'request' (| legacy 'assignment'), at, by }
 *
 *  · EVERYTHING DEFAULTS TO `hidden`. There is no "inherit from the platform":
 *    a platform's own ACL says what a USER may see, never what an AGENT may.
 *  · An agent INHERITS its groups and may be WIDENED individually; the
 *    effective level is the MAX over every applicable grant. Narrowing one
 *    member below its group is impossible BY CONSTRUCTION — the same rule as
 *    msg-acl's override, for the same reason: a widen-only model can be
 *    reasoned about, a mixed one cannot.
 *  · `requestable` is the middle: the agent may file a request; approving it
 *    writes EXACTLY ONE `visible` grant for (that principal, that scope) and
 *    touches no group default.
 *  · `hidden` is total: not listed, not searchable, not addressable — an id
 *    obtained elsewhere gets the SAME uniform error as a nonexistent one.
 *  · `origin` is the ONE reason the machine ever deletes a grant: removing
 *    an ACCESS row (R4, 2026-09-27 — the owner's "Grant access…", the first
 *    of the two operations) removes only its own `access` row; a request
 *    approval is distinguishable from a hand-written grant; the panel can
 *    say WHY a principal sees something. `assignment` is the pre-R4 name of
 *    `access` — still honoured as a row, renamed by the migration.
 *
 *  · ALL AGENTS (lane everyone-principal, 2026-10-02): `{kind:'everyone', id:'*'}`
 *    is a principal like any other — ONE row per (everyone, scope, origin),
 *    applying to EVERY agent conversation, now and later. It joins the MAX:
 *    an agent's own row (or its group's) never narrows it below All, and
 *    removing the All row leaves every specific row exactly as it was (they
 *    are separate rows, never folded into it). `via:'everyone'` names it.
 *
 *  THE BUILT-IN AGENTS ADAPTER answers reach with msg-acl, not with this
 *  module (§12.3 — that question already has an answer inside); `fromMsgLevel`
 *  is the ONE crosswalk from that ladder onto this one.
 */
const msgAcl = require('./msg-acl.js');

const LEVELS = Object.freeze(['hidden', 'requestable', 'visible']);
const RANK = Object.freeze({ hidden: 0, requestable: 1, visible: 2 });
const GRANT_ORIGINS = Object.freeze(['user', 'access', 'request', 'assignment']);
const PRINCIPAL_KINDS = Object.freeze(['agent', 'group', 'everyone']);
/** THE everyone principal's ONE id (the picker's `EVERYONE_ID`; every list model spells it so). */
const EVERYONE_ID = '*';
const SCOPE_KINDS = Object.freeze(['conversation', 'adapter']);
// The two ladders share a SHAPE (three ranked levels, MAX-combined, widen
// only); asserting it at load is what keeps the crosswalk below honest.
if (msgAcl.LEVELS.length !== 3 || !msgAcl.RANK || msgAcl.RANK[msgAcl.LEVELS[2]] !== 2) throw new Error('channel-acl: msg-acl no longer has the three-rung ladder this module mirrors');

/** THE uniform not-found: a hidden conversation and a nonexistent one give
 *  byte-identical answers (no existence oracle). */
const NOT_FOUND_TEXT = 'no such conversation (not found, or not visible to you) — `vibespace-channels list` shows your reach';
function notFound() { return { ok: false, code: 'not-found', error: NOT_FOUND_TEXT }; }

const normLevel = (v) => (RANK[v] !== undefined ? v : 'hidden');
const canSee = (lv) => RANK[normLevel(lv)] >= RANK.visible;
const canRequest = (lv) => normLevel(lv) === 'requestable';
/** Widen-only combine (msg-acl's `bump`, spelled once here). */
const widen = (best, lv) => (RANK[normLevel(lv)] > RANK[normLevel(best)] ? normLevel(lv) : normLevel(best));

/** msg-acl's answer about an AGENT CONVERSATION, on this ladder. `visible`
 *  and `messageable` both mean "may see"; whether anything may be SENT is a
 *  separate axis (assignment authority × convCaps), never a reach level. */
function fromMsgLevel(msgLevel) {
  return msgAcl.canSee(msgLevel) ? 'visible' : 'hidden';
}

/** A stable id for one (principal, scope, origin) row — the unit of add/remove. */
function grantId(g) {
  return `${g.principal.kind}:${g.principal.id}|${g.scope.kind}:${g.scope.id}|${g.origin}`;
}

function validateGrant(input = {}) {
  const g = input && typeof input === 'object' ? input : {};
  const p = g.principal && typeof g.principal === 'object' ? g.principal : null;
  if (!p || !PRINCIPAL_KINDS.includes(p.kind)) return { ok: false, error: `principal.kind must be ${PRINCIPAL_KINDS.join('|')}` };
  // the everyone principal has ONE id: whatever the caller sent, it is stored as '*'
  const pid = p.kind === 'everyone' ? EVERYONE_ID : String(p.id || '').trim();
  if (!pid) return { ok: false, error: 'principal.id is required' };
  const s = g.scope && typeof g.scope === 'object' ? g.scope : null;
  if (!s || !SCOPE_KINDS.includes(s.kind)) return { ok: false, error: `scope.kind must be ${SCOPE_KINDS.join('|')}` };
  const sid = String(s.id || '').trim();
  if (!sid) return { ok: false, error: 'scope.id is required' };
  if (!LEVELS.includes(g.level)) return { ok: false, error: `level must be ${LEVELS.join('|')}` };
  if (!GRANT_ORIGINS.includes(g.origin)) return { ok: false, error: `origin must be ${GRANT_ORIGINS.join('|')} — every grant says who wrote it` };
  const grant = {
    principal: { kind: p.kind, id: pid.slice(0, 256), name: p.kind === 'everyone' ? null : (p.name ? String(p.name).slice(0, 200) : null) },
    scope: { kind: s.kind, id: sid.slice(0, 512) },
    level: g.level, origin: g.origin,
    at: Number.isFinite(Number(g.at)) ? Number(g.at) : null,
    by: g.by ? String(g.by).slice(0, 64) : null,
  };
  return { ok: true, grant, id: grantId(grant) };
}

/** Does a grant name THIS principal (itself, one of its groups, or every agent)? */
function principalApplies(ctx, grant) {
  const p = grant && grant.principal;
  if (!p) return false;
  if (p.kind === 'everyone') return !!ctx && ctx.kind === 'agent' && !!ctx.id;
  if (p.kind === 'agent') return !!ctx && ctx.kind === 'agent' && ctx.id === p.id;
  if (p.kind === 'group') return !!ctx && Array.isArray(ctx.groups) && ctx.groups.includes(p.id);
  return false;
}
/** Does a grant's scope cover THIS target (`{key, adapterId}`)? */
function scopeApplies(scope, target) {
  if (!scope || !target) return false;
  if (scope.kind === 'conversation') return scope.id === target.key;
  if (scope.kind === 'adapter') return scope.id === target.adapterId;
  return false;
}

/**
 * THE accessor. MAX over every applicable grant; `via` says whether the
 * winning row named the agent, its group, or nothing (the default).
 *  @param ctx    {kind:'agent', id, groups:[gid…]}
 *  @param target {key:'adapterId/convId', adapterId}
 */
function effective(ctx, target, grants) {
  let level = 'hidden', via = 'default', winner = null;
  for (const g of Array.isArray(grants) ? grants : []) {
    if (!g || !principalApplies(ctx, g) || !scopeApplies(g.scope, target)) continue;
    const lv = normLevel(g.level);
    // widen only: a row can raise the answer, never lower it
    if (winner === null || RANK[lv] > RANK[level]) { level = widen(level, lv); via = g.principal.kind === 'agent' ? 'agent' : g.principal.kind === 'everyone' ? 'everyone' : 'group'; winner = g; }
  }
  return { level, via, grantId: winner ? grantId(winner) : null };
}

/** Add or replace the ONE row for (principal, scope, origin); other origins untouched. */
function applyGrant(grants, grant) {
  const v = validateGrant(grant);
  if (!v.ok) throw new Error(`channel-acl.applyGrant: ${v.error}`);
  const rest = (Array.isArray(grants) ? grants : []).filter((g) => g && grantId(g) !== v.id);
  return [...rest, v.grant];
}
/** Remove the ONE row for (principal, scope, origin). A row of another origin
 *  on the same pair is a DIFFERENT row and stays. */
function removeGrant(grants, { principal, scope, origin }) {
  const id = grantId({ principal, scope, origin });
  return (Array.isArray(grants) ? grants : []).filter((g) => g && grantId(g) !== id);
}
/** Approve a request: EXACTLY ONE `visible` grant with origin `request`. */
function approveRequest(grants, { principal, scope, at, by = 'user' }) {
  const grant = { principal, scope, level: 'visible', origin: 'request', at, by };
  return { grants: applyGrant(grants, grant), grant: validateGrant(grant).grant };
}

/** THE ACCOUNT GRANT an ACCESS row on the whole account implies (§7.3, R4):
 *  ONE `scope:{kind:'adapter', id:<adapterId>}` row PER PRINCIPAL, origin
 *  `access` — the adapter id IS the account id, so two accounts of one kind
 *  never mix, and removing that principal's access removes exactly its row
 *  (`removeGrant` by principal + origin). */
function accountGrant({ principal, adapterId, at = null, by = 'user' } = {}) {
  const v = validateGrant({ principal, scope: { kind: 'adapter', id: adapterId }, level: 'visible', origin: 'access', at, by });
  if (!v.ok) throw new Error(`channel-acl.accountGrant: ${v.error}`);
  return v.grant;
}
/** THE GRANT a rule's ACCESS row implies on ONE matching conversation —
 *  DERIVED at read time and never stored (so editing or removing the rule
 *  takes effect at once, with no rows to clean up); it names its pattern. */
function patternGrant({ principal, key, patternId }) {
  const v = validateGrant({ principal, scope: { kind: 'conversation', id: key }, level: 'visible', origin: 'access' });
  if (!v.ok) throw new Error(`channel-acl.patternGrant: ${v.error}`);
  return { ...v.grant, pattern: String(patternId || '') || null, derived: true };
}
/** EVERY grant that applies to ONE conversation, from its three homes: the
 *  entry's own rows, the account-scope rows, and the derived pattern rows.
 *  `effective()` MAXes over the result (widen only) — nothing else changes. */
function grantsForConversation(target, { entries = [], accountGrants = [], patternGrants = [] } = {}) {
  const out = [];
  for (const g of [...(entries || []), ...(accountGrants || []), ...(patternGrants || [])]) if (g && scopeApplies(g.scope, target)) out.push(g);
  return out;
}

/** The rows that apply to ONE target, for the panel ("why does X see this"). */
function grantsFor(target, grants) {
  return (Array.isArray(grants) ? grants : []).filter((g) => g && scopeApplies(g.scope, target)).map((g) => ({ ...g, id: grantId(g) }));
}

/**
 * THE DIRECTORY (lane channel-agent-watch W2 — the owner, 2026-10-01: "如果agent没权限他怎么知道申请啥？"). Per ACCOUNT,
 * may an agent see the LIST of conversations it cannot read — their titles, kind, last activity and member count,
 * never a message, never a participant's name — so `request <conv>` can name one? Two switches: group chats (default
 * ON) and single chats (default OFF — a one-to-one chat's title is usually a person's name). A conversation it lists
 * is REQUESTABLE; the request itself is the same as ever (approving it grants that ONE agent that ONE conversation).
 */
const DIRECTORY_DEFAULT = Object.freeze({ groups: true, singles: false });
function directoryOf(rec) {
  const d = rec && rec.agentDirectory && typeof rec.agentDirectory === 'object' ? rec.agentDirectory : {};
  return { groups: typeof d.groups === 'boolean' ? d.groups : DIRECTORY_DEFAULT.groups, singles: typeof d.singles === 'boolean' ? d.singles : DIRECTORY_DEFAULT.singles };
}
function validateDirectory(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'agentDirectory must be {groups: true|false, singles: true|false}' };
  for (const k of Object.keys(v)) if (k !== 'groups' && k !== 'singles') return { ok: false, error: `agentDirectory has no field "${String(k).slice(0, 40)}" (groups, singles)` };
  for (const k of ['groups', 'singles']) if (v[k] !== undefined && typeof v[k] !== 'boolean') return { ok: false, error: `agentDirectory.${k} must be true or false` };
  return { ok: true, directory: directoryOf({ agentDirectory: v }) };
}
/** Does the directory list a conversation of this kind? A single chat (`dm`) ⇒ `singles`; a group / thread ⇒ `groups`. */
function directoryListable(dir, kind) { const d = dir || DIRECTORY_DEFAULT; return kind === 'dm' ? d.singles === true : d.groups === true; }

module.exports = {
  DIRECTORY_DEFAULT, directoryOf, validateDirectory, directoryListable,
  LEVELS, RANK, GRANT_ORIGINS, PRINCIPAL_KINDS, EVERYONE_ID, SCOPE_KINDS, NOT_FOUND_TEXT,
  notFound, canSee, canRequest, widen, fromMsgLevel, grantId, validateGrant, principalApplies, scopeApplies,
  effective, applyGrant, removeGrant, approveRequest, grantsFor,
  accountGrant, patternGrant, grantsForConversation,
};
