'use strict';
/**
 * WHAT IS WAITING FOR AN AGENT — VISIBLE, AND HANDED OVER ON REQUEST (ORCH; the owner, 2026-09-27: "能看到，只是会
 * 堆积到我下次发消息给它，这个有点 confusing，因为我在界面里完全看不到'有消息在 queue'这件事情").
 *
 * Two stores hold notices for a conversation until its next context injection: the delivery ladder's durable stash
 * (src/server/conversation-deliver.js) and the Background Work engine's own (src/jobs.js). Nothing said so. This
 * module is the one place that
 *   - SUMMARIZES both for a live session (`summaryFor(s)` → PURE src/stash-summary.js `summarize`) — the `stash`
 *     fact of the `active-sessions` payload (src/lib/sidebar.js LIVE_SESSION_FACTS, carried-only), which the chat's
 *     strip above the composer and the sidebar card's hint draw;
 *   - RE-PUBLISHES it when either store changes (`changed()` — the two stores' hooks call it; ONE debounced
 *     `broadcastActiveSessions` per burst, never one per write);
 *   - HANDS the whole stash over NOW on the user's click (`POST /api/sessions/:id/stash/hand-over`, cookie only — an
 *     agent's bearer is 403 `agent_forbidden`): the entries are READ (not taken), rendered as ONE message (the same
 *     blocks the next injection would have carried: agent-routes `renderMsgStash` + job-model `renderNotifStash`),
 *     delivered through THE ladder under spend reason `stash-handover` (the spend authorizer inside it — a refusal
 *     answers by name and leaves the stash exactly as it was), and only what was DELIVERED is drained (a notice
 *     that arrived meanwhile keeps waiting). ONE ladder call ⇒ at most ONE ledger row.
 *
 * VERIFY (channel-jump, 2026-09-27 — both reproduced on the real ladder):
 *   - ONE HAND-OVER IN FLIGHT PER CONVERSATION. Two clicks (a double click, two tabs, a click during a slow remote
 *     post) were two ladder calls: two copies delivered, two ledger rows. `inflight` holds the running hand-over per
 *     conversation; a second call answers `in_flight` by name (the id and its start) and touches nothing.
 *   - THE ENTRIES ARE CLAIMED WHILE THE LADDER RUNS. The user's own message drains the stash at its injection
 *     (agent-routes prompt-context / task-context, a full `drainStash` / `drainNotifs`); while the hand-over awaited
 *     the post, that drain took the same entries and the receipt reached the agent TWICE. Both stores now have a
 *     claim door (`claimStash` / `claimNotifs`): a full drain leaves a claimed entry in place, the claim is released
 *     in `finally` — after the by-identity drain on success, untouched on a refusal.
 *   - `billed` rides the fact (the strip's "starts a turn"): a claude session mid-turn is still CHARGED (its inbox
 *     queues the message and runs it as its own turn — the ladder's `cli-inbox` law), so "no cost" is read off the
 *     harness's lane (`notificationDelivery(caps) === 'steer'` while a turn runs), never off `turn` alone.
 *   - >2 job results spill to the read file like the injection does, so an elided middle is not lost;
 *     `held_for_next_turn` names the wrapper-predates-steering refusal (it is not "unreachable").
 *
 * VERIFY r2 (channel-jump, 2026-09-27 — the exactly-once round; each reproduced before its fix):
 *   - A RESTART MID-HAND-OVER RE-DELIVERED. The claim lived in memory; the entries stayed on disk; the SIGTERM
 *     shutdown flushed and exited while the post was on its way; the next boot's injection carried the frame the CLI
 *     had already taken. Now (a) every hand-over has an ID (`ho-…`) that its frame's text carries; (b) the claim is
 *     the entry's own `ho:<id>` stamp, written to BOTH stores synchronously before the post; (c) the drain after a
 *     delivery persists synchronously (the 500 ms / 2 s debounce after it was a second window); (d) the shutdown
 *     WAITS for a hand-over in flight (`settle()`, bounded) so a SIGTERM restart is exactly-once by construction;
 *     (e) a stamp a dead process left (SIGKILL / OOM inside the socket round-trip) is RELEASED at boot, by name in
 *     the log — a repeat is visible and traceable by its id, a loss would be silent.
 *   - THE CODEX `ok:false` RE-STASH COLLAPSED N ENTRIES INTO ONE. The wrapper echoes the frame's whole text; the
 *     consumer stashed it as ONE notice — "1 VibeSpace notice" for five, and the job results left their own store for
 *     good. `delivered` remembers each hand-over's original entries (both stores, 10 min); the consumers ask
 *     `deliver.restoreFrame(cid, text)` first — a frame naming a remembered hand-over restores the ORIGINALS.
 *   - THE FACT SAYS WHAT A HAND-OVER WOULD DO: `inFlight` (another client's click is on its way — the strip disables
 *     its button and says so), `held` (the entries a hand-over under its budget would NOT carry — the strip names
 *     them, the result and the toast name the rest), `reachable` (a harness whose lane is stash-only has no hand-over
 *     — no dead button; the strip says the notices ride the next message).
 *
 * VERIFY r3 (channel-jump, 2026-09-27 — reproduced through the real codex consumer):
 *   - A PEER'S WORDS RESTORED A HAND-OVER. `restoreHandedOver` matched the tag ANYWHERE in the echoed text, and a
 *     tag is a string anyone can write: a PEER frame whose text quoted "(hand-over ho-…)" of a hand-over this hub
 *     still remembered, handed back by the wrapper (a Stop dropped it), restored the three entries the agent had
 *     ALREADY received and stashed nothing of the peer's message — a duplicate and a lost promise, keyed on a
 *     string a peer chose. Now a frame is the hand-over's ONLY when it IS the frame: the delivered record keeps the
 *     exact text the ladder wrote (the wrappers echo it verbatim) and the restore requires equality; any other text
 *     carrying a tag is stashed as itself by the caller. An originals-less record (the cap evicted every entry
 *     mid-flight) answers 0 once, so the frame is kept as one notice instead of dropped.
 *   - THE DOOR SHUTS BEFORE THE WAIT. `settle()` waited for the hand-overs in flight at the SIGTERM instant; a press
 *     during that wait (≤ 5 s) started one nobody waited for — its stamp on disk at exit, its ledger row after the
 *     flush. `close()` refuses every later press by name (`restarting`: the server is restarting, the notices keep
 *     waiting); server.js calls it first, then settles.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CLEARED_TEXT } = require('../record-clear.js');   // "Clear content…": the sentence a cleared record's copy reads
const S = require('../stash-summary.js');
const { capsOf, notificationDelivery } = require('../backend-caps.js');
const { vibespaceNoticeText } = require('../notification-senders.js');   // the ladder heads every notification with it: the frame text the wrapper echoes is the HEADED one
const GC = require('../group-card.js');   // lane group-report-card: a waiting group message as the summary reads an entry
const { addressableId } = require('../claude-lock-capture.js');   // the groups engine's member id = the conversation's OWN id (a pending fork has none)
const RN = require('../refresh-note.js');   // PURE (lane refresh-live-sessions): 「刷新所有活着的会话」 — which conversations take the note, its bound
const { toAgentText: agentText } = require('../peer-text.js');   // THE belt on the typed note before it reaches an agent's context
/** The name the hand-over speaks under — a VibeSpace notification SENDER (src/notification-senders.js lists it). */
const FROM_NAME = 'VibeSpace notices';

const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
const { pressBearer, pressOf, isPress } = require('../write-origin.js');   // lane owner-press-attended: the hand-over is an ATTENDED door — no bearer of any kind
const HANDOVER_MAX_ENTRIES = 30;       // conversation-deliver's STASH_CAP — every entry in one message
const HANDOVER_MAX_BYTES = 12 * 1024;
const HANDOVER_LAND_MS = 20000;   // the census cure (finding 11): how long a hand-over's reply waits for its drained job notices to land
/** How long a delivered hand-over's originals are remembered for a frame that comes back. The wrapper's DELIVERY
 *  verdict lands within the ladder's SETTLE_TTL_MS (120 s) — but a frame QUEUED behind a running turn (the steer
 *  refused: a review / compact turn) is handed back by a Stop or a queue removal ANY time before that turn ends,
 *  and a codex turn runs for as long as it runs (verify r4: the 10-minute memory forgot a hand-over the user
 *  stopped 15 minutes in — the echo restored nothing and the frame became one clipped notice). A day, bounded by
 *  DELIVERED_MAX records; the memory is ON DISK (`data/stash-handover.json`, the r2 stamps' law: a restart between
 *  the delivery and the echo forgot every record in-process). */
const DELIVERED_TTL_MS = 24 * 60 * 60 * 1000;
const DELIVERED_MAX = 50;
const DELIVERED_FILE = 'stash-handover.json';
/** The frame's own name for its hand-over (the text the wrapper echoes back carries it). */
const HANDOVER_TAG_RE = /\(hand-over (ho-[a-z0-9]+-[a-z0-9]+)\)/;
const STATUS = Object.freeze({ agent_forbidden: 403, no_session: 404, no_conversation: 409, nothing_waiting: 409, in_flight: 409, held_for_next_turn: 409, spend_refused: 429, unreachable: 409, unavailable: 503, restarting: 503, not_mid_turn: 409, not_steerable: 409, stopping: 409, unconfirmed: 409, too_long: 409, awaiting_word: 409 });
/** B-02a3: the group hand-over's budget (the frame the running turn takes — the next-turn report's own composition, bounded
 *  like the stash's hand-over), how long a press waits for the wrapper's word «handed», and how long a late word still
 *  settles it (the marks are committed only on that word). */
