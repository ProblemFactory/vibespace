'use strict';
/**
 * DELIVERIES RESUME THEIR ADDRESSEE — PURE (the manager design's piece 7, lane paced-wake-retry; 主开发 2026-11-17).
 *
 * THE RULE (the owner NARROWED it, 主开发 2026-11-17 04:56Z, from a fleet user's worry — a FORGOTTEN background task waking a
 * conversation that person had ended, and spending without that person knowing):
 *   1. a conversation a RESTART ended (its kept record says `dead-socket-at-boot`) — a delivery resumes it (this replaces
 *      «Resume all»);
 *   2. a conversation ended ON PURPOSE (a person's Terminate, an agent's end verb — ALIKE) — resumed ONLY when the DELIVERING
 *      job or schedule carries the person's GRANT («may wake its conversation when that conversation was ended on purpose»;
 *      GRANT_FIELD on the job row, default no, written only through the person's doors — 主开发 05:02Z: the person says it ONCE
 *      per job or schedule and it holds, never a card per ending). Without it the delivery WAITS. No record, or any other end
 *      ⇒ it waits (unknown is not a restart). A peer's wake resumes only a restart-ended conversation.
 *
 * WHY: agents register jobs, schedules and reminders in the product; until this piece their result or reminder reached only a
 * conversation that was RUNNING — the ladder typed the case «not running» and stashed it (src/server/conversation-deliver.js),
 * which is the whole reason a fleet user pressed «Resume all» to stay reachable.
 *
 * THE RUNG, NOT A SECOND QUEUE: the words are stashed exactly as before (durable, both stores); the conversation is then owed ONE
 * wake — an owed entry in the ladder's own retry park (`held.why: 'ended'`, beside the pace's `'paced'`), one per conversation
 * however many deliveries wait. Its attempt, finding no live inbox, goes to piece 4's ONE LINE (src/server/resume-line.js: at
 * most two starts at a time) instead of falling «not running». At its start the GATE below runs before anything spawns.
 *
 * This module is the arithmetic only: which delivery owes a wake (`owesWake`), how the conversation ended and what that allows
 * (`endedHow`, `endedRule`), the person's grants as the Terminate confirm lists them (`wakeChoiceRows`), the gate's order
 * and answer (`gate`), the resume verb's rules as a delivery reads them (`deliveryResumeVerdict`), and the words each party is
 * told (`senderWords`, `journalWords`, `waitingRow`, `resumedLine`, FRAME_TAIL). No clock, no store, no I/O.
 */
const R = require('./resume-line.js');

/** THE REASONS A WAKE OF AN ENDED ADDRESSEE MAY PASS UNDER — the producers' OWN, never a new one (the brief: «no new spend
 *  reason»): a job's result / a schedule's reminder → 'job-notification'; an agent's message to ONE addressee with a wake →
 *  'peer-message'. A person's For-you answer resumes through its own attended road (src/server/inbox-reopen.js), not here. */
const WAKE_REASONS = Object.freeze(['job-notification', 'peer-message']);

/** The kinds of a job event that RESUME its owner (the brief's list): a result (done / failed / out of memory), a missed one-time
 *  schedule, a task a machine restart interrupted (until this piece that told nobody), and a schedule's reminder (with its one
 *  catch-up fire after a restart). */
const JOB_KINDS = Object.freeze(['result', 'missed', 'interrupted', 'reminder']);

/**
 * DOES THIS DELIVERY OWE ITS ENDED ADDRESSEE A WAKE? `d` = { producer: 'jobs' | 'groups' | 'channel' | 'outbox' | 'handback' |
 * 'retry' | …, kind (jobs: one of JOB_KINDS | 'subscriber'), wake (an agent message's own --wake), addressees (how many members the
 * wake names), archived }. Owed is not resumed: HOW the conversation ended decides at the line (`endedRule`).
 * → { owe: true, reason } | { owe: false, code } — `code` says which of the brief's «only waits» it is; the sender is told it.
 */
