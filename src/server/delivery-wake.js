'use strict';
/**
 * DELIVERIES RESUME THEIR ADDRESSEE — ORCH (the manager design's piece 7, lane paced-wake-retry; 主开发 2026-11-17). The PURE
 * arithmetic is src/delivery-wake.js; the owed wake itself is a rung of the ladder's retry park (src/server/conversation-deliver.js
 * `parkEndedWake` / `registerEndedWake`). This module is the one thing the park's rung hands an owed wake to:
 *
 *   onEndedWake(cid, entry) → Promise<{outcome: 'delivered' | 'refused' | 'failed', why?, code?, until?, sessionId?}>
 *
 * It puts the conversation on piece 4's ONE LINE (src/server/resume-line.js — at most two starts at a time, one entry per
 * conversation), and THE START it runs there is, in order, before anything spawns:
 *   0. can a delivery resume it (piece 4's verdict UNCHANGED: an active goal, a timer mark, an unknown goal, archived, a
 *      terminal-only harness ⇒ it waits — PURE deliveryResumeVerdict);
 *   0b. HOW IT ENDED allows it (the owner's narrowed rule, 主开发 2026-11-17 04:56Z — PURE endedRule over the kept record): a
 *      restart ended it, or a person ended it and KEPT one of the waiting jobs to wake it; else it waits — nothing starts,
 *      nothing is billed, and the answer (with who ended it) goes to the journal;
 *   1. who pays: the kept record's account, resolved by the SPEND GUARD's own identity road (a session-shaped facts object
 *      carrying `_accountId`, exactly what a restored session carries) — never guessed; none ⇒ refused, said;
 *   2. the account's limit: the pool engine's ONE usability answer (`quotaVerdictFor` — what auto-resume's pre-fire gate spends
 *      on): not usable ⇒ it waits, and the row says until when;
 *   3. the spend guard as a PROBE (`authorize({hold: false})`) under the delivery's OWN reason — a refusal's journal, telemetry
 *      and For-you notice happen inside the guard, once;
 * then the stash hand-over's CLAIM (before the resume: its start injection leaves the claimed entries; a PEER's wake may claim
 * nothing — its words are in the group log and ride the report of the turn the hand-over starts), the RESUME (inbox-reopen:
 * the page's own resume road, headless, nothing sent), the wait for THAT session's inbox (it answers once its CLI started — a miss
 * gives the claim back, said by name), and ONE hand-over under the delivery's reason ending with the design's
 * sentence (the ladder authorizes and charges it as the turn it is — ONE ledger row). A refused gate or a failed resume gives the
 * claim back: the words keep waiting. The answer goes back to the park, which says it to the producers (`wake`).
 */
const D = require('../delivery-wake.js');
const { agentSpendWords } = require('../spend-words.js');   // B-ef83 unit 2 (r4696): THE ONE DOOR for a verdict's words to a caller that is not a person
const BY = 'system:deliveries';   // the resume's actor in the activity log: «VibeSpace, by itself» (device-acts-dialog whoText) — never a person

