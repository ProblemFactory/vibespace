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
 *                conversation (agent-routes calls it on a turn of ANY origin —
 *                lane stash-any-turn, 2026-10-05; a turn nobody typed passes
 *                `aside` and its head carries ASIDE_LINE, the echo guard as
 *                words) and `commitReports` stamps `reportedUpTo` per (group,
 *                member) — at render, the accepted-lost stance every other
 *                injection marker takes. A successful wake stamps it too, so a
 *                woken member is never handed the same message again — and
 *                WHILE a wake is on its way (`wakesInFlight`) that group sits
 *                out the member's reports: the woken turn asks prompt-context
 *                before the post resolves, and its frame already carries them.
 *   BROADCAST    every change pushes `channel-groups-updated` {changed, groups,
 *                messages?} — the recomputed list, never a dirty bit.
 *   CARDS        (lane group-report-card, the owner 2026-09-28: "怎么在那个对话里
 *                看不到你发了消息？") a report handed to a member's turn is SEEN in
 *                that member's chat: every mark `reportsForTurn` returns carries
 *                the CARDS of the messages its report showed (src/group-card.js —
 *                sender, the words the member was shown, the group, "… and N
 *                more" on the oldest), and `commitReports` emits them through
 *                THE ladder's card door (`deliver.emitPeerCard`, kind 'group')
 *                before it stamps a marker. A wake's post carries `group` to the
 *                ladder, whose own card says the same. The door keys a card by
 *                (group, record instant): a message carded once is never carded
 *                again in that conversation.
 *   PENDING      `reportsForTurn(cid, {preview:true})` commits nothing and adds
 *                `pending` = every group message waiting for that member's next
 *                turn (the stash strip above the composer lists them — src/server/
 *                stash-handover.js), memoised against the facts it reads; every
 *                change that can move it calls `onPending()` (the strip's
 *                re-publish).
 *   FATE         (lane pair-group-fate, B-7d1e) a conversation that ENDED — the
 *                sidebar archive, or gone (no transcript) — is the store's `ended`
 *                ledger {cid: {why, at}} (groups.json, the same door); the view's
 *                member rows carry it, so `deliveryOf` reads undeliverable.
 *                `onConversationEnded` CLOSES a pair (a `closed` record the sender's
 *                next report carries ONCE), a multi-member group only gets an
 *                `ended` line; `sweepEnded` re-judges every member at boot / on
 *                every archive through the wiring's `liveness` reader. An await
 *                (B-eba8, `send --await`) is `g.awaits[vendorId]`, its wake the SAME
 *                `wake()` (spendReason peer-message — no new producer).
 */
const crypto = require('crypto');
const G = require('../channel-groups.js');
const GC = require('../group-card.js');
const { makeRecord, inertFrames } = require('../channel-record.js');
const { toAgentText: agentText } = require('../peer-text.js');   // verify r1 F3: a group's name on its way out (view)
const DM = require('../dispatch-model.js');   // lane worker-dispatch verify r1 ②: the dispatch ledger's windows (PURE)
const msgAcl = require('../msg-acl.js');
// "Clear content…" (2026-09-28): the replacement record, the fold every reader applies, the clear itself
const RC = require('../record-clear.js');

const WAKE_BUDGET = 4096;       // one wake's report (it rides its own turn, not the 10 KiB injection)
// THE ECHO GUARD AS WORDS (lane stash-any-turn): the next-turn reports ride a turn nobody typed too — once, under the
// head, the agent is told they are an aside to this turn's task (agent-facing: English only)
const ASIDE_LINE = "(these arrived while you were handling something else — answer each group in its own group; do not fold them into this turn's task)";
const TURN_BUDGET = 4096;       // every group report on ONE user turn together
const MIN_REPORT_ROOM = 320;    // below this a report waits for the next turn rather than arrive as a stub
const TEXT_MAX = 16 * 1024;
const LOG_READ = 2000;
const READ_MAX = 200;
const LAST_TEXT_MAX = 160;
const WAITING_NAMED = 3;        // the trailer names at most this many waiting groups, then counts
const PENDING_TEXT_MAX = 400;   // a waiting message's words as the strip previews them (its first line is what shows)
const WAITING_NAME_BYTES = 40;
// a log read asks for this many records more than it shows when the group holds cleared
// records (their replacement records are dropped by the fold) — bounded, so a group
// with thousands of clears never turns one page into a whole-log read
const REPLACEMENT_READ_MAX = 5000;
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
  // the .197 integration: the copies of a cleared group message OUTSIDE the engine — the group cards' rings
  // (lane group-report-card) — `(groupId, keys)` with THE KEY `<group>:<record instant>` per cleared record
  onCleared = () => {},
  // Task Group externalVisibility (msg-acl's group setting)
  groupSetting = () => 'none',
  rand = () => crypto.randomBytes(4).toString('hex'),
  // the WAKE PACE's clock (real time by default — the pace is about billed
  // turns in the world, never the injected record clock `now`)
  paceClock = () => Date.now(),
  // lane group-report-card: something that moves a member's waiting group
  // messages happened (a post, a membership / notify change, a marker) — the
  // stash strip's re-publish (server.js → stash-handover `changed()`, debounced)
  onPending = () => {},
  // lane pair-group-fate: `(cid) → {state: running|stopped|archived|gone}` — the wiring's ONE liveness reader (the live
  // roster, the sidebar's archived list, the transcript on disk); asked by `sweepEnded` only, never per view
  liveness = () => null,
} = {}) {
  if (!store || !store.groups) throw new Error('groups-engine: a channel store with the groups family is required');
  const A = G.GROUP_ADAPTER_ID;
  let seq = 0;

  const live = () => { try { return (roster() || []).filter((s) => s && s.cid); } catch (e) { log.warn && log.warn('[groups] roster threw:', e && e.message); return []; } };
  const sessionOf = (cid) => live().find((s) => s.cid === cid) || null;
  const all = () => store.groups.live().groups;
  const getGroup = (id) => (G.isGroupId(id) ? all()[id] || null : null);
  const endedOf = (cid) => { const e = (store.groups.live().ended || {})[cid]; return e && G.ENDED_WHYS.includes(e.why) ? { why: e.why, at: Number(e.at) || null } : null; };
  // the liveness the PURE rules read in the engine (the await table): live roster ⇒ running, the ledger ⇒ ended, else stopped
  const livenessNow = (cid) => { if (sessionOf(cid)) return { state: 'running' }; const e = endedOf(cid); return e ? { state: e.why, at: e.at } : { state: 'stopped' }; };
  const wakesInFlight = new Map();   // `${gid}|${member}` → wakes on their way (that group sits out the member's reports)

  /** msg-acl's level of `to` as seen from `by` (the owner reaches everyone live). */
  function reach(by, to) {
    const target = sessionOf(to);
    if (!target) return 'none';
    if (by === G.OWNER) return 'messageable';
    const sender = sessionOf(by);
    return msgAcl.levelFor({ cid: target.cid, groups: target.groups || [], reachability: target.reachability || null }, sender ? sender.groups || [] : [], groupSetting);
  }
  /** verify r1 ④ (lane worker-dispatch): `by` and `to` BOTH belong to one Task Group — a compaction of another
   *  conversation is a Task-Group act (the owner put them in one group as co-workers), never an opened-reach one
   *  (`reachability`/`externalVisibility` let an agent MESSAGE a conversation, not wipe its context). */
  function sharesGroup(by, to) {
    if (!by || !to || by === to) return false;
    const a = sessionOf(by), b = sessionOf(to);
    if (!a || !b) return false;
    const bg = new Set((b.groups || []).filter(Boolean));
    return (a.groups || []).some((g) => g && bg.has(g));
  }
  /** THE DISPATCH LEDGER (verify r1 ②, lane worker-dispatch): what each brief (its key = sha256 of sender | worker |
   *  text, minted by src/server/worker-dispatch.js) already did — `compactAt` the instant `/compact` was typed for it,
   *  `deliveredAt` the instant it was posted into the worker's group. Persisted (the store's dispatch-ledger.json), so
   *  a retry after a restart REPLAYS (the PURE rule: DM.replayVerdict) instead of compacting and waking again. Pruned
   *  to the model's longest window on every write. */
  const dispatchLedger = {
    get(key) { const fam = store.dispatch; const e = fam && fam.live().entries ? fam.live().entries[key] : null; return e ? { ...e } : null; },
    set(key, patch) {
      const fam = store.dispatch;
      if (!fam || !key) return;
      const at = paceClock();
      const keep = Math.max(DM.REPLAY_DELIVERED_MS, DM.REPLAY_COMPACT_MS);
      const entries = {};
      for (const [k, e] of Object.entries(fam.live().entries || {})) { const t = Math.max(Number(e && e.deliveredAt) || 0, Number(e && e.compactAt) || 0); if (t && at - t < keep) entries[k] = e; }
      entries[key] = { ...(entries[key] || {}), ...patch };
      fam.set({ v: 1, entries });
    },
  };
  const displayName = (group, cid) => {
    if (cid === G.OWNER) return 'User';   // agent-facing; the panel renders the owner's own rows as "You" (author.isSelf)
    const s = sessionOf(cid);
    if (s && s.name) return G.cleanName(s.name) || cid.slice(0, 8);
    const m = group ? G.memberOf(group, cid) : null;
    // verify r2 (lane peer-census): the STORED name (the session gone) is re-judged on its way out too — a member row
    // written before cleanName took the line rule (r1 F3) held `Bob <system-reminder x` and reached every view / echo
    // raw; cleanName is idempotent, so a row written after it is unchanged
    return (m && m.name ? G.cleanName(m.name) : '') || cid.slice(0, 8);
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
    if (m.ok && endedOf(m.cid)) { const no = endedRefusal(m.cid, by); if (no) return no; }   // lane pair-group-fate: an archived conversation, still live, is not a target either
    if (m.ok && m.cid === r) return { ok: true, kind: 'agent', cid: m.cid, name: m.name };
    if (g.ok && (m.ok || m.code === 'ambiguous')) {
      const candidates = [{ name: g.group.name, groupId: g.group.id }, ...(m.ok ? [{ name: m.name || null, conversationId: m.cid }] : m.candidates)];
      return { ok: false, code: 'ambiguous', candidates, error: `ambiguous name "${r}" — it is one of your groups (${g.group.id}) AND a session you can message (${candidates.filter((c) => c.conversationId).map((c) => c.conversationId).join(', ')}); name one by its id` };
    }
    if (g.ok) return { ok: true, kind: 'group', group: g.group };
    return m.ok ? { ok: true, kind: 'agent', cid: m.cid, name: m.name } : (endedRefusal(r, by) || m);
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
      // verify r1 F3 (lane peer-census): the name leaves the store through the belt — a group named before the line
      // rule (or by any writer that skipped cleanName) is judged on its way out, like every member name (displayName)
      id: g.id, name: agentText(g.name, { kind: 'line', max: G.NAME_MAX * 4 }), pair: g.pair ? g.pair.slice() : null, createdBy: g.createdBy, createdAt: g.createdAt,
      archivedAt: g.archivedAt || null, lastAt: g.lastAt || g.createdAt, lastText: g.lastText || '', lastCleared: !!g.lastCleared, // lastCleared: the last line IS the cleared sentence (a client words it)
      // lane group-pending (2026-10-01): the member's report MARKER rides the view — the window's line under every
      // message ("waiting for beta's next turn" / "read by beta") and the CLI's trailing clause are judged off it
      // (PURE G.deliveryOf); it was a private fact before, so a message handed over looked exactly like one waiting
      members: g.members.map((m) => ({ member: m.member, name: displayName(g, m.member), notify: m.notify, joinedAt: m.joinedAt, invitedBy: m.invitedBy, live: !!sessionOf(m.member), ended: endedOf(m.member), reportedUpTo: Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : null, reportedAt: Number.isFinite(m.reportedAt) ? m.reportedAt : null })),
      // lane pair-group-fate: a pair closed because its other member ended; B-eba8: the awaits' states (read's clause, the window's line)
      closed: g.closed ? { member: g.closed.member, why: g.closed.why, at: g.closed.at } : null,
      awaits: g.awaits && typeof g.awaits === 'object' ? JSON.parse(JSON.stringify(g.awaits)) : {},
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
  // B-a354: a `mention` member counts only what reaches it (G.reachesReport) — its mode is part of the memo's facts
  const modeOf = (g, who) => { const m = who === G.OWNER ? null : G.memberOf(g, who); return m ? m.notify : null; };
  function unreadFor(g, who, since) {
    const key = g.id + '|' + who;
    const lastAt = Number(g.lastAt) || 0;
    const mode = modeOf(g, who);
    if (!(lastAt > since)) { unreadMemo.set(key, { since, lastAt, mode, n: 0 }); return 0; }
    const m = unreadMemo.get(key);
    if (m && m.since === since && m.lastAt === lastAt && m.mode === mode) return m.n;
    const n = readLog(g.id).filter((r) => r.at > since && !(r.author && r.author.id === who) && (mode !== 'mention' || G.reachesReport(g, who, r))).length;
    unreadMemo.set(key, { since, lastAt, mode, n });
    return n;
  }
  function bumpUnread(g, prevLastAt, at, author, rec = null) {
    for (const who of [G.OWNER, ...g.members.map((m) => m.member)]) {
      const e = unreadMemo.get(g.id + '|' + who);
      if (!e || e.lastAt !== prevLastAt) continue;
      e.lastAt = at;
      if (author !== who && at > e.since && (e.mode !== 'mention' || (rec && G.reachesReport(g, who, rec)))) e.n++;
    }
  }
  const memberSince = (m) => (Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : m.joinedAt - 1);
  const ownerUnread = (g) => unreadFor(g, G.OWNER, ownerReadOf(g.id));
  /** The OWNER's list (the panel, every broadcast): every group + its unread
   *  count for the owner. Agents read `listFor` (their own counts). */
  const list = () => Object.values(all()).map((g) => ({ ...view(g), unread: ownerUnread(g) })).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  const pendingChanged = () => { try { onPending(); } catch (e) { log.warn && log.warn('[groups] pending hook failed:', e && e.message); } };
  // the .197 integration (redact × group-report-card): ONE options shape carries both lanes' third parameters — the
  // cleared-record facts ("Clear content…") and the pending-strip flag (the roster call passes { pending: false })
  function announce(changed, messages, cleared = null, { pending = true } = {}) {
    try {
      const groups = list();
      for (const g of groups) rosterSig.set(g.id, sigOfView(g));
      // `cleared` (2026-09-28): the records a clear replaced, AS CLEARED — a window patches its row in place
      broadcast({ type: 'channel-groups-updated', changed, groups, ...(messages && messages.length ? { messages } : {}), ...(cleared && cleared.length ? { cleared } : {}) });
    }
    catch (e) { log.warn && log.warn('[groups] broadcast failed:', e && e.message); }
    if (pending) pendingChanged();   // a post / a membership or notify change moves what waits for a member (never a roster rename — noteRoster)
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
    if (changed.length) announce(changed, null, null, { pending: false });   // names / liveness only: nothing waiting moved (and this runs FROM the session list's broadcast — never a re-publish loop)
    return changed;
  }

  /** Append ONE record to the group's log, inside the groups door (the caller
   *  holds it): unique `at` per group, log FIRST, summary SECOND. */
  function appendIn(g, { author, text, mentions = [], raw: raw0 }) {
    const prevLastAt = Number(g.lastAt) || 0;
    const at = Math.max(now(), prevLastAt + 1);
    const raw = typeof raw0 === 'function' ? raw0(at) : raw0;   // B-eba8: an await's `until` is reckoned from the record's own instant
    const rec = makeRecord({
      adapterId: A, convId: g.id, vendorId: `${raw.kind === 'message' ? 'gm' : 'gs'}-${at.toString(36)}-${(++seq).toString(36)}`, at,
      author: { id: author, name: displayName(g, author), isSelf: author === G.OWNER, isBot: false },
      text, mentions, raw,
    });
    store.appendRecords(A, g.id, [rec]);
    g.lastAt = at;
    bumpUnread(g, prevLastAt, at, author, rec);
    g.lastText = String(rec.text).replace(/\s+/g, ' ').slice(0, LAST_TEXT_MAX);
    delete g.lastCleared;
    return rec;
  }
  /** THE LOG AS EVERY READER SEES IT (2026-09-28): a clear APPENDS a replacement
   *  record (`raw.kind:'cleared'`, the log is append-only) and names the record
   *  in the group's `cleared` index; `RC.foldClears` drops the replacements and
   *  clears every record either names. A page asks for as many extra records as
   *  the group holds replacements (bounded), so a page of fifty stays fifty. */
  const clearedCountOf = (g) => (g && g.cleared && typeof g.cleared === 'object' ? Math.min(REPLACEMENT_READ_MAX, Object.keys(g.cleared).length) : 0);
  function readFolded(gid, opts) {
    const g = getGroup(gid);
    const n = Math.max(1, Number(opts.limit) || 50);
    return RC.foldClears(store.readTail(A, gid, { ...opts, limit: n + clearedCountOf(g) }), g && g.cleared).slice(-n);
  }
  const readLog = (gid) => readFolded(gid, { limit: LOG_READ });

  async function markReported(gid, member, upTo) {
    if (!Number.isFinite(upTo)) return;
    let moved = false;
    await store.groups.update((gr) => {
      const g = gr.groups[gid];
      const m = g && G.memberOf(g, member);
      // the hand-over CLOCK (the coordinator's follow-up): the marker is a record instant, so the instant the report / wake
      // actually went out is its own field — persisted with the row through the same door; a legacy row has none
      if (m && !(Number(m.reportedUpTo) >= upTo)) { m.reportedUpTo = upTo; m.reportedAt = now(); moved = true; }
    });
    // lane group-pending: a marker that MOVED is announced through the one broadcast (the view carries it) — the
    // sender's window flips "waiting for beta's next turn" to "read by beta" without a reload; an unmoved marker
    // is not a dirty signal (nothing sent). announce() re-publishes the pending strip like the bare call did.
    if (moved) announce([gid]);
    else pendingChanged();   // what waits for that member may still have moved (a marker already past it)
  }

  const WAKE_LEAD = {
    mention: 'You were @mentioned',
    always: 'Your notify mode in this group is "always"',
    invite: 'You were just added to this group',
  };
  /** WHAT A WAKE'S CARD SAYS (lane peer-card-sender, B-9fd6): the message that woke it — and when the report carried
   *  SEVERAL messages, every one the agent was shown, each sender named in the head (≤ 3 + "and N more", PURE
   *  GC.reportCardOf). The delivery's own lines, never its framed text read back. One message ⇒ exactly as before. */
  function wakeCardOf(rep, rec) {
    const msgs = (Array.isArray(rep.lines) ? rep.lines : []).filter((x) => x && x.rec && ((x.rec.raw && x.rec.raw.kind) || 'message') === 'message')
      .map((x) => { const a = x.rec.author || {}; return { from: a.name || a.id || null, self: a.id === G.OWNER, text: String(x.body == null ? '' : x.body) }; });
    if (msgs.length < 2) return { text: rec.text, authors: {} };
    const rc = GC.reportCardOf(msgs);
    return { text: rc.text, authors: { authors: rc.authors, authorsMore: rc.authorsMore } };
  }
  /** ONE wake = the member's pending report delivered NOW, down THE ladder.
   *  The authorizer inside decides; a refusal is journaled and the message
   *  stays for the next report (never stashed — it would arrive twice). */
  async function wake(gid, member, rec, why, awaitAt = null) {
    const g = getGroup(gid);
    if (!g) return { ok: false, reason: 'group gone' };
    const flight = gid + '|' + member;
    wakesInFlight.set(flight, (wakesInFlight.get(flight) || 0) + 1);
    try { return await wakeOnce(g, gid, member, rec, why, awaitAt); } finally {
      const n = (wakesInFlight.get(flight) || 1) - 1;
      if (n > 0) wakesInFlight.set(flight, n); else wakesInFlight.delete(flight);
    }
  }
  async function wakeOnce(g, gid, member, rec, why, awaitAt = null) {
    const lead = `${why === 'await' || why === 'both' ? G.awaitLead(awaitAt, why) : WAKE_LEAD[why] || 'You were woken'} — group messages (vibespace-msg):`;
    const rep = G.reportFor(g, readLog(gid), member, { budget: WAKE_BUDGET, lead });
    if (!rep || rep.fits === false) return { ok: false, reason: rep ? 'the report does not fit a wake' : 'nothing to deliver' };
    let r;
    if (!deliver || typeof deliver.deliverToConversation !== 'function') r = { ok: false, reason: 'no delivery ladder wired' };
    else {
      try {
        // `group` (lane group-report-card): the ladder's own card after a successful post is the GROUP card — the
        // sender → the group, the message that woke it — keyed like a report's (a later re-report renders no second)
        const self = !!(rec.author && rec.author.id === G.OWNER);
        const wc = wakeCardOf(rep, rec);
        r = await deliver.deliverToConversation(member, rep.text, { kind: 'peer', spendReason: 'peer-message', fromName: `${displayName(g, rec.author.id)} · ${g.name}`, cardText: wc.text, group: { id: g.id, name: g.name, at: rec.at, from: self ? null : displayName(g, rec.author.id), self, via: 'wake', ...wc.authors } });
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
      if (!v.wake) { if (v.why !== 'mute' && v.why !== 'own-message' && v.why !== 'not-member' && G.reachesReport(g, m, rec)) later.push({ member: m, name }); continue; }   // verify r1 D3: never promise a `mention` member a next turn it is not handed (B-a354)
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
      for (const r of resolved) recs.push(appendIn(g, { author: by, text: inviteText(g, by, r.cid, ctx), raw: { kind: 'invite', by, member: r.cid, name: displayName(g, r.cid), context: ctx, wake: !quiet } }));
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
      for (const cid of joined) recs.push(appendIn(g, { author: by, text: inviteText(g, by, cid, ctx), raw: { kind: 'invite', by, member: cid, name: displayName(g, cid), context: ctx, wake: !quiet } }));
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
      rec = appendIn(t.group, { author: by, text: kick ? `${displayName(g0, by)} removed ${who}` : `${who} left${t.event.archived ? ' — the group is archived' : ''}`, raw: { kind: kick ? 'kick' : 'leave', by, member: target, name: who, archived: t.event.archived } });
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

  /** Post a message. `from` = a member or the owner. Every @ is resolved NOW
   *  (B-ff04: `G.scanAts` — an id behind each, its places in the words; an @
   *  that names nobody, or two, is refused before anything is written);
   *  `at` (`--at <name|id>`, repeatable) names members explicitly — one the
   *  words do not already @ is written in front; `mentions` = the places the
   *  owner's @-picker chose by id; `wake:true` (`--wake`) @mentions every OTHER
   *  member — an explicit act, each one a billed turn through the ladder. */
  async function post({ group: ref, from, text, wake: wakeEveryone = false, mayWake = null, consent = null, at: atRefs = [], mentions: picked = [], awaitReply: awaits = false } = {}) {
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
      const scan = G.scanAts(body, named, { explicit: picked });
      const atNo = G.atRefusal(scan, named);
      if (atNo) return { ...atNo, group: view(g) };
      const front = [];
      for (const a of Array.isArray(atRefs) ? atRefs : []) {
        const hit = memberRef(g, a);
        if (!hit.ok) return { ok: false, code: hit.code === 'ambiguous' ? 'ambiguous-mention' : 'unknown-mention', error: `--at: ${hit.error} — nothing was sent`, candidates: hit.candidates || named.map((m) => ({ conversationId: m.member, name: m.name })), group: view(g) };
        if (!scan.mentions.some((x) => x.id === hit.member) && !front.includes(hit.member)) front.push(hit.member);
      }
      let words = body;
      let mentions = scan.mentions;
      if (front.length) {
        let lead = '';
        const added = front.map((id) => { const name = displayName(g, id); const s = lead.length; lead += `@${name} `; return { id, name, pos: [[s, s + 1 + name.length]] }; });
        for (const m of mentions) m.pos = m.pos.map(([s, e]) => [s + lead.length, e + lead.length]);
        words = lead + body;
        mentions = added.concat(mentions);
      }
      if (wakeEveryone) for (const m of named) if (m.member !== from && !mentions.some((x) => x.id === m.member)) mentions.push({ id: m.member, name: m.name });
      mentions = mentions.filter((x) => x.id !== from);
      const refusal = consentOf(consent, G.wakesPlanned(g, { author: { id: from }, mentions, raw: { kind: 'message' } }, g.members.map((m) => m.member).filter((m) => m !== from)));
      // r3: the refusal CARRIES the view the count was made against (live
      // names), so the panel repaints before its next click instead of
      // counting against the names it drew (a renamed member = 409 for ever)
      if (refusal) return { ...refusal, group: view(g) };
      const cur = G.memberOf(g, from);
      if (cur) cur.name = displayName(g, from);   // refresh the snapshot the report prints when the session is gone
      // B-eba8: an AGENT asks to be woken by the first reply (the owner is woken by nothing — never an await)
      const asks = !!awaits && from !== G.OWNER;
      rec = appendIn(g, { author: from, text: words, mentions, raw: asks ? (at) => ({ kind: 'message', await: { by: from, at, until: at + G.AWAIT_MS } }) : { kind: 'message' } });
      if (asks) { g.awaits = pruneAwaits(g.awaits, rec.at); g.awaits[rec.vendorId] = { ...rec.raw.await }; }
      if (from === G.OWNER) ownerSaw(gr, g);
      return { ok: true, group: g };
    });
    if (!res.ok) return res;
    announce([res.group.id], [rec]);
    const others = res.group.members.map((m) => m.member).filter((m) => m !== from);
    const w = await wakeAll(res.group.id, rec, others, mayWake);
    const aw = await awaitWakes(res.group.id, rec, w, mayWake, !!wakeEveryone);
    return { ok: true, group: view(getGroup(res.group.id)), message: rec, woke: w.woke, refused: w.refused, later: w.later, awaited: aw };
  }
  /** an await entry is kept a day past its `until` (read's clause), then dropped on the next write */
  function pruneAwaits(awaits, at) {
    const out = {};
    for (const [k, e] of Object.entries(awaits && typeof awaits === 'object' ? awaits : {})) if (e && Number(e.until) + 86400e3 > at) out[k] = e;
    return out;
  }
  /** B-eba8: THE REPLY to an awaited record — `G.awaitVerdict` per asker (its newest open await in this group), the
   *  wake through the SAME `wake()` (the ladder, spendReason peer-message), the entry stamped in the groups door:
   *  `answeredAt` by the first reply whatever the verdict, `wokeAt` when a wake carried it (one already made by
   *  wakeAll — a mention / always / --wake — CONSUMES it: never a second billed turn), `heldAt` when the ladder or the
   *  pace refused (the reply waits for next-turn, said on the record's line). */
  async function awaitWakes(gid, rec, w, mayWake, replyWake) {
    const g0 = getGroup(gid);
    const from = rec.author && rec.author.id;
    if (!g0 || !g0.awaits || !from) return [];
    const open = new Map();
    for (const [vid, e] of Object.entries(g0.awaits)) {
      if (!e || e.by === from || !(Number(e.at) < rec.at) || Number.isFinite(e.answeredAt)) continue;
      const prev = open.get(e.by);
      if (!prev || Number(prev[1].at) < Number(e.at)) open.set(e.by, [vid, e]);
    }
    const out = [];
    for (const [asker, [vid, e]] of open) {
      // a wake wakeAll ALREADY made (the replier's --wake, an @mention, always) carried this reply: it CONSUMES the await —
      // judged before its marker moved, never a second billed turn
      const made = w.woke.some((x) => x.member === asker);
      const v = made ? { wake: true, why: replyWake ? 'both' : 'mention' } : G.awaitVerdict(g0, { raw: { kind: 'message', await: e } }, { author: { id: from }, at: rec.at, wake: replyWake }, { entry: e, liveness: livenessNow });
      const patch = { answeredAt: rec.at, verdict: v.why };
      if (v.wake && (v.why === 'await' || v.why === 'both' || v.why === 'mention')) {
        if (made) Object.assign(patch, { wokeAt: now(), why: v.why });
        else {
          const pace = typeof mayWake === 'function' ? mayWake(asker) : true;
          const r = pace === true ? await wake(gid, asker, rec, v.why, e.at) : { ok: false, reason: (pace && pace.reason) || 'rate floor', refused: 'rate-floor' };
          if (r.ok) Object.assign(patch, { wokeAt: now(), why: v.why });
          else {
            if (pace === true && typeof mayWake === 'function' && typeof mayWake.refund === 'function') { try { mayWake.refund(asker); } catch { } }
            Object.assign(patch, { heldAt: now(), held: r.refused || r.reason || 'refused' });
          }
        }
      }
      await store.groups.update((gr) => { const g = gr.groups[gid]; if (g && g.awaits && g.awaits[vid]) g.awaits[vid] = { ...g.awaits[vid], ...patch }; });
      out.push({ member: asker, vendorId: vid, why: v.why, woke: Number.isFinite(patch.wokeAt), held: patch.held || null });
    }
    if (out.length) announce([gid], null, null, { pending: false });
    return out;
  }

  /**
   * A CONVERSATION THAT ENDED (lane pair-group-fate): the sidebar archive or gone. Inside ONE groups door: the ledger
   * row, then every live group it is in — a PAIR is closed (the `closed` record, authored by the ended member so the
   * other one's next report carries it ONCE, with the count of its messages that were not delivered), a multi-member
   * group gets one `ended` record (its rows read undeliverable). Idempotent: a cid already in the ledger with the
   * same `why` re-logs nothing. ONE broadcast.
   */
  async function onConversationEnded(cid, { why = 'archived', at = null } = {}) {
    if (!G.isCid(cid) || !G.ENDED_WHYS.includes(why)) return { ok: false, closed: [], marked: [] };
    const closed = [], marked = [], recs = [];
    await store.groups.update((gr) => {
      gr.ended = gr.ended && typeof gr.ended === 'object' ? gr.ended : {};
      const prev = gr.ended[cid];
      const when = Number(at) || now();
      if (!(prev && prev.why === why)) gr.ended[cid] = { why, at: when };
      const atE = Number(gr.ended[cid].at) || when;
      for (const g of Object.values(gr.groups)) {
        const m = G.memberOf(g, cid);
        if (!m || g.archivedAt) continue;
        if (!g.pair && prev && prev.why === why) continue;   // already said in this group
        const since = Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : m.joinedAt - 1;
        const lost = readLog(g.id).filter((r) => r && Number(r.at) > since && ((r.raw && r.raw.kind) || 'message') === 'message' && !(r.author && r.author.id === cid) && G.reachesReport(g, cid, r)).length;
        const name = displayName(g, cid);
        if (g.pair) {
          recs.push(appendIn(g, { author: cid, text: G.endedText({ name, why, n: lost, closed: true }), raw: { kind: 'closed', member: cid, why, lost } }));
          const t = G.closePair(g, { member: cid, why, at: atE });
          if (t.group && t.event) { gr.groups[g.id] = t.group; closed.push(g.id); }
        } else {
          recs.push(appendIn(g, { author: cid, text: G.endedText({ name, why, n: lost }), raw: { kind: 'ended', member: cid, why, lost } }));
          marked.push(g.id);
        }
      }
    });
    const changed = closed.concat(marked);
    if (changed.length) announce(changed, recs);
    else announce([], null, null, { pending: false });
    return { ok: true, closed, marked };
  }
  /** The archive was LIFTED (the owner un-archived it): the ledger row goes — its rows wait again (a closed pair stays
   *  closed: a new `send` makes a new pair). */
  async function onConversationRevived(cid) {
    let moved = false;
    await store.groups.update((gr) => { if (gr.ended && gr.ended[cid] && gr.ended[cid].why === 'archived') { delete gr.ended[cid]; moved = true; } });
    if (moved) announce([], null, null, { pending: false });
    return moved;
  }
  /** THE STANDING RULE (boot, after restoreSessions, and every archive): every member of a live group is asked the
   *  wiring's `liveness` — archived / gone ⇒ `onConversationEnded`; a ledger row whose archive was lifted ⇒ revived.
   *  Idempotent (a closed group is never re-logged). */
  async function sweepEnded() {
    const seen = new Set();
    const out = { closed: [], marked: [], revived: [] };
    for (const g of Object.values(all())) for (const m of g.members) seen.add(m.member);
    for (const cid of Object.keys(store.groups.live().ended || {})) seen.add(cid);
    for (const cid of seen) {
      let lv = null;
      try { lv = liveness(cid); } catch { lv = null; }
      const st = lv && lv.state;
      const e = endedOf(cid);
      if (st === 'archived' || st === 'gone') {
        const hasLive = Object.values(all()).some((g) => !g.archivedAt && G.memberOf(g, cid));
        if (!e || e.why !== st || hasLive) { const r = await onConversationEnded(cid, { why: st, at: lv.at || null }); out.closed.push(...r.closed); out.marked.push(...r.marked); }
      } else if (e && e.why === 'archived' && (st === 'running' || st === 'stopped')) { if (await onConversationRevived(cid)) out.revived.push(cid); }
    }
    return out;
  }

  /** `send <agent>`: the two-member group of these two, found or created (the
   *  same pair is always the same group — idempotent), then an ordinary post.
   *  D2's default applies to pairs too: next-turn unless the receiver chose
   *  otherwise or the sender passes `wake` (= an @, a billed turn).
   *  `create:false` (a Background Work job posting as its owner conversation)
   *  posts only into a pair that ALREADY exists — a job never makes a group. */
  async function sendToAgent({ from, to, text, wake: w = false, create = true, mayWake = null, consent = null, at = [], awaitReply: aw = false } = {}) {
    const ended = endedOf(to) ? endedRefusal(to, from) : null;
    if (ended) return ended;
    const r = resolveMember(to, from);
    if (!r.ok) return endedRefusal(to, from) || r;
    const shown = r.name || to;
    if (!create && !findPair(from, r.cid)) return { ok: false, code: 'job-token', error: `no direct group with "${shown}" exists yet, and a job token never creates one — start it from the conversation that owns this job (vibespace-msg send "${shown}" "…"), then the job can post into it` };
    const pair = await findOrCreatePair(from, r.cid, r.name);
    if (!pair.ok) return pair;
    const p = await post({ group: pair.group.id, from, text, wake: w, mayWake, consent, at, awaitReply: aw });
    return p.ok ? { ...p, pairCreated: pair.created } : p;
  }
  /** `send <agent>` to a conversation that ENDED is refused BY NAME (lane pair-group-fate) — only an agent `by` shared
   *  a group with (its member rows), so the answer is no oracle; null when `ref` names no ended conversation. */
  function endedRefusal(ref, by) {
    const r = String(ref || '').trim();
    if (!r) return null;
    for (const g of Object.values(all())) {
      if (!G.memberOf(g, by) && by !== G.OWNER) continue;
      for (const m of g.members) {
        if (m.member === by || !(m.member === r || (m.name && G.cleanName(m.name) === r))) continue;
        const e = endedOf(m.member);
        if (!e) continue;
        const name = displayName(g, m.member);
        const date = e.at ? new Date(e.at).toISOString().slice(0, 10) : 'an earlier day';
        return { ok: false, code: 'ended', error: `${name}'s conversation ended on ${date} (${e.why === 'gone' ? 'it is gone' : 'archived'}) — nothing can read it`, conversationId: m.member };
      }
    }
    return null;
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
    return { ok: true, group: view(rg.group), records: readFolded(rg.group.id, opts) };
  }

  /**
   * "CLEAR CONTENT…" — THE door for group messages (2026-09-28). The log is
   * APPEND-ONLY (invariant 1 of channel-store), so a clear WRITES, it never
   * rewrites: one REPLACEMENT record per cleared record — `{vendorId:'gx-…',
   * at: the clear's instant, author: the clearer, text:'', raw:{kind:'cleared',
   * of:<vendorId>, by}}` — appended in the groups door, then the record is named
   * in the group's `cleared` index (`{vendorId: {at, by}}`, groups.json) that
   * every page applies even when it does not reach the replacement. Log FIRST,
   * index SECOND, like appendIn. Neither moves `lastAt` (a clear is not
   * activity: no unread, no report, no re-sort); `lastText` becomes the sentence
   * when the cleared record was the newest (`lastCleared`). THE ORIGINAL LINE
   * STAYS ON DISK: a group log is never rolled or trimmed (trim runs on adapter
   * logs only), so there is no roll to compact it on — every reader shows the
   * cleared text, the bytes remain in msgs/groups/<id>.ndjson. Each vendorId is
   * found with the store's findRecord (a batch past 8 reads the log once),
   * asked `allow(record)` (the caller's PURE clearVerdict). ONE audit line
   * (kind + ids + by, never words), ONE announce carrying the cleared records.
   * @returns {ok:true, cleared:[vid], already:[vid], unknown:[vid], refused:[{id, code, why, status}], records:[cleared]} | a refusal
   */
  async function clearMessages({ group: gid, ids, by = G.OWNER, at = null, allow = null } = {}) {
    const g0 = getGroup(gid);
    if (!g0) return { ok: false, code: 'not-found', error: `no group ${String(gid).slice(0, 40)}` };
    const want = [...new Set((Array.isArray(ids) ? ids : [ids]).map(String))];
    const out = { ok: true, cleared: [], already: [], unknown: [], refused: [], records: [] };
    // look every record up OUTSIDE the door (a read), decide inside it
    const found = originalsOf(gid, want);
    const stamp = Number.isFinite(at) ? at : now();
    const byWho = by === G.OWNER ? 'owner' : String(by);
    await store.groups.update((gr) => {
      const g = gr.groups[gid];
      if (!g) return;
      if (!g.cleared || typeof g.cleared !== 'object') g.cleared = {};
      const fresh = [];
      for (const vid of want) {
        const rec = found.get(vid);
        if (!rec) { out.unknown.push(vid); continue; }
        if (g.cleared[vid]) { out.already.push(vid); continue; }
        const v = allow ? allow(rec) : { ok: true };
        if (!v || !v.ok) { out.refused.push({ id: vid, code: (v && v.code) || 'not_yours', why: (v && v.why) || '', status: (v && v.status) || 403 }); continue; }
        fresh.push(rec);
      }
      if (!fresh.length) return;
      const repl = fresh.map((r) => makeRecord({
        adapterId: A, convId: gid, vendorId: `gx-${stamp.toString(36)}-${(++seq).toString(36)}`, at: stamp,
        author: { id: by, name: by === G.OWNER ? 'User' : displayName(g, by), isSelf: by === G.OWNER, isBot: false },
        text: '', raw: { kind: RC.REPLACEMENT_KIND, of: r.vendorId, by: byWho },
      }));
      store.appendRecords(A, gid, repl);                       // the log FIRST…
      for (const r of fresh) g.cleared[r.vendorId] = { at: stamp, by: byWho };   // …the index SECOND
      if (fresh.some((r) => Number(r.at) === Number(g.lastAt))) { g.lastText = RC.CLEARED_TEXT; g.lastCleared = true; }
      for (const r of fresh) { out.cleared.push(r.vendorId); out.records.push(RC.clearedRecord(r, { kind: 'group-message', by: byWho, at: stamp })); }
    });
    if (out.cleared.length) {
      try { store.audit({ kind: 'clear', groupId: gid, recordIds: out.cleared, by: byWho, at: stamp }); } catch { }
      // the delivery ladder's stash (data/msg-stash.json): a wake a codex member's wrapper could not queue
      // is handed back to the ladder WHOLE (the report text, a line per record) and drained into that
      // member's next turn — every line of a held report that repeats a cleared record's words goes
      // (verify r3; the engine itself never stashes a wake, the wrapper's hand-back does)
      try { if (deliver && typeof deliver.redactStash === 'function') deliver.redactStash((e) => redactHeldReport(e, gid, out.cleared.map((vid) => found.get(vid)))); } catch (err) { log.warn && log.warn('[groups] ladder stash rewrite failed:', err && err.message); }
      announce([gid], null, out.records.map((record) => ({ groupId: gid, vendorId: record.vendorId, record })));
      // the .197 integration: a member's chat card of a cleared message re-words (its ring copy lost the words too)
      try { onCleared(gid, out.cleared.map((vid) => found.get(vid)).filter(Boolean).map((r) => `${gid}:${Number(r.at)}`)); } catch (err) { log.warn && log.warn('[groups] the group cards were not re-worded:', err && err.message); }
    }
    return out;
  }
  /** THE CLEAR'S OWN LOOKUP: the ORIGINAL records `vids` name in group `gid` (a raw read of the log — the
   *  replacement records are never an original; a batch past 8 reads the log once) → Map(vendorId → record | null).
   *  Shared by `clearMessages` and the held-entry judge below (verify r4) — the ONLY two readers that may see an
   *  original after its clear, and neither serves it: the clear returns cleared copies, the judge only matches. */
  function originalsOf(gid, vids) {
    const want = [...new Set((Array.isArray(vids) ? vids : [vids]).map(String))];
    if (want.length > 8) {
      const all = store.readTail(A, gid, { limit: 1e7 });
      const byId = new Map(all.filter((r) => r && r.vendorId && !RC.isReplacement(r)).map((r) => [r.vendorId, r]));
      return new Map(want.map((v) => [v, byId.get(v) || null]));
    }
    return new Map(want.map((v) => { const r = store.findRecord(A, gid, v); return [v, r && !RC.isReplacement(r) ? r : null]; }));
  }
  /**
   * "CLEAR CONTENT…" — THE LADDER'S JUDGE (lane-redact verify r4, 2026-09-28, reproduced): the delivery ladder asks this
   * of EVERY entry it stashes (`deliver.registerStashJudge` below). The door's own rewrite takes the held reports queued
   * at the clear — but a wake report a codex member's wrapper hands BACK later (a queued wake dropped by Stop / removed
   * from the queue: an unbounded window, past a restart too) re-enters the queue WHOLE with the record's pre-clear words.
   * A report names its group `(<gid>)`; every group it names whose `cleared` index is not empty lends its originals
   * (read from the log — the bytes stay, the index says which are cleared; cached per group by the index's size) and
   * `redactHeldReport` replaces each line that repeats a cleared record's witness. Store-backed, never a memory of past
   * clears. null = nothing of a cleared record.
   */
  const heldNeedles = new Map();   // gid → {n: the index's size when read, recs: the witnesses only ({text: first 40 code points}), never the records}
  const witnessOf = (r) => ({ text: Array.from(String((r && r.text) || '').replace(/\s+/g, ' ').trim()).slice(0, 40).join('') });
  function judgeHeldEntry(e) {
    if (!e || typeof e.text !== 'string' || !e.text.includes('(')) return null;
    let out = null;
    for (const [gid, g] of Object.entries(all())) {
      const vids = g && g.cleared && typeof g.cleared === 'object' ? Object.keys(g.cleared).slice(0, REPLACEMENT_READ_MAX) : [];
      if (!vids.length || !e.text.includes(`(${gid})`)) continue;
      let c = heldNeedles.get(gid);
      if (!c || c.n !== vids.length) { c = { n: vids.length, recs: [...originalsOf(gid, vids).values()].filter(Boolean).map(witnessOf) }; heldNeedles.set(gid, c); }
      const r = redactHeldReport({ ...e, ...(out || {}) }, gid, c.recs);
      if (r) out = { ...(out || {}), ...r };
    }
    return out;
  }
  if (deliver && typeof deliver.registerStashJudge === 'function') deliver.registerStashJudge(judgeHeldEntry);
  /** A held report (one stash entry) that names group `gid`: every LINE that carries a cleared record's
   *  words (the report writes each record's text whitespace-collapsed, possibly cut — the first 40 code
   *  points of the collapsed text are the witness) becomes the sentence; null when nothing matched. */
  function redactHeldReport(e, gid, recs) {
    if (!e || typeof e.text !== 'string' || !e.text.includes(`(${gid})`)) return null;
    const needles = recs.map((r) => Array.from(String((r && r.text) || '').replace(/\s+/g, ' ').trim()).slice(0, 40).join('')).filter((n) => n.length >= 4);
    if (!needles.length) return null;
    let hit = false;
    const lines = e.text.split('\n').map((l) => { if (needles.some((n) => l.includes(n))) { hit = true; return `- ${RC.CLEARED_TEXT}`; } return l; });
    return hit ? { text: lines.join('\n') } : null;
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
   * @returns {{text, marks:[{groupId, upTo, cards?}], cards}} — commit the
   *   marks with `commitReports` once the text is actually handed out (it
   *   draws each mark's cards, then stamps it). `{preview:true}` commits
   *   nothing: `marks` is empty and `pending` lists every waiting message.
   */
  function reportsForTurn(cid, { budget = TURN_BUDGET, preview = false, aside = false } = {}) {
    if (preview) return previewFor(cid, budget);
    return composeReports(cid, budget, aside);
  }
  /** THE CARDS a shown report carries (lane group-report-card): one per group MESSAGE the member was shown, oldest
   *  first — the sender, the words it was shown (whole, or cut as its line was), the group — and the count of the
   *  older records the report did not show on the oldest card ("… and N more"; the agent's own pointer counts the
   *  same). A system record (an invite, a rename) rides the report and renders no card. */
  function cardsOf(g, rep, via = 'report') {
    const shown = (rep && Array.isArray(rep.lines) ? rep.lines : []).filter((x) => x && x.rec && ((x.rec.raw && x.rec.raw.kind) || 'message') === 'message' && String(x.body || '').trim());
    const cards = shown.map((x) => {
      const a = x.rec.author || {};
      const self = a.id === G.OWNER;
      const from = self ? null : (a.name || a.id || null);
      return { fromName: from, text: String(x.body), group: { id: g.id, name: g.name, at: x.rec.at, from, self, via, cut: !!x.cut, more: 0 } };
    });
    if (cards.length && Number(rep.clipped) > 0) cards[0].group.more = Number(rep.clipped);
    return cards;
  }
  /** PREVIEW (the strip above the composer): the same composition a user turn would get under `budget`, committing
   *  NOTHING (no marks are handed out — a preview is never committable), plus `pending` = every group message
   *  waiting for this member's next turn (not only the ones that would fit). Memoised against the facts it reads —
   *  per group: its `lastAt`, the member's marker, its notify mode (the log is append-only: a new record moves
   *  `lastAt`) — so the session list's broadcast reads no log twice. */
  const previewMemo = new Map();   // cid → {sig, value}
  function pendingSig(cid) {
    const parts = [];
    for (const g of Object.values(all())) { const m = G.memberOf(g, cid); if (m) parts.push(`${g.id}:${Number(g.lastAt) || 0}:${memberSince(m)}:${m.notify}`); }
    return parts.join('|');
  }
  function pendingOf(cid) {
    const out = [];
    for (const g of Object.values(all())) {
      const m = G.memberOf(g, cid);
      if (!m || m.notify === 'mute' || g.closed) continue;   // lane pair-group-fate: a CLOSED pair's entries are nobody's to wait for
      const since = memberSince(m);
      if (!((Number(g.lastAt) || 0) > since)) continue;
      for (const r of readLog(g.id)) {
        if (!r || !(Number(r.at) > since) || (r.author && r.author.id === cid) || ((r.raw && r.raw.kind) || 'message') !== 'message' || !G.reachesReport(g, cid, r)) continue;   // B-a354: a `mention` member waits only for what @mentions it
        const self = !!(r.author && r.author.id === G.OWNER);
        out.push({ groupId: g.id, groupName: g.name, at: r.at, from: self ? null : ((r.author && (r.author.name || r.author.id)) || null), self, text: String(r.text == null ? '' : r.text).slice(0, PENDING_TEXT_MAX) });
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }
  function previewFor(cid, budget) {
    const sig = pendingSig(cid) + '#' + (Number(budget) || 0);
    const hit = previewMemo.get(cid);
    if (hit && hit.sig === sig) return hit.value;
    const r = composeReports(cid, budget);
    const value = { text: r.text, marks: [], cards: r.cards, pending: pendingOf(cid), preview: true };
    previewMemo.delete(cid);
    previewMemo.set(cid, { sig, value });
    if (previewMemo.size > 1000) previewMemo.delete(previewMemo.keys().next().value);
    return value;
  }
  function composeReports(cid, budget, aside = false) {
    const cands = [];
    for (const g of Object.values(all())) {
      const m = G.memberOf(g, cid);
      if (!m || m.notify === 'mute') continue;
      if (wakesInFlight.has(g.id + '|' + cid)) continue;   // its wake's frame carries them (lane stash-any-turn)
      const since = Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : m.joinedAt - 1;
      if (!((g.lastAt || 0) > since)) continue;
      cands.push(g);
    }
    if (!cands.length) return { text: '', marks: [], cards: [] };
    cands.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    const cap = Math.min(TURN_BUDGET, Number(budget) || 0);
    const head = '### Group messages since your last turn (vibespace-msg — nobody was woken for these; reply only if it helps)' + (aside ? '\n' + ASIDE_LINE : '');
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
      entries.push({ g, text: rep.text, mark: { groupId: g.id, upTo: rep.upTo, cards: cardsOf(g, rep) } });
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
    const cards = entries.flatMap((e) => e.mark.cards).sort((a, b) => a.group.at - b.group.at);
    return { text, marks: [...entries.map((e) => e.mark), ...quiet], cards };
  }
  /** The trailer: at most WAITING_NAMED groups named (each name clipped), the
   *  rest counted — bounded whatever the names are. */
  function waitingLine(waiting, nameAtMost = WAITING_NAMED) {
    const named = waiting.slice(0, nameAtMost).map((g) => `"${clipName(inertFrames(g.name))}" ${g.id}`);
    const more = waiting.length - named.length;
    return `(${waiting.length} more group(s) with new messages — ${named.length ? named.join(', ') : 'none named here'}${more > 0 ? ` +${more} more` : ''} — arrive on your next turn, or vibespace-msg read <group>)`;
  }
  /** The report was handed out: its CARDS first (lane group-report-card — synchronously, before any await, so they
   *  land in the chat while the hook's answer is composed: under the message that carried them, oldest first,
   *  through THE ladder's card door, which keys each (group, record) once), then the markers. */
  async function commitReports(cid, marks) {
    const cards = [];
    for (const mk of marks || []) for (const c of (mk && Array.isArray(mk.cards) ? mk.cards : [])) cards.push(c);
    cards.sort((a, b) => a.group.at - b.group.at);
    if (cards.length && !(deliver && typeof deliver.emitPeerCard === 'function')) (log.warn || log.log || (() => {})).call(log, `[groups] ${cards.length} group message card(s) for ${String(cid).slice(0, 8)} not drawn — no card door wired`);
    else for (const c of cards) { try { deliver.emitPeerCard(cid, { fromName: c.fromName, text: c.text, kind: 'group', group: c.group }); } catch (e) { (log.warn || log.log || (() => {})).call(log, '[groups] a group message card failed:', e && e.message); } }
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
    onConversationEnded, onConversationRevived, sweepEnded, endedOf, endedRefusal,
    list, listFor, markRead, liveRoster, pacerFor, noteRoster, get: (id) => { const g = getGroup(id); return g ? view(g) : null; }, resolveGroup, resolveMember, resolveTarget, reach,
    sharesGroup, dispatchLedger,   // lane worker-dispatch verify r1 ④ / ②
    create: createGroup, invite, leave: (o) => remove({ ...o, kick: false }), kick: (o) => remove({ ...o, kick: true }),
    rename: renameGroup, archive: archiveGroup, setNotify, post, sendToAgent, findPair, findOrCreatePair, read, clearMessages,
    reportsForTurn, commitReports,
    WAKE_BUDGET, TURN_BUDGET, MIN_REPORT_ROOM,
  };
}

module.exports = { create, WAKE_BUDGET, TURN_BUDGET, MIN_REPORT_ROOM, TEXT_MAX, ASIDE_LINE };
