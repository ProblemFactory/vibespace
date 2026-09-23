'use strict';
/**
 * AGENT GROUPS — the engine (docs/design-communication-panel.zh.md §22,
 * rulings D1/D2 + §22.5). ORCH: the PURE model is src/channel-groups.js; this
 * module only resolves names, asks reach, persists, broadcasts and delivers.
 *
 *   PERSISTENCE  data/channels/groups.json through channel-store's ONE
 *                serialized door (`store.groups.update`), and each group's
 *                LOG as an ordinary append-only conversation log
 *                (`appendRecords('groups', <groupId>, …)`, the ChannelRecord
 *                shape; system records carry `raw.kind` invite / leave / kick /
 *                rename / create / archive). The log lands FIRST, the summary
 *                (`lastAt`/`lastText`) SECOND, inside the same door.
 *   REACH        msg-acl, asked per (actor, target) over the live roster —
 *                the SAME answer `vibespace-msg list` gets. An invitee outside
 *                the actor's reach is refused with the uniform "not found or
 *                not reachable" (no existence oracle). The owner reaches all.
 *   MONEY        a WAKE is a billed turn: `deliver.deliverToConversation` with
 *                spendReason `peer-message` — THE ladder, whose authorizer
 *                decides; this module adds nothing beside it (test-spend-paths
 *                §2 allowlists exactly this forward). A refused wake is
 *                JOURNALED (audit + log) and is NOT stashed: the message is in
 *                the log and rides the member's next report — a stash would
 *                hand it over twice. BEFORE the ladder (r2): the caller's
 *                `consent(n)` is asked inside the door with the number of
 *                wakes the act would cause (nothing is written on a refusal),
 *                and each wake asks the caller's `mayWake` — THE PACE,
 *                `pacerFor(sender)`, persisted in the store, refunded when the
 *                wake did not go out.
 *   REPORTS      `reportsForTurn(cid, budget)` = the next-turn reports for one
 *                conversation (agent-routes calls it on a USER-initiated turn
 *                only) and `commitReports` stamps `reportedUpTo` per (group,
 *                member) — at render, the accepted-lost stance every other
 *                injection marker takes. A successful wake stamps it too, so a
 *                woken member is never handed the same message again.
 *   BROADCAST    every change pushes `channel-groups-updated` {changed, groups,
 *                messages?} — the recomputed list, never a dirty bit.
 */
const crypto = require('crypto');
const G = require('../channel-groups.js');
const { makeRecord, inertFrames } = require('../channel-record.js');
const msgAcl = require('../msg-acl.js');

const WAKE_BUDGET = 4096;       // one wake's report (it rides its own turn, not the 10 KiB injection)
const TURN_BUDGET = 4096;       // every group report on ONE user turn together
const MIN_REPORT_ROOM = 320;    // below this a report waits for the next turn rather than arrive as a stub
const TEXT_MAX = 16 * 1024;
const LOG_READ = 2000;
const READ_MAX = 200;
const LAST_TEXT_MAX = 160;
const WAITING_NAMED = 3;        // the trailer names at most this many waiting groups, then counts
const WAITING_NAME_BYTES = 40;
/** A group name clipped to WAITING_NAME_BYTES (UTF-8, never mid-character). */
function clipName(name) {
  const v = String(name);
  if (Buffer.byteLength(v, 'utf-8') <= WAITING_NAME_BYTES) return v;
  const cps = Array.from(v);
  let out = '';
  for (const c of cps) { if (Buffer.byteLength(out + c, 'utf-8') + 3 > WAITING_NAME_BYTES) break; out += c; }
  return out + '…';
}

