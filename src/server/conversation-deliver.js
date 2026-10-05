'use strict';
// ONE delivery ladder for "get a message into a conversation" (2.362.0,
// B-274d/B-dfd2) — extracted from jobs-wiring so background-job notifications
// and agent-to-agent messages ride the SAME implementation (CS law: transport
// is selected inside, callers never branch). Rungs, in order (the experimental
// rung 0 — the VibeSpace channel socket — was removed in 2.369.202, B-df40):
//   1. LOCAL CLI inbox — scan this machine's ~/.claude/sessions registry
//   2. REMOTE machine — conversation-index names the owner host; that host's
//      agentd runs the SAME findPeer+postToPeer against ITS registry via the
//      'peer-post' device op (capability-gated; daemon-first doctrine — no
//      ssh-script twin: any host we deliver to can run the daemon)
//   3. STASH — durable per-conversation queue (data/msg-stash.json), drained
//      into the conversation's next context injection. Machine-agnostic by
//      construction: remote sessions' hooks already call back to this hub.
// Envelope is CHANNEL-READY (owner direction 2026-08-20): every stashed entry
// carries {source, kind?, fromName, text, ts} (kind = notification/peer, the PATH — S3 verify F3) — 'agent' today; Gmail/Lark/Slack
// connectors later feed the same ladder with their own source tags.
const fs = require('fs');
const path = require('path');
const { capsOf, notificationDelivery } = require('../backend-caps.js');
const { wrapperCaps } = require('./wrapper-files.js');
const { vibespaceNoticeText, withoutNoticeHead } = require('../notification-senders.js'); // lane S3: every kind:'notification' delivery opens with the ONE head naming VibeSpace as the speaker
// verify r6 (lane channel-withdraw, 2026-09-27): THE ONE PREDICATE behind "which live session carries this conversation" —
// a pending fork carries its PARENT's id, and the raw lookups below (rung 1.5, the charged identity; the since-removed
// channel-socket rung 0 was the third) handed the parent's frame to the fork's wrapper and the parent's turn to the fork's credential slot
const { addressableId } = require('../claude-lock-capture.js');
const stashSummary = require('../stash-summary.js'); const { kindOf: stashKindOf } = stashSummary; // PURE: an entry's kind (a peer's by its sender's name, VibeSpace's own by its path)
const { RESERVE_TTL_MS } = require('../spend-authorizer.js'); // the park re-judges a parked delivery's authorization once its hold's TTL has passed (lane notify-retry)

const STASH_CAP = 30; // per-conversation; oldest fall off
// `about` on a stashed entry (lane channel-threads verify r3): its producer's description of where the words came
// from, OPAQUE to this module and bounded — past the bound (or unserializable) it is `{oversize:true}`, which a gate
// withholds (never delivered unjudged). See the stash gate.
const ABOUT_MAX_BYTES = 8192;
function aboutOf(a) {
  if (!a || typeof a !== 'object') return null;
  let s = null;
  try { s = JSON.stringify(a); } catch { return { oversize: true }; }
  if (!s || s.length > ABOUT_MAX_BYTES) return { oversize: true };
  return JSON.parse(s);
}
// How long a written frame waits for the wrapper's own verdict before it stops
// being settleable (see `steersIntoRunningTurn`). The wrapper answers on the
// same stdin round-trip, and its own slowest rung is a 30 s `thread/queue/add`
// budget, so 120 s is >4× the longest legitimate wait: past it the frame is
// STRANDED (a wrapper that died between our write and its reply), and a
// stranded frame must be dropped rather than left to absorb the next message's
// answer — mis-settling a later delivery is how a free steer gets charged and
// a billed queue-add does not.
const SETTLE_TTL_MS = 120 * 1000;

// THE RETRY PARK (lane notify-retry, 2026-10-01 — the owner: "以前这个是自动唤醒的啊 怎么现在开始排队要我手动发了？").
// ONE 5-second attempt used to decide for ever: a local peer post that timed out while the CLI's pid LIVED was
// stashed for the next prompt, and a conversation nobody types into never heard its job finish. MEASURED on the
// primitive (src/peer-messaging.js): a unix-socket connect completes at the syscall or fails at once (a full
// backlog answers EAGAIN, never a hang), so a bare "timeout" was our own loop not hearing a completed connect
// before the timer. Either way the frame did not land and the CLI is alive — a TRANSIENT miss. Such a delivery is
// PARKED here (data/msg-retry.json, beside the stash): the SAME text is posted again at that conversation's next
// TURN END (the stdout consumers' `result` / `task_complete` — noteTurnEnd) and on a bounded backoff while idle —
// 30 s, 1, 2, 5, 10 min, then every 10 min, ≤ 60 min from the first miss — after which it falls to the producer's
// stash with the reason named (`not-reachable`: the agent did not accept it). A miss on a DEAD pid / a socket
// nobody serves stashes at once as before, typed `not-running`. The money: the authorization the first attempt
// took is HELD on the parked entry and converted when the retry lands — ONE billed wake, never two; it is
// re-judged (asked again) only once the hold's TTL has passed. The ladder's own floor — no retry post within
// RETRY_FLOOR_MS of the last SUCCESSFUL post to that conversation — is pacing; the jobs engine's 30 s floor and
// the spend authorizer are untouched.
const RETRY_STEPS_MS = [30 * 1000, 60 * 1000, 2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000];
const RETRY_MAX_MS = 60 * 60 * 1000;
// THE SECOND JUDGE OF THE BOUND (verify r2, reproduced): the wall clock can step BACK (a VM restored from a snapshot, an NTP
// step after a sleep) — a parked entry's `firstAt` was then two hours in the future, the 60-min bound could not pass for
// three hours, the backoff timer slept until the clock caught up, and every turn end posted the frame again (50 attempts).
// So a future stamp is RE-BASED to now at every schedule and attempt (said once), and the schedule is bounded by ATTEMPTS
// too: 3× the attempts the timer alone makes inside the hour — whichever judge expires first
const RETRY_TIMER_ATTEMPTS = (() => { let t = 0, n = 1; for (let i = 0; ; i++) { t += RETRY_STEPS_MS[Math.min(i, RETRY_STEPS_MS.length - 1)]; if (t > RETRY_MAX_MS) break; n++; } return n; })();   // 10 with the steps above
const RETRY_MAX_ATTEMPTS = 3 * RETRY_TIMER_ATTEMPTS;
const RETRY_FLOOR_MS = 30 * 1000;
const FLOOR_DROP_WINDOW_MS = RETRY_MAX_MS;   // verify r4: a floor witness from the future is dropped once; a second within this window is re-based (the clock keeps going back)
const RETRY_TERMINAL_BUSY_MS = 3000;   // a terminal session that wrote output this recently is read as busy (its turn state is unknown)
// ONE WAKE CARRIES EVERYTHING WAITING (verify r1 N1d, reproduced: five parked notices for one conversation became five
// posts = five billed wakes, one every 30 s by the floor; a busy agent with a job every half hour would have paid one
// turn per notice). An attempt for a conversation takes EVERY parked entry of it into ONE frame — the hand-over's shape
// and bounds (the renderer is injected; the rest stay parked for the next frame) — under ONE authorization.
const RETRY_FRAME_MAX_ENTRIES = STASH_CAP;
const RETRY_FRAME_MAX_BYTES = 12 * 1024;
const RETRY_FRAME_HEADING = '### Notices VibeSpace could not deliver at once (the agent was busy)';   // the frame's own heading (a hand-over's says "unreachable" — this agent was not)
const FROM_NAME = 'VibeSpace notices';   // the hand-over's sender (src/notification-senders.js lists it; stash-handover's FROM_NAME): the batch card reads like a hand-over's
// BOUNDED, AND THE DROP IS SAID (verify r1 N1e, reproduced: 100 parks for one conversation = 100 entries, 58 KB, no cap —
// the stash beside it caps at STASH_CAP and names an eviction). The park holds STASH_CAP per conversation: the oldest
// waiting entry falls to its producer's stash as `not-reachable` with `evicted: true` (never dropped, never silent)
const RETRY_CAP = STASH_CAP;   // the hand-over's sender (src/notification-senders.js lists it): the batch card reads like a hand-over's