function create({ resumeLine, seams, getStashHandover, spendGuard = null, identityOf = null, quotaVerdictFor = null, usageCacheKeyFor = null, isPoolScope = () => false, jobGrantOf = () => false, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => { } } = {}) {
  /** The facts object the guard and the pool engine read for an ENDED conversation: the fields a RESTORED session carries
   *  (boot-restore: `_accountId: meta.accountId`, `host`, `backend`) — read off the KEPT RECORD's meta, nothing invented. */
  function payerOf(meta, backend, stated = null) {
    // WHICH ACCOUNT BILLS (主开发 12:46Z, the read — src/server/inbox-reopen.js + src/ws-create.js): the reopen spawns on the
    // conversation's STATED account (its saved settings, `sessionConfigs[key].account`), else on the account it is HELD on (the
    // kept record's — ws-create's «a resume that states no account goes to the account its conversation is held on»). The gate
    // judges exactly that one and HANDS it to the reopen, so the turn never lands on another account by this road (a pooled
    // account still places a member of THAT pool). A conversation on the CLI's own login keeps NO account id — the identity road
    // names that one too (the pool engine's wallSlotFor), so the facts go through whole and the GUARD's road decides who pays
    const accountId = stated ? String(stated) : meta && meta.accountId ? String(meta.accountId) : null;
    return { _accountId: accountId, accountId, host: (meta && meta.host) || null, backend: backend || 'claude', webuiId: null, ended: true };
  }
  /** the names of what this wake delivers (rule 3: the window says WHICH job or schedule) */
  function namesOf(entry) {
    const metas = Array.isArray(entry.metas) ? entry.metas : entry.meta ? [entry.meta] : [];
    const out = metas.map((m) => (m && m.jobName) || null).filter(Boolean);
    if ((Array.isArray(entry.producers) ? entry.producers : [entry.producer]).includes('groups') && entry.fromName) out.push(String(entry.fromName));
    return out;
  }

  // the owed wakes whose start passed the line's bound (resume-line's code start_bound): their late rest records its own end
  const late = new WeakSet();
  /** THE RESUMED SESSION'S INBOX, waited for before the hand-over (place-8, 主开发 2026-11-20 03:35Z): the reopen answers at
   *  «created» — only the wrapper is spawned then — and a CLI answers to its inbox once it has STARTED (claude: its registry record
   *  and socket). Asked through `seams.inboxOf` (inboxOfOver: the ladder's own reachability) at a doubling step up to 1 s, bounded
   *  by INBOX_WAIT_MS of steps waited. → {ok:true} | {ok:false, code, why}: `inbox_gone` (that session ended first), `no_mid_session`
   *  (it runs, but its agent takes no message mid-session — the ladder's own words), `inbox_not_open` (the bound passed) */
  async function inboxOpened(cid, sessionId) {
    let waited = 0, step = 100, unread = null;
    for (;;) {
      let v = null;
      try { v = seams.inboxOf(cid, sessionId); } catch (e) { v = null; if (!unread) { unread = String((e && e.message) || e).slice(0, 120); log(`[delivery-wake] ${cid}: its inbox could not be looked up (${unread}) — asked again until the bound`); } }
      if (v && v.open) return { ok: true, waited, remote: v.remote === true };
      if (v && v.gone) return { ok: false, code: 'inbox_gone', why: 'it ended before its agent opened its inbox' };
      if (v && v.never) return { ok: false, code: 'no_mid_session', why: String(v.why || 'its agent takes no message mid-session') };
      if (waited >= INBOX_WAIT_MS) return { ok: false, code: 'inbox_not_open', why: `its agent did not open its inbox within ${INBOX_WAIT_MS / 1000} s${unread ? ` (its inbox could not be looked up: ${unread})` : ''}` };
      await sleep(step); waited += step; step = Math.min(step * 2, 1000);
    }
  }

  /** the line's START for one owed wake (runs at its turn: at most two at a time hub-wide) */
  async function startOne(cid, entry, key, backend) {
    let facts = null;
    try { facts = await seams.factsOf(key); } catch (e) { facts = null; log(`[delivery-wake] ${cid}: its kept record could not be read — ${(e && e.message) || e}`); }
    // B-f276 1a: the park's door is asked AGAIN here — after the start's only await, before every refusal, with nothing async left before
    // the claim: a producer whose file became held while this wake waited in the line answers «held» — nothing is claimed, nothing
    // resumes, the park sets the wake aside until the lift. (A start that answers after the line's bound is the bound's own: ended «failed».)
    let heldNow = null;
    try { const sh0 = getStashHandover(); heldNow = sh0 && typeof sh0.heldWhyOfWake === 'function' ? sh0.heldWhyOfWake(entry) : null; } catch (e) { heldNow = `whether its producer can judge it could not be asked (${(e && e.message) || e}) — unknown is held`; }
    if (heldNow) return { ok: false, outcome: 'held', code: 'held', why: String(heldNow).slice(0, 200) };
    // the kept record read ONCE, through piece 4's reader (src/server/resume-line.js keptFacts): how it ended, who ended it, the account
    const meta = facts && facts.kept ? { stopReason: facts.stopReason || null, stoppedAt: facts.stoppedAt || null, endedBy: facts.endedBy || null, accountId: facts.accountId || null, host: facts.hostId || null } : null;
    const verdict0 = D.deliveryResumeVerdict({ ...(facts || {}), archived: seams.isArchived(key) }, seams.rowOf(backend));
    const verdict = verdict0 && verdict0.code === 'archived' ? { ...verdict0, why: archivedWhy(key, verdict0.why) } : verdict0;
    const how = D.endedHow(meta);
    // the person's GRANT is read off each delivering job's row NOW (at the line), never remembered from the park
    const grantOf = (id) => { try { const g = jobGrantOf(id); return g && g.granted === true ? g : { granted: false, by: null }; } catch { return { granted: false, by: null }; } };
    const deliveries = (Array.isArray(entry.metas) ? entry.metas : entry.meta ? [entry.meta] : []).map((m) => { if (!m || !m.jobId) return m; const g = grantOf(m.jobId); return { ...m, granted: g.granted, grantBy: g.by }; });
    const ended = D.endedRule(how, deliveries);
    let stated = null;
    try { stated = typeof seams.configAccountOf === 'function' ? seams.configAccountOf(key) : null; } catch { stated = null; }
    // NO account stated and NONE kept (主开发 14:26Z): the create would pick the account whose index lists the conversation
    // (ws-create's held-account rule — routes/sessions heldAccountOf, the SAME lookup) — resolved HERE and judged, so the limit
    // judged and the account the turn runs on are one; a harness that keeps its conversations per account and names none refuses
    let held = null;
    if (!stated && !(meta && meta.accountId)) { try { held = typeof seams.heldAccountOf === 'function' ? seams.heldAccountOf(key) : null; } catch { held = null; } }
    if (held && held.refuse) return { ok: false, outcome: 'refused', code: 'account_unknown', why: String(held.refuse).slice(0, 300) };
    const payer = payerOf(meta, backend, stated || (held && held.accountId) || null);
    let identity = null;
    try { identity = typeof identityOf === 'function' ? identityOf(payer) : null; } catch { identity = null; }   // the guard's OWN identity road (the pool engine's fireIdentityFor)
    let limit = null;
    try {
      const scope = payer._accountId && isPoolScope(payer._accountId) ? payer._accountId : (usageCacheKeyFor ? usageCacheKeyFor(payer) : null);
      const q = scope && quotaVerdictFor ? quotaVerdictFor(scope, { session: payer }) : null;
      limit = q ? (q.readingUnread ? { unread: true, why: `its account's usage reading cannot be told (${q.reason})` } : { usable: q.usable !== false, blockedUntil: Number(q.blockedUntil) || null }) : null;   // r3136: the reading's hold waits by name   // no reading at all: the guard's
    } catch (e) { limit = { unread: true, why: `its account's limit could not be read (${String((e && e.message) || e).slice(0, 120)})` }; log(`[delivery-wake] ${cid}: ${limit.why} — it waits`); }
    let probe = null;
    if (verdict.ok && ended.ok && identity && !(limit && (limit.usable === false || limit.unread))) {
      try { const v = spendGuard.authorize({ reason: entry.spendReason, session: payer, cid, identity, hold: false }); probe = v && v.ok === true ? { ok: true } : { ok: false, reason: agentSpendWords(v), spendWhy: (v && v.why) || null }; }   // B-ef83 unit 1: the why rides (a held gate keeps the owed wake)
      catch (e) { probe = { ok: false, reason: (e && e.message) || String(e) }; }
    }
    const g = D.gate({ verdict, ended, identity, limit, probe });
    // every answer carries `ok` / `why` too: a key's conversations.resume that JOINS this entry reads the wake's answer in its own shape
    if (!g.go) return { ok: false, outcome: 'refused', code: g.code, why: g.why, until: g.until || null, ended: how.kind, by: how.by || null, ...(g.code === 'spend' && probe && probe.spendWhy ? { spendWhy: probe.spendWhy } : {}) };
    const sh = getStashHandover();
    if (!sh) return { ok: false, outcome: 'failed', why: 'the hand-over is not ready on this server' };
    // a PEER's wake keeps its words in the group log (the report rides the prompt hook of the turn this hand-over starts):
    // its claim may be empty — the frame then starts that turn and says who woke it
    const peer = (Array.isArray(entry.producers) ? entry.producers : [entry.producer]).includes('groups');
    const claim = sh.claimForWake(cid, { bare: peer });
    // B-f276 1a: nothing but KEPT entries (their reach cannot be judged now) — the wake stays owed and goes at the lift; never «nothing is waiting»
    if (!claim.ok && claim.code === 'nothing_waiting' && Number(claim.kept) > 0) return { ok: false, outcome: 'held', code: 'kept', why: `${Number(claim.kept)} entr${Number(claim.kept) === 1 ? 'y waits' : 'ies wait'} for it whose reach cannot be judged now — it is resumed once they can be` };
    // round wozyl97qk MUST 1 (the belt): the stash HELD (its file could not be read) — the wake stays owed and goes at the lift, never «failed»
    if (!claim.ok && claim.code === 'msg_stash_unread') return { ok: false, outcome: 'held', code: 'held', why: String(claim.error || 'the messages waiting for conversations could not be read now').slice(0, 200) };
    if (!claim.ok) return claim.code === 'nothing_waiting' ? { ok: false, outcome: 'refused', code: 'nothing_waiting', why: 'nothing is waiting for it any more' } : { ok: false, outcome: 'failed', code: claim.code, why: claim.error };
    let r = null;
    try { r = await seams.reopen({ sessionKey: key, cwd: (facts && facts.cwd) || '', hostId: (facts && facts.hostId) || undefined }, { by: BY, accountId: payer._accountId || null }); }   // VibeSpace by itself — never a person's press; on the judged account
    catch (e) { r = { ok: false, why: (e && e.message) || String(e) }; }
    // the stores chain's two roads (主开发 02:59Z): a wake refused ONLY because the re-adoption of the machines' left-running conversations
    // has not settled STAYS OWED (outcome 'waits'): the park keeps it and runs it once the re-adoption settles — never ended, never on a timer
    if (r && r.ok === false && r.code === 'readopt-pending') { sh.releaseWake(cid, claim); return { ok: false, outcome: 'waits', code: 'readopt-pending', why: 'it runs on a paired machine and waits for VibeSpace to re-adopt the conversations left running there (its record of the paired machines could not be read until now) — it goes by itself then' }; }
    if (!r || !r.ok) { sh.releaseWake(cid, claim); return { ok: false, outcome: 'failed', why: (r && r.why) || 'the conversation did not start' }; }
    // MUST 3 (主开发 12:46Z): it was ALREADY running (a page resumed it under another id) — no hand-over, no «had been ended»
    // sentence into a live agent, no resumed mark: the claim goes back and the words ride the live roads
    if (r.already === true) { sh.releaseWake(cid, claim); return { ok: true, outcome: 'running', sessionId: r.sessionId, already: true, why: 'it was already running — the words ride its next turn' }; }
    // THE LINE'S PLACE ENDS AT THE REOPEN (place-8, 主开发 2026-11-20 03:44Z, condition 1): the wait for THAT session's inbox and the
    // hand-over run OFF the line (handOverResumed) — a slow CLI on one machine never holds another conversation's resume by the bound.
    // A CLAIM TAKEN IS ALWAYS ENDED (主开发 04:07Z, the must): the rest STARTS HERE, whoever hears this answer — a start that answers after
    // the line's own bound (its answer dropped there) still hands over or gives the claim back by name; a throw gives it back
    const rest = handOverResumed(cid, entry, { sh, claim, peer, r, g, deliveries, ended }).catch((e) => {
      const why = `it was resumed as ${r.sessionId}, but its hand-over failed (${String((e && e.message) || e).slice(0, 160)}) — the message waits for its next turn`;
      try { sh.releaseWake(cid, claim); log(`[delivery-wake] ${cid}: ${why}`); } catch { }   // the handler throws nothing: nobody may await a late rest
      return { ok: false, outcome: 'failed', code: 'handover_failed', why, sessionId: r.sessionId };
    }).then((x) => {
      // THE RECORD SAYS WHAT HAPPENED (主开发 2026-11-20 04:50Z): the line gave up on this start (its bound) and the park ended the wake
      // «failed» — the late rest writes its OWN end to the same record (delivered, or the miss by name): the last line a person reads is true
      if (late.has(entry)) { late.delete(entry); try { if (typeof seams.noteLateWake === 'function') seams.noteLateWake(cid, entry, x); } catch (e) { log(`[delivery-wake] ${cid}: the late start's end could not be recorded — ${(e && e.message) || e}`); } }
      return x;
    });
    return { ok: true, outcome: 'resumed', sessionId: r.sessionId, rest };
  }
  /** AFTER THE REOPEN, off the line (place-8): the wait for the resumed session's inbox, then ONE hand-over — or the claim back, said */
  async function handOverResumed(cid, entry, { sh, claim, peer, r, g, deliveries, ended }) {
    // the kept record is NOT dropped here (主开发 2026-11-19 03:25Z, replacing MUST 2's drop): a reopen that answered is registration —
    // the copy goes at the hand-over turn's end (boot-restore consumeKeptOf) or by the stopped list's live check; a failed turn keeps it
    // THE HAND-OVER GOES TO THAT SESSION (place-8 — the law: a reopen that succeeded is never followed by «no live inbox» as an end):
    // it waits for the resumed session's inbox; a miss gives the claim back (the words keep waiting, owed to its next turn), said by name
    const inbox = await inboxOpened(cid, r.sessionId);
    if (!inbox.ok) {
      sh.releaseWake(cid, claim);
      const why = `it was resumed as ${r.sessionId}, but ${inbox.why} — the message waits for its next turn${inbox.code === 'inbox_not_open' ? ' (sending anything starts it, or end and resume it)' : inbox.code === 'no_mid_session' ? ' (sending anything starts it)' : ''}`;
      const line = D.resumedRefusedLine(namesOf(entry), now(), { code: inbox.code, why });
      line.params.seconds = INBOX_WAIT_MS / 1000;   // the window's words name the bound (主开发 03:44Z condition 2)
      try { if (typeof seams.noteResumed === 'function') seams.noteResumed(r.sessionId, line); } catch { }
      return { ok: false, outcome: 'failed', code: inbox.code, why, sessionId: r.sessionId };
    }
    // the POSTING mark goes on the entry, durably, before the frame can land (a hard kill now ⇒ «maybe delivered» at the boot)
    try { if (typeof seams.markPosting === 'function') seams.markPosting(cid); } catch (e) { log(`[delivery-wake] ${cid}: the posting mark could not be written — ${(e && e.message) || e}`); }
    const ho = await sh.handOverWake(cid, claim, { reason: entry.spendReason, tail: D.FRAME_TAIL, lead: peer ? D.peerLead(entry.fromName) : '', from: entry.fromName || null, card: entry.cardText || null, ...(inbox.remote ? { inboxWaitMs: INBOX_WAIT_MS } : {}) });
    if (ho && ho.ok) {
      // RULE 3: the wake is SEEN — the window's line and the System panel's row read this fact (no For-you item per wake)
      const grantBy = g.rule === 'granted' ? ((deliveries.find((d) => d && d.granted && ended.jobs.includes(String(d.jobId))) || {}).grantBy || null) : null;
      const line = D.resumedLine(namesOf(entry), now(), { by: grantBy });
      try { if (line && typeof seams.noteResumed === 'function') seams.noteResumed(r.sessionId, { ...line, rule: g.rule, jobs: ended.jobs || [] }); } catch (e) { log(`[delivery-wake] ${cid}: the resumed line could not be set — ${(e && e.message) || e}`); }
      return { ok: true, outcome: 'delivered', sessionId: r.sessionId, delivered: ho.delivered || 0, rule: g.rule || null };
    }
    // the hand-over refused or failed AFTER the resume: the now-live conversation says why (the words wait for its next turn)
    // B-95fc follow-up (主开发 r491): the paired machine could not READ its conversations' registry — said by name, not as a closed inbox
    if (ho && ho.code === 'registry_unread') {
      const why = `it was resumed as ${r.sessionId}, but its machine could not read its conversations' registry — the message waits for its next turn`;
      try { if (typeof seams.noteResumed === 'function') seams.noteResumed(r.sessionId, D.resumedRefusedLine(namesOf(entry), now(), { code: 'registry_unread', why })); } catch { }
      return { ok: false, outcome: 'failed', code: 'registry_unread', why, sessionId: r.sessionId };
    }
    // B-95fc U2: the paired machine waited for the resumed CLI's inbox and it did not open — the same words as this machine's own wait
    if (ho && ho.code === 'inbox_not_open') {
      const why = `it was resumed as ${r.sessionId}, but its agent did not open its inbox within ${INBOX_WAIT_MS / 1000} s on its machine — the message waits for its next turn (sending anything starts it, or end and resume it)`;
      const line = D.resumedRefusedLine(namesOf(entry), now(), { code: 'inbox_not_open', why });
      line.params.seconds = INBOX_WAIT_MS / 1000;
      try { if (typeof seams.noteResumed === 'function') seams.noteResumed(r.sessionId, line); } catch { }
      return { ok: false, outcome: 'failed', code: 'inbox_not_open', why, sessionId: r.sessionId };
    }
    const code = ho && ho.code === 'spend_refused' ? 'spend' : 'handover_failed';
    const why = (ho && ho.error) || 'the hand-over did not land';
    try { if (typeof seams.noteResumed === 'function') seams.noteResumed(r.sessionId, D.resumedRefusedLine(namesOf(entry), now(), { code, why })); } catch { }
    return { ok: false, outcome: code === 'spend' ? 'refused' : 'failed', code, why, sessionId: r.sessionId };
  }

  /** the park's rung hands an owed wake here (src/server/conversation-deliver.js registerEndedWake) */
  /** B-0248 (c) r1092: the archived refusal's words — when the person's UN-ARCHIVE is owed and not on disk yet, said so (a person whose
   *  page shows it un-archived learns why a result waits) */
  const archivedWhy = (key, why) => { try { return typeof seams.unarchiveOwed === 'function' && seams.unarchiveOwed(key) ? 'archived; its un-archive is not saved yet' : why; } catch { return why; } };
  async function onEndedWake(cid, entry) {
    const k = seams.keyOf(cid);
    if (!k || !k.sessionKey) return { outcome: 'failed', why: 'no conversation key for it' };
    const key = k.sessionKey, backend = key.slice(0, key.indexOf(':')) || 'claude';
    const archived = seams.isArchived(key);
    if (archived === null) return { outcome: 'refused', code: 'store_unread', why: 'the conversation list could not be read — whether it is archived is not known' };   // B-225b R3: UNKNOWN refuses by name (the words keep waiting)
    if (archived) return { outcome: 'refused', code: 'archived', why: archivedWhy(key, 'it is archived') };
    const q = resumeLine.submit({ target: key, by: null, payload: { run: () => startOne(cid, entry, key, backend) } });
    if (!q.ok) return { outcome: 'refused', code: q.code, why: `the resume line refused it (${q.code}${q.count ? ', ' + q.count : ''})` };
    // JOINED a resume already in the line (a key's conversations.resume of the same conversation): its answer is the reopen's,
    // not a delivery's — wait for it, then the park LOOKS AGAIN (running ⇒ the words ride its next turn; else the line anew)
    if (q.joined) { try { await q.result; } catch { } return { outcome: 'again', why: 'a resume of this conversation was already in the line — looked again after it' }; }
    const r = await q.result;
    if (r && r.rest && typeof r.rest.then === 'function') return r.rest;   // place-8: the reopen freed its place in line; its wait and hand-over run on
    // the line's own bound answered first: a start that still answers runs its rest by itself (the claim is never dropped with the answer)
    if (r && r.ok === false && r.code === 'start_bound') late.add(entry);   // the line's own code (never its words): a start that still answers records its end
    if (r && r.ok === false && r.code === 'start_bound') log(`[delivery-wake] ${cid}: its start passed the line's bound — if it still answers, its hand-over runs then, or its claim is given back`);
    return r;
  }

  return { onEndedWake, payerOf };
}

