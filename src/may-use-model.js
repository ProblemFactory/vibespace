'use strict';
/**
 * WHAT A CONVERSATION MAY USE — PURE (imports nothing; CJS so the hub's route and the page share it). The unit «what it may
 * use» (the owner, 2026-11-17: «话说现在似乎没办法根据对话看到它到底有什么channel之类的权限？»): Session Properties shows,
 * for one existing conversation, everything it may use NOW — door by door, each resource BY WHAT (itself, a Task Group it is
 * in, or everyone) and where a 「除了」 takes it out.
 *
 * THE VERDICT IS EVERY DOOR'S OWN. This module holds NO membership test (test-architecture §97): each door's lister — beside
 * the door's own verdict, in the door's own module (browser-keeper admitsFor → browser-profiles mayAttach, automation-engine
 * mayUseFor → admits over the key grant's use row, channels-engine mayUseFor → channel-filter rowNames / channel-acl
 * principalApplies / effectiveApi, exit-proxy mayUseFor → exit-reach exitVerdict, window-targets-engine mayUseFor →
 * window-reach reachFor, browser-logins mayUseFor → the grant rows fillVerdict judges, vault-use-grants mayUseFor →
 * vault-use-grant useVerdict, vault-job approvedBy) — answers ANSWER ROWS, and this module only orders, groups, bounds and
 * names them:
 *   answer = { door, resource, name, ok, via, groupId?, except?, code?, detail?, parent? }
 *     ok true  ⇒ `via` is the door's own word for how it admits (normalised by VIA — a spelling map, never a test)
 *     ok false ⇒ `code` excepted (a 「除了」 took it out: `except` names it) | groups_unreadable (its Task Groups could not be
 *                read: UNKNOWN, never «none») | unknown_shape (the door cannot read the row) | vault_locked; any other refusal
 *                is «not granted» and is never listed
 *     parent   ⇒ the row it sits under (a channel grain under its account: `account:<adapterId>`)
 * TWO DOORS ARE NOT SHOWN (NOT_SHOWN): automation-key-reach and group-visibility judge this conversation as a TARGET (which
 * conversations a key may act on; how far a group shows its members to outside agents) — «who may reach it», a later unit.
 *
 * viewOf({ facts, answers, accounts }) → { facts, kinds: [{ kind, rows, more, unknown }] } in THE OWNER'S ORDER (KINDS:
 * sessions, channels first among the resources, browser, vault, keys, exits, windows, the built-ins last). A kind that can
 * run to hundreds shows NAMED_MAX rows by name and the count of the rest (`more`) — the door to the resource's own window
 * is the page's; there is no «show more».
 * Gate: scripts/test-may-use-model.mjs (fast; its red control: a row the door admits and the view omits).
 */
const KINDS = Object.freeze(['sessions', 'channels', 'browser', 'vault', 'keys', 'exits', 'windows', 'builtins']);
const DOOR_KIND = Object.freeze({
  'channel-reach': 'channels', 'channel-watch': 'channels', 'channel-api': 'channels',
  'browser-profile': 'browser', 'browser-login': 'browser',
  'vault-use': 'vault', 'vault-job': 'vault',
  'automation-key-use': 'keys', exit: 'exits', window: 'windows',
});
const NOT_SHOWN = Object.freeze({
  'automation-key-reach': 'which conversations a key may act ON — this conversation as a target, not something it uses',
  'group-visibility': 'how far its Task Group shows its members to outside agents — this conversation as a target, not something it uses',
});
/** How many rows of one list are named before the rest is a count (single channel conversations, vault entries, windows…). */
const NAMED_MAX = 3;
/** The doors' own words for HOW a row admits → one spelling (browser-profiles says own / conversation / task / all,
 *  exit-reach session / group / everyone, window-reach session / self-open / group / everyone, the model conversation /
 *  group / everyone). */
const VIA = Object.freeze({ conversation: 'self', own: 'self', session: 'self', self: 'self', 'self-open': 'self', task: 'group', group: 'group', all: 'everyone', everyone: 'everyone' });
const LISTED_REFUSALS = Object.freeze(['excepted', 'groups_unreadable', 'unknown_shape', 'vault_locked']);
const RANK = Object.freeze({ self: 0, group: 1, everyone: 2 });
const str = (v) => (v === undefined || v === null ? '' : String(v));

