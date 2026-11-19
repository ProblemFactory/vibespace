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
 * the page's own resume road, headless, nothing sent), and ONE hand-over under the delivery's reason ending with the design's
 * sentence (the ladder authorizes and charges it as the turn it is — ONE ledger row). A refused gate or a failed resume gives the
 * claim back: the words keep waiting. The answer goes back to the park, which says it to the producers (`wake`).
 */
const D = require('../delivery-wake.js');
const BY = 'system:deliveries';   // the resume's actor in the activity log: «VibeSpace, by itself» (device-acts-dialog whoText) — never a person

function create({ resumeLine, seams, getStashHandover, spendGuard = null, identityOf = null, quotaVerdictFor = null, usageCacheKeyFor = null, isPoolScope = () => false, jobGrantOf = () => false, now = () => Date.now(), log = () => { } } = {}) {
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

  /** the line's START for one owed wake (runs at its turn: at most two at a time hub-wide) */
  async function startOne(cid, entry, key, backend) {
    let facts = null;
    try { facts = await seams.factsOf(key); } catch (e) { facts = null; log(`[delivery-wake] ${cid}: its kept record could not be read — ${(e && e.message) || e}`); }
    // the kept record read ONCE, through piece 4's reader (src/server/resume-line.js keptFacts): how it ended, who ended it, the account
    const meta = facts && facts.kept ? { stopReason: facts.stopReason || null, stoppedAt: facts.stoppedAt || null, endedBy: facts.endedBy || null, accountId: facts.accountId || null, host: facts.hostId || null } : null;
    const verdict = D.deliveryResumeVerdict({ ...(facts || {}), archived: seams.isArchived(key) }, seams.rowOf(backend));
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
      limit = q ? { usable: q.usable !== false, blockedUntil: Number(q.blockedUntil) || null } : null;   // no reading at all: the guard's
    } catch (e) { limit = { unread: true, why: `its account's limit could not be read (${String((e && e.message) || e).slice(0, 120)})` }; log(`[delivery-wake] ${cid}: ${limit.why} — it waits`); }
    let probe = null;
    if (verdict.ok && ended.ok && identity && !(limit && (limit.usable === false || limit.unread))) {
      try { const v = spendGuard.authorize({ reason: entry.spendReason, session: payer, cid, identity, hold: false }); probe = v && v.ok === true ? { ok: true } : { ok: false, reason: (v && (v.detail || v.why)) || null }; }
      catch (e) { probe = { ok: false, reason: (e && e.message) || String(e) }; }
    }
    const g = D.gate({ verdict, ended, identity, limit, probe });
    // every answer carries `ok` / `why` too: a key's conversations.resume that JOINS this entry reads the wake's answer in its own shape
    if (!g.go) return { ok: false, outcome: 'refused', code: g.code, why: g.why, until: g.until || null, ended: how.kind, by: how.by || null };
    const sh = getStashHandover();
    if (!sh) return { ok: false, outcome: 'failed', why: 'the hand-over is not ready on this server' };
    // a PEER's wake keeps its words in the group log (the report rides the prompt hook of the turn this hand-over starts):
    // its claim may be empty — the frame then starts that turn and says who woke it
    const peer = (Array.isArray(entry.producers) ? entry.producers : [entry.producer]).includes('groups');
    const claim = sh.claimForWake(cid, { bare: peer });
    if (!claim.ok) return claim.code === 'nothing_waiting' ? { ok: false, outcome: 'refused', code: 'nothing_waiting', why: 'nothing is waiting for it any more' } : { ok: false, outcome: 'failed', code: claim.code, why: claim.error };
    let r = null;
    try { r = await seams.reopen({ sessionKey: key, cwd: (facts && facts.cwd) || '', hostId: (facts && facts.hostId) || undefined }, { by: BY, accountId: payer._accountId || null }); }   // VibeSpace by itself — never a person's press; on the judged account
    catch (e) { r = { ok: false, why: (e && e.message) || String(e) }; }
    if (!r || !r.ok) { sh.releaseWake(cid, claim); return { ok: false, outcome: 'failed', why: (r && r.why) || 'the conversation did not start' }; }
    // MUST 3 (主开发 12:46Z): it was ALREADY running (a page resumed it under another id) — no hand-over, no «had been ended»
    // sentence into a live agent, no resumed mark: the claim goes back and the words ride the live roads
    if (r.already === true) { sh.releaseWake(cid, claim); return { ok: true, outcome: 'running', sessionId: r.sessionId, already: true, why: 'it was already running — the words ride its next turn' }; }
    // the kept record is NOT dropped here (主开发 2026-11-19 03:25Z, replacing MUST 2's drop): a reopen that answered is registration —
    // the copy goes at the hand-over turn's end (boot-restore consumeKeptOf) or by the stopped list's live check; a failed turn keeps it
    // the POSTING mark goes on the entry, durably, before the frame can land (a hard kill now ⇒ «maybe delivered» at the boot)
    try { if (typeof seams.markPosting === 'function') seams.markPosting(cid); } catch (e) { log(`[delivery-wake] ${cid}: the posting mark could not be written — ${(e && e.message) || e}`); }
    const ho = await sh.handOverWake(cid, claim, { reason: entry.spendReason, tail: D.FRAME_TAIL, lead: peer ? D.peerLead(entry.fromName) : '', from: entry.fromName || null, card: entry.cardText || null });
    if (ho && ho.ok) {
      // RULE 3: the wake is SEEN — the window's line and the System panel's row read this fact (no For-you item per wake)
      const grantBy = g.rule === 'granted' ? ((deliveries.find((d) => d && d.granted && ended.jobs.includes(String(d.jobId))) || {}).grantBy || null) : null;
      const line = D.resumedLine(namesOf(entry), now(), { by: grantBy });
      try { if (line && typeof seams.noteResumed === 'function') seams.noteResumed(r.sessionId, { ...line, rule: g.rule, jobs: ended.jobs || [] }); } catch (e) { log(`[delivery-wake] ${cid}: the resumed line could not be set — ${(e && e.message) || e}`); }
      return { ok: true, outcome: 'delivered', sessionId: r.sessionId, delivered: ho.delivered || 0, rule: g.rule || null };
    }
    // the hand-over refused or failed AFTER the resume: the now-live conversation says why (the words wait for its next turn)
    const code = ho && ho.code === 'spend_refused' ? 'spend' : 'handover_failed';
    const why = (ho && ho.error) || 'the hand-over did not land';
    try { if (typeof seams.noteResumed === 'function') seams.noteResumed(r.sessionId, D.resumedRefusedLine(namesOf(entry), now(), { code, why })); } catch { }
    return { ok: false, outcome: code === 'spend' ? 'refused' : 'failed', code, why, sessionId: r.sessionId };
  }

  /** the park's rung hands an owed wake here (src/server/conversation-deliver.js registerEndedWake) */
  async function onEndedWake(cid, entry) {
    const k = seams.keyOf(cid);
    if (!k || !k.sessionKey) return { outcome: 'failed', why: 'no conversation key for it' };
    const key = k.sessionKey, backend = key.slice(0, key.indexOf(':')) || 'claude';
    if (seams.isArchived(key)) return { outcome: 'refused', code: 'archived', why: 'it is archived' };
    const q = resumeLine.submit({ target: key, by: null, payload: { run: () => startOne(cid, entry, key, backend) } });
    if (!q.ok) return { outcome: 'refused', code: q.code, why: `the resume line refused it (${q.code}${q.count ? ', ' + q.count : ''})` };
    // JOINED a resume already in the line (a key's conversations.resume of the same conversation): its answer is the reopen's,
    // not a delivery's — wait for it, then the park LOOKS AGAIN (running ⇒ the words ride its next turn; else the line anew)
    if (q.joined) { try { await q.result; } catch { } return { outcome: 'again', why: 'a resume of this conversation was already in the line — looked again after it' }; }
    return q.result;
  }

  return { onEndedWake, payerOf };
}