function owesWake(d = {}) {
  const x = d || {};
  if (x.archived === true) return { owe: false, code: 'archived' };
  if (x.producer === 'jobs') {
    if (x.kind === 'subscriber') return { owe: false, code: 'subscriber_copy' };
    return JOB_KINDS.includes(x.kind) ? { owe: true, reason: 'job-notification' } : { owe: false, code: 'not_a_result' };
  }
  if (x.producer === 'groups') {
    if (x.wake !== true) return { owe: false, code: 'no_wake' };
    return Number(x.addressees) === 1 ? { owe: true, reason: 'peer-message' } : { owe: false, code: 'fan_out' };
  }
  if (x.producer === 'channel') return { owe: false, code: 'channel' };
  return { owe: false, code: 'only_waits' };
}

/**
 * THE RESUME VERB'S RULES, AS A DELIVERY READS THEM — piece 4's own, UNCHANGED (主开发 12:46Z, MUST 1 — money: a wake authorises
 * ONE turn, a goal runs many: a codex thread with an active goal continues by itself the moment it is resumed, before the
 * hand-over takes its hold, and claude's goal continues from its Stop hook after the counted turn — none of those turns is a row
 * of the spend table). An active goal, a CLI timer mark, an unknown goal on a harness that continues by itself, archived, «needs a
 * page»: the words WAIT and the ended row says why (a person resumes it).
 * → { ok: true } | { ok: false, code, why }
 */
function deliveryResumeVerdict(facts = {}, harness = {}) {
  const v = R.resumeVerdict(facts, harness);
  // A DELIVERY RESUMES ONLY A KIND IT CAN HAND ITS WORDS TO (主开发 2026-11-20 04:07Z): a kind whose own row takes no message
  // mid-session is never reopened by a delivery — the words stay stashed for its next prompt, said as stashed
  if (v.ok && harness && harness.midSession === false) return { ok: false, code: 'no_mid_session', why: 'its agent takes no message mid-session — the words wait for its next prompt' };
  return v.ok ? { ok: true } : { ok: false, code: v.code, why: v.why };
}

/** the kept record's reason a RESTART wrote (src/server/boot-restore.js STOP_DEAD_SOCKET — a record with no reason predates the
 *  field and was written by that same road: boot-restore's stoppedSessions reads it so) */
const RESTART_REASON = 'dead-socket-at-boot';
const ENDED_REASON = 'ended';   // piece 3's reason for an end on purpose, beside `endedBy`
/** THE GRANT, on a job or schedule row (the jobs engine's record): true = it may wake its owner conversation when that conversation
 *  was ended on purpose. Absent = no. */
const GRANT_FIELD = 'wakesEndedOwner';
/** a plain agent token's write of the grant, refused BY NAME — naming the doors that exist TODAY (主开发 12:46Z: until the
 *  proposal card's tip exists beside this one, no word promises a card; that unit adds the propose sentence with its bound door) */
const GRANT_REFUSAL = 'refused: an agent cannot set wakesEndedOwner (may this job wake its conversation after that conversation was ended on purpose) — the person sets it (the Terminate confirm, the job\'s row in Background Work), or a manager key holding the verb jobs.wakeGrant; or propose it to the person: vibespace-job propose-wake <id> "one sentence why" (one card, one press approves; you read the answer at your next turn)';
// …at a REGISTRATION no job id exists yet: the recipe that works there is the registration's own flag (the cure's law 9)
const GRANT_REFUSAL_CREATE = 'refused: an agent cannot set wakesEndedOwner when it registers a job — propose it to the person instead: add --propose-wake "one sentence why" to the same command (one card, one press approves; you read the answer at your next turn)';

/**
 * HOW IT ENDED, from the kept record's meta (`m` = boot-restore keptRecordOf(key).meta, or null when nothing was kept):
 * → { kind: 'restart' | 'person' | 'agent' | 'unknown', at, by, name, why? }
 * The comparison is on the reason's VALUE (the design: never «it has a sentence»). `endedBy` is piece 3's (its lane writes it).
 */
