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
const { pauseDoorsOf } = require('../channel-store.js');   // B-f276 A2: THE ONE DOOR WRAPPER (both engines)
const crypto = require('crypto');
const { isPress } = require('../write-origin.js');   // lane owner-press-attended r2: the owner's wake is attended only on its door's press
const OF = require('./owner-facts.js'); // lane agent-context-owner-facts (B-7960): a time the owner or an agent reads is in the owner's zone, named
const G = require('../channel-groups.js');
const GC = require('../group-card.js');
const DW = require('../delivery-wake.js');   // the manager design's piece 7: which wake of a stopped member is OWED a resume
const { makeRecord, inertFrames } = require('../channel-record.js');
const { toAgentText: agentText } = require('../peer-text.js');   // verify r1 F3: a group's name on its way out (view)
const DM = require('../dispatch-model.js');   // lane worker-dispatch verify r1 ②: the dispatch ledger's windows (PURE)
const belt = require('../agent-output-belt.js'); // lane agent-output-sinks: the sink belt — a group message a peer / the disk sees never carries a credential in the clear
// B-4f7f (主开发 r2804): THE SENDER IS TOLD how many spans the scrub changed — the belt's marks in what is kept that the sender's own
// text did not already carry (a count, never the words)
const { REDACTED } = require('../secret-shapes.js');
const marksIn = (t) => String(t == null ? '' : t).split(REDACTED).length - 1;
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
// B-b17f: the boot warm-up reads a group's log in windows this size, each parsed in its own turn of the loop
const WARM_WINDOW_BYTES = 64 * 1024;
// B-b17f's remainder cure (主开发 21:43Z, should 1): ONE group's warm read that has not settled after this long never holds the
// warm-up — that group stays «not counted yet» (said once, by name) and is counted when its read lands; the others go on
const WARM_READ_BOUND_MS = 10000;
const READ_MAX = 200;
const LAST_TEXT_MAX = 160;
const WAITING_NAMED = 3;        // the trailer names at most this many waiting groups, then counts
const PENDING_TEXT_MAX = 400;   // a waiting message's words as the strip previews them (its first line is what shows)
// lane ci-351-reds (2026-10-24 — the boot's listen tick measured 255 ms of main-thread CPU against the 250 ms law): the boot
// asks the ended-sweep INSIDE the listen callback (server.js noteUserState); its per-member liveness pass (a transcript
// lookup each) was 68 ms of that one tick. It now starts on a LATER loop turn and hands the loop back every
// SWEEP_SLICE_MS (the real clock, never the injected `now`); the verdicts are the same. TWO immediates: one queued from a
// poll-phase callback runs in that same loop iteration (no timer between) — the second lands past the next timers phase.
const SWEEP_SLICE_MS = 20;
const nextTurn = () => new Promise((r) => setImmediate(() => setImmediate(r)));
const sliceClock = () => performance.now();
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
  dataDir = null,   // lane agent-output-sinks: the belt finds the vault from here (the hub's data dir, parent of channels/)
  deliver = null,
  broadcast = () => {},
  now = () => Date.now(),
  log = console,
  warmReadBoundMs = WARM_READ_BOUND_MS,   // B-b17f's remainder cure: a seam for the leg (a never-settling read, a short bound)
  onWarmed = null,   // B-b17f's remainder cure: the warm-up's END, told (a seam for the legs — the end is said only when a reader got null)
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
  // lane paced-wake-retry (P12): the For-you door. Sign-in off, the owner holds «sent when the window ends» too, and has no conversation to be told in
  userTodos = null,
} = {}) {
  if (!store || !store.groups) throw new Error('groups-engine: a channel store with the groups family is required');
  const A = G.GROUP_ADAPTER_ID;
  let seq = 0;

  const live = () => { try { return (roster() || []).filter((s) => s && s.cid); } catch (e) { log.warn && log.warn('[groups] roster threw:', e && e.message); return []; } };
  // lane roster-per-pass: the wiring hands a roster that is built ONCE per pass (src/server/roster-pass.js) and carries the
  // pass's own index — a lookup, never a rebuild; a plain roster function (a drill's) keeps the old find
  const sessionOf = (cid) => {
    if (typeof roster.sessionOf !== 'function') return live().find((s) => s.cid === cid) || null;
    try { return roster.sessionOf(cid); } catch (e) { log.warn && log.warn('[groups] roster threw:', e && e.message); return null; } // as live() answers a throw
  };
  const all = () => store.groups.live().groups;
  // B-f276 A2 (主开发 r487): A HELD FAMILY PAUSES EVERY READER OF IT — the agent groups read groups.json, wake-pace.json and
  // dispatch-ledger.json; any one held (its read failed: empty in memory) pauses this engine through THE ONE PAUSE (the store's
  // heldOf): no wake granted over floors nobody read, no dispatch (MONEY: a ledger row that cannot be written is a second billed
  // wake after the next start), no «no such group» over a list nobody read — every door refused BY NAME (store-blocked, 503).
  const GROUP_FAMILIES = Array.isArray(store.groupFamilies) ? store.groupFamilies : [];   // the store names its own files (record-clear)
  const groupsPaused = () => !!(store.heldOf && store.heldOf(GROUP_FAMILIES).length);
  const groupsPausedWords = () => `the agent groups are paused: ${(store.heldOf && store.heldOf(GROUP_FAMILIES)[0]) || 'a file of theirs'} could not be read — nothing is sent until it reads again`;
  const groupsPausedError = () => { const e = new Error(groupsPausedWords()); e.code = 'store-blocked'; e.status = 503; e.paused = true; return e; };
  const groupsPausedAnswer = () => ({ ok: false, code: 'store-blocked', paused: true, error: groupsPausedWords() });
  let groupsPausedSaid = false;
  // B-f276 1c follow (its round whfrsuwsp lens 2, 主开发 r1588 (4)): a conversation that ENDED while a group family was held was dropped
  // by the paused end door (its held frames kept, its rows un-ended, the wiring's signature taken over the empty answer) — the END
  // SWEEP runs again once the families read, as the orphan scan does; armed once a hold
  let endsOwed = false;
  const endsAtLift = () => { if (endsOwed || !store.whenRead) return; endsOwed = true; store.whenRead(GROUP_FAMILIES, () => { endsOwed = false; sweepEnded().catch((e) => (log.warn || log.log || (() => {})).call(log, `[groups] the end sweep after the lift failed: ${(e && e.message) || e}`)); }); };
  const sayPausedDoor = (door) => { sayGroupsPaused(); if (door === 'onConversationEnded' || door === 'sweepEnded') endsAtLift(); };
  const sayGroupsPaused = () => { if (groupsPausedSaid) return; groupsPausedSaid = true; (log.warn || log.log || (() => {})).call(log, `[groups] ${groupsPausedWords()}`); if (store.whenRead) store.whenRead(GROUP_FAMILIES, () => { groupsPausedSaid = false; }); };   // N7: said again after a lift
  // lane roster-per-pass: a synchronous pass over groups / members reads ONE roster (checked once at its start —
  // src/server/roster-pass.js); a plain roster function (a drill's) has no passes: each read is its own
  const inPass = (fn) => (typeof roster.pass === 'function' ? roster.pass(fn) : fn());
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
      archivedAt: g.archivedAt || null, lastAt: g.lastAt || g.createdAt, lastText: g.lastText || '', lastRaw: g.lastRaw || null, lastCleared: !!g.lastCleared, // lastCleared: the last line IS the cleared sentence (a client words it)
      // lane group-pending (2026-10-01): the member's report MARKER rides the view — the window's line under every
      // message ("waiting for beta's next turn" / "read by beta") and the CLI's trailing clause are judged off it
      // (PURE G.deliveryOf); it was a private fact before, so a message handed over looked exactly like one waiting
      members: g.members.map((m) => ({ member: m.member, name: displayName(g, m.member), notify: m.notify, joinedAt: m.joinedAt, invitedBy: m.invitedBy, live: !!sessionOf(m.member), ended: endedOf(m.member), ...(Array.isArray(m.queued) && m.queued.length ? { queued: m.queued.map((q) => ({ ...q })) } : {}), reportedUpTo: Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : null, reportedAt: Number.isFinite(m.reportedAt) ? m.reportedAt : null })),
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
  // B-b17f's remainder (2.369.412): until the boot warm-up has PASSED a group, a reader never reads that group's log on the
  // loop — an owed count is null («not counted yet»). The release's readers counted every group the warm-up had not reached
  // from its log, synchronously, all in ONE turn (a page asking at the hub's start: every cold group's log at once). The
  // warm-up's end announces the list once when a reader was answered null. coldIds: the groups of the start, not yet passed
  let coldIds = null;
  const coldAsked = new Set();
  const stuckIds = new Set();   // the cure (should 1): groups whose warm read passed its bound and has not landed — cold until it does
  // B-a354: a `mention` member counts only what reaches it (B-a354's rule, read through reachFor) — its mode is part of the memo's facts
  const modeOf = (g, who) => { const m = who === G.OWNER ? null : G.memberOf(g, who); return m ? m.notify : null; };
  function unreadFor(g, who, since, log = null) {   // `log` (B-b17f, the boot warm-up): the group's records already read
    const key = g.id + '|' + who;
    const lastAt = Number(g.lastAt) || 0;
    const mode = modeOf(g, who);
    const sig = mode === 'mention' ? reachSig(g, who) : '';
    // B-b17f's remainder: a COLD group's reader memoises nothing (the warm-up's count is the first memo) — an owed count is
    // null, «not counted yet»; nothing owed is 0 by the facts alone
    if (!log && ((coldIds && coldIds.has(g.id)) || stuckIds.has(g.id))) { if (!(lastAt > since)) return 0; coldAsked.add(g.id); return null; }
    if (!(lastAt > since)) { unreadMemo.set(key, { since, lastAt, mode, sig, n: 0 }); return 0; }
    const m = unreadMemo.get(key);
    if (m && m.since === since && m.lastAt === lastAt && m.mode === mode && m.sig === sig) return m.n;
    const take = unreceivedFor(g, who);
    const n = (log || readLog(g.id)).filter((r) => r.at > since && !(r.author && r.author.id === who) && take(r)).length;
    unreadMemo.set(key, { since, lastAt, mode, sig, n });
    return n;
  }
  /** B-b17f: would unreadFor read the log for (g, who, since)? — its own test (the memo's since, lastAt, mode and sig) */
  function unreadOwed(g, who, since) {
    const lastAt = Number(g.lastAt) || 0;
    if (!(lastAt > since)) return false;
    const mode = modeOf(g, who), sig = mode === 'mention' ? reachSig(g, who) : '', m = unreadMemo.get(g.id + '|' + who);
    return !(m && m.since === since && m.lastAt === lastAt && m.mode === mode && m.sig === sig);
  }
  function bumpUnread(g, prevLastAt, at, author, rec = null) {
    for (const who of [G.OWNER, ...g.members.map((m) => m.member)]) {
      const e = unreadMemo.get(g.id + '|' + who);
      if (!e || e.lastAt !== prevLastAt) continue;
      e.lastAt = at;
      if (author !== who && at > e.since && (rec ? unreceivedFor(g, who)(rec) : e.mode !== 'mention')) e.n++;
    }
  }
  const memberSince = (m) => (Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : m.joinedAt - 1);
  const ownerUnread = (g) => unreadFor(g, G.OWNER, ownerReadOf(g.id));
  /** The OWNER's list (the panel, every broadcast): every group + its unread
   *  count for the owner. Agents read `listFor` (their own counts). */
  const list = () => inPass(() => Object.values(all()).map((g) => ({ ...view(g), unread: ownerUnread(g) })).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)));
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
  function noteRoster() { return inPass(() => noteRosterNow()); }
  function noteRosterNow() {
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
  /** the cure of batch 6: the words a member's @ answers to (display names + conversation ids) — the belt spares only these */
  const memberWords = (g) => (g && Array.isArray(g.members) ? g.members.flatMap((m) => [m.member, displayName(g, m.member)]).filter(Boolean).map(String) : []);
  function appendIn(g, { author, text, mentions = [], raw: raw0 }) {
    const prevLastAt = Number(g.lastAt) || 0;
    const at = Math.max(now(), prevLastAt + 1);
    const raw = typeof raw0 === 'function' ? raw0(at) : raw0;   // B-eba8: an await's `until` is reckoned from the record's own instant
    if (raw && raw.kind === 'message') text = belt.maskForSink(String(text == null ? '' : text), { dataDir, message: true, mentions: memberWords(g) });   // agent-output-sinks: belt a MEMBER's message only — never a system event (create/invite/kick/leave/rename/archive/closed/ended); lane bl-msg B-3e61: the MESSAGE mode (the rest of a line arrives)
    const rec = makeRecord({
      adapterId: A, convId: g.id, vendorId: `${raw.kind === 'message' ? 'gm' : 'gs'}-${at.toString(36)}-${(++seq).toString(36)}`, at,
      author: { id: author, name: displayName(g, author), isSelf: author === G.OWNER, isBot: false },
      text, mentions, raw,
    });
    store.appendRecords(A, g.id, [rec]);
    g.lastAt = at;
    bumpUnread(g, prevLastAt, at, author, rec);
    g.lastText = String(rec.text).replace(/\s+/g, ' ').slice(0, LAST_TEXT_MAX);
    // a SYSTEM line's structure beside its agent-facing English — the page words it in the reader's language (lane ui-language,
    // the walk's channels-groups-outbox-3: the list's preview read «User added Sessio…» in a Chinese interface)
    g.lastRaw = raw && raw.kind && raw.kind !== 'message' ? { kind: raw.kind, by: displayName(g, raw.by || author), member: raw.member ? (displayName(g, raw.member) || raw.name || '') : '', from: raw.from || '', archived: !!raw.archived } : null;
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
  /** readFolded's ASYNC twin (lane queued-is-not-woke laws 2 + 3, shape C — the reading's log read, OFF THE LOOP): the same
   *  fold over the store's async tail (a FileHandle) */
  async function readFoldedAsync(gid, opts) {
    const g = getGroup(gid);
    const n = Math.max(1, Number(opts.limit) || 50);
    const o = { ...opts, limit: n + clearedCountOf(g) };
    const raw = typeof store.readTailAsync === 'function' ? await store.readTailAsync(A, gid, o) : { records: store.readTail(A, gid, o), whole: false };
    return { records: RC.foldClears(raw.records, g && g.cleared).slice(-n), whole: !!raw.whole };
  }

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
    settleOwed(gid, member);   // lane paced-wake-retry: a parked wake this report carried is cancelled, never a second post
  }

  /** THE QUEUED WAKE (lane queued-is-not-woke, law 1): a wake the addressee's wrapper QUEUED behind its running turn. The
   *  marker moves at once (the record is in that wrapper's queue: no report re-sends it), and a `queued` entry says what
   *  the record really is — «waiting for <name>'s current turn» (channel-groups deliveryOf) — until a turn carries it
   *  (markCarried: «read by», the hand-over clock = that turn) or it is handed back (markRestashed: «next turn»). */
  // THE EARLY ANSWER (round 2, the panel's S3): the ladder may carry — or hand back — a frame before this engine's own
  // markQueued has landed; that answer is kept here (bounded) and applied when the entry is written, never lost
  const earlyQueued = new Map();   // `${gid}|${member}|${upTo}` -> 'carried' | 'restashed'
  const earlyKey = (gid, member, upTo) => `${gid}|${member}|${Number(upTo)}`;
  const noteEarly = (gid, member, upTo, what) => { earlyQueued.set(earlyKey(gid, member, upTo), what); if (earlyQueued.size > 500) earlyQueued.delete(earlyQueued.keys().next().value); };
  async function markQueued(gid, member, upTo, { since = null } = {}) {
    if (!Number.isFinite(upTo)) return;
    await store.groups.update((gr) => {
      const g = gr.groups[gid];
      const m = g && G.memberOf(g, member);
      if (!m) return;
      const early = earlyQueued.get(earlyKey(gid, member, upTo)) || null;   // read INSIDE the update: the store runs them in order
      earlyQueued.delete(earlyKey(gid, member, upTo));
      if (early === 'carried') { if (!(Number(m.reportedUpTo) >= upTo)) m.reportedUpTo = upTo; m.reportedAt = now(); return; }   // a turn already carried it
      const from = Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : null;   // the records after it went out in this wake
      if (!(Number(m.reportedUpTo) >= upTo)) m.reportedUpTo = upTo;
      m.queued = (Array.isArray(m.queued) ? m.queued : []).filter((q) => q && Number(q.upTo) !== upTo).concat([{ from, upTo, at: now(), since: Number.isFinite(since) ? since : null, state: early === 'restashed' ? 'restashed' : 'queued' }]);   // never trimmed: the ladder bounds at the send (round 2)
    });
    announce([gid]);
    settleOwed(gid, member);
  }
  async function markCarried(gid, member, upTo) {
    let moved = false;
    await store.groups.update((gr) => {
      const g = gr.groups[gid];
      const m = g && G.memberOf(g, member);
      if (!m || !Array.isArray(m.queued) || !m.queued.some((q) => q && Number(q.upTo) === Number(upTo))) { noteEarly(gid, member, upTo, 'carried'); return; }
      const rest = m.queued.filter((q) => q && Number(q.upTo) !== Number(upTo));
      m.queued = rest.length ? rest : undefined;
      m.reportedAt = now(); moved = true;   // the hand-over clock = the turn that carried it
    });
    if (moved) announce([gid]);
  }
  /** AN ENTRY THAT LEFT (round 4): the stash evicted its words, or it aged out — the row says «not delivered» (send it again), never «waiting» for good */
  async function markDropped(gid, member, upTo) {
    let moved = false;
    await store.groups.update((gr) => {
      const g = gr.groups[gid];
      const m = g && G.memberOf(g, member);
      const q = m && Array.isArray(m.queued) ? m.queued.find((x) => x && Number(x.upTo) === Number(upTo)) : null;
      if (q && q.state !== 'dropped') { q.state = 'dropped'; q.droppedAt = now(); moved = true; }
    });
    if (moved) announce([gid]);
  }
  async function markRestashed(gid, member, upTo) {
    let moved = false;
    await store.groups.update((gr) => {
      const g = gr.groups[gid];
      const m = g && G.memberOf(g, member);
      const q = m && Array.isArray(m.queued) ? m.queued.find((x) => x && Number(x.upTo) === Number(upTo)) : null;
      if (!q) { noteEarly(gid, member, upTo, 'restashed'); return; }
      if (q.state !== 'restashed') { q.state = 'restashed'; q.backAt = now(); moved = true; }
    });
    if (moved) announce([gid]);
  }
  // the ladder tells what became of a queued wake (src/server/queued-wakes.js) — a turn carried it, or it came back
  // round 3: a `queued` row whose ladder record is GONE (msg-queued.json lost) settles at that conversation's next turn start
  // (its frame ran then, or before) — found once at boot, never «waiting for the current turn» for good
  const orphanQueued = new Map();   // cid -> [{gid, upTo}]
  const scanOrphanQueued = () => {
  orphanQueued.clear();   // B-f276: ONE scan's answer (run at create and again on read) — never a row twice
  // B-f276: the queued-wakes ladder unread (msg-queued.json held) answers no entries — never «every queued row carried»
  if (deliver && typeof deliver.queuedFileState === 'function' && (deliver.queuedFileState() || {}).unread) return;
  try {
    const held = new Set(((deliver && typeof deliver.queuedEntries === 'function' ? deliver.queuedEntries() : []) || []).filter((e) => e.mark).map((e) => `${e.mark.gid}|${e.cid}|${e.mark.upTo}`));
    for (const g of Object.values(all() || {})) for (const m of (g && g.members) || []) for (const q of (m && Array.isArray(m.queued) ? m.queued : [])) {
      if (q && q.state === 'queued' && !held.has(`${g.id}|${m.member}|${Number(q.upTo)}`)) { const l = orphanQueued.get(m.member) || []; l.push({ gid: g.id, upTo: Number(q.upTo) }); orphanQueued.set(m.member, l); }
    }
  } catch (e) { (log.warn || log.log || (() => {})).call(log, '[groups] the queued-row boot check failed:', e.message); }
  };
  scanOrphanQueued();
  if (groupsPaused()) store.whenRead?.(GROUP_FAMILIES, scanOrphanQueued);   // B-f276: a held groups.json found none — the scan runs again once it reads
  try { deliver?.onQueuedFileState?.((st) => { if (st && !st.unread) scanOrphanQueued(); }); } catch { }   // …and once the ladder reads
  try {
    deliver?.onTurnStarted?.((cid) => { const l = orphanQueued.get(cid); if (!l) return; orphanQueued.delete(cid); for (const o of l) markCarried(o.gid, cid, o.upTo).catch(() => { }); });
  } catch { }
  try {
    deliver?.onCarried?.((cid, e) => { if (e && e.mark) markCarried(e.mark.gid, cid, e.mark.upTo).catch((err) => (log.warn || log.log || (() => {})).call(log, '[groups] queued wake carry failed:', err.message)); });
    deliver?.onHandedBack?.((cid, e) => { if (e && e.mark) markRestashed(e.mark.gid, cid, e.mark.upTo).catch((err) => (log.warn || log.log || (() => {})).call(log, '[groups] queued wake hand-back failed:', err.message)); });
    deliver?.onQueuedDropped?.((cid, e) => { if (e && e.mark) markDropped(e.mark.gid, cid, e.mark.upTo).catch((err) => (log.warn || log.log || (() => {})).call(log, '[groups] queued wake drop failed:', err.message)); });
  } catch { }

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
  async function wake(gid, member, rec, why, awaitAt = null, { pressed = null } = {}) {
    const g = getGroup(gid);
    if (!g) return { ok: false, reason: 'group gone' };
    const flight = gid + '|' + member;
    wakesInFlight.set(flight, (wakesInFlight.get(flight) || 0) + 1);
    try { return await wakeOnce(g, gid, member, rec, why, awaitAt, { pressed }); } finally {
      const n = (wakesInFlight.get(flight) || 1) - 1;
      if (n > 0) wakesInFlight.set(flight, n); else wakesInFlight.delete(flight);
    }
  }
  /** «REACHES», THE ONE READING (acceptance r7, P25, measured: four roads read it four ways — a wake that was not about the
   *  await moved a mention-mode asker's marker past its awaited reply and the settle counted it carried, so the reply was
   *  lost with nobody told; a fall told the sender «it will not reach them» about a reply the next turn hands). A record
   *  reaches this member's report when B-a354's rule hands it (channel-groups' own) OR it is a reply to what the member awaited
   *  that no wake carried yet (`answeredAt`, no `wokeAt`; r5, P20), or the reply the caller's own await wakes it for
   *  (`own = {from, to}`: its row is written after the wake). Not a member / muted: nothing. EVERY road reads it — a wake's
   *  report, the owed frame, the next turn's report, the marker's reading, the fall's words, wakeAll's next-turn promise, the
   *  pending strip, the unread count, an ended pair's count — so what a report hands and what a sender is told are one fact.
   *  → a predicate over records. */
  function reachFor(g, member, own = null) {
    const m = g && G.memberOf(g, member);
    if (!m || m.notify === 'mute') return () => false;
    const spans = Object.values(g.awaits || {}).filter((e) => e && e.by === member && Number.isFinite(e.answeredAt) && !Number.isFinite(e.wokeAt)).map((e) => [Number(e.at), Number(e.answeredAt)]);
    if (own && Number.isFinite(Number(own.from))) spans.push([Number(own.from), Number(own.to)]);
    return (r) => !!r && (G.reachesReport(g, member, r) || spans.some(([from, to]) => Number(r.at) > from && Number(r.at) <= to));
  }
  const isMessage = (r) => !!r && ((r.raw && r.raw.kind) || 'message') === 'message';   // a record with no kind is an old message
  /** WHAT HAS NOT BEEN HANDED TO `cid` — lane queued-is-not-woke laws 2 + 3, SHAPE C (主开发 2026-11-13 13:35Z, 13:42Z). Asked
   *  of the hub's own record AT THIS MOMENT and nothing kept: each group's log (the fold, read off the loop) and the member's
   *  marks, through the SAME reach the next report uses (reportsForTurn → reportFor with `also: reachFor` — mute reaches
   *  nothing, `mention` only what @-names it or an awaited reply) — unreceivedFor, THE one record filter — never its own; plus each frame groups.json
   *  holds behind its turn (queued / restashed: its records in (from, upTo]). THE GATE (law 1 as ruled): a group is read only
   *  when its mark — or a held frame's start — is older than `olderThan` with records after it (persisted facts: a restart
   *  changes nothing). An ended conversation, an archived group or a closed pair waits for nothing. At the read's bound (the
   *  tail does not reach back to the mark or a frame's start) no count is said and the oldest is the oldest it SAW
   *  (`atLeast`) — the reading's OWN bound: the newest WAIT_READ records or WAIT_READ_BYTES, a suite may widen it.
   *  → {groups: [{gid, name, n (null at the bound), oldest, atLeast, senders: {cid: {n, oldest}}}], reads} */
  async function readWaiting(cid, { now: t = now(), olderThan = 0, limit = WAIT_READ, maxBytes = WAIT_READ_BYTES } = {}) {
    const out = { groups: [], reads: 0 };
    if (!G.isCid(cid) || endedOf(cid)) return out;
    const cut = t - olderThan;
    const live = (g) => g && !g.archivedAt && !g.closed;
    const floorOf = (m) => Math.max(Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : -Infinity, Number(m.joinedAt) - 1);
    const heldOf = (m) => (Array.isArray(m.queued) ? m.queued : []).filter((q) => q && (q.state === 'queued' || q.state === 'restashed') && Number.isFinite(Number(q.upTo)));
    const fromOf = (m, q) => Math.max(Number.isFinite(q.from) ? q.from : -Infinity, Number(m.joinedAt) - 1);
    for (const g0 of Object.values(all())) {
      const m0 = live(g0) ? G.memberOf(g0, cid) : null;
      if (!m0 || m0.notify === 'mute') continue;
      const fl0 = floorOf(m0);
      if (!((Number(g0.lastAt) > fl0 && fl0 <= cut) || heldOf(m0).some((q) => fromOf(m0, q) <= cut))) continue;
      out.reads++; waitReads++;
      const { records: tail, whole: all } = await readFoldedAsync(g0.id, { limit, maxBytes, windowBytes: WAIT_READ_WINDOW });
      await new Promise((r) => setImmediate(r));   // the sweep yields to the loop between reads (主开发 15:30Z: no hold over 20 ms)
      // after the read: the group and the marks as they are NOW (a report may have landed while it read)
      const g = getGroup(g0.id), m = live(g) ? G.memberOf(g, cid) : null;
      if (!m || m.notify === 'mute' || endedOf(cid)) continue;
      const take = unreceivedFor(g, cid);   // THE one record filter (messages; for `mention`, reachFor — the next report's reach, an awaited reply included); mute never gets here
      const mine = (r) => !!r && !!r.author && r.author.id !== cid && take(r);
      const fl = floorOf(m), held = heldOf(m);
      const first = tail.length ? Number(tail[0].at) : Infinity;
      const whole = all || first <= Math.min(fl, ...held.map((q) => fromOf(m, q)));
      const recs = tail.filter((r) => mine(r) && (Number(r.at) > fl || held.some((q) => Number(r.at) > fromOf(m, q) && Number(r.at) <= Number(q.upTo))));
      if (!recs.length) continue;
      const senders = {};
      for (const r of recs) { const s = senders[r.author.id] || (senders[r.author.id] = { n: 0, oldest: Number(r.at) }); s.n++; if (Number(r.at) < s.oldest) s.oldest = Number(r.at); }
      if (!whole) for (const s of Object.values(senders)) s.n = null;
      out.groups.push({ gid: g.id, name: g.name, n: whole ? recs.length : null, oldest: Math.min(...recs.map((r) => Number(r.at))), atLeast: !whole, senders });
    }
    return out;
  }
  let waitReads = 0;   // the reading's group-log reads (the suites' pin: what a sweep costs)
  // THE READING'S OWN BOUND (主开发 15:30Z, item 5 — the loop stays clear: no single hold over 20 ms): the newest WAIT_READ records
  // or WAIT_READ_BYTES of a log, whichever comes first, in WAIT_READ_WINDOW slices — far smaller than the report's LOG_READ.
  // Beyond it: no count, «since at least» the oldest it saw.
  const WAIT_READ = 200, WAIT_READ_BYTES = 256 * 1024, WAIT_READ_WINDOW = 64 * 1024;
  /** «NEVER RECEIVED», THE ONE COUNT (acceptance r8, F3, measured: the ended pair's count read «reaches» and called a
   *  muted member's 3 undelivered messages 0, while its unread count said 3): every record for a mode that hands everything
   *  (always / next-turn) or nothing (mute — none of them was received); for `mention`, what reaches it (reachFor). The
   *  unread count and an ended pair's «N messages were not delivered» both read it. → a predicate over records.
   *  …AND WHICH RECORDS COUNT (acceptance r9, F3′, measured: one rename after the marker ⇒ unread 4, «3 not delivered»):
   *  the MESSAGES people wrote. A system row (create, invite, kick, leave, rename, archive, closed / ended, a clear's
   *  replacement) is the group's own fact: it stays in the log and rides the report, it is never unread and never «not
   *  delivered». The filter lives HERE only; neither reader keeps its own (the census). */
  function unreceivedFor(g, who) {
    const mode = modeOf(g, who);
    const reach = mode === 'mention' ? reachFor(g, who) : null;
    return (r) => isMessage(r) && (!reach || reach(r));
  }
  /** what the unread memo and the strip's memo must also key on: the awaited replies that reach a `mention` member (they change with no new record) */
  const reachSig = (g, who) => Object.values(g.awaits || {}).filter((e) => e && e.by === who && Number.isFinite(e.answeredAt) && !Number.isFinite(e.wokeAt)).map((e) => `${e.at}:${e.answeredAt}`).join(',');
  async function wakeOnce(g, gid, member, rec, why, awaitAt = null, { pressed = null } = {}) {
    const lead = `${why === 'await' || why === 'both' ? G.awaitLead(awaitAt, why) : WAKE_LEAD[why] || 'You were woken'} — group messages (vibespace-msg):`;
    const rep = G.reportFor(g, readLog(gid), member, { budget: WAKE_BUDGET, lead, also: reachFor(g, member, awaitAt != null ? { from: awaitAt, to: rec.at } : null) });   // an awaited reply reaches the asker whatever its mode, on every road and whatever this wake is about (acceptance r4, P14; r7, P25)
    if (!rep || rep.fits === false) return { ok: false, reason: rep ? 'the report does not fit a wake' : 'nothing to deliver' };
    let r, wcText = null;   // wcText: the wake card's text — a stopped member's owed wake carries the SAME card (piece 7)
    if (!deliver || typeof deliver.deliverToConversation !== 'function') r = { ok: false, reason: 'no delivery ladder wired' };
    else {
      try {
        // `group` (lane group-report-card): the ladder's own card after a successful post is the GROUP card — the
        // sender → the group, the message that woke it — keyed like a report's (a later re-report renders no second)
        const self = !!(rec.author && rec.author.id === G.OWNER);
        const wc = wakeCardOf(rep, rec);
        wcText = wc.text;
        // lane owner-press-attended: the USER's own post (G.OWNER — only routes/channels.js's cookie-only owner routes
        // author it, the wake count echoed back first) is an ATTENDED turn; an agent's post stays peer-message. Both
        // literals spelled (the spend census reads them); ONE ladder site. r2: and only with its door's PRESS (`pressed`,
        // write-origin isPress) — an owner record woken later by nobody's press (a timer) is peer-message
        const paid = self && isPress(pressed) ? { spendReason: 'owner-group-wake' } : { spendReason: 'peer-message' };
        r = await deliver.deliverToConversation(member, rep.text, { kind: 'peer', ...paid, wakeMark: { gid, upTo: rep.upTo }, fromName: `${displayName(g, rec.author.id)} · ${g.name}`, cardText: wc.text, group: { id: g.id, name: g.name, at: rec.at, from: self ? null : displayName(g, rec.author.id), self, via: 'wake', ...wc.authors } });
      } catch (e) { r = { ok: false, reason: 'delivery threw: ' + (e && e.message) }; }
    }
    try { store.audit({ kind: 'group-wake', groupId: gid, member, why, ok: !!(r && r.ok), lane: (r && r.lane) || null, reason: r && !r.ok ? r.reason || null : null, refused: (r && r.refused) || null, spendWhy: (r && r.why) || null }); } catch { }
    if (r && r.ok && r.queued) { await markQueued(gid, member, rep.upTo, { since: r.since }); return { ok: true, queued: true, since: Number.isFinite(r.since) ? r.since : null, lane: r.lane || null }; }   // law 1: waiting, not woke
    if (r && r.ok) { await markReported(gid, member, rep.upTo); return { ok: true, lane: r.lane || null, ...(r.intoTurn ? { intoTurn: true } : {}) }; }
    (log.info || log.log || (() => {})).call(log, `[groups] wake of ${member.slice(0, 8)} in ${gid} (${why}) not delivered: ${(r && r.reason) || 'refused'} — it rides that member's next report`);
    return { ok: false, reason: (r && r.reason) || 'undelivered', refused: (r && r.refused) || null, ...(r && r.unreachable ? { unreachable: true } : {}), ...(r && r.notRunning ? { notRunning: true, cardText: wcText } : {}) };
  }
  /** A WAKE OF A STOPPED MEMBER (the manager design's piece 7): the ladder answered «not running». A wake that names this
   *  member ALONE (an agent's `send --wake` into a pair, an @name of one member, a dispatch) is OWED: the conversation goes
   *  to the hub's one resume line (conversation-deliver `parkEndedWake`, producer 'groups', the pace's own reason
   *  'peer-message') and the group report rides the turn its hand-over starts — the log stays the one store, the park holds
   *  no words. A fan-out (a whole group's --wake, «always», an invite) only waits, said to the sender. The
   *  OWNER's own post is never owed here: a person's page offers its own resume (a press never waits on the line).
   *  → {parked, id} | {code} (it only waits: why) | null (not judged: the owner, or no park wired) */
  function endedWakeOf(g, member, rec, why, cardText = null) {
    const from = rec && rec.author && rec.author.id;
    if (!from || from === G.OWNER) return null;
    const named = (Array.isArray(rec.mentions) ? rec.mentions : []).filter((x) => x && x.id && x.id !== from).length;
    const v = DW.owesWake({ producer: 'groups', wake: true, addressees: why === 'mention' || why === 'both' ? named : null });
    if (!v.owe) return { code: v.code };
    if (!deliver || typeof deliver.parkEndedWake !== 'function') return null;
    try {
      const p = deliver.parkEndedWake(member, { producer: OWED, spendReason: 'peer-message', kind: 'peer', fromName: `${displayName(g, rec.author.id)} · ${g.name}`, cardText: cardText || rec.text, sender: from, reason: 'a message with a wake', meta: { gid: g.id, at: rec.at, why } });
      return p && p.parked ? p : null;
    } catch (e) { (log.warn || log.log || (() => {})).call(log, `[groups] the wake owed to stopped ${String(member).slice(0, 8)} in ${g.id} could not be parked: ${(e && e.message) || e} — it rides that member's next report`); return null; }
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
      if (groupsPaused()) return { reason: 'store-blocked', why: groupsPausedWords(), rule: 'paused', retryInMs: 60_000 };   // B-f276: no grant over floors nobody read — parked, asked again
      const at = paceClock();
      const live0 = store.pace.live();
      // r3: a stamp in the FUTURE is not a wake (a backward clock step, a
      // clock-ahead boot's ledger) — the prune drops it; say so once, here
      const fut = G.paceFuture(live0, at);
      if (fut) (log.warn || log.log || (() => {})).call(log, `[groups] wake-pace.json held ${fut} stamp(s) in the future (the clock stepped back, or a clock-ahead boot wrote them) — dropped; they were not wakes`);
      const st = G.prunePace(live0, at);
      const v = G.paceVerdict(st, { sender, member, at });
      if (!v.ok) { store.pace.set(st); return { reason: v.reason, why: v.why, rule: v.rule, retryInMs: v.retryInMs }; }
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
    mayWake.sender = sender;   // lane paced-wake-retry: a producer that parks a refused wake names whose ledger re-judges it
    /** THE HARD BOUND (the owner's rule): a paced wake past its 60 min goes whatever the verdict; the slot is stamped all the same, so the next wake reads a true ledger */
    mayWake.force = (member) => {
      if (groupsPaused()) return { ok: false, reason: 'store-blocked', why: groupsPausedWords(), rule: 'paused', retryInMs: 60_000 };   // B-f276: no grant past the bound over floors nobody read — ok:false IS the deliverer's refused force (its read r1 M1)
      const at = paceClock();
      const gr = G.paceGrant(G.prunePace(store.pace.live(), at), { sender, member, at });
      store.pace.set(gr.state);
      tokens.set(member, gr.token);
    };
    return mayWake;
  }
  // ── THE WAKE OWED (lane paced-wake-retry, 2026-11-07 — the owner: «目前 wake 的消息如果被节流排队了，节流时间到了会自动发出吗？…
  // 那这样会不会导致我需要做自动化任务从此卡住了？»). A wake the pace refused used to wait for a turn nothing would start: an
  // unattended chain stalled until a person typed. It is PARKED now (conversation-deliver's retry park): the first
  // retry at the window's end, then the backoff and the 60-min / attempt bounds. THE PARK HOLDS NO WORDS — the group log
  // stays the one store, so a clear reaches what the retry reads, a turn's report that carried the message is what
  // cancels it, and `meta` names only the group, the newest record owed and the senders. ONE entry per (group, member)
  // ⇒ two paced wakes = ONE frame, one wake; the report is rendered when the frame leaves. THE OWNER'S RULE: the intention
  // was a WAKE. It opens a turn at the window's end, at the latest at the park's hard bound; the only earlier end is a turn
  // that carried the words; only the spend gate may refuse it outright (said to the owner by the guard, to the sender here).
  const OWED = 'groups';
  const i18nKey = (s) => s;   // marks a sentence the client says in its own language
  function mergeOwed(a, b) {
    const awaited = (x) => x && (x.why === 'await' || x.why === 'both');
    const lead = awaited(b) ? b : awaited(a) ? a : b;
    return { gid: b.gid, at: Math.max(Number(a.at) || 0, Number(b.at) || 0), fromAt: Math.min(...[a, b].map((x) => Number(x.fromAt ?? x.at)).filter(Number.isFinite)), why: lead.why, awaitAt: lead.awaitAt == null ? null : lead.awaitAt, vids: [...new Set([...(a.vids || []), ...(b.vids || [])])] };
  }
  const blockedBy = (member) => (deliver && typeof deliver.wakeBlock === 'function' ? deliver.wakeBlock(member) : null);   // {cause, why} | null, the park's own gate read for its words
  /** Park the wake `pace` refused → {parked, id, retryAt, retryInMs} | null (no wait was named, or no park is wired: the
   *  caller's words say the message rides the next report, which is then the truth). */
  function parkPaced(gid, member, rec, why, pace, { awaitAt = null, vid = null } = {}) {
    if (!pace || !(Number(pace.retryInMs) > 0) || !deliver || typeof deliver.parkOwedWake !== 'function') return null;
    // THE PACE PARKS ONLY A WAKE THAT COULD FIRE (acceptance r4, P13, measured: a --wake to 30 stopped members parked 22, each fell with its own notice, and two real receipts fell off the sender's stash cap): a target that is not running is answered at once with the truth. The gate is the park's own door (r6, P22); `parked:false` ⇒ null
    try {
      const owed = deliver.parkOwedWake(member, {
        producer: OWED, key: gid, retryInMs: Number(pace.retryInMs), spendReason: 'peer-message', kind: 'peer', sender: rec.author && rec.author.id, reason: pace.rule || pace.reason || 'rate floor',
        text: `A wake VibeSpace held for the pace — vibespace-msg read ${gid}`, meta: { gid, at: rec.at, fromAt: rec.at, why, awaitAt, vids: vid ? [vid] : [] }, merge: mergeOwed,
      });
      return owed && owed.parked ? owed : null;
    } catch (e) { (log.warn || log.log || (() => {})).call(log, `[groups] a paced wake of ${String(member).slice(0, 8)} in ${gid} could not be parked: ${(e && e.message) || e} — it rides that member's next report`); return null; }
  }
  /** an awaited reply's row follows its parked wake (`vids` = the awaits it carries) */
  async function patchAwaits(gid, vids, patch) {
    if (!Array.isArray(vids) || !vids.length) return;
    await store.groups.update((gr) => { const g = gr.groups[gid]; if (g && g.awaits) for (const vid of vids) if (g.awaits[vid]) { const next = { ...g.awaits[vid], ...patch }; for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]; g.awaits[vid] = next; } });
    announce([gid], null, null, { pending: false });
  }
  /** THE WORDS OF THE OWED WAKE, as the frame leaves: the member's pending report (a clear, a rename, a later message all
   *  count), under a lead that says VibeSpace held it for the pace. null = nothing is owed any more. The group sits out
   *  the member's turn reports until `release` (`wakesInFlight`, as a wake on its way does). */
  /** THE ONLY SILENT END IS A REPORT THAT CARRIED THE MESSAGE (acceptance r6, P24, measured: under B-a354 the marker also moves past a record the member's mode does not hand it; an owed wake was cancelled as «carried», posts 0, the sender still held «sent in N s»). THE ONE READING of a marker past an owed record, for the settle and for the frame: null = carried, the silent end; else the fall, said. A sender none of whose records the report handed hears it even when another sender's rode. */
  function owedPastMarker(g, m, e) {
    let j;
    try { j = sendersRide(g, m, e); } catch (err) { (log.warn || log.log || (() => {})).call(log, `[groups] an owed wake's records could not be read (${(err && err.message) || err}): read as carried`); return null; }
    if (j.carried && !j.unread.length) return null;
    if (j.carried) { e.senders = j.unread; e.meta = { ...(e.meta || {}), vids: [] }; }   // the carried half settles as carried: its await rows are not this fall's — only a SENDER's record carries a half (r9, F1′)
    if (!j.span.length) return { fall: 'no report would reach it' };
    return { fall: modeFall(m), fallDetail: { why: 'mode-changed' } };
  }
  const modeFall = (m) => `its notify mode is ${m.notify} now, so it no longer asks for a wake`;
  /** WHICH SENDERS' MESSAGES RIDE — THE ONE PER-SENDER READING (acceptance r6, P24; r8, F1: the frame road read only «does
   *  any record still wake it», so a frame went for one sender's @ and another sender's plain line ended unsaid). The entry's
   *  records in [fromAt, at] — after `since` while the marker has not passed them — each judged by reachFor; a sender none of
   *  whose records reach is `unread`. The marker-moved branch (owedPastMarker) and the frame (owedWords) both read it. */
  function sendersRide(g, m, e, since = null) {
    const meta = e.meta || {};
    const to = Number(meta.at);
    const from = meta.fromAt != null && Number.isFinite(Number(meta.fromAt)) ? Number(meta.fromAt) : to;
    const reach = reachFor(g, m.member);   // the SAME reading every report applies (r7, P25)
    const span = readLog(g.id).filter((r) => r && Number(r.at) >= from && Number(r.at) <= to && (since == null || Number(r.at) > since) && !(r.author && r.author.id === m.member)).map((r) => ({ r, handed: reach(r) }));
    const handed = span.filter((x) => x.handed);
    const by = new Set(handed.map((x) => x.r.author && x.r.author.id));
    const senders = Array.isArray(e.senders) ? e.senders : [];
    const whole = meta.fromAt == null || !senders.length;   // an entry that keeps no span (or names no sender) names no one sender's record: read whole
    const unread = whole ? [] : senders.filter((s) => !by.has(s));
    // THE SENDERS' COVERAGE (acceptance r9, F1′, measured: every sender unread, a NON-sender's @ in the span handed ⇒ «something
    // is handed», the frame went for delta's line alone, alpha kept «sent in N s» and was never told): `carried` = one of
    // THIS ENTRY's senders has a record that rides. A record by someone else carries none of this entry's promise.
    const carried = whole ? handed.length > 0 : unread.length < senders.length;
    return { span, handed, unread, carried };
  }

  function owedWords(cid, e) {
    if (groupsPaused()) return { wait: groupsPausedWords(), held: true };   // B-f276: waits (no attempt, no fall) — never «no longer in that group» over a list nobody read
    const { gid, at, why, awaitAt } = e.meta || {};
    const g = getGroup(gid);
    const m = g && G.memberOf(g, cid);
    // a sender holds «sent in N s»: when the promise cannot be kept, the fall says why (LAW 3, 主开发's answer on P3) — never a silent drop. Only a report that carried the message is a silent end: the promise was kept, better
    if (!m) return { fall: 'it is no longer in that group', fallDetail: { why: 'left' } };
    if (Number(m.reportedUpTo) >= Number(at)) return owedPastMarker(g, m, e);
    const records = readLog(gid);
    // THE VERDICT IS ASKED AGAIN AT THE FRAME (acceptance r2, P3, measured: a member who switched to next-turn after the park was woken and billed, under a lead that said «always»): the member's CURRENT mode decides whether an owed wake still fires, and the lead tells the truth. Any record still owed that wakes it is enough (an @ stands whatever the mode); an awaited reply is the asker's own request, until it mutes the group
    const awaited = why === 'await' || why === 'both';
    let nowWhy = why;
    if (!awaited || m.notify === 'mute') {
      const since = Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : m.joinedAt - 1;
      const stands = records.filter((r) => r && Number(r.at) > since && Number(r.at) <= Number(at)).map((r) => G.wakeVerdict(g, cid, r)).filter((v) => v.wake);
      if (!stands.length) return { fall: modeFall(m), fallDetail: { why: 'mode-changed' } };
      nowWhy = stands[stands.length - 1].why;
    }
    // …AND PER SENDER (r8, F1): a sender none of whose records this frame hands is told now, through the park's door; the frame goes for the rest.
    // NO SENDER RIDES ⇒ NO FRAME (r9, F1′): what the span hands is then only others' records, and each had its own road and
    // verdict (a refusal that named no wait or an undelivered wake: the member's next report, free; a spend refusal: the
    // owner's dial). A frame for them is a billed turn no promise of this entry holds: the entry falls whole, every sender told
    try {
      const j = sendersRide(g, m, e, Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : m.joinedAt - 1);
      if (j.unread.length && !j.carried) return { fall: modeFall(m), fallDetail: { why: 'mode-changed' } };
      if (j.unread.length && deliver && typeof deliver.fellOwedPart === 'function') deliver.fellOwedPart(cid, e, j.unread, modeFall(m), { why: 'mode-changed' });
    } catch (err) { (log.warn || log.log || (() => {})).call(log, `[groups] an owed frame's senders could not be read (${(err && err.message) || err})`); }
    const base = awaited ? G.awaitLead(awaitAt, why) : WAKE_LEAD[nowWhy] || 'You were woken';
    const rep = G.reportFor(g, records, cid, { budget: WAKE_BUDGET, lead: `${base} (VibeSpace held this wake for the wake pace) — group messages (vibespace-msg):`, also: reachFor(g, cid, awaited ? { from: awaitAt, to: at } : null) });
    if (!rep) return { fall: 'no report would reach it' };   // the marker has not passed it, so nothing carried it: never a silent end (acceptance r4, P14)
    if (rep.fits === false) return { fall: 'the report does not fit a wake' };
    const shown = (Array.isArray(rep.lines) ? rep.lines : []).map((x) => x && x.rec).filter(Boolean);
    const rec = records.find((r) => r && Number(r.at) === Number(at)) || shown[shown.length - 1] || null;
    if (!rec) return { fall: 'no report would reach it' };
    const flight = gid + '|' + cid;
    wakesInFlight.set(flight, (wakesInFlight.get(flight) || 0) + 1);
    const self = !!(rec.author && rec.author.id === G.OWNER);
    const wc = wakeCardOf(rep, rec);
    return {
      text: rep.text, kind: 'peer', fromName: `${displayName(g, rec.author.id)} · ${g.name}`, cardText: wc.text,
      group: { id: g.id, name: g.name, at: rec.at, from: self ? null : displayName(g, rec.author.id), self, via: 'wake', ...wc.authors },
      landed: async ({ lane = null } = {}) => {
        try { store.audit({ kind: 'group-wake', groupId: gid, member: cid, why: nowWhy, ok: true, lane, reason: 'paced — sent when the window ended', refused: null, spendWhy: null }); } catch { }
        await markReported(gid, cid, rep.upTo);
        await patchAwaits(gid, e.meta.vids, { wokeAt: now(), why: nowWhy });
      },
      release: () => { const n = (wakesInFlight.get(flight) || 1) - 1; if (n > 0) wakesInFlight.set(flight, n); else wakesInFlight.delete(flight); },
    };
  }
  /** THE CHAIN NEVER STALLS SILENTLY (law 3): the message stays in the log (the member's next report carries it, free) and
   *  the FALL is said — the hub's journal + an audit row + a free notice on the SENDER's next turn (the park files it, on
   *  its not-reachable road). `taken`: the group log is this entry's stash, a stashed copy would arrive twice. */
  function owedFell(cid, e, extra = {}) {
    if (groupsPaused()) { sayGroupsPaused(); return; }   // B-f276 wall: never «it will not reach them» over a list nobody read (the deliverer holds a held wake: it never falls)
    const { gid, why, vids } = e.meta || {};
    const g = getGroup(gid);
    const outcome = G.owedOutcome(extra);
    const said = String(extra.reason || 'not sent');
    // what happens to the message is said as it IS: a member who left, muted, or whose mode no longer takes it reads nothing next turn (a log that cannot be read says the usual: its marker never moved)
    // …through the ONE reading (r7, P25), PER SENDER AND PAST THE MARKER (r8, F2, measured: another sender's handed @ in the same span told the fallen sender «reaches them on their next turn» about a line the marker had passed): only the fallen senders' OWN records the marker has not passed, as the member's next report would hand them
    let reaches = true;
    try {
      const mm = g && G.memberOf(g, cid);
      const to = Number(e.meta && e.meta.at), from = e.meta && e.meta.fromAt != null && Number.isFinite(Number(e.meta.fromAt)) ? Number(e.meta.fromAt) : to;
      const mine = new Set(Array.isArray(e.senders) ? e.senders : []);
      const since = mm ? memberSince(mm) : Infinity;
      const reach = reachFor(g, cid);
      reaches = !!mm && readLog(gid).some((r) => r && Number(r.at) >= from && Number(r.at) <= to && Number(r.at) > since && r.author && mine.has(r.author.id) && reach(r));
    } catch { }
    (log.warn || log.log || (() => {})).call(log, `[groups] the paced wake of ${String(cid).slice(0, 8)} in ${gid} was not sent (${outcome}): ${said} — the message ${reaches ? 'rides that member\'s next report' : 'stays in the group, it will not reach that member'}`);
    try { store.audit({ kind: 'group-wake', groupId: gid, member: cid, why, ok: false, lane: null, reason: said, refused: outcome, spendWhy: extra.kind === 'spend-cap' ? (extra.why || null) : null }); } catch { }
    patchAwaits(gid, vids, { held: outcome }).catch(() => { });
    const name = clipName(inertFrames(g ? displayName(g, cid) : String(cid).slice(0, 8)));
    if ((Array.isArray(e.senders) ? e.senders : []).includes(G.OWNER)) tellOwnerOwedFell(cid, gid, name, g ? clipName(inertFrames(g.name)) : gid, outcome, reaches);
    return {
      taken: true,
      notice: {
        to: (Array.isArray(e.senders) ? e.senders : []).filter((s) => s && s !== G.OWNER && s !== cid),   // the owner has no conversation to tell: the journal + the audit row say it
        why: outcome === 'paced-out' ? outcome : `paced-${outcome}`,   // every one reads under the «held» heading, never «unreachable»
        outcome, name, reaches, command: `${gid}:${Number(e.meta && e.meta.at) || 0}`, where: g ? `group "${clipName(inertFrames(g.name))}"` : null,   // the park folds one sender's falls into ONE line from these
        said,   // the facts: the park's ONE words function writes the line (acceptance r6, P21)
      },
    };
  }
  /** SIGN-IN OFF THE OWNER HOLDS THE PROMISE TOO (acceptance r3, P12): a For-you item. ONE PER GROUP, naming the count (r4, P13: a bucket of 20 is a person's attention), opening the group it names (r5, P19), keeping every fall's truth class (r5, P16) and saying which messages will never be read. A spend refusal's item is the guard's own. */
  const OWNER_FALL_ITEMS_MAX = 5;   // past this many groups at once, the newest item names the others: it never floods the bucket
  function tellOwnerOwedFell(cid, gid, name, group, outcome, reaches) {
    if (outcome === 'spend-cap' || !userTodos || typeof userTodos.add !== 'function') return;
    const KEY = `group-wake-falls:${gid}`;
    let items = [];
    try { items = typeof userTodos.snapshot === 'function' ? (userTodos.snapshot().open || []).filter((i) => i && i.sessionKey === 'channels' && i.action && String(i.action.key || '').startsWith('group-wake-falls:')) : []; } catch { items = []; }
    const mine = items.find((i) => i.action.key === KEY) || null;
    const overflow = !mine && items.length >= OWNER_FALL_ITEMS_MAX ? items[items.length - 1] : null;
    const open = mine || overflow;
    const causeKey = G.fallWhy;   // the ONE table (acceptance r6, P23)
    const prev = open && open.facts && open.facts.owedFalls;
    const f = prev ? JSON.parse(JSON.stringify(prev)) : { group, n: 0, counts: [], names: [], more: 0, mayNames: [], mayMore: 0, unread: [], unreadMore: 0, reach: 0, others: [] };
    if (overflow) {
      const o = f.others.find((r) => r.group === group);
      if (o) o.n++; else f.others.push({ group, n: 1 });
    } else {
      f.n++;
      const row = f.counts.find((r) => r.cause === outcome);   // ROWS: the store's facts keep plain keys only, and a cause has a hyphen
      if (row) row.n++; else f.counts.push({ cause: outcome, n: 1 });
      const maybe = outcome === 'may-have-landed';
      const add = (list, moreKey, who) => { if (!f[list].includes(who)) { if (f[list].length < 5) f[list].push(who); else f[moreKey]++; } };
      add(maybe ? 'mayNames' : 'names', maybe ? 'mayMore' : 'more', name);
      if (reaches) f.reach++; else add('unread', 'unreadMore', name);
    }
    const whoOf = (list, more) => list.join(', ') + (more ? ` +${more}` : '');
    const may = (f.counts.find((r) => r.cause === 'may-have-landed') || { n: 0 }).n;
    const sure = f.n - may;
    const members = whoOf([...f.names, ...f.mayNames], f.more + f.mayMore);
    const note = i18nKey('With sign-in off your wakes are paced like an agent\'s. Each message stays in its group.');
    const lines = [];
    const line = (key, params, english) => lines.push({ key, params, english });
    for (const r of f.counts) line(i18nKey('{n} — {why}'), { n: r.n, why: { key: causeKey(r.cause) } }, `${r.n} — ${causeKey(r.cause)}`);
    if (may) { const w = whoOf(f.mayNames, f.mayMore); line(i18nKey('The wake may already have reached {members}, so waking them again may start a second turn.'), { members: w }, `The wake may already have reached ${w}, so waking them again may start a second turn.`); }
    if (f.unread.length) { const w = whoOf(f.unread, f.unreadMore); const k = f.unread.length + f.unreadMore; line(i18nKey('{n} will not reach them: {members}'), { n: k, members: w }, `${k} will not reach them: ${w}`); }
    if (f.reach) line(i18nKey('{n} reach them on their next turn.'), { n: f.reach }, `${f.reach} reach them on their next turn.`);
    if (f.others.length) { const w = f.others.map((r) => `${r.group} (${r.n})`).join(', '); line(i18nKey('More fell in other groups: {groups}'), { groups: w }, `More fell in other groups: ${w}`); }
    line(note, {}, note);
    const detail = lines.map((l) => l.english).join('\n');
    const single = f.n === 1 && !f.others.length;
    const singleMay = may === 1;
    const title = single
      ? (singleMay ? { key: i18nKey('{member} may have been woken in {group}: the server stopped while the wake was on its way'), params: { member: name, group }, english: `${name} may have been woken in ${group}: the server stopped while the wake was on its way` } : { key: i18nKey('{member} was not woken in {group}: {why}'), params: { member: name, group, why: { key: causeKey(outcome) } }, english: `${name} was not woken in ${group}: ${causeKey(outcome)}` })
      : may && sure ? { key: i18nKey('{may} of your wakes in {group} may have been woken, {sure} not sent: {members}'), params: { may, sure, group: f.group, members }, english: `${may} of your wakes in ${f.group} may have been woken, ${sure} not sent: ${members}` }
        : may ? { key: i18nKey('{n} of your wakes in {group} may have been woken: {members}'), params: { n: may, group: f.group, members }, english: `${may} of your wakes in ${f.group} may have been woken: ${members}` }
          : { key: i18nKey('{n} of your wakes in {group} were not sent: {members}'), params: { n: f.n, group: f.group, members }, english: `${f.n} of your wakes in ${f.group} were not sent: ${members}` };
    const i18n = { text: { key: title.key, params: title.params }, detail: lines.map((l) => ({ key: l.key, params: l.params })), source: { key: i18nKey('Channels') } };
    try {
      if (open && typeof userTodos.redrawItem === 'function') { userTodos.redrawItem((i) => i.id === open.id, { text: title.english, detail, facts: { owedFalls: f }, i18n }); return; }
      userTodos.add('channels', { origin: 'channels', text: title.english, action: { type: 'open-channel', adapterId: G.GROUP_ADAPTER_ID, convId: gid, key: KEY }, facts: { owedFalls: f }, detail, urgency: 'normal', by: 'agent', sessionName: 'Channels', i18n });
    } catch (err) { (log.warn || log.log || (() => {})).call(log, `[groups] the owner's item for a fallen paced wake in ${gid} could not be filed: ${(err && err.message) || err}`); }
  }
  /** a turn's report (or another wake) carried it: no second post, nothing billed; an awaited reply reads «answered» */
  function owedCancelled(cid, e) {
    const { gid, vids } = e.meta || {};
    patchAwaits(gid, vids, { heldAt: undefined, held: undefined }).catch(() => { });
  }
  /** the marker moved past what a parked wake owes ⇒ it rode that report: the park's cancel via 'prompt' (its own road) */
  function settleOwed(gid, member) {
    if (!deliver || typeof deliver.owedEntries !== 'function' || typeof deliver.retryTake !== 'function') return;
    const g = getGroup(gid);
    const m = g && G.memberOf(g, member);
    if (!m) return;
    const covered = deliver.owedEntries(member, OWED).filter((e) => e.meta && e.meta.gid === gid && Number(m.reportedUpTo) >= Number(e.meta.at));
    const rode = covered.filter((e) => { const end = owedPastMarker(g, m, e); if (end && typeof deliver.fellOwed === 'function') { deliver.fellOwed(member, e, end.fall, end.fallDetail || {}); return false; } return true; });
    if (rode.length) deliver.retryTake(member, rode, { via: 'prompt' });
    // a report that carried an awaited reply settles its record: «held» would be a lie now (acceptance r5, P20)
    const carried = Object.entries(g.awaits || {}).filter(([, a]) => a && a.by === member && Number.isFinite(a.heldAt) && !Number.isFinite(a.wokeAt) && Number(m.reportedUpTo) >= Number(a.answeredAt)).map(([vid]) => vid);
    if (carried.length) patchAwaits(gid, carried, { heldAt: undefined, held: undefined }).catch(() => { });
  }
  if (deliver && typeof deliver.registerOwedWake === 'function') deliver.registerOwedWake(OWED, { held: () => groupsPaused(), render: owedWords, fell: owedFell, cancelled: owedCancelled, merge: mergeOwed });   // B-f276 1c (its read r1 M2): HELD while a group family is — set aside, no attempt, no fall
  if (deliver && typeof deliver.registerWakePacer === 'function') deliver.registerWakePacer(Object.assign((sender) => pacerFor(sender), { held: () => groupsPaused() }));   // B-f276 1c (M2): the pace's own files held ⇒ every paced wake aside (no pace asked, no force)
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
   *  A floored wake is not billed, is journaled, and is PARKED for the window's
   *  end (lane paced-wake-retry, `parkPaced`); only a refusal that names no wait
   *  leaves the message to that member's next report. */
  async function wakeAll(gid, rec, candidates, mayWake = null, { pressed = null } = {}) {
    const woke = [], refused = [], later = [], queued = [];
    const waitsWhy = new Map();   // a refused stopped member → why its wake only waits (piece 7)
    const g0 = getGroup(gid);
    for (const m of candidates) {
      const g = getGroup(gid) || g0;
      const v = G.wakeVerdict(g, m, rec);
      const name = displayName(g, m);
      if (!v.wake) { if (v.why !== 'mute' && v.why !== 'own-message' && v.why !== 'not-member' && reachFor(g, m)(rec)) later.push({ member: m, name }); continue; }   // verify r1 D3: never promise a `mention` member a next turn it is not handed (B-a354)
      const pace = typeof mayWake === 'function' ? mayWake(m) : true;   // reserves the pace slot when it grants
      if (pace !== true) {
        const owed = parkPaced(gid, m, rec, v.why, pace);
        const stopped = !owed && pace && pace.rule ? blockedBy(m) : null;
        const reason = owed ? G.pacedReason(owed.retryInMs, pace.rule) : stopped ? G.blockedReason(stopped.why, pace.rule) : pace && pace.rule ? G.unparkedReason(pace.rule) : (pace && pace.reason) || 'rate floor';
        try { store.audit({ kind: 'group-wake', groupId: gid, member: m, why: v.why, ok: false, lane: null, reason, refused: 'rate-floor', spendWhy: null }); } catch { }
        refused.push({ member: m, name, why: v.why, reason, refused: 'rate-floor', ...(owed ? { parked: true, retryInMs: owed.retryInMs, retryAt: owed.retryAt } : {}) });
        continue;
      }
      const r = await wake(gid, m, rec, v.why, null, { pressed });
      if (r.ok && r.queued) queued.push({ member: m, name, why: v.why, lane: r.lane, since: r.since });   // law 1: behind its running turn
      else if (r.ok) woke.push({ member: m, name, why: v.why, lane: r.lane, ...(r.intoTurn ? { intoTurn: true } : {}) });
      else {
        // piece 7: a stopped member a wake names alone is OWED a resume — its pace slot is KEPT (the owed wake is the billed
        // turn) and the sender holds «being resumed» (`parked`: the CLI's «held (not billed yet)» line)
        const owe = r.notRunning ? endedWakeOf(g, m, rec, v.why, r.cardText) : null;
        if (owe && owe.parked) { refused.push({ member: m, name, why: v.why, reason: DW.senderWords(r.unreachable ? 'unreachable' : 'owed'), refused: 'ended', parked: true, owed: true }); continue; }   // B-2566's remainder: the sender is told its MACHINE cannot be reached — never «ended» (the code stays the closed list's own)
        // not billed ⇒ the pace slot goes back (r2: a refused wake used to
        // floor the next legitimate one with words that said a turn was billed)
        if (typeof mayWake === 'function' && typeof mayWake.refund === 'function') { try { mayWake.refund(m); } catch { } }
        const x = { member: m, name, why: v.why, reason: r.reason, refused: r.refused || null };
        if (owe && owe.code) waitsWhy.set(x, owe.code);
        refused.push(x);
      }
    }
    // …and the stopped members a wake did NOT resume are told why, after the ladder's own words (the design: «k members are
    // ended; it rides their next turn»)
    const fanned = [...waitsWhy].filter(([, c]) => c === 'fan_out').length;
    for (const [x, c] of waitsWhy) if (c === 'fan_out') x.reason = `${x.reason} — ${DW.senderWords(c, { count: fanned })}`;
    return { woke, refused, later, queued };
  }

  // ── the verbs ────────────────────────────────────────────────────────────
  /** Create a group. `by` = a conversation id or the owner; every invitee is
   *  resolved within `by`'s reach (atomic: one miss refuses the whole call);
   *  each invitee gets the invite record (with the context) and is woken as
   *  an invite unless `quiet`. */
  async function createGroup({ by, name, members = [], context = '', quiet = false, mayWake = null, consent = null, pressed = null } = {}) {
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
    let woke = [], refused = [], queued = [];
    for (const rec of invites) { const w = await wakeAll(res.group.id, rec, [rec.raw.member], mayWake, { pressed }); woke = woke.concat(w.woke); refused = refused.concat(w.refused); queued = queued.concat(w.queued); }
    return { ok: true, group: view(getGroup(res.group.id)), woke, refused, queued, quiet: !!quiet };
  }
  function inviteText(g, by, cid, ctx) {
    return `${displayName(g, by)} added ${displayName(g, cid)}${ctx ? ' — ' + ctx : ''}`;
  }

  /** Invite into an existing group (members only; reach checked; a duplicate
   *  is a no-op WITH a word; N invitees = N wakes unless `quiet`). */
  async function invite({ by, group: ref, members = [], context = '', quiet = false, mayWake = null, consent = null, pressed = null } = {}) {
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
    let woke = [], refused = [], queued = [];
    for (const rec of recs) { const w = await wakeAll(res.group.id, rec, [rec.raw.member], mayWake, { pressed }); woke = woke.concat(w.woke); refused = refused.concat(w.refused); queued = queued.concat(w.queued); }
    return { ok: true, group: view(getGroup(res.group.id)), added: recs.map((r) => displayName(res.group, r.raw.member)), already, woke, refused, queued, quiet: !!quiet };
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
  async function post({ group: ref, from, text, wake: wakeEveryone = false, mayWake = null, consent = null, at: atRefs = [], mentions: picked = [], awaitReply: awaits = false, pressed = null } = {}) {
    const given = String(text == null ? '' : text);
    if (!given.trim()) return { ok: false, code: 'bad-request', error: 'an empty message' };
    if (Buffer.byteLength(given, 'utf-8') > TEXT_MAX) return { ok: false, code: 'bad-request', error: 'message too large (16KB cap) — write a file and send its path instead' };
    const rg = resolveGroup(ref, from);
    if (!rg.ok) return rg;
    let rec = null;
    // lane bl-msg B-3e61: the belt in its MESSAGE mode BEFORE the @-scan — a mention's place is read on the words the log keeps (a
    // mask before it moves it), and `masked` = what was masked (the head as written), told to the sender; appendIn's belt is the
    // sink's own and finds nothing more (idempotent)
    const masked = [];
    const mw = memberWords(getGroup(rg.group.id));
    const body = belt.maskForSink(given, { dataDir, message: true, said: masked, mentions: mw });
    const scrubbed = Math.max(0, marksIn(body) - marksIn(given));   // B-4f7f: the spans the scrub changed, said back as a count
    // the owner's @-picker places (start / end on the words as typed) moved by what the belt masked before each — its prefix, masked
    const picks = body === given || !Array.isArray(picked) ? picked : picked.map((x) => {
      const ps = Number(x && x.start), pe = Number(x && x.end);
      if (!Number.isInteger(ps) || !Number.isInteger(pe) || ps < 0 || pe > given.length) return x;
      const d = belt.maskForSink(given.slice(0, ps), { dataDir, message: true, mentions: mw }).length - ps;
      return { ...x, start: ps + d, end: pe + d };
    });
    const res = await store.groups.update((gr) => {
      const g = gr.groups[rg.group.id];
      if (!g || g.archivedAt) return { ok: false, code: 'archived', error: `group "${rg.group.name}" is archived` };
      if (!(from === G.OWNER || G.memberOf(g, from))) return { ok: false, code: 'not-member', error: 'only a member can post' };
      const named = g.members.map((m) => ({ member: m.member, name: displayName(g, m.member) }));
      const scan = G.scanAts(body, named, { explicit: picks });
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
    const w = await wakeAll(res.group.id, rec, others, mayWake, { pressed });
    const aw = await awaitWakes(res.group.id, rec, w, mayWake, !!wakeEveryone, { pressed });
    return { ok: true, group: view(getGroup(res.group.id)), message: rec, masked, scrubbed, woke: w.woke, refused: w.refused, later: w.later, queued: w.queued, awaited: aw };
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
   *  pace refused (a ladder refusal waits for next-turn; a paced one is PARKED, `held: 'paced'`, and its landing stamps
   *  `wokeAt` — lane paced-wake-retry — both said on the record's line). */
  async function awaitWakes(gid, rec, w, mayWake, replyWake, { pressed = null } = {}) {
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
      const made = w.woke.concat(w.queued || []).some((x) => x.member === asker);   // a queued wake carries the reply too (law 1)
      const v = made ? { wake: true, why: replyWake ? 'both' : 'mention' } : G.awaitVerdict(g0, { raw: { kind: 'message', await: e } }, { author: { id: from }, at: rec.at, wake: replyWake }, { entry: e, liveness: livenessNow });
      const patch = { answeredAt: rec.at, verdict: v.why };
      if (v.wake && (v.why === 'await' || v.why === 'both' || v.why === 'mention')) {
        if (made) Object.assign(patch, { wokeAt: now(), why: v.why });
        else {
          const pace = typeof mayWake === 'function' ? mayWake(asker) : true;
          const owed = pace === true ? null : parkPaced(gid, asker, rec, v.why, pace, { awaitAt: e.at, vid });
          const r = pace === true ? await wake(gid, asker, rec, v.why, e.at, { pressed }) : { ok: false, reason: (pace && pace.reason) || 'rate floor', refused: owed ? 'paced' : 'rate-floor' };
          if (r.ok) Object.assign(patch, { wokeAt: now(), why: v.why });
          else {
            if (pace === true && typeof mayWake === 'function' && typeof mayWake.refund === 'function') { try { mayWake.refund(asker); } catch { } }
            const stoppedNow = r.refused === 'paced' ? null : blockedBy(asker);
            Object.assign(patch, { heldAt: now(), held: stoppedNow ? stoppedNow.cause : r.refused || r.reason || 'refused' });
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
    if (groupsPaused()) { sayGroupsPaused(); return groupsPausedAnswer(); }   // B-f276: its first act drops held frames — never over a list nobody read
    try { deliver?.noteConversationEnded?.(cid, why); } catch { }   // lane queued-is-not-woke round 3: its held frames leave at the act, said (never reloaded at every boot)
    if (!G.isCid(cid) || !G.ENDED_WHYS.includes(why)) return { ok: false, closed: [], marked: [] };
    // AN END THAT CHANGES NOTHING WRITES NOTHING AND ANNOUNCES NOTHING (lane groups-sweep-on-change): the ledger already says
    // this end, and no unarchived group would close (a pair) or be told (a multi-member group it was not said in) — no store
    // update (groups.json rewritten), no broadcast (the full list rebuilt for every page)
    {
      const cur = store.groups.live() || {};
      const prev = cur.ended && cur.ended[cid];
      const said = !!(prev && prev.why === why);
      const touches = Object.values(cur.groups || {}).some((g) => g && !g.archivedAt && G.memberOf(g, cid) && (g.pair || !said));
      if (said && !touches) return { ok: true, closed: [], marked: [], unchanged: true };
    }
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
        const take = unreceivedFor(g, cid);   // the unread count's rule (r8, F3): a muted member's messages were not delivered either; its record filter too (r9, F3′)
        const lost = readLog(g.id).filter((r) => r && Number(r.at) > since && !(r.author && r.author.id === cid) && take(r)).length;
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
    if (changed.length) announce(changed, recs);   // an announce names what changed — a ledger row alone changed no group: nothing is sent
    return { ok: true, closed, marked };
  }
  /** The archive was LIFTED (the owner un-archived it): the ledger row goes — its rows wait again (a closed pair stays
   *  closed: a new `send` makes a new pair). */
  async function onConversationRevived(cid) {
    let moved = false;
    { const cur = store.groups.live() || {}; if (!(cur.ended && cur.ended[cid] && cur.ended[cid].why === 'archived')) return false; }   // nothing to lift: nothing written
    await store.groups.update((gr) => { if (gr.ended && gr.ended[cid] && gr.ended[cid].why === 'archived') { delete gr.ended[cid]; moved = true; } });
    if (moved) { const touched = Object.values(all()).filter((g) => !g.archivedAt && G.memberOf(g, cid)).map((g) => g.id); if (touched.length) announce(touched, null, null, { pending: false }); }   // the groups it is in, never the full list for nothing
    return moved;
  }
  /** THE STANDING RULE (boot, after restoreSessions, and every archive): every member of a live group is asked the
   *  wiring's `liveness` — archived / gone ⇒ `onConversationEnded`; a ledger row whose archive was lifted ⇒ revived.
   *  Idempotent (a closed group is never re-logged). Never on the caller's tick, in SWEEP_SLICE_MS slices (lane ci-351-reds). */
  async function sweepEnded() {
    await nextTurn();   // never on the caller's tick (the boot's listen callback)
    const seen = new Set();
    const out = { closed: [], marked: [], revived: [] };
    for (const g of Object.values(all())) for (const m of g.members) seen.add(m.member);
    for (const cid of Object.keys(store.groups.live().ended || {})) seen.add(cid);
    // lane roster-per-pass: ONE judge per sweep — the transcript trees read once (the wiring's forSweep), the roster once
    // per synchronous segment (src/server/roster-pass.js); a reader without forSweep is asked per id as before
    let judge = liveness;
    if (typeof liveness.forSweep === 'function') { try { judge = (await liveness.forSweep()) || liveness; } catch { judge = liveness; } }
    // each id judged right before its act, in seen's order, as before; the ids judged between two awaits (a slice's
    // yield, an act) are ONE synchronous segment and read ONE roster (inPass) — an act's writes are seen by the next
    const ids = [...seen];
    let i = 0, sliceAt = sliceClock();
    const liveGroupsOf = () => {   // the members of the unarchived groups, read once per segment (an act's writes end the segment)
      let inLive = null, inPair = null;
      const fill = () => { inLive = new Set(); inPair = new Set(); for (const g of Object.values(all())) if (!g.archivedAt) for (const m of g.members) { inLive.add(m.member); if (g.pair) inPair.add(m.member); } };
      const has = (cid) => { if (!inLive) fill(); return inLive.has(cid); };
      has.pair = (cid) => { if (!inLive) fill(); return inPair.has(cid); };   // …in an unarchived PAIR (where an end closes the group)
      return has;
    };
    // the act a verdict asks for (the rule as before): archived / gone ⇒ end (unless already said and in no live group);
    // a lifted archive ⇒ revive; else nothing. An end ALREADY SAID (the same why) changes something only in a live PAIR —
    // it closes it; in a live multi-member group onConversationEnded skips it as said — so it is no act there, and a «gone»
    // that changes nothing is never asked again (round 2's small: a gone member that stays in a live multi-member group
    // cost one fresh walk every steady sweep)
    const decide = (cid, lv, hasLiveGroup) => {
      const st = lv && lv.state;
      const e = endedOf(cid);
      if (st === 'archived' || st === 'gone') {
        const hasLive = hasLiveGroup(cid);   // = Object.values(all()).some((g) => !g.archivedAt && G.memberOf(g, cid))
        if (!e || e.why !== st || (hasLive && hasLiveGroup.pair(cid))) return { cid, end: { why: st, at: lv.at || null } };
      } else if (e && e.why === 'archived' && (st === 'running' || st === 'stopped')) return { cid, revive: true };
      return null;
    };
    const nextAct = () => {
      const hasLiveGroup = liveGroupsOf();
      for (; i < ids.length; i++) {
        if (sliceClock() - sliceAt >= SWEEP_SLICE_MS) return { yield: true };
        const cid = ids[i];
        let lv = null;
        try { lv = judge(cid); } catch { lv = null; }
        const act = decide(cid, lv, hasLiveGroup);
        if (act) { i++; return act; }
      }
      return null;
    };
    for (;;) {
      let act = inPass(nextAct);
      if (!act) break;
      if (act.yield) { await nextTurn(); sliceAt = sliceClock(); continue; }
      // round 2 — A «GONE» VERDICT IS TRUE WHEN IT ACTS: the sweep's index is the disk at its start; a gone candidate is
      // asked again (the reader's confirm: the disk and the roster NOW, off the loop) and the act is what THAT answer asks
      if (act.end && act.end.why === 'gone' && typeof judge.confirm === 'function') {
        let lv2 = null;
        try { lv2 = await judge.confirm(act.cid); } catch { lv2 = null; }
        const cid = act.cid;
        act = inPass(() => decide(cid, lv2, liveGroupsOf()));
        if (!act) continue;
      }
      if (act.end) { const r = await onConversationEnded(act.cid, act.end); out.closed.push(...r.closed); out.marked.push(...r.marked); }
      else if (await onConversationRevived(act.cid)) out.revived.push(act.cid);
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
    // fb-f48717393b (主开发 r2235): the refusal NAMES the target and the reason, and says what differs from a target that works: a
    // job posts only into a direct group its owner conversation ALREADY has — `pairs` counts the owner's OPEN direct groups (a
    // conversation's end archives its direct groups, so an ended partner's is not counted once its end is recorded)
    if (!create && !findPair(from, r.cid)) {
      const pairs = Object.values(all()).filter((g) => !g.archivedAt && g.pair && g.pair.includes(from)).length;
      return { ok: false, code: 'job-token', why: 'no-pair', target: { conversationId: r.cid, name: shown }, pairs, error: `no direct group with "${shown}" exists yet, and a job token never creates one — start it from the conversation that owns this job (vibespace-msg send "${shown}" "…"), then the job can post into it` };
    }
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
        const date = e.at ? OF.day(e.at) : 'an earlier day';
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
      if (fresh.some((r) => Number(r.at) === Number(g.lastAt))) { g.lastText = RC.CLEARED_TEXT; g.lastCleared = true; g.lastRaw = null; }
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
      try { noteClearedNeedles(gid, out.cleared.map((vid) => found.get(vid)).filter(Boolean)); } catch { heldNeedles.delete(gid); }   // B-b291: the set grows without a read
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
  /** originalsOf's ASYNC twin (B-b291, the reader's F4): the search index's set at a boot is read OFF THE LOOP — the
   *  store's async tail in 64 KB windows; only the originals `vids` names are kept, and only until their forms are taken. */
  async function originalsOfAsync(gid, vids) {
    const want = new Set((Array.isArray(vids) ? vids : [vids]).map(String));
    const raw = typeof store.readTailAsync === 'function' ? await store.readTailAsync(A, gid, { limit: 1e7, windowBytes: 64 * 1024 }) : { records: store.readTail(A, gid, { limit: 1e7 }) };
    const byId = new Map((raw.records || []).filter((r) => r && want.has(String(r.vendorId)) && !RC.isReplacement(r)).map((r) => [String(r.vendorId), r]));
    return new Map([...want].map((v) => [v, byId.get(v) || null]));
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
  // gid → {n: the index's size when read, recs: the witnesses only ({text: first 40 code points}, of every form a copy writes),
  // keys: the cleared records' card keys, wholes: digests of each whole form ({h, n}) — never the records' words (B-b291)
  const heldNeedles = new Map();
  const PARTIAL_RETRY_MS = 10 * 60 * 1000;   // a set a log read could not complete is read again after this
  const foldWs = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const wholeDigest = (f) => crypto.createHash('sha256').update(f).digest('base64').slice(0, 22);
  /** B-b291 (+ the reader's F3): the forms a cleared record's words take in a copy — its own bytes, a report line's
   *  (G.reportWords: folded, cut, belted — a control character is a space there, a format character gone) and a card's
   *  (GC.normalizeCard: control characters out, TEXT_MAX) — each folded; their witnesses and whole digests. */
  function clearedForms(gid, r) {
    const raw = String((r && r.text) || '');
    const card = GC.normalizeCard({ group: { id: gid, at: Number(r && r.at) || 1 }, text: raw });
    const forms = [...new Set([raw, G.reportWords(raw), card ? card.text : ''].map(foldWs).filter(Boolean))];
    return { w: [...new Set(forms.map((f) => RC.clearWitness(f)))], h: forms.map((f) => ({ h: wholeDigest(f), n: f.length })) };
  }
  function needlesOf(gid, recs, n, partial) {
    const forms = recs.map((r) => clearedForms(gid, r));
    return { n, partial, at: now(), recs: [...new Set(forms.flatMap((f) => f.w))].map((text) => ({ text })), keys: recs.map((r) => `${gid}:${Number(r.at)}`), wholes: forms.flatMap((f) => f.h) };
  }
  const clearedVids = (g) => (g && g.cleared && typeof g.cleared === 'object' ? Object.keys(g.cleared).slice(0, REPLACEMENT_READ_MAX) : []);
  const needlesFresh = (c, vids) => !!c && c.n === vids.length && !(c.partial && now() - c.at > PARTIAL_RETRY_MS);
  /** A group's cleared witnesses (+ the cards' keys `<group>:<record instant>` + the whole digests), read from the log once
   *  per size of its index (a set missing a record — a read that failed — is read again after PARTIAL_RETRY_MS). */
  function clearedNeedles(gid, vids) {
    let c = heldNeedles.get(gid);
    if (!needlesFresh(c, vids)) { const recs = [...originalsOf(gid, vids).values()].filter(Boolean); c = needlesOf(gid, recs, vids.length, recs.length < vids.length); heldNeedles.set(gid, c); }
    return c;
  }
  /** THE CLEAR'S OWN RECORDS grow the set without a read (the reader's F4: a group past 8 clears read its whole log at
   *  every later clear); a set that was not whole before is dropped (the next ask reads it). */
  function noteClearedNeedles(gid, recs) {
    const vids = clearedVids(all()[gid]);
    const c = heldNeedles.get(gid) || (vids.length === recs.length ? { n: 0, partial: false, recs: [], keys: [], wholes: [] } : null);
    if (!c || c.partial || c.n + recs.length !== vids.length) { heldNeedles.delete(gid); return; }
    const add = needlesOf(gid, recs, vids.length, false);
    heldNeedles.set(gid, { ...add, recs: [...new Map([...c.recs, ...add.recs].map((x) => [x.text, x])).values()], keys: [...c.keys, ...add.keys], wholes: [...c.wholes, ...add.wholes] });
  }
  function judgeHeldEntry(e) {
    if (!e || typeof e.text !== 'string' || !e.text.includes('(')) return null;
    if (groupsPaused()) return { keep: true };   // B-f276 A3 (M4): which lines were cleared cannot be read now — kept until it can (the deliverer judges it again at every read)
    let out = null;
    for (const [gid, g] of Object.entries(all())) {
      const vids = clearedVids(g);
      if (!vids.length || !e.text.includes(`(${gid})`)) continue;
      const c = clearedNeedles(gid, vids);
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
    const text = RC.redactWitnessLines(e.text, recs.map((r) => RC.clearWitness(r && r.text)));
    return text === null ? null : { text };
  }
  /** B-b291: WHAT THE SEARCH INDEX MAY NOT HOLD — per group whose cleared index is not empty (`gid`: that group only):
   *  the cleared records' card keys and their witnesses (the ladder judge's, cached with it). Words leave this engine
   *  only as witnesses, never as records; the index keeps them in memory, never on its disk. */
  const copyOf = (c) => ({ keys: c.keys.slice(), witnesses: c.recs.map((r) => r.text), wholes: c.wholes.map((x) => ({ ...x })) });
  function clearedCopies(gid = null, { cachedOnly = false } = {}) {
    const out = {};
    for (const [id, g] of Object.entries(all())) {
      if (gid && id !== gid) continue;
      const vids = clearedVids(g);
      if (!vids.length) continue;
      const c = cachedOnly ? (needlesFresh(heldNeedles.get(id), vids) ? heldNeedles.get(id) : null) : clearedNeedles(id, vids);
      if (c) out[id] = copyOf(c);
    }
    return out;
  }
  /** The whole set with no synchronous log read — what a starting search worker is handed (one group at a time) →
   *  {groups, partial}: a group whose log could not be read is named in `partial` and never cached (asked again). */
  async function clearedCopiesAsync() {
    const out = {}, partial = [];
    for (const [id, g] of Object.entries(all())) {
      const vids = clearedVids(g);
      if (!vids.length) continue;
      let c = heldNeedles.get(id);
      if (!needlesFresh(c, vids)) {
        let recs;
        try { recs = [...(await originalsOfAsync(id, vids)).values()].filter(Boolean); } catch (e) { log.warn && log.warn(`[groups] a cleared group's log was not read (${id}): ${e && e.message}`); partial.push(id); continue; } // never cached: the ladder's judge and the next ask read it again
        c = needlesOf(id, recs, vids.length, recs.length < vids.length); heldNeedles.set(id, c);
      }
      out[id] = copyOf(c);
    }
    return { groups: out, partial };
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
  function listFor(cid) { return inPass(() => listForNow(cid)); }
  function listForNow(cid) {
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
    if (groupsPaused()) return { text: '', marks: [], cards: [] };   // B-f276 A3 (r566 #6): nothing while paused — the reports wait, no marker moves; the first turn after the lift carries them once
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
    for (const g of Object.values(all())) { const m = G.memberOf(g, cid); if (m) parts.push(`${g.id}:${Number(g.lastAt) || 0}:${memberSince(m)}:${m.notify}:${m.notify === 'mention' ? reachSig(g, cid) : ''}`); }   // the awaited rows too (r8, U1): an awaited reply's stamp moves no lastAt
    return parts.join('|');
  }
  function pendingOf(cid) {
    const out = [];
    for (const g of Object.values(all())) {
      const m = G.memberOf(g, cid);
      if (!m || m.notify === 'mute' || g.closed) continue;   // lane pair-group-fate: a CLOSED pair's entries are nobody's to wait for
      const since = memberSince(m);
      if (!((Number(g.lastAt) || 0) > since)) continue;
      const reach = reachFor(g, cid);   // the strip waits for what the report hands, an awaited reply included (r7, P25)
      for (const r of readLog(g.id)) {
        if (!r || !(Number(r.at) > since) || (r.author && r.author.id === cid) || ((r.raw && r.raw.kind) || 'message') !== 'message' || !reach(r)) continue;   // B-a354: a `mention` member waits only for what @mentions it
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
      const rep = G.reportFor(g, readLog(g.id), cid, { budget: Math.min(G.REPORT_BUDGET, room), also: reachFor(g, cid) });
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

  // warm the unread memo off the boot path (B-b17f: at 300 groups × 2 000 records the old warm-up held the loop 80–100 ms
  // per turn for 8 s at every start — four groups per turn, each log read in full once for the owner and once per member).
  // Now ONE read per group, through the store's ASYNC tail (WARM_WINDOW_BYTES windows, each parsed in its own turn), shared
  // by the owner and every member; a group is counted only if nothing landed in it during the read (its lastAt and its
  // cleared index unchanged) — else the next reader counts it, as before the warm-up reached it. A turn between groups.
  (function warm() {
    const turn = () => new Promise((r) => { const h = setImmediate(r); if (h && h.unref) h.unref(); });
    const whos = (g) => [[G.OWNER, ownerReadOf(g.id)], ...g.members.map((m) => [m.member, memberSince(m)])];
    const clearedN = (g) => (g.cleared && typeof g.cleared === 'object' ? Object.keys(g.cleared).length : 0);
    // a group is counted from its read only if nothing landed in it during the read (its lastAt and cleared index unchanged)
    const countFrom = (id, records, lastAt, cl) => { const now2 = getGroup(id); if (!now2 || (Number(now2.lastAt) || 0) !== lastAt || clearedN(now2) !== cl) return false; for (const [who, since] of whos(now2)) unreadFor(now2, who, since, records); return true; };
    const STUCK = Symbol('stuck');
    const bounded = (rd) => new Promise((resolve, reject) => { const t = setTimeout(() => resolve(STUCK), warmReadBoundMs); if (t && t.unref) t.unref(); rd.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); }); });
    // should 1: the read past its bound — said ONCE by name; the group answers «not counted yet» until its read lands, then it is
    // counted and the list said (a read that fails at last, or a record that landed meanwhile: the next reader counts it, as before)
    const stuck = (id, rd, lastAt, cl) => {
      stuckIds.add(id);
      try { log.warn && log.warn(`[groups] the boot warm-up could not read the log of group ${id} within ${Math.round(warmReadBoundMs / 1000)} s — its unread counts say «not counted yet» until the read lands; the other groups go on`); } catch { }
      rd.then((v) => { stuckIds.delete(id); countFrom(id, v.records, lastAt, cl); }, () => { stuckIds.delete(id); })
        .then(() => { if (coldAsked.has(id) && !(coldIds && coldIds.size)) { coldAsked.delete(id); announce([id], null, null, { pending: false }); } })
        .catch((e) => { try { log.warn && log.warn(`[groups] counting group ${id} after its late warm read failed: ${(e && e.message) || e} — the next reader counts it`); } catch { } });   // its read's own S1: never an unheard rejection
    };
    try { coldIds = new Set(Object.keys(all())); } catch { coldIds = null; }   // the groups of the start (a later one is never cold)
    (async () => {
      await turn();
      let ids; if (coldIds) ids = [...coldIds]; else { try { ids = Object.keys(all()); } catch { return; } }   // no start set (the store unread at create): as before
      for (const id of ids) {
        try {
          const g = getGroup(id);
          if (!g) continue;
          const lastAt = Number(g.lastAt) || 0, cl = clearedN(g);
          if (!whos(g).some(([who, since]) => unreadOwed(g, who, since))) continue;   // every count known: nothing to read
          const rd = readFoldedAsync(id, { limit: LOG_READ, windowBytes: WARM_WINDOW_BYTES });
          const got = await bounded(rd);
          if (got === STUCK) { stuck(id, rd, lastAt, cl); continue; }   // should 1: never held by one read — it lands later
          countFrom(id, got.records, lastAt, cl);
        } catch { /* an unreadable log: the next reader counts it */ }
        finally { if (coldIds) coldIds.delete(id); }   // passed: counted, nothing owed, a record landed during the read, unreadable (the next reader counts it) or stuck (cold until it lands)
        await turn();
      }
    })().catch(() => { }).finally(() => {
      coldIds = null;
      try { if (typeof onWarmed === 'function') onWarmed(); } catch { }
      const asked = [...coldAsked].filter((id) => !stuckIds.has(id));   // a stuck group is said when its read lands
      for (const id of asked) coldAsked.delete(id);
      if (!asked.length) return;
      announce(asked, null, null, { pending: false });   // the counts a reader was answered null for, said once (no pending moved)
    });
  })();

  // B-f276 A2 (主开发 r487): THE CENSUS OF THE GROUPS ENGINE'S DOORS while a family it reads is held — every key of the API below
  // is a row (scripts/test-channel-groups.mjs is red on a key without one); THE ONE WRAPPER (src/channel-store.js pauseDoorsOf).
  const GROUP_HELD_DOORS = {
    pausedState: ['allow', 'sync', 'the pause itself: the held families by name — never a verdict on what they hold'],
    onConversationEnded: ['paused', 'async', 'a conversation ended: drops its held frames and rewrites its rows — never over a list nobody read; the end sweep runs again at the lift (r1588 (4))'],
    onConversationRevived: ['paused', 'async', 'a conversation back: rewrites its rows in groups.json'],
    sweepEnded: ['paused', 'async', 'the boot / user-state sweep: ends rows of conversations it finds ended — asked again at the lift (r1588 (4))'],
    endedOf: ['refused', 'sync', 'refused while paused (no allow row): an ended conversation’s mark — while held it answers not ended, which ends nothing'],
    endedRefusal: ['refused', 'sync', 'refused while paused (no allow row): the words of an ended member — read only'],
    readWaiting: ['refused', 'async', 'what waits for a conversation — refused, so the wait-watch’s reading fails and it ends nothing (never an empty answer)'],
    waitingReads: ['refused', 'sync', 'refused while paused (no allow row): the reading counters only'],
    list: ['refused', 'sync', 'the owner’s / an agent’s group list — an empty list would read as «no groups»'],
    listFor: ['refused', 'sync', 'an agent’s groups — an empty list would read as «you are in no group»'],
    markRead: ['refused', 'async', 'a read mark: a groups.json write'],
    liveRoster: ['allow', 'sync', 'the live sessions (not a held family): the same answer held or not'],
    pacerFor: ['allow', 'sync', 'a producer’s pacer (主开发 r1143 (6)): while a family is held its wake answers WAIT inside (store-blocked, asked again in 60 s) — never a grant over floors nobody read, never a throw a producer cannot read'],
    noteRoster: ['paused', 'sync', 'a roster broadcast'],
    get: ['refused', 'sync', 'one group — an absent one would read as «no such group»'],
    resolveGroup: ['refused', 'sync', 'a group by id or name — «no such group» over a list nobody read'],
    resolveMember: ['allow', 'sync', 'a name among the live conversations (not a held family): the same answer held or not'],
    resolveTarget: ['refused', 'sync', 'the send door’s target — «no such group» over a list nobody read'],
    reach: ['allow', 'sync', 'a reach verdict from the live sessions’ Task Groups and their opened reach (the roster) — it never reads groups.json'],
    sharesGroup: ['allow', 'sync', 'two live sessions share a Task Group (the roster) — it never reads groups.json'],
    dispatchLedger: ['allow', 'const', 'the dispatch ledger’s own door object (not a function: never wrapped) — its reads come only from the dispatch road, which is refused while paused'],
    create: ['refused', 'async', 'a new group: a groups.json write'],
    invite: ['refused', 'async', 'members added: a groups.json write and wakes'],
    leave: ['refused', 'async', 'a member leaves: a groups.json write'],
    kick: ['refused', 'async', 'a member removed: a groups.json write'],
    rename: ['refused', 'async', 'a groups.json write'],
    archive: ['refused', 'async', 'a groups.json write'],
    setNotify: ['refused', 'async', 'a member’s notify mode: a groups.json write'],
    post: ['refused', 'async', 'a group message: a log append, a groups.json write and wakes'],
    sendToAgent: ['refused', 'async', 'a direct message: a pair found or made, a post and a wake'],
    findPair: ['refused', 'sync', 'a direct pair — none would read as «no direct group exists yet»'],
    wake: ['refused', 'async', 'a member woken for its report (B-ef83 unit 1 (i): an owed compaction’s wake at the spend gate’s lift): a delivery and a groups.json write — refused while the families are held'],
    findOrCreatePair: ['refused', 'async', 'a pair made: a groups.json write'],
    read: ['refused', 'sync', 'a group’s log read — «no such group» over a list nobody read'],
    clearMessages: ['refused', 'async', 'a log rewrite and a groups.json write'],
    clearedCopies: ['refused', 'sync', 'what was cleared — «nothing» over a list nobody read would un-redact; the search worker asks again'],
    clearedCopiesAsync: ['refused', 'async', 'the same, off the loop'],
    reportsForTurn: ['allow', 'sync', 'answers NOTHING while paused (the reports wait, no marker moves): the first turn after the lift carries them once'],
    commitReports: ['refused', 'async', 'the markers after a turn carried reports: a groups.json write'],
    WAKE_BUDGET: ['allow', 'const', 'a constant — answers the same held or not'],
    TURN_BUDGET: ['allow', 'const', 'a constant — answers the same held or not'],
    MIN_REPORT_ROOM: ['allow', 'const', 'a constant — answers the same held or not'],
  };
  return pauseDoorsOf({
    pausedState: () => (groupsPaused() ? { code: 'store-blocked', error: groupsPausedWords(), held: store.heldOf(GROUP_FAMILIES) } : null),
    onConversationEnded, onConversationRevived, sweepEnded, endedOf, endedRefusal,
    readWaiting, waitingReads: () => waitReads,   // lane queued-is-not-woke laws 2 + 3, shape C: the reading (src/server/wait-watch.js)
    list, listFor, markRead, liveRoster, pacerFor, noteRoster, get: (id) => { const g = getGroup(id); return g ? view(g) : null; }, resolveGroup, resolveMember, resolveTarget, reach,
    sharesGroup, dispatchLedger,   // lane worker-dispatch verify r1 ④ / ②
    create: createGroup, invite, leave: (o) => remove({ ...o, kick: false }), kick: (o) => remove({ ...o, kick: true }),
    rename: renameGroup, archive: archiveGroup, setNotify, post, sendToAgent, findPair, findOrCreatePair, wake, read, clearMessages, clearedCopies, clearedCopiesAsync,
    reportsForTurn, commitReports,
    WAKE_BUDGET, TURN_BUDGET, MIN_REPORT_ROOM,
  }, GROUP_HELD_DOORS, { held: groupsPaused, error: groupsPausedError, answer: groupsPausedAnswer, say: sayPausedDoor });
}

module.exports = { create, WAKE_BUDGET, TURN_BUDGET, MIN_REPORT_ROOM, TEXT_MAX, ASIDE_LINE };