function create({
  store,
  deliver = null,
  broadcast = () => {},
  now = () => Date.now(),
  log = console,
  // `() => [{cid, name, groups[], reachability}]` — the live agent sessions
  // (the wiring's liveSessions). Reach and names are asked of THIS, per call.
  roster = () => [],
  // Task Group externalVisibility (msg-acl's group setting)
  groupSetting = () => 'none',
  rand = () => crypto.randomBytes(4).toString('hex'),
  // the WAKE PACE's clock (real time by default — the pace is about billed
  // turns in the world, never the injected record clock `now`)
  paceClock = () => Date.now(),
} = {}) {
  if (!store || !store.groups) throw new Error('groups-engine: a channel store with the groups family is required');
  const A = G.GROUP_ADAPTER_ID;
  let seq = 0;

  const live = () => { try { return (roster() || []).filter((s) => s && s.cid); } catch (e) { log.warn && log.warn('[groups] roster threw:', e && e.message); return []; } };
  const sessionOf = (cid) => live().find((s) => s.cid === cid) || null;
  const all = () => store.groups.live().groups;
  const getGroup = (id) => (G.isGroupId(id) ? all()[id] || null : null);

  /** msg-acl's level of `to` as seen from `by` (the owner reaches everyone live). */
  function reach(by, to) {
    const target = sessionOf(to);
    if (!target) return 'none';
    if (by === G.OWNER) return 'messageable';
    const sender = sessionOf(by);
    return msgAcl.levelFor({ cid: target.cid, groups: target.groups || [], reachability: target.reachability || null }, sender ? sender.groups || [] : [], groupSetting);
  }
  const displayName = (group, cid) => {
    if (cid === G.OWNER) return 'User';   // agent-facing; the panel renders the owner's own rows as "You" (author.isSelf)
    const s = sessionOf(cid);
    if (s && s.name) return G.cleanName(s.name) || cid.slice(0, 8);
    const m = group ? G.memberOf(group, cid) : null;
    return (m && m.name) || cid.slice(0, 8);
  };
  const uniform = (ref) => ({ ok: false, code: 'unreachable', error: `no agent session "${ref}" you can message (not found, not live, or outside your reach — vibespace-msg list shows it)` });

  /** A member reference — a conversation id or a LIVE session's name — resolved
   *  among the sessions `by` can MESSAGE. One uniform refusal for all misses;
   *  a name several reachable sessions share is refused `ambiguous` WITH the
   *  candidates (name + conversation id — only sessions `by` may message, so
   *  the list is no oracle) and never guessed. */
  function resolveMember(ref, by) {
    const r = String(ref || '').trim();
    if (!r) return { ok: false, code: 'bad-member', error: 'an empty member reference' };
    const hits = live().filter((s) => s.cid === r || (s.name && s.name === r));
    const ok = hits.filter((s) => s.cid !== by && msgAcl.canMessage(reach(by, s.cid)));
    if (hits.some((s) => s.cid === by) && !ok.length) return { ok: false, code: 'self', error: 'that is this session' };
    if (!ok.length) return uniform(r);
    if (ok.length > 1) {
      const candidates = ok.map((s) => ({ name: s.name || null, conversationId: s.cid }));
      return { ok: false, code: 'ambiguous', candidates, error: `ambiguous name "${r}" — ${ok.length} sessions you can message are called that: ${candidates.map((c) => c.conversationId).join(', ')}; name one by its conversation id` };
    }
    return { ok: true, cid: ok[0].cid, name: ok[0].name || null };
  }

  /** A group reference — its id, or its name among the groups `by` belongs to
   *  (the owner: every group). A group `by` is not in answers exactly like a
   *  group that does not exist. */
  function resolveGroup(ref, by, { archived = false } = {}) {
    const r = String(ref || '').trim();
    const mine = (g) => by === G.OWNER || !!G.memberOf(g, by);
    const nf = { ok: false, code: 'not-found', error: `no group "${r}" you belong to (vibespace-msg groups lists yours)` };
    if (!r) return nf;
    if (G.isGroupId(r)) { const g = getGroup(r); return g && mine(g) && (archived || !g.archivedAt) ? { ok: true, group: g } : nf; }
    const hits = Object.values(all()).filter((g) => !g.archivedAt && mine(g) && g.name === r);
    if (!hits.length) return nf;
    if (hits.length > 1) return { ok: false, code: 'ambiguous', candidates: hits.map((g) => ({ name: g.name, groupId: g.id })), error: `ambiguous group name "${r}" — ${hits.length} of your groups are called that: ${hits.map((g) => g.id).join(', ')}; name one by its id` };
    return { ok: true, group: hits[0] };
  }

  /** `send <to>`'s ONE resolution (2026-09-23 verifier: a group NAMED like a
   *  session silently took `send <agent>`). An id is never ambiguous — `g-…`
   *  is a group, a live conversation id is that session. A bare NAME that is
   *  both one of `by`'s groups and a session `by` may message is refused
   *  `ambiguous` with BOTH candidates, never guessed.
   *  → {ok, kind:'group', group} | {ok, kind:'agent', cid, name} | a refusal. */
  function resolveTarget(ref, by) {
    const r = String(ref || '').trim();
    const g = resolveGroup(r, by);
    if (G.isGroupId(r)) return g.ok ? { ok: true, kind: 'group', group: g.group } : g;
    if (!g.ok && g.code === 'ambiguous') return g;   // two of MY groups share the name — never fall through to a session lookup
    const m = resolveMember(r, by);
    if (m.ok && m.cid === r) return { ok: true, kind: 'agent', cid: m.cid, name: m.name };
    if (g.ok && (m.ok || m.code === 'ambiguous')) {
      const candidates = [{ name: g.group.name, groupId: g.group.id }, ...(m.ok ? [{ name: m.name || null, conversationId: m.cid }] : m.candidates)];
      return { ok: false, code: 'ambiguous', candidates, error: `ambiguous name "${r}" — it is one of your groups (${g.group.id}) AND a session you can message (${candidates.filter((c) => c.conversationId).map((c) => c.conversationId).join(', ')}); name one by its id` };
    }
    if (g.ok) return { ok: true, kind: 'group', group: g.group };
    return m.ok ? { ok: true, kind: 'agent', cid: m.cid, name: m.name } : m;
  }

  /** A member of THIS group by conversation id or display name. A name two
   *  members share is refused `ambiguous` with the candidates, never the
   *  first match (2026-09-23 verifier: kick / notify acted on whichever came
   *  first). → {ok, member} | a refusal. */
  function memberRef(group, ref) {
    const r = String(ref == null ? '' : ref).trim();
    const byId = group.members.find((m) => m.member === r);
    if (byId) return { ok: true, member: byId.member };
    const hits = group.members.filter((m) => displayName(group, m.member) === r);
    if (!hits.length) return { ok: false, code: 'not-member', error: `"${r}" is not a member of "${group.name}"` };
    if (hits.length > 1) {
      const candidates = hits.map((m) => ({ name: displayName(group, m.member), conversationId: m.member }));
      return { ok: false, code: 'ambiguous', candidates, error: `ambiguous member "${r}" — ${hits.length} members of "${group.name}" are called that: ${candidates.map((c) => c.conversationId).join(', ')}; name one by its conversation id` };
    }
    return { ok: true, member: hits[0].member };
  }

  function view(g) {
    return {
      id: g.id, name: g.name, pair: g.pair ? g.pair.slice() : null, createdBy: g.createdBy, createdAt: g.createdAt,
      archivedAt: g.archivedAt || null, lastAt: g.lastAt || g.createdAt, lastText: g.lastText || '',
      members: g.members.map((m) => ({ member: m.member, name: displayName(g, m.member), notify: m.notify, joinedAt: m.joinedAt, invitedBy: m.invitedBy, live: !!sessionOf(m.member) })),
    };
  }
  /** THE OWNER'S READ MARK (the panel's unread count, g3): the groups file's
   *  top-level `ownerRead {groupId: at}`, beside `groups` and written by the
   *  same door. A marker, not a fact: the count is DERIVED (records after the
   *  mark that the owner did not write), and a mark is moved only by a USER
   *  act — opening/touching the group's window (`markRead`) or the owner's
   *  own verb (`ownerSaw`, inside the verb's door). */
  const ownerReadOf = (gid) => { const m = store.groups.live().ownerRead; return (m && Number(m[gid])) || 0; };
  function ownerSaw(gr, g) {
    if (!gr.ownerRead || typeof gr.ownerRead !== 'object') gr.ownerRead = {};
    if ((Number(g.lastAt) || 0) > (Number(gr.ownerRead[g.id]) || 0)) gr.ownerRead[g.id] = g.lastAt;
  }
  /** UNREAD, DERIVED ONCE AND KEPT (r2, 2026-09-23 verifier: every
   *  broadcast re-read every unread group's whole log — ~100 ms of main loop
   *  per agent post at 200 groups × 500 messages). The count for (group, who)
   *  is memoised against the two facts it depends on — `since` (the owner's
   *  read mark / the member's report marker) and the group's `lastAt` — and
   *  `appendIn`, the ONE door every log record passes, moves a memo whose
   *  lastAt it just advanced (+1 for a record `who` did not write). A moved
   *  marker or an unknown state recomputes from the log, so the memo can only
   *  be stale-free or absent: `list()`/`listFor()` read no log after the
   *  first count. The first count is warmed in the background after boot. */
  const unreadMemo = new Map();   // `${gid}|${who}` → {since, lastAt, n}
  function unreadFor(g, who, since) {
    const key = g.id + '|' + who;
    const lastAt = Number(g.lastAt) || 0;
    if (!(lastAt > since)) { unreadMemo.set(key, { since, lastAt, n: 0 }); return 0; }
    const m = unreadMemo.get(key);
    if (m && m.since === since && m.lastAt === lastAt) return m.n;
    const n = readLog(g.id).filter((r) => r.at > since && !(r.author && r.author.id === who)).length;
    unreadMemo.set(key, { since, lastAt, n });
    return n;
  }
  function bumpUnread(g, prevLastAt, at, author) {
    for (const who of [G.OWNER, ...g.members.map((m) => m.member)]) {
      const e = unreadMemo.get(g.id + '|' + who);
      if (!e || e.lastAt !== prevLastAt) continue;
      e.lastAt = at;
      if (author !== who && at > e.since) e.n++;
    }
  }
  const memberSince = (m) => (Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : m.joinedAt - 1);
  const ownerUnread = (g) => unreadFor(g, G.OWNER, ownerReadOf(g.id));
  /** The OWNER's list (the panel, every broadcast): every group + its unread
   *  count for the owner. Agents read `listFor` (their own counts). */
  const list = () => Object.values(all()).map((g) => ({ ...view(g), unread: ownerUnread(g) })).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  function announce(changed, messages) {
    try {
      const groups = list();
      for (const g of groups) rosterSig.set(g.id, sigOfView(g));
      broadcast({ type: 'channel-groups-updated', changed, groups, ...(messages && messages.length ? { messages } : {}) });
    }
    catch (e) { log.warn && log.warn('[groups] broadcast failed:', e && e.message); }
  }
  /** WHAT A CLIENT'S COPY OF A GROUP SAYS ABOUT ITS MEMBERS (r3): the names
   *  and liveness `view()` derives from the LIVE roster. A session renamed
   *  (sidebar rename, the first-message auto-name) or gone changes them with
   *  no group verb, so every client copy went stale silently — and the
   *  owner's consent echo, counted against the drawn names, was refused on
   *  every click. `rosterSig` holds what the last announce told the clients;
   *  `noteRoster()` — called from the session list's ONE notify point
   *  (server.js broadcastActiveSessions) — announces exactly the groups whose
   *  signature moved (one dirty signal, one computation; nothing moved ⇒
   *  nothing sent). */
  const rosterSig = new Map();   // gid → "cid=name:live|…" as last announced
  const sigOfView = (v) => (v.members || []).map((m) => `${m.member}=${m.name}:${m.live ? 1 : 0}`).join('|');
  function noteRoster() {
    const names = new Map(live().map((s) => [s.cid, s]));
    const changed = [];
    for (const g of Object.values(all())) {
      const sig = g.members.map((m) => {
        const s = names.get(m.member);
        const name = s && s.name ? (G.cleanName(s.name) || m.member.slice(0, 8)) : ((m.name) || m.member.slice(0, 8));
        return `${m.member}=${name}:${s ? 1 : 0}`;
      }).join('|');
      if (rosterSig.get(g.id) !== sig) changed.push(g.id);
    }
    if (changed.length) announce(changed);
    return changed;
  }

  /** Append ONE record to the group's log, inside the groups door (the caller
   *  holds it): unique `at` per group, log FIRST, summary SECOND. */
  function appendIn(g, { author, text, mentions = [], raw }) {
    const prevLastAt = Number(g.lastAt) || 0;
    const at = Math.max(now(), prevLastAt + 1);
    const rec = makeRecord({
      adapterId: A, convId: g.id, vendorId: `${raw.kind === 'message' ? 'gm' : 'gs'}-${at.toString(36)}-${(++seq).toString(36)}`, at,
      author: { id: author, name: displayName(g, author), isSelf: author === G.OWNER, isBot: false },
      text, mentions, raw,
    });
    store.appendRecords(A, g.id, [rec]);
    g.lastAt = at;
    bumpUnread(g, prevLastAt, at, author);
    g.lastText = String(rec.text).replace(/\s+/g, ' ').slice(0, LAST_TEXT_MAX);
    return rec;
  }
  const readLog = (gid) => store.readTail(A, gid, { limit: LOG_READ });

  async function markReported(gid, member, upTo) {
    if (!Number.isFinite(upTo)) return;
    await store.groups.update((gr) => {
      const g = gr.groups[gid];
      const m = g && G.memberOf(g, member);
      if (m && !(Number(m.reportedUpTo) >= upTo)) m.reportedUpTo = upTo;
    });
  }

  const WAKE_LEAD = {
    mention: 'You were @mentioned',
    always: 'Your notify mode in this group is "always"',
    invite: 'You were just added to this group',
  };
  /** ONE wake = the member's pending report delivered NOW, down THE ladder.
   *  The authorizer inside decides; a refusal is journaled and the message
   *  stays for the next report (never stashed — it would arrive twice). */
  async function wake(gid, member, rec, why) {
    const g = getGroup(gid);
    if (!g) return { ok: false, reason: 'group gone' };
    const lead = `${WAKE_LEAD[why] || 'You were woken'} — group messages (vibespace-msg):`;
    const rep = G.reportFor(g, readLog(gid), member, { budget: WAKE_BUDGET, lead });
    if (!rep || rep.fits === false) return { ok: false, reason: rep ? 'the report does not fit a wake' : 'nothing to deliver' };
    let r;
    if (!deliver || typeof deliver.deliverToConversation !== 'function') r = { ok: false, reason: 'no delivery ladder wired' };
    else {
      try {
        r = await deliver.deliverToConversation(member, rep.text, { kind: 'peer', spendReason: 'peer-message', fromName: `${displayName(g, rec.author.id)} · ${g.name}`, cardText: rec.text });
      } catch (e) { r = { ok: false, reason: 'delivery threw: ' + (e && e.message) }; }
    }
    try { store.audit({ kind: 'group-wake', groupId: gid, member, why, ok: !!(r && r.ok), lane: (r && r.lane) || null, reason: r && !r.ok ? r.reason || null : null, refused: (r && r.refused) || null, spendWhy: (r && r.why) || null }); } catch { }
    if (r && r.ok) { await markReported(gid, member, rep.upTo); return { ok: true, lane: r.lane || null }; }
    (log.info || log.log || (() => {})).call(log, `[groups] wake of ${member.slice(0, 8)} in ${gid} (${why}) not delivered: ${(r && r.reason) || 'refused'} — it rides that member's next report`);
    return { ok: false, reason: (r && r.reason) || 'undelivered', refused: (r && r.refused) || null };
  }
  /**
   * THE WAKE PACE for one sender (r2): `mayWake(member) → true | {reason}`
   * with `mayWake.refund(member)`. A grant RESERVES the slot at once (five
   * concurrent posts see each other's reservation), and a wake that did not
   * go out refunds its PAIR stamp (r3: the attempt stays in the sender's
   * per-minute count). The ledger is the store's `wake-pace.json` (the PURE
   * rules: G.paceVerdict / paceGrant / paceRefund / prunePace) — persisted,
   * so a restart forgets no floor. Asked by the agent routes for every agent
   * sender and by the owner's routes when auth is off (the owner cannot be
   * told apart from a local agent there).
   */
  function pacerFor(sender) {
    const tokens = new Map();
    const mayWake = (member) => {
      const at = paceClock();
      const live0 = store.pace.live();
      // r3: a stamp in the FUTURE is not a wake (a backward clock step, a
      // clock-ahead boot's ledger) — the prune drops it; say so once, here
      const fut = G.paceFuture(live0, at);
      if (fut) (log.warn || log.log || (() => {})).call(log, `[groups] wake-pace.json held ${fut} stamp(s) in the future (the clock stepped back, or a clock-ahead boot wrote them) — dropped; they were not wakes`);
      const st = G.prunePace(live0, at);
      const v = G.paceVerdict(st, { sender, member, at });
      if (!v.ok) { store.pace.set(st); return { reason: v.reason, why: v.why }; }
      const gr = G.paceGrant(st, { sender, member, at });
      store.pace.set(gr.state);
      tokens.set(member, gr.token);
      return true;
    };
    mayWake.refund = (member, { attempted = true } = {}) => {
      const tk = tokens.get(member);
      if (!tk) return;
      tokens.delete(member);
      // r3: the PAIR goes back (a refusal never floors that target's next
      // wake), the ATTEMPT stays in the sender's minute — so a sender at the
      // spend ceiling reaches the authorizer at most SENDER_WAKES times a
      // minute, never in an unbounded loop. r4: `attempted:false` = the act
      // THREW before anything reached the authorizer or the adapter (a
      // blocked / full store) — not an attempt, so the minute goes back too
      store.pace.set(G.paceRefund(store.pace.live(), tk, { keepSender: attempted !== false }));
    };
    return mayWake;
  }
  /** `consent(n) → true | refusal` — asked of the number of wakes an act
   *  would cause, INSIDE the door, before anything is written. */
  const consentOf = (consent, n) => {
    if (typeof consent !== 'function') return null;
    const v = consent(n);
    return v === true || (v && v.ok === true) ? null : { ok: false, code: (v && v.code) || 'confirm-wakes', error: (v && v.error) || 'the wakes were not confirmed', wakes: n };
  };

  /** `mayWake(member) → true | {reason}` = the CALLER's pacing (the agent
   *  route's per-(sender, target) floor), asked of EVERY wake a post / an
   *  invite would cause — an @mention and `--wake` are one act, paced alike.
   *  A floored wake is a refusal like the authorizer's: not billed, journaled,
   *  the message rides that member's next report. */
  async function wakeAll(gid, rec, candidates, mayWake = null) {
    const woke = [], refused = [], later = [];
    const g0 = getGroup(gid);
    for (const m of candidates) {
      const g = getGroup(gid) || g0;
      const v = G.wakeVerdict(g, m, rec);
      const name = displayName(g, m);
      if (!v.wake) { if (v.why !== 'mute' && v.why !== 'own-message' && v.why !== 'not-member') later.push({ member: m, name }); continue; }
      const pace = typeof mayWake === 'function' ? mayWake(m) : true;   // reserves the pace slot when it grants
      if (pace !== true) {
        const reason = (pace && pace.reason) || 'rate floor';
        try { store.audit({ kind: 'group-wake', groupId: gid, member: m, why: v.why, ok: false, lane: null, reason, refused: 'rate-floor', spendWhy: null }); } catch { }
        refused.push({ member: m, name, why: v.why, reason, refused: 'rate-floor' });
        continue;
      }
      const r = await wake(gid, m, rec, v.why);
      if (r.ok) woke.push({ member: m, name, why: v.why, lane: r.lane });
      else {
        // not billed ⇒ the pace slot goes back (r2: a refused wake used to
        // floor the next legitimate one with words that said a turn was billed)
        if (typeof mayWake === 'function' && typeof mayWake.refund === 'function') { try { mayWake.refund(m); } catch { } }
        refused.push({ member: m, name, why: v.why, reason: r.reason, refused: r.refused || null });
      }
    }
    return { woke, refused, later };
  }

  // ── the verbs ────────────────────────────────────────────────────────────
  /** Create a group. `by` = a conversation id or the owner; every invitee is
   *  resolved within `by`'s reach (atomic: one miss refuses the whole call);
   *  each invitee gets the invite record (with the context) and is woken as
   *  an invite unless `quiet`. */
  async function createGroup({ by, name, members = [], context = '', quiet = false, mayWake = null, consent = null } = {}) {
    if (!(by === G.OWNER || G.isCid(by))) return { ok: false, code: 'bad-member', error: 'this session has no conversation id yet — send after its first turn' };
    const resolved = [];
    for (const ref of members) {
      const r = resolveMember(ref, by);
      if (!r.ok) return r;
      if (!resolved.some((x) => x.cid === r.cid)) resolved.push(r);
    }
    const names = {};
    for (const r of resolved) names[r.cid] = r.name;
    if (by !== G.OWNER) names[by] = (sessionOf(by) || {}).name || null;
    const ctx = G.cleanText(context);
    let recs = [];
    const res = await store.groups.update((gr) => {
      let id; do { id = G.newGroupId(rand()); } while (gr.groups[id]);
      const made = G.makeGroup({ id, name, createdBy: by, at: now(), members: resolved.map((r) => r.cid), names });
      if (!made.group) return made;
      const g = made.group;
      const refusal = consentOf(consent, quiet ? 0 : resolved.filter((r) => G.wakeVerdict(g, r.cid, { author: { id: by }, raw: { kind: 'invite', member: r.cid, wake: true } }).wake).length);
      if (refusal) return refusal;
      recs.push(appendIn(g, { author: by, text: `${displayName(g, by)} created the group "${g.name}"`, raw: { kind: 'create', by } }));
      for (const r of resolved) recs.push(appendIn(g, { author: by, text: inviteText(g, by, r.cid, ctx), raw: { kind: 'invite', by, member: r.cid, context: ctx, wake: !quiet } }));
      gr.groups[id] = g;
      if (by === G.OWNER) ownerSaw(gr, g);
      return { ok: true, group: g };
    });
    if (!res.ok) return res;
    announce([res.group.id], recs);
    const invites = recs.filter((x) => x.raw.kind === 'invite');
    let woke = [], refused = [];
    for (const rec of invites) { const w = await wakeAll(res.group.id, rec, [rec.raw.member], mayWake); woke = woke.concat(w.woke); refused = refused.concat(w.refused); }
    return { ok: true, group: view(getGroup(res.group.id)), woke, refused, quiet: !!quiet };
  }
  function inviteText(g, by, cid, ctx) {
    return `${displayName(g, by)} added ${displayName(g, cid)}${ctx ? ' — ' + ctx : ''}`;
  }

  /** Invite into an existing group (members only; reach checked; a duplicate
   *  is a no-op WITH a word; N invitees = N wakes unless `quiet`). */
  async function invite({ by, group: ref, members = [], context = '', quiet = false, mayWake = null, consent = null } = {}) {
    const rg = resolveGroup(ref, by);
    if (!rg.ok) return rg;
    const resolved = [];
    for (const m of members) {
      const r = resolveMember(m, by);
      if (!r.ok) return r;
      if (!resolved.some((x) => x.cid === r.cid)) resolved.push(r);
    }
    if (!resolved.length) return { ok: false, code: 'bad-member', error: 'name at least one session to invite' };
    const ctx = G.cleanText(context);
    const recs = [], already = [];
    const res = await store.groups.update((gr) => {
      // every transition FIRST (atomic: one refusal writes nothing), the log after
      let g = gr.groups[rg.group.id];
      const joined = [];
      for (const r of resolved) {
        const t = G.addMember(g, { member: r.cid, by, at: now(), name: r.name });
        if (t.ok === false) return t;
        if (t.noop) { already.push(displayName(g, r.cid)); continue; }
        g = t.group;
        joined.push(r.cid);
      }
      const refusal = consentOf(consent, quiet ? 0 : joined.filter((cid) => G.wakeVerdict(g, cid, { author: { id: by }, raw: { kind: 'invite', member: cid, wake: true } }).wake).length);
      if (refusal) return { ...refusal, group: view(gr.groups[rg.group.id]) };
      for (const cid of joined) recs.push(appendIn(g, { author: by, text: inviteText(g, by, cid, ctx), raw: { kind: 'invite', by, member: cid, context: ctx, wake: !quiet } }));
      gr.groups[g.id] = g;
      if (by === G.OWNER) ownerSaw(gr, g);
      return { ok: true, group: g };
    });
    if (!res.ok) return res;
    if (recs.length) announce([res.group.id], recs);
    let woke = [], refused = [];
    for (const rec of recs) { const w = await wakeAll(res.group.id, rec, [rec.raw.member], mayWake); woke = woke.concat(w.woke); refused = refused.concat(w.refused); }
    return { ok: true, group: view(getGroup(res.group.id)), added: recs.map((r) => displayName(res.group, r.raw.member)), already, woke, refused, quiet: !!quiet };
  }

  /** leave (self) / kick (creator or owner) — a pair that drops to one is archived. */
  async function remove({ by, group: ref, member = null, kick = false } = {}) {
    const rg = resolveGroup(ref, by);
    if (!rg.ok) return rg;
    let target = kick ? null : by;
    if (kick) {
      const hit = memberRef(rg.group, member);
      if (!hit.ok) return hit;
      target = hit.member;
    }
    let rec = null;
    const res = await store.groups.update((gr) => {
      const g0 = gr.groups[rg.group.id];
      const t = G.removeMember(g0, { member: target, by, at: now(), kick });
      if (t.ok === false) return t;
      const who = displayName(g0, target);
      rec = appendIn(t.group, { author: by, text: kick ? `${displayName(g0, by)} removed ${who}` : `${who} left${t.event.archived ? ' — the group is archived' : ''}`, raw: { kind: kick ? 'kick' : 'leave', by, member: target, archived: t.event.archived } });
      gr.groups[g0.id] = t.group;
      return { ok: true, group: t.group, archived: t.event.archived };
    });
    if (!res.ok) return res;
    announce([res.group.id], [rec]);
    return { ok: true, group: view(res.group), archived: res.archived };
  }

  async function renameGroup({ by, group: ref, name } = {}) {
    const rg = resolveGroup(ref, by);
    if (!rg.ok) return rg;
    let rec = null;
    const res = await store.groups.update((gr) => {
      const t = G.rename(gr.groups[rg.group.id], { name, by });
      if (t.ok === false) return t;
      if (t.noop) return { ok: true, group: t.group, noop: t.noop };
      rec = appendIn(t.group, { author: by, text: `${displayName(t.group, by)} renamed the group to "${t.group.name}"`, raw: { kind: 'rename', by, from: t.event.from } });
      gr.groups[t.group.id] = t.group;
      return { ok: true, group: t.group };
    });
    if (!res.ok) return res;
    if (rec) announce([res.group.id], [rec]);
    return { ok: true, group: view(res.group), noop: res.noop || null };
  }

  async function archiveGroup({ by, group: ref } = {}) {
    const rg = resolveGroup(ref, by, { archived: true });
    if (!rg.ok) return rg;
    let rec = null;
    const res = await store.groups.update((gr) => {
      const t = G.archive(gr.groups[rg.group.id], { by, at: now() });
      if (t.ok === false) return t;
      if (t.noop) return { ok: true, group: t.group, noop: t.noop };
      rec = appendIn(t.group, { author: by, text: `${displayName(t.group, by)} archived the group (the log is kept)`, raw: { kind: 'archive', by } });
      gr.groups[t.group.id] = t.group;
      return { ok: true, group: t.group };
    });
    if (!res.ok) return res;
    if (rec) announce([res.group.id], [rec]);
    return { ok: true, group: view(res.group), noop: res.noop || null };
  }

  async function setNotify({ by, group: ref, member = null, notify } = {}) {
    const rg = resolveGroup(ref, by);
    if (!rg.ok) return rg;
    let target = by;
    if (member !== null && member !== undefined) {
      const hit = memberRef(rg.group, member);
      if (!hit.ok && hit.code === 'ambiguous') return hit;
      target = hit.ok ? hit.member : member;   // an unknown member is the model's not-member refusal
    }
    const res = await store.groups.update((gr) => {
      const t = G.setNotify(gr.groups[rg.group.id], { member: target, notify, by });
      if (t.ok === false) return t;
      gr.groups[t.group.id] = t.group;
      return { ok: true, group: t.group, noop: t.noop || null };
    });
    if (!res.ok) return res;
    if (!res.noop) announce([res.group.id]);
    return { ok: true, group: view(res.group), member: target, notify, noop: res.noop };
  }

  /** Post a message. `from` = a member or the owner. Mentions are resolved
   *  against the members' names; `wake:true` (`--wake`) @mentions every OTHER
   *  member — an explicit act, each one a billed turn through the ladder. */
  async function post({ group: ref, from, text, wake: wakeEveryone = false, mayWake = null, consent = null } = {}) {
    const body = String(text == null ? '' : text);
    if (!body.trim()) return { ok: false, code: 'bad-request', error: 'an empty message' };
    if (Buffer.byteLength(body, 'utf-8') > TEXT_MAX) return { ok: false, code: 'bad-request', error: 'message too large (16KB cap) — write a file and send its path instead' };
    const rg = resolveGroup(ref, from);
    if (!rg.ok) return rg;
    let rec = null;
    const res = await store.groups.update((gr) => {
      const g = gr.groups[rg.group.id];
      if (!g || g.archivedAt) return { ok: false, code: 'archived', error: `group "${rg.group.name}" is archived` };
      if (!(from === G.OWNER || G.memberOf(g, from))) return { ok: false, code: 'not-member', error: 'only a member can post' };
      const named = g.members.map((m) => ({ member: m.member, name: displayName(g, m.member) }));
      let mentions = G.mentionsIn(body, named);
      if (wakeEveryone) for (const m of named) if (m.member !== from && !mentions.some((x) => x.id === m.member)) mentions.push({ id: m.member, name: m.name });
      mentions = mentions.filter((x) => x.id !== from);
      const refusal = consentOf(consent, G.wakesPlanned(g, { author: { id: from }, mentions, raw: { kind: 'message' } }, g.members.map((m) => m.member).filter((m) => m !== from)));
      // r3: the refusal CARRIES the view the count was made against (live
      // names), so the panel repaints before its next click instead of
      // counting against the names it drew (a renamed member = 409 for ever)
      if (refusal) return { ...refusal, group: view(g) };
      const cur = G.memberOf(g, from);
      if (cur) cur.name = displayName(g, from);   // refresh the snapshot the report prints when the session is gone
      rec = appendIn(g, { author: from, text: body, mentions, raw: { kind: 'message' } });
      if (from === G.OWNER) ownerSaw(gr, g);
      return { ok: true, group: g };
    });
    if (!res.ok) return res;
    announce([res.group.id], [rec]);
    const others = res.group.members.map((m) => m.member).filter((m) => m !== from);
    const w = await wakeAll(res.group.id, rec, others, mayWake);
    return { ok: true, group: view(getGroup(res.group.id)), message: rec, woke: w.woke, refused: w.refused, later: w.later };
  }

  /** `send <agent>`: the two-member group of these two, found or created (the
   *  same pair is always the same group — idempotent), then an ordinary post.
   *  D2's default applies to pairs too: next-turn unless the receiver chose
   *  otherwise or the sender passes `wake` (= an @, a billed turn).
   *  `create:false` (a Background Work job posting as its owner conversation)
   *  posts only into a pair that ALREADY exists — a job never makes a group. */
  async function sendToAgent({ from, to, text, wake: w = false, create = true, mayWake = null, consent = null } = {}) {
    const r = resolveMember(to, from);
    if (!r.ok) return r;
    const shown = r.name || to;
    if (!create && !findPair(from, r.cid)) return { ok: false, code: 'job-token', error: `no direct group with "${shown}" exists yet, and a job token never creates one — start it from the conversation that owns this job (vibespace-msg send "${shown}" "…"), then the job can post into it` };
    const pair = await findOrCreatePair(from, r.cid, r.name);
    if (!pair.ok) return pair;
    const p = await post({ group: pair.group.id, from, text, wake: w, mayWake, consent });
    return p.ok ? { ...p, pairCreated: pair.created } : p;
  }
  /** The live (unarchived) two-member group of a and b, or null. */
  function findPair(a, b) {
    if (!G.isCid(a) || !G.isCid(b) || a === b) return null;
    const key = G.pairKey(a, b);
    return Object.values(all()).find((g) => !g.archivedAt && g.pair && G.pairKey(g.pair[0], g.pair[1]) === key) || null;
  }
  async function findOrCreatePair(a, b, bName = null) {
    if (!G.isCid(a) || !G.isCid(b) || a === b) return { ok: false, code: 'bad-member', error: 'a direct group needs two different conversations' };
    const key = G.pairKey(a, b);
    const found = findPair(a, b);
    if (found) return { ok: true, group: found, created: false };
    let rec = null;
    const res = await store.groups.update((gr) => {
      const again = Object.values(gr.groups).find((g) => !g.archivedAt && g.pair && G.pairKey(g.pair[0], g.pair[1]) === key);
      if (again) return { ok: true, group: again, created: false };
      let id; do { id = G.newGroupId(rand()); } while (gr.groups[id]);
      const names = { [a]: (sessionOf(a) || {}).name || null, [b]: bName || (sessionOf(b) || {}).name || null };
      const made = G.makeGroup({ id, name: '', createdBy: a, at: now(), members: [b], names, pair: true });
      if (!made.group) return made;
      rec = appendIn(made.group, { author: a, text: `${displayName(made.group, a)} started a direct conversation with ${displayName(made.group, b)}`, raw: { kind: 'create', by: a } });
      gr.groups[id] = made.group;
      return { ok: true, group: made.group, created: true };
    });
    if (res.ok && res.created) announce([res.group.id], [rec]);
    return res;
  }

  /** On-purpose history read (`read <group> [--before <ts>]`) — the report
   *  never carries pre-join history; this does, because the member asked. */
  function read({ by, group: ref, before = null, limit = 50 } = {}) {
    const rg = resolveGroup(ref, by, { archived: true });
    if (!rg.ok) return rg;
    const n = Math.max(1, Math.min(READ_MAX, Number(limit) || 50));
    const opts = { limit: n };
    if (Number.isFinite(Number(before)) && before !== null && before !== '') { opts.before = Number(before); }
    return { ok: true, group: view(rg.group), records: store.readTail(A, rg.group.id, opts) };
  }

  /** The OWNER opened / touched a group's window (g3): its read mark moves to
   *  the newest record. Broadcasts ONLY when the mark moved (an unchanged value
   *  is not a dirty signal — the channels markRead lesson, r2). */
  async function markRead({ group: ref } = {}) {
    const rg = resolveGroup(ref, G.OWNER, { archived: true });
    if (!rg.ok) return rg;
    let moved = false;
    await store.groups.update((gr) => {
      const g = gr.groups[rg.group.id];
      if (!g) return;
      const before = (gr.ownerRead && Number(gr.ownerRead[g.id])) || 0;
      ownerSaw(gr, g);
      moved = Number(gr.ownerRead[g.id]) !== before;
    });
    if (moved) announce([rg.group.id]);
    return { ok: true, moved };
  }

  /** The LIVE agent sessions the owner may pick for a group (g3's New group /
   *  Invite dialogs): conversation id, name and the Task Groups the session
   *  belongs to — the SAME roster reach is judged over (the owner reaches
   *  every live session). Structure only; the client words it. */
  function liveRoster() {
    return live().map((s) => ({ cid: s.cid, name: s.name ? G.cleanName(s.name) || null : null, groups: Array.isArray(s.groups) ? s.groups.slice() : [] }));
  }

  /** The groups a conversation belongs to, each with its unread count. */
  function listFor(cid) {
    const out = [];
    for (const g of Object.values(all())) {
      const m = G.memberOf(g, cid);
      if (!m) continue;
      const unread = unreadFor(g, cid, memberSince(m));
      out.push({ ...view(g), unread, notify: m.notify });
    }
    return out.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  }

  /**
   * The next-turn REPORTS for one conversation, under ONE byte budget (the
   * caller hands what is left of the 9600 B inline cap). Newest group first;
   * a group that does not fit waits for the next turn (its marker unmoved) and
   * is NAMED on a trailing line. Muted memberships yield nothing.
   * THE WHOLE SECTION is under `budget` — head, every report, and the trailer
   * (at most WAITING_NAMED groups named, the rest counted): a report that
   * would push the section over is taken back out (its marker unmoved) until
   * it fits (2026-09-23 verifier: 60 long-named groups made a 4096 B section
   * 18 579 B, capInline trimmed it after the markers had moved).
   * @returns {{text, marks:[{groupId, upTo}]}} — commit the marks with
   *   `commitReports` once the text is actually handed out.
   */
  function reportsForTurn(cid, { budget = TURN_BUDGET } = {}) {
    const cands = [];
    for (const g of Object.values(all())) {
      const m = G.memberOf(g, cid);
      if (!m || m.notify === 'mute') continue;
      const since = Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : m.joinedAt - 1;
      if (!((g.lastAt || 0) > since)) continue;
      cands.push(g);
    }
    if (!cands.length) return { text: '', marks: [] };
    cands.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    const cap = Math.min(TURN_BUDGET, Number(budget) || 0);
    const head = '### Group messages since your last turn (vibespace-msg — nobody was woken for these; reply only if it helps)';
    // the trailer's reserve is MEASURED (r2): the widest line it can be —
    // the three longest clipped names, every candidate counted — never a guess
    const widest = cands.slice().sort((a, b) => Buffer.byteLength(clipName(inertFrames(b.name)), 'utf-8') - Buffer.byteLength(clipName(inertFrames(a.name)), 'utf-8'));
    const trailerReserve = cands.length > 1 ? Buffer.byteLength(waitingLine(widest), 'utf-8') + 2 : 0;   // a lone group can never need the trailer
    let room = cap - Buffer.byteLength(head, 'utf-8') - trailerReserve;
    const entries = [], quiet = [], waiting = [];
    for (const g of cands) {
      if (room < MIN_REPORT_ROOM) { waiting.push(g); continue; }
      const rep = G.reportFor(g, readLog(g.id), cid, { budget: Math.min(G.REPORT_BUDGET, room) });
      if (!rep) { quiet.push({ groupId: g.id, upTo: g.lastAt }); continue; }   // only its own messages since — nothing to say, move the marker
      if (rep.fits === false) { waiting.push(g); continue; }
      entries.push({ g, text: rep.text, mark: { groupId: g.id, upTo: rep.upTo } });
      room -= Buffer.byteLength(rep.text, 'utf-8') + 2;
    }
    const compose = () => {
      if (!entries.length && !waiting.length) return '';
      const parts = [head, ...entries.map((e) => e.text)];
      if (waiting.length) parts.push(waitingLine(waiting));
      return parts.join('\n\n');
    };
    let text = compose();
    while (entries.length && Buffer.byteLength(text, 'utf-8') > cap) {
      waiting.unshift(entries.pop().g);   // taken back: its marker stays, it is named as waiting
      text = compose();
    }
    // no report fits (r2, 2026-09-23 verifier: the fullest prompts got SILENCE
    // — the design names a group that does not fit): the head + the trailer
    // alone, fewer names if even that is too wide; no marker moves
    if (!entries.length && waiting.length) {
      text = '';
      for (let n = WAITING_NAMED; n >= 0 && !text; n--) {
        const t = [head, waitingLine(waiting, n)].join('\n\n');
        if (Buffer.byteLength(t, 'utf-8') <= cap) text = t;
      }
    }
    return { text, marks: [...entries.map((e) => e.mark), ...quiet] };
  }
  /** The trailer: at most WAITING_NAMED groups named (each name clipped), the
   *  rest counted — bounded whatever the names are. */
  function waitingLine(waiting, nameAtMost = WAITING_NAMED) {
    const named = waiting.slice(0, nameAtMost).map((g) => `"${clipName(inertFrames(g.name))}" ${g.id}`);
    const more = waiting.length - named.length;
    return `(${waiting.length} more group(s) with new messages — ${named.length ? named.join(', ') : 'none named here'}${more > 0 ? ` +${more} more` : ''} — arrive on your next turn, or vibespace-msg read <group>)`;
  }
  async function commitReports(cid, marks) {
    for (const mk of marks || []) await markReported(mk.groupId, cid, mk.upTo);
  }

  // warm the unread memo off the boot path, a few groups per turn of the loop
  (function warm() {
    let ids = null, i = 0;
    const step = () => {
      try {
        if (!ids) ids = Object.keys(all());
        for (const end = Math.min(ids.length, i + 4); i < end; i++) {
          const g = getGroup(ids[i]);
          if (!g) continue;
          ownerUnread(g);
          for (const m of g.members) unreadFor(g, m.member, memberSince(m));
        }
      } catch { return; }
      if (i < ids.length) { const h = setImmediate(step); if (h && h.unref) h.unref(); }
    };
    const h = setImmediate(step); if (h && h.unref) h.unref();
  })();

  return {
    list, listFor, markRead, liveRoster, pacerFor, noteRoster, get: (id) => { const g = getGroup(id); return g ? view(g) : null; }, resolveGroup, resolveMember, resolveTarget, reach,
    create: createGroup, invite, leave: (o) => remove({ ...o, kick: false }), kick: (o) => remove({ ...o, kick: true }),
    rename: renameGroup, archive: archiveGroup, setNotify, post, sendToAgent, findPair, findOrCreatePair, read,
    reportsForTurn, commitReports,
    WAKE_BUDGET, TURN_BUDGET, MIN_REPORT_ROOM,
  };
}

module.exports = { create, WAKE_BUDGET, TURN_BUDGET, MIN_REPORT_ROOM, TEXT_MAX };