function endedHow(m = null) {
  if (!m || typeof m !== 'object') return { kind: 'unknown', at: null, by: null, name: null, why: 'no record of how it ended was kept' };
  const reason = m.stopReason == null ? RESTART_REASON : String(m.stopReason);
  const at = Number(m.stoppedAt) || null;
  if (reason === RESTART_REASON) return { kind: 'restart', at, by: null, name: null };
  const e = m.endedBy && typeof m.endedBy === 'object' ? m.endedBy : null;
  if (reason === ENDED_REASON) return { kind: e && e.kind === 'agent' ? 'agent' : e && e.kind === 'person' ? 'person' : 'on_purpose', at, by: e && (e.actorId || e.by) ? String(e.actorId || e.by) : null, name: e && e.name ? String(e.name) : null };   // piece 3's endedBy {kind, actorId, name}
  return { kind: 'unknown', at, by: null, name: null, why: `its record says «${reason}», not a restart` };
}

/** who ended it, in the words the journal and the sender read (agent-facing English; the page renders its own) */
function whoEnded(how) {
  if (!how) return 'someone';
  if (how.kind === 'person') return 'a person (Terminate)';
  if (how.kind === 'agent') return how.name ? `the agent «${how.name}»` : 'an agent';
  if (how.kind === 'on_purpose') return 'a person or an agent (the record does not say which)';
  return 'an unknown cause';
}

/**
 * WHAT HOW-IT-ENDED ALLOWS, for the deliveries an owed wake carries (`deliveries` = the park entry's `metas`, each a job's with
 * `jobId` and — read from the job's row AT THE LINE, never at the park — `granted`; a peer's carries `gid`).
 * → { ok: true, rule: 'restart' | 'granted', jobs: [granted job ids] } | { ok: false, code, why }
 *   restart     ⇒ every owed delivery resumes it, no grant needed (rule 1);
 *   on purpose  ⇒ (a person's Terminate or an agent's end, ALIKE) only a delivering job or schedule carrying the GRANT (rule 2) —
 *                 a peer's wake never;
 *   unknown     ⇒ never: it waits (unknown is not a restart).
 */
function endedRule(how, deliveries = []) {
  const h = how || endedHow(null);
  if (h.kind === 'restart') return { ok: true, rule: 'restart', jobs: [] };
  if (h.kind === 'person' || h.kind === 'agent' || h.kind === 'on_purpose') {
    const jobs = [...new Set((deliveries || []).filter((d) => d && d.jobId && d.granted === true).map((d) => String(d.jobId)))];
    if (jobs.length) return { ok: true, rule: 'granted', jobs };
    return { ok: false, code: 'ended_on_purpose', why: `it was ended on purpose by ${whoEnded(h)}, and what is waiting does not have the person's permission to wake it` };
  }
  return { ok: false, code: 'ended_unknown', why: `${h.why || 'how it ended is not known'} — it waits until it is resumed` };
}

/**
 * THE ROWS THE PERSON'S DOORS LIST (the Terminate confirm, the proposal card — 主开发 05:02Z): `facts` = one per registered job or
 * schedule, as the jobs engine hands them ({id, label: the engine's ONE accessor's name (jm.labelOf — never a record's raw name,
 * test-architecture §93), schedule?, nextFireAt?, grant}) → [{ id, name, kind: 'schedule' | 'job', nextAt, grant }], soonest
 * next fire first, none last. `grant` = the STORED grant (default false).
 */
function wakeChoiceRows(facts = []) {
  const rows = (facts || []).filter((f) => f && f.id).map((f) => ({ id: String(f.id), label: String(f.label || f.id), kind: f.schedule ? 'schedule' : 'job', nextAt: Number(f.nextFireAt) || null, grant: f.grant === true, by: f.grant === true && f.grantBy ? { kind: f.grantBy.kind === 'key' ? 'key' : 'person', name: f.grantBy.name || null, at: Number(f.grantBy.at) || null } : null }));
  rows.sort((a, b) => (a.nextAt == null) - (b.nextAt == null) || (a.nextAt || 0) - (b.nextAt || 0) || a.label.localeCompare(b.label));
  return rows.map(({ label, ...r }) => ({ ...r, name: label }));   // the row's `name` IS the accessor's label (§93: no record name is read here)
}

