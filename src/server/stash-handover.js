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
/** The name the hand-over speaks under — a VibeSpace notification SENDER (src/notification-senders.js lists it). */
const FROM_NAME = 'VibeSpace notices';

const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
const HANDOVER_MAX_ENTRIES = 30;       // conversation-deliver's STASH_CAP — every entry in one message
const HANDOVER_MAX_BYTES = 12 * 1024;
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
const STATUS = Object.freeze({ agent_forbidden: 403, no_session: 404, no_conversation: 409, nothing_waiting: 409, in_flight: 409, held_for_next_turn: 409, spend_refused: 429, unreachable: 409, unavailable: 503, restarting: 503 });

function create({ activeSessions, getDeliver = () => null, getJobs = () => null, getGroups = () => null, broadcastSessions = () => {}, renderMsgStash, renderNotifStash, log = console, debounceMs = 300, now = () => Date.now(), schedule = (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; }, dataDir = null } = {}) {
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
   *  They live in the engine, not in a stash: a hand-over never carries them (they ride the next turn, whoever starts it — lane stash-any-turn). */
  function groupEntriesOf(s) {
    try {
      const ge = getGroups();
      const cid = addressableId(s);   // a pending fork carries its parent's id — its strip is not the parent's
      if (!cid || !ge || typeof ge.reportsForTurn !== 'function') return [];
      const pv = ge.reportsForTurn(cid, { preview: true });
      return ((pv && Array.isArray(pv.pending)) ? pv.pending : []).map(GC.pendingEntry).filter(Boolean);
    } catch (e) { log.warn?.(`[stash] group preview failed: ${(e && e.message) || e}`); return []; }
  }
  /** The `stash` session fact (null = nothing waits); `billed` = the strip's "starts a turn"; `inFlight` = a hand-over
   *  is on its way (another client's click); `held` = what one hand-over would leave; `reachable` = a hand-over exists
   *  AND has something to carry (lane group-report-card: group messages alone are not handed over — no button). */
  function summaryFor(s) {
    const cid = cidOf(s);
    if (!cid) return null;
    try {
      const both = entriesOf(cid);
      const groups = groupEntriesOf(s);
      const sum = S.summarize({ msg: [...both.retry, ...both.msg, ...groups], jobs: both.jobs });
      const d = getDeliver();
      return sum ? { ...sum, billed: billedFor(s), inFlight: inflight.has(cid), held: heldOf([...both.retry, ...both.msg]), reachable: reachableFor(s) && (both.msg.length + both.jobs.length + both.retry.length) > 0, ...(d && typeof d.handoverArmed === 'function' && d.handoverArmed(cid) ? { armed: true } : {}) } : null;
    } catch (e) { log.warn?.(`[stash] summary failed: ${(e && e.message) || e}`); return null; }
  }

  // THE ARMED HAND-OVER RUNS AT THE TURN END (R3): the ladder says a turn ended; if the injection armed a hand-over for
  // this conversation (its notices did not fit the prompt), it runs now as ONE message under 'stash-retry' — unless a
  // post landed within the ladder's floor, in which case it waits the floor out and re-checks (idle, live, something
  // still waiting; a turn running again re-arms for its own end). Refusals are logged; the stash is untouched.
  function widOf(cid) { try { for (const [wid, x] of activeSessions) if (cidOf(x) === cid) return wid; } catch { } return null; }
  async function runArmed(cid, why, deferred = false) {
    const d = getDeliver();
    const wid = widOf(cid);
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

  let timer = null;
  /** A store changed: re-publish the session list once per burst. */
  function changed() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; try { broadcastSessions(); } catch (e) { log.warn?.(`[stash] re-publish failed: ${(e && e.message) || e}`); } }, debounceMs);
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
    for (const [id, rec] of delivered) if (rec.at < cut) { delivered.delete(id); n++; }
    if (delivered.size > DELIVERED_MAX) for (const [id, rec] of delivered) { if (delivered.size <= DELIVERED_MAX) break; if (rec.restored) { delivered.delete(id); n++; } }
    while (delivered.size > DELIVERED_MAX) {
      const id = delivered.keys().next().value; const rec = delivered.get(id);
      delivered.delete(id); n++;
      log.warn?.(`[stash] hand-over ${id} (${rec && rec.cid}, ${(rec && (rec.msg.length + rec.jobs.length)) || 0} originals) forgotten by the ${DELIVERED_MAX}-record bound — a frame handed back for it is kept as one notice`);
    }
    return n;
  }
  if (forget()) persistDelivered();
  /** Hand the whole stash over now — ONE message through the ladder, reason `stash-handover`. */
  async function handOver(webuiId, { auto = false } = {}) {
    const s = activeSessions && activeSessions.get(String(webuiId));
    if (!s) return { ok: false, code: 'no_session', error: 'no such live session' };
    const cid = cidOf(s);
    if (!cid) return { ok: false, code: 'no_conversation', error: 'this session has no conversation yet' };
    if (closed) return { ok: false, code: 'restarting', error: 'the server is restarting — the notices keep waiting for the agent’s next turn' };
    const cur = inflight.get(cid);
    if (cur) return { ok: false, code: 'in_flight', error: `a hand-over for this conversation is already in progress (${cur.id}, started ${Math.max(0, now() - cur.at)} ms ago)`, id: cur.id, since: cur.at };
    const id = mint();
    const rec = { id, at: now(), p: null };
    inflight.set(cid, rec);
    changed();   // the fact says `inFlight` to every client
    rec.p = handOverNow(s, cid, id, { auto });
    try { return await rec.p; } finally { if (inflight.get(cid) === rec) inflight.delete(cid); changed(); }
  }
  async function handOverNow(s, cid, id, { auto = false } = {}) {
    const d = getDeliver();
    if (!d || typeof d.deliverToConversation !== 'function') return { ok: false, code: 'unavailable', error: 'the delivery ladder is not wired on this instance' };
    const jm = jobsReady();
    const { msg: stashed, jobs, retry } = entriesOf(cid);
    const msg = [...retry, ...stashed];   // a parked notification rides the same frame — the oldest wait first
    if (!msg.length && !jobs.length) return { ok: false, code: 'nothing_waiting', error: 'nothing is waiting for this conversation' };
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
    try {
      let r = null;
      // R3 (lane notify-retry): the AUTO hand-over runs at a turn end for what that prompt's context could not carry —
      // its own declared reason, spelled literally beside the user's (the spend census reads the literal)
      const frame = auto
        ? `VibeSpace delivers the ${n} notice(s) that did not fit your previous prompt's context (hand-over ${id}):\n\n${text}`
        : `The user handed over the ${n} notice(s) that were waiting for your next turn (hand-over ${id}):\n\n${text}`;
      const cardText = S.handoverCardText(n, text, { why });   // 2026-09-28: the card carries the notices behind an expander (handoverFacts), not the count alone; R4: its head says why they waited
      try {
        r = auto
          ? await d.deliverToConversation(cid, frame, { kind: 'notification', spendReason: 'stash-retry', fromName: FROM_NAME, cardText })
          : await d.deliverToConversation(cid, frame, { kind: 'notification', spendReason: 'stash-handover', fromName: FROM_NAME, cardText });
      } catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
      if (!r || !r.ok) {
        if (r && r.refused === 'spend') return { ok: false, code: 'spend_refused', id, error: r.reason || 'the spend ceiling refused this turn', why: r.why || null, retryAfter: r.retryAfter || 0, identity: r.identity || null, cap: r.cap == null ? null : r.cap };
        if (r && (r.refused === 'wrapper-no-steer' || r.refused === 'no-wake')) return { ok: false, code: 'held_for_next_turn', id, error: r.reason || 'held for the conversation’s next prompt' };
        return { ok: false, code: 'unreachable', id, error: (r && r.reason) || 'the agent could not be reached — the notices keep waiting for its next turn' };
      }
      // DELIVERED: take exactly what went out; what arrived meanwhile keeps waiting
      const tookStashed = shownStashed.length ? d.drainStash(cid, new Set(shownStashed)) : [];
      // a parked entry leaves the park (its hold given back — this hand-over billed its own turn) and is remembered as
      // a plain entry: a frame that comes back restores it as a WAITING notice, never as one still being retried
      const tookParked = shownParked.length && typeof d.retryTake === 'function' ? d.retryTake(cid, new Set(shownParked), { via: 'hand-over', lane: r.lane || null }).map((e) => ({ source: 'agent', kind: e.kind, fromName: e.fromName || null, text: e.text, ts: e.firstAt, held: { kind: 'not-reachable', attempts: (e.attempts || []).length } })) : [];
      const tookMsg = [...tookParked, ...tookStashed];
      const tookJobs = jobsText && jm ? jm.drainNotifs(cid, new Set(jobs)) : [];
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
      persistDelivered();
      changed();
      return { ok: true, id, delivered: tookMsg.length + tookJobs.length, held, lane: r.lane || null, steered: r.steered === true, remaining: S.summarize(entriesOf(cid)) };
    } finally {
      for (const rel of releases) { try { rel(); } catch { } }
    }
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
    rec.restored = k || -1; rec.msg = []; rec.jobs = [];   // spent: the originals are back in their stores
    persistDelivered();
    log.log?.(`[stash] ${cid}: hand-over ${m[1]} came back undelivered — ${k} entr${k === 1 ? 'y' : 'ies'} restored, each as itself`);
    changed();
    // nothing to restore (the cap evicted every original while the post was on its way): the FIRST echo answers 0 so
    // the caller keeps the frame as one notice rather than dropping it; a second echo is handled (-1)
    return k;
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

  function register(app) {
    app.post('/api/sessions/:id/stash/hand-over', async (req, res) => {
      try {
        if (isAgentBearer(req)) return res.status(403).json({ error: 'the user’s hand-over — not an agent route', code: 'agent_forbidden' });
        const r = await handOver(String(req.params.id));
        if (!r.ok) {
          if (r.retryAfter) res.setHeader('Retry-After', String(Math.max(1, Math.ceil(Number(r.retryAfter) / 1000) || 1)));
          return res.status(STATUS[r.code] || 400).json(r);
        }
        res.json(r);
      } catch (e) { res.status(500).json({ error: (e && e.message) || String(e) }); }
    });
  }

  return { summaryFor, billedFor, reachableFor, changed, handOver, register, entriesOf, restoreHandedOver, redactDelivered, close, settle, isClosed: () => closed, inFlight: (cid) => inflight.has(cid), inFlightCount: () => inflight.size, _delivered: delivered };
}

module.exports = { create, STATUS, FROM_NAME, HANDOVER_MAX_ENTRIES, HANDOVER_MAX_BYTES, HANDOVER_TAG_RE, DELIVERED_TTL_MS, DELIVERED_MAX, DELIVERED_FILE };
