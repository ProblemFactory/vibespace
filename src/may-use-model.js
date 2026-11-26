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
 *     ok true  ⇒ `via` is the door's own word for how it admits (normalised by VIA — a spelling map, never a test);
 *                `request: true` ⇒ it may only ASK for it (a channel reach row at level «may request» — cure r1, MUST 2):
 *                its own state, never «may use»
 *     ok false ⇒ `code` excepted (a 「除了」 took it out: `except` names it) | groups_unreadable (its Task Groups could not be
 *                read: UNKNOWN, never «none») | unknown_shape (the door cannot read the row) | vault_locked | not_open (B-e630:
 *                a browser profile whose readable row does not name it — listed «closed» with its door); any other refusal
 *                is «not granted» and is never listed
 *     parent   ⇒ the row it sits under (a channel grain under its account: `account:<adapterId>`)
 * TWO DOORS ARE NOT SHOWN (NOT_SHOWN): automation-key-reach and group-visibility judge this conversation as a TARGET (which
 * conversations a key may act on; how far a group shows its members to outside agents) — «who may reach it», a later unit.
 *
 * viewOf({ facts, answers, accounts }) → { facts, kinds: [{ kind, rows, more, moreRequest, moreOut, moreClosed }] } in THE OWNER'S ORDER
 * (KINDS: sessions, channels first among the resources, browser, vault, keys, exits, windows, the built-ins last). A list
 * that can run to hundreds shows NAMED_MAX rows of each standing by name — what it may use, what it may ask for, what a
 * 「除了」 takes out or cannot be judged (cure r1, SHOULD e: a row left out is SAID even when three granted rows come
 * first) — and the COUNT of the rest of each (`more` / `moreRequest` / `moreOut`), the door to the resource's own window
 * being the page's; there is no «show more». A kind with no window that lists it whole is never cut (UNCUT — cure r1,
 * MUST 3: exits and windows — no window lists every machine's exit or every shared window).
 * Gate: scripts/test-may-use.mjs (fast; its red control: a row the door admits and the view omits).
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
/** The kinds no window lists whole — never cut (a count with no door opens nothing). */
const UNCUT = Object.freeze(['exits', 'windows']);
/** The doors' own words for HOW a row admits → one spelling (browser-profiles says own / conversation / task / all,
 *  exit-reach session / group / everyone, window-reach session / self-open / group / everyone, the model conversation /
 *  group / everyone). */
const VIA = Object.freeze({ conversation: 'self', own: 'self', session: 'self', self: 'self', 'self-open': 'self', task: 'group', group: 'group', all: 'everyone', everyone: 'everyone' });
const LISTED_REFUSALS = Object.freeze(['excepted', 'groups_unreadable', 'unknown_shape', 'vault_locked', 'not_open', 'vault_use_marks_unread', 'marks_undecided', 'automation_unread', 'window_reach_unread']);   // the automation store's next touch: + the keys could not be read (its own row)   // r3205 (2): + an undecided vault-use row (listed as unknown)   // r3104 (a): + the vault-use marks held (listed as unknown, never dropped)
const RANK = Object.freeze({ self: 0, group: 1, everyone: 2 });
const str = (v) => (v === undefined || v === null ? '' : String(v));

/** One answer as the view keeps it — null when it is not listed (a refusal outside LISTED_REFUSALS, a door not shown). */
function rowOf(a) {
  if (!a || typeof a !== 'object' || !DOOR_KIND[a.door]) return null;
  const base = { door: a.door, resource: str(a.resource), name: str(a.name) || str(a.resource), ...(a.detail && typeof a.detail === 'object' ? { detail: a.detail } : {}), ...(a.parent ? { parent: str(a.parent) } : {}) };
  if (a.ok === true) {
    const via = VIA[str(a.via)] || null;
    if (!via) return { ...base, state: 'unknown', code: 'unknown_shape' };   // a door word this release does not know is said, never guessed
    return { ...base, state: a.request === true ? 'request' : 'ok', via, ...(via === 'group' && a.groupId ? { groupId: str(a.groupId) } : {}) };
  }
  if (!LISTED_REFUSALS.includes(a.code)) return null;
  if (a.code === 'not_open') return { ...base, state: 'closed' };   // B-e630: a resource this conversation may not use (its grant row names others) — listed with its door
  if (a.code === 'excepted') return { ...base, state: 'excepted', ...(a.except && typeof a.except === 'object' ? { except: { kind: a.except.kind === 'group' ? 'group' : 'conversation', id: str(a.except.id || a.except.key) } } : {}) };
  return { ...base, state: 'unknown', code: a.code };
}
/** The order inside one list: its own, then a Task Group's, then everyone's; then what it may only ask for; then the ones a
 *  「除了」 takes out; the unknown last — each by name. */