/**
 * THE GATE, IN ORDER, at the wake's turn on the line — BEFORE anything spawns (the design «Deliveries to an ended conversation»):
 *   0. the conversation can be resumed by a delivery at all (`verdict` = deliveryResumeVerdict);
 *   0b. HOW IT ENDED allows it (`ended` = endedRule: a restart, or a delivering job carrying the person's grant — else it waits, said);
 *   1. WHO PAYS can be named (`identity` — the guard refuses an identity it cannot name: its own fail-closed rule);
 *   2. the account it would bill is NOT at its limit (`limit` = the pool engine's quotaVerdictFor: {usable, blockedUntil}) —
 *      otherwise it WAITS and the row says until when (a judge's break: thirty chains coming back into a limit would arm a
 *      continue each and could no longer be ended);
 *   3. the spend guard, as a PROBE that takes no hold, under the delivery's OWN reason (`probe` = authorize({hold:false})).
 * → { go: true, rule } | { go: false, code: piece 4's verdict code (goal_active · timer_marked · goal_unknown · archived ·
 *   needs_a_page) | 'ended_on_purpose' | 'ended_unknown' | 'identity' | 'limit' | 'spend', why, until? }
 */
function gate({ verdict = null, ended = null, identity = null, limit = null, probe = null } = {}) {
  const v = verdict || { ok: true };
  if (!v.ok) return { go: false, code: v.code || 'cannot_resume', why: v.why || v.code || 'it cannot be resumed without a page' };
  const e = ended || endedRule(null);
  if (!e.ok) return { go: false, code: e.code || 'ended_unknown', why: e.why || 'how it ended is not known' };
  if (!identity || !identity.key) return { go: false, code: 'identity', why: 'the account its next turn would bill cannot be named' };
  if (limit && limit.unread === true) return { go: false, code: 'limit_unread', why: limit.why || 'its account\'s limit could not be read' };   // a reading that FAILED — never a turn on a guess (no reading at all stays the guard's)
  if (limit && limit.usable === false) return { go: false, code: 'limit', why: 'its account is at its limit', until: Number(limit.blockedUntil) || null };
  if (!probe || probe.ok !== true) return { go: false, code: 'spend', why: (probe && (probe.reason || probe.why)) || 'the spend ceiling refused this turn' };
  return { go: true, rule: e.rule || null };
}

/** The hand-over's own last sentence for a resumed addressee (the design, word for word): the agent learns why it is running. */
const FRAME_TAIL = 'This conversation had been ended and was resumed to hand you this. Background tasks and timers it had before are gone.';

/** WHAT THE SENDER IS TOLD (the design) — the SENDER is an agent (a job's owner hears its own job; a peer hears its send's
 *  answer), so these are agent-facing words, never through the dictionaries (CLAUDE.md i18n: t() is for chrome a person reads).
 *  `outcome` = 'resuming' | 'owed' (judged at the line by how it ended) | 'refused' | 'failed' | an owesWake `code` (it only
 *  waits). → the sentence */
function senderWords(outcome, { why = '', count = 0 } = {}) {
  switch (outcome) {
    case 'resuming': return 'the conversation was ended — it is being resumed and gets this as a turn';
    case 'owed': return 'the conversation was ended — if a restart ended it, it is resumed and gets this as a turn; if it was ended on purpose, this waits for its next turn';
    case 'refused': return `the conversation was ended — it was not resumed (${why || 'refused'}); this waits for its next turn`;
    case 'failed': return `the conversation was ended — the resume failed (${why || 'unknown'}); this waits for its next turn`;
    case 'fan_out': return `${Number(count) || 0} member(s) are ended; this rides their next turn`;
    case 'archived': return 'the conversation is archived; this waits until it is un-archived and runs again';
    default: return 'the conversation is ended; this waits for its next turn';
  }
}

