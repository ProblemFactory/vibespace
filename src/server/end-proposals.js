/**
 * src/server/end-proposals.js — ORCH: THE PROPOSAL CARD's store-side (lane login-request-card, majordomo piece 3b; PURE rules in
 * src/end-proposal.js). An agent that may NOT end a conversation PROPOSES the end (conversations.propose): ONE For-you item per
 * proposer (userTodos.add's own refresh-in-place by `itemKey`), its rows drawn from the SAME builder as conversations.list. The
 * person's press (the cookie-only route src/routes/end-proposals.js) is the person's own Terminate — each selected row judged again
 * at the press (pressVerdict): a row that started something since the drawing is NOT ended and is drawn again with what changed; one
 * that ended meanwhile is said. The proposer hears the answer at its NEXT turn through the stash (free — never a billed wake). The
 * card resolves when answered or when no row on it is live any more (sweep, at the live list's one notify point). No clock.
 */
'use strict';

const EP = require('../end-proposal.js');

const TYPE = 'end-proposal';   // = src/end-proposal.js TYPE (the census reads the literal where it is filed); its kinds: action.kind 'end' | 'wake' (the SECOND kind — 主开发 05:13Z, the owner's widened wake grant: may a job or schedule wake its conversation after an end on purpose)
const WAKE = 'wake';
const kindOf = (i) => (i && i.action && i.action.kind === WAKE ? WAKE : 'end');
const FROM_NAME = 'VibeSpace proposals';   // src/notification-senders.js lists it (the stash's sender prefix law)