/** How long a resumed session's inbox is waited for (place-8): a CLI that has not started in a minute is not starting. */
const INBOX_WAIT_MS = 60_000;
/** seams.inboxOf over the ladder (place-8): (cid, sessionId) → {open} once the ladder can reach the conversation (peerReachable: a
 *  CLI's registry record, a wrapper's lane, an owning machine) · {gone, why} when THAT session ended first · {never, why} when it
 *  runs but its agent takes no message mid-session (the ladder's own words, wakeBlock) · {} not yet. GONE is the session no longer
 *  listed, or its attach pty exited AND its socket is gone: a pty that exited while the socket still answers is the re-attach
 *  window of a CLI still starting — not yet (主开发 2026-11-20 04:07Z). */
const socketAlive = (p) => { try { return !!p && require('fs').statSync(p).isSocket(); } catch { return false; } };
/** ONE REGISTRY READ A TICK, SHARED BY EVERY WAITING CONVERSATION (place-8, the round's should): the CLI registry's conversation ids
 *  (presence only — the full identity check stays the ladder's), read at most once per `tickMs` of `clock`; a read that fails is
 *  null (the wait then asks the ladder's full lookup). `read` → Set of ids. */
function sharedRegistryIds({ read = readRegistryIds, tickMs = 500, clock = () => Date.now() } = {}) {
  let at = -Infinity, ids = null;
  return () => { const t = clock(); if (ids === null || t - at >= tickMs) { at = t; try { ids = read(); } catch { ids = null; } } return ids; };
}
/** the registry's conversation ids as the CLI wrote them (~/.claude/sessions/<pid>.json `sessionId`) — src/peer-messaging.js's folder */
function readRegistryIds() {
  const fs = require('fs'), path = require('path'), dir = require('../peer-messaging.js').REGISTRY_DIR, ids = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!/^\d+\.json$/.test(f)) continue;
    try { const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (r && r.sessionId) ids.add(String(r.sessionId)); } catch { }
  }
  return ids;
}
function inboxOfOver({ deliver = () => null, activeSessions = null, isSocket = socketAlive, registryIds = sharedRegistryIds() } = {}) {
  return (cid, sessionId) => {
    const d = deliver();
    if (!d || typeof d.peerReachable !== 'function') return { never: true, why: 'the delivery ladder is not ready on this server' };
    const s = activeSessions && activeSessions.get(sessionId);
    const gone = !s || (s.pty === null && !isSocket(s.socketPath));
    // a LOCAL session of a kind whose inbox is the CLI's registry: not listed in this tick's shared read ⇒ not yet (no full lookup)
    let listed = true;
    try { if (s && !s.host && require('../backend-caps.js').capsOf(s.backend).peerDelivery === 'cli-inbox') { const ids = registryIds(); listed = !ids || ids.has(String(cid)); } } catch { listed = true; }
    // B-95fc U2: a session on a PAIRED machine — the hub never polls that machine's registry over the link: its machine waits for
    // its own inbox inside the hand-over's post (peer-post waitMs), so the inbox is «open» here and the wait is the machine's
    if (s && s.host && d.peerReachable(cid)) return { open: true, remote: true };
    if (listed && d.peerReachable(cid)) return { open: true };
    if (gone) return { gone: true, why: 'its agent ended before it opened its inbox' };
    const b = typeof d.wakeBlock === 'function' ? d.wakeBlock(cid) : null;
    if (b && b.cause && b.cause !== 'not-running') return { never: true, why: String(b.why || b.cause) };
    return {};
  };
}

