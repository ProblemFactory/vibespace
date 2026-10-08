'use strict';
/**
 * THE ACCESS FAMILY of the Channels engine (lane dc-channels-seams, 2026-10-05 — rv-channels-core C11): moved
 * VERBATIM out of channels-engine.js's one `create()` closure. Who may see and be woken by what: the policy and
 * the grain lists (filters, assignments, watchers, the ledger rows), an agent's REACH and its requests (access,
 * watch, the directory), the agent's reads (list / read / thread / status / search / around — the reach check
 * before the read), the access dialog's verbs (setGrain / setAccess / setWatchers / setAssignment / setFilter)
 * and the boot migrations of the grant shapes. Nothing here calls a vendor except through the engine's doors in
 * `engineCtx`. The access-gate census's producers (accessFor, the grain views) live here.
 */

const crypto = require('crypto');
const caps = require('../channel-caps.js');
const F = require('../channel-filter.js');
const WS = require('../channel-watch-spec.js');   // lane agent-watch-parity: the agent's watch = the Notify dialog's grammar, judged by the same validators
const P = require('../channel-policy.js');
const ACL = require('../channel-acl.js');
const { toAgentText: agentText } = require('../peer-text.js');
const { searchRowOf } = require('../channels/index.js');
const SR = require('../channel-search.js');

/** THE FAMILY'S FACTORY — `engineCtx` is the engine's ONE context object (channels-engine.js, the composition root): every
 *  field this family reads is named in the destructure below (test-architecture §79 pins the list), and what it answers
 *  is merged back into the same object for the engine and the families created after it. */