const rankOf = (r) => (r.state === 'ok' ? RANK[r.via] : r.state === 'request' ? 3 : r.state === 'excepted' ? 4 : r.state === 'closed' ? 6 : 5);   // B-e630: a closed one after the unknown (an unreadable row stays named)
function byRank(a, b) { return rankOf(a) - rankOf(b) || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0) || (a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0); }
/** Each standing bounded on its own — NAMED_MAX of what it may use, of what it may ask for, of what is left out or unknown,
 *  of what is not open to it (B-e630: its own bucket, so unknown rows never hide it and it is never counted as unknown) —
 *  the rest of each counted; `max` Infinity ⇒ never cut. */
function bounded(rows, max = NAMED_MAX) {
  const s = rows.slice().sort(byRank);
  const ok = s.filter((r) => r.state === 'ok'), ask = s.filter((r) => r.state === 'request'), closed = s.filter((r) => r.state === 'closed');
  const out = s.filter((r) => r.state !== 'ok' && r.state !== 'request' && r.state !== 'closed');
  const cut = (l) => (Number.isFinite(max) ? l.slice(0, max) : l);
  const rest = (l) => (Number.isFinite(max) ? Math.max(0, l.length - max) : 0);
  return { rows: [...cut(ok), ...cut(ask), ...cut(out), ...cut(closed)], more: rest(ok), moreRequest: rest(ask), moreOut: rest(out), moreClosed: rest(closed) };
}

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
    out.push({ account: a, rules: rules.rows, rulesMore: rules.more, rulesMoreRequest: rules.moreRequest, rulesMoreOut: rules.moreOut, rulesMoreClosed: rules.moreClosed,
      chats: convs.rows, chatsMore: convs.more, chatsMoreRequest: convs.moreRequest, chatsMoreOut: convs.moreOut, chatsMoreClosed: convs.moreClosed,   // `chats`: one account's single channel conversations (never a digest's `conversations` — test-channel-rows)
      watch: kids.filter((k) => k.door === 'channel-watch').sort(byRank), api: kids.filter((k) => k.door === 'channel-api').sort(byRank) });
  }
  // a grain whose account is not in the list (an account removed while its rows stay) is said by itself, never dropped
  const orphans = [].concat(...[...under.values()]);
  return { accounts: out, orphans: bounded(orphans) };
}

const notUsable = (r) => !!r && (r.state === 'closed' || r.state === 'excepted');   // KNOWN not usable — an unknown row (a part that failed, groups unreadable) claims nothing

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
      const all = of('browser').filter((r) => r.door === 'browser-profile');
      const profiles = bounded(all);
      const logins = bounded(of('browser').filter((r) => r.door === 'browser-login'));
      // profilesNotUsable: how many profiles it is KNOWN it may not use (not open + taken out), counted before the cut — the Connect form's fold
      kinds.push({ kind, remote: f.remote, profiles: profiles.rows, profilesMore: profiles.more, profilesMoreOut: profiles.moreOut, profilesMoreClosed: profiles.moreClosed,
        profilesNotUsable: all.filter(notUsable).length, logins: logins.rows, loginsMore: logins.more, loginsMoreOut: logins.moreOut, loginsMoreClosed: logins.moreClosed });
      continue;
    }
    if (kind === 'vault') {
      const use = bounded(of('vault').filter((r) => r.door === 'vault-use'));
      const jobs = bounded(of('vault').filter((r) => r.door === 'vault-job'));
      kinds.push({ kind, use: use.rows, useMore: use.more, useMoreOut: use.moreOut, useMoreClosed: use.moreClosed, jobs: jobs.rows, jobsMore: jobs.more, jobsMoreOut: jobs.moreOut, jobsMoreClosed: jobs.moreClosed, locked: of('vault').some((r) => r.code === 'vault_locked') });
      continue;
    }
    const b = bounded(of(kind), UNCUT.includes(kind) ? Infinity : NAMED_MAX);
    kinds.push({ kind, rows: b.rows, more: b.more, moreOut: b.moreOut, moreClosed: b.moreClosed, ...(UNCUT.includes(kind) ? { uncut: true } : {}) });
  }
  return { facts: f, kinds };
}

/** B-e630 (主开发's ruling, 2026-11-18): THE CONNECT FORM'S FOLD for a channel whose capability row says a browser sign-in can
 *  stand for it (`browserSignIn` — the adapter contract's entry): a line and its door when THIS conversation cannot use at least one
 *  of the person's browser profiles. The GRANT facts only (the may-use view's browser rows); never a profile's name or label — the
 *  person recognises the profile by its own name in the profiles' list. → null | {n} (how many it may not use). */
function browserSignInFold(browserSignIn, view) {
  if (browserSignIn !== true || !view || !Array.isArray(view.kinds)) return null;
  const br = view.kinds.find((k) => k && k.kind === 'browser');
  if (!br || br.remote || !Array.isArray(br.profiles)) return null;
  // the count before the cut (three unknown rows must not hide a closed one); a view without it: its drawn rows
  const n = Number.isFinite(br.profilesNotUsable) ? br.profilesNotUsable : br.profiles.filter(notUsable).length;
  return n > 0 ? { n } : null;
}

module.exports = { KINDS, DOOR_KIND, NOT_SHOWN, NAMED_MAX, UNCUT, VIA, LISTED_REFUSALS, rowOf, byRank, bounded, viewOf, browserSignInFold };
