'use strict';
/**
 * THE OUTBOUND FAMILY of the Channels engine (lane dc-channels-seams, 2026-10-05 — rv-channels-core C11): moved
 * VERBATIM out of channels-engine.js's one `create()` closure. The outbox: the policy driver (propose / compose /
 * proposeReaction, the guards from settings, the honesty line), the decision (approve / reject / withdraw /
 * replace), THE SEND (sendNow / sendReactionNow — an attempt line BEFORE the request, an outcome line after),
 * the receipts and their fate, reconcile, sweepSending / sweepReplaces / expireSweep, the outbox's attachments
 * and the pointer sync. The R4 wake it bills goes through the engine's ONE door (`billedWake`, in `engineCtx`).
 */

const caps = require('../channel-caps.js');
const F = require('../channel-filter.js');
const CR = require('../channel-ref.js');
const P = require('../channel-policy.js');
const ACL = require('../channel-acl.js');
const Drain = require('../channel-drain.js');
const OF = require('../channel-outbox-files.js');
const Thr = require('../channel-thread.js');
const { toAgentText: agentText } = require('../peer-text.js');
const { reactionsOf: reactionsRow, threadsOf: threadsRow, ChannelError } = require('../channels/index.js');

/** THE FAMILY'S FACTORY — `engineCtx` is the engine's ONE context object (channels-engine.js, the composition root): every
 *  field this family reads is named in the destructure below (test-architecture §79 pins the list), and what it answers
 *  is merged back into the same object for the engine and the families created after it. */
