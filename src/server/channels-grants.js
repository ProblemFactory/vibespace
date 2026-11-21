'use strict';
/**
 * THE CHANNEL DOORS' ROWS — ORCH (lane grants-unify, 2026-10-23). Who may SEE a channel conversation (and act there:
 * the access row's `authority`), who a grain's notification may WAKE, and who holds a raw-API tier are rows of THE
 * grants store (src/server/grants-store.js), judged by THE model (src/grant-model.js `admits`) — the channel index keeps
 * only what is not a grant: a grain's watcher SETTINGS and pace ledgers, a rule's pattern, the requests' history.
 *
 *   door            resource                                    `to` entries carry
 *   channel-reach   account:<adapterId>                         the account grain's ACCESS list (`authority`)
 *                   rule:<patternId>                            a rule's ACCESS list (`authority`)
 *                   conversation:<adapterId>/<convId>           one conversation's ACCESS list (`authority`)
 *                   conversation:<key>#user                     the owner's hand-written reach rows (`level`)
 *                   conversation:<key>#request                  approved requests (`level` visible)
 *                   account:<adapterId>#user                    an account-scope row of another origin (pre-unify only)
 *   channel-watch   the grain's resource (as the three above)   WHO that grain's notification wakes — and, lane
 *                                                               lg-group-parents B-526c, each watcher's SETTINGS (the
 *                                                               index keeps its own copy + the pace ledgers, keyed by
 *                                                               principal; an older record's entry is the bare principal)
 *   + a rule's two rows carry `rule` {adapterId, pattern}, the watch row `blocks` (the agents whose own watch the person
 *     removed there) — B-526c: a grain write's DURABLE half is these rows (synchronous, before the answer); the index's
 *     copy follows at its pace and the boot completes an act the stop cut short (channels-access completeGrainActs)
 *   channel-api     <credential>  (an account id | mount:<id>)  the raw-API `tier` (+ `perDay`)
 *
 * A row's `except` = the members of its Task Groups / of All agents LEFT OUT («除了»): a left-out member gets nothing
 * through THAT row (its own row elsewhere still counts — rows add). The readers here hand the channel models their old
 * spellings (channel-acl grants `{principal, scope, level, origin}`, channel-filter access rows `{principal,
 * authority}`) with the row's `except` riding each one — channel-acl `principalApplies` and channel-filter `rowNames`
 * judge through `admits`, so a left-out member is refused there and nowhere else is a membership test written.
 *
 * READS ARE CHEAP: one normalized index per door, rebuilt only when the store changes a channel row (`onChange`) — the
 * reach walk asks per conversation. An unreadable store ⇒ every row reads as none (`unreadable`) — fail closed.
 * Gate: scripts/test-grants-store.mjs (the channel leg), test-channel-acl, test-channels-engine.
 */
const GM = require('../grant-model.js'); // PURE: THE grant model
const GS = require('./grants-store.js'); // ORCH: THE store (the instance's installed one, or one per data dir)

const DOORS = Object.freeze({ reach: 'channel-reach', watch: 'channel-watch', api: 'channel-api' });
const CHANNEL_DOORS = Object.freeze(Object.values(DOORS));
/** The resource grammar (one place). */
const RES = Object.freeze({
  account: (adapterId) => `account:${adapterId}`,
  accountUser: (adapterId) => `account:${adapterId}#user`,
  rule: (patternId) => `rule:${patternId}`,
  conversation: (key) => `conversation:${key}`,
  user: (key) => `conversation:${key}#user`,
  request: (key) => `conversation:${key}#request`,
});
/** A grain (`kind` account | pattern | conversation, its id — the adapter id, the rule id, the conversation key) → its resource. */
function grainResource(kind, id) {
  if (kind === 'account') return RES.account(id);
  if (kind === 'pattern') return RES.rule(id);
  return RES.conversation(id);
}
const EMPTY = Object.freeze({ to: Object.freeze([]), except: Object.freeze([]) });
/** A row's `except` rides only its Task Group / All agents entries — «除了» leaves members OUT of a group (or of All
 *  agents); a principal the row names by itself is never «left out» of itself. */
const exceptFor = (e, except) => (e.kind === 'group' || e.kind === 'everyone' ? except : []);
const UNREADABLE = Object.freeze({ to: Object.freeze([]), except: Object.freeze([]), unreadable: true });
const NO_GRANTS = Object.freeze([]);