function create({ userTodos, deliver, listFacts, endConversation, liveKeys = null, storeWakeTicks = null, setWakeGrant = null, log = () => { } } = {}) {
  const openOf = (proposerKey, kind = 'end') => {
    let ids = [];
    try { ids = userTodos.idsWhere((i) => i && i.sessionKey === proposerKey && i.status === 'open' && EP.isProposal(i.action) && kindOf(i) === kind); } catch { ids = []; }
    return ids.length ? userTodos.get(ids[0]) : null;
  };
  const pastCount = (proposerKey, kind = 'end') => { try { return userTodos.idsWhere((i) => i && i.sessionKey === proposerKey && EP.isProposal(i.action) && kindOf(i) === kind).length; } catch { return 0; } };
  /** A row of the list by what a caller names: its key, its conversation id, or its live webui id. */
  const rowFor = (rows, t) => rows.find((r) => r && (r.key === t || (r.key && r.key.slice(r.key.indexOf(':') + 1) === t) || r.id === t)) || null;
  // the press's act in piece 7's words: ONLY the person's own press ({kind:'human'} from the cookie-only route) becomes the jobs
  // engine's { kind: 'person' } — anything else reaches setWakeGrant as null and is refused there by name
  const personBy = (by) => (by && by.kind === 'human' ? { kind: 'person', by: 'person' } : null);
  const words = (n, name) => ({ key: n === 1 ? '«{name}» proposes ending 1 conversation' : '«{name}» proposes ending {n} conversations', params: { name, n } });

  /** conversations.propose — the verb's body. `reach(row)` = the ONE rule every verb asks (opener / grant / self). */
  async function propose({ targets, why }, { caller, reach }) {
    const t = EP.targetsOf(targets);
    if (!t.ok) return t;
    const text = typeof why === 'string' ? why.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, EP.WHY_MAX) : '';
    if (!text) return { ok: false, code: 'bad_args', why: 'why: one sentence of why the person should end them' };
    if (!listFacts || typeof listFacts.list !== 'function') return { ok: false, code: 'not_ready', why: 'the conversation list is not wired yet' };
    const snap = await listFacts.list();
    const rows = Array.isArray(snap && snap.conversations) ? snap.conversations : [];
    const unseen = [], gone = [], ended = [], drawn = [];
    for (const target of t.targets) {
      const r = rowFor(rows, target);
      if (!r) { gone.push(target); continue; }
      const cid = r.key ? r.key.slice(r.key.indexOf(':') + 1) : null;
      let v = null; try { v = reach({ conversationId: cid, webuiId: r.id || null, groups: Array.isArray(r.groups) ? r.groups : [] }); } catch { v = null; }
      if (!(v && v.ok)) { unseen.push(target); continue; }
      if (r.state === 'ended') { ended.push(r.name || r.key); continue; }
      drawn.push(EP.drawnRow(r));
    }
    // a proposer that names a conversation outside what it can see is refused BY NAME — nothing is filed
    if (unseen.length) return { ok: false, code: 'not_visible', why: `outside what your key reaches: ${unseen.join(', ')} — nothing was proposed`, targets: unseen };
    if (gone.length) return { ok: false, code: 'not_found', why: `no conversation by ${gone.length === 1 ? 'that id' : 'those ids'}: ${gone.join(', ')} — nothing was proposed`, targets: gone };
    if (!drawn.length) return { ok: false, code: 'nothing_to_end', why: `every one of them has ended already (${ended.join(', ')})` };
    const proposerKey = caller.sessionKey || `claude:${caller.conversationId}`;
    const name = caller.name || proposerKey;
    const open = openOf(proposerKey);
    const itemKey = open ? open.itemKey : `end-proposal:${pastCount(proposerKey) + 1}`;
    const w = words(drawn.length, name);
    const it = userTodos.add(proposerKey, {
      origin: 'agent', by: 'agent', sessionName: name, urgency: 'normal', itemKey,
      text: w.key.replace('{name}', name).replace('{n}', String(drawn.length)), detail: text, i18n: { text: w },
      action: { type: TYPE, kind: 'end', proposer: proposerKey, rows: drawn.length },
      card: { why: text, rows: drawn, proposer: { key: proposerKey, name } },
    });
    return { ok: true, item: it && it.id, rows: drawn.length, refreshed: !!(it && it.existing), ...(ended.length ? { alreadyEnded: ended } : {}) };
  }

  /** THE PRESS — the person's own Terminate over the selected rows (`terminate` = keys; the rest are kept). `by` = the person's
   *  act ({kind:'human', actBy}). → { ok, terminated, kept, changed, ended, open } (open: the card stays, redrawn with what changed). */
  async function answer(id, body = {}, by, { pressed = null } = {}) {
    const { terminate = [], wakeTicks = null, grant = null } = body || {};
    const it = userTodos.get(id);
    if (!it || !EP.isProposal(it.action)) return { ok: false, code: 'not_found', why: 'no proposal card by that id' };
    if (it.status !== 'open') return { ok: false, code: 'answered', why: 'that card was answered already' };
    if (kindOf(it) === WAKE) return answerWake(it, { grant }, by, { pressed });
    const card = it.card || {};
    const rows = Array.isArray(card.rows) ? card.rows : [];
    const pick = new Set((Array.isArray(terminate) ? terminate : []).map(String));
    const snap = await listFacts.list();
    const now = Array.isArray(snap && snap.conversations) ? snap.conversations : [];
    if (typeof storeWakeTicks === 'function' && Array.isArray(wakeTicks) && wakeTicks.length) { try { await storeWakeTicks(wakeTicks, personBy(by)); } catch (e) { return { ok: false, code: 'ticks_not_stored', why: String(e && e.message || e) }; } }   // piece 7's grant, stored BEFORE any end runs
    const out = { terminated: [], kept: [], changed: [], ended: [] };
    const still = [];
    for (const d of rows) {
      const nowRow = now.find((r) => r && r.key === d.key) || null;
      if (!pick.has(d.key)) { (nowRow && nowRow.state !== 'ended' ? out.kept : out.ended).push(d); continue; }
      const pv = EP.pressVerdict(d, nowRow);
      if (pv.verdict === 'ended' || pv.verdict === 'gone') { out.ended.push(d); continue; }
      if (pv.verdict === 'changed') { out.changed.push({ ...d, added: pv.added }); still.push({ ...pv.row, changed: pv.added }); continue; }
      const cid = d.key.slice(d.key.indexOf(':') + 1);
      const r = await endConversation({ sessionId: nowRow.id, backendSessionId: cid }, by);
      if (r && r.ok === false) { out.changed.push({ ...d, failed: r.code || 'failed' }); still.push({ ...EP.drawnRow(nowRow), failed: r.code || 'failed' }); continue; }
      out.terminated.push(d);
    }
    if (still.length) { try { userTodos.setCard(id, { ...card, rows: still }); } catch { } }
    else { try { answering.add(id); userTodos.setStatus(id, 'done', 'user', { pressed }); } catch { } finally { answering.delete(id); } }   // the person's own decision (the press)
    tell(it, out);
    return { ok: true, ...out, open: still.length > 0 };
  }

  /** THE SECOND KIND — the door piece 7 binds (jobsWiring.setProposalDoor; `vibespace-job propose-wake` / `--propose-wake` reach it
   *  through the agent route, which judged the job, the why and the owner conversation first): an agent proposes the wake grant
   *  («this job or schedule may wake its conversation after that conversation was ended on purpose») WITHOUT proposing any end.
   *  `rows` = piece 7's own wakeChoiceRows [{id, name, kind, nextAt, grant, by}]. ONE card per proposer: a job already on it is
   *  REFRESHED in place (its row redrawn, the why replaced), a new job joins it — never a second card, never a second row per job
   *  (主开发 12:49Z: one card per proposer and job, refreshed not multiplied). → { ok, id, rows, refreshed } */
  function proposeWakeGrant(caller, { rows, why } = {}) {
    const fresh = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r.id === 'string' && r.id).slice(0, EP.MAX_TARGETS)
      .map((r) => ({ id: r.id.slice(0, 120), name: typeof r.name === 'string' && r.name ? r.name.slice(0, 120) : r.id.slice(0, 120), kind: r.kind === 'schedule' ? 'schedule' : 'job',
        nextAt: Number.isFinite(r.nextAt) ? r.nextAt : null, grant: r.grant === true, by: r.grant === true && r.by && typeof r.by === 'object' ? { kind: r.by.kind === 'key' ? 'key' : 'person', name: typeof r.by.name === 'string' ? r.by.name.slice(0, 80) : null, at: Number(r.by.at) || null } : null }));
    if (!fresh.length) return { ok: false, code: 'bad_args', why: 'name at least one job or schedule' };
    const text = typeof why === 'string' ? why.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, EP.WHY_MAX) : '';
    if (!text) return { ok: false, code: 'bad_args', why: 'why: one sentence of why these may wake their conversation' };
    const proposerKey = (caller && (caller.sessionKey || (caller.conversationId && `claude:${caller.conversationId}`))) || null;
    if (!proposerKey) return { ok: false, code: 'bad_args', why: 'no proposing conversation' };
    const name = (caller && caller.name) || proposerKey;
    const open = openOf(proposerKey, WAKE);
    const had = open && open.card && Array.isArray(open.card.rows) ? open.card.rows : [];
    const ids = new Set(fresh.map((r) => r.id));
    const list = [...had.filter((r) => r && !ids.has(r.id)), ...fresh].slice(-EP.MAX_TARGETS);   // a job already on the card is redrawn, never doubled
    const itemKey = open ? open.itemKey : `wake-proposal:${pastCount(proposerKey, WAKE) + 1}`;
    const w = { key: list.length === 1 ? '«{name}» asks that 1 job may wake it after it is ended' : '«{name}» asks that {n} jobs may wake it after it is ended', params: { name, n: list.length } };
    const it = userTodos.add(proposerKey, {
      origin: 'agent', by: 'agent', sessionName: name, urgency: 'normal', itemKey,
      text: w.key.replace('{name}', name).replace('{n}', String(list.length)), detail: text, i18n: { text: w },
      action: { type: TYPE, kind: WAKE, proposer: proposerKey, rows: list.length },
      card: { why: text, rows: list, proposer: { key: proposerKey, name } },
    });
    return { ok: true, id: it && it.id, rows: list.length, refreshed: !!(it && it.existing) };
  }

  /** The wake card's press: `grant` = the ids the person left ticked (the card draws each proposed job ticked — the press IS the
   *  approval); a row whose tick differs from the grant it was drawn with is written through piece 7's in-process person door
   *  (setWakeGrant(jobId, yes, {kind:'person'})); «Keep all as they are» (NO grant sent) writes nothing. A refused write is said
   *  and the card stays open. */
  async function answerWake(it, { grant = null } = {}, by, { pressed = null } = {}) {
    const rows = it.card && Array.isArray(it.card.rows) ? it.card.rows : [];
    const yes = new Set((Array.isArray(grant) ? grant : []).map(String));
    const changes = Array.isArray(grant) ? rows.filter((r) => (r.grant === true) !== yes.has(r.id)) : [];   // no grant sent = «Keep all as they are»
    if (changes.length && typeof setWakeGrant !== 'function') return { ok: false, code: 'not_ready', why: 'the jobs engine is not wired — nothing was written' };
    const out = { granted: [], withdrawn: [], unchanged: rows.filter((r) => !changes.includes(r)) };
    for (const r of changes) {
      const w = await setWakeGrant(r.id, yes.has(r.id), personBy(by));
      if (w && w.error) return { ok: false, code: w.code || 'failed', why: w.error, ...out };
      (yes.has(r.id) ? out.granted : out.withdrawn).push(r);
    }
    try { answering.add(it.id); userTodos.setStatus(it.id, 'done', 'user', { pressed }); } catch { } finally { answering.delete(it.id); }
    tellText(it, EP.wakeAnswerText(out));
    return { ok: true, ...out };
  }

  /** The proposer hears it at its NEXT turn — the stash, free (never a wake). */
  function tellText(it, text) {
    const proposer = (it.action && it.action.proposer) || it.sessionKey;
    const cid = String(proposer || '').slice(String(proposer || '').indexOf(':') + 1);
    if (!cid || !deliver || typeof deliver.stashFor !== 'function') return;
    try { deliver.stashFor(cid, { source: 'agent', kind: 'notification', fromName: FROM_NAME, ref: `${it.id}:${Date.now().toString(36)}`, text }); }
    catch (e) { log(`answer not stashed for ${proposer}: ${e && e.message || e}`); }
  }
  function tell(it, out) {
    tellText(it, EP.answerText(out));
  }

  /** The card resolves when NO row on it is live any more (ended, archived, gone) — run at the live list's one notify point. */
  async function sweep() {
    let ids = [];
    try { ids = userTodos.idsWhere((i) => i && i.status === 'open' && EP.isProposal(i.action) && kindOf(i) === 'end'); } catch { ids = []; }
    if (!ids.length) return 0;
    let live;
    if (typeof liveKeys === 'function') live = new Set(liveKeys());   // the live list's own keys — cheap, at its one notify point
    else { const snap = listFacts ? await listFacts.list() : null; live = new Set((snap && snap.conversations || []).filter((r) => r && r.state !== 'ended').map((r) => r.key)); }
    let n = 0;
    for (const id of ids) {
      const it = userTodos.get(id);
      const rows = it && it.card && Array.isArray(it.card.rows) ? it.card.rows : [];
      if (rows.some((d) => live.has(d.key))) continue;
      try { userTodos.resolveAnswered([id], 'server', { allEnded: true }); n++; } catch { }
      tell(it, { ended: rows });
    }
    return n;
  }

  // the card's own ✕ (For-you's dismiss) keeps every conversation on it — the proposer hears that too (once; the press's own close is not this)
  const answering = new Set();
  try { userTodos.onStatus((it, { status }) => { if (!it || !EP.isProposal(it.action) || status !== 'dismissed' || answering.has(it.id)) return; if (kindOf(it) === WAKE) tellText(it, EP.wakeAnswerText({ unchanged: (it.card && it.card.rows) || [] })); else tell(it, { kept: (it.card && it.card.rows) || [] }); }); } catch { }

  return { propose, proposeWakeGrant, answer, sweep, TYPE, FROM_NAME };
}

module.exports = { create, TYPE, FROM_NAME };