const GROUP_HANDOVER_BYTES = 12 * 1024;
const GROUP_HANDED_WAIT_MS = 3000;
const GROUP_LATE_MS = 60 * 1000;
/** B-02a3 cure: the spend ceiling is WIRED where the hub builds this door (server.js passes `getSpendGuard: () => spendGuard`, the usage
 *  engine's own instance) — never looked up here: the first cut read `require('./usage-pool-engine.js').spendGuard`, which that module
 *  does not export (it is on create()'s result), so every press in production was refused «not wired». An unwired door refuses,
 *  and says so once (scripts/test-spend-paths §2c: every injected guard is passed at every construction site). */

function create({ activeSessions, getDeliver = () => null, getJobs = () => null, getGroups = () => null, getChannels = () => null, broadcastSessions = () => {}, renderMsgStash, renderNotifStash, log = console, debounceMs = 300, now = () => Date.now(), schedule = (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; }, dataDir = null, getSendUserInput = () => null, getSpendGuard = () => null, groupHandedWaitMs = GROUP_HANDED_WAIT_MS, wakeBootGraceMs = 60 * 1000, handoverLandMs = HANDOVER_LAND_MS } = {}) {
  const cidOf = (s) => (s && (s.backendSessionId || s.claudeSessionId)) || null;
  const jobsReady = () => { try { const jm = getJobs(); return jm && typeof jm.peekNotifs === 'function' ? jm : null; } catch { return null; } };
  let seq = 0;
  const mint = () => `ho-${now().toString(36)}-${(++seq).toString(36)}`;

  /** Both stores' entries for one conversation (the SAME objects the drains take). */
  function entriesOf(cid) {
    const d = getDeliver();
    const msg = cid && d && typeof d.stashEntries === 'function' ? d.stashEntries(cid) : [];
    const jm = jobsReady();
    const jobs = cid && jm ? jm.peekNotifs(cid) : [];
    // THE PARKED ONES (lane notify-retry): the ladder's retry park, in the stash's shape (`_retry` = the original) —
    // the fact counts them as `retrying`, a hand-over carries them (and takes them out of the park)
    const retry = cid && d && typeof d.retryEntries === 'function' ? d.retryEntries(cid).filter((e) => e && !e.ho) : [];
    return { msg, jobs, retry };
  }
  /** Would handing over NOW open a billed turn? Free only where the harness's lane FOLDS a notification into the
   *  turn already running (codex steer); a claude inbox queues it and runs it as its own turn (charged, deferred). */
  function billedFor(s) {
    try { return !(notificationDelivery(capsOf(s && s.backend)) === 'steer' && !!(s && s._isStreaming)); } catch { return true; }
  }
  /** Is there a live lane a hand-over could take at all? A harness whose notification lane is `stash` (opencode / a
   *  shell) has none — the strip offers no button for it (a button that always refuses is a greyed hint). */
  function reachableFor(s) {
    try { return notificationDelivery(capsOf(s && s.backend)) !== 'stash'; } catch { return false; }
  }
  /** The entries a hand-over under its budget would NOT carry (the same render the hand-over does — a dry run). */
  function heldOf(msg) {
    if (!msg.length) return 0;
    try { return renderMsgStash(msg, { maxEntries: HANDOVER_MAX_ENTRIES, maxBytes: HANDOVER_MAX_BYTES }).rest.length; } catch { return 0; }
  }
  /** THE GROUP MESSAGES WAITING for this conversation's next turn (lane group-report-card): the groups engine's
   *  PREVIEW (`reportsForTurn(cid, {preview:true})` — commits nothing, memoised), as summary entries (source 'group').
   *  They live in the engine, not in a stash: a hand-over never carries them (they ride the next turn, whoever starts it — lane stash-any-turn);
   *  B-02a3: while the agent is mid-turn the strip's GROUP press hands them to the running turn (handOverGroups below). */
  function groupEntriesOf(s) {
    try {
      const ge = getGroups();
      const cid = addressableId(s);   // a pending fork carries its parent's id — its strip is not the parent's
      if (!cid || !ge || typeof ge.reportsForTurn !== 'function') return [];
      const pv = ge.reportsForTurn(cid, { preview: true });
      return ((pv && Array.isArray(pv.pending)) ? pv.pending : []).map(GC.pendingEntry).filter(Boolean);
    } catch (e) { log.warn?.(`[stash] group preview failed: ${(e && e.message) || e}`); return []; }
  }
  /** THE ENDED ROWS' WAITING FACT (the manager design's piece 7: «{n} notices are waiting for it», after a refused wake «—
   *  not resumed: {why}»): one entry per conversation that is NOT running and has words waiting in either store, keyed by its
   *  conversation id → {n, code, until} (the page words it; `code` = the owed wake's last refusal, null when none was asked).
   *  Reads only the conversations a store names — never every row. */
  function waitingAll() {
    const d = getDeliver(), jm = jobsReady();
    const cids = new Set([...((d && typeof d.stashCids === 'function') ? d.stashCids() : []), ...((jm && typeof jm.notifCids === 'function') ? jm.notifCids() : [])]);
    if (!cids.size) return {};
    const live = new Set(); for (const s of activeSessions.values()) { const c = cidOf(s); if (c) live.add(c); }
    const out = {};
    for (const cid of cids) {
      if (live.has(cid)) continue;
      // COUNTS only (主开发 12:46Z): this runs on GET /api/sessions — no gate pass, no view re-judge, nothing written
      let n = 0;
      try { n = ((d && typeof d.stashCount === 'function') ? d.stashCount(cid) : 0) + ((jm && typeof jm.notifCount === 'function') ? jm.notifCount(cid) : 0) + ((d && typeof d.retryWaitingCount === 'function') ? d.retryWaitingCount(cid) : 0); } catch { n = 0; }
      if (!n) continue;
      const a = d && typeof d.endedAnswerOf === 'function' ? d.endedAnswerOf(cid) : null;
      out[cid] = { n, code: (a && a.code) || (a && a.outcome === 'failed' ? 'failed' : null), until: (a && a.until) || null };
    }
    return out;
  }
  /** The `stash` session fact (null = nothing waits); `billed` = the strip's "starts a turn"; `inFlight` = a hand-over
   *  is on its way (another client's click); `held` = what one hand-over would leave; `reachable` = a hand-over exists
   *  AND has something to carry (lane group-report-card: group messages alone are not handed over — no button). */
  function summaryFor(s) {
    // B-6721 (the cure's fresh read, ALSO CURED): a PENDING FORK carries its parent's id — its strip offered the parent's stash and its
    // «Hand over» billed the parent's notices from the fork's window; the fact is the session's OWN conversation's, or none
    const cid = ownCidOf(s);
    if (!cid) return null;
    noteLive(cid);   // B-6721: a live session of a conversation owed a wake (a resume, a restore) arms its chain — the payload is built for every live session; a pending fork (its parent's id) never
    try {
      const both = entriesOf(cid);
      const groups = groupEntriesOf(s);
      const sum = S.summarize({ msg: [...both.retry, ...both.msg, ...groups], jobs: both.jobs });
      const d = getDeliver();
      // B-f276 1b: entries KEPT (their reach cannot be judged now — a channels file could not be read) are counted, never hidden: beside
      // others the strip names them; alone they are the strip (no press — nothing can be handed over until they can be judged)
      const kept = d && typeof d.stashKeptCount === 'function' ? d.stashKeptCount(cid) : 0;
      if (!sum && kept > 0) return { count: 0, kept, items: [], billed: false, inFlight: false, held: 0, reachable: false };
      return sum ? { ...sum, ...(kept > 0 ? { kept } : {}), ...(s.host ? { groupHandover: false } : {}), billed: billedFor(s), inFlight: inflight.has(cid), held: heldOf([...both.retry, ...both.msg]), reachable: reachableFor(s) && (both.msg.length + both.jobs.length + both.retry.length) > 0, ...(d && typeof d.handoverArmed === 'function' && d.handoverArmed(cid) ? { armed: true } : {}) } : null;
    } catch (e) { log.warn?.(`[stash] summary failed: ${(e && e.message) || e}`); return null; }
  }

  // THE ARMED HAND-OVER RUNS AT THE TURN END (R3): the ladder says a turn ended; if the injection armed a hand-over for
  // this conversation (its notices did not fit the prompt), it runs now as ONE message under 'stash-retry' — unless a
  // post landed within the ladder's floor, in which case it waits the floor out and re-checks (idle, live, something
  // still waiting; a turn running again re-arms for its own end). Refusals are logged; the stash is untouched.
  async function runArmed(cid, why, deferred = false) {
    const d = getDeliver();
    const wid = ownWidOf(cid);   // B-6721: by the ladder's predicate (a pending fork listed before its live parent was picked)
    const s = wid != null ? activeSessions.get(wid) : null;
    if (!d || !s) return;
    const floor = Number(d.RETRY_FLOOR_MS) || 30 * 1000;
    const since = typeof d.sincePost === 'function' ? d.sincePost(cid) : Infinity;
    if (since < floor) { schedule(() => { runArmed(cid, why, true).catch(() => { }); }, floor - since); return; }   // the floor: never two posts inside it
    if (deferred) {
      if (!summaryFor(s)) return;                                     // drained meanwhile (a prompt, a click)
      if (s._isStreaming) { if (typeof d.armStashHandover === 'function') d.armStashHandover(cid, why); return; }   // a turn runs again: its own end runs this
    }
    const r = await handOver(wid, { auto: true });
    if (r && r.ok) log.log?.(`[stash] ${cid}: ${r.delivered} waiting notice(s) posted as a message after the turn ended (hand-over ${r.id}, lane ${r.lane || '?'}${r.held ? `, ${r.held} more held` : ''})`);
    else log.log?.(`[stash] ${cid}: the armed hand-over after the turn end was not made — ${(r && r.code) || 'unknown'}: ${(r && r.error) || ''} (the notices keep waiting; the next prompt re-arms it)`);
  }
  { const d0 = getDeliver(); if (d0 && typeof d0.onTurnEnd === 'function') d0.onTurnEnd(async (cid) => { const a = typeof d0.takeArmedHandover === 'function' ? d0.takeArmedHandover(cid) : null; if (a) await runArmed(cid, a.why); }); }

  // ── B-6721: A STASHED WAKE WAKES ITS CONVERSATION ONCE IT RUNS AGAIN, OR FOR YOU SAYS IT WAITS ─────────────────────────────
  // (fb-708fa798a0, measured in the journal: a one-shot fired at 08:30 while its conversation was not running — «no live
  // inbox … pid-gone», stashed; the conversation was resumed at 09:18 and heard nothing until a prompt hours later: the
  // stash waits for a prompt, and nobody typed one.) A conversation OWED A WAKE (the jobs engine's `wakeOwed`: stashed
  // not-running, or held by the 30 s floor — B-2fa2) gets ONE chain of LOCAL checks (no vendor, nothing posted while away):
  //   · a live, reachable, idle session ⇒ THE AUTOMATIC HAND-OVER (`handOver(wid, { auto: 'reachable' })` — the turn end's
  //     exactly-once road: one in flight per conversation, its entries claimed, its record kept) under its OWN reason
  //     `stash-reachable`, its own words; the jobs engine's floor counts it;
  //   · a live session not yet taking frames (its CLI starting) ⇒ the next step (5 s, 30 s, 1, 2, 5, 10 min); a turn running ⇒
  //     a look every 30 s (its end, or a later look, carries it);
  //   · AWAY (no live session) ⇒ For you says the notices wait (`sayWakeWaiting` — once a waiting episode) and the chain ENDS:
  //     it is armed again when a live session of the conversation is seen (`summaryFor`, built for every live session — a
  //     resume, a restore) or a write of either store owes it again; nothing polls a conversation that is gone;
  //   · a refusal (the spend ceiling, a next-turn hold, nothing waiting) ⇒ the chain ENDS, said in the journal (the notices
  //     ride the next prompt, as before).
  // A conversation whose check is RUNNING is never armed again from a hook (`wakeBusy`), and a chain that ENDED stays QUIET
  // (`wakeQuiet`: why, and the newest owed notice it saw) — the hand-over's own changed() re-armed a fresh step-0 chain on every
  // refusal (the fresh read's must: a 5 s loop with no end). A quiet conversation is armed again only by something NEW: a notice
  // newer than the one it saw, or — after AWAY — a live session of it (a refusal is never retried while nothing changed).
  const WAKE_STEPS_MS = [5 * 1000, 30 * 1000, 60 * 1000, 2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000];
  const WAKE_BUSY_STEP = 1;   // a turn running: the 30 s step
  const wakeChains = new Map();   // cid → { step }: the conversation's next check is scheduled (no words: a cid and a step)
  const wakeBusy = new Set();     // cid: its check is running
  const wakeQuiet = new Map();    // cid → { why: 'away' | 'refused', at }: its chain ended; `at` = the newest owed notice it saw
  // THE WAKE'S SESSION BY THE LADDER'S PREDICATE (主开发's round wdtmcza5y, the must): a PENDING FORK carries its parent's id —
  // never the parent's window (addressableId: «never a pending fork»); its payload arms nothing, its window is never checked
  // nor handed over (else a fork kept a stopped parent's chain stepping out to every 10 minutes for as long as it stayed pending)
  const ownCidOf = (s) => addressableId(s);
  function ownWidOf(cid) { try { for (const [wid, x] of activeSessions) if (ownCidOf(x) === cid) return wid; } catch { } return null; }
  const owedOf = (cid) => { const jm = jobsReady(); try { return jm && !jm.readOnly && typeof jm.wakeOwed === 'function' ? jm.wakeOwed(cid) : []; } catch { return []; } };   // a read-only engine's drain writes nothing: never armed
  const newestOf = (owed) => owed.reduce((m, n) => Math.max(m, Number(n && n.ts) || 0), 0);
  /** may a hook arm this conversation now? — something owed, no chain, no check running, and nothing that ENDED it unchanged:
   *  a quiet conversation is lifted by a NEWER owed notice, or by a live session it did not see (after AWAY any live session; after a
   *  refusal or a wake that landed, a NEW one — a resume: the read's must, a refusal's quiet outlived the session) */
  function mayArm(cid, wid = null) {
    if (!cid || closed || wakeChains.has(cid) || wakeBusy.has(cid)) return false;
    const owed = owedOf(cid);
    if (!owed.length) return false;
    const q = wakeQuiet.get(cid);
    if (q && newestOf(owed) <= q.at && !(wid != null && (q.why === 'away' || q.wid !== wid))) return false;
    wakeQuiet.delete(cid);
    return true;
  }
  function armOwedWakes(fromStep = 0) {
    const jm = jobsReady();
    if (closed || !jm || !(jm.pendingNotifs instanceof Map)) return;
    for (const cid of jm.pendingNotifs.keys()) if (mayArm(cid)) armWake(cid, fromStep);
  }
  /** a payload built for a session: only a session IN the map arms (the hub builds one for every live session — a resume, a restore) */
  function noteLive(cid) { const wid = ownWidOf(cid); if (wid != null && mayArm(cid, wid)) armWake(cid, 0); }
  const quiet = (cid, why, at = newestOf(owedOf(cid))) => wakeQuiet.set(cid, { why, at, wid: ownWidOf(cid) });
  const bootAt = now();
  const BOOT_GRACE_MS = wakeBootGraceMs;   // a session the boot re-attaches late (a keeper's, a device's) is not AWAY in the boot's first minute
  function armWake(cid, step, ms = null) {
    if (wakeChains.has(cid)) return;   // ONE chain a conversation
    wakeChains.set(cid, { step });
    schedule(() => { wakeChains.delete(cid); tryWake(cid, step).catch((e) => log.warn?.(`[stash] ${cid}: a wake check failed — ${(e && e.message) || e}`)); },
      ms != null ? ms : WAKE_STEPS_MS[Math.min(step, WAKE_STEPS_MS.length - 1)]);
  }
  async function tryWake(cid, step) {
    if (closed || wakeBusy.has(cid)) return;
    wakeBusy.add(cid);
    let next = null;   // [step, ms] — armed AFTER the check, never from a hook inside it
    try {
      const jm = jobsReady();
      if (!owedOf(cid).length) { wakeQuiet.delete(cid); try { if (jm && jm.wakeSettled) jm.wakeSettled(cid); } catch { } return; }
      const d = getDeliver(), wid = ownWidOf(cid), s = wid != null ? activeSessions.get(wid) : null;
      if ((!d || !s) && now() - bootAt < BOOT_GRACE_MS) { next = [step + 1, null]; return; }   // the boot's first minute: sessions still attaching
      if (!d || !s) { try { if (jm && jm.sayWakeWaiting) jm.sayWakeWaiting(cid); } catch { } quiet(cid, 'away'); return; }   // AWAY: said once, the chain ends
      if (typeof d.peerReachable === 'function' && !d.peerReachable(cid)) { next = [step + 1, null]; return; }   // live, not taking frames yet
      if (s._isStreaming) { next = [WAKE_BUSY_STEP, null]; return; }
      const floor = Number(d.RETRY_FLOOR_MS) || 30 * 1000;
      const since = typeof d.sincePost === 'function' ? d.sincePost(cid) : Infinity;
      if (since < floor) { next = [step, Math.min(floor, floor - since)]; return; }   // the ladder's floor: never two posts inside it (a clock stepped back never lengthens the wait)
      const handed = newestOf(owedOf(cid));
      const r = await handOver(wid, { auto: 'reachable' });
      if (r && r.ok) {
        log.log?.(`[stash] ${cid}: ${r.delivered} waiting notice(s) were posted as a message once the conversation could take them (hand-over ${r.id}, lane ${r.lane || '?'})`);
        // QUIET at the newest notice this wake carried (the read's must: a frame the wrapper hands back RESTORES those entries — still
        // owed — and a fresh chain re-posted, billed, every ~30 s); a NEWER notice, or a new session, lifts it
        quiet(cid, 'handed', handed);
        if (owedOf(cid).some((n) => (Number(n && n.ts) || 0) > handed)) next = [0, null]; else { try { if (jm && jm.wakeSettled) jm.wakeSettled(cid); } catch { } }
        return;
      }
      // the frame WRITTEN and then the post failed (a write-phase timeout): it may have landed — the chain ENDS (the round's should: a
      // second post 30 s later is a second billed turn for one notice); the notices ride the next prompt, as a refusal's do
      if (r && r.code === 'unreachable' && ((r.phase === 'write' && r.error === 'timeout') || r.unanswered === true)) { log.log?.(`[stash] ${cid}: the hand-over's frame was written but the post did not complete (phase write) — it may have reached the agent: not posted again; the notices ride its next prompt`); quiet(cid, 'refused'); return; }
      if (r && (r.code === 'unreachable' || r.code === 'in_flight')) { next = [step + 1, null]; return; }
      log.log?.(`[stash] ${cid}: the notices waiting for the conversation were not handed over — ${(r && r.code) || 'unknown'}: ${(r && r.error) || ''} (they ride its next prompt; nothing retries them until something changes)`);
      quiet(cid, 'refused');
    } finally {
      wakeBusy.delete(cid);
      if (next && !closed) armWake(cid, next[0], next[1]);
    }
  }

  let timer = null;
  /** A store changed: re-publish the session list once per burst. */
  function changed() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; armOwedWakes(); try { broadcastSessions(); } catch (e) { log.warn?.(`[stash] re-publish failed: ${(e && e.message) || e}`); } }, debounceMs);   // B-6721: a write that owes a wake arms its conversation's chain — once per burst
    if (timer.unref) timer.unref();
  }

  const inflight = new Map();   // cid → {id, at, p}: the running hand-over (ONE per conversation)
  let closed = false;           // verify r3: the shutdown shut the door — no hand-over starts after it
  const delivered = new Map();  // id → {cid, msg, jobs, at, text, restored?}: a delivered hand-over's originals, for a frame that comes back
  // THE MEMORY IS ON DISK (verify r4): the record is a delivery's bookkeeping like the r2 stamps — in-process it died
  // with a restart, and the wrapper's echo after the boot found nothing to restore (the frame then rode the next
  // injection as one 400-char line: 5 channel messages and a job result, gone). tmp+rename; unreadable = empty.
  const file = dataDir ? path.join(dataDir, DELIVERED_FILE) : null;
  if (file) {
    let raw = null;
    try { raw = fs.readFileSync(file, 'utf-8'); } catch { raw = null; }   // absent = a first boot, nothing to say
    if (raw !== null) {
      try {
        const obj = JSON.parse(raw);
        // a record is a hand-over's only with its conversation, its exact frame text and a NUMERIC instant — a junk `at`
        // (verify r5: a string is never older than the TTL's cut, NaN < cut is false, so it lived until the count bound)
        for (const [id, rec] of Object.entries(obj || {})) if (rec && typeof rec === 'object' && rec.cid && (typeof rec.text === 'string' || typeof rec.textSha === 'string') && Number(rec.at) > 0) delivered.set(id, { ...rec, at: Number(rec.at), msg: Array.isArray(rec.msg) ? rec.msg : [], jobs: Array.isArray(rec.jobs) ? rec.jobs : [] });
      } catch (e) { log.warn?.(`[stash] the hand-over memory ${file} was unreadable (${(e && e.message) || e}) — starting empty; a frame handed back for a hand-over delivered before this boot is kept as one notice`); }   // verify r5: never silent
    }
  }
  // "CLEAR CONTENT…" (the lane-redact merge onto 2.369.196): this memory is a COPY of held words — a delivered hand-over's
  // originals (the ladder's entries: a group wake's report, a codex hand-back; the jobs store's notifications) and the
  // frame that carried them, on disk for 24 h and restored into both stores when the frame comes back. A clear reaches
  // it through the ladder's door (`registerRedactor`, called by redactStash with the door's match + scope): an original
  // the match names, or a job notification of a cleared job (`scope.jobIds`), reads the sentence; a record whose
  // originals OR frame carried those words keeps only the frame's DIGEST — the echo is still recognised (`sameFrame`),
  // restored as the now-cleared originals, and the words leave the disk.
  const frameSha = (t) => crypto.createHash('sha256').update(String(t || '').trim()).digest('hex');
  /** Does any of these entries read the cleared sentence (a ladder entry's text / sender label, a job notification's
   *  text / name)? Asked when a delivery lands: such an entry was cleared while its post was on its way. */
  const readsCleared = (msg, jobs) => (msg || []).some((e) => e && (String(e.text || '').includes(CLEARED_TEXT) || String(e.fromName || '').includes(CLEARED_TEXT)))
    || (jobs || []).some((n) => n && (n.text === CLEARED_TEXT || n.jobName === CLEARED_TEXT));
  function sameFrame(rec, echoed) {
    if (typeof rec.text === 'string') return echoed.trim() === rec.text.trim();
    return typeof rec.textSha === 'string' && frameSha(echoed) === rec.textSha;
  }
  /** Does a frame NAME job `id`? The id as a whole token, whatever stands around it (lane-redact verify r3 on the merged
   *  tree, reproduced): a frame carries a jobs-store notification as `- 09-28 10:00 jb-… name: text` but a LADDER entry
   *  (a codex wrapper's hand-back of the job's own notification) as `[VibeSpace Background Work] task "name" (jb-…):
   *  …\nDetails: vibespace-job poll jb-…. …` — `' jb-… '` matched the first form only, so a spent record whose frame
   *  carried the second kept the job's name and words on disk after the clear. */
  const namesJob = (text, id) => new RegExp('(^|[^\\w-])' + String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])').test(text);
  function redactDelivered(match, scope = {}) {
    const ids = new Set(Array.isArray(scope && scope.jobIds) ? scope.jobIds.map(String) : []);
    const ask = (e) => { let r = null; try { r = typeof match === 'function' ? match(e) : null; } catch { r = null; } return r && typeof r === 'object' ? r : null; };
    let n = 0;
    for (const rec of delivered.values()) {
      let hit = false;
      for (const e of rec.msg || []) {
        const r = e && ask(e);
        if (!r) continue;
        if (typeof r.text === 'string') e.text = r.text;
        if (typeof r.fromName === 'string') e.fromName = r.fromName;
        hit = true;
      }
      for (const j of rec.jobs || []) {
        if (!j || !ids.has(String(j.jobId))) continue;
        j.jobName = CLEARED_TEXT; j.text = CLEARED_TEXT; hit = true;
      }
      // a SPENT record (restored: its originals are back in their stores) keeps only its frame — judged by the frame itself
      if (!hit && typeof rec.text === 'string') {
        if (ask({ source: 'agent', kind: 'notification', fromName: FROM_NAME, text: rec.text })) hit = true;
        else for (const id of ids) if (namesJob(rec.text, id)) { hit = true; break; }
      }
      if (!hit) continue;
      n++;
      if (typeof rec.text === 'string') { rec.textSha = frameSha(rec.text); delete rec.text; }
    }
    if (n) persistDelivered();
    return n;
  }
  function persistDelivered() {
    if (!file) return;
    try { fs.writeFileSync(file + '.tmp', JSON.stringify(Object.fromEntries(delivered))); fs.renameSync(file + '.tmp', file); }
    catch (e) { log.warn?.(`[stash] the hand-over memory was not persisted: ${(e && e.message) || e}`); }
  }
  /** The TTL, then the count bound. Over the bound a SPENT record goes first (verify r5: it holds no originals — it
   *  only answers a second echo of the same frame), then the oldest; a LIVE record evicted by the bound is said by
   *  name — its frame, if it ever comes back, is kept as one notice under the injection's block budget, so the
   *  loss is a clip the log can trace, never a silence. */
  function forget() {
    const cut = now() - DELIVERED_TTL_MS;
    let n = 0;
    // a record still HOLDING a put-back's copy (jobsOwed — the moved2 cure 2) is never forgotten: it is the copy's only home
    const held = (rec) => !!(rec && rec.jobsOwed && rec.jobs && rec.jobs.length);
    for (const [id, rec] of delivered) if (rec.at < cut && !held(rec)) { delivered.delete(id); n++; }
    if (delivered.size > DELIVERED_MAX) for (const [id, rec] of delivered) { if (delivered.size <= DELIVERED_MAX) break; if (rec.restored && !held(rec)) { delivered.delete(id); n++; } }
    while (delivered.size > DELIVERED_MAX) {
      let id = null; for (const [k, r] of delivered) if (!held(r)) { id = k; break; }
      if (id == null) break;
      const rec = delivered.get(id);
      delivered.delete(id); n++;
      log.warn?.(`[stash] hand-over ${id} (${rec && rec.cid}, ${(rec && (rec.msg.length + rec.jobs.length)) || 0} originals) forgotten by the ${DELIVERED_MAX}-record bound — a frame handed back for it is kept as one notice`);
    }
    return n;
  }
  if (forget()) persistDelivered();
  /** THE KEPT COPY IS DROPPED ONLY ON THE LANDING (lane lg-store-writes, the moved2 cure 2 — its must 1): the job notifications put
   *  back go through the jobs store's writer, so this memory keeps its copy (`jobsOwed`, on disk here) until the store holding
   *  them LANDS (jm.afterNotifsLanded — the step that cannot be undone rides the landing); a kill first ⇒ the next start puts
   *  the copy back (putBackHeld), never lost and never twice (restoreNotifs skips the same job at the same instant) */
  function keepUntilLanded(rec, jm) {
    if (!rec.jobs.length) { delete rec.jobsOwed; return; }
    rec.jobsOwed = true;
    if (!jm || typeof jm.afterNotifsLanded !== 'function') return;   // the jobs store not up yet: the start's pass puts it back
    const copy = rec.jobs;
    try { jm.afterNotifsLanded(() => { if (rec.jobs !== copy) return; rec.jobs = []; delete rec.jobsOwed; persistDelivered(); changed(); }); }
    catch (e) { log.warn?.(`[stash] the kept job notifications wait for the next start: ${(e && e.message) || e}`); }
  }
  /** A START PUTS BACK EVERY COPY STILL HELD (the moved2 cure 2): a record whose put-back had not landed when the last process
   *  stopped — its job notifications go back into the jobs store (by job and instant, no duplicate) and ride that landing again.
   *  The jobs store comes up after this module: asked again each second, a minute at most, said when it never came. */
  function putBackHeld(tries = 0) {
    const held = [...delivered.values()].filter((r) => r && r.jobsOwed && r.jobs.length);
    if (!held.length) return;
    const jm = jobsReady();
    if (!jm || typeof jm.restoreNotifs !== 'function') { if (tries < 60) schedule(() => putBackHeld(tries + 1), 1000); else log.warn?.(`[stash] ${held.length} hand-over cop${held.length === 1 ? 'y' : 'ies'} of job notifications still held — the jobs store never came up; kept for the next start`); return; }
    let n = 0;
    for (const rec of held) { n += jm.restoreNotifs(rec.cid, rec.jobs); keepUntilLanded(rec, jm); }
    log.log?.(`[stash] the last process stopped before ${held.length} hand-over put-back(s) landed — ${n} job notification(s) put back (none twice)`);
    changed();
  }
  if (delivered.size) schedule(() => putBackHeld(0), 0);
  /** Hand the whole stash over now — ONE message through the ladder, reason `stash-handover`. */
  async function handOver(webuiId, { auto = false, pressed = null } = {}) {
    const s = activeSessions && activeSessions.get(String(webuiId));
    if (!s) return { ok: false, code: 'no_session', error: 'no such live session' };
    const cid = ownCidOf(s);   // B-6721: a pending fork (its parent's id) has no conversation of its own yet — never the parent's hand-over
    if (!cid) return { ok: false, code: 'no_conversation', error: 'this session has no conversation yet' };
    if (closed) return { ok: false, code: 'restarting', error: 'the server is restarting — the notices keep waiting for the agent’s next turn' };
    const cur = inflight.get(cid);
    if (cur) return { ok: false, code: 'in_flight', error: `a hand-over for this conversation is already in progress (${cur.id}, started ${Math.max(0, now() - cur.at)} ms ago)`, id: cur.id, since: cur.at };
    const id = mint();
    const rec = { id, at: now(), p: null };
    inflight.set(cid, rec);
    changed();   // the fact says `inFlight` to every client
    rec.p = handOverNow(s, cid, id, { auto, pressed });
    try { return await rec.p; } finally { if (inflight.get(cid) === rec) inflight.delete(cid); changed(); }
  }
  /** THE TWO HALVES OF A HAND-OVER (piece 7 split them so a resumed conversation's hand-over is the SAME road): PREPARE reads
   *  both stores BY CONVERSATION (no live session needed), renders what a frame would carry and CLAIMS it — the `ho:<id>`
   *  stamp on disk in both stores before anything else happens — and POST sends ONE frame through the ladder, drains exactly
   *  what went out and releases the claims (also on a refusal). */
  function prepareHandOver(cid, id) {
    const d = getDeliver();
    if (!d || typeof d.deliverToConversation !== 'function') return { ok: false, code: 'unavailable', error: 'the delivery ladder is not wired on this instance' };
    const jm = jobsReady();
    const { msg: stashed, jobs, retry } = entriesOf(cid);
    const msg = [...retry, ...stashed];   // a parked notification rides the same frame — the oldest wait first
    if (!msg.length && !jobs.length) return { ok: false, code: 'nothing_waiting', error: 'nothing is waiting for this conversation', kept: d && typeof d.stashKeptCount === 'function' ? d.stashKeptCount(cid) : 0 };   // B-f276 1a: entries KEPT (their reach cannot be judged now) are not nothing — the wake's line waits for them
    const pm = msg.length ? renderMsgStash(msg, { maxEntries: HANDOVER_MAX_ENTRIES, maxBytes: HANDOVER_MAX_BYTES }) : { text: '', shown: [], rest: [] };
    const shownParked = pm.shown.filter((e) => e && e._retry);
    const shownStashed = pm.shown.filter((e) => e && !e._retry);
    // WHY THEY WAITED (R4): the held kinds of everything this frame carries, ONE sentence on the card's head
    const why = S.heldWhyOf([...pm.shown.map((e) => S.heldKeyOf(e && e.held)), ...jobs.map((n) => S.heldKeyOf(n && n.held))].filter(Boolean));   // verify r2: a may-have-landed entry names a possible repeat
    // >2 job results: the untruncated history goes to the read file too (the injection's rule) — an elided middle points at it
    let spillPath = null;
    if (jobs.length > 2 && jm && typeof jm.spillNotifs === 'function') { try { spillPath = jm.spillNotifs(cid, jobs) || null; } catch { spillPath = null; } }
    const jobsText = jobs.length ? renderNotifStash(jobs, { budget: 4096, spillPath }) : '';
    const text = [pm.text, jobsText].filter(Boolean).join('\n\n');
    if (!text) return { ok: false, code: 'nothing_waiting', error: 'nothing is waiting for this conversation' };
    const n = pm.shown.length + (jobsText ? jobs.length : 0);
    const held = pm.rest.length;
    // THE CLAIM: what this hand-over is about to deliver is spoken for — the injection's full drain leaves it; the
    // stamp is on disk in both stores before the post leaves (verify r2)
    const releases = [];
    if (shownStashed.length && typeof d.claimStash === 'function') releases.push(d.claimStash(cid, shownStashed, id));
    if (shownParked.length && typeof d.claimRetry === 'function') releases.push(d.claimRetry(cid, shownParked, id));   // the park's timer skips a claimed entry
    if (jobsText && jm && typeof jm.claimNotifs === 'function') releases.push(jm.claimNotifs(cid, jobs, id));
    return { ok: true, d, jm, text, n, held, why, pm, shownStashed, shownParked, jobs, jobsText, releases };
  }
  /** The ladder answered `r` for `frame`: a refusal answers by name (the stash exactly as it was); a delivery drains exactly
   *  what went out and remembers the frame. The CALLER spells its own ladder call — the reason literal on that very line (the
   *  spend census pairs a site with the literal it reads there) — and releases the claims in its `finally`. */
  async function finishHandOver(cid, id, prep, frame, r) {   // (async — the census cure's finding 11: its reply may wait for the drained notices' landing)
    const { d, jm, held, shownStashed, shownParked, jobs, jobsText } = prep;
    {
      if (!r || !r.ok) {
        if (r && r.refused === 'spend') return { ok: false, code: 'spend_refused', id, error: r.reason || 'the spend ceiling refused this turn', why: r.why || null, retryAfter: r.retryAfter || 0, identity: r.identity || null, cap: r.cap == null ? null : r.cap, ...(r.capUnset ? { capUnset: true } : {}) };
        if (r && (r.refused === 'wrapper-no-steer' || r.refused === 'no-wake')) return { ok: false, code: 'held_for_next_turn', id, error: r.reason || 'held for the conversation’s next prompt' };
        if (r && r.code === 'inbox_not_open') return { ok: false, code: 'inbox_not_open', id, error: r.reason || 'its inbox did not open on its machine' };
        if (r && r.code === 'registry_unread') return { ok: false, code: 'registry_unread', id, error: r.reason || 'its machine could not read its conversations\' registry' };   // B-95fc follow-up: said by name   // B-95fc U2: the machine's wait ran out (nothing posted, nothing charged)
        return { ok: false, code: 'unreachable', id, error: (r && r.reason) || 'the agent could not be reached — the notices keep waiting for its next turn', phase: (r && r.phase) || null, unanswered: !!(r && r.unanswered) };   // B-6721: a frame written before a timeout, or a device's post sent and never answered, may have landed
      }
      // DELIVERED: take exactly what went out; what arrived meanwhile keeps waiting
      const tookStashed = shownStashed.length ? d.drainStash(cid, new Set(shownStashed)) : [];
      // R4 (lane owner-press-attended): a channel block a refused wake left here reached the agent — its row's «last wake
      // held» clears now (the channels engine stamps that wake `handedOverAt`), not at the rule's next successful wake
      try { const ch = getChannels(); if (ch && typeof ch.noteHandedOver === 'function') ch.noteHandedOver(cid, tookStashed).catch((e) => log.warn?.(`[stash] ${cid}: the channels row could not take the hand-over — ${(e && e.message) || e}`)); } catch { }
      // a parked entry leaves the park (its hold given back — this hand-over billed its own turn) and is remembered as
      // a plain entry: a frame that comes back restores it as a WAITING notice, never as one still being retried
      const tookParked = shownParked.length && typeof d.retryTake === 'function' ? d.retryTake(cid, new Set(shownParked), { via: 'hand-over', lane: r.lane || null }).map((e) => ({ source: 'agent', kind: e.kind, fromName: e.fromName || null, text: e.text, ts: e.firstAt, held: { kind: 'not-reachable', attempts: (e.attempts || []).length } })) : [];
      const tookMsg = [...tookParked, ...tookStashed];
      const tookJobs = jobsText && jm ? jm.drainNotifs(cid, new Set(jobs)) : [];
      if (tookJobs.length && jm && typeof jm.noteHandedOver === 'function') { try { jm.noteHandedOver(cid, frame); } catch { } }   // B-6721: the engine's 30 s floor counts this delivery
      // the exact frame the ladder wrote (headed as a notification) — the wrapper echoes it verbatim, and equality is
      // what makes a frame OURS (verify r3: a tag alone is a string a peer can write)
      delivered.set(id, { cid, msg: tookMsg, jobs: tookJobs, at: now(), text: vibespaceNoticeText(frame) });
      // "CLEAR CONTENT…" (lane-redact verify r3, reproduced): a clear that landed WHILE the post was on its way rewrote
      // these very entries in their stores (both doors ran before this record existed, so `redactDelivered` had nothing
      // to touch) — yet the frame the ladder wrote still carried the words. An entry that reads the sentence now was
      // cleared mid-flight: the record keeps the frame's DIGEST only (the echo is still recognised — `sameFrame`).
      if (readsCleared(tookMsg, tookJobs)) {
        const rec = delivered.get(id);
        rec.textSha = frameSha(rec.text); delete rec.text;
        log.log?.(`[stash] ${cid}: hand-over ${id} was on its way when a clear reached its entries — the frame is remembered by its digest only (the words it carried reached the agent as a turn)`);
      }
      forget();
      // THE HAND-OVER HOLDS ITS RECORD OF DELIVERY AND ITS REPLY BEHIND THE DRAIN'S LANDING (the census cure's hunt, finding 11 —
      // 主开发 19:44Z): the job notices it drained are not on disk at the writer's bound ⇒ the reply waits for them (bounded); still
      // not ⇒ the reply says so (finishes-on-landing) and the record of delivery is written at their landing — never «delivered»
      // over a drain the disk does not hold (a kill would hand the same notices over again)
      const out = { ok: true, id, delivered: tookMsg.length + tookJobs.length, held, lane: r.lane || null, steered: r.steered === true, remaining: S.summarize(entriesOf(cid)) };
      if (tookJobs.length && tookJobs.landed === false && typeof jm.whenNotifsLanded === 'function') {
        // the writer's own bound answers; a timer of our own beside it (a writer that never answers a bound never holds the reply for good;
        // NOT unref'd: the reply is awaited — an unref'd timer let a process with nothing else alive end with the hand-over unanswered)
        let raceT = null, L = null;   // (the move check's small 2 + its read's should: our own timer is cleared however the race ends — a landing, a bound, a rejection)
        try { L = await Promise.race([jm.whenNotifsLanded({ timeoutMs: handoverLandMs }), new Promise((r) => { raceT = setTimeout(() => r({ landed: false }), handoverLandMs + 50); })]); }
        catch { L = { landed: false }; }
        finally { if (raceT) clearTimeout(raceT); }
        // (small 3: the record of delivery made at the landing is tried as its sibling is — a throw there never rejects a hand-over already posted and drained)
        if (!(L && L.landed)) { try { jm.afterNotifsLanded(() => { persistDelivered(); changed(); }); } catch (e) { log.warn?.(`[stash] ${cid}: hand-over ${id}'s record of delivery could not wait for the notices' landing: ${(e && e.message) || e}`); } return { ...out, notOnDisk: true, code: 'finishes-on-landing' }; }
      }
      persistDelivered();
      changed();
      return out;
    }
  }

  async function handOverNow(s, cid, id, { auto = false, pressed = null } = {}) {
    const prep = prepareHandOver(cid, id);
    if (!prep.ok) return prep;
    const { text, n } = prep;
    // R3 (lane notify-retry): the AUTO hand-over runs at a turn end for what that prompt's context could not carry —
    // its own declared reason, spelled literally beside the user's (the spend census reads the literal)
    const frame = auto === 'reachable'   // B-6721: the conversation can take them now — everything the stash holds (a hand-over carries all)
      ? `VibeSpace delivers the ${n} notice(s) that were waiting for this conversation (hand-over ${id}):\n\n${text}`
      : auto
      ? `VibeSpace delivers the ${n} notice(s) that did not fit your previous prompt's context (hand-over ${id}):\n\n${text}`
      : `The user handed over the ${n} notice(s) that were waiting for your next turn (hand-over ${id}):\n\n${text}`;
    // r2: the ATTENDED reason only on the door's press (write-origin isPress) — a hand-over nobody pressed is the gated twin
    const { d } = prep;
    try {
      let r = null;
      const cardText = S.handoverCardText(n, text, { why: prep.why });   // 2026-09-28: the card carries the notices behind an expander (handoverFacts), not the count alone; R4: its head says why they waited
      try {
        r = auto === 'reachable'   // B-6721: the wake of a conversation that can take its notices now — its own declared reason
          ? await d.deliverToConversation(cid, frame, { kind: 'notification', spendReason: 'stash-reachable', fromName: FROM_NAME, cardText })
          : !isPress(pressed)
          ? await d.deliverToConversation(cid, frame, { kind: 'notification', spendReason: 'stash-retry', fromName: FROM_NAME, cardText })
          : await d.deliverToConversation(cid, frame, { kind: 'notification', spendReason: 'stash-handover', fromName: FROM_NAME, cardText });
      } catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
      return await finishHandOver(cid, id, prep, frame, r);   // awaited INSIDE the try: the claims are released only after the drain's landing wait
    } finally {
      for (const rel of prep.releases) { try { rel(); } catch { } }
    }
  }
  // ── THE HAND-OVER OF A RESUMED CONVERSATION (the manager design's piece 7, lane paced-wake-retry) ─────────────────────────
  // A delivery found its addressee ENDED and the gate admitted its wake: the waiting entries are CLAIMED first (before the
  // resume, so the resume's own start injection — SessionStart's drain — leaves them), then the conversation is resumed (it sends
  // nothing), then ONE hand-over posts everything waiting as ONE message under the DELIVERY's own reason (the charging call
  // holds: the ladder authorizes it as the turn it is), ending with the design's sentence. Exactly once across a hub restart by
  // the claim's own construction (the stamp is released at boot; the park offers the wake to the line again).
  /** → {ok:true, id, prep} — the claim taken | {ok:false, code, error} (nothing waiting, a hand-over in flight, restarting).
   *  `bare`: a wake whose words live OUTSIDE the stash (a peer's message with a wake: the GROUP LOG holds it, and the groups
   *  engine's report rides the prompt hook of whatever turn starts next — lane stash-any-turn): with nothing stashed the claim
   *  is still taken, empty, so the hand-over posts the ONE frame that starts that turn (one turn, one charge — the report is
   *  never copied into the frame: it would arrive twice). */
  function claimForWake(cid, { bare = false } = {}) {
    if (!cid) return { ok: false, code: 'no_conversation', error: 'no conversation' };
    if (closed) return { ok: false, code: 'restarting', error: 'the server is restarting — the notices keep waiting' };
    const cur = inflight.get(cid);
    if (cur) return { ok: false, code: 'in_flight', error: `a hand-over for this conversation is already in progress (${cur.id})`, id: cur.id };
    const id = mint();
    let prep = prepareHandOver(cid, id);
    if (!prep.ok && prep.code === 'nothing_waiting' && bare) prep = { ok: true, d: getDeliver(), jm: jobsReady(), text: '', n: 0, held: 0, why: null, pm: { text: '', shown: [], rest: [] }, shownStashed: [], shownParked: [], jobs: [], jobsText: '', releases: [], bare: true };
    if (!prep.ok) return prep;
    inflight.set(cid, { id, at: now(), p: null });
    changed();
    return { ok: true, id, prep };
  }
  /** After the resume: the claimed frame, under the delivery's reason ('job-notification' | 'peer-message' — each spelled as a
   *  literal for the spend census), with the design's last sentence. → handOver's own answers. */
  async function handOverWake(cid, claimed, { reason, tail = '', lead = '', from = null, card = null, inboxWaitMs = 0 } = {}) {
    if (!claimed || !claimed.ok) return { ok: false, code: 'no_claim', error: 'nothing was claimed' };
    const { id, prep } = claimed;
    let doneP = null;
    const cur0 = inflight.get(cid);
    if (cur0 && cur0.id === id) cur0.p = new Promise((res) => { doneP = res; });   // a graceful stop (settle) waits for this hand-over
    // a BARE claim (nothing stashed: a peer's wake whose words are in the group log) says why it was resumed; the group
    // messages themselves come in this turn's own report
    const frame = prep.bare
      ? `This conversation had been ended. VibeSpace resumed it (hand-over ${id}): ${agentText(String(lead || 'a message was sent to it with a wake'), { kind: 'line', max: 300 })} — the messages waiting for it are in this turn's group report.${tail ? '\n\n' + tail : ''}`   // the lead names a peer and a group: belted
      : `This conversation had been ended. VibeSpace resumed it to hand you the ${prep.n} notice(s) that were waiting (hand-over ${id}):\n\n${prep.text}${tail ? '\n\n' + tail : ''}`;
    const { d } = prep;
    try {
      let r = null;
      const cardText = prep.bare ? String(card || lead || '') : S.handoverCardText(prep.n, prep.text, { why: prep.why });
      const fromName = (prep.bare && from) || FROM_NAME;   // a bare wake's card is the message that woke it (the design: «shows the … message card that woke it»)
      try {
        const wait = Number.isFinite(inboxWaitMs) && inboxWaitMs > 0 ? { inboxWaitMs } : {};   // B-95fc U2: a conversation resumed on a paired machine — that machine waits for its inbox
        r = reason === 'peer-message'
          ? await d.deliverToConversation(cid, frame, { kind: 'notification', spendReason: 'peer-message', fromName, cardText, ...wait })
          : await d.deliverToConversation(cid, frame, { kind: 'notification', spendReason: 'job-notification', fromName, cardText, ...wait });
      } catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
      return await finishHandOver(cid, id, prep, frame, r);   // awaited INSIDE the try: the claims are released only after the drain's landing wait
    } finally {
      for (const rel of prep.releases) { try { rel(); } catch { } }
      const cur = inflight.get(cid); if (cur && cur.id === id) inflight.delete(cid);
      if (doneP) doneP();
      changed();
    }
  }
  /** A refused gate or a failed resume: the claim is given back untouched — the words keep waiting. */
  function releaseWake(cid, claimed) {
    if (!claimed || !claimed.ok) return;
    for (const rel of claimed.prep.releases) { try { rel(); } catch { } }
    const cur = inflight.get(cid); if (cur && cur.id === claimed.id) inflight.delete(cid);
    changed();
  }
  /** A delivered frame came back undelivered (the wrapper's `ok:false`): if its text names a hand-over this hub
   *  remembers, put the ORIGINAL entries back in their own stores — returns how many; 0 = not ours (the caller stashes
   *  the frame as itself). `meta.kind` = the PATH the wrapper echoes for the frame (`kind` / `peerKind`): a frame that
   *  went as a PEER's message is never a hand-over, whatever its text (verify r4 — the belt under text equality: an
   *  agent can quote the whole frame, verbatim, to a peer); an older wrapper echoes none (null = not judged). */
  function restoreHandedOver(cid, text, meta = {}) {
    const echoed = String(text || '');
    const m = HANDOVER_TAG_RE.exec(echoed);
    if (!m) return 0;
    if (meta && meta.kind === 'peer') { log.log?.(`[stash] ${cid}: a PEER frame names hand-over ${m[1]} — stashed as itself`); return 0; }
    const rec = delivered.get(m[1]);
    if (!rec) { log.log?.(`[stash] ${cid}: a frame names hand-over ${m[1]}, which this hub no longer remembers (forgotten, or delivered before a boot that lost the memory) — kept as one notice`); return 0; }   // verify r5: never silent
    if (rec.cid !== cid) return 0;
    // THE FRAME IS OURS ONLY WHEN IT IS THE FRAME (verify r3): the tag is a string any peer can write into a message
    // of its own; the echoed text must be the one the ladder wrote for this id, whole
    if (!sameFrame(rec, echoed)) { log.log?.(`[stash] ${cid}: a frame names hand-over ${m[1]} but is not its text — stashed as itself`); return 0; }
    // the same frame echoed twice (a Stop AND a queue removal both report it): restored once, the second echo is
    // handled (never a blob of the copy) — the record stays, marked, until its TTL
    if (rec.restored) { log.log?.(`[stash] ${cid}: hand-over ${m[1]} echoed again — already restored (${rec.restored})`); return rec.restored; }
    let k = 0;
    const d = getDeliver();
    if (rec.msg.length && d && typeof d.restoreStash === 'function') k += d.restoreStash(cid, rec.msg);
    const jm = jobsReady();
    if (rec.jobs.length && jm && typeof jm.restoreNotifs === 'function') k += jm.restoreNotifs(cid, rec.jobs);
    rec.restored = k || -1; rec.msg = [];   // spent: the ladder's originals are back in its store (written at once)
    keepUntilLanded(rec, jm);
    persistDelivered();
    log.log?.(`[stash] ${cid}: hand-over ${m[1]} came back undelivered — ${k} entr${k === 1 ? 'y' : 'ies'} restored, each as itself`);
    changed();
    // nothing to restore (the cap evicted every original while the post was on its way): the FIRST echo answers 0 so
    // the caller keeps the frame as one notice rather than dropping it; a second echo is handled (-1)
    return k;
  }
  /** B-02a3 — HAND THE GROUP MESSAGES TO THE RUNNING TURN (主开发's ruling (1), 2026-11-18). A person's press, only while the
   *  agent is mid-turn: the groups engine's own next-turn report for this member (`reportsForTurn`, aside — the echo guard's
   *  words), headed as handed-over group messages (never the person's words) through the one belt for a peer's text, goes to
   *  the running turn by the road an Enter takes (THE typing path, origin 'group-handover' — it refuses, writing nothing,
   *  when no turn runs, a Stop is settling, or this conversation's Enter does not hand a message to its running turn). It is
   *  SETTLED AS RECEIVED (`commitReports`: the marks move, the cards draw) only when the wrapper says it was handed — its
   *  `input_handover handed` with no message ids (the frame carries none; claude-stream-json reads it into
   *  `session._groupHandover`); no word ⇒ the marks stay and the messages ride the next turn as before. The spend authorizer
   *  is asked first under the attended reason: in the one edge where the turn was already finishing, the CLI runs the
   *  frame right after it as a turn of its own (what an Enter does then) — a person's turn, the attended tally, never the
   *  unattended caps. An idle agent keeps today's words: no press starts a turn. */
  const groupInflight = new Map();   // cid → {id, at}
  let unwiredSaid = false;
  async function handOverGroups(webuiId, { pressed = null } = {}) {
    const s = activeSessions && activeSessions.get(String(webuiId));
    if (!s) return { ok: false, code: 'no_session', error: 'no such live session' };
    const cid = addressableId(s);
    if (!cid) return { ok: false, code: 'no_conversation', error: 'this session has no conversation yet' };
    if (closed) return { ok: false, code: 'restarting', error: 'the server is restarting — the group messages keep waiting for the agent’s next turn' };
    if (!isPress(pressed)) return { ok: false, code: 'not_a_person', error: 'the group hand-over is a person’s press' };
    const cur = groupInflight.get(cid);
    if (cur) return { ok: false, code: 'in_flight', error: `a group hand-over for this conversation is already in progress (${cur.id})`, id: cur.id, since: cur.at };
    const waiting = s._groupHandover && s._groupHandover.state === null && now() - s._groupHandover.at < GROUP_LATE_MS ? s._groupHandover : null;   // r1 should 4: one hand-over at a time, until its word or its minute
    if (waiting) return { ok: false, code: 'awaiting_word', error: `the last group hand-over (${waiting.id}) still waits for the agent's word — the group messages keep waiting`, id: waiting.id, since: waiting.at, retryAfter: Math.max(1000, GROUP_LATE_MS - (now() - waiting.at)) };
    if (s.host) return { ok: false, code: 'not_steerable', error: 'this conversation runs on another machine — the group messages ride its next turn' };   // r1 should 6: a remote wrapper's door is not read here
    const ge = getGroups();
    const sendUserInput = getSendUserInput();   // THE typing path (the spend census's typed-send primitive: this site is gated by the authorizer below)
    if (!ge || typeof ge.reportsForTurn !== 'function' || typeof ge.commitReports !== 'function' || typeof sendUserInput !== 'function') return { ok: false, code: 'unavailable', error: 'the groups engine or the typing path is not wired on this instance' };
    const id = `gh-${now().toString(36)}-${(++seq).toString(36)}`;
    groupInflight.set(cid, { id, at: now() });
    changed();
    try {
      let rep = null;
      try { rep = ge.reportsForTurn(cid, { budget: GROUP_HANDOVER_BYTES, aside: true }); } catch (e) { rep = null; log.warn?.(`[stash] ${cid}: the group report could not be composed — ${(e && e.message) || e}`); }
      const marks = rep && Array.isArray(rep.marks) ? rep.marks : [];
      if (!rep || !rep.text) return { ok: false, code: 'nothing_waiting', error: 'no group message is waiting for this conversation' };
      if (!marks.length) return { ok: false, code: 'too_long', error: 'the waiting group messages do not fit one hand-over — they ride the next turn' };   // r1 note: nothing fit the budget
      const n = marks.reduce((a, m) => a + (m && Array.isArray(m.cards) ? m.cards.length : 0), 0);
      // THE MONEY (the ruling): asked BEFORE the frame leaves, under the attended reason — a refusal writes nothing
      const spendGuard = getSpendGuard();
      let v = null;
      const ask = { spendReason: 'group-handover', session: s, cid };   // the ATTENDED site (scripts/test-spend-paths §2b reads the literal; the press guard above fences it)
      try { v = spendGuard && typeof spendGuard.authorize === 'function' ? spendGuard.authorize({ reason: ask.spendReason, session: s, cid }) : null; }
      catch (e) { return { ok: false, code: 'spend_refused', id, error: 'the spend authorizer failed: ' + ((e && e.message) || e) }; }   // fail closed
      if (!v && !unwiredSaid) { unwiredSaid = true; log.warn?.('[stash] the group hand-over has no spend guard wired (getSpendGuard) — every press is refused until the hub passes one'); }
      if (!v || v.ok === false) return { ok: false, code: 'spend_refused', id, error: v ? `the spend ceiling refused this turn${v.why ? ` (${String(v.why).slice(0, 40)})` : ''}` : 'the spend authorizer is not wired', why: (v && v.why) || null, retryAfter: (v && v.retryAfter) || 0, identity: v && v.identity ? { key: v.identity.key, name: v.identity.name || v.identity.key } : null };
      const frame = agentText(`The user handed over, into this turn, the group messages that were waiting for your next turn (group hand-over ${id}). They are messages posted in your groups — not words the user typed to you here:\n\n${rep.text}`, { kind: 'block', max: GROUP_HANDOVER_BYTES + 1024 });
      // the wrapper's word, read by claude-stream-json off `input_handover` records with no message ids (only this frame has none)
      let sayHanded = null;
      const handed = new Promise((res) => { sayHanded = res; });
      const pend = { id, at: now(), state: null, said(state) {
        if (state === 'handed' && !pend.state) { pend.state = 'handed'; ge.commitReports(cid, marks).then(() => changed(), (e) => log.warn?.(`[stash] ${cid}: group hand-over ${id} was handed but its marks could not be committed — ${(e && e.message) || e} (the messages may ride the next turn again)`)); sayHanded('handed'); return; }
        if (state === 'own-turn' && pend.state === 'handed') { pend.state = 'own-turn'; try { if (spendGuard && typeof spendGuard.note === 'function') spendGuard.note({ reason: ask.spendReason, session: s, identity: v.identity || null, hold: v.hold || null }); } catch (e) { log.warn?.(`[stash] ${cid}: the attended turn of group hand-over ${id} was not tallied — ${(e && e.message) || e}`); } }
        if (state === 'own-turn' || state === 'landed' || state === 'kept') { if (s._groupHandover === pend) s._groupHandover = null; }
      } };
      s._groupHandover = pend;
      schedule(() => { if (s._groupHandover === pend) s._groupHandover = null; }, GROUP_LATE_MS);   // a word later than this settles nothing
      const r = sendUserInput(String(webuiId), frame, { origin: 'group-handover', steer: true });   // its door: the running turn (the typing path writes it only there)
      if (!r || !r.ok) {
        if (s._groupHandover === pend) s._groupHandover = null;
        return { ok: false, code: (r && ['not_mid_turn', 'not_steerable', 'stopping'].includes(r.code)) ? r.code : 'unreachable', id, error: (r && r.error) || 'the agent could not be reached — the group messages keep waiting for its next turn' };
      }
      const word = await Promise.race([handed, new Promise((res) => schedule(() => res(null), groupHandedWaitMs))]);
      if (word !== 'handed') return { ok: false, code: 'unconfirmed', id, error: `the agent did not say it took the group messages within ${Math.round(groupHandedWaitMs / 1000)} s — they stay waiting for its next turn (a later word still settles them)` };
      log.log?.(`[stash] ${cid}: ${n} group message(s) handed to the running turn (group hand-over ${id})`);
      return { ok: true, id, delivered: n, lane: 'steer' };
    } finally {
      groupInflight.delete(cid);
      changed();
    }
  }
  /** 「刷新所有活着的会话」 (lane refresh-live-sessions): ONE note into every LIVE conversation's next turn, through the
   *  stash — the next-turn door the browser handback uses: free, never a wake, never the spend guard. The plan is PURE
   *  (src/refresh-note.js) over this server's live sessions plus `others` — the stopped / read-only conversations the
   *  pressing client has open, which it can only SKIP (a client never makes a conversation live; they are counted).
   *  An earlier press's note still waiting is replaced, never doubled: the new one is stored first, then the old one
   *  is taken out by identity (a failed write loses neither). → `{ok, queued, replaced, skipped, failed, ids}` | refusal. */
  function refreshLive(note, { others = [] } = {}) {
    if (closed) return { ok: false, code: 'restarting', error: 'the server is restarting — nothing was queued' };
    const d = getDeliver();
    if (!d || typeof d.stashFor !== 'function' || typeof d.stashEntries !== 'function') return { ok: false, code: 'unavailable', error: 'the delivery ladder is not ready' };
    const waitingOf = (cid) => { try { return d.stashEntries(cid).filter((e) => RN.isRefreshEntry(e) && !e.ho); } catch { return []; } };
    const rows = [];
    for (const [id, s] of activeSessions) {
      if (!s || s.isTmuxView) continue;   // a tmux view is its session's second face, never a conversation of its own
      const cid = addressableId(s);
      rows.push({ id, conversationId: cid, state: 'live', queued: !!cid && waitingOf(cid).length > 0 });
    }
    for (const o of (Array.isArray(others) ? others : []).slice(0, 200)) {
      const cid = o && typeof o.conversationId === 'string' ? o.conversationId.slice(0, 200) : '';
      if (cid) rows.push({ id: 'open:' + cid, conversationId: cid, state: o.state === 'read-only' ? 'read-only' : 'stopped' });
    }
    const plan = RN.refreshPlan(rows, note);
    if (plan.error) return { ok: false, code: plan.error === 'empty' ? 'empty_note' : 'note_too_long', error: plan.error === 'empty' ? 'the note is empty' : `the note is longer than ${RN.REFRESH_NOTE_MAX} characters` };
    const cidOfRow = new Map(rows.map((r) => [r.id, r.conversationId]));
    const text = agentText(plan.text, { kind: 'block', max: RN.REFRESH_NOTE_MAX });
    const ids = [];
    let replaced = 0, failed = 0;
    for (const id of plan.queue) {
      const cid = cidOfRow.get(id);
      const old = waitingOf(cid);
      try { d.stashFor(cid, { source: 'agent', kind: 'notification', fromName: RN.REFRESH_FROM, ref: RN.REFRESH_REF, text }); }
      catch (e) { failed++; log.warn?.(`[stash] refresh note for ${id} not queued — ${(e && e.message) || e}`); continue; }
      if (old.length) { try { d.drainStash(cid, new Set(old)); replaced++; } catch (e) { log.warn?.(`[stash] the earlier refresh note for ${id} could not be taken out — ${(e && e.message) || e}`); } }
      ids.push(id);
    }
    log.log?.(`[stash] refresh note queued for ${ids.length} live conversation(s) (${replaced} replaced, ${plan.skipped.length} skipped, ${failed} failed)`);
    return { ok: true, queued: ids.length, replaced, skipped: plan.skipped.length, failed, ids };
  }

  /** Shutdown: wait (bounded) for every hand-over in flight — a SIGTERM restart is then exactly-once by construction
   *  (the drain after a delivery is on disk before the process exits). */
  /** Shutdown, step one: no hand-over starts from here on (a press during the wait below would be one nobody
   *  waited for — verify r3). Idempotent; `settle()` is step two. */
  function close() { closed = true; }
  function settle(maxMs = 5000) {
    const ps = [...inflight.values()].map((r) => r.p).filter(Boolean);
    if (!ps.length) return Promise.resolve(0);
    return Promise.race([Promise.allSettled(ps).then(() => ps.length), new Promise((res) => { const t = setTimeout(() => res(-ps.length), maxMs); if (t.unref) t.unref(); })]);
  }

  // R4 (lane owner-press-attended — userW's five presses left three journal lines, and a refusal that was not the spend
  // ceiling left none): a PRESS the hand-over refused for any other reason is said ONCE per (conversation, code) per
  // 5 min in the journal — with how many the window swallowed — and counted in telemetry every time, like the spend one
  // (that one is spend-guard's: `[spend] refused …`, event `spend-refused`). r4 (accept-r3 confirmed 0): a spend refusal
  // with NO `why` is the authorizer's own failure — spend-guard wrote no line for it, so this one does (the toast names it)
  const REFUSAL_LOG_MS = 5 * 60 * 1000;
  const refusalSpoke = new Map();   // `${cid}|${code}` -> {at, more}
  function noteRefusal(webuiId, r) {
    if (!r || r.ok || (r.code === 'spend_refused' && r.why)) return;
    try { global.__vsEvent?.('stash-handover-refused', String(r.code || 'failed')); } catch { }
    const s = activeSessions && activeSessions.get(String(webuiId));
    const conv = cidOf(s) || String(webuiId);
    const sig = conv + '|' + r.code;
    const t0 = now();
    const last = refusalSpoke.get(sig) || { at: 0, more: 0 };
    if (last.at && t0 - last.at <= REFUSAL_LOG_MS) { last.more++; return; }
    refusalSpoke.set(sig, { at: t0, more: 0 });
    if (refusalSpoke.size > 400) refusalSpoke.clear();
    log.log?.(`[stash] hand-over refused for conversation ${conv} — ${r.code}: ${r.error || 'no reason given'}${last.more ? ` (+${last.more} more in the 5 min after the previous line)` : ''}`);
  }

  function register(app) {
    app.post('/api/sessions/:id/stash/hand-over', async (req, res) => {
      try {
        if (pressBearer(req.headers)) return res.status(403).json({ error: 'the user’s hand-over — not an agent route', code: 'agent_forbidden' });
        // r2: AN ATTENDED DOOR IS A PERSON'S DOOR — the press is minted for a person on this page only; a header-less script is
        // refused by name (its only effect here would be the press)
        const press = pressOf(req);
        if (!press) return res.status(403).json({ error: 'the hand-over is a press on this instance’s own page — a request with no page (a script) cannot make one', code: 'not_a_person' });
        const r = await handOver(String(req.params.id), { pressed: press });
        if (!r.ok) {
          noteRefusal(String(req.params.id), r);
          if (r.retryAfter) res.setHeader('Retry-After', String(Math.max(1, Math.ceil(Number(r.retryAfter) / 1000) || 1)));
          return res.status(STATUS[r.code] || 400).json(r);
        }
        res.json(r);
      } catch (e) { res.status(500).json({ error: (e && e.message) || String(e) }); }
    });
    // B-02a3: the group hand-over — the hand-over's own press checks (no bearer, a person's page)
    app.post('/api/sessions/:id/stash/hand-over-groups', async (req, res) => {
      try {
        if (pressBearer(req.headers)) return res.status(403).json({ error: 'the user’s hand-over — not an agent route', code: 'agent_forbidden' });
        const press = pressOf(req);
        if (!press) return res.status(403).json({ error: 'the hand-over is a press on this instance’s own page — a request with no page (a script) cannot make one', code: 'not_a_person' });
        const r = await handOverGroups(String(req.params.id), { pressed: press });
        if (!r.ok) {
          noteRefusal(String(req.params.id), r);
          if (r.retryAfter) res.setHeader('Retry-After', String(Math.max(1, Math.ceil(Number(r.retryAfter) / 1000) || 1)));
          return res.status(STATUS[r.code] || 400).json(r);
        }
        res.json(r);
      } catch (e) { res.status(500).json({ error: (e && e.message) || String(e) }); }
    });
    // lane refresh-live-sessions: the user's 「刷新所有活着的会话」 — cookie only, like the hand-over (an agent never queues
    // a note into every conversation); body `{ text, others: [{conversationId, state}] }`
    app.post('/api/sessions/refresh-note', (req, res) => {
      try {
        if (isAgentBearer(req)) return res.status(403).json({ error: 'the user’s refresh — not an agent route', code: 'agent_forbidden' });
        const b = req.body || {};
        const r = refreshLive(b.text, { others: b.others });
        if (!r.ok) return res.status(STATUS[r.code] || 400).json(r);
        res.json(r);
      } catch (e) { res.status(500).json({ error: (e && e.message) || String(e) }); }
    });
  }

  armOwedWakes(1);   // B-6721: AT BOOT — what a stopped hub left owed a wake is looked at from the 30 s step (restored sessions attach first)
  /** B-f276 1a: the park's ONE door, asked by the resume line's start (a producer held while the wake waited in the line) */
  function heldWhyOfWake(entry) { const d = getDeliver(); return d && typeof d.heldWhyOf === 'function' ? d.heldWhyOf(entry) : null; }
  return { waitingAll, summaryFor, billedFor, reachableFor, changed, handOver, heldWhyOfWake, claimForWake, handOverWake, releaseWake, handOverGroups, groupInFlight: (cid) => groupInflight.has(cid), refreshLive, register, entriesOf, restoreHandedOver, redactDelivered, close, settle, isClosed: () => closed, inFlight: (cid) => inflight.has(cid), inFlightCount: () => inflight.size, _delivered: delivered };
}

module.exports = { create, STATUS, FROM_NAME, HANDOVER_MAX_ENTRIES, HANDOVER_MAX_BYTES, HANDOVER_TAG_RE, DELIVERED_TTL_MS, DELIVERED_MAX, DELIVERED_FILE, GROUP_HANDOVER_BYTES, GROUP_HANDED_WAIT_MS, GROUP_LATE_MS };
