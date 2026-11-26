/**
 * src/server/end-proposals.js — ORCH: THE PROPOSAL CARD's store-side (lane login-request-card, majordomo piece 3b; PURE rules in
 * src/end-proposal.js). An agent that needs a person-only act PROPOSES it; the person sees ONE card per proposer, refreshed, never a
 * flood; one press approves or declines; the answer returns to the proposer at its next turn at no cost (the stash — never a wake).
 * Two kinds of ONE action type: an END (conversations.propose — its rows from the SAME builder as conversations.list) and a WAKE
 * GRANT (piece 7's propose-wake — each row names the conversation its job will wake, read from the job). THE CURE'S LAWS (主开发
 * 2026-11-17 20:11Z): a row's identity cannot alias (a conversation with no id yet is refused at the proposal); a press carries the
 * drawing it answers (a card changed since is redrawn, never acted on); one answer per card in flight; the press writes only what
 * the card drew (an end row's job ticks: its own jobs, and only rows really ended); everything the press did is said, once, with the
 * true reason; a second proposal ADDS to the open card (a row named again is redrawn) for both kinds; what the person declined
 * stays declined until it differs; the card resolves only on the FACT that every conversation on it ended (a stopped record) — never
 * because a live set is still filling; names toward the agent pass the belt; the ended record names the proposer. No clock.
 */
'use strict';

const EP = require('../end-proposal.js');
const PT = require('../peer-text.js');   // THE belt toward an agent (the answer names conversations and jobs — words an agent may have written)

const TYPE = 'end-proposal';   // = src/end-proposal.js TYPE (the census reads the literal where it is filed); its kinds: action.kind 'end' | 'wake' (the SECOND kind — 主开发 05:13Z, the owner's widened wake grant: may a job or schedule wake its conversation after an end on purpose)
const WAKE = 'wake';
const kindOf = (i) => (i && i.action && i.action.kind === WAKE ? WAKE : 'end');
const FROM_NAME = 'VibeSpace proposals';   // src/notification-senders.js lists it (the stash's sender prefix law)
const ANSWERED = 'answered', ALL_ENDED = 'all-ended';   // the card's two ends (src/foryou-actions.js row `ends` — a decision: nothing else closes it)
const line = (s) => PT.toAgentText(String(s || ''), { kind: 'line', max: 120 });