/**
 * THE MANAGER KEY'S VERB (主开发 2026-11-17 05:13Z — the owner: «the manager agent can do it for the person»): `jobs.wakeGrant
 * {job, grant}` sets or clears a job's or schedule's grant to resume its conversation after that conversation was ended on purpose.
 * The person gave the verb to the key — that IS the delegation; no second fence. The job's OWNER conversation must be one the key
 * reaches (the engine's ONE reach rule: opener / grant / instance — an ended owner is judged by its id). The row records the
 * key as who set it. `jobs` = () => the jobs engine; `keyNameOf(keyId)` = the key's name for the record (the window line says it). `lineageOf(cid)` = the owner's Task Group ancestors (lane lg-group-parents); `ownerFactsOf(cid)` → {groups, inherited} = both in ONE read (restack 416: the wiring's; a door with groups and no lineage reader wired reads them UNKNOWN).
 */
function automationVerbs({ jobs = () => null, keyNameOf = () => null, groupsOf = () => [], lineageOf = null, ownerFactsOf = null } = {}) {
  return {
    'jobs.wakeGrant': async (args, { caller, keyId, identity, reach }) => {   // (async: THE ONE DOOR lands the change off the loop — src/jobs.js changeWakeGrants)
      const jm = jobs();
      if (!jm || !jm.ready) return { ok: false, code: 'not_ready', why: (jm && typeof jm.lockHeldWords === 'function' && jm.lockHeldWords()) || 'the jobs engine is starting — try again in a moment' };   // B-f276 (s1126, r5017): the lock's hold by name
      const job = jm.jobs.get(args.job);
      if (!job) return { ok: false, code: 'not_found', why: 'no job by that id' };
      // REACH FIRST (主开发 12:46Z): the conversation that owns the job (a run's: its schedule's), judged by the engine's ONE reach
      // rule WITH that conversation's Task Groups — a job the key does not reach is told no more than that it exists
      const top = job.cronParent ? (jm.jobs.get(job.cronParent) || null) : job;
      const owner = top && top.owner && top.owner.conversation && top.owner.conversation.id;
      let groups = [], inherited = [];   // lane lg-group-parents (restack 415): the owner's ancestors — a read that throws is null (unreadable, never «no parents»)
      if (typeof ownerFactsOf === 'function') { try { const f = owner ? ownerFactsOf(owner) : null; groups = f && Array.isArray(f.groups) ? f.groups : []; inherited = !f ? [] : f.inherited === null ? null : Array.isArray(f.inherited) ? f.inherited : (groups.length ? null : []); } catch { groups = []; inherited = null; } }   // restack 416 (r311 (d)): groups and ancestors in ONE read
      else { try { groups = owner ? (groupsOf(owner) || []) : []; } catch { groups = []; } if (groups.length) { if (typeof lineageOf !== 'function') inherited = null; else { try { const l = lineageOf(owner); inherited = Array.isArray(l) ? l : null; } catch { inherited = null; } } } }   // (r311 (b)): groups with no reader wired are unknown
      const v = owner ? reach({ conversationId: owner, webuiId: null, groups, inherited: inherited || [], ...(inherited === null ? { groupsUnreadable: true } : {}), ...require('./groups-hold.js').fact() }) : null;   // the hold's fact: while held the owner's groups are UNKNOWN   // lane lg-group-parents (restack 415): + the lineage
      if (!v || !v.ok) return { ok: false, code: (v && v.code) || 'not_granted', why: (v && v.code === 'groups_unreadable' && v.why) || 'the key does not reach that job' };
      if (job.cronParent) return { ok: false, code: 'bad_args', why: `${job.id} is a run of the schedule ${job.cronParent} — set the schedule's grant` };
      let name = null; try { name = keyId ? keyNameOf(keyId) : null; } catch { name = null; }
      const a = await jm.changeWakeGrants([{ job, grant: args.grant === true }], { by: { kind: 'key', by: identity || (keyId ? `automation:${keyId}` : 'automation'), name } });
      const r = (a.rows || [])[0] || {};
      if (!a.ok || !r.ok) return { ok: false, code: r.code || a.code || 'failed', why: r.error || a.error || a.why || 'refused', job: job.id, grant: r[D.GRANT_FIELD] === true };   // not_now: nothing was changed — said by name
      return { ok: true, code: !r.changed ? 'unchanged' : r[D.GRANT_FIELD] === true ? 'granted' : 'withdrawn', job: job.id, grant: r[D.GRANT_FIELD] === true, changed: !!r.changed, by: r.wakeGrantBy || null, owner };
    },
  };
}

module.exports = { create, automationVerbs, inboxOfOver, sharedRegistryIds, INBOX_WAIT_MS };