/**
 * THE MANAGER KEY'S VERB (主开发 2026-11-17 05:13Z — the owner: «the manager agent can do it for the person»): `jobs.wakeGrant
 * {job, grant}` sets or clears a job's or schedule's grant to resume its conversation after that conversation was ended on purpose.
 * The person gave the verb to the key — that IS the delegation; no second fence. The job's OWNER conversation must be one the key
 * reaches (the engine's ONE reach rule: opener / grant / instance — an ended owner is judged by its id). The row records the
 * key as who set it. `jobs` = () => the jobs engine; `keyNameOf(keyId)` = the key's name for the record (the window line says it).
 */
function automationVerbs({ jobs = () => null, keyNameOf = () => null, groupsOf = () => [] } = {}) {
  return {
    'jobs.wakeGrant': (args, { caller, keyId, identity, reach }) => {
      const jm = jobs();
      if (!jm || !jm.ready) return { ok: false, code: 'not_ready', why: 'the jobs engine is starting — try again in a moment' };
      const job = jm.jobs.get(args.job);
      if (!job) return { ok: false, code: 'not_found', why: 'no job by that id' };
      // REACH FIRST (主开发 12:46Z): the conversation that owns the job (a run's: its schedule's), judged by the engine's ONE reach
      // rule WITH that conversation's Task Groups — a job the key does not reach is told no more than that it exists
      const top = job.cronParent ? (jm.jobs.get(job.cronParent) || null) : job;
      const owner = top && top.owner && top.owner.conversation && top.owner.conversation.id;
      let groups = []; try { groups = owner ? (groupsOf(owner) || []) : []; } catch { groups = []; }
      const v = owner ? reach({ conversationId: owner, webuiId: null, groups }) : null;
      if (!v || !v.ok) return { ok: false, code: (v && v.code) || 'not_granted', why: 'the key does not reach that job' };
      if (job.cronParent) return { ok: false, code: 'bad_args', why: `${job.id} is a run of the schedule ${job.cronParent} — set the schedule's grant` };
      let name = null; try { name = keyId ? keyNameOf(keyId) : null; } catch { name = null; }
      const r = jm.setWakeGrant(job, args.grant === true, { by: { kind: 'key', by: identity || (keyId ? `automation:${keyId}` : 'automation'), name } });
      if (r.error) return { ok: false, code: r.code || 'failed', why: r.error };
      return { ok: true, job: job.id, grant: r[D.GRANT_FIELD] === true, changed: !!r.changed, by: r.wakeGrantBy || null, owner };
    },
  };
}

module.exports = { create, automationVerbs };