function create({ userTodos, deliver, listFacts, endConversation, liveKeys = null, endedKeys = null, storeWakeTicks = null, setWakeGrants = null, jobOwnerOf = null, wakeRowsNow = null, heldWaitMs = 20000, log = () => { }, lineageOf = null } = {}) {
  // lane lg-group-parents (restack 415): a row's Task Group ANCESTORS through the ONE reader the wiring hands (tasks.grantGroupsOf);
  // a read that throws (or answers no list) is UNREADABLE — refused by name like the hold, never «no parents»; restack 416 (r311 (a), (b)):
  // a row whose own groups are still being read (null) is unreadable; no group has no ancestors; groups with NO reader wired are unknown
  const lineageFacts = (groups) => { if (groups === null) return { inherited: [], groupsUnreadable: true }; if (Array.isArray(groups) && !groups.length) return { inherited: [] }; if (typeof lineageOf !== 'function') return { inherited: [], groupsUnreadable: true }; let l = null; try { l = lineageOf(groups); } catch { l = null; } return Array.isArray(l) ? { inherited: l } : { inherited: [], groupsUnreadable: true }; };
  const inFlight = new Map();   // the cards a press is answering right now (id → that answer) — a second press is told so, the sweep leaves them alone, a proposal waits for it
  // THE OWNER BY ITS OWN ID (主开发 23:06Z): a job's record keeps its owner's conversation id only, so a key's backend is a guess when
  // the owner is not live — the press, the end card's ticks and the drawing compare and name by the conversation's id, never the key
  const idOf = (k) => { const t = String(k || ''); const i = t.indexOf(':'); return i > 0 ? t.slice(i + 1) : t; };
  const ownId = (o) => (o && (o.cid || idOf(o.key))) || '';
  // THE HELD PROPOSAL (主开发 23:06Z, the should): a proposal landing while a press answers its card WAITS for that answer, then is judged
  // and filed — on the card if the press left it open, else as a NEW card; never merged into a card a press is closing (it was told
  // «added», unseen). The wait is bounded by answers (HELD_MAX) AND by time (heldWaitMs: a door that never returns answers BUSY); the
  // final read of the open card is SYNCHRONOUS with the filing (two held proposals make one card), and a press that started during
  // the list read is waited for again (the rows judged again — cure r3, the readers 23:37Z)
  // cure r4 (主开发 06:53Z, «as if a must»): ONE deadline for the WHOLE call — set at its first entry and carried through every
  // re-entry, `heldWaitMs` (20 s, under the CLI's 30 s write budget: a proposal is never filed after its command gave up); a press
  // that starts AND ends inside the list read is seen too (`pressSeq` — the proposer's presses counted before and after the read)
  const HELD_MAX = 8;
  const LATE = {};
  const pressSeq = new Map();   // proposer key → presses begun on its cards
  async function freeOf(proposerKey, kind, deadline) {
    for (let n = 0; ; n++) {
      const o = openOf(proposerKey, kind);
      if (!o || !inFlight.has(o.id)) return { waited: n > 0 };
      const left = deadline - Date.now();
      if (n >= HELD_MAX || left <= 0) return { busy: true };
      let t = null;
      const late = new Promise((r) => { t = setTimeout(() => r(LATE), left); if (t && t.unref) t.unref(); });
      let got = null;
      try { got = await Promise.race([inFlight.get(o.id), late]); } catch { got = null; } finally { clearTimeout(t); }
      if (got === LATE) return { busy: true };
    }
  }
  const BUSY = { ok: false, code: 'answering', why: 'the person is answering your open card right now — propose again in a moment; nothing was proposed' };
  const ofProposer = (proposerKey, kind, pred) => { try { return userTodos.idsWhere((i) => i && i.sessionKey === proposerKey && EP.isProposal(i.action) && kindOf(i) === kind && pred(i)); } catch { return []; } };
  const openOf = (proposerKey, kind = 'end') => { const ids = ofProposer(proposerKey, kind, (i) => i.status === 'open'); return ids.length ? userTodos.get(ids[0]) : null; };
  const pastCount = (proposerKey, kind = 'end') => ofProposer(proposerKey, kind, () => true).length;
  /** The last decision of this proposer for this kind (its card's `decided` record) — law 8. */
  const lastDecided = (proposerKey, kind) => {
    const items = ofProposer(proposerKey, kind, (i) => i.status !== 'open' && i.card && i.card.decided).map((id) => userTodos.get(id)).filter(Boolean);
    items.sort((a, b) => ((b.card.decided.at || 0) - (a.card.decided.at || 0)));
    return items.length ? items[0].card.decided : null;
  };
  /** A row of the list by what a caller names: its key, its conversation id, or its live webui id (to refuse a keyless one by name). */
  const rowFor = (rows, t) => rows.find((r) => r && ((r.key && (r.key === t || r.key.slice(r.key.indexOf(':') + 1) === t)) || r.id === t)) || null;
  // the press's act in piece 7's words: ONLY the person's own press ({kind:'human'} from the cookie-only route) becomes the jobs
  // engine's { kind: 'person' } — anything else reaches the one door (changeWakeGrants) as null and is refused there by name
  const personBy = (by) => (by && by.kind === 'human' ? { kind: 'person', by: 'person' } : null);
  const proposerOf = (caller) => (caller && typeof caller.sessionKey === 'string' && /^[a-z][\w-]*:\S+$/.test(caller.sessionKey) ? caller.sessionKey : null);
  const words = (n, name) => ({ key: n === 1 ? '«{name}» proposes ending 1 conversation' : '«{name}» proposes ending {n} conversations', params: { name, n } });
  // the decision's memory (law 8) — FLAT strings (a For-you card nests 4 deep at most): an end row «key|busy codes», a job «id|owner|grant»
  const decidedNow = (card, kept) => ({ ...card, decided: { at: Date.now(), kept } });
  const endMark = (d) => `${d.key}|${(d.busy || []).join(',')}`;
  const jobMark = (r) => `${r.id}|${idOf((r.owner && r.owner.key) || '')}|${r.grant === true ? 1 : 0}`;
  // cure r4: a mark kept before r3 carried the owner's whole key — it still matches (a card declined then is not filed again)
  const jobMarks = (r) => [jobMark(r), `${r.id}|${(r.owner && r.owner.key) || ''}|${r.grant === true ? 1 : 0}`];   // the owner by its id (a guessed backend never makes a declined row look new)
  const close = (id, by, card = null) => { try { if (card) userTodos.setCard(id, card); userTodos.setStatus(id, 'done', by); return true; } catch (e) { log(`card ${id} not closed: ${e && e.message || e}`); return false; } };

  /** conversations.propose — the verb's body. `reach(row)` = the ONE rule every verb asks (opener / grant / self). */
  async function propose({ targets, why }, { caller, reach }, depth = 0, until = 0) {
    const t = EP.targetsOf(targets);
    if (!t.ok) return t;
    const text = typeof why === 'string' ? why.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, EP.WHY_MAX) : '';
    if (!text) return { ok: false, code: 'bad_args', why: 'why: one sentence of why the person should end them' };
    const proposerKey = proposerOf(caller);
    if (!proposerKey) return { ok: false, code: 'no_proposer', why: 'the calling conversation has no id yet — send it one message first; nothing was proposed' };
    if (!listFacts || typeof listFacts.list !== 'function') return { ok: false, code: 'not_ready', why: 'the conversation list is not wired yet' };
    const deadline = until || (Date.now() + heldWaitMs);   // cure r4: ONE deadline for the whole call
    const free = await freeOf(proposerKey, 'end', deadline);   // held: the rows are judged AFTER a press on this proposer's card
    if (free.busy) return BUSY;
    const seq0 = pressSeq.get(proposerKey) || 0;
    const snap = await listFacts.list();
    const rows = Array.isArray(snap && snap.conversations) ? snap.conversations : [];
    const unseen = [], held = [], gone = [], ended = [], keyless = [], drawn = [];
    for (const target of t.targets) {
      const r = rowFor(rows, target);
      if (!r) { gone.push(target); continue; }
      const cid = r.key ? r.key.slice(r.key.indexOf(':') + 1) : null;
      let v = null; try { v = reach({ conversationId: cid, webuiId: r.id || null, groups: Array.isArray(r.groups) ? r.groups : [], ...lineageFacts(r.groupsUnreadable === true ? null : (Array.isArray(r.groups) ? r.groups : [])), ...require('./groups-hold.js').fact() }); } catch { v = null; }   // the hold's fact: a grant «… except G» never draws G's conversation while the store is held   // lane lg-group-parents (restack 415): + the row's ancestors (a grant «… except P» never draws P's child's conversation)
      if (v && v.code === 'groups_unreadable') { held.push(target); continue; }   // the store HELD: refused BY NAME below, never «outside what your key reaches»
      if (!(v && v.ok)) { unseen.push(target); continue; }
      if (!r.key) { keyless.push(target); continue; }   // law 2: a row's identity cannot alias — no conversation id yet, no row
      if (r.state === 'ended') { ended.push(line(r.name || r.key)); continue; }
      drawn.push(EP.drawnRow(r));
    }
    // a proposer that names a conversation outside what it can see is refused BY NAME — nothing is filed
    if (held.length) return { ok: false, code: 'groups_unreadable', why: `the Task Groups could not be read just now, so whether your key reaches ${held.join(', ')} is unknown — nothing was proposed; try again in a moment`, targets: held };
    if (unseen.length) return { ok: false, code: 'not_visible', why: `outside what your key reaches: ${unseen.join(', ')} — nothing was proposed`, targets: unseen };
    if (gone.length) return { ok: false, code: 'not_found', why: `no conversation by ${gone.length === 1 ? 'that id' : 'those ids'}: ${gone.join(', ')} — nothing was proposed`, targets: gone };
    if (keyless.length) return { ok: false, code: 'no_conversation_id', why: `${keyless.join(', ')} has not reported its conversation id yet — propose it once it has (it reports one at its first turn); nothing was proposed`, targets: keyless };
    if (!drawn.length) return { ok: false, code: 'nothing_to_end', why: `every one of them has ended already (${ended.join(', ')})` };
    const name = caller.name || proposerKey;
    // the final read, SYNCHRONOUS with the filing below; a press that started during the list read is waited for (and judged) again
    const open = openOf(proposerKey);
    if ((open && inFlight.has(open.id)) || (pressSeq.get(proposerKey) || 0) !== seq0) return depth >= HELD_MAX ? BUSY : propose({ targets, why }, { caller, reach }, depth + 1, deadline);
    // law 8: the very rows the person last kept, unchanged (the same keys, the same things running) — said once, nothing filed
    const dec = open ? null : lastDecided(proposerKey, 'end');
    if (dec && Array.isArray(dec.kept) && drawn.every((d) => dec.kept.includes(endMark(d)))) {
      return { ok: false, code: 'declined', why: EP.declinedText('end', drawn.map((d) => line(d.name || d.key)), dec.at) };
    }
    // law 9: ONE rule for both kinds — a second proposal ADDS to the open card; a row named again is redrawn
    const had = open && open.card && Array.isArray(open.card.rows) ? open.card.rows : [];
    const keys = new Set(drawn.map((d) => d.key));
    const all = [...had.filter((d) => d && d.key && !keys.has(d.key)), ...drawn];
    if (all.length > EP.MAX_TARGETS) return { ok: false, code: 'card_full', why: `the open card holds ${had.length} conversations — at most ${EP.MAX_TARGETS} on one card; the person answers it first` };
    const itemKey = open ? open.itemKey : `end-proposal:${pastCount(proposerKey) + 1}`;
    const w = words(all.length, name);
    const it = userTodos.add(proposerKey, {
      origin: 'agent', by: 'agent', sessionName: name, urgency: 'normal', itemKey,
      text: w.key.replace('{name}', name).replace('{n}', String(all.length)), detail: text, i18n: { text: w },
      action: { type: TYPE, kind: 'end', proposer: proposerKey, rows: all.length },
      card: { why: text, rows: all, proposer: { key: proposerKey, name } },
    });
    return { ok: true, item: it && it.id, rows: all.length, added: drawn.length, refreshed: !!(it && it.existing), ...(ended.length ? { alreadyEnded: ended } : {}) };
  }

  /** THE PRESS — `body.drawn` = the card's signature as the page drew it; END: `terminate` = keys, `wakeTicks` = the rows' job ticks;
   *  WAKE: `grant` = the ids left ticked (none = keep all). `by` = the person's act ({kind:'human', actBy}). */
  async function answer(id, body = {}, by) {
    const { drawn = null, terminate = [], wakeTicks = null, grant = null } = body || {};
    const it = userTodos.get(id);
    if (!it || !EP.isProposal(it.action)) return { ok: false, code: 'not_found', why: 'no proposal card by that id' };
    if (it.status !== 'open') return { ok: false, code: 'answered', why: 'that card was answered already' };
    if (inFlight.has(id)) return { ok: false, code: 'answering', why: 'that card is being answered on another page right now' };
    if (!drawn || drawn !== EP.cardSig(it.card)) return { ok: false, code: 'card_changed', why: 'the card changed since it was drawn — read it again, then press' };   // law 4
    let done = null;
    inFlight.set(id, new Promise((r) => { done = r; }));   // claimed BEFORE the answer starts: a proposal arriving now waits for it
    const pk = String(it.sessionKey || ''); pressSeq.set(pk, (pressSeq.get(pk) || 0) + 1);   // cure r4: a press inside a list read is seen
    try { return kindOf(it) === WAKE ? await answerWake(it, grant, by) : await answerEnd(it, terminate, wakeTicks, by); }
    finally { inFlight.delete(id); done(); }
  }

  async function answerEnd(it, terminate, wakeTicks, by) {
    const card = it.card || {};
    const rows = Array.isArray(card.rows) ? card.rows.filter((d) => d && d.key) : [];
    const pick = new Set((Array.isArray(terminate) ? terminate : []).map(String));
    const snap = await listFacts.list();
    const now = Array.isArray(snap && snap.conversations) ? snap.conversations : [];
    const ticks = Array.isArray(wakeTicks) ? wakeTicks : [];
    const proposer = (it.action && it.action.proposer) || it.sessionKey;
    const out = { terminated: [], kept: [], changed: [], failed: [], ended: [], granted: [], withdrawn: [], keptRows: [] };
    const still = [];
    for (const d of rows) {
      const nowRow = now.find((r) => r && r.key && r.key === d.key) || null;
      if (!pick.has(d.key)) { if (nowRow && nowRow.state !== 'ended') { out.kept.push(d); out.keptRows.push(endMark(d)); } else out.ended.push(d); continue; }
      const pv = EP.pressVerdict(d, nowRow);
      if (pv.verdict === 'ended' || pv.verdict === 'gone') { out.ended.push(d); continue; }
      if (pv.verdict === 'changed') { out.changed.push({ ...d, added: pv.added }); still.push({ ...pv.row, changed: pv.added }); continue; }
      // law 4: the ticks THIS row's jobs carry — only jobs that wake this very conversation, and only when it is really ended
      // B-f276 (主开发 r5074 (2)): the jobs engine HELD — whose ticks these are cannot be read: the press is NOT done for this row, the hold named
      { const h = typeof jobOwnerOf === 'function' && ticks.length ? ticks.map((x) => x && typeof x.id === 'string' ? jobOwnerOf(x.id) : null).find((o) => o && o.held) : null;
        if (h) { out.failed.push({ ...d, failed: 'jobs_unread', why: String(h.held) }); still.push({ ...EP.drawnRow(nowRow), failed: 'jobs_unread' }); continue; } }
      const mine = ticks.filter((x) => x && typeof x.id === 'string' && typeof jobOwnerOf === 'function' && ownId(jobOwnerOf(x.id)) === idOf(d.key)).map((x) => ({ id: x.id, grant: x.grant === true }));
      if (mine.length) {
        if (typeof storeWakeTicks !== 'function') { out.failed.push({ ...d, failed: 'jobs_not_wired' }); still.push({ ...EP.drawnRow(nowRow), failed: 'jobs_not_wired' }); continue; }
        try { await storeWakeTicks(mine, personBy(by)); } catch (e) { out.failed.push({ ...d, failed: 'ticks_not_stored' }); still.push({ ...EP.drawnRow(nowRow), failed: 'ticks_not_stored' }); continue; }
      }
      const cid = d.key.slice(d.key.indexOf(':') + 1);
      const r = await endConversation({ sessionId: nowRow.id, backendSessionId: cid }, { ...(by || {}), proposedBy: { key: proposer, name: (card.proposer && card.proposer.name) || null } });   // law 12: the record names the proposer
      if (r && r.ok === false) {
        if (mine.length) { try { await storeWakeTicks(mine.map((x) => ({ id: x.id, grant: !x.grant })), personBy(by)); } catch { /* said below: the end failed */ } }   // not ended ⇒ its ticks go back
        out.failed.push({ ...d, failed: r.code || 'failed' }); still.push({ ...EP.drawnRow(nowRow), failed: r.code || 'failed' }); continue;
      }
      out.terminated.push(d);
      for (const x of mine) (x.grant ? out.granted : out.withdrawn).push({ id: x.id, name: x.id });
    }
    let open = still.length > 0;
    if (open) { try { userTodos.setCard(it.id, { ...card, rows: still }); } catch { } }
    else open = !close(it.id, ANSWERED, decidedNow(card, out.keptRows));
    const told = tellText(it, EP.answerText(out));
    const { keptRows, ...said } = out; void keptRows;
    return { ok: true, ...said, open, told };
  }

  /** THE SECOND KIND — the door piece 7 binds (jobsWiring.setProposalDoor; `vibespace-job propose-wake` / `--propose-wake` reach it
   *  through the agent route, which judged the job, the why and the owner conversation first). `rows` = piece 7's wakeChoiceRows;
   *  each row is drawn with the conversation its job will WAKE (`owner`, read from the job — the proposer may be another, a manager
   *  for a worker's job). ONE card per proposer: a job already on it is redrawn, a new job joins. → { ok, id, rows, refreshed } */
  async function proposeWakeGrant(caller, { rows: given, why } = {}, depth = 0, until = 0, stale = false) {
    let rows = given;
    const proposerKey = proposerOf(caller);
    if (!proposerKey) return { ok: false, code: 'no_proposer', why: 'no proposing conversation (it has no id yet) — nothing was filed' };
    const text = typeof why === 'string' ? why.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, EP.WHY_MAX) : '';
    if (!text) return { ok: false, code: 'bad_args', why: 'why: one sentence of why these may wake their conversation' };
    const deadline = until || (Date.now() + heldWaitMs);   // cure r4: ONE deadline for the whole call
    const free = await freeOf(proposerKey, WAKE, deadline);   // held: the rows are drawn AFTER a press on this proposer's card
    if (free.busy) return BUSY;
    const seq0 = pressSeq.get(proposerKey) || 0;
    // a row the caller read before the wait may be stale (that press may have just granted it): read each job's row again — a job
    // gone meanwhile is named (not found), a job the press granted is said (already granted), never a card for it (cure r4)
    if ((free.waited || stale) && typeof wakeRowsNow === 'function') {
      const asked = (Array.isArray(given) ? given : []).map((r) => r && r.id).filter(Boolean);
      const again = wakeRowsNow(asked);
      if (Array.isArray(again)) {
        const have = new Set(again.map((r) => r && r.id));
        const gone = asked.filter((id) => !have.has(id));
        if (gone.length) return { ok: false, code: 'not_found', why: `${gone.join(', ')} no longer ${gone.length === 1 ? 'exists' : 'exist'} (removed while the person answered your card) — nothing was filed` };
        const before = new Map((Array.isArray(given) ? given : []).map((r) => [r && r.id, r && r.grant === true]));
        const grantedNow = again.filter((r) => r && r.grant === true && before.get(r.id) !== true).map((r) => r.id);
        rows = again.filter((r) => !grantedNow.includes(r.id));
        if (!rows.length && grantedNow.length) return { ok: true, already: true, why: `${grantedNow.join(', ')} may already wake ${grantedNow.length === 1 ? 'its conversation' : 'their conversations'} — the person granted it just now; nothing was filed` };
      }
    }
    const names = new Map(), keyById = new Map();   // the list's rows by key AND by id: an owner not live is named (and keyed) by its id
    try { const snap = listFacts && typeof listFacts.list === 'function' ? await listFacts.list() : null; for (const r of (snap && snap.conversations) || []) if (r && r.key) { names.set(r.key, r.name || null); keyById.set(idOf(r.key), r.key); } } catch { /* names are words only */ }
    const fresh = [];
    for (const r of (Array.isArray(rows) ? rows : []).filter((x) => x && typeof x.id === 'string' && x.id).slice(0, EP.MAX_TARGETS)) {
      const o = typeof jobOwnerOf === 'function' ? jobOwnerOf(r.id) : null;
      if (o && o.held) return { ok: false, code: 'records-unread', why: String(o.held) };   // B-f276 (r5074 (2)): a held engine — never «belongs to no conversation»
      if (!o || !o.key) return { ok: false, code: 'no_owner', why: `${r.id} belongs to no conversation — there is nothing for it to wake; nothing was filed` };
      fresh.push({ id: r.id.slice(0, 120), name: typeof r.name === 'string' && r.name ? r.name.slice(0, 120) : r.id.slice(0, 120), kind: r.kind === 'schedule' ? 'schedule' : 'job',
        nextAt: Number.isFinite(r.nextAt) ? r.nextAt : null, grant: r.grant === true, by: r.grant === true && r.by && typeof r.by === 'object' ? { kind: r.by.kind === 'key' ? 'key' : 'person', name: typeof r.by.name === 'string' ? r.by.name.slice(0, 80) : null, at: Number(r.by.at) || null } : null,
        owner: { key: keyById.get(ownId(o)) || o.key, name: (names.get(keyById.get(ownId(o)) || o.key) || '').slice(0, 120) || null, self: ownId(o) === idOf(proposerKey) } });
    }
    if (!fresh.length) return { ok: false, code: 'bad_args', why: 'name at least one job or schedule' };
    const name = (caller && caller.name) || proposerKey;
    // the final read, SYNCHRONOUS with the filing below; a press that started during the list read is waited for (and drawn) again
    const open = openOf(proposerKey, WAKE);
    if ((open && inFlight.has(open.id)) || (pressSeq.get(proposerKey) || 0) !== seq0) return depth >= HELD_MAX ? BUSY : proposeWakeGrant(caller, { rows: given, why }, depth + 1, deadline, true);
    const dec = open ? null : lastDecided(proposerKey, WAKE);
    if (dec && Array.isArray(dec.kept) && fresh.every((r) => jobMarks(r).some((m) => dec.kept.includes(m)))) {
      return { ok: false, code: 'declined', why: EP.declinedText('wake', fresh.map((r) => r.id), dec.at) };   // the jobs by id (a job's words never ride a sentence — the record-clear law)
    }
    const had = open && open.card && Array.isArray(open.card.rows) ? open.card.rows : [];
    const ids = new Set(fresh.map((r) => r.id));
    const list = [...had.filter((r) => r && !ids.has(r.id)), ...fresh];   // a job already on the card is redrawn, never doubled
    if (list.length > EP.MAX_TARGETS) return { ok: false, code: 'card_full', why: `the open card holds ${had.length} jobs — at most ${EP.MAX_TARGETS} on one card; the person answers it first` };
    const itemKey = open ? open.itemKey : `wake-proposal:${pastCount(proposerKey, WAKE) + 1}`;
    const self = list.every((r) => r.owner && r.owner.self);
    const only = !self && list.length === 1 ? list[0].owner : null;
    const w = self
      ? { key: list.length === 1 ? '«{name}» asks that 1 job may wake it after it is ended' : '«{name}» asks that {n} jobs may wake it after it is ended', params: { name, n: list.length } }
      : only ? { key: '«{name}» asks that 1 job may wake «{owner}» after it is ended', params: { name, owner: only.name || only.key } }
        : { key: '«{name}» asks that {n} jobs may wake the conversations they belong to after those are ended', params: { name, n: list.length } };   // law 1: «it» only when the proposer IS the conversation woken
    let txt = w.key; for (const [k, v] of Object.entries(w.params)) txt = txt.replace(`{${k}}`, String(v));
    const it = userTodos.add(proposerKey, {
      origin: 'agent', by: 'agent', sessionName: name, urgency: 'normal', itemKey,
      text: txt, detail: text, i18n: { text: w },
      action: { type: TYPE, kind: WAKE, proposer: proposerKey, rows: list.length },
      card: { why: text, rows: list, proposer: { key: proposerKey, name } },
    });
    return { ok: true, id: it && it.id, rows: list.length, refreshed: !!(it && it.existing) };
  }

  /** The wake card's press: `grant` = the ids the person left ticked (null = «Keep all as they are»: nothing written). Each row whose
   *  tick differs from the grant it was drawn with is written through piece 7's in-process person door — after its job is read
   *  AGAIN: gone ⇒ said; now waking another conversation than the card showed ⇒ not written, said; refused ⇒ said, and what landed
   *  is said too (the card stays open, redrawn with what landed). */
  async function answerWake(it, grant, by) {
    const card = it.card || {};
    const rows = Array.isArray(card.rows) ? card.rows : [];
    const out = { granted: [], withdrawn: [], unchanged: [], gone: [], moved: [], refused: [] };
    if (!Array.isArray(grant)) {
      out.unchanged = rows.slice();
      const closed = close(it.id, ANSWERED, decidedNow(card, rows.map(jobMark)));
      const told = tellText(it, EP.wakeAnswerText(out));
      return { ok: true, ...out, open: !closed, told };
    }
    const yes = new Set(grant.map(String));
    const changes = rows.filter((r) => (r.grant === true) !== yes.has(r.id));
    if (changes.length && typeof setWakeGrants !== 'function') return { ok: false, code: 'not_ready', why: 'the jobs engine is not wired — nothing was written' };
    out.unchanged = rows.filter((r) => !changes.includes(r));
    const landed = new Map();
    // THE ONE DOOR (lane lg-store-writes, 主开发 2026-11-20 08:17Z): the card's rows are ONE ACT — one landing mapped onto every row;
    // not landed ⇒ every changed row back as it was (one truth) and REFUSED not_now: the card stays open showing what is true
    const act = [];
    for (const r of changes) {
      const o = typeof jobOwnerOf === 'function' ? jobOwnerOf(r.id) : null;
      if (o && o.held) return { ok: false, code: 'records-unread', why: String(o.held), open: true };   // B-f276 (r5074 (2)): a held engine — nothing written, the card stays; never «gone» or «moved»
      if (!o) { out.gone.push(r); continue; }
      if (r.owner && ownId(o) !== ownId(r.owner)) { out.moved.push(r); continue; }
      act.push(r);
    }
    if (act.length) {
      const a = await setWakeGrants(act.map((r) => ({ id: r.id, grant: yes.has(r.id) })), personBy(by));
      for (const r of act) {
        const w = ((a && a.rows) || []).find((x) => x && x.id === r.id) || null;
        if (w && w.code === 'not_found') { out.gone.push(r); continue; }
        if (!w || !w.ok) { out.refused.push({ ...r, refused: (w && w.code) || (a && a.code) || 'refused' }); continue; }
        (yes.has(r.id) ? out.granted : out.withdrawn).push(r); landed.set(r.id, yes.has(r.id));
      }
    }
    let open = out.refused.length > 0;
    if (open) { try { userTodos.setCard(it.id, { ...card, rows: rows.map((r) => (landed.has(r.id) ? { ...r, grant: landed.get(r.id) } : r)) }); } catch { } }
    else open = !close(it.id, ANSWERED, decidedNow(card, rows.filter((r) => !yes.has(r.id)).map(jobMark)));
    const told = tellText(it, EP.wakeAnswerText(out));
    const none = out.refused.length > 0 && landed.size === 0;   // nothing landed and something was refused ⇒ a refusal; else what landed AND what was refused, both said
    return { ok: !none, ...out, open, told, ...(out.refused.length ? { code: out.refused[0].refused, why: `not written: ${out.refused.map((r) => r.id).join(', ')}` } : {}) };
  }

  /** The proposer hears it at its NEXT turn — the stash, free (never a wake). → told (a failed stash is said to the person). */
  function tellText(it, text) {
    const proposer = (it.action && it.action.proposer) || it.sessionKey;
    const cid = String(proposer || '').slice(String(proposer || '').indexOf(':') + 1);
    if (!cid || !deliver || typeof deliver.stashFor !== 'function') return false;
    try { const r = deliver.stashFor(cid, { source: 'agent', kind: 'notification', fromName: FROM_NAME, ref: `${it.id}:${Date.now().toString(36)}`, text: PT.toAgentText(String(text || '')) }); if (r && r.stored === false && r.taken) { log(`answer for ${proposer} ${r.why}`); return true; } return !(r && r.stored === false); }   // THE belt: a conversation's or a job's name on it may be an agent's words; r3919 must 2: TAKEN while the list is unread is TOLD (in memory, it goes at the agent's next prompt) — said in the journal, never «could not be told»
    catch (e) { log(`answer not stashed for ${proposer}: ${e && e.message || e}`); return false; }
  }

  /** The card resolves ONLY on the FACT that every conversation on it ended (a stopped record — endedKeys), never because one is
   *  missing from a live set that may still be filling (a restart's restore); a card a press is answering is left alone. */
  async function sweep() {
    let ids = [];
    try { ids = userTodos.idsWhere((i) => i && i.status === 'open' && EP.isProposal(i.action) && kindOf(i) === 'end' && !inFlight.has(i.id)); } catch { ids = []; }
    if (!ids.length || typeof endedKeys !== 'function') return 0;
    const live = new Set(typeof liveKeys === 'function' ? liveKeys() : []);
    let ended;
    try { ended = new Set(await endedKeys()); } catch { return 0; }
    let n = 0;
    for (const id of ids) {
      if (inFlight.has(id)) continue;
      const it = userTodos.get(id);
      const rows = it && it.status === 'open' && it.card && Array.isArray(it.card.rows) ? it.card.rows : [];
      if (!rows.length || !rows.every((d) => d && d.key && ended.has(d.key) && !live.has(d.key))) continue;
      if (!close(id, ALL_ENDED)) continue;
      n++;
      tellText(it, EP.answerText({ ended: rows.map((d) => ({ ...d, name: line(d.name || d.key) })) }));
    }
    return n;
  }

  return { propose, proposeWakeGrant, answer, sweep, TYPE, FROM_NAME, ANSWERED, ALL_ENDED };
}