// THE SPEND CEILING ON THIS LADDER (design-account-hardening §4.4c / P9).
// Rungs 0-2 all put a message into a LIVE agent session: when that session is
// idle the CLI opens a BILLED TURN for it, exactly as if somebody had typed.
// Nine conversations can be parked on one subscription, so the jobs engine's
// 30s-per-conversation flood floor bounds pacing and nothing else.
// A REFUSAL HERE LOSES NOTHING: the caller stashes (rung 3) and the message is
// injected into the conversation's next context — the same words, riding a turn
// that was going to happen anyway. That is why this gate is safe to fail
// CLOSED and why its refusal is not a dropped promise.
// WHO PAYS, when the ladder cannot see a live local session: a REMOTE
// conversation bills that machine's own binding, which this server genuinely
// cannot name. It is charged to a NAMED bucket (`host:<id>` / `unattributed`)
// rather than guessed at or waved through — the instance/day ceiling still
// applies to it, and the name says what we do not know.
function create({ dataDir, peerMsg, getHosts, getConvIndex, serverSetting, activeSessions, emitPeerCard, authorizeSpend = null, noteSpend = null, releaseSpend = null, onStashChange = () => { }, log = () => { }, retryClock = null, renderBatch = null }) {   // renderBatch (verify r1 N1d): the hand-over's renderer (agent-routes renderMsgStash), injected — a batch of parked entries goes out as ONE frame in its shape
  const stashFile = path.join(dataDir, 'msg-stash.json');
  let stash = {};
  try { stash = JSON.parse(fs.readFileSync(stashFile, 'utf-8')) || {}; } catch { }
  // A CLAIM THE PREVIOUS PROCESS DID NOT SETTLE (channel-jump verify r2, 2026-09-27): an entry stamped `ho:<id>` was
  // being handed over when the server stopped. The shutdown path WAITS for a hand-over in flight (server.js
  // `stashView.settle`), so a stamp here means the process died mid-post (SIGKILL / OOM) inside the socket
  // round-trip — whether the CLI took the frame is unknown. RELEASED (they wait again), by name in the log: a lost
  // notice is silent, a repeated one is visible and traceable by its hand-over id.
  const releasedAtBoot = [];
  for (const [cid, q] of Object.entries(stash)) {
    if (!Array.isArray(q)) { delete stash[cid]; continue; }
    const ids = new Set();
    for (const e of q) if (e && e.ho) { ids.add(e.ho); delete e.ho; }
    if (ids.size) releasedAtBoot.push({ cid, ids: [...ids], n: q.length });
  }
  if (releasedAtBoot.length) { try { fs.writeFileSync(stashFile + '.tmp', JSON.stringify(stash)); fs.renameSync(stashFile + '.tmp', stashFile); } catch { } }
  for (const r of releasedAtBoot) log(`[deliver] ${r.cid}: a hand-over (${r.ids.join(', ')}) was in flight when the previous server stopped — its entries wait again (a duplicate is possible if the frame landed; check the conversation for "hand-over ${r.ids[0]}")`);
  let stashTimer = null;
  // `true` when the file holds what memory holds; a failed write is logged AND answered (verify r4: a ref'd entry's
  // producer must hear the truth — see stashFor)
  // verify r5 (2026-09-27): the LAST failure is remembered (`stashHealth`) and a failed write is RETRIED on its own
  // clock — a transient refusal (a full disk cleared a minute later) heals without waiting for the next mutation
  let lastWriteError = null, retryTimer = null;
  const STASH_RETRY_MS = 30 * 1000;
  const writeStashNow = () => {
    try { fs.writeFileSync(stashFile + '.tmp', JSON.stringify(stash)); fs.renameSync(stashFile + '.tmp', stashFile); lastWriteError = null; return true; }
    catch (e) {
      lastWriteError = { at: Date.now(), message: String(e && e.message || e) };
      log('[deliver] stash persist failed:', e.message);
      if (!retryTimer) { retryTimer = setTimeout(() => { retryTimer = null; writeStashNow(); }, STASH_RETRY_MS); retryTimer.unref?.(); }   // an empty queue is written too: a stale file would re-deliver at boot
      return false;
    }
  };
  const persistStash = () => {
    if (stashTimer) return;
    stashTimer = setTimeout(() => { stashTimer = null; writeStashNow(); }, 500);
  };
  /** Is the file behind the queue current? `{durable, error}` — a producer's reply can say so. */
  const stashHealth = () => ({ durable: !lastWriteError, error: lastWriteError ? lastWriteError.message : null, since: lastWriteError ? lastWriteError.at : null });
  // SIGTERM/SIGINT belt (review-caught): a debounced-only write loses a
  // just-stashed "queued" promise on the ROUTINE restart path — same law as
  // every other data/*.json store.
  const flush = () => { if (stashTimer) { clearTimeout(stashTimer); stashTimer = null; } return writeStashNow(); };

  // THE STASH'S OWN EVENTS (2026-09-27, the owner: "我在界面里完全看不到有消息
  // 在 queue"): a producer that stashed an entry with a `ref` (the channels
  // engine: a receipt's proposal id) is told when that entry is DRAINED into
  // the conversation's next message and when it is stashed (again — the
  // drain's budget handed it back), so its surface can say whether the agent
  // knows yet. Listeners are synchronous and never break the stash.
  const stashListeners = new Set();
  function onStash(fn) { if (typeof fn !== 'function') return () => {}; stashListeners.add(fn); return () => stashListeners.delete(fn); }
  // `('evicted', cid, entries, {held})` (verify r2, 2026-09-27): the cap
  // dropped an entry with a ref — it was NEVER read; without this the producer
  // would say "waiting" for good, and a boot reconcile that finds it gone would
  // read it as drained. `held` = the queue's length after the drop.
  function emitStash(ev, cid, entries, extra = {}) {
    // `unwritten` (verify r5) is for EVERY entry — a listener that names the disk failure to the user hears it once per stash
    const withRef = ev === 'unwritten' ? (entries || []).filter(Boolean) : (entries || []).filter((e) => e && e.ref);
    if (!withRef.length) return;
    for (const fn of stashListeners) { try { fn(ev, cid, withRef, extra); } catch (e) { log('[deliver] a stash listener threw:', e && e.message); } }
  }
  // THE CAP EVICTS THE OLDEST UNCLAIMED ENTRY, NEVER A CLAIMED ONE (channel-jump verify r4, 2026-09-27 — reproduced:
  // 30 arrivals while a hand-over of 7 was on its way evicted all 7 CLAIMED entries; the press then answered
  // "delivered: 0" for the 7 the agent received, the delivered record kept no originals, and the wrapper's later
  // echo of that frame restored nothing — 7 entries became one 400-char stub). A claimed entry is being delivered:
  // it leaves by the hand-over's own drain (or is released, unclaimed, and falls off with the next arrivals like
  // any other). The store may exceed the cap by the claimed count while a hand-over is in flight (≤ the hand-over's
  // own HANDOVER_MAX_ENTRIES). ONE helper — its RETURN (the entries it dropped, unclaimed by construction) is what
  // stashFor's `evicted` event carries (the .195 merge, lane channel-withdraw verify r2 + channel-jump r4): the cap is
  // the ONE place an entry leaves the queue undelivered, so it is the one place `evicted` is said — a fate never reads
  // "evicted" for a receipt a hand-over delivered, and a restore never trims.
  function capUnclaimed(q) {
    // the cap counts the UNCLAIMED entries (when every slot is claimed, a newcomer is the only unclaimed one — a
    // cap over the whole store would evict exactly the entry that just arrived); the oldest unclaimed fall off.
    // A MAY-HAVE-LANDED COPY GIVES WAY FIRST (notify-retry verify r3, reproduced: a park entry claimed by a hand-over when
    // the previous server died fell into a FULL stash as may-have-landed and the cap dropped the OLDEST real entry to
    // make room for it — a certain miss displaced by a possible repeat). At the cap, the unclaimed entries whose frame
    // may already have reached the agent (`held.maybeDelivered`) fall before any other, oldest first; then the oldest
    // unclaimed as before. The same rule in the jobs engine's store (src/jobs.js capUnclaimedNotifs)
    let over = q.filter((e) => !(e && e.ho)).length - STASH_CAP;
    const dropped = [];
    if (over <= 0) return dropped;
    for (const pass of [(e) => !!(e.held && e.held.maybeDelivered), () => true]) {
      for (let i = 0; i < q.length && over > 0;) {
        if (!q[i] || q[i].ho || !pass(q[i])) { i++; continue; }
        dropped.push(...q.splice(i, 1)); over--;
      }
    }
    return dropped;
  }
  function stashFor(cid, envelope) {
    const q = stash[cid] || (stash[cid] = []);
    // a RE-STASHED entry (the drain's budget handed it back) keeps its own ts so the next drain shows it in order
    // `kind` = the PATH (S3 verify F3): the drain heads a notification and draws its card by it — never by the sender's NAME, which a peer chooses
    const kind = envelope.kind === 'notification' || envelope.kind === 'peer' ? envelope.kind : null;
    // `about` (lane channel-threads verify r3): the producer's own description of where the words came from — the
    // stash gate below judges it at every read (opaque here; bounded)
    const about = aboutOf(envelope.about);
    const entry = { source: envelope.source || 'agent', ...(kind ? { kind } : {}), ...(envelope.ref ? { ref: String(envelope.ref).slice(0, 200) } : {}), ...(about ? { about } : {}), ...(envelope.held && typeof envelope.held === 'object' && envelope.held.kind ? { held: { ...envelope.held } } : {}), fromName: envelope.fromName || null, text: String(envelope.text || ''), ts: Number(envelope.ts) > 0 ? Number(envelope.ts) : Date.now() };   // `held` (lane notify-retry): why the producer could not deliver it — the hand-over's words read it
    // "Clear content…" (verify r4): the stores judge the entry BEFORE it is written — a frame handed back after the clear
    // (see judgeEntry) is held as the sentence, never as the words the clear already took
    if (judgeEntry(entry)) log(`[deliver] ${cid}: a held entry named a cleared record — stored as the cleared sentence`);
    const before = q.slice();   // the take-back below restores the queue EXACTLY (the cap may drop from anywhere between claimed entries)
    q.push(entry);
    // THE CAP (channel-jump verify r4): the oldest UNCLAIMED entries fall off, a claimed (`ho`) one never does.
    // an eviction is SAID (channel-jump verify r6): the injection walks newest-first, so under sustained arrivals the
    // OLDEST entries are the ones held turn after turn — and the cap then drops exactly those, while the strip's count
    // stays at the cap. A loss the log can trace, never a silence — and (withdraw verify r2) an `evicted` event below.
    const evicted = capUnclaimed(q);
    // AN ENTRY WHOSE PRODUCER TRACKS ITS FATE IS DURABLE BEFORE THE PRODUCER IS TOLD (verify r3, 2026-09-27):
    // a `ref` means somebody records "stored for the next message" off the `stashed` event below — under the
    // 500 ms debounce a SIGKILL / OOM inside that window left the outbox saying `stashed` over a file without
    // the entry, and the next boot's reconcile read the missing entry as "handed with an earlier message"
    // (constructed: the receipt gone, the card said Handed). One synchronous write per owner decision.
    // verify r4: …and when that write FAILS the producer is told so (a throw), never "stashed" — the entry is taken
    // back out (a stashed-in-memory-only receipt the outbox called stored was read as "handed with an earlier
    // message" by the next boot's reconcile, exactly the r3 shape through a full disk instead of the debounce)
    // verify r5: EVERY entry is written the moment it is stashed and its producer hears the verdict — a peer message
    // (`msg send`, a window-share request, a handback) rode the debounce: under the same failed write its sender
    // was told "queued", the entry lived in memory only and vanished at the next restart with one log line. ONE
    // outcome for every producer: on disk, or `{stored:false, why}`. An entry WITHOUT a ref has no other home, so it
    // STAYS in memory (delivered at the next turn while this process lives; the file is retried on its own clock)
    // and the caller relays the truth; an entry WITH a ref has one (the card) and is taken back (r4).
    const stored = flush();
    if (!stored && entry.ref) {
      q.splice(0, q.length, ...before);   // the take-back: the entry out, whatever the cap dropped back in its place
      if (!q.length) delete stash[cid];
      stashChanged(cid);
      throw new Error(`the stash could not be written to disk (${path.basename(stashFile)}) — the entry was not stored`);
    }
    // the journal names an evicted entry by its KIND, a peer by its sender's name — never by a label VibeSpace composed
    // from a record (`Background Work · <the job's name>`): every console line rides the server's ring into each incident
    // captured later, past a "Clear content…" of that job (lane-redact verify r8)
    if (evicted.length) log(`[deliver] ${cid}: ${evicted.length} oldest waiting entr${evicted.length === 1 ? 'y' : 'ies'} fell off the ${STASH_CAP}-entry cap (${evicted.map((e) => `${e.source}:${stashKindOf(e)}${stashKindOf(e) === 'peer' && e.fromName ? ` "${String(e.fromName).replace(/\s+/g, ' ').slice(0, 40)}"` : ''} ${new Date(Number(e.ts) || 0).toISOString()}${e.held && e.held.maybeDelivered ? ' — a may-have-landed copy, gave way first' : ''}`).join('; ')}) — never delivered`);
    emitStash('stashed', cid, [entry]);
    if (evicted.length) emitStash('evicted', cid, evicted, { held: q.length });
    stashChanged(cid);
    if (!stored) { const why = `the queue could not be saved to disk (${(lastWriteError && lastWriteError.message) || 'write failed'}) — held in memory only: it is lost if VibeSpace restarts before that conversation's next turn`; emitStash('unwritten', cid, [entry], { why }); return { stored: false, why }; }
    return { stored: true, why: null };
  }
  // THE STASH IS VISIBLE (2026-09-27, the owner: "我在界面里完全看不到'有消息在 queue'这件事情"): every write and
  // every drain says so — the hub re-publishes the conversation's `stash` session fact (src/stash-summary.js) and the
  // chat's strip above the composer follows it. Never throws into the ladder.
  const stashChanged = (cid) => { try { onStashChange(cid); } catch (e) { log('[deliver] stash change hook failed:', e.message); } };
  // THE STASH GATE (lane channel-threads verify r3, IDENTITY — reproduced over the real channels engine, this stash and
  // the real injection, agent-routes drainStashUnderCap): a producer files what a CONVERSATION said for an agent's next
  // turn while the agent may see that conversation — a channel watcher's held wake (the message text), a proposal's
  // receipt (the title, the vendor id), a reaction digest; the owner then removes the agent's access; every `read`
  // answered the uniform not-found, and the agent's next prompt drained all three WHOLE. Reach is asked at the LAST
  // moment, here: an entry carrying `about` (its producer's own description of where the words came from — opaque to
  // this module) is judged by every registered gate whenever the queue is READ for delivery or display
  // (`stashEntries` / `stashPeek` — the injection, the hand-over and the strip all read through them): `null` keeps it
  // (asked again at the next read), `{drop:true}` takes it out undelivered (a ref'd or claimed entry is never dropped —
  // its producer / hand-over tracks it — it is re-worded instead), `{text, fromName?}` replaces its words and it is
  // judged no more. A gate that THROWS withholds (fail closed). One synchronous write, one change signal.
  const stashGates = new Set();
  function registerStashGate(fn) { if (typeof fn !== 'function') return () => {}; stashGates.add(fn); return () => { stashGates.delete(fn); }; }
  const WITHHELD_TEXT = 'A VibeSpace notification waiting for this conversation was withheld — where it came from no longer reaches you.';
  function gateQueue(cid) {
    const q = stash[cid];
    if (!q || !q.length || !stashGates.size) return;
    const dropped = [];
    let changed = false;
    const memo = new Map();   // ONE pass: a gate may remember what it looked up for this queue (verify r3: the cost)
    for (let i = 0; i < q.length;) {
      const e = q[i];
      if (!e || typeof e !== 'object' || !e.about) { i++; continue; }
      let v = null;
      for (const fn of stashGates) {
        try { v = fn(cid, e, memo) || null; } catch (err) { log('[deliver] a stash gate threw — the entry is withheld:', err && err.message); v = { drop: true }; }
        if (v) break;
      }
      if (!v) { i++; continue; }
      changed = true;
      if (v.drop && !e.ref && !e.ho) { dropped.push(...q.splice(i, 1)); continue; }
      e.text = typeof v.text === 'string' && v.text ? v.text : WITHHELD_TEXT;
      if (v.fromName !== undefined) e.fromName = v.fromName;
      e.withheld = true;
      delete e.about;
      i++;
    }
    if (!changed) return;
    if (!q.length) delete stash[cid];
    if (dropped.length) log(`[deliver] ${cid}: ${dropped.length} waiting entr${dropped.length === 1 ? 'y was' : 'ies were'} withheld (${dropped.map((e) => `${e.source}${e.fromName ? ` "${String(e.fromName).replace(/\s+/g, ' ').slice(0, 40)}"` : ''}`).join('; ')}) — the producer says where the words came from no longer reaches that conversation`);
    writeStashNow();
    stashChanged(cid);
  }
  // A CLAIM (channel-jump verify, 2026-09-27 — reproduced: the user's own message landed while a hand-over was
  // awaiting the ladder's post; the injection's full drain took the same entries and the receipt reached the agent
  // TWICE). The hand-over CLAIMS the entries it is about to deliver: a full drain (the injection routes) leaves a
  // claimed entry in place — it is spoken for, not waiting for a turn — and the claim is released when the hand-over
  // settles (delivered ⇒ taken by identity; refused ⇒ released, exactly as it was).
  // verify r2: THE CLAIM IS THE ENTRY'S OWN `ho` STAMP, WRITTEN THROUGH TO DISK SYNCHRONOUSLY (was: an in-memory Set a
  // restart forgot while the entries stayed on disk ⇒ the next boot's injection re-delivered what the post had
  // carried). The stamp is the hand-over's id; the loader above releases what a dead process left stamped.
  function claimStash(cid, entries, id = null) {
    const mine = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e === 'object');
    const tag = id ? String(id) : 'ho';
    for (const e of mine) e.ho = tag;
    // a claim write that FAILS (the .195 merge, withdraw's checklist ⑧) leaves the `ho` stamp in memory only: a crash
    // before the retry re-delivers at the next boot — a duplicate, never a loss — and is named here, never silent
    if (mine.length && !writeStashNow()) log(`[deliver] ${cid}: the claim of hand-over ${tag} (${mine.length} entr${mine.length === 1 ? 'y' : 'ies'}) could not be written — held in memory; a crash before the retry re-delivers them`);
    let released = false;
    return () => { if (released) return; released = true; let n = 0; for (const e of mine) if (e.ho === tag) { delete e.ho; n++; } if (n && !writeStashNow()) log(`[deliver] ${cid}: the release of hand-over ${tag} could not be written — held in memory`); };
  }
  function claimedCount(cid) { return (stash[cid] || []).filter((e) => e && e.ho).length; }
  /** Drain a conversation's stash; `only` (a Set of entries read by `stashEntries`) takes exactly those — the
   *  hand-over's "what I delivered" — and keeps whatever arrived meanwhile. A full drain keeps every CLAIMED entry
   *  (a hand-over in flight owns it — see `claimStash`). EVERY drain persists SYNCHRONOUSLY (verify r2): a drain is
   *  a delivery, and a debounced write after it left a 500 ms window in which a killed process re-delivered at its
   *  next boot; a drain happens once per turn, the write is small. */
  function drainStash(cid, only = null) {
    const q = stash[cid] || [];
    if (!q.length) return q;
    const byId = only instanceof Set;
    if (byId || q.some((e) => e && e.ho)) {
      const mine = byId ? (e) => only.has(e) : (e) => !(e && e.ho);
      const took = q.filter(mine);
      const keep = q.filter((e) => !mine(e));
      if (keep.length) stash[cid] = keep; else delete stash[cid];
      for (const e of took) if (e && e.ho) delete e.ho;   // what went out carries no claim into a restore
      if (took.length) { writeStashNow(); stashChanged(cid); emitStash('drained', cid, took); }   // `drained` names what was TAKEN, never the whole queue (withdraw r4 + the .195 merge)
      return took;
    }
    delete stash[cid]; writeStashNow(); stashChanged(cid);
    emitStash('drained', cid, q);
    return q;
  }
  /** Put drained entries BACK, each as itself (the hand-over's frame came back undelivered — verify r2: the codex
   *  wrapper's `peer_message_result ok:false` used to re-stash the ONE combined text as ONE notice; 5 became 1 and the
   *  job results left their own store for good). Order by ts, NO cap (verify r4, below), one change signal. */
  function restoreStash(cid, entries) {
    const mine = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e === 'object');
    if (!cid || !mine.length) return 0;
    const q = stash[cid] || (stash[cid] = []);
    for (const e of mine) { delete e.ho; judgeEntry(e); if (!q.includes(e)) q.push(e); }   // judged at the write like every entry (verify r4)
    q.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
    // NO cap here (verify r4): the restored entries are the OLDEST, so trimming would evict exactly what came back
    // while answering "restored". They wait as if the hand-over had never happened; the next arrival's cap applies.
    if (q.length > STASH_CAP) log(`[deliver] ${cid}: ${q.length} entries wait after a restore (cap ${STASH_CAP}) — the oldest fall off with the next arrivals`);
    const stored = writeStashNow();   // a restore is a delivery's bookkeeping: on disk at once, like a drain
    stashChanged(cid);
    // a ref'd entry back in the queue is WAITING again (the .195 merge, withdraw's checklist ⑤): without `stashed` its
    // producer's card kept "handed" over a receipt the agent never got; no `evicted` — a restore never trims (jump r4)
    emitStash('stashed', cid, mine);
    if (!stored) emitStash('unwritten', cid, mine, { why: `the queue could not be saved to disk (${(lastWriteError && lastWriteError.message) || 'write failed'}) — held in memory only: it is lost if VibeSpace restarts before that conversation's next turn` });
    return mine.length;
  }
  // A FRAME THAT CAME BACK (verify r2): the two stdout consumers re-stash a delivered frame the wrapper could not run.
  // A frame that names a hand-over the hub still remembers is restored as its ORIGINAL entries (the restorer is the
  // hand-over module's — it holds both stores' delivered sets); any other frame is stashed as itself by the caller.
  const restorers = [];
  function registerFrameRestorer(fn) { if (typeof fn === 'function') restorers.push(fn); }
  function restoreFrame(cid, text, meta = {}) {
    for (const fn of restorers) { try { const n = fn(cid, text, meta); if (n) return n; } catch (e) { log('[deliver] frame restore failed:', e.message); } }
    return 0;
  }
  function stashCount(cid) { return (stash[cid] || []).length; }
  /** "CLEAR CONTENT…" (verify r3, 2026-09-28): a held entry that carries a cleared record's words
   *  loses them. `match(entry) → null | {text?, fromName?}` is asked of every queued entry (every
   *  conversation); a non-null answer replaces those fields. A codex owner conversation's wrapper hands
   *  a notification / a group wake it could not queue back here WHOLE (stdout/codex-events.js), so a
   *  clear of the job / the message it carried must reach this file too. Returns the count rewritten. */
  // THE HOLDERS OF A HELD ENTRY'S COPY PAST ITS DRAIN (the lane-redact merge onto 2.369.196): the stash hand-over keeps a
  // delivered hand-over's ORIGINAL entries + its frame text for 24 h (src/server/stash-handover.js `delivered`, on disk in
  // data/stash-handover.json) so a frame the wrapper hands back is restored as itself — a copy of the same words. Each
  // registered holder is asked with the SAME match after the queue, plus the door's own `scope` (a job clear: `jobIds`,
  // for the jobs-store originals a ladder match never sees). Never throws into the door.
  const redactors = [];
  function registerRedactor(fn) { if (typeof fn === 'function') redactors.push(fn); }
  function redactStash(match, scope = {}) {
    let n = 0;
    const touched = new Set();
    for (const [cid, q] of Object.entries(stash)) {
      for (const e of q) {
        let r = null;
        try { r = match(e); } catch { r = null; }
        if (!r || typeof r !== 'object') continue;
        if (typeof r.text === 'string') e.text = r.text;
        if (typeof r.fromName === 'string') e.fromName = r.fromName;
        n++; touched.add(cid);
      }
    }
    // THE PARK IS A COPY TOO (notify-retry verify r1, found by the record-clear census and reproduced): a cleared job's
    // words sat in its parked entry and the retry posted them after the clear. The same matcher judges the park's
    // entries; a notification keeps the ladder's head on the sentence (the post is a frame, not a drain row); the
    // card text (a summary of the words) is dropped — the landing card draws the sentence
    let parked = 0;
    for (const [cid, q] of Object.entries(retry)) {
      for (const e of q) {
        let r = null;
        try { r = match(e); } catch { r = null; }
        if (!r || typeof r !== 'object') continue;
        if (typeof r.text === 'string') { e.text = e.kind === 'notification' ? vibespaceNoticeText(r.text) : r.text; e.cardText = null; }
        if (typeof r.fromName === 'string') e.fromName = r.fromName;
        // THE WORDS ARE ON THE WIRE (verify r2, reproduced): an entry whose frame is in flight carried the words before the
        // clear — the clear cannot recall them (the CLI's transcript holds the frame). SAID here, and the landing card is
        // built from the entries' words as they stand (the cleared sentence), with `recorded` = the frame as written
        if (e.inflight) { e.clearedInFlight = true; log(`[deliver] ${cid}: ${e.id} was cleared while its frame was on the wire — the frame carried the words before the clear (the transcript keeps them); the card will draw the cleared sentence`); }
        n++; parked++; touched.add(cid);
      }
    }
    if (parked) writeRetryNow();
    // a clear is written at once and the conversation's `stash` fact re-published (the strip above its composer
    // draws a peer's NAME — a cleared job's `Background Work · <name>` label must not outlive the clear there)
    if (n) { writeStashNow(); for (const cid of touched) stashChanged(cid); }
    for (const fn of redactors) { try { fn(match, scope || {}); } catch (e) { log('[deliver] a stash-copy redactor threw:', e && e.message); } }
    return n;
  }
  // EVERY ENTRY IS JUDGED AT ITS WRITE (lane-redact verify r4, 2026-09-28, reproduced): the clear's `redactStash` rewrites
  // what is QUEUED at that instant — but a frame the wrapper hands BACK later re-enters this queue WHOLE with the words it
  // was given before the clear: a queued notification / group wake dropped by Stop or removed from the codex queue
  // (`peer_message_result ok:false`, an UNBOUNDED window — hours behind a long turn, and past a server restart, since the
  // wrapper's queue outlives this process) through the two stdout consumers' `restoreFrame → 0 → stashFor`, and a
  // delivery that misses while the door runs (the ladder's own `stashFor` after an awaited rung). So the stores that own
  // the words are asked at every stash write (`registerStashJudge`: the jobs engine by the job ids a text names +
  // `clearedAt`, the groups engine by the group a report names + its `cleared` index) — STORE-BACKED, never a memory of
  // past clears, so a hand-back that lands after a restart is judged the same. A judge answers `null` or `{text?,
  // fromName?}`; never throws into the write.
  const judges = [];
  function registerStashJudge(fn) { if (typeof fn === 'function') judges.push(fn); }
  function judgeEntry(entry) {
    let hit = false;
    for (const fn of judges) {
      let r = null;
      try { r = fn(entry); } catch (e) { log('[deliver] a stash judge threw:', e && e.message); r = null; }
      if (!r || typeof r !== 'object') continue;
      if (typeof r.text === 'string') entry.text = r.text;
      if (typeof r.fromName === 'string') entry.fromName = r.fromName;
      hit = true;
    }
    return hit;
  }
  /** A READ of one conversation's held entries (2026-09-27 verify: the
   *  channels engine's boot reconcile asks whether a receipt is still
   *  waiting). Copies; never drains, never re-orders. */
  function stashPeek(cid) { gateQueue(cid); return (stash[cid] || []).map((e) => ({ ...e })); }
  /** The entries waiting for a conversation (the SAME objects — `drainStash(cid, new Set(these))` takes them). Every
   *  read passes the stash gate first (verify r3): what a revoked reach no longer covers is never handed out. */
  function stashEntries(cid) { gateQueue(cid); return (stash[cid] || []).slice(); }

  // ── THE RETRY PARK (see the header constants) ──────────────────────────────
  const clock = retryClock || { now: () => Date.now(), setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; }, clearTimeout: (t) => clearTimeout(t) };
  const retryFile = path.join(dataDir, 'msg-retry.json');
  let retry = {};
  // A TORN FILE IS SET ASIDE, NEVER SILENTLY EMPTY (verify r1 N5, reproduced: a torn msg-retry.json read as {} without a
  // word and the next park overwrote its bytes). The bytes move to `msg-retry.json.corrupt-<ts>` (never unlinked — the
  // channel store's rule) with ONE named log line; the park starts empty and the next write makes a fresh file.
  {
    let rawText = null;
    try { rawText = fs.readFileSync(retryFile, 'utf-8'); } catch { rawText = null; }   // absent = a fresh park
    if (rawText != null) {
      let parsed = null, bad = null;
      try { parsed = JSON.parse(rawText); } catch (e) { bad = e && e.message; }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) retry = parsed;
      else if (rawText.trim() !== '') {
        const aside = `${retryFile}.corrupt-${new Date(clock.now()).toISOString().replace(/[:.]/g, '-')}`;
        try { fs.renameSync(retryFile, aside); log(`[deliver] data/msg-retry.json could not be read (${bad || 'not an object'}) — set aside as ${path.basename(aside)} (${rawText.length} bytes kept); the retry park starts empty`); }
        catch (e) { log(`[deliver] data/msg-retry.json could not be read (${bad || 'not an object'}) and could not be set aside (${e && e.message}) — the park starts empty and will overwrite it`); }
      }
    }
  }
  let retrySeq = 0;
  const retryListeners = new Set();
  const turnEndListeners = new Set();
  const lastPostAt = new Map();   // cid → the last SUCCESSFUL post's instant (the park's own floor)
  const floorDrops = new Map();   // cid → the instant its floor witness was last DROPPED for a backward clock (verify r4: the second within the hour re-bases)
  const floorRebaseSaidAt = new Map();   // cid → when the re-base was last said
  let parkTimer = null;
  let retryClosed = false;           // shutdown: no new post leaves (closeRetries)
  const retryInFlight = new Set();   // the attempt promises in flight (settleRetries waits for them)
  const writeRetryNow = () => {
    for (const [cid, q] of Object.entries(retry)) if (!Array.isArray(q) || !q.length) delete retry[cid];
    try { fs.writeFileSync(retryFile + '.tmp', JSON.stringify(retry)); fs.renameSync(retryFile + '.tmp', retryFile); return true; }
    catch (e) { log('[deliver] retry park persist failed:', e.message); return false; }
  };
  // BOOT: the previous process's holds are gone (the guard is in-memory) — every parked entry is re-judged at its
  // next attempt. An entry stamped `inflight` was being posted when that process stopped: its frame MAY HAVE LANDED
  // (a connect + write on a live socket completes in milliseconds; the stamp is cleared only after the post) — it is
  // NEVER posted again (verify r1 N2, reproduced: the boot re-posted a landed frame = the same notice twice, two billed
  // turns; the CLI's own dedup is "identical to the previous message from this sender", and a restarted hub is a new
  // sender). It falls to the producer's stash at the first sweep, typed not-reachable with `maybeDelivered`, so the
  // next prompt carries it for free. A graceful stop never leaves one: server.js waits for the posts in flight
  // (closeRetries / settleRetries, the hand-over's shape).
  {
    const notes = [];
    for (const [cid, q] of Object.entries(retry)) {
      if (!Array.isArray(q)) { delete retry[cid]; continue; }
      for (const e of q) {
        if (!e || typeof e !== 'object') continue;
        if (e.charged) e.charged.hold = null;
        if (e.inflight) { notes.push(`${cid}: ${e.id} was being posted when the previous server stopped — its frame may have landed, so it is handed to the stash at the first sweep and never posted again`); delete e.inflight; e.maybeDelivered = true; e.nextAt = 0; }
        // A HAND-OVER'S CLAIM IS THE SAME STAMP (verify r2, reproduced): an entry stamped `ho:<id>` was riding a hand-over's
        // frame when the process died inside that post. The stash releases ITS claimed entries at boot (they wait again); a
        // park entry nobody released was invisible to every door — the timer, the turn end, the bound, the hand-over's view
        // all skip a claimed one — and sat in the file for ever, counted as "being retried". It joins its stash siblings:
        // handed to the stash at the first sweep as may-have-landed, never posted by the park again
        if (e.ho) { notes.push(`${cid}: ${e.id} was claimed by hand-over ${e.ho} when the previous server stopped — its frame may have landed, so it is handed to the stash at the first sweep (its siblings wait there) and never posted again`); delete e.ho; e.maybeDelivered = true; e.nextAt = 0; }
      }
    }
    if (Object.keys(retry).length) writeRetryNow();
    for (const n of notes) log(`[deliver] ${n}`);
    const n = Object.values(retry).reduce((a, q) => a + q.length, 0);
    if (n) log(`[deliver] ${n} parked deliver${n === 1 ? 'y waits' : 'ies wait'} for retry from the previous server`);
  }
  function onRetry(fn) { if (typeof fn !== 'function') return () => { }; retryListeners.add(fn); return () => retryListeners.delete(fn); }
  /** `fn(ev, cid, entry, extra)` — parked | attempt | delivered | fell; for `fell` a listener answering `true` TOOK
   *  the entry (the producer stashed it in its own store); nobody ⇒ this ladder's stash. Synchronous, never throws
   *  into the park. */
  function emitRetry(ev, cid, entry, extra = {}) {
    let taken = false;
    for (const fn of retryListeners) { try { if (fn(ev, cid, entry, extra) === true) taken = true; } catch (e) { log('[deliver] a retry listener threw:', e && e.message); } }
    return taken;
  }
  function onTurnEnd(fn) { if (typeof fn !== 'function') return () => { }; turnEndListeners.add(fn); return () => turnEndListeners.delete(fn); }
  /** The target's turn state as this server knows it: a chat session's authoritative streaming flag; a terminal
   *  session is read busy only by recent output (unknown ⇒ null) — the R2 measurement rides every attempt. */
  function busyOf(cid) {
    const s = localSessionFor(cid);
    if (!s) return null;
    // a chat session's "busy" is evidence (a record set the flag); "idle" is said only once the harness has spoken its own
    // turn state this process (`_turnStateSeen`) — a RESTORED session wires `_isStreaming = false` before any record, and
    // that default read as "target mid-turn: no" (verify r1 N3, reproduced); unknown is said as unknown
    if (s.mode === 'chat') return s._isStreaming === true ? true : (s._turnStateSeen === true ? false : null);
    const at = Number(s._lastPtyDataAt) || 0;
    return at && clock.now() - at < RETRY_TERMINAL_BUSY_MS ? true : null;
  }
  const machineTurnFor = (cid) => { try { const s = localSessionFor(cid); if (s) s._machineInputAt = Date.now(); } catch { } };
  const armTurnFor = (cid) => {
    try {
      const s = localSessionFor(cid);
      if (!s) return () => { };
      const prev = s._machineInputAt;
      s._machineInputAt = Date.now();
      const at = s._machineInputAt;
      return () => { if (s._machineInputAt === at) s._machineInputAt = prev; };
    } catch { return () => { }; }
  };
  function retryQueue(cid) { return retry[cid] || (retry[cid] = []); }
  function retryCount(cid) { return (retry[cid] || []).length; }
  function retryPeek(cid) { return (retry[cid] || []).map((e) => ({ ...e })); }
  /** the park's view of a conversation: entries in the STASH's shape (the summary / the hand-over / the drains read
   *  them beside the stash), each carrying its original under `_retry` (the SAME object — `retryTake` takes it). */
  // verify r1 (N1c, reproduced): an entry whose post is IN FLIGHT is not waiting — it is being delivered this instant. The
  // view used to list it, the hand-over claimed + took it, posted its own frame carrying it, and the retry's post landed
  // too: the same notice twice, TWO billed turns. An in-flight entry is invisible to every taker (it is back in the
  // view if its post fails), and the claim / take doors refuse it by construction
  function retryEntries(cid) {
    return (retry[cid] || []).filter((e) => e && !e.inflight && !e.maybeDelivered).map((e) => ({ source: 'retry', kind: e.kind, fromName: e.fromName || null, text: e.text, ts: e.firstAt, held: { kind: 'retrying', nextAt: e.nextAt, attempts: e.attempts.length, phase: (e.attempts[e.attempts.length - 1] || {}).phase || null, busy: (e.attempts[e.attempts.length - 1] || {}).busy ?? null, producer: e.producer || null, meta: e.meta || null }, ho: e.ho || undefined, _retry: e }));
  }
  function releaseHoldOf(e) {
    if (e && e.charged && e.charged.hold && releaseSpend) { try { releaseSpend({ reason: e.charged.reason, identity: e.charged.identity, hold: e.charged.hold }); } catch (err) { log('[deliver] releasing the parked hold failed:', err.message); } }
    if (e && e.charged) e.charged.hold = null;
  }
  function removeRetry(e) {
    const q = retry[e.cid];
    if (!q) return;
    const i = q.indexOf(e);
    if (i >= 0) q.splice(i, 1);
    if (!q.length) delete retry[e.cid];
  }
  // A HELD AUTHORIZATION IS GIVEN BACK ON ITS OWN TTL, never on a reschedule: the hold binds the ceiling like a
  // charge, so a parked slot must not refuse the account's real turns for the hour a park can last — but inside
  // the TTL a turn-end attempt converts it without asking again (ONE authorization), so it is released only when
  // the guard would expire it anyway (a hair before, so the guard's "expired with no charge" census stays clean)
  const HOLD_RELEASE_MARGIN_MS = 5 * 1000;
  const holdDueAt = (e) => (e && e.charged && e.charged.hold ? (Number(e.charged.holdAt) || 0) + RESERVE_TTL_MS - HOLD_RELEASE_MARGIN_MS : Infinity);
  /** A STAMP IN THE FUTURE IS THE CLOCK'S, NOT THE ENTRY'S (verify r2): `firstAt` / `holdAt` ahead of now are re-based to now,
   *  a `nextAt` further off than the longest step is pulled to the entry's own step — the bound and the backoff keep
   *  counting from the moment the leap was seen; said once per entry. Runs at every schedule and attempt. */
  function repairClock() {
    const now = clock.now();
    const maxStep = RETRY_STEPS_MS[RETRY_STEPS_MS.length - 1];
    let n = 0;
    for (const [cid, q] of Object.entries(retry)) for (const e of q) {
      if (!e || typeof e !== 'object') continue;
      const back = Math.max(Number(e.firstAt) - now, e.charged ? Number(e.charged.holdAt) - now : 0, Number(e.nextAt) - now - maxStep);
      if (!(back > 0)) continue;
      if (Number(e.firstAt) > now) e.firstAt = now;
      if (e.charged && Number(e.charged.holdAt) > now) e.charged.holdAt = now;
      if (Number(e.nextAt) > now + maxStep) e.nextAt = now + RETRY_STEPS_MS[Math.min(Math.max(0, e.attempts.length - 1), RETRY_STEPS_MS.length - 1)];
      n++;
      log(`[deliver] ${cid}: ${e.id} was stamped ${Math.round(back / 60000)} min in the future — the clock went back; its first miss, hold and next attempt are re-based to now (the 60-min bound counts from here)`);
    }
    // THE FLOOR'S WITNESS TOO (verify r3, reproduced): `lastPostAt` is this process's memory of the last LANDED post; a
    // clock that stepped back after one left it in the future, `since` read negative, every attempt for the length of
    // the step hit the floor and rescheduled (120 times over an hour), and the entry expired without ever being posted.
    // A witness ahead of now is no witness: it is DROPPED (a floor re-based to now would hold the next frame 30 s for a
    // post that, by this clock, never happened — the "held instead of woken" shape the lane exists to end) and said once
    // …ONCE AN HOUR (verify r4, reproduced: a clock that KEEPS stepping back — two time daemons fighting — found every
    // witness in the future, dropped it at every attempt and posted seven frames in the same millisecond, seven billed
    // wakes with no floor between them; the money was bounded only by the spend ceiling). The first drop stands; a
    // second future witness within the hour of it is RE-BASED to now instead (one floor held — the lesser harm while
    // the clock misbehaves), said once an hour
    for (const [cid, at] of lastPostAt) {
      if (!(at > now)) continue;
      const prevDrop = floorDrops.get(cid) || 0;
      if (prevDrop && now - prevDrop < FLOOR_DROP_WINDOW_MS) {
        lastPostAt.set(cid, now); n++;
        const saidAt = floorRebaseSaidAt.get(cid) || 0;
        if (!(saidAt && now - saidAt < FLOOR_DROP_WINDOW_MS)) { floorRebaseSaidAt.set(cid, now); log(`[deliver] ${cid}: the last landed post was stamped in the future again within the hour — the clock keeps going back; the witness is re-based to now (one floor held, not dropped) and this is said once an hour`); }
        continue;
      }
      floorDrops.set(cid, now); lastPostAt.delete(cid); n++;
      log(`[deliver] ${cid}: the last landed post was stamped ${Math.round((at - now) / 60000)} min in the future — the clock went back; the witness is dropped (no floor)`);
    }
    if (n) writeRetryNow();
    return n;
  }
  /** schedule the one park timer at the earliest due attempt or hold release */
  function scheduleRetry() {
    if (parkTimer) { clock.clearTimeout(parkTimer); parkTimer = null; }
    if (retryClosed) return;
    repairClock();
    let due = Infinity;
    for (const q of Object.values(retry)) for (const e of q) {
      if (!e || e.inflight) continue;   // an in-flight entry arms nothing (its hold is the post's; a due hold on it re-armed the timer at 0 ms)
      if (holdDueAt(e) < due) due = holdDueAt(e);
      if (!e.ho && Number(e.nextAt) < due) due = Number(e.nextAt);
    }
    if (!Number.isFinite(due)) return;
    parkTimer = clock.setTimeout(() => { parkTimer = null; runDueRetries().catch((e) => log('[deliver] retry sweep failed:', e && e.message)); }, Math.max(0, due - clock.now()));
  }
  async function runDueRetries() {
    repairClock();
    const now = clock.now();
    let changed = false;
    for (const q of Object.values(retry)) for (const e of q) if (e && !e.inflight && holdDueAt(e) <= now) { releaseHoldOf(e); changed = true; }   // never an in-flight entry's (verify r1): the post's own outcome converts or keeps it within seconds
    if (changed) writeRetryNow();
    const due = [];
    for (const [cid, q] of Object.entries(retry)) if (q.some((e) => e && !e.inflight && !e.ho && Number(e.nextAt) <= now)) due.push(cid);
    for (const cid of due) await runAttempt(cid, 'timer');   // one frame per conversation: a due entry carries the not-yet-due ones along
    // THE BELT (verify r1): an entry still due after its conversation's pass was not moved by anything above — it is
    // paced to the first step, never left to re-arm the timer at 0 ms (a hot loop is the one failure a park must not have)
    let belted = 0;
    for (const cid of due) for (const e of (retry[cid] || [])) if (e && !e.inflight && !e.ho && Number(e.nextAt) <= clock.now()) { e.nextAt = clock.now() + RETRY_STEPS_MS[0]; belted++; }
    if (belted) { writeRetryNow(); log(`[deliver] ${belted} parked entr${belted === 1 ? 'y was' : 'ies were'} still due after the sweep — paced to ${RETRY_STEPS_MS[0] / 1000} s (a sweep that moves nothing must not re-arm at once)`); }
    scheduleRetry();
  }
  /** `opts` = the ladder call's own (the relay of its caller's fromName / cardText / group / retry) */
  function parkRetry(cid, text, opts, { kind, spendReason, charged, attempt }) {
    const now = clock.now();
    const e = { id: `rt-${now.toString(36)}-${++retrySeq}`, cid, text, fromName: opts.fromName || null, cardText: opts.cardText || null, kind, ...(opts.group ? { group: opts.group } : {}), spendReason, producer: (opts.retry && opts.retry.producer) || null, meta: (opts.retry && opts.retry.meta) || null,
      charged: charged ? { reason: charged.reason, identity: charged.identity ? { key: charged.identity.key, name: charged.identity.name || charged.identity.key } : null, hold: charged.hold || null, holdAt: now } : null,
      firstAt: now, attempts: [attempt], nextAt: now + RETRY_STEPS_MS[0], retries: 0 };
    retryQueue(cid).push(e);
    writeRetryNow();
    scheduleRetry();
    stashChanged(cid);
    emitRetry('parked', cid, e, { nextAt: e.nextAt, phase: attempt.phase, busy: attempt.busy, late: attempt.late || 0 });
    // the cap counts the entries WAITING (not in flight, not claimed) and the oldest of them falls — said by name with its
    // age. An entry in flight or claimed is spoken for and lands or returns within seconds; counting it made a thirty-first
    // park, arriving while thirty were on the wire, the only waiting entry — evicted at once and called "the oldest",
    // though the frame landed a second later and it would have ridden the next one (verify r2, reproduced)
    // …nor one marked may-have-landed at boot (verify r3): it is leaving at the first sweep, and evicting it here would
    // call a possible repeat "the oldest waiting" and stash it without the may-have-landed word
    const waiting = () => (retry[cid] || []).filter((x) => x && !x.inflight && !x.ho && !x.maybeDelivered);
    while (waiting().length > RETRY_CAP) {
      const victim = waiting()[0];
      log(`[deliver] ${cid}: the retry park holds ${RETRY_CAP} waiting per conversation — ${victim.id} (the oldest waiting, parked ${Math.round((now - Number(victim.firstAt || now)) / 1000)} s ago${(retry[cid] || []).length - waiting().length ? `; ${(retry[cid] || []).length - waiting().length} more on the wire, claimed or leaving`: ''}) falls to the stash, evicted`);
      fellRetry(victim, 'not-reachable', `the retry park holds ${RETRY_CAP} per conversation — the oldest falls to the stash`, { evicted: true });
    }
    return e;
  }
  function fellRetry(e, kind, reason, detail = {}) {
    releaseHoldOf(e);
    removeRetry(e);
    writeRetryNow();
    const extra = { kind, reason, attempts: e.attempts.length, phase: (e.attempts[e.attempts.length - 1] || {}).phase || null, busy: (e.attempts[e.attempts.length - 1] || {}).busy ?? null, ...detail };
    log(`[deliver] ${e.cid}: ${e.id} falls to the stash after ${e.attempts.length} attempt${e.attempts.length === 1 ? '' : 's'} — ${kind}: ${reason}`);
    const taken = emitRetry('fell', e.cid, e, extra);
    if (!taken) { try { stashFor(e.cid, { source: 'agent', kind: e.kind, fromName: e.fromName || null, text: e.text, ts: e.firstAt, held: { kind, ...detail } }); } catch (err) { log('[deliver] the fallen entry could not be stashed:', err && err.message); } }
    stashChanged(e.cid);
  }
  /** THE FRAME of a batch: one entry goes out as its own original text (the SAME delivery); several go out as ONE
   *  frame in the hand-over's shape, bounded like a hand-over (`rest` stays parked for the next frame). */
  // THE OLDEST RIDE FIRST (verify r2, reproduced: 16 notices parked over an hour, the agent busy throughout — the frame
  // kept the NEWEST twelve under its 12 KiB and left the four oldest parked; 30 s later the next frame found the oldest
  // past the 60-min bound and dropped it to the stash: the one that waited longest was the one that never rode a
  // retry, and the agent read the newer first). The batch is in time order and the cut keeps its head; the rest follow
  // in the next frame after the floor, still in time order — never split, never dropped by the frame itself.
  function retryFrameOf(batch) {
    if (batch.length === 1) return { text: batch[0].text, shown: batch, rest: [], body: null };
    const views = [...batch].sort((a, b) => (Number(a.firstAt) || 0) - (Number(b.firstAt) || 0)).map((e) => ({ source: 'agent', kind: e.kind, fromName: e.fromName || null, text: e.text, ts: e.firstAt, _retry: e }));
    let pm = null;
    if (typeof renderBatch === 'function') { try { pm = renderBatch(views, { maxEntries: RETRY_FRAME_MAX_ENTRIES, maxBytes: RETRY_FRAME_MAX_BYTES, keep: 'oldest', heading: RETRY_FRAME_HEADING }); } catch (err) { log('[deliver] batch render failed (joining plainly):', err && err.message); pm = null; } }
    if (!pm || !Array.isArray(pm.shown) || !pm.shown.length) {
      const shownV = views.slice(0, RETRY_FRAME_MAX_ENTRIES);
      pm = { text: shownV.map((v) => `- ${v.fromName || 'VibeSpace'}: ${withoutNoticeHead(v.text)}`).join('\n'), shown: shownV, rest: views.slice(shownV.length) };
    }
    const shown = pm.shown.map((v) => v._retry);
    const rest = (pm.rest || []).map((v) => v._retry);
    const body = String(pm.text || '');
    return { text: vibespaceNoticeText(`${shown.length} notice(s) VibeSpace could not deliver earlier (the agent did not accept them at once):\n\n${body}`), shown, rest, body };
  }
  /** ONE attempt for a conversation: every parked entry of it (unclaimed, not in flight) in ONE frame. The pid first
   *  (gone ⇒ not-running at once), the floor, the money (an entry's held authorization still inside its TTL, else ONE
   *  fresh verdict for the frame — a refusal falls the frame's entries as a first attempt's would), then the post. */
  async function attemptRetry(cid, why) {
    if (retryClosed) return;   // shutting down: no new post leaves (the ones in flight are waited for)
    for (const e of (retry[cid] || []).filter((x) => x && x.maybeDelivered && !x.inflight && !x.ho)) fellRetry(e, 'not-reachable', 'it was being posted when the previous server stopped — its frame may have landed, so it is not posted again', { maybeDelivered: true });
    // THE BOUND HOLDS AT EVERY ATTEMPT (verify r1 N5, reproduced: an entry two hours old at boot — a downtime — was posted and
    // billed): a parked entry past RETRY_MAX_MS from its first miss is not posted, at a boot, a late timer or a turn end
    repairClock();   // a future stamp never holds the bound off (verify r2)
    for (const e of (retry[cid] || []).filter((x) => x && !x.inflight && !x.ho && clock.now() - Number(x.firstAt || 0) > RETRY_MAX_MS)) fellRetry(e, 'not-reachable', `the retry schedule's ${RETRY_MAX_MS / 60000} min bound passed ${Math.round((clock.now() - Number(e.firstAt || 0)) / 60000)} min after the first miss (${e.attempts.length} attempt${e.attempts.length === 1 ? '' : 's'})`, { expired: true });
    // the second judge: the attempts themselves (a turn end attempts regardless of the backoff; a clock that lies cannot run them for ever)
    for (const e of (retry[cid] || []).filter((x) => x && !x.inflight && !x.ho && x.attempts.length >= RETRY_MAX_ATTEMPTS)) fellRetry(e, 'not-reachable', `the agent did not accept the message in ${e.attempts.length} attempts (the schedule's ${RETRY_MAX_ATTEMPTS}-attempt bound) over ${Math.round((clock.now() - Number(e.firstAt || 0)) / 60000)} min`, { expired: true });
    const all = (retry[cid] || []).filter((e) => e && !e.inflight && !e.ho);
    if (!all.length) return;
    const now = clock.now();
    const peer = peerMsg.findPeer(cid);
    if (!peer) { for (const e of all) fellRetry(e, 'not-running', 'the conversation is no longer running (no live inbox on this machine)'); return; }
    const since = now - (lastPostAt.get(cid) || 0);
    if (since < RETRY_FLOOR_MS) { rescheduleMany(all, (lastPostAt.get(cid) || now) + RETRY_FLOOR_MS, 'floor'); return; }
    const frame = retryFrameOf(all);
    const shown = frame.shown;
    // ONE authorization for ONE frame: an entry's hold still inside its TTL, else asked ONCE for the frame (a restart
    // dropped the holds, or the TTL passed) — judged against the ceiling as it stands now
    let charged = null;
    for (const e of shown) if (e.charged && e.charged.hold && now - (e.charged.holdAt || 0) <= RESERVE_TTL_MS) { charged = e.charged; break; }
    if (authorizeSpend && !charged) {
      const session = localSessionFor(cid);
      const prev = shown.find((e) => e.charged && e.charged.identity);
      const identity = session ? null : (prev && prev.charged.identity) || { key: '__unattributed__', name: 'unattributed conversation' };
      const spendReason = shown[0].spendReason;
      let v = null;
      try { v = authorizeSpend({ reason: spendReason, session, identity, cid }); }
      catch (err) { log('[deliver] spend authorizer threw at a retry (refusing, the stash keeps the message):', err.message); for (const e of shown) fellRetry(e, 'spend-cap', 'spend authorizer failed: ' + err.message); return; }   // FAIL CLOSED
      if (v && v.ok === false) {
        const cap = v.why === 'hour-cap' ? v.limits?.perIdentityHour : v.why === 'day-cap' ? v.limits?.perIdentityDay : v.why === 'instance-cap' ? v.limits?.perInstanceDay : null;
        for (const e of shown) fellRetry(e, 'spend-cap', `spend budget: ${v.detail || v.why}`, { why: v.why, identity: v.identity ? String(v.identity.name || v.identity.key) : undefined, cap: Number.isFinite(Number(cap)) ? Number(cap) : undefined, retryAfter: Number(v.retryAfter) > 0 ? Number(v.retryAfter) : undefined });
        return;
      }
      charged = { reason: spendReason, identity: (v && v.identity) ? { key: v.identity.key, name: v.identity.name || v.identity.key } : identity, hold: (v && v.hold) || null, holdAt: now };
      shown[0].charged = charged;   // ONE entry carries the frame's fresh verdict (the others keep their own, released on landing)
    }
    for (const e of shown) e.inflight = now;
    writeRetryNow();   // the claim door: a process that dies inside the post leaves the stamp, the next boot says so
    const busy = busyOf(cid);
    const undo = armTurnFor(cid);
    let r;
    try { r = await peerMsg.postToPeer(peer, frame.text); } catch (err) { r = { ok: false, reason: err.message, transient: false }; }
    for (const e of shown) delete e.inflight;
    if (r && r.ok) {
      lastPostAt.set(cid, clock.now());
      machineTurnFor(cid);
      if (charged && noteSpend) { try { noteSpend({ reason: charged.reason, session: localSessionFor(cid), identity: charged.identity, hold: charged.hold }); } catch (err) { log('[deliver] spend accounting failed:', err.message); } }
      for (const e of shown) { if (e.charged && e.charged !== charged) releaseHoldOf(e); e.charged = null; e.retries = e.attempts.length; removeRetry(e); }
      writeRetryNow();
      // THE CARD DRAWS THE WORDS AS THEY STAND, `recorded` IS THE FRAME AS WRITTEN (verify r2, reproduced: a clear that landed
      // while the post was on the wire left the single card's `recorded` = the cleared sentence — the rebuild then rendered
      // the transcript's record AND replayed the card, two cards — and the batch card's body, rendered before the post,
      // still showed the cleared words). A cleared entry's card says the sentence; the frame's own text is what dedups
      const clearedMid = shown.filter((e) => e.clearedInFlight);
      if (shown.length === 1) { try { emitPeerCard?.(cid, { fromName: shown[0].fromName || null, text: shown[0].cardText || shown[0].text, recorded: frame.text, kind: shown[0].kind, ...(shown[0].group ? { group: shown[0].group } : {}) }); } catch (err) { log('[deliver] card emit failed:', err.message); } }
      else {
        let body = frame.body;
        if (clearedMid.length) { try { body = retryFrameOf(shown).body; } catch { body = null; } }   // the same set, re-rendered from the words as they stand now
        try { emitPeerCard?.(cid, { fromName: FROM_NAME, text: stashSummary.handoverCardText(shown.length, body, { why: stashSummary.HELD_WHY.retrying }), recorded: frame.text, kind: 'notification' }); } catch (err) { log('[deliver] card emit failed:', err.message); }
      }
      if (clearedMid.length) log(`[deliver] ${cid}: ${clearedMid.map((e) => e.id).join(', ')} landed after a clear reached ${clearedMid.length === 1 ? 'it' : 'them'} mid-flight — the frame carried the words before the clear; the card draws the cleared sentence`);
      const ids = shown.map((e) => e.id).join(', ');
      log(`[deliver] ${cid}: ${ids} delivered on retry (${why}, ${shown.length === 1 ? `attempt ${shown[0].attempts.length + 1}` : `${shown.length} notices in ONE frame`}, phase ${r.phase || '?'}, ${Number(r.elapsedMs) || 0} ms, target mid-turn: ${busy === null ? 'unknown' : busy ? 'yes' : 'no'}${frame.rest.length ? `; ${frame.rest.length} more stay parked for the next frame` : ''})`);
      const at = clock.now();
      for (const e of shown) emitRetry('delivered', cid, e, { lane: 'message', peerName: peer.name || null, attempts: e.attempts.length + 1, why, deliveredAt: at, parkedFor: at - e.firstAt, via: 'message', ...(shown.length > 1 ? { frame: shown.length } : {}) });
      stashChanged(cid);
      scheduleRetry();
      return;
    }
    undo();
    for (const e of shown) delete e.clearedInFlight;   // the frame did not land: the words before the clear reached nobody — the retry carries the sentence
    const attempt = { at: now, reason: (r && r.reason) || 'unknown', phase: (r && r.phase) || null, busy, late: Number(r && r.late) || 0, why };
    for (const e of shown) e.attempts.push({ ...attempt });
    log(`[deliver] ${cid}: ${shown.map((e) => e.id).join(', ')} retry (${why}${shown.length > 1 ? `, ${shown.length} in one frame` : ''}) failed: ${attempt.reason} (phase ${attempt.phase || '?'}, ${Number(r && r.elapsedMs) || 0} ms${attempt.late ? `, our loop was ${attempt.late} ms late` : ''}, target mid-turn: ${busy === null ? 'unknown' : busy ? 'yes' : 'no'})`);
    if (!(r && r.transient) || !peerMsg.findPeer(cid)) { for (const e of shown) fellRetry(e, 'not-running', attempt.reason); return; }
    // the bound is on the SCHEDULE: an entry whose next attempt would fall past RETRY_MAX_MS from its first miss is not
    // retried; the frame's survivors share ONE next instant (the most eager step among them — a failed frame costs nothing)
    let step = Infinity;
    const keep = [...frame.rest];   // the entries beyond the frame's bound wait with the frame: a failed frame moves EVERY entry, or the timer re-arms at 0 ms for ever (verify r1: reproduced as a hot loop)
    for (const e of shown) {
      const st = RETRY_STEPS_MS[Math.min(e.attempts.length - 1, RETRY_STEPS_MS.length - 1)];
      if (clock.now() + st - e.firstAt > RETRY_MAX_MS || e.attempts.length >= RETRY_MAX_ATTEMPTS) { fellRetry(e, 'not-reachable', `the agent did not accept the message in ${e.attempts.length} attempts over ${Math.round((clock.now() - e.firstAt) / 60000)} min${e.attempts.length >= RETRY_MAX_ATTEMPTS ? ` (the schedule's ${RETRY_MAX_ATTEMPTS}-attempt bound)` : ''}`, { expired: true }); continue; }
      step = Math.min(step, st); keep.push(e);
    }
    if (keep.length) rescheduleMany(keep, clock.now() + step, why);
  }
  /** the survivors of one frame share one next instant: one write, one timer, one fact change, an `attempt` each */
  function rescheduleMany(entries, at, why) {
    for (const e of entries) e.nextAt = at;
    writeRetryNow();
    scheduleRetry();
    if (entries.length) stashChanged(entries[0].cid);
    for (const e of entries) emitRetry('attempt', e.cid, e, { why, nextAt: at, attempts: e.attempts.length });
  }
  // SHUTDOWN (verify r1 N2): the door shuts, then the posts in flight are waited for (bounded) — the hand-over's shape
  // ONE ATTEMPT IN FLIGHT PER CONVERSATION (verify r3, reproduced): the floor is read off the last LANDED post, so a
  // turn end arriving while a frame was still on the wire posted a second frame 5 ms behind it — two billed wakes
  // inside the 30 s the floor exists to keep apart. A second attempt for the same conversation waits for the one in
  // flight, then re-asks the floor (the landed frame re-stamped it: the newcomer rides 30 s later, in its own frame)
  const attempting = new Map();   // cid → the attempt promise in flight
  async function runAttempt(cid, why) {
    while (attempting.has(cid)) { try { await attempting.get(cid); } catch { } }
    const p = attemptRetry(cid, why);
    attempting.set(cid, p);
    retryInFlight.add(p);
    try { await p; } finally { retryInFlight.delete(p); if (attempting.get(cid) === p) attempting.delete(cid); }
  }
  function closeRetries() { retryClosed = true; if (parkTimer) { clock.clearTimeout(parkTimer); parkTimer = null; } }
  function retryInFlightCount() { return retryInFlight.size; }
  /** resolves the number settled (negative: the deadline passed with that many still in flight — stamped on disk, the boot hands them to the stash) */
  function settleRetries(maxMs = 5000) {
    const ps = [...retryInFlight];
    if (!ps.length) return Promise.resolve(0);
    return Promise.race([Promise.allSettled(ps).then(() => ps.length), new Promise((res) => { const t = setTimeout(() => res(-ps.length), maxMs); if (t.unref) t.unref(); })]);
  }
  /** A TURN ENDED on a live local session (server.js wraps the pool engine's noteTurnEnd): every parked delivery of
   *  that conversation is attempted now, then the registered turn-end listeners (the stash hand-over's auto arm). */
  async function noteTurnEnd(session) {
    let cid = null;
    try { cid = session ? addressableId(session) : null; } catch { cid = null; }
    if (!cid) return;
    // the listeners FIRST (R3: an armed hand-over carries the parked entries too — ONE frame, ONE authorization; it
    // claims and takes them), then whatever is still parked is posted by itself
    for (const fn of turnEndListeners) { try { await fn(cid, session); } catch (e) { log('[deliver] a turn-end listener threw:', e && e.message); } }
    await runAttempt(cid, 'turn-end');   // ONE frame for everything still parked
    scheduleRetry();
  }
  /** the hand-over / a drain took these parked entries (`retryEntries` views or their originals): their holds go
   *  back, they leave the park, the producer hears `delivered` with `via` */
  function retryTake(cid, entries, { via = 'hand-over', lane = null } = {}) {
    const mine = [];
    for (const x of (entries instanceof Set ? [...entries] : Array.isArray(entries) ? entries : [])) { const e = x && x._retry ? x._retry : x; if (e && !e.inflight && retry[cid] && retry[cid].includes(e)) mine.push(e); }   // never one in flight (verify r1)
    if (!mine.length) return [];
    for (const e of mine) { releaseHoldOf(e); delete e.ho; removeRetry(e); }
    writeRetryNow();
    for (const e of mine) emitRetry('delivered', cid, e, { lane, attempts: e.attempts.length, via, deliveredAt: clock.now(), parkedFor: clock.now() - e.firstAt });
    stashChanged(cid);
    scheduleRetry();
    return mine;
  }
  /** a hand-over CLAIMS parked entries like stash entries (the `ho` stamp on disk): the park skips them until released */
  function claimRetry(cid, entries, id = null) {
    const tag = id ? String(id) : 'ho';
    const mine = [];
    for (const x of (Array.isArray(entries) ? entries : [])) { const e = x && x._retry ? x._retry : x; if (e && !e.inflight && retry[cid] && retry[cid].includes(e)) { e.ho = tag; mine.push(e); } }   // never one in flight (verify r1)
    if (mine.length) writeRetryNow();
    let released = false;
    return () => { if (released) return; released = true; let n = 0; for (const e of mine) if (e.ho === tag) { delete e.ho; n++; } if (n) { writeRetryNow(); scheduleRetry(); } };
  }
  scheduleRetry();
  // THE ARMED HAND-OVER (R3): a prompt's injection could not carry the waiting notices under the inline cap (the
  // 10 KiB hook payload holds the tools / rules first) — for a LIVE local conversation the drain arms a hand-over
  // that the turn end runs through the ladder (src/server/stash-handover.js, spendReason 'stash-retry'), instead of
  // "wait for the next prompt", which for a conversation nobody types into is never. In memory: a restart loses an
  // arm, and the next prompt's drain re-arms it.
  const armedHandover = new Map();   // cid → {at, why}
  function armStashHandover(cid, why = 'inline-cap') {
    if (!cid || !turnEndListeners.size) return false;
    let peer = null;
    try { peer = peerMsg.findPeer(cid); } catch { peer = null; }
    if (!peer) return false;
    armedHandover.set(cid, { at: clock.now(), why });
    stashChanged(cid);
    return true;
  }
  function handoverArmed(cid) { return armedHandover.has(cid); }
  function takeArmedHandover(cid) { const a = armedHandover.get(cid) || null; if (a) { armedHandover.delete(cid); stashChanged(cid); } return a; }
  /** ms since the last SUCCESSFUL post to this conversation on any live rung (Infinity: none this process) */
  function sincePost(cid) { const at = lastPostAt.get(cid); return at ? clock.now() - at : Infinity; }

  // rung 1.5 helper: a LIVE local chat session whose backend declares the
  // 'rpc-queue' peer-delivery lane AND whose wrapper adverts caps.peerMessage
  // in its own sidecar (capability law: gate on what the process wrote, never
  // on version guesses; negative verdicts are never cached — this is a fresh
  // stateless read per attempt).
  function findRpcPeer(cid) {
    if (!activeSessions) return null;
    try {
      for (const [wid, s] of activeSessions) {
        if (addressableId(s) !== cid) continue;   // verify r6: a pending fork (its parent's id) is never the wrapper this frame is written into
        if (s.mode !== 'chat' || !s.pty || s.host) continue;
        if (capsOf(s.backend).peerDelivery !== 'rpc-queue') continue;
        const wc = wrapperCaps(path.join(dataDir, 'session-buffers'), wid, s.socketPath);
        if (!wc.peerMessage) continue;
        return { wid, s, wc };
      }
    } catch { }
    return null;
  }

  // rung 2 helper: which registered machine owns this conversation? null =
  // local/unknown (the local rung already ran by the time this is asked).
  function ownerHostOf(cid) {
    try {
      const hosts = getHosts?.();
      const idx = getConvIndex?.();
      if (!hosts || !idx) return null;
      const hid = idx.ownerHost(cid, (id) => { try { return !!hosts.get(id); } catch { return false; } });
      return hid && hid !== 'local' ? hid : null;
    } catch { return null; }
  }

  // ── EVERY frame we wrote on the rpc rung, awaiting the wrapper's verdict ───
  // Keyed by conversation id. An entry carries `withheld` = the charge this
  // ladder did NOT make because it predicted the frame would be steered into a
  // turn already running (null when the frame was charged on the spot).
  //
  // EVERY frame is tracked, not only the predicted-free ones (r2 round 2): the
  // wrapper answers in the order we wrote, so a queue holding only SOME of the
  // frames puts an earlier message's answer against a later message's entry —
  // a charged peer message written first would consume the notification's
  // entry and charge it, and the notification's own answer would then find an
  // empty queue.
  const unsettled = new Map();   // cid -> [{withheld, at}]
  /** Give a withheld frame's authorization hold back to the guard (r5). A
   *  stranded frame gets it too: the wrapper died holding our money open, and
   *  the guard's own TTL would give it back anyway — this just does it the
   *  moment we KNOW, instead of leaving it to a timeout. */
  function giveBack(entry) {
    const rec = entry && entry.withheld;
    if (!rec || !rec.hold || !releaseSpend) return;
    try { releaseSpend(rec); } catch (e) { log('[deliver] releasing the spend hold failed:', e.message); }
  }
  function noteFrameWritten(cid, withheld) {
    if (!cid) return;
    const now = Date.now();
    const q = (unsettled.get(cid) || []).filter((e) => now - e.at < SETTLE_TTL_MS);
    q.push({ withheld: withheld || null, at: now });
    unsettled.set(cid, q);
    if (unsettled.size > 200) {           // bounded: a wrapper that never answers must not grow this
      for (const [k, v] of unsettled) if (!v.some((e) => now - e.at < SETTLE_TTL_MS)) unsettled.delete(k);
    }
  }
  /** THE WRAPPER'S OWN VERDICT settles one written frame.
   *  `mode` is what data/bin/codex-chat-wrapper.js reports on
   *  `peer_message_result`: 'steered' (folded into the running turn — free, so
   *  the withheld charge is dropped) vs 'queued'/'turn' (its own billed turn,
   *  so a withheld charge is made NOW).
   *
   *  A MODE-LESS ANSWER IS NOT AN ANSWER ABOUT OUR FRAME (r2 round 2,
   *  reproduced). The wrapper has six `peer_message_result` emitters and the
   *  split is exact: the three `ok:true` ones carry `mode`, and all three
   *  `ok:false` ones carry `text` and no mode — and TWO of those three are
   *  about a DIFFERENT, earlier message (a queued peer item dropped by Stop or
   *  removed from the queue, handed back to the ladder to re-stash). Consuming
   *  on them shifted the wrong entry: a Stop landing between our write and the
   *  wrapper's reply made a real `thread/queue/add` — a billed turn — free.
   *  So a mode-less result settles nothing ('not-ours'); the third one (the
   *  wrapper's own delivery failure) then strands its frame, which is charged
   *  nothing and expires at SETTLE_TTL_MS. The census of those six emitters is
   *  an assert in scripts/test-spend-paths.mjs — the rule is the producer's,
   *  not an assumption about it.
   *
   *  Called from src/server/stdout/codex-events.js, which already consumes this
   *  record — PROPERTY ACCESS on the lazy ref, never a call (the mk() Proxy
   *  lesson). Unknown cid = no-op. */
  function settleRpcDelivery(cid, { ok = true, mode = null, now = Date.now() } = {}) {
    if (!mode) return 'not-ours';
    const q = unsettled.get(cid);
    if (!q || !q.length) return null;
    // a STRANDED frame (older than one wrapper round-trip by a wide margin) may
    // not absorb this answer — drop it and keep looking
    let e = null;
    while (q.length) { const c = q.shift(); if (now - c.at < SETTLE_TTL_MS) { e = c; break; } giveBack(c); }
    if (!q.length) unsettled.delete(cid);
    if (!e) return null;
    if (!e.withheld) return 'already-charged';
    if (ok !== false && mode !== 'steered' && noteSpend) {
      // it did NOT steer: the notification became its own turn after all
      try { noteSpend(e.withheld); } catch (err) { log('[deliver] spend accounting failed:', err.message); }
      return 'charged';
    }
    // NO TURN WAS OPENED — the wrapper confirmed the steer, or it never
    // delivered at all and the caller re-stashes. Either way the hold this
    // frame carried has to go back: it was authorized, and it did not spend.
    giveBack(e);
    return ok === false ? 'undelivered' : 'free';
  }

  /** The LIVE LOCAL session carrying this conversation, if any — the only
   *  thing on this machine that can name the credential slot a turn would
   *  bill. (findRpcPeer answers a narrower question: a codex session whose
   *  wrapper adverts the peer lane.) */
  function localSessionFor(cid) {
    if (!activeSessions) return null;
    try {
      for (const [, s] of activeSessions) if (addressableId(s) === cid) return s;   // verify r6: never a pending fork — the parent's turn was charged to the fork's slot when the fork came first
    } catch { }
    return null;
  }

  /** One delivery attempt down the ladder. Returns {ok, lane, kind, peerName?,
   *  hostId?, reason?} — the caller decides whether a miss stashes (jobs and
   *  agent-msg both do; a future fire-and-forget source may not).
   *  opts.fromName/opts.cardText label the CHAT CARD the server renders on a
   *  successful post (2.363.0): the CLI records server-posted injections with
   *  a body-less origin (unregistered poster), so the delivery site is the
   *  ONLY party that can render the message visibly in the live window.
   *  opts.kind TYPES THE ORIGIN (2026-09-07, owner: "系统通知默认应该是steering的"):
   *    'notification' — VibeSpace itself speaking: a Background Work event, a
   *                     system notice. Nobody is waiting for a reply, so on a
   *                     harness whose notification lane is 'steer'
   *                     (backend-caps notificationDelivery) it joins the
   *                     RUNNING turn instead of becoming its own billed one.
   *    'peer'         — a human/agent message from another session (default):
   *                     it is somebody's message, it gets its own turn.
   *  The ladder only TAGS the frame — the receiving wrapper owns the lane
   *  decision, because only it knows whether a turn is running right now. */
  async function deliverToConversation(cid, text, opts = {}) {
    // Unknown/absent origin = 'peer', the conservative lane (an older caller
    // never silently gains the steer behaviour).
    const kind = opts.kind === 'notification' ? 'notification' : 'peer';
    // VIBESPACE SPEAKS AS ITSELF (lane S3, naive-user study 2): the CLI frames
    // every server post as "Another Claude session sent a message", so a
    // notification that did not say who it was read as a peer — the assistant
    // answered the user's own browser handback with "I received a message from
    // another Claude session". Every kind:'notification' producer's words open
    // with the ONE head here, at the ONE site they all pass (the card strips it
    // again: src/notification-senders.js noticeBody). A peer's words are theirs.
    if (kind === 'notification') text = vibespaceNoticeText(text);
    // `noWake` (Channels P3, design §9.3): deliver ONLY where it costs
    // nothing — the rpc rung's predicted-free steer into a turn already
    // running — and otherwise refuse with `refused:'no-wake'` so the caller
    // stashes for the next turn. It changes the FALLBACK, not the accounting:
    // the authorization below is still taken with a hold, because "this
    // frame joins the running turn" is a prediction the wrapper's own verdict
    // settles (settleRpcDelivery) — a wrong prediction becomes a real charge
    // through the same mechanism. claude's cli-inbox is deferred, not free,
    // so `noWake` never touches rungs 0/1/2.
    const noWake = opts.noWake === true;
    // THE CEILING (see the header). `spendReason` types the producer for the
    // budget's journal/inbox; jobs pass 'job-notification', agent messaging
    // 'peer-message'. An unknown/absent reason is 'peer-message', the same
    // conservative default the lane itself uses.
    const spendReason = opts.spendReason && typeof opts.spendReason === 'string' ? opts.spendReason : 'peer-message';
    let charged = null;
    if (authorizeSpend) {
      const session = localSessionFor(cid);
      // the owner-host lookup is only needed for the NAMED fallback bucket —
      // a live local session answers the question by itself
      const hid0 = session ? null : ownerHostOf(cid);
      const identity = session ? null : { key: hid0 ? 'host:' + hid0 : '__unattributed__', name: hid0 ? `conversation on ${hid0}` : 'unattributed conversation' };
      let v = null;
      try { v = authorizeSpend({ reason: spendReason, session, identity, cid }); }
      catch (e) { log('[deliver] spend authorizer threw (refusing, the stash keeps the message):', e.message); return { ok: false, reason: 'spend authorizer failed: ' + e.message, refused: 'spend' }; } // FAIL CLOSED (P8)
      // a spend refusal is TYPED for the stash (5b ①): the caller's held
      // entry names the slot and the ceiling it hit, so the panel can say why
      if (v && v.ok === false) {
        const cap = v.why === 'hour-cap' ? v.limits?.perIdentityHour : v.why === 'day-cap' ? v.limits?.perIdentityDay : v.why === 'instance-cap' ? v.limits?.perInstanceDay : null;
        return { ok: false, reason: `spend budget: ${v.detail || v.why}`, refused: 'spend', why: v.why, retryAfter: v.retryAfter || 0, identity: v.identity ? { key: v.identity.key, name: v.identity.name || v.identity.key } : null, cap: Number.isFinite(Number(cap)) ? Number(cap) : null };
      }
      // CHARGE WHAT YOU AUTHORIZED (r4, reproduced). `identity` is null on the
      // local-session branch, and handing that null to the charge made
      // `spend-guard.note()` run `identityOf(session)` A SECOND TIME, at charge
      // time — the one question this design exists to have exactly one answer
      // to, asked twice, with a re-point allowed in between. The rpc rung makes
      // the gap wide on purpose: the charge is DEFERRED to settleRpcDelivery,
      // up to SETTLE_TTL_MS (120 s) later, and a codex session's slot follows
      // the pool DEFAULT (the per-session pass skips codex), which the engine
      // re-decides on its 30 s timer. MEASURED with the real guard + real
      // ladder, cap 1/hour, identityOf flipping A→B across that window: three
      // deliveries authorized on A (which was debited 0, so its ceiling never
      // bound) and debited to B, which was never asked and now refuses its own
      // legitimate unattended turns. The PURE verdict already carries the slot
      // it measured — throwing it away was the whole defect.
      charged = { reason: spendReason, session, identity: (v && v.identity) || identity, hold: (v && v.hold) || null };
    }
    // ONE RELEASE POINT (r5, reproduced). `authorize()` HOLDS the slot it
    // authorized, and the hold binds like a charge until somebody says what
    // happened — which is what stops five deliveries dispatched in one pass
    // from all reading the same pre-charge counts (measured: 5 delivered
    // against a cap of 2, sequentially 1). Every exit that neither charged the
    // frame nor handed it to the settle queue must give the hold back, and the
    // ladder has NINE such exits plus two throwing catches: enumerating them is
    // the fragility this `finally` removes. `money.settled` is set by the two
    // sites that DID take responsibility for it — `spent()` and the predicted-
    // free rpc branch.
    const money = { settled: !charged };
    try {
      // CHARGED WHERE THE FRAME LEAVES US. For rungs 0/1/2 that is the delivery;
      // for the rpc-queue rung the wrapper may still answer `ok:false` and the
      // caller re-stashes, so that one over-charges by one turn in the failure
      // case. Deliberate: the conservative direction for money is to assume the
      // turn happened.
      //
      // THE ONE EXCEPTION IS A DELIVERY THAT OPENS NO TURN (r2, reproduced).
      // `notificationDelivery(caps) === 'steer'` + a turn already running means
      // the wrapper folds this notification INTO that turn — it carries only
      // itself, the queue is untouched, and no second turn is billed. Charging it
      // spends the ceiling on nothing: 12 mid-turn Background Work notifications
      // exhaust one subscription's hour and the NEXT auto-resume continue — which
      // does cost money — is refused with 'hour-cap'. Everything else still
      // charges: claude's cli-inbox QUEUES a mid-turn delivery and then runs it as
      // its own billed turn (deferred, not free — src/peer-messaging.js states the
      // CLI's semantics), and a codex `peer` frame is `thread/queue/add`, which is
      // likewise its own turn afterwards. The exception is a fact about the LANE,
      // read off the caps row, never a backend id.
      // THE TURN THIS OPENS IS NOBODY'S TYPING (design-communication-panel
      // §22 D2): stamped on the live local session at every rung that hands it
      // the frame, so prompt-context can tell the next UserPromptSubmit is a
      // machine turn — its next-turn group reports ride it under the echo guard's
      // words (lane stash-any-turn: they no longer wait for the owner's own).
      const machineTurn = () => { try { const s = localSessionFor(cid); if (s) s._machineInputAt = Date.now(); } catch { } };
      // THE STAMP PRECEDES THE FRAME (lane group-report-card — reproduced on a real page: the CLI takes the inbox
      // frame and starts the turn, and that turn's UserPromptSubmit hook asks prompt-context, while `postToPeer` is
      // still waiting out its 150 ms before it resolves — the stamp `spent()` makes after the post came too late, the
      // machine turn read as the user's and was handed the next-turn group report, the woken message included). Every
      // rung that posts to a live session stamps BEFORE the post; a post that did not land gives the stamp back (only
      // if nothing stamped since), so a failed wake never holds the reports of the user's own next turn.
      const armTurn = () => {
        try {
          const s = localSessionFor(cid);
          if (!s) return () => { };
          const prev = s._machineInputAt;
          s._machineInputAt = Date.now();
          const at = s._machineInputAt;
          return () => { if (s._machineInputAt === at) s._machineInputAt = prev; };
        } catch { return () => { }; }
      };
      const spent = () => { machineTurn(); lastPostAt.set(cid, clock.now()); if (!charged) return; money.settled = true; if (noteSpend) { try { noteSpend(charged); } catch (e) { log('[deliver] spend accounting failed:', e.message); } } };
      // `kind` rides the card (S3 verify F3): a peer's card is never a VibeSpace notice, whatever its name or first sentence.
      // verify r6 (S2): `recorded` = the exact text the CLI's transcript now holds for this delivery — a first-attach rebuild
      // renders THAT record and skips the held card (normalizers.replayCard), never both; the card's own text may be a summary
      // `group` (lane group-report-card): a group WAKE's card names the sender → the group (src/group-card.js; the card door keys it)
      const cardOk = () => { try { emitPeerCard?.(cid, { fromName: opts.fromName || null, text: opts.cardText || text, recorded: text, kind, ...(opts.channel ? { channel: opts.channel } : {}), ...(opts.group ? { group: opts.group } : {}) }); } catch (e) { log('[deliver] card emit failed:', e.message); } };   // `channel` (B-c127): a channel notice's conversation — its name is the card's link
      // rung 1: this machine's CLI inbox registry
      let undo1 = null;
      try {
        const peer = noWake ? null : peerMsg.findPeer(cid);
        if (peer) {
          undo1 = armTurn();
          const busy = busyOf(cid);
          const r = await peerMsg.postToPeer(peer, text);
          if (r.ok) { spent(); cardOk(); return { ok: true, lane: 'message', kind, peerName: peer.name || null }; }
          undo1();
          const where = `phase ${r.phase || '?'}, ${Number(r.elapsedMs) || 0} ms${Number(r.late) > 0 ? `, our loop was ${Number(r.late)} ms late` : ''}, target mid-turn: ${busy === null ? 'unknown' : busy ? 'yes' : 'no'}`;
          // THE RETRY PARK (see the header): a TRANSIENT miss while the pid still lives is parked for the caller
          // that opted in (`opts.retry`), never stashed — the park now owns the authorization hold
          if (r.transient === true && opts.retry && typeof opts.retry === 'object' && peerMsg.findPeer(cid)) {
            const e = parkRetry(cid, text, opts, { kind, spendReason, charged, attempt: { at: clock.now(), reason: r.reason, phase: r.phase || null, busy, late: Number(r.late) || 0, why: 'first' } });
            money.settled = true;
            log(`[deliver] local peer post to ${peer.socketPath} failed: ${r.reason} (${where}) — parked for retry at ${new Date(e.nextAt).toISOString()} (${e.id}; the next turn end posts it sooner)`);
            return { ok: false, lane: 'message', reason: r.reason, parked: true, id: e.id, retryAt: e.nextAt, phase: r.phase || null, busy, late: Number(r.late) || 0 };
          }
          log(`[deliver] local peer post to ${peer.socketPath} failed: ${r.reason} (${where})${r.transient ? '' : ' — the socket is not served: the conversation is not running'}`);
          return { ok: false, lane: 'message', reason: r.reason, phase: r.phase || null, busy, ...(r.transient ? {} : { notRunning: true }) };
        }
      } catch (e) { if (undo1) undo1(); return { ok: false, reason: e.message }; }
      // rung 1.5: backend-declared RPC lane (REGISTRY-gated: capsOf(backend)
      // .peerDelivery === 'rpc-queue', never a backend-id branch — a third
      // backend claims this lane by declaring the cap + serving the contract).
      // The wrapper owns the app-server connection: idle ⇒ it starts a billed
      // turn (claude-inbox parity), busy ⇒ thread/queue/add runs it after the
      // current turn. The frame carries fromName + cardText (P1, design-
      // harness-plugins §1): the WRAPPER records the user message with a
      // `webui_peer` marker built from them and the codex normalizer renders
      // THAT record as the labelled peer card — live (buffer) and on rebuild
      // (rollout twin, marker-blind dedup). Deliberately NO cardOk() here,
      // unlike the other lanes: ① the record already renders, so an in-memory
      // card on top would double-render live; ② a stdin write succeeding is not
      // a delivery — the wrapper may still report ok:false, which re-stashes
      // and re-renders at drain, so a card emitted now would be a phantom.
      const rpc = findRpcPeer(cid);
      if (rpc) {
        // The PREDICTION (see `spent`): this frame joins the turn already running
        // and opens none. It is only a prediction — the turn can end between this
        // check and the wrapper's RPC, and a review/compact turn is not steerable
        // — so the wrapper's own `peer_message_result{mode}` SETTLES it: a steer
        // that fell back to 'queued'/'turn' is charged then (settleRpcDelivery).
        const steerLane = kind === 'notification'
          && notificationDelivery(capsOf(rpc.s.backend)) === 'steer'
          && !!rpc.s._isStreaming;
        // THE OLD-WRAPPER SKEW (B-d963, the owner saw two queued). The lane
        // above is the HARNESS's; THIS process may predate it — a wrapper
        // spawned before the verb table (its sidecar names no `queueVerbs`)
        // answers a notification frame with thread/queue/add, a BILLED turn
        // after the running one. Its own advert is read BEFORE the write
        // (wrapperCaps, never a version number) and the miss is TYPED so the
        // caller stashes: the notification then rides the next prompt and the
        // drain site renders its chat card. Only while a turn runs — an idle
        // old wrapper opens a turn exactly as a new one does. The hold goes
        // back in `finally` (no frame, no turn).
        if (steerLane && !rpc.wc.notificationSteer) {
          return { ok: false, lane: 'rpc-queue', kind, refused: 'wrapper-no-steer', reason: "this session's agent predates notification steering — delivering now would queue a billed turn after the running one; held for the conversation's next prompt (restart the session to receive notifications mid-turn)" };
        }
        const steersIntoRunningTurn = steerLane;
        // no free lane right now ⇒ noWake refuses here rather than opening a
        // turn (the frame is not written; the hold goes back in `finally`)
        if (noWake && !steersIntoRunningTurn) return { ok: false, lane: 'rpc-queue', reason: 'no turn is running to join — a delivery now would open a billed turn', refused: 'no-wake' };
        try {
          rpc.s.pty.write(JSON.stringify({ type: 'peer-message', text, fromName: opts.fromName || null, cardText: opts.cardText || null, kind, ...(opts.channel ? { channel: opts.channel } : {}), ...(opts.group ? { group: opts.group } : {}) }) + '\n');   // `group`: the wrapper's marker carries it (lane group-report-card) — an older wrapper ignores it and draws the fromName card
          // EVERY frame joins the settle queue, charged or not — the wrapper
          // answers in write order, so a queue holding only the predicted-free
          // ones would hand this frame's answer to the next frame's entry.
          // the settle queue now owns this hold: it is charged when the wrapper
          // says the frame opened a turn after all, and released when it confirms
          // the steer — so the money is NOT settled here, it is handed on
          if (steersIntoRunningTurn) { machineTurn(); money.settled = true; noteFrameWritten(cid, charged); }
          else { spent(); noteFrameWritten(cid, null); }
          return { ok: true, lane: 'rpc-queue', kind, steered: steersIntoRunningTurn, peerName: rpc.s.name || null };
        } catch (e) { log('[deliver] rpc-queue write failed (falling through): ' + e.message); }
      }
      // rung 2: the owning machine's daemon posts to ITS local registry
      if (noWake) return { ok: false, reason: 'no free lane for this conversation — a delivery now would open a billed turn', refused: 'no-wake' };
      const hid = ownerHostOf(cid);
      let undo2 = null;
      if (hid) {
        try {
          const hosts = getHosts?.();
          // BOUNDED connect (review-caught): plain device() rides the full
          // ~2.7min retry ladder on a down host — a send request must fall to
          // the stash rung honestly instead (the background connect still heals).
          const dm = await (hosts.deviceBounded ? hosts.deviceBounded(hid, 6000) : hosts.device(hid));
          undo2 = armTurn();
          const r = await dm.peerPost({ cid, text });
          if (r && r.ok) { spent(); cardOk(); return { ok: true, lane: 'remote-message', kind, peerName: r.peerName || null, hostId: hid }; }
          undo2();
          return { ok: false, lane: 'remote-message', hostId: hid, reason: (r && r.reason) || 'remote daemon could not reach the inbox' };
        } catch (e) {
          if (undo2) undo2();
          // capability gate / daemon down — an honest miss, the stash covers it
          return { ok: false, lane: 'remote-message', hostId: hid, reason: e.message };
        }
      }
      return { ok: false, reason: 'no live inbox for this conversation on any reachable machine', notRunning: true };   // typed: the conversation is not running (lane notify-retry — `not-reachable` is reserved for an agent that did not accept)
    } finally {
      // …AND THIS IS THE ONLY PLACE IT IS GIVEN BACK. `money.settled` is raised
      // by the two sites that took responsibility for the hold — `spent()` (it
      // became a turn) and the predicted-free rpc branch (the settle queue owns
      // it now). Everything else — the local peer post that failed, the remote
      // daemon that could not reach the inbox, the "no live inbox anywhere"
      // stash, and both throwing catches — authorized a turn that never
      // happened, and a hold nobody gives back refuses real turns for its whole
      // TTL. Enumerating those exits is the fragility this `finally` removes.
      // It stays INSIDE deliverToConversation on purpose: the rungs must sit in
      // the same function as the gate, which is what test-spend-paths' §2
      // per-site census measures (a helper the gate merely calls is exactly the
      // shape it exists to catch).
      if (!money.settled && charged && charged.hold && releaseSpend) {
        try { releaseSpend(charged); } catch (e) { log('[deliver] releasing the spend hold failed:', e.message); }
      }
    }
  }

  function peerReachable(cid) {
    try { if (peerMsg.findPeer(cid)) return true; } catch { }
    if (findRpcPeer(cid)) return true;
    return !!ownerHostOf(cid); // a remote owner MAY be reachable — optimistic preview, the ladder decides for real
  }

  return {
    deliverToConversation, peerReachable, stashFor, drainStash, stashCount, stashPeek, stashHealth, onStash,   // stashPeek: COPIES (the engine's boot reconcile); stashHealth: is the file current (withdraw r5); onStash: the ref'd entries' events (stashed / drained / evicted / unwritten)
    stashEntries, claimStash, claimedCount, restoreStash, registerFrameRestorer, restoreFrame, releasedAtBoot, flush, capUnclaimed, redactStash, registerRedactor, registerStashJudge,   // stashEntries: the SAME objects; claimStash / claimedCount: the hand-over's claim (a full drain leaves a claimed entry in place; the `ho` stamp is on disk); restoreStash / restoreFrame: a frame that came back is its original entries
    registerStashGate,   // verify r3 (lane channel-threads): a producer re-asks, at every read, whether an entry's `about` still reaches its conversation
    settleRpcDelivery,   // the wrapper's own peer_message_result settles a predicted-free steer
    onRetry, onTurnEnd, noteTurnEnd, retryPeek, retryEntries, retryTake, claimRetry, retryCount, RETRY_STEPS_MS, RETRY_MAX_MS, RETRY_MAX_ATTEMPTS, RETRY_FLOOR_MS, RETRY_CAP, closeRetries, settleRetries, retryInFlightCount, armStashHandover, handoverArmed, takeArmedHandover, sincePost,   // R3: the hand-over a turn end runs for what the prompt could not carry   // THE RETRY PARK (lane notify-retry): a transient local miss on a live pid, retried at the turn end + on the backoff, ONE authorization
    _unsettledCount: (cid) => (unsettled.get(cid) || []).length,
    // exposed for the stash-drain sites: a drained message enters the agent's
    // context invisibly — the drain site emits the same card the live lanes do
    emitPeerCard: (cid, card) => { try { emitPeerCard?.(cid, card); } catch { } },
  };
}

module.exports = { create };
