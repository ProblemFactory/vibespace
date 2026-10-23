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
 *   channel-watch   the grain's resource (as the three above)   WHO that grain's notification wakes (the settings stay
 *                                                               on the watcher row in the index, keyed by principal)
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

function create({ grants = null, dataDir = null } = {}) {
  const storeOf = () => (typeof grants === 'function' ? grants() : grants) || (dataDir ? GS.forDir(dataDir) : GS.store());
  let bound = null, unsub = null;
  const cache = new Map();          // door → {unreadable, rows: Map(resource → {to, except, unknown?})}
  const views = new WeakMap();      // a cached row → its channel-spelling views (built once per row per change)
  const S = () => {
    const s = storeOf();
    if (s !== bound) {
      if (unsub) { try { unsub(); } catch { } }
      cache.clear(); bound = s;
      unsub = s && typeof s.onChange === 'function' ? s.onChange(({ door }) => { if (CHANNEL_DOORS.includes(door)) cache.delete(door); }) : null;
    }
    return s;
  };
  function doorIndex(door) {
    const s = S();
    let ix = cache.get(door);
    if (ix) return ix;
    ix = { unreadable: !s, rows: new Map() };
    for (const r of s ? s.rowsOfDoor(door) : []) {
      if (!r || r.unreadable || r.to === null) { ix.unreadable = true; continue; }
      const n = GM.normRow(r);
      ix.rows.set(String(r.resource), Object.freeze(n.ok ? { to: Object.freeze(n.row.to), except: Object.freeze(n.row.except) } : { to: Object.freeze([]), except: Object.freeze([]), unknown: true, why: n.why }));
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
  function grantsOf(res, { scope, origin, level = null }) {
    const r = rowOf(DOORS.reach, res);
    return viewOf(r, `g|${scope.kind}:${scope.id}|${origin}`, () => r.to.map((e) => {
      const principal = GM.toChannelPrincipal(e);
      if (!principal) return null;
      const lv = level || (e.level === 'requestable' ? 'requestable' : 'visible');
      return { principal: { kind: principal.kind, id: principal.id, name: principal.kind === 'everyone' ? null : (principal.name || null) }, scope: { ...scope }, level: lv, origin, at: e.at || null, by: e.by || null, except: exceptFor(e, r.except) };
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
        return { principal: { kind: principal.kind, id: principal.id, name: principal.kind === 'everyone' ? null : (principal.name || null) }, scope: { kind: 'adapter', id: cred }, level: 'hidden', origin: 'api', api: e.tier, ...(e.perDay ? { perDay: e.perDay } : {}), at: e.at || null, by: e.by || null, except: exceptFor(e, r.except) };
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
  function wakeAdmits(res, principal, { cid, groups = [] } = {}) {
    const e = GM.fromChannelPrincipal(principal);
    if (!e || !cid) return false;
    const r = watchOf(res);
    const k = GM.principalKey(e);
    const own = r.to.filter((x) => GM.principalKey(x) === k);
    if (!own.length) return false;
    return GM.admits([{ door: DOORS.watch, resource: String(res), to: own, except: exceptFor(own[0], r.except) }], { conversationKey: String(cid), groupIds: groups }).ok;
  }
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
  const exceptEntries = (list) => (Array.isArray(list) ? list.map((x) => (x && (x.kind === 'agent' || x.kind === 'everyone') ? GM.fromChannelPrincipal(x) : GM.bareOf(x))).map((x) => x || { kind: 'invalid' }) : []);
  /** The changes ONE grain write makes — its access row and its watch row (`except` / `watchExcept` = the lists to keep:
   *  absent ⇒ the stored ones, filtered to members a group / All agents row still names). */
  function grainChanges(res, { access = null, watchers = null, except = undefined, watchExcept = undefined } = {}) {
    const out = [];
    if (access) out.push({ door: DOORS.reach, resource: res, to: access.map(entryOfAccess).filter(Boolean), except: except === undefined ? [...exceptOf(res)] : exceptEntries(except) });
    if (watchers) out.push({ door: DOORS.watch, resource: res, to: watchers.map((w) => GM.fromChannelPrincipal(w && w.principal)).filter(Boolean), except: watchExcept === undefined ? [...watchOf(res).except] : exceptEntries(watchExcept) });
    // an exception only means something beside a Task Group or All agents: none left ⇒ the list goes (never a refusal)
    for (const c of out) if (!c.to.some((e) => e.kind === 'group' || e.kind === 'everyone')) c.except = [];
    return out;
  }
  /** ONE grain's rows, written together (all or nothing). → the store's answer. */
  function setGrainRows(res, lists, by) {
    const s = S();
    if (!s) return { ok: false, code: 'store_unreadable', error: 'the grants store is not available — nothing was written' };
    const ch = grainChanges(res, lists);
    return ch.length ? s.setMany(ch, by) : { ok: true, changed: [] };
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
    return s.set(DOORS.reach, res, { to: add ? [...rest, add] : rest, except: [...r.except] }, by);
  }
  /** A credential's whole tier list (`rows` in channel-acl's api shape). */
  function setApiRows(cred, rows, { except = undefined, by = 'user' } = {}) {
    const s = S();
    if (!s) return { ok: false, code: 'store_unreadable', error: 'the grants store is not available — nothing was written' };
    const to = (Array.isArray(rows) ? rows : []).map(entryOfApi).filter(Boolean);
    const ex = to.some((e) => e.kind === 'group' || e.kind === 'everyone') ? (except === undefined ? [...rowOf(DOORS.api, cred).except] : exceptEntries(except)) : [];
    return s.set(DOORS.api, String(cred), { to, except: ex }, by);
  }
  /** Every channel row of one account (its grains, its conversations' rows, its rules) — an account removed. */
  function removeAccount(adapterId, { patternIds = [], by = 'user' } = {}) {
    const s = S();
    if (!s) return { ok: false, code: 'store_unreadable', error: 'the grants store is not available — nothing was written' };
    const list = [];
    for (const door of [DOORS.reach, DOORS.watch]) {
      for (const res of [RES.account(adapterId), RES.accountUser(adapterId), ...patternIds.map(RES.rule), ...resourcesOf(door, `conversation:${adapterId}/`)]) if (doorIndex(door).rows.has(res)) list.push({ door, resource: res, to: [], except: [] });
    }
    return list.length ? s.setMany(list, by) : { ok: true, changed: [] };
  }
  /** A rule removed: its access row and its watch row. */
  function removeRule(patternId, { by = 'user' } = {}) {
    const s = S();
    if (!s) return { ok: false, code: 'store_unreadable', error: 'the grants store is not available — nothing was written' };
    const res = RES.rule(patternId);
    const list = [DOORS.reach, DOORS.watch].filter((d) => doorIndex(d).rows.has(res)).map((door) => ({ door, resource: res, to: [], except: [] }));
    return list.length ? s.setMany(list, by) : { ok: true, changed: [] };
  }

  return {
    DOORS, RES, grainResource, rowOf, resourcesOf, accessOf, exceptOf, conversationGrants, accountGrants, ruleGrants, apiGrants, watchOf,
    watchLists, wakeAdmits, anyReachExcept, hasAnyExcept, grainChanges, setGrainRows, setLevel, setApiRows, removeAccount, removeRule, store: S,
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