/** THE READER of the conversation a job WAKES (its owner — a cron run's schedule's), as the hub binds it (mounts-plugins-wiring):
 *  `getJobs()` = the jobs engine, `sessions()` = the live sessions, `addressableId` = the one addressing rule (never the raw idiom —
 *  test-msg-cli-groups). The record keeps the owner's conversation ID only: the backend is a live session's that addresses it, else
 *  a guess (`live: false`) — the store compares and names by `cid`, never by the key (主开发 23:06Z). → { key, cid, live } | null */
function jobOwnerReader({ getJobs, sessions, addressableId }) {
  return (jobId) => {
    const jm = typeof getJobs === 'function' ? getJobs() : null;
    // B-f276 (主开发 r5074 (2)): the jobs engine HOLDS its lock or its records — no job can be looked up: a HELD answer (its words), never «no owner»
    const held = jm && ((typeof jm.lockHeldWords === 'function' && jm.lockHeldWords()) || (jm._unread && jm._unread.store && typeof jm.unreadWords === 'function' && jm.unreadWords('a job\'s owner cannot be read while the job records cannot be read')));
    if (held) return { held };
    const j = jm && jm.jobs ? jm.jobs.get(String(jobId || '')) : null;
    const t = j && j.cronParent ? (jm.jobs.get(j.cronParent) || j) : j;
    const cid = t && t.owner && t.owner.conversation && t.owner.conversation.id;
    if (!cid) return null;
    let backend = null;
    for (const x of (typeof sessions === 'function' ? sessions() : null) || []) if (x && addressableId(x) === cid) { backend = x.backend || 'claude'; break; }
    return { key: `${backend || 'claude'}:${cid}`, cid, live: !!backend };
  };
}

/** THE ROWS of named jobs AS THEY ARE NOW (piece 7's ONE helper, `jm.wakeRowsOf`) — a held wake proposal re-reads them after its wait
 *  (the press it waited for may have granted one). `getJobs()` = the jobs engine. → rows | null */
function wakeRowsReader({ getJobs }) {
  return (ids) => {
    const jm = typeof getJobs === 'function' ? getJobs() : null;
    if (!jm || !jm.jobs || typeof jm.wakeRowsOf !== 'function') return null;
    return jm.wakeRowsOf((ids || []).map((id) => jm.jobs.get(String(id))).filter(Boolean));
  };
}

module.exports = { create, jobOwnerReader, wakeRowsReader, TYPE, FROM_NAME };