/** THE JOB JOURNAL's wake line — the `wake` lane, carrying the conversation's link (the person opens it from the Delivery log). */
function journalWords(outcome, { why = '' } = {}) {
  if (outcome === 'resuming') return { lane: 'wake', ok: true, key: 'resumed its ended owner to deliver this', params: {} };
  return { lane: 'wake', ok: false, key: 'its owner is ended and was not resumed: {why}', params: { why } };
}

/** THE ROW, THE BAR AND THE SIDEBAR CARD of an ended conversation with words waiting (the design): «{n} notices are waiting for it»,
 *  and after a refused wake «{n} notices are waiting — not resumed: {why}» (a limit says until when through `until`, an epoch the
 *  PAGE renders in the viewer's zone). n = 0 ⇒ null (nothing is drawn). */
function waitingRow(n, refusal = null) {
  const count = Number(n) || 0;
  if (count <= 0) return null;
  if (!refusal) return { key: '{n} notices are waiting for it', params: { n: count } };
  if (refusal.code === 'limit' && refusal.until) return { key: '{n} notices are waiting — not resumed: its account is at its limit until {when}', params: { n: count }, until: refusal.until };
  return { key: '{n} notices are waiting — not resumed: {why}', params: { n: count, why: refusal.why || '' } };
}

/**
 * RULE 3 — EVERY WAKE BY A DELIVERY IS SEEN: the line the resumed conversation's window shows and the System panel's row repeats
 * (no For-you item per wake). `what` = the names of what resumed it (a job's or schedule's name; a peer's name), `at` = the
 * instant (the PAGE renders it in the viewer's zone), `by` = who GRANTED it when the conversation was ended on purpose (the
 * job row's wakeGrantBy: {kind: 'person' | 'key', name}) — the line names it (主开发 05:13Z). → { key, params, at, by? } | null
 */
function resumedLine(what = [], at = null, { by = null } = {}) {
  const names = [...new Set((what || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!names.length || !Number(at)) return null;
  const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
  if (by && by.kind === 'person') return { key: 'Resumed {when} to deliver: {what} — you allowed it', params: { what: shown }, at: Number(at), by: { kind: 'person' } };
  if (by && by.kind === 'key') return { key: 'Resumed {when} to deliver: {what} — allowed by the key «{by}»', params: { what: shown, by: String(by.name || by.by || 'a key') }, at: Number(at), by: { kind: 'key', name: by.name || null } };
  return { key: 'Resumed {when} to deliver: {what}', params: { what: shown }, at: Number(at) };
}

/** the BARE peer frame's lead (the sender's and the group's names — peer-chosen words: the hand-over BELTS them at the frame) */
function peerLead(fromName) { return `${String(fromName || '').trim() || 'an agent'} sent it a message with a wake`; }

/** RULE 3 when the hand-over is refused or fails AFTER the resume (主开发 12:46Z): the now-live conversation says why — the words
 *  wait for its next turn. → { key, params, at, refused: {code} } (the page words the code) */
function resumedRefusedLine(what = [], at = null, { code = 'handover_failed', why = '' } = {}) {
  const names = [...new Set((what || []).map((x) => String(x || '').trim()).filter(Boolean))];
  return { key: 'Resumed {when} to deliver: {what} — but the hand-over was refused: {why}', params: { what: names.slice(0, 3).join(', ') || '—', why: String(why || '').slice(0, 200) }, at: Number(at) || null, refused: { code } };
}

module.exports = { WAKE_REASONS, peerLead, resumedRefusedLine, JOB_KINDS, RESTART_REASON, ENDED_REASON, GRANT_FIELD, GRANT_REFUSAL, GRANT_REFUSAL_CREATE, owesWake, endedHow, endedRule, whoEnded, wakeChoiceRows, deliveryResumeVerdict, gate, FRAME_TAIL, senderWords, journalWords, waitingRow, resumedLine };