/** One answer as the view keeps it — null when it is not listed (a refusal other than the four, a door not shown). */
function rowOf(a) {
  if (!a || typeof a !== 'object' || !DOOR_KIND[a.door]) return null;
  const base = { door: a.door, resource: str(a.resource), name: str(a.name) || str(a.resource), ...(a.detail && typeof a.detail === 'object' ? { detail: a.detail } : {}), ...(a.parent ? { parent: str(a.parent) } : {}) };
  if (a.ok === true) {
    const via = VIA[str(a.via)] || null;
    if (!via) return { ...base, state: 'unknown', code: 'unknown_shape' };   // a door word this release does not know is said, never guessed
    return { ...base, state: 'ok', via, ...(via === 'group' && a.groupId ? { groupId: str(a.groupId) } : {}) };
  }
  if (!LISTED_REFUSALS.includes(a.code)) return null;
  if (a.code === 'excepted') return { ...base, state: 'excepted', ...(a.except && typeof a.except === 'object' ? { except: { kind: a.except.kind === 'group' ? 'group' : 'conversation', id: str(a.except.id || a.except.key) } } : {}) };
  return { ...base, state: 'unknown', code: a.code };
}
/** The order inside one list: its own, then a Task Group's, then everyone's; then the ones a 「除了」 takes out; the unknown
 *  last — each by name. */
const rankOf = (r) => (r.state === 'ok' ? RANK[r.via] : r.state === 'excepted' ? 3 : 4);
function byRank(a, b) { return rankOf(a) - rankOf(b) || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0) || (a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0); }
/** First NAMED_MAX by name, the rest counted. */
function bounded(rows, max = NAMED_MAX) { const s = rows.slice().sort(byRank); return { rows: s.slice(0, max), more: Math.max(0, s.length - max) }; }

/** The channel accounts (the form's 频道 tick rows, `accounts` in new-session-model accountRows' shape + `state`: granted |
 *  own | none | excepted | unknown) with, under each, its grains that admit this conversation (rules and single
 *  conversations — bounded —, the notification that wakes it, its raw-API tier). */
function channelsOf(answers, accounts) {
  const under = new Map();
  for (const r of answers) { if (DOOR_KIND[r.door] !== 'channels') continue; const p = r.parent || ''; if (!under.has(p)) under.set(p, []); under.get(p).push(r); }
  const out = [];
  for (const a of Array.isArray(accounts) ? accounts : []) {
    if (!a || !a.id) continue;
    const kids = under.get(`account:${a.id}`) || [];
    under.delete(`account:${a.id}`);
    const convs = bounded(kids.filter((k) => k.door === 'channel-reach' && /^conversation:/.test(k.resource)));
    const rules = bounded(kids.filter((k) => k.door === 'channel-reach' && /^rule:/.test(k.resource)));
    out.push({ account: a, rules: rules.rows, rulesMore: rules.more, conversations: convs.rows, conversationsMore: convs.more,
      watch: kids.filter((k) => k.door === 'channel-watch').sort(byRank), api: kids.filter((k) => k.door === 'channel-api').sort(byRank) });
  }
  // a grain whose account is not in the list (an account removed while its rows stay) is said by itself, never dropped
  const orphans = [].concat(...[...under.values()]);
  return { accounts: out, orphans: bounded(orphans) };
}

function viewOf({ facts = {}, answers = [], accounts = [] } = {}) {
  const rows = (Array.isArray(answers) ? answers : []).map(rowOf).filter(Boolean);
  const of = (kind) => rows.filter((r) => DOOR_KIND[r.door] === kind);
  const f = {
    live: !!facts.live, noAgent: !!facts.noAgent, remote: !!facts.remote, groupsUnknown: !!facts.groupsUnreadable, cid: str(facts.cid) || null, host: str(facts.host) || null,
    groups: (Array.isArray(facts.groups) ? facts.groups : []).filter((g) => g && g.id).map((g) => ({ id: str(g.id), name: str(g.name) || str(g.id) })),
  };
  const kinds = [];
  for (const kind of KINDS) {
    if (kind === 'sessions' || kind === 'builtins') { kinds.push({ kind }); continue; }   // drawn from the facts and the form's own words
    if (f.noAgent) continue;   // a Terminal with no agent: the form's one sentence, no resource lists
    if (kind === 'channels') { kinds.push({ kind, ...channelsOf(rows, accounts) }); continue; }
    if (kind === 'browser') {
      const profiles = bounded(of('browser').filter((r) => r.door === 'browser-profile'));
      const logins = bounded(of('browser').filter((r) => r.door === 'browser-login'));
      kinds.push({ kind, remote: f.remote, profiles: profiles.rows, profilesMore: profiles.more, logins: logins.rows, loginsMore: logins.more });
      continue;
    }
    if (kind === 'vault') {
      const use = bounded(of('vault').filter((r) => r.door === 'vault-use'));
      const jobs = bounded(of('vault').filter((r) => r.door === 'vault-job'));
      kinds.push({ kind, use: use.rows, useMore: use.more, jobs: jobs.rows, jobsMore: jobs.more, locked: of('vault').some((r) => r.code === 'vault_locked') });
      continue;
    }
    const b = bounded(of(kind));
    kinds.push({ kind, rows: b.rows, more: b.more });
  }
  return { facts: f, kinds };
}

module.exports = { KINDS, DOOR_KIND, NOT_SHOWN, NAMED_MAX, VIA, LISTED_REFUSALS, rowOf, byRank, bounded, viewOf };