function create({ grants = null, dataDir = null } = {}) {
  // the store a door handed none resolves ONCE per install (lane grants-read-is-a-lookup: every read asked forDir — its
  // path.resolve was the hub's top held frame); a getter (`grants` a function) is asked at every read, as before
  let resolved = null, resolvedAt = -1;
  const storeOf = () => {
    const h = typeof grants === 'function' ? grants() : grants;
    if (h) return h;
    const g = typeof GS.installGeneration === 'function' ? GS.installGeneration() : -2;
    if (resolved && resolvedAt === g && g !== -2) return resolved;
    resolved = dataDir ? GS.forDir(dataDir) : GS.store(); resolvedAt = g;
    return resolved;
  };
  let bound = null, unsub = null, gen = 0;
  const cache = new Map();          // door → {unreadable, rows: Map(resource → {to, except, unknown?})}
  const views = new WeakMap();      // a cached row → its channel-spelling views (built once per row per change)
  const S = () => {
    const s = storeOf();
    if (s !== bound) {
      if (unsub) { try { unsub(); } catch { } }
      cache.clear(); bound = s; gen++;
      unsub = s && typeof s.onChange === 'function' ? s.onChange(({ door }) => { if (CHANNEL_DOORS.includes(door)) { cache.delete(door); gen++; } }) : null;
    }
    return s;
  };
  function doorIndex(door, s = S()) {
    let ix = cache.get(door);
    if (ix) return ix;
    ix = { unreadable: !s, rows: new Map() };
    for (const r of s ? s.rowsOfDoor(door) : []) {
      if (!r || r.unreadable || r.to === null) { ix.unreadable = true; continue; }
      const n = GM.normRow(r);
      ix.rows.set(String(r.resource), Object.freeze(n.ok ? { to: Object.freeze(n.row.to), except: Object.freeze(n.row.except), ...(n.row.rule ? { rule: n.row.rule } : {}), ...(n.row.blocks ? { blocks: n.row.blocks } : {}) } : { to: Object.freeze([]), except: Object.freeze([]), unknown: true, why: n.why }));   // B-526c: + what the row carries
    }
    cache.set(door, ix);
    return ix;
  }
  /** ONE row as read: `{to, except}` (none ⇒ empty; an unreadable store ⇒ `unreadable`; a row this release cannot read
   *  ⇒ `unknown` — both grant nothing). */
  function rowOf(door, res) {
    const ix = doorIndex(door);
    if (ix.unreadable) return UNREADABLE;
    return ix.rows.get(String(res)) || EMPTY;
  }
  /** Every resource of a door with a row (`prefix` narrows: `conversation:<adapterId>/`). */
  function resourcesOf(door, prefix = '') {
    const ix = doorIndex(door);
    return [...ix.rows.keys()].filter((k) => k.startsWith(prefix));
  }
  /** THE GENERATION of the channel doors' rows: it moves whenever an index is dropped (a channel row changed, the store
   *  rebound) — a reader that keeps an answer derived from the rows keeps it for ONE generation (lane grants-read-is-a-lookup). */
  function generation() { S(); return gen; }
  /** ONE call per conversation of a walk: the rows' generation when NO reach row of its own names this conversation and no
   *  rule holds a reach row (its reach is then its account's — channels-access reachFor), -2 when some rule holds one (the
   *  caller asks the rules), -1 when a row of its own decides it. */
  function plainGeneration(key) {
    const ix = doorIndex(DOORS.reach);
    if (!ix.unreadable && (ix.rows.has(RES.conversation(key)) || ix.rows.has(RES.user(key)) || ix.rows.has(RES.request(key)))) return -1;
    return ruleIdsOf(ix).size ? -2 : gen;
  }
  const ruleIdsOf = (ix) => ix.ruleIds || (ix.ruleIds = new Set([...ix.rows.keys()].filter((k) => k.startsWith('rule:')).map((k) => k.slice(5))));
  /** Does a reach row of ITS OWN name this conversation (its access, the owner's rows, an approved request)? A conversation
   *  none names, and no rule's row derives, reaches exactly what its ACCOUNT's rows reach (channels-access reachFor). */
  function hasConversationRows(key) {
    const ix = doorIndex(DOORS.reach);
    if (ix.unreadable) return false;
    return ix.rows.has(RES.conversation(key)) || ix.rows.has(RES.user(key)) || ix.rows.has(RES.request(key));
  }
  /** The rule ids a reach row holds — only these derive a grant on a matching conversation (kept on the door's index). */
  function ruleIdsWithRows() { return ruleIdsOf(doorIndex(DOORS.reach)); }
  /** The conversation keys a reach row of their OWN names (kept on the door's index — a walk asks it once). */
  function ownConversationKeys() {
    const ix = doorIndex(DOORS.reach);
    if (!ix.ownKeys) ix.ownKeys = new Set([...ix.rows.keys()].filter((k) => k.startsWith('conversation:')).map((k) => k.slice('conversation:'.length).replace(/#(user|request)$/, '')));
    return ix.ownKeys;
  }
  const viewOf = (row, what, build) => {
    let v = views.get(row);
    if (!v) { v = {}; views.set(row, v); }
    if (!(what in v)) v[what] = build();
    return v[what];
  };

  // ── the channel spellings ──────────────────────────────────────────────────
  /** A grain's ACCESS list as channel-filter reads it: `[{principal, authority, createdAt, updatedAt, createdBy, except}]`
   *  — `except` (the row's left-out members, the model's spelling) on every row: `rowNames` judges through it. */
  function accessOf(res) {
    const r = rowOf(DOORS.reach, res);
    return viewOf(r, 'access', () => r.to.map((e) => ({
      principal: GM.toChannelPrincipal(e), authority: e.authority === 'send' ? 'send' : 'draft',
      createdAt: e.at || null, updatedAt: e.at || null, createdBy: e.by || null, except: exceptFor(e, r.except),
    })).filter((x) => x.principal));
  }
  /** The left-out members of a grain's access row (the model's spelling). */
  function exceptOf(res) { return rowOf(DOORS.reach, res).except; }
  /** channel-acl grants of ONE row: `{principal, scope, level, origin, at, by, except}` (+ `pattern`/`derived` for a rule's). */
  // lane lg-group-parents (the U3c read, BLOCKER 1): a reach / API grant's principal keeps «仅本组» (`only`) — rebuilt bare it
  // read a «仅本组» group grant as «含子组» once the lineage is fed
  function grantsOf(res, { scope, origin, level = null }) {
    const r = rowOf(DOORS.reach, res);
    if (!r.to.length) return NO_GRANTS;   // no row (or an empty one): nothing to view — never a view kept per conversation key on the shared EMPTY row
    return viewOf(r, `g|${scope.kind}:${scope.id}|${origin}`, () => r.to.map((e) => {
      const principal = GM.toChannelPrincipal(e);
      if (!principal) return null;
      const lv = level || (e.level === 'requestable' ? 'requestable' : 'visible');
      return { principal: { kind: principal.kind, id: principal.id, name: principal.kind === 'everyone' ? null : (principal.name || null), ...(principal.only === true ? { only: true } : {}) }, scope: { ...scope }, level: lv, origin, at: e.at || null, by: e.by || null, except: exceptFor(e, r.except) };
    }).filter(Boolean));
  }
  /** The reach grants a conversation's OWN rows hold: its access (origin access), the owner's (user), approvals (request). */
  function conversationGrants(key) {
    const scope = { kind: 'conversation', id: key };
    return [...grantsOf(RES.conversation(key), { scope, origin: 'access', level: 'visible' }), ...grantsOf(RES.user(key), { scope, origin: 'user' }), ...grantsOf(RES.request(key), { scope, origin: 'request', level: 'visible' })];
  }
  /** The account-scope grants of one account: its grain's access (origin access) + any pre-unify row of another origin. */
  function accountGrants(adapterId) {
    const scope = { kind: 'adapter', id: adapterId };
    return [...grantsOf(RES.account(adapterId), { scope, origin: 'access', level: 'visible' }), ...grantsOf(RES.accountUser(adapterId), { scope, origin: 'user' })];
  }
  /** A rule's access as the DERIVED grant on ONE matching conversation (channel-acl `patternGrant`'s shape + `except`). */
  function ruleGrants(patternId, key) {
    return grantsOf(RES.rule(patternId), { scope: { kind: 'conversation', id: key }, origin: 'access', level: 'visible' }).map((g) => ({ ...g, pattern: String(patternId), derived: true }));
  }
  /** The raw-API tier rows (channel-acl's api row shape: origin api, level hidden, `api` the tier) of every credential. */
  function apiGrants() {
    const ix = doorIndex(DOORS.api);
    if (ix.unreadable) return [];
    const out = [];
    for (const [cred, r] of ix.rows) {
      out.push(...viewOf(r, `api|${cred}`, () => r.to.map((e) => {
        const principal = GM.toChannelPrincipal(e);
        if (!principal || !e.tier) return null;
        return { principal: { kind: principal.kind, id: principal.id, name: principal.kind === 'everyone' ? null : (principal.name || null), ...(principal.only === true ? { only: true } : {}) }, scope: { kind: 'adapter', id: cred }, level: 'hidden', origin: 'api', api: e.tier, ...(e.perDay ? { perDay: e.perDay } : {}), at: e.at || null, by: e.by || null, except: exceptFor(e, r.except) };
      }).filter(Boolean)));
    }
    return out;
  }
  /** The WATCH row of a grain: `{to, except}` — who its notification may wake (a watcher row of the index whose
   *  principal it does not list wakes nobody; `except` = the members of a watching Task Group / All agents left out). */
  function watchOf(res) { return rowOf(DOORS.watch, res); }
  const pkOf = (p) => GM.principalKey(GM.fromChannelPrincipal(p));
  /** Does the watch row list this principal (channel spelling)? */
  function watchLists(res, principal) {
    const r = watchOf(res), k = pkOf(principal);
    return !!k && r.to.some((e) => GM.principalKey(e) === k);
  }
  /**
   * May a member be WOKEN through a watching principal of this grain — THE question every fan-out asks (an All agents
   * row's per-conversation items, a Task Group's round-robin and its per-member items): `admits` over the watch row's
   * entry for THAT principal alone (its `except` kept) with the member's facts. A conversation principal answers for
   * itself. → boolean.
   */
  function wakeAdmits(res, principal, { cid, groups = [], inherited = [], groupsUnreadable = false } = {}) {   // lane lg-group-parents U3c: + the member's lineage (every caller hands it — the U3c read, BLOCKER 3)
    const e = GM.fromChannelPrincipal(principal);
    if (!e || !cid) return false;
    const r = watchOf(res);
    const k = GM.principalKey(e);
    const own = r.to.filter((x) => GM.principalKey(x) === k);
    if (!own.length) return false;
    return GM.admits([{ door: DOORS.watch, resource: String(res), to: own, except: exceptFor(own[0], r.except) }], { conversationKey: String(cid), groupIds: groups, inheritedGroupIds: Array.isArray(inherited) ? inherited : [], ...(groupsUnreadable === true || inherited === null ? { groupsUnreadable: true } : {}) }).ok;   // THE STORE HELD UNREAD (lane bl-windows): the caller hands the hold (a fact) — the groups UNKNOWN
  }
  /** «WHAT IT MAY USE» (unit what-it-may-use, cure r1 — 主开发 MUST 1): WHY nothing of a grain admits one conversation, judged
   *  ENTRY BY ENTRY exactly as the door gives them (each entry its OWN 「除了」 — exceptFor: a group's / everyone's carries the
   *  row's, a conversation's own entry none), THE model over each one-entry row — used only to SAY why (the admission itself
   *  is the door's own check in channels-access mayUseFor: rowNames / principalApplies / wakeAdmits). `facts` = {conversationKey,
   *  groupIds, groupsUnreadable}. → {code: unknown_shape | groups_unreadable | excepted (+ entry, bare) | not_granted} */
  function refusalOf(door, res, facts) {
    const r = rowOf(door, res);
    if (r.unknown || r.unreadable) return { ok: false, code: 'unknown_shape' };
    let excepted = null, unreadable = false;
    for (const e of r.to) {
      const v = GM.admits([{ door, resource: String(res), to: [e], except: exceptFor(e, r.except) }], facts);
      if (v.ok) continue;
      if (v.code === 'groups_unreadable') unreadable = true;
      else if (v.code === 'excepted' && !excepted) excepted = v.entry ? GM.bareOf(v.entry) : null;
    }
    if (unreadable) return { ok: false, code: 'groups_unreadable' };
    if (excepted) return { ok: false, code: 'excepted', entry: excepted };
    return { ok: false, code: 'not_granted' };
  }
  /** Does a grain's notification wake ONE conversation — the fan-out's own question (`wakeAdmits`) asked for each watching
   *  principal of the row (unit what-it-may-use)? → {ok:true, via, groupId?} | the refusal (refusalOf). */
  function watchAdmitsFor(res, { cid = '', groups = [], inherited = [], groupsUnreadable = false } = {}) {   // lane lg-group-parents: + the lineage   // the follow-owed read: the hold rides the admit too (the may-use lister says what the fan-out does)
    for (const e of watchOf(res).to) {
      const p = GM.toChannelPrincipal(e);
      if (p && wakeAdmits(res, p, { cid, groups, inherited, groupsUnreadable })) return { ok: true, via: e.kind, ...(e.kind === 'group' ? { groupId: String(e.id) } : {}) };
    }
    return refusalOf(DOORS.watch, res, { conversationKey: String(cid || ''), groupIds: groups, inheritedGroupIds: Array.isArray(inherited) ? inherited : [], groupsUnreadable: !!groupsUnreadable || inherited === null });
  }
  /** A grain's 「除了」 in bare principals (what the form draws under a granted account). */
  function exceptBare(res) { return rowOf(DOORS.reach, res).except.map((e) => GM.bareOf(e)).filter(Boolean); }
  /** Any exception on the rows that decide one conversation's reach (the wake path re-asks reach only then). */
  function anyReachExcept(resList) { return resList.some((res) => rowOf(DOORS.reach, res).except.length > 0); }
  /** Does any channel row leave anybody out at all? (One flag per door index — without one, no wake path re-asks.) */
  function hasAnyExcept() {
    return [DOORS.reach, DOORS.watch].some((door) => {
      const ix = doorIndex(door);
      if (ix.anyExcept === undefined) ix.anyExcept = [...ix.rows.values()].some((r) => r.except.length > 0);
      return ix.anyExcept;
    });
  }

  // ── the writes (THE ONE WRITER underneath — grants.set / setMany) ─────────────────────────────────────────────
  const entryOfAccess = (r) => {
    const p = GM.fromChannelPrincipal(r && r.principal);
    if (!p) return null;
    return { ...p, authority: r.authority === 'send' ? 'send' : 'draft', ...(Number(r.createdAt) ? { at: Number(r.createdAt) } : {}), ...(typeof r.createdBy === 'string' && r.createdBy ? { by: r.createdBy.slice(0, 64) } : {}) };
  };
  const entryOfLevel = (g) => {
    const p = GM.fromChannelPrincipal(g && g.principal);
    if (!p || !['visible', 'requestable'].includes(g.level)) return null;
    return { ...p, level: g.level, ...(Number(g.at) ? { at: Number(g.at) } : {}), ...(typeof g.by === 'string' && g.by ? { by: g.by.slice(0, 64) } : {}) };
  };
  const entryOfApi = (g) => {
    const p = GM.fromChannelPrincipal(g && g.principal);
    if (!p || !GM.ENTRY_FIELDS['channel-api'].tier.includes(g.api)) return null;
    return { ...p, tier: g.api, ...(Number(g.perDay) > 0 ? { perDay: Math.min(100000, Math.floor(Number(g.perDay))) } : {}), ...(Number(g.at) ? { at: Number(g.at) } : {}) };
  };
  /** lane lg-group-parents (B-526c): ONE watcher row → its watch-row ENTRY carrying the watcher's SETTINGS (GM.ENTRY_FIELDS
   *  ['channel-watch']; `body` = its inline filter's body, when it names one). A watcher the record cannot carry whole (a value
   *  past the model's bounds — a filter body over GM.BLOB_MAX, a filter id over 512 characters) is the BARE principal, its
   *  key named in `short` (that act waits for the index's disk — setGrain). → the entry | null (no principal). */
  const entryOfWatch = (w, body, short) => {
    const p = GM.fromChannelPrincipal(w && w.principal);
    if (!p) return null;
    const e = { ...p, notify: w.notify === 'digest' ? 'digest' : 'wake', mode: w.mode === 'filtered' ? 'filtered' : 'all' };
    if (w.digestMinutes !== undefined && w.digestMinutes !== null) e.digestMinutes = w.digestMinutes;
    if (w.dailyWakeCap !== undefined && w.dailyWakeCap !== null) e.dailyWakeCap = w.dailyWakeCap;
    if (w.receiptWake === true) e.receiptWake = true;
    if (w.delivery !== undefined && w.delivery !== null) e.delivery = w.delivery;
    if (w.origin === 'agent') e.origin = 'agent';
    if (w.via) e.via = w.via;
    if (w.filterId) e.filterId = w.filterId;
    if (body) e.filter = body;
    const at = Number(w.updatedAt || w.createdAt);
    if (at > 0) e.at = at;
    if (typeof w.createdBy === 'string' && w.createdBy) e.by = w.createdBy.slice(0, 64);
    if (GM.normEntry(e, DOORS.watch)) return e;
    if (short) short.push(GM.principalKey(p));
    return p;
  };
  /** lane lg-group-parents (B-526c): a CARRIED watch entry → the index's watcher row it stands for (the settings; `prev` = the
   *  index's own row of that principal, whose created-at, estimate and pace ledger are kept). null = the entry carries none
   *  (an older record: the index's row is the only settings). */
  function watcherOfEntry(e, prev = null) {
    if (!e || (e.notify !== 'wake' && e.notify !== 'digest')) return null;
    const principal = GM.toChannelPrincipal(e);
    if (!principal) return null;
    const at = Number(e.at) || null;
    return {
      principal, notify: e.notify, mode: e.mode === 'filtered' ? 'filtered' : 'all', filterId: e.filterId || null,
      ...(e.digestMinutes !== undefined ? { digestMinutes: e.digestMinutes } : {}), ...(e.dailyWakeCap !== undefined ? { dailyWakeCap: e.dailyWakeCap } : {}),
      receiptWake: e.receiptWake === true, ...(e.delivery ? { delivery: e.delivery } : {}), ...(e.origin === 'agent' ? { origin: 'agent' } : {}), ...(e.via ? { via: e.via } : {}),
      createdAt: prev && prev.createdAt ? prev.createdAt : at, updatedAt: at, createdBy: prev && prev.createdBy ? prev.createdBy : (e.by || 'user'),
      estimateAtSet: prev ? prev.estimateAtSet || null : null, stats: prev && prev.stats ? prev.stats : { wakes: [], hits: [] },
    };
  }
  const exceptEntries = (list) => (Array.isArray(list) ? list.map((x) => (x && (x.kind === 'agent' || x.kind === 'everyone') ? GM.fromChannelPrincipal(x) : GM.bareOf(x))).map((x) => x || { kind: 'invalid' }) : []);
  /** The changes ONE grain write makes — its access row and its watch row (`except` / `watchExcept` = the lists to keep:
   *  absent ⇒ the stored ones). lane held-except-doors: a row with no Task Group / All agents left KEEPS its exceptions (they
   *  hold again when one is given back — a write never drops an exception it did not name); `removeExcept` /
   *  `watchRemoveExcept` name the ones the person's Save takes away. r2 (主开发's acceptance, MAJOR — the compat assignment,
   *  an agent's own watch and the owner's Approve put a member on the row BY ITSELF over its kept exception ⇒
   *  except_conflicts, a 500): a write that keeps the stored list (`except` absent) and gives a member its OWN entry LIFTS
   *  that member's own exception BY NAME (`lift`: 'always' — the owner's writes —, 'dormant' — an agent's own: only where
   *  no Task Group / All agents entry is on the row, a live exception is the owner's to lift —, false); a list the caller
   *  sent is never edited here (a member both given and left out there ⇒ except_conflicts, the caller's contradiction). */
  function grainChanges(res, { access = null, watchers = null, except = undefined, watchExcept = undefined, removeExcept = [], watchRemoveExcept = [], lift = false, bodies = null, rule = undefined, blocks = undefined, short = null } = {}) {   // lane lg-group-parents B-526c: + the carried settings (`bodies` = filter id → an inline filter's body), `rule`, `blocks`; `short` collects what could not be carried
    const rowOfChange = (door, to, stored, given, named) => {
      let ex = given === undefined ? stored : exceptEntries(given);
      const rx = Array.isArray(named) ? [...named] : [];
      if (given === undefined && (lift === 'always' || (lift === 'dormant' && !to.some((e) => e.kind === 'group' || e.kind === 'everyone')))) {
        const own = new Set(to.map((e) => GM.principalKey(e)));
        const up = ex.filter((e) => own.has(GM.principalKey(e)));
        if (up.length) { ex = ex.filter((e) => !own.has(GM.principalKey(e))); rx.push(...up.map((e) => GM.principalKey(e))); }
      }
      return { door, resource: res, to, except: ex, removeExcept: rx };
    };
    const out = [];
    const ruleOf = (ch) => (rule ? { ...ch, rule } : ch);   // B-526c: a rule's record rides both of its rows
    if (access) out.push(ruleOf(rowOfChange(DOORS.reach, access.map(entryOfAccess).filter(Boolean), [...exceptOf(res)], except, removeExcept)));
    if (watchers) {
      const bodyOf = (w) => (bodies && w && w.mode === 'filtered' && w.filterId && bodies.get(w.filterId)) || null;
      const ch = ruleOf(rowOfChange(DOORS.watch, watchers.map((w) => entryOfWatch(w, bodyOf(w), short)).filter(Boolean), [...watchOf(res).except], watchExcept, watchRemoveExcept));   // B-526c: each entry its watcher's settings
      out.push(Array.isArray(blocks) && blocks.length ? { ...ch, blocks } : ch);
    }
    return out;
  }
  /** ONE grain's rows, written together (all or nothing). → the store's answer; lane lg-group-parents B-526c: + `short` = the
   *  watchers (principal keys) and `rule` the record could not carry whole — the caller's act then waits for the index's disk. */
  function setGrainRows(res, lists, by) {
    const s = S();
    if (!s) return { ok: false, code: 'store_unreadable', error: 'the grants store is not available — nothing was written' };
    const short = [];
    const rule = lists && lists.rule !== undefined && lists.rule !== null ? (GM.rowFieldsOf(DOORS.reach, res, { rule: lists.rule }).fields.rule || null) : undefined;
    if (rule === null) short.push('rule');
    const ch = grainChanges(res, { ...lists, rule: rule || undefined, short });
    const r = ch.length ? s.setMany(ch, by) : { ok: true, changed: [] };
    return r && r.ok ? { ...r, short } : r;
  }
  /** lane lg-group-parents (B-526c): every channel row that CARRIES something the boot's completion reads — a watch row with a
   *  watcher's settings or the agents' blocks, a rule's row with its record. → [{door, resource, to, rule?, blocks?}] (the
   *  normalized index; an unreadable store ⇒ none — nothing is completed from a record that cannot be read). */
  function rowsCarrying() {
    const out = [];
    for (const door of [DOORS.watch, DOORS.reach]) {
      const ix = doorIndex(door);
      if (ix.unreadable) return [];
      for (const [resource, r] of ix.rows) {
        if (r.unknown) continue;
        const settings = door === DOORS.watch && r.to.some((e) => e.notify === 'wake' || e.notify === 'digest');
        if (settings || r.rule || r.blocks) out.push({ door, resource, to: r.to, ...(r.rule ? { rule: r.rule } : {}), ...(r.blocks ? { blocks: r.blocks } : {}) });
      }
    }
    return out;
  }
  /** One principal's row in a conversation's `#user` / `#request` row (null level ⇒ removed). */
  function setLevel(res, principal, level, { at = null, by = 'user' } = {}) {
    const s = S();
    if (!s) return { ok: false, code: 'store_unreadable', error: 'the grants store is not available — nothing was written' };
    const r = rowOf(DOORS.reach, res);
    if (r.unreadable || r.unknown) return { ok: false, code: 'store_unreadable', error: 'this conversation\'s reach rows cannot be read — nothing was written' };
    const k = pkOf(principal);
    const rest = r.to.filter((e) => GM.principalKey(e) !== k);
    const add = level ? entryOfLevel({ principal, level, at, by }) : null;
    const up = add ? r.except.filter((e) => GM.principalKey(e) === k) : [];   // lane held-except-doors r2: granted by itself ⇒ its own exception lifted, by name
    return s.set(DOORS.reach, res, { to: add ? [...rest, add] : rest, except: r.except.filter((e) => !up.includes(e)), removeExcept: up.map((e) => GM.principalKey(e)) }, by);
  }
  /** A credential's whole tier list (`rows` in channel-acl's api shape). lane held-except-doors: the exceptions are kept with
   *  no Task Group / All agents left (they hold again when one is given back); `removeExcept` names the ones the Save takes away. */
  function setApiRows(cred, rows, { except = undefined, removeExcept = [], by = 'user' } = {}) {
    const s = S();
    if (!s) return { ok: false, code: 'store_unreadable', error: 'the grants store is not available — nothing was written' };
    const to = (Array.isArray(rows) ? rows : []).map(entryOfApi).filter(Boolean);
    const ex = except === undefined ? [...rowOf(DOORS.api, cred).except] : exceptEntries(except);
    return s.set(DOORS.api, String(cred), { to, except: ex, removeExcept: Array.isArray(removeExcept) ? removeExcept : [] }, by);
  }
  /** lane held-except-doors r2: the exceptions as STORED (the store's own row — one this release cannot read included, which
   *  the normalized index reads as none) — what a removal names. */
  const storedExcept = (s, door, res) => { const [r] = s.rowsFor(door, res); return r && Array.isArray(r.except) ? r.except : []; };
  /** Every channel row of one account (its grains, its conversations' rows, its rules) — an account removed. */
  function removeAccount(adapterId, { patternIds = [], by = 'user' } = {}) {
    const s = S();
    if (!s) return { ok: false, code: 'store_unreadable', error: 'the grants store is not available — nothing was written' };
    const list = [];
    for (const door of [DOORS.reach, DOORS.watch]) {
      for (const res of [RES.account(adapterId), RES.accountUser(adapterId), ...patternIds.map(RES.rule), ...resourcesOf(door, `conversation:${adapterId}/`)]) if (doorIndex(door).rows.has(res)) list.push({ door, resource: res, to: [], except: [], removeExcept: storedExcept(s, door, res) });   // lane held-except-doors: the account is gone — its exceptions go by name
    }
    return list.length ? s.setMany(list, by) : { ok: true, changed: [] };
  }
  /** A rule removed: its access row and its watch row. */
  function removeRule(patternId, { by = 'user' } = {}) {
    const s = S();
    if (!s) return { ok: false, code: 'store_unreadable', error: 'the grants store is not available — nothing was written' };
    const res = RES.rule(patternId);
    const list = [DOORS.reach, DOORS.watch].filter((d) => doorIndex(d).rows.has(res)).map((door) => ({ door, resource: res, to: [], except: [], removeExcept: storedExcept(s, door, res) }));   // lane held-except-doors: the rule is gone — by name
    return list.length ? s.setMany(list, by) : { ok: true, changed: [] };
  }

  return {
    DOORS, RES, grainResource, rowOf, resourcesOf, refusalOf, watchAdmitsFor, exceptBare, generation, plainGeneration, hasConversationRows, ruleIdsWithRows, ownConversationKeys, accessOf, exceptOf, conversationGrants, accountGrants, ruleGrants, apiGrants, watchOf,
    watchLists, wakeAdmits, anyReachExcept, hasAnyExcept, grainChanges, setGrainRows, setLevel, setApiRows, removeAccount, removeRule, store: S,
    entryOfWatch, watcherOfEntry, rowsCarrying,   // lane lg-group-parents B-526c
  };
}

/**
 * THE MIGRATION'S MAPPER (2026-10-grants-unify) — the channel index as it stands (PURE over the doc; `F` = channel-filter
 * for the legacy grain read — a pre-split record's single assignment lifted the way every pre-unify reader lifted it)
 * → the rows. A conversation's access-origin reach rows mirror its access list (the access list is the source); its
 * user / request rows map one-to-one (a `hidden` row grants nothing and is not carried); the account grants of origin
 * access mirror the account grain; any other origin at account scope → `account:<id>#user`. → `{rows, unknown}`.
 */
function rowsOfChannelIndex(doc, { F } = {}) {
  const ix = doc && typeof doc === 'object' ? doc : {};
  const rows = [], unknown = [];
  const push = (door, resource, to, except = []) => { if (to.length) rows.push({ door, resource, to, except }); };
  const acc = (access) => GM.fromChannelAccess(access).to;
  const watch = (watchers) => GM.fromChannelWatchers(watchers).to;
  const legacyConv = (en) => (en && en.assignment && en.assignment.principal ? en.assignment : null);
  for (const [id, g] of Object.entries(ix.accountAssignments || {})) {
    if (!g) continue;
    const gr = F.grainOf(g);
    push('channel-reach', RES.account(id), acc(gr.access));
    push('channel-watch', RES.account(id), watch(F.grainOf(g, undefined, { inherited: ['everyone:*'] }).watchers));   // every watcher listed: access still decides who is in effect
  }
  for (const [id, pa] of Object.entries(ix.patternAssignments || {})) {
    if (!pa) continue;
    const gr = F.grainOf(pa);
    push('channel-reach', RES.rule(id), acc(gr.access));
    push('channel-watch', RES.rule(id), watch(F.grainOf(pa, undefined, { inherited: ['everyone:*'] }).watchers));
  }
  for (const [key, en] of Object.entries(ix.conversations || {})) {
    if (!en) continue;
    const gr = F.grainOf({ access: en.access, watchers: en.watchers }, legacyConv(en), { inherited: ['everyone:*'] });
    push('channel-reach', RES.conversation(key), acc(gr.access));
    push('channel-watch', RES.conversation(key), watch(gr.watchers));
    // a row on a conversation's own list reached THAT conversation (the pre-unify reader asked each conversation's list) —
    // an account-scoped one kept there included: carried as that conversation's (never widened to the account)
    const mine = (x) => x && x.scope && ((x.scope.kind === 'conversation' && x.scope.id === key) || (x.scope.kind === 'adapter' && x.scope.id === en.adapterId));
    const own = (Array.isArray(en.reachEntries) ? en.reachEntries : []).filter(mine);
    push('channel-reach', RES.user(key), GM.fromChannelRows(own.filter((x) => x.origin !== 'request' && x.origin !== 'access' && x.origin !== 'assignment')).to);
    push('channel-reach', RES.request(key), GM.fromChannelRows(own.filter((x) => x.origin === 'request')).to);
    for (const x of Array.isArray(en.reachEntries) ? en.reachEntries : []) if (x && !mine(x)) unknown.push({ where: `conversation ${key}`, why: 'a reach row scoped to another conversation or account' });
  }
  const byAcct = new Map();
  for (const g of Array.isArray(ix.accountGrants) ? ix.accountGrants : []) {
    if (!g || !g.scope || g.scope.kind !== 'adapter') { unknown.push({ where: 'accountGrants', why: 'not an account-scope row' }); continue; }
    if (g.origin === 'access' || g.origin === 'assignment') continue;   // the account grain's access list is the source
    if (!byAcct.has(g.scope.id)) byAcct.set(g.scope.id, []);
    byAcct.get(g.scope.id).push(g);
  }
  for (const [id, list] of byAcct) push('channel-reach', RES.accountUser(id), GM.fromChannelRows(list).to);
  const byCred = new Map();
  for (const g of Array.isArray(ix.apiGrants) ? ix.apiGrants : []) {
    if (!g || !g.scope || !g.scope.id) { unknown.push({ where: 'apiGrants', why: 'a row with no credential' }); continue; }
    if (!byCred.has(g.scope.id)) byCred.set(g.scope.id, []);
    byCred.get(g.scope.id).push(g);
  }
  for (const [cred, list] of byCred) push('channel-api', String(cred), GM.fromChannelApiRows(list).to);
  return { rows, unknown };
}

module.exports = { create, rowsOfChannelIndex, grainResource, RES, DOORS, CHANNEL_DOORS };