function create(engineCtx) {
  const {
    agentTitle, agentId, agentEnvelope, INBOX_KEY, i18nKey, INBOX_SOURCE, RESOLVED_BY, serverSetting, registry, now, log, liveSessions, broadcast,
    userTodos, deliver, store, agentsWanted, live, BOOT_ID, adapterRecords, adapterFor, affordable, vendor, effectiveConvCaps, humanNameOf,
    accountsBrief, conversationName, notify, kick, budgetRefusal, outlived, reactionsPerMin, threadIxOf, vocabularyOf, reactionsFor, offerNow,
    threadRefresh, rxBackedOff, rxBackoffRefusal, notePages, noteRxRateLimit, appendSides, react, unreact, refreshConvCaps, track, policyFor,
    policyRequiresReview, authorityCapsFor, healP2, effectiveFor, billedWake, reachFor, groupsOfSession, convFor, stillSees, effectiveForAccount,
    accountScopeGrants,
  } = engineCtx;

  // ══════════════════════════════════════════════════════════════════════════
  // P3: OUTBOX · POLICY · AGENT REACH (design §8, §9, §11, §12.3)
  //
  // ONE STORE, TWO SURFACES (§9.2): the inline card in a conversation window
  // and the Outbox window both render `outboxView()`, so they cannot disagree.
  // The "For you" pointer is PER CONVERSATION, without a count in its text
  // (the inbox dedupes by text — that is the idempotence we want), its id
  // persisted on the conversation row (`pendingTodoId`) and retracted by THIS
  // producer the moment the last proposal leaves `awaiting-approval`.
  //
  // MONEY: an approved send to the built-in Agents adapter rides the ladder
  // inside the adapter (peer-message); the RECEIPT rides the ladder from here
  // with `noWake` unless the assignment opted in (decision 8). The audit line
  // carries draftedBy / approvedBy / sentAs / identityMarking and NEVER leaves
  // this instance — the message body carries none of it (§9.5).
  //
  // P4 (§9.4 / §9.5, 2026-09-16) — REAL EXTERNAL SEND, EXACTLY ONCE OR
  // HONESTLY UNKNOWN: `sendNow` stamps `attemptAt` + the WIRE text on the
  // proposal BEFORE the request, hands a two-phase adapter's durable handle
  // (`onHandle`) to the store the moment it exists, and reads a transport
  // failure AFTER the request left (`detail.lost`) as `unknown` — never as
  // `failed`. `reconcile()` is the ONLY way out of `unknown`, asked by a
  // PERSON, gated on the adapter's declared idempotency (`none` cannot be
  // asked). `sweepSending()` turns a `sending` proposal the previous process
  // died on into `unknown` at boot (actor `boot`). THE SENDER HONESTY LINE
  // is OFF by default (`channels.senderHonestyLine`, overridable per adapter
  // record) and appended at send time ONLY for an agent-drafted proposal —
  // the card says so before the approval. A send's `observed` identity
  // (the vendor's own sender_type) is recorded on the adapter row as the
  // §21-item-3 proof, and logged when the declaration is still `unknown`.
  // ══════════════════════════════════════════════════════════════════════════
  const OUTBOX_LIST_CAP = 200;

  /** The guard config from settings — unparseable ⇒ the PURE decision fails closed. */
  function guardsFromSettings() {
    const read = (k) => { try { return serverSetting(k); } catch { return undefined; } };
    const tz = read('channels.offHoursTz');
    return {
      linksReview: read('channels.guardLinksReview') !== false,
      attachmentsReview: read('channels.guardAttachmentsReview') !== false,
      offHours: { enabled: read('channels.guardOffHours') !== false, tz: typeof tz === 'string' ? tz.trim() : '', start: read('channels.offHoursStart') || '09:00', end: read('channels.offHoursEnd') || '18:00' },
    };
  }
  /** THE SENDER HONESTY LINE SWITCH (§9.5, decision 17 as overruled): OFF by
   *  default. The instance setting `channels.senderHonestyLine` is the
   *  default and the adapter record's own `senderHonestyLine` (true / false /
   *  null = follow the instance) overrides it — a per-channel option. */
  function honestyLineFor(rec) {
    // lane webhook-l1-server: `caps.honestyLine: 'never'` — the other side may never learn an agent drafted it (no switch)
    try { if (rec && registry.capsOf(rec.kind).honestyLine === 'never') return false; } catch { }
    if (rec && rec.senderHonestyLine === true) return true;
    if (rec && rec.senderHonestyLine === false) return false;
    let v; try { v = serverSetting('channels.senderHonestyLine'); } catch { v = undefined; }
    return v === true;
  }
  /** THE IDENTITY PROOF (§21 item 3): a real send's `observed` identity —
   *  the vendor's own sender_type — is recorded on the adapter row (the
   *  panel shows it) and, while the declaration is still `unknown`, LOGGED
   *  with the flip it licenses. The declaration itself stays code. */
  async function noteIdentityObserved(rec, as, observed, vendorMessageId = null) {
    if (!rec || !observed || !observed.senderType) return null;
    const c = registry.capsOf(rec.kind);
    const entry = { as: as || null, senderType: String(observed.senderType), at: now(), vendorMessageId: vendorMessageId || null, declared: c.identityMarking };
    await store.adapters.update(() => { rec.identityObserved = entry; });
    if (c.identityMarking === 'unknown') log.log(`[channels] ${rec.id}: IDENTITY PROOF — a real send as '${entry.as}' came back with sender_type='${entry.senderType}' while caps.identityMarking is 'unknown': flip the declaration in src/channels/${rec.kind}.js to ${entry.senderType === 'user' ? "'none'" : "'marked' (recipient-ui)"} with its identityMarkingText`);
    return entry;
  }
  /** What the recipient will see, as STRUCTURE (§9.5) — the card says the words. */
  function identityFor(rec, sendAs) {
    const c = registry.capsOf(rec.kind);
    return { sentAs: sendAs, marking: c.identityMarking, where: c.identityMarkingWhere || null, text: c.identityMarkingText || null };
  }
  /** Which identity a proposal would send as RIGHT NOW: user first, bot as
   *  the fallback (decision 2), or null with the reason when neither is
   *  offered — and then NO proposal is created. */
  function sendIdentityFor(rec, en, t) {
    const c = registry.capsOf(rec.kind);
    const u = caps.offers(c, effectiveConvCaps(rec, en), 'send-as-user', t);
    if (u.offered) return { as: 'user', why: null, userWhy: null };
    const b = caps.offers(c, effectiveConvCaps(rec, en), 'send-as-bot', t);
    if (b.offered) return { as: 'bot', why: null, userWhy: u.why || 'unknown' };
    return { as: null, why: u.why || b.why || 'unknown', userWhy: u.why || 'unknown' };
  }
  function proposalsFor(key = null) {
    const all = Object.values(store.outbox.snapshot().proposals);
    return (key ? all.filter((p) => p.key === key) : all).sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  /** A proposal as the two surfaces read it — plus the identity warning
   *  STRUCTURE for its adapter and its expiry instant. */
  function proposalView(p) {
    const rec = adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
    const c = rec ? registry.capsOf(rec.kind) : null;
    const { ttlAt } = P.expiryVerdict(p, now());
    // P4: the honesty line the card must show BEFORE the approval (live off
    // the switch while the proposal is pending; the recorded fact after), and
    // whether a lost outcome can be reconciled by the machine at all.
    const pending = p.state === 'proposed' || p.state === 'awaiting-approval' || p.state === 'sending';
    const reactionKind = p.kind === 'reaction';
    // a reaction carries no text, so no sender line; its lost outcome is checked by ONE list call where reactions are listed
    const honestyLine = reactionKind ? null : pending ? P.honestyLine({ draftedBy: p.draftedBy, enabled: honestyLineFor(rec) }) : (p.result && p.result.honestyLine ? P.honestyLine({ draftedBy: p.draftedBy, enabled: true }) : null);
    const can = p.state === 'unknown' ? (!c ? { ok: false, code: 'no-adapter', why: 'the adapter no longer exists' } : reactionKind ? (reactionsRow(c).read === 'list' ? { ok: true } : { ok: false, code: 'no-idempotency', why: 'this channel does not list reactions — only a person can check the platform' }) : P.canReconcile(c)) : null;
    return {
      ...p, ...(p.convId && conversationName(p.adapterId, p.convId) ? { title: conversationName(p.adapterId, p.convId) } : {}),   // B-c127: the conversation's name NOW (a proposal froze its title — or the raw id — when it was drafted)
      adapterLabel: rec ? (rec.label || rec.id) : p.adapterId, identityWarning: c ? caps.identityWarning(c) : null, ttlAt, canDecide: p.state === 'awaiting-approval',
      convKind: (p.key && store.index.live()[p.key] && store.index.live()[p.key].kind) || null,
      // lane lark-upload-preflight: an awaiting card whose files this account cannot carry WARNS on the chip and its
      // Approve says "Send without the file" (the digest covers it — a card drawn before the change approves nothing)
      ...(() => { const fb = rec && p.state === 'awaiting-approval' && P.storedAttachments(p).length ? filesBlockedOf(filesOfferFor(rec, p.key && store.index.live()[p.key] ? effectiveConvCaps(rec, store.index.live()[p.key]) : null)) : null; return fb ? { filesBlocked: fb } : {}; })(),   // B-f467: the Outbox row draws the conversation's own avatar (a mail thread = the mail glyph)
      // r3: how many agents approving this WAKES (a billed turn each) — the
      // card says it and echoes it with the Approve (`expectWakes`)
      wakes: !reactionKind && sendStartsTurn(rec) ? 1 : 0,
      honestyLine, canReconcile: !!(can && can.ok), reconcileWhy: can && !can.ok ? can.why : null, reconcileWhyCode: can && !can.ok ? (can.code || null) : null,
      // THE OUTCOME AS STRUCTURE (a3 i18n): `p.reason` stays the English
      // contract string agents read; the card words `outcome` in its language.
      outcome: P.outcomeOf(p),
      // 2026-09-28: WHERE A REPLY LANDS — the placement read through its alias (a proposal stored before the enum
      // carries `inThread` / `replyTo` only), and its words for the agent's CLI (the card words it in its language)
      ...(P.placementOf(p) ? { placement: P.placementOf(p), placementText: P.placementWords(P.placementOf(p)) } : {}),
    };
  }
  /**
   * THE DRAFTER'S VIEW OF ITS OWN PROPOSAL (lane channel-threads verify r2, IDENTITY). While the agent still sees the
   * proposal's conversation (the ACCOUNT, for a composed message) = `proposalView`; once the owner removed its access =
   * the FATE only — id, kind, state, when, the ids it named itself — and nothing the conversation produced: no title,
   * no quote, no vendor message / thread id minted after the revoke, no reason's words, no receipt facts. `status`,
   * `withdraw` / `--replaces` and the draft verbs answer through it; the receipt's ladder block says the same
   * (`P.withheldReceiptLine`). A user caller sees everything.
   */
  const scopeConvOf = (p) => (p && !p.compose && p.convId ? p.convId : null);
  function agentProposalView(ctx, p) {
    if (!p) return p;
    const v = agentProposalViewRaw(ctx, p);
    return ctx && ctx.kind === 'agent' ? agentIdsOf(v) : v;   // verify r3 F6: an AGENT's view carries its ids as line pieces (the user's window keeps them as they are)
  }
  /** the drafter's view (whole while it still sees, else the fate) — its two lines are test-channels-engine's control pins, kept verbatim */
  function agentProposalViewRaw(ctx, p) {
    if (!ctx || ctx.kind !== 'agent' || stillSees(ctx, p.adapterId, scopeConvOf(p))) return proposalView(p);
    return withheldProposal(p);
  }
  /** verify r3 F6: the ids a proposal's AGENT view carries — the target conversation, its thread, the answered message, the
   *  sent message's vendor id (the receipt), a reaction's message + its quote's author (a name, else an id) — as line pieces */
  function agentIdsOf(v) {
    if (!v || typeof v !== 'object') return v;
    const out = { ...v, convId: agentId(v.convId), threadKey: agentId(v.threadKey), replyTo: agentId(v.replyTo) };
    if (v.replyEnvelope && typeof v.replyEnvelope === 'object') out.replyEnvelope = agentEnvelope(v.replyEnvelope);   // B-a085: the recipients the agent's CLI prints
    if (v.receipt && typeof v.receipt === 'object') out.receipt = { ...v.receipt, vendorMessageId: agentId(v.receipt.vendorMessageId) };
    if (v.reaction && typeof v.reaction === 'object') out.reaction = { ...v.reaction, msg: agentId(v.reaction.msg), ...(v.reaction.quote && typeof v.reaction.quote === 'object' ? { quote: { ...v.reaction.quote, author: agentText(v.reaction.quote.author, { kind: 'line', max: 200 }) } } : {}) };
    return out;
  }
  function withheldProposal(p) {
    return {
      id: p.id, kind: p.kind || 'message', state: p.state, at: p.at || null, updatedAt: p.updatedAt || null,
      adapterId: p.adapterId, convId: p.convId || null, title: null, draftedBy: p.draftedBy || null,
      accessRemoved: true, note: P.ACCESS_REMOVED_NOTE,
      receipt: p.receipt ? { proposalId: p.id, status: p.receipt.status, ...(p.kind === 'reaction' ? { kind: 'reaction' } : {}), withheld: true } : null,
      ...(p.kind === 'reaction' && p.reaction ? { reaction: { msg: p.reaction.msg, key: p.reaction.key, op: p.reaction.op, glyph: p.reaction.glyph || null } } : {}),
    };
  }
  /** The drafter's Task Groups AT DRAFT TIME (`drafterGroups`, beside `draftedBy` — whose shape the audit and the
   *  withdraw verdicts read): what a receipt judges reach by when the drafter's session is not live at the decision. */
  const drafterGroupsOf = (ctx) => (ctx && ctx.kind === 'agent' && Array.isArray(ctx.groups) && ctx.groups.length ? { drafterGroups: ctx.groups.map(String).slice(0, 50) } : {});
  /** Does the DRAFTER of `p` still see where it drafted? — the receipt's question (no route principal at hand: the
   *  agent's own grants + its groups' — the LIVE session's, else the ones recorded at draft time: a group-granted
   *  drafter whose session ended before the decision still sees, and hears its receipt whole). A built-in Agents
   *  conversation's reach is msg-acl, which only the agent route can judge (`msgLevelFor`) — not withheld here. */
  function drafterSees(p) {
    const d = p && p.draftedBy;
    if (!d || d.kind !== 'agent' || !d.id) return true;
    const rec = adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
    try { if (rec && registry.get(rec.kind).reach === 'msg-acl') return true; } catch { }   // lane webhook-l1-server: the declared reach source
    let live = null;
    try { live = (liveSessions() || []).find((x) => x && x.cid === String(d.id)) || null; } catch { live = null; }
    const groups = live ? (Array.isArray(live.groups) ? live.groups.slice() : []) : (Array.isArray(p.drafterGroups) ? p.drafterGroups.slice() : []);
    return stillSees({ kind: 'agent', id: String(d.id), name: d.name || null, groups, msgLevelFor: () => 'none' }, p.adapterId, scopeConvOf(p));
  }
  /**
   * WHAT WAITS IN AN AGENT'S NEXT-TURN STASH IS RE-JUDGED WHEN IT IS READ (lane channel-threads verify r3, IDENTITY —
   * reproduced over this engine, the real stash (conversation-deliver) and the real injection (agent-routes
   * drainStashUnderCap)): a watcher's held wake — the message text —, a proposal's receipt — the title, the vendor id —
   * and a reaction digest were filed for the agent's next turn while it had access; the owner removed its access; `read`
   * answered the uniform not-found and the agent's next prompt drained all three WHOLE. Every entry this engine files
   * carries `about` = {keys: [the conversations its words came from], account: <adapterId> for a composed message's
   * receipt, groups: [the recipient's Task Groups when it was filed]}, and the ladder asks THIS gate at every read of the
   * queue (`registerStashGate`): the recipient still sees every key (its own grants + its groups' — the LIVE session's,
   * else the recorded ones, the `drafterSees` rule; a built-in Agents conversation is msg-acl's, judged at the route) ⇒
   * kept; otherwise a receipt keeps its FATE (`P.withheldReceiptLine` — its card still tracks it by `ref`) and anything
   * else is withheld whole (dropped, never delivered, said in the log). An unreadable `about` withholds (fail closed).
   */
  const STASH_ABOUT_KEYS_MAX = 64;
  const msgAclAccount = (adapterId) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId) || null; try { return !!(rec && registry.get(rec.kind).reach === 'msg-acl'); } catch { return false; } };
  const stashAbout = ({ keys = [], account = null, cid = null, groups = null } = {}) => {
    let g = groups;
    if (!Array.isArray(g)) g = cid ? groupsOfSession(String(cid)) : [];
    return { keys: [...new Set((keys || []).filter(Boolean).map(String))].slice(0, STASH_ABOUT_KEYS_MAX), ...(account ? { account: String(account) } : {}), groups: g.map(String).slice(0, 50) };
  };
  // `memo` = ONE read of one queue (the ladder hands a fresh Map per pass): the live session is looked up once, and a
  // (groups, key) verdict is asked once — a 30-entry stash read is one roster lookup + one reach per distinct key
  function stashGate(cid, entry, memo = null) {
    if (!entry || (entry.source !== 'channel' && entry.source !== 'channel-receipt')) return null;
    const a = entry.about;
    if (!a || typeof a !== 'object') return null;
    const M = memo instanceof Map ? memo : new Map();
    let sees = !a.oversize && ((Array.isArray(a.keys) && a.keys.length > 0) || !!a.account) && !(Array.isArray(a.keys) && a.keys.length > STASH_ABOUT_KEYS_MAX);
    if (sees) {
      if (!M.has('live')) { let live = null; try { live = (liveSessions() || []).find((x) => x && x.cid === String(cid)) || null; } catch { live = null; } M.set('live', live); }
      const live = M.get('live');
      const groups = live ? (Array.isArray(live.groups) ? live.groups.slice() : []) : (Array.isArray(a.groups) ? a.groups.map(String) : []);
      const ctx = { kind: 'agent', id: String(cid), name: null, groups, msgLevelFor: () => 'none' };
      const gk = groups.join('\u0000');
      const seesKey = (adapterId, convId) => {
        const mk = `${gk}\u0001${adapterId}\u0001${convId === null ? '' : convId}`;
        if (!M.has(mk)) M.set(mk, msgAclAccount(adapterId) || stillSees(ctx, adapterId, convId));
        return M.get(mk);
      };
      for (const k of Array.isArray(a.keys) ? a.keys.map(String) : []) {
        const i = k.indexOf('/');
        if (i <= 0) { sees = false; break; }
        if (!seesKey(k.slice(0, i), k.slice(i + 1))) { sees = false; break; }
      }
      if (sees && a.account && !seesKey(String(a.account), null)) sees = false;
    }
    if (sees) return null;
    if (entry.source === 'channel-receipt' && entry.ref) {
      const p = store.outbox.snapshot().proposals[String(entry.ref)] || null;
      const rc = p && p.receipt ? { ...p.receipt, proposalId: p.id } : { proposalId: String(entry.ref).slice(0, 80), status: (p && p.state) || 'decided', ...(p && p.kind === 'reaction' ? { kind: 'reaction' } : {}) };
      return { text: P.withheldReceiptLine(rc), fromName: 'Channels · Outbox' };
    }
    return { drop: true };
  }
  function outboxView({ key = null, limit = OUTBOX_LIST_CAP } = {}) {
    const list = proposalsFor(key).slice(0, Math.max(1, limit)).map(proposalView);
    const all = proposalsFor();
    return {
      proposals: list,
      accounts: accountsBrief(),   // B-f467: the rows' account badges (a hue is a function of the whole list — B-5fe1)
      awaitingTotal: all.filter((p) => p.state === 'awaiting-approval').length,
      unknownTotal: all.filter((p) => p.state === 'unknown').length,
      at: now(),
    };
  }
  function notifyOutbox(changed = []) {
    try { broadcast({ type: 'channel-outbox-updated', changed, outbox: outboxView() }); } catch (err) { console.warn('[channels] outbox broadcast failed:', err && err.message); }
  }
  /** ONE state change, through the PURE table. Mutates the LIVE proposal
   *  inside the outbox's serialized door; refuses (never throws) with the
   *  table's own reason. */
  /** `unless(p)` (2026-09-27 verify): a guard asked INSIDE the store's
   *  serialized write, at apply time — the TTL sweep's "is a replace holding
   *  this id" question. Asked before the write it raced the hold: the sweep
   *  took its due list, a replace of one of them passed its own check and
   *  made the new draft while the sweep was busy with an earlier proposal,
   *  and the sweep's write then landed BETWEEN the replace's check and its
   *  withdrawal — an "EXPIRED unapproved" receipt for a draft the agent had
   *  just replaced. The hold is set synchronously when the replace is called,
   *  so at apply time it is either visible (skip) or the replace's check will
   *  read this write (refused before anything is made). */
  async function transition(id, to, by, patch = null, { unless = null } = {}) {
    let verdict = { ok: false, why: 'no such proposal' };
    await store.outbox.update((ob) => {
      const p = ob.proposals[id];
      if (!p) return;
      if (typeof unless === 'function' && unless(p)) { verdict = { ok: false, why: 'held: a replace of this proposal is in flight', held: true }; return; }
      verdict = P.canTransition(p.state, to, by);
      if (!verdict.ok) return;
      const t = now();
      p.state = to; p.updatedAt = t;
      if (to === 'awaiting-approval') p.awaitingSince = t;
      if (!Array.isArray(p.history)) p.history = [];
      p.history.push({ state: to, at: t, by });
      if (patch) patch(p, t);
      if (OF.UNSENT_ENDS.includes(to) && P.storedAttachments(p).length) p.attachmentsGoneAt = t;
    });
    // design 005 §2.B retention: an UNSENT end (rejected / withdrawn / expired) takes the proposal's files at once
    if (verdict.ok && OF.UNSENT_ENDS.includes(to)) { try { OF.remove(store.dir, id); } catch (err) { log.warn(`[channels] ${id}: its attachments could not be removed now (${(err && err.message) || err}) — the sweep tries again`); } }
    return verdict;
  }
  function auditOutbox(p, op, extra = {}) {
    try {
      store.audit({
        kind: 'outbox', op, proposalId: p.id, adapterId: p.adapterId, convId: p.convId, state: p.state,
        draftedBy: p.draftedBy, approvedBy: p.approvedBy || null, sentAs: (p.result && p.result.sentAs) || p.sendAs || null,
        identityMarking: p.identity ? p.identity.marking : null, edited: !!p.edited, ...extra,
      });
    } catch (err) { log.warn(`[channels] outbox audit failed: ${(err && err.message) || err}`); }
  }

  /**
   * PROPOSE (§9.1). `ctx` is the caller's principal — an agent's
   * `{kind:'agent', id, name, groups, msgLevelFor}` resolved by the route
   * BEFORE this is asked, or `{kind:'user'}` from the composer. On a
   * conversation where no identity is offered the answer is the typed
   * `send-not-available` and NOTHING is created (§4).
   *
   * THE OWNER'S OWN MESSAGE (design §22, 2.369.159 — "an IM, not a feed"):
   * `input.direct === true` from the USER (the composer's Send, `POST …/send`)
   * skips the policy and its guards — the owner's own words go out at once,
   * AS THE OWNER, the way a message typed into the platform's own client
   * would. It still rides the whole outbox machinery (the record, the audit
   * attempt/outcome, the lost-answer `unknown` that is never re-sent); only
   * `sendAs:'user'` qualifies (a bot identity is not the owner speaking — that
   * conversation answers `send-not-available` with the send-as-user reason,
   * and the composer offers the proposal path instead). An AGENT's `direct`
   * is ignored: agent drafts are what the policy exists for.
   */
  /** Does a send on this record START A BILLED TURN? The adapter MODULE
   *  declares it (`sendStartsTurn` — the built-in Agents adapter's send is a
   *  wake through the delivery ladder), never its id (r3). */
  function sendStartsTurn(rec) { try { return !!(rec && registry.get(rec.kind).sendStartsTurn); } catch { return false; } }
  /**
   * THE WAKE GATE of a send that starts a turn (r3 — the side doors r2 left
   * beside the group routes). `n` = the wakes the act causes NOW (0 or 1).
   * `consent(n)` first (the owner's echo: a caller that never saw the
   * preview cannot wake — `wake-count-mismatch`, with `wakes`), then
   * `mayWake(convId)` (THE groups engine's pacer — one ledger for every owner
   * route, handed in only when auth is off; an agent route hands its own):
   * a floored send is `rate-floor` and NOTHING moves. `{ok:true, granted}`
   * — a granted slot is refunded when the send did not go out.
   */
  function wakeGate(convId, n, { consent = null, mayWake = null } = {}) {
    if (!n) return { ok: true, granted: false };
    if (typeof consent === 'function') {
      const v = consent(n);
      if (!(v === true || (v && v.ok === true))) return { ok: false, code: (v && v.code) || 'wake-count-mismatch', error: (v && v.error) || 'the wake was not confirmed', wakes: n };
    }
    if (typeof mayWake !== 'function') return { ok: true, granted: false };
    const pace = mayWake(convId);
    if (pace !== true) {
      const reason = String((pace && pace.reason) || 'rate floor').replace(/ — it reaches them on their next turn instead$/, '');
      return { ok: false, code: 'rate-floor', error: `${reason} — nothing was sent (send again once the floor passes, or post in a group: that reaches them on their next turn, free)`, why: (pace && pace.why) || null, wakes: n };
    }
    return { ok: true, granted: true };
  }
  /** The proposals whose adapter send was CALLED (r4): set right before
   *  `adapter.send`, cleared when sendNow returns — an entry that survives
   *  is a sendNow that THREW after the request may have left. */
  const sendLeft = new Set();
  /**
   * Give a granted wake slot back when the send did not go out. `threw`
   * (r4): the act threw between the grant and its outcome (a blocked store's
   * 503, an EACCES/ENOSPC write) — a proposal that never reached its adapter
   * returns the PAIR and the sender's minute (nothing reached the
   * authorizer, so it was not an attempt: the retry is sent, never a 429
   * blaming a wake that never happened); one whose request may have LEFT
   * keeps the whole slot. Without a throw: `sent`/`unknown` keep the slot,
   * anything else (a refusal) returns the pair and keeps the attempt.
   */
  function wakeRefundIfUnsent(gate, guards, convId, id, { threw = false } = {}) {
    const left = id ? sendLeft.has(id) : false;
    if (threw && id) sendLeft.delete(id);
    if (!gate || !gate.granted || !guards || typeof guards.mayWake !== 'function' || typeof guards.mayWake.refund !== 'function') return;
    const p = id ? store.outbox.snapshot().proposals[id] : null;
    // `unknown` keeps the slot: the request LEFT, the turn may be running
    if (p && (p.state === 'sent' || p.state === 'unknown')) return;
    if (threw && left && !(p && p.state === 'failed')) return;
    const attempted = !threw || left;
    try { guards.mayWake.refund(convId, { attempted }); } catch { }
  }

  // ── WHAT A REPLY ANSWERS AND WHO RECEIVES IT (r6 verify F1 / F3, 2026-09-28) ──────────────────────────
  // A Lark reply is POSTed to `/messages/<replyTo>/reply` — the request names the MESSAGE, never the chat — so an
  // agent proposing in conversation A with a message id of chat B posted into B while the card showed A (and on a
  // direct-policy A it went out with no card at all, past B's own policy and reach). A reply answers ONLY a
  // message this engine STORED for that very conversation (`store.findRecord` in A's own log), judged at propose
  // and again at approval / send. An adapter whose reply's RECIPIENTS follow from the message it answers
  // (`caps.replyEnvelope` — Gmail) resolves them NOW, for the anchor the engine picked (the one named, else the
  // conversation's newest STORED message) — never at send time from whatever the thread's newest message is then.
  function storedRecord(adapterId, convId, vendorId) {
    if (!store.index.live()[`${adapterId}/${convId}`]) return null;   // the .197 integration: a KNOWN conversation's log only (the clear census)
    if (vendorId === null || vendorId === undefined || vendorId === '') return null;
    try { return typeof store.findRecord === 'function' ? store.findRecord(adapterId, convId, String(vendorId)) : null; } catch { return null; }
  }
  function newestStored(adapterId, convId) {
    if (!store.index.live()[`${adapterId}/${convId}`]) return null;   // the .197 integration: a KNOWN conversation's log only (the clear census)
    try { const tail = store.readTail(adapterId, convId, { limit: 1 }); return tail.length ? tail[tail.length - 1] : null; } catch { return null; }
  }
  /** `{ok:true, anchor, envelope}` (both null for a plain message) or `{ok:false, answer}` — the refusal as propose returns it. */
  async function replyTargetFor(rec, adapterId, convId, replyTo, { all = false, cc = null } = {}) {
    const c = registry.capsOf(rec.kind);
    const wantsEnvelope = c.replyEnvelope === true;
    // B-a085: reply-all / an added Cc exist only where a reply's recipients follow from the message it answers (mail)
    const addCc = Array.isArray(cc) && cc.length ? cc : null;
    if ((all === true || addCc) && !wantsEnvelope) return { ok: false, answer: { ok: false, code: 'bad-proposal', why: all === true ? 'replyAll' : 'cc', error: `${all === true ? 'reply-all' : 'an added Cc'} is offered only on mail (a channel whose reply goes to the people on the message it answers) — nothing was created` } };
    let record = null;
    if (replyTo !== null && replyTo !== undefined) {
      record = storedRecord(adapterId, convId, replyTo);
      const av = P.replyAnchorVerdict({ replyTo, convId, record });
      if (!av.ok) return { ok: false, answer: { ok: false, code: 'bad-proposal', why: av.code, error: av.why } };
    } else if (wantsEnvelope) {
      record = newestStored(adapterId, convId);
      if (!record) return { ok: false, answer: { ok: false, code: 'bad-proposal', why: 'reply-anchor', error: 'this conversation holds no stored message to reply to yet — refresh it, then propose again' } };
    }
    if (!record) return { ok: true, anchor: null, envelope: null };
    const anchor = P.anchorView(record);
    if (!wantsEnvelope) return { ok: true, anchor, envelope: null };
    let env = null;
    // lane webhook-l1-server: `implicit` = no --to (the engine chose the newest record) — a path of several callers refuses it
    try { env = await adapterFor(rec).adapter.replyEnvelope(convId, { anchorId: String(record.vendorId), ...(all === true ? { all: true } : {}), ...(replyTo === null || replyTo === undefined ? { implicit: true } : {}) }); }
    catch (err) {
      const why = (err && err.detail && err.detail.why) || (err && err.code) || 'unknown';
      // lane webhook-l1-server: a refusal the adapter NAMES (`detail.named`: ambiguous-caller, caller-revoked, …) is said by its name
      if (err && err.detail && err.detail.named === true && why !== 'reply-anchor-elsewhere') return { ok: false, answer: { ok: false, code: why === 'ambiguous-caller' ? 'bad-proposal' : (err.code || 'send-not-available'), why, error: `${(err && err.message) || why} — nothing was created`, ...(Array.isArray(err.detail.callers) ? { callers: err.detail.callers.slice(0, 50).map(callerRow) } : {}) } };
      if (why === 'reply-anchor-elsewhere' || why === 'reply-anchor-draft') return { ok: false, answer: { ok: false, code: 'bad-proposal', why: 'reply-anchor', error: why === 'reply-anchor-draft' ? `the message this reply answers is an unsent draft — nothing was created (${(err && err.message) || why})` : `the message this reply answers is not in this conversation on the platform (${(err && err.message) || why})` } };
      return { ok: false, answer: { ok: false, code: 'send-not-available', why: 'reply-envelope', error: `who this reply would go to could not be resolved (${(err && err.message) || why}) — nothing was created; propose it again` } };
    }
    let ev = P.envelopeVerdict(env, String(record.vendorId), { all: all === true });
    // the drafter's added Cc joins the envelope the card shows (and the header bound is judged again over it)
    if (ev.ok && addCc) ev = P.envelopeVerdict(P.withAddedCc(ev.envelope, addCc), String(record.vendorId), { all: all === true });
    if (!ev.ok) return { ok: false, answer: { ok: false, code: 'send-not-available', why: 'reply-envelope', error: `${ev.why} — nothing was created` } };
    return { ok: true, anchor, envelope: ev.envelope };
  }
  /** The approval / send re-judge of a reply's target: null = still what the card showed, else the refusal's why. */
  function replyRecheck(p, rec) {
    if (!p || p.compose || !p.convId) return null;
    const c = rec ? registry.capsOf(rec.kind) : {};
    if (c.replyEnvelope === true && !(p.replyEnvelope && p.replyEnvelope.to && (p.replyEnvelope.anchorId || p.replyEnvelope.pinned === true))) return 'reply-envelope-missing';
    const anchorId = p.replyTo || (p.replyEnvelope && p.replyEnvelope.anchorId) || null;
    if (!anchorId) return null;
    const record = storedRecord(p.adapterId, p.convId, anchorId);
    return P.replyAnchorVerdict({ replyTo: anchorId, convId: p.convId, record }).ok ? null : 'reply-anchor-gone';
  }
  /** What the adapter is handed about the message a reply answers: the STORED record's facts (its own `raw`). */
  function anchorFactsOf(p) {
    const anchorId = p && (p.replyTo || (p.replyEnvelope && p.replyEnvelope.anchorId));
    if (!anchorId || !p.convId) return null;
    const r = storedRecord(p.adapterId, p.convId, anchorId);
    return r ? { vendorId: String(r.vendorId), convId: String(r.convId || p.convId), raw: r.raw || null } : null;
  }

  /**
   * design 005 §2.B (B-fd1f): AN AGENT'S FILES, before anything exists — decoded, hashed and sniffed IN MEMORY, then
   * judged against the adapter's `caps.sendAttachments` row (absent / null ⇒ `attachments-not-offered`, in the
   * channel's name, with `sendAttachmentsWhy`). A refusal is `bad-proposal` with its name in `why`; nothing on disk.
   */
  /** lane lark-upload-preflight (userW inc-muxsy69b-mjg1): CAN THIS ACCOUNT CARRY A FILE — the `send-attachment` offer over
   *  the files row judged from the HELD scopes (the module's `capsOfScopes`: an account-level fact, never a stale cache),
   *  else the conversation's cached row (`cc`). Answers the offer `{offered, why, requiredScopes}`. */
  function filesOfferFor(rec, cc = null, t = now()) {
    const c = registry.capsOf(rec.kind) || {};
    let judged = null;
    try { const mod = registry.get(rec.kind); judged = mod && typeof mod.capsOfScopes === 'function' ? mod.capsOfScopes(((rec.auth && rec.auth.scopes) || []).map(String)) : null; } catch { judged = null; }
    const files = (judged && judged.files) || (cc && cc.files) || null;
    return caps.offers(c, { read: 'yes', sendAs: [], at: t, ...(files ? { files } : {}) }, 'send-attachment', t);
  }
  const filesBlockedOf = (o) => (o && !o.offered && o.why === 'attachments-not-sendable' ? { why: o.why, requiredScopes: (o.requiredScopes || []).slice(0, 8) } : null);
  function attachPrepare(rec, proposal, ctx = null, cc = null) {
    const list = proposal && Array.isArray(proposal.attachments) ? proposal.attachments : [];
    if (!list.length) return { ok: true, files: [] };
    const c = registry.capsOf(rec.kind) || {};
    const files = OF.prepare(list);
    const av = P.attachVerdict(c.sendAttachments || null, files, { hasText: !!String(proposal.text || '').trim(), channel: rec.label || rec.id, why: c.sendAttachmentsWhy || null });
    if (!av.ok) return { ok: false, answer: { ok: false, code: 'bad-proposal', why: av.why, error: av.error } };
    // lane lark-upload-preflight: a file this ACCOUNT cannot carry is refused HERE, by name (the scopes + the owner's
    // re-authorize step) — the agent never tells anyone "I attached it" for a file the send would drop
    const fb = filesBlockedOf(filesOfferFor(rec, cc));
    if (fb) return { ok: false, answer: { ok: false, code: 'bad-proposal', why: 'attachments-not-sendable', requiredScopes: fb.requiredScopes, error: `${rec.label || rec.id} cannot send files: this account's sign-in lacks ${fb.requiredScopes.join(' or ') || 'the upload permission'} — the owner re-authorizes the account (Channels → the account → Re-authorize) before a file can go; send the text alone, or ask the owner to send the file — nothing was created` } };
    // verify r1 (C4): what this drafter's undecided proposals already keep on disk bounds the new one
    const hv = P.attachHeldVerdict(store.outbox.snapshot().proposals, !ctx || ctx.kind === 'user' ? { kind: 'user', id: null } : { kind: 'agent', id: ctx.id }, files);
    return hv.ok ? { ok: true, files } : { ok: false, answer: { ok: false, code: 'bad-proposal', why: hv.why, error: hv.error } };
  }
  /** design 005 §2.B: a proposal's stored file for the OWNER's card (thumbnail / download) — no agent route reaches it.
   *  verify r1 (C2): the bytes are RE-HASHED against the record before they are shown — a file rewritten on disk is
   *  refused (`attachment-changed`), so the card never draws bytes other than the ones an Approve would send */
  async function outboxAttachment(id, n) {
    const p = store.outbox.snapshot().proposals[String(id)];
    const m = p ? P.storedAttachments(p).find((a) => String(a.n) === String(n)) : null;
    if (!m) return { ok: false, code: 'not-found', error: 'no such attachment' };
    const file = OF.fileOf(store.dir, p.id, m.n);
    if (!file) return { ok: false, code: 'not-found', error: 'the file is no longer kept' };
    const v = await OF.verify(store.dir, p.id, [m]);
    if (!v.ok) return { ok: false, code: 'attachment-changed', error: `${v.why} — it is not shown, and an Approve would refuse to send it` };
    return { ok: true, data: v.files[0].data, meta: m };
  }
  /** design 005 §2.B retention (once a minute, beside the expiry sweep): a sent / failed proposal's files 7 days after
   *  it ended, a folder whose record is gone, a stage a crash left; the record keeps name, size and sha256 */
  async function filesSweep() {
    const removed = OF.sweep(store.dir, store.outbox.snapshot().proposals, now());
    if (removed.length) await store.outbox.update((ob) => { for (const id of removed) { const q = ob.proposals[id]; if (q && !q.attachmentsGoneAt) q.attachmentsGoneAt = now(); } });
    return removed;
  }

  async function propose(ctx, adapterId, convId, input, guards = {}) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec) return ACL.notFound();
    const t = now();
    if (ctx && ctx.kind === 'agent' && !ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();
    if (rec.enabled === false) return { ok: false, code: 'send-not-available', error: `${rec.label || rec.id} is disabled` };
    let who = sendIdentityFor(rec, en, t);
    // the entry AS THIS PROPOSAL KNOWS IT: with the caps it resolved below
    // (R4 verify — the authority clamp read the snapshot taken BEFORE the
    // refresh, so the first direct send on a never-resolved conversation was
    // downgraded to review with reason `authority`, the second went direct)
    let enNow = en;
    if (!who.as && (who.why === 'unknown' || who.why === 'stale' || caps.CONV_CAPS_FAIL_WHYS.includes(who.why))) {
      // A proposal is a better refresh trigger than a render (§4's second
      // trigger, applied where the answer decides a real message): resolve
      // ONCE, then re-ask. A conversation whose caps were never resolved has none cached.
      let fresh = null;
      try { fresh = await refreshConvCaps(adapterId, convId, { polite: true }); } catch (err) { log.warn(`[channels] convCaps refresh at propose failed: ${(err && err.message) || err}`); }
      if (fresh) { enNow = { ...en, convCaps: fresh }; who = sendIdentityFor(rec, enNow, now()); }
    }
    const askAt = caps.CONV_CAPS_FAIL_WHYS.includes(who.why) ? Number(((enNow && enNow.convCaps) || {}).retryAt) || null : null;   // lane gmail-reply-known
    if (!who.as) return { ok: false, code: 'send-not-available', error: `sending is not available on this conversation (${who.why}${askAt ? `; asked again at ${new Date(askAt).toISOString()}` : ''})`, why: who.why, ...(askAt ? { retryAt: askAt } : {}) };
    const own = !!(input && input.direct === true) && (!ctx || ctx.kind === 'user');
    if (own && who.as !== 'user') return { ok: false, code: 'send-not-available', error: `sending as you is not available on this conversation (${who.userWhy || 'unknown'})`, why: who.userWhy || 'unknown' };
    const v = P.validateProposal(input);
    if (!v.ok) return { ok: false, code: 'bad-proposal', error: v.error, ...(v.why ? { why: v.why } : {}) };
    const att = attachPrepare(rec, v.proposal, ctx, enNow ? effectiveConvCaps(rec, enNow) : null);
    if (!att.ok) return att.answer;
    // r6 verify F1 + F3 (2026-09-28, "what you approve is what runs"): WHAT THIS REPLY ANSWERS and WHO RECEIVES
    // it are decided HERE, from this engine's own store, before anything is created or any wake is granted —
    // stored on the proposal, shown on the card, re-judged at approval and handed to the adapter verbatim
    // verify r1 (B-a085): an agent's ADDED Cc puts people the thread never had on the owner's mail — compose's power,
    // so compose's gates: reach over the WHOLE account (a conversation grant reached anybody: direct, no card), and
    // below, direct only when compose's own verdict (the account's policy + its rows' authority) would be direct too
    const ccByAgent = !!(v.proposal.cc && ctx && ctx.kind === 'agent');
    if (ccByAgent && !ACL.canSee(ACL.effective(ctx, { key: '', adapterId: rec.id }, accountScopeGrants(rec.id)).level)) return { ok: false, code: 'bad-proposal', why: 'cc', error: 'adding people to a mail (--cc) is composing to them — it needs access to the whole account, like compose; yours covers this conversation — nothing was created (reply without --cc, or ask the user)' };
    // lane webhook-l1-server: A PINNED RECIPIENT (compose --caller: one proposal per caller) — judged by the adapter's own
    // prepareSend now (a recipient it does not answer for is refused by name), carried as the envelope, no anchor
    const pin = typeof input.recipient === 'string' && input.recipient && !v.proposal.replyTo ? input.recipient : null;
    let ra;
    if (pin) {
      const c1 = registry.capsOf(rec.kind);
      if (!(c1.replyEnvelope === true && c1.prepareSend === true)) return { ok: false, code: 'bad-proposal', why: 'recipient', error: `${rec.label || rec.id} has no per-recipient sends — reply in the conversation` };
      let pr = null;
      try { pr = await adapterFor(rec).adapter.prepareSend(convId, { text: v.proposal.text, recipients: [pin] }); }
      catch (err) { const why = (err && err.detail && err.detail.why) || (err && err.code) || 'unknown'; return { ok: false, code: err && err.code === 'not-found' ? 'not-found' : 'send-not-available', why, error: `${(err && err.message) || why} — nothing was created` }; }
      if (!(pr && Array.isArray(pr.recipients) && pr.recipients.length === 1 && pr.recipients[0] === pin)) return { ok: false, code: 'send-not-available', why: 'recipient', error: `${pin.slice(0, 40)} cannot receive from here — nothing was created` };
      ra = { ok: true, anchor: null, envelope: { anchorId: '', to: pin, cc: null, subject: '', inReplyTo: null, references: null, pinned: true } };
    } else ra = await replyTargetFor(rec, adapterId, convId, v.proposal.replyTo, { all: v.proposal.replyAll === true, cc: v.proposal.cc || null });
    if (!ra.ok) return ra.answer;
    // THE PLACEMENT (2026-09-28, the owner: "the boolean is Lark-shaped") — decided HERE, before anything exists:
    // the PURE verdict over the adapter's DECLARED placements (its `threads` cap row) and ONE fact about the message
    // answered — does it sit in a VENDOR thread (the thread index, local, no vendor call) — so `--to` alone follows the
    // vendor's norm (in a thread ⇒ thread; outside one ⇒ the row's `rootReply`) and an undeclared placement is
    // `placement-not-offered`, worded, with nothing created. A reply INTO a thread (`thread` / `thread+chat`) then
    // needs `thread-reply` offered on THIS conversation (spec §5.2): the group refused it (230071 remembered) ⇒
    // `topic-forbidden`. The thread it lands in is recorded; `inThread` rides beside `placement` as the READ ALIAS.
    const c0 = registry.capsOf(rec.kind);
    let parentKey = null, parentFacts = null;
    if (v.proposal.replyTo) {
      try {
        const ix = threadIxOf(adapterId, convId);
        // quote-vs-topic (2026-09-28): "is the parent inside a thread" is THE classifier's answer (a reply chain — a
        // quote — is not a thread) — the window's tag reads the same one, so the card's placement and the list's tag
        // can never disagree; a thread reply to a message outside any topic records no key (the vendor mints it)
        parentKey = Thr.placeKindOf(String(v.proposal.replyTo), ix).topic;
        parentFacts = { inThread: parentKey !== null };
      } catch { parentKey = null; parentFacts = null; }
    }
    const pv = P.placementVerdict({ requested: v.proposal.placement || null, replyTo: v.proposal.replyTo, caps: c0, parent: parentFacts, alias: !!v.proposal.placementAlias });
    if (!pv.ok) return { ok: false, code: pv.code, why: pv.why, error: pv.error, ...(pv.placement !== undefined ? { placement: pv.placement } : {}), ...(pv.offered ? { offered: pv.offered } : {}) };
    const placement = pv.placement;
    const intoThread = P.isThreadPlacement(placement);
    let threadKey = null;
    if (intoThread) {
      const th = caps.offers(c0, effectiveConvCaps(rec, enNow), 'thread-reply', now());
      if (!th.offered) return th.why === 'topic-forbidden' ? { ok: false, code: 'topic-forbidden', why: 'topic-forbidden', error: 'this group does not allow replies in threads' } : { ok: false, code: 'send-not-available', why: th.why, error: `replying in a thread is not available here (${th.why})` };
      threadKey = parentKey;
    }
    // the card's "Reply in thread — under {author}: "{quote}"" / "Quoted reply — to {author}: …" (spec §5.2): the
    // answered message's own text, one line, ≤ 120 (`threadQuote` kept beside it for a thread reply — the alias)
    let replyQuote = null;
    if (placement !== 'chat') { try { const par = store.findRecord(adapterId, convId, String(v.proposal.replyTo)); replyQuote = par ? P.reactionQuote(par) : null; } catch { replyQuote = null; } }
    // design 012 (Slack S1, D21): WHAT THIS TEXT WILL DO, decided ONCE — an adapter that declares `prepareSend` resolves
    // each @Name to the vendor's id NOW (two people answering one name ⇒ refused, nothing created; a name nobody answers
    // stays words and notifies nobody); stored on the proposal, shown on the card, handed to the send verbatim. And WHO
    // WILL SEE it (`convCaps.audience`, D20), as the card's line
    let prepared = null;
    if (c0.prepareSend === true) {
      try { prepared = await adapterFor(rec).adapter.prepareSend(convId, { text: v.proposal.text }); }
      catch (err) { return { ok: false, code: 'send-not-available', why: 'prepare-send', error: `who this message would notify could not be resolved (${(err && err.code) || 'unknown'}) — nothing was created; propose it again` }; }
      if (prepared.tooLong) return { ok: false, code: 'bad-proposal', why: 'too-long', error: `this message is longer than ${prepared.sendMax || 4000} characters — nothing was created; split it` };
      if (prepared.unresolved.length) return { ok: false, code: 'bad-proposal', why: 'mention-ambiguous', ambiguous: prepared.unresolved.slice(0, 10), error: 'a name after @ answers more than one person in this conversation — nothing was created; write the full name' };
    }
    const audience = ((effectiveConvCaps(rec, enNow) || {}).audience) || null;
    // The authority the drafter holds HERE: the user's own is `send`; an
    // agent's is its assignment's EFFECTIVE authority (clamped), else draft.
    let authority = 'draft';
    if (!ctx || ctx.kind === 'user') authority = 'send';
    else {
      // R4: the authority of the caller's OWN access rows in effect here (the
      // agent's, or a group of its) — the widest one, clamped by both caps
      const effA = effectiveFor(en);
      const capsA = authorityCapsFor(rec, enNow, t);
      if (effA && effA.access.some((x) => F.rowNames(x.row, ctx) && F.effectiveAuthority(x.row, capsA).authority === 'send')) authority = 'send';
    }
    let decision = own
      ? { mode: 'direct', reasons: [], detail: { ownMessage: true } }
      : P.decideOutbound({ channelPolicy: policyFor(rec, en), guards: guardsFromSettings(), proposal: { ...v.proposal, authority }, now: t });
    if (ccByAgent && decision.mode === 'direct') {
      const effC = effectiveForAccount(rec.id);
      const capsC = { offersSend: true, sendWhy: null, policyRequiresReview: policyRequiresReview(rec, null) };
      const authC = effC && effC.access.some((x) => F.rowNames(x.row, ctx) && F.effectiveAuthority(x.row, capsC).authority === 'send') ? 'send' : 'draft';
      const dC = P.decideOutbound({ channelPolicy: policyFor(rec, null), guards: guardsFromSettings(), proposal: { ...v.proposal, authority: authC }, now: t });
      if (dC.mode !== 'direct') decision = dC;
    }
    // verify r2 (IDENTITY): the convCaps lookup above was an await — an agent whose access was removed meanwhile
    // drafts NOTHING (the uniform not-found, before any wake slot is taken)
    if (!stillSees(ctx, adapterId, convId)) return ACL.notFound();
    // r3: a direct send on a channel whose send starts a turn IS a wake —
    // consented and paced BEFORE anything is written
    const gate = wakeGate(convId, decision.mode === 'direct' && sendStartsTurn(rec) ? 1 : 0, guards || {});
    if (!gate.ok) return gate;
    const drafter = !ctx || ctx.kind === 'user' ? { kind: 'user', id: null, name: null } : { kind: 'agent', id: ctx.id, name: ctx.name || null };
    let created = null, staged = null;
    // r4: a THROW after the grant (a blocked / full store) gives the slot back
    try {
      staged = OF.stage(store.dir, att.files);   // design 005: SYNCHRONOUS — no await between the reach re-check above and the record
      await store.outbox.update((ob) => {
        const id = store.outbox.nextId();
        created = ob.proposals[id] = {
          id, adapterId, convId, key: en.key, title: agentTitle(en, convId),   // verify r1 F2: the proposal's title is printed by `vibespace-channels status`
          text: v.proposal.text, originalText: v.proposal.text, replyTo: v.proposal.replyTo, why: v.proposal.why, attachments: OF.metaOf(att.files),
          replyAnchor: ra.anchor, replyEnvelope: ra.envelope,
          ...(prepared ? { prepared: { mentions: prepared.mentions, notifies: prepared.notifies, plain: prepared.plain, at: prepared.at } } : {}), ...(audience ? { audience } : {}),
          placement, ...(placement !== 'chat' ? { replyQuote } : {}), ...(pv.defaulted && placement !== 'chat' ? { placementDefaulted: pv.rule } : {}),
          ...(intoThread ? { inThread: true, threadKey, threadQuote: replyQuote } : {}),
          draftedBy: drafter, ...drafterGroupsOf(ctx), authority, at: t, updatedAt: t, state: 'proposed',
          policy: { mode: decision.mode, reasons: decision.reasons, detail: decision.detail },
          sendAs: who.as, identity: identityFor(rec, who.as),
          ttlMs: P.PROPOSAL_TTL_MS, awaitingSince: null, edited: false, approvedBy: null, reason: null, result: null, receipt: null, receiptDelivery: null,
          history: [{ state: 'proposed', at: t, by: drafter.kind }],
        };
      });
      OF.commit(store.dir, staged, created.id);
      staged = null;
      auditOutbox(created, 'propose', { mode: decision.mode, reasons: decision.reasons });
      if (decision.mode === 'direct') {
        await transition(created.id, 'sending', 'policy', (p) => { p.approvedBy = 'policy'; });
        await sendNow(created.id);
        wakeRefundIfUnsent(gate, guards, convId, created.id);
      }
    } catch (err) {
      OF.discard(staged);
      wakeRefundIfUnsent(gate, guards, convId, created && created.id, { threw: true });
      throw err;
    }
    if (decision.mode !== 'direct') {
      await transition(created.id, 'awaiting-approval', 'policy');
      await pointerSync(en.key);
      notifyOutbox([created.id]);
      notify([convId]);
    }
    const fresh = store.outbox.snapshot().proposals[created.id];
    return { ok: true, proposal: agentProposalView(ctx, fresh), decision };
  }

  /**
   * AN AGENT'S REACTION = A PROPOSAL OF KIND `reaction` (lane channel-threads, spec §5.3). Reach first (a hidden
   * conversation is the uniform not-found); the ACCOUNT's reaction row (`off` ⇒ `react-not-available` why
   * `policy-off`, NO proposal row); the control offered here (`react` / `unreact` — the conversation's resolved
   * row, one lookup when unknown); a message the log holds; a key the adapter's set lists (`bad-emoji`); the local
   * fold (an add already there ⇒ `already-reacted`, a removal of a reaction that is not the account's ⇒
   * `reaction-not-mine`); then `decideReaction` — the row over the channel's verdict (review by default; `direct`
   * only where the channel itself would send directly). No text, no edit, no wake: its receipt is one line in the
   * next turn. The same (message, key, op) already awaiting answers that proposal (`already: true`).
   */
  async function proposeReaction(ctx, adapterId, convId, input = {}) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec) return ACL.notFound();
    const agent = !!(ctx && ctx.kind === 'agent');
    if (agent && !ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();
    if (rec.enabled === false) return { ok: false, code: 'react-not-available', why: 'disabled', error: `${rec.label || rec.id} is disabled` };
    const row = P.reactionPolicyOf(rec.reactionPolicy);
    if (agent && row === 'off') return { ok: false, code: 'react-not-available', why: 'policy-off', error: 'reactions are not offered here (policy-off): the user turned agent reactions off for this account' };
    const op = input && input.op === 'remove' ? 'remove' : 'add';
    const c = registry.capsOf(rec.kind);
    const rr = reactionsRow(c);
    if (op === 'add' ? !rr.add : rr.remove !== 'own') return { ok: false, code: 'react-not-available', why: (c.sendAs || []).length ? 'react-not-declared' : 'read-only-adapter', error: `reactions are not offered here (${(c.sendAs || []).length ? 'react-not-declared' : 'read-only-adapter'})` };
    const offer = await offerNow(rec, adapterId, convId, op === 'add' ? 'react' : 'unreact');
    if (!offer.offered) return { ok: false, code: 'react-not-available', why: offer.why, error: `reactions are not offered here (${offer.why})` };
    const e = adapterFor(rec);
    let set = vocabularyOf(rec, e);
    if (!set && e.rxSetFlight) { try { await e.rxSetFlight; } catch { } set = e.rxSet && e.rxSet.set; }
    const v = P.validateReaction({ ...input, op }, set || { keys: [] });
    if (!v.ok) return { ok: false, code: v.code, why: v.why, error: v.error };
    const target = store.findRecord(adapterId, convId, v.proposal.msg);
    if (!target) return { ok: false, code: 'not-found', error: 'no such message in this conversation (read it first — the id is the one `read` prints)' };
    const now0 = (reactionsFor(rec, convId, [v.proposal.msg], { e }).get(v.proposal.msg) || []).find((x) => x.key === v.proposal.key);
    if (op === 'add' && now0 && now0.mine) return { ok: false, code: 'already-reacted', error: 'the account owner already reacted with that' };
    if (op === 'remove' && !(now0 && now0.mine)) return { ok: false, code: 'reaction-not-mine', error: 'only a reaction the account owner added can be removed' };
    const pending = proposalsFor(en.key).find((q) => q.kind === 'reaction' && q.reaction && (q.state === 'awaiting-approval' || q.state === 'proposed' || q.state === 'sending') && q.reaction.msg === v.proposal.msg && q.reaction.key === v.proposal.key && q.reaction.op === op && (!agent || (q.draftedBy && q.draftedBy.id === ctx.id)));
    if (pending) return { ok: true, already: true, proposal: agentProposalView(ctx, pending), decision: pending.policy || null };
    const t = now();
    let authority = 'draft';
    if (!agent) authority = 'send';
    else {
      const effA = effectiveFor(en);
      const capsA = authorityCapsFor(rec, en, t);
      if (effA && effA.access.some((x) => F.rowNames(x.row, ctx) && F.effectiveAuthority(x.row, capsA).authority === 'send')) authority = 'send';
    }
    const decision = agent ? P.decideReaction({ reactionPolicy: row, channelPolicy: policyFor(rec, en), authority, now: t }) : { mode: 'direct', reasons: [], detail: { ownMessage: true } };
    if (decision.refused) return { ok: false, code: decision.code, why: decision.why, error: `reactions are not offered here (${decision.why})` };
    const drafter = agent ? { kind: 'agent', id: ctx.id, name: ctx.name || null } : { kind: 'user', id: null, name: null };
    // verify r2 (IDENTITY): offerNow / the vocabulary were awaits — a revoke that landed meanwhile creates NOTHING
    if (!stillSees(ctx, adapterId, convId)) return ACL.notFound();
    let created = null;
    await store.outbox.update((ob) => {
      const id = store.outbox.nextId();
      created = ob.proposals[id] = {
        id, kind: 'reaction', adapterId, convId, key: en.key, title: agentTitle(en, convId),   // verify r1 F2: the same for a reaction proposal
        reaction: { msg: v.proposal.msg, key: v.proposal.key, op, glyph: v.proposal.glyph, label: v.proposal.label, quote: P.reactionQuote(target) },
        text: '', originalText: '', replyTo: v.proposal.msg, why: v.proposal.why, attachments: [],
        draftedBy: drafter, ...drafterGroupsOf(ctx), authority, at: t, updatedAt: t, state: 'proposed',
        policy: { mode: decision.mode, reasons: decision.reasons, detail: decision.detail },
        sendAs: 'user', identity: identityFor(rec, 'user'),
        ttlMs: P.PROPOSAL_TTL_MS, awaitingSince: null, edited: false, approvedBy: null, reason: null, result: null, receipt: null, receiptDelivery: null,
        history: [{ state: 'proposed', at: t, by: drafter.kind }],
      };
    });
    auditOutbox(created, 'propose', { mode: decision.mode, reasons: decision.reasons, reaction: { op, key: v.proposal.key, msg: v.proposal.msg } });
    if (decision.mode === 'direct') {
      await transition(created.id, 'sending', 'policy', (q) => { q.approvedBy = 'policy'; });
      await sendNow(created.id);
    } else {
      await transition(created.id, 'awaiting-approval', 'policy');
      await pointerSync(en.key);
      notifyOutbox([created.id]);
      notify([convId]);
    }
    const fresh = store.outbox.snapshot().proposals[created.id];
    return { ok: true, proposal: agentProposalView(ctx, fresh), decision };
  }
  const COMPOSE_NOT_FOUND = 'no such account (not found, or you have no access to the whole account) — `vibespace-channels status` shows your access';
  /**
   * COMPOSE A NEW MESSAGE (B-6acc, the owner 2026-09-26: "给我一个agent使用
   * 我的 gmail 的能力，让它能读取和发送邮件"). A NEW conversation, where
   * `reply` only answers inside one. Everything a reply rides applies:
   * REACH FIRST — an agent needs access to the WHOLE account (an account
   * access row, or a hand-written account-scope grant), else the uniform
   * not-found; the adapter must DECLARE `caps.compose` (Lark does not —
   * `compose-not-available`, by name); the account's send identity is asked
   * NOW (`composeCaps` — Gmail without a sending scope answers
   * `send-scope-not-granted` and NOTHING is created); the SAME outbox policy
   * (the account's, else the adapter's default — review; direct only when it
   * says so AND the caller's account access holds `send` AND no guard fires:
   * links, attachments, off-hours), the same honesty line, the same audit,
   * the same receipt. The proposal is keyed `<account>/~compose/<id>` until
   * the vendor answers with the new thread's id.
   */
  /**
   * lane webhook-l1-server: COMPOSE TO NAMED RECIPIENTS of one conversation (`compose --caller <id>[,<id>]|all` on a webhook
   * path) — the adapter's prepareSend expands and judges the list ONCE (unknown / revoked / delivery none refused by name,
   * COMPOSE_MAX_RECIPIENTS the ceiling), then ONE proposal per recipient through `propose` (each its own policy, card,
   * receipt). `{ok, proposals: [{recipient, ...answer}], skipped}`.
   */
  // lane webhook-l3-cli-pair: a caller row a refusal names reaches the agent through the belt (a paired peer's name is ITS words)
  const callerRow = (c) => ({ id: agentId(String((c && c.id) || ''), 40), name: agentId(String((c && c.name) || ''), 80), delivery: c && c.delivery });
  async function composeEach(ctx, adapterId, convId, input = {}, guards = {}) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec) return ACL.notFound();
    if (ctx && ctx.kind === 'agent' && !ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();
    const c = registry.capsOf(rec.kind);
    if (!(c.prepareSend === true && c.replyEnvelope === true)) return { ok: false, code: 'compose-not-available', error: `${rec.label || rec.id} has no per-recipient sends` };
    let pr;
    try { pr = await adapterFor(rec).adapter.prepareSend(convId, { text: String((input && input.text) || ''), recipients: input && input.recipients }); }
    catch (err) { const why = (err && err.detail && err.detail.why) || (err && err.code) || 'unknown'; return { ok: false, code: err && err.code === 'not-found' ? 'not-found' : 'send-not-available', why, error: (err && err.message) || why, ...(err && err.detail && Array.isArray(err.detail.callers) ? { callers: err.detail.callers.slice(0, 50).map(callerRow) } : {}) }; }
    const ids = Array.isArray(pr && pr.recipients) ? pr.recipients : [];
    if (!ids.length) return { ok: false, code: 'send-not-available', why: 'no-recipient', error: 'nobody to send to — nothing was created' };
    const proposals = [];
    for (const id of ids) proposals.push({ recipient: id, ...(await propose(ctx, adapterId, convId, { ...input, recipient: id, replyTo: null }, guards)) });
    return { ok: proposals.every((x) => x.ok), proposals, skipped: Array.isArray(pr.skipped) ? pr.skipped : [] };
  }
  async function compose(ctx, adapterId, input, guards = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId) || null;
    const agent = !!(ctx && ctx.kind === 'agent');
    if (!rec) return agent ? { ok: false, code: 'not-found', error: COMPOSE_NOT_FOUND } : { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    if (agent && !ACL.canSee(ACL.effective(ctx, { key: '', adapterId: rec.id }, accountScopeGrants(rec.id)).level)) return { ok: false, code: 'not-found', error: COMPOSE_NOT_FOUND };
    if (rec.enabled === false) return { ok: false, code: 'send-not-available', error: `${rec.label || rec.id} is disabled`, why: 'disabled' };
    const c = registry.capsOf(rec.kind);
    if (!(c.compose === true && (c.sendAs || []).length)) return { ok: false, code: 'compose-not-available', error: `${rec.label || rec.id} cannot start a new conversation from here — its adapter declares no compose; reply inside an existing conversation instead` };
    const v = P.validateCompose(input);
    if (!v.ok) return { ok: false, code: 'bad-proposal', error: v.error, ...(v.why ? { why: v.why } : {}) };
    const att = attachPrepare(rec, v.proposal, ctx);
    if (!att.ok) return att.answer;
    let who = null;
    try {
      const cc = await adapterFor(rec).adapter.composeCaps();
      const as = Array.isArray(cc.sendAs) ? cc.sendAs : [];
      who = as.includes('user') ? { as: 'user', why: null } : as.includes('bot') ? { as: 'bot', why: null } : { as: null, why: cc.why || 'unknown' };
    } catch (err) { who = { as: null, why: (err && err.detail && err.detail.why) || (err && err.code) || 'unknown' }; }
    if (!who.as) return { ok: false, code: 'send-not-available', error: `sending is not available on this account (${who.why})`, why: who.why };
    const t = now();
    // the authority the drafter holds ON THE ACCOUNT: the user's own is
    // `send`; an agent's is its account access rows' (itself or a group of
    // its), clamped by the account's two caps — else draft
    let authority = 'draft';
    if (!agent) authority = 'send';
    else {
      const effA = effectiveForAccount(rec.id);
      const capsA = { offersSend: true, sendWhy: null, policyRequiresReview: policyRequiresReview(rec, null) };
      if (effA && effA.access.some((x) => F.rowNames(x.row, ctx) && F.effectiveAuthority(x.row, capsA).authority === 'send')) authority = 'send';
    }
    const decision = P.decideOutbound({ channelPolicy: policyFor(rec, null), guards: guardsFromSettings(), proposal: { ...v.proposal, authority }, now: t });
    const drafter = agent ? { kind: 'agent', id: ctx.id, name: ctx.name || null } : { kind: 'user', id: null, name: null };
    // verify r2 (IDENTITY): composeCaps above was an await — access to the account removed meanwhile ⇒ nothing drafted
    if (agent && !stillSees(ctx, adapterId, null)) return { ok: false, code: 'not-found', error: COMPOSE_NOT_FOUND };
    let created = null;
    const staged = OF.stage(store.dir, att.files);   // design 005: synchronous, after the last await above
    await store.outbox.update((ob) => {
      const id = store.outbox.nextId();
      const cp = v.proposal.compose;
      created = ob.proposals[id] = {
        id, adapterId, convId: null, key: `${adapterId}/~compose/${id}`, title: cp.subject,
        compose: { to: cp.to.slice(), cc: cp.cc.slice(), subject: cp.subject },
        text: v.proposal.text, originalText: v.proposal.text, replyTo: null, why: v.proposal.why, attachments: OF.metaOf(att.files),
        draftedBy: drafter, ...drafterGroupsOf(ctx), authority, at: t, updatedAt: t, state: 'proposed',
        policy: { mode: decision.mode, reasons: decision.reasons, detail: decision.detail },
        sendAs: who.as, identity: identityFor(rec, who.as),
        ttlMs: P.PROPOSAL_TTL_MS, awaitingSince: null, edited: false, approvedBy: null, reason: null, result: null, receipt: null, receiptDelivery: null,
        history: [{ state: 'proposed', at: t, by: drafter.kind }],
      };
    }).catch((err) => { OF.discard(staged); throw err; });
    OF.commit(store.dir, staged, created.id);
    auditOutbox(created, 'propose', { mode: decision.mode, reasons: decision.reasons, compose: true });
    if (decision.mode === 'direct') {
      await transition(created.id, 'sending', 'policy', (p) => { p.approvedBy = 'policy'; });
      await sendNow(created.id);
    } else {
      await transition(created.id, 'awaiting-approval', 'policy');
      await composePointerSync(adapterId);
      notifyOutbox([created.id]);
    }
    const fresh = store.outbox.snapshot().proposals[created.id];
    return { ok: true, proposal: agentProposalView(ctx, fresh), decision };
  }
  /** The For-you pointer for COMPOSED messages awaiting approval — one per
   *  account (a composed message has no conversation to hang one on), its
   *  id on the account record, retracted by this producer when the last one
   *  leaves `awaiting-approval`. */
  async function composePointerSync(adapterId) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return;
    const awaiting = proposalsFor().filter((p) => p.adapterId === adapterId && p.compose && p.state === 'awaiting-approval');
    const label = rec.label || rec.id;
    if (awaiting.length) {
      if (rec.composeTodoId || !userTodos || typeof userTodos.add !== 'function') return;
      const latest = awaiting[0];
      const who = latest.draftedBy && latest.draftedBy.kind === 'agent' ? (latest.draftedBy.name || latest.draftedBy.id) : null;
      const subject = String((latest.compose && latest.compose.subject) || '').slice(0, 160);
      const to = ((latest.compose && latest.compose.to) || []).join(', ').slice(0, 200);
      try {
        const item = userTodos.add(INBOX_KEY, {
          origin: 'channels', urgency: 'normal', by: 'agent', sessionName: 'Channels',
          text: `New messages awaiting approval on ${label}`,
          detail: `${awaiting.length} new message(s) awaiting your approval on ${label}.\nLatest${who ? ` (${who})` : ''}: to ${to} — "${subject}"\n\nOpen the Outbox (rail → Channels → Outbox) to approve, edit or reject.`,
          i18n: {
            text: { key: i18nKey('New messages awaiting approval on {account}'), params: { account: label } },
            detail: [
              { key: i18nKey('{n} new message(s) awaiting your approval on {account}.'), params: { n: awaiting.length, account: label } },
              { key: i18nKey('Latest: to {to} — "{subject}"'), params: { to, subject } },
              { key: i18nKey('Open the Outbox (rail → Channels → Outbox) to approve, edit or reject.') },
            ],
            source: INBOX_SOURCE,
          },
        });
        if (item && item.id) await store.adapters.update(() => { rec.composeTodoId = item.id; });
      } catch (e) { log.warn(`[channels] ${adapterId}: could not file the compose approval pointer (${(e && e.message) || e}) — the Outbox badge still shows it`); }
      return;
    }
    if (!rec.composeTodoId) return;
    const id = rec.composeTodoId;
    await store.adapters.update(() => { rec.composeTodoId = null; });
    if (!userTodos || typeof userTodos.get !== 'function') return;
    try { const it = userTodos.get(id); if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(id, 'done', RESOLVED_BY); } catch {}
  }

  /**
   * APPROVE (maybe edited). THE UNCONDITIONAL RE-RESOLUTION (§9.2 r4): a
   * proposal may have waited 24 h; the conversation may have kicked the user
   * out, turned read-only or been dissolved. `convCaps` is refreshed here,
   * before the send, every time — and a "cannot send" answer stops with the
   * typed `send-not-available` plus the adapter's own reason, the proposal
   * lands in `failed`, and the receipt carries that reason verbatim.
   */
  /** slack-core verify r1 (F2): the decision an owner's edit carries (see approve) — `{ok, prepared}` or a refusal. */
  async function prepareEdit(p0, text) {
    const rec = adapterRecords().adapters.find((r) => r.id === p0.adapterId) || null;
    if (!rec) return { ok: true, prepared: null };   // the approval's recheck refuses it by name
    let fresh;
    try { fresh = await adapterFor(rec).adapter.prepareSend(p0.convId, { text }); }
    catch (err) { return { ok: false, code: 'send-not-available', why: 'prepare-send', error: `who the edited message would notify could not be resolved (${(err && err.code) || 'unknown'}) — nothing was sent; approve it again` }; }
    if (fresh.tooLong) return { ok: false, code: 'bad-proposal', why: 'too-long', error: 'the edited message is longer than one message may be here — nothing was sent; shorten it' };
    const was = p0.prepared || {};
    const old = new Map((Array.isArray(was.mentions) ? was.mentions : []).map((m, i) => [m.name, { m, as: (Array.isArray(was.notifies) && was.notifies[i]) || m.name }]));
    const ambiguous = fresh.unresolved.filter((n) => !old.has(n));
    if (ambiguous.length) return { ok: false, code: 'bad-proposal', why: 'mention-ambiguous', ambiguous: ambiguous.slice(0, 10), error: 'a name after @ in the edit answers more than one person in this conversation — nothing was sent; write the full name' };
    const out = { mentions: [], notifies: [], plain: [], at: fresh.at };
    const keep = (n) => { const o = old.get(n); out.mentions.push(o.m); out.notifies.push(o.as); };
    fresh.mentions.forEach((m, i) => { if (old.has(m.name)) keep(m.name); else { out.mentions.push(m); out.notifies.push(fresh.notifies[i] || m.name); } });
    for (const n of fresh.unresolved) keep(n);
    for (const n of fresh.plain) { if (old.has(n)) keep(n); else out.plain.push(n); }
    return { ok: true, prepared: out };
  }
  async function approve(id, { text = null, by = 'user', consent = null, mayWake = null, deliver = null, shown = null, withoutFiles = false } = {}) {
    const p0 = store.outbox.snapshot().proposals[id];
    if (!p0) return { ok: false, code: 'not-found', error: 'no such proposal' };
    if (p0.state !== 'awaiting-approval') return { ok: false, code: 'bad-state', error: `proposal is ${p0.state}, not awaiting approval`, state: p0.state };
    // r6 verify F6: the approval names WHAT THE CARD SHOWED (`shown` = the PURE digest of the record it was drawn
    // from); a proposal that no longer is that record — the text, the conversation, the answered message, the
    // recipients, the identity, the sender line — is refused by name, nothing moves and nothing is sent
    if (shown !== null && shown !== undefined) {
      const now0 = P.shownDigest(proposalView(p0));
      if (String(shown) !== now0) return { ok: false, code: 'changed-since-shown', error: 'this proposal is not what the card you approved showed — nothing was sent; read the card again, then decide', proposal: proposalView(p0) };
    }
    // r3: approving a send that starts a turn is a wake — the echo first
    // (nothing moves on a refusal: the proposal still awaits). 2026-09-27: a
    // receipt the decider chose to deliver NOW is a wake too — in the same echo
    const reactionKind = p0.kind === 'reaction';
    // lane channel-threads: a reaction has no text to edit and never starts a turn (spec §5.3)
    if (reactionKind && typeof text === 'string' && text.trim()) return { ok: false, code: 'bad-proposal', error: 'a reaction has no text to edit — approve or reject it', why: 'reaction' };
    const wakeN = !reactionKind && sendStartsTurn(adapterRecords().adapters.find((r) => r.id === p0.adapterId) || null) ? 1 : 0;
    const rch = receiptChoiceFor(p0, deliver);
    const echo = wakeGate(p0.convId, wakeN + rch.n, { consent });
    if (!echo.ok) return { ...echo, proposal: proposalView(p0) };
    const receiptChoice = receiptPaceFor(p0, rch, mayWake);
    const edited = !reactionKind && typeof text === 'string' && text.trim() && text !== p0.text;
    if (edited) {
      // verify r1 (C1): the STORED files are records (their bytes on disk, bound by sha256) — the edit re-judges the text
      const v = P.validateProposal({ ...p0, text, attachments: undefined });
      if (!v.ok) return { ok: false, code: 'bad-proposal', error: v.error };
    }
    // slack-core verify r1 (F2): an OWNER'S EDIT on an adapter that declared `prepareSend` is decided like the proposal
    // was — an @name the edit ADDS is resolved now (two people answering it ⇒ refused by name, nothing sent), a name the
    // proposal decided keeps its id (decided once), a name the edit dropped notifies nobody; stored with the edit
    let prepared = null;
    if (edited && p0.prepared && !p0.compose) {
      const pe = await prepareEdit(p0, text);
      if (!pe.ok) return { ...pe, proposal: proposalView(p0) };
      prepared = pe.prepared;
    }
    const composing = !!p0.compose && !p0.result;
    const cf0 = composing ? { en: null, rec: adapterRecords().adapters.find((r) => r.id === p0.adapterId) || null } : convFor(p0.adapterId, p0.convId);
    const { en, rec } = cf0;
    const t = now();
    let cc = null, ccErr = null;
    // a COMPOSED message re-asks the ACCOUNT (`composeCaps`), a reply its conversation
    if (rec) { try { cc = composing ? await adapterFor(rec).adapter.composeCaps() : await refreshConvCaps(p0.adapterId, p0.convId, { join: false }); } catch (err) { ccErr = (err && err.message) || String(err); } }
    const c = rec ? registry.capsOf(rec.kind) : null;
    const stillOffered = composing
      ? !!(rec && cc && Array.isArray(cc.sendAs) && cc.sendAs.includes(p0.sendAs))
      : reactionKind
        ? !!(rec && en && cc && c && caps.offers(c, cc, p0.reaction && p0.reaction.op === 'remove' ? 'unreact' : 'react', t).offered)
        : !!(rec && en && cc && c && caps.offers(c, cc, p0.sendAs === 'bot' ? 'send-as-bot' : 'send-as-user', t).offered);
    // r6 verify F1 / F3: the reply's target re-judged — the answered message must still be a STORED message of this
    // conversation, and an envelope adapter's recipients must be the ones resolved (and shown) at propose
    const targetWhy = stillOffered && !composing ? replyRecheck(p0, rec) : null;
    if (!stillOffered || targetWhy) {
      const why = targetWhy || (!rec ? 'adapter no longer exists' : ccErr ? `convCaps could not be resolved (${ccErr})` : (cc && cc.why) || 'not-offered');
      await transition(id, 'failed', 'recheck', (p) => {
        p.approvedBy = by; if (edited) { p.text = text; p.edited = true; if (prepared) p.prepared = prepared; }
        stampReceiptChoice(p, receiptChoice);
        p.reason = `send-not-available: ${why}`; p.failure = { code: 'send-not-available', why, at: now() };
      });
      const p1 = store.outbox.snapshot().proposals[id];
      auditOutbox(p1, 'refused-at-approval', { code: 'send-not-available', why });
      await receipt(id);
      await pointerSync(p1.key);
      notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
      log.log(`[channels] outbox ${id}: approval refused — ${why}`);
      return { ok: false, code: 'send-not-available', why, error: `cannot send now: ${why}`, proposal: proposalView(store.outbox.snapshot().proposals[id]) };
    }
    // lane lark-upload-preflight (userW inc-muxsy69b-mjg1): WHAT THE CARD SHOWS IS WHAT LANDS — files this account cannot
    // carry leave only as the owner's "Send without the file" (`withoutFiles`); a plain Approve is refused, nothing sent
    const stored0 = reactionKind ? [] : P.storedAttachments(p0);
    const fb = stored0.length && rec ? filesBlockedOf(filesOfferFor(rec, cc, t)) : null;
    if (stored0.length && withoutFiles && !String((edited ? text : p0.text) || '').trim()) return { ok: false, code: 'bad-proposal', why: 'nothing-without-files', error: 'this proposal is only its files — without them nothing is left to send; reject it, or re-authorize the account and approve again', proposal: proposalView(p0) };
    if (fb && !withoutFiles) return { ok: false, code: 'attachments-not-sendable', why: 'attachments-not-sendable', requiredScopes: fb.requiredScopes, error: `this account's sign-in cannot send files (needs ${fb.requiredScopes.join(' or ')}) — nothing was sent; re-authorize the account, or approve it as "Send without the file"`, proposal: proposalView(p0) };
    const leftOut = stored0.length && withoutFiles ? { at: t, why: fb ? fb.why : 'owner', requiredScopes: fb ? fb.requiredScopes : [] } : null;
    // …then the pace, only once the send is still offered (a refusal above
    // spends no slot); a floored approve leaves the proposal AWAITING
    const gate = wakeGate(p0.convId, wakeN, { mayWake });
    if (!gate.ok) return { ...gate, proposal: proposalView(store.outbox.snapshot().proposals[id]) };
    // r4: a THROW after the grant (the transition's or the send's store
    // write refused) gives the slot back unless the request may have left
    try {
      const tr = await transition(id, 'sending', by, (p) => { if (leftOut) p.filesLeftOut = leftOut; p.approvedBy = by; if (edited) { p.text = text; p.edited = true; if (prepared) p.prepared = prepared; } stampReceiptChoice(p, receiptChoice); });
      if (!tr.ok) { wakeRefundIfUnsent(gate, { mayWake }, p0.convId, id); return { ok: false, code: 'bad-state', error: tr.why }; }
      auditOutbox(store.outbox.snapshot().proposals[id], 'approve');
      await sendNow(id);
    } catch (err) {
      wakeRefundIfUnsent(gate, { mayWake }, p0.convId, id, { threw: true });
      throw err;
    }
    wakeRefundIfUnsent(gate, { mayWake }, p0.convId, id);
    const fresh = store.outbox.snapshot().proposals[id];
    return { ok: fresh.state === 'sent', code: fresh.state === 'sent' ? null : fresh.state, error: fresh.state === 'sent' ? null : (fresh.reason || fresh.state), proposal: proposalView(fresh) };
  }

  // ── HOW THE DRAFTER HEARS OF A DECISION IS CHOSEN AT THE DECISION (2026-09-27, owner ruling) ──
  /** The decider's delivery choice, normalized (`next-turn` unless `wake-now`
   *  was asked), and how many wakes it would cause (0 | 1 — only an agent's
   *  draft has somebody to wake). */
  function receiptChoiceFor(p0, deliver) {
    // a reaction never earns a billed turn (spec §5.3): its receipt rides the next one, whatever was asked
    if (p0 && p0.kind === 'reaction') return { choice: 'next-turn', n: 0 };
    const choice = deliver === 'wake-now' ? 'wake-now' : 'next-turn';
    return { choice, n: choice === 'wake-now' && p0 && p0.draftedBy && p0.draftedBy.kind === 'agent' && p0.draftedBy.id ? 1 : 0 };
  }
  /** With sign-in OFF the owner's routes are paced like an agent (`mayWake`,
   *  the groups engine's persisted ledger, keyed by the drafter): a floored
   *  wake-now is DOWNGRADED to the next message and says so — the decision
   *  itself is never refused for it. `{choice, paced}`. */
  function receiptPaceFor(p0, rch, mayWake) {
    if (!rch.n || typeof mayWake !== 'function') return { choice: rch.choice, paced: null };
    let pace = null;
    try { pace = mayWake(p0.draftedBy.id); } catch (err) { pace = { reason: `the wake pace failed (${(err && err.message) || err})` }; }
    if (pace === true) return { choice: rch.choice, paced: null };
    return { choice: 'next-turn', paced: String((pace && pace.reason) || 'rate floor').slice(0, 200) };
  }
  function stampReceiptChoice(p, rc) {
    p.receiptChoice = rc.choice;
    if (rc.paced) p.receiptChoicePaced = rc.paced;
  }

  async function reject(id, { reason = null, by = 'user', deliver = null, consent = null, mayWake = null } = {}) {
    const p00 = store.outbox.snapshot().proposals[id];
    const rch = receiptChoiceFor(p00, deliver);
    // a rejection the decider wants the agent to hear NOW is a wake — its echo first (nothing moves on a refusal)
    if (p00 && p00.state === 'awaiting-approval') {
      const echo = wakeGate(p00.convId, rch.n, { consent });
      if (!echo.ok) return { ...echo, proposal: proposalView(p00) };
    }
    const receiptChoice = p00 && p00.state === 'awaiting-approval' ? receiptPaceFor(p00, rch, mayWake) : { choice: rch.choice, paced: null };
    const tr = await transition(id, 'rejected', by, (p) => { p.reason = reason ? String(reason).slice(0, 500) : P.REJECTED_DEFAULT_REASON; p.approvedBy = null; stampReceiptChoice(p, receiptChoice); });
    if (!tr.ok) return { ok: false, code: 'bad-state', error: tr.why, state: (store.outbox.snapshot().proposals[id] || {}).state || null };
    const p = store.outbox.snapshot().proposals[id];
    auditOutbox(p, 'reject', { reason: p.reason });
    await receipt(id);
    await pointerSync(p.key);
    notifyOutbox([id]); notify(p.convId ? [p.convId] : []);
    return { ok: true, proposal: proposalView(store.outbox.snapshot().proposals[id]) };
  }

  // ── THE AGENT TAKES ITS OWN PROPOSAL BACK (2026-09-27, the owner: "agent
  // 似乎没有撤回之前制作的 draft 的能力，必须要我手动 reject 是吗？") ──────────
  // `withdrawn` is a terminal state the PURE table lets ONLY `agent` enter,
  // ONLY from `proposed` / `awaiting-approval` (never from `sending`, never
  // from a lost outcome). The drafter is the proposal's own conversation id —
  // a Task-Group sibling is `not-yours`, never a silent no-op. Withdrawing
  // retracts the conversation's For-you pointer through the SAME producer
  // (`pointerSync`) the moment no proposal awaits there, audits one line and
  // broadcasts ONCE. The receipt is recorded (`status` shows it) and never
  // handed back to the agent that did it.
  //
  // REPLACE = withdraw + a new proposal, ATOMIC: the old one is checked
  // (yours, still withdrawable) BEFORE anything is created; the new one is
  // proposed; the old one is withdrawn ONLY if the policy accepted the new one
  // (created — awaiting approval or sent). A refusal of the new one leaves the
  // old one standing. While a replace runs, the old id is HELD: an approve /
  // reject of it waits for the replace to settle (and then finds it withdrawn),
  // the TTL sweep skips it — no decision can land between the check and the
  // withdrawal.
  const proposalHolds = new Map();   // proposal id → the tail of the work queued on it
  function onProposal(id, fn) {
    const prev = proposalHolds.get(id) || Promise.resolve();
    const run = prev.then(() => fn(), () => fn());
    const tail = run.then(() => {}, () => {}).then(() => { if (proposalHolds.get(id) === tail) proposalHolds.delete(id); });
    proposalHolds.set(id, tail);
    return run;
  }
  /** Who is asking, and may they see this proposal at all? A caller that
   *  cannot see its conversation (or its account, for a composed one) and
   *  shares no Task Group with its drafter gets the uniform not-found (no
   *  existence oracle); one that can is told `not-yours`. */
  function withdrawRefusal(p, by, verdict) {
    if (verdict.code !== 'not-yours') return { ok: false, code: verdict.code, error: verdict.why, state: p.state };
    const ctx = by || {};
    const d = p.draftedBy || {};
    let visible = false;
    try {
      if (p.convId) { const { en, rec } = convFor(p.adapterId, p.convId); visible = !!(en && rec && ACL.canSee(reachFor(ctx, rec, en).level)); }
      else visible = ACL.canSee(ACL.effective(ctx, { key: '', adapterId: p.adapterId }, accountScopeGrants(p.adapterId)).level);
    } catch { visible = false; }
    const mine = Array.isArray(ctx.groups) ? ctx.groups : [];
    const sibling = d.kind === 'agent' && d.id ? groupsOfSession(d.id).some((g) => mine.includes(g)) : false;
    if (!visible && !sibling) return { ok: false, code: 'not-found', error: 'no such proposal (not found, or not yours)' };
    return { ok: false, code: 'not-yours', error: verdict.why, state: p.state };
  }
  async function withdrawNow(id, by, why, { replacedBy = null, notifyNow = true } = {}) {
    const p0 = store.outbox.snapshot().proposals[id];
    if (!p0) return { ok: false, code: 'not-found', error: 'no such proposal (not found, or not yours)' };
    const v = P.withdrawVerdict(p0, by);
    if (!v.ok) return withdrawRefusal(p0, by, v);
    const w = P.withdrawWhy(why);
    const tr = await transition(id, 'withdrawn', 'agent', (p, t) => {
      p.reason = P.withdrawReason(w);
      p.withdrawal = { by: { kind: 'agent', id: by.id, name: by.name || (p.draftedBy && p.draftedBy.name) || null }, why: w, at: t };
      if (replacedBy) p.replacedBy = replacedBy;
      p.approvedBy = null;
    });
    if (!tr.ok) {
      // the table refused between the read and the write (a decision landed first)
      const p1 = store.outbox.snapshot().proposals[id] || p0;
      return { ok: false, code: 'not-withdrawable', error: `proposal ${id} cannot be withdrawn: ${tr.why}`, state: p1.state };
    }
    const p = store.outbox.snapshot().proposals[id];
    auditOutbox(p, 'withdraw', { why: w, by: by.id, ...(replacedBy ? { replacedBy } : {}) });
    // the receipt is RECORDED (`status` shows it) — never handed back to the agent that did it
    const rc = P.receiptFor(p);
    if (rc) await store.outbox.update((ob) => { if (ob.proposals[id]) ob.proposals[id].receipt = rc; });
    await pointerSync(p.key);
    if (notifyNow) { notifyOutbox([id]); notify(p.convId ? [p.convId] : []); }
    log.log(`[channels] outbox ${id}: withdrawn by its drafter ${by.id}${replacedBy ? ` (replaced by ${replacedBy})` : ''}`);
    return { ok: true, proposal: agentProposalView(by, store.outbox.snapshot().proposals[id]) };
  }
  /** WITHDRAW (the agent's own verb). `by` = the caller's principal as the
   *  route resolved it (`{kind:'agent', id, name, groups}`). */
  function withdrawProposal({ proposalId, why = null, by = null } = {}) {
    const id = String(proposalId || '');
    if (!id) return Promise.resolve({ ok: false, code: 'bad-request', error: 'a proposal id is required' });
    if (!by || by.kind !== 'agent' || !by.id) return Promise.resolve({ ok: false, code: 'not-yours', error: 'only the agent that proposed it can withdraw a proposal (the user rejects it)' });
    return onProposal(id, () => withdrawNow(id, by, why));
  }
  /**
   * REPLACE: `make()` proposes the new one (the route's own `propose` /
   * `compose` call, with its guards); the old one is withdrawn only if that
   * was accepted. `{ok, proposal, decision, replaced}` — the NEW proposal's
   * answer, plus the old one's withdrawn view; a refusal of either names it
   * and leaves the old one as it was.
   */
  function replaceProposal({ replaces, why = null, by = null, make } = {}) {
    const oldId = String(replaces || '');
    if (!oldId) return Promise.resolve({ ok: false, code: 'bad-request', error: 'replaces needs a proposal id' });
    if (typeof make !== 'function') return Promise.resolve({ ok: false, code: 'bad-request', error: 'nothing to replace it with' });
    if (!by || by.kind !== 'agent' || !by.id) return Promise.resolve({ ok: false, code: 'not-yours', error: 'only the agent that proposed it can replace a proposal' });
    return onProposal(oldId, async () => {
      const p0 = store.outbox.snapshot().proposals[oldId];
      // verify r3: the SAME sentence `withdrawRefusal` gives a stranger for an existing draft — a different one told an outsider whether the id exists
      if (!p0) return { ok: false, code: 'not-found', error: 'no such proposal (not found, or not yours)', replaces: oldId };
      const v = P.withdrawVerdict(p0, by);
      if (!v.ok) return { ...withdrawRefusal(p0, by, v), replaces: oldId };
      const r = await make();
      if (!r || !r.ok || !r.proposal) return { ...(r || { ok: false, code: 'error', error: 'the new proposal was not created' }), replaces: oldId, replaced: null, note: `proposal ${oldId} was left as it was` };
      const newId = r.proposal.id;
      await store.outbox.update((ob) => { if (ob.proposals[newId]) ob.proposals[newId].replaces = oldId; });
      const w = await withdrawNow(oldId, by, why || `replaced by ${newId}`, { replacedBy: newId, notifyNow: false });
      notifyOutbox([newId, oldId]);
      notify([...new Set([p0.convId, r.proposal.convId].filter(Boolean))]);
      const fresh = store.outbox.snapshot().proposals[newId];
      return { ...r, proposal: agentProposalView(by, fresh), replaces: oldId, replaced: w.ok ? w.proposal : null, ...(w.ok ? {} : { replaceError: w.error, replaceCode: w.code }) };
    });
  }

  // THE RECEIPT'S FATE (2026-09-27, the owner: "我在界面里完全看不到有消息在
  // queue"): a receipt the ladder STASHED rides the drafting agent's next
  // message; the ladder tells us when that stash drains (or hands an entry
  // back), and the card says "Handed to <agent> at …" instead of "Waiting".
  // Verify r2 (2026-09-27): THREE events, the latest wins — `drained` (read
  // with the next message: `receiptDrainedAt`, `receiptDrainedHow:'drained'` —
  // a real drain after a boot reconcile's guess records its time), `stashed`
  // (held again: both cleared), `evicted` (the cap dropped it UNREAD:
  // `receiptEvictedAt` + `receiptEvictedHeld`; the card says "not delivered —
  // the queue was full", never "waiting", never "handed").
  async function noteReceiptStash(ev, cid, entries, extra = {}) {
    const ids = (entries || []).filter((e) => e && e.source === 'channel-receipt' && e.ref).map((e) => String(e.ref));
    if (!ids.length || engineCtx.stopped) return;
    const t = now();
    const changed = [];
    await store.outbox.update((ob) => {
      for (const id of ids) {
        const q = ob.proposals[id];
        if (!q || !q.draftedBy || String(q.draftedBy.id) !== String(cid)) continue;
        if (ev === 'drained') { q.receiptDrainedAt = t; q.receiptDrainedHow = 'drained'; q.receiptEvictedAt = null; q.receiptEvictedHeld = null; changed.push(id); }
        else if (ev === 'stashed' && (q.receiptDrainedAt || q.receiptEvictedAt)) { q.receiptDrainedAt = null; q.receiptDrainedHow = null; q.receiptEvictedAt = null; q.receiptEvictedHeld = null; changed.push(id); }
        else if (ev === 'evicted') { q.receiptEvictedAt = t; q.receiptEvictedHeld = Number(extra && extra.held) || null; q.receiptDrainedAt = null; q.receiptDrainedHow = null; changed.push(id); }
      }
    });
    if (changed.length) notifyOutbox(changed);
    if (ev === 'evicted' && changed.length) log.warn(`[channels] receipt(s) for ${changed.join(', ').slice(0, 300)} fell off ${cid}'s stash cap UNREAD (${Number(extra && extra.held) || '?'} held) — the card says so; the receipt stays on the proposal`);
  }
  /**
   * A STASHED RECEIPT WHOSE ENTRY IS GONE WAS HANDED (2026-09-27 verify, the
   * owner's three receipts of that day): a receipt stashed BEFORE the stash
   * carried a `ref` (or drained while nobody listened) has no `drained`
   * event to flip its fate — its card said "Waiting for <agent>'s next
   * message" for good, though the agent read it with its next prompt. At
   * boot, every stashed-and-not-drained receipt is looked for in its
   * drafter's stash (by `ref`, or — a legacy entry — by the proposal id its
   * text names); one that is no longer there was drained by an earlier
   * message, at a time nobody recorded (`receiptDrainedHow: 'reconciled'`,
   * the card says "with an earlier message"). Read-only on the stash; the
   * ladder's `stashPeek` is optional (a ladder without it: nothing changes).
   */
  async function reconcileReceiptFates() {
    if (!deliver || typeof deliver.stashPeek !== 'function' || engineCtx.stopped) return [];
    const ob = store.outbox.snapshot();
    const gone = [];
    for (const q of Object.values(ob.proposals || {})) {
      const d = q.receiptDelivery;
      if (!d || !d.stashed || q.receiptDrainedAt || q.receiptEvictedAt || !q.draftedBy || q.draftedBy.kind !== 'agent' || !q.draftedBy.id) continue;   // an eviction was recorded when it happened: never "handed"
      let held = null;
      try { held = deliver.stashPeek(q.draftedBy.id) || []; } catch { continue; }   // an unreadable stash decides nothing
      const still = held.some((e) => e && (String(e.ref || '') === String(q.id) || (!e.ref && e.source === 'channel-receipt' && String(e.text || '').includes(`proposal ${q.id}:`))));
      if (!still) gone.push(q.id);
    }
    if (!gone.length) return [];
    const t = now();
    await store.outbox.update((ob2) => { for (const id of gone) { const q = ob2.proposals[id]; if (q && !q.receiptDrainedAt) { q.receiptDrainedAt = t; q.receiptDrainedHow = 'reconciled'; } } });
    notifyOutbox(gone);
    log.log(`[channels] ${gone.length} stashed receipt(s) no longer in their drafter's stash — read as handed with an earlier message: ${gone.join(', ').slice(0, 400)}`);
    return gone;
  }

  /**
   * THE SEND (§9.4). An attempt line goes to the audit log BEFORE the request,
   * an outcome line after — a crash between the two leaves exactly the record
   * `reconcile()` exists for, and the one that must never be read as "not
   * sent". A typed refusal is `failed`; a LOST result (the adapter threw
   * mid-flight — the registry marks it `detail.threw`) is `unknown`, which
   * this engine NEVER retries by itself.
   */
  async function sendNow(id) {
    const p = store.outbox.snapshot().proposals[id];
    if (!p || p.state !== 'sending') return { ok: false, why: p ? `state ${p.state}` : 'no such proposal' };
    if (p.kind === 'reaction') return sendReactionNow(id, p);
    const rec = adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
    // THE WIRE TEXT (§9.5): the approved text — plus the sender honesty line
    // ONLY when the channel's switch is on AND the drafter is an agent. The
    // proposal's own `text` stays what the user approved; the wire form and
    // the attempt instant are stamped BEFORE the request so a lost outcome
    // can be reconciled against exactly what went out (§9.4).
    const line = P.honestyLine({ draftedBy: p.draftedBy, enabled: honestyLineFor(rec) });
    const wire = P.withHonestyLine(p.text, line);
    const t0 = now();
    await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) { q.attemptAt = t0; q.wire = { text: wire, honestyLine: !!line, at: t0 }; } });
    auditOutbox(store.outbox.snapshot().proposals[id], 'attempt', { idemKey: p.id, honestyLine: !!line });
    let r = null, threw = false;
    if (!rec) r = { ok: false, code: 'not-found', retryable: false, detail: { reason: 'adapter no longer exists' } };
    else {
      const e = adapterFor(rec);
      // A TWO-PHASE adapter hands back its durable handle BEFORE its send;
      // it is persisted the moment it exists, so a crash between the phases
      // leaves `reconcile()` something to ask about (§9.4).
      const onHandle = async (h) => { await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) q.sendHandle = h; }); };
      // r6 verify F1 (the belt at the send itself): a reply whose answered message is not a stored message of
      // this conversation any more is refused here too, before the adapter is called
      const targetWhy = p.compose ? null : replyRecheck(p, rec);
      const anchor = p.compose ? null : anchorFactsOf(p);
      // B-6acc: a COMPOSED message starts a NEW conversation through the
      // adapter's declared `compose` (the same idempotency key, the same
      // handle / lost-answer rules as a reply)
      // design 005 §2.B: THE BYTES THAT LEAVE ARE THE BYTES THE PERSON SAW — each stored file re-read and re-hashed here;
      // the adapter is handed these buffers, a changed or missing file refuses the send by name (nothing sent)
      const stored = p.filesLeftOut ? [] : P.storedAttachments(p);   // lane lark-upload-preflight: the owner's "Send without the file"
      const fv = !targetWhy && stored.length ? await OF.verify(store.dir, p.id, stored) : null;
      const files = fv && fv.ok ? { attachments: fv.files } : {};
      if (targetWhy) r = { ok: false, code: 'not-found', retryable: false, detail: { reason: `the reply's target is not what was approved (${targetWhy}) — nothing was sent` } };
      else if (fv && !fv.ok) r = { ok: false, code: 'attachment-changed', retryable: false, detail: { reason: `${fv.why} — nothing was sent` } };
      else {
        sendLeft.add(id);   // only a request that is really handed to the adapter may have LEFT (r4's refund rule)
        try { r = p.compose ? await e.adapter.compose({ to: p.compose.to, cc: p.compose.cc, subject: p.compose.subject, text: wire, idemKey: p.id, as: p.sendAs, onHandle, ...files }) : await e.adapter.send(p.convId, { text: wire, replyTo: p.replyTo, idemKey: p.id, as: p.sendAs, onHandle, placement: P.placementOf(p), ...(anchor ? { replyAnchor: anchor } : {}), ...files, ...(p.prepared ? { prepared: p.prepared } : {}), ...(p.replyEnvelope ? { envelope: p.replyEnvelope } : {}) }); }
        catch (err) {
          r = err && typeof err.toJSON === 'function' ? err.toJSON() : { ok: false, code: (err && err.code) || 'vendor-error', retryable: false, detail: { threw: true, message: (err && err.message) || String(err) } };
          if (err && err.message && !r.message) r.message = err.message;
          threw = !!(r.detail && r.detail.threw);
        }
      }
    }
    const t = now();
    // LOST = the adapter THREW mid-flight (the registry marks it) OR reported
    // a transport failure AFTER the request left (`detail.lost`): the vendor
    // may have processed it, so it is `unknown`, never `failed` (§9.4).
    const lost = threw || !!(r && !r.ok && r.detail && r.detail.lost);
    // lane slack-file-send-key r2: the share may have been INGESTED while this proposal was still sending (a record is fresh
    // once, and learnSentFiles skips a proposal that is not yet sent) — the conversation's STORED self-authored records since
    // the send began re-key a file-keyed result IN this transition (one write; a local read, never a vendor call)
    const shared = r && r.ok && Array.isArray(r.parts) && r.parts.some((x) => x && x.ok === true && x.part === 'attachment') ? sharedSince(p.adapterId, p.convId, t0) : null;
    let to, patch;
    if (r && r.ok) {
      to = 'sent';
      patch = (q) => {
        q.result = { vendorMessageId: r.vendorMessageId || null, at: r.at || t, sentAs: r.sentAs || q.sendAs, lane: r.lane || null, honestyLine: !!line, observed: r.observed || null, handle: r.handle || q.sendHandle || null, ...(q.compose ? { threadId: r.threadId || null } : {}), ...(P.sendParts(r.parts) ? { parts: P.sendParts(r.parts) } : {}) };
        // lane channel-threads: the thread the reply LANDED in (the vendor's word, e.g. Lark's `thread_id`) — the receipt names it
        if (q.inThread && r.observed && r.observed.threadKey) q.threadKey = String(r.observed.threadKey);
        q.reason = null;
        // lane channel-send-files: a message sent in PARTS (Lark's text + one message per file, Slack's chain per file)
        // whose later part was refused is SENT — and its reason says, by name, what did not land
        // lane lark-upload-preflight: the files the owner approved WITHOUT ("Send without the file") are parts that did not land
        if (q.filesLeftOut) q.result.parts = P.sendParts([...(q.result.parts || [{ part: 'text', ok: true, vendorMessageId: q.result.vendorMessageId }]), ...P.storedAttachments(q).map((a) => ({ part: 'attachment', name: a.name, ok: false, code: 'left-out', why: 'approved without the file — this account\'s sign-in cannot send files' }))]);
        const miss = (q.result.parts || []).filter((x) => !x.ok);
        if (miss.length) q.reason = `partly sent — ${P.partsWords(q.result.parts)}`;
        // the NEW conversation's id (the thread the vendor answered with) —
        // the card's link, the receipt; the index row arrives with the next pass
        if (q.compose && r.threadId && !q.convId) q.convId = String(r.threadId);
        const k = shared && shared.size ? P.rekeyByFiles(q.result, shared) : null;
        if (k) q.result = k;
      };
    } else if (lost) {
      to = 'unknown';
      patch = (q) => { q.reason = `outcome unknown: ${threw ? 'the adapter threw mid-send' : 'the request left and the answer was lost'} (${(r.detail && r.detail.message) || r.message || r.code}); NOT retried automatically — check the conversation on the platform, or press Check outcome`; q.failure = { code: r.code || 'vendor-error', detail: r.detail || null, at: t }; };
    } else {
      to = 'failed';
      const why = (r && r.detail && (r.detail.reason || r.detail.message)) || (r && r.message) || (r && r.code) || 'refused';
      patch = (q) => { q.reason = `${(r && r.code) || 'failed'}: ${why}`; q.failure = { code: (r && r.code) || 'failed', retryable: !!(r && r.retryable), detail: r && r.detail ? r.detail : null, at: t }; };
    }
    await transition(id, to, 'adapter', patch);
    const p1 = store.outbox.snapshot().proposals[id];
    auditOutbox(p1, 'outcome', { code: r && r.ok ? null : (r && r.code) || null, vendorMessageId: (p1.result && p1.result.vendorMessageId) || null, lost: to === 'unknown' });
    // lane channel-threads: a group that refused a reply INTO a thread narrows `threads.replyInto` on the
    // conversation's cached verdict at once (the composer flips to the read-only line on the next broadcast — attack 19)
    if (to === 'failed' && p1.inThread && r && r.detail && r.detail.why === 'topic-forbidden') {
      try { await store.index.update(() => { const en = store.index.entry(p1.adapterId, p1.convId, { create: false }); if (en && en.convCaps) en.convCaps = { ...en.convCaps, threads: { ...(en.convCaps.threads || {}), replyInto: false, why: 'topic-forbidden' } }; }); } catch (err) { log.warn(`[channels] ${p1.key}: could not narrow the thread reply: ${(err && err.message) || err}`); }
    }
    // a reply sent INTO a thread whose replies are not in the listing: ONE walk of that thread (its floor applies) so the
    // reply shows up in the pane the way the vendor holds it; a listing that carries replies brings it with the next page
    if (to === 'sent' && p1.inThread && p1.threadKey && rec && threadsRow(registry.capsOf(rec.kind)).listing === 'separate') track(threadRefresh(p1.adapterId, p1.convId, p1.threadKey, { vendorNamed: true }).catch(() => {}));
    // lane reaction-hover: a QUOTED reply (the window's Quote) is a reply the listing carries too — the same one kick, so
    // it shows under what it quotes as promptly as a thread reply does (a plain message still waits for its pass)
    else if (to === 'sent' && (p1.inThread || P.placementOf(p1) === 'quote') && rec) { const e2 = live.get(rec.id); if (e2) kick(rec, e2, p1.convId); }
    if (to === 'sent' && rec && r.observed) { try { await noteIdentityObserved(rec, p1.result.sentAs, r.observed, p1.result.vendorMessageId); } catch (err) { log.warn(`[channels] identity observation not recorded: ${(err && err.message) || err}`); } }
    if (to === 'sent' && shared && shared.size && p1.result && Array.isArray(p1.result.fileIds)) sayFilesLearned(rec ? rec.kind : p1.adapterId, id, p1.result);
    if (to === 'sent') await noteSentBy(p1);
    if (to === 'sent') await speakPartial(p1);
    if (to === 'unknown') await speakUnknown(p1);
    else await receipt(id);
    await pointerSync(p1.key);
    notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
    log.log(`[channels] outbox ${id} → ${p1.adapterId}/${p1.convId || (p1.compose ? `(new: ${(p1.compose.to || []).join(', ')})` : '')}: ${to}${p1.reason ? ` — ${p1.reason}` : ''}`);
    sendLeft.delete(id);
    return { ok: to === 'sent', state: to };
  }
  /**
   * AN APPROVED (or direct) REACTION PROPOSAL GOES OUT (spec §5.3 / §3.4): the SAME act the window's click is —
   * `react` / `unreact` as the user, `by:'agent'` (the side record's `src:'agent'`), ONE vendor call, never retried.
   * The attempt / outcome audit lines as a send's; a refusal is `failed` with its code; a LOST answer (the request
   * left, the answer did not come back) is `unknown` — reconciled by ONE list call, never a second POST (attack 6).
   */
  async function sendReactionNow(id, p) {
    const x = p.reaction || {};
    const t0 = now();
    await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) q.attemptAt = t0; });
    auditOutbox(store.outbox.snapshot().proposals[id], 'attempt', { idemKey: p.id, reaction: { op: x.op, key: x.key, msg: x.msg } });
    let r;
    try { r = x.op === 'remove' ? await unreact(p.adapterId, p.convId, x.msg, x.key, { by: 'agent' }) : await react(p.adapterId, p.convId, x.msg, x.key, { by: 'agent' }); }
    catch (err) { r = { ok: false, code: 'vendor-error', error: String((err && err.message) || err), lost: true }; }
    const t = now();
    let to, patch;
    if (r && r.ok) {
      to = 'sent';
      patch = (q) => { q.result = { vendorMessageId: null, at: t, sentAs: 'user', lane: null, honestyLine: false, observed: null, handle: null, reaction: { op: x.op, key: x.key, msg: x.msg } }; q.reason = null; };
    } else if (r && r.lost) {
      to = 'unknown';
      patch = (q) => { q.reason = `outcome unknown: the reaction request left and the answer was lost (${r.error || r.code}); NOT retried automatically — press Check outcome (one reaction list read)`; q.failure = { code: r.code || 'vendor-error', detail: { lost: true, message: r.error || null }, at: t }; };
    } else {
      to = 'failed';
      patch = (q) => { q.reason = `${(r && r.code) || 'failed'}: ${(r && r.error) || 'refused'}`; q.failure = { code: (r && r.code) || 'failed', retryable: false, detail: { reason: (r && r.error) || null, why: (r && r.why) || null }, at: t }; };
    }
    await transition(id, to, 'adapter', patch);
    const p1 = store.outbox.snapshot().proposals[id];
    auditOutbox(p1, 'outcome', { code: r && r.ok ? null : (r && r.code) || null, lost: to === 'unknown', reaction: true });
    if (to === 'unknown') await speakUnknown(p1);
    else await receipt(id);
    await pointerSync(p1.key);
    notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
    log.log(`[channels] outbox ${id} → ${p1.adapterId}/${p1.convId}: reaction ${x.op} ${x.key} on ${x.msg}: ${to}${p1.reason ? ` — ${p1.reason}` : ''}`);
    return { ok: to === 'sent', state: to };
  }
  /** WHAT AN AGENT SENT FROM HERE (spec §5.4): the conversation's bounded per-drafter set of vendor ids — the
   *  `reply-to-mine` / `in-thread-with-me` rules and the reaction digest read it. A failed write costs one rule
   *  hit, is SAID, and never the send. */
  const SENT_BY_MAX = 200;
  async function noteSentBy(p) {
    const d = p && p.draftedBy;
    const ids = P.sentIdsOf(p && p.result);   // lane channel-reply-real: every landed part's id (a quote of a file part)
    if (!d || d.kind !== 'agent' || !d.id || !ids.length || !p.convId || p.kind === 'reaction') return;
    const pk = `agent:${d.id}`;
    try {
      await store.index.update(() => {
        const en = store.index.entry(p.adapterId, p.convId, { create: false });
        if (!en) return;
        const sb = en.sentBy && typeof en.sentBy === 'object' ? { ...en.sentBy } : {};
        const list = (Array.isArray(sb[pk]) ? sb[pk] : []).filter((x) => !ids.includes(x));
        list.push(...ids);
        sb[pk] = list.slice(-SENT_BY_MAX);
        const keys = Object.keys(sb);
        if (keys.length > 64) for (const k of keys.slice(0, keys.length - 64)) delete sb[k];
        en.sentBy = sb;
      });
    } catch (err) { log.warn(`[channels] ${p.adapterId}/${p.convId}: what ${d.id} sent could not be recorded (the reply-to-mine rule will miss it): ${(err && err.message) || err}`); }
  }
  /** lane slack-file-send-key (B-2840): A FILE SEND LEARNS ITS MESSAGE AT INGEST — an adapter that keys a file send by the
   *  FILE id (Slack: completeUploadExternal answers no message) has the proposal re-keyed by the self-authored share the
   *  moment that record is ingested: ONE outbox write (state unchanged; a replay moves nothing), the `sentBy` ledger gains
   *  the message id, ONE journal line per proposal. No vendor call. */
  async function learnSentFiles(rec, convId, records) {
    const byFile = P.sharedFilesOf(records);
    if (!byFile.size) return [];
    const since = now() - F.SENT_WINDOW_MS;
    const mine = (q) => !!(q && q.state === 'sent' && q.adapterId === rec.id && q.convId === convId && q.kind !== 'reaction' && q.result && Number(q.result.at || q.at) >= since);
    if (!Object.values(store.outbox.snapshot().proposals || {}).some((q) => mine(q) && P.rekeyByFiles(q.result, byFile))) return [];
    const moved = [];
    await store.outbox.update((ob) => { for (const [id, q] of Object.entries(ob.proposals)) { const r1 = mine(q) ? P.rekeyByFiles(q.result, byFile) : null; if (r1) { q.result = r1; moved.push(id); } } });
    for (const id of moved) {
      const p1 = store.outbox.snapshot().proposals[id];
      await noteSentBy(p1);
      sayFilesLearned(rec.kind, id, p1.result);
    }
    if (moved.length) notifyOutbox(moved);
    return moved;
  }
  /** ONE journal line per re-keyed proposal: `<kind>: sent file <fid> = message <ts> (outbox <id>)`. */
  function sayFilesLearned(kind, id, result) {
    const pairs = [result, ...(result.parts || [])].filter((x) => x && x.fileId).map((x) => `file ${x.fileId} = message ${x.vendorMessageId}`);
    log.log(`[channels] ${kind}: sent ${pairs.length ? pairs.join(', ') : `file ${(result.fileIds || []).join(', ')} = message ${result.vendorMessageId}`} (outbox ${id})`);
  }
  /** lane slack-file-send-key r2: the files this account's OWN stored records shared in the conversation since `sinceAt` (a
   *  minute of clock skew allowed) — the newest LOOK_BACK_MAX records of the local log, never a vendor call; only the log of
   *  a conversation with an index row (the record-clear census gate); an unreadable log is an empty one. */
  const LOOK_BACK_MAX = 200;
  function sharedSince(adapterId, convId, sinceAt) {
    if (!store.index.peek(`${adapterId}/${convId}`)) return new Map();
    let recs = [];
    try { recs = store.readTail(adapterId, convId, { limit: LOOK_BACK_MAX }); } catch { recs = []; }
    return P.sharedFilesOf(recs.filter((x) => x && Number(x.at) >= Number(sinceAt) - 60e3));
  }
  /** lane lark-upload-preflight (userW inc-muxsy69b-mjg1): A PARTIAL SEND REACHES THE OWNER — beside the agent's receipt,
   *  ONE For-you item per proposal (its action keyed by the proposal) naming what did NOT land and why, with the step that
   *  fixes it; its click opens the conversation. A file the owner left out himself ("Send without the file") is no news. */
  async function speakPartial(p) {
    const miss = ((p && p.result && p.result.parts) || []).filter((x) => !x.ok && x.code !== 'left-out');
    if (!miss.length || !userTodos || typeof userTodos.add !== 'function') return;
    try {
      const recU = adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
      const adapterLabel = recU ? (recU.label || recU.id) : p.adapterId;
      const title = String(conversationName(p.adapterId, p.convId) || p.title || p.convId || '').slice(0, 120);
      const files = miss.map((x) => (x.part === 'text' ? 'the text' : String(x.name || 'a file').slice(0, 80))).join(', ');
      const scopes = [...new Set(miss.flatMap((x) => (Array.isArray(x.requiredScopes) ? x.requiredScopes : [])))].slice(0, 8);
      const why = miss.map((x) => String(x.code || 'refused')).join(', ') + (scopes.length ? ` — the sign-in lacks ${scopes.join(' or ')}` : '');
      const fix = scopes.length || miss.some((x) => x.code === 'forbidden') ? `Re-authorize ${adapterLabel} (Channels → the account → Re-authorize) so it can send files, then send the file again.` : 'Send the file again, or tell the recipient it is missing.';
      const item = userTodos.add(INBOX_KEY, {
        origin: 'channels',
        text: `Sent to ${title} WITHOUT the file ${files}: ${why}`,
        ...(p.convId ? { action: { type: 'open-channel', adapterId: p.adapterId, convId: p.convId, key: `outbox:${p.id}` } } : {}),   // keyed by the PROPOSAL (never merged with the conversation's approval pointer)
        detail: `A send in ${adapterLabel} · ${title} landed only in part: ${p.reason || ''}\n\n${fix}`,
        urgency: 'high', by: 'agent', sessionName: 'Channels',
        i18n: {
          text: { key: i18nKey('Sent to {title} WITHOUT the file {files}: {why}'), params: { title, files, why } },
          detail: [
            { key: i18nKey('A send in {adapter} · {title} landed only in part — the recipient did not get {files}.'), params: { adapter: adapterLabel, title, files } },
            scopes.length || miss.some((x) => x.code === 'forbidden') ? { key: i18nKey('Re-authorize {adapter} (Channels → the account → Re-authorize) so it can send files, then send the file again.'), params: { adapter: adapterLabel } } : { key: i18nKey('Send the file again, or tell the recipient it is missing.') },
          ],
          source: INBOX_SOURCE,
        },
      });
      if (item && item.id) await store.outbox.update((ob) => { if (ob.proposals[p.id]) ob.proposals[p.id].partialTodoId = item.id; });
    } catch (e) { log.warn(`[channels] outbox ${p.id}: could not file the partly-sent item: ${(e && e.message) || e}`); }
  }
  /** An unknown outcome owes the USER a look (§9.4), not the agent a verdict. */
  async function speakUnknown(p) {
    if (!userTodos || typeof userTodos.add !== 'function') return;
    try {
      const recU = adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
      const adapterLabel = recU ? (recU.label || recU.id) : p.adapterId;
      const title = String(conversationName(p.adapterId, p.convId) || p.title || p.convId || '').slice(0, 120);   // B-c127: the ladder (a compose: its subject)
      const item = userTodos.add(INBOX_KEY, {
        origin: 'channels', // B-328d
        text: `Outbox: a send to ${title} has an UNKNOWN outcome`,
        ...(p.convId ? { action: { type: 'open-channel', adapterId: p.adapterId, convId: p.convId, key: `${p.adapterId}/${p.convId}` } } : {}),   // B-c127: a click opens the conversation
        detail: `A send in ${adapterLabel} · ${title}: the adapter did not answer whether the message landed. It is NOT retried automatically — a duplicate in somebody else's room is worse than asking. Check the conversation on the platform; the Outbox window shows the proposal.\n\n${p.reason || ''}`,
        urgency: 'high', by: 'agent', sessionName: 'Channels',
        i18n: {
          text: { key: i18nKey('Outbox: a send to {title} has an UNKNOWN outcome'), params: { title } },
          detail: [
            { key: i18nKey('A send in {adapter} · {title}: the adapter did not answer whether the message landed. It is NOT retried automatically — a duplicate in somebody else\'s room is worse than asking.'), params: { adapter: adapterLabel, title } },
            { key: i18nKey('Check the conversation on the platform; the Outbox window shows the proposal.') },
          ],
          source: INBOX_SOURCE,
        },
      });
      if (item && item.id) await store.outbox.update((ob) => { if (ob.proposals[p.id]) ob.proposals[p.id].unknownTodoId = item.id; });
    } catch (e) { log.warn(`[channels] outbox ${p.id}: could not file the unknown-outcome item: ${(e && e.message) || e}`); }
  }

  /** The unknown-outcome item is retracted by THIS producer, only its own
   *  still-open id, the moment reconcile settles the proposal. */
  async function retractUnknownItem(p) {
    if (!p || !p.unknownTodoId) return;
    const todoId = p.unknownTodoId;
    await store.outbox.update((ob) => { if (ob.proposals[p.id]) ob.proposals[p.id].unknownTodoId = null; });
    if (!userTodos || typeof userTodos.get !== 'function') return;
    try {
      const it = userTodos.get(todoId);
      if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(todoId, 'done', RESOLVED_BY);
    } catch (e) { log.warn(`[channels] outbox ${p.id}: could not retract the unknown-outcome item: ${(e && e.message) || e}`); }
  }

  /**
   * RECONCILE (§9.4): THE ONLY WAY OUT OF `unknown`, asked by a PERSON (the
   * card's button / the route) — never by a timer. The adapter is asked
   * whether the lost send landed: `{landed:true}` ⇒ sent (with the vendor
   * id), `{landed:false}` ⇒ failed, anything else ⇒ still unknown, the count
   * of asks stamped. An adapter declaring `idempotency:'none'` cannot be
   * asked at all — the answer is a person's look at the platform — and the
   * refusal says so. Nothing here ever re-sends; a Lark reconcile may
   * re-issue its OWN uuid inside the vendor's dedup hour, which is the
   * adapter's exactly-once guarantee, not a retry.
   */
  async function reconcile(id, { by = 'user' } = {}) {
    const p = store.outbox.snapshot().proposals[id];
    if (!p) return { ok: false, code: 'not-found', error: 'no such proposal' };
    if (p.state !== 'unknown') return { ok: false, code: 'bad-state', error: `proposal is ${p.state}, not unknown — only a lost outcome can be reconciled` };
    const rec = adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
    if (!rec) return { ok: false, code: 'reconcile-not-available', error: 'the adapter no longer exists — the outcome cannot be checked from here', proposal: proposalView(p) };
    const c = registry.capsOf(rec.kind);
    if (p.kind === 'reaction') return reconcileReaction(id, p, rec, c, by);
    const can = P.canReconcile(c);
    const t = now();
    if (!can.ok) {
      await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) q.reconcile = { n: (q.reconcile && q.reconcile.n) || 0, lastAt: t, lastBy: by, lastAnswer: 'not-available', lastWhy: can.why, detail: null, resolvedAt: null }; });
      const p0 = store.outbox.snapshot().proposals[id];
      auditOutbox(p0, 'reconcile-refused', { why: can.why });
      notifyOutbox([id]);
      return { ok: false, code: 'reconcile-not-available', error: can.why, proposal: proposalView(p0) };
    }
    const n = ((p.reconcile && p.reconcile.n) || 0) + 1;
    auditOutbox(p, 'reconcile-attempt', { by, n });
    let answer;
    try {
      const e = adapterFor(rec);
      const anchorR = p.compose ? null : anchorFactsOf(p);
      answer = await e.adapter.reconcile(p.convId, { idemKey: p.id, sentAt: p.attemptAt || p.updatedAt || p.at, text: (p.wire && p.wire.text) || p.text, replyTo: p.replyTo, as: p.sendAs, handle: p.sendHandle || null, ...(p.compose ? { compose: p.compose } : {}), ...(anchorR ? { replyAnchor: anchorR } : {}), ...(p.replyEnvelope ? { envelope: p.replyEnvelope } : {}), ...(p.inThread ? { inThread: true, threadKey: p.threadKey || null } : {}) });
    } catch (err) {
      // verify r3: a RATE refusal inside the reconcile is thrown by the adapter now (never an `unknown` that invited the next
      // press into the vendor's stop) — the answer names the wait the vendor gave, so the owner's next look can say it
      answer = { unknown: true, reason: `reconcile threw: ${(err && err.message) || err}`, detail: { threw: true, code: (err && err.code) || null, ...(err && err.detail && Number(err.detail.retryAfterSec) > 0 ? { retryAfterSec: Number(err.detail.retryAfterSec) } : {}) } };
    }
    const v = P.reconcileVerdict(answer);
    const stamp = (q) => { q.reconcile = { n, lastAt: t, lastBy: by, lastAnswer: v.answer, lastWhy: v.reason || null, detail: v.detail || null, resolvedAt: v.to ? t : null }; };
    if (!v.to) {
      await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) stamp(q); });
      const p1 = store.outbox.snapshot().proposals[id];
      auditOutbox(p1, 'reconcile-outcome', { answer: 'unknown', why: v.reason || null, n });
      notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
      log.log(`[channels] outbox ${id}: reconcile #${n} — still unknown${v.reason ? ` (${v.reason})` : ''}`);
      return { ok: true, resolved: false, state: 'unknown', answer: 'unknown', reason: v.reason || null, proposal: proposalView(p1) };
    }
    // verify r1 (F1): a send in PARTS lost before anything landed (Lark's text first) — the reconcile settles the lost part
    // only; the files after it never left, and the receipt says so by name (never "SENT with 2 attachments")
    const rp = v.to === 'sent' ? P.reconciledParts(p.failure && p.failure.detail && p.failure.detail.parts, v.vendorMessageId) : null;
    const tr = await transition(id, v.to, 'reconcile', (q) => {
      stamp(q);
      if (v.to === 'sent') { q.result = { vendorMessageId: v.vendorMessageId, at: v.at || t, sentAs: q.sendAs, lane: null, honestyLine: !!(q.wire && q.wire.honestyLine), observed: (v.detail && v.detail.observed) || null, handle: q.sendHandle || null, reconciled: true, ...(rp ? { parts: rp } : {}) }; q.reason = rp && rp.some((x) => !x.ok) ? `partly sent — ${P.partsWords(rp)}` : null; q.failure = null; }
      else { q.reason = v.reason; q.failure = { code: 'not-landed', detail: v.detail || null, at: t }; }
    });
    if (!tr.ok) return { ok: false, code: 'bad-state', error: tr.why };
    const p1 = store.outbox.snapshot().proposals[id];
    auditOutbox(p1, 'reconcile-outcome', { answer: v.answer, vendorMessageId: v.vendorMessageId || null, n });
    if (v.to === 'sent' && v.detail && v.detail.observed) { try { await noteIdentityObserved(rec, p1.result.sentAs, v.detail.observed, v.vendorMessageId); } catch {} }
    await retractUnknownItem(p1);
    await receipt(id);
    await pointerSync(p1.key);
    notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
    log.log(`[channels] outbox ${id}: reconcile #${n} → ${v.to}${v.reason ? ` — ${v.reason}` : ''}`);
    return { ok: true, resolved: true, state: v.to, answer: v.answer, proposal: proposalView(p1) };
  }

  /** A LOST REACTION'S OUTCOME (spec §5.3): ONE reaction list read (paced, metered, inside the minute's ceiling),
   *  matched on (key, the account's user): present ⇒ an add landed / a removal did not; absent ⇒ the reverse. */
  async function reconcileReaction(id, p, rec, c, by) {
    const x = p.reaction || {};
    const t = now();
    const n = ((p.reconcile && p.reconcile.n) || 0) + 1;
    const stampR = (q, answer, why, resolved) => { q.reconcile = { n, lastAt: t, lastBy: by, lastAnswer: answer, lastWhy: why || null, detail: null, resolvedAt: resolved ? t : null }; };
    if (reactionsRow(c).read !== 'list') {
      await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) stampR(q, 'not-available', 'this channel does not list reactions — only a person can check the platform', false); });
      notifyOutbox([id]);
      return { ok: false, code: 'reconcile-not-available', error: 'this channel does not list reactions — only a person can check the platform', proposal: proposalView(store.outbox.snapshot().proposals[id]) };
    }
    const e = adapterFor(rec);
    const minute = Drain.rxMinuteAt(e.rxMinute, now());
    if (minute.n >= reactionsPerMin()) return { ok: false, code: 'vendor-budget', error: 'the reaction list budget of this minute is spent — try again in a moment', retryAfterSec: Math.max(1, Math.ceil((minute.at + 60e3 - now()) / 1000)), proposal: proposalView(p) };
    if (rxBackedOff(e)) return { ...rxBackoffRefusal(rec, e), proposal: proposalView(p) };
    if (!affordable(rec, e)) return { ...budgetRefusal(rec, e), proposal: proposalView(p) };
    e.rxMinute = Drain.rxReserve(minute, now());
    auditOutbox(p, 'reconcile-attempt', { by, n, reaction: true });
    let list = null, why = null;
    const prevBy = e.chargeBy; e.chargeBy = 'owner';
    try {
      const r0 = await vendor(rec, e, () => e.adapter.reactions(p.convId, { messageId: x.msg })).catch((err) => { if (err instanceof ChannelError && err.code === 'rate-limited' && !outlived(rec, e)) noteRxRateLimit(e, err); throw err; });
      notePages(e, r0);
      const snap = { k: 'rx', msg: x.msg, at: Number(r0 && r0.at) || now(), form: 'snapshot', src: 'list', list: (r0 && r0.list) || [], ...(r0 && r0.truncated ? { truncated: true } : {}) };
      appendSides(rec, p.convId, [snap]);
      list = reactionsFor(rec, p.convId, [x.msg], { e }).get(x.msg) || [];
    } catch (err) { why = `the reaction list could not be read: ${(err && err.message) || err}`; }
    finally { e.chargeBy = prevBy; }
    if (!list) {
      await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) stampR(q, 'unknown', why, false); });
      notifyOutbox([id]);
      return { ok: true, resolved: false, state: 'unknown', answer: 'unknown', reason: why, proposal: proposalView(store.outbox.snapshot().proposals[id]) };
    }
    const mine = list.some((y) => y.key === x.key && y.mine);
    const landed = x.op === 'remove' ? !mine : mine;
    const to = landed ? 'sent' : 'failed';
    const tr = await transition(id, to, 'reconcile', (q) => {
      stampR(q, landed ? 'landed' : 'not-landed', null, true);
      if (landed) { q.result = { vendorMessageId: null, at: t, sentAs: 'user', lane: null, honestyLine: false, observed: null, handle: null, reconciled: true, reaction: { op: x.op, key: x.key, msg: x.msg } }; q.reason = null; q.failure = null; }
      else { q.reason = 'reconcile: the reaction list does not show it — it never landed'; q.failure = { code: 'not-landed', detail: null, at: t }; }
    });
    if (!tr.ok) return { ok: false, code: 'bad-state', error: tr.why };
    const p1 = store.outbox.snapshot().proposals[id];
    auditOutbox(p1, 'reconcile-outcome', { answer: landed ? 'landed' : 'not-landed', n, reaction: true });
    await retractUnknownItem(p1);
    await receipt(id);
    await pointerSync(p1.key);
    notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
    return { ok: true, resolved: true, state: to, answer: landed ? 'landed' : 'not-landed', proposal: proposalView(p1) };
  }

  /**
   * THE BOOT SWEEP (§9.4): a proposal still in `sending` was cut off between
   * the audit ATTEMPT line and the OUTCOME line by the previous process —
   * the one state that must never read as "not sent". It becomes `unknown`
   * (actor `boot`), the user is asked to look, and reconcile is the only way
   * on. Never a re-send.
   */
  async function sweepSending() {
    const stuck = proposalsFor().filter((p) => p.state === 'sending');
    for (const p of stuck) {
      const tr = await transition(p.id, 'unknown', 'boot', (q) => { q.reason = 'outcome unknown: the server stopped between the attempt and the outcome; NOT retried automatically — check the conversation on the platform, or press Check outcome'; q.failure = { code: 'lost-at-boot', detail: null, at: now() }; });
      if (!tr.ok) continue;
      const p1 = store.outbox.snapshot().proposals[p.id];
      auditOutbox(p1, 'outcome', { code: 'lost-at-boot', vendorMessageId: null, lost: true });
      await speakUnknown(p1);
      await pointerSync(p1.key);
      notifyOutbox([p.id]); notify(p1.convId ? [p1.convId] : []);
      log.warn(`[channels] outbox ${p.id}: was 'sending' when the previous process stopped — now unknown (Check outcome settles it)`);
    }
    return stuck.length;
  }

  /**
   * THE BOOT SWEEP OF A REPLACE CUT IN HALF (verify r2, 2026-09-27): a
   * replace stamps `replaces` on the NEW draft and then withdraws the old one
   * in a second write — a process that dies between the two leaves TWO
   * approvable copies of one message (the design's named worst case: a
   * duplicate in somebody else's room). At boot, every draft whose `replaces`
   * names a proposal its own drafter may still withdraw is finished: the old
   * one goes `withdrawn` (`replacedBy` the new), its pointer retracted, the
   * agent's receipt recorded and never handed back. A decision that landed
   * on the old one meanwhile (the table refuses) leaves it as it is.
   */
  async function sweepReplaces() {
    const ob = store.outbox.snapshot();
    // verify r3: EVERY hold is taken SYNCHRONOUSLY, before the first await — a half replace whose old draft is
    // also due (24 h old at the boot) was expired by the TTL sweep while this loop awaited an earlier one, and
    // the agent got an "EXPIRED unapproved" receipt for a draft it had replaced (2 of 4 in the construction)
    const runs = [];
    for (const q of Object.values(ob.proposals || {})) {
      if (!q || !q.replaces || !q.draftedBy || q.draftedBy.kind !== 'agent' || !q.draftedBy.id) continue;
      const old = ob.proposals[q.replaces];
      if (!old || old.state === 'withdrawn') continue;
      const by = { kind: 'agent', id: q.draftedBy.id, name: q.draftedBy.name || null };
      if (!P.withdrawVerdict(old, by).ok) continue;
      runs.push(onProposal(old.id, () => withdrawNow(old.id, by, `replaced by ${q.id}`, { replacedBy: q.id })).then((w) => {
        if (w && w.ok) { log.warn(`[channels] outbox ${old.id}: a replace by ${q.id} was cut in half by the previous process — finished at boot (withdrawn)`); return 1; }
        return 0;
      }, (err) => { log.warn(`[channels] outbox ${old.id}: the boot replace sweep could not finish it: ${(err && err.message) || err}`); return 0; }));
    }
    let n = 0;
    for (const r of await Promise.all(runs)) n += r;
    return n;
  }

  /**
   * THE RECEIPT (§9.3). Built by the PURE module, stored on the proposal,
   * and handed to the drafting AGENT through the ladder. A refusal is stashed
   * through the ladder's own durable stash (with the proposal id as its
   * `ref`, so the card learns when the agent's next message drained it).
   *
   * HOW IT IS DELIVERED IS THE DECIDER'S CHOICE, AT THE ACTION (2026-09-27,
   * the owner: "收件箱里的 approve 动作需要在账号-level 的通知配置里控制行为有点
   * 反直觉"): the Approve / Reject split button records `receiptChoice` on the
   * proposal — `next-turn` (free: it rides the agent's next message, the
   * default) or `wake-now` (a billed turn through THE ONE DOOR, spendReason
   * `channel-receipt`, the spend ceiling inside the ladder). PURE
   * `receiptDeliveryVerdict` decides: ONE wake per proposal (the row lives on
   * the proposal, reserved atomically before the ladder), never for a session
   * that is not live (the stash keeps it — "gone"), never for a proposal the
   * agent withdrew itself. The per-watcher `receiptWake` opt-in (decision 8)
   * is DEPRECATED: the engine no longer reads it (a stored `true` is ignored;
   * `start()` logs how many watchers still carry it).
   */
  async function receipt(id) {
    const p = store.outbox.snapshot().proposals[id];
    if (!p) return null;
    const rc = P.receiptFor(p);
    if (!rc) return null;
    await store.outbox.update((ob) => { if (ob.proposals[id]) ob.proposals[id].receipt = rc; });
    if (!p.draftedBy || p.draftedBy.kind !== 'agent' || !p.draftedBy.id) return rc;
    const cid = p.draftedBy.id;
    const cf = p.convId ? convFor(p.adapterId, p.convId) : { en: null, rec: null };
    const rec = cf.rec || adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
    // the conversation's chain (a composed message has none yet: its own)
    const key = p.convId ? `${p.adapterId}/${p.convId}` : null;
    return billedWake({ conv: key || `proposal:${id}`, scopeOf: null }, () => receiptNow(id, p, rc, cid, rec, key));
  }
  /** The receipt's delivery, inside its serial section: the verdict, the ONE
   *  wake row reserved on the proposal before the ladder, the outcome after. */
  async function receiptNow(id, p, rc, cid, rec, key) {
    const en = key ? store.index.peek(key) : null;
    const tR = now();
    let live = null;
    if (agentsWanted) { try { live = (liveSessions() || []).some((x) => x && x.cid === cid); } catch { live = null; } }
    const cur = store.outbox.snapshot().proposals[id] || p;
    let verdict = P.receiptDeliveryVerdict(cur.receiptChoice, cur, { live });
    let wake = verdict.deliver === 'wake-now' && !engineCtx.stopped;
    // THE ROW BEFORE THE BILL: the proposal takes its ONE wake row inside the
    // outbox's serialized door — a second receipt of it finds the row and rides
    // the next turn; a row that cannot be written is no wake
    if (wake) {
      // verify r3: `got` is the WRITE's answer, not the callback's — the callback ran on the live store and then
      // the file write threw (ENOSPC), and the wake went out under a log line saying "delivered without a wake"
      let took = false, got = false;
      try { await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q && !q.receiptWake) { q.receiptWake = { at: tR, reserved: true, bootId: BOOT_ID, pid: process.pid }; took = true; } }); got = took; } catch (err) { log.warn(`[channels] receipt ${id}: the proposal could not take its wake row (${took ? 'the write failed after the row was taken in memory' : 'the store refused'}) — delivered without a wake: ${(err && err.message) || err}`); }
      if (!got) { wake = false; verdict = { deliver: 'next-turn', why: took ? 'row-unwritten' : 'already-woken' }; }
    }
    // verify r2 (IDENTITY): a drafter whose access to the conversation was removed hears the FATE only
    const withheld = !drafterSees(cur);
    // B-c127: the receipt names the conversation by the ladder (never `proposal p-…`), and its card opens it
    const rTitle = conversationName(p.adapterId, p.convId) || p.title || p.convId || '';
    const text = P.renderReceiptBlock(rc, { adapterLabel: rec ? (rec.label || rec.id) : p.adapterId, title: rTitle, text: p.text, proposed: p.originalText, withheld });
    const fromName = 'Channels · Outbox';
    const cardText = withheld ? `Receipt: your proposal — ${rc.status} (access removed)` : `${CR.nameOf([rTitle], p.convId || p.id)}: receipt — ${rc.status}${rc.reason ? ` — ${String(rc.reason).slice(0, 160)}` : ''}`;
    const channel = !withheld && p.convId ? CR.refOf({ adapterId: p.adapterId, convId: p.convId, name: rTitle, account: rec ? (rec.label || rec.id) : null, vendor: rec ? rec.kind : null }) : null;
    let r = null, stashed = false, stashErr = null;
    if (!deliver || typeof deliver.deliverToConversation !== 'function') r = { ok: false, reason: 'no delivery ladder wired', refused: 'unwired' };
    else {
      try { r = await deliver.deliverToConversation(cid, text, { kind: 'notification', noWake: !wake, spendReason: 'channel-receipt', fromName, cardText, ...(channel ? { channel } : {}) }); }
      catch (err) { r = { ok: false, reason: `ladder threw: ${(err && err.message) || err}`, refused: 'error' }; }
      if (!(r && r.ok) && typeof deliver.stashFor === 'function') {
        // verify r4: a stash whose disk write failed THROWS (the entry is not stored) — the card says that, never "waiting"
        try { deliver.stashFor(cid, { source: 'channel-receipt', kind: 'notification', fromName, text, ref: id, about: stashAbout({ keys: key ? [key] : [], account: key ? null : p.adapterId, cid, groups: live ? null : (Array.isArray(cur.drafterGroups) ? cur.drafterGroups : []) }) }); stashed = true; } catch (err) { stashErr = String((err && err.message) || err).slice(0, 200); log.warn(`[channels] receipt ${id} stash failed — the receipt stays on the proposal, not stored for the next turn: ${stashErr}`); }
      }
    }
    // a stashed receipt for a drafter whose session is not live is KEPT for when it comes back — the card says so
    const gone = stashed && live === false;
    const delivery = {
      at: now(), ok: !!(r && r.ok), lane: r && r.ok ? (r.lane || 'message') : (stashed ? 'stash' : 'none'), stashed, refused: stashErr ? 'stash-failed' : (r && r.refused) || null, woke: wake, why: r && r.ok ? null : String(stashErr ? `the receipt could not be stored: ${stashErr}` : (r && r.reason) || 'refused').slice(0, 200),
      choice: cur.receiptChoice || 'next-turn', verdict: verdict.why || null, ...(gone ? { gone: true } : {}),
    };
    await store.outbox.update((ob) => {
      const q = ob.proposals[id];
      if (!q) return;
      q.receiptDelivery = delivery;
      if (wake && q.receiptWake) q.receiptWake = { ...q.receiptWake, reserved: false, ok: delivery.ok, lane: delivery.lane, refused: delivery.refused, why: delivery.why };
    });
    if (wake && delivery.ok && en) {
      // the conversation's wake history takes the receipt wake (the panel's count), like every wake
      try { await store.index.update(() => { const e2 = store.index.entry(p.adapterId, p.convId, { create: false }); if (e2) { healP2(e2); e2.stats.wakes = F.pruneLedger([...e2.stats.wakes, { at: tR, n: 1, cid, ok: true, lane: delivery.lane, why: null, refused: null, whys: [], digest: false, grain: 'receipt', receipt: id, id: `${tR}-receipt-${id}` }], tR); } }); } catch (err) { log.warn(`[channels] receipt ${id}: the conversation's wake history could not take the row: ${(err && err.message) || err}`); }
      notify([p.convId]);
    }
    log.log(`[channels] receipt ${id} → ${cid}: ${delivery.ok ? `delivered via ${delivery.lane}${wake ? ' (woke it, the decider\'s choice)' : ''}` : (stashed ? `stashed for the next turn${gone ? ' (its session is not live)' : ''}` : 'not delivered')}${delivery.why ? ` (${delivery.why})` : ''}`);
    return rc;
  }

  /** The TTL sweep (§9.1): a proposal left in `awaiting-approval` past its
   *  TTL expires, with a receipt. Cheap; runs from the tick once a minute. */
  async function expireSweep() {
    const t = now();
    const due = proposalsFor().filter((p) => P.expiryVerdict(p, t).expired && !proposalHolds.has(p.id));   // a proposal a replace holds is judged next minute
    for (const p of due) {
      // …and asked AGAIN at apply time (verify: a hold taken after this list was made)
      const tr = await transition(p.id, 'expired', 'ttl', (q) => { q.reason = 'expired: not approved within 24 h'; }, { unless: () => proposalHolds.has(p.id) });
      if (!tr.ok) continue;
      auditOutbox(store.outbox.snapshot().proposals[p.id], 'expire');
      await receipt(p.id);
      await pointerSync(p.key);
      notifyOutbox([p.id]); notify(p.convId ? [p.convId] : []);
    }
    return due.length;
  }

  /**
   * THE PER-CONVERSATION "FOR YOU" POINTER (§9.2). One item per conversation,
   * text WITHOUT a count (dedupe-by-text is the idempotence we want), count +
   * latest body in `detail` (updated in place on re-file), the id persisted on
   * the conversation row, retracted by THIS producer — only its own id, only
   * while open — when the last proposal leaves awaiting-approval. A throw from
   * the open-item cap is caught, logged and DEGRADES to the rail badge and
   * the Outbox window; it never takes the proposal down with it.
   */
  async function pointerSync(key) {
    if (typeof key === 'string' && key.includes('/~compose/')) return composePointerSync(key.slice(0, key.indexOf('/~compose/')));
    const en = store.index.peek(key);
    if (!en) return;
    const awaiting = proposalsFor(key).filter((p) => p.state === 'awaiting-approval');
    const rec = adapterRecords().adapters.find((r) => r.id === en.adapterId) || null;
    if (awaiting.length) {
      if (!userTodos || typeof userTodos.add !== 'function') return;
      const title = String((rec && humanNameOf(rec, en)) || en.id).slice(0, 120);   // B-c127: the ladder
      const text = `Proposals awaiting approval in ${title}`;
      const latest = awaiting[0];
      const agentName = latest.draftedBy && latest.draftedBy.kind === 'agent' ? (latest.draftedBy.name || latest.draftedBy.id) : null;
      const who = agentName || 'you';
      const adapterLabel = rec ? (rec.label || rec.id) : en.adapterId;
      const latestText = String(latest.text).slice(0, 300);
      const detail = `${awaiting.length} proposal${awaiting.length === 1 ? '' : 's'} awaiting your approval in ${adapterLabel} · ${title}.\nLatest (${who}): "${latestText}"\n\nOpen the Outbox (rail → Channels → Outbox) or the conversation window to approve, edit or reject. This item is retracted by the channels engine when the last proposal leaves awaiting-approval.`;
      // the same sentences as STRUCTURE — the client words them (a3 i18n)
      const i18n = {
        text: { key: i18nKey('Proposals awaiting approval in {title}'), params: { title } },
        detail: [
          { key: i18nKey('{n} proposal(s) awaiting your approval in {adapter} · {title}.'), params: { n: awaiting.length, adapter: adapterLabel, title } },
          agentName ? { key: i18nKey('Latest ({who}): "{text}"'), params: { who: agentName, text: latestText } } : { key: i18nKey('Latest (your own draft): "{text}"'), params: { text: latestText } },
          { key: i18nKey('Open the Outbox (rail → Channels → Outbox) or the conversation window to approve, edit or reject. This item is retracted by the channels engine when the last proposal leaves awaiting-approval.') },
        ],
        source: INBOX_SOURCE,
      };
      try {
        const prevId = en.pendingTodoId || null;
        const item = userTodos.add(INBOX_KEY, { origin: 'channels', text, detail, urgency: 'normal', by: 'agent', sessionName: 'Channels', i18n, action: { type: 'open-channel', adapterId: en.adapterId, convId: en.id, key: en.key } });   // B-c127: a click opens the conversation; verify r1 F2: `key` = the item's identity
        if (item && item.id) await store.index.update(() => { const e2 = store.index.entry(en.adapterId, en.id, { create: false }); if (e2) e2.pendingTodoId = item.id; });
        // B-c127: a pointer filed before it carried its action (or under an older name) is a DIFFERENT item now — retract it, never orphan it
        if (item && item.id && prevId && prevId !== item.id && typeof userTodos.get === 'function') { try { const it = userTodos.get(prevId); if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(prevId, 'done', RESOLVED_BY); } catch { /* the new pointer stands */ } }
      } catch (e) {
        // DEGRADE, never fail the proposal: the rail badge and the Outbox
        // window are the recorded surfaces; the pointer is a convenience.
        log.warn(`[channels] ${key}: could not file the approval pointer (${(e && e.message) || e}) — the Outbox badge still shows it`);
      }
      return;
    }
    if (!en.pendingTodoId) return;
    const id = en.pendingTodoId;
    await store.index.update(() => { const e2 = store.index.entry(en.adapterId, en.id, { create: false }); if (e2) e2.pendingTodoId = null; });
    if (!userTodos || typeof userTodos.get !== 'function') return;
    try {
      const it = userTodos.get(id);
      if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(id, 'done', RESOLVED_BY);
    } catch (e) { log.warn(`[channels] ${key}: could not retract the approval pointer: ${(e && e.message) || e}`); }
  }

  return {
    honestyLineFor, sendIdentityFor, proposalsFor, agentProposalView, stashAbout, stashGate, outboxView, notifyOutbox, sendStartsTurn,
    outboxAttachment, filesSweep, propose, proposeReaction, compose, composeEach, approve, reject, onProposal, withdrawProposal, replaceProposal,
    noteReceiptStash, reconcileReceiptFates, reconcile, sweepSending, sweepReplaces, receipt, expireSweep, pointerSync, learnSentFiles,
    filesOfferFor,   // lane owner-composer-attach: the owner's composer judges its chips by the same offer the send reads
  };
}

module.exports = { create };