function create(engineCtx) {
  const {
    agentTitle, agentId, INBOX_KEY, i18nKey, INBOX_SOURCE, RESOLVED_BY, RECONCILE_SECONDS, ESTIMATE_CAP, registry, liveSessions, log, now, userTodos,
    store, adapterRecords, adapterFor, tiers, agentShareRefusal, isWatched, laneOf, effectiveConvCaps, rawFactsOf, viewOf, agentCopy, humanNameOf,
    vendorNameOf, notify, known, withView, NOT_A_THREAD, threadRead, vendorSearch, aroundFor, clearWakeTimer, coalesceSeconds, ownRecordOf,
  } = engineCtx;
  // created AFTER this family: read through the context at call time
  const sendIdentityFor = (...a) => engineCtx.sendIdentityFor(...a);
  const proposalsFor = (...a) => engineCtx.proposalsFor(...a);
  const agentProposalView = (...a) => engineCtx.agentProposalView(...a);
  /** Decision 9: external = review, internal = direct. The conversation's
   *  own policy (P3, `PUT …/policy`) wins; without one the adapter MODULE's
   *  declared default applies (the built-in Agents adapter declares
   *  `direct`); anything unreadable is review — fail closed (§9.1). */
  function policyFor(rec, en) {
    const own = en && en.policy && typeof en.policy === 'object' ? en.policy : null;
    const pc = rec ? (() => { try { return registry.capsOf(rec.kind); } catch { return null; } })() : null;   // design 012: the vendor's allowed modes
    if (own && own.mode) return { mode: P.policyMode(own, pc).mode, source: 'conversation', declared: own.mode, modes: P.policyModesOf(pc) };
    // R4 (B-6acc): the ACCOUNT's own policy (`PUT /api/channels/adapters/:id
    // {policy}`) — what a NEW message composed on the account reads, and the
    // default of every conversation that sets none
    const acct = rec && rec.policy && typeof rec.policy === 'object' ? rec.policy : null;
    if (acct && acct.mode) return { mode: P.policyMode(acct, pc).mode, source: 'account', declared: acct.mode, modes: P.policyModesOf(pc) };
    let dflt = null;
    try { dflt = registry.get(rec.kind).policyDefault || null; } catch {}
    const pm = P.policyMode(dflt || 'review', pc);
    return { mode: pm.mode, source: dflt ? 'adapter-default' : 'default', declared: dflt || null, modes: P.policyModesOf(pc) };
  }
  function policyRequiresReview(rec, en) { return policyFor(rec, en).mode === 'review'; }
  /** The two READ-TIME facts `authority:'send'` is capped by (§7.3). */
  function authorityCapsFor(rec, en, t) {
    const c = registry.capsOf(rec.kind);
    const u = caps.offers(c, effectiveConvCaps(rec, en), 'send-as-user', t);
    const b = caps.offers(c, effectiveConvCaps(rec, en), 'send-as-bot', t);
    const offersSend = !!(u.offered || b.offered);
    return { offersSend, sendWhy: offersSend ? null : (u.why || b.why || 'unknown'), policyRequiresReview: policyRequiresReview(rec, en) };
  }
  /** Heal an entry to the P2 shape (rows seeded before P2 carry none of it). */
  function healP2(en) {
    if (!en.stats || typeof en.stats !== 'object') en.stats = { hits7d: 0, msgs7d: 0 };
    if (!Array.isArray(en.stats.hits)) en.stats.hits = [];
    if (!Array.isArray(en.stats.wakes)) en.stats.wakes = [];
    if (!Array.isArray(en.stats.msgs)) en.stats.msgs = [];
    if (!Array.isArray(en.pending)) en.pending = [];
    if (!Number.isFinite(en.pendingElided)) en.pendingElided = 0;
    if (!en.pendingElidedBy || typeof en.pendingElidedBy !== 'object') en.pendingElidedBy = {};   // R4: per watcher (`kind:id`)
    if (!Array.isArray(en.reachEntries)) en.reachEntries = [];
    if (!Array.isArray(en.reachRequests)) en.reachRequests = [];   // P3 (§8): open/decided access requests
    return en;
  }
  function filtersOf(ix) { if (!ix.filters || typeof ix.filters !== 'object') ix.filters = {}; return ix.filters; }
  function rotationsOf(ix) { if (!ix.rotations || typeof ix.rotations !== 'object') ix.rotations = {}; return ix.rotations; }
  function filterFor(filterId) {
    if (!filterId) return null;
    const filters = store.index.table('filters');   // B-f32b: the one filter copied, never the index
    const f = filters && filters[filterId];
    return f ? JSON.parse(JSON.stringify(f)) : null;
  }
  /** A conversation's OWN grain as the compatibility reader expects it (the
   *  pre-split `assignment` shape: its first watcher, the authority of that
   *  principal's access row clamped by both caps, §7.3 (a)) — null when the
   *  conversation holds no row of its own. */
  function assignmentView(rec, en, t) {
    const g = convGrainOf(en);
    if (!g.access.length && !g.watchers.length) return null;
    const v = grainView(rec, g, t, { capsNow: authorityCapsFor(rec, en, t) });
    const lead = v.watchers[0] ? v.access.find((r) => pkOf(r.principal) === pkOf(v.watchers[0].principal)) : v.access[0];
    return { ...v, scope: { kind: 'conversation', id: en.key }, authority: lead ? lead.authority : 'draft', authorityStored: lead ? lead.authorityStored : 'draft', authorityClamped: !!(lead && lead.authorityClamped), authorityWhy: lead ? lead.authorityWhy : null, authorityWhyCap: lead ? lead.authorityWhyCap : null };
  }
  /** Pending hits by WATCHER (R4): every entry names the principal it waits
   *  for (`for`); an entry from before the split (no `for`) and the untagged
   *  elided count belong to the FIRST watcher in effect — the one that was
   *  the only assignment when it was held. */
  function pendingOf(en, pk, eff) {
    const firstPk = eff && eff.watchers[0] ? pkOf(eff.watchers[0].watcher.principal) : null;
    const mine = (p) => p && (p.for ? p.for === pk : pk === firstPk);
    const list = (Array.isArray(en && en.pending) ? en.pending : []).filter(mine);
    const elidedTagged = Number(en && en.pendingElidedBy && en.pendingElidedBy[pk]) || 0;
    const elidedUntagged = pk === firstPk ? (Number(en && en.pendingElided) || 0) : 0;
    return { hits: list.map((p) => ({ record: p.record, why: p.why || [], ...(p.sent ? { sent: p.sent } : {}) })), ids: new Set(list.map((p) => p.record && p.record.id).filter(Boolean)), elidedTagged, elidedUntagged, elided: elidedTagged + elidedUntagged };
  }
  /** Drop what one delivery CARRIED (and nothing else) from `pending`. */
  function clearCarried(e2, pk, eff, carried) {
    const firstPk = eff && eff.watchers[0] ? pkOf(eff.watchers[0].watcher.principal) : null;
    const mine = (p) => p && (p.for ? p.for === pk : pk === firstPk);
    e2.pending = e2.pending.filter((p) => !(mine(p) && p.record && carried.ids.has(p.record.id)));
    if (carried.elidedTagged) { if (!e2.pendingElidedBy || typeof e2.pendingElidedBy !== 'object') e2.pendingElidedBy = {}; e2.pendingElidedBy[pk] = Math.max(0, (Number(e2.pendingElidedBy[pk]) || 0) - carried.elidedTagged); if (!e2.pendingElidedBy[pk]) delete e2.pendingElidedBy[pk]; }
    if (carried.elidedUntagged) e2.pendingElided = Math.max(0, (Number(e2.pendingElided) || 0) - carried.elidedUntagged);
  }
  const elidedTotal = (en) => (Number(en && en.pendingElided) || 0) + Object.values((en && en.pendingElidedBy) || {}).reduce((n, v) => n + (Number(v) || 0), 0);
  function statsView(en, t) {
    const s = (en && en.stats) || {};
    const wakes = Array.isArray(s.wakes) ? s.wakes : [];
    const okWakes = wakes.filter((w) => w && w.ok !== false);
    const last = wakes.length ? wakes[wakes.length - 1] : null;
    return {
      hits7d: F.countSince(s.hits, t, 7),
      msgs7d: F.countSince(s.msgs, t, 7),
      wakes24h: okWakes.filter((w) => Number(w.at) > t - 86400e3).length,
      wakes7d: okWakes.filter((w) => Number(w.at) > t - 7 * 86400e3).length,
      lastWake: last ? { at: last.at, n: last.n, ok: last.ok !== false, lane: last.lane || null, why: last.why || null, cid: last.cid || null, refused: last.refused || null } : null,
      pending: (Array.isArray(en && en.pending) ? en.pending.length : 0) + elidedTotal(en),
      lastRefusal: s.lastRefusal || null,
    };
  }
  /** THE HONEST LATENCY CLAIM per lane (§19 P2): what "a wake arrives
   *  within …" truthfully means for THIS row right now. Structure; the
   *  editor words it. The poll number is the tick's own (hot, because an
   *  assigned conversation is hot). */
  function wakeLatencyFor(rec, en, lane, t) {
    const c = registry.capsOf(rec.kind);
    if (lane.via === 'scan') {
      const secs = lane.source && c.scanLatency ? Number(c.scanLatency[lane.source]) : null;
      return { lane: 'scan', source: lane.source || null, seconds: Number.isFinite(secs) ? secs : null, coalesceSeconds: 0, why: lane.source ? null : (lane.why || 'no-source') };
    }
    if (lane.via === 'push' && lane.carryContent) {
      const cs = coalesceSeconds();
      return { lane: 'push', seconds: Math.ceil(cs + (Number(c.pushAckBudgetMs) || 3000) / 1000), coalesceSeconds: cs, why: null };
    }
    const cad = caps.cadenceFor(c, lane, en, t, { tiers: tiers(), watched: isWatched(en && en.key, t) });
    if (cad.paused) return { lane: 'paused', seconds: null, coalesceSeconds: 0, why: 'paused' };
    if (lane.pollCadence === 'reconcile') return { lane: 'reconcile', seconds: cad.seconds || RECONCILE_SECONDS, coalesceSeconds: 0, why: null };
    // lane lark-search-poll: a CARRYING change feed — a message is found within one tick plus the overlap (an open window's 30 s is shorter)
    if (lane.pollCadence === 'feed') return { lane: 'feed', seconds: Math.min(Number(lane.feedSeconds) || cad.seconds || 90, cad.seconds || Infinity), coalesceSeconds: 0, why: null };
    return { lane: 'poll', seconds: cad.seconds || 30, tier: cad.tier, coalesceSeconds: 0, kick: lane.via === 'push', why: null };
  }

  // ── THE THREE GRAINS, TWO LISTS EACH (R4, 2026-09-27, design §7.3) ────
  // Every grain — the conversation (on its entry), a PATTERN (the conversations
  // a rule matches), the ACCOUNT — holds an ACCESS list (who may see and act,
  // with an authority) and a WATCHERS list (who is woken, and on what). Access
  // is the PREREQUISITE of notification (a watcher's principal must hold
  // access at the same grain; removing the access removes the watcher). Per
  // principal the finest grain that names it decides — PURE
  // (`F.effectiveGrants`). The account and pattern records live in index
  // tables; every WATCHER carries its OWN pace ledger (`stats.wakes`), so a
  // cap is per (principal, scope): one 40/day ledger per conversation of an
  // 800-thread account would be 32 000 wakes a day, and one ledger shared by
  // two watchers would let one starve the other.
  function accountGrainOf(adapterId) { const tb = store.index.table('accountAssignments'); return (tb && tb[adapterId]) || null; }
  function patternsOf(adapterId) { const tb = store.index.table('patternAssignments') || {}; return Object.values(tb).filter((p) => p && p.adapterId === adapterId); }
  function patternById(id) { const tb = store.index.table('patternAssignments') || {}; return tb[id] || null; }
  const pkOf = (p) => F.principalKey(p);
  /** A conversation's pre-split single assignment, with the pace ledger it
   *  used (`en.stats.wakes` minus the inherited grains' mirrors) — what the
   *  reader-side lift and the migration turn into one access + one watcher. */
  function legacyConvAssignment(en) {
    const a = en && en.assignment;
    if (!a || !a.principal) return null;
    const s = (en.stats && typeof en.stats === 'object') ? en.stats : {};
    return { ...a, stats: { wakes: (Array.isArray(s.wakes) ? s.wakes : []).filter((w) => w && (!w.grain || w.grain === 'conversation')), hits: Array.isArray(s.hits) ? s.hits.slice() : [], lastRefusal: s.lastRefusal || null } };
  }
  /** A conversation's OWN grain `{access, watchers}` (a pre-split entry read
   *  the same way — merged, never a fallback). */
  function convGrainOf(en) { return F.grainOf({ access: en && en.access, watchers: en && en.watchers }, legacyConvAssignment(en), { inherited: en ? convInheritedOf(en) : [] }); }
  /** lane channel-agent-watch W3 — ACCESS IS MAX OVER THE GRAIN AND ITS ANCESTORS: the principal keys a VISIBLE grant
   *  names (`grants`; `skipOwn` = leave out the conversation's own access-origin rows, which a write is replacing). */
  function visibleKeysOf(grants, { skipOwnScope = null } = {}) {
    const out = [];
    for (const g of Array.isArray(grants) ? grants : []) {
      if (!g || !g.principal || g.level !== 'visible') continue;
      if (skipOwnScope && g.scope && g.scope.kind === skipOwnScope.kind && g.scope.id === skipOwnScope.id && (g.origin === 'access' || g.origin === 'assignment')) continue;
      const k = pkOf(g.principal.kind === 'everyone' ? { kind: 'everyone', id: '*' } : g.principal);
      if (k) out.push(k);
    }
    return out;
  }
  /** The account-scope grants of one account, as keys (`skipAccess` = leave out the account grain's own access rows). */
  function accountGrantKeys(adapterId, { skipAccess = false } = {}) {
    const acct = (store.index.table('accountGrants') || []).filter((g) => g && g.scope && g.scope.kind === 'adapter' && g.scope.id === adapterId && (!skipAccess || (g.origin !== 'access' && g.origin !== 'assignment')));
    return visibleKeysOf(acct);
  }
  /** Who holds access ABOVE one conversation: the account grain's rows + its grants, every matching rule's rows, and
   *  every visible grant that reaches it (an approved request, a hand-written grant) — `skipOwn` leaves out the
   *  conversation's own access rows (a write replacing them judges by the NEW list). */
  function convInheritedOf(en, { skipOwn = false } = {}) {
    const acc = F.grainOf(accountGrainOf(en.adapterId), undefined, { inherited: accountGrantKeys(en.adapterId) }).access;
    const pats = [];
    for (const pa of patternsOf(en.adapterId)) if (pa && pa.pattern && F.matchConversation(pa.pattern, convFacts(en)).hit) pats.push(...F.grainOf(pa).access);
    const grants = visibleKeysOf(grantsOfConversation(en), skipOwn ? { skipOwnScope: { kind: 'conversation', id: en.key } } : {});
    return [...acc, ...pats, ...grants];
  }
  /** Who holds access above a grain being WRITTEN (setGrain's watcher check): a conversation's ancestors, an account's
   *  own non-access grants, a rule's account. */
  function siteInheritedOf(site) {
    if (site.kind === 'conversation') return site.holder ? convInheritedOf(site.holder, { skipOwn: true }) : [];
    const aid = site.rec && site.rec.id;
    if (site.kind === 'account') return accountGrantKeys(aid, { skipAccess: true });
    return [...F.grainOf(accountGrainOf(aid)).access, ...accountGrantKeys(aid)];
  }
  /** The facts a pattern matches over (PURE input). */
  function convFacts(en) { return { title: (en && en.title) || '', participants: (en && en.participants) || '', kind: (en && en.kind) || '', authors: (en && Array.isArray(en.authors)) ? en.authors : [] }; }
  /** WHO HAS ACCESS AND WHO WATCHES — the ONE answer for a conversation. */
  function effectiveFor(en) {
    if (!en) return null;
    return F.effectiveGrants({ conversation: convGrainOf(en), patterns: patternsOf(en.adapterId), account: accountGrainOf(en.adapterId) }, convFacts(en), { grantKeys: visibleKeysOf(grantsOfConversation(en)), accountKeys: accountGrantKeys(en.adapterId) });
  }
  /** The running agent conversations an ALL-AGENTS watcher fans out to (`[{cid, name}]`, the live roster now). */
  function fanTargets() {
    let live = [];
    try { live = liveSessions() || []; } catch (err) { log.warn(`[channels] liveSessions threw: ${(err && err.message) || err}`); }
    return live.filter((x) => x && x.cid).map((x) => ({ cid: String(x.cid), name: x.name || null, groups: Array.isArray(x.groups) ? x.groups.map(String) : [] }));
  }
  /** THE ANSWER EVERY WAKE PATH READS (lane everyone-principal): `effectiveFor` with every ALL-AGENTS watcher fanned
   *  out to one item per RUNNING conversation (F.fanOutWatchers — each its own key, pending, timers, scope chain and
   *  pace LEDGER: a cap of N is N wakes per conversation, never N shared and never uncapped). `base` = the answer as
   *  the views read it (one All row). Every view path keeps `effectiveFor`. */
  function wakeEffOf(en) {
    const e0 = effectiveFor(en);
    if (!e0) return e0;
    // lane notify-rules-r2: a member session's watcher (`via` its group) is RE-JUDGED on every wake — a session that left
    // the group (or is not running: membership unknown) is not woken; its row stays, inert, until it is a member again
    const hasVia = e0.watchers.some((it) => it && it.watcher && it.watcher.via);
    const members = hasVia ? membersNow() : null;
    const e = hasVia ? { ...e0, watchers: e0.watchers.filter((it) => F.memberStill(it.watcher, members)) } : e0;
    const x = F.fanOutWatchers(e, fanTargets(), { filterOf: (w) => (w && w.mode === 'filtered' ? filterFor(w.filterId) : null) });   // lane reply-to-sent: a group row's sent half per member
    return x === e && e === e0 ? e : { ...x, base: e0 };
  }
  /** A grain's stored watcher for key `pk` — a fan-out key (`everyone:*><cid>`) answers the stored All row as that
   *  conversation's watcher while the conversation runs (null when it stopped: nobody waits for its hits). */
  function storedWatcherFor(holder, pk) {
    const list = holder ? F.grainOf(holder).watchers : [];
    const fan = F.fanOfKey(pk);
    if (!fan) return list.find((x) => pkOf(x.principal) === pk) || null;
    const root = list.find((x) => pkOf(x.principal) === fan.root);
    if (!root) return null;
    const tg = fanTargets().find((x) => x.cid === fan.cid && (root.principal.kind !== 'group' || x.groups.includes(String(root.principal.id))));   // a member that left its group waits for nothing
    return tg ? F.fanWatcher(root, tg.cid, tg.name) : null;
  }
  /** Is THIS item the watcher of principal `pk`? */
  const itemIs = (item, pk) => !!item && pkOf((item.watcher || item.row).principal) === pk;
  /** A WATCHER's scope chain / scope timer key — per (grain, principal): the
   *  conversation grain has none (its conversation chain covers its ledger). */
  const scopeKeyOf = (item, rec) => (item.source === 'account' ? `acct:${rec.id}|${pkOf(item.watcher.principal)}` : item.source === 'pattern' ? `pat:${item.patternId}|${pkOf(item.watcher.principal)}` : null);
  /**
   * LIFT a stored grain to the two lists IN PLACE (inside `update()` only):
   * a record written before the split becomes one access row + one watcher
   * row; the account's origin-`assignment` grant is renamed `access`. The
   * migration does this to every row at boot; a write reaching a record the
   * migration has not seen yet (the engine starts before the runner) lifts
   * exactly that record first, so a ledger is never written to a copy.
   */
  function liftGrainInPlace(ix, holder, kind) {
    if (!holder) return holder;
    if (kind === 'conversation') {
      const legacy = legacyConvAssignment(holder);
      if (legacy || !Array.isArray(holder.access) || !Array.isArray(holder.watchers)) {
        const g = F.grainOf({ access: holder.access, watchers: holder.watchers }, legacy);
        holder.access = g.access; holder.watchers = g.watchers;
        if (legacy) {
          const pk = pkOf(legacy.principal);
          for (const p of Array.isArray(holder.pending) ? holder.pending : []) if (p && !p.for) p.for = pk;
          if (Number(holder.pendingElided) > 0) { if (!holder.pendingElidedBy || typeof holder.pendingElidedBy !== 'object') holder.pendingElidedBy = {}; holder.pendingElidedBy[pk] = (Number(holder.pendingElidedBy[pk]) || 0) + Number(holder.pendingElided); holder.pendingElided = 0; }
        }
        if ('assignment' in holder) delete holder.assignment;
        if (Array.isArray(holder.reachEntries)) for (const g2 of holder.reachEntries) if (g2 && g2.origin === 'assignment') g2.origin = 'access';
      }
      return holder;
    }
    const lifted = F.liftGrainRecord(holder);
    if (lifted.changed) {
      for (const k of Object.keys(holder)) delete holder[k];
      Object.assign(holder, lifted.rec);
      if (kind === 'account' && Array.isArray(ix.accountGrants)) for (const g2 of ix.accountGrants) if (g2 && g2.origin === 'assignment' && g2.scope && g2.scope.kind === 'adapter' && g2.scope.id === holder.adapterId) g2.origin = 'access';
    }
    if (!Array.isArray(holder.access)) holder.access = [];
    if (!Array.isArray(holder.watchers)) holder.watchers = [];
    return holder;
  }
  /** The LIVE watcher row an effective item names, inside `update()` — the
   *  one its pace ledger is written to (lifting a pre-split record first). */
  function watcherRef(ix, rec, en2, item) {
    const pk = pkOf(item.watcher.principal);
    // ALL AGENTS (lane everyone-principal): a fan-out target's ledger is ITS OWN — `stats.fan[<cid>]` of the stored
    // All row, returned as `{stats}` so every writer below (reserve / finalize / refusal / hits) lands there
    const fan = F.fanOfKey(pk);
    let holder = null;
    if (item.source === 'conversation') holder = en2 ? liftGrainInPlace(ix, en2, 'conversation') : null;
    else if (item.source === 'account') holder = liftGrainInPlace(ix, (ix.accountAssignments || {})[rec.id] || null, 'account');
    else holder = liftGrainInPlace(ix, (ix.patternAssignments || {})[item.patternId] || null, 'pattern');
    const w = holder && Array.isArray(holder.watchers) ? holder.watchers.find((x) => pkOf(x.principal) === (fan ? fan.root : pk)) : null;
    if (w && (!w.stats || typeof w.stats !== 'object')) w.stats = { wakes: [], hits: [] };
    if (!w || !fan) return w;
    if (!w.stats.fan || typeof w.stats.fan !== 'object') w.stats.fan = {};
    F.pruneFan(w.stats, now());
    const sub = w.stats.fan[fan.cid] && typeof w.stats.fan[fan.cid] === 'object' ? w.stats.fan[fan.cid] : (w.stats.fan[fan.cid] = { wakes: [], hits: [] });
    if (!Array.isArray(sub.wakes)) sub.wakes = [];
    if (!Array.isArray(sub.hits)) sub.hits = [];
    return { stats: sub, fanOf: w };
  }
  /** One watcher's ledger view (the card's "N wakes / 24 h"). */
  function ledgerView(s0, t) {
    const s = s0 || {};
    const okWakes = F.ledgerRowsOf(s).filter((w) => w && w.ok !== false);   // an All row: every conversation's ledger
    return { hits7d: F.countSince(s.hits, t, 7), wakes24h: okWakes.filter((w) => Number(w.at) > t - 86400e3).length, wakes7d: okWakes.filter((w) => Number(w.at) > t - 7 * 86400e3).length, lastRefusal: s.lastRefusal || null };
  }
  function accessRowView(row, capsNow = null) {
    const base = { principal: { kind: row.principal.kind, id: row.principal.id, name: row.principal.name || null }, authority: row.authority, createdAt: row.createdAt || null, updatedAt: row.updatedAt || null };
    if (!capsNow) return base;
    const cl = F.effectiveAuthority(row, capsNow);
    return { ...base, authority: cl.authority, authorityStored: row.authority, authorityClamped: cl.clamped, authorityWhy: cl.why || null, authorityWhyCap: cl.whyCap || null };
  }
  function watcherView(w, t) {
    return {
      principal: { kind: w.principal.kind, id: w.principal.id, name: w.principal.name || null },
      notify: w.notify, mode: w.mode, filterId: w.filterId || null, filter: w.filterId ? filterFor(w.filterId) : null, digestMinutes: w.digestMinutes, dailyWakeCap: w.dailyWakeCap, receiptWake: !!w.receiptWake,
      createdAt: w.createdAt || null, updatedAt: w.updatedAt || null, estimateAtSet: w.estimateAtSet || null, stats: ledgerView(w.stats, t),
      // lane channel-agent-watch: the row's delivery + who wrote it ride the view — a dialog's whole-list save sends
      // them back unchanged (a view without them would turn an agent's next-turn row into the owner's wake row)
      ...(w.delivery ? { delivery: F.deliveryModeOf(w) } : {}), ...(w.origin === 'agent' ? { origin: 'agent' } : {}),
    };
  }
  /** lane channel-agent-watch W3: who may be notified on this conversation WITHOUT an access row of its own — access
   *  above it (the account, a matching rule) or a visible grant here (an approved request); one row per principal. */
  function eligibleAboveView(en) {
    const out = new Map();
    const add = (p, via) => { const k = p && pkOf(p.kind === 'everyone' ? { kind: 'everyone', id: '*' } : p); if (k && !out.has(k)) out.set(k, { principal: { kind: p.kind, id: p.kind === 'everyone' ? '*' : p.id, name: p.name || null }, via }); };
    for (const r of F.grainOf(accountGrainOf(en.adapterId), undefined, { inherited: accountGrantKeys(en.adapterId) }).access) add(r.principal, 'account');
    for (const pa of patternsOf(en.adapterId)) if (pa && pa.pattern && F.matchConversation(pa.pattern, convFacts(en)).hit) for (const r of F.grainOf(pa).access) add(r.principal, 'pattern');
    for (const g of grantsOfConversation(en)) if (g && g.level === 'visible' && g.principal && !(g.scope && g.scope.kind === 'conversation' && (g.origin === 'access' || g.origin === 'assignment'))) add(g.principal, g.scope && g.scope.kind === 'adapter' ? 'account' : 'grant');
    return [...out.values()];
  }
  /** A grain's two lists as the card and the dialogs read them, + the FIRST
   *  watcher's (else the first access row's) fields flat beside them — the
   *  pre-split single-assignment shape a legacy reader expects. */
  function grainView(rec, holder, t = now(), { capsNow = null } = {}) {
    const g = F.grainOf(holder);
    const access = g.access.map((r) => accessRowView(r, capsNow));
    const watchers = g.watchers.map((w) => watcherView(w, t));
    const lead = watchers[0] || null;
    const leadAccess = lead ? access.find((r) => pkOf(r.principal) === pkOf(lead.principal)) : access[0] || null;
    const flat = lead ? { ...lead, authority: leadAccess ? leadAccess.authority : 'draft' } : (leadAccess ? { principal: leadAccess.principal, authority: leadAccess.authority, notify: null, mode: null, stats: ledgerView(null, t) } : {});
    return {
      ...flat,
      id: holder && holder.id ? holder.id : null, scope: (holder && holder.scope) || null,
      pattern: (holder && holder.pattern) || null, patternLabel: holder && holder.pattern ? F.patternSummary(holder.pattern) : null,
      createdAt: (holder && holder.createdAt) || null, updatedAt: (holder && holder.updatedAt) || null,
      access, watchers,
    };
  }
  /** The principal's reach on ONE conversation. The built-in Agents adapter
   *  answers with msg-acl through the ONE crosswalk (§12.3); every other
   *  adapter with channel-acl over the row's grants. */
  function reachFor(ctx, rec, en) {
    if (!ctx || ctx.kind === 'user') return { level: 'visible', via: 'user', grantId: null };
    let mod = null;
    try { mod = registry.get(rec.kind); } catch {}
    if (mod && mod.builtin) {
      const lv = typeof ctx.msgLevelFor === 'function' ? ctx.msgLevelFor(en.id) : 'none';
      return { level: ACL.fromMsgLevel(lv), via: 'msg-acl', grantId: null };
    }
    const target = { key: en.key, adapterId: en.adapterId };
    return ACL.effective(ctx, target, grantsOfConversation(en, target));
  }
  /** EVERY grant that applies to ONE conversation (2026-09-26, §8): its own
   *  rows, the ACCOUNT-scope rows, and the rows a matching PATTERN's ACCESS
   *  list implies (R4: one per access row) — derived here at read time,
   *  never stored. A conversation's own access rows before the migration
   *  reached it (a legacy `assignment` with no reach row) grant too. */
  function grantsOfConversation(en, target = { key: en.key, adapterId: en.adapterId }) {
    const acct = (store.index.table('accountGrants') || []).filter((g) => g && g.scope && g.scope.kind === 'adapter' && g.scope.id === en.adapterId);
    const derived = [];
    for (const pa of patternsOf(en.adapterId)) {
      if (!F.matchConversation(pa.pattern, convFacts(en)).hit) continue;
      for (const r of F.grainOf(pa).access) {
        try { derived.push(ACL.patternGrant({ principal: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null }, key: en.key, patternId: pa.id })); } catch { /* a malformed principal grants nothing */ }
      }
    }
    return ACL.grantsForConversation(target, { entries: en.reachEntries || [], accountGrants: acct, patternGrants: derived });
  }
  /** THE MEMBERSHIP CROSSWALK (lane notify-rules-r2): the live roster as `[{cid, groups}]` — the task groups each live
   *  session belongs to (server.js liveSessions: tasks.groupsForSession, the same crosswalk the group round-robin wakes
   *  over). A group's access reaches its member sessions as notification targets through it (F.memberVia / memberStill). */
  function membersNow() {
    try { return (liveSessions() || []).filter((x) => x && x.cid).map((x) => ({ cid: String(x.cid), groups: Array.isArray(x.groups) ? x.groups.map(String) : [] })); } catch { return []; }
  }
  /** The groups a live session belongs to (a drafter's, for its receipt). */
  function groupsOfSession(cid) {
    try { const s = (liveSessions() || []).find((x) => x && x.cid === cid); return s && Array.isArray(s.groups) ? s.groups.slice() : []; } catch { return []; }
  }
  function convFor(adapterId, convId) {
    const en = store.index.peek(`${adapterId}/${convId}`);   // B-f32b: a copy of THAT row, never of the index
    const rec = en ? adapterRecords().adapters.find((r) => r.id === adapterId) || null : null;
    return { en, rec };
  }
  /**
   * REACH RE-ASKED AFTER AN AWAIT (lane channel-threads verify r2, IDENTITY): every agent verb asks reach FIRST, and
   * one that awaited since (a vendor call — the thread walk, the refresh; a convCaps lookup before a draft; the store's
   * search) asks AGAIN before it answers or creates anything. The owner's revoke can land inside the await: the walk's
   * answer used to carry its count and the title, a reaction / reply draft was CREATED for an agent that no longer had
   * access (its answer quoting the target), and a search returned the revoked conversation's messages. `true` for the
   * user (the owner sees everything); a composed message's scope is the ACCOUNT (`convId` null).
   */
  function stillSees(ctx, adapterId, convId) {
    if (!ctx || ctx.kind !== 'agent') return true;
    try {
      if (convId === null || convId === undefined) return ACL.canSee(ACL.effective(ctx, { key: '', adapterId }, accountScopeGrants(adapterId)).level);
      // the LIVE entry, read-only (verify r3, the event loop): `convFor` deep-clones the whole index (`snapshot()`), and
      // the stash gate asks this per waiting entry per read — a digest flood over 64 agents' full stashes spent 14 ms
      // per reaction event cloning an index whose sentBy ledger was 12 800 ids (80 ms → 57 s for 4 000 events)
      const en = store.index.live()[`${adapterId}/${convId}`] || null;
      const rec = en ? adapterRecords().adapters.find((r) => r.id === adapterId) || null : null;
      return !!(en && rec && rec.enabled !== false && ACL.canSee(reachFor(ctx, rec, en).level));
    } catch { return false; }
  }

  /** The ACCOUNT grain alone, as `effectiveGrants` answers it (a NEW
   *  conversation has no facts for a rule to match, so only the account's
   *  own rows apply to a composed message). */
  function effectiveForAccount(adapterId) { return F.effectiveGrants({ account: accountGrainOf(adapterId) }, {}, { accountKeys: accountGrantKeys(adapterId) }); }
  /** The account-scope grants (reach to the WHOLE account). */
  function accountScopeGrants(adapterId) { return (store.index.table('accountGrants') || []).filter((g) => g && g.scope && g.scope.kind === 'adapter' && g.scope.id === adapterId); }
  /**
   * THE AGENT'S SEARCH (R4): the owner's search (`search`, off the event
   * loop, byte-capped) over every account the caller can see anything of —
   * each result filtered by REACH, so a hit in a conversation the agent
   * cannot see is simply absent (no oracle). Never a vendor call.
   */
  async function searchFor(ctx, q, { adapterId = null, limit = 50, full = false } = {}) {
    const query = String(q || '').trim();
    if (query.length < 2) return { ok: false, code: 'bad-request', error: 'a search needs at least 2 characters' };
    const n = Math.min(200, Math.max(1, Number(limit) || 50));
    if (full) return searchFullFor(ctx, query, { adapterId, limit: n });
    let covered = 0;
    const results = [];
    let truncated = false;
    for (const rec of adapterRecords().adapters) {
      if (rec.enabled === false || (adapterId && rec.id !== adapterId)) continue;
      const visible = new Map();
      for (const en of Object.values(store.index.live())) if (en && en.adapterId === rec.id && ACL.canSee(reachFor(ctx, rec, en).level)) visible.set(en.id, agentTitle(en, en.id));   // verify r1 F2: the title through the belt
      if (!visible.size) continue;
      // only the VISIBLE conversations' logs are read at all
      const r = await store.search(rec.id, query, { limit: 200, convIds: [...visible.keys()] });
      truncated = truncated || !!r.truncated;
      covered += (r.coverage && r.coverage.scanned) || 0;   // design 010: what was searched — of what it can see only
      // verify r2 (IDENTITY): the search was an await — a conversation whose reach was removed meanwhile gives nothing
      for (const cid of [...visible.keys()]) if (!stillSees(ctx, rec.id, cid)) visible.delete(cid);
      for (const x0 of r.results) {
        if (!visible.has(x0.convId)) continue;
        const x = viewOf(rec, x0);   // lane channel-rich: the same read-time view (a bot's name, markup read)
        const ax = agentCopy(x);   // verify r3: judged on the way out; the 400-character cut leaves no dangling opener
        results.push({ key: agentId(`${rec.id}/${x.convId}`), adapterId: rec.id, adapter: rec.label || rec.id, convId: agentId(x.convId), title: visible.get(x.convId), at: x.at || null, author: ax.author || null, text: agentText(ax.text, { kind: 'block', max: 400 }), vendorId: agentId(x.vendorId || null) });   // verify r3 F6: the key, the conversation id and the message id as line pieces
        if (results.length >= n) break;
      }
      if (results.length >= n) { truncated = true; break; }
    }
    results.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
    const fullOffered = adapterRecords().adapters.some((r) => r.enabled !== false && (!adapterId || r.id === adapterId) && searchRowOf(registry.capsOf(r.kind)));
    return { ok: true, results, truncated, covered, fullOffered };
  }
  /**
   * THE AGENT'S `--full` (design 010 — the second tier, EXPLICIT): ONE page of ONE account's own search, refused by the
   * agents' share (`vendor-budget`, the wait) and by a floor of one per account per agent conversation per 20 s. The
   * vendor is asked over the account; every hit is then judged by the caller's REACH — after the await (`stillSees`) —
   * exactly like a local hit: one outside it is absent and uncounted. `truncated` speaks of the visible hits only (the
   * agent's own limit), never of the vendor's page or its token (V2: no count of the unseen). Snippets through the belt.
   */
  const agentHitAt = new Map();   // `${ctx.id}\0${adapter}\0${conv}\0${msg}` → the hit's instant (the `--around` read's)
  async function searchFullFor(ctx, query, { adapterId = null, limit = 50 } = {}) {
    if (query.length > SR.QUERY_MAX) return { ok: false, code: 'bad-request', error: `a search is at most ${SR.QUERY_MAX} characters` };
    const cand = [];
    for (const rec of adapterRecords().adapters) {
      if (rec.enabled === false || (adapterId && rec.id !== adapterId) || !searchRowOf(registry.capsOf(rec.kind))) continue;
      const visible = new Map();
      for (const en of Object.values(store.index.live())) if (en && en.adapterId === rec.id && ACL.canSee(reachFor(ctx, rec, en).level)) visible.set(en.id, agentTitle(en, en.id));
      if (visible.size) cand.push({ rec, visible });
    }
    if (!cand.length) return { ok: true, results: [], truncated: false, full: true, note: 'no account you can see offers its own search — the saved copy is all there is' };
    if (cand.length > 1) return { ok: false, code: 'bad-request', error: `--full asks ONE account's own search per call — add --account <id> (${cand.map((c) => agentId(c.rec.id, 80)).join(', ')})` };
    const { rec, visible } = cand[0];
    // lane vendor-search-memo: the owner's answer to the same words is read first (0 calls, no floor); a fresh one is
    // remembered for this conversation set (its hits were read for those only)
    const r = await vendorSearch(rec, query, { by: 'agent', ctx, shows: (cid) => visible.has(String(cid)), scope: SR.memoScope(visible.keys()) });
    if (!r.ok) return { ok: false, code: r.code === 'search-floor' ? 'refresh-floor' : r.code === 'search-minute' ? 'vendor-budget' : r.code, error: r.error, ...(r.retryAfterSec ? { retryAfterSec: r.retryAfterSec } : {}) };
    const results = [];
    for (const h of r.hits) {
      if (!visible.has(h.convId) || !stillSees(ctx, rec.id, h.convId)) continue;   // reach AFTER the await: absent, uncounted
      const k = `${ctx.id}\0${rec.id}\0${h.convId}\0${h.vendorId}`;
      agentHitAt.delete(k); agentHitAt.set(k, h.at);
      if (agentHitAt.size > 2000) agentHitAt.delete(agentHitAt.keys().next().value);
      results.push({ key: agentId(`${rec.id}/${h.convId}`), adapterId: rec.id, adapter: rec.label || rec.id, convId: agentId(h.convId), title: visible.get(h.convId), at: h.at || null, author: null, text: agentText(h.snippet || '', { kind: 'block', max: 400 }), vendorId: agentId(h.vendorId || null), source: 'vendor' });
      if (results.length >= limit) break;
    }
    return { ok: true, results, truncated: results.length >= limit, full: true, adapterId: rec.id, adds: searchRowOf(registry.capsOf(rec.kind)).adds, ...(r.memo ? { remembered: { ageSec: Math.floor(r.memo.ageMs / 1000) } } : {}) };   // F2: the CLI words its line by the row
  }
  /** THE AGENT'S `read <conv> --around <msg>` (design 010): reach first (the uniform not-found), the message's instant
   *  from the log (a stored one) or from this agent's own `--full` answer, the agents' share, ONE `around` read (two
   *  requests), reach again after the await — the agent's copy, printed, never stored. */
  async function readAroundFor(ctx, adapterId, convId, msg) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec || rec.enabled === false) return ACL.notFound();
    if (!ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();
    const vid = String(msg || '').slice(0, 512);
    const own = store.findRecord(adapterId, convId, vid);
    const at = own ? Number(own.at) : agentHitAt.get(`${ctx.id}\0${adapterId}\0${convId}\0${vid}`);
    if (!(Number(at) > 0)) return { ok: false, code: 'not-found', error: 'that message is not one you were shown — find it first: vibespace-channels search "words" --full' };
    const e = adapterFor(rec);
    const share = agentShareRefusal(rec, e);
    if (share) return share;
    // verify r1 F2: two vendor requests a call — the --full floor (one per account per agent conversation per 20 s); without
    // it a loop over the newest stored message was a refresh with no floor (the refresh floor's rule)
    if (!e.searchAgentAt) e.searchAgentAt = new Map();
    const aroundKey = `around:${ctx.id}`, aroundLast = e.searchAgentAt.get(aroundKey) || 0;
    if (aroundLast && now() - aroundLast < SR.AGENT_FLOOR_MS) { const s = Math.max(1, Math.ceil((aroundLast + SR.AGENT_FLOOR_MS - now()) / 1000)); return { ok: false, code: 'refresh-floor', error: `the messages around a found one were read on this account a moment ago — try again in ${s} s`, retryAfterSec: s }; }
    e.searchAgentAt.delete(aroundKey); e.searchAgentAt.set(aroundKey, now());
    if (e.searchAgentAt.size > 500) e.searchAgentAt.delete(e.searchAgentAt.keys().next().value);
    const r = await aroundFor(adapterId, convId, { vendorId: vid, at, by: 'agent' });
    if (!r.ok) return r.code === 'not-found' ? ACL.notFound() : { ok: false, code: r.code, error: r.error, ...(r.retryAfterSec ? { retryAfterSec: r.retryAfterSec } : {}) };
    if (!stillSees(ctx, adapterId, convId)) return ACL.notFound();
    return { ok: true, conversation: { key: agentId(en.key), adapterId, id: agentId(convId), title: agentTitle(en, convId), polledAt: laneOf(en).lastPollAt || null }, records: withView(rec, r.records, { convId, agent: true }), note: '(the messages around it on the vendor — not saved here)' };
  }

  // ── policy + reach (§8) ───────────────────────────────────────────────────
  async function setPolicy(adapterId, convId, mode, by = 'user') {
    if (!known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    if (mode !== null && !P.POLICY_MODES.includes(mode)) return { ok: false, code: 'bad-policy', error: `mode must be ${P.POLICY_MODES.join('|')} (or null to use the adapter's default)` };
    const prec = adapterRecords().adapters.find((r) => r.id === adapterId) || null;
    if (mode !== null && prec && !P.policyModesOf(registry.capsOf(prec.kind)).includes(mode)) return { ok: false, code: 'bad-policy', why: 'mode-not-offered', error: `${vendorNameOf(prec)} does not allow the "${mode}" policy — every message on it waits for your approval` };
    const t = now();
    await store.index.update(() => { const e2 = store.index.entry(adapterId, convId, { create: false }); if (e2) e2.policy = mode === null ? null : { mode, by, at: t }; });
    try { store.audit({ kind: 'policy', op: 'set', scope: { kind: 'conversation', id: `${adapterId}/${convId}` }, mode, at: t, by }); } catch {}
    notify([convId]);
    const { en, rec } = convFor(adapterId, convId);
    return { ok: true, policy: policyFor(rec, en) };
  }
  /** A USER-written grant (origin `user`), or `level:null` to remove the
   *  user's own row; the assignment's and a request's rows are other rows. */
  async function setReach(adapterId, convId, { principal, level }, by = 'user') {
    if (!known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    const key = `${adapterId}/${convId}`;
    const t = now();
    const scope = { kind: 'conversation', id: key };
    if (level === null || level === undefined) {
      const v = ACL.validateGrant({ principal, scope, level: 'hidden', origin: 'user' });
      if (!v.ok) return { ok: false, code: 'bad-grant', error: v.error };
      await store.index.update(() => { const e2 = store.index.entry(adapterId, convId, { create: false }); if (!e2) return; healP2(e2); e2.reachEntries = ACL.removeGrant(e2.reachEntries, { principal: v.grant.principal, scope, origin: 'user' }); });
      try { store.audit({ kind: 'acl', op: 'revoke', principal: v.grant.principal, scope, origin: 'user', at: t, by }); } catch {}
      notify([convId]);
      return { ok: true, reach: reachView(store.index.peek(key)) };
    }
    const v = ACL.validateGrant({ principal, scope, level, origin: 'user', at: t, by });
    if (!v.ok) return { ok: false, code: 'bad-grant', error: v.error };
    await store.index.update(() => { const e2 = store.index.entry(adapterId, convId, { create: false }); if (!e2) return; healP2(e2); e2.reachEntries = ACL.applyGrant(e2.reachEntries, v.grant); });
    try { store.audit({ kind: 'acl', op: 'grant', principal: v.grant.principal, scope, level, origin: 'user', at: t, by }); } catch {}
    notify([convId]);
    return { ok: true, reach: reachView(store.index.peek(key)) };
  }
  function reachView(en) {
    if (!en) return null;
    const target = { key: en.key, adapterId: en.adapterId };
    // every row from all three homes, WITH its origin (and a derived row's pattern)
    return { entries: grantsOfConversation(en, target).map((g) => ({ ...g, id: ACL.grantId(g) })), requests: (en.reachRequests || []).map((r) => ({ ...r })) };
  }
  /** An agent's REQUEST for access to a `requestable` conversation (§8): one
   *  "For you" item with the stated reason; approving writes EXACTLY ONE
   *  `visible` grant for that (principal, scope). Hidden = uniform not-found. */
  async function request(ctx, adapterId, convId, why) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec || !ctx || ctx.kind !== 'agent') return ACL.notFound();
    const reach = reachFor(ctx, rec, en);
    // already allowed — no card (lane everyone-principal: an All-agents grant answers every agent's request here)
    if (ACL.canSee(reach.level)) return { ok: true, already: true, level: reach.level, via: reach.via || null };
    // lane channel-agent-watch W2: a conversation the account's directory lists to agents is requestable by its title
    if (!ACL.canRequest(reach.level) && !directoryLists(rec, en)) return ACL.notFound();
    const t = now();
    const reason = String(why || '').trim().slice(0, 500);
    if (!reason) return { ok: false, code: 'bad-request', error: 'a reason is required — the user reads it' };
    const open = (en.reachRequests || []).find((r) => r.status === 'open' && r.principal && r.principal.kind === 'agent' && r.principal.id === ctx.id);
    if (open) return { ok: true, request: { ...open }, already: true };
    const req = { id: `rq-${t.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, principal: { kind: 'agent', id: ctx.id, name: ctx.name || null }, scope: { kind: 'conversation', id: en.key }, why: reason, at: t, status: 'open', todoId: null, decidedAt: null };
    if (userTodos && typeof userTodos.add === 'function') {
      try {
        const title = String(humanNameOf(rec, en) || en.id).slice(0, 120);   // B-c127: the ladder
        const item = userTodos.add(INBOX_KEY, {
          origin: 'channels', // B-328d
          text: `${ctx.name || ctx.id} requests access to ${title}`,
          action: { type: 'open-channel', adapterId: en.adapterId, convId: en.id, key: en.key },   // B-c127: a click opens the conversation (its Reach dialog is there)
          detail: `Agent session ${ctx.name || ''} (${ctx.id}) asks to see ${rec.label || rec.id} · ${title}.\nReason: ${reason}\n\nApprove or deny from the conversation's Reach dialog (rail → Channels → row menu → Reach…). Approving grants that ONE session visibility on that ONE conversation; group defaults are untouched.`,
          urgency: 'normal', by: 'agent', sessionName: 'Channels',
          i18n: {
            text: { key: i18nKey('{agent} requests access to {title}'), params: { agent: ctx.name || ctx.id, title } },
            detail: [
              { key: i18nKey('Agent session {name} ({id}) asks to see {adapter} · {title}.'), params: { name: ctx.name || '', id: ctx.id, adapter: rec.label || rec.id, title } },
              { key: i18nKey('Reason: {reason}'), params: { reason: String(reason) } },
              { key: i18nKey('Approve or deny from the conversation\'s Reach dialog (rail → Channels → row menu → Reach…). Approving grants that ONE session visibility on that ONE conversation; group defaults are untouched.') },
            ],
            source: INBOX_SOURCE,
          },
        });
        if (item && item.id) req.todoId = item.id;
      } catch (e) { log.warn(`[channels] ${en.key}: could not file the reach request: ${(e && e.message) || e}`); }
    }
    await store.index.update(() => { const e2 = store.index.entry(adapterId, convId, { create: false }); if (!e2) return; healP2(e2); e2.reachRequests.push(req); if (e2.reachRequests.length > 50) e2.reachRequests.splice(0, e2.reachRequests.length - 50); });
    try { store.audit({ kind: 'acl', op: 'request', principal: req.principal, scope: req.scope, why: reason, at: t, by: 'agent' }); } catch {}
    notify([convId]);
    return { ok: true, request: { ...req } };
  }
  async function decideRequest(requestId, approve, by = 'user') {
    // B-f32b: the scan reads the live rows; only the row holding the request is copied
    const live = store.index.live();
    let hit = null;
    for (const k in live) { const x = live[k]; if (x && (x.reachRequests || []).some((r) => r.id === requestId)) { hit = k; break; } }
    const en = hit ? store.index.peek(hit) : null;
    if (!en && (store.index.table('watchRequests') || []).some((r) => r && r.id === requestId)) return decideWatchRequest(requestId, approve, by);
    if (!en) return { ok: false, code: 'not-found', error: 'No such request' };
    const req = en.reachRequests.find((r) => r.id === requestId);
    if (req.status !== 'open') return { ok: false, code: 'bad-state', error: `request already ${req.status}` };
    const t = now();
    let grant = null, applied = false;
    await store.index.update(() => {
      const e2 = store.index.entry(en.adapterId, en.id, { create: false });
      if (!e2) return;
      healP2(e2);
      const r2 = e2.reachRequests.find((r) => r.id === requestId);
      // verify-r6 Q1: the status is asked AGAIN inside the write — two decisions in flight (Approve here, Deny in another
      // window) both passed the check above the await, and the later one overwrote the earlier: a card read "denied"
      // while the grant stood (a guard asked before an await is re-asked after it)
      if (!r2 || r2.status !== 'open') return;
      applied = true;
      r2.status = approve ? 'approved' : 'denied'; r2.decidedAt = t; r2.decidedBy = by;
      if (approve) { const out = ACL.approveRequest(e2.reachEntries, { principal: r2.principal, scope: r2.scope, at: t, by }); e2.reachEntries = out.grants; grant = out.grant; }
    });
    if (!applied) return { ok: false, code: 'bad-state', error: 'request already decided (in another window, a moment ago)' };
    try { store.audit({ kind: 'acl', op: approve ? 'grant' : 'deny', principal: req.principal, scope: req.scope, level: approve ? 'visible' : null, origin: 'request', requestId, at: t, by }); } catch {}
    if (req.todoId && userTodos && typeof userTodos.get === 'function') {
      try { const it = userTodos.get(req.todoId); if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(req.todoId, 'done', RESOLVED_BY); } catch {}
    }
    notify([en.id]);
    return { ok: true, request: { ...req, status: approve ? 'approved' : 'denied' }, grant };
  }

  // ── lane channel-agent-watch (the owner, 2026-10-01): an agent's OWN watch + the directory ──────────────────
  /** W2: does this account's directory list THIS conversation to agents (its title, kind, age, member count — never a
   *  message, never a name)? PURE `ACL.directoryOf(rec)`: groups ON, single chats OFF unless the owner flipped them. */
  function directoryLists(rec, en) {
    if (!rec || !en || rec.enabled === false) return false;
    let mod = null; try { mod = registry.get(rec.kind); } catch {}
    if (mod && mod.builtin) return false;   // the built-in Agents adapter answers reach with msg-acl (§12.3)
    return ACL.directoryListable(ACL.directoryOf(rec), en.kind);
  }
  /** The account's directory switches — the Edit dialog's `PUT {agentDirectory:{groups, singles}}`. */
  async function setAgentDirectory(adapterId, value) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: 'no such account' };
    const v = ACL.validateDirectory(value);
    if (!v.ok) return { ok: false, code: 'bad-request', error: v.error };
    await store.adapters.update(() => { rec.agentDirectory = v.directory; });
    try { store.audit({ kind: 'acl', op: 'directory', adapterId, directory: v.directory, at: now(), by: 'user' }); } catch {}
    notify([]);
    return { ok: true, agentDirectory: v.directory };
  }
  /** W1: what `watch <conv|account>` names, judged for THIS agent — reach FIRST (a hidden conversation is the uniform
   *  not-found; one it may only REQUEST is refused by name, pointing at `request`: a watch never grants reading). */
  function watchTargetOf(ctx, ref) {
    const r0 = String(ref || '').trim();
    if (!r0) return { ok: false, code: 'bad-request', error: 'name a conversation (<adapter>/<conversation id>, as `list` prints it) or an account (<adapter>)' };
    const i = r0.indexOf('/');
    if (i > 0) {
      const { en, rec } = convFor(r0.slice(0, i), r0.slice(i + 1));
      if (!en || !rec || rec.enabled === false) return ACL.notFound();
      const reach = reachFor(ctx, rec, en);
      if (!ACL.canSee(reach.level)) {
        if (ACL.canRequest(reach.level) || directoryLists(rec, en)) return { ok: false, code: 'no-access', error: `you cannot read ${r0} yet, so you cannot watch it — \`vibespace-channels request ${r0} "why"\` asks the user for access first (a watch never grants reading)` };
        return ACL.notFound();
      }
      return { ok: true, adapterId: rec.id, rec, en, key: en.key, title: humanNameOf(rec, en) || en.id, grain: { kind: 'conversation', convId: en.id }, grainNow: () => convGrainOf(store.index.peek(en.key)), raw: () => { const e2 = store.index.peek(en.key) || {}; return { access: e2.access || [], watchers: e2.watchers || [] }; } };
    }
    const rec = adapterRecords().adapters.find((x) => x.id === r0);
    let mod = null; try { mod = rec ? registry.get(rec.kind) : null; } catch {}
    if (!rec || rec.enabled === false || (mod && mod.builtin)) return ACL.notFound();
    const acctReach = ACL.effective(ctx, { key: '\u0000', adapterId: rec.id }, (store.index.table('accountGrants') || []).filter((g) => g && g.scope && g.scope.kind === 'adapter' && g.scope.id === rec.id));
    const named = (effectiveForAccount(rec.id) || { access: [] }).access.some((x) => F.rowNames(x.row, ctx));
    if (!ACL.canSee(acctReach.level) && !named) {
      // the account is named in nothing this agent sees ⇒ the uniform not-found; else it is told what it lacks
      const seesSome = Object.values(store.index.live()).some((en) => en && en.adapterId === rec.id && ACL.canSee(reachFor(ctx, rec, en).level));   // B-f32b: a scan reads live(), never a copy of the index (composed at the 2.369.202 integration)
      return seesSome ? { ok: false, code: 'no-access', error: `you do not have access to the whole account ${rec.id} — watch one conversation you can read (<adapter>/<conversation id>), or ask the user for the account` } : ACL.notFound();
    }
    return { ok: true, adapterId: rec.id, rec, en: null, key: null, title: rec.label || rec.id, grain: { kind: 'account' }, grainNow: () => F.grainOf(accountGrainOf(rec.id), undefined, { inherited: accountGrantKeys(rec.id) }), raw: () => { const g = accountGrainOf(rec.id) || {}; return { access: g.access || [], watchers: g.watchers || [] }; } };
  }
  /**
   * W1 — `vibespace-channels watch <conv|account> [--mode next-turn|wake|digest] [rule flags | --spec json]` (lane
   * agent-watch-parity: the Notify dialog's whole grammar, src/channel-watch-spec.js): the agent's OWN notification on
   * a grain it can read. `next-turn` (free) is written at once — ONE row per (agent, grain) with `origin:'agent'`, never
   * over a row the user set for it (widen-only: the user's row stays, said); `wake` (a billed turn) is NOT the agent's
   * to grant — it files ONE request the user approves with one click (For you; the same decide route as an access
   * request), naming exactly what Approve writes (grain, mode, keywords, the daily cap it asks for).
   */
  async function agentWatch(ctx, ref, body = {}) {
    if (!ctx || ctx.kind !== 'agent' || !ctx.id) return ACL.notFound();
    // lane agent-watch-parity: THE ONE GRAMMAR (src/channel-watch-spec.js) — the CLI's raw flags (`args`), a whole row
    // (`spec`) or the pre-parity body (delivery + keywords), judged by the Notify dialog's own validators; a refusal is
    // the validator's code + words (`badSpec` = the route's 400)
    const sp = WS.watchSpecOfBody(body);
    if (!sp.ok) return { ...sp, badSpec: true };
    const S = sp.spec;
    const d = S.delivery;
    const tg = watchTargetOf(ctx, ref);
    if (!tg.ok) return tg;
    const fl = { filter: S.filter || null, keywords: S.filter ? S.filter.rules.filter((x) => x.kind === 'keyword').map((x) => x.value) : [] };
    const principal = { kind: 'agent', id: ctx.id, name: ctx.name || null };
    const pk = pkOf(principal);
    const cur = tg.grainNow();
    const mine = cur.watchers.find((w) => pkOf(w.principal) === pk);
    if (mine && F.watchOriginOf(mine) === 'user') {
      return { ok: true, already: true, setBy: 'user', delivery: F.deliveryModeOf(mine), notify: mine.notify, target: tg.key || tg.adapterId,
        note: `the user already notifies you here (${F.deliveryModeOf(mine) === 'next-turn' ? 'on your next turn' : mine.notify === 'digest' ? 'a digest' : 'a wake'}) — that row is theirs; nothing was changed` };
    }
    // verify r1 F1: the USER removed this agent's own row here (Notify…'s whole-list save) — the removal STICKS: a direct
    // re-registration is refused by name; a `wake` ask may still be filed (the user decides; their Approve lifts the mark)
    const scopeW = tg.key ? { kind: 'conversation', id: tg.key } : { kind: 'adapter', id: tg.adapterId };
    const blk = agentWatchBlockOf(scopeW, pk);
    if (blk && d !== 'wake') return { ok: false, code: 'removed-by-user', error: `the user removed your notification on ${tg.key ? agentId(tg.key) : tg.adapterId} (${new Date(blk.at).toISOString().slice(0, 16).replace('T', ' ')} UTC) — it is theirs to restore: ask them (vibespace-ask), or file a wake ask (--mode wake) they approve; re-registering it yourself is refused` };
    // verify r1 F2: a bound on the rows one agent may hold of its OWN across every grain, said with the count
    if (!(mine && F.watchOriginOf(mine) === 'agent') && agentWatchCount(pk) >= F.MAX_AGENT_WATCHES) return { ok: false, code: 'watch-limit', error: `you already hold ${F.MAX_AGENT_WATCHES} notifications of your own (the limit) — \`vibespace-channels unwatch <conv>\` frees one; the user can set more for you in Notify…` };
    const row = { principal, origin: 'agent', delivery: d, notify: S.notify, mode: S.mode, ...(fl.filter ? { filter: fl.filter } : {}), ...(S.notify === 'digest' ? { digestMinutes: S.digestMinutes } : {}), dailyWakeCap: Math.max(1, S.dailyWakeCap) };
    if (d === 'wake') return fileWatchRequest(ctx, tg, row, S.why);
    // the grain AS READ (the legacy lift + the access rule applied) minus this agent's row, plus the new one
    const r = await setGrain(tg.adapterId, tg.grain, { watchers: [...cur.watchers.filter((w) => w && pkOf(w.principal) !== pk), row] }, { by: `agent:${ctx.id}` });
    if (!r || !r.ok) return r;
    try { store.audit({ kind: 'acl', op: 'agent-watch', principal, scope: tg.key ? { kind: 'conversation', id: tg.key } : { kind: 'adapter', id: tg.adapterId }, delivery: d, keywords: fl.keywords, rules: fl.filter ? fl.filter.rules.map((x) => x.kind) : [], at: now(), by: 'agent' }); } catch {}
    return { ok: true, set: true, delivery: d, target: tg.key ? agentId(tg.key) : tg.adapterId, title: tg.key ? agentTitle(tg.en, tg.en.id) : tg.title, keywords: fl.keywords, what: WS.watchWhatWords(row), how: WS.watchHowWords(row), replaced: !!mine };
  }
  /** lane agent-watch-parity: READ BACK — what notifies THIS agent. At one grain (`ref`, judged like `watch`: reach
   *  first) every row naming it — its own, and the user's for it, its group or all agents (theirs: read-only) — its open
   *  wake ask and the user's removal mark; with no `ref`, every grain where a row names it (a conversation only when it
   *  may read it), one entry each. Never another agent's row. */
  function agentWatchesFor(ctx, ref = null) {
    if (!ctx || ctx.kind !== 'agent' || !ctx.id) return ACL.notFound();
    const pk = pkOf({ kind: 'agent', id: ctx.id });
    const view = (w) => { const f = w.mode === 'filtered' ? (w.filter || (w.filterId ? filterFor(w.filterId) : null)) : null;
      return { setBy: F.watchOriginOf(w), as: w.principal.kind, ...(w.principal.kind === 'group' ? { group: w.principal.name || w.principal.id } : {}), ...(w.via ? { via: w.via } : {}),
        delivery: F.deliveryModeOf(w), notify: w.notify, mode: w.mode, filter: f ? { match: f.match, rules: f.rules } : null, digestMinutes: w.digestMinutes, dailyWakeCap: w.dailyWakeCap,
        how: WS.watchHowWords(w), what: WS.watchWhatWords(w, f), expiresAt: w.expiresAt || null }; };
    const rowsOf = (ws) => (Array.isArray(ws) ? ws : []).filter((w) => w && w.principal && F.rowNames(w, ctx)).map(view);
    const askView = (r) => ({ id: r.id, target: r.scope.kind === 'conversation' ? agentId(r.scope.id) : r.scope.id, how: WS.watchHowWords(r.watch), what: WS.watchWhatWords(r.watch), at: r.at });
    if (ref) {
      const tg = watchTargetOf(ctx, ref);
      if (!tg.ok) return tg;
      const scope = tg.key ? { kind: 'conversation', id: tg.key } : { kind: 'adapter', id: tg.adapterId };
      const ask = openWatchRequestsOf(pk).find((r) => r.scope && r.scope.kind === scope.kind && r.scope.id === scope.id);
      const blk = agentWatchBlockOf(scope, pk);
      return { ok: true, target: tg.key ? agentId(tg.key) : tg.adapterId, title: tg.key ? agentTitle(tg.en, tg.en.id) : tg.title, grain: tg.grain.kind, rows: rowsOf(tg.grainNow().watchers), request: ask ? askView(ask) : null, removedByUser: blk ? { at: blk.at } : null };
    }
    const out = [];
    const recs = new Map(adapterRecords().adapters.map((r) => [r.id, r]));
    for (const en of Object.values(store.index.live())) {   // B-f32b: read-only
      if (!en || !Array.isArray(en.watchers) || !en.watchers.some((w) => w && w.principal && F.rowNames(w, ctx))) continue;
      const rec = recs.get(en.adapterId);
      if (!rec || rec.enabled === false || !ACL.canSee(reachFor(ctx, rec, en).level)) continue;
      for (const r of rowsOf(convGrainOf(en).watchers)) out.push({ target: agentId(en.key), title: agentTitle(en, en.id), grain: 'conversation', ...r });
    }
    for (const [adapterId, g] of Object.entries(store.index.table('accountAssignments') || {})) {
      const rec = recs.get(adapterId);
      if (!rec || rec.enabled === false) continue;
      for (const r of rowsOf(g && g.watchers)) out.push({ target: adapterId, title: rec.label || adapterId, grain: 'account', ...r });
    }
    for (const g of Object.values(store.index.table('patternAssignments') || {})) {
      const rec = g && recs.get(g.adapterId);
      if (!rec || rec.enabled === false) continue;
      for (const r of rowsOf(g.watchers)) out.push({ target: null, adapterId: g.adapterId, title: `${rec.label || g.adapterId}: conversations matching ${F.patternSummary(g.pattern)}`, grain: 'pattern', ...r });
    }
    return { ok: true, watches: out.slice(0, 200), more: Math.max(0, out.length - 200), requests: openWatchRequestsOf(pk).map(askView) };
  }
  /** W1: `unwatch` removes ONLY the agent's own row (`origin:'agent'`) at that grain — the user's rows are theirs. */
  async function agentUnwatch(ctx, ref) {
    if (!ctx || ctx.kind !== 'agent' || !ctx.id) return ACL.notFound();
    const tg = watchTargetOf(ctx, ref);
    if (!tg.ok && tg.code !== 'no-access') return tg;
    const r0 = String(ref || '').trim();
    const i = r0.indexOf('/');
    const en0 = tg.ok ? tg.en : (i > 0 ? convFor(r0.slice(0, i), r0.slice(i + 1)).en : null);
    const raw = tg.ok ? tg.raw() : { access: (en0 && en0.access) || [], watchers: (en0 && en0.watchers) || [] };
    const cur = tg.ok ? tg.grainNow() : convGrainOf(en0);
    const pk = pkOf({ kind: 'agent', id: ctx.id });
    const own = raw.watchers.find((w) => w && pkOf(w.principal) === pk && F.watchOriginOf(w) === 'agent');
    if (!own) return { ok: false, code: 'not-watching', error: 'nothing of yours to remove here — `vibespace-channels status` lists what notifies you (a notification the user set is theirs to remove)' };
    const adapterId = tg.ok ? tg.adapterId : r0.slice(0, i);
    const grain = tg.ok ? tg.grain : { kind: 'conversation', convId: r0.slice(i + 1) };
    const r = await setGrain(adapterId, grain, { watchers: cur.watchers.filter((w) => !(w && pkOf(w.principal) === pk && F.watchOriginOf(w) === 'agent')) }, { by: `agent:${ctx.id}` });
    if (!r || !r.ok) return r;
    try { store.audit({ kind: 'acl', op: 'agent-unwatch', principal: { kind: 'agent', id: ctx.id }, scope: grain.kind === 'conversation' ? { kind: 'conversation', id: `${adapterId}/${grain.convId}` } : { kind: 'adapter', id: adapterId }, at: now(), by: 'agent' }); } catch {}
    return { ok: true, removed: true };
  }
  /** verify r1 F1: the mark the USER's removal of an agent's own watch leaves — `agentWatchBlocks[scope|principal] = {at, by}`;
   *  written by setGrain on a user's whole-list save that drops an origin-agent row, lifted by a row the user writes or
   *  approves for that agent at that grain. */
  const blockKey = (scope, pk) => `${scope.kind}:${scope.id}|${pk}`;
  function agentWatchBlockOf(scope, pk) { const b = store.index.table('agentWatchBlocks');   // B-f32b: the live table, read-only (no copy)
    const k = blockKey(scope, pk); return b && typeof b === 'object' && b[k] ? b[k] : null; }
  /** verify r1 F2: how many rows of its OWN (origin agent) one agent holds across every grain. */
  function agentWatchCount(pk) {
    let n = 0;   // B-f32b: the live rows and tables, read-only — no copy of the index (composed at the 2.369.202 integration)
    const count = (ws) => { for (const w of Array.isArray(ws) ? ws : []) if (w && pkOf(w.principal) === pk && F.watchOriginOf(w) === 'agent') n++; };
    for (const en of Object.values(store.index.live())) count(en && en.watchers);
    for (const tb of ['accountAssignments', 'patternAssignments']) for (const g of Object.values(store.index.table(tb) || {})) count(g && g.watchers);
    return n;
  }
  function openWatchRequestsOf(pk) { return (store.index.table('watchRequests') || []).filter((r) => r && r.status === 'open' && r.principal && pkOf(r.principal) === pk); }
  /** W1: a WAKE watch is the user's money — ONE request with the frozen row, a For-you item whose Approve (the existing
   *  reach-request decide route) writes exactly it; a second ask while one is open is the same request. */
  async function fileWatchRequest(ctx, tg, row, why) {
    const t = now();
    const scope = tg.key ? { kind: 'conversation', id: tg.key } : { kind: 'adapter', id: tg.adapterId };
    const open = (store.index.table('watchRequests') || []).find((r) => r && r.status === 'open' && r.principal && r.principal.id === ctx.id && r.scope && r.scope.kind === scope.kind && r.scope.id === scope.id);
    if (open) return { ok: true, proposed: true, already: true, request: { id: open.id, status: open.status } };
    // verify r1 F2: a bound on the wake asks one agent may have waiting, said with the count; the owner reads the totals
    const pkR = pkOf(row.principal);
    const waiting = openWatchRequestsOf(pkR);
    if (waiting.length >= F.MAX_OPEN_WATCH_REQUESTS) return { ok: false, code: 'watch-request-limit', error: `${waiting.length} wake asks of yours are already waiting for the user — no more until they decide; --mode next-turn (free) needs no approval` };
    const own = agentWatchCount(pkR);
    const reason = String(why || '').trim().slice(0, 500);
    const kws = row.filter ? row.filter.rules.map((x) => F.ruleWhy(x)) : [];   // lane agent-watch-parity: every rule kind in words (was: the keywords' values)
    const req = { id: `wr-${t.toString(36)}-${crypto.randomBytes(3).toString('hex')}`, kind: 'watch', principal: row.principal, scope, adapterId: tg.adapterId, grain: tg.grain, watch: row, why: reason, at: t, status: 'open', todoId: null, decidedAt: null };
    if (userTodos && typeof userTodos.add === 'function') {
      try {
        const title = String(tg.title || tg.key || tg.adapterId).slice(0, 120);
        const where = tg.key ? title : `the whole account ${tg.rec.label || tg.adapterId}`;
        const what = kws.length ? `on messages with: ${kws.join(', ')}` : 'on every new message';
        const item = userTodos.add(INBOX_KEY, {
          origin: 'channels',
          text: `${ctx.name || ctx.id} asks to be woken by ${where}`,
          detail: `Approve writes: wake ${ctx.name || ctx.id} now (a billed turn) ${what} in ${where}, at most ${row.dailyWakeCap} wakes a day.${row.notify === 'digest' ? `\nAs a digest: one billed turn every ${row.digestMinutes} minutes at most.` : ''}${reason ? `\nReason: ${reason}` : ''}\nIt already has ${own} notifications of its own and ${waiting.length} wake asks waiting.\nDeny changes nothing. Without it, the agent can still ask for the news on its next turn (free).`,
          urgency: 'normal', by: 'agent', sessionName: 'Channels', action: { type: 'channel-watch-request', id: req.id },
          i18n: {
            text: { key: i18nKey('{agent} asks to be woken by {where}'), params: { agent: ctx.name || ctx.id, where } },
            detail: [
              { key: kws.length ? i18nKey('Approve writes: wake {agent} now (a billed turn) on messages with: {words} — in {where}, at most {cap} wakes a day.') : i18nKey('Approve writes: wake {agent} now (a billed turn) on every new message in {where}, at most {cap} wakes a day.'), params: { agent: ctx.name || ctx.id, words: kws.join(', '), where, cap: row.dailyWakeCap } },
              ...(row.notify === 'digest' ? [{ key: i18nKey('As a digest: one billed turn every {n} minutes at most.'), params: { n: row.digestMinutes } }] : []),
              ...(reason ? [{ key: i18nKey('Reason: {reason}'), params: { reason } }] : []),
              { key: i18nKey('It already has {n} notifications of its own and {m} wake asks waiting.'), params: { n: own, m: waiting.length } },
              { key: i18nKey('Deny changes nothing. Without it, the agent can still ask for the news on its next turn (free).') },
            ],
            source: INBOX_SOURCE,
          },
        });
        if (item && item.id) req.todoId = item.id;
      } catch (e) {
        // verify r1 F2: the tray's own cap (20 open Channels items) refused the item — nothing is filed (it shipped: the
        // request was stored open with no item the user could ever decide, and the agent was told the tray showed it)
        log.warn(`[channels] ${scope.id}: could not file the watch request: ${(e && e.message) || e}`);
        return { ok: false, code: 'tray-full', error: `the user's For-you tray cannot take another Channels item right now (${String((e && e.message) || e).slice(0, 90)}) — nothing was filed; ask again later, or use --mode next-turn (free, no approval)` };
      }
    }
    // the table keeps at most 100 requests: DECIDED ones go first, an open one is never dropped (verify r1 F2)
    await store.index.update((ix) => { const list = Array.isArray(ix.watchRequests) ? ix.watchRequests : (ix.watchRequests = []); list.push(req); while (list.length > 100) { const i = list.findIndex((r) => !(r && r.status === 'open')); if (i < 0) break; list.splice(i, 1); } });
    try { store.audit({ kind: 'acl', op: 'watch-request', principal: req.principal, scope, delivery: 'wake', at: t, by: 'agent' }); } catch {}
    notify([]);
    return { ok: true, proposed: true, request: { id: req.id, status: 'open' }, dailyWakeCap: row.dailyWakeCap };
  }
  /** Approve = EXACTLY the frozen row, written through `setGrain` (the access rule re-judged now); deny = nothing. */
  async function decideWatchRequest(requestId, approve, by = 'user') {
    const req0 = (store.index.table('watchRequests') || []).find((r) => r && r.id === requestId);
    if (!req0) return { ok: false, code: 'not-found', error: 'No such request' };
    if (req0.status !== 'open') return { ok: false, code: 'bad-state', error: `request already ${req0.status}` };
    const t = now();
    if (approve) {
      const pk = pkOf(req0.principal);
      const en1 = req0.grain && req0.grain.kind === 'conversation' ? store.index.peek(`${req0.adapterId}/${req0.grain.convId}`) : null;
      if (req0.grain && req0.grain.kind === 'conversation' && !en1) return { ok: false, code: 'not-found', error: 'that conversation is gone' };
      const g = en1 ? convGrainOf(en1) : F.grainOf(accountGrainOf(req0.adapterId), undefined, { inherited: accountGrantKeys(req0.adapterId) });
      const others = g.watchers.filter((w) => w && pkOf(w.principal) !== pk);
      const w = await setGrain(req0.adapterId, req0.grain, { watchers: [...others, { ...req0.watch }] }, { by });
      if (!w || !w.ok) return w || { ok: false, code: 'error', error: 'the notification could not be written' };
    }
    let applied = false;
    await store.index.update((ix) => { const r2 = (Array.isArray(ix.watchRequests) ? ix.watchRequests : []).find((r) => r && r.id === requestId); if (!r2 || r2.status !== 'open') return; applied = true; r2.status = approve ? 'approved' : 'denied'; r2.decidedAt = t; r2.decidedBy = by; });
    if (!applied) return { ok: false, code: 'bad-state', error: 'request already decided (in another window, a moment ago)' };
    try { store.audit({ kind: 'acl', op: approve ? 'watch-approve' : 'watch-deny', principal: req0.principal, scope: req0.scope, requestId, at: t, by }); } catch {}
    if (req0.todoId && userTodos && typeof userTodos.get === 'function') {
      try { const it = userTodos.get(req0.todoId); if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(req0.todoId, 'done', RESOLVED_BY); } catch {}
    }
    notify([]);
    return { ok: true, request: { ...req0, status: approve ? 'approved' : 'denied' } };
  }

  // ── the agent-facing reads (§11) — reach FIRST, uniform not-found ────────
  const LIST_FOR_MAX = 200;   // design 008 S6: an agent's `list` names the newest 200 it may see; the rest is found by search
  /** Every conversation this principal may SEE or REQUEST — hidden ones are
   *  simply absent (no oracle). Never a message body.
   *  design 008 S6 (lane channels-followups): BOUNDED — the newest LIST_FOR_MAX (by `lastAt`) of what the caller may see,
   *  and with `all` the newest LIST_FOR_MAX of the directory titles it may request; the rest is COUNTED (`more`,
   *  `moreRequestable`) — a count of rows this caller could have been listed anyway, so a hidden conversation is never
   *  in it. Reach is asked of every row (the count needs it); only the listed rows are built. */
  function listFor(ctx, { all = false } = {}) {
    const t = now();
    const recs = adapterRecords().adapters;
    const byId = new Map(recs.map((r) => [r.id, r]));
    const cand = [];
    for (const en of Object.values(store.index.live())) {   // B-f32b: read-only — the rows are read, never kept or changed
      const rec = byId.get(en.adapterId);
      if (!rec || rec.enabled === false) continue;
      const reach = reachFor(ctx, rec, en);
      if (reach.level === 'hidden' && !(all && directoryLists(rec, en))) continue;
      cand.push({ en, rec, reach });
    }
    cand.sort((a, b) => (b.en.lastAt || 0) - (a.en.lastAt || 0));
    const out = [];
    let more = 0, moreRequestable = 0, listed = 0, listedDir = 0;
    for (const { en, rec, reach } of cand) {
      if (reach.level === 'hidden') {
        // lane channel-agent-watch W2: `list --all` — the account's directory names a conversation the agent may not
        // read: its TITLE (through the belt), kind, last activity and member COUNT, marked requestable; never a message,
        // never a participant's name
        if (listedDir >= LIST_FOR_MAX) { moreRequestable++; continue; }
        listedDir++;
        const members = String(en.participants || '').split(',').map((x) => x.trim()).filter(Boolean).length;
        out.push({ key: agentId(en.key), adapterId: en.adapterId, adapter: rec.label || rec.id, id: agentId(en.id), title: agentTitle(en, en.id), kind: en.kind, level: 'requestable', directory: true, lastAt: en.lastAt || null, members: members || null });
        continue;
      }
      if (listed >= LIST_FOR_MAX) { more++; continue; }
      listed++;
      const c = registry.capsOf(rec.kind);
      const who = sendIdentityFor(rec, en, t);
      // R4: THE TWO FACTS SEPARATELY — the caller's access in effect here
      // (the finest grain naming it or its group; its authority clamped) and
      // whether a watcher of its wakes it
      const effL = effectiveFor(en);
      const acc = effL ? effL.access.filter((x) => F.rowNames(x.row, ctx)) : [];
      const wat = effL ? effL.watchers.filter((x) => F.rowNames(x.watcher, ctx)) : [];
      const capsL = acc.length ? authorityCapsFor(rec, en, t) : null;
      const authority = acc.length ? (acc.some((x) => F.effectiveAuthority(x.row, capsL).authority === 'send') ? 'send' : 'draft') : null;
      out.push({
        key: agentId(en.key), adapterId: en.adapterId, adapter: rec.label || rec.id, id: agentId(en.id), title: agentTitle(en, en.id), kind: en.kind,   // verify r1 F2: the title through the belt; r3 F6: the key + id
        level: reach.level, unread: en.unread || 0, lastAt: en.lastAt || null, polledAt: laneOf(en).lastPollAt || null,
        canSend: !!who.as, sendWhy: who.why, sendAs: who.as, identityMarking: c.identityMarking,
        policy: policyFor(rec, en).mode,
        access: acc.length ? { authority, via: acc[0].source, as: acc[0].row.principal.kind } : null,
        watched: wat.length ? { notify: wat[0].watcher.notify, mode: wat[0].watcher.mode, via: wat[0].source, as: wat[0].watcher.principal.kind, delivery: F.deliveryModeOf(wat[0].watcher), setBy: F.watchOriginOf(wat[0].watcher) } : null,
        // the pre-R4 names (a CLI older than this server reads them)
        assigned: acc.length > 0, assignedVia: acc.length ? acc[0].source : null, authority,
        awaiting: proposalsFor(en.key).filter((p) => p.state === 'awaiting-approval' && p.draftedBy && p.draftedBy.id === ctx.id).length,
      });
    }
    return { ok: true, conversations: out, more, moreRequestable, max: LIST_FOR_MAX };
  }
  function readFor(ctx, adapterId, convId, { limit = 50, since = null } = {}) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec || rec.enabled === false) return ACL.notFound();
    if (!ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();
    const n = Math.min(200, Math.max(1, Number(limit) || 50));
    let records = store.readTail(adapterId, convId, { limit: n });
    // the read is of the TAIL: whatever `since` filters out, the agent has now seen up to the newest record
    const upTo = records.length ? Number(records[records.length - 1].at) || 0 : 0;
    if (since !== null && Number.isFinite(Number(since))) records = records.filter((r) => Number(r.at) > Number(since));
    // R3 (§23): the first screen lists a conversation an agent just read — stamped AFTER the reach check
    // (a hidden read never stamps: the same uniform not-found, no trace), off the answer's path
    stampAgentRead(en.key, ctx, upTo);
    // §25: an agent reads `text` — the render tree is for the eye only (never a second copy of the body in its context)
    // lane channel-threads (§5.1 / §6.4): the agent's copy — no tree, the place as words, reactions WITHOUT `by`
    return { ok: true, conversation: { key: agentId(en.key), adapterId, id: agentId(convId), title: agentTitle(en, convId), polledAt: laneOf(en).lastPollAt || null }, records: withView(rec, records, { convId, agent: true }) };   // verify r1 F2: the title through the belt; r3 F6: the key + id
  }
  /**
   * STAMP AN AGENT'S READ (R3 §23 — the owner: "某个agent刚刚读取了的"): `en.
   * agentReads` = one row per principal `{id, kind, name, at, upTo}` (the
   * newest AGENT_READS_MAX principals), persisted through the index's ONE
   * door (the debounced flush) and said in a PARTIAL broadcast of this one
   * row. A re-read of the same tail by the same principal inside
   * AGENT_READ_RESTAMP_MS is not news: no write, no broadcast (an agent's
   * read loop is not a broadcast loop). Fire-and-forget: the answer never
   * waits for it, a failed write is logged.
   */
  const AGENT_READS_MAX = 5;
  const AGENT_READ_RESTAMP_MS = 60e3;
  function stampAgentRead(key, ctx, upTo) {
    if (!ctx || !ctx.id) return;
    const t = now();
    const cur = store.index.peek(key);
    const mine = cur && Array.isArray(cur.agentReads) ? cur.agentReads.find((r) => r && r.id === ctx.id) : null;
    if (mine && Number(mine.upTo) === Number(upTo) && t - (Number(mine.at) || 0) < AGENT_READ_RESTAMP_MS) return;
    let wrote = false;
    Promise.resolve(store.index.update(() => {
      const i = key.indexOf('/');
      const en = store.index.entry(key.slice(0, i), key.slice(i + 1), { create: false });
      if (!en) return;
      const rows = (Array.isArray(en.agentReads) ? en.agentReads : []).filter((r) => r && r.id !== ctx.id);
      rows.unshift({ id: String(ctx.id), kind: ctx.kind || 'agent', name: ctx.name ? String(ctx.name).slice(0, 80) : null, at: t, upTo: Number(upTo) || 0 });
      rows.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
      en.agentReads = rows.slice(0, AGENT_READS_MAX);
      wrote = true;
    })).then(() => { if (wrote && !engineCtx.stopped) notify([key]); }).catch((err) => log.warn(`[channels] ${key}: the agent read was not stamped: ${(err && err.message) || err}`));
  }
  /**
   * THE AGENT'S THREAD READ (spec §5.1, `GET /api/agent/channels/read?conv=&thread=<msg>`): reach first (the uniform
   * not-found), then the LOCAL fold of that thread — an agent NEVER triggers a thread walk (a vendor call) from a
   * read: a `separate` listing never walked answers `walked:false` and says so; `refresh --thread` is the only door
   * (its floor + the agent's share + the budget). The agent's copy: no tree, the place as words, no `by`.
   */
  function readThreadFor(ctx, adapterId, convId, msg, { limit = 50 } = {}) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec || rec.enabled === false) return ACL.notFound();
    if (!ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();
    const r = threadRead(adapterId, convId, msg, { limit, agent: true });
    if (!r || !r.ok) return r && r.code === 'not-supported' ? r : ACL.notFound();
    const th = r.thread || {};
    const recs = r.records || [];
    return {
      ok: true,
      conversation: { key: agentId(en.key), adapterId, id: agentId(convId), title: agentTitle(en, convId), polledAt: laneOf(en).lastPollAt || null },   // verify r2 F4: the thread READ's title (printed by `read --thread`) through the belt — r1 F2 took the thread REFRESH's; r3 F6: the key + id
      thread: { key: agentId(th.key || null), count: Number(th.count) || 0, lastAt: th.lastAt || null, walked: !!th.walked },   // verify r3 F6: the thread key (printed on the head line) as a line piece
      records: recs,
      ...(r.code === 'not-a-thread' ? { note: `(${NOT_A_THREAD})` } : th.walked ? {} : { note: '(thread not loaded here — the user\'s window loads it; ask again after)' }),
    };
  }
  /** Own proposals only — somebody else's id is the same uniform not-found. */
  function statusFor(ctx, proposalId = null) {
    const mine = proposalsFor().filter((p) => p.draftedBy && p.draftedBy.kind === 'agent' && ctx && p.draftedBy.id === ctx.id);
    if (proposalId) {
      const p = mine.find((x) => x.id === proposalId);
      if (!p) return { ok: false, code: 'not-found', error: 'no such proposal (not found, or not yours)' };
      return { ok: true, proposal: agentProposalView(ctx, p) };
    }
    return { ok: true, proposals: mine.slice(0, 50).map((p) => agentProposalView(ctx, p)) };
  }

  // ── the verbs ─────────────────────────────────────────────────────────────
  // R4 (2026-09-27): TWO OPERATIONS PER GRAIN, ACCESS FIRST. `setAccess`
  // writes a grain's ACCESS list (who may see and act, with an authority),
  // `setWatchers` its WATCHERS list (who is woken, and on what). A watcher's
  // principal must hold access at the same grain — refused by name
  // otherwise (`watcher-needs-access`); removing a principal's access removes
  // its watcher in the same write. `setGrain` writes both (and a rule's
  // pattern) in ONE index update. The pre-split single-assignment verbs
  // (`setAssignment` / `setScopeAssignment`) are the COMPATIBILITY WRITE:
  // one principal ⇒ one access row + one watcher row, replacing both lists.
  // Reach follows access: one visible grant per access row (origin
  // `access`) — a conversation's on its entry, the account's in
  // `accountGrants`, a rule's derived at read time — and a removed row takes
  // exactly its own grant with it, never a hand-written one.
  /** Where a grain lives + the two caps `authority:'send'` is checked
   *  against there. `grain` = `{kind:'conversation', convId}` |
   *  `{kind:'account'}` | `{kind:'pattern', id?}` (no id = a NEW rule). */
  function grainSite(adapterId, grain, t = now()) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    const kind = grain && grain.kind;
    if (kind === 'conversation') {
      if (!rec || !known(adapterId, grain.convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
      const key = `${adapterId}/${grain.convId}`;
      const en = store.index.peek(key);
      return { ok: true, rec, kind, key, id: key, convId: grain.convId, caps: authorityCapsFor(rec, en, t), holder: en, scope: { kind: 'conversation', id: key } };
    }
    if (!rec) return { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    const c = registry.capsOf(rec.kind);
    const scopeCaps = { offersSend: (c.sendAs || []).length > 0, sendWhy: (c.sendAs || []).length ? null : 'read-only-adapter', policyRequiresReview: policyRequiresReview(rec, null) };
    if (kind === 'account') return { ok: true, rec, kind, id: adapterId, caps: scopeCaps, holder: accountGrainOf(adapterId), scope: { kind: 'adapter', id: adapterId } };
    if (kind === 'pattern') {
      if (grain.id) {
        const pa = patternById(grain.id);
        if (!pa || pa.adapterId !== adapterId) return { ok: false, code: 'not-found', error: 'no such rule' };
        return { ok: true, rec, kind, id: pa.id, caps: scopeCaps, holder: pa, scope: { kind: 'pattern', id: pa.id } };
      }
      const id = `pa-${t.toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
      return { ok: true, rec, kind, id, caps: scopeCaps, holder: null, isNew: true, scope: { kind: 'pattern', id } };
    }
    return { ok: false, code: 'bad-request', error: 'grain.kind must be conversation|account|pattern' };
  }
  /** The id a watcher's INLINE filter is stored under — minted BEFORE the
   *  validator runs (the 2026-09-26 hotfix: a filtered row carrying its
   *  filter was refused for the very id this request supplies). One per
   *  (grain, principal); a watcher kept by the same principal keeps its id. */
  function inlineFilterIdFor(site, pk, prevWatcher) {
    if (prevWatcher && prevWatcher.filterId && /^f-/.test(prevWatcher.filterId)) return prevWatcher.filterId;
    return site.kind === 'conversation' ? `f-${site.key}|${pk}` : `f-${site.kind}-${site.id}|${pk}`;
  }
  const estimateOf = (e, t) => (e && typeof e === 'object' ? { matchedPerDay: Number(e.matchedPerDay) || 0, totalPerDay: Number(e.totalPerDay) || 0, windowDays: Number(e.windowDays) || 7, sampled: !!e.sampled, truncated: !!e.truncated, conversations: Number(e.conversations) || 0, at: t } : null);
  /**
   * WRITE ONE GRAIN — `patch` = `{access?, watchers?, pattern?}` (an absent
   * key keeps the stored list). Validates the ACCESS list, then every
   * watcher against the resulting access (a watcher whose principal lost its
   * access goes with it), mints inline filter ids first, applies the diff by
   * principal in ONE index update (a kept row keeps its createdAt, its
   * estimate and — a watcher — its pace ledger), writes / removes exactly the
   * reach rows the access diff names, audits every change, clears the wake
   * windows of the watchers that changed, prunes pending hits nobody waits
   * for any more, broadcasts.
   */
  async function setGrain(adapterId, grain, patch = {}, { by = 'user' } = {}) {
    const t = now();
    const site = grainSite(adapterId, grain, t);
    if (!site.ok) return site;
    const { rec, kind } = site;
    const cur = site.kind === 'conversation' ? convGrainOf(site.holder) : F.grainOf(site.holder);
    const p = patch && typeof patch === 'object' ? patch : {};
    // mirror-193: a dialog's whole-list write carries the STAMP of the lists it drew (`base`); a grain that moved
    // since — a route write its copy had not heard of, another window, an approval — is refused BY NAME and
    // nothing is written (never a newer grant silently replaced). No base = unconditional (agents, scripts).
    const bv = F.grainBaseVerdict(cur, p.base);
    if (!bv.ok) return bv;
    // the rule itself (a NEW rule needs one; an edit may change it)
    let pattern = site.holder && site.holder.pattern ? site.holder.pattern : null;
    if (kind === 'pattern' && (p.pattern !== undefined || site.isNew)) {
      const pv = F.validatePattern(p.pattern);
      if (!pv.ok) return { ok: false, code: 'bad-pattern', error: pv.error, why: pv.code, rule: pv.kind || null };
      pattern = pv.pattern;
    }
    // ① ACCESS
    let access = cur.access;
    if (p.access !== undefined) {
      const va = F.validateAccess(p.access === null ? [] : p.access, site.caps);
      if (!va.ok) return { ok: false, code: va.code, error: va.error, ...(va.why ? { why: va.why } : {}), ...(va.principal ? { principal: va.principal } : {}), ...(va.index !== undefined ? { index: va.index } : {}) };
      const prevA = new Map(cur.access.map((r) => [pkOf(r.principal), r]));
      access = va.access.map((r) => { const pr = prevA.get(pkOf(r.principal)); const same = pr && pr.authority === r.authority; return { ...r, createdAt: pr ? (pr.createdAt || t) : t, updatedAt: same ? (pr.updatedAt || pr.createdAt || t) : t, createdBy: pr ? (pr.createdBy || by) : by }; });
    }
    if (kind === 'pattern' && site.isNew && !access.length) return { ok: false, code: 'bad-access', error: 'a new rule needs at least one agent or group with access', why: 'principal' };
    const granted = new Set(access.map((r) => pkOf(r.principal)));
    // ② WATCHERS — against THIS grain's resulting access
    const prevW = new Map(cur.watchers.map((w) => [pkOf(w.principal), w]));
    let watchers;
    const filterWrites = [];   // [{id, filter, est}]
    if (p.watchers !== undefined) {
      const inList = Array.isArray(p.watchers) ? p.watchers : (p.watchers === null ? [] : p.watchers);
      if (!Array.isArray(inList)) return { ok: false, code: 'bad-watcher', error: 'watchers must be a list', why: 'not-an-object' };
      // mint each inline filter's id first, then validate (hotfix order)
      const minted = inList.map((w0) => {
        const w = w0 && typeof w0 === 'object' ? w0 : w0;
        if (!w || typeof w !== 'object') return w;
        const pk = pkOf(w.principal);
        if (w.filter && w.mode === 'filtered' && pk) return { ...w, filterId: inlineFilterIdFor(site, pk, prevW.get(pk)) };
        return w;
      });
      const vw = F.validateWatchers(minted, access, { inherited: siteInheritedOf(site), members: membersNow() });   // lane channel-agent-watch W3: access here OR above; notify-rules-r2: or a member of a group that holds it
      if (!vw.ok) return { ok: false, code: vw.code, error: vw.error, ...(vw.why ? { why: vw.why } : {}), ...(vw.principal ? { principal: vw.principal } : {}), ...(vw.index !== undefined ? { index: vw.index } : {}) };
      watchers = [];
      for (let i = 0; i < vw.watchers.length; i++) {
        const w = vw.watchers[i];
        const src = minted[i] || {};
        const pk = pkOf(w.principal);
        if (w.mode === 'filtered') {
          if (src.filter) {
            const fv = F.validateFilter(src.filter);
            if (!fv.ok) return { ok: false, code: 'bad-filter', error: fv.error, why: fv.code, rule: fv.kind || null, principal: w.principal };
            filterWrites.push({ id: w.filterId, filter: fv.filter, est: estimateOf(src.estimateAtSet, t) });
          } else if (!filterFor(w.filterId)) return { ok: false, code: 'no-such-filter', error: `filter ${w.filterId} does not exist — save the filter first (or send it inline as \`filter\`)`, principal: w.principal };
        }
        const pw = prevW.get(pk);
        watchers.push({ ...w, createdAt: pw ? (pw.createdAt || t) : t, updatedAt: t, createdBy: pw ? (pw.createdBy || by) : by, estimateAtSet: estimateOf(src.estimateAtSet, t) || (pw ? pw.estimateAtSet || null : null), stats: pw && pw.stats ? pw.stats : { wakes: [], hits: [] } });
      }
    } else {
      // access removed ⇒ its watcher goes too (notification needs access) — unless access ABOVE this grain still holds it (W3)
      const keep = F.eligibleKeys({ access, inherited: siteInheritedOf(site) });
      watchers = cur.watchers.filter((w) => F.eligibleFor(keep, w.principal, w));
    }
    const beforeA = new Set(cur.access.map((r) => pkOf(r.principal)));
    const beforeW = new Set(cur.watchers.map((w) => pkOf(w.principal)));
    const removedA = cur.access.filter((r) => !granted.has(pkOf(r.principal)));
    const addedA = access.filter((r) => !beforeA.has(pkOf(r.principal)));
    const changedW = new Set([...beforeW].filter((pk) => { const nw = watchers.find((w) => pkOf(w.principal) === pk); const ow = prevW.get(pk); return !nw || JSON.stringify({ ...nw, stats: null, updatedAt: null }) !== JSON.stringify({ ...ow, stats: null, updatedAt: null }); }));
    const oldFilterIds = cur.watchers.map((w) => w.filterId).filter(Boolean);
    const empty = !access.length && !watchers.length;
    // verify r1 F1: a user's whole-list write that DROPS an agent's own row leaves a mark that agent cannot write over
    // (its `watch` there is refused by name); a row the user writes or approves for that agent here lifts it
    const byUser = !/^agent:/.test(String(by));
    const droppedAgent = byUser && p.watchers !== undefined ? cur.watchers.filter((w) => F.watchOriginOf(w) === 'agent' && !watchers.some((nw) => pkOf(nw.principal) === pkOf(w.principal))) : [];
    const liftBlocks = byUser ? watchers.map((w) => pkOf(w.principal)) : [];
    await store.index.update((ix) => {
      if (droppedAgent.length || liftBlocks.length) { const b = ix.agentWatchBlocks && typeof ix.agentWatchBlocks === 'object' ? ix.agentWatchBlocks : (ix.agentWatchBlocks = {}); for (const w of droppedAgent) b[blockKey(site.scope, pkOf(w.principal))] = { at: t, by }; for (const pk of liftBlocks) delete b[blockKey(site.scope, pk)]; }
      let holder;
      if (kind === 'conversation') {
        holder = store.index.entry(adapterId, site.convId, { create: false });
        if (!holder) return;
        healP2(holder);
        liftGrainInPlace(ix, holder, 'conversation');
        holder.access = access; holder.watchers = watchers;
        // THE GRANTS — one row per access principal with origin `access`; a
        // user's own grant on the same pair is a DIFFERENT row, never touched
        for (const r of removedA) { holder.reachEntries = ACL.removeGrant(holder.reachEntries, { principal: r.principal, scope: site.scope, origin: 'access' }); holder.reachEntries = ACL.removeGrant(holder.reachEntries, { principal: r.principal, scope: site.scope, origin: 'assignment' }); }
        for (const r of access) holder.reachEntries = ACL.applyGrant(holder.reachEntries, { principal: { kind: r.principal.kind, id: r.principal.id }, scope: site.scope, level: 'visible', origin: 'access', at: r.createdAt || t, by });
      } else {
        const tbName = kind === 'account' ? 'accountAssignments' : 'patternAssignments';
        const tb = ix[tbName] || (ix[tbName] = {});
        if (empty && kind === 'account') { delete tb[site.id]; holder = null; }
        else {
          holder = tb[site.id] ? liftGrainInPlace(ix, tb[site.id], kind) : (tb[site.id] = { adapterId, scope: { kind, id: site.id }, createdAt: t, createdBy: by });
          holder.adapterId = adapterId; holder.scope = { kind, id: site.id }; holder.updatedAt = t;
          if (kind === 'pattern') { holder.id = site.id; holder.pattern = pattern; }
          holder.access = access; holder.watchers = watchers;
        }
        if (kind === 'account') {
          let g = Array.isArray(ix.accountGrants) ? ix.accountGrants : [];
          for (const r of removedA) { g = ACL.removeGrant(g, { principal: r.principal, scope: site.scope, origin: 'access' }); g = ACL.removeGrant(g, { principal: r.principal, scope: site.scope, origin: 'assignment' }); }
          for (const r of access) g = ACL.applyGrant(g, ACL.accountGrant({ principal: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null }, adapterId, at: r.createdAt || t, by }));
          ix.accountGrants = g;
        }
      }
      for (const fw of filterWrites) { const fp = filtersOf(ix)[fw.id] || null; filtersOf(ix)[fw.id] = { id: fw.id, ...fw.filter, createdAt: fp ? fp.createdAt : t, updatedAt: t, estimateAtSet: fw.est || (fp ? fp.estimateAtSet : null) || null }; }
      // a filter this grain minted and nothing references any more goes
      for (const fid of oldFilterIds) if (/\|/.test(fid) || /^f-(account|pattern)-/.test(fid)) { if (!filterReferenced(ix, fid)) delete filtersOf(ix)[fid]; }
    });
    // every changed watcher's wake windows (its held hits stay pending — the
    // new shape delivers them, or the prune below drops the orphans)
    for (const pk of changedW) { clearWakeTimer(kind === 'conversation' ? `${site.key}|${pk}` : `scope:${kind === 'account' ? 'acct' : 'pat'}:${site.id}|${pk}`); }
    await prunePending(adapterId, kind === 'conversation' ? site.key : null);
    for (const r of removedA) auditGrant('revoke', r.principal, site, t, by);
    for (const r of addedA) auditGrant('grant', r.principal, site, t, by);
    for (const pk of changedW) { const nw = watchers.find((w) => pkOf(w.principal) === pk); try { store.audit({ kind: 'watch', op: nw ? 'set' : 'unset', principal: (nw || prevW.get(pk)).principal, scope: site.scope, notify: nw ? nw.notify : null, at: t, by }); } catch {} }
    for (const w of watchers) if (!beforeW.has(pkOf(w.principal))) { try { store.audit({ kind: 'watch', op: 'set', principal: w.principal, scope: site.scope, notify: w.notify, at: t, by }); } catch {} }
    if (kind === 'conversation') notify([site.convId]); else notify([], { full: true });
    return { ok: true, ...grainAnswer(rec, site, t) };
  }
  function auditGrant(op, principal, site, t, by) {
    try { store.audit({ kind: 'acl', op, principal, scope: site.scope, level: op === 'grant' ? 'visible' : null, origin: 'access', at: t, by }); } catch {}
  }
  /** Does any watcher, conversation filter or rule still name `fid`? */
  function filterReferenced(ix, fid) {
    for (const en of Object.values(ix.conversations || {})) {
      if (!en) continue;
      if (en.filterId === fid) return true;
      if ((Array.isArray(en.watchers) ? en.watchers : []).some((w) => w && w.filterId === fid)) return true;
      if (en.assignment && en.assignment.filterId === fid) return true;
    }
    for (const tbName of ['accountAssignments', 'patternAssignments']) for (const g of Object.values(ix[tbName] || {})) if (g && ((g.filterId === fid) || (Array.isArray(g.watchers) && g.watchers.some((w) => w && w.filterId === fid)))) return true;
    return false;
  }
  /** Pending hits wait for a WATCHER; one no watcher in effect names any more
   *  (it was removed, or its principal lost access) would sit in the count
   *  for ever — dropped here, after a grain changed. `onlyKey` narrows the
   *  scan to one conversation (the conversation grain). */
  async function prunePending(adapterId, onlyKey = null) {
    const drop = [];
    for (const en of Object.values(store.index.live())) {
      if (!en || en.adapterId !== adapterId || (onlyKey && en.key !== onlyKey)) continue;
      const hasTagged = Array.isArray(en.pending) && en.pending.some((x) => x && x.for);
      const hasElided = en.pendingElidedBy && Object.keys(en.pendingElidedBy).length;
      const hasUntagged = (Array.isArray(en.pending) && en.pending.some((x) => x && !x.for)) || Number(en.pendingElided) > 0;
      if (!hasTagged && !hasElided && !hasUntagged) continue;
      const eff = wakeEffOf(en);   // a fan-out target's hits wait only while its conversation runs
      const live = new Set(eff ? eff.watchers.map((x) => pkOf(x.watcher.principal)) : []);
      const gone = new Set([...(en.pending || []).map((x) => x && x.for).filter(Boolean), ...Object.keys(en.pendingElidedBy || {})].filter((pk) => !live.has(pk)));
      if (gone.size || (hasUntagged && !live.size)) drop.push({ key: en.key, gone, untagged: hasUntagged && !live.size });
    }
    if (!drop.length) return;
    await store.index.update((ix) => {
      for (const d of drop) {
        const e2 = ix.conversations[d.key];
        if (!e2) continue;
        healP2(e2);
        e2.pending = e2.pending.filter((x) => !(x && ((x.for && d.gone.has(x.for)) || (!x.for && d.untagged))));
        for (const pk of d.gone) delete e2.pendingElidedBy[pk];
        if (d.untagged) e2.pendingElided = 0;
      }
    });
  }
  /** What every grain verb answers: the grain's two lists as the dialogs read
   *  them (+ `assignment`, the pre-split summary a legacy caller reads). */
  function grainAnswer(rec, site, t) {
    if (site.kind === 'conversation') {
      const en = store.index.peek(site.key);
      const g = convGrainOf(en);
      const capsNow = authorityCapsFor(rec, en, t);
      return { grain: { kind: 'conversation', id: site.key }, access: g.access.map((r) => accessRowView(r, capsNow)), watchers: g.watchers.map((w) => watcherView(w, t)), assignment: assignmentView(rec, en, t) };
    }
    const holder = site.kind === 'account' ? accountGrainOf(rec.id) : patternById(site.id);
    const v = holder ? grainView(rec, holder, t) : null;
    return { grain: { kind: site.kind, id: site.id }, access: v ? v.access : [], watchers: v ? v.watchers : [], assignment: v };
  }
  /** GRANT ACCESS — the first operation: a grain's whole ACCESS list. */
  function setAccess(adapterId, grain, list, opts = {}) { return setGrain(adapterId, grain, { access: list, ...(opts && opts.base !== undefined ? { base: opts.base } : {}) }, opts); }
  /** NOTIFY — the second operation: a grain's whole WATCHERS list; every
   *  principal must already hold access there. */
  function setWatchers(adapterId, grain, list, opts = {}) { return setGrain(adapterId, grain, { watchers: list, ...(opts && opts.base !== undefined ? { base: opts.base } : {}) }, opts); }
  /** REMOVE a rule (its access rows, its watchers, its derived reach). */
  async function removePattern(adapterId, id, { by = 'user' } = {}) {
    const pa = patternById(id);
    if (!pa || pa.adapterId !== adapterId) return { ok: false, code: 'not-found', error: 'no such rule' };
    const t = now();
    const g = F.grainOf(pa);
    await store.index.update((ix) => { const tb = ix.patternAssignments || {}; const fids = g.watchers.map((w) => w.filterId).filter(Boolean); delete tb[id]; for (const fid of fids) if (/^f-pattern-/.test(fid) && !filterReferenced(ix, fid)) delete filtersOf(ix)[fid]; });
    for (const w of g.watchers) clearWakeTimer(`scope:pat:${id}|${pkOf(w.principal)}`);
    await prunePending(adapterId);
    for (const r of g.access) auditGrant('revoke', r.principal, { scope: { kind: 'pattern', id } }, t, by);
    notify([], { full: true });
    return { ok: true, removed: true, id };
  }

  /** THE COMPATIBILITY WRITE (conversation grain): `{…assignment}` ⇒ ONE
   *  access row + ONE watcher row for its principal, replacing both lists;
   *  `null` clears both. Validated by the pre-split validator (its defaults
   *  and refusals are unchanged). */
  async function setAssignment(adapterId, convId, input) {
    if (!known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    if (input === null) return setGrain(adapterId, { kind: 'conversation', convId }, { access: [], watchers: [] });
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    const t = now();
    const key = `${adapterId}/${convId}`;
    const en = store.index.peek(key);
    const b = input && typeof input === 'object' ? input : {};
    const cur = convGrainOf(en);
    const prevW = cur.watchers.find((w) => b.principal && pkOf(w.principal) === pkOf(b.principal));
    const inlineFilterId = b.filter && b.mode === 'filtered' && pkOf(b.principal) ? inlineFilterIdFor({ kind: 'conversation', key }, pkOf(b.principal), prevW) : null;
    const v = F.validateAssignment({ ...b, ...(inlineFilterId ? { filterId: inlineFilterId } : {}) }, authorityCapsFor(rec, en, t));
    if (!v.ok) return { ok: false, code: v.code || 'bad-assignment', error: v.error, ...(v.code ? {} : { why: v.why || null }) };
    if (v.assignment.mode === 'filtered' && !inlineFilterId && !filterFor(v.assignment.filterId)) return { ok: false, code: 'no-such-filter', error: `filter ${v.assignment.filterId} does not exist — save the filter first` };
    const sp = F.splitAssignment(v.assignment);
    return setGrain(adapterId, { kind: 'conversation', convId }, { access: [sp.access], watchers: [{ ...sp.watcher, ...(inlineFilterId ? { filter: b.filter } : {}), estimateAtSet: b.estimateAtSet || null }] });
  }

  /** THE COMPATIBILITY WRITE (account / rule grains): the pre-split single
   *  assignment ⇒ one access row + one watcher row (the rule's `pattern`
   *  rides along); `null` clears the account's lists / removes the rule.
   *  The inline filter's id is minted before the validator (the 2026-09-26
   *  hotfix), and a refusal carries the validator's closed code. */
  async function setScopeAssignment(adapterId, scope, input) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    const kind = scope && scope.kind;
    if (kind !== 'account' && kind !== 'pattern') return { ok: false, code: 'bad-assignment', error: 'scope.kind must be account|pattern (a conversation is assigned on its own route)' };
    if (input === null) return kind === 'account' ? setGrain(adapterId, { kind: 'account' }, { access: [], watchers: [] }) : (scope.id ? removePattern(adapterId, scope.id) : { ok: false, code: 'not-found', error: 'no such rule' });
    const b = input && typeof input === 'object' ? input : {};
    const t = now();
    const site = grainSite(adapterId, kind === 'account' ? { kind } : { kind, id: scope.id || null }, t);
    if (!site.ok) return site;
    const cur = F.grainOf(site.holder);
    const prevW = cur.watchers.find((w) => b.principal && pkOf(w.principal) === pkOf(b.principal));
    const inlineFilterId = b.filter && b.mode === 'filtered' && pkOf(b.principal) ? inlineFilterIdFor(site, pkOf(b.principal), prevW) : null;
    const v = F.validateAssignment({ ...b, ...(inlineFilterId ? { filterId: inlineFilterId } : {}), scope: { kind, id: site.id } }, site.caps);
    if (!v.ok) return { ok: false, code: v.code || 'bad-assignment', error: v.error, ...(v.code ? {} : { why: v.why || null }) };
    if (v.assignment.mode === 'filtered' && !inlineFilterId && !filterFor(v.assignment.filterId)) return { ok: false, code: 'no-such-filter', error: 'a filtered assignment needs its filter (send `filter` with the assignment)' };
    const sp = F.splitAssignment(v.assignment);
    const r = await setGrain(adapterId, kind === 'account' ? { kind } : { kind, id: site.isNew ? null : site.id }, { access: [sp.access], watchers: [{ ...sp.watcher, ...(inlineFilterId ? { filter: b.filter } : {}), estimateAtSet: b.estimateAtSet || null }], ...(kind === 'pattern' ? { pattern: b.pattern } : {}) });
    if (r && r.ok && r.assignment && kind === 'pattern') r.assignment = { ...r.assignment, scope: { kind: 'pattern', id: r.grain.id } };
    return r;
  }

  /** Every grain naming this agent (itself or one of its groups) on every
   *  account — what `vibespace-channels status` prints: the grain, the
   *  access authority, and the watcher (or none — access only). */
  function accessFor(ctx) {
    const out = [];
    const t = now();
    for (const rec of adapterRecords().adapters) {
      if (rec.enabled === false) continue;
      const label = rec.label || rec.id;
      const push = (grain, g, extra = {}) => {
        for (const r of g.access) {
          if (!F.rowNames(r, ctx)) continue;
          const w = g.watchers.find((x) => pkOf(x.principal) === pkOf(r.principal)) || null;
          out.push({ adapterId: rec.id, adapter: label, grain, ...extra, via: r.principal.kind, as: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null }, authority: r.authority, watched: w ? { notify: w.notify, mode: w.mode, digestMinutes: w.digestMinutes, dailyWakeCap: w.dailyWakeCap, receiptWake: !!w.receiptWake, wakes24h: ledgerView(w.stats, t).wakes24h } : null });
        }
      };
      const acct = accountGrainOf(rec.id);
      if (acct) push('account', F.grainOf(acct));
      for (const pa of patternsOf(rec.id)) push('pattern', F.grainOf(pa), { patternId: pa.id, rule: F.patternSummary(pa.pattern) });
      for (const en of Object.values(store.index.live())) if (en && en.adapterId === rec.id) { const g = convGrainOf(en); if (g.access.length) push('conversation', g, { key: agentId(en.key), title: agentTitle(en, en.id) }); }   // verify r3 F6: the key as a line piece; verify r2 F4: the seventh title answer (`vibespace-channels status` prints it before the next row) through the belt
    }
    return { ok: true, access: out };
  }

  /**
   * THE HONEST ESTIMATE OVER A SCOPE (§7.3, before saving): the conversations
   * a watcher of this grain would be woken by — for a rule, the ones it
   * matches; with `principal` (R4), minus the ones where that principal is
   * watched at a FINER grain (its own watcher on the conversation, or — for
   * the account — on a rule that matches it) — their logs read with a bound
   * per conversation and in total — `sampled` whenever a bound was hit or
   * not every conversation was covered — then folded through notify and the
   * daily cap.
   */
  function estimateScope(adapterId, scope, { filter = null, pattern = null, notify: how = 'wake', digestMinutes = F.DEFAULT_DIGEST_MINUTES, dailyWakeCap = F.DEFAULT_DAILY_WAKE_CAP, principal = null } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    let f = null;
    if (filter !== null && filter !== undefined) { const v = F.validateFilter(filter); if (!v.ok) return { ok: false, code: 'bad-filter', error: v.error, why: v.code, rule: v.kind || null }; f = v.filter; }
    let pat = null;
    if (scope && scope.kind === 'pattern') { const pv = F.validatePattern(pattern); if (!pv.ok) return { ok: false, code: 'bad-pattern', error: pv.error, why: pv.code, rule: pv.kind || null }; pat = pv.pattern; }
    const pk = principal ? pkOf(principal) : null;
    const finer = (en) => {
      if (!pk) return false;
      if (convGrainOf(en).watchers.some((w) => pkOf(w.principal) === pk)) return true;
      if (scope && scope.kind === 'account') return patternsOf(adapterId).some((pa) => F.grainOf(pa).watchers.some((w) => pkOf(w.principal) === pk) && F.matchConversation(pa.pattern, convFacts(en)).hit);
      return false;
    };
    const convs = Object.values(store.index.live()).filter((en) => en && en.adapterId === adapterId && !en.unlistedAt && !finer(en) && (!pat || F.matchConversation(pat, convFacts(en)).hit))
      .sort((a, b) => (Number(b.lastAt) || 0) - (Number(a.lastAt) || 0));
    const PER_CONV = 400, MAX_CONVS = 200, TOTAL = 20000;
    const recs = [];
    let covered = 0, capHit = false;
    for (const en of convs.slice(0, MAX_CONVS)) {
      if (recs.length >= TOTAL) { capHit = true; break; }
      const r = store.readTail(adapterId, en.id, { limit: PER_CONV });
      if (r.length >= PER_CONV) capHit = true;
      recs.push(...r);
      covered++;
    }
    const est = F.estimate(f, recs, { now: now(), capHit, ctx: { subjectOf: (r) => rawFactsOf(rec, r).subject } });
    return { ok: true, estimate: { ...est, conversations: convs.length, covered, sampled: !!(est.sampled || covered < convs.length) }, expectedWakesPerDay: F.expectedWakesPerDay({ notify: how, digestMinutes, matchedPerDay: est.matchedPerDay, dailyWakeCap }) };
  }

  /**
   * THE MIGRATION (`2026-09-channels-aggregated-im`, run through
   * src/server/migrations.js): a conversation the owner TRACKED keeps being
   * polled fast — `refresh.every = 30` (by 'migration', visible and editable
   * in its "Refresh every ▸"); a conversation never ingested gets its backlog
   * READ (`readAt` = now) so the upgrade does not open on thousands of
   * unread; the `tracked` field is removed everywhere; every account gets
   * `linkedAt` (unread counts start there). Assignments are untouched.
   * Idempotent: a second run finds nothing tracked and stamps nothing.
   */
  function migrateAggregated() {
    const t = now();
    // A BLOCKED store refuses every write: the migration FAILS by name (the
    // shared runner then retries it next boot) instead of recording a success
    // whose every edit was refused (lane R2 verify, 2026-09-26).
    const blocked = store.index.blocked() || store.adapters.blocked();
    if (blocked) throw new Error(`the channels store refuses writes (${blocked}) — retried next boot`);
    // THE PLAN IS COMPUTED NOW, from the live index (read-only), because the
    // runner is synchronous and the door below runs its function a microtask
    // later: a report filled inside it was logged as zeros on every instance.
    // The door then applies exactly this plan (re-checked per row).
    const plan = [];
    for (const en of Object.values(store.index.live())) {
      if (!en) continue;
      const hot = en.tracked === true && !en.refresh;
      const read = !en.anchor && !(Number(en.readAt) > 0);
      const clear = 'tracked' in en;
      if (hot || read || clear) plan.push({ key: en.key, hot, read, clear });
    }
    const linkPlan = adapterRecords().adapters.filter((rec) => !(Number(rec.linkedAt) > 0)).map((rec) => rec.id);
    const report = { hot: plan.filter((p) => p.hot).map((p) => p.key), readStamped: plan.filter((p) => p.read).length, cleared: plan.filter((p) => p.clear).length, linked: linkPlan.slice() };
    const idx = plan.length ? store.index.update((ix) => {
      for (const p of plan) {
        const en = ix.conversations[p.key];
        if (!en) continue;
        if (p.hot && !en.refresh) en.refresh = { every: 30, by: 'migration', at: t };
        if (p.read && !(Number(en.readAt) > 0)) en.readAt = t;
        if (p.clear) delete en.tracked;
      }
    }) : Promise.resolve();
    const ad = linkPlan.length ? store.adapters.update(() => {
      for (const rec of adapterRecords().adapters) if (linkPlan.includes(rec.id) && !(Number(rec.linkedAt) > 0)) rec.linkedAt = t;
    }) : Promise.resolve();
    return { ...report, write: Promise.all([idx, ad]) };
  }

  /**
   * THE MIGRATION (`2026-09-channels-access-watchers`, run through
   * src/server/migrations.js — R4, 2026-09-27): every pre-split single
   * assignment becomes ONE access row + ONE watcher row for its principal —
   * a conversation's `assignment` (its pace ledger = the conversation's own
   * wakes, the inherited grains' mirrors excluded), an account / rule
   * record's top-level `principal` (its `stats` ride on the watcher); every
   * grant with origin `assignment` becomes origin `access`; pending hits held
   * before the split (no `for`) are tagged with the watcher they were held
   * for (the first in effect — the only assignment there was). The engine
   * STARTS before the runner: every reader lifts a pre-split record the same
   * way (`F.grainOf`, merged), and a write reaching one lifts it in place
   * first — so the order only decides WHEN the bytes change, never what a
   * reader sees. Idempotent: a second run finds nothing to lift.
   */
  function migrateGrants() {
    const blocked = store.index.blocked();
    if (blocked) throw new Error(`the channels store refuses writes (${blocked}) — retried next boot`);
    // THE PLAN IS COMPUTED NOW from the live index (the runner is synchronous;
    // the door below runs a microtask later) — these counts ARE the rows it changes
    const convs = [];
    for (const en of Object.values(store.index.live())) {
      if (!en) continue;
      const legacy = !!(en.assignment && en.assignment.principal);
      const assignmentKey = 'assignment' in en;
      const grants = (Array.isArray(en.reachEntries) ? en.reachEntries : []).filter((g) => g && g.origin === 'assignment').length;
      const untagged = (Array.isArray(en.pending) ? en.pending : []).filter((p) => p && !p.for).length + (Number(en.pendingElided) > 0 ? 1 : 0);
      let tagPk = null;
      if (untagged && !legacy) { const eff = effectiveFor(en); tagPk = eff && eff.watchers[0] ? pkOf(eff.watchers[0].watcher.principal) : null; }
      if (legacy || assignmentKey || grants || (untagged && tagPk)) convs.push({ key: en.key, legacy, grants, untagged: untagged && (legacy || tagPk) ? untagged : 0, tagPk });
    }
    const accts = Object.entries(store.index.table('accountAssignments') || {}).filter(([, g]) => g && g.principal).map(([id]) => id);
    const pats = Object.entries(store.index.table('patternAssignments') || {}).filter(([, g]) => g && g.principal).map(([id]) => id);
    const acctGrants = (store.index.table('accountGrants') || []).filter((g) => g && g.origin === 'assignment').length;
    const report = { conversations: convs.filter((c) => c.legacy).length, accounts: accts.length, patterns: pats.length, grantsRenamed: convs.reduce((n, c) => n + c.grants, 0) + acctGrants, pendingTagged: convs.reduce((n, c) => n + c.untagged, 0) };
    const any = convs.length || accts.length || pats.length || acctGrants;
    const write = any ? store.index.update((ix) => {
      for (const c of convs) {
        const e2 = ix.conversations[c.key];
        if (!e2) continue;
        liftGrainInPlace(ix, e2, 'conversation');
        if (c.tagPk) {
          for (const p of Array.isArray(e2.pending) ? e2.pending : []) if (p && !p.for) p.for = c.tagPk;
          if (Number(e2.pendingElided) > 0) { if (!e2.pendingElidedBy || typeof e2.pendingElidedBy !== 'object') e2.pendingElidedBy = {}; e2.pendingElidedBy[c.tagPk] = (Number(e2.pendingElidedBy[c.tagPk]) || 0) + Number(e2.pendingElided); e2.pendingElided = 0; }
        }
        if (Array.isArray(e2.reachEntries)) for (const g of e2.reachEntries) if (g && g.origin === 'assignment') g.origin = 'access';
      }
      for (const id of accts) { const g = (ix.accountAssignments || {})[id]; if (g) liftGrainInPlace(ix, g, 'account'); }
      for (const id of pats) { const g = (ix.patternAssignments || {})[id]; if (g) liftGrainInPlace(ix, g, 'pattern'); }
      for (const g of Array.isArray(ix.accountGrants) ? ix.accountGrants : []) if (g && g.origin === 'assignment') g.origin = 'access';
    }) : Promise.resolve();
    return { ...report, write };
  }

  /** SAVE this conversation's filter (`null` clears it — refused by name while
   *  a filtered assignment still points at it). One filter per conversation
   *  in v1, keyed so a later phase may share one across rows. */
  async function setFilter(adapterId, convId, input, { estimate: est = null } = {}) {
    if (!known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    const key = `${adapterId}/${convId}`;
    const t = now();
    const en = store.index.peek(key);
    if (input === null) {
      if (en.filterId && convGrainOf(en).watchers.some((w) => w.mode === 'filtered' && w.filterId === en.filterId)) return { ok: false, code: 'filter-in-use', error: 'this filter is what a notification wakes on — switch that notification to all messages or remove it first' };
      await store.index.update((ix) => { const e2 = store.index.entry(adapterId, convId, { create: false }); if (!e2) return; const fid = e2.filterId; e2.filterId = null; if (fid && !Object.values(ix.conversations).some((x) => x.filterId === fid)) delete filtersOf(ix)[fid]; });
      notify([convId]);
      return { ok: true, filter: null };
    }
    const v = F.validateFilter(input);
    if (!v.ok) return { ok: false, code: 'bad-filter', error: v.error };
    const id = en.filterId || `f-${key}`;
    let saved = null;
    await store.index.update((ix) => {
      const e2 = store.index.entry(adapterId, convId, { create: false });
      if (!e2) return;
      const prev = filtersOf(ix)[id] || null;
      saved = { id, ...v.filter, createdAt: prev ? prev.createdAt : t, updatedAt: t, estimateAtSet: est && typeof est === 'object' ? { matchedPerDay: Number(est.matchedPerDay) || 0, totalPerDay: Number(est.totalPerDay) || 0, windowDays: Number(est.windowDays) || 7, sampled: !!est.sampled, truncated: !!est.truncated, at: t } : (prev ? prev.estimateAtSet : null) || null };
      filtersOf(ix)[id] = saved;
      e2.filterId = id;
    });
    notify([convId]);
    return { ok: true, filter: saved };
  }

  /** ESTIMATE a filter over THIS conversation's stored history (§7.1 / §10.2):
   *  runs SERVER-SIDE; the client never receives the corpus. `null` estimates
   *  "all messages". Honest about the reader's cap. */
  /**
   * THE RULE PREVIEW (lane notify-rules-r2, owner inc-muxt96t5-pk42: "通知里我不是让你实现 preview 匹配到的消息吗？"): ONE
   * keyword or regex rule (judged exactly as a save judges it — a refused regex answers its refusal, nothing runs) over
   * the LOCAL logs of the grain's conversations (store.search: newest first, ≤ PREVIEW_LIMIT kept, ≤ PREVIEW_BYTES read,
   * ZERO vendor calls) → the newest hits as `{convId, title, author, at, before, match, after}` (the matched span cut
   * out of the folded text — the dialog marks it with textContent only) + `matched` (N inside the bytes read).
   */
  const PREVIEW_LIMIT = 10, PREVIEW_BYTES = 16 * 1024 * 1024, PREVIEW_CONTEXT = 80;
  async function previewRule(adapterId, scope, { rule = null, convId = null, pattern = null } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    const r0 = rule && typeof rule === 'object' ? rule : null;
    if (!r0 || (r0.kind !== 'keyword' && r0.kind !== 'regex')) return { ok: false, code: 'bad-rule', error: 'preview takes ONE keyword or regex rule', why: 'preview-kind' };
    const v = F.validateRule(r0);
    if (!v.ok) return { ok: false, code: 'bad-rule', error: v.error, why: v.code, rule: v.kind || null, ...(v.piece ? { piece: v.piece } : {}), ...(v.max ? { max: v.max } : {}) };
    const kind = scope && scope.kind;
    let convIds;
    if (kind === 'conversation') {
      const en = store.index.peek(`${adapterId}/${convId}`);
      if (!en) return { ok: false, code: 'not-found', error: `no such conversation '${convId}'` };
      convIds = [String(convId)];
    } else {
      let pat = null;
      if (kind === 'pattern') { const pv = F.validatePattern(pattern); if (!pv.ok) return { ok: false, code: 'bad-pattern', error: pv.error, why: pv.code, rule: pv.kind || null }; pat = pv.pattern; }
      else if (kind !== 'account') return { ok: false, code: 'bad-request', error: 'scope.kind must be conversation|account|pattern' };
      convIds = Object.values(store.index.live()).filter((en) => en && en.adapterId === adapterId && !en.unlistedAt && (!pat || F.matchConversation(pat, convFacts(en)).hit)).map((en) => String(en.id));
    }
    const filter = { match: 'any', rules: [v.rule] };
    const own = ownRecordOf(rec);   // int229 (× channel-self-unread): the owner's own message never wakes a watcher — never a preview match
    // the keyword's own bytes are the raw pre-check (a JSON line carries them as written unless they need escaping)
    const q = v.rule.kind === 'keyword' && !/["\\\u0000-\u001f]/.test(v.rule.value) ? v.rule.value : '';
    const found = convIds.length ? await store.search(adapterId, q, { limit: PREVIEW_LIMIT, maxBytes: PREVIEW_BYTES, convIds, match: (x) => !own(x) && F.matchRecord(filter, x).hit }) : { results: [], matched: 0, truncated: false, coverage: { scanned: 0, total: 0, capped: false, oldestAt: null } };
    const hits = found.results.map((x) => {
      const text = F.regexText(x.text);
      let span = null;
      if (v.rule.kind === 'regex') span = F.regexSpan(v.rule.value, x.text);
      else { const i = text.toLowerCase().indexOf(v.rule.value.toLowerCase()); if (i >= 0) span = [i, i + v.rule.value.length]; }
      const [s, e] = span || [0, 0];
      const from = Math.max(0, s - PREVIEW_CONTEXT), to = Math.min(text.length, e + PREVIEW_CONTEXT);
      const en = store.index.peek(`${adapterId}/${x.convId}`);
      return { convId: String(x.convId || ''), title: (en && en.title) || null, author: (x.author && (x.author.name || x.author.id)) || null, at: Number(x.at) || null,
        before: (from > 0 ? '…' : '') + text.slice(from, s).replace(/\s+/g, ' '), match: text.slice(s, e).replace(/\s+/g, ' ').slice(0, 200), after: text.slice(e, to).replace(/\s+/g, ' ') + (to < text.length ? '…' : '') };
    });
    return { ok: true, rule: v.rule, hits, shown: hits.length, matched: found.matched || 0, truncated: !!found.truncated, coverage: found.coverage || null, conversations: convIds.length };
  }
  function estimateFilter(adapterId, convId, input) {
    if (!known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    let filter = null;
    if (input !== null && input !== undefined) {
      const v = F.validateFilter(input);
      if (!v.ok) return { ok: false, code: 'bad-filter', error: v.error };
      filter = v.filter;
    }
    const recs = store.readTail(adapterId, convId, { limit: ESTIMATE_CAP });
    const acct = adapterRecords().adapters.find((a) => a.id === adapterId) || null;
    const e = F.estimate(filter, recs, { now: now(), capHit: recs.length >= ESTIMATE_CAP, ctx: { subjectOf: (r) => rawFactsOf(acct, r).subject } });
    return { ok: true, estimate: e };
  }

  return {
    policyFor, policyRequiresReview, authorityCapsFor, healP2, rotationsOf, filterFor, assignmentView, pendingOf, clearCarried, elidedTotal,
    statsView, wakeLatencyFor, accountGrainOf, patternsOf, patternById, pkOf, legacyConvAssignment, convGrainOf, convFacts, effectiveFor, fanTargets,
    wakeEffOf, storedWatcherFor, itemIs, scopeKeyOf, watcherRef, accessRowView, watcherView, eligibleAboveView, grainView, reachFor, groupsOfSession,
    convFor, stillSees, effectiveForAccount, accountScopeGrants, searchFor, readAroundFor, setPolicy, setReach, reachView, request, decideRequest,
    directoryLists, setAgentDirectory, agentWatch, agentUnwatch, agentWatchesFor, listFor, readFor, readThreadFor, statusFor, setGrain, setAccess, setWatchers,
    removePattern, setAssignment, setScopeAssignment, accessFor, estimateScope, migrateAggregated, migrateGrants, setFilter, estimateFilter,
    previewRule, membersNow,
  };
}

module.exports = { create };
